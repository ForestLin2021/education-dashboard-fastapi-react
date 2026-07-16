// ─── STATIC DATA LAYER ─────────────────────────────────────────────────────
// Dashboard data is pre-aggregated offline (backend/scripts/export_json.py)
// and shipped as static JSON in public/data/. The app fetches those files
// directly instead of calling the (Render) backend — no cold start, no
// network round trip to a live API for the charts/KPIs.
//
// A few files (race/employment/hns) are exported at (school_year, group)
// granularity rather than pre-aggregated, so the "Year" filter can select a
// single year — or "All Years" — client-side, exactly like the old
// `year_filter(df, ...)` + `groupby(...)` did server-side.

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

// ── Helpers mirroring the old server-side pandas logic ─────────────────────

function filterByYear<T>(rows: T[], year: string, yearKey: string): T[] {
  if (!year) return rows;
  return rows.filter(r => String((r as Record<string, unknown>)[yearKey]) === year);
}

function groupSumPct<K extends string>(
  rows: Array<Record<K, string> & { school_year: number; count: number }>,
  year: string,
  groupKey: K
): Array<Record<K, string> & { count: number; pct: number }> {
  const filtered = filterByYear(rows, year, "school_year");
  const totals = new Map<string, number>();
  for (const row of filtered) {
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

// ── Per-dataset hooks ────────────────────────────────────────────────────

export function useYearFilteredData<T>(file: string, year: string, yearKey = "school_year") {
  const { data, loading, error } = useStaticData<T[]>(file);
  const filtered = useMemo(() => (data ? filterByYear(data, year, yearKey) : null), [data, year, yearKey]);
  return { data: filtered, loading, error };
}

export function useGroupedByYear<K extends string>(file: string, year: string, groupKey: K) {
  const { data, loading, error } = useStaticData<Array<Record<K, string> & { school_year: number; count: number }>>(file);
  const grouped = useMemo(() => (data ? groupSumPct(data, year, groupKey) : null), [data, year, groupKey]);
  return { data: grouped, loading, error };
}
