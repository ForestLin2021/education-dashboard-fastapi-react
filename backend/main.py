"""
UD EPP Dashboard — FastAPI Backend (Upgraded)
LangChain + LangGraph multi-agent chat pipeline
All original data endpoints unchanged.
"""

import os
import json
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Literal
from functools import lru_cache

# ── LangChain + LangGraph imports ────────────────────────────────────────
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END
from typing import TypedDict, List

app = FastAPI(title="UD EPP Dashboard API", version="2.0.0")

# ── CORS ──────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── File paths ────────────────────────────────────────────────────────────
DATA_DIR = os.getenv("DATA_DIR", "./data")
F1 = os.path.join(DATA_DIR, "UD_2020_2024.xlsx")
F2 = os.path.join(DATA_DIR, "UD_GRAD_2020_2024.xlsx")
F3 = os.path.join(DATA_DIR, "UD_Relationships.xlsx")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-2.0-flash"

# ═════════════════════════════════════════════
# DATA LOADING (unchanged)
# ═════════════════════════════════════════════

@lru_cache(maxsize=1)
def load_all():
    gender      = pd.read_excel(F1, sheet_name="Gender_2020_2024_PROGS")
    race        = pd.read_excel(F1, sheet_name="Race_2020_2024_Progs")
    gpa         = pd.read_excel(F1, sheet_name="GPA_2020_2024_Progs")
    praxis      = pd.read_excel(F2, sheet_name="Praxis_2020_2024")
    praxis_fail = pd.read_excel(F2, sheet_name="Praxis_fail_2020_2024")
    hns         = pd.read_excel(F2, sheet_name="HNS 20202024")
    employ      = pd.read_excel(F2, sheet_name="Employment by Prog_20202024")
    employ_map  = pd.read_excel(F2, sheet_name="Employment_map")
    clinical    = pd.read_excel(F2, sheet_name="CLINICAL_HNS_5YRS")
    retention   = pd.read_excel(F2, sheet_name="Merged_retention_yr1_yr3")
    grad_perc   = pd.read_excel(F2, sheet_name="grad_perception_5yr")
    sup_perc    = pd.read_excel(F2, sheet_name="sup_perception_5yr")
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
# HELPERS (unchanged)
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
# DATA RETRIEVAL TOOLS (for agents to use)
# ═════════════════════════════════════════════

def get_student_data() -> dict:
    """Fetch student demographics: gender, race, GPA."""
    d = load_all()

    gender_df = d["gender"].copy()
    gender_agg = gender_df.groupby(["school_year", "gender"])["count"].sum().reset_index()
    gender_pivot = gender_agg.pivot(index="school_year", columns="gender", values="count").fillna(0).reset_index()
    gender_pivot.columns.name = None
    gender_pivot["total"] = gender_pivot.get("F", 0) + gender_pivot.get("M", 0)

    race_df = d["race"].copy()
    race_agg = race_df.groupby("race_descp.x")["count"].sum().reset_index()
    race_agg.columns = ["race", "count"]
    race_total = race_agg["count"].sum()
    race_agg["pct"] = (race_agg["count"] / race_total * 100).round(1)

    gpa_df = d["gpa"].copy()
    gpa_agg = gpa_df.groupby("school_year")[["total", "above_3_count", "below_3_count"]].sum().reset_index()
    gpa_agg["pct_above"] = (gpa_agg["above_3_count"] / gpa_agg["total"] * 100).round(1)

    return {
        "gender_by_year": json.loads(gender_pivot.to_json(orient="records")),
        "race_distribution": json.loads(race_agg.to_json(orient="records")),
        "gpa_by_year": json.loads(gpa_agg.to_json(orient="records")),
    }


