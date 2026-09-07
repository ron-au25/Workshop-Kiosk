public with sharing class InspectionChecklistController {
    private static final Set<String> ENTRY_TYPE_VALUES = new Set<String>{
        'OK',
        'Attention Required',
        'Measure'
    };

    public class ContextPayload {
        @AuraEnabled public Id workOrderId;
        /** Work Order number (e.g. from WorkOrderNumber). */
        @AuraEnabled public String workOrderLabel;
        @AuraEnabled public String workOrderSubject;
        @AuraEnabled public Id workStepId;
        @AuraEnabled public List<MeasurePointRow> measurePoints;
    }

    public class MeasurePointRow {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String componentName;
        @AuraEnabled public String componentLabel;
        @AuraEnabled public String pointType;
        @AuraEnabled public String pointTypeLabel;
        @AuraEnabled public String comments;
        @AuraEnabled public Decimal measureValue;
        @AuraEnabled public String measureType;
        @AuraEnabled public String measureTypeLabel;
        @AuraEnabled public String reviewNotes;
        @AuraEnabled public Datetime createdDate;
        @AuraEnabled public String createdByName;
        @AuraEnabled public Integer fileCount;
    }

    @AuraEnabled(cacheable=true)
    public static ContextPayload getContext(Id workStepId) {
        if (workStepId == null) {
            throw new AuraHandledException('Work Step Id is required.');
        }

        Id workOrderId = resolveWorkOrderId(workStepId);
        if (workOrderId == null) {
            throw new AuraHandledException('Could not resolve a Work Order from this Work Step.');
        }

        return buildContext(workOrderId, workStepId);
    }

    @TestVisible
    static ContextPayload getContextForTests(Id workOrderId, Id workStepId) {
        if (workOrderId == null) {
            throw new AuraHandledException('Work Order Id is required.');
        }
        return buildContext(workOrderId, workStepId);
    }

    private static ContextPayload buildContext(Id workOrderId, Id workStepId) {
        ContextPayload payload = new ContextPayload();
        populateWorkOrderFields(workOrderId, payload);
        payload.workStepId = workStepId;
        payload.measurePoints = loadMeasurePoints(workOrderId);

        return payload;
    }

    @AuraEnabled
    public static Id saveMeasurePoint(
        Id workStepId,
        String componentName,
        String pointType,
        String comments,
        Decimal measureValue,
        String measureValueType
    ) {
        if (workStepId == null || String.isBlank(componentName) || String.isBlank(pointType)) {
            throw new AuraHandledException('Work Step, component, and type are required.');
        }

        validateMeasureFields(pointType, measureValue, measureValueType);

        Id workOrderId = resolveWorkOrderId(workStepId);
        if (workOrderId == null) {
            throw new AuraHandledException('Could not resolve a Work Order from this Work Step.');
        }

        return insertMeasurePoint(workOrderId, workStepId, componentName, pointType, comments, measureValue, measureValueType);
    }

    @TestVisible
    static Id saveMeasurePointForTests(
        Id workOrderId,
        Id workStepId,
        String componentName,
        String pointType,
        String comments,
        Decimal measureValue,
        String measureValueType
    ) {
        if (workOrderId == null || String.isBlank(componentName) || String.isBlank(pointType)) {
            throw new AuraHandledException('Work Order, component, and type are required.');
        }
        validateMeasureFields(pointType, measureValue, measureValueType);
        return insertMeasurePoint(workOrderId, workStepId, componentName, pointType, comments, measureValue, measureValueType);
    }

    @AuraEnabled
    public static void updateMeasurePointType(Id measurePointId, String measureType) {
        if (measurePointId == null || String.isBlank(measureType)) {
            throw new AuraHandledException('Measure Point and type are required.');
        }
        if (!ENTRY_TYPE_VALUES.contains(measureType)) {
            throw new AuraHandledException('Invalid measure type.');
        }

        Measure_Point__c mp = [
            SELECT Id, Measure_Type__c, Measure_Value__c, MeasureValue_Type__c
            FROM Measure_Point__c
            WHERE Id = :measurePointId
            LIMIT 1
        ];

        applyEntryTypeChange(mp, measureType);

        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.UPDATABLE,
            new List<SObject>{ mp }
        );
        List<SObject> safeRows = decision.getRecords();
        if (safeRows.isEmpty()) {
            throw new AuraHandledException('You do not have permission to update this Measure Point.');
        }
        update safeRows;
    }

    @AuraEnabled
    public static void updateMeasurePointComments(Id measurePointId, String comments) {
        if (measurePointId == null) {
            throw new AuraHandledException('Measure Point Id is required.');
        }

        Measure_Point__c mp = [
            SELECT Id, Measure_Type__c, Comments__c
            FROM Measure_Point__c
            WHERE Id = :measurePointId
            LIMIT 1
        ];
        if (mp.Measure_Type__c != 'Attention Required') {
            throw new AuraHandledException(
                'Set the row type to Attention Required before saving comments.'
            );
        }

        mp.Comments__c = comments;

        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.UPDATABLE,
            new List<SObject>{ mp }
        );
        List<SObject> safeRows = decision.getRecords();
        if (safeRows.isEmpty()) {
            throw new AuraHandledException('You do not have permission to update this Measure Point.');
        }
        update safeRows;
    }

    @AuraEnabled
    public static void updateMeasurePointMeasureValues(
        Id measurePointId,
        Decimal measureValue,
        String measureValueType
    ) {
        if (measurePointId == null) {
            throw new AuraHandledException('Measure Point Id is required.');
        }
        validateMeasureFields('Measure', measureValue, measureValueType);

        Measure_Point__c mp = [
            SELECT Id, Measure_Type__c, Measure_Value__c, MeasureValue_Type__c
            FROM Measure_Point__c
            WHERE Id = :measurePointId
            LIMIT 1
        ];
        if (mp.Measure_Type__c != 'Measure') {
            throw new AuraHandledException('Set the row type to Measure before saving measure values.');
        }

        mp.Measure_Value__c = measureValue;
        mp.MeasureValue_Type__c = measureValueType;

        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.UPDATABLE,
            new List<SObject>{ mp }
        );
        List<SObject> safeRows = decision.getRecords();
        if (safeRows.isEmpty()) {
            throw new AuraHandledException('You do not have permission to update this Measure Point.');
        }
        update safeRows;
    }

    @AuraEnabled
    public static void markMeasurePointsOk(List<Id> measurePointIds) {
        if (measurePointIds == null || measurePointIds.isEmpty()) {
            return;
        }

        List<Measure_Point__c> rows = [
            SELECT Id, Measure_Type__c, Measure_Value__c, MeasureValue_Type__c
            FROM Measure_Point__c
            WHERE Id IN :measurePointIds
        ];

        for (Measure_Point__c mp : rows) {
            applyEntryTypeChange(mp, 'OK');
        }

        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.UPDATABLE,
            rows
        );
        List<SObject> safeRows = decision.getRecords();
        if (safeRows.isEmpty()) {
            throw new AuraHandledException('You do not have permission to update Measure Points.');
        }
        update safeRows;
    }

    /**
     * Inserts a Salesforce File (ContentVersion) linked to the Measure Point.
     * Used instead of lightning-file-upload where that control does not persist (e.g. some Field Service / mobile contexts).
     */
    @AuraEnabled
    public static Id attachFileToMeasurePoint(Id measurePointId, String fileName, String base64VersionData) {
        if (measurePointId == null) {
            throw new AuraHandledException('Measure Point Id is required.');
        }
        if (String.isBlank(fileName)) {
            throw new AuraHandledException('File name is required.');
        }
        if (String.isBlank(base64VersionData)) {
            throw new AuraHandledException('File content is empty.');
        }
        // ~4 MB binary after decode (heap-safe for synchronous Apex)
        final Integer maxDecodedBytes = 4 * 1024 * 1024;
        if (base64VersionData.length() > 6000000) {
            throw new AuraHandledException('File is too large (maximum about 4 MB).');
        }

        if (!Schema.sObjectType.Measure_Point__c.isAccessible()) {
            throw new AuraHandledException('You do not have access to Measure Points.');
        }
        List<Measure_Point__c> mps = [SELECT Id FROM Measure_Point__c WHERE Id = :measurePointId LIMIT 1];
        if (mps.isEmpty()) {
            throw new AuraHandledException('Measure Point was not found.');
        }

        Blob body;
        try {
            body = EncodingUtil.base64Decode(base64VersionData);
        } catch (Exception e) {
            throw new AuraHandledException('Invalid file data.');
        }
        if (body == null || body.size() == 0) {
            throw new AuraHandledException('File is empty.');
        }
        if (body.size() > maxDecodedBytes) {
            throw new AuraHandledException('File is too large (maximum about 4 MB).');
        }

        ContentVersion cv = new ContentVersion();
        cv.Title = titleFromFileName(fileName);
        cv.PathOnClient = fileName.trim();
        cv.VersionData = body;
        cv.FirstPublishLocationId = measurePointId;

        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.CREATABLE,
            new List<SObject>{ cv }
        );
        List<SObject> toInsert = decision.getRecords();
        if (toInsert.isEmpty()) {
            throw new AuraHandledException('You do not have permission to attach files.');
        }
        ContentVersion safeCv = (ContentVersion) toInsert[0];
        if (safeCv.VersionData == null || safeCv.FirstPublishLocationId == null) {
            throw new AuraHandledException('You do not have permission to attach files to this record.');
        }

        insert safeCv;
        return safeCv.Id;
    }

    private static String titleFromFileName(String fileName) {
        String n = fileName == null ? '' : fileName.trim();
        if (String.isBlank(n)) {
            return 'attachment';
        }
        Integer dot = n.lastIndexOf('.');
        if (dot > 0) {
            return n.substring(0, dot);
        }
        return n;
    }

    private static void applyEntryTypeChange(Measure_Point__c mp, String newType) {
        mp.Measure_Type__c = newType;
        if (newType != 'Measure') {
            mp.Measure_Value__c = null;
            mp.MeasureValue_Type__c = null;
        }
    }

    private static void validateMeasureFields(String pointType, Decimal measureValue, String measureValueType) {
        if (pointType == 'Measure') {
            if (measureValue == null) {
                throw new AuraHandledException('Measure value is required for Measure entries.');
            }
            if (String.isBlank(measureValueType)) {
                throw new AuraHandledException('Measure value type is required for Measure entries.');
            }
        }
    }

    private static Id insertMeasurePoint(
        Id workOrderId,
        Id workStepId,
        String componentName,
        String pointType,
        String comments,
        Decimal measureValue,
        String measureValueType
    ) {
        Measure_Point__c mp = new Measure_Point__c();
        mp.Work_Order__c = workOrderId;
        mp.Component_Name__c = componentName;
        mp.Measure_Type__c = pointType;
        mp.Comments__c = comments;
        if (pointType == 'Measure') {
            mp.Measure_Value__c = measureValue;
            mp.MeasureValue_Type__c = measureValueType;
        } else {
            mp.Measure_Value__c = null;
            mp.MeasureValue_Type__c = null;
        }

        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.CREATABLE,
            new List<SObject>{ mp }
        );
        List<SObject> safeRows = decision.getRecords();
        if (safeRows.isEmpty()) {
            throw new AuraHandledException('You do not have permission to create Measure Points.');
        }
        insert safeRows;
        return safeRows[0].Id;
    }

    private static void populateWorkOrderFields(Id workOrderId, ContextPayload payload) {
        payload.workOrderId = workOrderId;
        payload.workOrderLabel = String.valueOf(workOrderId);
        payload.workOrderSubject = null;
        try {
            if (!Schema.sObjectType.WorkOrder.isAccessible()) {
                return;
            }
            WorkOrder wo = [
                SELECT WorkOrderNumber, Subject
                FROM WorkOrder
                WHERE Id = :workOrderId
                LIMIT 1
            ];
            payload.workOrderLabel = String.isNotBlank(wo.WorkOrderNumber)
                ? wo.WorkOrderNumber
                : String.valueOf(workOrderId);
            payload.workOrderSubject = wo.Subject;
        } catch (Exception e) {
            // leave defaults
        }
    }

    private static Id resolveWorkOrderId(Id workStepId) {
        WorkStep ws = [
            SELECT WorkOrderId, ParentRecordId
            FROM WorkStep
            WHERE Id = :workStepId
            LIMIT 1
        ];

        if (ws.WorkOrderId != null) {
            return ws.WorkOrderId;
        }

        Id parentId = ws.ParentRecordId;
        if (parentId == null) {
            return null;
        }

        String parentType = parentId.getSobjectType().getDescribe().getName();
        if ('WorkOrder'.equals(parentType)) {
            return parentId;
        }
        if ('WorkOrderLineItem'.equals(parentType)) {
            WorkOrderLineItem woli = [
                SELECT WorkOrderId
                FROM WorkOrderLineItem
                WHERE Id = :parentId
                LIMIT 1
            ];
            return woli.WorkOrderId;
        }
        return null;
    }

    private static List<MeasurePointRow> loadMeasurePoints(Id workOrderId) {
        Map<String, String> entryTypeLabels = picklistLabels(
            Measure_Point__c.Measure_Type__c.getDescribe()
        );
        Map<String, String> measureValueTypeLabels = picklistLabels(
            Measure_Point__c.MeasureValue_Type__c.getDescribe()
        );

        List<Measure_Point__c> rows;
        if (!Schema.sObjectType.Measure_Point__c.isAccessible()) {
            return new List<MeasurePointRow>();
        }
        rows = [
            SELECT
                Id,
                Name,
                Component_Name__c,
                Measure_Type__c,
                Comments__c,
                Measure_Value__c,
                MeasureValue_Type__c,
                Review_Notes__c,
                CreatedDate,
                CreatedBy.Name,
                (
                    SELECT Id
                    FROM ContentDocumentLinks
                )
            FROM Measure_Point__c
            WHERE Work_Order__c = :workOrderId
            ORDER BY Name ASC NULLS LAST
        ];

        SObjectAccessDecision decision = Security.stripInaccessible(
            AccessType.READABLE,
            rows
        );
        List<Measure_Point__c> safeRows = (List<Measure_Point__c>) decision.getRecords();

        List<MeasurePointRow> result = new List<MeasurePointRow>();
        for (Measure_Point__c mp : safeRows) {
            MeasurePointRow row = new MeasurePointRow();
            row.id = mp.Id;
            row.name = mp.Name;
            row.componentName = mp.Component_Name__c;
            row.componentLabel = mp.Component_Name__c;
            String raw = mp.Measure_Type__c;
            if (String.isBlank(raw) || 'none'.equalsIgnoreCase(raw)) {
                row.pointType = null;
                row.pointTypeLabel = null;
            } else {
                row.pointType = raw;
                row.pointTypeLabel = entryTypeLabels.containsKey(raw)
                    ? entryTypeLabels.get(raw)
                    : raw;
            }
            row.comments = mp.Comments__c;
            row.measureValue = mp.Measure_Value__c;
            row.measureType = mp.MeasureValue_Type__c;
            row.measureTypeLabel = mp.MeasureValue_Type__c != null &&
                measureValueTypeLabels.containsKey(mp.MeasureValue_Type__c)
                ? measureValueTypeLabels.get(mp.MeasureValue_Type__c)
                : mp.MeasureValue_Type__c;
            row.reviewNotes = mp.Review_Notes__c;
            row.createdDate = mp.CreatedDate;
            row.createdByName = mp.CreatedBy != null ? mp.CreatedBy.Name : null;
            row.fileCount = mp.ContentDocumentLinks != null ? mp.ContentDocumentLinks.size() : 0;
            result.add(row);
        }
        return result;
    }

    private static Map<String, String> picklistLabels(Schema.DescribeFieldResult dfr) {
        Map<String, String> out = new Map<String, String>();
        for (Schema.PicklistEntry pe : dfr.getPicklistValues()) {
            if (pe.isActive()) {
                out.put(pe.getValue(), pe.getLabel());
            }
        }
        return out;
    }

}