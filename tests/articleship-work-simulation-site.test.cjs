// MSC Articleship Program, release 2: the Work Simulation page (row 1.6) wired into the site, as its
// articleship-program/work-simulation INTEGRATION.md asks (§2 keys, §3 window.MSCProgress, §4 "my domain", §4a links,
// §5 "Add to my CV" and the CV Builder; INTEGRATION calls the §5 part tests/cv-builder-articleship.test.cjs).
// The page itself is tested by tests/articleship-work-simulation-*.test.cjs (package A's own tests).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'articleship-program/work-simulation');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = rel => JSON.parse(read(rel));
const E = require('../articleship-program/work-simulation/js/ws-engine.js');
const WS = require('../articleship-program/work-simulation/js/ws-store.js');
const B = require('../scripts/articleship-cv-builder.js');
const P = require('../scripts/articleship-progress.js');
const CATALOGUE = readJson('articleship-program/work-simulation/data/catalogue.json');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
// Values made in a JSDOM window, as plain Node values (deepEqual compares prototypes across realms).
const plain = value => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/** A state with sa-1 passed and its domain line added to the CV, as the page saves it (INTEGRATION.md §2). */
function passedState() {
    const state = E.emptyState();
    state.updatedAt = 3;
    state.levels['sa-1'] = { updatedAt: 2, attempts: 1, best: { n: 1, accuracy: 0.95, stars: 2, passed: true, hints: 0, at: 2, month: 'Nov 2026',
        counts: { bills: 20, found: 7 }, clause: 'vouched 20 year-end purchase bills against PO, GRN and ledger; flagged 7 exceptions' } };
    const line = E.domainLine(CATALOGUE, state, 'statutory-audit');
    state.cv['statutory-audit'] = { picks: [], chosen: false, addedLine: line, addedAt: 3, updatedAt: 3 };
    return { state, line };
}

// ---------- the page loads the site's hooks ----------

test('page: the site scripts load before the page\'s own, every one is on this branch, nothing from another host', () => {
    const html = read('articleship-program/work-simulation/index.html');
    const srcs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(srcs, ['/scripts/supabase.js', '/scripts/supabase-init.js', '/scripts/articleship-progress.js',
        '/scripts/articleship-work-simulation-bridge.js', 'js/ws-engine.js', 'js/ws-docs.js', 'js/ws-store.js', 'js/ws-ui.js']);
    srcs.forEach(src => assert.ok(fs.existsSync(src.startsWith('/') ? path.join(ROOT, src) : path.join(APP, src)), src));
    assert.ok(!/(src|href)="(https?:)?\/\//.test(html), 'no other host');
    assert.equal(html.match(/data-cv-builder="([^"]+)"/)[1], '/cv-builder/?stage=articleship', 'Open CV Builder opens the articleship stage');
});

// ---------- §3 / §4: window.MSCProgress over the shared progress engine ----------

function bridgePage(options) {
    const opts = options || {};
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1/articleship-program/work-simulation/', runScripts: 'outside-only' });
    const win = dom.window;
    Object.entries(opts.storage || {}).forEach(([key, value]) => win.localStorage.setItem(key, value));
    win.fetch = url => {
        const file = path.join(APP, new URL(url, win.location.href).pathname.replace('/articleship-program/work-simulation/', ''));
        return Promise.resolve(fs.existsSync(file) ? { ok: true, json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))) } : { ok: false });
    };
    for (const file of ['scripts/articleship-progress.js', 'scripts/articleship-work-simulation-bridge.js', 'articleship-program/work-simulation/js/ws-engine.js']) {
        win.eval(read(file));
    }
    return win;
}

test('MSCProgress: defined on the page from the shared engine, never over a hook the page already has', () => {
    const win = bridgePage();
    assert.equal(typeof win.MSCProgress.load, 'function');
    assert.equal(typeof win.MSCProgress.save, 'function');
    ['getDomain', 'setDomain', 'addCvLine'].forEach(name => assert.equal(typeof win.MSCProgress[name], 'function', name));
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1/articleship-program/work-simulation/', runScripts: 'outside-only' });
    const own = { load: () => null, save: () => true };
    dom.window.MSCProgress = own;
    dom.window.eval(read('scripts/articleship-progress.js'));
    dom.window.eval(read('scripts/articleship-work-simulation-bridge.js'));
    assert.equal(dom.window.MSCProgress, own, 'a hook the page already has stays');
});

