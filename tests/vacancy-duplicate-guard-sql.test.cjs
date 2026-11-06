// Vacancy duplicate guard (supabase/migrations/202611060002_vacancy_duplicate_guard.sql). Dependency: @electric-sql/pglite.
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202611060002_vacancy_duplicate_guard.sql'),'utf8');
let db;
after(async()=>{ if(db) await db.close(); });

async function setup(){
 db=new PGlite();
 await db.exec(`
  create table public."Industrial Training Job Portal"(id serial primary key,"Company" text,"Created_At" timestamptz default now(),posts_link text,is_exclusive boolean);
  create table public."Fresher Jobs"(id serial primary key,"Company" text,"Created_At" timestamptz default now(),posts_link text);
  create table public."Semi Qualified Jobs"(id uuid primary key default gen_random_uuid(),"Company" text,"Created_At" timestamptz default now(),posts_link text);
  create table public."Articleship Jobs"(id serial primary key,"Company" text,"Created_At" timestamptz default now(),posts_link text);`);
 await db.exec(migration);
 await db.exec(migration);           // idempotent
}
const key=async(link)=>(await db.query('select public.msc_vacancy_key($1) k',[link])).rows[0].k;
const count=async(t)=>(await db.query(`select count(*)::int n from public."${t}"`)).rows[0].n;

test('keys normalise the same job across link forms',async()=>{
 await setup();
 assert.equal(await key('https://in.linkedin.com/jobs/view/analyst-at-ey-4466063675?trk=public_jobs'),'li-job:4466063675');
 assert.equal(await key('https://www.linkedin.com/jobs/view/4466063675/'),'li-job:4466063675');
 assert.equal(await key('https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4466063675'),'li-job:4466063675');
 assert.equal(await key('https://www.linkedin.com/feed/update/urn:li:activity:7330988768578920448/'),'li-post:7330988768578920448');
 assert.equal(await key('https://www.linkedin.com/posts/riya_hiring-activity-7330988768578920448-Je01'),'li-post:7330988768578920448');
 assert.equal(await key('https://lnkd.in/p/g9hRJRxY'),'lnkd:p/g9hRJRxY');
 assert.equal(await key('https://www.naukri.com/job-listings-ca-industrial-trainee-renew-gurugram-0-to-1-years-031125012345'),'naukri:031125012345');
 assert.equal(await key('https://careers.ey.com/ey/job/Hyderabad-Industrial-Trainee/1454958233/?utm_source=x'),'url:careers.ey.com/ey/job/hyderabad-industrial-trainee/1454958233');
 assert.equal(await key(null),null);
});

test('a scraped duplicate is skipped in any table; team posts and new jobs are saved',async()=>{
 await db.exec(`insert into public."Fresher Jobs"("Company",posts_link) values ('EY','https://www.linkedin.com/jobs/view/4466063675/')`);
 // same LinkedIn job with tracking codes, into the same table and into another table: both skipped
 await db.exec(`insert into public."Fresher Jobs"("Company",posts_link) values ('EY','https://in.linkedin.com/jobs/view/x-4466063675?trk=y')`);
 await db.exec(`insert into public."Semi Qualified Jobs"("Company",posts_link) values ('EY','https://www.linkedin.com/jobs/view/4466063675')`);
 assert.equal(await count('Fresher Jobs'),1);
 assert.equal(await count('Semi Qualified Jobs'),0);
 // a different job is saved
 await db.exec(`insert into public."Fresher Jobs"("Company",posts_link) values ('KPMG','https://www.linkedin.com/jobs/view/4466069999/')`);
 assert.equal(await count('Fresher Jobs'),2);
 // team-posted vacancies (no posts_link) are never blocked, even when identical
 await db.exec(`insert into public."Industrial Training Job Portal"("Company",posts_link) values ('HSBC',null),('HSBC',null)`);
 assert.equal(await count('Industrial Training Job Portal'),2);
 // an old copy (over 60 days) does not block a new posting
 await db.exec(`insert into public."Articleship Jobs"("Company",posts_link,"Created_At") values ('BSR','https://lnkd.in/p/abcdEF12', now() - interval '70 days')`);
 await db.exec(`insert into public."Articleship Jobs"("Company",posts_link) values ('BSR','https://lnkd.in/p/abcdEF12')`);
 assert.equal(await count('Articleship Jobs'),2);
 // ...but a third copy inside 60 days is skipped
 await db.exec(`insert into public."Articleship Jobs"("Company",posts_link) values ('BSR','https://lnkd.in/p/abcdEF12')`);
 assert.equal(await count('Articleship Jobs'),2);
 // a RETURNING insert of a skipped duplicate returns no row (the poster reads this as "duplicate")
 const r=await db.query(`insert into public."Fresher Jobs"("Company",posts_link) values ('EY','https://www.linkedin.com/jobs/view/4466063675/') returning id`);
 assert.equal(r.rows.length,0);
});
