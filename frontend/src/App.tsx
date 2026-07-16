import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, ComposedChart, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useStaticData, useFilteredData, useGroupedData, useGenderData, useGpaData, useRetentionData } from "./lib/staticData";
import ComplianceGauge from "./components/ComplianceGauge";
import DelawareCountyMap from "./components/DelawareCountyMap";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
// Dashboard charts/KPIs read static JSON from public/data/ (see lib/staticData.ts).
// The backend is only used for the chat feature below.
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Filters {
  year: string;
  program: string;
}

interface SelectOption {
  value: string;
  label: string;
}

interface PraxisRow {
  year: number;
  pass_rate: number;
  total_graduates: number;
}

interface EmploymentRow {
  location: string;
  count: number;
  pct: number;
}

interface RaceRow {
  race: string;
  count: number;
  pct: number;
}

interface PraxisByProgramRow {
  program_name: string;
  total_graduates: number;
  pass_rate: number;
}

interface HnsRow {
  hns: string;
  count: number;
}

interface PerceptionRow {
  school_year: string;
  instrDesg: number;
  contKnow: number;
  classMgt: number;
  instrPrac: number;
  profResp: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface YearsResponse {
  years: number[];
}

interface RetentionCombined {
  cohort: string;
  yr1: number;
  yr3: number | null;
}

interface RadarRow {
  dim: string;
  Graduate: number;
  Supervisor: number;
}

interface GpaTarget {
  metric: string;
  min: number;
  max: number;
  target: number;
}

interface PraxisWithTestsRow {
  year: number;
  with_tests: number;
  without_tests: number;
  total_graduates: number;
}

interface PraxisFrequencyRow {
  num_tests_taken: number;
  count: number;
  cum_pct: number;
}

interface PraxisDifficultyRow {
  course_title: string;
  unique_takers: number;
  avg_attempts_per_taker: number;
  pct_takers_passed: number;
  challenge_index: number;
}

interface EmploymentCountyRow {
  county: string;
  count: number;
}

// ─── COLOURS ─────────────────────────────────────────────────────────────────
const C = {
  blue:   "#2563eb",
  purple: "#7c3aed",
  teal:   "#0891b2",
  green:  "#16a34a",
  red:    "#dc2626",
  amber:  "#b45309",
  slate:  "#94a3b8",
} as const;

const PIE_COLORS = [C.blue, C.purple, C.teal, C.green, C.amber];

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────
const Spinner = () => (
  <div style={{ display: "flex", justifyContent: "center", padding: 32 }}>
    <div style={{
      width: 32, height: 32, border: `3px solid #e2e8f0`,
      borderTop: `3px solid ${C.blue}`, borderRadius: "50%",
      animation: "spin 0.8s linear infinite",
    }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);


interface KPICardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  trend?: number | null;
}
const KPICard = ({ label, value, sub, color = C.blue, trend }: KPICardProps) => (
  <div style={{
    background: "#fff", borderRadius: 16, padding: "20px 24px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)", borderLeft: `4px solid ${color}`,
  }}>
    <span style={{ fontSize: 11, color: "#64748b", fontFamily: "DM Sans,sans-serif", letterSpacing: ".06em", textTransform: "uppercase" }}>{label}</span>
    <div style={{ fontSize: 34, fontWeight: 700, color: "#0f172a", fontFamily: "Fraunces,serif", lineHeight: 1.1, marginTop: 4 }}>
      {value}
      {trend != null && (
        <span style={{ fontSize: 13, fontWeight: 500, color: trend >= 0 ? C.green : C.red, marginLeft: 8 }}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
        </span>
      )}
    </div>
    {sub && <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2, fontFamily: "DM Sans,sans-serif" }}>{sub}</div>}
  </div>
);

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  tip?: string;
  tipColor?: string;
}
const ChartCard = ({ title, children, tip, tipColor = C.blue }: ChartCardProps) => (
  <div style={{ background: "#fff", borderRadius: 16, padding: "20px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
    <p style={{ margin: "0 0 14px", fontFamily: "DM Sans,sans-serif", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: ".06em" }}>{title}</p>
    {children}
    {tip && (
      <div style={{ background: `${tipColor}12`, borderLeft: `3px solid ${tipColor}`, borderRadius: "0 8px 8px 0", padding: "9px 13px", marginTop: 12, fontSize: 12.5, color: "#334155", fontFamily: "DM Sans,sans-serif" }}>
        💡 {tip}
      </div>
    )}
  </div>
);

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  label: string;
}
const Select = ({ value, onChange, options, label }: SelectProps) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <span style={{ fontSize: 12, color: "#64748b", fontFamily: "DM Sans,sans-serif", whiteSpace: "nowrap" }}>{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      border: "1px solid #e2e8f0", borderRadius: 8, padding: "5px 10px",
      fontFamily: "DM Sans,sans-serif", fontSize: 13, color: "#1e293b", background: "#fff", cursor: "pointer",
      maxWidth: 220,
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// ─── INFO PANEL ──────────────────────────────────────────────────────────────
const INFO_SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "About this Dashboard",
    body: "A portfolio rebuild of the University of Delaware Educator Preparation Program report. KPIs, charts, and filters read pre-aggregated static JSON — nothing here waits on a live backend. The chat assistant (bottom-right) is the one feature that talks to a small FastAPI service.",
  },
  {
    title: "Data Sources",
    body: "Three source spreadsheets (gender/race/GPA by program, Praxis results, employment & retention) are exported offline into small JSON files, checked into this repo, and re-generated by hand whenever the source data changes — see the export script in backend/scripts/.",
  },
  {
    title: "How to Read This",
    body: "Year and Program filters apply across every tab. \"All Years\"/\"All Programs\" show the combined total; picking a specific year or program narrows every chart to just that slice. Where a KPI needs a single point-in-time number (e.g. Total Admitted), it defaults to the most recent year in the current filter.",
  },
];

function InfoPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,23,42,.4)", zIndex: 1100,
      display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "10vh 16px",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 16, maxWidth: 520, width: "100%",
        boxShadow: "0 20px 60px rgba(0,0,0,.25)", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #e2e8f0" }}>
          <span style={{ fontFamily: "Fraunces,serif", fontWeight: 700, fontSize: 17, color: "#0f172a" }}>ℹ️ Dashboard Info</span>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, cursor: "pointer", width: 28, height: 28, fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
          {INFO_SECTIONS.map(s => (
            <div key={s.title}>
              <p style={{ margin: "0 0 4px", fontFamily: "DM Sans,sans-serif", fontSize: 13, fontWeight: 700, color: C.blue }}>{s.title}</p>
              <p style={{ margin: 0, fontFamily: "DM Sans,sans-serif", fontSize: 13, color: "#475569", lineHeight: 1.6 }}>{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AI CHAT ─────────────────────────────────────────────────────────────────
const QUICK = [
  "Which program has the highest Praxis pass rate?",
  "How has retention changed over time?",
  "What's the gender breakdown trend?",
  "Explain the perception score dimensions",
  "How many graduates are teaching in Delaware in 2024?",
];

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: "assistant",
    content: "Hi! I'm your EPP data analyst. Ask me anything about UD's educator preparation data — Praxis rates, retention trends, employment, diversity, or perception scores.",
  }]);
  const [input, setInput]     = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = useCallback(async (text?: string) => {
    const content = text || input.trim();
    if (!content || loading) return;
    const newMessages: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json() as { reply: string };
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${msg}` }]);
    }
    setLoading(false);
  }, [input, loading, messages]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: "fixed", right: 24, bottom: 24, width: 390, height: 580,
      background: "#fff", borderRadius: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
      display: "flex", flexDirection: "column", zIndex: 1000,
      border: "1px solid #e2e8f0", overflow: "hidden",
    }}>
      {/* header */}
      <div style={{ background: "linear-gradient(135deg,#1e40af,#3b82f6)", padding: "15px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎓</div>
          <div>
            <div style={{ color: "#fff", fontFamily: "Fraunces,serif", fontWeight: 700, fontSize: 15 }}>EPP Data Assistant</div>
            <div style={{ color: "rgba(255,255,255,.65)", fontSize: 11, fontFamily: "DM Sans,sans-serif" }}>Powered by Gemini AI · Live Data</div>
          </div>
        </div>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,.2)", border: "none", borderRadius: 8, color: "#fff", cursor: "pointer", width: 28, height: 28, fontSize: 18, lineHeight: 1 }}>×</button>
      </div>

      {/* messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "85%", padding: "10px 14px",
              borderRadius: m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: m.role === "user" ? C.blue : "#f1f5f9",
              color: m.role === "user" ? "#fff" : "#1e293b",
              fontFamily: "DM Sans,sans-serif", fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap",
            }}>{m.content}</div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 5, padding: "10px 14px", background: "#f1f5f9", borderRadius: "16px 16px 16px 4px", width: "fit-content" }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#94a3b8", animation: "bounce 1.2s infinite", animationDelay: `${i * 0.2}s` }} />
            ))}
            <style>{`@keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}`}</style>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* quick prompts */}
      {messages.length < 3 && (
        <div style={{ padding: "0 14px 8px", display: "flex", flexWrap: "wrap", gap: 5 }}>
          {QUICK.map(q => (
            <button key={q} onClick={() => send(q)} style={{
              background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 20,
              padding: "4px 10px", fontSize: 11.5, color: "#1d4ed8", cursor: "pointer",
              fontFamily: "DM Sans,sans-serif",
            }}>{q}</button>
          ))}
        </div>
      )}

      {/* input */}
      <div style={{ padding: "11px 14px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && send()}
          placeholder="Ask about the data..."
          style={{ flex: 1, border: "1px solid #e2e8f0", borderRadius: 12, padding: "9px 13px", fontFamily: "DM Sans,sans-serif", fontSize: 13.5, outline: "none", color: "#1e293b" }}
        />
        <button onClick={() => send()} disabled={!input.trim() || loading} style={{
          background: input.trim() && !loading ? C.blue : "#94a3b8",
          border: "none", borderRadius: 12, padding: "0 16px", color: "#fff",
          cursor: input.trim() && !loading ? "pointer" : "default", fontSize: 20, transition: "background .2s",
        }}>↑</button>
      </div>
    </div>
  );
}

// ─── TABS ─────────────────────────────────────────────────────────────────────
type TabId = "overview" | "students" | "graduates" | "outcomes" | "perception";

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: "overview",   label: "Overview"        },
  { id: "students",   label: "Student Profile" },
  { id: "graduates",  label: "Graduates"       },
  { id: "outcomes",   label: "Outcomes"        },
  { id: "perception", label: "Perception"      },
];

// ── Overview ──────────────────────────────────────────────────────────────────
function OverviewTab({ filters }: { filters: Filters }) {
  const { data: praxisData, loading: lP } = useFilteredData<PraxisRow>("praxis", filters.year, "", "year");
  const { data: empData,    loading: lE } = useGroupedData("employment", filters.year, filters.program, "location");
  const { data: retData,    loading: lR } = useRetentionData(filters.program);
  const { data: gpaData,    loading: lG } = useGpaData(filters.year, filters.program);
  const { data: praxisAll }               = useStaticData<PraxisRow[]>("praxis");

  const latest    = praxisData?.[praxisData.length - 1];
  const empTotal  = empData?.reduce((s, d) => s + d.count, 0) ?? 0;
  const deTeach   = empData?.find(d => d.location === "DE")?.count ?? 0;
  const retYr1    = retData?.filter(d => d.RetentionYear === "Beyond Year 1") ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        <KPICard label="Programs Offered" value="22" sub="Bachelors & Masters" color={C.blue} />
        <KPICard label="Praxis Pass Rate" value={latest ? `${latest.pass_rate}%` : "—"} sub={latest ? `${latest.total_graduates} graduates tested` : ""} color={C.green} />
        <KPICard label="Teaching in DE" value={empTotal ? `${Math.round(deTeach / empTotal * 100)}%` : "—"} sub={`${deTeach} of ${empTotal} graduates`} color={C.purple} />
        <KPICard label="Avg YR1 Retention" value={retYr1.length ? `${(retYr1.reduce((s, d) => s + d.Retained_PCT, 0) / retYr1.length).toFixed(1)}%` : "—"} sub="Across all cohorts" color={C.teal} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard title="Praxis Pass Rate Trend" tip="2024 hit a historic 99.6% — nearly all programs at 100%.">
          {lP ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={praxisAll?.filter(d => d.pass_rate > 0)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis domain={[60, 101]} unit="%" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${v}%`, "Pass Rate"]} />
                <Line type="monotone" dataKey="pass_rate" stroke={C.blue} strokeWidth={3} dot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Graduate Employment" tip="50%+ teach in Delaware; 18% teach out-of-state.">
          {lE ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={empData ?? []} cx="50%" cy="50%" outerRadius={80} dataKey="count" isAnimationActive={false}
                  label={({ location, pct }: EmploymentRow) => `${location}: ${pct}%`}>
                  {empData?.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Year 1 Retention by Cohort" tip="2020 cohort led at 85.2%; 2023 dipped to 65.5%.">
          {lR ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={retYr1}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="graduate_cohort" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${v}%`, "Retained YR1"]} />
                <Bar dataKey="Retained_PCT" fill={C.blue} radius={[6, 6, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="GPA ≥ 3.0 Over Time" tip="Consistently 86–92%; 2022 peaked at 92.1%.">
          {lG ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={gpaData ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="school_year" tick={{ fontSize: 12 }} />
                <YAxis domain={[80, 100]} unit="%" tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${v}%`, "Above 3.0"]} />
                <Line type="monotone" dataKey="pct_above" stroke={C.green} strokeWidth={3} dot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// ── Students (+ Recruitment KPIs folded in) ────────────────────────────────
function StudentsTab({ filters }: { filters: Filters }) {
  const { data: genderData, loading: lG }   = useGenderData(filters.year, filters.program);
  const { data: raceData,   loading: lR }   = useGroupedData("race", filters.year, filters.program, "race");
  const { data: gpaData,    loading: lGPA } = useGpaData(filters.year, filters.program);
  const { data: gpaTarget }                 = useStaticData<GpaTarget>("gpa_target");

  // Recruitment KPI row always reflects a single point in time: the
  // selected year, or the most recent year within the current filter.
  const genderLatest = genderData?.[genderData.length - 1];
  const effectiveYear = genderLatest ? String(genderLatest.school_year) : filters.year;
  const { data: raceLatest } = useGroupedData("race", effectiveYear, filters.program, "race");
  const { data: gpaLatest }  = useGpaData(effectiveYear, filters.program);
  const gpaLatestRow = gpaLatest?.[gpaLatest.length - 1];

  const totalAdmitted = genderLatest?.total ?? 0;
  const femalePct = genderLatest ? Math.round((genderLatest.F / (genderLatest.total || 1)) * 1000) / 10 : 0;
  const colorTotal = raceLatest?.reduce((s, r) => s + r.count, 0) ?? 0;
  const colorCount = raceLatest?.filter(r => r.race !== "White, Not Hispanic").reduce((s, r) => s + r.count, 0) ?? 0;
  const colorPct = colorTotal ? Math.round((colorCount / colorTotal) * 1000) / 10 : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        <KPICard label="Total Admitted" value={totalAdmitted ? String(totalAdmitted) : "—"} sub={effectiveYear ? `School year ${effectiveYear}` : ""} color={C.blue} />
        <KPICard label="Female Candidates" value={genderLatest ? `${femalePct}%` : "—"} color={C.teal} />
        <KPICard label="Candidates of Color" value={raceLatest ? `${colorPct}%` : "—"} color={C.purple} />
        <div style={{ background: "#fff", borderRadius: 16, padding: "10px 16px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          {gpaTarget && gpaLatestRow ? (
            <ComplianceGauge label="GPA < 3.0 Admit Rate" value={gpaLatestRow.pct_below} target={gpaTarget.target} />
          ) : <Spinner />}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard title="Enrollment by Gender" tip="Education remains ~87% female; male enrollment peaked in 2021.">
          {lG ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={genderData ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="school_year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip /><Legend />
                <Bar dataKey="F" name="Female" fill={C.blue}   radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="M" name="Male"   fill={C.purple} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Race / Ethnicity" tip="88% White in 2024 — a diversity gap worth tracking.">
          {lR ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={raceData ?? []} cx="50%" cy="50%" outerRadius={85} dataKey="count" isAnimationActive={false}
                  label={({ race, pct }: RaceRow) => `${race}: ${pct}%`}>
                  {raceData?.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="GPA Distribution by Year" tip="GPA ≥ 3.0 has stayed consistently above 86% since 2020.">
        {lGPA ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={gpaData ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="school_year" tick={{ fontSize: 12 }} />
              <YAxis unit="%" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v}%`]} /><Legend />
              <Bar dataKey="pct_above" name="GPA ≥ 3.0" fill={C.green}  radius={[4, 4, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="pct_below" name="GPA < 3.0" fill="#fca5a5" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

// ── Graduates (+ Praxis attempts/difficulty depth) ──────────────────────────
function GraduatesTab({ filters }: { filters: Filters }) {
  const { data: praxisAll, loading: lP } = useStaticData<PraxisRow[]>("praxis");
  const { data: byProg,    loading: lB } = useFilteredData<PraxisByProgramRow>("praxis_by_program", filters.year || "2024", "", "year");

  const effYear = filters.year || "2024";
  const { data: withTests, loading: lWT } = useFilteredData<PraxisWithTestsRow>("praxis_with_tests", effYear, filters.program, "year");
  const { data: frequency, loading: lF }  = useFilteredData<PraxisFrequencyRow>("praxis_frequency", effYear, filters.program, "school_year");
  const { data: difficulty, loading: lD } = useFilteredData<PraxisDifficultyRow>("praxis_difficulty", effYear, filters.program, "school_year");

  const withTestsTotals = withTests?.reduce((s, r) => ({ with: s.with + r.with_tests, without: s.without + r.without_tests }), { with: 0, without: 0 });
  const difficultySorted = useMemo(() => [...(difficulty ?? [])].sort((a, b) => b.challenge_index - a.challenge_index), [difficulty]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <ChartCard title="Praxis Pass Rate Trend" tip="2021 dipped to 67.2%; 2024 recovered to 99.6%.">
        {lP ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={praxisAll?.filter(d => d.pass_rate > 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 105]} unit="%" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => [`${v}%`, "Pass Rate"]} />
              <Bar dataKey="pass_rate" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                {praxisAll?.filter(d => d.pass_rate > 0).map((e, i) => (
                  <Cell key={i} fill={e.pass_rate >= 95 ? C.green : e.pass_rate >= 80 ? C.blue : C.amber} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title={`Praxis Pass Rate by Program — ${filters.year || 2024}`} tip="16 of 17 programs achieved 100% in 2024. Masters Secondary STEM 4+1 was 75% (n=4).">
        {lB ? <Spinner /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans,sans-serif", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  {["Program", "Grads", "Pass Rate", "Bar"].map(h => (
                    <th key={h} style={{ textAlign: h === "Program" ? "left" : "center", padding: "8px 12px", color: "#64748b" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {byProg?.map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 ? "#fafafa" : "#fff" }}>
                    <td style={{ padding: "8px 12px", color: "#1e293b" }}>{p.program_name}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center", color: "#64748b" }}>{p.total_graduates}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <span style={{ background: p.pass_rate === 100 ? "#dcfce7" : "#fef3c7", color: p.pass_rate === 100 ? C.green : C.amber, borderRadius: 20, padding: "2px 10px", fontWeight: 700 }}>
                        {p.pass_rate}%
                      </span>
                    </td>
                    <td style={{ padding: "8px 12px", minWidth: 120 }}>
                      <div style={{ height: 8, borderRadius: 4, background: "#e2e8f0" }}>
                        <div style={{ height: "100%", borderRadius: 4, width: `${p.pass_rate}%`, background: p.pass_rate === 100 ? C.green : C.amber }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard title={`Graduates With Praxis Test vs Without — ${effYear}`} tip={withTestsTotals ? `${withTestsTotals.with} took at least one Praxis test; ${withTestsTotals.without} did not.` : undefined}>
          {lWT ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={withTests ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="program_name" hide />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip /><Legend />
                <Bar dataKey="with_tests" name="With Tests" stackId="t" fill={C.blue} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="without_tests" name="Without Tests" stackId="t" fill="#cbd5e1" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={`Praxis Test Attempts per Graduate — ${effYear}`} tip="Bars show graduates at each attempt count; the line is cumulative % of takers.">
          {lF ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={frequency ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="num_tests_taken" tick={{ fontSize: 12 }} label={{ value: "Attempts", position: "insideBottom", offset: -4, fontSize: 11 }} />
                <YAxis yAxisId="count" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="pct" orientation="right" unit="%" domain={[0, 100]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar yAxisId="count" dataKey="count" name="Grads at Attempt" fill={C.purple} radius={[4, 4, 0, 0]} isAnimationActive={false} />
                <Line yAxisId="pct" type="monotone" dataKey="cum_pct" name="Cumulative %" stroke={C.teal} strokeWidth={3} dot={{ r: 4 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title={`Test Difficulty — ${effYear}${filters.program ? "" : " (all programs)"}`} tip="Challenge Index = (avg attempts per taker)². Highest-challenge tests first.">
        {lD ? <Spinner /> : (
          <div style={{ overflowX: "auto", maxHeight: 320, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "DM Sans,sans-serif", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                  {["Praxis Test", "Takers", "Avg Attempts", "Pass Rate", "Challenge Index"].map(h => (
                    <th key={h} style={{ textAlign: h === "Praxis Test" ? "left" : "center", padding: "8px 12px", color: "#64748b", position: "sticky", top: 0, background: "#fff" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {difficultySorted.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f1f5f9", background: i % 2 ? "#fafafa" : "#fff" }}>
                    <td style={{ padding: "8px 12px", color: "#1e293b" }}>{r.course_title}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center", color: "#64748b" }}>{r.unique_takers}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center", color: "#64748b" }}>{r.avg_attempts_per_taker}</td>
                    <td style={{ padding: "8px 12px", textAlign: "center", color: r.pct_takers_passed === 100 ? C.green : C.amber }}>{r.pct_takers_passed}%</td>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>
                      <span style={{ background: r.challenge_index > 1 ? "#fef3c7" : "#dcfce7", color: r.challenge_index > 1 ? C.amber : C.green, borderRadius: 20, padding: "2px 10px", fontWeight: 700 }}>
                        {r.challenge_index}
                      </span>
                    </td>
                  </tr>
                ))}
                {!difficultySorted.length && (
                  <tr><td colSpan={5} style={{ padding: 16, textAlign: "center", color: "#94a3b8" }}>No Praxis attempts recorded for this selection.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

// ── Outcomes (+ county map) ─────────────────────────────────────────────────
function OutcomesTab({ filters }: { filters: Filters }) {
  const { data: empData, loading: lE } = useGroupedData("employment", filters.year, filters.program, "location");
  const { data: hnsData, loading: lH } = useGroupedData("hns", filters.year, filters.program, "hns");
  const { data: retData, loading: lR } = useRetentionData(filters.program);
  const { data: countyData, loading: lC } = useGroupedData<"county">("employment_county", filters.year, filters.program, "county");

  const yr1 = retData?.filter(d => d.RetentionYear === "Beyond Year 1") ?? [];
  const yr3 = retData?.filter(d => d.RetentionYear === "Beyond Year 3") ?? [];

  const combined: RetentionCombined[] = yr1.map(r1 => {
    const r3row = yr3.find(r => r.graduate_cohort === r1.graduate_cohort);
    return { cohort: r1.graduate_cohort, yr1: r1.Retained_PCT, yr3: r3row?.Retained_PCT ?? null };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard title="Graduate Employment" tip="50.4% teach in Delaware; 18.3% out of state; 31.3% not teaching.">
          {lE ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={empData ?? []} cx="50%" cy="50%" outerRadius={85} dataKey="count" isAnimationActive={false}
                  label={({ location, pct }: EmploymentRow) => `${location}: ${pct}%`}>
                  {empData?.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="High-Need School Placement" tipColor={C.red} tip="15.5% of 2024 employed graduates teach at High-Need Schools.">
          {lH ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={hnsData ?? []} cx="50%" cy="50%" outerRadius={85} dataKey="count" isAnimationActive={false}
                  label={({ hns, count }: HnsRow) => `${hns}: ${count}`}>
                  {hnsData?.map((_, i) => <Cell key={i} fill={[C.red, C.blue][i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Employment in Delaware by County" tip="Snapshot only — the source sheet currently tracks the most recent placement cycle (2025), not a multi-year history.">
        {lC ? <Spinner /> : (countyData && countyData.length > 0 ? (
          <DelawareCountyMap data={countyData as EmploymentCountyRow[]} />
        ) : (
          <div style={{ padding: 24, textAlign: "center", color: "#94a3b8", fontFamily: "DM Sans,sans-serif", fontSize: 13 }}>
            No county placement data for this selection (try "All Years" or "All Programs").
          </div>
        ))}
      </ChartCard>

      <ChartCard title="Teaching Retention: Year 1 vs Year 3" tip="Retention drops ~20 pts from YR1 → YR3, highlighting need for early-career support.">
        {lR ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={combined}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="cohort" tick={{ fontSize: 12 }} />
              <YAxis domain={[40, 100]} unit="%" tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => v ? [`${v}%`] : ["No data"]} />
              <Legend />
              <Line type="monotone" dataKey="yr1" name="Beyond Year 1" stroke={C.blue}   strokeWidth={3} dot={{ r: 5 }} isAnimationActive={false} />
              <Line type="monotone" dataKey="yr3" name="Beyond Year 3" stroke={C.purple} strokeWidth={3} dot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

// ── Perception ────────────────────────────────────────────────────────────────
interface Dim {
  key: keyof Omit<PerceptionRow, "school_year">;
  label: string;
}

const DIMS: Dim[] = [
  { key: "instrDesg",  label: "Instruction Design"    },
  { key: "contKnow",  label: "Content Knowledge"      },
  { key: "classMgt",  label: "Classroom Mgmt"         },
  { key: "instrPrac", label: "Instructional Practice" },
  { key: "profResp",  label: "Prof. Responsibility"   },
];

function PerceptionTab({ filters }: { filters: Filters }) {
  const { data: perception, loading: lPerc } = useStaticData<{ graduate: PerceptionRow[]; supervisor: PerceptionRow[] }>("perception");
  const gradData = useMemo(() => (
    !perception ? null : filters.year ? perception.graduate.filter(d => d.school_year === filters.year) : perception.graduate
  ), [perception, filters.year]);
  const supData = useMemo(() => (
    !perception ? null : filters.year ? perception.supervisor.filter(d => d.school_year === filters.year) : perception.supervisor
  ), [perception, filters.year]);
  const lG = lPerc, lS = lPerc;

  const gradLatest = gradData?.[gradData.length - 1];
  const supLatest  = supData?.[supData.length - 1];

  const radar: RadarRow[] = DIMS.map(d => ({
    dim:        d.label,
    Graduate:   gradLatest?.[d.key] ?? 0,
    Supervisor: supLatest?.[d.key]  ?? 0,
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard title="Perception Radar — Graduate vs Supervisor (latest year)" tip="Scores are 1–5. Both raters align closely; Content Knowledge scores highest.">
          {lG || lS ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radar}>
                <PolarGrid />
                <PolarAngleAxis dataKey="dim" tick={{ fontFamily: "DM Sans", fontSize: 11 }} />
                <Radar name="Graduate"   dataKey="Graduate"   stroke={C.blue}   fill={C.blue}   fillOpacity={0.2} isAnimationActive={false} />
                <Radar name="Supervisor" dataKey="Supervisor" stroke={C.purple} fill={C.purple} fillOpacity={0.2} isAnimationActive={false} />
                <Legend />
                <Tooltip formatter={(v: number) => [v?.toFixed(2)]} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Graduate Avg Perception Score — Trend" tip="2022 dipped to 2.89; recovery through 2024–2025.">
          {lG ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={gradData?.map(d => ({
                year: d.school_year,
                avg: parseFloat(((d.instrDesg + d.contKnow + d.classMgt + d.instrPrac + d.profResp) / 5).toFixed(2)),
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="year" tick={{ fontSize: 12 }} />
                <YAxis domain={[2, 4]} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [`${v}`, "Avg Score"]} />
                <Line type="monotone" dataKey="avg" stroke={C.blue} strokeWidth={3} dot={{ r: 5 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="All 5 Dimensions — Graduate Perception Trend">
        {lG ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={gradData ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="school_year" tick={{ fontSize: 12 }} />
              <YAxis domain={[2, 4.5]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => [v?.toFixed(2)]} /><Legend />
              {DIMS.map((d, i) => (
                <Line key={d.key} type="monotone" dataKey={d.key} name={d.label}
                  stroke={Object.values(C)[i]} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [activeTab,    setActiveTab]    = useState<TabId>("overview");
  const [chatOpen,     setChatOpen]     = useState(false);
  const [infoOpen,     setInfoOpen]     = useState(false);
  const [yearFilter,   setYearFilter]   = useState("");
  const [programFilter, setProgramFilter] = useState("");

  const { data: yearsData }    = useStaticData<YearsResponse>("years");
  const { data: programsData } = useStaticData<SelectOption[]>("programs");

  const yearOptions: SelectOption[] = [
    { value: "", label: "All Years" },
    ...(yearsData?.years ?? []).map(y => ({ value: String(y), label: String(y) })),
  ];

  const programOptions: SelectOption[] = [
    { value: "", label: "All Programs" },
    ...(programsData ?? []),
  ];

  const filters: Filters = { year: yearFilter, program: programFilter };

  const panels: Record<TabId, React.ReactNode> = {
    overview:   <OverviewTab   filters={filters} />,
    students:   <StudentsTab   filters={filters} />,
    graduates:  <GraduatesTab  filters={filters} />,
    outcomes:   <OutcomesTab   filters={filters} />,
    perception: <PerceptionTab filters={filters} />,
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@700;900&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "DM Sans,sans-serif" }}>

        {/* Header */}
        <div style={{ background: "#0f172a", padding: "0 32px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64, flexWrap: "wrap", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎓</div>
              <div>
                <div style={{ color: "#fff", fontFamily: "Fraunces,serif", fontWeight: 700, fontSize: 17 }}>University of Delaware</div>
                <div style={{ color: "#64748b", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Educator Preparation Program · EPP Report</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <Select value={programFilter} onChange={setProgramFilter} options={programOptions} label="Program:" />
              <Select value={yearFilter} onChange={setYearFilter} options={yearOptions} label="Year:" />
              <button onClick={() => setInfoOpen(true)} title="Dashboard info" style={{
                background: "rgba(255,255,255,.08)", border: "none", borderRadius: 8, cursor: "pointer",
                width: 30, height: 30, fontSize: 15, color: "#fff",
              }}>ℹ️</button>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} />
                <span style={{ color: "#64748b", fontSize: 12 }}>Static Data</span>
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex" }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: "16px 20px", border: "none", background: "transparent", cursor: "pointer",
                fontFamily: "DM Sans,sans-serif", fontSize: 14,
                fontWeight: activeTab === tab.id ? 700 : 500,
                color: activeTab === tab.id ? C.blue : "#64748b",
                borderBottom: activeTab === tab.id ? `3px solid ${C.blue}` : "3px solid transparent",
                transition: "all .2s", whiteSpace: "nowrap",
              }}>{tab.label}</button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
          {panels[activeTab]}
        </div>

        {/* Chat FAB */}
        {!chatOpen && (
          <button onClick={() => setChatOpen(true)} style={{
            position: "fixed", right: 24, bottom: 24, width: 56, height: 56,
            borderRadius: "50%", background: C.blue, border: "none", cursor: "pointer",
            boxShadow: "0 8px 24px rgba(37,99,235,.4)", fontSize: 22,
            display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999,
          }}>🤖</button>
        )}
        <ChatPanel isOpen={chatOpen} onClose={() => setChatOpen(false)} />
        <InfoPanel isOpen={infoOpen} onClose={() => setInfoOpen(false)} />
      </div>
    </>
  );
}
