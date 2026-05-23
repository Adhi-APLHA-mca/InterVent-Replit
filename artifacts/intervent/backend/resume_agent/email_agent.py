"""
Agent 3 — Email Agent

Sends personalized emails to shortlisted and rejected candidates
via Gmail SMTP (free, works locally with an App Password).

Setup (one-time):
  1. Enable 2FA on your Gmail account
  2. Go to Google Account → Security → App Passwords
  3. Create an App Password for "Mail"
  4. Set SMTP_USER=your@gmail.com and SMTP_PASSWORD=<app-password> in .env
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
from .firebase_utils import get_firestore_client

load_dotenv()


def _shortlist_email(candidate_name: str, job_title: str, company_name: str) -> tuple[str, str]:
    subject = f"Congratulations! You've been shortlisted — {job_title} at {company_name}"
    body = f"""Dear {candidate_name},

We are delighted to inform you that after carefully reviewing your application and resume, you have been shortlisted for the position of {job_title} at {company_name}.

Your skills and experience stood out among many talented applicants, and we believe you could be a great addition to our team.

Our hiring team will reach out shortly with details about the next steps in the interview process.

If you have any questions in the meantime, please don't hesitate to reply to this email.

Warm regards,
{company_name} Recruitment Team

---
This is an automated message from the InterVent hiring platform.
"""
    return subject, body


def _rejection_email(candidate_name: str, job_title: str, company_name: str) -> tuple[str, str]:
    subject = f"Your application for {job_title} at {company_name}"
    body = f"""Dear {candidate_name},

Thank you sincerely for your interest in the {job_title} position at {company_name} and for taking the time to submit your application.

After careful consideration of your profile, we regret to inform you that we will not be moving forward with your candidacy at this stage. The role attracted many strong applicants, and this was a highly competitive process.

Please know that this decision does not diminish your talent or potential in any way. We genuinely encourage you to apply for future openings that align with your skills and aspirations — we will keep your profile on record for upcoming opportunities.

We wish you all the very best in your career journey. Great things are ahead for you!

Warm regards,
{company_name} Recruitment Team

---
This is an automated message from the InterVent hiring platform.
"""
    return subject, body


def _send_single_email(to_email: str, subject: str, body: str) -> bool:
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")

    if not smtp_user or not smtp_password:
        raise EnvironmentError(
            "SMTP_USER and SMTP_PASSWORD are not set in .env. "
            "Please configure Gmail SMTP credentials (use a Gmail App Password)."
        )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_email
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_password)
            server.sendmail(smtp_user, [to_email], msg.as_string())
        print(f"[EMAIL AGENT] OK Sent to {to_email}")
        return True
    except Exception as e:
        print(f"[EMAIL AGENT] FAIL Failed to send to {to_email}: {e}")
        return False


def run_email_agent(job_id: str) -> dict:
    """
    Agent 3: Send emails to all screened candidates for a job.

    Flow:
      1. Fetch job metadata (job_title, hr_name as company_name)
      2. Fetch all candidates that have a screening_result and email_sent = False
      3. Send personalized shortlist/rejection email
      4. Update email_sent = True in Firestore

    Returns: {"sent": int, "failed": int, "skipped": int}
    """
    db = get_firestore_client()

    job_ref = db.collection("jobs").document(job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise ValueError(f"Job '{job_id}' not found in Firestore.")

    job_data = job_doc.to_dict()
    job_title = job_data.get("job_title", "the position")
    company_name = job_data.get("hr_name", "Our Company")

    candidates_ref = job_ref.collection("candidates")
    candidate_docs = list(candidates_ref.stream())

    sent = 0
    failed = 0
    skipped = 0

    for cand_doc in candidate_docs:
        cand = cand_doc.to_dict()
        candidate_id = cand.get("candidate_id", cand_doc.id)
        email = (cand.get("email") or "").strip()
        name = cand.get("name", "Candidate")
        screening_result = cand.get("screening_result")
        email_sent = cand.get("email_sent", False)

        if email_sent:
            skipped += 1
            continue

        if not email:
            print(f"[EMAIL AGENT] Skipping {candidate_id} — no email address")
            skipped += 1
            continue

        if not screening_result:
            print(f"[EMAIL AGENT] Skipping {candidate_id} — not yet screened")
            skipped += 1
            continue

        if screening_result == "shortlisted":
            subject, body = _shortlist_email(name, job_title, company_name)
        else:
            subject, body = _rejection_email(name, job_title, company_name)

        ok = _send_single_email(email, subject, body)
        if ok:
            candidates_ref.document(candidate_id).update({"email_sent": True})
            sent += 1
        else:
            failed += 1

    if sent > 0:
        job_ref.update({"emails_sent": True})

    return {"sent": sent, "failed": failed, "skipped": skipped}
