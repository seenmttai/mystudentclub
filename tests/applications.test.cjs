const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const load = (file) => import(pathToFileURL(path.join(root, 'scripts/courses', file)).href);

const IND = 'Industrial Training Job Portal';
const ART = 'Articleship Jobs';
const SEMI = 'Semi Qualified Jobs';
const FRESH = 'Fresher Jobs';

test('job_applications rows resolve to { table, id }, including the UUID piggyback', async () => {
  const { applicationRef } = await load('applications.js');
  assert.deepEqual(applicationRef({ job_table: FRESH, job_id: 500 }), { table: FRESH, id: '500' });
  assert.deepEqual(applicationRef({ job_table: `${ART}|9b2f-uuid`, job_id: 1718000000123 }), { table: ART, id: '9b2f-uuid' });
  assert.deepEqual(applicationRef({ job_table: 'semi-qualified', job_id: 7 }), { table: SEMI, id: '7' });
  assert.deepEqual(applicationRef({ job_table: 'experienced', job_id: 7 }), { table: FRESH, id: '7' });
});

test('an application matches a job only when id and table both agree', async () => {
  const { applicationMatchesJob } = await load('applications.js');
  const fresher500 = { id: 500, table_name: FRESH };
  const articleship500 = { id: 500, table_name: ART };
  const app = { job_table: FRESH, job_id: 500 };
  assert.equal(applicationMatchesJob(app, fresher500), true);
  assert.equal(applicationMatchesJob(app, articleship500), false, 'same id in another table');
  assert.equal(applicationMatchesJob({ job_table: FRESH, job_id: 50 }, fresher500), false);
  // The old substring test paired "5" with any piggybacked UUID containing a 5.
  assert.equal(applicationMatchesJob({ job_table: `${FRESH}|a5-uuid`, job_id: 1 }, { id: 5, table_name: FRESH }), false);
  assert.equal(applicationMatchesJob({ job_table: `${FRESH}|a5-uuid`, job_id: 1 }, { id: 'a5-uuid', table_name: FRESH }), true);
  // A job without a table name (worker shape unknown) still pairs by id.
  assert.equal(applicationMatchesJob(app, { id: '500' }), true);
});

test('CA entries keep their labels and lane pages; experienced jobs link to the experienced lane', async () => {
  const { laneForApplication, laneForSaved, laneChipLabel, laneJobLink } = await load('applications.js');
  const labels = [IND, ART, SEMI, FRESH].map(table => laneChipLabel(laneForApplication(table, { Description: 'CA Inter cleared' }, 'ca')));
  assert.deepEqual(labels, ['Industrial Training', 'Articleship', 'Semi Qualified', 'CA Freshers']);
  const experienced = laneForApplication(FRESH, { Experience: 'Experienced', Description: '' }, null);
  assert.equal(experienced.id, 'ca-experienced');
  assert.equal(laneChipLabel(experienced), 'Experienced CA');
  assert.equal(laneJobLink(experienced, 42), '/experienced-ca-jobs?id=42&type=fresher');
  assert.equal(laneJobLink(laneForApplication(IND, {}, null), 9), '/?id=9&type=industrial');
  assert.equal(laneJobLink(null, 9), '/?id=9&type=industrial');
  // Rows that stored the word "experienced": Experienced CA even when the
  // listing is gone; a listing that says otherwise wins.
  assert.equal(laneForApplication('experienced', null, null).id, 'ca-experienced');
  assert.equal(laneForApplication(' Experienced ', null, 'cs').id, 'ca-experienced');
  assert.equal(laneForApplication('experienced', { Experience: 'Freshers', Description: '' }, null).id, 'ca-fresher');
  assert.equal(laneForApplication('fresher', null, null).id, 'ca-fresher');
  assert.equal(laneForApplication('experienced', { Experience: null, Description: 'Qualified CA/CS, 2 years' }, 'cs').id, 'cs-experienced');
  // Saved entries from before lanes existed.
  assert.equal(laneForSaved({ id: 1, table: SEMI }).id, 'ca-semi');
  assert.equal(laneForSaved({ id: 1, table: FRESH }, { Experience: 'Experienced' }).id, 'ca-experienced');
});

test('a CS / CMA student gets their lane only when the listing names their course', async () => {
  const { laneForApplication, laneChipLabel, laneJobLink } = await load('applications.js');
  const csJob = { Description: 'Eligibility: Qualified CA/CS with 1-2 years experience', Experience: 'Freshers' };
  const caOnly = { Description: 'Qualified Chartered Accountant (CA) required.', Experience: 'Freshers' };
  const csLane = laneForApplication(SEMI, csJob, 'cs');
  assert.equal(csLane.id, 'cs-semi');
  assert.equal(laneChipLabel(csLane), 'CS · Semi Qualified');
  assert.equal(laneJobLink(csLane, 77), '/semi-qualified-cs-jobs?id=77&type=cs-semi');
  assert.equal(laneForApplication(FRESH, csJob, 'cs').id, 'cs-fresher');
  assert.equal(laneForApplication(FRESH, { ...csJob, Experience: 'Experienced' }, 'cs').id, 'cs-experienced');
  assert.equal(laneForApplication(SEMI, caOnly, 'cs').id, 'ca-semi');
  assert.equal(laneForApplication(SEMI, csJob, 'cma').id, 'ca-semi', 'CS listing is not a CMA one');
  assert.equal(laneForApplication(SEMI, csJob, 'ca').id, 'ca-semi');
  const cmaLane = laneForApplication(SEMI, { Description: 'CA Inter / CMA Inter cleared candidates' }, 'cma');
  assert.equal(laneChipLabel(cmaLane), 'CMA · Inter');
});

