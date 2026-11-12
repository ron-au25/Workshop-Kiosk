import { LightningElement, api, track, wire } from "lwc";
import {
  publish,
  subscribe,
  unsubscribe,
  MessageContext
} from "lightning/messageService";
import FLOW_LAUNCHER from "@salesforce/messageChannel/FlowLauncher__c";
import getWorkOrderDetail from "@salesforce/apex/KioskController.getWorkOrderDetail";
import clockIn from "@salesforce/apex/KioskController.clockIn";
import clockOut from "@salesforce/apex/KioskController.clockOut";
import saveWorkOrderNotes from "@salesforce/apex/KioskController.saveWorkOrderNotes";
import updateWorkStepStatus from "@salesforce/apex/KioskController.updateWorkStepStatus";

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
const DAMAGE_OPTIONS = [
  { value: "", label: "— Select —" },
  { value: "0001, Blocked", label: "0001 – Blocked" },
  { value: "0004, Cracked", label: "0004 – Cracked" },
  { value: "0010, leaking", label: "0010 – Leaking" },
  { value: "0012, Overheated", label: "0012 – Overheated" },
  { value: "0016, Short Circuit", label: "0016 – Short Circuit" },
  { value: "1025, Burnt", label: "1025 – Burnt" },
  { value: "1135, Noisy", label: "1135 – Noisy" },
  { value: "9997, No fault found", label: "9997 – No Fault Found" },
  { value: "9998, not known", label: "9998 – Not Known" },
  { value: "9999, not suitable code", label: "9999 – Not Suitable Code" }
];

export default class WorkOrderDetail extends LightningElement {
  @api sessionToken;
  // Merged Kiosk Config (kioskConfigDefaults.mergeConfig); consumed by the workpack page and Asset Review.
  @api config;
  @api workerName;
  // Worker memory (workshopPortal.workerPrefs): { pinList, wtFilter:{[workpackId]:{wp,ar}}, last:{workOrderId,woNumber,tab} }
  @api prefs;
  @api
  get workOrderId() {
    return this._workOrderId;
  }
  set workOrderId(val) {
    if (val && val !== this._workOrderId) {
      this._workOrderId = val;
      this.loadDetail();
    }
  }
  _workOrderId;
  @api siteBaseUrl = "";

  // Called by the parent (workshopPortal) after an auto clock-in so the clock
  // panel / time history reflect the new Time_Report without a full page refresh.
  @api reload() {
    if (this._workOrderId) this.loadDetail();
  }

  @wire(MessageContext) messageContext;
  _flowSubscription;
  _flowResolver = null; // resolve() of the in-flight flow promise
  _flowRequestId = null; // correlation id for the in-flight flow
  _flowSeq = 0; // monotonic counter for unique request ids

  @track detail = null;
  @track isLoading = true;
  @track hasError = false;
  @track errorMessage = "";
  @track isClockingIn = false;
  @track isClockingOut = false;
  @track isSaving = false;
  @track saveFeedback = "";
  @track expandedPlanIds = {};

  // editable notes/codes
  @track existingNotes = "";
  @track newNoteText = "";
  @track causeCodes = "";
  @track workDelayCodes = "";
  @track damageCodes = "";
  @track saveFeedbackIsError = false;
  @track showExecution = false;
  @track showAssetReview = false;
  @track timeHistoryExpanded = false; // Time History: collapsed shows only the most recent entry
  @track wpTab = "notes"; // workpack page tab, kept across Asset Review round-trips
  assetReviewWoId = null; // WO to preselect in Asset Review (deep link)

