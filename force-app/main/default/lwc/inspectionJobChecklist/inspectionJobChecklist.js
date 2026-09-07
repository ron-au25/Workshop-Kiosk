import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { updateRecord } from 'lightning/uiRecordApi';
import { refreshApex } from '@salesforce/apex';
import getContext from '@salesforce/apex/InspectionChecklistController.getContext';
import getWorkOrderPngImages from '@salesforce/apex/FilePreviewController.getWorkOrderPngImages';
import saveMeasurePoint from '@salesforce/apex/InspectionChecklistController.saveMeasurePoint';
import updateMeasurePointType from '@salesforce/apex/InspectionChecklistController.updateMeasurePointType';
import updateMeasurePointMeasureValues from '@salesforce/apex/InspectionChecklistController.updateMeasurePointMeasureValues';
import markMeasurePointsOk from '@salesforce/apex/InspectionChecklistController.markMeasurePointsOk';
import attachFileToMeasurePoint from '@salesforce/apex/InspectionChecklistController.attachFileToMeasurePoint';
const MEASURE_VALUE_TYPES = [
    { label: 'Temperature', value: 'Temperature' },
    { label: 'Pressure', value: 'Pressure' },
    { label: 'Level', value: 'Level' },
    { label: 'Width', value: 'Width' },
    { label: 'Length', value: 'Length' }
];




export default class InspectionJobChecklist extends LightningElement {
    @api recordId;

    wiredContextResult;
    context;
    loadError;

    /** PNG instruction images from files on the Work Order (name ascending). */
    wiredWoImagesResult;
    instructionImages = [];

    /** New entry: user must pick OK / Attention / Measure (no default). */
    pointType = '';
    selectedComponent = '';
    comments = '';
    measureValue;
    measureType = '';
    saving = false;

    photoTargetId;

    photoUploading = false;

    /** Filter list: All | OK | Attention Required | Measure */
    listTypeFilter = 'All';

    /** Ids of measure points selected for bulk actions (checkboxes). */
    selectedRowIds = [];

    /** While a row type update is in flight. */
    rowTypeUpdatingId;

    /** While row comments or measure fields are saving. */
    rowFieldSavingId;

    commentDraftById = {};
    measureValueDraftById = {};
    measureTypeDraftById = {};

    bulkMarkingOk = false;

    refreshing = false;

    pointTypeOptions = [
        { label: 'OK', value: 'OK' },
        { label: 'Attention', value: 'Attention Required' },
        { label: 'Measure', value: 'Measure' }
    ];

    listFilterOptions = [
        { label: 'All', value: 'All' },
        { label: 'OK', value: 'OK' },
        { label: 'Attention', value: 'Attention Required' },
        { label: 'Measure', value: 'Measure' }
    ];

    @wire(getContext, { workStepId: '$recordId' })
    wiredContext(value) {
        this.wiredContextResult = value;
        const { data, error } = value;
        if (data) {
            this.context = data;
            this.loadError = undefined;
        } else if (error) {
            this.context = undefined;
            this.loadError = error;
        }
    }

    @wire(getWorkOrderPngImages, { recordId: '$recordId' })
    wiredWorkOrderPngImages(value) {
        this.wiredWoImagesResult = value;
        const { data } = value;
        if (data) {
            this.instructionImages = data.map((row) => ({
                ...row,
                key: row.contentDocumentId
            }));
        } else {
            this.instructionImages = [];
        }
    }

    get hasRecordId() {
        return !!this.recordId;
    }

    get hasContext() {
        return this.context && !this.loadError;
    }

    get loadErrorMessage() {
        return this.loadError?.body?.message || 'Unknown error.';
    }

    get workOrderNumber() {
        return this.context?.workOrderLabel || this.context?.workOrderId || '';
    }

    get workOrderSubject() {
        const s = this.context?.workOrderSubject;
        return s != null && String(s).trim() !== '' ? String(s).trim() : '';
    }

    get hasWorkOrderSubject() {
        return !!this.workOrderSubject;
    }

    get acceptedFormats() {
        return '.png,.jpg,.jpeg,.gif,.heic,.webp,image/png,image/jpeg,image/gif,image/webp';
    }

    /** Blank / none / None → no type selected in UI. */
    normalizeRowPointType(pt) {
        if (pt == null || pt === '') {
            return null;
        }
        const s = String(pt).trim();
        if (s === '' || s.toLowerCase() === 'none') {
            return null;
        }
        return s;
    }

