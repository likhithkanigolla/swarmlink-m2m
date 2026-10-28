"""
Bootstrap script for populating the ACME oneM2M CSE with the SwarmLink-M2M digital twin hierarchy:
- ACPs (Access Control Policies): sensor-write, robot-exec, llm-propose, operator-approve
- District containers (DistrictA-MN-CSE, DistrictB-MN-CSE) and room containers (Room1 - Room4)
- ESP32 Device sensor containers (timeSeries, health, semanticDescriptor)
- RobotAE with pollingChannel and mgmtObj
- flexContainer-incidents for active remediation tasks
- Remediation Catalog containers (solutions 1246, 1310, 1408, 1520, 1602)
"""

import httpx
import asyncio
import os
from typing import Dict, Any, Optional

ACME_BASE_URL = os.getenv("ACME_BASE_URL", "http://localhost:8080").rstrip("/")
ACME_CSE_NAME = os.getenv("ACME_CSE_NAME", "cse-in")
ACME_ORIGINATOR = os.getenv("ACME_ORIGINATOR", "CAdmin")
ACME_RVI = os.getenv("ACME_RVI", "4")

headers_base = {
    "X-M2M-Origin": ACME_ORIGINATOR,
    "X-M2M-RVI": ACME_RVI,
    "Accept": "application/json",
}

async def create_resource(client: httpx.AsyncClient, parent_path: str, ty: int, rn: str, payload: Dict[str, Any]) -> bool:
    """Create a resource if it doesn't already exist."""
    url = f"{ACME_BASE_URL}/{parent_path}"
    headers = {
        **headers_base,
        "X-M2M-RI": f"boot-{rn}",
        "Content-Type": f"application/json;ty={ty}",
    }
    short_names = {
        1: "m2m:acp",
        2: "m2m:ae",
        3: "m2m:cnt",
        4: "m2m:cin",
        9: "m2m:grp",
        13: "m2m:nod",
        15: "m2m:pch",
        28: "m2m:fcnt",
        29: "m2m:ts",
    }
    root_key = short_names.get(ty, "m2m:cnt")
    body = {root_key: {"rn": rn, **payload}}

    try:
        res = await client.post(url, headers=headers, json=body, timeout=5.0)
        rsc = res.headers.get("X-M2M-RSC")
        if res.status_code in (200, 201):
            print(f"  [CREATED] {parent_path}/{rn} (ty={ty})")
            return True
        elif res.status_code == 409 or rsc == "4105":
            print(f"  [EXISTS]  {parent_path}/{rn}")
            return True
        else:
            print(f"  [FAILED]  {parent_path}/{rn} -> status {res.status_code}, RSC {rsc}: {res.text}")
            return False
    except Exception as e:
        print(f"  [ERROR]   {parent_path}/{rn}: {e}")
        return False