def get_praxis_data() -> dict:
    """Fetch Praxis pass rate data."""
    d = load_all()

    praxis_df = d["praxis_fail"].copy()
    praxis_df["year"] = praxis_df["year"].astype(int)
    praxis_agg = praxis_df.groupby("year")[["total_graduates", "graduates_with_pass"]].sum().reset_index()
    praxis_agg["pass_rate"] = (praxis_agg["graduates_with_pass"] / praxis_agg["total_graduates"] * 100).round(1)

    latest_year = int(praxis_df["year"].max())
    praxis_prog = praxis_df[praxis_df["year"] == latest_year].groupby(
        ["program_id", "program_name"])[["total_graduates", "graduates_with_pass"]].sum().reset_index()
    praxis_prog["pass_rate"] = (praxis_prog["graduates_with_pass"] / praxis_prog["total_graduates"] * 100).round(1)

    return {
        "praxis_pass_rate": json.loads(praxis_agg.to_json(orient="records")),
        "praxis_by_program": json.loads(praxis_prog.to_json(orient="records")),
    }


def get_employment_data() -> dict:
    """Fetch employment and HNS placement data."""
    d = load_all()

    employ_df = d["employ"].copy()
    employ_df["school_year"] = employ_df["school_year"].astype(int)
    employ_agg = employ_df.groupby("work_location_2")["count"].sum().reset_index()
    employ_agg.columns = ["location", "count"]
    employ_total = employ_agg["count"].sum()
    employ_agg["pct"] = (employ_agg["count"] / employ_total * 100).round(1)

    hns_df = d["hns"].copy()
    hns_agg = hns_df.groupby("hns")["count"].sum().reset_index()
    hns_total = hns_agg["count"].sum()
    hns_agg["pct"] = (hns_agg["count"] / hns_total * 100).round(1)

    return {
        "employment_location": json.loads(employ_agg.to_json(orient="records")),
        "hns_placement": json.loads(hns_agg.to_json(orient="records")),
    }


def get_retention_perception_data() -> dict:
    """Fetch retention and graduate perception data."""
    d = load_all()

    ret_df = d["retention"].copy()
    ret_agg = ret_df.groupby(["graduate_cohort", "RetentionYear"])[["total", "Retained"]].sum().reset_index()
    ret_agg["Retained_PCT"] = (ret_agg["Retained"] / ret_agg["total"] * 100).round(1)

    dims = ["instrdesg", "contknow", "classmange", "instrprac", "profresp"]
    grad_cols = [f"median_{dim}_row_average" for dim in dims]
    grad_perc = d["grad_perc"].copy()
    grad_perc["school_year"] = grad_perc["school_year"].astype(str)
    grad_agg = grad_perc.groupby("school_year")[grad_cols].mean().round(3).reset_index()
    grad_agg.columns = ["year", "instrDesg", "contKnow", "classMgt", "instrPrac", "profResp"]

    return {
        "retention": json.loads(ret_agg.to_json(orient="records")),
        "graduate_perception": json.loads(grad_agg.to_json(orient="records")),
    }


# ═════════════════════════════════════════════
# LANGGRAPH — STATE + AGENTS
# ═════════════════════════════════════════════

# Define the state that flows between agents
class AgentState(TypedDict):
    messages: List[dict]          # full conversation history
    question: str                  # current user question
    topic: str                     # classified topic
    retrieved_data: dict           # data fetched by data agent
    answer: str                    # final answer


# ── Agent 1: Router ───────────────────────────────────────────────────────
def router_agent(state: AgentState) -> AgentState:
    """
    Classify the user's question into a topic category.
    This tells the data agent which data to fetch.
    """
    llm = ChatGoogleGenerativeAI(
        model=GEMINI_MODEL,
        google_api_key=GEMINI_API_KEY,
        temperature=0,
    )

    prompt = ChatPromptTemplate.from_messages([
        SystemMessage(content="""You are a question classifier for a university education dashboard.
Classify the user's question into EXACTLY ONE of these categories:
- "student" — questions about student gender, race, GPA, demographics
- "praxis" — questions about Praxis exam pass rates, licensure
- "employment" — questions about employment, jobs, HNS placement, where graduates work
- "retention" — questions about retention rates, perception scores, graduate feedback
- "general" — questions that span multiple topics or are general about the program

Respond with ONLY the category word, nothing else."""),
        HumanMessage(content=state["question"])
    ])

    response = llm.invoke(prompt.format_messages())
    topic = response.content.strip().lower()

    # Validate topic
    valid_topics = ["student", "praxis", "employment", "retention", "general"]
    if topic not in valid_topics:
        topic = "general"

    return {**state, "topic": topic}


