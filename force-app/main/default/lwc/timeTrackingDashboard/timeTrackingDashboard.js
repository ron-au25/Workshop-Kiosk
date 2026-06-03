import { LightningElement, api, track } from 'lwc';
import getTimeReportDashboard from '@salesforce/apex/KioskController.getTimeReportDashboard';

const CHART_W = 560;
const CHART_H = 200;
const BAR_GAP = 6;
const PALETTE = [
    '#E25822','#2E8FE6','#21C07A','#F2B441','#A855F7','#EC4899','#14B8A6','#F97316',
    '#6366F1','#84CC16','#EF4444','#06B6D4',
];

const FLAG_OPTIONS = [
    { value: 'all',      label: 'All records' },
    { value: 'issues',   label: 'All issues' },
    { value: 'SHORT',    label: 'Short (< 10 min)' },
    { value: 'LONG',     label: 'Long (> 6 hours)' },
    { value: 'VARIANCE', label: 'Duration variance > 50%' },
    { value: 'ACTIVE',   label: 'Currently active (no clock-out)' },
];

function fmtMins(m) {
    if (m == null) return '—';
    const h = Math.floor(m / 60), mm = m % 60;
    return h > 0 ? `${h}h ${mm}m` : `${m}m`;
}
function fmtDt(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
}
function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short' });
}

export default class TimeTrackingDashboard extends LightningElement {
    @api sessionToken;

    @track data = null;
    @track isLoading = true;
    @track hasError = false;
    @track flagFilter = 'all';
    @track empFilter = '';

    connectedCallback() { this.load(); }

    async load() {
        this.isLoading = true;
        this.hasError = false;
        try {
            this.data = await getTimeReportDashboard({ token: this.sessionToken });
        } catch (e) {
            this.hasError = true;
        } finally {
            this.isLoading = false;
        }
    }

    handleFlagFilter(evt) { this.flagFilter = evt.currentTarget.dataset.flag; }
    handleEmpFilter(evt) { this.empFilter = evt.target.value; }

    // ─── Summary getters ─────────────────────────────────────────────────────

    get totalRecords() { return this.data?.totalRecords ?? 0; }
    get totalHours() {
        if (!this.data) return '—';
        const m = this.data.totalMinutes || 0;
        return `${Math.floor(m / 60)}h ${m % 60}m`;
    }
    get activeCount() { return this.data?.activeCount ?? 0; }
    get issueCount() {
        if (!this.data?.rows) return 0;
        return this.data.rows.filter(r => r.validationFlag || r.isActive).length;
    }

    // ─── Per-employee bar chart ───────────────────────────────────────────────

    get empBarChart() {
        const emps = this.data?.byEmployee;
        if (!emps || emps.length === 0) return null;
        const maxMin = Math.max(...emps.map(e => e.minutes), 1);
        const barW = Math.max(20, Math.floor((CHART_W - BAR_GAP * (emps.length + 1)) / emps.length));
        const bars = emps.map((e, i) => {
            const barH = Math.round((e.minutes / maxMin) * (CHART_H - 30));
            const x = BAR_GAP + i * (barW + BAR_GAP);
            const y = CHART_H - 20 - barH;
            const color = PALETTE[i % PALETTE.length];
            return {
                key: e.name + i,
                x, y, w: barW, h: barH,
                fillStyle: `fill:${color}`,
                label: e.name.split(' ')[0],
                minutes: fmtMins(e.minutes),
                count: e.count,
                labelX: x + barW / 2,
                labelY: CHART_H - 4,
                valueY: y - 4,
            };
        });
        return { bars, width: CHART_W, height: CHART_H };
    }

    // ─── Stacked-by-day chart ─────────────────────────────────────────────────

