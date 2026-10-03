const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'links', 'tabs.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'links', 'index.html'), 'utf8');

// A page with the four static tabs; `extra` adds admin-created tabs.
function fakePage({ search = '', hash = '', extra = [] } = {}) {
  const ids = new Set(['industrial', 'ca', 'articleship', 'semi-qualified', ...extra]);
  const el = (id) => ({ id, scrollIntoView() { calls.scrolled += 1; } });
  const nodes = new Map();
  for (const id of ids) {
    nodes.set(id, el(id));
    nodes.set(`tab-${id}`, el(`tab-${id}`));
  }
  const listeners = { doc: {}, win: {} };
  const calls = { switched: [], scrolled: 0 };
  const doc = {
    getElementById: (id) => nodes.get(id) || null,
    querySelector: (sel) => (sel === '.tabs-wrapper' ? el('tabs-wrapper') : null),
    addEventListener: (type, fn) => { (listeners.doc[type] ||= []).push(fn); },
    addTab(id) { nodes.set(id, el(id)); nodes.set(`tab-${id}`, el(`tab-${id}`)); },
  };
  const win = {
    location: { search, hash },
    document: doc,
    switchTab: (btn, id) => calls.switched.push([btn.id, id]),
    requestAnimationFrame: (fn) => fn(),
    addEventListener: (type, fn) => { (listeners.win[type] ||= []).push(fn); },
  };
  const fire = (target, type) => (listeners[target][type] || []).forEach((fn) => fn());
  return { win, doc, calls, fire };
}

function load(pageState) {
  const context = { window: pageState.win, URLSearchParams, decodeURIComponent };
  vm.runInNewContext(source, context);
  return pageState.win.MSCLinksTabs;
}

test('?tab= names open the matching tab', () => {
  const cases = { articleship: 'articleship', fresher: 'ca', semi: 'semi-qualified', industrial: 'industrial', 'Semi-Qualified': 'semi-qualified', it: 'industrial', 'ca-fresher': 'ca' };
  for (const [name, id] of Object.entries(cases)) {
    const p = fakePage({ search: `?tab=${encodeURIComponent(name)}` });
    load(p);
    assert.deepEqual(p.calls.switched, [[`tab-${id}`, id]], name);
    assert.equal(p.calls.scrolled, 0, `${name}: a query link does not scroll`);
  }
});

test('a #hash opens the tab and brings the tab bar into view; ?tab= wins over #hash', () => {
  const p = fakePage({ hash: '#fresher' });
  load(p);
  assert.deepEqual(p.calls.switched, [['tab-ca', 'ca']]);
  assert.equal(p.calls.scrolled, 1);

  const both = fakePage({ search: '?tab=semi', hash: '#articleship' });
  load(both);
  assert.deepEqual(both.calls.switched, [['tab-semi-qualified', 'semi-qualified']]);
});

test('unknown names and no request leave the default tab alone', () => {
  for (const state of [{}, { search: '?tab=nope' }, { hash: '#link-industrial-program' }, { search: '?tab=' }]) {
    const p = fakePage(state);
    load(p);
    assert.deepEqual(p.calls.switched, [], JSON.stringify(state));
  }
});

test('a tab the admin adds in the links table opens once the live links are rendered', () => {
  const p = fakePage({ search: '?tab=ipcc' });
  load(p);
  assert.deepEqual(p.calls.switched, []);
  p.doc.addTab('ipcc');
  p.fire('doc', 'msc:links-hydrated');
  assert.deepEqual(p.calls.switched, [['tab-ipcc', 'ipcc']]);
});

test('changing the hash later switches tabs', () => {
  const p = fakePage();
  load(p);
  p.win.location.hash = '#semi';
  p.fire('win', 'hashchange');
  assert.deepEqual(p.calls.switched, [['tab-semi-qualified', 'semi-qualified']]);
});

test('the links page loads tabs.js after switchTab and signals when live links are rendered', () => {
  assert.ok(page.indexOf('function switchTab(') < page.indexOf('<script src="/links/tabs.js"></script>'));
  assert.match(page, /\} finally \{\s*\/\/[^\n]*\n\s*document\.dispatchEvent\(new CustomEvent\('msc:links-hydrated'\)\);/);
});

test('the Articleship "Free Resources" card no longer points at the missing /ca-articleship-resources page', () => {
  assert.ok(!page.includes('/ca-articleship-resources'));
  assert.match(page, /href="https:\/\/www\.mystudentclub\.com\/ca-articleship-opportunities"[^>]*id="link-articleship-resources"/);
});
