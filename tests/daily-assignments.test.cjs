// Daily assignments (MSC-26): page helpers, plus the migration's permissions on PGlite.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');
const DA = require('../scripts/daily-assignments.js');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/202611020001_daily_assignments.sql'), 'utf8');

const items = [
  { id: 'a', city: 'Pune', state: 'Maharashtra', work_type: 'Stock audit', start_date: '2026-11-10', end_date: '2026-11-11' },
  { id: 'b', city: 'nagpur ', state: 'Maharashtra', work_type: 'Bank branch audit', start_date: '2026-11-05', end_date: '2026-11-05' },
  { id: 'c', city: 'Indore', state: 'Madhya Pradesh', work_type: 'Stock audit', start_date: '2026-11-01', end_date: '2026-11-01' },
  { id: 'd', city: 'Pune', state: 'Maharashtra', work_type: 'Other', start_date: '2026-11-12', end_date: '2026-11-12', status: 'hidden' },
];
const today = '2026-11-02';

test('location filter matches city text or a whole state, and hides ended or hidden rows', () => {
  const ids = (f) => DA.filterAssignments(items, f, today).map((a) => a.id);
  assert.deepEqual(ids({}), ['b', 'a']);
  assert.deepEqual(ids({ location: ' PUNE' }), ['a']);
  assert.deepEqual(ids({ location: 'maharashtra' }), ['b', 'a']);
  assert.deepEqual(ids({ location: 'Maharash' }), ['b', 'a']);
  assert.deepEqual(ids({ location: 'Indore' }), []);
  assert.deepEqual(ids({ workType: 'Bank branch audit' }), ['b']);
});

test('saved places narrow the list only when no single place is typed', () => {
  const ids = (f) => DA.filterAssignments(items, f, today).map((a) => a.id);
  assert.deepEqual(ids({ places: ['Nagpur'] }), ['b']);
  assert.deepEqual(ids({ places: ['Nagpur'], location: 'pune' }), ['a']);
  assert.deepEqual(ids({ places: ['Goa'] }), []);
});

test('places are de-duplicated, title-cased, capped and survive bad storage', () => {
  let places = DA.addPlace([], 'navi  mumbai');
  places = DA.addPlace(places, 'Navi Mumbai');
  places = DA.addPlace(places, '');
  assert.deepEqual(places, ['Navi Mumbai']);
  assert.deepEqual(DA.removePlace(places, 'NAVI MUMBAI'), []);
  assert.deepEqual(DA.parsePlaces('not json'), []);
  assert.deepEqual(DA.parsePlaces('{"a":1}'), []);
  assert.equal(DA.parsePlaces(JSON.stringify(Array.from({ length: 20 }, (_, i) => `City ${i}`))).length, 12);
  const store = { v: null, getItem() { return this.v; }, setItem(_k, v) { this.v = v; } };
  DA.savePlaces(store, ['pune', 'Pune', 'Surat']);
  assert.deepEqual(DA.loadPlaces(store), ['Pune', 'Surat']);
  assert.deepEqual(DA.loadPlaces({ getItem() { throw new Error('blocked'); } }), []);
});

test('dates, pay and the application row are formatted for the card and the database', () => {
  assert.equal(DA.formatDates('2026-11-05', '2026-11-05'), '5 Nov · 1 day');
  assert.equal(DA.formatDates('2026-11-30', '2026-12-02'), '30 Nov – 2 Dec · 3 days');
  assert.equal(DA.formatPay(1500, 'per day'), '₹1,500 per day');
  assert.equal(DA.formatPay(5000, 'total'), '₹5,000 total');
  assert.equal(DA.formatPay(null), 'Pay on discussion');
  assert.deepEqual(DA.applicationRow('x', { currentLocation: '  Pune ', payOk: 'yes', doneBefore: '', note: '' }),
    { assignment_id: 'x', current_location: 'Pune', pay_ok: true, done_before: null, note: null });
  assert.equal(DA.applicationRow('x', { note: 'n'.repeat(2000) }).note.length, 1000);
  assert.deepEqual(DA.cityOptions(items), ['Indore', 'Nagpur', 'Pune']);
});

