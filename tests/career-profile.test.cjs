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
      const query={select(){return query;},eq(key,value){filters[key]=value;return query;},order(){return query;},
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
  const {dom}=harness(user);dom.window.document.body.insertAdjacentHTML('afterbegin','<header class="floating-header"><div class="header-container"></div></header><div id="expandedMenu"><div class="menu-items"></div></div>');dom.window.eval(fs.readFileSync(path.join(__dirname,'../scripts/site-navigation.js'),'utf8'));
  await tick();await tick();const nav=dom.window.document.querySelector('.msc-native-nav');assert.ok(nav);
  for(const route of ['/articleship-resources','/semi-qualified-ca-resources','/cv-builder/','/cv-reviewer/','/ai-interview'])assert.ok(nav.querySelector(`a[href="${route}"]`));
  assert.equal(nav.querySelector('.msc-native-login').hidden,true);assert.ok([...nav.querySelectorAll('.msc-native-member')].every(el=>!el.hidden));
  assert.equal(dom.window.document.querySelectorAll('header').length,1);
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

test('a concurrent resource from a different stage cannot borrow the open form outcome',async()=>{
  const {dom,state,api,submit}=harness();
  const first=api.ensureForResource('ca-fresher','CV','/cv.docx');await tick();
  assert.equal(await api.ensureForResource('industrial-training','IT CV','/it.docx'),false);
  await submit('ca-fresher');assert.equal(await first,true);assert.equal(state.writes.length,1);assert.equal(state.writes[0].args.p_stage,'ca-fresher');
  const later=api.ensureForResource('industrial-training','IT CV','/it.docx');await tick();assert.ok(dom.window.document.querySelector('[name="industrial_training_eligibility_date"]'));dom.window.document.querySelector('.msc-career-close').click();assert.equal(await later,false);dom.window.close();
});

test('tools reuse saved account career intake after reload and guests reuse only their own completed stage',async()=>{
  const user={id:'saved-member',email:'saved@example.test',user_metadata:{}};
  const {dom,state,api}=harness(user);
  state.records.set('saved-member:articleship',{stage:'articleship',details:{stage:'articleship',sharing_consent:true},consent_version:'2026-09-27'});
  assert.equal(await api.ensureForTool('cv-reviewer'),true);assert.equal(api.getCurrentStage(),'articleship');assert.equal(state.writes.length,0);
  state.switchUser({id:'new-member',email:'new@example.test',user_metadata:{}});
  const other=api.ensureForTool('cv-builder');await tick();assert.ok(dom.window.document.querySelector('[name="career_stage"]'));dom.window.document.querySelector('.msc-career-close').click();assert.equal(await other,false);dom.window.close();
  const guest=harness();const saved=guest.api.ensureForResource('ca-fresher','CV','/cv.docx');await tick();await guest.submit('ca-fresher');await saved;
  assert.equal(await guest.api.ensureForTool('ai-interview'),true);assert.equal(guest.state.writes.length,1);guest.dom.window.close();
});

test('onboarding traps focus, restores scrolling, and cannot continue as a different account',async()=>{
  const user={id:'onboard-a',email:'a@example.test',user_metadata:{}};
  const {dom,state,api}=harness(user);state.records.set('onboard-a:ca-fresher',{details:{stage:'ca-fresher',sharing_consent:true},consent_version:'2026-09-27'});
  dom.window.document.body.style.overflow='auto';
  const pending=api.finishAuth(user);await tick();await tick();const first=dom.window.document.querySelector('.msc-onboarding a'),last=dom.window.document.querySelector('.msc-career-later');assert.ok(first);assert.equal(dom.window.document.body.style.overflow,'hidden');
  first.focus();dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,cancelable:true}));assert.equal(dom.window.document.activeElement,last);
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',cancelable:true}));assert.equal(dom.window.document.activeElement,first);
  state.switchUser({id:'onboard-b',email:'b@example.test',user_metadata:{}});assert.equal(await pending,false);assert.equal(state.metadata.length,0);assert.equal(dom.window.document.body.style.overflow,'auto');assert.equal(dom.window.document.querySelector('.msc-onboarding'),null);dom.window.close();
});

test('profile saves retain intake fields without restoring removed files or another account draft',()=>{
  const {dom}=harness();const profileSource=fs.readFileSync(path.join(__dirname,'../scripts/profile.js'),'utf8');
  const start=profileSource.indexOf('function readOwnProfileCache()');const end=profileSource.indexOf('// =================== TOAST',start);
  dom.window.currentUser={id:'profile-a'};dom.window.eval(profileSource.slice(start,end));
  dom.window.cacheOwnProfile({name:'Old Name',career_intake:{stage:'industrial-training'},marketing_email_consent:true,industrial_training_eligibility_date:'2027-05-01',cv_filename:'Removed.pdf'});
  const updated=dom.window.preserveCareerProfileFields({name:'New Name'});assert.equal(updated.name,'New Name');assert.equal(updated.career_intake.stage,'industrial-training');assert.equal(updated.industrial_training_eligibility_date,'2027-05-01');assert.equal(updated.marketing_email_consent,true);assert.equal(updated.cv_filename,undefined);
  dom.window.currentUser={id:'profile-b'};assert.equal(dom.window.readOwnProfileCache(),null);assert.equal(dom.window.preserveCareerProfileFields({name:'B'}).career_intake,undefined);
  assert.match(profileSource,/const profileData = preserveCareerProfileFields\(Object\.fromEntries\(formData\.entries\(\)\)\)/);assert.match(profileSource,/return preserveCareerProfileFields\(obj\)/);dom.window.close();
});

