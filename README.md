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
| `flowModal` | Launches Salesforce Flows inside a modal overlay |
| `processWorkpackButton` | Quick action button on Work Order record page to trigger workpack PDF processing |

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