# ── Agent 2: Data Retrieval ───────────────────────────────────────────────
def data_agent(state: AgentState) -> AgentState:
    """
    Fetch only the relevant data based on the classified topic.
    This is smarter than fetching ALL data every time.
    """
    topic = state["topic"]

    if topic == "student":
        data = get_student_data()
    elif topic == "praxis":
        data = get_praxis_data()
    elif topic == "employment":
        data = get_employment_data()
    elif topic == "retention":
        data = get_retention_perception_data()
    else:
        # general — fetch everything
        data = {
            **get_student_data(),
            **get_praxis_data(),
            **get_employment_data(),
            **get_retention_perception_data(),
        }

    return {**state, "retrieved_data": data}


# ── Agent 3: Answer ───────────────────────────────────────────────────────
def answer_agent(state: AgentState) -> AgentState:
    """
    Generate the final answer using the retrieved data and conversation history.
    Uses LangChain to manage conversation memory automatically.
    """
    llm = ChatGoogleGenerativeAI(
        model=GEMINI_MODEL,
        google_api_key=GEMINI_API_KEY,
        temperature=0.3,
    )

    # Build messages with conversation memory
    messages = [
        SystemMessage(content=f"""You are an expert analyst for the University of Delaware's Educator Preparation Program (EPP) dashboard.
You will be given LIVE data retrieved directly from the database. Always base your answers on this live data.
Answer concisely with specific numbers. Mention which tab/chart is relevant when helpful.
If asked something outside the dataset, say so.

--- LIVE DATA (topic: {state['topic']}) ---
{json.dumps(state['retrieved_data'], indent=2)}
--- END OF LIVE DATA ---""")
    ]

    # Add conversation history (this is LangChain managing memory!)
    for msg in state["messages"][:-1]:  # all except the last (current) message
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            messages.append(AIMessage(content=msg["content"]))

    # Add current question
    messages.append(HumanMessage(content=state["question"]))

    response = llm.invoke(messages)
    return {**state, "answer": response.content}


# ── Build LangGraph ───────────────────────────────────────────────────────
def build_graph():
    workflow = StateGraph(AgentState)

    # Add nodes (each node = one agent)
    workflow.add_node("router", router_agent)
    workflow.add_node("data_retrieval", data_agent)
    workflow.add_node("answer_generator", answer_agent)

    # Define the flow
    workflow.set_entry_point("router")
    workflow.add_edge("router", "data_retrieval")
    workflow.add_edge("data_retrieval", "answer_generator")
    workflow.add_edge("answer_generator", END)

    return workflow.compile()


# Build graph once at startup
graph = None

@app.on_event("startup")
async def startup_event():
    global graph
    if GEMINI_API_KEY:
        graph = build_graph()


# ═════════════════════════════════════════════
# ALL ORIGINAL ENDPOINTS (unchanged)
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
# NEW CHAT ENDPOINT — LangGraph powered
# ═════════════════════════════════════════════

class ChatRequest(BaseModel):
    messages: list  # [{role: "user"|"assistant", content: "..."}]


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not set on server.")
    if not graph:
        raise HTTPException(status_code=500, detail="LangGraph not initialized.")

    # Get the latest user message
    user_messages = [m for m in req.messages if m["role"] == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="No user message found.")

    current_question = user_messages[-1]["content"]

    # Run the LangGraph pipeline
    result = graph.invoke({
        "messages": req.messages,
        "question": current_question,
        "topic": "",
        "retrieved_data": {},
        "answer": "",
    })

    return {"reply": result["answer"]}


@app.get("/")
def root():
    return {"status": "UD EPP Dashboard API v2.0 (LangGraph) running ✓"}
