"""
DSA Agent — Stage 3 Coding Round
==================================
Generates 3 DSA problems of increasing difficulty with starter code and test cases.
Hidden test cases are stored server-side and NEVER sent to the client.
Code execution uses the Piston API (https://emkc.org/api/v2/piston).
"""
import os
import json
import re
import httpx
import asyncio
from typing import List
from dotenv import load_dotenv
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()

PISTON_URL = "https://emkc.org/api/v2/piston/execute"

LANGUAGE_MAP = {
    "python":     {"language": "python",     "version": "3.10.0"},
    "javascript": {"language": "javascript", "version": "18.15.0"},
    "java":       {"language": "java",        "version": "15.0.2"},
    "cpp":        {"language": "c++",         "version": "10.2.0"},
}


PROBLEM_GEN_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        """You are a senior software engineer designing a 3-problem DSA coding round.
Generate exactly 3 problems: one Easy, one Medium, one Hard — in that order.

Each problem must:
- Have a clear, self-contained description (no external references)
- Specify exact input format (read from stdin) and output format (print to stdout)
- Have 2 sample_test_cases (visible to candidate) and 4 hidden_test_cases
- Include working Python starter code that reads from input() and prints the answer
- Include working JavaScript starter code using readline
- Be solvable with standard DSA techniques (no external libraries needed)
- Easy: O(n) or O(n log n) — arrays, strings, simple iteration
- Medium: trees, linked lists, hashmaps, binary search, O(n log n)–O(n²)
- Hard: dynamic programming, graphs, advanced data structures

IMPORTANT for test cases:
- input: exact string sent to stdin (use \\n for newlines within the string)
- expected_output: exact string printed to stdout (no trailing whitespace)
- All 4 hidden test cases must differ from sample test cases
- Cover edge cases in hidden test cases (empty input, single element, large values)

Return ONLY a valid JSON object with a single key "problems" containing an array of exactly 3 objects.
Each problem object must have these exact fields:
  title, difficulty, category, description, input_format, output_format,
  constraints (array of strings),
  sample_test_cases (array of 2 objects with: input, expected_output, description),
  hidden_test_cases (array of 4 objects with: input, expected_output, description),
  starter_code_python, starter_code_javascript

Do NOT include any text, explanation, or markdown before or after the JSON.""",
    ),
    (
        "human",
        """Job Role: {job_role}
Candidate Skills: {skills}

Generate 3 DSA problems tailored to this role. Make the Hard problem especially relevant to {job_role} skills.""",
    ),
])


def _build_llm(temperature: float = 0.2) -> ChatGroq:
    model_name = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    api_key = os.getenv("GROQ_API_KEY", "")
    if not api_key:
        raise EnvironmentError("GROQ_API_KEY is not set.")
    return ChatGroq(model=model_name, api_key=api_key, temperature=temperature)


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
    raise ValueError("Incomplete JSON object in LLM response")


def generate_dsa_problems(job_role: str, skills: list) -> List[dict]:
    """
    Generate 3 DSA problems (Easy, Medium, Hard).
    Returns full problem dicts including hidden_test_cases
    (strip hidden_test_cases before sending to client).
    """
    llm = _build_llm(temperature=0.3)
    chain = PROBLEM_GEN_PROMPT | llm

    response = chain.invoke({
        "job_role": job_role or "Software Engineer",
        "skills": ", ".join(skills) if skills else "Python, Algorithms",
    })
    raw = response.content if hasattr(response, "content") else str(response)

    data = _extract_json(raw)
    raw_problems = data.get("problems", [])

    problems = []
    for i, p in enumerate(raw_problems[:3]):
        p["problem_index"] = i
        problems.append(p)
    return problems


def strip_hidden_test_cases(problems: List[dict]) -> List[dict]:
    """Remove hidden_test_cases before sending to client."""
    safe = []
    for p in problems:
        s = {k: v for k, v in p.items() if k != "hidden_test_cases"}
        safe.append(s)
    return safe


