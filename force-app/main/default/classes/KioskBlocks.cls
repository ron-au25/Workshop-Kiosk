/**
 * Agentforce invocable actions that return rich "agent-blocks" JSON for the kiosk
 * chat to render as charts, timelines, tables, KPIs, and calendars.
 *
 * Each method builds the block JSON deterministically in Apex (numbers are computed,
 * never hallucinated) and returns it inside a fenced ```agent-blocks ... ``` in the
 * `message` output. KioskAgentforceController/RenderBlocks extract that fence and the
 * agentRichBlocks LWC renders it — no controller/LWC change needed.
 *
 * Runs as the Agent API user (the supervisor), so it uses plain SOQL — NOT the kiosk
 * HMAC token. Block contract: Workshop Files/Agentforce Rich Blocks - Schema.md.
 */
public with sharing class KioskBlocks {
  // ---- shared I/O types --------------------------------------------------

  // Shared invocable request/response — referenced by the thin wrapper classes
  // (one @InvocableMethod each; Salesforce allows only one per class).
  public class Input {
    @InvocableVariable(
      label='Work Order Id'
      description='Current/target work order id. Used to derive the wagon/asset when assetId and wagonNumber are blank.'
    )
    public String workOrderId;
    @InvocableVariable(
      label='Asset Id'
      description='Wagon or wheelset Asset id (optional).'
    )
    public String assetId;
    @InvocableVariable(
      label='Wagon Number'
      description='Wagon number to target (optional).'
    )
    public String wagonNumber;
    @InvocableVariable(
      label='Date Range Days'
      description='Look-back window in days (optional). E.g. user says "last 30 days" -> 30.'
    )
    public String dateRangeDays;
    @InvocableVariable(
      label='Month'
      description='Calendar month as YYYY-MM (optional).'
    )
    public String month;
    @InvocableVariable(
      label='Max Items'
      description='Maximum number of items to return (optional). E.g. user says "last 5" -> 5.'
    )
    public String maxItems;
    @InvocableVariable(
      label='Event Type Filter'
      description='Optional timeline filter: "measure" to show only measures taken, "workorder" to show only work orders. Blank = both.'
    )
    public String eventType;
    @InvocableVariable(
      label='Min Value'
      description='Optional lower bound for Measure Value. E.g. "measures over 20" -> 20. Blank = no lower bound.'
    )
    public String minValue;
    @InvocableVariable(
      label='Max Value'
      description='Optional upper bound for Measure Value. E.g. "measures under 5" -> 5. Blank = no upper bound.'
    )
    public String maxValue;
    @InvocableVariable(
      label='Measure Outcome'
      description='Optional comma-separated outcome filter for measures. Valid values: "Scrap", "Attention Required", "Measure", "OK". E.g. "scrap or attention" -> "Scrap,Attention Required". Blank = all outcomes.'
    )
    public String measureOutcome;
    @InvocableVariable(
      label='Measure Value Type'
      description='Optional measurement type filter. Valid values: Temperature, Pressure, Level, Width, Length, Depth. Blank = all types.'
    )
    public String valueType;
  }

  public class Output {
    @InvocableVariable(
      label='Message'
      description='Prose plus an agent-blocks fence the kiosk renders.'
    )
    public String message;
  }

  // ============================ ACTIONS ===================================

  public static List<Output> assetTimeline(List<Input> reqs) {
    Input in0 = first(reqs);
    Id assetId = resolveWagonAssetId(in0);
    List<Object> events = new List<Object>();

    // ---- filters from the user's request --------------------------------
    Integer maxItems = parseIntOrNull(in0.maxItems); // "last 5" -> 5
    Integer days = parseIntOrNull(in0.dateRangeDays); // "last 30 days" -> 30
    Datetime since = (days != null &&
      days > 0)
      ? Datetime.now().addDays(-days)
      : null;
    String typeFilter = normType(in0.eventType); // 'measure' | 'workorder' | null
    Boolean wantMeasures = (typeFilter == null || typeFilter == 'measure');
    Boolean wantWorkOrders = (typeFilter == null || typeFilter == 'workorder');

    if (wantMeasures && assetId != null) {
      Set<Id> assetIds = wagonAndWheelsetIds(assetId);
      List<Measure_Point__c> mps = (since == null)
        ? [
            SELECT
              Component_Name__c,
              Measure_Type__c,
              Measure_Value__c,
              MeasureValue_Type__c,
              CreatedDate,
              Update_Date__c
            FROM Measure_Point__c
            WHERE Asset__c IN :assetIds
            ORDER BY CreatedDate DESC
            LIMIT 200
          ]
        : [
            SELECT
              Component_Name__c,
              Measure_Type__c,
              Measure_Value__c,
              MeasureValue_Type__c,
              CreatedDate,
              Update_Date__c
            FROM Measure_Point__c
            WHERE Asset__c IN :assetIds AND CreatedDate >= :since
            ORDER BY CreatedDate DESC
            LIMIT 200
          ];
      for (Measure_Point__c mp : mps) {
        Datetime d = (mp.Update_Date__c != null)
          ? mp.Update_Date__c
          : mp.CreatedDate;
        String val = (mp.Measure_Value__c != null)
          ? (' = ' + mp.Measure_Value__c + ' ' + nz(mp.MeasureValue_Type__c))
          : '';
        events.add(
          eventOf(
            'Measure: ' + nz(mp.Component_Name__c),
            fmtDate(d),
            nz(mp.Measure_Type__c),
            nz(mp.Component_Name__c) + val,
            d
          )
        );
      }
    }
    // Work orders against the wagon
    String wagon = resolveWagonNumber(in0);
    if (wantWorkOrders && String.isNotBlank(wagon)) {
      List<WorkOrder> wos = (since == null)
        ? [
            SELECT WorkOrderNumber, Subject, Status, StartDate, CreatedDate
            FROM WorkOrder
            WHERE Wagon_Number__c = :wagon
            ORDER BY CreatedDate DESC
            LIMIT 200
          ]
        : [
            SELECT WorkOrderNumber, Subject, Status, StartDate, CreatedDate
            FROM WorkOrder
            WHERE Wagon_Number__c = :wagon AND CreatedDate >= :since
            ORDER BY CreatedDate DESC
            LIMIT 200
          ];
      for (WorkOrder wo : wos) {
        Datetime d = (wo.StartDate != null) ? wo.StartDate : wo.CreatedDate;
        events.add(
          eventOf(
            'Work Order ' + nz(wo.WorkOrderNumber),
            fmtDate(d),
            nz(wo.Status),
            nz(wo.Subject),
            d
          )
        );
      }
    }
    sortEventsDesc(events);

    // "last N" cap, applied after the merged chronological sort
    if (maxItems != null && maxItems > 0 && events.size() > maxItems) {
      List<Object> trimmed = new List<Object>();
      for (Integer i = 0; i < maxItems; i++)
        trimmed.add(events[i]);
      events = trimmed;
    }
    if (events.isEmpty())
      return msg(
        'No timeline activity found for this asset with those filters.'
      );

    // Describe the applied filters in the title so the user sees it took effect.
    List<String> bits = new List<String>();
    if (maxItems != null)
      bits.add('last ' + maxItems);
    if (days != null)
      bits.add('past ' + days + ' days');
    if (typeFilter == 'measure')
      bits.add('measures only');
    if (typeFilter == 'workorder')
      bits.add('work orders only');
    String title =
      'Maintenance Timeline' +
      (bits.isEmpty() ? '' : ' (' + String.join(bits, ', ') + ')');

    Map<String, Object> block = new Map<String, Object>{
      'type' => 'timeline',
      'title' => title,
      'events' => stripSort(events)
    };
    return blocks(
      'Here is the maintenance timeline.',
      new List<Object>{ block }
    );
  }

  public static List<Output> workOrdersByStatus(List<Input> reqs) {
    Input in0 = first(reqs);
    String wagon = resolveWagonNumber(in0);
    Map<String, Integer> counts = new Map<String, Integer>();
    Integer total = 0;

    List<AggregateResult> rows = (wagon != null)
      ? [
          SELECT Status st, COUNT(Id) c
          FROM WorkOrder
          WHERE Wagon_Number__c = :wagon
          GROUP BY Status
        ]
      : [SELECT Status st, COUNT(Id) c FROM WorkOrder GROUP BY Status LIMIT 50];
    for (AggregateResult ar : rows) {
      String st = (String) ar.get('st');
      Integer c = (Integer) ar.get('c');
      if (String.isBlank(st))
        st = 'Unspecified';
      counts.put(st, c);
      total += c;
    }
    if (total == 0)
      return msg('No work orders found.');

    List<Object> series = new List<Object>();
    List<Object> kpis = new List<Object>();
    for (String st : counts.keySet()) {
      series.add(
        new Map<String, Object>{ 'label' => st, 'value' => counts.get(st) }
      );
      kpis.add(
        new Map<String, Object>{ 'label' => st, 'value' => counts.get(st) }
      );
    }
    String scope = (wagon != null) ? ('wagon ' + wagon) : 'all work orders';
    return blocks(
      'Work orders by status for ' + scope + ' (' + total + ' total).',
      new List<Object>{
        new Map<String, Object>{ 'type' => 'kpi', 'items' => kpis },
        new Map<String, Object>{
          'type' => 'chart',
          'chartType' => 'donut',
          'title' => 'Work Orders by Status',
          'series' => series
        }
      }
    );
  }

  public static List<Output> measurePointGraph(List<Input> reqs) {
    Input in0 = first(reqs);
    Id assetId = resolveAnyAssetId(in0);
    String woId = cleanId(in0.workOrderId);

    List<Measure_Point__c> mps;
    if (assetId != null) {
      Set<Id> ids = wagonAndWheelsetIds(assetId);
      mps = [
        SELECT
          Component_Name__c,
          Measure_Type__c,
          Measure_Value__c,
          MeasureValue_Type__c,
          CreatedDate,
          Update_Date__c
        FROM Measure_Point__c
        WHERE Asset__c IN :ids
        ORDER BY CreatedDate ASC
        LIMIT 200
      ];
    } else if (woId != null) {
      mps = [
        SELECT
          Component_Name__c,
          Measure_Type__c,
          Measure_Value__c,
          MeasureValue_Type__c,
          CreatedDate,
          Update_Date__c
        FROM Measure_Point__c
        WHERE Work_Order__c = :woId
        ORDER BY CreatedDate ASC
        LIMIT 200
      ];
    } else {
      return msg('Tell me which wagon, wheelset, or work order to graph.');
    }
    if (mps.isEmpty())
      return msg('No measure points found to graph.');

    // Line series: numeric measures over time (label = short date).
    List<Object> line = new List<Object>();
    Map<String, Integer> typeSplit = new Map<String, Integer>();
    for (Measure_Point__c mp : mps) {
      if (mp.Measure_Value__c != null) {
        Datetime d = (mp.Update_Date__c != null)
          ? mp.Update_Date__c
          : mp.CreatedDate;
        line.add(
          new Map<String, Object>{
            'label' => fmtShort(d),
            'value' => mp.Measure_Value__c
          }
        );
      }
      String mt = String.isBlank(mp.Measure_Type__c)
        ? 'Unspecified'
        : mp.Measure_Type__c;
      typeSplit.put(
        mt,
        (typeSplit.containsKey(mt) ? typeSplit.get(mt) : 0) + 1
      );
    }
    List<Object> outBlocks = new List<Object>();
    if (!line.isEmpty()) {
      outBlocks.add(
        new Map<String, Object>{
          'type' => 'chart',
          'chartType' => 'line',
          'title' => 'Measure Values Over Time',
          'series' => line
        }
      );
    }
    List<Object> split = new List<Object>();
    for (String k : typeSplit.keySet())
      split.add(
        new Map<String, Object>{ 'label' => k, 'value' => typeSplit.get(k) }
      );
    outBlocks.add(
      new Map<String, Object>{
        'type' => 'chart',
        'chartType' => 'bar',
        'title' => 'Measures by Outcome',
        'series' => split
      }
    );

    return blocks(
      'Here is the measure point graph (' + mps.size() + ' readings).',
      outBlocks
    );
  }

  /**
   * Measure Explorer — filtered, detailed analysis of measure points.
   * Supports the user's own criteria: a value threshold (minValue / maxValue),
   * an outcome filter (Scrap / Attention Required / Measure / OK), and a value-type
   * filter (Temperature, Pressure, ...). Returns a KPI summary plus a CAROUSEL where
   * each card carries a rich `details` list (outcome, value, value type, component,
   * defect location, comments, date) the kiosk shows on drill-in, an optional image,
   * and the parent workOrderId for "go to work order".
   */
  public static List<Output> measureExplorer(List<Input> reqs) {
    Input in0 = first(reqs);
    Id assetId = resolveAnyAssetId(in0);
    String woId = cleanId(in0.workOrderId);

    // ---- parse the user's criteria -------------------------------------
    Decimal minVal = parseDecimalOrNull(in0.minValue);
    Decimal maxVal = parseDecimalOrNull(in0.maxValue);
    Set<String> outcomes = parseOutcomes(in0.measureOutcome); // normalised picklist values
    String vType = normValueType(in0.valueType);

    // ---- base query (asset hierarchy or single work order) -------------
    List<Measure_Point__c> mps;
    if (assetId != null) {
      Set<Id> ids = wagonAndWheelsetIds(assetId);
      mps = [
        SELECT
          Id,
          Component_Name__c,
          Measure_Type__c,
          Measure_Value__c,
          MeasureValue_Type__c,
          Defect_Location__c,
          Comments__c,
          Work_Order__c,
          CreatedDate,
          Update_Date__c
        FROM Measure_Point__c
        WHERE Asset__c IN :ids
        ORDER BY CreatedDate DESC
        LIMIT 200
      ];
    } else if (woId != null) {
      mps = [
        SELECT
          Id,
          Component_Name__c,
          Measure_Type__c,
          Measure_Value__c,
          MeasureValue_Type__c,
          Defect_Location__c,
          Comments__c,
          Work_Order__c,
          CreatedDate,
          Update_Date__c
        FROM Measure_Point__c
        WHERE Work_Order__c = :woId
        ORDER BY CreatedDate DESC
        LIMIT 200
      ];
    } else {
      return msg('Tell me which wagon, wheelset, or work order to explore.');
    }

    // ---- apply the criteria in Apex (deterministic) --------------------
    List<Measure_Point__c> matched = new List<Measure_Point__c>();
    Map<String, Integer> outcomeCount = new Map<String, Integer>();
    for (Measure_Point__c mp : mps) {
      if (
        minVal != null &&
        (mp.Measure_Value__c == null ||
        mp.Measure_Value__c < minVal)
      )
        continue;
      if (
        maxVal != null &&
        (mp.Measure_Value__c == null ||
        mp.Measure_Value__c > maxVal)
      )
        continue;
      if (!outcomes.isEmpty() && !outcomes.contains(nz(mp.Measure_Type__c)))
        continue;
      if (vType != null && !vType.equalsIgnoreCase(nz(mp.MeasureValue_Type__c)))
        continue;
      matched.add(mp);
      String mt = String.isBlank(mp.Measure_Type__c)
        ? 'Unspecified'
        : mp.Measure_Type__c;
      outcomeCount.put(
        mt,
        (outcomeCount.containsKey(mt) ? outcomeCount.get(mt) : 0) + 1
      );
    }

    String crit = describeCriteria(minVal, maxVal, outcomes, vType);
    if (matched.isEmpty()) {
      return msg('No measures matched' + (crit == '' ? '.' : ' ' + crit + '.'));
    }

    // Latest image per matched measure point (for an optional card thumbnail).
    Map<Id, String> imageByMp = latestImageUrlByEntity(
      new Map<Id, Measure_Point__c>(matched).keySet()
    );

    // ---- build cards with rich detail ----------------------------------
    List<Object> cards = new List<Object>();
    for (Measure_Point__c mp : matched) {
      Datetime d = (mp.Update_Date__c != null)
        ? mp.Update_Date__c
        : mp.CreatedDate;
      String valStr = (mp.Measure_Value__c != null)
        ? (String.valueOf(mp.Measure_Value__c) +
            ' ' +
            nz(mp.MeasureValue_Type__c))
            .trim()
        : '—';

      // detail rows the lightbox renders (label/value pairs)
      List<Object> details = new List<Object>();
      details.add(detailRow('Outcome', nz(mp.Measure_Type__c)));
      details.add(detailRow('Value', valStr));
      details.add(detailRow('Value Type', nz(mp.MeasureValue_Type__c)));
      details.add(detailRow('Component', nz(mp.Component_Name__c)));
      if (String.isNotBlank(mp.Defect_Location__c))
        details.add(detailRow('Defect Location', mp.Defect_Location__c));
      details.add(detailRow('Recorded', fmtDate(d)));
      if (String.isNotBlank(mp.Comments__c))
        details.add(detailRow('Comments', mp.Comments__c));

      cards.add(
        new Map<String, Object>{
          'title' => nz(mp.Component_Name__c) == ''
            ? 'Measure'
            : mp.Component_Name__c,
          'subtitle' => nz(mp.Measure_Type__c),
          'caption' => valStr,
          'imageUrl' => imageByMp.containsKey(mp.Id)
            ? imageByMp.get(mp.Id)
            : null,
          'workOrderId' => mp.Work_Order__c,
          'details' => details
        }
      );
    }

    // KPI summary of the matched set by outcome.
    List<Object> kpis = new List<Object>();
    kpis.add(
      new Map<String, Object>{ 'label' => 'Matched', 'value' => matched.size() }
    );
    for (String k : outcomeCount.keySet()) {
      kpis.add(
        new Map<String, Object>{ 'label' => k, 'value' => outcomeCount.get(k) }
      );
    }

    String title = 'Measures' + (crit == '' ? '' : ' ' + crit);
    return blocks(
      'Found ' +
        matched.size() +
        ' measure(s)' +
        (crit == '' ? '' : ' ' + crit) +
        '. Tap a card for full detail.',
      new List<Object>{
        new Map<String, Object>{
          'type' => 'kpi',
          'title' => 'Summary',
          'items' => kpis
        },
        new Map<String, Object>{
          'type' => 'carousel',
          'title' => title,
          'cards' => cards
        }
      }
    );
  }

  public static List<Output> wagonConditionByWheelset(List<Input> reqs) {
    Input in0 = first(reqs);
    Id wagonId = resolveWagonAssetId(in0);
    if (wagonId == null)
      return msg(
        'Tell me which wagon to assess (open a work order or name a wagon).'
      );

    List<Asset> wheelsets = [
      SELECT Id, Name
      FROM Asset
      WHERE ParentId = :wagonId
      ORDER BY Name
    ];
    if (wheelsets.isEmpty()) {
      // Maybe the resolved asset IS a wheelset; assess the parent's set.
      wheelsets = [SELECT Id, Name FROM Asset WHERE Id = :wagonId];
    }
    Map<Id, String> nameById = new Map<Id, String>();
    for (Asset a : wheelsets)
      nameById.put(a.Id, a.Name);

    // Count "attention/scrap" measure points per wheelset = condition severity.
    Map<Id, Integer> issues = new Map<Id, Integer>();
    Map<Id, Integer> totals = new Map<Id, Integer>();
    for (AggregateResult ar : [
      SELECT Asset__c aid, Measure_Type__c mt, COUNT(Id) c
      FROM Measure_Point__c
      WHERE Asset__c IN :nameById.keySet()
      GROUP BY Asset__c, Measure_Type__c
    ]) {
      Id aid = (Id) ar.get('aid');
      String mt = (String) ar.get('mt');
      Integer c = (Integer) ar.get('c');
      totals.put(aid, (totals.containsKey(aid) ? totals.get(aid) : 0) + c);
      if (mt == 'Attention Required' || mt == 'Scrap') {
        issues.put(aid, (issues.containsKey(aid) ? issues.get(aid) : 0) + c);
      }
    }
    List<Object> series = new List<Object>();
    List<Object> tableRows = new List<Object>();
    for (Id aid : nameById.keySet()) {
      Integer iss = issues.containsKey(aid) ? issues.get(aid) : 0;
      Integer tot = totals.containsKey(aid) ? totals.get(aid) : 0;
      String cond = (iss == 0)
        ? (tot == 0 ? 'No data' : 'OK')
        : (iss >= 3 ? 'Critical' : 'Attention');
      series.add(
        new Map<String, Object>{ 'label' => nameById.get(aid), 'value' => iss }
      );
      tableRows.add(
        new List<Object>{
          nameById.get(aid),
          cond,
          String.valueOf(iss),
          String.valueOf(tot)
        }
      );
    }
    return blocks(
      'Wagon condition by wheelset (issues = Attention/Scrap measures).',
      new List<Object>{
        new Map<String, Object>{
          'type' => 'chart',
          'chartType' => 'bar',
          'title' => 'Issues by Wheelset',
          'series' => series
        },
        new Map<String, Object>{
          'type' => 'table',
          'columns' => new List<Object>{
            'Wheelset',
            'Condition',
            'Issues',
            'Measures'
          },
          'rows' => tableRows
        }
      }
    );
  }

  public static List<Output> timeWorkedVsPlanned(List<Input> reqs) {
    Input in0 = first(reqs);
    String wagon = resolveWagonNumber(in0);
    String woId = cleanId(in0.workOrderId);

    List<WorkOrder> wos;
    if (woId != null) {
      wos = [
        SELECT Id, WorkOrderNumber, DurationInMinutes
        FROM WorkOrder
        WHERE Id = :woId
      ];
    } else if (wagon != null) {
      wos = [
        SELECT Id, WorkOrderNumber, DurationInMinutes
        FROM WorkOrder
        WHERE Wagon_Number__c = :wagon
        ORDER BY CreatedDate DESC
        LIMIT 15
      ];
    } else {
      wos = [
        SELECT Id, WorkOrderNumber, DurationInMinutes
        FROM WorkOrder
        ORDER BY CreatedDate DESC
        LIMIT 15
      ];
    }
    if (wos.isEmpty())
      return msg('No work orders found.');

    Map<Id, Decimal> actual = new Map<Id, Decimal>();
    Set<Id> woIds = new Map<Id, WorkOrder>(wos).keySet();
    for (AggregateResult ar : [
      SELECT Work_Order__c wid, SUM(Duration_in_Minutes__c) m
      FROM Time_Report__c
      WHERE Work_Order__c IN :woIds
      GROUP BY Work_Order__c
    ]) {
      actual.put((Id) ar.get('wid'), (Decimal) ar.get('m'));
    }
    List<Object> series = new List<Object>();
    List<Object> rows = new List<Object>();
    for (WorkOrder wo : wos) {
      Decimal plan = (wo.DurationInMinutes != null) ? wo.DurationInMinutes : 0;
      Decimal act = actual.containsKey(wo.Id) ? actual.get(wo.Id) : 0;
      series.add(
        new Map<String, Object>{
          'label' => nz(wo.WorkOrderNumber),
          'value' => act
        }
      );
      rows.add(
        new List<Object>{
          nz(wo.WorkOrderNumber),
          String.valueOf(plan.intValue()),
          String.valueOf(act.intValue()),
          String.valueOf((act - plan).intValue())
        }
      );
    }
    return blocks(
      'Time worked vs planned (minutes).',
      new List<Object>{
        new Map<String, Object>{
          'type' => 'chart',
          'chartType' => 'bar',
          'title' => 'Actual Minutes Logged',
          'series' => series
        },
        new Map<String, Object>{
          'type' => 'table',
          'columns' => new List<Object>{
            'Work Order',
            'Planned',
            'Actual',
            'Variance'
          },
          'rows' => rows
        }
      }
    );
  }

  public static List<Output> measureTypeDistribution(List<Input> reqs) {
    Input in0 = first(reqs);
    Id assetId = resolveAnyAssetId(in0);
    String woId = cleanId(in0.workOrderId);
    List<AggregateResult> rows;
    if (assetId != null) {
      Set<Id> ids = wagonAndWheelsetIds(assetId);
      rows = [
        SELECT Measure_Type__c mt, COUNT(Id) c
        FROM Measure_Point__c
        WHERE Asset__c IN :ids
        GROUP BY Measure_Type__c
      ];
    } else if (woId != null) {
      rows = [
        SELECT Measure_Type__c mt, COUNT(Id) c
        FROM Measure_Point__c
        WHERE Work_Order__c = :woId
        GROUP BY Measure_Type__c
      ];
    } else {
      return msg('Tell me which wagon, wheelset, or work order to summarise.');
    }
    List<Object> series = new List<Object>();
    Integer total = 0;
    for (AggregateResult ar : rows) {
      String mt = (String) ar.get('mt');
      Integer c = (Integer) ar.get('c');
      if (String.isBlank(mt))
        mt = 'Unspecified';
      series.add(new Map<String, Object>{ 'label' => mt, 'value' => c });
      total += c;
    }
    if (total == 0)
      return msg('No measure points found.');
    return blocks(
      'Measure outcome distribution (' + total + ' measures).',
      new List<Object>{
        new Map<String, Object>{
          'type' => 'chart',
          'chartType' => 'donut',
          'title' => 'Measure Outcomes',
          'series' => series
        }
      }
    );
  }

  public static List<Output> codeFrequency(List<Input> reqs) {
    Input in0 = first(reqs);
    String wagon = resolveWagonNumber(in0);
    String wagonFilter = (wagon != null) ? ' Wagon_Number__c = :wagon AND' : '';

    Map<String, Integer> tally = new Map<String, Integer>();
    for (
      String fld : new List<String>{
        'Cause_Codes__c',
        'Damage_Codes__c',
        'Work_Delay_Codes__c'
      }
    ) {
      String q =
        'SELECT ' +
        fld +
        ' v, COUNT(Id) c FROM WorkOrder WHERE' +
        wagonFilter +
        ' ' +
        fld +
        ' != null GROUP BY ' +
        fld +
        ' LIMIT 50';
      for (AggregateResult ar : Database.query(q)) {
        String v = (String) ar.get('v');
        if (String.isBlank(v))
          continue;
        String shortV = v.length() > 30 ? v.substring(0, 30) : v;
        tally.put(
          shortV,
          (tally.containsKey(shortV) ? tally.get(shortV) : 0) +
          (Integer) ar.get('c')
        );
      }
    }
    if (tally.isEmpty())
      return msg('No cause/damage/delay codes recorded.');
    List<Object> series = new List<Object>();
    for (String k : tally.keySet())
      series.add(
        new Map<String, Object>{ 'label' => k, 'value' => tally.get(k) }
      );
    return blocks(
      'Cause / damage / delay code frequency.',
      new List<Object>{
        new Map<String, Object>{
          'type' => 'chart',
          'chartType' => 'bar',
          'title' => 'Coded Reasons',
          'series' => series
        }
      }
    );
  }

  public static List<Output> shiftActivityCalendar(List<Input> reqs) {
    Input in0 = first(reqs);
    String wagon = resolveWagonNumber(in0);
    // Default month = month of the most recent work order start (or just this period via data).
    List<WorkOrder> wos = (wagon != null)
      ? [
          SELECT WorkOrderNumber, StartDate, CreatedDate
          FROM WorkOrder
          WHERE Wagon_Number__c = :wagon
          ORDER BY CreatedDate DESC
          LIMIT 60
        ]
      : [
          SELECT WorkOrderNumber, StartDate, CreatedDate
          FROM WorkOrder
          ORDER BY CreatedDate DESC
          LIMIT 60
        ];
    if (wos.isEmpty())
      return msg('No work activity found.');

    // Pick the month from the explicit input, else the newest record.
    Integer yr;
    Integer mo;
    if (String.isNotBlank(in0.month) && in0.month.contains('-')) {
      yr = Integer.valueOf(in0.month.split('-')[0]);
      mo = Integer.valueOf(in0.month.split('-')[1]);
    } else {
      Datetime newest = (wos[0].StartDate != null)
        ? wos[0].StartDate
        : wos[0].CreatedDate;
      yr = newest.year();
      mo = newest.month();
    }
    List<Object> events = new List<Object>();
    for (WorkOrder wo : wos) {
      Datetime d = (wo.StartDate != null) ? wo.StartDate : wo.CreatedDate;
      if (d.year() == yr && d.month() == mo) {
        events.add(
          new Map<String, Object>{
            'day' => d.day(),
            'label' => nz(wo.WorkOrderNumber)
          }
        );
      }
    }
    String mm = (mo < 10 ? '0' : '') + mo;
    return blocks(
      'Shift activity for ' + yr + '-' + mm + '.',
      new List<Object>{
        new Map<String, Object>{
          'type' => 'calendar',
          'title' => 'Work Activity',
          'month' => yr +
          '-' +
          mm,
          'events' => events
        }
      }
    );
  }

  /**
   * Carousel of every image file attached anywhere in the work order hierarchy:
   * the work order, its child work orders, related work order line items, and
   * related measure points. Image extensions only.
   */
  public static List<Output> workOrderImages(List<Input> reqs) {
    Input in0 = first(reqs);
    Id woId = (Id) cleanId(in0.workOrderId);
    if (woId == null)
      return msg('Open a work order (or name one) so I can find its images.');

    // Build the set of records whose attachments we scan, plus a map from each
    // record back to the WORK ORDER the user should drill into.
    Set<Id> entityIds = new Set<Id>{ woId };
    Map<Id, String> labelByEntity = new Map<Id, String>{
      woId => 'This Work Order'
    };
    Map<Id, Id> entityToWorkOrder = new Map<Id, Id>{ woId => woId };

    // Child work orders
    Set<Id> woFamily = new Set<Id>{ woId };
    for (WorkOrder child : [
      SELECT Id, WorkOrderNumber
      FROM WorkOrder
      WHERE ParentWorkOrderId = :woId OR RootWorkOrderId = :woId
    ]) {
      entityIds.add(child.Id);
      woFamily.add(child.Id);
      labelByEntity.put(child.Id, 'WO ' + nz(child.WorkOrderNumber));
      entityToWorkOrder.put(child.Id, child.Id); // a child WO drills to itself
    }
    // Line items on the WO + its children
    for (WorkOrderLineItem li : [
      SELECT Id, Subject, WorkOrderId
      FROM WorkOrderLineItem
      WHERE WorkOrderId IN :woFamily
    ]) {
      entityIds.add(li.Id);
      labelByEntity.put(li.Id, 'Line: ' + nz(li.Subject));
      entityToWorkOrder.put(li.Id, li.WorkOrderId);
    }
    // Measure points on the WO + its children
    for (Measure_Point__c mp : [
      SELECT Id, Component_Name__c, Work_Order__c
      FROM Measure_Point__c
      WHERE Work_Order__c IN :woFamily
    ]) {
      entityIds.add(mp.Id);
      labelByEntity.put(mp.Id, 'Measure: ' + nz(mp.Component_Name__c));
      entityToWorkOrder.put(mp.Id, mp.Work_Order__c);
    }

    // All files linked to any of those records, image extensions only.
    Set<String> imageExts = new Set<String>{
      'png',
      'jpg',
      'jpeg',
      'gif',
      'bmp',
      'webp',
      'svg',
      'heic',
      'tif',
      'tiff'
    };
    List<Object> cards = new List<Object>();
    Set<Id> seenDocs = new Set<Id>();
    for (ContentDocumentLink cdl : [
      SELECT
        ContentDocumentId,
        LinkedEntityId,
        ContentDocument.Title,
        ContentDocument.FileExtension
      FROM ContentDocumentLink
      WHERE LinkedEntityId IN :entityIds
      ORDER BY ContentDocument.CreatedDate DESC
    ]) {
      String ext = (cdl.ContentDocument.FileExtension == null)
        ? ''
        : cdl.ContentDocument.FileExtension.toLowerCase();
      if (!imageExts.contains(ext))
        continue;
      if (seenDocs.contains(cdl.ContentDocumentId))
        continue; // a file linked to several records: show once
      seenDocs.add(cdl.ContentDocumentId);
      cards.add(
        new Map<String, Object>{
          'title' => nz(cdl.ContentDocument.Title),
          'subtitle' => labelByEntity.containsKey(cdl.LinkedEntityId)
            ? labelByEntity.get(cdl.LinkedEntityId)
            : '',
          'caption' => '.' + ext,
          // Renders in the supervisor's authenticated browser session.
          'imageUrl' => '/sfc/servlet.shepherd/document/download/' +
          cdl.ContentDocumentId,
          // The work order to drill into when the image is tapped.
          'workOrderId' => entityToWorkOrder.get(cdl.LinkedEntityId)
        }
      );
    }

    if (cards.isEmpty())
      return msg(
        'No image attachments found in this work order, its child work orders, line items, or measures.'
      );
    return blocks(
      'Found ' + cards.size() + ' image(s) across this work order hierarchy.',
      new List<Object>{
        new Map<String, Object>{
          'type' => 'carousel',
          'title' => 'Work Order Images',
          'cards' => cards
        }
      }
    );
  }

  // ============================ HELPERS ===================================

  private static Input first(List<Input> reqs) {
    return (reqs != null &&
      !reqs.isEmpty() &&
      reqs[0] != null)
      ? reqs[0]
      : new Input();
  }

  /** Wrap blocks into the fenced output the renderer extracts. */
  private static List<Output> blocks(String prose, List<Object> blockList) {
    String fence =
      '```agent-blocks\n' +
      JSON.serialize(new Map<String, Object>{ 'blocks' => blockList }) +
      '\n```';
    Output o = new Output();
    o.message = prose + '\n\n' + fence;
    return new List<Output>{ o };
  }

  private static List<Output> msg(String text) {
    Output o = new Output();
    o.message = text;
    return new List<Output>{ o };
  }

  private static Map<String, Object> eventOf(
    String title,
    String dateStr,
    String status,
    String descr,
    Datetime sortKey
  ) {
    return new Map<String, Object>{
      'title' => title,
      'date' => dateStr,
      'status' => status,
      'description' => descr,
      '_sort' => (sortKey == null ? 0 : sortKey.getTime())
    };
  }

  private static void sortEventsDesc(List<Object> events) {
    // simple insertion sort by _sort desc (lists are small, <=100)
    for (Integer i = 1; i < events.size(); i++) {
      Object cur = events[i];
      Long ck = (Long) ((Map<String, Object>) cur).get('_sort');
      Integer j = i - 1;
      while (
        j >= 0 &&
        (Long) ((Map<String, Object>) events[j]).get('_sort') < ck
      ) {
        events[j + 1] = events[j];
        j--;
      }
      events[j + 1] = cur;
    }
  }

  /** Remove the internal _sort key before serializing. */
  private static List<Object> stripSort(List<Object> events) {
    List<Object> out = new List<Object>();
    for (Object e : events) {
      Map<String, Object> m = (Map<String, Object>) e;
      m.remove('_sort');
      out.add(m);
    }
    return out;
  }

  // ---- target resolution -------------------------------------------------

  private static String cleanId(String v) {
    if (String.isBlank(v))
      return null;
    try {
      return (String) Id.valueOf(v.trim());
    } catch (Exception e) {
      return null;
    }
  }

  /** Any asset id directly given, or the work order's asset. */
  private static Id resolveAnyAssetId(Input in0) {
    String aid = cleanId(in0.assetId);
    if (aid != null)
      return (Id) aid;
    String woId = cleanId(in0.workOrderId);
    if (woId != null) {
      List<WorkOrder> w = [
        SELECT AssetId
        FROM WorkOrder
        WHERE Id = :woId
        LIMIT 1
      ];
      if (!w.isEmpty() && w[0].AssetId != null)
        return w[0].AssetId;
    }
    // wagon number -> asset by name
    if (String.isNotBlank(in0.wagonNumber)) {
      List<Asset> a = [
        SELECT Id
        FROM Asset
        WHERE Name = :in0.wagonNumber
        LIMIT 1
      ];
      if (!a.isEmpty())
        return a[0].Id;
    }
    return null;
  }

  /** The WAGON (parent) asset id — climbs to parent if the resolved asset is a wheelset. */
  private static Id resolveWagonAssetId(Input in0) {
    Id aid = resolveAnyAssetId(in0);
    if (aid == null)
      return null;
    List<Asset> a = [SELECT Id, ParentId FROM Asset WHERE Id = :aid LIMIT 1];
    if (a.isEmpty())
      return aid;
    return (a[0].ParentId != null) ? a[0].ParentId : a[0].Id;
  }

  private static Set<Id> wagonAndWheelsetIds(Id wagonOrAsset) {
    Set<Id> ids = new Set<Id>{ wagonOrAsset };
    for (Asset a : [SELECT Id FROM Asset WHERE ParentId = :wagonOrAsset])
      ids.add(a.Id);
    return ids;
  }

  private static String resolveWagonNumber(Input in0) {
    if (String.isNotBlank(in0.wagonNumber))
      return in0.wagonNumber;
    String woId = cleanId(in0.workOrderId);
    if (woId != null) {
      List<WorkOrder> w = [
        SELECT Wagon_Number__c
        FROM WorkOrder
        WHERE Id = :woId
        LIMIT 1
      ];
      if (!w.isEmpty() && String.isNotBlank(w[0].Wagon_Number__c))
        return w[0].Wagon_Number__c;
    }
    return null;
  }

  // ---- formatting --------------------------------------------------------

  private static String nz(String s) {
    return s == null ? '' : s;
  }

  /** Parse the first integer in a string ("last 5" or "5" -> 5), else null. */
  private static Integer parseIntOrNull(String s) {
    if (String.isBlank(s))
      return null;
    Matcher m = Pattern.compile('\\d+').matcher(s);
    if (m.find()) {
      try {
        return Integer.valueOf(m.group());
      } catch (Exception e) {
        return null;
      }
    }
    return null;
  }

  /** Parse the first decimal in a string ("over 20" / "20.5" -> 20 / 20.5), else null. */
  private static Decimal parseDecimalOrNull(String s) {
    if (String.isBlank(s))
      return null;
    Matcher m = Pattern.compile('-?\\d+(\\.\\d+)?').matcher(s);
    if (m.find()) {
      try {
        return Decimal.valueOf(m.group());
      } catch (Exception e) {
        return null;
      }
    }
    return null;
  }

  /** Map a free-text outcome filter to a set of valid Measure_Type__c picklist values. */
  private static Set<String> parseOutcomes(String s) {
    Set<String> out = new Set<String>();
    if (String.isBlank(s))
      return out;
    String t = s.toLowerCase();
    if (t.contains('scrap'))
      out.add('Scrap');
    if (t.contains('attention') || t.contains('require'))
      out.add('Attention Required');
    if (t.contains('ok') || t.contains('pass'))
      out.add('OK');
    // "measure" as an outcome only when not part of "attention"/general phrasing
    if (Pattern.compile('(^|[^a-z])measure([^a-z]|$)').matcher(t).find())
      out.add('Measure');
    return out;
  }

  /** Normalise a value-type filter to a valid MeasureValue_Type__c picklist value, else null. */
  private static String normValueType(String s) {
    if (String.isBlank(s))
      return null;
    String t = s.toLowerCase();
    for (
      String v : new List<String>{
        'Temperature',
        'Pressure',
        'Level',
        'Width',
        'Length',
        'Depth'
      }
    ) {
      if (t.contains(v.toLowerCase()))
        return v;
    }
    return null;
  }

  /** Human-readable description of the applied measure criteria (for titles/prose). */
  private static String describeCriteria(
    Decimal minVal,
    Decimal maxVal,
    Set<String> outcomes,
    String vType
  ) {
    List<String> bits = new List<String>();
    if (minVal != null && maxVal != null)
      bits.add('between ' + minVal + ' and ' + maxVal);
    else if (minVal != null)
      bits.add('over ' + minVal);
    else if (maxVal != null)
      bits.add('under ' + maxVal);
    if (!outcomes.isEmpty()) {
      List<String> os = new List<String>(outcomes);
      os.sort();
      bits.add('(' + String.join(os, ' / ') + ')');
    }
    if (vType != null)
      bits.add(vType.toLowerCase());
    return bits.isEmpty() ? '' : String.join(bits, ' ');
  }

  private static Map<String, Object> detailRow(String label, String value) {
    return new Map<String, Object>{ 'label' => label, 'value' => value };
  }

  /** Latest image ContentVersion download URL per linked entity (measure point), else absent. */
  private static Map<Id, String> latestImageUrlByEntity(Set<Id> entityIds) {
    Map<Id, String> urlByEntity = new Map<Id, String>();
    if (entityIds == null || entityIds.isEmpty())
      return urlByEntity;
    Set<String> imageExts = new Set<String>{
      'png',
      'jpg',
      'jpeg',
      'gif',
      'bmp',
      'webp',
      'svg',
      'heic',
      'tif',
      'tiff'
    };
    for (ContentDocumentLink cdl : [
      SELECT ContentDocumentId, LinkedEntityId, ContentDocument.FileExtension
      FROM ContentDocumentLink
      WHERE LinkedEntityId IN :entityIds
      ORDER BY ContentDocument.CreatedDate DESC
    ]) {
      if (urlByEntity.containsKey(cdl.LinkedEntityId))
        continue; // newest first; keep first
      String ext = (cdl.ContentDocument.FileExtension == null)
        ? ''
        : cdl.ContentDocument.FileExtension.toLowerCase();
      if (!imageExts.contains(ext))
        continue;
      urlByEntity.put(
        cdl.LinkedEntityId,
        '/sfc/servlet.shepherd/document/download/' + cdl.ContentDocumentId
      );
    }
    return urlByEntity;
  }

  /** Normalise an event-type filter to 'measure' | 'workorder' | null. */
  private static String normType(String s) {
    if (String.isBlank(s))
      return null;
    String t = s.toLowerCase();
    if (t.contains('measure'))
      return 'measure';
    if (t.contains('work') || t.contains('order') || t.contains('wo'))
      return 'workorder';
    return null;
  }

  private static String fmtDate(Datetime d) {
    return (d == null) ? '' : d.format('dd MMM yyyy HH:mm');
  }
  private static String fmtShort(Datetime d) {
    return (d == null) ? '' : d.format('dd MMM');
  }
}
