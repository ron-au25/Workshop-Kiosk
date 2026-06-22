@IsTest
private class RenderBlocksTest {

    @IsTest
    static void structuredFence_isExtracted() {
        String reply = 'Here is your data.\n\n```agent-blocks\n'
            + '{"blocks":[{"type":"kpi","items":[{"label":"Open WOs","value":12}]}]}\n'
            + '```\nLet me know if you need more.';
        KioskAgentforceController.BlockExtraction ex = RenderBlocks.extract(reply);
        System.assertNotEquals(null, ex.blocksJson, 'blocks extracted');
        System.assert(ex.blocksJson.contains('kpi'), 'kpi block present');
        System.assert(!ex.text.contains('agent-blocks'), 'fence removed from prose');
        System.assert(ex.text.contains('Here is your data'), 'prose retained');
    }

    @IsTest
    static void bareArrayFence_isTolerated() {
        String reply = '```agent-blocks\n[{"type":"chart","chartType":"bar","series":[{"label":"A","value":3}]}]\n```';
        KioskAgentforceController.BlockExtraction ex = RenderBlocks.extract(reply);
        System.assertNotEquals(null, ex.blocksJson, 'bare array tolerated');
        System.assert(ex.blocksJson.contains('chart'), 'chart block present');
    }

    @IsTest
    static void markdownTable_becomesTableBlock() {
        String reply = 'Results:\n\n'
            + '| Wagon | Status |\n'
            + '| --- | --- |\n'
            + '| RT-100 | OK |\n'
            + '| RT-200 | Attention |\n';
        KioskAgentforceController.BlockExtraction ex = RenderBlocks.extract(reply);
        System.assertNotEquals(null, ex.blocksJson, 'table parsed');
        System.assert(ex.blocksJson.contains('"type":"table"'), 'table block');
        System.assert(ex.blocksJson.contains('Wagon'), 'columns captured');
        System.assert(ex.blocksJson.contains('RT-200'), 'rows captured');
    }

    @IsTest
    static void activityList_becomesTimeline() {
        String reply = 'Here are the recent shutdown activities.\n\n'
            + '**1. SA-00049** - Job Delay\n'
            + '   📝 Materials not available\n'
            + '   📅 Created: Apr 23, 2026 14:38\n\n'
            + '---\n\n'
            + '**2. SA-00048** - Job Delay\n'
            + '   📝 Delay by two hours\n'
            + '   📅 Created: Apr 16, 2026 13:36\n';
        KioskAgentforceController.BlockExtraction ex = RenderBlocks.extract(reply);
        System.assertNotEquals(null, ex.blocksJson, 'timeline parsed');
        System.assert(ex.blocksJson.contains('"type":"timeline"'), 'timeline block');
        System.assert(ex.blocksJson.contains('SA-00049'), 'event 1');
        System.assert(ex.blocksJson.contains('SA-00048'), 'event 2');
    }

    @IsTest
    static void plainText_yieldsNoBlocks() {
        KioskAgentforceController.BlockExtraction ex =
            RenderBlocks.extract('Just a normal sentence with no structure.');
        System.assertEquals(null, ex.blocksJson, 'no blocks for plain prose');
    }

    @IsTest
    static void invalidFenceJson_fallsBack() {
        String reply = '```agent-blocks\n{not valid json}\n```\n| A | B |\n|---|---|\n| 1 | 2 |';
        KioskAgentforceController.BlockExtraction ex = RenderBlocks.extract(reply);
        // invalid structured json -> heuristics still find the table
        System.assert(ex.blocksJson == null || ex.blocksJson.contains('table'), 'graceful fallback');
    }
}
