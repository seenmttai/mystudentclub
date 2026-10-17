// Resource hub "Back": works when the page is the first WebView entry (history.back() is a silent no-op there).
// Order under test: real previous entry -> history.back(); Flutter shell -> callHandler('closeWebView'); otherwise "/".
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const CHROME = read('scripts/resource-page-chrome.js');
const PAGES = [
  'ca-fresher-training-resources.html',
  'ca-industrial-training-resources.html',
  'articleship-resources.html',
  'semi-qualified-ca-resources.html',
];

/** Runs resource-page-chrome.js against a minimal fake browser and returns what it did. */
function load({ length = 1, canGoBack, bridge, referrer = '', origin = 'https://www.mystudentclub.com' }) {
  const log = { back: 0, assign: [], handler: [], timers: [], docListeners: {}, winListeners: {} };
  const on = (store) => (type, fn) => { (store[type] = store[type] || []).push(fn); };
  const off = (store) => (type, fn) => { store[type] = (store[type] || []).filter((f) => f !== fn); };
  const window = {
    history: { length, back() { log.back += 1; } },
    location: { origin, assign: (url) => log.assign.push(url), set href(url) { log.assign.push(url); } },
    addEventListener: on(log.winListeners),
    removeEventListener: off(log.winListeners),
  };
  if (canGoBack !== undefined) window.navigation = { canGoBack };
  if (bridge) {
    window.flutter_inappwebview = {
      callHandler: (...args) => { log.handler.push(args); return bridge.result ? bridge.result() : Promise.resolve(null); },
    };
  }
  const document = {
    readyState: 'complete', referrer,
    documentElement: { setAttribute() {} },
    getElementById: () => null,
    querySelectorAll: () => [],
    addEventListener: on(log.docListeners),
  };
  const sandbox = { window, document, localStorage: { getItem: () => null }, setTimeout: (fn, ms) => { log.timers.push({ fn, ms }); return log.timers.length; }, URL, Object, JSON };
  vm.runInNewContext(CHROME, sandbox);
  return { window, document, log, nav: window.MSCNav };
}

test('first entry in the WebView: Back calls the native closeWebView handler and does not use history', () => {
  const { nav, log } = load({ length: 1, bridge: {} });
  assert.equal(nav.hasBackTarget(), false);
  assert.equal(nav.goBack(), 'flutter');
  assert.deepEqual(log.handler, [['closeWebView']]);
  assert.equal(log.back, 0);
  assert.deepEqual(log.assign, []);
});

test('real previous entry: Back uses history.back() and never closes the WebView', () => {
  const { nav, log } = load({ length: 3, canGoBack: true, bridge: {} });
  assert.equal(nav.goBack(), 'history');
  assert.equal(log.back, 1);
  assert.deepEqual(log.handler, []);
  assert.deepEqual(log.timers, [], 'the Navigation API is trusted, so no fallback timer is needed');
});

test('history.length > 1 but only a forward entry (Navigation API says nothing before us): bridge, not a no-op history.back()', () => {
  const { nav, log } = load({ length: 3, canGoBack: false, bridge: {} });
  assert.equal(nav.goBack(), 'flutter');
  assert.equal(log.back, 0);
  assert.deepEqual(log.handler, [['closeWebView']]);
});

test('arrived from another site: history.back() is still the right target', () => {
  const { nav, log } = load({ length: 2, canGoBack: false, referrer: 'https://www.google.com/search?q=ca', bridge: {} });
  assert.equal(nav.goBack(), 'history');
  assert.equal(log.back, 1);
  assert.deepEqual(log.handler, []);
});

test('no bridge and no history: last fallback is the home page', () => {
  const { nav, log } = load({ length: 1 });
  assert.equal(nav.goBack(), 'home');
  assert.deepEqual(log.assign, ['/']);
  assert.equal(log.back, 0);
});

test('a bridge that rejects (old app build) falls back to the home page', async () => {
  const { nav, log } = load({ length: 1, bridge: { result: () => Promise.reject(new Error('no handler')) } });
  assert.equal(nav.goBack(), 'flutter');
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(log.assign, ['/']);
});

test('engines without the Navigation API: history.back() first, then the shell if the page is still here after the timeout', () => {
  const stuck = load({ length: 2, bridge: {} });
  assert.equal(stuck.nav.goBack(), 'history');
  assert.equal(stuck.log.back, 1);
  assert.equal(stuck.log.timers.length, 1);
  assert.deepEqual(stuck.log.handler, []);
  stuck.log.timers[0].fn(); // page did not unload: back was a no-op
  assert.deepEqual(stuck.log.handler, [['closeWebView']]);

  const left = load({ length: 2, bridge: {} });
  left.nav.goBack();
  left.log.winListeners.pagehide.forEach((fn) => fn()); // page unloaded: back worked
  left.log.timers[0].fn();
  assert.deepEqual(left.log.handler, [], 'no double navigation when history.back() succeeded');
});

test('[data-rh-back] elements are wired by one delegated click listener (no javascript: URLs needed)', () => {
  const { document, log } = load({ length: 1, bridge: {} });
  const click = (target) => { const e = { target, prevented: false, preventDefault() { this.prevented = true; } }; document_click(e); return e; };
  const document_click = (e) => log.docListeners.click.forEach((fn) => fn(e));
  const inside = { closest: (sel) => (sel === '[data-rh-back]' ? {} : null) };
  const outside = { closest: () => null };
  assert.equal(click(outside).prevented, false);
  assert.deepEqual(log.handler, []);
  assert.equal(click(inside).prevented, true);
  assert.deepEqual(log.handler, [['closeWebView']]);
});

test('every resource hub Back link is a data-rh-back anchor with a real href, never javascript:history.back()', () => {
  for (const file of PAGES) {
    const html = read(file);
    assert.doesNotMatch(html, /javascript:\s*history/i, `${file}: no javascript: back link`);
    assert.match(html, /<a href="\/" class="rh-back" data-rh-back>/, `${file}: Back link wiring`);
    assert.match(html, /<script src="\/scripts\/resource-page-chrome\.js[^"]*"><\/script>/, `${file}: loads the shared chrome (Back handler)`);
  }
});

test('the protected viewer download card uses the same shared Back handler', () => {
  const html = read('ca-resource/resource/index.html');
  assert.doesNotMatch(html, /javascript:\s*history/i);
  assert.match(html, /class="btn btn-secondary" data-rh-back/);
  assert.match(html, /\/scripts\/resource-page-chrome\.js/);
});

test('hero is a compact card: eyebrow, title, subtitle, chip row and a stats row filled by the library', () => {
  const library = read('scripts/resource-library.js');
  for (const file of PAGES) {
    const html = read(file);
    assert.match(html, /<div class="rh-card">[\s\S]*<p class="resource-eyebrow">[\s\S]*<h1 id="resource-page-title">[\s\S]*<p class="rh-desc">[\s\S]*<div class="rh-pills">[\s\S]*<div class="rh-stats" id="rh-stats" hidden>[\s\S]*<\/div>\s*<\/section>/, `${file}: hero structure`);
    assert.match(html, /data-stat="free"/);
    assert.match(html, /data-stat="premium"/);
  }
  assert.match(library, /getElementById\('rh-stats'\)/);
  assert.match(library, /resource-view-all/, 'View all is a real toggle button');
  assert.doesNotMatch(library, /hub-view-link/, 'the old self-linking View all anchor is gone');
});
