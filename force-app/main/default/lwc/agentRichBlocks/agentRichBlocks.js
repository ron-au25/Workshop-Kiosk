import { LightningElement, api, track } from "lwc";

const PALETTE = [
  "#E25822",
  "#2E8FE6",
  "#21C07A",
  "#F2B441",
  "#9B6DE2",
  "#E84B4B",
  "#3FBFBF",
  "#F06A2A",
  "#6B7A89",
  "#C88A1F"
];
const CHART_W = 360;
const CHART_H = 200;
const PAD = 28;

/**
 * Renders agent "blocks" (kpi/table/timeline/chart/calendar/carousel) AND lets the
 * user filter them interactively in the browser — no agent round-trip. The raw block
 * data is kept; filter controls update per-block state and re-derive the view.
 */
export default class AgentRichBlocks extends LightningElement {
  @api theme = "dark"; // 'dark' | 'light'
  _raw = [];
  @track lightbox = null; // { imageUrl, label, workOrderId } when an image is open fullscreen
  _filters = []; // one filter-state object per block, by index
  @track view = []; // prepared + filtered blocks (what the template renders)

  @api
  get blocks() {
    return this._raw;
  }
  set blocks(val) {
    this._raw = Array.isArray(val) ? val : [];
    this._filters = this._raw.map((b) => this._defaultFilter(b));
    this._rebuild();
  }

  get hasBlocks() {
    return this.view && this.view.length > 0;
  }

  get wrapClass() {
    return "rb-wrap" + (this.theme === "light" ? " theme-light" : "");
  }

  get lightboxClass() {
    return "rb-lightbox" + (this.theme === "light" ? " theme-light" : "");
  }

  _defaultFilter() {
    return {
      search: "", // table / carousel text filter
      max: "", // timeline count limit
      type: "all", // timeline event-type filter
      sortCol: null, // table sort column index
      sortDir: 1, // 1 asc, -1 desc
      hidden: {} // chart: series labels toggled off
    };
  }

  _rebuild() {
    this.view = this._raw.map((b, i) =>
      this._prepareOne(b, i, this._filters[i])
    );
  }

  // ---- per-block prepare (applies the filter, then builds display model) --

  _prepareOne(b, i, f) {
    const type = (b && b.type) || "unknown";
    const base = {
      key: `b${i}`,
      idx: i,
      type,
      title: b.title || null,
      isKpi: type === "kpi",
      isTable: type === "table",
      isTimeline: type === "timeline",
      isChart: type === "chart",
      isCalendar: type === "calendar",
      isCarousel: type === "carousel"
    };
    if (type === "kpi") return { ...base, ...this._prepKpi(b, i) };
    if (type === "table") return { ...base, ...this._prepTable(b, i, f) };
    if (type === "timeline") return { ...base, ...this._prepTimeline(b, i, f) };
    if (type === "chart") return { ...base, ...this._prepChart(b, i, f) };
    if (type === "calendar") return { ...base, ...this._prepCalendar(b, i) };
    if (type === "carousel") return { ...base, ...this._prepCarousel(b, i, f) };
    return base;
  }

  _prepKpi(b, bi) {
    const items = (b.items || []).map((it, i) => {
      const accent = PALETTE[i % PALETTE.length];
      return {
        key: `k${bi}-${i}`,
        label: it.label || "",
        value: it.value == null ? "" : String(it.value),
        unit: it.unit || "",
        accentStyle: `color:${accent};`,
        accentBg: `background:${accent};`
      };
    });
    return { kpiItems: items };
  }

  // ---- table: search + column sort ---------------------------------------

