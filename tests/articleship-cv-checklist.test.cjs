const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const CV = require('../scripts/articleship-cv-checklist.js');
const C = require('../scripts/articleship-checklist.js');
const P = require('../scripts/articleship-progress.js');

const ROOT = path.join(__dirname, '..');
const TOOL_DIR = path.join(ROOT, 'articleship-program', 'cv-checklist');
const CONTENT_TEXT = fs.readFileSync(path.join(TOOL_DIR, 'cv-checklist.json'), 'utf8');
const CONTENT = JSON.parse(CONTENT_TEXT);
const PAGE = fs.readFileSync(path.join(TOOL_DIR, 'index.html'), 'utf8');
const LMS_SQL = fs.readFileSync(path.join(ROOT, 'supabase', 'migrations', '202610200002_articleship_program_v3_lms.sql'), 'utf8');

/** The v3 course rows as the LMS will hold them (sessions 1-7 = Day 0-6). */
function lmsSessions() {
    const start = LMS_SQL.indexOf("json_populate_recordset(NULL::public.videos, '") + "json_populate_recordset(NULL::public.videos, '".length;
    const end = LMS_SQL.indexOf("]'::json)", start) + 1;
    return JSON.parse(LMS_SQL.slice(start, end).replace(/''/g, "'"));
}

function memoryStore(defaults) {
    const map = new Map();
    return P.createStore('cv-checklist', {
        storage: { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) },
        client: null, sessionFlags: null, debounceMs: 0, userId: () => null, defaults
    });
}

function pageDom() {
    const dom = new JSDOM('<!doctype html><p id="cvc-lede">x</p><div id="app"></div><nav id="cvc-nav"></nav><div id="cvc-end"></div>');
    const doc = dom.window.document;
    return { dom, doc, container: doc.getElementById('app'), nav: doc.getElementById('cvc-nav'), end: doc.getElementById('cvc-end'), lede: doc.getElementById('cvc-lede') };
}

const SPEC_ORDER = ['Set-up', 'Header', 'Education', 'Proof', 'Finish'];

test('content: 22 checks in build order, every one with an example, links that render', () => {
    const model = C.normalise(CONTENT);
    assert.equal(model.total, 22, '"14 of 22 done": the MSCIT-parity count');
    assert.deepEqual(model.sections.map(s => s.title), SPEC_ORDER, 'set-up → header → education → proof → finish');
    model.items.forEach(item => assert.ok(item.example.length > 20, 'example for ' + item.id));
    const rawFixes = CONTENT.items.filter(item => item.fix).length;
    assert.equal(model.items.filter(item => item.fix).length, rawFixes, 'every fix link passes the safe-link rule');
    assert.ok(rawFixes >= 10, 'fix-it links on the checks that have a place to fix them');
    // The V3-STRUCTURE row 1.8 checks, each present.
    const ids = model.items.map(item => item.id);
    ['built-in-builder', 'one-page', 'file-name', 'name-email-phone', 'linkedin', 'city-only', 'nothing-personal', 'objective',
        'education-order', 'remarks', 'groups-attempts', 'icitss', 'line-formula', 'assisted', 'certifications', 'no-client-names',
        'two-questions', 'bold-and-even', 'pdf-links', 'phone-check', 'a4-print', 'same-story']
        .forEach(id => assert.ok(ids.includes(id), 'check ' + id));
    const byId = Object.fromEntries(model.items.map(item => [item.id, item]));
    assert.match(byId['one-page'].check, /never shrunk/);
    assert.match(byId['file-name'].example, /Riya Sharma - Articleship CV - Audit\.pdf/, 'same file-name pattern as Guidebook ch 3 and Automail');
    assert.match(byId['nothing-personal'].check, /photo.*date of birth.*father’s name.*Declaration/);
    assert.match(byId['groups-attempts'].example, /Result awaited/);
    assert.match(byId['certifications'].check, /Certifications and job simulations”, four outside certificates at most/);
    assert.match(byId['assisted'].check, /Assisted/);
    assert.match(byId['two-questions'].check, /two questions/);
    // The claim → question drill, every ready example (skills, simulations, hobbies, roles).
    ['Excel', 'Tally Prime', 'SAP', 'ICITSS', 'CARO', 'job simulation', 'Work Simulation', 'Reading', 'Trekking', 'Captain', 'Volunteer teacher', 'Last read']
        .forEach(claim => assert.ok(byId['two-questions'].example.includes(claim), 'two-question example: ' + claim));
    assert.match(byId['objective'].example, /five seconds/, 'the quick-look test');
    assert.match(byId['a4-print'].example, /five classmates’ CVs/, 'the peer read');
    // The ten fixes reviewers make most, all ten.
    assert.equal((byId['bold-and-even'].example.match(/^\d+\. /gm) || []).length, 10);
});

