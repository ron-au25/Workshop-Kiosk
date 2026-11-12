import { LightningElement, track } from "lwc";
import isGuestUser from "@salesforce/user/isGuest";
import getSupervisorContext from "@salesforce/apex/KioskController.getSupervisorContext";
import ensureClockedIn from "@salesforce/apex/KioskController.ensureClockedIn";
import autoClockOut from "@salesforce/apex/KioskController.autoClockOut";
import getActiveClock from "@salesforce/apex/KioskController.getActiveClock";
import getWorkOrderRoot from "@salesforce/apex/KioskController.getWorkOrderRoot";
import getKioskConfig from "@salesforce/apex/KioskController.getKioskConfig";
import getWorkerPrefs from "@salesforce/apex/KioskController.getWorkerPrefs";
import saveWorkerPrefs from "@salesforce/apex/KioskController.saveWorkerPrefs";
import { mergeConfig } from "c/kioskConfigDefaults";

const STATE = {
  BOOTING: "BOOTING",
  SUPERVISOR_REQUIRED: "SUPERVISOR_REQUIRED",
  ROSTER: "ROSTER",
  LOGIN: "LOGIN",
  DASHBOARD: "DASHBOARD",
  WORK_ORDERS: "WORK_ORDERS",
  WORK_ORDER_DETAIL: "WORK_ORDER_DETAIL",
  TIME_TRACKING: "TIME_TRACKING",
  KIOSK_CONFIG: "KIOSK_CONFIG"
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
  @track currentWorkerRole = "";
  @track currentCrewName = "";
  @track kioskConfig = mergeConfig(null);
  @track setupError;
  @track isAuthError = false;
  @track siteBaseUrl = "";
  @track orgId = "";
  @track networkId = "";
  @track sidebarCollapsed = false;
  @track chatOpen = false;
  @track chatPinned = false;
  @track isPortrait = false;
  @track showIdleWarning = false;
  @track idleCountdown = IDLE_WARN_SECONDS;
  @track activeNav = "dashboard";
  @track barcodeEmployeeId;
  @track selectedWorkOrderId = null;
  @track theme = "dark";
  // Worker memory (Kiosk_App_Config__c 'Worker:<id>'): { theme, pinList, wtFilter:{[wpId]:{wp,ar}}, last:{workOrderId,woNumber,tab} }
  @track workerPrefs = {};
  @track showLeaveWarning = false; // "still clocked in" prompt when leaving the open work order
  _pendingLeave = null; // the navigation to run once the worker answers the prompt
  @track clockStartMs = null; // epoch ms of the active clock's Start_Time__c (drives header timer)
  @track clockedWorkOrderId = null; // workpack ROOT of the open time record
  @track currentRootId = null; // workpack ROOT of the work order open on screen
  @track staleClock = null; // open record found at login: asks "clock out or keep?"

  _idleTimer;
  _idleWarnTimer;
  _idleCountdownInterval;
  _resizeObserver;
  _barcodeBuffer = "";
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
      this.siteBaseUrl = ctx.siteBaseUrl || "";
      this.state = STATE.ROSTER;
    } catch {
      // 401/403 or unauthenticated guest — show login button
      this.isAuthError = true;
      this.state = STATE.SUPERVISOR_REQUIRED;
    }
  }

  handleSupervisorLogin() {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const siteBase = pathParts.length > 0 ? "/" + pathParts[0] : "";
    const returnPath = window.location.pathname;
    window.location.href =
      window.location.origin +
      siteBase +
      "/login?startURL=" +
      encodeURIComponent(returnPath);
  }

  handleRetry() {
    this.state = STATE.BOOTING;
    this.isAuthError = false;
    this._boot();
  }

  _setupResizeObserver() {
    this._checkOrientation();
    window.addEventListener("resize", this._checkOrientation.bind(this));
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
    const { token, workerName, crewName, workerRole } = evt.detail;
    this.sessionToken = token;
    this.currentWorkerName = workerName;
    this.currentWorkerRole = workerRole || "";
    this.currentCrewName = crewName || "";
    this.activeNav = "dashboard";
    this.state = STATE.DASHBOARD;
    this._startIdleTimer();
    this._loadKioskConfig();
    this._loadWorkerPrefs();
    this._checkStaleClock();
  }

  // A normal logout / idle logout clocks the worker out, so an open record at login
  // means the last session ended without it (browser closed, other device). Ask.
  async _checkStaleClock() {
    const token = this.sessionToken;
    try {
      const c = await getActiveClock({ token });
      if (this.sessionToken !== token || !c || !c.startTimeMs) return;
      this.staleClock = c;
    } catch {
      /* non-fatal */
    }
  }

  get staleClockText() {
    const c = this.staleClock;
    if (!c) return "";
    return (
      "You are still clocked in since " +
      new Date(c.startTimeMs).toLocaleString() +
      (c.workOrderNumber ? " on WO " + c.workOrderNumber : "") +
      "."
    );
  }

  async handleStaleClockOut() {
    this.staleClock = null;
    await this._doAutoClockOut();
  }

  handleStaleClockKeep() {
    const c = this.staleClock;
    this.staleClock = null;
    if (c) {
      this.clockStartMs = c.startTimeMs;
      this.clockedWorkOrderId = c.rootWorkOrderId;
    }
  }

  // Root of the workpack a WO belongs to; falls back to the WO itself so a lookup
  // failure never blocks opening it.
  async _rootOf(woId) {
    try {
      return await getWorkOrderRoot({
        token: this.sessionToken,
        workOrderId: woId
      });
    } catch {
      return woId;
    }
  }

  async _loadWorkerPrefs() {
    const token = this.sessionToken;
    try {
      const raw = await getWorkerPrefs({ token });
      if (this.sessionToken !== token) return; // worker switched meanwhile
      const prefs = JSON.parse(raw || "{}");
      this.workerPrefs = prefs && typeof prefs === "object" ? prefs : {};
      this._prefsSaved = JSON.stringify(this.workerPrefs);
      console.log("[WorkerPrefs] loaded", this.workerPrefs);
      if (
        this.workerPrefs.theme === "light" ||
        this.workerPrefs.theme === "dark"
      )
        this.theme = this.workerPrefs.theme;
    } catch (e) {
      console.error("[WorkerPrefs] load failed", e && e.body ? e.body : e);
      this.workerPrefs = {}; // memory must never block the kiosk
    }
  }

  // Children send partial patches; wtFilter merges two levels deep (workpack -> wp/ar),
  // everything else replaces by key. Held in memory only; written to the DB once,
  // when the worker logs out / is idle-logged-out (see handleSwitchUser).
  handlePrefsChange(evt) {
    this._mergePrefs(evt.detail || {});
  }

  _mergePrefs(patch) {
    const next = { ...this.workerPrefs };
    Object.keys(patch).forEach((k) => {
      if (k === "wtFilter") {
        const wf = { ...(next.wtFilter || {}) };
        Object.keys(patch.wtFilter).forEach((wpId) => {
          wf[wpId] = { ...(wf[wpId] || {}), ...patch.wtFilter[wpId] };
        });
        next.wtFilter = wf;
      } else {
        next[k] = patch[k];
      }
    });
    if (JSON.stringify(next) === JSON.stringify(this.workerPrefs)) return;
    this.workerPrefs = next;
  }

  async _flushPrefs() {
    const json = JSON.stringify(this.workerPrefs);
    if (!this.sessionToken) return;
    if (json === this._prefsSaved) {
      console.log("[WorkerPrefs] save skipped, nothing changed");
      return;
    }
    this._prefsSaved = json;
    try {
      await saveWorkerPrefs({ token: this.sessionToken, prefsJson: json });
      console.log("[WorkerPrefs] saved", this.workerPrefs);
    } catch (e) {
      // not shown to the worker: losing a preference must not interrupt them
      console.error("[WorkerPrefs] save failed", e && e.body ? e.body : e);
    }
  }

  get resumeLast() {
    const l = this.workerPrefs && this.workerPrefs.last;
    return l && l.workOrderId ? l : null;
  }
  get showResume() {
    return this.isDashboardState && !!this.resumeLast;
  }
  get resumeLabel() {
    const l = this.resumeLast;
    return l && l.woNumber
      ? "Resume WO " + l.woNumber
      : "Resume last work order";
  }
  handleResume() {
    const l = this.resumeLast;
    if (l) this.handleOpenDetail({ detail: { workOrderId: l.workOrderId } });
  }

  async _loadKioskConfig() {
    try {
      const raw = await getKioskConfig({ token: this.sessionToken });
      this.kioskConfig = mergeConfig(raw);
    } catch {
      this.kioskConfig = mergeConfig(null); // defaults: config must never block the kiosk
    }
  }

  handleConfigSaved(evt) {
    this.kioskConfig = evt.detail.config;
  }

  handleLoginCancel() {
    this.selectedWorker = null;
    this.barcodeEmployeeId = null;
    this.state = STATE.ROSTER;
  }

  // Leaving the open work order while the clock runs asks first. Moving between
  // work orders is handled by _onWorkpackChange and does not come through here.
  _guardLeave(action) {
    if (this.clockStartMs && this.state === STATE.WORK_ORDER_DETAIL) {
      this._pendingLeave = action;
      this.showLeaveWarning = true;
      return;
    }
    action();
  }

  get leaveWarningText() {
    const l = this.workerPrefs && this.workerPrefs.last;
    const num =
      l && l.workOrderId === this.selectedWorkOrderId ? l.woNumber : null;
    return (
      "Your clock is still running" +
      (num ? " on WO " + num : "") +
      ". Time keeps counting while you are away."
    );
  }

  // Cancel: stay on the work order, clock untouched.
  handleLeaveCancel() {
    this.showLeaveWarning = false;
    this._pendingLeave = null;
  }

  // Leave but keep the clock running.
  handleLeaveKeepClock() {
    this._runPendingLeave();
  }

  // Clock out, then leave.
  async handleLeaveClockOut() {
    await this._doAutoClockOut();
    this._runPendingLeave();
  }

  _runPendingLeave() {
    const action = this._pendingLeave;
    this.showLeaveWarning = false;
    this._pendingLeave = null;
    if (action) action();
  }

  handleNavigation(evt) {
    this._guardLeave(() => this._navigate(evt.detail.nav));
  }

  _navigate(nav) {
    this.activeNav = nav;
    if (nav === "dashboard") this.state = STATE.DASHBOARD;
    else if (nav === "workorders") {
      this.selectedWorkOrderId = null;
      this.currentRootId = null;
      this.state = STATE.WORK_ORDERS;
    } else if (nav === "timetracking" && this.showAdminNav)
      this.state = STATE.TIME_TRACKING;
    else if (nav === "kioskconfig" && this.showAdminNav)
      this.state = STATE.KIOSK_CONFIG;
  }

  /** Time Tracking and Config sidebar tabs: Supervisor or Admin role only. */
  get showAdminNav() {
    const r = (this.currentWorkerRole || "").trim().toLowerCase();
    return r === "supervisor" || r === "admin";
  }

  async handleOpenDetail(evt) {
    const woId = evt.detail.workOrderId;
    const rootId = await this._rootOf(woId);
    await this._onWorkpackChange(rootId);
    this.currentRootId = rootId;
    this.selectedWorkOrderId = woId;
    this.state = STATE.WORK_ORDER_DETAIL;
    this.sidebarCollapsed = true; // more room for the work order
  }

  // Drill-down from a tapped carousel image in the Agentforce chat.
  async handleChatDrilldown(evt) {
    const woId = evt.detail && evt.detail.workOrderId;
    if (!woId) return;
    const rootId = await this._rootOf(woId);
    await this._onWorkpackChange(rootId);
    this.currentRootId = rootId;
    this.selectedWorkOrderId = woId;
    this.state = STATE.WORK_ORDER_DETAIL;
    this.activeNav = "workorders";
    this.sidebarCollapsed = true;
    if (!this.chatPinned) this.chatOpen = false;
  }

  handleToggleChat() {
    this.chatOpen = !this.chatOpen;
    if (this.chatOpen) this.sidebarCollapsed = true; // make room
  }

  handleChatClose() {
    this.chatOpen = false;
  }

  handleChatPin(evt) {
    this.chatPinned = !!(evt.detail && evt.detail.pinned);
  }

  // ─── Auto clock (activity-driven, workpack-level) ──────────────────────────

  // Fired (bubbles+composed) by asset/work-order write actions. Clock the worker
  // in on the current workpack if they aren't already.
  async handleDataUpdate() {
    if (!this.sessionToken || !this.selectedWorkOrderId) return;
    try {
      const wasClocked = !!this.clockStartMs;
      const c = await ensureClockedIn({
        token: this.sessionToken,
        workOrderId: this.selectedWorkOrderId
      });
      if (c && c.startTimeMs) {
        this.clockStartMs = c.startTimeMs;
        this.clockedWorkOrderId = c.rootWorkOrderId;
        // Newly clocked in → refresh the detail so the time record shows without a full refresh.
        if (!wasClocked) this._reloadWorkOrderDetail();
      }
    } catch {
      /* clock is best-effort; never block the user's action */
    }
  }

  // Root of the open work order (the clock lives on the root, so compare roots).
  get currentWorkpackId() {
    return this.state === STATE.WORK_ORDER_DETAIL ? this.currentRootId : null;
  }

  // Header chip actions (any page). Clock in/switch only applies to the open workpack.
  async handleHeaderClockIn() {
    await this.handleDataUpdate();
    this._reloadWorkOrderDetail();
  }

  async handleHeaderClockOut() {
    await this._doAutoClockOut();
    this._reloadWorkOrderDetail();
  }

  async handleHeaderClockSwitch() {
    await this._doAutoClockOut();
    await this.handleDataUpdate();
    this._reloadWorkOrderDetail();
  }

  // Page Clock In / Clock Out buttons in workOrderDetail: re-read the real open
  // record so the header timer matches the database (also covers a second open one).
  handleClockStopped() {
    this._syncClock();
  }

  handleClockStarted() {
    this._syncClock();
  }

  _reloadWorkOrderDetail() {
    const wod = this.template.querySelector("c-work-order-detail");
    if (wod && typeof wod.reload === "function") wod.reload();
  }

  // Switching to a different workpack (different ROOT) clocks out the current one
  // (no auto clock-in of the new one); moving between work orders of the same
  // workpack keeps the clock. Then sync the header timer to whatever is still open.
  async _onWorkpackChange(newRootId) {
    if (
      this.clockStartMs &&
      this.clockedWorkOrderId &&
      this.clockedWorkOrderId !== newRootId
    ) {
      await this._doAutoClockOut();
    }
    await this._syncClock();
  }

  async _syncClock() {
    if (!this.sessionToken) {
      this._clearClock();
      return;
    }
    try {
      const c = await getActiveClock({ token: this.sessionToken });
      if (c && c.startTimeMs) {
        this.clockStartMs = c.startTimeMs;
        this.clockedWorkOrderId = c.rootWorkOrderId;
      } else {
        this._clearClock();
      }
    } catch {
      /* non-fatal */
    }
  }

  async _doAutoClockOut() {
    if (this.sessionToken) {
      try {
        await autoClockOut({ token: this.sessionToken });
      } catch {
        /* ignore */
      }
    }
    this._clearClock();
  }

  _clearClock() {
    this.clockStartMs = null;
    this.clockedWorkOrderId = null;
  }

  handleDetailBack() {
    this._guardLeave(() => {
      this.selectedWorkOrderId = null;
      this.currentRootId = null;
      this.state = STATE.WORK_ORDERS;
    });
  }

  handleSidebarToggle() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  handleThemeToggle() {
    this.theme = this.theme === "dark" ? "light" : "dark";
    this._mergePrefs({ theme: this.theme });
  }

  async handleSwitchUser() {
    this._clearTimers();
    await this._flushPrefs(); // save before the token is dropped
    this.workerPrefs = {};
    this.staleClock = null;
    this.currentRootId = null;
    this.theme = "dark"; // next worker starts from the default until their prefs load
    await this._doAutoClockOut(); // close the open report before dropping the token
    this.sessionToken = null;
    this.currentWorkerName = null;
    this.currentWorkerRole = "";
    this.currentCrewName = "";
    this.selectedWorker = null;
    this.barcodeEmployeeId = null;
    this.showIdleWarning = false;
    this._resetAgentChat();
    this.chatOpen = false;
    this.state = STATE.ROSTER;
  }

  // Clear/close the Agentforce conversation when a worker session ends,
  // so the next worker doesn't inherit the previous chat.
  _resetAgentChat() {
    const chat = this.template.querySelector("c-agentforce-chat");
    if (chat && typeof chat.reset === "function") chat.reset();
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
    setTimeout(() => {
      this.state = STATE.DASHBOARD;
    }, 50);
  }

  resetIdleTimer() {
    if (
      this.state !== STATE.DASHBOARD &&
      this.state !== STATE.WORK_ORDERS &&
      this.state !== STATE.WORK_ORDER_DETAIL &&
      this.state !== STATE.TIME_TRACKING &&
      this.state !== STATE.KIOSK_CONFIG
    )
      return;
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
      this._barcodeBuffer = "";
    }
    this._barcodeBuffer += evt.target.value;
    evt.target.value = "";
    this._barcodeLastKeyMs = now;
  }

  handleBarcodeKeydown(evt) {
    if (evt.key === "Enter") {
      const id = this._barcodeBuffer.trim();
      this._barcodeBuffer = "";
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
    const tag = realTarget ? realTarget.tagName : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const barcodeInput = this.template.querySelector('[data-id="barcode"]');
    if (barcodeInput && realTarget !== barcodeInput) {
      barcodeInput.focus();
    }
  }

  get isBooting() {
    return this.state === STATE.BOOTING;
  }
  get isSupervisorRequired() {
    return this.state === STATE.SUPERVISOR_REQUIRED;
  }
  get isRosterState() {
    return this.state === STATE.ROSTER;
  }
  get isLoginState() {
    return this.state === STATE.LOGIN;
  }
  get isDashboardState() {
    return this.state === STATE.DASHBOARD;
  }
  get isWorkOrdersState() {
    return this.state === STATE.WORK_ORDERS;
  }
  get isWorkOrderDetailState() {
    return this.state === STATE.WORK_ORDER_DETAIL;
  }
  get isTimeTrackingState() {
    return this.state === STATE.TIME_TRACKING;
  }
  get isKioskConfigState() {
    return this.state === STATE.KIOSK_CONFIG;
  }
  get isInApp() {
    return (
      this.state === STATE.KIOSK_CONFIG ||
      this.state === STATE.DASHBOARD ||
      this.state === STATE.WORK_ORDERS ||
      this.state === STATE.WORK_ORDER_DETAIL ||
      this.state === STATE.TIME_TRACKING
    );
  }

  get appLayoutClass() {
    let cls = "kiosk-app";
    if (this.isPortrait) cls += " portrait";
    if (this.sidebarCollapsed) cls += " sidebar-collapsed";
    if (this.chatOpen && this.chatPinned && !this.isPortrait)
      cls += " chat-docked";
    return cls;
  }

  get appRootClass() {
    return "kiosk-root" + (this.theme === "light" ? " theme-light" : "");
  }
}
