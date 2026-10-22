// MockAdapter scenario engine. Simulates the full SwarmLink-M2M system:
// ESP32 nodes, the robot doctor, MN-CSE District A/B, IN-CSE, 5G radio and the
// edge LLM. All timing is in simulated seconds so speed multipliers work.
import type {
  AuditStep,
  DeviceState,
  FeedMessage,
  FlStatus,
  Incident,
  Kpi,
  Layer,
  LinkMetrics,
  M2MStatus,
  Op,
  Protocol,
  QueueEntry,
  RemediationCatalogEntry,
  RemediationStep,
  RoomHealth,
  RobotState,
  SecEntry,
  Snapshot,
  SubsystemHealth,
  TrafficEvent,
  TreeNode,
} from "@/types/domain";

const CSE = "//acme.example.com/CSEBase";

export const CATALOG: RemediationCatalogEntry[] = [
  { id: "1246", symptom: "NaN burst on sensor stream", steps: [1, 2, 3, 5], riskTier: "LOW" },
  { id: "1310", symptom: "Persistent outlier / calibration drift", steps: [2, 4], riskTier: "MEDIUM" },
  { id: "1408", symptom: "Buffer overflow, stale telemetry", steps: [3], riskTier: "LOW" },
  { id: "1520", symptom: "Radio modem hang, no keepalive", steps: [1, 5], riskTier: "MEDIUM" },
  { id: "1602", symptom: "Unknown compound fault (LLM-proposed)", steps: [2, 4, 5], riskTier: "HIGH" },
];

export const PRIMITIVE_NAMES: Record<number, string> = {
  1: "restart sensor",
  2: "recalibrate",
  3: "flush buffer",
  4: "reset radio modem",
  5: "reboot node",
};

const DEVICE_KINDS = ["temp-humid", "co2", "occupancy", "vibration"];

interface Beat {
  t: number;
  fn: () => void;
}

function buildTree(rooms: RoomHealth[]): TreeNode {
  return {
    id: "cse",
    label: "CSEBase",
    kind: "CSEBase",
    path: CSE,
    children: [
      {
        id: "mn-a",
        label: "DistrictA-MN-CSE",
        kind: "CSEBase",
        path: `${CSE}/DistrictA-MN-CSE`,
        children: rooms
          .filter((r) => r.district === "A")
          .map((r) => roomNode(r)),
      },
      {
        id: "mn-b",
        label: "DistrictB-MN-CSE",
        kind: "CSEBase",
        path: `${CSE}/DistrictB-MN-CSE`,
        children: rooms
          .filter((r) => r.district === "B")
          .map((r) => roomNode(r)),
      },
      {
        id: "robot-ae",
        label: "RobotAE",
        kind: "AE",
        path: `${CSE}/RobotAE`,
        children: [
          { id: "polling", label: "pollingChannel", kind: "pollingChannel", path: `${CSE}/RobotAE/pollingChannel` },
          { id: "mgmt", label: "mgmtObj", kind: "mgmtObj", path: `${CSE}/RobotAE/mgmtObj` },
        ],
      },
      {
        id: "incidents",
        label: "flexContainer-incidents",
        kind: "flexContainer",
        path: `${CSE}/flexContainer-incidents`,
        children: [],
      },
      { id: "groups", label: "groups", kind: "group", path: `${CSE}/groups`, children: [{ id: "grp-a", label: "grp-rooms-A", kind: "group", path: `${CSE}/groups/grp-rooms-A` }] },
      {
        id: "acps",
        label: "ACPs",
        kind: "ACP",
        path: `${CSE}/ACPs`,
        children: [
          { id: "acp-s", label: "acp-sensors-write", kind: "ACP", path: `${CSE}/ACPs/acp-sensors-write` },
          { id: "acp-r", label: "acp-robot-exec", kind: "ACP", path: `${CSE}/ACPs/acp-robot-exec` },
          { id: "acp-l", label: "acp-llm-propose", kind: "ACP", path: `${CSE}/ACPs/acp-llm-propose` },
          { id: "acp-o", label: "acp-operator-approve", kind: "ACP", path: `${CSE}/ACPs/acp-operator-approve` },
        ],
      },
      {
        id: "catalog",
        label: "remediationCatalog",
        kind: "catalog",
        path: `${CSE}/remediationCatalog`,
        children: CATALOG.map((c) => ({ id: `cat-${c.id}`, label: c.id, kind: "catalog" as const, path: `${CSE}/remediationCatalog/${c.id}` })),
      },
    ],
  };
}

function roomNode(r: RoomHealth): TreeNode {
  return {
    id: `room-${r.id}`,
    label: r.name.replace(" ", ""),
    kind: "AE",
    path: `${CSE}/District${r.district}-MN-CSE/${r.name.replace(" ", "")}`,
    children: [
      { id: `ts-${r.id}`, label: "timeSeries", kind: "timeSeries", path: `${CSE}/.../${r.name.replace(" ", "")}/timeSeries` },
      { id: `h-${r.id}`, label: "health", kind: "container", path: `${CSE}/.../${r.name.replace(" ", "")}/health` },
      { id: `sem-${r.id}`, label: "semanticDescriptor", kind: "semantic", path: `${CSE}/.../${r.name.replace(" ", "")}/semanticDescriptor` },
    ],
  };
}

function emptyKpi(id: string, label: string, unit: string, format?: Kpi["format"]): Kpi {
  return { id, label, value: 0, unit, spark: Array(40).fill(0), ...(format ? { format } : {}) };
}

export class MockEngine {
  private emit: (m: FeedMessage) => void;
  private timer: ReturnType<typeof setInterval> | null = null;
  private t = 0;
  private speed = 1;
  private paused = false;
  private seq = 0;
  private beats: Beat[] = [];
  private firedUpTo = 0;
  private recurringNext = 130;

