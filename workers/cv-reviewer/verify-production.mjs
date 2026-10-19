import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const args=process.argv.slice(2),evidenceDir=args[args.indexOf('--evidence-dir')+1];
if(!args.includes('--evidence-dir')||!path.isAbsolute(evidenceDir||''))throw new Error('Supply --evidence-dir /absolute/path');
const origin='https://cv-reviewer.bhansalimanan55.workers.dev';
const results=[];await fs.mkdir(evidenceDir,{recursive:true});
const health=await fetch(origin+'/health');const data=await health.json();
assert.equal(health.status,200);assert.equal(data.version,'2026-09-27-verified-partial-v1');results.push({test:'health',status:200,version:data.version});
for(const [test,body,headers,expected] of [
 ['invalid bearer blocked',{images:['synthetic']},{Authorization:'Bearer invalid-session-token'},401],
 ['missing images rejected',{isPremium:true},{},400]
]){
 const response=await fetch(origin,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 assert.equal(response.status,expected);results.push({test,status:response.status});
}
const preflight=await fetch(origin,{method:'OPTIONS',headers:{Origin:'https://www.mystudentclub.com','Access-Control-Request-Headers':'authorization,content-type'}});
assert.equal(preflight.status,204);assert.match(preflight.headers.get('Access-Control-Allow-Headers'),/Authorization/);results.push({test:'authorized session preflight',status:204});
if(args.includes('--image')) {
 const imagePath=args[args.indexOf('--image')+1];if(!path.isAbsolute(imagePath||''))throw new Error('Synthetic resume image must have an absolute path');
 const image=await fs.readFile(imagePath),started=Date.now();
 const response=await fetch(origin,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({images:['data:image/png;base64,'+image.toString('base64')],isPremium:true}),signal:AbortSignal.timeout(180000)});
 const body=await response.json();assert.equal(response.status,200);assert.equal(body.ok,true);assert.equal(body.access?.premium,false);assert.equal(body.access?.partial,true);
 assert.ok(body.response.includes('<<<OVERALL_SCORE>>>'),'Synthetic resume must receive a real partial analysis');
 for(const marker of [...body.response.matchAll(/<<<([A-Z_]+)>>>/g)])assert.ok(['OVERALL_SCORE','RECRUITER_TIPS','MEASURABLE_RESULTS','EDUCATION_QUALIFICATION','ARTICLESHIP_EXPERIENCE'].includes(marker[1].replace(/^END_/,'')),marker[1]);
 await fs.writeFile(path.join(evidenceDir,'synthetic-partial-report.json'),JSON.stringify(body,null,2));
 results.push({test:'forged premium still receives real partial review',status:response.status,elapsedMs:Date.now()-started,partial:body.access.partial});
}
await fs.writeFile(path.join(evidenceDir,'production-checks.json'),JSON.stringify({checkedAt:new Date().toISOString(),results,paidPositive:'Not tested without a genuine eligible paid session.'},null,2));
console.log(JSON.stringify({status:'verified',results,evidenceDir}));
