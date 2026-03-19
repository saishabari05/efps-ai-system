from flask import Blueprint, jsonify, request
from bson import ObjectId
from bson.errors import InvalidId
from database.db import students_collection, teachers_collection
from werkzeug.security import generate_password_hash

from auth_utils import role_required

admin_bp = Blueprint("admin", __name__)



@admin_bp.route("/students", methods=["GET"])
@role_required("admin")
def get_students():
    students = list(students_collection.find({}, {"password": 0}))
    for s in students:
        s["_id"] = str(s["_id"])   # VERY IMPORTANT
    return jsonify(students)

@admin_bp.route("/students/<id>", methods=["DELETE"])
@role_required("admin")
def delete_student(id):
    try:
        query = {"_id": ObjectId(id)}
    except InvalidId:
        query = {"studentId": id}
    try:
        result = students_collection.delete_one(query)

        if result.deleted_count == 0:
            return jsonify({"error": "Student not found"}), 404

        return jsonify({"message": "Student deleted successfully"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/teachers", methods=["GET"])
@role_required("admin")
def get_teachers():
    try:
        teachers = list(teachers_collection.find({}))
        result = []
        for t in teachers:
            result.append({
                "id": str(t["_id"]),
                "name": t.get("name"),
                "email": t.get("email"),
                "dept": t.get("dept")
            })
        return jsonify(result), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/teachers", methods=["POST"])
@role_required("admin")
def add_teacher():
    try:
        data = request.get_json() or {}
        name = (data.get("name") or "").strip()
        email = (data.get("email") or "").strip().lower()
        dept = (data.get("dept") or "").strip()
        password = (data.get("password") or "Teacher@123").strip()

        if not name or not email or not dept:
            return jsonify({"error": "name, email, and dept are required"}), 400

        existing = teachers_collection.find_one({"email": email})
        if existing:
            return jsonify({"error": "Teacher with this email already exists"}), 409

        inserted = teachers_collection.insert_one({
            "name": name,
            "email": email,
            "dept": dept,
            "password": generate_password_hash(password),
            "role": "teacher"
        })

        return jsonify({
            "id": str(inserted.inserted_id),
            "name": name,
            "email": email,
            "dept": dept
        }), 201
    except Exception as e:
        print(f"Error adding teacher: {str(e)}")
        return jsonify({"error": f"Server error: {str(e)}"}), 500


@admin_bp.route("/teachers/<id>", methods=["DELETE"])
@role_required("admin")
def delete_teacher(id):
    try:
        teacher_id = ObjectId(id)
    except InvalidId:
        return jsonify({"error": "Invalid teacher id"}), 400

    try:
        result = teachers_collection.delete_one({"_id": teacher_id})
        if result.deleted_count == 0:
            return jsonify({"error": "Teacher not found"}), 404
        return jsonify({"message": "Teacher deleted successfully"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@admin_bp.route("/assign-subject/<teacher_id>", methods=["PUT"])
@role_required("admin")
def assign_subject(teacher_id):
    try:
        teacher_obj_id = ObjectId(teacher_id)
    except InvalidId:
        return jsonify({"error": "Invalid teacher id format"}), 400

    try:
        data = request.get_json() or {}
        subject_name = (data.get("subjectName") or "").strip()
        semester = (data.get("semester") or "").strip()
        section = (data.get("section") or "").strip()

        if not subject_name or not semester or not section:
            return jsonify({"error": "subjectName, semester, and section are required"}), 400

        subject_obj = {
            "name": subject_name,
            "semester": semester,
            "section": section
        }

        result = teachers_collection.find_one_and_update(
            {"_id": teacher_obj_id},
            {
                "$push": {
                    "subjects": subject_obj
                }
            },
            return_document=True
        )

        if not result:
            return jsonify({"error": "Teacher not found"}), 404

        updated_teacher = {
            "id": str(result["_id"]),
            "name": result.get("name"),
            "email": result.get("email"),
            "dept": result.get("dept"),
            "subjects": result.get("subjects", [])
        }

        return jsonify({
            "message": "Subject assigned successfully",
            "teacher": updated_teacher
        }), 200

    except Exception as e:
        print(f"Error assigning subject: {str(e)}")
        return jsonify({"error": f"Server error: {str(e)}"}), 500