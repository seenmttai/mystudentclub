const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const C = require('../scripts/articleship-checklist.js');
const P = require('../scripts/articleship-progress.js');

const SAMPLE = {
    tool: 'cv-checklist',
    title: 'CV checklist',
    items: [
        { id: 'one-page', section: 'Set-up', check: 'One page only', example: 'Cut the hobbies line before you shrink the font.', fix: { label: 'Open the CV Builder', href: '/cv-builder/?stage=articleship' } },
        { id: 'font', section: 'Set-up', check: 'Never shrink the font below 10', fix_link: 'javascript:alert(1)' },
        { section: 'Header', check: 'Name-based email', example: ['firstname.lastname@email.com', 'not cool.guy99@email.com'] },
        { section: 'Header', check: 'Name-based email' },
        { section: 'Finish', check: 'Run CV Reviewer', link: 'https://www.mystudentclub.com/cv-reviewer/', link_label: 'CV Reviewer' },
        { section: 'Finish', check: 'Personal review', fix: { href: 'https://wa.me/917228881182?text=Hi', label: 'Send it' } }
    ],
    done: { title: 'All done', text: 'Now run the CV Reviewer.', links: [{ label: 'CV Reviewer', href: '/cv-reviewer/' }, { label: 'Bad', href: 'javascript:x' }] }
};

function memoryStore(defaults) {
    const map = new Map();
    return P.createStore('cv-checklist', {
        storage: { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) },
        client: null, sessionFlags: null, debounceMs: 0, userId: () => null, defaults
    });
}

test('normalise: sections from items, ids made unique, unsafe links dropped, numbering continuous', () => {
    const model = C.normalise(SAMPLE);
    assert.deepEqual(model.sections.map(s => [s.title, s.items.length]), [['Set-up', 2], ['Header', 2], ['Finish', 2]]);
    assert.equal(model.total, 6);
    assert.deepEqual(model.items.map(i => i.no), [1, 2, 3, 4, 5, 6]);
    assert.equal(model.items[2].id, 'name-based-email');
    assert.equal(model.items[3].id, 'name-based-email-2');
    assert.equal(model.items[1].fix, null, 'javascript: links never render');
    assert.deepEqual(model.items[0].fix, { href: '/cv-builder/?stage=articleship', label: 'Open the CV Builder', external: false });
    assert.equal(model.items[2].example, 'firstname.lastname@email.com\nnot cool.guy99@email.com');
    assert.equal(model.items[4].fix.external, false, 'mystudentclub.com stays in the tab');
    assert.equal(model.items[5].fix.external, true);
    assert.deepEqual(model.done.links.map(l => l.label), ['CV Reviewer']);
    // the sections shape works too
    const other = C.normalise({ sections: [{ title: 'Photo', items: [{ check: 'Clear face photo' }] }] });
    assert.equal(other.items[0].id, 'clear-face-photo');
    assert.throws(() => C.normalise({ items: [] }), /no items/);
    assert.throws(() => C.normalise({ items: [{ example: 'x' }] }), /no text/);
});

test('summarise: "14 of 22 done" style label, percent, per section, next item; stale ticks ignored', () => {
    const model = C.normalise(SAMPLE);
    const s = C.summarise(model, { 'one-page': true, 'name-based-email': true, 'removed-item': true });
    assert.equal(s.label, '2 of 6 done');
    assert.equal(s.percent, 33);
    assert.equal(s.complete, false);
    assert.deepEqual(s.sections.map(x => x.done), [1, 1, 0]);
    assert.equal(s.next, 'font');
    const all = Object.fromEntries(model.items.map(i => [i.id, true]));
    assert.equal(C.summarise(model, all).complete, true);
    assert.equal(C.progressLabel(14, 22), '14 of 22 done');
});

test('merge on a two-device conflict keeps every tick', () => {
    assert.deepEqual(C.mergeTicks({ ticks: { a: true } }, { ticks: { b: true, c: false } }), { ticks: { a: true, b: true } });
});

