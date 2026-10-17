const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const load = (file) => import(pathToFileURL(path.join(root, 'scripts/courses', file)).href);

test('search terms cannot change the shape of a PostgREST filter', async () => {
  const { sanitizeTerm, parseSearch, termOrFilter } = await load('match.js');
  assert.equal(sanitizeTerm('pvt (ltd), "audit" \\ % * :x'), 'pvt ltd audit x');
  assert.equal(sanitizeTerm('M&A / Ind-AS'), 'M&A / Ind-AS');
  assert.deepEqual(parseSearch('tax, audit , TAX, a, big 4'), ['tax', 'audit', 'big 4']);
  assert.deepEqual(parseSearch('(),"\\'), []);
  const filter = termOrFilter('phone pe', ['Company', 'Primary Domain']);
  assert.equal(filter, 'Company.ilike."*phone*pe*",' + '"Primary Domain".ilike."*phone*pe*"');
  assert.doesNotMatch(termOrFilter('x),Company.eq.(y', ['Company']), /\)|\(/);
});

test('city filter expands the /locations.json labels to every spelling', async () => {
  const { locationOrFilter } = await load('match.js');
  const { LOCATION_ALIASES } = await load('courses.js');
  const labels = require(path.join(root, 'locations.json'));
  for (const key of Object.keys(LOCATION_ALIASES)) assert.ok(labels.includes(key), `alias key ${key} is a locations.json label`);
  assert.equal(
    locationOrFilter(['Bangalore', 'Pune'], LOCATION_ALIASES),
    'Location.ilike."*Bangalore*",Location.ilike."*Bengaluru*",Location.ilike."*Pune*"'
  );
});

// Snippets taken from live listings on 2026-10-17: [text, matches CS, matches CMA].
const CASES = [
  ['Hetero is hiring CA/CMA Freshers for its Internal Audit team in Hyderabad.', false, true],
  ['🚀 We’re Hiring — CA Articles & CS Trainees!', true, false],
  ['Qualifications: CA/CMA/CS or MBA in Finance from a top-tier institute.', true, true],
  ['Semi-Qualified CA / CS / ICWA / CMA / M.Com / B.Com (Hons.) / LLB', true, true],
  ['Eligibility: CA Inter / CMA Inter completed', false, true],
  ['Eligibility: Chartered Accountant, Company Secretary, Cost Accountant, Law Graduate', true, true],
  ['🎓 CS Executive / CS Professional students', true, false],
  ['Qualification: CA / ICWA. Experience: 7–10 years in Manufacturing', false, true],
  ['Qualification: MBA/CMA with 3 years in costing', false, true],
  ['Hiring Semi-Qualified CMAs for our plant team', false, true],
  ['Open to CA / CMA (US) candidates with SAP experience', false, false],
  ['Preparation of CMA data and project reports for bank loans', false, false],
  ['Work closely with the Company Secretary and Compliance Officer on board meetings', false, false],
  ['Our firm comprising Chartered Accountants, Company Secretaries, and lawyers', false, false],
  ['Must be a qualified CA (ICWA/CS in addition will be an added advantage)', false, false],
  ['Customer support (CS) executives for our call centre', false, false],
  ['Handling SOW approvals and ICSI invoicing where applicable', false, false]
];

test('CS and CMA patterns tag real listings correctly', async () => {
  const { courseMatches } = await load('match.js');
  const { QUALIFICATIONS } = await load('courses.js');
  for (const [text, cs, cma] of CASES) {
    assert.equal(courseMatches(text, QUALIFICATIONS.cs.match), cs, `CS: ${text}`);
    assert.equal(courseMatches(text, QUALIFICATIONS.cma.match), cma, `CMA: ${text}`);
  }
});

test('listings that turn a course away are excluded', async () => {
  const { courseMatches } = await load('match.js');
  const { QUALIFICATIONS } = await load('courses.js');
  const cma = QUALIFICATIONS.cma.match;
  const cs = QUALIFICATIONS.cs.match;
  assert.ok(!courseMatches('This is a CA Article Trainee position (CMA candidates not eligible), offering', cma));
  assert.ok(!courseMatches('❌ Note: ACCA/CMA pursuing candidates should not apply.', cma));
  assert.ok(!courseMatches('Not eligible: Outstation candidates, CS/CMA interns, Accounting Assistants', cs));
  assert.ok(!courseMatches('CA preferred, or US CPA/CMA', cma));
  assert.ok(!courseMatches('Qualified Chartered Accountant (CA) or Certified Management Accountant (CMA) • 15+ years in fund accounting', cma));
  assert.ok(!courseMatches('Food/CPG manufacturing background, CMA or CGMA preferred', cma));
  assert.ok(courseMatches('Hiring CA/CMA freshers. Outstation candidates should not apply.', cma));
  assert.ok(courseMatches('CA / CS Articleship Opportunity in Noida', cs));
});

