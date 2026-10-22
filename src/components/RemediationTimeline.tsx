import React from "react";
import { CheckCircle2, Clock, AlertTriangle, ArrowRight, ShieldAlert, Cpu, Sparkles, UserCheck } from "lucide-react";
import { useDashboard } from "@/store/dashboard";
import { CardShell } from "@/components/CardShell";
import type { Incident, Escalation } from "@/types/domain";

const ESCALATION_META: Record<
  Escalation,
  { label: string; badge: string; icon: React.ComponentType<{ className?: string }> }
> = {
  oneM2M: {
    label: "oneM2M lookup",
    badge: "bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-500/20",
    icon: CheckCircle2,
  },
  local: {
    label: "Local model",
    badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
    icon: Cpu,
  },
  llm: {
    label: "Edge LLM",
    badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20",
    icon: Sparkles,
  },
  human: {
    label: "Human approval",
    badge: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20",
    icon: UserCheck,
  },
};

export function RemediationTimeline() {
  const incidents = useDashboard((s) => s.incidents);
  const selectedIncidentId = useDashboard((s) => s.selectedIncidentId);
  const selectIncident = useDashboard((s) => s.selectIncident);

  // Active or selected incident
  const activeIncident =
    (selectedIncidentId ? incidents.find((i) => i.id === selectedIncidentId) : null) ??
    incidents[0];

  if (!activeIncident) {
    return (
      <CardShell
        id="remediation-timeline"
        title="Remediation Protocol Timeline"
        subtitle="M2M Autonomous Recovery Arc"
      >
        <div className="flex flex-col items-center justify-center p-6 text-center text-xs text-muted-foreground">
          <span>All sensor streams healthy. No active remediation arcs.</span>
        </div>
      </CardShell>
    );
  }

  const esc = ESCALATION_META[activeIncident.escalation] ?? ESCALATION_META.oneM2M;
  const EscIcon = esc.icon;

  return (
    <CardShell
      id="remediation-timeline"
      title="Remediation Protocol"
      subtitle={`${activeIncident.id} · Room ${activeIncident.roomId.replace("r", "")}`}
      action={
        <div className="flex items-center gap-1.5">
          {/* Incident picker if multiple */}
          {incidents.length > 1 && (
            <select
              value={activeIncident.id}
              onChange={(e) => selectIncident(e.target.value)}
              className="h-6 rounded border border-border bg-card px-1.5 text-[11px] font-mono text-foreground"
            >
              {incidents.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.id} ({i.status})
                </option>
              ))}
            </select>
          )}

          {/* Intelligence Escalation Badge */}
          <span
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${esc.badge}`}
          >
            <EscIcon className="h-3 w-3" />
            <span>{esc.label}</span>
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Incident Summary */}
        <div className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
          <div className="flex items-center justify-between font-semibold text-foreground mb-1">
            <span>Symptom: {activeIncident.symptom}</span>
            <span className="font-mono text-[10px] uppercase text-primary">
              {activeIncident.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono">
            <span>Target Node: {activeIncident.deviceId}</span>
            {activeIncident.remediationId && (
              <span>Catalogue ID: {activeIncident.remediationId}</span>
            )}
          </div>
        </div>

        {/* Vertical Timeline Steps */}
        <div className="relative flex flex-col gap-3 pl-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
          {activeIncident.steps.map((step, idx) => {
            const isDone = step.status === "done";
            const isActive = step.status === "active";
            const isError = step.status === "error";

            const dotBg = isDone
              ? "bg-emerald-500 border-emerald-200 dark:border-emerald-950"
              : isActive
              ? "bg-primary border-primary/30 animate-pulse"
              : isError
              ? "bg-rose-500 border-rose-200"
              : "bg-muted border-border";

            return (
              <div key={step.id} className="relative flex flex-col text-xs">
                {/* Status Dot */}
                <span
                  className={`absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 ${dotBg}`}
                />

                <div className="flex items-baseline justify-between">
                  <span
                    className={`font-semibold tracking-tight ${
                      isActive ? "text-primary" : isError ? "text-rose-600" : "text-foreground"
                    }`}
                  >
                    {step.label}
                  </span>
                  {step.latencyMs !== undefined && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {step.latencyMs} ms
                    </span>
                  )}
                </div>

                {step.detail && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{step.detail}</p>
                )}

                {(step.src || step.dst) && (
                  <div className="mt-1 flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                    <span className="text-foreground">{step.src}</span>
                    <ArrowRight className="h-2.5 w-2.5" />
                    <span className="text-foreground">{step.dst}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </CardShell>
  );
}
