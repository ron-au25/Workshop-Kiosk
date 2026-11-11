@IsTest(SeeAllData=true)
private class WorkpackPdfProcessorTest {
  private static final String TEST_JSON = '{"maintenance_orders":[{"order_number":"TST-001","order_description":"Test Wagon Inspection","functional_location":"AU-RTR-TEST .ABRK","order_type":"PM01","planner_group":"RW1","start_date":"20.04.2026","operations":[{"operation_number":"0010","work_center":"RMW","task_description":"Inspect brake assembly","duration":"1,5 H","notification_number":"72170093"},{"operation_number":"0020","work_center":"RMW","task_description":"Check coupling","duration":"0,5 H","notification_number":"0"}],"checklist_items":["Check wheel flange for wear and cracking.","Verify coupling pin condition."]}]}';

  private static Id getWorkPackWorkTypeId() {
    List<WorkType> wts = [
      SELECT Id
      FROM WorkType
      WHERE Name = 'Rail Workpack'
      LIMIT 1
    ];
    return wts.isEmpty() ? null : wts[0].Id;
  }

  private static Id getWagonPm01WorkTypeId() {
    List<WorkType> wts = [
      SELECT Id
      FROM WorkType
      WHERE Name = 'Wagon PM01'
      LIMIT 1
    ];
    return wts.isEmpty() ? null : wts[0].Id;
  }

  private static Id getAnyServiceTerritoryId() {
    List<ServiceTerritory> sts = [
      SELECT Id
      FROM ServiceTerritory
      WHERE IsActive = TRUE
      LIMIT 1
    ];
    return sts.isEmpty() ? null : sts[0].Id;
  }

  // ─── Helper methods ──────────────────────────────────────────────────────────

  private static WorkOrder insertParentWorkOrder(
    Id workTypeId,
    Id territoryId
  ) {
    WorkOrder wo = new WorkOrder(
      WorkTypeId = workTypeId,
      ServiceTerritoryId = territoryId,
      Subject = 'Test Rail Workpack',
      Status = 'New'
    );
    insert wo;
    return wo;
  }

  private static ContentDocumentLink attachTextToWorkOrder(
    Id workOrderId,
    String text
  ) {
    ContentVersion cv = new ContentVersion(
      Title = 'TestWorkpack.pdf',
      PathOnClient = 'TestWorkpack.pdf',
      VersionData = Blob.valueOf(text),
      IsMajorVersion = true
    );
    insert cv;
    ContentVersion inserted = [
      SELECT ContentDocumentId
      FROM ContentVersion
      WHERE Id = :cv.Id
      LIMIT 1
    ];

    ContentDocumentLink cdl = new ContentDocumentLink(
      ContentDocumentId = inserted.ContentDocumentId,
      LinkedEntityId = workOrderId,
      ShareType = 'V',
      Visibility = 'AllUsers'
    );
    insert cdl;
    return cdl;
  }

  // ─── parseSapDate unit tests ──────────────────────────────────────────────────

  @IsTest
  static void testParseSapDate_validDate() {
    Test.startTest();
    Date result = WorkpackPdfProcessor.parseSapDate('20.04.2026');
    Test.stopTest();
    System.assertEquals(
      Date.newInstance(2026, 4, 20),
      result,
      'Expected 20 April 2026'
    );
  }

  @IsTest
  static void testParseSapDate_null() {
    Test.startTest();
    Date result = WorkpackPdfProcessor.parseSapDate(null);
    Test.stopTest();
    System.assertEquals(null, result);
  }

  @IsTest
  static void testParseSapDate_invalidFormat() {
    Test.startTest();
    Date result = WorkpackPdfProcessor.parseSapDate('2026-04-20');
    Test.stopTest();
    System.assertEquals(null, result);
  }

  // ─── parseDuration unit tests ─────────────────────────────────────────────────

