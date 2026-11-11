# Workshop Kiosk redesign: build and execution plan (for Sonnet)

Companion to `docs/kiosk-redesign-build-spec.md` (the spec). The spec says **what**; this file says **in what order and how**. If they disagree, the spec wins. Stop and ask Ron.

- Baseline to revert to: git tag `v2.58-baseline` (branch `release/v2.58`).
- Target org: `ron@rsfieldnov25.demo` (alias `rsnov25demo`).
- Written 2026-11-11.

---

## 0. How to use this file

1. Paste the **Session preamble** (§4.0) into Sonnet once, at the start of every new session.
2. Then paste one step prompt at a time (P1.1, P1.2, …). Each one names the files to touch and ends with a **Done when** check.
3. Don't start a step until the previous step's Done-when passes.
4. Sonnet never deploys. Ron runs every deploy command himself, after reading the diff. The commands are given in each phase.
5. Each phase ends with one git commit. The commit message format is given.

---

## 1. Architectural overview

### 1.1 Runtime

```
iPad (Guided Access) ──> Aura Experience Cloud site  /wagonkiosk
                           └─ workshopPortal (state machine, holds sessionToken)
                                ├─ kioskSidebar / kioskHeader
                                ├─ workOrderCards ─> workOrderDetail (workpack page, redesigned)
                                │                      └─ assetReview (redesigned, v6)
                                │                           └─ kioskPdfPane (NEW) ──iframe──> pdfjsHost static resource
                                │                                                       (PDF.js 3.11.174 + worker)
                                └─ kioskConfig (NEW)
                       every call ──> KioskController (Apex, validateToken(token) first)
                                        ├─ WorkOrder tree via RootWorkOrderId
                                        ├─ Measure_Point__c (+4 new fields)
                                        ├─ Kiosk_App_Config__c (NEW, one JSON record)
                                        └─ ContentVersion -> base64 (PDF bytes, size-capped)
```

Rules that never change:

- **Self-contained repo.** The project must deploy to any org from this repo alone. Everything taken from another project (Digital Checklist, PRT Annotator) is **copied into this repo** under kiosk-owned names. Nothing may depend on metadata that only exists in `rsnov25demo`.
- Workers are **not** Salesforce users. Identity = the HMAC session token. Every new `@AuraEnabled` method takes `token` first and calls `validateToken(token)`. If it returns null, throw `AuraHandledException('SESSION_EXPIRED')`.
- No `uiRecordApi` / LDS writes. All writes go through Apex.
- File bytes travel as base64 through `@AuraEnabled`. Never use `/sfc/servlet.shepherd/` URLs.
- Complex inputs go in as JSON strings, not Apex custom types (marshalling drops fields).
- No `cacheable=true` on imperatively called reads.

### 1.2 PDF data flow

```
Supervisor taps Quick Action "processWorkpackButton" on the workpack WO (manual only; triggers OFF)
  -> WorkpackPdfProcessor.processLatestPdf(workOrderId)
  -> Queueable -> Prompt Builder "WorkpackExtraction" (NEW version) with the PDF ContentDocument
  -> JSON { maintenance_orders: [ { ..., checklist_items: [ {component, page_number,
                                     page_position_estimate, table_name?} | "string" ] } ] }
  -> robust parse (deserializeFirstJsonValue / findJsonEnd)
  -> delete + recreate WOLIs and Measure_Point__c on the child WOs,
     stamping Source_Document__c, Page_Number__c, Page_Position_Estimate__c, Table_Name__c

Worker on Asset Review -> Measure tab -> Document side panel
  -> getMeasurePdf(token, sourceDocumentId) -> base64 (or tooLarge)
  -> kioskPdfPane posts {base64, pageNumber} to the pdfjsHost iframe
  -> host returns rendered rect + page text items
  -> kioskPdfLocate.locateLabelLine(items, componentName, positionPercent)
  -> highlight box over the matched line (fallback: band at the position estimate)
```

---

## 2. File and folder blueprint

All paths are under `force-app/main/default/` unless noted. **N** = new, **M** = modify, **D** = delete, **R** = retrieve from the org into the repo.