test('the page loads the shared client and helpers, escapes data and sends logged-out students to login', () => {
  const html = fs.readFileSync(path.join(root, 'daily-assignments.html'), 'utf8');
  assert.match(html, /<script src="\/scripts\/supabase-init\.js"><\/script>/);
  assert.match(html, /<script src="\/scripts\/daily-assignments\.js"><\/script>/);
  assert.doesNotMatch(html, /createClient\(/);
  assert.match(html, /login\.html\?redirect=/);
  assert.match(html, /\$\{esc\(a\.title\)\}/);
});

const A = '10000000-0000-4000-8000-00000000000a';
const B = '10000000-0000-4000-8000-00000000000b';
let db;
before(async () => { await setup(); });
after(async () => { if (db) await db.close(); });

async function setup() {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    insert into auth.users values ('${A}'), ('${B}');`);
  await db.exec(migration);
  await db.exec(migration); // idempotent
  await db.exec(`insert into daily_assignments (id, firm_name, title, work_type, city, start_date, end_date, apply_email, status) values
    ('20000000-0000-4000-8000-000000000001','Firm One','Stock audit','Stock audit','Pune',current_date+1,current_date+2,'firm@example.test','open'),
    ('20000000-0000-4000-8000-000000000002','Firm Two','Old audit','Stock audit','Pune',current_date-5,current_date-4,null,'open'),
    ('20000000-0000-4000-8000-000000000003','Firm Three','Closed audit','Other','Pune',current_date+1,current_date+1,null,'closed');`);
}
async function as(roleName, user = '') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec(`set role ${roleName}`);
}

test('SQL: anyone sees only open, current assignments and never the firm email', async () => {
  await as('anon');
  const rows = (await db.query('select id, title from daily_assignments')).rows;
  assert.deepEqual(rows.map((r) => r.title), ['Stock audit']);
  await assert.rejects(db.query('select apply_email from daily_assignments'), /permission denied/);
  await assert.rejects(db.query("insert into daily_assignments (firm_name,title,work_type,city,start_date,end_date) values ('x','yyy','Other','Pune',current_date,current_date)"), /permission denied/);
  await assert.rejects(db.query("insert into daily_assignment_applications (assignment_id) values ('20000000-0000-4000-8000-000000000001')"), /permission denied/);
});

test('SQL: a student applies once for themselves, only to open ones, and sees only their own', async () => {
  await as('authenticated', A);
  await db.query("insert into daily_assignment_applications (assignment_id, current_location, pay_ok) values ('20000000-0000-4000-8000-000000000001','Pune',true)");
  await assert.rejects(db.query("insert into daily_assignment_applications (assignment_id) values ('20000000-0000-4000-8000-000000000001')"), /duplicate key|unique/);
  await assert.rejects(db.query("insert into daily_assignment_applications (assignment_id) values ('20000000-0000-4000-8000-000000000002')"), /row-level security/);
  await assert.rejects(db.query("insert into daily_assignment_applications (assignment_id) values ('20000000-0000-4000-8000-000000000003')"), /row-level security/);
  await assert.rejects(db.query(`insert into daily_assignment_applications (assignment_id, user_id) values ('20000000-0000-4000-8000-000000000001','${B}')`), /permission denied/);
  await assert.rejects(db.query("update daily_assignment_applications set pay_ok=false"), /permission denied/);
  assert.equal((await db.query('select * from daily_assignment_applications')).rows.length, 1);
  await as('authenticated', B);
  assert.equal((await db.query('select * from daily_assignment_applications')).rows.length, 0);
  await db.exec('reset role');
  assert.equal((await db.query(`select user_id from daily_assignment_applications`)).rows[0].user_id, A);
});
