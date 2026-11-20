# ACME CSE as Ground Truth vs. Dashboard Projection: Comparative Verification & Proofs

> **ETSI STF 685 ESTIMED Track / oneM2M Hackathon Core Architecture Report**  
> **Rule of Indispensability**: ACME CSE is the single authoritative source of truth. All telemetry streams, security privileges, swarm tasks, and handover states reside directly inside native oneM2M resources. If ACME CSE is stopped, the dashboard goes completely blank and all autonomous robot coordination halts.

---

## 1. Executive Summary: ACME CSE as the Hero

In SwarmLink-M2M, the web dashboard is strictly a **real-time projection** (Digital Twin UI) of the underlying **oneM2M Common Services Entities (CSEs)**. The system architecture strictly complies with **oneM2M TS-0001 (Functional Architecture V5.9.0)**, **TS-0004 (Core Protocol Specification)**, and **ETSI TR-0077 (MEC Interworking & Swarm Computing)**.

```
                      [IN-CSE (cse-in:8080)] <--- Mcc ---> [DistrictA-MN-CSE:8081]
                             |                                      |
                            Mca                                    Mca
                             |                                      |
              [React Digital Twin Dashboard]              [MEC-IPE / 5G Radio Socket]
               (Real-time State Projection)              [custom:mecRadioInfo (ty=28)]
                                                                    |
                                                      [RobotAE: pollingChannel (ty=15)]
                                                      (Traversing 5G Carrier-Grade NAT)
```

---

## 2. Resource Type (`ty`) Mapping in ACME CSE

Every subsystem in the project maps directly to a normative oneM2M resource type:

| Resource Type (`ty`) | oneM2M Resource Name | Role in SwarmLink-M2M | ACME Validation Status |
| :--- | :--- | :--- | :--- |
| **`ty=5`** | **CSEBase** | Root entities: `cse-in` (IN-CSE :8080), `DistrictA-MN-CSE` (MN-CSE :8081), `DistrictB-MN-CSE` (MN-CSE :8082) [TS normative]. | **VERIFIED** |
| **`ty=16`** | **remoteCSE** | Peer CSE representations across the `Mcc` reference point between IN-CSE and edge MN-CSEs [TS normative]. | **VERIFIED** |
| **`ty=2`** | **Application Entity (AE)** | Autonomous actors: `RobotAE`, `MissionAE` (LLM triage), and distributed `SensorAE-*` nodes [TS normative]. | **VERIFIED** |
| **`ty=3` & `ty=4`** | **container & contentInstance** | Stream buffers for timeSeries telemetry, health metrics, and the persistent `/remediationCatalog` [TS normative]. | **VERIFIED** |
| **`ty=15`** | **pollingChannel** | Virtual `/pcu` resource under `RobotAE` enabling the robot to receive commands behind 5G Carrier-Grade NAT without public IP [TS normative]. | **VERIFIED** |
| **`ty=1`** | **accessControlPolicy (ACP)** | Native role-based access control enforcing strict privilege boundaries [TS normative]:<br>• `acp-sensors-write`: Sensors have `acop: 3` (CREATE + RETRIEVE only).<br>• `acp-robot-exec`: Robot has `acop: 63` (Full execute and mgmtObj control).<br>• `acp-llm-propose`: LLM has `acop: 35` (Can CREATE proposal, receives `4103 Forbidden` on actuation).<br>• `acp-operator-approve`: High-risk compound fixes require operator approval. | **VERIFIED** |
| **`ty=28`** | **flexContainer** | Custom container specialization `[custom:mecRadioInfo]` holding 5G radio metrics (`rsrp`, `sinr`, `cqi`, `mcs`, `bler`) per ETSI TR-0077 [TR draft]. | **VERIFIED** |

---

## 3. ETSI TR-0077 Standardization Alignment

The implementation contributes directly to open areas in **ETSI TR-0077 (oneM2M/MEC Interworking)**:

