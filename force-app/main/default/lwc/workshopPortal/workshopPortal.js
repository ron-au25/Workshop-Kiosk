import { LightningElement, track } from 'lwc';
import isGuestUser from '@salesforce/user/isGuest';
import getSupervisorContext from '@salesforce/apex/KioskController.getSupervisorContext';
import ensureClockedIn from '@salesforce/apex/KioskController.ensureClockedIn';
import autoClockOut from '@salesforce/apex/KioskController.autoClockOut';
import getActiveClock from '@salesforce/apex/KioskController.getActiveClock';

const STATE = {
    BOOTING: 'BOOTING',
    SUPERVISOR_REQUIRED: 'SUPERVISOR_REQUIRED',
    ROSTER: 'ROSTER',
    LOGIN: 'LOGIN',
    DASHBOARD: 'DASHBOARD',
    WORK_ORDERS: 'WORK_ORDERS',
    WORK_ORDER_DETAIL: 'WORK_ORDER_DETAIL',
    TIME_TRACKING: 'TIME_TRACKING',
};

const IDLE_WARN_SECONDS = 30;
const IDLE_TIMEOUT_MINUTES = 10;

// Barcode scanner: >=4 chars arriving within 100ms window ending with Enter
const BARCODE_MIN_LEN = 4;
const BARCODE_MAX_MS = 100;

export default class WorkshopPortal extends LightningElement {
    @track state = STATE.BOOTING;
    @track territoryId;
    @track territoryName;
    @track supervisorName;
    @track kioskNotes;
    @track isSupervisor = false;
    @track selectedWorker;
    @track sessionToken;
    @track currentWorkerName;
    @track currentCrewName = '';
    @track setupError;
    @track isAuthError = false;
    @track siteBaseUrl = '';
    @track orgId = '';
    @track networkId = '';
    @track sidebarCollapsed = false;
    @track isPortrait = false;
    @track showIdleWarning = false;
    @track idleCountdown = IDLE_WARN_SECONDS;
    @track activeNav = 'dashboard';
    @track barcodeEmployeeId;
    @track selectedWorkOrderId = null;
    @track theme = 'dark';
    @track clockStartMs = null;      // epoch ms of the active clock's Start_Time__c (drives header timer)
    clockedWorkOrderId = null;       // WO opened when the worker was clocked in

    _idleTimer;
    _idleWarnTimer;
    _idleCountdownInterval;
    _resizeObserver;
    _barcodeBuffer = '';
    _barcodeLastKeyMs = 0;

    connectedCallback() {
        this._boot();
        this._setupResizeObserver();
    }

    disconnectedCallback() {
        this._clearTimers();
        if (this._resizeObserver) this._resizeObserver.disconnect();
    }

    async _boot() {
        // isGuestUser is a compile-time boolean — never call Apex for guests
        if (isGuestUser) {
            this.isAuthError = true;
            this.state = STATE.SUPERVISOR_REQUIRED;
            return;
        }
        try {
            const ctx = await getSupervisorContext();
            if (!ctx.isSupervisor) {
                this.isAuthError = false;
                this.setupError = ctx.kioskNotes;
                this.state = STATE.SUPERVISOR_REQUIRED;
                return;
            }
            this.territoryId = ctx.territoryId;
            this.territoryName = ctx.territoryName;
            this.supervisorName = ctx.supervisorName;
            this.kioskNotes = ctx.kioskNotes;
            this.isSupervisor = true;
            this.siteBaseUrl = ctx.siteBaseUrl || '';
            this.state = STATE.ROSTER;
        } catch (e) {
            // 401/403 or unauthenticated guest — show login button
            this.isAuthError = true;
            this.state = STATE.SUPERVISOR_REQUIRED;
        }
    }

    handleSupervisorLogin() {
        const pathParts = window.location.pathname.split('/').filter(Boolean);
        const siteBase = pathParts.length > 0 ? '/' + pathParts[0] : '';
        const returnPath = window.location.pathname;
        window.location.href =
            window.location.origin + siteBase + '/login?startURL=' + encodeURIComponent(returnPath);
    }

    handleRetry() {
        this.state = STATE.BOOTING;
        this.isAuthError = false;
        this._boot();
    }

    _setupResizeObserver() {
        this._checkOrientation();
        window.addEventListener('resize', this._checkOrientation.bind(this));
    }

    _checkOrientation() {
        this.isPortrait = window.innerWidth < window.innerHeight;
        if (this.isPortrait) this.sidebarCollapsed = true;
    }

