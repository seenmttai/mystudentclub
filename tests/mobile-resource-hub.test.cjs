// Mobile resource hub: WhatsApp community link, tappable Free/Premium stats, "What's included" premium overview.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const PAGES = {
  'articleship-resources.html': 'Articleship',
  'ca-fresher-training-resources.html': 'CA Fresher',
  'ca-industrial-training-resources.html': 'Industrial Training',
  'semi-qualified-ca-resources.html': 'Semi Qualified CA',
};

test('every resource page has the WhatsApp community card, linked to the links page', () => {
  assert.ok(fs.existsSync(path.join(root, 'links/index.html')), 'the /links/ page exists on mobile');
  assert.match(read('links/index.html'), /chat\.whatsapp\.com\//);
  for (const [page, name] of Object.entries(PAGES)) {
    const html = read(page);
    const card = html.match(/<a class="rh-community" href="([^"]+)">[\s\S]*?<\/a>/);
    assert.ok(card, page + ' has the community card');
    assert.equal(card[1], '/links/');
    assert.ok(card[0].includes('Join MSC ' + name + ' WhatsApp Community'), page + ' names its own community');
    assert.ok(html.indexOf('rh-community') > html.indexOf('rh-hero') && html.indexOf('rh-community') < html.indexOf('id="resources-container"'), page + ': card sits between hero and resources');
  }
});

test('hero stats jump to the Free and Premium sections', () => {
  const library = read('scripts/resource-library.js');
  assert.match(library, /heading\.id = 'resource-' \+ id/, 'section headings get resource-free / resource-premium ids');
  for (const page of Object.keys(PAGES)) {
    const html = read(page);
    assert.match(html, /<a class="rh-stat" href="#resource-free"><strong data-stat="free">/, page);
    assert.match(html, /<a class="rh-stat" href="#resource-premium"><strong data-stat="premium">/, page);
  }
});

test('all four pages load the same, new library version', () => {
  const versions = new Set();
  for (const page of Object.keys(PAGES)) {
    for (const m of read(page).matchAll(/resource-library\.(?:js|css)\?v=([\w.]+)/g)) versions.add(m[1]);
  }
  assert.deepEqual([...versions], ['20261106.1']);
});

test('premium section has a "What\'s included" overview that jumps to each collection', () => {
  const library = read('scripts/resource-library.js');
  const css = read('scripts/resource-library.css');
  assert.match(library, /function renderPremiumOverview\(\)/);
  assert.match(library, /overview\.id = 'premium-overview'/);
  assert.match(library, /chip\.addEventListener\('click', \(\) => jumpToCollection\(name\)\)/);
  assert.match(library, /renderPremiumResults\(\);\n\s+renderPremiumOverview\(\);/, 'overview refreshes when the catalogue loads');
  assert.match(css, /\.premium-overview\[hidden\] \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 599px\)[\s\S]*\.preview-mock-lines \{ display: none; \}/, 'phones get the compact premium card');
});
