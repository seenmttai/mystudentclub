const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const raw=fs.readFileSync(path.join(__dirname,'../workers/cv-reviewer/index.mjs'),'utf8');
const prefix=raw.slice(0,raw.indexOf('async function processCV(')).replace('export default {','const worker = {');
const userId='01234567-1234-1234-1234-0123456789ab';
const allowed=['OVERALL_SCORE','RECRUITER_TIPS','MEASURABLE_RESULTS','EDUCATION_QUALIFICATION','ARTICLESHIP_EXPERIENCE'];
const premium=['PHRASES_SUGGESTIONS','HARD_SKILLS','SOFT_SKILLS','ACTION_VERBS','GRAMMAR_CHECK','FORMATTING_READABILITY','INTERVIEW_QUESTIONS','FINAL_RECOMMENDATIONS'];
const report=[...allowed,...premium].map(section=>`**<<<${section}>>>**\n${section==='OVERALL_SCORE'?'Score: 75.5/100':section+' text'}\n**<<<END_${section}>>>**`).join('\n');
function harness(options={}) {
 const calls={fetch:[],models:0,kv:[]};const counts=new Map();
 const env={RATE_LIMITS:{get:async key=>counts.get(key)||String(options.count||0),put:async(key,value,opts)=>{calls.kv.push({key,value,opts});counts.set(key,value);}},MAX_REQUESTS_PER_IP:'50',RATE_LIMIT_WINDOW:'3600'};
 const context=vm.createContext({Request,Response,Headers,URL,AbortSignal,Set,Date,console:{error(){}},fetch:async(url,init)=>{
  calls.fetch.push({url,init});if(options.outage)throw new Error('offline');
  if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:userId,user_metadata:{premium:true}}),{status:options.authStatus||200});
  return new Response(JSON.stringify((options.courses||[]).map(course=>({course}))),{status:options.enrollmentStatus||200});
 },processCV:async()=>{calls.models++;return{ok:true,response:options.report??report,modelUsed:'unchanged',debug_errors:{doNotExpose:'SECRET REPORT'}};}});
 vm.runInContext(prefix+'\nthis.worker=worker;this.partialReport=partialReport;',context);
 function request(extras={},token,method='POST') {return new Request('https://reviewer.example/',{method,headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...(token?{Authorization:'Bearer '+token}:{})},...(method==='POST'?{body:JSON.stringify({images:['synthetic'],...extras})}:{})});}
 return {context,calls,env,request};
}
test('free and forged-premium requests receive only existing free report sections',async()=>{
 for(const body of [{},{isPremium:true,user_metadata:{premium:true},courses:['industrial-training-mastery']}]) {
  const h=harness();const res=await h.context.worker.fetch(h.request(body),h.env);const data=await res.json();
  assert.equal(res.status,200);assert.equal(data.access.premium,false);assert.equal(data.access.partial,true);
  for(const section of allowed)assert.ok(data.response.includes(`<<<${section}>>>`),section);
  for(const section of premium)assert.ok(!data.response.includes(section),section);
  assert.equal(data.debug_errors,undefined);assert.equal(h.calls.fetch.length,0);
 }
});
test('full report requires server-verified identity and eligible canonical or legacy enrollment',async()=>{
 const frontend={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts/program-access.js'),'utf8'),frontend);
 for(const course of ['industrial-training-mastery','msc-ca-freshers-program','msc-articleship-program',...Object.keys(frontend.window.MSCProgramAccess.COURSE_ALIASES)]) {
  const h=harness({courses:[course]});const res=await h.context.worker.fetch(h.request({},'verified'),h.env);const data=await res.json();
  assert.equal(res.status,200,course);assert.equal(data.response,report);assert.equal(data.access.premium,true);
  assert.equal(h.calls.fetch[1].init.headers.Authorization,'Bearer verified');assert.ok(h.calls.fetch[1].url.endsWith('uuid=eq.'+userId));
 }
});
test('free accounts and unknown purchases cannot elevate using flags',async()=>{
 for(const courses of [[],['unrelated-free-course']]){
  const h=harness({courses});const res=await h.context.worker.fetch(h.request({isPremium:true},'token'),h.env);const data=await res.json();
  assert.equal(data.access.partial,true);assert.ok(!data.response.includes('HARD_SKILLS'));
 }
});
test('invalid identity and enrollment outages stop before calling a model',async()=>{
 for(const [options,status] of [[{authStatus:401},401],[{authStatus:503},503],[{enrollmentStatus:500},503],[{outage:true},503]]){
  const h=harness(options);const res=await h.context.worker.fetch(h.request({},'bad-token'),h.env);assert.equal(res.status,status);assert.equal(h.calls.models,0);
 }
});
test('malformed sections do not reveal paid content as a fallback',async()=>{
 const h=harness();
 assert.throws(()=>h.context.partialReport('unstructured full report'),/could not be formatted/);
 assert.throws(()=>h.context.partialReport('<<<RECRUITER_TIPS>>>safe<<<HARD_SKILLS>>>hidden<<<END_RECRUITER_TIPS>>>'),/could not be formatted/);
 assert.equal(h.context.partialReport('<<<OUT_OF_CONTEXT>>> no cv'), '<<<OUT_OF_CONTEXT>>> Please upload a CA, finance or accounting resume.');
});
test('existing KV quota is enforced without requiring new bindings',async()=>{
 const h=harness({count:50});const res=await h.context.worker.fetch(h.request(),h.env);assert.equal(res.status,429);assert.ok(Number(res.headers.get('Retry-After'))>0);assert.equal(h.calls.models,0);
 const ok=harness();assert.equal((await ok.context.worker.fetch(ok.request(),ok.env)).status,200);assert.equal(ok.calls.kv[0].value,'1');assert.equal(ok.calls.kv[0].opts.expirationTtl,3660);
});
test('preflight permits session authorization and invalid bodies do not consume model quota',async()=>{
 const h=harness();const options=await h.context.worker.fetch(h.request({},null,'OPTIONS'),h.env);assert.equal(options.status,204);assert.match(options.headers.get('Access-Control-Allow-Headers'),/Authorization/);
 assert.equal((await h.context.worker.fetch(h.request({images:[]}),h.env)).status,400);assert.equal(h.calls.models,0);assert.equal(h.calls.kv.length,0);
});
