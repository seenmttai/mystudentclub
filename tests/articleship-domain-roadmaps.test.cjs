const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const R = require('../scripts/articleship-domain-roadmaps.js');
const P = require('../scripts/articleship-progress.js');

const ROOT = path.join(__dirname, '..');
const TOOL_DIR = path.join(ROOT, 'articleship-program/domain-roadmaps');
const CONTENT = JSON.parse(fs.readFileSync(path.join(TOOL_DIR, 'roadmaps.json'), 'utf8'));
const PAGE = fs.readFileSync(path.join(TOOL_DIR, 'index.html'), 'utf8');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function copy(value) { return JSON.parse(JSON.stringify(value)); }

/** Change the anchor and wait for the page's own hashchange handler (jsdom fires it asynchronously). */
function go(win, hash) {
    return new Promise(resolve => {
        win.addEventListener('hashchange', () => setTimeout(resolve, 0), { once: true });
        win.location.hash = hash;
    });
}

function lmsRows() {
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/202610200002_articleship_program_v3_lms.sql'), 'utf8');
    return JSON.parse(sql.match(/json_populate_recordset\(NULL::public\.videos, '([\s\S]*?)'::json\)/)[1].replaceAll("''", "'"));
}
function lmsRow(day, title) {
    const session = lmsRows().find(row => row.video_number === day + 1);
    return session && session.resources.find(item => item.title === title);
}

function memoryStorage() {
    const map = new Map();
    return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}
function memorySettings() {
    return P.createStore('settings', {
        storage: memoryStorage(), client: null, sessionFlags: null, debounceMs: 0, userId: () => null,
        defaults: { myDomain: null, backupDomain: null, cvPick: null }
    });
}

function page(hash, content, settings) {
    const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', {
        url: 'http://127.0.0.1/articleship-program/domain-roadmaps/' + (hash || ''), pretendToBeVisual: true
    });
    const win = dom.window;
    win.scrollTo = () => {};
    const store = settings || memorySettings();
    const app = R.mount(win.document.getElementById('app'), content || CONTENT, { settings: store, location: win.location, history: win.history });
    const $ = sel => win.document.querySelector(sel);
    const $$ = sel => [...win.document.querySelectorAll(sel)];
    return { dom, win, app, store, $, $$ };
}

// Every string in the content file, for the text checks.
function strings(value, out = []) {
    if (typeof value === 'string') out.push(value);
    else if (Array.isArray(value)) value.forEach(v => strings(v, out));
    else if (value && typeof value === 'object') Object.values(value).forEach(v => strings(v, out));
    return out;
}

// ---------- Content ----------

test('content: validates with no problems; 13 cards in the programme order, one per shared domain', () => {
    assert.deepEqual(R.validate(CONTENT), []);
    const model = R.normalise(CONTENT);
    assert.deepEqual(model.warnings, []);
    assert.deepEqual(model.domains.map(c => c.slug), P.DOMAINS.map(d => d.slug));
    assert.deepEqual(model.domains.map(c => c.label), P.DOMAINS.map(d => d.label));
});

test('content: every card has MSCIT\'s Domain.docx pattern in full, then the rest of row 5.1', () => {
    const model = R.normalise(CONTENT);
    for (const card of model.domains) {
        const at = card.slug + ': ';
        assert.ok(card.what.first.length >= 2, at + 'what an article does first');
        assert.ok(card.what.later.length >= 1, at + 'what an article does later');
        assert.ok(card.suits.length >= 2, at + 'who it suits');
        assert.ok(card.pros.length >= 2, at + 'pros');
        assert.ok(card.cons.length >= 2, at + 'cons');
        assert.ok(card.leads.text && card.leads.easier, at + 'where it leads (+ what makes the move easier)');
        assert.ok(card.pairs.length >= 1, at + 'pairs well with');
        assert.ok(card.season, at + 'busy season');
        assert.equal(card.questions.length, 5, at + 'five likely questions');
        assert.ok(card.booklet || card.questions.every(q => q.a), at + 'a booklet, or answer outlines on the card');
        assert.ok(card.levels.length >= 1, at + 'Work Simulation levels');
        assert.ok(card.picks.length >= 1, at + 'a free pick');
        assert.ok(card.tagline, at + 'tagline');
        assert.ok(card.linkedin && card.explorer && card.firms.href, at + 'the three jumps');
    }
});

