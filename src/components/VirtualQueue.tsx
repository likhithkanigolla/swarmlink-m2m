import React from "react";
import { ArrowUpDown, Clock, Navigation, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import { useDashboard } from "@/store/dashboard";
import { CardShell } from "@/components/CardShell";

export function VirtualQueue() {
  const queue = useDashboard((s) => s.queue);
  const incidents = useDashboard((s) => s.incidents);
  const focus = useDashboard((s) => s.focus);
  const setFocus = useDashboard((s) => s.setFocus);

  // Verifying rooms (where fixes were dispatched and robot returns to verify)
  const verifyingIncidents = incidents.filter((i) => i.status === "verifying");

  return (
    <div className="flex flex-col gap-4">
      {/* Virtual Queue Card */}
      <CardShell
        id="virtual-queue"
        title="Triage Priority Queue"
        subtitle="Ranked dispatch & autonomous re-planner"
        action={
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
            <ArrowUpDown className="h-3 w-3" />
            <span>Dynamic Cost</span>
          </div>
        }
      >
        <div className="flex flex-col gap-2.5">
          {/* Detour or Re-order Note Banner */}
          {queue.note && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-400/60 bg-amber-50/50 p-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200 animate-fadeIn">
              <Navigation className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div className="flex-1 font-medium">{queue.note}</div>
            </div>
          )}

          {/* Queue List */}
          <div className="flex flex-col gap-2">
            {queue.entries.map((entry) => {
              const isSelected = focus.kind === "room" && focus.id === entry.roomId;
              const maxScore = Math.max(...queue.entries.map((e) => e.score), 100);
              const scorePct = Math.min(100, Math.max(10, (entry.score / maxScore) * 100));

              return (
                <div
                  key={entry.roomId}
                  onClick={() =>
                    setFocus(
                      isSelected
                        ? { kind: null, id: null }
                        : { kind: "room", id: entry.roomId },
                    )
                  }
                  className={`flex flex-col rounded-lg border p-2.5 cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5 shadow-xs"
                      : "border-border/70 bg-card hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold font-mono text-foreground">
                        #{entry.rank}
                      </span>
                      <span className="text-xs font-semibold text-foreground">
                        Room {entry.roomId.replace("r", "")}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {entry.tags.map((tag) => {
                        const isCrit = tag.includes("critical") || tag.includes("fault");
                        return (
                          <span
                            key={tag}
                            className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${
                              isCrit
                                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {tag}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Why this room explanation line */}
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1.5">
                    <span className="truncate pr-2 italic">{entry.why}</span>
                    <span className="shrink-0 font-mono text-[10px]">
                      {(entry.travelMs / 1000).toFixed(0)}s travel
                    </span>
                  </div>

                  {/* Priority Score Bar */}
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-teal-500 transition-all duration-300"
                        style={{ width: `${scorePct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground w-8 text-right">
                      {Math.round(entry.score)} pts
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardShell>

      {/* Verification List Card */}
      <CardShell
        id="verification-list"
        title="Post-Remediation Verification"
        subtitle="Fix dispatched · Awaiting robot return"
        action={
          <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-mono text-teal-600 dark:text-teal-400">
            {verifyingIncidents.length} pending check
          </span>
        }
      >
        {verifyingIncidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-4 text-center text-xs text-muted-foreground">
            <ShieldCheck className="h-6 w-6 text-muted-foreground/60 mb-1.5" />
            <span>No pending verifications. All dispatched solutions confirmed.</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {verifyingIncidents.map((inc) => (
              <div
                key={inc.id}
                onClick={() => setFocus({ kind: "incident", id: inc.id })}
                className="flex items-center justify-between rounded-lg border border-teal-500/30 bg-teal-50/20 p-2.5 text-xs cursor-pointer hover:bg-teal-50/40 dark:bg-teal-950/20"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-teal-600 dark:text-teal-400 animate-spin" />
                  <div>
                    <div className="font-semibold text-foreground">
                      Room {inc.roomId.replace("r", "")} &middot; {inc.deviceId}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Sol {inc.remediationId ?? "1246"} applied &middot; return to verify
                    </div>
                  </div>
                </div>
                <span className="rounded bg-teal-500/20 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:text-teal-300">
                  Verifying
                </span>
              </div>
            ))}
          </div>
        )}
      </CardShell>
    </div>
  );
}
