import { LightningElement, api, track, wire } from "lwc";
import {
  publish,
  subscribe,
  unsubscribe,
  MessageContext
} from "lightning/messageService";
import FLOW_LAUNCHER from "@salesforce/messageChannel/FlowLauncher__c";
import WAGON_DIAGRAM from "@salesforce/resourceUrl/WagonDiagramTop";
import getWagonAsset from "@salesforce/apex/KioskController.getWagonAsset";
import getMeasurePointsByAsset from "@salesforce/apex/KioskController.getMeasurePointsByAsset";
import getMeasurePoints from "@salesforce/apex/KioskController.getMeasurePoints";
import getMeasureImages from "@salesforce/apex/KioskController.getMeasureImages";
import uploadMeasureImage from "@salesforce/apex/KioskController.uploadMeasureImage";
import saveMeasurePoint from "@salesforce/apex/KioskController.saveMeasurePoint";
import getAssetTasks from "@salesforce/apex/KioskController.getAssetTasks";
import getAssetReviewDetail from "@salesforce/apex/KioskController.getAssetReviewDetail";
import createAssetTask from "@salesforce/apex/KioskController.createAssetTask";
import updateAssetTask from "@salesforce/apex/KioskController.updateAssetTask";
import updateAssetSerial from "@salesforce/apex/KioskController.updateAssetSerial";
import markWorkStepCompleted from "@salesforce/apex/KioskController.markWorkStepCompleted";
import updateWorkStepStatus from "@salesforce/apex/KioskController.updateWorkStepStatus";
import consumePart from "@salesforce/apex/KioskController.consumePart";
import getConsumableProducts from "@salesforce/apex/KioskController.getConsumableProducts";
import getWorkpackChildProgress from "@salesforce/apex/KioskController.getWorkpackChildProgress";
import getWorkOrderTile from "@salesforce/apex/KioskController.getWorkOrderTile";
import getRaisedTasks from "@salesforce/apex/KioskController.getRaisedTasks";
import getWorkOrderDetail from "@salesforce/apex/KioskController.getWorkOrderDetail";
import saveWorkOrderNotes from "@salesforce/apex/KioskController.saveWorkOrderNotes";
import getWorkTypes from "@salesforce/apex/KioskController.getWorkTypes";
import getAssetFields from "@salesforce/apex/KioskController.getAssetFields";
import saveAssetFields from "@salesforce/apex/KioskController.saveAssetFields";
import { woStatus, woNextStep, COLORS, RANK } from "c/kioskStatus";
import { WO_FIELDS, ASSET_FIELDS, mergeConfig } from "c/kioskConfigDefaults";

// Per-plan progress ring geometry (small inline donut).
const RING_R = 18;
const RING_CIRC = 2 * Math.PI * RING_R;

const MEASURE_TYPES = ["Attention Required", "Measure", "OK", "Scrap"];
const VALUE_TYPES = [
  "Depth",
  "Temperature",
  "Pressure",
  "Level",
  "Width",
  "Length"
];
const DEFECT_LOCATIONS = [
  "Lower Lug",
  "Ribs",
  "Palm",
  "Upper Pulling Lug",
  "Lower Pulling Lug",
  "Uper Knuckle Pin Hole",
  "Lower Knuckle Pin Hole",
  "Back Radius"
];

// Percentage-positioned overlay zones across the wagon diagram (left%, width%).
// Four wheelsets L1..L4 spread across the top-view wagons. Tunable to the art.
const ZONE_LAYOUT = [
  { left: 6, width: 18 },
  { left: 30, width: 18 },
  { left: 55, width: 18 },
  { left: 76, width: 18 }
];

// Cause / Delay / Priority picklists (values match the org + workOrderDetail.js exactly)
const CAUSE_OPTIONS = [
  { value: "", label: "— Select —" },
  { value: "0001, Accidental Damage", label: "0001 – Accidental Damage" },
  { value: "0003, Inadequate design", label: "0003 – Inadequate Design" },
  { value: "0004, Fire Damage", label: "0004 – Fire Damage" },
  { value: "0007, lubrication", label: "0007 – Lubrication" },
  { value: "0008, maint inadequate", label: "0008 – Maint Inadequate" },
  { value: "0009, Improper Operation", label: "0009 – Improper Operation" },
  { value: "0010, Wear and Tear", label: "0010 – Wear and Tear" },
  { value: "1002, Incorrect Adjustment", label: "1002 – Incorrect Adjustment" },
  { value: "1015, Blocked", label: "1015 – Blocked" },
  {
    value: "1049, Charge, End Of Battery Life",
    label: "1049 – End Of Battery Life"
  },
  {
    value: "1148, Environment, Conditions",
    label: "1148 – Environment/Conditions"
  },
  { value: "1350, vibration", label: "1350 – Vibration" },
  { value: "9997, No fault found", label: "9997 – No Fault Found" },
  { value: "9998, not known", label: "9998 – Not Known" },
  { value: "9999, not suitable code", label: "9999 – Not Suitable Code" }
];
const DELAY_OPTIONS = [
  { value: "", label: "— Select —" },
  {
    value: "1, Plant not in agreed condition",
    label: "1 – Plant Not In Agreed Condition"
  },
  { value: "2, Permit Not Available", label: "2 – Permit Not Available" },
  {
    value: "3, Insufficient Capacity Available",
    label: "3 – Insufficient Capacity Available"
  },
  { value: "4, Materials Not Available", label: "4 – Materials Not Available" },
  {
    value: "5, Correct Tooling Unavailable",
    label: "5 – Correct Tooling Unavailable"
  },
  {
    value: "6, External Labour Not Available",
    label: "6 – External Labour Not Available"
  },
  { value: "7, Cranage Unavailable", label: "7 – Cranage Unavailable" },
  {
    value: "8, Access Staging / Equipment Unavailable",
    label: "8 – Access/Staging Unavailable"
  },
  { value: "9, Task Conflicts", label: "9 – Task Conflicts" },
  {
    value: "10, Work Took Longer than Planned",
    label: "10 – Work Took Longer Than Planned"
  },
  { value: "11, Unscheduled Work", label: "11 – Unscheduled Work" },
  { value: "12, Inclement Weather", label: "12 – Inclement Weather" },
  {
    value: "13, Higher priority work took Preference",
    label: "13 – Higher Priority Preference"
  },
  { value: "14, Services not Available", label: "14 – Services Not Available" },
  { value: "16, Work Cancelled", label: "16 – Work Cancelled" }
];
const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Critical"];
const TASK_STATUS_OPTIONS = [
  "New",
  "Assigned",
  "In Progress",
  "Partially Completed",
  "Completed",
  "Closed"
];

// Simple SVG chart geometry
const CHART_W = 640;
const CHART_H = 240;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 24;
const PAD_B = 36;

export default class AssetReview extends LightningElement {
  @api workOrderId;
  @api sessionToken;
  @api workerName;
  // Deep link: WO to preselect on open (from the workpack page). Back returns to that page.
  @api initialWorkOrderId;
  // Merged Kiosk Config (woTile, assetTile, wtFilter, assetDrawer).
  @api config;

  // v6 workspace state
  @track woRows = []; // getWorkpackChildProgress rows (all depths under the workpack)
  @track wpInfo = null; // the workpack itself: { id, number, subject }
  @track activeTab = "measure";
  @track wtSel = []; // work type names selected in the focus filter
  @track tile = {};
  @track listCollapsed = false;
  @track listPinned = false;
  @track drawerOpen = false;
  @track drawerServer = []; // [{key,value,type,editable,options}] from getAssetFields
  @track drawerDraft = {}; // key -> edited value
  @track drawerSaving = false;
  @track drawerFeedback = "";
  @track drawerFeedbackIsError = false;
  @track mapView = "map"; // map | schematic
  @track zoomed = false; // icicle zoomed to the selected component
  @track woNotes = "";
  @track newNote = "";
  @track notesCause = "";
  @track notesDelay = "";
  @track notesDamage = "";
  @track notesFeedback = "";
  @track notesFeedbackIsError = false;
  @track savingNotes = false;
  @track raised = [];
  // Raise Task modal
  @track showRaise = false;
  @track raiseAssetId = "";
  @track raiseWtQuery = "";
  @track raiseWtId = "";
  @track raiseSubject = "";
  @track raiseDescription = "";
  @track raiseFeedback = "";
  @track raiseSaving = false;
  @track workTypeList = [];

  wagonDiagramUrl = WAGON_DIAGRAM;

  @track wagon = null;
  @track wheelsets = [];
  @track allPoints = []; // every measure point across the wagon (for charts)
  @track isLoading = true;
  @track hasError = false;

  @track selectedWheelsetId = null; // level-2 component anchor
  @track selectedChildId = null; // level-3 sub-asset (terminal selection)
  @track assetDetail = { workPlans: [], parts: [] }; // work plans + parts for active asset
  @track expandedPlanIds = {};
  @track planActionError = "";
  markingStepId = null;

  // ── Flow launch (screen flows on work steps, via the Aura flowHost bridge) ──
  @wire(MessageContext) messageContext;
  _flowSubscription;
  _flowResolver = null; // resolve() of the in-flight flow promise
  _flowRequestId = null; // correlation id for the in-flight flow
  _flowSeq = 0; // monotonic counter for unique request ids
  launchingStepId = null; // step whose flow is currently open (guards double-tap)
  @track partActionError = "";
  consuming = false;
  @track showAddPart = false;
  @track productOptions = [];
  selectedAddProductId = "";
  @track plansExpanded = true;
  @track partsExpanded = true;
  @track wheelsetPoints = []; // measure points for the selected wheelset
  @track sideMode = "off"; // measure side panel: off | doc | trend
  @track sidePointId = null;
  _pendingShow = false;
  @track measureImages = {}; // measurePointId -> base64 data URI (lazy-loaded)
  @track pendingImagePreview = null; // data URI preview of an image staged in the form
  _pendingImageBase64 = null; // raw base64 to upload on save
  _pendingImageName = null;
  @track tasks = [];
  @track loadingDetail = false;

  // WO filter: tap a work order (task) card to filter measures + work plans to that WO.
  @track selectedFilterWoId = null;
  @track selectedFilterWoNumber = "";

