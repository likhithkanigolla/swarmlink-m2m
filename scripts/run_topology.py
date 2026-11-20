#!/usr/bin/env python3
"""
scripts/run_topology.py

CLI and module to start, stop, monitor, and restart the multi-CSE topology:
- IN-CSE (:8080, CSEBase: cse-in, CSE-ID: /id-in)
- DistrictA-MN-CSE (:8081, CSEBase: DistrictA-MN-CSE, CSE-ID: /id-mn-a)
- DistrictB-MN-CSE (:8082, CSEBase: DistrictB-MN-CSE, CSE-ID: /id-mn-b)

Under ETSI TR-0077 and oneM2M TS-0001 / TS-0004 specifications.
"""

import os
import sys
import time
import json
import signal
import shutil
import subprocess
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, Optional, List

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PID_FILE = PROJECT_ROOT / ".topology_pids.json"

INSTANCES = [
    {
        "name": "in_cse",
        "label": "IN-CSE",
        "port": 8080,
        "cse_name": "cse-in",
        "cse_id": "/id-in",
        "dir": PROJECT_ROOT / "cse_configs" / "in_cse",
    },
    {
        "name": "district_a",
        "label": "DistrictA-MN-CSE",
        "port": 8081,
        "cse_name": "DistrictA-MN-CSE",
        "cse_id": "/id-mn-a",
        "dir": PROJECT_ROOT / "cse_configs" / "district_a",
    },
    {
        "name": "district_b",
        "label": "DistrictB-MN-CSE",
        "port": 8082,
        "cse_name": "DistrictB-MN-CSE",
        "cse_id": "/id-mn-b",
        "dir": PROJECT_ROOT / "cse_configs" / "district_b",
    },
]

def find_acmecse() -> List[str]:
    """Locate acmecse binary or Python 3.11 runner."""
    pyenv_acmecse = Path("/Users/likhithkanigolla/.pyenv/versions/3.11.6/bin/acmecse")
    if pyenv_acmecse.exists() and os.access(pyenv_acmecse, os.X_OK):
        return [str(pyenv_acmecse)]
    
    which_acme = shutil.which("acmecse")
    if which_acme:
        return [which_acme]

    pyenv_python = Path("/Users/likhithkanigolla/.pyenv/versions/3.11.6/bin/python3.11")
    if pyenv_python.exists():
        return [str(pyenv_python), "-m", "acmecse"]

    if shutil.which("python3.11"):
        return ["python3.11", "-m", "acmecse"]

    return [sys.executable, "-m", "acmecse"]

def is_port_in_use(port: int) -> bool:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(("127.0.0.1", port)) == 0

def wait_for_cse(port: int, cse_name: str, timeout: float = 12.0) -> bool:
    """Poll CSE HTTP endpoint until responsive or timed out."""
    url = f"http://127.0.0.1:{port}/{cse_name}"
    headers = {
        "X-M2M-Origin": "CAdmin",
        "X-M2M-RI": "probe",
        "X-M2M-RVI": "4",
        "Accept": "application/json",
    }
    req = urllib.request.Request(url, headers=headers)
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.4)
    return False

