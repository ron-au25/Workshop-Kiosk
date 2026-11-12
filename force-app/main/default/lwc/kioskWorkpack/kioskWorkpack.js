import { LightningElement, api, track } from "lwc";
import getWorkpackProgress from "@salesforce/apex/KioskController.getWorkpackProgress";
import getWorkpackChildProgress from "@salesforce/apex/KioskController.getWorkpackChildProgress";
import getWorkpackTimeRecords from "@salesforce/apex/KioskController.getWorkpackTimeRecords";
import getRaisedTasks from "@salesforce/apex/KioskController.getRaisedTasks";
import getWorkOrderTile from "@salesforce/apex/KioskController.getWorkOrderTile";
import {
  COLORS,
  RANK,
  woStatus,
  assetStatus,
  woNextStep,
  workpackNextStep
} from "c/kioskStatus";
import { WO_FIELDS, RINGS, mergeConfig } from "c/kioskConfigDefaults";

const RING_R = 30;
const RING_C = 2 * Math.PI * RING_R;
const RING_COLORS = {
  steps: "#2E8FE6",
  measures: "#21C07A",
  labour: "#A855F7",
  parts: "#F2B441",
  partsCost: "#14B8A6",
  components: "#E84B4B"
};
const STATUS_LIST = [
  { key: "grey", label: "Not started" },
  { key: "amber", label: "In progress" },
  { key: "red", label: "Has finding" },
  { key: "green", label: "Complete" }
];
const GROUPS = [
  { key: "none", label: "None" },
  { key: "wt", label: "Work type" },
  { key: "sys", label: "System" },
  { key: "status", label: "Status" }
];

const pct = (a, b) => (b > 0 ? Math.min(100, (a / b) * 100) : 0);

export default class KioskWorkpack extends LightningElement {
  @api sessionToken;
  @api workpackId;
  // Workpack detail DTO from getWorkOrderDetail (subject, description, assetId, assetName, workPlans, lineItems)
  @api detail;
  @api notesCount = 0;
  // Restores the tab after returning from Asset Review.
  @api
  get initialTab() {
    return this.tab;
  }
  set initialTab(v) {
    if (v && !this._tabInit) {
      this._tabInit = true;
      this.tab = v;
    }
  }
  _tabInit = false;
  @api
  get config() {
    return this._config;
  }
  set config(v) {
    this._config = mergeConfig(v);
    if (!this._viewInit) {
      this._viewInit = true;
      this.view = this._config.wpView === "board" ? "board" : "list";
      this.progOpen = this._config.wpProgress !== "collapsed";
    }
  }
  _config = mergeConfig(null);
  _viewInit = false;
  _loadedFor = null;

  @track rows = [];
  @track timeRows = [];
  @track raised = [];
  @track tile = {};
  @track progress = null;
  @track tab = "notes";
  @track progOpen = true;
  @track descOpen = false;
  @track view = "list";
  @track group = "none";
  @track statusFilter = null;
  @track wtSel = [];
  @track rowsLoaded = false;

  renderedCallback() {
    if (
      this.workpackId &&
      this.sessionToken &&
      this._loadedFor !== this.workpackId
    ) {
      this._loadedFor = this.workpackId;
      this.refresh();
    }
  }

  @api
  refresh() {
    this._loadRows();
    this._loadTime();
    this._loadProgress();
    this._loadRaised();
    this._loadTile();
  }

  @api
  showTab(key) {
    this.tab = key;
  }

  async _loadRows() {
    try {
      const raw = await getWorkpackChildProgress({
        token: this.sessionToken,
        workpackId: this.workpackId
      });
      this.rows = JSON.parse(raw || "[]");
    } catch {
      this.rows = [];
    }
    this.rowsLoaded = true;
  }

  async _loadTime() {
    if (!this._config.wpTime) return;
    try {
      const raw = await getWorkpackTimeRecords({
        token: this.sessionToken,
        workpackId: this.workpackId
      });
      this.timeRows = JSON.parse(raw || "[]");
    } catch {
      this.timeRows = [];
    }
  }

  async _loadProgress() {
    try {
      this.progress = await getWorkpackProgress({
        token: this.sessionToken,
        workOrderId: this.workpackId
      });
    } catch {
      this.progress = null;
    }
  }

