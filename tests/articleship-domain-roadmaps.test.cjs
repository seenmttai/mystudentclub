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
const CSS = fs.readFileSync(path.join(TOOL_DIR, 'domain-roadmaps.css'), 'utf8');
// The content build lives in the content repo (msc-content), not here. Point MSC_CONTENT_BUILD at its v3/build folder,
// or keep the two repos side by side (../msc-content); without it the "built rows" check is skipped.
const CONTENT_BUILD = process.env.MSC_CONTENT_BUILD || path.join(ROOT, '..', 'msc-content/articleship-program/v3/build');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// The full v3 course (003). The desktop branch keeps it in supabase/migrations/; the mobile branch shares the database
// and has no SQL, so it reads the LMS build's copy (and skips these checks on a machine without either). From release 2
// (WORK_SIMULATION_LIVE true) that copy is the build's release-2 003 (lms/release-2/: row 1.6 added), the same rows as
// the desktop branch's 003.
const LATER_SQL = [path.join(ROOT, 'supabase/migrations/202610200003_articleship_program_v3_later_rows.sql'),
    ...(P.WORK_SIMULATION_LIVE ? [path.join(CONTENT_BUILD, 'lms/release-2/003_articleship_program_v3_later_rows.sql')] : []),
    path.join(CONTENT_BUILD, 'lms/003_articleship_program_v3_later_rows.sql')].find(file => fs.existsSync(file));
const NO_SQL = LATER_SQL ? false : 'no v3 LMS SQL on this machine (supabase/migrations or the content build)';

// Tabs of Padam's "Top 100 Articleship Firms.xlsx" (build/padam-files, B9), in the workbook's order.
const TOP_100_TABS = ['Top 100', 'FDD', 'Valuation', 'IB and M&A', 'Equity Research', 'Transfer Pricing', 'Forensic',
    'Internal Audit & Risk', 'Consulting & IFRS', 'Insolvency', 'Statutory Audit', 'Direct Tax', 'Indirect Tax (GST)',
    'IT Audit & Analytics', 'Industrial training'];

function copy(value) { return JSON.parse(JSON.stringify(value)); }
/** The content with every course row treated as built (what the page shows once every file is in the course). */
function allBuilt() { return Object.assign(copy(CONTENT), { unbuilt: [] }); }

/** Change the anchor and wait for the page's own hashchange handler (jsdom fires it asynchronously). */
function go(win, hash) {
    if (win.location.hash === hash) return Promise.reject(new Error('already at ' + hash + ': no hashchange would fire'));
    const done = nextHashchange(win);
    win.location.hash = hash;
    return done;
}
function nextHashchange(win) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no hashchange')), 2000);
        win.addEventListener('hashchange', () => { clearTimeout(timer); setTimeout(resolve, 0); }, { once: true });
    });
}

/** The full v3 course (003: every row; 002 is release 1, only the rows whose files were ready at handover). */
function lmsRows() {
    const sql = fs.readFileSync(LATER_SQL, 'utf8');
    return JSON.parse(sql.match(/jsonb_array_elements\('([\s\S]*?)'::jsonb\)/)[1].replaceAll("''", "'"))
        .map(s => Object.assign({}, s, { resources: s.resources.map(item => item.resource) }));
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

function page(hash, content, settings, extra) {
    const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>', {
        url: 'http://127.0.0.1/articleship-program/domain-roadmaps/' + (hash || ''), pretendToBeVisual: true
    });
    const win = dom.window;
    win.scrollTo = () => {};
    const store = settings || memorySettings();
    const app = R.mount(win.document.getElementById('app'), content || CONTENT,
        Object.assign({ settings: store, location: win.location, history: win.history }, extra || {}));
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

const ORDER = ['statutory-audit', 'direct-tax', 'internal-audit', 'gst', 'accounting', 'bank-audit',
    'transfer-pricing', 'valuation', 'fdd', 'forensic', 'ma-tax', 'consulting', 'ib-er'];

// ---------- Content ----------

test('content: validates with no problems; 13 cards, one per shared domain, in the content\'s group order', () => {
    assert.deepEqual(R.validate(CONTENT), []);
    const model = R.normalise(CONTENT);
    assert.deepEqual(model.warnings, []);
    assert.deepEqual(model.domains.map(c => c.slug), ORDER);
    assert.deepEqual([...model.domains.map(c => c.slug)].sort(), P.DOMAINS.map(d => d.slug).sort());
    const labels = Object.fromEntries(P.DOMAINS.map(d => [d.slug, d.label]));
    for (const card of model.domains) assert.equal(card.label, labels[card.slug]);
    assert.deepEqual(model.groups.map(g => g.title), ['Where most articles work', 'Specialist teams, fewer seats']);
});

