# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Salesforce LWC + Apex kiosk app for Rio Tinto Rail wagon inspection workshops. Target org: `rsnov25demo` (`ron@rsfieldnov25.demo`). API version: 67.0.

## Commands

```bash
# Deploy all metadata to org
sf project deploy start -d force-app -o rsnov25demo

# Deploy a single component (faster iteration)
sf project deploy start -d force-app/main/default/classes/KioskController.cls -o rsnov25demo
sf project deploy start -d force-app/main/default/lwc/workshopPortal -o rsnov25demo

# Run Apex tests
sf apex run test -n KioskControllerTest -r human -w 10 -o rsnov25demo

# LWC Jest tests
npm run test:unit                  # run all
npm run test:unit:watch            # watch mode
npm run test:unit:coverage         # with coverage

# Lint
npm run lint

# Format (runs prettier on cls, html, js, xml, etc.)
npm run prettier
```

Run `npm install` once per checkout first. Without the local `node_modules`, `npx prettier` grabs a fresh prettier that fails with `Cannot find package 'prettier-plugin-apex'`.

Bump `VERSION` in `lwc/kioskSidebar/kioskSidebar.js` (shown at the bottom of the sidebar) on each kiosk release so the iPad shows which build is live.

## Architecture

### Auth flow

Three layers: (1) Supervisor Salesforce login → establishes `ServiceTerritory` for the kiosk station. (2) Worker session — short-lived, UI-only. Worker taps a roster tile, enters 4-digit PIN; `validateEmployee()` issues a signed HMAC token stored only in component memory. (3) iPad Guided Access locks the browser to the LWR URL.

Every Apex method after login receives the session token and calls `validateToken()` before doing anything. Token = `base64(workerId|territoryId|expiryMs|issuedAtMs|hmacSig)`. TTL 15 min sliding, absolute max 8 hours.

**⚠ HMAC key is hardcoded** in `KioskController.cls` line 7. Must move to `Kiosk_Setting__mdt` before production.

### State machine (`workshopPortal.js`)

```
BOOTING → SUPERVISOR_REQUIRED
        → ROSTER → LOGIN → DASHBOARD
                          → WORK_ORDERS → WORK_ORDER_DETAIL
                          → TIME_TRACKING
```

`workshopPortal` is the only component that holds `sessionToken`, `territoryId`, `selectedWorker`, and the idle timer. All child components receive what they need via `@api` props and fire events upward (`workerselected`, `authenticated`, `cancel`, `navigate`, `opendetail`, `back`).

### Barcode scanner

A hidden `<input data-id="barcode">` stays focused via `handleGlobalKeydown`. Rapid keystrokes (≥4 chars, ≤100ms apart) ending with Enter are treated as a HID badge scan. The captured string becomes `barcodeEmployeeId` and state jumps to LOGIN with no roster tile pre-selected.

### Keyboard input in form elements

Two things are required for every `<input>`, `<textarea>`, and `<select>` to accept keyboard input on the kiosk:

1. **CSS**: `workshopPortal.css` has a global override re-enabling text selection inside form elements (WebKit `user-select: none` blocks focus/typing).
2. **`onkeydown` propagation guard** on the element itself:
   ```html
   <input ... onkeydown="{handleInputKeydown}" />
   ```
   ```js
   handleInputKeydown(evt) { evt.stopPropagation(); }
   ```
   This prevents the global `handleGlobalKeydown` (which redirects all keystrokes to the barcode input) from stealing focus away from the field. Apply this pattern to every input in every LWC — both CSS and `stopPropagation` are needed.

The `handleGlobalKeydown` in `workshopPortal.js` also uses `evt.composedPath()[0]` (not `evt.target`) to detect whether the real inner element is an `INPUT`/`TEXTAREA`/`SELECT`, because LWC shadow DOM retargets `evt.target` to the child host element at the parent boundary.

### Apex data access pattern

`getWorkOrders` uses two different access modes deliberately:

- `WITH USER_MODE` on `AssignedResource` / `ServiceAppointment` / `ServiceCrewMember` queries (avoids FLS-stripping cross-object date filters)
- `AccessLevel.SYSTEM_MODE` on the final `WorkOrder` query (uses explicit binds; date filtering already applied upstream)

