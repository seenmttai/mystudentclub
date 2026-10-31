const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Padam, 31 Oct 2026: third-party reposted vacancies come off the site with a reversible hide, not a delete.
// Mobile port of feature/hide-vacancies (the migration lives on master; the database is shared).
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

function loadHelpers(file) {
  const source = read(file);
  const pick = (name) => {
    const match = source.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
    assert.ok(match, `${file} defines ${name}`);
    return match[0];
  };
  // eslint-disable-next-line no-new-func
  return new Function(`let hiddenFilterOff = false;
    ${pick('excludeHidden')}
    ${pick('isHiddenColumnError')}
    return { excludeHidden, isHiddenColumnError, turnOff: () => { hiddenFilterOff = true; } };`)();
}

for (const file of ['scripts/portal3.js', 'scripts/portal-email.js']) {
  test(`${file}: excludeHidden filters hidden rows until the column is known to be missing`, () => {
    const helpers = loadHelpers(file);
    const calls = [];
    const query = { not: (...args) => { calls.push(args); return query; } };
    assert.equal(helpers.excludeHidden(query), query);
    assert.deepEqual(calls, [['hidden', 'is', true]]);
    helpers.turnOff();
    helpers.excludeHidden(query);
    assert.equal(calls.length, 1, 'no filter once the column is missing');
    assert.equal(helpers.isHiddenColumnError({ message: 'column Fresher Jobs.hidden does not exist' }), true);
    assert.equal(helpers.isHiddenColumnError({ message: 'permission denied' }), false);
    assert.equal(helpers.isHiddenColumnError(null), false);
  });
}

test('mobile portal listing, trending and shared link skip hidden vacancies, with the fallback', () => {
  const source = read('scripts/portal3.js');
  assert.match(source, /let query = excludeHidden\(supabaseClient\.from\(currentTable\)\.select\(selectCols\)\);/);
  assert.equal((source.match(/excludeHidden\(supabaseClient/g) || []).length, 4, 'listing, trending, shared link and its numeric retry');
  assert.match(source, /hiddenFilterOff = true;\s*isFetching = false;\s*await fetchJobs\(\);\s*return;/);
  // Retry on whether this query used the filter, not on the flag: trending loads at the same time and may turn it off first.
  assert.doesNotMatch(source, /isHiddenColumnError\(error\) && !hiddenFilterOff/);
  assert.equal((source.match(/const usedHiddenFilter = !hiddenFilterOff;/g) || []).length, 2);
});

test('jobs by email skips hidden vacancies and ignores a hidden shared link', () => {
  const source = read('scripts/portal-email.js');
  assert.match(source, /let query = excludeHidden\(supabaseClient\.from\(table\)\.select\(selectColumns\)\);/);
  assert.match(source, /if \(!error && data && data\.hidden !== true\) \{\s*setTimeout\(\(\) => showModal\(data\), 300\);/);
});

test('job page filters out a hidden vacancy and falls back before the column exists', () => {
  const source = read('scripts/job-details.js');
  assert.match(source, /if \(filterHidden\) query = query\.not\('hidden', 'is', true\);/);
  assert.match(source, /if \(error && error\.message && error\.message\.includes\('hidden'\)\) \(\{ data, error \} = await fetchJob\(false\)\);/);
});

test('admin can hide and unhide, and hidden cards are marked', () => {
  const source = read('admin.html');
  assert.match(source, /data-action="hide"/);
  assert.match(source, /HIDDEN<\/span>/);
  assert.match(source, /async function toggleHidden\(id, table, card\)/);
  assert.match(source, /else if \(action === 'hide'\) \{ await toggleHidden\(jobId, currentTable, card\); \}/);
  assert.match(source, /connect_link' \+ \(adminHiddenColumn \? ', hidden' : ''\);/);
});
