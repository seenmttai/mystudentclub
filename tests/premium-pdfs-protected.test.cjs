const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const PREMIUM = ['assets/MSCIT Guidebook-3.pdf', 'assets/doc.pdf', 'assets/doc2.pdf'];

test('paid Industrial Training PDFs are not served from the public assets folder', () => {
  for (const file of PREMIUM) assert.equal(fs.existsSync(path.join(root, file)), false, `${file} must not be public`);
});

test('the CA resource viewer never falls back to a public PDF', () => {
  const js = read('ca-resource/script.js');
  assert.doesNotMatch(js, /assets\/doc2?\.pdf/);
  assert.match(js, /if \(!paramPdf\) window\.location\.replace\('\/ca-resource\/resource\/\?name=doc\.pdf'\)/);
  assert.match(read('ca-resource/index.html'), /\/ca-resource\/resource\/\?name=doc\.pdf/);
});

test('the resource page treats the interview guides and the guidebook as Industrial Training resources', () => {
  const html = read('ca-resource/resource/index.html');
  for (const name of ['mscit guidebook-3.pdf', 'doc.pdf', 'doc2.pdf']) {
    assert.match(html, new RegExp(`'${name.replace('.', '\\.')}': 'industrial-training'`));
  }
  const check = html.indexOf('STANDALONE_RESOURCES[normalizedName]');
  const sign = html.indexOf('.createSignedUrl(');
  assert.ok(check > 0 && sign > check, 'enrolment check runs before any signed link');
  assert.match(html, /id="action-enroll-btn"/);
});

test('no page links to the removed public copies', () => {
  const hits = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'handover', 'tests', 'jobs'].includes(e.name)) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(html|js|json|xml|txt)$/.test(e.name) && /assets\/(doc2?\.pdf|MSCIT(%20| )Guidebook-3\.pdf)/.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(root, p));
    }
  };
  walk(root);
  assert.deepEqual(hits, []);
});
