import React, { useState } from "react";
import { Shield, ChevronDown, ChevronUp, Lock, Network, Brain } from "lucide-react";
import { useDashboard } from "@/store/dashboard";

export function SecurityTray() {
  const [open, setOpen] = useState(false);
  const security = useDashboard((s) => s.security);
  const fl = useDashboard((s) => s.fl);

  return (
    <div className="border-t border-border bg-card/90 backdrop-blur-md">
      {/* Collapsed Bar / Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-10 w-full items-center justify-between px-4 sm:px-6 text-xs text-muted-foreground hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <Shield className="h-4 w-4 text-primary" />
            <span>oneM2M ACP Security &amp; Federated Learning Tray</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 font-mono text-[10px]">
            <span className="rounded bg-muted px-1.5 py-0.5">
              Sensors: write-only
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5">
              Robot: read/exec
            </span>
            <span className="rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 px-1.5 py-0.5">
              LLM: propose-only (4103 blocks)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px]">
          <span>FL Round {fl.round} ({fl.status})</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </div>
      </button>

      {/* Expanded Content */}
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-border p-4 sm:px-6">
          {/* Security Log Table (2 columns) */}
          <div className="md:col-span-2 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                Recent Access Control Policy (ACP) Decisions
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {security.length} audit entries
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border/70 bg-background p-2">
              <table className="w-full text-left text-[11px] font-mono">
                <thead className="text-[10px] text-muted-foreground uppercase border-b border-border/60">
                  <tr>
                    <th className="py-1 px-1.5">Time</th>
                    <th className="py-1 px-1.5">Subject</th>
                    <th className="py-1 px-1.5">Resource Path</th>
                    <th className="py-1 px-1.5">ACP Policy</th>
                    <th className="py-1 px-1.5 text-right">Verdict</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {security.slice(0, 15).map((sec) => (
                    <tr key={sec.id} className="hover:bg-muted/30">
                      <td className="py-1 px-1.5 text-muted-foreground text-[10px]">
                        {new Date(sec.ts).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                          hour12: false,
                        })}
                      </td>
                      <td className="py-1 px-1.5 font-semibold text-foreground">{sec.src}</td>
                      <td className="py-1 px-1.5 text-muted-foreground truncate max-w-xs">
                        {sec.path}
                      </td>
                      <td className="py-1 px-1.5 text-primary">{sec.acp}</td>
                      <td className="py-1 px-1.5 text-right">
                        <span
                          className={`rounded px-1.5 py-0.2 font-bold ${
                            sec.verdict === "deny"
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          }`}
                        >
                          {sec.verdict.toUpperCase()} {sec.code ? `(${sec.code})` : ""}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Federated Learning Status Card */}
          <div className="flex flex-col gap-2 rounded-lg border border-border/80 bg-muted/20 p-3">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Brain className="h-4 w-4 text-primary" />
              <span>Edge Federated Learning</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Local fault classifier weights aggregated across robot and MEC nodes without raw telemetry leaving private 5G.
            </p>
            <div className="mt-2 flex flex-col gap-2 text-xs font-mono">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Current Round:</span>
                <span className="font-bold text-foreground">Round {fl.round}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Model Version:</span>
                <span className="text-primary font-semibold">{fl.modelVersion}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Cycle State:</span>
                <span className="rounded bg-teal-500/10 text-teal-700 dark:text-teal-300 px-2 py-0.5 text-[10px] font-semibold uppercase">
                  {fl.status}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
