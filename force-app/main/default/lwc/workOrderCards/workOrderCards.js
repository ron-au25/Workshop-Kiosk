import { LightningElement, api, track } from 'lwc';
import getWorkOrders from '@salesforce/apex/KioskController.getWorkOrders';

const STATUS_OPTIONS = [
    { value: 'All', label: 'All' },
    { value: 'New', label: 'New' },
    { value: 'In Progress', label: 'In Progress' },
    { value: 'Completed', label: 'Completed' },
];
const PRIORITY_OPTIONS = [
    { value: 'All', label: 'All' },
    { value: 'Critical', label: 'Critical' },
    { value: 'High', label: 'High' },
    { value: 'Medium', label: 'Medium' },
    { value: 'Low', label: 'Low' },
];

function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default class WorkOrderCards extends LightningElement {
    @api sessionToken;

    @track _allRecords = [];
    @track statusFilter = 'All';
    @track priorityFilter = 'All';
    @track wagonSearch = '';
    @track dateFrom = todayIso();
    @track dateTo = todayIso();
    @track isLoading = true;
    @track hasError = false;
    @track errorMessage = '';

    _searchDebounce;

    connectedCallback() { this._doFetch(this.dateFrom, this.dateTo); }

    // Public entry point — always snapshots this.dateFrom/dateTo at call time
    fetchForDateRange() {
        this._doFetch(this.dateFrom, this.dateTo);
    }

    // All actual fetching goes through here with explicit date params so
    // LWC reactivity re-renders can never clobber the values mid-flight.
    async _doFetch(dateFrom, dateTo) {
        this.isLoading = true;
        this.hasError = false;
        this._allRecords = [];
        try {
            const result = await getWorkOrders({
                token: this.sessionToken,
                filterJson: JSON.stringify({
                    dateFrom,
                    dateTo,
                    pageSize: 200,
                    pageOffset: 0,
                }),
            });
            this._allRecords = result.records.map(r => this._enrich(r));
        } catch (e) {
            console.error('[WorkOrderCards] fetch error:', e);
            this.hasError = true;
            this.errorMessage = 'Failed to load work orders. Try again.';
        } finally {
            this.isLoading = false;
        }
    }

    // Local filtering — no server call
    get workOrders() {
        let records = this._allRecords;
        if (this.statusFilter !== 'All') {
            records = records.filter(wo => wo.status === this.statusFilter);
        }
        if (this.priorityFilter !== 'All') {
            records = records.filter(wo => wo.priority === this.priorityFilter);
        }
        if (this.wagonSearch) {
            const s = this.wagonSearch.toLowerCase();
            records = records.filter(wo =>
                (wo.wagonNumber || '').toLowerCase().includes(s) ||
                (wo.subject || '').toLowerCase().includes(s)
            );
        }
        return records;
    }

    _enrich(wo) {
        const priorityColorMap = {
            Critical: 'priority-badge critical',
            High: 'priority-badge high',
            Medium: 'priority-badge medium',
            Low: 'priority-badge low',
        };
        const statusColorMap = {
            'New': 'status-pill new',
            'Open': 'status-pill new',
            'In Progress': 'status-pill inprogress',
            'Completed': 'status-pill completed',
            'Closed': 'status-pill completed',
        };
        const durationMins = wo.durationMinutes || 0;
        const durationDisplay = durationMins >= 60
            ? `${Math.floor(durationMins / 60)}h ${durationMins % 60}m`
            : durationMins > 0 ? `${durationMins}m` : null;

        let schedDisplay = null;
        if (wo.schedStart) {
            const d = new Date(wo.schedStart);
            schedDisplay = d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
        }

        return {
            ...wo,
            wagonDisplay: wo.wagonNumber || '—',
            subjectDisplay: wo.subject || 'No description',
            workTypeDisplay: wo.workTypeName || null,
            flocDisplay: wo.flocDesc || null,
            sapDisplay: wo.sapWorkCenter || null,
            extIdDisplay: wo.externalId || null,
            durationDisplay,
            schedDisplay,
            priorityClass: priorityColorMap[wo.priority] || 'priority-badge medium',
            statusClass: statusColorMap[wo.status] || 'status-pill new',
            cardClass: 'wo-card priority-' + (wo.priority || 'medium').toLowerCase(),
        };
    }

    handleFilterClick(evt) {
        const { filter, value } = evt.currentTarget.dataset;
        if (filter === 'status') this.statusFilter = value;
        else if (filter === 'priority') this.priorityFilter = value;
    }

    handleWagonSearch(evt) {
        this.wagonSearch = evt.target.value;
    }

    handleWagonKeydown(evt) {
        evt.stopPropagation();
    }

    handleDateFrom(evt) {
        const from = evt.target.value;
        const to = this.dateTo < from ? from : this.dateTo;
        this.dateFrom = from;
        this.dateTo = to;
        this._doFetch(from, to);
    }

    handleDateTo(evt) {
        const to = evt.target.value;
        const from = this.dateFrom > to ? to : this.dateFrom;
        this.dateFrom = from;
        this.dateTo = to;
        this._doFetch(from, to);
    }

    _shiftDate(iso, days) {
        const d = new Date(iso + 'T00:00:00');
        d.setDate(d.getDate() + days);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    handlePrevDay() {
        const from = this._shiftDate(this.dateFrom, -1);
        const to = this._shiftDate(this.dateTo, -1);
        this.dateFrom = from;
        this.dateTo = to;
        this._doFetch(from, to);
    }

    handleNextDay() {
        const from = this._shiftDate(this.dateFrom, 1);
        const to = this._shiftDate(this.dateTo, 1);
        this.dateFrom = from;
        this.dateTo = to;
        this._doFetch(from, to);
    }

    handleCardClick(evt) {
        const id = evt.currentTarget.dataset.id;
        this.dispatchEvent(new CustomEvent('opendetail', { detail: { workOrderId: id } }));
    }

    clearFilters() {
        this.statusFilter = 'All';
        this.priorityFilter = 'All';
        this.wagonSearch = '';
        const today = todayIso();
        this.dateFrom = today;
        this.dateTo = today;
        this._doFetch(today, today);
    }

    get statusOptions() {
        return STATUS_OPTIONS.map(o => ({
            ...o,
            btnClass: 'seg-btn' + (this.statusFilter === o.value ? ' active' : ''),
        }));
    }
    get priorityOptions() {
        return PRIORITY_OPTIONS.map(o => ({
            ...o,
            btnClass: 'seg-btn' + (this.priorityFilter === o.value ? ' active' : ''),
        }));
    }

    get isEmpty() { return !this.isLoading && !this.hasError && this.workOrders.length === 0; }

    get totalLabel() {
        const total = this._allRecords.length;
        const filtered = this.workOrders.length;
        if (filtered === total) return total === 1 ? '1 work order' : `${total} work orders`;
        return `${filtered} of ${total} work orders`;
    }
}
