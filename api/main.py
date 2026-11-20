import json
import time
from typing import List, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import Snapshot, FeedMessage, TrafficEvent, Incident
from state import SystemState
from acme import AcmeClient

app = FastAPI(
    title="SwarmLink-M2M Command Center Backend",
    description="FastAPI REST & WebSocket gateway for oneM2M private-5G robot middleware and ESP32 swarms.",
    version="1.0.0"
)

acme_client = AcmeClient()

# CORS middleware to allow connection from Vite frontend dev server (port 5173, 3000, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

system_state = SystemState()

class ConnectionManager:
    """Manages active WebSocket client connections and broadcasts."""
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    async def broadcast(self, message: FeedMessage):
        payload = message.model_dump()
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(payload)
            except Exception:
                dead.append(connection)
        for d in dead:
            self.active_connections.discard(d)

manager = ConnectionManager()

# ----------------- Base API Route Templates -----------------

@app.get("/api/health")
async def health_check():
    """Simple health probe."""
    return {"status": "ok", "service": "swarmlink-m2m-backend", "timestamp": int(time.time() * 1000)}

@app.get("/api/snapshot", response_model=Snapshot)
async def get_snapshot():
    """Returns the full system snapshot for initial dashboard synchronization."""
    snapshot = system_state.get_snapshot()
    multi_health = await acme_client.check_all_cses_health()
    in_health = multi_health.get("in_cse", {})
    a_health = multi_health.get("district_a", {})
    b_health = multi_health.get("district_b", {})

    active_district = system_state.link.district
    for s in snapshot.subsystems:
        if s.id == "in-cse":
            s.status = "online" if in_health.get("connected") else "offline"
            s.endpoint = f"{acme_client.base_url}/{acme_client.cse_name}"
        elif s.id == "mn-a":
            if a_health.get("connected"):
                s.status = "online" if active_district == "A" else "standby"
            else:
                s.status = "offline"
            s.endpoint = f"{acme_client.mn_a_url}/{acme_client.mn_a_name}"
        elif s.id == "mn-b":
            if b_health.get("connected"):
                s.status = "online" if active_district == "B" else "standby"
            else:
                s.status = "offline"
            s.endpoint = f"{acme_client.mn_b_url}/{acme_client.mn_b_name}"

    if in_health.get("connected"):
        snapshot.tree = await acme_client.get_multi_cse_tree()
    return snapshot

# Subsystems
@app.get("/api/subsystems")
async def get_subsystems():
    """Returns status of all monitored edge & core subsystems (IN-CSE, MN-CSE A/B, 5G Core, Radio, Edge-LLM)."""
    multi_health = await acme_client.check_all_cses_health()
    in_health = multi_health.get("in_cse", {})
    a_health = multi_health.get("district_a", {})
    b_health = multi_health.get("district_b", {})
    active_district = system_state.link.district

    for s in system_state.subsystems:
        if s.id == "in-cse":
            s.status = "online" if in_health.get("connected") else "offline"
            s.endpoint = f"{acme_client.base_url}/{acme_client.cse_name}"
        elif s.id == "mn-a":
            if a_health.get("connected"):
                s.status = "online" if active_district == "A" else "standby"
            else:
                s.status = "offline"
            s.endpoint = f"{acme_client.mn_a_url}/{acme_client.mn_a_name}"
        elif s.id == "mn-b":
            if b_health.get("connected"):
                s.status = "online" if active_district == "B" else "standby"
            else:
                s.status = "offline"
            s.endpoint = f"{acme_client.mn_b_url}/{acme_client.mn_b_name}"

    return [s.model_dump() for s in system_state.subsystems]

@app.put("/api/subsystems/{subsystem_id}")
async def update_subsystem(subsystem_id: str, payload: dict):
    """Base template: update subsystem status (e.g. online, standby, warn, offline)."""
    for s in system_state.subsystems:
        if s.id == subsystem_id:
            if "status" in payload:
                s.status = payload["status"]
            if "endpoint" in payload:
                s.endpoint = payload["endpoint"]
            await manager.broadcast(FeedMessage(type="subsystems", data=[sub.model_dump() for sub in system_state.subsystems]))
            return s.model_dump()
    raise HTTPException(status_code=404, detail="Subsystem not found")

# Rooms & Devices
@app.get("/api/rooms")
async def get_rooms():
    """Returns all 4 rooms and their respective ESP32 device states."""
    return [r.model_dump() for r in system_state.rooms]

