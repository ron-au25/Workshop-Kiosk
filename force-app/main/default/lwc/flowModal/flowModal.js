import { api } from 'lwc';
import LightningModal from 'lightning/modal';

export default class FlowModal extends LightningModal {
    @api flowApiName;
    @api workStepId;
    @api siteBaseUrl;

    get flowUrl() {
        const base = this.siteBaseUrl || window.location.origin;
        const params = new URLSearchParams();
        if (this.workStepId) params.set('recordId', this.workStepId);
        params.set('retURL', '/');
        const flowPath = (this.flowApiName || '').replace(/_/g, '-');
        return `${base}/${flowPath}?${params.toString()}`;
    }

    handleComplete() {
        this.close('success');
    }

    handleCancel() {
        this.close('cancel');
    }
}