test('CS / CMA chip labels read naturally', async () => {
  const { laneChipLabel } = await load('applications.js');
  const { laneById } = await load('courses.js');
  const expected = {
    'cs-articleship': 'CS · Articleship',
    'cs-industrial': 'CS · Company Training',
    'cs-semi': 'CS · Semi Qualified',
    'cs-fresher': 'CS · Freshers',
    'cs-experienced': 'CS · Experienced',
    'cma-articleship': 'CMA · Articleship',
    'cma-industrial': 'CMA · Industrial Training',
    'cma-fresher': 'CMA · Freshers',
    'cma-experienced': 'CMA · Experienced',
  };
  for (const [id, label] of Object.entries(expected)) assert.equal(laneChipLabel(laneById(id)), label, id);
});

test('saved entries use their lane id when it reads the same table', async () => {
  const { laneForSaved } = await load('applications.js');
  assert.equal(laneForSaved({ id: 1, table: ART, lane: 'cs-articleship' }).id, 'cs-articleship');
  assert.equal(laneForSaved({ id: 1, table: FRESH, lane: 'cma-fresher' }, { Experience: 'Freshers' }).id, 'cma-fresher');
  assert.equal(laneForSaved({ id: 1, table: FRESH, lane: 'cma-fresher' }, { Experience: 'Experienced' }).id, 'cma-experienced');
  assert.equal(laneForSaved({ id: 1, table: ART, lane: 'cs-fresher' }).id, 'ca-articleship', 'lane for another table is ignored');
  assert.equal(laneForSaved({ id: 1, table: ART, lane: 'nope' }).id, 'ca-articleship');
});

test('post-a-job "Open to" line reaches exactly the ticked courses', async () => {
  const { openToLine, withOpenToLine } = await load('applications.js');
  const { QUALIFICATIONS } = await load('courses.js');
  const { courseMatches } = await load('match.js');
  const body = 'We are hiring for our finance team in Mumbai.\n• Strong Excel skills.';
  const combos = [
    [['CA'], ''],
    [['CA', 'CS'], 'Open to: CA / CS students'],
    [['CA', 'CMA'], 'Open to: CA / CMA students'],
    [['CS'], 'Open to: CS students'],
    [['CMA'], 'Open to: CMA students'],
    [['CS', 'CMA'], 'Open to: CS / CMA students'],
    [['CMA', 'CA', 'CS'], 'Open to: CA / CS / CMA students'],
  ];
  for (const [codes, line] of combos) {
    assert.equal(openToLine(codes), line, codes.join('+'));
    const text = withOpenToLine(body, codes);
    assert.equal(text, line ? `${body}\n\n${line}` : body);
    assert.equal(courseMatches(text, QUALIFICATIONS.cs.match), codes.includes('CS'), `${codes.join('+')} on CS lanes`);
    assert.equal(courseMatches(text, QUALIFICATIONS.cma.match), codes.includes('CMA'), `${codes.join('+')} on CMA lanes`);
  }
  // Even written out, a CA-only line would not leak onto CS / CMA lanes.
  assert.equal(courseMatches('Open to: CA students', QUALIFICATIONS.cs.match), false);
  assert.equal(courseMatches('Open to: CA students', QUALIFICATIONS.cma.match), false);
  assert.equal(openToLine(['ca', 'cs']), 'Open to: CA / CS students', 'keys work too');
});

test('hirer dashboard: CS / CMA candidates get course rows, CA keeps its layout', async () => {
  const { candidateDetails } = await load('applications.js');
  assert.equal(candidateDetails('ca', { ca_final_attempts: 1 }), null);
  assert.equal(candidateDetails(null, {}), null);
  const cs = candidateDetails('cs', {
    cs_exec_status: 'both', cs_exec_attempts: '1', cs_exec_clear_month: '06', cs_exec_clear_year: '2025',
    cs_prof_status: 'pursuing', cs_edp_done: 'yes', cs_training_type: 'pcs', cs_training_org: 'ABC & Associates, Company Secretaries',
    cs_training_start_month: '01', cs_training_start_year: '2026', cs_training_is_current: 'yes', grad_degree: 'B.Com', key_skills: 'ROC filings',
  });
  assert.equal(cs.chip, 'CS');
  assert.equal(cs.stage, 'Executive: Both modules passed · Professional: Pursuing');
  assert.equal(cs.training, 'Practising Company Secretary (firm): ABC & Associates, Company Secretaries');
  assert.equal(cs.academics.title, 'CS Status & Academics');
  const rows = Object.fromEntries(cs.academics.rows);
  assert.equal(rows['CS Executive'], 'Both modules passed · 1 attempt · passed Jun 2025');
  assert.equal(rows['CS Professional'], 'Pursuing');
  assert.equal(rows['Executive Development Programme (EDP)'], 'Completed');
  assert.equal(rows.Graduation, 'B.Com');
  const exp = Object.fromEntries(cs.experience.rows);
  assert.equal(cs.experience.title, 'Training & Work Experience');
  assert.equal(exp['Training period'], 'Jan 2026 – present');
  assert.equal(exp['Key Skills'], 'ROC filings');

  const cma = candidateDetails('cma', { cma_inter_status: 'group1', cma_training_org: 'Tata Steel', cma_training_type: 't4' });
  assert.equal(cma.chip, 'CMA');
  assert.equal(cma.stage, 'Inter: Group I passed');
  assert.equal(Object.fromEntries(cma.academics.rows)['CMA Intermediate'], 'Group I passed');
  assert.equal(Object.fromEntries(cma.experience.rows)['Training organisation'], 'Tata Steel');
  assert.equal(Object.fromEntries(cma.experience.rows)['Training period'], '');
});
