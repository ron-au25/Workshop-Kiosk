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
    // Use LOCAL date parts — toISOString() converts to UTC, which rolls the date
    // back a day in AU timezones (made "Today" show yesterday's work).
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
            this._buildJobsChart();
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

    // ---- Jobs-per-day bar chart (precomputed in _buildJobsChart) ----------

    @track jpdViewBox = '0 0 640 200';
    @track jpdBars = [];

    get hasJobsPerDay() {
        return this.jpdBars && this.jpdBars.length > 0;
    }

    // Build SVG bar geometry once per data load (not in a getter — avoids
    // recomputing/throwing on every re-render, which froze the filter buttons).
    _buildJobsChart() {
        const data = (this.metrics && this.metrics.jobsPerDay) || [];
        const W = 640, H = 200, PAD_T = 16, PAD_B = 34, PAD_X = 12;
        const n = data.length;
        this.jpdViewBox = `0 0 ${W} ${H}`;
        if (n === 0) { this.jpdBars = []; return; }

        let maxCount = 1;
        for (let i = 0; i < n; i++) { if (data[i].count > maxCount) maxCount = data[i].count; }
        const plotH = H - PAD_T - PAD_B;
        const slot = (W - PAD_X * 2) / n;
        const barW = Math.max(2, Math.min(slot * 0.7, 48));
        const labelEvery = n <= 10 ? 1 : Math.ceil(n / 10);

        this.jpdBars = data.map((d, i) => {
            const c = d.count || 0;
            const h = (c / maxCount) * plotH;
            const x = PAD_X + i * slot + (slot - barW) / 2;
            const y = PAD_T + (plotH - h);
            const showLabel = (i % labelEvery === 0) || (i === n - 1);
            return {
                key: d.day,
                x, y, w: barW, h: Math.max(c > 0 ? 2 : 0, h),
                cx: x + barW / 2,
                countY: y - 5,
                count: c,
                showCount: c > 0,
                axisLabel: showLabel ? this._shortDay(d.day) : '',
                labelY: H - 12,
            };
        });
    }

    _shortDay(iso) {
        // iso = yyyy-MM-dd -> "23 Jun" (local, label only)
        const parts = (iso || '').split('-');
        if (parts.length !== 3) return iso;
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
    }
}