    get stackedChart() {
        const days = this.data?.byDay;
        if (!days || days.length === 0) return null;
        // Only last 30 days, max 30 bars
        const slice = days.slice(-30);
        const maxDayMin = Math.max(...slice.map(d => d.employees.reduce((s, e) => s + e.minutes, 0)), 1);
        const barW = Math.max(12, Math.floor((CHART_W - BAR_GAP * (slice.length + 1)) / slice.length));

        // Collect all unique employee names with stable colour index
        const allEmps = this.data.byEmployee.map(e => e.name);

        const bars = slice.map((day, i) => {
            const total = day.employees.reduce((s, e) => s + e.minutes, 0);
            const x = BAR_GAP + i * (barW + BAR_GAP);
            let yOffset = CHART_H - 20;
            const segments = [];
            for (const empName of allEmps) {
                const emp = day.employees.find(e => e.name === empName);
                const m = emp ? emp.minutes : 0;
                if (m === 0) continue;
                const segH = Math.max(1, Math.round((m / maxDayMin) * (CHART_H - 30)));
                yOffset -= segH;
                const color = PALETTE[allEmps.indexOf(empName) % PALETTE.length];
                segments.push({
                    key: empName,
                    x, y: yOffset, w: barW, h: segH,
                    fillStyle: `fill:${color}`,
                });
            }
            return {
                key: day.dateLabel,
                x, total, segments,
                labelX: x + barW / 2,
                labelY: CHART_H - 4,
                label: fmtDate(day.dateLabel),
                showLabel: i % Math.max(1, Math.floor(slice.length / 10)) === 0,
            };
        });

        const legend = allEmps.map((name, i) => ({
            key: name, name: name.split(' ')[0],
            fill: PALETTE[i % PALETTE.length],
            dotStyle: `background:${PALETTE[i % PALETTE.length]}`,
        }));

        return { bars, legend, width: CHART_W, height: CHART_H };
    }

    // ─── Filtered table ──────────────────────────────────────────────────────

    get flagOptions() {
        return FLAG_OPTIONS.map(o => ({
            ...o,
            btnClass: 'flag-btn' + (this.flagFilter === o.value ? ' active' : ''),
        }));
    }

    get filteredRows() {
        if (!this.data?.rows) return [];
        let rows = this.data.rows;

        if (this.flagFilter === 'issues') rows = rows.filter(r => r.validationFlag || r.isActive);
        else if (this.flagFilter === 'SHORT') rows = rows.filter(r => r.validationFlag === 'SHORT');
        else if (this.flagFilter === 'LONG') rows = rows.filter(r => r.validationFlag === 'LONG');
        else if (this.flagFilter === 'VARIANCE') rows = rows.filter(r => r.validationFlag === 'VARIANCE');
        else if (this.flagFilter === 'ACTIVE') rows = rows.filter(r => r.isActive);

        if (this.empFilter) {
            const term = this.empFilter.toLowerCase();
            rows = rows.filter(r => r.resourceName.toLowerCase().includes(term));
        }

        return rows.map(r => {
            let flagLabel = '';
            let rowClass = 'tbl-row';
            if (r.isActive) { flagLabel = 'Active'; rowClass += ' flag-active'; }
            else if (r.validationFlag === 'SHORT') { flagLabel = '< 10 min'; rowClass += ' flag-short'; }
            else if (r.validationFlag === 'LONG') { flagLabel = '> 6 h'; rowClass += ' flag-long'; }
            else if (r.validationFlag === 'VARIANCE') {
                const pct = r.plannedMinutes > 0 ? Math.round(Math.abs(r.durationMinutes - r.plannedMinutes) * 100 / r.plannedMinutes) : 0;
                flagLabel = `±${pct}% vs planned`;
                rowClass += ' flag-variance';
            }
            return {
                ...r,
                startDisplay: fmtDt(r.startTime),
                endDisplay: r.endTime ? fmtDt(r.endTime) : '—',
                durationDisplay: fmtMins(r.durationMinutes),
                plannedDisplay: fmtMins(r.plannedMinutes),
                flagLabel,
                rowClass,
            };
        });
    }

    get isEmpty() { return !this.isLoading && !this.hasError && this.filteredRows.length === 0; }
    get hasData() { return !!this.data; }
    get hasEmpChart() { return !!this.empBarChart; }
    get hasStackedChart() { return !!this.stackedChart; }
}
