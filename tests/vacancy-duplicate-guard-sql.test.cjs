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
 // job ids in the query string stay distinct; tracking parameters are dropped
 assert.equal(await key('https://careers.acme.com/job?jobId=101&utm_source=li'),'url:careers.acme.com/job?jobid=101');
 assert.notEqual(await key('https://careers.acme.com/job?jobId=101'),await key('https://careers.acme.com/job?jobId=202'));
 assert.equal(await key('https://careers.acme.com/job/?trk=x&jobId=101#apply'),'url:careers.acme.com/job?jobid=101');
});

const ins=(t,co,link,extra='')=>db.exec(`insert into public."${t}"("Company",posts_link${extra?',"Created_At"':''}) values ('${co}',${link===null?'null':`'${link}'`}${extra?`,${extra}`:''})`);
const DUP=/duplicate vacancy/;

test('a scraped duplicate is rejected in any table; team posts and new jobs are saved',async()=>{
 await ins('Fresher Jobs','EY','https://www.linkedin.com/jobs/view/4466063675/');
 // same LinkedIn job with tracking codes, into the same table and into another table: both rejected
 await assert.rejects(ins('Fresher Jobs','EY','https://in.linkedin.com/jobs/view/x-4466063675?trk=y'),DUP);
 await assert.rejects(ins('Semi Qualified Jobs','EY','https://www.linkedin.com/jobs/view/4466063675'),DUP);
 assert.equal(await count('Fresher Jobs'),1);
 assert.equal(await count('Semi Qualified Jobs'),0);
 // the error is a unique_violation, so writers can tell it apart from other failures
 await assert.rejects(ins('Fresher Jobs','EY','https://www.linkedin.com/jobs/view/4466063675/'),e=>e.code==='23505');
 // a different job is saved
 await ins('Fresher Jobs','KPMG','https://www.linkedin.com/jobs/view/4466069999/');
 assert.equal(await count('Fresher Jobs'),2);
 // team-posted vacancies (no posts_link) are never blocked, even when identical
 await ins('Industrial Training Job Portal','HSBC',null);
 await ins('Industrial Training Job Portal','HSBC',null);
 assert.equal(await count('Industrial Training Job Portal'),2);
 // an old copy (over 60 days) does not block a new posting...
 await ins('Articleship Jobs','BSR','https://lnkd.in/p/abcdEF12',"now() - interval '70 days'");
 await ins('Articleship Jobs','BSR','https://lnkd.in/p/abcdEF12');
 assert.equal(await count('Articleship Jobs'),2);
 // ...but a third copy inside 60 days is rejected
 await assert.rejects(ins('Articleship Jobs','BSR','https://lnkd.in/p/abcdEF12'),DUP);
 assert.equal(await count('Articleship Jobs'),2);
 // two different jobs on a site that keeps the job id in the query string are both saved
 await ins('Fresher Jobs','Acme','https://careers.acme.com/job?jobId=101');
 await ins('Fresher Jobs','Acme','https://careers.acme.com/job?jobId=202&utm_source=li');
 assert.equal(await count('Fresher Jobs'),4);
});

test('updates: changing posts_link to a saved job is rejected; editing a row in place is not',async()=>{
 // a row can be edited (its own link unchanged, or re-saved as the same link) without tripping the guard
 await db.exec(`update public."Fresher Jobs" set "Company"='KPMG India' where posts_link='https://www.linkedin.com/jobs/view/4466069999/'`);
 await db.exec(`update public."Fresher Jobs" set posts_link='https://www.linkedin.com/jobs/view/4466069999?trk=x' where "Company"='KPMG India'`);
 // pointing a row at another saved job's link is rejected
 await assert.rejects(db.exec(`update public."Fresher Jobs" set posts_link='https://www.linkedin.com/jobs/view/4466063675/' where "Company"='KPMG India'`),DUP);
 // filling in a link that is new is fine
 await ins('Semi Qualified Jobs','Team post',null);
 await db.exec(`update public."Semi Qualified Jobs" set posts_link='https://www.linkedin.com/jobs/view/4466070000/' where "Company"='Team post'`);
 assert.equal((await db.query(`select count(*)::int n from public."Semi Qualified Jobs" where posts_link is not null`)).rows[0].n,1);
});
