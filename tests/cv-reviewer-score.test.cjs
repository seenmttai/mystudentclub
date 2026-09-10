const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../cv-reviewer/cv-reviewer.js'), 'utf8');

// Load the actual browser functions without bootstrapping auth or calling APIs.
function sourceBetween(start, end) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex);
    assert.ok(startIndex >= 0 && endIndex > startIndex, `Missing function region: ${start}`);
    return source.slice(startIndex, endIndex);
}

function makeHarness() {
    const elements = Object.fromEntries(['scoreRatingBadge', 'scoreText', 'scoreJustification', 'scoreProgress'].map(id => [id, {
        textContent: '',
        innerHTML: '',
        className: '',
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; }
    }]));
    const inserted = [];
    const context = vm.createContext({
        document: { getElementById: id => elements[id] || null },
        scoreJustification: elements.scoreJustification,
        scoreProgress: elements.scoreProgress,
        simpleMarkdownToHtml: text => text,
        performance: { now: () => 0 },
        requestAnimationFrame: callback => callback(1600),
        cancelAnimationFrame() {},
        scoreAnimationFrame: null,
        console: { warn() {}, error() {} },
        authUser: { id: 'test-user', user_metadata: { full_name: 'Test User' } },
        userId: 'test-user',
        selectedFile: { name: 'test-resume.pdf' },
        supabase: {
            from(table) {
                assert.equal(table, 'msc_cv_ai_resume_reviews');
                return {
                    insert(rows) {
                        inserted.push(...rows);
                        return {
                            select(columns) {
                                assert.equal(columns, 'id');
                                return { single: async () => ({ data: { id: 'saved-review' }, error: null }) };
                            }
                        };
                    }
                };
            }
        }
    });
    vm.runInContext([
        sourceBetween('function extractSectionContent(', 'function parseAndDisplayRecruiterTips('),
        sourceBetween('function animateScore(', 'function updateScoreBreakdown('),
        sourceBetween('async function saveReview(', 'function startLoadingAnimation(')
    ].join('\n'), context);
    return { context, elements, inserted };
}

const marked = content => `<<<OVERALL_SCORE>>>\n${content}\n<<<END_OVERALL_SCORE>>>`;
const reportedResponse = '**<<<OVERALL_SCORE>>>**  \nScore: **70.5/100**  \nJustification: Strong academics and relevant audit experience.  \n**<<<END_OVERALL_SCORE>>>**';

test('parses the reported model response and supported formatting', () => {
    const { context } = makeHarness();
    const cases = [
        [reportedResponse, 70.5],
        [marked('Score: 70.5/100'), 70.5],
        [marked('Score: 70.5/100.'), 70.5],
        [marked('**Score:** **70.5/100**'), 70.5],
        [marked('*Score:* *70.5/100*'), 70.5],
        [marked('__Score:__ __70.5/100__'), 70.5],
        [marked('`Score:` `70.5/100`'), 70.5],
        [marked('Score :\t70.25 / 100'), 70.25],
        [marked('Score:\n70.5 / 100'), 70.5],
        [marked('Score: 0/100'), 0],
        [marked('Score: 100/100'), 100],
        ['<score>70.5</score>', 70.5],
        ['Overall Score: 70.5/100', 70.5],
        ['Overall **Score:** **70.5/100**', 70.5]
    ];
    for (const [text, expected] of cases) {
        assert.equal(context.parseOverallScore(text), expected, text);
    }
});

test('uses the marked overall score rather than other scores in the response', () => {
    const { context } = makeHarness();
    const text = `Overall Score: 10/100\n<score>20</score>\n${reportedResponse}\nOverall Score: 90/100`;
    assert.equal(context.parseOverallScore(text), 70.5);
    assert.equal(context.parseOverallScore(`${marked('Score: unavailable')}\nOverall Score: 90/100`), null);
});

