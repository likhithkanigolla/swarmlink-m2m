import React, { useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";
import { useDashboard } from "@/store/dashboard";
import { LAYERS } from "@/lib/layers";
import type { Layer } from "@/types/domain";

// Soft muted colors matching styles.css design tokens
const LAYER_COLORS: Record<Layer, string> = {
  radio: "#0ea5e9", // muted blue/teal
  core: "#6366f1", // muted indigo
  mec: "#06b6d4", // cyan
  mca: "#10b981", // muted emerald
  mcc: "#8b5cf6", // muted purple
  device: "#f59e0b", // warm amber/sand
  robot: "#14b8a6", // teal
  triage: "#ec4899", // pink/muted berry
  mcp: "#64748b", // slate
  llm: "#eab308", // gold/sand
  dash: "#94a3b8", // grey
};

export function TrafficAreaChart() {
  const layerHistory = useDashboard((s) => s.layerHistory);
  const events = useDashboard((s) => s.events);

  // Synthesize last 60 seconds data from layerHistory or recent events
  const chartData = useMemo(() => {
    if (layerHistory && layerHistory.length > 5) {
      return layerHistory.map((h, i) => {
        const row: Record<string, number> = { i };
        for (const l of LAYERS) {
          row[l.id] = (h.counts as Record<string, number | undefined>)[l.id] ?? 0;
        }
        return row;
      });
    }

    // fallback: empty 60 seconds
    return Array.from({ length: 60 }, (_, i) => {
      const row: Record<string, number> = { i };
      for (const l of LAYERS) row[l.id] = 0;
      return row;
    });
  }, [layerHistory]);

  return (
    <div className="flex flex-col gap-1.5 border-b border-border/80 bg-card/60 p-3">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-foreground tracking-tight">
          Traffic Density by Layer (last 60s)
        </span>
        <div className="hidden lg:flex items-center gap-2 text-[10px] text-muted-foreground">
          {LAYERS.slice(0, 7).map((l) => (
            <span key={l.id} className="flex items-center gap-1 font-mono">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: LAYER_COLORS[l.id] }}
              />
              {l.label.split(" ")[0]}
            </span>
          ))}
        </div>
      </div>
      <div className="h-16 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 2, right: 0, left: -20, bottom: 0 }}>
            {LAYERS.map((l) => (
              <Area
                key={l.id}
                type="monotone"
                dataKey={l.id}
                stackId="1"
                stroke={LAYER_COLORS[l.id]}
                fill={LAYER_COLORS[l.id]}
                fillOpacity={0.25}
                strokeWidth={1}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
