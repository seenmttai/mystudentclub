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

test('profile section saves persist before the modal closes and before CV sync', () => {
  const profileSource = read('scripts/profile.js');
  const modalSave = profileSource.indexOf('await persistCurrentProfileSnapshot()');
  const modalClose = profileSource.indexOf('toggleForm(targetId)', modalSave);
  const profileSave = profileSource.indexOf('await persistProfileRecord(profileData, ocrText)');
  const cvSync = profileSource.indexOf('let syncSuccess = false');

  assert.ok(modalSave >= 0);
  assert.ok(modalClose > modalSave);
  assert.ok(profileSave >= 0);
  assert.ok(cvSync > profileSave);
});

test('portal renders the account widget after profile hydration', () => {
  const source = read('scripts/portal3.js');
  const hydrationWait = source.indexOf('await profileHydrationPromise');
  const headerRender = source.indexOf('updateHeaderAuth(session)', hydrationWait);

  assert.ok(hydrationWait >= 0);
  assert.ok(headerRender > hydrationWait);
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
