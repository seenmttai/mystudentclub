// Sign-up tick-boxes and the required portal popup after signup (scripts/career-profile.js). Needs jsdom.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const source = fs.readFileSync(path.join(__dirname, '../scripts/career-profile.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await tick(); };
const VERSION = '2026-11-07';
// Objects made inside the jsdom window have that window's Object prototype; compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));

function harness({ meta = {}, intakes = [], rpcErrors = {}, page = 'https://mystudentclub.com/login.html', pending = null } = {}) {
  const dom = new JSDOM('<!doctype html><head></head><body><div id="consent"></div></body>', { url: page, runScripts: 'outside-only' });
  const user = { id: 'u-1', email: 'new@example.test', user_metadata: { msc_onboarding_seen: true, ...meta }, app_metadata: { provider: 'email' }, identities: [] };
  const state = { rpc: [], metadata: [], signedOut: false, intakes: [...intakes] };
  const db = {
    auth: {
      getSession: async () => ({ data: { session: state.signedOut ? null : { user } } }),
      onAuthStateChange: () => {},
      updateUser: async ({ data }) => { state.metadata.push(data); Object.assign(user.user_metadata, data); return {}; },
      signOut: async () => { state.signedOut = true; return {}; },
    },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; },
        limit: async () => (table === 'career_intakes' ? { data: state.intakes.map(stage => ({ stage })) } : { data: [] }),
        maybeSingle: async () => ({ data: null }),
        then(resolve) { return Promise.resolve({ data: [] }).then(resolve); },
      };
      return query;
    },
    rpc: async (name, args) => {
      state.rpc.push({ name, args });
      if (rpcErrors[name]) return { error: { message: rpcErrors[name] } };
      if (name === 'submit_signup_career_intake') state.intakes.push(args.p_stage);
      return { data: { saved: true } };
    },
  };
  if (pending) dom.window.sessionStorage.setItem('msc_signup_consent_pending', JSON.stringify(pending));
  dom.window.supabaseClient = db;
  dom.window.eval(source);
  const doc = dom.window.document;
  const popup = () => doc.querySelector('.msc-career-overlay');
  async function answer(stage = 'industrial-training') {
    const form = popup().querySelector('form');
    const set = (name, value) => { const el = form.querySelector(`[name="${name}"]`); if (el) { el.value = value; el.dispatchEvent(new dom.window.Event('change', { bubbles: true })); } };
    const card = form.querySelector(`input[name="career_stage"][value="${stage}"]`);
    card.checked = true;
    card.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    set('attempt_month', 'May'); set('attempt_year', '2026');
    set('earliest_joining_date', '2026-11-01'); set('industrial_training_eligibility_date', '2026-10-01');
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    await settle();
  }
  return { dom, doc, user, state, api: dom.window.MSCCareerProfile, popup, answer };
}

test('the sign-up page shows one tick-box (promotional emails), ticked by default, with the exact wording', () => {
  const { doc, api } = harness();
  const consent = api.mountSignupConsent(doc.getElementById('consent'));
  const boxes = [...doc.querySelectorAll('#consent input[type="checkbox"]')];
  assert.equal(boxes.length, 1, 'only the promotional box: recruiter sharing is asked when a CV is uploaded');
  assert.ok(boxes[0].checked, 'starts ticked (Padam, 6 Nov 2026)');
  const text = doc.getElementById('consent').textContent;
  assert.doesNotMatch(text, /recruiters/);
  assert.match(text, /Email me about new batches, events, updates and offers\./);
  assert.deepEqual(plain(consent.read()), { promotional: true, version: VERSION });
  boxes[0].checked = false;
  assert.deepEqual(plain(consent.read()), { promotional: false, version: VERSION });
});

