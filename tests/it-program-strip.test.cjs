const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

// 6 Nov 2026: a CA Industrial Training Program strip under the header, above the portal tabs.
const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'portal3.js'), 'utf8');
const code = source.slice(source.indexOf('const IT_STRIP_HIDE_KEY'), source.indexOf('function renderProfileCompletionBanner() {'));

function render({ table = 'Industrial Training Job Portal', enrolled = false, hiddenUntil = null, storageThrows = false } = {}) {
  const dom = new JSDOM('<body><main class="main-content-area"><nav class="portal-nav-bar"></nav></main></body>', { url: 'https://www.mystudentclub.com/' });
  const { window } = dom;
  const store = new Map(hiddenUntil ? [['mscItStripHiddenUntil', String(hiddenUntil)]] : []);
  const localStorage = storageThrows
    ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }
    : { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const events = [];
  const ctx = vm.createContext({ document: window.document, localStorage, Date, Number, String, setTimeout: (fn) => fn(),
    currentTable: table, isEnrolledSync: () => enrolled, gtag: (...a) => events.push(a) });
  vm.runInContext(code + '\nrenderItProgramStrip();', ctx);
  return { document: window.document, store, events };
}

test('shown above the portal tabs on Industrial Training and Articleship, linking to the program page', () => {
  for (const table of ['Industrial Training Job Portal', 'Articleship Jobs']) {
    const { document } = render({ table });
    const strip = document.getElementById('itProgramStrip');
    assert.ok(strip, table);
    assert.equal(document.querySelector('.main-content-area').firstElementChild, strip, 'first thing under the header');
    assert.match(strip.querySelector('a.itp-link').getAttribute('href'), /^\/ca-industrial-training-program\/\?utm_source=job_portal/);
    assert.match(strip.textContent, /Industrial Training Program/);
  }
});

test('not shown on Fresher / Semi Qualified portals or to students enrolled in the IT program', () => {
  assert.equal(render({ table: 'Fresher Jobs' }).document.getElementById('itProgramStrip'), null);
  assert.equal(render({ table: 'Semi Qualified Jobs' }).document.getElementById('itProgramStrip'), null);
  assert.equal(render({ enrolled: true }).document.getElementById('itProgramStrip'), null);
});

test('× hides it for 7 days; blocked storage still shows it', () => {
  const { document, store, events } = render();
  document.querySelector('.itp-close').click();
  assert.equal(document.getElementById('itProgramStrip'), null);
  const until = Number(store.get('mscItStripHiddenUntil'));
  assert.ok(until > Date.now() + 6.9 * 864e5 && until < Date.now() + 7.1 * 864e5);
  assert.deepEqual(events.map(e => e[2].action), ['hide']);
  assert.equal(render({ hiddenUntil: Date.now() + 1000 }).document.getElementById('itProgramStrip'), null);
  assert.ok(render({ hiddenUntil: Date.now() - 1000 }).document.getElementById('itProgramStrip'));
  assert.ok(render({ storageThrows: true }).document.getElementById('itProgramStrip'));
});

test('rendered once enrolment is known, right after sign-in check', () => {
  assert.match(source, /const session = await checkAuth\(\);\n\s*renderItProgramStrip\(\);/);
});
