// PostgreSQL execution tests for the sign-up consent and the portal popup. Dependency: @electric-sql/pglite.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const intakeMigration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202609270001_career_intake.sql'), 'utf8');
const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202611070001_signup_consent_and_portal.sql'), 'utf8');
const A = '20000000-0000-4000-8000-000000000001', B = '20000000-0000-4000-8000-000000000002';
const industrial = { stage: 'industrial-training', attempt_month: 'May', attempt_year: '2026', earliest_joining_date: '2026-11-01', industrial_training_eligibility_date: '2026-10-01' };

let db;
after(async () => { if (db) await db.close(); });
async function fresh() {
  if (db) await db.close();
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
  create table auth.users(id uuid primary key,email text);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
  create table public.profiles(uuid uuid primary key,profile jsonb,looking_for text,updated_at timestamptz,articleship_1yr_end_date date,ca_inter_attempt text,ca_final_attempt text,years_of_experience numeric,earliest_joining_date text,email_id text,mobile_number text);
  create table public.consentform(user_id uuid primary key,cv_sharing_consent boolean,consent_text text,consented_at timestamptz,withdrawn_at timestamptz,updated_at timestamptz,user_agent text);
  create table public.resource_access_logs(id uuid default gen_random_uuid() primary key,name text,email text,phone text,program_type text,program_display text,resource_title text,resource_url text,accessed_at timestamptz);
  insert into auth.users values('${A}','new-a@example.test'),('${B}','new-b@example.test');
  insert into profiles(uuid,profile,mobile_number) values('${A}','{"cv_filename":"Existing CV.pdf","contact_number":"9876543210"}','9876543210');`);
  await db.exec(intakeMigration);
  await db.exec(migration);
  await db.exec(migration); // idempotent
  return db;
}
async function as(roleName, user = '') {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  await db.exec(`set role ${roleName}`);
}
const record = (promotional, version = '2026-11-07') => db.query('select public.record_signup_consent($1,$2) as r', [promotional, version]);
const portal = (stage, details) => db.query('select public.submit_signup_career_intake($1,$2::jsonb,$3::jsonb) as r', [stage, JSON.stringify(details), JSON.stringify({ kind: 'signup-intake' })]);
const asAdmin = () => db.exec('reset role');
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];

test('box ticked: consent recorded with server time and exact wording, marketing flag on, existing profile kept', async () => {
  await fresh();
  await as('authenticated', A);
  assert.deepEqual((await record(true)).rows[0].r, { recorded: true, promotional: true });
  await asAdmin();
  const row = await one('select * from signup_consents where user_id=$1', [A]);
  assert.equal(row.promotional_consent, true);
  assert.equal(row.consent_version, '2026-11-07');
  assert.equal(row.promotional_text, 'Email me about new batches, events, updates and offers.');
  assert.ok(row.recorded_at);
  const profile = (await one('select profile from profiles where uuid=$1', [A])).profile;
  assert.equal(profile.marketing_email_consent, true);
  assert.equal(profile.cv_filename, 'Existing CV.pdf', 'existing profile keys are kept');
});

test('box unticked: recorded as declined and the marketing flag is off', async () => {
  await fresh();
  await as('authenticated', B);
  await record(false);
  await asAdmin();
  assert.equal((await one('select promotional_consent from signup_consents where user_id=$1', [B])).promotional_consent, false);
  assert.equal((await one('select profile from profiles where uuid=$1', [B])).profile.marketing_email_consent, false);
});

test('sign-up never touches recruiter sharing, so the site still asks when a CV is uploaded', async () => {
  await fresh();
  await as('authenticated', B);
  await record(true);
  await asAdmin();
  assert.equal((await one('select count(*)::int n from consentform')).n, 0, 'no consentform row: the CV-upload prompt still appears later');
  const profile = (await one('select profile from profiles where uuid=$1', [B])).profile;
  assert.equal(profile.recruiter_sharing_consent, undefined);
  assert.equal(profile.cv_sharing_consent, undefined);
});

test('first answer wins: a second call changes nothing', async () => {
  await fresh();
  await as('authenticated', B);
  await record(false);
  assert.deepEqual((await record(true)).rows[0].r, { recorded: false, reason: 'already_recorded' });
  await asAdmin();
  assert.equal((await one('select promotional_consent from signup_consents where user_id=$1', [B])).promotional_consent, false);
  assert.equal((await one('select profile from profiles where uuid=$1', [B])).profile.marketing_email_consent, false);
});

test('consent needs a signed-in account and the known wording version; the table is private', async () => {
  await fresh();
  await as('anon');
  await assert.rejects(record(true), /permission denied|Sign in/);
  await as('authenticated', A);
  await assert.rejects(record(true, '2020-01-01'), /Unknown consent version/);
  await record(true);
  assert.equal((await db.query('select * from signup_consents')).rows.length, 1, 'reads own row');
  await as('authenticated', B);
  assert.equal((await db.query('select * from signup_consents')).rows.length, 0, 'cannot read another account');
  await assert.rejects(db.query('insert into signup_consents values($1,true,$2,$3,now())', [B, '2026-11-07', 'x']), /permission denied/);
  await as('anon');
  await assert.rejects(db.query('select * from signup_consents'), /permission denied/);
});

test('portal popup answers save without phone or consent, map into the profile, and keep the existing phone', async () => {
  await fresh();
  await as('authenticated', A);
  const saved = (await portal('industrial-training', { ...industrial, phone: '1111111111', sharing_consent: true, email: 'spoof@example.test' })).rows[0].r;
  assert.equal(saved.saved, true);
  await asAdmin();
  const intake = await one('select * from career_intakes where user_id=$1', [A]);
  assert.equal(intake.stage, 'industrial-training');
  assert.equal(intake.consent_version, 'signup');
  assert.equal(intake.details.email, 'new-a@example.test', 'email comes from the account, not the form');
  assert.equal(intake.details.phone, undefined, 'no phone from this path');
  assert.equal(intake.details.sharing_consent, undefined, 'no consent from this path');
  assert.equal(intake.details.collected_via, 'signup');
  const profileRow = await one('select * from profiles where uuid=$1', [A]);
  assert.equal(profileRow.profile.portal_type, 'industrial');
  assert.equal(profileRow.profile.earliest_joining_date, '2026-11-01');
  assert.equal(profileRow.ca_final_attempt, 'May 2026');
  assert.equal(profileRow.looking_for, 'CA Industrial Training Default');
  assert.equal(profileRow.profile.contact_number, '9876543210', 'existing phone kept');
  assert.equal(profileRow.mobile_number, '9876543210', 'existing phone column kept');
  assert.equal(profileRow.profile.marketing_email_consent, undefined, 'the popup never sets consent');
  assert.equal((await one('select count(*)::int n from resource_access_logs')).n, 0, 'no resource log');
  assert.equal((await one('select count(*)::int n from consentform')).n, 0, 'no consent written');
});

test('portal popup keeps the same stage validation as the resource form', async () => {
  await fresh();
  await as('authenticated', A);
  await assert.rejects(portal('nonsense', industrial), /Invalid career s/);
  await assert.rejects(portal('industrial-training', { ...industrial, attempt_month: 'January' }), /.+/);
  await assert.rejects(portal('industrial-training', { ...industrial, earliest_joining_date: '' }), /Joining date is required/);
  await assert.rejects(portal('ca-fresher', { attempt_month: 'May', attempt_year: '2026' }), /Current status is required/);
  await as('anon');
  await assert.rejects(portal('industrial-training', industrial), /permission denied/);
});

test('popup answers never replace a category already completed with consent through a resource form', async () => {
  await fresh();
  await as('authenticated', A);
  await db.query('select public.submit_career_intake($1,$2::jsonb,$3::jsonb)', ['ca-fresher', JSON.stringify({ name: 'A', email: 'x@example.test', phone: '9999999999', sharing_consent: true, consent_version: '2026-09-27', status: 'Qualified', attempt_month: 'May', attempt_year: '2026' }), JSON.stringify({ kind: 'resource' })]);
  const kept = (await portal('ca-fresher', { status: 'Yet to Appear', attempt_month: 'November', attempt_year: '2027' })).rows[0].r;
  assert.equal(kept.kept_existing, true);
  await asAdmin();
  const intake = await one("select * from career_intakes where user_id=$1 and stage='ca-fresher'", [A]);
  assert.equal(intake.consent_version, '2026-09-27');
  assert.equal(intake.details.status, 'Qualified');
});

test('a student can correct their own popup answers', async () => {
  await fresh();
  await as('authenticated', B);
  await portal('articleship', { status: 'Cleared one group', attempt_month: 'September', attempt_year: '2026' });
  await portal('articleship', { status: 'Cleared CA Intermediate Both Groups', attempt_month: 'January', attempt_year: '2027' });
  await asAdmin();
  const rows = (await db.query('select details from career_intakes where user_id=$1', [B])).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].details.status, 'Cleared CA Intermediate Both Groups');
});

test('the migration is additive: the resource-form function and existing tables are untouched', () => {
  const code = migration.replace(/--.*$/gm, '').toLowerCase();
  assert.ok(!code.includes('function public.submit_career_intake('), 'submit_career_intake must not be redefined');
  assert.ok(!/alter\s+table\s+public\.(consentform|profiles|career_intakes)/.test(code), 'no existing table altered');
  assert.ok(!code.includes('consentform'), 'sign-up never writes recruiter consent');
  assert.ok(!/\b(drop\s+table|delete\s+from|truncate)\b/.test(code), 'nothing destructive');
});
