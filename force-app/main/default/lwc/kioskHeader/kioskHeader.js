import { LightningElement, api, track } from 'lwc';

export default class KioskHeader extends LightningElement {
    @api territoryName;
    @api supervisorName;
    @api workerName;
    @api crewName;
    @api clockStartMs = null;   // epoch ms of the active clock-in; null = not clocked in
    @api isPortrait = false;

    get hasCrew() {
        return !!(this.crewName && this.crewName.trim());
    }

    get isClocked() {
        return !!this.clockStartMs;
    }

    @track currentTime = '';
    @track clockElapsed = '00:00:00';
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
        if (this.clockStartMs) {
            let secs = Math.floor((now.getTime() - this.clockStartMs) / 1000);
            if (secs < 0) secs = 0;
            const h = Math.floor(secs / 3600);
            const m = Math.floor((secs % 3600) / 60);
            const s = secs % 60;
            const pad = (n) => String(n).padStart(2, '0');
            this.clockElapsed = `${pad(h)}:${pad(m)}:${pad(s)}`;
        } else {
            this.clockElapsed = '00:00:00';
        }
    }

    handleHamburger() {
        this.dispatchEvent(new CustomEvent('hamburger'));
    }
}
