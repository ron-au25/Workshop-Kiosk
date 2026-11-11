import { LightningElement, api, track } from "lwc";
import validateEmployee from "@salesforce/apex/KioskController.validateEmployee";

const PIN_LENGTH = 4;
const PAD_KEYS = [
  { label: "1", value: "1", sub: "", ariaLabel: "1" },
  { label: "2", value: "2", sub: "ABC", ariaLabel: "2" },
  { label: "3", value: "3", sub: "DEF", ariaLabel: "3" },
  { label: "4", value: "4", sub: "GHI", ariaLabel: "4" },
  { label: "5", value: "5", sub: "JKL", ariaLabel: "5" },
  { label: "6", value: "6", sub: "MNO", ariaLabel: "6" },
  { label: "7", value: "7", sub: "PQRS", ariaLabel: "7" },
  { label: "8", value: "8", sub: "TUV", ariaLabel: "8" },
  { label: "9", value: "9", sub: "WXYZ", ariaLabel: "9" },
  { label: "", value: "", sub: "", ariaLabel: "" }, // spacer
  { label: "0", value: "0", sub: "", ariaLabel: "0" },
  { label: "⌫", value: "back", sub: "", ariaLabel: "Backspace" }
];

export default class KioskLogin extends LightningElement {
  @api worker;
  @api territoryId;
  @api prefilledEmployeeId;

  @track pin = "";
  @track isSubmitting = false;
  @track errorMessage = "";
  @track showError = false;
  @track isLocked = false;
  @track lockoutCountdown = "";
  @track shakeActive = false;

  _lockoutInterval;

  disconnectedCallback() {
    if (this._lockoutInterval) clearInterval(this._lockoutInterval);
  }

  get workerDisplayName() {
    if (this.worker) return this.worker.name;
    if (this.prefilledEmployeeId) return "Scanned Worker";
    return "Worker";
  }

  get workerInitials() {
    const name = this.workerDisplayName;
    const parts = name.trim().split(" ");
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  }

  get workerPhotoUrl() {
    return this.worker?.photoUrl || null;
  }

  get workerRoleLabel() {
    return this.worker?.ganttLabel || this.worker?.roleLabel || "";
  }

  get isBarcodePrefilled() {
    return !!this.prefilledEmployeeId && !this.worker;
  }

  get pinDots() {
    return Array.from({ length: PIN_LENGTH }, (_, i) => ({
      index: i,
      dotClass: "pin-dot" + (i < this.pin.length ? " filled" : "")
    }));
  }

  get padKeys() {
    return PAD_KEYS.map((k) => ({
      ...k,
      btnClass:
        "pad-key" +
        (k.value === "" ? " spacer" : "") +
        (k.value === "back" ? " back-key" : "")
    }));
  }

  get isPadDisabled() {
    return this.isSubmitting || this.isLocked;
  }

  get errorClass() {
    return "error-banner" + (this.shakeActive ? " shake" : "");
  }

  handlePadKey(evt) {
    const val = evt.currentTarget.dataset.value;
    if (!val) return;
    if (val === "back") {
      this.pin = this.pin.slice(0, -1);
      return;
    }
    if (this.pin.length >= PIN_LENGTH) return;
    this.pin += val;
    if (this.pin.length === PIN_LENGTH) {
      this._submitPin();
    }
  }

  async _submitPin() {
    this.isSubmitting = true;
    this.showError = false;
    const employeeId =
      this.prefilledEmployeeId || (this.worker ? this.worker.employeeId : null);

    try {
      const result = await validateEmployee({
        territoryId: this.territoryId,
        employeeId: employeeId,
        pin: this.pin
      });

      if (result.success) {
        this.pin = "";
        this.dispatchEvent(
          new CustomEvent("authenticated", {
            detail: {
              token: result.token,
              workerName: result.workerName,
              workerId: result.workerId,
              crewName: result.crewName,
              workerRole: result.workerRole
            }
          })
        );
      } else {
        this.pin = "";
        this._handleFailure(result);
      }
    } catch {
      this.pin = "";
      this.errorMessage = "Connection error. Please try again.";
      this.showError = true;
      this._triggerShake();
    } finally {
      this.isSubmitting = false;
    }
  }

  _handleFailure(result) {
    if (result.errorCode === "LOCKED") {
      this.isLocked = true;
      this._startLockoutCountdown(result.lockedUntilMs);
    } else if (result.errorCode === "WRONG_PIN") {
      this.errorMessage =
        result.remainingAttempts === 1
          ? "Incorrect PIN — 1 attempt remaining"
          : `Incorrect PIN — ${result.remainingAttempts} attempts remaining`;
      this.showError = true;
      this._triggerShake();
    } else if (result.errorCode === "NOT_FOUND") {
      this.errorMessage = "Employee not found. Check with your supervisor.";
      this.showError = true;
    } else {
      this.errorMessage = "Sign in failed. Try again.";
      this.showError = true;
    }
  }

  _triggerShake() {
    this.shakeActive = true;
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => {
      this.shakeActive = false;
    }, 600);
  }

  _startLockoutCountdown(lockedUntilMs) {
    if (this._lockoutInterval) clearInterval(this._lockoutInterval);
    const update = () => {
      const remaining = Math.max(
        0,
        Math.ceil((lockedUntilMs - Date.now()) / 1000)
      );
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      this.lockoutCountdown = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      if (remaining <= 0) {
        clearInterval(this._lockoutInterval);
        this.isLocked = false;
        this.showError = false;
      }
    };
    update();
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    this._lockoutInterval = setInterval(update, 1000);
  }

  handleCancel() {
    this.pin = "";
    this.showError = false;
    this.isLocked = false;
    if (this._lockoutInterval) clearInterval(this._lockoutInterval);
    this.dispatchEvent(new CustomEvent("cancel"));
  }
}
