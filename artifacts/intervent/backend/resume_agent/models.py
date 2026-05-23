from pydantic import BaseModel, Field
from typing import List, Optional


class CandidateProfile(BaseModel):
    full_name: str = Field(default="Unknown", description="Full name of the candidate")
    email: str = Field(default="", description="Email address")
    phone: str = Field(default="", description="Phone number")
    skills: List[str] = Field(default_factory=list, description="List of technical and soft skills")
    experience: float = Field(default=0.0, description="Total years of experience as a number")
    education: str = Field(default="", description="Highest education qualification")
    job_role: str = Field(default="", description="Most recent or target job role")
    resume_text: str = Field(default="", description="Full raw resume text")
    resume_path: str = Field(default="", description="Local path to the stored PDF file")
    candidate_id: str = Field(default="", description="Unique candidate ID")
    status: str = Field(default="parsed", description="Processing status")
