const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const pageDir = path.join(root, 'msc-ca-fresher-program');
const html = fs.readFileSync(path.join(pageDir, 'index.html'), 'utf8');
const registrationOpen = !/js-notify-btn/.test(html);

// Registrations opened 24 Nov 2026 (Padam): ₹2799, "Exclusive Pre Result Batch for Nov'26 CAs" on top.
// Register buttons open the details form (scripts/fresher-register.js), which gets a pay link from the
// checkpayment Worker (/fresher/start) and goes there; the Worker posts the signed PayU form.
test('CA Fresher page: every Register button opens the registration form and nothing says closed', { skip: !registrationOpen }, () => {
  const doc = new JSDOM(html).window.document;
  for (const id of ['heroPrimaryCta', 'certRegisterBtn', 'registerButtonWorkshop', 'registerFooterBtn']) {
    const el = doc.getElementById(id);
    assert.ok(el, `#${id} should exist`);
    assert.equal(el.tagName, 'A', `#${id} should be a link`);
    assert.equal(el.getAttribute('href'), '#register', `#${id} opens the form`);
    assert.ok(el.classList.contains('js-register-btn'), `#${id} should be a register button`);
  }
  assert.match(html, /<script src="\/scripts\/fresher-register\.js\?v=[\w.]+" defer><\/script>/);
  const text = doc.body.textContent;
  assert.doesNotMatch(text, /registration closed|notify me/i);
  assert.doesNotMatch(html, /notify-waitlist\.js|MSCWaitlist/, 'no waitlist code while registrations are open');
  assert.doesNotMatch(html, /payu\.in\/web\//, 'no fixed-price PayU button links');
  assert.match(doc.querySelector('.fixed-cta .discounted').textContent, /₹2799/);
  assert.doesNotMatch(text, /₹2999/);
});

function loadForm({ fetchImpl, session } = {}) {
  const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ''), { url: 'https://www.mystudentclub.com/msc-ca-fresher-program/' });
  const win = dom.window;
  const calls = [];
  let assigned = null;
  win.fetch = async (url, opts) => { calls.push({ url, body: JSON.parse(opts.body) }); return fetchImpl(); };
  win.getSupabaseClient = () => ({ auth: { getSession: async () => ({ data: { session } }) } });
  const loc = { origin: 'https://www.mystudentclub.com' };
  Object.defineProperty(loc, 'href', { set: (v) => { assigned = v; }, get: () => 'https://www.mystudentclub.com/msc-ca-fresher-program/' });
  const fakeWin = new Proxy(win, { get: (t, k) => (k === 'location' ? loc : (typeof t[k] === 'function' && k !== 'fetch' && k !== 'getSupabaseClient' ? t[k].bind(t) : t[k])) });
  require('../scripts/fresher-register.js').init(win.document, fakeWin);
  return { win, doc: win.document, calls, assigned: () => assigned };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

