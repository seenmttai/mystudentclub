const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Padam, 26 Oct 2026: a hire.msc vacancy is exclusive only when "Exclusive opportunity" is ticked
// (is_exclusive). Being recruiter-posted must not lock it on its own.
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'scripts', file), 'utf8');

test('portal cards and modals lock only jobs ticked exclusive', () => {
  for (const file of ['portal3.js', 'portal-email.js']) {
    const source = read(file);
    const checks = source.match(/const isExclusive = [^;]+;/g) || [];
    assert.equal(checks.length, 2, `${file} should decide exclusivity in the card and the modal`);
    for (const check of checks) assert.equal(check, 'const isExclusive = Boolean(job.is_exclusive);', file);
    assert.doesNotMatch(source, /is_exclusive\s*\|\|\s*recruiterPosted/, file);
  }
});

test('job detail page asks to enrol only for jobs ticked exclusive', () => {
  assert.match(read('job-details.js'), /const requiresEnrollment = Boolean\(job\.is_exclusive\) && !isEnrolledSync\(tableName\);/);
});

test('jobs by email reads is_exclusive for Industrial Training only', () => {
  const source = read('portal-email.js');
  assert.match(source, /else if \(table === "Industrial Training Job Portal"\) selectColumns \+= ', is_exclusive';/);
  // The other three job tables have no is_exclusive column (checked live 26 Oct 2026).
  assert.doesNotMatch(source, /selectColumns(Base|Fresher|Semi) = '[^']*is_exclusive/);
});
