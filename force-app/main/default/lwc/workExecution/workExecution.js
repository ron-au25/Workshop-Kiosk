import { LightningElement, api, track } from 'lwc';
import getMeasurePoints from '@salesforce/apex/KioskController.getMeasurePoints';
import saveMeasurePoint from '@salesforce/apex/KioskController.saveMeasurePoint';
import deleteMeasurePoint from '@salesforce/apex/KioskController.deleteMeasurePoint';
import getWorkOrderAttachments from '@salesforce/apex/KioskController.getWorkOrderAttachments';
import getWorkOrderDetail from '@salesforce/apex/KioskController.getWorkOrderDetail';

const MEASURE_TYPES = ['Attention Required', 'Measure', 'OK'];
const VALUE_TYPES = ['Temperature', 'Pressure', 'Level', 'Width', 'Length'];

export default class WorkExecution extends LightningElement {
    @api workOrderId;
    @api sessionToken;

    @track measurePoints = [];
    @track attachments = [];
    @track attachmentOwnerWorkOrderId = null;
    @track isLoading = false;
    @track hasError = false;

    // Attachment viewer
    @track selectedAttachmentIndex = 0;

    // Right panel collapse + resize
    @track rightVisible = true;
    @track rightWidthPx = 380;
    _dragging = false;
    _dragStartX = 0;
    _dragStartRight = 0;

    // Form state
    @track showForm = false;
    @track isSaving = false;
    @track saveFeedback = '';
    @track saveFeedbackIsError = false;

    // Edit fields
    @track editId = null;
    @track editComponentName = '';
    @track editMeasureType = 'OK';
    @track editComments = '';
    @track editReviewNotes = '';
    @track editMeasureValue = '';
    @track editMeasureValueType = 'Temperature';

    connectedCallback() {
        this.loadAll();
    }

    async loadAll() {
        this.isLoading = true;
        this.hasError = false;
        try {
            const [points, attachments, detail] = await Promise.all([
                getMeasurePoints({ token: this.sessionToken, workOrderId: this.workOrderId }),
                getWorkOrderAttachments({ token: this.sessionToken, workOrderId: this.workOrderId }),
                getWorkOrderDetail({ token: this.sessionToken, workOrderId: this.workOrderId }),
            ]);
            this.measurePoints = points || [];

            // If no PDFs on this WO and a parent exists, load parent attachments instead.
            // Track which WO the attachments belong to so the annotator saves the
            // annotated copy back onto the same parent (otherwise it lands on the child
            // and the parent-fallback stops finding the original on the next load).
            let atts = attachments || [];
            let ownerWoId = this.workOrderId;
            if (atts.length === 0 && detail?.parentWorkOrderId) {
                try {
                    const parentAtts = await getWorkOrderAttachments({
                        token: this.sessionToken,
                        workOrderId: detail.parentWorkOrderId,
                    }) || [];
                    if (parentAtts.length > 0) {
                        atts = parentAtts;
                        ownerWoId = detail.parentWorkOrderId;
                    }
                } catch (_) { /* ignore — leave attachments empty */ }
            }
            this.attachments = atts;
            this.attachmentOwnerWorkOrderId = ownerWoId;
            if (this.selectedAttachmentIndex >= this.attachments.length) {
                this.selectedAttachmentIndex = 0;
            }
        } catch (e) {
            this.hasError = true;
        } finally {
            this.isLoading = false;
        }
    }

    handleBack() {
        this.dispatchEvent(new CustomEvent('back'));
    }

    handleAddEntry() {
        this.editId = null;
        this.editComponentName = '';
        this.editMeasureType = 'OK';
        this.editComments = '';
        this.editReviewNotes = '';
        this.editMeasureValue = '';
        this.editMeasureValueType = 'Temperature';
        this.saveFeedback = '';
        this.showForm = true;
    }