test('form: a Register click opens it, good details go to the Worker and the browser goes to the pay link', async () => {
  const pay = 'https://checkpayment.bhansalimanan55.workers.dev/fresher/pay/TOKEN';
  const t = loadForm({ fetchImpl: async () => ({ ok: true, json: async () => ({ pay }) }), session: { user: { email: 'riya@example.com', user_metadata: { full_name: 'Riya Shah' } } } });
  const overlay = t.doc.getElementById('fresherRegister');
  assert.ok(!overlay.classList.contains('open'));
  t.doc.getElementById('registerFooterBtn').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.ok(overlay.classList.contains('open'));
  await tick();
  assert.equal(t.doc.getElementById('frsEmail').value, 'riya@example.com', 'signed-in email is filled in');
  assert.equal(t.doc.getElementById('frsName').value, 'Riya Shah');
  t.doc.getElementById('frsPhone').value = '+91 96324 43151';
  t.doc.getElementById('frsForm').dispatchEvent(new t.win.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(t.calls.length, 1);
  assert.equal(t.calls[0].url, 'https://checkpayment.bhansalimanan55.workers.dev/fresher/start');
  assert.deepEqual(t.calls[0].body, { name: 'Riya Shah', email: 'riya@example.com', phone: '9632443151', site: 'https://www.mystudentclub.com' });
  assert.equal(t.assigned(), pay);
});

test('form: bad details never reach the Worker; a Worker field error is shown on that field', async () => {
  const t = loadForm({ fetchImpl: async () => ({ ok: false, json: async () => ({ error: 'invalid', field: 'email' }) }) });
  t.doc.getElementById('heroPrimaryCta').dispatchEvent(new t.win.MouseEvent('click', { bubbles: true, cancelable: true }));
  t.doc.getElementById('frsName').value = 'Riya Shah';
  t.doc.getElementById('frsEmail').value = 'riya@example.com';
  t.doc.getElementById('frsPhone').value = '12345';
  t.doc.getElementById('frsForm').dispatchEvent(new t.win.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(t.calls.length, 0);
  assert.equal(t.doc.getElementById('frsPhone').getAttribute('aria-invalid'), 'true');
  t.doc.getElementById('frsPhone').value = '9632443151';
  t.doc.getElementById('frsForm').dispatchEvent(new t.win.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(t.calls.length, 1);
  assert.equal(t.doc.getElementById('frsEmail').getAttribute('aria-invalid'), 'true');
  assert.equal(t.assigned(), null);
});

test('form: an enrolled student\'s "Open your course" link is left alone', () => {
  const t = loadForm({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) });
  const btn = t.doc.getElementById('heroPrimaryCta');
  btn.classList.add('msc-open-course');
  const ev = new t.win.MouseEvent('click', { bubbles: true, cancelable: true });
  btn.dispatchEvent(ev);
  assert.ok(!t.doc.getElementById('fresherRegister').classList.contains('open'));
});

test('CA Fresher page: the pre-result batch line is the first thing in the hero', () => {
  const doc = new JSDOM(html).window.document;
  const first = doc.querySelector('.hero-left').firstElementChild;
  assert.match(first.textContent.replace(/\s+/g, ' '), /Exclusive Pre Result Batch for Nov’26 CAs/);
});

test('program-enrolled.js turns the Fresher Register links into "Open your course"', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'program-enrolled.js'), 'utf8');
  assert.match(src, /'\.js-register-btn'/);
});

test('every local script the Fresher page loads exists in the repo', () => {
  const srcs = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1])
    .filter((src) => !/^(https?:)?\/\//.test(src) && !src.startsWith('/cdn-cgi/'));
  for (const src of srcs) {
    const file = src.split('?')[0];
    const full = file.startsWith('/') ? path.join(root, file) : path.join(pageDir, file);
    assert.ok(fs.existsSync(full), `${src} is referenced but missing`);
  }
});

test('success page: a CA Fresher payment shows Fresher next steps, IT stays as it was', async () => {
  const src = fs.readFileSync(path.join(root, 'payment-success.html'), 'utf8');
  const render = async (hash) => {
    const dom = new JSDOM(src.replace(/<script[^>]*\ssrc="[^"]*"[^>]*><\/script>/g, ''), {
      url: `https://www.mystudentclub.com/payment-success.html#${hash}`, runScripts: 'dangerously',
    });
    await new Promise((r) => dom.window.addEventListener('load', r));
    return dom.window.document;
  };
  const fresher = await render('status=created&enrollment=new&email=a%40b.com&course=msc-ca-freshers-program');
  assert.match(fresher.getElementById('receipt-course-title').textContent, /MSC CA Fresher Program/);
  assert.match(fresher.getElementById('step-lms-desc').textContent, /recorded[\s\S]*29th Nov/);
  assert.doesNotMatch(fresher.getElementById('step-lms-desc').textContent, /22nd Nov/);
  for (const a of fresher.querySelectorAll('a[href*="chat.whatsapp.com"]')) assert.equal(a.style.display, 'none', 'no IT group link for Freshers');
  const it = await render('status=created&enrollment=new&email=a%40b.com&course=industrial-training-mastery');
  assert.match(it.getElementById('receipt-course-title').textContent, /Industrial Training/);
  assert.match(it.getElementById('step-lms-desc').textContent, /22nd Nov/);
});
