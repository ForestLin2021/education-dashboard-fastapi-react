"""
Offline export: reads the source xlsx files and writes small aggregated JSON
files consumed by the frontend (static dashboard) and the backend chat
endpoint (Gemini context).

Run this locally (or in CI) whenever the source xlsx files change, then
redeploy the frontend (and backend, if backend/data_summary changed):

    cd backend
    pip install -r scripts/requirements-export.txt
    python scripts/export_json.py

Output is written to two places (identical content):
  - frontend/public/data/   consumed by the React app at runtime
  - backend/data_summary/   consumed by the /api/chat endpoint's Gemini context

Both directories are committed to git — there is no build step that
regenerates them automatically. See README.md for the manual update workflow.
"""

import json
import os

import pandas as pd

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REPO_ROOT = os.path.dirname(BACKEND_DIR)

DATA_DIR = os.path.join(BACKEND_DIR, "data")
F1 = os.path.join(DATA_DIR, "UD_2020_2024.xlsx")
F2 = os.path.join(DATA_DIR, "UD_GRAD_2020_2024.xlsx")

OUT_DIRS = [
    os.path.join(BACKEND_DIR, "data_summary"),
    os.path.join(REPO_ROOT, "frontend", "public", "data"),
]


def to_records(df: pd.DataFrame) -> list:
    return json.loads(df.to_json(orient="records"))


def write_json(name: str, obj) -> None:
    for out_dir in OUT_DIRS:
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f"{name}.json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
        print(f"wrote {path}")


def export_gender(gender: pd.DataFrame) -> None:
    agg = gender.groupby(["school_year", "gender"])["count"].sum().reset_index()
    pivot = agg.pivot(index="school_year", columns="gender", values="count").fillna(0).reset_index()
    pivot.columns.name = None
    pivot["total"] = pivot.get("F", 0) + pivot.get("M", 0)
    write_json("gender", to_records(pivot.sort_values("school_year")))


def export_race(race: pd.DataFrame) -> None:
    # Kept un-aggregated across years (school_year + race) so the frontend can
    # filter to a single year (or "All Years") before summing, exactly like
    # the old /api/students/race?year=... endpoint did server-side.
    agg = race.groupby(["school_year", "race_descp.x"])["count"].sum().reset_index()
    agg.columns = ["school_year", "race", "count"]
    write_json("race", to_records(agg.sort_values(["school_year", "race"])))


def export_gpa(gpa: pd.DataFrame) -> None:
    agg = gpa.groupby("school_year")[["total", "above_3_count", "below_3_count"]].sum().reset_index()
    agg["pct_above"] = (agg["above_3_count"] / agg["total"] * 100).round(1)
    agg["pct_below"] = (agg["below_3_count"] / agg["total"] * 100).round(1)
    write_json("gpa", to_records(agg.sort_values("school_year")))


def export_praxis(praxis_fail: pd.DataFrame) -> None:
    df = praxis_fail.copy()
    df["year"] = df["year"].astype(int)
    agg = df.groupby("year")[["total_graduates", "graduates_with_pass", "graduates_with_no_pass"]].sum().reset_index()
    agg["pass_rate"] = (agg["graduates_with_pass"] / agg["total_graduates"] * 100).round(1)
    write_json("praxis", to_records(agg.sort_values("year")))


def export_praxis_by_program(praxis_fail: pd.DataFrame) -> None:
    df = praxis_fail.copy()
    df["year"] = df["year"].astype(int)
    agg = df.groupby(["year", "program_id", "program_name"])[["total_graduates", "graduates_with_pass"]].sum().reset_index()
    agg["pass_rate"] = (agg["graduates_with_pass"] / agg["total_graduates"] * 100).round(1)
    write_json("praxis_by_program", to_records(agg.sort_values(["year", "pass_rate"], ascending=[True, False])))


def export_employment(employ: pd.DataFrame) -> None:
    df = employ.copy()
    df["school_year"] = df["school_year"].astype(int)
    agg = df.groupby(["school_year", "work_location_2"])["count"].sum().reset_index()
    agg.columns = ["school_year", "location", "count"]
    write_json("employment", to_records(agg.sort_values(["school_year", "location"])))


def export_hns(hns: pd.DataFrame) -> None:
    df = hns.copy()
    df["school_year"] = df["school_year"].astype(int)
    agg = df.groupby(["school_year", "hns"])["count"].sum().reset_index()
    write_json("hns", to_records(agg.sort_values(["school_year", "hns"])))


def export_retention(retention: pd.DataFrame) -> None:
    agg = retention.groupby(["graduate_cohort", "RetentionYear"])[["total", "Retained", "Not_Retained"]].sum().reset_index()
    agg["Retained_PCT"] = (agg["Retained"] / agg["total"] * 100).round(1)
    write_json("retention", to_records(agg))


def export_perception(grad_perc: pd.DataFrame, sup_perc: pd.DataFrame) -> None:
    dims = ["instrdesg", "contknow", "classmange", "instrprac", "profresp"]
    out_cols = ["school_year", "instrDesg", "contKnow", "classMgt", "instrPrac", "profResp"]

    grad = grad_perc.copy()
    grad["school_year"] = grad["school_year"].astype(str)
    grad_cols = [f"median_{dim}_row_average" for dim in dims]
    grad_agg = grad.groupby("school_year")[grad_cols].mean().round(3).reset_index()
    grad_agg.columns = out_cols

    sup = sup_perc.copy()
    sup["survey_year"] = sup["survey_year"].astype(str)
    sup_cols = [f"sup_median_{dim}_row_average" for dim in dims]
    sup_agg = sup.groupby("survey_year")[sup_cols].mean().round(3).reset_index()
    # normalized to "school_year" (same meaning: the survey year) so the
    # frontend can use one shared shape/filter for both raters
    sup_agg.columns = out_cols

    write_json("perception", {
        "graduate": to_records(grad_agg.sort_values("school_year")),
        "supervisor": to_records(sup_agg.sort_values("school_year")),
    })


def export_years(gender: pd.DataFrame) -> None:
    years = sorted(int(y) for y in gender["school_year"].unique().tolist())
    write_json("years", {"years": years})


def main() -> None:
    gender = pd.read_excel(F1, sheet_name="Gender_2020_2024_PROGS")
    race = pd.read_excel(F1, sheet_name="Race_2020_2024_Progs")
    gpa = pd.read_excel(F1, sheet_name="GPA_2020_2024_Progs")
    praxis_fail = pd.read_excel(F2, sheet_name="Praxis_fail_2020_2024")
    hns = pd.read_excel(F2, sheet_name="HNS 20202024")
    employ = pd.read_excel(F2, sheet_name="Employment by Prog_20202024")
    retention = pd.read_excel(F2, sheet_name="Merged_retention_yr1_yr3")
    grad_perc = pd.read_excel(F2, sheet_name="grad_perception_5yr")
    sup_perc = pd.read_excel(F2, sheet_name="sup_perception_5yr")

    export_gender(gender)
    export_race(race)
    export_gpa(gpa)
    export_praxis(praxis_fail)
    export_praxis_by_program(praxis_fail)
    export_employment(employ)
    export_hns(hns)
    export_retention(retention)
    export_perception(grad_perc, sup_perc)
    export_years(gender)

    print("\nDone. Commit backend/data_summary/*.json and frontend/public/data/*.json, then redeploy.")


if __name__ == "__main__":
    main()
