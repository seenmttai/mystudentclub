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
