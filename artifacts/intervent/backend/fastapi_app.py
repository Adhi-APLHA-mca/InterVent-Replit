"""
InterVent Resume Processing Service — FastAPI
============================================
Runs on port 8000 (separate from Flask on 5001).

Endpoints:
  POST /api/resumes/upload        — Upload PDFs, parse, extract via Agent 1, store
  GET  /api/resumes/health        — Health check
  GET  /api/resumes/job/{job_id}  — List candidates for a job (PostgreSQL)
  POST /api/screening/run         — Agent 2: screen candidates (shortlist/reject)
  POST /api/emails/send           — Agent 3: email all screened candidates
"""

import os
import uuid
import shutil
import threading
from pathlib import Path
from typing import List

import pdfplumber
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import credentials, auth as firebase_auth, firestore as admin_firestore

from resume_agent.agent import extract_candidate_profile
from resume_agent.database import create_candidates_table, insert_candidate, get_candidates_by_job
from resume_agent.firebase_utils import push_candidate_to_firebase, push_job_meta_to_firebase, get_firestore_client
from resume_agent.screening_agent import run_screening_agent
from resume_agent.email_agent import run_email_agent
from resume_agent.assessment_agent import generate_assessment_questions, evaluate_assessment
from resume_agent.aptitude_agent import generate_aptitude_questions, evaluate_aptitude
from resume_agent.dsa_agent import generate_dsa_problems, strip_hidden_test_cases, evaluate_dsa_submission
from resume_agent.meet_agent import generate_meet_questions, evaluate_meet_interview, generate_next_question, get_brief_feedback

load_dotenv()

app = FastAPI(title="InterVent Resume Processor", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path(__file__).parent / "uploads" / "resumes"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def init_firebase_default():
    """Initialize default Firebase app for token verification."""
    try:
        firebase_admin.get_app()
        return  # already initialized
    except ValueError:
        pass

    import json
    cred = None
    sa_json = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if sa_json:
        try:
            sa_dict = json.loads(sa_json)
            cred = credentials.Certificate(sa_dict)
        except json.JSONDecodeError:
            print("[InterVent] FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON — falling back to serviceAccountKey.json")

    if cred is None:
        service_account_path = os.getenv(
            "FIREBASE_SERVICE_ACCOUNT", "serviceAccountKey.json"
        )
        if not os.path.exists(service_account_path):
            print(f"[InterVent] WARNING: Firebase credentials not found at '{service_account_path}'.")
            print("[InterVent] Set FIREBASE_SERVICE_ACCOUNT_JSON secret to enable Firebase auth.")
            return
        cred = credentials.Certificate(service_account_path)

    database_url = os.getenv("FIREBASE_DATABASE_URL", "").strip()
    opts = {"databaseURL": database_url} if database_url else {}
    firebase_admin.initialize_app(cred, opts)
    print("[InterVent] Firebase initialized successfully.")


@app.on_event("startup")
def on_startup():
    init_firebase_default()
    try:
        create_candidates_table()
    except Exception as e:
        print(f"[InterVent] WARNING: Could not create candidates table: {e}")
    print("[InterVent] FastAPI resume processor started on port 8000")


def verify_hr_token(id_token: str) -> dict:
    """Verify Firebase ID token and return decoded payload."""
    try:
        decoded = firebase_auth.verify_id_token(id_token)
        role = decoded.get("role", "")
        if role.lower() == "student":
            raise HTTPException(
                status_code=403,
                detail="Students are not allowed to access this endpoint."
            )
        return decoded
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired token: {e}"
        )


def parse_pdf_text(pdf_path: Path) -> str:
    """Extract all text from a PDF file using pdfplumber."""
    text_parts = []
    try:
        with pdfplumber.open(str(pdf_path)) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
    except Exception as e:
        print(f"[PDF ERROR] {pdf_path.name}: {e}")
    return "\n".join(text_parts).strip()


def generate_job_id(hr_uid: str) -> str:
    short_uid = hr_uid[:8].replace("-", "")
    random_part = uuid.uuid4().hex[:6]
    return f"job_{short_uid}_{random_part}"


def generate_candidate_id(job_id: str, index: int) -> str:
    return f"cand_{job_id}_{index + 1:03d}"


# ─── Background auto-agent pipeline ───────────────────────────────────────────

