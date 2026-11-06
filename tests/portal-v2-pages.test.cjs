// Job portal v2: the five listing pages, the vacancy page, the static SEO job pages and the is_exclusive migration.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

const PAGES = {
  'index.html': 'industrial',
  'ca-articleship-opportunities.html': 'articleship',
  'semi-qualified-ca-jobs.html': 'semi',
  'ca-fresher-jobs.html': 'fresher',
  'experienced-ca-jobs.html': 'experienced',
};
const TAB_HREF = { industrial: '/', articleship: '/ca-articleship-opportunities', semi: '/semi-qualified-ca-jobs', fresher: '/ca-fresher-jobs', experienced: '/experienced-ca-jobs' };

test('every listing page carries the v2 shell and none of the old listing markup', () => {
  for (const [page, key] of Object.entries(PAGES)) {
    const html = read(page);
    assert.match(html, new RegExp(`<main class="pv2" id="pv2" data-portal="${key}">`), page);
    assert.equal((html.match(/<h1\b/g) || []).length, 1, `${page}: one h1`);
    assert.match(html, /<body class="pv2-page">/, page);
    assert.match(html, /portal-style\.css\?v=2\.1">\s*<link rel="stylesheet" href="\/scripts\/portal-v2\/portal-v2\.css\?v=1">/, `${page}: v2 styles after the shared ones`);
    assert.match(html, /<script type="module" src="\/scripts\/portal3\.js\?v=3\.0"><\/script>/, page);
    for (const id of ['pv2Search', 'pv2SearchForm', 'pv2Quick', 'pv2Filters', 'pv2FilterBody', 'pv2Count', 'pv2Sort', 'pv2Active', 'pv2List', 'pv2More', 'pv2Older', 'pv2OlderList', 'pv2OlderButton', 'pv2Drawer', 'pv2DrawerPanel', 'pv2DrawerBody']) {
      assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `${page}: #${id}`);
    }
    assert.match(html, /role="dialog" aria-modal="true" aria-labelledby="pv2-detail-title"/, page);
    assert.match(html, new RegExp(`<a href="${TAB_HREF[key]}" class="pv2-tab" aria-current="page">`), `${page}: current tab`);
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1, page);
    // Old listing markup is gone (portal3.js no longer drives it).
    for (const old of ['id="jobs"', 'id="filterModalOverlay"', 'id="modal-body-content"', 'id="sortBySelect"', 'id="dv2TrendingList"', 'class="portal-nav-bar"']) {
      assert.ok(!html.includes(old), `${page}: ${old} should be gone`);
    }
    // Shared pieces portal3.js still runs stay.
    for (const keep of ['id="notificationPopup"', 'id="loginPromptOverlay"', 'id="expandedMenu"', 'class="auth-buttons-container"', 'class="banner-section"', 'class="dv2-right-rail"']) {
      assert.ok(html.includes(keep), `${page}: ${keep} must stay`);
    }
  }
  assert.match(read('index.html'), /id="onboardingSegmentModal"/);
});

test('portal-v2 modules are imported with one version everywhere (no stale module mix after a deploy)', () => {
  const specifiers = [];
  for (const file of ['scripts/portal3.js', 'scripts/job-details.js', 'scripts/portal-v2/portal-app.js', 'scripts/portal-v2/job-view.js']) {
    for (const m of read(file).matchAll(/from '([^']*(?:jobs-core|job-view|portal-app)\.js[^']*)'/g)) specifiers.push(m[1]);
  }
  assert.ok(specifiers.length >= 6, specifiers.join(', '));
  const versions = new Set(specifiers.map((s) => (s.match(/\?v=(\d+)$/) || [])[1]));
  assert.deepEqual([...versions], ['1'], specifiers.join(', '));
});