```
objects/
  Measure_Point__c/fields/
    Source_Document__c.field-meta.xml          N  Text(18)
    Page_Number__c.field-meta.xml              N  Number(4,0)
    Page_Position_Estimate__c.field-meta.xml   N  Text(10)
    Table_Name__c.field-meta.xml               N  Text(255)
  WorkOrder/fields/
    Raised_Task__c.field-meta.xml              N  Checkbox, default false
  Kiosk_App_Config__c/
    Kiosk_App_Config__c.object-meta.xml        N  (Name = Text, sharing ReadWrite... see P1.2)
    fields/Settings_JSON__c.field-meta.xml     N  LongTextArea(131072)
permissionsets/
  Workshop_Kiosk_Supervisor.permissionset-meta.xml   M  FLS + object perms for all of the above
triggers/
  WorkpackPdfTrigger.trigger-meta.xml        M  <status>Inactive</status>
  WorkOrderWorkpackTrigger.trigger-meta.xml  M  <status>Inactive</status>
genAiPromptTemplates/
  WorkpackExtraction.genAiPromptTemplate-meta.xml    R then M  (new version block)
staticresources/  (kiosk-owned names; never overwrite another project's pdfjs/pdflib/pdfjsHost)
  pdfjs.js, pdfjsWorker.js, pdflib.js (+ -meta.xml)   D  from repo only (NOT from the org; other projects use them)
  kioskPdfjs/ (pdf.min.js, pdf.worker.min.js) + kioskPdfjs.resource-meta.xml        N  copied from Digital Checklist
  kioskPdfLib/ (pdf-lib.min.js) + kioskPdfLib.resource-meta.xml                     N  copied from Digital Checklist
  kioskPdfjsHost/ (index.html, imagetext.js) + kioskPdfjsHost.resource-meta.xml     N  copied from Digital Checklist
classes/
  WorkpackPdfProcessor.cls / Test.cls        M
  KioskController.cls / KioskControllerTest.cls   M
  KioskBlocks.cls                            M  (ParentWorkOrderId -> RootWorkOrderId, line ~473)
lwc/
  pdfAnnotator/pdfAnnotator.js               M  zip paths
  kioskPdfLocate/ (kioskPdfLocate.js, locate.js, .js-meta.xml)  N  port of prtFormLocate + locateLabelLine
  kioskStatus/ (kioskStatus.js, .js-meta.xml)                    N  shared status/next-step rules (spec §6)
  kioskPdfPane/ (html, js, css, js-meta.xml)                     N  read-only PDF viewer
  kioskConfig/ (html, js, css, js-meta.xml)                      N  config page
  kioskHeader/                               M  clock on every page
  kioskSidebar/                              M  Config nav item + VERSION bump
  workshopPortal/                            M  KIOSK_CONFIG state, config load, pass config down
  workOrderDetail/                           M  workpack layout (spec §5.1)
  assetReview/                               M  v6 (spec §5.2)
docs/ (repo root)
  kiosk-redesign-build-spec.md               M  only when Ron changes a decision
tests (repo root)
  lwc/kioskPdfLocate/__tests__/kioskPdfLocate.test.js   N  Jest (port of locate.test.mjs)
  lwc/kioskStatus/__tests__/kioskStatus.test.js         N  Jest
```

Source files to copy from. These are read-only: copy them into this repo and never reference them in place.

- `../Digital Checklist complete/force-app/main/default/lwc/prtFormLocate/locate.js`
- `../Digital Checklist complete/locate.test.mjs`
- `../Digital Checklist complete/force-app/main/default/staticresources/pdfjsHost/` (index.html, imagetext.js)
- `../Digital Checklist complete/force-app/main/default/staticresources/pdfjs/` (pdf.min.js, pdf.worker.min.js; pdf.js 3.11.174)
- `../Digital Checklist complete/force-app/main/default/staticresources/pdfLib/` (pdf-lib.min.js)
- `../Digital Checklist complete/force-app/main/default/classes/DigitalChecklistFromPromptAction.cls` (only `deserializeFirstJsonValue`, `findJsonEnd`)
- `../Digital Checklist complete/.../genAiPromptTemplates/PRTMeasurementExtractor*` (rules text only)

---

## 3. Phased build plan

| Phase | Content                                                                                                 | Deploy gate                                   | Commit                                                                         |
| ----- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------ |
| 0     | Safety: pre-flight checks, vendor PDF libs as `kioskPdf*`, dependency audit + retrieve missing metadata | Ron deploys `kioskPdf*` + `pdfAnnotator`      | `fix: vendor kiosk PDF libraries` + `chore: add org-only dependencies to repo` |
| 1     | Metadata: fields, config object, permission set, triggers off                                           | Ron deploys, verifies by describe             | `feat(meta): redesign fields + Kiosk_App_Config__c`                            |
| 2     | PDF extraction: prompt version, processor parse + stamping                                              | Ron deploys, reprocesses 00012423 + 00010070  | `feat(pdf): page-aware extraction`                                             |
| 3     | Apex: root scoping, rollups, measure save, PDF bytes, raise task, config, time records, tests           | Ron deploys + runs tests                      | `feat(apex): redesign controller methods`                                      |
| 4     | Shared LWC modules: `kioskPdfLocate`, `kioskStatus`, `kioskPdfPane`                                     | Ron deploys `kioskPdfPane` behind a test page | `feat(lwc): pdf pane + shared rules`                                           |
| 5     | Shell: header clock, sidebar Config item, config page                                                   | Ron deploys                                   | `feat(lwc): kiosk config + header clock`                                       |
| 6     | Workpack page (`workOrderDetail`)                                                                       | Ron deploys                                   | `feat(lwc): workpack page redesign`                                            |
| 7     | Asset Review v6                                                                                         | Ron deploys                                   | `feat(lwc): asset review v6`                                                   |
| 8     | Release: VERSION bump, full verify on iPad, tag `v3.0`                                                  | Ron deploys                                   | `release: v3.0` + tag                                                          |

Deploy commands (Ron runs them; the plugin hook needs `CONFIRM_PROD=1`):

```bash
CONFIRM_PROD=1 sf project deploy start -d <paths…> -o rsnov25demo --json | sed -n '/^{/,$p' > /tmp/d.json
sf project deploy report --use-most-recent -o rsnov25demo --json
```

Never deploy `layouts/` or `profiles/`. Never deploy the whole `force-app` (it would also redeploy unrelated metadata).

---

## 4. Step-by-step execution prompts

### 4.0 Session preamble (paste first, every session)

