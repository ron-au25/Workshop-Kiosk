# Workpack PDF Automation — Architecture & Deployment Guide

**Project:** Workshop Kiosk — Rio Tinto Rail Wagon Inspection  
**Org:** `rsnov25demo` (`ron@rsfieldnov25.demo`)  
**API Version:** 66.0  
**LWC Version:** v2.8  
**Last Updated:** 2026-05-25  
**CLI Version:** 2.135.7

---

## 1. Overview

This automation eliminates the manual re-entry of SAP maintenance data into Salesforce. When a supervisor attaches a SAP-generated PDF to a Rail Workpack work order, the system automatically:

1. Detects the attachment
2. Passes the PDF to Einstein AI Prompt Builder, which reads it natively
3. Receives structured JSON from the LLM describing each maintenance order
4. Creates child Work Orders, Work Order Line Items, and Measure Points from the extracted data

The process can also be triggered manually at any time using the **Process Workpack PDF** button on the Work Order page.

The entire process runs asynchronously in the background — the supervisor experiences no wait time and is not blocked by the AI call.

---

## 2. Architecture

### 2.1 High-Level Flow

There are **two entry paths** into the automation:

**Path A — PDF attachment (automatic)**
```
Supervisor attaches PDF to Rail Workpack WO
         │
         ▼
ContentDocumentLink AFTER INSERT
         │
         ▼
WorkpackPdfTrigger (Apex Trigger)
  ├─ Filter: LinkedEntityId starts with '0WO'
  ├─ SOQL: WorkOrder WHERE Id IN [...] → check WorkType.Name
  └─ Only Rail Workpack WOs proceed
         │
         ▼
WorkpackPdfProcessor.processPdf()  [@InvocableMethod]
  └─ System.enqueueJob(WorkpackQueueable)
```

**Path B — Quick Action button (manual / re-processing)**
```
User clicks "Process Workpack PDF" button on Work Order page
         │
         ▼
processWorkpackButton LWC
         │
         ▼
WorkpackPdfProcessor.processLatestPdf()  [@AuraEnabled]
  ├─ SOQL: most recent PDF ContentDocumentLink for the WO
  └─ Calls processPdf() → enqueueJob(WorkpackQueueable)
```

**Shared async path (both entry points)**
```
WorkpackQueueable.execute()  [Queueable + Database.AllowsCallouts]
  │
  ├─ SOQL ContentDocumentLink → ContentDocumentId
  │
  ├─ ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate()
  │    Template: WorkpackExtraction
  │    Input: ContentDocumentId  (Einstein reads the PDF natively)
  │    Model: GPT-4o Mini
  │
  ├─ Parse JSON response → ExtractionResult DTOs
  │
  ├─ SOQL WorkType WHERE Name = 'Wagon PM01'
  ├─ SOQL WorkOrder (parent) → ServiceTerritoryId
  │
  ├─ Database.upsert(childWorkOrders, External_ID__c)   ← idempotent
  │
  ├─ Delete existing WorkOrderLineItems for affected child WOs
  ├─ Delete existing Measure_Point__c for affected child WOs
  │
  ├─ Insert WorkOrderLineItems  (one per SAP operation)
  └─ Insert Measure_Point__c   (one per checklist item)
```

### 2.2 Component Map

```
force-app/main/default/
├── triggers/
│   └── WorkpackPdfTrigger.trigger          Entry point A — ContentDocumentLink after insert
├── classes/
│   ├── WorkpackPdfProcessor.cls            Core automation logic
│   └── WorkpackPdfProcessorTest.cls        Test suite (10 tests, 100% pass)
├── lwc/
│   └── processWorkpackButton/              Entry point B — Quick Action button LWC
├── quickActions/
│   └── WorkOrder.Process_Workpack_PDF      Quick Action definition
├── layouts/
│   └── WorkOrder-BHP Work Order Layout     Page layout with action in button bar
├── genAiPromptTemplates/
│   └── WorkpackExtraction                  Einstein Prompt Builder template
└── permissionsets/
    └── Workpack_Processor.permissionset    Access grants for the automation
```

### 2.3 Transaction Boundaries

The automation spans **two separate Apex transactions**:

| Transaction | What happens | Why |
|---|---|---|
| **T1** — Trigger or LWC context | CDL insert fires trigger (Path A), or user clicks button invoking `@AuraEnabled` method (Path B); `processPdf()` enqueues a Queueable job | Neither triggers nor Aura-context callouts can call Einstein directly |
| **T2** — Queueable context | ContentDocumentId resolved; Einstein LLM call; DML inserts for child records | Queueable implements `Database.AllowsCallouts`, enabling the Einstein API call |

---

