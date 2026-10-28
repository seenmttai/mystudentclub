const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const pageDir = path.join(root, 'ca-industrial-training-program');
const html = fs.readFileSync(path.join(pageDir, 'index.html'), 'utf8');
const waitlistSrc = fs.readFileSync(path.join(pageDir, 'waitlist.js'), 'utf8');

// 05e8cdcaa shipped the page without waitlist.js; Cloudflare Pages served the home page
// in its place, so every Notify Me button was dead.
test('every local script the IT page loads exists in the repo', () => {
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1])
    .filter((src) => !/^(https?:)?\/\//.test(src) && !src.startsWith('/cdn-cgi/'));
  assert.ok(srcs.some((src) => src.startsWith('waitlist.js')), 'page should load waitlist.js');
  for (const src of srcs) {
    const file = src.split('?')[0];
    const full = file.startsWith('/') ? path.join(root, file) : path.join(pageDir, file);
    assert.ok(fs.existsSync(full), `${src} is referenced but missing`);
  }
});

function loadPage({ fetchOk = true, permission = 'granted' } = {}) {
  const dom = new JSDOM(html, { url: 'https://www.mystudentclub.com/ca-industrial-training-program/', runScripts: 'outside-only' });
  const { window } = dom;
  const calls = { fetch: [], inserts: [] };
  window.Notification = { requestPermission: async () => permission };
  Object.defineProperty(window.navigator, 'serviceWorker', { value: { register: async () => ({}) } });
  window.firebase = { apps: [], initializeApp() { this.apps.push({}); }, messaging: () => ({ getToken: async () => 'tok_123' }) };
  window.fetch = async (url, init) => { calls.fetch.push({ url, body: JSON.parse(init.body) }); return { ok: fetchOk, status: fetchOk ? 200 : 500 }; };
  window.__mscSession = { user: { email: 'student@example.com' } };
  window.getSupabaseClient = () => ({ from: (table) => ({ insert: async (row) => { calls.inserts.push({ table, row }); return { error: null }; } }) });
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
