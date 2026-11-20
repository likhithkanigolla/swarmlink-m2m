# SwarmLink-M2M: Team Alignment & Technical Architecture Document
**Target**: ETSI STF 685 Hackathon (ESTIMED Track)  
**Team**: Nexus  
**Key Mentors & Sources**: Bob Flynn (oneM2M Chair / STF 685), Yann Garcia (ETSI)  
**Document Status**: Official Internal Team Reference

---

## 1. Executive Summary & Validation Against Mentor Advice

**Yes, our architecture matches the mentor feedback with 100% precision.** 

Bob Flynn and Yann Garcia verified:
1. **Real Private 5G Hardware**: Using a physical 5G base station + local UPF edge server without formal ETSI MEC 011/012/013 APIs is **validated and strongly encouraged**.
2. **Custom MEC-IPE**: Implementing our own MEC Interworking Proxy AE (MEC-IPE) to extract per-cell CQI/SNR/MCS from the WiSig CU-DU/NiralOS Core and modem RSRP/SINR directly into oneM2M resources hits the **"Expert Proficiency"** rubric level.
3. **CSE Selection (ACME)**: Confirmed that the ESTIMED testbed, ETSI sandbox, and central IN-CSE use **ACME CSE** (written by Andreas Kraft, an ESTIMED project member). Dropping Mobius in favor of ACME was the exact right decision.
4. **Core Evaluation Rule**: *"Remove oneM2M and the system must stop working."* All intelligence, task assignment, and device management must be mediated by oneM2M resources.

---

## 2. Hardware & Network Stack

```
+-----------------------------------------------------------------------------------+
|                        5G SA Radio Access Network & Core                          |
|                                                                                   |
|  [ VVDN Low Power RU ] <--- Split 7.2x ---> [ WiSig CU-DU (O-RAN) ]               |
|      (Band n78, 100MHz)                           | (O1/NETCONF via ONAP SDNR)    |
|                                                   ▼                               |
|                                        [ NiralOS 5G Core ]                        |
|                                        (Rel-16 Cloud Native)                      |
|                                        AMF | SMF | AUSF | UDM                     |
|                                                   | (CUPS)                        |
|                                                   ▼                               |
|                                        [ Local On-Prem UPF ]                      |
+---------------------------------------------------|-------------------------------+
                                                    |
                           Low-Latency Edge Data Path
                                                    |
                                                    ▼
+-----------------------------------------------------------------------------------+
|                         On-Prem Edge Compute Server                               |
|                                                                                   |
|   +------------------------------------+    +----------------------------------+  |
|   |         Custom MEC-IPE             |    |         Local Edge LLM           |  |
|   |  - Polls WiSig CQI/SNR/MCS         |    |  - Ollama (3B-8B SLM)            |  |
|   |  - Reads Niral Core throughput     |    |  - MCP Tool Server               |  |
|   |  - Maps to oneM2M containers       |    |  - Propose-only (Blocked by ACP) |  |
|   +-----------------|------------------+    +----------------|-----------------+  |
|                     | Mca                                    | Mca (Propose)      |
|                     ▼                                        ▼                    |
|   +----------------------------------------------------------------------------+  |
|   |            ACME MN-CSEs (District A :8081 & District B :8082)              |  |
|   +----------------------------------------------------------------------------+  |
|                                     ▲                                             |
|                                     │ Mcc                                         |
+-------------------------------------|---------------------------------------------+
                                      │
                                      ▼
+-----------------------------------------------------------------------------------+
|                        Central IN-CSE (:8080) & Dashboard                         |
|  - Digital Twin State Snapshot & Real-Time WebSocket Engine                       |
|  - Operator Human-in-the-Loop Webhook (/api/incidents/{id}/approve)               |
|  - Global Remediation Catalogue (/remediationCatalog)                             |
|  - React 19 Command Center Dashboard (Vite + Tailwind v4)                        |
+-----------------------------------------------------------------------------------+
```