Most other queries use `WITH SECURITY_ENFORCED`.

`getWorkOrders` caps `pageSize` at **50** and returns `totalCount` (a `COUNT()` over the same `baseWhere`) plus `hasMore`. `searchAllWorkpacks` returns at most 200 rows with the same two fields.

### Work order list (`workOrderCards` + `workOrderCardList`)

- **`workOrderCards`** owns fetching, filtering and sorting. It requests 50 rows and keeps `totalCount` as `serverTotal`. When `serverTotal` is larger than the rows loaded, it shows an amber "Showing X of Y" note. Status/Priority/text filters and sorting run **client-side over the loaded rows only**, and the note says so. "Search" calls `searchAllWorkpacks` (org-wide, ignores dates, scope and filters).
- **Sorting** uses explicit rank maps (`PRIORITY_RANK`, `STATUS_RANK` with Open≈New and Closed≈Completed), not alphabetical order. Missing scheduled times always sort last, in either direction. Ties fall back to WO Number ascending.
- **`workOrderCardList`** is the shared, display-only card list. It takes raw `KioskController.WorkOrderCard` records (`@api records`) in display order, builds the display fields itself (wagon number, falling back to asset name with an "Asset" label; scheduled date + time; duration; badge classes), and fires `opendetail` with `{ workOrderId }`. It's used by both `workOrderCards` and the **Child Work Orders** panel in `workOrderDetail`. Parents forward its `opendetail` up to `workshopPortal`, because the event doesn't bubble. Change the card layout here, not in each parent.
- Card columns are a CSS grid shared across rows, so they line up. The narrow layout (chips move to their own row) uses a **container query** (`:host { container-type: inline-size }`, `@container (max-width: 1000px)`) rather than a media query, so it reacts to the panel's width. The detail panel is narrower than the screen.
- **Scheduled start** comes from the work order's ServiceAppointment. The main list reads it from the SA set already used for date filtering. Child work orders (`getWorkOrderDetail`) query the earliest SA by `SchedStartTime` for each child.

### PIN hashing

`verifyPin()` uses HMAC-SHA256 (`Crypto.generateMac`), not PBKDF2. `hashPin(pin)` returns `SALT||HASH` (base64 salt + `||` delimiter + base64 HMAC). Store split: `PIN_Salt__c` = salt, `PIN_Hash__c` = hash.

### Custom objects / fields required in org

Beyond standard FSL objects (`ServiceResource`, `ServiceTerritory`, `ServiceTerritoryMember`, `WorkOrder`, `ServiceAppointment`, etc.), the app needs:

- `ServiceResource`: `Employee_Id__c`, `PIN_Hash__c`, `PIN_Salt__c`, `PIN_Failed_Count__c`, `PIN_Locked_Until__c`, `Role__c`
- `ServiceTerritory`: `Kiosk_Notes__c`
- `WorkOrder`: `Wagon_Number__c`, `SAP_FLOC_Desc__c`, `SAP_Work_Center__c`, `External_ID__c`, `Supervisor_Notes__c`, `Cause_Codes__c`, `Work_Delay_Codes__c`, `Damage_Codes__c`
- `Time_Report__c` (custom object): `Work_Order__c`, `Resource_Name__c`, `Start_Time__c`, `End_Time__c`, `Duration_in_Minutes__c`, `Description__c`, `Related_To__c`
- `Measure_Point__c` (custom object): `Work_Order__c` (Lookup), `Component_Name__c` (Text 255), `Measure_Type__c` (Picklist: Attention Required/Measure/OK), `Comments__c` (Long Text), `Review_Notes__c` (Long Text), `Measure_Value__c` (Number 16,2), `MeasureValue_Type__c` (Picklist: Temperature/Pressure/Level/Width/Length), plus `Asset__c`, `Defect_Location__c`, `Update_Date__c`, `Work_Type__c`, and PDF provenance `Source_Document__c` (ContentDocument Id), `Page_Number__c`, `Page_Position_Estimate__c`, `Table_Name__c`
- `Kiosk_App_Config__c` (custom object): `Settings_JSON__c` — merged with defaults by `c/kioskConfigDefaults.mergeConfig`; saved via `saveKioskConfig` (Supervisor/Admin only, `ServiceResource.Role__c`)