@app.get("/api/rooms/{room_id}")
async def get_room(room_id: str):
    """Returns state of a single room."""
    for r in system_state.rooms:
        if r.id == room_id:
            return r.model_dump()
    raise HTTPException(status_code=404, detail="Room not found")

@app.post("/api/rooms/{room_id}/devices/{device_id}/fault")
async def inject_device_fault(room_id: str, device_id: str, payload: dict):
    """Base template: inject or clear a simulated fault (nan, outlier, silent, or None)."""
    for r in system_state.rooms:
        if r.id == room_id:
            for d in r.devices:
                if d.id == device_id:
                    fault = payload.get("fault")
                    d.fault = fault
                    d.health = "fault" if fault else "alive"
                    d.lastSeenTs = int(time.time() * 1000)
                    await manager.broadcast(FeedMessage(type="room", data=[room.model_dump() for room in system_state.rooms]))
                    return d.model_dump()
    raise HTTPException(status_code=404, detail="Device or room not found")

# Robot Doctor
@app.get("/api/robot")
async def get_robot():
    """Returns robot telemetry, position, battery, memory, and route."""
    return system_state.robot.model_dump()

@app.post("/api/robot/dispatch")
async def dispatch_robot(payload: dict):
    """Base template: command the robot doctor to navigate to a target room."""
    target_room_id = payload.get("targetRoomId")
    if target_room_id:
        system_state.robot.targetRoomId = target_room_id
        system_state.robot.busy = True
        system_state.robot.progress = 0.0
        await manager.broadcast(FeedMessage(type="robot", data=system_state.robot.model_dump()))
    return system_state.robot.model_dump()

# Triage Priority Queue
@app.get("/api/queue")
async def get_queue():
    """Returns the calculated triage priority queue."""
    entries = system_state.compute_queue()
    return [e.model_dump() for e in entries]

# Incidents & Remediation
@app.get("/api/incidents")
async def get_incidents():
    """Returns all active, pending, or resolved incidents."""
    return [inc.model_dump() for inc in system_state.incidents.values()]

@app.get("/api/incidents/{incident_id}")
async def get_incident(incident_id: str):
    """Returns details of a specific incident."""
    if incident_id in system_state.incidents:
        return system_state.incidents[incident_id].model_dump()
    raise HTTPException(status_code=404, detail="Incident not found")

@app.post("/api/incidents/{incident_id}/approve")
async def approve_incident(incident_id: str):
    """Operator approves a proposed remediation action."""
    now_ms = int(time.time() * 1000)
    if incident_id not in system_state.incidents:
        # If not already in dictionary, create or record audit event
        event = TrafficEvent(
            id=f"e{int(time.time()*1000)%100000}",
            ts=now_ms,
            layer="robot",
            protocol="HTTP",
            src="Operator",
            dst="IN-CSE",
            op="UPDATE",
            path=f"//acme.example.com/CSEBase/flexContainer-incidents/{incident_id}",
            status=2004,
            latencyMs=18,
            bytes=190,
            correlationId=f"c-{incident_id}",
            payload={"decision": "approved", "status": "in_progress"},
            incidentId=incident_id
        )
        await manager.broadcast(FeedMessage(type="event", data=event.model_dump()))
        return {"status": "approved", "incidentId": incident_id}

    inc = system_state.incidents[incident_id]
    inc.status = "in_progress"
    inc.escalation = "human"
    inc.updatedAt = now_ms

    await manager.broadcast(FeedMessage(type="incident", data=[i.model_dump() for i in system_state.incidents.values()]))
    return {"status": "approved", "incidentId": incident_id}

@app.post("/api/incidents/{incident_id}/reject")
async def reject_incident(incident_id: str):
    """Operator rejects a proposed action and escalates to manual intervention."""
    now_ms = int(time.time() * 1000)
    if incident_id in system_state.incidents:
        inc = system_state.incidents[incident_id]
        inc.status = "rejected"
        inc.updatedAt = now_ms
        await manager.broadcast(FeedMessage(type="incident", data=[i.model_dump() for i in system_state.incidents.values()]))

    event = TrafficEvent(
        id=f"e{int(time.time()*1000)%100000}",
        ts=now_ms,
        layer="llm",
        protocol="MCP",
        src="Robot",
        dst="Edge-LLM",
        op="UPDATE",
        path="mcp/feedback",
        status=2004,
        latencyMs=15,
        bytes=140,
        correlationId=f"c-{incident_id}",
        payload={"decision": "rejected", "reason": "operator override"},
        incidentId=incident_id
    )
    await manager.broadcast(FeedMessage(type="event", data=event.model_dump()))
    return {"status": "rejected", "incidentId": incident_id}