## 3. Deployed Components

### 3.1 Apex Trigger — `WorkpackPdfTrigger`

**File:** `force-app/main/default/triggers/WorkpackPdfTrigger.trigger`  
**Object:** `ContentDocumentLink`  
**Event:** `after insert`

**Logic:**
- Iterates `Trigger.new`, filters to records where `LinkedEntityId` starts with `'0WO'` (WorkOrder key prefix) — skips CDLs attached to Cases, Accounts, etc. without any SOQL cost
- Queries matching WorkOrders to check `WorkType.Name = 'Rail Workpack'`
- For each qualifying WorkOrder, builds a `ProcessRequest` and calls `WorkpackPdfProcessor.processPdf()`

**Key design decision — prefix check before SOQL:**  
`ContentDocumentLink` fires for every file attached to any object. The `startsWith('0WO')` guard prevents a SOQL query running on every file upload across the entire org.

---

### 3.2 LWC Quick Action — `processWorkpackButton`

**Files:**
- `force-app/main/default/lwc/processWorkpackButton/`
- `force-app/main/default/quickActions/WorkOrder.Process_Workpack_PDF.quickAction-meta.xml`

**Appears as:** "Process Workpack PDF" button in the Work Order action bar

**Logic:**
- Calls `WorkpackPdfProcessor.processLatestPdf(workOrderId)` via `@AuraEnabled`
- Displays a success toast and closes the action panel when the job is enqueued
- Displays a sticky error toast if no PDF is attached to the WO, or if another error occurs
- Shows a spinner while the Apex call is in flight

**`processLatestPdf` method:**
- Queries the most recent PDF `ContentDocumentLink` on the given WorkOrder
- Throws `AuraHandledException` if no PDF is found (surfaces as the error toast)
- Delegates to `processPdf()` which enqueues the Queueable

**Page layout:** The action is included in `WorkOrder-BHP Work Order Layout`. To add it to other layouts, go to Setup → Object Manager → Work Order → Page Layouts → add "Process Workpack PDF" to the Salesforce Mobile and Lightning Actions section.

---

### 3.3 Apex Class — `WorkpackPdfProcessor`

**File:** `force-app/main/default/classes/WorkpackPdfProcessor.cls`  
**Access:** `public with sharing`

#### Inner Types

| Type | Purpose |
|---|---|
| `ProcessRequest` | `@InvocableVariable` container for trigger → processor handoff |
| `WorkpackQueueable` | Implements `Queueable, Database.AllowsCallouts` — runs the async job |
| `ExtractionResult` | Deserializes root JSON object from LLM response |
| `OrderDTO` | One maintenance order from the LLM response |
| `OperationDTO` | One operation (table row) within an order |
| `WorkpackProcessorException` | Custom exception for fatal errors |

#### Method Reference

| Method | Visibility | Description |
|---|---|---|
| `processPdf(List<ProcessRequest>)` | `@InvocableMethod` public | Enqueues one Queueable per request |
| `processLatestPdf(Id workOrderId)` | `@AuraEnabled` public | Finds most recent PDF CDL and calls `processPdf()` — used by Quick Action |
| `WorkpackQueueable.execute(QueueableContext)` | public | Calls `runProcessing()`, catches all exceptions |
| `runProcessing(Id cdlId, Id parentWoId)` | `@TestVisible` private static | Full extraction and record creation pipeline |
| `callPromptBuilder(Id contentDocumentId)` | private static | `ConnectApi.EinsteinLLM` call — passes ContentDocumentId to Einstein |
| `parseSapDate(String)` | `@TestVisible` private static | Parses `"DD.MM.YYYY"` → `Date` |
| `parseDuration(String)` | `@TestVisible` private static | Parses `"1,5 H"` → `Decimal` hours |

#### `runProcessing` — Step-by-Step

```
Step 1  SOQL: ContentDocumentLink → ContentDocumentId
Step 2  callPromptBuilder(ContentDocumentId) → rawJson
         (Einstein reads the PDF natively via ConnectApi.EinsteinLLM)
Step 3  JSON.deserialize(rawJson, ExtractionResult.class)
Step 4  Guard: if no orders extracted → return early
Step 5  SOQL: WorkType WHERE Name='Wagon PM01' → Id  (throws if missing)
Step 6  SOQL: WorkOrder (parent) → ServiceTerritoryId
Step 7  Build List<WorkOrder>, set ParentWorkOrderId, WorkTypeId, Subject,
        Description, SAP_FLOC_Desc__c, SAP_Work_Center__c, External_ID__c,
        StartDate, ServiceTerritoryId
Step 8  Database.upsert(childWos, WorkOrder.External_ID__c, false)
Step 9  Re-query child WOs by External_ID__c → Map<String, Id>
Step 10 Delete existing WorkOrderLineItems WHERE WorkOrderId IN [child WO Ids]
Step 11 Delete existing Measure_Point__c WHERE Work_Order__c IN [child WO Ids]
Step 12 Build WorkOrderLineItems: Subject=operation_number, Description=task_description,
        Duration=parseDuration(duration)
Step 13 Build Measure_Point__c: Component_Name__c=checklist item (255 char cap),
        Comments__c=full text if >255, Measure_Type__c='OK'
Step 14 Bulk insert WorkOrderLineItems
Step 15 Bulk insert Measure_Point__c
```

