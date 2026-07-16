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
F3 = os.path.join(DATA_DIR, "UD_Relationships.xlsx")

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
    # Kept un-aggregated across (school_year, program_id) so the frontend can
    # filter to a single year and/or program (or "All") before pivoting,
    # same pattern as race/employment/hns below.
    agg = gender.groupby(["school_year", "program_id", "program_name", "gender"])["count"].sum().reset_index()
    write_json("gender", to_records(agg.sort_values(["school_year", "program_id", "gender"])))


def export_race(race: pd.DataFrame) -> None:
    agg = race.groupby(["school_year", "program_id", "program_name", "race_descp.x"])["count"].sum().reset_index()
    agg.columns = ["school_year", "program_id", "program_name", "race", "count"]
    write_json("race", to_records(agg.sort_values(["school_year", "program_id", "race"])))


def export_gpa(gpa: pd.DataFrame) -> None:
    agg = gpa.groupby(["school_year", "program_id", "program_name"])[["total", "above_3_count", "below_3_count"]].sum().reset_index()
    write_json("gpa", to_records(agg.sort_values(["school_year", "program_id"])))


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
    agg = df.groupby(["school_year", "program_id", "program_name", "work_location_2"])["count"].sum().reset_index()
    agg.columns = ["school_year", "program_id", "program_name", "location", "count"]
    write_json("employment", to_records(agg.sort_values(["school_year", "program_id", "location"])))


def export_hns(hns: pd.DataFrame) -> None:
    df = hns.copy()
    df["school_year"] = df["school_year"].astype(int)
    agg = df.groupby(["school_year", "program_id", "program_name", "hns"])["count"].sum().reset_index()
    write_json("hns", to_records(agg.sort_values(["school_year", "program_id", "hns"])))


def export_retention(retention: pd.DataFrame) -> None:
    # Not year-filtered (frontend never has, matches the old unfiltered
    # /api/graduates/retention endpoint) but now filterable by program.
    agg = retention.groupby(["graduate_cohort", "RetentionYear", "program_id", "program_name"])[["total", "Retained", "Not_Retained"]].sum().reset_index()
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


def export_programs(programs: pd.DataFrame) -> None:
    rows = programs[["ProgramID", "Programs"]].drop_duplicates().sort_values("Programs")
    write_json("programs", [
        {"value": str(int(r.ProgramID)), "label": r.Programs} for r in rows.itertuples()
    ])


def export_gpa_target(gpa_target: pd.DataFrame) -> None:
    # Single-row lookup table: the compliance ceiling for "% admitted with
    # GPA below 3.0" (e.g. min 0 / max 10 / target 10 -> compliant at <=10%).
    df = gpa_target.rename(columns=lambda c: c.strip())
    row = df.iloc[0]
    write_json("gpa_target", {
        "metric": row["GPA"],
        "min": float(row["Min"]),
        "max": float(row["Max"]),
        "target": float(row["Target"]),
    })


def export_praxis_with_tests(praxis: pd.DataFrame) -> None:
    df = praxis.copy()
    df["year"] = df["year"].astype(int)
    agg = df.groupby(["year", "program_id", "program_name"])[["total_graduates", "with_tests", "without_tests"]].sum().reset_index()
    write_json("praxis_with_tests", to_records(agg.sort_values(["year", "program_id"])))


def export_praxis_frequency(freq: pd.DataFrame) -> None:
    df = freq.copy()
    df["school_year"] = df["school_year"].astype(int)
    agg = (
        df.groupby(["school_year", "program_id", "program_name", "num_tests_taken"])["count"]
        .sum()
        .reset_index()
        .sort_values(["school_year", "program_id", "num_tests_taken"])
    )
    # cumulative % of takers by attempt number, computed within each
    # (year, program) group — mirrors the PDF's bar+cumulative-line chart.
    group_totals = agg.groupby(["school_year", "program_id"])["count"].transform("sum")
    agg["cum_pct"] = (agg.groupby(["school_year", "program_id"])["count"].cumsum() / group_totals * 100).round(1)
    write_json("praxis_frequency", to_records(agg))


def export_praxis_difficulty(difficulty: pd.DataFrame) -> None:
    # Collapses the sheet's (school_year, program, test_year, course) grain
    # down to (school_year, program, course) — matching what the PDF shows —
    # by summing takers/attempts across retake test_years, then recomputing
    # avg_attempts_per_taker and challenge_index from the summed totals.
    # challenge_index = avg_attempts_per_taker^2 in every row of the source
    # sheet (verified), so re-deriving it this way after aggregation stays
    # consistent with the source rather than trying to average a squared value.
    df = difficulty.copy()
    agg = df.groupby(["school_year", "program_id", "program_name", "course_title"])[
        ["unique_takers", "total_attempts", "takers_passed", "takers_no_pass"]
    ].sum().reset_index()
    agg["avg_attempts_per_taker"] = (agg["total_attempts"] / agg["unique_takers"]).round(2)
    agg["pct_takers_passed"] = (agg["takers_passed"] / agg["unique_takers"] * 100).round(1)
    agg["challenge_index"] = (agg["avg_attempts_per_taker"] ** 2).round(2)
    write_json("praxis_difficulty", to_records(agg.sort_values(["school_year", "program_id", "challenge_index"], ascending=[True, True, False])))


def export_employment_county(employ_map: pd.DataFrame) -> None:
    # Employment_map only carries the most recent snapshot (currently 2025
    # only) of graduates placed within Delaware — there's no multi-year
    # history for this sheet yet.
    df = employ_map.rename(columns={"school_year.x": "school_year"})
    agg = df.groupby(["school_year", "program_id", "program_name", "county"]).size().reset_index(name="count")
    write_json("employment_county", to_records(agg.sort_values(["school_year", "program_id", "county"])))


def main() -> None:
    gender = pd.read_excel(F1, sheet_name="Gender_2020_2024_PROGS")
    race = pd.read_excel(F1, sheet_name="Race_2020_2024_Progs")
    gpa = pd.read_excel(F1, sheet_name="GPA_2020_2024_Progs")
    praxis = pd.read_excel(F2, sheet_name="Praxis_2020_2024")
    praxis_fail = pd.read_excel(F2, sheet_name="Praxis_fail_2020_2024")
    praxis_frequency = pd.read_excel(F2, sheet_name="Praxis_Frequency_5yrs")
    praxis_difficulty = pd.read_excel(F2, sheet_name="praxis_difficulty 5yrs")
    hns = pd.read_excel(F2, sheet_name="HNS 20202024")
    employ = pd.read_excel(F2, sheet_name="Employment by Prog_20202024")
    employ_map = pd.read_excel(F2, sheet_name="Employment_map")
    retention = pd.read_excel(F2, sheet_name="Merged_retention_yr1_yr3")
    grad_perc = pd.read_excel(F2, sheet_name="grad_perception_5yr")
    sup_perc = pd.read_excel(F2, sheet_name="sup_perception_5yr")
    programs = pd.read_excel(F3, sheet_name="DIMProgs")
    gpa_target = pd.read_excel(F3, sheet_name="DIM_GPA")

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
    export_programs(programs)
    export_gpa_target(gpa_target)
    export_praxis_with_tests(praxis)
    export_praxis_frequency(praxis_frequency)
    export_praxis_difficulty(praxis_difficulty)
    export_employment_county(employ_map)

    print("\nDone. Commit backend/data_summary/*.json and frontend/public/data/*.json, then redeploy.")


if __name__ == "__main__":
    main()
