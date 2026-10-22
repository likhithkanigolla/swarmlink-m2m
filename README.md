# SwarmLink-M2M Command Center

Real-time monitoring and autonomous triage dashboard for a robot doctor maintaining an ESP32 sensor swarm across a private 5G network, mediated by oneM2M (ACME CSE) and MEC edge computing.

---

## Architecture Overview

- **Dumb ESP32 Sensor Nodes**: Emit MQTT telemetry into oneM2M and execute numbered primitive actions (`1: restart sensor`, `2: recalibrate`, `3: flush buffer`, `4: reset radio modem`, `5: reboot node`). Nodes do not diagnose themselves.
- **Robot Doctor (Raspberry Pi + 5G Modem)**: Intelligent middleware on wheels. Pings nodes, ingests real-time streams, diagnoses faults, looks up oneM2M remediation IDs, and instructs nodes to execute primitive chains. Re-verifies recovered rooms.
- **oneM2M Backbone (ACME CSE)**: CSEBase with MN-CSE District A & B running on a MEC edge host, an IN-CSE above, flexContainers for incidents, AE polling channels, and Access Control Policies (ACPs).
- **Private 5G Network**: Connects all devices with gNodeB radio and 5G Core. Only the robot doctor can reach public external networks via 5G uplink.
- **Intelligence Escalation Chain**:
  1. `oneM2M catalogue lookup` (e.g. solution 1246)
  2. `Local model inference` (on Raspberry Pi)
  3. `Edge LLM propose-only` (via MCP)
  4. `Human operator approval` (guardrail blocks high-risk radio/compound actions until manual confirmation)

---

## Technology Stack

- **Framework**: React 19 + TypeScript + TanStack Router + Vite
- **Styling**: Tailwind CSS v4 + shadcn/ui design primitives
- **Visuals**: Recharts (real-time telemetry sparklines, traffic density, RSRP/SINR link handover)
- **State Management**: Zustand
- **Icons**: Lucide React

---

## Switching From Mock to FastAPI Backend

The application provides a unified data adapter interface (`DataAdapter`) that seamlessly switches between the in-browser simulation engine and a real-time FastAPI server.

### 1. Default (In-Browser Mock Engine)
By default, `VITE_API_URL` and `VITE_WS_URL` are unset. The application boots with `MockAdapter`, executing the deterministic scripted triage scenario (Room 2 NaN burst &rarr; Room 3 outlier &rarr; dynamic route re-plan & detour &rarr; oneM2M lookup 1246 &rarr; guardrail escalation with operator approval &rarr; 5G radio handover) followed by recurring ambient telemetry.

### 2. Live FastAPI Server
To connect the dashboard to a real FastAPI backend:

Create a `.env.local` file in the project root:

```env
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws/events
```

Restart the dev server:
```bash
npm run dev
```

### 3. FastAPI Expected Endpoints

- **REST Snapshot**:
  - `GET /api/snapshot`: Returns full initial state snapshot conforming to `Snapshot` in [domain.ts](file:///Users/likhithkanigolla/Personal/swarmlink-m2m-fe/src/types/domain.ts).
- **REST Operator Decisions**:
  - `POST /api/incidents/{id}/approve`: Approves high-risk proposed remediation.
  - `POST /api/incidents/{id}/reject`: Rejects proposed remediation and escalates to manual intervention.
- **WebSocket Feed**:
  - `GET /ws/events`: Streams real-time frames with automatic reconnect:
    ```json
    { "type": "event", "data": { "id": "e1", "ts": 1729600000000, "layer": "device", "protocol": "MQTT", ... } }
    { "type": "metric", "data": { "kpis": [...] } }
    { "type": "room", "data": [...] }
    { "type": "robot", "data": { ... } }
    { "type": "queue", "data": { "entries": [...], "note": "..." } }
    { "type": "incident", "data": [...] }
    { "type": "audit", "data": [...] }
    { "type": "tree", "data": { ... } }
    { "type": "link", "data": { ... } }
    { "type": "security", "data": [...] }
    { "type": "fl", "data": { ... } }
    ```

---

## Dashboard Layout & Key Features

1. **Top Bar**: Subsystem health chips (IN-CSE, MN-CSE A/B, 5G Core, Radio, Edge LLM, WebSocket/Simulation), Live/Pause toggle, 1x/2x/5x speed multiplier, Room count scaler (4, 6, 8), dark/light theme switch, and synchronized clock.
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
   - **oneM2M Resource Tree Explorer**: Expandable ACME CSE tree with 2-second flash highlights on active resources.
   - **Remediation Catalogue**: Reference table of primitive operations and risk tiers.
   - **5G Radio Link & Handover Monitor**: RSRP/SINR history chart with -105 dBm handover trigger line and 4-step handover sequence.
6. **Bottom Tray**:
   - Access Control Policy (ACP) audit log showing sensor write-only, robot read/execute, and LLM propose-only denials (4103).
   - Edge Federated Learning status card tracking training rounds and model versions.

---

## Local Development & Testing

```bash
# Install dependencies
npm install

# Typecheck
npx tsc --noEmit

# Production build
npm run build

# Start local development server
npm run dev
```
