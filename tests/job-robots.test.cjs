const test = require('node:test');
const assert = require('node:assert/strict');
const { markJobNoindex, hasNoindex } = require('../scripts/job-robots.cjs');

test('expired job has one noindex directive while preserving the entire body', () => {
  const body = '<body><h1>CA Industrial Training</h1><p>₹25,000 · Mumbai</p><a href="/application?id=42">Apply</a></body>';
  const source = '<html><head><meta name="robots" content="index, follow"><meta name="robots" content="noindex, follow"><title>Job</title></head>' + body + '</html>';
  const result = markJobNoindex(source);
  assert.equal((result.match(/name="robots"/g) || []).length, 1);
  assert.ok(hasNoindex(result));
  assert.equal(result.slice(result.indexOf('<body>')), body + '</html>');
  assert.equal(markJobNoindex(result), result);
});

test('handles attribute order, case, and single quotes without changing other metadata', () => {
  const source = "<head><META content='index, follow' NAME='robots'><meta name='description' content='A real opportunity'></head>";
  const result = markJobNoindex(source);
  assert.equal(result, '<head><meta name="robots" content="noindex, follow"><meta name=\'description\' content=\'A real opportunity\'></head>');
  assert.equal(hasNoindex(source), false);
  assert.equal(hasNoindex(result), true);
});

test('adds missing directive within head and preserves structured data', () => {
  const data = '<script type="application/ld+json">{"datePosted":"2026-09-27"}</script>';
  const result = markJobNoindex('<html><head>' + data + '</head><body>Existing details</body></html>');
  assert.ok(result.includes(data));
  assert.ok(result.indexOf('noindex') < result.indexOf('</head>'));
  assert.equal(hasNoindex('<meta name="description" content="noindex information">'), false);
});