  // Collapsible sections
  @track overviewExpanded = true;
  @track detailExpanded = true;
  @track diagramExpanded = true; // collapses to just the L1–L4 indicator strip
  @track chartsExpanded = true;

  // Serial edit
  @track serialDraft = "";
  @track savingSerial = false;

  // Measure form
  @track showMeasureForm = false;
  @track isSavingMeasure = false;
  @track measureFeedback = "";
  @track measureFeedbackIsError = false;
  @track editId = null;
  @track editComponentName = "";
  @track editMeasureType = "OK";
  @track editComments = "";
  @track editReviewNotes = "";
  @track editMeasureValue = "";
  @track editMeasureValueType = "Depth";
  @track editDefectLocation = "";

  // Task form (create + edit)
  @track showTaskForm = false;
  @track isSavingTask = false;
  @track taskFeedback = "";
  @track taskFeedbackIsError = false;
  @track taskEditId = null; // null = create, else update
  @track taskSubject = "";
  @track taskDescription = "";
  @track taskCauseCodes = "";
  @track taskDelayCodes = "";
  @track taskStartDate = "";
  @track taskComponent = "";
  @track taskDurationHours = "";
  @track taskPriority = "Medium";
  @track taskStatus = "New";
  @track taskComments = "";

  connectedCallback() {
    this.loadWagon();
    if (!this._flowSubscription) {
      this._flowSubscription = subscribe(
        this.messageContext,
        FLOW_LAUNCHER,
        (msg) => this._handleFlowMessage(msg)
      );
    }
  }

  disconnectedCallback() {
    if (this._flowSubscription) {
      unsubscribe(this._flowSubscription);
      this._flowSubscription = null;
    }
  }

  // Result coming back from the Aura flow host.
  _handleFlowMessage(msg) {
    if (!msg || msg.messageType !== "result") return;
    if (!this._flowResolver || msg.requestId !== this._flowRequestId) return;
    const resolve = this._flowResolver;
    this._flowResolver = null;
    this._flowRequestId = null;
    resolve(msg.status === "success" ? "success" : "cancel");
  }

  // Publishes a launch request and resolves when the host reports a result.
  _launchFlow(flowApiName, recordId) {
    const requestId = `ar-${this.workOrderId || "wo"}-${this._flowSeq++}`;
    this._flowRequestId = requestId;
    return new Promise((resolve) => {
      this._flowResolver = resolve;
      publish(this.messageContext, FLOW_LAUNCHER, {
        messageType: "open",
        flowApiName,
        recordId,
        requestId
      });
    });
  }

  // Step tapped: if it has a linked action (flow), mark In Progress and open the
  // flow; on finish → Completed, on cancel → revert to New. Mirrors workOrderDetail.
  async handleStepClick(evt) {
    const stepId = evt.currentTarget.dataset.stepId;
    const actionDef = evt.currentTarget.dataset.actionDef;
    if (!stepId || !actionDef) return;
    if (this._flowResolver || this.launchingStepId) return; // one flow at a time
    if (evt.currentTarget && typeof evt.currentTarget.blur === "function") {
      evt.currentTarget.blur();
    }
    this.launchingStepId = stepId;
    this.planActionError = "";
    try {
      await updateWorkStepStatus({
        token: this.sessionToken,
        workStepId: stepId,
        status: "In Progress"
      });
      this._updateStepStatusLocally(stepId, "In Progress");
    } catch {
      /* continue regardless — still open the flow */
    }

    try {
      const result = await this._launchFlow(actionDef, stepId);
      if (result === "success") {
        try {
          await updateWorkStepStatus({
            token: this.sessionToken,
            workStepId: stepId,
            status: "Completed"
          });
          this._updateStepStatusLocally(stepId, "Completed");
        } catch {
          this.planActionError = "Step finished but status update failed.";
        }
      } else {
        try {
          await updateWorkStepStatus({
            token: this.sessionToken,
            workStepId: stepId,
            status: "New"
          });
          this._updateStepStatusLocally(stepId, "New");
        } catch {
          /* ignore */
        }
      }
    } finally {
      this.launchingStepId = null;
    }
  }

  _updateStepStatusLocally(stepId, status) {
    const plans = (this.assetDetail.workPlans || []).map((p) => ({
      ...p,
      steps: (p.steps || []).map((s) => {
        return s.id === stepId ? { ...s, status } : s;
      })
    }));
    this.assetDetail = { ...this.assetDetail, workPlans: plans };
  }

  async loadWagon() {
    this.isLoading = true;
    this.hasError = false;
    try {
      const [wagon, points, rawRows, wpDetail] = await Promise.all([
        getWagonAsset({
          token: this.sessionToken,
          workOrderId: this.workOrderId
        }),
        getMeasurePoints({
          token: this.sessionToken,
          workOrderId: this.workOrderId
        }),
        getWorkpackChildProgress({
          token: this.sessionToken,
          workpackId: this.workOrderId
        }),
        getWorkOrderDetail({
          token: this.sessionToken,
          workOrderId: this.workOrderId
        })
      ]);
      this.woRows = JSON.parse(rawRows || "[]");
      this.wpInfo = {
        id: this.workOrderId,
        number: wpDetail.woNumber,
        subject: wpDetail.subject
      };
      this.wagon = wagon;
      this.wheelsets = wagon.wheelsets || [];
      this.allPoints = points || [];
    } catch {
      this.hasError = true;
    } finally {
      this.isLoading = false;
    }
    if (this.initialWorkOrderId && !this.hasError) {
      await this._applyDeepLink(this.initialWorkOrderId);
    }
  }

  // Select the asset a WO sits on (L2 component, then L3 sub-asset) and load its detail.
  async _selectAssetForRow(row) {
    const l2Id = row.l2AssetId || row.assetId;
    const ws = this.wheelsets.find((w) => w.id === l2Id);
    if (!ws) return false;
    this.selectedWheelsetId = ws.id;
    this.selectedChildId = null;
    this.diagramExpanded = false;
    this.chartsExpanded = false;
    this.serialDraft = ws.serialNumber || "";
    let loadId = ws.id;
    if (
      row.assetId &&
      row.assetId !== ws.id &&
      ws.children &&
      ws.children.some((c) => c.id === row.assetId)
    ) {
      this.selectedChildId = row.assetId;
      const child = this._findChild(row.assetId);
      this.serialDraft = child ? child.serialNumber || "" : "";
      loadId = row.assetId;
    }
    await this.loadDetail(loadId);
    return true;
  }

  async _applyDeepLink(woId) {
    try {
      const row = this.woRows.find((r) => r.id === woId);
      if (!row) return;
      if (await this._selectAssetForRow(row)) {
        await this._selectWo(woId);
      }
    } catch {
      // deep link is best-effort; fall back to the normal landing view
    }
  }

  async _selectWo(woId) {
    const row = this.woRows.find((r) => r.id === woId);
    this.selectedFilterWoId = woId;
    this.selectedFilterWoNumber = row
      ? row.number || ""
      : (this.wpInfo && this.wpInfo.number) || "";
    this._loadTile(woId);
    this._loadWoNotes(woId);
    if (this.activeTab === "raised") this._loadRaised();
  }

  async _loadTile(woId) {
    try {
      const raw = await getWorkOrderTile({
        token: this.sessionToken,
        workOrderId: woId,
        fieldsJson: JSON.stringify(this._cfg.woTile)
      });
      if (this.selectedFilterWoId === woId) this.tile = JSON.parse(raw || "{}");
    } catch {
      this.tile = {};
    }
  }

  async _loadWoNotes(woId) {
    try {
      const d = await getWorkOrderDetail({
        token: this.sessionToken,
        workOrderId: woId
      });
      if (this.selectedFilterWoId !== woId) return;
      this.woNotes = d.supervisorNotes || "";
      this.notesCause = d.causeCodes || "";
      this.notesDelay = d.workDelayCodes || "";
      this.notesDamage = d.damageCodes || "";
      this.newNote = "";
      this.notesFeedback = "";
      this._syncNotesTa = true;
    } catch {
      this.woNotes = "";
    }
  }

  async _loadRaised() {
    const assetId = this.activeAssetId || (this.wagon && this.wagon.id);
    if (!assetId) return;
    try {
      this.raised =
        (await getRaisedTasks({ token: this.sessionToken, assetId })) || [];
    } catch {
      this.raised = [];
    }
  }

  get _cfg() {
    return mergeConfig(this.config);
  }

  // ─── WO list handlers ───
  async handlePickWo(evt) {
    const woId = evt.currentTarget.dataset.woId;
    if (!woId) return;
    if (this.selectedFilterWoId === woId) {
      this._clearWoFilter();
      return;
    }
    const row = this.woRows.find((r) => r.id === woId);
    if (row && !this._rowInScope(row)) {
      await this._selectAssetForRow(row);
    }
    await this._selectWo(woId);
  }

  _rowInScope(row) {
    const l2 = this.selectedWheelsetId;
    if (!l2) return false;
    if (this.selectedChildId) return row.assetId === this.selectedChildId;
    return row.l2AssetId === l2 || row.assetId === l2;
  }

  _autoCollapse() {
    if (!this.listPinned) this.listCollapsed = true;
  }

  _autoExpand() {
    this.listCollapsed = false;
  }

  handleToggleList() {
    this.listCollapsed = !this.listCollapsed;
  }
  handleTogglePin() {
    this.listPinned = !this.listPinned;
    if (this.listPinned) this.listCollapsed = false;
  }
  handleToggleDrawer() {
    this.drawerOpen = !this.drawerOpen;
    if (this.drawerOpen) this._loadDrawer();
  }

  async _loadDrawer() {
    const assetId = this.activeAssetId;
    this.drawerDraft = {};
    this.drawerFeedback = "";
    if (!assetId) {
      this.drawerServer = [];
      return;
    }
    try {
      const raw = await getAssetFields({
        token: this.sessionToken,
        assetId,
        fieldsJson: JSON.stringify(ASSET_FIELDS.map((f) => f[0]))
      });
      if (assetId === this.activeAssetId) this.drawerServer = JSON.parse(raw);
    } catch {
      this.drawerServer = [];
    }
  }

