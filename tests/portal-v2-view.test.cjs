// Job portal v2: the card and the vacancy detail never leak apply details of a locked exclusive vacancy, never print
// the LinkedIn post to someone who may not see it, and escape every database value (scripts/portal-v2/job-view.js).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
let core;
let view;

test.before(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msc-pv2-view-'));
  for (const name of ['jobs-core', 'job-view']) {
    const source = fs.readFileSync(path.join(root, 'scripts', 'portal-v2', `${name}.js`), 'utf8')
      .replace(/'\.\/jobs-core\.js(\?v=\d+)?'/g, "'./jobs-core.mjs'");
    fs.writeFileSync(path.join(dir, `${name}.mjs`), source);
  }
  core = await import(pathToFileURL(path.join(dir, 'jobs-core.mjs')).href);
  view = await import(pathToFileURL(path.join(dir, 'job-view.mjs')).href);
});

const NOW = new Date('2026-11-06T06:30:00Z');
const POST = 'https://www.linkedin.com/posts/recruiter_ca-hiring-activity-123';
const job = (extra = {}) => ({
  id: 4242,
  Company: 'Acme <b>Corp</b>',
  Job_Title: 'Audit "Trainee"',
  Location: 'Mumbai, Maharashtra, India',
  Salary: 25000,
  Created_At: new Date(NOW.getTime() - 3600e3 * 5).toISOString(),
  'Primary Domain': 'Internal Audit',
  Description: 'Write to hr@acme.com or call 9876543210. Apply at https://acme.com/apply. '.repeat(10),
  // Private fields a buggy caller might pass: the view must never print them.
  posts_link: POST,
  'Application ID': 'hr@acme.com',
  Apply_Link: 'https://acme.com/apply',
  ...extra,
});

test('cards show company, role, city, pay and posted time, escaped, and never a private field', () => {
  const portal = core.PORTALS.industrial;
  const html = view.cardHtml(job(), portal, { now: NOW });
  assert.match(html, /Audit &quot;Trainee&quot;/);
  assert.match(html, /Acme &lt;b&gt;Corp&lt;\/b&gt;/);
  assert.match(html, /<span>Mumbai<\/span>/);
  assert.match(html, /25k\/month/);
  assert.match(html, /5h ago/);
  assert.match(html, /pv2-badge-new/);
  assert.match(html, /href="\/job\.html\?id=4242&amp;type=industrial"/);
  assert.doesNotMatch(html, /<b>Corp/);
  assert.doesNotMatch(html, /linkedin\.com\/posts|hr@acme|acme\.com\/apply/);
});

test('exclusive cards say so; locked for others, open for the programme', () => {
  const portal = core.PORTALS.fresher;
  const exclusive = job({ is_exclusive: true, Experience: 'Freshers' });
  const locked = view.cardHtml(exclusive, portal, { now: NOW, courses: [] });
  assert.match(locked, /class="pv2-card is-exclusive"/);
  assert.match(locked, /fa-lock" aria-hidden="true"><\/i> Exclusive/);
  const open = view.cardHtml(exclusive, portal, { now: NOW, courses: ['msc-ca-freshers-program'] });
  assert.match(open, /fa-crown" aria-hidden="true"><\/i> Exclusive/);
  const older = view.cardHtml(job({ Created_At: new Date(NOW.getTime() - 20 * 86400e3).toISOString() }), portal, { now: NOW });
  assert.match(older, /is-older/);
  assert.doesNotMatch(older, /pv2-badge-new/);
});

test('a locked exclusive vacancy shows a teaser and the programme, no way to apply and no post link', () => {
  for (const key of ['industrial', 'articleship', 'semi', 'fresher', 'experienced']) {
    const portal = core.PORTALS[key];
    for (const loggedIn of [false, true]) {
      const html = view.detailHtml(job({ is_exclusive: true }), portal, {
        now: NOW, loggedIn, courses: ['some-other-course'], postLink: POST, unlocked: { applicationId: 'hr@acme.com', description: 'secret' },
      });
      assert.match(html, /class="pv2-lock"/, key);
      assert.match(html, new RegExp(`For ${portal.programme.name} students`), key);
      assert.match(html, new RegExp(`href="${portal.programme.href}"`), key);
      assert.doesNotMatch(html, /data-action="(apply|reveal|easy-apply|simple-apply|ai-apply|apply-link)"/, key);
      assert.doesNotMatch(html, /linkedin\.com\/posts|hr@acme|acme\.com\/apply|9876543210|secret/, key);
      assert.match(html, /pv2-prose is-locked/, key);
      assert.doesNotMatch(html, /Write to|Apply at|\[email hidden\]/, `${key}: no description text at all`);
      assert.equal(/Log in<\/a>/.test(html), !loggedIn, `${key}: log-in link only when logged out`);
    }
  }
});

test('an open vacancy: log in to apply, then Apply now, then the unlocked application details', () => {
  const portal = core.PORTALS.industrial;
  const loggedOut = view.detailHtml(job(), portal, { now: NOW, loggedIn: false, postLink: POST });
  assert.match(loggedOut, /Log in to apply/);
  assert.doesNotMatch(loggedOut, /linkedin\.com\/posts|hr@acme|9876543210/, 'contacts in the description stay hidden');

  const loggedIn = view.detailHtml(job(), portal, { now: NOW, loggedIn: true });
  assert.match(loggedIn, /data-action="apply"/);
  assert.match(loggedIn, /data-action="reveal"/);

  const revealed = view.detailHtml(job(), portal, { now: NOW, loggedIn: true, unlocked: { applicationId: 'hr@acme.com, https://acme.com/careers' }, postLink: POST });
  assert.match(revealed, /data-action="ai-apply"/);
  assert.match(revealed, /data-action="simple-apply"/);
  assert.match(revealed, /<span class="btn-text">AI Powered Apply<\/span>/, 'handleAiApplyClick needs .btn-text');
  assert.match(revealed, /data-copy="hr@acme\.com"/);
  assert.match(revealed, /href="https:\/\/acme\.com\/careers"/);
  assert.match(revealed, new RegExp(`href="${POST.replace(/[.?/]/g, '\\$&')}"`), 'the original post only when the caller fetched it for an allowed student');

  const easy = view.detailHtml(job({ posted_by: 'hirer-uuid' }), portal, { now: NOW, loggedIn: true, applied: true });
  assert.match(easy, /data-action="easy-apply"/);
  assert.match(easy, /Applied/);
  assert.match(easy, /pv2-badge-easy/);
});

test('a description that failed to load says so (and is not passed off as missing)', () => {
  const portal = core.PORTALS.fresher;
  const html = view.detailHtml(job({ Description: '' }), portal, { now: NOW, loggedIn: true, descriptionError: true });
  assert.match(html, /could not load/);
  assert.doesNotMatch(html, /did not add a description/);
});

test('old vacancies warn that they may be filled', () => {
  const portal = core.PORTALS.semi;
  const html = view.detailHtml(job({ Created_At: new Date(NOW.getTime() - 30 * 86400e3).toISOString() }), portal, { now: NOW, loggedIn: true });
  assert.match(html, /pv2-stale/);
  assert.match(html, /older than 15 days may already be filled/);
});

test('articleship detail links firm reviews', () => {
  const portal = core.PORTALS.articleship;
  assert.match(view.detailHtml(job(), portal, { now: NOW, rating: { avg: 4.3, count: 9 } }), /articleship-firm-review\.html\?firm=Acme%20%3Cb%3ECorp%3C%2Fb%3E/);
  assert.match(view.detailHtml(job(), portal, { now: NOW }), /submit-review\.html\?firm=/);
});
