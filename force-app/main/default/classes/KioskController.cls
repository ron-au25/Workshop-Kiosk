public with sharing class KioskController {
  private static final Integer PIN_MAX_FAILURES = 5;
  private static final Integer PIN_LOCKOUT_MINUTES = 15;
  private static final Integer TOKEN_TTL_MINUTES = 15;
  private static final Integer TOKEN_MAX_HOURS = 8;
  private static final String HMAC_KEY = 'KioskHmacKey2026RioTintoRail!';

  // ─── DTOs ────────────────────────────────────────────────────────────────

  public class SupervisorContext {
    @AuraEnabled
    public String territoryId;
    @AuraEnabled
    public String territoryName;
    @AuraEnabled
    public String supervisorName;
    @AuraEnabled
    public String kioskNotes;
    @AuraEnabled
    public Boolean isSupervisor;
    @AuraEnabled
    public Boolean isGuest;
    @AuraEnabled
    public String siteBaseUrl;
  }

  public class RosterMember {
    @AuraEnabled
    public String resourceId;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String role;
    @AuraEnabled
    public String ganttLabel;
    @AuraEnabled
    public String photoUrl;
    @AuraEnabled
    public String employeeId;
    @AuraEnabled
    public Boolean isLocked;
    @AuraEnabled
    public Long lockedUntilMs;
  }

  public class EmployeeSession {
    @AuraEnabled
    public Boolean success;
    @AuraEnabled
    public String token;
    @AuraEnabled
    public String workerId;
    @AuraEnabled
    public String workerName;
    @AuraEnabled
    public String crewName; // the crew the worker belongs to (null if none)
    @AuraEnabled
    public String workerRole; // ServiceResource.Role__c; Supervisor/Admin unlock Time Tracking and Config
    @AuraEnabled
    public String errorCode;
    @AuraEnabled
    public Integer remainingAttempts;
    @AuraEnabled
    public Long lockedUntilMs;
  }

  public class DashboardMetrics {
    @AuraEnabled
    public Integer openCount;
    @AuraEnabled
    public Integer inProgressCount;
    @AuraEnabled
    public Integer completedCount;
    @AuraEnabled
    public Integer criticalCount;
    @AuraEnabled
    public Integer totalDurationMinutes; // planned hours (sum of WO DurationInMinutes)
    @AuraEnabled
    public Integer totalActualMinutes; // actual time logged in Time_Report__c
    @AuraEnabled
    public String kioskNotes;
    @AuraEnabled
    public List<DonutSlice> workTypeBreakdown;
    @AuraEnabled
    public List<CriticalJob> topCriticalJobs;
    @AuraEnabled
    public List<JobDay> jobsPerDay; // scheduled jobs bucketed by day
  }

  public class DonutSlice {
    @AuraEnabled
    public String label;
    @AuraEnabled
    public Integer count;
  }

  // One progress KPI: done vs total (Integer for display, Decimal raw for qty/cost), plus percent 0-100.
  public class KpiDTO {
    @AuraEnabled
    public Integer done;
    @AuraEnabled
    public Integer total;
    @AuraEnabled
    public Integer percent;
    @AuraEnabled
    public Decimal doneRaw;
    @AuraEnabled
    public Decimal totalRaw;
  }

  // Workpack progress rollup across the root WO + all its child WOs.
  public class WorkpackProgressDTO {
    @AuraEnabled
    public KpiDTO steps;
    @AuraEnabled
    public KpiDTO measures;
    @AuraEnabled
    public KpiDTO labour;
    @AuraEnabled
    public KpiDTO parts;
    @AuraEnabled
    public KpiDTO partsCost;
    @AuraEnabled
    public KpiDTO components;
    @AuraEnabled
    public Integer overallPercent;
  }

  public class JobDay {
    @AuraEnabled
    public String day; // ISO date yyyy-MM-dd
    @AuraEnabled
    public Integer count; // jobs scheduled that day
  }

  public class CriticalJob {
    @AuraEnabled
    public String woNumber;
    @AuraEnabled
    public String subject;
    @AuraEnabled
    public String wagonNumber;
    @AuraEnabled
    public String status;
  }

  public class WorkOrderPage {
    @AuraEnabled
    public List<WorkOrderCard> records;
    @AuraEnabled
    public Integer totalCount;
    @AuraEnabled
    public Boolean hasMore;
    @AuraEnabled
    public String debugFilter;
  }

  public class WorkOrderCard {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String woNumber;
    @AuraEnabled
    public String subject;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String priority;
    @AuraEnabled
    public String workTypeName;
    @AuraEnabled
    public String wagonNumber;
    @AuraEnabled
    public String assetName;
    @AuraEnabled
    public String flocDesc;
    @AuraEnabled
    public String sapWorkCenter;
    @AuraEnabled
    public String externalId;
    @AuraEnabled
    public Integer durationMinutes;
    @AuraEnabled
    public String schedStart;
    @AuraEnabled
    public String schedEnd;
    @AuraEnabled
    public String serviceAppointmentId;
  }

  public class WorkOrderFilter {
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String priority;
    @AuraEnabled
    public String wagonSearch;
    @AuraEnabled
    public String dateFrom; // ISO date string yyyy-MM-dd
    @AuraEnabled
    public String dateTo; // ISO date string yyyy-MM-dd
    @AuraEnabled
    public Boolean territoryWide; // true = all WOs scheduled in the kiosk territory
    @AuraEnabled
    public Integer pageSize;
    @AuraEnabled
    public Integer pageOffset;
  }

  public class WorkOrderDetail {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String woNumber;
    @AuraEnabled
    public String subject;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public String parentWorkOrderId;
    @AuraEnabled
    public String parentWoNumber;
    @AuraEnabled
    public String parentSubject;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String priority;
    @AuraEnabled
    public String workTypeName;
    @AuraEnabled
    public String wagonNumber;
    @AuraEnabled
    public String assetId;
    @AuraEnabled
    public String assetName;
    @AuraEnabled
    public String flocDesc;
    @AuraEnabled
    public String sapWorkCenter;
    @AuraEnabled
    public String externalId;
    @AuraEnabled
    public Integer durationMinutes;
    @AuraEnabled
    public String supervisorNotes;
    @AuraEnabled
    public String causeCodes;
    @AuraEnabled
    public String workDelayCodes;
    @AuraEnabled
    public String damageCodes;
    @AuraEnabled
    public List<WorkPlanDTO> workPlans;
    @AuraEnabled
    public List<LineItemDTO> lineItems;
    @AuraEnabled
    public List<WorkOrderCard> childWorkOrders;
    @AuraEnabled
    public TimeReportDTO activeTimeReport;
    @AuraEnabled
    public List<TimeReportDTO> timeReports;
  }

  public class LineItemDTO {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String subject;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public Decimal duration;
  }

  public class WorkPlanDTO {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Integer executionOrder;
    @AuraEnabled
    public String workOrderId; // WorkOrderId of the plan
    @AuraEnabled
    public String workOrderNumber; // WorkOrderNumber (display + WO filter)
    @AuraEnabled
    public List<WorkStepDTO> steps;
  }

  public class WorkStepDTO {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public Integer executionOrder;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public String actionType;
    @AuraEnabled
    public String actionDefinition;
  }

  public class TimeReportDTO {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String startTime;
    @AuraEnabled
    public String endTime;
    @AuraEnabled
    public Integer durationMinutes;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public Boolean isActive;
    @AuraEnabled
    public String resourceName;
  }

  public class TimeTrackingDashboard {
    @AuraEnabled
    public Integer totalRecords;
    @AuraEnabled
    public Integer totalMinutes;
    @AuraEnabled
    public Integer activeCount;
    @AuraEnabled
    public List<EmployeeSummary> byEmployee;
    @AuraEnabled
    public List<DayBucket> byDay;
    @AuraEnabled
    public List<TimeReportRow> rows;
  }

  public class EmployeeSummary {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Integer minutes;
    @AuraEnabled
    public Integer count;
  }

  public class DayBucket {
    @AuraEnabled
    public String dateLabel; // yyyy-MM-dd
    @AuraEnabled
    public List<EmployeeMinutes> employees;
  }

  public class EmployeeMinutes {
    @AuraEnabled
    public String name;
    @AuraEnabled
    public Integer minutes;
  }

  public class TimeReportRow {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String workOrderId;
    @AuraEnabled
    public String workOrderNumber;
    @AuraEnabled
    public String resourceName;
    @AuraEnabled
    public String startTime;
    @AuraEnabled
    public String endTime;
    @AuraEnabled
    public Integer durationMinutes;
    @AuraEnabled
    public Integer plannedMinutes;
    @AuraEnabled
    public Boolean isActive;
    @AuraEnabled
    public String validationFlag; // '', 'SHORT', 'LONG', 'VARIANCE'
    @AuraEnabled
    public String status; // New / Submitted / Approved / Rejected
    @AuraEnabled
    public String description; // Description__c
    @AuraEnabled
    public String violationReason; // human-readable text for the most-specific flag
  }

  public class TimeReportEditRequest {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String startTime; // ISO datetime
    @AuraEnabled
    public String endTime; // ISO datetime (may be blank = still active)
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String description;
  }

  public class SaveNotesRequest {
    @AuraEnabled
    public String workOrderId;
    @AuraEnabled
    public String supervisorNotes;
    @AuraEnabled
    public String causeCodes;
    @AuraEnabled
    public String workDelayCodes;
    @AuraEnabled
    public String damageCodes;
  }

  public class MeasurePointDTO {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String componentName;
    @AuraEnabled
    public String measureType; // Attention Required / Measure / OK / Scrap
    @AuraEnabled
    public String comments;
    @AuraEnabled
    public String reviewNotes;
    @AuraEnabled
    public Decimal measureValue;
    @AuraEnabled
    public String measureValueType; // Temperature / Pressure / Level / Width / Length / Depth
    @AuraEnabled
    public String createdDate;
    @AuraEnabled
    public String workOrderId; // Work_Order__c
    @AuraEnabled
    public String workOrderNumber; // Work_Order__r.WorkOrderNumber
    @AuraEnabled
    public String assetId; // Asset__c (wheelset)
    @AuraEnabled
    public String defectLocation; // Defect_Location__c
    @AuraEnabled
    public String updateDate; // Update_Date__c
    @AuraEnabled
    public String sourceDocumentId; // Source_Document__c (ContentDocument Id of the PDF)
    @AuraEnabled
    public String sourceDocumentTitle; // ContentDocument.Title
    @AuraEnabled
    public Integer pageNumber; // Page_Number__c
    @AuraEnabled
    public String pagePositionEstimate; // Page_Position_Estimate__c, e.g. 20%
    @AuraEnabled
    public String tableName; // Table_Name__c
  }

  // ─── Asset Review DTOs ─────────────────────────────────────────────────────

  public class WagonDTO {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String serialNumber;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String warrantyStatus;
    @AuraEnabled
    public String floc;
    @AuraEnabled
    public String assetType;
    @AuraEnabled
    public Boolean hasWagonNumber; // workpack WO has a non-blank Wagon_Number__c
    @AuraEnabled
    public List<WheelsetDTO> wheelsets;
  }

  public class WheelsetDTO {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String name;
    @AuraEnabled
    public String label; // L1 / L2 / L3 / L4 derived from Name
    @AuraEnabled
    public String serialNumber;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String warrantyStatus;
    @AuraEnabled
    public String installDate;
    @AuraEnabled
    public String purchaseDate;
    @AuraEnabled
    public String floc;
    @AuraEnabled
    public String iconStatus; // grey / green / red
    @AuraEnabled
    public String assetType; // Asset_Type__c (WINC / VALV / …)
    @AuraEnabled
    public Integer workOrderCount; // WOs in this workpack referencing this asset
    @AuraEnabled
    public List<WheelsetDTO> children; // level-3 sub-assets under this component
  }

  // Work plans + required parts for a single selected asset (loaded on demand).
  public class AssetReviewDetailDTO {
    @AuraEnabled
    public List<WorkPlanDTO> workPlans;
    @AuraEnabled
    public List<PartLineDTO> parts;
    @AuraEnabled
    public String consumeWorkOrderId; // WO that newly-added consumed parts attach to
  }

  // One combined line per product: required + consumed + unit cost, for the asset's WOs.
  public class PartLineDTO {
    @AuraEnabled
    public String productId;
    @AuraEnabled
    public String productName;
    @AuraEnabled
    public Decimal requiredQty;
    @AuraEnabled
    public Decimal consumedQty;
    @AuraEnabled
    public Decimal unitPrice;
    @AuraEnabled
    public String pricebookEntryId;
    @AuraEnabled
    public String workOrderId; // WO to consume against for this line
    @AuraEnabled
    public String unit;
  }

  // Product option for the "add a part" picker (standard active price book).
  public class ProductOptionDTO {
    @AuraEnabled
    public String productId;
    @AuraEnabled
    public String productName;
    @AuraEnabled
    public Decimal unitPrice;
    @AuraEnabled
    public String pricebookEntryId;
  }

  public class TaskWoDTO {
    @AuraEnabled
    public String id;
    @AuraEnabled
    public String woNumber;
    @AuraEnabled
    public String subject;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String priority;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public String causeCodes;
    @AuraEnabled
    public String workDelayCodes;
    @AuraEnabled
    public String startDate; // StartDate (datetime ISO)
    @AuraEnabled
    public String component; // SAP_FLOC_Desc__c
    @AuraEnabled
    public Decimal durationHours; // Duration (DurationType = Hours)
    @AuraEnabled
    public String comments; // Comment__c
    @AuraEnabled
    public String workTypeName; // WorkType.Name
    @AuraEnabled
    public String category; // repair | telematics | maintenance | other (from WorkTypeGroup)
  }

  public class CreateTaskRequest {
    @AuraEnabled
    public String id; // set when updating an existing task
    @AuraEnabled
    public String workOrderId; // workpack (parent) WO
    @AuraEnabled
    public String assetId; // selected wheelset asset
    @AuraEnabled
    public String subject;
    @AuraEnabled
    public String description;
    @AuraEnabled
    public String causeCodes;
    @AuraEnabled
    public String workDelayCodes;
    @AuraEnabled
    public String startDate; // ISO datetime
    @AuraEnabled
    public String component; // SAP_FLOC_Desc__c
    @AuraEnabled
    public Decimal durationHours;
    @AuraEnabled
    public String priority;
    @AuraEnabled
    public String status;
    @AuraEnabled
    public String comments; // Comment__c
    @AuraEnabled
    public String workTypeId; // optional override for raised tasks
    @AuraEnabled
    public Boolean raised; // true = Raised_Task__c
  }

  public class WorkOrderAttachment {
    @AuraEnabled
    public String contentDocumentId;
    @AuraEnabled
    public String title;
    @AuraEnabled
    public String fileExtension;
    @AuraEnabled
    public Long contentSize;
    // True when the file exceeds the base64 inline ceiling and can only be
    // opened view-only in a new tab (see getAttachmentContent).
    @AuraEnabled
    public Boolean tooLarge;
  }

  public class AttachmentContent {
    // Base64 data URI for files at or under the inline ceiling (null otherwise).
    @AuraEnabled
    public String dataUri;
    // True when the file is over the ceiling; the UI opens it view-only instead.
    @AuraEnabled
    public Boolean tooLarge;
    // ContentDocument Id the content belongs to (set by getMeasurePdf).
    @AuraEnabled
    public String documentId;
  }

  // Max file size we inline as a base64 data URI. Apex caps a single String at
  // 6,000,000 chars and base64 costs ~1.33x, so 4MB (~5.33M chars) stays safe.
  // Larger files can't be inlined and are opened view-only in a new browser tab.
  private static final Long ATTACHMENT_MAX_BYTES = 4000000;

  // ─── Supervisor context ───────────────────────────────────────────────────

  @AuraEnabled(cacheable=true)
  public static SupervisorContext getSupervisorContext() {
    // Guest users can never be supervisors — return cleanly so the LWC can show the login button
    if (UserInfo.getUserType() == 'Guest') {
      SupervisorContext guest = new SupervisorContext();
      guest.isSupervisor = false;
      guest.isGuest = true;
      guest.kioskNotes = '';
      guest.siteBaseUrl = Site.getBaseRequestUrl();
      return guest;
    }

    Id userId = UserInfo.getUserId();

    List<ServiceResource> resources = [
      SELECT Id, Name, RelatedRecordId
      FROM ServiceResource
      WHERE RelatedRecordId = :userId AND IsActive = TRUE
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];

    if (resources.isEmpty()) {
      SupervisorContext err = new SupervisorContext();
      err.isSupervisor = false;
      err.kioskNotes = 'No ServiceResource found for this user. Contact your administrator.';
      return err;
    }

    ServiceResource sr = resources[0];

    List<ServiceTerritoryMember> memberships = [
      SELECT ServiceTerritoryId, ServiceTerritory.Name, TerritoryType
      FROM ServiceTerritoryMember
      WHERE
        ServiceResourceId = :sr.Id
        AND (EffectiveEndDate = NULL
        OR EffectiveEndDate >= TODAY)
      WITH SECURITY_ENFORCED
      ORDER BY TerritoryType ASC
      LIMIT 5
    ];

    ServiceTerritoryMember primary;
    for (ServiceTerritoryMember m : memberships) {
      if (m.TerritoryType == 'P') {
        primary = m;
        break;
      }
    }
    if (primary == null && !memberships.isEmpty())
      primary = memberships[0];

    if (primary == null) {
      SupervisorContext err = new SupervisorContext();
      err.isSupervisor = false;
      err.kioskNotes = 'No ServiceTerritory assigned to this supervisor. Contact your administrator.';
      return err;
    }

    SupervisorContext ctx = new SupervisorContext();
    ctx.territoryId = primary.ServiceTerritoryId;
    ctx.territoryName = primary.ServiceTerritory.Name;
    ctx.kioskNotes = getKioskNotes(primary.ServiceTerritoryId);
    ctx.supervisorName = sr.Name;
    ctx.isSupervisor = true;
    ctx.siteBaseUrl = Site.getBaseRequestUrl();
    return ctx;
  }

  // ─── Worker roster ────────────────────────────────────────────────────────

  @AuraEnabled(cacheable=false)
  public static List<RosterMember> getTerritoryRoster(String territoryId) {
    if (String.isBlank(territoryId))
      throw new AuraHandledException('territoryId is required');

    List<ServiceTerritoryMember> members = [
      SELECT
        ServiceResourceId,
        ServiceResource.Name,
        ServiceResource.Role__c,
        ServiceResource.FSL__GanttLabel__c,
        ServiceResource.IsActive,
        ServiceResource.PIN_Locked_Until__c,
        ServiceResource.PIN_Failed_Count__c,
        ServiceResource.Employee_Id__c,
        ServiceResource.RelatedRecordId
      FROM ServiceTerritoryMember
      WHERE
        ServiceTerritoryId = :territoryId
        AND ServiceResource.IsActive = TRUE
        AND ServiceResource.ResourceType = 'T'
        AND (EffectiveEndDate = NULL
        OR EffectiveEndDate >= TODAY)
      WITH SECURITY_ENFORCED
      ORDER BY ServiceResource.Name ASC
      LIMIT 200
    ];

    // Resolve photo URLs from User records (RelatedRecordId)
    Set<Id> userIds = new Set<Id>();
    for (ServiceTerritoryMember m : members) {
      if (m.ServiceResource.RelatedRecordId != null)
        userIds.add(m.ServiceResource.RelatedRecordId);
    }
    Map<Id, String> userPhotoUrls = new Map<Id, String>();
    if (!userIds.isEmpty()) {
      for (User u : [
        SELECT Id, MediumPhotoUrl, SmallPhotoUrl
        FROM User
        WHERE Id IN :userIds
      ]) {
        String url = String.isNotBlank(u.MediumPhotoUrl)
          ? u.MediumPhotoUrl
          : u.SmallPhotoUrl;
        if (String.isNotBlank(url))
          userPhotoUrls.put(u.Id, url);
      }
    }

    List<RosterMember> roster = new List<RosterMember>();
    DateTime now = DateTime.now();

    for (ServiceTerritoryMember m : members) {
      ServiceResource sr = m.ServiceResource;
      RosterMember rm = new RosterMember();
      rm.resourceId = sr.Id;
      rm.name = sr.Name;
      rm.role = sr.Role__c;
      rm.ganttLabel = sr.FSL__GanttLabel__c;
      rm.employeeId = sr.Employee_Id__c;
      rm.photoUrl = sr.RelatedRecordId != null
        ? userPhotoUrls.get(sr.RelatedRecordId)
        : null;
      Boolean locked =
        sr.PIN_Locked_Until__c != null &&
        sr.PIN_Locked_Until__c > now;
      rm.isLocked = locked;
      rm.lockedUntilMs = locked ? sr.PIN_Locked_Until__c.getTime() : null;
      roster.add(rm);
    }
    return roster;
  }

  // ─── Employee validation ──────────────────────────────────────────────────

  @AuraEnabled
  public static EmployeeSession validateEmployee(
    String territoryId,
    String employeeId,
    String pin
  ) {
    if (
      String.isBlank(territoryId) ||
      String.isBlank(employeeId) ||
      String.isBlank(pin)
    ) {
      EmployeeSession fail = new EmployeeSession();
      fail.success = false;
      fail.errorCode = 'MISSING_FIELDS';
      return fail;
    }

    List<ServiceResource> matches = [
      SELECT
        Id,
        Name,
        PIN_Hash__c,
        PIN_Salt__c,
        PIN_Failed_Count__c,
        PIN_Locked_Until__c,
        Employee_Id__c,
        Role__c
      FROM ServiceResource
      WHERE Employee_Id__c = :employeeId AND IsActive = TRUE
      WITH SECURITY_ENFORCED
      LIMIT 2
    ];

    EmployeeSession result = new EmployeeSession();

    if (matches.isEmpty()) {
      result.success = false;
      result.errorCode = 'NOT_FOUND';
      return result;
    }
    if (matches.size() > 1) {
      result.success = false;
      result.errorCode = 'DUPLICATE_ID';
      return result;
    }

    ServiceResource sr = matches[0];
    DateTime now = DateTime.now();

    if (sr.PIN_Locked_Until__c != null && sr.PIN_Locked_Until__c > now) {
      result.success = false;
      result.errorCode = 'LOCKED';
      result.lockedUntilMs = sr.PIN_Locked_Until__c.getTime();
      return result;
    }

    Boolean pinValid = verifyPin(pin, sr.PIN_Salt__c, sr.PIN_Hash__c);

    if (!pinValid) {
      Integer failCount =
        (sr.PIN_Failed_Count__c == null
          ? 0
          : (Integer) sr.PIN_Failed_Count__c) + 1;
      sr.PIN_Failed_Count__c = failCount;
      if (failCount >= PIN_MAX_FAILURES) {
        sr.PIN_Locked_Until__c = now.addMinutes(PIN_LOCKOUT_MINUTES);
        result.lockedUntilMs = sr.PIN_Locked_Until__c.getTime();
        result.errorCode = 'LOCKED';
      } else {
        result.remainingAttempts = PIN_MAX_FAILURES - failCount;
        result.errorCode = 'WRONG_PIN';
      }
      update sr;
      result.success = false;
      return result;
    }

    sr.PIN_Failed_Count__c = 0;
    sr.PIN_Locked_Until__c = null;
    update sr;

    result.success = true;
    result.workerId = sr.Id;
    result.workerName = sr.Name;
    result.workerRole = sr.Role__c;
    result.crewName = resolveCrewName(sr.Id);
    result.token = issueToken(sr.Id, territoryId, now);
    return result;
  }

  /** Current crew name for a worker (active membership), or null if not in a crew. */
  private static String resolveCrewName(Id workerId) {
    List<ServiceCrewMember> members = [
      SELECT ServiceCrew.Name
      FROM ServiceCrewMember
      WHERE
        ServiceResourceId = :workerId
        AND (EndDate = NULL
        OR EndDate >= :DateTime.now())
      WITH SECURITY_ENFORCED
      ORDER BY EndDate NULLS FIRST
      LIMIT 1
    ];
    return members.isEmpty() ? null : members[0].ServiceCrew.Name;
  }

  // ─── Work orders (resource-scoped via SA assignments) ────────────────────

  @AuraEnabled(cacheable=false)
  public static WorkOrderPage getWorkOrders(String token, String filterJson) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    WorkOrderFilter filter = String.isBlank(filterJson)
      ? new WorkOrderFilter()
      : (WorkOrderFilter) JSON.deserialize(filterJson, WorkOrderFilter.class);

    System.debug(
      '>>> getWorkOrders filter: status=' +
        filter.status +
        ' priority=' +
        filter.priority +
        ' dateFrom=' +
        filter.dateFrom +
        ' dateTo=' +
        filter.dateTo +
        ' wagonSearch=' +
        filter.wagonSearch +
        ' pageSize=' +
        filter.pageSize +
        ' pageOffset=' +
        filter.pageOffset
    );

    // Default date range = today
    Date fromDate = filter.dateFrom != null
      ? Date.valueOf(filter.dateFrom)
      : Date.today();
    Date toDate = filter.dateTo != null
      ? Date.valueOf(filter.dateTo)
      : Date.today();
    // Extend toDate to end-of-day by using next day in datetime comparison
    DateTime fromDt = DateTime.newInstance(
      fromDate,
      Time.newInstance(0, 0, 0, 0)
    );
    DateTime toDt = DateTime.newInstance(
      toDate.addDays(1),
      Time.newInstance(0, 0, 0, 0)
    );

    String workerId = payload.workerId;

    Map<Id, ServiceAppointment> saMap;

    if (filter.territoryWide == true) {
      // Territory-wide: every WorkOrder ServiceAppointment scheduled in the
      // kiosk's territory within the date range, regardless of worker.
      saMap = new Map<Id, ServiceAppointment>(
        [
          SELECT
            Id,
            ParentRecordId,
            ParentRecordType,
            SchedStartTime,
            SchedEndTime
          FROM ServiceAppointment
          WHERE
            ServiceTerritoryId = :payload.territoryId
            AND ParentRecordType = 'WorkOrder'
            AND SchedStartTime >= :fromDt
            AND SchedStartTime < :toDt
          WITH USER_MODE
        ]
      );
    } else {
      // Collect candidate SA IDs from AssignedResource — no cross-object date filter here
      // to avoid SECURITY_ENFORCED stripping the filter when SA fields lack FLS.
      // Date range is applied on the ServiceAppointment query below.
      Set<Id> candidateSaIds = new Set<Id>();

      for (AssignedResource ar : [
        SELECT ServiceAppointmentId
        FROM AssignedResource
        WHERE ServiceResourceId = :workerId
        WITH USER_MODE
      ]) {
        candidateSaIds.add(ar.ServiceAppointmentId);
      }

      // Crew-based assignments
      List<ServiceCrewMember> crewMemberships = [
        SELECT ServiceCrewId
        FROM ServiceCrewMember
        WHERE
          ServiceResourceId = :workerId
          AND (EndDate = NULL
          OR EndDate >= :DateTime.now())
        WITH USER_MODE
      ];
      if (!crewMemberships.isEmpty()) {
        Set<Id> crewIds = new Set<Id>();
        for (ServiceCrewMember scm : crewMemberships)
          crewIds.add(scm.ServiceCrewId);
        for (AssignedResource ar : [
          SELECT ServiceAppointmentId
          FROM AssignedResource
          WHERE ServiceCrewId IN :crewIds
          WITH USER_MODE
        ]) {
          candidateSaIds.add(ar.ServiceAppointmentId);
        }
      }

      if (candidateSaIds.isEmpty()) {
        WorkOrderPage empty = new WorkOrderPage();
        empty.records = new List<WorkOrderCard>();
        empty.totalCount = 0;
        empty.hasMore = false;
        return empty;
      }

      // Apply date range filter here, on ServiceAppointment directly
      saMap = new Map<Id, ServiceAppointment>(
        [
          SELECT
            Id,
            ParentRecordId,
            ParentRecordType,
            SchedStartTime,
            SchedEndTime
          FROM ServiceAppointment
          WHERE
            Id IN :candidateSaIds
            AND ParentRecordType = 'WorkOrder'
            AND SchedStartTime >= :fromDt
            AND SchedStartTime < :toDt
          WITH USER_MODE
        ]
      );
    }

    Set<Id> woIds = new Set<Id>();
    for (ServiceAppointment sa : saMap.values()) {
      if (sa.ParentRecordId != null)
        woIds.add(sa.ParentRecordId);
    }

    if (woIds.isEmpty()) {
      WorkOrderPage empty = new WorkOrderPage();
      empty.records = new List<WorkOrderCard>();
      empty.totalCount = 0;
      empty.hasMore = false;
      return empty;
    }

    // Build dynamic filter on WOs
    String baseWhere = 'Id IN :woIds';
    Map<String, Object> binds = new Map<String, Object>{ 'woIds' => woIds };

    if (String.isNotBlank(filter.status) && filter.status != 'All') {
      baseWhere += ' AND Status = :status';
      binds.put('status', filter.status);
    }
    if (String.isNotBlank(filter.priority) && filter.priority != 'All') {
      baseWhere += ' AND Priority = :priority';
      binds.put('priority', filter.priority);
    }
    if (String.isNotBlank(filter.wagonSearch)) {
      baseWhere += ' AND Wagon_Number__c LIKE :wagonLike';
      binds.put('wagonLike', '%' + filter.wagonSearch + '%');
    }

    Integer pageSize = (filter.pageSize != null &&
      filter.pageSize > 0)
      ? Math.min(filter.pageSize, 50)
      : 50;
    Integer pageOffset = (filter.pageOffset != null &&
      filter.pageOffset >= 0)
      ? filter.pageOffset
      : 0;

    System.debug(
      '>>> baseWhere: ' + baseWhere + ' | binds keys: ' + binds.keySet()
    );

    Integer total = Database.countQueryWithBinds(
      'SELECT COUNT() FROM WorkOrder WHERE ' + baseWhere,
      binds,
      AccessLevel.SYSTEM_MODE
    );

    System.debug('>>> total count: ' + total);

    Map<String, Object> queryBinds = new Map<String, Object>(binds);
    queryBinds.put('pageSize', pageSize);
    queryBinds.put('pageOffset', pageOffset);

    List<WorkOrder> raw = Database.queryWithBinds(
      'SELECT Id, WorkOrderNumber, Subject, Status, Priority, WorkTypeId, WorkType.Name, ' +
        'Wagon_Number__c, Asset.Name, SAP_FLOC_Desc__c, SAP_Work_Center__c, External_ID__c, ' +
        'DurationInMinutes ' +
        'FROM WorkOrder WHERE ' +
        baseWhere +
        ' ORDER BY Priority ASC, CreatedDate DESC LIMIT :pageSize OFFSET :pageOffset',
      queryBinds,
      AccessLevel.SYSTEM_MODE
    );

    // Build SA lookup by WO ID for schedule times
    Map<Id, ServiceAppointment> saByWo = new Map<Id, ServiceAppointment>();
    for (ServiceAppointment sa : saMap.values()) {
      if (sa.ParentRecordId != null && !saByWo.containsKey(sa.ParentRecordId)) {
        saByWo.put(sa.ParentRecordId, sa);
      }
    }

    List<WorkOrderCard> cards = new List<WorkOrderCard>();
    for (WorkOrder wo : raw) {
      WorkOrderCard c = new WorkOrderCard();
      c.id = wo.Id;
      c.woNumber = wo.WorkOrderNumber;
      c.subject = wo.Subject;
      c.status = wo.Status;
      c.priority = wo.Priority;
      c.workTypeName = wo.WorkTypeId != null ? wo.WorkType.Name : null;
      c.wagonNumber = wo.Wagon_Number__c;
      c.assetName = wo.Asset != null ? wo.Asset.Name : null;
      c.flocDesc = wo.SAP_FLOC_Desc__c;
      c.sapWorkCenter = wo.SAP_Work_Center__c;
      c.externalId = wo.External_ID__c;
      c.durationMinutes = wo.DurationInMinutes != null
        ? (Integer) wo.DurationInMinutes
        : null;
      ServiceAppointment sa = saByWo.get(wo.Id);
      if (sa != null) {
        c.schedStart = sa.SchedStartTime != null
          ? String.valueOf(sa.SchedStartTime)
          : null;
        c.schedEnd = sa.SchedEndTime != null
          ? String.valueOf(sa.SchedEndTime)
          : null;
        c.serviceAppointmentId = sa.Id;
      }
      cards.add(c);
    }

    WorkOrderPage page = new WorkOrderPage();
    page.records = cards;
    page.totalCount = total;
    page.hasMore = (pageOffset + pageSize) < total;
    page.debugFilter = baseWhere;
    return page;
  }

  // ─── Extended workpack search (org-wide, ignores territory/status/resource) ──
  // Finds ALL Rail Workpack work orders whose Wagon_Number__c contains the
  // supplied text, regardless of who they're assigned to or their status.
  // Requires a search term of more than 3 characters.
  @AuraEnabled(cacheable=false)
  public static WorkOrderPage searchAllWorkpacks(
    String token,
    String wagonSearch
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    String term = wagonSearch == null ? '' : wagonSearch.trim();
    if (term.length() < 3) {
      throw new AuraHandledException('Enter at least 3 characters to search.');
    }

    Map<String, Object> binds = new Map<String, Object>{
      'wagonLike' => '%' +
      term +
      '%',
      'workpackType' => 'Rail Workpack'
    };

    Integer total = Database.countQueryWithBinds(
      'SELECT COUNT() FROM WorkOrder ' +
      'WHERE WorkType.Name = :workpackType AND Wagon_Number__c LIKE :wagonLike',
      binds,
      AccessLevel.SYSTEM_MODE
    );

    List<WorkOrder> raw = Database.queryWithBinds(
      'SELECT Id, WorkOrderNumber, Subject, Status, Priority, WorkTypeId, WorkType.Name, ' +
        'Wagon_Number__c, Asset.Name, SAP_FLOC_Desc__c, SAP_Work_Center__c, External_ID__c, ' +
        'DurationInMinutes ' +
        'FROM WorkOrder ' +
        'WHERE WorkType.Name = :workpackType AND Wagon_Number__c LIKE :wagonLike ' +
        'ORDER BY Wagon_Number__c ASC, CreatedDate DESC LIMIT 200',
      binds,
      AccessLevel.SYSTEM_MODE
    );

    List<WorkOrderCard> cards = new List<WorkOrderCard>();
    for (WorkOrder wo : raw) {
      WorkOrderCard c = new WorkOrderCard();
      c.id = wo.Id;
      c.woNumber = wo.WorkOrderNumber;
      c.subject = wo.Subject;
      c.status = wo.Status;
      c.priority = wo.Priority;
      c.workTypeName = wo.WorkTypeId != null ? wo.WorkType.Name : null;
      c.wagonNumber = wo.Wagon_Number__c;
      c.assetName = wo.Asset != null ? wo.Asset.Name : null;
      c.flocDesc = wo.SAP_FLOC_Desc__c;
      c.sapWorkCenter = wo.SAP_Work_Center__c;
      c.externalId = wo.External_ID__c;
      c.durationMinutes = wo.DurationInMinutes != null
        ? (Integer) wo.DurationInMinutes
        : null;
      cards.add(c);
    }

    WorkOrderPage page = new WorkOrderPage();
    page.records = cards;
    page.totalCount = total;
    page.hasMore = total > raw.size();
    return page;
  }

  // ─── Work order detail ────────────────────────────────────────────────────

  @AuraEnabled(cacheable=false)
  public static WorkOrderDetail getWorkOrderDetail(
    String token,
    String workOrderId
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    List<WorkOrder> wos = [
      SELECT
        Id,
        WorkOrderNumber,
        Subject,
        Description,
        Status,
        Priority,
        WorkTypeId,
        WorkType.Name,
        Wagon_Number__c,
        Asset.Name,
        SAP_FLOC_Desc__c,
        SAP_Work_Center__c,
        External_ID__c,
        DurationInMinutes,
        Supervisor_Notes__c,
        Cause_Codes__c,
        Work_Delay_Codes__c,
        Damage_Codes__c,
        ParentWorkOrderId,
        ParentWorkOrder.WorkOrderNumber,
        ParentWorkOrder.Subject
      FROM WorkOrder
      WHERE Id = :workOrderId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (wos.isEmpty())
      throw new AuraHandledException('WORK_ORDER_NOT_FOUND');

    WorkOrder wo = wos[0];
    WorkOrderDetail detail = new WorkOrderDetail();
    detail.id = wo.Id;
    detail.woNumber = wo.WorkOrderNumber;
    detail.subject = wo.Subject;
    detail.description = wo.Description;
    detail.status = wo.Status;
    detail.priority = wo.Priority;
    detail.workTypeName = wo.WorkTypeId != null ? wo.WorkType.Name : null;
    detail.wagonNumber = wo.Wagon_Number__c;
    detail.assetId = wo.AssetId;
    detail.assetName = wo.Asset != null ? wo.Asset.Name : null;
    detail.flocDesc = wo.SAP_FLOC_Desc__c;
    detail.sapWorkCenter = wo.SAP_Work_Center__c;
    detail.externalId = wo.External_ID__c;
    detail.durationMinutes = wo.DurationInMinutes != null
      ? (Integer) wo.DurationInMinutes
      : null;
    detail.supervisorNotes = wo.Supervisor_Notes__c;
    detail.causeCodes = wo.Cause_Codes__c;
    detail.workDelayCodes = wo.Work_Delay_Codes__c;
    detail.damageCodes = wo.Damage_Codes__c;
    detail.parentWorkOrderId = wo.ParentWorkOrderId;
    detail.parentWoNumber = wo.ParentWorkOrderId != null
      ? wo.ParentWorkOrder.WorkOrderNumber
      : null;
    detail.parentSubject = wo.ParentWorkOrderId != null
      ? wo.ParentWorkOrder.Subject
      : null;

    // Line items (operations)
    List<LineItemDTO> lineItems = new List<LineItemDTO>();
    for (WorkOrderLineItem woli : [
      SELECT Id, Subject, Description, Duration
      FROM WorkOrderLineItem
      WHERE WorkOrderId = :workOrderId
      WITH SECURITY_ENFORCED
      ORDER BY CreatedDate ASC
    ]) {
      LineItemDTO li = new LineItemDTO();
      li.id = woli.Id;
      li.subject = woli.Subject;
      li.description = woli.Description;
      li.duration = woli.Duration;
      lineItems.add(li);
    }
    detail.lineItems = lineItems;

    // Child work orders (for Rail Workpack)
    List<WorkOrderCard> childWos = new List<WorkOrderCard>();
    for (WorkOrder child : [
      SELECT
        Id,
        WorkOrderNumber,
        Subject,
        Status,
        Priority,
        WorkTypeId,
        WorkType.Name,
        Wagon_Number__c,
        Asset.Name,
        SAP_FLOC_Desc__c,
        SAP_Work_Center__c,
        External_ID__c,
        DurationInMinutes
      FROM WorkOrder
      WHERE ParentWorkOrderId = :workOrderId OR RootWorkOrderId = :workOrderId
      WITH SECURITY_ENFORCED
      ORDER BY CreatedDate ASC
    ]) {
      WorkOrderCard card = new WorkOrderCard();
      card.id = child.Id;
      card.woNumber = child.WorkOrderNumber;
      card.subject = child.Subject;
      card.status = child.Status;
      card.priority = child.Priority;
      card.workTypeName = child.WorkTypeId != null ? child.WorkType.Name : null;
      card.wagonNumber = child.Wagon_Number__c;
      card.assetName = child.Asset != null ? child.Asset.Name : null;
      card.flocDesc = child.SAP_FLOC_Desc__c;
      card.sapWorkCenter = child.SAP_Work_Center__c;
      card.externalId = child.External_ID__c;
      card.durationMinutes = child.DurationInMinutes != null
        ? (Integer) child.DurationInMinutes
        : null;
      childWos.add(card);
    }
    if (!childWos.isEmpty()) {
      Map<Id, WorkOrderCard> childById = new Map<Id, WorkOrderCard>();
      for (WorkOrderCard c : childWos)
        childById.put(c.id, c);
      for (ServiceAppointment sa : [
        SELECT Id, ParentRecordId, SchedStartTime, SchedEndTime
        FROM ServiceAppointment
        WHERE ParentRecordId IN :childById.keySet()
        WITH SECURITY_ENFORCED
        ORDER BY SchedStartTime ASC NULLS LAST
      ]) {
        WorkOrderCard c = childById.get(sa.ParentRecordId);
        if (c == null || c.serviceAppointmentId != null)
          continue;
        c.schedStart = sa.SchedStartTime != null
          ? String.valueOf(sa.SchedStartTime)
          : null;
        c.schedEnd = sa.SchedEndTime != null
          ? String.valueOf(sa.SchedEndTime)
          : null;
        c.serviceAppointmentId = sa.Id;
      }
    }
    detail.childWorkOrders = childWos;

    // Work plans + steps
    List<WorkPlanDTO> plans = new List<WorkPlanDTO>();
    Map<Id, WorkPlanDTO> planMap = new Map<Id, WorkPlanDTO>();
    for (WorkPlan wp : [
      SELECT Id, Name, ExecutionOrder
      FROM WorkPlan
      WHERE WorkOrderId = :workOrderId
      WITH SECURITY_ENFORCED
      ORDER BY ExecutionOrder ASC
    ]) {
      WorkPlanDTO dto = new WorkPlanDTO();
      dto.id = wp.Id;
      dto.name = wp.Name;
      dto.executionOrder = wp.ExecutionOrder;
      dto.steps = new List<WorkStepDTO>();
      plans.add(dto);
      planMap.put(wp.Id, dto);
    }
    for (WorkStep ws : [
      SELECT
        Id,
        Name,
        Status,
        ExecutionOrder,
        Description,
        WorkPlanId,
        ActionType,
        ActionDefinition
      FROM WorkStep
      WHERE WorkOrderId = :workOrderId
      WITH SECURITY_ENFORCED
      ORDER BY WorkPlanExecutionOrder ASC, ExecutionOrder ASC
    ]) {
      WorkStepDTO sdto = new WorkStepDTO();
      sdto.id = ws.Id;
      sdto.name = ws.Name;
      sdto.status = ws.Status;
      sdto.executionOrder = ws.ExecutionOrder;
      sdto.description = ws.Description;
      sdto.actionType = ws.ActionType;
      sdto.actionDefinition = ws.ActionDefinition;
      if (planMap.containsKey(ws.WorkPlanId))
        planMap.get(ws.WorkPlanId).steps.add(sdto);
    }
    detail.workPlans = plans;

    // Time reports for this worker + work order
    String workerName = getWorkerName(payload.workerId);
    List<Time_Report__c> reports = [
      SELECT
        Id,
        Name,
        Start_Time__c,
        End_Time__c,
        Duration_in_Minutes__c,
        Description__c,
        Resource_Name__c
      FROM Time_Report__c
      WHERE Work_Order__c = :workOrderId AND Resource_Name__c = :workerName
      WITH SECURITY_ENFORCED
      ORDER BY Start_Time__c DESC
    ];

    List<TimeReportDTO> timeReports = new List<TimeReportDTO>();
    TimeReportDTO activeReport = null;
    for (Time_Report__c tr : reports) {
      TimeReportDTO dto = new TimeReportDTO();
      dto.id = tr.Id;
      dto.startTime = String.valueOf(tr.Start_Time__c);
      dto.endTime = tr.End_Time__c != null
        ? String.valueOf(tr.End_Time__c)
        : null;
      dto.durationMinutes = tr.Duration_in_Minutes__c != null
        ? (Integer) tr.Duration_in_Minutes__c
        : null;
      dto.description = tr.Description__c;
      dto.resourceName = tr.Resource_Name__c;
      dto.isActive = (tr.End_Time__c == null);
      timeReports.add(dto);
      if (dto.isActive && activeReport == null)
        activeReport = dto;
    }
    detail.timeReports = timeReports;
    detail.activeTimeReport = activeReport;

    return detail;
  }

  // ─── Update work step status ──────────────────────────────────────────────

  @AuraEnabled
  public static void updateWorkStepStatus(
    String token,
    String workStepId,
    String status
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    if (String.isBlank(workStepId))
      throw new AuraHandledException('WORK_STEP_NOT_FOUND');
    // WorkStep is ControlledByParent(WorkPlan, Private OWD) — the kiosk site user has
    // no share on the step, so a user-mode read returns 0 rows and a user-mode update
    // throws INSUFFICIENT_ACCESS. Read + write in SYSTEM_MODE (same as markWorkStepCompleted);
    // access is already gated by the validated session token.
    List<WorkStep> steps = (List<WorkStep>) Database.query(
      'SELECT Id, Status FROM WorkStep WHERE Id = :workStepId LIMIT 1',
      AccessLevel.SYSTEM_MODE
    );
    if (steps.isEmpty())
      throw new AuraHandledException('WORK_STEP_NOT_FOUND');
    steps[0].Status = status;
    Database.update(steps[0], AccessLevel.SYSTEM_MODE);
  }

  // Mark a single work step Completed and move its work order to In Progress.
  // WorkStep is ControlledByParent(WorkPlan, Private OWD) — the kiosk member has no
  // edit-share on the step, so read + write it in SYSTEM_MODE (same visibility fix as
  // the Work Plans panel). The WorkOrder itself is member-editable (OWD ReadWrite).
  @AuraEnabled
  public static void markWorkStepCompleted(String token, String workStepId) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    if (String.isBlank(workStepId))
      throw new AuraHandledException('WORK_STEP_NOT_FOUND');

    List<WorkStep> steps = (List<WorkStep>) Database.query(
      'SELECT Id, Status, WorkOrderId FROM WorkStep WHERE Id = :workStepId LIMIT 1',
      AccessLevel.SYSTEM_MODE
    );
    if (steps.isEmpty())
      throw new AuraHandledException('WORK_STEP_NOT_FOUND');

    WorkStep ws = steps[0];
    ws.Status = 'Completed';
    Database.update(ws, AccessLevel.SYSTEM_MODE);

    if (ws.WorkOrderId != null) {
      List<WorkOrder> wos = [
        SELECT Id, Status
        FROM WorkOrder
        WHERE Id = :ws.WorkOrderId
        WITH SECURITY_ENFORCED
        LIMIT 1
      ];
      if (!wos.isEmpty() && wos[0].Status != 'In Progress') {
        wos[0].Status = 'In Progress';
        update wos[0];
      }
    }
  }

  // ─── Clock in ─────────────────────────────────────────────────────────────

  @AuraEnabled
  public static TimeReportDTO clockIn(String token, String workOrderId) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    String workerName = getWorkerName(payload.workerId);

    // Check no open entry already exists
    List<Time_Report__c> open = [
      SELECT Id
      FROM Time_Report__c
      WHERE
        Work_Order__c = :workOrderId
        AND Resource_Name__c = :workerName
        AND End_Time__c = NULL
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (!open.isEmpty())
      throw new AuraHandledException('ALREADY_CLOCKED_IN');

    Time_Report__c tr = new Time_Report__c(
      Work_Order__c = workOrderId,
      Resource_Name__c = workerName,
      Start_Time__c = DateTime.now(),
      Related_To__c = workOrderId
    );
    insert tr;

    TimeReportDTO dto = new TimeReportDTO();
    dto.id = tr.Id;
    dto.startTime = String.valueOf(tr.Start_Time__c);
    dto.endTime = null;
    dto.isActive = true;
    return dto;
  }

  // ─── Clock out ────────────────────────────────────────────────────────────

  @AuraEnabled
  public static TimeReportDTO clockOut(String token, String timeReportId) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    List<Time_Report__c> reports = [
      SELECT Id, Start_Time__c, End_Time__c, Resource_Name__c
      FROM Time_Report__c
      WHERE Id = :timeReportId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (reports.isEmpty())
      throw new AuraHandledException('TIME_REPORT_NOT_FOUND');

    Time_Report__c tr = reports[0];
    if (tr.End_Time__c != null)
      throw new AuraHandledException('ALREADY_CLOCKED_OUT');

    DateTime endNow = DateTime.now();
    Long diffMs = endNow.getTime() - tr.Start_Time__c.getTime();
    Integer mins = (Integer) (diffMs / 60000);

    tr.End_Time__c = endNow;
    update tr;

    TimeReportDTO dto = new TimeReportDTO();
    dto.id = tr.Id;
    dto.startTime = String.valueOf(tr.Start_Time__c);
    dto.endTime = String.valueOf(tr.End_Time__c);
    dto.durationMinutes = mins;
    dto.isActive = false;
    return dto;
  }

  // ─── Auto clock (workpack-level, activity-driven) ──────────────────────────
  // A worker who makes any data change on a workpack is clocked in automatically
  // at the workpack ROOT WorkOrder; auto-clocked-out on idle logout / switch /
  // end shift / switching workpacks. See ensureClockedIn / autoClockOut / getActiveClock.

  public class ClockDTO {
    @AuraEnabled
    public String timeReportId;
    @AuraEnabled
    public String workOrderId; // workpack root
    @AuraEnabled
    public Long startTimeMs; // Start_Time__c epoch ms (client timer base)
  }

  // Ensure the worker has an open time report on the workpack root. Idempotent:
  // returns the existing open report if one exists, else creates one.
  @AuraEnabled
  public static ClockDTO ensureClockedIn(String token, String workOrderId) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    if (String.isBlank(workOrderId))
      throw new AuraHandledException('MISSING_INPUT');

    String workerName = getWorkerName(payload.workerId);

    // Resolve the workpack root for the opened WO.
    Id rootWoId = (Id) workOrderId;
    List<WorkOrder> wos = [
      SELECT RootWorkOrderId
      FROM WorkOrder
      WHERE Id = :workOrderId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (!wos.isEmpty() && wos[0].RootWorkOrderId != null)
      rootWoId = wos[0].RootWorkOrderId;

    // Existing open report wins (one clock per worker).
    List<Time_Report__c> open = [
      SELECT Id, Start_Time__c, Work_Order__c
      FROM Time_Report__c
      WHERE Resource_Name__c = :workerName AND End_Time__c = NULL
      WITH SECURITY_ENFORCED
      ORDER BY Start_Time__c DESC
      LIMIT 1
    ];
    if (!open.isEmpty())
      return toClockDTO(open[0]);

    Time_Report__c tr = new Time_Report__c(
      Work_Order__c = rootWoId,
      Resource_Name__c = workerName,
      Start_Time__c = DateTime.now(),
      Related_To__c = rootWoId,
      Status__c = 'New'
    );
    insert tr;
    return toClockDTO(tr);
  }

  // Close every open report for the worker (set End_Time__c). Duration is a formula.
  @AuraEnabled
  public static void autoClockOut(String token) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    String workerName = getWorkerName(payload.workerId);
    List<Time_Report__c> open = [
      SELECT Id, End_Time__c
      FROM Time_Report__c
      WHERE Resource_Name__c = :workerName AND End_Time__c = NULL
      WITH SECURITY_ENFORCED
    ];
    if (open.isEmpty())
      return;
    DateTime endNow = DateTime.now();
    for (Time_Report__c tr : open)
      tr.End_Time__c = endNow;
    update open;
  }

  // Current open report for the worker (reflects manual and auto clock-in), or null.
  @AuraEnabled
  public static ClockDTO getActiveClock(String token) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    String workerName = getWorkerName(payload.workerId);
    List<Time_Report__c> open = [
      SELECT Id, Start_Time__c, Work_Order__c
      FROM Time_Report__c
      WHERE Resource_Name__c = :workerName AND End_Time__c = NULL
      WITH SECURITY_ENFORCED
      ORDER BY Start_Time__c DESC
      LIMIT 1
    ];
    return open.isEmpty() ? null : toClockDTO(open[0]);
  }

  private static ClockDTO toClockDTO(Time_Report__c tr) {
    ClockDTO c = new ClockDTO();
    c.timeReportId = tr.Id;
    c.workOrderId = String.valueOf(tr.Work_Order__c);
    c.startTimeMs = (tr.Start_Time__c != null)
      ? tr.Start_Time__c.getTime()
      : null;
    return c;
  }

  // ─── Save notes + codes ───────────────────────────────────────────────────

  @AuraEnabled
  public static void saveWorkOrderNotes(String token, String reqJson) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    SaveNotesRequest req = (SaveNotesRequest) JSON.deserialize(
      reqJson,
      SaveNotesRequest.class
    );

    WorkOrder wo = new WorkOrder(Id = req.workOrderId);
    wo.Supervisor_Notes__c = req.supervisorNotes;
    wo.Cause_Codes__c = req.causeCodes;
    wo.Work_Delay_Codes__c = req.workDelayCodes;
    wo.Damage_Codes__c = req.damageCodes;
    update wo;
  }

  // ─── Time tracking dashboard ──────────────────────────────────────────────

  @AuraEnabled(cacheable=false)
  public static TimeTrackingDashboard getTimeReportDashboard(String token) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    // Last 30 days
    DateTime fromDt = DateTime.now().addDays(-30);

    List<Time_Report__c> reports = [
      SELECT
        Id,
        Work_Order__c,
        Work_Order__r.WorkOrderNumber,
        Work_Order__r.DurationInMinutes,
        Resource_Name__c,
        Start_Time__c,
        End_Time__c,
        Duration_in_Minutes__c,
        Status__c,
        Description__c
      FROM Time_Report__c
      WHERE Start_Time__c >= :fromDt
      WITH SECURITY_ENFORCED
      ORDER BY Start_Time__c DESC
      LIMIT 2000
    ];

    TimeTrackingDashboard dash = new TimeTrackingDashboard();
    dash.totalRecords = reports.size();
    dash.totalMinutes = 0;
    dash.activeCount = 0;

    // Aggregations
    Map<String, Integer> empMinutes = new Map<String, Integer>();
    Map<String, Integer> empCount = new Map<String, Integer>();
    // dayKey -> empName -> minutes
    Map<String, Map<String, Integer>> dayEmpMap = new Map<String, Map<String, Integer>>();

    List<TimeReportRow> rows = new List<TimeReportRow>();

    for (Time_Report__c tr : reports) {
      Boolean active = (tr.End_Time__c == null);
      if (active)
        dash.activeCount++;

      // Calculated minutes (formula field) or compute from timestamps
      Integer mins = null;
      if (tr.Duration_in_Minutes__c != null) {
        mins = (Integer) tr.Duration_in_Minutes__c;
      } else if (
        !active &&
        tr.Start_Time__c != null &&
        tr.End_Time__c != null
      ) {
        mins = (Integer) ((tr.End_Time__c.getTime() -
        tr.Start_Time__c.getTime()) / 60000);
      }

      if (mins != null)
        dash.totalMinutes += mins;

      String empName = String.isBlank(tr.Resource_Name__c)
        ? 'Unknown'
        : tr.Resource_Name__c;

      // Per-employee totals
      empMinutes.put(
        empName,
        (empMinutes.containsKey(empName) ? empMinutes.get(empName) : 0) +
        (mins != null ? mins : 0)
      );
      empCount.put(
        empName,
        (empCount.containsKey(empName) ? empCount.get(empName) : 0) + 1
      );

      // Per-day buckets
      if (tr.Start_Time__c != null && mins != null) {
        String dayKey = String.valueOf(tr.Start_Time__c.dateGmt());
        if (!dayEmpMap.containsKey(dayKey))
          dayEmpMap.put(dayKey, new Map<String, Integer>());
        Map<String, Integer> dayMap = dayEmpMap.get(dayKey);
        dayMap.put(
          empName,
          (dayMap.containsKey(empName) ? dayMap.get(empName) : 0) + mins
        );
      }

      // Validation flag
      Integer plannedMins = tr.Work_Order__c != null &&
        tr.Work_Order__r.DurationInMinutes != null
        ? (Integer) tr.Work_Order__r.DurationInMinutes
        : null;
      String flag = '';
      if (!active && mins != null) {
        if (mins < 10)
          flag = 'SHORT';
        else if (mins > 360)
          flag = 'LONG';
        else if (plannedMins != null && plannedMins > 0) {
          Decimal variance = Math.abs(mins - plannedMins) * 100.0 / plannedMins;
          if (variance > 50)
            flag = 'VARIANCE';
        }
      }

      TimeReportRow row = new TimeReportRow();
      row.id = tr.Id;
      row.workOrderId = tr.Work_Order__c;
      row.workOrderNumber = tr.Work_Order__c != null
        ? tr.Work_Order__r.WorkOrderNumber
        : null;
      row.resourceName = empName;
      row.startTime = String.valueOf(tr.Start_Time__c);
      row.endTime = tr.End_Time__c != null
        ? String.valueOf(tr.End_Time__c)
        : null;
      row.durationMinutes = mins;
      row.plannedMinutes = plannedMins;
      row.isActive = active;
      row.validationFlag = flag;
      row.status = String.isBlank(tr.Status__c) ? 'New' : tr.Status__c;
      row.description = tr.Description__c;
      row.violationReason = violationReasonText(flag, active);
      rows.add(row);
    }

    // Build byEmployee list
    List<EmployeeSummary> byEmp = new List<EmployeeSummary>();
    for (String name : empMinutes.keySet()) {
      EmployeeSummary es = new EmployeeSummary();
      es.name = name;
      es.minutes = empMinutes.get(name);
      es.count = empCount.get(name);
      byEmp.add(es);
    }
    // Sort by minutes descending
    for (Integer i = 0; i < byEmp.size() - 1; i++) {
      for (Integer j = i + 1; j < byEmp.size(); j++) {
        if (byEmp[j].minutes > byEmp[i].minutes) {
          EmployeeSummary tmp = byEmp[i];
          byEmp[i] = byEmp[j];
          byEmp[j] = tmp;
        }
      }
    }
    dash.byEmployee = byEmp;

    // Build byDay list (sorted)
    List<String> dayKeys = new List<String>(dayEmpMap.keySet());
    dayKeys.sort();
    List<DayBucket> byDay = new List<DayBucket>();
    // Collect all employee names for consistent ordering
    List<String> allEmps = new List<String>(empMinutes.keySet());
    allEmps.sort();
    for (String dayKey : dayKeys) {
      DayBucket bucket = new DayBucket();
      bucket.dateLabel = dayKey;
      bucket.employees = new List<EmployeeMinutes>();
      Map<String, Integer> dayMap = dayEmpMap.get(dayKey);
      for (String emp : allEmps) {
        EmployeeMinutes em = new EmployeeMinutes();
        em.name = emp;
        em.minutes = dayMap.containsKey(emp) ? dayMap.get(emp) : 0;
        bucket.employees.add(em);
      }
      byDay.add(bucket);
    }
    dash.byDay = byDay;
    dash.rows = rows;
    return dash;
  }

  // Human-readable text for the single most-specific validation issue on a time report.
  // Priority high→low: SHORT, LONG, VARIANCE, ACTIVE, none.
  private static String violationReasonText(String flag, Boolean active) {
    if (flag == 'SHORT')
      return 'Duration is under 10 minutes.';
    if (flag == 'LONG')
      return 'Duration exceeds 6 hours.';
    if (flag == 'VARIANCE')
      return 'Actual duration varies more than 50% from the planned duration.';
    if (active)
      return 'Time entry was never clocked out.';
    return '';
  }

  // Recompute the most-specific validation flag for a single report (mirrors dashboard logic).
  private static String computeFlag(Time_Report__c tr) {
    Boolean active = (tr.End_Time__c == null);
    if (active)
      return '';
    Integer mins = null;
    if (tr.Duration_in_Minutes__c != null) {
      mins = (Integer) tr.Duration_in_Minutes__c;
    } else if (tr.Start_Time__c != null && tr.End_Time__c != null) {
      mins = (Integer) ((tr.End_Time__c.getTime() -
      tr.Start_Time__c.getTime()) / 60000);
    }
    if (mins == null)
      return '';
    if (mins < 10)
      return 'SHORT';
    if (mins > 360)
      return 'LONG';
    Integer planned = tr.Work_Order__c != null &&
      tr.Work_Order__r.DurationInMinutes != null
      ? (Integer) tr.Work_Order__r.DurationInMinutes
      : null;
    if (
      planned != null &&
      planned > 0 &&
      Math.abs(mins - planned) * 100.0 / planned > 50
    )
      return 'VARIANCE';
    return '';
  }

  // Default rejection description for a report = text of its most-specific rule violation.
  @AuraEnabled(cacheable=false)
  public static String getRejectionDefault(String token, String timeReportId) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    List<Time_Report__c> rs = [
      SELECT
        Id,
        Start_Time__c,
        End_Time__c,
        Duration_in_Minutes__c,
        Work_Order__c,
        Work_Order__r.DurationInMinutes
      FROM Time_Report__c
      WHERE Id = :timeReportId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (rs.isEmpty())
      return '';
    Time_Report__c tr = rs[0];
    return violationReasonText(computeFlag(tr), tr.End_Time__c == null);
  }

  @AuraEnabled
  public static TimeReportRow updateTimeReport(String token, String reqJson) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    TimeReportEditRequest req = (TimeReportEditRequest) JSON.deserialize(
      reqJson,
      TimeReportEditRequest.class
    );
    if (String.isBlank(req.id))
      throw new AuraHandledException('MISSING_ID');

    List<Time_Report__c> existing = [
      SELECT Id
      FROM Time_Report__c
      WHERE Id = :req.id
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (existing.isEmpty())
      throw new AuraHandledException('NOT_FOUND');

    // Rejected status requires a description (the rule-violation text by default).
    if (req.status == 'Rejected' && String.isBlank(req.description)) {
      throw new AuraHandledException('REJECT_NEEDS_DESCRIPTION');
    }

    Time_Report__c tr = existing[0];
    if (String.isNotBlank(req.startTime)) {
      tr.Start_Time__c = (DateTime) JSON.deserialize(
        '"' + req.startTime + '"',
        DateTime.class
      );
    }
    // Blank end time clears it (back to active); non-blank sets it.
    tr.End_Time__c = String.isBlank(req.endTime)
      ? null
      : (DateTime) JSON.deserialize('"' + req.endTime + '"', DateTime.class);
    if (String.isNotBlank(req.status))
      tr.Status__c = req.status;
    tr.Description__c = req.description;
    update tr;

    return reloadTimeReportRow(req.id);
  }

  @AuraEnabled
  public static List<TimeReportRow> bulkUpdateTimeReportStatus(
    String token,
    List<String> ids,
    String status,
    String description
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    if (ids == null || ids.isEmpty())
      throw new AuraHandledException('NO_RECORDS');
    if (String.isBlank(status))
      throw new AuraHandledException('NO_STATUS');

    List<Time_Report__c> toUpdate = [
      SELECT
        Id,
        Status__c,
        Description__c,
        Start_Time__c,
        End_Time__c,
        Duration_in_Minutes__c,
        Work_Order__c,
        Work_Order__r.DurationInMinutes
      FROM Time_Report__c
      WHERE Id IN :ids
      WITH SECURITY_ENFORCED
    ];
    for (Time_Report__c tr : toUpdate) {
      tr.Status__c = status;
      if (status == 'Rejected') {
        // Per-record default: use the explicit description if supplied, else the rule-violation text.
        String reason = String.isNotBlank(description)
          ? description
          : violationReasonText(computeFlag(tr), tr.End_Time__c == null);
        tr.Description__c = reason;
      }
    }
    update toUpdate;

    Set<Id> idSet = new Set<Id>();
    for (Time_Report__c tr : toUpdate)
      idSet.add(tr.Id);
    return reloadTimeReportRows(idSet);
  }

  private static TimeReportRow reloadTimeReportRow(Id id) {
    List<TimeReportRow> rows = reloadTimeReportRows(new Set<Id>{ id });
    return rows.isEmpty() ? null : rows[0];
  }

  private static List<TimeReportRow> reloadTimeReportRows(Set<Id> ids) {
    List<TimeReportRow> result = new List<TimeReportRow>();
    for (Time_Report__c tr : [
      SELECT
        Id,
        Work_Order__c,
        Work_Order__r.WorkOrderNumber,
        Work_Order__r.DurationInMinutes,
        Resource_Name__c,
        Start_Time__c,
        End_Time__c,
        Duration_in_Minutes__c,
        Status__c,
        Description__c
      FROM Time_Report__c
      WHERE Id IN :ids
      WITH SECURITY_ENFORCED
    ]) {
      Boolean active = (tr.End_Time__c == null);
      Integer mins = null;
      if (tr.Duration_in_Minutes__c != null) {
        mins = (Integer) tr.Duration_in_Minutes__c;
      } else if (
        !active &&
        tr.Start_Time__c != null &&
        tr.End_Time__c != null
      ) {
        mins = (Integer) ((tr.End_Time__c.getTime() -
        tr.Start_Time__c.getTime()) / 60000);
      }
      Integer planned = tr.Work_Order__c != null &&
        tr.Work_Order__r.DurationInMinutes != null
        ? (Integer) tr.Work_Order__r.DurationInMinutes
        : null;
      String flag = computeFlag(tr);

      TimeReportRow row = new TimeReportRow();
      row.id = tr.Id;
      row.workOrderId = tr.Work_Order__c;
      row.workOrderNumber = tr.Work_Order__c != null
        ? tr.Work_Order__r.WorkOrderNumber
        : null;
      row.resourceName = String.isBlank(tr.Resource_Name__c)
        ? 'Unknown'
        : tr.Resource_Name__c;
      row.startTime = String.valueOf(tr.Start_Time__c);
      row.endTime = tr.End_Time__c != null
        ? String.valueOf(tr.End_Time__c)
        : null;
      row.durationMinutes = mins;
      row.plannedMinutes = planned;
      row.isActive = active;
      row.validationFlag = flag;
      row.status = String.isBlank(tr.Status__c) ? 'New' : tr.Status__c;
      row.description = tr.Description__c;
      row.violationReason = violationReasonText(flag, active);
      result.add(row);
    }
    return result;
  }

  // ─── Dashboard metrics ────────────────────────────────────────────────────

  @AuraEnabled(cacheable=false)
  public static DashboardMetrics getDashboardMetrics(
    String token,
    String dateFrom,
    String dateTo
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    Date fromDate = String.isBlank(dateFrom)
      ? Date.today()
      : Date.valueOf(dateFrom);
    Date toDate = String.isBlank(dateTo) ? Date.today() : Date.valueOf(dateTo);
    DateTime fromDt = DateTime.newInstance(
      fromDate,
      Time.newInstance(0, 0, 0, 0)
    );
    DateTime toDt = DateTime.newInstance(
      toDate.addDays(1),
      Time.newInstance(0, 0, 0, 0)
    );

    // Find SAs in the territory within the date window
    List<ServiceAppointment> sas = [
      SELECT Id, ParentRecordId, SchedStartTime
      FROM ServiceAppointment
      WHERE
        ServiceTerritoryId = :payload.territoryId
        AND ParentRecordType = 'WorkOrder'
        AND SchedStartTime >= :fromDt
        AND SchedStartTime < :toDt
      WITH SECURITY_ENFORCED
      LIMIT 1000
    ];

    Set<Id> woIds = new Set<Id>();
    // Bucket distinct work orders per scheduled day (count each WO once per day).
    Map<Date, Set<Id>> woIdsByDay = new Map<Date, Set<Id>>();
    for (ServiceAppointment sa : sas) {
      if (sa.ParentRecordId == null)
        continue;
      woIds.add(sa.ParentRecordId);
      if (sa.SchedStartTime != null) {
        Date d = sa.SchedStartTime.date();
        if (!woIdsByDay.containsKey(d))
          woIdsByDay.put(d, new Set<Id>());
        woIdsByDay.get(d).add(sa.ParentRecordId);
      }
    }

    String kioskNotes = getKioskNotes(payload.territoryId);
    DashboardMetrics m = new DashboardMetrics();
    m.kioskNotes = kioskNotes;
    m.openCount = 0;
    m.inProgressCount = 0;
    m.completedCount = 0;
    m.criticalCount = 0;
    m.totalDurationMinutes = 0;
    m.totalActualMinutes = 0;

    Map<String, DonutSlice> sliceMap = new Map<String, DonutSlice>();
    List<CriticalJob> criticals = new List<CriticalJob>();

    if (!woIds.isEmpty()) {
      List<WorkOrder> workOrders = [
        SELECT
          Id,
          WorkOrderNumber,
          Status,
          Priority,
          WorkTypeId,
          WorkType.Name,
          DurationInMinutes,
          Subject,
          Wagon_Number__c
        FROM WorkOrder
        WHERE Id IN :woIds
        WITH SECURITY_ENFORCED
        LIMIT 500
      ];

      for (WorkOrder wo : workOrders) {
        String st = wo.Status;
        if (st == 'New' || st == 'Open')
          m.openCount++;
        else if (st == 'In Progress')
          m.inProgressCount++;
        else if (st == 'Completed')
          m.completedCount++;
        if (wo.Priority == 'Critical') {
          m.criticalCount++;
          if (criticals.size() < 3 && String.isNotBlank(wo.Subject)) {
            CriticalJob cj = new CriticalJob();
            cj.woNumber = wo.WorkOrderNumber;
            cj.subject = wo.Subject;
            cj.wagonNumber = wo.Wagon_Number__c;
            cj.status = wo.Status;
            criticals.add(cj);
          }
        }
        if (wo.DurationInMinutes != null)
          m.totalDurationMinutes += (Integer) wo.DurationInMinutes;
        String wtLabel = wo.WorkTypeId != null
          ? wo.WorkType.Name
          : 'Unclassified';
        if (!sliceMap.containsKey(wtLabel)) {
          DonutSlice s = new DonutSlice();
          s.label = wtLabel;
          s.count = 0;
          sliceMap.put(wtLabel, s);
        }
        sliceMap.get(wtLabel).count++;
      }

      // Actual time logged against these WOs in the date window
      for (AggregateResult ar : [
        SELECT SUM(Duration_in_Minutes__c) totalMins
        FROM Time_Report__c
        WHERE
          Work_Order__c IN :woIds
          AND Start_Time__c >= :fromDt
          AND Start_Time__c < :toDt
          AND End_Time__c != NULL
        WITH SECURITY_ENFORCED
      ]) {
        Object val = ar.get('totalMins');
        if (val != null)
          m.totalActualMinutes = ((Decimal) val).intValue();
      }
    }

    m.workTypeBreakdown = sliceMap.values();
    m.topCriticalJobs = criticals;

    // Jobs-per-day series across the selected window (zero-filled, in order).
    // Cap the span so a huge custom range can't blow out the payload/chart.
    List<JobDay> series = new List<JobDay>();
    Integer spanDays = fromDate.daysBetween(toDate) + 1; // inclusive
    Integer maxDays = 62;
    if (spanDays > 0 && spanDays <= maxDays) {
      for (Integer i = 0; i < spanDays; i++) {
        Date d = fromDate.addDays(i);
        JobDay jd = new JobDay();
        jd.day = DateTime.newInstance(d, Time.newInstance(0, 0, 0, 0))
          .format('yyyy-MM-dd');
        jd.count = woIdsByDay.containsKey(d) ? woIdsByDay.get(d).size() : 0;
        series.add(jd);
      }
    }
    m.jobsPerDay = series;
    return m;
  }

  // ─── Session refresh ──────────────────────────────────────────────────────

  @AuraEnabled
  public static EmployeeSession refreshSession(String token) {
    TokenPayload payload = validateToken(token);
    if (payload == null) {
      EmployeeSession fail = new EmployeeSession();
      fail.success = false;
      fail.errorCode = 'SESSION_EXPIRED';
      return fail;
    }
    DateTime now = DateTime.now();
    Long absoluteMaxMs = payload.issuedAtMs + (TOKEN_MAX_HOURS * 3600 * 1000);
    if (now.getTime() > absoluteMaxMs) {
      EmployeeSession fail = new EmployeeSession();
      fail.success = false;
      fail.errorCode = 'SESSION_EXPIRED';
      return fail;
    }
    EmployeeSession refreshed = new EmployeeSession();
    refreshed.success = true;
    refreshed.workerId = payload.workerId;
    refreshed.token = issueToken(payload.workerId, payload.territoryId, now);
    return refreshed;
  }

  // ─── Measure points ───────────────────────────────────────────────────────

  // Shared field projection + DTO mapping for Measure_Point__c so every read
  // returns the same shape (including Asset / Defect Location / Update Date).
  private static MeasurePointDTO mapMeasurePoint(Measure_Point__c mp) {
    MeasurePointDTO dto = new MeasurePointDTO();
    dto.id = mp.Id;
    dto.name = mp.Name;
    dto.componentName = mp.Component_Name__c;
    dto.measureType = mp.Measure_Type__c;
    dto.comments = mp.Comments__c;
    dto.reviewNotes = mp.Review_Notes__c;
    dto.measureValue = mp.Measure_Value__c;
    dto.measureValueType = mp.MeasureValue_Type__c;
    dto.createdDate = String.valueOf(mp.CreatedDate);
    dto.workOrderId = mp.Work_Order__c;
    dto.workOrderNumber = mp.Work_Order__c != null &&
      mp.Work_Order__r != null
      ? mp.Work_Order__r.WorkOrderNumber
      : null;
    dto.assetId = mp.Asset__c;
    dto.defectLocation = mp.Defect_Location__c;
    dto.updateDate = mp.Update_Date__c == null
      ? null
      : String.valueOf(mp.Update_Date__c);
    dto.sourceDocumentId = mp.Source_Document__c;
    dto.pageNumber = mp.Page_Number__c == null
      ? null
      : mp.Page_Number__c.intValue();
    dto.pagePositionEstimate = mp.Page_Position_Estimate__c;
    dto.tableName = mp.Table_Name__c;
    return dto;
  }

  // One ContentDocument query per call (not per row) to label the PDF source.
  private static void fillSourceTitles(List<MeasurePointDTO> dtos) {
    Set<Id> docIds = new Set<Id>();
    for (MeasurePointDTO d : dtos) {
      if (
        String.isNotBlank(d.sourceDocumentId) &&
        d.sourceDocumentId.length() >= 15
      ) {
        try {
          docIds.add((Id) d.sourceDocumentId);
        } catch (Exception e) {
          // malformed Source_Document__c text: leave the title empty
        }
      }
    }
    if (docIds.isEmpty())
      return;
    Map<Id, String> titles = new Map<Id, String>();
    for (ContentDocument cd : [
      SELECT Id, Title
      FROM ContentDocument
      WHERE Id IN :docIds
    ]) {
      titles.put(cd.Id, cd.Title);
    }
    for (MeasurePointDTO d : dtos) {
      if (
        String.isNotBlank(d.sourceDocumentId) &&
        d.sourceDocumentId.length() >= 15
      ) {
        try {
          d.sourceDocumentTitle = titles.get((Id) d.sourceDocumentId);
        } catch (Exception e) {
          // ignore
        }
      }
    }
  }

  @AuraEnabled(cacheable=false)
  public static List<MeasurePointDTO> getMeasurePoints(
    String token,
    String workOrderId
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    List<Measure_Point__c> records = [
      SELECT
        Id,
        Name,
        Component_Name__c,
        Measure_Type__c,
        Comments__c,
        Review_Notes__c,
        Measure_Value__c,
        MeasureValue_Type__c,
        CreatedDate,
        Work_Order__c,
        Work_Order__r.WorkOrderNumber,
        Asset__c,
        Defect_Location__c,
        Update_Date__c,
        Source_Document__c,
        Page_Number__c,
        Page_Position_Estimate__c,
        Table_Name__c
      FROM Measure_Point__c
      WHERE Work_Order__c = :workOrderId
      WITH SECURITY_ENFORCED
      ORDER BY CreatedDate DESC
    ];

    List<MeasurePointDTO> result = new List<MeasurePointDTO>();
    for (Measure_Point__c mp : records) {
      result.add(mapMeasurePoint(mp));
    }
    fillSourceTitles(result);
    return result;
  }

  @AuraEnabled(cacheable=false)
  public static List<MeasurePointDTO> getMeasurePointsByAsset(
    String token,
    String assetId
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    List<Measure_Point__c> records = [
      SELECT
        Id,
        Name,
        Component_Name__c,
        Measure_Type__c,
        Comments__c,
        Review_Notes__c,
        Measure_Value__c,
        MeasureValue_Type__c,
        CreatedDate,
        Work_Order__c,
        Work_Order__r.WorkOrderNumber,
        Asset__c,
        Defect_Location__c,
        Update_Date__c,
        Source_Document__c,
        Page_Number__c,
        Page_Position_Estimate__c,
        Table_Name__c
      FROM Measure_Point__c
      WHERE Asset__c = :assetId
      WITH SECURITY_ENFORCED
      ORDER BY CreatedDate DESC
    ];

    List<MeasurePointDTO> result = new List<MeasurePointDTO>();
    for (Measure_Point__c mp : records) {
      result.add(mapMeasurePoint(mp));
    }
    fillSourceTitles(result);
    return result;
  }

  public class MeasureImageDTO {
    @AuraEnabled
    public String measurePointId;
    @AuraEnabled
    public String dataUri; // data:<mime>;base64,<bytes> — renders inline in <img>
  }

  /**
   * Returns the latest image attachment (as a base64 data URI) for each measure
   * point that has one. Data URIs render inline in an <img> without the LWR file
   * URL / CSP / cross-site-cookie issues. Keep the measure point id list small
   * (the visible card list); images are skipped above a safe size.
   */
  @AuraEnabled(cacheable=false)
  public static List<MeasureImageDTO> getMeasureImages(
    String token,
    List<String> measurePointIds
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    List<MeasureImageDTO> out = new List<MeasureImageDTO>();
    if (measurePointIds == null || measurePointIds.isEmpty())
      return out;

    Set<String> imageExts = new Set<String>{
      'png',
      'jpg',
      'jpeg',
      'gif',
      'bmp',
      'webp'
    };
    Integer maxBytes = 3000000; // ~3MB cap to stay within heap/response limits

    // Map each measure point to its linked content documents.
    Map<Id, Id> docToEntity = new Map<Id, Id>();
    for (ContentDocumentLink cdl : [
      SELECT ContentDocumentId, LinkedEntityId
      FROM ContentDocumentLink
      WHERE LinkedEntityId IN :measurePointIds
    ]) {
      // first (latest-created) doc per entity wins; query orders below handle recency
      docToEntity.put(cdl.ContentDocumentId, cdl.LinkedEntityId);
    }
    if (docToEntity.isEmpty())
      return out;

    Map<Id, MeasureImageDTO> byEntity = new Map<Id, MeasureImageDTO>();
    for (ContentVersion cv : [
      SELECT ContentDocumentId, FileExtension, VersionData, ContentSize
      FROM ContentVersion
      WHERE ContentDocumentId IN :docToEntity.keySet() AND IsLatest = TRUE
      ORDER BY CreatedDate DESC
    ]) {
      String ext = (cv.FileExtension == null)
        ? ''
        : cv.FileExtension.toLowerCase();
      if (!imageExts.contains(ext))
        continue;
      if (cv.ContentSize != null && cv.ContentSize > maxBytes)
        continue;
      Id entityId = docToEntity.get(cv.ContentDocumentId);
      if (entityId == null || byEntity.containsKey(entityId))
        continue; // one image per point
      if (cv.VersionData == null)
        continue;

      String mime = (ext == 'jpg') ? 'jpeg' : ext;
      MeasureImageDTO img = new MeasureImageDTO();
      img.measurePointId = entityId;
      img.dataUri =
        'data:image/' +
        mime +
        ';base64,' +
        EncodingUtil.base64Encode(cv.VersionData);
      byEntity.put(entityId, img);
    }
    out.addAll(byEntity.values());
    return out;
  }

  /**
   * Attaches an image (base64) to a measure point as a ContentVersion + link.
   * Used by the measure form's camera/file upload. Returns the data URI so the
   * card can show it immediately without a re-query.
   */
  @AuraEnabled
  public static String uploadMeasureImage(
    String token,
    String measurePointId,
    String fileName,
    String base64Data
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    if (String.isBlank(measurePointId) || String.isBlank(base64Data)) {
      throw new AuraHandledException('INVALID_REQUEST');
    }

    String cleanName = String.isBlank(fileName)
      ? 'Measure Image.jpg'
      : fileName;
    String ext = cleanName.contains('.')
      ? cleanName.substringAfterLast('.').toLowerCase()
      : 'jpg';
    Set<String> imageExts = new Set<String>{
      'png',
      'jpg',
      'jpeg',
      'gif',
      'bmp',
      'webp'
    };
    if (!imageExts.contains(ext))
      throw new AuraHandledException('NOT_AN_IMAGE');

    Blob body = EncodingUtil.base64Decode(base64Data);

    ContentVersion cv = new ContentVersion();
    cv.Title = cleanName;
    cv.PathOnClient = cleanName;
    cv.VersionData = body;
    cv.IsMajorVersion = true;
    insert cv;

    Id docId = [
      SELECT ContentDocumentId
      FROM ContentVersion
      WHERE Id = :cv.Id
      LIMIT 1
    ]
    .ContentDocumentId;
    insert new ContentDocumentLink(
      ContentDocumentId = docId,
      LinkedEntityId = measurePointId,
      ShareType = 'V',
      Visibility = 'AllUsers'
    );

    String mime = (ext == 'jpg') ? 'jpeg' : ext;
    return 'data:image/' + mime + ';base64,' + base64Data;
  }

  @AuraEnabled
  public static MeasurePointDTO saveMeasurePoint(String token, String reqJson) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    MeasurePointDTO req = (MeasurePointDTO) JSON.deserialize(
      reqJson,
      MeasurePointDTO.class
    );

    Measure_Point__c mp;
    if (String.isNotBlank(req.id)) {
      mp = new Measure_Point__c(Id = req.id);
    } else {
      mp = new Measure_Point__c();
    }
    mp.Component_Name__c = req.componentName;
    mp.Measure_Type__c = req.measureType;
    mp.Comments__c = req.comments;
    mp.Review_Notes__c = req.reviewNotes;
    mp.Measure_Value__c = req.measureValue;
    // Default the value type to Depth when capturing a measurement and none was supplied.
    mp.MeasureValue_Type__c = (req.measureType == 'Measure' &&
      String.isBlank(req.measureValueType))
      ? 'Depth'
      : req.measureValueType;
    mp.Defect_Location__c = req.defectLocation;
    // Always anchor the point to its work order / asset so kiosk-created points are not orphaned.
    // The WO's own asset wins over any client-supplied assetId (new points hang off the right component).
    // The four PDF fields (source/page/position/table) are never read from the request.
    if (String.isNotBlank(req.workOrderId)) {
      mp.Work_Order__c = req.workOrderId;
      List<WorkOrder> woAsset = [
        SELECT AssetId
        FROM WorkOrder
        WHERE Id = :req.workOrderId
        LIMIT 1
      ];
      if (!woAsset.isEmpty() && woAsset[0].AssetId != null) {
        mp.Asset__c = woAsset[0].AssetId;
      } else if (String.isNotBlank(req.assetId)) {
        mp.Asset__c = req.assetId;
      }
    } else if (String.isNotBlank(req.assetId)) {
      mp.Asset__c = req.assetId;
    }
    // Stamp the update date on every save (defaults to now for new and edited points).
    mp.Update_Date__c = DateTime.now();

    upsert mp;

    // Re-query to get all fields including system-populated ones
    List<Measure_Point__c> saved = [
      SELECT
        Id,
        Name,
        Component_Name__c,
        Measure_Type__c,
        Comments__c,
        Review_Notes__c,
        Measure_Value__c,
        MeasureValue_Type__c,
        CreatedDate,
        Work_Order__c,
        Work_Order__r.WorkOrderNumber,
        Asset__c,
        Defect_Location__c,
        Update_Date__c,
        Source_Document__c,
        Page_Number__c,
        Page_Position_Estimate__c,
        Table_Name__c
      FROM Measure_Point__c
      WHERE Id = :mp.Id
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (saved.isEmpty())
      throw new AuraHandledException('SAVE_FAILED');

    MeasurePointDTO savedDto = mapMeasurePoint(saved[0]);
    fillSourceTitles(new List<MeasurePointDTO>{ savedDto });
    return savedDto;
  }

  @AuraEnabled
  public static void deleteMeasurePoint(String token, String measurePointId) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    if (String.isBlank(measurePointId))
      throw new AuraHandledException('MISSING_ID');

    List<Measure_Point__c> toDelete = [
      SELECT Id
      FROM Measure_Point__c
      WHERE Id = :measurePointId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (!toDelete.isEmpty()) {
      delete toDelete;
    }
  }

  // ─── Asset review (wagon + wheelsets) ──────────────────────────────────────

  @AuraEnabled(cacheable=false)
  public static WagonDTO getWagonAsset(String token, String workOrderId) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    // 1. Resolve the wagon asset from the workpack work order.
    List<WorkOrder> wos = [
      SELECT Id, AssetId, Wagon_Number__c
      FROM WorkOrder
      WHERE Id = :workOrderId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (wos.isEmpty() || wos[0].AssetId == null)
      throw new AuraHandledException('NO_ASSET');
    Id wagonId = wos[0].AssetId;

    List<Asset> wagons = [
      SELECT
        Id,
        Name,
        SerialNumber,
        Status,
        Entitlement_Status__c,
        FLOC__c,
        Asset_Type__c
      FROM Asset
      WHERE Id = :wagonId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (wagons.isEmpty())
      throw new AuraHandledException('NO_ASSET');
    Asset wagon = wagons[0];

    // 2. Level-2 components (children of the wagon).
    List<Asset> children = [
      SELECT
        Id,
        Name,
        SerialNumber,
        Status,
        Entitlement_Status__c,
        InstallDate,
        PurchaseDate,
        FLOC__c,
        Asset_Type__c
      FROM Asset
      WHERE ParentId = :wagonId
      WITH SECURITY_ENFORCED
      ORDER BY Name
    ];
    Set<Id> childIds = new Set<Id>();
    for (Asset a : children)
      childIds.add(a.Id);

    // 3. Level-3 sub-assets (grandchildren, e.g. Axles under a Wheelset).
    List<Asset> grandkids = new List<Asset>();
    if (!childIds.isEmpty()) {
      grandkids = [
        SELECT
          Id,
          Name,
          SerialNumber,
          Status,
          Entitlement_Status__c,
          InstallDate,
          PurchaseDate,
          FLOC__c,
          Asset_Type__c,
          ParentId
        FROM Asset
        WHERE ParentId IN :childIds
        WITH SECURITY_ENFORCED
        ORDER BY Name
      ];
    }

    // 4. Aggregate measure points across BOTH levels for the at-a-glance status.
    Set<Id> measureAssetIds = new Set<Id>(childIds);
    for (Asset g : grandkids)
      measureAssetIds.add(g.Id);

    Map<Id, Boolean> hasAttention = new Map<Id, Boolean>();
    Map<Id, Boolean> hasMeasure = new Map<Id, Boolean>();
    if (!measureAssetIds.isEmpty()) {
      for (Measure_Point__c mp : [
        SELECT Asset__c, Measure_Type__c, Measure_Value__c, MeasureValue_Type__c
        FROM Measure_Point__c
        WHERE Asset__c IN :measureAssetIds
        WITH SECURITY_ENFORCED
      ]) {
        if (
          mp.Measure_Type__c == 'Attention Required' ||
          mp.Measure_Type__c == 'Scrap'
        ) {
          hasAttention.put(mp.Asset__c, true);
        }
        // Green = a real measure has been recorded (value entered or a measure type set).
        // Empty checklist placeholders (no type/value) stay grey ("no activity recorded").
        if (
          mp.Measure_Value__c != null ||
          mp.Measure_Type__c == 'Measure' ||
          mp.Measure_Type__c == 'OK'
        ) {
          hasMeasure.put(mp.Asset__c, true);
        }
      }
    }

    // 5. Count of work orders in THIS workpack (root WO + its children) per asset.
    Map<Id, Integer> woCountByAsset = new Map<Id, Integer>();
    for (AggregateResult ar : [
      SELECT AssetId aid, COUNT(Id) cnt
      FROM WorkOrder
      WHERE
        (Id = :workOrderId
        OR ParentWorkOrderId = :workOrderId
        OR RootWorkOrderId = :workOrderId)
        AND AssetId != NULL
      WITH SECURITY_ENFORCED
      GROUP BY AssetId
    ]) {
      woCountByAsset.put((Id) ar.get('aid'), (Integer) ar.get('cnt'));
    }

    // 6. Group grandchildren under their parent component.
    Map<Id, List<Asset>> grandByParent = new Map<Id, List<Asset>>();
    for (Asset g : grandkids) {
      if (!grandByParent.containsKey(g.ParentId))
        grandByParent.put(g.ParentId, new List<Asset>());
      grandByParent.get(g.ParentId).add(g);
    }

    WagonDTO dto = new WagonDTO();
    dto.id = wagon.Id;
    dto.name = wagon.Name;
    dto.serialNumber = wagon.SerialNumber;
    dto.status = wagon.Status;
    dto.warrantyStatus = wagon.Entitlement_Status__c;
    dto.floc = wagon.FLOC__c;
    dto.assetType = wagon.Asset_Type__c;
    dto.hasWagonNumber = String.isNotBlank(wos[0].Wagon_Number__c);
    dto.wheelsets = new List<WheelsetDTO>();

    for (Asset a : children) {
      WheelsetDTO w = mapAsset(a, hasAttention, hasMeasure, woCountByAsset);
      w.children = new List<WheelsetDTO>();
      Integer rolled = w.workOrderCount; // own WOs
      for (
        Asset g : grandByParent.get(a.Id) != null
          ? grandByParent.get(a.Id)
          : new List<Asset>()
      ) {
        WheelsetDTO gd = mapAsset(g, hasAttention, hasMeasure, woCountByAsset);
        rolled += (gd.workOrderCount == null ? 0 : gd.workOrderCount);
        w.children.add(gd);
      }
      w.workOrderCount = rolled; // rolled-up total shown on the parent badge
      dto.wheelsets.add(w);
    }
    return dto;
  }

  // Build a WheelsetDTO from an Asset plus the precomputed status/count maps.
  private static WheelsetDTO mapAsset(
    Asset a,
    Map<Id, Boolean> hasAttention,
    Map<Id, Boolean> hasMeasure,
    Map<Id, Integer> woCountByAsset
  ) {
    WheelsetDTO w = new WheelsetDTO();
    w.id = a.Id;
    w.name = a.Name;
    w.label = deriveWheelsetLabel(a.Name);
    w.serialNumber = a.SerialNumber;
    w.status = a.Status;
    w.warrantyStatus = a.Entitlement_Status__c;
    w.installDate = a.InstallDate == null
      ? null
      : String.valueOf(a.InstallDate);
    w.purchaseDate = a.PurchaseDate == null
      ? null
      : String.valueOf(a.PurchaseDate);
    w.floc = a.FLOC__c;
    w.assetType = a.Asset_Type__c;
    w.workOrderCount = woCountByAsset.containsKey(a.Id)
      ? woCountByAsset.get(a.Id)
      : 0;
    if (hasAttention.get(a.Id) == true) {
      w.iconStatus = 'red';
    } else if (hasMeasure.get(a.Id) == true) {
      w.iconStatus = 'green';
    } else {
      w.iconStatus = 'grey';
    }
    return w;
  }

  // Derive an L1..L4 short label from an asset name like "20213 Wheelset L1".
  private static String deriveWheelsetLabel(String assetName) {
    if (String.isBlank(assetName))
      return '';
    Matcher m = Pattern.compile('(?i)L\\s*([1-4])').matcher(assetName);
    if (m.find())
      return 'L' + m.group(1);
    return assetName;
  }

  private static TaskWoDTO mapTask(WorkOrder wo) {
    TaskWoDTO t = new TaskWoDTO();
    t.id = wo.Id;
    t.woNumber = wo.WorkOrderNumber;
    t.subject = wo.Subject;
    t.status = wo.Status;
    t.priority = wo.Priority;
    t.description = wo.Description;
    t.causeCodes = wo.Cause_Codes__c;
    t.workDelayCodes = wo.Work_Delay_Codes__c;
    t.startDate = wo.StartDate == null ? null : String.valueOf(wo.StartDate);
    t.component = wo.SAP_FLOC_Desc__c;
    t.durationHours = wo.DurationType == 'Minutes' &&
      wo.Duration != null
      ? (wo.Duration / 60).setScale(2)
      : wo.Duration;
    t.comments = wo.Comment__c;
    t.workTypeName = wo.WorkType != null ? wo.WorkType.Name : null;
    return t;
  }

  private static final String TASK_FIELDS =
    'Id, WorkOrderNumber, Subject, Status, Priority, Description, Cause_Codes__c, ' +
    'Work_Delay_Codes__c, StartDate, SAP_FLOC_Desc__c, Duration, DurationType, Comment__c, ' +
    'WorkTypeId, WorkType.Name';

  // Map a WorkTypeGroup name to a signal category. Breakdown = repair,
  // Condition (Monitoring) = telematics, (Preventive) Maintenance = maintenance.
  private static String categoryFromGroup(String groupName) {
    if (String.isBlank(groupName))
      return null;
    String n = groupName.toLowerCase();
    if (n.contains('breakdown'))
      return 'repair';
    if (n.contains('condition'))
      return 'telematics';
    if (n.contains('maintenance'))
      return 'maintenance';
    return null;
  }

  // Deterministic precedence when a WorkType belongs to several groups (lower wins).
  private static Integer catRank(String cat) {
    if (cat == 'repair')
      return 0;
    if (cat == 'telematics')
      return 1;
    if (cat == 'maintenance')
      return 2;
    return 3;
  }

  @AuraEnabled(cacheable=false)
  public static List<TaskWoDTO> getAssetTasks(
    String token,
    String assetId,
    String workOrderId
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    // Match the component's WO-count badge: WorkOrders in THIS workpack (the root WO
    // or its direct children) whose AssetId is the selected component OR any of its
    // sub-components (one level down, same roll-up the badge uses). All WorkTypes.
    Set<Id> assetIds = new Set<Id>{ (Id) assetId };
    for (Asset child : [
      SELECT Id
      FROM Asset
      WHERE ParentId = :assetId
      WITH SECURITY_ENFORCED
    ]) {
      assetIds.add(child.Id);
    }
    Id woId = (Id) workOrderId;

    List<WorkOrder> rows = (List<WorkOrder>) Database.query(
      'SELECT ' +
        TASK_FIELDS +
        ' FROM WorkOrder ' +
        'WHERE (Id = :woId OR ParentWorkOrderId = :woId OR RootWorkOrderId = :woId) AND AssetId IN :assetIds ' +
        'WITH SECURITY_ENFORCED ORDER BY CreatedDate DESC'
    );

    // Classify each WorkType via its WorkTypeGroup(s): repair / telematics / maintenance.
    Set<Id> wtIds = new Set<Id>();
    for (WorkOrder wo : rows) {
      if (wo.WorkTypeId != null)
        wtIds.add(wo.WorkTypeId);
    }
    Map<Id, String> catByWorkType = new Map<Id, String>();
    if (!wtIds.isEmpty()) {
      for (WorkTypeGroupMember m : [
        SELECT WorkTypeId, WorkTypeGroup.Name
        FROM WorkTypeGroupMember
        WHERE WorkTypeId IN :wtIds
        WITH SECURITY_ENFORCED
      ]) {
        String cat = categoryFromGroup(m.WorkTypeGroup.Name);
        if (cat == null)
          continue;
        String existing = catByWorkType.get(m.WorkTypeId);
        if (existing == null || catRank(cat) < catRank(existing)) {
          catByWorkType.put(m.WorkTypeId, cat);
        }
      }
    }

    List<TaskWoDTO> result = new List<TaskWoDTO>();
    for (WorkOrder wo : rows) {
      TaskWoDTO t = mapTask(wo);
      t.category = (wo.WorkTypeId != null &&
        catByWorkType.containsKey(wo.WorkTypeId))
        ? catByWorkType.get(wo.WorkTypeId)
        : 'other';
      result.add(t);
    }
    return result;
  }

  // Work plans + required parts for the WOs in this workpack that reference the selected asset.
  @AuraEnabled(cacheable=false)
  public static AssetReviewDetailDTO getAssetReviewDetail(
    String token,
    String workOrderId,
    String assetId
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    AssetReviewDetailDTO dto = new AssetReviewDetailDTO();
    dto.workPlans = new List<WorkPlanDTO>();
    dto.parts = new List<PartLineDTO>();
    if (String.isBlank(workOrderId) || String.isBlank(assetId))
      return dto;

    // WOs in this workpack (root or a direct child of it) that reference the selected
    // component OR any of its sub-components — same asset roll-up as the Work Orders panel.
    Set<Id> assetIds = new Set<Id>{ (Id) assetId };
    for (Asset child : [
      SELECT Id
      FROM Asset
      WHERE ParentId = :assetId
      WITH SECURITY_ENFORCED
    ]) {
      assetIds.add(child.Id);
    }
    Id woId = (Id) workOrderId;

    Map<Id, WorkOrder> assocWos = new Map<Id, WorkOrder>();
    for (WorkOrder wo : [
      SELECT Id, WorkOrderNumber, WorkTypeId
      FROM WorkOrder
      WHERE
        (Id = :woId
        OR ParentWorkOrderId = :woId
        OR RootWorkOrderId = :woId)
        AND AssetId IN :assetIds
      WITH SECURITY_ENFORCED
    ]) {
      assocWos.put(wo.Id, wo);
    }
    if (assocWos.isEmpty())
      return dto;
    Set<Id> woIds = assocWos.keySet();

    // ── Work plans + steps for the associated WOs ──
    // WorkPlan OWD is Private and WorkStep is ControlledByParent, so a `with sharing`
    // query returns 0 rows for the kiosk site user (they don't own the records).
    // Read in system mode — same pattern as getWorkpackProgress — since access is
    // already gated by the validated session token + workpack scope.
    Map<Id, WorkPlanDTO> planMap = new Map<Id, WorkPlanDTO>();
    for (
      WorkPlan wp : (List<WorkPlan>) Database.query(
        'SELECT Id, Name, ExecutionOrder, WorkOrderId FROM WorkPlan WHERE WorkOrderId IN :woIds ' +
        'ORDER BY ExecutionOrder ASC NULLS LAST',
        AccessLevel.SYSTEM_MODE
      )
    ) {
      WorkPlanDTO wpDto = new WorkPlanDTO();
      wpDto.id = wp.Id;
      wpDto.name = wp.Name;
      wpDto.executionOrder = wp.ExecutionOrder;
      wpDto.workOrderId = wp.WorkOrderId;
      WorkOrder planWo = assocWos.get(wp.WorkOrderId);
      wpDto.workOrderNumber = planWo != null ? planWo.WorkOrderNumber : null;
      wpDto.steps = new List<WorkStepDTO>();
      dto.workPlans.add(wpDto);
      planMap.put(wp.Id, wpDto);
    }
    if (!planMap.isEmpty()) {
      for (
        WorkStep ws : (List<WorkStep>) Database.query(
          'SELECT Id, Name, Status, ExecutionOrder, Description, WorkPlanId, ActionType, ActionDefinition ' +
            'FROM WorkStep WHERE WorkOrderId IN :woIds ' +
            'ORDER BY WorkPlanExecutionOrder ASC, ExecutionOrder ASC',
          AccessLevel.SYSTEM_MODE
        )
      ) {
        if (!planMap.containsKey(ws.WorkPlanId))
          continue;
        WorkStepDTO sdto = new WorkStepDTO();
        sdto.id = ws.Id;
        sdto.name = ws.Name;
        sdto.status = ws.Status;
        sdto.executionOrder = ws.ExecutionOrder;
        sdto.description = ws.Description;
        sdto.actionType = ws.ActionType;
        sdto.actionDefinition = ws.ActionDefinition;
        planMap.get(ws.WorkPlanId).steps.add(sdto);
      }
    }

    // ── Combined parts: required (ProductRequired) + consumed (ProductConsumed),
    //    one line per product, with unit cost from the standard active price book. ──
    Map<Id, PartLineDTO> byProduct = new Map<Id, PartLineDTO>();

    // Required — direct WO parts win; WOs with none fall back to their WorkType's parts.
    Set<Id> wosWithDirectParts = new Set<Id>();
    for (ProductRequired pr : [
      SELECT
        Id,
        ParentRecordId,
        Product2Id,
        Product2.Name,
        QuantityRequired,
        QuantityUnitOfMeasure
      FROM ProductRequired
      WHERE ParentRecordId IN :woIds
      WITH SECURITY_ENFORCED
    ]) {
      wosWithDirectParts.add(pr.ParentRecordId);
      addRequired(byProduct, pr, pr.ParentRecordId);
    }
    Map<Id, Id> workTypeToWo = new Map<Id, Id>();
    for (WorkOrder wo : assocWos.values()) {
      if (wo.WorkTypeId != null && !wosWithDirectParts.contains(wo.Id))
        workTypeToWo.put(wo.WorkTypeId, wo.Id);
    }
    if (!workTypeToWo.isEmpty()) {
      for (ProductRequired pr : [
        SELECT
          Id,
          ParentRecordId,
          Product2Id,
          Product2.Name,
          QuantityRequired,
          QuantityUnitOfMeasure
        FROM ProductRequired
        WHERE ParentRecordId IN :workTypeToWo.keySet()
        WITH SECURITY_ENFORCED
      ]) {
        addRequired(byProduct, pr, workTypeToWo.get(pr.ParentRecordId));
      }
    }

    // Consumed — ProductConsumed is a detail of WorkOrder; read in system mode.
    for (
      ProductConsumed pc : (List<ProductConsumed>) Database.query(
        'SELECT Product2Id, Product2.Name, QuantityConsumed, WorkOrderId ' +
        'FROM ProductConsumed WHERE WorkOrderId IN :woIds',
        AccessLevel.SYSTEM_MODE
      )
    ) {
      if (pc.Product2Id == null)
        continue;
      PartLineDTO line = byProduct.get(pc.Product2Id);
      if (line == null) {
        line = newPartLine(
          pc.Product2Id,
          (pc.Product2 != null ? pc.Product2.Name : null)
        );
        byProduct.put(pc.Product2Id, line);
      }
      line.consumedQty += (pc.QuantityConsumed != null
        ? pc.QuantityConsumed
        : 0);
      if (line.workOrderId == null)
        line.workOrderId = String.valueOf(pc.WorkOrderId);
    }

    // Unit cost + PricebookEntryId per product from the standard active price book.
    // Multi-currency org: pick the PBE in the supervisor's currency so the price shown
    // matches the currency ProductConsumed will be inserted with.
    if (!byProduct.isEmpty()) {
      Set<Id> pids = byProduct.keySet();
      String supCurrency = UserInfo.getDefaultCurrency();
      try {
        for (
          PricebookEntry pbe : (List<PricebookEntry>) Database.query(
            'SELECT Id, Product2Id, UnitPrice FROM PricebookEntry ' +
              'WHERE Product2Id IN :pids AND Pricebook2.IsStandard = true AND IsActive = true ' +
              'AND CurrencyIsoCode = :supCurrency',
            AccessLevel.SYSTEM_MODE
          )
        ) {
          PartLineDTO line = byProduct.get(pbe.Product2Id);
          if (line != null && line.pricebookEntryId == null) {
            line.pricebookEntryId = pbe.Id;
            line.unitPrice = pbe.UnitPrice;
          }
        }
      } catch (Exception e) {
        /* price is optional */
      }
    }
    dto.parts = byProduct.values();

    // Target WO for newly-added consumed parts: the opened WO if in scope, else first.
    dto.consumeWorkOrderId = woIds.contains(woId)
      ? String.valueOf(woId)
      : String.valueOf(new List<Id>(woIds)[0]);
    return dto;
  }

  private static PartLineDTO newPartLine(Id productId, String name) {
    PartLineDTO line = new PartLineDTO();
    line.productId = productId;
    line.productName = String.isNotBlank(name) ? name : 'Unnamed part';
    line.requiredQty = 0;
    line.consumedQty = 0;
    return line;
  }

  private static void addRequired(
    Map<Id, PartLineDTO> byProduct,
    ProductRequired pr,
    Id woId
  ) {
    if (pr.Product2Id == null)
      return;
    PartLineDTO line = byProduct.get(pr.Product2Id);
    if (line == null) {
      line = newPartLine(
        pr.Product2Id,
        (pr.Product2 != null ? pr.Product2.Name : null)
      );
      byProduct.put(pr.Product2Id, line);
    }
    line.requiredQty += (pr.QuantityRequired != null ? pr.QuantityRequired : 0);
    if (String.isNotBlank(pr.QuantityUnitOfMeasure))
      line.unit = pr.QuantityUnitOfMeasure;
    if (line.workOrderId == null)
      line.workOrderId = String.valueOf(woId);
  }

  // Consume 1 unit of a product against a WO. Updates the existing ProductConsumed for
  // that product on the WO, or inserts a new one. ProductConsumed is a WorkOrder detail
  // (member has no create/edit share) → DML in SYSTEM_MODE.
  @AuraEnabled
  public static void consumePart(
    String token,
    String workOrderId,
    String product2Id,
    String pricebookEntryId,
    Decimal unitPrice
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    if (String.isBlank(workOrderId) || String.isBlank(product2Id)) {
      throw new AuraHandledException('MISSING_INPUT');
    }
    List<ProductConsumed> existing = (List<ProductConsumed>) Database.query(
      'SELECT Id, QuantityConsumed FROM ProductConsumed ' +
      'WHERE WorkOrderId = :workOrderId AND Product2Id = :product2Id LIMIT 1',
      AccessLevel.SYSTEM_MODE
    );
    if (!existing.isEmpty()) {
      ProductConsumed pc = existing[0];
      pc.QuantityConsumed =
        (pc.QuantityConsumed != null ? pc.QuantityConsumed : 0) + 1;
      Database.update(pc, AccessLevel.SYSTEM_MODE);
      return;
    }
    // New consumption line. ProductConsumed requires a PBE whose currency matches the
    // WorkOrder's — resolve the standard active PBE for this product in the supervisor's
    // currency rather than trusting the id passed from the client.
    String supCurrency = UserInfo.getDefaultCurrency();
    List<PricebookEntry> pbes = (List<PricebookEntry>) Database.query(
      'SELECT Id, UnitPrice FROM PricebookEntry ' +
        'WHERE Product2Id = :product2Id AND Pricebook2.IsStandard = true AND IsActive = true ' +
        'AND CurrencyIsoCode = :supCurrency LIMIT 1',
      AccessLevel.SYSTEM_MODE
    );
    if (pbes.isEmpty())
      throw new AuraHandledException('NO_PRICEBOOK_ENTRY');
    // Note: do NOT set IsConsumed — the org requires Product Consumed State records
    // for that flag ("You can select Consumed after the Product is consumed"); the
    // quantity alone represents consumption.
    ProductConsumed pc = new ProductConsumed(
      WorkOrderId = workOrderId,
      PricebookEntryId = pbes[0].Id,
      QuantityConsumed = 1,
      UnitPrice = (unitPrice != null ? unitPrice : pbes[0].UnitPrice)
    );
    Database.insert(pc, AccessLevel.SYSTEM_MODE);
  }

  // Products available to add to the consumed list (standard active price book).
  @AuraEnabled(cacheable=false)
  public static List<ProductOptionDTO> getConsumableProducts(String token) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    List<ProductOptionDTO> opts = new List<ProductOptionDTO>();
    String supCurrency = UserInfo.getDefaultCurrency();
    for (
      PricebookEntry pbe : (List<PricebookEntry>) Database.query(
        'SELECT Id, Product2Id, Product2.Name, UnitPrice FROM PricebookEntry ' +
          'WHERE Pricebook2.IsStandard = true AND IsActive = true AND Product2.IsActive = true ' +
          'AND CurrencyIsoCode = :supCurrency ' +
          'ORDER BY Product2.Name ASC',
        AccessLevel.SYSTEM_MODE
      )
    ) {
      if (pbe.Product2Id == null)
        continue;
      ProductOptionDTO o = new ProductOptionDTO();
      o.productId = pbe.Product2Id;
      o.productName = (pbe.Product2 != null &&
        pbe.Product2.Name != null)
        ? pbe.Product2.Name
        : 'Unnamed';
      o.unitPrice = pbe.UnitPrice;
      o.pricebookEntryId = pbe.Id;
      opts.add(o);
    }
    return opts;
  }

  // Workpack progress KPIs — rolled up across the root WO + all its child WOs.
  @AuraEnabled(cacheable=false)
  public static WorkpackProgressDTO getWorkpackProgress(
    String token,
    String workOrderId
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    WorkpackProgressDTO dto = new WorkpackProgressDTO();
    dto.steps = newKpi();
    dto.measures = newKpi();
    dto.labour = newKpi();
    dto.parts = newKpi();
    dto.partsCost = newKpi();
    dto.components = newKpi();
    dto.overallPercent = 0;
    if (String.isBlank(workOrderId))
      return dto;

    // 1. Root WO + all direct children (the workpack span). Root has no parent.
    Set<Id> woIds = new Set<Id>();
    Integer plannedMins = 0;
    Integer childTotal = 0;
    Integer childInProgress = 0;
    for (WorkOrder wo : [
      SELECT Id, Status, DurationInMinutes, ParentWorkOrderId
      FROM WorkOrder
      WHERE
        Id = :workOrderId
        OR ParentWorkOrderId = :workOrderId
        OR RootWorkOrderId = :workOrderId
      WITH SECURITY_ENFORCED
    ]) {
      woIds.add(wo.Id);
      if (wo.DurationInMinutes != null)
        plannedMins += wo.DurationInMinutes.intValue();
      if (wo.Id != workOrderId) {
        // a descendant of the workpack (child or grandchild)
        childTotal++;
        if (wo.Status != 'New')
          childInProgress++;
      }
    }
    if (woIds.isEmpty())
      return dto;

    // 2. Steps — completed vs total, across all WOs (root + children) AND their
    //    associated work plans. A WorkStep may link to its WorkOrder directly
    //    (WorkOrderId) OR only through its WorkPlan (WorkStep.WorkOrderId null),
    //    so count via both paths (a single row per step — no double count).
    //    WorkStep is ControlledByParent(WorkPlan), and WorkPlan OWD is Private, so
    //    the running Experience member has no row-share to the pack's WorkPlans and
    //    a member-mode query returns 0 (WITH SECURITY_ENFORCED does NOT throw on
    //    row sharing — it just returns nothing). This is a pure completion rollup,
    //    so read it in SYSTEM_MODE (same precedent as the dashboard counts and the
    //    PricebookEntry reference read below).
    Set<Id> planIds = new Set<Id>();
    for (
      WorkPlan wp : (List<WorkPlan>) Database.query(
        'SELECT Id FROM WorkPlan WHERE WorkOrderId IN :woIds',
        AccessLevel.SYSTEM_MODE
      )
    ) {
      planIds.add(wp.Id);
    }
    Integer stepsDone = 0, stepsTotal = 0;
    for (
      AggregateResult ar : (List<AggregateResult>) Database.query(
        'SELECT Status st, COUNT(Id) cnt FROM WorkStep ' +
        'WHERE WorkOrderId IN :woIds OR WorkPlanId IN :planIds GROUP BY Status',
        AccessLevel.SYSTEM_MODE
      )
    ) {
      Integer cnt = (Integer) ar.get('cnt');
      stepsTotal += cnt;
      if ((String) ar.get('st') == 'Completed')
        stepsDone += cnt;
    }
    setKpi(dto.steps, stepsDone, stepsTotal);

    // 3. Measures — taken vs total. Taken = a value recorded OR a measure type other than 'Measure'.
    Integer mTaken = 0, mTotal = 0;
    for (Measure_Point__c mp : [
      SELECT Measure_Value__c, Measure_Type__c
      FROM Measure_Point__c
      WHERE Work_Order__c IN :woIds
      WITH SECURITY_ENFORCED
    ]) {
      mTotal++;
      if (
        mp.Measure_Value__c != null ||
        (mp.Measure_Type__c != null &&
        mp.Measure_Type__c != 'Measure')
      ) {
        mTaken++;
      }
    }
    setKpi(dto.measures, mTaken, mTotal);

    // 4. Labour — actual confirmed minutes vs planned minutes.
    Integer actualMins = 0;
    for (AggregateResult ar : [
      SELECT SUM(Duration_in_Minutes__c) mins
      FROM Time_Report__c
      WHERE Work_Order__c IN :woIds AND End_Time__c != NULL
      WITH SECURITY_ENFORCED
    ]) {
      Object v = ar.get('mins');
      if (v != null)
        actualMins = ((Decimal) v).intValue();
    }
    setKpiRaw(dto.labour, actualMins, plannedMins);

    // 5a. Required parts — sum of quantities + per-product totals for cost.
    Decimal reqQty = 0;
    Map<Id, Decimal> reqQtyByProduct = new Map<Id, Decimal>();
    for (ProductRequired pr : [
      SELECT Product2Id, QuantityRequired
      FROM ProductRequired
      WHERE ParentRecordId IN :woIds
      WITH SECURITY_ENFORCED
    ]) {
      Decimal q = pr.QuantityRequired != null ? pr.QuantityRequired : 0;
      reqQty += q;
      if (pr.Product2Id != null) {
        Decimal cur = reqQtyByProduct.containsKey(pr.Product2Id)
          ? reqQtyByProduct.get(pr.Product2Id)
          : 0;
        reqQtyByProduct.put(pr.Product2Id, cur + q);
      }
    }
    // Unit price per product from the standard active price book. PricebookEntry
    // cannot be granted via a permission set (access keys off price-book sharing),
    // so read this reference price data in SYSTEM_MODE. The products themselves are
    // already gated by the member's ProductRequired access above.
    Decimal reqCost = 0;
    if (!reqQtyByProduct.isEmpty()) {
      Set<Id> pids = reqQtyByProduct.keySet();
      Map<Id, Decimal> priceByProduct = new Map<Id, Decimal>();
      try {
        List<PricebookEntry> pbes = Database.query(
          'SELECT Product2Id, UnitPrice FROM PricebookEntry ' +
          'WHERE Product2Id IN :pids AND Pricebook2.IsStandard = true AND IsActive = true',
          AccessLevel.SYSTEM_MODE
        );
        for (PricebookEntry pbe : pbes) {
          if (!priceByProduct.containsKey(pbe.Product2Id)) {
            priceByProduct.put(pbe.Product2Id, pbe.UnitPrice);
          }
        }
      } catch (Exception e) {
        priceByProduct.clear();
      }
      for (Id pid : pids) {
        Decimal price = priceByProduct.containsKey(pid)
          ? priceByProduct.get(pid)
          : null;
        if (price != null)
          reqCost += reqQtyByProduct.get(pid) * price;
      }
    }

    // 5b. Consumed parts — quantity + cost from ProductConsumed. Same defensive
    // guard: this object is new to the app and may not be readable by the member.
    Decimal consumedQty = 0, consumedCost = 0;
    if (Schema.sObjectType.ProductConsumed.isAccessible()) {
      try {
        for (AggregateResult ar : [
          SELECT SUM(QuantityConsumed) qty, SUM(TotalPrice) amt
          FROM ProductConsumed
          WHERE WorkOrderId IN :woIds
          WITH SECURITY_ENFORCED
        ]) {
          Object q = ar.get('qty');
          Object amt = ar.get('amt');
          if (q != null)
            consumedQty = (Decimal) q;
          if (amt != null)
            consumedCost = (Decimal) amt;
        }
      } catch (Exception e) {
        consumedQty = 0;
        consumedCost = 0;
      }
    }
    setKpiRaw(dto.parts, consumedQty, reqQty);
    setKpiRaw(dto.partsCost, consumedCost, reqCost);

    // 6. Components — child WOs in progress (not New) vs total children.
    setKpi(dto.components, childInProgress, childTotal);

    // 7. Overall — mean of the KPI percentages that have a denominator.
    List<KpiDTO> kpis = new List<KpiDTO>{
      dto.steps,
      dto.measures,
      dto.labour,
      dto.parts,
      dto.partsCost,
      dto.components
    };
    Integer sumPct = 0, n = 0;
    for (KpiDTO k : kpis) {
      if (k.totalRaw != null && k.totalRaw > 0) {
        sumPct += k.percent;
        n++;
      }
    }
    dto.overallPercent = n > 0
      ? (Integer) Math.round(100.0 * sumPct / (100 * n))
      : 0;
    return dto;
  }

  /**
   * Per-work-order progress for every WO under a workpack (RootWorkOrderId), as a
   * JSON array of rows. Rules mirror getWorkpackProgress; colour logic is UI-side.
   * Query count is constant (about 8) regardless of how many children exist.
   */
  @AuraEnabled(cacheable=false)
  public static String getWorkpackChildProgress(
    String token,
    String workpackId
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    List<Map<String, Object>> rows = new List<Map<String, Object>>();
    if (String.isBlank(workpackId))
      return JSON.serialize(rows);
    Id wpId = (Id) workpackId;

    // 1. Child work orders (all depths) + the root's asset.
    List<WorkOrder> wos = [
      SELECT
        Id,
        WorkOrderNumber,
        Subject,
        Status,
        WorkType.Name,
        AssetId,
        Asset.Name
      FROM WorkOrder
      WHERE RootWorkOrderId = :wpId AND Id != :wpId
      WITH SECURITY_ENFORCED
      ORDER BY WorkOrderNumber ASC
    ];
    Set<Id> woIds = new Set<Id>();
    for (WorkOrder w : wos)
      woIds.add(w.Id);
    if (woIds.isEmpty())
      return JSON.serialize(rows);
    List<WorkOrder> rootRows = [
      SELECT AssetId
      FROM WorkOrder
      WHERE Id = :wpId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    Id rootAssetId = rootRows.isEmpty() ? null : rootRows[0].AssetId;

    // 2. Steps per WO, via WorkOrderId or through the WorkPlan (SYSTEM_MODE: WorkPlan OWD is Private).
    Map<Id, Integer> stepsDone = new Map<Id, Integer>();
    Map<Id, Integer> stepsTotal = new Map<Id, Integer>();
    for (
      AggregateResult ar : (List<AggregateResult>) Database.query(
        'SELECT WorkOrderId wo, WorkPlan.WorkOrderId pwo, Status st, COUNT(Id) cnt FROM WorkStep ' +
          'WHERE WorkOrderId IN :woIds OR WorkPlan.WorkOrderId IN :woIds ' +
          'GROUP BY WorkOrderId, WorkPlan.WorkOrderId, Status',
        AccessLevel.SYSTEM_MODE
      )
    ) {
      Id owner = (Id) (ar.get('wo') != null ? ar.get('wo') : ar.get('pwo'));
      if (owner == null || !woIds.contains(owner))
        continue;
      Integer cnt = (Integer) ar.get('cnt');
      stepsTotal.put(
        owner,
        (stepsTotal.containsKey(owner) ? stepsTotal.get(owner) : 0) + cnt
      );
      if ((String) ar.get('st') == 'Completed')
        stepsDone.put(
          owner,
          (stepsDone.containsKey(owner) ? stepsDone.get(owner) : 0) + cnt
        );
    }

    // 3. Measures per WO: total, taken (value recorded OR type other than 'Measure'), findings.
    Map<Id, Integer> mTotal = new Map<Id, Integer>();
    Map<Id, Integer> mTaken = new Map<Id, Integer>();
    Map<Id, Integer> findings = new Map<Id, Integer>();
    for (AggregateResult ar : [
      SELECT
        Work_Order__c wo,
        Measure_Type__c t,
        COUNT(Id) cnt,
        COUNT(Measure_Value__c) withVal
      FROM Measure_Point__c
      WHERE Work_Order__c IN :woIds
      WITH SECURITY_ENFORCED
      GROUP BY Work_Order__c, Measure_Type__c
    ]) {
      Id w = (Id) ar.get('wo');
      String t = (String) ar.get('t');
      Integer cnt = (Integer) ar.get('cnt');
      Integer withVal = (Integer) ar.get('withVal');
      mTotal.put(w, (mTotal.containsKey(w) ? mTotal.get(w) : 0) + cnt);
      Integer taken = (t != null && t != 'Measure') ? cnt : withVal;
      mTaken.put(w, (mTaken.containsKey(w) ? mTaken.get(w) : 0) + taken);
      if (t == 'Attention Required' || t == 'Scrap')
        findings.put(w, (findings.containsKey(w) ? findings.get(w) : 0) + cnt);
    }
    // Comments__c is long text (not filterable/aggregatable): read finding rows only.
    Map<Id, Integer> bare = new Map<Id, Integer>();
    for (Measure_Point__c mp : [
      SELECT Work_Order__c, Comments__c
      FROM Measure_Point__c
      WHERE
        Work_Order__c IN :woIds
        AND Measure_Type__c IN ('Attention Required', 'Scrap')
      WITH SECURITY_ENFORCED
    ]) {
      if (String.isBlank(mp.Comments__c))
        bare.put(
          mp.Work_Order__c,
          (bare.containsKey(mp.Work_Order__c)
            ? bare.get(mp.Work_Order__c)
            : 0) + 1
        );
    }

    // 4. Parts per WO: required vs consumed quantity.
    Map<Id, Decimal> partsReq = new Map<Id, Decimal>();
    for (AggregateResult ar : [
      SELECT ParentRecordId pid, SUM(QuantityRequired) q
      FROM ProductRequired
      WHERE ParentRecordId IN :woIds
      WITH SECURITY_ENFORCED
      GROUP BY ParentRecordId
    ]) {
      if (ar.get('q') != null)
        partsReq.put((Id) ar.get('pid'), (Decimal) ar.get('q'));
    }
    Map<Id, Decimal> partsUsed = new Map<Id, Decimal>();
    if (Schema.sObjectType.ProductConsumed.isAccessible()) {
      try {
        for (AggregateResult ar : [
          SELECT WorkOrderId wid, SUM(QuantityConsumed) q
          FROM ProductConsumed
          WHERE WorkOrderId IN :woIds
          WITH SECURITY_ENFORCED
          GROUP BY WorkOrderId
        ]) {
          if (ar.get('q') != null)
            partsUsed.put((Id) ar.get('wid'), (Decimal) ar.get('q'));
        }
      } catch (Exception e) {
        partsUsed.clear();
      }
    }

    // 5. Level-2 asset: the ancestor whose parent is the workpack's asset.
    Map<Id, Asset> assetById = new Map<Id, Asset>();
    if (rootAssetId != null) {
      for (Asset a : [
        SELECT Id, Name, ParentId
        FROM Asset
        WHERE RootAssetId = :rootAssetId
        WITH SECURITY_ENFORCED
      ]) {
        assetById.put(a.Id, a);
      }
    }

    for (WorkOrder w : wos) {
      Map<String, Object> r = new Map<String, Object>();
      r.put('id', w.Id);
      r.put('number', w.WorkOrderNumber);
      r.put('subject', w.Subject);
      r.put('status', w.Status);
      r.put('workTypeName', w.WorkType == null ? null : w.WorkType.Name);
      r.put('assetId', w.AssetId);
      r.put('assetName', w.Asset == null ? null : w.Asset.Name);
      Id l2Id = null;
      String l2Name = null;
      Id cur = w.AssetId;
      Integer guard = 0;
      while (cur != null && guard < 10) {
        Asset a = assetById.get(cur);
        if (a == null)
          break;
        if (a.ParentId == rootAssetId) {
          l2Id = a.Id;
          l2Name = a.Name;
          break;
        }
        cur = a.ParentId;
        guard++;
      }
      r.put('l2AssetId', l2Id);
      r.put('l2AssetName', l2Name);
      r.put('stepsDone', stepsDone.containsKey(w.Id) ? stepsDone.get(w.Id) : 0);
      r.put(
        'stepsTotal',
        stepsTotal.containsKey(w.Id) ? stepsTotal.get(w.Id) : 0
      );
      r.put('measuresTaken', mTaken.containsKey(w.Id) ? mTaken.get(w.Id) : 0);
      r.put('measuresTotal', mTotal.containsKey(w.Id) ? mTotal.get(w.Id) : 0);
      r.put('findings', findings.containsKey(w.Id) ? findings.get(w.Id) : 0);
      r.put('bareFindings', bare.containsKey(w.Id) ? bare.get(w.Id) : 0);
      r.put('partsUsed', partsUsed.containsKey(w.Id) ? partsUsed.get(w.Id) : 0);
      r.put(
        'partsRequired',
        partsReq.containsKey(w.Id) ? partsReq.get(w.Id) : 0
      );
      rows.add(r);
    }
    return JSON.serialize(rows);
  }

  private static KpiDTO newKpi() {
    KpiDTO k = new KpiDTO();
    k.done = 0;
    k.total = 0;
    k.percent = 0;
    k.doneRaw = 0;
    k.totalRaw = 0;
    return k;
  }

  // Integer-count KPI (steps, measures, components).
  private static void setKpi(KpiDTO k, Integer done, Integer total) {
    k.done = done;
    k.total = total;
    k.doneRaw = done;
    k.totalRaw = total;
    k.percent = pct(done, total);
  }

  // Decimal-magnitude KPI (minutes, quantities, cost). done/total shown rounded.
  private static void setKpiRaw(KpiDTO k, Decimal done, Decimal total) {
    Decimal d = done != null ? done : 0;
    Decimal t = total != null ? total : 0;
    k.doneRaw = d;
    k.totalRaw = t;
    k.done = (Integer) Math.round(d.doubleValue());
    k.total = (Integer) Math.round(t.doubleValue());
    k.percent = pct(d.doubleValue(), t.doubleValue());
  }

  // Clamp a done/total ratio to an integer percent in [0,100].
  private static Integer pct(Double done, Double total) {
    if (total == null || total <= 0)
      return 0;
    Integer p = (Integer) Math.round(100.0 * done / total);
    return p > 100 ? 100 : (p < 0 ? 0 : p);
  }

  // Apply the editable fields from a request onto a WorkOrder (shared by create + update).
  private static void applyTaskFields(WorkOrder wo, CreateTaskRequest req) {
    if (String.isNotBlank(req.subject))
      wo.Subject = req.subject;
    wo.Description = req.description;
    wo.Cause_Codes__c = req.causeCodes;
    wo.Work_Delay_Codes__c = req.workDelayCodes;
    wo.SAP_FLOC_Desc__c = req.component;
    wo.Comment__c = req.comments;
    if (String.isNotBlank(req.priority))
      wo.Priority = req.priority;
    if (String.isNotBlank(req.startDate)) {
      wo.StartDate = (DateTime) JSON.deserialize(
        '"' + req.startDate + '"',
        DateTime.class
      );
    }
    if (req.durationHours != null) {
      wo.Duration = req.durationHours;
      wo.DurationType = 'Hours';
    }
  }

  @AuraEnabled
  public static TaskWoDTO createAssetTask(String token, String reqJson) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    CreateTaskRequest req = (CreateTaskRequest) JSON.deserialize(
      reqJson,
      CreateTaskRequest.class
    );
    if (String.isBlank(req.workOrderId))
      throw new AuraHandledException('MISSING_WORKPACK');

    // Resolve the PM02 work type.
    List<WorkType> types = [
      SELECT Id
      FROM WorkType
      WHERE Name = 'PM02'
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (types.isEmpty())
      throw new AuraHandledException('PM02_WORKTYPE_NOT_FOUND');

    // Pull context off the workpack WO (asset fallback + service territory).
    List<WorkOrder> parents = [
      SELECT Id, AssetId, ServiceTerritoryId
      FROM WorkOrder
      WHERE Id = :req.workOrderId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (parents.isEmpty())
      throw new AuraHandledException('WORKPACK_NOT_FOUND');
    WorkOrder parent = parents[0];

    WorkOrder wo = new WorkOrder();
    wo.WorkTypeId = types[0].Id;
    if (req.raised == true) {
      wo.Raised_Task__c = true;
      if (String.isNotBlank(req.workTypeId))
        wo.WorkTypeId = (Id) req.workTypeId;
    }
    wo.ParentWorkOrderId = req.workOrderId;
    wo.AssetId = String.isNotBlank(req.assetId)
      ? (Id) req.assetId
      : parent.AssetId;
    wo.Status = String.isBlank(req.status) ? 'New' : req.status;
    wo.ServiceTerritoryId = parent.ServiceTerritoryId;
    wo.Subject = String.isBlank(req.subject) ? 'PM02 Task' : req.subject;
    applyTaskFields(wo, req);
    insert wo;

    return mapTask(queryTaskById(wo.Id));
  }

  @AuraEnabled
  public static TaskWoDTO updateAssetTask(String token, String reqJson) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    CreateTaskRequest req = (CreateTaskRequest) JSON.deserialize(
      reqJson,
      CreateTaskRequest.class
    );
    if (String.isBlank(req.id))
      throw new AuraHandledException('MISSING_ID');

    List<WorkOrder> existing = [
      SELECT Id
      FROM WorkOrder
      WHERE Id = :req.id
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (existing.isEmpty())
      throw new AuraHandledException('TASK_NOT_FOUND');

    WorkOrder wo = existing[0];
    if (String.isNotBlank(req.status))
      wo.Status = req.status;
    applyTaskFields(wo, req);
    update wo;

    return mapTask(queryTaskById(req.id));
  }

  @AuraEnabled(cacheable=false)
  public static String getWorkTypes(String token) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    List<Map<String, Object>> out = new List<Map<String, Object>>();
    for (WorkType wt : [
      SELECT Id, Name
      FROM WorkType
      WITH SECURITY_ENFORCED
      ORDER BY Name ASC
      LIMIT 500
    ]) {
      out.add(new Map<String, Object>{ 'id' => wt.Id, 'name' => wt.Name });
    }
    return JSON.serialize(out);
  }

  // Raised tasks (Raised_Task__c = true) on an asset and all its descendants.
  @AuraEnabled(cacheable=false)
  public static List<TaskWoDTO> getRaisedTasks(String token, String assetId) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    List<TaskWoDTO> out = new List<TaskWoDTO>();
    if (String.isBlank(assetId))
      return out;
    Set<Id> assetIds = new Set<Id>{ (Id) assetId };
    Set<Id> frontier = new Set<Id>{ (Id) assetId };
    Integer depth = 0;
    while (!frontier.isEmpty() && depth < 8) {
      Set<Id> next = new Set<Id>();
      for (Asset a : [
        SELECT Id
        FROM Asset
        WHERE ParentId IN :frontier
        WITH SECURITY_ENFORCED
      ]) {
        if (assetIds.add(a.Id))
          next.add(a.Id);
      }
      frontier = next;
      depth++;
    }
    List<WorkOrder> rows = (List<WorkOrder>) Database.query(
      'SELECT ' +
        TASK_FIELDS +
        ' FROM WorkOrder WHERE Raised_Task__c = true AND AssetId IN :assetIds ' +
        'WITH SECURITY_ENFORCED ORDER BY CreatedDate DESC LIMIT 200'
    );
    for (WorkOrder w : rows)
      out.add(mapTask(w));
    return out;
  }

  // ---- Kiosk config (supervisor/admin only to save) ----

  private static final String CONFIG_NAME = 'Default';

  @AuraEnabled(cacheable=false)
  public static String getKioskConfig(String token) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    List<Kiosk_App_Config__c> rows = [
      SELECT Settings_JSON__c
      FROM Kiosk_App_Config__c
      WHERE Name = :CONFIG_NAME
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (rows.isEmpty() || String.isBlank(rows[0].Settings_JSON__c))
      return '{}';
    return rows[0].Settings_JSON__c;
  }

  @AuraEnabled(cacheable=false)
  public static void saveKioskConfig(String token, String settingsJson) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    if (!isAdminWorker(payload.workerId))
      throw new AuraHandledException('NOT_ALLOWED');
    Object parsed;
    try {
      parsed = JSON.deserializeUntyped(settingsJson);
    } catch (Exception e) {
      throw new AuraHandledException('INVALID_CONFIG_JSON');
    }
    if (!(parsed instanceof Map<String, Object>))
      throw new AuraHandledException('INVALID_CONFIG_JSON');
    List<Kiosk_App_Config__c> rows = [
      SELECT Id
      FROM Kiosk_App_Config__c
      WHERE Name = :CONFIG_NAME
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    Kiosk_App_Config__c cfg = rows.isEmpty()
      ? new Kiosk_App_Config__c(Name = CONFIG_NAME)
      : rows[0];
    cfg.Settings_JSON__c = settingsJson;
    upsert cfg;
  }

  private static Boolean isAdminWorker(String workerId) {
    if (String.isBlank(workerId))
      return false;
    List<ServiceResource> srs = [
      SELECT Role__c
      FROM ServiceResource
      WHERE Id = :workerId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (srs.isEmpty() || srs[0].Role__c == null)
      return false;
    String r = srs[0].Role__c.trim().toLowerCase();
    return r == 'supervisor' || r == 'admin';
  }

  // ---- Workpack time records (workpack + all descendants) ----

  @AuraEnabled(cacheable=false)
  public static String getWorkpackTimeRecords(String token, String workpackId) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    List<TimeReportRow> out = new List<TimeReportRow>();
    if (String.isBlank(workpackId))
      return JSON.serialize(out);
    Id wpId = (Id) workpackId;
    for (Time_Report__c tr : [
      SELECT
        Id,
        Work_Order__c,
        Work_Order__r.WorkOrderNumber,
        Resource_Name__c,
        Start_Time__c,
        End_Time__c,
        Duration_in_Minutes__c,
        Status__c,
        Description__c
      FROM Time_Report__c
      WHERE Work_Order__c = :wpId OR Work_Order__r.RootWorkOrderId = :wpId
      WITH SECURITY_ENFORCED
      ORDER BY Start_Time__c DESC
      LIMIT 200
    ]) {
      TimeReportRow r = new TimeReportRow();
      r.id = tr.Id;
      r.workOrderId = tr.Work_Order__c;
      r.workOrderNumber = tr.Work_Order__r == null
        ? null
        : tr.Work_Order__r.WorkOrderNumber;
      r.resourceName = tr.Resource_Name__c;
      r.startTime = tr.Start_Time__c == null
        ? null
        : tr.Start_Time__c.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'');
      r.endTime = tr.End_Time__c == null
        ? null
        : tr.End_Time__c.formatGmt('yyyy-MM-dd\'T\'HH:mm:ss.SSS\'Z\'');
      r.durationMinutes = tr.Duration_in_Minutes__c == null
        ? null
        : Integer.valueOf(tr.Duration_in_Minutes__c);
      r.isActive = tr.End_Time__c == null;
      r.status = tr.Status__c;
      r.description = tr.Description__c;
      out.add(r);
    }
    return JSON.serialize(out);
  }

  // ---- Workpack header tile values (configurable field list, spec wpTile) ----

  // Whitelist of WorkOrder fields the config may show (matches kioskConfigDefaults WO_FIELDS).
  private static final Map<String, String> WO_TILE_FIELDS = new Map<String, String>{
    'WorkOrderNumber' => 'WorkOrderNumber',
    'WorkType' => 'WorkType.Name',
    'Status' => 'Status',
    'Priority' => 'Priority',
    'StartDate' => 'StartDate',
    'SAP_FLOC_Desc__c' => 'SAP_FLOC_Desc__c',
    'SAP_Work_Center__c' => 'SAP_Work_Center__c',
    'Est_Labour_Hours__c' => 'Est_Labour_Hours__c',
    'Est_Parts_Cost__c' => 'Est_Parts_Cost__c',
    'Critical_Path__c' => 'Critical_Path__c',
    'Shut_Scope__c' => 'Shut_Scope__c',
    'Basic_Finish_Date__c' => 'Basic_Finish_Date__c'
  };

  /**
   * Returns a JSON object {configKey: displayValue} for the requested tile fields on one WO.
   * Field names are checked against WO_TILE_FIELDS; unknown names are ignored.
   * Fields the running user cannot read (or that this org lacks) are skipped, never an error.
   */
  @AuraEnabled(cacheable=false)
  public static String getWorkOrderTile(
    String token,
    String workOrderId,
    String fieldsJson
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    Map<String, Object> out = new Map<String, Object>();
    if (String.isBlank(workOrderId) || String.isBlank(fieldsJson))
      return JSON.serialize(out);
    Id woId = (Id) workOrderId;
    List<String> wanted = new List<String>();
    for (Object o : (List<Object>) JSON.deserializeUntyped(fieldsJson)) {
      String k = String.valueOf(o);
      if (WO_TILE_FIELDS.containsKey(k) && !wanted.contains(k))
        wanted.add(k);
    }
    if (wanted.isEmpty())
      return JSON.serialize(out);
    List<String> paths = new List<String>();
    for (String k : wanted)
      paths.add(WO_TILE_FIELDS.get(k));
    List<WorkOrder> rows;
    try {
      rows = (List<WorkOrder>) Database.query(
        'SELECT ' +
          String.join(paths, ',') +
          ' FROM WorkOrder WHERE Id = :woId WITH SECURITY_ENFORCED LIMIT 1'
      );
    } catch (Exception e) {
      return JSON.serialize(out);
    }
    if (rows.isEmpty())
      return JSON.serialize(out);
    WorkOrder wo = rows[0];
    for (String k : wanted) {
      Object v;
      if (k == 'WorkType')
        v = wo.WorkType == null ? null : wo.WorkType.Name;
      else
        v = wo.get(WO_TILE_FIELDS.get(k));
      if (v == null)
        continue;
      if (v instanceof Boolean)
        out.put(k, ((Boolean) v) ? 'Yes' : 'No');
      else if (v instanceof Date)
        out.put(k, ((Date) v).format());
      else if (v instanceof Datetime)
        out.put(k, ((Datetime) v).format('dd MMM yyyy HH:mm'));
      else
        out.put(k, String.valueOf(v));
    }
    return JSON.serialize(out);
  }

  // Query a single PM02 task work order with the full field projection, typed as WorkOrder.
  private static WorkOrder queryTaskById(Id taskId) {
    List<WorkOrder> rows = (List<WorkOrder>) Database.query(
      'SELECT ' +
        TASK_FIELDS +
        ' FROM WorkOrder WHERE Id = :taskId WITH SECURITY_ENFORCED LIMIT 1'
    );
    return rows[0];
  }

  @AuraEnabled
  public static void updateAssetSerial(
    String token,
    String assetId,
    String serialNumber
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    if (String.isBlank(assetId))
      throw new AuraHandledException('MISSING_ID');

    List<Asset> assets = [
      SELECT Id
      FROM Asset
      WHERE Id = :assetId
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (assets.isEmpty())
      throw new AuraHandledException('NO_ASSET');
    Asset a = assets[0];
    a.SerialNumber = serialNumber;
    update a;
  }

  @AuraEnabled(cacheable=false)
  public static List<WorkOrderAttachment> getWorkOrderAttachments(
    String token,
    String workOrderId
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');

    // Metadata only. Content is fetched lazily, one file at a time, via
    // getAttachmentContent — files <=4MB come back as a base64 data URI for
    // inline pdf.js annotation; larger files are flagged tooLarge and opened
    // view-only in a new tab (the browser's member session reads them there,
    // which Apex can't inline past the 6M-char String limit).
    List<ContentDocumentLink> links = [
      SELECT
        ContentDocumentId,
        ContentDocument.Title,
        ContentDocument.FileExtension,
        ContentDocument.ContentSize
      FROM ContentDocumentLink
      WHERE LinkedEntityId = :workOrderId
      WITH SECURITY_ENFORCED
      ORDER BY ContentDocument.CreatedDate DESC
    ];

    List<WorkOrderAttachment> result = new List<WorkOrderAttachment>();
    for (ContentDocumentLink cdl : links) {
      WorkOrderAttachment att = new WorkOrderAttachment();
      att.contentDocumentId = cdl.ContentDocumentId;
      att.title = cdl.ContentDocument.Title;
      att.fileExtension = cdl.ContentDocument.FileExtension;
      att.contentSize = cdl.ContentDocument.ContentSize;
      att.tooLarge = (cdl.ContentDocument.ContentSize != null &&
      cdl.ContentDocument.ContentSize > ATTACHMENT_MAX_BYTES);
      result.add(att);
    }
    return result;
  }

  /**
   * Returns one attachment's content as a base64 data URI for inline viewing.
   * Files above ATTACHMENT_MAX_BYTES can't be inlined (Apex 6M-char String
   * limit) — they come back with tooLarge=true and no dataUri; the UI opens
   * those view-only in a new tab instead.
   */
  @AuraEnabled(cacheable=false)
  public static AttachmentContent getAttachmentContent(
    String token,
    String contentDocumentId
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    if (String.isBlank(contentDocumentId))
      throw new AuraHandledException('INVALID_REQUEST');
    return readAttachmentContent(contentDocumentId);
  }

  /**
   * Returns a PDF linked to the workpack (or to any work order under it) for the
   * side-by-side measure viewer. Blank contentDocumentId picks the newest PDF on
   * the workpack. Same 4MB inline cap as getAttachmentContent.
   */
  @AuraEnabled(cacheable=false)
  public static AttachmentContent getMeasurePdf(
    String token,
    String workpackId,
    String contentDocumentId
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null)
      throw new AuraHandledException('SESSION_EXPIRED');
    if (String.isBlank(workpackId))
      throw new AuraHandledException('INVALID_REQUEST');

    Id wpId = (Id) workpackId;
    Set<Id> scopeIds = new Set<Id>{ wpId };
    for (WorkOrder w : [
      SELECT Id
      FROM WorkOrder
      WHERE RootWorkOrderId = :wpId
      WITH SECURITY_ENFORCED
    ]) {
      scopeIds.add(w.Id);
    }

    String docId = contentDocumentId;
    if (String.isBlank(docId)) {
      List<ContentDocumentLink> newest = [
        SELECT ContentDocumentId
        FROM ContentDocumentLink
        WHERE LinkedEntityId = :wpId AND ContentDocument.FileType = 'PDF'
        WITH SECURITY_ENFORCED
        ORDER BY ContentDocument.CreatedDate DESC
        LIMIT 1
      ];
      if (newest.isEmpty())
        throw new AuraHandledException('NOT_FOUND');
      docId = newest[0].ContentDocumentId;
    } else {
      List<ContentDocumentLink> linked = [
        SELECT Id
        FROM ContentDocumentLink
        WHERE ContentDocumentId = :docId AND LinkedEntityId IN :scopeIds
        WITH SECURITY_ENFORCED
        LIMIT 1
      ];
      if (linked.isEmpty())
        throw new AuraHandledException('NOT_ALLOWED');
    }
    AttachmentContent out = readAttachmentContent(docId);
    out.documentId = docId;
    return out;
  }

  private static AttachmentContent readAttachmentContent(
    String contentDocumentId
  ) {
    List<ContentVersion> versions = [
      SELECT FileExtension, VersionData, ContentSize
      FROM ContentVersion
      WHERE ContentDocumentId = :contentDocumentId AND IsLatest = TRUE
      WITH SECURITY_ENFORCED
      LIMIT 1
    ];
    if (versions.isEmpty())
      throw new AuraHandledException('NOT_FOUND');
    ContentVersion cv = versions[0];

    AttachmentContent out = new AttachmentContent();
    out.tooLarge = false;

    if (cv.ContentSize != null && cv.ContentSize > ATTACHMENT_MAX_BYTES) {
      out.tooLarge = true;
      return out;
    }
    if (cv.VersionData == null)
      throw new AuraHandledException('NOT_FOUND');

    String ext = (cv.FileExtension == null)
      ? ''
      : cv.FileExtension.toLowerCase();
    String mime = (ext == 'pdf')
      ? 'application/pdf'
      : (ext == 'jpg')
          ? 'image/jpeg'
          : (ext == 'png' ||
              ext == 'gif' ||
              ext == 'bmp' ||
              ext == 'webp')
              ? ('image/' + ext)
              : 'application/octet-stream';

    out.dataUri =
      'data:' +
      mime +
      ';base64,' +
      EncodingUtil.base64Encode(cv.VersionData);
    return out;
  }

  @AuraEnabled(cacheable=false)
  public static String uploadAnnotatedPdf(
    String token,
    String workOrderId,
    String title,
    String base64Data
  ) {
    TokenPayload payload = validateToken(token);
    if (payload == null) {
      AuraHandledException ex = new AuraHandledException('SESSION_EXPIRED');
      ex.setMessage('SESSION_EXPIRED');
      throw ex;
    }
    if (String.isBlank(workOrderId) || String.isBlank(base64Data)) {
      AuraHandledException ex = new AuraHandledException(
        'INVALID_REQUEST: missing workOrderId or base64Data'
      );
      ex.setMessage('INVALID_REQUEST: missing workOrderId or base64Data');
      throw ex;
    }

    String cleanTitle = String.isBlank(title) ? 'Annotated PDF' : title;
    if (!cleanTitle.toLowerCase().endsWith('.pdf'))
      cleanTitle += '.pdf';

    try {
      ContentVersion cv = new ContentVersion();
      cv.Title = cleanTitle;
      cv.PathOnClient = cleanTitle;
      cv.VersionData = EncodingUtil.base64Decode(base64Data);
      cv.IsMajorVersion = true;
      insert cv;

      ContentVersion inserted = [
        SELECT ContentDocumentId
        FROM ContentVersion
        WHERE Id = :cv.Id
        LIMIT 1
      ];

      ContentDocumentLink link = new ContentDocumentLink();
      link.ContentDocumentId = inserted.ContentDocumentId;
      link.LinkedEntityId = workOrderId;
      link.ShareType = 'V';
      link.Visibility = 'AllUsers';
      insert link;

      return inserted.ContentDocumentId;
    } catch (DmlException e) {
      String detail =
        'DML_FAILED: ' +
        (e.getNumDml() > 0 ? e.getDmlMessage(0) : e.getMessage());
      AuraHandledException ex = new AuraHandledException(detail);
      ex.setMessage(detail);
      throw ex;
    } catch (Exception e) {
      AuraHandledException ex = new AuraHandledException(
        'UPLOAD_FAILED: ' + e.getTypeName() + ' — ' + e.getMessage()
      );
      ex.setMessage(
        'UPLOAD_FAILED: ' + e.getTypeName() + ' — ' + e.getMessage()
      );
      throw ex;
    }
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private static String getWorkerName(String workerId) {
    List<ServiceResource> srs = [
      SELECT Name
      FROM ServiceResource
      WHERE Id = :workerId
      LIMIT 1
    ];
    return srs.isEmpty() ? workerId : srs[0].Name;
  }

  private static String getKioskNotes(String territoryId) {
    try {
      List<ServiceTerritory> territories = [
        SELECT Kiosk_Notes__c
        FROM ServiceTerritory
        WHERE Id = :territoryId
        WITH SECURITY_ENFORCED
        LIMIT 1
      ];
      return territories.isEmpty() ? null : territories[0].Kiosk_Notes__c;
    } catch (System.QueryException e) {
      return null;
    }
  }

  private class TokenPayload {
    public String workerId;
    public String territoryId;
    public Long expiryMs;
    public Long issuedAtMs;
  }

  private static String issueToken(
    String workerId,
    String territoryId,
    DateTime issuedAt
  ) {
    Long issuedAtMs = issuedAt.getTime();
    Long expiryMs = issuedAt.addMinutes(TOKEN_TTL_MINUTES).getTime();
    String payload =
      workerId +
      '|' +
      territoryId +
      '|' +
      expiryMs +
      '|' +
      issuedAtMs;
    String sig = computeHmac(payload);
    return EncodingUtil.base64Encode(Blob.valueOf(payload + '|' + sig));
  }

  /** Public guard for other kiosk classes: true when the session token is valid. */
  public static Boolean isValidSession(String token) {
    return validateToken(token) != null;
  }

  private static TokenPayload validateToken(String token) {
    if (String.isBlank(token))
      return null;
    try {
      String decoded = EncodingUtil.base64Decode(token).toString();
      List<String> parts = decoded.split('\\|');
      if (parts.size() != 5)
        return null;
      String payload =
        parts[0] +
        '|' +
        parts[1] +
        '|' +
        parts[2] +
        '|' +
        parts[3];
      if (!constantTimeEquals(parts[4], computeHmac(payload)))
        return null;
      Long expiryMs = Long.valueOf(parts[2]);
      if (DateTime.now().getTime() > expiryMs)
        return null;
      TokenPayload p = new TokenPayload();
      p.workerId = parts[0];
      p.territoryId = parts[1];
      p.expiryMs = expiryMs;
      p.issuedAtMs = Long.valueOf(parts[3]);
      return p;
    } catch (Exception e) {
      return null;
    }
  }

  private static String computeHmac(String payload) {
    Blob mac = Crypto.generateMac(
      'hmacSHA256',
      Blob.valueOf(payload),
      Blob.valueOf(HMAC_KEY)
    );
    return EncodingUtil.base64Encode(mac);
  }

  private static Boolean constantTimeEquals(String a, String b) {
    if (a == null || b == null)
      return false;
    Blob aBlob = EncodingUtil.base64Decode(
      Math.mod(a.length(), 4) == 0 ? a : a + '=='
    );
    Blob bBlob = EncodingUtil.base64Decode(
      Math.mod(b.length(), 4) == 0 ? b : b + '=='
    );
    String aHex = EncodingUtil.convertToHex(aBlob);
    String bHex = EncodingUtil.convertToHex(bBlob);
    if (aHex.length() != bHex.length())
      return false;
    Integer diff = 0;
    for (Integer i = 0; i < aHex.length(); i++) {
      diff = diff | (aHex.charAt(i) ^ bHex.charAt(i));
    }
    return diff == 0;
  }

  private static Boolean verifyPin(
    String enteredPin,
    String salt,
    String storedHash
  ) {
    if (String.isBlank(salt) || String.isBlank(storedHash))
      return false;
    Blob key = EncodingUtil.base64Decode(salt);
    Blob mac = Crypto.generateMac('hmacSHA256', Blob.valueOf(enteredPin), key);
    return constantTimeEquals(EncodingUtil.base64Encode(mac), storedHash);
  }

  // Returns 'SALT||HASH' using || as delimiter (base64 never contains ||)
  @AuraEnabled
  public static String hashPin(String pin) {
    Blob saltBlob = Crypto.generateAesKey(128);
    String salt = EncodingUtil.base64Encode(saltBlob);
    Blob mac = Crypto.generateMac('hmacSHA256', Blob.valueOf(pin), saltBlob);
    return salt + '||' + EncodingUtil.base64Encode(mac);
  }
}
