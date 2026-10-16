// Side menu (the slide-in "Navigation" drawer): one Free Resources list everywhere, no gated links, and a status-bar offset
// that is applied exactly once (the Flutter app injects --safe-area-inset-top; Android WebView env() may report it too).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const exists = (p) => fs.existsSync(path.join(root, p));

const RESOURCE_PAGES = [
  'ca-industrial-training-resources.html',
  'articleship-resources.html',
  'ca-fresher-training-resources.html',
  'semi-qualified-ca-resources.html',
  'domain-wise-hiring-companies.html',
];
const PROGRAM_PAGES = ['ca-industrial-training-program/index.html', 'articleship-program/index.html', 'msc-ca-fresher-program/index.html'];

// Canonical list (master's labels): destination + label, in menu order.
// /blog/ and /sessions/ are served only by www (the mobile host answers them with its root fallback page), so they are absolute.
const FREE_RESOURCES = [
  ['/ca-industrial-training-resources.html', 'Industrial Training Resources'],
  ['/articleship-resources.html', 'Articleship Resources'],
  ['/ca-fresher-training-resources.html', 'CA Fresher Resources'],
  ['/semi-qualified-ca-resources.html', 'Semi-Qualified CA Resources'],
  ['/domain-wise-hiring-companies.html', 'Domain-wise Hiring Companies'],
  ['https://www.mystudentclub.com/blog/', 'Career Guides'],
  ['https://www.mystudentclub.com/sessions/', 'Events &amp; Live Sessions'],
];

// The Free Resources list: id="resourcesDropdown" (the forum/mentor pages label the entry just "Resources"), else the first
// dropdown list after the "Free Resources" label (the oldest pages have no id).
function freeResourcesAnchors(html) {
  const byId = html.indexOf('id="resourcesDropdown"');
  const label = byId >= 0 ? byId : html.indexOf('Free Resources');
  assert.ok(label >= 0, 'has a Free Resources entry');
  const block = html.slice(byId >= 0 ? html.lastIndexOf('<div', byId) : label).match(/<div class="dropdown-content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(block, 'Free Resources has a dropdown list');
  return [...block[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    attrs: m[1],
    href: (m[1].match(/href="([^"]*)"/) || [])[1],
    label: m[2].trim(),
  }));
}

function menuPages() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'jobs', 'jobs-builder', 'docs', 'msc-app'].includes(e.name)) continue;
        walk(rel);
      } else if (e.name.endsWith('.html') && !rel.endsWith('/test.html')) {
        try {
          const html = read(rel);
          if (/class="expanded-menu"/.test(html) && (html.includes('id="resourcesDropdown"') || html.includes('Free Resources'))) out.push(rel);
        } catch (_) {}
      }
    }
  };
  walk('');
  return out;
}

test('the 5 resource pages and 3 program pages list the same Free Resources destinations, none hidden', () => {
  for (const file of [...RESOURCE_PAGES, ...PROGRAM_PAGES]) {
    const anchors = freeResourcesAnchors(read(file));
    assert.deepEqual(anchors.map((a) => [a.href, a.label]), FREE_RESOURCES, `${file}: Free Resources list`);
    for (const a of anchors) {
      assert.doesNotMatch(a.attrs, /\bhidden\b|data-gated-resource|display:\s*none/, `${file}: ${a.href} must be visible`);
    }
  }
});

test('every web page with the drawer uses that exact list (jobs/** pages are generated and excluded)', () => {
  const pages = menuPages();
  assert.ok(pages.length >= 39, `found ${pages.length} pages with a Free Resources menu`);
  for (const file of pages) {
    const anchors = freeResourcesAnchors(read(file));
    assert.deepEqual(anchors.map((a) => a.href), FREE_RESOURCES.map((r) => r[0]), `${file}: Free Resources destinations`);
    for (const a of anchors) assert.doesNotMatch(a.attrs, /\bhidden\b|data-gated-resource/, `${file}: ${a.href} hidden`);
  }
});

