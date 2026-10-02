# Workshop Kiosk

A Salesforce Lightning Web Component (LWC) kiosk application for Rio Tinto Rail wagon inspection workshops. Deployed on an Aura-based Salesforce Experience Cloud site, it runs on locked-down iPads at workshop stations and provides field workers with a PIN-authenticated, touch-first interface to view work orders, log time, and record inspection measurements — without needing individual Salesforce logins.

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

| Class                               | Purpose                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `KioskController.cls`               | Core `@AuraEnabled` controller — supervisor auth, worker PIN validation, HMAC session tokens, work order queries (worker-scoped or territory-wide), workpack progress KPI rollups, auto clock-in/out, parts consume/add, work step completion, time tracking, measure point CRUD                                              |
| `WorkpackPdfProcessor.cls`          | Extracts structured data from PDF workpack attachments using Einstein GenAI prompt templates and populates work order fields automatically                                                                                                                                                                                    |
| `KioskAgentforceController.cls`     | Bridges the kiosk chat LWC to the **Agentforce Agent API** (start/send/end session) via the `Agentforce_API` Named Credential; runs as the supervisor. Injects the current work order as context on every message, and extracts rich render-blocks from replies                                                               |
| `RenderBlocks.cls`                  | Extracts structured `agent-blocks` JSON from an agent reply (fenced block, else heuristic parse of markdown tables / activity lists) for the chat to render as charts/tables/timelines                                                                                                                                        |
| `KioskBlocks.cls`                   | Builds the `agent-blocks` JSON for 10 chart/timeline/table visualizations from live data (work orders, measure points, wagon/wheelset assets, time reports)                                                                                                                                                                   |
| `AgentAction*.cls` (×10)            | Thin `@InvocableMethod` wrappers exposing each `KioskBlocks` visualization as an Agentforce action (one invocable per class is a Salesforce limit)                                                                                                                                                                            |
| `WorkpackDemoGenerator.cls`         | One-tap demo-data generator — creates a complete workpack hierarchy modeled on WO 00010070: new wagon Asset + 4 wheelsets + an axle per wheelset, root + child work orders, line items, and sample measure points. Token-guarded `@AuraEnabled`; all-or-nothing via Savepoint. Triggered from the supervisor dashboard button |
| `InspectionChecklistController.cls` | `@AuraEnabled` controller for the Work Step quick-action checklist (standalone from the PIN-session kiosk) — resolves the WorkOrder from a WorkStep/WorkOrderLineItem, reads/writes `Measure_Point__c` rows (OK / Attention Required / Measure), bulk "mark OK", and photo attachments via `ContentVersion`                   |

### Lightning Web Components

