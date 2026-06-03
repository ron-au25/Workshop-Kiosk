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

### LWR site

Not yet scaffolded. The `experiences/` folder does not exist. The permission set (`Workshop_Kiosk_Supervisor.permissionset-meta.xml`) is deployed but the site shell is pending.