test('PostgreSQL word boundaries convert to JavaScript and every pattern compiles', async () => {
  const { pgToJs, toRegExp } = await load('match.js');
  const { QUALIFICATIONS, LANES } = await load('courses.js');
  assert.equal(pgToJs(String.raw`\mcs\M|\yx\y`), String.raw`\b(?=\w)cs\b(?<=\w)|\bx\b`);
  assert.ok(toRegExp(String.raw`\mcs\M`).test('CS Trainee') && !toRegExp(String.raw`\mcs\M`).test('Analytics'));
  const patterns = [];
  for (const q of Object.values(QUALIFICATIONS)) if (q.match) patterns.push(...Object.values(q.match));
  for (const lane of LANES) if (lane.trainerCheck) patterns.push(lane.trainerCheck.trainer, lane.trainerCheck.caFirm);
  for (const pattern of patterns) {
    assert.doesNotThrow(() => toRegExp(pattern), pattern);
    // \b is a backspace in PostgreSQL, so word edges must be written as \m / \M.
    assert.doesNotMatch(pattern, /\\b/, pattern);
  }
});

test('the matched sentence is quoted for students', async () => {
  const { matchContext } = await load('match.js');
  const { QUALIFICATIONS } = await load('courses.js');
  const text = `${'Intro. '.repeat(40)}Eligibility: CA / CS Executive passed candidates. ${'More text. '.repeat(30)}`;
  const quote = matchContext(text, QUALIFICATIONS.cs.match.pos, 30);
  assert.match(quote, /CS Executive/);
  assert.ok(quote.startsWith('…') && quote.endsWith('…'));
});

test('firm-training lanes tell a CA firm or an unnamed trainer from a PCS / Cost Accountant', async () => {
  const { trainerStatus } = await load('match.js');
  const { laneById, LANES } = await load('courses.js');
  const cs = laneById('cs-articleship').trainerCheck;
  const cma = laneById('cma-articleship').trainerCheck;
  const caFirm = [
    ['J. Singh & Associates, Chartered Accountants\nHiring CA/CS articles', cs],
    ['Mid-Size CA Firm in Delhi – CA/CMA/ACCA Articleship', cma],
    ['Enrollment in CA/CMA articleship as per ICAI guidelines', cma],
    ['A Arora & Co., a Chartered Accountancy firm based in Delhi. Position: CA / CMA Article Trainee', cma],
    ['Role: CA / CMA Articled Assistants', cma],
    ['Position: CA / CS Article Trainee', cs],
    ['is a professional accounting and audit firm. Support senior auditors in statutory and internal audits', cs],
    ['The firm provides statutory and risk-based audits, forensic audits and valuations', cma],
    ['Hiring CA/CMA articles', cma],
    ['Candidates who have completed ICITSS may apply', cma]
  ];
  for (const [text, check] of caFirm) assert.equal(trainerStatus(text, check), 'ca-firm', text);
  assert.equal(trainerStatus('Multi-disciplinary firm of Chartered Accountants and Practising Company Secretaries', cs), 'trainer');
  assert.equal(trainerStatus('NDM Advisors LLP, Chartered Accountants and Cost Accountants firm', cma), 'trainer');
  assert.equal(trainerStatus('PCS firm in Mumbai hiring CS Executive trainees', cs), 'trainer');
  assert.equal(trainerStatus('Hiring CS trainees for secretarial work', cs), 'unnamed');
  assert.equal(trainerStatus('Articleship Trainee (CMA Students) for costing work', cma), 'unnamed');
  for (const lane of LANES) {
    assert.equal(Boolean(lane.trainerCheck), lane.slot === 'articleship' && lane.qualification !== 'ca', `${lane.id}: trainerCheck only on CS/CMA firm lanes`);
    if (lane.trainerCheck) {
      for (const status of ['ca-firm', 'unnamed']) assert.ok(lane.trainerCheck[status]?.badge && lane.trainerCheck[status]?.note, `${lane.id}: ${status} copy`);
    }
  }
});


test('every CA, CS and CMA lane page resolves to its own lane', async () => {
  const { LANES, resolveLane, laneById } = await load('courses.js');
  for (const lane of LANES) {
    for (const variant of [lane.path, `${lane.path}.html`, `${lane.path}/`, lane.path.toUpperCase()]) {
      if (lane.path === '/' && variant !== '/') continue;
      assert.equal(resolveLane(variant).id, lane.id, variant);
    }
    assert.equal(resolveLane('/anything', { lane: lane.id }).id, lane.id);
  }
  for (const home of ['/', '/index.html', '/index', '']) assert.equal(resolveLane(home).id, 'ca-industrial', home);
  assert.equal(resolveLane('/no-such-page').id, 'ca-industrial');
  assert.equal(laneById('nope'), null);
});

