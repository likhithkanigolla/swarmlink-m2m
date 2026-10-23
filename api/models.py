from typing import List, Optional, Literal, Dict, Any, Union
from pydantic import BaseModel, Field

Layer = Literal[
    "radio", "core", "mec", "mca", "mcc", "device",
    "robot", "triage", "mcp", "llm", "dash"
]

Protocol = Literal["MQTT", "HTTP", "polling", "WebSocket", "MCP"]
Op = Literal["CREATE", "RETRIEVE", "UPDATE", "DELETE", "NOTIFY", "PING"]
M2MStatus = Literal[2000, 2001, 2002, 2004, 4004, 4044, 4103, 5000]

class SubsystemHealth(BaseModel):
    id: str
    label: str
    status: Literal["online", "standby", "warn", "crit", "offline"]
    endpoint: Optional[str] = None
    type: Optional[Literal["server", "radio", "wifi", "brain", "gateway"]] = None

class DeviceState(BaseModel):
    id: str
    roomId: str
    kind: str
    health: Literal["alive", "anomaly", "fault"]
    fault: Optional[Literal["nan", "outlier", "silent"]] = None
    lastSeenTs: int

class GridPos(BaseModel):
    col: int
    row: int

class RoomHealth(BaseModel):
    id: str
    name: str
    district: Literal["A", "B"]
    grid: GridPos
    health: Literal["healthy", "warning", "critical"]
    devices: List[DeviceState]

class RobotState(BaseModel):
    battery: float
    memPct: float
    posRoomId: str
    targetRoomId: Optional[str] = None
    progress: float
    route: List[str]
    detour: Optional[str] = None
    etaMs: int
    busy: bool

class QueueEntry(BaseModel):
    roomId: str
    score: float
    tags: List[str]
    why: str
    etaMs: int
    travelMs: int
    rank: int

class RemediationStep(BaseModel):
    id: str
    label: str
    detail: str = ""
    src: str = ""
    dst: str = ""
    status: Literal["done", "active", "pending", "error"]
    ts: Optional[int] = None
    latencyMs: Optional[int] = None

class RiskInfo(BaseModel):
    reason: str
    tier: Literal["LOW", "MEDIUM", "HIGH"]

class Incident(BaseModel):
    id: str
    roomId: str
    deviceId: str
    symptom: str
    escalation: Literal["oneM2M", "local", "llm", "human"]
    status: Literal["open", "in_progress", "pending_approval", "verifying", "resolved", "rejected"]
    risk: Optional[RiskInfo] = None
    proposedBy: Optional[Literal["local", "llm"]] = None
    remediationId: Optional[str] = None
    steps: List[RemediationStep] = []
    startedTs: int
    updatedAt: int

class RemediationCatalogEntry(BaseModel):
    id: str
    symptom: str
    steps: List[int]
    riskTier: Literal["LOW", "MEDIUM", "HIGH"]

class LinkHistoryItem(BaseModel):
    ts: int
    rsrp: float
    sinr: float

class LinkMetrics(BaseModel):
    rsrp: float
    sinr: float
    state: Literal["monitoring", "triggered", "re_registering", "restored"]
    interruptionMs: int
    district: Literal["A", "B"]
    history: List[LinkHistoryItem] = []
    threshold: float = -105.0

class AuditStep(BaseModel):
    id: str
    ts: int
    actor: Literal["rule", "local", "llm", "guardrail"]
    text: str
    verdict: Literal["pass", "block", "info"]

class TreeNode(BaseModel):
    id: str
    label: str
    kind: str
    path: str
    children: Optional[List["TreeNode"]] = None
    flashTs: Optional[int] = None

class Kpi(BaseModel):
    id: str
    label: str
    value: float
    unit: str
    spark: List[float] = []
    format: Optional[Literal["int", "float", "ms", "pct", "dbm"]] = None

class SecEntry(BaseModel):
    id: str
    ts: int
    src: str
    path: str
    acp: str
    verdict: Literal["allow", "deny"]
    code: Optional[int] = None

class FlStatus(BaseModel):
    round: int
    modelVersion: str
    status: Literal["idle", "training", "aggregating", "published"]

class TrafficEvent(BaseModel):
    id: str
    ts: int
    layer: Layer
    protocol: Protocol
    src: str
    dst: str
    op: Op
    path: str
    status: int
    latencyMs: int
    bytes: int
    correlationId: str
    payload: Optional[Dict[str, Any]] = None
    roomId: Optional[str] = None
    deviceId: Optional[str] = None
    incidentId: Optional[str] = None

class LayerBucket(BaseModel):
    bucketTs: int
    counts: Dict[str, int] = {}

class Snapshot(BaseModel):
    subsystems: List[SubsystemHealth]
    rooms: List[RoomHealth]
    robot: RobotState
    queue: List[QueueEntry]
    incidents: List[Incident]
    tree: TreeNode
    link: LinkMetrics
    kpis: List[Kpi]
    catalog: List[RemediationCatalogEntry]
    audit: List[AuditStep]
    security: List[SecEntry]
    fl: FlStatus
    layerHistory: List[LayerBucket] = []

class FeedMessage(BaseModel):
    type: str
    data: Any
