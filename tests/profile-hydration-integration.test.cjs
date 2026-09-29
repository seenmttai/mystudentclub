const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('profile page hydrates Supabase before initializing the first-time wizard', () => {
  const source = read('scripts/profile.js');
  assert.match(source, /await profileState\.hydrateProfileFromSupabase\(supabaseClient, currentUser\)/);
  assert.match(source, /WZ\.init\(d, currentLookingFor\)/);
  assert.ok(source.indexOf('hydrateProfileFromSupabase') < source.indexOf('WZ.init(d, currentLookingFor)'));
});

test('both portals refresh Supabase before profile-dependent prompts', () => {
  for (const file of ['scripts/portal3.js', 'scripts/portal-email.js']) {
    const source = read(file);
    assert.match(source, /await fetchAndCacheProfileData\(\)/, file);
    assert.match(source, /hydrateProfileFromSupabase\(supabaseClient, currentSession\.user\)/, file);
    assert.match(source, /window\.MSCProfileState\.prepareUserCache\(session\.user\.id\)/, file);
  }
});

test('all profile-dependent pages load the shared state helper before their module', () => {
  assert.match(read('profile.html'), /profile-state\.js[\s\S]*profile\.js/);
  assert.match(read('index.html'), /profile-state\.js[\s\S]*portal3\.js/);
  assert.match(read('jobs-by-email.html'), /profile-state\.js[\s\S]*portal-email\.js/);
});

test('dismissed signup onboarding changes the dashboard reminder copy', () => {
  assert.match(read('scripts/portal3.js'), /wasOnboardingDismissed\(currentSession\?\.user\?\.email\)/);
  assert.match(read('scripts/portal-email.js'), /wasOnboardingDismissed\(currentSession\?\.user\?\.email\)/);
  assert.match(read('sign-up.html'), /setOnboardingDismissed\(lastSignupEmail\)/);
});