Custom field metadata files are in `force-app/main/default/objects/`.

### Tests

`KioskControllerTest.cls` uses `@IsTest(SeeAllData=true)` — a broken org Flow trigger blocks `ServiceTerritoryMember` inserts, so tests run against live org data. `setupWorker()` finds an existing `ServiceResource` by `Employee_Id__c` or falls back to the supervisor's own SR.

**Coverage is very low.** As of 2026-10-02, all 16 tests pass but cover only **4%** of `KioskController`. Targeted deploys to `rsnov25demo` skip tests, so nothing enforces coverage today. A real Production org would require 75%.

No LWC Jest tests exist anywhere in `force-app`.

### Site platform

The kiosk runs on an **Aura-based** Experience Cloud site (not LWR). This is important because `lightning:flow` (the Aura component for running Screen Flows in a modal) is not available in LWC or LWR — it requires Aura.

### Flow activation (Aura host + Lightning Message Channel)

Screen flows are launched via a pub/sub bridge rather than a direct LWC import:

1. **`FlowLauncher__c` Lightning Message Channel** (`messageChannels/FlowLauncher.messageChannel-meta.xml`) — the shared bus. Fields: `messageType` (`open` | `result`), `flowApiName`, `recordId`, `requestId`, `status`.

2. **`aura/flowHost`** — an Aura component (`implements="forceCommunity:availableForAllPageTypes"`) placed once on the Experience site page. It subscribes to `FlowLauncher__c`, renders a standard SLDS modal containing `lightning:flow`, starts the requested flow via `flow.startFlow(apiName, inputs)`, and publishes a `result` message (`success` or `cancel`) back on the channel when the flow finishes or is closed.

3. **LWC side** (`workOrderDetail.js`) — imports `publish`/`subscribe` from `lightning/messageService` and `FLOW_LAUNCHER` from `@salesforce/messageChannel/FlowLauncher__c`. `_launchFlow(flowApiName, recordId)` returns a Promise: it publishes an `open` message with a unique `requestId`, stores the resolver, and resolves when the matching `result` message arrives.

**Why not `c/flowModal`?** The old `c/flowModal` LWC used `LightningModal` (a platform modal base class) and constructed a direct `/flow/<name>` URL. This required a published Experience page per flow and didn't integrate with `lightning:flow`'s status events. The Aura host pattern eliminates both constraints and works in the Aura runtime.

**Deployment order**: deploy the message channel first (`messageChannels/`), then `aura/flowHost`, then the LWCs that publish to it.

### Agentforce assistant (chat on the kiosk)

The `agentforceChat` LWC talks to the **`Rio_Tinto_Shutdown_Agent`** ("Supervisor Agent", Bot id `0XxIg0000008SDSKA2`) through the **Agent API**, mediated by `KioskAgentforceController`:

- **Runs as the supervisor** (a real SF user), not the worker. Workers aren't SF users, so the standard drop-in Agentforce/Embedded-Messaging components can't scope to them — the call is server-side from Apex instead.
- **Auth**: `KioskAgentforceController` calls out via the `Agentforce_API` Named Credential (OAuth client-credentials → External Client App "Workshop Client App", run-as supervisor). The token must be **JWT** and the EC scope field must be **empty**; `bypassUser:false`. Full setup + the 5 gotchas are in `Workshop Files/Agentforce Kiosk - Setup Guide.md`.
- **Endpoints**: `POST /einstein/ai-agent/v1/agents/{agentId}/sessions`, `POST .../sessions/{id}/messages`, `DELETE .../sessions/{id}`. Host `https://api.salesforce.com`.
- **Current work order context**: `sendMessage(token, text, seq, workOrderId)` resolves the WO (number/subject/status/wagon) and injects it into every message + as `Current_Work_Order` variables, so "this work order" works and follows the user as they switch orders.

**Rich responses (`agent-blocks`)**: agent replies can carry a fenced ` ```agent-blocks {"blocks":[...]} ``` `. `RenderBlocks.cls` extracts it (or heuristically parses markdown tables / activity lists), `KioskAgentforceController` returns it as `AgentReply.blocksJson`, and `agentRichBlocks` renders KPI/table/timeline/chart(bar/line/pie/donut, inline SVG)/calendar/carousel. Schema: `Workshop Files/Agentforce Rich Blocks - Schema.md`.

