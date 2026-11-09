// Articleship portal: exclusive vacancies (pinned, free to apply), firm-review summaries on cards,
// and the 3 banners. Padam, 9 Nov 2026. SQL runs in PGlite; the page logic is checked from source.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const schemaSql = read('supabase/migrations/202611090002_articleship_exclusive_reviews.sql');
const contentSql = read('supabase/migrations/202611090003_articleship_banners_exclusives.sql');
const RECRUIT = '20000000-0000-4000-8000-000000000001';

let db;
after(async () => { if (db) await db.close(); });

async function setup() {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key, email text);
    insert into auth.users values ('${RECRUIT}', 'recruit@mystudentclub.com');
    create table public."Articleship Jobs"(
      id serial primary key, "Company" text, "Job_Title" text, "Location" text, "Category" text,
      "Primary Domain" text, "Firm Type" text, "Exposure Tags" text[], "Salary" bigint, "Stipend Range" text,
      "Description" text, "Application ID" text, hirer_email text, owner_id uuid, posted_by uuid,
      "Employment_Type" text, "Created_At" timestamptz default now(), "Posted_Date" timestamptz);
    create table public."Banners"(id serial primary key, "Image" text, "Hyperlink" text, "Type" text, visible_to_unenrolled boolean);
    insert into public."Banners"("Image", "Hyperlink", "Type") values ('old.png', '/x', 'All');
    create table public.firms(id serial primary key, name text);
    create table public.articleship_firm_reviews(id serial primary key, firm_id int, stipend int, overall_rating smallint,
      stipend_on_time text, personal_leave text, review_text text);
    create view public.articleship_firm_reviews_public as
      select r.id, f.name as firm_name, r.stipend, r.overall_rating, r.stipend_on_time, r.personal_leave, r.review_text
      from public.articleship_firm_reviews r join public.firms f on f.id = r.firm_id;
    grant usage on schema public to anon, authenticated;
    grant select on public.articleship_firm_reviews_public to anon, authenticated;
    grant select ("Company", id) on public."Articleship Jobs" to anon;
  `);
  await db.exec(schemaSql);
  await db.exec(schemaSql); // idempotent
  return db;
}

async function addReview(firm, stipend, rating, onTime, leave) {
  let f = await db.query('select id from firms where name = $1', [firm]);
  const id = f.rows[0]?.id ?? (await db.query('insert into firms(name) values ($1) returning id', [firm])).rows[0].id;
  await db.query('insert into articleship_firm_reviews(firm_id, stipend, overall_rating, stipend_on_time, personal_leave) values ($1,$2,$3,$4,$5)',
    [id, stipend, rating, onTime, leave]);
}

test('firm key: same firm in different spellings, networks with their ICAI firms, look-alikes kept apart', async () => {
  await setup();
  const key = async (n) => (await db.query('select public.msc_firm_key($1) k', [n])).rows[0].k;
  assert.equal(await key('K K & Company'), await key('K K and Co.'));
  assert.equal(await key('M/s K K & Co LLP, Chartered Accountants'), await key('K K & Co.'));
  assert.notEqual(await key('K K & Associates'), await key('K K & Co.'));
  assert.notEqual(await key('Chaturvedi & Shah LLP'), await key('Chaturvedi & Co LLP'));
  for (const [name, net] of [
    ['S.R. Batliboi & Co. LLP', 'net:ey'], ['SRBC & Co LLP', 'net:ey'], ['EY India', 'net:ey'],
    ['B S R & Co. LLP', 'net:kpmg'], ['BSR & Co. LLP', 'net:kpmg'], ['KPMG', 'net:kpmg'],
    ['Deloitte Haskins & Sells LLP', 'net:deloitte'], ['Price Waterhouse & Co (PwC Network)', 'net:pwc'],
    ['Walker Chandiok & Co LLP', 'net:gt'], ['Grant Thornton Bharat', 'net:gt'],
    ['M S K A & Associates', 'net:bdo'], ['BDO India', 'net:bdo'],
    ['Suresh Surana & Associates LLP', 'net:rsm'], ['RSM India', 'net:rsm'],
  ]) assert.equal(await key(name), net, name);
  for (const name of ['Batliboi & Purohit', 'BBSR & Associates', 'RSM & Associates', 'VRSM & Co', 'Chandiok & Guliani']) {
    assert.doesNotMatch(String(await key(name)), /^net:/, name);
  }
  assert.equal(await key(''), null);
});

test('review summaries match spellings, count answers, and are callable by anonymous visitors', async () => {
  await setup();
  await addReview('EY', 15000, 3, 'always', 'easy');
  await addReview('EY', 15000, 2, 'always', 'difficult');
  await addReview('S R Batliboi & Co LLP', 20000, 4, 'sometimes_delayed', 'easy');
  await addReview('K K and Co.', 8000, 5, 'always', null);
  await addReview('K K & Associates', 3000, 1, 'frequently_delayed', 'difficult');
  await db.exec('set role anon');
  const { rows } = await db.query('select * from public.get_firm_review_summaries($1)',
    [['S. R. Batliboi & Co. LLP', 'K K & Company', 'Nobody & Co', '', null]]);
  await db.exec('reset role');
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  assert.equal(rows.length, 2);
  const ey = by['S. R. Batliboi & Co. LLP'];
  assert.equal(ey.review_count, 3);
  assert.equal(Number(ey.avg_overall), 3);
  assert.equal(ey.stipend_median, 15000);
  assert.equal(ey.stipend_on_time, 2);
  assert.equal(ey.stipend_delayed, 1);
  assert.equal(ey.leave_easy, 2);
  assert.equal(ey.firm_name, 'EY');
  const kk = by['K K & Company'];
  assert.equal(kk.review_count, 1, 'K K & Associates is another firm');
  assert.equal(kk.leave_answers, 0);
  assert.ok(!('review_text' in ey), 'no review text is returned');
});

test('content: 3 banners (program web-only, firm review on both portals) and 7 Easy Apply exclusives, safe to rerun', async () => {
  await setup();
  await db.exec(contentSql);
  await db.exec(contentSql);
  const banners = (await db.query(`select "Image", "Hyperlink", "Type", web_only, visible_to_unenrolled from "Banners" where "Image" like '%2026-11%' order by id`)).rows;
  assert.equal(banners.length, 4);
  assert.deepEqual(banners.map(b => [b.Type, b.Hyperlink, b.web_only]), [
    ['Articleship', 'https://www.mystudentclub.com/articleship-program/', true],
    ['Articleship', '/links/?tab=articleship', false],
    ['Articleship', '/submit-review.html', false],
    ['Industrial', '/submit-review.html', false],
  ]);
  for (const b of banners) {
    assert.equal(b.visible_to_unenrolled, null);
    assert.ok(fs.existsSync(path.join(root, b.Image.replace('https://www.mystudentclub.com/', ''))), b.Image);
  }
  assert.equal((await db.query(`select web_only from "Banners" where "Image" = 'old.png'`)).rows[0].web_only, false);

  const jobs = (await db.query(`select * from "Articleship Jobs" where is_exclusive order by "Created_At" desc`)).rows;
  assert.deepEqual(jobs.map(j => j.Company), ['PwC', 'Deloitte', 'KPMG', 'EY', 'BDO India', 'Grant Thornton Bharat', 'RSM India']);
  for (const j of jobs) {
    assert.equal(j.hirer_email, 'recruit@mystudentclub.com', 'Easy Apply');
    assert.equal(j.owner_id, RECRUIT, 'shows on the recruit@ hire.msc dashboard');
    assert.equal(j.posted_by, null, 'no recruiter mail to our own inbox');
    assert.ok(j['Exposure Tags'].length >= 3, `${j.Company}: several domains`);
    assert.ok(j.Location.split(', ').length >= 6, `${j.Company}: several cities`);
    assert.ok(j.Salary >= 7500 && j.Salary <= 20000, `${j.Company}: monthly stipend`);
    assert.match(j['Stipend Range'], /₹/);
    assert.match(j.Description, /\*\*Stipend:\*\* .*₹/);
    assert.match(j.Description, /\*\*Articleship firm \(ICAI\):\*\* /);
    assert.doesNotMatch(j.Description, /guarantee|official|partner(ed|ship) with/i);
    assert.doesNotMatch(j.Description.replace(/\*\*/g, ''), /[_*]/, 'renders cleanly in the job popup');
  }
  assert.deepEqual(Object.fromEntries(jobs.map(j => [j.Company, j['Firm Type']])), {
    PwC: 'Big 4', Deloitte: 'Big 4', KPMG: 'Big 4', EY: 'Big 4', 'BDO India': 'Big 6', 'Grant Thornton Bharat': 'Big 6', 'RSM India': 'Big 10',
  });
});

test('portal: articleship exclusives are free to apply, pinned on top of page 1, and skipped on later pages', () => {
  const src = read('scripts/portal3.js');
  assert.match(src, /function isExclusiveLocked\(job\) \{\n\s+return Boolean\(job && job\.is_exclusive\) && currentTable !== 'Articleship Jobs' && !isEnrolledSync\(currentTable\);/);
  assert.match(src, /const isLocked = isExclusiveLocked\(job\);/);
  assert.match(src, /if \(isExclusiveLocked\(job\)\) \{\n\s+showExclusiveLockedModal\(job\);/);
  assert.doesNotMatch(src, /isExclusive && !isEnrolledSync/);
  assert.match(src, /"Stipend Range", is_exclusive';/);
  assert.match(src, /buildQuery\(selectColumns\)\.eq\('is_exclusive', true\)\.gte\('Created_At', cutoff\)/);
  assert.match(src, /hasMoreData = \(data\.length - pinnedShift\) === limit;/);
  assert.match(src, /data = data\.filter\(job => !pinnedExclusiveIds\.has\(job\.id\)\);/);
  assert.match(src, /runPublicJobSelect\(cols => supabaseClient/);
});

test('portal: review facts line shows only facts most answers agree on, escaped', () => {
  const src = read('scripts/portal3.js');
  const start = src.indexOf('function hasReviewRating(info)');
  const end = src.indexOf('async function fetchFirmRatingsForVisibleJobs');
  const ctx = {};
  vm.runInNewContext(src.slice(start, end) + ';this.f={hasReviewRating,buildReviewFactsHtml,toReviewInfo};', ctx);
  const { hasReviewRating, buildReviewFactsHtml, toReviewInfo } = ctx.f;
  const info = toReviewInfo('EY', { firm_name: 'EY', review_count: 16, avg_overall: '2.6', stipend_median: 15000,
    stipend_answers: 15, stipend_on_time: 12, stipend_delayed: 3, leave_answers: 10, leave_easy: 4, leave_difficult: 5 });
  assert.equal(hasReviewRating(info), true);
  const html = buildReviewFactsHtml(info);
  assert.match(html, /From 16 student reviews: Stipend ~₹15,000 · Stipend paid on time</);
  assert.doesNotMatch(html, /Leave/, 'no leave fact when answers split');
  const delayed = buildReviewFactsHtml(toReviewInfo('X', { review_count: 1, avg_overall: 1, stipend_answers: 1, stipend_delayed: 1, leave_answers: 1, leave_difficult: 1 }));
  assert.match(delayed, /From 1 student review: Stipend delays reported · Leave hard to get/);
  assert.equal(buildReviewFactsHtml(toReviewInfo('None', null)), '');
  assert.equal(hasReviewRating(toReviewInfo('None', null)), false);
  assert.equal(buildReviewFactsHtml({ count: 2, stipendMedian: null, stipendAnswers: 0, leaveAnswers: 0 }), '');
  assert.match(src, /if \(hasReviewRating\(ratingInfo\)\) \{\n\s+\/\/ Show gold star rating badge/);
  assert.match(src, /articleship-firm-review\.html\?firm=\$\{encodeURIComponent\(ratingInfo\.firmName \|\| companyName\)\}/);
  assert.match(src, /supabaseClient\.rpc\('get_firm_review_summaries', \{ p_names: uniqueNames \}\)/);
});
