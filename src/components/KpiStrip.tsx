import React from "react";
import { ResponsiveContainer, LineChart, Line } from "recharts";
import { useDashboard } from "@/store/dashboard";
import type { Kpi } from "@/types/domain";

function Sparkline({ data, tone }: { data: number[]; tone?: string }) {
  const chartData = (data || []).map((val, idx) => ({ i: idx, v: val }));
  const strokeColor =
    tone === "crit" ? "var(--crit, #ef4444)" : tone === "warn" ? "var(--warn, #f59e0b)" : "var(--primary, #0ea5e9)";

  return (
    <div className="h-6 w-16">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function formatVal(val: number, format?: Kpi["format"], unit?: string): string {
  if (format === "pct") return `${Math.round(val)}%`;
  if (format === "dbm") return `${Math.round(val)} dBm`;
  if (format === "ms") return `${Math.round(val)} ms`;
  if (format === "float") return `${(Math.round(val * 10) / 10).toFixed(1)} ${unit ?? ""}`;
  return `${Math.round(val)} ${unit ?? ""}`;
}

export function KpiStrip() {
  const kpis = useDashboard((s) => s.kpis);

  if (!kpis || kpis.length === 0) {
    return (
      <div className="h-14 border-b border-border bg-card/60 flex items-center px-4 text-xs text-muted-foreground">
        Initializing telemetry metrics…
      </div>
    );
  }

  // Split stats into two rows for a clean, non-cramped display
  const half = Math.ceil(kpis.length / 2);
  const row1 = kpis.slice(0, half);
  const row2 = kpis.slice(half);

  const renderKpiChip = (k: Kpi) => {
    let tone: "ok" | "warn" | "crit" = "ok";
    if (k.id === "rsrp" && k.value < -105) tone = "crit";
    else if (k.id === "rsrp" && k.value < -95) tone = "warn";
    if (k.id === "inc" && k.value > 1) tone = "crit";
    else if (k.id === "inc" && k.value > 0) tone = "warn";
    if (k.id === "bat" && k.value < 20) tone = "crit";
    else if (k.id === "bat" && k.value < 40) tone = "warn";
    if (k.id === "hint" && k.value > 0) tone = "warn";

    return (
      <div
        key={k.id}
        className="flex shrink-0 flex-1 min-w-[155px] max-w-[240px] items-center justify-between gap-2 rounded-lg border border-border/80 bg-background/80 px-2.5 py-1.5 shadow-2xs"
      >
        <div className="flex flex-col min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">
            {k.label}
          </span>
          <span className="text-xs font-semibold font-mono tracking-tight text-foreground truncate">
            {formatVal(k.value, k.format, k.unit)}
          </span>
        </div>
        <Sparkline data={k.spark} tone={tone} />
      </div>
    );
  };

  return (
    <div className="border-b border-border bg-card/70 px-4 py-2.5 backdrop-blur-xs flex flex-col gap-2">
      {/* Row 1 */}
      <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-none">
        {row1.map(renderKpiChip)}
      </div>

      {/* Row 2 */}
      <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-none">
        {row2.map(renderKpiChip)}
      </div>
    </div>
  );
}
