import { useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";
import deCounties from "../assets/de-counties.json";

// Delaware's 3 counties, bundled locally (US Census cartographic boundaries
// via the `us-atlas` dataset, extracted once — see git history / README).
// No external tile/geocoding requests, fits the static-only architecture.

interface CountyCount {
  county: string;
  count: number;
}

interface DelawareCountyMapProps {
  data: CountyCount[];
}

export default function DelawareCountyMap({ data }: DelawareCountyMapProps) {
  const [hovered, setHovered] = useState<{ name: string; count: number; x: number; y: number } | null>(null);
  const byCounty = new Map(data.map(d => [d.county, d.count]));
  const maxCount = Math.max(1, ...data.map(d => d.count));

  const colorFor = (count: number) => {
    if (!count) return "#eef2f7";
    const t = 0.25 + 0.75 * (count / maxCount);
    // interpolate between light and dark blue
    const r = Math.round(219 - t * (219 - 30));
    const g = Math.round(234 - t * (234 - 64));
    const b = Math.round(254 - t * (254 - 175));
    return `rgb(${r},${g},${b})`;
  };

  return (
    <div style={{ position: "relative" }}>
      <ComposableMap projection="geoMercator" projectionConfig={{ center: [-75.45, 39.0], scale: 9000 }} width={320} height={230} style={{ width: "100%", height: 230 }}>
        <Geographies geography={deCounties}>
          {({ geographies }) =>
            geographies.map(geo => {
              const name = geo.properties?.name as string;
              const count = byCounty.get(name) ?? 0;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={colorFor(count)}
                  stroke="#fff"
                  strokeWidth={1.5}
                  onMouseEnter={(e) => setHovered({ name, count, x: e.clientX, y: e.clientY })}
                  onMouseMove={(e) => setHovered({ name, count, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    default: { outline: "none" },
                    hover: { outline: "none", fill: "#2563eb", cursor: "pointer" },
                    pressed: { outline: "none" },
                  }}
                />
              );
            })
          }
        </Geographies>
      </ComposableMap>
      {hovered && (
        <div style={{
          position: "fixed", left: hovered.x + 12, top: hovered.y + 12, zIndex: 10,
          background: "#0f172a", color: "#fff", padding: "6px 10px", borderRadius: 8,
          fontFamily: "DM Sans,sans-serif", fontSize: 12.5, pointerEvents: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,.2)",
        }}>
          <strong>{hovered.name}</strong>: {hovered.count} employed
        </div>
      )}
    </div>
  );
}
