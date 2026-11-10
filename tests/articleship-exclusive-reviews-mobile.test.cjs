// mobile.mystudentclub.com (the phone apps): articleship exclusives free and pinned, firm-review
// summaries on cards, web-only banners kept out of the apps. Padam, 9 Nov 2026.
// The SQL lives on master (supabase/migrations/202611090002 and 202611090003).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'portal3.js'), 'utf8');

test('articleship exclusives are free to apply and pinned on top of page 1', () => {
  assert.match(src, /function isExclusiveLocked\(job\) \{\n\s+return !!\(job && job\.is_exclusive\) && currentTable !== "Articleship Jobs" && !isEnrolledSync\("Industrial Training Job Portal"\);/);
  assert.match(src, /const isLocked = isExclusiveLocked\(job\);/);
  assert.match(src, /if \(isExclusiveLocked\(job\)\) \{\n\s+showExclusiveLockedModal\(job\);/);
  assert.doesNotMatch(src, /is_exclusive && !isEnrolledSync/);
  assert.match(src, /"Stipend Range", is_exclusive';/);
  assert.match(src, /buildQuery\(selectCols\)\.eq\("is_exclusive", true\)\.gte\("Created_At", cutoff\)/);
  assert.match(src, /hasMoreData = dbPageLength === limit;/);
  assert.match(src, /reviewSummaryRpcAvailable = false/);
  assert.match(src, /withoutMissingExclusive\(selectCols, error\)/);
});

test('banners: web_only ones never show in the apps, and they keep their order', () => {
  assert.match(src, /\.select\("Image, Hyperlink, Type, visible_to_unenrolled, web_only"\)\n\s+\.order\("id", \{ ascending: true \}\);/);
  assert.match(src, /data = \(data \|\| \[\]\)\.filter\(\(b\) => b\.web_only !== true\);/);
});

test('review summaries: matched firm names, rating from the first review, agreed facts only', () => {
  assert.match(src, /supabaseClient\.rpc\("get_firm_review_summaries", \{ p_names: names \}\)/);
  assert.doesNotMatch(src, /ratingInfo\.count > 5/);
  // A chip drawn from the exact-name ratings is updated to the matched summary, not left stale.
  assert.match(src, /let a = card\.querySelector\("\.jc-chip-rating"\);\n\s+if \(!a\) \{/);
  const start = src.indexOf('function hasReviewRating(info)');
  const end = src.indexOf('// Review summaries for the companies on this page');
  const ctx = {};
  vm.runInNewContext(src.slice(start, end) + ';this.f={hasReviewRating,buildReviewFactsHtml,toReviewInfo};', ctx);
  const { hasReviewRating, buildReviewFactsHtml, toReviewInfo } = ctx.f;
  const info = toReviewInfo('BDO India', { firm_name: 'BDO', review_count: 20, avg_overall: 3.4, stipend_median: 13500,
    stipend_answers: 20, stipend_on_time: 16, stipend_delayed: 4, leave_answers: 20, leave_easy: 13, leave_difficult: 2 });
  assert.equal(hasReviewRating(info), true);
  assert.match(buildReviewFactsHtml(info), /From 20 student reviews: Stipend ~₹13,500 · Stipend paid on time · Leave easy to get/);
  assert.equal(buildReviewFactsHtml(toReviewInfo('None', null)), '');
});