test('CA lanes keep today\'s tables, subjects, AI titles, share types and banners', async () => {
  const { laneById } = await load('courses.js');
  const expect = {
    'ca-industrial': ['/', 'Industrial Training Job Portal', null, 'Application for CA Industrial Training', 'Industrial Trainee', 'industrial', 'Industrial'],
    'ca-articleship': ['/ca-articleship-opportunities', 'Articleship Jobs', null, 'Application for CA Articleship', 'Articleship Trainee', 'articleship', 'Articleship'],
    'ca-semi': ['/semi-qualified-ca-jobs', 'Semi Qualified Jobs', null, 'Application for Semi Qualified CA Position', 'Semi Qualified Chartered Accountant', 'semi', 'Semi-Qualified'],
    'ca-fresher': ['/ca-fresher-jobs', 'Fresher Jobs', 'Freshers', 'Application for CA Fresher Position', 'CA Fresher', 'fresher', 'Freshers'],
    'ca-experienced': ['/experienced-ca-jobs', 'Fresher Jobs', 'Experienced', 'Application for CA Fresher Position', 'CA Fresher', 'fresher', 'Freshers']
  };
  for (const [id, [p, table, experience, subject, aiTitle, shareType, bannerType]] of Object.entries(expect)) {
    const lane = laneById(id);
    assert.deepEqual([lane.path, lane.table, lane.experience, lane.emailSubject, lane.aiTitle, lane.shareType, lane.bannerType], [p, table, experience, subject, aiTitle, shareType, bannerType], id);
    assert.equal(lane.gate.recruiterLocked, true, `${id}: CA keeps the programme gate on recruiter posts`);
  }
  assert.equal(laneById('ca-industrial').gate.premium, 'industrialTraining');
});

test('lane registry is internally consistent', async () => {
  const { LANES, QUALIFICATION_ORDER, lanesFor } = await load('courses.js');
  const tables = new Set(['Industrial Training Job Portal', 'Articleship Jobs', 'Semi Qualified Jobs', 'Fresher Jobs']);
  const unique = (key) => new Set(LANES.map((l) => l[key])).size === LANES.length;
  for (const key of ['id', 'path', 'file']) assert.ok(unique(key), `${key} unique`);
  // CA freshers and experienced share the legacy "fresher" type; every other lane has its own.
  const shareTypes = LANES.filter((l) => l.id !== 'ca-experienced').map((l) => l.shareType);
  assert.equal(new Set(shareTypes).size, shareTypes.length, 'shareType unique');
  const prefs = LANES.flatMap((l) => l.preferences);
  assert.equal(new Set(prefs).size, prefs.length, 'a preference key lands on one lane');
  for (const q of QUALIFICATION_ORDER) {
    const lanes = lanesFor(q);
    assert.equal(lanes.length, 5, q);
    assert.deepEqual(new Set(lanes.map((l) => l.slot)), new Set(['industrial', 'articleship', 'semi', 'fresher', 'experienced']), q);
  }
  for (const lane of LANES) {
    assert.ok(tables.has(lane.table), lane.id);
    assert.ok(lane.navLabel.split(' ').length <= 2, `${lane.id}: two-word tab label fits the mobile grid`);
    if (lane.table === 'Fresher Jobs') assert.ok(['Freshers', 'Experienced'].includes(lane.experience), lane.id);
    if (lane.qualification !== 'ca') {
      assert.equal(lane.gate.recruiterLocked, false, `${lane.id}: no CA programme gate on CS/CMA Easy Apply`);
      for (const key of ['title', 'description', 'keywords', 'source']) assert.ok(lane[key], `${lane.id}.${key}`);
      assert.match(lane.title, / - My Student Club$/, lane.id);
      assert.doesNotMatch(lane.emailSubject, /\bCA\b/, `${lane.id}: subject does not call the student a CA`);
    }
  }
});

