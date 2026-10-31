// /offer-groups on the mobile host: Airy Flow chrome, the shared page script's rules, and the profile entry point.
// The DOM flow (form, one-time warning, request, result screens) is tested on master with the same scripts/offer-groups.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const core = require(path.join(root, 'scripts/offer-groups.js'));
const companies = JSON.parse(read('assets/data/offer-companies.json'));

test('page uses the Airy Flow header and drawer, loads the shared scripts, and is not indexed', () => {
  const html = read('offer-groups.html');
  assert.match(html, /<body class="airy-page og-page">/);
  assert.match(html, /<header class="app-header" id="appHeader">/);
  assert.match(html, /<div class="greeting-sub">MSC<\/div>\s*<div class="greeting-name">Offer Groups<\/div>/);
  for (const src of ['/scripts/airy-header.css', '/scripts/program-chrome.js', '/scripts/vendor/supabase.js', '/scripts/supabase-init.js', '/scripts/vendor/pdf.min.js', '/scripts/offer-groups.js', '/scripts/offer-groups.css']) {
    assert.ok(html.includes(src), src);
    assert.ok(fs.existsSync(path.join(root, src.slice(1))), `${src} exists`);
  }
  assert.match(html, /<meta name="robots" content="noindex">/);
  assert.match(html, /<div id="offer-app"/);
  assert.doesNotMatch(html, /aria-current="page"/, 'no drawer entry is the current page');
});

test('Padam’s message; CA Freshers skip the prefix line', () => {
  const it = core.successMessage('ASHA R VERMA', 'industrial-training').join('\n');
  assert.match(it, /^Congratulations Asha! All your efforts paid off well\. Have the best of time ahead!!/);
  assert.match(it, /Hope we were able to add a bit of value in your journey\./);
  assert.match(it, /beautiful two-letter prefix as a CA Fresher/);
  assert.match(it, /Looking forward to like, comment and repost your joining post\./);
  assert.doesNotMatch(core.successMessage('Ravi', 'ca-fresher').join(' '), /prefix/);
});

test('only WhatsApp invite links are shown', () => {
  const ok = core.safeGroups([
    { url: 'https://chat.whatsapp.com/AbCdEf1234567890' }, { url: 'https://chat.whatsapp.com/AbCdEf1234567890?mode=gi_t' },
    { url: 'https://whatsapp.com/channel/0029Vb8XM5GDzgT6YyWk4x0F' }, { url: 'javascript:alert(1)' }, { url: 'https://evil.example/chat.whatsapp.com/x' }, null,
  ]);
  assert.equal(ok.length, 3);
});

test('company and city spellings fold to the MSC names', () => {
  assert.equal(core.snapCompany('S.R. Batliboi & Co. LLP', companies), 'EY');
  assert.equal(core.snapCompany('Deutsche India Pvt. Ltd.', companies), 'Deutsche Bank');
  assert.equal(core.snapCity('Gurugram', companies), 'Gurgaon');
});

test('profile "Got placed?" card opens /offer-groups', () => {
  const html = read('profile.html');
  const card = html.slice(html.indexOf('id="sec-placed"'), html.indexOf('<form id="profile-form"'));
  assert.match(card, /href="\/offer-groups"/);
  assert.doesNotMatch(html, /placed-card\.js/);
});
