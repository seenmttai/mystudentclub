const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'placed-card.js'), 'utf8');
const TOKEN = 'test-access-token';
const FORM_PATH = '/placed?t=dGVzdEBleGFtcGxlLmNvbQ.abc&p=industrial-training';
const FORM = `https://notify.mystudentclub.com${FORM_PATH}`;
// The Worker's answer (msc-mail worker/src/forms.js placedStart): a relative url and the absolute href.
const WORKER_OK = { ok: true, url: FORM_PATH, href: FORM };

function setup({ session = { access_token: TOKEN }, reply, online = true } = {}) {
  const spinner = { hidden: true };
  const attrs = {};
  const btn = {
    disabled: false,
    querySelector: (sel) => (sel === '.fa-spinner' ? spinner : null),
    setAttribute: (k, v) => { attrs[k] = v; },
    addEventListener: () => {},
  };
  const status = { textContent: '' };
  const nav = { assigned: null, href: null };
  const calls = [];
  const win = {
    supabaseClient: { auth: { getSession: async () => ({ data: { session } }) } },
    navigator: { onLine: online },
    location: {
      assign: (url) => { nav.assigned = url; },
      set href(v) { nav.href = v; },
    },
  };
  const doc = { getElementById: (id) => ({ placedStartBtn: btn, placedStatus: status })[id] || null };
  const fetch = async (url, init) => {
    calls.push({ url, init });
    if (reply instanceof Error) throw reply;
    return reply;
  };
  const context = { window: undefined, globalThis: {}, URL, setTimeout, clearTimeout, AbortController, JSON };
  vm.runInNewContext(source, context);
  const card = context.globalThis.MSCPlacedCard.wire(win, doc, { fetch });
  return { card, btn, spinner, status, nav, calls, attrs };
}

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('the button posts the Supabase access token and opens the returned form', async () => {
  const s = setup({ reply: json(200, WORKER_OK) });
  await s.card.click();
  assert.equal(s.calls.length, 1);
  assert.equal(s.calls[0].url, 'https://notify.mystudentclub.com/placed/start');
  assert.equal(s.calls[0].init.method, 'POST');
  assert.equal(s.calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(s.calls[0].init.credentials, 'omit');
  assert.equal(s.nav.assigned, FORM);
  assert.equal(s.btn.disabled, true, 'stays busy while the form loads');
  assert.equal(s.spinner.hidden, false);
});

test('a relative url alone is opened on the Worker', async () => {
  const s = setup({ reply: json(200, { ok: true, url: FORM_PATH }) });
  await s.card.click();
  assert.equal(s.nav.assigned, FORM);
});

test('a URL outside the Worker\'s /placed page is never followed', async () => {
  for (const url of ['https://evil.example.com/placed?t=x', '//evil.example.com/placed?t=x', 'https://notify.mystudentclub.com/u?t=x', '/placed/start', 'javascript:alert(1)', 'https://notify.mystudentclub.com/placedx', '']) {
    const s = setup({ reply: json(200, { ok: true, url, href: url }) });
    await s.card.click();
    assert.equal(s.nav.assigned, null, url);
    assert.match(s.status.textContent, /could not open the form/, url);
    assert.equal(s.btn.disabled, false, `${url}: the button works again`);
  }
});

test('no session, or a rejected token, sends the user to log in', async () => {
  const none = setup({ session: null, reply: json(200, WORKER_OK) });
  await none.card.click();
  assert.equal(none.calls.length, 0);
  assert.equal(none.nav.href, '/login.html');

  const rejected = setup({ reply: json(401, { ok: false, error: 'sign_in', message: 'Your session has expired. Please sign in again.' }) });
  await rejected.card.click();
  assert.equal(rejected.nav.href, '/login.html');
  assert.equal(rejected.nav.assigned, null);
});

test('a refused origin shows the Worker\'s message instead of sending the user to log in', async () => {
  const s = setup({ reply: json(403, { ok: false, error: 'origin_not_allowed', message: 'Open this from mystudentclub.com.' }) });
  await s.card.click();
  assert.equal(s.nav.href, null);
  assert.equal(s.status.textContent, 'Open this from mystudentclub.com.');
  assert.equal(s.btn.disabled, false);
});

test('Worker errors and network failures show a message and re-enable the button', async () => {
  const withMessage = setup({ reply: json(503, { ok: false, message: 'Placements are paused for a few minutes.' }) });
  await withMessage.card.click();
  assert.equal(withMessage.status.textContent, 'Placements are paused for a few minutes.');
  assert.equal(withMessage.btn.disabled, false);
  assert.equal(withMessage.spinner.hidden, true);

  const down = setup({ reply: new TypeError('Failed to fetch') });
  await down.card.click();
  assert.match(down.status.textContent, /could not open the form/);

  const offline = setup({ reply: new TypeError('Failed to fetch'), online: false });
  await offline.card.click();
  assert.match(offline.status.textContent, /offline/);
});

test('profile.html has the card outside the profile form and loads the script', () => {
  const html = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');
  const card = html.indexOf('id="sec-placed"');
  assert.ok(card > 0 && card < html.indexOf('<form id="profile-form"'), 'card sits before the form, so its button never submits it');
  assert.match(html, /<button type="button" class="p2-placed-btn" id="placedStartBtn">/);
  assert.match(html, /<p class="p2-placed-status" id="placedStatus" role="status" aria-live="polite"><\/p>/);
  assert.match(html, /<script src="\/scripts\/placed-card\.js" defer><\/script>/);
  assert.match(html, /<a href="#sec-placed" class="p2-ql">Got placed\? <span class="p2-ql-share">Share<\/span><\/a>/);
});
