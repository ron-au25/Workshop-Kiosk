import { LightningElement, api, track } from 'lwc';
import WAGON_DIAGRAM from '@salesforce/resourceUrl/WagonDiagramTop';
import getWagonAsset from '@salesforce/apex/KioskController.getWagonAsset';
import getMeasurePointsByAsset from '@salesforce/apex/KioskController.getMeasurePointsByAsset';
import getMeasurePoints from '@salesforce/apex/KioskController.getMeasurePoints';
import getMeasureImages from '@salesforce/apex/KioskController.getMeasureImages';
import uploadMeasureImage from '@salesforce/apex/KioskController.uploadMeasureImage';
import saveMeasurePoint from '@salesforce/apex/KioskController.saveMeasurePoint';
import getAssetTasks from '@salesforce/apex/KioskController.getAssetTasks';
import createAssetTask from '@salesforce/apex/KioskController.createAssetTask';
import updateAssetTask from '@salesforce/apex/KioskController.updateAssetTask';
import updateAssetSerial from '@salesforce/apex/KioskController.updateAssetSerial';

const MEASURE_TYPES = ['Attention Required', 'Measure', 'OK', 'Scrap'];
const VALUE_TYPES = ['Depth', 'Temperature', 'Pressure', 'Level', 'Width', 'Length'];
const DEFECT_LOCATIONS = [
    'Lower Lug', 'Ribs', 'Palm', 'Upper Pulling Lug', 'Lower Pulling Lug',
    'Uper Knuckle Pin Hole', 'Lower Knuckle Pin Hole', 'Back Radius',
];

// Percentage-positioned overlay zones across the wagon diagram (left%, width%).
// Four wheelsets L1..L4 spread across the top-view wagons. Tunable to the art.
const ZONE_LAYOUT = [
    { left: 6, width: 18 },
    { left: 30, width: 18 },
    { left: 55, width: 18 },
    { left: 76, width: 18 },
];