test('no listing query reads a private column; the LinkedIn post is fetched only for allowed students', () => {
  const app = read('scripts/portal-v2/portal-app.js');
  const selects = [...app.matchAll(/\.select\(([^)]*)\)/g)].map((m) => m[1]);
  for (const select of selects) {
    assert.match(select, /^(columns|listColumns\(|detailColumns\(|'posts_link'|'firm_name, overall_rating')/, select);
  }
  assert.equal(selects.filter((s) => s.includes('posts_link')).length, 1);
  assert.match(app, /if \(!session\(\) \|\| !host\.isEnrolledForPerks\(\) \|\| !canSeeApplyDetails\(job, portal, courses\(\)\)\) return;\s*if \(state\.postLinks\.has/);
  assert.doesNotMatch(app, /Application ID'\]?\s*[,)]/, 'never selects the Application ID');
  const details = read('scripts/job-details.js');
  assert.doesNotMatch(details, /select\('\*'\)|posts_link'\)|Application ID'/);
  assert.match(details, /detailColumns\(state\.portal, \{ omit \}\)/);
  const host = read('scripts/portal3.js');
  assert.doesNotMatch(host, /posts_link|select\('\*'\)/);
});

test('exclusive state is never cached, and a locked vacancy\'s description is never fetched', () => {
  const app = read('scripts/portal-v2/portal-app.js');
  assert.match(app, /state\.omit = cached\.omit\.filter\(\(col\) => col === 'hidden'\);/);
  assert.match(app, /const omit = state\.omit\.filter\(\(col\) => col === 'hidden'\);/);
  assert.match(app, /async function loadDetail\(job\) \{[\s\S]{0,400}if \(!canSeeApplyDetails\(job, portal, courses\(\)\)\) return;[\s\S]{0,200}detailColumns/);
  assert.match(app, /if \(generation !== state\.olderGeneration\) return;/, 'a stale "older" answer is dropped');
  const details = read('scripts/job-details.js');
  assert.match(details, /if \(canSeeApplyDetails\(state\.job, state\.portal, state\.courses\)\) \{\s*const detail = await selectWithFallback/);
});

test('portal3.js hands the listing its host and keeps its own jobs', () => {
  const source = read('scripts/portal3.js');
  assert.match(source, /portalApp = mountPortalApp\(createPortalHost\(\)\);/);
  assert.match(source, /unlock: \(job\) => unlockJobDetails\(job, currentTable, currentSession, \{ endpoint: BROWSER_GUARD_WORKER_URL \}\)/);
  assert.match(source, /isEnrolledForPerks: \(\) => isEnrolledSync\(currentTable\)/);
  assert.match(source, /getCourses: \(\) => userEnrollmentsCache \|\| \[\]/);
  assert.match(source, /const jobType = PORTAL\.jobType;/);
  for (const gone of ['function renderJobCard', 'function showModal', 'function fetchJobs', 'function setupMultiSelect', 'dv2PopulateTrending']) {
    assert.ok(!source.includes(gone), gone);
  }
  // Mount the list before waiting on login, so vacancies start loading at once.
  assert.ok(source.indexOf('portalApp = mountPortalApp') < source.indexOf('const session = await checkAuth();'));
});

test('job.html sends experienced shares to the experienced page', () => {
  assert.match(read('job.html'), /'experienced': '\/experienced-ca-jobs',/);
});

test('static SEO job pages: no exclusive vacancy, no posts_link, 15-day expiry kept', () => {
  const helpers = read('jobs-builder/src/lib/jobHelpers.ts');
  assert.doesNotMatch(helpers.match(/export function getPublicJobSelectColumns[\s\S]*?\n}/)[0], /posts_link/);
  assert.match(helpers, /if \(withExclusive\) columns \+= ', is_exclusive';/);
  assert.match(helpers, /export const JOB_EXPIRATION_DAYS = 15;/);
  const page = read('jobs-builder/src/pages/jobs/[category]/[slug].astro');
  assert.match(page, /const publicJobs = \(jobs \|\| \[\]\)\.filter\(\(job: any\) => !isExclusiveJob\(job\)\);/);
  assert.match(page, /for \(const job of publicJobs\) \{/);
  assert.match(page, /if \(error && isMissingExclusiveColumn\(error\)\)/);
  assert.doesNotMatch(page, /posts_link/);
  assert.match(read('jobs-builder/scripts/expire-old-jobs.js'), /const EXPIRATION_DAYS = 15;/);
  assert.match(read('scripts/generate-jobs.js'), /if \(job\.is_exclusive\) continue;/);
  const workflow = read('.github/workflows/generate-jobs.yml');
  const expire = workflow.indexOf('npm run expire');
  const unexclusive = workflow.indexOf('npm run unexclusive');
  const sitemap = workflow.indexOf('npm run sitemap');
  assert.ok(expire > 0 && unexclusive > expire && sitemap > unexclusive, 'expire → remove exclusive pages → sitemap');
  assert.match(read('jobs-builder/package.json'), /"unexclusive": "node scripts\/remove-exclusive-jobs\.js"/);
});

test('remove-exclusive-jobs matches pages to vacancy ids exactly', async () => {
  const mod = await import(pathToFileURL(path.join(root, 'jobs-builder/scripts/remove-exclusive-jobs.js')).href);
  assert.equal(mod.idFromPageName('acme-audit-mumbai-10572.html'), '10572');
  assert.equal(mod.idFromPageName('9250.html'), '9250');
  assert.equal(mod.idFromPageName('notes.html'), null);
  assert.deepEqual(
    mod.pagesToRemove(['acme-mumbai-10572.html', 'other-mumbai-110572.html', '9250.html', 'x-1057.html', 'readme.txt'], ['10572', 9250]),
    ['acme-mumbai-10572.html', '9250.html'],
  );
  // Semi Qualified Jobs ids are UUIDs (generated slugs and the old id-only pages both end in them).
  const uuid = '00269efd-17dd-4ed2-ba8b-60a0a87f760c';
  assert.equal(mod.idFromPageName(`acme-audit-pune-${uuid}.html`), uuid);
  assert.equal(mod.idFromPageName(`${uuid}.html`), uuid);
  assert.equal(mod.idFromPageName('acme-pune-00269efd-17dd-4ed2-ba8b-123456789012.html'), '00269efd-17dd-4ed2-ba8b-123456789012');
  assert.deepEqual(mod.pagesToRemove([`acme-${uuid}.html`, `${uuid.toUpperCase()}.html`, 'other-11111111-2222-3333-4444-555555555555.html'], [uuid]), [`acme-${uuid}.html`, `${uuid.toUpperCase()}.html`]);
});

test('is_exclusive migration is additive, idempotent and readable by logged-out visitors', async () => {
  const file = fs.readdirSync(path.join(root, 'supabase/migrations')).find((f) => /_is_exclusive_all_portals\.sql$/.test(f));
  assert.ok(file, 'migration file');
  const sql = read(`supabase/migrations/${file}`);
  const statements = sql.split('\n').filter((line) => line.trim() && !line.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(statements, /\b(drop|delete|truncate|update|revoke)\b/i, 'only additive statements run');
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create table public."Fresher Jobs"(id bigint primary key, "Company" text);
      create table public."Semi Qualified Jobs"(id uuid primary key default gen_random_uuid(), "Company" text);
      create table public."Articleship Jobs"(id integer primary key, "Company" text);
      grant select (id, "Company") on public."Fresher Jobs", public."Articleship Jobs" to anon;
      grant select (id, "Company") on public."Semi Qualified Jobs" to anon;
      insert into "Fresher Jobs" values (1, 'Acme'); insert into "Articleship Jobs" values (2, 'Firm');
      insert into "Semi Qualified Jobs"("Company") values ('Co');`);
    await db.exec(sql);
    await db.exec(sql);
    for (const table of ['Fresher Jobs', 'Semi Qualified Jobs', 'Articleship Jobs']) {
      const col = await db.query(`select data_type, is_nullable, column_default from information_schema.columns where table_name = $1 and column_name = 'is_exclusive'`, [table]);
      assert.deepEqual(col.rows[0], { data_type: 'boolean', is_nullable: 'NO', column_default: 'false' }, table);
      await db.exec('set role anon');
      const rows = await db.query(`select id, is_exclusive from "${table}"`);
      assert.equal(rows.rows.length, 1, table);
      assert.equal(rows.rows[0].is_exclusive, false, `${table}: existing rows are not exclusive`);
      await db.exec('reset role');
    }
  } finally {
    await db.close();
  }
});
