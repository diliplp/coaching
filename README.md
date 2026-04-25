# Coaching SaaS MVP

This repo now includes a working exam-portal MVP with:

- `backend`: Express + TypeScript API with PostgreSQL-backed persistence, seeded academic hierarchy, auth, blueprint-based exam generation, automated evaluation, and PDF subject-book parsing
- `frontend`: React + Vite app with login, protected routes, dashboard, question bank, exam builder, subject-book management, and live exam experience

## MVP Flow

1. Open the Exam Builder page
2. Generate a live exam from the seeded blueprint
3. Open the Live Exam page
4. Attempt questions and submit
5. Review instant score and weakest topics

## Run

```bash
npm install
PORT=3030 npm run dev:backend
npm run dev:frontend
```

## Backend Environment

The backend now expects PostgreSQL.

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/coaching_saas
JWT_SECRET=replace-me
PORT=3030
```

If the database does not exist yet:

```bash
createdb coaching_saas
```

## Seeded Login Accounts

- `admin@coaching.local` / `admin123`
- `teacher@coaching.local` / `teacher123`
- `student@coaching.local` / `student123`

## Frontend API Config

For local development, the frontend uses Vite proxying so `/api` and `/uploads` resolve to the backend on `http://localhost:3030`.

For deployed environments, set:

```bash
VITE_API_BASE_URL=/api
VITE_PUBLIC_ASSET_BASE_URL=
```

If your backend is hosted on a different public origin, point these variables at that public URL instead of `localhost`.

## PDF Book Parsing

Teacher/admin users can upload subject PDF books from the `Subject Books` page. The backend stores:

- file metadata
- page count
- extracted text
- preview text for the UI

## Reference Papers

If you place exam papers inside the project-level `books-papers` directory, the app now exposes them in the `Subject Books` page as reference PDFs for teachers.

## Adaptive Suggestions

Students now get an auto-suggested adaptive practice card directly on the dashboard once they have at least one past submission. They can start their personalized improvement test from there.
