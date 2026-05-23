"""
Agent 2 — Screening Agent

Reads job_description + resume_text from Firestore per candidate,
uses Groq LLM to decide: shortlisted or rejected.
Updates Firestore with results and sets job screening_status = "done".
"""
import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from .firebase_utils import get_firestore_client

load_dotenv()

SCREENING_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are a strict but fair HR screening assistant.
Your task is to evaluate a candidate's resume against a given job description and decide:
- "shortlisted" — The candidate is a strong match and should proceed to interviews.
- "rejected" — The candidate does not sufficiently meet the requirements.

Be objective and concise. Provide a clear reason (1-2 sentences) for your decision.
""",
    ),
    (
        "human",
        """JOB DESCRIPTION:
{job_description}

CANDIDATE RESUME:
{resume_text}

Evaluate this candidate and return your structured decision.""",
    ),
])


class ScreeningDecision(BaseModel):
    decision: str = Field(description="Either 'shortlisted' or 'rejected'")
    reason: str = Field(description="Brief reason for the decision (1-2 sentences)")


def build_screening_llm():
    model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise EnvironmentError("GROQ_API_KEY is not set. Please add it to your .env file.")
    return ChatGroq(model=model_name, api_key=api_key, temperature=0)


def run_screening_agent(job_id: str) -> dict:
    """
    Run Agent 2 screening for all candidates in a job.

    Flow:
      1. Fetch job doc from Firestore to get job_description
      2. Set job screening_status = "running"
      3. Fetch all candidates for this job
      4. For each candidate: send JD + resume_text to Groq LLM → decision
      5. Update each candidate in Firestore with screening_result + status
      6. Set job screening_status = "done"

    Returns: {"shortlisted": [...], "rejected": [...]}
    """
    db = get_firestore_client()

    job_ref = db.collection("jobs").document(job_id)
    job_doc = job_ref.get()
    if not job_doc.exists:
        raise ValueError(f"Job '{job_id}' not found in Firestore.")

    job_data = job_doc.to_dict()
    job_description = job_data.get("job_description", "").strip()
    if not job_description:
        raise ValueError(f"Job '{job_id}' has no job description stored. Cannot screen candidates.")

    job_ref.update({"screening_status": "running"})

    candidates_ref = job_ref.collection("candidates")
    candidate_docs = list(candidates_ref.stream())

    if not candidate_docs:
        job_ref.update({"screening_status": "done", "total_shortlisted": 0, "total_rejected": 0})
        return {"shortlisted": [], "rejected": []}

    llm = build_screening_llm()
    structured_llm = llm.with_structured_output(ScreeningDecision)
    chain = SCREENING_PROMPT | structured_llm

    shortlisted = []
    rejected = []

    for cand_doc in candidate_docs:
        candidate = cand_doc.to_dict()
        candidate_id = candidate.get("candidate_id", cand_doc.id)
        resume_text = candidate.get("resume_text", "").strip()
        name = candidate.get("name", "Unknown")
        email = candidate.get("email", "")

        if not resume_text:
            decision = "rejected"
            reason = "No resume text was available for evaluation."
        else:
            try:
                result: ScreeningDecision = chain.invoke({
                    "job_description": job_description,
                    "resume_text": resume_text,
                })
                decision = result.decision.lower().strip()
                reason = result.reason
                if decision not in ("shortlisted", "rejected"):
                    decision = "rejected"
                    reason = "LLM returned an unexpected decision; defaulting to rejected."
            except Exception as e:
                print(f"[SCREENING ERROR] {candidate_id}: {e}")
                decision = "rejected"
                reason = f"Screening agent error — could not evaluate: {str(e)[:120]}"

        candidates_ref.document(candidate_id).update({
            "screening_result": decision,
            "screening_reason": reason,
            "status": "Shortlisted" if decision == "shortlisted" else "Rejected",
        })

        entry = {
            "candidate_id": candidate_id,
            "name": name,
            "email": email,
            "reason": reason,
        }
        if decision == "shortlisted":
            shortlisted.append(entry)
        else:
            rejected.append(entry)

    job_ref.update({
        "screening_status": "done",
        "total_shortlisted": len(shortlisted),
        "total_rejected": len(rejected),
    })

    return {"shortlisted": shortlisted, "rejected": rejected}