    get tableRows() {
        const rows = this.context?.measurePoints || [];
        return rows.map((row) => {
            const pt = this.normalizeRowPointType(row.pointType);
            return {
                ...row,
                measureDisplay:
                    pt === 'Measure' && row.measureValue != null
                        ? `${row.measureValue} (${row.measureTypeLabel || row.measureType || ''})`
                        : ''
            };
        });
    }

    get filteredTableRows() {
        const all = this.tableRows;
        const f = this.listTypeFilter;
        if (!f || f === 'All') {
            return all;
        }
        return all.filter((r) => this.normalizeRowPointType(r.pointType) === f);
    }

    get filterButtons() {
        return this.listFilterOptions.map((o) => ({
            ...o,
            buttonVariant: this.listTypeFilter === o.value ? 'brand' : 'neutral'
        }));
    }

    get addEntryButtons() {
        return this.pointTypeOptions.map((o) => ({
            ...o,
            buttonVariant: this.pointType === o.value ? 'brand' : 'neutral'
        }));
    }

    get listedRows() {
        const selected = new Set(this.selectedRowIds);
        return this.filteredTableRows.map((row) => {
            const pt = this.normalizeRowPointType(row.pointType);
            const rn = row.reviewNotes;
            const reviewNotesText =
                rn != null && String(rn).trim() !== '' ? String(rn).trim() : '';
            const hasReviewNotes = reviewNotesText !== '';
            return {
                ...row,
                rowKey: row.id,
                isSelected: selected.has(row.id),
                typeButtons: this.buildRowTypeButtons(row),
                rowUpdating: this.rowTypeUpdatingId === row.id,
                reviewNotesText,
                hasReviewNotes,
                commentInputValue:
                    this.commentDraftById[row.id] !== undefined
                        ? this.commentDraftById[row.id]
                        : (row.comments || ''),
                showAttentionComments: pt === 'Attention Required',
                showMeasureRowEdit: pt === 'Measure',
                /** OK / Measure legacy text only; hide when type unset so user picks type first. */
                showReadOnlyComments:
                    pt != null && pt !== 'Attention Required' && !!row.comments,
                measureValueInput:
                    this.measureValueDraftById[row.id] !== undefined
                        ? this.measureValueDraftById[row.id]
                        : row.measureValue,
                measureTypeInput:
                    this.measureTypeDraftById[row.id] !== undefined
                        ? this.measureTypeDraftById[row.id]
                        : (row.measureType || ''),
                rowFieldSaving: this.rowFieldSavingId === row.id
            };
        });
    }

    buildRowTypeOptions() {
        return [
            { label: 'OK', value: 'OK' },
            { label: 'Attention', value: 'Attention Required' },
            { label: 'Measure', value: 'Measure' }
        ];
    }

    buildRowTypeButtons(row) {
        const updating = this.rowTypeUpdatingId === row.id;
        const pt = this.normalizeRowPointType(row.pointType);
        return this.buildRowTypeOptions().map((o) => ({
            ...o,
            buttonVariant: pt === o.value ? 'brand' : 'neutral',
            btnKey: `${row.id}-${o.value}`,
            buttonDisabled: updating
        }));
    }

    get hasAnyMeasurePoints() {
        return this.tableRows.length > 0;
    }

    get listFilterEmpty() {
        return this.hasAnyMeasurePoints && this.filteredTableRows.length === 0;
    }

    get allFilteredSelected() {
        const fr = this.filteredTableRows;
        if (fr.length === 0) {
            return false;
        }
        const sel = new Set(this.selectedRowIds);
        return fr.every((r) => sel.has(r.id));
    }

    get hasSelection() {
        return this.selectedRowIds.length > 0;
    }

    get bulkMarkingDisabled() {
        return !this.hasSelection || this.bulkMarkingOk;
    }

    get selectAllLabel() {
        return this.allFilteredSelected ? 'Clear visible selection' : 'Select all visible';
    }

    handleFilterClick(event) {
        const v = event.currentTarget.dataset.value;
        if (v === undefined || v === null) {
            return;
        }
        this.listTypeFilter = v;
        this.selectedRowIds = [];
    }

