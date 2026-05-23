"""
Agent 1 — Resume Extraction Agent

Single responsibility:
    PDF raw text  →  LangChain LLM (Groq)  →  Structured CandidateProfile JSON

Uses LangChain's structured output (with_structured_output) for reliable extraction.
"""
import os
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from .models import CandidateProfile

load_dotenv()

EXTRACTION_PROMPT = ChatPromptTemplate.from_messages(
    [
        (
            "system",
            """You are a precise resume-parsing assistant.
Extract structured information from the provided resume text.
Be accurate — do not hallucinate. If a field is not present, leave it empty or use a sensible default.
For skills, return a list of individual skill strings (e.g. ["Python", "FastAPI", "Docker"]).
For experience, return total years as a decimal number (e.g. 2.5).
For education, return the highest qualification (e.g. "B.Tech Computer Science").
For job_role, infer from the most recent position or the objective/summary section.
""",
        ),
        (
            "human",
            "Here is the resume text:\n\n{resume_text}\n\nExtract structured candidate information.",
        ),
    ]
)


def build_llm():
    model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise EnvironmentError(
            "GROQ_API_KEY is not set. Please add it to your .env file."
        )
    return ChatGroq(model=model_name, api_key=api_key, temperature=0)


def extract_candidate_profile(resume_text: str) -> dict:
    """
    Run Agent 1: extract structured candidate data from raw resume text.

    Returns a dict matching the CandidateProfile schema.
    Raises on LLM error.
    """
    llm = build_llm()
    structured_llm = llm.with_structured_output(CandidateProfile)
    chain = EXTRACTION_PROMPT | structured_llm

    result: CandidateProfile = chain.invoke({"resume_text": resume_text})

    return result.model_dump()
