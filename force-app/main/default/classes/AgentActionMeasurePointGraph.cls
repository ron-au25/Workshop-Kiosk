/**
 * Agentforce invocable action: Measure Point Graph.
 * Thin wrapper delegating to KioskBlocks.measurePointGraph (Salesforce allows one
 * @InvocableMethod per class). Returns an agent-blocks fence the kiosk renders.
 */
public with sharing class AgentActionMeasurePointGraph {
    @InvocableMethod(label='Chart: Measure Point Graph' description='Line chart of measure values over time plus a measure-outcome split.')
    public static List<KioskBlocks.Output> run(List<KioskBlocks.Input> reqs) {
        return KioskBlocks.measurePointGraph(reqs);
    }
}