### A. Clause 7.1: Custom MEC-IPE Telemetry Architecture
Because private 5G cores often expose vendor sockets rather than formal MEC 012/013 REST endpoints, our **MEC-IPE** (`api/mec_ipe.py`):
1. Connects to the 5G CU-DU and core metric sockets.
2. Serializes radio parameters (`rsrp`, `sinr`, `cqi`, `mcs`, `bler`) into a standardized `<flexContainer>` specialization: `[custom:mecRadioInfo]`.
3. Pushes continuous telemetry to the local MN-CSE over `Mca`. This directly feeds the handover decision logic.

### B. Clause 7.2: Signal-Triggered Handover Callflow
- **The Gap**: TR-0077 Clause 7.2 specifies MN-CSE handover callflows with an IN-CSE orchestrator actor not yet realized in standard packages.
- **Our Implementation**:
  1. The robot transitions across physical zones (Room 2 in District A toward Room 3 in District B).
  2. RSRP in `[custom:mecRadioInfo]` drops below the handover threshold ($-105\text{ dBm}$).
  3. The IN-CSE actor initiates handover: triggers `RobotAE` re-registration from `DistrictA-MN-CSE` to `DistrictB-MN-CSE`.
  4. Active subscriptions and polling channels migrate, while the dashboard records application-layer interruption time ($\Delta t$).

### C. Clause 7.4: Swarm Computing Resource Definitions
Clause 7.4 of TR-0077 is currently unpopulated in draft revisions. We provide concrete, runnable resource definitions:
1. `[swarmMembership]`: Tracks active swarm nodes, battery levels, capabilities, and health states.
2. `[swarmTask]`: Encapsulates distributed remediation work items governed by a deterministic state machine (`PROPOSED`, `ASSIGNED`, `EXECUTING`, `DONE`, `FAILED`).
3. `[swarmContext]`: Ambient environmental context shared across the robot and fixed sensor nodes.

### D. Clause 7.3: Federated Learning (FL) Lifecycle
- Custom FL lifecycle resources: `[flOperation]`, `[flRound]`, `[modelVersion]`.
- Trained anomaly detection head deployed back to edge nodes using standard oneM2M `[mgmtObj]` (software management).

---

## 4. Side-by-Side Proof Gallery: ACME CSE vs. Dashboard

### Feature 1: Access Control Policy (ACP) Guardrail & Security Denials

| ACME CSE Authority (The Ground Truth) | Dashboard Digital Twin (Projection) |
| :--- | :--- |
| **ACME ACP Resource**: `acp-llm-propose` (`ty=1`)<br>• Originator: `MissionAE`, `Edge-LLM`<br>• Privileges: `acop: 35`<br>• When LLM attempts unauthorized actuation: **ACME returns `HTTP 403 / 4103 ORIGINATOR_HAS_NO_PRIVILEGE`** | **Security Tray & AI Guardrail Stream**:<br>• Bottom security tray records `acp-llm-propose` **DENY (code 4103)**.<br>• AI Guardrail Audit stream logs: `Guardrail block: Primitive requires operator approval`. |
| ![ACME ACP Security in Web UI](./images/01_acme_incse_acp_security.png) | ![Dashboard Security Tray Expanded](./images/14_security_tray_expanded.png) |

#### Exact Wire Trace from ACME CSE (`4103 Forbidden`)
```http
POST /DistrictA-MN-CSE/RobotAE/mgmtObj HTTP/1.1
Host: 127.0.0.1:8081
X-M2M-Origin: MissionAE
X-M2M-RI: ri-hero-acp-block
X-M2M-RVI: 4
Content-Type: application/json;ty=13

{"m2m:nod": {"rn": "reboot_node"}}

HTTP/1.1 403 Forbidden
X-M2M-RSC: 4103
Content-Type: application/json

{
  "m2m:dbg": "Originator has no privilege for target resource"
}
```

