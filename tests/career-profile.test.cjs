// Run with NODE_PATH pointing at a jsdom installation: node --test tests/career-profile.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname,'../scripts/career-profile.js'),'utf8');
const tick = () => new Promise(resolve=>setImmediate(resolve));
function harness(user=null) {
  const dom=new JSDOM('<!doctype html><head></head><body><button id="origin">Open</button></body>',{url:'https://mystudentclub.com/ca-fresher-training-resources',runScripts:'outside-only'});
  const state={user,callbacks:[],records:new Map(),writes:[],fail:false,metadata:[],enrolled:false};
  const db={
    auth:{getSession:async()=>({data:{session:state.user?{user:state.user}:null}}),onAuthStateChange:fn=>state.callbacks.push(fn),updateUser:async data=>{state.metadata.push(data);return{};}},
    from(table) {
      const filters={};
      const query={select(){return query;},eq(key,value){filters[key]=value;return query;},
        maybeSingle:async()=>({data:state.records.get(`${filters.user_id}:${filters.stage}`)||null}),
        limit:async()=>({data:[...state.records.entries()].filter(([key])=>key.startsWith(`${filters.user_id}:`)).map(([,row])=>row)}),
        then(resolve){return Promise.resolve({data:table==='enrollment' && state.enrolled?[{course:'industrial-training-mastery'}]:[]}).then(resolve);}};
      return query;
    },
    rpc:async(name,args)=>{
      if(state.fail)return{error:{message:'database unavailable'}};
      state.writes.push({name,args});
      if(state.user)state.records.set(`${state.user.id}:${args.p_stage}`,{details:args.p_details,consent_version:'2026-09-27'});
      return{data:{saved:true}};
    }
  };
  dom.window.supabaseClient=db;dom.window.eval(source);
  state.switchUser=(next,event=next?'SIGNED_IN':'SIGNED_OUT')=>{state.user=next;state.callbacks.forEach(cb=>cb(event,next?{user:next}:null));};
  const api=dom.window.MSCCareerProfile;
  const submit=async(stage)=>{
    const form=dom.window.document.querySelector('.msc-career-form');assert.ok(form,'career form is visible');
    const set=(name,value)=>{const el=form.querySelector(`[name="${name}"]`);if(el){el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));}};
    if(stage)set('career_stage',stage);
    set('name','Test Member');set('email','member@example.test');set('phone','9999999999');
    set('status',stage==='articleship'?'Cleared one group':stage==='semi-qualified'?'Paused':'Qualified');
    set('attempt_month','May');set('attempt_year','2026');set('earliest_joining_date','2026-11-01');set('industrial_training_eligibility_date','2026-10-01');
    set('experience_type','fresher');set('other_stage','Finance student');
    form.querySelector('[name="sharing_consent"]').checked=true;
    form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
  };
  return{dom,state,api,submit};
}

test('each requested career stage renders its required fields and exact ranges',()=>{
  const {dom,api}=harness();const holder=dom.window.document.createElement('div');dom.window.document.body.append(holder);
  api.mountFields(holder,{stage:'ca-fresher'});
  assert.equal(holder.querySelectorAll('[name="attempt_year"] option').length,28);
  assert.deepEqual([...holder.querySelectorAll('[name="attempt_month"] option')].slice(1).map(x=>x.value),['May','November']);
  assert.equal(holder.querySelector('[name="attempt_year"] option:last-child').value,'2050');
  api.mountFields(holder,{stage:'articleship'});
  assert.deepEqual([...holder.querySelectorAll('[name="attempt_month"] option')].slice(1).map(x=>x.value),['May','September','January']);
  assert.equal(holder.querySelectorAll('[name="status"] option').length,5);
  api.mountFields(holder,{stage:'semi-qualified'});
  const type=holder.querySelector('[name="experience_type"]');assert.ok(holder.querySelector('[name="experience_years"]').disabled);
  type.value='other';type.dispatchEvent(new dom.window.Event('change'));assert.equal(holder.querySelector('[name="experience_years"]').disabled,false);
  assert.equal(holder.querySelector('[name="experience_months"] option:last-child').value,'11');
  api.mountFields(holder,{stage:'industrial-training'});
  assert.ok(holder.querySelector('[name="industrial_training_eligibility_date"]'));assert.match(holder.textContent,/Industrial Training eligibility date/);
  api.mountFields(holder,{stage:'experienced-ca'});assert.equal(holder.querySelectorAll('[name="attempt_month"] option').length,13);
  assert.equal(holder.querySelector('[name="attempt_year"] option:nth-child(2)').value,'1950');dom.window.close();
});

