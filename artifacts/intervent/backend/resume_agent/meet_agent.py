"""
Agent 7 — Meet Agent (AI Voice Interview)

Generates 10 personalized interview questions (5 HR + 5 Technical)
and evaluates the candidate's spoken answers using Groq LLM (free).

Technologies used:
  - Groq LLM (llama-3.3-70b-versatile) — free tier, already in use
  - No paid APIs needed
  - Voice input/output handled by browser Web Speech API (free)
"""
import os
import json
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field
from typing import List

load_dotenv()


def _build_llm(temperature: float = 0.7):
    model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise EnvironmentError("GROQ_API_KEY is not set. Please add it to your .env file.")
    return ChatGroq(model=model_name, api_key=api_key, temperature=temperature)


QUESTION_GEN_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are an expert HR and technical interviewer. Generate exactly 10 interview questions:
- Questions 1-5: HR/Behavioural questions (communication, teamwork, goals, challenges, culture fit)
- Questions 6-10: Technical questions specific to the candidate's job role and skills

Rules:
- Questions must be conversational and suitable for a spoken voice interview
- Keep each question clear and concise (1-2 sentences max)
- Technical questions must relate directly to the job role and listed skills
- Do NOT number the questions in the text itself

Return ONLY valid JSON in this exact format (no markdown, no extra text):
{{
  "questions": [
    {{"question": "...", "type": "hr", "index": 1}},
    {{"question": "...", "type": "hr", "index": 2}},
    {{"question": "...", "type": "hr", "index": 3}},
    {{"question": "...", "type": "hr", "index": 4}},
    {{"question": "...", "type": "hr", "index": 5}},
    {{"question": "...", "type": "technical", "index": 6}},
    {{"question": "...", "type": "technical", "index": 7}},
    {{"question": "...", "type": "technical", "index": 8}},
    {{"question": "...", "type": "technical", "index": 9}},
    {{"question": "...", "type": "technical", "index": 10}}
  ]
}}""",
    ),
    (
        "human",
        """Generate interview questions for:
Job Role: {job_role}
Job Description: {job_description}
Candidate Skills: {skills}
Experience: {experience} years

Generate 10 questions (5 HR + 5 Technical) tailored to this candidate.""",
    ),
])


EVALUATION_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are an expert interview evaluator. Evaluate a candidate's voice interview answers.

For each answer:
- Score from 0-10 based on: relevance, depth, clarity, confidence
- Give brief constructive feedback

Then provide an overall assessment.

Return ONLY valid JSON (no markdown, no extra text):
{{
  "question_scores": [
    {{"index": 1, "score": 8, "feedback": "Good answer..."}},
    ...
  ],
  "overall_score": 75,
  "hr_score": 80,
  "technical_score": 70,
  "recommendation": "selected",
  "strengths": ["...", "..."],
  "improvements": ["...", "..."],
  "summary": "Brief overall summary of the candidate's performance in 2-3 sentences."
}}

recommendation must be exactly "selected" or "not_selected" based on overall_score >= 60.""",
    ),
    (
        "human",
        """Job Role: {job_role}

Interview Q&A:
{qa_pairs}

Evaluate all 10 answers and return the structured assessment.""",
    ),
])


def generate_meet_questions(
    job_role: str,
    job_description: str,
    skills: list,
    experience: float,
) -> list:
    """
    Generate 10 interview questions (5 HR + 5 Technical) for the voice interview.

    Returns list of dicts: [{question, type, index}, ...]
    """
    llm = _build_llm(temperature=0.7)
    chain = QUESTION_GEN_PROMPT | llm

    skills_str = ", ".join(skills) if skills else "general programming"
    result = chain.invoke({
        "job_role": job_role or "Software Engineer",
        "job_description": job_description or "General software development role",
        "skills": skills_str,
        "experience": experience or 0,
    })

    raw = result.content.strip()

    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    parsed = json.loads(raw)
    questions = parsed.get("questions", [])

    if len(questions) != 10:
        raise ValueError(f"Expected 10 questions, got {len(questions)}")

    return questions


def evaluate_meet_interview(
    job_role: str,
    questions: list,
    answers: list,
) -> dict:
    """
    Evaluate all 10 interview answers using Groq LLM.

    Args:
        job_role: The position being interviewed for
        questions: List of question dicts [{question, type, index}]
        answers: List of answer strings (parallel to questions)

    Returns evaluation dict with scores and recommendation.
    """
    llm = _build_llm(temperature=0)
    chain = EVALUATION_PROMPT | llm

    qa_lines = []
    for i, (q, a) in enumerate(zip(questions, answers), 1):
        q_type = q.get("type", "general").upper()
        q_text = q.get("question", "")
        a_text = a.strip() if a else "[No answer provided]"
        qa_lines.append(f"Q{i} ({q_type}): {q_text}\nAnswer: {a_text}")

    qa_pairs = "\n\n".join(qa_lines)

    result = chain.invoke({
        "job_role": job_role or "Software Engineer",
        "qa_pairs": qa_pairs,
    })

    raw = result.content.strip()

    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    evaluation = json.loads(raw)

    # Ensure recommendation is valid
    overall = evaluation.get("overall_score", 0)
    if "recommendation" not in evaluation:
        evaluation["recommendation"] = "selected" if overall >= 60 else "not_selected"

    evaluation["passed"] = evaluation["recommendation"] == "selected"
    evaluation["total_questions"] = len(questions)

    return evaluation
