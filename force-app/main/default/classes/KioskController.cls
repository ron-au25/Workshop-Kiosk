public with sharing class KioskController {

    private static final Integer PIN_MAX_FAILURES = 5;
    private static final Integer PIN_LOCKOUT_MINUTES = 15;
    private static final Integer TOKEN_TTL_MINUTES = 15;
    private static final Integer TOKEN_MAX_HOURS = 8;
    private static final String HMAC_KEY = 'KioskHmacKey2026RioTintoRail!';

    // ─── DTOs ────────────────────────────────────────────────────────────────

    public class SupervisorContext {
        @AuraEnabled public String territoryId;
        @AuraEnabled public String territoryName;
        @AuraEnabled public String supervisorName;
        @AuraEnabled public String kioskNotes;
        @AuraEnabled public Boolean isSupervisor;
        @AuraEnabled public Boolean isGuest;
        @AuraEnabled public String siteBaseUrl;
    }

    public class RosterMember {
        @AuraEnabled public String resourceId;
        @AuraEnabled public String name;
        @AuraEnabled public String role;
        @AuraEnabled public String ganttLabel;
        @AuraEnabled public String photoUrl;
        @AuraEnabled public String employeeId;
        @AuraEnabled public Boolean isLocked;
        @AuraEnabled public Long lockedUntilMs;
    }

    public class EmployeeSession {
        @AuraEnabled public Boolean success;
        @AuraEnabled public String token;
        @AuraEnabled public String workerId;
        @AuraEnabled public String workerName;
        @AuraEnabled public String errorCode;
        @AuraEnabled public Integer remainingAttempts;
        @AuraEnabled public Long lockedUntilMs;
    }

    public class DashboardMetrics {
        @AuraEnabled public Integer openCount;
        @AuraEnabled public Integer inProgressCount;
        @AuraEnabled public Integer completedCount;
        @AuraEnabled public Integer criticalCount;
        @AuraEnabled public Integer totalDurationMinutes;     // planned hours (sum of WO DurationInMinutes)
        @AuraEnabled public Integer totalActualMinutes;       // actual time logged in Time_Report__c
        @AuraEnabled public String kioskNotes;
        @AuraEnabled public List<DonutSlice> workTypeBreakdown;
        @AuraEnabled public List<CriticalJob> topCriticalJobs;
    }

    public class DonutSlice {
        @AuraEnabled public String label;
        @AuraEnabled public Integer count;
    }

    public class CriticalJob {
        @AuraEnabled public String woNumber;
        @AuraEnabled public String subject;
        @AuraEnabled public String wagonNumber;
        @AuraEnabled public String status;
    }

    public class WorkOrderPage {
        @AuraEnabled public List<WorkOrderCard> records;
        @AuraEnabled public Integer totalCount;
        @AuraEnabled public Boolean hasMore;
        @AuraEnabled public String debugFilter;
    }

    public class WorkOrderCard {
        @AuraEnabled public String id;
        @AuraEnabled public String woNumber;
        @AuraEnabled public String subject;
        @AuraEnabled public String status;
        @AuraEnabled public String priority;
        @AuraEnabled public String workTypeName;
        @AuraEnabled public String wagonNumber;
        @AuraEnabled public String assetName;
        @AuraEnabled public String flocDesc;
        @AuraEnabled public String sapWorkCenter;
        @AuraEnabled public String externalId;
        @AuraEnabled public Integer durationMinutes;
        @AuraEnabled public String schedStart;
        @AuraEnabled public String schedEnd;
        @AuraEnabled public String serviceAppointmentId;
    }

    public class WorkOrderFilter {
        @AuraEnabled public String status;
        @AuraEnabled public String priority;
        @AuraEnabled public String wagonSearch;
        @AuraEnabled public String dateFrom;   // ISO date string yyyy-MM-dd
        @AuraEnabled public String dateTo;     // ISO date string yyyy-MM-dd
        @AuraEnabled public Integer pageSize;
        @AuraEnabled public Integer pageOffset;
    }

    public class WorkOrderDetail {
        @AuraEnabled public String id;
        @AuraEnabled public String woNumber;
        @AuraEnabled public String subject;
        @AuraEnabled public String description;
        @AuraEnabled public String parentWorkOrderId;
        @AuraEnabled public String parentWoNumber;
        @AuraEnabled public String parentSubject;
        @AuraEnabled public String status;
        @AuraEnabled public String priority;
        @AuraEnabled public String workTypeName;
        @AuraEnabled public String wagonNumber;
        @AuraEnabled public String assetName;
        @AuraEnabled public String flocDesc;
        @AuraEnabled public String sapWorkCenter;
        @AuraEnabled public String externalId;
        @AuraEnabled public Integer durationMinutes;
        @AuraEnabled public String supervisorNotes;
        @AuraEnabled public String causeCodes;
        @AuraEnabled public String workDelayCodes;
        @AuraEnabled public String damageCodes;
        @AuraEnabled public List<WorkPlanDTO> workPlans;
        @AuraEnabled public List<LineItemDTO> lineItems;
        @AuraEnabled public List<WorkOrderCard> childWorkOrders;
        @AuraEnabled public TimeReportDTO activeTimeReport;
        @AuraEnabled public List<TimeReportDTO> timeReports;
    }

    public class LineItemDTO {
        @AuraEnabled public String id;
        @AuraEnabled public String subject;
        @AuraEnabled public String description;
        @AuraEnabled public Decimal duration;
    }

    public class WorkPlanDTO {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public Integer executionOrder;
        @AuraEnabled public List<WorkStepDTO> steps;
    }

    public class WorkStepDTO {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String status;
        @AuraEnabled public Integer executionOrder;
        @AuraEnabled public String description;
        @AuraEnabled public String actionType;
        @AuraEnabled public String actionDefinition;
    }

    public class TimeReportDTO {
        @AuraEnabled public String id;
        @AuraEnabled public String startTime;
        @AuraEnabled public String endTime;
        @AuraEnabled public Integer durationMinutes;
        @AuraEnabled public String description;
        @AuraEnabled public Boolean isActive;
        @AuraEnabled public String resourceName;
    }

    public class TimeTrackingDashboard {
        @AuraEnabled public Integer totalRecords;
        @AuraEnabled public Integer totalMinutes;
        @AuraEnabled public Integer activeCount;
        @AuraEnabled public List<EmployeeSummary> byEmployee;
        @AuraEnabled public List<DayBucket> byDay;
        @AuraEnabled public List<TimeReportRow> rows;
    }

    public class EmployeeSummary {
        @AuraEnabled public String name;
        @AuraEnabled public Integer minutes;
        @AuraEnabled public Integer count;
    }

    public class DayBucket {
        @AuraEnabled public String dateLabel;   // yyyy-MM-dd
        @AuraEnabled public List<EmployeeMinutes> employees;
    }

    public class EmployeeMinutes {
        @AuraEnabled public String name;
        @AuraEnabled public Integer minutes;
    }

    public class TimeReportRow {
        @AuraEnabled public String id;
        @AuraEnabled public String workOrderId;
        @AuraEnabled public String workOrderNumber;
        @AuraEnabled public String resourceName;
        @AuraEnabled public String startTime;
        @AuraEnabled public String endTime;
        @AuraEnabled public Integer durationMinutes;
        @AuraEnabled public Integer plannedMinutes;
        @AuraEnabled public Boolean isActive;
        @AuraEnabled public String validationFlag;  // '', 'SHORT', 'LONG', 'VARIANCE'
    }

    public class SaveNotesRequest {
        @AuraEnabled public String workOrderId;
        @AuraEnabled public String supervisorNotes;
        @AuraEnabled public String causeCodes;
        @AuraEnabled public String workDelayCodes;
        @AuraEnabled public String damageCodes;
    }

    public class MeasurePointDTO {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String componentName;
        @AuraEnabled public String measureType;      // Attention Required / Measure / OK
        @AuraEnabled public String comments;
        @AuraEnabled public String reviewNotes;
        @AuraEnabled public Decimal measureValue;
        @AuraEnabled public String measureValueType; // Temperature / Pressure / Level / Width / Length
        @AuraEnabled public String createdDate;
    }

    public class WorkOrderAttachment {
        @AuraEnabled public String contentDocumentId;
        @AuraEnabled public String title;
        @AuraEnabled public String fileExtension;
        @AuraEnabled public String downloadUrl;
    }

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
            WHERE ServiceResourceId = :sr.Id
              AND (EffectiveEndDate = NULL OR EffectiveEndDate >= TODAY)
            WITH SECURITY_ENFORCED
            ORDER BY TerritoryType ASC
            LIMIT 5
        ];

        ServiceTerritoryMember primary;
        for (ServiceTerritoryMember m : memberships) {
            if (m.TerritoryType == 'P') { primary = m; break; }
        }
        if (primary == null && !memberships.isEmpty()) primary = memberships[0];

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
        if (String.isBlank(territoryId)) throw new AuraHandledException('territoryId is required');

        List<ServiceTerritoryMember> members = [
            SELECT ServiceResourceId, ServiceResource.Name, ServiceResource.Role__c,
                   ServiceResource.FSL__GanttLabel__c,
                   ServiceResource.IsActive, ServiceResource.PIN_Locked_Until__c,
                   ServiceResource.PIN_Failed_Count__c, ServiceResource.Employee_Id__c,
                   ServiceResource.RelatedRecordId
            FROM ServiceTerritoryMember
            WHERE ServiceTerritoryId = :territoryId
              AND ServiceResource.IsActive = TRUE
              AND ServiceResource.ResourceType = 'T'
              AND (EffectiveEndDate = NULL OR EffectiveEndDate >= TODAY)
            WITH SECURITY_ENFORCED
            ORDER BY ServiceResource.Name ASC
            LIMIT 200
        ];

        // Resolve photo URLs from User records (RelatedRecordId)
        Set<Id> userIds = new Set<Id>();
        for (ServiceTerritoryMember m : members) {
            if (m.ServiceResource.RelatedRecordId != null) userIds.add(m.ServiceResource.RelatedRecordId);
        }
        Map<Id, String> userPhotoUrls = new Map<Id, String>();
        if (!userIds.isEmpty()) {
            for (User u : [SELECT Id, MediumPhotoUrl, SmallPhotoUrl FROM User WHERE Id IN :userIds]) {
                String url = String.isNotBlank(u.MediumPhotoUrl) ? u.MediumPhotoUrl : u.SmallPhotoUrl;
                if (String.isNotBlank(url)) userPhotoUrls.put(u.Id, url);
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
            rm.photoUrl = sr.RelatedRecordId != null ? userPhotoUrls.get(sr.RelatedRecordId) : null;
            Boolean locked = sr.PIN_Locked_Until__c != null && sr.PIN_Locked_Until__c > now;
            rm.isLocked = locked;
            rm.lockedUntilMs = locked ? sr.PIN_Locked_Until__c.getTime() : null;
            roster.add(rm);
        }
        return roster;
    }

    // ─── Employee validation ──────────────────────────────────────────────────

    @AuraEnabled
    public static EmployeeSession validateEmployee(String territoryId, String employeeId, String pin) {
        if (String.isBlank(territoryId) || String.isBlank(employeeId) || String.isBlank(pin)) {
            EmployeeSession fail = new EmployeeSession();
            fail.success = false;
            fail.errorCode = 'MISSING_FIELDS';
            return fail;
        }

        List<ServiceResource> matches = [
            SELECT Id, Name, PIN_Hash__c, PIN_Salt__c, PIN_Failed_Count__c, PIN_Locked_Until__c,
                   Employee_Id__c
            FROM ServiceResource
            WHERE Employee_Id__c = :employeeId AND IsActive = TRUE
            WITH SECURITY_ENFORCED
            LIMIT 2
        ];

        EmployeeSession result = new EmployeeSession();

        if (matches.isEmpty()) { result.success = false; result.errorCode = 'NOT_FOUND'; return result; }
        if (matches.size() > 1) { result.success = false; result.errorCode = 'DUPLICATE_ID'; return result; }

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
            Integer failCount = (sr.PIN_Failed_Count__c == null ? 0 : (Integer)sr.PIN_Failed_Count__c) + 1;
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
        result.token = issueToken(sr.Id, territoryId, now);
        return result;
    }

    // ─── Work orders (resource-scoped via SA assignments) ────────────────────

    @AuraEnabled(cacheable=false)
    public static WorkOrderPage getWorkOrders(String token, String filterJson) {
        TokenPayload payload = validateToken(token);
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');
        WorkOrderFilter filter = String.isBlank(filterJson)
            ? new WorkOrderFilter()
            : (WorkOrderFilter) JSON.deserialize(filterJson, WorkOrderFilter.class);

        System.debug('>>> getWorkOrders filter: status=' + filter.status + ' priority=' + filter.priority + ' dateFrom=' + filter.dateFrom + ' dateTo=' + filter.dateTo + ' wagonSearch=' + filter.wagonSearch + ' pageSize=' + filter.pageSize + ' pageOffset=' + filter.pageOffset);

        // Default date range = today
        Date fromDate = filter.dateFrom != null ? Date.valueOf(filter.dateFrom) : Date.today();
        Date toDate   = filter.dateTo   != null ? Date.valueOf(filter.dateTo)   : Date.today();
        // Extend toDate to end-of-day by using next day in datetime comparison
        DateTime fromDt = DateTime.newInstance(fromDate, Time.newInstance(0,0,0,0));
        DateTime toDt   = DateTime.newInstance(toDate.addDays(1), Time.newInstance(0,0,0,0));

        String workerId = payload.workerId;

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
            WHERE ServiceResourceId = :workerId
              AND (EndDate = NULL OR EndDate >= :DateTime.now())
            WITH USER_MODE
        ];
        if (!crewMemberships.isEmpty()) {
            Set<Id> crewIds = new Set<Id>();
            for (ServiceCrewMember scm : crewMemberships) crewIds.add(scm.ServiceCrewId);
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
        Map<Id, ServiceAppointment> saMap = new Map<Id, ServiceAppointment>([
            SELECT Id, ParentRecordId, ParentRecordType, SchedStartTime, SchedEndTime
            FROM ServiceAppointment
            WHERE Id IN :candidateSaIds
              AND ParentRecordType = 'WorkOrder'
              AND SchedStartTime >= :fromDt
              AND SchedStartTime < :toDt
            WITH USER_MODE
        ]);

        Set<Id> woIds = new Set<Id>();
        for (ServiceAppointment sa : saMap.values()) {
            if (sa.ParentRecordId != null) woIds.add(sa.ParentRecordId);
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

        Integer pageSize   = (filter.pageSize   != null && filter.pageSize   > 0) ? Math.min(filter.pageSize, 50) : 50;
        Integer pageOffset = (filter.pageOffset != null && filter.pageOffset >= 0) ? filter.pageOffset : 0;

        System.debug('>>> baseWhere: ' + baseWhere + ' | binds keys: ' + binds.keySet());

        Integer total = Database.countQueryWithBinds(
            'SELECT COUNT() FROM WorkOrder WHERE ' + baseWhere, binds, AccessLevel.SYSTEM_MODE
        );

        System.debug('>>> total count: ' + total);

        Map<String, Object> queryBinds = new Map<String, Object>(binds);
        queryBinds.put('pageSize', pageSize);
        queryBinds.put('pageOffset', pageOffset);

        List<WorkOrder> raw = Database.queryWithBinds(
            'SELECT Id, WorkOrderNumber, Subject, Status, Priority, WorkTypeId, WorkType.Name, '
            + 'Wagon_Number__c, Asset.Name, SAP_FLOC_Desc__c, SAP_Work_Center__c, External_ID__c, '
            + 'DurationInMinutes '
            + 'FROM WorkOrder WHERE ' + baseWhere
            + ' ORDER BY Priority ASC, CreatedDate DESC LIMIT :pageSize OFFSET :pageOffset',
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
            c.durationMinutes = wo.DurationInMinutes != null ? (Integer)wo.DurationInMinutes : null;
            ServiceAppointment sa = saByWo.get(wo.Id);
            if (sa != null) {
                c.schedStart = sa.SchedStartTime != null ? String.valueOf(sa.SchedStartTime) : null;
                c.schedEnd   = sa.SchedEndTime   != null ? String.valueOf(sa.SchedEndTime)   : null;
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

    // ─── Work order detail ────────────────────────────────────────────────────

    @AuraEnabled(cacheable=false)
    public static WorkOrderDetail getWorkOrderDetail(String token, String workOrderId) {
        TokenPayload payload = validateToken(token);
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');

        List<WorkOrder> wos = [
            SELECT Id, WorkOrderNumber, Subject, Description, Status, Priority, WorkTypeId, WorkType.Name,
                   Wagon_Number__c, Asset.Name, SAP_FLOC_Desc__c, SAP_Work_Center__c, External_ID__c,
                   DurationInMinutes, Supervisor_Notes__c, Cause_Codes__c, Work_Delay_Codes__c,
                   Damage_Codes__c, ParentWorkOrderId, ParentWorkOrder.WorkOrderNumber, ParentWorkOrder.Subject
            FROM WorkOrder WHERE Id = :workOrderId
            WITH SECURITY_ENFORCED LIMIT 1
        ];
        if (wos.isEmpty()) throw new AuraHandledException('WORK_ORDER_NOT_FOUND');

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
        detail.assetName = wo.Asset != null ? wo.Asset.Name : null;
        detail.flocDesc = wo.SAP_FLOC_Desc__c;
        detail.sapWorkCenter = wo.SAP_Work_Center__c;
        detail.externalId = wo.External_ID__c;
        detail.durationMinutes = wo.DurationInMinutes != null ? (Integer)wo.DurationInMinutes : null;
        detail.supervisorNotes = wo.Supervisor_Notes__c;
        detail.causeCodes = wo.Cause_Codes__c;
        detail.workDelayCodes = wo.Work_Delay_Codes__c;
        detail.damageCodes = wo.Damage_Codes__c;
        detail.parentWorkOrderId = wo.ParentWorkOrderId;
        detail.parentWoNumber = wo.ParentWorkOrderId != null ? wo.ParentWorkOrder.WorkOrderNumber : null;
        detail.parentSubject = wo.ParentWorkOrderId != null ? wo.ParentWorkOrder.Subject : null;

        // Line items (operations)
        List<LineItemDTO> lineItems = new List<LineItemDTO>();
        for (WorkOrderLineItem woli : [
            SELECT Id, Subject, Description, Duration
            FROM WorkOrderLineItem
            WHERE WorkOrderId = :workOrderId
            WITH SECURITY_ENFORCED ORDER BY CreatedDate ASC
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
            SELECT Id, WorkOrderNumber, Subject, Status, Priority, WorkTypeId, WorkType.Name,
                   Wagon_Number__c, Asset.Name, SAP_FLOC_Desc__c, SAP_Work_Center__c, External_ID__c,
                   DurationInMinutes
            FROM WorkOrder
            WHERE ParentWorkOrderId = :workOrderId
            WITH SECURITY_ENFORCED ORDER BY CreatedDate ASC
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
            card.durationMinutes = child.DurationInMinutes != null ? (Integer)child.DurationInMinutes : null;
            childWos.add(card);
        }
        detail.childWorkOrders = childWos;

        // Work plans + steps
        List<WorkPlanDTO> plans = new List<WorkPlanDTO>();
        Map<Id, WorkPlanDTO> planMap = new Map<Id, WorkPlanDTO>();
        for (WorkPlan wp : [
            SELECT Id, Name, ExecutionOrder FROM WorkPlan
            WHERE WorkOrderId = :workOrderId
            WITH SECURITY_ENFORCED ORDER BY ExecutionOrder ASC
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
            SELECT Id, Name, Status, ExecutionOrder, Description, WorkPlanId, ActionType, ActionDefinition FROM WorkStep
            WHERE WorkOrderId = :workOrderId
            WITH SECURITY_ENFORCED ORDER BY WorkPlanExecutionOrder ASC, ExecutionOrder ASC
        ]) {
            WorkStepDTO sdto = new WorkStepDTO();
            sdto.id = ws.Id;
            sdto.name = ws.Name;
            sdto.status = ws.Status;
            sdto.executionOrder = ws.ExecutionOrder;
            sdto.description = ws.Description;
            sdto.actionType = ws.ActionType;
            sdto.actionDefinition = ws.ActionDefinition;
            if (planMap.containsKey(ws.WorkPlanId)) planMap.get(ws.WorkPlanId).steps.add(sdto);
        }
        detail.workPlans = plans;

        // Time reports for this worker + work order
        String workerName = getWorkerName(payload.workerId);
        List<Time_Report__c> reports = [
            SELECT Id, Name, Start_Time__c, End_Time__c, Duration_in_Minutes__c, Description__c, Resource_Name__c
            FROM Time_Report__c
            WHERE Work_Order__c = :workOrderId AND Resource_Name__c = :workerName
            WITH SECURITY_ENFORCED ORDER BY Start_Time__c DESC
        ];

        List<TimeReportDTO> timeReports = new List<TimeReportDTO>();
        TimeReportDTO activeReport = null;
        for (Time_Report__c tr : reports) {
            TimeReportDTO dto = new TimeReportDTO();
            dto.id = tr.Id;
            dto.startTime = String.valueOf(tr.Start_Time__c);
            dto.endTime = tr.End_Time__c != null ? String.valueOf(tr.End_Time__c) : null;
            dto.durationMinutes = tr.Duration_in_Minutes__c != null ? (Integer)tr.Duration_in_Minutes__c : null;
            dto.description = tr.Description__c;
            dto.resourceName = tr.Resource_Name__c;
            dto.isActive = (tr.End_Time__c == null);
            timeReports.add(dto);
            if (dto.isActive && activeReport == null) activeReport = dto;
        }
        detail.timeReports = timeReports;
        detail.activeTimeReport = activeReport;

        return detail;
    }

    // ─── Update work step status ──────────────────────────────────────────────

    @AuraEnabled
    public static void updateWorkStepStatus(String token, String workStepId, String status) {
        TokenPayload payload = validateToken(token);
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');
        List<WorkStep> steps = [SELECT Id, Status FROM WorkStep WHERE Id = :workStepId WITH SECURITY_ENFORCED LIMIT 1];
        if (steps.isEmpty()) throw new AuraHandledException('WORK_STEP_NOT_FOUND');
        steps[0].Status = status;
        update steps[0];
    }

    // ─── Clock in ─────────────────────────────────────────────────────────────

    @AuraEnabled
    public static TimeReportDTO clockIn(String token, String workOrderId) {
        TokenPayload payload = validateToken(token);
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');

        String workerName = getWorkerName(payload.workerId);

        // Check no open entry already exists
        List<Time_Report__c> open = [
            SELECT Id FROM Time_Report__c
            WHERE Work_Order__c = :workOrderId AND Resource_Name__c = :workerName AND End_Time__c = NULL
            WITH SECURITY_ENFORCED LIMIT 1
        ];
        if (!open.isEmpty()) throw new AuraHandledException('ALREADY_CLOCKED_IN');

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
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');

        List<Time_Report__c> reports = [
            SELECT Id, Start_Time__c, End_Time__c, Resource_Name__c
            FROM Time_Report__c WHERE Id = :timeReportId
            WITH SECURITY_ENFORCED LIMIT 1
        ];
        if (reports.isEmpty()) throw new AuraHandledException('TIME_REPORT_NOT_FOUND');

        Time_Report__c tr = reports[0];
        if (tr.End_Time__c != null) throw new AuraHandledException('ALREADY_CLOCKED_OUT');

        DateTime endNow = DateTime.now();
        Long diffMs = endNow.getTime() - tr.Start_Time__c.getTime();
        Integer mins = (Integer)(diffMs / 60000);

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

    // ─── Save notes + codes ───────────────────────────────────────────────────

    @AuraEnabled
    public static void saveWorkOrderNotes(String token, String reqJson) {
        TokenPayload payload = validateToken(token);
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');
        SaveNotesRequest req = (SaveNotesRequest) JSON.deserialize(reqJson, SaveNotesRequest.class);

        WorkOrder wo = new WorkOrder(Id = req.workOrderId);
        wo.Supervisor_Notes__c = req.supervisorNotes;
        wo.Cause_Codes__c      = req.causeCodes;
        wo.Work_Delay_Codes__c = req.workDelayCodes;
        wo.Damage_Codes__c     = req.damageCodes;
        update wo;
    }

    // ─── Time tracking dashboard ──────────────────────────────────────────────

    @AuraEnabled(cacheable=false)
    public static TimeTrackingDashboard getTimeReportDashboard(String token) {
        TokenPayload payload = validateToken(token);
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');

        // Last 30 days
        DateTime fromDt = DateTime.now().addDays(-30);

        List<Time_Report__c> reports = [
            SELECT Id, Work_Order__c, Work_Order__r.WorkOrderNumber, Work_Order__r.DurationInMinutes,
                   Resource_Name__c, Start_Time__c, End_Time__c, Duration_in_Minutes__c
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
        Map<String, Integer> empCount   = new Map<String, Integer>();
        // dayKey -> empName -> minutes
        Map<String, Map<String, Integer>> dayEmpMap = new Map<String, Map<String, Integer>>();

        List<TimeReportRow> rows = new List<TimeReportRow>();

        for (Time_Report__c tr : reports) {
            Boolean active = (tr.End_Time__c == null);
            if (active) dash.activeCount++;

            // Calculated minutes (formula field) or compute from timestamps
            Integer mins = null;
            if (tr.Duration_in_Minutes__c != null) {
                mins = (Integer)tr.Duration_in_Minutes__c;
            } else if (!active && tr.Start_Time__c != null && tr.End_Time__c != null) {
                mins = (Integer)((tr.End_Time__c.getTime() - tr.Start_Time__c.getTime()) / 60000);
            }

            if (mins != null) dash.totalMinutes += mins;

            String empName = String.isBlank(tr.Resource_Name__c) ? 'Unknown' : tr.Resource_Name__c;

            // Per-employee totals
            empMinutes.put(empName, (empMinutes.containsKey(empName) ? empMinutes.get(empName) : 0) + (mins != null ? mins : 0));
            empCount.put(empName, (empCount.containsKey(empName) ? empCount.get(empName) : 0) + 1);

            // Per-day buckets
            if (tr.Start_Time__c != null && mins != null) {
                String dayKey = String.valueOf(tr.Start_Time__c.dateGmt());
                if (!dayEmpMap.containsKey(dayKey)) dayEmpMap.put(dayKey, new Map<String, Integer>());
                Map<String, Integer> dayMap = dayEmpMap.get(dayKey);
                dayMap.put(empName, (dayMap.containsKey(empName) ? dayMap.get(empName) : 0) + mins);
            }

            // Validation flag
            Integer plannedMins = tr.Work_Order__c != null && tr.Work_Order__r.DurationInMinutes != null
                ? (Integer)tr.Work_Order__r.DurationInMinutes : null;
            String flag = '';
            if (!active && mins != null) {
                if (mins < 10) flag = 'SHORT';
                else if (mins > 360) flag = 'LONG';
                else if (plannedMins != null && plannedMins > 0) {
                    Decimal variance = Math.abs(mins - plannedMins) * 100.0 / plannedMins;
                    if (variance > 50) flag = 'VARIANCE';
                }
            }

            TimeReportRow row = new TimeReportRow();
            row.id = tr.Id;
            row.workOrderId = tr.Work_Order__c;
            row.workOrderNumber = tr.Work_Order__c != null ? tr.Work_Order__r.WorkOrderNumber : null;
            row.resourceName = empName;
            row.startTime = String.valueOf(tr.Start_Time__c);
            row.endTime = tr.End_Time__c != null ? String.valueOf(tr.End_Time__c) : null;
            row.durationMinutes = mins;
            row.plannedMinutes = plannedMins;
            row.isActive = active;
            row.validationFlag = flag;
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
                    EmployeeSummary tmp = byEmp[i]; byEmp[i] = byEmp[j]; byEmp[j] = tmp;
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

    // ─── Dashboard metrics ────────────────────────────────────────────────────

    @AuraEnabled(cacheable=false)
    public static DashboardMetrics getDashboardMetrics(String token, String dateFrom, String dateTo) {
        TokenPayload payload = validateToken(token);
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');

        Date fromDate = String.isBlank(dateFrom) ? Date.today() : Date.valueOf(dateFrom);
        Date toDate   = String.isBlank(dateTo)   ? Date.today() : Date.valueOf(dateTo);
        DateTime fromDt = DateTime.newInstance(fromDate, Time.newInstance(0,0,0,0));
        DateTime toDt   = DateTime.newInstance(toDate.addDays(1), Time.newInstance(0,0,0,0));

        // Find SAs in the territory within the date window
        List<ServiceAppointment> sas = [
            SELECT Id, ParentRecordId
            FROM ServiceAppointment
            WHERE ServiceTerritoryId = :payload.territoryId
              AND ParentRecordType = 'WorkOrder'
              AND SchedStartTime >= :fromDt
              AND SchedStartTime < :toDt
            WITH SECURITY_ENFORCED
            LIMIT 1000
        ];

        Set<Id> woIds = new Set<Id>();
        for (ServiceAppointment sa : sas) {
            if (sa.ParentRecordId != null) woIds.add(sa.ParentRecordId);
        }

        String kioskNotes = getKioskNotes(payload.territoryId);
        DashboardMetrics m = new DashboardMetrics();
        m.kioskNotes = kioskNotes;
        m.openCount = 0; m.inProgressCount = 0; m.completedCount = 0;
        m.criticalCount = 0; m.totalDurationMinutes = 0; m.totalActualMinutes = 0;

        Map<String, DonutSlice> sliceMap = new Map<String, DonutSlice>();
        List<CriticalJob> criticals = new List<CriticalJob>();

        if (!woIds.isEmpty()) {
            List<WorkOrder> workOrders = [
                SELECT Id, WorkOrderNumber, Status, Priority, WorkTypeId, WorkType.Name, DurationInMinutes,
                       Subject, Wagon_Number__c
                FROM WorkOrder
                WHERE Id IN :woIds
                WITH SECURITY_ENFORCED LIMIT 500
            ];

            for (WorkOrder wo : workOrders) {
                String st = wo.Status;
                if (st == 'New' || st == 'Open') m.openCount++;
                else if (st == 'In Progress') m.inProgressCount++;
                else if (st == 'Completed') m.completedCount++;
                if (wo.Priority == 'Critical') {
                    m.criticalCount++;
                    if (criticals.size() < 3 && String.isNotBlank(wo.Subject)) {
                        CriticalJob cj = new CriticalJob();
                        cj.woNumber = wo.WorkOrderNumber; cj.subject = wo.Subject; cj.wagonNumber = wo.Wagon_Number__c; cj.status = wo.Status;
                        criticals.add(cj);
                    }
                }
                if (wo.DurationInMinutes != null) m.totalDurationMinutes += (Integer)wo.DurationInMinutes;
                String wtLabel = wo.WorkTypeId != null ? wo.WorkType.Name : 'Unclassified';
                if (!sliceMap.containsKey(wtLabel)) {
                    DonutSlice s = new DonutSlice(); s.label = wtLabel; s.count = 0;
                    sliceMap.put(wtLabel, s);
                }
                sliceMap.get(wtLabel).count++;
            }

            // Actual time logged against these WOs in the date window
            for (AggregateResult ar : [
                SELECT SUM(Duration_in_Minutes__c) totalMins
                FROM Time_Report__c
                WHERE Work_Order__c IN :woIds
                  AND Start_Time__c >= :fromDt
                  AND Start_Time__c < :toDt
                  AND End_Time__c != NULL
                WITH SECURITY_ENFORCED
            ]) {
                Object val = ar.get('totalMins');
                if (val != null) m.totalActualMinutes = ((Decimal)val).intValue();
            }
        }

        m.workTypeBreakdown = sliceMap.values();
        m.topCriticalJobs = criticals;
        return m;
    }

    // ─── Session refresh ──────────────────────────────────────────────────────

    @AuraEnabled
    public static EmployeeSession refreshSession(String token) {
        TokenPayload payload = validateToken(token);
        if (payload == null) {
            EmployeeSession fail = new EmployeeSession();
            fail.success = false; fail.errorCode = 'SESSION_EXPIRED';
            return fail;
        }
        DateTime now = DateTime.now();
        Long absoluteMaxMs = payload.issuedAtMs + (TOKEN_MAX_HOURS * 3600 * 1000);
        if (now.getTime() > absoluteMaxMs) {
            EmployeeSession fail = new EmployeeSession();
            fail.success = false; fail.errorCode = 'SESSION_EXPIRED';
            return fail;
        }
        EmployeeSession refreshed = new EmployeeSession();
        refreshed.success = true;
        refreshed.workerId = payload.workerId;
        refreshed.token = issueToken(payload.workerId, payload.territoryId, now);
        return refreshed;
    }

    // ─── Measure points ───────────────────────────────────────────────────────

    @AuraEnabled(cacheable=false)
    public static List<MeasurePointDTO> getMeasurePoints(String token, String workOrderId) {
        TokenPayload payload = validateToken(token);
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');

        List<Measure_Point__c> records = [
            SELECT Id, Name, Component_Name__c, Measure_Type__c, Comments__c,
                   Review_Notes__c, Measure_Value__c, MeasureValue_Type__c, CreatedDate
            FROM Measure_Point__c
            WHERE Work_Order__c = :workOrderId
            WITH SECURITY_ENFORCED
            ORDER BY CreatedDate DESC
        ];

        List<MeasurePointDTO> result = new List<MeasurePointDTO>();
        for (Measure_Point__c mp : records) {
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
            result.add(dto);
        }
        return result;
    }

    @AuraEnabled
    public static MeasurePointDTO saveMeasurePoint(String token, String reqJson) {
        TokenPayload payload = validateToken(token);
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');

        MeasurePointDTO req = (MeasurePointDTO) JSON.deserialize(reqJson, MeasurePointDTO.class);

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
        mp.MeasureValue_Type__c = req.measureValueType;

        upsert mp;

        // Re-query to get all fields including system-populated ones
        List<Measure_Point__c> saved = [
            SELECT Id, Name, Component_Name__c, Measure_Type__c, Comments__c,
                   Review_Notes__c, Measure_Value__c, MeasureValue_Type__c, CreatedDate
            FROM Measure_Point__c
            WHERE Id = :mp.Id
            WITH SECURITY_ENFORCED
            LIMIT 1
        ];
        if (saved.isEmpty()) throw new AuraHandledException('SAVE_FAILED');

        Measure_Point__c s = saved[0];
        MeasurePointDTO result = new MeasurePointDTO();
        result.id = s.Id;
        result.name = s.Name;
        result.componentName = s.Component_Name__c;
        result.measureType = s.Measure_Type__c;
        result.comments = s.Comments__c;
        result.reviewNotes = s.Review_Notes__c;
        result.measureValue = s.Measure_Value__c;
        result.measureValueType = s.MeasureValue_Type__c;
        result.createdDate = String.valueOf(s.CreatedDate);
        return result;
    }

    @AuraEnabled
    public static void deleteMeasurePoint(String token, String measurePointId) {
        TokenPayload payload = validateToken(token);
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');
        if (String.isBlank(measurePointId)) throw new AuraHandledException('MISSING_ID');

        List<Measure_Point__c> toDelete = [
            SELECT Id FROM Measure_Point__c WHERE Id = :measurePointId
            WITH SECURITY_ENFORCED LIMIT 1
        ];
        if (!toDelete.isEmpty()) {
            delete toDelete;
        }
    }

    @AuraEnabled(cacheable=false)
    public static List<WorkOrderAttachment> getWorkOrderAttachments(String token, String workOrderId) {
        TokenPayload payload = validateToken(token);
        if (payload == null) throw new AuraHandledException('SESSION_EXPIRED');

        List<ContentDocumentLink> links = [
            SELECT ContentDocumentId, ContentDocument.Title,
                   ContentDocument.FileExtension
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
            att.downloadUrl = '/sfc/servlet.shepherd/document/download/' + cdl.ContentDocumentId;
            result.add(att);
        }
        return result;
    }

    @AuraEnabled(cacheable=false)
    public static String uploadAnnotatedPdf(String token, String workOrderId, String title, String base64Data) {
        TokenPayload payload = validateToken(token);
        if (payload == null) {
            AuraHandledException ex = new AuraHandledException('SESSION_EXPIRED');
            ex.setMessage('SESSION_EXPIRED');
            throw ex;
        }
        if (String.isBlank(workOrderId) || String.isBlank(base64Data)) {
            AuraHandledException ex = new AuraHandledException('INVALID_REQUEST: missing workOrderId or base64Data');
            ex.setMessage('INVALID_REQUEST: missing workOrderId or base64Data');
            throw ex;
        }

        String cleanTitle = String.isBlank(title) ? 'Annotated PDF' : title;
        if (!cleanTitle.toLowerCase().endsWith('.pdf')) cleanTitle += '.pdf';

        try {
            ContentVersion cv = new ContentVersion();
            cv.Title = cleanTitle;
            cv.PathOnClient = cleanTitle;
            cv.VersionData = EncodingUtil.base64Decode(base64Data);
            cv.IsMajorVersion = true;
            insert cv;

            ContentVersion inserted = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id LIMIT 1];

            ContentDocumentLink link = new ContentDocumentLink();
            link.ContentDocumentId = inserted.ContentDocumentId;
            link.LinkedEntityId = workOrderId;
            link.ShareType = 'V';
            link.Visibility = 'AllUsers';
            insert link;

            return inserted.ContentDocumentId;
        } catch (DmlException e) {
            String detail = 'DML_FAILED: ' + (e.getNumDml() > 0 ? e.getDmlMessage(0) : e.getMessage());
            AuraHandledException ex = new AuraHandledException(detail);
            ex.setMessage(detail);
            throw ex;
        } catch (Exception e) {
            AuraHandledException ex = new AuraHandledException('UPLOAD_FAILED: ' + e.getTypeName() + ' — ' + e.getMessage());
            ex.setMessage('UPLOAD_FAILED: ' + e.getTypeName() + ' — ' + e.getMessage());
            throw ex;
        }
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    private static String getWorkerName(String workerId) {
        List<ServiceResource> srs = [SELECT Name FROM ServiceResource WHERE Id = :workerId LIMIT 1];
        return srs.isEmpty() ? workerId : srs[0].Name;
    }

    private static String getKioskNotes(String territoryId) {
        try {
            List<ServiceTerritory> territories = [
                SELECT Kiosk_Notes__c FROM ServiceTerritory WHERE Id = :territoryId
                WITH SECURITY_ENFORCED LIMIT 1
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

    private static String issueToken(String workerId, String territoryId, DateTime issuedAt) {
        Long issuedAtMs = issuedAt.getTime();
        Long expiryMs = issuedAt.addMinutes(TOKEN_TTL_MINUTES).getTime();
        String payload = workerId + '|' + territoryId + '|' + expiryMs + '|' + issuedAtMs;
        String sig = computeHmac(payload);
        return EncodingUtil.base64Encode(Blob.valueOf(payload + '|' + sig));
    }

    private static TokenPayload validateToken(String token) {
        if (String.isBlank(token)) return null;
        try {
            String decoded = EncodingUtil.base64Decode(token).toString();
            List<String> parts = decoded.split('\\|');
            if (parts.size() != 5) return null;
            String payload = parts[0] + '|' + parts[1] + '|' + parts[2] + '|' + parts[3];
            if (!constantTimeEquals(parts[4], computeHmac(payload))) return null;
            Long expiryMs = Long.valueOf(parts[2]);
            if (DateTime.now().getTime() > expiryMs) return null;
            TokenPayload p = new TokenPayload();
            p.workerId = parts[0]; p.territoryId = parts[1];
            p.expiryMs = expiryMs; p.issuedAtMs = Long.valueOf(parts[3]);
            return p;
        } catch (Exception e) {
            return null;
        }
    }

    private static String computeHmac(String payload) {
        Blob mac = Crypto.generateMac('hmacSHA256', Blob.valueOf(payload), Blob.valueOf(HMAC_KEY));
        return EncodingUtil.base64Encode(mac);
    }

    private static Boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        Blob aBlob = EncodingUtil.base64Decode(Math.mod(a.length(), 4) == 0 ? a : a + '==');
        Blob bBlob = EncodingUtil.base64Decode(Math.mod(b.length(), 4) == 0 ? b : b + '==');
        String aHex = EncodingUtil.convertToHex(aBlob);
        String bHex = EncodingUtil.convertToHex(bBlob);
        if (aHex.length() != bHex.length()) return false;
        Integer diff = 0;
        for (Integer i = 0; i < aHex.length(); i++) {
            diff = diff | (aHex.charAt(i) ^ bHex.charAt(i));
        }
        return diff == 0;
    }

    private static Boolean verifyPin(String enteredPin, String salt, String storedHash) {
        if (String.isBlank(salt) || String.isBlank(storedHash)) return false;
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
