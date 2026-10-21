const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const CV = require('../scripts/articleship-cv-checklist.js');
const C = require('../scripts/articleship-checklist.js');
const P = require('../scripts/articleship-progress.js');

const ROOT = path.join(__dirname, '..');
const TOOL_DIR = path.join(ROOT, 'articleship-program', 'cv-checklist');
const CONTENT_TEXT = fs.readFileSync(path.join(TOOL_DIR, 'cv-checklist.json'), 'utf8');
const CONTENT = JSON.parse(CONTENT_TEXT);
const PAGE = fs.readFileSync(path.join(TOOL_DIR, 'index.html'), 'utf8');
const CONTENT_BUILD = process.env.MSC_ARTICLESHIP_BUILD || path.join(ROOT, '..', 'msc-content', 'articleship-program', 'v3', 'build');

// The LMS rows: the desktop branch carries the migrations; the mobile branch does not (one shared database), so its
// port reads the content build's copy of the same file, and skips these checks on a machine without it. 003 holds the
// full course (002 is release 1 only: the rows whose files were ready at handover).
const LMS_SQL = [
    path.join(ROOT, 'supabase', 'migrations', '202610200003_articleship_program_v3_later_rows.sql'),
    path.join(CONTENT_BUILD, 'lms', '003_articleship_program_v3_later_rows.sql')
].filter(file => fs.existsSync(file)).map(file => fs.readFileSync(file, 'utf8'))[0] || null;