test('merge: per check the later change wins, so an untick on one device is not undone by the other', () => {
    // A unticked "a" at 300; B still has the tick from 100 and ticked "b" at 200.
    const a = { ticks: { c: true }, at: { a: 300, c: 100 } };
    const b = { ticks: { a: true, b: true, c: true }, at: { a: 100, b: 200, c: 100 } };
    assert.deepEqual(C.mergeTicks(a, b), { ticks: { b: true, c: true }, at: { a: 300, b: 200, c: 100 } });
    assert.deepEqual(C.mergeTicks(b, a).ticks, { b: true, c: true }, 'same answer whichever device merges');
    // A change with a time beats a tick saved before times were kept; ticks with no time on either side are kept.
    assert.deepEqual(C.mergeTicks({ ticks: {}, at: { a: 5 } }, { ticks: { a: true, d: true } }).ticks, { d: true });
    // applyTicks stamps ticks and unticks alike and leaves the input alone.
    const data = { ticks: { a: true }, other: 1 };
    assert.deepEqual(C.applyTicks(data, { a: false, b: true }, 42), { ticks: { b: true }, at: { a: 42, b: 42 }, other: 1 });
    assert.deepEqual(data, { ticks: { a: true }, other: 1 });
});

/** One account row per tool, shared by two devices (enough of the Supabase client for the progress engine). */
function sharedAccount() {
    const rows = new Map();
    let clock = Date.parse('2026-01-01T00:00:00Z');
    return {
        online: true,
        rows,
        client() {
            const account = this;
            return {
                auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
                from() {
                    const ctx = {};
                    const builder = {
                        select() { return builder; },
                        eq(column, value) { ctx.tool = value; return builder; },
                        upsert(payload) { ctx.upsert = payload; return builder; },
                        async maybeSingle() {
                            if (!account.online) throw new TypeError('offline');
                            const row = rows.get(ctx.tool);
                            return { data: row ? JSON.parse(JSON.stringify(row)) : null, error: null };
                        },
                        async single() {
                            if (!account.online) throw new TypeError('offline');
                            clock += 1000;
                            const row = { data: JSON.parse(JSON.stringify(ctx.upsert.data)), updated_at: new Date(clock).toISOString() };
                            rows.set(ctx.upsert.tool, row);
                            return { data: { updated_at: row.updated_at }, error: null };
                        }
                    };
                    return builder;
                }
            };
        }
    };
}

function device(account, clock) {
    const map = new Map();
    const storage = { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) };
    const open = () => P.createStore('cv-checklist', {
        storage, client: account.client(), sessionFlags: null, debounceMs: 0, userId: () => 'u1',
        defaults: { ticks: {} }, merge: C.mergeTicks, now: () => clock.t
    });
    const mountOn = store => C.mount(new JSDOM('<!doctype html><div id="l"></div>').window.document.getElementById('l'), SAMPLE, { store, now: () => clock.t });
    return { open, mountOn };
}

test('two devices, both changed since the last sync: untick on A, tick on B, the untick stays', async () => {
    const account = sharedAccount();
    const clock = { t: Date.parse('2026-01-01T00:00:00Z') };
    const A = device(account, clock);
    const B = device(account, clock);

    // Both devices in step: "one-page" ticked on A, synced, seen on B.
    const storeA = A.open();
    await storeA.ready;
    const listA = A.mountOn(storeA);
    clock.t += 1000; listA.tick('one-page', true);
    await storeA.flush();
    const storeB = B.open();
    await storeB.ready;
    const listB = B.mountOn(storeB);
    assert.equal(listB.summary().done, 1);

    // A goes offline and unticks it; B (online) ticks another check.
    account.online = false;
    clock.t += 1000; listA.tick('one-page', false);
    await storeA.flush();
    assert.equal(storeA.status().dirty, true, 'A has an unsynced change');
    account.online = true;
    clock.t += 1000; listB.tick('font', true);
    await storeB.flush();

    // A comes back: both changed since A's last sync, so the merge decides, check by check.
    const back = A.open();
    assert.equal(await back.ready, 'merge');
    assert.deepEqual(back.get().ticks, { font: true }, 'the untick on A is kept, the tick on B is added');
    assert.deepEqual(account.rows.get('cv-checklist').data.ticks, { font: true }, 'and that is what the account holds');
});

test('untick all on one device while the other ticks: only the newer tick survives the merge', () => {
    const t0 = { ticks: { a: true, b: true }, at: { a: 10, b: 10 } };
    const reset = C.applyTicks(t0, { a: false, b: false }, 50);
    const other = C.applyTicks(t0, { c: true }, 60);
    assert.deepEqual(C.mergeTicks(reset, other).ticks, { c: true });
    assert.deepEqual(C.mergeTicks(other, reset).ticks, { c: true });
});