  private rooms: RoomHealth[];
  private robot: RobotState;
  private queue: QueueEntry[] = [];
  private incidents = new Map<string, Incident>();
  private audit: AuditStep[] = [];
  private security: SecEntry[] = [];
  private tree: TreeNode;
  private link: LinkMetrics;
  private subsystems: SubsystemHealth[] = [
    { id: "in-cse", label: "IN-CSE", status: "online", type: "server", endpoint: "//acme.example.com/CSEBase" },
    { id: "mn-a", label: "MN-CSE A", status: "online", type: "server", endpoint: "//acme.example.com/CSEBase/DistrictA-MN-CSE" },
    { id: "mn-b", label: "MN-CSE B", status: "standby", type: "server", endpoint: "//acme.example.com/CSEBase/DistrictB-MN-CSE" },
    { id: "5g-core", label: "5G Core", status: "online", type: "radio", endpoint: "core.5g.local" },
    { id: "radio", label: "5G Radio", status: "online", type: "wifi", endpoint: "gNB-DistrictA" },
    { id: "edge-llm", label: "Edge LLM", status: "online", type: "brain", endpoint: "llm-mcp.edge.local" },
  ];
  private fl: FlStatus = { round: 14, modelVersion: "v0.9.3", status: "idle" };
  private kpis: Kpi[];
  private layerBuckets: { bucketTs: number; counts: Partial<Record<Layer, number>> }[] = [];
  private curCounts: Partial<Record<Layer, number>> = {};
  private latencies: number[] = [];
  private restoredTimestamps: number[] = [];

  constructor(emit: (m: FeedMessage) => void, roomCount = 4) {
    this.emit = emit;
    this.rooms = this.makeRooms(roomCount);
    this.tree = buildTree(this.rooms);
    this.robot = {
      battery: 86,
      memPct: 41,
      posRoomId: "r1",
      targetRoomId: null,
      progress: 1,
      route: [],
      detour: null,
      etaMs: 0,
      busy: false,
    };
    this.link = {
      rsrp: -88,
      sinr: 18,
      state: "monitoring",
      interruptionMs: 0,
      district: "A",
      history: [],
      threshold: -105,
    };
    this.kpis = [
      emptyKpi("mps", "Messages / s", "msg/s", "float"),
      emptyKpi("lat", "Avg latency", "ms", "ms"),
      emptyKpi("rest", "Devices restored", "/min", "int"),
      emptyKpi("inc", "Active incidents", "", "int"),
      emptyKpi("rsrp", "RSRP", "dBm", "dbm"),
      emptyKpi("sinr", "SINR", "dB", "float"),
      emptyKpi("hint", "Handover int.", "ms", "ms"),
      emptyKpi("bat", "Robot battery", "%", "pct"),
      emptyKpi("mem", "Pi memory", "%", "pct"),
      emptyKpi("infpi", "Inference (Pi)", "ms", "ms"),
      emptyKpi("infmec", "Inference (MEC)", "ms", "ms"),
    ];
    this.buildBeats();
    for (let i = 0; i < 60; i++) {
      this.link.history.push({ ts: Date.now() - (60 - i) * 1000, rsrp: -88, sinr: 18 });
      this.layerBuckets.push({ bucketTs: Date.now() - (60 - i) * 1000, counts: {} });
    }
  }

  private makeRooms(n: number): RoomHealth[] {
    const rooms: RoomHealth[] = [];
    for (let i = 0; i < n; i++) {
      const id = `r${i + 1}`;
      const district: "A" | "B" = i < Math.ceil(n / 2) ? "A" : "B";
      rooms.push({
        id,
        name: `Room ${i + 1}`,
        district,
        grid: { col: i % 2, row: Math.floor(i / 2) },
        health: "healthy",
        devices: Array.from({ length: 3 }, (_, d) => {
          const dev: DeviceState = {
            id: `${id}-d${d + 1}`,
            roomId: id,
            kind: DEVICE_KINDS[d % DEVICE_KINDS.length] ?? "sensor",
            health: "alive",
            fault: null,
            lastSeenTs: Date.now(),
          };
          return dev;
        }),
      });
    }
    return rooms;
  }

  // ---------- lifecycle ----------