/** The full v3 course as the LMS will hold it once every file is uploaded (sessions 1-7 = Day 0-6). */
function lmsSessions() {
    const encoded = LMS_SQL.match(/jsonb_array_elements\('([\s\S]*?)'::jsonb\)/);
    return JSON.parse(encoded[1].replace(/''/g, "'")).map(s => Object.assign({}, s, { resources: s.resources.map(item => item.resource) }));
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

const SPEC_ORDER = ['Set-up', 'Top of the page', 'Education', 'Proof', 'Finish'];

test('content: 22 checks in build order, every one with an example, links that render', () => {
    const model = C.normalise(CONTENT);
    const raw0 = id => CONTENT.items.find(item => item.id === id);
    assert.equal(model.total, 22, '"14 of 22 done": the MSCIT-parity count');
    assert.deepEqual(model.sections.map(s => s.title), SPEC_ORDER, 'set-up → top of the page → education → proof → finish');
    model.items.forEach(item => assert.ok(item.example.length > 20, 'example for ' + item.id));
    const rawFixes = CONTENT.items.filter(item => item.fix).length;
    assert.equal(model.items.filter(item => item.fix).length, rawFixes, 'every fix link passes the safe-link rule');
    assert.ok(rawFixes >= 10, 'fix-it links on the checks that have a place to fix them');
    // The V3-STRUCTURE row 1.8 checks, each present.
    const ids = model.items.map(item => item.id);
    ['built-in-builder', 'one-page', 'file-name', 'name-email-phone', 'linkedin', 'city-only', 'nothing-personal', 'objective',
        'education-order', 'remarks', 'groups-attempts', 'icitss', 'line-formula', 'assisted', 'certifications', 'no-client-names',
        'two-questions', 'bold-and-even', 'pdf-links', 'phone-and-print', 'same-story', 'before-you-send']
        .forEach(id => assert.ok(ids.includes(id), 'check ' + id));
    const byId = Object.fromEntries(model.items.map(item => [item.id, item]));
    assert.match(byId['one-page'].check, /never shrunk/);
    assert.match(byId['file-name'].example, /Devika Joshi - Articleship CV - Audit\.pdf/, 'same file-name pattern as Guidebook ch 3 and Automail');
    assert.match(byId['nothing-personal'].check, /photo.*date of birth.*parents’ names.*a declaration.*a signature/);
    assert.match(byId['groups-attempts'].example, /Result awaited/);
    assert.match(byId['certifications'].check, /in their own section, four outside certificates at most/);
    assert.match(byId['certifications'].example, /Heading “Certifications and job simulations”/);
    assert.match(byId['certifications'].example, /the MSC Articleship Program line and ICITSS don’t count in the four/, 'house rule 2: the programme line is not one of the four');
    assert.match(byId['assisted'].check, /observed, assisted, prepared or led/);
    assert.match(byId['two-questions'].check, /two questions/);
    // The claim → question drill, every ready example (skills, simulations, hobbies, roles): the full harvest list.
    ['Excel', 'Tally Prime', 'SAP', 'ICITSS', 'CARO 2020', 'PwC US Audit Job Simulation', 'Reading', 'Trekking',
        'Captain, cricket team', 'Volunteer teacher', 'Last read']
        .forEach(claim => assert.ok(byId['two-questions'].example.includes(claim), 'two-question example: ' + claim));
    const probes = byId['two-questions'].example.split('\n').filter(line => line.includes(' → '));
    assert.ok(probes.length >= 11, 'eleven claim → question pairs');
    probes.forEach(line => assert.ok((line.split(' → ')[1].match(/“[^”]+”/g) || []).length >= 2, 'two questions for ' + line.split(' → ')[0]));
    // Skills and interests: the skills rule (pointing to Keywords by domain) and the interests ❌/✅ pair, named so they can be tested.
    ['Skills: name what you can do live, not adjectives (Skills and tools in Keywords by domain).', '❌ Interests: cricket, movies, travelling', '✅ Reading business biographies. Last read: [title]']
        .forEach(line => assert.ok(byId['two-questions'].example.split('\n').includes(line), line));
    // The quick-look test and the peer read: one "before you send" check, last in Finish.
    const last = model.items[model.items.length - 1];
    assert.equal(last.id, 'before-you-send');
    assert.match(last.check, /^Before you send/);
    assert.match(last.example, /five seconds/, 'the quick-look test');
    assert.match(last.example, /five classmates’ CVs/, 'the peer read');
    // No classmates' CVs to hand: the look-book's filled-in CVs (made-up applicants), never Day 6's industrial-training CVs.
    assert.match(last.fix.label, /Filled-in CVs to compare: CV templates/, "no classmates to hand: the fix link opens filled-in CVs");
    assert.match(last.fix.href, /resource=CV\+templates/);
    assert.doesNotMatch(CONTENT_TEXT, /Post Articleship CVs/);
    assert.doesNotMatch(byId['objective'].example, /five seconds/);
    assert.doesNotMatch(byId['phone-and-print'].example, /classmates/);
    // The ten fixes reviewers make most, all ten, with a bold example that shows how bold is used.
    const bold = byId['bold-and-even'];
    assert.equal(bold.check, 'Bold only the key result; fonts, spacing and dates even');
    assert.equal((bold.example.match(/^\d+\. /gm) || []).length, 6);
    assert.match(bold.example, /^✅ [^*\n]+\*\*[^*\n]+\*\*[^*\n]+$/m, '✅ only the result in bold');
    assert.match(bold.example, /^❌ \*\*[^*\n]+\*\*$/m, '❌ a whole line in bold');
    // Each point in one place: mixed fonts is fix no. 1, not repeated in check 1.
    assert.doesNotMatch(byId['built-in-builder'].example, /font, the body in another|fix reviewers make most/);
    // Remarks: one ✅ and one ❌ here; the full remarks bank lives once, in Choose your CV (the check's Fix it link).
    const remarkLines = byId['remarks'].example.split('\n');
    assert.ok(remarkLines.some(l => /^✅ CA Intermediate row: /.test(l) && !/Accountancy/.test(l)));
    assert.ok(remarkLines.some(l => /^❌ /.test(l)));
    assert.match(raw0('remarks').fix.href, /resource=Choose\+your\+CV&page=\d+/);
    assert.match(byId['line-formula'].example, /cleared ₹38,000 of unmatched entries/, 'a line ends on what came of it');
    assert.doesNotMatch(CONTENT_TEXT, /No record, no number/);
    // One wording for anything unfinished.
    assert.doesNotMatch(CONTENT_TEXT, /In progress/i);
    assert.match(byId['icitss'].example, /Marks “Ongoing” · Remarks “Completes \[Month Year\]”/, 'the CV’s Marks and Remarks columns, as the CV Recommender’s “Ongoing, completes [Month Year]”');
    // Line formats for simulations, courses and the MSC line live in Guidebook ch 3 q19 (one home); the check links there.
    assert.match(raw0('certifications').fix.href, /resource=MSC\+Articleship\+Guidebook&page=\d+/);
    assert.equal(raw0('certifications').fix.find, 'Where do job simulations and certificates go?');
    // The intro never carries a hard count.
    assert.doesNotMatch(CONTENT.intro, /\d/);

    // Phones: the main lesson first, the long lists in folds of their own.
    const raw = Object.fromEntries(CONTENT.items.map(item => [item.id, item]));
    const groups = CV.exampleGroups(byId['two-questions'].example);
    const frontProbes = groups.main.filter(line => line.includes(' → '));
    assert.ok(frontProbes.length >= 3 && frontProbes.length <= 4, '3-4 probes before the fold: ' + frontProbes.length);
    assert.deepEqual(groups.folds.map(f => f.title), ['More questions', 'Skills and interests that survive']);
    assert.ok(groups.main.length <= 6, 'check 17 shows at most 6 lines before its folds');
    assert.deepEqual(groups.folds[1].lines.map(line => line.split(' ')[0]), ['Skills:', '❌', '✅', 'Keep'], 'the skills rule, the interests pair, then the interests rule');
    assert.doesNotMatch(byId['two-questions'].example, /Can’t answer both/, 'the rule lives in the sticky and the table lead');
    assert.match(groups.folds[1].lines.join('\n') + '\n' + groups.main.join('\n') + '\n' + byId['two-questions'].example, /Keep an interest only if you still do it/);
    const tenFixes = CV.exampleGroups(byId['bold-and-even'].example);
    assert.deepEqual(tenFixes.folds.map(f => [f.title, f.lines.length]), [['Six more fixes reviewers make', 6]]);
    assert.ok(tenFixes.main.length <= 4, 'the bold lesson stays short');
    // Check 18's own rule: full stops on every fix or on none (none).
    tenFixes.folds[0].lines.forEach(line => assert.doesNotMatch(line, /\.$/, line));
    assert.match(byId['bold-and-even'].example, /Dates on one tab stop at the right edge, in one format everywhere/);
    // Each fold marker is a line of its own in the JSON (the sheet generator leaves it out of the sheet).
    CONTENT.items.forEach(item => item.example.filter(line => line.includes(CV.FOLD_MARK)).forEach(line => assert.ok(line.startsWith(CV.FOLD_MARK), line)));
    // Read it from the bottom line up: said once, in the phone-and-print check.
    assert.equal((CONTENT_TEXT.match(/bottom line up/g) || []).length, 1);
    // A check every correct CV can pass: an A4 page never reads "without zooming" on a phone.
    const phone = byId['phone-and-print'];
    assert.equal(phone.check, 'Phone and printout: nothing cut off, nothing faded');
    assert.match(phone.example, /a second page/, 'still one page on a phone');
    assert.doesNotMatch(CONTENT_TEXT, /without zoom|pinch/i);
    assert.match(phone.example, /black and white/);
    // Never shrink the font: said once, in check 2 (its home), not again in check 20.
    assert.doesNotMatch(phone.example, /shrink/);
    // House rule 2: four outside certificates at most, the MSC programme line not one of them.
    assert.match(raw['certifications'].check, /four outside certificates at most/);
    assert.ok(raw['certifications'].example.some(line => /the MSC Articleship Program line and ICITSS don’t count in the four\./.test(line)));
    // No first person on a CV line or an objective.
    assert.doesNotMatch(byId['objective'].example, /✅[^\n]*\b(?:my|I)\b/);
    assert.doesNotMatch(byId['line-formula'].example, /✅[^\n]*\b(?:my|I)\b/);
});

test('content: closing card runs CV Reviewer, then the Personal CV review row (same link as the LMS)', t => {
    if (!LMS_SQL) { t.skip('LMS migration not on this branch or machine'); return; }
    const model = C.normalise(CONTENT);
    assert.deepEqual(model.done.links.map(l => l.href.split('?')[0]), ['/cv-reviewer/', 'https://wa.me/917228881182']);
    const day1 = lmsSessions().find(s => s.day_number === 1).resources;
    const personal = day1.find(r => r.title === 'Personal CV review');
    assert.equal(model.done.links[1].href, personal.url, 'Personal CV review = the LMS row link');
    assert.ok(model.done.links[1].external);
    assert.ok(day1.some(r => r.title === 'CV Reviewer' && r.url === '/cv-reviewer/'));
    assert.ok(day1.some(r => r.title === 'CV checklist' && r.url === '/articleship-program/cv-checklist/'), 'the LMS row opens this tool');
});

test('content: every programme deep link names a real row of the right Day; tool links are programme rows', t => {
    if (!LMS_SQL) { t.skip('LMS migration not on this branch or machine'); return; }
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
            // A page link names the heading on that page; page 1 (or the whole file) is written as no page at all.
            const item = CONTENT.items.find(entry => entry.fix && entry.fix.href === href);
            if (params.has('page')) assert.ok(Number(params.get('page')) >= 2, 'page 1 is written as no page: ' + href);
            if (!item.fix.find) assert.equal(params.has('page'), false, 'a link without a heading to find opens the whole file: ' + href);
            const L = require('../scripts/articleship-lms.js');
            assert.equal(href, L.resourceLink(session.day_number, row.title, Number(params.get('page')) || 1), 'built as resourceLink builds it');
        } else {
            assert.ok(allUrls.includes(href), href + ' is a programme row');
        }
    });
    assert.ok(deep >= 5);
    // The deep links are exactly what MSCArticleshipLms.resourceLink builds.
    const L = require('../scripts/articleship-lms.js');
    // (Page numbers come from the built PDFs: wire_pages.mjs writes them and the "fix-it pages" test checks them.)
    const pageOf = href => Number(new URLSearchParams(href.split('?')[1]).get('page'));
    const keywords = CONTENT.items.find(item => item.id === 'line-formula').fix.href;
    assert.equal(keywords, L.resourceLink(1, 'Keywords by domain', pageOf(keywords)), 'Keywords by domain, "How to write a line"');
    const verbs = CONTENT.items.find(item => item.id === 'assisted').fix.href;
    assert.equal(verbs, L.resourceLink(1, 'Keywords by domain', pageOf(verbs)));
    // Every deep link to a page names the heading that page carries (the wiring step and the PDF test below use it).
    CONTENT.items.filter(item => item.fix && item.fix.href.startsWith('/learning-management-system/') && /[?&]page=/.test(item.fix.href))
        .forEach(item => assert.ok(String(item.fix.find || '').length >= 6, 'find text for ' + item.id));
    const objective = CONTENT.items.find(item => item.id === 'objective').fix.href;
    assert.equal(objective, L.resourceLink(1, 'The Nothing CV', pageOf(objective)));
});

