public with sharing class WorkpackPdfProcessor {
  // ─── @InvocableMethod (called by Flow) ───────────────────────────────────────

  public class ProcessRequest {
    @InvocableVariable(required=true label='Content Document Link ID')
    public Id contentDocumentLinkId;
    @InvocableVariable(required=true label='Parent Work Order ID')
    public Id parentWorkOrderId;
  }

  @InvocableMethod(
    label='Process Workpack PDF'
    description='Extracts work orders from a PDF attached to a Rail Workpack and creates child WorkOrders, WorkOrderLineItems, and Measure Points'
    callout=true
  )
  public static void processPdf(List<ProcessRequest> requests) {
    for (ProcessRequest req : requests) {
      System.enqueueJob(
        new WorkpackQueueable(req.contentDocumentLinkId, req.parentWorkOrderId)
      );
    }
  }

  // ─── @AuraEnabled (called by Quick Action LWC) ───────────────────────────────

  @AuraEnabled
  public static void processLatestPdf(Id workOrderId) {
    List<ContentDocumentLink> cdls = [
      SELECT Id
      FROM ContentDocumentLink
      WHERE LinkedEntityId = :workOrderId AND ContentDocument.FileType = 'PDF'
      WITH SECURITY_ENFORCED
      ORDER BY ContentDocument.CreatedDate DESC
      LIMIT 1
    ];
    if (cdls.isEmpty()) {
      throw new AuraHandledException(
        'No PDF file found attached to this Work Order.'
      );
    }
    ProcessRequest req = new ProcessRequest();
    req.contentDocumentLinkId = cdls[0].Id;
    req.parentWorkOrderId = workOrderId;
    processPdf(new List<ProcessRequest>{ req });
  }

  // ─── Queueable (handles callout + DML in background) ─────────────────────────

  public class WorkpackQueueable implements Queueable, Database.AllowsCallouts {
    private Id contentDocumentLinkId;
    private Id parentWorkOrderId;

    public WorkpackQueueable(Id cdlId, Id woId) {
      this.contentDocumentLinkId = cdlId;
      this.parentWorkOrderId = woId;
    }

    public void execute(QueueableContext ctx) {
      try {
        runProcessing(contentDocumentLinkId, parentWorkOrderId);
      } catch (Exception e) {
        System.debug(
          LoggingLevel.ERROR,
          'WorkpackPdfProcessor error: ' +
            e.getMessage() +
            '\n' +
            e.getStackTraceString()
        );
      }
    }
  }

  // ─── Core processing logic ────────────────────────────────────────────────────

  @TestVisible
  private static void runProcessing(Id cdlId, Id parentWoId) {
    // 1. Resolve ContentDocumentId from the link
    ContentDocumentLink cdl = [
      SELECT ContentDocumentId
      FROM ContentDocumentLink
      WHERE Id = :cdlId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];

    // 2. Call Prompt Builder — passes ContentDocumentId so Einstein fetches
    //    and parses the PDF natively (avoids blob-to-string heap limit issues)
    String rawJson = callPromptBuilder(cdl.ContentDocumentId);
    System.debug(
      LoggingLevel.INFO,
      'WorkpackExtraction raw response: ' + rawJson
    );

    String jsonObject = extractFirstJsonObject(rawJson);
    if (jsonObject == null) {
      return;
    }
    ExtractionResult extraction = (ExtractionResult) JSON.deserialize(
      jsonObject,
      ExtractionResult.class
    );
    if (
      extraction == null ||
      extraction.maintenance_orders == null ||
      extraction.maintenance_orders.isEmpty()
    ) {
      return;
    }

    // 3. Resolve WorkType for child work orders
    List<WorkType> wagonTypes = [
      SELECT Id
      FROM WorkType
      WHERE Name = 'Wagon PM01'
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (wagonTypes.isEmpty()) {
      throw new WorkpackProcessorException(
        'WorkType "Wagon PM01" not found in org'
      );
    }
    Id wagonPm01TypeId = wagonTypes[0].Id;

    // 4. Get parent WorkOrder for ServiceTerritoryId inheritance
    WorkOrder parentWo = [
      SELECT Id, ServiceTerritoryId
      FROM WorkOrder
      WHERE Id = :parentWoId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];

    // 5. Build and upsert child WorkOrders on External_ID__c
    List<WorkOrder> childWos = new List<WorkOrder>();
    for (OrderDTO order : extraction.maintenance_orders) {
      WorkOrder wo = new WorkOrder();
      wo.ParentWorkOrderId = parentWoId;
      wo.WorkTypeId = wagonPm01TypeId;
      wo.Subject = order.order_description;
      wo.Description = order.order_long_text;
      wo.SAP_FLOC_Desc__c = order.functional_location;
      wo.SAP_Work_Center__c = order.planner_group;
      wo.External_ID__c = order.order_number;
      wo.ServiceTerritoryId = parentWo.ServiceTerritoryId;
      if (String.isNotBlank(order.start_date)) {
        wo.StartDate = parseSapDate(order.start_date);
      }
      childWos.add(wo);
    }

    Database.upsert(childWos, WorkOrder.External_ID__c, false);

    // 6. Re-query inserted/updated child WOs to get their Ids
    Set<String> orderNumbers = new Set<String>();
    for (OrderDTO order : extraction.maintenance_orders) {
      if (String.isNotBlank(order.order_number))
        orderNumbers.add(order.order_number);
    }

    Map<String, Id> woByExternalId = new Map<String, Id>();
    for (WorkOrder wo : [
      SELECT Id, External_ID__c
      FROM WorkOrder
      WHERE External_ID__c IN :orderNumbers AND ParentWorkOrderId = :parentWoId
      WITH SECURITY_ENFORCED
    ]) {
      woByExternalId.put(wo.External_ID__c, wo.Id);
    }

    // 7. Delete existing WorkOrderLineItems and Measure Points for re-run safety
    Set<Id> childWoIds = new Set<Id>(woByExternalId.values());
    if (!childWoIds.isEmpty()) {
      List<WorkOrderLineItem> existingWoli = [
        SELECT Id
        FROM WorkOrderLineItem
        WHERE WorkOrderId IN :childWoIds
        WITH SECURITY_ENFORCED
      ];
      if (!existingWoli.isEmpty())
        delete existingWoli;

      List<Measure_Point__c> existingMp = [
        SELECT Id
        FROM Measure_Point__c
        WHERE Work_Order__c IN :childWoIds
        WITH SECURITY_ENFORCED
      ];
      if (!existingMp.isEmpty())
        delete existingMp;
    }

    // 8. Build WorkOrderLineItems and Measure_Point__c records
    List<WorkOrderLineItem> lineItems = new List<WorkOrderLineItem>();
    List<Measure_Point__c> measurePoints = new List<Measure_Point__c>();

    for (OrderDTO order : extraction.maintenance_orders) {
      Id childWoId = woByExternalId.get(order.order_number);
      if (childWoId == null)
        continue;

      if (order.operations != null) {
        for (OperationDTO op : order.operations) {
          WorkOrderLineItem woli = new WorkOrderLineItem();
          woli.WorkOrderId = childWoId;
          woli.Subject = op.operation_number;
          woli.Description = op.task_description;
          woli.Duration = parseDuration(op.duration);
          lineItems.add(woli);
        }
      }

      if (order.checklist_items != null) {
        for (Object rawItem : order.checklist_items) {
          ChecklistItem ci = parseChecklistItem(rawItem);
          if (ci == null)
            continue;
          Measure_Point__c mp = new Measure_Point__c();
          mp.Work_Order__c = childWoId;
          String item = ci.component;
          if (item.length() > 255) {
            mp.Component_Name__c = item.substring(0, 255);
            mp.Comments__c = item;
          } else {
            mp.Component_Name__c = item;
          }
          mp.Source_Document__c = String.valueOf(cdl.ContentDocumentId);
          mp.Page_Number__c = ci.pageNumber;
          mp.Page_Position_Estimate__c = ci.pagePosition;
          mp.Table_Name__c = ci.tableName;
          if (String.isNotBlank(ci.tableName)) {
            mp.Measure_Type__c = 'Measure';
          }
          measurePoints.add(mp);
        }
      }
    }

    if (!lineItems.isEmpty())
      insert lineItems;
    if (!measurePoints.isEmpty())
      insert measurePoints;
  }

  // ─── LLM call via Prompt Builder ─────────────────────────────────────────────

  @TestVisible
  private static String mockLlmResponse = null;

  private static String callPromptBuilder(Id contentDocumentId) {
    if (Test.isRunningTest() && mockLlmResponse != null) {
      return mockLlmResponse;
    }

    ConnectApi.EinsteinPromptTemplateGenerationsInput promptInput = new ConnectApi.EinsteinPromptTemplateGenerationsInput();

    ConnectApi.WrappedValue fileInput = new ConnectApi.WrappedValue();
    fileInput.value = new Map<String, String>{
      'id' => (String) contentDocumentId,
      'type' => 'ContentDocument'
    };

    promptInput.inputParams = new Map<String, ConnectApi.WrappedValue>{
      'Input:pdfFile' => fileInput
    };
    promptInput.additionalConfig = new ConnectApi.EinsteinLlmAdditionalConfigInput();
    promptInput.isPreview = false;

    ConnectApi.EinsteinPromptTemplateGenerationsRepresentation response = ConnectApi.EinsteinLLM.generateMessagesForPromptTemplate(
      'WorkpackExtraction',
      promptInput
    );

    if (
      response == null ||
      response.generations == null ||
      response.generations.isEmpty()
    ) {
      throw new WorkpackProcessorException('LLM returned empty generations');
    }

    String rawText = response.generations[0].text.trim();

    // Strip markdown fences if the model wraps output despite instructions
    if (rawText.startsWith('```')) {
      rawText = rawText.replaceAll('(?s)^```[a-z]*\\n?', '')
        .replaceAll('```\\s*$', '')
        .trim();
    }

    return rawText;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** One parsed checklist entry: plain string items have null page fields. */
  @TestVisible
  private class ChecklistItem {
    public String component;
    public Integer pageNumber;
    public String pagePosition;
    public String tableName;
  }

  /** Accepts a String or a Map (component, page_number, page_position_estimate, table_name). */
  @TestVisible
  private static ChecklistItem parseChecklistItem(Object raw) {
    ChecklistItem ci = new ChecklistItem();
    if (raw instanceof String) {
      ci.component = ((String) raw).trim();
    } else if (raw instanceof Map<String, Object>) {
      Map<String, Object> m = (Map<String, Object>) raw;
      Object c = m.get('component');
      ci.component = c == null ? null : String.valueOf(c).trim();
      ci.pageNumber = toInteger(m.get('page_number'));
      ci.pagePosition = normalizePosition(m.get('page_position_estimate'));
      Object t = m.get('table_name');
      if (t != null && String.isNotBlank(String.valueOf(t))) {
        ci.tableName = String.valueOf(t).trim();
        if (ci.tableName.length() > 255)
          ci.tableName = ci.tableName.substring(0, 255);
      }
    }
    if (String.isBlank(ci.component))
      return null;
    return ci;
  }

  private static Integer toInteger(Object v) {
    if (v == null)
      return null;
    if (v instanceof Integer)
      return (Integer) v;
    try {
      return Integer.valueOf(
        Decimal.valueOf(String.valueOf(v).trim()).intValue()
      );
    } catch (Exception e) {
      return null;
    }
  }

  /** 20, "20", "20%" all become "20%". Anything non-numeric becomes null. */
  private static String normalizePosition(Object v) {
    if (v == null)
      return null;
    String t = String.valueOf(v).trim().replace('%', '').trim();
    if (String.isBlank(t))
      return null;
    try {
      Decimal d = Decimal.valueOf(t);
      return String.valueOf(d.intValue()) + '%';
    } catch (Exception e) {
      return null;
    }
  }

  /** Returns the first balanced, parseable JSON object in text (skips prose and code fences). */
  @TestVisible
  private static String extractFirstJsonObject(String value) {
    if (String.isBlank(value))
      return null;
    for (Integer startIndex = 0; startIndex < value.length(); startIndex++) {
      if (value.substring(startIndex, startIndex + 1) != '{')
        continue;
      Integer endIndex = findJsonEnd(value, startIndex);
      if (endIndex == null)
        continue;
      String candidate = value.substring(startIndex, endIndex + 1);
      try {
        JSON.deserializeUntyped(candidate);
        return candidate;
      } catch (JSONException ignored) {
        // not JSON; keep scanning for the next candidate
      }
    }
    return null;
  }

  private static Integer findJsonEnd(String value, Integer startIndex) {
    Integer objectDepth = 0;
    Integer arrayDepth = 0;
    Boolean insideString = false;
    Boolean escaped = false;
    for (Integer index = startIndex; index < value.length(); index++) {
      String ch = value.substring(index, index + 1);
      if (insideString) {
        if (escaped) {
          escaped = false;
        } else if (ch == '\\') {
          escaped = true;
        } else if (ch == '"') {
          insideString = false;
        }
        continue;
      }
      if (ch == '"') {
        insideString = true;
      } else if (ch == '{') {
        objectDepth++;
      } else if (ch == '}') {
        objectDepth--;
      } else if (ch == '[') {
        arrayDepth++;
      } else if (ch == ']') {
        arrayDepth--;
      }
      if (objectDepth < 0 || arrayDepth < 0)
        return null;
      if (objectDepth == 0 && arrayDepth == 0)
        return index;
    }
    return null;
  }

  @TestVisible
  private static Date parseSapDate(String sapDate) {
    if (String.isBlank(sapDate))
      return null;
    try {
      List<String> parts = sapDate.split('\\.');
      if (parts.size() != 3)
        return null;
      return Date.newInstance(
        Integer.valueOf(parts[2]),
        Integer.valueOf(parts[1]),
        Integer.valueOf(parts[0])
      );
    } catch (Exception e) {
      return null;
    }
  }

  @TestVisible
  private static Decimal parseDuration(String durationStr) {
    if (String.isBlank(durationStr))
      return 0;
    try {
      String cleaned = durationStr.trim()
        .replaceAll('(?i)\\s*H\\s*$', '')
        .replace(',', '.');
      return Decimal.valueOf(cleaned);
    } catch (Exception e) {
      return 0;
    }
  }

  // ─── Inner DTOs for JSON deserialization ─────────────────────────────────────

  public class ExtractionResult {
    public List<OrderDTO> maintenance_orders;
  }

  public class OrderDTO {
    public String order_number;
    public String order_description;
    public String order_long_text;
    public String functional_location;
    public String order_type;
    public String planner_group;
    public String start_date;
    public List<OperationDTO> operations;
    public List<Object> checklist_items;
  }

  public class OperationDTO {
    public String operation_number;
    public String work_center;
    public String task_description;
    public String duration;
    public String notification_number;
  }

  public class WorkpackProcessorException extends Exception {
  }
}
