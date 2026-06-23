# Workshop Kiosk

A Salesforce Lightning Web Component (LWC) kiosk application for Rio Tinto Rail wagon inspection workshops. Deployed on Salesforce Experience Cloud (LWR), it runs on locked-down iPads at workshop stations and provides field workers with a PIN-authenticated, touch-first interface to view work orders, log time, and record inspection measurements — without needing individual Salesforce logins.

---

## Use Case

Rail wagon maintenance workshops generate dozens of work orders per shift. Previously, workers had to share a supervisor's laptop or rely on paper-based sign-off. This kiosk replaces that workflow:

- A **supervisor** logs in with their Salesforce credentials to establish the kiosk station (Service Territory).
- **Workers** tap their roster tile and enter a 4-digit PIN to start a session.
- From their personal dashboard they can view assigned work orders, record inspection measurements and cause codes, start/stop time tracking, and sign off on tasks.
- At shift end, all time reports and inspection data are written back to Salesforce Field Service objects.

---

## Main Components

### Apex

| Class | Purpose |
|---|---|
| `KioskController.cls` | Core `@AuraEnabled` controller — supervisor auth, worker PIN validation, HMAC session tokens, work order queries, time tracking, measure point CRUD |
| `WorkpackPdfProcessor.cls` | Extracts structured data from PDF workpack attachments using Einstein GenAI prompt templates and populates work order fields automatically |
| `KioskAgentforceController.cls` | Bridges the kiosk chat LWC to the **Agentforce Agent API** (start/send/end session) via the `Agentforce_API` Named Credential; runs as the supervisor. Injects the current work order as context on every message, and extracts rich render-blocks from replies |
| `RenderBlocks.cls` | Extracts structured `agent-blocks` JSON from an agent reply (fenced block, else heuristic parse of markdown tables / activity lists) for the chat to render as charts/tables/timelines |
| `KioskBlocks.cls` | Builds the `agent-blocks` JSON for 8 chart/timeline/table visualizations from live data (work orders, measure points, wagon/wheelset assets, time reports) |
| `AgentAction*.cls` (×8) | Thin `@InvocableMethod` wrappers exposing each `KioskBlocks` visualization as an Agentforce action (one invocable per class is a Salesforce limit) |
| `WorkpackDemoGenerator.cls` | One-tap demo-data generator — creates a complete workpack hierarchy modeled on WO 00010070: new wagon Asset + 4 wheelsets + an axle per wheelset, root + child work orders, line items, and sample measure points. Token-guarded `@AuraEnabled`; all-or-nothing via Savepoint. Triggered from the supervisor dashboard button |

### Lightning Web Components

| Component | Role |
|---|---|
| `workshopPortal` | Root shell — owns session state machine (`BOOTING → SUPERVISOR_REQUIRED → ROSTER → LOGIN → DASHBOARD → WORK_ORDERS → WORK_ORDER_DETAIL → TIME_TRACKING`), idle timer, and barcode/badge scanner input |
| `kioskRoster` | Displays the shift roster; worker taps their tile to begin login |
| `kioskLogin` | PIN entry pad; calls `validateEmployee()` and stores the returned HMAC session token in memory |
| `kioskDashboard` | Worker home — shift summary, quick-action tiles |
| `kioskHeader` | Persistent top bar with station name, worker name, and idle countdown |
| `kioskSidebar` | Navigation rail for in-session screens |
| `workOrderCards` | Card-list view of assigned work orders for the current session |
| `workOrderDetail` | Full work order detail — inspection fields, cause/damage/delay codes, measure points |
| `workExecution` | Active task execution screen |
| `timeTrackingDashboard` | Start/stop time entries against work orders |
| `pdfAnnotator` | PDF.js-powered viewer for workpack documents |
| `agentforceChat` | Floating chat panel for the Agentforce assistant (runs as supervisor). Renders agent text + rich blocks; supports ↑/↓ prompt history (last 10) |
| `agentRichBlocks` | Renders structured `agent-blocks` from the agent — KPI cards, tables, timelines, charts (bar/line/pie/donut as inline SVG), calendar, image carousel |
| `processWorkpackButton` | Quick action button on Work Order record page to trigger workpack PDF processing |

