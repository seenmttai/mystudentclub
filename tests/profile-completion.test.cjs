const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

// profile-completion.js imports the course registry, so the vm loader that
// stripped `export` can no longer run it. scripts/ is CommonJS for Node, so the
// module is imported from a data: URL with its relative imports made absolute.
async function loadCompletion(storage = {}) {
  const localStorage = {
    getItem: key => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null,
    setItem: (key, value) => { storage[key] = String(value); },
  };
  const source = fs.readFileSync(path.join(root, 'scripts', 'profile-completion.js'), 'utf8')
    .replace(/from '\.\/([^']+)'/g, (_, file) => `from '${pathToFileURL(path.join(root, 'scripts', file)).href}'`);
  const completion = await import(`data:text/javascript,${encodeURIComponent(source)}`);
  return { completion, storage, localStorage };
}

function completeProfile() {
  return {
    name: 'Candidate',
    contact_number: '9999999999',
    current_city: 'Mumbai',
    profile_summary: 'Finance professional',
    ca_final_course: 'CA Final',
    total_experience: '2 years',
    emp_company_name: 'Example LLP',
    notice_period: '30 days',
    job_preference: 'industrial',
    key_skills: 'Excel, GST',
    class12_board: 'CBSE',
    class12_school: 'Example Senior Secondary School',
    class12_year: '2020',
    class12_score_type: 'percentage',
    class12_percentage: '92',
    class10_board: 'CBSE',
    class10_school: 'Example Public School',
    class10_year: '2018',
    class10_score_type: 'percentage',
    class10_percentage: '95',
  };
}

test('certification is optional and carries no completion points', async () => {
  const { completion, localStorage } = await loadCompletion({ userCVText: 'resume text' });
  const items = completion.getProfileCompletionItems(completeProfile(), localStorage);
  const profilePage = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');

  assert.equal(items.some(item => /certification/i.test(item.label)), false);
  assert.equal(items.find(item => item.label === 'Add key skills').boost, 4);
  assert.equal(items.reduce((sum, item) => sum + item.boost, 0), 100);
  assert.match(profilePage, /Key Skills <span class="p2-boost" id="skillsBoost">Add 4%<\/span>/);
  assert.match(profilePage, /Certification <span class="p2-boost-optional">Optional<\/span>/);
});

test('adding a certification does not change the completion percentage', async () => {
  const { completion, localStorage } = await loadCompletion({ userCVText: 'resume text' });
  const withoutCertification = completeProfile();
  const withCertification = { ...withoutCertification, cert_name: 'Optional course' };

  assert.equal(completion.calculateProfileCompletion(withoutCertification, localStorage), 100);
  assert.equal(completion.calculateProfileCompletion(withCertification, localStorage), 100);
});

test('class X and XII each require board, school, year and a valid score', async () => {
  const { completion, localStorage } = await loadCompletion({ userCVText: 'resume text' });
  const complete = completeProfile();
  const missingClass12School = { ...complete, class12_school: '' };
  const cgpaProfile = { ...complete, class10_score_type: 'cgpa', class10_cgpa_scale: '10', class10_percentage: '8.6' };

  assert.equal(completion.calculateProfileCompletion(complete, localStorage), 100);
  assert.equal(completion.calculateProfileCompletion(missingClass12School, localStorage), 96);
  assert.equal(completion.calculateProfileCompletion(cgpaProfile, localStorage), 100);
});

test('missing-detail routes match the form available to each portal', async () => {
  const expected = {
    industrial: {
      'Add CA education': ['sec-ca-education', 'sec-ca-inter-form'],
      'Add experience': ['sec-articleship', 'sec-art-form'],
      'Add current organization': ['sec-articleship', 'sec-it-form'],
    },
    articleship: {
      'Add CA education': ['sec-ca-education', 'sec-ca-inter-form'],
      'Add experience': ['sec-employment', 'sec-experience-form'],
      'Add prior work experience': ['sec-employment', 'sec-experience-form'],
    },
    fresher_fresher: {
      'Add CA education': ['sec-ca-education', 'sec-ca-final-form'],
      'Add experience': ['sec-articleship', 'sec-art-form'],
      'Add current organization': ['sec-articleship', 'sec-it-form'],
    },
    fresher_experienced: {
      'Add CA education': ['sec-ca-education', 'sec-ca-final-form'],
      'Add experience': ['sec-employment', 'sec-experience-form'],
      'Add current organization': ['sec-employment', 'sec-experience-form'],
    },
    semi_fresher: {
      'Add CA education': ['sec-ca-education', 'sec-ca-inter-form'],
      'Add experience': ['sec-articleship', 'sec-art-form'],
      'Add current organization': ['sec-articleship', 'sec-it-form'],
    },
    semi_experienced: {
      'Add CA education': ['sec-ca-education', 'sec-ca-inter-form'],
      'Add experience': ['sec-employment', 'sec-experience-form'],
      'Add current organization': ['sec-employment', 'sec-experience-form'],
    },
  };

  for (const [portal, routes] of Object.entries(expected)) {
    const { completion, localStorage } = await loadCompletion();
    const items = completion.getProfileCompletionItems({ job_preference: portal }, localStorage);
    for (const [label, [section, form]] of Object.entries(routes)) {
      const item = items.find(candidate => candidate.label === label);
      assert.ok(item, `${portal}: missing completion item ${label}`);
      assert.equal(item.section, section, `${portal}: ${label} section`);
      assert.equal(item.form, form, `${portal}: ${label} form`);
    }

    const notice = items.find(item => item.label === 'Add notice period');
    assert.deepEqual(
      [notice.section, notice.form],
      ['sec-availability', 'sec-availability-form'],
      `${portal}: notice period route`
    );
  }
});

