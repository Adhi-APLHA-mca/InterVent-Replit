import firebase_admin
from firebase_admin import credentials, firestore
from datetime import datetime, timezone
import os


def get_or_init_firebase():
    """
    Initialize Firebase app with Firestore support.
    """
    app_name = "resume_agent_app"

    try:
        app = firebase_admin.get_app(app_name)
    except ValueError:
        service_account_path = os.getenv(
            "FIREBASE_SERVICE_ACCOUNT",
            "serviceAccountKey.json"
        )

        cred = credentials.Certificate(service_account_path)

        app = firebase_admin.initialize_app(
            cred,
            name=app_name,
        )

    return app


def get_firestore_client():
    app = get_or_init_firebase()
    return firestore.client(app=app)


def push_candidate_to_firebase(
    hr_uid: str,
    hr_name: str,
    job_id: str,
    candidate_id: str,
    name: str,
    email: str,
    phone: str,
    resume_text: str = "",
    skills: list = None,
    experience: float = 0.0,
    education: str = "",
    job_role: str = "",
    status: str = "Resume Uploaded",
    interview_time: str = "",
):
    """
    Store candidate metadata + resume content in Firestore.

    Collection structure:
        jobs/{job_id}/candidates/{candidate_id}
    """
    try:
        db = get_firestore_client()

        candidate_ref = (
            db.collection("jobs")
            .document(job_id)
            .collection("candidates")
            .document(candidate_id)
        )

        candidate_ref.set({
            "candidate_id": candidate_id,
            "name": name,
            "email": email.lower().strip() if email else "",
            "phone": phone,
            "resume_text": resume_text,
            "skills": skills or [],
            "experience": experience,
            "education": education,
            "job_role": job_role,
            "status": status,
            "interview_time": interview_time,
            "hr_uid": hr_uid,
            "hr_name": hr_name,
            "screening_result": None,
            "screening_reason": "",
            "email_sent": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        return True

    except Exception as e:
        print(f"[FIREBASE ERROR] push_candidate_to_firebase: {e}")
        return False


def push_job_meta_to_firebase(
    hr_uid: str,
    hr_name: str,
    job_id: str,
    job_title: str,
    job_description: str,
    total_candidates: int,
):
    """
    Store job metadata in Firestore.

    Path:
        jobs/{job_id}
    """
    try:
        db = get_firestore_client()

        job_ref = db.collection("jobs").document(job_id)

        job_ref.set({
            "job_id": job_id,
            "job_title": job_title,
            "job_description": job_description,
            "hr_uid": hr_uid,
            "hr_name": hr_name,
            "total_candidates": total_candidates,
            "status": "active",
            "screening_status": "pending",
            "total_shortlisted": 0,
            "total_rejected": 0,
            "emails_sent": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

        return True

    except Exception as e:
        print(f"[FIREBASE ERROR] push_job_meta_to_firebase: {e}")
        return False