#### Einstein API Call

```apex
ConnectApi.EinsteinPromptTemplateGenerationsInput promptInput = ...;

ConnectApi.WrappedValue fileInput = new ConnectApi.WrappedValue();
fileInput.value = new Map<String, String>{
    'id'   => contentDocumentId,
    'type' => 'ContentDocument'
};
promptInput.inputParams = new Map<String, ConnectApi.WrappedValue>{
    'Input:pdfFile' => fileInput
};

ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
    'WorkpackExtraction', promptInput
);
```

The class also strips markdown code fences (` ```json `) defensively, in case the model wraps output despite the prompt instructions.

#### Idempotency Design

The same PDF can be re-processed without creating duplicate records:
- **Child WorkOrders** — upserted on `WorkOrder.External_ID__c` (the SAP order number). If the order already exists under the same parent, it is updated in place.
- **WorkOrderLineItems and Measure Points** — have no natural external key, so the pattern is delete-then-recreate. All WOLIs and MPs belonging to affected child WOs are deleted before the new batch is inserted. This ensures re-runs produce exactly the same set of records as the first run.

#### Error Handling

The `WorkpackQueueable.execute()` wraps the entire pipeline in a try/catch. Exceptions are logged to the debug log and do not rethrow, which prevents the Queueable from entering a permanent failure state. Errors are visible in **Setup → Apex Jobs** under the failed job's error message, and in the org's debug logs.

Fatal conditions that cause the pipeline to throw `WorkpackProcessorException`:
- WorkType `'Wagon PM01'` not found in org
- Einstein API returns an error

---

### 3.4 GenAI Prompt Template — `WorkpackExtraction`

**File:** `force-app/main/default/genAiPromptTemplates/WorkpackExtraction.genAiPromptTemplate-meta.xml`  
**Developer Name:** `WorkpackExtraction`  
**Type:** `einstein_gpt__flex`  
**Model:** `sfdc_ai__DefaultOpenAIGPT4OmniMini` (GPT-4o Mini via Salesforce Einstein)  
**Visibility:** Global  
**Status:** Published

#### Input Variable

| API Name | Type | Merge Field | Required |
|---|---|---|---|
| `pdfFile` | `SOBJECT://ContentDocument` | `{!$Input:pdfFile}` | Yes |

Einstein resolves the ContentDocument and processes the PDF file natively — there is no blob-to-string conversion and no Apex heap limit concern.

#### Prompt Strategy

The prompt instructs the model to:

1. **Extract ALL orders** — scan the entire document; do not stop after the first order
2. **Identify maintenance order blocks** — look for "MAINTENANCE ORDER [number]" headers and associated metadata fields (description, long text description, functional location, order type, planner group, start date)
3. **Extract operations table rows** — OpNo, WorkCtr, task description, duration, notification number
4. **Extract inspection checklists** — reassemble fragmented checkbox text and bulleted defect lists into single continuous strings
5. **Return only raw JSON** — no markdown fences, no preamble — matching the schema exactly

#### JSON Schema Produced by the Model

```json
{
  "maintenance_orders": [
    {
      "order_number": "115407468",
      "order_description": "Wagon Supply Reservoir STAT Insp",
      "order_long_text": "Full long text description of the maintenance order...",
      "functional_location": "3076WAG20020 .ABRK.ARSR Air Receiver: Supply Reservoir",
      "order_type": "PM01",
      "planner_group": "RW1",
      "start_date": "20.04.2026",
      "operations": [
        {
          "operation_number": "0010",
          "work_center": "RMW",
          "task_description": "6Y Wagon Supply Reservoir Ext STAT Insp",
          "duration": "0,0 H",
          "notification_number": "72170093"
        }
      ],
      "checklist_items": [
        "Record the serial number of Supply Reservoir (SR) pressure vessel.",
        "Conduct a close visual inspection of the external surface coating/paintwork..."
      ]
    }
  ]
}
```

---

### 3.5 Permission Set — `Workpack_Processor`

**File:** `force-app/main/default/permissionsets/Workpack_Processor.permissionset-meta.xml`

| Object | Create | Edit | Delete | Read |
|---|---|---|---|---|
| `WorkOrder` | ✓ | ✓ | ✓ | ✓ |
| `WorkOrderLineItem` | ✓ | ✓ | ✓ | ✓ |
| `Measure_Point__c` | ✓ | ✓ | ✓ | ✓ |
| `ContentDocumentLink` | — | — | — | ✓ |
| `ContentVersion` | — | — | — | ✓ |
| `WorkType` | — | — | — | ✓ |
| `WorkpackPdfProcessor` (Apex) | enabled | | | |

**Field-level write access:**

| Object | Fields |
|---|---|
| `WorkOrder` | `External_ID__c`, `SAP_FLOC_Desc__c`, `SAP_Work_Center__c` |
| `WorkOrderLineItem` | `Subject`, `Description`, `Duration` |
| `Measure_Point__c` | `Work_Order__c`, `Component_Name__c`, `Measure_Type__c`, `Comments__c` |

> **Important:** This permission set must be assigned to the **Automated Process** system user (or any integration user context that will own the trigger execution) to allow the Queueable to perform DML on behalf of that context.

---

## 4. Data Model

### 4.1 Record Hierarchy

```
WorkOrder  [WorkType = "Rail Workpack"]  ← Parent Workpack
  │
  ├── ContentDocumentLink ──► ContentDocument / ContentVersion
  │       (PDF attachment — triggers the automation)
  │
  └── WorkOrder  [WorkType = "Wagon PM01"]  ← Child (one per SAP order)
        │   Subject      = order_description
        │   Description  = order_long_text
        │
        ├── WorkOrderLineItem  (one per SAP operation row)
        │     Subject      = SAP OpNo        (e.g. "0010")
        │     Description  = Task description
        │     Duration     = Hours (Decimal)
        │
        └── Measure_Point__c  (one per checklist item)
              Work_Order__c       = this child WO
              Component_Name__c   = checklist text (max 255 chars)
              Comments__c         = full text if > 255 chars
              Measure_Type__c     = "OK"  (default; worker updates during inspection)
```

### 4.2 Field Mapping — JSON → Salesforce

#### WorkOrder (child)

| JSON Field | Salesforce Field | Notes |
|---|---|---|
| `order_number` | `External_ID__c` | Upsert key — prevents duplicates |
| `order_description` | `Subject` | Short description / title |
| `order_long_text` | `Description` | Full long text description |
| `functional_location` | `SAP_FLOC_Desc__c` | SAP equipment path |
| `planner_group` | `SAP_Work_Center__c` | e.g. "RW1" |
| `start_date` | `StartDate` | Parsed from "DD.MM.YYYY" |
| *(hardcoded)* | `WorkTypeId` | Looked up: `WorkType.Name = 'Wagon PM01'` |
| *(from parent)* | `ParentWorkOrderId` | Rail Workpack WO Id |
| *(from parent)* | `ServiceTerritoryId` | Inherited from parent WO |

#### WorkOrderLineItem

| JSON Field | Salesforce Field | Notes |
|---|---|---|
| `operation_number` | `Subject` | e.g. "0010" |
| `task_description` | `Description` | |
| `duration` | `Duration` | Parsed from "1,5 H" → `1.5` (Decimal hours) |

#### Measure_Point__c

| JSON Field | Salesforce Field | Notes |
|---|---|---|
| checklist item text | `Component_Name__c` | Truncated to 255 chars if needed |
| checklist item text | `Comments__c` | Full text stored here if > 255 chars |
| *(hardcoded)* | `Measure_Type__c` | `"OK"` — updated by worker during inspection |

### 4.3 Existing Custom Fields Used

The following custom fields on `WorkOrder` were already present in the org (not created by this deployment):

| Field | Type | Usage |
|---|---|---|
| `External_ID__c` | Text(50), External ID, Unique | SAP order number — upsert key |
| `SAP_FLOC_Desc__c` | Text | SAP Functional Location description |
| `SAP_Work_Center__c` | Text | SAP planner group / work center |
| `Wagon_Number__c` | Text(20) | Not populated by this automation; used elsewhere |
| `Supervisor_Notes__c` | Long Text | Not populated by this automation |

No new custom fields or custom objects were added by this deployment.

---

## 5. Prerequisites

The following must exist in the org before the automation can successfully run:

| Requirement | How to verify |
|---|---|
| `WorkType` record named `"Rail Workpack"` | `SELECT Id FROM WorkType WHERE Name = 'Rail Workpack'` |
| `WorkType` record named `"Wagon PM01"` | `SELECT Id FROM WorkType WHERE Name = 'Wagon PM01'` |
| Einstein Generative AI enabled | Setup → Einstein → Settings → turn on "Einstein" |
| Einstein model connection configured | Setup → Einstein → Settings → "Model Connections" — at least one active model |
| Prompt Builder feature licensed | Setup → Einstein → Prompt Builder (should load without error) |
| `WorkpackExtraction` template Published | Setup → Einstein → Prompt Builder → "Workpack Extraction" |
| `Workpack_Processor` permission set assigned | Setup → Users → [user] → Permission Set Assignments |

### PDF Compatibility

Einstein processes the PDF **natively via `ContentDocumentId`** — the Apex code never reads the PDF blob into memory. This approach:
- Has no Apex heap limit concern (no `Blob.toString()` involved)
- Works for text-layer PDFs that SAP generates when printing to PDF
- Requires Einstein Generative AI to be enabled in the org (see Prerequisites above)

It does **not** work for:
- Scanned/image PDFs (no embedded text layer)
- Password-protected PDFs

SAP-generated maintenance order printouts are text-layer PDFs and are fully compatible.

---

## 6. Testing

### 6.1 Test Class — `WorkpackPdfProcessorTest`

**Pattern:** `@IsTest(SeeAllData=true)` — queries live org data rather than creating synthetic test data, consistent with `KioskControllerTest.cls`. This is required because inserting `ServiceTerritoryMember` records is blocked by an org-level Flow trigger.

**LLM Mock:** The `callPromptBuilder()` method checks `Test.isRunningTest() && mockLlmResponse != null` and short-circuits to return the static mock string. This is set in tests via `WorkpackPdfProcessor.mockLlmResponse = TEST_JSON`.

**Test Coverage (10 tests, 100% pass rate):**

| Test | Type | What it verifies |
|---|---|---|
| `testParseSapDate_validDate` | Unit | "20.04.2026" → Date(2026, 4, 20) |
| `testParseSapDate_null` | Unit | null input → null output |
| `testParseSapDate_invalidFormat` | Unit | ISO format rejected → null |
| `testParseDuration_standard` | Unit | "1,5 H" → 1.5 |
| `testParseDuration_zero` | Unit | "0,0 H" → 0.0 |
| `testParseDuration_blank` | Unit | "" → 0 |
| `testParseDuration_dotSeparator` | Unit | "2.5 H" → 2.5 (dot already valid) |
| `testRunProcessing_createsChildWorkOrders` | Integration | Full pipeline: 1 child WO, 2 WOLIs, 2 MPs with correct field values |
| `testRunProcessing_idempotent` | Integration | Running twice produces 1 child WO, 2 WOLIs, 2 MPs (no duplicates) |
| `testRunProcessing_emptyExtraction_doesNotThrow` | Integration | Empty `maintenance_orders` array → no records created, no exception |

### 6.2 Running Tests

```bash
sf apex run test -n WorkpackPdfProcessorTest -r human -w 60 -o rsnov25demo
```

### 6.3 End-to-End Verification — Path A (PDF attachment)

1. Open any WorkOrder with `WorkType.Name = 'Rail Workpack'` in the org
2. Go to the **Files** related list and attach a SAP maintenance PDF (e.g. `B20020-TAG-47-RD-86.pdf`)
3. Navigate to **Setup → Apex Jobs** — a job with class name `WorkpackPdfProcessor.WorkpackQueueable` should appear with status `Queued` then `Completed`
4. Query for results:
   ```sql
   SELECT Id, Subject, Description, External_ID__c, SAP_FLOC_Desc__c
   FROM WorkOrder
   WHERE ParentWorkOrderId = '<workpack id>'
   ```
5. Query line items and measure points:
   ```sql
   SELECT Subject, Description, Duration
   FROM WorkOrderLineItem
   WHERE WorkOrderId IN (
     SELECT Id FROM WorkOrder WHERE ParentWorkOrderId = '<workpack id>'
   )

   SELECT Component_Name__c, Measure_Type__c, Comments__c
   FROM Measure_Point__c
   WHERE Work_Order__c IN (
     SELECT Id FROM WorkOrder WHERE ParentWorkOrderId = '<workpack id>'
   )
   ```
6. **Re-run test:** attach the same PDF again. Confirm child WO count stays the same.

### 6.4 End-to-End Verification — Path B (Quick Action button)

1. Open a Rail Workpack WorkOrder with a PDF already attached
2. Click the **Process Workpack PDF** button in the action bar
3. A success toast confirms the job has been enqueued; the panel closes automatically
4. Monitor **Setup → Apex Jobs** and query results as in steps 3–5 above
5. Click the button again — confirm child WO count stays the same (idempotent)

---

## 7. Operational Guide

### 7.1 Monitoring

| What to check | Where |
|---|---|
| Queued / running jobs | Setup → Apex Jobs |
| Failed job errors | Setup → Apex Jobs → click the failed job's Error row |
| Debug logs | Setup → Debug Logs → trace the Automated Process user |

### 7.2 Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| No Queueable job appears after attaching PDF | Trigger not firing, or WorkType is not `'Rail Workpack'` | Verify `WorkOrder.WorkType.Name` equals `'Rail Workpack'` exactly (case-sensitive) |
| Button shows error "No PDF file found" | No PDF attached to this Work Order yet | Attach a SAP PDF via the Files related list first |
| Button not visible on Work Order page | Action not in the page layout assigned to your profile | Setup → Object Manager → Work Order → Page Layouts → add "Process Workpack PDF" to Lightning Actions |
| Job appears but fails immediately | `WorkType "Wagon PM01" not found in org` | Create a WorkType record named `'Wagon PM01'` |
| Job fails with Einstein error | Einstein Generative AI not enabled in org, or model connection not configured | See Einstein org setup below |
| Child WOs created but no WOLIs or MPs | LLM returned empty `operations` and `checklist_items` arrays | Test the template manually in Prompt Builder with a sample PDF |
| Wrong number of child WOs | LLM missed sections of the PDF | Review the PDF in Prompt Builder preview; adjust prompt if needed |
| Job completes but zero records created | `maintenance_orders` array was empty in LLM response | Check debug log for the raw JSON (`WorkpackExtraction raw response:` line) |

#### Einstein Error — Org Setup Required

If the Queueable fails with an Einstein-related error:

1. **Setup → Einstein → Settings** — ensure "Einstein" toggle is **On**
2. **Setup → Einstein → Settings → Model Connections** — verify at least one connection is active (e.g. `sfdc_ai__DefaultOpenAIGPT4OmniMini`)
3. **Setup → Einstein → Prompt Builder** — open the `WorkpackExtraction` template and confirm **Status = Published**
4. Use the **Generate Preview** button in Prompt Builder to test the template with a sample ContentDocument — if this works, the full pipeline will work

If the model connections tab is missing or the Einstein menu is absent from Setup, the org may not have the Einstein Generative AI add-on licensed.

### 7.3 Re-processing a PDF

**Option A — Re-attach the PDF:**  
Detach the PDF from the WorkOrder and re-attach it. `WorkpackPdfTrigger` fires automatically.

**Option B — Use the Quick Action button (recommended):**  
Click **Process Workpack PDF** on the Work Order page. No need to touch the Files list. The button always uses the most recently attached PDF.

Both options are fully idempotent: existing child WOs are updated in place (upsert on `External_ID__c`), and their WOLIs and MPs are deleted and recreated.

### 7.4 Updating the Prompt Template

The `WorkpackExtraction` template can be edited directly in **Setup → Einstein → Prompt Builder** without redeployment. Changes take effect on the next processing run. After editing:
1. Use the **Generate Preview** button in Prompt Builder with a sample ContentDocument to verify the output JSON still matches the expected schema
2. Confirm the `maintenance_orders` key is at the root level and all required fields are present

To deploy template changes via source control:
```bash
sf project deploy start \
  -d force-app/main/default/genAiPromptTemplates/WorkpackExtraction.genAiPromptTemplate-meta.xml \
  -o rsnov25demo
```

---

## 8. Deployment Reference

### 8.1 Files Deployed

| File | Metadata Type | Description |
|---|---|---|
| `triggers/WorkpackPdfTrigger.trigger` | ApexTrigger | Entry point A — ContentDocumentLink after insert |
| `triggers/WorkpackPdfTrigger.trigger-meta.xml` | — | API version 66.0 |
| `classes/WorkpackPdfProcessor.cls` | ApexClass | Core processing logic |
| `classes/WorkpackPdfProcessor.cls-meta.xml` | — | API version 66.0 |
| `classes/WorkpackPdfProcessorTest.cls` | ApexClass | Test suite |
| `classes/WorkpackPdfProcessorTest.cls-meta.xml` | — | API version 66.0 |
| `lwc/processWorkpackButton/` | LightningComponentBundle | Quick Action button LWC |
| `quickActions/WorkOrder.Process_Workpack_PDF.quickAction-meta.xml` | QuickAction | Quick Action definition |
| `layouts/WorkOrder-BHP Work Order Layout.layout-meta.xml` | Layout | Page layout with action in button bar |
| `genAiPromptTemplates/WorkpackExtraction.genAiPromptTemplate-meta.xml` | GenAiPromptTemplate | Einstein Prompt Builder template |
| `permissionsets/Workpack_Processor.permissionset-meta.xml` | PermissionSet | Object and field access grants |

**Also modified as part of Kiosk UI update (see Section 10):** `KioskController.cls`, `workOrderDetail` LWC, `workshopPortal` LWC.

### 8.2 Deployment Commands

```bash
# Deploy all components
sf project deploy start \
  -d force-app/main/default/triggers/WorkpackPdfTrigger.trigger \
  -d force-app/main/default/classes/WorkpackPdfProcessor.cls \
  -d force-app/main/default/classes/WorkpackPdfProcessorTest.cls \
  -d force-app/main/default/lwc/processWorkpackButton \
  -d force-app/main/default/quickActions/WorkOrder.Process_Workpack_PDF.quickAction-meta.xml \
  -d "force-app/main/default/layouts/WorkOrder-BHP Work Order Layout.layout-meta.xml" \
  -d force-app/main/default/genAiPromptTemplates/WorkpackExtraction.genAiPromptTemplate-meta.xml \
  -d force-app/main/default/permissionsets/Workpack_Processor.permissionset-meta.xml \
  -o rsnov25demo

# Run tests after deployment
sf apex run test -n WorkpackPdfProcessorTest -r human -w 60 -o rsnov25demo

# Deploy a single component (e.g. after prompt update)
sf project deploy start \
  -d force-app/main/default/genAiPromptTemplates/WorkpackExtraction.genAiPromptTemplate-meta.xml \
  -o rsnov25demo
```

### 8.3 Deployment Order (for fresh org)

If deploying to a new org, order matters due to compile-time dependencies:

1. Ensure WorkType records `'Rail Workpack'` and `'Wagon PM01'` exist
2. Enable Einstein Generative AI and configure model connections in Setup
3. Deploy `WorkpackPdfProcessor.cls` (trigger and LWC depend on this)
4. Deploy `WorkpackPdfTrigger.trigger`
5. Deploy `processWorkpackButton` LWC
6. Deploy `WorkOrder.Process_Workpack_PDF` Quick Action
7. Deploy `WorkpackExtraction.genAiPromptTemplate-meta.xml`
8. Deploy `WorkpackPdfProcessorTest.cls`
9. Deploy `Workpack_Processor.permissionset-meta.xml`
10. Deploy the page layout to add the button to the action bar
11. Assign the permission set to the Automated Process user
12. Run tests to confirm

---

## 9. Design Decisions & Constraints

| Decision | Rationale |
|---|---|
| **Apex Trigger, not Record-Triggered Flow** | `ContentDocumentLink` cannot trigger Record-Triggered Flows in Salesforce — a platform constraint discovered during deployment |
| **LWC Quick Action button, not field-based trigger** | Replaced the earlier `SAP_Work_Center__c = 'Generate'` trigger pattern with a proper UI button — cleaner UX, no field pollution, self-explanatory to users |
| **Queueable, not @future** | Queueable supports `Database.AllowsCallouts`, can be chained, and has better governor limit allocation than `@future`. The `@InvocableMethod` and `@AuraEnabled` methods both enqueue the Queueable to satisfy the callout restriction |
| **ConnectApi.EinsteinLLM, not REST API** | `ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate()` with `WrappedValue` correctly passes `ContentDocument` typed inputs to the prompt template. The raw REST endpoint (`/einstein/prompt-templates/.../generations`) returns HTTP 400 for `SOBJECT` type inputs — it does not support the same file handling as the ConnectApi path |
| **ContentDocumentId passed natively to Einstein** | SAP PDFs can be 7+ MB. `Blob.toString()` on a ContentVersion blob would exceed Apex's 6 MB string heap limit. Passing `ContentDocumentId` to Einstein avoids blob reading entirely — Einstein fetches and parses the PDF server-side |
| **Upsert on `External_ID__c`** | SAP order numbers are stable identifiers. Upserting on this field means re-processing the same PDF updates existing child WOs rather than creating duplicates |
| **Delete + re-insert for WOLIs and MPs** | WorkOrderLineItem and Measure_Point__c have no external ID field. The delete-then-insert pattern is the safest re-run strategy and produces deterministic results |
| **`@IsTest(SeeAllData=true)`** | Consistent with the existing `KioskControllerTest.cls` pattern. An org-level Flow trigger blocks `ServiceTerritoryMember` inserts in test context, making synthetic test data creation unreliable |
| **No new custom fields** | All required fields (`External_ID__c`, `SAP_FLOC_Desc__c`, `SAP_Work_Center__c`, `WorkOrderLineItem.Subject/Description/Duration`, `WorkOrder.Description`) already existed in the org |

---

## 10. Kiosk UI — Rail Workpack Work Order View

This section describes the Workshop Kiosk portal changes made to support the Rail Workpack work order type and child work order navigation.

### 10.1 Overview

The kiosk portal (`workshopPortal` LWC) renders the `workOrderDetail` component when a user opens a work order. Work orders with `WorkType.Name = 'Rail Workpack'` have a distinct layout — they act as a container for child work orders generated by the PDF automation and do not have their own time tracking or work execution tasks.

### 10.2 Work Order Detail — Conditional Rendering

The `workOrderDetail` LWC detects the work type via `detail.workTypeName` and renders two different layouts:

**Rail Workpack layout (`isRailWorkpack = true`):**
- Hides Time Tracking, Work Execution, and Notes & Codes sections
- Shows a grid of child work order cards (same card style as the main work order list)
- Each card displays: wagon number, WO number, subject, work type, SAP work center, FLOC description, external ID (SAP order number), status, duration
- Empty state message: *"No child work orders yet. Use the 'Process Workpack PDF' button to generate them."*

**Standard work order layout (`isRailWorkpack = false`):**
- Time Tracking (clock in / clock out)
- Work Execution button
- Time History
- Notes & Codes (supervisor notes, cause/delay/damage codes)
- Right sidebar: **Operations** section (WorkOrderLineItems) above Work Plans

**Both layouts show:**
- Work order description (`WorkOrder.Description`) below the subject/chips in the header card
- SAP Work Center, FLOC Description, External ID, and Planned Duration metadata

### 10.3 Child Work Order Navigation

**Opening a child work order:**
- Clicking a child card dispatches `opendetail` with `{ workOrderId: childId }`
- `workshopPortal` listens for `onopendetail` on `c-work-order-detail` and updates `selectedWorkOrderId`
- Because `c-work-order-detail` stays in the DOM (state remains `WORK_ORDER_DETAIL`), the `workOrderId` prop is a getter/setter — changing it calls `loadDetail()` to refresh the view

**Back navigation from a child work order:**
- If `detail.parentWorkOrderId` is set, the back button reads `‹ WO-XXXXX` (parent WO number)
- Clicking back dispatches `opendetail` with `{ workOrderId: parentWorkOrderId }`, navigating back to the Rail Workpack view
- If no parent exists (standard WO), the back button reads `‹ Work Orders` and dispatches `back` as before

**Breadcrumb context:**
- When viewing a child WO, the top bar shows the parent WO number and subject as a breadcrumb: `WO-XXXXX › Rail Workpack Subject`

### 10.4 Apex Changes — `KioskController.getWorkOrderDetail`

The following fields were added to the `WorkOrderDetail` DTO and populated in `getWorkOrderDetail`:

| Field | Type | Source |
|---|---|---|
| `description` | `String` | `WorkOrder.Description` |
| `parentWorkOrderId` | `String` | `WorkOrder.ParentWorkOrderId` |
| `parentWoNumber` | `String` | `WorkOrder.ParentWorkOrder.WorkOrderNumber` |
| `parentSubject` | `String` | `WorkOrder.ParentWorkOrder.Subject` |
| `lineItems` | `List<LineItemDTO>` | Child `WorkOrderLineItem` records |
| `childWorkOrders` | `List<WorkOrderCard>` | Child `WorkOrder` records (ParentWorkOrderId = this WO) |

The `LineItemDTO` inner class was also added:

```apex
public class LineItemDTO {
    @AuraEnabled public String id;
    @AuraEnabled public String subject;      // SAP operation number e.g. "0010"
    @AuraEnabled public String description;  // task description
    @AuraEnabled public Decimal duration;    // hours
}
```

### 10.5 LWC Component Changes

| Component | Change |
|---|---|
| `workOrderDetail` | Full layout update (see 10.2); `workOrderId` converted to getter/setter for re-render on prop change; `isRailWorkpack`, `hasChildWorkOrders`, `hasLineItems`, `childWorkOrdersEnriched`, `handleChildCardClick`, `backLabel`, `handleBack` (parent-aware) |
| `workshopPortal` | Added `onopendetail={handleOpenDetail}` listener on `c-work-order-detail` to catch child card clicks and back-to-parent navigation from within the detail view |
| `kioskSidebar` | Version number only (v2.8) |

### 10.6 Deployment

```bash
sf project deploy start \
  -d force-app/main/default/classes/KioskController.cls \
  -d force-app/main/default/lwc/workOrderDetail \
  -d force-app/main/default/lwc/workshopPortal \
  -d force-app/main/default/lwc/kioskSidebar \
  -o rsnov25demo

sf community publish --name "Workshop" --target-org rsnov25demo
```