test('a new email sign-up records consent once, then must answer the portal popup (no close, no phone, no consent box)', async () => {
  const h = harness({ meta: { msc_signup_consent: { promotional: false, version: VERSION } } });
  const done = h.api.finishAuth(h.user, '/');
  await settle();
  assert.deepEqual(plain(h.state.rpc[0]), { name: 'record_signup_consent', args: { p_promotional: false, p_version: VERSION } });
  assert.equal(h.user.user_metadata.msc_signup_consent_recorded, true);
  const popup = h.popup();
  assert.ok(popup, 'the portal popup is shown');
  assert.equal(popup.querySelector('.msc-career-close'), null, 'no close button');
  for (const name of ['phone', 'name', 'email', 'sharing_consent']) assert.equal(popup.querySelector(`[name="${name}"]`), null, `no ${name} field`);
  const cards = [...popup.querySelectorAll('.msc-stage-card')];
  assert.deepEqual(cards.map(card => card.textContent.trim()), ['Industrial Training', 'Articleship', 'CA Fresher', 'Experienced CA', 'Semi Qualified CA'], 'five portal cards, no dropdown');
  assert.equal(popup.querySelector('select[name="career_stage"]'), null, 'no dropdown');
  assert.ok(cards.every(card => card.querySelector('.msc-stage-icon svg')), 'each card has an icon');
  assert.equal(popup.querySelector('[data-career-signout]'), null, 'no sign-out link');
  h.doc.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  popup.dispatchEvent(new h.dom.window.MouseEvent('click', { bubbles: true }));
  await settle();
  assert.ok(h.popup(), 'Escape and clicking outside do not close it');
  await h.answer('industrial-training');
  const save = h.state.rpc.find(call => call.name === 'submit_signup_career_intake');
  assert.ok(save, 'answers saved through the sign-up function');
  assert.equal(save.args.p_stage, 'industrial-training');
  assert.equal(save.args.p_details.phone, undefined);
  assert.equal(save.args.p_details.sharing_consent, undefined);
  assert.equal(save.args.p_details.email, 'new@example.test');
  assert.equal(h.state.rpc.filter(call => call.name === 'submit_career_intake').length, 0, 'the resource-form function is not used');
  assert.equal(h.popup(), null, 'popup closes after saving');
  assert.equal(await done, true);
  assert.equal(h.state.rpc.filter(call => call.name === 'record_signup_consent').length, 1, 'consent recorded exactly once');
});

test('existing students (no sign-up consent) never see the popup and nothing is recorded', async () => {
  const h = harness();
  assert.equal(await h.api.finishAuth(h.user, '/'), true);
  assert.equal(h.state.rpc.length, 0);
  assert.equal(h.popup(), null);
});

test('while the database part is not live, login continues with no popup', async () => {
  const h = harness({ meta: { msc_signup_consent: { promotional: true, version: VERSION } }, rpcErrors: { record_signup_consent: 'function public.record_signup_consent does not exist' } });
  // If the popup wrongly appeared, finishAuth would wait on it forever: fail clearly instead of hanging.
  const outcome = await Promise.race([h.api.finishAuth(h.user, '/'), new Promise(resolve => setTimeout(() => resolve('blocked by popup'), 3000))]);
  assert.equal(outcome, true);
  assert.equal(h.popup(), null);
  assert.equal(h.user.user_metadata.msc_signup_consent_recorded, undefined, 'not marked recorded, so it retries next login');
});

test('a student who already answered is not asked again', async () => {
  const h = harness({ meta: { msc_signup_consent: { promotional: true, version: VERSION }, msc_signup_consent_recorded: true }, intakes: ['articleship'] });
  assert.equal(await h.api.finishAuth(h.user, '/'), true);
  assert.equal(h.popup(), null);
  assert.equal(h.state.rpc.length, 0, 'already recorded consent is not sent again');
});

test('Google sign-up: the boxes carried in sessionStorage are recorded and then cleared', async () => {
  const h = harness({ pending: { promotional: true, version: VERSION } });
  h.api.finishAuth(h.user, '/');
  await settle();
  assert.deepEqual(plain(h.state.rpc[0].args), { p_promotional: true, p_version: VERSION });
  assert.equal(h.dom.window.sessionStorage.getItem('msc_signup_consent_pending'), null);
  assert.ok(h.popup(), 'and the portal popup follows');
});

