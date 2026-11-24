const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// 24 Nov 2026: a job with two comma-separated apply links opened ONE tab with both glued together.
// Apply Now must open each link in its own tab.
const root = path.resolve(__dirname, '..');
// The site's scripts are browser ES modules in a CommonJS package, so load the source as a module.
const source = fs.readFileSync(path.join(root, 'scripts/apply-links.js'), 'utf8');
const load = () => import(`data:text/javascript,${encodeURIComponent(source)}`);

const A = 'https://portal.careers.hsbc.com/careers/job/563774612682619';
const B = 'https://portal.careers.hsbc.com/careers/job/563774612657749';

function fakeWindow(allowed) {
  const opened = [];
  global.window = {
    open(url) {
      if (opened.length >= allowed) return null; // popup blocker
      opened.push(url);
      return {};
    },
  };
  return opened;
}

function fakeButton() {
  return { innerHTML: 'Apply Now' };
}

test('splits comma-separated links, ignores emails and junk', async () => {
  const { getApplyUrls } = await load();
  assert.deepEqual(getApplyUrls(`${A}, ${B}`), [A, B]);
  assert.deepEqual(getApplyUrls(A), [A]);
  assert.deepEqual(getApplyUrls('hr@example.com'), []);
  assert.deepEqual(getApplyUrls(''), []);
  assert.deepEqual(getApplyUrls(null), []);
});

test('opens every link in its own tab when the browser allows it', async () => {
  const { openApplyLinks } = await load();
  const opened = fakeWindow(Infinity);
  const btn = fakeButton();
  openApplyLinks(`${A}, ${B}`, A, btn);
  assert.deepEqual(opened, [A, B]);
  assert.equal(btn.innerHTML, 'Apply Now');
});

test('a browser that allows one tab per click gets the 2nd link on the next click', async () => {
  const { openApplyLinks, openQueuedApplyLink } = await load();
  let opened = fakeWindow(1);
  const btn = fakeButton();
  openApplyLinks(`${A}, ${B}`, A, btn);
  assert.deepEqual(opened, [A]);
  assert.match(btn.innerHTML, /Open link 2 of 2/);

  opened = fakeWindow(1); // a new click = a new allowance
  assert.equal(openQueuedApplyLink(btn), true);
  assert.deepEqual(opened, [B]);
  assert.equal(btn.innerHTML, 'Apply Now');
  assert.equal(openQueuedApplyLink(btn), false, 'nothing left waiting');
});

test('single link and no-link fallback behave as before', async () => {
  const { openApplyLinks } = await load();
  let opened = fakeWindow(Infinity);
  openApplyLinks(A, A, fakeButton());
  assert.deepEqual(opened, [A]);

  opened = fakeWindow(Infinity);
  const search = 'https://www.google.com/search?q=HSBC%20careers';
  openApplyLinks('HSBC', search, fakeButton());
  assert.deepEqual(opened, [search]);
});
