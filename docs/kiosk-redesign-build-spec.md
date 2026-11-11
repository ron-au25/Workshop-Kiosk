# Workshop Kiosk redesign: build spec

Status: **planning complete, not built**. Nothing has been deployed. Build starts only when Ron says go.
Target org: `ron@rsfieldnov25.demo` (alias `rsnov25demo`). The deploy hook treats it as Production, so `CONFIRM_PROD=1` is used only with an explicit go-ahead.
Last updated: 2026-11-11.

Source of truth for the UI: the HTML mocks in `docs/mockups/`. Open them in a browser. Every mock has a **Design notes** button that explains its rules.

| Mock                            | Covers                                                          |
| ------------------------------- | --------------------------------------------------------------- |
| `asset-review-redesign-v6.html` | Asset Review page (current version; v1–v5 are history)          |
| `workpack-redesign-v1.html`     | Workpack (root work order) page v1.1 + categorized Kiosk Config |

Sample datasets: `#ds=HT` (MEL-SEED Haul Truck HT-02, workpack 00012423) and `#ds=WG` (WG 20213, workpack 00010070). The workpack mock links to Asset Review with `asset-review-redesign-v6.html#ds=HT&wo=<num>`.

---

## 1. Verified org facts (2026-11-11, `sf sobject describe` + SOQL)

**WorkOrder** (all exist): `RootWorkOrderId`, `ParentWorkOrderId`, `AssetId`, `WorkTypeId`, `Status`, `Priority`, `StartDate`, `DurationInMinutes`, `Description`, `SAP_FLOC_Desc__c`, `SAP_Work_Center__c`, `Est_Labour_Hours__c` (double), `Est_Parts_Cost__c` (currency), `Critical_Path__c` (boolean), `Shut_Scope__c` (picklist), `Basic_Finish_Date__c` (date), `Supervisor_Notes__c`, `Cause_Codes__c`, `Work_Delay_Codes__c`, `Damage_Codes__c` (picklists).

- **Missing:** `Raised_Task__c`.

**Asset** (all exist): `Name`, `SerialNumber`, `Status`, `Asset_Type__c` (picklist), `FLOC__c`, `Entitlement_Status__c` (label "Warranty Status"), `InstallDate`, `PurchaseDate`, `ParentId`, `RootAssetId`.

**Measure_Point__c** (all exist): `Work_Order__c`, `Asset__c`, `Update_Date__c` (datetime), `Component_Name__c`, `Measure_Type__c` (OK / Attention Required / Measure / Scrap), `MeasureValue_Type__c` (Temperature / Pressure / Level / Width / Length / Depth), `Measure_Value__c`, `Comments__c`, `Review_Notes__c`, `Defect_Location__c`.

- **Missing:** `Source_Document__c`, `Page_Number__c`, `Page_Position_Estimate__c`, `Table_Name__c`.
- There is no `Measure__c` object (describe returns NOT_FOUND). `Measure_Point__c` is the measure object.

**PDF processing (repo, `force-app/main/default`):**

- Manual: Quick Action LWC `processWorkpackButton` → `WorkpackPdfProcessor.processLatestPdf(workOrderId)` (`@AuraEnabled`). Prompt template `WorkpackExtraction` (Published).
- Auto: `WorkpackPdfTrigger` (ContentDocumentLink after insert, WO with WorkType name containing "Workpack") and `WorkOrderWorkpackTrigger` (WO before update, `SAP_Work_Center__c` = 'Generate'). Both call `processPdf`. Org active status not verified.
- `processPdf` deletes and recreates WOLIs and `Measure_Point__c` on the children. It only sets `Component_Name__c`.

**Already in the org, not in the kiosk repo** (from the Digital Checklist / PRT projects): StaticResources `pdfjs`, `pdfjsWorker`, `pdfjsHost`, `pdflib`; LWC `prtAnnotator`, `prtAnnotationCache`, `prtPdfExportBake`. `prtFormLocate` is **not** in the org; its source is in `Cursor_2026/Digital Checklist complete`. Apex `PrtAnnotationController`, `PrtStatusController`, `WorkpackPrtController`, `WorkpackPrtQueueable` (origin not verified).

