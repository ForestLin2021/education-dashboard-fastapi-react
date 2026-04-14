# UD EPP Dashboard

An interactive education data dashboard with Gemini AI analytics.

## Deployment

### Step 1 — Prepare Excel Data Files

Place the following three xlsx files inside `backend/data/`:

```
backend/data/UD_2020_2024.xlsx
backend/data/UD_GRAD_2020_2024.xlsx
backend/data/UD_Relationships.xlsx
```

---

### Step 2 — Render (Backend)

1. Push the entire project to GitHub (including the xlsx files inside `backend/data/`)
2. Go to [render.com](https://render.com) → **New → Web Service**
3. Connect your GitHub repo and set `backend/` as the Root Directory
4. Fill in the following settings:
   - **Runtime**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add the following **Environment Variable**:
   - `GEMINI_API_KEY` = `AIza...`
6. Click **Deploy** and copy your Render URL (format: `https://your-app.onrender.com`)

> ⚠️ Render's free tier spins down after 15 minutes of inactivity. The first request may take ~30 seconds to wake up.

---

### Step 3 — Vercel (Frontend)

1. Go to [vercel.com](https://vercel.com) → **New Project**
2. Connect the same GitHub repo and set `frontend/` as the Root Directory
3. Add the following **Environment Variable**:
   - `VITE_API_URL` = `https://your-render-url` (no trailing `/`)
4. Click **Deploy**!

---

## Local Development

```bash
# Backend
cd backend
pip install -r requirements.txt
GEMINI_API_KEY=AIza... uvicorn main:app --reload

# Frontend (open a separate terminal)
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev
```