// Cause / Delay / Priority picklists (values match the org + workOrderDetail.js exactly)
const CAUSE_OPTIONS = [
    { value: '', label: '— Select —' },
    { value: '0001, Accidental Damage', label: '0001 – Accidental Damage' },
    { value: '0003, Inadequate design', label: '0003 – Inadequate Design' },
    { value: '0004, Fire Damage', label: '0004 – Fire Damage' },
    { value: '0007, lubrication', label: '0007 – Lubrication' },
    { value: '0008, maint inadequate', label: '0008 – Maint Inadequate' },
    { value: '0009, Improper Operation', label: '0009 – Improper Operation' },
    { value: '0010, Wear and Tear', label: '0010 – Wear and Tear' },
    { value: '1002, Incorrect Adjustment', label: '1002 – Incorrect Adjustment' },
    { value: '1015, Blocked', label: '1015 – Blocked' },
    { value: '1049, Charge, End Of Battery Life', label: '1049 – End Of Battery Life' },
    { value: '1148, Environment, Conditions', label: '1148 – Environment/Conditions' },
    { value: '1350, vibration', label: '1350 – Vibration' },
    { value: '9997, No fault found', label: '9997 – No Fault Found' },
    { value: '9998, not known', label: '9998 – Not Known' },
    { value: '9999, not suitable code', label: '9999 – Not Suitable Code' },
];
const DELAY_OPTIONS = [
    { value: '', label: '— Select —' },
    { value: '1, Plant not in agreed condition', label: '1 – Plant Not In Agreed Condition' },
    { value: '2, Permit Not Available', label: '2 – Permit Not Available' },
    { value: '3, Insufficient Capacity Available', label: '3 – Insufficient Capacity Available' },
    { value: '4, Materials Not Available', label: '4 – Materials Not Available' },
    { value: '5, Correct Tooling Unavailable', label: '5 – Correct Tooling Unavailable' },
    { value: '6, External Labour Not Available', label: '6 – External Labour Not Available' },
    { value: '7, Cranage Unavailable', label: '7 – Cranage Unavailable' },
    { value: '8, Access Staging / Equipment Unavailable', label: '8 – Access/Staging Unavailable' },
    { value: '9, Task Conflicts', label: '9 – Task Conflicts' },
    { value: '10, Work Took Longer than Planned', label: '10 – Work Took Longer Than Planned' },
    { value: '11, Unscheduled Work', label: '11 – Unscheduled Work' },
    { value: '12, Inclement Weather', label: '12 – Inclement Weather' },
    { value: '13, Higher priority work took Preference', label: '13 – Higher Priority Preference' },
    { value: '14, Services not Available', label: '14 – Services Not Available' },
    { value: '16, Work Cancelled', label: '16 – Work Cancelled' },
];
const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'];
const TASK_STATUS_OPTIONS = ['New', 'Assigned', 'In Progress', 'Partially Completed', 'Completed', 'Closed'];

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

    wagonDiagramUrl = WAGON_DIAGRAM;

    @track wagon = null;
    @track wheelsets = [];
    @track allPoints = [];          // every measure point across the wagon (for charts)
    @track isLoading = true;
    @track hasError = false;

    @track selectedWheelsetId = null;
    @track wheelsetPoints = [];     // measure points for the selected wheelset
    @track measureImages = {};      // measurePointId -> base64 data URI (lazy-loaded)
    @track pendingImagePreview = null;   // data URI preview of an image staged in the form
    _pendingImageBase64 = null;          // raw base64 to upload on save
    _pendingImageName = null;
    @track tasks = [];
    @track loadingDetail = false;

    // Collapsible sections
    @track overviewExpanded = true;
    @track detailExpanded = true;
    @track diagramExpanded = true;   // collapses to just the L1–L4 indicator strip
    @track chartsExpanded = true;

    // Serial edit
    @track serialDraft = '';
    @track savingSerial = false;

    // Measure form
    @track showMeasureForm = false;
    @track isSavingMeasure = false;
    @track measureFeedback = '';
    @track measureFeedbackIsError = false;
    @track editId = null;
    @track editComponentName = '';
    @track editMeasureType = 'OK';
    @track editComments = '';
    @track editReviewNotes = '';
    @track editMeasureValue = '';
    @track editMeasureValueType = 'Depth';
    @track editDefectLocation = '';

    // Task form (create + edit)
    @track showTaskForm = false;
    @track isSavingTask = false;
    @track taskFeedback = '';
    @track taskFeedbackIsError = false;
    @track taskEditId = null;        // null = create, else update
    @track taskSubject = '';
    @track taskDescription = '';
    @track taskCauseCodes = '';
    @track taskDelayCodes = '';
    @track taskStartDate = '';
    @track taskComponent = '';
    @track taskDurationHours = '';
    @track taskPriority = 'Medium';
    @track taskStatus = 'New';
    @track taskComments = '';

    connectedCallback() {
        this.loadWagon();
    }

    async loadWagon() {
        this.isLoading = true;
        this.hasError = false;
        try {
            const [wagon, points] = await Promise.all([
                getWagonAsset({ token: this.sessionToken, workOrderId: this.workOrderId }),
                getMeasurePoints({ token: this.sessionToken, workOrderId: this.workOrderId }),
            ]);
            this.wagon = wagon;
            this.wheelsets = wagon.wheelsets || [];
            this.allPoints = points || [];
        } catch (e) {
            this.hasError = true;
        } finally {
            this.isLoading = false;
        }
    }

    handleBack() {
        this.dispatchEvent(new CustomEvent('back'));
    }

    handleInputKeydown(evt) {
        evt.stopPropagation();
    }

    // ─── Wheelset selection ──────────────────────────────────────────────────
    async handleSelectWheelset(evt) {
        const id = evt.currentTarget.dataset.id;
        if (!id) return;
        const firstSelection = !this.selectedWheelsetId;
        this.selectedWheelsetId = id;
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
        const ws = this.wheelsets.find(w => w.id === id);
        this.serialDraft = ws ? (ws.serialNumber || '') : '';
        await this.loadDetail(id);
    }

    async loadDetail(assetId) {
        this.loadingDetail = true;
        try {
            const [points, tasks] = await Promise.all([
                getMeasurePointsByAsset({ token: this.sessionToken, assetId }),
                getAssetTasks({ token: this.sessionToken, assetId }),
            ]);
            this.wheelsetPoints = points || [];
            this.tasks = tasks || [];
            this._loadMeasureImages();
        } catch (e) {
            this.wheelsetPoints = [];
            this.tasks = [];
        } finally {
            this.loadingDetail = false;
        }
    }

    // Fetch attached images (as data URIs) for the current points and merge into the map.
    async _loadMeasureImages() {
        const ids = (this.wheelsetPoints || []).map(p => p.id).filter(Boolean);
        if (!ids.length) return;
        try {
            const imgs = await getMeasureImages({ token: this.sessionToken, measurePointIds: ids });
            if (imgs && imgs.length) {
                const map = { ...this.measureImages };
                imgs.forEach(img => { map[img.measurePointId] = img.dataUri; });
                this.measureImages = map;
            }
        } catch (e) {
            // images are non-critical — ignore failures
        }
    }

    handleToggleOverview() { this.overviewExpanded = !this.overviewExpanded; }
    handleToggleDetail() { this.detailExpanded = !this.detailExpanded; }
    handleToggleDiagram() { this.diagramExpanded = !this.diagramExpanded; }
    handleToggleCharts() { this.chartsExpanded = !this.chartsExpanded; }

    // ─── Serial edit ─────────────────────────────────────────────────────────
    handleSerialChange(evt) { this.serialDraft = evt.target.value; }

    async handleSaveSerial() {
        if (!this.selectedWheelsetId) return;
        this.savingSerial = true;
        try {
            await updateAssetSerial({
                token: this.sessionToken,
                assetId: this.selectedWheelsetId,
                serialNumber: this.serialDraft,
            });
            // Reflect locally
            this.wheelsets = this.wheelsets.map(w =>
                w.id === this.selectedWheelsetId ? { ...w, serialNumber: this.serialDraft } : w
            );
        } catch (e) {
            // silent — surfaced via feedback span if desired
        } finally {
            this.savingSerial = false;
        }
    }

    // ─── Measure form ────────────────────────────────────────────────────────
    handleAddMeasure() {
        this.editId = null;
        this.editComponentName = '';
        this.editMeasureType = 'OK';
        this.editComments = '';
        this.editReviewNotes = '';
        this.editMeasureValue = '';
        this.editMeasureValueType = 'Depth';
        this.editDefectLocation = '';
        this.measureFeedback = '';
        this._clearPendingImage();
        this.showMeasureForm = true;
    }

    handleEditMeasure(evt) {
        const id = evt.currentTarget.dataset.pointId;
        const p = this.wheelsetPoints.find(x => x.id === id);
        if (!p) return;
        this.editId = p.id;
        this.editComponentName = p.componentName || '';
        this.editMeasureType = p.measureType || 'OK';
        this.editComments = p.comments || '';
        this.editReviewNotes = p.reviewNotes || '';
        this.editMeasureValue = p.measureValue != null ? String(p.measureValue) : '';
        this.editMeasureValueType = p.measureValueType || 'Depth';
        this.editDefectLocation = p.defectLocation || '';
        this.measureFeedback = '';
        this._clearPendingImage();
        this.showMeasureForm = true;
    }

    _clearPendingImage() {
        this.pendingImagePreview = null;
        this._pendingImageBase64 = null;
        this._pendingImageName = null;
    }

    // Camera/file selection: read the chosen image to base64 and stage a preview.
    handleImageSelect(evt) {
        const file = evt.target.files && evt.target.files[0];
        if (!file) return;
        if (!file.type || file.type.indexOf('image/') !== 0) {
            this._measureFb('Please choose an image file.', true);
            return;
        }
        const MAX = 5 * 1024 * 1024; // 5MB guard
        if (file.size > MAX) {
            this._measureFb('Image is too large (max 5MB).', true);
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result || '';
            const comma = result.indexOf(',');
            this._pendingImageBase64 = comma >= 0 ? result.substring(comma + 1) : result;
            this._pendingImageName = file.name || 'measure-image.jpg';
            this.pendingImagePreview = result;   // full data URI for the preview
        };
        reader.onerror = () => this._measureFb('Could not read the image.', true);
        reader.readAsDataURL(file);
    }

    handleRemovePendingImage() {
        this._clearPendingImage();
        const input = this.template.querySelector('[data-id="measureImageInput"]');
        if (input) input.value = '';
    }

    async handleMarkOk(evt) {
        const id = evt.currentTarget.dataset.pointId;
        const p = this.wheelsetPoints.find(x => x.id === id);
        if (!p) return;
        try {
            const req = {
                id: p.id,
                componentName: p.componentName,
                measureType: 'OK',
                comments: p.comments,
                reviewNotes: p.reviewNotes,
                measureValue: null,
                measureValueType: null,
                defectLocation: p.defectLocation || null,
                workOrderId: this.workOrderId,
                assetId: this.selectedWheelsetId,
            };
            const saved = await saveMeasurePoint({ token: this.sessionToken, reqJson: JSON.stringify(req) });
            this.wheelsetPoints = this.wheelsetPoints.map(x => x.id === saved.id ? saved : x);
            this.allPoints = this.allPoints.map(x => x.id === saved.id ? saved : x);
            this._recomputeWheelsetStatus();
        } catch (e) {
            this._measureFb('Could not mark OK. Try again.', true);
        }
    }

    handleComponentNameChange(evt) { this.editComponentName = evt.target.value; }
    handleMeasureTypeSelect(evt) { this.editMeasureType = evt.currentTarget.dataset.type; }
    handleMeasureValueChange(evt) { this.editMeasureValue = evt.target.value; }
    handleMeasureValueTypeChange(evt) { this.editMeasureValueType = evt.target.value; }
    handleDefectLocationChange(evt) { this.editDefectLocation = evt.target.value; }
    handleCommentsChange(evt) { this.editComments = evt.target.value; }
    handleReviewNotesChange(evt) { this.editReviewNotes = evt.target.value; }
    handleMeasureCancel() { this.showMeasureForm = false; this.measureFeedback = ''; }

    async handleMeasureSave() {
        if (!this.editComponentName.trim()) {
            this._measureFb('Component Name is required.', true);
            return;
        }
        this.isSavingMeasure = true;
        try {
            const isMeasure = this.editMeasureType === 'Measure';
            const req = {
                id: this.editId || null,
                componentName: this.editComponentName,
                measureType: this.editMeasureType,
                comments: this.editComments,
                reviewNotes: this.editReviewNotes,
                measureValue: isMeasure && this.editMeasureValue !== '' ? parseFloat(this.editMeasureValue) : null,
                measureValueType: isMeasure ? this.editMeasureValueType : null,
                defectLocation: this.editDefectLocation || null,
                workOrderId: this.workOrderId,
                assetId: this.selectedWheelsetId,
            };
            const saved = await saveMeasurePoint({ token: this.sessionToken, reqJson: JSON.stringify(req) });

            // Upload a staged image (camera/file) against the saved record's id.
            if (this._pendingImageBase64 && saved.id) {
                try {
                    const dataUri = await uploadMeasureImage({
                        token: this.sessionToken,
                        measurePointId: saved.id,
                        fileName: this._pendingImageName,
                        base64Data: this._pendingImageBase64,
                    });
                    this.measureImages = { ...this.measureImages, [saved.id]: dataUri };
                } catch (imgErr) {
                    this._measureFb('Measure saved, but image upload failed.', true);
                }
                this._clearPendingImage();
            }

            if (this.editId) {
                this.wheelsetPoints = this.wheelsetPoints.map(p => p.id === saved.id ? saved : p);
                this.allPoints = this.allPoints.map(p => p.id === saved.id ? saved : p);
            } else {
                this.wheelsetPoints = [saved, ...this.wheelsetPoints];
                this.allPoints = [saved, ...this.allPoints];
            }
            this._recomputeWheelsetStatus();
            this.showMeasureForm = false;
            this._measureFb('Saved.', false);
            this._loadMeasureImages();   // pick up a newly attached image, if any
        } catch (e) {
            const msg = e.body?.message || '';
            this._measureFb(msg.includes('SESSION_EXPIRED') ? 'Session expired. Sign in again.' : 'Save failed. Try again.', true);
        } finally {
            this.isSavingMeasure = false;
        }
    }

    _measureFb(msg, isError) {
        this.measureFeedback = msg;
        this.measureFeedbackIsError = !!isError;
        if (!isError) {
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => { this.measureFeedback = ''; }, 2500);
        }
    }

    // Recompute the selected wheelset's status dot from its current points.
    _recomputeWheelsetStatus() {
        const pts = this.wheelsetPoints;
        let status = 'grey';
        if (pts.some(p => p.measureType === 'Attention Required' || p.measureType === 'Scrap')) {
            status = 'red';
        } else if (pts.some(p => p.measureValue != null || p.measureType === 'Measure' || p.measureType === 'OK')) {
            // Green = a real measure recorded; empty checklist placeholders stay grey.
            status = 'green';
        }
        this.wheelsets = this.wheelsets.map(w =>
            w.id === this.selectedWheelsetId ? { ...w, iconStatus: status } : w
        );
    }

    // ─── Task form (create + edit) ───────────────────────────────────────────
    _resetTaskForm() {
        this.taskEditId = null;
        this.taskSubject = '';
        this.taskDescription = '';
        this.taskCauseCodes = '';
        this.taskDelayCodes = '';
        this.taskStartDate = '';
        this.taskComponent = this.wagon?.floc || '';   // default Component to wagon FLOC
        this.taskDurationHours = '';
        this.taskPriority = 'Medium';
        this.taskStatus = 'New';
        this.taskComments = '';
        this.taskFeedback = '';
    }

    handleAddTask() {
        this._resetTaskForm();
        this.showTaskForm = true;
    }

    handleEditTask(evt) {
        const id = evt.currentTarget.dataset.taskId;
        const t = this.tasks.find(x => x.id === id);
        if (!t) return;
        this.taskEditId = t.id;
        this.taskSubject = t.subject || '';
        this.taskDescription = t.description || '';
        this.taskCauseCodes = t.causeCodes || '';
        this.taskDelayCodes = t.workDelayCodes || '';
        // StartDate comes back as ISO; trim to yyyy-MM-ddThh:mm for datetime-local input
        this.taskStartDate = t.startDate ? this._toLocalInput(t.startDate) : '';
        this.taskComponent = t.component || '';
        this.taskDurationHours = t.durationHours != null ? String(t.durationHours) : '';
        this.taskPriority = t.priority || 'Medium';
        this.taskStatus = t.status || 'New';
        this.taskComments = t.comments || '';
        this.taskFeedback = '';
        this.showTaskForm = true;
        // LWC does not reliably reflect a bound `value` onto a <textarea>'s displayed text,
        // so push the preloaded Description/Comments into the DOM after the form renders.
        this._syncTaskTextareas = true;
    }

    renderedCallback() {
        if (this._syncTaskTextareas) {
            this._syncTaskTextareas = false;
            const desc = this.template.querySelector('[data-id="taskDescription"]');
            const comm = this.template.querySelector('[data-id="taskComments"]');
            if (desc) desc.value = this.taskDescription;
            if (comm) comm.value = this.taskComments;
        }
    }

    handleTaskSubjectChange(evt) { this.taskSubject = evt.target.value; }
    handleTaskDescriptionChange(evt) { this.taskDescription = evt.target.value; }
    handleTaskCauseChange(evt) { this.taskCauseCodes = evt.target.value; }
    handleTaskDelayChange(evt) { this.taskDelayCodes = evt.target.value; }
    handleTaskStartDateChange(evt) { this.taskStartDate = evt.target.value; }
    handleTaskComponentChange(evt) { this.taskComponent = evt.target.value; }
    handleTaskDurationChange(evt) { this.taskDurationHours = evt.target.value; }
    handleTaskPriorityChange(evt) { this.taskPriority = evt.target.value; }
    handleTaskStatusChange(evt) { this.taskStatus = evt.target.value; }
    handleTaskCommentsChange(evt) { this.taskComments = evt.target.value; }
    handleTaskCancel() { this.showTaskForm = false; this.taskFeedback = ''; }

    async handleTaskSave() {
        if (!this.taskSubject.trim()) {
            this._taskFb('Subject is required.', true);
            return;
        }
        this.isSavingTask = true;
        try {
            const req = {
                id: this.taskEditId || null,
                workOrderId: this.workOrderId,
                assetId: this.selectedWheelsetId,
                subject: this.taskSubject.trim(),
                description: this.taskDescription || null,
                causeCodes: this.taskCauseCodes || null,
                workDelayCodes: this.taskDelayCodes || null,
                startDate: this.taskStartDate ? new Date(this.taskStartDate).toISOString() : null,
                component: this.taskComponent || null,
                durationHours: this.taskDurationHours !== '' ? parseFloat(this.taskDurationHours) : null,
                priority: this.taskPriority || null,
                status: this.taskStatus || null,
                comments: this.taskComments || null,
            };
            const saved = this.taskEditId
                ? await updateAssetTask({ token: this.sessionToken, reqJson: JSON.stringify(req) })
                : await createAssetTask({ token: this.sessionToken, reqJson: JSON.stringify(req) });
            if (this.taskEditId) {
                this.tasks = this.tasks.map(t => t.id === saved.id ? saved : t);
                this._taskFb('Task updated.', false);
            } else {
                this.tasks = [saved, ...this.tasks];
                this._taskFb('PM02 task created.', false);
            }
            this.showTaskForm = false;
        } catch (e) {
            const msg = e.body?.message || '';
            this._taskFb(msg.includes('PM02_WORKTYPE_NOT_FOUND') ? 'PM02 work type missing in org.' : 'Save failed. Try again.', true);
        } finally {
            this.isSavingTask = false;
        }
    }

    // Convert an ISO datetime to the value a datetime-local input expects (yyyy-MM-ddThh:mm), in local time.
    _toLocalInput(iso) {
        try {
            const d = new Date(iso);
            const pad = (n) => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } catch (_) {
            return '';
        }
    }

    _taskFb(msg, isError) {
        this.taskFeedback = msg;
        this.taskFeedbackIsError = !!isError;
        if (!isError) {
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(() => { this.taskFeedback = ''; }, 2500);
        }
    }

    // ─── Derived: diagram zones ──────────────────────────────────────────────
    get diagramZones() {
        return this.wheelsets.map((w, i) => {
            const layout = ZONE_LAYOUT[i] || { left: 0, width: 0 };
            const selected = w.id === this.selectedWheelsetId;
            return {
                id: w.id,
                label: w.label,
                zoneStyle: `left:${layout.left}%;width:${layout.width}%;`,
                zoneClass: 'wagon-zone' + (selected ? ' selected' : ''),
                chipClass: 'indicator-chip' + (selected ? ' selected' : ''),
                dotClass: 'zone-dot status-' + (w.iconStatus || 'grey'),
            };
        });
    }

    // ─── Derived: SVG charts (one per value type present) ────────────────────
    get charts() {
        // Group measured points by value type, then by wheelset label.
        const measured = this.allPoints.filter(p => p.measureValue != null && p.measureValueType);
        if (!measured.length) return [];

        // Map assetId -> wheelset label (and a stable x ordering L1..L4)
        const labelByAsset = {};
        this.wheelsets.forEach(w => { labelByAsset[w.id] = w.label; });
        const xLabels = this.wheelsets.map(w => w.label);

        const byType = {};
        measured.forEach(p => {
            const t = p.measureValueType;
            const label = labelByAsset[p.assetId];
            if (!label) return; // point not on a wheelset of this wagon
            if (!byType[t]) byType[t] = {};
            if (!byType[t][label]) byType[t][label] = [];
            byType[t][label].push(p.measureValue);
        });

        return Object.keys(byType).sort().map((type, idx) => {
            // Average per wheelset label
            const series = xLabels.map(label => {
                const vals = byType[type][label] || [];
                const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
                return { label, value: avg };
            });
            return this._buildChart(type, series, idx);
        });
    }

    _buildChart(type, series, idx) {
        const present = series.filter(s => s.value != null);
        const values = present.map(s => s.value);
        let min = Math.min(...values);
        let max = Math.max(...values);
        if (min === max) { min -= 1; max += 1; }
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
                    cx: x, cy: y,
                    label: s.label,
                    valueText: this._fmtNum(s.value),
                    labelX: x, labelY: CHART_H - 12,
                    valueY: y - 10,
                });
                lineParts.push(`${x},${y}`);
            } else {
                dots.push({
                    key: `${type}-${s.label}`,
                    cx: x, cy: null, label: s.label,
                    labelX: x, labelY: CHART_H - 12,
                });
            }
        });

        // Y axis gridlines (3)
        const gridlines = [0, 0.5, 1].map((f, gi) => {
            const v = min + (max - min) * f;
            const y = yFor(v);
            return { key: `g-${type}-${gi}`, y, x1: PAD_L, x2: CHART_W - PAD_R, valText: this._fmtNum(v), labelY: y + 4 };
        });

        return {
            key: `chart-${idx}`,
            title: type,
            viewBox: `0 0 ${CHART_W} ${CHART_H}`,
            polyline: lineParts.join(' '),
            dots,
            gridlines,
            axisX1: PAD_L, axisX2: CHART_W - PAD_R, axisY: PAD_T + plotH,
            yAxisX: PAD_L,
        };
    }

    _fmtNum(v) {
        if (v == null) return '';
        return Math.round(v * 100) / 100;
    }

    // ─── Derived: enriched measure point cards ───────────────────────────────
    get enrichedPoints() {
        return this.wheelsetPoints.map(p => {
            let typeClass = 'ok';
            if (p.measureType === 'Attention Required') typeClass = 'attention';
            else if (p.measureType === 'Scrap') typeClass = 'scrap';
            else if (p.measureType === 'Measure') typeClass = 'measure';
            const imageUri = this.measureImages[p.id];
            return {
                ...p,
                typeClass,
                formattedDate: this._formatDate(p.updateDate || p.createdDate),
                showMeasure: p.measureValue != null,
                showDefect: !!p.defectLocation,
                showOkBtn: p.measureType !== 'OK',
                imageUri,
                hasImage: !!imageUri,
            };
        });
    }

    get enrichedTasks() {
        const statusMap = {
            'New': 'status-pill new', 'Open': 'status-pill new', 'Assigned': 'status-pill new',
            'In Progress': 'status-pill inprogress', 'Partially Completed': 'status-pill inprogress',
            'Completed': 'status-pill completed', 'Closed': 'status-pill completed',
        };
        return this.tasks.map(t => ({
            ...t,
            statusClass: statusMap[t.status] || 'status-pill new',
            durationDisplay: t.durationHours != null ? `${t.durationHours}h` : null,
        }));
    }

    get measureTypeOptions() {
        return MEASURE_TYPES.map(t => ({ value: t, label: t, isSelected: this.editMeasureType === t }));
    }
    get valueTypeOptions() {
        return VALUE_TYPES.map(t => ({ value: t, label: t, isSelected: this.editMeasureValueType === t }));
    }
    get defectLocationOptions() {
        return [{ value: '', label: '— Select —', isSelected: !this.editDefectLocation }]
            .concat(DEFECT_LOCATIONS.map(d => ({ value: d, label: d, isSelected: this.editDefectLocation === d })));
    }
    get showValueFields() { return this.editMeasureType === 'Measure'; }

    // ─── Task form option getters ─────────────────────────────────────────────
    get taskCauseOptions() {
        return CAUSE_OPTIONS.map(o => ({ ...o, selected: o.value === this.taskCauseCodes }));
    }
    get taskDelayOptions() {
        return DELAY_OPTIONS.map(o => ({ ...o, selected: o.value === this.taskDelayCodes }));
    }
    get taskPriorityOptions() {
        return PRIORITY_OPTIONS.map(p => ({ value: p, label: p, selected: p === this.taskPriority }));
    }
    get taskStatusOptions() {
        return TASK_STATUS_OPTIONS.map(s => ({ value: s, label: s, selected: s === this.taskStatus }));
    }
    get taskFormHeading() { return this.taskEditId ? 'Edit PM02 Task' : 'New PM02 Task'; }

    get selectedWheelset() {
        return this.wheelsets.find(w => w.id === this.selectedWheelsetId) || null;
    }
    get hasSelection() { return !!this.selectedWheelsetId; }
    get hasPoints() { return this.wheelsetPoints.length > 0; }
    get hasTasks() { return this.tasks.length > 0; }
    get hasCharts() { return this.charts.length > 0; }

    get overviewToggleIcon() { return this.overviewExpanded ? '▾' : '›'; }
    get detailToggleIcon() { return this.detailExpanded ? '▾' : '›'; }
    get diagramToggleIcon() { return this.diagramExpanded ? '▾' : '›'; }
    get chartsToggleIcon() { return this.chartsExpanded ? '▾' : '›'; }

    get measureSaveLabel() { return this.isSavingMeasure ? 'Saving…' : (this.editId ? 'Update Measure' : 'Add Measure'); }
    get taskSaveLabel() {
        if (this.isSavingTask) return 'Saving…';
        return this.taskEditId ? 'Update Task' : 'Create PM02 Task';
    }
    get serialSaveLabel() { return this.savingSerial ? 'Saving…' : 'Save'; }
    get measureFeedbackClass() { return this.measureFeedbackIsError ? 'form-feedback error' : 'form-feedback'; }
    get taskFeedbackClass() { return this.taskFeedbackIsError ? 'form-feedback error' : 'form-feedback'; }

    get wagonStatusPill() { return this.wagon?.status || ''; }
    get detailHeading() {
        const ws = this.selectedWheelset;
        return ws ? `Wheelset ${ws.label}` : '';
    }

    _formatDate(isoStr) {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            return d.toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
        } catch (_) {
            return isoStr;
        }
    }
}
