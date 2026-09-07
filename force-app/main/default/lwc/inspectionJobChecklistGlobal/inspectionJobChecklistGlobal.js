import { LightningElement, api, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';

/**
 * Publisher global action only. Embeds inspectionJobChecklist statically.
 * The main bundle must NOT declare lightning__GlobalAction (avoids @salesforce/action issues on LWR).
 */
export default class InspectionJobChecklistGlobal extends LightningElement {
    @api recordId;

    _pageRef;

    @wire(CurrentPageReference)
    wiredPageRef(ref) {
        this._pageRef = ref;
    }

    /**
     * Global actions often omit @api recordId on mobile; try navigation context.
     */
    get effectiveRecordId() {
        if (this.recordId) {
            return this.recordId;
        }
        const a = this._pageRef?.attributes;
        const s = this._pageRef?.state;
        return a?.recordId || s?.recordId || s?.c__recordId;
    }
}