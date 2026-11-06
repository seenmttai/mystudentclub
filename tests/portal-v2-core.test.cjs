// Job portal v2: freshness ranking, exclusive gating, columns, filters and text safety (scripts/portal-v2/jobs-core.js).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

// ES modules in a "type": "commonjs" package: import .mjs copies (imports rewritten to the copies).
async function loadPortalModules() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msc-pv2-'));
  for (const name of ['jobs-core', 'job-view']) {
    const source = fs.readFileSync(path.join(root, 'scripts', 'portal-v2', `${name}.js`), 'utf8')
      .replace(/'\.\/jobs-core\.js(\?v=\d+)?'/g, "'./jobs-core.mjs'");
    fs.writeFileSync(path.join(dir, `${name}.mjs`), source);
  }
  return {
    core: await import(pathToFileURL(path.join(dir, 'jobs-core.mjs')).href),
    view: await import(pathToFileURL(path.join(dir, 'job-view.mjs')).href),
  };
}

const NOW = new Date('2026-11-06T06:30:00Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * 86400000).toISOString();
let core;
test.before(async () => { ({ core } = await loadPortalModules()); });

test('a vacancy is dated by Posted_Date when present, else Created_At, and never in the future', () => {
  assert.equal(core.postedAt({ Posted_Date: daysAgo(3), Created_At: daysAgo(1) }, NOW).toISOString(), daysAgo(3));
  assert.equal(core.postedAt({ Posted_Date: null, Created_At: daysAgo(1) }, NOW).toISOString(), daysAgo(1));
  assert.equal(core.postedAt({ Posted_Date: 'not a date', Created_At: daysAgo(2) }, NOW).toISOString(), daysAgo(2));
  assert.equal(core.postedAt({ Posted_Date: daysAgo(-3), Created_At: daysAgo(1) }, NOW).toISOString(), daysAgo(1));
  assert.equal(core.postedAt({}, NOW), null);
});

test('fresh means posted within 15 days; new means within 48 hours', () => {
  assert.equal(core.FRESH_DAYS, 15);
  assert.equal(core.isFresh({ Created_At: daysAgo(14.9) }, NOW), true);
  assert.equal(core.isFresh({ Created_At: daysAgo(15) }, NOW), true);
  assert.equal(core.isFresh({ Created_At: daysAgo(15.01) }, NOW), false);
  assert.equal(core.isFresh({ Created_At: daysAgo(1), Posted_Date: daysAgo(20) }, NOW), false, 'Posted_Date wins');
  assert.equal(core.isFresh({}, NOW), false, 'no date is never fresh');
  assert.equal(core.isNew({ Created_At: daysAgo(1.9) }, NOW), true);
  assert.equal(core.isNew({ Created_At: daysAgo(2.1) }, NOW), false);
  assert.equal(core.postedLabel({ Created_At: daysAgo(0.01) }, NOW), 'Just now');
  assert.equal(core.postedLabel({ Created_At: daysAgo(0.25) }, NOW), '6h ago');
  assert.equal(core.postedLabel({ Created_At: daysAgo(1) }, NOW), '1 day ago');
  assert.equal(core.postedLabel({ Created_At: daysAgo(23) }, NOW), '23 days ago');
});

test('ranking: newest first, and nothing older than 15 days above a fresher vacancy, whatever the sort', () => {
  const portal = core.PORTALS.industrial;
  const jobs = [
    { id: 1, Created_At: daysAgo(5), Salary: 15000, application_count: 3 },
    { id: 2, Created_At: daysAgo(0.5), Salary: 20000, application_count: 1 },
    { id: 3, Created_At: daysAgo(40), Salary: 90000, application_count: 900 },
    { id: 4, Created_At: daysAgo(2), Posted_Date: daysAgo(17), Salary: 80000 },
    { id: 5, Salary: 99000 },
    { id: 6, Created_At: daysAgo(10), Salary: 40000, application_count: 50 },
  ];
  const newest = core.rankJobs(jobs, { now: NOW, portal });
  assert.deepEqual(newest.fresh.map((j) => j.id), [2, 1, 6]);
  assert.deepEqual(newest.older.map((j) => j.id), [4, 3, 5], 'older by date, undated last');
  const pay = core.rankJobs(jobs, { sort: 'pay', now: NOW, portal });
  assert.deepEqual(pay.fresh.map((j) => j.id), [6, 2, 1]);
  assert.deepEqual(pay.older.map((j) => j.id), [4, 3, 5], 'a high stipend never lifts an old vacancy');
  const popular = core.rankJobs(jobs, { sort: 'popular', now: NOW, portal });
  assert.deepEqual(popular.fresh.map((j) => j.id), [6, 1, 2]);
});

test('exclusive vacancies: apply details only for the portal programme, on every portal', () => {
  const { PORTALS, canSeeApplyDetails, isEnrolledInProgramme } = core;
  const exclusive = { id: 1, is_exclusive: true };
  const normal = { id: 2, is_exclusive: false };
  const cases = [
    ['industrial', ['industrial-training-mastery'], ['msc-ca-freshers-program']],
    ['semi', ['industrial-training-mastery'], ['msc-ca-freshers-program']],
    ['fresher', ['msc-ca-freshers-program'], ['industrial-training-mastery']],
    ['experienced', ['msc-ca-freshers-program'], ['msc-articleship-program']],
    ['articleship', ['msc-articleship-program'], ['industrial-training-mastery']],
  ];
  for (const [key, yes, no] of cases) {
    const portal = PORTALS[key];
    assert.equal(canSeeApplyDetails(exclusive, portal, yes), true, `${key}: enrolled`);
    assert.equal(canSeeApplyDetails(exclusive, portal, no), false, `${key}: other programme`);
    assert.equal(canSeeApplyDetails(exclusive, portal, []), false, `${key}: not enrolled`);
    assert.equal(canSeeApplyDetails(exclusive, portal, null), false, `${key}: logged out`);
    assert.equal(canSeeApplyDetails(normal, portal, []), true, `${key}: not exclusive`);
    assert.equal(isEnrolledInProgramme(portal, yes), true);
  }
  // Recruiter-posted (hire.msc) is not exclusive unless ticked.
  assert.equal(core.isExclusiveJob({ posted_by: 'uuid', hirer_email: 'hr@example.com' }), false);
  assert.equal(core.isTeamPosted({ posted_by: 'uuid' }), true);
  assert.equal(core.isTeamPosted({ 'Application ID': ' Recruit@MyStudentClub.com ' }), true);
});

test('apply states', () => {
  const portal = core.PORTALS.fresher;
  const state = (job, ctx) => core.applyState(job, portal, ctx);
  assert.equal(state({ is_exclusive: true }, { loggedIn: true, courses: [] }), 'locked');
  assert.equal(state({ is_exclusive: true }, { loggedIn: false }), 'locked');
  assert.equal(state({}, { loggedIn: false }), 'login');
  assert.equal(state({ posted_by: 'x' }, { loggedIn: true }), 'easy');
  assert.equal(state({}, { loggedIn: true }), 'unlock');
  assert.equal(state({}, { loggedIn: true, unlocked: { applicationId: 'hr@example.com' } }), 'revealed');
  assert.equal(state({ is_exclusive: true }, { loggedIn: true, courses: ['msc-ca-freshers-program'] }), 'unlock');
});

test('public queries never name a private column; optional columns can be dropped', () => {
  for (const portal of Object.values(core.PORTALS)) {
    for (const columns of [core.listColumns(portal), core.detailColumns(portal)]) {
      assert.equal(core.hasPrivateColumn(columns), false, `${portal.key}: ${columns}`);
      assert.doesNotMatch(columns, /posts_link|Application ID|Apply_Link/);
      assert.match(columns, /Posted_Date/);
      assert.match(columns, /is_exclusive/);
    }
    assert.doesNotMatch(core.listColumns(portal, { omit: ['is_exclusive', 'hidden'] }), /is_exclusive|hidden/);
  }
  const job = core.publicJob({ id: 1, Company: 'A', posts_link: 'https://www.linkedin.com/posts/x', 'Application ID': 'hr@a.com', Apply_Link: 'https://a.com' });
  assert.deepEqual(Object.keys(job), ['id', 'Company']);
});

test('select fallback: missing columns are retried without; permission errors drop hidden before is_exclusive', async () => {
  const calls = [];
  const missing = { message: 'column Fresher Jobs.hidden does not exist', code: '42703' };
  let result = await core.selectWithFallback(async (omit) => {
    calls.push(omit.join('+'));
    return omit.includes('hidden') ? { data: [{ id: 1 }], error: null } : { data: null, error: missing };
  });
  assert.deepEqual(calls, ['', 'hidden']);
  assert.deepEqual(result.omitted, ['hidden']);
  assert.deepEqual(result.data, [{ id: 1 }]);

  calls.length = 0;
  const denied = { message: 'permission denied for table Fresher Jobs', code: '42501' };
  result = await core.selectWithFallback(async (omit) => {
    calls.push(omit.join('+'));
    return omit.length === 2 ? { data: [], error: null } : { data: null, error: denied };
  });
  assert.deepEqual(calls, ['', 'hidden', 'hidden+is_exclusive']);

  result = await core.selectWithFallback(async () => ({ data: null, error: { message: 'Failed to fetch' } }));
  assert.equal(result.error.message, 'Failed to fetch');
  result = await core.selectWithFallback(async (omit) => ({ data: [omit.length], error: null }), ['is_exclusive']);
  assert.deepEqual(result.omitted, ['is_exclusive'], 'a remembered omission is kept');
});

test('portals: paths, experience locks and share types', () => {
  assert.equal(core.portalFromPath('/').key, 'industrial');
  assert.equal(core.portalFromPath('/index.html').key, 'industrial');
  assert.equal(core.portalFromPath('/ca-fresher-jobs').key, 'fresher');
  assert.equal(core.portalFromPath('/ca-fresher-jobs.html').key, 'fresher');
  assert.equal(core.portalFromPath('/experienced-ca-jobs').key, 'experienced');
  assert.equal(core.portalFromPath('/semi-qualified-ca-jobs').key, 'semi');
  assert.equal(core.portalFromPath('/ca-articleship-opportunities').key, 'articleship');
  assert.equal(core.portalFromJobType('semi-qualified').key, 'semi');
  assert.equal(core.portalFromJobType('experienced').key, 'experienced');
  assert.equal(core.portalFromJobType('nonsense').key, 'industrial');
  const { fresher, experienced } = core.PORTALS;
  assert.equal(core.matchesPortalBase({ Experience: 'Freshers', yoe: 1 }, fresher), true);
  assert.equal(core.matchesPortalBase({ Experience: 'Freshers', yoe: null }, fresher), true);
  assert.equal(core.matchesPortalBase({ Experience: 'Freshers', yoe: 3 }, fresher), false);
  assert.equal(core.matchesPortalBase({ Experience: 'Experienced', yoe: 0 }, fresher), false);
  assert.equal(core.matchesPortalBase({ Experience: 'Experienced', yoe: 8 }, experienced), true);
  assert.equal(core.matchesPortalBase({ Experience: 'Freshers', hidden: true }, fresher), false, 'hidden vacancies never list');
  assert.equal(core.shareUrl({ id: 7 }, experienced, ''), '/job.html?id=7&type=experienced');
});

test('search and filters', () => {
  const portal = core.PORTALS.fresher;
  const ctx = { now: NOW, appliedIds: new Set(['3']) };
  const base = { Experience: 'Freshers', Created_At: daysAgo(1) };
  const jobs = [
    { ...base, id: 1, Company: 'PhonePe', Job_Title: 'Financial Analyst', Location: 'Bengaluru, Karnataka, India', 'Primary Domain': 'FP&A', Salary: 1200000, 'Company Type': 'Startup' },
    { ...base, id: 2, Company: 'Deloitte', Job_Title: 'Audit Associate', Location: 'Gurgaon, Haryana', 'Primary Domain': 'Statutory Audit', Salary: 60000, Tags: ['GST', 'SAP'] },
    { ...base, id: 3, Company: 'HDFC Bank', Location: 'Mumbai', 'Primary Domain': 'Banking & Credit', Created_At: daysAgo(5), is_exclusive: true },
  ];
  const match = (f) => jobs.filter((j) => core.matchesFilters(j, { ...core.emptyFilters(), ...f }, portal, ctx)).map((j) => j.id);
  assert.deepEqual(match({ q: 'phone pe' }), [1]);
  assert.deepEqual(match({ q: 'bangalore' }), [1], 'Bangalore finds Bengaluru');
  assert.deepEqual(match({ q: 'sap' }), [2], 'tags are searched');
  assert.deepEqual(match({ q: 'audit gurugram' }), [2]);
  assert.deepEqual(match({ cities: ['Gurugram'] }), [2], 'Gurgaon is Gurugram');
  assert.deepEqual(match({ cities: ['Mumbai', 'Bengaluru'] }), [1, 3]);
  assert.deepEqual(match({ domains: ['FP&A'] }), [1]);
  assert.deepEqual(match({ payMin: 700000 }), [1, 2], '₹60k a month is ₹7.2 LPA');
  assert.deepEqual(match({ payMin: 1000000 }), [1]);
  assert.deepEqual(match({ posted: '3' }), [1, 2]);
  assert.deepEqual(match({ exclusiveOnly: true }), [3]);
  assert.deepEqual(match({ notApplied: true }), [1, 2]);
  const counts = core.facetCounts(jobs, { ...core.emptyFilters(), cities: ['Mumbai'] }, portal, ctx);
  assert.deepEqual(counts.city.map((o) => o.value).sort(), ['Bengaluru', 'Gurugram', 'Mumbai'], 'a facet counts as if its own choice were not made');
  assert.deepEqual(counts.domain, [{ value: 'Banking & Credit', count: 1 }], 'other facets follow the city choice');
});

test('pay: per-portal units and recruiter ranges', () => {
  const { PORTALS, formatPay, payValue } = core;
  assert.equal(formatPay({ Salary: 25000 }, PORTALS.industrial), '₹25k/month');
  assert.equal(formatPay({ Salary: 12500 }, PORTALS.articleship), '₹12.5k/month');
  assert.equal(formatPay({ Salary: 1200000 }, PORTALS.fresher), '₹12 LPA');
  assert.equal(formatPay({ Salary: 35000 }, PORTALS.semi), '₹4.2 LPA', 'monthly figure on a salary portal');
  assert.equal(formatPay({ Salary: 12 }, PORTALS.experienced), '₹12 LPA', '"12" means 12 LPA');
  assert.equal(formatPay({ Salary: null, 'CTC Range': '₹10–12 LPA' }, PORTALS.fresher), '₹10–12 LPA');
  assert.equal(formatPay({ Salary: 0, 'Stipend Range': 'Not disclosed' }, PORTALS.industrial), '');
  assert.equal(payValue({ Salary: 500 }, PORTALS.industrial), null);
  assert.equal(payValue({ Salary: 1500020000 }, PORTALS.articleship), null, '"15000-20000" stored as one number');
  assert.equal(payValue({ Salary: 900000000 }, PORTALS.fresher), null);
  assert.equal(formatPay({ Salary: 1500020000, 'Stipend Range': '₹15,000 – ₹20,000' }, PORTALS.articleship), '₹15,000 – ₹20,000');
  assert.equal(core.payPresetLabel(20000, PORTALS.industrial), '₹20k+');
  assert.equal(core.payPresetLabel(1200000, PORTALS.fresher), '₹12 LPA+');
});

test('locations', () => {
  assert.equal(core.displayLocation('Mumbai, Maharashtra, India'), 'Mumbai');
  assert.equal(core.displayLocation('Lower Parel, Mumbai'), 'Lower Parel, Mumbai');
  assert.equal(core.displayLocation('India'), 'India');
  assert.equal(core.displayLocation(''), 'Location not given');
  assert.deepEqual(core.citiesOf('Delhi, Mumbai, Chennai, Vadodara and Kolkata'), ['Mumbai', 'Delhi', 'Chennai', 'Kolkata', 'Vadodara']);
  assert.deepEqual(core.citiesOf('Bangalore Urban'), ['Bengaluru']);
});

test('filters survive the URL and stay safe for PostgREST', () => {
  const filters = { ...core.emptyFilters(), q: 'big 4', cities: ['Mumbai', 'Pune'], domains: ['FP&A'], payMin: 20000, posted: '7', exclusiveOnly: true, experience: 'Experienced', yoe: '3-5' };
  const params = core.filtersToParams(filters, 'pay');
  const back = core.filtersFromParams(params.toString());
  assert.deepEqual(back.filters, filters);
  assert.equal(back.sort, 'pay');
  assert.deepEqual(core.filtersFromParams('posted=99&sort=evil&yoe=x&pay=-5').filters, core.emptyFilters());
  assert.equal(core.sanitizeForFilter('a,b(c)"d\'e%f*g:h\\i'), 'a b c d e f g h i');

  const calls = [];
  const builder = new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, ...args]); return builder; } });
  core.applyServerFilters(builder, { ...core.emptyFilters(), q: 'kpmg,or(x)', cities: ['Bengaluru'], domains: ['Banking, Financial Services & Insurance (BFSI)'] }, core.PORTALS.fresher);
  assert.deepEqual(calls[0], ['eq', 'Experience', 'Freshers']);
  assert.deepEqual(calls[1], ['or', 'yoe.is.null,yoe.lte.1']);
  for (const [, filter] of calls.filter((c) => c[0] === 'or').slice(1)) assert.doesNotMatch(filter, /\(x\)|kpmg,/);
  assert.ok(calls.some((c) => c[0] === 'or' && /Location\.ilike\.\*bangalore\*/.test(c[1])));
  assert.ok(calls.some((c) => c[0] === 'or' && c[1] === '"Primary Domain".in.("Banking, Financial Services & Insurance (BFSI)"),Category.in.("Banking, Financial Services & Insurance (BFSI)")'), 'domain asks Primary Domain or Category, quoted');
  calls.length = 0;
  core.applyServerFilters(builder, { ...core.emptyFilters(), easyApplyOnly: true, companyTypes: ['Big 4'] }, core.PORTALS.semi);
  assert.deepEqual(calls, [['in', 'Company Type', ['Big 4']], ['or', 'posted_by.not.is.null,hirer_email.not.is.null']]);
});

