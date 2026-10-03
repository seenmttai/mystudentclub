const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// sessions.js is an ES module, but this package is "type": "commonjs", so import a .mjs copy.
async function loadSessionsModule() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msc-sessions-'));
  const copy = path.join(dir, 'sessions.mjs');
  fs.copyFileSync(path.join(root, 'sessions', 'sessions.js'), copy);
  return import(pathToFileURL(copy).href);
}

test('the Events page calls the msc-mail Worker from every host', async () => {
  const mod = await loadSessionsModule();
  assert.equal(mod.CONFIG.API_BASE, 'https://notify.mystudentclub.com');
  for (const hostname of ['www.mystudentclub.com', 'mystudentclub.com', 'localhost']) {
    const loc = { hostname, origin: `https://${hostname}` };
    assert.equal(mod.resolveApiBase(loc), 'https://notify.mystudentclub.com', hostname);
  }
});

test('the Events page loads its script from an absolute path and is canonical at /sessions/', () => {
  const html = read('sessions/index.html');
  assert.match(html, /<script type="module" src="\/sessions\/sessions\.js"><\/script>/);
  assert.match(html, /<link rel="canonical" href="https:\/\/www\.mystudentclub\.com\/sessions\/">/);
  assert.match(html, /data-msc-sessions/);
});

test('/events redirects to /sessions/ on Pages and in local serve', () => {
  const rules = read('_redirects').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  assert.ok(rules.includes('/events /sessions/ 301'));
  assert.ok(rules.includes('/events/ /sessions/ 301'));
  assert.equal(rules[0].split(/\s+/)[0], '/terms', 'existing rule stays first');

  const serve = JSON.parse(read('serve.json'));
  const rewrite = (source) => serve.rewrites.find((r) => r.source === source);
  assert.equal(rewrite('/sessions').destination, '/sessions/index.html');
  assert.equal(rewrite('/sessions/').destination, '/sessions/index.html');
  const redirect = serve.redirects.find((r) => r.source === '/events');
  assert.deepEqual(redirect, { source: '/events', destination: '/sessions/', type: 301 });
});

test('the Events page is in the main sitemap once', () => {
  const xml = read('main-sitemap.xml');
  assert.equal(xml.split('<loc>https://www.mystudentclub.com/sessions/</loc>').length - 1, 1);
  assert.match(xml, /<\/urlset>\s*$/);
});
