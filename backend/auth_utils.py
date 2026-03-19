import os
from functools import wraps
from typing import Any, Callable

from flask import jsonify, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer


def _get_secret_key() -> str:
    return os.getenv("AUTH_SECRET_KEY") or os.getenv("FLASK_SECRET_KEY") or "dev-only-change-me"


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(_get_secret_key(), salt="efps-auth")


def generate_auth_token(payload: dict[str, Any], expires_in: int = 60 * 60 * 12) -> str:
    token_payload = {**payload, "exp_seconds": expires_in}
    return _serializer().dumps(token_payload)


def verify_auth_token(token: str) -> dict[str, Any] | None:
    try:
        data = _serializer().loads(token, max_age=60 * 60 * 24)
        return data
    except (BadSignature, SignatureExpired):
        return None


def _extract_bearer_token() -> str | None:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    return auth_header.split(" ", 1)[1].strip() or None


def role_required(*allowed_roles: str) -> Callable:
    def decorator(fn: Callable) -> Callable:
        @wraps(fn)
        def wrapper(*args: Any, **kwargs: Any):
            token = _extract_bearer_token()
            if not token:
                return jsonify({"error": "Missing auth token"}), 401

            payload = verify_auth_token(token)
            if not payload:
                return jsonify({"error": "Invalid or expired auth token"}), 401

            role = payload.get("role")
            if role not in allowed_roles:
                return jsonify({"error": "Access denied"}), 403

            return fn(*args, **kwargs)

        return wrapper

    return decorator
