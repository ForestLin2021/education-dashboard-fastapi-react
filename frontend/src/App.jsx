import { useState, useRef, useEffect, useCallback } from "react";
import {
  BarChart, Bar, LineChart, Line, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── DATA FETCHING HOOK ───────────────────────────────────────────────────────
function useAPI(path, params = {}) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const query = Object.entries(params)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");

  const url = `${API}${path}${query ? "?" + query : ""}`;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json(); })
      .then(d  => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [url]);

  return { data, loading, error };
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
};
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

const Err = ({ msg }) => (
  <div style={{ padding: 16, background: "#fef2f2", borderRadius: 8, color: C.red, fontSize: 13 }}>
    ⚠ {msg}
  </div>
);

const KPICard = ({ label, value, sub, color = C.blue, trend }) => (
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

const ChartCard = ({ title, children, tip, tipColor = C.blue }) => (
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

const Select = ({ value, onChange, options, label }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <span style={{ fontSize: 12, color: "#64748b", fontFamily: "DM Sans,sans-serif", whiteSpace: "nowrap" }}>{label}</span>
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      border: "1px solid #e2e8f0", borderRadius: 8, padding: "5px 10px",
      fontFamily: "DM Sans,sans-serif", fontSize: 13, color: "#1e293b", background: "#fff", cursor: "pointer",
    }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// ─── AI CHAT ─────────────────────────────────────────────────────────────────
const QUICK = [
  "Which program has the highest Praxis pass rate?",
  "How has retention changed over time?",
  "What's the gender breakdown trend?",
  "Explain the perception score dimensions",
  "How many graduates are teaching in Delaware in 2024?",
];

function ChatPanel({ isOpen, onClose }) {
  const [messages, setMessages] = useState([{
    role: "assistant",
    content: "Hi! I'm your EPP data analyst. Ask me anything about UD's educator preparation data — Praxis rates, retention trends, employment, diversity, or perception scores.",
  }]);
  const [input, setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = useCallback(async (text) => {
    const content = text || input.trim();
    if (!content || loading) return;
    const newMessages = [...messages, { role: "user", content }];
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
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
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
const TABS = [
  { id: "overview",   label: "Overview"        },
  { id: "students",   label: "Student Profile" },
  { id: "graduates",  label: "Graduates"       },
  { id: "outcomes",   label: "Outcomes"        },
  { id: "perception", label: "Perception"      },
];

// ── Overview ──────────────────────────────────────────────────────────────────
function OverviewTab({ filters }) {
  const { data: praxisData, loading: lP } = useAPI("/api/graduates/praxis", { year: filters.year });
  const { data: empData,    loading: lE } = useAPI("/api/graduates/employment", { year: filters.year });
  const { data: retData,    loading: lR } = useAPI("/api/graduates/retention");
  const { data: gpaData,    loading: lG } = useAPI("/api/students/gpa");

  const praxisAll = useAPI("/api/graduates/praxis").data;

  const latest = praxisData?.[praxisData.length - 1];
  const empTotal = empData?.reduce((s, d) => s + d.count, 0) || 0;
  const deTeach  = empData?.find(d => d.location === "DE")?.count || 0;

  const retYr1 = retData?.filter(d => d.RetentionYear === "Beyond Year 1") || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* KPIs */}
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
                <Tooltip formatter={v => [`${v}%`, "Pass Rate"]} />
                <Line type="monotone" dataKey="pass_rate" stroke={C.blue} strokeWidth={3} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Graduate Employment" tip="50%+ teach in Delaware; 18% teach out-of-state.">
          {lE ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={empData} cx="50%" cy="50%" outerRadius={80} dataKey="count"
                  label={({ location, pct }) => `${location}: ${pct}%`}>
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
                <Tooltip formatter={v => [`${v}%`, "Retained YR1"]} />
                <Bar dataKey="Retained_PCT" fill={C.blue} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="GPA ≥ 3.0 Over Time" tip="Consistently 86–92%; 2022 peaked at 92.1%.">
          {lG ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={gpaData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="school_year" tick={{ fontSize: 12 }} />
                <YAxis domain={[80, 100]} unit="%" tick={{ fontSize: 12 }} />
                <Tooltip formatter={v => [`${v}%`, "Above 3.0"]} />
                <Line type="monotone" dataKey="pct_above" stroke={C.green} strokeWidth={3} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

// ── Students ──────────────────────────────────────────────────────────────────
function StudentsTab({ filters }) {
  const { data: genderData, loading: lG } = useAPI("/api/students/gender", { year: filters.year });
  const { data: raceData,   loading: lR } = useAPI("/api/students/race",   { year: filters.year });
  const { data: gpaData,    loading: lGPA } = useAPI("/api/students/gpa",  { year: filters.year });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard title="Enrollment by Gender" tip="Education remains ~87% female; male enrollment peaked in 2021.">
          {lG ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={genderData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="school_year" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip /><Legend />
                <Bar dataKey="F" name="Female" fill={C.blue} radius={[4, 4, 0, 0]} />
                <Bar dataKey="M" name="Male"   fill={C.purple} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Race / Ethnicity" tip="88% White in 2024 — a diversity gap worth tracking.">
          {lR ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={raceData} cx="50%" cy="50%" outerRadius={85} dataKey="count"
                  label={({ race, pct }) => `${race}: ${pct}%`}>
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
            <BarChart data={gpaData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="school_year" tick={{ fontSize: 12 }} />
              <YAxis unit="%" tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => [`${v}%`]} /><Legend />
              <Bar dataKey="pct_above" name="GPA ≥ 3.0" fill={C.green}  radius={[4, 4, 0, 0]} />
              <Bar dataKey="pct_below" name="GPA < 3.0" fill="#fca5a5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

// ── Graduates ─────────────────────────────────────────────────────────────────
function GraduatesTab({ filters }) {
  const { data: praxisAll, loading: lP } = useAPI("/api/graduates/praxis");
  const { data: byProg,    loading: lB } = useAPI("/api/graduates/praxis/by-program", { year: filters.year || 2024 });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <ChartCard title="Praxis Pass Rate Trend" tip="2021 dipped to 67.2%; 2024 recovered to 99.6%.">
        {lP ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={praxisAll?.filter(d => d.pass_rate > 0)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="year" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 105]} unit="%" tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => [`${v}%`, "Pass Rate"]} />
              <Bar dataKey="pass_rate" radius={[6, 6, 0, 0]}>
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
    </div>
  );
}

// ── Outcomes ──────────────────────────────────────────────────────────────────
function OutcomesTab({ filters }) {
  const { data: empData, loading: lE } = useAPI("/api/graduates/employment", { year: filters.year });
  const { data: hnsData, loading: lH } = useAPI("/api/graduates/hns",        { year: filters.year });
  const { data: retData, loading: lR } = useAPI("/api/graduates/retention");

  const yr1 = retData?.filter(d => d.RetentionYear === "Beyond Year 1") || [];
  const yr3 = retData?.filter(d => d.RetentionYear === "Beyond Year 3") || [];

  const combined = yr1.map(r1 => {
    const r3 = yr3.find(r => r.graduate_cohort === r1.graduate_cohort);
    return { cohort: r1.graduate_cohort, yr1: r1.Retained_PCT, yr3: r3?.Retained_PCT ?? null };
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard title="Graduate Employment" tip="50.4% teach in Delaware; 18.3% out of state; 31.3% not teaching.">
          {lE ? <Spinner /> : (
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={empData} cx="50%" cy="50%" outerRadius={85} dataKey="count"
                  label={({ location, pct }) => `${location}: ${pct}%`}>
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
                <Pie data={hnsData} cx="50%" cy="50%" outerRadius={85} dataKey="count"
                  label={({ hns, count }) => `${hns}: ${count}`}>
                  {hnsData?.map((_, i) => <Cell key={i} fill={[C.red, C.blue][i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Teaching Retention: Year 1 vs Year 3" tip="Retention drops ~20 pts from YR1 → YR3, highlighting need for early-career support.">
        {lR ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={combined}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="cohort" tick={{ fontSize: 12 }} />
              <YAxis domain={[40, 100]} unit="%" tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => v ? [`${v}%`] : ["No data"]} />
              <Legend />
              <Line type="monotone" dataKey="yr1" name="Beyond Year 1" stroke={C.blue}   strokeWidth={3} dot={{ r: 5 }} />
              <Line type="monotone" dataKey="yr3" name="Beyond Year 3" stroke={C.purple} strokeWidth={3} dot={{ r: 5 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

// ── Perception ────────────────────────────────────────────────────────────────
const DIMS = [
  { key: "instrDesg",  label: "Instruction Design"     },
  { key: "contKnow",  label: "Content Knowledge"       },
  { key: "classMgt",  label: "Classroom Mgmt"          },
  { key: "instrPrac", label: "Instructional Practice"  },
  { key: "profResp",  label: "Prof. Responsibility"    },
];

function PerceptionTab({ filters }) {
  const { data: gradData, loading: lG } = useAPI("/api/graduates/perception", { rater: "graduate", year: filters.year });
  const { data: supData,  loading: lS } = useAPI("/api/graduates/perception", { rater: "supervisor", year: filters.year });

  // Build radar from latest year
  const gradLatest = gradData?.[gradData.length - 1];
  const supLatest  = supData?.[supData.length - 1];
  const radar = DIMS.map(d => ({
    dim: d.label,
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
                <Radar name="Graduate"   dataKey="Graduate"   stroke={C.blue}   fill={C.blue}   fillOpacity={0.2} />
                <Radar name="Supervisor" dataKey="Supervisor" stroke={C.purple} fill={C.purple} fillOpacity={0.2} />
                <Legend />
                <Tooltip formatter={v => [v?.toFixed(2)]} />
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
                <Tooltip formatter={v => [`${v}`, "Avg Score"]} />
                <Line type="monotone" dataKey="avg" stroke={C.blue} strokeWidth={3} dot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      <ChartCard title="All 5 Dimensions — Graduate Perception Trend">
        {lG ? <Spinner /> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={gradData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="school_year" tick={{ fontSize: 12 }} />
              <YAxis domain={[2, 4.5]} tick={{ fontSize: 12 }} />
              <Tooltip formatter={v => [v?.toFixed(2)]} /><Legend />
              {DIMS.map((d, i) => (
                <Line key={d.key} type="monotone" dataKey={d.key} name={d.label}
                  stroke={Object.values(C)[i]} strokeWidth={2} dot={{ r: 3 }} />
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
  const [activeTab, setChatOpen_tab] = useState("overview");
  const [chatOpen,  setChatOpen]     = useState(false);
  const [yearFilter, setYearFilter]  = useState("");

  const { data: yearsData } = useAPI("/api/years");
  const { data: progsData } = useAPI("/api/programs");

  const yearOptions = [{ value: "", label: "All Years" },
    ...(yearsData?.years || []).map(y => ({ value: y, label: String(y) }))];

  const filters = { year: yearFilter };

  const panels = {
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
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎓</div>
              <div>
                <div style={{ color: "#fff", fontFamily: "Fraunces,serif", fontWeight: 700, fontSize: 17 }}>University of Delaware</div>
                <div style={{ color: "#64748b", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase" }}>Educator Preparation Program · EPP Report</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <Select value={yearFilter} onChange={setYearFilter} options={yearOptions} label="Year:" />
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.green }} />
                <span style={{ color: "#64748b", fontSize: 12 }}>Live API</span>
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", padding: "0 32px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex" }}>
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setChatOpen_tab(tab.id)} style={{
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
      </div>
    </>
  );
}
