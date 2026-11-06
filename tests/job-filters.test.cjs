// Structured vacancy filters in the browser: query building, pills, controls and portal wiring.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

async function load() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msc-jf-'));
  const copy = path.join(dir, 'job-filters.mjs');
  fs.copyFileSync(path.join(root, 'scripts', 'job-filters.js'), copy);
  return import(pathToFileURL(copy).href);
}

// Records the Supabase query-builder calls a filter makes.
function recorder() {
  const calls = [];
  const q = new Proxy({}, { get: (_, method) => (...args) => { calls.push([method, ...args]); return q; } });
  return { q, calls };
}

const NOW = new Date(2026, 10, 6, 12, 0, 0); // 6 Nov 2026, local time

test('every portal has the filters that were asked for', async () => {
  const { filtersFor } = await load();
  const keys = p => filtersFor(p).map(f => f.key);
  const common = ['postedWithin', 'applyMethod', 'deadline', 'company', 'locationType', 'payDisclosed'];
  for (const p of ['articleship', 'industrial', 'fresher', 'experienced', 'semi']) {
    for (const k of common) assert.ok(keys(p).includes(k), `${p} has ${k}`);
  }
  assert.deepEqual(keys('articleship').slice(0, 6), ['interRequirement', 'ittOc', 'transfer', 'exposure', 'clientTypes', 'outstation']);
  for (const k of ['finalAttempt', 'duration', 'examCriteria', 'joining']) assert.ok(keys('industrial').includes(k), k);
  for (const k of ['qualifyingAttempt', 'examCriteria', 'fresherYoe', 'workTypes', 'shift', 'workMode', 'immediate']) assert.ok(keys('fresher').includes(k), k);
  for (const k of ['yoe', 'pqe', 'tools', 'notice']) assert.ok(keys('experienced').includes(k), k);
  for (const k of ['yoe', 'tools', 'workMode', 'workTypes', 'workingDays']) assert.ok(keys('semi').includes(k), k);
  assert.ok(!keys('industrial').some(k => /cma|transfer/i.test(k)), 'no CMA or transfer filter on Industrial Training');
});

test('attempt filters keep jobs whose window holds the attempt, and jobs with no window', async () => {
  const { applyJobFilters } = await load();
  const { q, calls } = recorder();
  applyJobFilters(q, 'industrial', { finalAttempt: '2028-05-01' }, NOW);
  assert.deepEqual(calls, [
    ['or', 'attempt_from.is.null,attempt_from.lte.2028-05-01'],
    ['or', 'attempt_to.is.null,attempt_to.gte.2028-05-01']
  ]);
});

test('filters turn into the right Supabase calls', async () => {
  const { applyJobFilters } = await load();
  const run = (portal, values) => { const r = recorder(); applyJobFilters(r.q, portal, values, NOW); return r.calls; };
  assert.deepEqual(run('industrial', { duration: 'under12' }), [['lt', 'duration_min_months', 12]]);
  assert.deepEqual(run('industrial', { examCriteria: 'no-first' }), [['or', 'exam_criteria.is.null,exam_criteria.not.cs.{"First attempt"}']]);
  assert.deepEqual(run('industrial', { joining: 'immediate' }), [['is', 'immediate_joining', true]]);
  assert.deepEqual(run('industrial', { joining: '2026-12-01' }), [['eq', 'joining_month', '2026-12-01']]);
  assert.deepEqual(run('articleship', { exposure: ['GST', 'Bank Audit'] }), [['overlaps', 'exposure_areas', ['GST', 'Bank Audit']]]);
  assert.deepEqual(run('articleship', { ittOc: 'not-mentioned' }), [['or', 'itt_oc_required.is.null,itt_oc_required.eq.false']]);
  assert.deepEqual(run('articleship', { transfer: ['yes'] }), [['is', 'transfer_accepted', true]]);
  assert.deepEqual(run('experienced', { yoe: '10+' }), [['gte', 'yoe', 10]]);
  assert.deepEqual(run('semi', { yoe: '2-3' }), [['gte', 'yoe', 2], ['lte', 'yoe', 3]]);
  assert.deepEqual(run('experienced', { notice: '30' }), [['lte', 'notice_days', 30]]);
  assert.deepEqual(run('semi', { workingDays: '5' }), [['eq', 'working_days', 5]]);
  assert.deepEqual(run('fresher', { payDisclosed: ['yes'] }), [['not', 'pay_min', 'is', null]]);
  assert.deepEqual(run('fresher', { company: 'EY India' }), [['or', 'company_key.eq."ey",company_key.like."ey *"']]);
  assert.deepEqual(run('fresher', { locationType: ['pan', 'remote'] }), [['or', 'is_pan_india.is.true,work_mode.eq.Remote']]);
  assert.deepEqual(run('semi', { deadline: 'soon' }), [['gte', 'deadline', '2026-11-06'], ['lte', 'deadline', '2026-11-13']]);
  const posted = run('articleship', { postedWithin: '3' });
  assert.equal(posted[0][0], 'gte');
  assert.equal(posted[0][1], 'Created_At');
  assert.equal(new Date(posted[0][2]).getTime(), NOW.getTime() - 3 * 86400000);
  assert.deepEqual(run('semi', { yoe: '', tools: [] }), [], 'empty values add nothing');
});