test('MSCProgress: load/save keep the page\'s state as tool "work-simulation", with the lines the CV Builder and mock interview read', async () => {
    const win = bridgePage();
    const bridge = win.MSCProgress;
    assert.equal(await bridge.load('work-simulation'), null, 'nothing saved yet: null');
    assert.equal(await bridge.load('cv-checklist'), null, 'another tool: null');
    const { state, line } = passedState();
    assert.match(line, /^Statutory Audit Work Simulation, MSC Articleship Program \| Nov 2026: Vouched 20 year-end purchase bills/);
    assert.equal(await bridge.save('work-simulation', state), true);
    const saved = JSON.parse(win.localStorage.getItem(P.storageKey('work-simulation')));
    assert.deepEqual(saved.data.earned, [{ domain: 'statutory-audit', line }], 'one earned line per domain, as My CV lines builds it');
    assert.deepEqual(saved.data.cvQueue, [{ domain: 'statutory-audit', line, at: 3 }], 'the line the student added');
    assert.equal(win.localStorage.getItem('msc-articleship:work-simulation'), null, 'the page\'s own key is the page\'s to write');
    // The page reads back exactly its state (the two extra keys stay out).
    assert.deepEqual(plain(E.normalizeState(await bridge.load('work-simulation'))), plain(E.normalizeState(state)));
    assert.deepEqual(plain(Object.keys(await bridge.load('work-simulation'))).sort(), Object.keys(state).sort());
    // What the CV Builder and the mock interview read from it.
    assert.deepEqual(B.readEarnedLines(saved.data).map(item => item.line), [line]);
    const I = require('../scripts/articleship-interview.js');
    if (typeof I.earnedLinesFrom === 'function') assert.deepEqual(I.earnedLinesFrom(saved.data), [line]);
    // "Add to my CV" on another domain arrives at once, before the page's next save.
    const gst = 'GST Work Simulation, MSC Articleship Program | Nov 2026: Prepared GSTR-1 for 18 invoices';
    assert.equal(bridge.addCvLine({ source: 'work-simulation', domain: 'gst', cvName: 'GST Work Simulation', line: gst, at: 9 }), true);
    const queued = JSON.parse(win.localStorage.getItem(P.storageKey('work-simulation'))).data.cvQueue;
    assert.deepEqual(queued.map(item => item.domain), ['statutory-audit', 'gst']);
    await bridge.save('work-simulation', state);
    assert.deepEqual(JSON.parse(win.localStorage.getItem(P.storageKey('work-simulation'))).data.cvQueue.map(item => item.domain), ['statutory-audit', 'gst'],
        'a later save keeps the queued line');
});

test('MSCProgress: two devices merge as the page merges (the better pass is never lost), queues joined', () => {
    const win = bridgePage();
    const { state, line } = passedState();
    const other = E.emptyState();
    other.updatedAt = 9;
    other.levels['sa-1'] = { updatedAt: 9, attempts: 2, attempt: { n: 2, answers: {}, hints: {} } };
    other.levels['gst-1'] = { updatedAt: 8, attempts: 1, best: { passed: true, stars: 1, accuracy: 0.7, at: 8, month: 'Nov 2026', clause: 'prepared GSTR-1 for 18 invoices' } };
    const merged = plain(win.MSCProgress._mergeData(Object.assign({}, state, { cvQueue: [{ domain: 'statutory-audit', line, at: 3 }] }),
        Object.assign({}, other, { cvQueue: [{ domain: 'gst', line: 'GST Work Simulation, MSC Articleship Program | Nov 2026: x', at: 8 }] })));
    assert.equal(merged.levels['sa-1'].best.passed, true, 'the pass on this device stays beside the newer attempt');
    assert.ok(merged.levels['gst-1'].best.passed, 'the other device\'s pass arrives');
    assert.deepEqual(merged.cvQueue.map(item => item.domain).sort(), ['gst', 'statutory-audit']);
});

test('my domain: one setting for every programme tool and the page (INTEGRATION.md §4); "Not decided yet" clears it', async () => {
    const win = bridgePage();
    const settings = () => win.MSCArticleshipProgress.getMyDomain();
    const ids = CATALOGUE.domains.map(d => d.id).sort();
    assert.deepEqual(P.DOMAINS.map(d => d.slug).sort(), ids, 'the site\'s 13 domain slugs are the page\'s ids');
    assert.deepEqual(WS.DOMAIN_IDS.slice().sort(), ids);
    // Set in another tool (the CV Recommender's pick), read on the page and mirrored to its own key.
    win.MSCArticleshipProgress.setMyDomain('direct-tax');
    const store = WS.createStore({ global: win, storage: win.localStorage, timeout: 500 });
    assert.equal(await store.getDomain(), 'direct-tax');
    assert.equal(win.localStorage.getItem('msc-articleship:my-domain'), 'direct-tax');
    // Picked on the page, read by every other tool.
    await store.setDomain('ib-er');
    assert.equal(settings(), 'ib-er');
    assert.equal(win.localStorage.getItem('msc-articleship:my-domain'), 'ib-er');
    await store.setDomain(null);
    assert.equal(settings(), null, '"Not decided yet"');
    assert.equal(win.localStorage.getItem('msc-articleship:my-domain'), null);
});

