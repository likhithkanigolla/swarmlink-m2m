"""
api/bootstrap_acme.py

Bootstrap routine for the multi-CSE SwarmLink-M2M / RescueTwin testbed:
1. IN-CSE (:8080, cse-in):
   - ACPs: acp-sensors-write, acp-robot-exec, acp-llm-propose, acp-operator-approve
   - Remediation Catalog container & solutions (1246, 1310, 1408, 1520, 1602)
   - Incidents flexContainer
2. DistrictA-MN-CSE (:8081, DistrictA-MN-CSE):
   - District A rooms (Room1, Room2) with health, timeSeries, and devices (r1-d1..d3, r2-d1..d3)
   - [custom:mecRadioInfo] flexContainer (radioInfo)
   - RobotAE (rr=False), pollingChannel, tasks container, and subscription
3. DistrictB-MN-CSE (:8082, DistrictB-MN-CSE):
   - District B rooms (Room3, Room4) with health, timeSeries, and devices (r3-d1..d3, r4-d1..d3)
   - [custom:mecRadioInfo] flexContainer (radioInfo)
"""

import os
import asyncio
import httpx
from typing import Dict, Any, Optional

IN_CSE_URL = os.getenv("IN_CSE_URL", "http://localhost:8080").rstrip("/")
IN_CSE_NAME = os.getenv("IN_CSE_NAME", "cse-in")

MN_A_URL = os.getenv("MN_A_URL", "http://localhost:8081").rstrip("/")
MN_A_NAME = os.getenv("MN_A_NAME", "DistrictA-MN-CSE")

MN_B_URL = os.getenv("MN_B_URL", "http://localhost:8082").rstrip("/")
MN_B_NAME = os.getenv("MN_B_NAME", "DistrictB-MN-CSE")

ADMIN_ORIGINATOR = os.getenv("ACME_ORIGINATOR", "CAdmin")
RVI = os.getenv("ACME_RVI", "4")

headers_admin = {
    "X-M2M-Origin": ADMIN_ORIGINATOR,
    "X-M2M-RVI": RVI,
    "Accept": "application/json",
}

async def create_resource(
    client: httpx.AsyncClient,
    base_url: str,
    parent_path: str,
    ty: int,
    rn: str,
    payload: Dict[str, Any],
    originator: str = ADMIN_ORIGINATOR,
    custom_root_key: Optional[str] = None
) -> bool:
    """Create a oneM2M resource if it doesn't already exist."""
    url = f"{base_url}/{parent_path}"
    headers = {
        "X-M2M-Origin": originator,
        "X-M2M-RVI": RVI,
        "Accept": "application/json",
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
        23: "m2m:sub",
        28: custom_root_key or "m2m:fcnt",
        29: "m2m:ts",
    }
    root_key = custom_root_key if custom_root_key else short_names.get(ty, "m2m:cnt")
    body = {root_key: {"rn": rn, **payload}}

    try:
        res = await client.post(url, headers=headers, json=body, timeout=5.0)
        rsc = res.headers.get("X-M2M-RSC")
        if res.status_code in (200, 201):
            print(f"  [CREATED] {base_url}/{parent_path}/{rn} (ty={ty})")
            return True
        elif res.status_code == 409 or rsc == "4105":
            print(f"  [EXISTS]  {base_url}/{parent_path}/{rn}")
            return True
        else:
            print(f"  [FAILED]  {base_url}/{parent_path}/{rn} -> status {res.status_code}, RSC {rsc}: {res.text}")
            return False
    except Exception as e:
        print(f"  [ERROR]   {base_url}/{parent_path}/{rn}: {e}")
        return False

