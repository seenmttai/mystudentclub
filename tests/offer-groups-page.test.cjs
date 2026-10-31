// /offer-groups and /admin-offer-groups in jsdom: status screens, the form, the one-time warning, the request sent to
// the offer-verify Worker, and that only WhatsApp links reach the page.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const pageJs = fs.readFileSync(path.join(root, 'scripts/offer-groups.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(root, 'scripts/admin-offer-groups.js'), 'utf8');
const companies = JSON.parse(fs.readFileSync(path.join(root, 'assets/data/offer-companies.json'), 'utf8'));
const categories = JSON.parse(fs.readFileSync(path.join(root, 'categories.json'), 'utf8'));
const core = require(path.join(root, 'scripts/offer-groups.js'));
const wait = (ms = 0) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 2000) { const t = Date.now(); while (!fn()) { if (Date.now() - t > ms) throw new Error('timed out'); await wait(5); } }

const USER = { id: 'u1', user_metadata: { full_name: 'Asha Verma' } };
const OPEN = { signed_in: true, banned: false, claim: null, groups: [], has_company_group: false, rejected_today: 0, rejected_total: 0 };
const GROUPS = [
  { kind: 'company_city', title: 'Deloitte Gurgaon IT', url: 'https://chat.whatsapp.com/AbCdEf1234567890', company: 'Deloitte', city: 'Gurgaon' },
  { kind: 'general', title: 'Bad link', url: 'javascript:alert(1)' },
  { kind: 'general', title: 'MSCIT <b>students</b>', url: 'https://chat.whatsapp.com/Zyxwvu0987654321?mode=gi_t' },
];

function page({ session = { access_token: 'tok', user: USER }, status = OPEN, verify, profileName = 'Asha Verma' } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'offer-groups.html'), 'utf8'), { url: 'https://www.mystudentclub.com/offer-groups', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const sent = [];
  w.MSC_OFFER_GROUPS_MANUAL = true;
  w.eval(pageJs);
  const client = {
    auth: { getSession: async () => ({ data: { session } }) },
    rpc: async (fn) => (fn === 'my_offer_status' ? { data: status, error: null } : { data: null, error: { message: 'nope' } }),
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { profile: { name: profileName } } }) }) }) }),
  };
  const fetch = async (url, init) => {
    if (url === '/assets/data/offer-companies.json') return { ok: true, json: async () => companies };
    if (url === '/categories.json') return { ok: true, json: async () => categories };
    sent.push({ url, init, body: JSON.parse(init.body) });
    const r = typeof verify === 'function' ? verify(JSON.parse(init.body)) : verify;
    return { ok: true, json: async () => r };
  };
  const prepareFile = async (file, password) => {
    if (file.name === 'locked.pdf' && password !== 'PAN123') throw new w.MSCOfferGroups.PasswordNeeded(!!password);
    return { pages: ['QUFB'.repeat(400)], text: 'Dear Asha', totalPages: 2, encrypted: !!password, original: { name: file.name, type: 'application/pdf', data: 'JVBERg==' } };
  };
  const app = w.MSCOfferGroups.init({ root: w.document.getElementById('offer-app'), client, fetch, prepareFile, verifyUrl: 'https://offer.test/verify', now: () => new Date('2026-10-31T10:00:00Z'), focus: false });
  return { dom, w, doc: w.document, sent, app };
}

