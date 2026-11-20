"""
api/acme.py

Client for communicating with the local or remote ACME oneM2M CSEs:
- IN-CSE (:8080, cse-in)
- DistrictA-MN-CSE (:8081, DistrictA-MN-CSE)
- DistrictB-MN-CSE (:8082, DistrictB-MN-CSE)
"""

import os
import asyncio
import httpx
from typing import Optional, Dict, Any, List
from models import TreeNode

IN_CSE_URL = os.getenv("ACME_BASE_URL", "http://localhost:8080").rstrip("/")
IN_CSE_NAME = os.getenv("ACME_CSE_NAME", "cse-in")

MN_A_URL = os.getenv("MN_A_URL", "http://localhost:8081").rstrip("/")
MN_A_NAME = os.getenv("MN_A_NAME", "DistrictA-MN-CSE")

MN_B_URL = os.getenv("MN_B_URL", "http://localhost:8082").rstrip("/")
MN_B_NAME = os.getenv("MN_B_NAME", "DistrictB-MN-CSE")

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
    """Client for communicating with the multi-CSE ACME oneM2M topology."""

    def __init__(
        self,
        base_url: str = IN_CSE_URL,
        cse_name: str = IN_CSE_NAME,
        originator: str = ACME_ORIGINATOR,
        rvi: str = ACME_RVI,
    ):
        self.base_url = base_url.rstrip("/")
        self.cse_name = cse_name
        self.originator = originator
        self.rvi = rvi

        # Secondary district endpoints
        self.mn_a_url = MN_A_URL
        self.mn_a_name = MN_A_NAME
        self.mn_b_url = MN_B_URL
        self.mn_b_name = MN_B_NAME

    def get_headers(self, ri: str = "ri-req", ty: Optional[int] = None, originator: Optional[str] = None) -> Dict[str, str]:
        headers = {
            "X-M2M-Origin": originator or self.originator,
            "X-M2M-RI": ri,
            "X-M2M-RVI": self.rvi,
            "Accept": "application/json",
        }
        if ty is not None:
            headers["Content-Type"] = f"application/json;ty={ty}"
        else:
            headers["Content-Type"] = "application/json"
        return headers

    async def check_health(self, base_url: Optional[str] = None, cse_name: Optional[str] = None) -> Dict[str, Any]:
        """Verify connectivity to a specific ACME CSEBase."""
        b_url = (base_url or self.base_url).rstrip("/")
        c_name = cse_name or self.cse_name
        url = f"{b_url}/{c_name}"
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
                        "cse_name": cb.get("rn", c_name),
                        "csi": cb.get("csi"),
                        "ri": cb.get("ri"),
                        "ty": cb.get("ty", 5),
                        "poa": cb.get("poa", []),
                        "srv": cb.get("srv", []),
                        "rsc": res.headers.get("x-m2m-rsc", "2000"),
                        "base_url": b_url,
                    }
                return {
                    "connected": False,
                    "status_code": res.status_code,
                    "error": res.text,
                    "rsc": res.headers.get("x-m2m-rsc"),
                    "base_url": b_url,
                }
        except Exception as e:
            return {
                "connected": False,
                "error": str(e),
                "url": url,
                "base_url": b_url,
            }

    async def check_all_cses_health(self) -> Dict[str, Any]:
        """Check health of all 3 CSE instances and discover Mcc CSR links."""
        in_health, a_health, b_health = await asyncio.gather(
            self.check_health(self.base_url, self.cse_name),
            self.check_health(self.mn_a_url, self.mn_a_name),
            self.check_health(self.mn_b_url, self.mn_b_name),
            return_exceptions=True
        )
        in_res = in_health if isinstance(in_health, dict) else {"connected": False, "error": str(in_health)}
        a_res = a_health if isinstance(a_health, dict) else {"connected": False, "error": str(a_health)}
        b_res = b_health if isinstance(b_health, dict) else {"connected": False, "error": str(b_health)}

        # Query Mcc registered remoteCSEs under IN-CSE
        mcc_remote_cses = []
        if in_res.get("connected"):
            try:
                mcc_remote_cses = await self.discover_resources(filter_ty=16)
            except Exception:
                pass

        return {
            "in_cse": in_res,
            "district_a": a_res,
            "district_b": b_res,
            "mcc_remote_cses": mcc_remote_cses,
            "all_healthy": bool(in_res.get("connected") and a_res.get("connected") and b_res.get("connected"))
        }

    async def discover_resources(
        self,
        filter_ty: Optional[int] = None,
        base_url: Optional[str] = None,
        cse_name: Optional[str] = None
    ) -> List[str]:
        """Execute oneM2M discovery (RETRIEVE fu=1) under CSEBase."""
        b_url = (base_url or self.base_url).rstrip("/")
        c_name = cse_name or self.cse_name
        url = f"{b_url}/{c_name}?fu=1"
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

    async def retrieve_resource(
        self,
        path: str,
        base_url: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Retrieve a specific oneM2M resource by URI."""
        b_url = (base_url or self.base_url).rstrip("/")
        clean_path = path.lstrip("/")
        url = f"{b_url}/{clean_path}"
        headers = self.get_headers(ri="ret-req")
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    return res.json()
                return None
        except Exception:
            return None

    def _infer_kind(self, name: str) -> str:
        n = name.lower()
        if "acp" in n:
            return "ACP"
        if "timeseries" in n or n.startswith("ts"):
            return "timeSeries"
        if "pollingchannel" in n or n.startswith("pch"):
            return "pollingChannel"
        if "robotae" in n or n.startswith("ae") or name == "CAdmin":
            return "AE"
        if "mgmt" in n or "ntp" in n:
            return "mgmtObj"
        if "incident" in n or "radioinfo" in n:
            return "flexContainer"
        if "catalog" in n or name.isdigit():
            return "catalog"
        if "id-mn-" in n or "mn-cse" in n:
            return "remoteCSE"
        return "container"

    def _build_tree_from_uris(self, base_url: str, cse_name: str, urils: List[str]) -> TreeNode:
        """Construct a TreeNode hierarchy from discovered oneM2M resource paths."""
        host_label = base_url.replace("http://", "").replace("https://", "")
        root = TreeNode(
            id=f"acme-{cse_name}",
            label=cse_name,
            kind="CSEBase",
            path=f"//{host_label}/{cse_name}",
            children=[]
        )
        node_map: Dict[str, TreeNode] = {"": root, cse_name: root}
        sorted_uris = sorted(urils, key=lambda u: (u.count("/"), len(u)))

        for uri in sorted_uris:
            parts = uri.split("/")
            if len(parts) <= 1:
                continue
            parent_path = "/".join(parts[:-1])
            child_name = parts[-1]
            kind = self._infer_kind(child_name)

            child_node = TreeNode(
                id=f"acme-{uri.replace('/', '-')}",
                label=child_name,
                kind=kind,
                path=f"//{host_label}/{uri}",
                children=[]
            )
            node_map[uri] = child_node
            parent_node = node_map.get(parent_path, root)
            if parent_node.children is None:
                parent_node.children = []
            parent_node.children.append(child_node)

        return root

    async def get_multi_cse_tree(self) -> TreeNode:
        """Fetch and assemble unified multi-CSE resource tree across IN-CSE and both MN-CSEs."""
        # 1. Discover resources from IN-CSE
        in_uris = await self.discover_resources(base_url=self.base_url, cse_name=self.cse_name)
        root = self._build_tree_from_uris(self.base_url, self.cse_name, in_uris)

        # 2. Check and attach District A MN-CSE (:8081)
        a_health = await self.check_health(self.mn_a_url, self.mn_a_name)
        if a_health.get("connected"):
            a_uris = await self.discover_resources(base_url=self.mn_a_url, cse_name=self.mn_a_name)
            node_a = self._build_tree_from_uris(self.mn_a_url, self.mn_a_name, a_uris)
            node_a.id = "acme-DistrictA-MN-CSE"
            node_a.label = self.mn_a_name
            node_a.kind = "remoteCSE"
            if root.children is None:
                root.children = []
            # Replace existing stub or append
            root.children = [c for c in root.children if c.label not in ("id-mn-a", self.mn_a_name)]
            root.children.append(node_a)

        # 3. Check and attach District B MN-CSE (:8082)
        b_health = await self.check_health(self.mn_b_url, self.mn_b_name)
        if b_health.get("connected"):
            b_uris = await self.discover_resources(base_url=self.mn_b_url, cse_name=self.mn_b_name)
            node_b = self._build_tree_from_uris(self.mn_b_url, self.mn_b_name, b_uris)
            node_b.id = "acme-DistrictB-MN-CSE"
            node_b.label = self.mn_b_name
            node_b.kind = "remoteCSE"
            if root.children is None:
                root.children = []
            root.children = [c for c in root.children if c.label not in ("id-mn-b", self.mn_b_name)]
            root.children.append(node_b)

        return root

    async def get_resource_tree(self) -> TreeNode:
        """Fetch live resource hierarchy with multi-CSE fallback."""
        try:
            return await self.get_multi_cse_tree()
        except Exception:
            return TreeNode(
                id="acme-disconnected",
                label=f"{self.cse_name} (offline)",
                kind="CSEBase",
                path=f"//{self.base_url.replace('http://', '').replace('https://', '')}/{self.cse_name}",
                children=[]
            )