test('content and page: nothing a student must never see', () => {
    const pageText = new JSDOM(PAGE).window.document.body.textContent;
    [CONTENT_TEXT, pageText].forEach(text => {
        assert.doesNotMatch(text, /ca ?monk|thinking ?bridge|umbrella|NEEDS-CHECK|\bwaves?\b|drop [abc]\b|live week|coming soon/i);
        // "version" as in a release number ("version 2", "v1.3", "latest version"), not plain English ("the “not sure yet” version").
        assert.doesNotMatch(text, /saved on this device|privacy|\bversion\s*\d|\b(?:new|old|latest|app|beta) version\b|\bv\d+(?:\.\d+)+\b|source:|disclaimer|guarantee/i);
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
    // Row 1.10 ("send your finished CV once the checklist is done") is a plain link in the LMS: the card says when to send,
    // never that the review itself "opens" only here.
    assert.match(before.text, /^Run the CV Reviewer on your PDF\. Then send it for your one personal review, once all 22 are ticked\.$/);
    assert.doesNotMatch(before.text, /opens/);
    assert.equal(before.links.length, 2, 'the next step shows before 100% too');
    const all = Object.fromEntries(model.items.map(i => [i.id, true]));
    const after = CV.endState(C.summarise(model, all), model.done);
    assert.deepEqual([after.complete, after.title], [true, 'All 22 ticked? Your CV is ready']);
    const nav = CV.navItems(model, C.summarise(model, { 'built-in-builder': true, 'one-page': true, 'file-name': true }));
    assert.deepEqual(nav.map(n => [n.title, n.count, n.complete]),
        [['Set-up', '3/3', true], ['Top of the page', '0/5', false], ['Education', '0/4', false], ['Proof', '0/5', false], ['Finish', '0/5', false]]);
    assert.equal(nav[0].anchor, 'cvc-set-up');
    assert.deepEqual(CV.nextItem(model, C.summarise(model, { 'built-in-builder': true })), { id: 'one-page', no: 2, label: 'Jump to 2' });
    assert.equal(CV.nextItem(model, C.summarise(model, all)), null);
    assert.deepEqual(CV.exampleLines('Read it aloud.\nSAP → “Which module?”\n\n✅ Devika Joshi'),
        [{ lead: '', rest: 'Read it aloud.' }, { lead: 'SAP', rest: '“Which module?”' }, { lead: '', rest: '✅ Devika Joshi' }]);
    const stripped = CV.withoutDone(CONTENT);
    assert.equal(stripped.done, undefined);
    assert.ok(CONTENT.done, 'the original content is untouched');
});

test('start: ticks save, "14 of 22 done", jump to the next check, section counts, closing card, reload keeps ticks', () => {
    const { doc, container, nav, end, lede } = pageDom();
    const store = memoryStore({ ticks: {} });
    // The full content (release 2 draws every line); release 1's Work Simulation cut has its own test below.
    const page = CV.start({ container, nav, end, lede, content: CONTENT, store, workSimulationLive: true });
    assert.equal(lede.textContent, 'These are the 22 things I look at on every CV that reaches me, in the order you build one. Tick a check only when the PDF you will send passes it.');
    assert.equal(doc.querySelectorAll('.ap-cl-item').length, 22);
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '0 of 22 done');
    const next = doc.querySelector('.cvc-next');
    assert.ok(next.hidden, 'no jump before the first tick');
    assert.ok(doc.querySelector('.cvc-reset').hidden, 'nothing to untick yet');
    assert.equal(doc.querySelector('.ap-cl-done'), null, 'the engine card is replaced by this page’s closing card');
    assert.equal(doc.querySelector('.cvc-end-title').textContent, 'Then, two reviews');
    assert.equal(doc.querySelectorAll('.cvc-end-links a').length, 2);
    assert.equal(doc.querySelectorAll('#cvc-set-up, #cvc-top-of-the-page, #cvc-education, #cvc-proof, #cvc-finish').length, 5);

    // Examples read line by line; the claim of a "claim → question" line is bold; text stays text.
    const probe = doc.querySelector('.ap-cl-item[data-id="two-questions"] .cvc-ex');
    assert.equal(probe.querySelectorAll('p').length, 4, 'the method and three probes; the rest in folds (the rule lives in the sticky and the table lead)');
    assert.equal(probe.querySelector('.cvc-ex-pair strong').textContent, 'Excel (proficient): XLOOKUP, PivotTables');
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
    // All ticked: the button stays, and now leads on to the two reviews.
    assert.equal(next.hidden, false);
    assert.equal(next.textContent, 'Next: two reviews');
    assert.ok(next.classList.contains('is-end'));
    next.click();
    const card = doc.querySelector('.cvc-end-card');
    assert.ok(card.classList.contains('cvc-flash'));
    assert.equal(doc.activeElement, card.querySelector('a'), 'focus lands on Run CV Reviewer');
    assert.equal(doc.activeElement.textContent, 'Run the CV Reviewer');
    assert.ok(doc.querySelector('.cvc-end-card').classList.contains('is-complete'));
    assert.equal(doc.querySelector('.cvc-end-title').textContent, 'All 22 ticked? Your CV is ready');
    assert.equal(second.doc.querySelector('.cvc-end-title').textContent, 'All 22 ticked? Your CV is ready', 'other open copies follow');
    page.destroy();
});

test('untick all asks in place (Yes / Cancel), never through window.confirm(), then clears every tick', () => {
    const { doc, container, nav, end } = pageDom();
    const store = memoryStore({ ticks: {} });
    // A Flutter WebView with no dialog handler answers confirm() with "no": the page must never depend on it.
    doc.defaultView.confirm = () => { throw new Error('window.confirm() must not be used'); };
    const code = fs.readFileSync(path.join(ROOT, 'scripts', 'articleship-cv-checklist.js'), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /\bconfirm\s*\(/);
    CV.start({ container, nav, end, content: CONTENT, store });
    const reset = doc.querySelector('.cvc-reset');
    const box = doc.querySelector('.cvc-confirm');
    assert.ok(box.hidden);
    const input = doc.querySelector('.ap-cl-check input');
    input.checked = true;
    input.dispatchEvent(new doc.defaultView.Event('change'));
    assert.equal(reset.hidden, false);
    reset.click();
    assert.equal(box.hidden, false);
    assert.ok(reset.hidden, 'the question replaces the button');
    assert.equal(doc.querySelector('.cvc-confirm-q').textContent, 'Untick all 22?');
    assert.equal(box.getAttribute('role'), 'group');
    assert.equal(box.getAttribute('aria-labelledby'), 'cvc-confirm-q');
    assert.equal(doc.activeElement, doc.querySelector('.cvc-confirm-no'), 'focus on Cancel: Enter never wipes the ticks');
    doc.querySelector('.cvc-confirm-no').click();
    assert.ok(box.hidden);
    assert.equal(reset.hidden, false);
    assert.equal(doc.activeElement, reset);
    assert.equal(Object.keys(store.get().ticks).length, 1, 'cancel keeps the ticks');
    // Escape cancels too.
    reset.click();
    box.dispatchEvent(new doc.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert.ok(box.hidden);
    assert.equal(Object.keys(store.get().ticks).length, 1);
    reset.click();
    doc.querySelector('.cvc-confirm-yes').click();
    assert.deepEqual(store.get().ticks, {});
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '0 of 22 done');
    assert.ok(reset.hidden);
    assert.ok(box.hidden);
    assert.equal(doc.activeElement, doc.querySelector('.ap-cl-check input'), 'back to check 1');
});

test('boot: gate, content and store; a failed load shows "Try again" instead of a blank page', async () => {
    const { doc } = pageDom();
    const store = memoryStore({ ticks: { 'one-page': true } });
    const opened = [];
    let mergeUsed = null;
    const okFetch = async url => ({ ok: true, status: 200, json: async () => { opened.push(url); return JSON.parse(CONTENT_TEXT); } });
    const page = await CV.boot({
        document: doc,
        Gate: { protect: () => Promise.resolve({ state: 'allow' }) },
        Progress: { open: (tool, opts) => { assert.equal(tool, 'cv-checklist'); assert.equal(typeof opts.merge, 'function'); mergeUsed = opts.merge; return store; } },
        fetch: okFetch
    });
    assert.ok(page);
    assert.deepEqual(opened, ['/articleship-program/cv-checklist/cv-checklist.json']);
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '1 of 22 done');
    const merged = mergeUsed({ ticks: { a: true }, at: { a: 5 }, cvs: { gst: { ticks: { b: true }, at: { b: 5 } } } },
        { ticks: {}, at: { a: 1 }, cvs: { gst: { ticks: {}, at: { b: 9 } }, 'direct-tax': { ticks: { c: true }, at: { c: 2 } } } });
    assert.deepEqual(merged.ticks, { a: true });
    assert.deepEqual(merged.cvs, { gst: { ticks: {}, at: { b: 9 } }, 'direct-tax': { ticks: { c: true }, at: { c: 2 } } }, 'the later untick wins, per domain');

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

function tickAll(doc) {
    [...doc.querySelectorAll('.ap-cl-check input')].forEach(input => {
        if (input.checked) return;
        input.checked = true;
        input.dispatchEvent(new doc.defaultView.Event('change'));
    });
}

test('personal review: open at any time (like its LMS row); the one question goes first; the PDF follows in the chat', () => {
    const { doc, container, nav, end } = pageDom();
    const store = memoryStore({ ticks: {} });
    let domains = { main: 'gst', backup: null };
    CV.start({ container, nav, end, content: CONTENT, store, domains: () => domains });
    const review = doc.querySelector('.cvc-end-links .cvc-review');
    assert.ok(review, 'the review button is the WhatsApp link');
    assert.equal(review.textContent, 'Personal CV review');
    assert.equal(review.getAttribute('aria-disabled'), null, 'never shown as locked');
    const reviewer = doc.querySelector('.cvc-end-links a');
    assert.equal(reviewer.getAttribute('href'), '/cv-reviewer/', 'the CV Reviewer is open at any time');
    assert.match(doc.querySelector('.cvc-end-text').textContent, /one personal review/);
    // The question is asked on the page, between the two buttons.
    const field = doc.querySelector('.cvc-end-links textarea#cvc-question');
    assert.ok(field);
    assert.equal(doc.querySelector('label[for="cvc-question"]').textContent, 'Your one question for the reviewer');
    const kids = [...doc.querySelector('.cvc-end-links').children];
    assert.ok(kids.indexOf(field.closest('.cvc-ask')) < kids.indexOf(review), 'the question comes before its button');

    // No question yet: the tap asks for it instead of sending a bare message.
    const bare = new doc.defaultView.MouseEvent('click', { cancelable: true });
    review.dispatchEvent(bare);
    assert.equal(bare.defaultPrevented, true);
    assert.equal(doc.activeElement, field);
    assert.match(doc.querySelector('.cvc-ask-hint').textContent, /Type your one question first/);

    // Before 100% it still opens, and the count says where the student is.
    const inputs = [...doc.querySelectorAll('.ap-cl-check input')];
    inputs.slice(0, 14).forEach(input => { input.checked = true; input.dispatchEvent(new doc.defaultView.Event('change')); });
    field.value = 'Is my Tally line strong enough for GST?';
    field.dispatchEvent(new doc.defaultView.Event('input'));
    assert.equal(doc.querySelector('.cvc-ask-hint').textContent, '');
    const early = new doc.defaultView.MouseEvent('click', { cancelable: true });
    review.dispatchEvent(early);
    assert.equal(early.defaultPrevented, false);
    const href = review.getAttribute('href');
    assert.ok(href.startsWith('https://wa.me/917228881182?text='));
    assert.ok(!href.includes('+'), 'spaces as %20');
    assert.equal(decodeURIComponent(href.split('?text=')[1]),
        'Hi, please review my articleship CV.\nMy question: Is my Tally line strong enough for GST?\nDomain: GST\nCV checklist: 14 of 22 done\nI’m attaching my CV PDF next.');
    assert.doesNotMatch(decodeURIComponent(href), /attached/, 'never claims a PDF the link cannot carry');

    tickAll(doc);
    // Built when tapped: a domain changed since the page opened is the one sent, in the file name's words.
    domains = { main: 'direct-tax' };
    review.dispatchEvent(new doc.defaultView.MouseEvent('click', { cancelable: true }));
    const text = decodeURIComponent(review.getAttribute('href').split('?text=')[1]);
    assert.match(text, /\nDomain: Direct Tax\nCV checklist: 22 of 22 done\n/);
    assert.equal(text.split('\n')[1], 'My question: Is my Tally line strong enough for GST?', 'the question first');
    // No domain set: the line is there to fill in.
    assert.equal(CV.reviewMessage({ question: 'x', done: 22, total: 22, domain: '' }).split('\n')[2], 'Domain: ');
    assert.equal(CV.reviewHref('/not-whatsapp/', 'x'), '/not-whatsapp/');
});

test('intro is built from the real count, so a different content file never shows a stale number', () => {
    assert.equal(CV.introText('{n} checks, in the order you build a CV.', 25), '25 checks, in the order you build a CV.');
    assert.equal(CV.introText('22 checks, in the order you build a CV.', 19), '19 checks, in the order you build a CV.');
    assert.equal(CV.introText('', 3), '3 checks, in the order you build a CV. Tick a check only when your PDF passes it.');
    const small = pageDom();
    CV.start({ container: small.container, lede: small.lede, content: { intro: '22 checks, in the order you build a CV.', items: ['a', 'b', 'c'] } });
    assert.equal(small.lede.textContent, '3 checks, in the order you build a CV.');
});

test('examples: bold shows as bold (text only, never HTML); the file name follows "my domain"', () => {
    assert.deepEqual(CV.boldParts('reconciled **₹4.2 lakh** of vendor balances'),
        [{ text: 'reconciled ', bold: false }, { text: '₹4.2 lakh', bold: true }, { text: ' of vendor balances', bold: false }]);
    const { doc, container } = pageDom();
    let domains = {};
    const page = CV.start({ container, content: CONTENT, domains: () => domains });
    const boldBox = doc.querySelector('.ap-cl-item[data-id="bold-and-even"] .cvc-ex');
    assert.deepEqual([...boldBox.querySelectorAll('strong.cvc-ex-bold')].map(b => b.textContent),
        ['₹4.2 lakh', 'Reconciled ₹4.2 lakh of vendor balances for 60 suppliers']);
    assert.ok(!boldBox.textContent.includes('**'));
    const injected = pageDom();
    CV.start({ container: injected.container, content: { items: [{ check: 'x', example: '**<img src=x onerror=alert(1)>**' }] } });
    assert.equal(injected.doc.querySelectorAll('img').length, 0);
    assert.equal(injected.doc.querySelector('.cvc-ex-bold').textContent, '<img src=x onerror=alert(1)>');

    const fileBox = () => doc.querySelector('.ap-cl-item[data-id="file-name"] .cvc-ex');
    assert.equal(fileBox().querySelectorAll('.cvc-ex-mine').length, 0, 'no domain set: the example only');
    domains = { main: 'gst', backup: 'direct-tax' };
    page.refreshDomain();
    assert.deepEqual([...fileBox().querySelectorAll('.cvc-ex-mine')].map(p => p.textContent),
        ['For your domain: Your Name - Articleship CV - GST.pdf', 'For your backup domain: Your Name - Articleship CV - Direct Tax.pdf']);
    assert.match(fileBox().children[0].textContent, /^✅ One domain: Devika Joshi/, 'the model example stays first');
    domains = { main: 'statutory-audit' };
    page.refreshDomain();
    assert.deepEqual([...fileBox().querySelectorAll('.cvc-ex-mine')].map(p => p.textContent), ['For your domain: Your Name - Articleship CV - Audit.pdf']);
    // Every one of the 13 domains has a file-name word, and no word drops part of its domain.
    P.DOMAINS.forEach(domain => assert.ok(CV.FILE_DOMAIN[domain.slug], domain.slug));
    assert.equal(CV.FILE_DOMAIN['ma-tax'], 'M&A Tax');
    assert.equal(CV.FILE_DOMAIN['ib-er'], 'IB and Equity Research');
});

test('screen readers: only the count is live (not "Jump to N"); every Example names its check', () => {
    const { doc, container } = pageDom();
    CV.start({ container, content: CONTENT, store: memoryStore({ ticks: {} }) });
    assert.equal(doc.querySelectorAll('[aria-live]').length, 1);
    const live = doc.querySelector('[aria-live]');
    assert.ok(live.classList.contains('ap-progress-count'));
    assert.equal(live.getAttribute('role'), 'status');
    assert.equal(doc.querySelector('.cvc-next').closest('[aria-live]'), null);
    const labels = [...doc.querySelectorAll('.ap-cl-example:not(.cvc-fold) > summary')].map(s => s.getAttribute('aria-label'));
    assert.equal(labels.length, 22);
    assert.deepEqual(labels, CONTENT.items.map((_, i) => 'Example for check ' + (i + 1)));
    assert.deepEqual([...doc.querySelectorAll('.cvc-fold > summary')].map(s => s.getAttribute('aria-label')),
        ['More questions, check 17', 'Skills and interests that survive, check 17', 'Six more fixes reviewers make, check 18']);
});

test('untick all stamps each untick, so the other device’s older ticks do not come back', () => {
    let t = 1000;
    const { doc, container } = pageDom();
    const store = memoryStore({ ticks: {} });
    const page = CV.start({ container, content: CONTENT, store, now: () => t });
    t = 2000; page.list.tick('one-page', true);
    t = 3000; page.list.tick('file-name', true);
    const before = store.get();
    assert.deepEqual(before.at, { 'one-page': 2000, 'file-name': 3000 });
    t = 5000;
    doc.querySelector('.cvc-reset').click();
    doc.querySelector('.cvc-confirm-yes').click();
    const after = store.get();
    assert.deepEqual(after.ticks, {});
    assert.deepEqual(after.at, { 'one-page': 5000, 'file-name': 5000 });
    // The other device still has the old ticks and has since ticked one more check.
    const other = C.applyTicks(before, { 'linkedin': true }, 4000);
    assert.deepEqual(C.mergeTicks(after, other).ticks, { linkedin: true });
    assert.deepEqual(C.mergeTicks(other, after).ticks, { linkedin: true });
});

test('boot: without the gate script, or after a failure, the page is never left hidden', async () => {
    const quiet = async fn => { const orig = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = orig; } };
    const okFetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(CONTENT_TEXT) });

    // Gate script missing: the checklist shows.
    const a = pageDom();
    a.doc.documentElement.classList.add('ap-gated');
    const page = await CV.boot({ document: a.doc, Gate: null, Progress: null, fetch: okFetch });
    assert.ok(page);
    assert.equal(a.doc.documentElement.classList.contains('ap-gated'), false);

    // Gate script missing and the content fails: the "Try again" card is visible, not hidden.
    const b = pageDom();
    b.doc.documentElement.classList.add('ap-gated');
    await quiet(() => CV.boot({ document: b.doc, Gate: null, Progress: null, fetch: async () => ({ ok: false, status: 503 }) }));
    assert.equal(b.doc.documentElement.classList.contains('ap-gated'), false);
    assert.match(b.doc.querySelector('.cvc-error').textContent, /Try again/);

    // A gate card is showing (log in / enrol): it stays in charge of the page.
    const c = pageDom();
    c.doc.documentElement.classList.add('ap-gated');
    const card = c.doc.createElement('div');
    card.id = 'ap-gate';
    c.doc.body.appendChild(card);
    await quiet(() => CV.boot({ document: c.doc, Gate: { protect: () => new Promise(() => {}) }, Progress: null, fetch: async () => ({ ok: false, status: 503 }) }));
    assert.equal(c.doc.documentElement.classList.contains('ap-gated'), true);
});

