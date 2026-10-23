# SwarmLink-M2M FastAPI Backend

FastAPI server providing REST state snapshots, guardrail approval webhooks, and real-time WebSocket feeds for the SwarmLink-M2M Command Center.

## Quick Start

### 1. Create and Activate Virtual Environment

```bash
cd api
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the Server

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The interactive OpenAPI docs will be available at:
[http://localhost:8000/docs](http://localhost:8000/docs)

---

## Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health probe |
| `GET` | `/api/snapshot` | Returns full initial JSON snapshot (rooms, robot, tree, link, kpis, subsystems) |
| `GET` | `/api/subsystems` | Monitored edge & core subsystems (IN-CSE, MN-CSE A/B, 5G Core, Radio, Edge-LLM) |
| `PUT` | `/api/subsystems/{id}` | Update subsystem health/endpoint |
| `GET` | `/api/rooms` | All 4 rooms and child ESP32 devices |
| `GET` | `/api/rooms/{id}` | State of an individual room |
| `POST` | `/api/rooms/{rid}/devices/{did}/fault` | Inject or clear device sensor fault (`nan`, `outlier`, `silent`, or `null`) |
| `GET` | `/api/robot` | Robot doctor telemetry, route, battery, and memory |
| `POST` | `/api/robot/dispatch` | Command robot doctor navigation |
| `GET` | `/api/queue` | Computed triage priority queue |
| `GET` | `/api/incidents` | Active and past remediation incidents |
| `GET` | `/api/incidents/{id}` | Specific incident details |
| `POST` | `/api/incidents/{id}/approve` | Operator approves proposed remediation |
| `POST` | `/api/incidents/{id}/reject` | Operator rejects and escalates to human |
| `GET` | `/api/link` | 5G radio metrics (RSRP, SINR, handover state, district) |
| `POST` | `/api/link/handover` | Trigger 5G handover between District A and B |
| `GET` | `/api/tree` | Hierarchical oneM2M ACME resource tree |
| `GET` | `/api/kpis` | Active telemetry KPIs list |
| `GET` | `/api/fl` | Federated Learning round & model status |
| `POST` | `/api/fl/round` | Trigger Federated Learning training round |
| `POST` | `/api/events` | Ingests a new traffic frame from middleware/5G Core |
| `WS` | `/ws/events` | Real-time WebSocket event stream for dashboard clients |

---

## Lovable Cloud Deployment & Resilience

When pushed to GitHub, Lovable runs preview instances in cloud sandboxes where `localhost:8000` is not accessible.
To guarantee the frontend remains 100% operational in Lovable:
1. The frontend uses [`ResilientAdapter`](../src/services/dataService.ts) which detects when running in a remote cloud preview without a configured remote backend.
2. If `localhost:8000` fails to respond or is unavailable, the frontend **smoothly falls back to the in-browser digital twin engine** without throwing unhandled exceptions or crashing the UI.
3. In local development or when `VITE_API_URL` is set, it connects directly to this FastAPI service.

---

## Running Automated Tests

```bash
cd api
pytest
```
