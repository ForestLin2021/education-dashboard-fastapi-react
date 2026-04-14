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
GEMINI_MODEL   = "gemini-2.5-flash"

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

BASE_SYSTEM_PROMPT = """You are an expert analyst for the University of Delaware's Educator Preparation Program (EPP) dashboard.
You will be given LIVE data retrieved directly from the database. Always base your answers on this live data.
Answer concisely with specific numbers. Mention which tab/chart is relevant when helpful.
If asked something outside the dataset, say so."""


def fetch_live_data() -> dict:
    """Retrieve live data from all endpoints to inject into the AI prompt (RAG)."""
    d = load_all()

    # Gender — aggregate across all years
    gender_df = d["gender"].copy()
    gender_agg = gender_df.groupby(["school_year", "gender"])["count"].sum().reset_index()
    gender_pivot = gender_agg.pivot(index="school_year", columns="gender", values="count").fillna(0).reset_index()
    gender_pivot.columns.name = None
    gender_pivot["total"] = gender_pivot.get("F", 0) + gender_pivot.get("M", 0)

    # Race — aggregate across all years
    race_df = d["race"].copy()
    race_agg = race_df.groupby("race_descp.x")["count"].sum().reset_index()
    race_agg.columns = ["race", "count"]
    race_total = race_agg["count"].sum()
    race_agg["pct"] = (race_agg["count"] / race_total * 100).round(1)

    # GPA
    gpa_df = d["gpa"].copy()
    gpa_agg = gpa_df.groupby("school_year")[["total", "above_3_count", "below_3_count"]].sum().reset_index()
    gpa_agg["pct_above"] = (gpa_agg["above_3_count"] / gpa_agg["total"] * 100).round(1)

    # Praxis pass rate by year
    praxis_df = d["praxis_fail"].copy()
    praxis_df["year"] = praxis_df["year"].astype(int)
    praxis_agg = praxis_df.groupby("year")[["total_graduates", "graduates_with_pass"]].sum().reset_index()
    praxis_agg["pass_rate"] = (praxis_agg["graduates_with_pass"] / praxis_agg["total_graduates"] * 100).round(1)

    # Praxis by program (latest year only)
    latest_year = int(praxis_df["year"].max())
    praxis_prog = praxis_df[praxis_df["year"] == latest_year].groupby(
        ["program_id", "program_name"])[["total_graduates", "graduates_with_pass"]].sum().reset_index()
    praxis_prog["pass_rate"] = (praxis_prog["graduates_with_pass"] / praxis_prog["total_graduates"] * 100).round(1)

    # Employment location
    employ_df = d["employ"].copy()
    employ_df["school_year"] = employ_df["school_year"].astype(int)
    employ_agg = employ_df.groupby("work_location_2")["count"].sum().reset_index()
    employ_agg.columns = ["location", "count"]
    employ_total = employ_agg["count"].sum()
    employ_agg["pct"] = (employ_agg["count"] / employ_total * 100).round(1)

    # HNS placement
    hns_df = d["hns"].copy()
    hns_agg = hns_df.groupby("hns")["count"].sum().reset_index()
    hns_total = hns_agg["count"].sum()
    hns_agg["pct"] = (hns_agg["count"] / hns_total * 100).round(1)

    # Retention
    ret_df = d["retention"].copy()
    ret_agg = ret_df.groupby(["graduate_cohort", "RetentionYear"])[["total", "Retained"]].sum().reset_index()
    ret_agg["Retained_PCT"] = (ret_agg["Retained"] / ret_agg["total"] * 100).round(1)

    # Graduate perception scores
    dims = ["instrdesg", "contknow", "classmange", "instrprac", "profresp"]
    grad_cols = [f"median_{dim}_row_average" for dim in dims]
    grad_perc = d["grad_perc"].copy()
    grad_perc["school_year"] = grad_perc["school_year"].astype(str)
    grad_agg = grad_perc.groupby("school_year")[grad_cols].mean().round(3).reset_index()
    grad_agg.columns = ["year", "instrDesg", "contKnow", "classMgt", "instrPrac", "profResp"]

    return {
        "gender_by_year":       json.loads(gender_pivot.to_json(orient="records")),
        "race_distribution":    json.loads(race_agg.to_json(orient="records")),
        "gpa_by_year":          json.loads(gpa_agg.to_json(orient="records")),
        "praxis_pass_rate":     json.loads(praxis_agg.to_json(orient="records")),
        "praxis_by_program":    json.loads(praxis_prog.to_json(orient="records")),
        "employment_location":  json.loads(employ_agg.to_json(orient="records")),
        "hns_placement":        json.loads(hns_agg.to_json(orient="records")),
        "retention":            json.loads(ret_agg.to_json(orient="records")),
        "graduate_perception":  json.loads(grad_agg.to_json(orient="records")),
    }


class ChatRequest(BaseModel):
    messages: list   # [{role: "user"|"assistant", content: "..."}]


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set on server.")

    # ── RAG: fetch live data and inject into system prompt ───────────────────
    live_data = fetch_live_data()
    rag_prompt = (
        BASE_SYSTEM_PROMPT
        + "\n\n--- LIVE DATA (retrieved from database) ---\n"
        + json.dumps(live_data, indent=2)
        + "\n--- END OF LIVE DATA ---"
    )

    # Build Gemini message format
    gemini_contents = [
        {"role": "user",  "parts": [{"text": rag_prompt}]},
        {"role": "model", "parts": [{"text": "Understood. I have reviewed the live data and I am ready to assist."}]},
    ]
    for m in req.messages:
        role = "model" if m["role"] == "assistant" else "user"
        gemini_contents.append({"role": role, "parts": [{"text": m["content"]}]})

    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{GEMINI_MODEL}:generateContent"
    )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            url,
            headers={
                "content-type": "application/json",
                "x-goog-api-key": GEMINI_API_KEY,
            },
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
