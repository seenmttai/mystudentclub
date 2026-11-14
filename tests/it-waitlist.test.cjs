const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const pageDir = path.join(root, 'ca-industrial-training-program');
const html = fs.readFileSync(path.join(pageDir, 'index.html'), 'utf8');
const waitlistSrc = fs.readFileSync(path.join(pageDir, 'waitlist.js'), 'utf8');
const registrationOpen = !/js-notify-btn/.test(html);

// 05e8cdcaa shipped the page without waitlist.js; Cloudflare Pages served the home page
// in its place, so every Notify Me button was dead.
test('every local script the IT page loads exists in the repo', () => {
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1])
    .filter((src) => !/^(https?:)?\/\//.test(src) && !src.startsWith('/cdn-cgi/'));
  if (!registrationOpen) {
    assert.ok(srcs.some((src) => src.startsWith('waitlist.js')), 'page with Notify Me buttons should load waitlist.js');
  }
  for (const src of srcs) {
    const file = src.split('?')[0];
    const full = file.startsWith('/') ? path.join(root, file) : path.join(pageDir, file);
    assert.ok(fs.existsSync(full), `${src} is referenced but missing`);
  }
});

// Registration open (14 Nov 2026): every Register button goes to the PayU page, and nothing on the page
// still says registration is closed.
test('while registration is open, every Register button goes to PayU and nothing says closed', { skip: !registrationOpen }, () => {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  for (const id of ['heroPrimaryCta', 'registerButtonWorkshop', 'registerFooterBtn']) {
    const el = doc.getElementById(id);
    assert.ok(el, `#${id} should exist`);
    assert.match(el.getAttribute('href'), /^https:\/\/payu\.in\/web\//, `#${id} should go to PayU`);
  }
  assert.doesNotMatch(doc.body.textContent, /registration closed|notify me/i);
  assert.equal(doc.querySelector('script[src^="waitlist.js"]'), null, 'waitlist.js should not load with no Notify Me buttons');
});

// The waitlist buttons as the closed page has them (05e8cdcaa). When the page is open, the
// waitlist code is still tested here so it works the next time registrations close.
const waitlistMarkup = `<!doctype html><html><body>
  <button type="button" class="header-enroll-btn js-notify-btn"><span>Notify Me</span></button>
  <button type="button" class="btn-blue-primary js-notify-btn" id="heroPrimaryCta"><span>Notify Me When Open</span></button>
  <button type="button" id="notifyMeBtn" class="btn-blue-primary btn-split-cta js-notify-btn"><span>Notify Me When Open</span></button>
  <p id="notifyStatus" class="waitlist-status" role="status" aria-live="polite">Join the waitlist to hear when the next batch opens.</p>
  <button type="button" id="notifyMeFooterBtn" class="fixed-cta-btn js-notify-btn"><span>Notify Me</span></button>
  <div id="notifyStatusToast" class="notify-status" role="status" aria-live="polite"></div>
</body></html>`;
const waitlistHtml = registrationOpen ? waitlistMarkup : html;

// rpc: 'missing' = SQL not run yet (PostgREST PGRST202), 'ok' = functions installed.
function loadPage({ fetchOk = true, permission = 'granted', rpc = 'missing', onWaitlist = false } = {}) {
  const dom = new JSDOM(waitlistHtml, { url: 'https://www.mystudentclub.com/ca-industrial-training-program/', runScripts: 'outside-only' });
  const { window } = dom;
  const calls = { fetch: [], inserts: [], rpcs: [] };
  window.Notification = { requestPermission: async () => permission };
  Object.defineProperty(window.navigator, 'serviceWorker', { value: { register: async () => ({}) } });
  window.firebase = { apps: [], initializeApp() { this.apps.push({}); }, messaging: () => ({ getToken: async () => 'tok_123' }) };
  window.fetch = async (url, init) => { calls.fetch.push({ url, body: JSON.parse(init.body) }); return { ok: fetchOk, status: fetchOk ? 200 : 500 }; };
  window.__mscSession = { user: { email: 'student@example.com' } };
  window.getSupabaseClient = () => ({
    from: (table) => ({ insert: async (row) => { calls.inserts.push({ table, row }); return { error: null }; } }),
    rpc: async (name, args) => {
      calls.rpcs.push({ name, args });
      if (rpc === 'missing') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.' + name } };
      return { data: name === 'is_on_waitlist' ? onWaitlist : null, error: null };
    },
  });
  window.console.error = () => {};
  window.eval(waitlistSrc);
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
  return { window, calls };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

test('Notify Me subscribes to the IT topic and records a notifiable row', async () => {
  const { window, calls } = loadPage();
  window.document.getElementById('notifyMeBtn').click();
  await settle();
  assert.equal(calls.fetch.length, 1);
  assert.deepEqual(calls.fetch[0].body, { token: 'tok_123', topic: 'industrial-program-notify', action: 'subscribe' });
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.inserts[0].table, 'notifiable');
  assert.equal(calls.inserts[0].row.topic, 'industrial-training');
  assert.equal(calls.inserts[0].row.email, 'student@example.com');
  assert.match(calls.inserts[0].row.key, /^dk_/);
  assert.equal(window.localStorage.getItem('msc_waitlist_industrial-program-notify'), 'true');
  for (const btn of window.document.querySelectorAll('.js-notify-btn')) {
    assert.equal(btn.disabled, true);
    assert.match(btn.textContent, /Added to Waitlist/);
  }
});

test('a failed topic subscription shows an error and saves nothing', async () => {
  const { window, calls } = loadPage({ fetchOk: false });
  window.document.getElementById('heroPrimaryCta').click();
  await settle();
  assert.equal(calls.inserts.length, 0);
  assert.equal(window.localStorage.getItem('msc_waitlist_industrial-program-notify'), null);
  assert.match(window.document.getElementById('notifyStatus').textContent, /couldn't enable notifications/);
  assert.equal(window.document.getElementById('notifyMeBtn').disabled, false);
});

test('blocked notifications explain what to do and call nothing', async () => {
  const { window, calls } = loadPage({ permission: 'denied' });
  window.document.getElementById('notifyMeFooterBtn').click();
  await settle();
  assert.equal(calls.fetch.length, 0);
  assert.match(window.document.getElementById('notifyStatus').textContent, /blocked/);
});

test('with the waitlist functions installed, joining goes through join_waitlist and not a direct insert', async () => {
  const { window, calls } = loadPage({ rpc: 'ok' });
  window.document.getElementById('notifyMeBtn').click();
  await settle();
  const join = calls.rpcs.find((c) => c.name === 'join_waitlist');
  assert.ok(join, 'join_waitlist should be called');
  assert.equal(join.args.p_topic, 'industrial-training');
  assert.match(join.args.p_key, /^dk_/);
  assert.equal('email' in join.args, false, 'email must come from the login token on the server');
  assert.equal(calls.inserts.length, 0);
  assert.equal(window.localStorage.getItem('msc_waitlist_industrial-program-notify'), 'true');
});

test('before the SQL is run, joining falls back to the direct insert', async () => {
  const { window, calls } = loadPage({ rpc: 'missing' });
  window.document.getElementById('notifyMeBtn').click();
  await settle();
  assert.equal(calls.inserts.length, 1);
  assert.equal(calls.inserts[0].row.topic, 'industrial-training');
  assert.match(window.document.getElementById('notifyStatus').textContent, /on the list/);
});

test('a student already on the waitlist sees the added state on a fresh browser', async () => {
  const { window, calls } = loadPage({ rpc: 'ok', onWaitlist: true });
  await settle();
  const check = calls.rpcs.find((c) => c.name === 'is_on_waitlist');
  assert.ok(check, 'is_on_waitlist should be asked on load');
  assert.equal(check.args.p_topic, 'industrial-training');
  assert.equal(check.args.p_key, null);
  for (const btn of window.document.querySelectorAll('.js-notify-btn')) {
    assert.equal(btn.disabled, true);
    assert.match(btn.textContent, /Added to Waitlist/);
  }
  assert.equal(window.localStorage.getItem('msc_waitlist_industrial-program-notify'), 'true');
});

test('a student who is not on the waitlist keeps clickable buttons, and a missing function changes nothing', async () => {
  for (const opts of [{ rpc: 'ok', onWaitlist: false }, { rpc: 'missing' }]) {
    const { window } = loadPage(opts);
    await settle();
    for (const btn of window.document.querySelectorAll('.js-notify-btn')) {
      assert.equal(btn.disabled, false);
      assert.doesNotMatch(btn.textContent, /Added to Waitlist/);
    }
  }
});