  handleDrawerInput(evt) {
    const key = evt.target.dataset.key;
    this.drawerDraft = { ...this.drawerDraft, [key]: evt.target.value };
    this.drawerFeedback = "";
  }

  handleDrawerReset() {
    this.drawerDraft = {};
    this.drawerFeedback = "";
  }

  async handleDrawerSave() {
    const assetId = this.activeAssetId;
    const keys = Object.keys(this.drawerDraft);
    if (!assetId || !keys.length) return;
    this.drawerSaving = true;
    try {
      await saveAssetFields({
        token: this.sessionToken,
        assetId,
        valuesJson: JSON.stringify(this.drawerDraft)
      });
      const prop = {
        Name: "name",
        SerialNumber: "serialNumber",
        Status: "status",
        Asset_Type__c: "assetType",
        FLOC__c: "floc",
        Entitlement_Status__c: "warrantyStatus",
        InstallDate: "installDate",
        PurchaseDate: "purchaseDate"
      };
      const patch = {};
      keys.forEach((k) => {
        if (prop[k]) patch[prop[k]] = this.drawerDraft[k] || null;
      });
      this._patchAsset(assetId, patch);
      this._notifyDataUpdate();
      await this._loadDrawer();
      this.drawerFeedback = "Saved.";
      this.drawerFeedbackIsError = false;
    } catch (e) {
      const msg = (e && e.body && e.body.message) || "";
      this.drawerFeedback = msg.includes("SESSION_EXPIRED")
        ? "Session expired. Sign in again."
        : "Save failed. Check the values and try again.";
      this.drawerFeedbackIsError = true;
    } finally {
      this.drawerSaving = false;
    }
  }

  get drawerRows() {
    const cfg = this._cfg.assetDrawer || {};
    const byKey = {};
    this.drawerServer.forEach((e) => {
      byKey[e.key] = e;
    });
    const rows = [];
    ASSET_FIELDS.forEach(([key, label]) => {
      const mode = cfg[key];
      const e = byKey[key];
      if (!mode || !e) return;
      const edited = Object.prototype.hasOwnProperty.call(
        this.drawerDraft,
        key
      );
      const value = edited ? this.drawerDraft[key] : e.value || "";
      const canEdit = mode === "E" && e.editable;
      rows.push({
        key,
        label,
        value,
        isRead: !canEdit,
        isText: canEdit && e.type === "STRING",
        isDate: canEdit && e.type === "DATE",
        isPick: canEdit && e.type === "PICKLIST",
        options: [
          { value: "", label: "—", selected: value === "" },
          ...(e.options || []).map((o) => {
            return { value: o, label: o, selected: o === value };
          })
        ],
        cls: "ov-field" + (edited ? " dirty" : "")
      });
    });
    return rows;
  }
  get hasDrawerRows() {
    return this.drawerRows.length > 0;
  }
  get drawerDirty() {
    return Object.keys(this.drawerDraft).length > 0;
  }
  get drawerSaveDisabled() {
    return this.drawerSaving || !this.drawerDirty;
  }
  get drawerSaveLabel() {
    return this.drawerSaving ? "Saving…" : "Save changes";
  }
  get drawerFeedbackClass() {
    return this.drawerFeedbackIsError ? "dr-fb error" : "dr-fb";
  }

  // ─── Map view toggle + breadcrumb ────────────────────────────────────────
  handleMapView(evt) {
    this.mapView = evt.currentTarget.dataset.view;
    this.diagramExpanded = this.mapView === "schematic";
  }
  get canSchematic() {
    return !!(this.wagon && this.wagon.hasWagonNumber);
  }
  get mapViewButtons() {
    return [
      ["map", "Map"],
      ["schematic", "Schematic"]
    ].map(([value, label]) => {
      return {
        value,
        label,
        cls: "mz-seg" + (this.mapView === value ? " on" : "")
      };
    });
  }
  get showMap() {
    return !this.showSchematic;
  }

  async handleCrumb(evt) {
    const level = evt.currentTarget.dataset.level;
    if (level === "root") {
      this.zoomed = false;
      this.handleIcicleRoot();
    } else if (level === "l2" && this.selectedChildId) {
      this._autoExpand();
      this.selectedChildId = null;
      this._clearWoFilter();
      this.zoomed = true;
      await this.loadDetail(this.selectedWheelsetId);
    }
  }
  handleToggleWt(evt) {
    const name = evt.currentTarget.dataset.wt;
    this.wtSel = this.wtSel.includes(name)
      ? this.wtSel.filter((x) => x !== name)
      : [...this.wtSel, name];
    this.listCollapsed = false;
  }
  handleClearWt() {
    this.wtSel = [];
    this.listCollapsed = false;
  }
  handleTab(evt) {
    this.activeTab = evt.currentTarget.dataset.tab;
    if (this.activeTab === "raised") this._loadRaised();
    if (this.activeTab === "notes") this._syncNotesTa = true;
  }

  // ─── Notes tab ───
  handleNewNoteChange(evt) {
    this.newNote = evt.target.value;
  }
  handleNotesCauseChange(evt) {
    this.notesCause = evt.target.value;
  }
  handleNotesDelayChange(evt) {
    this.notesDelay = evt.target.value;
  }
  get _notesWoId() {
    return this.selectedFilterWoId || this.workOrderId;
  }
  async handleSaveNotes() {
    this.savingNotes = true;
    try {
      let combined = this.woNotes;
      if (this.newNote.trim()) {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const parts = (this.workerName || "XX").trim().split(" ");
        const ini =
          parts.length >= 2
            ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
            : (this.workerName || "XX").substring(0, 2).toUpperCase();
        const entry =
          "[" +
          ini +
          " " +
          pad(d.getDate()) +
          "/" +
          pad(d.getMonth() + 1) +
          "/" +
          String(d.getFullYear()).slice(-2) +
          "]: " +
          this.newNote.trim();
        combined = this.woNotes ? entry + "\n" + this.woNotes : entry;
      }
      await saveWorkOrderNotes({
        token: this.sessionToken,
        reqJson: JSON.stringify({
          workOrderId: this._notesWoId,
          supervisorNotes: combined,
          causeCodes: this.notesCause,
          workDelayCodes: this.notesDelay,
          damageCodes: this.notesDamage
        })
      });
      this._notifyDataUpdate();
      this.woNotes = combined;
      this.newNote = "";
      this._syncNotesTa = true;
      this.notesFeedback = "Saved.";
      this.notesFeedbackIsError = false;
    } catch {
      this.notesFeedback = "Save failed. Try again.";
      this.notesFeedbackIsError = true;
    } finally {
      this.savingNotes = false;
    }
  }

  // ─── Raise Task modal ───
  async handleOpenRaise() {
    this.raiseAssetId =
      this.activeAssetId || (this.wagon && this.wagon.id) || "";
    this.raiseWtQuery = "";
    this.raiseWtId = "";
    this.raiseSubject = "";
    this.raiseDescription = "";
    this.raiseFeedback = "";
    this.showRaise = true;
    if (!this.workTypeList.length) {
      try {
        this.workTypeList = JSON.parse(
          (await getWorkTypes({ token: this.sessionToken })) || "[]"
        );
      } catch {
        this.raiseFeedback = "Could not load work types.";
      }
    }
  }
  handleRaiseCancel() {
    this.showRaise = false;
  }
  handleRaiseAssetChange(evt) {
    this.raiseAssetId = evt.target.value;
  }
  handleRaiseWtSearch(evt) {
    this.raiseWtQuery = evt.target.value;
  }
  handleRaiseWtPick(evt) {
    this.raiseWtId = evt.target.value;
  }
  handleRaiseSubject(evt) {
    this.raiseSubject = evt.target.value;
  }
  handleRaiseDescription(evt) {
    this.raiseDescription = evt.target.value;
  }
  async handleRaiseSave() {
    if (!this.raiseWtId) {
      this.raiseFeedback = "Pick a work type.";
      return;
    }
    if (!this.raiseSubject.trim()) {
      this.raiseFeedback = "Subject is required.";
      return;
    }
    this.raiseSaving = true;
    try {
      await createAssetTask({
        token: this.sessionToken,
        reqJson: JSON.stringify({
          workOrderId: this.workOrderId,
          assetId: this.raiseAssetId || null,
          subject: this.raiseSubject.trim(),
          description: this.raiseDescription || null,
          raised: true,
          workTypeId: this.raiseWtId
        })
      });
      this._notifyDataUpdate();
      this.showRaise = false;
      const raw = await getWorkpackChildProgress({
        token: this.sessionToken,
        workpackId: this.workOrderId
      });
      this.woRows = JSON.parse(raw || "[]");
      if (this.activeTab === "raised") this._loadRaised();
    } catch (e) {
      this.raiseFeedback =
        (e && e.body && e.body.message) || "Could not raise task.";
    } finally {
      this.raiseSaving = false;
    }
  }

  handleBack() {
    this.dispatchEvent(new CustomEvent("back"));
  }

  handleInputKeydown(evt) {
    evt.stopPropagation();
  }

  // ─── Component (level-2) selection ───────────────────────────────────────
  async handleSelectWheelset(evt) {
    const id = evt.currentTarget.dataset.id;
    if (!id) return;
    const firstSelection = !this.selectedWheelsetId;
    this.zoomed = true;
    this._autoExpand();
    this.selectedWheelsetId = id;
    this.selectedChildId = null; // reset the level-3 drill on a new component
    this._clearWoFilter(); // WO filter is per-asset — reset on a new component
    this.overviewExpanded = true;
    this.detailExpanded = true;
    // On the first selection, collapse the big top panels down to the indicator strip
    // so the detail is front-and-centre. User can re-expand either panel anytime.
    if (firstSelection) {
      this.diagramExpanded = false;
      this.chartsExpanded = false;
    }
    this.showMeasureForm = false;
    this.showTaskForm = false;
    const ws = this.wheelsets.find((w) => w.id === id);
    this.serialDraft = ws ? ws.serialNumber || "" : "";
    await this.loadDetail(id);
  }

