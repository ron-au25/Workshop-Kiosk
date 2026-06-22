/**
 * Agentforce invocable action: Work Orders by Status.
 * Thin wrapper delegating to KioskBlocks.workOrdersByStatus (Salesforce allows one
 * @InvocableMethod per class). Returns an agent-blocks fence the kiosk renders.
 */
public with sharing class AgentActionWorkOrdersByStatus {
    @InvocableMethod(label='Chart: Work Orders by Status' description='Donut chart and KPI cards of work order counts grouped by status.')
    public static List<KioskBlocks.Output> run(List<KioskBlocks.Input> reqs) {
        return KioskBlocks.workOrdersByStatus(reqs);
    }
}
