import { LightningElement, api } from "lwc";
import kioskPdfjsHost from "@salesforce/resourceUrl/kioskPdfjsHost";
import kioskPdfjs from "@salesforce/resourceUrl/kioskPdfjs";
import getMeasurePdf from "@salesforce/apex/KioskController.getMeasurePdf";
import { locateLabelLine, splitTableComponent } from "c/kioskPdfLocate";

const ZOOMS = [1, 1.5, 2, 3];
const BAND_HEIGHT = 0.06;

export default class KioskPdfPane extends LightningElement {
  @api sessionToken;
  @api workpackId;

  loading = false;
  errorText = "";
  tooLarge = false;
  pageNumber = 1;
  pageCount = 0;
  zoomIndex = 0;
  hostReady = false;
  highlight = null; // { x, y, w, h } page fractions
  pageRect = null; // { left, top, width, height } css px inside the iframe

  _docId = null;
  _b64 = {}; // documentId -> base64
  _textPages = {}; // documentId -> { pageNumber: items }
  _wanted = null; // last showMeasure request
  _pendingRender = null;
  _boundMessage = null;
  _stageW = 0;
  _stageH = 0;

  connectedCallback() {
    this._boundMessage = this.handleMessage.bind(this);
    window.addEventListener("message", this._boundMessage);
  }

  disconnectedCallback() {
    window.removeEventListener("message", this._boundMessage);
  }

  get iframeSrc() {
    const abs = (u) => new URL(u, window.location.href).href;
    return (
      abs(kioskPdfjsHost) +
      "/index.html?pdfjs=" +
      encodeURIComponent(abs(kioskPdfjs + "/pdf.min.js")) +
      "&worker=" +
      encodeURIComponent(abs(kioskPdfjs + "/pdf.worker.min.js")) +
      "&origin=" +
      encodeURIComponent(window.location.origin)
    );
  }

  get zoom() {
    return ZOOMS[this.zoomIndex];
  }

  get canZoomOut() {
    return this.zoomIndex > 0;
  }
  get cannotZoomOut() {
    return !this.canZoomOut;
  }
  get cannotZoomIn() {
    return this.zoomIndex >= ZOOMS.length - 1;
  }
  get cannotPrev() {
    return this.pageNumber <= 1;
  }
  get cannotNext() {
    return !this.pageCount || this.pageNumber >= this.pageCount;
  }
  get pageLabel() {
    return this.pageCount ? this.pageNumber + " / " + this.pageCount : "—";
  }
  get zoomLabel() {
    return Math.round(this.zoom * 100) + "%";
  }

  get stageStyle() {
    return "width:" + this._stageW + "px;height:" + this._stageH + "px;";
  }

  get boxStyle() {
    const h = this.highlight;
    const r = this.pageRect;
    if (!h || !r) {
      return "display:none;";
    }
    return (
      "left:" +
      (r.left + h.x * r.width) +
      "px;" +
      "top:" +
      (r.top + h.y * r.height) +
      "px;" +
      "width:" +
      h.w * r.width +
      "px;" +
      "height:" +
      h.h * r.height +
      "px;"
    );
  }

  get showBox() {
    return !!(this.highlight && this.pageRect);
  }

  get hasError() {
    return !!this.errorText;
  }

  /** Open the measure's page and box its line. */
  @api
  async showMeasure(req) {
    this._wanted = req || null;
    this.errorText = "";
    this.tooLarge = false;
    this.highlight = null;
    if (!req) {
      return;
    }
    const docId = req.documentId || null;
    try {
      await this.ensureDocument(docId);
    } catch (e) {
      this.fail(e);
      return;
    }
    if (this.tooLarge) {
      return;
    }
    const page = Number(req.pageNumber) > 0 ? Number(req.pageNumber) : 1;
    this.renderPage(page);
  }

  @api
  goToPage(n) {
    const page = Math.max(
      1,
      Math.min(Number(n) || 1, this.pageCount || Number(n) || 1)
    );
    this.highlight = null;
    this.renderPage(page);
  }

  async ensureDocument(docId) {
    const key = docId || "__newest__";
    if (this._b64[key]) {
      this._docId = key;
      return;
    }
    this.loading = true;
    try {
      const res = await getMeasurePdf({
        token: this.sessionToken,
        workpackId: this.workpackId,
        contentDocumentId: docId
      });
      if (res && res.tooLarge) {
        this.tooLarge = true;
        return;
      }
      const uri = res && res.dataUri ? res.dataUri : "";
      const b64 = uri.indexOf(",") >= 0 ? uri.split(",")[1] : "";
      if (!b64) {
        throw new Error("EMPTY_PDF");
      }
      this._b64[key] = b64;
      this._docId = key;
      // Remember the real id so a later request for the newest doc reuses the cache.
      if (res.documentId && res.documentId !== key) {
        this._b64[res.documentId] = b64;
      }
    } finally {
      this.loading = false;
    }
  }

