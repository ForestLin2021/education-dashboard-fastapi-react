/**
 * @jest-environment jsdom
 *
 * UI Component Tests
 * Covers: KPICard, ChartCard, Select
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// ─── Inline minimal versions of the components for isolated testing ───────────
// (identical props/logic to App.tsx, extracted for testability)

const C = {
  blue: "#2563eb", green: "#16a34a", red: "#dc2626",
};

interface KPICardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  trend?: number | null;
}
const KPICard = ({ label, value, sub, color = C.blue, trend }: KPICardProps) => (
  <div data-testid="kpi-card" style={{ borderLeft: `4px solid ${color}` }}>
    <span data-testid="kpi-label">{label}</span>
    <div data-testid="kpi-value">
      {value}
      {trend != null && (
        <span data-testid="kpi-trend" style={{ color: trend >= 0 ? C.green : C.red }}>
          {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
        </span>
      )}
    </div>
    {sub && <div data-testid="kpi-sub">{sub}</div>}
  </div>
);

interface ChartCardProps {
  title: string;
  children: React.ReactNode;
  tip?: string;
  tipColor?: string;
}
const ChartCard = ({ title, children, tip }: ChartCardProps) => (
  <div data-testid="chart-card">
    <p data-testid="chart-title">{title}</p>
    {children}
    {tip && <div data-testid="chart-tip">💡 {tip}</div>}
  </div>
);

interface SelectOption { value: string; label: string; }
interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  label: string;
}
const Select = ({ value, onChange, options, label }: SelectProps) => (
  <div>
    <span>{label}</span>
    <select data-testid="select" value={value} onChange={e => onChange(e.target.value)}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

// ─── KPICard Tests ────────────────────────────────────────────────────────────
describe("KPICard", () => {
  test("renders label and value", () => {
    render(<KPICard label="Praxis Pass Rate" value="99.6%" />);
    expect(screen.getByTestId("kpi-label")).toHaveTextContent("Praxis Pass Rate");
    expect(screen.getByTestId("kpi-value")).toHaveTextContent("99.6%");
  });

  test("renders sub text when provided", () => {
    render(<KPICard label="Programs" value="22" sub="Bachelors & Masters" />);
    expect(screen.getByTestId("kpi-sub")).toHaveTextContent("Bachelors & Masters");
  });

  test("does not render sub text when omitted", () => {
    render(<KPICard label="Programs" value="22" />);
    expect(screen.queryByTestId("kpi-sub")).not.toBeInTheDocument();
  });

  test("renders positive trend with up arrow", () => {
    render(<KPICard label="Rate" value="90%" trend={5} />);
    expect(screen.getByTestId("kpi-trend")).toHaveTextContent("▲ 5%");
  });

  test("renders negative trend with down arrow", () => {
    render(<KPICard label="Rate" value="80%" trend={-3} />);
    expect(screen.getByTestId("kpi-trend")).toHaveTextContent("▼ 3%");
  });

  test("does not render trend when null", () => {
    render(<KPICard label="Rate" value="80%" trend={null} />);
    expect(screen.queryByTestId("kpi-trend")).not.toBeInTheDocument();
  });

  test("applies custom border color", () => {
    render(<KPICard label="Test" value="1" color="#ff0000" />);
    expect(screen.getByTestId("kpi-card")).toHaveStyle("border-left: 4px solid #ff0000");
  });
});

// ─── ChartCard Tests ──────────────────────────────────────────────────────────
describe("ChartCard", () => {
  test("renders title", () => {
    render(<ChartCard title="Praxis Trend"><div>chart</div></ChartCard>);
    expect(screen.getByTestId("chart-title")).toHaveTextContent("Praxis Trend");
  });

  test("renders children", () => {
    render(<ChartCard title="Test"><div data-testid="child">Chart Content</div></ChartCard>);
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  test("renders tip when provided", () => {
    render(<ChartCard title="Test" tip="2024 hit 99.6%"><div /></ChartCard>);
    expect(screen.getByTestId("chart-tip")).toHaveTextContent("2024 hit 99.6%");
  });

  test("does not render tip when omitted", () => {
    render(<ChartCard title="Test"><div /></ChartCard>);
    expect(screen.queryByTestId("chart-tip")).not.toBeInTheDocument();
  });
});

// ─── Select Tests ─────────────────────────────────────────────────────────────
describe("Select", () => {
  const options = [
    { value: "", label: "All Years" },
    { value: "2022", label: "2022" },
    { value: "2023", label: "2023" },
    { value: "2024", label: "2024" },
  ];

  test("renders label text", () => {
    render(<Select value="" onChange={jest.fn()} options={options} label="Year:" />);
    expect(screen.getByText("Year:")).toBeInTheDocument();
  });

  test("renders all options", () => {
    render(<Select value="" onChange={jest.fn()} options={options} label="Year:" />);
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  test("shows correct selected value", () => {
    render(<Select value="2024" onChange={jest.fn()} options={options} label="Year:" />);
    expect(screen.getByTestId("select")).toHaveValue("2024");
  });

  test("calls onChange with new value when user selects", () => {
    const onChange = jest.fn();
    render(<Select value="" onChange={onChange} options={options} label="Year:" />);
    fireEvent.change(screen.getByTestId("select"), { target: { value: "2023" } });
    expect(onChange).toHaveBeenCalledWith("2023");
  });

  test("calls onChange exactly once per interaction", () => {
    const onChange = jest.fn();
    render(<Select value="" onChange={onChange} options={options} label="Year:" />);
    fireEvent.change(screen.getByTestId("select"), { target: { value: "2022" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