test('guest completion is reused within one category but never across categories or logout',async()=>{
  const {dom,state,api,submit}=harness();
  const first=api.ensureForResource('ca-fresher','CV 1','/cv1.docx');await tick();await submit('ca-fresher');assert.equal(await first,true);
  assert.equal(await api.ensureForResource('ca-fresher','CV 2','/cv2.docx'),true);assert.equal(state.writes.length,1);
  const industrial=api.ensureForResource('industrial-training','CV IT','/it.docx');await tick();assert.ok(dom.window.document.querySelector('[name="industrial_training_eligibility_date"]'));
  state.switchUser(null);assert.equal(await industrial,false);
  const repeat=api.ensureForResource('ca-fresher','CV 2','/cv2.docx');await tick();assert.ok(dom.window.document.querySelector('.msc-career-form'));
  dom.window.document.querySelector('.msc-career-close').click();assert.equal(await repeat,false);dom.window.close();
});

test('two accounts cannot inherit completion and saving failure retains form without granting access',async()=>{
  const a={id:'account-a',email:'a@example.test',user_metadata:{full_name:'Member A'}};
  const b={id:'account-b',email:'b@example.test',user_metadata:{full_name:'Member B'}};
  const {dom,state,api,submit}=harness(a);
  let promise=api.ensureForResource('ca-fresher','CV','/cv.docx');await tick();await submit('ca-fresher');assert.equal(await promise,true);
  assert.equal(state.writes[0].args.p_details.email,a.email);
  state.switchUser(b);state.fail=true;
  promise=api.ensureForResource('ca-fresher','CV','/cv.docx');await tick();await submit('ca-fresher');
  assert.match(dom.window.document.querySelector('[role="alert"]').textContent,/could not save/);assert.equal(state.writes.length,1);
  assert.equal(dom.window.document.querySelector('button[type="submit"]').disabled,false);
  state.fail=false;await submit('ca-fresher');assert.equal(await promise,true);assert.equal(state.writes[1].args.p_details.email,b.email);dom.window.close();
});

test('Google identity is supplied by auth and is not requested again',async()=>{
  const user={id:'google-member',email:'google@example.test',app_metadata:{provider:'google'},user_metadata:{full_name:'Google Member'}};
  const {dom,state,api,submit}=harness(user);
  const promise=api.ensureForResource('articleship','CV','/cv.docx');await tick();
  assert.equal(dom.window.document.querySelector('[name="name"]'),null);assert.equal(dom.window.document.querySelector('[name="email"]'),null);
  await submit('articleship');assert.equal(await promise,true);
  assert.equal(state.writes[0].args.p_details.name,'Google Member');assert.equal(state.writes[0].args.p_details.email,user.email);dom.window.close();
});

test('eligible program member bypasses tool collection; free member gets stage and Others text',async()=>{
  const user={id:'enrolled',email:'member@example.test',user_metadata:{full_name:'Member'}};
  const {dom,state,api,submit}=harness(user);state.enrolled=true;
  assert.equal(await api.ensureForTool('cv-reviewer'),true);assert.equal(dom.window.document.querySelector('.msc-career-form'),null);
  state.enrolled=false;const pending=api.ensureForTool('cv-reviewer');await tick();await submit('other');assert.equal(await pending,true);
  assert.equal(state.writes[0].args.p_details.other_stage,'Finance student');assert.equal(api.getCurrentStage(),'other');dom.window.close();
});

