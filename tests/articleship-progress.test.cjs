const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../scripts/articleship-progress.js');

function memoryStorage(seed = {}) {
    const map = new Map(Object.entries(seed));
    return {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, String(value)),
        removeItem: key => map.delete(key),
        map
    };
}

/** A small in-memory stand-in for the Supabase client: one table, RLS by the signed-in user. */
function fakeSupabase({ userId = 'user-a', missingTable = false, failNetwork = false } = {}) {
    const rows = new Map();
    let clock = Date.parse('2026-01-01T00:00:00Z');
    const calls = [];
    const missing = { code: 'PGRST205', message: "Could not find the table 'public.articleship_tool_progress' in the schema cache" };
    const client = {
        rows, calls,
        user: userId,
        auth: { getSession: async () => ({ data: { session: client.user ? { user: { id: client.user } } : null } }) },
        from(table) {
            assert.equal(table, 'articleship_tool_progress');
            const ctx = { filters: {} };
            const builder = {
                select(columns) { ctx.columns = columns; return builder; },
                eq(column, value) { ctx.filters[column] = value; return builder; },
                upsert(payload, options) { ctx.upsert = payload; ctx.options = options; return builder; },
                async maybeSingle() {
                    calls.push(['select', ctx.filters.tool]);
                    if (failNetwork) throw new TypeError('Failed to fetch');
                    if (missingTable) return { data: null, error: missing };
                    const row = rows.get(client.user + '|' + ctx.filters.tool);
                    return { data: row ? { data: JSON.parse(JSON.stringify(row.data)), updated_at: row.updated_at } : null, error: null };
                },
                async single() {
                    calls.push(['upsert', ctx.upsert.tool, ctx.options && ctx.options.onConflict]);
                    if (failNetwork) throw new TypeError('Failed to fetch');
                    if (missingTable) return { data: null, error: missing };
                    if (ctx.upsert.user_id !== client.user) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
                    clock += 1000;
                    const row = { data: JSON.parse(JSON.stringify(ctx.upsert.data)), updated_at: new Date(clock).toISOString() };
                    rows.set(client.user + '|' + ctx.upsert.tool, row);
                    return { data: { updated_at: row.updated_at }, error: null };
                }
            };
            return builder;
        },
        remoteWrite(tool, data, user = client.user) {
            clock += 5000;
            rows.set(user + '|' + tool, { data, updated_at: new Date(clock).toISOString() });
        }
    };
    return client;
}

function makeStore(tool, extra = {}) {
    let t = Date.parse('2026-01-01T00:00:00Z');
    return P.createStore(tool, Object.assign({
        storage: memoryStorage(), sessionFlags: memoryStorage(), debounceMs: 0, now: () => (t += 10), userId: () => 'user-a'
    }, extra));
}

test('domains: 13 canonical slugs, labels and aliases normalise to one slug', () => {
    assert.equal(P.DOMAINS.length, 13);
    assert.equal(new Set(P.DOMAINS.map(d => d.slug)).size, 13);
    const cases = {
        'Statutory audit': 'statutory-audit', 'statutory-audit': 'statutory-audit', 'Audit': 'statutory-audit',
        'Internal audit, risk & IFC': 'internal-audit', 'IA': 'internal-audit', 'Direct tax': 'direct-tax', 'Income Tax': 'direct-tax',
        'GST': 'gst', 'Indirect tax': 'gst', 'Bank audit': 'bank-audit', 'TP': 'transfer-pricing', 'M&A tax': 'ma-tax',
        'Valuation': 'valuation', 'Financial due diligence': 'fdd', 'FDD': 'fdd', 'Forensic': 'forensic',
        'Consulting & risk advisory': 'consulting', 'Accounting, MIS & company law': 'accounting',
        'IB & equity research': 'ib-er', 'Investment banking': 'ib-er'
    };
    for (const [input, slug] of Object.entries(cases)) assert.equal(P.normaliseDomain(input), slug, input);
    for (const bad of ['', null, undefined, 'astrology', '<script>']) assert.equal(P.normaliseDomain(bad), null);
    assert.equal(P.domainLabel('gst'), 'GST');
    assert.equal(P.domainLabel('nope'), '');
});

test('tool keys are validated before anything is stored', () => {
    assert.equal(P.storageKey('cv-checklist'), 'msc.articleship.cv-checklist');
    for (const bad of ['', 'A', 'cv checklist', '../x', 'x'.repeat(41)]) assert.throws(() => P.storageKey(bad));
});

test('missing-table errors are told apart from other errors', () => {
    assert.ok(P.isMissingTableError({ code: 'PGRST205', message: 'Could not find the table' }));
    assert.ok(P.isMissingTableError({ code: '42P01', message: 'relation "public.articleship_tool_progress" does not exist' }));
    assert.ok(P.isMissingTableError({ status: 404, message: 'Not found' }));
    assert.ok(!P.isMissingTableError({ code: '42501', message: 'permission denied' }));
    assert.ok(!P.isMissingTableError(null));
});

