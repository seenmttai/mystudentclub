// Articleship firm filter (6 Nov 2026): "Firm Type" was blank on every vacancy, so the Firm Type filter matched
// nothing. supabase/migrations/202611060003_articleship_firm_tier.sql gives every vacancy one tier:
// Big 4 / Big 6 / Big 10 / Big 20 by name, Small-size when the firm calls itself small, else Mid-size.
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
  await db.exec(`create table public."Articleship Jobs" (id bigint primary key, "Company" text, "Description" text, "Firm Type" text);
    insert into "Articleship Jobs" values (1, 'EY India', 'Audit', null), (2, 'Walker Chandiok & Co LLP', '', ''),
      (3, 'Nangia & Co LLP', null, null), (4, 'Sharma & Associates', 'We audit SMEs', null),
      (5, 'Deloitte', 'x', 'Mid-size CA Firm'), (7, 'Gupta & Co', 'Join a small traditional CA firm', '  '),
      (9, 'T R Chadha & Co LLP', null, null);`);
  await db.exec(migration);
  await db.exec(migration); // idempotent
  return db;
}
const type = async (company, description = '') =>
  (await (await getDb()).query('select public.msc_firm_type($1, $2) t', [company, description])).rows[0].t;

test('Big 4, including their Indian network firms', async () => {
  for (const n of ['EY', 'EY India', 'Ernst & Young', 'S. R. Batliboi & Co. LLP', 'SRBC & Co LLP', 'S R B C & CO LLP',
    'Deloitte', 'Deloitte Haskins & Sells LLP', 'KPMG India', 'B S R & Co. LLP', 'BSR & Co LLP',
    'PwC', 'Price Waterhouse & Affiliates', 'Price WaterHouse Chartered Accountants'])
    assert.equal(await type(n), 'Big 4', n);
});

test('Big 6, Big 10 and Big 20', async () => {
  for (const n of ['Grant Thornton Bharat LLP', 'Walker Chandiok & Co. LLP', 'BDO India', 'MSKA & Associates'])
    assert.equal(await type(n), 'Big 6', n);
  for (const n of ['RSM India', 'Suresh Surana & Associates LLP', 'Nangia & Co LLP', 'Nangia Andersen', 'Baker Tilly ASA India LLP',
    'ASA & Associates LLP', 'ASA', 'ASA Bakertilly', 'Nexdigm'])
    assert.equal(await type(n), 'Big 10', n);
  for (const n of ['T R Chadha & Co LLP', 'T.R. Chadha & Co', 'Forvis Mazars', 'Haribhakti & Co LLP', 'Kirtane & Pandit LLP',
    'Moore Singhi', 'Singhi & Co.', 'Sharp & Tannan', 'CNK & Associates LLP', 'Chaturvedi & Shah LLP', 'KNAV', 'PKF Sridhar & Santhanam LLP', 'Crowe India'])
    assert.equal(await type(n), 'Big 20', n);
});

test('Small-size only when the firm calls itself small; everything else is Mid-size', async () => {
  for (const d of ['M J R & Associates, a small but dynamic Chartered Accountancy firm, is looking', 'Join a small traditional CA firm',
    "We're small and close-knit by design", 'A small, close-knit team means real ownership'])
    assert.equal(await type('M J R & Associates', d), 'Small-size CA Firm', d);
  for (const d of ['We serve small and mid-sized corporates', 'We work with small firms, large organizations', 'good exposure in a small to mid-size firm',
    'part of a small team', 'Audit of Small Finance Banks', '', null])
    assert.equal(await type('Mehta & Co', d), 'Mid-size CA Firm', String(d));
  // look-alike names are not Big firms
  for (const n of ['Desai Haribhakti & Co.', 'Batliboi & Purohit', 'RSM & ASSOCIATES, CA', 'VRSM & Co.', 'BBSR & Associates LLP', 'Chandiok & Guliani', 'Key Associates'])
    assert.equal(await type(n), 'Mid-size CA Firm', n);
  assert.equal(await type(''), null);
  assert.equal(await type(null), null);
});

test('existing rows are filled, a hand-picked value is kept, new and edited rows follow name and description', async () => {
  const d = await getDb();
  const ft = async (id) => (await d.query('select "Firm Type" f from "Articleship Jobs" where id = $1', [id])).rows[0].f;
  assert.equal(await ft(1), 'Big 4');
  assert.equal(await ft(2), 'Big 6');
  assert.equal(await ft(3), 'Big 10');
  assert.equal(await ft(9), 'Big 20');
  assert.equal(await ft(4), 'Mid-size CA Firm');
  assert.equal(await ft(7), 'Small-size CA Firm');
  assert.equal(await ft(5), 'Mid-size CA Firm'); // chosen by hand: never overwritten
  await d.query(`insert into "Articleship Jobs" (id, "Company", "Description") values (6, 'KPMG', 'x')`);
  assert.equal(await ft(6), 'Big 4');
  await d.query(`update "Articleship Jobs" set "Company" = 'BDO India' where id = 6`);
  assert.equal(await ft(6), 'Big 6');
  await d.query(`update "Articleship Jobs" set "Company" = 'Mehta & Co', "Description" = 'We are a small CA firm' where id = 6`);
  assert.equal(await ft(6), 'Small-size CA Firm');
  await d.query(`update "Articleship Jobs" set "Company" = 'EY' where id = 5`);
  assert.equal(await ft(5), 'Mid-size CA Firm'); // hand-picked stays
  await d.query(`update "Articleship Jobs" set "Firm Type" = '' where id = 1`);
  assert.equal(await ft(1), 'Big 4'); // cleared by hand: filled again
  await d.query(`insert into "Articleship Jobs" (id, "Company", "Firm Type") values (8, 'Mehta & Co', '')`);
  assert.equal(await ft(8), 'Mid-size CA Firm');
});

test('the filter offers the six tiers, Big tiers are cumulative, cards skip the default Mid-size pill', () => {
  assert.match(portal, /'Big 6': \['Big 4', 'Big 6'\]/);
  assert.match(portal, /'Big 20': \['Big 4', 'Big 6', 'Big 10', 'Big 20'\]/);
  assert.match(portal, /q = tiers \? q\.in\('Firm Type', tiers\) : q\.eq\('Firm Type', state\.firmType\);/);
  assert.match(portal, /firmType && firmType !== MID_SIZE_FIRM \?/);
  for (const v of ['Big 4', 'Big 6', 'Big 10', 'Big 20', 'Mid-size CA Firm', 'Small-size CA Firm'])
    assert.equal((page.match(new RegExp(`<option value="${v}">`, 'g')) || []).length, 2, v);
  assert.doesNotMatch(page, /value="Other"/);
});