  connectedCallback() {
    if (this._workOrderId) this.loadDetail();
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
    const requestId = `${this._workOrderId || "wo"}-${this._flowSeq++}`;
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

  async loadDetail() {
    this.isLoading = true;
    this.hasError = false;
    try {
      const d = await getWorkOrderDetail({
        token: this.sessionToken,
        workOrderId: this.workOrderId
      });
      // Resume the workpack tab the worker left on (only for the same work order).
      const last = this.prefs && this.prefs.last;
      if (last && last.workOrderId === this.workOrderId && last.tab) {
        this.wpTab = last.tab;
      }
      this.detail = d;
      this._firePrefs({
        last: {
          workOrderId: this.workOrderId,
          woNumber: d.woNumber,
          tab: this.wpTab
        }
      });
      this.existingNotes = d.supervisorNotes || "";
      this.newNoteText = "";
      this.causeCodes = d.causeCodes || "";
      this.workDelayCodes = d.workDelayCodes || "";
      this.damageCodes = d.damageCodes || "";
      // Expand all plans by default
      const expanded = {};
      (d.workPlans || []).forEach((p) => {
        expanded[p.id] = true;
      });
      this.expandedPlanIds = expanded;
      const wpc = this.template.querySelector("c-kiosk-workpack");
      if (wpc) wpc.refresh();
    } catch {
      this.hasError = true;
      this.errorMessage = "Failed to load work order details.";
    } finally {
      this.isLoading = false;
    }
  }

  handleBack() {
    if (this.detail?.parentWorkOrderId) {
      this.dispatchEvent(
        new CustomEvent("opendetail", {
          detail: { workOrderId: this.detail.parentWorkOrderId }
        })
      );
    } else {
      this.dispatchEvent(new CustomEvent("back"));
    }
  }

  handleOpenExecution() {
    this.showExecution = true;
  }
  handleExecutionBack() {
    this.showExecution = false;
  }

  handleOpenAssetReviewFromWorkpack(evt) {
    this.assetReviewWoId = (evt.detail && evt.detail.workOrderId) || null;
    this.showAssetReview = true;
  }
  handleWpTabChange(evt) {
    this.wpTab = evt.detail.tab;
    this._firePrefs({
      last: {
        workOrderId: this.workOrderId,
        woNumber: this.detail ? this.detail.woNumber : undefined,
        tab: this.wpTab
      }
    });
  }
  // ---- worker memory ----
  _firePrefs(patch) {
    this.dispatchEvent(new CustomEvent("prefschange", { detail: patch }));
  }
  _savedWt(kind) {
    const m = this.prefs && this.prefs.wtFilter;
    const e = m && m[this.workOrderId];
    return (e && Array.isArray(e[kind]) && e[kind]) || [];
  }
  get savedWpWt() {
    return this._savedWt("wp");
  }
  get savedArWt() {
    return this._savedWt("ar");
  }
  get savedPinList() {
    return !!(this.prefs && this.prefs.pinList);
  }
  handleWpWtChange(evt) {
    this._firePrefs({
      wtFilter: { [this.workOrderId]: { wp: evt.detail.wtSel } }
    });
  }
  handleArWtChange(evt) {
    this._firePrefs({
      wtFilter: { [this.workOrderId]: { ar: evt.detail.wtSel } }
    });
  }
  handleListPinChange(evt) {
    this._firePrefs({ pinList: !!evt.detail.pinned });
  }
  get notesCount() {
    return (this.existingNotes || "").split("\n").filter((l) => l.trim())
      .length;
  }
  handleAssetReviewBack() {
    this.showAssetReview = false;
    this.assetReviewWoId = null;
  }

  async handleClockIn() {
    this.isClockingIn = true;
    try {
      await clockIn({
        token: this.sessionToken,
        workOrderId: this.workOrderId
      });
      // Tell the portal so the header timer starts (it re-reads the open record).
      this.dispatchEvent(
        new CustomEvent("clockstarted", { bubbles: true, composed: true })
      );
      await this.loadDetail();
    } catch (e) {
      const msg = e.body?.message || "";
      if (msg.includes("ALREADY_CLOCKED_IN")) {
        this._showFeedback("Already clocked in on this workpack.");
      } else if (msg.includes("CLOCKED_IN_ELSEWHERE")) {
        this._showFeedback(
          "You are clocked in on another workpack. Use the clock in the header to switch."
        );
      } else {
        this._showFeedback("Clock in failed. Try again.");
      }
    } finally {
      this.isClockingIn = false;
    }
  }

  async handleClockOut() {
    if (!this.detail?.activeTimeReport?.id) return;
    this.isClockingOut = true;
    try {
      await clockOut({
        token: this.sessionToken,
        timeReportId: this.detail.activeTimeReport.id
      });
      // Stop the header elapsed timer (parent owns clockStartMs).
      this.dispatchEvent(
        new CustomEvent("clockstopped", { bubbles: true, composed: true })
      );
      await this.loadDetail();
    } catch {
      this._showFeedback("Clock out failed. Try again.");
    } finally {
      this.isClockingOut = false;
    }
  }

  handleNewNoteChange(evt) {
    this.newNoteText = evt.target.value;
  }
  handleNewNoteKeydown(evt) {
    evt.stopPropagation();
  }
  handleCauseChange(evt) {
    this.causeCodes = evt.target.value;
  }
  handleDelayChange(evt) {
    this.workDelayCodes = evt.target.value;
  }
  handleDamageChange(evt) {
    this.damageCodes = evt.target.value;
  }

  async handleSaveNotes() {
    this.isSaving = true;
    try {
      let combinedNotes = this.existingNotes;
      if (this.newNoteText.trim()) {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, "0");
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const yy = String(today.getFullYear()).slice(-2);
        const entry = `[${this.workerInitials} ${dd}/${mm}/${yy}]: ${this.newNoteText.trim()}`;
        combinedNotes = this.existingNotes
          ? `${entry}\n${this.existingNotes}`
          : entry;
      }
      await saveWorkOrderNotes({
        token: this.sessionToken,
        reqJson: JSON.stringify({
          workOrderId: this.workOrderId,
          supervisorNotes: combinedNotes,
          causeCodes: this.causeCodes,
          workDelayCodes: this.workDelayCodes,
          damageCodes: this.damageCodes
        })
      });
      this.existingNotes = combinedNotes;
      this.newNoteText = "";
      this._showFeedback("Saved successfully.", false);
    } catch (e) {
      const msg = e.body?.message || "";
      if (msg.includes("SESSION_EXPIRED")) {
        this._showFeedback("Session expired. Please sign in again.", true);
      } else {
        this._showFeedback("Save failed. Try again.", true);
      }
    } finally {
      this.isSaving = false;
    }
  }

