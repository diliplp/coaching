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

## MVP Flow

1. Log in as teacher/admin
2. Open **Exam Builder** → generate a live exam from the seeded blueprint
3. Log in as student → open **Live Exam** → attempt questions and submit
4. Review instant score and weakest topics on the dashboard