### Lab Component Matrix
| Role | Hardware / Software | Configuration Details |
|---|---|---|
| **5G Core** | NiralOS 5G Core | 3GPP Rel-16, Cloud-native microservices (AMF, SMF, AUSF, UDM, NRF). CUPS architecture with local UPF break-out. |
| **gNodeB (CU-DU)** | WiSig Networks CU-DU | O-RAN compliant, managed via ONAP SDNR SMO over O1 / NETCONF. Exposes per-cell CQI, SNR, MCS, BLER, HARQ. |
| **Radio Unit (RU)** | VVDN Low Power RU | Split 7.2x fronthaul (M-Plane v7), Band n78 (3.5 GHz), 100 MHz bandwidth, 5G SA mode. |
| **Robot Doctor** | Raspberry Pi 5 + 5G Modem | Ingests sensor streams, performs local triage, receives tasks via `pollingChannel`, acts as physical middleware. |
| **Sensor Swarm** | ESP32 Sensor Nodes | Dumb nodes emitting telemetry; execute primitives: `1: restart`, `2: recalibrate`, `3: flush`, `4: reset radio`, `5: reboot`. |
| **MEC Edge Server** | Local Compute Server | Hosts local UPF, MEC-IPE, edge LLM (Ollama), and dual MN-CSEs. |

---

## 3. oneM2M Entity & Topology Design

We host **3 logical ACME CSE instances** [TS-0001, TR-0077]:

```
                     +----------------------------+
                     |    Central IN-CSE (:8080)  |
                     |     CSE-ID: /cse-in        |
                     +--------------+-------------+
                                    |
                    +---------------+---------------+
               Mcc  |                               |  Mcc
                    ▼                               ▼
       +-------------------------+    +-------------------------+
       |   MN-CSE District A     |    |   MN-CSE District B     |
       |       (:8081)           |    |       (:8082)           |
       +------------+------------+    +------------+------------+
                    | Mca                          | Mca
        +-----------+-----------+                  |
        |                       |                  |
        ▼                       ▼                  ▼
+---------------+       +---------------+  +---------------+
| Room 1 Nodes  |       | Room 2 Nodes  |  | Room 3 & 4    |
| (ESP32 AEs)   |       | (ESP32 AEs)   |  | (ESP32 AEs)   |
+---------------+       +---------------+  +---------------+
        ▲
        : (5G link)
+-------+-------+
|   RobotAE     |  (Hands over from District A -> District B as it moves)
| (Pi 5 + CPE)  |
+---------------+
```

### Resource Type (ty) Mapping in ACME
- **CSEBase (`ty=5`)**: `cse-in`, `DistrictA-MN-CSE`, `DistrictB-MN-CSE`.
- **RemoteCSE (`ty=16`)**: Represents neighbor CSEs across the Mcc reference point.
- **Application Entity (AE) (`ty=2`)**: `RobotAE`, `MissionAE`, `SensorAE-*`.
- **Container (`ty=3`) & ContentInstance (`ty=4`)**: Stream storage for `timeSeries`, `health`, `tasks`, `data`.
- **PollingChannel (`ty=15`)**: `<pollingChannel>/pcu` under `RobotAE` enabling the robot to receive asynchronous tasks behind 5G NAT without exposing a public IP [TS normative].
- **Access Control Policy (`ty=1`)**:
  - `acp-sensors-write`: Sensors have `acop: 3` (CREATE + RETRIEVE only).
  - `acp-robot-exec`: Robot has `acop: 63` (full execute and mgmtObj control).
  - `acp-llm-propose`: LLM has `acop: 35` (can CREATE proposal, but receives `4103 Forbidden` if it commands actuation).
  - `acp-operator-approve`: High-risk compound fixes require operator approval.

---

## 4. Standardization Contributions (ETSI TR-0077)

Bob Flynn explicitly confirmed that concrete implementations in these areas achieve **Expert-level proficiency**:

