import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import pdfJsUrl from '@salesforce/resourceUrl/pdfjs';
import pdfWorkerUrl from '@salesforce/resourceUrl/pdfjsWorker';
import pdfLibUrl from '@salesforce/resourceUrl/pdflib';
import uploadAnnotatedPdf from '@salesforce/apex/KioskController.uploadAnnotatedPdf';

const SCALE = 1.8;
const TOOL = { HAND: 'hand', DRAW: 'draw', HIGHLIGHT: 'highlight', TEXT: 'text', SIGN: 'sign', ERASER: 'eraser' };

export default class PdfAnnotator extends LightningElement {
    @api workOrderId;
    @api sessionToken;
    @api fileName = 'Annotated PDF';

    // Getter/setter so switching tabs triggers a reload
    _pdfUrl = null;
    get pdfUrl() { return this._pdfUrl; }
    @api set pdfUrl(val) {
        const changed = this._pdfUrl !== val;
        this._pdfUrl = val;
        if (changed && this._libsReady) this._reloadPdf();
    }

    @track activeTool = TOOL.HAND;
    @track strokeColor = '#E25822';
    @track strokeSize = 6;
    @track isLoading = true;
    @track hasError = false;
    @track errorMsg = '';
    @track isSaving = false;
    @track statusMsg = '';
    @track statusIsError = false;
    @track showTextInput = false;
    @track pendingText = '';
    @track textPopupStyle = '';
    @track totalPages = 0;

    _pdfDoc = null;
    _libsReady = false;
    _layers = new Map();    // pageNum → ImageData
    _undos  = new Map();    // pageNum → ImageData[]
    _pageRefs = [];         // [{pageNum, drawCanvas, drawCtx, w, h}]
    _activePageNum = 1;
    _activeDrawCtx = null;
    _activeDrawCanvas = null;
    _isDrawing = false;
    _textCanvasX = 0;
    _textCanvasY = 0;

