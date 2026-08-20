/**
 * SeeAllData: the broken "SDO SFS Attach Forms On Create" flow blocks WorkOrder
 * inserts, so these tests run against existing org data (same approach as
 * KioskControllerTest — see CLAUDE.md). They assert each action returns either a
 * graceful "no data" message or a valid ```agent-blocks``` fence with parseable JSON.
 */
@IsTest(SeeAllData=true)
private class KioskBlocksTest {

    private static KioskBlocks.Input ctx() {
        KioskBlocks.Input in0 = new KioskBlocks.Input();
        List<WorkOrder> wos = [SELECT Id FROM WorkOrder LIMIT 1];
        if (!wos.isEmpty()) in0.workOrderId = wos[0].Id;
        return in0;
    }

    /** Asserts the output is either plain guidance or a valid agent-blocks fence. */
    private static void assertValid(List<KioskBlocks.Output> outs) {
        System.assertEquals(1, outs.size(), 'one output');
        String msg = outs[0].message;
        System.assert(String.isNotBlank(msg), 'message present');
        if (msg.contains('```agent-blocks')) {
            Integer s = msg.indexOf('```agent-blocks') + '```agent-blocks'.length();
            Integer e = msg.indexOf('```', s);
            String fenced = msg.substring(s, e).trim();
            Object parsed = JSON.deserializeUntyped(fenced); // throws if invalid
            Map<String, Object> m = (Map<String, Object>) parsed;
            System.assert(m.containsKey('blocks'), 'has blocks key');
            System.assert(((List<Object>) m.get('blocks')).size() > 0, 'non-empty blocks');
        }
    }

    @IsTest static void timeline() { assertValid(KioskBlocks.assetTimeline(new List<KioskBlocks.Input>{ ctx() })); }
    @IsTest static void woByStatus() { assertValid(KioskBlocks.workOrdersByStatus(new List<KioskBlocks.Input>{ ctx() })); }
    @IsTest static void measureGraph() { assertValid(KioskBlocks.measurePointGraph(new List<KioskBlocks.Input>{ ctx() })); }
    @IsTest static void wheelsetCondition() { assertValid(KioskBlocks.wagonConditionByWheelset(new List<KioskBlocks.Input>{ ctx() })); }
    @IsTest static void timeVsPlanned() { assertValid(KioskBlocks.timeWorkedVsPlanned(new List<KioskBlocks.Input>{ ctx() })); }
    @IsTest static void measureDist() { assertValid(KioskBlocks.measureTypeDistribution(new List<KioskBlocks.Input>{ ctx() })); }
    @IsTest static void codes() { assertValid(KioskBlocks.codeFrequency(new List<KioskBlocks.Input>{ ctx() })); }
    @IsTest static void calendar() { assertValid(KioskBlocks.shiftActivityCalendar(new List<KioskBlocks.Input>{ ctx() })); }
    @IsTest static void images() { assertValid(KioskBlocks.workOrderImages(new List<KioskBlocks.Input>{ ctx() })); }
    @IsTest static void measureExplorer_unfiltered() { assertValid(KioskBlocks.measureExplorer(new List<KioskBlocks.Input>{ ctx() })); }

    @IsTest static void measureExplorer_withCriteria() {
        // Value threshold + outcome filter — must still return a graceful message
        // or a valid agent-blocks fence regardless of what live data matches.
        KioskBlocks.Input in0 = ctx();
        in0.minValue = '20';
        in0.measureOutcome = 'Scrap,Attention Required';
        in0.valueType = 'Temperature';
        assertValid(KioskBlocks.measureExplorer(new List<KioskBlocks.Input>{ in0 }));
    }

    // When a measure point has a value/outcome, the explorer card must carry the
    // detail rows the lightbox renders (Outcome, Value, Component, ...).
    @IsTest static void measureExplorer_cardCarriesDetails() {
        List<Measure_Point__c> mps = [
            SELECT Work_Order__c FROM Measure_Point__c
            WHERE Work_Order__c != null AND Measure_Value__c != null LIMIT 1
        ];
        if (mps.isEmpty()) return; // no suitable live data; skip
        KioskBlocks.Input in0 = new KioskBlocks.Input();
        in0.workOrderId = mps[0].Work_Order__c;
        String msg = KioskBlocks.measureExplorer(new List<KioskBlocks.Input>{ in0 })[0].message;
        if (msg.contains('"type":"carousel"')) {
            System.assert(msg.contains('"details"'), 'cards carry detail rows');
            System.assert(msg.contains('"label":"Outcome"'), 'detail includes Outcome row');
        }
    }

    // Seed an image on an existing work order and confirm the carousel card carries
    // the workOrderId for drill-down. (ContentVersion insert is allowed; the broken
    // flow only blocks WorkOrder inserts — so we reuse an existing WO.)
    @IsTest static void imageCard_carriesWorkOrderId() {
        List<WorkOrder> wos = [SELECT Id FROM WorkOrder LIMIT 1];
        if (wos.isEmpty()) return;
        Id woId = wos[0].Id;

        String b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        ContentVersion cv = new ContentVersion(Title='DrillTest', PathOnClient='drill.png',
            VersionData=EncodingUtil.base64Decode(b64), IsMajorVersion=true);
        insert cv;
        Id docId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
        insert new ContentDocumentLink(ContentDocumentId=docId, LinkedEntityId=woId,
            ShareType='V', Visibility='AllUsers');

        KioskBlocks.Input in0 = new KioskBlocks.Input();
        in0.workOrderId = woId;
        Test.startTest();
        String msg = KioskBlocks.workOrderImages(new List<KioskBlocks.Input>{ in0 })[0].message;
        Test.stopTest();

        System.assert(msg.contains('"type":"carousel"'), 'carousel returned');
        System.assert(msg.contains('"workOrderId":"' + woId + '"'), 'card carries workOrderId for drill-down');
    }

    @IsTest static void emptyInput_isGraceful() {
        // No context at all — should return guidance, not throw.
        assertValid(KioskBlocks.measurePointGraph(new List<KioskBlocks.Input>{ new KioskBlocks.Input() }));
        assertValid(KioskBlocks.workOrdersByStatus(new List<KioskBlocks.Input>{ new KioskBlocks.Input() }));
    }
}