test('MSCProgress: the page\'s own store reads the account copy first, then saves through the bridge', async () => {
    const { state } = passedState();
    // An account copy from another device, already in the engine's local copy.
    const win = bridgePage({ storage: { [P.storageKey('work-simulation')]: JSON.stringify({ v: 1, data: state, updatedAt: 5, syncedAt: 5, dirty: false, owner: null }) } });
    const store = WS.createStore({ global: win, storage: win.localStorage, remoteDelay: 0, timeout: 1000 });
    const loaded = await store.load();
    assert.equal(loaded.levels['sa-1'].best.passed, true, 'the pass from the account copy is on the page');
    assert.equal(JSON.parse(win.localStorage.getItem('msc-articleship:work-simulation')).levels['sa-1'].best.passed, true, 'and in the page\'s own key');
    const next = E.mergeStates(loaded, {});
    next.levels['gst-1'] = { updatedAt: 20, attempts: 1, best: { passed: true, stars: 1, accuracy: 0.7, at: 20, month: 'Nov 2026', clause: 'prepared GSTR-1 for 18 invoices' } };
    next.updatedAt = 20;
    store.save(next);
    await store.flush();
    await sleep(20);
    const saved = JSON.parse(win.localStorage.getItem(P.storageKey('work-simulation'))).data;
    assert.ok(saved.levels['sa-1'].best.passed && saved.levels['gst-1'].best.passed, 'both passes in the account copy');
    assert.deepEqual(saved.earned.map(item => item.domain).sort(), ['gst', 'statutory-audit']);
});

// ---------- §2: the page's keys belong to the browser ----------

test('sign-out or another account: the page\'s own keys go with the rest of the student\'s data (INTEGRATION.md §2)', () => {
    const dom = new JSDOM('<!doctype html><body></body>', { url: 'http://127.0.0.1/', runScripts: 'outside-only' });
    const win = dom.window;
    let listener = null;
    win.supabase = { createClient: () => ({ auth: { onAuthStateChange: fn => { listener = fn; } } }) };
    const keys = ['msc-articleship:work-simulation', 'msc-articleship:cv-import', 'msc-articleship:my-domain'];
    keys.forEach(key => win.localStorage.setItem(key, 'x'));
    win.localStorage.setItem('cv_maker_data', '{}');
    win.eval(read('scripts/supabase-init.js'));
    listener('SIGNED_IN', { user: { id: 'a' } });
    keys.forEach(key => assert.equal(win.localStorage.getItem(key), 'x', key + ' stays while the same student is in'));
    listener('SIGNED_OUT', null);
    keys.forEach(key => assert.equal(win.localStorage.getItem(key), null, key + ' removed'));
    assert.equal(win.localStorage.getItem('cv_maker_data'), '{}', 'the CV Builder\'s own data is not this file\'s to clear');
});

// ---------- the same names everywhere ----------

test('names: every tool names each domain\'s Work Simulation as the page writes it on the CV (its cvName)', () => {
    const names = Object.fromEntries(CATALOGUE.domains.map(d => [d.id, d.cvName]));
    const situations = readJson('articleship-program/cv-recommender/situations.json').workSimulation;
    const roadmaps = readJson('articleship-program/domain-roadmaps/roadmaps.json').domains;
    const L = require('../scripts/articleship-linkedin-checklist.js');
    for (const [id, cvName] of Object.entries(names)) {
        assert.ok(situations[id].startsWith(cvName + ', MSC Articleship Program | '), 'CV Recommender ' + id + ': ' + situations[id]);
        const card = roadmaps.find(c => c.slug === id);
        assert.ok(card.cv_line.startsWith(cvName + ', MSC Articleship Program | '), 'Domain roadmaps ' + id + ': ' + card.cv_line);
        assert.equal(L.SIM_NAME[id] + ' Work Simulation', cvName, 'LinkedIn checklist ' + id);
    }
});

// ---------- §5: "Add to my CV" in the real CV Builder ----------

