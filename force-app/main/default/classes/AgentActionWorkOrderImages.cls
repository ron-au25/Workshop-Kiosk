/**
 * Agentforce invocable action: Work Order Images.
 * Thin wrapper delegating to KioskBlocks.workOrderImages (Salesforce allows one
 * @InvocableMethod per class). Returns an agent-blocks carousel the kiosk renders.
 */
public with sharing class AgentActionWorkOrderImages {
    @InvocableMethod(label='Chart: Work Order Images' description='Carousel of image attachments across the work order, child work orders, line items, and measures.')
    public static List<KioskBlocks.Output> run(List<KioskBlocks.Input> reqs) {
        return KioskBlocks.workOrderImages(reqs);
    }
}