| Component                      | Role                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workshopPortal`               | Root shell — owns session state machine (`BOOTING → SUPERVISOR_REQUIRED → ROSTER → LOGIN → DASHBOARD → WORK_ORDERS → WORK_ORDER_DETAIL → TIME_TRACKING`), idle timer, and barcode/badge scanner input                                                                                                                                                                                                                                       |
| `kioskRoster`                  | Displays the shift roster; worker taps their tile to begin login                                                                                                                                                                                                                                                                                                                                                                            |
| `kioskLogin`                   | PIN entry pad; calls `validateEmployee()` and stores the returned HMAC session token in memory                                                                                                                                                                                                                                                                                                                                              |
| `kioskDashboard`               | Worker home — shift summary, quick-action tiles                                                                                                                                                                                                                                                                                                                                                                                             |
| `kioskHeader`                  | Persistent top bar with station name, worker name, and idle countdown                                                                                                                                                                                                                                                                                                                                                                       |
| `kioskSidebar`                 | Navigation rail for in-session screens                                                                                                                                                                                                                                                                                                                                                                                                      |
| `workOrderCards`               | Work order list screen, defaulting to today ±3 days. Single-line filter bar: Status / Priority / Sort (WO Number, Status, Priority, Scheduled Time + asc/desc toggle), **Scope** switch (worker's own assignments → every work order scheduled in the kiosk's Service Territory), From/To dates, wagon/asset text search, and an org-wide workpack **Search**. Loads up to 50 work orders and shows a "Showing X of Y" note when more match |
| `workOrderCardList`            | Shared presentational list of full-width work order strip cards (wagon/asset, WO number + status, subject, chips, scheduled date/time). Used by `workOrderCards` and the **Child Work Orders** panel in `workOrderDetail`; emits `opendetail`                                                                                                                                                                                               |
| `workOrderDetail`              | Full work order detail — inspection fields, cause/damage/delay codes, measure points, and (for rail workpacks) a **Workpack Progress** panel with KPI rings for Steps/Measures/Labour/Parts/Parts Cost/Components + an Overall rollup                                                                                                                                                                                                       |
| `assetReview`                  | Asset-centric wagon/wheelset drill-down — work orders by category chip (repair/telematics/maintenance), work plan steps with a "Mark complete" action and per-plan progress ring, and a combined required+consumed parts table with "+ Consume" / "+ Add part" actions                                                                                                                                                                      |
| `workExecution`                | Active task execution screen                                                                                                                                                                                                                                                                                                                                                                                                                |
| `timeTrackingDashboard`        | Start/stop time entries against work orders                                                                                                                                                                                                                                                                                                                                                                                                 |
| `pdfAnnotator`                 | PDF.js-powered viewer for workpack documents                                                                                                                                                                                                                                                                                                                                                                                                |
| `agentforceChat`               | Floating chat panel for the Agentforce assistant (runs as supervisor). Renders agent text + rich blocks; supports ↑/↓ prompt history (last 10)                                                                                                                                                                                                                                                                                              |
| `agentRichBlocks`              | Renders structured `agent-blocks` from the agent — KPI cards, tables, timelines, charts (bar/line/pie/donut as inline SVG), calendar, image carousel                                                                                                                                                                                                                                                                                        |
| `processWorkpackButton`        | Quick action button on Work Order record page to trigger workpack PDF processing                                                                                                                                                                                                                                                                                                                                                            |
| `inspectionJobChecklist`       | Work Step record/screen action — standard Salesforce UI (not the PIN kiosk) for Field Service mobile. PNG instruction-image gallery + Measure Point capture/edit/photo-attach checklist, with per-row OK/Attention/Measure typing and bulk "mark OK"                                                                                                                                                                                        |
| `inspectionJobChecklistGlobal` | Thin wrapper exposing `inspectionJobChecklist` as a global publisher action; resolves `recordId` from navigation page-reference state when the global action context omits it                                                                                                                                                                                                                                                               |

> Screen flows launched from a work step run **inline** via the Aura `flowHost` component + the `FlowLauncher` Lightning Message Channel (no per-flow site page needed). The old iframe-based `flowModal` LWC was retired.

### GenAI Prompt Templates

| Template                             | Purpose                                                        |
| ------------------------------------ | -------------------------------------------------------------- |
| `Extract_Inspection_Components`      | Extracts component names and measure points from workpack PDFs |
| `Purchase_Order_Parser`              | Parses purchase order data from uploaded documents             |
| `Work_Delay_Parser`                  | Identifies delay codes from free-text descriptions             |
| `RS_SFS_Prework_Brief`               | Pre-work briefing summary for field technicians                |
| `RS_SFS_Maintainer_Work_Order_Brief` | Structured work order brief for maintainers                    |
| `WorkpackExtraction`                 | General workpack content extraction                            |

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

**Rich graphical responses:** agent replies can carry a fenced ` ```agent-blocks {json} ``` ` block that the kiosk renders as KPI cards, tables, timelines, charts (bar/line/pie/donut), calendars, and carousels (`agentRichBlocks`). The agent's **Asset Insights** topic has 10 Apex actions (`KioskBlocks` + `AgentAction*` wrappers) that build these blocks from live data — e.g. _work orders by status_, _asset maintenance timeline_, _measure point graph_, _wagon condition by wheelset_, _time worked vs planned_, _measure-type distribution_, _cause/damage/delay codes_, _shift activity calendar_, _measure explorer_, _work order images_.

See `Workshop Files/Agentforce Kiosk - Setup Guide.md` (OAuth/Named-Credential setup + gotchas) and `Workshop Files/Agentforce Rich Blocks - Schema.md` (block JSON contract).

---

## Auth & Security

Session tokens are HMAC-SHA256 signed (`base64(workerId|territoryId|expiryMs|issuedAtMs|hmacSig)`), stored only in component memory (never persisted), with a 15-minute sliding TTL and an 8-hour absolute maximum. Every Apex method validates the token before executing. PINs are stored as `SALT||HMAC-SHA256` — never plaintext.

> **Note:** The HMAC key is currently hardcoded in `KioskController.cls`. It must be moved to `Kiosk_Setting__mdt` before production deployment.

---

## Time Tracking (auto clock-in/out)

Workers don't need to manually clock in for most of a shift. Any data-writing action on a work order or asset (saving a measure point, consuming a part, marking a step complete, etc.) fires a `dataupdate` event that `workshopPortal` uses to open a `Time_Report__c` against the workpack's root work order if one isn't already open (`ensureClockedIn`). The kiosk header shows a live elapsed-time chip while clocked in.

The open time report is automatically closed (`autoClockOut`) when the worker switches to a different work order, switches user, or ends the session — so time is captured without requiring an explicit "Clock In" tap, while a manual **Clock Out** button remains available on the work order detail screen for ending a report early.

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

`rsnov25demo` — `ron@rsfieldnov25.demo` — API version 67.0