**Carousel drill-down**: carousel cards can carry a `workOrderId` field. Tapping the card image opens a fullscreen lightbox; the "Go to work order" button in the lightbox closes the chat panel (unless pinned) and fires a `drilldown` composed CustomEvent (`{ detail: { workOrderId } }`) up to `workshopPortal.handleChatDrilldown`, which navigates straight into that work order's detail screen. Event chain: `agentRichBlocks` → `handleGoToRecord` → `agentforceChat.handleDrilldown` (closes panel, re-dispatches) → `workshopPortal`.

**Agent chart actions**: `KioskBlocks.cls` holds the logic for 10 visualizations; 10 thin `AgentAction*` classes expose them as `@InvocableMethod`s (one invocable per class — a Salesforce limit). They're wired into the **Asset Insights** topic in `genAiPlannerBundles/Rio_Tinto_Shutdown_Agent/...`, each `invocationTargetType=apex` with `localActions/Asset_Insights/<Action>/{input,output}/schema.json`. The actions build blocks deterministically (numbers computed in Apex) and return them in the displayable `message` output.

**Measure Explorer (filtered measure drill-down)**: `KioskBlocks.measureExplorer` (`AgentActionMeasureExplorer` → `Chart_Measure_Explorer`) filters measure points by the user's own criteria — value threshold (`minValue`/`maxValue`), outcome (`measureOutcome` = Scrap/Attention Required/Measure/OK, comma-separated), and `valueType` — and returns a KPI summary + a **carousel** whose cards each carry a `details` array (`{label,value}` rows: Outcome, Value, Value Type, Component, Defect Location, Recorded, Comments) plus `workOrderId`. NL like "show me measures over 20" or "show scrap or require attention" maps to the inputs via planner instruction `ai_instr_5`. In `agentRichBlocks`, a carousel card with `details` (even without an `imageUrl`) is tappable → the lightbox renders the image (if any) plus the detail rows. Generic carousel feature — any action can populate `details`; schema in `Workshop Files/Agentforce Rich Blocks - Schema.md`.

**Theme prop**: both `agentforceChat` and `agentRichBlocks` accept a `theme` `@api` prop (`'dark'` | `'light'`). CSS class `theme-light` is toggled on the root element for light-mode kiosk pages.

**Deploying the agent bundle**: the agent can't be updated while **Active** — `sf agent deactivate --api-name Rio_Tinto_Shutdown_Agent` → `sf project deploy start -d <bundle>` → `sf agent activate ...`. This briefly interrupts live agent users.

### Demo workpack generator

`WorkpackDemoGenerator.generateDemoWorkpack(token)` builds a full self-contained workpack hierarchy from scratch in one DML transaction (Savepoint/rollback on failure). Resolves reference IDs (WorkType, Territory, Account) from the live source workpack `00010070`, then creates:

- 1 Wagon Asset (STRU) + 4 Wheelset Assets (WINC) each with 1 Axle child
- ~3 sample Measure Points per wheelset (OK / Attention Required / Measure)
- Root Rail Workpack WorkOrder (AssetId = wagon)
- Several Wagon PM01 child WorkOrders (+ 1 WOLI each) + 1 PM02 child

Called from the **"Generate Demo Workpack"** button in `kioskDashboard`. On success, fires `opendetail` event so `workshopPortal` navigates directly into the new workpack. Token is validated via `KioskController.isValidSession` before building.

### v3.0 redesign (workpack + Asset Review)