  // ─── Sub-asset (level-3) selection ───────────────────────────────────────
  async handleSelectChild(evt) {
    const id = evt.currentTarget.dataset.id;
    if (!id) return;
    this._autoExpand();
    this.selectedChildId = id;
    this._clearWoFilter(); // WO filter is per-asset — reset on a new sub-asset
    this.overviewExpanded = true;
    this.detailExpanded = true;
    this.showMeasureForm = false;
    this.showTaskForm = false;
    const child = this._findChild(id);
    this.serialDraft = child ? child.serialNumber || "" : "";
    await this.loadDetail(id);
  }

  _findChild(id) {
    const ws = this.wheelsets.find((w) => w.id === this.selectedWheelsetId);
    return ws && ws.children ? ws.children.find((c) => c.id === id) : null;
  }

  async loadDetail(assetId) {
    if (this.drawerOpen) this._loadDrawer();
    this.loadingDetail = true;
    this.expandedPlanIds = {};
    try {
      const [points, tasks, detail] = await Promise.all([
        getMeasurePointsByAsset({ token: this.sessionToken, assetId }),
        getAssetTasks({
          token: this.sessionToken,
          assetId,
          workOrderId: this.workOrderId
        }),
        getAssetReviewDetail({
          token: this.sessionToken,
          workOrderId: this.workOrderId,
          assetId
        })
      ]);
      this.wheelsetPoints = points || [];
      this.tasks = tasks || [];
      this.assetDetail = detail || { workPlans: [], parts: [] };
      this._loadMeasureImages();
    } catch {
      this.wheelsetPoints = [];
      this.tasks = [];
      this.assetDetail = { workPlans: [], parts: [] };
    } finally {
      this.loadingDetail = false;
    }
  }

  // Fetch attached images (as data URIs) for the current points and merge into the map.
  async _loadMeasureImages() {
    const ids = (this.wheelsetPoints || []).map((p) => p.id).filter(Boolean);
    if (!ids.length) return;
    try {
      const imgs = await getMeasureImages({
        token: this.sessionToken,
        measurePointIds: ids
      });
      if (imgs && imgs.length) {
        const map = { ...this.measureImages };
        imgs.forEach((img) => {
          map[img.measurePointId] = img.dataUri;
        });
        this.measureImages = map;
      }
    } catch {
      // images are non-critical — ignore failures
    }
  }

  handleToggleOverview() {
    this.overviewExpanded = !this.overviewExpanded;
  }
  handleToggleDetail() {
    this.detailExpanded = !this.detailExpanded;
  }
  handleToggleDiagram() {
    this.diagramExpanded = !this.diagramExpanded;
  }
  handleToggleCharts() {
    this.chartsExpanded = !this.chartsExpanded;
  }
  handleTogglePlans() {
    this.plansExpanded = !this.plansExpanded;
  }
  handleToggleParts() {
    this.partsExpanded = !this.partsExpanded;
  }
  handleTogglePlan(evt) {
    const planId = evt.currentTarget.dataset.planId;
    this.expandedPlanIds = {
      ...this.expandedPlanIds,
      [planId]: !this.expandedPlanIds[planId]
    };
  }

  // Notify the portal that the worker made a data change → auto clock-in.
  // Bubbles across shadow boundaries (via workOrderDetail) up to workshopPortal.
  _notifyDataUpdate() {
    this.dispatchEvent(
      new CustomEvent("dataupdate", { bubbles: true, composed: true })
    );
  }

  async handleMarkStepComplete(evt) {
    evt.stopPropagation();
    const stepId = evt.currentTarget.dataset.stepId;
    if (!stepId || this.markingStepId) return;
    this.markingStepId = stepId;
    this.planActionError = "";
    try {
      await markWorkStepCompleted({
        token: this.sessionToken,
        workStepId: stepId
      });
      this._notifyDataUpdate();
      // Reflect locally: step → Completed (ring recomputes via workPlansEnriched).
      const plans = (this.assetDetail.workPlans || []).map((p) => ({
        ...p,
        steps: (p.steps || []).map((s) => {
          return s.id === stepId ? { ...s, status: "Completed" } : s;
        })
      }));
      this.assetDetail = { ...this.assetDetail, workPlans: plans };
    } catch (e) {
      this.planActionError =
        (e && e.body && e.body.message) || "Could not update step.";
    } finally {
      this.markingStepId = null;
    }
  }

  // ─── Parts: consume + add ────────────────────────────────────────────────
  async handleConsumePart(evt) {
    const ds = evt.currentTarget.dataset;
    if (this.consuming) return;
    this.consuming = true;
    this.partActionError = "";
    try {
      await consumePart({
        token: this.sessionToken,
        workOrderId: ds.woId,
        product2Id: ds.productId,
        pricebookEntryId: ds.pbeId,
        unitPrice: ds.unitPrice ? Number(ds.unitPrice) : null
      });
      this._notifyDataUpdate();
      await this.loadDetail(this.activeAssetId);
    } catch (e) {
      this.partActionError =
        (e && e.body && e.body.message) || "Could not consume part.";
    } finally {
      this.consuming = false;
    }
  }

  async handleToggleAddPart() {
    this.showAddPart = !this.showAddPart;
    this.partActionError = "";
    if (this.showAddPart && !this.productOptions.length) {
      try {
        const opts = await getConsumableProducts({ token: this.sessionToken });
        this.productOptions = (opts || []).map((o) => ({
          label: `${o.productName} — $${this._fmtNum(o.unitPrice)}`,
          value: o.productId,
          productId: o.productId,
          pricebookEntryId: o.pricebookEntryId,
          unitPrice: o.unitPrice
        }));
      } catch {
        this.partActionError = "Could not load products.";
      }
    }
  }

  handleAddProductChange(evt) {
    this.selectedAddProductId = evt.target.value;
  }

  async handleAddPart() {
    const opt = this.productOptions.find(
      (o) => o.value === this.selectedAddProductId
    );
    const woId = this.assetDetail && this.assetDetail.consumeWorkOrderId;
    if (!opt || !woId) {
      this.partActionError = "Select a part first.";
      return;
    }
    this.consuming = true;
    this.partActionError = "";
    try {
      await consumePart({
        token: this.sessionToken,
        workOrderId: woId,
        product2Id: opt.productId,
        pricebookEntryId: opt.pricebookEntryId,
        unitPrice: opt.unitPrice
      });
      this._notifyDataUpdate();
      this.showAddPart = false;
      this.selectedAddProductId = "";
      await this.loadDetail(this.activeAssetId);
    } catch (e) {
      this.partActionError =
        (e && e.body && e.body.message) || "Could not add part.";
    } finally {
      this.consuming = false;
    }
  }

  // ─── Serial edit ─────────────────────────────────────────────────────────
  handleSerialChange(evt) {
    this.serialDraft = evt.target.value;
  }

  async handleSaveSerial() {
    const assetId = this.activeAssetId;
    if (!assetId) return;
    this.savingSerial = true;
    try {
      await updateAssetSerial({
        token: this.sessionToken,
        assetId,
        serialNumber: this.serialDraft
      });
      this._notifyDataUpdate();
      // Reflect locally on whichever asset (component or sub-asset) is active
      this._patchAsset(assetId, { serialNumber: this.serialDraft });
    } catch {
      // silent — surfaced via feedback span if desired
    } finally {
      this.savingSerial = false;
    }
  }

  // ─── Measure form ────────────────────────────────────────────────────────
  handleAddMeasure() {
    this.editId = null;
    this.editComponentName = "";
    this.editMeasureType = "OK";
    this.editComments = "";
    this.editReviewNotes = "";
    this.editMeasureValue = "";
    this.editMeasureValueType = "Depth";
    this.editDefectLocation = "";
    this.measureFeedback = "";
    this._clearPendingImage();
    this.showMeasureForm = true;
  }

  handleEditMeasure(evt) {
    const id = evt.currentTarget.dataset.pointId;
    const p = this.wheelsetPoints.find((x) => x.id === id);
    if (!p) return;
    this.editId = p.id;
    this.editComponentName = p.componentName || "";
    this.editMeasureType = p.measureType || "OK";
    this.editComments = p.comments || "";
    this.editReviewNotes = p.reviewNotes || "";
    this.editMeasureValue =
      p.measureValue != null ? String(p.measureValue) : "";
    this.editMeasureValueType = p.measureValueType || "Depth";
    this.editDefectLocation = p.defectLocation || "";
    this.measureFeedback = "";
    this._clearPendingImage();
    this.showMeasureForm = true;
    // LWC does not reliably reflect a bound `value` onto a <textarea>'s displayed
    // text, so push the preloaded Comments/Review Notes into the DOM after render.
    this._syncMeasureTextareas = true;
  }

  _clearPendingImage() {
    this.pendingImagePreview = null;
    this._pendingImageBase64 = null;
    this._pendingImageName = null;
  }

  // Build the stored file name: "<component name> - <worker>.<ext>", keeping the
  // original file extension. Falls back gracefully if either part is missing.
  _buildImageFileName(componentName) {
    const orig = this._pendingImageName || "measure-image.jpg";
    const ext = orig.includes(".")
      ? orig.substring(orig.lastIndexOf(".") + 1)
      : "jpg";
    const parts = [];
    if (componentName && componentName.trim()) parts.push(componentName.trim());
    if (this.workerName && this.workerName.trim())
      parts.push(this.workerName.trim());
    let base = parts.join(" - ") || "Measure Image";
    // strip characters awkward in file names; collapse whitespace
    base = base
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    // ContentVersion.Title maxes at 255 chars — cap so long component
    // checklist text + worker name can't overflow and fail the insert.
    if (base.length > 200) base = base.substring(0, 200).trim();
    return `${base}.${ext}`;
  }

  // Camera/file selection: read the chosen image to base64 and stage a preview.
  handleImageSelect(evt) {
    const file = evt.target.files && evt.target.files[0];
    if (!file) return;
    if (!file.type || file.type.indexOf("image/") !== 0) {
      this._measureFb("Please choose an image file.", true);
      return;
    }
    const MAX = 5 * 1024 * 1024; // 5MB guard
    if (file.size > MAX) {
      this._measureFb("Image is too large (max 5MB).", true);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result || "";
      const comma = result.indexOf(",");
      this._pendingImageBase64 =
        comma >= 0 ? result.substring(comma + 1) : result;
      this._pendingImageName = file.name || "measure-image.jpg";
      this.pendingImagePreview = result; // full data URI for the preview
    };
    reader.onerror = () => this._measureFb("Could not read the image.", true);
    reader.readAsDataURL(file);
  }