test('content: the pairings that fit articleship (G2) are on the cards', () => {
    const model = R.normalise(CONTENT);
    const pair = (a, b) => model.bySlug[a].pairs.includes(b) || model.bySlug[b].pairs.includes(a);
    for (const [a, b] of [['statutory-audit', 'internal-audit'], ['statutory-audit', 'direct-tax'], ['direct-tax', 'gst'],
        ['valuation', 'fdd'], ['ma-tax', 'direct-tax'], ['internal-audit', 'forensic']]) {
        assert.ok(pair(a, b), a + ' pairs with ' + b);
    }
});

test('Work Simulation: every one of the 27 levels is on its card (all built, no waves)', () => {
    const model = R.normalise(CONTENT);
    const counts = Object.fromEntries(model.domains.map(c => [c.slug, c.levels.length]));
    assert.deepEqual(counts, {
        'statutory-audit': 7, 'internal-audit': 2, 'direct-tax': 4, gst: 3, 'bank-audit': 1, 'transfer-pricing': 1,
        'ma-tax': 1, valuation: 1, fdd: 1, forensic: 1, consulting: 1, accounting: 3, 'ib-er': 1
    });
    const ids = model.domains.flatMap(c => c.levels.map(l => l.id));
    assert.equal(ids.length, 27);
    assert.equal(new Set(ids).size, 27, 'level ids are unique');
    assert.deepEqual(model.bySlug.accounting.levels.map(l => l.id), ['accounting-1', 'company-law-1', 'excel-1']);
});

test('CV lines: house rule 2\'s MSC format, and the same lines the CV Recommender shows', () => {
    const recommender = JSON.parse(fs.readFileSync(path.join(ROOT, 'articleship-program/cv-recommender/situations.json'), 'utf8'));
    const model = R.normalise(CONTENT);
    for (const card of model.domains) {
        assert.match(card.cvLine, /^[A-Z][A-Za-z&]*( [A-Za-z&]+)* Work Simulation, MSC Articleship Program \| \[Month Year\]: [a-z]/, card.slug);
        assert.doesNotMatch(card.cvLine, /experience|internship/i, card.slug + ': never as experience');
        assert.equal(card.cvLine.replace(/\.$/, ''), recommender.workSimulation[card.slug], card.slug + ' matches the CV Recommender');
    }
});

test('row 5.1 specifics: IB & ER registration line once, BCG Data for Decision Makers on Consulting, Varsity Certified only on valuation and IB & ER', () => {
    const model = R.normalise(CONTENT);
    const ib = model.bySlug['ib-er'];
    assert.match(ib.note, /cannot register articles/);
    assert.match(ib.note, /practising CA/);
    const allText = JSON.stringify(CONTENT);
    assert.equal(allText.match(/cannot register articles/g).length, 1, 'said once, plainly');
    assert.ok(model.bySlug.consulting.picks.some(p => /BCG Introduction to Data for Decision Makers/.test(p.label)));
    const varsity = model.domains.filter(c => c.paid.some(p => p.label === 'Varsity Certified')).map(c => c.slug);
    assert.deepEqual(varsity, ['valuation', 'ib-er']);
    for (const slug of varsity) {
        assert.match(model.bySlug[slug].paid.find(p => p.label === 'Varsity Certified').note, /^Only if you have 2–4 weeks/);
    }
    // Industrial training as the second door (G7) on the four scarce-seat cards.
    for (const slug of ['valuation', 'fdd', 'consulting', 'ib-er']) {
        const extra = model.bySlug[slug].extra.find(e => e.link && /Industrial training guide/.test(e.link.label));
        assert.ok(extra, slug + ' points to the Industrial training guide');
        assert.match(extra.link.href, /session=7&resource=Industrial\+training\+guide$/);
    }
});

