// PostgreSQL execution and permission tests. Dependency: @electric-sql/pglite.
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202609270001_career_intake.sql'),'utf8');
const A='10000000-0000-4000-8000-000000000001',B='10000000-0000-4000-8000-000000000002';
const base={name:'Test Member',email:'anonymous@example.test',phone:'9999999999',sharing_consent:true,consent_version:'2026-09-27',status:'Qualified',attempt_month:'May',attempt_year:'2026'};
let sharedDB;
after(async()=>{ if(sharedDB) await sharedDB.close(); });
async function createDB(profileType='jsonb',uuidType='uuid'){
 const db=sharedDB || new PGlite();
 if(sharedDB) await db.exec('reset role;drop schema auth cascade;drop schema public cascade;drop role anon;drop role authenticated;create schema public;grant usage on schema public to public;');
 sharedDB=db;
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;
 create table public.profiles(uuid ${uuidType} primary key,profile ${profileType},looking_for text,updated_at timestamptz,articleship_1yr_end_date date,ca_inter_attempt text,ca_final_attempt text,years_of_experience numeric,earliest_joining_date text,email_id text,mobile_number text);
 create table public.consentform(user_id uuid primary key,cv_sharing_consent boolean,consent_text text,consented_at timestamptz,withdrawn_at timestamptz,updated_at timestamptz,user_agent text);
 create table public.resource_access_logs(id uuid default gen_random_uuid() primary key,name text,email text,phone text,program_type text,program_display text,resource_title text,resource_url text,accessed_at timestamptz);
 insert into auth.users values('${A}','verified-a@example.test'),('${B}','verified-b@example.test');
 insert into profiles(uuid,profile) values('${A}','{"cv_filename":"Existing CV.pdf","preferred_locations":"Mumbai"}');`);
 try { await db.exec(migration);await db.exec(migration);return db; } catch(error) { console.error('Migration error:',error.message); await db.exec('rollback'); throw error; }
}
async function role(db,name,user='') {await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${name}`);}
async function submit(db,stage,details,source={kind:'resource',title:'Test CV',url:'/assets/Test.docx'}) {return db.query('select public.submit_career_intake($1,$2::jsonb,$3::jsonb) as result',[stage,JSON.stringify(details),JSON.stringify(source)]);}

test('migration runs idempotently; anon intake saves and cannot read or mutate stored leads',async()=>{
 const db=await createDB();try{
  await role(db,'anon');const saved=await submit(db,'ca-fresher',base);assert.equal(saved.rows[0].result.saved,true);
  await assert.rejects(db.query('select * from public.career_intakes'),/permission denied/);
  await assert.rejects(db.query("delete from public.career_intakes"),/permission denied/);
  await role(db,'postgres');const result=await db.query('select user_id,details,consent_at from career_intakes');
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].user_id,null);assert.equal(result.rows[0].details.email,base.email);assert.match(result.rows[0].details.consent_text,/sharing my profile with recruiters/);
  assert.equal((await db.query('select count(*)::integer n from resource_access_logs')).rows[0].n,1);
 }finally{await db.exec('reset role');}
});

