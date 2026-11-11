# Kiosk dependencies not in this repo (P0.3 audit, 2026-11-11)

Audit only. Nothing retrieved or deployed. Method: scripted scan of `lwc/`, `classes/`, `triggers/` against `force-app/main/default`. Ron marks the **Action** column; retrieval is a separate step.

Proposed action codes: **R** = retrieve into repo, **D** = seed-data / config note (not metadata), **X** = out of scope.

## 1. Apex classes

| Name                    | Referenced from                                                                   | In repo       | Proposed |
| ----------------------- | --------------------------------------------------------------------------------- | ------------- | -------- |
| `FilePreviewController` | `@salesforce/apex` import in `inspectionJobChecklist` (instruction image gallery) | no (org-only) | R        |

All other `@salesforce/apex` imports resolve to classes in the repo.

## 2. Static resources, message channels, labels

| Item                                         | Result                                                                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@salesforce/resourceUrl/*`                  | all resolve in repo. No `pdfjs` / `pdflib` / `pdfjsWorker` imports remain (P0.2 vendored `kioskPdfjs`, `kioskPdfLib`, `kioskPdfjsHost`). |
| `@salesforce/messageChannel/FlowLauncher__c` | in repo (`messageChannels/`).                                                                                                            |
| `@salesforce/label`, `@salesforce/schema`    | none used.                                                                                                                               |

Org still holds Digital Checklist zips named `pdfjs`, `pdflib`, `pdfjsHost` and single JS `pdfjsWorker`. Kiosk no longer uses or deploys them. Never include them in a revert deploy.

## 3. Objects and fields (referenced in Apex/triggers/LWC, absent from `objects/`)

Repo `objects/` holds only: `ServiceResource` (Employee_Id__c, PIN_*), `ServiceTerritory` (Kiosk_Notes__c), `Time_Report__c` (Status__c only), `WorkOrder` (Wagon_Number__c only), `WorkOrderLineItem` (empty).

Object definition missing entirely:

| Object                                                       | Used by                                                           | Proposed |
| ------------------------------------------------------------ | ----------------------------------------------------------------- | -------- |
| `Measure_Point__c` (object + all fields)                     | `KioskController`, `KioskBlocks`, `InspectionChecklistController` | R        |
| `Time_Report__c` (object definition; only Status__c tracked) | `KioskController`, `KioskBlocks`                                  | R        |

Field names referenced in code with no field file in repo (owning object per CLAUDE.md; **not verified against org in this audit**):

- `Measure_Point__c`: `Work_Order__c`, `Asset__c`, `Component_Name__c`, `Measure_Type__c`, `Comments__c`, `Review_Notes__c`, `Measure_Value__c`, `MeasureValue_Type__c`, `Defect_Location__c`, `Update_Date__c`
- `Time_Report__c`: `Work_Order__c`, `Resource_Name__c`, `Start_Time__c`, `End_Time__c`, `Duration_in_Minutes__c`, `Description__c`, `Related_To__c`
- `WorkOrder`: `SAP_FLOC_Desc__c`, `SAP_Work_Center__c`, `External_ID__c`, `Supervisor_Notes__c`, `Cause_Codes__c`, `Work_Delay_Codes__c`, `Damage_Codes__c`, `Expected_Completion_Date__c`
- `ServiceResource`: `Role__c`
- Unattributed (owning object to confirm): `Asset_Type__c`, `Comment__c`, `Entitlement_Status__c`, `FLOC__c`
- `FSL__GanttLabel__c`: managed-package (FSL) field, X.

Proposed: **R** for all custom fields above after owning object is confirmed with `sf sobject describe`. New fields from the redesign (spec §3.1) are created by Phase 1 and will be in the repo from the start.

## 4. Flows

| Flow                                                   | How referenced                            | In repo | Proposed |
| ------------------------------------------------------ | ----------------------------------------- | ------- | -------- |
| `RS_SFS_TAKE5_DC_WS`                                   | work-plan step data                       | yes     | none     |
| `RS_SFS_Notification_Form`                             | work-plan step data                       | yes     | none     |
| `RS_SFS_Create_Notification_DC_WS`                     | work-plan step data (00012423 / 00010070) | no      | R        |
| `RS_SFS_Work_Delay_DC_WS`                              | work-plan step data                       | no      | R        |
| `RS_Hazard_Data_Capture_Form_SFS_Mobile`               | work-plan step data                       | no      | R        |
| `RS_SFS_Create_Noti_Case_from_Measure_Point_Attention` | work-plan step data                       | no      | R        |

No flow API names are hard-coded in `lwc/` or `classes/`; the kiosk launches whatever the work plan step names. Missing flows break only those steps. The org also has a broken "SDO SFS Attach Forms" flow that blocks WO inserts in tests; not kiosk-owned (X).

## 5. Data literals (seed-data note, not metadata)

| Literal                            | Where                                                                                 | Proposed |
| ---------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| WorkType `Rail Workpack`           | `WorkpackDemoGenerator:59`, `KioskController:1154`                                    | D        |
| WorkType `Wagon PM01`              | `WorkpackDemoGenerator:59`, `WorkpackPdfProcessor:93` (throws if missing)             | D        |
| WorkType `PM02`                    | `WorkpackDemoGenerator:59`, `KioskController:3571` (throws `PM02_WORKTYPE_NOT_FOUND`) | D        |
| WorkType name pattern `%Workpack%` | `WorkOrderWorkpackTrigger:22` (trigger to go Inactive)                                | D        |
| Demo source workpack `00010070`    | `WorkpackDemoGenerator` resolves ids from it                                          | D        |

## 6. Credentials, templates, permission sets, triggers

| Item                                                                                         | In repo                                        | Note                                                                   |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| Named credential `Agentforce_API` (`callout:Agentforce_API`, `KioskAgentforceController:18`) | yes, plus `externalCredentials/Agentforce_API` | secrets/ECA client are org config, D                                   |
| Prompt template `WorkpackExtraction` (`WorkpackPdfProcessor:226`)                            | yes                                            | Published versions are immutable; Phase 2 adds a new version           |
| Permission sets `Workpack_Processor`, `Workshop_Kiosk_Supervisor`                            | yes                                            | Phase 1 adds config-object access                                      |
| Triggers `WorkpackPdfTrigger`, `WorkOrderWorkpackTrigger`                                    | yes (Active in org)                            | Phase 1 sets both Inactive                                             |
| Quick action `WorkOrder.Process_Workpack_PDF`                                                | yes                                            | stays manual entry point                                               |
| Custom metadata types                                                                        | none in repo                                   | `Kiosk_Setting__mdt` (HMAC key) not yet created, see CLAUDE.md warning |

## Open items for Ron

1. Approve R rows, then retrieve with `sf project retrieve start -m <Type>:<Name> -o rsnov25demo`.
2. Supervisor marker for config-save gate: `ServiceResource.Role__c` is free text with no supervisor value. Need the value or another mechanism before P3.6.
3. Site URL for the P0.1 browser test of `kioskPdfjsHost` under `/wagonkiosk/resource/`.
