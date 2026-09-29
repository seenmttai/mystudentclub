const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'sign-up.html'), 'utf8');
const loginSource = fs.readFileSync(path.join(root, 'login.html'), 'utf8');

test('signup onboarding keeps the requested copy and profile sections', () => {
  assert.match(source, /Don’t just search for jobs\. Let recruiters find you\./);
  assert.match(source, /Share your details in less than 2 minutes with MSC’s network of 1,000\+ recruiters\. Let your next opportunity find you\./);
  assert.match(source, /Complete My Profile →/);
  for (const section of ['Resume', 'Personal details', 'Education', 'Experience', 'Key skills', 'Career preferences']) {
    assert.match(source, new RegExp(`>${section}<`), `missing onboarding section: ${section}`);
  }
});

test('signup onboarding is success-triggered and dismissible', () => {
  assert.match(source, /id="signup-onboarding"[^>]+role="dialog"[^>]+aria-modal="true"[^>]+aria-hidden="true"[^>]+inert/);
  assert.match(source, /successMessage\.classList\.add\('show'\)[\s\S]*?showSignupOnboarding\(\);/);
  assert.match(source, /onboardingCloseButton\?\.addEventListener\('click', hideSignupOnboarding\)/);
  assert.match(source, /onboardingLaterButton\?\.addEventListener\('click', hideSignupOnboarding\)/);
  assert.match(source, /event\.key === 'Escape'[\s\S]*?hideSignupOnboarding\(\)/);
  assert.match(source, /event\.target === signupOnboarding/);
});

test('alternate login-page signup receives the same onboarding and remains dismissible', () => {
  assert.match(loginSource, /Don’t just search for jobs\. Let recruiters find you\./);
  assert.match(loginSource, /Share your details in less than 2 minutes with MSC’s network of 1,000\+ recruiters\. Let your next opportunity find you\./);
  assert.match(loginSource, /id="login-signup-onboarding-cta"[^>]*>Complete My Profile →/);
  assert.match(loginSource, /data\.user && !data\.session[\s\S]*?showLoginSignupOnboarding\(\)/);
  assert.match(loginSource, /else if \(data\.session\)[\s\S]*?showLoginSignupOnboarding\(\)/);
  assert.match(loginSource, /loginSignupOnboardingClose\?\.addEventListener\('click', hideLoginSignupOnboarding\)/);
});
