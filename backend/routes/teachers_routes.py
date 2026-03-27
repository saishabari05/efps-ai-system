import os
import smtplib
import re
from datetime import datetime, timezone
from email.message import EmailMessage

from flask import Blueprint, request, jsonify
from bson import ObjectId
from pymongo import ReturnDocument
from database.db import teachers_collection, students_collection
from auth_utils import role_required

teacher_bp = Blueprint("teacher", __name__)


def normalize_semester(value):
    text = str(value or "").strip().lower()
    if not text:
        return ""

    digit_match = re.search(r"\d+", text)
    if digit_match:
        return digit_match.group(0)

    return text


def normalize_section(value):
    text = str(value or "").strip().lower()
    if not text:
        return ""

    normalized = re.sub(r"\s+", "", text)
    normalized = re.sub(r"^(section|sec)\.?", "", normalized)
    return normalized


def student_matches_subject(student, subject):
    subject_semester = normalize_semester(subject.get("semester"))
    subject_section = normalize_section(subject.get("section"))
    student_semester = normalize_semester(student.get("semester"))
    student_section = normalize_section(student.get("section"))

    semester_matches = not subject_semester or student_semester == subject_semester
    section_matches = not subject_section or student_section == subject_section
    return semester_matches and section_matches


def get_students_for_subjects(subjects):
    all_students = list(students_collection.find({}, {"password": 0}))
    matched_students = []
    seen_ids = set()

    for subject in subjects:
        for student in all_students:
            if not student_matches_subject(student, subject):
                continue

            student_id = str(student.get("_id"))
            if student_id in seen_ids:
                continue

            student["_id"] = student_id
            matched_students.append(student)
            seen_ids.add(student_id)

    return matched_students


def to_subject_key(subject_name):
    """Sanitize subject name to be used safely as a mongo field key."""
    return (subject_name or "").strip().replace(".", "_").replace("$", "_").lower()


def is_present_status(present):
    if isinstance(present, bool):
        return present
    if isinstance(present, str):
        return present.strip().lower() in {"present", "true", "p"}
    return False


def calculate_subject_attendance(attendance_records, subject_name):
    subject = (subject_name or "").strip().lower()
    records = [
        record for record in (attendance_records or [])
        if (record.get("subject") or "").strip().lower() == subject
    ]

    if not records:
        return None, 0

    present_count = sum(1 for record in records if is_present_status(record.get("present")))
    percentage = round((present_count / len(records)) * 100, 1)
    return percentage, len(records)


def send_attendance_shortage_email(student_email, student_name, subject_name, attendance_pct, threshold):
    """Send shortage alert email. Returns (sent: bool, reason: str)."""
    smtp_host = (os.getenv("SMTP_HOST") or "").strip()
    try:
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
    except (TypeError, ValueError):
        smtp_port = 587
    smtp_user = (os.getenv("SMTP_USER") or "").strip()
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = (os.getenv("SMTP_FROM_EMAIL") or smtp_user).strip()
    smtp_use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() == "true"

    if not all([smtp_host, smtp_port, smtp_from]):
        return False, "SMTP not configured"

    if not student_email:
        return False, "Student email missing"

    message = EmailMessage()
    message["Subject"] = f"Attendance Alert: {subject_name}"
    message["From"] = smtp_from
    message["To"] = student_email
    message.set_content(
        (
            f"Hello {student_name or 'Student'},\n\n"
            f"Your attendance in {subject_name} is currently {attendance_pct}%. "
            f"This is below the required threshold of {threshold}%.\n\n"
            "Please attend upcoming classes regularly to avoid eligibility issues.\n\n"
            "Regards,\n"
            "EFPS Academic Monitoring Team"
        )
    )

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
            if smtp_use_tls:
                server.starttls()
            if smtp_user and smtp_password:
                server.login(smtp_user, smtp_password)
            server.send_message(message)
        return True, "sent"
    except Exception as exc:
        return False, str(exc)

@teacher_bp.route("/profile/<teacher_id>", methods=["GET"])
@role_required("teacher", "admin")
def get_teacher_profile(teacher_id):
    try:
        teacher = teachers_collection.find_one(
            {"_id": ObjectId(teacher_id)},
            {"password": 0}
        )

        if not teacher:
            return jsonify({"error": "Teacher not found"}), 404

        teacher["_id"] = str(teacher["_id"])

        return jsonify(teacher), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@teacher_bp.route("/students/<teacher_id>", methods=["GET"])
@role_required("teacher", "admin")
def get_students_for_teacher(teacher_id):
    try:
        teacher = teachers_collection.find_one({"_id": ObjectId(teacher_id)})

        if not teacher:
            return jsonify({"error": "Teacher not found"}), 404

        subjects = teacher.get("subjects", [])

        students_list = get_students_for_subjects(subjects)

        return jsonify(students_list), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@teacher_bp.route("/attendance", methods=["POST"])
