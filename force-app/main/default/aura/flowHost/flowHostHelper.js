({
    // Tear down the modal and publish the outcome back to the requesting LWC.
    closeAndReport: function (component) {
        var status = component.get('v.status');
        var requestId = component.get('v.requestId');

        component.set('v.showModal', false);
        component.set('v.flowApiName', null);
        component.set('v.flowInputs', null);

        var channel = component.find('flowChannel');
        if (channel) {
            channel.publish({
                messageType: 'result',
                requestId: requestId,
                status: status
            });
        }

        component.set('v.requestId', null);
    }
})