test('authenticated writes use auth identity, merge profile, upsert per category and isolate account reads',async()=>{
 const db=await createDB();try{
  await role(db,'authenticated',A);await submit(db,'ca-fresher',{...base,email:'spoof@example.test'});
  await submit(db,'ca-fresher',{...base,name:'Updated Name'});
  await submit(db,'industrial-training',{...base,earliest_joining_date:'2026-11-01',industrial_training_eligibility_date:'2026-10-01'});
  let own=await db.query('select stage,details from career_intakes order by stage');assert.equal(own.rows.length,2);assert.equal(own.rows[0].details.email,'verified-a@example.test');
  await role(db,'authenticated',B);assert.equal((await db.query('select * from career_intakes')).rows.length,0);
  await submit(db,'articleship',{...base,status:'Cleared one group',attempt_month:'September'});assert.equal((await db.query('select * from career_intakes')).rows.length,1);
  await assert.rejects(db.query('update career_intakes set stage=$1',['other']),/permission denied/);
  await role(db,'postgres');const profile=(await db.query('select * from profiles where uuid=$1',[A])).rows[0];
  assert.equal(profile.profile.cv_filename,'Existing CV.pdf');assert.equal(profile.profile.preferred_locations,'Mumbai');assert.equal(profile.profile.name,'Test Member');assert.equal(profile.profile.ca_final_app_year,'2026');assert.equal(profile.looking_for,'CA Industrial Training Default');
  assert.equal(profile.ca_final_attempt,'May 2026');assert.equal(new Date(profile.articleship_1yr_end_date).toISOString().slice(0,10),'2026-10-01');assert.equal(profile.profile.cv_sharing_consent,true);
  const consent=(await db.query('select * from consentform where user_id=$1',[A])).rows[0];assert.equal(consent.cv_sharing_consent,true);assert.equal(consent.withdrawn_at,null);assert.match(consent.consent_text,/relevant opportunities and updates via email/);
 }finally{await db.exec('reset role');}
});

test('server validates consent, stages, attempts, status, dates and experience',async()=>{
 const db=await createDB();try{
  await role(db,'anon');
  for(const details of [{...base,sharing_consent:false},{...base,consent_version:null}])await assert.rejects(submit(db,'ca-fresher',details),/Explicit consent/);
  await assert.rejects(submit(db,null,base),/Invalid career stage/);
  await assert.rejects(submit(db,'ca-fresher',{...base,attempt_year:'2023'}),/Invalid exam year/);
  await assert.rejects(submit(db,'ca-fresher',{...base,attempt_month:'September'}),/Invalid exam month/);
  await assert.rejects(submit(db,'articleship',{...base,status:'bad'}),/Current status/);
  await assert.rejects(submit(db,'industrial-training',{...base,earliest_joining_date:'2026-11-01'}),/Eligibility date/);
  await assert.rejects(submit(db,'industrial-training',{...base,earliest_joining_date:'2099-11-01',industrial_training_eligibility_date:'2026-10-01'}),/Invalid joining date/);
  await assert.rejects(submit(db,'semi-qualified',{...base,status:'Paused',earliest_joining_date:'2026-11-01',experience_type:'other',experience_years:'1',experience_months:'12'}),/Invalid experience/);
  await submit(db,'semi-qualified',{...base,status:'Paused',earliest_joining_date:'2026-11-01',experience_type:'fresher'});
  await submit(db,'experienced-ca',{...base,attempt_month:'January',attempt_year:'2002',earliest_joining_date:'2026-11-01',experience_years:'24',experience_months:'1'});
  await submit(db,'other',{...base,other_stage:'Finance student'},{kind:'tool',title:'CV Reviewer'});
  await role(db,'postgres');assert.equal((await db.query('select count(*)::integer n from career_intakes')).rows[0].n,3);
 }finally{await db.exec('reset role');}
});

test('resource log failure rolls back the intake atomically',async()=>{
 const db=await createDB();try{
  await db.exec("alter table resource_access_logs add constraint reject_test check(program_type <> 'semi-qualified')");
  await role(db,'anon');await assert.rejects(submit(db,'semi-qualified',{...base,status:'Paused',earliest_joining_date:'2026-11-01',experience_type:'fresher'}),/reject_test/);
  await role(db,'postgres');assert.equal((await db.query('select count(*)::integer n from career_intakes')).rows[0].n,0);
 }finally{await db.exec('reset role');}
});

test('legacy JSON profile and text account column variants remain compatible',async()=>{
 const db=await createDB('json','text');try{
  await role(db,'authenticated',A);await submit(db,'ca-fresher',base);
  await role(db,'postgres');assert.equal((await db.query('select profile from profiles where uuid=$1',[A])).rows[0].profile.name,base.name);
 }finally{await db.exec('reset role');}
});