test('missing-detail CTA is retargeted instead of staying on Personal Details', () => {
  const profileHtml = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');
  const profileSource = fs.readFileSync(path.join(root, 'scripts', 'profile.js'), 'utf8');

  assert.match(profileHtml, /id="missingCta"/);
  assert.match(profileSource, /missingCta\.dataset\.section/);
  assert.match(profileSource, /navigateToMissingDetail\(sectionId, missingCtaEl\.dataset\.form \|\| ''\)/);
});

// A CS / CMA student with no CA keys at all: course education, course training
// and the shared sections.
function completeCourseProfile(qualification, jobPreference, extra = {}) {
  const course = { ...completeProfile(), qualification, job_preference: jobPreference, ...extra };
  delete course.ca_final_course;
  delete course.total_experience;
  delete course.emp_company_name;
  return course;
}

test('a complete CS profile reaches 100 without any CA field', async () => {
  const { completion, localStorage } = await loadCompletion({ userCVText: 'resume text' });
  const cs = completeCourseProfile('cs', 'cs_articleship', {
    cs_icsi_reg_no: 'ICSI/123',
    cs_exec_status: 'both',
    cs_training_type: 'pcs',
    cs_training_org: 'ABC & Associates, Company Secretaries',
  });

  assert.equal(Object.keys(cs).some(key => /^(ca_|articleship_|industrial_training|it_)/.test(key)), false);
  assert.equal(completion.calculateProfileCompletion(cs, localStorage), 100);
  const items = completion.getProfileCompletionItems(cs, localStorage);
  assert.ok(items.find(item => item.label === 'Add CS education').filled);
  assert.equal(items.some(item => /CA education/.test(item.label)), false);
  assert.equal(items.find(item => item.label === 'Add prior work experience').filled, true);
});

test('a complete CMA profile reaches 100, including the experienced CTC item', async () => {
  const { completion, localStorage } = await loadCompletion({ userCVText: 'resume text' });
  const cma = completeCourseProfile('cma', 'cma_fresher_experienced', {
    cma_final_status: 'both',
    cma_acma_no: 'ACMA-42',
    cma_training_type: 't4',
    cma_training_org: 'Tata Steel',
    emp_company_name: 'Example Ltd',
    emp_current_salary: '900000',
  });

  assert.equal(completion.calculateProfileCompletion(cma, localStorage), 100);
  assert.ok(completion.getProfileCompletionItems(cma, localStorage).some(item => item.label === 'Add current CTC'));
  assert.equal(completion.calculateProfileCompletion({ ...cma, emp_current_salary: '' }, localStorage), 97);
});

test('CS course details fill the education, experience and organisation items on their own', async () => {
  const { completion, localStorage } = await loadCompletion({ userCVText: 'resume text' });
  const withoutCourse = completeCourseProfile('cs', 'cs_industrial');
  const items = completion.getProfileCompletionItems(withoutCourse, localStorage);
  const missing = items.filter(item => !item.filled).map(item => item.label);

  assert.deepEqual(missing, ['Add CS education', 'Add experience', 'Add current organization']);
  const withCourse = { ...withoutCourse, cs_exec_status: 'pursuing', cs_training_org: 'Example Ltd' };
  assert.equal(completion.calculateProfileCompletion(withCourse, localStorage), 100);
  // The qualification comes from the prefixed preference when the key is missing.
  const { qualification, ...inferred } = withCourse;
  assert.equal(completion.calculateProfileCompletion(inferred, localStorage), 100);
});