  handleTogglePlan(evt) {
    const planId = evt.currentTarget.dataset.planId;
    this.expandedPlanIds = {
      ...this.expandedPlanIds,
      [planId]: !this.expandedPlanIds[planId]
    };
  }

  async handleStepClick(evt) {
    const stepId = evt.currentTarget.dataset.stepId;
    const actionDef = evt.currentTarget.dataset.actionDef;
    // Drop focus from the triggering button before the modal overlay applies
    // aria-hidden to the background. A focused element inside an aria-hidden
    // ancestor is blocked by the browser (WAI-ARIA aria-hidden rule) and logs
    // a console warning. Blurring first keeps focus out of the hidden subtree.
    if (evt.currentTarget && typeof evt.currentTarget.blur === "function") {
      evt.currentTarget.blur();
    }
    if (actionDef) {
      try {
        await updateWorkStepStatus({
          token: this.sessionToken,
          workStepId: stepId,
          status: "In Progress"
        });
        this._updateStepStatusLocally(stepId, "In Progress");
      } catch {
        /* continue regardless */
      }

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
          this._showFeedback("Step finished but status update failed.", true);
        }
      } else {
        // User cancelled — revert to New
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
    } else {
      // No action — mark Completed immediately
      try {
        await updateWorkStepStatus({
          token: this.sessionToken,
          workStepId: stepId,
          status: "Completed"
        });
        this._updateStepStatusLocally(stepId, "Completed");
      } catch {
        this._showFeedback("Could not update step. Try again.", true);
      }
    }
  }

  _updateStepStatusLocally(stepId, status) {
    this.detail = {
      ...this.detail,
      workPlans: this.detail.workPlans.map((p) => ({
        ...p,
        steps: p.steps.map((s) => (s.id === stepId ? { ...s, status } : s))
      }))
    };
  }

  _showFeedback(msg, isError) {
    this.saveFeedback = msg;
    this.saveFeedbackIsError = !!isError;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      this.saveFeedback = "";
      this.saveFeedbackIsError = false;
    }, 3000);
  }

  _formatDt(isoStr) {
    if (!isoStr) return "—";
    const d = new Date(isoStr);
    return d.toLocaleString("en-AU", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
  }

  get workerInitials() {
    if (!this.workerName) return "XX";
    const parts = this.workerName.trim().split(" ");
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : this.workerName.substring(0, 2).toUpperCase();
  }

  get hasExistingNotes() {
    return !!this.existingNotes;
  }

  get causeOptions() {
    return CAUSE_OPTIONS.map((o) => ({
      ...o,
      selected: o.value === this.causeCodes
    }));
  }
  get delayOptions() {
    return DELAY_OPTIONS.map((o) => ({
      ...o,
      selected: o.value === this.workDelayCodes
    }));
  }
  get damageOptions() {
    return DAMAGE_OPTIONS.map((o) => ({
      ...o,
      selected: o.value === this.damageCodes
    }));
  }

  get workPlansEnriched() {
    if (!this.detail?.workPlans) return [];
    return this.detail.workPlans.map((p) => {
      const steps = (p.steps || []).map((s) => ({
        ...s,
        stepClass:
          "step-row status-" +
          (s.status || "not-started").toLowerCase().replace(/ /g, "-") +
          (s.actionDefinition ? " has-action" : ""),
        hasAction: !!s.actionDefinition
      }));
      const isExpanded = !!this.expandedPlanIds[p.id];
      return {
        ...p,
        isExpanded,
        toggleClass: "plan-toggle" + (isExpanded ? " expanded" : ""),
        chevron: isExpanded ? "▾" : "›",
        steps,
        hasNoSteps: steps.length === 0
      };
    });
  }

  get timeReportsEnriched() {
    if (!this.detail?.timeReports) return [];
    // Reports arrive newest-first (Start_Time__c DESC). When collapsed, show
    // only the most recent entry; expand to reveal the full list.
    const source = this.timeHistoryExpanded
      ? this.detail.timeReports
      : this.detail.timeReports.slice(0, 1);
    return source.map((tr) => ({
      ...tr,
      startDisplay: this._formatDt(tr.startTime),
      endDisplay: tr.endTime ? this._formatDt(tr.endTime) : "Active",
      durationDisplay:
        tr.durationMinutes != null ? `${tr.durationMinutes}m` : "—",
      rowClass: "tr-row" + (tr.isActive ? " active" : "")
    }));
  }

  handleToggleTimeHistory() {
    this.timeHistoryExpanded = !this.timeHistoryExpanded;
  }

  // True when there is more than one report (a toggle is only useful then).
  get hasMultipleTimeReports() {
    return this.detail?.timeReports?.length > 1;
  }

  get timeHistoryToggleClass() {
    return (
      "section-title tr-toggle" + (this.timeHistoryExpanded ? " expanded" : "")
    );
  }
  get timeHistoryChevron() {
    return this.timeHistoryExpanded ? "▾" : "›";
  }
  get timeHistoryToggleLabel() {
    if (this.timeHistoryExpanded) return "Show less";
    const n = this.detail?.timeReports?.length || 0;
    return `Show all ${n}`;
  }

  get isClocked() {
    return !!this.detail?.activeTimeReport;
  }
  get clockBtnLabel() {
    return this.isClockingIn ? "Clocking in…" : "Clock In";
  }
  get clockOutLabel() {
    return this.isClockingOut ? "Clocking out…" : "Clock Out";
  }
  get saveBtnLabel() {
    return this.isSaving ? "Saving…" : "Save Notes & Codes";
  }
  get saveFeedbackClass() {
    return this.saveFeedbackIsError ? "save-feedback error" : "save-feedback";
  }

  get activeClockDisplay() {
    if (!this.detail?.activeTimeReport) return null;
    return this._formatDt(this.detail.activeTimeReport.startTime);
  }

  get hasMeta() {
    if (!this.detail) return false;
    return (
      this.detail.sapWorkCenter ||
      this.detail.flocDesc ||
      this.detail.externalId
    );
  }
  get hasPlans() {
    return this.detail?.workPlans?.length > 0;
  }
  get hasTimeReports() {
    return this.detail?.timeReports?.length > 0;
  }
  get hasFeedback() {
    return !!this.saveFeedback;
  }

  get backLabel() {
    return this.detail?.parentWorkOrderId
      ? this.detail.parentWoNumber || "Work Pack"
      : "Work Orders";
  }
  get isRailWorkpack() {
    return (this.detail?.workTypeName || "").includes("Workpack");
  }

  get hasAsset() {
    return !!this.detail?.assetId;
  }
  get hasChildWorkOrders() {
    return (this.detail?.childWorkOrders?.length || 0) > 0;
  }
  get hasLineItems() {
    return (this.detail?.lineItems?.length || 0) > 0;
  }

  handleChildOpen(evt) {
    this.dispatchEvent(new CustomEvent("opendetail", { detail: evt.detail }));
  }
}
