import type { Layer, Protocol, M2MStatus } from "@/types/domain";

export const LAYERS: { id: Layer; label: string }[] = [
  { id: "radio", label: "Radio" },
  { id: "core", label: "5G Core" },
  { id: "mec", label: "MEC-IPE" },
  { id: "mca", label: "oneM2M Mca" },
  { id: "mcc", label: "oneM2M Mcc" },
  { id: "device", label: "Device (ESP)" },
  { id: "robot", label: "Robot" },
  { id: "triage", label: "Triage Engine" },
  { id: "mcp", label: "MCP" },
  { id: "llm", label: "LLM" },
  { id: "dash", label: "Dashboard" },
];

export const PROTOCOLS: Protocol[] = ["MQTT", "HTTP", "polling", "WebSocket", "MCP"];

export function layerLabel(l: Layer): string {
  return LAYERS.find((x) => x.id === l)?.label ?? l;
}

export const STATUS_META: Record<number, { label: string; tone: "ok" | "warn" | "crit" }> = {
  2000: { label: "2000 OK", tone: "ok" },
  2001: { label: "2001 Created", tone: "ok" },
  2002: { label: "2002 Deleted", tone: "ok" },
  2004: { label: "2004 Updated", tone: "ok" },
  4004: { label: "4004 Bad Request", tone: "warn" },
  4044: { label: "4044 Not Found", tone: "warn" },
  4103: { label: "4103 Denied", tone: "crit" },
  5000: { label: "5000 Internal", tone: "crit" },
};

export function statusTone(code: number): "ok" | "warn" | "crit" {
  return STATUS_META[code]?.tone ?? (code < 4000 ? "ok" : code < 5000 ? "warn" : "crit");
}