function pick(t, name = 'offer.pdf') {
  const input = t.doc.getElementById('og-file');
  const file = new t.w.File(['%PDF'], name, { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new t.w.Event('change', { bubbles: true }));
}
function fill(t, v = {}) {
  const d = t.doc;
  d.getElementById('og-cat-' + (v.category || 'industrial-training')).click();
  const set = (id, val) => { const e = d.getElementById(id); e.value = val; e.dispatchEvent(new t.w.Event('change', { bubbles: true })); };
  set('og-company', v.company ?? 'deloitte haskins & sells llp');
  d.getElementById('og-company').dispatchEvent(new t.w.Event('blur'));
  set('og-city', v.city ?? 'gurugram');
  set('og-domain', v.domain ?? 'Internal Audit');
  set('og-date', v.date ?? '2026-12-01');
}
const submit = (t) => t.doc.querySelector('.og-form button[type=submit]').click();

test('signed out → sign in link back to the page', async () => {
  const t = page({ session: null });
  await until(() => t.doc.querySelector('.og-card a'));
  assert.equal(t.doc.querySelector('.og-card a').getAttribute('href'), '/login.html?redirect=%2Foffer-groups');
});

test('verified students see Hogaya, Padam’s message and only safe WhatsApp links, as text', async () => {
  const t = page({ status: { ...OPEN, claim: { status: 'verified', name: 'ASHA R. VERMA', category: 'industrial-training', company: 'Deloitte', city: 'Gurgaon' }, groups: GROUPS, has_company_group: true } });
  await until(() => t.doc.querySelector('.og-hogaya'));
  assert.match(t.doc.querySelector('.og-hogaya').textContent, /Hogaya!/);
  const text = t.doc.querySelector('.og-message').textContent;
  assert.match(text, /Congratulations Asha! All your efforts paid off well/);
  assert.match(text, /two-letter prefix as a CA Fresher/);
  assert.match(text, /Looking forward to like, comment and repost your joining post/);
  const links = [...t.doc.querySelectorAll('.og-group a')].map((a) => a.getAttribute('href'));
  assert.deepEqual(links, ['https://chat.whatsapp.com/AbCdEf1234567890', 'https://chat.whatsapp.com/Zyxwvu0987654321?mode=gi_t']);
  assert.ok([...t.doc.querySelectorAll('.og-group a')].every((a) => a.target === '_blank' && /noopener/.test(a.rel)));
  assert.equal(t.doc.querySelectorAll('.og-group strong')[1].textContent, 'MSCIT <b>students</b>');
  assert.equal(t.doc.querySelector('.og-group b'), null);
  assert.equal(t.doc.querySelector('.og-note'), null);
});

test('CA Freshers get the message without the prefix line; no company group yet shows a note', async () => {
  assert.doesNotMatch(core.successMessage('Ravi', 'ca-fresher').join(' '), /prefix/);
  assert.match(core.successMessage('Ravi', 'semi-qualified').join(' '), /prefix/);
  const t = page({ status: { ...OPEN, claim: { status: 'verified', name: 'Ravi', category: 'ca-fresher', company: 'KPMG', city: 'Pune' }, groups: [GROUPS[2]], has_company_group: false } });
  await until(() => t.doc.querySelector('.og-note'));
  assert.match(t.doc.querySelector('.og-note').textContent, /KPMG · Pune group is being set up/);
});

test('review, banned and withdrawn claims each get their own screen', async () => {
  const review = page({ status: { ...OPEN, claim: { status: 'review', name: 'Asha Verma', company: 'EY', reasons: ['name_mismatch'] } } });
  await until(() => review.doc.querySelector('.og-review'));
  assert.match(review.doc.querySelector('.og-review').textContent, /Almost there, Asha!.*name on the letter is different/s);
  const fake = page({ status: { ...OPEN, claim: { status: 'review', name: 'Asha Verma', company: 'EY', reasons: ['suspected_fake'] } } });
  await until(() => fake.doc.querySelector('.og-review'));
  assert.doesNotMatch(fake.doc.querySelector('.og-review').textContent, /fake|edit/i);
  const banned = page({ status: { ...OPEN, banned: true } });
  await until(() => banned.doc.querySelector('.og-card h2'));
  assert.match(banned.doc.querySelector('.og-card h2').textContent, /cannot share/);
  const revoked = page({ status: { ...OPEN, claim: { status: 'revoked', name: 'A' } } });
  await until(() => revoked.doc.querySelector('.og-card h2'));
  assert.match(revoked.doc.querySelector('.og-card h2').textContent, /withdrawn/);
});

test('form: required fields, domain list per category, MSC spellings, name prefilled from the profile', async () => {
  const t = page({ profileName: 'Asha Verma' });
  await until(() => t.doc.getElementById('og-company'));
  assert.equal(t.doc.getElementById('og-name').value, 'Asha Verma');
  assert.equal(t.doc.getElementById('og-domain').disabled, true);
  assert.equal(t.doc.querySelectorAll('#og-company-list option').length, companies.companies.length);
  submit(t);
  const errors = [...t.doc.querySelectorAll('.og-field-error')].map((e) => e.textContent).filter(Boolean);
  assert.deepEqual(errors, ['Choose what you are joining as.', 'Enter the company or firm name.', 'Enter the city you will work in.', 'Choose your domain.', 'Enter your joining date.', 'Upload your offer letter.']);
  assert.equal(t.doc.querySelector('.og-modal'), null);
  t.doc.getElementById('og-cat-articleship').click();
  assert.ok([...t.doc.getElementById('og-domain').options].some((o) => o.value === 'Statutory Audit'));
  fill(t);
  assert.equal(t.doc.getElementById('og-company').value, 'Deloitte');
  t.doc.getElementById('og-date').value = '2030-01-01';
  pick(t);
  await until(() => t.app.state.prepared);
  submit(t);
  assert.match(t.doc.querySelector('[data-field=joining_date] .og-field-error').textContent, /looks wrong/);
});

test('the one-time warning must be ticked before anything is sent; the request carries the token and pages', async () => {
  const t = page({ verify: { ok: true, status: 'verified', name: 'Asha Verma', category: 'industrial-training', company: 'Deloitte', city: 'Gurgaon', groups: GROUPS, has_company_group: true } });
  await until(() => t.doc.getElementById('og-company'));
  fill(t);
  pick(t);
  await until(() => t.app.state.prepared);
  submit(t);
  const modal = t.doc.querySelector('.og-modal');
  assert.ok(modal);
  assert.match(modal.textContent, /You can do this only once\./);
  assert.match(modal.textContent, /permanently ban your MSC account/);
  assert.match(modal.textContent, /I am joining Deloitte\./);
  const yes = modal.querySelector('.og-btn-primary');
  assert.equal(yes.disabled, true);
  modal.querySelector('.og-btn-ghost').click();
  assert.equal(t.doc.querySelector('.og-modal'), null);
  assert.equal(t.sent.length, 0);
  submit(t);
  t.doc.getElementById('og-confirm').click();
  t.doc.querySelector('.og-modal .og-btn-primary').click();
  await until(() => t.doc.querySelector('.og-hogaya'));
  assert.equal(t.sent.length, 1);
  const { url, init, body } = t.sent[0];
  assert.equal(url, 'https://offer.test/verify');
  assert.equal(init.headers.Authorization, 'Bearer tok');
  assert.equal(init.credentials, 'omit');
  assert.deepEqual({ ...body, pages: body.pages.length }, {
    category: 'industrial-training', company: 'Deloitte', city: 'Gurgaon', domain: 'Internal Audit', joining_date: '2026-12-01', name: 'Asha Verma',
    confirm: true, pages: 1, text: 'Dear Asha', file: { name: 'offer.pdf', type: 'application/pdf', data: 'JVBERg==' }, encrypted: false,
  });
});

test('locked PDFs ask for the password; a wrong one asks again', async () => {
  const t = page();
  await until(() => t.doc.getElementById('og-company'));
  pick(t, 'locked.pdf');
  await until(() => !t.doc.querySelector('.og-password').hidden);
  assert.match(t.doc.querySelector('.og-password label').textContent, /locked/);
  const pw = () => t.doc.getElementById('og-pdf-password');
  pw().value = 'nope';
  t.doc.querySelector('.og-password button').click();
  await until(() => /did not open/.test(t.doc.querySelector('.og-password label')?.textContent || ''));
  pw().value = 'PAN123';
  t.doc.querySelector('.og-password button').click();
  await until(() => t.app.state.prepared);
  assert.equal(t.app.state.prepared.encrypted, true);
  assert.match(t.doc.querySelector('.og-file-box').textContent, /Unlocked/);
});

test('rejections show the reason and tries left; a wrong company keeps the file, other reasons clear it', async () => {
  let reply = { ok: true, status: 'rejected', code: 'company_mismatch', message: 'This letter is from KPMG, not Deloitte.', tries_left_today: 4 };
  const t = page({ verify: () => reply });
  await until(() => t.doc.getElementById('og-company'));
  fill(t);
  pick(t);
  await until(() => t.app.state.prepared);
  const send = async () => { submit(t); t.doc.getElementById('og-confirm').click(); t.doc.querySelector('.og-modal .og-btn-primary').click(); await until(() => t.doc.querySelector('.og-alert')); };
  await send();
  assert.equal(t.doc.querySelector('.og-alert').textContent, 'This letter is from KPMG, not Deloitte. (4 more tries today.)');
  assert.ok(t.app.state.prepared, 'file kept');
  assert.equal(t.doc.getElementById('og-company').value, 'Deloitte');
  reply = { ok: true, status: 'rejected', code: 'not_offer_letter', message: 'Not an offer letter.', tries_left_today: 0 };
  await send();
  assert.match(t.doc.querySelector('.og-alert').textContent, /You can try again tomorrow/);
  assert.equal(t.app.state.prepared, null, 'file cleared');
});

test('worker errors: busy keeps the form and the file', async () => {
  const t = page({ verify: { ok: false, error: 'busy', message: 'Our letter checker is busy right now.' } });
  await until(() => t.doc.getElementById('og-company'));
  fill(t);
  pick(t);
  await until(() => t.app.state.prepared);
  submit(t); t.doc.getElementById('og-confirm').click(); t.doc.querySelector('.og-modal .og-btn-primary').click();
  await until(() => t.doc.querySelector('.og-alert'));
  assert.match(t.doc.querySelector('.og-alert').textContent, /busy/);
  assert.ok(t.app.state.prepared);
});

test('company and city snapping', () => {
  assert.equal(core.snapCompany('S.R. Batliboi & Co. LLP', companies), 'EY');
  assert.equal(core.snapCompany('Walker Chandiok & Co LLP', companies), 'Grant Thornton Bharat');
  assert.equal(core.snapCompany('New Startup Pvt Ltd', companies), 'New Startup Pvt Ltd');
  assert.equal(core.snapCity('Bengaluru', companies), 'Bangalore');
  assert.equal(core.firstName('ASHA R VERMA'), 'Asha');
  assert.equal(core.firstName('Md. Iqbal'), 'Md.');
});

test('admin: only super admins get in; review card shows the AI reasons as text; group links are checked', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'admin-offer-groups.html'), 'utf8'), { url: 'https://www.mystudentclub.com/admin-offer-groups', runScripts: 'outside-only' });
  const w = dom.window;
  w.MSC_ADMIN_OFFER_GROUPS_MANUAL = true;
  w.eval(adminJs);
  const calls = [];
  let admin = false;
  const claim = { id: 'c1', user_id: 'u2', email: 'x@example.test', name: 'Rohan <img src=x onerror=alert(1)>', category: 'industrial-training', company: 'Deutsche Bank', city: 'Mumbai', joining_date: '2026-11-16', status: 'review', reasons: ['suspected_fake'], notes: [], ai: { summary: 'Name pasted', tamper_signs: ['different font'] }, page_paths: ['p1.jpg'], created_at: '2026-10-31T10:00:00Z', banned: false, attempts: 1 };
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'a' } } } }) },
    rpc: async (fn, args) => { calls.push([fn, args]); return { data: { is_super_admin: admin, admin_offer_claims: [claim], admin_offer_missing_groups: [], admin_offer_ban: { auth_banned: true }, admin_offer_groups: [] }[fn] ?? null, error: null }; },
    storage: { from: () => ({ createSignedUrl: async (p) => ({ data: { signedUrl: 'https://signed.test/' + p }, error: null }) }) },
  };
  const rootEl = w.document.getElementById('aog-app');
  w.MSCAdminOfferGroups.init({ root: rootEl, client, prompt: () => 'Edited letter', confirm: () => true });
  await until(() => /only for MSC super admins/.test(rootEl.textContent));
  admin = true;
  w.MSCAdminOfferGroups.init({ root: rootEl, client, prompt: () => 'Edited letter', confirm: () => true });
  await until(() => rootEl.querySelector('.aog-card'));
  assert.equal(rootEl.querySelector('img'), null);
  assert.match(rootEl.querySelector('.aog-card').textContent, /Looks fake/);
  assert.match(rootEl.querySelector('.aog-tamper').textContent, /different font/);
  [...rootEl.querySelectorAll('.aog-btn')].find((b) => b.textContent === 'View letter').click();
  await until(() => rootEl.querySelector('.aog-letter a'));
  assert.equal(rootEl.querySelector('.aog-letter a').href, 'https://signed.test/p1.jpg');
  [...rootEl.querySelectorAll('.aog-btn')].find((b) => b.textContent === 'Ban account').click();
  await until(() => calls.some((c) => c[0] === 'admin_offer_ban'));
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find((c) => c[0] === 'admin_offer_ban')[1])), { p_claim_id: 'c1', p_reason: 'Edited letter' });
  [...rootEl.querySelectorAll('.aog-tab')].find((b) => b.textContent.startsWith('Group links')).click();
  await until(() => rootEl.querySelector('.aog-toolbar .aog-btn-ok'));
  rootEl.querySelector('.aog-toolbar .aog-btn-ok').click();
  const form = rootEl.querySelector('.aog-form');
  form.querySelector('#aog-g-title').value = 'MSC · Deutsche Bank Mumbai';
  form.querySelector('#aog-g-url').value = 'https://example.com/x';
  form.dispatchEvent(new w.Event('submit', { cancelable: true }));
  await wait(5);
  assert.match(form.querySelector('.aog-bad').textContent, /WhatsApp invite link/);
  assert.ok(!calls.some((c) => c[0] === 'admin_offer_group_save'));
  form.querySelector('#aog-g-url').value = 'https://chat.whatsapp.com/AbCdEf1234567890/';
  form.dispatchEvent(new w.Event('submit', { cancelable: true }));
  await until(() => calls.some((c) => c[0] === 'admin_offer_group_save'));
  assert.equal(calls.find((c) => c[0] === 'admin_offer_group_save')[1].p_url, 'https://chat.whatsapp.com/AbCdEf1234567890');
  assert.match(w.MSCAdminOfferGroups.csv([{ name: 'A, "B"', reasons: ['x', 'y'] }]), /"A, ""B"""/);
});

test('profile "Got placed?" card opens /offer-groups', () => {
  const html = fs.readFileSync(path.join(root, 'profile.html'), 'utf8');
  const card = html.slice(html.indexOf('id="sec-placed"'), html.indexOf('<form id="profile-form"'));
  assert.match(card, /href="\/offer-groups"/);
  assert.doesNotMatch(html, /placed-card\.js/);
});