  async _loadRaised() {
    const assetId = this.detail && this.detail.assetId;
    if (!this._config.wpRaised || !assetId) return;
    try {
      this.raised =
        (await getRaisedTasks({
          token: this.sessionToken,
          assetId
        })) || [];
    } catch {
      this.raised = [];
    }
  }

  async _loadTile() {
    try {
      const raw = await getWorkOrderTile({
        token: this.sessionToken,
        workOrderId: this.workpackId,
        fieldsJson: JSON.stringify(this._config.wpTile)
      });
      this.tile = JSON.parse(raw || "{}");
    } catch {
      this.tile = {};
    }
  }

  // ─── Header ───
  get subject() {
    return this.detail ? this.detail.subject : "";
  }
  get assetName() {
    return this.detail ? this.detail.assetName : "";
  }
  get hasAsset() {
    return !!this.assetName;
  }
  get headerDotStyle() {
    const s = assetStatus(this.kids.map((k) => k.status));
    return "background:" + COLORS[s];
  }
  get tileFields() {
    return this._config.wpTile
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
  get description() {
    return this.detail ? this.detail.description : "";
  }
  get hasDescription() {
    return !!this.description;
  }
  get descClass() {
    return "wp-desc" + (this.descOpen ? "" : " clip");
  }
  get descToggleLabel() {
    return this.descOpen ? "Less" : "More";
  }
  handleDescToggle() {
    this.descOpen = !this.descOpen;
  }

  handleOpenAssetReviewTop() {
    const first = this.rows[0];
    this._openAR(first ? first.id : this.workpackId);
  }
  handleOpenAssetReviewNext(evt) {
    this._openAR(evt.currentTarget.dataset.woid || this.workpackId);
  }
  handleRowClick(evt) {
    this._openAR(evt.currentTarget.dataset.woid);
  }
  _openAR(woId) {
    this.dispatchEvent(
      new CustomEvent("openassetreview", { detail: { workOrderId: woId } })
    );
  }

  // ─── Child view models ───
  get kids() {
    return this.rows.map((r) => {
      const status = woStatus(r);
      const next = woNextStep(r);
      const ok = Math.max(0, r.measuresTaken - r.findings);
      return {
        ...r,
        status,
        rank: RANK[status],
        next,
        nextDone: !next.action,
        rowClass: "crow st-" + status,
        dotStyle: "background:" + COLORS[status],
        statusPill: r.status,
        stepsBar: this._bar(
          [[r.stepsDone, "#2E8FE6"]],
          r.stepsTotal,
          r.stepsDone + "/" + r.stepsTotal + " steps",
          "no plan"
        ),
        measBar: this._bar(
          [
            [ok, "#21C07A"],
            [r.findings, "#E5484D"]
          ],
          r.measuresTotal,
          r.measuresTaken +
            "/" +
            r.measuresTotal +
            (r.findings ? " · " + r.findings + " finding" : ""),
          "no measures"
        ),
        partsBar: this._bar(
          [[r.partsUsed, "#F2B441"]],
          r.partsRequired,
          r.partsUsed + "/" + r.partsRequired + " parts",
          "no parts"
        )
      };
    });
  }

  _bar(segs, total, label, naText) {
    if (!total) {
      return { na: true, text: naText, cls: "mb na", segs: [] };
    }
    return {
      na: false,
      text: label,
      cls: "mb",
      segs: segs
        .filter((s) => s[0] > 0)
        .map((s, i) => ({
          key: "s" + i,
          style: "width:" + pct(s[0], total) + "%;background:" + s[1]
        }))
    };
  }

  get hasWtFilter() {
    return !!this._config.wtFilter && this.workTypeChips.length > 1;
  }
  get workTypeChips() {
    const names = [];
    this.kids.forEach((k) => {
      if (k.workTypeName && !names.includes(k.workTypeName)) {
        names.push(k.workTypeName);
      }
    });
    names.sort();
    return names.map((n) => ({
      name: n,
      cls: "lgb" + (this.wtSel.includes(n) ? " on" : "")
    }));
  }
  handleWtToggle(evt) {
    const n = evt.currentTarget.dataset.name;
    this.wtSel = this.wtSel.includes(n)
      ? this.wtSel.filter((x) => x !== n)
      : this.wtSel.concat(n);
    this._fireWtChange();
  }
  handleWtClear() {
    this.wtSel = [];
    this._fireWtChange();
  }
  // Worker memory: restore the saved chips once, report every change upward.
  @api
  get initialWtSel() {
    return this.wtSel;
  }
  set initialWtSel(v) {
    if (Array.isArray(v) && !this._wtInit) {
      this._wtInit = true;
      this.wtSel = [...v];
    }
  }
  _wtInit = false;
  _fireWtChange() {
    this.dispatchEvent(
      new CustomEvent("wtchange", { detail: { wtSel: [...this.wtSel] } })
    );
  }
  get wtActive() {
    return this.wtSel.length > 0;
  }

  get focused() {
    return this.kids.filter(
      (k) => !this.wtSel.length || this.wtSel.includes(k.workTypeName)
    );
  }
  get shown() {
    return this.focused
      .filter((k) => !this.statusFilter || k.status === this.statusFilter)
      .sort((a, b) => a.rank - b.rank || a.number.localeCompare(b.number));
  }
  get hasShown() {
    return this.shown.length > 0;
  }
  get noKids() {
    return this.rowsLoaded && this.rows.length === 0;
  }

  _stack(list, clickable) {
    const n = list.length || 1;
    return ["green", "red", "amber", "grey"]
      .map((s) => {
        const c = list.filter((k) => k.status === s).length;
        return c
          ? {
              key: s,
              status: s,
              title: STATUS_LIST.find((x) => x.key === s).label + ": " + c,
              style: "width:" + (c / n) * 100 + "%;background:" + COLORS[s],
              cls:
                this.statusFilter && this.statusFilter !== s && clickable
                  ? "dim"
                  : ""
            }
          : null;
      })
      .filter(Boolean);
  }
  get stackSegs() {
    return this._stack(this.focused, true);
  }
  handleStackClick(evt) {
    this._toggleStatus(evt.currentTarget.dataset.status);
  }
  _toggleStatus(s) {
    this.statusFilter = this.statusFilter === s ? null : s;
  }
  get legend() {
    return STATUS_LIST.map((s) => ({
      ...s,
      count: this.focused.filter((k) => k.status === s.key).length,
      cls: "lgb" + (this.statusFilter === s.key ? " on" : ""),
      dotStyle: "background:" + COLORS[s.key]
    }));
  }
  handleLegendClick(evt) {
    this._toggleStatus(evt.currentTarget.dataset.status);
  }
  handleShowAll() {
    this.statusFilter = null;
  }
  get statusFiltered() {
    return !!this.statusFilter;
  }

  get viewSegs() {
    return [
      { key: "list", label: "List" },
      { key: "board", label: "Board" }
    ].map((s) => ({ ...s, cls: this.view === s.key ? "on" : "" }));
  }
  handleViewClick(evt) {
    this.view = evt.currentTarget.dataset.key;
  }
  get groupSegs() {
    return GROUPS.map((s) => ({ ...s, cls: this.group === s.key ? "on" : "" }));
  }
  handleGroupClick(evt) {
    this.group = evt.currentTarget.dataset.key;
  }
  get isList() {
    return this.view === "list";
  }
  get isBoard() {
    return this.view === "board";
  }

  _groupKey(k) {
    if (this.group === "wt") return k.workTypeName || "No work type";
    if (this.group === "status") {
      return STATUS_LIST.find((s) => s.key === k.status).label;
    }
    if (this.group === "sys") {
      return k.l2AssetName || (k.assetName || "Unknown") + " (whole asset)";
    }
    return "";
  }
  get groupedRows() {
    const list = this.shown;
    if (this.group === "none") {
      return [
        {
          key: "all",
          label: "",
          showHead: false,
          count: list.length,
          segs: [],
          rows: list
        }
      ];
    }
    const map = new Map();
    list.forEach((k) => {
      const g = this._groupKey(k);
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(k);
    });
    return Array.from(map.entries()).map(([label, rows]) => ({
      key: label,
      label,
      showHead: true,
      count: rows.length,
      segs: this._stack(rows, false),
      rows
    }));
  }
  get boardCols() {
    return STATUS_LIST.map((s) => {
      const rows = this.shown.filter((k) => k.status === s.key);
      return {
        key: s.key,
        label: s.label,
        dotStyle: "background:" + COLORS[s.key],
        count: rows.length,
        empty: rows.length === 0,
        rows
      };
    });
  }

  // ─── Next step band ───
  get next() {
    if (!this.rowsLoaded) return null;
    return workpackNextStep(null, this.kids);
  }
  get showNext() {
    return !!this._config.wpNext && !!this.next;
  }
  get nextClass() {
    const n = this.next;
    return "wp-next" + (n && n.tone ? " " + n.tone : "");
  }
  get nextText() {
    return this.next ? this.next.text : "";
  }
  get nextWoId() {
    return this.next && this.next.woId ? this.next.woId : "";
  }
  get nextIsOpen() {
    return !!this.next && this.next.action === "openAR";
  }
  get nextIsExecute() {
    return !!this.next && this.next.action === "execute";
  }
  handleNextExecute() {
    this.tab = "execute";
    this.dispatchEvent(
      new CustomEvent("tabchange", { detail: { tab: this.tab } })
    );
  }

  // ─── Progress panel ───
  get progMode() {
    return this._config.wpProgress;
  }
  get showProgress() {
    return this._config.wpProgress !== "off" && !!this.progress;
  }
  get ringSpecs() {
    const p = this.progress;
    if (!p) return [];
    return RINGS.filter(([key]) => this._config.wpRings.includes(key)).map(
      ([key, label]) => {
        const k = p[key];
        const total = k ? k.total : 0;
        const na = !(k && (k.totalRaw || 0) > 0);
        const currency = key === "partsCost";
        const f = (n) =>
          (currency ? "$" : "") + (n == null ? 0 : n).toLocaleString("en-AU");
        return {
          key,
          label,
          na,
          percent: na
            ? 0
            : Math.max(0, Math.min(100, Math.round(k.percent || 0))),
          color: RING_COLORS[key],
          count: na ? "none" : f(k.done) + " / " + f(total)
        };
      }
    );
  }
  get overallPercent() {
    const withData = this.ringSpecs.filter((r) => !r.na);
    if (!withData.length) return 0;
    return Math.round(
      withData.reduce((a, r) => a + r.percent, 0) / withData.length
    );
  }
  _ringVm(r) {
    const dash = (r.percent / 100) * RING_C + " " + RING_C;
    return {
      key: r.key,
      label: r.label,
      count: r.count,
      percentText: r.percent + "%",
      dash,
      color: r.na ? "#2A3744" : r.color
    };
  }
  get rings() {
    return this.ringSpecs.map((r) => this._ringVm(r));
  }
  get overallRing() {
    return this._ringVm({
      key: "overall",
      label: "Overall",
      count: "",
      percent: this.overallPercent,
      color: "#F2F5F7",
      na: false
    });
  }
  get progTitle() {
    return "Workpack progress · " + this.overallPercent + "%";
  }
  get chips() {
    return this.ringSpecs.map((r) => ({
      key: r.key,
      text: r.label + " " + r.count
    }));
  }
  get progBodyOpen() {
    return this.progOpen;
  }
  get progCollapsed() {
    return !this.progOpen;
  }
  get progToggleLabel() {
    return this.progOpen ? "Hide ▴" : "Show ▾";
  }
  handleProgToggle() {
    this.progOpen = !this.progOpen;
  }

  // ─── Tabs ───
  get stepTotals() {
    let done = 0;
    let total = 0;
    ((this.detail && this.detail.workPlans) || []).forEach((p) => {
      (p.steps || []).forEach((s) => {
        total += 1;
        if (s.status === "Completed") done += 1;
      });
    });
    return { done, total };
  }
  get tabs() {
    const c = this._config;
    const doneKids = this.kids.filter((k) => k.status === "green").length;
    const withFindings = this.kids.filter((k) => k.findings > 0).length;
    const ops = (this.detail && this.detail.lineItems) || [];
    const opHours = ops.reduce((a, o) => a + (Number(o.duration) || 0), 0);
    const st = this.stepTotals;
    const list = [
      {
        key: "notes",
        icon: "📝",
        label: "Notes & codes",
        sub:
          this.notesCount + " note" + (Number(this.notesCount) === 1 ? "" : "s")
      },
      {
        key: "execute",
        icon: "▶",
        label: "Execute",
        sub: st.done + "/" + st.total + " workpack steps"
      },
      {
        key: "orders",
        icon: "☰",
        label: "Work orders",
        sub:
          doneKids +
          "/" +
          this.kids.length +
          " done" +
          (withFindings ? " · " + withFindings + " with findings" : "")
      }
    ];
    if (c.wpOps) {
      list.push({
        key: "ops",
        icon: "⚙",
        label: "Operations",
        sub: ops.length + " · " + opHours.toFixed(1) + "h"
      });
    }
    if (c.wpTime) {
      list.push({
        key: "time",
        icon: "⏱",
        label: "Time records",
        sub:
          this.timeRows.length +
          " record" +
          (this.timeRows.length === 1 ? "" : "s")
      });
    }
    if (c.wpRaised) {
      list.push({
        key: "raised",
        icon: "⚠",
        label: "Raised tasks",
        sub: this.raised.length + " raised"
      });
    }
    return list.map((t) => ({
      ...t,
      cls: "tab" + (this.tab === t.key ? " on" : "")
    }));
  }
  get tabsStyle() {
    return "grid-template-columns:repeat(" + this.tabs.length + ",1fr)";
  }
  handleTabClick(evt) {
    this.tab = evt.currentTarget.dataset.key;
    this.dispatchEvent(
      new CustomEvent("tabchange", { detail: { tab: this.tab } })
    );
  }
  get isNotes() {
    return this.tab === "notes";
  }
  get isExecute() {
    return this.tab === "execute";
  }
  get isOrders() {
    return this.tab === "orders";
  }
  get isOps() {
    return this.tab === "ops" && !!this._config.wpOps;
  }
  get isTime() {
    return this.tab === "time" && !!this._config.wpTime;
  }
  get isRaised() {
    return this.tab === "raised" && !!this._config.wpRaised;
  }

  // ─── Execute ───
  get executeHint() {
    return this.rows.length
      ? "Measure, execute and add parts on the child work orders"
      : "Measure, execute and add parts on this work order";
  }

  // ─── Operations ───
  get ops() {
    return ((this.detail && this.detail.lineItems) || []).map((o) => ({
      id: o.id,
      num: o.subject,
      text: o.description,
      hours: o.duration ? Number(o.duration).toFixed(1) + "h" : ""
    }));
  }
  get hasOps() {
    return this.ops.length > 0;
  }

  // ─── Time records ───
  get timeList() {
    const fmt = (iso) => {
      if (!iso) return "—";
      return new Date(iso).toLocaleString("en-AU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      });
    };
    return this.timeRows.map((t) => {
      const live = !t.endTime;
      let mins = t.durationMinutes;
      if (live && t.startTime) {
        mins = Math.max(
          0,
          Math.round((Date.now() - new Date(t.startTime).getTime()) / 60000)
        );
      }
      return {
        id: t.id,
        who: t.resourceName,
        wo: t.workOrderNumber,
        start: fmt(t.startTime),
        end: live ? "running" : fmt(t.endTime),
        live,
        rowClass: "tr" + (live ? " live" : ""),
        endClass: live ? "run" : "",
        dur:
          mins == null ? "—" : Math.floor(mins / 60) + "h " + (mins % 60) + "m"
      };
    });
  }
  get hasTimeRows() {
    return this.timeRows.length > 0;
  }
  get timeLogged() {
    const m = this.timeRows.reduce((a, t) => a + (t.durationMinutes || 0), 0);
    return (m / 60).toFixed(1) + "h";
  }

  // ─── Raised tasks ───
  get raisedList() {
    return this.raised.map((r) => ({
      id: r.id,
      num: r.woNumber,
      subject: r.subject,
      status: r.status,
      priority: r.priority,
      workType: r.workTypeName
    }));
  }
  get hasRaised() {
    return this.raised.length > 0;
  }
}
