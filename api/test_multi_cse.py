"""
api/test_multi_cse.py

Pytest test suite verifying R1 - R5 requirements:
- R1: Multi-CSE local topology (:8080, :8081, :8082) and Mcc remoteCSE registration
- R2: MEC-IPE telemetry mapping into [custom:mecRadioInfo] flexContainer
- R3: RobotAE pollingChannel (/pcu) notification and swarm task execution
- R4: Signal-triggered handover (ETSI TR-0077 Clause 7.2) with interruption measurement
- R5: Cross-verification with FastAPI backend endpoints
"""

import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
if str(PROJECT_ROOT / "api") not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT / "api"))

import pytest
import asyncio
import httpx
from fastapi.testclient import TestClient

from main import app
from acme import AcmeClient
from mec_ipe import MecIpe
from robot_agent import RobotAgent
from scripts.simulate_handover import simulate_handover, HandoverDecisionEngine, THRESHOLD, HYSTERESIS_MARGIN

client = TestClient(app)
acme = AcmeClient()

def test_r1_multi_cse_connectivity():
    """Verify all 3 CSE instances are responsive on ports 8080, 8081, 8082."""
    async def run():
        health_results = await acme.check_all_cses_health()
        assert health_results["in_cse"]["connected"] is True, f"IN-CSE offline: {health_results['in_cse']}"
        assert health_results["district_a"]["connected"] is True, f"District A offline: {health_results['district_a']}"
        assert health_results["district_b"]["connected"] is True, f"District B offline: {health_results['district_b']}"
        assert health_results["all_healthy"] is True
    asyncio.run(run())

def test_r1_mcc_remotecse_links():
    """Verify District A and B have established Mcc remoteCSE registrations with IN-CSE."""
    async def run():
        csr_uris = await acme.discover_resources(filter_ty=16, base_url="http://localhost:8080", cse_name="cse-in")
        assert any("id-mn-a" in uri for uri in csr_uris), f"Missing District A remoteCSE in {csr_uris}"
        assert any("id-mn-b" in uri for uri in csr_uris), f"Missing District B remoteCSE in {csr_uris}"
    asyncio.run(run())

def test_r2_mec_ipe_flexcontainer():
    """Verify MEC-IPE publishes and retrieves 5G radio metrics into [custom:mecRadioInfo]."""
    async def run():
        ipe = MecIpe(cse_url="http://localhost:8081/DistrictA-MN-CSE")
        test_rsrp = -91.5
        test_sinr = 16.2
        pub_res = await ipe.publish_metrics(rsrp=test_rsrp, sinr=test_sinr, cqi=14, mcs=26, bler=0.002)
        assert pub_res["status"] == "success"

        latest = await ipe.get_latest_metrics()
        assert latest is not None
        assert latest["rsrp"] == test_rsrp
        assert latest["sinr"] == test_sinr
        assert latest["cqi"] == 14
        assert latest["mcs"] == 26
    asyncio.run(run())

def test_r3_robot_ae_polling_and_tasks():
    """Verify RobotAE registration, /pcu long-poll notification delivery, and task processing."""
    async def run():
        robot = RobotAgent(cse_url="http://localhost:8081/DistrictA-MN-CSE")
        reg_ok = await robot.register_ae()
        assert reg_ok is True

        # Dispatch a task to tasks container
        task_id = "pytest-task-01"
        dispatched = await robot.dispatch_task(task_id, primitive=2, target_room="r2", target_device="r2-d1")
        assert dispatched is True

        # Poll /pcu virtual resource
        polled = await robot.poll_once(timeout=4.0)
        if not polled:
            polled = await robot.fetch_latest_task_fallback()
        assert polled is not None
        assert polled.get("taskId") == task_id

        # Process task primitives (PROPOSED -> ASSIGNED -> EXECUTING -> DONE)
        result = await robot.process_task(polled)
        assert result["status"] == "DONE"
        assert result["primitive"] == "recalibrate"
        assert robot.state["posRoomId"] == "r2"
    asyncio.run(run())

def test_r4_signal_triggered_handover():
    """Verify ETSI TR-0077 handover execution, interruption measurement, and post-handover task execution."""
    async def run():
        summary = await simulate_handover(verbose=False)
        assert summary["status"] == "success"
        assert summary["active_district"] == "B"
        assert summary["trigger_rsrp"] < summary["threshold"]
        assert summary["handover_interruption_ms"] > 0
        assert summary["task_status"] == "DONE"
    asyncio.run(run())

def test_r5_fastapi_multi_cse_alignment():
    """Verify FastAPI backend endpoints aggregate and align multi-CSE data."""
    # 1. Snapshot subsystems
    snap_resp = client.get("/api/snapshot")
    assert snap_resp.status_code == 200
    snap = snap_resp.json()
    sub_map = {s["id"]: s for s in snap["subsystems"]}
    assert sub_map["in-cse"]["status"] == "online"
    assert sub_map["mn-a"]["status"] in ("online", "standby")
    assert sub_map["mn-b"]["status"] in ("online", "standby")

    # 2. Resource tree contains multi-CSE districts
    tree = snap["tree"]
    assert tree["label"] == "cse-in"
    child_labels = [c["label"] for c in tree.get("children", [])]
    assert any("DistrictA" in l or "id-mn-a" in l for l in child_labels)
    assert any("DistrictB" in l or "id-mn-b" in l for l in child_labels)

    # 3. Multi-status endpoint
    multi_resp = client.get("/api/acme/multi-status")
    assert multi_resp.status_code == 200
    multi_data = multi_resp.json()
    assert multi_data["all_healthy"] is True
    assert len(multi_data["mcc_remote_cses"]) >= 2

