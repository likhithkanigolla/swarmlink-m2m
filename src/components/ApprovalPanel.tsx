import React from "react";
import { ShieldAlert, Check, X, AlertTriangle, Sparkles } from "lucide-react";
import { useDashboard } from "@/store/dashboard";
import { CardShell } from "@/components/CardShell";

interface ApprovalPanelProps {
  onDecide: (incidentId: string, approve: boolean) => void;
}

export function ApprovalPanel({ onDecide }: ApprovalPanelProps) {
  const incidents = useDashboard((s) => s.incidents);

  // Find incidents requiring human operator approval
  const pending = incidents.filter((i) => i.status === "pending_approval");

  if (pending.length === 0) return null;

  return (
    <CardShell
      id="approval-panel"
      title="Pending Operator Approvals"
      subtitle="Autonomous Guardrail Intercept"
      className="border-amber-400/80 bg-amber-50/15 dark:border-amber-700/80 dark:bg-amber-950/20 shadow-sm"
      action={
        <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          <span>{pending.length} ACTION REQUIRED</span>
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {pending.map((inc) => (
          <div
            key={inc.id}
            className="flex flex-col gap-2.5 rounded-lg border border-amber-300/80 bg-card p-3 shadow-2xs dark:border-amber-800/80"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-foreground text-xs">
                    Incident {inc.id} &middot; Room {inc.roomId.replace("r", "")} ({inc.deviceId})
                  </span>
                  <span className="rounded bg-rose-500/10 px-1.5 py-0.2 text-[9px] font-bold font-mono text-rose-600 dark:text-rose-400">
                    {inc.risk?.tier ?? "HIGH"} RISK
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  <strong>Risk Rationale:</strong> {inc.risk?.reason ?? "Unverified compound recovery action"}
                </p>
              </div>
            </div>

            {/* Proposed action & originator */}
            <div className="flex items-center justify-between rounded-md bg-muted/50 p-2 text-[11px]">
              <div className="flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>
                  Proposed Solution: <strong className="font-mono text-foreground">{inc.remediationId ?? "1602"}</strong>
                </span>
              </div>
              <span className="text-muted-foreground">
                Origin: <span className="font-semibold text-foreground">{inc.proposedBy?.toUpperCase() ?? "EDGE LLM"}</span>
              </span>
            </div>

            {/* One-click Approve / Reject action buttons */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={() => onDecide(inc.id, false)}
                className="flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                <span>Reject &amp; Escalate</span>
              </button>
              <button
                onClick={() => onDecide(inc.id, true)}
                className="flex h-8 items-center gap-1 rounded-lg border border-teal-600 bg-teal-600 px-3 text-xs font-semibold text-white hover:bg-teal-700 shadow-xs transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Approve Remediation</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}