    handleWorkerSelected(evt) {
        this.selectedWorker = evt.detail;
        this.barcodeEmployeeId = null;
        this.state = STATE.LOGIN;
    }

    handleEmployeeAuthenticated(evt) {
        const { token, workerName, crewName } = evt.detail;
        this.sessionToken = token;
        this.currentWorkerName = workerName;
        this.currentCrewName = crewName || '';
        this.activeNav = 'dashboard';
        this.state = STATE.DASHBOARD;
        this._startIdleTimer();
    }

    handleLoginCancel() {
        this.selectedWorker = null;
        this.barcodeEmployeeId = null;
        this.state = STATE.ROSTER;
    }

    handleNavigation(evt) {
        const nav = evt.detail.nav;
        this.activeNav = nav;
        if (nav === 'dashboard') this.state = STATE.DASHBOARD;
        else if (nav === 'workorders') { this.selectedWorkOrderId = null; this.state = STATE.WORK_ORDERS; }
        else if (nav === 'timetracking') this.state = STATE.TIME_TRACKING;
    }

    async handleOpenDetail(evt) {
        const woId = evt.detail.workOrderId;
        await this._onWorkpackChange(woId);
        this.selectedWorkOrderId = woId;
        this.state = STATE.WORK_ORDER_DETAIL;
    }

    // Drill-down from a tapped carousel image in the Agentforce chat.
    async handleChatDrilldown(evt) {
        const woId = evt.detail && evt.detail.workOrderId;
        if (!woId) return;
        await this._onWorkpackChange(woId);
        this.selectedWorkOrderId = woId;
        this.state = STATE.WORK_ORDER_DETAIL;
        this.activeNav = 'workorders';
    }

    // ─── Auto clock (activity-driven, workpack-level) ──────────────────────────

    // Fired (bubbles+composed) by asset/work-order write actions. Clock the worker
    // in on the current workpack if they aren't already.
    async handleDataUpdate() {
        if (!this.sessionToken || !this.selectedWorkOrderId) return;
        try {
            const wasClocked = !!this.clockStartMs;
            const c = await ensureClockedIn({ token: this.sessionToken, workOrderId: this.selectedWorkOrderId });
            if (c && c.startTimeMs) {
                this.clockStartMs = c.startTimeMs;
                this.clockedWorkOrderId = this.selectedWorkOrderId;
                // Newly clocked in → refresh the detail so the time record shows without a full refresh.
                if (!wasClocked) this._reloadWorkOrderDetail();
            }
        } catch (e) { /* clock is best-effort; never block the user's action */ }
    }

    // Manual Clock Out button in workOrderDetail closed the report → stop the header timer.
    handleClockStopped() {
        this._clearClock();
    }

    _reloadWorkOrderDetail() {
        const wod = this.template.querySelector('c-work-order-detail');
        if (wod && typeof wod.reload === 'function') wod.reload();
    }

    // Switching to a different workpack clocks out the current one (no auto clock-in
    // of the new one); then sync the header timer to whatever is still open.
    async _onWorkpackChange(newWoId) {
        if (this.clockStartMs && this.clockedWorkOrderId && this.clockedWorkOrderId !== newWoId) {
            await this._doAutoClockOut();
        }
        await this._syncClock(newWoId);
    }

    async _syncClock(woId) {
        if (!this.sessionToken) { this._clearClock(); return; }
        try {
            const c = await getActiveClock({ token: this.sessionToken });
            if (c && c.startTimeMs) {
                this.clockStartMs = c.startTimeMs;
                this.clockedWorkOrderId = woId || c.workOrderId;
            } else {
                this._clearClock();
            }
        } catch (e) { /* non-fatal */ }
    }

    async _doAutoClockOut() {
        if (this.sessionToken) {
            try { await autoClockOut({ token: this.sessionToken }); } catch (e) { /* ignore */ }
        }
        this._clearClock();
    }

    _clearClock() {
        this.clockStartMs = null;
        this.clockedWorkOrderId = null;
    }

    handleDetailBack() {
        this.selectedWorkOrderId = null;
        this.state = STATE.WORK_ORDERS;
    }

    handleSidebarToggle() {
        this.sidebarCollapsed = !this.sidebarCollapsed;
    }

