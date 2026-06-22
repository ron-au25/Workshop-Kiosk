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

    @IsTest static void emptyInput_isGraceful() {
        // No context at all — should return guidance, not throw.
        assertValid(KioskBlocks.measurePointGraph(new List<KioskBlocks.Input>{ new KioskBlocks.Input() }));
        assertValid(KioskBlocks.workOrdersByStatus(new List<KioskBlocks.Input>{ new KioskBlocks.Input() }));
    }
}