  _prepTable(b, bi, f) {
    const columns = (b.columns || []).map((c, i) => {
      const isSorted = f.sortCol === i;
      return {
        key: `c${bi}-${i}`,
        label: String(c),
        idx: i,
        sortIcon: isSorted ? (f.sortDir > 0 ? " ▲" : " ▼") : ""
      };
    });
    let rows = (b.rows || []).map((r) =>
      (r || []).map((c) => (c == null ? "" : String(c)))
    );

    const q = (f.search || "").trim().toLowerCase();
    if (q)
      rows = rows.filter((cells) =>
        cells.some((v) => v.toLowerCase().includes(q))
      );

    if (f.sortCol != null) {
      rows = [...rows].sort((a, b2) => {
        const x = a[f.sortCol] || "";
        const y = b2[f.sortCol] || "";
        const nx = parseFloat(x.replace(/[^0-9.-]/g, ""));
        const ny = parseFloat(y.replace(/[^0-9.-]/g, ""));
        const both = !isNaN(nx) && !isNaN(ny);
        const cmp = both ? nx - ny : x.localeCompare(y);
        return cmp * f.sortDir;
      });
    }

    const tableRows = rows.map((cells, ri) => ({
      key: `r${bi}-${ri}`,
      cells: cells.map((v, ci) => ({ key: `c${bi}-${ri}-${ci}`, value: v }))
    }));
    return {
      tableColumns: columns,
      tableRows,
      searchValue: f.search,
      rowCount: tableRows.length
    };
  }

  // ---- timeline: count + type + search -----------------------------------

  _prepTimeline(b, bi, f) {
    let events = (b.events || []).slice();

    if (f.type === "measure") {
      events = events.filter((e) =>
        (e.title || "").toLowerCase().startsWith("measure")
      );
    } else if (f.type === "workorder") {
      events = events.filter((e) =>
        (e.title || "").toLowerCase().startsWith("work order")
      );
    }
    const q = (f.search || "").trim().toLowerCase();
    if (q) {
      events = events.filter((e) =>
        `${e.title} ${e.description} ${e.status}`.toLowerCase().includes(q)
      );
    }
    const max = parseInt(f.max, 10);
    if (!isNaN(max) && max > 0) events = events.slice(0, max);

    const timelineEvents = events.map((e, i) => ({
      key: `t${bi}-${i}`,
      title: e.title || "",
      date: e.date || "",
      description: e.description || "",
      status: e.status || "",
      dotStyle: `background:${PALETTE[i % PALETTE.length]};`,
      hasStatus: !!e.status,
      hasDesc: !!e.description
    }));
    return {
      timelineEvents,
      tlMax: f.max,
      tlType: f.type,
      searchValue: f.search,
      tlTypeOptions: [
        { label: "All", value: "all", selected: f.type === "all" },
        { label: "Measures", value: "measure", selected: f.type === "measure" },
        {
          label: "Work Orders",
          value: "workorder",
          selected: f.type === "workorder"
        }
      ],
      eventCount: timelineEvents.length
    };
  }

  // ---- carousel: search --------------------------------------------------

  _prepCarousel(b, bi, f) {
    let cards = (b.cards || []).slice();
    const q = (f.search || "").trim().toLowerCase();
    if (q) {
      cards = cards.filter((c) =>
        `${c.title} ${c.subtitle} ${c.caption}`.toLowerCase().includes(q)
      );
    }
    const carouselCards = cards.map((c, i) => {
      const details = Array.isArray(c.details)
        ? c.details
            .filter((d) => d && d.value != null && String(d.value) !== "")
            .map((d, di) => ({
              key: `cd${bi}-${i}-${di}`,
              label: d.label || "",
              value: d.value == null ? "" : String(d.value)
            }))
        : [];
      return {
        key: `cc${bi}-${i}`,
        idx: i,
        title: c.title || "",
        subtitle: c.subtitle || "",
        imageUrl: c.imageUrl || "",
        caption: c.caption || "",
        workOrderId: c.workOrderId || null,
        details,
        hasImage: !!c.imageUrl,
        hasSubtitle: !!c.subtitle,
        hasCaption: !!c.caption,
        hasDetails: details.length > 0,
        // card opens the lightbox if it has an image OR detail rows to show
        canOpen: !!c.imageUrl || details.length > 0,
        canDrill: !!c.workOrderId
      };
    });
    return { carouselCards, searchValue: f.search };
  }

  // ---- charts (inline SVG); legend items toggle series on/off ------------

