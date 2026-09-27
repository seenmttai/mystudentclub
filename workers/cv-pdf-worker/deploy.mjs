/** Content-only deployment: preserves all existing Worker settings and secret bindings.
 * API: https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/content/methods/update/
 * Usage: node workers/cv-pdf-worker/deploy.mjs --prepare --evidence-dir /absolute/work/directory
 *        node workers/cv-pdf-worker/deploy.mjs --deploy  --evidence-dir /absolute/work/directory
 * Run --deploy only after the matching website has been published.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const mode = args.includes('--prepare') ? 'prepare' : args.includes('--deploy') ? 'deploy' : null;
const evidenceIndex = args.indexOf('--evidence-dir');
if (!mode || evidenceIndex < 0 || !path.isAbsolute(args[evidenceIndex+1] || '')) {
  throw new Error('Use --prepare or --deploy with --evidence-dir /absolute/work/directory.');
}
const evidenceDir = args[evidenceIndex+1];
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const account = '8642f7dfe24d2fa5858c168ac4d46fec';
const workerName = 'cv-pdf-worker';
const api = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${workerName}`;
const workerOrigin = 'https://cv-pdf-worker.bhansalimanan55.workers.dev';
const expectedVersion = '2026-09-27-template-entitlements-v1';
const configFile = path.join(os.homedir(), 'Library/Preferences/.wrangler/config/default.toml');
const config = await fs.readFile(configFile, 'utf8');
const token = config.match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
if (!token) throw new Error('Wrangler OAuth credentials are unavailable.');
const authHeaders = {Authorization: `Bearer ${token}`};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(sortObject(value));
function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortObject(value[key])]));
  return value;
}
function settingsForComparison(settings) {
  const copy = {...settings};
  delete copy.annotations; // Deployment audit annotations may change; no runtime configuration may.
  copy.bindings = [...(copy.bindings || [])].sort((a,b) => a.name.localeCompare(b.name));
  return copy;
}
async function requestJson(suffix, options = {}) {
  const response = await fetch(api + suffix, { ...options, headers: {...authHeaders, ...options.headers}, signal: AbortSignal.timeout(45000) });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare ${options.method || 'GET'} ${suffix || '/'} failed (${response.status}): ${JSON.stringify(data.errors || [])}`);
  return data;
}
async function snapshot(label) {
  const settings = (await requestJson('/settings')).result;
  assert.ok(settings.bindings?.some(binding => binding.name === 'BROWSER' && binding.type === 'browser'), 'BROWSER binding missing');
  assert.ok(settings.bindings?.some(binding => binding.name === 'FREECONVERT_API_KEY' && binding.type === 'secret_text'), 'Existing conversion secret binding missing');
  const response = await fetch(api, {headers:authHeaders, signal:AbortSignal.timeout(45000)});
  if (!response.ok) throw new Error(`Worker source snapshot failed (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type');
  const folder = path.join(evidenceDir,label); await fs.mkdir(folder,{recursive:true,mode:0o700});
  await fs.writeFile(path.join(folder,'settings.json'), JSON.stringify(settings,null,2));
  await fs.writeFile(path.join(folder,'source.multipart'),bytes);
  await fs.writeFile(path.join(folder,'content-type.txt'),contentType || '');
  const form = await new Response(bytes,{headers:{'content-type':contentType}}).formData();
  const modules=[];
  for (const [name,part] of form.entries()) {
    const filename = typeof part === 'string' ? name : part.name || name;
    if (path.basename(filename) !== filename) throw new Error('Unexpected source snapshot filename');
    const content = typeof part === 'string' ? Buffer.from(part) : Buffer.from(await part.arrayBuffer());
    await fs.writeFile(path.join(folder,filename),content);
    modules.push({name:filename,sha256:sha(content),bytes:content.length});
  }
  return {settings, modules: modules.sort((a,b)=>a.name.localeCompare(b.name))};
}
await fs.mkdir(evidenceDir,{recursive:true,mode:0o700});
const proposed = await Promise.all(['index.mjs','runtime.mjs'].map(async name=>{
  const bytes=await fs.readFile(path.join(moduleDir,name));return {name,sha256:sha(bytes),bytes:bytes.length};
}));
if (mode === 'prepare') {
  const before=await snapshot('prepared-before');
  const plan={preparedAt:new Date().toISOString(),account,worker:workerName,endpoint:'PUT /content',before,proposed,expectedVersion};
  await fs.writeFile(path.join(evidenceDir,'deployment-plan.json'),JSON.stringify(plan,null,2));
  console.log(JSON.stringify({status:'prepared',worker:workerName,endpoint:'PUT /content',modules:proposed,bindings:before.settings.bindings.map(({name,type})=>({name,type})),evidenceDir}));
} else {
  const plan=JSON.parse(await fs.readFile(path.join(evidenceDir,'deployment-plan.json'),'utf8'));
  assert.equal(canonical(plan.proposed),canonical(proposed),'Local Worker files changed since preparation; prepare again.');
  const before=await snapshot('deployment-before');
  assert.equal(canonical(plan.before.modules),canonical(before.modules),'Production Worker source changed since preparation; inspect before continuing.');
  assert.equal(canonical(settingsForComparison(plan.before.settings)),canonical(settingsForComparison(before.settings)),'Production Worker settings changed since preparation; inspect before continuing.');
  const frontendUrl='https://www.mystudentclub.com/cv-builder/cv-script.js?release-check='+Date.now();
  const frontend=await fetch(frontendUrl,{cache:'no-store',signal:AbortSignal.timeout(30000)});
  const frontendSource=await frontend.text();
  assert.equal(frontend.status,200,'Published CV Builder script is unavailable');
  assert.ok(frontendSource.includes('body: JSON.stringify({ data: exportData, filename, template: getSelectedTemplateFile() })'),'Matching website is not published yet. Worker deployment stopped.');
  const localFrontend=await fs.readFile(path.resolve(moduleDir,'../../cv-builder/cv-script.js'),'utf8');
  assert.equal(sha(frontendSource),sha(localFrontend),'Published CV Builder differs from the prepared local frontend; inspect release state.');
  const form = new FormData();
  form.set('metadata',new Blob([JSON.stringify({main_module:'index.mjs'})],{type:'application/json'}));
  for (const entry of proposed) form.set(entry.name,new Blob([await fs.readFile(path.join(moduleDir,entry.name))],{type:'application/javascript+module'}),entry.name);
  // This endpoint updates content only. No bindings, secret values or runtime config are sent.
  const deployed=await requestJson('/content',{method:'PUT',body:form});
  const receipt={at:new Date().toISOString(),worker:workerName,endpoint:'PUT /content',id:deployed.result?.id,etag:deployed.result?.etag,deployment_id:deployed.result?.deployment_id,frontendSha256:sha(frontendSource),proposed};
  await fs.writeFile(path.join(evidenceDir,'deployment-receipt.json'),JSON.stringify(receipt,null,2));
  const after=await snapshot('deployment-after');
  assert.equal(canonical(settingsForComparison(before.settings)),canonical(settingsForComparison(after.settings)),'Worker runtime settings changed unexpectedly. Inspect snapshots before proceeding.');
  assert.equal(canonical(after.modules),canonical(proposed),'Published Worker modules do not match local files');
  const health=await fetch(workerOrigin+'/health',{signal:AbortSignal.timeout(30000)});
  const healthData=await health.json();
  await fs.writeFile(path.join(evidenceDir,'health.json'),JSON.stringify(healthData,null,2));
  assert.equal(healthData.version,expectedVersion,'Worker health did not return the new release marker');
  console.log(JSON.stringify({status:'deployed',...receipt,settingsPreserved:true,health:healthData,evidenceDir}));
}