  start() {
    this.queue = this.computeQueue();
    // emit a batch of startup telemetry frames so the traffic hero is populated immediately
    for (const r of this.rooms) {
      for (const d of r.devices) {
        const path = `${CSE}/District${r.district}-MN-CSE/${r.name.replace(" ", "")}/${d.id}/timeSeries`;
        this.evRaw({
          layer: "device",
          protocol: "MQTT",
          src: d.id,
          dst: "MEC-IPE",
          op: "NOTIFY",
          path,
          status: 2000,
          payload: { m2m: { rep: { temp: 22.4, hum: 48.1 } } },
          roomId: r.id,
          deviceId: d.id,
        });
        this.evRaw({
          layer: "mca",
          protocol: "HTTP",
          src: "MEC-IPE",
          dst: "MN-CSE",
          op: "CREATE",
          path,
          status: 2001,
          roomId: r.id,
          deviceId: d.id,
        });
      }
    }
    this.pushSnapshot();
    this.timer = setInterval(() => this.tick(), 200);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setSpeed(s: number) {
    this.speed = s;
  }

  setPaused(p: boolean) {
    this.paused = p;
  }

  setRoomCount(n: number) {
    if (n === this.rooms.length) return;
    this.rooms = this.makeRooms(n);
    this.tree = buildTree(this.rooms);
    this.emitTree();
    this.emitRooms();
    this.pushSnapshot();
  }

  snapshot(): Snapshot {
    return {
      subsystems: this.subsystems,
      rooms: this.rooms,
      robot: this.robot,
      queue: this.queue,
      incidents: [...this.incidents.values()],
      tree: this.tree,
      link: this.link,
      kpis: this.kpis,
      catalog: CATALOG,
      audit: this.audit,
      security: this.security,
      fl: this.fl,
      layerHistory: this.layerBuckets,
    };
  }

  private pushSnapshot() {
    this.emit({ type: "snapshot", data: this.snapshot() });
  }

  // ---------- event helpers ----------

  private ev(p: {
    layer: Layer;
    protocol: Protocol;
    src: string;
    dst: string;
    op: Op;
    path: string;
    status: M2MStatus;
    latencyMs?: number;
    bytes?: number;
    payload?: Record<string, unknown>;
    roomId?: string;
    deviceId?: string;
    incidentId?: string;
  }) {
    const e: TrafficEvent = {
      id: `e${++this.seq}`,
      ts: Date.now(),
      correlationId: p.incidentId ? `c-${p.incidentId}` : `c-${this.seq}`,
      latencyMs: p.latencyMs ?? 8 + Math.round(Math.random() * 30),
      bytes: p.bytes ?? 120 + Math.round(Math.random() * 900),
      ...p,
    };
    this.emit({ type: "event", data: e });
    this.curCounts[p.layer] = (this.curCounts[p.layer] ?? 0) + 1;
    this.latencies.push(e.latencyMs);
    if (this.latencies.length > 200) this.latencies.shift();
  }

  private auditStep(actor: AuditStep["actor"], text: string, verdict: AuditStep["verdict"] = "info") {
    const s: AuditStep = { id: `a${++this.seq}`, ts: Date.now(), actor, text, verdict };
    this.audit = [s, ...this.audit].slice(0, 60);
    this.emit({ type: "audit", data: this.audit });
  }

  private secEntry(src: string, path: string, acp: string, verdict: SecEntry["verdict"], code?: M2MStatus) {
    const s: SecEntry = {
      id: `s${++this.seq}`,
      ts: Date.now(),
      src,
      path,
      acp,
      verdict,
      ...(code !== undefined ? { code } : {}),
    };
    this.security = [s, ...this.security].slice(0, 80);
    this.emit({ type: "security", data: this.security });
  }

  private flashTree(nodeId: string) {
    const walk = (n: TreeNode): TreeNode => {
      const flash = nodeId ? (n.id === nodeId ? Date.now() : n.flashTs) : n.flashTs;
      const res: TreeNode = {
        id: n.id,
        label: n.label,
        kind: n.kind,
        path: n.path,
        ...(flash !== undefined ? { flashTs: flash } : {}),
        ...(n.children !== undefined ? { children: n.children.map(walk) } : {}),
      };
      return res;
    };
    this.tree = walk(this.tree);
    this.emitTree();
  }

  private emitTree() {
    this.emit({ type: "tree", data: this.tree });
  }

  private emitRooms() {
    this.emit({ type: "room", data: this.rooms });
  }

  private emitRobot() {
    this.emit({ type: "robot", data: this.robot });
  }

  private emitQueue(note?: string) {
    this.queue = this.computeQueue();
    this.emit({ type: "queue", data: { entries: this.queue, note } });
  }

  private emitIncidents() {
    this.emit({ type: "incident", data: [...this.incidents.values()] });
  }

  // ---------- world mutations ----------

  private setDeviceFault(deviceId: string, fault: DeviceState["fault"]) {
    for (const r of this.rooms) {
      for (const d of r.devices) {
        if (d.id === deviceId) {
          d.fault = fault;
          d.health = fault ? "anomaly" : "alive";
          if (!fault) d.lastSeenTs = Date.now();
        }
      }
      const faults = r.devices.filter((d) => d.fault).length;
      r.health = faults === 0 ? "healthy" : faults === 1 ? "warning" : "critical";
    }
    this.emitRooms();
  }

  private openIncident(
    id: string,
    roomId: string,
    deviceId: string,
    symptom: string,
  ): Incident {
    const inc: Incident = {
      id,
      roomId,
      deviceId,
      symptom,
      escalation: "oneM2M",
      status: "open",
      steps: [],
      startedTs: Date.now(),
      updatedAt: Date.now(),
    };
    this.incidents.set(id, inc);
    this.tree = this.addIncidentNode(id);
    this.flashTree("incidents");
    this.emitIncidents();
    return inc;
  }

  private addIncidentNode(id: string): TreeNode {
    const walk = (n: TreeNode): TreeNode => {
      if (n.id === "incidents") {
        return {
          id: n.id,
          label: n.label,
          kind: n.kind,
          path: n.path,
          flashTs: Date.now(),
          children: [
            { id: `inc-${id}`, label: id, kind: "flexContainer" as const, path: `${CSE}/flexContainer-incidents/${id}` },
            ...(n.children ?? []),
          ],
        };
      }
      return {
        id: n.id,
        label: n.label,
        kind: n.kind,
        path: n.path,
        ...(n.flashTs !== undefined ? { flashTs: n.flashTs } : {}),
        ...(n.children !== undefined ? { children: n.children.map(walk) } : {}),
      };
    };
    return walk(this.tree);
  }

  private addSteps(
    inc: Incident,
    steps: Array<{
      label: string;
      detail?: string;
      src?: string;
      dst?: string;
      status?: RemediationStep["status"];
      ts?: number;
      latencyMs?: number;
    }>,
  ) {
    const made: RemediationStep[] = steps.map((s, i) => {
      const step: RemediationStep = {
        id: `${inc.id}-s${inc.steps.length + i + 1}`,
        label: s.label,
        detail: s.detail ?? "",
        src: s.src ?? "",
        dst: s.dst ?? "",
        status: s.status ?? "pending",
        ...(s.ts !== undefined ? { ts: s.ts } : {}),
        ...(s.latencyMs !== undefined ? { latencyMs: s.latencyMs } : {}),
      };
      return step;
    });
    inc.steps = [...inc.steps, ...made];
    inc.updatedAt = Date.now();
    this.emitIncidents();
  }

  private setStepStatus(inc: Incident, label: string, status: RemediationStep["status"], latency?: number) {
    for (const s of inc.steps) {
      if (s.label === label) {
        s.status = status;
        s.ts = Date.now();
        if (latency !== undefined) s.latencyMs = latency;
      }
    }
    inc.updatedAt = Date.now();
    this.emitIncidents();
  }

  private setIncident(inc: Incident, patch: Partial<Incident>) {
    Object.assign(inc, patch, { updatedAt: Date.now() });
    this.emitIncidents();
  }

  private resolveIncident(inc: Incident) {
    this.setIncident(inc, { status: "resolved" });
    this.restoredTimestamps.push(this.t);
  }

  private computeQueue(): QueueEntry[] {
    return this.rooms
      .map((r) => {
        const faults = r.devices.filter((d) => d.fault).length;
        const recoverable = faults;
        const etaMs = faults * 45000;
        const travelMs = 20000 + r.grid.row * 8000 + r.grid.col * 5000;
        const score = faults * 40 + recoverable * 10 - travelMs / 4000;
        const tags: string[] = [];
        if (faults) tags.push(`${faults} fault${faults > 1 ? "s" : ""}`);
        if (r.health === "critical") tags.push("critical");
        else if (r.health === "warning") tags.push("warning");
        if (recoverable) tags.push(`${recoverable} recoverable`);
        const why = faults
          ? `${faults} device${faults > 1 ? "s" : ""} up in 5 min vs 0`
          : "all devices healthy";
        return { roomId: r.id, score, tags, why, etaMs, travelMs, rank: 0 };
      })
      .sort((a, b) => b.score - a.score)
      .map((q, i) => ({ ...q, rank: i + 1 }));
  }

  // ---------- robot movement ----------

  private moveRobotTo(roomId: string) {
    this.robot.route = [roomId];
    this.robot.detour = null;
    this.robot.targetRoomId = roomId;
    this.robot.progress = 0;
    this.robot.busy = true;
    this.emitRobot();
  }

  private appendRoute(roomId: string) {
    this.robot.route = [...this.robot.route, roomId];
    this.emitRobot();
  }

  // ---------- main loop ----------

  private tick() {
    if (this.paused) return;
    const prev = this.t;
    this.t += 0.2 * this.speed;
    // fire beats
    for (const b of this.beats) {
      if (b.t > this.firedUpTo && b.t <= this.t) b.fn();
    }
    this.firedUpTo = Math.floor(this.t);
    this.ambient();
    this.updateRobot();
    this.updateLink();

    // second boundaries → metrics
    if (Math.floor(this.t) > Math.floor(prev)) {
      this.secondTick();
    }
  }

  private secondTick() {
    const mps = Object.values(this.curCounts).reduce((a, b) => a + (b ?? 0), 0);
    const avgLat = this.latencies.length
      ? this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length
      : 0;
    const restored = this.restoredTimestamps.filter((x) => x > this.t - 60).length;
    const active = [...this.incidents.values()].filter(
      (i) => i.status !== "resolved" && i.status !== "rejected",
    ).length;
    const noise = (base: number, spread: number) =>
      Math.round((base + (Math.random() - 0.5) * spread) * 10) / 10;

    const values: Record<string, number> = {
      mps: mps,
      lat: Math.round(avgLat),
      rest: restored,
      inc: active,
      rsrp: Math.round(this.link.rsrp),
      sinr: Math.round(this.link.sinr * 10) / 10,
      hint: this.link.interruptionMs,
      bat: Math.round(this.robot.battery),
      mem: Math.round(this.robot.memPct + (Math.random() - 0.5) * 4),
      infpi: noise(24, 14),
      infmec: noise(58, 30),
    };
    this.curCounts = {};
    for (const k of this.kpis) {
      k.value = values[k.id] ?? k.value;
      k.spark = [...k.spark.slice(1), k.value];
    }
    this.emit({ type: "metric", data: { kpis: this.kpis } });

    const now = Date.now();
    this.layerBuckets = [...this.layerBuckets.slice(1), { bucketTs: now, counts: this.curCounts }];
    this.link.history = [...this.link.history.slice(1), { ts: now, rsrp: this.link.rsrp, sinr: this.link.sinr }];
    this.emit({ type: "link", data: this.link });

    // battery drain
    this.robot.battery = Math.max(5, this.robot.battery - 0.05 * this.speed);
  }

  private updateRobot() {
    if (this.robot.busy && this.robot.targetRoomId && this.robot.progress < 1) {
      const before = Math.floor(this.robot.progress * 10);
      this.robot.progress = Math.min(1, this.robot.progress + 0.04 * this.speed);
      if (Math.floor(this.robot.progress * 10) !== before) this.emitRobot();
      if (this.robot.progress >= 1) {
        this.robot.posRoomId = this.robot.targetRoomId;
        this.robot.busy = false;
        this.robot.etaMs = 0;
        this.emitRobot();
        this.onRobotArrive(this.robot.targetRoomId);
      }
    }
  }

  private onRobotArrive(roomId: string) {
    if (roomId === "r2" && this.incidents.get("inc-001")?.status === "in_progress") this.arriveRoom2();
    else if (roomId === "r3" && this.incidents.get("inc-002")?.status === "open") this.arriveRoom3();
    else if (roomId === "r2" && this.incidents.get("inc-001")?.status === "verifying") this.verifyRoom2();
  }

  // ---------- ambient traffic ----------

  private ambient() {
    const roll = (p: number) => Math.random() < p * this.speed;
    // device telemetry chains
    if (roll(0.5)) {
      const r = this.rooms[Math.floor(Math.random() * this.rooms.length)];
      if (r && r.devices.length > 0) {
        const d = r.devices[Math.floor(Math.random() * r.devices.length)];
        if (d) {
          const corr = `c-${++this.seq}`;
          const path = `${CSE}/District${r.district}-MN-CSE/${r.name.replace(" ", "")}/${d.id}/timeSeries`;
          this.evRaw({
            layer: "device", protocol: "MQTT", src: d.id, dst: "MEC-IPE", op: "NOTIFY", path, status: 2000,
            payload: { m2m: { rep: { temp: 21 + Math.random() * 4, hum: 45 + Math.random() * 10 } } },
            roomId: r.id, deviceId: d.id,
          });
          this.evRaw({
            layer: "mca", protocol: "HTTP", src: "MEC-IPE", dst: "MN-CSE", op: "CREATE", path, status: 2001,
            correlationId: corr, roomId: r.id, deviceId: d.id,
          });
          if (roll(0.4)) {
            this.evRaw({
              layer: "mcc", protocol: "HTTP", src: "MN-CSE", dst: "IN-CSE", op: "NOTIFY", path, status: 2000,
              correlationId: corr, roomId: r.id, deviceId: d.id,
            });
          }
        }
      }
    }
    // robot polls its pollingChannel
    if (roll(0.45)) {
      this.evRaw({
        layer: "mcc", protocol: "polling", src: "IN-CSE", dst: "RobotAE", op: "NOTIFY",
        path: `${CSE}/RobotAE/pollingChannel`, status: 2000, bytes: 300,
      });
    }
    // radio measurements
    if (roll(0.35)) {
      this.evRaw({
        layer: "radio", protocol: "MQTT", src: "gNB-DistrictA", dst: "5G-Core", op: "NOTIFY",
        path: "n2/measurement-report", status: 2000, bytes: 90,
        payload: { rsrp: Math.round(this.link.rsrp), sinr: Math.round(this.link.sinr) },
      });
    }
    // core paging / registration
    if (roll(0.12)) {
      this.evRaw({
        layer: "core", protocol: "HTTP", src: "5G-Core", dst: "MEC-IPE", op: "UPDATE",
        path: "nudm/ue-context-update", status: 2004, bytes: 210,
      });
    }
    // dashboard websocket batches
    if (roll(0.25)) {
      this.evRaw({
        layer: "dash", protocol: "WebSocket", src: "Backend", dst: "Dashboard", op: "NOTIFY",
        path: "/ws/events", status: 2000, bytes: 480 + Math.round(Math.random() * 600),
        payload: { batch: Math.ceil(Math.random() * 6), types: ["event", "metric"] },
      });
    }
    // LLM denies itself from writing (ACP), ambient
    if (roll(0.05)) {
      this.evRaw({
        layer: "llm", protocol: "HTTP", src: "Edge-LLM", dst: "IN-CSE", op: "CREATE",
        path: `${CSE}/RobotAE/mgmtObj`, status: 4103, bytes: 180,
        payload: { error: "ACCESS_DENIED", acp: "acp-llm-propose" },
      });
      this.secEntry("Edge-LLM", `${CSE}/RobotAE/mgmtObj`, "acp-llm-propose", "deny", 4103);
    }
    // federated learning cycle
    if (this.fl.status === "idle" && Math.random() < 0.01 * this.speed) {
      this.fl = { ...this.fl, round: this.fl.round + 1, status: "training" };
      this.emit({ type: "fl", data: this.fl });
      setTimeout(() => {
        this.fl = { ...this.fl, status: "aggregating" };
        this.emit({ type: "fl", data: this.fl });
        setTimeout(() => {
          this.fl = { ...this.fl, status: "published", modelVersion: `v0.9.${this.fl.round}` };
          this.emit({ type: "fl", data: this.fl });
          setTimeout(() => {
            this.fl = { ...this.fl, status: "idle" };
            this.emit({ type: "fl", data: this.fl });
          }, 4000);
        }, 5000);
      }, 5000);
    }
  }

  private evRaw(p: Omit<TrafficEvent, "id" | "ts" | "correlationId" | "latencyMs" | "bytes"> &
    Partial<Pick<TrafficEvent, "correlationId" | "latencyMs" | "bytes">>) {
    const e: TrafficEvent = {
      id: `e${++this.seq}`,
      ts: Date.now(),
      correlationId: p.correlationId ?? `c-${this.seq}`,
      latencyMs: p.latencyMs ?? 8 + Math.round(Math.random() * 30),
      bytes: p.bytes ?? 120 + Math.round(Math.random() * 900),
      ...p,
    };
    this.emit({ type: "event", data: e });
    this.curCounts[p.layer] = (this.curCounts[p.layer] ?? 0) + 1;
    this.latencies.push(e.latencyMs);
    if (this.latencies.length > 200) this.latencies.shift();
  }

  private updateLink() {
    if (this.link.state === "monitoring") {
      const target = -86 + Math.sin(this.t / 9) * 4;
      this.link.rsrp += (target - this.link.rsrp) * 0.05;
      this.link.sinr += (17 + Math.sin(this.t / 7) * 3 - this.link.sinr) * 0.05;
    }
  }

  // ---------- scripted scenario ----------

  private buildBeats() {
    const B = (t: number, fn: () => void) => this.beats.push({ t, fn });

    B(3, () => this.emitQueue());

    // Room 2 sensor sends NaN
    B(6, () => {
      const r = this.rooms.find((x) => x.id === "r2")!;
      this.setDeviceFault("r2-d2", "nan");
      this.evRaw({
        layer: "device", protocol: "MQTT", src: "r2-d2", dst: "MEC-IPE", op: "NOTIFY",
        path: `${CSE}/DistrictA-MN-CSE/Room2/r2-d2/timeSeries`, status: 2000,
        payload: { m2m: { rep: { temp: "NaN", hum: "NaN" } } }, roomId: "r2", deviceId: "r2-d2", incidentId: "inc-001",
      });
      this.evRaw({
        layer: "mec", protocol: "HTTP", src: "MEC-IPE", dst: "MN-CSE", op: "CREATE",
        path: `${CSE}/DistrictA-MN-CSE/Room2/r2-d2/timeSeries`, status: 2001,
        roomId: "r2", deviceId: "r2-d2", incidentId: "inc-001",
      });
      this.auditStep("rule", "NaN detected in r2-d2 timeSeries window", "pass");
    });

    // Room 3 outlier
    B(8, () => {
      this.setDeviceFault("r3-d1", "outlier");
      this.evRaw({
        layer: "device", protocol: "MQTT", src: "r3-d1", dst: "MEC-IPE", op: "NOTIFY",
        path: `${CSE}/DistrictB-MN-CSE/Room3/r3-d1/timeSeries`, status: 2000,
        payload: { m2m: { rep: { temp: 61.3, note: "outlier vs baseline 22.1" } } }, roomId: "r3", deviceId: "r3-d1", incidentId: "inc-002",
      });
      this.auditStep("rule", "Outlier 61.3°C vs baseline 22.1°C on r3-d1", "pass");
      this.openIncident("inc-001", "r2", "r2-d2", "NaN burst on sensor stream");
      this.openIncident("inc-002", "r3", "r3-d1", "Persistent outlier / calibration drift");
      this.emitQueue();
    });

    // Queue ranks rooms; robot heads to Room 3
    B(12, () => {
      this.emitQueue();
      this.moveRobotTo("r3");
      this.evRaw({
        layer: "triage", protocol: "MCP", src: "Triage", dst: "Robot", op: "UPDATE",
        path: "queue/replan", status: 2004, roomId: "r3", incidentId: "inc-002",
        payload: { plan: ["r3", "r2"], reason: "r3 score > r2 score" },
      });
      this.auditStep("local", "Planner ranked Room 3 first (travel cost + open fault)");
    });

    // Room 2 gets worse → detour
    B(20, () => {
      this.setDeviceFault("r2-d1", "nan");
      this.emitQueue(
        "Detour to Room 2: 2 devices up in 5 min vs 1 in Room 3",
      );
      this.robot.detour = "r2";
      this.robot.route = ["r2", "r3"];
      this.robot.targetRoomId = "r2";
      this.robot.progress = 0;
      this.robot.busy = true;
      this.emitRobot();
      this.evRaw({
        layer: "triage", protocol: "MCP", src: "Triage", dst: "Robot", op: "UPDATE",
        path: "queue/replan", status: 2004, roomId: "r2", incidentId: "inc-001",
        payload: { detour: "r2", reason: "2 devices up in 5 min vs 1", dropped: "r3" },
      });
      this.flashTree("room-r2");
      this.auditStep("local", "Re-plan: detour to Room 2 (score 98 vs 54)", "pass");
      this.incidents.get("inc-001")!.status = "in_progress";
      this.emitIncidents();
    });

    B(26, () => {
      // arrive handled by movement; ensure progress finishes
      this.robot.progress = 1;
    });

    B(48, () => {
      // signal drop + handover while robot works
      this.link.state = "triggered";
      this.emit({ type: "link", data: this.link });
      this.auditStep("rule", "RSRP below -105 dBm threshold, handover triggered", "block");
    });

    B(52, () => {
      this.link.state = "re_registering";
      this.link.district = "B";
      this.link.interruptionMs = 38;
      this.emit({ type: "link", data: this.link });
      this.evRaw({
        layer: "core", protocol: "HTTP", src: "5G-Core", dst: "MN-CSE-B", op: "UPDATE",
        path: "namf/registration-update", status: 2004, payload: { tai: "DistrictB" },
      });
    });

    B(58, () => {
      this.link.state = "restored";
      this.emit({ type: "link", data: this.link });
      this.auditStep("rule", "Handover District A → B complete, 38 ms interruption", "pass");
    });

    // recurring faults after the scripted arc, keeps the board alive
    B(100, () => {
      this.scheduleRecurring();
    });
  }

  private arriveRoom2() {
    const inc = this.incidents.get("inc-001")!;
    // concurrent pings to two devices (overlapping rows)
    for (const d of ["r2-d1", "r2-d2"]) {
      this.evRaw({
        layer: "robot", protocol: "MQTT", src: "Robot", dst: d, op: "PING",
        path: `${d}/ping`, status: 2000, latencyMs: 22, roomId: "r2", deviceId: d, incidentId: inc.id,
      });
    }
    this.addSteps(inc, [
      { label: "Ping (alive?)", detail: "Robot pings r2-d1 and r2-d2 concurrently", src: "Robot", dst: "r2-d1, r2-d2", status: "done", ts: Date.now(), latencyMs: 22 },
      { label: "Data analysed", detail: "NaN burst confirmed on both streams", src: "Triage", dst: "Triage", status: "done", ts: Date.now() + 900, latencyMs: 640 },
      { label: "Symptom matched", detail: "NaN burst on sensor stream", src: "Triage", dst: "Triage", status: "active" },
      { label: "Remediation ID found in oneM2M", detail: "Looking up 1246…", src: "Robot", dst: "IN-CSE", status: "pending" },
    ]);
    this.evRaw({
      layer: "triage", protocol: "MCP", src: "Triage", dst: "Robot", op: "UPDATE",
      path: "triage/inc-001/analysis", status: 2000, roomId: "r2", incidentId: inc.id,
      payload: { symptom: "nan-burst", confidence: 0.94 },
    });
    setTimeout(() => {
      this.evRaw({
        layer: "robot", protocol: "HTTP", src: "Robot", dst: "IN-CSE", op: "RETRIEVE",
        path: `${CSE}/remediationCatalog/1246`, status: 2000, roomId: "r2", incidentId: inc.id,
        payload: { "m2m:cin": { id: "1246", steps: [1, 2, 3, 5], risk: "LOW" } },
      });
      this.flashTree("cat-1246");
      this.setStepStatus(inc, "Remediation ID found in oneM2M", "done", 140);
      this.setIncident(inc, { remediationId: "1246" });
      this.auditStep("rule", "oneM2M lookup: remediation 1246 (LOW risk)", "pass");
      this.evRaw({
        layer: "robot", protocol: "MQTT", src: "Robot", dst: "r2-d2", op: "CREATE",
        path: `${CSE}/DistrictA-MN-CSE/Room2/r2-d2/mgmtObj`, status: 2001, roomId: "r2", deviceId: "r2-d2", incidentId: inc.id,
        payload: { exec: "apply", solution: "1246" },
      });
      this.addSteps(inc, [
        { label: 'Robot tells node "apply 1246"', detail: "CREATE mgmtObj exec apply 1246", src: "Robot", dst: "r2-d2", status: "done", ts: Date.now(), latencyMs: 45 },
        { label: "Node fetches steps from oneM2M", detail: "RETRIEVE 1246 → primitives 1, 2, 3, 5", src: "r2-d2", dst: "IN-CSE", status: "active" },
      ]);
      setTimeout(() => {
        this.evRaw({
          layer: "device", protocol: "HTTP", src: "r2-d2", dst: "IN-CSE", op: "RETRIEVE",
          path: `${CSE}/remediationCatalog/1246`, status: 2000, roomId: "r2", deviceId: "r2-d2", incidentId: inc.id,
          payload: { steps: [1, 2, 3, 5] },
        });
        this.secEntry("r2-d2", `${CSE}/remediationCatalog/1246`, "acp-sensors-write", "allow", 2000);
        this.setStepStatus(inc, "Node fetches steps from oneM2M", "done", 90);
        this.addSteps(inc, [
          { label: "Node executes", detail: "restart sensor → recalibrate → flush buffer → reboot", src: "r2-d2", dst: "r2-d2", status: "active" },
        ]);
        setTimeout(() => {
          this.evRaw({
            layer: "device", protocol: "HTTP", src: "r2-d2", dst: "MN-CSE", op: "UPDATE",
            path: `${CSE}/DistrictA-MN-CSE/Room2/r2-d2/mgmtObj`, status: 2004, roomId: "r2", deviceId: "r2-d2", incidentId: inc.id,
            payload: { result: "ok", primitives: [1, 2, 3, 5] },
          });
          this.setStepStatus(inc, "Node executes", "done", 2300);
          this.addSteps(inc, [
            { label: "Node confirms to oneM2M", detail: "UPDATE mgmtObj result ok", src: "r2-d2", dst: "MN-CSE", status: "done", ts: Date.now(), latencyMs: 80 },
            { label: "oneM2M notifies robot", detail: "NOTIFY pollingChannel", src: "MN-CSE", dst: "RobotAE", status: "active" },
          ]);
          setTimeout(() => {
            this.setStepStatus(inc, "oneM2M notifies robot", "done", 60);
            this.addSteps(inc, [
              { label: "Robot re-verifies", detail: "Robot will return to Room 2", src: "Robot", dst: "Robot", status: "pending" },
            ]);
            this.setIncident(inc, { status: "verifying" });
            this.appendRoute("r3");
            this.emitQueue();
            // move on to r3 after a beat
            setTimeout(() => {
              this.robot.targetRoomId = "r3";
              this.robot.progress = 0;
              this.robot.busy = true;
              this.emitRobot();
            }, 1200);
          }, 900);
        }, 1600);
      }, 1200);
    }, 1400);
  }

  private arriveRoom3() {
    const inc = this.incidents.get("inc-002")!;
    this.evRaw({
      layer: "robot", protocol: "MQTT", src: "Robot", dst: "r3-d1", op: "PING",
      path: `r3-d1/ping`, status: 2000, latencyMs: 19, roomId: "r3", deviceId: "r3-d1", incidentId: inc.id,
    });
    this.addSteps(inc, [
      { label: "Ping (alive?)", detail: "Robot pings r3-d1", src: "Robot", dst: "r3-d1", status: "done", ts: Date.now(), latencyMs: 19 },
      { label: "Data analysed", detail: "Outlier confirmed, baseline drift", src: "Triage", dst: "Triage", status: "done", ts: Date.now() + 800, latencyMs: 590 },
      { label: "Symptom matched", detail: "Persistent outlier / calibration drift", src: "Triage", dst: "Triage", status: "done", ts: Date.now() + 1600 },
      { label: "Remediation ID found in oneM2M", detail: "No match in catalogue", src: "Robot", dst: "IN-CSE", status: "active" },
    ]);
    this.setIncident(inc, { status: "in_progress" });
    this.evRaw({
      layer: "robot", protocol: "HTTP", src: "Robot", dst: "IN-CSE", op: "RETRIEVE",
      path: `${CSE}/remediationCatalog?symptom=outlier-drift`, status: 4044, roomId: "r3", incidentId: inc.id,
      payload: { error: "CONTENT_NOT_FOUND" },
    });
    setTimeout(() => {
      this.setStepStatus(inc, "Remediation ID found in oneM2M", "error", 130);
      this.auditStep("rule", "No remediation ID in oneM2M for outlier-drift", "block");
      this.setIncident(inc, { escalation: "local", status: "in_progress" });
      this.addSteps(inc, [
        { label: "Local model proposes", detail: "Pi model inference…", src: "Triage", dst: "Triage", status: "active" },
      ]);
      setTimeout(() => {
        this.setStepStatus(inc, "Local model proposes", "error");
        this.auditStep("local", "Local model confidence 0.31 below threshold — escalating", "block");
        this.setIncident(inc, { escalation: "llm" });
        this.addSteps(inc, [
          { label: "Edge LLM proposes (MCP)", detail: "propose remediation for compound fault", src: "Edge-LLM", dst: "Robot", status: "active" },
        ]);
        this.evRaw({
          layer: "llm", protocol: "MCP", src: "Edge-LLM", dst: "Robot", op: "CREATE",
          path: "mcp/propose-remediation", status: 2001, roomId: "r3", incidentId: inc.id,
          payload: { proposal: "1602", steps: [2, 4, 5], rationale: "compound fault: drift + radio instability" },
        });
        setTimeout(() => {
          this.setStepStatus(inc, "Edge LLM proposes (MCP)", "done", 780);
          this.auditStep("llm", "LLM proposes 1602 (recalibrate, reset radio, reboot)", "info");
          this.auditStep("guardrail", "Proposal 1602 flagged HIGH risk — operator approval required", "block");
          this.setIncident(inc, {
            status: "pending_approval",
            risk: { tier: "HIGH", reason: "Primitives touch radio modem; ambiguous symptom match (0.62)" },
            proposedBy: "llm",
            remediationId: "1602",
          });
          this.addSteps(inc, [
            { label: "Operator approval", detail: "Awaiting decision", src: "Operator", dst: "Robot", status: "pending" },
          ]);
        }, 1400);
      }, 1600);
    }, 1000);
  }

  decide(incidentId: string, approve: boolean) {
    const inc = this.incidents.get(incidentId);
    if (!inc || inc.status !== "pending_approval") return;
    if (approve) {
      this.setStepStatus(inc, "Operator approval", "done", 0);
      this.setIncident(inc, { status: "in_progress", escalation: "human" });
      this.auditStep("guardrail", `Operator approved 1602 for ${inc.id}`, "pass");
      this.secEntry("Operator", `${CSE}/flexContainer-incidents/${inc.id}`, "acp-operator-approve", "allow", 2004);
      this.addSteps(inc, [
        { label: "Robot applies 1602", detail: "recalibrate → reset radio modem → reboot", src: "Robot", dst: inc.deviceId, status: "active" },
      ]);
      this.evRaw({
        layer: "robot", protocol: "MQTT", src: "Robot", dst: inc.deviceId, op: "CREATE",
        path: `${CSE}/.../${inc.deviceId}/mgmtObj`, status: 2001, roomId: inc.roomId, deviceId: inc.deviceId, incidentId: inc.id,
        payload: { exec: "apply", solution: "1602", steps: [2, 4, 5] },
      });
      setTimeout(() => {
        this.setStepStatus(inc, "Robot applies 1602", "done", 1900);
        this.addSteps(inc, [
          { label: "Node executes & confirms", detail: "UPDATE mgmtObj result ok", src: inc.deviceId, dst: "MN-CSE", status: "done", ts: Date.now(), latencyMs: 110 },
          { label: "Robot re-verifies", detail: "Re-ping and stream check", src: "Robot", dst: inc.deviceId, status: "done", ts: Date.now() + 1500, latencyMs: 20 },
        ]);
        this.setDeviceFault(inc.deviceId, null);
        this.evRaw({
          layer: "robot", protocol: "MQTT", src: "Robot", dst: inc.deviceId, op: "PING",
          path: `${inc.deviceId}/ping`, status: 2000, latencyMs: 18, roomId: inc.roomId, deviceId: inc.deviceId, incidentId: inc.id,
        });
        this.resolveIncident(inc);
        this.emitQueue();
      }, 2200);
    } else {
      this.setStepStatus(inc, "Operator approval", "error", 0);
      this.setIncident(inc, { status: "rejected" });
      this.auditStep("guardrail", `Operator rejected LLM proposal for ${inc.id} — escalated to human maintenance`, "block");
      this.evRaw({
        layer: "llm", protocol: "MCP", src: "Robot", dst: "Edge-LLM", op: "UPDATE",
        path: "mcp/feedback", status: 2004, incidentId: inc.id,
        payload: { decision: "rejected", reason: "operator override" },
      });
    }
  }

  private verifyRoom2() {
    const inc = this.incidents.get("inc-001")!;
    this.setStepStatus(inc, "Robot re-verifies", "done", 20);
    for (const d of ["r2-d1", "r2-d2"]) {
      this.setDeviceFault(d, null);
      this.evRaw({
        layer: "robot", protocol: "MQTT", src: "Robot", dst: d, op: "PING",
        path: `${d}/ping`, status: 2000, latencyMs: 17, roomId: "r2", deviceId: d, incidentId: inc.id,
      });
      this.evRaw({
        layer: "mcc", protocol: "HTTP", src: "MN-CSE", dst: "Robot", op: "RETRIEVE",
        path: `${CSE}/DistrictA-MN-CSE/Room2/${d}/health`, status: 2000, roomId: "r2", deviceId: d, incidentId: inc.id,
        payload: { health: "ok", lastStream: "clean" },
      });
    }
    this.resolveIncident(inc);
    this.emitQueue();
    this.auditStep("rule", "Room 2 verified clean — incident resolved", "pass");
  }

  // recurring ambient faults keep the dashboard alive after the script
  private scheduleRecurring() {
    const trigger = () => {
      if (this.t > this.recurringNext) {
        this.recurringNext = this.t + 45 + Math.random() * 30;
        const candidates = this.rooms.filter((r) => r.health === "healthy");
        if (candidates.length) {
          const r = candidates[Math.floor(Math.random() * candidates.length)];
          if (r && r.devices.length > 0) {
            const d = r.devices[Math.floor(Math.random() * r.devices.length)];
            if (d) {
              const id = `inc-r${Math.floor(this.recurringNext)}`;
              const fault: DeviceState["fault"] = Math.random() < 0.5 ? "nan" : "outlier";
              const symptom = fault === "nan" ? "NaN burst on sensor stream" : "Persistent outlier / calibration drift";
              this.setDeviceFault(d.id, fault);
              const inc = this.openIncident(id, r.id, d.id, symptom);
              this.emitQueue();
              this.evRaw({
                layer: "device", protocol: "MQTT", src: d.id, dst: "MEC-IPE", op: "NOTIFY",
                path: `${CSE}/District${r.district}-MN-CSE/${r.name.replace(" ", "")}/${d.id}/timeSeries`,
                status: 2000, roomId: r.id, deviceId: d.id, incidentId: id,
                payload: fault === "nan" ? { m2m: { rep: { temp: "NaN" } } } : { m2m: { rep: { temp: 58.7 } } },
              });
              // automatic full remediation for catalogue-known symptoms
              const cat = CATALOG.find((c) => c.symptom === symptom)!;
              setTimeout(() => {
                this.evRaw({
                  layer: "robot", protocol: "HTTP", src: "Robot", dst: "IN-CSE", op: "RETRIEVE",
                  path: `${CSE}/remediationCatalog/${cat.id}`, status: 2000, roomId: r.id, incidentId: id,
                  payload: { id: cat.id, steps: cat.steps, risk: cat.riskTier },
                });
                this.setIncident(inc, { remediationId: cat.id, status: "in_progress" });
                setTimeout(() => {
                  this.evRaw({
                    layer: "robot", protocol: "MQTT", src: "Robot", dst: d.id, op: "CREATE",
                    path: `${CSE}/.../${d.id}/mgmtObj`, status: 2001, roomId: r.id, deviceId: d.id, incidentId: id,
                    payload: { exec: "apply", solution: cat.id },
                  });
                  setTimeout(() => {
                    this.setDeviceFault(d.id, null);
                    this.resolveIncident(inc);
                    this.emitQueue();
                  }, 3000);
                }, 2500);
              }, 2000);
            }
          }
        }
      }
      setTimeout(trigger, 1000);
    };
    setTimeout(trigger, 1000);
  }
}
