from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "swarmlink-m2m-backend"

def test_get_snapshot():
    response = client.get("/api/snapshot")
    assert response.status_code == 200
    data = response.json()
    # Verify 4 rooms
    assert len(data["rooms"]) == 4
    assert data["rooms"][0]["id"] == "r1"
    assert data["rooms"][1]["id"] == "r2"
    assert data["rooms"][2]["id"] == "r3"
    assert data["rooms"][3]["id"] == "r4"
    # Verify subsystems
    subsystem_ids = [s["id"] for s in data["subsystems"]]
    assert "in-cse" in subsystem_ids
    assert "mn-a" in subsystem_ids
    assert "mn-b" in subsystem_ids
    # Verify robot
    assert data["robot"]["posRoomId"] == "r1"
    # Verify link
    assert data["link"]["district"] == "A"

def test_approve_reject_incident():
    # Approve
    resp_approve = client.post("/api/incidents/inc-test-01/approve")
    assert resp_approve.status_code == 200
    assert resp_approve.json()["status"] == "approved"

    # Reject
    resp_reject = client.post("/api/incidents/inc-test-01/reject")
    assert resp_reject.status_code == 200
    assert resp_reject.json()["status"] == "rejected"

def test_base_route_templates():
    # Subsystems
    sub_resp = client.get("/api/subsystems")
    assert sub_resp.status_code == 200
    assert len(sub_resp.json()) == 6

    # Rooms
    rooms_resp = client.get("/api/rooms")
    assert rooms_resp.status_code == 200
    assert len(rooms_resp.json()) == 4

    # Robot & Dispatch
    robot_resp = client.get("/api/robot")
    assert robot_resp.status_code == 200
    assert robot_resp.json()["posRoomId"] == "r1"

    dispatch_resp = client.post("/api/robot/dispatch", json={"targetRoomId": "r2"})
    assert dispatch_resp.status_code == 200
    assert dispatch_resp.json()["targetRoomId"] == "r2"

    # Queue
    queue_resp = client.get("/api/queue")
    assert queue_resp.status_code == 200
    assert len(queue_resp.json()) == 4

    # Link & Handover
    link_resp = client.get("/api/link")
    assert link_resp.status_code == 200
    assert link_resp.json()["district"] in ["A", "B"]

    handover_resp = client.post("/api/link/handover", json={"district": "B"})
    assert handover_resp.status_code == 200
    assert handover_resp.json()["district"] == "B"

    # Tree
    tree_resp = client.get("/api/tree")
    assert tree_resp.status_code == 200
    assert tree_resp.json()["label"] == "CSEBase"

    # KPIs
    kpi_resp = client.get("/api/kpis")
    assert kpi_resp.status_code == 200
    assert len(kpi_resp.json()) >= 10

    # FL
    fl_resp = client.get("/api/fl")
    assert fl_resp.status_code == 200

    fl_round_resp = client.post("/api/fl/round", json={})
    assert fl_round_resp.status_code == 200
    assert fl_round_resp.json()["status"] == "training"