test('content: the first group is where most articles work, by MSC\'s own experience data (most first)', () => {
    const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'articleship-program/experience-explorer/experiences.json'), 'utf8'));
    const counts = Object.fromEntries(P.DOMAINS.map(d => [d.slug, 0]));
    for (const record of data.records) for (const d of new Set(record.domains || [])) if (d in counts) counts[d] += 1;
    const [common, specialist] = R.normalise(CONTENT).groups;
    const byCount = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    assert.deepEqual(common.slugs, byCount.slice(0, common.slugs.length), 'the most common domains, most first: ' + JSON.stringify(counts));
    const smallest = Math.min(...common.slugs.map(s => counts[s]));
    for (const slug of specialist.slugs) assert.ok(counts[slug] < smallest, slug + ' has fewer experiences than every common domain');
});

test('content: every card has MSCIT\'s Domain.docx pattern in full, then the rest of row 5.1', () => {
    const model = R.normalise(allBuilt());
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
        assert.equal(card.picks.length, 2, at + 'a first and a second free pick');
        assert.ok(card.picks.every(p => p.kind), at + 'every pick says what it is');
        assert.ok(card.picks.some(p => p.kind === 'simulation' || p.kind === 'tutorial'), at + 'at least one hands-on pick');
        assert.ok(card.tagline, at + 'tagline');
        assert.ok(card.linkedin && card.explorer && card.firms && card.firms.href, at + 'the three jumps');
        assert.match(card.practise, new RegExp('^/ai-interview\\.html\\?mode=articleship&round=technical&domain=' + card.slug + '$'));
    }
});