test('signup metadata is saved after confirmation before guided profile onboarding',async()=>{
  const intake={stage:'ca-fresher',status:'Qualified',attempt_month:'May',attempt_year:'2026',phone:'9999999999',sharing_consent:true,consent_version:'2026-09-27'};
  const user={id:'signup-member',email:'signup@example.test',user_metadata:{full_name:'Signup Member',msc_career_intake:intake}};
  const {dom,state,api}=harness(user);
  const finishing=api.finishAuth(user,'/jobs');await tick();await tick();
  assert.equal(state.writes.length,1);assert.equal(state.writes[0].args.p_source.kind,'signup');
  assert.match(dom.window.document.querySelector('#msc-onboarding-title').textContent,/Let recruiters find you/);
  assert.match(dom.window.document.querySelector('.msc-onboarding').textContent,/1,000\+ recruiters/);
  dom.window.document.querySelector('.msc-career-later').click();await finishing;
  assert.equal(state.metadata[0].data.msc_onboarding_seen,true);
  assert.equal(api.safeRedirect('https://attacker.example/'),'/');dom.window.close();
});

test('resource download decodes filenames and keeps the original document extension',async()=>{
  const {dom}=harness();const collectorSource=fs.readFileSync(path.join(__dirname,'../scripts/resource-form-collector.js'),'utf8');
  const clicks=[];dom.window.HTMLAnchorElement.prototype.click=function(){clicks.push({download:this.download,href:this.href});};
  dom.window.eval(collectorSource);await tick();
  dom.window.resourceFormCollector.openResource('/assets/Cover%20Letter%20CA%20Fresher.docx',true);
  assert.equal(clicks[0].download,'Cover Letter CA Fresher.docx');assert.match(clicks[0].href,/\.docx$/);dom.window.close();
});

test('shared navigation resumes pending OAuth fallback and does not duplicate the profile guide',async()=>{
  const intake={stage:'ca-fresher',status:'Qualified',attempt_month:'May',attempt_year:'2026',phone:'9999999999',sharing_consent:true,consent_version:'2026-09-27'};
  const user={id:'oauth-fallback',email:'fallback@example.test',user_metadata:{full_name:'Member',msc_career_intake:intake}};
  const {dom,state,api}=harness(user);
  api.markAuthPending('/cv-builder/');
  const pending=api.initOnboarding();await tick();await tick();assert.ok(dom.window.document.querySelector('.msc-onboarding'));
  dom.window.document.querySelector('.msc-career-later').click();await pending;
  assert.equal(dom.window.sessionStorage.getItem('msc_career_auth_pending'),null);assert.equal(state.writes.length,1);
  dom.reconfigure({url:'https://mystudentclub.com/profile.html?onboarding=1'});
  user.user_metadata.msc_onboarding_seen=true;
  dom.window.document.body.innerHTML='<main><section id="sec-resume"></section><section id="sec-ca-education"></section><section id="sec-availability"></section></main>';
  await api.initOnboarding();await api.initOnboarding();
  assert.equal(dom.window.document.querySelectorAll('.msc-profile-tour').length,1);assert.equal(dom.window.document.querySelectorAll('.msc-profile-highlight').length,3);
  dom.window.close();
});

test('navigation advertises all resource and tool routes and keeps member controls visible',async()=>{
  const user={id:'nav-member',email:'member@example.test',user_metadata:{msc_onboarding_seen:true}};
  const {dom}=harness(user);dom.window.eval(fs.readFileSync(path.join(__dirname,'../scripts/site-navigation.js'),'utf8'));
  await tick();await tick();const nav=dom.window.document.querySelector('#msc-site-navigation');assert.ok(nav);
  for(const route of ['/articleship-resources','/semi-qualified-ca-resources','/cv-builder/','/cv-reviewer/','/ai-interview'])assert.ok(nav.querySelector(`a[href="${route}"]`));
  assert.equal(nav.querySelector('.msc-nav-login').hidden,true);assert.ok([...nav.querySelectorAll('.msc-member')].every(el=>!el.hidden));
  nav.querySelector('.msc-nav-toggle').click();assert.equal(nav.querySelector('.msc-nav-toggle').getAttribute('aria-expanded'),'true');
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(nav.querySelector('.msc-nav-toggle').getAttribute('aria-expanded'),'false');
  dom.window.close();
});


