"""
Assessment Agent — Stage 1 Technical Knowledge MCQ
====================================================
Generates 15 MCQ technical knowledge questions based on job role and skills (3 per category).
Evaluation is deterministic (correct answer comparison — no LLM needed).
Answers are NEVER sent to the client (anti-cheat).

Uses plain JSON output (not tool-call mode) to avoid Groq token limits.
"""
import os
import json
import re
from typing import List
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()

QUESTION_GEN_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are a senior technical interviewer creating a 15-question technical knowledge MCQ test.
The questions must assess conceptual and applied knowledge — NOT ask candidates to write code.
Focus on "why", "how does it work", "what is the difference", "what does X mean" style questions.

Generate exactly 15 MCQ questions in this exact order based on the job role and skills:
  Q1  – Q3  : Core Programming Concepts  — language features, OOP, memory, type systems, interpreted vs compiled
  Q4  – Q6  : Web & APIs                 — HTTP, REST, JSON/XML, authentication, request/response cycle
  Q7  – Q9  : Databases                  — SQL vs NoSQL, indexing, joins, normalization, transactions
  Q10 – Q12 : Data Structures & Algorithms (conceptual) — time complexity, sorting names, which DS for which use-case
  Q13 – Q15 : Domain / Role-Specific     — questions directly relevant to the candidate's job role and listed skills

Rules:
- Every question has EXACTLY 4 options: A, B, C, D
- Exactly ONE option is correct — never ambiguous
- Questions test KNOWLEDGE and REASONING, not code writing
- option_a/b/c/d: plain text only — do NOT include "A." or "(A)" prefix
- correct_option: one of exactly "A", "B", "C", "D"
- explanation: 1-2 clear sentences explaining why the answer is correct

Return ONLY a valid JSON object with a single key "questions" containing an array of exactly 15 objects.
Each object must have: question_text, option_a, option_b, option_c, option_d, correct_option, category, explanation.
Do NOT include any text before or after the JSON.""",
    ),
    (
        "human",
        """Job Role: {job_role}
Job Description: {job_description}
Candidate Skills: {skills}
Candidate Experience: {experience} years

Generate 15 technical knowledge MCQ questions for this candidate.
The Q13-Q15 domain questions MUST be directly relevant to: {skills}.""",
    ),
])


def _build_llm(temperature: float = 0.4) -> ChatGroq:
    model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise EnvironmentError("GROQ_API_KEY is not set.")
    return ChatGroq(model=model_name, api_key=api_key, temperature=temperature, max_tokens=8192)


def _extract_json(text: str) -> dict:
    """Extract the first complete JSON object from raw LLM text."""
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start = text.find("{")
    if start == -1:
        raise ValueError("No JSON object found in LLM response")
    depth = 0
    for i, ch in enumerate(text[start:], start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(text[start : i + 1])
    raise ValueError("Incomplete JSON in LLM response")


def generate_assessment_questions(
    job_role: str,
    job_description: str,
    skills: list,
    experience: float,
    max_retries: int = 3,
) -> List[dict]:
    """
    Generate 15 MCQ technical knowledge questions for the candidate.
    Returns full dicts including correct_option + explanation for server-side storage.
    Retries up to max_retries on parse failure.
    """
    llm = _build_llm()
    chain = QUESTION_GEN_PROMPT | llm

    last_error = None
    for _ in range(max_retries):
        try:
            response = chain.invoke({
                "job_role": job_role or "Software Engineer",
                "job_description": job_description or "General software engineering role",
                "skills": ", ".join(skills) if skills else "Python, Web Development",
                "experience": experience,
            })
            raw = response.content if hasattr(response, "content") else str(response)
            data = _extract_json(raw)
            questions = data.get("questions", [])
            if not questions:
                raise ValueError("Empty questions list")
            for q in questions:
                q["correct_option"] = str(q.get("correct_option", "")).strip().upper()
            return questions
        except Exception as e:
            last_error = e

    raise RuntimeError(f"Failed to generate assessment questions after {max_retries} attempts: {last_error}")


def evaluate_assessment(questions: List[dict], selected_answers: List[str]) -> dict:
    """Deterministic evaluation — compare each selected answer to stored correct_option."""
    per_question = []
    correct_count = 0

    for i, q in enumerate(questions):
        selected = selected_answers[i].strip().upper() if i < len(selected_answers) else ""
        correct = q.get("correct_option", "").strip().upper()
        is_correct = bool(selected and selected == correct)
        if is_correct:
            correct_count += 1
        per_question.append({
            "selected": selected,
            "correct": correct,
            "is_correct": is_correct,
            "explanation": q.get("explanation", ""),
            "category": q.get("category", ""),
        })

    total = len(questions)
    percentage = round((correct_count / total) * 100, 1) if total > 0 else 0
    passed = percentage >= 50

    if percentage >= 80:
        overall_feedback = f"Excellent technical knowledge! {correct_count}/{total} correct. Strong understanding across all areas."
    elif percentage >= 60:
        overall_feedback = f"Good performance. {correct_count}/{total} correct. Solid foundation with a few areas to strengthen."
    elif percentage >= 50:
        overall_feedback = f"Satisfactory result. {correct_count}/{total} correct. You met the passing threshold."
    else:
        overall_feedback = f"Below passing threshold. {correct_count}/{total} correct. Further review of core technical concepts is recommended."

    return {
        "per_question": per_question,
        "correct_count": correct_count,
        "total": total,
        "percentage": percentage,
        "passed": passed,
        "overall_feedback": overall_feedback,
    }
