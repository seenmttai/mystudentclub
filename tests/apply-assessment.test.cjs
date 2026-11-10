const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Apply assessments (hire.mystudentclub.com docs/apply-assessments.md), mobile site: before an application is recorded,
// scripts/apply-assessment.js runs the recruiter's mandatory assessment (hire's /assessment-take.js). It must never
// block applying when hire cannot be reached, recordApplication must call it before the job_applications insert, and
// no caller may open the mail or link when it says no. No DOM library on this branch: a small stand-in window.
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const gateSource = read('scripts/apply-assessment.js').replace(/^export\s+/m, '');

function page({ hostname = 'mobile.mystudentclub.com', storage = {}, onScript = null } = {}) {
  const added = [];
  const store = new Map(Object.entries(storage));
  const window = {
    location: { hostname },
    localStorage: { getItem: key => (store.has(key) ? store.get(key) : null) },
    MscAssessment: undefined,
  };
  const document = {
    createElement: tag => ({ tagName: tag.toUpperCase() }),
    head: { appendChild: node => { added.push(node); setTimeout(() => onScript?.(node, window), 0); return node; } },
  };
  const context = vm.createContext({ window, document, console: { warn() {} }, setTimeout, clearTimeout });
  vm.runInContext(`${gateSource}\nwindow.assessmentGate = assessmentGate;`, context);
  return { w: window, added };
}
const client = token => ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } });
const JOB = { id: '9a0e5c7e-1111-4222-8333-444455556666', Company: 'ABC & Co', Category: 'Statutory Audit' };

test('apply assessment (mobile): loads hire\'s script once and hands it the vacancy and a fresh token', async () => {
  const seen = [];
  const { w, added } = page({ onScript: (node, win) => { win.MscAssessment = { gate: async opts => { seen.push({ ...opts, token: await opts.getToken() }); return true; } }; node.onload(); } });
  assert.equal(await w.assessmentGate({ table: 'Semi Qualified Jobs', job: JOB, supabaseClient: client('fresh-token'), session: { access_token: 'old' } }), true);
  assert.equal(added.length, 1);
  assert.equal(added[0].src, 'https://hire.mystudentclub.com/assessment-take.js');
  assert.deepEqual({ api: seen[0].api, table: seen[0].table, jobId: seen[0].jobId, company: seen[0].company, title: seen[0].title, token: seen[0].token },
    { api: 'https://hire.mystudentclub.com', table: 'Semi Qualified Jobs', jobId: JOB.id, company: 'ABC & Co', title: 'Statutory Audit', token: 'fresh-token' });
  await w.assessmentGate({ table: 'Semi Qualified Jobs', job: JOB, supabaseClient: client(null), session: { access_token: 'old' } });
  assert.equal(added.length, 1, 'the script is loaded once');
  assert.equal(seen[1].token, 'old', 'falls back to the page session');
});

test('apply assessment (mobile): leaving the assessment stops the application; an outage never does', async () => {
  const left = page({ onScript: (node, win) => { win.MscAssessment = { gate: async () => false }; node.onload(); } });
  assert.equal(await left.w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('t') }), false);
  const failed = page({ onScript: node => node.onerror() });
  assert.equal(await failed.w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('t') }), true);
  const broken = page({ onScript: (node, win) => { win.MscAssessment = { gate: async () => { throw new Error('boom'); } }; node.onload(); } });
  assert.equal(await broken.w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('t') }), true);
  const missing = page();
  assert.equal(await missing.w.assessmentGate({ table: '', job: JOB, supabaseClient: client('t') }), true);
  assert.equal(await missing.w.assessmentGate({ table: 'Fresher Jobs', job: { id: '' }, supabaseClient: client('t') }), true);
  assert.equal(missing.added.length, 0, 'nothing is loaded without a vacancy');
});

test('apply assessment (mobile): a local hire preview only on localhost', async () => {
  const local = page({ hostname: 'localhost', storage: { 'msc:hire-api': 'http://localhost:8787' }, onScript: node => node.onerror() });
  await local.w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('t') });
  assert.equal(local.added[0].src, 'http://localhost:8787/assessment-take.js');
  const prod = page({ storage: { 'msc:hire-api': 'http://localhost:8787' }, onScript: node => node.onerror() });
  await prod.w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('t') });
  assert.equal(prod.added[0].src, 'https://hire.mystudentclub.com/assessment-take.js');
});

test('apply assessment (mobile): recordApplication runs the gate before the insert, and every caller stops on false', () => {
  for (const file of ['scripts/portal3.js', 'scripts/portal-email.js']) {
    const source = read(file);
    assert.match(source, /import \{ assessmentGate \} from ["']\.\/apply-assessment\.js["'];/, file);
    const start = source.indexOf('async function recordApplication(');
    assert.ok(start >= 0, file);
    const body = source.slice(start, source.indexOf('\n}\n', start));
    const gate = body.indexOf('assessmentGate(');
    const insert = body.search(/\.from\(["']job_applications["']\)/);
    assert.ok(gate > 0 && insert > gate, `${file}: the gate runs before the insert`);
    assert.match(body.slice(gate, insert), /return false;/, `${file}: an unfinished assessment records nothing`);
    const calls = [...source.matchAll(/await recordApplication\(/g)].map(m => source.slice(Math.max(0, m.index - 60), m.index + 60));
    assert.ok(calls.length >= 2, `${file}: callers found`);
    for (const call of calls) assert.match(call, /(if \(await recordApplication|const (?:proceed|shouldProceed) = (?:autoRedirect \? )?await recordApplication)/, `${file}: ${call.trim()}`);
  }
});
