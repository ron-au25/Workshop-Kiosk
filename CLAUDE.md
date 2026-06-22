# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Salesforce LWC + Apex kiosk app for Rio Tinto Rail wagon inspection workshops. Target org: `rsnov25demo` (`ron@rsfieldnov25.demo`). API version: 66.0.

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
   <input ... onkeydown={handleInputKeydown} />
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

### PIN hashing

`verifyPin()` uses HMAC-SHA256 (`Crypto.generateMac`), not PBKDF2. `hashPin(pin)` returns `SALT||HASH` (base64 salt + `||` delimiter + base64 HMAC). Store split: `PIN_Salt__c` = salt, `PIN_Hash__c` = hash.

### Custom objects / fields required in org

Beyond standard FSL objects (`ServiceResource`, `ServiceTerritory`, `ServiceTerritoryMember`, `WorkOrder`, `ServiceAppointment`, etc.), the app needs:

- `ServiceResource`: `Employee_Id__c`, `PIN_Hash__c`, `PIN_Salt__c`, `PIN_Failed_Count__c`, `PIN_Locked_Until__c`, `Role__c`
- `ServiceTerritory`: `Kiosk_Notes__c`
- `WorkOrder`: `Wagon_Number__c`, `SAP_FLOC_Desc__c`, `SAP_Work_Center__c`, `External_ID__c`, `Supervisor_Notes__c`, `Cause_Codes__c`, `Work_Delay_Codes__c`, `Damage_Codes__c`
- `Time_Report__c` (custom object): `Work_Order__c`, `Resource_Name__c`, `Start_Time__c`, `End_Time__c`, `Duration_in_Minutes__c`, `Description__c`, `Related_To__c`
- `Measure_Point__c` (custom object): `Work_Order__c` (Lookup), `Component_Name__c` (Text 255), `Measure_Type__c` (Picklist: Attention Required/Measure/OK), `Comments__c` (Long Text), `Review_Notes__c` (Long Text), `Measure_Value__c` (Number 16,2), `MeasureValue_Type__c` (Picklist: Temperature/Pressure/Level/Width/Length)

Custom field metadata files are in `force-app/main/default/objects/`.

### Tests

`KioskControllerTest.cls` uses `@IsTest(SeeAllData=true)` — a broken org Flow trigger blocks `ServiceTerritoryMember` inserts, so tests run against live org data. `setupWorker()` finds an existing `ServiceResource` by `Employee_Id__c` or falls back to the supervisor's own SR.

### Site platform

The kiosk runs on an **Aura-based** Experience Cloud site (not LWR). This is important because `lightning:flow` (the Aura component for running Screen Flows in a modal) is not available in LWC or LWR — it requires Aura.

### Flow activation (Aura host + Lightning Message Channel)

Screen flows are launched via a pub/sub bridge rather than a direct LWC import:

1. **`FlowLauncher__c` Lightning Message Channel** (`messageChannels/FlowLauncher.messageChannel-meta.xml`) — the shared bus. Fields: `messageType` (`open` | `result`), `flowApiName`, `recordId`, `requestId`, `status`.

2. **`aura/flowHost`** — an Aura component (`implements="forceCommunity:availableForAllPageTypes"`) placed once on the Experience site page. It subscribes to `FlowLauncher__c`, renders a standard SLDS modal containing `lightning:flow`, starts the requested flow via `flow.startFlow(apiName, inputs)`, and publishes a `result` message (`success` or `cancel`) back on the channel when the flow finishes or is closed.

3. **LWC side** (`workOrderDetail.js`) — imports `publish`/`subscribe` from `lightning/messageService` and `FLOW_LAUNCHER` from `@salesforce/messageChannel/FlowLauncher__c`. `_launchFlow(flowApiName, recordId)` returns a Promise: it publishes an `open` message with a unique `requestId`, stores the resolver, and resolves when the matching `result` message arrives.

**Why not `c/flowModal`?** The old `c/flowModal` LWC used `LightningModal` (a platform modal base class) and constructed a direct `/flow/<name>` URL. This required a published Experience page per flow and didn't integrate with `lightning:flow`'s status events. The Aura host pattern eliminates both constraints and works in the Aura runtime.

**Deployment order**: deploy the message channel first (`messageChannels/`), then `aura/flowHost`, then the LWCs that publish to it.

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