test('profile editor preserves saved intake month/year/status values absent from older dropdowns',()=>{
  const {dom}=harness();
  const form=dom.window.document.createElement('form');form.innerHTML='<select name="ca_final_app_month"><option>May</option></select><select name="ca_final_app_year"><option>2026</option></select><select name="ca_inter_status"><option>Result Awaited</option></select><input type="checkbox" name="cv_sharing_consent">';dom.window.document.body.append(form);
  dom.window.profileForm=form;
  const profileSource=fs.readFileSync(path.join(__dirname,'../scripts/profile.js'),'utf8');
  const start=profileSource.indexOf('function populateForm(profileData) {');
  const end=profileSource.indexOf('    const emailField',start);
  dom.window.eval(profileSource.slice(start,end)+'}');
  dom.window.populateForm({ca_final_app_month:'Nov',ca_final_app_year:'2050',ca_inter_status:'One Group Cleared',cv_sharing_consent:true});
  assert.equal(form.elements.ca_final_app_month.value,'Nov');assert.equal(form.elements.ca_final_app_year.value,'2050');assert.equal(form.elements.ca_inter_status.value,'One Group Cleared');assert.equal(form.elements.cv_sharing_consent.checked,true);dom.window.close();
});


test('incomplete Google metadata permits a name fallback instead of discarding entered identity',async()=>{
  const user={id:'google-missing-name',email:'google@example.test',app_metadata:{provider:'google'},user_metadata:{}};
  const {dom,state,api,submit}=harness(user);const pending=api.ensureForResource('ca-fresher','CV','/cv.docx');await tick();
  assert.ok(dom.window.document.querySelector('[name="name"]'));assert.equal(dom.window.document.querySelector('[name="email"]'),null);
  await submit('ca-fresher');assert.equal(await pending,true);assert.equal(state.writes[0].args.p_details.name,'Test Member');dom.window.close();
});


test('resource collection honors explicit Industrial stage on legacy URL and all four canonical pages',async()=>{
  const {dom}=harness();dom.window.eval(fs.readFileSync(path.join(__dirname,'../scripts/resource-form-collector.js'),'utf8'));await tick();
  const paths={'/ca-industrial-training-resources':'industrial-training','/ca-fresher-training-resources':'ca-fresher','/articleship-resources':'articleship','/semi-qualified-ca-resources':'semi-qualified'};
  for(const [url,stage] of Object.entries(paths)){dom.reconfigure({url:'https://mystudentclub.com'+url});delete dom.window.document.body.dataset.resourceStage;assert.equal(dom.window.ResourceFormCollector.detectProgramType(),stage);}
  dom.reconfigure({url:'https://mystudentclub.com/resource.html'});dom.window.document.body.dataset.resourceStage='industrial-training';assert.equal(dom.window.ResourceFormCollector.detectProgramType(),'industrial-training');
  const legacy=fs.readFileSync(path.join(__dirname,'../resource.html'),'utf8');assert.match(legacy,/<body data-resource-stage="industrial-training">/);dom.window.close();
});

test('both job generators and scheduled installer preserve shared navigation',()=>{
  for(const file of ['../scripts/generate-jobs.js','../jobs-builder/src/pages/jobs/[category]/[slug].astro']){
    const content=fs.readFileSync(path.join(__dirname,file),'utf8');assert.match(content,/site-navigation\.css/);assert.match(content,/site-navigation\.js/);
  }
  assert.match(fs.readFileSync(path.join(__dirname,'../.github/workflows/generate-jobs.yml'),'utf8'),/node scripts\/install-site-navigation\.cjs/);
});
