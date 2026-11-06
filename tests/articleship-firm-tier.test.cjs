// Articleship firm filter (6 Nov 2026): "Firm Type" was blank on every vacancy, so Big 4 / Big 6 / Big 10 matched
// nothing. supabase/migrations/202611060003_articleship_firm_tier.sql sets it from the firm's name.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/202611060003_articleship_firm_tier.sql'), 'utf8');
const portal = fs.readFileSync(path.join(root, 'scripts/portal3.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'ca-articleship-opportunities.html'), 'utf8');
let db;
after(async () => { if (db) await db.close(); });

async function getDb() {
  if (db) return db;
  db = new PGlite();
  await db.exec(`create table public."Articleship Jobs" (id bigint primary key, "Company" text, "Firm Type" text);
    insert into "Articleship Jobs" values (1, 'EY India', null), (2, 'Walker Chandiok & Co LLP', ''),
      (3, 'Nangia & Co LLP', null), (4, 'Sharma & Associates', null), (5, 'Deloitte', 'Mid-size CA Firm');`);
  await db.exec(migration);
  await db.exec(migration); // idempotent
  return db;
}
const tier = async (name) => (await (await getDb()).query('select public.msc_firm_tier($1) t', [name])).rows[0].t;

test('Big 4, including their Indian network firms', async () => {
  for (const n of ['EY', 'EY India', 'Ernst & Young', 'S. R. Batliboi & Co. LLP', 'SRBC & Co LLP', 'S R B C & CO LLP',
    'Deloitte', 'Deloitte Haskins & Sells LLP', 'KPMG India', 'B S R & Co. LLP', 'BSR & Co LLP',
    'PwC', 'Price Waterhouse & Affiliates', 'Price WaterHouse Chartered Accountants'])
    assert.equal(await tier(n), 'Big 4', n);
});

test('Big 6 and Big 10', async () => {
  for (const n of ['Grant Thornton Bharat LLP', 'Walker Chandiok & Co. LLP', 'BDO India', 'BDO India Services Pvt. Ltd.'])
    assert.equal(await tier(n), 'Big 6', n);
  for (const n of ['RSM India', 'Nangia & Co LLP', 'Nangia Andersen', 'Baker Tilly ASA India LLP', 'ASA & Associates LLP', 'ASA', 'ASA Bakertilly', 'Nexdigm'])
    assert.equal(await tier(n), 'Big 10', n);
});

test('look-alike names stay blank', async () => {
  for (const n of ['Batliboi & Purohit', 'RSM & ASSOCIATES, CA', 'VRSM & Co.', 'BBSR & Associates LLP', 'BSRS & Associates',
    'Chandiok & Guliani', 'TransPrice Tax Advisors', 'Key Associates', 'Sharma & Associates', '', null])
    assert.equal(await tier(n), null, String(n));
});

test('existing rows are filled, a hand-picked value is kept, new and renamed rows follow the name', async () => {
  const d = await getDb();
  const ft = async (id) => (await d.query('select "Firm Type" f from "Articleship Jobs" where id = $1', [id])).rows[0].f;
  assert.equal(await ft(1), 'Big 4');
  assert.equal(await ft(2), 'Big 6');
  assert.equal(await ft(3), 'Big 10');
  assert.equal(await ft(4), null);
  assert.equal(await ft(5), 'Mid-size CA Firm'); // chosen by hand: never overwritten
  await d.query(`insert into "Articleship Jobs" (id, "Company") values (6, 'KPMG')`);
  assert.equal(await ft(6), 'Big 4');
  await d.query(`update "Articleship Jobs" set "Company" = 'BDO India' where id = 6`);
  assert.equal(await ft(6), 'Big 6');
  await d.query(`update "Articleship Jobs" set "Company" = 'EY' where id = 5`);
  assert.equal(await ft(5), 'Mid-size CA Firm');
});

test('the filter is cumulative and offers only options that can match', () => {
  assert.match(portal, /'Big 6': \['Big 4', 'Big 6'\]/);
  assert.match(portal, /'Big 10': \['Big 4', 'Big 6', 'Big 10'\]/);
  assert.match(portal, /if \(tiers\) q = q\.in\('Firm Type', tiers\);/);
  assert.match(portal, /else if \(state\.firmType === 'Other'\) q = q\.is\('Firm Type', null\);/);
  assert.doesNotMatch(page, /Mid-size CA Firm|Small-size CA Firm/);
  assert.equal((page.match(/<option value="Other">Other firms<\/option>/g) || []).length, 2);
});
