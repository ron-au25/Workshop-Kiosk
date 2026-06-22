/**
 * Server-side bridge between the kiosk LWC and the Agentforce Agent API.
 *
 * The kiosk page runs as the authenticated supervisor SF user, so the agent
 * conversation runs in the supervisor's context. Callouts go through the
 * `Agentforce_API` Named Credential (OAuth client-credentials), so no token or
 * secret ever reaches the browser.
 *
 * Agent API (see developer.salesforce.com "Agent API"):
 *   POST   /einstein/ai-agent/v1/agents/{agentId}/sessions
 *   POST   /einstein/ai-agent/v1/sessions/{sessionId}/messages
 *   DELETE /einstein/ai-agent/v1/sessions/{sessionId}
 */
public with sharing class KioskAgentforceController {

    // Baseline "Supervisor Agent" (Rio_Tinto_Shutdown_Agent). 18-char Bot id.
    @TestVisible private static final String AGENT_ID = '0XxIg0000008SDSKA2';
    @TestVisible private static final String NC = 'callout:Agentforce_API';
    private static final String API_BASE = '/einstein/ai-agent/v1';

    // ---- DTOs returned to the LWC ------------------------------------------

    public class AgentSession {
        @AuraEnabled public String sessionId;
        @AuraEnabled public String greeting;   // agent's opening message, if any
    }

    public class AgentReply {
        @AuraEnabled public String text;        // concatenated agent message text
        @AuraEnabled public Integer nextSeq;    // sequence id the LWC should send next
        @AuraEnabled public String blocksJson;  // optional rich render-blocks (JSON array string)
    }

    // ---- Public API --------------------------------------------------------

    @AuraEnabled
    public static AgentSession startSession() {
        // A fresh, unique external key per session (no Math.random / Crypto needed for uniqueness here).
        String externalKey = 'kiosk-' + String.valueOf(System.now().getTime())
            + '-' + UserInfo.getUserId().substring(0, 15);

        Map<String, Object> body = new Map<String, Object>{
            'externalSessionKey' => externalKey,
            'instanceConfig' => new Map<String, Object>{
                'endpoint' => Url.getOrgDomainUrl().toExternalForm()
            },
            // Run as the logged-in supervisor (not the agent's assigned user).
            'bypassUser' => false,
            'variables' => new List<Object>()
        };

        HttpResponse res = doCallout(
            'POST',
            API_BASE + '/agents/' + AGENT_ID + '/sessions',
            JSON.serialize(body),
            null
        );
        Map<String, Object> parsed = parseOrThrow(res);

        AgentSession out = new AgentSession();
        out.sessionId = (String) parsed.get('sessionId');
        out.greeting = firstMessageText(parsed);
        if (String.isBlank(out.sessionId)) {
            throw new AuraHandledException('AGENT_SESSION_FAILED');
        }
        return out;
    }

    @AuraEnabled
    public static AgentReply sendMessage(String sessionId, String text, Integer sequenceId, String workOrderId) {
        if (String.isBlank(sessionId)) throw new AuraHandledException('NO_SESSION');
        Integer seq = (sequenceId == null) ? 1 : sequenceId;

        // The user can switch work orders mid-conversation, so the current one is
        // resolved and attached on EVERY message (not just at session start).
        String woContext = workOrderContext(workOrderId);
        String userText = (text == null ? '' : text);
        String sentText = String.isBlank(woContext) ? userText : (woContext + '\n\n' + userText);

        Map<String, Object> body = new Map<String, Object>{
            'message' => new Map<String, Object>{
                'sequenceId' => seq,
                'type' => 'Text',
                'text' => sentText
            },
            // Also sent as a variable so the agent can bind it directly once a
            // "Current_Work_Order" API-settable variable is declared (Phase 2).
            'variables' => workOrderVariables(workOrderId)
        };

        HttpResponse res = doCallout(
            'POST',
            API_BASE + '/sessions/' + EncodingUtil.urlEncode(sessionId, 'UTF-8') + '/messages',
            JSON.serialize(body),
            null
        );
        Map<String, Object> parsed = parseOrThrow(res);

        AgentReply out = new AgentReply();
        String full = allMessageText(parsed);
        // Split any structured render-blocks out of the text so the LWC can
        // render charts/tables/etc; the remaining prose stays in `text`.
        BlockExtraction ex = RenderBlocks.extract(full);
        out.text = ex.text;
        out.blocksJson = ex.blocksJson;
        out.nextSeq = seq + 1;
        return out;
    }

    public class BlockExtraction {
        public String text;
        public String blocksJson;
    }

    // ---- Work order context ------------------------------------------------

    /**
     * Resolves a human-readable description of the currently-selected work order
     * for the agent to ground on. Returns '' when no work order is selected.
     */
    private static String workOrderContext(String workOrderId) {
        WorkOrder wo = fetchWorkOrder(workOrderId);
        if (wo == null) return '';
        List<String> bits = new List<String>();
        if (String.isNotBlank(wo.WorkOrderNumber)) bits.add('Number ' + wo.WorkOrderNumber);
        if (String.isNotBlank(wo.External_ID__c)) bits.add('Ref ' + wo.External_ID__c);
        if (String.isNotBlank(wo.Subject)) bits.add('Subject: ' + wo.Subject);
        if (String.isNotBlank(wo.Status)) bits.add('Status: ' + wo.Status);
        if (String.isNotBlank(wo.Wagon_Number__c)) bits.add('Wagon: ' + wo.Wagon_Number__c);
        return '[Context — the user is currently viewing Work Order ' + wo.Id
            + ' (' + String.join(bits, '; ') + '). Use this work order when the question is about "this" / "the current" work order.]';
    }

    private static List<Object> workOrderVariables(String workOrderId) {
        WorkOrder wo = fetchWorkOrder(workOrderId);
        if (wo == null) return new List<Object>();
        return new List<Object>{
            new Map<String, Object>{ 'name' => 'Current_Work_Order_Id', 'type' => 'Text', 'value' => wo.Id },
            new Map<String, Object>{ 'name' => 'Current_Work_Order', 'type' => 'Text', 'value' => workOrderContext(workOrderId) }
        };
    }

    private static WorkOrder fetchWorkOrder(String workOrderId) {
        if (String.isBlank(workOrderId)) return null;
        Id woId;
        try {
            woId = Id.valueOf(workOrderId);
        } catch (Exception e) {
            return null; // not a valid id
        }
        if (woId.getSobjectType() != WorkOrder.SObjectType) return null;
        List<WorkOrder> wos = [
            SELECT Id, WorkOrderNumber, Subject, Status, Wagon_Number__c, External_ID__c
            FROM WorkOrder
            WHERE Id = :woId
            WITH USER_MODE
            LIMIT 1
        ];
        return wos.isEmpty() ? null : wos[0];
    }

    @AuraEnabled
    public static void endSession(String sessionId) {
        if (String.isBlank(sessionId)) return;
        doCallout(
            'DELETE',
            API_BASE + '/sessions/' + EncodingUtil.urlEncode(sessionId, 'UTF-8'),
            null,
            new Map<String, String>{ 'x-session-end-reason' => 'UserRequest' }
        );
    }

    // ---- Internals ---------------------------------------------------------

    private static HttpResponse doCallout(String method, String path, String body, Map<String, String> extraHeaders) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(NC + path);
        req.setMethod(method);
        req.setTimeout(120000);
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('Accept', 'application/json');
        if (extraHeaders != null) {
            for (String k : extraHeaders.keySet()) req.setHeader(k, extraHeaders.get(k));
        }
        if (body != null) req.setBody(body);
        return new Http().send(req);
    }

    @SuppressWarnings('PMD.ApexSuggestUsingNamedCred')
    private static Map<String, Object> parseOrThrow(HttpResponse res) {
        Integer code = res.getStatusCode();
        if (code < 200 || code >= 300) {
            System.debug(LoggingLevel.ERROR, 'Agent API ' + code + ': ' + res.getBody());
            throw new AuraHandledException('AGENT_API_ERROR_' + code);
        }
        Object o = JSON.deserializeUntyped(res.getBody());
        return (o instanceof Map<String, Object>) ? (Map<String, Object>) o : new Map<String, Object>();
    }

    /** The agent's first message text from a session/start or message response. */
    private static String firstMessageText(Map<String, Object> parsed) {
        List<Object> msgs = messages(parsed);
        for (Object m : msgs) {
            String t = textOf(m);
            if (String.isNotBlank(t)) return t;
        }
        return null;
    }

    /** All agent message text concatenated (handles multi-part replies). */
    private static String allMessageText(Map<String, Object> parsed) {
        List<String> parts = new List<String>();
        for (Object m : messages(parsed)) {
            String t = textOf(m);
            if (String.isNotBlank(t)) parts.add(t);
        }
        return String.join(parts, '\n\n');
    }

    @SuppressWarnings('PMD')
    private static List<Object> messages(Map<String, Object> parsed) {
        Object m = parsed.get('messages');
        return (m instanceof List<Object>) ? (List<Object>) m : new List<Object>();
    }

    private static String textOf(Object m) {
        if (!(m instanceof Map<String, Object>)) return null;
        Map<String, Object> msg = (Map<String, Object>) m;

        List<String> parts = new List<String>();
        Object t = msg.get('message');
        if (t != null && String.isNotBlank(String.valueOf(t))) {
            parts.add(String.valueOf(t));
        }

        // Action outputs (tables, summaries) live in result[].value.summary —
        // the agent's plain "message" is only an intro sentence, so append these.
        Object resObj = msg.get('result');
        if (resObj instanceof List<Object>) {
            for (Object r : (List<Object>) resObj) {
                String rt = resultText(r);
                if (String.isNotBlank(rt)) parts.add(rt);
            }
        }
        return parts.isEmpty() ? null : String.join(parts, '\n\n');
    }

    /** Pull human-readable text out of an action result entry. */
    @SuppressWarnings('PMD')
    private static String resultText(Object r) {
        if (!(r instanceof Map<String, Object>)) return null;
        Object v = ((Map<String, Object>) r).get('value');
        if (!(v instanceof Map<String, Object>)) return null;
        Map<String, Object> val = (Map<String, Object>) v;

        // Different actions use different keys for their displayable output
        // (summary, recordSummary, message, …). Prefer known keys, then fall
        // back to the longest string value in the map.
        for (String key : new List<String>{ 'summary', 'recordSummary', 'message', 'text', 'response', 'result' }) {
            Object o = val.get(key);
            if (o != null && String.isNotBlank(String.valueOf(o))) {
                return stripHtml(String.valueOf(o));
            }
        }
        String best = null;
        for (Object o : val.values()) {
            if (o instanceof String && String.isNotBlank((String) o)) {
                String sVal = (String) o;
                if (best == null || sVal.length() > best.length()) best = sVal;
            }
        }
        return best == null ? null : stripHtml(best);
    }

    /** Convert the simple HTML some actions emit into plain text the chat can render. */
    private static String stripHtml(String html) {
        if (String.isBlank(html)) return html;
        String s = html;
        // Block elements -> line breaks before tags are stripped.
        s = s.replaceAll('(?i)</p>', '\n\n');
        s = s.replaceAll('(?i)<br\\s*/?>', '\n');
        s = s.replaceAll('(?i)</li>', '\n');
        s = s.replaceAll('(?i)<li[^>]*>', '• ');
        // Keep bold emphasis as markdown so the LWC bolds it.
        s = s.replaceAll('(?i)</?(strong|b)>', '**');
        // Drop all remaining tags (anchors, p, em, etc.).
        s = s.replaceAll('<[^>]+>', '');
        // Decode the few entities that show up.
        s = s.replace('&nbsp;', ' ').replace('&amp;', '&')
             .replace('&lt;', '<').replace('&gt;', '>').replace('&#39;', '\'').replace('&quot;', '"');
        // Collapse 3+ newlines.
        s = s.replaceAll('\n{3,}', '\n\n');
        return s.trim();
    }
}
