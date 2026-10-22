// Domain types for the SwarmLink-M2M Command Center.

export type Layer =
  | "radio"
  | "core"
  | "mec"
  | "mca"
  | "mcc"
  | "device"
  | "robot"
  | "triage"
  | "mcp"
  | "llm"
  | "dash";

export type Protocol = "MQTT" | "HTTP" | "polling" | "WebSocket" | "MCP";

export type Op = "CREATE" | "RETRIEVE" | "UPDATE" | "DELETE" | "NOTIFY" | "PING";

export type M2MStatus = 2000 | 2001 | 2002 | 2004 | 4004 | 4044 | 4103 | 5000;

export interface TrafficEvent {
  id: string;
  ts: number;
  layer: Layer;
  protocol: Protocol;
  src: string;
  dst: string;
  op: Op;
  path: string;
  status: M2MStatus;
  latencyMs: number;
  bytes: number;
  correlationId: string;
  payload?: Record<string, unknown>;
  roomId?: string;
  deviceId?: string;
  incidentId?: string;
}

export type DeviceHealth = "alive" | "anomaly" | "fault";

export interface DeviceState {
  id: string;
  roomId: string;
  kind: string;
  health: DeviceHealth;
  fault: "nan" | "outlier" | "silent" | null;
  lastSeenTs: number;
}

export type RoomId = string;

export interface RoomHealth {
  id: RoomId;
  name: string;
  district: "A" | "B";
  grid: { col: number; row: number };
  health: "healthy" | "warning" | "critical";
  devices: DeviceState[];
}

export interface RobotState {
  battery: number;
  memPct: number;
  posRoomId: RoomId;
  targetRoomId: RoomId | null;
  progress: number; // 0..1 between posRoom and target
  route: RoomId[];
  detour: RoomId | null;
  etaMs: number;
  busy: boolean;
}

export interface QueueEntry {
  roomId: RoomId;
  score: number;
  tags: string[];
  why: string;
  etaMs: number;
  travelMs: number;
  rank: number;
}

export type Escalation = "oneM2M" | "local" | "llm" | "human";

export type IncidentStatus =
  | "open"
  | "in_progress"
  | "pending_approval"
  | "verifying"
  | "resolved"
  | "rejected";

export type StepStatus = "done" | "active" | "pending" | "error";

export interface RemediationStep {
  id: string;
  label: string;
  detail: string;
  src: string;
  dst: string;
  status: StepStatus;
  ts?: number;
  latencyMs?: number;
}

export interface Incident {
  id: string;
  roomId: RoomId;
  deviceId: string;
  symptom: string;
  escalation: Escalation;
  status: IncidentStatus;
  risk?: { reason: string; tier: "LOW" | "MEDIUM" | "HIGH" };
  proposedBy?: "local" | "llm";
  remediationId?: string;
  steps: RemediationStep[];
  startedTs: number;
  updatedAt: number;
}

export interface RemediationCatalogEntry {
  id: string;
  symptom: string;
  steps: number[];
  riskTier: "LOW" | "MEDIUM" | "HIGH";
}

export interface LinkMetrics {
  rsrp: number;
  sinr: number;
  state: "monitoring" | "triggered" | "re_registering" | "restored";
  interruptionMs: number;
  district: "A" | "B";
  history: { ts: number; rsrp: number; sinr: number }[];
  threshold: number;
}

export interface AuditStep {
  id: string;
  ts: number;
  actor: "rule" | "local" | "llm" | "guardrail";
  text: string;
  verdict: "pass" | "block" | "info";
}

export type TreeKind =
  | "CSEBase"
  | "AE"
  | "container"
  | "timeSeries"
  | "mgmtObj"
  | "pollingChannel"
  | "flexContainer"
  | "group"
  | "ACP"
  | "semantic"
  | "catalog";

export interface TreeNode {
  id: string;
  label: string;
  kind: TreeKind;
  path: string;
  children?: TreeNode[];
  flashTs?: number;
}

export interface Kpi {
  id: string;
  label: string;
  value: number;
  unit: string;
  spark: number[];
  format?: "int" | "float" | "ms" | "pct" | "dbm";
}

export interface SecEntry {
  id: string;
  ts: number;
  src: string;
  path: string;
  acp: string;
  verdict: "allow" | "deny";
  code?: M2MStatus;
}

export interface FlStatus {
  round: number;
  modelVersion: string;
  status: "idle" | "training" | "aggregating" | "published";
}

export type FeedMessageType =
  | "event"
  | "metric"
  | "room"
  | "device"
  | "robot"
  | "queue"
  | "incident"
  | "audit"
  | "tree"
  | "link"
  | "security"
  | "fl"
  | "snapshot";

export interface FeedMessage {
  type: FeedMessageType;
  data: unknown;
}

export interface Snapshot {
  rooms: RoomHealth[];
  robot: RobotState;
  queue: QueueEntry[];
  incidents: Incident[];
  tree: TreeNode;
  link: LinkMetrics;
  kpis: Kpi[];
  catalog: RemediationCatalogEntry[];
  audit: AuditStep[];
  security: SecEntry[];
  fl: FlStatus;
  layerHistory: { bucketTs: number; counts: Partial<Record<Layer, number>> }[];
}

export type ConnectionStatus = "connected" | "reconnecting" | "disconnected" | "mock";

export interface StreamFilters {
  layers: Set<Layer>;
  protocols: Set<Protocol>;
  rooms: Set<string>;
  devices: Set<string>;
  errorsOnly: boolean;
  search: string;
}