test('local destinations exist; blog and sessions are absolute www URLs (no relative routes the mobile host cannot serve)', () => {
  for (const [href] of FREE_RESOURCES) {
    if (href.startsWith('/')) assert.ok(exists(href.slice(1)), `${href} has a file`);
    else assert.match(href, /^https:\/\/www\.mystudentclub\.com\/(blog|sessions)\/$/);
  }
  for (const file of [...RESOURCE_PAGES, ...PROGRAM_PAGES]) {
    assert.doesNotMatch(read(file), /href="\/(blog|sessions)\//, `${file}: relative /blog/ or /sessions/ link`);
  }
});

test('each resource hub marks its own entry as the current page (active + aria-current)', () => {
  for (const file of RESOURCE_PAGES) {
    const own = freeResourcesAnchors(read(file)).filter((a) => a.href === `/${file}`);
    assert.equal(own.length, 1, `${file}: lists itself once`);
    assert.match(own[0].attrs, /class="dropdown-item active"/, `${file}: active class`);
    assert.match(own[0].attrs, /aria-current="page"/, `${file}: aria-current`);
    const others = freeResourcesAnchors(read(file)).filter((a) => a.href !== `/${file}`);
    for (const a of others) assert.doesNotMatch(a.attrs, /aria-current/, `${file}: only one current item`);
  }
});

test('program footers list the same resource hubs and no broken relative routes', () => {
  for (const file of PROGRAM_PAGES) {
    const html = read(file);
    const col = html.match(/Free Resources &amp; Tools<\/h4>([\s\S]*?)<\/ul>/);
    assert.ok(col, `${file}: footer column`);
    const hrefs = [...col[1].matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    for (const [href] of FREE_RESOURCES) assert.ok(hrefs.includes(href), `${file}: footer lists ${href}`);
    assert.ok(!hrefs.includes('/ca-articleship-opportunities'), `${file}: footer must not use the unserved /ca-articleship-opportunities`);
  }
});

// ── status-bar offset ───────────────────────────────────────────────────────────────────────
const DRAWER_CSS = ['scripts/portal-style.css', ...PROGRAM_PAGES.map((p) => p.replace('/index.html', '/header.css'))];
// All declarations of every top-level `selector { ... }` rule, joined (a selector can appear in several rules).
const block = (css, selector) => {
  const re = new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
  const rules = [...css.matchAll(re)].map((m) => m[1]);
  assert.ok(rules.length, `${selector} rule`);
  return rules.join('\n');
};

test('the drawer sits below the status bar once: header row has a plain gap, never the inset again', () => {
  for (const file of DRAWER_CSS) {
    const css = read(file);
    assert.match(css, /--msc-sai-top:\s*max\(env\(safe-area-inset-top, 0px\), var\(--safe-area-inset-top, 0px\)\)/, `${file}: single max() source`);
    const drawer = block(css, '.expanded-menu');
    assert.match(drawer, /top:\s*var\(--msc-sai-top, 0px\)/, `${file}: drawer starts below the status bar`);
    assert.match(drawer, /height:\s*calc\(100dvh - var\(--msc-sai-top, 0px\)\)/, `${file}: drawer height excludes the status bar`);
    const header = block(css, '.expanded-menu-header');
    const padding = (header.match(/padding:\s*([^;]+);/) || [])[1];
    assert.ok(padding, `${file}: header padding`);
    assert.doesNotMatch(padding, /safe-area|sai-top/, `${file}: header padding must not add the inset a second time`);
    assert.match(padding, /^(1[2-6]px) 20px (\d+px) 20px$/, `${file}: compact 12-16px top gap`);
  }
});

test('program drawers neutralise the master sections.css 68px padding and absolute close button', () => {
  const mobile = read('scripts/program-mobile.css');
  const drawer = block(mobile, '.expanded-menu');
  assert.match(drawer, /padding:\s*0 !important/);
  assert.match(drawer, /top:\s*var\(--msc-sai-top, 0px\) !important/);
  const close = block(mobile, '.expanded-menu .menu-close-btn');
  assert.match(close, /position:\s*relative !important/);
  assert.match(close, /top:\s*auto !important/);
  for (const file of PROGRAM_PAGES) {
    const html = read(file);
    assert.ok(html.includes('/scripts/program-mobile.css'), `${file} loads program-mobile.css after sections.css`);
    assert.ok(html.indexOf('sections.css') < html.indexOf('/scripts/program-mobile.css'), `${file}: program-mobile.css must come last`);
  }
});

test('older pages whose close button sits directly in the drawer get the same compact gap', () => {
  assert.match(block(read('scripts/portal-style.css'), '.expanded-menu > .menu-close-btn'), /margin:\s*14px 20px 0 0/);
});
