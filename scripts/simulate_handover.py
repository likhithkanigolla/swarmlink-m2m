#!/usr/bin/env python3
"""
scripts/simulate_handover.py

Simulates 5G signal degradation (RSRP < -105 dBm) and executes ETSI TR-0077 Clause 7.2
handover of RobotAE between MN-CSE instances:
1. Monitoring: Telemetry on DistrictA-MN-CSE (:8081) RSRP ~ -88 dBm
2. Triggered: RSRP drops progressively to -106.5 dBm (< -105 dBm threshold)
3. Re-registering: De-registers RobotAE from District A, registers on District B (:8082),
   measures high-resolution handover interruption time (Delta t)
4. Restored: Re-establishes pollingChannel and subscription on District B, restores RSRP ~ -85 dBm
5. Swarm Task Coordination: Dispatches and processes swarm tasks across state transitions:
   PROPOSED -> ASSIGNED -> EXECUTING -> DONE / FAILED
"""

import os
import sys
import time
import json
import asyncio
from pathlib import Path
from typing import Dict, Any, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "api"))

from mec_ipe import MecIpe
from robot_agent import RobotAgent, PRIMITIVES
import httpx

MN_A_URL = os.getenv("MN_A_URL", "http://localhost:8081/DistrictA-MN-CSE").rstrip("/")
MN_B_URL = os.getenv("MN_B_URL", "http://localhost:8082/DistrictB-MN-CSE").rstrip("/")
FASTAPI_URL = os.getenv("FASTAPI_URL", "http://localhost:8000").rstrip("/")
THRESHOLD = -105.0
HYSTERESIS_MARGIN = 2.0  # dBm hysteresis margin
TIME_TO_TRIGGER_SAMPLES = 2  # consecutive samples required for borderline signals

class HandoverDecisionEngine:
    """
    3GPP / ETSI TR-0077 A3 Event & Hysteresis Decision Engine:
    Prevents ping-pong handovers when RSRP oscillates near the threshold.
    """
    def __init__(
        self,
        threshold: float = THRESHOLD,
        hysteresis: float = HYSTERESIS_MARGIN,
        time_to_trigger: int = TIME_TO_TRIGGER_SAMPLES
    ):
        self.threshold = threshold
        self.hysteresis = hysteresis
        self.time_to_trigger = time_to_trigger
        self.consecutive_breaches = 0
        self.current_district = "A"

    def evaluate(self, rsrp: float, target_rsrp: Optional[float] = None) -> bool:
        """
        Evaluate if handover should trigger:
        1. When attached to District A:
           Trigger condition: rsrp < threshold.
           If signal is within hysteresis margin [threshold - hysteresis, threshold],
           it requires `time_to_trigger` consecutive breaches to prevent oscillation/ping-pong.
           If signal drops below (threshold - hysteresis), it triggers immediately.
        2. When attached to District B:
           Ping-pong protection: Returning to District A requires rsrp >= (threshold + hysteresis).
        """
        if self.current_district == "A":
            if rsrp <= (self.threshold - self.hysteresis):
                self.consecutive_breaches += 1
                return True
            elif rsrp < self.threshold:
                self.consecutive_breaches += 1
                return self.consecutive_breaches >= self.time_to_trigger
            else:
                self.consecutive_breaches = 0
                return False
        else:
            # On District B: ping-pong protection prevents flapping back unless signal clears margin
            if rsrp >= (self.threshold + self.hysteresis):
                return True
            return False

    def on_handover_complete(self, new_district: str):
        self.current_district = new_district
        self.consecutive_breaches = 0

async def notify_backend_link_state(
    client: httpx.AsyncClient,
    state: str,
    district: str,
    rsrp: float,
    sinr: float,
    interruption_ms: int = 0
):
    """Update FastAPI system_state.link and broadcast to dashboard."""
    try:
        payload = {
            "state": state,
            "district": district,
            "rsrp": rsrp,
            "sinr": sinr,
            "interruptionMs": interruption_ms
        }
        await client.post(f"{FASTAPI_URL}/api/link/handover", json=payload, timeout=1.5)
    except Exception:
        pass