```
You are implementing the Workshop Kiosk redesign in a Salesforce DX repo (LWC + Apex, API 67.0).
Read these before writing anything:
  1. CLAUDE.md (repo root) — kiosk rules and gotchas.
  2. docs/kiosk-redesign-build-spec.md — the spec. It is the source of truth.
  3. docs/kiosk-redesign-sonnet-plan.md — this plan; do only the step I give you.
Hard rules:
  - Do not deploy, retrieve, or run anything against an org unless the step explicitly says so.
  - Do not invent field names, picklist values, Apex methods or APIs. If the spec or the code does
    not show it, stop and ask. Say "not verified" instead of guessing.
  - Never edit layouts/, profiles/, or files outside the paths the step lists.
  - Every @AuraEnabled method: first param String token; first line validateToken(token);
    null -> throw new AuraHandledException('SESSION_EXPIRED'). Complex inputs as JSON strings.
    No cacheable=true on imperative reads.
  - LWC on the kiosk: native <select> (never lightning-combobox); every input/select/textarea gets
    onkeydown={handleInputKeydown} that calls evt.stopPropagation(); textarea values set in JS are
    synced in renderedCallback; images via <img src>; dark theme --rt-* variables; no uiRecordApi writes.
  - Apex: no local vars named json, desc, inner. Cast Database.query results.
  - When you change an @AuraEnabled signature, update KioskControllerTest.cls callers in the same step.
  - Finish each step with: the list of files changed, and how you checked the Done-when.
```

---

### Phase 0: Safety

**P0.1: Pre-flight (read-only, Ron or Sonnet with org access)**

```
Read-only checks against ron@rsfieldnov25.demo. Report results; change nothing.
1. Tooling SOQL: SELECT Name, Status FROM ApexTrigger WHERE Name IN
   ('WorkpackPdfTrigger','WorkOrderWorkpackTrigger')
2. SOQL: SELECT Name, ContentType, BodyLength FROM StaticResource WHERE Name IN
   ('pdfjs','pdfjsWorker','pdflib','pdfjsHost')   (expected 2026-11-11: pdfjs zip, pdflib zip,
   pdfjsHost zip, pdfjsWorker application/javascript)
3. SOQL: SELECT Role__c, COUNT(Id) FROM ServiceResource GROUP BY Role__c
   (needed for the config-save gate, spec §4A.3a)
4. Open https://<site>/wagonkiosk/resource/pdfjsHost/index.html?pdfjs=x&worker=y in a browser
   (the org's existing pdfjsHost has the same content as the future kioskPdfjsHost, so it proves the URL form).
   Expected: the page loads and shows "failed to load PDF.js script from x" (proves the iframe URL
   serves under the site prefix). A 503 / 404 means kioskPdfPane needs a different URL: STOP.
```

Done when: all four answers are written into spec §7 (Open items) by Ron.

**P0.2: Vendor the PDF libraries under kiosk-owned names**

```
Goal: the kiosk ships its own PDF.js / pdf-lib / iframe host, so it deploys to any org and never
overwrites the Digital Checklist resources named pdfjs / pdflib / pdfjsHost.
Copy (do not move) from ../Digital Checklist complete/force-app/main/default/staticresources/:
  pdfjs/pdf.min.js, pdfjs/pdf.worker.min.js  -> staticresources/kioskPdfjs/
  pdfLib/pdf-lib.min.js                      -> staticresources/kioskPdfLib/
  pdfjsHost/index.html, pdfjsHost/imagetext.js -> staticresources/kioskPdfjsHost/
Create kioskPdfjs.resource-meta.xml, kioskPdfLib.resource-meta.xml, kioskPdfjsHost.resource-meta.xml:
  contentType application/zip, cacheControl Public, description naming the source + version
  (pdf.js 3.11.174; check the pdf-lib version string inside the file, do not guess it).
Edit lwc/pdfAnnotator/pdfAnnotator.js imports and loads:
  @salesforce/resourceUrl/kioskPdfjs  -> loadScript(this, url + '/pdf.min.js'),
                                         workerSrc = url + '/pdf.worker.min.js'
  @salesforce/resourceUrl/kioskPdfLib -> loadScript(this, url + '/pdf-lib.min.js')
Delete from the REPO only: staticresources/pdfjs.js, pdfjsWorker.js, pdflib.js and their meta files
(after confirming with grep that nothing else in force-app imports pdfjs, pdfjsWorker or pdflib).
Never deploy a destructive change for the org's pdfjs/pdfjsWorker/pdflib — other projects use them.
In kioskPdfjsHost/index.html change the outgoing postMessage target '*' to the parent origin
(document.referrer origin, or an origin passed as a ?origin= query param by kioskPdfPane).
```

Done when:

- `grep -rn "resourceUrl/pdf" force-app` returns nothing (every import is `kioskPdf*`).
- The three `kioskPdf*` folders exist.
- After Ron deploys `staticresources/kioskPdf*` + `lwc/pdfAnnotator`, the existing PDF annotate flow in Work Execution opens a PDF on the iPad.

**P0.3: Dependency audit (portability)**

```
Produce docs/kiosk-dependencies.md: every metadata item the kiosk code references that is NOT in
this repo. Method:
1. From lwc/: every @salesforce/apex, resourceUrl, messageChannel, label, schema import; every flow
   API name passed to _launchFlow / flowApiName; check each against force-app.
   Known gap on 2026-11-11: FilePreviewController (used by inspectionJobChecklist) is org-only.
2. From classes/ and triggers/: every SObject and custom field in SOQL/DML (Measure_Point__c,
   Time_Report__c, Kiosk_App_Config__c, WorkOrder/Asset/ServiceResource custom fields), every
   WorkType name used as a literal ('Wagon PM01', '%Workpack%'), every prompt template name,
   Named Credential, permission set.
   Known gap: objects/ has no Measure_Point__c object folder at all, and only some field files.
3. Flows referenced by data (work plan steps) on 00012423 / 00010070: RS_SFS_Create_Notification_DC_WS,
   RS_SFS_Work_Delay_DC_WS, RS_Hazard_Data_Capture_Form_SFS_Mobile,
   RS_SFS_Create_Noti_Case_from_Measure_Point_Attention.
For each item: name, type, referenced from (file:line), in repo yes/no, proposed action
(retrieve into repo / config data, not metadata / out of scope). Do not retrieve anything yourself.
```