test('content: Bank audit and Transfer pricing lead with a real simulation; recorded classes are labelled as classes', () => {
    const model = R.normalise(CONTENT);
    for (const slug of ['bank-audit', 'transfer-pricing']) {
        const [first, second] = model.bySlug[slug].picks;
        assert.equal(first.kind, 'simulation', slug);
        assert.match(first.href, /^https:\/\/www\.theforage\.com\/simulations\//);
        assert.equal(second.label, 'ICAI recorded classes');
        assert.equal(second.kind, 'classes');
    }
    for (const card of model.domains) {
        for (const p of card.picks) {
            if (/classes/i.test(p.label)) assert.equal(p.kind, 'classes', card.slug + ': ' + p.label + ' is classes, not a simulation');
            if (/simulation/i.test(p.label)) assert.equal(p.kind, 'simulation', card.slug + ': ' + p.label);
        }
    }
});

test('content: busy season adds to the card, never repeats Cons; traced dates only', () => {
    const model = R.normalise(CONTENT);
    const words = s => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
    const grams = s => { const w = words(s); return new Set(w.slice(0, -3).map((_, i) => w.slice(i, i + 4).join(' '))); };
    for (const card of model.domains) {
        const season = grams(card.season);
        for (const con of card.cons) {
            const shared = [...grams(con)].filter(g => season.has(g));
            assert.deepEqual(shared, [], card.slug + ': Cons "' + con + '" repeats the season line');
        }
        assert.doesNotMatch(card.cons.join(' '), /\bseason\b|return dates|deadline/i, card.slug + ': no season detail in Cons');
    }
    // The dates the cards name are the traced ones (FACTS / NEW-FACTS): advance tax, TDS statements, GST returns, 31 March.
    assert.match(model.bySlug['direct-tax'].season, /June, September, December and March/);
    assert.match(model.bySlug['direct-tax'].season, /end of July, October, January and May/);
    assert.match(model.bySlug.gst.season, /GSTR-1 by the 11th and GSTR-3B by the 20th/);
    assert.match(model.bySlug['statutory-audit'].season, /31 March/);
    assert.match(model.bySlug['bank-audit'].season, /31 March/);
    assert.doesNotMatch(JSON.stringify(CONTENT), /3CEB|tax audit report (is )?due|due by 30 September|31 October/i, 'no tax-audit or TP due date');
});

test('content: valuation beta line is precise', () => {
    const val = R.normalise(CONTENT).bySlug.valuation;
    assert.equal(val.what.first[0], "Pull a year or two of share prices against the index to work out a stock's beta.");
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
    // The CV line is a Work Simulation part: drawn once it is out (release 1 has none, see the release test).
    const model = R.normalise(CONTENT, { workSimulationLive: true });
    for (const card of model.domains) {
        assert.match(card.cvLine, /^[A-Z][A-Za-z&]*( [A-Za-z&]+)* Work Simulation, MSC Articleship Program \| \[Month Year\]: [a-z]/, card.slug);
        assert.doesNotMatch(card.cvLine, /experience|internship/i, card.slug + ': never as experience');
        assert.equal(card.cvLine.replace(/\.$/, ''), recommender.workSimulation[card.slug], card.slug + ' matches the CV Recommender');
    }
});

test('row 5.1 specifics: IB & ER registration line once, BCG Data for Decision Makers on Consulting, Varsity Certified only on valuation and IB & ER', () => {
    const model = R.normalise(allBuilt());
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

test('row 5.1 top and bottom: the rule (house rule 10) as information, the three-things block, team names, not locked in, glossary', () => {
    const model = R.normalise(allBuilt());
    assert.deepEqual(model.rule.map(r => r.if), ['Sure of a domain?', 'Unsure?', 'Torn between two?']);
    assert.match(model.rule[0].then, /That domain, even at a smaller firm/);
    assert.match(model.rule[1].then, /Statutory audit with some tax, at the biggest firm that says yes/);
    assert.match(model.ruleNote, /^Most students settle on one domain and keep a backup\./, 'information, not a task (B2)');
    assert.equal(model.introTitle, 'What an interviewer checks');
    assert.match(model.intro, /^Three things/);
    assert.match(model.intro, /The third is yours/);
    assert.equal(model.introLink.label, 'How to research a firm (Research the firm part)');
    assert.equal(model.introLink.href, '/learning-management-system/course?course=msc-articleship-program&session=5&resource=HR+round+and+GD+booklet');
    assert.ok(model.teams.rows.length >= 15);
    assert.match(model.teams.intro, /two preferences/);
    assert.match(model.lockin, /does not lock you in/);
    assert.ok(model.glossary.length >= 25);
    for (const term of ['FS / non-FS', 'RCM', 'Walkthrough', 'PBC list', 'QoE', 'NWC peg', 'LFAR', 'Sign-off']) {
        assert.ok(model.glossary.some(g => g.term === term), term + ' in the glossary');
    }
});

test('text: nothing a student must not see (competitors, internal codes, waves, dates of this build, pay, homework, coming soon)', () => {
    const all = strings(CONTENT).join('\n') + '\n' + PAGE;
    assert.doesNotMatch(all, /ca ?monk|thinking ?bridge|umbrella|NEEDS-CHECK|\bwaves?\b|drop [abc]\b|live week|coming soon|batch 1/i);
    assert.doesNotMatch(all, /\b(P[1-7]|D[0-6]-\d+|MS-\d+|V2-\d+|C[123]-\d+|WB-\d+|TL-M\d+|H\d+)\b/, 'no internal codes');
    assert.doesNotMatch(all, /saved on this device|source:|disclaimer|guarantee/i);
    assert.doesNotMatch(all, /stipend|salary|salaries|package|\bLPA\b|lakh a year|per month/i, 'no pay');
    assert.doesNotMatch(all, /homework|pick one now/i, 'domain guidance is information, not a task (B2)');
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

test('links: Explorer ?domain=, LinkedIn people search with India preloaded, Top 100 Articleship Firms and booklets as course rows', () => {
    const model = R.normalise(allBuilt());
    for (const card of model.domains) {
        assert.equal(card.explorer, '/articleship-program/experience-explorer/?domain=' + card.slug);
        const li = new URL(card.linkedin);
        assert.equal(li.origin + li.pathname, 'https://www.linkedin.com/search/results/people/');
        assert.equal(li.searchParams.get('geoUrn'), '["102713980"]');
        assert.match(li.searchParams.get('keywords'), /^\("article assistant" OR "CA Finalist"\) AND \(.+\)$/);
        assert.equal(card.firms.href, '/learning-management-system/course?course=msc-articleship-program&session=6&resource=Top+100+Articleship+Firms');
        assert.ok(card.firms.hint, card.slug + ': which tab or filter to use');
        // The hint names tabs of Padam's Top 100 Articleship Firms workbook (B9), as the workbook spells them.
        for (const tab of card.firms.hint.split(' or ')) assert.ok(TOP_100_TABS.includes(tab), card.slug + ': no tab called ' + tab);
        if (card.booklet) {
            assert.equal(card.booklet.live, true);
            assert.equal(card.booklet.href, '/learning-management-system/course?course=msc-articleship-program&session=5&resource=' +
                encodeURIComponent(card.booklet.title).replace(/%20/g, '+') + (card.booklet.page > 1 ? '&page=' + card.booklet.page : ''));
        }
    }
    assert.equal(model.bySlug.consulting.booklet, null, 'no booklet answers Consulting: its card carries the outlines');
    assert.ok(model.bySlug.consulting.questions.every(q => q.a.length > 40));
    assert.ok(model.bySlug['ib-er'].questions.every(q => q.a.length > 40));
    assert.equal(model.bySlug['ib-er'].booklet.find, 'Investment banking');
});

test('links: a course row listed in `unbuilt` is never linked (booklets, Firms, the intro link); one data change brings each back', () => {
    const model = R.normalise(CONTENT);
    const unbuilt = new Set(CONTENT.unbuilt.map(r => r.day + '|' + r.title));
    for (const card of model.domains) {
        if (card.booklet) assert.equal(card.booklet.live, !unbuilt.has('4|' + card.booklet.title), card.slug + ' booklet');
        assert.equal(Boolean(card.firms), !unbuilt.has('5|Top 100 Articleship Firms'), card.slug + ' firms');
        for (const e of card.extra) if (e.link && e.link.row) assert.ok(!unbuilt.has(e.link.row.day + '|' + e.link.row.title));
    }
    assert.equal(Boolean(model.introLink), !unbuilt.has('4|HR round and GD booklet'));

    // Rendered: no link to an unbuilt row on any card or on the index.
    const { $$, win } = page('', CONTENT);
    const hrefs = () => $$('a').map(a => decodeURIComponent(a.getAttribute('href') || '').replace(/\+/g, ' '));
    const unbuiltLinked = list => list.filter(h => [...unbuilt].some(key => h.includes('session=' + (Number(key.split('|')[0]) + 1) + '&resource=' + key.split('|')[1])));
    assert.deepEqual(unbuiltLinked(hrefs()), []);
    return (async () => {
        for (const card of model.domains) {
            await go(win, '#' + card.slug);
            assert.deepEqual(unbuiltLinked(hrefs()), [], card.slug + ' links an unbuilt row');
        }
    })();
});

test('links: every course row this tool opens exists in the v3 LMS rows on its Day', { skip: NO_SQL }, () => {
    const model = R.normalise(allBuilt());
    const booklets = [...new Set(model.domains.filter(c => c.booklet).map(c => c.booklet.title))];
    assert.deepEqual(booklets.sort(), ['Core accounting booklet', 'Direct tax booklet', 'GST booklet', 'Internal audit booklet',
        'Specialist teams booklet', 'Statutory audit booklet']);
    for (const title of [...booklets, 'HR round and GD booklet']) {
        const row = lmsRow(4, title);
        assert.ok(row, title + ' is a Day 4 row');
        assert.match(String(row.view_storage_path), /^articleship-program-v\d+\/day-4\/.+\.pdf$/, title + ' opens as a programme PDF');
    }
    assert.ok(lmsRow(5, 'Top 100 Articleship Firms'), 'Top 100 Articleship Firms is a Day 5 row');
    assert.ok(lmsRow(5, 'Domain roadmaps'), 'this tool is a Day 5 row');
    assert.equal(lmsRow(5, 'Domain roadmaps').url, R.PATHS.page, 'the Day 5 row opens this page');
    // Row 1.6 is release 2: a Day 1 row at the path levels open, exactly when the release flag is on.
    if (R.WORK_SIMULATION_LIVE) assert.equal(lmsRow(1, 'Work Simulation').url, R.PATHS.workSimulation, 'Work Simulation is a Day 1 row at the path levels open');
    else assert.equal(lmsRow(1, 'Work Simulation'), undefined, 'no Work Simulation row in release 1');
    assert.match(String(lmsRow(1, 'The Nothing CV').view_storage_path), /day-1\/.+\.pdf$/);
    assert.match(String(lmsRow(6, 'Industrial training guide').view_storage_path), /day-6\/.+\.pdf$/);
    for (const row of CONTENT.unbuilt) assert.ok(lmsRow(row.day, row.title), row.title + ' (unbuilt) names a real course row');
});

test('links: `unbuilt` matches the content build (a row with its file is linked, a row without one is not)', { skip: NO_SQL }, t => {
    // "Built" = in release 1 (002: the rows whose files were ready at handover), as the LMS build wrote it.
    const releaseFile = path.join(CONTENT_BUILD, 'lms/rows-release-1.json');
    if (!fs.existsSync(releaseFile)) { t.skip('content build not on this machine'); return; }
    const release = JSON.parse(fs.readFileSync(releaseFile, 'utf8'));
    const rows = lmsRows().flatMap(session => session.resources.map(r => Object.assign({ day: session.day_number, row: 'Day ' + session.day_number }, r)));
    const built = row => release.some(s => s.day_number === row.day && s.resources.some(r => r.title === row.title));
    // Every course row the page can link to, before any is hidden.
    const model = R.normalise(allBuilt(), { workSimulationLive: R.WORK_SIMULATION_LIVE });
    const linked = new Map();
    const add = (day, title) => linked.set(day + '|' + title, { day, title });
    model.domains.forEach(card => {
        if (card.booklet) add(4, card.booklet.title);
        card.extra.forEach(e => e.link && e.link.row && add(e.link.row.day, e.link.row.title));
    });
    if (model.introLink && model.introLink.row) add(model.introLink.row.day, model.introLink.row.title);
    if (!CONTENT.links.firms) add(5, 'Top 100 Articleship Firms');
    const unbuilt = new Set(CONTENT.unbuilt.map(r => r.day + '|' + r.title));
    const problems = [];
    for (const [key, { day, title }] of linked) {
        const row = rows.find(r => r.day === day && r.title === title);
        if (!row) { problems.push(title + ': no such course row'); continue; }
        const isBuilt = built(row);
        if (isBuilt && unbuilt.has(key)) problems.push(row.row + ' ' + title + ' is built now: remove it from `unbuilt` in roadmaps.json');
        if (!isBuilt && !unbuilt.has(key)) problems.push(row.row + ' ' + title + ' has no file yet: add it to `unbuilt` in roadmaps.json');
    }
    assert.deepEqual(problems, []);
});

test('Work Simulation: hidden in release 1 (WORK_SIMULATION_LIVE false), every part back with one flag', async () => {
    assert.equal(R.WORK_SIMULATION_LIVE, true, 'release 2 ships the Work Simulation');
    const off = page('', CONTENT, null, { workSimulationLive: false });
    for (const card of R.normalise(CONTENT).domains) {
        await go(off.win, '#' + card.slug);
        const text = off.$('.dr-card').textContent;
        assert.doesNotMatch(text, /Work Simulation|Earn the CV line|A line you can earn/, card.slug + ' mentions the Work Simulation');
    }
    assert.doesNotMatch(off.$('.dr').textContent, /Work Simulation/, 'nowhere on the page');

    // The flag on, the page not wired (links.workSimulation null): the levels as text and one link to its Day 1 row.
    const unwired = Object.assign(copy(CONTENT), { links: Object.assign({}, CONTENT.links, { workSimulation: null }) });
    const on = page('#statutory-audit', unwired, null, { workSimulationLive: true });
    assert.ok(on.$$('.dr-card .dr-h3').some(h => h.textContent === 'Earn the CV line'));
    assert.equal(on.$$('.dr-level.is-plain').length, 7);
    const open = on.$$('.dr-card .dr-go').find(a => a.textContent === 'Open the Work Simulation');
    assert.equal(open.getAttribute('href'), '/learning-management-system/course?course=msc-articleship-program&session=2&resource=Work+Simulation');
    assert.match(on.$('.dr-cvline').textContent, /Statutory Audit Work Simulation, MSC Articleship Program \| \[Month Year\]/);
    assert.equal(on.$('.dr-cvline-hint').textContent, 'Your own counts and month fill in when you finish the level.');
});

test('links: a wired Work Simulation page turns every level into its own link', () => {
    const wsPage = fs.existsSync(path.join(ROOT, 'articleship-program/work-simulation/index.html'));
    const wired = CONTENT.links && CONTENT.links.workSimulation;
    if (wired) assert.ok(wsPage, 'links.workSimulation points at a page this branch has');

    const off = R.normalise(Object.assign(copy(CONTENT), { links: { workSimulation: null } }), { workSimulationLive: true });
    assert.equal(off.workSimulation.wired, false);
    assert.ok(off.domains.every(c => c.levels.every(l => l.href === '')), 'no dead level links');

    const on = R.normalise(Object.assign(copy(CONTENT), { links: { workSimulation: '/articleship-program/work-simulation/' } }), { workSimulationLive: true });
    assert.equal(on.workSimulation.wired, true);
    // The page's own route to a level (its INTEGRATION.md §4a): #/l/<its level id>.
    assert.equal(on.bySlug.gst.levels[1].href, '/articleship-program/work-simulation/#/l/gst-2');
    const content = Object.assign(copy(CONTENT), { links: { workSimulation: '/articleship-program/work-simulation/' } });
    const { $$ } = page('#statutory-audit', content, null, { workSimulationLive: true });
    const levels = $$('a.dr-level');
    assert.equal(levels.length, 7);
    assert.equal(levels[0].getAttribute('href'), '/articleship-program/work-simulation/#/l/sa-1');
    assert.ok(!$$('.dr-go').some(a => a.textContent === 'Open the Work Simulation'));
    // An id the page does not know opens the domain's levels, never "This page is not here".
    assert.equal(R.normalise(Object.assign(copy(content), { domains: content.domains.map(c => (c.slug === 'gst' ? Object.assign({}, c, { levels: [{ id: 'gst-annual', title: 'GST annual' }] }) : c)) }),
        { workSimulationLive: true }).bySlug.gst.levels[0].href, '/articleship-program/work-simulation/#/d/gst');
});

test('links: every level on a card opens a published level of that domain on the Work Simulation page', { skip: !fs.existsSync(path.join(ROOT, 'articleship-program/work-simulation/data/catalogue.json')) && 'the Work Simulation page is not on this branch' }, () => {
    const catalogue = JSON.parse(fs.readFileSync(path.join(ROOT, 'articleship-program/work-simulation/data/catalogue.json'), 'utf8'));
    const model = R.normalise(Object.assign(copy(CONTENT), { links: Object.assign({}, CONTENT.links, { workSimulation: '/articleship-program/work-simulation/' }) }), { workSimulationLive: true });
    const linked = [];
    for (const card of model.domains) {
        for (const level of card.levels) {
            const id = (level.href.match(/#\/l\/([a-z0-9-]+)$/) || [])[1];
            const target = catalogue.levels.find(l => l.id === id);
            assert.ok(target && target.published, card.slug + ' · ' + level.title + ': ' + level.href + ' is a published level');
            assert.equal(target.domain, card.slug, level.title + ' opens a level of its own domain');
            linked.push(id);
        }
    }
    assert.deepEqual(linked.sort(), catalogue.levels.filter(l => l.published).map(l => l.id).sort(), 'every published level is on its card, once');
});

test('links: Top 100 Articleship Firms switches to a Sheet with one data change (even while its course row is unbuilt)', () => {
    const sheet = 'https://docs.google.com/spreadsheets/d/abc123/edit?usp=sharing';
    const model = R.normalise(Object.assign(copy(CONTENT), { links: { workSimulation: null, firms: sheet } }));
    assert.equal(model.bySlug.valuation.firms.href, sheet);
    assert.equal(model.bySlug.valuation.firms.external, true);
    assert.equal(model.bySlug.valuation.firms.hint, 'Valuation');
});

test('normalise: unsafe links dropped, unknown domains warned, groups and programme order, text never HTML', () => {
    const model = R.normalise({
        domains: [
            { slug: 'gst', questions: ['Q?'], picks: [{ label: 'Bad', href: 'javascript:alert(1)' }, { label: 'Http', href: 'http://x.com', kind: 'nonsense' }] },
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
    assert.equal(model.bySlug.gst.picks[1].kind, '');
    assert.throws(() => R.normalise({ domains: [] }), /no domain cards/);
    const problems = R.validate({ rule: [], domains: [{ slug: 'gst' }] });
    assert.ok(problems.includes('gst: no pros'));
    assert.ok(problems.includes('no 20-minute rule line'));

    const grouped = R.normalise({
        groups: [{ title: 'A', domains: ['gst', 'nonsense', 'Statutory audit'] }, { title: 'B', domains: ['gst'] }],
        domains: [{ slug: 'statutory-audit' }, { slug: 'gst' }, { slug: 'valuation' }]
    });
    assert.deepEqual(grouped.groups, [{ title: 'A', slugs: ['gst', 'statutory-audit', 'valuation'] }]);
    assert.ok(grouped.warnings.includes('Not in a group: valuation'));
    assert.deepEqual(grouped.domains.map(c => c.index), [0, 1, 2]);
});

test('practiseHref: a technical-round mock on the domain in Practise your interview', () => {
    assert.equal(R.practiseHref('gst'), '/ai-interview.html?mode=articleship&round=technical&domain=gst');
    assert.equal(R.practiseHref('fdd', '/articleship-program/ai-interview/'), '/articleship-program/ai-interview/?mode=articleship&round=technical&domain=fdd');
    assert.equal(R.practiseHref('gst', 'javascript:alert(1)'), '/ai-interview.html?mode=articleship&round=technical&domain=gst');
});

test('slugFromLocation: anchors, aliases and ?domain=', () => {
    assert.equal(R.slugFromLocation({ hash: '#gst', search: '' }), 'gst');
    assert.equal(R.slugFromLocation({ hash: '', search: '?domain=Indirect%20tax' }), 'gst');
    assert.equal(R.slugFromLocation({ hash: '#ib-er', search: '' }), 'ib-er');
    assert.equal(R.slugFromLocation({ hash: '#all', search: '' }), null);
    assert.equal(R.slugFromLocation({ hash: '', search: '' }), null);
});

// ---------- Page ----------

test('page: phone index shows the rule, then the 13 tiles in two groups; the three-things block, team names and glossary below', () => {
    const { $, $$, app } = page('');
    assert.equal($('.dr').dataset.view, 'index');
    assert.equal(app.current(), null);
    assert.match($('.dr-rule').textContent, /My rule.*Sure of a domain\?/s);
    assert.match($('.dr-rule-note').textContent, /keep a backup/);
    assert.equal($('.dr-top .dr-intro'), null, 'the top stays short: no intro above the tiles');
    assert.equal($('.dr-nav-title').textContent, 'The 13 domains');
    assert.deepEqual($$('.dr-group-title').map(h => h.textContent), ['Where most articles work', 'Specialist teams, fewer seats']);
    const tiles = $$('.dr-tile');
    assert.equal(tiles.length, 13);
    assert.deepEqual(tiles.map(t => t.getAttribute('href')), ORDER.map(slug => '#' + slug));
    assert.deepEqual($$('.dr-tiles').map(ol => ol.children.length), [6, 7]);
    assert.equal($('.dr-more .dr-intro-title').textContent, 'What an interviewer checks');
    assert.match($('.dr-more .dr-intro-text').textContent, /^Three things/);
    assert.equal($$('.dr-fold').length, 2);
    assert.ok($('.dr-lockin'));
    assert.ok($$('.dr-term').length >= 25);
});

test('page: a card opens from its anchor with every part; jumps to unbuilt rows are left out', async () => {
    const { $, $$, win } = page('#valuation');
    assert.equal($('.dr').dataset.view, 'card');
    assert.equal($('.dr-card-title').textContent, 'Valuation');
    assert.equal(win.document.title, 'Valuation | Domain roadmaps | My Student Club');
    assert.equal($('#dr-card').getAttribute('aria-live'), null, 'no aria-live: focus moves to the name instead');
    const heads = $$('.dr-card .dr-h3').map(h => h.textContent);
    assert.deepEqual(heads, ['What an article does', 'Who it suits', 'Pros', 'Cons', 'Where it leads', 'How you are tested',
        'Earn the CV line', 'Practise free', 'Good to know', 'Go further'], 'release 2: "Earn the CV line" too');
    const firmsLive = !CONTENT.unbuilt.some(r => r.title === 'Top 100 Articleship Firms');
    const quick = $$('.dr-quick a');
    assert.deepEqual(quick.map(a => a.textContent), firmsLive ? ['Experiences', 'Firms', 'LinkedIn'] : ['Experiences', 'LinkedIn']);
    assert.equal(quick[0].getAttribute('href'), '/articleship-program/experience-explorer/?domain=valuation');
    assert.equal(quick[quick.length - 1].target, '_blank');
    assert.equal(quick[quick.length - 1].rel, 'noopener noreferrer');
    const actions = $$('.dr-action');
    assert.equal(actions.length, firmsLive ? 3 : 2);
    assert.ok($('.dr-action-grid').classList.contains('is-' + actions.length));
    assert.equal(actions[0].getAttribute('href'), '/articleship-program/experience-explorer/?domain=valuation');
    assert.match(actions[actions.length - 1].getAttribute('href'), /^https:\/\/www\.linkedin\.com\/search\/results\/people\//);
    assert.equal($$('.dr-questions li').length, 5);
    const practise = $('.dr-go-practise');
    assert.equal(practise.textContent, 'Practise them in a mock interview');
    assert.equal(practise.getAttribute('href'), '/ai-interview.html?mode=articleship&round=technical&domain=valuation');
    const bookletLive = !CONTENT.unbuilt.some(r => r.title === 'Specialist teams booklet');
    assert.equal($$('.dr-card .dr-go').some(a => /booklet/.test(a.textContent)), bookletLive);
    // The whole pick is the link, and says what it is.
    const picks = $$('.dr-picks')[0].querySelectorAll('.dr-pick');
    assert.equal(picks.length, 2);
    assert.equal(picks[0].tagName, 'A');
    assert.equal(picks[0].target, '_blank');
    assert.deepEqual([...picks].map(p => p.querySelector('.dr-pick-no').textContent), ['First pick · Free classes', 'Second pick · Simulation']);
    assert.equal($('.dr-prev').getAttribute('href'), '#transfer-pricing');
    assert.equal($('.dr-next').getAttribute('href'), '#fdd');

    await go(win, '#consulting');
    assert.equal($('.dr-card-title').textContent, 'Consulting & risk advisory');
    assert.equal($$('.dr-answer').length, 5, 'Consulting carries its answer outlines');
    assert.ok(!$$('.dr-card .dr-go').some(a => /booklet/.test(a.textContent)), 'and no booklet link');
    assert.equal($('.dr-pick-name').textContent, 'BCG Introduction to Data for Decision Makers');
    await go(win, '#ib-er');
    assert.match($('.dr-note').textContent, /Before you apply.*cannot register articles/s);
    assert.equal($('.dr-next'), null, 'IB & ER is the last card');
});

test('page: with every row built, the booklet, Firms and intro links all show', async () => {
    const { $, $$, win } = page('#valuation', allBuilt());
    assert.deepEqual($$('.dr-quick a').map(a => a.textContent), ['Experiences', 'Firms', 'LinkedIn']);
    assert.match($$('.dr-action')[1].textContent, /Top 100 Articleship Firms · Valuation tab/);
    assert.equal($('.dr-card .dr-go').textContent, 'Answers in the Specialist teams booklet, Valuation part');
    await go(win, '#ib-er');
    assert.match($$('.dr-card .dr-go')[0].textContent, /^More in the Specialist teams booklet, Investment banking part$/);
    await go(win, '#all');
    assert.equal($('.dr-more .dr-intro a').textContent, 'How to research a firm (Research the firm part)');
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

test('page: "All domains" steps back to the index it came from, or swaps the entry, never adding one', async () => {
    const a = page('');
    await go(a.win, '#gst');
    assert.equal(a.app.current(), 'gst');
    const length = a.win.history.length;
    const back = nextHashchange(a.win);
    a.$('.dr-back').click();
    await back;
    assert.equal(a.app.current(), null);
    assert.equal(a.$('.dr').dataset.view, 'index');
    assert.equal(a.win.history.length, length, 'no new entry');
    assert.equal(a.win.location.hash, '');

    // Opened straight from a link: the card's entry becomes the index (Back then leaves the page, as expected).
    const b = page('#direct-tax');
    const before = b.win.history.length;
    b.$('.dr-back').click();
    await sleep(10);
    assert.equal(b.app.current(), null);
    assert.equal(b.$('.dr').dataset.view, 'index');
    assert.equal(b.win.history.length, before);
    assert.equal(b.win.location.hash, '');
});

test('page: my domain and backup: make, back up, swap, drop the backup, clear', async () => {
    const settings = memorySettings();
    const { $, $$, win } = page('#gst', CONTENT, settings);
    assert.equal($('.dr-make-backup'), null, 'no backup button before a domain is picked');
    assert.ok($('.dr-mine-line').classList.contains('ap-hidden'));
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

    // Promoting the backup swaps the two: the old "my domain" becomes the backup, nothing is lost.
    $('.dr-make').click();
    await sleep(10);
    assert.equal(P.getMyDomain(settings), 'direct-tax');
    assert.equal(P.getBackupDomain(settings), 'gst');

    await go(win, '#gst');
    assert.equal($('.dr-pill.is-backup').textContent, 'My backup');
    $('.dr-unbackup').click();
    await sleep(10);
    assert.equal(P.getMyDomain(settings), 'direct-tax');
    assert.equal(P.getBackupDomain(settings), null);

    $('.dr-make-backup').click();
    await sleep(10);
    assert.equal(P.getBackupDomain(settings), 'gst');
    const clear = $('.dr-mine-line .dr-clear');
    assert.equal(clear.textContent, 'Clear');
    assert.equal(clear.getAttribute('aria-label'), 'Clear my domain and backup');
    clear.click();
    await sleep(10);
    assert.equal(P.getMyDomain(settings), null);
    assert.equal(P.getBackupDomain(settings), null);
    assert.ok($('.dr-mine-line').classList.contains('ap-hidden'));
    assert.equal($$('.dr-badge:not(.ap-hidden)').length, 0);
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

test('css: every tap target is at least 44 px; the team chip gets its own row on a phone', () => {
    const rule = sel => {
        const m = CSS.match(new RegExp('(^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\{([^}]*)\\}'));
        return m ? m[2] : '';
    };
    for (const sel of ['.dr-quick-link', '.dr-chip', '.dr-back', '.dr-go', '.dr-pick', '.dr-clear', '.dr-level', '.dr-answer summary']) {
        assert.match(rule(sel), /min-height: (4[4-9]|[5-9]\d)px/, sel + ' is at least 44 px high');
    }
    assert.match(CSS, /\.dr-mine \.ap-btn \{ min-height: 44px/);
    assert.match(CSS, /@media \(max-width: 599\.98px\) \{\s*\.dr-team \{ grid-template-columns: minmax\(0, 1fr\); \}\s*\.dr-team \.dr-chip \{ grid-column: 1; grid-row: auto; justify-self: start;/);
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
