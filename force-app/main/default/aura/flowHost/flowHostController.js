({
    // Message from an LWC asking to launch a flow.
    handleMessage: function (component, message, helper) {
        var payload = message.getParams ? message.getParams() : message;
        if (!payload || payload.messageType !== 'open') {
            return;
        }

        component.set('v.flowApiName', payload.flowApiName);
        component.set('v.requestId', payload.requestId);
        component.set('v.status', 'cancel');

        var inputs = [];
        if (payload.recordId) {
            inputs.push({ name: 'recordId', type: 'String', value: payload.recordId });
        }
        component.set('v.flowInputs', inputs);
        component.set('v.showModal', true);

        // The lightning:flow component renders this tick; start it next frame.
        window.setTimeout($A.getCallback(function () {
            var flow = component.find('flowRuntime');
            if (flow) {
                flow.startFlow(payload.flowApiName, inputs);
            }
        }), 0);
    },

    // Flow runtime lifecycle.
    handleFlowStatusChange: function (component, event, helper) {
        var status = event.getParam('status');
        if (status === 'FINISHED' || status === 'FINISHED_SCREEN') {
            component.set('v.status', 'success');
            helper.closeAndReport(component);
        }
    },

    // X button or backdrop cancel.
    handleCancel: function (component, event, helper) {
        component.set('v.status', 'cancel');
        helper.closeAndReport(component);
    }
})
