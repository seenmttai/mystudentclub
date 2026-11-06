// MSCIT stipend matcher (6 Nov 2026): blank Industrial Training stipends are filled from the hiring list.
// Runs supabase/migrations/202611060001_mscit_stipend_matcher.sql on PGlite.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611060001_mscit_stipend_matcher.sql'), 'utf8');
let db;
after(async () => { if (db) await db.close(); });

async function setup() {
  if (db) await db.close();
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public."Industrial Training Job Portal" (id bigint primary key, "Company" text, "Location" text,
      "Salary" bigint, "Stipend Range" text);
    insert into "Industrial Training Job Portal" values
      (1, 'Wipro Ltd.', 'Bengaluru', null, null),
      (2, 'DBS', 'Pune', 40000, '₹40,000 / month'),
      (3, 'Oil and Natural Gas Corporation Limited (ONGC)', 'Mumbai', null, ''),
      (4, 'HSBC', 'Pune, Maharashtra', null, null),
      (5, 'HSBC', 'Kolkata', null, null),
      (6, 'Rubrik', 'Bengaluru', null, null),
      (7, 'Walmart Global Tech India', 'Bengaluru', null, null),
      (8, 'Zepto', 'Bengaluru', null, null),
      (9, 'Mahindra & Mahindra Financial Services Limited', 'Mumbai', null, null);`);
  await db.exec(migration);
  await db.exec(migration); // idempotent
}

const sheet = [
  { company: 'Wipro', location: 'Bengaluru', stipend: '30000' },
  { company: 'DBS Bank India Limited', location: 'Pune', stipend: '50,000' },
  { company: 'ONGC', location: '', stipend: '₹ 25,000/-' },
  { company: 'HSBC', location: 'Pune', stipend: '35000' },
  { company: 'HSBC', location: 'Hyderabad', stipend: '45000' },
  { company: 'Rubrik', location: 'Bengaluru', stipend: '1,00,000' },
  { company: 'Walmart Global Tech', location: 'Bengaluru', stipend: '25k - 30k' },
  { company: 'Zepto', location: 'Bengaluru', stipend: 'NA' },
  { company: 'Mahindra and Mahindra Financial Services Pvt Ltd', location: 'Mumbai', stipend: '20000' },
  { company: '', location: 'x', stipend: '1' },
];

async function sync(rows) {
  await db.exec('reset role; set role service_role');
  try { return (await db.query('select public.sync_mscit_hiring_stipends($1::jsonb) as r', [JSON.stringify(rows)])).rows[0].r; }
  finally { await db.exec('reset role'); }
}
const job = async (id) => (await db.query('select * from "Industrial Training Job Portal" where id = $1', [id])).rows[0];

test('company keys ignore case, punctuation and legal suffixes', async () => {
  await setup();
  const key = async (n) => (await db.query('select public.msc_company_key($1) k', [n])).rows[0].k;
  assert.equal(await key('Wipro Ltd.'), 'wipro');
  assert.equal(await key('Mahindra & Mahindra Financial Services Limited'), 'mahindra and mahindra financial services');
  assert.equal(await key('Walmart Global Tech India'), 'walmart global tech');
  assert.equal(await key('The Pvt Ltd'), null);
});

test('fills blank stipends only, from the matching company and location', async () => {
  await setup();
  const r = await sync(sheet);
  assert.equal(r.list_rows, 8); // blank company and "NA" dropped
  const w = await job(1);
  assert.equal(w['Stipend Range'], '₹30,000 / month'); assert.equal(Number(w.Salary), 30000); assert.equal(w.stipend_source, 'mscit_list');
  const d = await job(2); // posted with a stipend: untouched
  assert.equal(d['Stipend Range'], '₹40,000 / month'); assert.equal(d.stipend_source, null);
  assert.equal((await job(3))['Stipend Range'], '₹25,000 / month'); // matched on the bracketed short name
  assert.equal((await job(4))['Stipend Range'], '₹35,000 / month'); // location picks Pune's row
  assert.equal((await job(5))['Stipend Range'], null); // two stipends, no location match: not guessed
  assert.equal((await job(6))['Stipend Range'], '₹1,00,000 / month');
  const wm = await job(7); assert.equal(wm['Stipend Range'], '25k - 30k'); assert.equal(wm.Salary, null);
  assert.equal((await job(8))['Stipend Range'], null);
  assert.equal((await job(9))['Stipend Range'], '₹20,000 / month');
  assert.equal(r.jobs_filled, 6);
});

test('a filled row is never changed again, and an empty sheet read is refused', async () => {
  await setup();
  await sync(sheet);
  await db.exec(`update "Industrial Training Job Portal" set "Stipend Range" = '₹32,000 / month', "Salary" = 32000 where id = 1`);
  const r = await sync([{ company: 'Wipro', location: 'Bengaluru', stipend: '99000' }]);
  assert.equal(r.jobs_filled, 0);
  assert.equal((await job(1))['Stipend Range'], '₹32,000 / month');
  await assert.rejects(sync([]), /refusing to clear/);
  await db.exec('reset role');
  assert.equal((await db.query('select count(*)::int n from mscit_hiring_stipends')).rows[0].n, 1);
});

test('students cannot read the list or run the matcher', async () => {
  await setup();
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`reset role; set role ${role}`);
    await assert.rejects(db.query('select * from public.mscit_hiring_stipends'), /permission denied/);
    await assert.rejects(db.query(`select public.sync_mscit_hiring_stipends('[{"company":"x","stipend":"1"}]')`), /permission denied/);
    await assert.rejects(db.query('select public.fill_it_stipends_from_mscit_list()'), /permission denied/);
  }
  await db.exec('reset role');
});
