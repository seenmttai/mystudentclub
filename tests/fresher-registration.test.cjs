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
// Padam, same day: Register opens the PayU payment page directly (old Fresher button 111604313, repriced to
// ₹2799, success URL = checkpayment), like the IT Program.
test('CA Fresher page: every Register button goes to the ₹2799 PayU page and nothing says closed', { skip: !registrationOpen }, () => {
  const doc = new JSDOM(html).window.document;
  for (const id of ['heroPrimaryCta', 'certRegisterBtn', 'registerButtonWorkshop', 'registerFooterBtn']) {
    const el = doc.getElementById(id);
    assert.ok(el, `#${id} should exist`);
    assert.equal(el.tagName, 'A', `#${id} should be a link`);
    assert.equal(el.getAttribute('href'), 'https://payu.in/web/AC5E020347C353450621DDCC2C2EEA40', `#${id} goes to PayU`);
    assert.ok(el.classList.contains('js-register-btn'), `#${id} turns into "Open your course" for enrolled students`);
  }
  const text = doc.body.textContent;
  assert.doesNotMatch(text, /registration closed|notify me/i);
  assert.doesNotMatch(html, /notify-waitlist\.js|MSCWaitlist|fresher-register\.js/);
  assert.match(doc.querySelector('.fixed-cta .discounted').textContent, /₹2799/);
  assert.doesNotMatch(text, /₹2999/);
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
