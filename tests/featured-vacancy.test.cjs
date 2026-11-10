const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Vacancy Boost (Nov 2026): a ₹999 boost on hire.msc sets featured_until for 15 days. The job is pinned on top of
// page 1 with a "Featured" tag, stays open past the usual 15 days while featured, and is never locked by it.
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
// The page's modules are ES modules in a CommonJS package: import a .mjs copy (as tests/job-filters.test.cjs does).
const load = () => {
  const copy = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'featured-')), 'featured-vacancy.mjs');
  fs.copyFileSync(path.join(root, 'scripts', 'featured-vacancy.js'), copy);
  return import(pathToFileURL(copy).href);
};
const NOW = Date.parse('2026-11-10T10:00:00Z');

test('featured only while featured_until is in the future', async () => {
  const { isFeatured } = await load();
  assert.equal(isFeatured({ featured_until: '2026-11-25T10:00:00Z' }, NOW), true);
  assert.equal(isFeatured({ featured_until: '2026-11-01T10:00:00Z' }, NOW), false);
  assert.equal(isFeatured({ featured_until: null }, NOW), false);
  assert.equal(isFeatured({}, NOW), false);
  assert.equal(isFeatured(null, NOW), false);
});

test('pinned groups go first in order (Featured, then exclusives), each job once, the rest after', async () => {
  const { mergePinnedJobs } = await load();
  const rest = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
  const { jobs, pinnedIds } = mergePinnedJobs(rest, [[{ id: 3 }], [{ id: 3 }, { id: 9 }]], 'newest');
  assert.deepEqual(jobs.map(j => j.id), [3, 9, 1, 2, 4]);
  assert.deepEqual([...pinnedIds], [3, 9]);
  const popular = mergePinnedJobs([], [[{ id: 1, application_count: 1 }, { id: 2, application_count: 5 }]], 'popular');
  assert.deepEqual(popular.jobs.map(j => j.id), [2, 1], 'popular sort inside a group');
});

test('a missing or ungranted featured_until column falls back instead of breaking the page', async () => {
  const { isFeaturedColumnError } = await load();
  assert.equal(isFeaturedColumnError({ code: '42703', message: 'column "Industrial Training Job Portal".featured_until does not exist' }), true);
  assert.equal(isFeaturedColumnError({ code: '42501', message: 'permission denied for table Fresher Jobs' }), true);
  assert.equal(isFeaturedColumnError({ code: '22P02', message: 'invalid input syntax' }), false);
  assert.equal(isFeaturedColumnError(null), false);
});

test('the demo runs only on preview hosts with ?featured-demo', async () => {
  const { applyFeaturedDemo, isFeatured } = await load();
  const jobs = () => [{ id: 1, Created_At: new Date(NOW - 86400000).toISOString() }];
  assert.equal(isFeatured(applyFeaturedDemo(jobs(), { hostname: 'www.mystudentclub.com', search: '?featured-demo' }, NOW)[0], NOW), false);
  assert.equal(isFeatured(applyFeaturedDemo(jobs(), { hostname: 'x.mystudentclub.pages.dev', search: '?featured-demo' }, NOW)[0], NOW), true);
});

test('portal3.js: Featured is a tag and an expiry exception, pinned on every portal, never a lock', () => {
  const source = read('portal3.js');
  assert.equal((source.match(/const isExpired = isJobExpired\(job\.Created_At\) && !isFeatured\(job\);/g) || []).length, 2, 'card and modal');
  assert.match(source, /tag-featured/);
  assert.match(source, /\.gt\('featured_until', new Date\(\)\.toISOString\(\)\)/);
  assert.match(source, /mergePinnedJobs\(data, \[featured, exclusives\], state\.sortBy\)/);
  assert.doesNotMatch(read('featured-vacancy.js'), /is_exclusive\s*=/, 'Featured never sets is_exclusive');
  assert.doesNotMatch(read('exclusive-vacancy.js'), /featured/i, 'the lock logic does not look at Featured');
  assert.match(read('portal-style.css'), /\.job-tag\.tag-featured/);
});