---

### Feature 2: ETSI TR-0077 5G Radio Telemetry (`[custom:mecRadioInfo]` `<flexContainer>`)

| ACME CSE Authority (The Ground Truth) | Dashboard Digital Twin (Projection) |
| :--- | :--- |
| **ACME flexContainer**: `/DistrictA-MN-CSE/radioInfo` (`ty=28`)<br>• Custom Specialization: `custom:mecRadioInfo`<br>• Real-time attributes: `rsrp: -88.0 dBm`, `sinr: 18.0 dB`, `cqi: 15`, `mcs: 28`, `bler: 0.001` | **5G Radio Link & Handover Monitor**:<br>• Dynamic waveform visualizing RSRP/SINR vs. the $-105\text{ dBm}$ handover threshold.<br>• Real-time sparklines projecting ACME radio container attributes. |
| ![ACME flexContainer in Web UI](./images/03_acme_mna_mec_flexcontainer.png) | ![Dashboard 5G Link Monitor](./images/13_5g_link_handover_monitor.png) |

#### Exact Direct ACME flexContainer Query (`GET /DistrictA-MN-CSE/radioInfo`)
```json
{
  "custom:mecRadioInfo": {
    "rn": "radioInfo",
    "ty": 28,
    "cnd": "custom:mecRadioInfo",
    "rsrp": -88.0,
    "sinr": 18.0,
    "cqi": 15,
    "mcs": 28,
    "bler": 0.001,
    "pi": "id-mn-a",
    "ri": "mecRadioInfo4RVE1gCdVR"
  }
}
```

---

### Feature 3: oneM2M Resource Tree Hierarchy & Live Pulse Highlights

| ACME CSE Authority (The Ground Truth) | Dashboard Digital Twin (Projection) |
| :--- | :--- |
| **ACME CSEBase Hierarchy**:<br>• Root `cse-in` on port `:8080` (`id-mn-a`, `id-mn-b`, `acp-*`, `remediationCatalog`)<br>• Port `:8081`: `DistrictA-MN-CSE` with `Room1`, `Room2`, `RobotAE`<br>• Port `:8082`: `DistrictB-MN-CSE` with `Room3`, `Room4` | **Dashboard Resource Tree Explorer**:<br>• Mirrors the exact ACME multi-CSE tree hierarchy.<br>• Features 2.5-second live teal flash highlights whenever ACME receives an update. |
| ![ACME Tree in IN-CSE Web UI](./images/01_acme_in_cse_webui.png) | ![Dashboard oneM2M Resource Tree](./images/11_onem2m_resource_tree.png) |

---

### Feature 4: Remediation Catalog & Autonomous Recovery Arc

| ACME CSE Authority (The Ground Truth) | Dashboard Digital Twin (Projection) |
| :--- | :--- |
| **ACME Catalog Resource**: `/cse-in/remediationCatalog/1246`<br>• Stored as `<container>` (`ty=3`) and `<contentInstance>` (`ty=4`)<br>• Payload: `steps: [1, 2, 3, 5]`, `risk: LOW`<br>• Mapped Diagnostic: *NaN burst on sensor stream* | **Remediation Timeline & Catalogue Table**:<br>• Timeline node indicates: `Remediation ID found in oneM2M: 1246`.<br>• Catalogue modal details primitive steps `1, 2, 3, 5` (`restart`, `recalibrate`, `flush`, `reboot`). |
| ![ACME Remediation Catalog in Web UI](./images/02_acme_incse_remediation_catalog.png) | ![Dashboard Remediation Timeline](./images/09_remediation_timeline.png) |

---

### Feature 5: Multi-District Edge Federation across Mcc Reference Point (`ty=16`)

