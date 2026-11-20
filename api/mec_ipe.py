"""
api/mec_ipe.py

MEC-IPE (Interworking Proxy Entity) for 5G Radio Information:
Ingests 5G radio metrics (rsrp, sinr, cqi, mcs, bler) and publishes them
into the oneM2M <flexContainer> specialization [custom:mecRadioInfo]
under the local CSE topology (DistrictA-MN-CSE, DistrictB-MN-CSE, or IN-CSE).
"""

import os
import sys
import time
import json
import random
import asyncio
from typing import Dict, Any, Optional
import httpx

DEFAULT_CSE_A_URL = os.getenv("MN_A_URL", "http://localhost:8081/DistrictA-MN-CSE").rstrip("/")
DEFAULT_CSE_B_URL = os.getenv("MN_B_URL", "http://localhost:8082/DistrictB-MN-CSE").rstrip("/")
DEFAULT_FASTAPI_URL = os.getenv("FASTAPI_URL", "http://localhost:8000").rstrip("/")
ADMIN_ORIGINATOR = os.getenv("ACME_ORIGINATOR", "CAdmin")
RVI = os.getenv("ACME_RVI", "4")

class MecIpe:
    """Interworking Proxy Entity mapping 5G radio metrics into oneM2M [custom:mecRadioInfo] flexContainers."""

    def __init__(
        self,
        cse_url: str = DEFAULT_CSE_A_URL,
        originator: str = ADMIN_ORIGINATOR,
        fastapi_url: Optional[str] = DEFAULT_FASTAPI_URL,
    ):
        self.cse_url = cse_url.rstrip("/")
        self.originator = originator
        self.fastapi_url = fastapi_url.rstrip("/") if fastapi_url else None
        self.current_metrics = {
            "rsrp": -88.0,
            "sinr": 18.0,
            "cqi": 15,
            "mcs": 28,
            "bler": 0.001
        }

    def set_target_cse(self, cse_url: str) -> None:
        """Switch active target CSE endpoint (e.g. during handover)."""
        self.cse_url = cse_url.rstrip("/")

    async def ensure_flexcontainer_exists(
        self,
        client: httpx.AsyncClient,
        target_cse_url: Optional[str] = None
    ) -> bool:
        """Verify existence of radioInfo flexContainer or create it."""
        base = (target_cse_url or self.cse_url).rstrip("/")
        url = f"{base}/radioInfo"
        headers = {
            "X-M2M-Origin": self.originator,
            "X-M2M-RI": f"ipe-check-{int(time.time()*1000)%10000}",
            "X-M2M-RVI": RVI,
            "Accept": "application/json",
        }
        try:
            res = await client.get(url, headers=headers, timeout=3.0)
            if res.status_code == 200:
                return True
        except Exception:
            pass

        # Create if missing
        post_url = base
        post_headers = {
            "X-M2M-Origin": self.originator,
            "X-M2M-RI": f"ipe-create-{int(time.time()*1000)%10000}",
            "X-M2M-RVI": RVI,
            "Content-Type": "application/json;ty=28",
            "Accept": "application/json",
        }
        body = {
            "custom:mecRadioInfo": {
                "rn": "radioInfo",
                "cnd": "custom:mecRadioInfo",
                **self.current_metrics
            }
        }
        try:
            res = await client.post(post_url, headers=post_headers, json=body, timeout=4.0)
            return res.status_code in (200, 201) or res.headers.get("X-M2M-RSC") == "4105"
        except Exception:
            return False

    async def publish_metrics(
        self,
        rsrp: float,
        sinr: float,
        cqi: int = 15,
        mcs: int = 28,
        bler: float = 0.001,
        target_cse_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Publish updated 5G radio metrics to the oneM2M <flexContainer> specialization.
        Uses HTTP PUT to update [custom:mecRadioInfo] attributes natively.
        """
        # Physical bounds clamping
        clamped_rsrp = round(max(-140.0, min(-40.0, float(rsrp))), 2)
        clamped_sinr = round(max(-20.0, min(40.0, float(sinr))), 2)
        clamped_cqi = max(0, min(15, int(cqi)))
        clamped_mcs = max(0, min(28, int(mcs)))
        clamped_bler = round(max(0.0, min(1.0, float(bler))), 5)

        base = (target_cse_url or self.cse_url).rstrip("/")
        url = f"{base}/radioInfo"
        headers = {
            "X-M2M-Origin": self.originator,
            "X-M2M-RI": f"ipe-pub-{int(time.time()*1000)%10000}",
            "X-M2M-RVI": RVI,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {
            "custom:mecRadioInfo": {
                "rsrp": clamped_rsrp,
                "sinr": clamped_sinr,
                "cqi": clamped_cqi,
                "mcs": clamped_mcs,
                "bler": clamped_bler
            }
        }

        async with httpx.AsyncClient(timeout=4.0) as client:
            await self.ensure_flexcontainer_exists(client, base)
            try:
                res = await client.put(url, headers=headers, json=payload)
                if res.status_code in (200, 204):
                    self.current_metrics = payload["custom:mecRadioInfo"]
                    resp_data = res.json() if res.status_code == 200 else payload
                    # Also notify FastAPI dashboard if accessible
                    await self._notify_fastapi(client, clamped_rsrp, clamped_sinr)
                    return {
                        "status": "success",
                        "status_code": res.status_code,
                        "data": resp_data,
                        "metrics": self.current_metrics
                    }
                return {
                    "status": "error",
                    "status_code": res.status_code,
                    "error": res.text,
                    "rsc": res.headers.get("X-M2M-RSC")
                }
            except Exception as e:
                return {"status": "exception", "error": str(e)}

    async def get_latest_metrics(
        self,
        target_cse_url: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Retrieve current [custom:mecRadioInfo] flexContainer resource."""
        base = (target_cse_url or self.cse_url).rstrip("/")
        url = f"{base}/radioInfo"
        headers = {
            "X-M2M-Origin": self.originator,
            "X-M2M-RI": f"ipe-get-{int(time.time()*1000)%10000}",
            "X-M2M-RVI": RVI,
            "Accept": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    fcnt = data.get("custom:mecRadioInfo", {})
                    return {
                        "rsrp": fcnt.get("rsrp"),
                        "sinr": fcnt.get("sinr"),
                        "cqi": fcnt.get("cqi"),
                        "mcs": fcnt.get("mcs"),
                        "bler": fcnt.get("bler"),
                        "st": fcnt.get("st"),
                        "lt": fcnt.get("lt"),
                        "ri": fcnt.get("ri"),
                    }
                return None
        except Exception:
            return None

    async def _notify_fastapi(self, client: httpx.AsyncClient, rsrp: float, sinr: float) -> None:
        """Best-effort notification to dashboard backend."""
        if not self.fastapi_url:
            return
        district = "B" if "DistrictB" in self.cse_url else "A"
        try:
            # Emit traffic event
            now_ms = int(time.time() * 1000)
            event_payload = {
                "id": f"e{now_ms % 100000}",
                "ts": now_ms,
                "layer": "radio",
                "protocol": "HTTP",
                "src": "MEC-IPE",
                "dst": "MN-CSE",
                "op": "UPDATE",
                "path": f"//{self.cse_url.replace('http://', '')}/radioInfo",
                "status": 2004,
                "latencyMs": 12,
                "bytes": 165,
                "correlationId": f"corr-radio-{now_ms}",
                "payload": {"rsrp": rsrp, "sinr": sinr, "district": district}
            }
            await client.post(f"{self.fastapi_url}/api/events", json=event_payload, timeout=1.0)
        except Exception:
            pass

    async def run_telemetry_loop(
        self,
        interval: float = 2.0,
        degrade_mode: bool = False,
        steps: int = 15
    ):
        """Simulate realistic 5G radio stream and publish continuously."""
        print(f"[MEC-IPE] Starting telemetry stream to {self.cse_url} (interval={interval}s)...")
        rsrp = -88.0
        sinr = 18.0

        for step in range(steps):
            if degrade_mode:
                # Progressively degrade to trigger handover (< -105 dBm)
                rsrp -= 2.5
                sinr -= 1.2
            else:
                # Realistic jitter
                rsrp += random.uniform(-0.8, 0.8)
                sinr += random.uniform(-0.5, 0.5)

            cqi = max(1, min(15, int(15 + (rsrp + 80) / 3)))
            mcs = max(0, min(28, int(28 + (rsrp + 80) / 2)))
            bler = max(0.0001, min(0.1, 0.001 * (10 ** ((-rsrp - 80) / 25))))

            result = await self.publish_metrics(rsrp=rsrp, sinr=sinr, cqi=cqi, mcs=mcs, bler=bler)
            print(f"  Step {step+1}/{steps}: RSRP={rsrp:.1f} dBm, SINR={sinr:.1f} dB, CQI={cqi}, Status={result.get('status')}")
            await asyncio.sleep(interval)

        print("[MEC-IPE] Telemetry stream finished.")

if __name__ == "__main__":
    ipe = MecIpe()
    if len(sys.argv) > 1 and sys.argv[1] == "--degrade":
        asyncio.run(ipe.run_telemetry_loop(interval=1.0, degrade_mode=True, steps=10))
    elif len(sys.argv) > 1 and sys.argv[1] == "--stream":
        asyncio.run(ipe.run_telemetry_loop(interval=2.0, degrade_mode=False, steps=10))
    else:
        # Default: publish single sample and retrieve
        async def main():
            print("Publishing test radio metrics via MEC-IPE...")
            res = await ipe.publish_metrics(rsrp=-92.3, sinr=16.5, cqi=14, mcs=24, bler=0.002)
            print("Result:", res)
            latest = await ipe.get_latest_metrics()
            print("Latest from oneM2M:", latest)
        asyncio.run(main())
