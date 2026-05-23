#!/bin/bash
cd "$(dirname "$0")"
echo "Starting InterVent Resume Processing Service (FastAPI)..."
uvicorn fastapi_app:app --host 0.0.0.0 --port 8000 --reload