  handleRemovePendingImage() {
    this._clearPendingImage();
    const input = this.template.querySelector('[data-id="measureImageInput"]');
    if (input) input.value = "";
  }

  handleMarkOk(evt) {
    this._setOutcome(evt.currentTarget.dataset.pointId, "OK");
  }

  handleOutcome(evt) {
    this._setOutcome(
      evt.currentTarget.dataset.pointId,
      evt.currentTarget.dataset.outcome
    );
  }

  handleInlineValue(evt) {
    const raw = evt.target.value;
    const num = raw === "" ? null : Number(raw);
    if (num !== null && Number.isNaN(num)) {
      return;
    }
    this._setOutcome(evt.target.dataset.pointId, "Measure", num);
  }

  async _setOutcome(id, measureType, valueOverride) {
    const p = this.wheelsetPoints.find((x) => x.id === id);
    if (!p) return;
    const keepValue = measureType !== "OK";
    try {
      const req = {
        id: p.id,
        componentName: p.componentName,
        measureType,
        comments: p.comments,
        reviewNotes: p.reviewNotes,
        measureValue:
          valueOverride !== undefined
            ? valueOverride
            : keepValue
              ? p.measureValue
              : null,
        measureValueType: keepValue ? p.measureValueType : null,
        defectLocation: p.defectLocation || null,
        workOrderId: p.workOrderId || this.workOrderId,
        assetId: p.assetId || this.activeAssetId
      };
      const saved = await saveMeasurePoint({
        token: this.sessionToken,
        reqJson: JSON.stringify(req)
      });
      this._notifyDataUpdate();
      this.wheelsetPoints = this.wheelsetPoints.map((x) => {
        return x.id === saved.id ? saved : x;
      });
      this.allPoints = this.allPoints.map((x) => {
        return x.id === saved.id ? saved : x;
      });
      this._recomputeWheelsetStatus();
    } catch {
      this._measureFb("Could not save outcome. Try again.", true);
    }
  }

  // ─── Measure side panel (Document / Trend) ──────────────────────────────
  handleSideMode(evt) {
    this.sideMode = evt.currentTarget.dataset.mode;
    if (this.sideMode === "doc") this._pendingShow = true;
    if (this.sideMode !== "off") this._autoCollapse();
  }

  handleDocChip(evt) {
    this.sidePointId = evt.currentTarget.dataset.pointId;
    this.sideMode = "doc";
    this._pendingShow = true;
    this._autoCollapse();
  }

  handleSelectPoint(evt) {
    this.sidePointId = evt.currentTarget.dataset.pointId;
    if (this.sideMode === "doc") this._pendingShow = true;
  }

  _showInPane() {
    const pane = this.template.querySelector("c-kiosk-pdf-pane");
    const p = this.wheelsetPoints.find((x) => x.id === this.sidePointId);
    if (!pane || !p || !p.sourceDocumentId) return;
    pane.showMeasure({
      documentId: p.sourceDocumentId,
      pageNumber: p.pageNumber,
      componentName: p.componentName,
      pagePositionEstimate: p.pagePositionEstimate,
      tableName: p.tableName
    });
  }

  get isSideOff() {
    return this.sideMode === "off";
  }
  get isSideDoc() {
    return this.sideMode === "doc";
  }
  get isSideTrend() {
    return this.sideMode === "trend";
  }
  get measureWrapClass() {
    return "mz-wrap" + (this.sideMode === "off" ? "" : " with-side");
  }
  get sideModes() {
    return [
      ["off", "Off"],
      ["doc", "Document"],
      ["trend", "Trend"]
    ].map(([value, label]) => {
      return {
        value,
        label,
        cls: "mz-seg" + (this.sideMode === value ? " on" : "")
      };
    });
  }
  get sidePoint() {
    return (
      this.wheelsetPoints.find((x) => x.id === this.sidePointId) ||
      this.wheelsetPoints[0] ||
      null
    );
  }
  get sidePointLabel() {
    const p = this.sidePoint;
    return p ? p.componentName : "Select a measure";
  }
  get sidePointHasDoc() {
    return !!(this.sidePoint && this.sidePoint.sourceDocumentId);
  }
  get trendRows() {
    const p = this.sidePoint;
    if (!p) return [];
    return this.allPoints
      .filter((x) => {
        return x.assetId === p.assetId && x.componentName === p.componentName;
      })
      .sort((a, b) => {
        return String(a.updateDate || "").localeCompare(
          String(b.updateDate || "")
        );
      })
      .map((x) => {
        return {
          id: x.id,
          woNumber: x.workOrderNumber || "—",
          date: this._formatDate(x.updateDate || x.createdDate),
          outcome: x.measureType,
          value:
            x.measureValue != null
              ? this._fmtNum(x.measureValue) + " " + (x.measureValueType || "")
              : "—"
        };
      });
  }
  get hasTrend() {
    return this.trendRows.length > 0;
  }

  handleComponentNameChange(evt) {
    this.editComponentName = evt.target.value;
  }
  handleMeasureTypeSelect(evt) {
    this.editMeasureType = evt.currentTarget.dataset.type;
  }
  handleMeasureValueChange(evt) {
    this.editMeasureValue = evt.target.value;
  }
  handleMeasureValueTypeChange(evt) {
    this.editMeasureValueType = evt.target.value;
  }
  handleDefectLocationChange(evt) {
    this.editDefectLocation = evt.target.value;
  }
  handleCommentsChange(evt) {
    this.editComments = evt.target.value;
  }
  handleReviewNotesChange(evt) {
    this.editReviewNotes = evt.target.value;
  }
  handleMeasureCancel() {
    this.showMeasureForm = false;
    this.measureFeedback = "";
  }

  async handleMeasureSave() {
    if (!this.editComponentName.trim()) {
      this._measureFb("Component Name is required.", true);
      return;
    }
    this.isSavingMeasure = true;
    try {
      const isMeasure = this.editMeasureType === "Measure";
      const req = {
        id: this.editId || null,
        componentName: this.editComponentName,
        measureType: this.editMeasureType,
        comments: this.editComments,
        reviewNotes: this.editReviewNotes,
        measureValue:
          isMeasure && this.editMeasureValue !== ""
            ? parseFloat(this.editMeasureValue)
            : null,
        measureValueType: isMeasure ? this.editMeasureValueType : null,
        defectLocation: this.editDefectLocation || null,
        workOrderId: this.workOrderId,
        assetId: this.activeAssetId
      };
      const saved = await saveMeasurePoint({
        token: this.sessionToken,
        reqJson: JSON.stringify(req)
      });
      this._notifyDataUpdate();

      // Upload a staged image (camera/file) against the saved record's id.
      if (this._pendingImageBase64 && saved.id) {
        try {
          const dataUri = await uploadMeasureImage({
            token: this.sessionToken,
            measurePointId: saved.id,
            fileName: this._buildImageFileName(
              saved.componentName || this.editComponentName
            ),
            base64Data: this._pendingImageBase64
          });
          this.measureImages = { ...this.measureImages, [saved.id]: dataUri };
        } catch {
          this._measureFb("Measure saved, but image upload failed.", true);
        }
        this._clearPendingImage();
      }

      if (this.editId) {
        this.wheelsetPoints = this.wheelsetPoints.map((p) => {
          return p.id === saved.id ? saved : p;
        });
        this.allPoints = this.allPoints.map((p) => {
          return p.id === saved.id ? saved : p;
        });
      } else {
        this.wheelsetPoints = [saved, ...this.wheelsetPoints];
        this.allPoints = [saved, ...this.allPoints];
      }
      this._recomputeWheelsetStatus();
      this.showMeasureForm = false;
      this._measureFb("Saved.", false);
      this._loadMeasureImages(); // pick up a newly attached image, if any
    } catch (e) {
      const msg = e.body?.message || "";
      this._measureFb(
        msg.includes("SESSION_EXPIRED")
          ? "Session expired. Sign in again."
          : "Save failed. Try again.",
        true
      );
    } finally {
      this.isSavingMeasure = false;
    }
  }

  _measureFb(msg, isError) {
    this.measureFeedback = msg;
    this.measureFeedbackIsError = !!isError;
    if (!isError) {
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      setTimeout(() => {
        this.measureFeedback = "";
      }, 2500);
    }
  }

  // Recompute the active asset's status dot from its current points.
  _recomputeWheelsetStatus() {
    const pts = this.wheelsetPoints;
    let status = "grey";
    if (
      pts.some(
        (p) =>
          p.measureType === "Attention Required" || p.measureType === "Scrap"
      )
    ) {
      status = "red";
    } else if (
      pts.some(
        (p) =>
          p.measureValue != null ||
          p.measureType === "Measure" ||
          p.measureType === "OK"
      )
    ) {
      // Green = a real measure recorded; empty checklist placeholders stay grey.
      status = "green";
    }
    this._patchAsset(this.activeAssetId, { iconStatus: status });
  }

  // Patch a field on whichever asset matches (level-2 component or a level-3 child),
  // producing new array/object refs so the reactive getters re-render.
  _patchAsset(assetId, patch) {
    this.wheelsets = this.wheelsets.map((w) => {
      if (w.id === assetId) return { ...w, ...patch };
      if (w.children && w.children.some((c) => c.id === assetId)) {
        return {
          ...w,
          children: w.children.map((c) => {
            return c.id === assetId ? { ...c, ...patch } : c;
          })
        };
      }
      return w;
    });
  }

  // ─── Task form (create + edit) ───────────────────────────────────────────
  _resetTaskForm() {
    this.taskEditId = null;
    this.taskSubject = "";
    this.taskDescription = "";
    this.taskCauseCodes = "";
    this.taskDelayCodes = "";
    this.taskStartDate = "";
    this.taskComponent = this.wagon?.floc || ""; // default Component to wagon FLOC
    this.taskDurationHours = "";
    this.taskPriority = "Medium";
    this.taskStatus = "New";
    this.taskComments = "";
    this.taskFeedback = "";
  }

