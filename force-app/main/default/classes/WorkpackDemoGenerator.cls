/**
 * Generates a complete, self-contained demo "workpack" hierarchy modelled on the
 * live WO "20213 Workpack" (00010070), for kiosk demos. Each run creates NEW records
 * (never touches the real WG 20213 / 00010070):
 *
 *   Wagon Asset (STRU)
 *     └─ 4 Wheelset Assets (WINC)   each with:
 *          └─ 1 Axle Asset
 *          └─ ~3 sample Measure Points (mix of OK / Attention Required / Measure)
 *   Root WorkOrder (Rail Workpack, AssetId = wagon)
 *     ├─ several child Wagon PM01 WorkOrders  (+ 1 WOLI each)
 *     └─ 1 child PM02 WorkOrder (AssetId = a wheelset)
 *
 * No WorkPlans/WorkSteps are created (out of scope). All-or-nothing via a Savepoint.
 */
public with sharing class WorkpackDemoGenerator {

    // Reference data resolved from the source workpack so we don't hardcode org ids.
    private static final String SOURCE_WO_NUMBER = '00010070';

    @AuraEnabled
    public static String generateDemoWorkpack(String token) {
        // Reuse the kiosk session guard.
        if (!KioskController.isValidSession(token)) {
            throw new AuraHandledException('SESSION_EXPIRED');
        }
        return build();
    }

    /** Internal builder (also callable from anonymous Apex / tests without a token). */
    public static String build() {
        Savepoint sp = Database.setSavepoint();
        try {
            return doBuild();
        } catch (Exception e) {
            Database.rollback(sp);
            throw new AuraHandledException('DEMO_GENERATION_FAILED: ' + e.getMessage());
        }
    }

    @SuppressWarnings('PMD.CyclomaticComplexity')
    private static String doBuild() {
        String ts = String.valueOf(System.now().getTime());
        String shortTs = ts.substring(ts.length() - 6);   // 6-digit suffix for labels

        // --- Resolve reference ids from the source workpack -------------------
        Id workpackTypeId, pm01TypeId, pm02TypeId, territoryId, accountId;
        List<WorkOrder> src = [
            SELECT WorkTypeId, ServiceTerritoryId, AccountId, SAP_FLOC_Desc__c
            FROM WorkOrder WHERE WorkOrderNumber = :SOURCE_WO_NUMBER LIMIT 1
        ];
        String floc = '3076WAG' + shortTs;
        if (!src.isEmpty()) {
            workpackTypeId = src[0].WorkTypeId;
            territoryId = src[0].ServiceTerritoryId;
            accountId = src[0].AccountId;
            if (String.isNotBlank(src[0].SAP_FLOC_Desc__c)) floc = src[0].SAP_FLOC_Desc__c;
        }
        for (WorkType wt : [SELECT Id, Name FROM WorkType WHERE Name IN ('Rail Workpack','Wagon PM01','PM02')]) {
            if (wt.Name == 'Rail Workpack') workpackTypeId = wt.Id;
            else if (wt.Name == 'Wagon PM01') pm01TypeId = wt.Id;
            else if (wt.Name == 'PM02') pm02TypeId = wt.Id;
        }

        String wagonNumber = 'DEMO-' + shortTs;

        // Date baselines so the timeline / calendar / measure-graph show real
        // progression (assets installed in the past; work + measures recent).
        Datetime now = System.now();
        Date wagonInstall = Date.today().addMonths(-18);
        Date wagonPurchase = Date.today().addMonths(-20);

        // --- 1. Wagon asset ---------------------------------------------------
        Asset wagon = new Asset(
            Name = 'WG ' + shortTs + ' (DEMO)',
            SerialNumber = 'WG ' + shortTs,
            Asset_Type__c = 'STRU',
            Status = 'Installed',
            AccountId = accountId,
            InstallDate = wagonInstall,
            PurchaseDate = wagonPurchase,
            ManufactureDate = wagonPurchase.addMonths(-2)
        );
        insert wagon;

        // --- 2. Four wheelsets ------------------------------------------------
        List<Asset> wheelsets = new List<Asset>();
        for (Integer i = 1; i <= 4; i++) {
            // stagger install dates so wheelsets aren't all identical
            Date wsInstall = wagonInstall.addMonths(i - 1);
            wheelsets.add(new Asset(
                Name = shortTs + ' Wheelset L' + i,
                SerialNumber = shortTs + '-WS-L' + i,
                Asset_Type__c = 'WINC',
                Status = 'Installed',
                ParentId = wagon.Id,
                AccountId = accountId,
                InstallDate = wsInstall,
                PurchaseDate = wsInstall.addDays(-14)
            ));
        }
        insert wheelsets;

        // --- 3. One axle per wheelset ----------------------------------------
        List<Asset> axles = new List<Asset>();
        for (Asset ws : wheelsets) {
            axles.add(new Asset(
                Name = ws.Name + ' Axle',
                SerialNumber = ws.SerialNumber + '-AX',
                Asset_Type__c = 'WINC',   // restricted picklist has no AXLE value
                Status = 'Installed',
                ParentId = ws.Id,
                AccountId = accountId,
                InstallDate = ws.InstallDate,
                PurchaseDate = ws.PurchaseDate
            ));
        }
        insert axles;

        // --- 4. Root workpack WO ---------------------------------------------
        Datetime rootStart = now.addDays(-14);
        WorkOrder root = new WorkOrder(
            Subject = shortTs + ' Workpack (DEMO)',
            Status = 'New',
            Priority = 'High',
            WorkTypeId = workpackTypeId,
            AssetId = wagon.Id,
            ServiceTerritoryId = territoryId,
            Wagon_Number__c = wagonNumber,
            SAP_FLOC_Desc__c = floc,
            SAP_Work_Center__c = 'MM',
            StartDate = rootStart,
            Expected_Completion_Date__c = Date.today().addDays(7)
        );
        insert root;

        // --- 5. Child work orders (small representative set) -----------------
        List<String> pm01Subjects = new List<String>{
            'Mech 200000KM Wagon Serv Off',
            'Brake Cylinder B Series C/O',
            'Replace Service Brake Portion',
            'C/O 200000KM Wagon Retainer Plate'
        };
        // Vary status + start date across children so charts/timeline/calendar
        // show a realistic spread (some done, some in progress, some new).
        List<String> childStatuses = new List<String>{ 'Completed', 'In Progress', 'New', 'New' };
        List<WorkOrder> children = new List<WorkOrder>();
        Integer dayStep = 0;
        for (Integer i = 0; i < pm01Subjects.size(); i++) {
            children.add(new WorkOrder(
                Subject = pm01Subjects[i],
                Status = childStatuses[Math.mod(i, childStatuses.size())],
                Priority = 'Medium',
                WorkTypeId = pm01TypeId,
                ParentWorkOrderId = root.Id,
                AssetId = wagon.Id,
                ServiceTerritoryId = territoryId,
                Wagon_Number__c = wagonNumber,
                SAP_FLOC_Desc__c = floc,
                SAP_Work_Center__c = 'MM',
                StartDate = rootStart.addDays(dayStep)
            ));
            dayStep += 2;
        }
        // One PM02 against a wheelset
        children.add(new WorkOrder(
            Subject = 'Replace the fixed knuckle',
            Status = 'In Progress',
            Priority = 'High',
            WorkTypeId = pm02TypeId,
            ParentWorkOrderId = root.Id,
            AssetId = wheelsets[0].Id,
            ServiceTerritoryId = territoryId,
            Wagon_Number__c = wagonNumber,
            SAP_FLOC_Desc__c = wagon.Name,
            StartDate = rootStart.addDays(dayStep)
        ));
        insert children;

        // --- 6. WOLI(s) per child — every line item gets a Subject + Description --
        // NOTE: an org automation auto-creates ~5 blank line items per WorkOrder.
        // We add our own AND backfill any blank auto-created ones so every WOLI
        // ends up with a Subject + Description.
        Map<Id, WorkOrder> childById = new Map<Id, WorkOrder>(children);
        List<Decimal> durs = new List<Decimal>{ 1.5, 0.5, 2.5, 0.5, 1 };
        List<WorkOrderLineItem> lineItems = new List<WorkOrderLineItem>();
        for (Integer i = 0; i < children.size(); i++) {
            String op = '00' + (i + 1) + '0';   // 0010, 0020, ...
            String subj = op + ' — ' + children[i].Subject;
            if (subj.length() > 255) subj = subj.substring(0, 255);
            lineItems.add(new WorkOrderLineItem(
                WorkOrderId = children[i].Id,
                Subject = subj,
                Description = 'Operation ' + op + ': ' + children[i].Subject
                    + '. Carry out the procedure per the workpack and record findings against the relevant measure points.',
                Duration = durs[Math.mod(i, durs.size())],
                DurationType = 'Hours'
            ));
        }
        insert lineItems;

        // Backfill any auto-created blank line items on these child WOs.
        List<WorkOrderLineItem> toFix = new List<WorkOrderLineItem>();
        Integer seq = 1;
        for (WorkOrderLineItem li : [
            SELECT Id, Subject, Description, WorkOrderId
            FROM WorkOrderLineItem
            WHERE WorkOrderId IN :childById.keySet()
        ]) {
            Boolean blankSubj = String.isBlank(li.Subject);
            Boolean blankDesc = String.isBlank(li.Description);
            if (!blankSubj && !blankDesc) continue;
            String woSubj = childById.containsKey(li.WorkOrderId) ? childById.get(li.WorkOrderId).Subject : 'Workpack operation';
            String op = '00' + seq + '0';
            seq++;
            if (blankSubj) {
                String s = op + ' — ' + woSubj;
                li.Subject = s.length() > 255 ? s.substring(0, 255) : s;
            }
            if (blankDesc) {
                li.Description = 'Operation ' + op + ': ' + woSubj
                    + '. Perform the task per the workpack and record findings.';
            }
            toFix.add(li);
        }
        if (!toFix.isEmpty()) update toFix;

        // --- 7. Sample measure points per wheelset ---------------------------
        // Stagger dates so the measure-graph (values over time) and timeline show
        // progression instead of every point landing on the same timestamp.
        List<Measure_Point__c> measures = new List<Measure_Point__c>();
        Integer wsIndex = 0;
        for (Asset ws : wheelsets) {
            // each wheelset inspected on a different recent day; 3 readings hours apart
            Datetime base = rootStart.addDays(wsIndex * 3 + 1);
            // OK item
            measures.add(new Measure_Point__c(
                Component_Name__c = 'Wheel profile inspection',
                Measure_Type__c = 'OK',
                Comments__c = 'Within tolerance.',
                Work_Order__c = root.Id,
                Asset__c = ws.Id,
                Update_Date__c = base
            ));
            // Numeric measure
            measures.add(new Measure_Point__c(
                Component_Name__c = 'Flange depth',
                Measure_Type__c = 'Measure',
                Measure_Value__c = 28 + Math.mod(ws.Name.length(), 5),
                MeasureValue_Type__c = 'Depth',
                Comments__c = 'Measured at rim.',
                Work_Order__c = root.Id,
                Asset__c = ws.Id,
                Update_Date__c = base.addHours(2)
            ));
            // Attention item with a defect location
            measures.add(new Measure_Point__c(
                Component_Name__c = 'Bearing condition',
                Measure_Type__c = 'Attention Required',
                Measure_Value__c = 22,
                MeasureValue_Type__c = 'Pressure',
                Defect_Location__c = 'Lower Lug',
                Comments__c = 'Elevated reading — monitor.',
                Work_Order__c = root.Id,
                Asset__c = ws.Id,
                Update_Date__c = base.addHours(4)
            ));
            wsIndex++;
        }
        insert measures;

        return root.Id;
    }
}
