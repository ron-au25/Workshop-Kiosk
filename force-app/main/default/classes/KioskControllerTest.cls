@IsTest(SeeAllData=true)
private class KioskControllerTest {
  // Uses existing org data — ServiceTerritoryMember inserts blocked by broken org Flow trigger
  // Assumes: supervisor user has a ServiceResource + ServiceTerritoryMember in the org

  private static String getExistingTerritoryId() {
    List<ServiceTerritoryMember> stm = [
      SELECT ServiceTerritoryId
      FROM ServiceTerritoryMember
      WHERE
        ServiceResource.RelatedRecordId = :UserInfo.getUserId()
        AND ServiceResource.IsActive = TRUE
      LIMIT 1
    ];
    return stm.isEmpty() ? null : stm[0].ServiceTerritoryId;
  }

  private static ServiceResource setupWorker(String employeeId, String pin) {
    String saltHash = KioskController.hashPin(pin);
    List<String> parts = saltHash.split('\\|\\|');
    List<ServiceResource> existing = [
      SELECT Id
      FROM ServiceResource
      WHERE Employee_Id__c = :employeeId
      LIMIT 1
    ];
    if (!existing.isEmpty()) {
      ServiceResource sr = existing[0];
      sr.PIN_Salt__c = parts[0];
      sr.PIN_Hash__c = parts[1];
      sr.PIN_Failed_Count__c = 0;
      sr.PIN_Locked_Until__c = null;
      update sr;
      return sr;
    }
    // Fall back: use supervisor's own ServiceResource as a test stand-in
    List<ServiceResource> supSR = [
      SELECT Id
      FROM ServiceResource
      WHERE RelatedRecordId = :UserInfo.getUserId() AND IsActive = TRUE
      LIMIT 1
    ];
    if (!supSR.isEmpty()) {
      ServiceResource sr = supSR[0];
      sr.Employee_Id__c = employeeId;
      sr.PIN_Salt__c = parts[0];
      sr.PIN_Hash__c = parts[1];
      sr.PIN_Failed_Count__c = 0;
      sr.PIN_Locked_Until__c = null;
      update sr;
      return sr;
    }
    return null;
  }

  @IsTest
  static void testGetSupervisorContext_happyPath() {
    Test.startTest();
    KioskController.SupervisorContext ctx = KioskController.getSupervisorContext();
    Test.stopTest();
    System.assertNotEquals(null, ctx);
    // If supervisor has a territory, should be true; otherwise gracefully returns false
    if (ctx.isSupervisor) {
      System.assertNotEquals(null, ctx.territoryId);
      System.assertNotEquals(null, ctx.territoryName);
    }
  }

  @IsTest
  static void testGetTerritoryRoster_returnsResults() {
    String territoryId = getExistingTerritoryId();
    if (territoryId == null)
      return; // skip if no territory
    Test.startTest();
    List<KioskController.RosterMember> roster = KioskController.getTerritoryRoster(
      territoryId
    );
    Test.stopTest();
    System.assertNotEquals(null, roster);
  }

