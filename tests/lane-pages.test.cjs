const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const SITE = 'https://www.mystudentclub.com';
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const load = (file) => import(pathToFileURL(path.join(root, 'scripts/courses', file)).href);
const attr = (html, re) => (html.match(re) || [])[1];

function resolvesOnSite(href) {
  const url = new URL(href, `${SITE}/`);
  if (url.origin !== SITE) return true;
  const p = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const candidates = p === '' ? ['index.html'] : p.endsWith('/') ? [`${p}index.html`] : [p, `${p}.html`, `${p}/index.html`];
  if (candidates.some((c) => fs.existsSync(path.join(root, c)) && fs.statSync(path.join(root, c)).isFile())) return true;
  return fs.readFileSync(path.join(root, '_redirects'), 'utf8').split('\n').some((line) => line.split(/\s+/)[0] === `/${p}`);
}

// Everything the generator is allowed to differ on between a CS/CMA page and
// the CA page it was copied from.
function normalize(html, regions) {
  let out = html;
  for (const name of regions) {
    out = out.replace(new RegExp(`<!-- msc:${name} -->[\\s\\S]*?<!-- /msc:${name} -->`), `<!-- ${name} -->`);
  }
  return out
    .replace(/<body\b[^>]*>/, '<body>')
    .replace(/<title>[\s\S]*?<\/title>/, '<title>')
    .replace(/<meta\s+(?:name|property)="(?:description|keywords|robots|og:url|og:title|og:description|og:image|og:image:secure_url|og:image:alt|twitter:title|twitter:description|twitter:image)"\s+content="[^"]*"\s*\/?>/g, '<meta>')
    .replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/, '<link>');
}

test('lane pages and the SQL migration are up to date with courses.js', async () => {
  const { buildAll } = await load('build-pages.js');
  const stale = buildAll().filter((page) => !fs.existsSync(path.join(root, page.file)) || read(page.file) !== page.html);
  assert.deepEqual(stale.map((p) => p.file), [], 'run: npm run build:pages');
});

test('each CS/CMA page is its CA source page outside the generated parts', async () => {
  const { LANES } = await load('courses.js');
  const { REGIONS } = await load('build-pages.js');
  for (const lane of LANES.filter((l) => l.qualification !== 'ca')) {
    assert.equal(normalize(read(lane.file), REGIONS), normalize(read(lane.source), REGIONS), `${lane.file} vs ${lane.source}`);
  }
});

test('every lane page names itself: canonical, og:url, body data and the active tab', async () => {
  const { LANES, lanesFor } = await load('courses.js');
  for (const lane of LANES) {
    const html = read(lane.file);
    assert.match(html, new RegExp(`<body data-qualification="${lane.qualification}" data-lane="${lane.id}">`), lane.file);
    assert.match(html, new RegExp(`<a href="${lane.path}" class="footer-tab active" aria-current="page">`), lane.file);
    assert.match(html, new RegExp(`class="course-chip" data-qualification="${lane.qualification}"[^>]*aria-current="true"`), lane.file);
    assert.equal((html.match(/class="footer-tab/g) || []).length, 5, `${lane.file}: five lane tabs`);
    for (const tab of lanesFor(lane.qualification)) assert.ok(html.includes(`<a href="${tab.path}" class="footer-tab`), `${lane.file}: tab ${tab.path}`);
    if (lane.qualification === 'ca') continue;
    assert.equal(attr(html, /<link rel="canonical" href="([^"]+)"/), `${SITE}${lane.path}`, lane.file);
    assert.equal(attr(html, /<meta property="og:url" content="([^"]+)"/), `${SITE}${lane.path}`, lane.file);
    assert.equal(attr(html, /<meta name="robots" content="([^"]+)"/), lane.noindex ? 'noindex, follow' : 'index, follow', lane.file);
    assert.doesNotMatch(html, /<h3>Career Programs<\/h3>/, `${lane.file}: no CA programme card in the rail`);
    if (lane.note) assert.match(html, /<aside class="lane-note" role="note">/, lane.file);
  }
});

test('modules load with content hashes through one import map', async () => {
  const { LANES } = await load('courses.js');
  for (const lane of LANES) {
    const html = read(lane.file);
    const map = JSON.parse(attr(html, /<script type="importmap">([^<]+)<\/script>/));
    assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'), `${lane.file}: import map first`);
    for (const [url, versioned] of Object.entries(map.imports)) {
      assert.match(versioned, new RegExp(`^${url.replace(/[.]/g, '\\.')}\\?v=[0-9a-f]{10}$`), `${lane.file}: ${url}`);
      assert.ok(resolvesOnSite(url), `${lane.file}: ${url} exists`);
    }
    assert.match(html, /<script type="module" src="\/scripts\/portal3\.js\?v=[0-9a-f]{10}"><\/script>/, lane.file);
    assert.match(html, /href="\/scripts\/portal-style\.css\?v=[0-9a-f]{10}"/, lane.file);
  }
});

test('every internal link on the lane pages resolves', async () => {
  const { LANES } = await load('courses.js');
  for (const lane of LANES) {
    const html = read(lane.file);
    const hrefs = [...html.matchAll(/(?:href|src)="([^"#]+)/g)].map((m) => m[1].split('?')[0]).filter((h) => h.startsWith('/') && !h.startsWith('//'));
    for (const href of hrefs) assert.ok(resolvesOnSite(href), `${lane.file}: broken link ${href}`);
  }
});

test('the sitemap lists indexable lanes at their canonical URL and skips the rest', async () => {
  const { LANES } = await load('courses.js');
  const sitemap = read('main-sitemap.xml');
  for (const lane of LANES.filter((l) => l.qualification !== 'ca')) {
    const listed = sitemap.includes(`<loc>${SITE}${lane.path}</loc>`);
    assert.equal(listed, !lane.noindex, lane.path);
  }
  for (const gone of ['/cs-jobs', '/cma-jobs']) assert.ok(!sitemap.includes(`<loc>${SITE}${gone}</loc>`), gone);
  assert.match(read('_redirects'), /^\/cs-jobs \/cs-articleship 301$/m);
  assert.match(read('_redirects'), /^\/cma-jobs \/cma-articleship 301$/m);
});
