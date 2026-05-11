# Coaching SaaS MVP

Exam portal with blueprint-based exam generation, automated evaluation, and adaptive suggestions.

## Prerequisites

- Node.js 18+
- PostgreSQL

## Setup

### 1. Create the database

```bash
createdb coaching_saas
```

### 2. Create backend environment file

```bash
cp frontend/.env.example .env
```

Or create `.env` in the project root:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/coaching_saas
JWT_SECRET=replace-me
PORT=3030
```

### 3. Install dependencies

```bash
npm install
```

## Running Locally

Open two terminals:

**Terminal 1 — Backend:**
```bash
PORT=3030 npm run dev:backend
```

**Terminal 2 — Frontend:**
```bash
npm run dev:frontend
```

Frontend: http://localhost:5222  
Backend API: http://localhost:3030/api

## Seeded Login Accounts

| Role    | Email                    | Password   |
|---------|--------------------------|------------|
| Admin   | admin@coaching.local     | admin123   |
| Teacher | teacher@coaching.local   | teacher123 |
| Student | student@coaching.local   | student123 |

## Recent Enhancements

- **Smart Practice Builder**: Students can select multiple topics and filter by source (PYQ vs Reference) for self-generation.
- **AI Question Engine (STEM)**: Generate questions from PDFs with automatic source tagging and STEM formatting (LaTeX/SMILES).
- **Question Source Tagging**: Categorize content by source (PYQ, Reference, etc.) with visual badges in the bank and during exams.
- **Enhanced Security**: Role-based access control for API endpoints and persistent database seeding.

## MVP Flow

1. Log in as teacher/admin
2. Open **Exam Builder** → generate a live exam from the seeded blueprint or build a weighted paper.
3. Log in as student → open **Live Exam** → attempt questions and submit.
4. Review instant score, solutions, and weakest topics on the dashboard.
5. Use **Self-Practice Builder** to reinforce weak topics by selecting them specifically.
