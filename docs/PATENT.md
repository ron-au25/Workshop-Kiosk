# Patent Submission — Workshop Kiosk

**Draft provisional patent specification.** This document is written in formal patent-application prose for review by patent counsel prior to filing. Every technical assertion is grounded in the actual implementation in this repository; features that are part of the inventive concept but not yet fully implemented are identified as such in §8 (Reference Implementation Map) so that counsel can decide claim scope accordingly.

The inventive concepts are labelled A–D **in descending order of assessed patentability strength** (strongest first), reconciled with the prior-art search in §3A: **A** asset-component-centric work execution, **B** data-capture-validated time recording, **C** two-tier shared-terminal authentication, **D** trade/skill-filtered presentation.

---

## Title

**System and Method for Asset-Component-Centric Execution of Machine Maintenance Work at a Shared Terminal, with Data-Capture-Validated Time Recording and Sessionless Worker Authentication**

Shorter alternative titles for filing:
- *Asset-Component-Driven Workshop Kiosk with Validated Time Capture*
- *Shared Maintenance Kiosk with Component-Level Work Execution and PIN-Authenticated Worker Sessions*

---

## 1. Field of the Invention

The invention relates to computer-implemented systems for coordinating and recording maintenance work performed on complex physical machines (for example rail wagons, haul trucks, and other heavy equipment) in a workshop environment. More particularly, it relates to a shared touch-screen terminal ("kiosk") that (a) presents maintenance work organized by the physical component of the machine being worked on rather than as a flat list of work orders, (b) records labor time and validates it against the worker's own data-capture activity and the planned duration of the work, (c) authenticates multiple individual workers without requiring each worker to hold a login to the backing enterprise system, and (d) filters the work presented to each worker according to that worker's trade or skill.

## 2. Background

Maintenance of heavy machinery in a workshop typically generates many discrete work orders per machine per visit — inspection tasks, corrective repairs, and condition-driven interventions across multiple engineering disciplines (mechanical, electrical, hydraulic). In existing field-service and enterprise-asset-management systems, these work orders are the primary unit of interaction: a worker is shown a list of work orders assigned to them and interacts with each one individually.

This model has several practical shortcomings on a physical workshop floor:

1. **Work-order-centric rather than machine-centric presentation.** A worker standing at a physical machine thinks in terms of "the machine in front of me and the component I am working on," not in terms of an abstract list of work-order records. A flat work-order list forces the worker to mentally map records back to physical locations on the machine.

2. **Weak, unverified time capture.** Timesheets are commonly entered separately from the work itself, are not tied to the actual data the worker captured, and provide no automatic check that recorded time is plausible given the planned duration of the task or the worker's actual recorded output.

3. **Login friction on shared hardware.** Workshop workers frequently do not each hold an individual named license to the enterprise system, and even where they do, logging in and out of a shared terminal between short tasks is impractical. In practice a single supervisor logs in and workers share that session, which destroys the attribution of work and time to the individual who performed it.

4. **No trade-based filtering.** A worker of a given trade (e.g. a mechanic) is shown work belonging to other trades (electrical, hydraulic) that is irrelevant and potentially unsafe for them to perform, increasing cognitive load and error.

There is a need for a shared workshop terminal that presents work in the physical/component frame in which the worker actually operates, produces time records validated against the worker's own captured data, removes per-worker login friction while preserving individual attribution, and restricts presented work to the worker's trade.

## 3. Summary of the Invention

The invention is a shared workshop kiosk system combining an asset-component-centric work-execution model, data-capture-validated time recording, and a two-tier authentication model, comprising the following inventive concepts (listed strongest-first):

**Concept A — Asset-component-centric work execution.** Instead of presenting a flat list of work orders, the kiosk presents the *machine* as the primary unit and lets the worker drill down through the machine's physical component hierarchy (machine → component → sub-component). Selecting a physical component causes the system to gather, from the work orders that reference that component, the operations, checklist steps, measurements, required parts, forms, and notes that the worker must complete on that component — i.e. the work is retrieved *by physical component* and assembled for execution at the component the worker is physically standing at. The physical asset is the index into the work.

**Concept B — One-tap time capture validated against actual data-capture.** A worker starts and stops labor time against a machine/component with a single tap. The resulting time record is (i) attributed to the individual worker session, and (ii) automatically validated — the recorded duration is checked against the planned duration of the work and against the worker's own actual data-capture submissions (measurements and step completions), producing a validation flag when the recorded time is implausibly short, implausibly long, or diverges materially from plan. Timesheets are auto-generated from the start/stop events and surfaced to the supervisor with per-worker and per-day rollups and the validation flags, so the supervisor can track true progress by worker.

