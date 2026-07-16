"""
UD EPP Dashboard — FastAPI Backend
LangChain + LangGraph multi-agent chat pipeline.

The dashboard's charts/KPIs are served as static JSON from the frontend
(frontend/public/data/*.json, produced by scripts/export_json.py) — this
backend is only responsible for the /api/chat endpoint. It reads the same
small aggregated JSON files (backend/data_summary/, kept in sync with the
frontend copy by the export script) as Gemini context, instead of loading
the full source xlsx files into memory.
"""

import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from functools import lru_cache
from collections import defaultdict

# ── LangChain + LangGraph imports ────────────────────────────────────────
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import StateGraph, END
from typing import TypedDict, List

app = FastAPI(title="UD EPP Dashboard API", version="3.0.0")

# ── CORS ──────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://education-dashboard-fastapi-react.vercel.app","http://localhost:5173","http://localhost:3000","*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Data summary files (small, pre-aggregated by scripts/export_json.py) ──
SUMMARY_DIR = os.getenv("DATA_SUMMARY_DIR", os.path.join(os.path.dirname(__file__), "data_summary"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-2.5-flash"

# ═════════════════════════════════════════════
# SUMMARY DATA LOADING
# ═════════════════════════════════════════════

@lru_cache(maxsize=None)
def load_summary(name: str):
    path = os.path.join(SUMMARY_DIR, f"{name}.json")
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def group_sum_pct(rows: list, group_key: str, value_key: str = "count") -> list:
    """Sum value_key across all rows by group_key (ignoring any year/program dimension) and add a pct column."""
    totals: dict = defaultdict(int)
    for row in rows:
        totals[row[group_key]] += row[value_key]
    grand_total = sum(totals.values()) or 1
    return [
        {group_key: k, value_key: v, "pct": round(v / grand_total * 100, 1)}
        for k, v in totals.items()
    ]


def pivot_gender_by_year(rows: list) -> list:
    """gender.json is now raw per-(year, program) rows; collapse across programs into one F/M/total row per year."""
    by_year: dict = defaultdict(lambda: defaultdict(int))
    for row in rows:
        by_year[row["school_year"]][row["gender"]] += row["count"]
    result = []
    for year, counts in sorted(by_year.items()):
        f, m = counts.get("F", 0), counts.get("M", 0)
        result.append({"school_year": year, "F": f, "M": m, "total": f + m})
    return result


def sum_gpa_by_year(rows: list) -> list:
    """gpa.json is now raw per-(year, program) rows; collapse across programs into one row per year."""
    by_year: dict = defaultdict(lambda: {"total": 0, "above_3_count": 0, "below_3_count": 0})
    for row in rows:
        agg = by_year[row["school_year"]]
        agg["total"] += row["total"]
        agg["above_3_count"] += row["above_3_count"]
        agg["below_3_count"] += row["below_3_count"]
    result = []
    for year, agg in sorted(by_year.items()):
        total = agg["total"] or 1
        result.append({
            "school_year": year,
            **agg,
            "pct_above": round(agg["above_3_count"] / total * 100, 1),
            "pct_below": round(agg["below_3_count"] / total * 100, 1),
        })
    return result


# ═════════════════════════════════════════════
# DATA RETRIEVAL TOOLS (for agents to use)
# ═════════════════════════════════════════════

def get_student_data() -> dict:
    """Fetch student demographics: gender, race, GPA (all years, all programs combined)."""
    return {
        "gender_by_year": pivot_gender_by_year(load_summary("gender")),
        "race_distribution": group_sum_pct(load_summary("race"), "race"),
        "gpa_by_year": sum_gpa_by_year(load_summary("gpa")),
    }


def get_praxis_data() -> dict:
    """Fetch Praxis pass rate data."""
    praxis = load_summary("praxis")
    by_program = load_summary("praxis_by_program")
    latest_year = max(row["year"] for row in praxis) if praxis else None
    return {
        "praxis_pass_rate": praxis,
        "praxis_by_program": [row for row in by_program if row["year"] == latest_year],
    }


def get_employment_data() -> dict:
    """Fetch employment and HNS placement data (all years)."""
    return {
        "employment_location": group_sum_pct(load_summary("employment"), "location"),
        "hns_placement": group_sum_pct(load_summary("hns"), "hns"),
    }


def sum_retention(rows: list) -> list:
    """retention.json is now raw per-(cohort, retention_year, program) rows; collapse across programs."""
    by_group: dict = defaultdict(lambda: {"total": 0, "Retained": 0, "Not_Retained": 0})
    for row in rows:
        key = (row["graduate_cohort"], row["RetentionYear"])
        agg = by_group[key]
        agg["total"] += row["total"]
        agg["Retained"] += row["Retained"]
        agg["Not_Retained"] += row["Not_Retained"]
    result = []
    for (cohort, retention_year), agg in by_group.items():
        result.append({
            "graduate_cohort": cohort,
            "RetentionYear": retention_year,
            **agg,
            "Retained_PCT": round(agg["Retained"] / (agg["total"] or 1) * 100, 1),
        })
    return result


def get_retention_perception_data() -> dict:
    """Fetch retention and graduate perception data (all years, all programs combined)."""
    return {
        "retention": sum_retention(load_summary("retention")),
        "graduate_perception": load_summary("perception")["graduate"],
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
You will be given aggregated summary data. Always base your answers on this data.
Answer concisely with specific numbers. Mention which tab/chart is relevant when helpful.
If asked something outside the dataset, say so.

--- SUMMARY DATA (topic: {state['topic']}) ---
{json.dumps(state['retrieved_data'], indent=2)}
--- END OF SUMMARY DATA ---""")
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
# CHAT ENDPOINT — LangGraph powered
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
    return {"status": "UD EPP Dashboard API v3.0 (chat-only, static-data frontend) running ✓"}
