// Structured vacancy filter columns: the trigger that fills them, the backfill and read access.
// Dependency: @electric-sql/pglite.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '..');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/202611060001_job_filter_fields.sql'), 'utf8');
const backfill = fs.readFileSync(path.join(root, 'supabase/migrations/202611060002_job_filter_fields_backfill.sql'), 'utf8');

let db;
after(async () => { if (db) await db.close(); });

const BASE = '"Company" text, "Location" text, "Salary" bigint, "Description" text, "Created_At" timestamptz default now(), "Application ID" text, posted_by text, hirer_email text';

async function freshDB({ withRows = false } = {}) {
  if (db) await db.close();
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create table "Articleship Jobs"(id bigserial primary key, ${BASE}, "Firm Type" text, "Exposure Tags" text[]);
    create table "Industrial Training Job Portal"(id bigserial primary key, ${BASE}, "Company Type" text, is_exclusive boolean);
    create table "Fresher Jobs"(id bigserial primary key, ${BASE}, "Experience" text, yoe integer, "Company Type" text);
    create table "Semi Qualified Jobs"(id uuid primary key default gen_random_uuid(), ${BASE}, "Experience" text, "Company Type" text);
    grant select (id, "Company", "Location", "Salary", "Description", "Created_At") on "Articleship Jobs" to anon;
  `);
  if (withRows) {
    await db.query(`insert into "Articleship Jobs"("Company","Location","Description","Created_At") values ($1,$2,$3,'2026-11-05')`,
      ['Nangia & Co LLP', 'Mumbai', 'Statutory audit and GST exposure. Stipend: ₹10,000 per month. Transfer cases accepted.']);
  }
  await db.exec(migration);
  await db.exec(migration); // idempotent
  return db;
}

async function insert(table, row) {
  const cols = Object.keys(row);
  const res = await db.query(
    `insert into "${table}"(${cols.map(c => `"${c}"`).join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')}) returning *`,
    cols.map(c => row[c]));
  return res.rows[0];
}

const day = v => (v ? new Date(v).toISOString().slice(0, 10) : v);

test('Industrial Training: Final attempt window, duration, exam criteria, stipend, joining, deadline, apply method', async () => {
  await freshDB();
  const job = await insert('Industrial Training Job Portal', {
    Company: 'DBS Bank Limited', Location: 'Mumbai', Created_At: '2026-11-05T10:00:00Z',
    Description: [
      '📢 Industrial Training opportunity at DBS Bank in the Treasury domain.',
      '📋 Eligibility: CA Intermediate (both groups) cleared in first attempt.',
      '✅ CA Final Attempt: May 2028 or later',
      '⏳ Duration: 9-12 months',
      '💰 Stipend: ₹40,000 per month (₹60,000 for rank holders)',
      '🕒 Joining: Immediate',
      'Last date: 15 November 2026',
      'Share your CV at trainee.hiring@example.com. Skills: Excel, SAP.'
    ].join('\n')
  });
  assert.equal(day(job.attempt_from), '2028-05-01');
  assert.equal(job.attempt_to, null);
  assert.equal(job.duration_min_months, 9);
  assert.equal(job.duration_max_months, 12);
  assert.deepEqual(job.exam_criteria, ['First attempt', 'Rank holder']);
  assert.equal(job.pay_min, 40000);
  assert.equal(job.pay_max, 60000);
  assert.equal(job.immediate_joining, true);
  assert.equal(day(job.deadline), '2026-11-15');
  assert.deepEqual(job.apply_methods, ['Email']);
  assert.equal(job.employer_type, 'Bank / NBFC');
  assert.deepEqual(job.tools, ['Excel', 'SAP']);
  assert.equal(job.company_key, 'dbs bank');
});

test('Industrial Training: two named attempts give a closed window; joining month is read', async () => {
  await freshDB();
  const job = await insert('Industrial Training Job Portal', {
    Company: 'ITC Limited', Location: 'Kolkata', Created_At: '2026-11-05T10:00:00Z', 'Company Type': 'Listed Company',
    Description: 'Eligibility: CA Final attempt in September 2027 or January 2028.\nTenure of Industrial Training should be at least 11 months.\nJoining in December 2026.\nInterested candidates may also apply via forms.gle/abc'
  });
  assert.equal(day(job.attempt_from), '2027-09-01');
  assert.equal(day(job.attempt_to), '2028-01-01');
  assert.equal(job.duration_min_months, 11);
  assert.equal(job.duration_max_months, null);
  assert.equal(day(job.joining_month), '2026-12-01');
  assert.equal(job.employer_type, 'Listed Company');
  assert.deepEqual(job.apply_methods, ['Form / link']);
});

test('Articleship: Inter, ITT & OC, transfer, firm size, exposure, clients, travel, year-wise stipend', async () => {
  await freshDB();
  const job = await insert('Articleship Jobs', {
    Company: 'T R Chadha & Co LLP', Location: 'Mumbai', Created_At: '2026-11-05T10:00:00Z',
    Description: [
      'Eligibility: CA Inter Both Groups Completed (ITT & OC completed). Transfer cases accepted.',
      'Exposure: Statutory audit, tax audit, income tax returns, GST, bank audits and ROC filings for listed clients and startups.',
      'Willingness to travel for outstation audits.',
      '💰 Stipend: 1st year ₹10,000/month, 2nd year ₹12,000/month, 3rd year ₹15,000/month',
      'Working days: Monday to Saturday. WhatsApp 98765 43210.'
    ].join('\n')
  });
  assert.equal(job.inter_requirement, 'Both groups required');
  assert.equal(job.itt_oc_required, true);
  assert.equal(job.transfer_accepted, true);
  assert.equal(job.firm_size, 'Big 10');
  assert.deepEqual(job.exposure_areas, ['Statutory Audit', 'Tax Audit', 'Direct Tax', 'GST', 'Bank Audit', 'ROC & Company Law']);
  assert.deepEqual(job.client_types, ['Listed & MNC clients', 'Banks & NBFCs', 'Startups']);
  assert.equal(job.outstation_audits, true);
  assert.equal(job.pay_min, 10000);
  assert.equal(job.pay_max, 15000);
  assert.equal(job.working_days, 6);
  assert.deepEqual(job.apply_methods, ['WhatsApp / call']);
  assert.equal(job.company_key, 't r chadha');
});

test('Articleship: firm size from partner count, single group, Big 4 by name', async () => {
  await freshDB();
  const mid = await insert('Articleship Jobs', { Company: 'A B Shah & Associates', Description: 'A firm of 7 partners. CA Inter (Group I or both) cleared students can apply.' });
  assert.equal(mid.firm_size, 'Mid-size CA Firm');
  assert.equal(mid.inter_requirement, 'Single group accepted');
  const big4 = await insert('Articleship Jobs', { Company: 'S R Batliboi & Co LLP', Description: 'Assurance articleship.' });
  assert.equal(big4.firm_size, 'Big 4');
  const other = await insert('Articleship Jobs', { Company: 'Gupta Associates', Description: 'Articleship in Delhi.' });
  assert.equal(other.firm_size, 'Other');
});

test('CA Fresher: qualifying attempt window, CTC range, work type, shift, mode, company key', async () => {
  await freshDB();
  const job = await insert('Fresher Jobs', {
    Company: 'EY GDS', Location: 'Bengaluru', Experience: 'Freshers', Created_At: '2026-11-05T10:00:00Z',
    Description: 'EY GDS is hiring CA freshers (May 2025 – May 2026 pass-outs).\nCTC: ₹8–12 LPA\nWork on US GAAP reporting for US clients in the UK shift.\nHybrid working. Notice period: 30 days.'
  });
  assert.equal(day(job.attempt_from), '2025-05-01');
  assert.equal(day(job.attempt_to), '2026-05-01');
  assert.equal(job.pay_min, 800000);
  assert.equal(job.pay_max, 1200000);
  assert.ok(job.work_types.includes('US / UK accounting'));
  assert.ok(job.work_types.includes('US GAAP / IFRS'));
  assert.equal(job.shift, 'US / UK shift');
  assert.equal(job.work_mode, 'Hybrid');
  assert.equal(job.notice_days, 30);
  assert.equal(job.employer_type, 'Big 4');
  assert.equal(job.company_key, 'ey');
  assert.equal(job.yoe, 0);
});

test('Experienced CA: PQE, tools, notice; an existing yoe is kept', async () => {
  await freshDB();
  const blank = await insert('Fresher Jobs', { Company: 'Acme', Experience: 'Experienced', Description: 'CA with 5-8 years of experience in FP&A.' });
  assert.equal(blank.yoe, 5);
  const job = await insert('Fresher Jobs', {
    Company: 'Accenture in India', Experience: 'Experienced', yoe: 8,
    Description: 'Qualified CA with 5-8 years of post-qualification experience. SAP, Power BI and Excel. Immediate joiners or notice period up to 60 days.'
  });
  assert.equal(job.yoe, 8);
  assert.equal(job.pqe_required, true);
  assert.deepEqual(job.tools, ['Excel', 'SAP', 'Power BI']);
  assert.equal(job.notice_days, 60);
  assert.equal(job.company_key, 'accenture');
});

test('Semi-Qualified: years of experience, tools, working days, monthly salary turned yearly', async () => {
  await freshDB();
  const job = await insert('Semi Qualified Jobs', {
    Company: 'PriVantage Consulting', Location: 'Noida', Experience: 'Experienced',
    Description: '⭐ Requirements:\n• 3+ years of relevant experience\n• Hands-on knowledge of Tally & Advanced Excel\n📅 Working Days: 6 Days\n💰 Salary: ₹25,000 per month\nRemote role.'
  });
  assert.equal(job.yoe, 3);
  assert.deepEqual(job.tools, ['Excel', 'Tally']);
  assert.equal(job.working_days, 6);
  assert.equal(job.pay_min, 300000);
  assert.equal(job.work_mode, 'Remote');
});

test('values set by the poster are kept, and the Salary column wins over text', async () => {
  await freshDB();
  const job = await insert('Articleship Jobs', {
    Company: 'Deloitte', Salary: 12000, Description: 'Stipend ₹9,000 per month. Transfer cases accepted.'
  });
  assert.equal(job.pay_min, 12000);
  const explicit = await db.query(`insert into "Articleship Jobs"("Company","Description",firm_size,transfer_accepted) values ('X & Co','Transfer cases accepted.','Mid-size CA Firm',false) returning firm_size, transfer_accepted`);
  assert.equal(explicit.rows[0].firm_size, 'Mid-size CA Firm');
  assert.equal(explicit.rows[0].transfer_accepted, false);
});

test('editing the text works the values out again, but keeps what the edit itself sets and the posted yoe', async () => {
  await freshDB();
  const job = await insert('Fresher Jobs', { Company: 'Acme', Experience: 'Experienced', yoe: 4, Description: 'Remote role. Last date: 20 November 2026. Tally.', Created_At: '2026-11-05T10:00:00Z' });
  assert.equal(job.work_mode, 'Remote');
  assert.equal(day(job.deadline), '2026-11-20');
  const edited = (await db.query(`update "Fresher Jobs" set "Description" = 'Hybrid role. Last date: 25 November 2026. SAP.', shift = 'Day' where id = $1 returning *`, [job.id])).rows[0];
  assert.equal(edited.work_mode, 'Hybrid');
  assert.equal(day(edited.deadline), '2026-11-25');
  assert.deepEqual(edited.tools, ['SAP']);
  assert.equal(edited.shift, 'Day', 'set by the edit');
  assert.equal(edited.yoe, 4, 'posted yoe kept');
  const other = (await db.query(`update "Fresher Jobs" set "Experience" = 'Experienced' where id = $1 returning work_mode`, [job.id])).rows[0];
  assert.equal(other.work_mode, 'Hybrid', 'unrelated edits leave the values alone');
});

test('a posted Company Type or Firm Type wins, and maps to the filter labels', async () => {
  await freshDB();
  const cases = [['Investment Bank', 'Investment Bank'], ['Private Equity', 'PE / VC Fund'], ['Developer', null], ['Bank/NBFC', 'Bank / NBFC'],
    ['GCC', 'Global Capability Centre (GCC)'], ['PSU', 'Government / PSU'], ['Other', 'Other'], ['Consulting Firm', 'Consulting']];
  for (const [ctype, expected] of cases) {
    const job = await insert('Industrial Training Job Portal', { Company: 'Some Co', 'Company Type': ctype, Description: 'Finance role.' });
    assert.equal(job.employer_type, expected, ctype);
  }
  const art = await insert('Articleship Jobs', { Company: 'Deloitte', 'Firm Type': 'Mid-size CA Firm', Description: 'x' });
  assert.equal(art.firm_size, 'Mid-size CA Firm');
});

test('a monthly figure in a yearly Salary column is made yearly', async () => {
  await freshDB();
  const job = await insert('Semi Qualified Jobs', { Company: 'X', Salary: 35000, Description: 'Accounts executive.' });
  assert.equal(job.pay_min, 420000);
});

test('pay ignores years, PIN codes, foreign currency and client turnover', async () => {
  await freshDB();
  const sq = await insert('Semi Qualified Jobs', { Company: 'X', Description: 'Office: Pune 411027. Salary: AED 4,000 per month.\nFounded in 2012.' });
  assert.equal(sq.pay_min, null);
  const art = await insert('Articleship Jobs', { Company: 'Y & Co', Description: 'Clients with turnover ₹50,000 crore.\nStipend as per ICAI norms.' });
  assert.equal(art.pay_min, null);
});

test('a parser failure never blocks a posting', async () => {
  await freshDB();
  await db.exec(`create or replace function public.job_filter_extract(tbl text, r jsonb) returns jsonb language plpgsql as $$ begin raise exception 'boom'; end $$;`);
  const job = await insert('Fresher Jobs', { Company: 'Z', Description: 'Freshers' });
  assert.equal(job.Company, 'Z');
  assert.equal(job.company_key, null);
});

test('backfill fills old rows without touching their text; anon can read the new columns', async () => {
  await freshDB({ withRows: true });
  let row = (await db.query(`select * from "Articleship Jobs"`)).rows[0];
  assert.equal(row.firm_size, null); // posted before the trigger existed
  await db.exec(`begin; ${backfill}; commit;`);
  row = (await db.query(`select * from "Articleship Jobs"`)).rows[0];
  assert.equal(row.firm_size, 'Big 10');
  assert.equal(row.transfer_accepted, true);
  assert.equal(row.pay_min, 10000);
  assert.deepEqual(row.exposure_areas, ['Statutory Audit', 'GST']);
  assert.equal(row.Description, 'Statutory audit and GST exposure. Stipend: ₹10,000 per month. Transfer cases accepted.');
  await db.exec('set role anon');
  try {
    const r = await db.query(`select id, firm_size, pay_min, exposure_areas, transfer_accepted from "Articleship Jobs"`);
    assert.equal(r.rows.length, 1);
    await assert.rejects(db.query(`select "Application ID" from "Articleship Jobs"`), /permission denied/);
  } finally {
    await db.exec('reset role');
  }
});

test('company keys match between the database and the browser', async () => {
  await freshDB();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msc-job-filters-'));
  const copy = path.join(dir, 'job-filters.mjs');
  fs.copyFileSync(path.join(root, 'scripts', 'job-filters.js'), copy);
  const { normalizeCompanyKey } = await import(pathToFileURL(copy).href);
  const names = ['EY', 'EY India', 'EY GDS', 'Ernst & Young LLP', 'Deloitte USI', 'Deloitte', 'PwC India', 'KPMG Global Services',
    'Accenture in India', 'Accenture', 'Gaurav Gada & Associates', 'T R Chadha & Co. LLP', 'Bharat Petroleum Corporation Limited',
    'Tata Consultancy Services', 'The Hershey Company', 'Nangia & Co LLP', 'BDO India', 'Grant Thornton Bharat', 'H N A & Co LLP', ''];
  for (const name of names) {
    const sql = (await db.query('select public.job_filter_company_key($1) as k', [name])).rows[0].k;
    assert.equal(normalizeCompanyKey(name), sql, name);
  }
});
