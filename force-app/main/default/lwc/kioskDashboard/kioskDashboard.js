import { LightningElement, api, track } from 'lwc';
import getDashboardMetrics from '@salesforce/apex/KioskController.getDashboardMetrics';
import generateDemoWorkpack from '@salesforce/apex/WorkpackDemoGenerator.generateDemoWorkpack';

const DONUT_COLORS = ['#E25822', '#2E8FE6', '#21C07A', '#F2B441', '#A855F7', '#E84B4B', '#14B8A6'];
const CIRCUMFERENCE = 2 * Math.PI * 70;
const AUTO_REFRESH_MS = 60000;

const DATE_PRESETS = [
    { label: 'Today',      value: 'today' },
    { label: 'This Week',  value: 'week' },
    { label: 'This Month', value: 'month' },
    { label: 'Custom',     value: 'custom' },
];

function toIso(d) {
    return d.toISOString().slice(0, 10);
}

function getPresetRange(preset) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (preset === 'today') {
        return { from: toIso(today), to: toIso(today) };
    }
    if (preset === 'week') {
        const mon = new Date(today);
        mon.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1));
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        return { from: toIso(mon), to: toIso(sun) };
    }
    if (preset === 'month') {
        const first = new Date(today.getFullYear(), today.getMonth(), 1);
        const last  = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        return { from: toIso(first), to: toIso(last) };
    }
    return { from: toIso(today), to: toIso(today) };
}

export default class KioskDashboard extends LightningElement {
    @api sessionToken;
    @api isSupervisor = false;

    @track metrics;
    @track isLoading = true;
    @track hasError = false;
    @track errorMessage = '';
    @track refreshing = false;

    @track selectedPreset = 'today';
    @track dateFrom = toIso(new Date());
    @track dateTo   = toIso(new Date());
    @track showCustomPicker = false;

    @track generatingDemo = false;
    @track demoFeedback = '';
    @track demoFeedbackIsError = false;

    _refreshInterval;

    connectedCallback() {
        const range = getPresetRange(this.selectedPreset);
        this.dateFrom = range.from;
        this.dateTo   = range.to;
        this.loadMetrics();
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._refreshInterval = setInterval(() => this.loadMetrics(), AUTO_REFRESH_MS);
    }

    disconnectedCallback() {
        if (this._refreshInterval) clearInterval(this._refreshInterval);
    }

    async loadMetrics() {
        if (!this.sessionToken) return;
        this.hasError = false;
        if (!this.metrics) this.isLoading = true;
        this.refreshing = true;
        try {
            const raw = await getDashboardMetrics({
                token: this.sessionToken,
                dateFrom: this.dateFrom,
                dateTo: this.dateTo,
            });
            if (raw.topCriticalJobs) {
                raw.topCriticalJobs = raw.topCriticalJobs.map(job => {
                    const parts = [job.woNumber, job.subject].filter(Boolean);
                    return {
                        ...job,
                        displayLabel: parts.length ? parts.join(' — ') : 'Untitled',
                        statusIcon: 'status-dot status-' + (job.status || 'new').toLowerCase().replace(/\s+/g, '-'),
                        statusTitle: job.status || 'New',
                    };
                });
            }
            this.metrics = raw;
        } catch (e) {
            this.hasError = true;
            this.errorMessage = e.body?.message?.includes('SESSION_EXPIRED')
                ? 'Your session has expired. Please sign in again.'
                : 'Failed to load dashboard. Check your connection.';
        } finally {
            this.isLoading = false;
            this.refreshing = false;
        }
    }

    handleRefresh() { this.loadMetrics(); }

    get genDemoLabel() { return this.generatingDemo ? 'Generating…' : 'Generate Demo Workpack'; }
    get genDemoIconClass() { return 'gen-demo-icon' + (this.generatingDemo ? ' spinning' : ''); }
    get demoFeedbackClass() { return 'demo-feedback' + (this.demoFeedbackIsError ? ' error' : ' success'); }

