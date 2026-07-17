// Simple SVG semicircle gauge for a value-vs-target compliance indicator
// (e.g. "% admitted with GPA < 3.0" vs a DOE-defined ceiling). No chart
// library needed — just arc geometry — so it stays visually consistent
// with the rest of the hand-styled dashboard.

interface ComplianceGaugeProps {
  label: string;
  value: number;
  target: number;
  /** true when higher values are worse (e.g. an acceptance-rate ceiling) */
  lowerIsBetter?: boolean;
  unit?: string;
}

const WIDTH = 200;
const HEIGHT = 120;
const CX = WIDTH / 2;
const CY = 104;
const R = 80;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 180) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

export default function ComplianceGauge({ label, value, target, lowerIsBetter = true, unit = "%" }: ComplianceGaugeProps) {
  const domainMax = Math.max(target * 2, value * 1.2, 1);
  const pct = Math.min(value / domainMax, 1);
  const isCompliant = lowerIsBetter ? value <= target : value >= target;
  const color = isCompliant ? "#0F9D58" : "#DB4437";
  const targetAngle = Math.min((target / domainMax) * 180, 180);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <svg width={WIDTH} height={HEIGHT + 4} viewBox={`0 0 ${WIDTH} ${HEIGHT + 4}`}>
        <path d={describeArc(CX, CY, R, 0, 180)} fill="none" stroke="#E0E0E0" strokeWidth={14} strokeLinecap="round" />
        <path d={describeArc(CX, CY, R, 0, pct * 180)} fill="none" stroke={color} strokeWidth={14} strokeLinecap="round" />
        {/* target tick */}
        {(() => {
          const inner = polarToCartesian(CX, CY, R - 11, targetAngle);
          const outer = polarToCartesian(CX, CY, R + 11, targetAngle);
          return <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#4D4D4D" strokeWidth={2} />;
        })()}
        <text x={CX} y={CY - 6} textAnchor="middle" fontSize={26} fontWeight={700} fontFamily="Playfair Display,serif" fill="#333333">
          {value}{unit}
        </text>
      </svg>
      <span style={{ fontSize: 11, color: "#6E7781", fontFamily: "DM Sans,sans-serif", marginTop: -4 }}>{label}</span>
      <div style={{
        marginTop: 6, fontSize: 11, fontWeight: 700, padding: "2px 10px", borderRadius: 20,
        background: isCompliant ? "#DCF2E7" : "#F9DAD6", color, fontFamily: "DM Sans,sans-serif",
      }}>
        {isCompliant ? "✅ Compliant" : "❌ Not Compliant"}
        <span style={{ fontWeight: 400, color: "#6E7781", marginLeft: 6 }}>target {lowerIsBetter ? "≤" : "≥"}{target}{unit}</span>
      </div>
    </div>
  );
}