test('row 5.1 top and bottom: the rule (house rule 10), the three-things line, team names, not locked in, glossary', () => {
    const model = R.normalise(CONTENT);
    assert.deepEqual(model.rule.map(r => r.if), ['Sure of a domain?', 'Unsure?', 'Torn between two?']);
    assert.match(model.rule[0].then, /That domain, even at a smaller firm/);
    assert.match(model.rule[1].then, /Statutory audit with some tax, at the biggest firm that says yes/);
    assert.match(model.ruleNote, /backup/);
    assert.match(model.intro, /three things/);
    assert.match(model.intro, /The third is your homework/);
    assert.equal(model.introLink.href, '/learning-management-system/course?course=msc-articleship-program&session=5&resource=HR+round+and+GD+booklet');
    assert.ok(model.teams.rows.length >= 15);
    assert.match(model.teams.intro, /two preferences/);
    assert.match(model.lockin, /does not lock you in/);
    assert.ok(model.glossary.length >= 25);
    for (const term of ['FS / non-FS', 'RCM', 'Walkthrough', 'PBC list', 'QoE', 'NWC peg', 'LFAR', 'Sign-off']) {
        assert.ok(model.glossary.some(g => g.term === term), term + ' in the glossary');
    }
});

test('text: nothing a student must not see (competitors, internal codes, waves, dates of this build, pay, coming soon)', () => {
    const all = strings(CONTENT).join('\n') + '\n' + PAGE;
    assert.doesNotMatch(all, /ca ?monk|thinking ?bridge|umbrella|NEEDS-CHECK|\bwaves?\b|drop [abc]\b|live week|coming soon|batch 1/i);
    assert.doesNotMatch(all, /\b(P[1-7]|D[0-6]-\d+|MS-\d+|V2-\d+|C[123]-\d+|WB-\d+|TL-M\d+|H\d+)\b/, 'no internal codes');
    assert.doesNotMatch(all, /saved on this device|source:|disclaimer|guarantee/i);
    assert.doesNotMatch(all, /stipend|salary|salaries|package|\bLPA\b|lakh a year|per month/i, 'no pay');
    // The only years are the law's own: the Income-tax Act, 2025 and its start on 1 April 2026.
    const years = all.replace(/Income-tax Act, 2025/g, '').replace(/1 April 2026/g, '').match(/\b20\d\d\b/g);
    assert.equal(years, null, 'no other year: ' + years);
    assert.doesNotMatch(all, /\b\d{1,2} (Oct|Nov|Dec)\b|\b(Oct|Nov|Dec)[a-z]* \d{1,2}\b/, 'no build or live dates');
    assert.doesNotMatch(all, /98\d{8}|@(?!email\.com)[a-z0-9-]+\.[a-z]/i, 'no phone numbers or real mailboxes');
});

