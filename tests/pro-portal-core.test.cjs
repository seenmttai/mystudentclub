const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const load = (file) => import(pathToFileURL(path.join(root, 'scripts/pro-portal', file)).href);

test('search terms cannot change the shape of a PostgREST filter', async () => {
  const { sanitizeTerm, parseSearch, termOrFilter } = await load('core.js');
  assert.equal(sanitizeTerm('pvt (ltd), "audit" \\ % * :x'), 'pvt ltd audit x');
  assert.equal(sanitizeTerm('M&A / Ind-AS'), 'M&A / Ind-AS');
  assert.deepEqual(parseSearch('tax, audit , TAX, a, big 4'), ['tax', 'audit', 'big 4']);
  assert.deepEqual(parseSearch('(),"\\'), []);
  assert.equal(parseSearch('a,b,c,d,e,f,g,h'.split(',').map((c) => c + c).join(',')).length, 5);
  const filter = termOrFilter('phone pe', ['Company', 'Primary Domain']);
  assert.equal(filter, 'Company.ilike."*phone*pe*",' + '"Primary Domain".ilike."*phone*pe*"');
  assert.doesNotMatch(termOrFilter('x),Company.eq.(y', ['Company']), /\)|\(/);
});

test('city filter expands to every spelling used in listings', async () => {
  const { locationOrFilter } = await load('core.js');
  const { LOCATION_ALIASES } = await load('config.js');
  assert.equal(
    locationOrFilter(['Bengaluru', 'Pune'], LOCATION_ALIASES),
    'Location.ilike."*Bengaluru*",Location.ilike."*Bangalore*",Location.ilike."*Pune*"'
  );
});

// Snippets taken from live listings on 2026-10-17.
const CASES = [
  ['Hetero is hiring CA/CMA Freshers for its Internal Audit team in Hyderabad.', ['CA', 'CMA']],
  ['🚀 We’re Hiring — CA Articles & CS Trainees!', ['CA', 'CS']],
  ['Qualifications: CA/CMA/CS or MBA in Finance from a top-tier institute.', ['CA', 'CS', 'CMA']],
  ['Semi-Qualified CA / CS / ICWA / CMA / M.Com / B.Com (Hons.) / LLB', ['CA', 'CS', 'CMA']],
  ['Eligibility: CA Inter / CMA Inter completed', ['CA', 'CMA']],
  ['Chartered Accountant, Company Secretary, Cost Accountant, Law Graduate', ['CA', 'CMA']],
  ['🎓 CS Executive / CS Professional students', ['CS']],
  ['Qualification: CA / ICWA. Experience: 7–10 years in Manufacturing', ['CA', 'CMA']],
  ['Open to CA / CMA (US) candidates with SAP experience', ['CA']],
  ['Preparation of CMA data and project reports for bank loans', []],
  ['Work closely with the Company Secretary and Compliance Officer on board meetings', []],
  ['Customer support (CS) executives for our call centre', []]
];

test('qualification patterns tag real listings correctly', async () => {
  const { detectQualifications } = await load('core.js');
  const { QUAL_PATTERNS } = await load('config.js');
  for (const [text, expected] of CASES) {
    assert.deepEqual(detectQualifications(text, QUAL_PATTERNS), expected, text);
  }
});

test('listings that turn a course away are excluded', async () => {
  const { matchesPattern } = await load('core.js');
  const { COURSES } = await load('config.js');
  const cma = COURSES.cma.excludePattern;
  const cs = COURSES.cs.excludePattern;
  assert.ok(matchesPattern('This is a CA Article Trainee position (CMA candidates not eligible), offering', cma));
  assert.ok(matchesPattern('❌ Note: ACCA/CMA pursuing candidates should not apply.', cma));
  assert.ok(matchesPattern('Not eligible: Outstation candidates, CS/CMA interns, Accounting Assistants', cs));
  assert.ok(!matchesPattern('Hiring CA/CMA freshers. Outstation candidates should not apply.', cma));
  assert.ok(!matchesPattern('CA / CS Articleship Opportunity in Noida', cs));
});

test('every pattern in config compiles and stays inside the JS/PostgreSQL shared subset', async () => {
  const { COURSES, QUAL_PATTERNS } = await load('config.js');
  const patterns = [...Object.values(QUAL_PATTERNS)];
  for (const course of Object.values(COURSES)) {
    patterns.push(course.pattern, course.excludePattern);
    course.stages.forEach((s) => patterns.push(s.pattern));
    course.categories.forEach((c) => patterns.push(c.pattern));
  }
  for (const pattern of patterns) {
    assert.doesNotThrow(() => new RegExp(pattern, 'i'), pattern);
    // \b and \m mean different things in JS and PostgreSQL; neither may appear.
    assert.doesNotMatch(pattern, /\\[bBmMyY<>]/, pattern);
  }
});

test('contacts are masked in public descriptions', async () => {
  const { maskContacts } = await load('core.js');
  const masked = maskContacts('Mail hr@firm.co.in or call +91 98765 43210, apply at https://forms.gle/x or www.firm.com');
  assert.doesNotMatch(masked, /hr@|98765|forms\.gle|www\.firm/);
  assert.match(masked, /\[email hidden\].*\[phone hidden\].*\[link hidden\].*\[link hidden\]/);
});

