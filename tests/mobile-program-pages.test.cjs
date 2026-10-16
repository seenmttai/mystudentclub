// Static/state contract for the three program pages in the WebView (Task 3).
// Master reopened Industrial Training registration (payu checkout, commit adc53b657); that CTA port is NOT applied in this
// working tree (needs explicit owner approval because it wires a live payment target), so it is recorded as a todo
// instead of being silently asserted or faked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const exists = (p) => fs.existsSync(path.join(root, p));

// Synced to master's redesigned pages (129251eab): all notify/waitlist triggers share the .js-notify-btn class.
const PROGRAMS = [
  { dir: 'ca-industrial-training-program', buttons: ['heroPrimaryCta', 'notifyMeBtn', 'notifyMeFooterBtn'], topic: 'industrial-program-notify' },
  { dir: 'articleship-program', buttons: ['notifyMeBtn', 'notifyMeFooterBtn'], topic: 'articleship-program-notify' },
  { dir: 'msc-ca-fresher-program', buttons: ['heroNotifyBtn', 'certNotifyBtn', 'notifyMeBtn', 'notifyMeFooterBtn'], topic: 'fresher-program-notify' },
];

test('each program page links only local CSS/JS that exist', () => {
  for (const p of PROGRAMS) {
    const html = read(`${p.dir}/index.html`);
    const refs = [...html.matchAll(/(?:src|href)="([^"#?:]+\.(?:js|css|png|svg|jpg|jpeg|webp))(?:\?[^"]*)?"/g)].map((m) => m[1]).filter((r) => !r.startsWith('//'));
    assert.ok(refs.length > 0, p.dir);
    for (const ref of refs) {
      const rel = ref.startsWith('/') ? ref.slice(1) : `${p.dir}/${ref}`;
      assert.ok(exists(rel), `${p.dir} references missing ${ref}`);
    }
  }
});

test('current CTA: notify/waitlist button per program is present and wired', () => {
  for (const p of PROGRAMS) {
    const html = read(`${p.dir}/index.html`);
    for (const id of p.buttons) assert.match(html, new RegExp(`<button[^>]*id="${id}"[^>]*js-notify-btn|<button[^>]*js-notify-btn[^>]*id="${id}"`), `${p.dir} ${id}`);
    assert.match(html, new RegExp(`const NOTIFY_TOPIC = "${p.topic}"`), `${p.dir} topic`);
    assert.match(html, /async function initNotifyMe\(\)/);
  }
});

test('notify handlers block a second submit while pending and show an error on failure', () => {
  for (const p of PROGRAMS) {
    const html = read(`${p.dir}/index.html`);
    const handler = html.slice(html.indexOf('async function handleNotifyClick'));
    assert.match(handler, /if \((?:this|activeBtn)\.disabled\) return;/, `${p.dir}: ignore clicks while disabled`);
    assert.match(handler, /\.forEach\(\(b\) => b && \(b\.disabled = true\)\)/, `${p.dir}: lock buttons while pending`);
    assert.match(handler, /catch \(err\)[\s\S]*setNotifyStatus\(\s*"Something went wrong\. Please try again\.",\s*"error"/, `${p.dir}: failure state`);
    assert.match(handler, /\.forEach\(\(b\) => b && \(b\.disabled = false\)\)/, `${p.dir}: unlock after settle`);
  }
});

test('WebView FCM token path (getFlutterFcmToken) is intact', () => {
  for (const p of PROGRAMS) {
    const html = read(`${p.dir}/index.html`);
    assert.match(html, /function getFlutterFcmToken/, p.dir);
    assert.match(html, /getFcmToken/, p.dir);
    assert.match(html, /isFlutterApp\(\)/, p.dir);
  }
});

test('program headers keep Airy Flow safe-area padding and the horizontal logo', () => {
  for (const p of PROGRAMS) {
    assert.match(read(`${p.dir}/header.css`), /safe-area-inset-top/, p.dir);
    assert.match(read(`${p.dir}/index.html`), /<img class="header-logo" src="\/assets\/logo(?:-mark\.svg|\.png)"/, p.dir);
  }
});

test('Industrial Training: master live-registration CTA (payu) is not yet ported - pending owner approval',
  { todo: 'Port master adc53b657 live Register Now CTA once the payment target is approved' }, () => {
    const html = read('ca-industrial-training-program/index.html');
    assert.match(html, /id="heroPrimaryCta"/);
    assert.match(html, /href="https:\/\/payu\.in\/web\//);
  });