Done when: Ron has reviewed the list and marked each row. Ron (or Sonnet with an explicit instruction) then retrieves the "retrieve into repo" items with `sf project retrieve start -m <Type>:<Name> -o rsnov25demo` and commits them. Data such as WorkTypes or the demo assets goes into a seed-data note, not into metadata.

---

### Phase 1: Metadata

**P1.1: Measure_Point__c and WorkOrder fields**

```
Create these field files (CustomField XML, API 67.0, all with descriptions):
  objects/Measure_Point__c/fields/Source_Document__c.field-meta.xml    Text, length 18,
      label "Source Document", description "ContentDocument Id of the PDF this point was extracted from"
  objects/Measure_Point__c/fields/Page_Number__c.field-meta.xml        Number, precision 4, scale 0,
      label "Page Number"
  objects/Measure_Point__c/fields/Page_Position_Estimate__c.field-meta.xml  Text, length 10,
      label "Page Position Estimate", description "Vertical position on the page, e.g. 20%"
  objects/Measure_Point__c/fields/Table_Name__c.field-meta.xml          Text, length 255, label "Table Name"
  objects/WorkOrder/fields/Raised_Task__c.field-meta.xml                Checkbox, defaultValue false,
      label "Raised Task"
None required, none unique, no external Id.
```

Done when: 5 XML files exist and each is valid XML (`xmllint --noout`).

**P1.2: Kiosk_App_Config__c**

```
Create objects/Kiosk_App_Config__c/Kiosk_App_Config__c.object-meta.xml:
  label "Kiosk App Config", plural "Kiosk App Configs", nameField Text "Config Name",
  deploymentStatus Deployed, sharingModel ReadWrite, no tab, no layouts.
Create objects/Kiosk_App_Config__c/fields/Settings_JSON__c.field-meta.xml:
  LongTextArea, length 131072, visibleLines 10, label "Settings JSON".
Convention (document it in the field description): exactly one record, Name = "Default".
The JSON keys and defaults are the table in spec §3.2.
```

Done when: 2 files exist, valid XML.

**P1.3: Permission set**

```
Edit permissionsets/Workshop_Kiosk_Supervisor.permissionset-meta.xml only.
Add fieldPermissions (editable=true, readable=true) for:
  Measure_Point__c.Source_Document__c, .Page_Number__c, .Page_Position_Estimate__c, .Table_Name__c,
  WorkOrder.Raised_Task__c, Kiosk_App_Config__c.Settings_JSON__c.
Add objectPermissions for Kiosk_App_Config__c: allowCreate, allowRead, allowEdit true; allowDelete false;
viewAllRecords false; modifyAllRecords false.
Keep the existing elements in alphabetical order by field/object (match the file's current style).
Do not change any existing permission.
```

Done when: `git diff` shows only additions.

**P1.4: Triggers off**

```
In triggers/WorkpackPdfTrigger.trigger-meta.xml and triggers/WorkOrderWorkpackTrigger.trigger-meta.xml
change <status>Active</status> to <status>Inactive</status>. Change nothing else.
Then read classes/WorkpackPdfProcessorTest.cls and list any test that relies on the trigger firing
(it inserts a ContentDocumentLink and expects child WOs). If one does, change that test to call
WorkpackPdfProcessor.processPdf(...) or processLatestPdf(...) directly.
```

Done when: both meta files say Inactive, and the test review is reported.

Ron deploys Phase 1:

```bash
CONFIRM_PROD=1 sf project deploy start -d force-app/main/default/objects/Measure_Point__c/fields \
 -d force-app/main/default/objects/WorkOrder/fields/Raised_Task__c.field-meta.xml \
 -d force-app/main/default/objects/Kiosk_App_Config__c \
 -d force-app/main/default/permissionsets/Workshop_Kiosk_Supervisor.permissionset-meta.xml \
 -d force-app/main/default/triggers -o rsnov25demo --json
```

Verify: run `sf sobject describe -s Measure_Point__c`, and repeat for `Kiosk_App_Config__c` and `WorkOrder`, and check the new fields. The Tooling query from P0.1 #1 shows Inactive.

---

### Phase 2: PDF extraction

**P2.1: New prompt version**

