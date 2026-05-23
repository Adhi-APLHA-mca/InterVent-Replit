"""
Aptitude Agent — Stage 2 Aptitude Test
========================================
Generates 15 MCQ aptitude questions across 5 categories (3 each).
Evaluation is deterministic (correct answer comparison — no LLM needed).

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
        """You are an expert aptitude test designer creating a standardised graduate-level assessment.
Generate exactly 15 multiple-choice questions (MCQs) in this exact order:
  Q1  – Q3  : Numerical Reasoning    — arithmetic, percentages, ratios, averages, profit/loss
  Q4  – Q6  : Logical Reasoning      — sequences, patterns, analogies, syllogisms
  Q7  – Q9  : Verbal Ability         — vocabulary, sentence completion, fill-in-the-blank, grammar
  Q10 – Q12 : Data Interpretation    — table/chart reading, calculations, comparisons
  Q13 – Q15 : General Aptitude       — clock/calendar, speed-distance-time, work problems, spatial reasoning

Rules:
- Every question has EXACTLY 4 options: A, B, C, D
- Exactly ONE option is correct — never ambiguous
- Moderate difficulty — graduate entry level
- Each question is fully self-contained (no external images needed)
- option_a/b/c/d: plain text only — do NOT include "A." or "(A)" prefix
- correct_option: one of exactly "A", "B", "C", "D"
- explanation: 1-2 clear sentences explaining why the answer is correct

Return ONLY a valid JSON object with a single key "questions" containing an array of exactly 15 objects.
Each object must have: question_text, option_a, option_b, option_c, option_d, correct_option, category, explanation.
Do NOT include any text before or after the JSON.""",
    ),
    (
        "human",
        "Generate 15 aptitude MCQ questions for a candidate applying for: {job_role}.\nMake questions appropriate for a working professional in this domain.",
    ),
])


def _build_llm(temperature: float = 0.4) -> ChatGroq:
    model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise EnvironmentError("GROQ_API_KEY is not set. Please add it to your .env file.")
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


def generate_aptitude_questions(job_role: str, max_retries: int = 3) -> List[dict]:
    """
    Generate 15 MCQ aptitude questions.
    Returns full dicts including correct_option + explanation for server-side storage.
    Retries up to max_retries on parse failure.
    """
    llm = _build_llm()
    chain = QUESTION_GEN_PROMPT | llm

    last_error = None
    for _ in range(max_retries):
        try:
            response = chain.invoke({"job_role": job_role or "Professional"})
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

    raise RuntimeError(f"Failed to generate aptitude questions after {max_retries} attempts: {last_error}")


def evaluate_aptitude(questions: List[dict], selected_answers: List[str]) -> dict:
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
        overall_feedback = f"Excellent aptitude! {correct_count}/{total} correct. Strong performance across all categories."
    elif percentage >= 60:
        overall_feedback = f"Good performance. {correct_count}/{total} correct. Solid aptitude skills with a few areas to polish."
    elif percentage >= 50:
        overall_feedback = f"Satisfactory result. {correct_count}/{total} correct. You met the passing threshold."
    else:
        overall_feedback = f"Below passing threshold. {correct_count}/{total} correct. Further preparation is recommended."

    return {
        "per_question": per_question,
        "correct_count": correct_count,
        "total": total,
        "percentage": percentage,
        "passed": passed,
        "overall_feedback": overall_feedback,
    }