test('pay keeps the unit straight for stipends and salaries', async () => {
  const { formatPay } = await load('core.js');
  assert.equal(formatPay({ 'Stipend Range': '₹5,000 – ₹8,000 per month' }, 'stipend'), '₹5,000 – ₹8,000 per month');
  assert.equal(formatPay({ Salary: 8000 }, 'stipend'), '₹8,000 / month');
  assert.equal(formatPay({ Salary: 720000 }, 'salary'), '₹7.2 LPA');
  assert.equal(formatPay({ Salary: 1200000 }, 'salary'), '₹12 LPA');
  assert.equal(formatPay({ 'CTC Range': '60,000–80,000/month' }, 'salary'), '₹60,000–80,000/month');
  assert.equal(formatPay({ 'CTC Range': 'Not disclosed', Salary: null }, 'salary'), null);
});

test('application targets only ever produce safe links', async () => {
  const { parseApplyTarget, safeHttpUrl, buildMailto, escapeHtml } = await load('core.js');
  assert.deepEqual(parseApplyTarget('https://careers.example.com/apply'), { type: 'url', url: 'https://careers.example.com/apply' });
  assert.deepEqual(parseApplyTarget('Send CV to hr@example.com'), { type: 'email', email: 'hr@example.com' });
  assert.equal(parseApplyTarget('javascript:alert(1)').type, 'search');
  assert.equal(parseApplyTarget('').type, 'none');
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl(' data:text/html,x'), null);
  assert.equal(buildMailto('a@b.co', 'Hi & bye', 'L1\nL2'), 'mailto:a@b.co?subject=Hi%20%26%20bye&body=L1%0AL2');
  assert.equal(escapeHtml('<img src=x onerror="a">\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&#39;');
});

test('job keys round-trip numeric and UUID ids and reject anything else', async () => {
  const { jobKey, parseJobKey } = await load('core.js');
  const uuid = '4962efc4-9233-40bf-92e5-bcf89795500d';
  assert.equal(jobKey('Fresher Jobs', 36320), 'fresher:36320');
  assert.deepEqual(parseJobKey('fresher:36320'), { table: 'Fresher Jobs', id: '36320' });
  assert.deepEqual(parseJobKey(`semi-qualified:${uuid.toUpperCase()}`), { table: 'Semi Qualified Jobs', id: uuid });
  for (const bad of ['fresher:1,2', 'fresher:1)', 'admin:1', 'fresher:', 'fresher:abc', null]) {
    assert.equal(parseJobKey(bad), null, String(bad));
  }
});

test('applications are stored the way history.js reads them', async () => {
  const { applicationRow, appliedKeyFromRow } = await load('core.js');
  const numeric = applicationRow('u1', 'Fresher Jobs', '36320', 1_700_000_000_000);
  assert.deepEqual({ ...numeric, applied_at: undefined }, { user_id: 'u1', job_id: 36320, job_table: 'Fresher Jobs', applied_at: undefined });
  const uuid = '4962efc4-9233-40bf-92e5-bcf89795500d';
  const piggy = applicationRow('u1', 'Semi Qualified Jobs', uuid, 1_700_000_000_000);
  assert.equal(piggy.job_table, `Semi Qualified Jobs|${uuid}`);
  assert.ok(Number.isInteger(piggy.job_id));
  assert.equal(appliedKeyFromRow(numeric), 'fresher:36320');
  assert.equal(appliedKeyFromRow(piggy), `semi-qualified:${uuid}`);
  assert.equal(appliedKeyFromRow({ job_table: 'Unknown', job_id: 1 }), null);
});

test('filters survive a trip through the URL and drop junk values', async () => {
  const { decodeFilters, encodeFilters, defaultFilters } = await load('core.js');
  const options = { categoryKeys: ['gst', 'costing'], payOptions: [5000, 10000] };
  const filters = { ...defaultFilters(), q: 'audit', locations: ['Pune', 'Mumbai'], categories: ['gst'], payMin: 10000, days: 60, sort: 'pay', savedOnly: true };
  const query = encodeFilters(filters, { job: 'fresher:1' });
  assert.match(query, /job=fresher%3A1/);
  assert.deepEqual(decodeFilters(query, options), filters);
  const junk = decodeFilters('?cat=gst,evil&pay=999&days=3&sort=drop&loc=Pune),x', options);
  assert.deepEqual(junk.categories, ['gst']);
  assert.equal(junk.payMin, 0);
  assert.equal(junk.days, 30);
  assert.equal(junk.sort, 'newest');
  assert.deepEqual(junk.locations, ['Pune', 'x']);
  assert.equal(encodeFilters(defaultFilters()), '');
});

test('every lane maps to a known table and has the copy the pages need', async () => {
  const { COURSES } = await load('config.js');
  const { TABLE_SLUGS } = await load('core.js');
  const paths = new Set();
  for (const course of Object.values(COURSES)) {
    assert.equal(course.lanes.length, 5, course.key);
    for (const lane of course.lanes) {
      assert.ok(TABLE_SLUGS[lane.table], `${course.key}/${lane.key}: table`);
      assert.ok(['stipend', 'salary'].includes(lane.pay));
      for (const field of ['path', 'tab', 'h1', 'title', 'description', 'lede', 'applySubject', 'applyNoun', 'stage', 'noun']) {
        assert.ok(lane[field], `${course.key}/${lane.key}: ${field}`);
      }
      assert.ok(lane.description.length >= 70 && lane.description.length <= 200, `${lane.path}: description length ${lane.description.length}`);
      assert.ok(!paths.has(lane.path), `duplicate path ${lane.path}`);
      paths.add(lane.path);
    }
    // CS uses "CS Executive" for the exam stage only, never as a job title.
    if (course.key === 'cs') assert.ok(course.lanes.every((lane) => !/CS Executive jobs/i.test(lane.tab + lane.h1)));
  }
});
