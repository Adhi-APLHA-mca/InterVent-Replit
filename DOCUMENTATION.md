# InterVent — AI-Powered Interview & Recruitment Automation Platform
### Internship Project Documentation

---

## TABLE OF CONTENTS

| Sr. No | Topic | 
|--------|-------|
| 1 | **Introduction** |
| 1.1 | Introduction |
| 1.1.1 | Problem Definition |
| 1.1.2 | Objectives of Project |
| 1.1.3 | Scope of Project |
| 1.2 | Technical Details |
| 1.2.1 | Overview of the Front End |
| 1.2.2 | Overview of the Back End |
| 2 | **System Study and Planning** |
| 2.1 | System Study |
| 2.1.1 | Existing System |
| 2.1.2 | Disadvantages of Existing System |
| 2.1.3 | Proposed System |
| 2.2 | System Planning and Schedule |
| 2.2.1 | S/W Development Model |
| 2.2.2 | GANTT Chart |
| 3 | **System Design** |
| 3.1 | Software Requirement Specification (SRS) |
| 3.1.1 | Introduction of SRS |
| 3.1.2 | Technology Requirements |
| 3.1.2.1 | Hardware to be Used |
| 3.1.2.2 | Software / Tools to be Used |

---

## 1. INTRODUCTION

---

### 1.1 Introduction

In today's rapidly evolving corporate landscape, organizations of all sizes face an ever-growing challenge in managing the end-to-end recruitment process efficiently. The traditional hiring pipeline — which spans job posting, resume collection, screening, shortlisting, scheduling assessments, conducting technical rounds, and finally carrying out personal interviews — is largely manual, time-consuming, and prone to human bias. Recruitment teams in mid-to-large enterprises often receive hundreds or even thousands of applications for a single job opening, making it practically impossible to give every candidate a fair and thorough evaluation within a reasonable time frame.

**InterVent** is an intelligent, end-to-end recruitment automation platform designed to address these exact challenges. It leverages the power of modern Large Language Models (LLMs), real-time voice processing, and cloud-based infrastructure to automate the most labor-intensive stages of the recruitment process — from resume parsing and candidate screening all the way through to AI-driven voice interviews. The platform serves two primary user roles: **HR Managers**, who manage job postings and oversee the entire candidate pipeline, and **Students / Candidates**, who experience a streamlined, digital-first assessment and interview journey.

InterVent is built as a full-stack web application using a **React + Vite** frontend (TypeScript), a **FastAPI** Python backend powered by **LangChain** and **Groq's LLaMA 3.3 70B** language model, **Firebase Authentication and Firestore** for real-time data synchronization, and **PostgreSQL** for persistent candidate records. The platform is optimized for deployment on cloud environments such as Replit and can be set up locally with minimal configuration.

The name "InterVent" is derived from the combination of **"Interview"** and **"Intervention"** — the core philosophy that AI can intervene intelligently at every stage of the hiring funnel to make it smarter, faster, and fairer.

---

### 1.1.1 Problem Definition

The recruitment and hiring process in modern organizations is fundamentally broken in several key ways:

**1. Volume Overload:** A single job posting on major platforms like LinkedIn or Naukri can attract upwards of 500–2000 applications within a few days. Manually reviewing each resume, even at a rate of 5 minutes per resume, would consume hundreds of person-hours per role. This creates an inevitable bottleneck where the majority of applications are rejected based purely on surface-level filtering rather than genuine merit evaluation.

**2. Inconsistent Screening Criteria:** Human recruiters, despite best intentions, apply inconsistent evaluation standards across candidates. Factors such as fatigue, time of day, personal biases, and varying interpretations of job requirements lead to subjective screening decisions. Two equally qualified candidates might receive vastly different assessments from two different recruiters reviewing the same resumes.

**3. Delayed Time-to-Hire:** The multi-step nature of traditional hiring — posting, collecting, screening, scheduling, testing, interviewing — stretched across different teams and tools — results in an average time-to-hire of 23–45 days in India. This delay causes organizations to lose top talent to competitors who move faster, and leaves candidates frustrated with opaque, unresponsive pipelines.

**4. Lack of Structured Assessment:** Many organizations lack the infrastructure to conduct standardized technical assessments (MCQ, aptitude, DSA coding problems) at scale. This either results in under-testing candidates or relying on expensive third-party proctoring platforms.

**5. High Cost of Early-Stage Interviews:** Phone screening rounds conducted by HR personnel or technical staff are expensive in terms of time. A 15-minute phone screen multiplied by 100 candidates costs 25 person-hours — time better spent on shortlisted, higher-probability candidates.

**6. Poor Candidate Experience:** Candidates frequently report a lack of feedback, ghosting after applications, and impersonal, mechanical interaction with organizations during the hiring process. This negatively affects employer branding and candidate satisfaction.

InterVent is designed to solve all six of these problems through intelligent automation, data-driven screening, and a candidate-centric digital experience.

---

### 1.1.2 Objectives of Project

The InterVent platform is developed with the following clearly defined objectives:

**Primary Objectives:**

1. **Automate Resume Parsing and Profile Extraction:** Develop an AI agent capable of ingesting PDF resumes in bulk, extracting structured candidate profiles (name, email, phone, skills, experience, education), and storing them in a relational database without manual intervention.

