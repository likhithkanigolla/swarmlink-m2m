import type { TrafficEvent } from "@/types/domain";
import { layerLabel } from "@/lib/layers";

export function toCsv(events: TrafficEvent[]): string {
  const head = ["ts", "time", "layer", "protocol", "src", "dst", "op", "path", "status", "latencyMs", "bytes", "correlationId"];
  const rows = events.map((e) => [
    e.ts,
    new Date(e.ts).toISOString(),
    layerLabel(e.layer),
    e.protocol,
    e.src,
    e.dst,
    e.op,
    e.path,
    e.status,
    e.latencyMs,
    e.bytes,
    e.correlationId,
  ]);
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [head.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export function downloadCsv(events: TrafficEvent[], filename = "swarmlink-traffic.csv") {
  const blob = new Blob([toCsv(events)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
