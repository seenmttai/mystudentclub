const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'profile-state.js'), 'utf8');

function createState(storage = {}) {
  const localStorage = {
    getItem: key => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null,
    setItem: (key, value) => { storage[key] = String(value); },
    removeItem: key => { delete storage[key]; }
  };
  const context = { window: { localStorage }, Date, JSON, Object, String, Array };
  vm.runInNewContext(source, context);
  return { state: context.window.MSCProfileState, storage };
}

test('signup metadata seeds only empty profile fields', () => {
  const { state } = createState();
  const result = state.mergeAuthSignupValues(
    { name: 'Existing Name', email: '', contact_number: '9999999999' },
    { email: 'new@example.com', user_metadata: { first_name: 'New', last_name: 'Person', full_name: 'New Person' } }
  );

  assert.equal(result.profile.name, 'Existing Name');
  assert.equal(result.profile.email, 'new@example.com');
  assert.equal(result.profile.contact_number, '9999999999');
  assert.deepEqual(Array.from(result.seededFields), ['email']);
});

test('auth email remains authoritative while existing profile details are preserved', () => {
  const { state } = createState();
  const result = state.mergeAuthSignupValues(
    { name: 'Existing Name', email: 'old@example.com', contact_number: '9999999999' },
    { email: 'current@example.com', user_metadata: { full_name: 'New Person' } }
  );

  assert.equal(result.profile.email, 'current@example.com');
  assert.equal(result.profile.name, 'Existing Name');
  assert.equal(result.profile.contact_number, '9999999999');
  assert.deepEqual(Array.from(result.seededFields), ['email']);
});

test('cache is scoped to the authenticated user', () => {
  const { state, storage } = createState({ userProfileData: '{"name":"Old User"}', userProfileDataUserId: 'old-user' });
  state.prepareUserCache('new-user');
  assert.equal(storage.userProfileData, undefined);
  assert.equal(storage.userProfileDataUserId, undefined);

  state.cacheProfile({ name: 'New User' }, 'new-user');
  assert.deepEqual(state.readCachedProfile('new-user'), { name: 'New User' });
});

test('Supabase is read before signup values are merged and saved', async () => {
  const calls = [];
  const client = {
    from(table) {
      calls.push(['from', table]);
      const builder = {
        select(fields) {
          calls.push(['select', fields]);
          return {
            eq(field, value) {
              calls.push(['eq', field, value]);
              return {
                async maybeSingle() {
                  calls.push(['read']);
                  return { data: { profile: { name: 'Existing Name' }, ocr_cv: '', looking_for: null }, error: null };
                }
              };
            }
          };
        },
        upsert(payload) {
          calls.push(['upsert', payload]);
          return {
            select(fields) {
              calls.push(['saved-select', fields]);
              return {
                async maybeSingle() {
                  calls.push(['saved-read']);
                  return { data: { profile: payload.profile, ocr_cv: '', looking_for: null }, error: null };
                }
              };
            }
          };
        }
      };
      return builder;
    }
  };
  const { state } = createState();
  const result = await state.hydrateProfileFromSupabase(client, {
    id: 'user-1',
    email: 'person@example.com',
    user_metadata: { full_name: 'Person Example' }
  });

  assert.deepEqual(Array.from(result.seededFields), ['email']);
  assert.equal(result.profile.email, 'person@example.com');
  assert.equal(result.profile.name, 'Existing Name');
  assert.deepEqual(calls.slice(0, 4), [
    ['from', 'profiles'],
    ['select', 'profile, ocr_cv, updated_at, looking_for, articleship_1yr_end_date, ca_inter_attempt, ca_final_attempt, years_of_experience'],
    ['eq', 'uuid', 'user-1'],
    ['read']
  ]);
});

test('onboarding dismissal is remembered for the matching email only', () => {
  const { state } = createState();
  state.setOnboardingDismissed('Person@Example.com');
  assert.equal(state.wasOnboardingDismissed('person@example.com'), true);
  assert.equal(state.wasOnboardingDismissed('other@example.com'), false);
});
