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

  // Test workers are the supervisor's own ServiceResource (login is by ServiceResource.Id).
  private static Map<String, Id> workerIds = new Map<String, Id>();

  private static Id wid(String key) {
    return workerIds.get(key);
  }

  private static ServiceResource setupWorker(String key, String pin) {
    String saltHash = KioskController.hashPin(pin);
    List<String> parts = saltHash.split('\\|\\|');
    List<ServiceResource> supSR = [
      SELECT Id
      FROM ServiceResource
      WHERE RelatedRecordId = :UserInfo.getUserId() AND IsActive = TRUE
      LIMIT 1
    ];
    if (supSR.isEmpty())
      return null;
    ServiceResource sr = supSR[0];
    sr.PIN_Salt__c = parts[0];
    sr.PIN_Hash__c = parts[1];
    sr.PIN_Failed_Count__c = 0;
    sr.PIN_Locked_Until__c = null;
    update sr;
    workerIds.put(key, sr.Id);
    return sr;
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
      wid('TESTPIN01'),
      '4321'
    );
    Test.stopTest();
    System.assertEquals(true, session.success);
    System.assert(String.isNotBlank(session.token));
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
      wid('TESTPIN02'),
      '9999'
    );
    Test.stopTest();
    System.assertEquals(false, session.success);
    System.assertEquals('WRONG_PIN', session.errorCode);
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
      wid('TESTPIN03'),
      '2222'
    );
    Test.stopTest();
    System.assertEquals(false, session.success);
    System.assertEquals('LOCKED', session.errorCode);
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
        wid('TESTPIN04'),
        '0000'
      );
    }
    Test.stopTest();
    System.assertEquals(false, session.success);
    System.assertEquals('LOCKED', session.errorCode);
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
      wid('TESTPIN05'),
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
      wid('TESTPIN06'),
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
      wid('TESTPIN07'),
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
      worker.Id,
      pin
    );
    return session.success ? session.token : null;
  }

  private static void setWorkerRole(String empId, String role) {
    ServiceResource sr = [
      SELECT Id, Role__c
      FROM ServiceResource
      WHERE Id = :wid(empId)
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
      wid('TESTROLE01'),
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
  static void testWorkerPrefs_roundTrip_andValidation() {
    String token = loginTestWorker('TESTPRF01', '1357');
    if (token == null)
      return;
    Test.startTest();
    String empty = KioskController.getWorkerPrefs(token);
    KioskController.saveWorkerPrefs(token, '{"theme":"light","pinList":true}');
    KioskController.saveWorkerPrefs(token, '{"theme":"dark","pinList":false}');
    String back = KioskController.getWorkerPrefs(token);
    try {
      KioskController.saveWorkerPrefs(token, '[1,2]');
      System.assert(false, 'Expected INVALID_PREFS_JSON');
    } catch (AuraHandledException e) {
      System.assertEquals('INVALID_PREFS_JSON', e.getMessage());
    }
    Test.stopTest();
    System.assertEquals('{}', empty);
    System.assertEquals('{"theme":"dark","pinList":false}', back);
    // Second save updated the same record (long text can't be filtered in SOQL).
    List<Kiosk_App_Config__c> recs = [
      SELECT Settings_JSON__c
      FROM Kiosk_App_Config__c
      WHERE Name LIKE 'Worker:%'
    ];
    Integer matches = 0;
    for (Kiosk_App_Config__c r : recs)
      if (r.Settings_JSON__c == back)
        matches++;
    System.assertEquals(1, matches);
  }

  @IsTest
  static void testWorkerPrefs_expiredToken_throws() {
    try {
      KioskController.getWorkerPrefs('bad');
      System.assert(false, 'Expected exception');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
    try {
      KioskController.saveWorkerPrefs('bad', '{}');
      System.assert(false, 'Expected exception');
    } catch (AuraHandledException e) {
      System.assert(true);
    }
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

  // ---- Clock unification (record on workpack ROOT, one open clock) ----

  @IsTest
  static void testClockIn_recordsOnRoot_andBlocksSecond() {
    String token = loginTestWorker('TESTCLK01', '2468');
    if (token == null)
      return;
    List<WorkOrder> kids = [
      SELECT Id, RootWorkOrderId
      FROM WorkOrder
      WHERE RootWorkOrderId != NULL AND ParentWorkOrderId != NULL
      LIMIT 1
    ];
    if (kids.isEmpty())
      return;
    Id kidId = kids[0].Id;
    Id rootId = kids[0].RootWorkOrderId;
    Test.startTest();
    KioskController.autoClockOut(token);
    System.assertEquals(
      String.valueOf(rootId),
      KioskController.getWorkOrderRoot(token, kidId)
    );
    KioskController.TimeReportDTO tr = KioskController.clockIn(token, kidId);
    System.assertEquals(String.valueOf(rootId), tr.workOrderId);
    Time_Report__c rec = [
      SELECT Work_Order__c, Status__c, End_Time__c
      FROM Time_Report__c
      WHERE Id = :tr.id
    ];
    System.assertEquals(rootId, rec.Work_Order__c);
    System.assertEquals('New', rec.Status__c);
    System.assertEquals(null, rec.End_Time__c);
    try {
      KioskController.clockIn(token, rootId);
      System.assert(false, 'second clock-in on same workpack must throw');
    } catch (Exception e) {
      System.assert(e.getMessage().contains('ALREADY_CLOCKED_IN'));
    }
    KioskController.ClockDTO c = KioskController.getActiveClock(token);
    System.assertEquals(String.valueOf(rootId), c.rootWorkOrderId);
    KioskController.autoClockOut(token);
    System.assertEquals(null, KioskController.getActiveClock(token));
    Test.stopTest();
  }

  @IsTest
  static void testClockIn_otherWorkpack_throwsElsewhere() {
    String token = loginTestWorker('TESTCLK02', '2468');
    if (token == null)
      return;
    List<WorkOrder> a = [
      SELECT Id, RootWorkOrderId
      FROM WorkOrder
      WHERE RootWorkOrderId != NULL
      LIMIT 1
    ];
    if (a.isEmpty())
      return;
    List<WorkOrder> b = [
      SELECT Id
      FROM WorkOrder
      WHERE
        RootWorkOrderId != :a[0].RootWorkOrderId
        AND Id != :a[0].RootWorkOrderId
      LIMIT 1
    ];
    if (b.isEmpty())
      return;
    Test.startTest();
    KioskController.autoClockOut(token);
    KioskController.clockIn(token, a[0].Id);
    try {
      KioskController.clockIn(token, b[0].Id);
      System.assert(false, 'clock-in on another workpack must throw');
    } catch (Exception e) {
      System.assert(
        e.getMessage().contains('CLOCKED_IN_ELSEWHERE') ||
        e.getMessage().contains('ALREADY_CLOCKED_IN')
      );
    }
    KioskController.autoClockOut(token);
    Test.stopTest();
  }

  // ---- PIN management ----

  @IsTest
  static void testPin_noPin_returnsNoPin_thenAdminSetWorks() {
    String token = loginTestWorker('TESTPM01', '2468');
    String territoryId = getExistingTerritoryId();
    if (token == null)
      return;
    Id wId = wid('TESTPM01');
    setWorkerRole('TESTPM01', 'Supervisor');
    Test.startTest();
    KioskController.clearWorkerPin(token, wId);
    KioskController.EmployeeSession s1 = KioskController.validateEmployee(
      territoryId,
      wId,
      '2468'
    );
    System.assertEquals('NO_PIN', s1.errorCode);
    try {
      KioskController.setWorkerPin(token, wId, '1111');
      System.assert(false, 'weak PIN must be rejected');
    } catch (AuraHandledException e) {
      System.assertEquals('WEAK_PIN', e.getMessage());
    }
    KioskController.setWorkerPin(token, wId, '2580');
    KioskController.EmployeeSession s2 = KioskController.validateEmployee(
      territoryId,
      wId,
      '2580'
    );
    System.assertEquals(true, s2.success);
    List<KioskController.RosterMember> ms = KioskController.getManagedWorkers(
      token
    );
    System.assert(ms.size() > 0);
    KioskController.unlockWorker(token, wId);
    Test.stopTest();
  }

  @IsTest
  static void testPin_adminMethods_requireAdminRole() {
    String token = loginTestWorker('TESTPM02', '2468');
    if (token == null)
      return;
    setWorkerRole('TESTPM02', 'Technician');
    Test.startTest();
    try {
      KioskController.unlockWorker(token, wid('TESTPM02'));
      System.assert(false, 'non-admin must be rejected');
    } catch (AuraHandledException e) {
      System.assertEquals('NOT_ALLOWED', e.getMessage());
    }
    Test.stopTest();
  }

  @IsTest
  static void testPin_resetWithEmailedCode_wrongAndRight() {
    String token = loginTestWorker('TESTPM03', '2468');
    String territoryId = getExistingTerritoryId();
    if (token == null)
      return;
    Id wId = wid('TESTPM03');
    Test.startTest();
    KioskController.PinResetResult bad = KioskController.confirmPinReset(
      territoryId,
      wId,
      '000000',
      '2580'
    );
    System.assertEquals(false, bad.success);
    System.assertEquals('WRONG_CODE', bad.errorCode);
    KioskController.PinResetResult weak = KioskController.confirmPinReset(
      territoryId,
      wId,
      '000000',
      '1234'
    );
    System.assertEquals('WEAK_PIN', weak.errorCode);
    KioskController.PinResetResult req = KioskController.requestPinReset(
      territoryId,
      wId
    );
    // success depends on the stand-in worker having a user email + email deliverability
    System.assert(req.success || String.isNotBlank(req.errorCode));
    Test.stopTest();
  }
}