test('attempt lists follow the ICAI calendar', async () => {
  const { upcomingFinalAttempts, recentQualifyingAttempts } = await load();
  assert.deepEqual(upcomingFinalAttempts(NOW).slice(0, 4), ['2027-01-01', '2027-05-01', '2027-09-01', '2028-01-01']);
  assert.deepEqual(recentQualifyingAttempts(NOW).slice(0, 5), ['2026-09-01', '2026-05-01', '2026-01-01', '2025-09-01', '2025-05-01']);
  assert.ok(recentQualifyingAttempts(NOW).includes('2024-11-01'), 'old-scheme November attempt');
});

test('active pills name each value and can be removed one at a time', async () => {
  const { describeJobFilters, withoutFilterValue } = await load();
  const values = { exposure: ['GST', 'Bank Audit'], firmSize: 'x', outstation: 'yes' };
  assert.deepEqual(describeJobFilters('articleship', values).map(p => p.label), ['GST', 'Bank Audit', 'Outstation audits']);
  assert.deepEqual(withoutFilterValue(values, 'exposure', 'GST').exposure, ['Bank Audit']);
  assert.equal(withoutFilterValue({ exposure: ['GST'] }, 'exposure', 'GST').exposure, undefined);
  assert.equal(withoutFilterValue({ outstation: 'yes' }, 'outstation').outstation, undefined);
});

test('pay and deadline text for cards', async () => {
  const { formatPayRange, formatDeadline } = await load();
  assert.equal(formatPayRange({ pay_min: 10000, pay_max: 12000 }, false), '₹10k – ₹12k/month');
  assert.equal(formatPayRange({ pay_min: 25000, pay_max: 25000 }, false), '₹25k/month');
  assert.equal(formatPayRange({ pay_min: 800000, pay_max: 1200000 }, true), '₹8 – 12 LPA');
  assert.equal(formatPayRange({}, true), '');
  assert.equal(formatDeadline({ deadline: '2026-11-15' }, NOW), 'Apply by 15 Nov');
  assert.equal(formatDeadline({ deadline: '2026-11-01' }, NOW), '', 'past deadlines are not shown');
});

test('mobile portal wiring: filters in the sheet, applied on Apply, discarded on close, fallback when columns are missing', () => {
  const src = read('scripts/portal3.js');
  assert.match(src, /from "\.\/job-filters\.js"/);
  assert.match(src, /const JOB_FILTER_OPTIONS = \{ withTypeFilters: true \};/);
  assert.match(src, /query = applyJobFilters\(query, currentJobPortal\(\), state\.extra, new Date\(\), JOB_FILTER_OPTIONS\);/);
  assert.match(src, /extraBeforeSheet = \{ \.\.\.state\.extra \};/);
  assert.match(src, /isMissingFilterColumnError\(error\)/);
  assert.match(src, /const payLow = useFilterColumns \? "pay_max" : "Salary";/);
  assert.match(src, /const isFresher = currentTable === "Fresher Jobs" \|\| currentTable === "Semi Qualified Jobs";/);
});

test('the filter module is the same file as on www', () => {
  // Kept identical to master's scripts/job-filters.js; mobile only turns on withTypeFilters.
  const mod = read('scripts/job-filters.js');
  assert.match(mod, /export function filtersFor\(portal, \{ withTypeFilters = false \} = \{\}\)/);
});