  handleAddTask() {
    this._resetTaskForm();
    this.showTaskForm = true;
  }

  // Tap a work order (task) card → filter measures + work plans to that WO.
  // Tapping the already-selected WO clears the filter (toggle).
  handleSelectWorkOrder(evt) {
    const woId = evt.currentTarget.dataset.woId;
    if (!woId) return;
    if (this.selectedFilterWoId === woId) {
      this._clearWoFilter();
      return;
    }
    const t = this.tasks.find((x) => x.id === woId);
    this.selectedFilterWoId = woId;
    this.selectedFilterWoNumber = t ? t.woNumber || "" : "";
  }

  handleClearWoFilter() {
    this._clearWoFilter();
  }

  _clearWoFilter() {
    this.selectedFilterWoId = null;
    this.selectedFilterWoNumber = "";
    this.tile = {};
  }

  handleEditTask(evt) {
    evt.stopPropagation(); // don't trigger the card's WO-filter click
    const id = evt.currentTarget.dataset.taskId;
    const t = this.tasks.find((x) => x.id === id);
    if (!t) return;
    this.taskEditId = t.id;
    this.taskSubject = t.subject || "";
    this.taskDescription = t.description || "";
    this.taskCauseCodes = t.causeCodes || "";
    this.taskDelayCodes = t.workDelayCodes || "";
    // StartDate comes back as ISO; trim to yyyy-MM-ddThh:mm for datetime-local input
    this.taskStartDate = t.startDate ? this._toLocalInput(t.startDate) : "";
    this.taskComponent = t.component || "";
    this.taskDurationHours =
      t.durationHours != null ? String(t.durationHours) : "";
    this.taskPriority = t.priority || "Medium";
    this.taskStatus = t.status || "New";
    this.taskComments = t.comments || "";
    this.taskFeedback = "";
    this.showTaskForm = true;
    // LWC does not reliably reflect a bound `value` onto a <textarea>'s displayed text,
    // so push the preloaded Description/Comments into the DOM after the form renders.
    this._syncTaskTextareas = true;
  }

  renderedCallback() {
    if (this._pendingShow) {
      this._pendingShow = false;
      this._showInPane();
    }
    if (this._syncNotesTa) {
      this._syncNotesTa = false;
      const ta = this.template.querySelector('[data-id="newNote"]');
      if (ta) ta.value = this.newNote;
    }
    if (this._syncTaskTextareas) {
      this._syncTaskTextareas = false;
      const desc = this.template.querySelector('[data-id="taskDescription"]');
      const comm = this.template.querySelector('[data-id="taskComments"]');
      if (desc) desc.value = this.taskDescription;
      if (comm) comm.value = this.taskComments;
    }
    if (this._syncMeasureTextareas) {
      this._syncMeasureTextareas = false;
      const comm = this.template.querySelector('[data-id="editComments"]');
      const notes = this.template.querySelector('[data-id="editReviewNotes"]');
      if (comm) comm.value = this.editComments;
      if (notes) notes.value = this.editReviewNotes;
    }
  }

  handleTaskSubjectChange(evt) {
    this.taskSubject = evt.target.value;
  }
  handleTaskDescriptionChange(evt) {
    this.taskDescription = evt.target.value;
  }
  handleTaskCauseChange(evt) {
    this.taskCauseCodes = evt.target.value;
  }
  handleTaskDelayChange(evt) {
    this.taskDelayCodes = evt.target.value;
  }
  handleTaskStartDateChange(evt) {
    this.taskStartDate = evt.target.value;
  }
  handleTaskComponentChange(evt) {
    this.taskComponent = evt.target.value;
  }
  handleTaskDurationChange(evt) {
    this.taskDurationHours = evt.target.value;
  }
  handleTaskPriorityChange(evt) {
    this.taskPriority = evt.target.value;
  }
  handleTaskStatusChange(evt) {
    this.taskStatus = evt.target.value;
  }
  handleTaskCommentsChange(evt) {
    this.taskComments = evt.target.value;
  }
  handleTaskCancel() {
    this.showTaskForm = false;
    this.taskFeedback = "";
  }

  async handleTaskSave() {
    if (!this.taskSubject.trim()) {
      this._taskFb("Subject is required.", true);
      return;
    }
    this.isSavingTask = true;
    try {
      const req = {
        id: this.taskEditId || null,
        workOrderId: this.workOrderId,
        assetId: this.activeAssetId,
        subject: this.taskSubject.trim(),
        description: this.taskDescription || null,
        causeCodes: this.taskCauseCodes || null,
        workDelayCodes: this.taskDelayCodes || null,
        startDate: this.taskStartDate
          ? new Date(this.taskStartDate).toISOString()
          : null,
        component: this.taskComponent || null,
        durationHours:
          this.taskDurationHours !== ""
            ? parseFloat(this.taskDurationHours)
            : null,
        priority: this.taskPriority || null,
        status: this.taskStatus || null,
        comments: this.taskComments || null
      };
      const saved = this.taskEditId
        ? await updateAssetTask({
            token: this.sessionToken,
            reqJson: JSON.stringify(req)
          })
        : await createAssetTask({
            token: this.sessionToken,
            reqJson: JSON.stringify(req)
          });
      this._notifyDataUpdate();
      if (this.taskEditId) {
        this.tasks = this.tasks.map((t) => (t.id === saved.id ? saved : t));
        this._taskFb("Task updated.", false);
      } else {
        this.tasks = [saved, ...this.tasks];
        this._taskFb("PM02 task created.", false);
      }
      this.showTaskForm = false;
    } catch (e) {
      const msg = e.body?.message || "";
      this._taskFb(
        msg.includes("PM02_WORKTYPE_NOT_FOUND")
          ? "PM02 work type missing in org."
          : "Save failed. Try again.",
        true
      );
    } finally {
      this.isSavingTask = false;
    }
  }

  // Convert an ISO datetime to the value a datetime-local input expects (yyyy-MM-ddThh:mm), in local time.
  _toLocalInput(iso) {
    try {
      const d = new Date(iso);
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return "";
    }
  }

  _taskFb(msg, isError) {
    this.taskFeedback = msg;
    this.taskFeedbackIsError = !!isError;
    if (!isError) {
      // eslint-disable-next-line @lwc/lwc/no-async-operation
      setTimeout(() => {
        this.taskFeedback = "";
      }, 2500);
    }
  }

  // Wagon schematic shows only when expanded AND the workpack has a Wagon Number.
  get showSchematic() {
    return (
      this.mapView === "schematic" &&
      this.diagramExpanded &&
      !!(this.wagon && this.wagon.hasWagonNumber)
    );
  }

  // ─── Derived: diagram zones ──────────────────────────────────────────────
  get diagramZones() {
    return this.wheelsets.map((w, i) => {
      const layout = ZONE_LAYOUT[i] || { left: 0, width: 0 };
      const selected = w.id === this.selectedWheelsetId;
      return {
        id: w.id,
        label: w.label,
        woCount: w.workOrderCount || 0,
        hasWos: (w.workOrderCount || 0) > 0,
        zoneStyle: `left:${layout.left}%;width:${layout.width}%;`,
        zoneClass: "wagon-zone" + (selected ? " selected" : ""),
        chipClass: "indicator-chip" + (selected ? " selected" : ""),
        dotClass: "zone-dot status-" + (w.iconStatus || "grey")
      };
    });
  }

  // ─── Icicle asset map ────────────────────────────────────────────────────
  handleIcicleRoot() {
    this._autoExpand();
    this.wtSel = [];
    if (this.selectedChildId) {
      this.selectedChildId = null;
      this._clearWoFilter();
      this.loadDetail(this.selectedWheelsetId);
    }
  }

  _icicleNode(a, level, parentId) {
    const wo = this.woRows.find((r) => r.id === this.selectedFilterWoId);
    const woAsset = wo ? [wo.assetId, wo.l2AssetId] : [];
    const tapped = a.id === this.activeAssetId;
    const rows = this.woRows.filter((r) => {
      return level === 2
        ? r.l2AssetId === a.id || r.assetId === a.id
        : r.assetId === a.id;
    });
    const dim =
      this.wtSel.length > 0 &&
      !rows.some((r) => this.wtSel.includes(r.workTypeName));
    return {
      id: a.id,
      name: a.name || a.label,
      parentId,
      woCount: a.workOrderCount || 0,
      hasWos: (a.workOrderCount || 0) > 0,
      dotClass: "zone-dot status-" + (a.iconStatus || "grey"),
      cls:
        "ic-node" +
        (tapped ? " tapped" : "") +
        (woAsset.includes(a.id) ? " woasset" : "") +
        (dim ? " dim" : "")
    };
  }

  get icicleCols() {
    const list =
      this.zoomed && this.selectedWheelsetId
        ? this.wheelsets.filter((w) => w.id === this.selectedWheelsetId)
        : this.wheelsets;
    return list.map((w) => {
      const kids = (w.children || []).map((c) => {
        return this._icicleNode(c, 3, w.id);
      });
      return {
        ...this._icicleNode(w, 2, null),
        flexStyle:
          "flex:" + (this.zoomed ? 1 : Math.max(1, kids.length)) + " 1 0;",
        kids
      };
    });
  }

  get icicleRootLabel() {
    return (this.wagon && this.wagon.name) || "Asset";
  }

  get crumbs() {
    const out = [
      { key: "c0", level: "root", label: this.icicleRootLabel, last: false }
    ];
    const w = this.wheelsets.find((x) => x.id === this.selectedWheelsetId);
    if (w) {
      out.push({
        key: "c1",
        level: "l2",
        label: w.label || w.name,
        last: !this.selectedChildId
      });
    }
    if (this.selectedChildId) {
      const c = this._findChild(this.selectedChildId);
      if (c) out.push({ key: "c2", level: "l3", label: c.name, last: true });
    }
    out[out.length - 1].last = true;
    return out;
  }

  // ─── Derived: active asset + level-3 children ────────────────────────────
  get activeAssetId() {
    return this.selectedChildId || this.selectedWheelsetId;
  }