```
Ron first retrieves the current template (local file may be stale):
  sf project retrieve start -m GenAiPromptTemplate:WorkpackExtraction -o rsnov25demo
Files: genAiPromptTemplates/WorkpackExtraction.genAiPromptTemplate-meta.xml (M).
The published version is immutable: editing it "deploys successfully" but is silently ignored.
1. Copy the existing <templateVersions> block to a NEW block. If the file has versionIdentifier /
   activeVersionIdentifier elements, give the new block the next identifier and point
   activeVersionIdentifier at it. If it has neither, STOP and report the retrieved structure.
2. In the new block's <content>, keep everything about maintenance_orders and operations unchanged.
   Replace the "Inspection Checklists" rule and the checklist_items schema with the rules from
   PRTMeasurementExtractor (spec §4A.1):
     - an item is a component only if an "OK" / "Att. Req" marker follows it; keep text verbatim;
       strip the markers and a trailing ":"
     - each item: {"component": "...", "page_number": <int, 1-based>, "page_position_estimate": "NN%"}
     - measurement tables: one item per row-column combination, component = "<row> - <column>",
       plus "table_name": "<table title>"; keep multi-level header context in <row>/<column>
     - wrapped lines: no space if the first line ends with "-", else one space
     - keep duplicates; one-line JSON; no code fences; no backslashes
   Update the JSON example so checklist_items shows one plain item and one table item.
3. Do not change the model, inputs, or fileDroppingStrategy.
```

Done when: the file has two version blocks, and the new one is active. After Ron deploys, **re-retrieve** the template and confirm the active version holds the new text. A successful deploy alone doesn't prove the change landed.

**P2.2: Processor parse and stamping**

````
Files: classes/WorkpackPdfProcessor.cls (M), classes/WorkpackPdfProcessorTest.cls (M).
1. Port deserializeFirstJsonValue(String) and findJsonEnd(String, Integer) from
   ../Digital Checklist complete/force-app/main/default/classes/DigitalChecklistFromPromptAction.cls
   as private static helpers. Use them in runProcessing() before deserialising: extract the first
   complete JSON object from rawJson (handles text before/after and fences).
2. Change OrderDTO.checklist_items from List<String> to List<Object> and parse with
   JSON.deserializeUntyped for that list (keep the typed parse for the rest, or parse the whole
   payload untyped — your choice, but keep ExtractionResult/OrderDTO for the other fields).
   Each element may be:
     a String             -> component = it; page fields null
     a Map<String,Object> -> component, page_number (Integer or numeric String), page_position_estimate
                              (String; accept 20, "20", "20%" -> store "20%"), table_name (optional)
3. Pass the ContentDocumentId (already resolved in step 1 of runProcessing) down to where
   Measure_Point__c rows are built and set:
     Source_Document__c = contentDocumentId (18-char String)
     Page_Number__c, Page_Position_Estimate__c, Table_Name__c
     if table_name present: Measure_Type__c = 'Measure'
   Keep the existing >255 rule for Component_Name__c (truncate, full text to Comments__c).
4. Keep the existing delete-and-recreate behaviour (Ron approved losing recorded outcomes on reprocess).
5. Tests: set WorkpackPdfProcessor.mockLlmResponse to
     (a) the old shape (checklist_items as strings),
     (b) the new shape with one plain item + one table item, wrapped in "Here is the JSON: ``` … ```",
   and assert the created Measure_Point__c rows have the right page/position/table/source values.
````

Done when: the tests compile locally (the Apex LSP shows no diagnostics). After Ron deploys, `sf apex run test -n WorkpackPdfProcessorTest -r human -w 10 -o rsnov25demo` passes.

Ron then reprocesses 00012423 and 00010070 with the Quick Action. Check: SOQL on `Measure_Point__c` (Page_Number__c, Page_Position_Estimate__c, Table_Name__c, Source_Document__c) for those workpacks' children. Spot-check 5 rows against the PDF pages by hand.

---

### Phase 3: Apex (`KioskController`)

Do one prompt per step. Each step also updates `KioskControllerTest.cls`.

**P3.1: Root scoping**

```
Files: classes/KioskController.cls, classes/KioskBlocks.cls (M).
Methods: getWorkOrderDetail (child list ~1310), getWagonAsset (~2762), getAssetTasks (~2933),
getAssetReviewDetail (~3007), getWorkpackProgress (~3308), KioskBlocks (~473).
Replace workpack-span filters that use ParentWorkOrderId = :wp (or Id = :wp OR ParentWorkOrderId = :wp)
with RootWorkOrderId = :wp (or Id = :wp OR RootWorkOrderId = :wp). Before each edit, read the
surrounding code and confirm the bound variable is the workpack (root) Id; if it is a non-root WO
id, resolve its RootWorkOrderId first (pattern: ensureClockedIn ~1604). List every replaced line.
Do NOT change createAssetTask (~3592): it must keep setting ParentWorkOrderId.
```

Done when: `grep -n ParentWorkOrderId classes/KioskController.cls classes/KioskBlocks.cls` shows only the lines that set the field or exist for a stated reason (report them). Deployed check: 00012423's child list includes 00012649 (a grandchild under 00012431).

**P3.2: Measure DTO and save stamping**

```
MeasurePointDTO: add sourceDocumentId, sourceDocumentTitle, pageNumber (Integer),
pagePositionEstimate, tableName (all @AuraEnabled). mapMeasurePoint and every SOQL that feeds it
(getMeasurePoints, getMeasurePointsByAsset, saveMeasurePoint re-query, getAssetReviewDetail if it
maps points) must select the 4 new fields. sourceDocumentTitle: one extra query
SELECT Id, Title FROM ContentDocument WHERE Id IN :ids per call (not per row).
saveMeasurePoint: if req.workOrderId is set, ignore req.assetId and set Asset__c from
[SELECT AssetId FROM WorkOrder WHERE Id = :req.workOrderId]. Keep Update_Date__c = now.
Never overwrite the 4 PDF fields from the UI (do not read them from req).
```

Done when: the test saves a point with the wrong assetId and asserts that `Asset__c` = the WO's AssetId.