2. **Implement Intelligent Candidate Screening:** Build an AI-powered screening agent that evaluates candidate profiles against a given job description and criteria, producing a binary shortlist/reject decision along with a structured justification for each candidate.

3. **Automate Candidate Communication:** Create an email automation agent that dispatches personalized, context-aware emails to screened candidates — notifying shortlisted candidates about next steps and providing rejection emails with constructive feedback to unsuccessful candidates.

4. **Deliver Structured Technical Assessments:** Provide a multi-format digital assessment system that includes Multiple Choice Questions (MCQ), Aptitude tests, and Data Structures & Algorithms (DSA) coding problems — all generated dynamically by LLM agents based on the job role and required skill set.

5. **Conduct AI-Powered Voice Interviews:** Implement a real-time voice interview system (Meet Agent) capable of generating contextual questions, listening to candidate responses via Web Speech API, providing natural conversational feedback, and producing a structured post-interview evaluation report.

6. **Provide HR Analytics Dashboard:** Give HR managers a comprehensive, real-time dashboard to monitor candidate pipeline status, track assessment results, schedule interviews, and make data-informed hiring decisions.

**Secondary Objectives:**

7. Ensure all AI-generated content is grounded, consistent, and job-specific by using structured prompt engineering and LangChain chains.
8. Enable real-time data synchronization across HR and candidate sessions using Firebase Firestore.
9. Design a responsive, accessible, and visually polished UI that works across devices.
10. Architect the system to be modular so that individual agents can be upgraded, replaced, or extended independently.

---

### 1.1.3 Scope of Project

The scope of the InterVent platform covers the following functional and technical boundaries:

**In Scope:**

- **Resume Upload and Parsing:** HR managers can upload multiple PDF resumes for a specific job opening. The system parses these using `pdfplumber` and sends the raw text through Agent 1 (Resume Extraction Agent) to extract structured candidate profiles.

- **Candidate Database Management:** All extracted candidate records are persisted in a PostgreSQL database and simultaneously synced to Firebase Firestore for real-time access by the HR dashboard.

- **AI Screening (Agent 2):** The platform performs automated screening of all candidates for a job, using configurable thresholds and job descriptions, and classifies each candidate as "Shortlisted" or "Rejected" with a reason.

- **Email Dispatch (Agent 3):** Automated personalized emails are sent to all screened candidates using SMTP (Gmail/any provider), informing them of their status and, for shortlisted candidates, their next steps in the process.

- **MCQ Assessment (Agent 4):** Dynamically generated multiple-choice question tests based on the candidate's job role and skills. The system evaluates answers and stores results in Firestore.

- **Aptitude Assessment (Agent 5):** Quantitative and logical reasoning questions generated by the LLM, evaluated automatically with score storage and result display.

- **DSA Coding Round (Agent 6):** Programming problems with visible and hidden test cases, in-browser code editor (Monaco Editor), automatic test case execution and evaluation, with results persisted per candidate.

- **AI Voice Interview (Agent 7 — Meet Agent):** A full voice-based interview interface with real-time speech recognition, TTS question delivery, per-answer natural feedback, and a final structured evaluation report with scores for HR and Technical segments.

- **HR Dashboard:** A management interface for posting jobs, uploading resumes, triggering screening and email agents, viewing candidate status in real-time, and managing interview scheduling.

- **Student Portal:** A candidate-facing portal showing available jobs, interview calls, assessment tests, and personal interview results.

**Out of Scope (for current version):**

- Video recording or proctoring of interviews
- Integration with third-party ATS (Applicant Tracking Systems) like Workday or Greenhouse
- Mobile native applications (iOS/Android)
- Background verification or reference checking
- Payroll or onboarding integration

---

### 1.2 Technical Details

---

### 1.2.1 Overview of the Front End

The InterVent frontend is developed as a modern **Single Page Application (SPA)** using **React 19** with **TypeScript** and bundled with **Vite 7**. The design philosophy prioritizes a clean, professional interface that adapts to both HR managerial workflows and candidate-facing assessment experiences.

**Framework and Build Tool:**

- **React 19** with functional components and hooks throughout. No class components are used. State is managed with `useState`, `useReducer`, `useCallback`, `useRef`, and `useEffect` — all standard React hooks.
- **Vite 7** is used as the build tool and development server. It provides near-instant HMR (Hot Module Replacement), making the development experience highly productive. The Vite dev server proxies all `/api/*` requests to the Python FastAPI backend on port 8000, eliminating CORS issues during development.
- **TypeScript** is used throughout the frontend for type safety. All component props, API response types, and state interfaces are explicitly typed.

**Styling:**

- **Tailwind CSS v4** is the utility-first CSS framework used for all styling. Rather than writing custom CSS, component styles are composed directly in JSX using Tailwind utility classes.
- **shadcn/ui** provides the design system — a collection of headless, accessible, and customizable UI components (buttons, dialogs, cards, tabs, forms, etc.) built on top of **Radix UI** primitives. All components follow WCAG accessibility standards.
- **Framer Motion** is used for declarative animations — page transitions, loading states, score reveal animations, and sound wave visualizations in the voice interview screen.

**Routing:**

