# Agentforce on the Kiosk — Setup Guide (Phase 1)

Embeds the **Supervisor Agent** (`Rio_Tinto_Shutdown_Agent`, Bot id `0XxIg0000008SDSKA2`)
as a chat panel on the kiosk page, running as the authenticated **supervisor** SF user via
the Agentforce **Agent API**.

## What was deployed (code)
- `KioskAgentforceController.cls` (+ test) — `startSession` / `sendMessage` / `endSession`,
  callouts via the `Agentforce_API` named credential. Runs as the supervisor.
- `agentforceChat` LWC — floating launcher + slide-in chat panel.
- Wired into `workshopPortal` (floats over all in-app screens; conversation resets on
  worker switch / idle logout).
- `Agentforce_API` **External Credential** (shell) deployed.
- Permission set grants `KioskAgentforceController` + the EC principal.

## ✅ STATUS: Phase 1 plumbing VERIFIED WORKING (full start→send→end round-trip, HTTP 200,
via the Named Credential — the exact path the kiosk uses).

## Manual setup the admin must do ONCE (can't be scripted — OAuth secrets)

> We used an **External Client App** ("Workshop Client App"). An Auth Provider is NOT needed —
> the External Credential's client-credentials flow holds the key/secret directly.

### 1. External Client App "Workshop Client App"
Setup → **External Client App Manager → New** → **Settings → OAuth**:
- Enable OAuth. Callback URL: any My Domain URL (unused by client-credentials).
- OAuth scopes: **Manage user data via APIs (api)**, **Access chatbot services (chatbot_api)**,
  **Access the Salesforce API Platform (sfap_api)**.
- ✅ **Enable Client Credentials Flow**
- ✅ **Issue JSON Web Token (JWT)-based access tokens** ← REQUIRED. The Agent API gateway
  (`api.salesforce.com`) only accepts JWT tokens; without this you get an empty **HTTP 404**.
- ☐ Deselect: Require secret for Web Server Flow, Require secret for Refresh Token Flow, Require PKCE.
- **Policies** tab: **Permitted Users = Admin approved users are pre-authorized**, and
  **Run As = `ron@rsfieldnov25.demo`** (the supervisor; needs the Workshop Kiosk Supervisor perm set).
- From **Settings → OAuth → Consumer Key and Secret**, copy the **Consumer Key** + **Consumer Secret**.

### 2. External Credential `Agentforce_API`
Setup → **Named Credentials → External Credentials → Agentforce API** → Edit:
- **Authentication Protocol = OAuth 2.0**, Flow Type **Client Credentials**.
- Token endpoint: `https://trailsignup-228d369ace5da9.my.salesforce.com/services/oauth2/token`
- **Scope: LEAVE EMPTY** ← the token endpoint rejects a `scope` param (`invalid_request: scope
  parameter not supported`). Scopes come from the ECA itself.
- Under **Principals → New**, name **`KioskAgentPrincipal`**, paste **Consumer Key + Secret**, scope empty. Save.
- **Principal Access**: map the principal to the **Workshop Kiosk Supervisor** permission set
  (the deployed perm set already grants `Agentforce_API-KioskAgentPrincipal`).

### 3. Named Credential `Agentforce_API`  (DONE — exists in org)
URL `https://api.salesforce.com`, External Credential = Agentforce API, Generate Auth Header ✅.

### 4. Confirm the agent is Active
Agent Builder → **Supervisor Agent** must be **Active** (it is — "Version 1 Active"). The
"Connections" tab (Agentforce Chat / Messaging) is NOT required for the REST Agent API.

### ⚠️ Gotchas we hit (so you don't re-debug)
- **Empty HTTP 404** from the API = token isn't a JWT. Enable "Issue JWT" on the ECA (step 1).
- **`invalid_request: scope parameter not supported`** = clear the Scope field on the EC (step 2).
- **`invalid_app_access`** = set Permitted Users + Run-As on the ECA Policies tab (step 1).
- **`Invalid user ID on start session`** = `bypassUser` must be **false** (agent has no assigned
  user; run as the token's user). The Apex already sends `bypassUser:false`.
- **EC caches the token for 8h** — if you change ECA settings, the old (e.g. opaque) token is reused.
  Force a fresh mint by **deleting & recreating the principal** (same name `KioskAgentPrincipal`),
  then re-map Principal Access / re-deploy the perm set.
- First callout after recreating the principal may **read-time-out once**; just retry.

## Smoke test (after manual setup)
Anonymous Apex:
```apex
KioskAgentforceController.AgentSession s = KioskAgentforceController.startSession();
System.debug('sessionId=' + s.sessionId + ' greeting=' + s.greeting);
KioskAgentforceController.AgentReply r =
    KioskAgentforceController.sendMessage(s.sessionId, 'Summarise my open work orders', 1);
System.debug('reply=' + r.text);
KioskAgentforceController.endSession(s.sessionId);
```
A non-null `sessionId` proves OAuth + Named Credential + agent connection all work.
Then open the kiosk as supervisor, tap the 💬 launcher, and chat.

## Endpoints used (Agent API)
- `POST   {api.salesforce.com}/einstein/ai-agent/v1/agents/{agentId}/sessions`
- `POST   {api.salesforce.com}/einstein/ai-agent/v1/sessions/{sessionId}/messages`
- `DELETE {api.salesforce.com}/einstein/ai-agent/v1/sessions/{sessionId}` (header `x-session-end-reason`)

## Phase 2 (next)
Extend `Rio_Tinto_Shutdown_Agent` with **Workpack** and **Wagon** topics/actions
(reuse `WorkpackPdfProcessor`, `WorkpackExtraction` / `RS_SFS_Maintainer_Work_Order_Brief`
prompt templates, and `KioskController` queries wrapped as `@InvocableMethod` actions).
