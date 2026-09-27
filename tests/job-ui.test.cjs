const test = require('node:test');
const assert = require('node:assert/strict');
const { jobPortalUrl, improveJobUi, formatJobPostedDate, recordedJobPostedDate } = require('../scripts/job-ui.cjs');

test('missing application destination opens the correct category and exact job', () => {
  const source = `<span class="apply-link-text">#</span><button class="copy-btn" onclick="navigator.clipboard.writeText('#')"><i class="fas fa-copy"></i></button><a href="#" target="_blank" class="btn-large btn-primary-large"><i class="fas fa-external-link-alt"></i> Apply Now</a>`;
  const updated = improveJobUi(source, 'articleship', 15062);
  assert.equal((updated.match(/href="\/ca-articleship-opportunities\?id=15062&amp;type=articleship"/g) || []).length, 2);
  assert.ok(updated.includes('View application details'));
  assert.ok(!updated.includes('href="#"'));
  assert.ok(!updated.includes("writeText('#')"));
  assert.equal(improveJobUi(updated, 'articleship', 15062), updated);
});

test('real application and existing job content are preserved', () => {
  const details = '<h1>Example Company</h1><div class="description-content">Apply to jobs@example.com</div>';
  const source = details + `<button class="copy-btn" onclick="navigator.clipboard.writeText('jobs@example.com')"><i class="fas fa-copy"></i></button><a href="mailto:jobs@example.com">Email application</a>`;
  const updated = improveJobUi(source, 'fresher', 30);
  assert.ok(updated.startsWith(details));
  assert.ok(updated.includes("writeText('jobs@example.com')"));
  assert.ok(updated.includes('href="mailto:jobs@example.com"'));
  assert.ok(updated.includes('aria-label="Copy application contact"'));
  assert.equal(improveJobUi(updated, 'fresher', 30), updated);
});

test('unsupported category or job identifier cannot produce a fabricated route', () => {
  assert.equal(jobPortalUrl('made-up', 10), null);
  assert.equal(jobPortalUrl('industrial', 'bad'), null);
  assert.equal(jobPortalUrl('industrial', 10), '/?id=10&type=industrial');
  assert.equal(jobPortalUrl('semi-qualified', '2c6c5eed-b682-47f3-a3a0-30f75dd55a61'), '/semi-qualified-ca-jobs?id=2c6c5eed-b682-47f3-a3a0-30f75dd55a61&type=semi-qualified');
});

test('stored posting date replaces a frozen relative label without changing metadata', () => {
  const metadata = '<script type="application/ld+json">{"@type":"JobPosting","datePosted":"2026-09-01T20:45:00Z"}</script>';
  const result = improveJobUi(metadata + '<span>Posted Today</span>', 'industrial', 44);
  assert.ok(result.includes('<span>Posted 1 Sept 2026</span>'));
  assert.ok(result.startsWith(metadata));
  assert.equal(recordedJobPostedDate(result), '1 Sept 2026');
});

test('never guesses a posting date for old pages with absent or invalid metadata', () => {
  const source = '<span>Posted 2 days ago</span>';
  assert.equal(improveJobUi(source, 'industrial', 44), source);
  assert.equal(formatJobPostedDate('not a date'), null);
  assert.equal(formatJobPostedDate('2026-02-30'), null);
  assert.equal(recordedJobPostedDate('<script type="application/ld+json">invalid json</script>'), null);
  assert.equal(formatJobPostedDate('2026-01-02T23:50:00-05:00'), '2 Jan 2026');
});
