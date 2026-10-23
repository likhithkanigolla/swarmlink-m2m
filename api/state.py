import time
from typing import List, Dict, Any, Optional
from models import (
    Snapshot, SubsystemHealth, RoomHealth, GridPos, DeviceState,
    RobotState, QueueEntry, Incident, RiskInfo, RemediationStep,
    RemediationCatalogEntry, LinkMetrics, LinkHistoryItem, AuditStep,
    TreeNode, Kpi, SecEntry, FlStatus, TrafficEvent, LayerBucket
)

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

class SystemState:
    """In-memory digital twin state representing rooms, devices, robot, and oneM2M entities."""
    def __init__(self):
        self.seq = 0
        now_ms = int(time.time() * 1000)

        self.subsystems = [
            SubsystemHealth(id="in-cse", label="IN-CSE", status="online", type="server", endpoint="//acme.example.com/CSEBase"),
            SubsystemHealth(id="mn-a", label="MN-CSE A", status="online", type="server", endpoint="//acme.example.com/CSEBase/DistrictA-MN-CSE"),
            SubsystemHealth(id="mn-b", label="MN-CSE B", status="standby", type="server", endpoint="//acme.example.com/CSEBase/DistrictB-MN-CSE"),
            SubsystemHealth(id="5g-core", label="5G Core", status="online", type="radio", endpoint="core.5g.local"),
            SubsystemHealth(id="radio", label="5G Radio", status="online", type="wifi", endpoint="gNB-DistrictA"),
            SubsystemHealth(id="edge-llm", label="Edge LLM", status="online", type="brain", endpoint="llm-mcp.edge.local"),
        ]

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

        self.kpis: List[Kpi] = [
            Kpi(id="mps", label="Messages / s", value=14.2, unit="msg/s", spark=[12.0]*40, format="float"),
            Kpi(id="lat", label="Avg latency", value=24.0, unit="ms", spark=[22.0]*40, format="ms"),
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

        self.incidents: Dict[str, Incident] = {}
        self.audit: List[AuditStep] = []
        self.security: List[SecEntry] = []
        self.fl = FlStatus(round=14, modelVersion="v0.9.3", status="idle")
        self.layer_history = [
            LayerBucket(bucketTs=now_ms - (60 - i) * 1000, counts={})
            for i in range(60)
        ]
        self.tree = self._build_tree()

    def _build_tree(self) -> TreeNode:
        cse_path = "//acme.example.com/CSEBase"
        district_a_rooms = [
            TreeNode(
                id=f"room-{r.id}",
                label=r.name.replace(" ", ""),
                kind="AE",
                path=f"{cse_path}/DistrictA-MN-CSE/{r.name.replace(' ', '')}",
                children=[
                    TreeNode(id=f"ts-{r.id}", label="timeSeries", kind="timeSeries", path=f"{cse_path}/.../timeSeries"),
                    TreeNode(id=f"h-{r.id}", label="health", kind="container", path=f"{cse_path}/.../health"),
                    TreeNode(id=f"sem-{r.id}", label="semanticDescriptor", kind="semantic", path=f"{cse_path}/.../semanticDescriptor"),
                ]
            ) for r in self.rooms if r.district == "A"
        ]
        district_b_rooms = [
            TreeNode(
                id=f"room-{r.id}",
                label=r.name.replace(" ", ""),
                kind="AE",
                path=f"{cse_path}/DistrictB-MN-CSE/{r.name.replace(' ', '')}",
                children=[
                    TreeNode(id=f"ts-{r.id}", label="timeSeries", kind="timeSeries", path=f"{cse_path}/.../timeSeries"),
                    TreeNode(id=f"h-{r.id}", label="health", kind="container", path=f"{cse_path}/.../health"),
                    TreeNode(id=f"sem-{r.id}", label="semanticDescriptor", kind="semantic", path=f"{cse_path}/.../semanticDescriptor"),
                ]
            ) for r in self.rooms if r.district == "B"
        ]

        return TreeNode(
            id="cse",
            label="CSEBase",
            kind="CSEBase",
            path=cse_path,
            children=[
                TreeNode(id="mn-a", label="DistrictA-MN-CSE", kind="CSEBase", path=f"{cse_path}/DistrictA-MN-CSE", children=district_a_rooms),
                TreeNode(id="mn-b", label="DistrictB-MN-CSE", kind="CSEBase", path=f"{cse_path}/DistrictB-MN-CSE", children=district_b_rooms),
                TreeNode(
                    id="robot-ae",
                    label="RobotAE",
                    kind="AE",
                    path=f"{cse_path}/RobotAE",
                    children=[
                        TreeNode(id="polling", label="pollingChannel", kind="pollingChannel", path=f"{cse_path}/RobotAE/pollingChannel"),
                        TreeNode(id="mgmt", label="mgmtObj", kind="mgmtObj", path=f"{cse_path}/RobotAE/mgmtObj"),
                    ]
                ),
                TreeNode(id="incidents", label="flexContainer-incidents", kind="flexContainer", path=f"{cse_path}/flexContainer-incidents", children=[]),
                TreeNode(id="groups", label="groups", kind="group", path=f"{cse_path}/groups", children=[
                    TreeNode(id="grp-a", label="grp-rooms-A", kind="group", path=f"{cse_path}/groups/grp-rooms-A")
                ]),
                TreeNode(id="acps", label="ACPs", kind="ACP", path=f"{cse_path}/ACPs", children=[
                    TreeNode(id="acp-s", label="acp-sensors-write", kind="ACP", path=f"{cse_path}/ACPs/acp-sensors-write"),
                    TreeNode(id="acp-r", label="acp-robot-exec", kind="ACP", path=f"{cse_path}/ACPs/acp-robot-exec"),
                    TreeNode(id="acp-l", label="acp-llm-propose", kind="ACP", path=f"{cse_path}/ACPs/acp-llm-propose"),
                    TreeNode(id="acp-o", label="acp-operator-approve", kind="ACP", path=f"{cse_path}/ACPs/acp-operator-approve"),
                ]),
                TreeNode(id="catalog", label="remediationCatalog", kind="catalog", path=f"{cse_path}/remediationCatalog", children=[
                    TreeNode(id=f"cat-{c.id}", label=c.id, kind="catalog", path=f"{cse_path}/remediationCatalog/{c.id}")
                    for c in CATALOG
                ]),
            ]
        )

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
