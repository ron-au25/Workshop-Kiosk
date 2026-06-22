# Agentforce Chat — Rich Render Blocks

The kiosk chat renders structured "blocks" (KPIs, tables, timelines, charts, calendars,
image carousels) in addition to text. Two ways blocks are produced:

1. **Structured (preferred, Phase 2):** the agent includes a fenced block in its reply:
   ````
   ```agent-blocks
   { "blocks": [ ... ] }
   ```
   ````
   Everything outside the fence stays as normal chat text; the fence is parsed and removed.
   `RenderBlocks.cls` extracts it; `agentRichBlocks` LWC renders it.

2. **Heuristic (works today, no agent change):** `RenderBlocks.cls` auto-detects
   **markdown tables** → `table` block and **"**N. CODE** … Created: <date>" activity lists**
   → `timeline` block. Charts/KPIs/calendar/carousel only come from the structured path.

## Block schema (each entry in `blocks`)

```jsonc
// KPI / metric cards
{ "type":"kpi", "title":"Shift summary",
  "items":[ {"label":"Open WOs","value":12,"unit":""}, {"label":"Avg duration","value":95,"unit":"min"} ] }

// Table
{ "type":"table", "title":"Wagons",
  "columns":["Wagon","Status"], "rows":[ ["RT-100","OK"], ["RT-200","Attention"] ] }

// Timeline
{ "type":"timeline", "title":"Recent activities",
  "events":[ {"title":"SA-00049","date":"Apr 23, 2026","status":"Job Delay","description":"…"} ] }

// Chart — chartType: bar | line | pie | donut
{ "type":"chart", "chartType":"bar", "title":"WOs by status",
  "series":[ {"label":"New","value":8}, {"label":"In Progress","value":5}, {"label":"Done","value":12} ] }

// Calendar — month is "YYYY-MM"
{ "type":"calendar", "title":"April", "month":"2026-04",
  "events":[ {"day":23,"label":"SA-00049"}, {"day":16,"label":"SA-00048"} ] }

// Carousel of cards (with optional image)
{ "type":"carousel", "title":"Assets",
  "cards":[ {"title":"Wagon RT-100","subtitle":"Bogie 2","imageUrl":"https://…","caption":"Last inspected Apr 1"} ] }
```

## Interactive filtering (client-side, no agent round-trip)
The `agentRichBlocks` renderer keeps the raw block data and offers on-block controls that
filter + re-render instantly in the browser — so the user doesn't need a new agent request
just to narrow what's shown:
- **Timeline** — type dropdown (All / Measures / Work Orders), "Last N" count, text search, reset.
- **Table** — text filter across all cells + click a column header to sort (▲/▼), row count.
- **Chart** — click a legend entry to toggle that series off/on (pie/donut re-proportion; bar/line drop it).
- **Carousel** — text filter across card title/subtitle/caption.

The agent can STILL filter server-side when asked (e.g. the timeline action's `maxItems` /
`dateRangeDays` / `eventType` inputs) — useful when the filter changes what data is fetched.
Client-side controls are for quick tweaks on already-returned data; "keep both" by design.

Notes:
- All `value`s in charts/KPIs should be numbers.
- Colors are auto-assigned from the kiosk palette; don't specify them.
- Charts render as inline SVG (no external library) — bar/line/pie/donut.
- `imageUrl` for carousels must be reachable by the kiosk (e.g. a public/CDN URL or
  Salesforce file URL the supervisor can load).
- Keep blocks reasonably small (the panel is ~420px wide); tables scroll horizontally.

## Phase 2 — IMPLEMENTED: agent emits blocks via Apex actions
The Supervisor Agent (`Rio_Tinto_Shutdown_Agent`) now has an **Asset Insights** topic with 8
Apex-backed actions that build the `agent-blocks` fence deterministically and return it in their
`message` output (relayed verbatim by the agent). The kiosk renders them unchanged.

**Apex:** `KioskBlocks.cls` holds all logic (one method per visualization); 8 thin
`@InvocableMethod` wrappers expose them (`AgentActionAssetTimeline`, `AgentActionWorkOrdersByStatus`,
`AgentActionMeasurePointGraph`, `AgentActionWagonCondition`, `AgentActionTimeWorkedVsPlanned`,
`AgentActionMeasureDistribution`, `AgentActionCodeFrequency`, `AgentActionShiftCalendar`) — one
`@InvocableMethod` per class is a hard Salesforce limit. Tests: `KioskBlocksTest` (SeeAllData).

**Bundle:** topic `Asset_Insights` in
`genAiPlannerBundles/Rio_Tinto_Shutdown_Agent/Rio_Tinto_Shutdown_Agent.genAiPlannerBundle`, each action
`invocationTargetType=apex`, with `localActions/Asset_Insights/<Action>/{input,output}/schema.json`.
Each action's `workOrderId` input maps to `currentRecordId` so it uses the work order the kiosk injects.

**Deploy gotcha:** the bundle can't deploy while the agent is **Active** — must
`sf agent deactivate` → deploy → `sf agent activate` (brief service interruption).

**Verified:** raw Named-Credential call "show work orders by status" → KPI + donut blocks with real
counts; "maintenance timeline for this wagon" with current WO → timeline block.

To add MORE visualizations: add a method to `KioskBlocks`, a new wrapper class, a `<localActions>`
entry + `<localActionLinks>` + schema.json folder, then deactivate/deploy/activate.