  get activeAsset() {
    if (this.selectedChildId) return this._findChild(this.selectedChildId);
    return this.wheelsets.find((w) => w.id === this.selectedWheelsetId) || null;
  }

  // Level-3 sub-assets under the selected component, enriched for the chip row.
  get childComponents() {
    const ws = this.wheelsets.find((w) => w.id === this.selectedWheelsetId);
    const kids = ws && ws.children ? ws.children : [];
    return kids.map((c) => {
      const selected = c.id === this.selectedChildId;
      return {
        id: c.id,
        name: c.name,
        woCount: c.workOrderCount || 0,
        hasWos: (c.workOrderCount || 0) > 0,
        chipClass: "child-chip" + (selected ? " selected" : ""),
        dotClass: "zone-dot status-" + (c.iconStatus || "grey")
      };
    });
  }

  get hasChildComponents() {
    return this.childComponents.length > 0;
  }

  // ─── Derived: work plans + required parts ────────────────────────────────
  get workPlansEnriched() {
    let plans = (this.assetDetail && this.assetDetail.workPlans) || [];
    if (this.selectedFilterWoId) {
      plans = plans.filter((p) => p.workOrderId === this.selectedFilterWoId);
    }
    return plans.map((p) => {
      const isExpanded = !!this.expandedPlanIds[p.id];
      const steps = (p.steps || []).map((s) => {
        const isCompleted = s.status === "Completed";
        const hasAction = !!s.actionDefinition;
        return {
          ...s,
          stepClass:
            "ar-step-row status-" +
            (s.status || "not-started").toLowerCase().replace(/ /g, "-") +
            (hasAction ? " has-action" : ""),
          isCompleted,
          hasAction,
          // Manual "Mark complete" only for steps without a linked action; action
          // steps complete via the flow (handleStepClick).
          canComplete: !isCompleted && !hasAction
        };
      });
      const total = steps.length;
      const done = steps.filter((s) => s.isCompleted).length;
      const percent = total > 0 ? Math.round((done / total) * 100) : 0;
      return {
        ...p,
        steps,
        isExpanded,
        hasNoSteps: steps.length === 0,
        toggleClass: "plan-toggle" + (isExpanded ? " expanded" : ""),
        chevron: isExpanded ? "▾" : "›",
        ringPercentText: percent + "%",
        ringDash: String(RING_CIRC),
        ringOffset: String(RING_CIRC * (1 - percent / 100)),
        ringComplete: percent === 100
      };
    });
  }

  get partsEnriched() {
    const parts = (this.assetDetail && this.assetDetail.parts) || [];
    return parts.map((p, i) => {
      const unit = p.unit ? " " + p.unit : "";
      return {
        key: p.productId || `part-${i}`,
        productName: p.productName,
        requiredText: this._fmtNum(p.requiredQty || 0) + unit,
        consumedText: this._fmtNum(p.consumedQty || 0) + unit,
        costText: p.unitPrice != null ? `$${this._fmtNum(p.unitPrice)}` : "—",
        product2Id: p.productId,
        pricebookEntryId: p.pricebookEntryId,
        workOrderId: p.workOrderId,
        unitPrice: p.unitPrice != null ? String(p.unitPrice) : "",
        canConsume: !!(p.pricebookEntryId && p.workOrderId)
      };
    });
  }

  get canAddPart() {
    return !!(this.assetDetail && this.assetDetail.consumeWorkOrderId);
  }
  get addPartDisabled() {
    return !this.selectedAddProductId || this.consuming;
  }

  get hasPlans() {
    return this.workPlansEnriched.length > 0;
  }
  get hasParts() {
    return this.partsEnriched.length > 0;
  }
  get plansToggleIcon() {
    return this.plansExpanded ? "▾" : "›";
  }
  get partsToggleIcon() {
    return this.partsExpanded ? "▾" : "›";
  }

  // ─── Derived: SVG charts (one per value type present) ────────────────────
  get charts() {
    // Group measured points by value type, then by wheelset label.
    const measured = this.allPoints.filter(
      (p) => p.measureValue != null && p.measureValueType
    );
    if (!measured.length) return [];

    // Map assetId -> wheelset label (and a stable x ordering L1..L4)
    const labelByAsset = {};
    this.wheelsets.forEach((w) => {
      labelByAsset[w.id] = w.label;
    });
    const xLabels = this.wheelsets.map((w) => w.label);

    const byType = {};
    measured.forEach((p) => {
      const t = p.measureValueType;
      const label = labelByAsset[p.assetId];
      if (!label) return; // point not on a wheelset of this wagon
      if (!byType[t]) byType[t] = {};
      if (!byType[t][label]) byType[t][label] = [];
      byType[t][label].push(p.measureValue);
    });

    return Object.keys(byType)
      .sort()
      .map((type, idx) => {
        // Average per wheelset label
        const series = xLabels.map((label) => {
          const vals = byType[type][label] || [];
          const avg = vals.length
            ? vals.reduce((a, b) => a + b, 0) / vals.length
            : null;
          return { label, value: avg };
        });
        return this._buildChart(type, series, idx);
      });
  }

  _buildChart(type, series, idx) {
    const present = series.filter((s) => s.value != null);
    const values = present.map((s) => s.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    // pad range 10%
    const range = max - min;
    min -= range * 0.1;
    max += range * 0.1;

    const plotW = CHART_W - PAD_L - PAD_R;
    const plotH = CHART_H - PAD_T - PAD_B;
    const n = series.length;
    const xFor = (i) => PAD_L + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));
    const yFor = (v) => PAD_T + plotH - ((v - min) / (max - min)) * plotH;

    // Build points + polyline only across populated values (in order)
    const dots = [];
    const lineParts = [];
    series.forEach((s, i) => {
      const x = xFor(i);
      if (s.value != null) {
        const y = yFor(s.value);
        dots.push({
          key: `${type}-${s.label}`,
          cx: x,
          cy: y,
          label: s.label,
          valueText: this._fmtNum(s.value),
          labelX: x,
          labelY: CHART_H - 12,
          valueY: y - 10
        });
        lineParts.push(`${x},${y}`);
      } else {
        dots.push({
          key: `${type}-${s.label}`,
          cx: x,
          cy: null,
          label: s.label,
          labelX: x,
          labelY: CHART_H - 12
        });
      }
    });

    // Y axis gridlines (3)
    const gridlines = [0, 0.5, 1].map((f, gi) => {
      const v = min + (max - min) * f;
      const y = yFor(v);
      return {
        key: `g-${type}-${gi}`,
        y,
        x1: PAD_L,
        x2: CHART_W - PAD_R,
        valText: this._fmtNum(v),
        labelY: y + 4
      };
    });

