const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const SITE = 'https://www.mystudentclub.com';
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file) => import(pathToFileURL(path.join(root, 'scripts/pro-portal', file)).href);
const attr = (html, re) => (html.match(re) || [])[1];

/** A site path resolves the way Cloudflare Pages serves it: the file, <path>.html or <path>/index.html. */
function resolvesOnSite(href) {
  const url = new URL(href, `${SITE}/`);
  if (url.origin !== SITE) return true;
  const p = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const candidates = p === '' ? ['index.html'] : p.endsWith('/') ? [`${p}index.html`] : [p, `${p}.html`, `${p}/index.html`];
  return candidates.some((c) => fs.existsSync(path.join(root, c)) && fs.statSync(path.join(root, c)).isFile());
}

test('generated CS/CMA pages and the SQL migration are up to date with config', async () => {
  const { buildAll } = await load('build-pages.js');
  const stale = buildAll().filter((page) => !fs.existsSync(path.join(root, page.file)) || read(page.file) !== page.html);
  assert.deepEqual(stale.map((p) => p.file), [], 'run: npm run build:pro-portal');
});

test('every page has one h1, matching canonical/og:url, and parseable JSON-LD', async () => {
  const { buildAll } = await load('build-pages.js');
  const pages = buildAll().filter((p) => p.path);
  assert.equal(pages.length, 12);
  for (const { file, path: route } of pages) {
    const html = read(file);
    assert.equal(attr(html, /<link rel="canonical" href="([^"]+)">/), `${SITE}${route}`, file);
    assert.equal(attr(html, /<meta property="og:url" content="([^"]+)">/), `${SITE}${route}`, file);
    assert.match(attr(html, /<title>([^<]+)<\/title>/), / \| My Student Club$/, file);
    assert.equal(html.split('<h1').length - 1, 1, `${file}: one h1`);
    assert.match(html, /<body class="pp" data-course="(cs|cma)"/, file);
    assert.match(html, /<script type="module" src="\/scripts\/pro-portal\/portal\.js\?v=[0-9a-f]{10}"><\/script>/, file);
    for (const block of html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || []) {
      assert.doesNotThrow(() => JSON.parse(block.replace(/^<script[^>]*>|<\/script>$/g, '')), file);
    }
  }
});

test('every internal link on the generated pages resolves to a file', async () => {
  const { buildAll } = await load('build-pages.js');
  for (const { file, path: route } of buildAll().filter((p) => p.path)) {
    const html = read(file);
    const hrefs = [...html.matchAll(/(?:href|src)="([^"#]+)/g)].map((m) => m[1].split('?')[0]).filter((h) => h.startsWith('/') && !h.startsWith('//'));
    for (const href of hrefs) assert.ok(resolvesOnSite(href), `${route}: broken link ${href}`);
  }
});

test('the sitemap lists every indexable CS/CMA page and the CA pages link to both hubs', async () => {
  const { COURSES } = await load('config.js');
  const sitemap = read('main-sitemap.xml');
  for (const course of Object.values(COURSES)) {
    for (const route of [course.hubPath, ...course.lanes.filter((l) => !l.noindex).map((l) => l.path)]) {
      assert.ok(sitemap.includes(`<loc>${SITE}${route}</loc>`), `sitemap: ${route}`);
    }
    for (const lane of course.lanes.filter((l) => l.noindex)) {
      assert.ok(!sitemap.includes(`<loc>${SITE}${lane.path}</loc>`), `sitemap must skip noindex ${lane.path}`);
      assert.match(read(`${lane.path.slice(1)}.html`), /<meta name="robots" content="noindex, follow">/, lane.path);
    }
  }
  for (const page of ['index.html', 'ca-articleship-opportunities.html', 'semi-qualified-ca-jobs.html', 'ca-fresher-jobs.html', 'experienced-ca-jobs.html']) {
    const html = read(page);
    assert.match(html, /<a href="\/cs-jobs" class="dv2-dropdown-item">/, `${page}: desktop CS link`);
    assert.match(html, /<a href="\/cma-jobs" class="dv2-dropdown-item">/, `${page}: desktop CMA link`);
    assert.match(html, /<a href="\/cs-jobs" class="menu-item">/, `${page}: mobile CS link`);
    assert.match(html, /<a href="\/cma-jobs" class="menu-item">/, `${page}: mobile CMA link`);
  }
});

test('training pages carry the institute rule callout with a source', async () => {
  const { COURSES } = await load('config.js');
  for (const course of Object.values(COURSES)) {
    for (const lane of course.lanes.filter((l) => l.key.endsWith('training'))) {
      const html = read(`${lane.path.slice(1)}.html`);
      assert.match(html, /<details class="pp-callout pp-callout-(warn|info)" data-callout>/, lane.path);
      assert.match(html, /Read the rule<\/a>/, lane.path);
    }
  }
});