test('reconcile: pull a newer account copy, push local edits, merge only on a two-device conflict', () => {
    const local = { data: { a: 1 }, updatedAt: 100, syncedAt: 50, dirty: false };
    assert.equal(P.reconcile(local, null).action, 'push');
    assert.equal(P.reconcile({ ...local, updatedAt: 0 }, null).action, 'none');
    const remote = { data: { a: 2 }, updated_at: new Date(80).toISOString() };
    assert.equal(P.reconcile(local, remote).action, 'pull');
    assert.equal(P.reconcile({ ...local, syncedAt: 80 }, remote).action, 'none');
    assert.equal(P.reconcile({ ...local, syncedAt: 80, dirty: true }, remote).action, 'push');
    // both changed: later wins unless a merge is given
    assert.equal(P.reconcile({ ...local, dirty: true, updatedAt: 70 }, remote).action, 'pull');
    assert.equal(P.reconcile({ ...local, dirty: true, updatedAt: 90 }, remote).action, 'push');
    const merged = P.reconcile({ ...local, dirty: true, data: { ticks: { x: true } } }, { data: { ticks: { y: true } }, updated_at: remote.updated_at },
        (l, r) => ({ ticks: { ...r.ticks, ...l.ticks } }));
    assert.equal(merged.action, 'merge');
    assert.deepEqual(merged.data, { ticks: { y: true, x: true } });
});

test('a store saves locally at once and works with no client at all', async () => {
    const storage = memoryStorage();
    const store = makeStore('cv-checklist', { storage, client: null, defaults: { ticks: {} } });
    assert.deepEqual(store.get(), { ticks: {} });
    const seen = [];
    store.subscribe((data, meta) => seen.push([data, meta.source]));
    store.update(data => { data.ticks['one-page'] = true; });
    assert.deepEqual(store.get(), { ticks: { 'one-page': true } });
    assert.deepEqual(seen, [[{ ticks: { 'one-page': true } }, 'local']]);
    const saved = JSON.parse(storage.getItem('msc.articleship.cv-checklist'));
    assert.deepEqual(saved.data, { ticks: { 'one-page': true } });
    assert.equal(saved.dirty, true);
    assert.equal(await store.ready, 'local');
    // a second page load reads it back
    const again = makeStore('cv-checklist', { storage, client: null, defaults: { ticks: {}, extra: 1 } });
    assert.deepEqual(again.get(), { ticks: { 'one-page': true }, extra: 1 }, 'new defaults are filled in');
    // the returned copy cannot change the store by accident
    const copy = again.get(); copy.ticks.hacked = true;
    assert.equal(again.get().ticks.hacked, undefined);
});

test('signed in with the table: local edits reach the account; a new device pulls them', async () => {
    const client = fakeSupabase();
    const store = makeStore('linkedin-checklist', { client, defaults: { ticks: {} } });
    await store.ready;
    store.update({ ticks: { photo: true } });
    await store.flush();
    assert.deepEqual(client.rows.get('user-a|linkedin-checklist').data, { ticks: { photo: true } });
    assert.equal(client.calls.find(call => call[0] === 'upsert')[2], 'user_id,tool');
    assert.equal(store.status().dirty, false);

    const otherDevice = makeStore('linkedin-checklist', { client, defaults: { ticks: {} } });
    const updates = [];
    otherDevice.subscribe((data, meta) => updates.push(meta.source));
    assert.equal(await otherDevice.ready, 'pull');
    assert.deepEqual(otherDevice.get(), { ticks: { photo: true } });
    assert.deepEqual(updates, ['remote']);
});

test('progress made before the table existed is pushed once the student is signed in', async () => {
    const storage = memoryStorage();
    const offline = makeStore('interview-tracker', { storage, client: null });
    offline.set({ status: { intro: 'ready' } });
    const client = fakeSupabase();
    const online = makeStore('interview-tracker', { storage, client });
    assert.equal(await online.ready, 'push');
    assert.deepEqual(client.rows.get('user-a|interview-tracker').data, { status: { intro: 'ready' } });
});

test('without the table the tools stay local silently and stop asking for the session', async () => {
    const client = fakeSupabase({ missingTable: true });
    const sessionFlags = memoryStorage();
    const store = makeStore('cv-checklist', { client, sessionFlags });
    assert.equal(await store.ready, 'local');
    store.set({ ticks: { a: true } });
    await store.flush();
    assert.deepEqual(store.get(), { ticks: { a: true } });
    assert.equal(store.status().remote, 'missing');
    assert.equal(sessionFlags.getItem('msc.articleship.remote'), 'missing');
    const before = client.calls.length;
    const next = makeStore('work-simulation', { client, sessionFlags });
    await next.ready;
    next.set({ levels: {} });
    await next.flush();
    assert.equal(client.calls.length, before, 'no further requests once the table is known to be missing');
});

test('network errors never throw and keep the change queued', async () => {
    const client = fakeSupabase({ failNetwork: true });
    const store = makeStore('cv-checklist', { client });
    assert.equal(await store.ready, 'local');
    store.set({ ticks: { a: true } });
    assert.equal(await store.flush(), false);
    assert.equal(store.status().dirty, true);
    assert.equal(store.status().remote, 'error');
});

