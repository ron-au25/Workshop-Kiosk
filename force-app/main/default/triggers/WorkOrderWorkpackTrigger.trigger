trigger WorkOrderWorkpackTrigger on WorkOrder (before update) {

    // Collect WOs where SAP_Work_Center__c just changed to 'Generate'
    Map<Id, Id> woToWorkTypeId = new Map<Id, Id>();

    for (WorkOrder wo : Trigger.new) {
        WorkOrder old = Trigger.oldMap.get(wo.Id);
        if (wo.SAP_Work_Center__c == 'Generate'
                && old.SAP_Work_Center__c != 'Generate'
                && wo.WorkTypeId != null) {
            woToWorkTypeId.put(wo.Id, wo.WorkTypeId);
        }
    }

    if (woToWorkTypeId.isEmpty()) return;

    // Check which of those WorkTypes are 'Rail Workpack'
    Set<Id> railWorkpackTypeIds = new Set<Id>();
    for (WorkType wt : [
        SELECT Id FROM WorkType
        WHERE Id IN :woToWorkTypeId.values()
          AND Name LIKE '%Workpack%'
        WITH SECURITY_ENFORCED
    ]) {
        railWorkpackTypeIds.add(wt.Id);
    }

    Set<Id> qualifyingWoIds = new Set<Id>();
    for (Id woId : woToWorkTypeId.keySet()) {
        if (railWorkpackTypeIds.contains(woToWorkTypeId.get(woId))) {
            qualifyingWoIds.add(woId);
        }
    }

    if (qualifyingWoIds.isEmpty()) return;

    // Find the most recent PDF attached to each qualifying WO
    Map<Id, Id> woCdlMap = new Map<Id, Id>();
    for (ContentDocumentLink cdl : [
        SELECT Id, LinkedEntityId
        FROM ContentDocumentLink
        WHERE LinkedEntityId IN :qualifyingWoIds
          AND ContentDocument.FileType = 'PDF'
        ORDER BY ContentDocument.CreatedDate DESC
    ]) {
        if (!woCdlMap.containsKey(cdl.LinkedEntityId)) {
            woCdlMap.put(cdl.LinkedEntityId, cdl.Id);
        }
    }

    List<WorkpackPdfProcessor.ProcessRequest> requests = new List<WorkpackPdfProcessor.ProcessRequest>();

    for (WorkOrder wo : Trigger.new) {
        if (!qualifyingWoIds.contains(wo.Id)) continue;

        Id cdlId = woCdlMap.get(wo.Id);
        if (cdlId != null) {
            WorkpackPdfProcessor.ProcessRequest req = new WorkpackPdfProcessor.ProcessRequest();
            req.contentDocumentLinkId = cdlId;
            req.parentWorkOrderId = wo.Id;
            requests.add(req);
        }

        // Reset the field to its previous value — 'Generate' is a one-shot signal
        wo.SAP_Work_Center__c = Trigger.oldMap.get(wo.Id).SAP_Work_Center__c;
    }

    if (!requests.isEmpty()) {
        WorkpackPdfProcessor.processPdf(requests);
    }
}
