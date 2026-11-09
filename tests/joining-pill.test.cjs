// Joining pill (6 Nov 2026, Aniket): Industrial Training cards show when the trainee must join ("Immediate Joiner",
// "Nov Joinee"), read from the description by supabase/migrations/202611060002_it_joining_label.sql.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611060002_it_joining_label.sql'), 'utf8');
const portal = fs.readFileSync(path.join(__dirname, '../scripts/portal3.js'), 'utf8');
let db;
after(async () => { if (db) await db.close(); });

async function getDb() {
  if (db) return db;
  db = new PGlite();
  await db.exec(`create table public."Industrial Training Job Portal" (id bigint primary key, "Company" text, "Description" text);
    insert into "Industrial Training Job Portal" values (1, 'A', 'Joining by: Immediate'), (2, 'B', 'Join our team');`);
  await db.exec(migration);
  await db.exec(migration); // idempotent
  return db;
}
const label = async (d) => (await (await getDb()).query('select public.msc_joining_label($1) l', [d])).rows[0].l;

test('immediate joining in its usual wordings', async () => {
  for (const d of ['⏳ Immediate Joiner Preferred', 'Joining by: Immediate', '📅 Joining: Immediately',
    '**Joining by** - Immediate Joining', 'Immediate/early joiners preferred', 'is there some one who can join within a week',
    'Joining by: Immediate, latest by 14 November 2026', 'TATA 1mg | Immediate Joiners Only'])
    assert.equal(await label(d), 'Immediate Joiner', d);
});

test('month of joining becomes "<Mon> Joinee"', async () => {
  assert.equal(await label('Joining: Latest by 20 November 2026'), 'Nov Joinee');
  assert.equal(await label('Expected joining: Last week of October 2026'), 'Oct Joinee');
  assert.equal(await label('Joining by: From mid-December 2026 onwards'), 'Dec Joinee');
  assert.equal(await label('Joining in September, this role is ideal'), 'Sep Joinee');
  assert.equal(await label('• Start Date: Mid-October 2026'), 'Oct Joinee');
  assert.equal(await label('with joining from January 2027.'), 'Jan Joinee');
  assert.equal(await label('available to join by the 2nd week of Sep 2026'), 'Sep Joinee');
  assert.equal(await label('eligible to join by end of Sept 2026'), 'Sep Joinee');
});

test('no pill when the joining time is not stated', async () => {
  for (const d of ['', null, 'Join our team in Mumbai', 'Please include your earliest date of joining',
    'prior to joining, with plans to appear for CA Final examinations in May 2028', 'Join the core team. Stipend 30k.',
    'Joining: you may apply now'])
    assert.equal(await label(d), null, String(d));
});

test('trigger keeps the label in step with the description, existing rows are filled', async () => {
  const d = await getDb();
  const row = async (id) => (await d.query('select joining_label l from "Industrial Training Job Portal" where id = $1', [id])).rows[0].l;
  assert.equal(await row(1), 'Immediate Joiner');
  assert.equal(await row(2), null);
  await d.query(`insert into "Industrial Training Job Portal" values (3, 'C', 'Joining: December 2026')`);
  assert.equal(await row(3), 'Dec Joinee');
  await d.query(`update "Industrial Training Job Portal" set "Description" = 'Immediate joiners preferred' where id = 3`);
  assert.equal(await row(3), 'Immediate Joiner');
  await d.query(`insert into "Industrial Training Job Portal" (id, "Company", "Description", joining_label) values (4, 'D', 'Join us', 'Fake')`);
  assert.equal(await row(4), null);
});

test('Industrial Training list and shared links load the label; card and popup show it', () => {
  assert.equal((portal.match(/"Technology Tags", is_exclusive, joining_label'/g) || []).length, 2);
  assert.match(portal, /const joiningLabel = currentTable === 'Industrial Training Job Portal' \? \(job\.joining_label \|\| ''\) : '';/);
  assert.equal((portal.match(/class="job-tag tag-joining"/g) || []).length, 2);
});