def _auto_screen_and_email(job_id: str) -> None:
    """
    Runs in a daemon thread immediately after upload:
      1. Agent 2 — Screen all candidates (LLM decides shortlisted / rejected)
      2. Agent 3 — Send emails if SMTP is configured in .env
    Firestore is updated in real-time so the frontend sees each stage.
    """
    try:
        print(f"[AUTO] Starting screening agent for {job_id}")
        run_screening_agent(job_id)
        print(f"[AUTO] Screening done for {job_id}")
    except Exception as e:
        print(f"[AUTO] Screening failed for {job_id}: {e}")
        return

    smtp_configured = bool(os.getenv("SMTP_USER") and os.getenv("SMTP_PASSWORD"))
    if not smtp_configured:
        print(f"[AUTO] SMTP not configured — skipping email agent for {job_id}")
        return

    try:
        print(f"[AUTO] Starting email agent for {job_id}")
        result = run_email_agent(job_id)
        print(f"[AUTO] Emails done for {job_id}: {result}")
    except Exception as e:
        print(f"[AUTO] Email agent failed for {job_id}: {e}")


def launch_auto_agents(job_id: str) -> None:
    """Fire-and-forget: starts the screening+email pipeline in a background thread."""
    t = threading.Thread(target=_auto_screen_and_email, args=(job_id,), daemon=True)
    t.start()


# ─── Health ────────────────────────────────────────────────────────────────────

@app.get("/api/resumes/health")
def health():
    return {"status": "ok", "service": "InterVent Resume Processor v2"}


# ─── Agent 1: Upload & Extract ─────────────────────────────────────────────────

@app.post("/api/resumes/upload")
async def upload_resumes(
    files: List[UploadFile] = File(default=[]),
    job_title: str = Form(...),
    job_description: str = Form(default=""),
    hr_token: str = Form(...),
    hr_name: str = Form(...),
    pooling_type: str = Form(default="private"),
    application_deadline: str = Form(default=""),
):
    """
    Upload multiple PDF resumes for a job.

    Flow:
      1. Verify HR Firebase token
      2. Generate unique job_id
      3. Save PDFs locally under uploads/resumes/{job_id}/
      4. Parse each PDF with pdfplumber
      5. Run Agent 1 (LangChain/Groq) to extract structured candidate data
      6. Store full profile in PostgreSQL
      7. Store candidate + job metadata in Firestore (including resume_text)
    """
    if pooling_type == "private" and not files:
        raise HTTPException(status_code=400, detail="No files uploaded. Private jobs require at least one resume.")
    if len(files) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 resumes per upload.")

    for f in files:
        if not f.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail=f"'{f.filename}' is not a PDF. Only PDF files are accepted.",
            )

    decoded_token = verify_hr_token(hr_token)
    hr_uid = decoded_token["uid"]

    job_id = generate_job_id(hr_uid)
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    results = []
    errors = []

    for index, upload_file in enumerate(files):
        pdf_path = job_dir / upload_file.filename
        try:
            with open(pdf_path, "wb") as buffer:
                shutil.copyfileobj(upload_file.file, buffer)
        except Exception as e:
            errors.append({"file": upload_file.filename, "error": f"Save failed: {e}"})
            continue

        resume_text = parse_pdf_text(pdf_path)
        if not resume_text:
            errors.append({"file": upload_file.filename, "error": "Could not extract text from PDF."})
            continue

        try:
            profile = extract_candidate_profile(resume_text)
        except Exception as e:
            errors.append({"file": upload_file.filename, "error": f"LLM extraction failed: {e}"})
            continue

        candidate_id = generate_candidate_id(job_id, index)

        pg_record = {
            "candidate_id": candidate_id,
            "job_id": job_id,
            "hr_uid": hr_uid,
            "hr_name": hr_name,
            "full_name": profile.get("full_name", "Unknown"),
            "email": profile.get("email", ""),
            "phone": profile.get("phone", ""),
            "skills": profile.get("skills", []),
            "experience": profile.get("experience", 0.0),
            "education": profile.get("education", ""),
            "resume_text": resume_text,
            "resume_path": str(pdf_path),
            "job_role": profile.get("job_role", "") or job_title,
            "status": "parsed",
        }

        pg_ok = insert_candidate(pg_record)

        fb_ok = push_candidate_to_firebase(
            hr_uid=hr_uid,
            hr_name=hr_name,
            job_id=job_id,
            candidate_id=candidate_id,
            name=profile.get("full_name", "Unknown"),
            email=profile.get("email", ""),
            phone=profile.get("phone", ""),
            resume_text=resume_text,
            skills=profile.get("skills", []),
            experience=profile.get("experience", 0.0),
            education=profile.get("education", ""),
            job_role=profile.get("job_role", "") or job_title,
            status="Resume Uploaded",
            interview_time="",
        )

        results.append({
            "candidate_id": candidate_id,
            "file": upload_file.filename,
            "full_name": profile.get("full_name"),
            "email": profile.get("email"),
            "phone": profile.get("phone"),
            "skills": profile.get("skills"),
            "experience": profile.get("experience"),
            "education": profile.get("education"),
            "job_role": profile.get("job_role") or job_title,
            "stored_postgres": pg_ok,
            "stored_firebase": fb_ok,
        })

    push_job_meta_to_firebase(
        hr_uid=hr_uid,
        hr_name=hr_name,
        job_id=job_id,
        job_title=job_title,
        job_description=job_description,
        total_candidates=len(results),
        pooling_type=pooling_type,
        application_deadline=application_deadline,
    )

    # Auto-launch Agent 2 (screening) + Agent 3 (email) in the background.
    # The frontend sees real-time Firestore updates as agents progress.
    if results:
        launch_auto_agents(job_id)

    return {
        "success": True,
        "job_id": job_id,
        "hr_uid": hr_uid,
        "hr_name": hr_name,
        "job_title": job_title,
        "total_uploaded": len(files),
        "total_processed": len(results),
        "total_errors": len(errors),
        "candidates": results,
        "errors": errors,
        "agents_started": bool(results),
    }