test('missing, malformed and out-of-range scores remain unavailable', () => {
    const { context } = makeHarness();
    const cases = [
        null, undefined, '', 'No score was supplied.', marked('Justification: Good experience.'),
        marked('Score: unavailable'), marked('Score: 70.5.1/100'), marked('Score: -5/100'),
        marked('Score: 101/100'), marked('Score: 100.01/100'), marked('Score: 70/10'),
        marked('Score: 70/1000'), marked('Score: 70/100.5'), '<score>70.5.1</score>', '<score>101</score>',
        'Overall Score: -1/100'
    ];
    for (const text of cases) {
        assert.equal(context.parseOverallScore(text), null, String(text));
    }
});

test('displays the reported score and appropriate rating', () => {
    const { context, elements } = makeHarness();
    assert.equal(context.parseAndDisplayOverallScore(reportedResponse), 70.5);
    assert.equal(elements.scoreText.textContent, '70.5');
    assert.equal(elements.scoreRatingBadge.textContent, 'Good');
    assert.match(elements.scoreJustification.innerHTML, /Strong academics/);
});

test('replaces a previous valid score with an unavailable state', () => {
    const { context, elements } = makeHarness();
    context.parseAndDisplayOverallScore(reportedResponse);
    assert.equal(context.parseAndDisplayOverallScore(marked('Score: unavailable')), null);
    assert.equal(elements.scoreRatingBadge.textContent, 'Score unavailable');
    assert.notEqual(elements.scoreText.textContent, '0');
    assert.notEqual(elements.scoreText.textContent, '70.5');
});

test('preserves a legitimate zero score in the UI', () => {
    const { context, elements } = makeHarness();
    assert.equal(context.parseAndDisplayOverallScore(marked('Score: 0/100')), 0);
    assert.equal(elements.scoreText.textContent, '0');
    assert.equal(elements.scoreRatingBadge.textContent, 'Needs Polish');
});

test('saves the same numeric score that is displayed', async () => {
    for (const [text, score] of [[reportedResponse, 70.5], [marked('Score: 0/100'), 0], ['<score>70.5</score>', 70.5]]) {
        const { context, inserted } = makeHarness();
        assert.equal(await context.saveReview(text), 'saved-review');
        assert.equal(inserted.length, 1);
        assert.equal(inserted[0].score, score);
        assert.equal(inserted[0].review_data.review, text);
    }
});

test('does not save an unavailable score as zero', async () => {
    const { context, inserted } = makeHarness();
    assert.equal(await context.saveReview(marked('Score: unavailable')), null);
    assert.equal(inserted.length, 0);
});

test('history recovers old stored zeros from review text and distinguishes missing scores', async () => {
    const { context, elements } = makeHarness();
    elements.historyContent = { innerHTML: '' };
    elements.historyDetailContent = { style: {} };
    const history = [
        { id: 'old-zero', score: 0, review_data: { review: reportedResponse } },
        { id: 'actual-zero', score: 0, review_data: { review: marked('Score: 0/100') } },
        { id: 'missing-score', score: 0, review_data: { review: marked('Score: unavailable') } },
        { id: 'legacy-row', score: 50, review_data: null }
    ].map(item => ({ ...item, created_at: '2026-09-10T00:00:00Z', file_name: 'test-resume.pdf' }));
    const query = {
        select() { return this; },
        or() { return this; },
        eq() { return this; },
        order() { return this; },
        limit: async () => ({ data: history, error: null })
    };
    Object.assign(context, {
        supabase: { from: () => query },
        refreshAuthUser: async () => {},
        historyReviews: [],
        localStorage: { getItem: () => null },
        ACTIVE_REVIEW_KEY: 'test-active-review',
        escapeHtml: text => text
    });
    vm.runInContext(sourceBetween('async function loadHistory(', 'async function showHistoryView('), context);
    await context.loadHistory();

    const html = elements.historyContent.innerHTML;
    assert.match(html, /class="history-score">70\.5%<\/span>/);
    assert.match(html, /class="history-score">Score unavailable<\/span>/);
    assert.match(html, /class="history-score">50\.0%<\/span>/);
    assert.equal((html.match(/class="history-score">0\.0%<\/span>/g) || []).length, 1);
    assert.equal(history[0].score, 0, 'Displaying the corrected score does not mutate saved data');
});