  @IsTest
  static void testGetTerritoryRoster_blankId_throws() {
    Test.startTest();
    try {
      KioskController.getTerritoryRoster('');
      System.assert(false, 'Expected exception');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    Test.stopTest();
  }

  @IsTest
  static void testValidateEmployee_correctPin() {
    String territoryId = getExistingTerritoryId();
    if (territoryId == null)
      return;
    ServiceResource worker = setupWorker('TESTPIN01', '4321');
    if (worker == null)
      return;
    Test.startTest();
    KioskController.EmployeeSession session = KioskController.validateEmployee(
      territoryId,
      'TESTPIN01',
      '4321'
    );
    Test.stopTest();
    System.assertEquals(true, session.success);
    System.assert(String.isNotBlank(session.token));
    // Reset employee ID to avoid polluting org data
    worker.Employee_Id__c = null;
    update worker;
  }

  @IsTest
  static void testValidateEmployee_wrongPin() {
    String territoryId = getExistingTerritoryId();
    if (territoryId == null)
      return;
    ServiceResource worker = setupWorker('TESTPIN02', '1111');
    if (worker == null)
      return;
    Test.startTest();
    KioskController.EmployeeSession session = KioskController.validateEmployee(
      territoryId,
      'TESTPIN02',
      '9999'
    );
    Test.stopTest();
    System.assertEquals(false, session.success);
    System.assertEquals('WRONG_PIN', session.errorCode);
    worker.Employee_Id__c = null;
    update worker;
  }

  @IsTest
  static void testValidateEmployee_notFound() {
    String territoryId = getExistingTerritoryId();
    if (territoryId == null)
      return;
    Test.startTest();
    KioskController.EmployeeSession session = KioskController.validateEmployee(
      territoryId,
      'NONEXISTENT_XYZ',
      '0000'
    );
    Test.stopTest();
    System.assertEquals(false, session.success);
    System.assertEquals('NOT_FOUND', session.errorCode);
  }

  @IsTest
  static void testValidateEmployee_lockedAccount() {
    String territoryId = getExistingTerritoryId();
    if (territoryId == null)
      return;
    ServiceResource worker = setupWorker('TESTPIN03', '2222');
    if (worker == null)
      return;
    worker.PIN_Locked_Until__c = DateTime.now().addMinutes(10);
    update worker;
    Test.startTest();
    KioskController.EmployeeSession session = KioskController.validateEmployee(
      territoryId,
      'TESTPIN03',
      '2222'
    );
    Test.stopTest();
    System.assertEquals(false, session.success);
    System.assertEquals('LOCKED', session.errorCode);
    worker.Employee_Id__c = null;
    worker.PIN_Locked_Until__c = null;
    update worker;
  }

  @IsTest
  static void testValidateEmployee_lockoutAfterFiveFailures() {
    String territoryId = getExistingTerritoryId();
    if (territoryId == null)
      return;
    ServiceResource worker = setupWorker('TESTPIN04', '3333');
    if (worker == null)
      return;
    KioskController.EmployeeSession session;
    Test.startTest();
    for (Integer i = 0; i < 5; i++) {
      session = KioskController.validateEmployee(
        territoryId,
        'TESTPIN04',
        '0000'
      );
    }
    Test.stopTest();
    System.assertEquals(false, session.success);
    System.assertEquals('LOCKED', session.errorCode);
    worker.Employee_Id__c = null;
    worker.PIN_Locked_Until__c = null;
    worker.PIN_Failed_Count__c = 0;
    update worker;
  }

  @IsTest
  static void testGetDashboardMetrics_validSession() {
    String territoryId = getExistingTerritoryId();
    if (territoryId == null)
      return;
    ServiceResource worker = setupWorker('TESTPIN05', '5678');
    if (worker == null)
      return;
    KioskController.EmployeeSession session = KioskController.validateEmployee(
      territoryId,
      'TESTPIN05',
      '5678'
    );
    if (!session.success)
      return;
    Test.startTest();
    KioskController.DashboardMetrics metrics = KioskController.getDashboardMetrics(
      session.token,
      null,
      null
    );
    Test.stopTest();
    System.assertNotEquals(null, metrics);
    System.assert(metrics.openCount >= 0);
    System.assertNotEquals(null, metrics.workTypeBreakdown);
    worker.Employee_Id__c = null;
    update worker;
  }

  @IsTest
  static void testGetDashboardMetrics_expiredToken_throws() {
    Test.startTest();
    Boolean threw = false;
    try {
      KioskController.getDashboardMetrics('badtoken', null, null);
    } catch (AuraHandledException e) {
      threw = true;
    }
    Test.stopTest();
    System.assert(threw, 'Expected AuraHandledException for bad token');
  }

  @IsTest
  static void testGetWorkOrders_noFilters() {
    String territoryId = getExistingTerritoryId();
    if (territoryId == null)
      return;
    ServiceResource worker = setupWorker('TESTPIN06', '9012');
    if (worker == null)
      return;
    KioskController.EmployeeSession session = KioskController.validateEmployee(
      territoryId,
      'TESTPIN06',
      '9012'
    );
    if (!session.success)
      return;
    KioskController.WorkOrderFilter filter = new KioskController.WorkOrderFilter();
    filter.pageSize = 50;
    filter.pageOffset = 0;
    Test.startTest();
    KioskController.WorkOrderPage page = KioskController.getWorkOrders(
      session.token,
      JSON.serialize(filter)
    );
    Test.stopTest();
    System.assertNotEquals(null, page);
    System.assert(page.totalCount >= 0);
    worker.Employee_Id__c = null;
    update worker;
  }

  @IsTest
  static void testGetWorkOrders_expiredToken_throws() {
    KioskController.WorkOrderFilter filter = new KioskController.WorkOrderFilter();
    filter.pageSize = 50;
    filter.pageOffset = 0;
    Test.startTest();
    Boolean threw = false;
    try {
      KioskController.getWorkOrders('badtoken', JSON.serialize(filter));
    } catch (AuraHandledException e) {
      threw = true;
    }
    Test.stopTest();
    System.assert(threw, 'Expected AuraHandledException for bad token');
  }

  @IsTest
  static void testRefreshSession_valid() {
    String territoryId = getExistingTerritoryId();
    if (territoryId == null)
      return;
    ServiceResource worker = setupWorker('TESTPIN07', '3456');
    if (worker == null)
      return;
    KioskController.EmployeeSession session = KioskController.validateEmployee(
      territoryId,
      'TESTPIN07',
      '3456'
    );
    if (!session.success)
      return;
    Test.startTest();
    KioskController.EmployeeSession refreshed = KioskController.refreshSession(
      session.token
    );
    Test.stopTest();
    System.assertEquals(true, refreshed.success);
    System.assert(String.isNotBlank(refreshed.token));
    worker.Employee_Id__c = null;
    update worker;
  }

  @IsTest
  static void testRefreshSession_invalid() {
    Test.startTest();
    KioskController.EmployeeSession result = KioskController.refreshSession(
      'garbage'
    );
    Test.stopTest();
    System.assertEquals(false, result.success);
    System.assertEquals('SESSION_EXPIRED', result.errorCode);
  }

  @IsTest
  static void testHashPin_returnsNonEmptyParts() {
    Test.startTest();
    String result = KioskController.hashPin('1234');
    Test.stopTest();
    System.assert(result.contains('||'));
    List<String> parts = result.split('\\|\\|');
    System.assertEquals(2, parts.size());
    System.assert(String.isNotBlank(parts[0]));
    System.assert(String.isNotBlank(parts[1]));
  }

  @IsTest
  static void testValidateEmployee_missingFields() {
    Test.startTest();
    KioskController.EmployeeSession session = KioskController.validateEmployee(
      '',
      '',
      ''
    );
    Test.stopTest();
    System.assertEquals(false, session.success);
    System.assertEquals('MISSING_FIELDS', session.errorCode);
  }

  // ---- Redesign Phase 3 ----

  private static String loginTestWorker(String empId, String pin) {
    String territoryId = getExistingTerritoryId();
    if (territoryId == null)
      return null;
    ServiceResource worker = setupWorker(empId, pin);
    if (worker == null)
      return null;
    KioskController.EmployeeSession session = KioskController.validateEmployee(
      territoryId,
      empId,
      pin
    );
    return session.success ? session.token : null;
  }

  private static void setWorkerRole(String empId, String role) {
    ServiceResource sr = [
      SELECT Id, Role__c
      FROM ServiceResource
      WHERE Employee_Id__c = :empId
      LIMIT 1
    ];
    sr.Role__c = role;
    update sr;
  }

  @IsTest
  static void testWorkerRole_returnedOnLogin() {
    String territoryId = getExistingTerritoryId();
    if (territoryId == null)
      return;
    ServiceResource worker = setupWorker('TESTROLE01', '1357');
    if (worker == null)
      return;
    worker.Role__c = 'Supervisor';
    update worker;
    Test.startTest();
    KioskController.EmployeeSession session = KioskController.validateEmployee(
      territoryId,
      'TESTROLE01',
      '1357'
    );
    Test.stopTest();
    System.assertEquals(true, session.success);
    System.assertEquals('Supervisor', session.workerRole);
  }

  @IsTest
  static void testKioskConfig_roleGate() {
    String token = loginTestWorker('TESTCFG01', '2468');
    if (token == null)
      return;
    setWorkerRole('TESTCFG01', 'Operator');
    Test.startTest();
    try {
      KioskController.saveKioskConfig(token, '{"a":1}');
      System.assert(false, 'Expected NOT_ALLOWED');
    } catch (AuraHandledException e) {
      System.assertEquals('NOT_ALLOWED', e.getMessage());
    }
    setWorkerRole('TESTCFG01', ' admin ');
    KioskController.saveKioskConfig(token, '{"a":1}');
    String back = KioskController.getKioskConfig(token);
    try {
      KioskController.saveKioskConfig(token, '[1,2]');
      System.assert(false, 'Expected INVALID_CONFIG_JSON');
    } catch (AuraHandledException e) {
      System.assertEquals('INVALID_CONFIG_JSON', e.getMessage());
    }
    Test.stopTest();
    System.assertEquals('{"a":1}', back);
  }

  @IsTest
  static void testKioskConfig_expiredToken_throws() {
    try {
      KioskController.getKioskConfig('bad');
      System.assert(false, 'Expected exception');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
  }

  @IsTest
  static void testGetWorkpackChildProgress_countsMatchChildren() {
    String token = loginTestWorker('TESTCHP01', '3579');
    if (token == null)
      return;
    List<WorkOrder> kids = [
      SELECT RootWorkOrderId
      FROM WorkOrder
      WHERE RootWorkOrderId != NULL AND ParentWorkOrderId != NULL
      LIMIT 1
    ];
    if (kids.isEmpty())
      return;
    Id rootId = kids[0].RootWorkOrderId;
    Integer expected = [
      SELECT COUNT()
      FROM WorkOrder
      WHERE RootWorkOrderId = :rootId AND Id != :rootId
    ];
    Test.startTest();
    String out = KioskController.getWorkpackChildProgress(token, rootId);
    Test.stopTest();
    List<Object> rows = (List<Object>) JSON.deserializeUntyped(out);
    System.assertEquals(expected, rows.size());
    Map<String, Object> r0 = (Map<String, Object>) rows[0];
    System.assert(r0.containsKey('stepsTotal'));
    System.assert(r0.containsKey('bareFindings'));
    Integer f = (Integer) r0.get('findings');
    Integer b = (Integer) r0.get('bareFindings');
    System.assert(b <= f, 'bare findings cannot exceed findings');
  }

  @IsTest
  static void testGetWorkpackChildProgress_blankAndExpired() {
    String token = loginTestWorker('TESTCHP02', '3580');
    if (token != null) {
      System.assertEquals(
        '[]',
        KioskController.getWorkpackChildProgress(token, '')
      );
    }
    try {
      KioskController.getWorkpackChildProgress('bad', null);
      System.assert(false, 'Expected exception');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
  }

  @IsTest
  static void testGetWorkTypes_andRaisedTasks() {
    String token = loginTestWorker('TESTRAI01', '4680');
    if (token == null)
      return;
    Test.startTest();
    List<Object> types = (List<Object>) JSON.deserializeUntyped(
      KioskController.getWorkTypes(token)
    );
    List<KioskController.TaskWoDTO> none = KioskController.getRaisedTasks(
      token,
      ''
    );
    Test.stopTest();
    System.assert(types.size() > 0);
    System.assertEquals(0, none.size());
  }

  @IsTest
  static void testGetWorkpackTimeRecords_matchesQuery() {
    String token = loginTestWorker('TESTTIM01', '5791');
    if (token == null)
      return;
    List<Time_Report__c> trs = [
      SELECT Work_Order__r.RootWorkOrderId, Work_Order__c
      FROM Time_Report__c
      WHERE Work_Order__c != NULL AND Work_Order__r.RootWorkOrderId != NULL
      LIMIT 1
    ];
    if (trs.isEmpty())
      return;
    Id rootId = trs[0].Work_Order__r.RootWorkOrderId;
    Test.startTest();
    List<Object> rows = (List<Object>) JSON.deserializeUntyped(
      KioskController.getWorkpackTimeRecords(token, rootId)
    );
    Test.stopTest();
    System.assert(rows.size() > 0);
    System.assert(rows.size() <= 200);
  }

  @IsTest
  static void testGetWorkOrderTile_whitelistAndValues() {
    String token = loginTestWorker('TESTTIL01', '1357');
    if (token == null)
      return;
    List<WorkOrder> wos = [
      SELECT Id, Status
      FROM WorkOrder
      WHERE WorkTypeId != NULL
      LIMIT 1
    ];
    if (wos.isEmpty())
      return;
    Test.startTest();
    Map<String, Object> m = (Map<String, Object>) JSON.deserializeUntyped(
      KioskController.getWorkOrderTile(
        token,
        wos[0].Id,
        '["Status","WorkType","Bogus__c","Id"]'
      )
    );
    Test.stopTest();
    System.assertEquals(wos[0].Status, (String) m.get('Status'));
    System.assert(m.containsKey('WorkType'));
    System.assert(!m.containsKey('Bogus__c'));
    System.assert(!m.containsKey('Id'));
  }

  @IsTest
  static void testGetWorkOrderTile_expiredToken_throws() {
    try {
      KioskController.getWorkOrderTile('bad', null, '["Status"]');
      System.assert(false, 'Expected exception');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
  }

  @IsTest
  static void testAssetFields_getAndSave() {
    String token = loginTestWorker('TESTAST01', '2468');
    if (token == null)
      return;
    List<Asset> assets = [SELECT Id, SerialNumber FROM Asset LIMIT 1];
    if (assets.isEmpty())
      return;
    Test.startTest();
    List<Object> rows = (List<Object>) JSON.deserializeUntyped(
      KioskController.getAssetFields(
        token,
        assets[0].Id,
        '["Name","SerialNumber","Bogus__c","Id"]'
      )
    );
    Integer n = KioskController.saveAssetFields(
      token,
      assets[0].Id,
      '{"Bogus__c":"x","Id":"y"}'
    );
    Test.stopTest();
    System.assert(!rows.isEmpty());
    for (Object o : rows) {
      Map<String, Object> m = (Map<String, Object>) o;
      System.assert(m.get('key') != 'Bogus__c' && m.get('key') != 'Id');
    }
    System.assertEquals(0, n);
  }

  @IsTest
  static void testAssetFields_expiredToken_throws() {
    try {
      KioskController.getAssetFields('bad', null, '["Name"]');
      System.assert(false, 'Expected exception');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    try {
      KioskController.saveAssetFields('bad', null, '{}');
      System.assert(false, 'Expected exception');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
  }

  @IsTest
  static void testGetMeasurePdf_gates() {
    String token = loginTestWorker('TESTPDF01', '6802');
    if (token == null)
      return;
    List<WorkOrder> wps = [
      SELECT Id
      FROM WorkOrder
      WHERE ParentWorkOrderId = NULL
      LIMIT 1
    ];
    if (wps.isEmpty())
      return;
    Test.startTest();
    try {
      KioskController.getMeasurePdf(token, wps[0].Id, '069000000000000AAA');
      System.assert(false, 'Expected NOT_ALLOWED');
    } catch (AuraHandledException e) {
      System.assertEquals('NOT_ALLOWED', e.getMessage());
    }
    try {
      KioskController.getMeasurePdf(token, '', null);
      System.assert(false, 'Expected INVALID_REQUEST');
    } catch (AuraHandledException e) {
      System.assertEquals('INVALID_REQUEST', e.getMessage());
    }
    Test.stopTest();
  }
}