test('links: every outside link is https on an official or provider site, never a tracking or shortener link', () => {
    const allowed = ['www.theforage.com', 'www.incometax.gov.in', 'tutorial.gst.gov.in', 'boslive.icai.org', 'pages.stern.nyu.edu',
        'zerodha.com', 'www.nism.ac.in', 'www.cfainstitute.org', 'www.theiia.org', 'www.acfe.com', 'learn.microsoft.com'];
    const urls = strings(CONTENT).filter(s => /^[a-z]+:\/\//i.test(s));
    assert.ok(urls.length >= 20);
    for (const url of urls) {
        const u = new URL(url);
        assert.equal(u.protocol, 'https:', url);
        assert.ok(allowed.includes(u.hostname), url + ' is on an allowed host');
        assert.equal(u.search, '', url + ' carries no query string');
    }
});

test('links: Explorer ?domain=, LinkedIn people search with India preloaded, Firms by domain and booklets as course rows', () => {
    const model = R.normalise(CONTENT);
    for (const card of model.domains) {
        assert.equal(card.explorer, '/articleship-program/experience-explorer/?domain=' + card.slug);
        const li = new URL(card.linkedin);
        assert.equal(li.origin + li.pathname, 'https://www.linkedin.com/search/results/people/');
        assert.equal(li.searchParams.get('geoUrn'), '["102713980"]');
        assert.match(li.searchParams.get('keywords'), /^\("article assistant" OR "CA Finalist"\) AND \(.+\)$/);
        assert.equal(card.firms.href, '/learning-management-system/course?course=msc-articleship-program&session=6&resource=Firms+by+domain');
        assert.ok(card.firms.hint, card.slug + ': which tab or filter to use');
        if (card.booklet) {
            assert.equal(card.booklet.href, '/learning-management-system/course?course=msc-articleship-program&session=5&resource=' +
                encodeURIComponent(card.booklet.title).replace(/%20/g, '+') + (card.booklet.page > 1 ? '&page=' + card.booklet.page : ''));
        }
    }
    assert.equal(model.bySlug.consulting.booklet, null, 'no booklet answers Consulting: its card carries the outlines');
    assert.ok(model.bySlug.consulting.questions.every(q => q.a.length > 40));
    assert.ok(model.bySlug['ib-er'].questions.every(q => q.a.length > 40));
    assert.equal(model.bySlug['ib-er'].booklet.find, 'Investment banking');
});

test('links: every course row this tool opens exists in the v3 LMS rows on its Day', () => {
    const model = R.normalise(CONTENT);
    const booklets = [...new Set(model.domains.filter(c => c.booklet).map(c => c.booklet.title))];
    assert.deepEqual(booklets.sort(), ['Core accounting booklet', 'Direct tax booklet', 'GST booklet', 'Internal audit booklet',
        'Specialist teams booklet', 'Statutory audit booklet']);
    for (const title of [...booklets, 'HR round and GD booklet']) {
        const row = lmsRow(4, title);
        assert.ok(row, title + ' is a Day 4 row');
        assert.match(String(row.view_storage_path), /^articleship-program-v\d+\/day-4\/.+\.pdf$/, title + ' opens as a programme PDF');
    }
    assert.ok(lmsRow(5, 'Firms by domain'), 'Firms by domain is a Day 5 row');
    assert.ok(lmsRow(5, 'Domain roadmaps'), 'this tool is a Day 5 row');
    assert.equal(lmsRow(5, 'Domain roadmaps').url, R.PATHS.page, 'the Day 5 row opens this page');
    assert.equal(lmsRow(1, 'Work Simulation').url, R.PATHS.workSimulation, 'Work Simulation is a Day 1 row at the path levels open');
    assert.match(String(lmsRow(1, 'The Nothing CV').view_storage_path), /day-1\/.+\.pdf$/);
    assert.match(String(lmsRow(6, 'Industrial training guide').view_storage_path), /day-6\/.+\.pdf$/);
});

test('links: the Work Simulation opens its Day until its page is on the branch, then each level opens itself', () => {
    const wsPage = fs.existsSync(path.join(ROOT, 'articleship-program/work-simulation/index.html'));
    const wired = CONTENT.links && CONTENT.links.workSimulation;
    if (wsPage) assert.ok(wired, 'the Work Simulation page is on the branch: set links.workSimulation in roadmaps.json');
    if (wired) assert.ok(wsPage, 'links.workSimulation points at a page this branch has');

    const off = R.normalise(Object.assign(copy(CONTENT), { links: { workSimulation: null } }));
    assert.equal(off.workSimulation.wired, false);
    assert.equal(off.workSimulation.href, '/learning-management-system/course?course=msc-articleship-program&session=2&resource=Work+Simulation');
    assert.ok(off.domains.every(c => c.levels.every(l => l.href === '')), 'no dead level links');

    const on = R.normalise(Object.assign(copy(CONTENT), { links: { workSimulation: '/articleship-program/work-simulation/' } }));
    assert.equal(on.workSimulation.wired, true);
    assert.equal(on.bySlug.gst.levels[1].href, '/articleship-program/work-simulation/?domain=gst&level=gst-2');
});

test('links: Firms by domain switches to the Sheet with one data change', () => {
    const sheet = 'https://docs.google.com/spreadsheets/d/abc123/edit?usp=sharing';
    const model = R.normalise(Object.assign(copy(CONTENT), { links: { workSimulation: null, firms: sheet } }));
    assert.equal(model.bySlug.valuation.firms.href, sheet);
    assert.equal(model.bySlug.valuation.firms.external, true);
    assert.equal(model.bySlug.valuation.firms.hint, 'Valuation');
});

test('normalise: unsafe links dropped, unknown domains warned, cards keep the programme order, text never HTML', () => {
    const model = R.normalise({
        domains: [
            { slug: 'gst', questions: ['Q?'], picks: [{ label: 'Bad', href: 'javascript:alert(1)' }, { label: 'Http', href: 'http://x.com' }] },
            { slug: 'nonsense' },
            { slug: 'Statutory audit', label: '<img src=x onerror=alert(1)>' },
            { slug: 'gst' }
        ]
    });
    assert.deepEqual(model.domains.map(c => c.slug), ['statutory-audit', 'gst']);
    assert.ok(model.warnings.includes('Unknown domain: nonsense'));
    assert.ok(model.warnings.includes('Duplicate domain: gst'));
    assert.ok(model.warnings.some(w => w === 'Missing domain: valuation'));
    assert.equal(model.bySlug.gst.picks[0].href, '');
    assert.equal(model.bySlug.gst.picks[1].href, '');
    assert.throws(() => R.normalise({ domains: [] }), /no domain cards/);
    const problems = R.validate({ rule: [], domains: [{ slug: 'gst' }] });
    assert.ok(problems.includes('gst: no pros'));
    assert.ok(problems.includes('no 20-minute rule line'));
});

test('slugFromLocation: anchors, aliases and ?domain=', () => {
    assert.equal(R.slugFromLocation({ hash: '#gst', search: '' }), 'gst');
    assert.equal(R.slugFromLocation({ hash: '', search: '?domain=Indirect%20tax' }), 'gst');
    assert.equal(R.slugFromLocation({ hash: '#ib-er', search: '' }), 'ib-er');
    assert.equal(R.slugFromLocation({ hash: '#all', search: '' }), null);
    assert.equal(R.slugFromLocation({ hash: '', search: '' }), null);
});

// ---------- Page ----------

test('page: phone index shows the rule, 13 tiles with anchors, team names, glossary; no card until one is opened', () => {
    const { $, $$, app } = page('');
    assert.equal($('.dr').dataset.view, 'index');
    assert.equal(app.current(), null);
    assert.match($('.dr-rule').textContent, /My rule.*Sure of a domain\?/s);
    assert.match($('.dr-rule-note').textContent, /backup/);
    assert.equal($('.dr-intro a').textContent, 'How to research a firm');
    const tiles = $$('.dr-tile');
    assert.equal(tiles.length, 13);
    assert.deepEqual(tiles.map(t => t.getAttribute('href')), P.DOMAINS.map(d => '#' + d.slug));
    assert.match($('.dr-nav-title').textContent, /13 domains, most common first/);
    assert.equal($$('.dr-fold').length, 2);
    assert.ok($('.dr-lockin'));
    assert.ok($$('.dr-term').length >= 25);
});

test('page: a card opens from its anchor with every part, the three jumps at the top and the bottom', async () => {
    const { $, $$, win } = page('#valuation');
    assert.equal($('.dr').dataset.view, 'card');
    assert.equal($('.dr-card-title').textContent, 'Valuation');
    assert.equal(win.document.title, 'Valuation | Domain roadmaps | My Student Club');
    const heads = $$('.dr-card .dr-h3').map(h => h.textContent);
    assert.deepEqual(heads, ['What an article does', 'Who it suits', 'Pros', 'Cons', 'Where it leads', 'How you are tested',
        'Earn the CV line', 'Practise free', 'Good to know', 'Go further']);
    const quick = $$('.dr-quick a');
    assert.deepEqual(quick.map(a => a.textContent), ['Experiences', 'Firms', 'LinkedIn']);
    assert.equal(quick[0].getAttribute('href'), '/articleship-program/experience-explorer/?domain=valuation');
    assert.equal(quick[2].target, '_blank');
    assert.equal(quick[2].rel, 'noopener noreferrer');
    const actions = $$('.dr-action');
    assert.equal(actions.length, 3);
    assert.equal(actions[0].getAttribute('href'), '/articleship-program/experience-explorer/?domain=valuation');
    assert.match(actions[1].textContent, /Firms by domain · Valuation/);
    assert.match(actions[2].getAttribute('href'), /^https:\/\/www\.linkedin\.com\/search\/results\/people\//);
    assert.equal($$('.dr-questions li').length, 5);
    assert.equal($('.dr-card .dr-go').textContent, 'Answers in the Specialist teams booklet, Valuation part');
    // Levels are listed, one link opens the Work Simulation's Day (no dead links before its page exists).
    if (!CONTENT.links.workSimulation) {
        assert.equal($$('.dr-level.is-plain').length, 1);
        const open = $$('.dr-card .dr-go').find(a => a.textContent === 'Open the Work Simulation');
        assert.equal(open.getAttribute('href'), '/learning-management-system/course?course=msc-articleship-program&session=2&resource=Work+Simulation');
    }
    assert.match($('.dr-cvline').textContent, /Valuation Work Simulation, MSC Articleship Program \| \[Month Year\]/);
    assert.deepEqual($$('.dr-pick-no').map(n => n.textContent), ['First pick', 'Second pick']);
    assert.ok($$('.dr-pick-name').every(a => a.tagName !== 'A' || a.target === '_blank'), 'outside picks open in a new tab');
    assert.equal($('.dr-prev').getAttribute('href'), '#ma-tax');
    assert.equal($('.dr-next').getAttribute('href'), '#fdd');

    await go(win, '#all');
    assert.equal($('.dr').dataset.view, 'index');
    await go(win, '#consulting');
    assert.equal($('.dr-card-title').textContent, 'Consulting & risk advisory');
    assert.equal($$('.dr-answer').length, 5, 'Consulting carries its answer outlines');
    assert.ok(!$$('.dr-card .dr-go').some(a => /booklet/.test(a.textContent)), 'and no booklet link');
    assert.equal($('.dr-pick-name').textContent, 'BCG Introduction to Data for Decision Makers');
    await go(win, '#ib-er');
    assert.match($('.dr-note').textContent, /Before you apply.*cannot register articles/s);
    assert.match($$('.dr-card .dr-go')[0].textContent, /^More in the Specialist teams booklet, Investment banking part$/);
});

test('page: ?domain= and aliases become the shareable anchor; an unknown anchor shows the index', () => {
    const one = page('?domain=Indirect%20tax');
    assert.equal(one.app.current(), 'gst');
    assert.equal(one.win.location.hash, '#gst');
    assert.equal(one.win.location.search, '');
    const two = page('#not-a-domain');
    assert.equal(two.app.current(), null);
    assert.equal(two.$('.dr').dataset.view, 'index');
});

test('page: "Make this my domain" and "Make it my backup" save the shared setting every tool reads', async () => {
    const settings = memorySettings();
    const { $, $$, win } = page('#gst', CONTENT, settings);
    assert.equal($('.dr-make-backup'), null, 'no backup button before a domain is picked');
    $('.dr-make').click();
    await sleep(10);
    assert.equal(P.getMyDomain(settings), 'gst');
    assert.equal($('.dr-pill.is-mine').textContent, 'My domain');
    assert.match($('.dr-mine-line').textContent, /My domain: GST/);
    assert.equal($$('.dr-badge:not(.ap-hidden)').length, 1);

    await go(win, '#direct-tax');
    $('.dr-make-backup').click();
    await sleep(10);
    assert.equal(P.getMyDomain(settings), 'gst');
    assert.equal(P.getBackupDomain(settings), 'direct-tax');
    assert.match($('.dr-mine-line').textContent, /Backup: Direct tax/);
    assert.equal($('.dr-pill.is-backup').textContent, 'My backup');

    // Picking the backup as "my domain" clears it as backup.
    $('.dr-make').click();
    await sleep(10);
    assert.equal(P.getMyDomain(settings), 'direct-tax');
    assert.equal(P.getBackupDomain(settings), null);
});

test('page: with no anchor, a wide screen shows my domain\'s card beside the tiles', () => {
    const settings = memorySettings();
    P.setMyDomain('forensic', undefined, settings);
    const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { url: 'http://127.0.0.1/articleship-program/domain-roadmaps/' });
    dom.window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    dom.window.scrollTo = () => {};
    R.mount(dom.window.document.getElementById('app'), CONTENT, { settings, location: dom.window.location, history: dom.window.history });
    const doc = dom.window.document;
    assert.equal(doc.querySelector('.dr').dataset.view, 'index');
    assert.equal(doc.querySelector('.dr-card-title').textContent, 'Forensic');
    assert.ok(doc.querySelector('#tile-forensic').classList.contains('is-active'));
});

test('page: a wired Work Simulation turns every level into its own link', () => {
    const content = Object.assign(copy(CONTENT), { links: { workSimulation: '/articleship-program/work-simulation/' } });
    const { $$ } = page('#statutory-audit', content);
    const levels = $$('a.dr-level');
    assert.equal(levels.length, 7);
    assert.equal(levels[0].getAttribute('href'), '/articleship-program/work-simulation/?domain=statutory-audit&level=statutory-audit-1');
    assert.ok(!$$('.dr-go').some(a => a.textContent === 'Open the Work Simulation'));
});

test('page: content text is never parsed as HTML', () => {
    const content = copy(CONTENT);
    content.domains[0].tagline = '<img src=x onerror="window.hacked=1">';
    content.domains[0].pros = ['<b>bold</b>'];
    const { $, win } = page('#statutory-audit', content);
    assert.equal($('.dr-card img[src="x"]'), null);
    assert.equal(win.hacked, undefined);
    assert.equal($('.dr-list.is-pros li').textContent, '<b>bold</b>');
});

test('page: start() shows a retry card when the content does not load, then mounts on retry', async () => {
    const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', { url: 'http://127.0.0.1/articleship-program/domain-roadmaps/#gst' });
    dom.window.scrollTo = () => {};
    let calls = 0;
    const fetch = () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve({ ok: true, json: () => Promise.resolve(CONTENT) });
    };
    const quiet = console.error;
    console.error = () => {};
    try {
        const container = dom.window.document.getElementById('app');
        const first = await R.start(container, { fetch, settings: memorySettings(), location: dom.window.location, history: dom.window.history });
        assert.equal(first, null);
        assert.match(container.textContent, /did not load/);
        container.querySelector('button').click();
        await sleep(30);
        assert.equal(container.querySelector('.dr-card-title').textContent, 'GST');
    } finally {
        console.error = quiet;
    }
});

