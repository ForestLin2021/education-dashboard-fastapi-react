/**
 * @jest-environment jsdom
 *
 * Tab Switching Tests
 * Covers: default tab, switching tabs, active styling, content rendering per tab
 */
import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// ─── Minimal Tab system matching App.tsx ──────────────────────────────────────
type TabId = "overview" | "students" | "graduates" | "outcomes" | "perception";

interface Tab { id: TabId; label: string; }

const TABS: Tab[] = [
  { id: "overview",   label: "Overview"        },
  { id: "students",   label: "Student Profile" },
  { id: "graduates",  label: "Graduates"       },
  { id: "outcomes",   label: "Outcomes"        },
  { id: "perception", label: "Perception"      },
];

const PANEL_CONTENT: Record<TabId, string> = {
  overview:   "Overview Panel Content",
  students:   "Student Profile Panel Content",
  graduates:  "Graduates Panel Content",
  outcomes:   "Outcomes Panel Content",
  perception: "Perception Panel Content",
};

function TabApp() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <div>
      <nav>
        {TABS.map(tab => (
          <button
            key={tab.id}
            data-testid={`tab-${tab.id}`}
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main data-testid="panel-content">
        {PANEL_CONTENT[activeTab]}
      </main>
    </div>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────
describe("Tab switching", () => {
  test("renders all 5 tabs", () => {
    render(<TabApp />);
    TABS.forEach(tab => {
      expect(screen.getByTestId(`tab-${tab.id}`)).toBeInTheDocument();
    });
  });

  test("Overview tab is active by default", () => {
    render(<TabApp />);
    expect(screen.getByTestId("tab-overview")).toHaveAttribute("data-active", "true");
  });

  test("non-active tabs are not marked active by default", () => {
    render(<TabApp />);
    ["students", "graduates", "outcomes", "perception"].forEach(id => {
      expect(screen.getByTestId(`tab-${id}`)).toHaveAttribute("data-active", "false");
    });
  });

  test("shows Overview content by default", () => {
    render(<TabApp />);
    expect(screen.getByTestId("panel-content")).toHaveTextContent("Overview Panel Content");
  });

  test("switches to Students tab on click", () => {
    render(<TabApp />);
    fireEvent.click(screen.getByTestId("tab-students"));
    expect(screen.getByTestId("tab-students")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("panel-content")).toHaveTextContent("Student Profile Panel Content");
  });

  test("switches to Graduates tab on click", () => {
    render(<TabApp />);
    fireEvent.click(screen.getByTestId("tab-graduates"));
    expect(screen.getByTestId("panel-content")).toHaveTextContent("Graduates Panel Content");
  });

  test("switches to Outcomes tab on click", () => {
    render(<TabApp />);
    fireEvent.click(screen.getByTestId("tab-outcomes"));
    expect(screen.getByTestId("panel-content")).toHaveTextContent("Outcomes Panel Content");
  });

  test("switches to Perception tab on click", () => {
    render(<TabApp />);
    fireEvent.click(screen.getByTestId("tab-perception"));
    expect(screen.getByTestId("panel-content")).toHaveTextContent("Perception Panel Content");
  });

  test("deactivates previous tab when switching", () => {
    render(<TabApp />);
    fireEvent.click(screen.getByTestId("tab-students"));
    expect(screen.getByTestId("tab-overview")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("tab-students")).toHaveAttribute("data-active", "true");
  });

  test("can switch back to Overview after navigating away", () => {
    render(<TabApp />);
    fireEvent.click(screen.getByTestId("tab-graduates"));
    fireEvent.click(screen.getByTestId("tab-overview"));
    expect(screen.getByTestId("tab-overview")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("panel-content")).toHaveTextContent("Overview Panel Content");
  });

  test("only one tab is active at a time", () => {
    render(<TabApp />);
    fireEvent.click(screen.getByTestId("tab-perception"));

    const activeTabs = TABS.filter(tab =>
      screen.getByTestId(`tab-${tab.id}`).getAttribute("data-active") === "true"
    );
    expect(activeTabs).toHaveLength(1);
    expect(activeTabs[0].id).toBe("perception");
  });
});
