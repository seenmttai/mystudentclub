// The home screen's Post a job links for recruiters: a phone row, a laptop button and a line inside
// the logged-out sign-up wall. All three must go to the recruiter site's Post a job form.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const document = new JSDOM(html).window.document;

test('home has the three Post a job links, each to the recruiter Post a job form', () => {
  const links = [...document.querySelectorAll('a[data-post-job]')];
  assert.deepStrictEqual(links.map(a => a.getAttribute('data-post-job')).sort(), ['home_laptop', 'home_phone', 'home_signup_wall']);
  for (const a of links) assert.strictEqual(a.getAttribute('href'), 'https://hire.mystudentclub.com/jobs/new');
});

test('the sign-up wall keeps a way through for recruiters', () => {
  assert.ok(document.querySelector('#loginPromptOverlay a[data-post-job="home_signup_wall"]'));
});

test('the laptop button shares the search bar row, and the search box keeps its ids', () => {
  const row = document.querySelector('.dv2-search-row');
  assert.ok(row.querySelector('.dv2-top-search #dv2TopSearchInput'));
  assert.ok(row.querySelector('.dv2-top-search #dv2TopSearchBtn'));
  assert.ok(row.querySelector('a.dv2-post-job-btn'));
});