**Time_Report__c**: `Work_Order__c`, `Resource_Name__c`, `Start_Time__c`, `End_Time__c`, `Duration_in_Minutes__c`.

**Kiosk_App_Config__c**: does not exist.

**Workpack hierarchy (SOQL):**

- `RootWorkOrderId` is set on every child of 00012423 (19 WOs) and 00010070 (20 WOs).
- Multi-level children exist. 00012649 has parent 00012431 and root 00012423.

**Existing org automation to respect:**

- Flow `RS_SFS_Create_Noti_Case_from_Measure_Point_Attention` (active) creates a notification Case when a point is updated to Attention Required and Comments is not blank.
- Workpack 00012423 plans: 🦺 Release to Traffic — Maintainer Checks, ✍️ Supervisor Sign-Off, 🚩 Raise Exception. The Raise Exception steps are DC flows `RS_SFS_Create_Notification_DC_WS`, `RS_SFS_Work_Delay_DC_WS` and `RS_Hazard_Data_Capture_Form_SFS_Mobile`.

**Existing Apex that scopes by `ParentWorkOrderId` (misses grandchildren):**

| Method                                 | Query                                 |
| -------------------------------------- | ------------------------------------- |
| `KioskController.getWorkOrderDetail`   | child list                            |
| `KioskController.getWorkpackProgress`  | `Id = :wo OR ParentWorkOrderId = :wo` |
| `KioskController.getWagonAsset`        | parent scope                          |
| `KioskController.getAssetTasks`        | parent scope                          |
| `KioskController.getAssetReviewDetail` | parent scope                          |
| `KioskBlocks` (line ~473)              | child loop                            |

`ensureClockedIn` already resolves `RootWorkOrderId`.

---

## 2. Decisions (made by Ron)

