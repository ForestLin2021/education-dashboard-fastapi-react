// ─── STATIC DATA LAYER ─────────────────────────────────────────────────────
// Dashboard data is pre-aggregated offline (backend/scripts/export_json.py)
// and shipped as static JSON in public/data/. The app fetches those files
// directly instead of calling the (Render) backend — no cold start, no
// network round trip to a live API for the charts/KPIs.
//
// Most files are exported at raw (school_year, program_id, ...) granularity
// rather than pre-aggregated, so the Year and Program filters can each
// select "All" or a single value client-side, exactly like the old
// `year_filter(df, ...)` / `prog_filter(df, ...)` + `groupby(...)` did
// server-side.

import { useEffect, useMemo, useState } from "react";

const cache = new Map<string, Promise<unknown>>();

function fetchStatic<T>(file: string): Promise<T> {
  if (!cache.has(file)) {
    cache.set(
      file,
      fetch(`/data/${file}.json`).then(r => {
        if (!r.ok) throw new Error(`Failed to load ${file}.json: ${r.statusText}`);
        return r.json();
      })
    );
  }
  return cache.get(file) as Promise<T>;
}

export function useStaticData<T>(file: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchStatic<T>(file)
      .then(d => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [file]);

  return { data, loading, error };
}

// ── Filter helpers mirroring the old server-side pandas logic ──────────────

function matches(row: Record<string, unknown>, key: string, value: string): boolean {
  return !value || String(row[key]) === value;
}

function filterRows<T>(rows: T[], year: string, yearKey: string, program: string, programKey: string): T[] {
  return rows.filter(r => {
    const row = r as Record<string, unknown>;
    return matches(row, yearKey, year) && matches(row, programKey, program);
  });
}

function groupSumPct<K extends string>(
  rows: Array<Record<K, string> & { count: number }>,
  groupKey: K
): Array<Record<K, string> & { count: number; pct: number }> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const key = row[groupKey];
    totals.set(key, (totals.get(key) ?? 0) + row.count);
  }
  const grandTotal = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
  return [...totals.entries()].map(([key, count]) => ({
    [groupKey]: key,
    count,
    pct: Math.round((count / grandTotal) * 1000) / 10,
  })) as Array<Record<K, string> & { count: number; pct: number }>;
}

// ── Generic filtered/grouped hooks ──────────────────────────────────────────

export function useFilteredData<T>(
  file: string,
  year: string,
  program = "",
  yearKey = "school_year",
  programKey = "program_id"
) {
  const { data, loading, error } = useStaticData<T[]>(file);
  const filtered = useMemo(
    () => (data ? filterRows(data, year, yearKey, program, programKey) : null),
    [data, year, program, yearKey, programKey]
  );
  return { data: filtered, loading, error };
}

export function useGroupedData<K extends string>(
  file: string,
  year: string,
  program: string,
  groupKey: K,
  yearKey = "school_year",
  programKey = "program_id"
) {
  const { data, loading, error } = useStaticData<Array<Record<K, string> & { count: number }>>(file);
  const grouped = useMemo(() => {
    if (!data) return null;
    const filtered = filterRows(data, year, yearKey, program, programKey);
    return groupSumPct(filtered, groupKey);
  }, [data, year, program, groupKey, yearKey, programKey]);
  return { data: grouped, loading, error };
}

// ── Dataset-specific hooks (aggregation shape isn't a plain group-sum) ─────

interface GenderRawRow { school_year: number; program_id: number; gender: string; count: number }
export interface GenderRow { school_year: number; F: number; M: number; total: number }

export function useGenderData(year: string, program: string) {
  const { data, loading, error } = useStaticData<GenderRawRow[]>("gender");
  const result = useMemo(() => {
    if (!data) return null;
    const filtered = filterRows(data, year, "school_year", program, "program_id");
    const byYear = new Map<number, { F: number; M: number }>();
    for (const row of filtered) {
      const entry = byYear.get(row.school_year) ?? { F: 0, M: 0 };
      entry[row.gender as "F" | "M"] = (entry[row.gender as "F" | "M"] ?? 0) + row.count;
      byYear.set(row.school_year, entry);
    }
    const rows: GenderRow[] = [...byYear.entries()]
      .sort(([a], [b]) => a - b)
      .map(([school_year, { F, M }]) => ({ school_year, F, M, total: F + M }));
    return rows;
  }, [data, year, program]);
  return { data: result, loading, error };
}

interface GpaRawRow { school_year: number; program_id: number; total: number; above_3_count: number; below_3_count: number }
export interface GpaRow { school_year: number; total: number; above_3_count: number; below_3_count: number; pct_above: number; pct_below: number }

export function useGpaData(year: string, program: string) {
  const { data, loading, error } = useStaticData<GpaRawRow[]>("gpa");
  const result = useMemo(() => {
    if (!data) return null;
    const filtered = filterRows(data, year, "school_year", program, "program_id");
    const byYear = new Map<number, { total: number; above_3_count: number; below_3_count: number }>();
    for (const row of filtered) {
      const entry = byYear.get(row.school_year) ?? { total: 0, above_3_count: 0, below_3_count: 0 };
      entry.total += row.total;
      entry.above_3_count += row.above_3_count;
      entry.below_3_count += row.below_3_count;
      byYear.set(row.school_year, entry);
    }
    const rows: GpaRow[] = [...byYear.entries()]
      .sort(([a], [b]) => a - b)
      .map(([school_year, agg]) => ({
        school_year,
        ...agg,
        pct_above: Math.round((agg.above_3_count / (agg.total || 1)) * 1000) / 10,
        pct_below: Math.round((agg.below_3_count / (agg.total || 1)) * 1000) / 10,
      }));
    return rows;
  }, [data, year, program]);
  return { data: result, loading, error };
}

interface RetentionRawRow { graduate_cohort: string; RetentionYear: string; program_id: number; total: number; Retained: number; Not_Retained: number }
export interface RetentionRow { graduate_cohort: string; RetentionYear: string; total: number; Retained: number; Not_Retained: number; Retained_PCT: number }

export function useRetentionData(program: string) {
  const { data, loading, error } = useStaticData<RetentionRawRow[]>("retention");
  const result = useMemo(() => {
    if (!data) return null;
    const filtered = filterRows(data, "", "school_year", program, "program_id");
    const byGroup = new Map<string, { graduate_cohort: string; RetentionYear: string; total: number; Retained: number; Not_Retained: number }>();
    for (const row of filtered) {
      const key = `${row.graduate_cohort}__${row.RetentionYear}`;
      const entry = byGroup.get(key) ?? { graduate_cohort: row.graduate_cohort, RetentionYear: row.RetentionYear, total: 0, Retained: 0, Not_Retained: 0 };
      entry.total += row.total;
      entry.Retained += row.Retained;
      entry.Not_Retained += row.Not_Retained;
      byGroup.set(key, entry);
    }
    const rows: RetentionRow[] = [...byGroup.values()].map(agg => ({
      ...agg,
      Retained_PCT: Math.round((agg.Retained / (agg.total || 1)) * 1000) / 10,
    }));
    return rows;
  }, [data, program]);
  return { data: result, loading, error };
}