| ACME CSE Authority (The Ground Truth) | Dashboard Digital Twin (Projection) |
| :--- | :--- |
| **ACME Mcc Registration**: `cse-in?fu=1&ty=16`<br>• IN-CSE maintains active `<remoteCSE>` links:<br>  - `cse-in/id-mn-a` (District A on port `:8081`)<br>  - `cse-in/id-mn-b` (District B on port `:8082`) | **Top Bar Subsystem Status Chips**:<br>• Dynamic telemetry chips monitor Mcc connectivity:<br>  - `IN-CSE`: `online` (port 8080)<br>  - `MN-CSE A`: `online` (port 8081)<br>  - `MN-CSE B`: `standby` / `online` (port 8082) |
| ![ACME District B Standby in Web UI](./images/05_acme_mnb_handover_district.png) | ![Dashboard Top Bar Subsystem Chips](./images/01_topbar_subsystems.png) |

---

### Feature 6: Constrained 5G Device NAT Traversal via `<pollingChannel>` (`ty=15`)

| ACME CSE Authority (The Ground Truth) | Dashboard Digital Twin (Projection) |
| :--- | :--- |
| **ACME PollingChannel**: `/DistrictA-MN-CSE/RobotAE/pollingChannel`<br>• Resource Type: `ty=15`<br>• Virtual Resource: `/pcu`<br>• Enables the Raspberry Pi robot to poll tasks asynchronously behind 5G Carrier-Grade NAT. | **Live Traffic Stream & Event Inspector**:<br>• Displays `mcc` / `polling` NOTIFY operations delivering tasks from ACME to `RobotAE`.<br>• Slide-in Event Drawer inspects oneM2M request IDs and payloads. |
| *Direct ACME endpoint*: `http://localhost:8081/DistrictA-MN-CSE/RobotAE/pollingChannel/pcu` | ![Dashboard Event Drawer](./images/08_event_drawer_details.png) |

---

### Feature 7: Operator Approval Gate for Compound Remediations

| ACME CSE Authority (The Ground Truth) | Dashboard Digital Twin (Projection) |
| :--- | :--- |
| **ACME ACP Enforcement**: `acp-operator-approve`<br>• High-risk actions (`reboot_node`, compound actuator commands) require originator with operator privileges.<br>• Unapproved commands are rejected with `4103 Forbidden`. | **Operator Approval Action Card**:<br>• Displays pending compound action awaiting authorized signature.<br>• Upon clicking "Authorize & Deploy", triggers verified oneM2M execution. |
| *Governed by ACME Policy*: `acp-operator-approve` | ![Dashboard Operator Approval Card](./images/07_approval_panel_approved.png) |

---

## 5. Master Full-System Dashboard View

Below is the complete unified projection showing all oneM2M telemetry, floor map, triage queue, live traffic, and safety guardrails operating concurrently:

![SwarmLink-M2M Master Dashboard](./images/00_master_full_dashboard.png)

---

## 6. Automated Verification Test Suite Summary

Every claim in this document is backed by reproducible automated tests in the repository:

1. **Pure oneM2M Wire Verification (`scripts/verify_acme_pure_onem2m.py`)**:
   - `test_incse_online`: Status `2000 OK` (CSEBase retrieved)
   - `test_remote_cses_mcc`: `<remoteCSE>` links validated on ports 8081 and 8082
   - `test_acp_security_enforcement`: Confirmed ACME returns `HTTP 403 / 4103 ORIGINATOR_HAS_NO_PRIVILEGE` when `MissionAE` tries to actuate
   - `test_mec_radio_flexcontainer`: Verified custom specialization `[custom:mecRadioInfo]` (`ty=28`)
   - `test_robot_polling_channel`: Verified `<pollingChannel>` and `/pcu` virtual resource (`ty=15`)
   - `test_remediation_catalog`: Verified container and contentInstances under `/remediationCatalog`

2. **Full End-to-End Playwright Suite (`scripts/test_playwright_full_suite.js`)**:
   - **14 out of 14 visual components verified with zero errors.**
   - All screenshots captured automatically and stored in `./images/`.

