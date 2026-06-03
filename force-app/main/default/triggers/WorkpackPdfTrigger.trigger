trigger WorkpackPdfTrigger on ContentDocumentLink (after insert) {
    List<WorkpackPdfProcessor.ProcessRequest> requests = new List<WorkpackPdfProcessor.ProcessRequest>();

    // Collect WorkOrder Ids from the inserted links (LinkedEntityId is polymorphic)
    Set<Id> linkedWoIds = new Set<Id>();
    Map<Id, Id> woIdToCdlId = new Map<Id, Id>();

    for (ContentDocumentLink cdl : Trigger.new) {
        String linkedId = String.valueOf(cdl.LinkedEntityId);
        // WorkOrder key prefix is '0WO'
        if (linkedId != null && linkedId.startsWith('0WO')) {
            linkedWoIds.add(cdl.LinkedEntityId);
            woIdToCdlId.put(cdl.LinkedEntityId, cdl.Id);
        }
    }

    if (linkedWoIds.isEmpty()) return;

    // Check which of those WOs have WorkType = 'Rail Workpack'
    for (WorkOrder wo : [
        SELECT Id, WorkType.Name
        FROM WorkOrder
        WHERE Id IN :linkedWoIds
        WITH SECURITY_ENFORCED
    ]) {
        if (wo.WorkType != null && wo.WorkType.Name == 'Rail Workpack') {
            WorkpackPdfProcessor.ProcessRequest req = new WorkpackPdfProcessor.ProcessRequest();
            req.contentDocumentLinkId = woIdToCdlId.get(wo.Id);
            req.parentWorkOrderId = wo.Id;
            requests.add(req);
        }
    }

    if (!requests.isEmpty()) {
        WorkpackPdfProcessor.processPdf(requests);
    }
}
