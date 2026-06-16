# Wagon Asset Review page (NDT & inspections)

> **Status: ✅ Built, deployed to `rsfieldnov25.demo`, and verified end-to-end (2026-06-15).**
> This file was originally the implementation plan; it now documents the as-built feature.

## Context

The Workshop Kiosk lets workshop crews work a **Rail Workpack** work order for a wagon. Previously the
workpack page (`workOrderDetail`) showed child WOs, clock-in, notes/codes, and a Work Execution overlay for
measure points scoped to a *work order*. There was no view that presented the **physical wagon** and its
**4 wheelsets** as assets.

This feature adds a **Wagon Asset Review** page, reachable from the workpack via an "Open Wagon Asset" button,
that lets a worker: see the wagon + 4 wheelsets with at-a-glance status, record NDT/inspection measures
against a specific wheelset, visualise measure trends, edit asset serials, and raise PM02 follow-up tasks —
all in the existing dark kiosk look-and-feel.

### Key constraint — used existing schema only (no new objects/fields)
Everything needed already existed in the live org. Verified via `sf sobject describe`:

- **`Measure_Point__c`**: `Asset__c` (lookup→Asset), `Defect_Location__c` (picklist: *Lower Lug, Ribs, Palm,
  Upper Pulling Lug, Lower Pulling Lug, Uper Knuckle Pin Hole, Lower Knuckle Pin Hole, Back Radius*),
  `Update_Date__c`, `Work_Order__c`, `Component_Name__c`, `Comments__c`, `Review_Notes__c`, `Measure_Value__c`.
  `MeasureValue_Type__c` includes **Depth**; `Measure_Type__c` includes **Scrap** (+ *Attention Required,
  Measure, OK*).
- **`Asset`**: `Name`, `SerialNumber`, `Status`, `Entitlement_Status__c` ("Warranty Status"), `InstallDate`,
  `PurchaseDate`, `FLOC__c`, `Asset_Type__c`, `ParentId`/`RootAssetId`.
- **Hierarchy (real data)**: workpack WO `00010070` → `AssetId` = wagon **WG 20213** (`Asset_Type__c=STRU`) → 4
  children **"20213 Wheelset L1…L4"** (`Asset_Type__c=WINC`).
- **`WorkType` "PM02"** exists. WorkOrder has `AssetId`, `ParentWorkOrderId`, `ServiceTerritoryId`.

---

## What was built

New LWC **`assetReview`** opened as an **in-place overlay** from `workOrderDetail` (same pattern as the
existing `showExecution`/`c-work-execution` overlay — no `workshopPortal` state-machine changes). Fires a
`back` event to return to the workpack.

### 1. Static resource — wagon diagram ✅
- `force-app/main/default/staticresources/WagonDiagramTop.png` (+ `.resource-meta.xml`, Public, image/png),
  copied from `Workshop Files/Wagon Diagram Top.png`.
- Imported in the LWC via `import WAGON_DIAGRAM from '@salesforce/resourceUrl/WagonDiagramTop';` and rendered
  as an `<img>` (LWC sanitizes `url()` in inline styles, so a real `<img>` is used, not `background-image`).

### 2. Apex — `KioskController.cls` ✅
All new methods follow the existing `validateToken(token)` guard (`AuraHandledException('SESSION_EXPIRED')`).

- **`MeasurePointDTO` extended** with `workOrderId`, `assetId`, `defectLocation`, `updateDate`. Backward
  compatible — also consumed by the existing `workExecution` component.
- **`saveMeasurePoint` fixed** (previously never set `Work_Order__c`, orphaning kiosk-created points). Now
  sets `Work_Order__c`, `Asset__c`, `Defect_Location__c`; **defaults `MeasureValue_Type__c` to `'Depth'`**
  when type is `Measure` and none supplied; **always stamps `Update_Date__c = DateTime.now()`**. A shared
  `mapMeasurePoint()` helper now backs every read so all measure-point queries return the same shape.
- **`getWagonAsset(token, workOrderId)` → `WagonDTO`**: resolves the WO's wagon asset, its child wheelsets
  (`ParentId`), and computes each wheelset's **status dot** by aggregating its measure points:
  - `red` if any point is `Attention Required` or `Scrap`;
  - else `green` if any point has a real measure recorded (`Measure_Value__c` set, or type `Measure`/`OK`);
  - else `grey` (no activity — empty PDF-checklist placeholders stay grey).