  _prepChart(b, bi, f) {
    const ct = b.chartType || "bar";
    const allSeries = (b.series || []).map((s, i) => ({
      label: s.label == null ? "" : String(s.label),
      value: Number(s.value) || 0,
      color: PALETTE[i % PALETTE.length],
      hidden: !!f.hidden[s.label == null ? "" : String(s.label)]
    }));
    const series = allSeries.filter((s) => !s.hidden);
    const isPie = ct === "pie" || ct === "donut";
    const out = {
      chartW: CHART_W,
      chartH: CHART_H,
      viewBox: isPie
        ? `0 0 ${CHART_H} ${CHART_H}`
        : `0 0 ${CHART_W} ${CHART_H}`,
      isBar: ct === "bar",
      isLine: ct === "line",
      isPie,
      // legend reflects ALL series (so you can toggle hidden ones back on)
      legend: allSeries.map((s, i) => ({
        key: `lg${bi}-${i}`,
        label: s.label,
        value: s.value,
        swatchStyle: `background:${s.hidden ? "transparent" : s.color};border:1px solid ${s.color};`,
        cssClass: s.hidden ? "rb-legend-item rb-legend-off" : "rb-legend-item"
      }))
    };
    if (ct === "bar") {
      const max = Math.max(1, ...series.map((s) => s.value));
      out.bars = this._bars(series, bi, max);
      out.axis = this._axes();
      out.yTicks = this._yTicks(max, bi);
    } else if (ct === "line") {
      const max = Math.max(1, ...series.map((s) => s.value));
      Object.assign(out, this._line(series, bi, max));
      out.axis = this._axes();
      out.yTicks = this._yTicks(max, bi);
    } else {
      out.slices = this._slices(series, bi, ct === "donut");
    }
    return out;
  }

  // X/Y axis lines for cartesian (bar/line) charts.
  _axes() {
    const h0 = CHART_H - PAD;
    return {
      xLine: { x1: PAD, y1: h0, x2: CHART_W - PAD, y2: h0 },
      yLine: { x1: PAD, y1: PAD, x2: PAD, y2: h0 }
    };
  }

  // Horizontal gridlines + value labels along the Y axis (0 / mid / max).
  _yTicks(max, bi) {
    const h0 = CHART_H - PAD;
    const plotH = CHART_H - PAD * 2;
    return [0, 0.5, 1].map((fr, i) => ({
      key: `yt${bi}-${i}`,
      y: h0 - fr * plotH,
      x1: PAD,
      x2: CHART_W - PAD,
      labelX: PAD - 5,
      label: this._fmtNum(max * fr)
    }));
  }

  _fmtNum(v) {
    const n = Number(v);
    if (isNaN(n)) return "";
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(Math.abs(n) < 10 ? 1 : 0);
  }

  _bars(series, bi, max) {
    const n = series.length || 1;
    const gap = 10;
    const bw = (CHART_W - PAD * 2 - gap * (n - 1)) / n;
    const h0 = CHART_H - PAD;
    return series.map((s, i) => {
      const bh = Math.max(1, (s.value / max) * (CHART_H - PAD * 2));
      const x = PAD + i * (bw + gap);
      return {
        key: `bar${bi}-${i}`,
        x,
        y: h0 - bh,
        w: bw,
        h: bh,
        fillStyle: `fill:${s.color};`,
        label: s.label,
        labelX: x + bw / 2,
        labelY: h0 + 14,
        valueText: this._fmtNum(s.value),
        valX: x + bw / 2,
        valY: h0 - bh - 4
      };
    });
  }

  _line(series, bi, max) {
    const n = series.length;
    const stepX = n > 1 ? (CHART_W - PAD * 2) / (n - 1) : 0;
    const h0 = CHART_H - PAD;
    const pts = series.map((s, i) => {
      const x = PAD + i * stepX;
      const y = h0 - (s.value / max) * (CHART_H - PAD * 2);
      return {
        key: `pt${bi}-${i}`,
        x,
        y,
        label: s.label,
        labelX: x,
        labelY: h0 + 14,
        valueText: this._fmtNum(s.value),
        valX: x,
        valY: y - 7
      };
    });
    const polyline = pts.map((p) => `${p.x},${p.y}`).join(" ");
    return {
      linePoints: pts,
      polyline,
      lineStyle: `stroke:${PALETTE[1]};`,
      dotStyle: `fill:${PALETTE[1]};`
    };
  }

  _slices(series, bi) {
    const total = series.reduce((a, s) => a + s.value, 0) || 1;
    const cx = CHART_H / 2;
    const cy = CHART_H / 2;
    const r = CHART_H / 2 - PAD / 2;
    let angle = -Math.PI / 2;
    return series.map((s, i) => {
      const frac = s.value / total;
      const a0 = angle;
      const a1 = angle + frac * Math.PI * 2;
      angle = a1;
      const x0 = cx + r * Math.cos(a0);
      const y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const large = a1 - a0 > Math.PI ? 1 : 0;
      const d = `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`;
      return { key: `sl${bi}-${i}`, d, fillStyle: `fill:${s.color};` };
    });
  }

