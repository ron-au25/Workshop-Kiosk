import { LightningElement, api, track } from "lwc";
import getWorkOrders from "@salesforce/apex/KioskController.getWorkOrders";
import searchAllWorkpacks from "@salesforce/apex/KioskController.searchAllWorkpacks";

const STATUS_OPTIONS = [
  { value: "All", label: "All" },
  { value: "New", label: "New" },
  { value: "In Progress", label: "In Progress" },
  { value: "Completed", label: "Completed" }
];
const PRIORITY_OPTIONS = [
  { value: "All", label: "All" },
  { value: "Critical", label: "Critical" },
  { value: "High", label: "High" },
  { value: "Medium", label: "Medium" },
  { value: "Low", label: "Low" }
];
const SORT_FIELD_OPTIONS = [
  { value: "woNumber", label: "WO Number" },
  { value: "status", label: "Status" },
  { value: "priority", label: "Priority" },
  { value: "schedStart", label: "Scheduled Time" }
];
// Explicit rank maps — Priority/Status are not alphabetically orderable.
// Mirrors the synonym-folding in workOrderCardList's STATUS_CLASS (Open~New, Closed~Completed).
const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const STATUS_RANK = {
  New: 0,
  Open: 0,
  "In Progress": 1,
  Completed: 2,
  Closed: 2
};

// yyyy-MM-dd for today shifted by `days` (negative = past)
// Server caps getWorkOrders at 50 (KioskController.getWorkOrders).
const PAGE_SIZE = 50;

function isoOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default class WorkOrderCards extends LightningElement {
  @api sessionToken;

  @track _allRecords = [];
  @track serverTotal = 0;
  @track statusFilter = "All";
  @track priorityFilter = "All";
  @track wagonSearch = "";
  @track dateFrom = isoOffset(-3);
  @track dateTo = isoOffset(3);
  @track territoryWide = false;
  @track sortBy = "woNumber";
  @track sortDir = "asc";
  @track isLoading = true;
  @track hasError = false;
  @track errorMessage = "";
  @track searchAllActive = false;

  _searchDebounce;

  connectedCallback() {
    this._doFetch(this.dateFrom, this.dateTo);
  }

  // Public entry point — always snapshots this.dateFrom/dateTo at call time
  fetchForDateRange() {
    this._doFetch(this.dateFrom, this.dateTo);
  }

  // All actual fetching goes through here with explicit date params so
  // LWC reactivity re-renders can never clobber the values mid-flight.
  async _doFetch(dateFrom, dateTo) {
    this.isLoading = true;
    this.hasError = false;
    this.searchAllActive = false;
    this._allRecords = [];
    this.serverTotal = 0;
    try {
      const result = await getWorkOrders({
        token: this.sessionToken,
        filterJson: JSON.stringify({
          dateFrom,
          dateTo,
          territoryWide: this.territoryWide,
          pageSize: PAGE_SIZE,
          pageOffset: 0
        })
      });
      this._allRecords = result.records;
      this.serverTotal = result.totalCount || result.records.length;
    } catch (e) {
      console.error("[WorkOrderCards] fetch error:", e);
      this.hasError = true;
      this.errorMessage = "Failed to load work orders. Try again.";
    } finally {
      this.isLoading = false;
    }
  }

  // Org-wide extended search for workpack WOs by wagon text. Ignores
  // territory/status/resource scoping and the date range entirely.
  async handleSearchAll() {
    const term = (this.wagonSearch || "").trim();
    if (term.length < 3) {
      this.hasError = true;
      this.errorMessage =
        "Enter at least 3 characters to search all work orders.";
      return;
    }
    this.isLoading = true;
    this.hasError = false;
    this._allRecords = [];
    this.serverTotal = 0;
    try {
      const result = await searchAllWorkpacks({
        token: this.sessionToken,
        wagonSearch: term
      });
      this._allRecords = result.records;
      this.serverTotal = result.totalCount || result.records.length;
      this.searchAllActive = true;
    } catch (e) {
      console.error("[WorkOrderCards] searchAll error:", e);
      this.hasError = true;
      this.errorMessage =
        (e && e.body && e.body.message) || "Search failed. Try again.";
    } finally {
      this.isLoading = false;
    }
  }

  // Local filtering — no server call
  get workOrders() {
    let records = this._allRecords;
    // In extended-search mode the server already returned the full
    // org-wide result; don't re-narrow by status/priority/wagon.
    if (this.searchAllActive) return records;
    if (this.statusFilter !== "All") {
      records = records.filter((wo) => wo.status === this.statusFilter);
    }
    if (this.priorityFilter !== "All") {
      records = records.filter((wo) => wo.priority === this.priorityFilter);
    }
    if (this.wagonSearch) {
      const s = this.wagonSearch.toLowerCase();
      records = records.filter(
        (wo) =>
          (wo.wagonNumber || "").toLowerCase().includes(s) ||
          (wo.assetName || "").toLowerCase().includes(s) ||
          (wo.subject || "").toLowerCase().includes(s)
      );
    }
    return [...records].sort((a, b) => this._compare(a, b));
  }

  _compare(a, b) {
    const dir = this.sortDir === "desc" ? -1 : 1;
    let diff = 0;
    switch (this.sortBy) {
      case "priority":
        diff =
          (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
        break;
      case "status":
        diff = (STATUS_RANK[a.status] ?? 99) - (STATUS_RANK[b.status] ?? 99);
        break;
      case "schedStart": {
        const aT = a.schedStart ? new Date(a.schedStart).getTime() : null;
        const bT = b.schedStart ? new Date(b.schedStart).getTime() : null;
        // Nulls always sort last, regardless of direction.
        if (aT === null && bT === null) diff = 0;
        else if (aT === null) return 1;
        else if (bT === null) return -1;
        else diff = aT - bT;
        break;
      }
      default: // 'woNumber'
        diff = (a.woNumber || "").localeCompare(b.woNumber || "", undefined, {
          numeric: true,
          sensitivity: "base"
        });
    }
    if (diff !== 0) return diff * dir;
    // Tie-break: always WO Number ascending, independent of sortDir, so equal-rank rows don't jitter.
    return (a.woNumber || "").localeCompare(b.woNumber || "", undefined, {
      numeric: true,
      sensitivity: "base"
    });
  }

  handleStatusChange(evt) {
    this.statusFilter = evt.target.value;
  }

  handlePriorityChange(evt) {
    this.priorityFilter = evt.target.value;
  }

  handleWagonSearch(evt) {
    this.wagonSearch = evt.target.value;
  }

  // Shared keydown guard for every input/select on this kiosk screen —
  // stops the global barcode-scanner listener (workshopPortal.handleGlobalKeydown)
  // from stealing keystrokes away from the focused field.
  handleInputKeydown(evt) {
    evt.stopPropagation();
  }

  handleSortFieldChange(evt) {
    this.sortBy = evt.target.value;
  }

  handleSortDirToggle() {
    this.sortDir = this.sortDir === "asc" ? "desc" : "asc";
  }

  handleTerritoryToggle(evt) {
    this.territoryWide = evt.target.checked;
    this._doFetch(this.dateFrom, this.dateTo);
  }

  handleDateFrom(evt) {
    const from = evt.target.value;
    const to = this.dateTo < from ? from : this.dateTo;
    this.dateFrom = from;
    this.dateTo = to;
    this._doFetch(from, to);
  }

  handleDateTo(evt) {
    const to = evt.target.value;
    const from = this.dateFrom > to ? to : this.dateFrom;
    this.dateFrom = from;
    this.dateTo = to;
    this._doFetch(from, to);
  }

  _shiftDate(iso, days) {
    const d = new Date(iso + "T00:00:00");
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  handlePrevDay() {
    const from = this._shiftDate(this.dateFrom, -1);
    const to = this._shiftDate(this.dateTo, -1);
    this.dateFrom = from;
    this.dateTo = to;
    this._doFetch(from, to);
  }

  handleNextDay() {
    const from = this._shiftDate(this.dateFrom, 1);
    const to = this._shiftDate(this.dateTo, 1);
    this.dateFrom = from;
    this.dateTo = to;
    this._doFetch(from, to);
  }

  handleOpenDetail(evt) {
    this.dispatchEvent(new CustomEvent("opendetail", { detail: evt.detail }));
  }

  clearFilters() {
    this.statusFilter = "All";
    this.priorityFilter = "All";
    this.wagonSearch = "";
    this.sortBy = "woNumber";
    this.sortDir = "asc";
    this.searchAllActive = false;
    this.territoryWide = false;
    const from = isoOffset(-3);
    const to = isoOffset(3);
    this.dateFrom = from;
    this.dateTo = to;
    this._doFetch(from, to);
  }

  // Per-option `selected` — <select value> set before options render is unreliable in LWC.
  _withSelected(options, current) {
    return options.map((o) => ({ ...o, selected: o.value === current }));
  }
  get statusOptions() {
    return this._withSelected(STATUS_OPTIONS, this.statusFilter);
  }
  get priorityOptions() {
    return this._withSelected(PRIORITY_OPTIONS, this.priorityFilter);
  }
  get sortFieldOptions() {
    return this._withSelected(SORT_FIELD_OPTIONS, this.sortBy);
  }

  get sortDirIcon() {
    return this.sortDir === "asc" ? "▲" : "▼";
  }
  get sortDirLabel() {
    return this.sortDir === "asc" ? "Ascending" : "Descending";
  }

  get isEmpty() {
    return !this.isLoading && !this.hasError && this.workOrders.length === 0;
  }

  get emptyMessage() {
    return this.searchAllActive
      ? "No workpack work orders match that wagon search."
      : "No work orders assigned for this date range.";
  }

  get isTruncated() {
    return this.serverTotal > this._allRecords.length;
  }

  get truncatedMessage() {
    const hint = this.searchAllActive
      ? "Refine the search text to see the rest."
      : "Narrow the date range to see the rest. Filters and sorting apply only to the loaded work orders.";
    return `Showing ${this._allRecords.length} of ${this.serverTotal} matching work orders. ${hint}`;
  }

  get totalLabel() {
    const total = this._allRecords.length;
    const filtered = this.workOrders.length;
    if (filtered === total)
      return total === 1 ? "1 work order" : `${total} work orders`;
    return `${filtered} of ${total} work orders`;
  }
}
