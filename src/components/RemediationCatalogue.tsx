import React from "react";
import { BookOpen } from "lucide-react";
import { useDashboard } from "@/store/dashboard";
import { CardShell } from "@/components/CardShell";
import { PRIMITIVE_NAMES } from "@/mock/scenario";

export function RemediationCatalogue() {
  const catalog = useDashboard((s) => s.catalog);

  return (
    <CardShell
      id="remediation-catalog"
      title="Remediation Catalogue"
      subtitle="oneM2M Primitives"
      defaultCollapsed={true}
      action={
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
          <BookOpen className="h-3 w-3" />
          <span>{catalog.length} solutions</span>
        </div>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-border/80 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            <tr>
              <th className="py-1.5 pl-2 pr-2">ID</th>
              <th className="py-1.5 px-2">Symptom</th>
              <th className="py-1.5 px-2">Primitive Steps</th>
              <th className="py-1.5 pr-2 pl-2 text-right">Risk</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40 font-mono text-[11px]">
            {catalog.map((cat) => {
              const riskColor =
                cat.riskTier === "HIGH"
                  ? "text-rose-600 bg-rose-500/10"
                  : cat.riskTier === "MEDIUM"
                  ? "text-amber-600 bg-amber-500/10"
                  : "text-emerald-600 bg-emerald-500/10";

              return (
                <tr key={cat.id} className="hover:bg-muted/40 transition-colors">
                  <td className="py-1.5 pl-2 pr-2 font-bold text-foreground">{cat.id}</td>
                  <td className="py-1.5 px-2 text-muted-foreground font-sans text-xs">
                    {cat.symptom}
                  </td>
                  <td className="py-1.5 px-2 text-muted-foreground">
                    <div className="flex flex-wrap items-center gap-1">
                      {cat.steps.map((st) => (
                        <span
                          key={st}
                          className="rounded bg-muted px-1.5 py-0.2 text-[9px] text-foreground font-mono"
                          title={PRIMITIVE_NAMES[st]}
                        >
                          {st}: {PRIMITIVE_NAMES[st] ?? "step"}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-1.5 pr-2 pl-2 text-right">
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${riskColor}`}>
                      {cat.riskTier}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CardShell>
  );
}