    handleThemeToggle() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
    }

    async handleSwitchUser() {
        this._clearTimers();
        await this._doAutoClockOut();   // close the open report before dropping the token
        this.sessionToken = null;
        this.currentWorkerName = null;
        this.currentCrewName = '';
        this.selectedWorker = null;
        this.barcodeEmployeeId = null;
        this.showIdleWarning = false;
        this._resetAgentChat();
        this.state = STATE.ROSTER;
    }

    // Clear/close the Agentforce conversation when a worker session ends,
    // so the next worker doesn't inherit the previous chat.
    _resetAgentChat() {
        const chat = this.template.querySelector('c-agentforce-chat');
        if (chat && typeof chat.reset === 'function') chat.reset();
    }

    async handleEndSession() {
        // End Shift: close the open time report, then full page reload ends the SF session
        await this._doAutoClockOut();
        window.location.reload();
    }

    handleDashboardRefresh() {
        // Trigger re-render of dashboard by toggling state
        this.state = STATE.WORK_ORDERS;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => { this.state = STATE.DASHBOARD; }, 50);
    }

    resetIdleTimer() {
        if (this.state !== STATE.DASHBOARD && this.state !== STATE.WORK_ORDERS && this.state !== STATE.WORK_ORDER_DETAIL && this.state !== STATE.TIME_TRACKING) return;
        this._clearTimers();
        this.showIdleWarning = false;
        this._startIdleTimer();
    }

    _startIdleTimer() {
        const warnAfterMs = (IDLE_TIMEOUT_MINUTES * 60 - IDLE_WARN_SECONDS) * 1000;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this._idleTimer = setTimeout(() => {
            this.showIdleWarning = true;
            this.idleCountdown = IDLE_WARN_SECONDS;
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            this._idleCountdownInterval = setInterval(() => {
                this.idleCountdown--;
                if (this.idleCountdown <= 0) this._autoLogout();
            }, 1000);
        }, warnAfterMs);
    }

    _autoLogout() {
        this._clearTimers();
        this.showIdleWarning = false;
        this.handleSwitchUser();
    }

    _clearTimers() {
        if (this._idleTimer) clearTimeout(this._idleTimer);
        if (this._idleCountdownInterval) clearInterval(this._idleCountdownInterval);
    }

    // Barcode scanner capture
    handleBarcodeInput(evt) {
        const now = Date.now();
        if (now - this._barcodeLastKeyMs > BARCODE_MAX_MS) {
            this._barcodeBuffer = '';
        }
        this._barcodeBuffer += evt.target.value;
        evt.target.value = '';
        this._barcodeLastKeyMs = now;
    }

    handleBarcodeKeydown(evt) {
        if (evt.key === 'Enter') {
            const id = this._barcodeBuffer.trim();
            this._barcodeBuffer = '';
            if (id.length >= BARCODE_MIN_LEN) {
                this.barcodeEmployeeId = id;
                if (this.state === STATE.ROSTER || this.state === STATE.LOGIN) {
                    this.selectedWorker = null;
                    this.state = STATE.LOGIN;
                }
            }
        }
    }

    handleGlobalKeydown(evt) {
        // Use composedPath to pierce shadow DOM — evt.target is retargeted to the
        // host component, not the actual inner element the user is typing in.
        const realTarget = evt.composedPath()[0];
        const tag = realTarget ? realTarget.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const barcodeInput = this.template.querySelector('[data-id="barcode"]');
        if (barcodeInput && realTarget !== barcodeInput) {
            barcodeInput.focus();
        }
    }

    get isBooting() { return this.state === STATE.BOOTING; }
    get isSupervisorRequired() { return this.state === STATE.SUPERVISOR_REQUIRED; }
    get isRosterState() { return this.state === STATE.ROSTER; }
    get isLoginState() { return this.state === STATE.LOGIN; }
    get isDashboardState() { return this.state === STATE.DASHBOARD; }
    get isWorkOrdersState() { return this.state === STATE.WORK_ORDERS; }
    get isWorkOrderDetailState() { return this.state === STATE.WORK_ORDER_DETAIL; }
    get isTimeTrackingState() { return this.state === STATE.TIME_TRACKING; }
    get isInApp() { return this.state === STATE.DASHBOARD || this.state === STATE.WORK_ORDERS || this.state === STATE.WORK_ORDER_DETAIL || this.state === STATE.TIME_TRACKING; }

    get appLayoutClass() {
        let cls = 'kiosk-app';
        if (this.isPortrait) cls += ' portrait';
        if (this.sidebarCollapsed) cls += ' sidebar-collapsed';
        return cls;
    }

    get appRootClass() {
        return 'kiosk-root' + (this.theme === 'light' ? ' theme-light' : '');
    }
}
