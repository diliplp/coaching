# Railway Deployment Plan

Railway is an excellent choice for this project because it supports:
1.  **Monorepos (Workspaces):** It will automatically detect your `package.json` and build commands.
2.  **Persistent Storage:** We can mount a volume for your `/uploads` and `books-papers` folders so data isn't lost on restart.
3.  **Managed Postgres:** High performance and easy setup.

## Step 1: Prepare the Repository
I will create a `railway.json` (optional but recommended for monorepos) to ensure it uses the correct build and start commands.

## Step 2: Database Setup (Manual in Railway UI)
1.  Go to [Railway.app](https://railway.app).
2.  Click **"New Project"** -> **"Provision PostgreSQL"**.
3.  Railway will provide a `DATABASE_URL`.

## Step 3: Deploy Service (Manual in Railway UI)
1.  Click **"New"** -> **"GitHub Repo"** -> Select `coaching`.
2.  In the service settings, add these **Environment Variables**:
    *   `NODE_ENV`: `production`
    *   `PORT`: `3030`
    *   `DATABASE_URL`: `${{Postgres.DATABASE_URL}}` (if using Railway's Postgres)
    *   `JWT_SECRET`: (Generate a random string)
    *   `GEMINI_API_KEY`: (Your key)

## Step 4: Persistent Volumes (Crucial for PDFs/Images)
Since Railway's file system is ephemeral, we need to add a volume:
1.  In Railway UI, go to your service -> **Settings** -> **Volumes**.
2.  Click **"Add Volume"**.
3.  Mount it to `/app/backend/uploads`.

---

I'll start by creating the `railway.json` file now.
