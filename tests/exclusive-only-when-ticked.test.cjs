const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Padam, 26 Oct 2026: a hire.msc vacancy is exclusive only when "Exclusive opportunity" is ticked
// (is_exclusive). Being recruiter-posted must not lock it on its own.
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'scripts', file), 'utf8');

test('portal cards and modals lock only jobs ticked exclusive', () => {
  // Jobs by email still renders its own cards and modal.
  const email = read('portal-email.js');
  const checks = email.match(/const isExclusive = [^;]+;/g) || [];
  assert.equal(checks.length, 2, 'portal-email.js should decide exclusivity in the card and the modal');
  for (const check of checks) assert.equal(check, 'const isExclusive = Boolean(job.is_exclusive);');
  assert.doesNotMatch(email, /is_exclusive\s*\|\|\s*recruiterPosted/);

  // The five portals (job portal v2) decide it in one place, jobs-core.js, used by the card and the drawer.
  const core = read('portal-v2/jobs-core.js');
  assert.match(core, /export function isExclusiveJob\(job\) \{\s*return Boolean\(job\?\.is_exclusive\);\s*\}/);
  assert.match(core, /return !isExclusiveJob\(job\) \|\| isEnrolledInProgramme\(portal, courses\);/);
  for (const file of ['portal-v2/jobs-core.js', 'portal-v2/job-view.js', 'portal-v2/portal-app.js', 'portal3.js']) {
    assert.doesNotMatch(read(file), /is_exclusive\s*\|\|\s*(recruiterPosted|isTeamPosted)/, file);
  }
});

test('job detail page asks to enrol only for jobs ticked exclusive', () => {
  const view = read('portal-v2/job-view.js');
  assert.match(view, /if \(isExclusiveJob\(job\)\) \{\s*const locked = !canSeeApplyDetails\(job, portal, ctx\.courses\);/);
  assert.match(read('portal-v2/jobs-core.js'), /if \(!canSeeApplyDetails\(job, portal, ctx\.courses\)\) return 'locked';/);
  assert.match(read('job-details.js'), /detailHtml\(job, state\.portal, \{/);
});

test('jobs by email reads is_exclusive for Industrial Training only', () => {
  const source = read('portal-email.js');
  assert.match(source, /else if \(table === "Industrial Training Job Portal"\) selectColumns \+= ', is_exclusive';/);
  // The other three job tables have no is_exclusive column (checked live 26 Oct 2026).
  assert.doesNotMatch(source, /selectColumns(Base|Fresher|Semi) = '[^']*is_exclusive/);
});
