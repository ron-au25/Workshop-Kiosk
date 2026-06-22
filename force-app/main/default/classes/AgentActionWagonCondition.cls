/**
 * Agentforce invocable action: Wagon Condition by Wheelset.
 * Thin wrapper delegating to KioskBlocks.wagonConditionByWheelset (Salesforce allows one
 * @InvocableMethod per class). Returns an agent-blocks fence the kiosk renders.
 */
public with sharing class AgentActionWagonCondition {
    @InvocableMethod(label='Chart: Wagon Condition by Wheelset' description='Per-wheelset condition bar chart and table for a wagon.')
    public static List<KioskBlocks.Output> run(List<KioskBlocks.Input> reqs) {
        return KioskBlocks.wagonConditionByWheelset(reqs);
    }
}
