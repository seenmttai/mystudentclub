const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

// scripts/onboarding.js is a browser module under a CommonJS package.json, so
// load it from source with its relative imports pointed at the real files.
async function loadOnboarding() {
  const coursesDir = pathToFileURL(path.join(root, 'scripts', 'courses')).href;
  const source = fs.readFileSync(path.join(root, 'scripts', 'onboarding.js'), 'utf8')
    .replace(/from '\.\/courses\//g, `from '${coursesDir}/`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const NOW = new Date('2026-10-17T10:00:00.000Z');
const EXISTING = { name: 'Asha', email: 'asha@example.com', notification_subscriptions: ['all'] };

test('CA onboarding writes the same columns as the old form, plus profile.qualification', async () => {
  const { onboardingPlan } = await loadOnboarding();

  const industrial = onboardingPlan({ qualification: 'ca', stage: 'industrial', values: { articleshipEnd: '2027-03-31' }, existingProfile: EXISTING, now: NOW });
  assert.deepEqual(industrial.write, {
    mode: 'update',
    data: {
      looking_for: 'CA Industrial Training Default',
      profile: { ...EXISTING, qualification: 'ca' },
      updated_at: NOW.toISOString(),
      articleship_1yr_end_date: '2027-03-31'
    }
  });
  assert.equal(industrial.preference, 'industrial');
  assert.equal(industrial.lane.path, '/');
  assert.equal(industrial.lookingForWrite, null);

  const articleship = onboardingPlan({ qualification: 'ca', stage: 'articleship', values: { joining: '2026-12-01' }, existingProfile: EXISTING, now: NOW });
  assert.deepEqual(articleship.write.data, {
    looking_for: 'CA Articleship',
    profile: { ...EXISTING, qualification: 'ca', articleship_earliest_joining_date: '2026-12-01' },
    updated_at: NOW.toISOString()
  });
  assert.equal(articleship.preference, 'articleship');
  assert.equal(articleship.lane.path, '/ca-articleship-opportunities');

  const fresher = onboardingPlan({ qualification: 'ca', stage: 'fresher', values: { caFinalAttempt: 'May 2026 (Cleared)', fresherYears: '3' }, existingProfile: EXISTING, now: NOW });
  assert.deepEqual(fresher.write.data, {
    looking_for: 'CA Fresher',
    profile: { ...EXISTING, qualification: 'ca', fresher_years_of_experience: '3' },
    updated_at: NOW.toISOString(),
    ca_final_attempt: 'May 2026 (Cleared)'
  });
  // As before: the CA fresher card always means fresher_fresher.
  assert.equal(fresher.preference, 'fresher_fresher');
  assert.equal(fresher.lane.path, '/ca-fresher-jobs');

  const semi = onboardingPlan({ qualification: 'ca', stage: 'semi', values: { years: '' }, existingProfile: EXISTING, now: NOW });
  assert.deepEqual(semi.write.data, {
    looking_for: 'Semi Qualified CA',
    profile: { ...EXISTING, qualification: 'ca' },
    updated_at: NOW.toISOString(),
    years_of_experience: null
  });
  assert.equal(semi.preference, 'semi_fresher');
  const experienced = onboardingPlan({ qualification: 'ca', stage: 'semi', values: { years: '4' }, existingProfile: EXISTING, now: NOW });
  assert.equal(experienced.preference, 'semi_experienced', 'more than a year of experience picks the Experienced filter');
  assert.equal(experienced.write.data.looking_for, 'Semi Qualified CA', 'CA still writes the same looking_for label');
  assert.equal(experienced.lane.id, 'ca-semi');
  assert.equal(semi.cachePatch.looking_for, 'Semi Qualified CA');
  assert.equal(semi.cachePatch.qualification, 'ca');
  assert.equal(semi.cachePatch.name, 'Asha');
  assert.ok(!('profile' in semi.cachePatch), 'the cached profile stays flat');
});

test('CS / CMA onboarding writes course + stage to the jsonb and looking_for separately', async () => {
  const { onboardingPlan } = await loadOnboarding();

  const semi = onboardingPlan({ qualification: 'cs', stage: 'semi', values: { years: '0' }, existingProfile: EXISTING, now: NOW });
  assert.deepEqual(semi.write, {
    mode: 'upsert',
    data: {
      profile: { ...EXISTING, qualification: 'cs', job_preference: 'cs_semi_fresher' },
      updated_at: NOW.toISOString(),
      years_of_experience: '0'
    }
  });
  assert.ok(!('looking_for' in semi.write.data), 'looking_for never rides on the main write');
  assert.deepEqual(semi.lookingForWrite, { looking_for: 'Semi Qualified CS' });
  assert.equal(semi.lane.path, '/semi-qualified-cs-jobs');
  assert.ok(!('looking_for' in semi.cachePatch), 'looking_for is cached only once it saved');

  const semiExperienced = onboardingPlan({ qualification: 'cs', stage: 'semi', values: { years: '4' }, existingProfile: {}, now: NOW });
  assert.equal(semiExperienced.preference, 'cs_semi_experienced');
  assert.equal(semiExperienced.lane.path, '/semi-qualified-cs-jobs');

  const qualifiedFresher = onboardingPlan({ qualification: 'cs', stage: 'qualified', values: { years: '1' }, existingProfile: {}, now: NOW });
  assert.equal(qualifiedFresher.preference, 'cs_fresher_fresher');
  assert.equal(qualifiedFresher.lane.path, '/cs-fresher-jobs');
  assert.deepEqual(qualifiedFresher.lookingForWrite, { looking_for: 'CS Fresher' });

  const qualifiedExperienced = onboardingPlan({ qualification: 'cma', stage: 'qualified', values: { years: '2.5' }, existingProfile: {}, now: NOW });
  assert.equal(qualifiedExperienced.preference, 'cma_fresher_experienced');
  assert.equal(qualifiedExperienced.lane.path, '/experienced-cma-jobs');
  assert.equal(qualifiedExperienced.write.data.years_of_experience, '2.5');

  const articleship = onboardingPlan({ qualification: 'cs', stage: 'articleship', values: { joining: '2027-01-15' }, existingProfile: EXISTING, now: NOW });
  assert.deepEqual(articleship.write.data, {
    profile: { ...EXISTING, qualification: 'cs', job_preference: 'cs_articleship', earliest_joining_date: '2027-01-15' },
    updated_at: NOW.toISOString()
  });
  assert.equal(articleship.lane.path, '/cs-articleship');

  const industrial = onboardingPlan({ qualification: 'cma', stage: 'industrial', values: { joining: '2027-01-15' }, existingProfile: {}, now: NOW });
  assert.equal(industrial.preference, 'cma_industrial');
  assert.equal(industrial.lane.path, '/cma-industrial-training');
  assert.deepEqual(industrial.lookingForWrite, { looking_for: 'CMA Industrial Training' });

  assert.equal(onboardingPlan({ qualification: 'cs', stage: 'fresher', values: {}, now: NOW }), null, 'CS has no CA-style fresher card');
});

test('every onboarding card leads to a lane of its own course', async () => {
  const { ONBOARDING_STAGES, onboardingPlan } = await loadOnboarding();
  for (const [qualification, stages] of Object.entries(ONBOARDING_STAGES)) {
    assert.equal(stages.length, 4, `${qualification}: four cards`);
    for (const def of stages) {
      for (const years of ['0', '5']) {
        const plan = onboardingPlan({ qualification, stage: def.key, values: { years, joining: '2027-01-01', articleshipEnd: '2027-01-01', caFinalAttempt: 'Cleared' }, now: NOW });
        assert.ok(plan.lane, `${qualification}/${def.key}`);
        assert.equal(plan.lane.qualification, qualification, `${qualification}/${def.key}`);
        assert.equal(plan.cachePatch.qualification, qualification);
      }
    }
  }
});

test('onboarding field helpers', async () => {
  const { parseYears, stageFromYears, validateDateParts, caFinalAttemptValue } = await loadOnboarding();
  assert.equal(parseYears(''), 0);
  assert.equal(parseYears(' 1.5 yrs'), 1.5);
  assert.equal(parseYears('abc'), 0);
  assert.equal(parseYears('-3'), 0);
  assert.equal(stageFromYears('1'), 'fresher');
  assert.equal(stageFromYears('1.5'), 'experienced');
  assert.equal(stageFromYears(''), 'fresher');

  assert.equal(validateDateParts(31, 3, 2027), null);
  assert.match(validateDateParts(30, 2, 2027), /Day must be between 01 and 28/);
  assert.match(validateDateParts(1, 13, 2027), /Month/);
  assert.match(validateDateParts(1, 1, 1999), /Year/);

  assert.equal(caFinalAttemptValue('May', '2026', false), 'May 2026');
  assert.equal(caFinalAttemptValue('May', '2026', true), 'May 2026 (Cleared)');
  assert.equal(caFinalAttemptValue('', '', true), 'Cleared');
  assert.equal(caFinalAttemptValue('May', '', false), '');
});

test('profile read-merge-writes stop when the read fails', () => {
  // A failed read would otherwise upsert a near-empty profile jsonb over the
  // stored one (name, alerts, cv flags lost).
  const onboarding = fs.readFileSync(path.join(root, 'scripts', 'onboarding.js'), 'utf8');
  assert.match(onboarding, /const \{ data: existingRow, error: readError \} = await client\s*\.from\('profiles'\)\s*\.select\('profile'\)/);
  assert.match(onboarding, /\.maybeSingle\(\);\s*if \(readError\) throw readError;\s*const plan = onboardingPlan\(/);

  const portal = fs.readFileSync(path.join(root, 'scripts', 'portal3.js'), 'utf8');
  const reads = portal.match(/const \{ data: existingProfile(?:, error: readError)? \} = await supabaseClient\s*\.from\('profiles'\)\s*\.select\('profile'\)[\s\S]*?\.maybeSingle\(\);[^\n]*\n[^\n]*\n[^\n]*\n/g) || [];
  assert.ok(reads.length >= 2, 'saveSubscribedTopics and saveJobPreference read the profile first');
  for (const read of reads) assert.match(read, /error: readError[\s\S]*if \(readError\) throw readError;/);
});
