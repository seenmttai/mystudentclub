// PostgreSQL execution and permission tests for the offer-groups migration. Dependency: @electric-sql/pglite.
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../supabase/migrations/202610310001_offer_groups.sql'),'utf8');
const A='20000000-0000-4000-8000-00000000000a',B='20000000-0000-4000-8000-00000000000b',ADMIN='20000000-0000-4000-8000-0000000000ad';
const WA=code=>`https://chat.whatsapp.com/${code}`;
let shared;
after(async()=>{ if(shared) await shared.close(); });

async function createDB({withPlacements=true}={}){
 const db=shared || new PGlite();
 if(shared) await db.exec('reset role;drop schema if exists auth cascade;drop schema public cascade;drop role if exists anon;drop role if exists authenticated;drop role if exists service_role;create schema public;grant usage on schema public to public;');
 shared=db;
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
  create table auth.users(id uuid primary key,email text,banned_until timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;
  grant usage on schema public to anon,authenticated,service_role;
  create function public.is_super_admin() returns boolean language sql stable as $$select auth.uid()='${ADMIN}'::uuid$$;
  grant execute on function public.is_super_admin() to anon,authenticated;
  insert into auth.users(id,email) values('${A}','a@example.test'),('${B}','b@example.test'),('${ADMIN}','admin@example.test');`);
 if(withPlacements) await db.exec(`create table public.placements(id uuid primary key default gen_random_uuid(),user_id uuid,email text not null,name text,company text,role text,location text,joining_date date,status text not null default 'offer',offer_letter_path text,program text,source text,verified boolean not null default false);`);
 await db.exec(migration);
 await db.exec(migration); // idempotent
 return db;
}
async function as(db,role,user=''){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec(`set role ${role}`);}
async function claim(db,user,fields={}){
 await as(db,'service_role');
 const f={user_id:user,email:user===A?'a@example.test':'b@example.test',name:'Asha Verma',category:'industrial-training',company:'Deloitte',city:'Gurugram',domain:'Internal Audit',joining_date:'2026-12-01',status:'verified',...fields};
 const cols=Object.keys(f);const r=await db.query(`insert into public.offer_claims(${cols.join(',')}) values(${cols.map((_,i)=>'$'+(i+1)).join(',')}) returning id,company_key,city_key`,cols.map(c=>f[c]));
 await db.exec('reset role');return r.rows[0];
}
const status=async(db,user)=>{await as(db,'authenticated',user);const r=(await db.query('select public.my_offer_status() s')).rows[0].s;await db.exec('reset role');return r;};
const save=(db,...a)=>db.query('select public.admin_offer_group_save($1,$2,$3,$4,$5,$6,$7) id',a);

test('keys follow msc-mail companyKey and fold city spellings',async()=>{
 const db=await createDB();
 const q=async(sql,arg)=>(await db.query(sql,[arg])).rows[0].k;
 assert.equal(await q('select public.offer_company_key($1) k','Deloitte Haskins & Sells LLP'),'deloitte-haskins-and-sells');
 assert.equal(await q('select public.offer_company_key($1) k','KPMG India Pvt. Ltd.'),'kpmg-india');
 assert.equal(await q('select public.offer_company_key($1) k','  ey  '),'ey');
 assert.equal(await q('select public.offer_city_key($1) k','Gurugram'),'gurgaon');
 assert.equal(await q('select public.offer_city_key($1) k','New Delhi'),'delhi');
 assert.equal(await q('select public.offer_city_key($1) k','Bengaluru'),'bangalore');
});

test('students and anon cannot read or write the tables or call the service functions',async()=>{
 const db=await createDB();
 await claim(db,A);
 for(const role of ['anon','authenticated']){
  await as(db,role,A);
  for(const t of ['offer_groups','offer_claims','account_bans']) await assert.rejects(db.query(`select * from public.${t}`),/permission denied/);
  await assert.rejects(db.query(`insert into public.offer_claims(user_id,name,category,company,city,joining_date,status) values('${A}','x','articleship','x','x','2026-01-01','verified')`),/permission denied/);
  await assert.rejects(db.query("select public.offer_groups_for('articleship','x','y')"),/permission denied/);
  await assert.rejects(db.query(`select public.offer_placement_from_claim('${A}')`),/permission denied/);
 }
 await as(db,'anon');await assert.rejects(db.query('select public.my_offer_status()'),/permission denied/);
 await as(db,'authenticated',A);await assert.rejects(db.query('select public.admin_offer_groups()'),/super admins/);
 await assert.rejects(save(db,null,'all',null,null,'General',WA('AbCdEf1234567890'),true),/super admins/);
 await db.exec('reset role');
});

test('one verified-or-review claim per account; rejected attempts do not count',async()=>{
 const db=await createDB();
 await claim(db,A,{status:'rejected'});await claim(db,A,{status:'rejected'});
 await claim(db,A,{status:'review'});
 await assert.rejects(claim(db,A,{status:'verified'}),/offer_claims_one_active/);
 await assert.rejects(claim(db,A,{status:'review'}),/offer_claims_one_active/);
 const s=await status(db,A);
 assert.equal(s.claim.status,'review');assert.equal(s.rejected_total,2);assert.equal(s.rejected_today,2);assert.deepEqual(s.groups,[]);
 assert.deepEqual(await status(db,B),{signed_in:true,banned:false,claim:null,groups:[],has_company_group:false,rejected_today:0,rejected_total:0});
});

test('verified students get the most specific links first, only for their category, and nothing else',async()=>{
 const db=await createDB();
 await as(db,'authenticated',ADMIN);
 await save(db,null,'industrial-training',null,null,'MSCIT students',WA('General00000001'),true);
 await save(db,null,'all',null,null,'MSC everyone',WA('Everyone0000001'),true);
 await save(db,null,'articleship',null,null,'Articleship general',WA('Article00000001'),true);
 await save(db,null,'industrial-training','Deloitte',null,'Deloitte IT (all cities)',WA('Deloitte0000001'),true);
 await save(db,null,'industrial-training','Deloitte Haskins & Sells LLP','Gurgaon','Deloitte Gurgaon IT',WA('DeloitteGGN0001'),true);
 await save(db,null,'industrial-training','Deloitte','Mumbai','Deloitte Mumbai IT',WA('DeloitteBOM0001'),true);
 await save(db,null,'industrial-training',null,'Gurugram','MSCIT Gurgaon',WA('Gurgaon00000001'),true);
 await save(db,null,'industrial-training','KPMG',null,'KPMG IT',WA('Kpmg00000000001'),true);
 await save(db,null,'industrial-training',null,null,'Old group (off)',WA('Inactive0000001'),false);
 await db.exec('reset role');
 await claim(db,A,{company:'Deloitte',city:'Gurugram'});
 // "Deloitte Haskins & Sells LLP" is a different key from "Deloitte": that group is not Deloitte's.
 let s=await status(db,A);
 assert.deepEqual(s.groups.map(g=>g.title),['Deloitte IT (all cities)','MSCIT Gurgaon','MSCIT students','MSC everyone']);
 assert.deepEqual(s.groups.map(g=>g.kind),['company','city','general','general']);
 assert.equal(s.has_company_group,true);
 await as(db,'authenticated',ADMIN);
 await save(db,null,'industrial-training','DELOITTE','gurugram','Deloitte Gurgaon IT 2',WA('DeloitteGGN0002'),true);
 await db.exec('reset role');
 s=await status(db,A);
 assert.equal(s.groups[0].title,'Deloitte Gurgaon IT 2');assert.equal(s.groups[0].kind,'company_city');
 assert.ok(!JSON.stringify(s).includes('Inactive0000001'));assert.ok(!JSON.stringify(s).includes('Article00000001'));
 // Review and revoked claims see no links.
 await as(db,'service_role');await db.query(`update public.offer_claims set status='review' where user_id='${A}'`);await db.exec('reset role');
 assert.deepEqual((await status(db,A)).groups,[]);
});

test('group links must be WhatsApp invite links; categories are checked',async()=>{
 const db=await createDB();
 await as(db,'authenticated',ADMIN);
 await assert.rejects(save(db,null,'industrial-training',null,null,'Bad','https://evil.example/x',true),/offer_groups_url_check/);
 await assert.rejects(save(db,null,'industrial-training',null,null,'Bad','http://chat.whatsapp.com/AbCdEf1234567890',true),/offer_groups_url_check/);
 await assert.rejects(save(db,null,'industrial',null,null,'Bad',WA('AbCdEf1234567890'),true),/offer_groups_category_check/);
 await save(db,null,'ca-fresher',null,null,'Freshers',WA('FMQvEUsMZw2EN2t2h2LnRZ')+'?mode=gi_t',true);
 await save(db,null,'ca-fresher',null,null,'Channel','https://whatsapp.com/channel/0029Vb8XM5GDzgT6YyWk4x0F',true);
 const list=(await db.query('select public.admin_offer_groups() g')).rows[0].g;
 assert.equal(list.length,2);
 await db.query('select public.admin_offer_group_delete($1)',[list[0].id]);
 assert.equal((await db.query('select public.admin_offer_groups() g')).rows[0].g.length,1);
 await db.exec('reset role');
});

test('admin approve writes one placement; reject frees the student to try again; missing groups lists gaps',async()=>{
 const db=await createDB();
 const c=await claim(db,A,{status:'review',company:'EY',city:'Bengaluru',ai:JSON.stringify({designation:'Industrial Trainee'})});
 await as(db,'authenticated',ADMIN);
 let r=(await db.query('select public.admin_offer_claims($1,$2,$3) x',['review',null,50])).rows[0].x;
 assert.equal(r.length,1);assert.equal(r[0].company,'EY');assert.equal(r[0].attempts,1);
 assert.equal((await db.query('select public.admin_offer_claim_decide($1,$2,$3) x',[c.id,'approve','Letter checked by hand'])).rows[0].x.status,'verified');
 await assert.rejects(db.query('select public.admin_offer_claim_decide($1,$2,$3) x',[c.id,'approve',null]),/Cannot approve a claim that is verified/);
 const miss=(await db.query('select public.admin_offer_missing_groups() x')).rows[0].x;
 assert.deepEqual(miss.map(m=>[m.company,m.city,m.students]),[['EY','Bengaluru',1]]);
 await save(db,null,'industrial-training','EY',null,'EY IT',WA('EyGroup00000001'),true);
 assert.deepEqual((await db.query('select public.admin_offer_missing_groups() x')).rows[0].x,[]);
 await db.exec('reset role');
 const p=(await db.query('select * from public.placements')).rows;
 assert.equal(p.length,1);assert.equal(p[0].source,'offer-groups');assert.equal(p[0].verified,true);assert.equal(p[0].role,'Industrial Trainee');assert.equal(p[0].program,'industrial-training');
 await as(db,'service_role');assert.equal((await db.query('select public.offer_placement_from_claim($1) x',[c.id])).rows[0].x,p[0].id);await db.exec('reset role');
 assert.equal((await db.query('select count(*)::int n from public.placements')).rows[0].n,1);
 await as(db,'authenticated',ADMIN);
 await db.query('select public.admin_offer_claim_decide($1,$2,$3)',[c.id,'revoke','Changed company']);
 await db.exec('reset role');
 assert.deepEqual((await status(db,A)).groups,[]);
 await as(db,'authenticated',ADMIN);await db.query('select public.admin_offer_claim_decide($1,$2,$3)',[c.id,'reject',null]);await db.exec('reset role');
 await claim(db,A,{status:'review'}); // after a reject the student may try again
});

test('placement is skipped quietly when msc-mail placements table is missing',async()=>{
 const db=await createDB({withPlacements:false});
 const c=await claim(db,A,{status:'review'});
 await as(db,'authenticated',ADMIN);
 assert.equal((await db.query('select public.admin_offer_claim_decide($1,$2,$3) x',[c.id,'approve',null])).rows[0].x.status,'verified');
 await db.exec('reset role');
});

test('ban records it, revokes the claim, bans in auth, hides links; unban lifts it',async()=>{
 const db=await createDB();
 await as(db,'authenticated',ADMIN);await save(db,null,'industrial-training',null,null,'MSCIT students',WA('General00000001'),true);await db.exec('reset role');
 const c=await claim(db,A);
 assert.equal((await status(db,A)).groups.length,1);
 await as(db,'authenticated',ADMIN);
 await assert.rejects(db.query('select public.admin_offer_ban($1,$2)',[c.id,'']),/reason/);
 const r=(await db.query('select public.admin_offer_ban($1,$2) x',[c.id,'Edited letter: name pasted over'])).rows[0].x;
 assert.equal(r.auth_banned,true);
 await db.exec('reset role');
 const s=await status(db,A);assert.equal(s.banned,true);assert.equal(s.claim.status,'revoked');assert.deepEqual(s.groups,[]);
 const u=(await db.query(`select banned_until from auth.users where id='${A}'`)).rows[0];
 assert.ok(new Date(u.banned_until).getFullYear()>new Date().getFullYear()+90);
 await as(db,'authenticated',ADMIN);await db.query('select public.admin_offer_unban($1)',[A]);await db.exec('reset role');
 assert.equal((await status(db,A)).banned,false);
 assert.equal((await db.query(`select banned_until from auth.users where id='${A}'`)).rows[0].banned_until,null);
});

test('migration refuses to run without is_super_admin()',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text,banned_until timestamptz);`);
  await assert.rejects(db.exec(migration),/is_super_admin\(\) is missing/);
 }finally{await db.close();}
});
