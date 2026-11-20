import asyncio
import math
import random
import time
from typing import Dict, List, Optional, Any, Callable

from models import (
    Snapshot, SubsystemHealth, RoomHealth, GridPos, DeviceState,
    RobotState, QueueEntry, Incident, RiskInfo, RemediationStep,
    RemediationCatalogEntry, LinkMetrics, LinkHistoryItem, AuditStep,
    TreeNode, Kpi, SecEntry, FlStatus, TrafficEvent, LayerBucket, FeedMessage
)
from acme import AcmeClient

CATALOG: List[RemediationCatalogEntry] = [
    RemediationCatalogEntry(id="1246", symptom="NaN burst on sensor stream", steps=[1, 2, 3, 5], riskTier="LOW"),
    RemediationCatalogEntry(id="1310", symptom="Persistent outlier / calibration drift", steps=[2, 4], riskTier="MEDIUM"),
    RemediationCatalogEntry(id="1408", symptom="Buffer overflow, stale telemetry", steps=[3], riskTier="LOW"),
    RemediationCatalogEntry(id="1520", symptom="Radio modem hang, no keepalive", steps=[1, 5], riskTier="MEDIUM"),
    RemediationCatalogEntry(id="1602", symptom="Unknown compound fault (LLM-proposed)", steps=[2, 4, 5], riskTier="HIGH"),
]

PRIMITIVE_NAMES: Dict[int, str] = {
    1: "restart sensor",
    2: "recalibrate",
    3: "flush buffer",
    4: "reset radio modem",
    5: "reboot node",
}

CSE_PATH = "//acme.example.com/CSEBase"

