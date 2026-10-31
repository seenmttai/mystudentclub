// Route, asset and logo contract for the pages the Flutter WebView opens on mobile.mystudentclub.com.
// Local mode (default): checks files in this repo. Deployed smoke: set MOBILE_SITE_ORIGIN=https://staging-or-prod.example
// and every selected route must return its own marker and a body hash different from "/" (HTTP 200 alone is NOT a pass:
// unknown paths on the host fall back to the root index with status 200).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const exists = (p) => fs.existsSync(path.join(root, p));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// route -> file, title marker. `sourceOnly` routes are served by Cloudflare Pages from <dir>/index.html.
const ROUTES = [
  { route: '/learning-management-system/', file: 'learning-management-system/index.html', title: 'My Courses' },
  { route: '/cv-builder/', file: 'cv-builder/index.html', title: 'CV Builder' },
  { route: '/ai-interview.html', file: 'ai-interview.html', title: 'AI Video Interview' },
  { route: '/articleship-firm-reviews.html', file: 'articleship-firm-reviews.html', title: 'Articleship Firm Reviews' },
  { route: '/contact.html', file: 'contact.html', title: 'Contact Us' },
  { route: '/profile.html', file: 'profile.html', title: 'My Profile' },
  { route: '/ca-fresher-training-resources.html', file: 'ca-fresher-training-resources.html', title: 'CA Fresher Training Resources' },
  { route: '/ca-industrial-training-resources.html', file: 'ca-industrial-training-resources.html', title: 'CA Industrial Training Resources' },
  { route: '/articleship-resources.html', file: 'articleship-resources.html', title: 'Articleship Resources' },
  { route: '/semi-qualified-ca-resources.html', file: 'semi-qualified-ca-resources.html', title: 'Semi-Qualified CA Resources' },
  // /domain-wise-hiring-companies.html was removed from the mobile site on 2026-10-17 (see REMOVED_ROUTES).
  { route: '/ca-industrial-training-program/', file: 'ca-industrial-training-program/index.html', title: 'MSC CA Industrial Training Program' },
  { route: '/articleship-program/', file: 'articleship-program/index.html', title: 'MSC Articleship Program' },
  { route: '/msc-ca-fresher-program/', file: 'msc-ca-fresher-program/index.html', title: 'MSC CA Freshers Program' },
  // Ported from master 129251eab on 2026-10-17 with the Airy Flow chrome (side-menu "Career Guides" / "Events & Live Sessions").
  { route: '/blog/', file: 'blog/index.html', title: 'Career Guides' },
  { route: '/sessions/', file: 'sessions/index.html', title: 'Live Sessions' },
  // Added 2026-10-31: share your offer letter → company / city WhatsApp groups (opened from the profile's "Got placed?" card).
  { route: '/offer-groups', file: 'offer-groups.html', title: 'Got Placed' },
];

const REMOVED_ROUTES = [{ route: '/domain-wise-hiring-companies.html', file: 'domain-wise-hiring-companies.html' }];

test('removed routes have no file and are not linked from any planned route', () => {
  for (const removed of REMOVED_ROUTES) {
    assert.ok(!exists(removed.file), `${removed.route}: ${removed.file} must stay deleted`);
    for (const r of ROUTES) assert.ok(!read(r.file).includes(`href="${removed.route}"`), `${r.route} must not link to ${removed.route}`);
  }
});

test('every planned route has its own file with its own title (distinct from the root index)', () => {
  const rootIndex = read('index.html');
  const titles = new Set();
  for (const r of ROUTES) {
    assert.ok(exists(r.file), `${r.route}: ${r.file} must exist`);
    const html = read(r.file);
    assert.ok(html.includes(`<title>`) && new RegExp(`<title>[^<]*${r.title}`).test(html), `${r.route}: title marker "${r.title}"`);
    assert.notEqual(sha(html), sha(rootIndex), `${r.route} must not be the root index`);
    titles.add(r.title);
  }
  assert.equal(titles.size, ROUTES.length, 'titles are unique per route');
});

test('local scripts, styles and images referenced by each route exist', () => {
  for (const r of ROUTES) {
    const html = read(r.file);
    const dir = path.posix.dirname(r.file);
    const refs = [...html.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css|png|svg|ico|jpg|jpeg|webp))(?:[?#][^"]*)?"/g)].map((m) => m[1]);
    for (const ref of refs) {
      if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) continue;
      const rel = ref.startsWith('/') ? ref.slice(1) : path.posix.normalize(path.posix.join(dir, ref));
      assert.ok(exists(decodeURI(rel)), `${r.route} references missing ${ref}`);
    }
  }
});