  @IsTest
  static void testParseDuration_standard() {
    Test.startTest();
    Decimal result = WorkpackPdfProcessor.parseDuration('1,5 H');
    Test.stopTest();
    System.assertEquals(1.5, result);
  }

  @IsTest
  static void testParseDuration_zero() {
    Test.startTest();
    Decimal result = WorkpackPdfProcessor.parseDuration('0,0 H');
    Test.stopTest();
    System.assertEquals(0.0, result);
  }

  @IsTest
  static void testParseDuration_blank() {
    Test.startTest();
    Decimal result = WorkpackPdfProcessor.parseDuration('');
    Test.stopTest();
    System.assertEquals(0, result);
  }

  @IsTest
  static void testParseDuration_dotSeparator() {
    Test.startTest();
    Decimal result = WorkpackPdfProcessor.parseDuration('2.5 H');
    Test.stopTest();
    System.assertEquals(2.5, result);
  }

  // ─── Integration test: creates child records ──────────────────────────────────

  @IsTest
  static void testRunProcessing_createsChildWorkOrders() {
    Id workpackTypeId = getWorkPackWorkTypeId();
    Id wagonTypeId = getWagonPm01WorkTypeId();
    Id territoryId = getAnyServiceTerritoryId();
    if (workpackTypeId == null || wagonTypeId == null || territoryId == null) {
      System.debug(
        'Skipping: required WorkType or ServiceTerritory not found in org'
      );
      return;
    }

    WorkOrder parentWo = insertParentWorkOrder(workpackTypeId, territoryId);
    ContentDocumentLink cdl = attachTextToWorkOrder(
      parentWo.Id,
      'dummy pdf text'
    );

    WorkpackPdfProcessor.mockLlmResponse = TEST_JSON;

    Test.startTest();
    WorkpackPdfProcessor.runProcessing(cdl.Id, parentWo.Id);
    Test.stopTest();

    List<WorkOrder> children = [
      SELECT
        Id,
        External_ID__c,
        Subject,
        SAP_FLOC_Desc__c,
        SAP_Work_Center__c,
        WorkTypeId,
        ParentWorkOrderId
      FROM WorkOrder
      WHERE ParentWorkOrderId = :parentWo.Id
    ];
    System.assertEquals(1, children.size(), 'Expected 1 child WorkOrder');
    System.assertEquals('TST-001', children[0].External_ID__c);
    System.assertEquals('Test Wagon Inspection', children[0].Subject);
    System.assertEquals('AU-RTR-TEST .ABRK', children[0].SAP_FLOC_Desc__c);
    System.assertEquals('RW1', children[0].SAP_Work_Center__c);
    System.assertEquals(wagonTypeId, children[0].WorkTypeId);
    System.assertEquals(parentWo.Id, children[0].ParentWorkOrderId);

    List<WorkOrderLineItem> wolis = [
      SELECT Id, Subject, Description, Duration
      FROM WorkOrderLineItem
      WHERE WorkOrderId = :children[0].Id
      ORDER BY Subject ASC
    ];
    System.assertEquals(2, wolis.size(), 'Expected 2 WorkOrderLineItems');
    System.assertEquals('0010', wolis[0].Subject);
    System.assertEquals('Inspect brake assembly', wolis[0].Description);
    System.assertEquals(1.5, wolis[0].Duration);

    List<Measure_Point__c> mps = [
      SELECT Id, Component_Name__c, Measure_Type__c
      FROM Measure_Point__c
      WHERE Work_Order__c = :children[0].Id
    ];
    System.assertEquals(2, mps.size(), 'Expected 2 Measure Points');
    for (Measure_Point__c mp : mps) {
      System.assertEquals('OK', mp.Measure_Type__c);
      System.assertNotEquals(null, mp.Component_Name__c);
    }
  }

  // ─── Integration test: idempotency (no duplicate child WOs on re-run) ─────────