**P3.3: getMeasurePdf**

```
New @AuraEnabled getMeasurePdf(String token, String workpackId, String contentDocumentId)
returns AttachmentContent (existing DTO: dataUri, tooLarge).
1. validateToken.
2. Scope: the document must be linked (ContentDocumentLink.LinkedEntityId) to the workpack or to a
   WorkOrder whose RootWorkOrderId = workpackId. Else throw AuraHandledException('NOT_ALLOWED').
3. If contentDocumentId is blank: use the newest PDF linked to the workpack (same query shape as
   WorkpackPdfProcessor.processLatestPdf).
4. Then reuse the body of getAttachmentContent (extract a private helper; do not duplicate code).
   Cap stays ATTACHMENT_MAX_BYTES (4,000,000).
Also return the resolved contentDocumentId (add field documentId to AttachmentContent).
```

Done when: tests cover allowed, not-linked (NOT_ALLOWED), and blank id (falls back to the newest PDF).

**P3.4: getWorkpackChildProgress**

```
New @AuraEnabled getWorkpackChildProgress(String token, String workpackId) -> String (JSON array).
One row per WO with RootWorkOrderId = workpackId:
  id, number, subject, status, workTypeName, assetId, assetName, l2AssetId, l2AssetName,
  stepsDone, stepsTotal, measuresTaken, measuresTotal, findings, bareFindings, partsUsed, partsRequired
Definitions = spec §4.2 and §6, same queries as getWorkpackProgress but GROUP BY WorkOrderId:
  steps: WorkStep via WorkPlan.WorkOrderId, Status = 'Completed'; exclude exception plans the same
         way getWorkpackProgress does (read it; do not invent a rule); AccessLevel.SYSTEM_MODE.
  measures: taken = Measure_Type__c != null; findings = 'Attention Required' or 'Scrap';
            bare = findings with blank Comments__c.
  parts: ProductConsumed vs ProductRequired COALESCE(WO, WorkType).
  l2 asset: walk Asset.ParentId up to the asset whose parent is the workpack's AssetId.
Max 5 SOQL in total regardless of child count. No colour logic in Apex.
```

Done when: the test asserts the counts for a seeded workpack with 2 children, one of them with a bare finding.

**P3.5: Raise Task + getRaisedTasks**

```
Extend CreateTaskRequest with workTypeId and raised (Boolean). In createAssetTask: when
raised == true, set Raised_Task__c = true and WorkTypeId = req.workTypeId; ParentWorkOrderId stays
= workpack. Validate workTypeId exists.
New getWorkTypes(token) -> List of {id, name} from all WorkType (ORDER BY Name, LIMIT 500).
New getRaisedTasks(token, assetId) -> List<TaskWoDTO>: WOs with Raised_Task__c = true and AssetId
in (assetId + all descendants via Asset.RootAssetId/ParentId), any workpack, newest first, LIMIT 200.
```

**P3.6: Config**

```
New getKioskConfig(token) -> String (Settings_JSON__c of the record Name='Default', or '{}').
New saveKioskConfig(token, String settingsJson): validate JSON parses to a Map; upsert the
'Default' record. Gate: the worker in the token must be supervisor/admin. Use the Role__c value(s)
Ron recorded in spec §7 after P0.1 #3. If they are not recorded yet, STOP and ask.
The UI merges defaults; Apex stores only what it is given.
```

**P3.7: getWorkpackTimeRecords**

```
New getWorkpackTimeRecords(token, workpackId) -> List<TimeReportRow> (existing DTO) for
Time_Report__c where Work_Order__c = workpackId OR Work_Order__r.RootWorkOrderId = workpackId,
ORDER BY Start_Time__c DESC, LIMIT 200. Read-only.
```

Done when (Phase 3): Ron deploys the classes and runs `sf apex run test -n KioskControllerTest -n WorkpackPdfProcessorTest -n KioskBlocksTest -r human -w 15 -o rsnov25demo`. All pass. `sf project deploy start -t` runs 0 tests, so run the tests separately.

---

### Phase 4: Shared LWC modules

**P4.1: kioskPdfLocate**

```
New service module lwc/kioskPdfLocate (js-meta isExposed false).
1. Copy ../Digital Checklist complete/force-app/main/default/lwc/prtFormLocate/locate.js to
   lwc/kioskPdfLocate/locate.js unchanged.
2. In locate.js add and export:
     locateLabelLine(items, label, positionPercent)
       -> lines = linesOf(items); line = numberedLine(lines, label) || bestLine(lines, label, positionPercent)
       -> return null if no line, else { x, y, w, h } as page fractions (0..1, top-left origin)
          computed from the line's items (min x, min y, max x+w, max y+h).
     splitTableComponent(componentName) -> { row, column } split at the LAST " - "; column null if none.
   Read linesOf/numberedLine/bestLine first to see the real line object shape; do not assume fields.
3. kioskPdfLocate.js: export { locateChecklistMark, locateLabelLine, splitTableComponent } from './locate';
4. Jest: port ../Digital Checklist complete/locate.test.mjs to
   lwc/kioskPdfLocate/__tests__/kioskPdfLocate.test.js, plus tests for locateLabelLine
   (exact match, fuzzy match, two same labels -> the one nearest positionPercent, no match -> null)
   and splitTableComponent.
```

Done when: `npm run test:unit -- kioskPdfLocate` passes.

**P4.2: kioskStatus**

