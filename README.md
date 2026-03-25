# UD EPP Dashboard

互動式儀表板，搭配 Claude AI 分析功能。

## 部署說明

### Step 1 — 準備 Excel 資料檔

把以下三個 xlsx 放進 `backend/data/`：

```
backend/data/UD_2020_2024.xlsx
backend/data/UD_GRAD_2020_2024.xlsx
backend/data/UD_Relationships.xlsx
```

---

### Step 2 — Render（後端）

1. 把整個專案上傳到 GitHub（含 `backend/data/` 裡的 xlsx）
2. 前往 [render.com](https://render.com) → **New → Web Service**
3. 連接你的 GitHub repo，選 `backend/` 為 Root Directory
4. 填入以下設定：
   - **Runtime**：Python 3
   - **Build Command**：`pip install -r requirements.txt`
   - **Start Command**：`uvicorn main:app --host 0.0.0.0 --port $PORT`
5. 在 **Environment Variables** 加入：
   - `ANTHROPIC_API_KEY` = `sk-ant-...`
6. 點 **Deploy**，完成後複製你的 Render URL（格式：`https://your-app.onrender.com`）

> ⚠️ Render 免費方案閒置 15 分鐘後會 spin down，第一次請求會慢約 30 秒。

---

### Step 3 — Vercel（前端）

1. 前往 [vercel.com](https://vercel.com) → **New Project**
2. 連接同一個 GitHub repo，選 `frontend/` 為 Root Directory
3. 在 **Environment Variables** 加入：
   - `VITE_API_URL` = `https://你的Render網址`（不要有尾端 `/`）
4. 點 **Deploy**！

---

## 本地開發

```bash
# 後端
cd backend
pip install -r requirements.txt
ANTHROPIC_API_KEY=sk-ant-... uvicorn main:app --reload

# 前端（另開終端機）
cd frontend
npm install
echo "VITE_API_URL=http://localhost:8000" > .env
npm run dev
```