    handleSelectAllVisible() {
        const fr = this.filteredTableRows;
        if (fr.length === 0) {
            return;
        }
        if (this.allFilteredSelected) {
            const drop = new Set(fr.map((r) => r.id));
            this.selectedRowIds = this.selectedRowIds.filter((id) => !drop.has(id));
        } else {
            const add = new Set(this.selectedRowIds);
            fr.forEach((r) => add.add(r.id));
            this.selectedRowIds = [...add];
        }
    }

    handleRowSelectChange(event) {
        const id = event.currentTarget.dataset.rowId;
        if (!id) {
            return;
        }
        const checked = event.detail.checked;
        if (checked) {
            if (!this.selectedRowIds.includes(id)) {
                this.selectedRowIds = [...this.selectedRowIds, id];
            }
        } else {
            this.selectedRowIds = this.selectedRowIds.filter((x) => x !== id);
        }
    }

    handleRowCommentDraftChange(event) {
        const id = event.currentTarget.dataset.rowId;
        if (!id) {
            return;
        }
        const value = event.detail.value;
        this.commentDraftById = { ...this.commentDraftById, [id]: value };
    }

    handleRowMeasureValueDraftChange(event) {
        const id = event.currentTarget.dataset.rowId;
        if (!id) {
            return;
        }
        const v = event.detail.value;
        this.measureValueDraftById = {
            ...this.measureValueDraftById,
            [id]: v === '' || v === undefined ? undefined : Number(v)
        }; 
    }

    handleRowMeasureTypeDraftChange(event) {
        const id = event.currentTarget.dataset.rowId;
        if (!id) {
            return;
        }
        this.measureTypeDraftById = { ...this.measureTypeDraftById, [id]: event.detail.value };
    }

    async handleSaveRowComments(event) {
        const rowId = event.currentTarget.dataset.rowId;
        if (!rowId) {
            return;
        }
        const row = this.tableRows.find((r) => r.id === rowId);
        const pt = this.normalizeRowPointType(row?.pointType);
        if (pt !== 'Attention Required') {
            this.toast(
                'Set the row type to Attention Required before saving comments.',
                'error'
            );
            return;
        }
        const text =
            this.commentDraftById[rowId] !== undefined
                ? this.commentDraftById[rowId]
                : (row?.comments ?? '');
        this.rowFieldSavingId = rowId;
        try {
            // LDS updateRecord queues offline (Field Service mobile); Apex does not run offline.
            await updateRecord({
                fields: {
                    Id: rowId,
                    Comments__c: text
                }
            });
            const next = { ...this.commentDraftById };
            delete next[rowId];
            this.commentDraftById = next;
            try {
                await refreshApex(this.wiredContextResult);
            } catch {
                /* offline: wire may not refresh until sync */
            }
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
            this.toast(
                offline
                    ? 'Comments saved on device. They will sync when you are back online.'
                    : 'Comments saved.',
                'success'
            );
        } catch (e) {
            const msg =
                e?.body?.output?.errors?.[0]?.message ||
                e?.body?.message ||
                e?.message ||
                'Could not save comments.';
            this.toast(msg, 'error');
        } finally {
            this.rowFieldSavingId = undefined;
        }
    }

    async handleSaveRowMeasure(event) {
        const rowId = event.currentTarget.dataset.rowId;
        if (!rowId) {
            return;
        }
        const row = this.tableRows.find((r) => r.id === rowId);
        const mv =
            this.measureValueDraftById[rowId] !== undefined
                ? this.measureValueDraftById[rowId]
                : row?.measureValue;
        const mt =
            this.measureTypeDraftById[rowId] !== undefined
                ? this.measureTypeDraftById[rowId]
                : row?.measureType;

        if (mv === undefined || mv === null || Number.isNaN(Number(mv))) {
            this.toast('Enter a measure value.', 'error');
            return;
        }
        if (!mt) {
            this.toast('Select a measure value type.', 'error');
            return;
        }

        this.rowFieldSavingId = rowId;
        try {
            await updateMeasurePointMeasureValues({
                measurePointId: rowId,
                measureValue: Number(mv),
                measureValueType: mt
            });
            const nextV = { ...this.measureValueDraftById };
            const nextT = { ...this.measureTypeDraftById };
            delete nextV[rowId];
            delete nextT[rowId];
            this.measureValueDraftById = nextV;
            this.measureTypeDraftById = nextT;
            await refreshApex(this.wiredContextResult);
            this.toast('Measure saved.', 'success');
        } catch (e) {
            const msg =
                e?.body?.message || e?.message || 'Could not save measure values.';
            this.toast(msg, 'error');
        } finally {
            this.rowFieldSavingId = undefined;
        }
    }