- **`getMeasurePointsByAsset(token, assetId)`** — measure points for one wheelset.
- **`getAssetTasks(token, assetId)`** — PM02 WorkOrders on the asset.
- **`createAssetTask(token, reqJson)`** — creates a WorkOrder: `WorkType=PM02`, `ParentWorkOrderId`=workpack,
  `AssetId`=selected wheelset (**fallback** to the workpack's asset if blank), `Status='New'`,
  `ServiceTerritoryId` inherited from the workpack.
- **`updateAssetSerial(token, assetId, serialNumber)`** — updates `Asset.SerialNumber`.
- **`WorkOrderDetail` DTO** now exposes `assetId` (drives the "Open Wagon Asset" button visibility).
- Charts need no Apex — built client-side from the loaded measure points.

### 3. LWC `assetReview` ✅ (`force-app/main/default/lwc/assetReview/`)
`@api workOrderId`, `@api sessionToken`, `@api workerName`. Reuses kiosk CSS vars/buttons/forms.

- **Top bar**: `‹ Back to Workpack`, wagon name + status pill + FLOC chip.
- **Wagon diagram**: PNG with 4 absolutely-positioned clickable zones (L1–L4), each with a grey/green/red
  status dot, plus a legend. Zone coordinates live in `ZONE_LAYOUT` (percentage-based — tunable to the art).
- **Performance graphs**: custom **SVG** line charts, one per `MeasureValue_Type` present; x-axis = wheelsets
  L1–L4, y-axis = average `Measure_Value__c`. Dark-theme styled after `Break Performance Diagram.png`.
- **Selected-wheelset detail** (after tapping a zone):
  - **Asset Overview** (collapsible): Name, **editable Serial Number** + Save, Status, Warranty Status,
    Install/Purchase dates, FLOC.
  - **Left — Measure Points**: card list + "+ New Measure" form (segmented type incl. *Scrap*; value + type
    defaulting to **Depth**; **Defect Location** picklist; comments; review notes). Saves with
    `assetId`=wheelset, `workOrderId`=workpack.
  - **Right — PM02 Tasks**: card list + "+ New PM02 Task" form.
  - Every `<input>/<textarea>/<select>` has `onkeydown={handleInputKeydown}` (`stopPropagation`) per the
    kiosk barcode-focus requirement.

### 4. Entry button in `workOrderDetail` ✅
- HTML: "Open Wagon Asset" button (`.btn-wagon-asset`, accent-2 blue) above Time Tracking in the Rail Workpack
  block, shown only when `detail.assetId` exists; plus an overlay branch (`lwc:elseif={showAssetReview}`).
- JS: `showAssetReview` state, `handleOpenAssetReview` / `handleAssetReviewBack`, `hasAsset` getter.

### 5. `workExecution.js` ✅
Now passes `workOrderId` in its `saveMeasurePoint` requests (both the form save and Mark-OK) so its own
saves stop orphaning after the Apex fix.

### 6. Permission set `Workshop_Kiosk_Supervisor` ✅
- `WorkOrder`: enabled `allowCreate`/`allowEdit` (for PM02 task creation).
- Added object perms: **Asset** (read/edit), and **Account** + **Contact** (read) — required dependencies of
  Asset read.
- Added FLS: `Measure_Point__c.Asset__c` / `.Defect_Location__c` / `.Update_Date__c`; `Asset.SerialNumber`
  (edit), `Asset.Entitlement_Status__c` / `.FLOC__c` / `.Asset_Type__c` (read).

---

## Files
- **New**: `force-app/main/default/lwc/assetReview/{assetReview.js,.html,.css,.js-meta.xml}`
- **New**: `force-app/main/default/staticresources/WagonDiagramTop.png` + `.resource-meta.xml`
- **Edit**: `force-app/main/default/classes/KioskController.cls`
- **Edit**: `force-app/main/default/classes/KioskControllerTest.cls` *(see note below)*
- **Edit**: `force-app/main/default/lwc/workOrderDetail/{workOrderDetail.html,.js,.css}`
- **Edit**: `force-app/main/default/lwc/workExecution/workExecution.js`
- **Edit**: `force-app/main/default/permissionsets/Workshop_Kiosk_Supervisor.permissionset-meta.xml`

### Note: pre-existing stale test fixed in passing
`KioskControllerTest` (from the initial commit) called old signatures `getWorkOrders(token, WorkOrderFilter)`
and `getDashboardMetrics(token)`, but the controller had already moved to `getWorkOrders(token, filterJson)`
and `getDashboardMetrics(token, dateFrom, dateTo)` — unrelated to this feature, but it blocked deploying the
controller. Updated 4 call sites to the current signatures (`JSON.serialize(filter)` and `(token, null, null)`).

---

## Verification (all passed ✅)
1. **Deploy**: `sf project deploy start -d force-app -o ron@rsfieldnov25.demo` — succeeded.
2. **`getWagonAsset`** (WO `00010070`): returned wagon **WG 20213** + 4 wheelsets with correct labels (L1–L4),
   warranty status, and FLOC.
3. **Write paths** (anonymous Apex, then cleaned up):
   - Saved a Measure on **L2** → persisted with `Work_Order__c`, `Asset__c=L2`, `MeasureValue_Type__c=Depth`
     (defaulted), `Defect_Location__c=Palm`, `Update_Date__c≈now`. Orphan bug confirmed fixed.
   - Wagon status recomputed: **L2 = green**, L1/L3/L4 = grey.
   - Created a **PM02 task** → WO `00010694`, `WorkType=PM02`, `ParentWorkOrderId`=workpack, `AssetId=L2`,
     `Status=New`, `ServiceTerritoryId` matching the workpack.
4. **Apex tests**: `KioskControllerTest` — **16/16 passing, 100%**.

## Follow-ups / known tuning
- **Diagram zone positions** (`ZONE_LAYOUT` in `assetReview.js`) are percentage-based estimates over the
  2490×800 PNG — nudge so each zone sits exactly over its bogie when viewed in the browser.
- HMAC key remains hardcoded in `KioskController.cls` (pre-existing; move to `Kiosk_Setting__mdt` before prod).

---

## Update — UX & PM02 enhancements (2026-06-15, round 2) ✅ deployed & verified

1. **Diagram alignment** — nudged the **L2** clickable zone right (`ZONE_LAYOUT` L2 `left` 27% → 30%) to sit
   over the wagon edge.
2. **Collapsible top panels** — the **Wheelsets** diagram and **Measure Performance** panels are now
   collapsible (▾/› headers). On the *first* wheelset selection both auto-collapse so the detail is
   front-and-centre; the user can re-expand either anytime. When the diagram is collapsed, a compact
   **indicator strip** (L1–L4 chips with status dots + selected highlight) stays visible and remains a working
   selector.
3. **Mark-OK on measures** — each measure card now has a green **✓** button beside Edit (hidden when already
   `OK`); saves the point as `Measure_Type__c='OK'` and re-computes the wheelset status dot. Mirrors the
   `workExecution` pattern.
4. **PM02 task editing** — task cards have an edit (✏️) button. `getAssetTasks` now returns the full field set;
   the form **preloads** current values and `updateAssetTask` saves changes (status, comments, etc.).
5. **Full PM02 create/edit form** — fields: Subject, Description, **Cause Codes** (picklist, shared values with
   `workOrderDetail`), **Delay Codes** (picklist), **Start Date** (datetime-local), **Component** (=
   `SAP_FLOC_Desc__c`, defaults to the wagon FLOC), **Duration (hrs)** (→ `Duration` + `DurationType='Hours'`),
   **Maintenance Order** (= `Priority` picklist), **Status** picklist, **Comments** (= `Comment__c`).
   WorkType remains PM02.

**Apex**: `TaskWoDTO` + `CreateTaskRequest` extended; shared `mapTask()` / `applyTaskFields()` /
`queryTaskById()` helpers; **new `updateAssetTask(token, reqJson)`**; `createAssetTask` now applies all fields.
**Permission set**: `WorkOrder.SAP_FLOC_Desc__c` made editable; added `WorkOrder.Comment__c` (edit).

**Verified**: created a full PM02 (`00010695`) with all fields persisted (priority High, 4.5 Hours, cause code,
FLOC component, start date, comments); updated it (status New→In Progress, comments) — confirmed in DB; status
dot recompute on measure save/Mark-OK works; `KioskControllerTest` still 16/16 passing. Test data cleaned up.

---

## Update — Time Tracking review workflow (2026-06-15, round 3) ✅ deployed & verified

Adds an approval workflow to the **Time Tracking** page (`timeTrackingDashboard`).

1. **New field** `Time_Report__c.Status__c` — restricted picklist **New / Submitted / Approved / Rejected**
   (default New). Field metadata: `objects/Time_Report__c/fields/Status__c.field-meta.xml`; FLS added to the
   permission set. *(This is the only schema addition in the project — the user explicitly requested it.)*
2. **Click a row to edit** — opens a modal to change **Start/End times** (datetime-local), **Status**, and
   **Description**.
3. **Rejection rules** — Rejected requires a Description; on selecting Rejected the description **defaults to
   the single most-specific rule violation** (priority SHORT > LONG > VARIANCE > ACTIVE > none). Enforced both
   client-side and in Apex (`REJECT_NEEDS_DESCRIPTION`).
4. **Status filter** — a second filter row (All / New / Submitted / Approved / Rejected) alongside the existing
   validation-flag filters; a **Status** column with a colored pill was added to the table.
5. **Bulk status changes** — a checkbox per row + header **select-all (current filter)**; when ≥1 selected, a
   bulk action bar offers **Approve / Submit / Reject**. Bulk Reject auto-fills each record's description with
   *its own* rule-violation text.

**Apex** (`KioskController`): `TimeReportRow` gained `status`, `description`, `violationReason`; new
`TimeReportEditRequest`; new methods `updateTimeReport`, `bulkUpdateTimeReportStatus`, `getRejectionDefault`;
shared helpers `violationReasonText()`, `computeFlag()`, `reloadTimeReportRows()`. Dashboard query now selects
`Status__c, Description__c`.

**Verified** (anonymous Apex + DB checks): `getRejectionDefault` on a 5-min entry → "Duration is under 10
minutes."; bulk Reject set status=Rejected with that text; row edit changed start/end times + status→Approved;
reject-without-description guard throws; `KioskControllerTest` 16/16 passing. Test data cleaned up.
