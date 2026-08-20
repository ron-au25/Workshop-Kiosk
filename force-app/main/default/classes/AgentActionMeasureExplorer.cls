/**
 * Agentforce invocable action: Measure Explorer.
 * Thin wrapper delegating to KioskBlocks.measureExplorer (Salesforce allows one
 * @InvocableMethod per class). Filters measures by the user's criteria (value
 * threshold, outcome, value type) and returns a KPI + carousel of detailed cards
 * the kiosk renders. Returns an agent-blocks fence — relay the message verbatim.
 */
public with sharing class AgentActionMeasureExplorer {
    @InvocableMethod(label='Chart: Measure Explorer' description='Filtered, detailed analysis of measures by value threshold, outcome (Scrap/Attention/OK/Measure), and value type. Returns a KPI summary and a carousel of measure cards with full detail on drill-in.')
    public static List<KioskBlocks.Output> run(List<KioskBlocks.Input> reqs) {
        return KioskBlocks.measureExplorer(reqs);
    }
}
