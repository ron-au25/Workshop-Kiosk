/**
 * Agentforce invocable action: Time Worked vs Planned.
 * Thin wrapper delegating to KioskBlocks.timeWorkedVsPlanned (Salesforce allows one
 * @InvocableMethod per class). Returns an agent-blocks fence the kiosk renders.
 */
public with sharing class AgentActionTimeWorkedVsPlanned {
    @InvocableMethod(label='Chart: Time Worked vs Planned' description='Actual logged minutes vs planned minutes per work order.')
    public static List<KioskBlocks.Output> run(List<KioskBlocks.Input> reqs) {
        return KioskBlocks.timeWorkedVsPlanned(reqs);
    }
}
