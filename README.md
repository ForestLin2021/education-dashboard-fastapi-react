# UD EPP Dashboard

An interactive education data dashboard with Gemini AI analytics.

## Architecture

The dashboard (KPIs, charts, year filter) is **static** — it reads
pre-aggregated JSON files from `frontend/public/data/`, generated offline
from the source xlsx files. The React app never calls a backend for this
data, so the page is interactive within ~1s with no server cold start.

The **chat feature** (`/api/chat`, powered by Gemini via LangChain/LangGraph)
is the only thing that still talks to the FastAPI backend on Render. It
reads the same small aggregated JSON (copied into `backend/data_summary/`)
as context for Gemini — it never loads the full source xlsx files, so the
backend's memory footprint stays small and roughly constant even as the
source xlsx files grow.

```
source xlsx (backend/data/*.xlsx)
        │  (run manually, see "Updating the data" below)
        ▼
backend/scripts/export_json.py
        │
        ├──► backend/data_summary/*.json   (used by /api/chat context)
        └──► frontend/public/data/*.json   (used by the React dashboard)
```

Because the frontend is fully static, **Render is optional**: if you don't
need the chat feature, you can deploy just `frontend/` to Vercel and skip
Render entirely.

## Updating the data

There is no automatic pipeline — this is a manual, occasional step:

1. Replace the xlsx files in `backend/data/` (`UD_2020_2024.xlsx`,
   `UD_GRAD_2020_2024.xlsx`, `UD_Relationships.xlsx`).
2. Regenerate the aggregated JSON:
   ```bash
   cd backend
   pip install -r scripts/requirements-export.txt
   python scripts/export_json.py
   ```
   This overwrites `backend/data_summary/*.json` and `frontend/public/data/*.json`.
3. Commit the regenerated JSON files.
4. Redeploy:
   - **Frontend (Vercel)**: redeploy so the new static JSON ships.
   - **Backend (Render)**: redeploy only if you're running the chat feature
     (its context comes from `backend/data_summary/`).

## Deployment

### Step 1 — Prepare Excel Data Files

Place the following three xlsx files inside `backend/data/` (only needed
locally / for CI to run `export_json.py` — they are not deployed anywhere):

```
backend/data/UD_2020_2024.xlsx
backend/data/UD_GRAD_2020_2024.xlsx
backend/data/UD_Relationships.xlsx
```

Then run the export script (see "Updating the data" above) so
`frontend/public/data/*.json` and `backend/data_summary/*.json` exist.

---

### Step 2 — Vercel (Frontend, required)

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Connect the repo and set `frontend/` as the Root Directory
3. (Optional) Add `VITE_API_URL` = your Render backend URL, only if you're
   deploying the chat backend (Step 3) — the dashboard itself doesn't need it
4. Click **Deploy**

At this point the dashboard (KPIs/charts/filters) works standalone with no
backend.

---

### Step 3 — Render (Backend, optional — chat only)

1. Go to [render.com](https://render.com) → **New → Web Service**
2. Connect the same repo and set `backend/` as the Root Directory
3. Fill in the following settings:
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add the following **Environment Variable**:
   - `GEMINI_API_KEY` = `AIza...`
5. Click **Deploy** and copy your Render URL (format: `https://your-app.onrender.com`)
6. Set `VITE_API_URL` on the Vercel project to that URL and redeploy the frontend

> ⚠️ Render's free tier spins down after 15 minutes of inactivity — the
> first chat message after idling may take ~30s to wake up. This no longer
> affects the dashboard itself, only the chat feature.

---

## Local Development

```bash
# Frontend — static JSON dashboard, no backend required
cd frontend
npm install
npm run dev

# Backend — only needed to test the chat feature
cd backend
pip install -r requirements.txt
GEMINI_API_KEY=AIza... uvicorn main:app --reload
# then, in frontend/.env: VITE_API_URL=http://localhost:8000
```

If `frontend/public/data/*.json` is missing or stale, regenerate it first
(see "Updating the data" above).