def check_process_alive(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False

def load_pids() -> Dict[str, int]:
    if PID_FILE.exists():
        try:
            with open(PID_FILE, "r") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_pids(pids: Dict[str, int]) -> None:
    with open(PID_FILE, "w") as f:
        json.dump(pids, f, indent=2)

def clear_pid_file() -> None:
    if PID_FILE.exists():
        try:
            PID_FILE.unlink()
        except Exception:
            pass

def kill_process_on_port(port: int) -> None:
    """Kill any process holding the port."""
    try:
        res = subprocess.run(
            ["lsof", "-t", f"-i:{port}"],
            capture_output=True,
            text=True
        )
        if res.stdout:
            for p in res.stdout.strip().split():
                try:
                    pid = int(p)
                    os.kill(pid, signal.SIGKILL)
                except Exception:
                    pass
    except Exception:
        pass

def start_topology(background: bool = True) -> Dict[str, Any]:
    """Start all three CSE instances in proper dependency order."""
    acme_cmd = find_acmecse()
    pids = load_pids()

    # Pre-flight check: if already running, check status
    running_count = 0
    for inst in INSTANCES:
        name = inst["name"]
        pid = pids.get(name)
        if pid and check_process_alive(pid):
            running_count += 1

    if running_count == len(INSTANCES):
        print("[Topology] All instances are already running.")
        return get_status()

    # Clean up stale processes
    for inst in INSTANCES:
        port = inst["port"]
        name = inst["name"]
        pid = pids.get(name)
        if pid and check_process_alive(pid):
            try:
                os.kill(pid, signal.SIGTERM)
                time.sleep(0.5)
            except Exception:
                pass
        if is_port_in_use(port):
            kill_process_on_port(port)

    pids = {}
    logs_dir = PROJECT_ROOT / "logs"
    logs_dir.mkdir(exist_ok=True)

    print(f"[Topology] Launching multi-CSE topology using: {' '.join(acme_cmd)}")

    for inst in INSTANCES:
        name = inst["name"]
        label = inst["label"]
        port = inst["port"]
        cse_name = inst["cse_name"]
        config_dir = inst["dir"]
        log_file = logs_dir / f"{name}.log"

        cmd = acme_cmd + [
            "--base-directory", str(config_dir),
            "--config", "acme.ini",
            "--headless"
        ]

        stdout_handle = open(log_file, "a")
        proc = subprocess.Popen(
            cmd,
            cwd=str(config_dir),
            stdout=stdout_handle,
            stderr=subprocess.STDOUT,
            preexec_fn=os.setsid
        )

        pids[name] = proc.pid
        print(f"  Starting {label} on port {port} (PID: {proc.pid})...", end="", flush=True)

        # Wait for CSE to be healthy
        if wait_for_cse(port, cse_name, timeout=10.0):
            print(" [ONLINE]")
        else:
            print(" [WAITING / DEFERRED]")

        # Allow registrar to stabilize before launching clients
        time.sleep(1.0)

    save_pids(pids)
    print("[Topology] Topology started successfully.\n")
    return get_status()

def stop_topology() -> None:
    """Stop all running CSE instances."""
    pids = load_pids()
    print("[Topology] Stopping multi-CSE topology...")

    for inst in INSTANCES:
        name = inst["name"]
        label = inst["label"]
        port = inst["port"]
        pid = pids.get(name)

        stopped = False
        if pid and check_process_alive(pid):
            try:
                os.killpg(os.getpgid(pid), signal.SIGTERM)
                for _ in range(10):
                    if not check_process_alive(pid):
                        stopped = True
                        break
                    time.sleep(0.2)
                if not stopped:
                    os.killpg(os.getpgid(pid), signal.SIGKILL)
                    stopped = True
            except Exception:
                stopped = True

        if is_port_in_use(port):
            kill_process_on_port(port)
            stopped = True

        status_str = "[STOPPED]" if stopped else "[NOT RUNNING]"
        print(f"  {label} (port {port}): {status_str}")

    clear_pid_file()
    print("[Topology] All instances terminated.")

def get_status() -> Dict[str, Any]:
    """Check connectivity and Mcc status of all 3 instances."""
    pids = load_pids()
    results = {}

    for inst in INSTANCES:
        name = inst["name"]
        label = inst["label"]
        port = inst["port"]
        cse_name = inst["cse_name"]
        pid = pids.get(name)

        is_alive = bool(pid and check_process_alive(pid))
        url = f"http://127.0.0.1:{port}/{cse_name}"
        headers = {
            "X-M2M-Origin": "CAdmin",
            "X-M2M-RI": "status-check",
            "X-M2M-RVI": "4",
            "Accept": "application/json",
        }

        connected = False
        details = {}
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                if resp.status == 200:
                    connected = True
                    data = json.loads(resp.read().decode())
                    cb = data.get("m2m:cb", {})
                    details = {
                        "rn": cb.get("rn"),
                        "csi": cb.get("csi"),
                        "cst": cb.get("cst"),
                        "poa": cb.get("poa"),
                    }
        except Exception as e:
            details["error"] = str(e)

        results[name] = {
            "label": label,
            "port": port,
            "pid": pid,
            "process_alive": is_alive,
            "connected": connected,
            "details": details,
        }

    # Query Mcc registered remoteCSEs under IN-CSE
    in_connected = results.get("in_cse", {}).get("connected", False)
    mcc_links = []
    if in_connected:
        try:
            url = "http://127.0.0.1:8080/cse-in?fu=1&ty=16"
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                if resp.status == 200:
                    data = json.loads(resp.read().decode())
                    mcc_links = data.get("m2m:uril", [])
        except Exception:
            pass

    results["mcc_remote_cses"] = mcc_links
    return results

def print_status_table():
    status = get_status()
    print("=" * 75)
    print(f"{'CSE Name':<20} | {'Port':<6} | {'PID':<8} | {'Process':<10} | {'HTTP Status'}")
    print("-" * 75)
    for inst in INSTANCES:
        name = inst["name"]
        data = status[name]
        proc_str = "ALIVE" if data["process_alive"] else "DEAD"
        http_str = "200 OK (ONLINE)" if data["connected"] else "OFFLINE"
        print(f"{data['label']:<20} | {data['port']:<6} | {str(data['pid']):<8} | {proc_str:<10} | {http_str}")
    print("-" * 75)
    mcc = status.get("mcc_remote_cses", [])
    print(f"Mcc Registered RemoteCSEs under IN-CSE (:8080): {mcc}")
    print("=" * 75)

if __name__ == "__main__":
    action = sys.argv[1].lower() if len(sys.argv) > 1 else "status"

    if action == "start":
        start_topology()
        print_status_table()
    elif action == "stop":
        stop_topology()
    elif action == "restart":
        stop_topology()
        time.sleep(1.0)
        start_topology()
        print_status_table()
    elif action == "status":
        print_status_table()
    else:
        print(f"Unknown action: {action}. Usage: {sys.argv[0]} [start|stop|restart|status]")
        sys.exit(1)