- `kioskWorkpack` (workpack tabs/rings/work-order list) is slotted into `workOrderDetail`; `assetReview` takes `initialWorkOrderId` (deep link) and `config`. Status/next-step rules live in `c/kioskStatus`; config schema/defaults in `c/kioskConfigDefaults`.
- Workpack scoping uses `ParentWorkOrderId = :id OR RootWorkOrderId = :id` (grandchildren exist).
- `kioskPdfPane` is a read-only PDF viewer (`showMeasure({documentId,pageNumber,componentName,pagePositionEstimate,tableName})`, `goToPage(n)`). It uses kiosk-owned static resources `kioskPdfjs`, `kioskPdfLib`, `kioskPdfjsHost` — never deploy the org's Digital Checklist `pdfjs`/`pdflib` zips. Extraction is manual only (`processWorkpackButton` → `processLatestPdf`); `WorkpackPdfTrigger` and `WorkOrderWorkpackTrigger` are Inactive. Reprocessing replaces measures.
- Revert: tag `v2.58-baseline` / branch `release/v2.58`.
- **assetReview selection**: `selectedWheelsetId` = L2, `selectedChildId` = L3, `rootSelected` = L1 (`activeAssetId` is null at the root, so measures/WOs are unscoped). Apex `getAssetTasks` / `getAssetReviewDetail` roll up one level only, so `loadRootDetail()` calls them per L2 and dedupes. `_followWtFilter()` re-picks the WO/asset when a work-type chip is toggled.
- **Forms as drawers**: every kiosk form opens in `c-kiosk-drawer` (render it only while open; it fires `close` on scrim / ✕ / Escape and the parent owns the open flag; `heading`, `subheading`, `size="md|lg"`, `slot="footer"` with `.k-drawer-actions`). Notes and Damage Code stay inline by design. Headless Chrome freezes CSS keyframe animations, so don't animate drawers if you screenshot them in the harness (`.sfdx/arh`).
- **Buttons (`c/kioskUi`)**: shared CSS module — add `@import "c/kioskUi";` to the component CSS and use `k-btn` + one role: `--primary` (save / commit only — orange means saving), `--nav`, `--nav-ghost`, `--form` (opens a form: Consume, Raise task…), `--secondary` (cancel / retry / reset), `--danger`, `--success`, `--link`; sizes `--sm`/`--lg`/`--block`/`--grow`; `k-icon-btn` for icon-only. When migrating a component, delete its old button rules (same specificity would override kioskUi). Button colours come from `--rt-btn-primary`, `--rt-btn-primary-hover`, `--rt-btn-form-text`, `--rt-btn-form-border` in `workshopPortal.css` (dark on `:host`, light in `.kiosk-root.theme-light`).
- **PDF pane behaviour**: `kioskPdfPane` auto-scrolls to the boxed line once (when the text-located line is known) and stops if the worker scrolls or changes page; a newer `showMeasure` wins over a slower download. In `assetReview` the pane stays mounted (hidden) when a measure has no document — don't wrap it in an `lwc:if`, that reloads the iframe and re-downloads the PDF. The kiosk host reads real PDF text + form-field labels only; picture reading (`imagetext.js`) was removed on purpose (load speed) — the Digital Checklist project still has its own copy.
- **Silent reload**: `workOrderDetail.reload()` (called after auto clock-in) refreshes without the loading spinner so the page under Asset Review doesn't jump.
- **kioskPdfjsHost protocol**: `render` takes `docKey` (host caches the parsed PDF; resend base64 only when the host replies `NEED_DOC`) and `fitWidth`.
- **Agentforce panel**: `workshopPortal` owns `chatOpen` / `chatPinned`; `kioskHeader` fires `togglechat`; `agentforceChat` takes `open` / `pinned` and fires `close` / `pinchange`. Pinned adds `.chat-docked` (padding-right) to `.kiosk-app`. Opening chat or a work order sets `sidebarCollapsed = true`.

### Measure point image attachments

`KioskController.getMeasureImages(token, measurePointIds)` returns base64 data URIs for the latest image `ContentVersion` linked to each measure point. Data URIs are used (not Salesforce content URLs) to avoid LWR CSP / cross-site-cookie issues with `/sfc/servlet.shepherd/` URLs. Capped at ~3 MB per image. `uploadMeasureImage(token, measurePointId, base64, filename, mimeType)` inserts a new `ContentVersion` + `ContentDocumentLink`. Both are called from `assetReview` — images load lazily when a wheelset is selected, and the add-image form stages a base64 preview before upload.

### Inspection Checklist (standard UI quick action, separate from the PIN kiosk)