@app.get("/api/resumes/job/{job_id}")
def get_job_candidates(job_id: str):
    """Fetch all parsed candidates for a given job_id from PostgreSQL."""
    rows = get_candidates_by_job(job_id)
    return {"job_id": job_id, "total": len(rows), "candidates": rows}


# ─── Student Self-Apply ────────────────────────────────────────────────────────

def _screen_new_applicant(job_id: str) -> None:
    """Background: run screening agent for a newly self-applied candidate."""
    try:
        run_screening_agent(job_id)
    except Exception as e:
        print(f"[APPLY] Screening failed for {job_id}: {e}")


@app.post("/api/jobs/apply")
async def student_apply(
    job_id: str = Form(...),
    student_token: str = Form(...),
    file: UploadFile = File(...),
):
    """
    Student self-applies to an open job by uploading their own resume.

    Flow:
      1. Verify student Firebase token → get email/uid
      2. Check job is open pooling, not past deadline
      3. Check student hasn't already applied (by email)
      4. Save PDF, parse text, extract profile via Agent 1
      5. Create candidate doc in Firestore
      6. Launch screening agent in background
    """
    from datetime import datetime, timezone as tz

    # Verify student token (any valid Firebase user)
    try:
        decoded = firebase_auth.verify_id_token(student_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    student_uid = decoded["uid"]
    student_email = decoded.get("email", "")
    student_name = decoded.get("name", decoded.get("display_name", student_email))

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF resumes are accepted.")

    # Fetch job from Firestore
    db_client = get_firestore_client()
    job_ref = db_client.collection("jobs").document(job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail="Job not found.")

    job_data = job_doc.to_dict()

    if job_data.get("pooling_type") != "open":
        raise HTTPException(status_code=403, detail="This job is not open for public applications.")

    deadline = job_data.get("application_deadline", "")
    if deadline:
        try:
            dl = datetime.fromisoformat(deadline)
            if dl.tzinfo is None:
                dl = dl.replace(tzinfo=tz.utc)
            if datetime.now(tz.utc) > dl:
                raise HTTPException(status_code=400, detail="Application deadline has passed.")
        except HTTPException:
            raise
        except Exception:
            pass  # malformed deadline — allow application

    # Check duplicate application by email
    if student_email:
        existing_cands = job_ref.collection("candidates").where("email", "==", student_email.lower().strip()).limit(1).get()
        if len(existing_cands) > 0:
            raise HTTPException(status_code=409, detail="You have already applied for this job.")

    # Save PDF
    job_dir = UPLOAD_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    safe_filename = f"student_{student_uid[:8]}_{file.filename}"
    pdf_path = job_dir / safe_filename

    try:
        with open(pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save resume: {e}")

    resume_text = parse_pdf_text(pdf_path)
    if not resume_text:
        raise HTTPException(status_code=422, detail="Could not extract text from the PDF. Please ensure it is a text-based PDF.")

    # Agent 1: extract profile
    try:
        profile = extract_candidate_profile(resume_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profile extraction failed: {e}")

    # Use student's auth email over parsed email (more reliable)
    resolved_email = student_email or profile.get("email", "")
    resolved_name = profile.get("full_name") or student_name or "Applicant"

    candidate_id = f"cand_apply_{student_uid[:8]}_{uuid.uuid4().hex[:6]}"

    hr_uid = job_data.get("hr_uid", "")
    hr_name = job_data.get("hr_name", "")
    job_title = job_data.get("job_title", "")
    job_description = job_data.get("job_description", "")

    # Store in PostgreSQL
    pg_record = {
        "candidate_id": candidate_id,
        "job_id": job_id,
        "hr_uid": hr_uid,
        "hr_name": hr_name,
        "full_name": resolved_name,
        "email": resolved_email,
        "phone": profile.get("phone", ""),
        "skills": profile.get("skills", []),
        "experience": profile.get("experience", 0.0),
        "education": profile.get("education", ""),
        "resume_text": resume_text,
        "resume_path": str(pdf_path),
        "job_role": profile.get("job_role", "") or job_title,
        "status": "parsed",
    }
    insert_candidate(pg_record)

    # Store in Firestore
    push_candidate_to_firebase(
        hr_uid=hr_uid,
        hr_name=hr_name,
        job_id=job_id,
        candidate_id=candidate_id,
        name=resolved_name,
        email=resolved_email,
        phone=profile.get("phone", ""),
        resume_text=resume_text,
        skills=profile.get("skills", []),
        experience=profile.get("experience", 0.0),
        education=profile.get("education", ""),
        job_role=profile.get("job_role", "") or job_title,
        status="Resume Uploaded",
        interview_time="",
    )

    # Update total_candidates count on job doc
    try:
        job_ref.update({"total_candidates": admin_firestore.Increment(1)})
    except Exception:
        pass

    # Launch screening in background
    t = threading.Thread(target=_screen_new_applicant, args=(job_id,), daemon=True)
    t.start()

    return {
        "success": True,
        "candidate_id": candidate_id,
        "job_id": job_id,
        "name": resolved_name,
        "email": resolved_email,
        "message": "Application submitted! AI is screening your profile — check your dashboard in a moment.",
    }


# ─── Agent 2: Screening ────────────────────────────────────────────────────────

class ScreeningRequest(BaseModel):
    job_id: str
    hr_token: str


@app.post("/api/screening/run")
async def run_screening(req: ScreeningRequest):
    """
    Agent 2 — Screening Agent.

    For each candidate in the job, sends the JD + resume text to the LLM
    and decides: shortlisted or rejected. Updates Firestore with results.
    """
    verify_hr_token(req.hr_token)
    try:
        results = run_screening_agent(req.job_id)
        return {
            "success": True,
            "job_id": req.job_id,
            "total_shortlisted": len(results["shortlisted"]),
            "total_rejected": len(results["rejected"]),
            **results,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EnvironmentError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Screening agent failed: {e}")


# ─── Agent 3: Emails ───────────────────────────────────────────────────────────

class EmailRequest(BaseModel):
    job_id: str
    hr_token: str


@app.post("/api/emails/send")
async def send_emails(req: EmailRequest):
    """
    Agent 3 — Email Agent.

    Sends personalized shortlist/rejection emails to all screened candidates
    via Gmail SMTP (requires SMTP_USER + SMTP_PASSWORD in .env).
    """
    verify_hr_token(req.hr_token)
    try:
        results = run_email_agent(req.job_id)
        return {
            "success": True,
            "job_id": req.job_id,
            **results,
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except EnvironmentError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Email agent failed: {e}")


# ─── Agent 4: Assessment ───────────────────────────────────────────────────────

class AssessmentGenerateRequest(BaseModel):
    job_id: str
    candidate_id: str
    student_token: str


class AssessmentSubmitRequest(BaseModel):
    job_id: str
    candidate_id: str
    student_token: str
    selected_answers: List[str]
    time_taken_seconds: int = 0
    violations: int = 0


def verify_student_token(id_token: str) -> dict:
    try:
        return firebase_auth.verify_id_token(id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid or expired token: {e}")


@app.post("/api/assessment/generate")
async def generate_assessment(req: AssessmentGenerateRequest):
    """
    Generate 5 progressively harder coding questions for a candidate.

    Flow:
      1. Verify student Firebase token
      2. Fetch job + candidate from Firestore
      3. If assessment already completed → return existing questions + flag
      4. Generate questions via Assessment Agent
      5. Save assessment stub to Firestore (status = in_progress)
    """
    verify_student_token(req.student_token)

    db = get_firestore_client()

    job_ref = db.collection("jobs").document(req.job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail="Job not found.")
    job_data = job_doc.to_dict()

    cand_ref = job_ref.collection("candidates").document(req.candidate_id)
    cand_doc = cand_ref.get()
    if not cand_doc.exists:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    cand_data = cand_doc.to_dict()

    existing = cand_data.get("assessment", {})
    if existing.get("status") == "completed":
        return {
            "success": True,
            "questions": _strip_assessment_answers(existing.get("questions", [])),
            "already_completed": True,
        }

    if existing.get("status") == "in_progress" and existing.get("questions"):
        return {
            "success": True,
            "questions": _strip_assessment_answers(existing["questions"]),
            "already_completed": False,
        }

    from datetime import datetime, timezone
    questions = generate_assessment_questions(
        job_role=cand_data.get("job_role", job_data.get("job_title", "")),
        job_description=job_data.get("job_description", ""),
        skills=cand_data.get("skills", []),
        experience=cand_data.get("experience", 0.0),
    )

    cand_ref.update({
        "assessment": {
            "status": "in_progress",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "questions": questions,
            "selected_answers": [],
            "evaluation": None,
            "violations": 0,
            "time_taken_seconds": 0,
        }
    })

    return {
        "success": True,
        "questions": _strip_assessment_answers(questions),
        "already_completed": False,
    }


def _strip_assessment_answers(questions: list) -> list:
    """Remove correct_option and explanation from assessment questions before sending to client."""
    safe_fields = {"question_text", "option_a", "option_b", "option_c", "option_d", "category"}
    return [{k: v for k, v in q.items() if k in safe_fields} for q in questions]


@app.post("/api/assessment/submit")
async def submit_assessment(req: AssessmentSubmitRequest):
    """
    Submit answers, run AI evaluation, and save results to Firestore.

    Flow:
      1. Verify student token
      2. Fetch stored questions from Firestore
      3. Evaluate answers via Assessment Agent
      4. Write completed assessment to Firestore
    """
    verify_student_token(req.student_token)

    db = get_firestore_client()

    job_ref = db.collection("jobs").document(req.job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail="Job not found.")
    job_data = job_doc.to_dict()

    cand_ref = job_ref.collection("candidates").document(req.candidate_id)
    cand_doc = cand_ref.get()
    if not cand_doc.exists:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    cand_data = cand_doc.to_dict()

    assessment_data = cand_data.get("assessment", {})
    questions = assessment_data.get("questions", [])

    if not questions:
        raise HTTPException(
            status_code=400,
            detail="No questions found. Please start the assessment first."
        )

    padded = list(req.selected_answers) + [""] * max(0, len(questions) - len(req.selected_answers))

    evaluation = evaluate_assessment(
        questions=questions,
        selected_answers=padded[:len(questions)],
    )

    from datetime import datetime, timezone
    cand_ref.update({
        "assessment": {
            **assessment_data,
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "selected_answers": padded[:len(questions)],
            "evaluation": evaluation,
            "time_taken_seconds": req.time_taken_seconds,
            "violations": req.violations,
        }
    })

    return {
        "success": True,
        "evaluation": evaluation,
    }


# ─── Agent 5: Aptitude ─────────────────────────────────────────────────────────

class AptitudeGenerateRequest(BaseModel):
    job_id: str
    candidate_id: str
    student_token: str


class AptitudeSubmitRequest(BaseModel):
    job_id: str
    candidate_id: str
    student_token: str
    selected_answers: List[str]
    time_taken_seconds: int = 0
    violations: int = 0


@app.post("/api/aptitude/generate")
async def generate_aptitude_endpoint(req: AptitudeGenerateRequest):
    """
    Generate 20 MCQ aptitude questions for a candidate.

    Returns questions WITHOUT correct_option or explanation to prevent cheating.
    Full questions (with answers) are stored server-side in Firestore.
    """
    verify_student_token(req.student_token)

    db_client = get_firestore_client()
    job_ref = db_client.collection("jobs").document(req.job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail="Job not found.")
    job_data = job_doc.to_dict()

    cand_ref = job_ref.collection("candidates").document(req.candidate_id)
    cand_doc = cand_ref.get()
    if not cand_doc.exists:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    cand_data = cand_doc.to_dict()

    existing = cand_data.get("aptitude", {})

    if existing.get("status") == "completed":
        return {"success": True, "questions": _strip_answers(existing.get("questions", [])), "already_completed": True}

    if existing.get("status") == "in_progress" and existing.get("questions"):
        return {"success": True, "questions": _strip_answers(existing["questions"]), "already_completed": False}

    from datetime import datetime, timezone
    job_role = cand_data.get("job_role", job_data.get("job_title", "Professional"))
    questions = generate_aptitude_questions(job_role=job_role)

    cand_ref.update({
        "aptitude": {
            "status": "in_progress",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "questions": questions,
            "selected_answers": [],
            "evaluation": None,
            "violations": 0,
            "time_taken_seconds": 0,
        }
    })

    return {"success": True, "questions": _strip_answers(questions), "already_completed": False}


def _strip_answers(questions: list) -> list:
    """Remove correct_option and explanation before sending to client."""
    safe_fields = {"question_text", "option_a", "option_b", "option_c", "option_d", "category"}
    return [{k: v for k, v in q.items() if k in safe_fields} for q in questions]


@app.post("/api/aptitude/submit")
async def submit_aptitude_endpoint(req: AptitudeSubmitRequest):
    """
    Submit aptitude answers and auto-evaluate against stored correct answers.
    """
    verify_student_token(req.student_token)

    db_client = get_firestore_client()
    job_ref = db_client.collection("jobs").document(req.job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail="Job not found.")

    cand_ref = job_ref.collection("candidates").document(req.candidate_id)
    cand_doc = cand_ref.get()
    if not cand_doc.exists:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    cand_data = cand_doc.to_dict()

    aptitude_data = cand_data.get("aptitude", {})
    questions = aptitude_data.get("questions", [])
    if not questions:
        raise HTTPException(status_code=400, detail="No aptitude questions found. Start the test first.")

    padded = list(req.selected_answers) + [""] * max(0, len(questions) - len(req.selected_answers))
    evaluation = evaluate_aptitude(questions=questions, selected_answers=padded[:len(questions)])

    from datetime import datetime, timezone
    cand_ref.update({
        "aptitude": {
            **aptitude_data,
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "selected_answers": padded[:len(questions)],
            "evaluation": evaluation,
            "time_taken_seconds": req.time_taken_seconds,
            "violations": req.violations,
        }
    })

    return {"success": True, "evaluation": evaluation}


# ─── Agent 6: DSA Round ────────────────────────────────────────────────────────

class DSAGenerateRequest(BaseModel):
    job_id: str
    candidate_id: str
    student_token: str


class DSASubmission(BaseModel):
    problem_index: int
    code: str
    language: str = "python"


class DSASubmitRequest(BaseModel):
    job_id: str
    candidate_id: str
    student_token: str
    submissions: List[DSASubmission]
    time_taken_seconds: int = 0
    violations: int = 0


@app.post("/api/dsa/generate")
async def generate_dsa_endpoint(req: DSAGenerateRequest):
    """
    Generate 3 DSA problems (Easy / Medium / Hard) for the candidate.
    Returns problems WITHOUT hidden_test_cases to prevent cheating.
    Full problems stored server-side in Firestore.
    """
    verify_student_token(req.student_token)

    db_client = get_firestore_client()
    job_ref = db_client.collection("jobs").document(req.job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail="Job not found.")
    job_data = job_doc.to_dict()

    cand_ref = job_ref.collection("candidates").document(req.candidate_id)
    cand_doc = cand_ref.get()
    if not cand_doc.exists:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    cand_data = cand_doc.to_dict()

    existing = cand_data.get("dsa", {})
    if existing.get("status") == "completed":
        return {"success": True, "problems": strip_hidden_test_cases(existing.get("problems", [])), "already_completed": True}
    if existing.get("status") == "in_progress" and existing.get("problems"):
        return {"success": True, "problems": strip_hidden_test_cases(existing["problems"]), "already_completed": False}

    from datetime import datetime, timezone
    job_role = cand_data.get("job_role", job_data.get("job_title", "Software Engineer"))
    skills = cand_data.get("skills", [])
    problems = generate_dsa_problems(job_role=job_role, skills=skills)

    cand_ref.update({
        "dsa": {
            "status": "in_progress",
            "started_at": datetime.now(timezone.utc).isoformat(),
            "problems": problems,
            "submissions": [],
            "evaluation": None,
            "violations": 0,
            "time_taken_seconds": 0,
        }
    })

    return {"success": True, "problems": strip_hidden_test_cases(problems), "already_completed": False}


@app.post("/api/dsa/submit")
async def submit_dsa_endpoint(req: DSASubmitRequest):
    """
    Evaluate DSA code submissions against hidden test cases via Piston API.
    """
    verify_student_token(req.student_token)

    db_client = get_firestore_client()
    job_ref = db_client.collection("jobs").document(req.job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail="Job not found.")

    cand_ref = job_ref.collection("candidates").document(req.candidate_id)
    cand_doc = cand_ref.get()
    if not cand_doc.exists:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    cand_data = cand_doc.to_dict()

    dsa_data = cand_data.get("dsa", {})
    problems = dsa_data.get("problems", [])
    if not problems:
        raise HTTPException(status_code=400, detail="No DSA problems found. Start the test first.")

    submissions_list = [{"problem_index": s.problem_index, "code": s.code, "language": s.language} for s in req.submissions]
    evaluation = await evaluate_dsa_submission(problems=problems, submissions=submissions_list)

    from datetime import datetime, timezone
    cand_ref.update({
        "dsa": {
            **dsa_data,
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "submissions": submissions_list,
            "evaluation": evaluation,
            "time_taken_seconds": req.time_taken_seconds,
            "violations": req.violations,
        }
    })

    return {"success": True, "evaluation": evaluation}


# ─── Agent 7: Meet Agent (AI Voice Interview) ──────────────────────────────────

class MeetGenerateRequest(BaseModel):
    job_id: str
    candidate_id: str
    student_token: str


class MeetSubmitRequest(BaseModel):
    job_id: str
    candidate_id: str
    student_token: str
    answers: List[str]
    time_taken_seconds: int = 0


class MeetSelectionEmailRequest(BaseModel):
    job_id: str
    candidate_id: str
    hr_token: str


@app.post("/api/meet/generate")
async def generate_meet_endpoint(req: MeetGenerateRequest):
    """
    Agent 7 — Initialize the voice interview session.
    Returns candidate context so the frontend can generate questions one at a time via /api/meet/next.
    """
    verify_student_token(req.student_token)

    db_client = get_firestore_client()
    job_ref = db_client.collection("jobs").document(req.job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail="Job not found.")
    job_data = job_doc.to_dict()

    cand_ref = job_ref.collection("candidates").document(req.candidate_id)
    cand_doc = cand_ref.get()
    if not cand_doc.exists:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    cand_data = cand_doc.to_dict()

    existing = cand_data.get("meet_interview", {})
    job_role = cand_data.get("job_role", job_data.get("job_title", "Software Engineer"))
    skills = cand_data.get("skills", [])
    experience = cand_data.get("experience", 0.0)
    job_description = job_data.get("job_description", "")

    candidate_context = {
        "job_role": job_role,
        "skills": skills,
        "experience": experience,
        "job_description": job_description,
    }

    if existing.get("status") == "completed":
        return {
            "success": True,
            "already_completed": True,
            "evaluation": existing.get("evaluation"),
            "candidate_context": candidate_context,
        }

    from datetime import datetime, timezone
    # Initialize or resume session
    if existing.get("status") != "in_progress":
        cand_ref.update({
            "meet_interview": {
                "status": "in_progress",
                "started_at": datetime.now(timezone.utc).isoformat(),
                "questions": [],
                "answers": [],
                "evaluation": None,
                "time_taken_seconds": 0,
            }
        })

    return {
        "success": True,
        "already_completed": False,
        "candidate_context": candidate_context,
    }


class MeetNextRequest(BaseModel):
    job_id: str
    candidate_id: str
    student_token: str
    question_number: int  # 1-based (1–10)
    conversation_history: list = []  # [{question, type, answer}]


@app.post("/api/meet/next")
async def next_meet_question(req: MeetNextRequest):
    """
    Agent 7 — Generate the next interview question, one at a time.
    Also returns brief conversational feedback on the previous answer (if any).
    Saves the generated question to Firestore so /api/meet/submit can evaluate it.
    """
    verify_student_token(req.student_token)

    if req.question_number < 1 or req.question_number > 10:
        raise HTTPException(status_code=400, detail="question_number must be 1–10.")

    db_client = get_firestore_client()
    job_ref = db_client.collection("jobs").document(req.job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail="Job not found.")
    job_data = job_doc.to_dict()

    cand_ref = job_ref.collection("candidates").document(req.candidate_id)
    cand_doc = cand_ref.get()
    if not cand_doc.exists:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    cand_data = cand_doc.to_dict()

    job_role = cand_data.get("job_role", job_data.get("job_title", "Software Engineer"))
    skills = cand_data.get("skills", [])
    experience = cand_data.get("experience", 0.0)
    job_description = job_data.get("job_description", "")

    # Generate brief feedback on the PREVIOUS answer (if not first question)
    feedback = None
    if req.question_number > 1 and req.conversation_history:
        prev = req.conversation_history[-1]
        prev_q = prev.get("question", "")
        prev_a = prev.get("answer", "")
        if prev_a and prev_a != "[No answer provided]":
            try:
                feedback = get_brief_feedback(prev_q, prev_a)
            except Exception:
                feedback = None

    # Generate the next question
    question_data = generate_next_question(
        job_role=job_role,
        job_description=job_description,
        skills=skills,
        experience=float(experience),
        question_number=req.question_number,
        conversation_history=req.conversation_history,
    )

    # Append this question to Firestore so submit can read them
    meet_data = cand_data.get("meet_interview", {})
    existing_questions = meet_data.get("questions", [])
    # Only append if we don't already have this question index
    already_has = any(q.get("index") == req.question_number for q in existing_questions)
    if not already_has:
        existing_questions.append(question_data)
        cand_ref.update({"meet_interview.questions": existing_questions})

    return {
        "success": True,
        "question": question_data["question"],
        "type": question_data["type"],
        "index": question_data["index"],
        "feedback": feedback,
    }


@app.post("/api/meet/submit")
async def submit_meet_endpoint(req: MeetSubmitRequest):
    """
    Agent 7 — Submit voice answers, evaluate with LLM, save report to Firestore.
    """
    verify_student_token(req.student_token)

    db_client = get_firestore_client()
    job_ref = db_client.collection("jobs").document(req.job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail="Job not found.")
    job_data = job_doc.to_dict()

    cand_ref = job_ref.collection("candidates").document(req.candidate_id)
    cand_doc = cand_ref.get()
    if not cand_doc.exists:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    cand_data = cand_doc.to_dict()

    meet_data = cand_data.get("meet_interview", {})
    questions = meet_data.get("questions", [])
    if not questions:
        raise HTTPException(status_code=400, detail="No questions found. Start the interview first.")

    padded_answers = list(req.answers) + [""] * max(0, len(questions) - len(req.answers))
    padded_answers = padded_answers[:len(questions)]

    job_role = cand_data.get("job_role", job_data.get("job_title", "Software Engineer"))
    evaluation = evaluate_meet_interview(
        job_role=job_role,
        questions=questions,
        answers=padded_answers,
    )

    from datetime import datetime, timezone
    cand_ref.update({
        "meet_interview": {
            **meet_data,
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "answers": padded_answers,
            "evaluation": evaluation,
            "time_taken_seconds": req.time_taken_seconds,
        }
    })

    return {"success": True, "evaluation": evaluation}


@app.post("/api/meet/send-selection-email")
async def send_meet_selection_email(req: MeetSelectionEmailRequest):
    """
    HR triggers this to send a final selection/offer email to a candidate
    who passed the AI voice interview. Uses existing SMTP email infrastructure.
    """
    verify_hr_token(req.hr_token)

    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    db_client = get_firestore_client()
    job_ref = db_client.collection("jobs").document(req.job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise HTTPException(status_code=404, detail="Job not found.")
    job_data = job_doc.to_dict()

    cand_ref = job_ref.collection("candidates").document(req.candidate_id)
    cand_doc = cand_ref.get()
    if not cand_doc.exists:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    cand_data = cand_doc.to_dict()

    candidate_email = (cand_data.get("email") or "").strip()
    candidate_name = cand_data.get("name", "Candidate")
    job_title = job_data.get("job_title", "the position")
    company_name = job_data.get("hr_name", "Our Company")

    if not candidate_email:
        raise HTTPException(status_code=400, detail="Candidate has no email address.")

    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    if not smtp_user or not smtp_password:
        raise HTTPException(
            status_code=500,
            detail="SMTP credentials not configured. Please set SMTP_USER and SMTP_PASSWORD in .env"
        )

    subject = f"You're Selected! — {job_title} at {company_name}"
    body = f"""Dear {candidate_name},

We are thrilled to inform you that after completing all stages of our interview process — including your AI-powered voice interview — you have been SELECTED for the position of {job_title} at {company_name}!

Your performance throughout the entire process was impressive. Our team is excited about the possibility of you joining us.

Our HR team will be in touch very shortly with details regarding:
  • Offer letter and compensation package
  • Joining date and onboarding process
  • Any documentation required

Please feel free to reply to this email if you have any questions or need any clarification.

Congratulations once again! We look forward to welcoming you to the team.

Warm regards,
{company_name} Recruitment Team

---
This is an official selection notification from the InterVent hiring platform.
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = candidate_email
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, [candidate_email], msg.as_string())

        cand_ref.update({"meet_selection_email_sent": True})
        return {"success": True, "message": f"Selection email sent to {candidate_email}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send email: {e}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("FASTAPI_PORT", 8000))
    uvicorn.run("fastapi_app:app", host="0.0.0.0", port=port, reload=True)
