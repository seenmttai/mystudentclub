const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'profile-completion.js'), 'utf8');

function loadCompletion(storage = {}) {
  const localStorage = {
    getItem: key => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null,
    setItem: (key, value) => { storage[key] = String(value); },
  };
  const context = { Array, Boolean, JSON, Math, String, localStorage };
  context.globalThis = context;
  const executable = source.replaceAll('export function ', 'function ')
    + '\nthis.completion = { getProfileCompletionItems, getMissingProfileItems, calculateProfileCompletion };';
  vm.runInNewContext(executable, context);
  return { completion: context.completion, storage, localStorage };
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

test('certification is optional and carries no completion points', () => {
  const { completion, localStorage } = loadCompletion({ userCVText: 'resume text' });
  const items = completion.getProfileCompletionItems(completeProfile(), localStorage);
  const profilePage = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');

  assert.equal(items.some(item => /certification/i.test(item.label)), false);
  assert.equal(items.find(item => item.label === 'Add key skills').boost, 4);
  assert.equal(items.reduce((sum, item) => sum + item.boost, 0), 100);
  assert.match(profilePage, /Key Skills <span class="p2-boost" id="skillsBoost">Add 4%<\/span>/);
  assert.match(profilePage, /Certification <span class="p2-boost-optional">Optional<\/span>/);
});

test('adding a certification does not change the completion percentage', () => {
  const { completion, localStorage } = loadCompletion({ userCVText: 'resume text' });
  const withoutCertification = completeProfile();
  const withCertification = { ...withoutCertification, cert_name: 'Optional course' };

  assert.equal(completion.calculateProfileCompletion(withoutCertification, localStorage), 100);
  assert.equal(completion.calculateProfileCompletion(withCertification, localStorage), 100);
});

test('class X and XII each require board, school, year and a valid score', () => {
  const { completion, localStorage } = loadCompletion({ userCVText: 'resume text' });
  const complete = completeProfile();
  const missingClass12School = { ...complete, class12_school: '' };
  const cgpaProfile = { ...complete, class10_score_type: 'cgpa', class10_cgpa_scale: '10', class10_percentage: '8.6' };

  assert.equal(completion.calculateProfileCompletion(complete, localStorage), 100);
  assert.equal(completion.calculateProfileCompletion(missingClass12School, localStorage), 96);
  assert.equal(completion.calculateProfileCompletion(cgpaProfile, localStorage), 100);
});

test('missing-detail routes match the form available to each portal', () => {
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
    const { completion, localStorage } = loadCompletion();
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

test('missing items list names exactly what is still empty, in profile order', () => {
  const { completion, localStorage } = loadCompletion({ userCVText: 'resume text' });
  const profile = completeProfile();
  assert.deepEqual(Array.from(completion.getMissingProfileItems(profile, localStorage), item => item.label), []);

  delete profile.notice_period;
  for (const key of Object.keys(profile)) {
    if (key.startsWith('class10_') || key.startsWith('class12_')) delete profile[key];
  }
  assert.deepEqual(
    Array.from(completion.getMissingProfileItems(profile, localStorage), item => item.label),
    ['Add Class XII details', 'Add Class X details', 'Add notice period']
  );
});

test('a saved CV is not reported missing', () => {
  const withCv = loadCompletion({ userCVText: 'resume text' });
  assert.equal(withCv.completion.getMissingProfileItems(completeProfile(), withCv.localStorage).length, 0);

  const withoutCv = loadCompletion({});
  assert.deepEqual(
    Array.from(withoutCv.completion.getMissingProfileItems(completeProfile(), withoutCv.localStorage), item => item.label),
    ['Add resume']
  );
});

function loadAiHelper(storage = {}) {
  const completionSource = source.replaceAll('export function ', 'function ');
  const helperSource = fs.readFileSync(path.join(root, 'scripts', 'ai-helper.js'), 'utf8')
    .replace(/^import .*$/m, '')
    .replaceAll('export async function ', 'async function ')
    .replaceAll('export function ', 'function ');
  const appended = [];
  const element = () => ({
    set innerHTML(value) { this.html = value; },
    get innerHTML() { return this.html; },
    addEventListener() {},
    remove() {},
  });
  const document = {
    head: { appendChild() {} },
    body: { appendChild: el => appended.push(el) },
    getElementById: () => null,
    createElement: element,
    addEventListener() {},
    removeEventListener() {},
  };
  const localStorage = {
    getItem: key => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null,
    setItem: (key, value) => { storage[key] = String(value); },
  };
  const context = {
    Array, Boolean, Date, JSON, Math, Number, Object, String, console, localStorage, document,
    encodeURIComponent,
    window: { location: { href: 'https://www.mystudentclub.com/jobs/fresher/example.html?id=7' } },
  };
  context.globalThis = context;
  vm.runInNewContext(`${completionSource}\n${helperSource}\nthis.helper = { showResumeRedirectModal };`, context);
  return { helper: context.helper, appended };
}

test('AI Apply popup lists the missing items and deep-links to the first one', () => {
  const profile = completeProfile();
  delete profile.notice_period;
  for (const key of Object.keys(profile)) {
    if (key.startsWith('class10_') || key.startsWith('class12_')) delete profile[key];
  }
  const { helper, appended } = loadAiHelper({
    userCVText: 'resume text',
    userProfileData: JSON.stringify(profile),
  });

  helper.showResumeRedirectModal();

  assert.equal(appended.length, 1);
  const html = appended[0].html;
  assert.match(html, /<li>Class XII details<\/li><li>Class X details<\/li><li>Notice period<\/li>/);
  assert.match(html, /Your CV is uploaded, but AI Powered Apply needs a complete profile/);
  assert.doesNotMatch(html, /<li>Resume<\/li>/);
  assert.doesNotMatch(html, /Upload CV/i);
  assert.match(html, /section=sec-ca-education&amp;form=sec-12-form|section=sec-ca-education&form=sec-12-form/);
  assert.match(html, /redirect=https%3A%2F%2Fwww\.mystudentclub\.com%2Fjobs%2Ffresher%2Fexample\.html%3Fid%3D7/);
});

test('AI Apply popup asks for the CV only when it is actually missing', () => {
  const { helper, appended } = loadAiHelper({ userProfileData: JSON.stringify(completeProfile()) });

  helper.showResumeRedirectModal();

  const html = appended[0].html;
  assert.match(html, /<li>Resume<\/li>/);
  assert.doesNotMatch(html, /Your CV is uploaded/);
  assert.match(html, /section=sec-resume&form=/);
});

test('portal pages no longer ship the old "CV Upload Required" popup', () => {
  for (const file of ['portal-email.js', 'portal3.js', 'job-details.js']) {
    const text = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    assert.doesNotMatch(text, /CV Upload Required|showCvUploadPopup/, file);
  }
});

test('profile page opens the section named by the AI Apply popup link', () => {
  const profileSource = fs.readFileSync(path.join(root, 'scripts', 'profile.js'), 'utf8');
  assert.match(profileSource, /deepLink\.get\('section'\)/);
  assert.match(profileSource, /navigateToMissingDetail\(deepLinkSection, deepLink\.get\('form'\) \|\| ''\)/);
});