test('content: closing card runs CV Reviewer, then the Personal CV review row (same link as the LMS)', () => {
    const model = C.normalise(CONTENT);
    assert.deepEqual(model.done.links.map(l => l.href.split('?')[0]), ['/cv-reviewer/', 'https://wa.me/917228881182']);
    const day1 = lmsSessions().find(s => s.day_number === 1).resources;
    const personal = day1.find(r => r.title === 'Personal CV review');
    assert.equal(model.done.links[1].href, personal.url, 'Personal CV review = the LMS row link');
    assert.ok(model.done.links[1].external);
    assert.ok(day1.some(r => r.title === 'CV Reviewer' && r.url === '/cv-reviewer/'));
    assert.ok(day1.some(r => r.title === 'CV checklist' && r.url === '/articleship-program/cv-checklist/'), 'the LMS row opens this tool');
});

test('content: every programme deep link names a real row of the right Day; tool links are programme rows', () => {
    const sessions = lmsSessions();
    const allUrls = sessions.flatMap(s => s.resources.map(r => r.url).filter(Boolean));
    const links = CONTENT.items.filter(item => item.fix).map(item => item.fix.href);
    let deep = 0;
    links.forEach(href => {
        if (href.startsWith('/learning-management-system/course?')) {
            deep += 1;
            const params = new URLSearchParams(href.split('?')[1]);
            assert.equal(params.get('course'), 'msc-articleship-program');
            const session = sessions.find(s => s.video_number === Number(params.get('session')));
            assert.ok(session, 'session ' + params.get('session'));
            const row = session.resources.find(r => r.title === params.get('resource'));
            assert.ok(row, '"' + params.get('resource') + '" is a row of Day ' + session.day_number);
            assert.equal(row.type, 'pdf');
            assert.ok(Number(params.get('page')) >= 1);
        } else {
            assert.ok(allUrls.includes(href), href + ' is a programme row');
        }
    });
    assert.ok(deep >= 5);
    // The deep links are exactly what MSCArticleshipLms.resourceLink builds.
    const L = require('../scripts/articleship-lms.js');
    const keywords = CONTENT.items.find(item => item.id === 'line-formula').fix.href;
    assert.equal(keywords, L.resourceLink(1, 'Keywords by domain', 15), 'Keywords by domain, last page');
    assert.equal(CONTENT.items.find(item => item.id === 'objective').fix.href, L.resourceLink(1, 'The Nothing CV', 2));
});

test('content and page: nothing a student must never see', () => {
    const pageText = new JSDOM(PAGE).window.document.body.textContent;
    [CONTENT_TEXT, pageText].forEach(text => {
        assert.doesNotMatch(text, /ca ?monk|thinking ?bridge|umbrella|NEEDS-CHECK|\bwaves?\b|drop [abc]\b|live week|coming soon/i);
        assert.doesNotMatch(text, /saved on this device|privacy|version|source:|disclaimer|guarantee/i);
        assert.doesNotMatch(text, /\b(?:D\d-\d+|MS-\d+|TL-M\d+|V2-\d+|C\d-\d+|CV-\d+|WB-\d+|H-cv)\b/, 'no internal codes');
        assert.doesNotMatch(text, /\b20(?:2[4-9]|3\d)\b/, 'no dates of this build or of a batch');
        assert.doesNotMatch(text, /stipend|salary|₹\s?\d[\d,]*\s?(?:per month|\/month|pm)\b/i, 'no stipend figures');
    });
    // Privacy: fictional details only.
    (CONTENT_TEXT.match(/[\w.+-]+@[\w-]+\.\w+/g) || []).forEach(email => assert.match(email, /@email\.com$/));
    assert.doesNotMatch(CONTENT_TEXT.replace(/917228881182/g, ''), /\d{10}/, 'no real phone numbers (98XXXXXXXX only)');
});

