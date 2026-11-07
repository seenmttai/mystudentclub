const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { PGlite } = require('@electric-sql/pglite');

// Padam, 31 Oct 2026: third-party reposted vacancies come off the site with a reversible hide, not a delete.
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const TABLES = ['Industrial Training Job Portal', 'Articleship Jobs', 'Fresher Jobs', 'Semi Qualified Jobs'];

test('migration adds hidden columns to every vacancy table, idempotently, hiding nothing', async () => {
  const db = new PGlite();
  try {
    for (const table of TABLES) {
      await db.exec(`create table public."${table}" (id bigint primary key, "Company" text);
        insert into public."${table}" values (1, 'Existing Co');`);
    }
    const migration = read('supabase/migrations/202610310002_add_hidden_to_job_tables.sql');
    await db.exec(migration);
    await db.exec(migration);
    for (const table of TABLES) {
      const { rows } = await db.query(`select hidden, hidden_reason, hidden_at from public."${table}" where id = 1`);
      assert.deepEqual(rows[0], { hidden: false, hidden_reason: null, hidden_at: null }, table);
      await db.query(`insert into public."${table}" (id, "Company") values (2, 'New Co')`);
      const fresh = await db.query(`select hidden from public."${table}" where id = 2`);
      assert.equal(fresh.rows[0].hidden, false, `${table}: new rows default to visible`);
    }
  } finally {
    await db.close();
  }
});

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
    assert.equal(helpers.isHiddenColumnError({ message: 'column Industrial Training Job Portal.hidden does not exist' }), true);
    assert.equal(helpers.isHiddenColumnError({ message: 'permission denied' }), false);
    assert.equal(helpers.isHiddenColumnError(null), false);
  });
}

test('portal listing, trending and shared link all skip hidden vacancies, with the fallback', () => {
  const source = read('scripts/portal3.js');
  assert.match(source, /let q = excludeHidden\(supabaseClient\.from\(currentTable\)\.select\(cols\)\);/);
  assert.equal((source.match(/excludeHidden\(supabaseClient/g) || []).length, 3, 'listing, shared link, trending');
  // Retry on the error itself, not on the flag: another query may already have turned the filter off.
  assert.equal((source.match(/if \(isHiddenColumnError\(error\)\) \{\s*(console\.warn\([^)]*\);\s*)?hiddenFilterOff = true;/g) || []).length, 3);
  assert.doesNotMatch(source, /isHiddenColumnError\(error\) && !hiddenFilterOff/);
});

test('jobs by email skips hidden vacancies and ignores a hidden shared link', () => {
  const source = read('scripts/portal-email.js');
  assert.match(source, /let query = excludeHidden\(supabaseClient\.from\(table\)\.select\(selectColumns\)\);/);
  assert.match(source, /if \(!error && data && data\.hidden !== true\) \{\s*setTimeout\(\(\) => showModal\(data\), 300\);/);
});

test('job page treats a hidden vacancy as not found', () => {
  assert.match(read('scripts/job-details.js'), /if \(!data \|\| data\.hidden === true\) throw new Error\('Job not found'\);/);
});

test('admin can hide and unhide, and hidden cards are marked', () => {
  const source = read('admin.html');
  assert.match(source, /data-action="hide"/);
  assert.match(source, /HIDDEN<\/span>/);
  assert.match(source, /async function toggleHidden\(id, table, card\)/);
  assert.match(source, /\{ hidden: true, hidden_at: new Date\(\)\.toISOString\(\) \}/);
  assert.match(source, /\{ hidden: false, hidden_reason: null, hidden_at: null \}/);
  assert.match(source, /else if \(action === 'hide'\) \{\s*await toggleHidden\(jobId, currentTable, card\);/);
  assert.match(source, /connect_link, hidden';/);
});

test('static job pages: no page for hidden vacancies, and old pages of hidden ones are removed before the sitemap', async () => {
  assert.match(read('jobs-builder/src/pages/jobs/[category]/[slug].astro'), /if \(!hiddenFilterOff\) query = query\.not\('hidden', 'is', true\);/);
  const workflow = read('.github/workflows/generate-jobs.yml');
  const hide = workflow.indexOf('npm run hide');
  assert.ok(hide > workflow.indexOf('npm run expire') && hide < workflow.indexOf('npm run sitemap'));

  const mod = await import(pathToFileURL(path.join(root, 'jobs-builder/scripts/remove-hidden-jobs.js')).href);
  assert.equal(mod.jobIdFromFileName('7524.html'), 7524);
  assert.equal(mod.jobIdFromFileName('3sc-other-gurugram-9920.html'), 9920);
  assert.equal(mod.jobIdFromFileName('index.html'), null);
  assert.deepEqual(
    mod.pagesToRemove(['7524.html', 'zepto-finance-mumbai-10588.html', 'amazon-other-bengaluru-10584.html'], new Set([10588, 7524])),
    ['7524.html', 'zepto-finance-mumbai-10588.html']
  );
});