@role_required("teacher", "admin")
def mark_attendance():
    try:
        data = request.get_json() or {}

        student_id = data.get("studentId")
        subject = (data.get("subjectName") or "").strip()
        date = data.get("date")
        present = data.get("present")

        if not all([student_id, subject, date]):
            return jsonify({"error": "Missing fields"}), 400

        updated_student = students_collection.find_one_and_update(
            {"studentId": student_id},
            {
                "$push": {
                    "attendanceRecords": {
                        "subject": subject,
                        "date": date,
                        "present": present
                    }
                }
            },
            return_document=ReturnDocument.AFTER
        )

        if not updated_student:
            return jsonify({"error": "Student not found"}), 404

        try:
            threshold = float(os.getenv("ATTENDANCE_SHORTAGE_THRESHOLD", "75"))
        except (TypeError, ValueError):
            threshold = 75.0
        subject_attendance, subject_classes = calculate_subject_attendance(
            updated_student.get("attendanceRecords", []), subject
        )

        notification_status = "not_applicable"
        notification_reason = ""

        if subject_attendance is not None and subject_classes > 0:
            subject_key = to_subject_key(subject)
            notifications = updated_student.get("attendanceShortageNotifications", {})
            prior_state = notifications.get(subject_key, {})
            was_notified = bool(prior_state.get("notified"))

            if subject_attendance < threshold and not was_notified:
                sent, reason = send_attendance_shortage_email(
                    updated_student.get("email"),
                    updated_student.get("fullName"),
                    subject,
                    subject_attendance,
                    threshold,
                )

                if sent:
                    notification_status = "sent"
                    notification_reason = "Attendance shortage email sent"
                    students_collection.update_one(
                        {"_id": updated_student["_id"]},
                        {
                            "$set": {
                                f"attendanceShortageNotifications.{subject_key}": {
                                    "notified": True,
                                    "lastNotifiedAt": datetime.now(timezone.utc).isoformat(),
                                    "attendance": subject_attendance,
                                    "threshold": threshold,
                                    "subject": subject,
                                }
                            }
                        }
                    )
                else:
                    notification_status = "failed"
                    notification_reason = reason
            elif subject_attendance >= threshold and was_notified:
                students_collection.update_one(
                    {"_id": updated_student["_id"]},
                    {
                        "$set": {
                            f"attendanceShortageNotifications.{subject_key}": {
                                "notified": False,
                                "lastResetAt": datetime.now(timezone.utc).isoformat(),
                                "attendance": subject_attendance,
                                "threshold": threshold,
                                "subject": subject,
                            }
                        }
                    }
                )
                notification_status = "reset"
                notification_reason = "Shortage recovered; notification state reset"
            elif subject_attendance < threshold and was_notified:
                notification_status = "skipped"
                notification_reason = "Already notified for current shortage"
            else:
                notification_status = "not_needed"
                notification_reason = "Attendance is within threshold"

        return jsonify({
            "message": "Attendance recorded successfully",
            "subjectAttendance": subject_attendance,
            "subjectClasses": subject_classes,
            "threshold": threshold,
            "notificationStatus": notification_status,
            "notificationReason": notification_reason,
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@teacher_bp.route("/marks", methods=["POST"])
@role_required("teacher", "admin")
def enter_marks():
    try:
        data = request.get_json()

        student_id = data.get("studentId")
        subject = data.get("subjectName")
        score = data.get("score")

        if not all([student_id, subject, score]):
            return jsonify({"error": "Missing fields"}), 400

        students_collection.update_one(
            {"studentId": student_id},
            {
                "$push": {
                    "marks": {
                        "subject": subject,
                        "score": score
                    }
                }
            }
        )

        return jsonify({"message": "Marks added successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@teacher_bp.route("/risk/<teacher_id>", methods=["GET"])
@role_required("teacher", "admin")
def get_high_risk_students(teacher_id):
    try:
        teacher = teachers_collection.find_one({"_id": ObjectId(teacher_id)})

        if not teacher:
            return jsonify({"error": "Teacher not found"}), 404

        subjects = teacher.get("subjects", [])

        risk_students = []

        for student in get_students_for_subjects(subjects):
            attendance = student.get("attendancePercentage", 0)

            if attendance < 65:
                student["riskLevel"] = "High"
                risk_students.append(student)

        return jsonify(risk_students), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

def predict_risk(attendance, internal_avg, assignment):
    """Calculate risk level based on student performance metrics."""
    if attendance < 65 or internal_avg < 40 or assignment < 40:
        return "High"
    elif attendance < 75 or internal_avg < 50 or assignment < 50:
        return "Medium"
    else:
        return "Low"

@teacher_bp.route("/performance", methods=["POST"])
@role_required("teacher", "admin")
def save_marks():
    data = request.get_json() or {}

    student_id = data.get("studentId")
    subject_name = data.get("subjectName")

    if not student_id or not subject_name:
        return jsonify({"error": "studentId and subjectName are required"}), 400

    try:
        internal1 = float(data.get("internal1", 0))
        internal2 = float(data.get("internal2", 0))
        assignment = float(data.get("assignment", 0))
        internal_average = float(data.get("internalAverage", (internal1 + internal2) / 2))
        total_before_sem = float(data.get("totalBeforeSem", internal_average + assignment))
        semester_marks = data.get("semesterMarks")
        semester_marks = float(semester_marks) if semester_marks is not None else None
        eligible_for_sem = bool(data.get("eligibleForSem", False))
        risk_status = data.get("riskStatus") or predict_risk(float(data.get("attendance", 75)), internal_average, assignment)
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid numeric values in request"}), 400

    performance_record = {
        "subjectName": subject_name,
        "internal1": internal1,
        "internal2": internal2,
        "internalAverage": internal_average,
        "assignment": assignment,
        "totalBeforeSem": total_before_sem,
        "semesterMarks": semester_marks,
        "eligibleForSem": eligible_for_sem,
        "riskStatus": risk_status,
    }

    update_result = students_collection.update_one(
        {"studentId": student_id},
        {
            "$push": {"performanceRecords": performance_record},
            "$set": {"risk": risk_status}
        }
    )

    if update_result.matched_count == 0:
        return jsonify({"error": "Student not found"}), 404

    return jsonify({
        "message": "Saved successfully",
        "risk": risk_status,
        "performance": performance_record
    }), 200