async def run_code_piston(code: str, language: str, stdin: str = "", timeout_ms: int = 5000) -> dict:
    """
    Execute code via Piston API and return {stdout, stderr, exit_code}.
    """
    lang_config = LANGUAGE_MAP.get(language.lower(), LANGUAGE_MAP["python"])

    payload = {
        "language": lang_config["language"],
        "version": lang_config["version"],
        "files": [{"content": code}],
        "stdin": stdin,
        "run_timeout": timeout_ms,
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(PISTON_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()
            run = data.get("run", {})
            return {
                "stdout": run.get("stdout", "").strip(),
                "stderr": run.get("stderr", "").strip(),
                "exit_code": run.get("code", 0),
            }
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exit_code": 1}


async def evaluate_dsa_submission(
    problems: List[dict],
    submissions: List[dict],
) -> dict:
    """
    Evaluate all 3 DSA submissions against hidden test cases.

    submissions: [
      {"problem_index": 0, "code": "...", "language": "python"},
      ...
    ]

    Returns per-problem results and total score.
    """
    submission_map = {s["problem_index"]: s for s in submissions}
    per_problem = []
    total_score = 0
    max_score = 0

    difficulty_points = {"Easy": 1, "Medium": 2, "Hard": 3}

    for i, problem in enumerate(problems):
        difficulty = problem.get("difficulty", "Easy")
        points = difficulty_points.get(difficulty, 1)
        max_score += points

        sub = submission_map.get(i)
        if not sub or not sub.get("code", "").strip():
            per_problem.append({
                "problem_index": i,
                "title": problem.get("title", f"Problem {i + 1}"),
                "difficulty": difficulty,
                "submitted": False,
                "test_results": [],
                "passed_count": 0,
                "total_tests": len(problem.get("hidden_test_cases", [])),
                "score": 0,
                "max_score": points,
            })
            continue

        hidden_cases = problem.get("hidden_test_cases", [])
        test_results = []
        passed = 0

        tasks = [
            run_code_piston(sub["code"], sub.get("language", "python"), tc["input"])
            for tc in hidden_cases
        ]
        outputs = await asyncio.gather(*tasks)

        for tc, out in zip(hidden_cases, outputs):
            expected = tc.get("expected_output", "").strip()
            actual = out.get("stdout", "").strip()
            ok = (actual == expected) and (out.get("exit_code", 0) == 0)
            if ok:
                passed += 1
            test_results.append({
                "description": tc.get("description", ""),
                "passed": ok,
                "actual_output": actual[:500],
                "stderr": out.get("stderr", "")[:200],
            })

        problem_passed = passed == len(hidden_cases) and len(hidden_cases) > 0
        earned = points if problem_passed else (round(points * passed / len(hidden_cases), 1) if hidden_cases else 0)
        total_score += earned

        per_problem.append({
            "problem_index": i,
            "title": problem.get("title", f"Problem {i + 1}"),
            "difficulty": difficulty,
            "submitted": True,
            "test_results": test_results,
            "passed_count": passed,
            "total_tests": len(hidden_cases),
            "score": earned,
            "max_score": points,
        })

    percentage = round((total_score / max_score) * 100, 1) if max_score > 0 else 0
    passed_problems = sum(1 for p in per_problem if p.get("submitted") and p["passed_count"] == p["total_tests"] and p["total_tests"] > 0)

    if percentage >= 80:
        overall_feedback = f"Outstanding DSA performance! {passed_problems}/3 problems fully solved. Strong algorithmic thinking demonstrated."
    elif percentage >= 55:
        overall_feedback = f"Good DSA skills. {passed_problems}/3 problems fully solved. Some optimisation areas to work on."
    elif percentage >= 33:
        overall_feedback = f"Partial completion. {passed_problems}/3 problems fully solved. Continue practising medium/hard DSA problems."
    else:
        overall_feedback = f"Needs improvement. {passed_problems}/3 problems fully solved. Focus on fundamental data structures and algorithms."

    return {
        "per_problem": per_problem,
        "total_score": total_score,
        "max_score": max_score,
        "percentage": percentage,
        "passed": percentage >= 50,
        "passed_problems": passed_problems,
        "overall_feedback": overall_feedback,
    }