  // ---- calendar (no filter) ----------------------------------------------

  _prepCalendar(b, bi) {
    const [y, m] = (b.month || "").split("-").map((x) => parseInt(x, 10));
    const year = y || 2026;
    const month = (m || 1) - 1;
    const byDay = {};
    (b.events || []).forEach((e) => {
      const d = parseInt(e.day, 10);
      if (!byDay[d]) byDay[d] = [];
      byDay[d].push(e.label || "");
    });
    const first = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++)
      cells.push({ key: `pad${bi}-${i}`, blank: true });
    for (let d = 1; d <= daysInMonth; d++) {
      const evs = byDay[d] || [];
      cells.push({
        key: `day${bi}-${d}`,
        blank: false,
        day: d,
        hasEvents: evs.length > 0,
        events: evs.map((lbl, i) => ({ key: `ce${bi}-${d}-${i}`, label: lbl }))
      });
    }
    const monthName = new Date(year, month, 1).toLocaleString("en-AU", {
      month: "long",
      year: "numeric"
    });
    const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((w, i) => ({
      key: `wd${bi}-${i}`,
      label: w
    }));
    return { calCells: cells, calMonthName: monthName, calWeekdays: weekdays };
  }

  // ---- filter control handlers -------------------------------------------

  // Stop the kiosk's global barcode keydown handler from stealing keystrokes
  // while typing in a filter box (see CLAUDE.md).
  stopKeydown(evt) {
    evt.stopPropagation();
  }

  _bi(evt) {
    return parseInt(evt.currentTarget.dataset.bi, 10);
  }

  handleSearch(evt) {
    this._filters[this._bi(evt)].search = evt.target.value;
    this._rebuild();
  }
  handleTimelineMax(evt) {
    this._filters[this._bi(evt)].max = evt.target.value;
    this._rebuild();
  }
  handleTimelineType(evt) {
    this._filters[this._bi(evt)].type = evt.target.value;
    this._rebuild();
  }
  handleSort(evt) {
    const bi = this._bi(evt);
    const col = parseInt(evt.currentTarget.dataset.col, 10);
    const f = this._filters[bi];
    if (f.sortCol === col) f.sortDir = -f.sortDir;
    else {
      f.sortCol = col;
      f.sortDir = 1;
    }
    this._rebuild();
  }
  handleLegendToggle(evt) {
    const bi = this._bi(evt);
    const label = evt.currentTarget.dataset.label;
    const f = this._filters[bi];
    f.hidden = { ...f.hidden, [label]: !f.hidden[label] };
    this._rebuild();
  }
  handleClearFilters(evt) {
    const bi = this._bi(evt);
    this._filters[bi] = this._defaultFilter(this._raw[bi]);
    this._rebuild();
  }

  // ---- carousel image lightbox + drill-down ------------------------------

  // Open a carousel card fullscreen — shows the image (if any) and its detail
  // rows. Card identified by block/card index.
  handleCardOpen(evt) {
    const bi = parseInt(evt.currentTarget.dataset.bi, 10);
    const ci = parseInt(evt.currentTarget.dataset.ci, 10);
    const card = this.view[bi] && this.view[bi].carouselCards[ci];
    if (!card || !card.canOpen) return;
    this.lightbox = {
      imageUrl: card.imageUrl || "",
      hasImage: !!card.imageUrl,
      label: card.subtitle || card.title || "",
      title: card.title || "",
      caption: card.caption || "",
      details: card.details || [],
      hasDetails: (card.details || []).length > 0,
      workOrderId: card.workOrderId || null,
      canDrill: !!card.workOrderId
    };
  }

  handleCloseLightbox() {
    this.lightbox = null;
  }

  // Stop the backdrop's close handler when tapping the image/content itself.
  stopBubble(evt) {
    evt.stopPropagation();
  }

  handleGoToRecord() {
    const woId = this.lightbox && this.lightbox.workOrderId;
    this.lightbox = null;
    if (!woId) return;
    this.dispatchEvent(
      new CustomEvent("drilldown", {
        detail: { workOrderId: woId },
        bubbles: true,
        composed: true
      })
    );
  }
}