    async handleRowTypeButtonClick(event) {
        const rowId = event.currentTarget.dataset.rowId;
        const newType = event.currentTarget.dataset.value;
        if (!rowId || !newType) {
            return;
        }

        this.rowTypeUpdatingId = rowId;
        try {
            await updateMeasurePointType({ measurePointId: rowId, measureType: newType });
            const nc = { ...this.commentDraftById };
            const nv = { ...this.measureValueDraftById };
            const nt = { ...this.measureTypeDraftById };
            delete nc[rowId];
            delete nv[rowId];
            delete nt[rowId];
            this.commentDraftById = nc;
            this.measureValueDraftById = nv;
            this.measureTypeDraftById = nt;
            await refreshApex(this.wiredContextResult);
            this.toast('Measure type updated.', 'success');
        } catch (e) {
            const msg =
                e?.body?.message || e?.message || 'Could not update measure type.';
            this.toast(msg, 'error');
            await refreshApex(this.wiredContextResult);
        } finally {
            this.rowTypeUpdatingId = undefined;
        }
    }

    async handleMarkSelectedOk() {
        if (!this.selectedRowIds.length) {
            return;
        }
        this.bulkMarkingOk = true;
        try {
            await markMeasurePointsOk({ measurePointIds: this.selectedRowIds });
            await refreshApex(this.wiredContextResult);
            this.selectedRowIds = [];
            this.toast('Selected rows marked as OK.', 'success');
        } catch (e) {
            const msg =
                e?.body?.message || e?.message || 'Could not update selected rows.';
            this.toast(msg, 'error');
        } finally {
            this.bulkMarkingOk = false;
        }
    }

    get measureValueTypeOptions() {
        return MEASURE_VALUE_TYPES;
    }

    get isMeasureMode() {
        return this.pointType === 'Measure';
    }

    get hasEntryTypeSelected() {
        return (
            this.pointType === 'OK' ||
            this.pointType === 'Attention Required' ||
            this.pointType === 'Measure'
        );
    }

    get hasInstructionImages() {
        return Array.isArray(this.instructionImages) && this.instructionImages.length > 0;
    }

    get instructionPanelSubtitle() {
        const n = this.instructionImages?.length || 0;
        if (n === 0) {
            return 'Work order images';
        }
        return 'Work Order PDS Instructions';
       // return n === 1 ? '1 PNG on Work Order' : `${n} PNGs on Work Order (A→Z by file name)`;
    }

    get showUploader() {
        return !!this.photoTargetId;
    }

    get photoPanelTitle() {
        const id = this.photoTargetId;
        if (!id) {
            return 'Attach photos';
        }
        const mps = this.context?.measurePoints;
        if (!Array.isArray(mps) || mps.length === 0) {
            return 'Photos for latest saved entry';
        }
        const onList = mps.some((mp) => mp.id === id);
        return onList ? 'Photos for this measure point' : 'Photos for latest saved entry';
    }

    async handleRefresh() {
        if (!this.wiredContextResult) {
            return;
        }
        this.refreshing = true;
        try {
            await refreshApex(this.wiredContextResult);
            if (this.wiredWoImagesResult) {
                await refreshApex(this.wiredWoImagesResult);
            }
            this.toast('Checklist refreshed.', 'success');
        } catch (e) {
            const msg =
                e?.body?.message || e?.message || 'Could not refresh.';
            this.toast(msg, 'error');
        } finally {
            this.refreshing = false;
        }
    }

