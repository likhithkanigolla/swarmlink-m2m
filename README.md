# SwarmLink-M2M Command Center

Real-time monitoring and autonomous triage dashboard for a robot doctor maintaining an ESP32 sensor swarm across a private 5G network, mediated by oneM2M (ACME CSE) and MEC edge computing.

> **Official Project Report & ACME CSE Ground Truth Proofs**:  
> • 📄 **Hackathon Project Report**: [docs/PROJECT_REPORT.md](docs/PROJECT_REPORT.md) — Complete Hackster-style architecture report covering Private 5G, ETSI TR-0077 (Clauses 7.1, 7.2, 7.3, 7.4), hardware/software setup, and oneM2M specifications.  
> • 🔍 **Comparative Verification Proofs**: [docs/proofs/ACME_VS_DASHBOARD_PROOF.md](docs/proofs/ACME_VS_DASHBOARD_PROOF.md) — Side-by-side visual and wire trace proofs showing ACME CSE as the hero/authority and the dashboard as its digital twin projection.

---

## Architecture Overview

- **Dumb ESP32 Sensor Nodes**: Emit MQTT telemetry into oneM2M and execute numbered primitive actions (`1: restart sensor`, `2: recalibrate`, `3: flush buffer`, `4: reset radio modem`, `5: reboot node`). Nodes do not diagnose themselves.
- **Robot Doctor (Raspberry Pi + 5G Modem)**: Intelligent middleware on wheels. Pings nodes, ingests real-time streams, diagnoses faults, looks up oneM2M remediation IDs, and instructs nodes to execute primitive chains. Re-verifies recovered rooms.
- **oneM2M Multi-CSE Backbone (ACME CSE)**:
  - **IN-CSE** (`:8080`, `cse-in`): Cloud/Command tier hosting global catalog, ACPs, and Mcc peering.
  - **MN-CSE District A** (`:8081`, `DistrictA-MN-CSE`): Edge MEC node A (Room 1 & Room 2).
  - **MN-CSE District B** (`:8082`, `DistrictB-MN-CSE`): Edge MEC node B (Room 3 & Room 4).
  - Inter-CSE Mcc reference point for district federation and AE re-registration.
- **MEC-IPE Telemetry (`api/mec_ipe.py`)**: Interworking proxy mapping 5G radio metrics (`rsrp`, `sinr`, `cqi`, `mcs`, `bler`) directly into oneM2M `<flexContainer>` specialization `[custom:mecRadioInfo]`.
- **Private 5G Network**: Connects all devices with gNodeB radio and 5G Core. Only the robot doctor can reach public external networks via 5G uplink.
- **Intelligence Escalation Chain**:
  1. `oneM2M catalogue lookup` (e.g. solution 1246)
  2. `Local model inference` (on Raspberry Pi)
  3. `Edge LLM propose-only` (via MCP)
  4. `Human operator approval` (guardrail blocks high-risk radio/compound actions until manual confirmation)

---

## Multi-CSE Topology & Local Port Map

| Component | Port | CSEBase / Identifier | Role & Description |
|---|---|---|---|
| **IN-CSE** | `8080` | `cse-in` (`/id-in`) | Central IN-CSE; hosts global ACPs, incident solutions, and Mcc peering |
| **DistrictA-MN-CSE** | `8081` | `DistrictA-MN-CSE` (`/id-mn-a`) | Edge MEC Node A; manages District A rooms (1 & 2) and local `mecRadioInfo` |
| **DistrictB-MN-CSE** | `8082` | `DistrictB-MN-CSE` (`/id-mn-b`) | Edge MEC Node B; manages District B rooms (3 & 4) and target handover node |
| **FastAPI Backend** | `8000` | — | Multi-CSE adapter, REST API (`/api/snapshot`), and WebSocket stream (`/ws/events`) |
| **Vite Frontend** | `5173` | — | React 19 + TypeScript real-time Command Center dashboard |

---

## Quick Start & Verification

### 1. Manage Multi-CSE Instances (`scripts/run_topology.py`)

The multi-CSE instances are managed via the topology lifecycle manager:

```bash
# Check status of all CSE instances and Mcc registrations
python3 scripts/run_topology.py status

# Start all CSE instances (IN-CSE :8080, District A :8081, District B :8082)
python3 scripts/run_topology.py start

# Restart or stop the topology
python3 scripts/run_topology.py restart
python3 scripts/run_topology.py stop
```

### 2. Bootstrap oneM2M Resources (`api/bootstrap_acme.py`)

To populate ACPs, catalogs, rooms, and flexContainers across all CSEs:

```bash
python3 api/bootstrap_acme.py
```

### 3. Run Automated System Verification

Cross-verify all ACME CSE instances, flexContainers, ACPs, and FastAPI integration endpoints:

```bash
python3 scripts/verify_system.py
```
*(Executes 17 automated verification checks across the multi-port deployment)*

### 4. Test 5G Radio Handover Callflow (`scripts/simulate_handover.py`)

Executes the ETSI TR-0077 Clause 7.2 signal degradation and handover sequence:

