import asyncio
import json
import os
import sys
import time
from contextlib import asynccontextmanager

# Ensure api directory is in python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from typing import List, Set
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from models import Snapshot, FeedMessage, TrafficEvent, Incident, LinkHistoryItem
from engine import OrchestrationEngine
from acme import AcmeClient

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
        for connection in list(self.active_connections):
            try:
                await connection.send_json(payload)
            except Exception:
                dead.append(connection)
        for d in dead:
            self.active_connections.discard(d)

manager = ConnectionManager()
acme_client = AcmeClient()
engine = OrchestrationEngine(broadcast_fn=manager.broadcast, acme_client=acme_client)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start real-time digital twin background orchestration
    await engine.start()
    yield
    # Graceful shutdown
    await engine.stop()

app = FastAPI(
    title="SwarmLink-M2M Command Center Backend",
    description="FastAPI REST & WebSocket gateway for oneM2M private-5G robot middleware and ESP32 swarms.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware to allow connection from Vite frontend dev server (port 5173, etc.)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Base API Routes -----------------

@app.get("/api/health")
async def health_check():
    """Simple health probe."""
    return {"status": "ok", "service": "swarmlink-m2m-backend", "timestamp": int(time.time() * 1000)}

@app.get("/api/snapshot", response_model=Snapshot)
async def get_snapshot():
    """Returns the full system snapshot for initial dashboard synchronization."""
    snapshot = engine.get_snapshot()
    multi_health = await acme_client.check_all_cses_health()
    in_health = multi_health.get("in_cse", {})
    a_health = multi_health.get("district_a", {})
    b_health = multi_health.get("district_b", {})

    active_district = engine.link.district
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
        try:
            live_tree = await acme_client.get_multi_cse_tree()
            if live_tree and live_tree.children:
                snapshot.tree = live_tree
        except Exception:
            pass
    return snapshot

# Subsystems
@app.get("/api/subsystems")
async def get_subsystems():
    """Returns status of all monitored edge & core subsystems (IN-CSE, MN-CSE A/B, 5G Core, Radio, Edge-LLM)."""
    multi_health = await acme_client.check_all_cses_health()
    in_health = multi_health.get("in_cse", {})
    a_health = multi_health.get("district_a", {})
    b_health = multi_health.get("district_b", {})
    active_district = engine.link.district

    for s in engine.subsystems:
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

    return [s.model_dump() for s in engine.subsystems]

@app.put("/api/subsystems/{subsystem_id}")
async def update_subsystem(subsystem_id: str, payload: dict):
    for s in engine.subsystems:
        if s.id == subsystem_id:
            if "status" in payload:
                s.status = payload["status"]
            if "endpoint" in payload:
                s.endpoint = payload["endpoint"]
            await manager.broadcast(FeedMessage(type="subsystems", data=[sub.model_dump() for sub in engine.subsystems]))
            return s.model_dump()
    raise HTTPException(status_code=404, detail="Subsystem not found")

# Rooms & Devices
@app.get("/api/rooms")
async def get_rooms():
    return [r.model_dump() for r in engine.rooms]

@app.get("/api/rooms/{room_id}")
async def get_room(room_id: str):
    for r in engine.rooms:
        if r.id == room_id:
            return r.model_dump()
    raise HTTPException(status_code=404, detail="Room not found")

@app.post("/api/rooms/{room_id}/devices/{device_id}/fault")
async def inject_device_fault(room_id: str, device_id: str, payload: dict):
    fault = payload.get("fault")
    engine.set_device_fault(device_id, fault)
    await engine.emit_rooms()
    await engine.emit_queue()
    return {"status": "updated", "roomId": room_id, "deviceId": device_id, "fault": fault}

# Robot Doctor
@app.get("/api/robot")
async def get_robot():
    return engine.robot.model_dump()

@app.post("/api/robot/dispatch")
async def dispatch_robot(payload: dict):
    target_room_id = payload.get("targetRoomId")
    if target_room_id:
        engine.move_robot_to(target_room_id)
        await engine.emit_robot()
    return engine.robot.model_dump()

# Triage Priority Queue
@app.get("/api/queue")
async def get_queue():
    entries = engine.compute_queue()
    return [e.model_dump() for e in entries]

# Incidents & Remediation
@app.get("/api/incidents")
async def get_incidents():
    return [inc.model_dump() for inc in engine.incidents.values()]

@app.get("/api/incidents/{incident_id}")
async def get_incident(incident_id: str):
    if incident_id in engine.incidents:
        return engine.incidents[incident_id].model_dump()
    raise HTTPException(status_code=404, detail="Incident not found")

@app.post("/api/incidents/{incident_id}/approve")
async def approve_incident(incident_id: str):
    """Operator approves a proposed remediation action."""
    await engine.decide_incident(incident_id, approve=True)
    return {"status": "approved", "incidentId": incident_id}

@app.post("/api/incidents/{incident_id}/reject")
async def reject_incident(incident_id: str):
    """Operator rejects a proposed action and escalates to manual intervention."""
    await engine.decide_incident(incident_id, approve=False)
    return {"status": "rejected", "incidentId": incident_id}

# 5G Link & Handover
@app.get("/api/link")
async def get_link():
    return engine.link.model_dump()

@app.post("/api/link/handover")
async def trigger_handover(payload: dict):
    target_district = payload.get("district", "B" if engine.link.district == "A" else "A")
    state = payload.get("state", "re_registering")
    interruption_ms = payload.get("interruptionMs", 28)
    rsrp = payload.get("rsrp")
    sinr = payload.get("sinr")

    engine.link.state = state
    engine.link.district = target_district
    engine.link.interruptionMs = interruption_ms
    if rsrp is not None:
        engine.link.rsrp = float(rsrp)
    if sinr is not None:
        engine.link.sinr = float(sinr)

    now_ms = int(time.time() * 1000)
    engine.link.history.append(
        LinkHistoryItem(ts=now_ms, rsrp=engine.link.rsrp, sinr=engine.link.sinr)
    )
    if len(engine.link.history) > 60:
        engine.link.history = engine.link.history[-60:]

    for s in engine.subsystems:
        if s.id == "mn-a":
            s.status = "online" if target_district == "A" else "standby"
        elif s.id == "mn-b":
            s.status = "online" if target_district == "B" else "standby"

    await engine.emit_link()
    await manager.broadcast(FeedMessage(type="subsystems", data=[sub.model_dump() for sub in engine.subsystems]))
    return engine.link.model_dump()

# oneM2M ACME Integration
@app.get("/api/acme/status")
async def get_acme_status():
    return await acme_client.check_health()

@app.get("/api/acme/multi-status")
async def get_multi_acme_status():
    return await acme_client.check_all_cses_health()

@app.get("/api/acme/discover")
async def discover_acme_resources():
    urils = await acme_client.discover_resources()
    return {"cse": acme_client.cse_name, "count": len(urils), "resources": urils}

# oneM2M Resource Tree
@app.get("/api/tree")
async def get_tree():
    acme_health = await acme_client.check_health()
    if acme_health.get("connected"):
        try:
            live_tree = await acme_client.get_multi_cse_tree()
            if live_tree and live_tree.children:
                return live_tree.model_dump()
        except Exception:
            pass
    return engine.tree.model_dump()

# KPIs & Metrics
@app.get("/api/kpis")
async def get_kpis():
    return [k.model_dump() for k in engine.kpis]

# Federated Learning Status
@app.get("/api/fl")
async def get_fl_status():
    return engine.fl.model_dump()

@app.post("/api/fl/round")
async def start_fl_round(payload: dict):
    engine.fl.status = "training"
    engine.fl.round += 1
    await manager.broadcast(FeedMessage(type="fl", data=engine.fl.model_dump()))
    return engine.fl.model_dump()

# Traffic Events Ingress
@app.post("/api/events")
async def publish_event(event: TrafficEvent):
    await manager.broadcast(FeedMessage(type="event", data=event.model_dump()))
    return {"status": "published", "eventId": event.id}

# ----------------- WebSocket Feed -----------------

@app.websocket("/ws/events")
async def websocket_events(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        # Immediately push initial comprehensive snapshot to newly connected client
        snapshot = await get_snapshot()
        await websocket.send_json({"type": "snapshot", "data": snapshot.model_dump()})

        while True:
            # Keep socket alive and receive client heartbeats or messages
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
            except Exception:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
