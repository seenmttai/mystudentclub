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

function page({ session = { access_token: 'tok', user: USER }, status = OPEN, verify, profileName = 'Asha Verma', insights = null, saveError = null } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'offer-groups.html'), 'utf8'), { url: 'https://www.mystudentclub.com/offer-groups', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window;
  const sent = [];
  const saved = [];
  w.MSC_OFFER_GROUPS_MANUAL = true;
  w.eval(pageJs);
  const client = {
    auth: { getSession: async () => ({ data: { session } }) },
    rpc: async (fn, args) => {
      if (fn === 'my_offer_status') return { data: status, error: null };
      if (fn === 'my_offer_insights') return { data: insights, error: null };
      if (fn === 'save_offer_insights') { saved.push(args); return saveError ? { data: null, error: { message: saveError } } : { data: { ok: true }, error: null }; }
      return { data: null, error: { message: 'nope' } };
    },
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
  return { dom, w, doc: w.document, sent, saved, app };
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
const INTERVIEW = 'Deloitte round 1: Ind AS 115 five steps, deferred tax, how to vouch expenses. HR round: why Deloitte, notice period.';
// The "help the next student" step: fill it and submit.
async function answer(t, { interview = INTERVIEW, pledge = true, hr } = {}) {
  await until(() => t.doc.getElementById('og-interview'));
  const d = t.doc;
  const ta = d.getElementById('og-interview');
  ta.value = interview; ta.dispatchEvent(new t.w.Event('input', { bubbles: true }));
  (hr || []).forEach((row, i) => {
    if (i > 0 && !d.getElementById(`og-hr-name-${i}`)) [...d.querySelectorAll('.og-questions .og-link')].find((b) => /Add another/.test(b.textContent)).click();
    Object.entries(row).forEach(([k, v]) => { const e = d.getElementById(`og-hr-${k}-${i}`); e.value = v; e.dispatchEvent(new t.w.Event('input', { bubbles: true })); });
  });
  if (pledge && !d.getElementById('og-pledge').checked) d.getElementById('og-pledge').click();
  d.querySelector('.og-questions button[type=submit]').click();
}
const confirmAndAnswer = async (t, opts) => { submit(t); t.doc.getElementById('og-confirm').click(); t.doc.querySelector('.og-modal .og-btn-primary').click(); await answer(t, opts); };

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
  await until(() => t.doc.getElementById('og-interview'));
  assert.equal(t.sent.length, 0, 'nothing is sent before the questions are answered');
  await answer(t);
  await until(() => t.doc.querySelector('.og-hogaya'));
  assert.equal(t.saved.length, 1);
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
  const send = async () => { await confirmAndAnswer(t); await until(() => t.doc.querySelector('.og-form:not(.og-questions) .og-alert')); };
  await send();
  assert.equal(t.doc.querySelector('.og-alert').textContent, 'This letter is from KPMG, not Deloitte. (4 more tries today.)');
  assert.equal(t.saved.length, 1);
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
  await confirmAndAnswer(t);
  await until(() => t.doc.querySelector('.og-form:not(.og-questions) .og-alert'));
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

test('help the next student: interview answer and the vacancy tick are required; HR rows are checked and saved', async () => {
  const t = page({ verify: { ok: true, status: 'verified', name: 'Asha Verma', category: 'industrial-training', company: 'Deloitte', city: 'Gurgaon', groups: GROUPS, has_company_group: true } });
  await until(() => t.doc.getElementById('og-company'));
  fill(t);
  pick(t);
  await until(() => t.app.state.prepared);
  submit(t); t.doc.getElementById('og-confirm').click(); t.doc.querySelector('.og-modal .og-btn-primary').click();
  await until(() => t.doc.getElementById('og-interview'));
  const q = t.doc.querySelector('.og-questions');
  assert.match(q.textContent, /What were you asked in your interviews\?/);
  assert.match(q.textContent, /be detailed/);
  assert.match(q.textContent, /81041 35784/);
  const wa = [...q.querySelectorAll('a')].find((a) => a.textContent === 'Share on WhatsApp');
  assert.match(decodeURIComponent(wa.href), /^https:\/\/wa\.me\/918104135784\?text=.*Deloitte/);
  assert.ok([...q.querySelectorAll('a')].some((a) => a.href === 'https://hire.mystudentclub.com/'));
  // Too short, no tick, a broken HR row: nothing is saved or sent.
  await answer(t, { interview: 'Basic questions.', pledge: false, hr: [{ name: 'Priya', phone: '98765' }] });
  assert.match(t.doc.getElementById('og-interview-error').textContent, /a few lines/);
  assert.match(t.doc.getElementById('og-pledge-error').textContent, /tick/);
  assert.match(t.doc.querySelector('[data-hr-row="0"] .og-field-error').textContent, /incomplete/);
  assert.equal(t.saved.length + t.sent.length, 0);
  // Fixed: two HR contacts (an empty row is ignored), saved before the letter is sent.
  await answer(t, { hr: [{ phone: '+91 98765 43210' }, { name: 'Rahul', company: 'KPMG', email: 'Rahul@KPMG.com' }, {}] });
  await until(() => t.doc.querySelector('.og-hogaya'));
  assert.equal(t.saved.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(t.saved[0])), {
    p_name: 'Asha Verma', p_category: 'industrial-training', p_company: 'Deloitte', p_city: 'Gurgaon', p_interview: INTERVIEW,
    p_hr: [{ name: 'Priya', company: '', phone: '919876543210', email: '' }, { name: 'Rahul', company: 'KPMG', phone: '', email: 'rahul@kpmg.com' }], p_pledge: true,
  });
  assert.equal(t.sent.length, 1);
});

test('help the next student: a failed save shows the error and sends nothing; earlier answers are filled in', async () => {
  const t = page({ saveError: 'Please tick the box about sharing vacancies', insights: { interview_questions: 'Earlier: ' + INTERVIEW, vacancy_pledge: true, hr: [{ name: 'Priya', company: 'Deloitte', phone: '919876543210', email: null }] } });
  await until(() => t.doc.getElementById('og-company'));
  fill(t);
  pick(t);
  await until(() => t.app.state.prepared);
  submit(t); t.doc.getElementById('og-confirm').click(); t.doc.querySelector('.og-modal .og-btn-primary').click();
  await until(() => t.doc.getElementById('og-interview'));
  assert.match(t.doc.getElementById('og-interview').value, /^Earlier: /);
  assert.equal(t.doc.getElementById('og-hr-phone-0').value, '919876543210');
  assert.equal(t.doc.getElementById('og-pledge').checked, true);
  t.doc.querySelector('.og-questions button[type=submit]').click();
  await until(() => !t.doc.querySelector('.og-questions .og-alert').hidden);
  assert.equal(t.doc.querySelector('.og-questions .og-alert').textContent, 'Please tick the box about sharing vacancies.');
  assert.equal(t.sent.length, 0);
  // Go back keeps the form and the file.
  t.doc.querySelector('.og-questions .og-btn-ghost').click();
  assert.ok(t.doc.getElementById('og-company'));
  assert.ok(t.app.state.prepared);
});

test('cleanHr: empty rows dropped, numbers cleaned, bad rows flagged', () => {
  const r = core.cleanHr([{}, { name: ' A ', phone: '98765-43210' }, { email: 'x@y' }, { name: 'Only name' }, { email: 'HR@Firm.in' }]);
  assert.deepEqual(r.rows, [{ name: 'A', company: '', phone: '9876543210', email: '' }, { name: '', company: '', phone: '', email: 'hr@firm.in' }]);
  assert.deepEqual(Object.keys(r.errors), ['2', '3']);
});

test('admin: interview answers show as text; HR contacts get a WhatsApp intro and can be marked messaged', async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'admin-offer-groups.html'), 'utf8'), { url: 'https://www.mystudentclub.com/admin-offer-groups', runScripts: 'outside-only' });
  const w = dom.window;
  w.MSC_ADMIN_OFFER_GROUPS_MANUAL = true;
  w.eval(adminJs);
  const calls = [];
  const answers = [{ user_id: 'u2', name: 'Rohan', email: 'r@example.test', category: 'industrial-training', company: 'Deloitte', city: 'Gurgaon', interview_questions: 'Round 1 <img src=x onerror=alert(1)>\nRound 2', vacancy_pledge: true, claim_status: 'verified', hr_count: 1, updated_at: '2026-11-17T10:00:00Z' }];
  const hr = [{ id: 'h1', name: 'Priya Sharma', company: 'Deloitte', phone: '919876543210', email: 'priya@deloitte.com', intro_status: 'new', created_at: '2026-11-17T10:00:00Z', student_name: 'Rohan', shared_by_others: 0, already_messaged: false }];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'a' } } } }) },
    rpc: async (fn, args) => { calls.push([fn, args]); return { data: { is_super_admin: true, admin_offer_claims: [], admin_offer_missing_groups: [], admin_offer_insights: answers, admin_offer_hr_contacts: hr }[fn] ?? null, error: null }; },
  };
  const rootEl = w.document.getElementById('aog-app');
  w.MSCAdminOfferGroups.init({ root: rootEl, client, prompt: () => '', confirm: () => true });
  await until(() => rootEl.querySelector('.aog-tab'));
  [...rootEl.querySelectorAll('.aog-tab')].find((b) => b.textContent.startsWith('Interview answers')).click();
  await until(() => rootEl.querySelector('.aog-pre'));
  assert.equal(rootEl.querySelector('img'), null);
  assert.match(rootEl.querySelector('.aog-pre').textContent, /Round 1 <img/);
  [...rootEl.querySelectorAll('.aog-tab')].find((b) => b.textContent.startsWith('HR contacts')).click();
  await until(() => [...rootEl.querySelectorAll('a')].some((a) => a.textContent === 'WhatsApp intro'));
  const wa = [...rootEl.querySelectorAll('a')].find((a) => a.textContent === 'WhatsApp intro');
  assert.match(wa.href, /^https:\/\/wa\.me\/919876543210\?text=Hi%20Priya%2C%20this%20is%20Team%20My%20Student%20Club/);
  assert.ok(!/Rohan/.test(decodeURIComponent(wa.href)), 'intro never names the student');
  [...rootEl.querySelectorAll('.aog-btn')].find((b) => b.textContent === 'Mark messaged').click();
  await until(() => calls.some((c) => c[0] === 'admin_offer_hr_mark'));
  assert.deepEqual(JSON.parse(JSON.stringify(calls.find((c) => c[0] === 'admin_offer_hr_mark')[1])), { p_id: 'h1', p_status: 'sent' });
  assert.match(w.MSCAdminOfferGroups.hrIntro('Priya Sharma'), /industrial training anytime soon/);
});