test('page: gated, noindex, MSC logo, notebook headings, scripts in order, every local file exists', () => {
    assert.match(PAGE, /<meta name="robots" content="noindex">/);
    assert.match(PAGE, /<html lang="en" class="ap-gated">/);
    assert.match(PAGE, /<title>CV checklist \| My Student Club<\/title>/);
    assert.match(PAGE, /msc-logo\.svg/);
    assert.match(PAGE, /family=Caveat/);
    assert.match(PAGE, /class="ap-page ap-day-1"/);
    const scripts = [...PAGE.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(scripts, ['/scripts/supabase.js', '/scripts/supabase-init.js', '/scripts/articleship-gate.js',
        '/scripts/articleship-progress.js', '/scripts/articleship-checklist.js', '/scripts/articleship-cv-checklist.js']);
    assert.match(PAGE, /MSCArticleshipCvChecklist\.boot\(\)/);
    const local = [...PAGE.matchAll(/(?:src|href)="(\/[^"#?]+)/g)].map(m => m[1]).filter(p => !p.startsWith('/learning-management-system/'));
    local.forEach(p => assert.ok(fs.existsSync(path.join(ROOT, p)), p + ' exists'));
    assert.equal(CV.CONTENT_URL, '/articleship-program/cv-checklist/cv-checklist.json');
    assert.ok(fs.existsSync(path.join(ROOT, CV.CONTENT_URL)));
});

test('helpers: closing card, section list, next check', () => {
    const model = C.normalise(CONTENT);
    const none = C.summarise(model, {});
    const before = CV.endState(none, model.done);
    assert.equal(before.complete, false);
    assert.match(before.text, /all 22 are ticked/);
    assert.equal(before.links.length, 2, 'the next step shows before 100% too');
    const all = Object.fromEntries(model.items.map(i => [i.id, true]));
    const after = CV.endState(C.summarise(model, all), model.done);
    assert.deepEqual([after.complete, after.title], [true, 'Your CV is ready']);
    const nav = CV.navItems(model, C.summarise(model, { 'built-in-builder': true, 'one-page': true, 'file-name': true }));
    assert.deepEqual(nav.map(n => [n.title, n.count, n.complete]),
        [['Set-up', '3/3', true], ['Header', '0/5', false], ['Education', '0/4', false], ['Proof', '0/5', false], ['Finish', '0/5', false]]);
    assert.equal(nav[0].anchor, 'cvc-set-up');
    assert.deepEqual(CV.nextItem(model, C.summarise(model, { 'built-in-builder': true })), { id: 'one-page', no: 2, label: 'Jump to 2' });
    assert.equal(CV.nextItem(model, C.summarise(model, all)), null);
    assert.deepEqual(CV.exampleLines('Read it aloud.\nSAP → “Which module?”\n\n✅ Riya Sharma'),
        [{ lead: '', rest: 'Read it aloud.' }, { lead: 'SAP', rest: '“Which module?”' }, { lead: '', rest: '✅ Riya Sharma' }]);
    const stripped = CV.withoutDone(CONTENT);
    assert.equal(stripped.done, undefined);
    assert.ok(CONTENT.done, 'the original content is untouched');
});

test('start: ticks save, "14 of 22 done", jump to the next check, section counts, closing card, reload keeps ticks', () => {
    const { doc, container, nav, end, lede } = pageDom();
    const store = memoryStore({ ticks: {} });
    const page = CV.start({ container, nav, end, lede, content: CONTENT, store });
    assert.equal(lede.textContent, CONTENT.intro);
    assert.equal(doc.querySelectorAll('.ap-cl-item').length, 22);
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '0 of 22 done');
    const next = doc.querySelector('.cvc-next');
    assert.ok(next.hidden, 'no jump before the first tick');
    assert.ok(doc.querySelector('.cvc-reset').hidden, 'nothing to untick yet');
    assert.equal(doc.querySelector('.ap-cl-done'), null, 'the engine card is replaced by this page’s closing card');
    assert.equal(doc.querySelector('.cvc-end-title').textContent, 'Then, two reviews');
    assert.equal(doc.querySelectorAll('.cvc-end-links a').length, 2);
    assert.equal(doc.querySelectorAll('#cvc-set-up, #cvc-header, #cvc-education, #cvc-proof, #cvc-finish').length, 5);

    // Examples read line by line; the claim of a "claim → question" line is bold; text stays text.
    const probe = doc.querySelector('.ap-cl-item[data-id="two-questions"] .cvc-ex');
    assert.ok(probe.querySelectorAll('p').length >= 9);
    assert.equal(probe.querySelector('.cvc-ex-pair strong').textContent, 'Excel: XLOOKUP, PivotTables');
    [...doc.querySelectorAll('.ap-cl-example > p')].forEach(p => assert.ok(!p.textContent.includes('\n'), 'every multi-line example is split'));
    const injected = pageDom();
    CV.start({ container: injected.container, content: { items: [{ check: 'x', example: ['<img src=x onerror=alert(1)> → <b>y</b>', 'two'] }] } });
    assert.equal(injected.doc.querySelectorAll('img, b').length, 0);
    assert.equal(injected.doc.querySelector('.cvc-ex strong').textContent, '<img src=x onerror=alert(1)>');

    const inputs = [...doc.querySelectorAll('.ap-cl-check input')];
    inputs.slice(0, 14).forEach(input => { input.checked = true; input.dispatchEvent(new doc.defaultView.Event('change')); });
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '14 of 22 done');
    assert.equal(doc.querySelector('.ap-progress-pct').textContent, '64%');
    assert.equal(Object.keys(store.get().ticks).length, 14, 'saved through the progress store');
    assert.equal(next.hidden, false);
    assert.equal(next.textContent, 'Jump to 15');
    assert.deepEqual([...nav.querySelectorAll('.cvc-nav-count')].map(n => n.textContent), ['3/3', '5/5', '4/4', '2/5', '0/5']);
    assert.ok(nav.querySelector('.cvc-nav-link').classList.contains('is-complete'));

    next.click();
    const target = doc.querySelector('.ap-cl-item[data-id="certifications"]');
    assert.ok(target.classList.contains('cvc-flash'));
    assert.equal(doc.activeElement, target.querySelector('input'));
    assert.equal(page.jump('not-a-check'), false);

    // A second visit on the same device shows the same ticks.
    const second = pageDom();
    CV.start({ container: second.container, nav: second.nav, end: second.end, content: CONTENT, store });
    assert.equal(second.doc.querySelector('.ap-progress-count').textContent, '14 of 22 done');

    page.list.model.items.forEach(item => page.list.tick(item.id, true));
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '22 of 22 done');
    assert.ok(next.hidden);
    assert.ok(doc.querySelector('.cvc-end-card').classList.contains('is-complete'));
    assert.equal(doc.querySelector('.cvc-end-title').textContent, 'Your CV is ready');
    assert.equal(second.doc.querySelector('.cvc-end-title').textContent, 'Your CV is ready', 'other open copies follow');
    page.destroy();
});

