"""
api/robot_agent.py

Robot Doctor AE (Application Entity) with oneM2M PollingChannel (/pcu):
- Registers RobotAE with rr=False (ReceiverReachability = False)
- Provisions child <pollingChannel> (ty=15) with virtual resource /pcu
- Asynchronously long-polls tasks through /pcu without inbound open ports
- Processes swarm task primitives (restart, recalibrate, flush buffer, reset modem, reboot node)
- Updates swarm task state machine (PROPOSED -> ASSIGNED -> EXECUTING -> DONE / FAILED)
- Supports live TR-0077 Clause 7.2 handover migration between MN-CSE districts
"""

import os
import sys
import time
import json
import asyncio
from typing import Dict, Any, Optional, List
import httpx

DEFAULT_CSE_URL = os.getenv("MN_A_URL", "http://localhost:8081/DistrictA-MN-CSE").rstrip("/")
DEFAULT_FASTAPI_URL = os.getenv("FASTAPI_URL", "http://localhost:8000").rstrip("/")
ORIGINATOR = "CRobot"
RVI = "4"

PRIMITIVES = {
    1: "restart sensor",
    2: "recalibrate",
    3: "flush buffer",
    4: "reset radio modem",
    5: "reboot node",
}

class RobotAgent:
    """Robot Doctor agent coordinating swarm tasks over oneM2M pollingChannel."""

    def __init__(
        self,
        cse_url: str = DEFAULT_CSE_URL,
        originator: str = ORIGINATOR,
        fastapi_url: Optional[str] = DEFAULT_FASTAPI_URL,
    ):
        self.cse_url = cse_url.rstrip("/")
        self.originator = originator
        self.fastapi_url = fastapi_url.rstrip("/") if fastapi_url else None
        self.district = "B" if "DistrictB" in self.cse_url else "A"

        # Robot internal telemetry
        self.state = {
            "battery": 86.0,
            "memPct": 41.0,
            "posRoomId": "r1",
            "targetRoomId": None,
            "progress": 1.0,
            "route": [],
            "busy": False,
        }
        self.processed_tasks: List[str] = []

    def get_headers(self, ri: str, ty: Optional[int] = None, originator: Optional[str] = None) -> Dict[str, str]:
        headers = {
            "X-M2M-Origin": originator or self.originator,
            "X-M2M-RI": ri,
            "X-M2M-RVI": RVI,
            "Accept": "application/json",
        }
        if ty is not None:
            headers["Content-Type"] = f"application/json;ty={ty}"
        else:
            headers["Content-Type"] = "application/json"
        return headers

    def _is_success_or_exists(self, res: httpx.Response, resource_name: str) -> bool:
        """Verify HTTP response status codes (200, 201, or RSC 4105) for oneM2M resources."""
        if res.status_code in (200, 201):
            return True
        rsc = res.headers.get("X-M2M-RSC") or res.headers.get("x-m2m-rsc")
        # 4105: ALREADY_EXISTS, 4117: ORIGINATOR_ALREADY_REGISTERED
        if rsc in ("4105", "4117"):
            return True
        if res.status_code == 409:
            return True
        if res.status_code == 400 and ("already exists" in res.text or "only one PCH" in res.text):
            return True
        return False

    async def register_ae(self) -> bool:
        """Register RobotAE with rr=False and establish pollingChannel and tasks inbox."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # 1. Register AE
                ae_url = self.cse_url
                ae_body = {
                    "m2m:ae": {
                        "rn": "RobotAE",
                        "api": "NRobotAE",
                        "rr": False,
                        "srv": ["4"],
                        "lbl": ["robot:doctor", "model:pi5"]
                    }
                }
                res = await client.post(
                    ae_url,
                    headers=self.get_headers("reg-robot", ty=2),
                    json=ae_body
                )
                if not self._is_success_or_exists(res, "RobotAE"):
                    print(f"[RobotAgent] Failed to register RobotAE on {ae_url}: status={res.status_code}, rsc={res.headers.get('x-m2m-rsc')}, text={res.text}")
                    return False

                # 2. Create pollingChannel under RobotAE
                pch_url = f"{self.cse_url}/RobotAE"
                res = await client.post(
                    pch_url,
                    headers=self.get_headers("create-pch", ty=15),
                    json={"m2m:pch": {"rn": "pollingChannel"}}
                )
                if not self._is_success_or_exists(res, "pollingChannel"):
                    print(f"[RobotAgent] Failed to create pollingChannel on {pch_url}: status={res.status_code}, rsc={res.headers.get('x-m2m-rsc')}, text={res.text}")
                    return False

                # 3. Create tasks inbox container
                res = await client.post(
                    pch_url,
                    headers=self.get_headers("create-tasks-cnt", ty=3),
                    json={"m2m:cnt": {"rn": "tasks", "lbl": ["robot:tasks", "status:inbox"]}}
                )
                if not self._is_success_or_exists(res, "tasks"):
                    print(f"[RobotAgent] Failed to create tasks container on {pch_url}: status={res.status_code}, rsc={res.headers.get('x-m2m-rsc')}, text={res.text}")
                    return False

                # 4. Create subscription on tasks notifying CRobot (routed to pollingChannel)
                sub_url = f"{self.cse_url}/RobotAE/tasks"
                res = await client.post(
                    sub_url,
                    headers=self.get_headers("sub-tasks", ty=23),
                    json={
                        "m2m:sub": {
                            "rn": "subTasks",
                            "nu": [self.originator],
                            "nct": 1,
                            "enc": {"net": [3]}
                        }
                    }
                )
                if not self._is_success_or_exists(res, "subTasks"):
                    print(f"[RobotAgent] Failed to create subTasks subscription on {sub_url}: status={res.status_code}, rsc={res.headers.get('x-m2m-rsc')}, text={res.text}")
                    return False

                print(f"[RobotAgent] Registered on {self.cse_url}/RobotAE with pollingChannel.")
                return True
        except Exception as e:
            print(f"[RobotAgent] Registration failed on {self.cse_url}: {e}")
            return False

    async def deregister_ae(self) -> bool:
        """Deregister RobotAE from current CSEBase (used during TR-0077 handover)."""
        url = f"{self.cse_url}/RobotAE"
        headers = self.get_headers("del-robot", originator=self.originator)
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.delete(url, headers=headers)
                return res.status_code in (200, 202, 204)
        except Exception:
            return False

    async def poll_once(self, timeout: float = 12.0) -> Optional[Dict[str, Any]]:
        """
        Long-poll GET /pcu virtual resource for incoming notifications or tasks.
        Uses client timeout >= 12.0s to exceed ACME's 10.0s server wait and prevent ghost delivery.
        """
        url = f"{self.cse_url}/RobotAE/pollingChannel/pcu"
        headers = {
            "X-M2M-Origin": self.originator,
            "X-M2M-RI": f"poll-{int(time.time()*1000)%10000}",
            "X-M2M-RVI": RVI,
            "Accept": "application/json",
        }
        client_timeout = max(12.0, timeout)
        try:
            async with httpx.AsyncClient(timeout=client_timeout) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    # Parse notification envelope
                    rqp = data.get("m2m:rqp", {})
                    sgn = rqp.get("pc", {}).get("m2m:sgn", {})
                    cin = sgn.get("nev", {}).get("rep", {}).get("m2m:cin", {})
                    con_str = cin.get("con")
                    if con_str:
                        try:
                            return json.loads(con_str)
                        except Exception:
                            return {"raw": con_str}
                elif res.status_code == 504 or res.headers.get("x-m2m-rsc") == "4008":
                    # Request timeout - queue was empty
                    return None
        except httpx.ReadTimeout:
            return None
        except Exception:
            return None
        return None

    async def fetch_latest_task_fallback(self) -> Optional[Dict[str, Any]]:
        """Fallback check on tasks/la container if direct polling channel was empty."""
        url = f"{self.cse_url}/RobotAE/tasks/la"
        headers = self.get_headers("get-la")
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    cin = data.get("m2m:cin", {})
                    con_str = cin.get("con")
                    if con_str:
                        return json.loads(con_str)
        except Exception:
            pass
        return None

    async def dispatch_task(
        self,
        task_id: str,
        primitive: int,
        target_room: str,
        target_device: str,
        risk: str = "LOW"
    ) -> bool:
        """
        External or test helper: Publish a new task into RobotAE/tasks inbox.
        The oneM2M subscription routes this automatically into the pollingChannel queue.
        """
        url = f"{self.cse_url}/RobotAE/tasks"
        headers = self.get_headers("dispatch-task", ty=4, originator="CAdmin")
        task_payload = {
            "taskId": task_id,
            "state": "PROPOSED",
            "primitive": primitive,
            "primitiveName": PRIMITIVES.get(primitive, "unknown"),
            "targetRoom": target_room,
            "targetDevice": target_device,
            "riskTier": risk,
            "ts": int(time.time() * 1000)
        }
        body = {
            "m2m:cin": {
                "cnf": "application/json:0",
                "con": json.dumps(task_payload)
            }
        }
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                res = await client.post(url, headers=headers, json=body)
                return res.status_code in (200, 201)
        except Exception:
            return False

    async def process_task(self, task: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process a swarm task:
        PROPOSED -> ASSIGNED -> EXECUTING -> DONE / FAILED.
        Gracefully transitions to FAILED for unsupported primitives or non-dict payloads.
        """
        if not isinstance(task, dict):
            task_id = f"t-corrupt-{int(time.time()*1000)%10000}"
            print(f"[RobotAgent] Error: Corrupt or non-dict task payload: {type(task)}")
            self.state["busy"] = False
            self.state["targetRoomId"] = None
            await self._sync_state_with_dashboard(task_id, "FAILED", 0.0)
            return {
                "taskId": task_id,
                "status": "FAILED",
                "reason": f"Corrupt or non-dict task payload: {type(task).__name__}"
            }

        task_id = str(task.get("taskId") or f"t-{int(time.time()*1000)%10000}")
        target_room = task.get("targetRoom", "r1")
        target_device = task.get("targetDevice", f"{target_room}-d1")
        primitive_id = task.get("primitive")

        if primitive_id not in PRIMITIVES:
            print(f"[RobotAgent] Error: Unsupported primitive {primitive_id} for task {task_id}")
            self.state["busy"] = False
            self.state["targetRoomId"] = None
            await self._sync_state_with_dashboard(task_id, "FAILED", 0.0)
            return {
                "taskId": task_id,
                "status": "FAILED",
                "reason": f"Unsupported primitive {primitive_id}"
            }

        primitive_name = PRIMITIVES[primitive_id]
        print(f"[RobotAgent] Processing task {task_id}: {primitive_name} on {target_device} in {target_room}")

        # Update Robot state: ASSIGNED
        self.state["busy"] = True
        self.state["targetRoomId"] = target_room
        self.state["progress"] = 0.2
        await self._sync_state_with_dashboard(task_id, "ASSIGNED", 0.2)

        # Transition to EXECUTING
        await asyncio.sleep(0.3)
        self.state["progress"] = 0.6
        await self._sync_state_with_dashboard(task_id, "EXECUTING", 0.6)

        # Transition to DONE
        await asyncio.sleep(0.3)
        self.state["posRoomId"] = target_room
        self.state["targetRoomId"] = None
        self.state["progress"] = 1.0
        self.state["busy"] = False
        self.state["battery"] = max(0.0, round(self.state["battery"] - 0.5, 2))
        self.processed_tasks.append(task_id)

        result = {
            "taskId": task_id,
            "status": "DONE",
            "targetRoom": target_room,
            "targetDevice": target_device,
            "primitive": primitive_name,
            "completedTs": int(time.time() * 1000),
        }
        await self._sync_state_with_dashboard(task_id, "DONE", 1.0)
        return result

    async def _sync_state_with_dashboard(self, task_id: str, status: str, progress: float):
        """Notify FastAPI backend of robot motion and task progress."""
        if not self.fastapi_url:
            return
        try:
            async with httpx.AsyncClient(timeout=1.5) as client:
                now_ms = int(time.time() * 1000)
                # 1. Update robot telemetry
                robot_payload = {
                    "battery": self.state["battery"],
                    "memPct": self.state["memPct"],
                    "posRoomId": self.state["posRoomId"],
                    "targetRoomId": self.state["targetRoomId"],
                    "progress": progress,
                    "busy": self.state["busy"],
                    "route": [self.state["posRoomId"], self.state["targetRoomId"]] if self.state["targetRoomId"] else [],
                    "etaMs": int((1.0 - progress) * 2000),
                }
                await client.post(f"{self.fastapi_url}/api/events", json={
                    "id": f"e{now_ms % 100000}",
                    "ts": now_ms,
                    "layer": "robot",
                    "protocol": "polling",
                    "src": "RobotAgent",
                    "dst": "FastAPI",
                    "op": "UPDATE",
                    "path": f"//{self.cse_url.replace('http://', '')}/RobotAE/tasks",
                    "status": 2000,
                    "latencyMs": 8,
                    "bytes": 210,
                    "correlationId": f"corr-{task_id}",
                    "payload": {"taskId": task_id, "taskState": status, "robot": robot_payload}
                })
        except Exception:
            pass

    async def migrate_to_cse(self, target_cse_url: str) -> float:
        """
        Execute ETSI TR-0077 Clause 7.2 Handover callflow:
        1. Measure t_start
        2. De-register RobotAE from source CSE
        3. Register RobotAE on target CSE
        4. Measure t_end
        5. Return interruption time in ms (Delta t)
        """
        t_start = time.perf_counter()
        print(f"[RobotAgent] Migrating from {self.cse_url} to {target_cse_url}...")

        # 1. Tear down on source
        await self.deregister_ae()

        # 2. Switch active endpoint
        self.cse_url = target_cse_url.rstrip("/")
        self.district = "B" if "DistrictB" in self.cse_url else "A"

        # 3. Provision on target
        reg_ok = await self.register_ae()
        if not reg_ok:
            print(f"[RobotAgent] Failed to register RobotAE on target CSE {target_cse_url}!")
            return -1.0

        t_end = time.perf_counter()
        interruption_ms = round((t_end - t_start) * 1000, 2)
        print(f"[RobotAgent] Handover complete in {interruption_ms} ms! Active district: {self.district}")
        return interruption_ms

if __name__ == "__main__":
    async def main():
        agent = RobotAgent()
        print("1. Registering RobotAgent...")
        await agent.register_ae()

        print("\n2. Dispatching sample swarm task into tasks inbox...")
        await agent.dispatch_task("task-auto-01", primitive=2, target_room="r2", target_device="r2-d1")

        print("\n3. Polling /pcu virtual resource...")
        task = await agent.poll_once(timeout=4.0)
        print("Retrieved task from pollingChannel:", task)

        if task:
            print("\n4. Executing task primitives...")
            res = await agent.process_task(task)
            print("Task execution result:", res)

    asyncio.run(main())
