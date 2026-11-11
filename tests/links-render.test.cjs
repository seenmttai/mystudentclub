const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
// jsdom is a dev dependency on master only; on the app branch the page-level tests below are skipped.
let JSDOM = null;
try { ({ JSDOM } = require('jsdom')); } catch (e) { JSDOM = null; }
const needsDom = { skip: JSDOM ? false : 'jsdom is not installed on this branch' };

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'links', 'render.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'links', 'index.html'), 'utf8');

function load() {
  const context = { window: {} };
  vm.runInNewContext(source, context);
  return context.window.MSCLinksRender;
}

// The Industrial Training tab as the admin has it (display order kept).
const industrial = [
  { title: 'MSC Industrial Training Program Details', url: 'https://www.mystudentclub.com/ca-industrial-training-program', icon: 'fas fa-graduation-cap', card_type: 'program' },
  { title: 'Industrial Training Aspirants Whatsapp Group', url: 'https://chat.whatsapp.com/EraSLyThpGLEoquF8Inmkr', icon: 'fab fa-whatsapp', card_type: 'whatsapp' },
  { title: 'Vacancy Alerts Channel', url: 'https://whatsapp.com/channel/0029Vb8XM5GDzgT6YyWk4x0F', icon: 'fab fa-whatsapp', card_type: 'whatsapp' },
  { title: 'Free Resources', url: 'https://www.mystudentclub.com/ca-industrial-training-resources', icon: 'fas fa-book-open', card_type: 'resources' },
  { title: 'Personal LinkedIn', url: 'https://www.linkedin.com/in/ca-padam-bhansali/', icon: 'fab fa-linkedin', card_type: 'linkedin' },
  { title: 'MSC LinkedIn Page', url: 'https://www.linkedin.com/company/mystudentclub/', icon: 'fab fa-linkedin', card_type: 'linkedin' },
  { title: 'Free Guidance Session', url: 'https://www.youtube.com/@capadambhansali', icon: 'fab fa-youtube', card_type: 'youtube' },
];

test('programmes lead; the other links fall into groups in the admin\'s order', () => {
  const r = load();
  const a = r.arrange(industrial);
  // Array.from: the module runs in its own vm realm, so its arrays are not this file's Array.
  assert.deepEqual(Array.from(a.programs, (l) => l.title), ['MSC Industrial Training Program Details']);
  assert.deepEqual(Array.from(a.groups, (g) => [g.kind, g.links.length]), [['whatsapp', 2], ['resources', 1], ['linkedin', 2], ['youtube', 1]]);

  // A programme listed last still leads, and the groups follow first appearance.
  const shuffled = r.arrange([industrial[6], industrial[1], industrial[0], industrial[2]]);
  assert.equal(shuffled.programs.length, 1);
  assert.deepEqual(Array.from(shuffled.groups, (g) => g.kind), ['youtube', 'whatsapp']);
});

test('a "Default" link is grouped by where it points; anything else lands in "Latest from MSC"', () => {
  const r = load();
  assert.equal(r.kindOf({ card_type: 'default', url: 'https://chat.whatsapp.com/abc' }), 'whatsapp');
  assert.equal(r.kindOf({ card_type: '', url: 'https://t.me/my_student_club_ca' }), 'telegram');
  assert.equal(r.kindOf({ url: 'https://youtu.be/xyz' }), 'youtube');
  assert.equal(r.kindOf({ card_type: 'social', url: 'https://www.linkedin.com/company/mystudentclub/' }), 'linkedin');
  assert.equal(r.kindOf({ card_type: 'default', url: 'https://forms.gle/Eg9THuCZorzQ9CTB7' }), 'default');
  // The admin's card style wins over the address.
  assert.equal(r.kindOf({ card_type: 'resources', url: 'https://www.youtube.com/playlist?list=1' }), 'resources');
  assert.equal(r.kindOf({ card_type: 'program', url: 'https://chat.whatsapp.com/abc' }), 'program');

  const html = r.renderTab([{ title: 'Live session registration', url: 'https://forms.gle/x', card_type: 'default' }]);
  assert.match(html, /<span class="group-name">Latest from MSC<\/span>/);
  assert.match(html, /<span class="row-sub">Google Form<\/span>/);
});