async function authPageHarness(file) {
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  const dom=new JSDOM(html,{url:'https://mystudentclub.com/'+file+'?redirect=%2Fcv-builder%2F',runScripts:'outside-only',pretendToBeVisual:true});
  const writes=[],flows=[];dom.window.requestAnimationFrame=()=>{};
  dom.window.MSCCareerProfile={safeRedirect:value=>value.startsWith('/')?value:'/',mountFields:()=>({read:()=>({stage:'ca-fresher',status:'Qualified',attempt_month:'May',attempt_year:'2026',sharing_consent:true,consent_version:'2026-09-27'})}),finishAuth:async(user,redirect)=>{flows.push({user,redirect});},markAuthPending(){}};
  dom.window.supabaseClient={auth:{getSession:async()=>({data:{session:null}}),signUp:async data=>{writes.push(data);return{data:{user:{id:'pending'},session:null}}}}};
  for(const script of dom.window.document.querySelectorAll('script:not([src])'))dom.window.eval(script.textContent);
  await tick();return{dom,writes,flows};
}
test('both email signup pages retain tool return destination in confirmation metadata',async()=>{
  for(const file of ['login.html','sign-up.html']){
    const {dom,writes}=await authPageHarness(file);const doc=dom.window.document;
    for(const [id,value] of Object.entries({'signup-firstname':'Test Name','signup-name':'Test Name','signup-email':'test@example.test','email':'test@example.test','signup-password':'password123','password':'password123','confirm-password':'password123','signup-phone':'9999999999'})){if(doc.getElementById(id))doc.getElementById(id).value=value;}
    doc.getElementById('signup-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();assert.equal(writes.length,1,file);assert.equal(writes[0].options.data.msc_auth_redirect,'/cv-builder/');assert.equal(writes[0].options.data.msc_career_intake.phone,'9999999999');dom.window.close();
  }
});

test('signup continuation failure is shown in the visible signup panel',async()=>{
  const {dom}=await authPageHarness('login.html');dom.window.document.getElementById('authContainer').classList.add('signup-active');dom.window.MSCCareerProfile.finishAuth=async()=>{throw new Error('Please retry saving your signup details.');};
  assert.equal(await dom.window.completeAuthentication({id:'member'}),false);assert.match(dom.window.document.getElementById('signup-error').textContent,/retry saving/);assert.ok(dom.window.document.getElementById('signup-error').classList.contains('show'));dom.window.close();
});

test('shared signout clears only account-owned profile/CV caches even when client already exists',async()=>{
  const {dom,state}=harness({id:'cache-a',email:'a@example.test'});const keys=['userProfileData','msc_profile_cache_owner','userCVText','userCVFileName','userCVImages','userCVPdf','userCoverLetterText','userCoverLetterFileName','cv_cloud_synced','cv_images_synced','userJobPreference','newUserSignup','newUserEmail'];
  keys.forEach(key=>dom.window.localStorage.setItem(key,'private'));dom.window.localStorage.setItem('preferred-theme','dark');dom.window.document.cookie='cv_cloud_synced=true; path=/';dom.window.sessionStorage.setItem('msc_career_v2:guest:ca-fresher','private');dom.window.sessionStorage.setItem('msc_profile_tour','1');dom.window._wzCVImages=['private'];dom.window._wzCVPdf='private';
  dom.window.eval(fs.readFileSync(path.join(__dirname,'../scripts/supabase-init.js'),'utf8'));const callbackCount=state.callbacks.length;dom.window.getSupabaseClient();assert.equal(state.callbacks.length,callbackCount);
  state.switchUser(null);keys.forEach(key=>assert.equal(dom.window.localStorage.getItem(key),null,key));assert.equal(dom.window.localStorage.getItem('preferred-theme'),'dark');assert.equal(dom.window.sessionStorage.getItem('msc_career_v2:guest:ca-fresher'),null);assert.equal(dom.window.sessionStorage.getItem('msc_profile_tour'),null);assert.equal(dom.window.document.cookie.includes('cv_cloud_synced'),false);assert.equal(dom.window._wzCVImages,null);assert.equal(dom.window._wzCVPdf,null);dom.window.close();
});
