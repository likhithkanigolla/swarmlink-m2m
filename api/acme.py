import os
import httpx
from typing import Optional, Dict, Any, List
from models import TreeNode

ACME_BASE_URL = os.getenv("ACME_BASE_URL", "http://localhost:8080").rstrip("/")
ACME_CSE_NAME = os.getenv("ACME_CSE_NAME", "cse-in")
ACME_ORIGINATOR = os.getenv("ACME_ORIGINATOR", "CAdmin")
ACME_RVI = os.getenv("ACME_RVI", "4")

TYPE_MAP = {
    1: "ACP",
    2: "AE",
    3: "container",
    4: "contentInstance",
    5: "CSEBase",
    9: "group",
    13: "mgmtObj",
    14: "node",
    15: "pollingChannel",
    16: "remoteCSE",
    23: "subscription",
    24: "semantic",
    28: "flexContainer",
    29: "timeSeries",
    30: "timeSeriesInstance",
}

class AcmeClient:
    """Client for communicating with the local or remote ACME oneM2M CSE."""

    def __init__(
        self,
        base_url: str = ACME_BASE_URL,
        cse_name: str = ACME_CSE_NAME,
        originator: str = ACME_ORIGINATOR,
        rvi: str = ACME_RVI,
    ):
        self.base_url = base_url
        self.cse_name = cse_name
        self.originator = originator
        self.rvi = rvi

    def get_headers(self, ri: str = "ri-req", ty: Optional[int] = None) -> Dict[str, str]:
        headers = {
            "X-M2M-Origin": self.originator,
            "X-M2M-RI": ri,
            "X-M2M-RVI": self.rvi,
            "Accept": "application/json",
        }
        if ty is not None:
            headers["Content-Type"] = f"application/json;ty={ty}"
        else:
            headers["Content-Type"] = "application/json"
        return headers

    async def check_health(self) -> Dict[str, Any]:
        """Verify connectivity to ACME CSEBase."""
        url = f"{self.base_url}/{self.cse_name}"
        headers = self.get_headers(ri="probe-health")
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    cb = data.get("m2m:cb", {})
                    return {
                        "connected": True,
                        "status_code": 200,
                        "server": res.headers.get("server", "ACME"),
                        "cse_name": cb.get("rn", self.cse_name),
                        "csi": cb.get("csi"),
                        "ri": cb.get("ri"),
                        "ty": cb.get("ty", 5),
                        "poa": cb.get("poa", []),
                        "srv": cb.get("srv", []),
                        "rsc": res.headers.get("x-m2m-rsc", "2000"),
                    }
                return {
                    "connected": False,
                    "status_code": res.status_code,
                    "error": res.text,
                    "rsc": res.headers.get("x-m2m-rsc"),
                }
        except Exception as e:
            return {
                "connected": False,
                "error": str(e),
                "url": url,
            }

    async def discover_resources(self, filter_ty: Optional[int] = None) -> List[str]:
        """Execute oneM2M discovery (RETRIEVE fu=1) under CSEBase."""
        url = f"{self.base_url}/{self.cse_name}?fu=1"
        if filter_ty is not None:
            url += f"&ty={filter_ty}"
        headers = self.get_headers(ri="disc-req")
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    return data.get("m2m:uril", [])
                return []
        except Exception:
            return []

    async def retrieve_resource(self, path: str) -> Optional[Dict[str, Any]]:
        """Retrieve a specific oneM2M resource by URI."""
        clean_path = path.lstrip("/")
        url = f"{self.base_url}/{clean_path}"
        headers = self.get_headers(ri="ret-req")
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    return res.json()
                return None
        except Exception:
            return None

    async def get_resource_tree(self) -> TreeNode:
        """Fetch live resource hierarchy from ACME and map to dashboard TreeNode structure."""
        headers = self.get_headers(ri="rcn4-tree")
        url = f"{self.base_url}/{self.cse_name}?rcn=4"
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    cb = data.get("m2m:cb", {})
                    cse_rn = cb.get("rn", self.cse_name)

                    root = TreeNode(
                        id=f"acme-{cse_rn}",
                        label=cse_rn,
                        kind="CSEBase",
                        path=f"//{self.base_url.replace('http://', '').replace('https://', '')}/{cse_rn}",
                        children=[]
                    )

                    # ACME returns child resources grouped by shortname list
                    type_mapping = {
                        "m2m:acp": "ACP",
                        "m2m:ae": "AE",
                        "m2m:cnt": "container",
                        "m2m:cin": "contentInstance",
                        "m2m:ntp": "mgmtObj",
                        "m2m:alst": "AE",
                        "m2m:sub": "subscription",
                        "m2m:nod": "node",
                        "m2m:grp": "group",
                        "m2m:csr": "remoteCSE",
                        "m2m:pch": "pollingChannel",
                        "m2m:fcnt": "flexContainer",
                        "m2m:ts": "timeSeries",
                        "m2m:smd": "semantic",
                    }

                    for key, items in cb.items():
                        if key.startswith("m2m:") and isinstance(items, list):
                            kind = type_mapping.get(key, "container")
                            for item in items:
                                if isinstance(item, dict):
                                    rn = item.get("rn") or item.get("ri", "resource")
                                    root.children.append(
                                        TreeNode(
                                            id=f"acme-{rn}",
                                            label=rn,
                                            kind=kind,
                                            path=f"//{self.base_url.replace('http://', '').replace('https://', '')}/{cse_rn}/{rn}",
                                            children=[]
                                        )
                                    )

                    return root
        except Exception:
            pass

        # Fallback if connection fails
        return TreeNode(
            id="acme-disconnected",
            label=f"{self.cse_name} (offline)",
            kind="CSEBase",
            path=f"//{self.base_url.replace('http://', '').replace('https://', '')}/{self.cse_name}",
            children=[]
        )