# 5G Link & Handover
@app.get("/api/link")
async def get_link():
    """Returns current 5G radio metrics (RSRP, SINR, handover state, district)."""
    return system_state.link.model_dump()

@app.post("/api/link/handover")
async def trigger_handover(payload: dict):
    """Initiate a simulated or RNIS-triggered 5G handover between District A and B."""
    target_district = payload.get("district", "B" if system_state.link.district == "A" else "A")
    state = payload.get("state", "re_registering")
    interruption_ms = payload.get("interruptionMs", 42)
    rsrp = payload.get("rsrp")
    sinr = payload.get("sinr")

    system_state.link.state = state
    system_state.link.district = target_district
    system_state.link.interruptionMs = interruption_ms
    if rsrp is not None:
        system_state.link.rsrp = float(rsrp)
    if sinr is not None:
        system_state.link.sinr = float(sinr)

    # Maintain link history
    now_ms = int(time.time() * 1000)
    from models import LinkHistoryItem
    system_state.link.history.append(
        LinkHistoryItem(ts=now_ms, rsrp=system_state.link.rsrp, sinr=system_state.link.sinr)
    )
    if len(system_state.link.history) > 60:
        system_state.link.history = system_state.link.history[-60:]

    # Update subsystem statuses
    for s in system_state.subsystems:
        if s.id == "mn-a":
            s.status = "online" if target_district == "A" else "standby"
        elif s.id == "mn-b":
            s.status = "online" if target_district == "B" else "standby"

    await manager.broadcast(FeedMessage(type="link", data=system_state.link.model_dump()))
    await manager.broadcast(FeedMessage(type="subsystems", data=[sub.model_dump() for sub in system_state.subsystems]))
    return system_state.link.model_dump()

# oneM2M ACME Integration
@app.get("/api/acme/status")
async def get_acme_status():
    """Checks live connection status to ACME CSE at localhost:8080."""
    return await acme_client.check_health()

@app.get("/api/acme/multi-status")
async def get_multi_acme_status():
    """Returns aggregated status of IN-CSE, MN-CSE A, MN-CSE B, and Mcc remoteCSE registrations."""
    return await acme_client.check_all_cses_health()

@app.get("/api/acme/discover")
async def discover_acme_resources():
    """Discovers all resource paths registered under ACME CSEBase."""
    urils = await acme_client.discover_resources()
    return {"cse": acme_client.cse_name, "count": len(urils), "resources": urils}

# oneM2M Resource Tree
@app.get("/api/tree")
async def get_tree():
    """Returns oneM2M resource tree. Attempts to query live multi-CSE first, with graceful fallback to system state."""
    acme_health = await acme_client.check_health()
    if acme_health.get("connected"):
        live_tree = await acme_client.get_multi_cse_tree()
        for s in system_state.subsystems:
            if s.id == "in-cse":
                s.status = "online"
                s.endpoint = f"{acme_client.base_url}/{acme_client.cse_name}"
        return live_tree.model_dump()
    return system_state.tree.model_dump()

# KPIs & Metrics
@app.get("/api/kpis")
async def get_kpis():
    """Returns active KPI metrics list."""
    return [k.model_dump() for k in system_state.kpis]

# Federated Learning Status
@app.get("/api/fl")
async def get_fl_status():
    """Returns Federated Learning round and model version status."""
    return system_state.fl.model_dump()

@app.post("/api/fl/round")
async def start_fl_round(payload: dict):
    """Base template: trigger or simulate a federated learning training round."""
    system_state.fl.status = "training"
    system_state.fl.round += 1
    await manager.broadcast(FeedMessage(type="fl", data=system_state.fl.model_dump()))
    return system_state.fl.model_dump()

# Traffic Events Ingress
@app.post("/api/events")
async def publish_event(event: TrafficEvent):
    """Allows external oneM2M middleware, 5G Core, or robot agents to publish live traffic events into the dashboard."""
    await manager.broadcast(FeedMessage(type="event", data=event.model_dump()))
    return {"status": "published", "eventId": event.id}

# ----------------- WebSocket Feed -----------------

@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    """Real-time WebSocket endpoint that streams FeedMessage frames to connected dashboards."""
    await manager.connect(websocket)
    try:
        # Immediately push initial snapshot to newly connected client
        snapshot = await get_snapshot()
        await websocket.send_json({"type": "snapshot", "data": snapshot.model_dump()})

        while True:
            # Keep socket alive and receive client heartbeats or messages
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                # echo or handle client frames if needed
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