1. Raised-task marker = new checkbox **`WorkOrder.Raised_Task__c`**. Do not reuse `Work_Order_Type__c`.
2. New fields on **`Measure_Point__c`**: `Source_Document__c`, `Page_Number__c`, `Page_Position_Estimate__c`, `Table_Name__c` (§3.1). `WorkpackPdfProcessor` stamps them when it creates points.
3. Measure save writes **both** `Work_Order__c` (the selected WO) and `Asset__c` (taken from that WO's `AssetId`, stamped in Apex, not by the UI). **Do not fix seed data.**
4. Config store = **custom object `Kiosk_App_Config__c`**. It is org-wide, and the kiosk can save it (custom metadata can't be saved from the kiosk). Editing is limited to supervisor/admin.
5. Clock stays at **workpack level**, with auto-clock on any data change. There is no per-child labour.
6. Sign-off is not built as kiosk logic. It stays as the org's existing work plans.
7. Findings are recorded on the measure itself (comments, review notes, defect location). Raise Task is for extra work, not for findings.
8. Never deploy page layouts. Ron curates layouts by hand.
9. **PDF extraction stays manual**: only the existing `processWorkpackButton` Quick Action calls `processLatestPdf`. Deactivate `WorkpackPdfTrigger` and `WorkOrderWorkpackTrigger`.
10. **Reuse the Digital Checklist extraction rules and its PDF viewer approach**, mapped to WorkOrder + `Measure_Point__c` (§4A). Out of scope: WOLI lookups, `PRT_Status__c` / `PrtStatusController`, `Digital_Checklist__c`, and writing marks back into the PDF (no `prtPdfExportBake`).

---

## 3. New metadata

### 3.1 Fields

| Object           | Field                       | Type                    | Notes                                                                                                             |
| ---------------- | --------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| WorkOrder        | `Raised_Task__c`            | Checkbox, default false | Set by Raise Task                                                                                                 |
| Measure_Point__c | `Source_Document__c`        | Text(18)                | ContentDocument Id of the PDF the point came from. The display name is read from `ContentDocument.Title` in Apex. |
| Measure_Point__c | `Page_Number__c`            | Number(4,0)             | 1-based page, from the prompt's `page_number`                                                                     |
| Measure_Point__c | `Page_Position_Estimate__c` | Text(10)                | Vertical position on the page, e.g. `20%` (same format as Digital Checklist)                                      |
| Measure_Point__c | `Table_Name__c`             | Text(255)               | Set only for measurement-table cells; groups them in the UI                                                       |

### 3.2 `Kiosk_App_Config__c`

One active record, org-wide. Proposed shape: a single `Settings_JSON__c` long-text field (or one field per key). Keys and defaults as in the mocks:

| Key           | Type                         | Default                                                                                                              | Surface                                              |
| ------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `assetTile`   | ordered field list           | `SerialNumber, Status, Asset_Type__c, FLOC__c`                                                                       | Asset Review: asset title tile                       |
| `assetDrawer` | map field → `R` / `E`        | Name R, SerialNumber E, Status E, Asset_Type__c R, FLOC__c R, Entitlement_Status__c R, InstallDate R, PurchaseDate R | Asset Review: ⓘ details drawer                       |
| `woTile`      | ordered field list           | `WorkType, Status, Priority, SAP_FLOC_Desc__c, Est_Labour_Hours__c`                                                  | Asset Review: WO title tile                          |
| `wtFilter`    | bool                         | true                                                                                                                 | Shared: work type focus chips                        |
| `wpTile`      | ordered field list           | `WorkType, Status, Priority, SAP_Work_Center__c, Est_Labour_Hours__c, Basic_Finish_Date__c`                          | Workpack header                                      |
| `wpNext`      | bool                         | true                                                                                                                 | Workpack next-step band                              |
| `wpProgress`  | `open` / `collapsed` / `off` | `open`                                                                                                               | Workpack progress panel default                      |
| `wpRings`     | list                         | `steps, measures, labour, parts, partsCost, components`                                                              | Rings shown; Overall = mean of shown rings with data |
| `wpOps`       | bool                         | true                                                                                                                 | Operations tab                                       |
| `wpTime`      | bool                         | true                                                                                                                 | Time records tab                                     |
| `wpRaised`    | bool                         | true                                                                                                                 | Raised tasks tab                                     |
| `wpView`      | `list` / `board`             | `list`                                                                                                               | Work orders tab default view                         |

Field catalogue offered in config (verified names):

- **Asset:** Name, SerialNumber, Status, Asset_Type__c, FLOC__c, Entitlement_Status__c, InstallDate, PurchaseDate.
- **WorkOrder:** WorkOrderNumber, WorkType, Status, Priority, StartDate, SAP_FLOC_Desc__c, SAP_Work_Center__c, Est_Labour_Hours__c, Est_Parts_Cost__c, Critical_Path__c, Shut_Scope__c, Basic_Finish_Date__c.

Editable asset fields (`E`) need FLS-checked update Apex.

Also needed: permission set updates for the new object and fields. Remember the Asset → Account → Contact read chain.

---

## 4. Apex changes (`KioskController` unless noted)

1. **Root scoping:** switch workpack-span queries from `Id = :wp OR ParentWorkOrderId = :wp` to `Id = :wp OR RootWorkOrderId = :wp` in the methods listed in §1. The child list in `getWorkOrderDetail` should use `RootWorkOrderId` too, so grandchildren show.
2. **`getWorkpackChildProgress(token, workpackId)`** (new). One row per child WO:
   - steps done/total: WorkStep under WorkPlan by WorkOrderId; Status Completed; exception plans excluded; **SYSTEM_MODE** (WorkPlan OWD is Private);
   - measures taken/total and findings count: taken = outcome set; findings = Attention Required or Scrap; bare findings = findings without Comments;
   - parts used/required: ProductConsumed vs ProductRequired COALESCE(WO, WorkType);
   - WO status, WorkType name, AssetId, asset name, L2 system asset (for Group by System).

   Use the same queries as `getWorkpackProgress`, plus GROUP BY WorkOrderId. Status colour is computed client-side with the rules in §6.

3. **`saveMeasurePoint`:** set `Work_Order__c` = the selected WO and `Asset__c` = that WO's `AssetId` (server-side). Set `Update_Date__c` = now on every outcome or value change.
4. **Measure DTO:** add `sourceDocumentId`, `sourceDocumentTitle`, `pageNumber`, `pagePositionEstimate`, `tableName`. `WorkpackPdfProcessor` stamps them on create (§4A).
5. **Raise Task** (extend `createAssetTask` or add a new method):
   - the WO goes on the selected asset, with the parent = workpack;
   - the work type comes from all WorkTypes (searchable);
   - set `Raised_Task__c = true`;
   - prefill subject/description.
6. **`getRaisedTasks(token, assetId)`:** WOs with `Raised_Task__c = true` on the asset and its sub-assets, across workpacks.
7. **`getKioskConfig(token)` / `saveKioskConfig(token, json)`:** read and upsert `Kiosk_App_Config__c`. Save is supervisor-only. Pass JSON strings, not custom-type params (DTO marshalling gotcha).
8. **`getWorkpackTimeRecords(token, workpackId)`:** read-only Time_Report__c rows for the workpack.
9. **Tests:** update `KioskControllerTest` for any `@AuraEnabled` signature change in the same change set.

10. **`getMeasurePdf(token, contentDocumentId)`** (new): returns the latest ContentVersion of that document as base64, for the Document panel.
    - Allow only documents linked (ContentDocumentLink) to the workpack or one of its children (`RootWorkOrderId`).
    - Cap the size (same approach as `getMeasureImages`, ~4.4 MB response limit). If it's over the cap, return a flag so the UI shows "too large to preview".
    - Without a token, it would serve any file. Validate the token first.

Do not mark new imperative reads `cacheable=true` (stale skeleton gotcha).

---

## 4A. PDF extraction and the Document panel (from `Cursor_2026/Digital Checklist complete`)

### 4A.1 What the Digital Checklist project does (source reviewed 2026-11-11)

- **Prompt `PRTMeasurementExtractor`** (version `_29`, Gemini Flash; input = ContentDocument). Not in the kiosk org. Rules worth copying:
  - A line is a component only if an "OK" / "Att. Req" marker follows it. Keep the text verbatim; strip the markers and any trailing ":".
  - Every item has `page_number` and `page_position_estimate` (e.g. "20%" down the page).
  - Measurement tables become one item per row-column combination, keeping the table name and multi-level header context.
  - Wrapped lines: join with no space when the first line ends in a hyphen, else one space.
  - Keep duplicates. Output one-line JSON, no code fences, no backslashes.
  - Output shape: `{"components":[{component, page_number, page_position_estimate}], "measurement_tables":[{table_combinations[], page_number, "Table Name", page_position_estimate}]}`.
- **Apex parse (`DigitalChecklistFromPromptAction`)**: `deserializeFirstJsonValue` + `findJsonEnd` (bracket matching) survive extra text around the JSON. Table rows get `Status = Measure` and the table name.
- **Viewer**: static resource `pdfjsHost` (iframe, runs PDF.js outside Lightning Web Security), driven by postMessage:
  - parent → host: `pdfjsHost:render {base64, pageNumber, availableWidth, availableHeight}`
  - host → parent: `ready`, `status`, `rendered {pageCount, pageNumber, …}`, `error`, `text {pages:[{pageNumber, items:[{t,x,y,w,h,f}]}]}`
  - `prtFormLocate` (`locate.js`, pure JS with tests): fuzzy-matches a label to a text line on the page. `positionPercent` is only a tie-break.
- Not reused: `prtAnnotator` (uiRecordApi writes, WOLI throughout, Salesforce-user ownership), `digitalChecklist` LWC (patterns only), `PrtAnnotationController`, `PrtStatusController`, `PRT_*` objects, `prtPdfExportBake`, the ContentDocumentLink trigger, Notification pieces.

### 4A.2 Extraction changes (manual only)

1. Keep the entry point: `processWorkpackButton` → `WorkpackPdfProcessor.processLatestPdf(workOrderId)`.
2. Deactivate `WorkpackPdfTrigger` and `WorkOrderWorkpackTrigger` (check the org's active status first).
3. Prompt: add the PRT rules above to the component part of `WorkpackExtraction`. It's Published, so add a new version and point `activeVersionIdentifier` at it (see the published-immutable gotcha), then verify by re-retrieve. The existing `maintenance_orders` structure stays. Each component/table cell carries `page_number`, `page_position_estimate` and (for cells) `table_name`.
   - Alternative: a separate kiosk prompt for components only. Decide during build after checking how `maintenance_orders` maps components to child WOs today.
4. Parse: port `deserializeFirstJsonValue` / `findJsonEnd` into `WorkpackPdfProcessor`.
5. Stamp each new `Measure_Point__c`:
   - `Source_Document__c` = the processed ContentDocument Id;
   - `Page_Number__c`, `Page_Position_Estimate__c`;
   - table cells: `Table_Name__c` and `Measure_Type__c = Measure`; `Component_Name__c` = "Row - Column".
6. Existing behaviour stays: delete and recreate WOLIs and points on reprocess. **Ron confirmed (2026-11-11):** reprocessing existing workpacks (00012423, 00010070) and replacing their measures is fine. Recorded outcomes are lost, and that's accepted. No matching or merge logic.

### 4A.3 Document panel (Asset Review → Measure tab → side panel "Document")

- New LWC `kioskPdfPane` (read-only). It loads the PDF through `getMeasurePdf` and renders it in the `pdfjsHost` iframe. It replaces the planned use of `pdfAnnotator` for this panel.
- Which PDF: the row's `Source_Document__c`. If that's blank (older points), fall back to the latest PDF on the workpack.
- Tapping a row or its 📄 chip:
  1. go to `Page_Number__c`;
  2. read that page's text only;
  3. call `locateLabelLine` (§4A.3a) with `Component_Name__c` (for table cells, split the row and column headers at the last " - ") and `Page_Position_Estimate__c` as the tie-break;
  4. highlight the matched line. If there's no match, highlight a band at the position estimate.
- Pager, zoom and fit-width. Page change keeps the list selection.
- List grouping on the Measure tab: by page, then by `Table_Name__c` (table cells shown as a grid of row × column, as in `digitalChecklist`).
- Copy into the kiosk repo: `pdfjsHost` + `pdfjs` + `pdfjsWorker` static resources (retrieve from the org) and `locate.js` (from the Digital Checklist project, with its tests).
- Fix while porting: the postMessage target origin is `'*'`; set it to the site origin.

### 4A.3a Findings from the code check (2026-11-11)

- **Static resource name clash (verified by SOQL).**
  - Org `pdfjs` and `pdflib` are **zips** from the Digital Checklist deploy of 2026-10-29: `pdfjs/pdf.min.js` + `pdfjs/pdf.worker.min.js`, and `pdfLib/pdf-lib.min.js`. Org `pdfjsWorker` is still the kiosk's single JS file.
  - The kiosk repo has `pdfjs.js` / `pdflib.js` as single JS files, and `pdfAnnotator` (used in `workExecution`) calls `loadScript(pdfjs)` on them. In the org that now loads a zip, so it is probably broken (not tested at runtime).
  - A full kiosk `force-app` deploy would overwrite the zips and break `prtAnnotator`.
  - **Fix:** the kiosk adopts the zip format. Retrieve the org zips into the repo, delete the single-file `pdfjs.js`/`pdflib.js`, and change `pdfAnnotator` to load `pdfjs + '/pdf.min.js'` and `pdflib + '/pdf-lib.min.js'`. Both projects use pdf.js 3.11.174.
- **`locateChecklistMark` alone doesn't fit.** It returns a tick or text _placement_, and it returns null unless status is ok/attention. The kiosk needs the matched _line_.
  - Port `locate.js` into a kiosk LWC module `kioskPdfLocate` and add an export `locateLabelLine(items, label, positionPercent)`. It wraps the internal `linesOf`, `numberedLine` and `bestLine` and returns `{x, y, w, h}` page fractions, or null.
- **Reuse `getAttachmentContent`** for the PDF bytes (it already exists, checks the token, caps at 4,000,000 bytes and returns `tooLarge`). It's missing a workpack scope check. Add a scope-checked wrapper `getMeasurePdf` that calls the same code (§4.10).
- **`WorkpackExtraction` today:** `checklist_items` is `List<String>` inside each `maintenance_orders` entry, and the model is `sfdc_ai__DefaultOpenAIGPT4OmniMini`. The new version changes `checklist_items` to objects `{component, page_number, page_position_estimate, table_name?}`. The parser must accept both a string and an object per item.
- **Config save gate:** `ServiceResource.Role__c` is a free-text String (no picklist), so "supervisor" can't be derived safely. Ask Ron which value marks supervisor/admin before building `saveKioskConfig`.

### 4A.4 Status mapping

| PDF marker   | `Measure_Type__c`                            |
| ------------ | -------------------------------------------- |
| OK           | OK                                           |
| Att. Req     | Attention Required                           |
| (table cell) | Measure                                      |
| none         | Scrap (kiosk-only outcome, never in the PDF) |

---

## 5. LWC changes

### 5.1 `workOrderDetail`: workpack layout (`isRailWorkpack`), per `workpack-redesign-v1.html`

Remove the Time Tracking clock panel, the Operations/Work Plans sidebar and the stacked panels. New top-to-bottom order:

1. **Header card:**
   - status dot, workpack name, asset chip;
   - big **Open Asset Review** button (top right);
   - `wpTile` fields;
   - description clipped to 2 lines with More / Less.
2. **Next step band** (hidden when `wpNext` = false). Rules in priority order:
   1. The first WO (workpack first, then children) with a finding that has no comment: "<num> (workpack): finding "X" has no comment" → **Open Asset Review** on that WO.
   2. Else, the children still to measure: "N child work orders still to measure. Next: <num> · <asset>" → **Open Asset Review**.
   3. Else, the first open child, sorted needs-attention first: "<num>: <that WO's next step>" → **Open Asset Review**.
   4. Else: "All child work orders complete. Run the release-to-traffic checks." → **Execute** (switches tab).
3. **Workpack progress panel:**
   - the existing `getWorkpackProgress` 6 KPIs + Overall, filtered by `wpRings`;
   - default state from `wpProgress`; workers toggle Hide ▴ / Show ▾;
   - collapsed = one line of n/m chips.
4. **Tab bar** (same style as Asset Review). Each tab shows an icon, a label and a sub-label. The page opens on the first tab.
   1. **Notes & codes**: the existing notes history + Cause/Delay/Damage selects. Sub-label: note count.
   2. **Execute**:
      - a **large Open Asset Review button first** (full width, 76px min height, sub-text "Measure, execute and add parts on the child work orders"); it opens the first child, or the workpack if there are no children;
      - **then** the workpack's own Work Plans: the existing plan-card/step-row, ▶ for flow steps, `handleStepClick`.
      - Sub-label: "x/y workpack steps".
   3. **Work orders**: child WO progress.
      - Work type focus chips at the top of the panel, inside the tab, only when `wtFilter` is on.
      - Status bar (Complete / Has finding / In progress / Not started): tap a segment or legend chip to filter.
      - View: **List** (default from `wpView`) or **Board** (4 status columns).
      - Group by: None / Work type / System (L2 asset) / Status. Each group gets its own status bar.
      - List row: status dot, WO number, subject, asset, mini bars for Steps / Measures (green OK + red findings) / Parts, and the next step. Sorted needs-attention first (red, amber, grey, green).
      - Tapping a row opens Asset Review on that WO (map highlight + its asset).
      - No per-child labour.
      - Sub-label: "done/total done · N with findings".
   4. **Operations** (`wpOps`): read-only WOLI list (number, subject/description, duration).
   5. **Time records** (`wpTime`): read-only Time_Report__c (who, start, end, minutes), plus a live row when the worker is clocked in here. Footnote: "Clock in / out is in the header".
   6. **Raised tasks** (`wpRaised`): raised WOs on the workpack asset tree.

### 5.2 `assetReview`: per `asset-review-redesign-v6.html`

Layout:

- **asset map** on top (icicle diagram for any asset type; Schematic option for wagons; breadcrumb zoom);
- **WO list** on the left (WOs on the selected asset ± sub-assets, grouped by asset; the workpack is pinned first);
- **WO workspace** on the right: title tile (`woTile`), next-step band, 5 tabs.

Workspace tabs:

- **Measure**:
  - one-tap outcome (OK / Attention / Scrap) and an inline value;
  - captured date/time from `Update_Date__c`;
  - Edit for comments, notes and defect location;
  - side panel: **Document** (`kioskPdfPane`, §4A.3; the PDF beside the list with a pager; the 📄 chip jumps to the page and highlights the matching line), **Trend** (row-aligned: numeric values over earlier WOs on the same asset + `Component_Name__c`, or an outcome timeline) or **Off**;
  - orange **Add Measure** button.
- **Execute**: the existing Work Plans panel (plan-card/step-row).
- **Parts**: the existing Required Parts table (Part · Consumed · Required · Cost · + Consume) plus "+ Add part".
- **Notes**: notes history + codes.
- **Raised**: raised tasks on the WO's asset and sub-assets, across workpacks.

Other behaviour:

- **Work type focus filter** (`wtFilter`):
  - chips come from the distinct WorkType names of WOs under the workpack (`RootWorkOrderId`);
  - multi-select filters the WO list, map colours, open counts and progress;
  - none selected = all.
- **Map highlight:** the selected WO's asset gets a blue outline (the map zooms out if needed). The tapped asset stays orange.
- **Smart collapse of the WO list** to a 68px rail:
  - auto-collapse on the Measure tab (when a side panel is on), Document/Trend, a 📄 chip, or any PDF control (pager, tools, page);
  - auto-expand on the map, a breadcrumb, a work-type chip or "Show all";
  - « collapses manually; 📌 pins the list open (proposed: remember the pin per worker);
  - the rail shows », WP plus each WO as a status dot + the last 3 digits (purple dot = raised), and Raise Task.
- **Raise Task** (header button and rail): modal with the asset (changeable within the hierarchy), a searchable work type, subject and description.
- **ⓘ Asset details drawer:** fields per `assetDrawer`, Read or Edit.
- One line icon set across tabs, panel headings and Raise Task. Shaded bands for the asset tile, the WO title, the next step and panel headings.
- **Deep link in:** open with a WO preselected (from the workpack page). Back returns to the workpack page.

### 5.3 `kioskHeader`

The clock in the worker chip works on every page: clock in, clock out, switch workpack. It uses the existing `ensureClockedIn` / `autoClockOut` / `getActiveClock`. Auto-clock on data change stays.

### 5.4 `kioskSidebar`

- New **Kiosk Config** item (supervisor/admin), next to Time Tracking.
- Bump `VERSION` (currently `v2.58`).

### 5.5 Kiosk Config page (new LWC, or a section in `workshopPortal`)

- Left nav by category, with one sub-section at a time on the right, a breadcrumb, and a live preview where relevant:
  - **Asset Review:** Asset title tile · Asset details drawer · Work order title tile
  - **Workpack page:** Header tile · Next step · Progress panel (default state + rings) · Tabs (Operations / Time records / Raised tasks) · Work orders tab (default view + chips toggle)
  - **Shared:** Work type focus filter
- Field lists: ✓ to include, ▲▼ to order. The drawer uses Read/Edit toggles.
- The Asset Review mock (v6) still shows the old flat config page. The categorized layout in the workpack mock is the one to build.

### 5.6 Kiosk LWC rules that apply to every new component

- Every input/select/textarea needs `onkeydown={handleInputKeydown}` (stopPropagation), plus the global CSS override.
- Use native `<select>`, not `lightning-combobox`.
- Record links: GenerateUrl href + Navigate on click.
- Textarea values preloaded in JS need a sync in `renderedCallback`.
- Images: `<img src>`, not CSS `url()`. Files: base64 via `@AuraEnabled`.

---

## 6. Status and KPI rules (shared by both pages)

Per WO (`woD`):

- **pending** = measures with no outcome.
- **findings** = Attention Required or Scrap.
- **bare** = findings without Comments.
- **steps** = steps of non-exception plans.
- **short parts** = consumed < required.

Status colour:

- **green**: WO Completed, OR (all steps done AND no pending AND no short parts AND the WO has at least one requirement).
- **red**: else, if there are findings.
- **amber**: else, if In Progress, any step done, or any measure recorded.
- **grey**: otherwise.
- Colours: grey #5b6b7c, amber #F2B441, red #E5484D, green #21C07A.

Asset status rolls up over the WOs on the asset and its descendants: any red = red; all green = green; any non-grey = amber; else grey.

WO next step, in order: record measures → comment bare finding → next undone step → consume parts → "no requirements" → complete.

Workpack KPIs: the existing `getWorkpackProgress` definitions.

- Steps: Completed / all, SYSTEM_MODE.
- Measures: taken / all.
- Labour: Time_Report__c minutes / WO DurationInMinutes.
- Parts: consumed / required.
- Parts cost: via the standard PricebookEntry, SYSTEM_MODE.
- Components: children with Status != New.
- Overall = mean of the rings that are shown and have data.

---

## 7. Open items (decide before or during build)

1. **Test before building `kioskPdfPane`:** does the `pdfjsHost` iframe load on the kiosk site? Root `/resource/...` URLs returned 503 before; the working form was `/wagonkiosk/resource/<name>`. Not verified.
2. Asset map diagram per `Asset_Type__c`: icicle by default, Schematic PNG for wagons. Who configures this, and where?
3. `Defect_Location__c` values are wagon-only. HT-02 needs more values, or a list per asset type.
4. `MeasureValue_Type__c` has no Voltage/Flow, so electrical readings have no fitting type.
5. Raise Task work type list: all WorkTypes, or filtered per asset type / a dedicated Defect type.
6. Pin and work-type selection persistence (per worker session): proposed, not decided.
7. `HMAC key` hardcoded in `KioskController` (pre-existing; move to `Kiosk_Setting__mdt` before production).
8. Seed-data caveats (no fix, by decision):
   - Many HT-02 points have `Asset__c` = the truck or blank.
   - PM01 children have blank placeholder points.
   - Maintainer Checks on HT-02 are wagon-style steps.

Sample data in the mocks, not real: workpack description, Work Center and Basic Finish values, operations, time records, labour hours, measure history and values, parts and costs, territory and crew names, and the 3 synthetic asset levels under Diesel Engine.

---

## 8. Suggested build order

1. Fields + `Kiosk_App_Config__c` + permission set (deploy, then verify by describe).
2. PDF: the `pdfjsHost` site test (§7.1); deactivate the two triggers; new prompt version; `WorkpackPdfProcessor` parse + stamping; reprocess 00012423 and 00010070 and check the page numbers against the PDFs.
3. Apex:
   - root scoping fix;
   - child rollup;
   - measure save stamping;
   - raised tasks;
   - config read/save;
   - time records;
   - tests.
4. `kioskHeader` clock and `kioskSidebar` Config item + Config page.
5. `workOrderDetail` workpack layout.
6. `assetReview` v6 features, including `kioskPdfPane`.
7. Bump `VERSION`, deploy, `/verify` on the iPad flow (00012423 and 00010070).
