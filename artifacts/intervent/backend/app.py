from flask import Flask, request, jsonify
from flask_cors import CORS
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000"])

# Initialize Firebase Admin SDK
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

service_account_path = os.path.join(
    BASE_DIR,
    os.getenv("FIREBASE_SERVICE_ACCOUNT", "serviceAccountKey.json")
)

cred = credentials.Certificate(service_account_path)
firebase_admin.initialize_app(cred)


def verify_token(id_token):
    """Verify Firebase ID token and return decoded token or None."""
    try:
        return firebase_auth.verify_id_token(id_token)
    except Exception:
        return None


def get_token_from_header():
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "InterVent API"})


@app.route("/api/auth/register", methods=["POST"])
def register():
    """
    Called after Firebase creates the user account.
    Saves extra profile data (role, phone, company, etc.).
    Expects: { idToken, role, fullName, phoneNumber, companyName?, department? }
    """
    data = request.get_json()
    id_token = data.get("idToken")

    if not id_token:
        return jsonify({"error": "Missing ID token"}), 401

    decoded = verify_token(id_token)
    if not decoded:
        return jsonify({"error": "Invalid or expired token"}), 401

    uid = decoded["uid"]
    role = data.get("role")
    full_name = data.get("fullName")
    phone = data.get("phoneNumber")
    company = data.get("companyName", "")
    department = data.get("department", "")

    # Update Firebase Auth display name
    firebase_auth.update_user(uid, display_name=full_name, phone_number=None)

    # Set custom claims for role-based access
    firebase_auth.set_custom_user_claims(uid, {"role": role})

    return jsonify({
        "success": True,
        "uid": uid,
        "role": role,
        "message": f"Profile created for {full_name}"
    })


@app.route("/api/auth/me", methods=["GET"])
def me():
    """Returns the current user's profile from the token."""
    id_token = get_token_from_header()
    if not id_token:
        return jsonify({"error": "Missing token"}), 401

    decoded = verify_token(id_token)
    if not decoded:
        return jsonify({"error": "Invalid or expired token"}), 401

    return jsonify({
        "uid": decoded.get("uid"),
        "email": decoded.get("email"),
        "role": decoded.get("role"),
        "name": decoded.get("name"),
    })


if __name__ == "__main__":
    port = int(os.getenv("BACKEND_PORT", 5001))
    print(f"InterVent backend running on http://localhost:{port}")
    app.run(debug=True, port=port)