test('LMS keeps its web bottom navigation (native shell hides its own bar on the Learn tab)', () => {
  assert.match(read('learning-management-system/index.html'), /<nav class="bottom-nav">/);
});

test('Airy Flow chrome is kept: no embed/no-chrome mode on resource, program or LMS pages', () => {
  for (const r of ROUTES) {
    const html = read(r.file);
    assert.doesNotMatch(html, /[?&]embed=|data-embedded|hide-chrome|no-chrome/i, `${r.route} must not introduce a chrome-hiding mode`);
  }
});

// --- Task 2: logo parity -------------------------------------------------------------------------------------
const LOGO_PAGES = [
  'learning-management-system/index.html', 'ca-fresher-training-resources.html', 'ca-industrial-training-resources.html',
  'articleship-program/index.html', 'ca-industrial-training-program/index.html', 'msc-ca-fresher-program/index.html',
  'articleship-firm-reviews.html', 'contact.html', 'blog/index.html', 'sessions/index.html',
];

test('in-scope headers use the approved icon-only /assets/logo-mark.svg (or legacy /assets/logo.png) with one accessible mark', () => {
  for (const f of LOGO_PAGES) {
    const html = read(f);
    const marks = html.match(/<(?:img|svg)\b[^>]*class="(?:header-logo|brand-logo)"[^>]*>/g) || [];
    assert.equal(marks.length, 1, `${f}: exactly one header logo`);
    assert.match(marks[0], /^<img\b/, `${f}: stale inline SVG mark replaced`);
    assert.match(marks[0], /src="\/assets\/logo(?:-mark\.svg|\.png)"/, `${f}: approved logo asset`);
    assert.match(marks[0], /alt="My Student Club"/, `${f}: accessible name`);
    assert.doesNotMatch(html, /<svg[^>]*class="header-logo"/);
  }
});

test('logo CSS keeps aspect ratio (fixed height, auto width) in every stylesheet the pages use', () => {
  for (const css of ['scripts/portal-style.css', 'scripts/airy-header.css', 'articleship-program/header.css', 'ca-industrial-training-program/header.css', 'msc-ca-fresher-program/header.css']) {
    assert.match(read(css), /img\.header-logo \{ height: (?:24|38)px; width: auto;/, css);
  }
  assert.match(read('learning-management-system/index.html'), /\.header-logo \{\s*width: auto;\s*height: 24px;/);
});

test('logo, favicon and icon assets match the canonical commit 35bc7e5d8 (pinned bytes)', () => {
  const PNG = (f) => fs.readFileSync(path.join(root, f));
  const dims = (buf) => [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  assert.deepEqual(dims(PNG('assets/logo.png')), [2048, 404], 'horizontal logo 2048x404');
  assert.equal(PNG('assets/logo.png').length, 31106);
  assert.equal(PNG('assets/logo_favicon_android.png').length, 6536);
  assert.equal(PNG('assets/icon-70x70.png').length, 6536);
  assert.equal(PNG('favicon.png').length, 6536);
  assert.ok(exists('favicon.ico') && exists('favicon.svg'));
  const [w, h] = dims(PNG('assets/logo_favicon_android.png'));
  assert.equal(w, h, 'favicon artwork is square');
  assert.ok(exists('assets/logo-dark.png'), 'dark-theme logo variant exists');
});

// --- Deployed smoke -------------------------------------------------------------------------------------------
const ORIGIN = process.env.MOBILE_SITE_ORIGIN;
test('deployed routes return their own page, not the root-index fallback', { skip: !ORIGIN && 'set MOBILE_SITE_ORIGIN to run deployed smoke' }, async () => {
  const get = async (p) => { const res = await fetch(new URL(p, ORIGIN), { redirect: 'follow' }); return { status: res.status, body: Buffer.from(await res.arrayBuffer()) }; };
  const home = await get('/');
  for (const r of ROUTES) {
    const res = await get(r.route);
    assert.equal(res.status, 200, r.route);
    assert.notEqual(sha(res.body), sha(home.body), `${r.route} returned the root index (HTTP 200 is not enough)`);
    assert.ok(res.body.toString('utf8').includes(r.title), `${r.route} lacks its title marker "${r.title}"`);
  }
});