// The CA articleship / industrial training section is hidden for CS and CMA,
// so its fields (a CA-context resume extraction can fill them) do not count.
test('CA training fields do not fill a CS or CMA profile', async () => {
  const { completion, localStorage } = await loadCompletion({ userCVText: 'resume text' });
  const hiddenOnly = {
    industrial_training_company: 'Internship Co',
    articleship_firm_name: 'ABC & Co',
    articleship_firm_type: 'Small Size Firm',
  };
  const cs = completeCourseProfile('cs', 'cs_industrial', { cs_exec_status: 'both', ...hiddenOnly });
  const missing = completion.getProfileCompletionItems(cs, localStorage).filter(item => !item.filled).map(item => item.label);
  assert.deepEqual(missing, ['Add experience', 'Add current organization']);
  assert.ok(completion.calculateProfileCompletion(cs, localStorage) < 100);
  const cma = completeCourseProfile('cma', 'cma_articleship', { cma_inter_status: 'both', ...hiddenOnly });
  assert.ok(completion.calculateProfileCompletion(cma, localStorage) < 100);
  // The same fields still count for CA, as before.
  const ca = { ...completeCourseProfile('ca', 'industrial', hiddenOnly), ca_inter_course: 'CA Inter' };
  assert.equal(completion.calculateProfileCompletion(ca, localStorage), 100);
});

test('CS and CMA missing-detail routes open their own forms', async () => {
  const { completion, localStorage } = await loadCompletion();
  const route = (profile, label) => {
    const item = completion.getProfileCompletionItems(profile, localStorage).find(candidate => candidate.label === label);
    assert.ok(item, `${profile.job_preference}: missing completion item ${label}`);
    return [item.section, item.form];
  };

  assert.deepEqual(route({ job_preference: 'cs_articleship' }, 'Add CS education'), ['sec-ca-education', 'sec-cs-exec-form']);
  assert.deepEqual(route({ job_preference: 'cs_fresher_fresher' }, 'Add CS education'), ['sec-ca-education', 'sec-cs-prof-form']);
  assert.deepEqual(route({ job_preference: 'cs_industrial' }, 'Add experience'), ['sec-pro-training', 'sec-cs-training-form']);
  assert.deepEqual(route({ job_preference: 'cs_articleship' }, 'Add experience'), ['sec-employment', 'sec-experience-form']);
  assert.deepEqual(route({ job_preference: 'cma_semi_fresher' }, 'Add CMA education'), ['sec-ca-education', 'sec-cma-inter-form']);
  assert.deepEqual(route({ job_preference: 'cma_fresher_experienced' }, 'Add CMA education'), ['sec-ca-education', 'sec-cma-final-form']);
  assert.deepEqual(route({ job_preference: 'cma_semi_fresher' }, 'Add current organization'), ['sec-pro-training', 'sec-cma-training-form']);
  assert.deepEqual(route({ qualification: 'cma' }, 'Add CMA education'), ['sec-ca-education', '']);
  // No qualification and a CA key: today's CA item, label and route.
  assert.deepEqual(route({ job_preference: 'industrial' }, 'Add CA education'), ['sec-ca-education', 'sec-ca-inter-form']);
  assert.deepEqual(route({}, 'Add CA education'), ['sec-ca-education', '']);
});

// Every save replaces the whole profiles.profile jsonb with the form's named
// controls, so each CS / CMA key needs exactly one named, enabled, optional
// control whose options match scripts/courses/profile-fields.js.
test('profile.html has one enabled, optional control for the course and every CS / CMA key', async () => {
  const html = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');
  const { PROFILE_FIELDS, MONTH_OPTIONS } = await import(pathToFileURL(path.join(root, 'scripts', 'courses', 'profile-fields.js')).href);
  const controlsNamed = name => [...html.matchAll(new RegExp(`<(input|select|textarea)\\b[^>]*\\bname="${name}"[^>]*>`, 'g'))];

  const qualification = controlsNamed('qualification');
  assert.equal(qualification.length, 1, 'one qualification control');
  const qualificationSelect = html.slice(qualification[0].index, html.indexOf('</select>', qualification[0].index));
  assert.deepEqual([...qualificationSelect.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]), ['ca', 'cs', 'cma']);

  for (const field of Object.values(PROFILE_FIELDS).flat()) {
    const controls = controlsNamed(field.key);
    assert.equal(controls.length, 1, `${field.key}: one named control`);
    const tag = controls[0][0];
    assert.doesNotMatch(tag, /\s(disabled|required)\b/, `${field.key}: enabled and optional`);
    if (!field.options || /type="hidden"/.test(tag)) continue;
    const select = html.slice(controls[0].index, html.indexOf('</select>', controls[0].index));
    const values = [...select.matchAll(/<option value="([^"]*)"/g)].map(m => m[1]).filter(Boolean);
    const expected = field.options === 'month' ? MONTH_OPTIONS : Object.keys(field.options);
    assert.deepEqual(values, expected, `${field.key}: option values`);
  }
});