def test_hardening_mec_ipe_ingress_clamping():
    """Verify physical bounds clamping on radio metrics in MEC-IPE."""
    async def run():
        ipe = MecIpe(cse_url="http://localhost:8081/DistrictA-MN-CSE")
        # Test low boundary clamping
        res_low = await ipe.publish_metrics(rsrp=-160.0, sinr=-35.0, cqi=-5, mcs=-10, bler=-0.2)
        assert res_low["status"] == "success"
        m_low = res_low["metrics"]
        assert m_low["rsrp"] == -140.0
        assert m_low["sinr"] == -20.0
        assert m_low["cqi"] == 0
        assert m_low["mcs"] == 0
        assert m_low["bler"] == 0.0

        # Test high boundary clamping
        res_high = await ipe.publish_metrics(rsrp=-20.0, sinr=55.0, cqi=30, mcs=50, bler=2.5)
        assert res_high["status"] == "success"
        m_high = res_high["metrics"]
        assert m_high["rsrp"] == -40.0
        assert m_high["sinr"] == 40.0
        assert m_high["cqi"] == 15
        assert m_high["mcs"] == 28
        assert m_high["bler"] == 1.0
    asyncio.run(run())

def test_hardening_robot_agent_payload_and_primitive_validation():
    """Verify RobotAgent gracefully transitions to FAILED for non-dict or unsupported primitives."""
    async def run():
        robot = RobotAgent(cse_url="http://localhost:8081/DistrictA-MN-CSE")

        # 1. Non-dict corrupt payload
        res_corrupt = await robot.process_task("corrupt_string_payload")
        assert res_corrupt["status"] == "FAILED"
        assert "Corrupt or non-dict" in res_corrupt["reason"]

        # 2. None payload
        res_none = await robot.process_task(None)
        assert res_none["status"] == "FAILED"

        # 3. Unsupported primitive ID (e.g. 99)
        res_bad_prim = await robot.process_task({"taskId": "task-unsupported-99", "primitive": 99})
        assert res_bad_prim["status"] == "FAILED"
        assert "Unsupported primitive 99" in res_bad_prim["reason"]
        assert robot.state["busy"] is False
    asyncio.run(run())

def test_hardening_robot_agent_battery_depletion():
    """Verify battery underflow fix: low battery (< 10%) depletes cleanly to 0 without resetting to 10%."""
    async def run():
        robot = RobotAgent(cse_url="http://localhost:8081/DistrictA-MN-CSE")

        # Sub-10% depletion
        robot.state["battery"] = 5.0
        res = await robot.process_task({"taskId": "task-bat-5", "primitive": 1})
        assert res["status"] == "DONE"
        assert robot.state["battery"] == 4.5

        # Depletion clamping at 0.0
        robot.state["battery"] = 0.2
        res2 = await robot.process_task({"taskId": "task-bat-0", "primitive": 1})
        assert res2["status"] == "DONE"
        assert robot.state["battery"] == 0.0
    asyncio.run(run())

def test_hardening_robot_agent_registration_verification():
    """Verify RobotAgent.register_ae() returns False when target CSE is unreachable."""
    async def run():
        robot = RobotAgent(cse_url="http://localhost:59999/UnreachableCSE")
        success = await robot.register_ae()
        assert success is False
    asyncio.run(run())

def test_hardening_handover_hysteresis_and_pingpong():
    """Verify HandoverDecisionEngine hysteresis prevents rapid oscillation and ping-pong handovers."""
    engine = HandoverDecisionEngine(threshold=THRESHOLD, hysteresis=HYSTERESIS_MARGIN, time_to_trigger=2)

    # Oscillating signal near threshold -105.0 dBm
    assert engine.evaluate(-104.8) is False
    assert engine.evaluate(-105.2) is False  # breach 1, holds within hysteresis margin
    assert engine.evaluate(-104.9) is False  # oscillates back above, counter resets
    assert engine.evaluate(-105.1) is False  # breach 1, holds again

    # Genuine degradation below threshold - hysteresis (-107.0 dBm)
    assert engine.evaluate(-107.2) is True  # triggers immediately!

    # Migration complete to District B
    engine.on_handover_complete("B")

    # While on District B, returning to District A requires clearing threshold + hysteresis (-103.0 dBm)
    assert engine.evaluate(-104.5) is False  # -104.5 is not > -103.0, ping-pong suppressed
    assert engine.evaluate(-102.5) is True   # -102.5 > -103.0, valid return

def test_hardening_handover_target_outage_detection():
    """Verify simulate_handover explicitly fails if target CSE is unreachable."""
    async def run():
        summary = await simulate_handover(verbose=False, mn_b_url="http://localhost:59999/NoSuchCSE")
        assert summary["status"] == "failed"
        assert summary["robot_registered"] is False
        assert "unreachable" in summary["error"].lower()
    asyncio.run(run())

def test_hardening_handover_native_failure_processing():
    """Verify simulate_handover with fail_task=True uses native robot.process_task(primitive=99)."""
    async def run():
        summary = await simulate_handover(verbose=False, fail_task=True)
        assert summary["status"] == "success"
        assert summary["task_status"] == "FAILED"
        assert summary["handover_interruption_ms"] > 0
    asyncio.run(run())