test('another student on the same browser never inherits or uploads the first student\'s progress', async () => {
    const storage = memoryStorage();
    const client = fakeSupabase({ userId: 'user-a' });
    const a = makeStore('cv-checklist', { storage, client, userId: () => 'user-a', defaults: { ticks: {} } });
    await a.ready;
    a.set({ ticks: { mine: true } });
    await a.flush();
    client.user = 'user-b';
    const b = makeStore('cv-checklist', { storage, client, userId: () => 'user-b', defaults: { ticks: {} } });
    assert.deepEqual(b.get(), { ticks: {} }, 'cleared before first paint');
    await b.ready;
    assert.equal(client.rows.has('user-b|cv-checklist'), false);
    // A's progress is still in A's account
    assert.deepEqual(client.rows.get('user-a|cv-checklist').data, { ticks: { mine: true } });
});

test('two devices that both changed: the tool\'s merge decides', async () => {
    const client = fakeSupabase();
    const storage = memoryStorage();
    const merge = (local, remote) => ({ ticks: { ...remote.ticks, ...local.ticks } });
    const store = makeStore('cv-checklist', { client, storage, merge, defaults: { ticks: {} } });
    await store.ready;
    store.set({ ticks: { a: true } });
    await store.flush();
    // offline edit here, while another device saved
    const offlineClient = { ...client, from() { throw new Error('offline'); } };
    const offline = makeStore('cv-checklist', { client: offlineClient, storage, merge, defaults: { ticks: {} } });
    offline.set({ ticks: { a: true, b: true } });
    client.remoteWrite('cv-checklist', { ticks: { a: true, c: true } });
    const back = makeStore('cv-checklist', { client, storage, merge, defaults: { ticks: {} } });
    assert.equal(await back.ready, 'merge');
    assert.deepEqual(back.get(), { ticks: { a: true, b: true, c: true } });
    assert.deepEqual(client.rows.get('user-a|cv-checklist').data, { ticks: { a: true, b: true, c: true } });
});

test('shared settings: my domain, backup and the CV pick are read by every tool', () => {
    const settings = makeStore('settings', { client: null, defaults: { myDomain: null, backupDomain: null, cvPick: null } });
    assert.equal(P.getMyDomain(settings), null);
    assert.equal(P.setMyDomain('Indirect tax', { backup: 'Statutory audit' }, settings), 'gst');
    assert.equal(P.getMyDomain(settings), 'gst');
    assert.equal(P.getBackupDomain(settings), 'statutory-audit');
    P.setMyDomain('statutory-audit', null, settings);
    assert.equal(P.getBackupDomain(settings), null, 'backup cannot equal the main domain');
    assert.throws(() => P.setMyDomain('astrology', null, settings), /Unknown domain/);

    assert.equal(P.getCvPick(settings), null);
    const pick = P.setCvPick({ situation: 'b', order: ['header', 'education', ' '], design: '3', variants: ['result-awaited', 'result-awaited'], domain: 'Direct tax' }, settings);
    assert.equal(pick.situation, 'B');
    assert.deepEqual(pick.order, ['header', 'education']);
    assert.equal(pick.design, 3);
    assert.deepEqual(pick.variants, ['result-awaited']);
    assert.equal(pick.domain, 'direct-tax');
    assert.deepEqual(P.getCvPick(settings), pick);
    assert.equal(P.getMyDomain(settings), 'statutory-audit', 'a CV pick does not override a domain already chosen');
    assert.throws(() => P.setCvPick({ situation: 'Z' }, settings), /Unknown situation/);
    const fresh = makeStore('settings', { client: null, defaults: { myDomain: null, backupDomain: null, cvPick: null } });
    P.setCvPick({ situation: 'H', domain: 'gst' }, fresh);
    assert.equal(P.getMyDomain(fresh), 'gst', 'the first CV pick sets my domain when none is set');
});

test('corrupt local data never breaks a tool', () => {
    const storage = memoryStorage({ 'msc.articleship.cv-checklist': '{not json' });
    const store = makeStore('cv-checklist', { storage, client: null, defaults: { ticks: {} } });
    assert.deepEqual(store.get(), { ticks: {} });
    assert.throws(() => store.set([1, 2]), /plain object/);
});

test('another tab saving the same tool updates this page', () => {
    const store = makeStore('cv-checklist', { client: null, defaults: { ticks: {} } });
    const seen = [];
    store.subscribe((data, meta) => seen.push(meta.source));
    store._onStorageEvent({ key: 'msc.articleship.cv-checklist', newValue: JSON.stringify({ data: { ticks: { z: true } }, updatedAt: 5 }) });
    store._onStorageEvent({ key: 'msc.articleship.other', newValue: '{}' });
    assert.deepEqual(store.get(), { ticks: { z: true } });
    assert.deepEqual(seen, ['other-tab']);
});