- **Wouter** is used for client-side routing. It is a lightweight alternative to React Router with a similar API but a much smaller bundle size (~1.4 KB vs ~50 KB).
- The application has two separate route groups: `/` and `/register` (public, unauthenticated), `/dashboard/*` (HR manager routes), and `/student/*` (candidate routes).

**Authentication:**

- **Firebase Authentication** is used for user identity management. The `onAuthStateChanged` listener is used in all protected pages to verify the user's session before rendering content.
- JWT tokens from Firebase Auth are extracted with `user.getIdToken()` and sent as Bearer tokens in all API calls to the FastAPI backend, where they are verified server-side.

**State Management and Data Fetching:**

- **TanStack React Query v5** is used for server state management — caching, background refetching, and optimistic updates for API calls.
- Local component state is managed with React hooks. No global state management library (Redux, Zustand) is used, keeping the architecture simple and maintainable.
- **Firebase Firestore's `onSnapshot`** listeners are used in the HR dashboard and student portal for real-time updates — when a candidate's status changes server-side, the UI updates automatically without polling.

**Key Pages and Components:**

| Page | Route | Description |
|------|-------|-------------|
| Login | `/` | Email/password sign-in with Firebase |
| Register | `/register` | New account creation with role selection (HR / Student) |
| HR Dashboard | `/dashboard` | Main HR management hub |
| Interview Manager | `/dashboard/interview-manager` | Candidate pipeline, resume upload, screening controls |
| Interview Scheduler | `/dashboard/interview-scheduler` | Calendar and interview scheduling |
| Student Job Openings | `/student/jobs` | Browse available positions |
| Student Interview Calls | `/student/calls` | View scheduled assessments |
| MCQ Assessment | `/student/assessment` | Multiple choice test interface |
| Aptitude Test | `/student/aptitude` | Aptitude reasoning test |
| DSA Round | `/student/dsa` | Monaco code editor + test case runner |
| Voice Interview | `/student/meet-interview` | Real-time AI voice interview |
| Results Pages | `/student/*-results` | Post-assessment evaluation display |

---

### 1.2.2 Overview of the Back End

The InterVent backend is a **Python-based dual-server architecture** — a **FastAPI** application handling all AI agent workloads and a **Flask** application providing core authentication and profile management routes. Both run as separate processes and are accessed by the frontend via the Vite dev server proxy.

**FastAPI Application (Port 8000):**

The primary backend server is built with **FastAPI**, chosen for its high performance (ASGI-based, async-capable), automatic OpenAPI documentation generation, and excellent support for modern Python type annotations with Pydantic.

The FastAPI application is structured around seven AI agents, each implemented as an independent Python module under `backend/resume_agent/`:

| Agent | Module | Responsibility |
|-------|--------|----------------|
| Agent 1 — Resume Extractor | `agent.py` | Parses raw resume text into structured JSON profile |
| Agent 2 — Screening Agent | `screening_agent.py` | Shortlists or rejects candidates based on job criteria |
| Agent 3 — Email Agent | `email_agent.py` | Sends personalized SMTP emails to candidates |
| Agent 4 — Assessment Agent | `assessment_agent.py` | Generates and evaluates MCQ questions |
| Agent 5 — Aptitude Agent | `aptitude_agent.py` | Generates and evaluates aptitude questions |
| Agent 6 — DSA Agent | `dsa_agent.py` | Generates DSA problems with test cases, evaluates code |
| Agent 7 — Meet Agent | `meet_agent.py` | Conducts and evaluates AI voice interviews |

**LangChain and Groq LLM:**

All AI agents are built using **LangChain** chains with **ChatGroq** as the LLM provider. The model used is `llama-3.3-70b-versatile` — Groq's hosted version of Meta's LLaMA 3.3 70B parameter model, accessed via the Groq API. Groq's inference infrastructure provides extremely low-latency responses (typically under 1–2 seconds), making it suitable for real-time interactive use cases like the voice interview.

Each agent follows the LangChain pattern of:
```
ChatPromptTemplate → ChatGroq LLM → String output → JSON parse
```

System prompts are carefully engineered to produce consistent, structured JSON outputs that are then parsed and used by the API endpoints.

**Database Layer:**

- **PostgreSQL** (via `psycopg2-binary`) stores structured candidate records in a `candidates` table. The schema includes fields for candidate ID, job ID, HR UID, personal details, skills array, experience, education, resume text, and current pipeline status.
- **Firebase Firestore** is used as a real-time NoSQL data layer for job metadata and candidate status updates that need to be reflected instantly in the HR dashboard.
- **Firebase Admin SDK** is initialized server-side with a service account credential for token verification and Firestore operations.

**Flask Application (Port 5001):**

A secondary Flask server handles user authentication flows — registration (saving role and profile data after Firebase creates the account) and profile retrieval. It validates Firebase ID tokens on every request using `firebase_auth.verify_id_token()`.

