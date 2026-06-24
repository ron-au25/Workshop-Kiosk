/**
 * SeeAllData: the generator resolves reference ids (WorkType, ServiceTerritory, Account)
 * from the live source workpack, and the org's "SDO SFS Attach Forms On Create" flow
 * participates in WorkOrder DML — so the test runs against real org metadata, like
 * KioskControllerTest. It generates a demo workpack, asserts the full tree, then rolls back.
 */
@IsTest(SeeAllData=true)
private class WorkpackDemoGeneratorTest {

    @IsTest
    static void generatesFullHierarchy() {
        // Test DML is never committed (rolled back automatically at test end),
        // so no explicit savepoint/rollback is needed even with SeeAllData.
        Test.startTest();
        Id rootId = WorkpackDemoGenerator.build();
        Test.stopTest();

        System.assertNotEquals(null, rootId, 'root WO id returned');

        WorkOrder root = [SELECT Id, AssetId, Wagon_Number__c, Subject FROM WorkOrder WHERE Id = :rootId];
        System.assert(root.Subject.contains('DEMO'), 'root tagged DEMO');
        System.assertNotEquals(null, root.AssetId, 'root linked to wagon asset');

        // Wagon + 4 wheelsets + 4 axles
        Id wagonId = root.AssetId;
        List<Asset> wheelsets = [SELECT Id FROM Asset WHERE ParentId = :wagonId];
        System.assertEquals(4, wheelsets.size(), '4 wheelsets');
        Set<Id> wsIds = new Map<Id, Asset>(wheelsets).keySet();
        Integer axles = [SELECT COUNT() FROM Asset WHERE ParentId IN :wsIds];
        System.assertEquals(4, axles, 'one axle per wheelset');

        // Child WOs + WOLIs
        List<WorkOrder> children = [SELECT Id FROM WorkOrder WHERE ParentWorkOrderId = :rootId];
        System.assert(children.size() >= 4, 'several child work orders');
        Set<Id> childIds = new Map<Id, WorkOrder>(children).keySet();
        List<WorkOrderLineItem> wolis = [SELECT Subject, Description FROM WorkOrderLineItem WHERE WorkOrderId IN :childIds];
        System.assert(wolis.size() >= children.size(), 'a line item per child');
        for (WorkOrderLineItem li : wolis) {
            System.assert(String.isNotBlank(li.Subject), 'WOLI has a subject');
            System.assert(String.isNotBlank(li.Description), 'WOLI has a description');
        }

        // Measures on each wheelset — a numeric time series + OK + Attention.
        List<Measure_Point__c> mps = [
            SELECT Measure_Type__c, Measure_Value__c, MeasureValue_Type__c, Update_Date__c
            FROM Measure_Point__c WHERE Asset__c IN :wsIds
        ];
        System.assert(mps.size() >= 4 * 8, 'a numeric series per wheelset, not just a few');
        Integer attention = [SELECT COUNT() FROM Measure_Point__c WHERE Asset__c IN :wsIds AND Measure_Type__c = 'Attention Required'];
        System.assertEquals(4, attention, 'one attention item per wheelset');

        // Numeric "Measure" readings should VARY (not a flat line) — check the
        // distinct Depth values span a sensible ±30% range around the ~28 baseline.
        Set<Decimal> depthVals = new Set<Decimal>();
        Decimal lo = null, hi = null;
        for (Measure_Point__c mp : mps) {
            if (mp.Measure_Type__c == 'Measure' && mp.MeasureValue_Type__c == 'Depth' && mp.Measure_Value__c != null) {
                depthVals.add(mp.Measure_Value__c);
                if (lo == null || mp.Measure_Value__c < lo) lo = mp.Measure_Value__c;
                if (hi == null || mp.Measure_Value__c > hi) hi = mp.Measure_Value__c;
            }
        }
        System.assert(depthVals.size() > 1, 'depth readings vary (graph is not a straight line)');
        if (lo != null) {
            System.assert(lo >= 28 * 0.70 - 0.1 && hi <= 28 * 1.30 + 0.1, 'within ~±30% of baseline');
        }

        // Dates populated for timeline/calendar/measure-graph
        System.assertNotEquals(null, [SELECT StartDate FROM WorkOrder WHERE Id = :rootId].StartDate, 'root WO has StartDate');
        Integer datedMeasures = [SELECT COUNT() FROM Measure_Point__c WHERE Asset__c IN :wsIds AND Update_Date__c != null];
        System.assertEquals(mps.size(), datedMeasures, 'all measures dated');
        Integer datedAssets = [SELECT COUNT() FROM Asset WHERE (Id = :wagonId OR ParentId = :wagonId) AND InstallDate != null];
        System.assert(datedAssets >= 5, 'wagon + wheelsets have install dates');
    }

    @IsTest
    static void invalidToken_throws() {
        Boolean threw = false;
        try {
            WorkpackDemoGenerator.generateDemoWorkpack('not-a-valid-token');
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'invalid token rejected');
    }
}