```
New service module lwc/kioskStatus: pure functions implementing spec §6 exactly:
  woStatus(row) -> 'green'|'red'|'amber'|'grey'   (row = getWorkpackChildProgress row + status)
  assetStatus(listOfWoStatuses)
  woNextStep(row) -> string    (order in spec §6)
  workpackNextStep(workpack, children) -> {text, action:'openAR'|'execute', woId}   (spec §5.1 item 2)
  COLORS = { grey:'#5b6b7c', amber:'#F2B441', red:'#E5484D', green:'#21C07A' }
Use the mocks' woD()/status code in docs/mockups/workpack-redesign-v1.html as the reference
implementation; match its outputs.
Jest: one test per rule branch.
```

Done when: Jest passes.

**P4.3: kioskPdfPane**

```
New LWC lwc/kioskPdfPane (not exposed). Read-only viewer. API:
  @api sessionToken, @api workpackId
  @api showMeasure({ documentId, pageNumber, componentName, pagePositionEstimate, tableName })
  @api goToPage(n)
  events: pagechange {pageNumber, pageCount}, error {message}
Implementation:
- iframe src = kioskPdfjsHost + '/index.html?pdfjs=' + encodeURIComponent(kioskPdfjs + '/pdf.min.js')
  + '&worker=' + encodeURIComponent(kioskPdfjs + '/pdf.worker.min.js')
  (imports: @salesforce/resourceUrl/kioskPdfjsHost, @salesforce/resourceUrl/kioskPdfjs). Use the URL form
  that P0.1 #4 proved works.
- Message protocol (from kioskPdfjsHost/index.html; read it): send
  {type:'pdfjsHost:render', payload:{base64, pageNumber, availableWidth, availableHeight}};
  handle pdfjsHost:ready / rendered / text / error / status. Ignore messages whose
  event.source !== iframe.contentWindow. postMessage targetOrigin = new URL(iframe.src, location.href).origin.
- Bytes: getMeasurePdf(token, workpackId, documentId); strip the "data:...;base64," prefix.
  Cache base64 per documentId in the component. tooLarge -> show "PDF too large to preview".
- Highlight: on rendered+text for the current page, call locateLabelLine(items, label, pct)
  (label = splitTableComponent(componentName).row when tableName is set). Draw an absolutely
  positioned box over the iframe using the rendered page rect. No match -> 6%-high band at pct.
- Toolbar: ◀ page n / N ▶, zoom − / fit width / +. 48px min touch targets. Dark theme.
- Spinner while loading; error text on error. No inputs -> no keydown handling needed; if you add
  any input, apply the stopPropagation rule.
```

Done when: deploy (Ron) plus a temporary harness. Mount it in `assetReview` behind a hidden toggle, or ask Ron for a test page. On 00012423, calling `showMeasure` for 3 different points opens the right page and boxes the right line.

---

### Phase 5: Shell

**P5.1: Config load in workshopPortal**

```
workshopPortal: after login, call getKioskConfig(token); merge over DEFAULTS (spec §3.2 table,
exact keys/values) into this.kioskConfig; pass config={kioskConfig} to workOrderDetail and
assetReview (via workOrderDetail). Add state KIOSK_CONFIG and nav 'kioskconfig'.
```

**P5.2: kioskSidebar + kioskHeader**

```
kioskSidebar: add a "Kiosk Config" nav item next to Time Tracking (fires the existing navigate
event with 'kioskconfig'); show it only when @api canConfigure is true (workshopPortal sets it from
the Role__c rule). kioskHeader: clock in/out/switch in the worker chip on every page, using
ensureClockedIn / autoClockOut / getActiveClock (already exist). Read the current code first.
```

**P5.3: kioskConfig page**

```
New lwc/kioskConfig. Layout and behaviour = the Kiosk Config page in
docs/mockups/workpack-redesign-v1.html (categorized left nav, one sub-section at a time, breadcrumb,
live preview, ✓ include + ▲▼ order lists, Read/Edit toggles for the drawer, segmented controls).
Field catalogues = spec §3.2 "Field catalogue" (verified names only). Save -> saveKioskConfig.
Native controls only; keydown rule on every input.
```

Done when: change two settings, save, reload the kiosk, and both settings persist.

---

### Phase 6: Workpack page

**P6.1 … P6.4** (one prompt each, all in `lwc/workOrderDetail`, `isRailWorkpack` branch only):

```
P6.1 Header card + next-step band (spec §5.1 items 1–2, kioskStatus.workpackNextStep).
P6.2 Progress panel with wpRings / wpProgress (existing getWorkpackProgress).
P6.3 Tab bar + Notes & codes + Execute tabs (existing notes/codes/plan-card code moved, not rewritten;
     large Open Asset Review button ABOVE the work plans).
P6.4 Work orders tab (getWorkpackChildProgress, status bar filter, List/Board, Group by, rows
     sorted red>amber>grey>green, tap row -> Asset Review on that WO), Operations, Time records
     (getWorkpackTimeRecords + live row), Raised tasks (getRaisedTasks).
Reference: docs/mockups/workpack-redesign-v1.html (#ds=HT and #ds=WG). Remove the old clock panel,
Operations/Work Plans sidebar and stacked panels only in the workpack branch; non-workpack WOs
keep today's layout.
```

Done when: on the iPad, 00012423 and 00010070 match the mock's structure. All 19 and 20 children are listed, including grandchildren.

---

### Phase 7: Asset Review v6

**P7.1 … P7.5** (one prompt each, `lwc/assetReview`; reference `docs/mockups/asset-review-redesign-v6.html`):