async def bootstrap():
    print(f"=== Bootstrapping SwarmLink-M2M into ACME CSE ({ACME_BASE_URL}/{ACME_CSE_NAME}) ===")
    async with httpx.AsyncClient() as client:
        # 1. ACPs (Access Control Policies) [ty=1]
        print("\n1. Setting up Access Control Policies (ACPs)...")
        # Sensor write-only ACP: acop 1 (CREATE), 2 (RETRIEVE)
        await create_resource(client, ACME_CSE_NAME, 1, "acp-sensors-write", {
            "pv": {"acr": [{"acor": ["all", "CSensor"], "acop": 3}]},
            "pvs": {"acr": [{"acor": [ACME_ORIGINATOR], "acop": 63}]}
        })
        # Robot execution ACP: acop 63 (all permissions)
        await create_resource(client, ACME_CSE_NAME, 1, "acp-robot-exec", {
            "pv": {"acr": [{"acor": ["CRobot", ACME_ORIGINATOR], "acop": 63}]},
            "pvs": {"acr": [{"acor": [ACME_ORIGINATOR], "acop": 63}]}
        })
        # LLM proposal ACP: acop 1 (CREATE) and 2 (RETRIEVE) only in proposal containers; no execute/motion
        await create_resource(client, ACME_CSE_NAME, 1, "acp-llm-propose", {
            "pv": {"acr": [{"acor": ["CLlm", "all"], "acop": 35}]},
            "pvs": {"acr": [{"acor": [ACME_ORIGINATOR], "acop": 63}]}
        })
        # Operator approval ACP: acop 63
        await create_resource(client, ACME_CSE_NAME, 1, "acp-operator-approve", {
            "pv": {"acr": [{"acor": ["COperator", ACME_ORIGINATOR], "acop": 63}]},
            "pvs": {"acr": [{"acor": [ACME_ORIGINATOR], "acop": 63}]}
        })

        # 2. Remediation Catalog Container & Entries [ty=3 & ty=4]
        print("\n2. Setting up Remediation Catalogue...")
        await create_resource(client, ACME_CSE_NAME, 3, "remediationCatalog", {
            "lbl": ["swarmlink:catalog", "district:central"]
        })
        catalog_solutions = [
            ("1246", "NaN burst on sensor stream", [1, 2, 3, 5], "LOW"),
            ("1310", "Persistent outlier / calibration drift", [2, 4], "MEDIUM"),
            ("1408", "Buffer overflow, stale telemetry", [3], "LOW"),
            ("1520", "Radio modem hang, no keepalive", [1, 5], "MEDIUM"),
            ("1602", "Unknown compound fault (LLM-proposed)", [2, 4, 5], "HIGH"),
        ]
        for cid, symptom, steps, risk in catalog_solutions:
            await create_resource(client, f"{ACME_CSE_NAME}/remediationCatalog", 3, cid, {
                "lbl": [f"solution:{cid}", f"risk:{risk}"],
            })
            # cnf attribute format in oneM2M: media-type:encoding (e.g. application/json:0)
            await create_resource(client, f"{ACME_CSE_NAME}/remediationCatalog/{cid}", 4, "metadata", {
                "cnf": "application/json:0",
                "con": str({"id": cid, "symptom": symptom, "steps": steps, "riskTier": risk})
            })

        # 3. Robot Doctor AE [ty=2] & Polling Channel [ty=15]
        print("\n3. Registering Robot Doctor (RobotAE)...")
        # In oneM2M, registering an AE requires an originator that has NOT already registered.
        robot_headers = {
            **headers_base,
            "X-M2M-Origin": "CRobot",
            "X-M2M-RI": "boot-robotae",
            "Content-Type": "application/json;ty=2",
        }
        res_robot = await client.post(
            f"{ACME_BASE_URL}/{ACME_CSE_NAME}",
            headers=robot_headers,
            json={"m2m:ae": {"rn": "RobotAE", "api": "NRobotAE", "rr": True, "srv": ["4"], "lbl": ["robot:doctor", "model:pi5"]}}
        )
        if res_robot.status_code in (200, 201):
            print("  [CREATED] cse-in/RobotAE (ty=2)")
        elif res_robot.status_code == 409 or res_robot.headers.get("X-M2M-RSC") == "4105":
            print("  [EXISTS]  cse-in/RobotAE")
        else:
            print(f"  [STATUS]  cse-in/RobotAE -> {res_robot.status_code}: {res_robot.text}")

        # Polling channel and task inbox under RobotAE
        # In oneM2M: Originator of pollingChannel must be the parent AE itself [TS normative]
        pch_headers = {
            **headers_base,
            "X-M2M-Origin": "CRobot",
            "X-M2M-RI": "boot-pch",
            "Content-Type": "application/json;ty=15",
        }
        res_pch = await client.post(
            f"{ACME_BASE_URL}/{ACME_CSE_NAME}/RobotAE",
            headers=pch_headers,
            json={"m2m:pch": {"rn": "pollingChannel"}}
        )
        if res_pch.status_code in (200, 201):
            print("  [CREATED] cse-in/RobotAE/pollingChannel (ty=15)")
        else:
            print(f"  [STATUS]  cse-in/RobotAE/pollingChannel -> {res_pch.status_code}")

        await create_resource(client, f"{ACME_CSE_NAME}/RobotAE", 3, "tasks", {
            "lbl": ["robot:tasks", "status:inbox"]
        })

        # 4. FlexContainer Incidents [ty=3 / ty=28]
        print("\n4. Creating Incidents FlexContainer...")
        await create_resource(client, ACME_CSE_NAME, 3, "flexContainer-incidents", {
            "lbl": ["swarmlink:incidents"]
        })

        # 5. Districts & Rooms Hierarchy [ty=3]
        print("\n5. Creating District and Room Subtrees...")
        districts = [
            ("DistrictA-MN-CSE", ["Room1", "Room2"]),
            ("DistrictB-MN-CSE", ["Room3", "Room4"]),
        ]
        for dist_name, rooms in districts:
            await create_resource(client, ACME_CSE_NAME, 3, dist_name, {
                "lbl": ["node:MN-CSE", f"district:{dist_name[8]}"]
            })
            for rm in rooms:
                rm_path = f"{ACME_CSE_NAME}/{dist_name}"
                await create_resource(client, rm_path, 3, rm, {
                    "lbl": [f"room:{rm.lower()}", f"district:{dist_name[8]}"]
                })
                # Room telemetry containers with mni (maxNrOfInstances) to prevent memory growth [TS normative]
                await create_resource(client, f"{rm_path}/{rm}", 3, "health", {
                    "lbl": ["status:health"],
                    "mni": 20,
                    "mbs": 32768
                })
                await create_resource(client, f"{rm_path}/{rm}", 3, "timeSeries", {
                    "lbl": ["telemetry:stream"],
                    "mni": 30,
                    "mbs": 65536
                })
                # Add sample sensor child nodes for the 3 devices in each room
                room_num = rm.replace("Room", "")
                for d_num in range(1, 4):
                    dev_id = f"r{room_num}-d{d_num}"
                    dev_path = f"{rm_path}/{rm}"
                    await create_resource(client, dev_path, 3, dev_id, {
                        "lbl": [f"device:{dev_id}", "type:esp32"]
                    })
                    await create_resource(client, f"{dev_path}/{dev_id}", 3, "data", {
                        "mni": 20,
                        "mbs": 32768
                    })
                    await create_resource(client, f"{dev_path}/{dev_id}", 3, "mgmtObj", {
                        "mni": 10
                    })

        print("\n=== Bootstrap Complete! All resources registered in ACME. ===")

if __name__ == "__main__":
    asyncio.run(bootstrap())