**Concept C — Two-tier authentication: supervisor session establishes station context; workers authenticate sessionlessly by PIN/badge.** A single supervisor authenticates once to the backing enterprise system using full credentials. That supervisor login establishes the *station context* for the kiosk — specifically, the physical location / service territory the terminal serves. Individual workers, who need not (and typically do not) hold any login to the backing system, then start a personal working session on the shared terminal by selecting their roster tile and entering a short personal identifier (a 4-digit PIN) or by scanning a badge. A worker session is represented by a signed, short-lived, cryptographically verifiable token that is held only in the terminal's volatile memory and is presented on, and re-verified before, every subsequent server operation. This preserves per-worker attribution of all work and time on shared hardware without provisioning an enterprise login per worker.

**Concept D — Trade/skill-filtered work presentation.** The operations and data-capture requirements presented to a signed-in worker are filtered by that worker's trade/skill, so that a worker of a given discipline (e.g. mechanical) is shown only the work of that discipline for the selected component and not the work of other disciplines (e.g. electrical or hydraulic) on the same component.

The concepts operate together as an integrated workflow but are also independently claimable, as discussed in §6.

## 3A. Prior-Art Search Results

A WebFetch-based prior-art landscape search was conducted against the Google Patents full-text JSON endpoint and FreePatentsOnline (~35 keyword queries across the four concepts and their combinations; ~16 documents deep-read at the abstract / claim-1 level). This is a landscape screen, not a professional or classification (CPC/IPC) search — its limits are stated at the end of this section. It did not fabricate document numbers; every reference below was retrieved.

**Headline result: no single reference anticipates the integrated A+B+C+D system.** The closest partial references each cover at most one concept.

### Closest references

