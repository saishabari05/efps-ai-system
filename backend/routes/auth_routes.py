from flask import Blueprint, request, jsonify

auth_bp = Blueprint("auth", __name__)

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json()

    print("Register Route Hit")
    print("Data received:", data)

    return jsonify({
        "message": "Registration successful"
    }), 201


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json()

    print("Login Route Hit")
    print("Login data:", data)

    return jsonify({
        "message": "Login successful"
    }), 200
