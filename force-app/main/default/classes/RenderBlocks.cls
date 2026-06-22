/**
 * Extracts rich "render blocks" from an agent reply for the kiosk chat to display
 * as KPIs, tables, timelines, charts, calendars, and image carousels.
 *
 * Hybrid strategy:
 *  1. STRUCTURED (Phase 2): if the agent emits a fenced ```agent-blocks { "blocks":[...] } ```
 *     block, use it verbatim. This is the reliable long-term path.
 *  2. HEURISTIC (works today): otherwise parse the prose — markdown tables become
 *     `table` blocks, and "**N. CODE** … Created: <date>" activity lists become a
 *     `timeline`. Charts/calendars/carousels only come from the structured path.
 *
 * Block schema (JSON), each entry in `blocks`:
 *   { "type":"kpi", "title?":..., "items":[{"label":..,"value":..,"unit?":..}] }
 *   { "type":"table", "title?":.., "columns":["A","B"], "rows":[["1","2"], ...] }
 *   { "type":"timeline", "title?":.., "events":[{"title":..,"date":..,"description?":..,"status?":..}] }
 *   { "type":"chart", "chartType":"bar|line|pie|donut", "title?":..,
 *       "series":[{"label":..,"value":..}] }
 *   { "type":"calendar", "title?":.., "month":"2026-04", "events":[{"day":23,"label":..}] }
 *   { "type":"carousel", "title?":.., "cards":[{"title":..,"subtitle?":..,"imageUrl?":..,"caption?":..}] }
 */
public with sharing class RenderBlocks {

    private static final String FENCE_OPEN = '```agent-blocks';
    private static final String FENCE = '```';

    public static KioskAgentforceController.BlockExtraction extract(String full) {
        KioskAgentforceController.BlockExtraction out = new KioskAgentforceController.BlockExtraction();
        out.text = full;
        out.blocksJson = null;
        if (String.isBlank(full)) return out;

        // 1) Structured fenced block from the agent.
        Integer open = full.indexOf(FENCE_OPEN);
        if (open >= 0) {
            Integer jsonStart = open + FENCE_OPEN.length();
            Integer close = full.indexOf(FENCE, jsonStart);
            if (close > jsonStart) {
                String fenced = full.substring(jsonStart, close).trim();
                List<Object> blocks = safeBlocks(fenced);
                if (blocks != null && !blocks.isEmpty()) {
                    String prose = (full.substring(0, open) + full.substring(close + FENCE.length())).trim();
                    out.text = prose;
                    out.blocksJson = JSON.serialize(blocks);
                    return out;
                }
            }
        }

        // 2) Heuristic parse of prose.
        List<Object> derived = new List<Object>();
        Object tbl = parseMarkdownTable(full);
        if (tbl != null) derived.add(tbl);
        Object tl = parseActivityTimeline(full);
        if (tl != null) derived.add(tl);

        if (!derived.isEmpty()) {
            out.blocksJson = JSON.serialize(derived);
        }
        return out;
    }

    /** Returns the `blocks` array from a structured JSON envelope, or null. */
    @SuppressWarnings('PMD.EmptyCatchBlock')
    private static List<Object> safeBlocks(String rawJson) {
        try {
            Object o = JSON.deserializeUntyped(rawJson);
            if (o instanceof Map<String, Object>) {
                Object b = ((Map<String, Object>) o).get('blocks');
                if (b instanceof List<Object>) return (List<Object>) b;
            } else if (o instanceof List<Object>) {
                return (List<Object>) o;  // tolerate a bare array
            }
        } catch (Exception e) {
            // not valid JSON — fall through to heuristics
        }
        return null;
    }

    // ---- Heuristic: markdown table -> table block --------------------------

    private static Object parseMarkdownTable(String text) {
        List<String> rows = new List<String>();
        for (String line : text.split('\n')) {
            String t = line.trim();
            if (t.startsWith('|') && t.endsWith('|') && t.length() > 2) rows.add(t);
        }
        if (rows.size() < 2) return null; // need header + at least one row

        List<String> columns = splitRow(rows[0]);
        // Row 1 is the markdown separator (---|---); skip it if it looks like one.
        Integer firstData = isSeparatorRow(rows[1]) ? 2 : 1;
        List<Object> dataRows = new List<Object>();
        for (Integer i = firstData; i < rows.size(); i++) {
            List<String> cells = splitRow(rows[i]);
            if (!cells.isEmpty()) dataRows.add(cells);
        }
        if (columns.isEmpty() || dataRows.isEmpty()) return null;

        return new Map<String, Object>{
            'type' => 'table',
            'columns' => columns,
            'rows' => dataRows
        };
    }

    private static List<String> splitRow(String row) {
        String body = row.trim();
        if (body.startsWith('|')) body = body.substring(1);
        if (body.endsWith('|')) body = body.substring(0, body.length() - 1);
        List<String> cells = new List<String>();
        for (String c : body.split('\\|')) cells.add(c.trim());
        return cells;
    }

    private static Boolean isSeparatorRow(String row) {
        return Pattern.matches('^\\|?[\\s:\\-\\|]+\\|?$', row.trim());
    }

    // ---- Heuristic: activity list -> timeline block ------------------------
    // Matches the "Recent Shutdown Activities" style:
    //   **1. SA-00049** - Job Delay
    //      📝 ...desc...
    //      📅 Created: Apr 23, 2026 14:38

    private static Object parseActivityTimeline(String text) {
        Pattern header = Pattern.compile('(?m)^\\s*\\*\\*\\d+\\.\\s*([^*]+?)\\*\\*\\s*-?\\s*(.*)$');
        Matcher m = header.matcher(text);
        List<Object> events = new List<Object>();
        List<Integer> starts = new List<Integer>();
        List<String> titles = new List<String>();
        List<String> types = new List<String>();
        while (m.find()) {
            starts.add(m.start());
            titles.add(m.group(1).trim());
            types.add(m.group(2) == null ? '' : m.group(2).trim());
        }
        if (titles.size() < 2) return null; // not really a list

        for (Integer i = 0; i < titles.size(); i++) {
            Integer segStart = starts[i];
            Integer segEnd = (i + 1 < starts.size()) ? starts[i + 1] : text.length();
            String seg = text.substring(segStart, segEnd);
            events.add(new Map<String, Object>{
                'title' => titles[i],
                'status' => types[i],
                'date' => firstMatch(seg, 'Created:\\s*(.+)'),
                'description' => firstMatch(seg, '📝\\s*(.+)')
            });
        }
        return new Map<String, Object>{
            'type' => 'timeline',
            'events' => events
        };
    }

    private static String firstMatch(String text, String regex) {
        Matcher m = Pattern.compile(regex).matcher(text);
        if (m.find()) return m.group(1).trim();
        return null;
    }
}