**Key API Endpoints:**

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/resumes/upload` | Upload PDF resumes for a job opening |
| GET | `/api/resumes/health` | Backend health check |
| GET | `/api/resumes/job/{job_id}` | Get all candidates for a job |
| POST | `/api/screening/run` | Run screening agent on all candidates |
| POST | `/api/emails/send` | Dispatch emails to screened candidates |
| POST | `/api/assessment/generate` | Generate MCQ questions for a candidate |
| POST | `/api/assessment/evaluate` | Evaluate MCQ answers |
| POST | `/api/aptitude/generate` | Generate aptitude questions |
| POST | `/api/aptitude/evaluate` | Evaluate aptitude answers |
| POST | `/api/dsa/generate` | Generate DSA problem with test cases |
| POST | `/api/dsa/evaluate` | Run code against test cases |
| POST | `/api/meet/generate` | Initialize voice interview session |
| POST | `/api/meet/next` | Get next interview question |
| POST | `/api/meet/submit` | Submit all answers and get evaluation |

---

## 2. SYSTEM STUDY AND PLANNING

---

### 2.1 System Study

---

### 2.1.1 Existing System

To understand the gap that InterVent aims to fill, it is essential to examine the existing recruitment systems and tools currently in use by organizations and HR departments. The existing landscape can be broadly categorized into three tiers:

**Tier 1 — Manual/Traditional Process:**
The most prevalent recruitment approach in small and medium enterprises (SMEs) in India involves posting jobs on portals like Naukri.com, LinkedIn, or Shine.com, collecting email applications, manually reviewing resumes in Word/PDF format, shortlisting candidates in Excel spreadsheets, calling shortlisted candidates for phone screens, scheduling in-person or video interviews via email/WhatsApp, and maintaining offer/rejection status in spreadsheets or informal tracking documents.

This process is entirely manual and relies on individual HR personnel to perform each step. There is no centralization, no automation, and no intelligence applied to any stage of the funnel.

**Tier 2 — Applicant Tracking Systems (ATS):**
Larger organizations use commercial ATS platforms such as **Workday**, **Greenhouse**, **Lever**, **Zoho Recruit**, or **Freshteam**. These platforms digitize the administrative layer of recruitment — tracking applicants, managing job postings, setting up interview stages, and collaborating across hiring teams.

However, traditional ATS platforms suffer from significant limitations:
- They are fundamentally **workflow management tools**, not intelligence platforms. They track candidate state but do not make any intelligent decisions.
- Resume screening in most ATS is limited to **keyword matching** — candidates with the right buzzwords pass the filter regardless of actual competence.
- They do not conduct assessments, technical tests, or interviews. These must be handled by external integrations (HackerRank, Mercer Mettl, etc.) at additional cost.
- They are **expensive** — Workday and Greenhouse enterprise plans cost thousands of dollars per month, making them inaccessible for SMEs and startups.
- The candidate experience is poor — most ATS portals are outdated in design and provide little feedback to candidates about where they stand in the process.

**Tier 3 — Point Solutions:**
Organizations sometimes stitch together multiple point solutions — using a separate assessment platform (HackerRank for coding, Mercer Mettl for aptitude), a separate video interview tool (HireVue, Zoom), and a separate ATS. This fragmented stack creates data silos, integration challenges, and inconsistent candidate experiences.

**AI-Augmented Tools (Emerging):**
A few newer tools like **HireVue AI**, **Eightfold.ai**, and **Paradox (Olivia)** have begun incorporating AI into specific recruitment stages. HireVue, for example, offers AI video interview analysis. However, these tools:
- Are extremely expensive (enterprise pricing, often $50,000+ annually)
- Are black-box AI systems with no transparency into decision-making
- Cover only one or two stages of the pipeline
- Are not accessible or configurable by startups or academic institutions

---

### 2.1.2 Disadvantages of Existing System

Based on the study of existing systems described above, the following critical disadvantages have been identified:

**1. Extreme Time Consumption:**
The manual resume review process at most organizations takes 2–5 minutes per resume. With hundreds of applicants per role, this translates to days of non-productive work. Even with ATS keyword filtering, HR managers spend significant time reviewing filtered candidates one by one without any intelligent prioritization.

**2. Subjectivity and Bias:**
Human evaluation is inherently subjective. Research consistently shows that resumes with certain names, educational institutions, or formatting styles receive preferential treatment. Existing ATS keyword filters can codify and amplify these biases by simply reflecting what a hiring manager has previously valued. There is no objective, criteria-based evaluation in any widely-used tool.

**3. Fragmented and Expensive Toolchain:**
Organizations that want comprehensive coverage — ATS + assessments + interviews — must purchase and integrate multiple platforms. Integration between tools is rarely seamless, data does not flow consistently, and the total cost of ownership is prohibitive. A startup hiring 20 engineers per year cannot justify $50,000+ in recruitment tooling.

**4. No Real-Time Pipeline Visibility:**
Traditional ATS platforms require manual updates at each stage. If a candidate completes an assessment, the HR manager does not know until someone manually updates the record. There is no real-time synchronization between candidate actions and HR visibility.

**5. Poor Assessment Quality:**
Keyword-matched resume filters do not assess actual competence. Fixed question-bank assessments used on platforms like Mettl are susceptible to leakage and memorization. There is no personalization — every candidate for a given role receives identical questions regardless of their individual profile and background.

**6. Inadequate Candidate Experience:**
Most candidates describe the recruitment process as a "black box" — they apply, occasionally receive automated email acknowledgments, and either never hear back or receive a generic rejection weeks later. There is no transparency, no feedback, and no interactive engagement that helps candidates improve or understand where they stand.

**7. Inability to Scale:**
When hiring volumes increase (campus recruitment drives, seasonal hiring), manual systems collapse entirely. Organizations resort to either hiring more HR staff (expensive) or lowering screening standards (counter-productive). There is no elastic, scalable solution available at reasonable cost.

**8. No Integrated Voice/Conversational Assessment:**
None of the common tools available to mid-market organizations offer an AI-conducted voice interview that can evaluate communication skills, articulation, and domain knowledge simultaneously in a conversational format. HireVue offers this at enterprise cost — nothing is available for SMEs and educational institutions.

---

### 2.1.3 Proposed System

InterVent proposes a fully integrated, AI-driven recruitment platform that replaces the fragmented, manual, and expensive existing systems with a single, cohesive solution that is intelligent, real-time, accessible, and cost-effective.

**Core Proposition:**

The proposed system automates the following recruitment stages sequentially, forming an end-to-end pipeline:

```
Resume Upload → AI Parsing → Candidate Database → AI Screening → Email Notifications 
→ MCQ Assessment → Aptitude Test → DSA Coding Round → AI Voice Interview → Final Evaluation
```

Each stage is handled by a dedicated AI agent, ensuring separation of concerns, independent upgradability, and specialized optimization per task.

**Key Features of the Proposed System:**

**1. Bulk Resume Ingestion and AI Parsing:**
HR managers can upload multiple PDF resumes simultaneously for a specific job opening. The system uses `pdfplumber` to extract raw text and then feeds it through Agent 1 (a LangChain + Groq chain) which extracts a structured candidate profile including full name, email, phone number, listed skills, years of experience, and educational background. This process runs in a background thread, allowing the HR manager to continue working while resumes are being processed.

**2. Dual-Database Persistence:**
Every extracted candidate record is written to both PostgreSQL (for reliable, queryable relational storage) and Firebase Firestore (for real-time access by the HR dashboard). This dual-write ensures durability and real-time responsiveness simultaneously.

**3. Intelligent AI Screening:**
Agent 2 reads all candidate profiles for a job from the database and evaluates each one against the job description and configurable criteria. Rather than simple keyword matching, the LLM evaluates contextual fitness — a candidate with 3 years of "backend development" experience is relevant for a "Node.js Engineer" role even if the exact phrase "Node.js" doesn't appear, if their skills include JavaScript and Express. Each screening decision is accompanied by a structured reason.

**4. Automated Personalized Email Communication:**
Agent 3 generates personalized email content for each candidate based on their name, status, and job title, and dispatches it via SMTP. Shortlisted candidates receive instructions on the next steps. Rejected candidates receive a constructive email acknowledging their application.

**5. Dynamic Assessment Generation:**
Unlike fixed question banks, Agents 4, 5, and 6 generate assessment content dynamically using the candidate's job role and skill profile. This means two candidates applying for different roles will receive contextually appropriate questions. DSA problems include both visible (example) test cases and hidden test cases evaluated server-side for anti-cheating.

**6. Real-Time AI Voice Interview:**
Agent 7 conducts a fully interactive, conversational voice interview. The system generates questions one at a time (not all upfront) in a contextually aware manner — each question can build on the candidate's previous response. The candidate responds via Web Speech API (microphone), their transcript is captured, the AI provides brief natural feedback after each answer, and a comprehensive evaluation report is generated at the end covering HR behavioral scores, technical domain scores, strengths, improvement areas, and an overall recommendation.

**7. HR Dashboard with Real-Time Updates:**
The HR dashboard uses Firestore `onSnapshot` listeners to display live updates as candidates progress through stages. Managers can see candidate counts, status distributions, and individual profiles without refreshing the page.

**Advantages of the Proposed System over Existing Systems:**

| Parameter | Existing System | InterVent |
|-----------|----------------|-----------|
| Resume Screening | Manual / Keyword | AI-driven contextual evaluation |
| Time to Screen 100 Resumes | 5–8 hours | Under 3 minutes |
| Assessment Type | Generic / Fixed | Dynamic, role-specific |
| Interview | Human phone screen | AI voice interview (24/7) |
| Candidate Communication | Manual email | Automated, personalized |
| Real-time Visibility | None | Full Firestore sync |
| Cost | $50,000+/year (enterprise) | Open-source, API costs only |
| Bias | Inherent human bias | Criteria-based LLM evaluation |
| Scalability | Limited by headcount | Horizontally scalable |

---

### 2.2 System Planning and Schedule

---

### 2.2.1 S/W Development Model

The InterVent project was developed using the **Agile Software Development Model**, specifically following an informal **Scrum-inspired iterative process** adapted for a solo/small-team internship context.

**Why Agile Was Chosen:**

The Agile model was selected for the following reasons specific to this project:

1. **Evolving Requirements:** The exact feature set and agent behaviors were not fully defined at the project's outset. As development progressed and the LLM capabilities were explored, new requirements and refinements emerged — for instance, the shift from pre-generating all interview questions to generating them one-at-a-time contextually. Agile accommodates such changes naturally.

2. **Incremental Delivery:** Rather than building all seven agents simultaneously and integrating at the end (Waterfall approach), each agent was developed, tested, and integrated independently. This allowed for early testing of each pipeline stage and reduced integration risk.

3. **Rapid Feedback Loops:** Working software was available from the early iterations (basic resume upload and parsing), allowing stakeholders to provide feedback before the full system was built.

4. **Risk Mitigation:** High-risk components (LLM output consistency, real-time voice processing) were prototyped early and refined iteratively, reducing the chance of fundamental design failures discovered late in the project.

**Development Phases:**

The project was executed in the following iterative phases:

**Phase 1 — Foundation and Setup (Week 1–2):**
- Project architecture design
- Tech stack selection and environment setup
- Firebase project configuration (Auth, Firestore)
- Database schema design (PostgreSQL candidates table)
- Basic React app scaffold with routing and authentication

**Phase 2 — Core Backend Agents (Week 3–5):**
- Agent 1: Resume parsing and profile extraction
- FastAPI server setup with CORS and Firebase token verification
- PostgreSQL + Firestore dual-write integration
- Agent 2: Screening agent with LangChain chain

**Phase 3 — Communication and Assessment Layer (Week 6–8):**
- Agent 3: Email automation with SMTP
- Agent 4: MCQ assessment generator and evaluator
- Agent 5: Aptitude test generator and evaluator
- Frontend assessment pages (MCQ, Aptitude UI)

**Phase 4 — DSA and Voice Interview (Week 9–11):**
- Agent 6: DSA problem generator with hidden test case execution
- Monaco Editor integration for in-browser coding
- Agent 7: Meet Agent with per-question generation and evaluation
- Voice interview UI with Web Speech API integration

**Phase 5 — Integration, Polish and Deployment (Week 12–13):**
- Full end-to-end pipeline testing
- HR dashboard refinements
- Bug fixing (speech recognition interim capture, partial answer submission)
- Deployment to Replit cloud environment
- Documentation

**Agile Principles Applied:**

- **Working software over comprehensive documentation:** Functional agents were prioritized over writing extensive documentation during development cycles.
- **Responding to change over following a plan:** The DSA agent's hidden test case architecture was redesigned mid-development based on security requirements identified during testing.
- **Continuous improvement:** Each agent's prompt engineering was iteratively refined based on output quality testing across diverse job roles and candidate profiles.

---

### 2.2.2 GANTT Chart

*Note: The following Gantt chart is represented in tabular format.*

| Task | Week 1 | Week 2 | Week 3 | Week 4 | Week 5 | Week 6 | Week 7 | Week 8 | Week 9 | Week 10 | Week 11 | Week 12 | Week 13 |
|------|--------|--------|--------|--------|--------|--------|--------|--------|--------|---------|---------|---------|---------|
| Requirements Analysis | ██ | ██ | | | | | | | | | | | |
| Architecture Design | | ██ | ██ | | | | | | | | | | |
| Firebase + DB Setup | | ██ | ██ | | | | | | | | | | |
| Frontend Scaffold + Auth | | | ██ | ██ | | | | | | | | | |
| Agent 1 — Resume Parser | | | | ██ | ██ | | | | | | | | |
| FastAPI Server Setup | | | | ██ | ██ | | | | | | | | |
| Agent 2 — Screening | | | | | ██ | ██ | | | | | | | |
| Agent 3 — Email | | | | | | ██ | ██ | | | | | | |
| Agent 4 — MCQ | | | | | | | ██ | ██ | | | | | |
| Agent 5 — Aptitude | | | | | | | ██ | ██ | | | | | |
| Agent 6 — DSA | | | | | | | | | ██ | ██ | | | |
| Agent 7 — Meet/Voice | | | | | | | | | | ██ | ██ | | |
| HR Dashboard UI | | | ██ | ██ | ██ | ██ | ██ | ██ | | | | ██ | |
| Student Portal UI | | | | | ██ | ██ | ██ | ██ | ██ | ██ | | ██ | |
| Integration Testing | | | | | | | | | | | ██ | ██ | |
| Bug Fixing + Polish | | | | | | | | | | | | ██ | ██ |
| Deployment | | | | | | | | | | | | | ██ |
| Documentation | | | | | | | | | | | | ██ | ██ |

---

## 3. SYSTEM DESIGN

---

### 3.1 Software Requirement Specification (SRS)

---

### 3.1.1 Introduction of SRS

A **Software Requirement Specification (SRS)** document is a formal description of the intended behavior of a software system. It serves as a blueprint that guides developers during implementation, provides a reference for testing and validation, and acts as a contractual document between developers and stakeholders. The SRS for InterVent defines the system's functional requirements, non-functional requirements, hardware and software dependencies, and the constraints within which the system must operate.

**Purpose of This SRS:**

This SRS document serves the following purposes for the InterVent project:

1. To provide a complete and unambiguous description of what the system shall do (functional requirements) and how well it shall do it (non-functional requirements).
2. To serve as the primary reference during development, ensuring that all implemented features align with the original requirements.
3. To establish the technical environment — hardware and software — required to develop, deploy, and operate the system.
4. To define the system's external interfaces — user interfaces, API interfaces, and database interfaces.
5. To identify system constraints, assumptions, and dependencies that may affect design or implementation decisions.

**Scope of the SRS:**

This SRS covers the complete InterVent platform, including the React + TypeScript frontend SPA, the FastAPI Python backend with all seven AI agents, the Flask authentication server, the Firebase integration (Auth + Firestore), the PostgreSQL database layer, and the deployment configuration.

**Overview of Functional Requirements:**

The system shall provide the following core functional capabilities:

*For HR Manager Users:*
- FR-001: The system shall allow HR managers to register and log in using email/password via Firebase Authentication.
- FR-002: The system shall allow HR managers to create new job openings with title and description.
- FR-003: The system shall allow HR managers to upload one or more PDF resume files for a specific job opening.
- FR-004: The system shall parse uploaded resumes and extract candidate profiles automatically within a reasonable processing time.
- FR-005: The system shall allow HR managers to trigger AI screening for all parsed candidates of a job.
- FR-006: The system shall allow HR managers to trigger bulk email dispatch to all screened candidates.
- FR-007: The system shall display a real-time candidate pipeline dashboard showing counts and statuses.
- FR-008: The system shall allow HR managers to view individual candidate profiles, screening results, assessment scores, and interview evaluations.
- FR-009: The system shall allow HR managers to schedule interview calls for shortlisted candidates.

*For Student/Candidate Users:*
- FR-010: The system shall allow candidates to register and log in using email/password via Firebase Authentication.
- FR-011: The system shall display a list of job openings relevant to the candidate's profile.
- FR-012: The system shall allow candidates to view and manage their scheduled interview calls.
- FR-013: The system shall serve a dynamically generated MCQ assessment to the candidate and evaluate their answers.
- FR-014: The system shall serve a dynamically generated Aptitude assessment to the candidate and evaluate their answers.
- FR-015: The system shall serve a dynamically generated DSA coding problem to the candidate, accept code submissions, run them against test cases, and return results.
- FR-016: The system shall conduct a fully interactive AI voice interview session with the candidate, capturing voice responses and generating a post-interview evaluation report.
- FR-017: The system shall display detailed results for each completed assessment to the candidate.

**Overview of Non-Functional Requirements:**

- NFR-001 **Performance:** The system shall generate AI responses within 5 seconds on average under normal network conditions using the Groq API.
- NFR-002 **Reliability:** The system shall gracefully handle API failures and LLM errors without crashing — all agent calls are wrapped in try/except blocks with fallback behaviors.
- NFR-003 **Scalability:** The FastAPI backend uses async capability and threading for background operations (resume processing) to handle multiple concurrent HR sessions.
- NFR-004 **Security:** All backend API endpoints require a valid Firebase ID token. The DSA agent strips hidden test cases from client responses to prevent cheating. Firebase service account credentials are never exposed to the frontend.
- NFR-005 **Usability:** The user interface shall be responsive and usable on desktop browsers. The voice interview shall be supported on Chrome with Web Speech API.
- NFR-006 **Maintainability:** Each AI agent is implemented as an independent module, allowing individual agents to be updated without affecting others. LangChain chains are defined with explicit prompt templates for easy modification.

---

### 3.1.2 Technology Requirements

---

### 3.1.2.1 Hardware to be Used

The InterVent platform is designed as a cloud-native web application and does not require any specialized hardware beyond standard development and deployment infrastructure. The following hardware specifications are recommended for development, testing, and production environments:

**Development Machine (Minimum Specifications):**

| Component | Minimum Specification | Recommended Specification |
|-----------|----------------------|--------------------------|
| Processor | Intel Core i5 (8th Gen) / AMD Ryzen 5 | Intel Core i7 (10th Gen+) / AMD Ryzen 7 |
| RAM | 8 GB DDR4 | 16 GB DDR4 |
| Storage | 256 GB SSD | 512 GB SSD |
| Network | 10 Mbps broadband | 50+ Mbps broadband |
| Operating System | Windows 10 / Ubuntu 20.04 / macOS 11 | Windows 11 / Ubuntu 22.04 / macOS 13 |
| Browser | Chrome 90+ | Chrome 120+ (for Web Speech API) |
| Microphone | Any standard microphone | USB or 3.5mm headset microphone |

**Note on Microphone:** A working microphone is required for the AI voice interview (Meet Agent) feature. The Web Speech API uses the system's default audio input device. A dedicated headset microphone is recommended for cleaner speech recognition results compared to built-in laptop microphones.

**Server/Deployment Environment (Replit Cloud):**

InterVent is deployed on **Replit's Autoscale deployment** infrastructure, which provides:

| Resource | Specification |
|----------|---------------|
| CPU | Shared vCPU (scales automatically) |
| RAM | Up to 4 GB (development), autoscaled in production |
| Storage | Persistent repl storage + PostgreSQL database |
| Network | 1 Gbps uplink, global CDN |
| OS | NixOS (Linux-based) |
| Python Runtime | Python 3.11 |
| Node.js Runtime | Node.js 24 |

**Hardware NOT Required:**

- No dedicated GPU is required. All LLM inference is handled by Groq's cloud API (which uses custom ASIC hardware on their end).
- No on-premise servers are required. The system is fully cloud-hosted.
- No biometric or proctoring hardware is required in the current version.

**Client Hardware Requirements (End Users):**

| Requirement | Minimum |
|-------------|---------|
| Device | Desktop PC, Laptop |
| RAM | 4 GB |
| Browser | Google Chrome 90+ |
| Internet | 5 Mbps (stable) |
| Microphone | Required for voice interview |
| Camera | Optional (camera feed is local-only for UI, not recorded) |

---

### 3.1.2.2 Software / Tools to be Used

The following software tools, frameworks, libraries, and services are used in the development and deployment of InterVent:

**Frontend Technologies:**

| Tool/Library | Version | Purpose |
|-------------|---------|---------|
| React | 19.x | Core UI framework |
| TypeScript | 5.9.x | Static typing for JavaScript |
| Vite | 7.x | Build tool and dev server |
| Tailwind CSS | 4.x | Utility-first CSS styling |
| shadcn/ui | Latest | Component design system (Radix UI-based) |
| Framer Motion | 12.x | Declarative animations |
| Wouter | 3.x | Client-side SPA routing |
| TanStack Query | 5.x | Server state management and caching |
| Firebase SDK | 11.x | Client-side Auth and Firestore |
| Monaco Editor | 4.x | In-browser code editor for DSA round |
| Recharts | 2.x | Chart components for dashboard analytics |
| React Hook Form | 7.x | Form state management |
| Zod | 3.x | Schema validation |
| Lucide React | Latest | Icon library |
| Sonner | 2.x | Toast notification system |
| pnpm | 10.x | Fast, disk-efficient package manager |

**Backend Technologies (Python):**

| Tool/Library | Version | Purpose |
|-------------|---------|---------|
| Python | 3.11 | Core language runtime |
| FastAPI | 0.115.x | High-performance ASGI web framework |
| Uvicorn | 0.32.x | ASGI server for FastAPI |
| Flask | 3.1.x | WSGI server for auth routes |
| flask-cors | 5.0.x | CORS middleware for Flask |
| LangChain | 0.3.x | LLM orchestration framework |
| LangChain-Groq | 0.3.x | Groq LLM provider integration |
| LangChain-Core | 0.3.x | Core LangChain abstractions |
| Groq API | Via SDK | LLaMA 3.3 70B inference |
| Firebase Admin SDK | 6.6.x | Server-side Firebase operations |
| psycopg2-binary | 2.9.x | PostgreSQL database adapter |
| pdfplumber | 0.11.x | PDF text extraction for resumes |
| python-multipart | 0.0.12 | Multipart form data (file uploads) |
| python-dotenv | 1.0.x | Environment variable management |
| httpx | Latest | Async HTTP client |
| numpy | 2.x | Numerical operations |

**Database and Cloud Services:**

| Service | Purpose |
|---------|---------|
| PostgreSQL (Replit) | Relational database for candidate records |
| Firebase Authentication | User identity management (email/password) |
| Firebase Firestore | Real-time NoSQL database for live dashboard |
| Firebase Realtime Database | Optional real-time data (supplementary) |
| Groq Cloud API | LLM inference (LLaMA 3.3 70B) |
| SMTP (Gmail/Any) | Email dispatch for candidate notifications |

**Development Tools:**

| Tool | Purpose |
|------|---------|
| Visual Studio Code | Primary code editor |
| Git | Version control |
| GitHub | Remote repository and collaboration |
| Replit | Cloud development and deployment environment |
| Postman | API testing and documentation |
| Chrome DevTools | Frontend debugging |
| Python `pip` | Python package management |

**Key Environment Variables Required:**

| Variable | Description |
|----------|-------------|
| `GROQ_API_KEY` | API key for Groq LLM service |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin SDK credential JSON |
| `FIREBASE_DATABASE_URL` | Firebase Realtime Database URL |
| `VITE_FIREBASE_API_KEY` | Firebase client SDK API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project identifier |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Cloud Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase application ID |
| `DATABASE_URL` | PostgreSQL connection string |
| `SMTP_USER` | Email address for sending notifications |
| `SMTP_PASSWORD` | Email account password / app password |

---

## LOCAL SETUP GUIDE

### Prerequisites
- Node.js 20+ and pnpm (`npm install -g pnpm`)
- Python 3.11
- Git

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd intervent
pnpm install
cd artifacts/intervent && pnpm install && cd ../..
pip install -r artifacts/intervent/backend/requirements.txt
```

### 2. Configure Environment

Create `artifacts/intervent/backend/.env`:
```
GROQ_API_KEY=your_groq_api_key
FIREBASE_DATABASE_URL=https://your-project.firebaseio.com
SMTP_USER=your_email@gmail.com
SMTP_PASSWORD=your_app_password
DATABASE_URL=postgresql://user:password@localhost:5432/intervent
```

Place Firebase service account at:
```
artifacts/intervent/backend/serviceAccountKey.json
```

Create `artifacts/intervent/.env.local`:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FASTAPI_URL=http://localhost:8000
```

### 3. Run Everything with One Command

```bash
npm run dev
```

This starts both the frontend (port 5000) and the FastAPI backend (port 8000) simultaneously.

Open `http://localhost:5000` in Chrome.

---

*Document prepared as part of Internship Project Black Book*  
*InterVent — AI-Powered Interview & Recruitment Automation Platform*
