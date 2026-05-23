import psycopg2
import psycopg2.extras
import os
from typing import Optional
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    return psycopg2.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "intervent"),
        user=os.getenv("POSTGRES_USER", "postgres"),
        password=os.getenv("POSTGRES_PASSWORD", ""),
    )


def create_candidates_table():
    """Create candidates table if it doesn't exist."""
    sql = """
    CREATE TABLE IF NOT EXISTS candidates (
        id          SERIAL PRIMARY KEY,
        candidate_id TEXT UNIQUE NOT NULL,
        job_id      TEXT NOT NULL,
        hr_uid      TEXT NOT NULL,
        hr_name     TEXT NOT NULL,
        full_name   TEXT,
        email       TEXT,
        phone       TEXT,
        skills      TEXT[],
        experience  NUMERIC(4,1),
        education   TEXT,
        resume_text TEXT,
        resume_path TEXT,
        job_role    TEXT,
        status      TEXT DEFAULT 'parsed',
        created_at  TIMESTAMP DEFAULT NOW()
    );
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    finally:
        conn.close()


def insert_candidate(data: dict) -> bool:
    """Insert a candidate record into PostgreSQL."""
    sql = """
    INSERT INTO candidates (
        candidate_id, job_id, hr_uid, hr_name,
        full_name, email, phone, skills,
        experience, education, resume_text,
        resume_path, job_role, status
    ) VALUES (
        %(candidate_id)s, %(job_id)s, %(hr_uid)s, %(hr_name)s,
        %(full_name)s, %(email)s, %(phone)s, %(skills)s,
        %(experience)s, %(education)s, %(resume_text)s,
        %(resume_path)s, %(job_role)s, %(status)s
    )
    ON CONFLICT (candidate_id) DO UPDATE SET
        full_name   = EXCLUDED.full_name,
        email       = EXCLUDED.email,
        phone       = EXCLUDED.phone,
        skills      = EXCLUDED.skills,
        experience  = EXCLUDED.experience,
        education   = EXCLUDED.education,
        resume_text = EXCLUDED.resume_text,
        resume_path = EXCLUDED.resume_path,
        job_role    = EXCLUDED.job_role,
        status      = EXCLUDED.status;
    """
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, data)
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"[DB ERROR] insert_candidate: {e}")
        return False
    finally:
        conn.close()


def get_candidates_by_job(job_id: str) -> list:
    """Fetch all candidates for a given job_id."""
    sql = "SELECT * FROM candidates WHERE job_id = %s ORDER BY created_at DESC;"
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, (job_id,))
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()
