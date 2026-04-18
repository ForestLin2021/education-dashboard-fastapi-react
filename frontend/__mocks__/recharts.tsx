// __mocks__/recharts.tsx
// Recharts relies on SVG APIs not available in jsdom.
// We replace every export with a simple passthrough so tests can render without errors.
import React from "react";

const Noop = ({ children }: { children?: React.ReactNode }) => <>{children}</>;

export const ResponsiveContainer = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
export const LineChart     = Noop;
export const BarChart      = Noop;
export const PieChart      = Noop;
export const RadarChart    = Noop;
export const Line          = Noop;
export const Bar           = Noop;
export const Pie           = Noop;
export const Radar         = Noop;
export const Cell          = Noop;
export const XAxis         = Noop;
export const YAxis         = Noop;
export const CartesianGrid = Noop;
export const Tooltip       = Noop;
export const Legend        = Noop;
export const PolarGrid     = Noop;
export const PolarAngleAxis = Noop;