test('recruiter experience filters retain year/month precision and explicit consent can be withdrawn and renewed',async()=>{
 const db=await createDB();try{
  await db.query('insert into consentform(user_id,cv_sharing_consent,withdrawn_at) values($1,false,now())',[A]);
  await role(db,'authenticated',A);await submit(db,'experienced-ca',{...base,attempt_month:'November',attempt_year:'2001',earliest_joining_date:'2026-11-01',experience_years:'8',experience_months:'6'});
  await role(db,'postgres');const row=(await db.query('select * from profiles where uuid=$1',[A])).rows[0];
  assert.equal(Number(row.years_of_experience),8.5);assert.equal(row.profile.emp_exp_years,'8');assert.equal(row.profile.emp_exp_months,'6');assert.equal(row.profile.ca_final_clear_month,'Nov');assert.equal(row.profile.ca_final_status,'Qualified');
  const renewed=(await db.query('select cv_sharing_consent,withdrawn_at from consentform where user_id=$1',[A])).rows[0];assert.equal(renewed.cv_sharing_consent,true);assert.equal(renewed.withdrawn_at,null);
  await db.query('update consentform set cv_sharing_consent=false,withdrawn_at=now() where user_id=$1',[A]);
  assert.equal((await db.query('select cv_sharing_consent from consentform where user_id=$1',[A])).rows[0].cv_sharing_consent,false);
 }finally{await db.exec('reset role');}
});

test('incompatible required schemas are rejected before creating new tables',async()=>{
 const db=await createDB();try{
  await db.exec('drop table career_intakes;alter table consentform drop column consent_text;');
  await assert.rejects(db.exec(migration),/requires existing app columns: consentform.consent_text/);await db.exec('rollback');
  assert.equal((await db.query("select to_regclass('public.career_intakes') as table_name")).rows[0].table_name,null);
 }finally{await db.exec('reset role');}
});

test('numeric attempt-count columns are preserved while other compatible recruiter fields update',async()=>{
 const db=await createDB();try{
  await db.exec('alter table profiles alter column ca_final_attempt type integer using null;alter table profiles alter column ca_inter_attempt type integer using null;alter table profiles alter column years_of_experience type integer using null;');
  await db.query('update profiles set ca_final_attempt=2,ca_inter_attempt=3 where uuid=$1',[A]);
  await role(db,'authenticated',A);await submit(db,'industrial-training',{...base,earliest_joining_date:'2026-11-01',industrial_training_eligibility_date:'2026-10-01'});
  await submit(db,'experienced-ca',{...base,earliest_joining_date:'2026-11-01',experience_years:'8',experience_months:'6'});
  await role(db,'postgres');const row=(await db.query('select * from profiles where uuid=$1',[A])).rows[0];
  assert.equal(row.ca_final_attempt,2);assert.equal(row.ca_inter_attempt,3);assert.equal(row.years_of_experience,8);assert.equal(row.profile.years_of_experience,'8.5000');assert.equal(row.profile.ca_final_attempt,'May 2026');assert.equal(new Date(row.articleship_1yr_end_date).toISOString().slice(0,10),'2026-10-01');
 }finally{await db.exec('reset role');}
});

test('production varchar recruiter columns receive contact, joining, attempt and experience values',async()=>{
 const db=await createDB();try{
  await db.exec('alter table profiles alter column ca_final_attempt type varchar;alter table profiles alter column ca_inter_attempt type varchar;alter table profiles alter column years_of_experience type varchar;');
  await role(db,'authenticated',A);await submit(db,'experienced-ca',{...base,email:'untrusted@example.test',attempt_month:'November',attempt_year:'2001',earliest_joining_date:'2026-11-01',experience_years:'8',experience_months:'6'});
  await role(db,'postgres');const row=(await db.query('select * from profiles where uuid=$1',[A])).rows[0];
  assert.equal(row.email_id,'verified-a@example.test');assert.equal(row.mobile_number,base.phone);assert.equal(row.earliest_joining_date,'2026-11-01');assert.equal(row.ca_final_attempt,'November 2001');assert.equal(Number(row.years_of_experience),8.5);
 }finally{await db.exec('reset role');}
});
