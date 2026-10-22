import React from "react";
import { X, Copy, ExternalLink, ShieldAlert, CheckCircle2 } from "lucide-react";
import { useDashboard } from "@/store/dashboard";
import { layerLabel, statusTone } from "@/lib/layers";
import type { TrafficEvent } from "@/types/domain";

export function EventDrawer() {
  const drawerEvent = useDashboard((s) => s.drawerEvent);
  const openDrawer = useDashboard((s) => s.openDrawer);
  const incidents = useDashboard((s) => s.incidents);

  if (!drawerEvent) return null;

  const incident = drawerEvent.incidentId
    ? incidents.find((i) => i.id === drawerEvent.incidentId)
    : null;

  const tone = statusTone(drawerEvent.status);

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-card shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border p-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold text-foreground">
              {drawerEvent.id}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium uppercase ${
                tone === "crit"
                  ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                  : tone === "warn"
                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {drawerEvent.status}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {new Date(drawerEvent.ts).toISOString()} &middot; {drawerEvent.latencyMs} ms &middot; {drawerEvent.bytes} bytes
          </p>
        </div>
        <button
          onClick={() => openDrawer(null)}
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs">
        {/* Routing Summary */}
        <div className="rounded-lg border border-border bg-muted/40 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between font-mono">
            <span className="text-muted-foreground">Layer / Protocol:</span>
            <span className="font-semibold text-foreground">
              {layerLabel(drawerEvent.layer)} ({drawerEvent.protocol})
            </span>
          </div>
          <div className="flex items-center justify-between font-mono">
            <span className="text-muted-foreground">Source &rarr; Destination:</span>
            <span className="font-semibold text-foreground">
              {drawerEvent.src} &rarr; {drawerEvent.dst}
            </span>
          </div>
          <div className="flex items-center justify-between font-mono">
            <span className="text-muted-foreground">Operation:</span>
            <span className="font-semibold text-primary">{drawerEvent.op}</span>
          </div>
          <div className="flex items-start justify-between font-mono">
            <span className="text-muted-foreground shrink-0">Resource Path:</span>
            <span className="break-all text-right text-foreground font-mono text-[11px]">
              {drawerEvent.path}
            </span>
          </div>
          <div className="flex items-center justify-between font-mono">
            <span className="text-muted-foreground">Correlation ID:</span>
            <span className="text-muted-foreground font-mono">{drawerEvent.correlationId}</span>
          </div>
        </div>

        {/* M2M Headers */}
        <div>
          <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider mb-1.5 block">
            oneM2M Bindings &amp; Headers
          </span>
          <div className="rounded-lg border border-border bg-background p-2.5 font-mono text-[11px] flex flex-col gap-1 text-muted-foreground">
            <div>
              <span className="text-primary">X-M2M-Origin:</span> {drawerEvent.src}
            </div>
            <div>
              <span className="text-primary">X-M2M-RI:</span> {drawerEvent.correlationId}
            </div>
            <div>
              <span className="text-primary">X-M2M-RVI:</span> 4
            </div>
            <div>
              <span className="text-primary">Content-Type:</span> application/vnd.onem2m-res+json
            </div>
          </div>
        </div>

        {/* Payload JSON */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-foreground uppercase tracking-wider">
              Request / Response Payload
            </span>
            <button
              onClick={() =>
                navigator.clipboard.writeText(JSON.stringify(drawerEvent.payload ?? {}, null, 2))
              }
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
              <Copy className="h-3 w-3" />
              <span>Copy JSON</span>
            </button>
          </div>
          <pre className="rounded-lg border border-border bg-background p-3 font-mono text-[11px] text-foreground overflow-x-auto max-h-56">
            {JSON.stringify(drawerEvent.payload ?? { status: "no payload" }, null, 2)}
          </pre>
        </div>

        {/* Incident Context (Remediation Chain) */}
        {incident && (
          <div className="rounded-lg border border-teal-500/30 bg-teal-50/20 p-3 dark:bg-teal-950/20">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-foreground text-xs">
                Incident Chain ({incident.id})
              </span>
              <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-mono text-teal-700 dark:text-teal-300">
                {incident.status}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-2">
              <strong>Symptom:</strong> {incident.symptom} &middot; Room {incident.roomId.replace("r", "")} ({incident.deviceId})
            </p>
            <div className="flex flex-col gap-1 border-t border-teal-500/20 pt-2">
              {incident.steps.map((st, i) => (
                <div key={st.id} className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground font-mono">
                    {i + 1}. {st.label}
                  </span>
                  <span
                    className={`font-mono text-[10px] ${
                      st.status === "done"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : st.status === "active"
                        ? "text-primary font-semibold"
                        : st.status === "error"
                        ? "text-rose-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    {st.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
