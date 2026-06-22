@IsTest
private class KioskAgentforceControllerTest {

    private static String lastSentBody;

    private class AgentMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            if (req.getMethod() == 'POST' && req.getEndpoint().endsWith('/messages')) {
                lastSentBody = req.getBody();
            }
            HttpResponse res = new HttpResponse();
            res.setHeader('Content-Type', 'application/json');
            if (req.getMethod() == 'DELETE') {
                res.setStatusCode(204);
                return res;
            }
            res.setStatusCode(200);
            if (req.getEndpoint().endsWith('/sessions')) {
                res.setBody(JSON.serialize(new Map<String, Object>{
                    'sessionId' => 'sess-123',
                    'messages' => new List<Object>{
                        new Map<String, Object>{ 'type' => 'Inform', 'message' => 'Hi, how can I help?' }
                    }
                }));
            } else {
                res.setBody(JSON.serialize(new Map<String, Object>{
                    'messages' => new List<Object>{
                        new Map<String, Object>{ 'type' => 'Inform', 'message' => 'You have 3 open work orders.' }
                    }
                }));
            }
            return res;
        }
    }

    private class ErrorMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(500);
            res.setBody('{"error":"boom"}');
            return res;
        }
    }

    @IsTest
    static void startSession_returnsSessionAndGreeting() {
        Test.setMock(HttpCalloutMock.class, new AgentMock());
        Test.startTest();
        KioskAgentforceController.AgentSession s = KioskAgentforceController.startSession();
        Test.stopTest();
        System.assertEquals('sess-123', s.sessionId, 'sessionId parsed');
        System.assertEquals('Hi, how can I help?', s.greeting, 'greeting parsed');
    }

    @IsTest
    static void sendMessage_returnsReplyAndIncrementsSeq() {
        Test.setMock(HttpCalloutMock.class, new AgentMock());
        Test.startTest();
        KioskAgentforceController.AgentReply r =
            KioskAgentforceController.sendMessage('sess-123', 'how many work orders?', 1, null);
        Test.stopTest();
        System.assertEquals('You have 3 open work orders.', r.text, 'reply text');
        System.assertEquals(2, r.nextSeq, 'seq incremented');
    }

    @IsTest
    static void endSession_noThrow() {
        Test.setMock(HttpCalloutMock.class, new AgentMock());
        Test.startTest();
        KioskAgentforceController.endSession('sess-123');
        KioskAgentforceController.endSession(null); // no-op path
        Test.stopTest();
    }

    @IsTest
    static void sendMessage_blankSession_throws() {
        Boolean threw = false;
        try {
            KioskAgentforceController.sendMessage('', 'hi', 1, null);
        } catch (AuraHandledException e) {
            threw = true;
        }
        System.assert(threw, 'blank session should throw');
    }

    // SeeAllData: a broken org Flow trigger ("SDO SFS Attach Forms On Create")
    // blocks WorkOrder inserts, so we use an existing org record — same approach
    // as KioskControllerTest (see CLAUDE.md).
    @IsTest(SeeAllData=true)
    static void sendMessage_injectsWorkOrderContext() {
        List<WorkOrder> existing = [SELECT Id FROM WorkOrder LIMIT 1];
        if (existing.isEmpty()) return; // nothing to assert against in this org

        Test.setMock(HttpCalloutMock.class, new AgentMock());
        Test.startTest();
        KioskAgentforceController.sendMessage('sess-123', 'what is wrong with this wagon?', 1, existing[0].Id);
        Test.stopTest();

        System.assertNotEquals(null, lastSentBody, 'request captured');
        System.assert(lastSentBody.contains(existing[0].Id), 'work order id injected into message');
        System.assert(lastSentBody.contains('Current_Work_Order'), 'work order variable injected');
    }

    @IsTest
    static void apiError_throws() {
        Test.setMock(HttpCalloutMock.class, new ErrorMock());
        Boolean threw = false;
        Test.startTest();
        try {
            KioskAgentforceController.startSession();
        } catch (AuraHandledException e) {
            threw = true;
        }
        Test.stopTest();
        System.assert(threw, 'non-2xx should throw');
    }
}