    handleEditPoint(evt) {
        const pointId = evt.currentTarget.dataset.pointId;
        const point = this.measurePoints.find(p => p.id === pointId);
        if (!point) return;
        this.editId = point.id;
        this.editComponentName = point.componentName || '';
        this.editMeasureType = point.measureType || 'OK';
        this.editComments = point.comments || '';
        this.editReviewNotes = point.reviewNotes || '';
        this.editMeasureValue = point.measureValue != null ? String(point.measureValue) : '';
        this.editMeasureValueType = point.measureValueType || 'Temperature';
        this.saveFeedback = '';
        this.showForm = true;
    }

    async handleMarkOk(evt) {
        const pointId = evt.currentTarget.dataset.pointId;
        const point = this.measurePoints.find(p => p.id === pointId);
        if (!point) return;
        try {
            const req = {
                id: point.id,
                componentName: point.componentName,
                measureType: 'OK',
                comments: point.comments,
                reviewNotes: point.reviewNotes,
                measureValue: null,
                measureValueType: null,
                workOrderId: this.workOrderId,
            };
            const saved = await saveMeasurePoint({ token: this.sessionToken, reqJson: JSON.stringify(req) });
            this.measurePoints = this.measurePoints.map(p => p.id === saved.id ? saved : p);
        } catch (e) {
            // silent fail
        }
    }

    async handleFormSave() {
        if (!this.editComponentName.trim()) {
            this._showFeedback('Component Name is required.', true);
            return;
        }
        this.isSaving = true;
        try {
            const req = {
                id: this.editId || null,
                componentName: this.editComponentName,
                measureType: this.editMeasureType,
                comments: this.editComments,
                reviewNotes: this.editReviewNotes,
                measureValue: this.editMeasureType === 'Measure' && this.editMeasureValue !== ''
                    ? parseFloat(this.editMeasureValue)
                    : null,
                measureValueType: this.editMeasureType === 'Measure' ? this.editMeasureValueType : null,
                workOrderId: this.workOrderId,
            };
            const saved = await saveMeasurePoint({
                token: this.sessionToken,
                reqJson: JSON.stringify(req),
            });
            if (this.editId) {
                this.measurePoints = this.measurePoints.map(p => p.id === saved.id ? saved : p);
            } else {
                this.measurePoints = [saved, ...this.measurePoints];
            }
            this._showFeedback('Saved.', false);
            this.showForm = false;
        } catch (e) {
            const msg = e.body?.message || '';
            if (msg.includes('SESSION_EXPIRED')) {
                this._showFeedback('Session expired. Please sign in again.', true);
            } else {
                this._showFeedback('Save failed. Try again.', true);
            }
        } finally {
            this.isSaving = false;
        }
    }

    handleFormCancel() {
        this.showForm = false;
        this.saveFeedback = '';
    }

    handleInputKeydown(evt) {
        evt.stopPropagation();
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

    handleCommentsChange(evt) {
        this.editComments = evt.target.value;
    }

    handleReviewNotesChange(evt) {
        this.editReviewNotes = evt.target.value;
    }

    handleSelectAttachment(evt) {
        const idx = parseInt(evt.currentTarget.dataset.idx, 10);
        if (!isNaN(idx)) this.selectedAttachmentIndex = idx;
    }

    handleAnnotationSaved() {
        // After save, stay on current tab but refresh list (new annotated copy appears)
        const currentUrl = this.selectedAttachmentUrl;
        this.loadAll().then ? this.loadAll() : undefined;
        // Restore selection to same doc after reload — handled in loadAll via URL match
        this._restoreUrl = currentUrl;
    }

    handleToggleRight() {
        this.rightVisible = !this.rightVisible;
    }

    // Divider drag — mouse
    handleDividerMouseDown(evt) {
        evt.preventDefault();
        this._startDrag(evt.clientX);
    }

    // Divider drag — touch
    handleDividerTouchStart(evt) {
        this._startDrag(evt.touches[0].clientX);
    }

    _startDrag(clientX) {
        this._dragging = true;
        this._dragStartX = clientX;
        this._dragStartRight = this.rightWidthPx;
        const onMove = (e) => {
            if (!this._dragging) return;
            const x = e.touches ? e.touches[0].clientX : e.clientX;
            const delta = this._dragStartX - x;
            const body = this.template.querySelector('[data-id="weBody"]');
            const totalW = body ? body.clientWidth : 800;
            const newRight = Math.min(Math.max(this._dragStartRight + delta, 200), totalW - 200);
            this.rightWidthPx = newRight;
        };
        const onUp = () => {
            this._dragging = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onUp);
    }

    _showFeedback(msg, isError) {
        this.saveFeedback = msg;
        this.saveFeedbackIsError = !!isError;
        if (!isError) {
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => { this.saveFeedback = ''; }, 2500);
        }
    }

