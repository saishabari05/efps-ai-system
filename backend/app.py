import os

from flask import Flask, request, jsonify
from flask_mail import Mail
from flask_cors import CORS
from dotenv import load_dotenv
from database.db import students_collection, teachers_collection
from routes.admin_routes import admin_bp
from routes.teachers_routes import teacher_bp
import joblib   
from werkzeug.security import check_password_hash, generate_password_hash

from auth_utils import generate_auth_token
import smtplib
from email.mime.text import MIMEText

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
app = Flask(__name__)
CORS(app)





app.config['MAIL_SERVER'] = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
app.config['MAIL_PORT'] = int(os.getenv('MAIL_PORT', '587'))
app.config['MAIL_USE_TLS'] = os.getenv('MAIL_USE_TLS', 'true').lower() == 'true'
app.config['MAIL_USERNAME'] = os.getenv('MAIL_USERNAME', '')
app.config['MAIL_PASSWORD'] = os.getenv('MAIL_PASSWORD', '')

mail = Mail(app)

model = joblib.load("ml/risk_model.pkl")
ALLOWED_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
CORS(app, resources={r"/*": {"origins": [origin.strip() for origin in ALLOWED_ORIGINS.split(",") if origin.strip()]}})
app.register_blueprint(admin_bp, url_prefix="/admin")
app.register_blueprint(teacher_bp, url_prefix="/teacher")

# ---------------- STRICT ADMIN CREDENTIAL ----------------
ADMIN_EMAIL = (os.getenv("ADMIN_EMAIL") or "").strip().lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")


def mask_email(email):
    if not email or "@" not in email:
        return ""

    username, domain = email.split("@", 1)
    if len(username) <= 2:
        masked_username = username[0] + "*" * max(len(username) - 1, 0)
    else:
        masked_username = username[:2] + "*" * (len(username) - 2)

    return f"{masked_username}@{domain}"