`inspectionJobChecklist` is a Work Step record/screen action for **standard Salesforce UI / Field Service mobile** — not part of the `workshopPortal` PIN-session kiosk. `InspectionChecklistController.cls` resolves the parent WorkOrder from the WorkStep (falling back through `WorkOrderLineItem` if `ParentRecordId` is a WOLI), then exposes CRUD on `Measure_Point__c` rows: create (`saveMeasurePoint`), per-row type change (`updateMeasurePointType`, OK/Attention Required/Measure), comments (only when type = Attention Required), measure value+type (only when type = Measure), bulk "mark OK" (`markMeasurePointsOk`), and photo attach (`attachFileToMeasurePoint`, base64 `ContentVersion` insert — used instead of `lightning-file-upload`, which doesn't persist in some FSL mobile contexts).

`inspectionJobChecklistGlobal` is a thin wrapper that exposes the same component as a **global publisher action** (`lightning__GlobalAction`); global actions often don't receive `recordId`, so it falls back to `CurrentPageReference` attributes/state. The main `inspectionJobChecklist` bundle deliberately does **not** declare `lightning__GlobalAction` itself and closes its own screen-action panel by dispatching a raw `lightning__actionsclosescreen` CustomEvent rather than importing `lightning/actions` — importing it makes LWR/FSL mobile request `@salesforce/action/<QuickActionApiName>`, which 404s if the action metadata name doesn't match.

The instruction-image gallery wires to `FilePreviewController.getWorkOrderPngImages` — **this class is not in this repo** (org-only; same situation as other org-side schema described in "Org schema is far richer than the local repo" below). Don't assume it's missing/needs creating without checking the org first.

## Gotchas & lessons learned

Hard-won fixes from past sessions — check here before re-debugging.

### LWC `<textarea value={x}>` does not display a programmatically-set value

Binding `value={prop}` on a `<textarea>` reliably reflects user typing back to the property, but setting the
property **in JS** (preloading an edit form, auto-filling a default) does **not** repaint the textarea — it
stays visually empty even though the property (and any subsequent save) is correct. `<input>` does not have
this problem, which is why a Subject input preloads fine while Description/Comments textareas look blank.

**Fix**: push the value into the DOM node imperatively after render. Give the textarea a `data-id`, set a
one-shot flag when you change the value in JS, and sync in `renderedCallback`:

```js
// when opening edit form / auto-filling:
this.editDescription = value; this._syncDesc = true;
renderedCallback() {
  if (this._syncDesc) { this._syncDesc = false;
    const ta = this.template.querySelector('[data-id="editDescription"]');
    if (ta) ta.value = this.editDescription;
  }
}
```

Seen in `assetReview` (PM02 task edit) and `timeTrackingDashboard` (reject-reason auto-fill). Plain `<input>`
fields don't need this.

### Apex dynamic SOQL returns `SObject`, not the concrete type

`Database.query('SELECT … FROM WorkOrder …')` returns `List<SObject>`. Passing an element to a method typed
`mapTask(WorkOrder wo)`, or iterating `for (WorkOrder wo : Database.query(...))`, fails to compile
("Method does not exist or incorrect signature"). **Fix**: cast first —
`(List<WorkOrder>) Database.query(...)` — then pass/iterate.

### Anonymous Apex chokes on inner-class generics

In `sf apex run` scripts, `List<KioskController.TimeReportRow> x = ...` and casts like
`((List<KioskController.SomeInner>) o)[0]` throw `Unexpected token '<'`/`Unexpected token`. **Workaround**:
for verification scripts, call the method for its side effect and assert via a follow-up SOQL query on the
record, rather than typing the returned inner-class collection. (Real classes compile fine; this is an
anonymous-Apex parser limitation.)

### Permission-set object dependencies

Adding `Asset` read to a permission set fails deploy unless `Account` read is also granted; `Account` read in
turn requires `Contact` read. Grant the whole chain (`Asset` → `Account` → `Contact`) together.

### `KioskControllerTest` drifted from the controller (now fixed)

The test from the initial commit called old signatures `getWorkOrders(token, WorkOrderFilter)` and
`getDashboardMetrics(token)`, but the controller had moved to JSON/param signatures
(`getWorkOrders(token, String filterJson)`, `getDashboardMetrics(token, dateFrom, dateTo)`). This blocked
deploying the controller until the call sites were updated (`JSON.serialize(filter)`, `(token, null, null)`).
**Lesson**: when changing an `@AuraEnabled` signature, grep `KioskControllerTest.cls` for callers in the same change.

### Org schema is far richer than the local repo

Only a handful of field-meta XML files are tracked locally; the real schema lives in the org. Before assuming
a field/object/picklist value is missing, run `sf sobject describe -s <Obj> -o ron@rsfieldnov25.demo` against
the org. Examples that already existed (and did **not** need creating): `Measure_Point__c.Asset__c`,
`Defect_Location__c`, `Update_Date__c`, `MeasureValue_Type__c='Depth'`, `Measure_Type__c='Scrap'`, the wagon→
wheelset Asset hierarchy, and the `PM02` WorkType.

### Static-resource images in LWC

LWC sanitizes `url()` in inline styles, so `style="background-image:url(...)"` from a `@salesforce/resourceUrl`
import won't render. Use a real `<img src={resourceUrl}>` (see `assetReview` wagon diagram).

### Deploy verification via CLI

`sf project deploy start … --json` piped to a small python parser gives a clean status; the streaming text
output spams spinner frames that defeat `grep`. The stale `KioskControllerTest` runs on every full deploy
(SeeAllData) — deploy targeted paths (`-d <class> -d <lwc>`) for fast iteration, full `force-app` to validate.

Two more deploy notes:

- The CLI's "update available" warning can come before the JSON and break `json.load`. Either strip everything before the first `{` (`sed -n '/^{/,$p'`) or check the result with `sf project deploy report --use-most-recent -o rsnov25demo --json`.
- The salesforce-development plugin's deploy hook treats `rsnov25demo` as a **Production** org and blocks deploys unless the command starts with `CONFIRM_PROD=1`. Only use that override with the developer's explicit go-ahead.

### Use native `<select>`, not `lightning-combobox`, on the kiosk

`lightning-combobox` caused two problems in `workOrderCards`:

- Its dropdown list was **clipped** by any parent with `overflow` set (e.g. a horizontally scrolling filter bar).
- Its list renders in **light SLDS colours** that ignore the `--rt-*` dark theme.

Use a native `<select class="form-select">` instead, as `assetReview` and `workOrderCards` do. On the iPad it opens the iOS picker, is never clipped, and `color-scheme: dark` styles the list. Bind the selection with a `selected` flag on each `<option>`; setting `value` on the `<select>` runs before the `for:each` options render and doesn't stick. Read the new value from `evt.target.value` (not `evt.detail.value`), and keep `onkeydown={handleInputKeydown}` on it.

### Apex reserved/case-insensitive identifier clashes

Apex is case-insensitive, so a local variable named `json` collides with the `System.JSON` class →
`Method does not exist … from the type String` on `JSON.serialize`/`deserializeUntyped`. Likewise `desc`
is reserved (`Identifier name is reserved: desc`) and `inner` is reserved. Don't name vars `json`, `desc`,
or `inner` — use `rawJson`/`fenced`, `descr`, `body`. (Hit while building `RenderBlocks`/`KioskBlocks`.)

### One `@InvocableMethod` per Apex class

Salesforce allows only a single `@InvocableMethod` per class. To expose N agent actions, put the logic in
one helper class (`KioskBlocks`) and create N thin wrapper classes each with one `@InvocableMethod`
delegating to it (`AgentAction*`). Share the `@InvocableVariable` request/response types across wrappers.

### Agent (GenAiPlannerBundle) wiring

- Each action needs its OWN `<localActionLinks><functionName>…</functionName></localActionLinks>` — you
  cannot list multiple `<functionName>` in one `<localActionLinks>` (deploy error: "Element functionName is
  duplicated"). Apex actions use `<invocationTargetType>apex</invocationTargetType>` +
  `<invocationTarget>ClassName</invocationTarget>`, with `localActions/<Topic>/<Action>/{input,output}/schema.json`.
- The bundle can't deploy while the agent is **Active** ("Cannot update record as Agent is Active") —
  `sf agent deactivate` → deploy → `sf agent activate`.

### Agent API gotchas (token won't reach the agent)

Empty HTTP 404 from `api.salesforce.com` = the OAuth token isn't a JWT (enable "Issue JWT access tokens"
on the External Client App). `invalid_request: scope parameter not supported` = clear the External
Credential's Scope field. `invalid_app_access` = set Permitted Users + Run-As on the ECA Policies tab.
`Invalid user ID on start session` = use `bypassUser:false`. Full list in
`Workshop Files/Agentforce Kiosk - Setup Guide.md`.
