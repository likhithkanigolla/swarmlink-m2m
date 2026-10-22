import React from "react";
import { CheckCircle2, ShieldAlert, Cpu, Sparkles, Filter } from "lucide-react";
import { useDashboard } from "@/store/dashboard";
import { CardShell } from "@/components/CardShell";

export function AiAuditStream() {
  const audit = useDashboard((s) => s.audit);

  return (
    <CardShell
      id="ai-audit"
      title="Autonomous AI Audit &amp; Guardrail Log"
      subtitle="Triage reasoning &amp; safety barriers"
      action={
        <span className="font-mono text-[10px] text-muted-foreground">
          {audit.length} entries
        </span>
      }
    >
      <div className="flex flex-col gap-2 max-h-56 overflow-y-auto scrollbar-thin">
        {audit.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            No audit events logged yet.
          </div>
        ) : (
          audit.map((step) => {
            const isPass = step.verdict === "pass";
            const isBlock = step.verdict === "block";

            const actorBadge =
              step.actor === "guardrail"
                ? "bg-rose-500/10 text-rose-700 dark:text-rose-400"
                : step.actor === "llm"
                ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : step.actor === "local"
                ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
                : "bg-teal-500/10 text-teal-700 dark:text-teal-300";

            return (
              <div
                key={step.id}
                className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 text-xs"
              >
                {/* Verdict icon */}
                <div className="mt-0.5 shrink-0">
                  {isBlock ? (
                    <ShieldAlert className="h-3.5 w-3.5 text-rose-500" />
                  ) : isPass ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-sky-500 inline-block m-1" />
                  )}
                </div>

                <div className="flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-0.5">
                    <span
                      className={`rounded px-1.5 py-0.2 text-[9px] font-mono uppercase font-semibold ${actorBadge}`}
                    >
                      {step.actor}
                    </span>
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {new Date(step.ts).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        fractionalSecondDigits: 3,
                        hour12: false,
                      })}
                    </span>
                  </div>
                  <span className="text-[11px] text-foreground font-mono leading-tight">
                    {step.text}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </CardShell>
  );
}