### A. Clause 7.1: Custom MEC-IPE Telemetry Architecture
Because our core does not expose formal MEC 012/013 REST endpoints, our **MEC-IPE**:
1. Connects to the WiSig CU-DU O1 interface and Niral Core stats socket.
2. Formats radio metrics (`rsrp`, `sinr`, `cqi`, `mcs`, `bler`) into a standard `<flexContainer>` specialization: `[custom:mecRadioInfo]`.
3. Pushes updates to the local MN-CSE. This provides the exact telemetry input required for handover triggers.

### B. Clause 7.2: Signal-Triggered Handover Callflow
- **The Problem**: TR-0077 clause 7.2 defines handover callflows between MN-CSEs, with an IN-CSE orchestrator actor that has not yet been implemented in the standard.
- **Our Implementation**:
  1. The robot moves from Room 2 (District A) toward Room 3 (District B).
  2. RSRP drops below threshold ($-105\text{ dBm}$) in MEC telemetry.
  3. The IN-CSE actor initiates handover: triggers `RobotAE` re-registration from `DistrictA-MN-CSE` to `DistrictB-MN-CSE`.
  4. Active subscriptions migrate, and the dashboard records the **interruption time ($\Delta t$)** at the AE application layer.

### C. Clause 7.4: Swarm Computing Resource Definitions
Clause 7.4 of TR-0077 is currently empty. We propose three concrete resource definitions:
1. `[swarmMembership]`: Tracks active nodes, battery levels, capabilities, and health states.
2. `[swarmTask]`: Encapsulates distributed remediation work items with state machine (`PROPOSED`, `ASSIGNED`, `EXECUTING`, `DONE`, `FAILED`).
3. `[swarmContext]`: Ambient environmental context shared across the robot and nodes.

### D. Clause 7.3: Federated Learning (FL) Lifecycle
- Custom FL lifecycle resources: `[flOperation]`, `[flRound]`, `[modelVersion]`.
- Trained anomaly detection head deployed back to edge nodes using oneM2M `[mgmtObj]` (software management).

---

## 5. Scoring Strategy & Rubric Priorities

Based on Bob Flynn's direct advice on how judges evaluate entries:

1. **Working Device Pipeline First**: Get the real Raspberry Pi and ESP32 nodes actively talking to ACME immediately so each feature can iterate independently.
2. **"Remove oneM2M and it breaks"**: Ensure every single decision, stream, and command passes through an oneM2M primitive (`CREATE`, `RETRIEVE`, `UPDATE`, `DELETE`, `NOTIFY`).
3. **High-Impact Video & Article**: Judges look for clean, understandable visualizations. The single-page Command Center dashboard directly satisfies this by showing:
   - Live ACME resource tree with flashing real-time active nodes.
   - 5G RSRP/SINR sparkline with $-105\text{ dBm}$ handover line.
   - Audit stream tracking LLM guardrail enforcement.
   - Real-time remediation timeline for each incident.

---

## 6. Action Items & Work Allocation

| Workstream | Lead | Deliverables & Status |
|---|---|---|
| **5G RAN & Core** | Lokabhiram | Metric stream (CQI/SNR from WiSig, RSRP/SINR from modem) integration into edge socket. |
| **MEC-IPE & oneM2M** | Likhith | `api/mec_ipe.py` mapping 5G metrics to ACME `[custom:mecRadioInfo]` flexContainers; multi-CSE topology running across ports 8080, 8081, 8082 with automated bootstrap (`api/bootstrap_acme.py`). **[COMPLETED]** |
| **Robot Doctor Agent** | Likhith / Team | `api/robot_agent.py` polling tasks from ACME `<pollingChannel>` (`/pcu`) and executing primitives; signal handover verified via `scripts/simulate_handover.py`. **[COMPLETED]** |
| **Verification & Testbed** | Team | `scripts/verify_system.py` with 17 automated checks and `api/test_multi_cse.py` test suite. **[COMPLETED]** |
| **Demo Recording & Report** | All | Prepare presentation slides and screen-record real-time anomaly detection &rarr; approval &rarr; handover. |
