// Articleship register page: a student who already owns the course sees "Open the course",
// never the Register form (asked by Aniket, 15 Nov 2026).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'articleship-program', 'register.js'), 'utf8');
const COURSE_URL = '/learning-management-system/course?course=msc-articleship-program';

function makeEl(extra = {}) {
  return {
    value: '', innerHTML: '', textContent: '', className: '', href: '', style: {},
    setAttribute() {}, removeAttribute() {}, focus() {}, appendChild() {},
    addEventListener() {}, querySelector: () => null, closest: () => null,
    ...extra,
  };
}

// Builds the page the script expects; `enrollment` is the rows Supabase returns, or an Error.
function load({ session, enrollment = [] } = {}) {
  const submitText = makeEl();
  const footerText = makeEl();
  const cardTitle = makeEl();
  const priceRow = makeEl();
  const trustLine = makeEl();
  const card = makeEl({
    querySelector: (sel) => ({ '.notify-card-title': cardTitle, '.register-price-row': priceRow, '.notify-trust-line': trustLine }[sel] || null),
  });
  const replaced = [];
  const form = makeEl({
    closest: (sel) => (sel === '.register-card' ? card : null),
    parentNode: { replaceChild: (next, prev) => replaced.push({ next, prev }) },
  });
  const hero = makeEl();
  const footerBtn = makeEl({ querySelector: (sel) => (sel === '.notify-footer-text' ? footerText : null) });
  const sampleLink = makeEl({ href: '#register' });
  const submitBtn = makeEl({ querySelector: (sel) => (sel === '.register-submit-text' ? submitText : null) });

  const byId = {
    registerForm: form, regName: makeEl(), regEmail: makeEl(), regPhone: makeEl(),
    registerSubmit: submitBtn, registerStatus: makeEl(), heroPrimaryCta: hero, registerFooterBtn: footerBtn,
  };
  const document = {
    getElementById: (id) => byId[id] || null,
    createElement: () => makeEl(),
    querySelectorAll: (sel) => (sel === 'a[href="#register"]' ? [sampleLink] : []),
    body: { appendChild() {} },
  };
  const queries = [];
  const sb = {
    auth: { getSession: () => Promise.resolve({ data: { session } }) },
    from: (table) => ({
      select: () => ({
        eq: (col, val) => {
          queries.push({ table, col, val });
          if (enrollment instanceof Error) return Promise.reject(enrollment);
          return Promise.resolve({ data: enrollment, error: null });
        },
      }),
    }),
  };
  const window = { location: { search: '', origin: 'https://mobile.mystudentclub.com' }, addEventListener() {}, supabaseClient: sb };
  vm.runInNewContext(src, { window, document, URLSearchParams, setTimeout, fetch: () => Promise.reject(new Error('no network in tests')) });
  return { byId, hero, footerBtn, footerText, cardTitle, priceRow, trustLine, sampleLink, replaced, queries, form };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));
const student = { user: { id: 'u-1', email: 'student@example.com', user_metadata: { full_name: 'Student One' } } };

test('an enrolled student gets Open the course everywhere instead of Register', async () => {
  const page = load({ session: student, enrollment: [{ course: 'excel' }, { course: 'msc-articleship-program' }] });
  await settle(); await settle();
  assert.deepEqual(page.queries, [{ table: 'enrollment', col: 'uuid', val: 'u-1' }]);
  assert.equal(page.hero.href, COURSE_URL);
  assert.match(page.hero.innerHTML, /Already Enrolled/);
  assert.equal(page.footerBtn.href, COURSE_URL);
  assert.equal(page.footerText.textContent, 'Open Course');
  assert.equal(page.sampleLink.href, COURSE_URL);
  assert.match(page.cardTitle.textContent, /already enrolled/);
  assert.equal(page.priceRow.style.display, 'none');
  assert.equal(page.replaced.length, 1, 'form swapped for the course button');
  assert.equal(page.replaced[0].prev, page.form);
  assert.equal(page.replaced[0].next.href, COURSE_URL);
});

test('old course names still count as enrolled', async () => {
  const page = load({ session: student, enrollment: [{ course: ' Articleship-Mastery ' }] });
  await settle(); await settle();
  assert.equal(page.hero.href, COURSE_URL);
});

test('a signed-in student without the course keeps the register form (prefilled)', async () => {
  const page = load({ session: student, enrollment: [{ course: 'excel' }] });
  await settle(); await settle();
  assert.equal(page.hero.href, '', 'hero CTA untouched');
  assert.equal(page.replaced.length, 0, 'form stays');
  assert.equal(page.byId.regEmail.value, 'student@example.com');
  assert.equal(page.byId.regName.value, 'Student One');
});

test('no session or a failed enrollment check never breaks the page', async () => {
  const out = load({ session: null });
  await settle();
  assert.equal(out.replaced.length, 0);
  const broken = load({ session: student, enrollment: new Error('network down') });
  await settle(); await settle();
  assert.equal(broken.replaced.length, 0);
});
