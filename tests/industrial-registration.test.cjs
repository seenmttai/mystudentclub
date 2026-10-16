const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ca-industrial-training-program/index.html'), 'utf8');
const checkoutUrl = 'https://payu.in/web/7E80331D7E5F8BB45DA0DE0AA870BB70';

test('industrial training registration is open across every primary CTA', () => {
  assert.match(html, /REGISTRATION LIVE[^<]*LIMITED SEATS/i);
  assert.match(html, /<a href="#enrollment" class="header-enroll-btn">[\s\S]*?Register Now/);

  for (const id of ['heroPrimaryCta', 'registerButtonWorkshop', 'notifyMeFooterBtn']) {
    const link = new RegExp(`<a href="${checkoutUrl}"[^>]*id="${id}"|<a href="${checkoutUrl}" id="${id}"`);
    assert.match(html, link, `${id} must point to the active PayU checkout`);
  }

  assert.doesNotMatch(html, /\bjs-notify-btn\b/);
  assert.doesNotMatch(html, /waitlist\.js/);
  assert.doesNotMatch(html, /REGISTRATION CLOSED/i);
});
