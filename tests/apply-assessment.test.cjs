const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// Apply assessments (hire.mystudentclub.com docs/apply-assessments.md): before Easy Apply saves an application to a
// recruiter-posted job, scripts/apply-assessment.js runs the recruiter's mandatory assessment (hire's
// /assessment-take.js). It must never block applying when hire cannot be reached, and every Easy Apply save point must
// call it before the job_applications insert.
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const gateSource = read('scripts/apply-assessment.js').replace(/^export\s+/gm, '');

function page({ url = 'https://www.mystudentclub.com/ca-fresher-jobs.html', storage = {}, onScript = null } = {}) {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url, runScripts: 'outside-only' });
  const w = dom.window;
  for (const [key, value] of Object.entries(storage)) w.localStorage.setItem(key, value);
  const added = [];
  const append = w.document.head.appendChild.bind(w.document.head);
  w.document.head.appendChild = node => { added.push(node); const out = append(node); if (node.tagName === 'SCRIPT') setTimeout(() => onScript?.(node, w), 0); return out; };
  w.eval(`${gateSource}\nwindow.assessmentGate = assessmentGate;\nwindow.pendingAssessmentAfterApply = pendingAssessmentAfterApply;`);
  return { w, added };
}
const client = token => ({ auth: { getSession: async () => ({ data: { session: token ? { access_token: token } : null } }) } });
const JOB = { id: 501, Company: 'ABC & Co', Category: 'Statutory Audit' };

test('apply assessment: loads hire\'s script once and hands it the vacancy and a fresh token', async () => {
  const seen = [];
  const { w, added } = page({ onScript: (node, win) => { win.MscAssessment = { gate: async opts => { seen.push({ ...opts, token: await opts.getToken() }); return true; } }; node.onload(); } });
  assert.equal(await w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('fresh-token'), session: { access_token: 'old' } }), true);
  assert.equal(added.length, 1);
  assert.equal(added[0].src, 'https://hire.mystudentclub.com/assessment-take.js');
  assert.deepEqual({ api: seen[0].api, table: seen[0].table, jobId: seen[0].jobId, company: seen[0].company, title: seen[0].title, token: seen[0].token },
    { api: 'https://hire.mystudentclub.com', table: 'Fresher Jobs', jobId: 501, company: 'ABC & Co', title: 'Statutory Audit', token: 'fresh-token' });
  await w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client(null), session: { access_token: 'old' } });
  assert.equal(added.length, 1, 'the script is loaded once');
  assert.equal(seen[1].token, 'old', 'falls back to the page session');
  w.close();
});

test('apply assessment: the student leaving the assessment stops the application', async () => {
  const { w } = page({ onScript: (node, win) => { win.MscAssessment = { gate: async () => false }; node.onload(); } });
  assert.equal(await w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('t') }), false);
  w.close();
});

test('apply assessment: never blocks applying when hire cannot be reached or the check fails', async () => {
  const failed = page({ onScript: node => node.onerror() });
  assert.equal(await failed.w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('t') }), true);
  failed.w.close();
  const broken = page({ onScript: (node, win) => { win.MscAssessment = { gate: async () => { throw new Error('boom'); } }; node.onload(); } });
  assert.equal(await broken.w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('t') }), true);
  broken.w.close();
  const missing = page();
  assert.equal(await missing.w.assessmentGate({ table: '', job: JOB, supabaseClient: client('t') }), true);
  assert.equal(await missing.w.assessmentGate({ table: 'Fresher Jobs', job: { id: null }, supabaseClient: client('t') }), true);
  missing.w.close();
});

test('apply assessment: a local hire preview only on localhost', async () => {
  const local = page({ url: 'http://localhost:8810/ca-fresher-jobs.html', storage: { 'msc:hire-api': 'http://localhost:8787' }, onScript: node => node.onerror() });
  await local.w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('t') });
  assert.equal(local.added[0].src, 'http://localhost:8787/assessment-take.js');
  local.w.close();
  const prod = page({ storage: { 'msc:hire-api': 'http://localhost:8787' }, onScript: node => node.onerror() });
  await prod.w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('t') });
  assert.equal(prod.added[0].src, 'https://hire.mystudentclub.com/assessment-take.js');
  prod.w.close();
  const odd = page({ url: 'http://localhost:8810/', storage: { 'msc:hire-api': 'https://evil.example' }, onScript: node => node.onerror() });
  await odd.w.assessmentGate({ table: 'Fresher Jobs', job: JOB, supabaseClient: client('t') });
  assert.equal(odd.added[0].src, 'https://hire.mystudentclub.com/assessment-take.js');
  odd.w.close();
});

test('apply assessment: every Easy Apply save point runs the gate before the application insert', () => {
  for (const [file, fn] of [['scripts/portal3.js', 'async function recordApplication('], ['scripts/job-details.js', 'async function recordRecruiterApplication('], ['scripts/portal-email.js', 'async function recordApplication(']]) {
    const source = read(file);
    assert.match(source, /import \{ assessmentGate(, pendingAssessmentAfterApply)? \} from '\.\/apply-assessment\.js';/, file);
    const start = source.indexOf(fn);
    assert.ok(start >= 0, `${file}: ${fn}`);
    const body = source.slice(start, source.indexOf('\n}\n', start));
    const gate = body.indexOf('assessmentGate(');
    const insert = body.indexOf(".from('job_applications')");
    assert.ok(gate > 0 && insert > gate, `${file}: the gate runs before the insert`);
    assert.match(body.slice(gate, insert), /return false;/, `${file}: leaving the assessment returns without applying`);
  }
});

// Signify 10906 (26 Nov 2026): 9 of 43 applied from the store app, whose build had no assessment gate, so their
// applications were saved with "Assessment not taken" and Easy Apply on www then only said "Already applied".
test('apply assessment: an applicant without the assessment can take it from Easy Apply', async () => {
  const taker = (info, result) => (node, win) => { win.MscAssessment = { status: async () => info, gate: async () => result }; node.onload(); };
  const args = { table: 'Industrial Training Job Portal', job: { id: 10906, Company: 'Signify' }, supabaseClient: client('t') };
  for (const [info, result, want] of [
    [{ required: true, status: 'not_started' }, true, 'submitted'],
    [{ required: true, status: 'in_progress' }, false, 'left'],
    [{ required: true, status: 'submitted' }, true, 'none'],
    [{ required: false }, true, 'none'],
    [null, true, 'none'],
  ]) {
    const { w } = page({ onScript: taker(info, result) });
    assert.equal(await w.pendingAssessmentAfterApply(args), want, JSON.stringify(info));
    w.close();
  }
  const down = page({ onScript: node => node.onerror() });
  assert.equal(await down.w.pendingAssessmentAfterApply(args), 'none');
  down.w.close();
});

test('apply assessment: the listing pages offer a pending assessment instead of a dead "Already applied"', () => {
  for (const file of ['scripts/portal3.js', 'scripts/portal-email.js']) {
    const source = read(file);
    const start = source.indexOf('async function recordApplication(');
    const body = source.slice(start, source.indexOf('\n}\n', start));
    const already = body.indexOf('appliedJobIds.has(job.id))) {');
    assert.ok(already > 0, file);
    assert.ok(body.indexOf('pendingAssessmentAfterApply(', already) > already && body.indexOf('pendingAssessmentAfterApply(') < body.indexOf('assessmentGate('), `${file}: already-applied path checks the assessment`);
  }
});