/** The CV Builder page (cv-builder/index.html with its articleship scripts) opened on /cv-builder/?stage=articleship. */
async function openBuilder(storage) {
    const virtualConsole = new VirtualConsole();
    const errors = [];
    virtualConsole.on('error', (...args) => errors.push(args.map(String).join(' ')));
    const dom = new JSDOM(read('cv-builder/index.html'), { url: 'http://127.0.0.1/cv-builder/?stage=articleship', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
    const win = dom.window;
    win.scrollTo = () => {};
    Object.entries(storage).forEach(([key, value]) => win.localStorage.setItem(key, value));
    const files = {
        '/articleship-program/cv-builder/designs.json': 'articleship-program/cv-builder/designs.json',
        '/articleship-program/cv-builder/examples.json': 'articleship-program/cv-builder/examples.json',
        '/articleship-program/cv-recommender/situations.json': 'articleship-program/cv-recommender/situations.json'
    };
    win.fetch = url => {
        const file = files[new URL(url, win.location.href).pathname];
        return Promise.resolve(file ? { ok: true, json: () => Promise.resolve(readJson(file)) } : { ok: false, json: () => Promise.resolve(null) });
    };
    // The order the page loads them in (cv-builder/index.html); Quill and the CDN scripts are left out (the form falls
    // back to plain boxes). The last line lets the test read the builder's own data.
    for (const file of ['cv-builder/cv-articleship.js', 'scripts/articleship-progress.js', 'scripts/articleship-cv-builder.js', 'cv-builder/cv-script.js', 'articleship-program/cv-builder/stage.js']) {
        win.eval(read(file) + (file === 'cv-builder/cv-script.js' ? '\nwindow.__cvData = () => cvData;' : ''));
    }
    win.onload();
    await sleep(400);
    return { win, cv: () => win.__cvData(), errors };
}

const certInputs = win => [...win.document.querySelectorAll('input[id^="cert-name-"]')].map(input => input.value);

test('CV Builder: a line added before there was any CV opens on the blank starter, under "Certifications and job simulations"', async () => {
    const line = 'GST Work Simulation, MSC Articleship Program | Nov 2026: Prepared GSTR-1 for 18 invoices';
    const up = WS.upsertCertification(null, 'GST Work Simulation', line);
    assert.equal(up.status, 'created');
    const { win, cv, errors } = await openBuilder({ cv_maker_data: up.value });
    assert.equal(cv().articleshipStarter, 'blank', 'its normal blank starter');
    assert.equal(cv().templateFile, 'articleship-layout-classic');
    assert.equal(win.document.getElementById('inp-title-certifications').value, B.CERT_TITLE, 'under "Certifications and job simulations"');
    assert.deepEqual(certInputs(win).filter(value => /Work Simulation/.test(value)), [line], 'the line, once, and no [Domain] gap beside it');
    assert.equal(B.countCertificates(cv().certifications).outside, 0, 'an MSC line is not an outside certificate');
    assert.deepEqual(errors, []);
});

test('CV Builder: a line added to a CV the student has written lands in it, and a newer line for the domain replaces it', async () => {
    const own = B.createBlank({}, { structure: 'A', workSimulationLive: true });
    own.personal.name = 'Kirti Joshi';
    own.templateFile = 'articleship-layout-classic';
    own.certifications = [{ name: 'PwC US Audit Job Simulation (Forage) | Mar 2026: built a risk-control matrix.', issuer: '' },
        { name: 'Excel Skills for Business (Coursera) | Feb 2026', issuer: '' }, { name: 'Tally Prime course | Jan 2026', issuer: '' },
        { name: 'Power BI course | Apr 2026', issuer: '' }];
    const first = 'GST Work Simulation, MSC Articleship Program | Nov 2026: Prepared GSTR-1 for 18 invoices';
    const up = WS.upsertCertification(JSON.stringify(own), 'GST Work Simulation', first);
    assert.equal(up.status, 'added');
    const opened = await openBuilder({ cv_maker_data: up.value });
    assert.equal(opened.cv().personal.name, 'Kirti Joshi', 'the student\'s own CV');
    assert.ok(certInputs(opened.win).includes(first));
    const counts = B.countCertificates(opened.cv().certifications);
    assert.equal(counts.outside, 4);
    assert.equal(counts.over, false, 'four outside certificates and an MSC line: not over the four');
    assert.match(opened.win.document.getElementById('articleship-stage').textContent, /4 of 4 outside certificates/);
    // The page's queue on this device: a newer GST line takes the old one's place, then the queue is cleared.
    const newer = 'GST Work Simulation, MSC Articleship Program | Nov 2026: Prepared GSTR-1 for 18 invoices; matched 40 bills with GSTR-2B';
    const later = await openBuilder({
        cv_maker_data: up.value,
        'msc-articleship:cv-import': JSON.stringify([{ source: 'work-simulation', domain: 'gst', line: newer, at: 2 }])
    });
    assert.deepEqual(certInputs(later.win).filter(value => /Work Simulation/.test(value)), [newer], 'one line per domain');
    assert.equal(later.win.localStorage.getItem('msc-articleship:cv-import'), null, 'the queue is cleared');
    assert.equal(B.countCertificates(later.cv().certifications).outside, 4);
});
