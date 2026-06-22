/**
 * Agentforce invocable action: Measure Type Distribution.
 * Thin wrapper delegating to KioskBlocks.measureTypeDistribution (Salesforce allows one
 * @InvocableMethod per class). Returns an agent-blocks fence the kiosk renders.
 */
public with sharing class AgentActionMeasureDistribution {
    @InvocableMethod(label='Chart: Measure Type Distribution' description='Donut of OK / Attention Required / Scrap measures.')
    public static List<KioskBlocks.Output> run(List<KioskBlocks.Input> reqs) {
        return KioskBlocks.measureTypeDistribution(reqs);
    }
}