test('preferences, looking_for labels and profiles map to lanes both ways', async () => {
  const c = await load('courses.js');
  assert.deepEqual(c.splitPreference('cs_semi_fresher'), { qualification: 'cs', stage: 'semi_fresher' });
  assert.deepEqual(c.splitPreference('fresher_experienced'), { qualification: 'ca', stage: 'fresher_experienced' });
  assert.deepEqual(c.splitPreference('cs_nonsense'), { qualification: null, stage: null });
  assert.equal(c.joinPreference('cma', 'articleship'), 'cma_articleship');
  assert.equal(c.joinPreference('ca', 'industrial'), 'industrial');
  for (const lane of c.LANES) for (const pref of lane.preferences) assert.equal(c.laneForPreference(pref).id, lane.id, pref);
  const legacy = { 'CA Industrial Training Default': 'industrial', 'CA Articleship': 'articleship', 'CA Fresher': 'fresher_fresher', 'CA Freshers': 'fresher_fresher', 'CA Fresher (Experienced)': 'fresher_experienced', 'Semi Qualified CA': 'semi_fresher' };
  for (const [label, pref] of Object.entries(legacy)) assert.equal(c.preferenceForLookingFor(label), pref, label);
  assert.equal(c.preferenceForLookingFor('CS Articleship'), 'cs_articleship');
  assert.equal(c.lookingForOf('fresher_experienced'), 'CA Fresher');
  assert.equal(c.lookingForOf('cma_semi_experienced'), 'Semi Qualified CMA');
  assert.equal(c.qualificationOf({ profile: { qualification: 'CMA' } }), 'cma');
  assert.equal(c.qualificationOf({ qualification: 'cs', job_preference: 'industrial' }), 'cs');
  assert.equal(c.qualificationOf({ job_preference: 'cs_fresher_fresher' }), 'cs');
  assert.equal(c.qualificationOf({ looking_for: 'CA Articleship' }), 'ca');
  assert.equal(c.qualificationOf({ name: 'x' }), null);
  assert.equal(c.preferredLaneOf({ profile: { job_preference: 'cma_semi_experienced' } }).id, 'cma-semi');
  assert.equal(c.preferredLaneOf({ qualification: 'cs' }).id, 'cs-articleship');
  assert.equal(c.preferredLaneOf({}), null);
});

test('course switch keeps the kind of lane, except into a thin one', async () => {
  const { laneById, equivalentLane } = await load('courses.js');
  assert.equal(equivalentLane(laneById('ca-fresher'), 'cs').id, 'cs-fresher');
  assert.equal(equivalentLane(laneById('cs-semi'), 'cma').id, 'cma-semi');
  assert.equal(equivalentLane(laneById('ca-industrial'), 'cma').id, 'cma-industrial');
  assert.equal(equivalentLane(laneById('ca-industrial'), 'cs').id, 'cs-articleship', 'CS company training is thin');
  assert.equal(equivalentLane(laneById('cs-experienced'), 'ca').id, 'ca-experienced');
});

test('shared links keep the old CA types and add one per CS/CMA lane', async () => {
  const { LANES, laneForShareType } = await load('courses.js');
  const legacy = { industrial: 'ca-industrial', articleship: 'ca-articleship', semi: 'ca-semi', 'semi-qualified': 'ca-semi', fresher: 'ca-fresher' };
  for (const [type, id] of Object.entries(legacy)) assert.equal(laneForShareType(type).id, id, type);
  for (const lane of LANES.filter((l) => l.qualification !== 'ca')) assert.equal(laneForShareType(lane.shareType).id, lane.id);
  assert.equal(laneForShareType('bogus'), null);
});

test('lane scope filters CS/CMA lanes on the server and leaves CA alone before the migration', async () => {
  const { applyLaneScope, laneById, REGEX_WINDOW_DAYS, QUALIFICATIONS } = await load('courses.js');
  const recorder = () => {
    const calls = [];
    const q = new Proxy({}, { get: (_, name) => (...args) => { calls.push([name, ...args]); return q; } });
    return { q, calls };
  };
  const now = Date.UTC(2026, 9, 17);
  let r = recorder();
  applyLaneScope(r.q, laneById('ca-fresher'), { mode: 'regex', now });
  assert.deepEqual(r.calls, [], 'CA lanes are unfiltered in regex mode');
  r = recorder();
  applyLaneScope(r.q, laneById('ca-fresher'), { mode: 'tagged', now });
  assert.deepEqual(r.calls, [['contains', 'eligible_courses', ['CA']]]);
  r = recorder();
  applyLaneScope(r.q, laneById('cs-fresher'), { mode: 'regex', now });
  const { pre, pos, neg } = QUALIFICATIONS.cs.match;
  assert.deepEqual(r.calls, [
    ['gte', 'Created_At', new Date(now - REGEX_WINDOW_DAYS * 86400000).toISOString()],
    ['filter', 'Description', 'imatch', pre],
    ['filter', 'Description', 'imatch', pos],
    ['not', 'Description', 'imatch', neg]
  ]);
  r = recorder();
  applyLaneScope(r.q, laneById('cma-industrial'), { mode: 'tagged', now });
  assert.deepEqual(r.calls, [['contains', 'eligible_courses', ['CMA']], ['or', 'is_exclusive.is.null,is_exclusive.eq.false,posted_by.not.is.null']]);
});