test('rememberSignupConsent stores only the current wording version', () => {
  const h = harness();
  h.api.rememberSignupConsent({ promotional: true, version: '2001-01-01' });
  assert.equal(h.dom.window.sessionStorage.getItem('msc_signup_consent_pending'), null);
  h.api.rememberSignupConsent({ promotional: false, version: VERSION });
  assert.deepEqual(JSON.parse(h.dom.window.sessionStorage.getItem('msc_signup_consent_pending')), { promotional: false, version: VERSION });
});

test('choosing a card shows that portal\'s questions; switching cards swaps them', async () => {
  const h = harness({ meta: { msc_signup_consent: { promotional: true, version: VERSION } } });
  h.api.finishAuth(h.user, '/');
  await settle();
  const popup = h.popup();
  const pick = stage => { const radio = popup.querySelector(`input[name="career_stage"][value="${stage}"]`); radio.checked = true; radio.dispatchEvent(new h.dom.window.Event('change', { bubbles: true })); };
  assert.equal(popup.querySelector('[name="attempt_month"]'), null, 'no questions before a card is chosen');
  pick('articleship');
  assert.ok(popup.querySelector('[name="status"]'), 'articleship asks current status');
  assert.equal(popup.querySelector('[name="earliest_joining_date"]'), null, 'articleship asks no joining date');
  assert.ok(popup.querySelector('.msc-stage-card.is-selected input[value="articleship"]'), 'the chosen card is highlighted');
  pick('industrial-training');
  assert.ok(popup.querySelector('[name="industrial_training_eligibility_date"]'), 'industrial asks the eligibility date');
  assert.equal(popup.querySelectorAll('.msc-stage-card.is-selected').length, 1, 'only one card highlighted');
});

test('a failed save keeps the popup open with the answers and an error', async () => {
  const h = harness({ meta: { msc_signup_consent: { promotional: true, version: VERSION } }, rpcErrors: { submit_signup_career_intake: 'boom' } });
  h.api.finishAuth(h.user, '/');
  await settle();
  await h.answer('industrial-training');
  const popup = h.popup();
  assert.ok(popup, 'still open');
  assert.equal(popup.querySelector('[role="alert"]').hidden, false, 'error shown');
  assert.equal(popup.querySelector('input[name="career_stage"]:checked').value, 'industrial-training', 'answers kept');
});

test('a new sign-up who closed the tab gets the popup on the next page they open', async () => {
  const h = harness({ page: 'https://mystudentclub.com/ca-fresher-jobs', meta: { msc_signup_consent: { promotional: true, version: VERSION }, msc_signup_consent_recorded: true } });
  h.api.initOnboarding();
  await settle();
  assert.ok(h.popup(), 'popup on a normal page');
  assert.equal(h.popup().querySelector('.msc-career-close'), null);
});

test('both sign-up pages draw the boxes and send them with the sign-up', () => {
  for (const page of ['sign-up.html', 'login.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
    assert.match(html, /id="signup-consent"/, `${page} has the consent box container`);
    assert.match(html, /MSCCareerProfile\.mountSignupConsent\(document\.getElementById\('signup-consent'\)\)/, `${page} draws the boxes`);
    assert.match(html, /msc_signup_consent: signupConsent\.read\(\)/, `${page} sends them with the email sign-up`);
    assert.match(html, /MSCCareerProfile\.rememberSignupConsent\(signupConsent\.read\(\)\)/, `${page} carries them through Google`);
    assert.match(html, /career-profile\.js\?v=20261107\.1/, `${page} loads the new script version`);
  }
  const login = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8');
  const age = login.indexOf('id="signup-age-declaration"'), boxes = login.indexOf('id="signup-consent"'), submit = login.indexOf('id="signup-submit"');
  assert.ok(age > 0 && age < boxes && boxes < submit, 'on login.html the boxes sit below the 18+ box and above Continue');
  assert.match(login, /googleLoginBtn\.addEventListener\('click', handleGoogleSignIn\);/, 'logging in with Google carries no consent');
});