test('mount: renders, ticks save through the progress store, progress and done card update, reload restores', () => {
    const dom = new JSDOM('<!doctype html><main id="list"></main>');
    const doc = dom.window.document;
    const store = memoryStore({ ticks: {} });
    const changes = [];
    const list = C.mount(doc.getElementById('list'), SAMPLE, { store, onChange: s => changes.push(s.label) });
    const items = doc.querySelectorAll('.ap-cl-item');
    assert.equal(items.length, 6);
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '0 of 6 done');
    assert.equal(doc.querySelectorAll('.ap-cl-section-title').length, 3);
    assert.equal(doc.querySelector('.ap-cl-fix').getAttribute('href'), '/cv-builder/?stage=articleship');
    assert.equal(doc.querySelectorAll('a[href^="javascript"]').length, 0);
    const external = [...doc.querySelectorAll('.ap-cl-fix')].find(a => a.href.startsWith('https://wa.me'));
    assert.equal(external.target, '_blank');
    assert.equal(external.rel, 'noopener noreferrer');

    const box = items[0].querySelector('input');
    box.checked = true;
    box.dispatchEvent(new dom.window.Event('change'));
    assert.deepEqual(store.get().ticks, { 'one-page': true });
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '1 of 6 done');
    assert.ok(items[0].classList.contains('is-done'));
    assert.deepEqual(changes, ['1 of 6 done'], 'one change event per tick');
    assert.ok(doc.querySelector('.ap-cl-done').classList.contains('ap-hidden'));

    list.model.items.forEach(item => list.tick(item.id, true));
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '6 of 6 done');
    assert.ok(!doc.querySelector('.ap-cl-done').classList.contains('ap-hidden'));
    assert.ok(doc.querySelector('.ap-progress').classList.contains('is-complete'));
    list.tick('one-page', false);
    assert.equal(store.get().ticks['one-page'], undefined);
    assert.equal(list.tick('not-an-item', true), null, 'unknown ids are ignored');

    // a second visit (same store) shows the same ticks
    const dom2 = new JSDOM('<!doctype html><main id="list"></main>');
    C.mount(dom2.window.document.getElementById('list'), SAMPLE, { store });
    assert.equal(dom2.window.document.querySelector('.ap-progress-count').textContent, '5 of 6 done');

    // a change from elsewhere (another tab, account pull) repaints
    store.set({ ticks: {} });
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '0 of 6 done');
    list.destroy();
});

test('content text is never parsed as HTML', () => {
    const dom = new JSDOM('<!doctype html><main id="list"></main>');
    const doc = dom.window.document;
    C.mount(doc.getElementById('list'), { items: [{ check: '<img src=x onerror=alert(1)>', example: '<b>bold</b>' }] }, { numbers: false, progress: false });
    assert.equal(doc.querySelectorAll('img').length, 0);
    assert.equal(doc.querySelector('.ap-cl-text').textContent, '<img src=x onerror=alert(1)>');
    assert.ok(doc.getElementById('list').classList.contains('no-numbers'));
    assert.equal(doc.querySelector('.ap-progress'), null);
});

test('"also" links render after the fix link, with the same safe-link rule', () => {
    const data = {
        title: 'CV checklist',
        items: [{ id: 'groups', check: 'Groups shown as they are', example: 'One row per sitting.',
            fix: { label: 'Results, sittings and gaps', href: '/lms?page=12' },
            also: [{ label: 'HR round and GD booklet', href: '/lms?session=5' }, { label: 'Bad', href: 'javascript:alert(1)' },
                { label: 'Guidebook ch 3, q11', href: '/lms?page=28' }] }]
    };
    const model = C.normalise(data);
    assert.deepEqual(model.items[0].also.map(l => l.label), ['HR round and GD booklet', 'Guidebook ch 3, q11']);
    const dom = new JSDOM('<!doctype html><main id="list"></main>');
    const doc = dom.window.document;
    C.mount(doc.getElementById('list'), data, { store: memoryStore({ ticks: {} }) });
    const links = [...doc.querySelectorAll('.ap-cl-extra a')].map(a => a.textContent);
    assert.deepEqual(links, ['Results, sittings and gaps', 'HR round and GD booklet', 'Guidebook ch 3, q11']);
    assert.equal(doc.querySelectorAll('a[href^="javascript"]').length, 0);
});
