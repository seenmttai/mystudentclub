// Free Industrial Training Toolkit (21 Nov 2026): 9 free files, free tools, lock lines into premium collections, free vs Program band.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const library = require(path.join(root, 'scripts', 'resource-library.js'));
const tick = () => new Promise(resolve => setImmediate(resolve));

test('every free toolkit file exists and every tool points to a page that exists here', () => {
  const page = library.pages['industrial-training'];
  assert.equal(page.resources.length, 9);
  assert.equal(page.resources[0].title, 'Industrial Training Roadmap');
  for (const r of page.resources.filter(r => r.viewUrl.startsWith('/'))) {
    assert.ok(fs.existsSync(path.join(root, r.viewUrl)), r.viewUrl);
    assert.ok(fs.existsSync(path.join(root, r.downloadUrl)), r.downloadUrl);
  }
  for (const tool of page.tools.filter(t => t.url.startsWith('/'))) {
    const local = tool.url.endsWith('/') ? tool.url + 'index.html' : tool.url + '.html';
    assert.ok(fs.existsSync(path.join(root, local)), tool.url);
  }
  assert.equal(library.fillCount('{n} CV templates', 0, 62), '62 CV templates');
  assert.equal(library.countInCategory([{ title: 'Industrial CV Template 1' }, { title: 'Form 104' }], 'CV Templates'), 1);
});

test('lock lines count live, jump to their collection, and hide for enrolled students', async () => {
  const rows = [
    ...Array.from({ length: 64 }, (_, i) => ({ program_type: 'industrial-training', title: 'Industrial CV Template ' + (i + 1), category: 'cv-prep', sort_order: 10 })),
    { program_type: 'industrial-training', title: 'Form 109', category: 'application-tricks', sort_order: 50 }
  ];
  const run = async enrolled => {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'ca-industrial-training-resources.html'), 'utf8'), { url: 'https://mobile.mystudentclub.com/ca-industrial-training-resources', runScripts: 'outside-only' });
    dom.window.supabaseClient = { rpc: async () => ({ data: rows }) };
    if (enrolled) dom.window.MSCProgramAccess = { getAccess: async () => ({ courses: ['industrial-training'] }), canonicalCourse: c => c };
    dom.window.eval(fs.readFileSync(path.join(root, 'scripts/resource-library.js'), 'utf8'));
    await tick(); await tick();
    return dom;
  };
  const dom = await run(false);
  try {
    const doc = dom.window.document;
    const cv = [...doc.querySelectorAll('.resource-upsell')].find(b => /CV templates/.test(b.textContent));
    assert.equal(cv.textContent, 'In the Program: 64 CV templates + 1:1 CV review');
    assert.equal(doc.querySelectorAll('.resource-free-section .resource-tool').length, 5);
    const band = doc.querySelector('.resource-upgrade');
    assert.ok(band.previousElementSibling.matches('.resource-free-section') && band.nextElementSibling.matches('.resource-premium-section'));
    assert.equal(band.querySelector('.resource-upgrade-browse').textContent, 'Browse all 65 premium resources');
    let scrolled = null;
    dom.window.HTMLElement.prototype.scrollIntoView = function () { scrolled = this; };
    [...doc.querySelectorAll('.resource-upsell')].find(b => /Form 104/.test(b.textContent)).click();
    assert.equal(scrolled.querySelector('h4').textContent, 'Registration & Forms');
    assert.ok(!doc.body.classList.contains('resource-program-enrolled'));
  } finally { dom.window.close(); }
  const enrolledDom = await run(true);
  try { assert.ok(enrolledDom.window.document.body.classList.contains('resource-program-enrolled')); } finally { enrolledDom.window.close(); }
});
