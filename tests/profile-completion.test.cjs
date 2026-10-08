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
    + '\nthis.completion = { getProfileCompletionItems, calculateProfileCompletion };';
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
