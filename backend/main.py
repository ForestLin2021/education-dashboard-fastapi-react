"""
UD EPP Dashboard — FastAPI Backend
Reads the 3 xlsx files and exposes data + Claude AI proxy endpoints.
"""

import os
import json
import httpx
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from functools import lru_cache

app = FastAPI(title="UD EPP Dashboard API", version="1.0.0")

# ── CORS (allow Vercel frontend + local dev) ──────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # lock down to your Vercel URL in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── File paths (update after deploy — put xlsx in /data/) ────────────────
DATA_DIR = os.getenv("DATA_DIR", "./data")
F1 = os.path.join(DATA_DIR, "UD_2020_2024.xlsx")
F2 = os.path.join(DATA_DIR, "UD_GRAD_2020_2024.xlsx")
F3 = os.path.join(DATA_DIR, "UD_Relationships.xlsx")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-1.5-flash"

# ═════════════════════════════════════════════
# DATA LOADING  (cached so xlsx only read once)
# ═════════════════════════════════════════════

@lru_cache(maxsize=1)
def load_all():
    """Load and pre-process all sheets. Cached after first call."""
    # ── FILE 1 ──────────────────────────────────
    gender = pd.read_excel(F1, sheet_name="Gender_2020_2024_PROGS")
    race   = pd.read_excel(F1, sheet_name="Race_2020_2024_Progs")
    gpa    = pd.read_excel(F1, sheet_name="GPA_2020_2024_Progs")

    # ── FILE 2 ──────────────────────────────────
    praxis      = pd.read_excel(F2, sheet_name="Praxis_2020_2024")
    praxis_fail = pd.read_excel(F2, sheet_name="Praxis_fail_2020_2024")
    hns         = pd.read_excel(F2, sheet_name="HNS 20202024")
    employ      = pd.read_excel(F2, sheet_name="Employment by Prog_20202024")
    employ_map  = pd.read_excel(F2, sheet_name="Employment_map")
    clinical    = pd.read_excel(F2, sheet_name="CLINICAL_HNS_5YRS")
    retention   = pd.read_excel(F2, sheet_name="Merged_retention_yr1_yr3")
    grad_perc   = pd.read_excel(F2, sheet_name="grad_perception_5yr")
    sup_perc    = pd.read_excel(F2, sheet_name="sup_perception_5yr")

    # ── FILE 3 ──────────────────────────────────
    programs    = pd.read_excel(F3, sheet_name="DIMProgs")

    return dict(
        gender=gender, race=race, gpa=gpa,
        praxis=praxis, praxis_fail=praxis_fail,
        hns=hns, employ=employ, employ_map=employ_map,
        clinical=clinical, retention=retention,
        grad_perc=grad_perc, sup_perc=sup_perc,
        programs=programs,
    )

# ═════════════════════════════════════════════
# HELPER
# ═════════════════════════════════════════════