class OrchestrationEngine:
    """
    Full real-time digital twin orchestration engine.
    Executes live triage scenarios, robot movements, oneM2M interactions,
    and streams high-frequency telemetry events to WebSocket subscribers.
    """
    def __init__(self, broadcast_fn: Callable[[FeedMessage], Any], acme_client: AcmeClient):
        self.broadcast = broadcast_fn
        self.acme = acme_client
        self.running = False
        self.task: Optional[asyncio.Task] = None
        self.t = 0.0
        self.speed = 1.0
        self.paused = False
        self.seq = 0
        self.fired_up_to = 0

        now_ms = int(time.time() * 1000)

        # 1. Subsystems
        self.subsystems = [
            SubsystemHealth(id="in-cse", label="IN-CSE", status="online", type="server", endpoint="http://localhost:8080/cse-in"),
            SubsystemHealth(id="mn-a", label="MN-CSE A", status="online", type="server", endpoint="http://localhost:8081/DistrictA-MN-CSE"),
            SubsystemHealth(id="mn-b", label="MN-CSE B", status="standby", type="server", endpoint="http://localhost:8082/DistrictB-MN-CSE"),
            SubsystemHealth(id="5g-core", label="5G Core", status="online", type="radio", endpoint="core.5g.local"),
            SubsystemHealth(id="radio", label="5G Radio", status="online", type="wifi", endpoint="gNB-DistrictA"),
            SubsystemHealth(id="edge-llm", label="Edge LLM", status="online", type="brain", endpoint="llm-mcp.edge.local"),
        ]

        # 2. Rooms & ESP32 Nodes
        self.rooms: List[RoomHealth] = [
            RoomHealth(
                id="r1", name="Room 1", district="A", grid=GridPos(col=0, row=0), health="healthy",
                devices=[
                    DeviceState(id="r1-d1", roomId="r1", kind="temp-humid", health="alive", fault=None, lastSeenTs=now_ms),
                    DeviceState(id="r1-d2", roomId="r1", kind="co2", health="alive", fault=None, lastSeenTs=now_ms),
                    DeviceState(id="r1-d3", roomId="r1", kind="occupancy", health="alive", fault=None, lastSeenTs=now_ms),
                ]
            ),
            RoomHealth(
                id="r2", name="Room 2", district="A", grid=GridPos(col=1, row=0), health="healthy",
                devices=[
                    DeviceState(id="r2-d1", roomId="r2", kind="temp-humid", health="alive", fault=None, lastSeenTs=now_ms),
                    DeviceState(id="r2-d2", roomId="r2", kind="co2", health="alive", fault=None, lastSeenTs=now_ms),
                    DeviceState(id="r2-d3", roomId="r2", kind="occupancy", health="alive", fault=None, lastSeenTs=now_ms),
                ]
            ),
            RoomHealth(
                id="r3", name="Room 3", district="B", grid=GridPos(col=0, row=1), health="healthy",
                devices=[
                    DeviceState(id="r3-d1", roomId="r3", kind="temp-humid", health="alive", fault=None, lastSeenTs=now_ms),
                    DeviceState(id="r3-d2", roomId="r3", kind="co2", health="alive", fault=None, lastSeenTs=now_ms),
                    DeviceState(id="r3-d3", roomId="r3", kind="occupancy", health="alive", fault=None, lastSeenTs=now_ms),
                ]
            ),
            RoomHealth(
                id="r4", name="Room 4", district="B", grid=GridPos(col=1, row=1), health="healthy",
                devices=[
                    DeviceState(id="r4-d1", roomId="r4", kind="temp-humid", health="alive", fault=None, lastSeenTs=now_ms),
                    DeviceState(id="r4-d2", roomId="r4", kind="co2", health="alive", fault=None, lastSeenTs=now_ms),
                    DeviceState(id="r4-d3", roomId="r4", kind="occupancy", health="alive", fault=None, lastSeenTs=now_ms),
                ]
            ),
        ]

        # 3. Robot Doctor State
        self.robot = RobotState(
            battery=86.0,
            memPct=41.0,
            posRoomId="r1",
            targetRoomId=None,
            progress=1.0,
            route=[],
            detour=None,
            etaMs=0,
            busy=False
        )

        # 4. 5G Radio Link & History
        history = [
            LinkHistoryItem(ts=now_ms - (60 - i) * 1000, rsrp=-88.0, sinr=18.0)
            for i in range(60)
        ]
        self.link = LinkMetrics(
            rsrp=-88.0,
            sinr=18.0,
            state="monitoring",
            interruptionMs=0,
            district="A",
            history=history,
            threshold=-105.0
        )

        # 5. KPIs
        self.kpis: List[Kpi] = [
            Kpi(id="mps", label="Messages / s", value=14.2, unit="msg/s", spark=[14.0]*40, format="float"),
            Kpi(id="lat", label="Avg latency", value=22.0, unit="ms", spark=[22.0]*40, format="ms"),
            Kpi(id="rest", label="Devices restored", value=0.0, unit="/min", spark=[0.0]*40, format="int"),
            Kpi(id="inc", label="Active incidents", value=0.0, unit="", spark=[0.0]*40, format="int"),
            Kpi(id="rsrp", label="RSRP", value=-88.0, unit="dBm", spark=[-88.0]*40, format="dbm"),
            Kpi(id="sinr", label="SINR", value=18.0, unit="dB", spark=[18.0]*40, format="float"),
            Kpi(id="hint", label="Handover int.", value=0.0, unit="ms", spark=[0.0]*40, format="ms"),
            Kpi(id="bat", label="Robot battery", value=86.0, unit="%", spark=[86.0]*40, format="pct"),
            Kpi(id="mem", label="Pi memory", value=41.0, unit="%", spark=[41.0]*40, format="pct"),
            Kpi(id="infpi", label="Inference (Pi)", value=22.0, unit="ms", spark=[22.0]*40, format="ms"),
            Kpi(id="infmec", label="Inference (MEC)", value=55.0, unit="ms", spark=[55.0]*40, format="ms"),
        ]

        # 6. Collections
        self.incidents: Dict[str, Incident] = {}
        self.audit: List[AuditStep] = []
        self.security: List[SecEntry] = []
        self.events: List[TrafficEvent] = []
        self.fl = FlStatus(round=14, modelVersion="v0.9.3", status="idle")

        self.cur_counts: Dict[str, int] = {}
        self.latencies: List[int] = []
        self.restored_timestamps: List[float] = []

        self.layer_history = [
            LayerBucket(bucketTs=now_ms - (60 - i) * 1000, counts={})
            for i in range(60)
        ]

        self.tree = self._build_default_tree()
        self.beats: List[Dict[str, Any]] = []
        self._setup_beats()

    def _build_default_tree(self) -> TreeNode:
        return TreeNode(
            id="cse",
            label="CSEBase",
            kind="CSEBase",
            path=CSE_PATH,
            children=[
                TreeNode(
                    id="mn-a", label="DistrictA-MN-CSE", kind="CSEBase", path=f"{CSE_PATH}/DistrictA-MN-CSE",
                    children=[
                        TreeNode(id="room-r1", label="Room1", kind="AE", path=f"{CSE_PATH}/DistrictA-MN-CSE/Room1"),
                        TreeNode(id="room-r2", label="Room2", kind="AE", path=f"{CSE_PATH}/DistrictA-MN-CSE/Room2"),
                    ]
                ),
                TreeNode(
                    id="mn-b", label="DistrictB-MN-CSE", kind="CSEBase", path=f"{CSE_PATH}/DistrictB-MN-CSE",
                    children=[
                        TreeNode(id="room-r3", label="Room3", kind="AE", path=f"{CSE_PATH}/DistrictB-MN-CSE/Room3"),
                        TreeNode(id="room-r4", label="Room4", kind="AE", path=f"{CSE_PATH}/DistrictB-MN-CSE/Room4"),
                    ]
                ),
                TreeNode(
                    id="robot-ae", label="RobotAE", kind="AE", path=f"{CSE_PATH}/RobotAE",
                    children=[
                        TreeNode(id="polling", label="pollingChannel", kind="pollingChannel", path=f"{CSE_PATH}/RobotAE/pollingChannel"),
                        TreeNode(id="mgmt", label="mgmtObj", kind="mgmtObj", path=f"{CSE_PATH}/RobotAE/mgmtObj"),
                    ]
                ),
                TreeNode(id="incidents", label="flexContainer-incidents", kind="flexContainer", path=f"{CSE_PATH}/flexContainer-incidents", children=[]),
                TreeNode(id="groups", label="groups", kind="group", path=f"{CSE_PATH}/groups", children=[
                    TreeNode(id="grp-a", label="grp-rooms-A", kind="group", path=f"{CSE_PATH}/groups/grp-rooms-A")
                ]),
                TreeNode(id="acps", label="ACPs", kind="ACP", path=f"{CSE_PATH}/ACPs", children=[
                    TreeNode(id="acp-s", label="acp-sensors-write", kind="ACP", path=f"{CSE_PATH}/ACPs/acp-sensors-write"),
                    TreeNode(id="acp-r", label="acp-robot-exec", kind="ACP", path=f"{CSE_PATH}/ACPs/acp-robot-exec"),
                    TreeNode(id="acp-l", label="acp-llm-propose", kind="ACP", path=f"{CSE_PATH}/ACPs/acp-llm-propose"),
                    TreeNode(id="acp-o", label="acp-operator-approve", kind="ACP", path=f"{CSE_PATH}/ACPs/acp-operator-approve"),
                ]),
                TreeNode(id="catalog", label="remediationCatalog", kind="catalog", path=f"{CSE_PATH}/remediationCatalog", children=[
                    TreeNode(id=f"cat-{c.id}", label=c.id, kind="catalog", path=f"{CSE_PATH}/remediationCatalog/{c.id}")
                    for c in CATALOG
                ]),
            ]
        )

    # ------------------- Beat Schedule -------------------
    def _setup_beats(self):
        """Constructs the deterministic triage beats for live demonstration."""
        self.beats = [
            {"t": 3.0, "fn": self._beat_init_queue},
            {"t": 6.0, "fn": self._beat_room2_nan},
            {"t": 9.0, "fn": self._beat_room3_outlier},
            {"t": 13.0, "fn": self._beat_robot_dispatch_r3},
            {"t": 19.0, "fn": self._beat_room2_detour},
            {"t": 48.0, "fn": self._beat_signal_drop},
            {"t": 53.0, "fn": self._beat_handover_re_register},
            {"t": 59.0, "fn": self._beat_handover_restored},
        ]

    async def _beat_init_queue(self):
        await self.emit_queue()

    async def _beat_room2_nan(self):
        self.set_device_fault("r2-d2", "nan")
        await self.emit_event(
            layer="device", protocol="MQTT", src="r2-d2", dst="MEC-IPE", op="NOTIFY",
            path=f"{CSE_PATH}/DistrictA-MN-CSE/Room2/r2-d2/timeSeries", status=2000,
            payload={"m2m": {"rep": {"temp": "NaN", "hum": "NaN"}}},
            roomId="r2", deviceId="r2-d2", incidentId="inc-001"
        )
        await self.emit_event(
            layer="mec", protocol="HTTP", src="MEC-IPE", dst="MN-CSE", op="CREATE",
            path=f"{CSE_PATH}/DistrictA-MN-CSE/Room2/r2-d2/timeSeries", status=2001,
            roomId="r2", deviceId="r2-d2", incidentId="inc-001"
        )
        await self.emit_audit("rule", "NaN detected in r2-d2 timeSeries window", "pass")
        await self.emit_queue()

    async def _beat_room3_outlier(self):
        self.set_device_fault("r3-d1", "outlier")
        await self.emit_event(
            layer="device", protocol="MQTT", src="r3-d1", dst="MEC-IPE", op="NOTIFY",
            path=f"{CSE_PATH}/DistrictB-MN-CSE/Room3/r3-d1/timeSeries", status=2000,
            payload={"m2m": {"rep": {"temp": 61.3, "note": "outlier vs baseline 22.1"}}},
            roomId="r3", deviceId="r3-d1", incidentId="inc-002"
        )
        await self.emit_audit("rule", "Outlier 61.3°C vs baseline 22.1°C on r3-d1", "pass")
        self.open_incident("inc-001", "r2", "r2-d2", "NaN burst on sensor stream")
        self.open_incident("inc-002", "r3", "r3-d1", "Persistent outlier / calibration drift")
        await self.emit_incidents()
        await self.emit_queue()

    async def _beat_robot_dispatch_r3(self):
        self.move_robot_to("r3")
        await self.emit_event(
            layer="triage", protocol="MCP", src="Triage", dst="Robot", op="UPDATE",
            path="queue/replan", status=2004, roomId="r3", incidentId="inc-002",
            payload={"plan": ["r3", "r2"], "reason": "r3 score > r2 score"}
        )
        await self.emit_audit("local", "Planner ranked Room 3 first (travel cost + open fault)")
        await self.emit_robot()

    async def _beat_room2_detour(self):
        self.set_device_fault("r2-d1", "nan")
        self.robot.detour = "r2"
        self.robot.route = ["r2", "r3"]
        self.robot.targetRoomId = "r2"
        self.robot.progress = 0.0
        self.robot.busy = True
        await self.emit_robot()
        await self.emit_queue("Detour to Room 2: 2 devices up in 5 min vs 1 in Room 3")
        await self.emit_event(
            layer="triage", protocol="MCP", src="Triage", dst="Robot", op="UPDATE",
            path="queue/replan", status=2004, roomId="r2", incidentId="inc-001",
            payload={"detour": "r2", "reason": "2 devices up in 5 min vs 1", "dropped": "r3"}
        )
        await self.emit_audit("local", "Re-plan: detour to Room 2 (score 98 vs 54)", "pass")
        if "inc-001" in self.incidents:
            self.incidents["inc-001"].status = "in_progress"
            await self.emit_incidents()

    async def _beat_signal_drop(self):
        self.link.state = "triggered"
        self.link.rsrp = -108.0
        await self.emit_link()
        await self.emit_audit("rule", "RSRP below -105 dBm threshold, handover triggered", "block")

    async def _beat_handover_re_register(self):
        self.link.state = "re_registering"
        self.link.district = "B"
        self.link.interruptionMs = 28
        self.link.rsrp = -112.0
        await self.emit_link()
        await self.emit_event(
            layer="core", protocol="HTTP", src="5G-Core", dst="MN-CSE-B", op="UPDATE",
            path="namf/registration-update", status=2004, payload={"tai": "DistrictB"}
        )
        for s in self.subsystems:
            if s.id == "mn-a":
                s.status = "standby"
            elif s.id == "mn-b":
                s.status = "online"
        await self.broadcast(FeedMessage(type="subsystems", data=[s.model_dump() for s in self.subsystems]))

    async def _beat_handover_restored(self):
        self.link.state = "restored"
        self.link.rsrp = -86.0
        self.link.sinr = 21.0
        await self.emit_link()
        await self.emit_audit("rule", "Handover District A → B complete, 28 ms interruption", "pass")

    # ------------------- State Mutations -------------------
    def set_device_fault(self, device_id: str, fault: Optional[str]):
        now_ms = int(time.time() * 1000)
        for r in self.rooms:
            for d in r.devices:
                if d.id == device_id:
                    d.fault = fault
                    d.health = "anomaly" if fault else "alive"
                    if not fault:
                        d.lastSeenTs = now_ms
            fault_count = sum(1 for d in r.devices if d.fault is not None)
            r.health = "healthy" if fault_count == 0 else "warning" if fault_count == 1 else "critical"

    def open_incident(self, id: str, room_id: str, device_id: str, symptom: str) -> Incident:
        now_ms = int(time.time() * 1000)
        inc = Incident(
            id=id,
            roomId=room_id,
            deviceId=device_id,
            symptom=symptom,
            escalation="oneM2M",
            status="open",
            steps=[],
            startedTs=now_ms,
            updatedAt=now_ms
        )
        self.incidents[id] = inc
        return inc

    def move_robot_to(self, room_id: str):
        self.robot.route = [room_id]
        self.robot.detour = None
        self.robot.targetRoomId = room_id
        self.robot.progress = 0.0
        self.robot.busy = True

    # ------------------- Emit Helpers -------------------
    async def emit_event(self, **kwargs) -> TrafficEvent:
        self.seq += 1
        now_ms = int(time.time() * 1000)
        incident_id = kwargs.get("incidentId")
        corr = kwargs.pop("correlationId", f"c-{incident_id}" if incident_id else f"c-{self.seq}")
        lat = kwargs.pop("latencyMs", random.randint(12, 35))
        bytes_val = kwargs.pop("bytes", random.randint(150, 850))

        ev = TrafficEvent(
            id=f"e{self.seq}",
            ts=now_ms,
            correlationId=corr,
            latencyMs=lat,
            bytes=bytes_val,
            **kwargs
        )
        self.events.insert(0, ev)
        if len(self.events) > 500:
            self.events = self.events[:500]

        layer = ev.layer
        self.cur_counts[layer] = self.cur_counts.get(layer, 0) + 1
        self.latencies.append(lat)
        if len(self.latencies) > 100:
            self.latencies.pop(0)

        await self.broadcast(FeedMessage(type="event", data=ev.model_dump()))
        return ev

    async def emit_audit(self, actor: str, text: str, verdict: str = "info"):
        self.seq += 1
        now_ms = int(time.time() * 1000)
        step = AuditStep(id=f"a{self.seq}", ts=now_ms, actor=actor, text=text, verdict=verdict)
        self.audit.insert(0, step)
        if len(self.audit) > 60:
            self.audit = self.audit[:60]
        await self.broadcast(FeedMessage(type="audit", data=[a.model_dump() for a in self.audit]))

    async def emit_security(self, src: str, path: str, acp: str, verdict: str, code: Optional[int] = None):
        self.seq += 1
        now_ms = int(time.time() * 1000)
        sec = SecEntry(id=f"s{self.seq}", ts=now_ms, src=src, path=path, acp=acp, verdict=verdict, code=code)
        self.security.insert(0, sec)
        if len(self.security) > 60:
            self.security = self.security[:60]
        await self.broadcast(FeedMessage(type="security", data=[s.model_dump() for s in self.security]))

    async def emit_queue(self, note: Optional[str] = None):
        entries = self.compute_queue()
        await self.broadcast(FeedMessage(type="queue", data={"entries": [e.model_dump() for e in entries], "note": note}))

    async def emit_robot(self):
        await self.broadcast(FeedMessage(type="robot", data=self.robot.model_dump()))

    async def emit_rooms(self):
        await self.broadcast(FeedMessage(type="room", data=[r.model_dump() for r in self.rooms]))

    async def emit_incidents(self):
        await self.broadcast(FeedMessage(type="incident", data=[i.model_dump() for i in self.incidents.values()]))

    async def emit_link(self):
        await self.broadcast(FeedMessage(type="link", data=self.link.model_dump()))

    def compute_queue(self) -> List[QueueEntry]:
        entries: List[QueueEntry] = []
        for r in self.rooms:
            faults = len([d for d in r.devices if d.fault is not None])
            recoverable = faults
            eta_ms = faults * 45000
            travel_ms = 20000 + r.grid.row * 8000 + r.grid.col * 5000
            score = faults * 40 + recoverable * 10 - (travel_ms / 4000)
            tags: List[str] = []
            if faults:
                tags.append(f"{faults} fault{'s' if faults > 1 else ''}")
            if r.health == "critical":
                tags.append("critical")
            elif r.health == "warning":
                tags.append("warning")
            if recoverable:
                tags.append(f"{recoverable} recoverable")
            why = f"{faults} device{'s' if faults > 1 else ''} up in 5 min vs 0" if faults else "all devices healthy"
            entries.append(QueueEntry(
                roomId=r.id,
                score=score,
                tags=tags,
                why=why,
                etaMs=eta_ms,
                travelMs=travel_ms,
                rank=0
            ))
        entries.sort(key=lambda x: x.score, reverse=True)
        for idx, entry in enumerate(entries):
            entry.rank = idx + 1
        return entries

    # ------------------- Decision Handling -------------------
    async def decide_incident(self, incident_id: str, approve: bool):
        """Processes manual operator approval or rejection."""
        if incident_id not in self.incidents:
            return
        inc = self.incidents[incident_id]
        now_ms = int(time.time() * 1000)

        if approve:
            inc.status = "in_progress"
            inc.escalation = "human"
            inc.updatedAt = now_ms
            await self.emit_audit("guardrail", f"Operator approved {inc.remediationId or '1602'} for {inc.id}", "pass")
            await self.emit_security("Operator", f"{CSE_PATH}/flexContainer-incidents/{inc.id}", "acp-operator-approve", "allow", 2004)
            await self.emit_event(
                layer="robot", protocol="MQTT", src="Robot", dst=inc.deviceId, op="CREATE",
                path=f"{CSE_PATH}/.../{inc.deviceId}/mgmtObj", status=2001,
                roomId=inc.roomId, deviceId=inc.deviceId, incidentId=inc.id,
                payload={"exec": "apply", "solution": inc.remediationId or "1602", "steps": [2, 4, 5]}
            )
            # Add steps
            step = RemediationStep(
                id=f"{inc.id}-s{len(inc.steps)+1}",
                label="Robot applies approved compound fix",
                detail="recalibrate -> reset radio -> reboot",
                src="Robot", dst=inc.deviceId, status="done",
                ts=now_ms, latencyMs=110
            )
            inc.steps.append(step)
            await self.emit_incidents()

            # Schedule recovery
            asyncio.create_task(self._finish_approved_recovery(inc))
        else:
            inc.status = "rejected"
            inc.updatedAt = now_ms
            await self.emit_audit("guardrail", f"Operator rejected proposed fix for {inc.id} - escalated to maintenance", "block")
            await self.emit_event(
                layer="llm", protocol="MCP", src="Robot", dst="Edge-LLM", op="UPDATE",
                path="mcp/feedback", status=2004, incidentId=inc.id,
                payload={"decision": "rejected", "reason": "operator override"}
            )
            await self.emit_incidents()

    async def _finish_approved_recovery(self, inc: Incident):
        await asyncio.sleep(2.0)
        self.set_device_fault(inc.deviceId, None)
        inc.status = "resolved"
        inc.updatedAt = int(time.time() * 1000)
        self.restored_timestamps.append(self.t)
        await self.emit_rooms()
        await self.emit_queue()
        await self.emit_incidents()
        await self.emit_audit("rule", f"Device {inc.deviceId} re-verified clean - {inc.id} resolved", "pass")

    # ------------------- Robot Arrival Logic -------------------
    async def _on_robot_arrive(self, room_id: str):
        if room_id == "r2" and "inc-001" in self.incidents and self.incidents["inc-001"].status == "in_progress":
            await self._arrive_room2()
        elif room_id == "r3" and "inc-002" in self.incidents and self.incidents["inc-002"].status == "open":
            await self._arrive_room3()

    async def _arrive_room2(self):
        inc = self.incidents["inc-001"]
        now_ms = int(time.time() * 1000)
        await self.emit_event(
            layer="robot", protocol="MQTT", src="Robot", dst="r2-d2", op="PING",
            path="r2-d2/ping", status=2000, latencyMs=18, roomId="r2", deviceId="r2-d2", incidentId=inc.id
        )
        inc.steps = [
            RemediationStep(id="s1", label="Ping (alive?)", detail="Robot pings r2-d1 & r2-d2", src="Robot", dst="r2-d2", status="done", ts=now_ms, latencyMs=22),
            RemediationStep(id="s2", label="Data analysed", detail="NaN burst confirmed", src="Triage", dst="Triage", status="done", ts=now_ms+500, latencyMs=420),
            RemediationStep(id="s3", label="Symptom matched", detail="NaN burst on sensor stream", src="Triage", dst="Triage", status="done", ts=now_ms+900),
            RemediationStep(id="s4", label="Remediation ID found in oneM2M", detail="Catalogue solution 1246", src="Robot", dst="IN-CSE", status="done", ts=now_ms+1300, latencyMs=120),
            RemediationStep(id="s5", label="Robot tells node apply 1246", detail="Primitives: [1, 2, 3, 5]", src="Robot", dst="r2-d2", status="done", ts=now_ms+1700, latencyMs=85),
            RemediationStep(id="s6", label="Node executes & confirms", detail="restart -> recalibrate -> flush -> reboot", src="r2-d2", dst="MN-CSE", status="done", ts=now_ms+2500, latencyMs=1900),
            RemediationStep(id="s7", label="Robot re-verifies", detail="Return verification scheduled", src="Robot", dst="Robot", status="pending"),
        ]
        inc.remediationId = "1246"
        inc.status = "verifying"
        await self.emit_incidents()
        await self.emit_audit("rule", "oneM2M lookup: remediation 1246 (LOW risk) dispatched", "pass")
        await self.emit_security("r2-d2", f"{CSE_PATH}/remediationCatalog/1246", "acp-sensors-write", "allow", 2000)

        # Move to r3 next
        await asyncio.sleep(1.5)
        self.move_robot_to("r3")
        await self.emit_robot()

    async def _arrive_room3(self):
        inc = self.incidents["inc-002"]
        now_ms = int(time.time() * 1000)
        inc.status = "in_progress"
        await self.emit_event(
            layer="robot", protocol="MQTT", src="Robot", dst="r3-d1", op="PING",
            path="r3-d1/ping", status=2000, latencyMs=19, roomId="r3", deviceId="r3-d1", incidentId=inc.id
        )
        inc.steps = [
            RemediationStep(id="s1", label="Ping (alive?)", detail="Robot pings r3-d1", src="Robot", dst="r3-d1", status="done", ts=now_ms, latencyMs=19),
            RemediationStep(id="s2", label="Data analysed", detail="Outlier drift confirmed", src="Triage", dst="Triage", status="done", ts=now_ms+400, latencyMs=380),
            RemediationStep(id="s3", label="Catalogue lookup", detail="No exact match in oneM2M", src="Robot", dst="IN-CSE", status="error", ts=now_ms+800, latencyMs=95),
            RemediationStep(id="s4", label="Local model proposes", detail="Confidence 0.31 below threshold", src="Triage", dst="Triage", status="error", ts=now_ms+1200),
            RemediationStep(id="s5", label="Edge LLM proposes (MCP)", detail="1602: compound drift fix", src="Edge-LLM", dst="Robot", status="done", ts=now_ms+1600, latencyMs=720),
            RemediationStep(id="s6", label="Operator approval", detail="Awaiting decision", src="Operator", dst="Robot", status="pending"),
        ]
        inc.escalation = "llm"
        inc.remediationId = "1602"
        inc.proposedBy = "llm"
        inc.risk = RiskInfo(tier="HIGH", reason="Primitives touch radio modem; ambiguous symptom match (0.62)")
        inc.status = "pending_approval"
        await self.emit_incidents()
        await self.emit_audit("llm", "LLM proposes 1602 (recalibrate, reset radio, reboot)", "info")
        await self.emit_audit("guardrail", "Proposal 1602 flagged HIGH risk - operator approval required", "block")

    # ------------------- Main Tick Loop -------------------
    async def start(self):
        if self.running:
            return
        self.running = True
        self.task = asyncio.create_task(self._run_loop())

    async def stop(self):
        self.running = False
        if self.task:
            self.task.cancel()
            self.task = None

    async def _run_loop(self):
        while self.running:
            try:
                if not self.paused:
                    prev_t = self.t
                    self.t += 0.25 * self.speed

                    # Execute beats
                    for b in self.beats:
                        if b["t"] > self.fired_up_to and b["t"] <= self.t:
                            await b["fn"]()
                    self.fired_up_to = int(self.t)

                    # Ambient traffic & updates
                    await self._ambient_step()
                    await self._update_robot()
                    self._update_link_wave()

                    # Second boundary
                    if int(self.t) > int(prev_t):
                        await self._second_step()

                await asyncio.sleep(0.25)
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[OrchestrationEngine] Error in loop: {e}")
                await asyncio.sleep(1.0)

    async def _update_robot(self):
        if self.robot.busy and self.robot.targetRoomId and self.robot.progress < 1.0:
            self.robot.progress = min(1.0, self.robot.progress + 0.05 * self.speed)
            if self.robot.progress >= 1.0:
                self.robot.posRoomId = self.robot.targetRoomId
                self.robot.busy = False
                self.robot.etaMs = 0
                await self.emit_robot()
                await self._on_robot_arrive(self.robot.posRoomId)
            else:
                await self.emit_robot()

    def _update_link_wave(self):
        if self.link.state == "monitoring":
            target = -86.0 + math.sin(self.t / 8.0) * 4.0
            self.link.rsrp += (target - self.link.rsrp) * 0.1
            self.link.sinr += (18.0 + math.sin(self.t / 6.0) * 2.5 - self.link.sinr) * 0.1

    async def _ambient_step(self):
        p = random.random()
        # Telemetry MQTT -> MEC-IPE
        if p < 0.4:
            r = random.choice(self.rooms)
            d = random.choice(r.devices)
            path = f"{CSE_PATH}/District{r.district}-MN-CSE/{r.name.replace(' ', '')}/{d.id}/timeSeries"
            await self.emit_event(
                layer="device", protocol="MQTT", src=d.id, dst="MEC-IPE", op="NOTIFY",
                path=path, status=2000,
                payload={"m2m": {"rep": {"temp": round(21.5 + random.random()*4, 1), "hum": round(45 + random.random()*8, 1)}}},
                roomId=r.id, deviceId=d.id
            )
            await self.emit_event(
                layer="mca", protocol="HTTP", src="MEC-IPE", dst="MN-CSE", op="CREATE",
                path=path, status=2001, roomId=r.id, deviceId=d.id
            )

        # PollingChannel check
        if p < 0.25:
            await self.emit_event(
                layer="mcc", protocol="polling", src="IN-CSE", dst="RobotAE", op="NOTIFY",
                path=f"{CSE_PATH}/RobotAE/pollingChannel", status=2000, bytes=280
            )

        # Edge LLM denied direct write (ACP demonstration)
        if p < 0.04:
            await self.emit_event(
                layer="llm", protocol="HTTP", src="Edge-LLM", dst="IN-CSE", op="CREATE",
                path=f"{CSE_PATH}/RobotAE/mgmtObj", status=4103, bytes=180,
                payload={"error": "ACCESS_DENIED", "acp": "acp-llm-propose"}
            )
            await self.emit_security("Edge-LLM", f"{CSE_PATH}/RobotAE/mgmtObj", "acp-llm-propose", "deny", 4103)

    async def _second_step(self):
        now_ms = int(time.time() * 1000)
        mps = sum(self.cur_counts.values())
        avg_lat = sum(self.latencies) / len(self.latencies) if self.latencies else 20.0
        restored = len([x for x in self.restored_timestamps if x > self.t - 60])
        active_inc = sum(1 for i in self.incidents.values() if i.status not in ("resolved", "rejected"))

        values = {
            "mps": float(mps),
            "lat": round(avg_lat),
            "rest": float(restored),
            "inc": float(active_inc),
            "rsrp": round(self.link.rsrp),
            "sinr": round(self.link.sinr, 1),
            "hint": float(self.link.interruptionMs),
            "bat": round(self.robot.battery),
            "mem": round(self.robot.memPct + (random.random()-0.5)*2),
            "infpi": round(22.0 + (random.random()-0.5)*4),
            "infmec": round(55.0 + (random.random()-0.5)*8),
        }

        self.cur_counts = {}
        for k in self.kpis:
            if k.id in values:
                k.value = values[k.id]
                k.spark = k.spark[1:] + [k.value]

        await self.broadcast(FeedMessage(type="metric", data={"kpis": [k.model_dump() for k in self.kpis]}))

        self.layer_history = self.layer_history[1:] + [LayerBucket(bucketTs=now_ms, counts=self.cur_counts)]
        self.link.history = self.link.history[1:] + [LinkHistoryItem(ts=now_ms, rsrp=self.link.rsrp, sinr=self.link.sinr)]
        await self.emit_link()

        self.robot.battery = max(5.0, self.robot.battery - 0.02 * self.speed)

    def get_snapshot(self) -> Snapshot:
        return Snapshot(
            subsystems=self.subsystems,
            rooms=self.rooms,
            robot=self.robot,
            queue=self.compute_queue(),
            incidents=list(self.incidents.values()),
            tree=self.tree,
            link=self.link,
            kpis=self.kpis,
            catalog=CATALOG,
            audit=self.audit,
            security=self.security,
            fl=self.fl,
            layerHistory=self.layer_history
        )
