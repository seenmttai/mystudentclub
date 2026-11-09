const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

// 6 Nov 2026: one company posted 29 roles in five minutes ("Gratitude"). Same-company postings within a day are shown
// as the newest card plus a "+N more roles from <company>" bar that expands them.
const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'portal3.js'), 'utf8');

function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, startMarker);
  return source.slice(start, end);
}

function setup(jobs) {
  const dom = new JSDOM('<div id="jobs"></div><div id="sentinel"></div>');
  const { window } = dom;
  window.HTMLElement.prototype.scrollIntoView = () => {};
  const code = slice('const COMPANY_GROUP_MIN', 'function renderJobCard(job) {');
  const ctx = vm.createContext({ document: window.document, window, setTimeout: () => {}, hasMoreData: false, isFetching: false, fetchJobs() {}, Date, Set, Map, Array, Math, String });
  vm.runInContext(code + '\nthis.group = groupSameCompanyCards; this.key = companyGroupKey;', ctx);
  const container = window.document.getElementById('jobs');
  for (const j of jobs) {
    const el = window.document.createElement('article');
    el.className = 'job-card';
    el.dataset.jobId = String(j.id);
    el.dataset.companyKey = ctx.key(j.company);
    el.dataset.companyName = j.company;
    el.dataset.location = j.loc || '';
    el.dataset.createdAt = j.at;
    container.appendChild(el);
  }
  return { ctx, container, window };
}
const visibleIds = (c) => [...c.querySelectorAll('.job-card')].filter(e => !e.classList.contains('company-group-hidden')).map(e => e.dataset.jobId);
const order = (c) => [...c.children].map(e => e.classList.contains('job-card') ? e.dataset.jobId : 'BAR');

test('company names compare without case, punctuation or legal suffixes', () => {
  const { ctx } = setup([]);
  assert.equal(ctx.key('Wipro Ltd.'), ctx.key('wipro'));
  assert.equal(ctx.key('Gratitude Inc'), ctx.key('Gratitude'));
  assert.equal(ctx.key(''), '');
});

test('a same-day burst collapses under its newest card, even when interleaved', () => {
  const day = '2026-11-06T02:0';
  const { ctx, container } = setup([
    { id: 1, company: 'Gratitude', loc: 'Gurugram', at: day + '9:00Z' },
    { id: 2, company: 'Citi', at: day + '8:30Z' },
    { id: 3, company: 'Gratitude', loc: 'Delhi', at: day + '8:00Z' },
    { id: 4, company: 'Gratitude Inc', loc: 'Chennai', at: day + '7:00Z' },
    { id: 5, company: 'EY', at: day + '6:00Z' },
    { id: 6, company: 'EY', at: day + '5:00Z' },
  ]);
  ctx.group(container);
  assert.deepEqual(order(container), ['1', 'BAR', '3', '4', '2', '5', '6']);
  assert.deepEqual(visibleIds(container), ['1', '2', '5', '6']); // two EY cards: below the threshold of 3
  const bar = container.querySelector('.company-group-toggle');
  assert.match(bar.textContent, /\+2 more roles from Gratitude · Gurugram, Delhi, Chennai/);
  bar.click();
  assert.deepEqual(visibleIds(container), ['1', '3', '4', '2', '5', '6']);
  assert.deepEqual(order(container), ['1', '3', '4', 'BAR', '2', '5', '6']);
  assert.match(container.querySelector('.company-group-toggle').textContent, /Show fewer roles from Gratitude/);
  container.querySelector('.company-group-toggle').click();
  assert.deepEqual(visibleIds(container), ['1', '2', '5', '6']);
});

test('postings from different days are not grouped; regrouping after a new batch is stable', () => {
  const { ctx, container, window } = setup([
    { id: 1, company: 'EY', at: '2026-11-06T10:00:00Z' },
    { id: 2, company: 'EY', at: '2026-11-04T10:00:00Z' },
    { id: 3, company: 'EY', at: '2026-11-02T10:00:00Z' },
  ]);
  ctx.group(container);
  assert.equal(container.querySelectorAll('.company-group-toggle').length, 0);
  assert.deepEqual(visibleIds(container), ['1', '2', '3']);
  // A later batch adds two more EY cards from 4 Nov: they join the 4 Nov card.
  for (const id of [4, 5]) {
    const el = window.document.createElement('article');
    el.className = 'job-card'; el.dataset.jobId = String(id); el.dataset.companyKey = 'ey'; el.dataset.companyName = 'EY';
    el.dataset.createdAt = '2026-11-04T09:00:00Z'; container.appendChild(el);
  }
  ctx.group(container);
  ctx.group(container);
  assert.deepEqual(order(container), ['1', '2', 'BAR', '4', '5', '3']);
  assert.equal(container.querySelectorAll('.company-group-toggle').length, 1);
});

test('wired into both list renders, and Trending shows one entry per company', () => {
  assert.equal((source.match(/dom\.jobsContainer\.appendChild\(fragment\);\n\s*groupSameCompanyCards\(dom\.jobsContainer\);/g) || []).length, 2);
  assert.match(source, /jobCard\.dataset\.createdAt = job\.Created_At \|\| '';/);
  assert.match(source, /const picks = data\.filter\(job => \{\n\s*const key = companyGroupKey\(job\.Company\)/);
});
