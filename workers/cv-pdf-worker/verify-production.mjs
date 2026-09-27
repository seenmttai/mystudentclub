/** Production checks only; never creates users, enrollments or marketing records.
 * Run after coordinated deployment:
 * node workers/cv-pdf-worker/verify-production.mjs --evidence-dir /absolute/work/directory [--include-docx]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const args=process.argv.slice(2),index=args.indexOf('--evidence-dir');
const evidenceDir=args[index+1];
if(index<0||!path.isAbsolute(evidenceDir||''))throw new Error('Supply --evidence-dir /absolute/work/directory');
const origin='https://cv-pdf-worker.bhansalimanan55.workers.dev';
const version='2026-09-27-template-entitlements-v1';
const data={personal:{name:'MSC Release Check',email:'qa@example.invalid',tagline:'Export verification'},summary:'Verified canonical CV content.',skills:'Excel, Accounting',education:[{degree:'CA',institution:'Example Institute',year:'2025'}],experience:[],projects:[],certifications:[],achievements:[],leadership:[],interests:[],customSections:[]};
const results=[];
await fs.mkdir(evidenceDir,{recursive:true});
const healthResponse=await fetch(origin+'/health',{signal:AbortSignal.timeout(30000)}),health=await healthResponse.json();
assert.equal(healthResponse.status,200);assert.equal(health.version,version,'New Worker is not active; no production export tests were run.');
results.push({test:'health release marker',status:healthResponse.status,version:health.version});
async function send(route,body,headers={}) {
 const started=Date.now();const response=await fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
 return {response,elapsedMs:Date.now()-started};
}
for(const [name,route,body,headers,expected] of [
 ['Anonymous premium PDF','/pdf',{template:'classic.html',data},{},403],
 ['Anonymous premium DOCX','/docx',{template:'classic.html',data},{},403],
 ['Forged premium flag','/pdf',{template:'classic.html',data,isPremium:true,courses:['industrial-training-mastery']},{},403],
 ['Invalid bearer token','/pdf',{template:'classic.html',data},{Authorization:'Bearer invalid-release-test-token'},401],
 ['Template traversal','/pdf',{template:'../admin.html',data},{},400],
 ['Legacy arbitrary HTML','/pdf',{html:'<html>unauthorized raw HTML export</html>',filename:'old.pdf'},{},400]
]) {
 const {response,elapsedMs}=await send(route,body,headers);const reply=await response.json();
 const record={test:name,status:response.status,expected,error:reply.error,elapsedMs};results.push(record);console.log(JSON.stringify(record));
 await fs.writeFile(path.join(evidenceDir,'production-checks.json'),JSON.stringify(results,null,2));
 assert.equal(response.status,expected,name);
}
for(const template of ['bold-modern.html','inset-frame.html','clean-rule.html']) {
 const filename=template.replace('.html','.pdf');
 const {response,elapsedMs}=await send('/pdf',{template,data,filename,html:'<html>FORBIDDEN RAW HTML SENTINEL</html>'});
 if(!response.ok)throw new Error(`${template}: ${response.status} ${await response.text()}`);
 assert.match(response.headers.get('content-type'),/^application\/pdf/);
 const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length>1000);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
 const file=path.join(evidenceDir,filename);await fs.writeFile(file,bytes);
 const extracted=spawnSync('python3',['-c','import json,sys;from pypdf import PdfReader;r=PdfReader(sys.argv[1]);print(json.dumps({"pages":len(r.pages),"text":" ".join((p.extract_text() or "") for p in r.pages)}))',file],{encoding:'utf8'});
 if(extracted.status!==0)throw new Error('PDF content extraction failed: '+extracted.stderr);
 const pdf=JSON.parse(extracted.stdout),text=pdf.text.toLowerCase().replace(/\s+/g,' ');
 assert.ok(text.includes('msc release check'),'Candidate name missing from canonical PDF');
 assert.ok(text.includes('verified canonical cv content'),'CV content missing from canonical PDF');
 assert.equal(text.includes('forbidden raw html sentinel'),false,'Caller HTML was rendered');
 const record={test:'Anonymous free PDF — '+template,status:response.status,bytes:bytes.length,pages:pdf.pages,canonicalContent:true,rawHtmlIgnored:true,sha256:createHash('sha256').update(bytes).digest('hex'),filename:response.headers.get('content-disposition'),elapsedMs};results.push(record);console.log(JSON.stringify(record));
 await fs.writeFile(path.join(evidenceDir,'production-checks.json'),JSON.stringify(results,null,2));
}
if(args.includes('--include-docx')) {
 const {response,elapsedMs}=await send('/docx',{template:'bold-modern.html',data,filename:'free-bold-modern.docx'});
 if(!response.ok)throw new Error(`Free DOCX: ${response.status} ${await response.text()}`);
 const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.subarray(0,2).toString(),'PK','DOCX is not a ZIP Office document');
 const file=path.join(evidenceDir,'free-bold-modern.docx');await fs.writeFile(file,bytes);
 const checked=spawnSync('python3',['-c','import json,sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);s=z.read("word/document.xml").decode();print(json.dumps({"documentXml":True,"hasName":"MSC" in s and "Release" in s}))',file],{encoding:'utf8'});
 if(checked.status!==0)throw new Error('DOCX validation failed: '+checked.stderr);
 const docx=JSON.parse(checked.stdout);assert.ok(docx.documentXml);assert.ok(docx.hasName);
 const record={test:'Anonymous free DOCX',status:response.status,bytes:bytes.length,validOfficeDocument:true,hasName:docx.hasName,elapsedMs};results.push(record);console.log(JSON.stringify(record));
}
await fs.writeFile(path.join(evidenceDir,'production-checks.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({status:'verified',checks:results.length,evidenceDir,paidUserPositive:'Covered by unit tests and verified production enrollment RLS; no paid user impersonation used.'}));