```
P7.1 Deep link in (@api initialWorkOrderId), WO list grouped by asset (workpack pinned), title tile (woTile).
P7.2 Asset map (icicle; Schematic for wagons using the existing WagonDiagramTop resource), highlight rules,
     work type focus chips (wtFilter).
P7.3 Measure tab: one-tap outcomes, inline value, Edit drawer, grouping by page then Table_Name__c,
     📄 chip; side panel Document = kioskPdfPane.showMeasure(...), Trend, Off.
P7.4 Execute / Parts / Notes / Raised tabs (move existing panels), Raise Task modal (getWorkTypes,
     createAssetTask raised=true).
P7.5 Smart collapse rail (rules in spec §5.2), ⓘ asset drawer (assetDrawer R/E; E saves via
     updateAssetSerial or a new FLS-checked method — ask before adding one).
```

Done when: each P7.x has been checked on the iPad against the mock.

---

### Phase 8: Release

```
1. Bump VERSION in lwc/kioskSidebar/kioskSidebar.js from "v2.58" to "v3.0".
2. Update CLAUDE.md (Measure_Point__c field list, new objects, PDF section) and README.
3. Ron deploys the full changed path list (never layouts/profiles), runs all tests, runs /verify
   on the iPad: 00012423 and 00010070, every tab, Document panel, Raise Task, Config save.
4. git commit "release: v3.0 — workpack + asset review redesign"; git tag -a v3.0; push.
```

---

## 5. Edge cases and verification checklist

### Extraction

- [ ] The model wraps JSON in prose or fences. `deserializeFirstJsonValue` still parses it (unit test b).
- [ ] Old-shape output (strings) still works (unit test a).
- [ ] `page_position_estimate` given as `20`, `"20"`, `"20%"`, `0.2`, or missing. Store `"20%"`; blank when missing. For `0.2` (≤1), multiply by 100 and record it in the test.
- [ ] `page_number` missing or non-numeric: null, and the row is still created.
- [ ] Component text longer than 255 characters: truncated, with the full text in `Comments__c` (existing rule).
- [ ] Duplicate component names on different pages: both rows kept with their own page.
- [ ] Reprocessing replaces the points (accepted). Recorded outcomes on those WOs are gone. Tell the user before reprocessing.
- [ ] The PDF exceeds the model's file limit (`fileDroppingStrategy`): the queueable logs the error, and nothing is half-created. Check the debug log.
- [ ] The triggers are Inactive. Attaching a new PDF to a workpack creates nothing until the Quick Action is tapped.

### Document panel

- [ ] `Source_Document__c` blank (old points): falls back to the newest workpack PDF.
- [ ] The document isn't linked to this workpack: NOT_ALLOWED, shown as an error and not as a crash.
- [ ] A PDF over 4,000,000 bytes shows "too large to preview". Nothing hangs.
- [ ] Page number greater than the page count: clamp to the last page.
- [ ] No text layer (scanned PDF): `locateLabelLine` returns null and the band appears at the estimate. `imagetext.js` OCR is out of scope.
- [ ] Table cell: matches on the row header, and the band covers the row.
- [ ] Rapid taps on different rows: only the last request renders (check a request counter).
- [ ] Messages from other frames are ignored (`event.source` check).
- [ ] The session expires while open: SESSION_EXPIRED goes back to login (existing pattern).
- [ ] The iPad rotates or the panel resizes: re-render at the new width.

### Data and scope

- [ ] Grandchild WOs appear everywhere: child list, progress, Asset Review list, KPIs.
- [ ] `saveMeasurePoint` ignores a wrong `assetId` from the UI.
- [ ] A workpack with 0 children: Execute button opens the workpack itself, and the Work orders tab shows an empty state.
- [ ] A child with no measures, steps or parts: grey, "no requirements".
- [ ] Config JSON missing keys or unknown keys: defaults are merged and unknown keys ignored.
- [ ] Config save by a non-supervisor fails with NOT_ALLOWED.
- [ ] Raise Task with an invalid work type fails with a validation error.

### Platform

- [ ] `pdfAnnotator` still works after Phase 0 (PDF opens in Work Execution).
- [ ] The PRT annotator in the org still works. The org's `pdfjs`/`pdflib`/`pdfjsHost` stay untouched because the kiosk only deploys `kioskPdf*`.
- [ ] Portability: no kiosk file imports anything that isn't in this repo. Check: `grep -rn "resourceUrl/pdf" force-app` is empty and `docs/kiosk-dependencies.md` has no open "retrieve" rows.
- [ ] Every new input accepts typing on the iPad (stopPropagation + CSS).
- [ ] Selects open the iOS picker with dark styling.
- [ ] No `lightning-combobox`, no `uiRecordApi` writes, no `cacheable=true` on imperative reads. Check: `grep -rn "lightning-combobox\|updateRecord\|createRecord\|cacheable=true" force-app/main/default/lwc force-app/main/default/classes`.

### Revert

- [ ] Revert path: `git checkout v2.58-baseline -- force-app` (or the branch `release/v2.58`), then deploy the changed paths.
  - The baseline tag's `staticresources/pdfjs.js`/`pdflib.js` are single files and would overwrite the org's zips, breaking the PRT annotator. **Exclude `staticresources/pdfjs*` and `pdflib*` from a revert deploy.**
  - The new fields and object stay in the org (harmless). Removing them needs a destructive deploy.
  - Reactivate the two triggers only if auto-processing is wanted back.
