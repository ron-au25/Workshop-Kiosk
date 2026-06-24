import { LightningElement, api, track } from 'lwc';

export default class KioskHeader extends LightningElement {
    @api territoryName;
    @api supervisorName;
    @api workerName;
    @api crewName;
    @api isPortrait = false;

    get hasCrew() {
        return !!(this.crewName && this.crewName.trim());
    }

    @track currentTime = '';
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
        this.currentTime = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: true });
    }

    handleHamburger() {
        this.dispatchEvent(new CustomEvent('hamburger'));
    }
}