  @IsTest
  static void testRunProcessing_idempotent() {
    Id workpackTypeId = getWorkPackWorkTypeId();
    Id territoryId = getAnyServiceTerritoryId();
    if (workpackTypeId == null || territoryId == null) {
      System.debug(
        'Skipping: required WorkType or ServiceTerritory not found in org'
      );
      return;
    }

    WorkOrder parentWo = insertParentWorkOrder(workpackTypeId, territoryId);
    ContentDocumentLink cdl = attachTextToWorkOrder(
      parentWo.Id,
      'dummy pdf text'
    );

    WorkpackPdfProcessor.mockLlmResponse = TEST_JSON;

    Test.startTest();
    WorkpackPdfProcessor.runProcessing(cdl.Id, parentWo.Id);
    WorkpackPdfProcessor.runProcessing(cdl.Id, parentWo.Id);
    Test.stopTest();

    List<WorkOrder> children = [
      SELECT Id
      FROM WorkOrder
      WHERE ParentWorkOrderId = :parentWo.Id
    ];
    System.assertEquals(
      1,
      children.size(),
      'Idempotent: still 1 child after 2 runs'
    );

    List<WorkOrderLineItem> wolis = [
      SELECT Id
      FROM WorkOrderLineItem
      WHERE WorkOrderId = :children[0].Id
    ];
    System.assertEquals(
      2,
      wolis.size(),
      'Idempotent: still 2 WOLIs after 2 runs'
    );

    List<Measure_Point__c> mps = [
      SELECT Id
      FROM Measure_Point__c
      WHERE Work_Order__c = :children[0].Id
    ];
    System.assertEquals(
      2,
      mps.size(),
      'Idempotent: still 2 Measure Points after 2 runs'
    );
  }

  // ─── Edge case: empty LLM response exits cleanly ──────────────────────────────

  @IsTest
  static void testRunProcessing_emptyExtraction_doesNotThrow() {
    Id workpackTypeId = getWorkPackWorkTypeId();
    Id territoryId = getAnyServiceTerritoryId();
    if (workpackTypeId == null || territoryId == null)
      return;

    WorkOrder parentWo = insertParentWorkOrder(workpackTypeId, territoryId);
    ContentDocumentLink cdl = attachTextToWorkOrder(parentWo.Id, 'dummy');

    WorkpackPdfProcessor.mockLlmResponse = '{"maintenance_orders":[]}';

    Test.startTest();
    WorkpackPdfProcessor.runProcessing(cdl.Id, parentWo.Id);
    Test.stopTest();

    List<WorkOrder> children = [
      SELECT Id
      FROM WorkOrder
      WHERE ParentWorkOrderId = :parentWo.Id
    ];
    System.assertEquals(
      0,
      children.size(),
      'No child WOs should be created for empty extraction'
    );
  }

  // ─── Page / position / table / source stamping ───────────────────────────────

  private static final String NEW_SHAPE_JSON = '{"maintenance_orders":[{"order_number":"TST-002","order_description":"Test Page Fields","functional_location":"AU-RTR-TEST .ABRK","order_type":"PM01","planner_group":"RW1","start_date":"20.04.2026","operations":[],"checklist_items":[{"component":"Check wheel flange","page_number":2,"page_position_estimate":"20%"},{"component":"Flank Wear - Measurement (mm)","page_number":"3","page_position_estimate":65,"table_name":"Wheel Flange Measurements"}]}]}';