| Doc # | Title | Assignee | Concept | Closeness |
|---|---|---|---|---|
| **US11164118B2** / **US11182719B2** / US20220414609A1 | Generating / associating work plans / work steps for work orders | **Salesforce.com** | **A** | Adjacent — ML selects work-plan templates (step sets) based on the **asset** referenced by a WO (asset-level, **not** sub-component-level); no physical-component-triggered execution. |
| US20180307192A1 / AU2021202885B2 | Hierarchical smart asset control application development | **Invensys / Schneider** | A | Adjacent-generic — builds apps from an asset hierarchy, but industrial-control config, not WO/step assembly by component selection. |
| **US9396232B2** | Rule-integrated virtual punch clock | **IqOR** | **B** | Adjacent — clock events validated against labor *rules* (breaks/overtime/pay policy), **not** against a WO's planned duration or the worker's own data-capture. |
| **US11716316B2** / **US11991164B2** (family: US20220191186A1, US20230328052A1) | Access to federated identities on a shared kiosk computing device | **Okta, Inc.** | **C** | **Anticipates core mechanics** — shared kiosk shared sequentially among an org's shift workers who lack individual enterprise accounts; admin-provisioned PIN/biometric "kiosk credentials" unlock per-user federated identity; shift/inactivity-based revocation. |
| **US12335255B2** / US20250286874A1 | Secure user authentication with passkeys / dynamically-enrolled tokens on pooled shared devices | **IDmelon Technologies** | **C** | Adjacent-close — badge/RFID/QR scan on shared org hardware → server issues per-user token with shift/time-based auto-expiry. |
| **US20220198474A1** | Optimization of providing technical services | **IBM** | **D** | Adjacent-close — matches technician expertise/skill to filter which *service requests* a technician performs (dispatch-level, not step/field-level within a component's WO). |
| US10887315B2 / US20190387000A1 | Data-and-context-based role membership system | **AT&T** | D | Adjacent — dynamic role-based data/tool-access filtering, built around incident dispatch. |

### Per-concept verdict (strongest-first)

- **A (asset-component-centric assembly) — novel-looking; strongest of the four.** No retrieved reference indexes into work-order content by selecting a *sub-component* in a machine hierarchy. Salesforce/IBM prior art operates at the *asset* level. Subject to the Concept-A caveat below (Maximo / SAP PM / IFS families under-covered).
- **B (validated one-tap time capture) — least crowded in the specific combination.** No single reference validates recorded time against **both** planned duration **and** the worker's own measurement/step-completion submissions, with auto-generated variance-flagged per-worker/per-day timesheets. Generic timesheet and labor-rule patents exist (e.g. IqOR US9396232B2, which validates against labor *policy*, not plan or data-capture) but lack the WO-plan-vs-actual-vs-data-capture cross-validation.
- **C (two-tier auth) — likely-anticipated in core mechanics, not identically claimed.** Okta's kiosk-federation family is squarely on point for "shared device + shift workers with no individual enterprise account + admin-provisioned PIN unlocking a per-user session." It does **not** disclose a *supervisor login that first establishes the terminal's physical station/territory context*, nor a *volatile-only HMAC session token re-verified on every server call and used to attribute shop-floor data capture* (Okta is about SSO into third-party apps). Claim C narrowly around those specifics; do not claim "PIN kiosk login" broadly.
- **D (trade/skill-filtered presentation) — crowded but distinguishable.** The filtering primitive is well established generically and in field-service dispatch (IBM, AT&T). Patentable weight rests on integration with A (filtering *within a single component's assembled step/measure list* by trade), not on the filtering idea itself. Pursue as a dependent claim.

### Integrated-whole verdict

No document combines all four. Closest partials: Salesforce work-plan family (A-adjacent, asset-level), Okta (C only), IBM technician-matching (D only). The four-part integration is the strongest non-obviousness basis, but an examiner could attempt an obviousness combination: a component-hierarchy CMMS/EAM reference (A) + a labor-variance timesheet reference (B) + Okta (C) + IBM skill-matching (D). Standard risk for a multi-element system claim; mitigate by tying the elements together as one ordered, domain-specific method.

### Single closest reference to distinguish over

On the auth concept (the one with genuine anticipation risk): **US11716316B2 / US11991164B2 (Okta).** Distinguish by: (1) supervisor performs an explicit, session-scoped login that establishes the terminal's live physical station/territory context *before* worker PIN entry; (2) the worker's PIN yields a **freshly-issued, server-side, volatile-only HMAC token never stored on the device and re-verified on every call** — not a locally-unlocked, pre-provisioned federated credential; (3) the session's purpose is to **attribute physical-component-indexed maintenance data capture** to the worker, which Okta (SSO into apps) does not contemplate.

### Caveats

WebFetch keyword search, **not** an examiner-grade CPC/IPC classification search (no PatBase / PPUBS / Espacenet). Google Patents' endpoint rate-limited (~50% HTTP 503), so most deep-reads fell back to FreePatentsOnline (weaker extraction). No systematic non-US (EP/JP/CN/KR) or rail-specific coverage. **Concept A coverage is the weakest** — IBM Maximo, SAP PM (functional location/equipment hierarchy), and IFS Cloud families were not exhaustively searched and should be reviewed before relying on the Concept-A novelty read. A professional patentability / freedom-to-operate search remains required before a non-provisional filing.

## 4. Patentability Assessment (self-assessment; not a legal opinion)

Concepts are listed strongest-first, reconciled with the prior-art search in §3A. A professional prior-art search by counsel is still required before filing.

| Concept | Strength | Notes |
|---|---|---|
| **A — Asset-component-centric retrieval of work for execution** | **Strong / defensible** | Retrieving and assembling operations/steps/measures/parts/forms *by physical component of the machine* for on-the-spot execution, drilling the physical asset hierarchy rather than a work-order list, is the core differentiator. Prior art (Salesforce, IBM) operates at the *asset* level, not the sub-component level; no retrieved reference indexes work by component selection. Should anchor the strongest independent method claim. Caveat: Maximo / SAP PM / IFS families under-searched (§3A). |
| **B — Time capture validated against the worker's own data-capture** | **Strong / defensible** | One-tap clock against machine/component is minor alone, but *validating the time record against the same worker's actual measurement/step submissions and against planned duration*, and auto-generating a supervisor-visible timesheet with variance flags, is a specific and non-obvious linkage of time capture to captured maintenance data. Least crowded of the four in the specific combination. Good independent-claim candidate. |
| **C — Two-tier auth (supervisor-establishes-station + sessionless PIN worker tokens)** | **Moderate — real anticipation risk (see §3A)** | The Okta kiosk-federation family (US11716316B2 / US11991164B2) anticipates the core "shared device + shift workers with no individual enterprise account + admin-provisioned PIN unlocking a per-user session." Novelty survives only in the specifics: *supervisor login establishes physical station/territory context first*; *volatile-only HMAC token, never stored on device, re-verified per call*; *token attributes physical-component data capture*. Claim narrowly around those; do **not** claim "PIN kiosk login" broadly. Anchor patentability on the combination with A/B, not C alone. |
| **D — Trade/skill-filtered presentation** | **Moderate** | Role-based filtering of content is broadly known in the abstract (IBM, AT&T). Novelty hook is the specific application: filtering the *component-level operations and data-capture requirements* by the signed-in worker's trade on a shared terminal. Best pursued as a dependent claim on A, not standalone. |
| **A+B+C+D integrated** | **Strongest** | No single prior-art reference anticipates the whole (§3A). The integrated shared-terminal workflow — component-centric assembled work, validated time, station context + sessionless attributed worker, trade filtering — is the most defensible basis for non-obviousness and should anchor independent claim 1. Residual risk = an examiner's obviousness combination (a CMMS asset-hierarchy reference + a labor-variance timesheet + Okta + IBM skill-matching); mitigate by claiming the elements as one ordered, domain-specific method. |

**Recommended filing posture:** file a **provisional** now to secure priority on the integrated system, anchored on **A (component-centric assembly) and B (validated time)** as the spine — the two concepts §3A found most defensibly novel — with C claimed narrowly (per §3A, to clear the Okta family) and D as a dependent claim on A. Then commission a professional CPC-classified search (covering the Concept-A gap: IBM Maximo, SAP PM, IFS families) and file a non-provisional within 12 months with claims tuned to the results.

## 5. Detailed Description

### 5.1 Definitions

- **Backing system.** The enterprise system of record for assets, work orders, and labor (in the reference implementation, a Salesforce Field Service org).
- **Machine / asset.** A top-level physical unit under maintenance (e.g. a rail wagon), having a hierarchy of components and sub-components (in the reference implementation, an `Asset` record with a parent/child hierarchy: machine → component → sub-asset).
- **Work order.** A record describing work to be done, referencing the asset (or a component of it) that the work concerns, and optionally decomposed into work plans, work steps, and line items.
- **Data capture.** Measurements, step completions, codes, and notes recorded by the worker during execution.
- **Station context.** The physical location the terminal serves, modeled as a service territory, established by the supervisor login.
- **Worker session.** A short-lived, signed authentication context for an individual worker on the shared terminal, not backed by an enterprise login.

### 5.2 System architecture

The system comprises:

1. A **shared touch terminal** (e.g. a locked-down tablet in kiosk/guided-access mode) running a client application, positioned at a physical workshop station.
2. A **server component** in the backing system exposing a set of authenticated operations to the client.
3. The backing system's data model: assets in a component hierarchy, work orders referencing assets/components, work plans/steps, measurement records, time records, and worker (service-resource) records carrying a per-worker credential digest and a trade/role attribute.

The client application is a single-page application whose root component owns the session state and a finite state machine governing navigation: from *booting* to *supervisor-required*, then to *roster*, *login*, and thence to the in-session screens (*dashboard*, *work / component execution*, *time tracking*). Only the root holds the worker session token and an idle timer; child screens receive what they need and raise events upward.

### 5.3 Concept A — Asset-component-centric work execution in detail

Rather than presenting the worker with a flat list of work-order records, the terminal presents the **machine** and its **component hierarchy** as the primary navigational frame. In the reference implementation for rail wagons, the worker is shown a diagram of the machine with selectable overlay zones corresponding to physical components (wheelsets), and drills:

1. **Machine** → the top-level asset (the workpack/root work order for the machine, its overall requirements, handover notes, and completion progress).
2. **Component (level 2)** → selecting a physical component anchors the work to that component.
3. **Sub-component (level 3)** → an optional terminal drill to a specific sub-asset.

Upon selecting a component (or sub-component), the system gathers from the **work orders that reference that asset** the material the worker needs to execute the work *at that physical location*: the operations/line items, the work plans and their ordered work steps, the required measurements (measure points), required parts, forms, and notes. In other words, work is retrieved and assembled *by physical component*, keyed on the asset the worker is standing at, rather than the worker navigating a list of work-order numbers. The worker records measurements and step completions against the selected component; measurement records carry the component name, an outcome classification, a typed value, a defect location, comments, and optional photographic evidence.

This inverts the conventional interaction: the physical asset is the index into the work, so the worker's mental model (a machine and its parts) is the system's navigation model.

### 5.4 Concept B — Validated one-tap time capture in detail

**One-tap clock.** A worker clocks on to a machine/component with a single tap. The server, having verified the worker token, creates a time record attributed to the worker (by resolved worker name/identity) against the work order, stamping the start time; it refuses to open a second concurrent open record for the same worker and work order. Clock-off stamps the end time and computes the elapsed duration. No manual time entry is required.

**Validation against plan and against actual data capture.** When time records are assembled for review, each closed record is assigned a validation flag by comparing the recorded duration to:

- an absolute lower bound (implausibly short — e.g. under ten minutes → `SHORT`),
- an absolute upper bound (implausibly long — e.g. over six hours → `LONG`), and
- the **planned duration** of the referenced work order: if the recorded duration diverges from plan beyond a threshold (e.g. more than 50% variance), it is flagged `VARIANCE`.

An open (never-clocked-out) record is itself flagged. Each flag carries a human-readable reason. Because the same worker session is the author of both the time record *and* the component-level data capture (measurements, step completions) of §5.3, the recorded time is validated *against the worker's own actual output* — the system can confirm that a worker who claims time on a component also submitted the measurements/steps that the work on that component required, and can surface a default rejection reason to the supervisor for records that fail validation.

**Auto-generated, supervisor-visible timesheets.** From the start/stop events the system generates timesheets without separate manual entry, aggregated per worker and per day, together with totals, active-session counts, and the validation flags. The supervisor can thereby track true progress by individual worker on shared hardware, review flagged records, and accept or reject them with a pre-populated reason.

### 5.5 Concept C — Two-tier authentication in detail

**Supervisor tier.** The supervisor authenticates to the backing system with full credentials. The system resolves the supervisor's service-resource record and its associated service territory (preferring the primary membership), and adopts that territory as the station context for the terminal. If no service-resource or territory can be resolved, the terminal reports the condition and does not proceed. Guest/unauthenticated access is detected and cleanly rejected.

**Worker tier (sessionless attribution).** For the established station context, the terminal loads a *roster* of eligible workers — the active technician-type service resources that are members of the station's territory — including for each a display name, trade/role label, photo, and any credential-lockout state. A worker begins a session in one of two ways:

- *Roster + PIN:* the worker taps their tile and enters a short personal identifier (a 4-digit PIN).
- *Badge scan:* a hardware badge scanner, captured as a stream of rapid keystrokes terminated by an enter (heuristically distinguished from typing by inter-keystroke timing and length), supplies the worker's identifier directly, and the terminal proceeds to PIN entry without a pre-selected tile.

The submitted PIN is verified against a stored digest. In the reference implementation the digest is computed with a keyed hash (HMAC-SHA256) over a per-worker random salt; the stored value is the salt and the hash, and verification recomputes the hash from the presented PIN and the stored salt. Repeated failures increment a per-worker failure counter and, past a threshold, lock the worker out for a cooldown interval; the lockout state is surfaced on the roster tile.

On successful verification the server issues a **worker session token**: a signed value binding the worker identity, the station/territory, an issued-at time, and an expiry, authenticated by a keyed signature (HMAC) so it cannot be forged or altered by the client. The token is held only in the terminal's volatile memory and never persisted. Every subsequent server operation receives the token and re-verifies it before doing anything; the token has a short sliding time-to-live (extended on activity) and an absolute maximum lifetime, after which the worker must re-authenticate. An idle timer on the terminal ends the session and returns to the roster.

The inventive combination is: *a supervisor login that establishes physical station context, plus individual workers who hold no enterprise login yet obtain individually-attributed, cryptographically-verifiable, volatile-only sessions on the shared terminal.* This yields per-worker attribution of all downstream work and time without per-worker enterprise provisioning.

### 5.6 Concept D — Trade/skill-filtered presentation in detail

Each worker service-resource carries a trade/role attribute (and, in richer deployments, skill records with proficiency levels). The operations and data-capture requirements presented for a selected component are filtered by the signed-in worker's trade, so that, for example, a worker whose trade is mechanical is presented only the mechanical operations, steps, and measurements defined for that component, and is not presented electrical or hydraulic work on the same component. This reduces cognitive load, prevents a worker from being shown work outside their competence or authorization, and — combined with Concept A — means the worker sees exactly the work relevant to *this component, for my trade*. Filtering may be applied at the work-order discipline, the work-plan/step, or the measure-point level, or a combination.

### 5.7 Integrated workflow

In operation: the supervisor logs in once and establishes the station; a worker taps their tile and enters a PIN (or scans a badge) to obtain an attributed volatile session; the worker selects the machine and drills to the physical component they are working on; the system assembles — filtered to the worker's trade — the operations, steps, measurements, parts, and notes for that component from the referencing work orders; the worker taps once to clock on, executes the work capturing measurements and completing steps against the component, and taps once to clock off; the system auto-generates a timesheet, validates the recorded time against plan and against the worker's own captured data, and presents progress and flagged exceptions to the supervisor — all on a single shared terminal, with every action individually attributed, and without provisioning an enterprise login per worker.

An optional embedded conversational assistant, running in the supervisor's backing-system context and injected with the currently-open work-order context, can answer questions and render structured visualizations (KPIs, tables, timelines, charts) computed deterministically from live data; this is an auxiliary feature and not essential to the core claims.

## 6. Draft Claims

> Draft only, for counsel to refine. Claims are ordered strongest-first per §3A/§4. Independent claims: 1 (system, integrated), 8 (method — asset-component-centric assembly, strongest concept A), 12 (method — validated time capture, concept B), 16 (method — worker authentication, concept C). Dependents narrow onto the specific implementation.

**1.** A system for executing machine maintenance work at a shared terminal, comprising: a shared terminal positioned at a physical workshop station and one or more server processors, the server configured to:
(a) present the machine's physical component hierarchy for navigation and, responsive to selection of a component, assemble from work orders referencing that component the operations, steps, measurements, and parts to be executed at that component;
(b) record, against a work order and attributed to a worker, a start time and an end time responsive to single user actions, compute a recorded duration, and assign the recorded duration a validation flag by comparing it to a planned duration of the work order and to data captured by the same worker during execution;
(c) authenticate a supervisor to a backing system of record and, from the supervisor's identity, resolve and adopt a physical station context comprising a service territory for the terminal; present, for the station context, a roster of workers who are members of the station's territory and who do not hold logins to the backing system; and responsive to selection of a worker and receipt of a personal identifier, verify the personal identifier against a stored per-worker credential digest and, on success, issue to the terminal a signed session token binding the worker identity, the station context, and an expiry, the token held only in volatile memory of the terminal and re-verified upon each subsequent operation, the worker of the token being the worker to whom the time record of (b) is attributed; and
(d) filter the operations, steps, and measurements presented for the selected component by a trade attribute of the worker of the session token, such that work of trades other than the worker's is not presented.

*(Concept A — component-centric assembly & execution)*

**2.** The system of claim 1, wherein the physical component hierarchy comprises at least a machine level, a component level, and a sub-component level, and the assembly is keyed on the asset selected at the component or sub-component level.

**3.** The system of claim 1, wherein the assembled material further comprises work plans having ordered work steps, required forms, and notes, and wherein completion progress captured against the component is reflected at the machine level.

**4.** The system of claim 1, wherein a measurement recorded against the selected component carries a component name, an outcome classification, a typed value, a defect location, and optional photographic evidence.

*(Concept B — validated time capture)*

**5.** The system of claim 1, wherein the validation flag indicates one of: a duration below a lower bound; a duration above an upper bound; and a divergence from the planned duration beyond a threshold; and wherein an unterminated record is separately flagged.

**6.** The system of claim 1, wherein the server refuses to create a second concurrent open time record for the same worker and work order, and generates a per-worker, per-day timesheet aggregation from the recorded start and end times without separate manual time entry.

*(Concept C — authentication)*

**7.** The system of claim 1, wherein the personal identifier is a numeric PIN and the stored credential digest comprises a per-worker random salt and a keyed hash of the PIN; the session token is authenticated by a keyed hash over the bound values, has a sliding time-to-live extended on activity and an absolute maximum lifetime, and is never persisted outside the terminal's volatile memory; and repeated failed verifications increment a per-worker counter that, past a threshold, locks the worker for a cooldown interval surfaced on the roster.

---

**8.** A computer-implemented method for component-centric assembly of maintenance work for on-site execution, comprising: presenting, at a terminal positioned at a machine, the machine's physical component hierarchy for navigation; receiving a selection of a physical component of the machine; identifying work orders that reference the selected component; assembling from those work orders the operations, ordered steps, required measurements, required parts, forms, and notes to be executed at the selected component; and presenting the assembled work for execution keyed to the selected physical component rather than as a list of work-order records.

**9.** The method of claim 8, wherein the physical component hierarchy comprises at least a machine level, a component level, and a sub-component level, and the assembly is keyed on the asset selected at the component or sub-component level.

**10.** The method of claim 8, further comprising recording measurements against the selected component, each measurement carrying a component name, an outcome classification, a typed value, a defect location, and optional photographic evidence, and reflecting completion progress at the machine level.

**11.** The method of claim 8, further comprising filtering the assembled operations, steps, and measurements by a trade attribute of a worker signed in to the terminal, such that only work of the worker's trade for the selected component is presented.

---

**12.** A computer-implemented method for validated labor-time capture on a maintenance terminal, comprising: recording, attributed to a worker, a start time and an end time of labor against a work order responsive to single user actions, and computing a recorded duration; and assigning the recorded duration a validation flag by comparison to a planned duration of the work order and to data captured by the same worker during execution of the work order.

**13.** The method of claim 12, wherein the validation flag indicates a duration below a lower bound, a duration above an upper bound, or a divergence from the planned duration beyond a threshold, and an unterminated record is separately flagged, each flag carrying a human-readable reason.

**14.** The method of claim 12, wherein assigning the validation flag comprises confirming that the worker who recorded the time also submitted the measurements or step completions required for the component worked on.

**15.** The method of claim 12, further comprising generating a supervisor-visible timesheet aggregated per worker and per day from the recorded times, annotated with the validation flags and, for a flagged record, a pre-populated rejection reason; and refusing to create a second concurrent open time record for the same worker and work order.

---

**16.** A computer-implemented method for individually-attributed worker sessions on a shared maintenance terminal, comprising: establishing, from a supervisor authentication to a backing system, a physical station context for the terminal; presenting a roster of workers of the station who do not hold logins to the backing system; verifying a personal identifier of a selected worker against a stored per-worker credential digest; issuing, on success, a signed session token bound to the worker identity, the station context, and an expiry, and holding the token only in volatile terminal memory; re-verifying the token on each subsequent operation; and attributing to the worker of the token the maintenance data captured and the labor time recorded at the terminal during the session.

**17.** The method of claim 16, wherein the credential digest comprises a salt and a keyed hash of a numeric PIN, and repeated failures lock the worker for a cooldown interval.

**18.** The method of claim 16, wherein selection of a worker is effected either by selection of a roster tile followed by PIN entry, or by a badge scan detected as a stream of rapid keystrokes distinguished from manual typing by inter-keystroke timing and terminated by an enter event.

**19.** The method of claim 16, wherein the token has a sliding time-to-live and an absolute maximum lifetime, and an idle timer on the terminal ends the session and returns the terminal to the roster.

## 7. Abstract

A shared workshop terminal executes machine maintenance work in the physical frame in which the worker operates. Rather than a flat work-order list, the terminal presents the machine's physical component hierarchy; selecting a component assembles from the work orders referencing it the operations, steps, measurements, parts, forms, and notes to be performed at that component, optionally filtered to the signed-in worker's trade. A worker clocks on and off with single taps; the resulting time record is attributed to the worker and validated against the planned duration and against the worker's own captured measurements and step completions, producing flags for implausibly short, implausibly long, or plan-divergent durations, and auto-generated per-worker/per-day timesheets are presented to the supervisor with the validation flags. Individual worker attribution is achieved without provisioning an enterprise login per worker: a supervisor authenticates once, establishing the terminal's physical station context (service territory); each worker then starts an attributed session by roster-tile-plus-PIN (or badge scan), the server verifying the PIN against a salted keyed-hash digest and issuing a signed, volatile-only session token that is re-verified on every operation and expires on a sliding and absolute schedule.

## 8. Reference Implementation Map

Traceability from each claimed feature to the actual code in this repository, and an honest note of which features are fully implemented versus part of the inventive concept but not yet wired. Verified against the source; nothing here is assumed. Ordered by concept (A–D, strongest-first).

| Feature (concept / claim) | Implemented? | Where |
|---|---|---|
| **A** — Machine → component → sub-component drill (cl. 2, 8, 9) | **Yes** | `assetReview` — `handleSelectWheelset` (level-2 component), `handleSelectChild` (level-3 sub-asset); wagon-diagram overlay zones `ZONE_LAYOUT`. |
| **A** — Assemble operations/steps/measures/parts by component from referencing WOs (cl. 1a, 3, 8, 10) | **Yes** | `getWorkOrderDetail()` returns line items, work plans, ordered work steps, and per-worker time reports; `getMeasurePointsByAsset()` / `getMeasurePoints()` pull measures by asset; `assetReview` records measures with component name, outcome, typed value, defect location, image. |
| **B** — One-tap clock on/off, single open record guard (cl. 1b, 6, 12, 15) | **Yes** | `clockIn()` (rejects `ALREADY_CLOCKED_IN`), `clockOut()` (computes elapsed minutes). |
| **B** — Time validation vs planned duration; SHORT/LONG/VARIANCE + active flag (cl. 1b, 5, 13) | **Yes (vs plan + bounds)** | `getTimeReportDashboard()` / `computeFlag()` / `violationReasonText()` — bounds (<10 min `SHORT`, >360 min `LONG`), `VARIANCE` = >50% off `WorkOrder.DurationInMinutes`. |
| **B** — Time validated specifically against the *same worker's* data-capture submissions (cl. 14, "data captured by the same worker") | **Partial** | Time reports are attributed per worker (`Resource_Name__c`) and measures/steps are captured per component, so the data to cross-check exists and is co-located; the current flag logic validates against **planned duration + absolute bounds**, not yet against a count of the worker's own measure/step submissions. Cross-submission validation is part of the inventive concept — implement before relying on claim 14 as filed, or narrow the claim. |
| **B** — Auto per-worker / per-day timesheets with flags + default rejection reason (cl. 6, 15) | **Yes** | `getTimeReportDashboard()` builds `byEmployee` + `byDay` rollups, totals, active count, flags; `getRejectionDefault()` pre-populates a reason; `updateTimeReport()` / `bulkUpdateTimeReportStatus()` accept/reject. |
| **C** — Supervisor login establishes station/territory context (cl. 1c, 16) | **Yes** | `KioskController.getSupervisorContext()` resolves the supervisor's `ServiceResource` → primary `ServiceTerritoryMember` → territory; rejects guest/unresolved. |
| **C** — Roster of non-login workers for the station (cl. 1c, 16) | **Yes** | `KioskController.getTerritoryRoster(territoryId)` — active technician-type `ServiceResource`s in the territory, with name/role/photo/lockout. |
| **C** — PIN verification against salted keyed-hash digest (cl. 7, 17) | **Yes** | `validateEmployee()` + `verifyPin()`/`hashPin()` (HMAC-SHA256, `SALT||HASH`), stored split `PIN_Salt__c`/`PIN_Hash__c`. |
| **C** — Lockout on repeated failures (cl. 7, 17) | **Yes** | `PIN_Failed_Count__c` / `PIN_Locked_Until__c`; thresholds `PIN_MAX_FAILURES=5`, `PIN_LOCKOUT_MINUTES=15`; surfaced on roster tile. |
| **C** — Signed volatile-only session token, re-verified per call, sliding + absolute TTL (cl. 1c, 7, 19) | **Yes** | Token `base64(workerId\|territoryId\|expiryMs\|issuedAtMs\|hmacSig)`; `validateToken()` called at the head of every `@AuraEnabled` method; `TOKEN_TTL_MINUTES=15`, `TOKEN_MAX_HOURS=8`; held only in `workshopPortal` memory; idle timer + `refreshSession()`. |
| **C** — Badge-scan path (cl. 18) | **Yes** | `workshopPortal.handleGlobalKeydown` HID heuristic (≥4 chars, ≤100ms apart, Enter-terminated) → `barcodeEmployeeId` → LOGIN. |
| **D** — Trade/skill-filtered presentation (cl. 1d, 11) | **Not yet wired — inventive concept** | `ServiceResource.Role__c` exists and is carried into the roster (`RosterMember.role`), but **no code filters** work steps/measures by the signed-in worker's trade — `Role__c` currently only labels the roster tile. This is claimed as part of the invention; it must be implemented (filter `getWorkOrderDetail`/measure queries by worker discipline) before claim 1d/11 can be asserted as reduced to practice. |
| Embedded supervisor assistant (auxiliary, §5.7) | **Yes** | `KioskAgentforceController` + `agentforceChat`/`agentRichBlocks`; runs as supervisor via Agent API, injects current WO context; not part of core claims. |

---

*Prepared for review by patent counsel. Two features material to claims 1d/11 (trade filtering, Concept D) and the "own data-capture" limb of claim 14 (Concept B) are inventive-concept elements not yet fully implemented in code, and are flagged above so counsel can either scope claims to the implemented subset for a provisional filing now, or defer those claims until the features are reduced to practice. A professional prior-art / freedom-to-operate search is recommended before a non-provisional filing.*
