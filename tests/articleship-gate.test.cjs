const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

function loadGate(window) {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../scripts/articleship-gate.js'), 'utf8');
    window.eval(source);
    return window.MSCArticleshipGate;
}

const G = require('../scripts/articleship-gate.js');

function client({ user = { id: 'u1' }, courses = ['msc-articleship-program'], authError = null, dbError = null, throws = false } = {}) {
    const calls = [];
    return {
        calls,
        auth: { getUser: async () => { calls.push('getUser'); if (throws) throw new TypeError('Failed to fetch'); return { data: { user }, error: authError }; } },
        from(table) {
            calls.push(table);
            return { select() { return this; }, async eq(col, value) { calls.push([col, value]); return { data: courses.map(course => ({ course })), error: dbError }; } };
        }
    };
}

test('decide: only the Articleship enrolment opens the tools', () => {
    assert.equal(G.decide({ user: { id: 'u' }, courses: ['msc-articleship-program'] }), 'allow');
    assert.equal(G.decide({ user: { id: 'u' }, courses: ['articleship-mastery'] }), 'allow', 'legacy purchase slug');
    assert.equal(G.decide({ user: { id: 'u' }, courses: ['industrial-training-mastery', 'msc-ca-freshers-program'] }), 'enrol',
        'another programme is not enough');
    assert.equal(G.decide({ user: null, courses: [] }), 'login');
    assert.equal(G.decide({ user: null, error: new Error('x') }), 'retry');
    assert.equal(G.decide(null), 'retry');
});

test('check: server-verified user, enrolment rows by uuid, errors reported not thrown', async () => {
    const ok = client();
    const result = await G.check(ok);
    assert.deepEqual(result.courses, ['msc-articleship-program']);
    assert.deepEqual(ok.calls, ['getUser', 'enrollment', ['uuid', 'u1']]);
    assert.equal(G.decide(await G.check(client({ user: null }))), 'login');
    assert.equal(G.decide(await G.check(client({ user: null, authError: Object.assign(new Error('Auth session missing!'), { name: 'AuthSessionMissingError' }) }))), 'login');
    assert.equal(G.decide(await G.check(client({ throws: true }))), 'retry');
    assert.equal(G.decide(await G.check(client({ dbError: { message: 'boom' } }))), 'retry');
    assert.equal(G.decide(await G.check(null)), 'retry');
});

function page(url, { session } = {}) {
    const dom = new JSDOM('<!doctype html><html><head></head><body class="ap-page"><main id="tool">Tool</main></body></html>', { url, runScripts: 'outside-only' });
    if (session) dom.window.localStorage.setItem('sb-auth-auth-token', JSON.stringify({ user: { id: session } }));
    return { dom, gate: loadGate(dom.window) };
}

test('protect: an enrolled student sees the tool; the verdict is cached for a week', async () => {
    const { dom, gate } = page('https://www.mystudentclub.com/articleship-program/cv-checklist/', { session: 'u1' });
    let now = Date.parse('2026-01-01T00:00:00Z');
    const result = await gate.protect({ client: client(), now: () => now });
    assert.equal(result.state, 'allow');
    assert.equal(result.how, 'verified');
    assert.equal(dom.window.document.getElementById('ap-gate'), null);
    assert.ok(!dom.window.document.documentElement.classList.contains('ap-gated'));
    assert.equal(dom.window.document.querySelector('meta[name="robots"]').content, 'noindex');
    // next visit, offline: shown at once from the cache, network failure does not lock out
    const second = await gate.protect({ client: client({ throws: true }), now: () => now + 86400000 });
    assert.equal(second.how, 'cache');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(dom.window.document.getElementById('ap-gate'), null);
    // after 8 days the cache is stale: a failed check asks to try again
    const stale = page('https://www.mystudentclub.com/articleship-program/cv-checklist/', { session: 'u1' });
    stale.dom.window.localStorage.setItem('msc.articleship.gate', JSON.stringify({ user: 'u1', at: now - 8 * 86400000 }));
    stale.gate.protect({ client: client({ throws: true }), now: () => now });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(stale.dom.window.document.getElementById('ap-gate').dataset.state, 'retry');
});

test('protect: logged out → log in card with a redirect back; not enrolled → programme card', async () => {
    const out = page('https://www.mystudentclub.com/articleship-program/cv-checklist/?x=1');
    out.gate.protect({ client: client({ user: null }) });
    await new Promise(r => setTimeout(r, 10));
    const gateEl = out.dom.window.document.getElementById('ap-gate');
    assert.equal(gateEl.dataset.state, 'login');
    assert.ok(out.dom.window.document.documentElement.classList.contains('ap-gated'));
    const login = gateEl.querySelector('a');
    assert.equal(login.getAttribute('href'), '/login.html?redirect=' + encodeURIComponent('/articleship-program/cv-checklist/?x=1'));

    const other = page('https://www.mystudentclub.com/articleship-program/cv-checklist/', { session: 'u2' });
    other.dom.window.localStorage.setItem('msc.articleship.gate', JSON.stringify({ user: 'u2', at: Date.now() }));
    other.gate.protect({ client: client({ user: { id: 'u2' }, courses: ['industrial-training-mastery'] }) });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(other.dom.window.document.getElementById('ap-gate').dataset.state, 'enrol', 'a lost enrolment hides the tool again');
    assert.equal(other.dom.window.localStorage.getItem('msc.articleship.gate'), null);
});

test('protect: on localhost the gate steps aside unless asked; ?gate=<card> previews a card', async () => {
    const local = page('http://127.0.0.1:8765/articleship-program/cv-checklist/');
    const result = await local.gate.protect({ client: client({ user: null }) });
    assert.equal(result.how, 'preview');
    const preview = page('http://localhost:8765/articleship-program/cv-checklist/?gate=enrol');
    preview.gate.protect({ client: client() });
    assert.equal(preview.dom.window.document.getElementById('ap-gate').dataset.state, 'enrol');
    const real = page('http://localhost:8765/articleship-program/cv-checklist/?gate=check');
    real.gate.protect({ client: client({ user: null }) });
    await new Promise(r => setTimeout(r, 10));
    assert.equal(real.dom.window.document.getElementById('ap-gate').dataset.state, 'login');
    assert.equal(G.isLocalHost('www.mystudentclub.com'), false);
    assert.equal(G.isLocalHost('mobile.mystudentclub.com'), false);
});
