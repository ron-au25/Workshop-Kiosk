/*
 * Seed the "Release to Traffic" sign-off checklist as FSL Work Plan Templates.
 *
 * Creates two Work Plan Templates (Maintainer Checks, Supervisor Sign-Off), their
 * Work Step Templates, and the Work Plan Template Entries that link them in order.
 * All upserts are keyed on External_ID__c so this script is safe to re-run.
 *
 * Steps have no ActionDefinition -> they complete with a single tap in the kiosk.
 *
 * Run: sf apex run -o ron@rsfieldnov25.demo -f scripts/apex/seed_release_to_traffic_templates.apex
 */

// ── 1. Work Plan Templates ────────────────────────────────────────────────
WorkPlanTemplate maintainerPlan = new WorkPlanTemplate(
    External_ID__c = 'RTT_MAINTAINER',
    Name = '🔧 Release to Traffic — Maintainer Checks',
    Description = 'Checks completed by the last maintainer to work on the wagon before release to traffic.',
    RelativeExecutionOrder = 1,
    IsActive = true
);
WorkPlanTemplate supervisorPlan = new WorkPlanTemplate(
    External_ID__c = 'RTT_SUPERVISOR',
    Name = '✍️ Release to Traffic — Supervisor Sign-Off',
    Description = 'Checks and sign-offs completed by the supervisor before release to traffic.',
    RelativeExecutionOrder = 2,
    IsActive = true
);
upsert new List<WorkPlanTemplate>{ maintainerPlan, supervisorPlan } External_ID__c;

// ── 2. Work Step Templates ────────────────────────────────────────────────
// extId => { name, description }
Map<String, List<String>> stepDefs = new Map<String, List<String>>{
    'RTT_M1' => new List<String>{ 'Bearing Keepers & Locking Tabs',
        'Ensure Bearing Keepers and locking tabs are in place, secure, and the tabs are bent over.' },
    'RTT_M2' => new List<String>{ 'Retainer Plates',
        'Ensure retainer plates are in place and secure.' },
    'RTT_M3' => new List<String>{ 'Hand Brake',
        'Ensure that the hand brake operates freely and is oiled.' },
    'RTT_M4' => new List<String>{ 'Yellow Cable Tie',
        'Check that the yellow cable tie is fitted.' },
    'RTT_M5' => new List<String>{ 'RED TAG Removed (Rat Trap)',
        'Ensure the removal of the RED TAG in the "Rat trap" if the wagon is good for shunting.' },
    'RTT_M6' => new List<String>{ 'TSPB Valve Open',
        'Ensure the TSPB valve is in the open position.' },
    'RTT_M7' => new List<String>{ 'Walk-Around Inspection',
        'Walk around the wagon for a general once-over inspection.' },
    'RTT_S1' => new List<String>{ 'Wheel Data Captured',
        'Ensure the correct Wheel information is captured on the Data sheet.' },
    'RTT_S2' => new List<String>{ 'Work & Time Confirmations',
        'Verify that all work and time confirmations are complete.' },
    'RTT_S3' => new List<String>{ 'Final Signature & TECO',
        'Complete the final signature and TECO (Technical Completion) sign-off for operations on the wagon.' }
};

List<WorkStepTemplate> stepTemplates = new List<WorkStepTemplate>();
for (String extId : stepDefs.keySet()) {
    List<String> def = stepDefs.get(extId);
    stepTemplates.add(new WorkStepTemplate(
        External_ID__c = extId,
        Name = def[0],
        Description = def[1],
        IsActive = true
    ));
}
upsert stepTemplates External_ID__c;

// Re-query to resolve Ids by External_ID__c (upsert above may be insert or update)
Map<String, Id> planIdByExt = new Map<String, Id>();
for (WorkPlanTemplate wpt : [SELECT Id, External_ID__c FROM WorkPlanTemplate
                             WHERE External_ID__c IN ('RTT_MAINTAINER','RTT_SUPERVISOR')]) {
    planIdByExt.put(wpt.External_ID__c, wpt.Id);
}
Map<String, Id> stepIdByExt = new Map<String, Id>();
for (WorkStepTemplate wst : [SELECT Id, External_ID__c FROM WorkStepTemplate
                             WHERE External_ID__c IN :stepDefs.keySet()]) {
    stepIdByExt.put(wst.External_ID__c, wst.Id);
}

// ── 3. Work Plan Template Entries (link + order) ──────────────────────────
// entryExtId => { planExtId, stepExtId, executionOrder }
List<WorkPlanTemplateEntry> entries = new List<WorkPlanTemplateEntry>();
Map<String, List<Object>> entryDefs = new Map<String, List<Object>>{
    'RTT_MAINTAINER_1' => new List<Object>{ 'RTT_MAINTAINER', 'RTT_M1', 1 },
    'RTT_MAINTAINER_2' => new List<Object>{ 'RTT_MAINTAINER', 'RTT_M2', 2 },
    'RTT_MAINTAINER_3' => new List<Object>{ 'RTT_MAINTAINER', 'RTT_M3', 3 },
    'RTT_MAINTAINER_4' => new List<Object>{ 'RTT_MAINTAINER', 'RTT_M4', 4 },
    'RTT_MAINTAINER_5' => new List<Object>{ 'RTT_MAINTAINER', 'RTT_M5', 5 },
    'RTT_MAINTAINER_6' => new List<Object>{ 'RTT_MAINTAINER', 'RTT_M6', 6 },
    'RTT_MAINTAINER_7' => new List<Object>{ 'RTT_MAINTAINER', 'RTT_M7', 7 },
    'RTT_SUPERVISOR_1' => new List<Object>{ 'RTT_SUPERVISOR', 'RTT_S1', 1 },
    'RTT_SUPERVISOR_2' => new List<Object>{ 'RTT_SUPERVISOR', 'RTT_S2', 2 },
    'RTT_SUPERVISOR_3' => new List<Object>{ 'RTT_SUPERVISOR', 'RTT_S3', 3 }
};
for (String entryExt : entryDefs.keySet()) {
    List<Object> def = entryDefs.get(entryExt);
    entries.add(new WorkPlanTemplateEntry(
        External_ID__c = entryExt,
        WorkPlanTemplateId = planIdByExt.get((String) def[0]),
        WorkStepTemplateId = stepIdByExt.get((String) def[1]),
        ExecutionOrder = (Integer) def[2]
    ));
}
upsert entries External_ID__c;

System.debug('Release to Traffic templates seeded: '
    + planIdByExt.size() + ' plans, '
    + stepIdByExt.size() + ' step templates, '
    + entries.size() + ' entries.');
