"""
Agent 7 — Meet Agent (AI Voice Interview)

Per-question conversational flow:
  - generate_next_question(): generates one question at a time, context-aware
  - get_brief_feedback(): one natural sentence acknowledging previous answer
  - evaluate_meet_interview(): final evaluation after all Q&A
"""
import os
import json
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()


def _build_llm(temperature: float = 0.7):
    model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise EnvironmentError("GROQ_API_KEY is not set.")
    return ChatGroq(model=model_name, api_key=api_key, temperature=temperature)


NEXT_QUESTION_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are a professional AI interviewer conducting a real-time voice interview.

Questions 1-5 must be HR/Behavioural (communication, teamwork, goals, challenges, motivation, culture fit).
Questions 6-10 must be Technical (specific to the candidate's job role and skills).

HR question ideas (pick different ones each time): self-introduction, career goals, teamwork experience, handling conflict, greatest achievement, motivation for this role, leadership example, handling failure, time management, work style.
Technical question ideas: specific technologies from the candidate's skills, system design, debugging approach, code quality practices, performance optimization, project challenges, architecture decisions, testing strategies.

Rules:
- NEVER repeat or rephrase ANY question already asked in the Previous Q&A — check every prior Q before generating
- Each question must be completely unique and explore a different topic than all previous questions
- Sound natural and conversational, suitable for spoken voice
- Keep it to 1-2 sentences maximum
- Do NOT number the question or add prefixes like "Question 4:"
- Build naturally on the conversation flow if a prior answer mentioned something interesting

Return ONLY valid JSON: {{"question": "...", "type": "hr" or "technical"}}""",
    ),
    (
        "human",
        """Candidate Info:
Job Role: {job_role}
Skills: {skills}
Experience: {experience} years
Job Description: {job_description}

This is question {question_number} of 10.
{history_block}
{already_asked_block}
Generate a NEW, UNIQUE question {question_number} that has NOT been asked before.""",
    ),
])


FEEDBACK_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are a friendly, natural AI interviewer. React to the candidate's answer with ONE short conversational sentence — exactly like a real human interviewer would. 
Be warm and professional. Do NOT score or evaluate.
Examples of good responses:
- "That's a really thoughtful example, thank you."
- "I appreciate you sharing that perspective."
- "Interesting approach — I've noted that."
- "Good, that makes sense."
Return ONLY that single sentence, no quotes, no extra text.""",
    ),
    ("human", "Question: {question}\nCandidate's answer: {answer}"),
])


EVALUATION_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are an expert interview evaluator. Evaluate a candidate's voice interview answers.

For each answer, score 0-10 based on: relevance, depth, clarity, and confidence.

Return ONLY valid JSON (no markdown):
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
  "summary": "2-3 sentence overall summary of the candidate."
}}

recommendation must be exactly "selected" or "not_selected" (selected if overall_score >= 60).""",
    ),
    (
        "human",
        """Job Role: {job_role}

Interview Q&A:
{qa_pairs}

Evaluate all answers and return the structured assessment.""",
    ),
])


def generate_next_question(
    job_role: str,
    job_description: str,
    skills: list,
    experience: float,
    question_number: int,
    conversation_history: list,
) -> dict:
    """
    Generate the next interview question (1-indexed, 1-10).
    conversation_history: list of {question, type, answer} dicts for previous Q&A.
    Returns: {question: str, type: "hr"|"technical"}
    """
    llm = _build_llm(temperature=0.75)
    chain = NEXT_QUESTION_PROMPT | llm

    history_lines = []
    asked_questions = []
    for item in conversation_history:
        q = item.get('question', '')
        a = item.get('answer', '[No answer]')
        history_lines.append(f"Q: {q}")
        history_lines.append(f"A: {a}")
        if q:
            asked_questions.append(q)

    history_block = ("Previous Q&A:\n" + "\n".join(history_lines)) if history_lines else ""
    already_asked_block = (
        "Questions already asked — DO NOT repeat or rephrase any of these:\n"
        + "\n".join(f"- {q}" for q in asked_questions)
    ) if asked_questions else ""

    result = chain.invoke({
        "job_role": job_role or "Software Engineer",
        "job_description": job_description or "",
        "skills": ", ".join(skills) if skills else "general programming",
        "experience": experience or 0,
        "question_number": question_number,
        "history_block": history_block,
        "already_asked_block": already_asked_block,
    })

    raw = result.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    parsed = json.loads(raw)
    q_type = parsed.get("type", "hr" if question_number <= 5 else "technical")
    return {
        "question": parsed.get("question", ""),
        "type": q_type,
        "index": question_number,
    }


def get_brief_feedback(question: str, answer: str) -> str:
    """
    Generate one natural sentence of conversational feedback on the previous answer.
    """
    if not answer or answer.strip() in ("[No answer provided]", ""):
        return "Alright, let's move on."
    try:
        llm = _build_llm(temperature=0.8)
        chain = FEEDBACK_PROMPT | llm
        result = chain.invoke({"question": question, "answer": answer})
        return result.content.strip().strip('"').strip("'")
    except Exception:
        return "Thank you for that."


def evaluate_meet_interview(
    job_role: str,
    questions: list,
    answers: list,
) -> dict:
    """
    Evaluate all interview answers using Groq LLM.
    """
    llm = _build_llm(temperature=0)
    chain = EVALUATION_PROMPT | llm

    qa_lines = []
    for i, (q, a) in enumerate(zip(questions, answers), 1):
        q_type = q.get("type", "general").upper()
        q_text = q.get("question", "")
        a_text = a.strip() if a else "[No answer provided]"
        qa_lines.append(f"Q{i} ({q_type}): {q_text}\nAnswer: {a_text}")

    result = chain.invoke({
        "job_role": job_role or "Software Engineer",
        "qa_pairs": "\n\n".join(qa_lines),
    })

    raw = result.content.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    raw = raw.strip()

    evaluation = json.loads(raw)
    overall = evaluation.get("overall_score", 0)
    if "recommendation" not in evaluation:
        evaluation["recommendation"] = "selected" if overall >= 60 else "not_selected"
    evaluation["passed"] = evaluation["recommendation"] == "selected"
    evaluation["total_questions"] = len(questions)
    return evaluation


# Keep for backwards compatibility
def generate_meet_questions(job_role, job_description, skills, experience):
    """Legacy: generates all 10 questions at once."""
    questions = []
    history = []
    for i in range(1, 11):
        q = generate_next_question(job_role, job_description, skills, experience, i, history)
        questions.append(q)
        history.append({"question": q["question"], "type": q["type"], "answer": ""})
    return questions