def to_list(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records"))

def year_filter(df, col, year):
    if year:
        df = df[df[col] == int(year)]
    return df

def prog_filter(df, col, program_id):
    if program_id:
        df = df[df[col].astype(str) == str(program_id)]
    return df

# ═════════════════════════════════════════════
# ENDPOINTS — STUDENT DATA  (F1)
# ═════════════════════════════════════════════

@app.get("/api/students/gender")
def get_gender(year: Optional[int] = None, program_id: Optional[str] = None):
    d = load_all()
    df = d["gender"].copy()
    df = year_filter(df, "school_year", year)
    df = prog_filter(df, "program_id", program_id)
    agg = df.groupby(["school_year", "gender"])["count"].sum().reset_index()
    pivot = agg.pivot(index="school_year", columns="gender", values="count").fillna(0).reset_index()
    pivot.columns.name = None
    pivot["total"] = pivot.get("F", 0) + pivot.get("M", 0)
    return to_list(pivot)


@app.get("/api/students/race")
def get_race(year: Optional[int] = None, program_id: Optional[str] = None):
    d = load_all()
    df = d["race"].copy()
    df = year_filter(df, "school_year", year)
    df = prog_filter(df, "program_id", program_id)
    agg = df.groupby("race_descp.x")["count"].sum().reset_index()
    agg.columns = ["race", "count"]
    total = agg["count"].sum()
    agg["pct"] = (agg["count"] / total * 100).round(1)
    return to_list(agg)


@app.get("/api/students/gpa")
def get_gpa(year: Optional[int] = None, program_id: Optional[str] = None):
    d = load_all()
    df = d["gpa"].copy()
    df = year_filter(df, "school_year", year)
    df = prog_filter(df, "program_id", program_id)
    agg = df.groupby("school_year")[["total", "above_3_count", "below_3_count"]].sum().reset_index()
    agg["pct_above"] = (agg["above_3_count"] / agg["total"] * 100).round(1)
    agg["pct_below"] = (agg["below_3_count"] / agg["total"] * 100).round(1)
    return to_list(agg)

# ═════════════════════════════════════════════
# ENDPOINTS — GRADUATE DATA  (F2)
# ═════════════════════════════════════════════

@app.get("/api/graduates/praxis")
def get_praxis(year: Optional[int] = None, program_id: Optional[str] = None):
    d = load_all()
    df = d["praxis_fail"].copy()
    df["year"] = df["year"].astype(int)
    df = year_filter(df, "year", year)
    df = prog_filter(df, "program_id", program_id)
    agg = df.groupby("year")[["total_graduates", "graduates_with_pass", "graduates_with_no_pass"]].sum().reset_index()
    agg["pass_rate"] = (agg["graduates_with_pass"] / agg["total_graduates"] * 100).round(1)
    return to_list(agg)


@app.get("/api/graduates/praxis/by-program")
def get_praxis_by_program(year: Optional[int] = None):
    d = load_all()
    df = d["praxis_fail"].copy()
    df["year"] = df["year"].astype(int)
    df = year_filter(df, "year", year)
    agg = df.groupby(["program_id", "program_name"])[["total_graduates", "graduates_with_pass"]].sum().reset_index()
    agg["pass_rate"] = (agg["graduates_with_pass"] / agg["total_graduates"] * 100).round(1)
    return to_list(agg.sort_values("pass_rate", ascending=False))


@app.get("/api/graduates/employment")
def get_employment(year: Optional[int] = None, program_id: Optional[str] = None):
    d = load_all()
    df = d["employ"].copy()
    df["school_year"] = df["school_year"].astype(int)
    df = year_filter(df, "school_year", year)
    df = prog_filter(df, "program_id", program_id)
    agg = df.groupby("work_location_2")["count"].sum().reset_index()
    agg.columns = ["location", "count"]
    total = agg["count"].sum()
    agg["pct"] = (agg["count"] / total * 100).round(1)
    return to_list(agg)


@app.get("/api/graduates/employment/map")
def get_employment_map(year: Optional[int] = None):
    d = load_all()
    df = d["employ_map"].copy()
    if year:
        df = df[df["school_year.x"] == int(year)]
    # Return only needed columns
    cols = ["graduate_id", "program_name", "district_name", "employed_school",
            "employment", "employer_state", "city", "state", "zip", "geocoded_location"]
    return to_list(df[[c for c in cols if c in df.columns]])


@app.get("/api/graduates/hns")
def get_hns(year: Optional[int] = None, program_id: Optional[str] = None):
    d = load_all()
    df = d["hns"].copy()
    df["school_year"] = df["school_year"].astype(int)
    df = year_filter(df, "school_year", year)
    df = prog_filter(df, "program_id", program_id)
    agg = df.groupby("hns")["count"].sum().reset_index()
    total = agg["count"].sum()
    agg["pct"] = (agg["count"] / total * 100).round(1)
    return to_list(agg)


@app.get("/api/graduates/retention")
def get_retention(retention_year: Optional[str] = None, program_id: Optional[str] = None):
    d = load_all()
    df = d["retention"].copy()
    if retention_year:
        df = df[df["RetentionYear"] == retention_year]
    df = prog_filter(df, "program_id", program_id)
    agg = df.groupby(["graduate_cohort", "RetentionYear"])[["total", "Retained", "Not_Retained"]].sum().reset_index()
    agg["Retained_PCT"] = (agg["Retained"] / agg["total"] * 100).round(1)
    return to_list(agg)


@app.get("/api/graduates/perception")
def get_perception(rater: str = "graduate", year: Optional[str] = None, program_id: Optional[str] = None):
    d = load_all()
    dims = ["instrdesg", "contknow", "classmange", "instrprac", "profresp"]

    if rater == "supervisor":
        df = d["sup_perc"].copy()
        yr_col   = "survey_year"
        prog_col = "teacher_program_id"
        cols     = [f"sup_median_{dim}_row_average" for dim in dims]
    else:
        df = d["grad_perc"].copy()
        yr_col   = "school_year"
        prog_col = "program_id"
        cols     = [f"median_{dim}_row_average" for dim in dims]

    df[yr_col] = df[yr_col].astype(str)
    if year:
        df = df[df[yr_col] == str(year)]
    df = prog_filter(df, prog_col, program_id)

    agg = df.groupby(yr_col)[cols].mean().round(3).reset_index()
    agg.columns = [yr_col, "instrDesg", "contKnow", "classMgt", "instrPrac", "profResp"]
    return to_list(agg)

# ═════════════════════════════════════════════
# ENDPOINTS — DIMENSIONS  (F3)
# ═════════════════════════════════════════════

@app.get("/api/programs")
def get_programs():
    d = load_all()
    return to_list(d["programs"])


@app.get("/api/years")
def get_years():
    d = load_all()
    years = sorted(d["gender"]["school_year"].unique().tolist())
    return {"years": years}

# ═════════════════════════════════════════════
# ENDPOINT — CLAUDE AI PROXY
# ═════════════════════════════════════════════

SYSTEM_PROMPT = """You are an expert analyst for the University of Delaware's Educator Preparation Program (EPP) dashboard.
You have access to live data from three Excel sources:
1. UD_2020_2024.xlsx — enrolled student data: gender distribution, race/ethnicity, GPA profiles (2020–2024).
2. UD_GRAD_2020_2024.xlsx — graduate outcomes: Praxis pass rates, employment location, HNS placement, Year 1/Year 3 retention, graduate & supervisor perception scores.
3. UD_Relationships.xlsx — dimension tables: programs, institutions, categories.

Key facts:
- 22 programs (Bachelors & Masters), all at University of Delaware
- 2024 Praxis overall pass rate: 99.6% (231 graduates); 16/17 programs at 100%; Masters Secondary STEM 4+1 at 75% (n=4)
- 2024 employment: 116 teaching in DE (50.4%), 72 not teaching (31.3%), 42 out of DE (18.3%)
- 2024 HNS: 18 graduates (15.5%) placed at High-Need Schools
- Year 1 retention: ranges 65.5%–85.2% across cohorts (2020–2024)
- Year 3 retention: ranges 58.0%–70.0% (cohorts 2020–2022)
- GPA ≥ 3.0: consistently 86–92% each year
- Gender: ~85–90% female enrollment each year
- Race 2024: ~88% White, ~5% Black, ~4% Asian/PI, ~2% Hispanic, <1% Am. Indian
- Perception scored 1–5; supervisor scores more stable than graduate self-scores
- Perception 5 dimensions: Instruction Design, Content Knowledge, Classroom Management, Instructional Practice, Professional Responsibility

Answer concisely with specific numbers. Mention which tab/chart is relevant when helpful. If asked something outside the dataset, say so."""


class ChatRequest(BaseModel):
    messages: list   # [{role: "user"|"assistant", content: "..."}]


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set on server.")

    # 把 messages 轉成 Gemini 格式，並在最前面注入 system prompt
    gemini_contents = [{"role": "user", "parts": [{"text": SYSTEM_PROMPT}]},
                       {"role": "model", "parts": [{"text": "Understood. I am ready to assist."}]}]
    for m in req.messages:
        role = "model" if m["role"] == "assistant" else "user"
        gemini_contents.append({"role": role, "parts": [{"text": m["content"]}]})

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
    )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url,
            headers={"content-type": "application/json"},
            json={
                "contents": gemini_contents,
                "generationConfig": {"maxOutputTokens": 1024},
            },
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    data = resp.json()
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    return {"reply": text}


@app.get("/")
def root():
    return {"status": "UD EPP Dashboard API running ✓"}
