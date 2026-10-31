/**
 * Written test practice (row 4.11) on the platform: the page wiring (look, gate, progress engine), the paper list
 * (exactly the paper files in the folder; a new paper JSON shows up with no code change) and the progress bridge
 * (scripts/articleship-written-test.js). The page's own rules are tested in articleship-written-test-core / -charts.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const PAGE_DIR = path.join(ROOT, 'articleship-program', 'written-test');
const PAPERS = path.join(PAGE_DIR, 'papers');
const HTML = fs.readFileSync(path.join(PAGE_DIR, 'index.html'), 'utf8');
const W = require('../scripts/articleship-written-test.js');
const P = require('../scripts/articleship-progress.js');
const Papers = require('../scripts/articleship-written-test-papers.js');
const Core = require('../articleship-program/written-test/js/written-test-core.js');
const FIX = path.join(__dirname, 'fixtures', 'written-test');

function memoryStorage() {
    const map = new Map();
    return {
        getItem: k => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => { map.set(k, String(v)); },
        removeItem: k => { map.delete(k); },
        key: i => [...map.keys()][i] || null,
        get length() { return map.size; },
        map
    };
}

/** A platform store on the device only (no account), as the engine makes it for a page. */
function deviceStore(storage) {
    return P.createStore('written-test', { defaults: W.DEFAULTS, merge: W.mergePapers, storage, sessionFlags: null, remote: false, debounceMs: 0, userId: () => null });
}

function paperState(id, updatedAt, extra) {
    return Object.assign({ v: 1, paperId: id, updatedAt, current: null, last: null, best: null, history: [] }, extra || {});
}