    async handleGenerateDemo() {
        if (this.generatingDemo) return;
        this.generatingDemo = true;
        this.demoFeedback = '';
        try {
            const woId = await generateDemoWorkpack({ token: this.sessionToken });
            this.demoFeedback = 'Demo workpack created. Opening…';
            this.demoFeedbackIsError = false;
            // Navigate straight into the new workpack (portal listens for opendetail).
            this.dispatchEvent(new CustomEvent('opendetail', {
                detail: { workOrderId: woId },
                bubbles: true,
                composed: true,
            }));
        } catch (e) {
            const msg = e.body?.message || '';
            this.demoFeedback = msg.includes('SESSION_EXPIRED')
                ? 'Session expired. Please sign in again.'
                : 'Could not generate demo workpack. Try again.';
            this.demoFeedbackIsError = true;
        } finally {
            this.generatingDemo = false;
        }
    }

    handleInputKeydown(evt) { evt.stopPropagation(); }

    handlePresetSelect(evt) {
        const preset = evt.currentTarget.dataset.preset;
        this.selectedPreset = preset;
        this.showCustomPicker = preset === 'custom';
        if (preset !== 'custom') {
            const range = getPresetRange(preset);
            this.dateFrom = range.from;
            this.dateTo   = range.to;
            this.loadMetrics();
        }
    }

    handleDateFromChange(evt) {
        evt.stopPropagation();
        this.dateFrom = evt.target.value;
        if (this.dateFrom > this.dateTo) this.dateTo = this.dateFrom;
        this.loadMetrics();
    }

    handleDateToChange(evt) {
        evt.stopPropagation();
        this.dateTo = evt.target.value;
        if (this.dateTo < this.dateFrom) this.dateFrom = this.dateTo;
        this.loadMetrics();
    }

    get refreshIconClass() { return 'refresh-icon' + (this.refreshing ? ' spinning' : ''); }

    get datePresets() {
        return DATE_PRESETS.map(p => ({
            ...p,
            cls: 'preset-btn' + (this.selectedPreset === p.value ? ' active' : ''),
        }));
    }

    get plannedHoursDisplay() {
        if (!this.metrics) return '0';
        return (this.metrics.totalDurationMinutes / 60).toFixed(1);
    }

    get actualHoursDisplay() {
        if (!this.metrics) return '0';
        return (this.metrics.totalActualMinutes / 60).toFixed(1);
    }

    get hoursVarianceDisplay() {
        if (!this.metrics) return '';
        const planned = this.metrics.totalDurationMinutes || 0;
        const actual  = this.metrics.totalActualMinutes  || 0;
        if (planned === 0) return '';
        const pct = Math.round(((actual - planned) / planned) * 100);
        return pct >= 0 ? `+${pct}%` : `${pct}%`;
    }

    get hoursVarianceClass() {
        if (!this.metrics) return 'variance neutral';
        const planned = this.metrics.totalDurationMinutes || 0;
        const actual  = this.metrics.totalActualMinutes  || 0;
        if (planned === 0) return 'variance neutral';
        const pct = ((actual - planned) / planned) * 100;
        if (pct > 20) return 'variance over';
        if (pct < -20) return 'variance under';
        return 'variance neutral';
    }

    get totalWorkOrders() {
        if (!this.metrics?.workTypeBreakdown) return 0;
        return this.metrics.workTypeBreakdown.reduce((s, w) => s + w.count, 0);
    }

    get hasWorkTypes() {
        return this.metrics?.workTypeBreakdown?.length > 0;
    }

    get hasCriticalJobs() {
        return this.metrics?.topCriticalJobs?.length > 0;
    }

    get donutSegments() {
        if (!this.metrics?.workTypeBreakdown) return [];
        const total = this.totalWorkOrders;
        if (total === 0) return [];

        let cumulativeOffset = 0;
        return this.metrics.workTypeBreakdown.map((slice, i) => {
            const pct = slice.count / total;
            const dash = `${pct * CIRCUMFERENCE} ${(1 - pct) * CIRCUMFERENCE}`;
            const offset = -cumulativeOffset * CIRCUMFERENCE;
            cumulativeOffset += pct;
            const color = DONUT_COLORS[i % DONUT_COLORS.length];
            return {
                key: slice.label,
                label: slice.label,
                count: slice.count,
                dash,
                offset,
                color,
                dotStyle: `background:${color}`,
            };
        });
    }
}
