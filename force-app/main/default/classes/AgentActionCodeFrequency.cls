/**
 * Agentforce invocable action: Cause Damage Delay Codes.
 * Thin wrapper delegating to KioskBlocks.codeFrequency (Salesforce allows one
 * @InvocableMethod per class). Returns an agent-blocks fence the kiosk renders.
 */
public with sharing class AgentActionCodeFrequency {
    @InvocableMethod(label='Chart: Cause Damage Delay Codes' description='Frequency bar chart of cause, damage and delay codes across work orders.')
    public static List<KioskBlocks.Output> run(List<KioskBlocks.Input> reqs) {
        return KioskBlocks.codeFrequency(reqs);
    }
}
