// One location style (6 Nov 2026): "Noida" next to "Hyderabad, Telangana, India" became the city only.
// Runs supabase/migrations/202611060004_job_location_city_only.sql on PGlite, and the city-alias filter in the pages.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');

const root = path.join(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/202611060004_job_location_city_only.sql'), 'utf8');
const TABLES = ['Industrial Training Job Portal', 'Articleship Jobs', 'Fresher Jobs', 'Semi Qualified Jobs'];
let db;
after(async () => { if (db) await db.close(); });

async function getDb() {
  if (db) return db;
  db = new PGlite();
  await db.exec('create role anon; create role authenticated;');
  for (const t of TABLES) await db.exec(`create table public."${t}" (id bigint primary key, "Location" text);`);
  await db.exec(`insert into "Fresher Jobs" values (1, 'Hyderabad, Telangana, India'), (2, 'Noida'), (3, 'gurgaon'), (4, null);
    insert into "Industrial Training Job Portal" values (1, 'Bengaluru, Karnataka, India (On-site)');`);
  await db.exec(migration);
  await db.exec(migration); // idempotent
  return db;
}
const clean = async (v) => (await (await getDb()).query('select public.msc_clean_location($1) c', [v])).rows[0].c;

test('state, country and work-mode suffixes are dropped; one name per city', async () => {
  const cases = {
    'Hyderabad, Telangana, India': 'Hyderabad', 'Noida': 'Noida', 'Noida, Uttar Pradesh, India': 'Noida',
    'Bengaluru, Karnataka, India (On-site)': 'Bengaluru', 'Bangalore': 'Bengaluru', 'Bangalore Urban, Karnataka, India': 'Bengaluru',
    'Gurgaon, Haryana': 'Gurugram', 'gurgaon': 'Gurugram', 'DELHI': 'Delhi', 'New Delhi, Delhi, India': 'Delhi',
    'Mumbai Metropolitan Region': 'Mumbai', 'Mumbai (All Areas)': 'Mumbai', 'Greater Hyderabad Area': 'Hyderabad',
    'Pune Division, Maharashtra, India': 'Pune', 'Pune/Pimpri-Chinchwad Area': 'Pune', 'Bengaluru East, Karnataka, India': 'Bengaluru',
    'Hybrid - Gurugram': 'Gurugram', 'Delhi / NCR': 'Delhi NCR', 'Navi Mumbai, Maharashtra, India': 'Navi Mumbai',
    'Sahibzada Ajit Singh Nagar, Punjab, India': 'Mohali',
  };
  for (const [raw, want] of Object.entries(cases)) assert.equal(await clean(raw), want, raw);
});

test('remote, several cities, states and places abroad', async () => {
  assert.equal(await clean('India (Remote)'), 'Remote');
  assert.equal(await clean('Remote (India)'), 'Remote');
  assert.equal(await clean('Work From Home'), 'Remote');
  assert.equal(await clean('Bengaluru, Karnataka, India (Remote)'), 'Bengaluru, Remote');
  assert.equal(await clean('Mumbai & Pune'), 'Mumbai, Pune');
  assert.equal(await clean('Bengaluru/Hyderabad'), 'Bengaluru, Hyderabad');
  assert.equal(await clean('Mumbai, Mumbai Suburban, Mumbai (All Areas)'), 'Mumbai');
  assert.equal(await clean('Andheri, Mumbai, India'), 'Andheri, Mumbai');
  assert.equal(await clean('Maharashtra, India'), 'Maharashtra');
  assert.equal(await clean('India'), 'India');
  assert.equal(await clean('Pan India'), 'Pan India');
  assert.equal(await clean('Dubai, UAE'), 'Dubai, UAE');
  assert.equal(await clean('PUNE'), 'Pune');            // review: short all-caps city names are not country codes
  assert.equal(await clean('GOA'), 'Goa');
  assert.equal(await clean('Salt Lake City'), 'Salt Lake City'); // review: suffixes only after a major city
  assert.equal(await clean('Pune City, Maharashtra, India'), 'Pune');
  assert.equal(await clean('Mumbai Suburban'), 'Mumbai');
  assert.equal(await clean(null), null);
  assert.equal(await clean(''), '');
});

test('existing rows are cleaned with a backup; new and edited rows are cleaned by the trigger', async () => {
  const d = await getDb();
  const loc = async (t, id) => (await d.query(`select "Location" l from "${t}" where id = $1`, [id])).rows[0].l;
  assert.equal(await loc('Fresher Jobs', 1), 'Hyderabad');
  assert.equal(await loc('Fresher Jobs', 3), 'Gurugram');
  assert.equal(await loc('Industrial Training Job Portal', 1), 'Bengaluru');
  const backup = (await d.query('select table_name, row_id, location from job_location_backup_20261106 order by 1, 2')).rows;
  assert.deepEqual(backup, [
    { table_name: 'Fresher Jobs', row_id: '1', location: 'Hyderabad, Telangana, India' },
    { table_name: 'Fresher Jobs', row_id: '3', location: 'gurgaon' },
    { table_name: 'Industrial Training Job Portal', row_id: '1', location: 'Bengaluru, Karnataka, India (On-site)' },
  ]); // unchanged rows (Noida, null) are not copied
  for (const t of TABLES) {
    await d.query(`insert into "${t}" values (100, 'Pune, Maharashtra, India')`);
    assert.equal(await loc(t, 100), 'Pune', t);
    await d.query(`update "${t}" set "Location" = 'Gurgaon, Haryana, India' where id = 100`);
    assert.equal(await loc(t, 100), 'Gurugram', t);
  }
  await d.exec('set role anon');
  await assert.rejects(d.query('select * from job_location_backup_20261106'), /permission denied/);
  await d.exec('reset role');
});

test('city filter also searches the other name of a city (portal and jobs by email)', () => {
  for (const file of ['portal3.js', 'portal-email.js']) {
    const source = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    const start = source.indexOf('const CITY_ALIASES');
    const end = source.indexOf('\n}\n', source.indexOf('function expandLocationTerms', start)) + 2;
    const ctx = {};
    vm.runInNewContext(`${source.slice(start, end)}; this.fn = expandLocationTerms;`, ctx);
    assert.deepEqual([...ctx.fn(['Bangalore'])], ['Bangalore', 'bengaluru'], file);
    assert.deepEqual([...ctx.fn(['Gurugram', 'Noida'])], ['Gurugram', 'gurgaon', 'Noida'], file);
    assert.deepEqual([...ctx.fn(['Delhi'])], ['Delhi', 'new delhi'], file);
    assert.match(source, /expandLocationTerms\(state\.locations\)/, file);
  }
});