```bash
python3 scripts/simulate_handover.py
```
- Radio metrics degrade past the threshold ($-105\text{ dBm}$).
- `RobotAE` de-registers from `DistrictA-MN-CSE` (`:8081`) and re-registers to `DistrictB-MN-CSE` (`:8082`).
- Measures and reports application-layer interruption time ($\Delta t$).
- Executes swarm task in District B, transitioning state to `DONE`.

---

## Technology Stack

- **Frontend**: React 19 + TypeScript + TanStack Router + Vite
- **Styling**: Tailwind CSS v4 + shadcn/ui design primitives
- **Visuals**: Recharts (real-time telemetry sparklines, traffic density, RSRP/SINR link handover)
- **State Management**: Zustand
- **Backend & Middleware**: Python 3.12, FastAPI, WebSockets, ACME oneM2M CSE (`acmecse`)

---

## Switching From Mock to FastAPI Backend

The application provides a unified data adapter interface (`DataAdapter`) that seamlessly switches between the in-browser engine and the real-time multi-CSE FastAPI server.

### 1. In-Browser Mode
By default, when `VITE_API_URL` and `VITE_WS_URL` are unset, the application boots in local mode, executing the deterministic triage scenario followed by recurring ambient telemetry.

### 2. Live Multi-CSE FastAPI Server
To connect the dashboard to the running multi-CSE backend:

Create a `.env.local` file in the project root:

```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws/events
```

Start the FastAPI server:
```bash
uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload
```

Start the Vite development server:
```bash
npm run dev
```

### 3. Key FastAPI Endpoints

- **REST Snapshot**:
  - `GET /api/snapshot`: Returns full multi-district state snapshot conforming to `Snapshot` in [domain.ts](file:///Users/likhithkanigolla/Personal/swarmlink-m2m-fe/src/types/domain.ts).
- **REST Operator Decisions**:
  - `POST /api/incidents/{id}/approve`: Approves high-risk proposed remediation.
  - `POST /api/incidents/{id}/reject`: Rejects proposed remediation and escalates to manual intervention.
- **WebSocket Feed**:
  - `GET /ws/events`: Streams real-time frames with automatic reconnect for events, metrics, room states, robot states, incident queues, and tree updates.

---

## Dashboard Layout & Key Features

1. **Top Bar**: Subsystem health chips (**IN-CSE :8080**, **MN-CSE A :8081**, **MN-CSE B :8082**, 5G Core, Radio, Edge LLM, WebSocket), Live/Pause toggle, 1x/2x/5x speed multiplier, Room count scaler, dark/light theme switch, and synchronized clock.
2. **KPI Strip**: Mini sparklines displaying messages/sec, average latency, restored devices/min, active incidents, RSRP/SINR, handover interruption (ms), robot battery, Pi memory, and Pi vs MEC inference latency.
3. **Left Column**:
   - **Floor Map**: Configurable rooms colored by health, device status dots (alive, outlier, NaN), real-time robot pathing with ghost detour lines and 5G private radio link status.
   - **Triage Virtual Queue**: Ranked rooms with priority score bars, travel costs, and re-plan detour notifications.
   - **Verification List**: Tracks rooms where solutions have been dispatched awaiting robot return verification.
4. **Centre Hero (Unified Live Traffic Stream)**:
   - Stacked area chart showing 60-second traffic density across communication layers.
   - Filter toolbar: Search, errors-only toggle, layer chips, protocol chips.
   - Live stream table with hover-pause and CSV export.
   - Slide-in Event Inspection Drawer: Displays oneM2M headers (`X-M2M-Origin`, `X-M2M-RI`), correlation IDs, formatted JSON payloads, and full incident remediation chain.
5. **Right Column**:
   - **Remediation Timeline**: Multi-step visual recovery arc tracking ping &rarr; analysis &rarr; oneM2M lookup &rarr; primitive execution &rarr; confirmation &rarr; re-verification.
   - **Intelligence Escalation Badge**: Displays current resolver tier (`oneM2M lookup`, `Local model`, `Edge LLM`, `Human`).
   - **Approval Panel**: Appears automatically for `PENDING_APPROVAL` items with risk rationale, origin, and one-click Approve / Reject buttons.
   - **AI Audit Stream**: Live triage reasoning, rule checks, and safety guardrail blocks.
   - **oneM2M Resource Tree Explorer**: Expandable ACME CSE tree with 2-second flash highlights on active resources across all three CSEs.
   - **Remediation Catalogue**: Reference table of primitive operations and risk tiers.
   - **5G Radio Link & Handover Monitor**: RSRP/SINR history chart with $-105\text{ dBm}$ handover trigger line and 4-step handover sequence.
6. **Bottom Tray**:
   - Access Control Policy (ACP) audit log showing sensor write-only, robot read/execute, and LLM propose-only denials (4103).
   - Edge Federated Learning status card tracking training rounds and model versions.

---

## Local Development & Automated Tests

```bash
# Frontend dependencies & build
npm install
npx tsc --noEmit
npm test
npm run build

# Python Backend unit & integration tests
pytest api/
```
