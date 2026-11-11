// Post a job links for recruiters on the home screen and on the four other portal tabs: a phone row,
// a laptop button and a line inside the logged-out sign-up wall. All must go to the recruiter site's
// Post a job form.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// page file → the prefix its three links report to analytics
const PAGES = {
  'index.html': 'home',
  'ca-articleship-opportunities.html': 'articleship',
  'semi-qualified-ca-jobs.html': 'semi',
  'ca-fresher-jobs.html': 'fresher',
  'experienced-ca-jobs.html': 'experienced',
};

for (const [file, tab] of Object.entries(PAGES)) {
  const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const document = new JSDOM(html).window.document;

  test(`${file}: three Post a job links, each to the recruiter Post a job form`, () => {
    const links = [...document.querySelectorAll('a[data-post-job]')];
    assert.deepStrictEqual(
      links.map(a => a.getAttribute('data-post-job')).sort(),
      [`${tab}_laptop`, `${tab}_phone`, `${tab}_signup_wall`],
    );
    for (const a of links) assert.strictEqual(a.getAttribute('href'), 'https://hire.mystudentclub.com/jobs/new');
  });

  test(`${file}: the sign-up wall keeps a way through for recruiters`, () => {
    assert.ok(document.querySelector(`#loginPromptOverlay a[data-post-job="${tab}_signup_wall"]`));
  });

  test(`${file}: the laptop button shares the search bar row, and the search box keeps its ids`, () => {
    const row = document.querySelector('.dv2-search-row');
    assert.ok(row.querySelector('.dv2-top-search #dv2TopSearchInput'));
    assert.ok(row.querySelector('.dv2-top-search #dv2TopSearchBtn'));
    assert.ok(row.querySelector('a.dv2-post-job-btn'));
  });

  test(`${file}: loads the stylesheet version that has the Post a job styles`, () => {
    assert.ok(html.includes('/scripts/portal-style.css?v=2.3'));
  });
}