  @IsTest
  static void testParseChecklistItem_shapes() {
    WorkpackPdfProcessor.ChecklistItem a = WorkpackPdfProcessor.parseChecklistItem(
      'Plain item'
    );
    System.assertEquals('Plain item', a.component);
    System.assertEquals(null, a.pageNumber);
    System.assertEquals(null, a.pagePosition);
    WorkpackPdfProcessor.ChecklistItem b = WorkpackPdfProcessor.parseChecklistItem(
      new Map<String, Object>{
        'component' => 'X',
        'page_number' => '4',
        'page_position_estimate' => 20,
        'table_name' => 'T'
      }
    );
    System.assertEquals(4, b.pageNumber);
    System.assertEquals('20%', b.pagePosition);
    System.assertEquals('T', b.tableName);
    WorkpackPdfProcessor.ChecklistItem c = WorkpackPdfProcessor.parseChecklistItem(
      new Map<String, Object>{
        'component' => 'Y',
        'page_number' => 7,
        'page_position_estimate' => '20%'
      }
    );
    System.assertEquals(7, c.pageNumber);
    System.assertEquals('20%', c.pagePosition);
    System.assertEquals(null, WorkpackPdfProcessor.parseChecklistItem('  '));
    System.assertEquals(
      null,
      WorkpackPdfProcessor.parseChecklistItem(
        new Map<String, Object>{ 'page_number' => 1 }
      )
    );
  }

  @IsTest
  static void testExtractFirstJsonObject_wrappedInFencesAndProse() {
    String wrapped = 'Here is the JSON: ```json\n{"a":{"b":"}"},"c":[1,2]}\n``` thanks';
    System.assertEquals(
      '{"a":{"b":"}"},"c":[1,2]}',
      WorkpackPdfProcessor.extractFirstJsonObject(wrapped)
    );
    System.assertEquals(
      null,
      WorkpackPdfProcessor.extractFirstJsonObject('no json here')
    );
    System.assertEquals(
      null,
      WorkpackPdfProcessor.extractFirstJsonObject(null)
    );
  }

  @IsTest
  static void testRunProcessing_stampsPageFieldsAndSource() {
    Id workpackTypeId = getWorkPackWorkTypeId();
    Id wagonTypeId = getWagonPm01WorkTypeId();
    Id territoryId = getAnyServiceTerritoryId();
    if (workpackTypeId == null || wagonTypeId == null || territoryId == null) {
      return;
    }
    WorkOrder parentWo = insertParentWorkOrder(workpackTypeId, territoryId);
    ContentDocumentLink cdl = attachTextToWorkOrder(
      parentWo.Id,
      'dummy pdf text'
    );
    WorkpackPdfProcessor.mockLlmResponse =
      'Here is the JSON: ```json\n' +
      NEW_SHAPE_JSON +
      '\n```';

    Test.startTest();
    WorkpackPdfProcessor.runProcessing(cdl.Id, parentWo.Id);
    Test.stopTest();

    List<Measure_Point__c> mps = [
      SELECT
        Component_Name__c,
        Measure_Type__c,
        Source_Document__c,
        Page_Number__c,
        Page_Position_Estimate__c,
        Table_Name__c
      FROM Measure_Point__c
      WHERE Work_Order__r.ParentWorkOrderId = :parentWo.Id
      ORDER BY Page_Number__c ASC
    ];
    System.assertEquals(2, mps.size());
    String docId = String.valueOf(
      [SELECT ContentDocumentId FROM ContentDocumentLink WHERE Id = :cdl.Id]
      .ContentDocumentId
    );
    System.assertEquals('Check wheel flange', mps[0].Component_Name__c);
    System.assertEquals(2, mps[0].Page_Number__c);
    System.assertEquals('20%', mps[0].Page_Position_Estimate__c);
    System.assertEquals(null, mps[0].Table_Name__c);
    System.assertEquals(docId, mps[0].Source_Document__c);
    System.assertEquals(
      'Flank Wear - Measurement (mm)',
      mps[1].Component_Name__c
    );
    System.assertEquals(3, mps[1].Page_Number__c);
    System.assertEquals('65%', mps[1].Page_Position_Estimate__c);
    System.assertEquals('Wheel Flange Measurements', mps[1].Table_Name__c);
    System.assertEquals('Measure', mps[1].Measure_Type__c);
    System.assertEquals(docId, mps[1].Source_Document__c);
  }
}