    connectedCallback() {
        Promise.all([
            loadScript(this, pdfJsUrl),
            loadScript(this, pdfLibUrl),
        ]).then(() => {
            this._libsReady = true;
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
            }
            if (this._pdfUrl) this._reloadPdf();
        }).catch(err => {
            console.error('[pdfAnnotator] lib load failed', err);
            this.errorMsg = 'Could not load PDF libraries.';
            this.hasError = true;
            this.isLoading = false;
        });
    }

    _reloadPdf() {
        this.isLoading = true;
        this.hasError = false;
        this._pdfDoc = null;
        this._layers = new Map();
        this._undos  = new Map();
        this._pageRefs = [];
        this.totalPages = 0;
        this.showTextInput = false;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => this._loadPdf(), 0);
    }

    async _loadPdf() {
        if (!this._pdfUrl) { this.isLoading = false; return; }
        try {
            this._pdfDoc = await window.pdfjsLib.getDocument(this._pdfUrl).promise;
            this.totalPages = this._pdfDoc.numPages;
            this.isLoading = false;
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => this._renderAllPages(), 40);
        } catch (e) {
            console.error('[pdfAnnotator] load failed', e);
            this.errorMsg = 'Failed to open the document. It may not be accessible from the browser.';
            this.hasError = true;
            this.isLoading = false;
        }
    }

    async _renderAllPages() {
        const container = this.template.querySelector('[data-id="pagesContainer"]');
        if (!container || !this._pdfDoc) return;
        while (container.firstChild) container.removeChild(container.firstChild);
        this._pageRefs = [];

        for (let pg = 1; pg <= this.totalPages; pg++) {
            const page = await this._pdfDoc.getPage(pg);
            const vp   = page.getViewport({ scale: SCALE });

            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position:relative;display:block;margin:0 auto 16px;line-height:0;' +
                                    'box-shadow:0 4px 24px rgba(0,0,0,.6);width:fit-content;';

            const pdfC = document.createElement('canvas');
            pdfC.width = vp.width; pdfC.height = vp.height;
            pdfC.style.cssText = 'display:block;max-width:100%;';

            const drawC = document.createElement('canvas');
            drawC.width = vp.width; drawC.height = vp.height;
            drawC.style.cssText = 'position:absolute;top:0;left:0;cursor:grab;' +
                                  'touch-action:none;max-width:100%;width:100%;height:100%;';

            wrapper.appendChild(pdfC);
            wrapper.appendChild(drawC);
            container.appendChild(wrapper);

            await page.render({ canvasContext: pdfC.getContext('2d'), viewport: vp }).promise;

            const drawCtx = drawC.getContext('2d');
            const saved   = this._layers.get(pg);
            if (saved) drawCtx.putImageData(saved, 0, 0);

            const ref = { pageNum: pg, drawCanvas: drawC, drawCtx, w: vp.width, h: vp.height };
            this._pageRefs.push(ref);
            // Apply current mode immediately so hand mode starts with pointer-events:none
            const isHand = this.activeTool === TOOL.HAND;
            drawC.style.cursor = isHand ? 'default' : 'crosshair';
            drawC.style.pointerEvents = isHand ? 'none' : 'auto';

            // Attach events via closure — no LWC template binding needed
            /* eslint-disable no-loop-func */
            const self = this;
            drawC.addEventListener('mousedown',  (e) => { self._activate(ref); self._startStroke(self._xy(e.clientX, e.clientY, drawC)); });
            drawC.addEventListener('mousemove',  (e) => { self._continueStroke(self._xy(e.clientX, e.clientY, drawC)); });
            drawC.addEventListener('mouseup',    ()  => { self._endStroke(); });
            drawC.addEventListener('mouseleave', ()  => { self._endStroke(); });
            drawC.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.touches[0]; self._activate(ref); self._startStroke(self._xy(t.clientX, t.clientY, drawC)); }, { passive: false });
            drawC.addEventListener('touchmove',  (e) => { e.preventDefault(); const t = e.touches[0]; self._continueStroke(self._xy(t.clientX, t.clientY, drawC)); }, { passive: false });
            drawC.addEventListener('touchend',   (e) => { e.preventDefault(); self._endStroke(); }, { passive: false });
            /* eslint-enable no-loop-func */
        }
    }

    _activate(ref) {
        this._activePageNum   = ref.pageNum;
        this._activeDrawCanvas = ref.drawCanvas;
        this._activeDrawCtx   = ref.drawCtx;
    }

    _xy(clientX, clientY, canvas) {
        const r = canvas.getBoundingClientRect();
        return {
            x: (clientX - r.left) * (canvas.width  / r.width),
            y: (clientY - r.top)  * (canvas.height / r.height),
        };
    }

    _saveLayer() {
        if (!this._activeDrawCtx || !this._activeDrawCanvas) return;
        this._layers.set(this._activePageNum,
            this._activeDrawCtx.getImageData(0, 0, this._activeDrawCanvas.width, this._activeDrawCanvas.height));
    }

    _pushUndo() {
        if (!this._activeDrawCtx || !this._activeDrawCanvas) return;
        const stack = this._undos.get(this._activePageNum) || [];
        stack.push(this._activeDrawCtx.getImageData(0, 0, this._activeDrawCanvas.width, this._activeDrawCanvas.height));
        if (stack.length > 20) stack.shift();
        this._undos.set(this._activePageNum, stack);
    }

    // ─── Tools ────────────────────────────────────────────────────────────────

    handleToolSelect(evt) {
        this.activeTool = evt.currentTarget.dataset.tool;
        this.showTextInput = false;
        this._applyCanvasMode();
    }

    _applyCanvasMode() {
        const isHand = this.activeTool === TOOL.HAND;
        this._pageRefs.forEach(r => {
            r.drawCanvas.style.cursor = isHand ? 'default' : 'crosshair';
            r.drawCanvas.style.pointerEvents = isHand ? 'none' : 'auto';
        });
    }
    handleColorChange(evt) { this.strokeColor = evt.target.value; }
    handleSizeSelect(evt)  { this.strokeSize = parseInt(evt.currentTarget.dataset.size, 10); }
    handleInputKeydown(evt) { evt.stopPropagation(); }

    handleUndo() {
        if (!this._activeDrawCtx || !this._activeDrawCanvas) return;
        const stack = this._undos.get(this._activePageNum) || [];
        if (!stack.length) return;
        const prev = stack.pop();
        this._undos.set(this._activePageNum, stack);
        this._activeDrawCtx.putImageData(prev, 0, 0);
        this._saveLayer();
    }

    handleClearPage() {
        if (!this._activeDrawCtx || !this._activeDrawCanvas) return;
        this._pushUndo();
        this._activeDrawCtx.clearRect(0, 0, this._activeDrawCanvas.width, this._activeDrawCanvas.height);
        this._saveLayer();
    }

    // ─── Drawing ──────────────────────────────────────────────────────────────

    _startStroke(pos) {
        if (this.activeTool === TOOL.HAND) return;
        if (this.activeTool === TOOL.TEXT) {
            this._textCanvasX = pos.x;
            this._textCanvasY = pos.y;
            const canvas = this._activeDrawCanvas;
            if (!canvas) return;
            const cr = canvas.getBoundingClientRect();
            const container = this.template.querySelector('[data-id="pagesContainer"]');
            const pr = container ? container.getBoundingClientRect() : cr;
            const relX = cr.left - pr.left + (pos.x / canvas.width)  * cr.width;
            const relY = cr.top  - pr.top  + (pos.y / canvas.height) * cr.height;
            this.textPopupStyle = `left:${Math.min(relX, pr.width - 260)}px;top:${relY}px;`;
            this.pendingText = '';
            this.showTextInput = true;
            return;
        }
        if (!this._activeDrawCtx) return;
        this._pushUndo();
        this._isDrawing = true;
        this._applyStyle();
        this._activeDrawCtx.beginPath();
        this._activeDrawCtx.moveTo(pos.x, pos.y);
    }

    _continueStroke(pos) {
        if (!this._isDrawing || !this._activeDrawCtx) return;
        this._activeDrawCtx.lineTo(pos.x, pos.y);
        this._activeDrawCtx.stroke();
    }

    _endStroke() {
        if (!this._isDrawing) return;
        this._isDrawing = false;
        if (this._activeDrawCtx) this._activeDrawCtx.closePath();
        this._saveLayer();
    }

    _applyStyle() {
        const ctx = this._activeDrawCtx;
        if (!ctx) return;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        switch (this.activeTool) {
            case TOOL.ERASER:
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
                ctx.lineWidth   = this.strokeSize * 4;
                break;
            case TOOL.HIGHLIGHT:
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = this._rgba(this.strokeColor, 0.35);
                ctx.lineWidth   = this.strokeSize * 5;
                break;
            case TOOL.SIGN:
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = '#1a1a8c';
                ctx.lineWidth   = Math.max(2, this.strokeSize - 2);
                break;
            default:
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = this.strokeColor;
                ctx.lineWidth   = this.strokeSize;
        }
    }

    _rgba(hex, a) {
        const r = parseInt(hex.slice(1,3), 16);
        const g = parseInt(hex.slice(3,5), 16);
        const b = parseInt(hex.slice(5,7), 16);
        return `rgba(${r},${g},${b},${a})`;
    }

    // ─── Text tool ────────────────────────────────────────────────────────────

    handleTextEntry(evt) { this.pendingText = evt.target.value; }

    handleTextKeydown(evt) {
        evt.stopPropagation();
        if (evt.key === 'Enter' && !evt.shiftKey) { evt.preventDefault(); this.handleTextCommit(); }
        if (evt.key === 'Escape') this.handleTextCancel();
    }

    handleTextCommit() {
        if (!this.pendingText.trim() || !this._activeDrawCtx) { this.showTextInput = false; return; }
        this._pushUndo();
        const ctx = this._activeDrawCtx;
        const fs  = this.strokeSize * 4 + 10;
        ctx.globalCompositeOperation = 'source-over';
        ctx.font      = `bold ${fs}px -apple-system, sans-serif`;
        ctx.fillStyle = this.strokeColor;
        ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = 3;
        this.pendingText.split('\n').forEach((line, i) => {
            ctx.fillText(line, this._textCanvasX, this._textCanvasY + i * (fs + 4));
        });
        ctx.shadowBlur = 0;
        this._saveLayer();
        this.showTextInput = false;
        this.pendingText = '';
    }

    handleTextCancel() { this.showTextInput = false; this.pendingText = ''; }

    // ─── Save ─────────────────────────────────────────────────────────────────

    async handleSave() {
        if (!window.PDFLib) { this._status('PDF library not ready.', true); return; }
        this._saveLayer();
        this.isSaving = true;
        this._status('Building PDF…');
        try {
            const { PDFDocument } = window.PDFLib;
            const outDoc = await PDFDocument.create();

            for (let pg = 1; pg <= this.totalPages; pg++) {
                const page = await this._pdfDoc.getPage(pg);
                const vp   = page.getViewport({ scale: SCALE });

                const pdfC = document.createElement('canvas');
                pdfC.width = vp.width; pdfC.height = vp.height;
                await page.render({ canvasContext: pdfC.getContext('2d'), viewport: vp }).promise;

                const layer = this._layers.get(pg);
                if (layer) {
                    const annC = document.createElement('canvas');
                    annC.width = layer.width; annC.height = layer.height;
                    annC.getContext('2d').putImageData(layer, 0, 0);
                    pdfC.getContext('2d').drawImage(annC, 0, 0, vp.width, vp.height);
                }

                const jpegBytes = await new Promise(res => {
                    pdfC.toBlob(blob => {
                        const fr = new FileReader();
                        fr.onloadend = () => res(new Uint8Array(fr.result));
                        fr.readAsArrayBuffer(blob);
                    }, 'image/jpeg', 0.85);
                });

                const img   = await outDoc.embedJpg(jpegBytes);
                const outPg = outDoc.addPage([vp.width, vp.height]);
                outPg.drawImage(img, { x: 0, y: 0, width: vp.width, height: vp.height });
            }

            const bytes = await outDoc.save();
            let b64 = '';
            const chunk = 8192;
            for (let i = 0; i < bytes.length; i += chunk) {
                b64 += String.fromCharCode(...bytes.slice(i, i + chunk));
            }

            this._status('Uploading…');
            await uploadAnnotatedPdf({
                token: this.sessionToken,
                workOrderId: this.workOrderId,
                title: 'Annotated - ' + this.fileName,
                base64Data: btoa(b64),
            });

            this._status('Saved — new PDF attached to work order.');
            this.dispatchEvent(new CustomEvent('saved'));
        } catch (e) {
            const body = e?.body;
            console.error('[pdfAnnotator] save error',
                'message=', e?.message,
                'body.message=', body?.message,
                'body.exceptionType=', body?.exceptionType,
                'body.stackTrace=', body?.stackTrace,
                'raw=', e);
            const msg = body?.message || e?.message || '';
            let display;
            if (msg.includes('SESSION_EXPIRED')) display = 'Session expired.';
            else if (msg.includes('INVALID_REQUEST')) display = 'Save failed: invalid request.';
            else if (msg) display = 'Save failed: ' + msg;
            else display = 'Save failed. Try again.';
            this._status(display, true);
        } finally {
            this.isSaving = false;
        }
    }

    _status(msg, isError = false) {
        this.statusMsg = msg;
        this.statusIsError = !!isError;
        if (!isError) {
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => { this.statusMsg = ''; }, 3500);
        }
    }

    get saveBtnLabel() { return this.isSaving ? 'Saving…' : 'Save PDF'; }
    get statusClass()  { return this.statusIsError ? 'pa-status error' : 'pa-status'; }
    get isHandMode()   { return this.activeTool === TOOL.HAND; }
    _tc(t) { return 'tb-btn tool-btn' + (this.activeTool === t ? ' active' : ''); }
    get toolBtnHand()      { return this._tc(TOOL.HAND); }
    get toolBtnDraw()      { return this._tc(TOOL.DRAW); }
    get toolBtnHighlight() { return this._tc(TOOL.HIGHLIGHT); }
    get toolBtnText()      { return this._tc(TOOL.TEXT); }
    get toolBtnSign()      { return this._tc(TOOL.SIGN); }
    get toolBtnEraser()    { return this._tc(TOOL.ERASER); }
}