    return {
      key: `chart-${idx}`,
      title: type,
      viewBox: `0 0 ${CHART_W} ${CHART_H}`,
      polyline: lineParts.join(" "),
      dots,
      gridlines,
      axisX1: PAD_L,
      axisX2: CHART_W - PAD_R,
      axisY: PAD_T + plotH,
      yAxisX: PAD_L
    };
  }

  _fmtNum(v) {
    if (v == null) return "";
    return Math.round(v * 100) / 100;
  }

  // ─── Derived: enriched measure point cards ───────────────────────────────
  get enrichedPoints() {
    let points = this.wheelsetPoints;
    if (this.selectedFilterWoId) {
      points = points.filter((p) => p.workOrderId === this.selectedFilterWoId);
    }
    return points.map((p) => {
      let typeClass = "ok";
      if (p.measureType === "Attention Required") typeClass = "attention";
      else if (p.measureType === "Scrap") typeClass = "scrap";
      else if (p.measureType === "Measure") typeClass = "measure";
      const imageUri = this.measureImages[p.id];
      return {
        ...p,
        typeClass,
        formattedDate: this._formatDate(p.updateDate || p.createdDate),
        showMeasure: p.measureValue != null,
        showDefect: !!p.defectLocation,
        showOkBtn: p.measureType !== "OK",
        hasDoc: !!p.sourceDocumentId,
        docLabel: p.pageNumber ? "📄 p." + p.pageNumber : "📄",
        isNumeric: p.measureType === "Measure" || p.measureValue != null,
        okCls: "mz-out ok" + (p.measureType === "OK" ? " on" : ""),
        attCls:
          "mz-out att" + (p.measureType === "Attention Required" ? " on" : ""),
        scrapCls: "mz-out scrap" + (p.measureType === "Scrap" ? " on" : ""),
        rowCls: "point-card" + (p.id === this.sidePointId ? " mz-picked" : ""),
        imageUri,
        hasImage: !!imageUri
      };
    });
  }

  get pointGroups() {
    const groups = [];
    const byKey = {};
    this.enrichedPoints.forEach((p) => {
      const parts = [];
      if (p.pageNumber) parts.push("Page " + p.pageNumber);
      if (p.tableName) parts.push(p.tableName);
      const label = parts.length ? parts.join(" · ") : "Other measures";
      if (!byKey[label]) {
        byKey[label] = { key: label, label, points: [] };
        groups.push(byKey[label]);
      }
      byKey[label].points.push(p);
    });
    return groups;
  }

  get enrichedTasks() {
    const statusMap = {
      New: "status-pill new",
      Open: "status-pill new",
      Assigned: "status-pill new",
      "In Progress": "status-pill inprogress",
      "Partially Completed": "status-pill inprogress",
      Completed: "status-pill completed",
      Closed: "status-pill completed"
    };
    return this.tasks.map((t) => {
      const isSelected = this.selectedFilterWoId === t.id;
      return {
        ...t,
        statusClass: statusMap[t.status] || "status-pill new",
        durationDisplay: t.durationHours != null ? `${t.durationHours}h` : null,
        wtChipClass: "wt-chip cat-" + (t.category || "other"),
        cardClass: "task-card selectable" + (isSelected ? " selected" : ""),
        isSelected
      };
    });
  }

  get measureTypeOptions() {
    return MEASURE_TYPES.map((t) => ({
      value: t,
      label: t,
      isSelected: this.editMeasureType === t
    }));
  }
  get valueTypeOptions() {
    return VALUE_TYPES.map((t) => ({
      value: t,
      label: t,
      isSelected: this.editMeasureValueType === t
    }));
  }
  get defectLocationOptions() {
    return [
      { value: "", label: "— Select —", isSelected: !this.editDefectLocation }
    ].concat(
      DEFECT_LOCATIONS.map((d) => ({
        value: d,
        label: d,
        isSelected: this.editDefectLocation === d
      }))
    );
  }
  get showValueFields() {
    return this.editMeasureType === "Measure";
  }

  // ─── Task form option getters ─────────────────────────────────────────────
  get taskCauseOptions() {
    return CAUSE_OPTIONS.map((o) => ({
      ...o,
      selected: o.value === this.taskCauseCodes
    }));
  }
  get taskDelayOptions() {
    return DELAY_OPTIONS.map((o) => ({
      ...o,
      selected: o.value === this.taskDelayCodes
    }));
  }
  get taskPriorityOptions() {
    return PRIORITY_OPTIONS.map((p) => ({
      value: p,
      label: p,
      selected: p === this.taskPriority
    }));
  }
  get taskStatusOptions() {
    return TASK_STATUS_OPTIONS.map((s) => ({
      value: s,
      label: s,
      selected: s === this.taskStatus
    }));
  }
  get taskFormHeading() {
    return this.taskEditId ? "Edit PM02 Task" : "New PM02 Task";
  }

  // Overview/detail panels follow the active asset (level-3 child if drilled, else the component).
  get selectedWheelset() {
    return this.activeAsset;
  }
  get hasSelection() {
    return !!this.selectedWheelsetId;
  }
  get hasPoints() {
    return this.enrichedPoints.length > 0;
  }
  get woFilterActive() {
    return !!this.selectedFilterWoId;
  }
  get hasTasks() {
    return this.tasks.length > 0;
  }
  get hasCharts() {
    return this.charts.length > 0;
  }

  get overviewToggleIcon() {
    return this.overviewExpanded ? "▾" : "›";
  }
  get detailToggleIcon() {
    return this.detailExpanded ? "▾" : "›";
  }
  get diagramToggleIcon() {
    return this.diagramExpanded ? "▾" : "›";
  }
  get chartsToggleIcon() {
    return this.chartsExpanded ? "▾" : "›";
  }

  get measureSaveLabel() {
    return this.isSavingMeasure
      ? "Saving…"
      : this.editId
        ? "Update Measure"
        : "Add Measure";
  }
  get taskSaveLabel() {
    if (this.isSavingTask) return "Saving…";
    return this.taskEditId ? "Update Task" : "Create PM02 Task";
  }
  get serialSaveLabel() {
    return this.savingSerial ? "Saving…" : "Save";
  }
  get measureFeedbackClass() {
    return this.measureFeedbackIsError
      ? "form-feedback error"
      : "form-feedback";
  }
  get taskFeedbackClass() {
    return this.taskFeedbackIsError ? "form-feedback error" : "form-feedback";
  }

  get wagonStatusPill() {
    return this.wagon?.status || "";
  }
  // ─── v6 workspace getters ───
  get hasWorkspace() {
    return this.hasSelection || this.woRows.length > 0;
  }
  get listClass() {
    return "ar-wolist" + (this.listCollapsed ? " rail" : "");
  }
  get pinClass() {
    return "wl-rail-btn" + (this.listPinned ? " on" : "");
  }
  get wpRow() {
    if (!this.wpInfo) return null;
    const sel = this.selectedFilterWoId === this.wpInfo.id;
    return {
      ...this.wpInfo,
      rowClass: "wl-row wp" + (sel ? " selected" : ""),
      railClass: "wl-rail-btn wp" + (sel ? " selected" : "")
    };
  }
  _dotStyle(row) {
    return "background:" + COLORS[woStatus(row)];
  }
  get _scopeRows() {
    const l2 = this.selectedWheelsetId;
    let rows = this.woRows;
    if (l2) {
      rows = rows.filter((r) => this._rowInScope(r));
    }
    if (this.wtSel.length) {
      rows = rows.filter((r) => this.wtSel.includes(r.workTypeName));
    }
    return rows;
  }
  get woGroups() {
    const editable = new Set(this.tasks.map((t) => t.id));
    const groups = {};
    this._scopeRows.forEach((r) => {
      const key = r.assetId || "none";
      if (!groups[key]) {
        groups[key] = { key, name: r.assetName || "No asset", rows: [] };
      }
      const st = woStatus(r);
      groups[key].rows.push({
        ...r,
        rank: RANK[st],
        dotStyle: this._dotStyle(r),
        canEdit: editable.has(r.id),
        rowClass:
          "wl-row" + (this.selectedFilterWoId === r.id ? " selected" : "")
      });
    });
    return Object.values(groups).map((g) => {
      g.rows.sort(
        (a, b) => a.rank - b.rank || a.number.localeCompare(b.number)
      );
      return g;
    });
  }
  get noRows() {
    return this._scopeRows.length === 0;
  }
  get railRows() {
    return this._scopeRows.map((r) => ({
      id: r.id,
      short: String(r.number || "").slice(-3),
      title: r.number + " " + (r.subject || ""),
      dotStyle: this._dotStyle(r),
      railClass:
        "wl-rail-btn" + (this.selectedFilterWoId === r.id ? " selected" : "")
    }));
  }
  get showWtChips() {
    return this._cfg.wtFilter && this.wtChips.length > 1;
  }
  get wtActive() {
    return this.wtSel.length > 0;
  }
  get wtChips() {
    const counts = {};
    this.woRows.forEach((r) => {
      const n = r.workTypeName || "—";
      if (!counts[n]) counts[n] = 0;
      if (woStatus(r) !== "green") counts[n] += 1;
    });
    return Object.keys(counts)
      .sort()
      .map((name) => ({
        name,
        open: counts[name],
        chipClass: "wl-chip" + (this.wtSel.includes(name) ? " on" : "")
      }));
  }
  get selectedRow() {
    return this.woRows.find((r) => r.id === this.selectedFilterWoId) || null;
  }
  get selectedDotStyle() {
    const r = this.selectedRow;
    return r ? this._dotStyle(r) : "background:" + COLORS.grey;
  }
  get selectedSubject() {
    const r = this.selectedRow;
    if (r) return r.subject;
    return this.wpInfo && this.selectedFilterWoId === this.wpInfo.id
      ? this.wpInfo.subject
      : "";
  }
  get nextStepText() {
    const r = this.selectedRow;
    return r ? woNextStep(r).text : "";
  }
  get tileFields() {
    return this._cfg.woTile
      .map((key) => {
        const f = WO_FIELDS.find((x) => x[0] === key);
        return f && this.tile[key]
          ? { key, label: f[1], value: this.tile[key] }
          : null;
      })
      .filter(Boolean);
  }
  get hasTile() {
    return this.tileFields.length > 0;
  }
  get assetTileFields() {
    const a = this.activeAsset;
    if (!a) return [];
    const map = {
      SerialNumber: a.serialNumber,
      Status: a.status,
      Asset_Type__c: a.assetType,
      FLOC__c: a.floc,
      Entitlement_Status__c: a.warrantyStatus,
      InstallDate: a.installDate,
      PurchaseDate: a.purchaseDate,
      Name: a.name
    };
    return this._cfg.assetTile
      .map((key) => {
        const f = ASSET_FIELDS.find((x) => x[0] === key);
        return f && map[key] ? { key, label: f[1], value: map[key] } : null;
      })
      .filter(Boolean);
  }
  get tabs() {
    return [
      ["measure", "Measure"],
      ["execute", "Execute"],
      ["parts", "Parts"],
      ["notes", "Notes"],
      ["raised", "Raised"]
    ].map(([key, label]) => ({
      key,
      label,
      cls: "aw-tab" + (this.activeTab === key ? " on" : "")
    }));
  }
  get isMeasureTab() {
    return this.activeTab === "measure";
  }
  get isExecuteTab() {
    return this.activeTab === "execute";
  }
  get isPartsTab() {
    return this.activeTab === "parts";
  }
  get isNotesTab() {
    return this.activeTab === "notes";
  }
  get isRaisedTab() {
    return this.activeTab === "raised";
  }
  get hasWoNotes() {
    return !!this.woNotes;
  }
  get notesCauseOptions() {
    return CAUSE_OPTIONS.map((o) => ({
      ...o,
      selected: o.value === this.notesCause
    }));
  }
  get notesDelayOptions() {
    return DELAY_OPTIONS.map((o) => ({
      ...o,
      selected: o.value === this.notesDelay
    }));
  }
  get notesFeedbackClass() {
    return this.notesFeedbackIsError ? "form-feedback error" : "form-feedback";
  }
  get notesSaveLabel() {
    return this.savingNotes ? "Saving…" : "Save Notes & Codes";
  }
  get notesSaveDisabled() {
    return this.savingNotes;
  }
  get hasRaised() {
    return this.raised.length > 0;
  }
  get raisedRows() {
    return this.raised.map((t) => ({
      ...t,
      statusClass:
        "status-pill " +
        (t.status === "Completed" || t.status === "Closed"
          ? "completed"
          : "new")
    }));
  }
  get raiseAssetOptions() {
    const opts = [];
    if (this.wagon) opts.push({ value: this.wagon.id, label: this.wagon.name });
    this.wheelsets.forEach((w) => {
      opts.push({ value: w.id, label: w.name });
      (w.children || []).forEach((c) =>
        opts.push({ value: c.id, label: "— " + c.name })
      );
    });
    return opts.map((o) => ({ ...o, selected: o.value === this.raiseAssetId }));
  }
  get raiseWtOptions() {
    const q = this.raiseWtQuery.trim().toLowerCase();
    return this.workTypeList
      .filter((w) => !q || (w.name || "").toLowerCase().includes(q))
      .slice(0, 50)
      .map((w) => ({ ...w, selected: w.id === this.raiseWtId }));
  }
  get raiseSaveLabel() {
    return this.raiseSaving ? "Raising…" : "Raise Task";
  }

  get detailHeading() {
    const a = this.activeAsset;
    return a ? a.name : "";
  }

  _formatDate(isoStr) {
    if (!isoStr) return "";
    try {
      const d = new Date(isoStr);
      return d.toLocaleString("en-AU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    } catch {
      return isoStr;
    }
  }
}
