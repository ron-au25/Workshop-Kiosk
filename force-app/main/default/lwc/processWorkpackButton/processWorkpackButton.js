import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { CloseActionScreenEvent } from 'lightning/actions';
import processLatestPdf from '@salesforce/apex/WorkpackPdfProcessor.processLatestPdf';

export default class ProcessWorkpackButton extends LightningElement {
    @api recordId;
    isLoading = false;

    handleClick() {
        this.isLoading = true;
        processLatestPdf({ workOrderId: this.recordId })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Processing started',
                    message: 'The PDF is being processed in the background. Child Work Orders will appear shortly.',
                    variant: 'success'
                }));
                this.dispatchEvent(new CloseActionScreenEvent());
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Error',
                    message: error.body ? error.body.message : error.message,
                    variant: 'error',
                    mode: 'sticky'
                }));
                this.isLoading = false;
            });
    }
}