async def notify_backend_event(
    client: httpx.AsyncClient,
    layer: str,
    op: str,
    path: str,
    payload: Dict[str, Any],
    latency_ms: int = 15
):
    """Post audit event to FastAPI dashboard feed."""
    now_ms = int(time.time() * 1000)
    event_data = {
        "id": f"e{now_ms % 100000}",
        "ts": now_ms,
        "layer": layer,
        "protocol": "HTTP",
        "src": "HandoverManager",
        "dst": "DistrictB-MN-CSE",
        "op": op,
        "path": path,
        "status": 2000,
        "latencyMs": latency_ms,
        "bytes": 180,
        "correlationId": f"corr-ho-{now_ms}",
        "payload": payload
    }
    try:
        await client.post(f"{FASTAPI_URL}/api/events", json=event_data, timeout=1.5)
    except Exception:
        pass

async def simulate_handover(
    verbose: bool = True,
    fail_task: bool = False,
    mn_a_url: Optional[str] = None,
    mn_b_url: Optional[str] = None
) -> Dict[str, Any]:
    """Execute the full signal degradation and TR-0077 handover simulation."""
    target_b_url = (mn_b_url or os.getenv("MN_B_URL") or MN_B_URL).rstrip("/")
    source_a_url = (mn_a_url or os.getenv("MN_A_URL") or MN_A_URL).rstrip("/")

    if verbose:
        print("=" * 70)
        print("  ETSI TR-0077 Clause 7.2 Handover & Swarm Coordination Simulation")
        print("=" * 70)

    ipe_a = MecIpe(cse_url=source_a_url, fastapi_url=FASTAPI_URL)
    ipe_b = MecIpe(cse_url=target_b_url, fastapi_url=FASTAPI_URL)
    robot = RobotAgent(cse_url=source_a_url, fastapi_url=FASTAPI_URL)

    async with httpx.AsyncClient(timeout=4.0) as http_client:
        # Phase 1: Monitoring State on District A
        if verbose:
            print("\n[Phase 1: MONITORING]")
        rsrp_a = -88.0
        sinr_a = 18.0
        await ipe_a.publish_metrics(rsrp=rsrp_a, sinr=sinr_a, cqi=15, mcs=28, bler=0.001)
        await notify_backend_link_state(http_client, "monitoring", "A", rsrp_a, sinr_a)
        if verbose:
            print(f"  District A Radio: RSRP={rsrp_a} dBm, SINR={sinr_a} dB (Above threshold: {THRESHOLD} dBm)")

        # Phase 2: Signal Degradation -> TRIGGERED
        if verbose:
            print("\n[Phase 2: SIGNAL DEGRADATION & TRIGGER (with Hysteresis & Ping-Pong Protection)]")
        degradation_steps = [-94.0, -100.5, -105.5, -107.2]
        current_rsrp = rsrp_a
        decision_engine = HandoverDecisionEngine(threshold=THRESHOLD, hysteresis=HYSTERESIS_MARGIN)
        triggered = False

        for val in degradation_steps:
            current_rsrp = val
            sinr_val = max(2.0, 18.0 + (val + 88.0) * 0.7)
            await ipe_a.publish_metrics(rsrp=val, sinr=sinr_val, cqi=6, mcs=10, bler=0.04)
            triggered = decision_engine.evaluate(val)
            if verbose:
                status_note = "TRIGGERED" if triggered else ("HOLD (Within Hysteresis Margin)" if val < THRESHOLD else "NORMAL")
                print(f"  Simulated RSRP: {val:.1f} dBm, SINR: {sinr_val:.1f} dB [{status_note}]")
            if triggered:
                break
            await asyncio.sleep(0.2)

        # Trigger condition met
        if verbose:
            print(f"  --> RSRP ({current_rsrp:.1f} dBm) breached threshold ({THRESHOLD} dBm) with {HYSTERESIS_MARGIN} dBm hysteresis -> Handover TRIGGERED!")
        await notify_backend_link_state(http_client, "triggered", "A", current_rsrp, 4.5)
        await notify_backend_event(http_client, "radio", "NOTIFY", "//acme.example.com/DistrictA/radioInfo", {
            "event": "threshold_breached",
            "threshold": THRESHOLD,
            "hysteresis": HYSTERESIS_MARGIN,
            "rsrp": current_rsrp
        })

        # Phase 3: Re-registering (TR-0077 Handover Callflow Execution)
        if verbose:
            print("\n[Phase 3: RE-REGISTERING & MIGRATION]")
        await notify_backend_link_state(http_client, "re_registering", "A", current_rsrp, 4.0)

        # High-resolution interruption measurement
        t_start = time.perf_counter()

        # Step 1: De-register RobotAE from District A (:8081)
        if verbose:
            print(f"  1. De-registering RobotAE from DistrictA-MN-CSE (:8081)...")
        await robot.deregister_ae()

        # Step 2: Switch context to District B (:8082)
        robot.cse_url = target_b_url
        robot.district = "B" if "DistrictB" in target_b_url else "Target"

        # Step 3: Register RobotAE, pollingChannel, and tasks subscription on target CSE
        if verbose:
            print(f"  2. Re-registering RobotAE on {target_b_url}...")
        reg_ok = await robot.register_ae()
        if not reg_ok:
            error_msg = f"Handover failed: Target CSE {target_b_url} unreachable or RobotAE registration rejected"
            if verbose:
                print(f"  [ERROR] {error_msg}")
            return {
                "status": "failed",
                "error": error_msg,
                "trigger_rsrp": current_rsrp,
                "threshold": THRESHOLD,
                "handover_interruption_ms": None,
                "initial_district": "A",
                "active_district": "A",
                "robot_registered": False,
                "task_id": None,
                "task_status": "FAILED",
            }

        decision_engine.on_handover_complete("B")
        t_end = time.perf_counter()
        interruption_ms = round((t_end - t_start) * 1000, 2)
        if verbose:
            print(f"  3. Handover callflow completed! Interruption Time Delta t: {interruption_ms} ms")

        # Phase 4: Restored State on District B
        if verbose:
            print("\n[Phase 4: RESTORED]")
        rsrp_b = -84.5
        sinr_b = 19.2
        await ipe_b.publish_metrics(rsrp=rsrp_b, sinr=sinr_b, cqi=15, mcs=28, bler=0.001)
        await notify_backend_link_state(
            http_client,
            "restored",
            "B",
            rsrp_b,
            sinr_b,
            interruption_ms=int(interruption_ms)
        )
        await notify_backend_event(http_client, "mcc", "UPDATE", "//acme.example.com/DistrictB/RobotAE", {
            "event": "handover_complete",
            "sourceDistrict": "A",
            "targetDistrict": "B",
            "interruptionMs": interruption_ms
        })
        if verbose:
            print(f"  District B Radio restored: RSRP={rsrp_b} dBm, SINR={sinr_b} dB")

        # Phase 5: Swarm Task Coordination across states
        if verbose:
            print("\n[Phase 5: SWARM TASK COORDINATION]")
        task_id = f"task-ho-{int(time.time()*1000)%10000}"
        target_room = "r3"
        target_dev = "r3-d2"
        primitive = 3 if not fail_task else 99

        # State 1: PROPOSED
        if verbose:
            print(f"  1. Task {task_id} PROPOSED: {PRIMITIVES.get(primitive, 'emergency repair')} on {target_dev}")

        # State 2: ASSIGNED
        if verbose:
            print(f"  2. Task {task_id} ASSIGNED -> Dispatching via pollingChannel on District B...")
        dispatch_ok = await robot.dispatch_task(task_id, primitive=primitive, target_room=target_room, target_device=target_dev)

        # State 3: EXECUTING via pollingChannel /pcu retrieval
        if verbose:
            print(f"  3. RobotAE polling /pcu on District B...")
        polled_task = await robot.poll_once(timeout=4.0)
        if not polled_task:
            polled_task = await robot.fetch_latest_task_fallback()

        task_result = {}
        if polled_task:
            if verbose:
                print(f"  4. Retrieved task: {polled_task.get('taskId')}, executing primitives natively...")
            task_result = await robot.process_task(polled_task)
            if verbose:
                status_text = task_result.get("status")
                print(f"  --> Native task execution completed: status={status_text}, reason={task_result.get('reason', 'N/A')}")
        else:
            if fail_task:
                task_result = await robot.process_task({"taskId": task_id, "primitive": 99})
            else:
                task_result = {"status": "FAILED", "reason": "pollingChannel retrieval timeout"}

        summary = {
            "status": "success",
            "trigger_rsrp": current_rsrp,
            "threshold": THRESHOLD,
            "handover_interruption_ms": interruption_ms,
            "initial_district": "A",
            "active_district": "B",
            "robot_registered": True,
            "task_id": task_id,
            "task_status": task_result.get("status", "UNKNOWN"),
        }
        if verbose:
            print("\n" + "=" * 70)
            print("  Simulation Summary:")
            print(f"    - Handover Status: SUCCESS")
            print(f"    - Interruption Time: {interruption_ms} ms")
            print(f"    - Active District: District B (:8082)")
            print(f"    - Task Status: {summary['task_status']}")
            print("=" * 70)
        return summary

if __name__ == "__main__":
    asyncio.run(simulate_handover())