test('index.html: programme page skeleton (noindex, logo back to Day 5, gate, one shared client, Day 5 colour)', () => {
    assert.match(PAGE, /<meta name="robots" content="noindex">/);
    assert.match(PAGE, /<title>Domain roadmaps \| My Student Club<\/title>/);
    assert.match(PAGE, /class="ap-page ap-day-5"/);
    assert.match(PAGE, /src="\/articleship-program\/shared\/msc-logo\.svg"/);
    assert.match(PAGE, /href="\/learning-management-system\/course\?course=msc-articleship-program&amp;session=6"/);
    const order = ['/scripts/supabase.js', '/scripts/supabase-init.js', '/scripts/articleship-gate.js', '/scripts/articleship-progress.js',
        '/scripts/articleship-lms.js', '/scripts/articleship-domain-roadmaps.js'].map(src => PAGE.indexOf('src="' + src + '"'));
    assert.ok(order.every(i => i > 0), 'every script is loaded');
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'in dependency order');
    assert.doesNotMatch(PAGE, /createClient\(/, 'no second Supabase client');
    assert.match(PAGE, /MSCArticleshipRoadmaps\.boot\(\)/);
    for (const icon of new Set(R.normalise(CONTENT).domains.map(c => c.icon))) {
        assert.ok(fs.existsSync(path.join(TOOL_DIR, 'icons', icon + '.svg')), icon + '.svg exists');
    }
});
