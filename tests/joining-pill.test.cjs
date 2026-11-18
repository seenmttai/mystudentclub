// Joining pill (6 Nov 2026, Aniket): Industrial Training cards show when the trainee must join ("Immediate Joiner",
// "Nov Joinee"). The label lives in the joining_label column, which the database fills from the description
// (run live on 19 Nov 2026; the SQL and its tests are kept outside the repo). This checks the page side.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const portal = fs.readFileSync(path.join(__dirname, '../scripts/portal3.js'), 'utf8');

test('Industrial Training list and shared links load the label; card and popup show it', () => {
  assert.equal((portal.match(/"Technology Tags", is_exclusive, joining_label'/g) || []).length, 2);
  assert.match(portal, /const joiningLabel = currentTable === 'Industrial Training Job Portal' \? \(job\.joining_label \|\| ''\) : '';/);
  assert.equal((portal.match(/class="job-tag tag-joining"/g) || []).length, 2);
});

test('the list and shared links still load if joining_label is missing or unreadable', () => {
  assert.match(portal, /\/joining_label\/\.test\(message\) && cols\.includes\(', joining_label'\)/);
  assert.match(portal, /error\.message\.includes\('joining_label'\) && selectColumns\.includes\(', joining_label'\)/);
});
