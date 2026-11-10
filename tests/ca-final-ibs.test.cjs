// CA Final IBS strategy page (/ca-final-ibs-strategy): every link the page renders must point at a real file,
// and every solved paper must have the shape app.js reads.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '..', 'ca-final-ibs-strategy');
const read = (p) => JSON.parse(fs.readFileSync(path.join(DIR, p), 'utf8'));
const MAX = 25 * 1024 * 1024; // Cloudflare Pages per-file limit

test('every index file and zip on the page exists and fits Cloudflare Pages', () => {
  const idx = read('data/indexes.json');
  assert.ok(idx.files.length > 0);
  const ids = new Set(idx.subjects.map((s) => s.id));
  for (const f of idx.files) {
    assert.ok(ids.has(f.subject), `unknown subject ${f.subject}`);
    assert.ok(f.title && f.faculty, `title/faculty missing for ${f.path}`);
    const p = path.join(DIR, f.path);
    assert.ok(fs.existsSync(p), `missing ${f.path}`);
    assert.ok(fs.statSync(p).size < MAX, `too big ${f.path}`);
  }
  for (const [sid, z] of Object.entries(idx.zips || {})) {
    assert.strictEqual(z.count, idx.files.filter((f) => f.subject === sid).length, `zip count for ${sid}`);
  }
});

test('downloads and solved papers referenced by site.json exist', () => {
  const site = read('data/site.json');
  for (const list of Object.values(site.downloads)) {
    for (const d of list) assert.ok(fs.existsSync(path.join(DIR, d.path)), `missing ${d.path}`);
  }
  assert.ok(site.papers.length >= 6);
  for (const p of site.papers) {
    const d = read(`data/solutions/${p.id}.json`);
    assert.strictEqual(d.cases.length, 5, `${p.id} should have 5 cases`);
    for (const c of d.cases) {
      assert.ok(c.title && c.questions.length >= 7, `${p.id} case ${c.no}`);
      for (const q of c.questions) {
        for (const k of ['q', 'type', 'marks', 'subject', 'ask', 'answer']) assert.ok(q[k] !== undefined && q[k] !== '', `${p.id} Q${q.q} lacks ${k}`);
        assert.ok(['MCQ', 'Descriptive'].includes(q.type), `${p.id} Q${q.q} type ${q.type}`);
        if (q.type === 'MCQ') assert.ok(q.options && Object.keys(q.options).length === 4, `${p.id} Q${q.q} options`);
      }
    }
  }
  const a = site.analysis;
  assert.ok(a.papers.length >= 6 && a.subjects.includes('Law') && a.subjects.includes('Costing'));
});
