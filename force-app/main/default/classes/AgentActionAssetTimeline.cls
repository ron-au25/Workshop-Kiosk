/**
 * Agentforce invocable action: Asset Maintenance Timeline.
 * Thin wrapper delegating to KioskBlocks.assetTimeline (Salesforce allows one
 * @InvocableMethod per class). Returns an agent-blocks fence the kiosk renders.
 */
public with sharing class AgentActionAssetTimeline {
    @InvocableMethod(label='Chart: Asset Maintenance Timeline' description='Timeline of works done and measures taken for a wagon/asset over time.')
    public static List<KioskBlocks.Output> run(List<KioskBlocks.Input> reqs) {
        return KioskBlocks.assetTimeline(reqs);
    }
}
