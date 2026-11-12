import { LightningElement, api, track } from "lwc";
import getTimeReportDashboard from "@salesforce/apex/KioskController.getTimeReportDashboard";
import updateTimeReport from "@salesforce/apex/KioskController.updateTimeReport";
import bulkUpdateTimeReportStatus from "@salesforce/apex/KioskController.bulkUpdateTimeReportStatus";

const CHART_W = 560;
const CHART_H = 200;
const BAR_GAP = 6;
const PALETTE = [
  "#E25822",
  "#2E8FE6",
  "#21C07A",
  "#F2B441",
  "#A855F7",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#84CC16",
  "#EF4444",
  "#06B6D4"
];

const FLAG_OPTIONS = [
  { value: "all", label: "All records" },
  { value: "issues", label: "All issues" },
  { value: "none", label: "No issues" },
  { value: "SHORT", label: "Short (< 10 min)" },
  { value: "LONG", label: "Long (> 6 hours)" },
  { value: "VARIANCE", label: "Variance > 50%" },
  { value: "ACTIVE", label: "Currently active (no clock-out)" }
];

const STATUS_OPTIONS = ["New", "Submitted", "Approved", "Rejected"];

function fmtMins(m) {
  if (m == null) return "—";
  const h = Math.floor(m / 60),
    mm = m % 60;
  return h > 0 ? `${h}h ${mm}m` : `${m}m`;
}
function fmtDt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}
function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short" });
}
// ISO datetime -> yyyy-MM-ddThh:mm for datetime-local input (local time)
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default class TimeTrackingDashboard extends LightningElement {
  @api sessionToken;

  @track data = null;
  @track isLoading = true;
  @track hasError = false;
  @track flagFilter = "all";
  @track statusFilter = "all";
  @track empFilter = "";

  // selection
  @track selectedIds = [];

  // edit modal
  @track showEditModal = false;
  @track isSaving = false;
  @track editError = "";
  @track editId = null;
  @track editStartTime = "";
  @track editEndTime = "";
  @track editStatus = "New";
  @track editDescription = "";
  @track editResourceName = "";
  @track editWorkOrderNumber = "";
  _editViolationReason = "";

  connectedCallback() {
    this.load();
  }

  async load() {
    this.isLoading = true;
    this.hasError = false;
    try {
      this.data = await getTimeReportDashboard({ token: this.sessionToken });
      this.selectedIds = [];
      // eslint-disable-next-line no-unused-vars
    } catch (e) {
      this.hasError = true;
    } finally {
      this.isLoading = false;
    }
  }

  handleFlagFilter(evt) {
    this.flagFilter = evt.currentTarget.dataset.flag;
    this.selectedIds = [];
  }
  handleStatusFilter(evt) {
    this.statusFilter = evt.currentTarget.dataset.status;
    this.selectedIds = [];
  }
  handleEmpFilter(evt) {
    this.empFilter = evt.target.value;
  }

  // ─── Summary getters ─────────────────────────────────────────────────────

  get totalRecords() {
    return this.data?.totalRecords ?? 0;
  }
  get totalHours() {
    if (!this.data) return "—";
    const m = this.data.totalMinutes || 0;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  get activeCount() {
    return this.data?.activeCount ?? 0;
  }
  get issueCount() {
    if (!this.data?.rows) return 0;
    return this.data.rows.filter((r) => r.validationFlag || r.isActive).length;
  }

  // ─── Per-employee bar chart ───────────────────────────────────────────────

  get empBarChart() {
    const emps = this.data?.byEmployee;
    if (!emps || emps.length === 0) return null;
    const maxMin = Math.max(...emps.map((e) => e.minutes), 1);
    const barW = Math.max(
      20,
      Math.floor((CHART_W - BAR_GAP * (emps.length + 1)) / emps.length)
    );
    const bars = emps.map((e, i) => {
      const barH = Math.round((e.minutes / maxMin) * (CHART_H - 30));
      const x = BAR_GAP + i * (barW + BAR_GAP);
      const y = CHART_H - 20 - barH;
      const color = PALETTE[i % PALETTE.length];
      return {
        key: e.name + i,
        x,
        y,
        w: barW,
        h: barH,
        fillStyle: `fill:${color}`,
        label: e.name.split(" ")[0],
        minutes: fmtMins(e.minutes),
        count: e.count,
        labelX: x + barW / 2,
        labelY: CHART_H - 4,
        valueY: y - 4
      };
    });
    return { bars, width: CHART_W, height: CHART_H };
  }

  // ─── Stacked-by-day chart ─────────────────────────────────────────────────

  get stackedChart() {
    const days = this.data?.byDay;
    if (!days || days.length === 0) return null;
    const slice = days.slice(-30);
    const maxDayMin = Math.max(
      ...slice.map((d) => d.employees.reduce((s, e) => s + e.minutes, 0)),
      1
    );
    const barW = Math.max(
      12,
      Math.floor((CHART_W - BAR_GAP * (slice.length + 1)) / slice.length)
    );

    const allEmps = this.data.byEmployee.map((e) => e.name);

    const bars = slice.map((day, i) => {
      const total = day.employees.reduce((s, e) => s + e.minutes, 0);
      const x = BAR_GAP + i * (barW + BAR_GAP);
      let yOffset = CHART_H - 20;
      const segments = [];
      for (const empName of allEmps) {
        const emp = day.employees.find((e) => e.name === empName);
        const m = emp ? emp.minutes : 0;
        if (m === 0) continue;
        const segH = Math.max(1, Math.round((m / maxDayMin) * (CHART_H - 30)));
        yOffset -= segH;
        const color = PALETTE[allEmps.indexOf(empName) % PALETTE.length];
        segments.push({
          key: empName,
          x,
          y: yOffset,
          w: barW,
          h: segH,
          fillStyle: `fill:${color}`
        });
      }
      return {
        key: day.dateLabel,
        x,
        total,
        segments,
        labelX: x + barW / 2,
        labelY: CHART_H - 4,
        label: fmtDate(day.dateLabel),
        showLabel: i % Math.max(1, Math.floor(slice.length / 10)) === 0
      };
    });

    const legend = allEmps.map((name, i) => ({
      key: name,
      name: name.split(" ")[0],
      fill: PALETTE[i % PALETTE.length],
      dotStyle: `background:${PALETTE[i % PALETTE.length]}`
    }));

    return { bars, legend, width: CHART_W, height: CHART_H };
  }

  // ─── Filters ──────────────────────────────────────────────────────────────

  get flagOptions() {
    return FLAG_OPTIONS.map((o) => ({
      ...o,
      btnClass: "flag-btn" + (this.flagFilter === o.value ? " active" : "")
    }));
  }

  get statusFilterOptions() {
    const opts = [{ value: "all", label: "All statuses" }].concat(
      STATUS_OPTIONS.map((s) => ({ value: s, label: s }))
    );
    return opts.map((o) => ({
      ...o,
      btnClass:
        "status-filter-btn" + (this.statusFilter === o.value ? " active" : "")
    }));
  }

  // Rows after flag/status/name filters (without per-row UI enrichment)
  get _baseRows() {
    if (!this.data?.rows) return [];
    let rows = this.data.rows;

    if (this.flagFilter === "issues")
      rows = rows.filter((r) => r.validationFlag || r.isActive);
    else if (this.flagFilter === "none")
      rows = rows.filter((r) => !r.validationFlag && !r.isActive);
    else if (this.flagFilter === "SHORT")
      rows = rows.filter((r) => r.validationFlag === "SHORT");
    else if (this.flagFilter === "LONG")
      rows = rows.filter((r) => r.validationFlag === "LONG");
    else if (this.flagFilter === "VARIANCE")
      rows = rows.filter((r) => r.validationFlag === "VARIANCE");
    else if (this.flagFilter === "ACTIVE")
      rows = rows.filter((r) => r.isActive);

    if (this.statusFilter !== "all") {
      rows = rows.filter((r) => (r.status || "New") === this.statusFilter);
    }

    if (this.empFilter) {
      const term = this.empFilter.toLowerCase();
      rows = rows.filter((r) => r.resourceName.toLowerCase().includes(term));
    }
    return rows;
  }

  get filteredRows() {
    const selected = new Set(this.selectedIds);
    return this._baseRows.map((r) => {
      let flagLabel = "";
      let rowClass = "tbl-row";
      if (r.isActive) {
        flagLabel = "Active";
        rowClass += " flag-active";
      } else if (r.validationFlag === "SHORT") {
        flagLabel = "< 10 min";
        rowClass += " flag-short";
      } else if (r.validationFlag === "LONG") {
        flagLabel = "> 6 h";
        rowClass += " flag-long";
      } else if (r.validationFlag === "VARIANCE") {
        const pct =
          r.plannedMinutes > 0
            ? Math.round(
                (Math.abs(r.durationMinutes - r.plannedMinutes) * 100) /
                  r.plannedMinutes
              )
            : 0;
        flagLabel = `±${pct}% vs planned`;
        rowClass += " flag-variance";
      }
      const status = r.status || "New";
      if (selected.has(r.id)) rowClass += " selected";
      return {
        ...r,
        status,
        startDisplay: fmtDt(r.startTime),
        endDisplay: r.endTime ? fmtDt(r.endTime) : "—",
        durationDisplay: fmtMins(r.durationMinutes),
        plannedDisplay: fmtMins(r.plannedMinutes),
        flagLabel,
        rowClass,
        statusClass: "status-pill st-" + status.toLowerCase(),
        isSelected: selected.has(r.id)
      };
    });
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  get selectedCount() {
    return this.selectedIds.length;
  }
  get hasSelection() {
    return this.selectedIds.length > 0;
  }
  get allSelected() {
    const rows = this._baseRows;
    return (
      rows.length > 0 && rows.every((r) => this.selectedIds.includes(r.id))
    );
  }
  get selectAllLabel() {
    return this.allSelected ? "Clear all" : "Select all";
  }

  handleRowSelect(evt) {
    evt.stopPropagation(); // don't open the edit modal when toggling the checkbox
    const id = evt.currentTarget.dataset.id;
    if (this.selectedIds.includes(id)) {
      this.selectedIds = this.selectedIds.filter((x) => x !== id);
    } else {
      this.selectedIds = [...this.selectedIds, id];
    }
  }

  handleSelectAll() {
    if (this.allSelected) {
      this.selectedIds = [];
    } else {
      this.selectedIds = this._baseRows.map((r) => r.id);
    }
  }

  async handleBulkStatus(evt) {
    const status = evt.currentTarget.dataset.status;
    if (!this.selectedIds.length) return;
    this.isSaving = true;
    try {
      // For bulk Reject, Apex fills each record's description with its own rule-violation text.
      const updated = await bulkUpdateTimeReportStatus({
        token: this.sessionToken,
        ids: this.selectedIds,
        status,
        description: null
      });
      this._applyUpdatedRows(updated);
      this.selectedIds = [];
      // eslint-disable-next-line no-unused-vars
    } catch (e) {
      // surface minimal error
      this.hasError = false;
    } finally {
      this.isSaving = false;
    }
  }

  // ─── Edit modal ─────────────────────────────────────────────────────────

  handleRowClick(evt) {
    const id = evt.currentTarget.dataset.id;
    const r = (this.data?.rows || []).find((x) => x.id === id);
    if (!r) return;
    this.editId = r.id;
    this.editResourceName = r.resourceName;
    this.editWorkOrderNumber = r.workOrderNumber || "—";
    this.editStartTime = toLocalInput(r.startTime);
    this.editEndTime = toLocalInput(r.endTime);
    this.editStatus = r.status || "New";
    this.editDescription = r.description || "";
    this._editViolationReason = r.violationReason || "";
    this.editError = "";
    this.showEditModal = true;
    this._syncDescription = true; // push preloaded description into the textarea after render
  }

  handleEditStartChange(evt) {
    this.editStartTime = evt.target.value;
  }
  handleEditEndChange(evt) {
    this.editEndTime = evt.target.value;
  }
  handleEditDescriptionChange(evt) {
    this.editDescription = evt.target.value;
  }

  handleEditStatusChange(evt) {
    const newStatus = evt.target.value;
    this.editStatus = newStatus;
    // When switching to Rejected, default the description to the rule-violation text
    // (only if the user hasn't already typed something).
    if (newStatus === "Rejected" && !this.editDescription.trim()) {
      this.editDescription = this._editViolationReason;
      // LWC does not reliably reflect a bound `value` onto a <textarea>, so push it into the DOM.
      this._syncDescription = true;
    }
  }

  renderedCallback() {
    if (this._syncDescription) {
      this._syncDescription = false;
      const ta = this.template.querySelector('[data-id="editDescription"]');
      if (ta) ta.value = this.editDescription;
    }
  }

  handleModalKeydown(evt) {
    evt.stopPropagation();
  }
  handleCloseModal() {
    this.showEditModal = false;
    this.editError = "";
  }
  get editSubheading() {
    return [this.editResourceName, this.editWorkOrderNumber]
      .filter(Boolean)
      .join(" · ");
  }

  async handleSaveEdit() {
    if (this.editStatus === "Rejected" && !this.editDescription.trim()) {
      this.editError = "A description is required when rejecting a time entry.";
      return;
    }
    this.isSaving = true;
    this.editError = "";
    try {
      const req = {
        id: this.editId,
        startTime: this.editStartTime
          ? new Date(this.editStartTime).toISOString()
          : null,
        endTime: this.editEndTime
          ? new Date(this.editEndTime).toISOString()
          : null,
        status: this.editStatus,
        description: this.editDescription || null
      };
      const updated = await updateTimeReport({
        token: this.sessionToken,
        reqJson: JSON.stringify(req)
      });
      this._applyUpdatedRows([updated]);
      this.showEditModal = false;
    } catch (e) {
      const msg = e.body?.message || "";
      if (msg.includes("REJECT_NEEDS_DESCRIPTION")) {
        this.editError =
          "A description is required when rejecting a time entry.";
      } else {
        this.editError = "Save failed. Please try again.";
      }
    } finally {
      this.isSaving = false;
    }
  }

  // Merge server-updated rows back into this.data.rows in place.
  _applyUpdatedRows(updatedRows) {
    if (!this.data?.rows || !updatedRows) return;
    const byId = {};
    updatedRows.filter(Boolean).forEach((u) => {
      byId[u.id] = u;
    });
    this.data = {
      ...this.data,
      rows: this.data.rows.map((r) => {
        return byId[r.id] ? { ...r, ...byId[r.id] } : r;
      })
    };
  }

  get statusEditOptions() {
    return STATUS_OPTIONS.map((s) => ({
      value: s,
      label: s,
      selected: s === this.editStatus
    }));
  }
  get rejectHint() {
    return this.editStatus === "Rejected"
      ? "Required — defaults to the rule violation."
      : "";
  }

  get isEmpty() {
    return !this.isLoading && !this.hasError && this.filteredRows.length === 0;
  }
  get hasData() {
    return !!this.data;
  }
  get hasEmpChart() {
    return !!this.empBarChart;
  }
  get hasStackedChart() {
    return !!this.stackedChart;
  }
}