> Screen flows launched from a work step run **inline** via the Aura `flowHost` component + the `FlowLauncher` Lightning Message Channel (no per-flow site page needed). The old iframe-based `flowModal` LWC was retired.

### GenAI Prompt Templates

| Template | Purpose |
|---|---|
| `Extract_Inspection_Components` | Extracts component names and measure points from workpack PDFs |
| `Purchase_Order_Parser` | Parses purchase order data from uploaded documents |
| `Work_Delay_Parser` | Identifies delay codes from free-text descriptions |
| `RS_SFS_Prework_Brief` | Pre-work briefing summary for field technicians |
| `RS_SFS_Maintainer_Work_Order_Brief` | Structured work order brief for maintainers |
| `WorkpackExtraction` | General workpack content extraction |

### Custom Metadata / Objects

- **`ServiceResource`** — extended with `Employee_Id__c`, `PIN_Hash__c`, `PIN_Salt__c`, `PIN_Failed_Count__c`, `PIN_Locked_Until__c`, `Role__c`
- **`ServiceTerritory`** — extended with `Kiosk_Notes__c`
- **`WorkOrder`** — extended with `Wagon_Number__c`, `SAP_FLOC_Desc__c`, `SAP_Work_Center__c`, `External_ID__c`, `Supervisor_Notes__c`, `Cause_Codes__c`, `Work_Delay_Codes__c`, `Damage_Codes__c`
- **`Time_Report__c`** — custom object for shift time entries
- **`Measure_Point__c`** — custom object for inspection measurements (temperature, pressure, width, etc.)

---

## Agentforce Assistant

An embedded chat assistant (the `agentforceChat` LWC) lets the supervisor converse with the **`Rio_Tinto_Shutdown_Agent`** ("Supervisor Agent") directly on the kiosk page. Because the supervisor is a real Salesforce user, the conversation runs in their context via the **Agent API** (employee agents have no Experience Cloud component, so the call is server-mediated from Apex).

**Flow:** `agentforceChat` → `KioskAgentforceController` (`startSession`/`sendMessage`/`endSession`) → callout via the `Agentforce_API` Named Credential (OAuth client-credentials, JWT) → Agent API → Supervisor Agent. The OAuth token never reaches the browser.

**Context:** the work order currently open is injected into every message (the user can switch orders mid-chat), so "this work order" resolves correctly.

**Rich graphical responses:** agent replies can carry a fenced ` ```agent-blocks {json} ``` ` block that the kiosk renders as KPI cards, tables, timelines, charts (bar/line/pie/donut), calendars, and carousels (`agentRichBlocks`). The agent's **Asset Insights** topic has 8 Apex actions (`KioskBlocks` + `AgentAction*` wrappers) that build these blocks from live data — e.g. *work orders by status*, *asset maintenance timeline*, *measure point graph*, *wagon condition by wheelset*, *time worked vs planned*, *measure-type distribution*, *cause/damage/delay codes*, *shift activity calendar*.

See `Workshop Files/Agentforce Kiosk - Setup Guide.md` (OAuth/Named-Credential setup + gotchas) and `Workshop Files/Agentforce Rich Blocks - Schema.md` (block JSON contract).

---

## Auth & Security

Session tokens are HMAC-SHA256 signed (`base64(workerId|territoryId|expiryMs|issuedAtMs|hmacSig)`), stored only in component memory (never persisted), with a 15-minute sliding TTL and an 8-hour absolute maximum. Every Apex method validates the token before executing. PINs are stored as `SALT||HMAC-SHA256` — never plaintext.

> **Note:** The HMAC key is currently hardcoded in `KioskController.cls`. It must be moved to `Kiosk_Setting__mdt` before production deployment.

---

## Commands

```bash
# Deploy all metadata
sf project deploy start -d force-app -o rsnov25demo

# Deploy a single component
sf project deploy start -d force-app/main/default/classes/KioskController.cls -o rsnov25demo
sf project deploy start -d force-app/main/default/lwc/workshopPortal -o rsnov25demo

# Run Apex tests
sf apex run test -n KioskControllerTest -r human -w 10 -o rsnov25demo

# LWC Jest tests
npm run test:unit
npm run test:unit:watch
npm run test:unit:coverage

# Lint
npm run lint
```

---

## Target Org

`rsnov25demo` — `ron@rsfieldnov25.demo` — API version 66.0
