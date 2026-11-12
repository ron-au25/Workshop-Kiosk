import { LightningElement, api } from "lwc";
import getManagedWorkers from "@salesforce/apex/KioskController.getManagedWorkers";
import setWorkerPin from "@salesforce/apex/KioskController.setWorkerPin";
import clearWorkerPin from "@salesforce/apex/KioskController.clearWorkerPin";
import unlockWorker from "@salesforce/apex/KioskController.unlockWorker";

export default class KioskWorkers extends LightningElement {
  @api sessionToken;

  workers = [];
  loading = true;
  message = "";
  isError = false;
  editId = null; // worker whose PIN is being typed
  newPin = "";
  busy = false;

  connectedCallback() {
    this.load();
  }

  async load() {
    this.loading = true;
    try {
      this.workers = await getManagedWorkers({ token: this.sessionToken });
       
      console.log("[Workers] loaded", this.workers.length);
    } catch (e) {
       
      console.error("[Workers] load failed", e);
      this._msg("Could not load workers.", true);
    } finally {
      this.loading = false;
    }
  }

  get rows() {
    return this.workers.map((w) => ({
      ...w,
      status: w.isLocked ? "Locked" : w.hasPin ? "PIN set" : "No PIN",
      statusCls: "st " + (w.isLocked ? "lock" : w.hasPin ? "ok" : "none"),
      editing: this.editId === w.resourceId,
      canUnlock: w.isLocked,
      canClear: w.hasPin,
      setLabel: w.hasPin ? "Change PIN" : "Set PIN"
    }));
  }

  get saveDisabled() {
    return this.busy || !/^[0-9]{4}$/.test(this.newPin);
  }

  _msg(text, err) {
    this.message = text;
    this.isError = !!err;
  }

  get messageCls() {
    return "msg" + (this.isError ? " err" : "");
  }

  handleInputKeydown(evt) {
    evt.stopPropagation();
  }

  handleStartSet(evt) {
    this.editId = evt.currentTarget.dataset.id;
    this.newPin = "";
    this.message = "";
  }

  handleCancelSet() {
    this.editId = null;
    this.newPin = "";
  }

  handlePinInput(evt) {
    this.newPin = (evt.target.value || "").replace(/\D/g, "").slice(0, 4);
    evt.target.value = this.newPin;
  }

  async _run(label, fn) {
    this.busy = true;
    try {
      await fn();
       
      console.log("[Workers]", label, "ok");
      this._msg(label + " done.", false);
      this.editId = null;
      this.newPin = "";
      await this.load();
    } catch (e) {
      const m = e.body?.message || "";
       
      console.error("[Workers]", label, "failed", e);
      this._msg(
        m === "WEAK_PIN"
          ? "PIN too easy (like 1234 or 1111). Pick another."
          : label + " failed" + (m ? ": " + m : "."),
        true
      );
    } finally {
      this.busy = false;
    }
  }

  handleSavePin() {
    const workerId = this.editId;
    return this._run("Set PIN", () =>
      setWorkerPin({ token: this.sessionToken, workerId, pin: this.newPin })
    );
  }

  handleClear(evt) {
    const workerId = evt.currentTarget.dataset.id;
    return this._run("Clear PIN", () =>
      clearWorkerPin({ token: this.sessionToken, workerId })
    );
  }

  handleUnlock(evt) {
    const workerId = evt.currentTarget.dataset.id;
    return this._run("Unlock", () =>
      unlockWorker({ token: this.sessionToken, workerId })
    );
  }
}
