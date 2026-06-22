/**
 * Agentforce invocable action: Shift Activity Calendar.
 * Thin wrapper delegating to KioskBlocks.shiftActivityCalendar (Salesforce allows one
 * @InvocableMethod per class). Returns an agent-blocks fence the kiosk renders.
 */
public with sharing class AgentActionShiftCalendar {
    @InvocableMethod(label='Chart: Shift Activity Calendar' description='Calendar of days with work activity for a month.')
    public static List<KioskBlocks.Output> run(List<KioskBlocks.Input> reqs) {
        return KioskBlocks.shiftActivityCalendar(reqs);
    }
}
