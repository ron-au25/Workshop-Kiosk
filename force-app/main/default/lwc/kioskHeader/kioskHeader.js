import { LightningElement, api, track } from "lwc";

export default class KioskHeader extends LightningElement {
  @api territoryName;
  @api supervisorName;
  @api workerName;
  @api crewName;
  @api clockStartMs = null; // epoch ms of the active clock-in; null = not clocked in
  @api isPortrait = false;
  @api clockedWorkOrderId = null; // workpack the open clock belongs to
  @api currentWorkOrderId = null; // workpack currently open on screen (null on other pages)

  @track menuOpen = false;

  get showClockIn() {
    return !this.isClocked && !!this.currentWorkOrderId;
  }

  get showSwitch() {
    return (
      this.isClocked &&
      !!this.currentWorkOrderId &&
      this.currentWorkOrderId !== this.clockedWorkOrderId
    );
  }

  get hasMenuItems() {
    return this.isClocked || this.showClockIn;
  }

  get noActionHint() {
    return !this.hasMenuItems;
  }

  handleChipClick() {
    this.menuOpen = !this.menuOpen;
  }

  handleClockIn() {
    this.menuOpen = false;
    this.dispatchEvent(new CustomEvent("clockin"));
  }

  handleClockOut() {
    this.menuOpen = false;
    this.dispatchEvent(new CustomEvent("clockout"));
  }

  handleSwitch() {
    this.menuOpen = false;
    this.dispatchEvent(new CustomEvent("clockswitch"));
  }

  handleMenuKeydown(evt) {
    evt.stopPropagation();
  }

  get hasCrew() {
    return !!(this.crewName && this.crewName.trim());
  }

  get isClocked() {
    return !!this.clockStartMs;
  }

  @track currentTime = "";
  @track clockElapsed = "00:00:00";
  _clockInterval;

  connectedCallback() {
    this._updateClock();
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._clockInterval = setInterval(() => this._updateClock(), 1000);
  }

  disconnectedCallback() {
    if (this._clockInterval) clearInterval(this._clockInterval);
  }

  _updateClock() {
    const now = new Date();
    this.currentTime = now.toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });
    if (this.clockStartMs) {
      let secs = Math.floor((now.getTime() - this.clockStartMs) / 1000);
      if (secs < 0) secs = 0;
      const h = Math.floor(secs / 3600);
      const m = Math.floor((secs % 3600) / 60);
      const s = secs % 60;
      const pad = (n) => String(n).padStart(2, "0");
      this.clockElapsed = `${pad(h)}:${pad(m)}:${pad(s)}`;
    } else {
      this.clockElapsed = "00:00:00";
    }
  }

  handleHamburger() {
    this.dispatchEvent(new CustomEvent("hamburger"));
  }
}