test('each MSC programme gets its banner; an unknown programme link gets one with its own title', () => {
  const r = load();
  const cases = [
    ['https://www.mystudentclub.com/ca-industrial-training-program', 'MSC Industrial Training Program', 'Crack Your <em>Industrial Training</em>'],
    ['https://www.mystudentclub.com/articleship-program/', 'MSC Articleship Program', 'Crack Your <em>Articleship</em>'],
    ['https://www.mystudentclub.com/msc-ca-fresher-program/', 'MSC CA Freshers Program', 'Launch Your <em>Dream Career</em>'],
  ];
  for (const [url, eyebrow, title] of cases) {
    const html = r.renderTab([{ title: 'Program Details', url, card_type: 'program' }]);
    assert.match(html, /^<a class="program-banner" href="/, url);
    assert.ok(html.includes(`<span class="pb-eyebrow">${eyebrow}</span>`), url);
    assert.ok(html.includes(`<span class="pb-title">${title}</span>`), url);
    assert.ok(html.includes('View program'), url);
    assert.ok(!html.includes('link-groups'), 'a lone programme has no empty group list');
    // Nothing that goes stale between batches.
    assert.doesNotMatch(html, /₹|Rs\.?\s?\d|registration|\b20\d\d\b/i, url);
  }
  const other = r.renderTab([{ title: 'CS <Executive> Program', url: 'https://www.mystudentclub.com/cs-program', card_type: 'program' }]);
  assert.ok(other.includes('<span class="pb-eyebrow">MSC Program</span>'));
  assert.ok(other.includes('<span class="pb-title">CS &lt;Executive&gt; Program</span>'));
});

test('groups carry a clear head, and every link says what it opens and has a button', () => {
  const r = load();
  const html = r.renderTab(industrial);
  const heads = [...html.matchAll(/<span class="group-name">([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['WhatsApp groups', 'Resources', 'Follow on LinkedIn', 'Watch on YouTube']);
  const subs = [...html.matchAll(/<span class="row-sub">([^<]*)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(subs, ['WhatsApp group', 'WhatsApp channel', 'mystudentclub.com', 'LinkedIn profile', 'LinkedIn page', 'YouTube channel']);
  const buttons = [...html.matchAll(/<span class="row-cta">([A-Za-z]+) /g)].map((m) => m[1]);
  assert.deepEqual(buttons, ['Join', 'Join', 'Open', 'Follow', 'Follow', 'Watch']);
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 7);

  // One WhatsApp link: the head names it exactly.
  assert.match(r.renderTab([industrial[2]]), /<span class="group-name">WhatsApp channel<\/span>/);
  assert.match(r.renderTab([industrial[1]]), /<span class="group-name">WhatsApp group<\/span>/);
  assert.match(r.renderTab([industrial[1]]), /class="link-groups single"/);

  // Job-portal links (the Experienced CA tab) sit under "Jobs", not "Resources".
  const jobs = r.renderTab([{ title: 'Experienced CA Jobs', url: 'https://www.mystudentclub.com/experienced-ca-jobs', icon: 'fas fa-briefcase', card_type: 'resources' }]);
  assert.match(jobs, /<i class="fas fa-briefcase" aria-hidden="true"><\/i><\/span><span class="group-name">Jobs<\/span>/);
  const mixed = r.renderTab([industrial[3], { title: 'Experienced CA Jobs', url: 'https://www.mystudentclub.com/experienced-ca-jobs', card_type: 'resources' }]);
  assert.match(mixed, /<span class="group-name">Resources<\/span>/);
});

test('laptop columns are balanced and keep the admin\'s order', () => {
  const r = load();
  const group = (kind, n) => ({ kind, links: new Array(n).fill({}) });
  const shape = (groups) => Array.from(r.splitColumns(groups), (col) => Array.from(col, (g) => g.kind).join('+'));
  assert.deepEqual(shape([group('whatsapp', 2), group('resources', 1), group('linkedin', 2), group('youtube', 1)]), ['whatsapp+resources', 'linkedin+youtube']);
  assert.deepEqual(shape([group('whatsapp', 2), group('linkedin', 2), group('youtube', 1)]), ['whatsapp', 'linkedin+youtube']);
  assert.deepEqual(shape([group('whatsapp', 1), group('resources', 1), group('linkedin', 2)]), ['whatsapp+resources', 'linkedin']);
  assert.deepEqual(shape([group('whatsapp', 3)]), ['whatsapp']);
  assert.deepEqual(shape([]), []);
  const html = r.renderTab(industrial);
  assert.equal((html.match(/<div class="link-col">/g) || []).length, 2);
});

test('titles, addresses and icons from the table cannot inject markup or scripts', () => {
  const r = load();
  const html = r.renderTab([
    { title: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', icon: '"><script>alert(1)</script>', card_type: 'whatsapp' },
    { title: 'Bare address', url: 'www.example.com/page', card_type: 'default' },
    { title: 'Mail us', url: 'mailto:contact@mystudentclub.com', card_type: 'default' },
  ]);
  assert.ok(!html.includes('<img'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('<i class="fab fa-whatsapp" aria-hidden="true">'), 'a bad icon class falls back to the group icon');
  assert.ok(html.includes('href="https://www.example.com/page" target="_blank"'));
  assert.ok(html.includes('<a class="link-row default" href="mailto:contact@mystudentclub.com"><span'), 'a mail link opens in place');
  assert.ok(html.includes('<span class="row-sub">contact@mystudentclub.com</span>'));
  assert.equal(r.safeHref('  /events/ '), '/events/');
  assert.equal(r.safeHref('data:text/html,hi'), '#');
  assert.equal(r.safeHref(null), '#');
  // Paths on this site and app links still work; only unknown schemes are dropped.
  assert.equal(r.safeHref('sessions/'), 'sessions/');
  assert.equal(r.safeHref('contact.html'), 'contact.html');
  assert.equal(r.safeHref('whatsapp://send?phone=918104135784'), 'whatsapp://send?phone=918104135784');
  assert.equal(r.safeHref('vbscript:x'), '#');
  // Click-to-chat links are a chat, not a group to join; channels-only tabs say so.
  const chat = r.renderTab([{ title: 'Message us', url: 'https://api.whatsapp.com/send?phone=918104135784', card_type: 'whatsapp' }]);
  assert.match(chat, /<span class="group-name">WhatsApp chat<\/span>/);
  assert.match(chat, /<span class="row-cta">Chat /);
  const ch = { title: 'Alerts', url: 'https://whatsapp.com/channel/abc', card_type: 'whatsapp' };
  assert.match(r.renderTab([ch, ch]), /<span class="group-name">WhatsApp channels<\/span>/);
  // The icon alone does not make a resource a job portal.
  assert.match(r.renderTab([{ title: 'Interview kit', url: 'https://www.mystudentclub.com/kit.pdf', icon: 'fas fa-briefcase', card_type: 'resources' }]), /<span class="group-name">Resources<\/span>/);
});

test('footer icons are rendered from the "social" links', () => {
  const r = load();
  const html = r.renderSocial([{ title: 'YouTube', url: 'https://www.youtube.com/@capadambhansali', icon: 'fab fa-youtube' }, { title: 'Email', url: 'mailto:contact@mystudentclub.com', icon: 'fas fa-envelope' }]);
  assert.equal((html.match(/class="social-icon"/g) || []).length, 2);
  assert.ok(html.includes('aria-label="YouTube"'));
  assert.ok(html.includes('href="mailto:contact@mystudentclub.com" title="Email"'));
});

// The real page: its built-in links, laid out by the page's own scripts (no network).
function openPage() {
  const dom = new JSDOM(page, { runScripts: 'outside-only', url: 'https://www.mystudentclub.com/links/' });
  const { window } = dom;
  window.eval(source);
  const inline = [...window.document.querySelectorAll('script:not([src])')].map((s) => s.textContent).join('\n');
  window.eval(inline);
  return window;
}

test('the page lays out its built-in links: a banner on the three programme tabs, headed groups on all five', needsDom, () => {
  const { document } = openPage();
  const expected = { industrial: 1, ca: 1, articleship: 1, 'semi-qualified': 0, 'experienced-CA': 0 };
  for (const [id, banners] of Object.entries(expected)) {
    const panel = document.getElementById(id);
    assert.equal(panel.querySelectorAll('.program-banner').length, banners, id);
    assert.ok(panel.querySelectorAll('.link-group .group-head').length >= 3, `${id} has headed groups`);
    assert.equal(panel.querySelectorAll('a.link-card').length, 0, `${id}: no plain cards left`);
    assert.equal(panel.firstElementChild.className, banners ? 'program-banner' : 'link-groups', `${id}: the banner leads`);
    for (const a of panel.querySelectorAll('a')) assert.match(a.getAttribute('href'), /^https:\/\//, id);
  }
  // Ids that mails and posts may link to are kept.
  assert.equal(document.getElementById('link-industrial-program').className, 'program-banner');
  assert.equal(document.getElementById('link-articleship-resources').getAttribute('href'), 'https://www.mystudentclub.com/ca-articleship-opportunities');
  assert.equal(document.querySelectorAll('.tab-content.active').length, 1);
  assert.deepEqual([...document.getElementById('experienced-CA').querySelectorAll('.group-name')].map((h) => h.textContent), ['WhatsApp channel', 'Jobs', 'Follow on LinkedIn']);
  // Screen readers: every button is a tab tied to its panel.
  for (const btn of document.querySelectorAll('.tab-btn')) {
    assert.equal(btn.getAttribute('role'), 'tab');
    assert.equal(document.getElementById(btn.getAttribute('aria-controls')).getAttribute('aria-labelledby'), btn.id);
  }
  assert.deepEqual([...document.querySelectorAll('.tab-btn[aria-selected="true"]')].map((b) => b.id), ['tab-industrial']);
});

test('switching tabs shows one panel and marks the chosen tab for screen readers', needsDom, () => {
  const window = openPage();
  const { document } = window;
  window.switchTab(document.getElementById('tab-articleship'), 'articleship');
  assert.deepEqual([...document.querySelectorAll('.tab-content.active')].map((p) => p.id), ['articleship']);
  assert.deepEqual([...document.querySelectorAll('.tab-btn[aria-selected="true"]')].map((b) => b.id), ['tab-articleship']);
  assert.deepEqual([...document.querySelectorAll('.tab-btn.active')].map((b) => b.id), ['tab-articleship']);
});

test('the page no longer carries the 4 Oct guidance session link, and loads render.js before it is used', () => {
  assert.doesNotMatch(page, /4th Oct|forms\.gle\/Eg9THuCZorzQ9CTB7/i);
  assert.ok(page.indexOf('<script src="/links/render.js') < page.indexOf('function switchTab('));
  assert.ok(page.indexOf('<script src="/links/render.js') > page.indexOf('</main>'));
});