test('untick all asks first, then clears every tick', () => {
    const { doc, container, nav, end } = pageDom();
    const store = memoryStore({ ticks: {} });
    let answer = false;
    const asked = [];
    CV.start({ container, nav, end, content: CONTENT, store, confirm: message => { asked.push(message); return answer; } });
    const reset = doc.querySelector('.cvc-reset');
    const input = doc.querySelector('.ap-cl-check input');
    input.checked = true;
    input.dispatchEvent(new doc.defaultView.Event('change'));
    assert.equal(reset.hidden, false);
    reset.click();
    assert.deepEqual(asked, ['Untick all 22 checks?']);
    assert.equal(Object.keys(store.get().ticks).length, 1, 'cancel keeps the ticks');
    answer = true;
    reset.click();
    assert.deepEqual(store.get().ticks, {});
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '0 of 22 done');
    assert.ok(reset.hidden);
});

test('boot: gate, content and store; a failed load shows "Try again" instead of a blank page', async () => {
    const { doc } = pageDom();
    const store = memoryStore({ ticks: { 'one-page': true } });
    const opened = [];
    const okFetch = async url => ({ ok: true, status: 200, json: async () => { opened.push(url); return JSON.parse(CONTENT_TEXT); } });
    const page = await CV.boot({
        document: doc,
        Gate: { protect: () => Promise.resolve({ state: 'allow' }) },
        Progress: { open: (tool, opts) => { assert.equal(tool, 'cv-checklist'); assert.equal(opts.merge, C.mergeTicks); return store; } },
        fetch: okFetch
    });
    assert.ok(page);
    assert.deepEqual(opened, ['/articleship-program/cv-checklist/cv-checklist.json']);
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '1 of 22 done');

    const failed = pageDom();
    const origError = console.error;
    console.error = () => {};
    try {
        const result = await CV.boot({
            document: failed.doc,
            Gate: { protect: () => Promise.resolve({ state: 'allow' }) },
            Progress: { open: () => memoryStore({ ticks: {} }) },
            fetch: async () => ({ ok: false, status: 404 })
        });
        assert.equal(result, null);
    } finally {
        console.error = origError;
    }
    assert.match(failed.doc.querySelector('.cvc-error').textContent, /Try again/);
    await assert.rejects(() => CV.loadContent('/x.json', async () => ({ ok: false, status: 500 })), /did not load \(500\)/);
});
