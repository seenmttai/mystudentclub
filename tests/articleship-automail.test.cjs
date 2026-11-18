/* Ported from the content build's Package C (automail/tests/automail.test.js): run with node --test from the repo root. */
/* Unit tests for automail.js (config, device detection, share / mailto / copy link, start()).
 * Run from web/articleship-program/automail/:  node --test tests/*.test.js
 * Release check (after the MSC team sets the link):  AUTOMAIL_RELEASE=1 node --test tests/*.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const A = require('../articleship-program/automail/automail.js');

const DIR = path.join(__dirname, '..', 'articleship-program', 'automail');
const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde'; // 44 characters, the shape of a real Sheets file ID
const COPY = `https://docs.google.com/spreadsheets/d/${ID}/copy`;
const CANONICAL = 'https://www.mystudentclub.com/articleship-program/automail/';

function readShippedConfig() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(DIR, 'config.js'), 'utf8'), sandbox);
  return sandbox.window.MSC_AUTOMAIL_CONFIG;
}

// ------------------------------------------------------------------ config

test('sheetIdFrom reads the file ID from every form of a Sheets link', () => {
  const forms = [
    COPY,
    `https://docs.google.com/spreadsheets/d/${ID}/edit`,
    `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`,
    `https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`,
    `https://docs.google.com/spreadsheets/u/0/d/${ID}/edit`,
    `https://docs.google.com/spreadsheets/d/${ID}`,
    `  ${COPY}  `,
    ID
  ];
  for (const f of forms) assert.equal(A.sheetIdFrom(f), ID, f);
});

test('sheetIdFrom refuses the placeholder, blanks and anything that is not a Sheets link', () => {
  const bad = [A.PLACEHOLDER, '', '   ', null, undefined, 42, {},
    'https://docs.google.com/document/d/' + ID + '/edit', // a Doc, not a Sheet
    'http://docs.google.com/spreadsheets/d/' + ID + '/copy', // not https
    'https://docs.google.com.evil.example/spreadsheets/d/' + ID + '/copy',
    'https://drive.google.com/file/d/' + ID + '/view',
    'https://docs.google.com/spreadsheets/d/short/copy',
    'https://docs.google.com/spreadsheets/d/' + ID + '/copy"onmouseover="x',
    'javascript:alert(1)', 'PASTE THE LINK', 'ABC'];
  for (const b of bad) assert.equal(A.sheetIdFrom(b), '', String(b));
});

test('copyLinkFrom always gives Google’s /copy form', () => {
  assert.equal(A.copyLinkFrom(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`), COPY);
  assert.equal(A.copyLinkFrom(ID), COPY);
  assert.equal(A.copyLinkFrom(A.PLACEHOLDER), '');
});

test('readConfig: placeholder, missing, invalid and ready', () => {
  assert.deepEqual(A.readConfig(undefined), { ready: false, href: '', reason: 'missing' });
  assert.deepEqual(A.readConfig({}), { ready: false, href: '', reason: 'missing' });
  assert.deepEqual(A.readConfig({ copyLink: 7 }), { ready: false, href: '', reason: 'invalid' });
  assert.deepEqual(A.readConfig({ copyLink: '' }), { ready: false, href: '', reason: 'placeholder' });
  assert.deepEqual(A.readConfig({ copyLink: A.PLACEHOLDER }), { ready: false, href: '', reason: 'placeholder' });
  assert.deepEqual(A.readConfig({ copyLink: 'https://example.com/x' }), { ready: false, href: '', reason: 'invalid' });
  assert.deepEqual(A.readConfig({ copyLink: COPY }), { ready: true, href: COPY, reason: '' });
});

function fakeEl(attrs = {}) {
  const a = Object.assign({}, attrs);
  const listeners = {};
  return {
    attrs: a,
    textContent: 'Make my copy',
    setAttribute(k, v) { a[k] = String(v); },
    getAttribute(k) { return k in a ? a[k] : null; },
    removeAttribute(k) { delete a[k]; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    fire(t, ev) { (listeners[t] || []).forEach((fn) => fn(ev)); },
    listeners
  };
}
function fakeConsole() {
  const warnings = [];
  return { warnings, warn: (m) => warnings.push(m) };
}

test('applyConfig: a real link enables Make my copy, opening Google’s copy page in a new tab', () => {
  const el = fakeEl({ role: 'link', 'aria-disabled': 'true' });
  const con = fakeConsole();
  const st = A.applyConfig(el, { copyLink: `https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing` }, con);
  assert.equal(st.ready, true);
  assert.equal(el.attrs.href, COPY);
  assert.equal(el.attrs.target, '_blank');
  assert.equal(el.attrs.rel, 'noopener');
  assert.equal(el.getAttribute('aria-disabled'), null);
  assert.equal(el.getAttribute('role'), null);
  assert.equal(con.warnings.length, 0);
  assert.equal(el.textContent, 'Make my copy');
});

test('applyConfig: the placeholder keeps the button disabled, warns once in the console, changes no words', () => {
  const el = fakeEl({ href: 'https://old.example/', target: '_blank' });
  const con = fakeConsole();
  const st = A.applyConfig(el, { copyLink: A.PLACEHOLDER }, con);
  assert.equal(st.ready, false);
  assert.equal(el.getAttribute('href'), null);
  assert.equal(el.getAttribute('target'), null);
  assert.equal(el.attrs['aria-disabled'], 'true');
  assert.equal(el.attrs.role, 'link');
  assert.equal(con.warnings.length, 1);
  assert.match(con.warnings[0], /config\.js/);
  assert.match(con.warnings[0], /AUTOMAIL-SETUP\.md/);
  assert.equal(el.textContent, 'Make my copy', 'no student-facing message');
});

test('applyConfig: a wrong value warns with its own message; no element and no console are fine', () => {
  const con = fakeConsole();
  A.applyConfig(fakeEl(), { copyLink: 'https://example.com/sheet' }, con);
  assert.equal(con.warnings.length, 1);
  assert.match(con.warnings[0], /not a Google Sheets link/);
  assert.equal(A.applyConfig(null, { copyLink: COPY }).ready, true);
  assert.doesNotThrow(() => A.applyConfig(fakeEl(), {}, undefined));
});

test('the shipped config.js holds the placeholder, so the page cannot open a wrong Sheet', () => {
  const cfg = readShippedConfig();
  assert.ok(cfg && typeof cfg === 'object');
  assert.deepEqual(Object.keys(cfg), ['copyLink', 'coldList'], 'the copy link and the cold-list switch');
  if (process.env.AUTOMAIL_RELEASE !== '1') {
    assert.equal(cfg.copyLink, A.PLACEHOLDER);
  }
});

test('release check: config.js holds the master’s /copy link', { skip: process.env.AUTOMAIL_RELEASE !== '1' && 'set AUTOMAIL_RELEASE=1 after the MSC team fills config.js' }, () => {
  const st = A.readConfig(readShippedConfig());
  assert.equal(st.ready, true, 'copyLink must be the master Sheet link');
  assert.match(st.href, /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{25,80}\/copy$/);
});

// ------------------------------------------------------------------ device

test('detectMode: phone on a touch-only device, laptop otherwise, however narrow the window', () => {
  // A laptop with Chrome snapped to half the screen (683 or 600 px wide, mouse and touchpad) is a laptop.
  const m = (touch) => (q) => (q === A.QUERIES.touchOnly ? touch : true);
  assert.equal(A.detectMode(m(true)), 'phone');
  assert.equal(A.detectMode(m(false)), 'laptop');
  assert.deepEqual(Object.keys(A.QUERIES), ['touchOnly']);
  assert.equal(A.QUERIES.touchOnly, '(hover: none) and (pointer: coarse)');
  assert.equal(A.detectMode(null), 'laptop');
  assert.equal(A.detectMode(() => { throw new Error('no matchMedia'); }), 'laptop');
});

test('the CSS fallback (no JavaScript) uses the same one media query', () => {
  const css = fs.readFileSync(path.join(DIR, 'automail.css'), 'utf8');
  const m = /@media ([^{]+)\{\s*html:not\(\[data-mode\]\) \.am-phone-only/.exec(css);
  assert.ok(m, 'fallback media rule present');
  assert.equal(m[1].trim(), A.QUERIES.touchOnly);
  assert.ok(!/max-width:\s*719px/.test(css), 'no width rule decides phone mode');
});

// ------------------------------------------------------------------ the cold mailing list

test('coldListOn: only an explicit coldList: true in config.js', () => {
  assert.equal(A.coldListOn({ coldList: true }), true);
  [{ coldList: false }, { coldList: 'true' }, { coldList: 1 }, {}, null, undefined, 'x'].forEach((c) => assert.equal(A.coldListOn(c), false, String(c)));
  assert.equal(readShippedConfig().coldList, false, 'ships off: the MSC team turns it on with the list (AUTOMAIL-SETUP step 12)');
});

// ------------------------------------------------------------------ the link to send

test('pageUrl: the canonical https link first, else this page without query or hash', () => {
  assert.equal(A.pageUrl(CANONICAL, { origin: 'http://127.0.0.1:5000', pathname: '/x/' }), CANONICAL);
  assert.equal(A.pageUrl('', { origin: 'https://www.mystudentclub.com', pathname: '/articleship-program/automail/' }), CANONICAL);
  assert.equal(A.pageUrl('http://insecure.example/', { origin: 'https://a.example', pathname: '/p/' }), 'https://a.example/p/');
  assert.equal(A.pageUrl(null, { origin: 'null', href: 'file:///home/x/index.html?view=1#top' }), 'file:///home/x/index.html');
  assert.equal(A.pageUrl(undefined, undefined), '');
});

test('mailtoHref: no recipient, a subject, the link in the body, RFC 6068 encoding', () => {
  const href = A.mailtoHref(CANONICAL);
  assert.ok(href.startsWith('mailto:?subject='), href);
  assert.ok(!href.includes('+'), 'spaces are %20, never +');
  assert.ok(!/\s/.test(href), 'no raw whitespace');
  const params = new URLSearchParams(href.slice('mailto:?'.length));
  assert.equal(params.get('subject'), A.MAIL_SUBJECT);
  assert.equal(params.get('body'), A.MAIL_BODY + '\r\n\r\n' + CANONICAL);
  assert.ok(href.includes(encodeURIComponent(CANONICAL)));
});

test('the mail words are plain and short', () => {
  assert.ok(A.MAIL_SUBJECT.split(/\s+/).length <= 8);
  assert.ok(!/["'“”‘’]/.test(A.MAIL_SUBJECT + A.MAIL_BODY));
});

function spyMailto() {
  const opened = [];
  return { opened, open: (h) => opened.push(h) };
}

test('sendToSelf: Web Share when the browser has it', async () => {
  const calls = [];
  const nav = { share: (d) => { calls.push(d); return Promise.resolve(); }, canShare: () => true };
  const mail = spyMailto();
  assert.equal(await A.sendToSelf({ nav, url: CANONICAL, openMailto: mail.open }), 'shared');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, CANONICAL);
  assert.equal(calls[0].title, 'Automail');
  assert.equal(mail.opened.length, 0);
});

test('sendToSelf: no Web Share, or canShare says no → the mailto: link', async () => {
  for (const nav of [undefined, {}, { share: 'nope' }, { share: () => Promise.resolve(), canShare: () => false },
    { share: () => Promise.resolve(), canShare: () => { throw new Error('x'); } }]) {
    const mail = spyMailto();
    assert.equal(await A.sendToSelf({ nav, url: CANONICAL, openMailto: mail.open }), 'mailto');
    assert.deepEqual(mail.opened, [A.mailtoHref(CANONICAL)]);
  }
});

test('sendToSelf: a cancelled share does nothing; a failed share falls back to mailto:', async () => {
  const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' });
  let mail = spyMailto();
  assert.equal(await A.sendToSelf({ nav: { share: () => Promise.reject(abort) }, url: CANONICAL, openMailto: mail.open }), 'cancelled');
  assert.equal(mail.opened.length, 0);
  mail = spyMailto();
  assert.equal(await A.sendToSelf({ nav: { share: () => Promise.reject(new TypeError('blocked')) }, url: CANONICAL, openMailto: mail.open }), 'mailto');
  assert.equal(mail.opened.length, 1);
  mail = spyMailto();
  assert.equal(await A.sendToSelf({ nav: { share: () => { throw new Error('sync'); } }, url: CANONICAL, openMailto: mail.open }), 'mailto');
  assert.equal(mail.opened.length, 1);
});

test('copyLink: Clipboard API, then the text-copy fallback, else failed', async () => {
  const copied = [];
  const okNav = { clipboard: { writeText: (t) => { copied.push(t); return Promise.resolve(); } } };
  assert.equal(await A.copyLink({ nav: okNav, url: CANONICAL, legacyCopy: () => false }), 'copied');
  assert.deepEqual(copied, [CANONICAL]);
  const denied = { clipboard: { writeText: () => Promise.reject(new Error('denied')) } };
  assert.equal(await A.copyLink({ nav: denied, url: CANONICAL, legacyCopy: () => true }), 'copied');
  assert.equal(await A.copyLink({ nav: denied, url: CANONICAL, legacyCopy: () => false }), 'failed');
  assert.equal(await A.copyLink({ nav: {}, url: CANONICAL, legacyCopy: () => true }), 'copied');
  assert.equal(await A.copyLink({ nav: undefined, url: CANONICAL }), 'failed');
  assert.equal(await A.copyLink({ nav: {}, url: CANONICAL, legacyCopy: () => { throw new Error('x'); } }), 'failed');
});

// ------------------------------------------------------------------ start() on a small fake page

function fakePage({ width = 1440, touch = false, config, share, clipboard } = {}) {
  const els = {
    'make-copy': fakeEl({ role: 'link', 'aria-disabled': 'true' }),
    'send-link': fakeEl({ href: 'mailto:?subject=x' }),
    'copy-link': fakeEl(),
    'link-status': fakeEl()
  };
  els['link-status'].textContent = '';
  // The page's three cold-mailing-list lines (hidden in the HTML), the drawing with two descriptions, its numbered circle.
  const cold = {
    lines: [fakeEl({ hidden: '' }), fakeEl({ hidden: '' }), fakeEl({ hidden: '' })],
    labelled: [fakeEl({ 'aria-label': 'short', 'data-label-cold': 'with the cold list' })],
    numbered: [fakeEl({ 'data-cold-n': '1' })]
  };
  const htmlAttrs = {};
  const classes = new Set(['no-js']);
  const mqListeners = [];
  const state = { width, touch };
  const win = {
    MSC_AUTOMAIL_CONFIG: config,
    console: fakeConsole(),
    location: { origin: 'http://127.0.0.1:8080', pathname: '/articleship-program/automail/', href: 'http://127.0.0.1:8080/articleship-program/automail/?a=1' },
    navigator: Object.assign({}, share ? { share } : {}, clipboard ? { clipboard } : {}),
    matchMedia(q) {
      const matches = q === A.QUERIES.touchOnly ? state.touch : false;
      return { matches, addEventListener: (t, fn) => mqListeners.push(fn) };
    },
    document: {
      documentElement: {
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
        setAttribute: (k, v) => { htmlAttrs[k] = v; },
        getAttribute: (k) => htmlAttrs[k]
      },
      getElementById: (id) => els[id] || null,
      querySelectorAll: (sel) => (sel === '[data-cold-list]' ? cold.lines : sel === '[data-label-cold]' ? cold.labelled
        : sel === '[data-cold-n]' ? cold.numbered : []),
      querySelector: (sel) => (sel === 'link[rel="canonical"]' ? { getAttribute: () => CANONICAL } : null),
      createElement: () => ({ setAttribute() {}, style: {}, select() {} }),
      body: { appendChild() {}, removeChild() {} },
      execCommand: () => false
    }
  };
  return { win, els, htmlAttrs, classes, state, cold,
    resize(w) { state.width = w; mqListeners.forEach((fn) => fn()); },
    setTouch(t) { state.touch = t; mqListeners.forEach((fn) => fn()); } };
}

test('start(): laptop, placeholder config: disabled button, js class, laptop mode, mailto href ready', () => {
  const p = fakePage({ config: { copyLink: A.PLACEHOLDER } });
  const r = A.start(p.win);
  assert.equal(r.mode, 'laptop');
  assert.equal(r.url, CANONICAL);
  assert.ok(p.classes.has('js') && !p.classes.has('no-js'));
  assert.equal(p.els['make-copy'].attrs['aria-disabled'], 'true');
  assert.equal(p.win.console.warnings.length, 1);
  assert.equal(p.els['send-link'].attrs.href, A.mailtoHref(CANONICAL));
});

test('start(): a narrow laptop window stays a laptop; the mode follows the input, not the width', () => {
  const p = fakePage({ width: 600, config: { copyLink: COPY } });
  assert.equal(A.start(p.win).mode, 'laptop');
  assert.equal(p.els['make-copy'].attrs.href, COPY);
  assert.equal(p.win.console.warnings.length, 0);
  p.resize(320);
  assert.equal(p.htmlAttrs['data-mode'], 'laptop');
  p.setTouch(true);
  assert.equal(p.htmlAttrs['data-mode'], 'phone');
  p.setTouch(false);
  assert.equal(p.htmlAttrs['data-mode'], 'laptop');
});

test('start(): a phone (touch only) is a phone', () => {
  const p = fakePage({ width: 390, touch: true, config: { copyLink: COPY } });
  assert.equal(A.start(p.win).mode, 'phone');
});

test('start(): the cold-mailing-list lines stay hidden unless config.js has coldList: true', () => {
  let p = fakePage({ config: { copyLink: COPY } });
  A.start(p.win);
  p.cold.lines.forEach((el) => assert.equal(el.attrs.hidden, ''));
  assert.equal(p.cold.labelled[0].attrs['aria-label'], 'short');
  assert.equal(p.cold.numbered[0].attrs['data-n'], undefined);
  p = fakePage({ config: { copyLink: COPY, coldList: true } });
  A.start(p.win);
  p.cold.lines.forEach((el) => assert.equal(el.attrs.hidden, undefined));
  assert.equal(p.cold.labelled[0].attrs['aria-label'], 'with the cold list');
  assert.equal(p.cold.numbered[0].attrs['data-n'], '1');
});

test('start(): touch-only tablet counts as a phone', () => {
  const p = fakePage({ width: 1024, touch: true, config: { copyLink: COPY } });
  assert.equal(A.start(p.win).mode, 'phone');
});

test('start(): Send this link to myself uses Web Share and stops the mailto:', async () => {
  const shared = [];
  const p = fakePage({ width: 390, touch: true, config: {}, share: (d) => { shared.push(d); return Promise.resolve(); } });
  A.start(p.win);
  let prevented = false;
  p.els['send-link'].fire('click', { preventDefault: () => { prevented = true; } });
  await new Promise((r) => setImmediate(r));
  assert.equal(prevented, true);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].url, CANONICAL);
});

test('start(): without Web Share the click is left to the mailto: href', () => {
  const p = fakePage({ width: 390, touch: true, config: {} });
  A.start(p.win);
  let prevented = false;
  p.els['send-link'].fire('click', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  assert.ok(p.els['send-link'].attrs.href.startsWith('mailto:?subject='));
});

test('start(): Copy link writes the link and says so; a failure shows the link to copy by hand', async () => {
  const copied = [];
  let p = fakePage({ width: 390, touch: true, config: {}, clipboard: { writeText: (t) => { copied.push(t); return Promise.resolve(); } } });
  A.start(p.win);
  p.els['copy-link'].fire('click', {});
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(copied, [CANONICAL]);
  assert.equal(p.els['link-status'].textContent, 'Link copied.');

  p = fakePage({ width: 390, touch: true, config: {}, clipboard: { writeText: () => Promise.reject(new Error('no')) } });
  A.start(p.win);
  p.els['copy-link'].fire('click', {});
  await new Promise((r) => setImmediate(r));
  assert.equal(p.els['link-status'].textContent, 'Copy this link: ' + CANONICAL);
});
