const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const MENU_CONTACT = '<a href="/contact.html" class="menu-item">Contact Us</a>';
const MENU_EVENTS = '<a href="/sessions/" class="menu-item">Events &amp; Live Sessions</a>';
const DESKTOP_EVENTS = '<a href="/sessions/" class="dv2-nav-link dv2-nav-wide-only">Events</a>';

// Every tracked page (outside the generated job pages) that carries the shared ☰ menu.
function menuPages() {
  const out = execFileSync('git', ['ls-files', '*.html'], { cwd: root, encoding: 'utf8' });
  return out.split('\n').filter((f) => f && !f.startsWith('jobs/') && read(f).includes(MENU_CONTACT));
}

test('every shared menu lists Events right before Contact Us', () => {
  const pages = menuPages();
  assert.ok(pages.length >= 20, `expected the shared menu on many pages, found ${pages.length}`);
  for (const page of pages) {
    const html = read(page);
    assert.equal(html.split(MENU_EVENTS).length - 1, 1, `${page}: one Events menu item`);
    assert.match(html, /<a href="\/sessions\/" class="menu-item">Events &amp; Live Sessions<\/a>\r?\n[ \t]*<a href="\/contact\.html" class="menu-item">Contact Us<\/a>/, page);
  }
});

test('the desktop header nav links Events between CV Reviewer and Contact', () => {
  const pages = ['index.html', 'ca-articleship-opportunities.html', 'ca-fresher-jobs.html', 'experienced-ca-jobs.html', 'semi-qualified-ca-jobs.html'];
  for (const page of pages) {
    const html = read(page);
    assert.equal(html.split(DESKTOP_EVENTS).length - 1, 1, `${page}: one desktop Events link`);
    assert.match(html, /CV Reviewer<\/a>\r?\n[ \t]*<a href="\/sessions\/" class="dv2-nav-link dv2-nav-wide-only">Events<\/a>\r?\n[ \t]*<a href="\/contact\.html" class="dv2-nav-link">Contact<\/a>/, page);
  }
});

test('the header nav tightens at medium desktop widths and hides wide-only links below 1180px', () => {
  const css = read('scripts/portal-style.css');
  assert.match(css, /@media \(min-width: 1024px\) and \(max-width: 1319px\) \{\s*\.dv2-header-nav \{\s*gap: 0;/);
  assert.match(css, /@media \(min-width: 1024px\) and \(max-width: 1179px\) \{\s*\.dv2-nav-link\.dv2-nav-wide-only \{\s*display: none;/);
});