// ---------- the page: platform skeleton ----------
test('page: platform skeleton (gated, noindex, Day 4, platform look first) and the ids the page script needs', () => {
    assert.match(HTML, /<html lang="en-IN" class="ap-gated">/);
    assert.match(HTML, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(HTML, /<body class="ap-page ap-day-4 day-4" data-course="msc-articleship-program">/);
    const sheets = [...HTML.matchAll(/<link href="([^"]+)" rel="stylesheet">|<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1] || m[2]);
    assert.match(sheets[0], /^https:\/\/fonts\.googleapis\.com\/css2\?family=Caveat[^"]*family=Inter/);
    assert.deepEqual(sheets.slice(1), ['/articleship-program/shared/articleship-tools.css', '/articleship-program/shared/msc-tool.css',
        '/articleship-program/written-test/written-test.css']);
    assert.match(HTML, /<header class="ap-topbar msc-bar" id="bar">\s*<a class="ap-brand logo" id="bar-logo" href="\/learning-management-system\/course\?course=msc-articleship-program&amp;session=5"/);
    for (const id of ['bar', 'bar-logo', 'bar-tool', 'bar-right', 'app', 'announce', 'confirm', 'nav-sheet']) {
        assert.match(HTML, new RegExp('id="' + id + '"'), id);
    }
    assert.match(HTML, /class="logo-full" src="\/articleship-program\/shared\/msc-logo\.svg"/);
    assert.match(HTML, /class="logo-mark" src="\/articleship-program\/shared\/msc-symbol\.svg"[^>]*hidden/);
});

test('page: scripts in order (the site client, the gate, the progress engine, the bridge, then the page); every file exists', () => {
    const scripts = [...HTML.matchAll(/<script\b([^>]*)>([^<]*)<\/script>/g)].map(m => (m[1].match(/src="([^"]+)"/) || [])[1] || m[2].trim());
    assert.deepEqual(scripts, ['/scripts/supabase.js', '/scripts/supabase-init.js', '/scripts/articleship-gate.js',
        '/scripts/articleship-progress.js', '/scripts/articleship-written-test.js',
        '/articleship-program/written-test/js/written-test-core.js', '/articleship-program/written-test/js/written-test-charts.js',
        '/articleship-program/written-test/js/written-test-app.js']);
    const local = [...HTML.matchAll(/\s(?:src|href)="(\/[^"#?]*)/g)].map(m => m[1]).filter(u => !u.startsWith('/learning-management-system/'));
    local.forEach(u => assert.ok(fs.existsSync(path.join(ROOT, u)), 'missing ' + u));
    // The page script's doodles live in the shared folder it names.
    const app = fs.readFileSync(path.join(PAGE_DIR, 'js', 'written-test-app.js'), 'utf8');
    for (const name of new Set([...app.matchAll(/icon\('([a-z-]+)'/g)].map(m => m[1]))) {
        assert.ok(fs.existsSync(path.join(ROOT, 'articleship-program', 'shared', 'img', 'doodles', name + '.svg')), 'doodle ' + name);
    }
    assert.ok(!/fonts\/Nunito|url\(["']?fonts\//.test(fs.readFileSync(path.join(ROOT, 'articleship-program', 'shared', 'msc-tool.css'), 'utf8')), 'no self-hosted fonts left');
});

test('page: nothing a student reads carries internal notes, competitor names, dates or "coming soon"', () => {
    const banned = /ca ?monk|thinking ?bridge|umbrella|\bmonk\b|NEEDS-CHECK|\bwaves?\b|drop [abc]\b|live week|coming soon|saved on this device|stipend|\bCMT\d|\bTB\d{3}/i;
    const dated = /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* 20\d\d\b/i;   // build dates; a question may name a month
    const code = [path.join(PAGE_DIR, 'index.html'), path.join(PAGE_DIR, 'written-test.css'),
        ...fs.readdirSync(path.join(PAGE_DIR, 'js')).map(f => path.join(PAGE_DIR, 'js', f))];
    // Code comments are for developers (the engine's keep-together notes name example dates such as "March 2026").
    const shown = f => { const text = fs.readFileSync(f, 'utf8'); return /\.html$/.test(f) ? text : text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1'); };
    code.forEach(f => assert.doesNotMatch(fs.readFileSync(f, 'utf8'), banned, path.relative(ROOT, f)));
    code.forEach(f => assert.doesNotMatch(shown(f), dated, path.relative(ROOT, f) + ' (outside comments)'));
    fs.readdirSync(PAPERS).map(f => path.join(PAPERS, f)).forEach(f => assert.doesNotMatch(fs.readFileSync(f, 'utf8'), banned, path.relative(ROOT, f)));
});

// ---------- papers: exactly what is in the folder ----------
test('papers: index.json lists exactly the paper files in the folder, each valid (node scripts/articleship-written-test-papers.js)', () => {
    const files = fs.readdirSync(PAPERS).filter(f => f.endsWith('.json') && f !== 'index.json').map(f => f.slice(0, -5)).sort();
    const index = JSON.parse(fs.readFileSync(path.join(PAPERS, 'index.json'), 'utf8'));
    assert.deepEqual(index.papers.map(p => p.id).sort(), files, 'run node scripts/articleship-written-test-papers.js');
    const built = Papers.buildIndex(PAPERS);
    assert.deepEqual(built.errors, []);
    assert.deepEqual(index, built.index, 'index.json is stale: run node scripts/articleship-written-test-papers.js');
    assert.ok(files.length >= 1 && files.includes('screening-1'));
    files.forEach(id => assert.doesNotMatch(id, /^fixture/, 'fixtures never ship'));
    assert.equal(execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'articleship-written-test-papers.js'), '--check'], { encoding: 'utf8' }).trim(),
        'index.json lists ' + files.length + ' paper(s): ' + index.papers.map(p => p.id).join(', '));
});

test('papers: the index rows are the content build\'s (same fields, rev = SHA-256 of the file, sorted by order)', () => {
    const index = JSON.parse(fs.readFileSync(path.join(PAPERS, 'index.json'), 'utf8'));
    index.papers.forEach(entry => {
        const text = fs.readFileSync(path.join(PAPERS, entry.id + '.json'), 'utf8');
        assert.equal(entry.rev, Papers.revOf(text));
        assert.deepEqual(entry, Core.manifestEntry(JSON.parse(text), entry.rev));
    });
    const orders = index.papers.map(p => p.order);
    assert.deepEqual(orders, orders.slice().sort((a, b) => a - b));
});

function newPaperFolder() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msc-wt-papers-'));
    fs.readdirSync(PAPERS).forEach(f => fs.copyFileSync(path.join(PAPERS, f), path.join(dir, f)));
    const paper = JSON.parse(fs.readFileSync(path.join(FIX, 'fixture-short.json'), 'utf8'));
    paper.id = 'aptitude-1';
    paper.title = 'Aptitude paper 1';
    paper.kind = 'aptitude';
    fs.writeFileSync(path.join(dir, 'aptitude-1.json'), JSON.stringify(paper) + '\n');
    return dir;
}

test('papers: a new paper file is picked up by the index script; a bad one stops it', () => {
    const dir = newPaperFolder();
    try {
        const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'articleship-written-test-papers.js'), dir], { encoding: 'utf8' });
        const shipped = JSON.parse(fs.readFileSync(path.join(PAPERS, 'index.json'), 'utf8')).papers;
        assert.match(out, new RegExp('index\\.json lists ' + (shipped.length + 1) + ' paper\\(s\\)'));
        const index = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
        assert.deepEqual(index.papers.map(p => p.id).sort(), shipped.map(p => p.id).concat('aptitude-1').sort());
        fs.writeFileSync(path.join(dir, 'aptitude-2.json'), '{"id": "aptitude-2"');
        assert.ok(Papers.buildIndex(dir).errors.some(e => /aptitude-2\.json: not valid JSON/.test(e)));
        fs.writeFileSync(path.join(dir, 'aptitude-2.json'), JSON.stringify(Object.assign(JSON.parse(fs.readFileSync(path.join(dir, 'aptitude-1.json'), 'utf8')), { id: 'aptitude-3' })));
        assert.ok(Papers.buildIndex(dir).errors.some(e => /must be named aptitude-3\.json/.test(e)));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

/** The real page in jsdom (served from `papersDir`), with the platform engine, bridge and page scripts. */
async function openPage(papersDir, hash) {
    const body = HTML.replace(/<script\b[\s\S]*?<\/script>/g, '');
    const dom = new JSDOM(body, { url: 'http://127.0.0.1/articleship-program/written-test/' + (hash || ''), runScripts: 'outside-only', pretendToBeVisual: true });
    const win = dom.window;
    win.scrollTo = () => {};
    win.fetch = url => {
        const file = path.join(papersDir, decodeURIComponent(String(url).replace(/^papers\//, '').split('?')[0]));
        if (!fs.existsSync(file)) return Promise.resolve({ ok: false, status: 404, json: () => Promise.reject(new Error('404')) });
        const text = fs.readFileSync(file, 'utf8');
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(JSON.parse(text)) });
    };
    for (const f of ['scripts/articleship-gate.js', 'scripts/articleship-progress.js', 'scripts/articleship-written-test.js',
        'articleship-program/written-test/js/written-test-core.js', 'articleship-program/written-test/js/written-test-charts.js',
        'articleship-program/written-test/js/written-test-app.js']) {
        win.eval(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    }
    for (let i = 0; i < 100 && !win.document.querySelector('.paper-card, .screen.start, .screen.error, .screen.missing'); i++) {
        await new Promise(r => setTimeout(r, 20));
    }
    return dom;
}

test('page: lists exactly the papers in index.json, grouped; a new paper file shows up with no code change', async () => {
    const dom = await openPage(PAPERS);
    const doc = dom.window.document;
    const index = JSON.parse(fs.readFileSync(path.join(PAPERS, 'index.json'), 'utf8'));
    assert.deepEqual([...doc.querySelectorAll('.paper-card')].map(a => a.getAttribute('data-paper')), index.papers.map(p => p.id));
    assert.equal(doc.documentElement.classList.contains('ap-gated'), false, 'the gate steps aside on 127.0.0.1');
    assert.equal(typeof dom.window.ArticleshipProgress.create, 'function');
    assert.equal(typeof dom.window.MSCGate.check, 'function');
    dom.window.close();

    const dir = newPaperFolder();
    try {
        execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'articleship-written-test-papers.js'), dir]);
        const dom2 = await openPage(dir);
        const doc2 = dom2.window.document;
        const listed = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')).papers;
        const cards = [...doc2.querySelectorAll('.paper-card')].map(a => a.getAttribute('data-paper'));
        assert.deepEqual(cards.slice().sort(), listed.map(p => p.id).sort());
        assert.ok(cards.includes('aptitude-1'), 'the new paper is on the page');
        const groups = [...doc2.querySelectorAll('.group h2')].map(h => h.textContent);
        assert.ok(groups.includes('Screening papers') && groups.includes('Aptitude papers'), groups.join(', '));
        dom2.window.close();
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test('page: a paper\'s state goes into the platform store (one written-test row), the paper copy stays on the device', async () => {
    const dom = await openPage(PAPERS, '#/screening-1');
    const win = dom.window;
    const doc = win.document;
    const start = [...doc.querySelectorAll('button')].find(b => /^Start/.test(b.textContent.trim()));
    assert.ok(start, 'start screen');
    start.click();
    for (let i = 0; i < 50 && !win.location.hash.endsWith('/sit'); i++) await new Promise(r => setTimeout(r, 20));
    const envelope = JSON.parse(win.localStorage.getItem('msc.articleship.written-test'));
    assert.ok(envelope && envelope.data.papers['screening-1'].current, 'the running attempt is in the written-test row');
    assert.ok(win.localStorage.getItem('msc.articleship.writtenTest.cache.paper.screening-1'), 'the paper copy is a device cache');
    assert.equal(win.localStorage.getItem('msc.articleship.writtenTest.screening-1'), null, 'no second copy of the progress');
    win.close();
});

// ---------- the bridge ----------
test('bridge: progress keys live in the platform store; cache keys stay in localStorage', async () => {
    const storage = memoryStorage();
    const store = deviceStore(storage);
    const progress = W.createProgress({ prefix: 'msc.articleship.writtenTest', store, storage, dispatch: () => {} });
    assert.equal(progress.get('screening-1'), null);
    progress.set('screening-1', paperState('screening-1', 5));
    assert.deepEqual(store.get().papers['screening-1'], paperState('screening-1', 5));
    assert.deepEqual(progress.get('screening-1'), paperState('screening-1', 5));
    progress.set('cache.paper.screening-1', { rev: 'abc', paper: { id: 'screening-1' } }, { local: true });
    assert.equal(store.get().papers['cache.paper.screening-1'], undefined);
    assert.deepEqual(JSON.parse(storage.getItem('msc.articleship.writtenTest.cache.paper.screening-1')).rev, 'abc');
    assert.deepEqual(progress.keys().sort(), ['cache.paper.screening-1', 'screening-1']);
    assert.deepEqual(await progress.pull('screening-1'), paperState('screening-1', 5));
    await progress.flush();
    progress.remove('screening-1');
    progress.remove('cache.paper.screening-1');
    assert.deepEqual(store.get().papers, {});
    assert.equal(storage.getItem('msc.articleship.writtenTest.cache.paper.screening-1'), null);
    assert.equal(progress.hasRemote(), true);
});

test('bridge: pull waits for the account copy, but never longer than the cap', async () => {
    const storage = memoryStorage();
    const store = deviceStore(storage);
    let release;
    store.ready = new Promise(r => { release = r; });
    const slow = W.createProgress({ store, storage, readyWaitMs: 30, dispatch: () => {} });
    const t0 = Date.now();
    assert.equal(await slow.pull('screening-1'), null);
    assert.ok(Date.now() - t0 < 1000);
    release('none');
});

test('bridge: a paper changed by the account or another tab is announced on its own key; own changes are not', () => {
    const storage = memoryStorage();
    const store = deviceStore(storage);
    const said = [];
    const progress = W.createProgress({ prefix: 'msc.articleship.writtenTest', store, storage, dispatch: k => said.push(k) });
    progress.set('screening-1', paperState('screening-1', 1));
    assert.deepEqual(said, []);
    const other = JSON.parse(storage.getItem(store.key));
    other.data.papers['screening-1'] = paperState('screening-1', 9);
    other.data.papers['aptitude-1'] = paperState('aptitude-1', 3);
    store._onStorageEvent({ key: store.key, newValue: JSON.stringify(other) });
    assert.deepEqual(said.sort(), ['msc.articleship.writtenTest.aptitude-1', 'msc.articleship.writtenTest.screening-1']);
    assert.equal(progress.get('screening-1').updatedAt, 9);
});

test('bridge: two devices — per paper, the later change wins; nothing is lost', () => {
    const local = { papers: { a: paperState('a', 10), b: paperState('b', 1), c: paperState('c', 4) } };
    const remote = { papers: { a: paperState('a', 5), b: paperState('b', 7), d: paperState('d', 2) } };
    const merged = W.mergePapers(local, remote);
    assert.deepEqual(Object.keys(merged.papers).sort(), ['a', 'b', 'c', 'd']);
    assert.equal(merged.papers.a.updatedAt, 10);
    assert.equal(merged.papers.b.updatedAt, 7);
    assert.deepEqual(W.mergePapers({}, null), { papers: {} });
});

test('bridge: the account copy stays under the cap — oldest attempts go first; best, last and the running attempt stay', () => {
    const entry = i => ({ id: 'a' + i, score: i, max: 54, right: i, wrong: 0, blank: 54 - i, submittedAt: i, sections: [{ id: 'english', score: 1, max: 10, note: 'x'.repeat(200) }] });
    const papers = {};
    for (const id of ['s1', 's2', 's3']) {
        papers[id] = paperState(id, 1, { current: { answers: { q1: 'a' } }, last: { answers: { q2: 'b' } }, best: entry(99), history: Array.from({ length: 30 }, (_, i) => entry(i)) });
    }
    const data = { papers };
    assert.equal(W.fitForSync(data, 1e9), data, 'under the cap: untouched');
    const fitted = W.fitForSync(data, 12000);
    assert.ok(JSON.stringify(fitted).length <= 12000);
    for (const id of ['s1', 's2', 's3']) {
        const st = fitted.papers[id];
        assert.ok(st.history.length < 30);
        assert.equal(st.history[st.history.length - 1].id, 'a29', 'the newest attempts stay');
        assert.equal(st.best.id, 'a99');
        assert.deepEqual(st.current.answers, { q1: 'a' });
        assert.deepEqual(st.last.answers, { q2: 'b' });
    }
    assert.equal(data.papers.s1.history.length, 30, 'the input is not changed');
});

test('bridge: MSCGate is the platform courtesy gate', async () => {
    assert.equal(await W.gate({ protect: () => Promise.resolve({ state: 'allow', user: null, how: 'preview' }) }).check(), true);
    assert.equal(await W.gate({ protect: () => Promise.reject(new Error('x')) }).check(), true, 'an error never locks the page');
    assert.equal(W.gate({}).check(), true, 'no gate on the page: open');
});