def to_number(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if number != number:
        return None

    return number


def is_present(record):
    present = record.get("present")
    if isinstance(present, bool):
        return present
    if isinstance(present, str):
        return present.strip().lower() in {"present", "true", "p"}
    return False


def build_subject_summaries(student):
    subject_map = {}

    for mark in student.get("marks", []):
        subject_name = (mark.get("subject") or mark.get("subjectName") or "").strip()
        score = to_number(mark.get("score"))
        if not subject_name or score is None:
            continue

        normalized_score = max(0, min(100, score))
        bucket = subject_map.setdefault(subject_name, {"total": 0, "count": 0})
        bucket["total"] += normalized_score
        bucket["count"] += 1

    return [
        {
            "name": subject_name,
            "average": round(values["total"] / values["count"], 1)
        }
        for subject_name, values in sorted(subject_map.items())
        if values["count"] > 0
    ]


def calculate_attendance(student):
    direct_attendance = None
    for field_name in ("attendancePercentage", "attendance", "att"):
        direct_attendance = to_number(student.get(field_name))
        if direct_attendance is not None:
            break

    if direct_attendance is not None:
        return round(max(0, min(100, direct_attendance)), 1)

    attendance_records = student.get("attendanceRecords", [])
    if not attendance_records:
        return None

    present_count = sum(1 for record in attendance_records if is_present(record))
    return round((present_count / len(attendance_records)) * 100, 1)


def calculate_cgpa(student, subject_summaries):
    direct_cgpa = None
    for field_name in ("cgpa", "CGPA", "gpa"):
        direct_cgpa = to_number(student.get(field_name))
        if direct_cgpa is not None:
            break

    if direct_cgpa is not None:
        return round(max(0, min(10, direct_cgpa)), 2)

    if not subject_summaries:
        return None

    average_score = sum(subject["average"] for subject in subject_summaries) / len(subject_summaries)
    return round(max(0, min(10, average_score / 10)), 2)


def build_alerts(attendance, subject_summaries):
    alerts = []

    if attendance is not None and attendance < 80:
        alerts.append(f"Attendance is {attendance:.1f}%, below the 80% threshold.")

    for subject in subject_summaries:
        if subject["average"] < 70:
            alerts.append(f"{subject['name']} average is {subject['average']:.1f}%, which needs improvement.")

    return alerts


def build_recommendations(attendance, subject_summaries):
    recommendations = []

    if attendance is not None and attendance < 80:
        recommendations.append("Increase attendance to stay above the 80% requirement.")

    for subject in subject_summaries:
        if subject["average"] < 70:
            recommendations.append(f"Spend extra study time on {subject['name']} to improve the current average.")

    return recommendations


def build_risk_profile(attendance, cgpa, subject_summaries):
    reasons = []

    low_subjects = [subject for subject in subject_summaries if subject["average"] < 70]

    if attendance is not None and attendance < 65:
        reasons.append("Attendance is critically low and may impact exam eligibility.")
    elif attendance is not None and attendance < 80:
        reasons.append("Attendance is below the recommended 80% threshold.")

    if cgpa is not None and cgpa < 6.5:
        reasons.append("Current CGPA is below the target benchmark.")

    if low_subjects:
        subject_names = ", ".join(subject["name"] for subject in low_subjects[:3])
        reasons.append(f"Lower scores detected in: {subject_names}.")

    if attendance is not None and attendance < 65:
        risk = "High"
    elif low_subjects or (cgpa is not None and cgpa < 6.5):
        risk = "Medium"
    else:
        risk = "Low"

    return risk, reasons

@app.route("/")
def home():
    return "Backend Running Successfully!"


@app.route("/debug/admin-status", methods=["GET"])
def debug_admin_status():
    return jsonify({
        "adminEmailConfigured": bool(ADMIN_EMAIL),
        "adminEmailPreview": mask_email(ADMIN_EMAIL),
        "adminPasswordConfigured": bool(ADMIN_PASSWORD),
        "corsOrigins": [origin.strip() for origin in ALLOWED_ORIGINS.split(",") if origin.strip()]
    }), 200


@app.route("/student/dashboard/<student_identifier>", methods=["GET"])
def get_student_dashboard(student_identifier):
    student = students_collection.find_one(
        {
            "$or": [
                {"studentId": student_identifier},
                {"email": student_identifier.strip().lower()}
            ]
        },
        {"password": 0}
    )

    if not student:
        return jsonify({"error": "Student not found"}), 404

    subject_summaries = build_subject_summaries(student)
    attendance = calculate_attendance(student)
    cgpa = calculate_cgpa(student, subject_summaries)
    risk, reasons = build_risk_profile(attendance, cgpa, subject_summaries)

    return jsonify({
        "fullName": student.get("fullName") or "Student",
        "studentId": student.get("studentId") or student.get("email") or "",
        "email": student.get("email") or "",
        "semester": student.get("semester") or "N/A",
        "section": student.get("section") or "N/A",
        "attendance": attendance,
        "cgpa": cgpa,
        "subjects": subject_summaries,
        "alerts": build_alerts(attendance, subject_summaries),
        "recommendations": build_recommendations(attendance, subject_summaries),
        "risk": risk,
        "reasons": reasons
    }), 200


# ---------------- REGISTER ----------------
@app.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password")

    existing_user = students_collection.find_one({
        "email": email
    })

    if existing_user:
        return jsonify({"error": "Email already registered"}), 400

    if not password or len(str(password)) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400

    students_collection.insert_one({
        "fullName": data.get("fullName"),
        "studentId": data.get("studentId"),
        "semester": data.get("semester"),
        "section": data.get("section"),
        "email": email,
        "password": generate_password_hash(password),
        "role": "student"   # Important
    })

    return jsonify({"message": "Registration successful"}), 201


# ---------------- LOGIN ----------------
@app.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    # -------- ADMIN LOGIN --------
    if ADMIN_EMAIL and ADMIN_PASSWORD and email == ADMIN_EMAIL and password == ADMIN_PASSWORD:
        token = generate_auth_token({"role": "admin", "email": email})
        return jsonify({
            "role": "admin",
            "fullName": "System Administrator",
            "token": token
        }), 200

    # -------- STUDENT LOGIN --------
    student = students_collection.find_one({"email": email})
    if student:
        stored_password = student.get("password") or ""
        is_valid_password = check_password_hash(stored_password, password) if stored_password.startswith("pbkdf2:") or stored_password.startswith("scrypt:") else stored_password == password

        if not is_valid_password:
            return jsonify({"error": "Incorrect password"}), 401

        token = generate_auth_token({
            "role": student.get("role", "student"),
            "studentId": student.get("studentId"),
            "email": student.get("email")
        })

        return jsonify({
            "role": student.get("role", "student"),
            "fullName": student.get("fullName"),
            "studentId": student.get("studentId"),
            "email": student.get("email"),
            "semester": student.get("semester"),
            "section": student.get("section"),
            "token": token
        }), 200

    # -------- TEACHER LOGIN --------
    teacher = teachers_collection.find_one({"email": email})
    if teacher:
        teacher_password = teacher.get("password") or ""
        is_valid_teacher_password = check_password_hash(teacher_password, password) if teacher_password.startswith("pbkdf2:") or teacher_password.startswith("scrypt:") else teacher_password == password

        if not is_valid_teacher_password:
            return jsonify({"error": "Incorrect password"}), 401

        token = generate_auth_token({
            "role": teacher.get("role", "teacher"),
            "teacherId": str(teacher.get("_id")),
            "email": teacher.get("email")
        })

        return jsonify({
            "role": teacher.get("role", "teacher"),
            "teacherId": str(teacher.get("_id")),
            "fullName": teacher.get("name"),
            "email": teacher.get("email"),
            "dept": teacher.get("dept"),
            "token": token
        }), 200

    return jsonify({"error": "User not found"}), 404
def predict_risk(attendance, internal_avg, assignment):

    prediction = model.predict([[attendance, internal_avg, assignment]])

    levels = ["Low", "Medium", "High"]

    return levels[prediction[0]]



import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 10000))
    app.run(host="0.0.0.0", port=port)
    