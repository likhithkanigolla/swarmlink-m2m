import React from "react";
import { ResponsiveContainer, LineChart, Line, ReferenceLine, XAxis, YAxis, Tooltip } from "recharts";
import { Radio, Wifi, ArrowRight } from "lucide-react";
import { useDashboard } from "@/store/dashboard";
import { CardShell } from "@/components/CardShell";

export function LinkHandoverMonitor() {
  const link = useDashboard((s) => s.link);

  if (!link) {
    return (
      <CardShell
        id="link-monitor"
        title="5G Radio Link &amp; Handover Monitor"
        subtitle="RSRP / SINR &middot; MEC edge roaming"
      >
        <div className="py-6 text-center text-xs text-muted-foreground">
          Calibrating radio telemetry…
        </div>
      </CardShell>
    );
  }

  const steps = [
    { id: "monitoring", label: "Monitoring" },
    { id: "triggered", label: "Triggered" },
    { id: "re_registering", label: "Re-registering" },
    { id: "restored", label: "Restored" },
  ];

  const currentStepIdx = steps.findIndex((s) => s.id === link.state);

  const chartData = link.history.map((h, i) => ({
    idx: i,
    rsrp: h.rsrp,
    sinr: h.sinr,
  }));

  return (
    <CardShell
      id="link-monitor"
      title="5G Radio Link &amp; Handover Monitor"
      subtitle={`District ${link.district} · Interruption: ${link.interruptionMs} ms`}
      action={
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="text-sky-600 dark:text-sky-400">RSRP: {Math.round(link.rsrp)} dBm</span>
          <span className="text-teal-600 dark:text-teal-400">SINR: {link.sinr.toFixed(1)} dB</span>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Handover State Stepper */}
        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 p-2 text-xs">
          {steps.map((st, i) => {
            const isCurrent = link.state === st.id;
            const isPassed = currentStepIdx >= i;

            return (
              <React.Fragment key={st.id}>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
                      isCurrent
                        ? "bg-primary text-primary-foreground animate-pulse"
                        : isPassed
                        ? "bg-emerald-500 text-white"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`text-[11px] font-medium ${
                      isCurrent ? "text-primary font-semibold" : "text-muted-foreground"
                    }`}
                  >
                    {st.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* RSRP / SINR Real-time Chart with -105 dBm threshold line */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
            <span>RSRP (dBm)</span>
            <span className="text-rose-500 font-semibold">Threshold: -105 dBm</span>
          </div>
          <div className="h-24 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -25, bottom: 0 }}>
                <YAxis domain={[-120, -70]} tick={{ fontSize: 9 }} />
                <ReferenceLine
                  y={-105}
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                  label={{ value: "H/O trigger", position: "insideTopRight", fill: "#ef4444", fontSize: 9 }}
                />
                <Line
                  type="monotone"
                  dataKey="rsrp"
                  stroke="#0ea5e9"
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </CardShell>
  );
}