  renderPage(page) {
    this.pageNumber = page;
    this.pageRect = null;
    this.loading = true;
    this.measureStage();
    this._pendingRender = page;
    this.postRender();
  }

  measureStage() {
    const wrap = this.template.querySelector(".pane-scroll");
    const rect = wrap ? wrap.getBoundingClientRect() : null;
    const baseW = rect && rect.width > 50 ? rect.width : 600;
    const baseH = rect && rect.height > 50 ? rect.height : 700;
    this._stageW = Math.floor(baseW * this.zoom);
    this._stageH = Math.floor(baseH * this.zoom);
  }

  postRender() {
    const iframe = this.template.querySelector("iframe");
    if (
      !this.hostReady ||
      !iframe ||
      !iframe.contentWindow ||
      !this._docId ||
      this._pendingRender == null
    ) {
      return;
    }
    const origin = new URL(iframe.src, window.location.href).origin;
    iframe.contentWindow.postMessage(
      {
        type: "pdfjsHost:render",
        payload: {
          base64: this._b64[this._docId],
          pageNumber: this._pendingRender,
          availableWidth: this._stageW,
          availableHeight: this._stageH
        }
      },
      origin
    );
  }

  handleMessage(event) {
    const iframe = this.template.querySelector("iframe");
    if (!iframe || event.source !== iframe.contentWindow) {
      return;
    }
    const msg = event.data;
    if (
      !msg ||
      typeof msg.type !== "string" ||
      msg.type.indexOf("pdfjsHost:") !== 0
    ) {
      return;
    }
    const p = msg.payload || {};
    switch (msg.type) {
      case "pdfjsHost:ready":
        this.hostReady = true;
        this.postRender();
        break;
      case "pdfjsHost:rendered":
        this.loading = false;
        this.pageCount = p.pageCount || this.pageCount;
        this.pageNumber = p.pageNumber || this.pageNumber;
        this.pageRect = {
          left: p.bitmapCssLeft || 0,
          top: p.bitmapCssTop || 0,
          width: p.bitmapCssWidth || 0,
          height: p.bitmapCssHeight || 0
        };
        this.dispatchEvent(
          new CustomEvent("pagechange", {
            detail: { pageNumber: this.pageNumber, pageCount: this.pageCount }
          })
        );
        this.computeHighlight();
        break;
      case "pdfjsHost:text": {
        const byPage = {};
        (p.pages || []).forEach((pg) => {
          byPage[pg.pageNumber] = pg.items || [];
        });
        this._textPages[this._docId] = byPage;
        this.computeHighlight();
        break;
      }
      case "pdfjsHost:error":
        this.fail(new Error(p.message || "PDF error"));
        break;
      default:
        break;
    }
  }

  computeHighlight() {
    const req = this._wanted;
    if (!req || !this.pageRect) {
      return;
    }
    const reqPage = Number(req.pageNumber) > 0 ? Number(req.pageNumber) : 1;
    if (reqPage !== this.pageNumber) {
      this.highlight = null;
      return;
    }
    const items = (this._textPages[this._docId] || {})[this.pageNumber];
    const pct = req.pagePositionEstimate;
    if (!items) {
      // Text not read yet: show the rough band now, refine when text arrives.
      this.highlight = this.band(pct);
      return;
    }
    const label = req.tableName
      ? splitTableComponent(req.componentName).row
      : req.componentName;
    this.highlight = locateLabelLine(items, label, pct) || this.band(pct);
  }

  band(pct) {
    if (pct == null || pct === "") {
      return null;
    }
    let n = parseFloat(String(pct).replace("%", ""));
    if (!isFinite(n)) {
      return null;
    }
    if (n > 1) {
      n = n / 100;
    }
    n = Math.max(0, Math.min(1 - BAND_HEIGHT, n));
    return { x: 0, y: n, w: 1, h: BAND_HEIGHT };
  }

  fail(e) {
    this.loading = false;
    const m =
      (e && e.body && e.body.message) ||
      (e && e.message) ||
      "PDF failed to load";
    this.errorText = m === "NOT_FOUND" ? "No PDF on this workpack" : m;
    this.dispatchEvent(
      new CustomEvent("error", { detail: { message: this.errorText } })
    );
  }

  handlePrev() {
    this.goToPage(this.pageNumber - 1);
  }
  handleNext() {
    this.goToPage(this.pageNumber + 1);
  }
  handleZoomIn() {
    if (this.zoomIndex < ZOOMS.length - 1) {
      this.zoomIndex += 1;
      this.reflow();
    }
  }
  handleZoomOut() {
    if (this.zoomIndex > 0) {
      this.zoomIndex -= 1;
      this.reflow();
    }
  }
  handleFit() {
    this.zoomIndex = 0;
    this.reflow();
  }

  reflow() {
    if (!this._docId) {
      return;
    }
    this.pageRect = null;
    this.measureStage();
    this._pendingRender = this.pageNumber;
    this.loading = true;
    this.postRender();
  }
}