test('page: a visible "‹ Day 1" link back, and the title said once', () => {
    const doc = new JSDOM(PAGE).window.document;
    const back = doc.querySelector('.cvc-hero a.cvc-back');
    assert.ok(back);
    assert.equal(back.textContent.trim(), '‹ Day 1');
    assert.equal(back.getAttribute('href'), '/learning-management-system/course?course=msc-articleship-program&session=2');
    const hero = doc.querySelector('.cvc-hero').textContent;
    assert.equal((hero.match(/check your cv/gi) || []).length, 1, 'no eyebrow repeating the title');
    const brand = doc.querySelector('.ap-brand');
    assert.equal(brand.getAttribute('href'), '/learning-management-system/course?course=msc-articleship-program', 'the logo opens the programme');
    assert.notEqual(brand.getAttribute('href'), back.getAttribute('href'));
    assert.doesNotMatch(brand.getAttribute('aria-label'), /Day 1/);
    // The slot for the two-CV switch sits under the lede, hidden until the student has a backup domain.
    const slot = doc.querySelector('.cvc-hero #cvc-cvs');
    assert.ok(slot && slot.hasAttribute('hidden'));
});

// ---------- Every link leads somewhere real ----------

/** A same-origin URL → the repo file that serves it (Cloudflare Pages: /x/ = x/index.html, /x = x.html). */
function servedFile(href) {
    const clean = decodeURIComponent(href.split(/[?#]/)[0]).replace(/^\//, '');
    const candidates = clean === '' || clean.endsWith('/')
        ? [clean + 'index.html']
        : [clean, clean + '.html', clean + '/index.html'];
    return candidates.find(rel => fs.existsSync(path.join(ROOT, rel)) && fs.statSync(path.join(ROOT, rel)).isFile()) || null;
}

function gitTracked(rel) {
    const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', rel], { cwd: ROOT, encoding: 'utf8' });
    if (result.error) return null;
    return result.status === 0;
}

test('links: every same-site fix and closing-card link is a page this branch ships (tracked in git)', t => {
    const links = [...CONTENT.items.filter(item => item.fix).map(item => item.fix.href), ...CONTENT.done.links.map(link => link.href)];
    const local = [...new Set(links.filter(href => href.startsWith('/')))];
    assert.ok(local.length >= 4);
    const untracked = [];
    local.forEach(href => {
        const file = servedFile(href);
        assert.ok(file, href + ' resolves to a file in the repo');
        const tracked = gitTracked(file);
        if (tracked === false) untracked.push(file);
    });
    // A file only in this working copy would be a dead link once the branch is pushed.
    assert.deepEqual(untracked, [], 'not committed yet: ' + untracked.join(', '));
    if (gitTracked('index.html') === null) t.diagnostic('git not available: checked the files on disk only');
});

// ---------- Fix-it pages: the page a link opens carries the heading it promises ----------

function normaliseText(text) {
    return String(text || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/­/g, '').replace(/\s+/g, ' ').trim();
}

/** The built PDF for an LMS row title, from the uploads manifest (null until the content build has made it). */
function rowPdf(title) {
    const manifest = path.join(CONTENT_BUILD, 'lms', 'uploads-manifest.csv');
    if (!fs.existsSync(manifest)) return null;
    const [head, ...rows] = csvRows(fs.readFileSync(manifest, 'utf8'));
    // Current manifest: release, storage_path, row, title, role, state, waiting_for, source (build/…/file.pdf), …
    const col = name => (head || []).indexOf(name);
    if (col('title') >= 0 && col('source') >= 0) {
        const hit = rows.find(cells => cells[col('title')] === title && /\.pdf$/i.test(cells[col('storage_path')] || '') &&
            /^build\//.test(cells[col('source')] || ''));
        if (!hit) return null;
        const file = path.join(CONTENT_BUILD, hit[col('source')].replace(/^build\//, ''));
        return fs.existsSync(file) ? file : null;
    }
    // Earlier manifest: file, …, title, folder, file name.
    const row = rows.find(cells => cells[2] === title && /\.pdf$/i.test(cells[0]));
    if (!row) return null;
    const dir = path.join(CONTENT_BUILD, row[3]);
    if (!fs.existsSync(dir)) return null;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const pdfs = fs.readdirSync(dir).filter(name => /\.pdf$/i.test(name) && !/print/i.test(name));
    const pick = (row[4] && pdfs.includes(row[4]) && row[4]) || pdfs.find(name => name === title + '.pdf') ||
        pdfs.find(name => name.toLowerCase().replace(/\.pdf$/, '') === slug) || (pdfs.length === 1 ? pdfs[0] : null);
    return pick ? path.join(dir, pick) : null;
}

/**
 * Where a page carries a heading: its first occurrence that is not a contents-list entry (one right after "–", "•" or
 * "→"), or -1. Same rule as build/tools/cv-checklist/wire_pages.mjs: a day divider lists the Guidebook's questions near
 * its top, while the question itself starts lower down on its own page.
 */
function headingAt(pageText, wanted) {
    const text = normaliseText(pageText);
    for (let at = text.indexOf(wanted); at >= 0; at = text.indexOf(wanted, at + 1)) {
        if (!/[–—•→-]\s?$/.test(text.slice(Math.max(0, at - 3), at))) return at;
    }
    return -1;
}

/** Every page's text, read once per PDF (pdftotext ends each page with a form feed); null if unreadable. */
const pdfCache = new Map();
function pdfPages(file) {
    if (pdfCache.has(file)) return pdfCache.get(file);
    const result = spawnSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    // Unreadable, for example while the content build is re-rendering it.
    const pages = result.error || result.status !== 0 ? null : result.stdout.split('\f').slice(0, -1);
    pdfCache.set(file, pages && pages.length ? pages : null);
    return pdfCache.get(file);
}

test('fix-it pages: each deep link opens the page that carries its heading (checked once the PDF is built)', t => {
    if (!fs.existsSync(CONTENT_BUILD)) { t.skip('content build folder not on this machine'); return; }
    if (spawnSync('pdftotext', ['-v']).error) { t.skip('pdftotext (poppler) not installed'); return; }
    // Links that open a whole file (no page, no heading) have nothing to check.
    // Every deep link a check draws: its Fix it and its "also" links (e.g. Guidebook ch 3, q11).
    const deep = [];
    CONTENT.items.forEach(item => [item.fix, ...(item.also || [])].forEach(link => {
        if (link && link.href.startsWith('/learning-management-system/') && link.find) deep.push({ id: item.id, fix: link });
    }));
    const waiting = [];
    let checked = 0;
    deep.forEach(item => {
        const params = new URLSearchParams(item.fix.href.split('?')[1]);
        const title = params.get('resource');
        const page = Number(params.get('page')) || 1;
        const file = rowPdf(title);
        if (!file) { waiting.push(title); return; }
        const wanted = normaliseText(item.fix.find);
        const texts = pdfPages(file);
        if (!texts) { waiting.push(title + ' (unreadable)'); return; }
        const at = texts.map(text => headingAt(text, wanted));
        const fix = 'Run build/tools/cv-checklist/wire_pages.mjs to take the page from the PDF.';
        assert.ok(at[page - 1] >= 0, item.id + ': "' + title + '" page ' + page + ' does not carry "' + item.fix.find + '". ' + fix);
        // Its heading, not a mention: no other page carries the text much earlier on the page (same rule as wire_pages.mjs).
        const best = Math.min(...at.filter(i => i >= 0));
        assert.ok(at[page - 1] <= best + 150, item.id + ': "' + item.fix.find + '" heads page ' + (at.indexOf(best) + 1) + ', not ' + page + '. ' + fix);
        checked += 1;
    });
    t.diagnostic('checked ' + checked + ' fix-it pages; PDFs not built yet: ' + ([...new Set(waiting)].join(', ') || 'none'));
});

// ---------- One content file, one sheet fallback ----------

test('content: the website copy is the content build’s file, byte for byte (checked on the machine that has the build)', t => {
    const built = path.join(CONTENT_BUILD, 'day-1', '1.8', 'cv-checklist.json');
    if (!fs.existsSync(built)) { t.skip('content build not on this machine'); return; }
    assert.equal(CONTENT_TEXT, fs.readFileSync(built, 'utf8'),
        'copy build/day-1/1.8/cv-checklist.json over articleship-program/cv-checklist/cv-checklist.json (or the reverse) and rerun wire_pages.mjs');
});

/** RFC 4180 rows (quoted fields may hold commas, quotes and line breaks). */
function csvRows(text) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i += 1;
            row.push(field); rows.push(row); row = []; field = '';
        } else field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
}

test('sheet fallback: the one generated sheet (build/day-1/1.8/out) carries every check, example and fix link of this JSON', t => {
    const csvPath = path.join(CONTENT_BUILD, 'day-1', '1.8', 'out', 'CV checklist.csv');
    if (!fs.existsSync(csvPath)) { t.skip('content build not on this machine'); return; }
    assert.ok(fs.existsSync(path.join(CONTENT_BUILD, 'day-1', '1.8', 'out', 'CV checklist.xlsx')));
    assert.equal(fs.existsSync(path.join(CONTENT_BUILD, 'tools', 'cv-checklist', 'out')), false, 'one sheet only: the old tools/cv-checklist/out copy is gone');
    const rows = csvRows(fs.readFileSync(csvPath, 'utf8').replace(/^﻿/, '')).slice(1);
    const stale = 'stale: run python3 src/build.py in build/day-1/1.8';
    assert.equal(rows.length, CONTENT.items.length, stale);
    CONTENT.items.forEach((item, i) => {
        // a CSV has no bold: a line with bold says in words where the bold goes
        const plain = line => {
            if (!line.includes('**')) return line;
            const body = /^[✅❌] /.test(line) ? line.slice(2) : line;
            const parts = [...body.matchAll(/\*\*(.+?)\*\*/g)].map(m => m[1]);
            const note = parts.length === 1 && body.trim() === '**' + parts[0] + '**' ? ' (whole line in bold)'
                : ' (only ' + parts.map(p => '“' + p + '”').join(' and ') + ' in bold)';
            return line.replace(/\*\*/g, '') + note;
        };
        const example = (Array.isArray(item.example) ? item.example : item.example.split('\n')).map(plain).join('\n');
        const link = item.fix ? (item.fix.href.startsWith('/') ? 'https://www.mystudentclub.com' + item.fix.href : item.fix.href) : '';
        assert.deepEqual(rows[i], [String(i + 1), item.section, item.check, example, item.fix ? item.fix.label : '', link, 'FALSE'], stale + ' (check ' + (i + 1) + ')');
    });
});

test('phones: the progress row slims down once the title scrolls away, and grows back', () => {
    const { doc, container } = pageDom();
    CV.start({ container, content: CONTENT, store: memoryStore({ ticks: {} }) });
    const hero = doc.createElement('div');
    doc.body.prepend(hero);
    const progress = container.querySelector('.ap-progress');
    let observer = null;
    class FakeObserver {
        constructor(callback, options) { this.callback = callback; this.options = options; this.targets = []; observer = this; }
        observe(target) { this.targets.push(target); }
        disconnect() { this.targets = []; }
    }
    const stop = CV.watchCompact({ target: hero, progress, Observer: FakeObserver });
    assert.deepEqual(observer.targets, [hero]);
    assert.equal(observer.options.rootMargin, '-56px 0px 0px 0px', 'the title counts as gone once it is under the top bar');
    observer.callback([{ isIntersecting: false }]);
    assert.ok(progress.classList.contains('cvc-compact'));
    observer.callback([{ isIntersecting: true }]);
    assert.equal(progress.classList.contains('cvc-compact'), false);
    observer.callback([{ isIntersecting: false }]);
    stop();
    assert.equal(progress.classList.contains('cvc-compact'), false);
    assert.deepEqual(observer.targets, []);
    // No IntersectionObserver (old browser, tests): nothing happens and nothing breaks.
    assert.equal(typeof CV.watchCompact({ target: hero, progress, Observer: null }), 'function');
    const css = fs.readFileSync(path.join(TOOL_DIR, 'cv-checklist.css'), 'utf8');
    assert.match(css, /@media \(max-width: 767px\)[\s\S]*\.ap-progress\.cvc-compact/);
    // Narrow phones: "Example +" and the fix link each on their own line, on every card.
    assert.match(css, /@media \(max-width: 419px\) \{\s*\.cvc-list \.ap-cl-extra \{ flex-direction: column;/);
});

// ---------- Folds, the next step at 100%, two CVs for two domains ----------

test('examples: "▸ Title" lines become folds of their own next to "Example", closed, text only', () => {
    assert.deepEqual(CV.exampleGroups('a\n▸ More\nb → “q”\nc\n▸ Empty\n▸ Last\nd'),
        { main: ['a'], folds: [{ title: 'More', lines: ['b → “q”', 'c'] }, { title: 'Last', lines: ['d'] }] });
    const { doc, container } = pageDom();
    CV.start({ container, content: CONTENT, store: memoryStore({ ticks: {} }), workSimulationLive: true });
    const two = doc.querySelector('.ap-cl-item[data-id="two-questions"]');
    const extra = [...two.querySelector('.ap-cl-extra').children];
    assert.deepEqual(extra.map(node => node.tagName + (node.classList.contains('cvc-fold') ? '.fold' : '')), ['DETAILS', 'DETAILS.fold', 'DETAILS.fold', 'A', 'A'],
        'Example, More questions, Skills and interests, then the fix link and the Keywords by domain link');
    assert.deepEqual(extra.filter(node => node.tagName === 'A').map(a => a.textContent), ['Practise your interview with this CV – Day 4', 'Keywords by domain']);
    const more = two.querySelector('.cvc-fold');
    assert.equal(more.querySelector('summary').textContent, 'More questions');
    assert.equal(more.open, false);
    const moreClaims = [...more.querySelectorAll('.cvc-ex-pair > strong')].map(b => b.textContent);
    assert.deepEqual(moreClaims, ['SAP', 'ICITSS completed', 'CARO 2020', 'PwC US Audit Job Simulation (Forage)', 'Reading', 'Trekking', 'Captain, cricket team', 'Volunteer teacher']);
    const main = two.querySelector('.ap-cl-example:not(.cvc-fold) .cvc-ex');
    assert.equal(main.querySelectorAll('.cvc-ex-pair').length, 3, 'three probes before the fold');
    assert.ok(!two.textContent.includes('▸'), 'the marker never shows');
    const bold = doc.querySelector('.ap-cl-item[data-id="bold-and-even"]');
    const ten = bold.querySelector('.cvc-fold');
    assert.equal(ten.querySelector('summary').textContent, 'Six more fixes reviewers make');
    assert.equal(ten.querySelectorAll('.cvc-ex p').length, 6);
    assert.equal(bold.querySelector('.ap-cl-example:not(.cvc-fold) .cvc-ex').querySelectorAll('p').length, 4, '✅, ❌, the bold rule, the dates rule');
    const injected = pageDom();
    CV.start({ container: injected.container, content: { items: [{ check: 'x', example: ['a', '▸ <img src=x onerror=alert(1)>', '<b>y</b>'] }] } });
    assert.equal(injected.doc.querySelectorAll('img, b').length, 0);
    assert.equal(injected.doc.querySelector('.cvc-fold > summary').textContent, '<img src=x onerror=alert(1)>');
});

test('release 1 (Work Simulation not out): every check, fold and link, with no Work Simulation line; the switch brings it back', () => {
    const ws = /work[\s-]?simulation/i;
    assert.match(CONTENT_TEXT, ws, 'the content carries the Work Simulation lines for release 2');
    const off = pageDom();
    CV.start({ container: off.container, nav: off.nav, end: off.end, lede: off.lede, content: CONTENT, store: memoryStore({ ticks: {} }), workSimulationLive: false });
    assert.doesNotMatch(off.doc.body.textContent, ws, 'nowhere on the page');
    assert.ok(![...off.doc.querySelectorAll('a')].some(a => P.isWorkSimulationLink(a.getAttribute('href'))), 'no link to it');
    assert.equal(off.doc.querySelectorAll('.ap-cl-item').length, 22, 'every check stays');
    assert.equal(off.doc.querySelector('.ap-progress-count').textContent, '0 of 22 done');
    const two = off.doc.querySelector('.ap-cl-item[data-id="two-questions"]');
    const main = two.querySelector('.ap-cl-example:not(.cvc-fold) .cvc-ex');
    assert.deepEqual([...main.querySelectorAll('.cvc-ex-pair > strong')].map(b => b.textContent), ['Excel (proficient): XLOOKUP, PivotTables', 'Tally Prime', 'Family shop GST: matched 40 purchase invoices to GSTR-2B'],
        'release 1 swaps the Work Simulation probe for the family-shop GST probe');
    assert.match(main.textContent, /Read each line aloud/, 'the method stays');
    assert.match(two.textContent, /Keep an interest only if you still do it/, 'the interests rule stays');
    const certs = off.doc.querySelector('.ap-cl-item[data-id="certifications"]');
    assert.match(certs.textContent, /Heading “Certifications and job simulations”/);
    assert.match(certs.textContent, /the MSC Articleship Program line and ICITSS don’t count in the four\./);

    const on = pageDom();
    CV.start({ container: on.container, content: CONTENT, store: memoryStore({ ticks: {} }), workSimulationLive: true });
    assert.match(on.doc.body.textContent, /Statutory audit Work Simulation: flagged 3 cut-off errors/);
    // With no option, the page draws the shared switch.
    const shipped = pageDom();
    CV.start({ container: shipped.container, content: CONTENT, store: memoryStore({ ticks: {} }) });
    assert.equal(ws.test(shipped.doc.body.textContent), P.WORK_SIMULATION_LIVE);
    assert.equal(CV.WORK_SIMULATION_LIVE, P.WORK_SIMULATION_LIVE, 'the one shared flag');
});

test('helpers: the button offers the next check, then the two reviews', () => {
    const model = C.normalise(CONTENT);
    assert.equal(CV.nextStep(model, C.summarise(model, {})), null, 'nothing before the first tick');
    assert.deepEqual(CV.nextStep(model, C.summarise(model, { 'built-in-builder': true })),
        { kind: 'check', id: 'one-page', no: 2, label: 'Jump to 2', aria: 'Jump to check 2' });
    const all = Object.fromEntries(model.items.map(i => [i.id, true]));
    assert.deepEqual(CV.nextStep(model, C.summarise(model, all)),
        { kind: 'end', label: 'Next: two reviews', aria: 'Next: two reviews, after the checklist' });
    assert.deepEqual(CV.cvList({ main: 'gst', backup: 'direct-tax' }), ['gst', 'direct-tax']);
    assert.deepEqual(CV.cvList({ main: 'gst', backup: 'gst' }), ['gst']);
    assert.deepEqual(CV.cvList({}), []);
});

test('two CVs: "Checking: GST CV / Direct Tax CV" keeps the ticks of each domain apart, and survives a reload', () => {
    const dom = new JSDOM('<!doctype html><div class="cvc-hero"><p id="cvc-lede"></p><div id="cvc-cvs" hidden></div></div><div id="app"></div><nav id="cvc-nav"></nav><div id="cvc-end"></div>');
    const doc = dom.window.document;
    const parts = { container: doc.getElementById('app'), nav: doc.getElementById('cvc-nav'), end: doc.getElementById('cvc-end'), switcher: doc.getElementById('cvc-cvs') };
    const store = memoryStore({ ticks: {} });
    let domains = { main: 'gst', backup: null };
    const page = CV.start(Object.assign({ content: CONTENT, store, domains: () => domains }, parts));
    assert.ok(parts.switcher.hidden, 'one domain: no switch');
    page.list.tick('one-page', true);
    page.list.tick('file-name', true);
    assert.equal(page.checking(), 'gst');
    assert.deepEqual(Object.keys(store.get().cvs.gst.ticks).sort(), ['file-name', 'one-page'], 'one key per domain');

    // A backup domain arrives (from the CV Recommender or the roadmaps): the switch shows, GST stays selected.
    domains = { main: 'gst', backup: 'direct-tax' };
    page.refreshDomain();
    assert.equal(parts.switcher.hidden, false);
    assert.equal(parts.switcher.querySelector('legend').textContent, 'Checking:');
    const pills = () => [...parts.switcher.querySelectorAll('.cvc-cv')].map(l => [l.querySelector('.cvc-cv-name').textContent, l.querySelector('.cvc-cv-count').textContent, l.querySelector('input').checked]);
    assert.deepEqual(pills(), [['GST CV', '2/22', true], ['Direct Tax CV', '0/22', false]]);

    // Switch to the backup CV: its own ticks, from zero; the GST ticks stay.
    const radio = parts.switcher.querySelectorAll('input')[1];
    radio.checked = true;
    radio.dispatchEvent(new dom.window.Event('change'));
    assert.equal(page.checking(), 'direct-tax');
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '0 of 22 done');
    page.list.tick('linkedin', true);
    assert.deepEqual(pills(), [['GST CV', '2/22', false], ['Direct Tax CV', '1/22', true]]);
    assert.deepEqual(store.get().cvs['direct-tax'].ticks, { linkedin: true });
    assert.deepEqual(Object.keys(store.get().cvs.gst.ticks).sort(), ['file-name', 'one-page']);
    // The untick-all question names the CV, and only that CV is cleared.
    doc.querySelector('.cvc-reset').click();
    assert.equal(doc.querySelector('.cvc-confirm-q').textContent, 'Untick all 22 on your Direct Tax CV?');
    doc.querySelector('.cvc-confirm-yes').click();
    assert.deepEqual(store.get().cvs['direct-tax'].ticks, {});
    assert.equal(Object.keys(store.get().cvs.gst.ticks).length, 2);
    // The review message names the CV being checked.
    page.list.tick('linkedin', true);
    doc.getElementById('cvc-question').value = 'Which proof first?';
    const review = doc.querySelector('.cvc-review');
    review.dispatchEvent(new dom.window.MouseEvent('click', { cancelable: true }));
    assert.match(decodeURIComponent(review.getAttribute('href')), /\nDomain: Direct Tax\nCV checklist: 1 of 22 done\n/);

    // A reload on this device opens the CV last checked.
    const again = new JSDOM('<!doctype html><div id="cvc-cvs" hidden></div><div id="app"></div>');
    const second = CV.start({ container: again.window.document.getElementById('app'), switcher: again.window.document.getElementById('cvc-cvs'), content: CONTENT, store, domains: () => domains });
    assert.equal(second.checking(), 'direct-tax');
    assert.equal(again.window.document.querySelector('.ap-progress-count').textContent, '1 of 22 done');
    second.choose('gst');
    assert.equal(again.window.document.querySelector('.ap-progress-count').textContent, '2 of 22 done');
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '2 of 22 done', 'other open copies follow');
    assert.equal(second.choose('valuation'), false, 'only the student’s own domains');

    // The backup is dropped: back to one CV, my domain's.
    domains = { main: 'gst', backup: null };
    page.refreshDomain();
    assert.ok(parts.switcher.hidden);
    assert.equal(page.checking(), 'gst');
});

test('two CVs: ticks made before any domain was set go to my domain’s CV, once', () => {
    const { container } = pageDom();
    const store = memoryStore({ ticks: {} });
    let domains = {};
    const page = CV.start({ container, content: CONTENT, store, domains: () => domains });
    page.list.tick('one-page', true);
    page.list.tick('linkedin', true);
    assert.deepEqual(Object.keys(store.get().ticks).sort(), ['linkedin', 'one-page'], 'no domain: the plain ticks');
    domains = { main: 'gst', backup: 'direct-tax' };
    page.refreshDomain();
    assert.equal(page.summary().done, 2, 'my domain’s CV shows them at once');
    page.choose('direct-tax');
    assert.equal(page.summary().done, 0, 'the backup CV starts from zero');
    page.choose('gst');
    page.list.tick('city-only', true);
    const data = store.get();
    assert.deepEqual(Object.keys(data.cvs.gst.ticks).sort(), ['city-only', 'linkedin', 'one-page'], 'taken over with the first change');
    assert.deepEqual(data.ticks, {}, 'moved, not copied');
    // A new "my domain" later is a new CV: it does not inherit them again.
    domains = { main: 'valuation' };
    page.refreshDomain();
    assert.equal(page.summary().done, 0);
});

test('two CVs: with one domain, "Add a second CV" sets the shared backup domain and opens the switch', () => {
    const dom = new JSDOM('<!doctype html><div id="cvc-cvs" hidden></div><div id="app"></div>');
    const doc = dom.window.document;
    const switcher = doc.getElementById('cvc-cvs');
    const store = memoryStore({ ticks: {} });
    let domains = {};
    const saved = [];
    const page = CV.start({ container: doc.getElementById('app'), switcher, content: CONTENT, store, domains: () => domains,
        domainSlugs: P.DOMAINS.map(d => d.slug), addBackup: slug => { saved.push(slug); domains = Object.assign({}, domains, { backup: slug }); } });
    assert.ok(switcher.hidden, 'no domain yet: nothing to add a second CV to');
    domains = { main: 'statutory-audit' };
    page.refreshDomain();
    assert.equal(switcher.hidden, false);
    const select = switcher.querySelector('select.cvc-add-select');
    assert.equal(switcher.querySelector('.cvc-add-label').textContent, 'Applying in two domains?');
    const options = [...select.options].map(o => [o.value, o.textContent]);
    assert.deepEqual(options[0], ['', 'Add a second CV']);
    assert.equal(options.length, 13, 'the 12 other domains');
    assert.ok(!options.some(o => o[0] === 'statutory-audit'));
    page.list.tick('one-page', true);
    select.value = 'internal-audit';
    select.dispatchEvent(new dom.window.Event('change'));
    assert.deepEqual(saved, ['internal-audit']);
    assert.deepEqual([...switcher.querySelectorAll('.cvc-cv-name')].map(n => n.textContent), ['Audit CV', 'Internal Audit CV']);
    assert.equal(doc.activeElement, switcher.querySelectorAll('input')[1], 'focus on the new CV');
    assert.equal(page.checking(), 'statutory-audit', 'still on the first CV until the student switches');
    assert.equal(page.summary().done, 1);
});

test('rows not live yet ("needs"): the check reads as it is until its row is in the course, then swaps the line and adds the link', () => {
    // The engine: a "replace" line swaps and "also" links are added once the row is live; the input is never changed.
    const sample = { items: [{ id: 'x', check: 'X', example: ['now', 'stays'], also: [{ label: 'A', href: '/a' }],
        needs: { _what: 'note', '4.4': { replace: { now: 'later' }, also: [{ label: 'B', href: '/b' }] } } }] };
    const before = JSON.stringify(sample);
    const sampleOff = CV.withLiveRowLines(sample, () => false).items[0];
    assert.deepEqual([sampleOff.example, sampleOff.also.map(l => l.label), sampleOff.needs], [['now', 'stays'], ['A'], undefined]);
    const sampleOn = CV.withLiveRowLines(sample, row => row === '4.4').items[0];
    assert.deepEqual([sampleOn.example, sampleOn.also.map(l => l.label)], [['later', 'stays'], ['A', 'B']]);
    assert.equal(JSON.stringify(sample), before, 'the input is never changed');
    // Check 11 (content round 10): the attempts line points to Guidebook ch 7, q8 in both releases; row 4.4 adds the booklet link.
    const raw = CONTENT.items.find(item => item.id === 'groups-attempts');
    assert.ok(raw.needs && raw.needs['4.4'], 'the content keeps the HR round and GD booklet link for when row 4.4 ships');
    const notLive = CV.withLiveRowLines(CONTENT, () => false).items.find(item => item.id === 'groups-attempts');
    assert.equal(notLive.needs, undefined, 'the needs key is never drawn');
    assert.ok(notLive.example.some(line => /your interview answer: Guidebook ch 7, q8\./.test(line)));
    assert.ok(!notLive.also.some(link => /HR\+round/.test(link.href)));
    const live = CV.withLiveRowLines(CONTENT, row => row === '4.4').items.find(item => item.id === 'groups-attempts');
    assert.deepEqual(live.example, notLive.example, 'no line swap for this check');
    assert.ok(live.also.some(link => /resource=HR\+round\+and\+GD\+booklet/.test(link.href)), 'the booklet link is added');
    // Shipped (row 4.4 in ROWS_NOT_LIVE): the page never names or links the booklet.
    const { doc, container } = pageDom();
    CV.start({ container, content: CONTENT, store: memoryStore({ ticks: {} }) });
    const card = doc.querySelector('.ap-cl-item[data-id="groups-attempts"]');
    assert.equal(P.ROWS_NOT_LIVE.some(row => row.row === '4.4'), !P.isRowLive('HR round and GD booklet', 4) || false);
    if (!P.isRowLive('HR round and GD booklet', 4)) {
        assert.doesNotMatch(card.textContent, /HR round and GD booklet/);
        assert.ok(![...card.querySelectorAll('a')].some(a => /HR\+round/.test(a.getAttribute('href'))));
        assert.match(card.textContent, /your interview answer: Guidebook ch 7, q8/);
    }
});