async def bootstrap_in_cse(client: httpx.AsyncClient):
    print(f"\n--- Bootstrapping IN-CSE ({IN_CSE_URL}/{IN_CSE_NAME}) ---")

    # 1. ACPs
    print("1. Setting up Access Control Policies (ACPs)...")
    await create_resource(client, IN_CSE_URL, IN_CSE_NAME, 1, "acp-sensors-write", {
        "pv": {"acr": [{"acor": ["all", "CSensor"], "acop": 3}]},
        "pvs": {"acr": [{"acor": [ADMIN_ORIGINATOR], "acop": 63}]}
    })
    await create_resource(client, IN_CSE_URL, IN_CSE_NAME, 1, "acp-robot-exec", {
        "pv": {"acr": [{"acor": ["CRobot", ADMIN_ORIGINATOR], "acop": 63}]},
        "pvs": {"acr": [{"acor": [ADMIN_ORIGINATOR], "acop": 63}]}
    })
    await create_resource(client, IN_CSE_URL, IN_CSE_NAME, 1, "acp-llm-propose", {
        "pv": {"acr": [{"acor": ["CLlm", "all"], "acop": 35}]},
        "pvs": {"acr": [{"acor": [ADMIN_ORIGINATOR], "acop": 63}]}
    })
    await create_resource(client, IN_CSE_URL, IN_CSE_NAME, 1, "acp-operator-approve", {
        "pv": {"acr": [{"acor": ["COperator", ADMIN_ORIGINATOR], "acop": 63}]},
        "pvs": {"acr": [{"acor": [ADMIN_ORIGINATOR], "acop": 63}]}
    })

    # 2. Remediation Catalog Container & Entries
    print("2. Setting up Remediation Catalog...")
    await create_resource(client, IN_CSE_URL, IN_CSE_NAME, 3, "remediationCatalog", {
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
        await create_resource(client, IN_CSE_URL, f"{IN_CSE_NAME}/remediationCatalog", 3, cid, {
            "lbl": [f"solution:{cid}", f"risk:{risk}"],
        })
        await create_resource(client, IN_CSE_URL, f"{IN_CSE_NAME}/remediationCatalog/{cid}", 4, "metadata", {
            "cnf": "application/json:0",
            "con": str({"id": cid, "symptom": symptom, "steps": steps, "riskTier": risk})
        })

    # 3. Incidents FlexContainer / Container
    print("3. Setting up Incidents Container...")
    await create_resource(client, IN_CSE_URL, IN_CSE_NAME, 3, "flexContainer-incidents", {
        "lbl": ["swarmlink:incidents"]
    })

async def bootstrap_mn_cse(
    client: httpx.AsyncClient,
    base_url: str,
    cse_name: str,
    district_letter: str,
    rooms: list,
    initial_rsrp: float = -88.0,
    initial_sinr: float = 18.0
):
    print(f"\n--- Bootstrapping MN-CSE District {district_letter} ({base_url}/{cse_name}) ---")

    # 1. Rooms & Devices
    print(f"1. Setting up District {district_letter} Rooms ({', '.join(rooms)})...")
    for rm in rooms:
        await create_resource(client, base_url, cse_name, 3, rm, {
            "lbl": [f"room:{rm.lower()}", f"district:{district_letter}"]
        })
        rm_path = f"{cse_name}/{rm}"
        await create_resource(client, base_url, rm_path, 3, "health", {
            "lbl": ["status:health"],
            "mni": 20,
            "mbs": 32768
        })
        await create_resource(client, base_url, rm_path, 3, "timeSeries", {
            "lbl": ["telemetry:stream"],
            "mni": 30,
            "mbs": 65536
        })
        room_num = rm.replace("Room", "")
        for d_num in range(1, 4):
            dev_id = f"r{room_num}-d{d_num}"
            dev_path = f"{rm_path}/{rm}" if False else rm_path
            await create_resource(client, base_url, dev_path, 3, dev_id, {
                "lbl": [f"device:{dev_id}", "type:esp32"]
            })
            await create_resource(client, base_url, f"{dev_path}/{dev_id}", 3, "data", {
                "mni": 20,
                "mbs": 32768
            })
            await create_resource(client, base_url, f"{dev_path}/{dev_id}", 3, "mgmtObj", {
                "mni": 10
            })

    # 2. [custom:mecRadioInfo] flexContainer
    print(f"2. Provisioning [custom:mecRadioInfo] flexContainer (radioInfo)...")
    await create_resource(
        client,
        base_url,
        cse_name,
        28,
        "radioInfo",
        {
            "cnd": "custom:mecRadioInfo",
            "rsrp": initial_rsrp,
            "sinr": initial_sinr,
            "cqi": 15,
            "mcs": 28,
            "bler": 0.001
        },
        custom_root_key="custom:mecRadioInfo"
    )

async def bootstrap_robot_ae(client: httpx.AsyncClient, base_url: str, cse_name: str):
    """Register RobotAE on the initial active District MN-CSE."""
    print(f"\n--- Registering RobotAE on ({base_url}/{cse_name}) ---")
    # In oneM2M: AE registration with rr=False enables pollingChannel
    await create_resource(
        client,
        base_url,
        cse_name,
        2,
        "RobotAE",
        {
            "api": "NRobotAE",
            "rr": False,
            "srv": ["4"],
            "lbl": ["robot:doctor", "model:pi5"]
        },
        originator="CRobot"
    )

    # pollingChannel under RobotAE (originator must be CRobot)
    await create_resource(
        client,
        base_url,
        f"{cse_name}/RobotAE",
        15,
        "pollingChannel",
        {},
        originator="CRobot"
    )

    # tasks inbox container
    await create_resource(
        client,
        base_url,
        f"{cse_name}/RobotAE",
        3,
        "tasks",
        {"lbl": ["robot:tasks", "status:inbox"]},
        originator="CRobot"
    )

    # Subscription to tasks inbox notifying CRobot (routed to pollingChannel)
    await create_resource(
        client,
        base_url,
        f"{cse_name}/RobotAE/tasks",
        23,
        "subTasks",
        {
            "nu": ["CRobot"],
            "nct": 1,
            "enc": {"net": [3]}
        },
        originator="CRobot"
    )

async def bootstrap():
    print("=================================================================")
    print("  SwarmLink-M2M / RescueTwin Multi-CSE Topology Bootstrap Routine")
    print("=================================================================")
    async with httpx.AsyncClient() as client:
        # Bootstrap IN-CSE (:8080)
        await bootstrap_in_cse(client)

        # Bootstrap District A MN-CSE (:8081)
        await bootstrap_mn_cse(
            client,
            MN_A_URL,
            MN_A_NAME,
            "A",
            ["Room1", "Room2"],
            initial_rsrp=-88.0,
            initial_sinr=18.0
        )

        # Bootstrap RobotAE initially on District A
        await bootstrap_robot_ae(client, MN_A_URL, MN_A_NAME)

        # Bootstrap District B MN-CSE (:8082)
        await bootstrap_mn_cse(
            client,
            MN_B_URL,
            MN_B_NAME,
            "B",
            ["Room3", "Room4"],
            initial_rsrp=-98.0,
            initial_sinr=12.0
        )

    print("\n=== Multi-CSE Bootstrap Complete! ===")

if __name__ == "__main__":
    asyncio.run(bootstrap())
