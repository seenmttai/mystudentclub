// Resource hub routes (Task 4/6): stage markers, shared library wiring, free file presence, gating and WebView contracts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const exists = (p) => fs.existsSync(path.join(root, p));
const library = require(path.join(root, 'scripts', 'resource-library.js'));

const PAGES = [
  { file: 'ca-fresher-training-resources.html', stage: 'ca-fresher', h1: 'CA Fresher Training Resources', premium: 'ca-fresher' },
  { file: 'ca-industrial-training-resources.html', stage: 'industrial-training', h1: 'CA Industrial Training Resources', premium: 'industrial-training' },
  { file: 'articleship-resources.html', stage: 'articleship', h1: 'Articleship Resources', premium: 'articleship' },
  { file: 'semi-qualified-ca-resources.html', stage: 'semi-qualified', h1: 'Semi-Qualified CA Resources', premium: 'industrial-training' },
];
// Domain-wise Hiring Companies was removed from the mobile site on 2026-10-17; it must not come back as a route or a menu link.
const REMOVED_HUBS = ['/domain-wise-hiring-companies.html'];
const NEW_HUBS = ['/articleship-resources.html', '/semi-qualified-ca-resources.html'];

test('each hub has its own stage, title and hero', () => {
  const seen = { stage: new Set(), title: new Set(), h1: new Set() };
  for (const p of PAGES) {
    assert.ok(exists(p.file), p.file);
    const html = read(p.file);
    assert.equal((html.match(/<body data-resource-stage="([^"]+)">/) || [])[1], p.stage, `${p.file} stage`);
    assert.match(html, new RegExp(`<h1 id="resource-page-title">${p.h1}</h1>`), `${p.file} hero`);
    assert.match(html, /id="resources-container"/);
    seen.stage.add(p.stage);
    seen.title.add(html.match(/<title>([^<]*)/)[1]);
    seen.h1.add(p.h1);
  }
  for (const set of Object.values(seen)) assert.equal(set.size, PAGES.length);
});

test('each hub loads the shared library, its CSS and the session/intake scripts that exist locally', () => {
  for (const p of PAGES) {
    const html = read(p.file);
    for (const needle of ['/scripts/resource-library.js', '/scripts/resource-library.css', '/scripts/supabase-init.js', '/scripts/program-access.js', '/scripts/career-profile.js', '/scripts/vendor/supabase.js', '/scripts/resource-page-chrome.js', '/scripts/portal-style.css']) {
      assert.ok(html.includes(needle), `${p.file} loads ${needle}`);
      assert.ok(exists(needle.slice(1)), `${needle} exists`);
    }
    // Airy Flow chrome
    assert.match(html, /<header class="app-header" id="appHeader">/);
    assert.match(html, /class="expanded-menu" id="expandedMenu"/);
    assert.match(html, /id="themeToggleBtn"/);
    assert.match(html, /<dialog class="resource-enroll-dialog" id="resource-enroll-dialog"/);
    assert.doesNotMatch(html, /site-navigation\.js|floating-header|class="footer-nav"/, `${p.file}: no duplicate desktop navigation`);
  }
});

test('stage pages use the shared form collector', () => {
  for (const p of PAGES) {
    assert.match(read(p.file), /resource-form-collector\.js/);
  }
});

test('library config: premium program and free resources per stage; no removed stages', () => {
  for (const p of PAGES) {
    const cfg = library.pages[p.stage];
    assert.ok(cfg, p.stage);
    assert.equal(cfg.premiumProgram, p.premium, p.stage);
    assert.ok(cfg.resources.length > 0, p.stage);
  }
  assert.deepEqual(Object.keys(library.pages).sort(), PAGES.map((p) => p.stage).sort(), 'one library stage per hub page');
  assert.equal(library.pages['domain-wise-companies'], undefined, 'the removed domain-wise stage has no config');
});

test('every free local resource file referenced by the library exists', () => {
  const urls = new Set();
  for (const cfg of Object.values(library.pages)) {
    for (const r of cfg.resources) for (const u of [r.viewUrl, r.downloadUrl]) if (u.startsWith('/')) urls.add(u);
  }
  assert.ok(urls.size >= 14);
  for (const u of urls) assert.ok(exists(decodeURI(u).slice(1)), `missing static file ${u}`);
});

test('the new hubs are live: listed in every hub menu and no longer gated or hidden', () => {
  for (const p of PAGES) {
    const html = read(p.file);
    assert.doesNotMatch(html, /data-gated-resource/, `${p.file}: no gated menu links any more`);
    for (const href of NEW_HUBS) {
      const tag = html.match(new RegExp(`<a href="${href.replace(/\./g, '\\.')}"[^>]*>`));
      assert.ok(tag, `${p.file} menu lists ${href}`);
      assert.doesNotMatch(tag[0], /\bhidden\b|data-gated-resource/, `${p.file}: ${href} must be visible`);
    }
    for (const href of REMOVED_HUBS) assert.ok(!html.includes(`href="${href}"`), `${p.file} must not link to the removed ${href}`);
  }
  for (const href of REMOVED_HUBS) assert.ok(!exists(href.slice(1)), `${href} was removed and must not exist`);
  // the QA flag script stays harmless: it only un-hides [data-gated-resource] elements, of which there are none now
  assert.match(read('scripts/resource-page-chrome.js'), /msc-enable-new-resources/);
});

test('web menu links only to routes that exist, as .html (no extensionless fallbacks)', () => {
  for (const p of PAGES) {
    const html = read(p.file);
    for (const m of html.matchAll(/<a href="(\/[^"#?]*)"/g)) {
      const href = m[1];
      if (href === '/') continue;
      const file = href.endsWith('/') ? href.slice(1) + 'index.html' : href.slice(1);
      assert.ok(exists(file), `${p.file} links to ${href} which has no file`);
    }
  }
});

test('Supabase clients share the Flutter-injected session key', () => {
  const KEY = "storageKey: 'sb-izsggdtdiacxdsjjncdq-auth-token'";
  for (const f of ['scripts/supabase-init.js', 'scripts/resource-form-collector.js', 'ca-resource/script.js', 'ca-resource/resource/index.html', 'scripts/profile.js']) {
    assert.ok(read(f).includes(KEY), `${f} must pass the shared storageKey`);
  }
});

test('previews navigate in the same tab (WebView has no onCreateWindow) and downloads use the native blob bridge', () => {
  const src = read('scripts/resource-library.js');
  assert.doesNotMatch(src, /global\.open\(/, 'no window.open/_blank in the free preview path');
  assert.match(src, /global\.location\.href = '\/ca-resource\/index\.html\?pdf='/);
  assert.match(src, /callHandler\('blobToBase64Handler'/);
  assert.match(src, /collector\.checkAndAccess\(resource\.title, [^,]+, \(\) => openFree\(resource, download\)\)/, 'file opens only from the intake success callback');
});

test('protected viewer keeps back navigation, auth gate and the DOCX/blob download bridge', () => {
  const viewer = read('ca-resource/script.js');
  assert.match(viewer, /checkAndAccess|checkAuthAndLoad\(\)/);
  assert.match(viewer, /callHandler\('blobToBase64Handler'/);
  assert.match(read('ca-resource/index.html'), /id="viewer-back-btn"/);
  assert.match(read('ca-resource/resource/index.html'), /industrial-training-mastery-resources/);
});