    handleRowPhotosClick(event) {
        let rowId = event.currentTarget?.dataset?.rowId;
        if (!rowId && typeof event.composedPath === 'function') {
            for (const el of event.composedPath()) {
                if (el && el.dataset && el.dataset.rowId) {
                    rowId = el.dataset.rowId;
                    break;
                }
            }
        }
        if (!rowId) {
            return;
        }
        this.photoTargetId = rowId;
        // Two rAFs: wait until the photo card is in the DOM after render.
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                this.template
                    .querySelector('.photo-card')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            });
        });
    }

    handleAddEntryTypeClick(event) {
        const v = event.currentTarget.dataset.value;
        if (!v) {
            return;
        }
        this.pointType = v;
        if (!this.isMeasureMode) {
            this.measureValue = undefined;
            this.measureType = '';
        }
    }

    handleComponentInput(event) {
        this.selectedComponent = event.target.value;
    }

    handleCommentsChange(event) {
        this.comments = event.target.value;
    }

    handleMeasureValueChange(event) {
        const v = event.detail.value;
        this.measureValue = v === '' || v === undefined ? undefined : Number(v);
    }

    handleMeasureValueTypeChange(event) {
        this.measureType = event.detail.value;
    }

    async handleSaveEntry() {
        if (!this.selectedComponent || !this.selectedComponent.trim()) {
            this.toast('Enter a component name.', 'error');
            return;
        }
        if (!this.hasEntryTypeSelected) {
            this.toast('Select an entry type: OK, Attention, or Measure.', 'error');
            return;
        }
        if (this.isMeasureMode) {
            if (this.measureValue === undefined || this.measureValue === null) {
                this.toast('Enter a measure value.', 'error');
                return;
            }
            if (!this.measureType) {
                this.toast('Select a measure value type.', 'error');
                return;
            }
        }

        this.saving = true;
        try {
            const id = await saveMeasurePoint({
                workStepId: this.recordId,
                componentName: this.selectedComponent.trim(),
                pointType: this.pointType,
                comments: this.comments,
                measureValue: this.isMeasureMode ? this.measureValue : null,
                measureValueType: this.isMeasureMode ? this.measureType : null
            });
            this.photoTargetId = id;
            this.toast('Entry saved. Add photos below if needed.', 'success');
            await refreshApex(this.wiredContextResult);
            this.resetEntryForm(false);
        } catch (e) {
            const msg =
                e?.body?.message || e?.message || 'Could not save this entry.';
            this.toast(msg, 'error');
        } finally {
            this.saving = false;
        }
    }

    resetEntryForm(clearPhotos) {
        this.pointType = '';
        this.selectedComponent = '';
        this.comments = '';
        this.measureValue = undefined;
        this.measureType = '';
        if (clearPhotos) {
            this.photoTargetId = undefined;
        }
    }

    handleDonePhotos() {
        this.photoTargetId = undefined;
        this.toast('Photo panel closed.', 'info');
    }

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const s = reader.result;
                if (typeof s !== 'string') {
                    reject(new Error('Could not read file.'));
                    return;
                }
                const comma = s.indexOf(',');
                resolve(comma >= 0 ? s.substring(comma + 1) : s);
            };
            reader.onerror = () => reject(reader.error || new Error('Could not read file.'));
            reader.readAsDataURL(file);
        });
    }

    async handlePhotoFilesChange(event) {
        const input = event.target;
        const files = input?.files;
        if (!files?.length || !this.photoTargetId) {
            return;
        }

        this.photoUploading = true;
        let saved = 0;
        try {
            for (const file of Array.from(files)) {
                const base64VersionData = await this.readFileAsBase64(file);
                await attachFileToMeasurePoint({
                    measurePointId: this.photoTargetId,
                    fileName: file.name,
                    base64VersionData
                });
                saved += 1;
            }
            await refreshApex(this.wiredContextResult);
            this.toast(
                saved === 1 ? '1 file saved on the measure point.' : `${saved} files saved on the measure point.`,
                'success'
            );
        } catch (e) {
            const msg =
                e?.body?.message || e?.message || 'Could not save file(s).';
            this.toast(msg, 'error');
        } finally {
            this.photoUploading = false;
            if (input) {
                input.value = '';
            }
        }
    }

    /**
     * Close the screen-action / global-action panel without importing `lightning/actions`.
     * That import makes LWR (Field Service mobile) request @salesforce/action/<QuickActionApiName>
     * (e.g. Inspection_Checklist), which 404s if the action metadata does not match the bundle.
     * Event name matches CloseActionScreenEvent (see salesforce/lwc#2722).
     */
    closeActionPanel() {
        this.dispatchEvent(
            new CustomEvent('lightning__actionsclosescreen', {
                bubbles: true,
                composed: true
            })
        );
    }

    handlePartiallyComplete() {
        this.closeActionPanel();
    }

    handleCompleted() {
        this.closeActionPanel();
    }

    toast(message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title:
                    variant === 'error'
                        ? 'Something went wrong'
                        : variant === 'success'
                          ? 'Saved'
                          : 'Notice',
                message,
                variant: variant === 'success' ? 'success' : variant === 'error' ? 'error' : 'info',
                mode: 'dismissable'
            })
        );
    }
}