test('descriptions are escaped, links limited to http(s), contacts masked for teasers', () => {
  const html = core.descriptionHtml('## Role\n**Audit** work\n- GST\n- <img src=x onerror=alert(1)>\n[apply](javascript:alert(1)) [site](https://acme.com/jobs)');
  assert.match(html, /<h4>Role<\/h4>/);
  assert.match(html, /<strong>Audit<\/strong>/);
  assert.match(html, /<li>GST<\/li>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img|href="javascript/i);
  assert.match(html, /<a href="https:\/\/acme\.com\/jobs" target="_blank" rel="noopener noreferrer nofollow">site<\/a>/);
  const masked = core.descriptionHtml('Mail hr@acme.com or call +91 98765 43210, see https://acme.com/apply', { mask: true });
  assert.doesNotMatch(masked, /hr@acme|98765|acme\.com\/apply/);
  assert.match(masked, /\[email hidden\]/);
  assert.match(masked, /\[phone hidden\]/);
  assert.match(masked, /\[link hidden\]/);
  assert.ok(core.descriptionHtml('word '.repeat(200), { maxLength: 100 }).length < 140);
  assert.equal(core.escapeHtml('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
  assert.equal(core.safeHttpUrl('javascript:alert(1)'), '');
  assert.equal(core.safeHttpUrl(' https://a.com/x '), 'https://a.com/x');
});

test('saved vacancies and programme perks', () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const table = core.PORTALS.semi.table;
  assert.equal(core.toggleSavedJob(storage, { id: 'a-uuid' }, table, new Date('2026-11-06T00:00:00Z')), true);
  assert.equal(core.isSavedJob(storage, { id: 'a-uuid' }, table), true);
  assert.equal(core.isSavedJob(storage, { id: 'a-uuid' }, 'Fresher Jobs'), false);
  assert.deepEqual(JSON.parse(store.get('msc_saved_jobs')), [{ id: 'a-uuid', table, savedAt: '2026-11-06T00:00:00.000Z' }], 'same format My Applications reads');
  assert.equal(core.toggleSavedJob(storage, { id: 'a-uuid' }, table), false);
  store.set('msc_saved_jobs', 'not json');
  assert.deepEqual(core.readSavedJobs(storage), []);
  assert.equal(core.hasProgrammePerks(core.PORTALS.industrial, ['msc-ca-freshers-program']), false);
  assert.equal(core.hasProgrammePerks(core.PORTALS.industrial, ['industrial-training-mastery']), true);
  assert.equal(core.hasProgrammePerks(core.PORTALS.articleship, ['msc-ca-freshers-program']), true);
  assert.equal(core.hasProgrammePerks(core.PORTALS.semi, []), false);
});

test('application details and headlines', () => {
  assert.deepEqual(core.applicationTargets('hr@acme.com, https://acme.com/careers ; Acme Ltd').map((t) => t.kind), ['email', 'url', 'search']);
  assert.equal(core.applicationTargets('').length, 0);
  const portal = core.PORTALS.industrial;
  assert.deepEqual(core.cardHeadline({ Company: 'Wipro', Job_Title: null, 'Primary Domain': 'Internal Audit' }, portal), { title: 'Wipro', subtitle: 'Internal Audit · Industrial Trainee', companyFirst: true });
  assert.deepEqual(core.cardHeadline({ Company: 'Wipro', Job_Title: 'Finance Trainee' }, portal), { title: 'Finance Trainee', subtitle: 'Wipro', companyFirst: false });
});