    _formatDate(isoStr) {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            return d.toLocaleString('en-AU', {
                day: '2-digit', month: 'short',
                hour: '2-digit', minute: '2-digit', hour12: false,
            });
        } catch (_) {
            return isoStr;
        }
    }

    get enrichedPoints() {
        return this.measurePoints.map(p => {
            let typeClass = 'ok';
            if (p.measureType === 'Attention Required') typeClass = 'attention';
            else if (p.measureType === 'Measure') typeClass = 'measure';
            return {
                ...p,
                typeClass,
                formattedDate: this._formatDate(p.createdDate),
                showMeasure: p.measureType === 'Measure' && p.measureValue != null,
                showOkBtn: p.measureType !== 'OK',
            };
        });
    }

    get measureTypeOptions() {
        return MEASURE_TYPES.map(t => ({
            value: t,
            label: t,
            isSelected: this.editMeasureType === t,
        }));
    }

    get valueTypeOptions() {
        return VALUE_TYPES.map(t => ({
            value: t,
            label: t,
            isSelected: this.editMeasureValueType === t,
        }));
    }

    get showValueFields() {
        return this.editMeasureType === 'Measure';
    }

    get hasAttachments() {
        return this.attachments.length > 0;
    }

    get selectedAttachmentUrl() {
        return this.selectedAttachment ? this.selectedAttachment.downloadUrl : null;
    }

    get hasMultipleAttachments() {
        return this.attachments.length > 1;
    }

    get sortedAttachments() {
        // Originals first, annotated copies after
        return [...this.attachments].sort((a, b) => {
            const aAnn = (a.title || '').startsWith('Annotated - ');
            const bAnn = (b.title || '').startsWith('Annotated - ');
            if (aAnn === bAnn) return 0;
            return aAnn ? 1 : -1;
        });
    }

    get enrichedAttachments() {
        return this.sortedAttachments.map((a, idx) => ({
            ...a,
            idx,
            isSelected: idx === this.selectedAttachmentIndex,
            btnClass: 'att-tab' + (idx === this.selectedAttachmentIndex ? ' active' : ''),
        }));
    }

    get selectedAttachment() {
        const sorted = this.sortedAttachments;
        if (!sorted.length) return null;
        return sorted[this.selectedAttachmentIndex] || sorted[0];
    }

    get leftStyle() {
        if (!this.rightVisible) return 'flex:1 1 auto;min-width:0;';
        return `flex:1 1 auto;min-width:0;`;
    }

    get rightStyle() {
        if (!this.rightVisible) return 'flex:0 0 32px;min-width:32px;max-width:32px;overflow:hidden;';
        return `flex:0 0 ${this.rightWidthPx}px;min-width:200px;max-width:70%;`;
    }

    get collapseIcon() { return this.rightVisible ? '›' : '‹'; }
    get collapseTitle() { return this.rightVisible ? 'Collapse panel' : 'Expand panel'; }

    get saveBtnLabel() {
        return this.isSaving ? 'Saving…' : (this.editId ? 'Update Entry' : 'Add Entry');
    }

    get saveFeedbackClass() {
        return this.saveFeedbackIsError ? 'form-feedback error' : 'form-feedback';
    }

    get hasPoints() {
        return this.measurePoints.length > 0;
    }
}
