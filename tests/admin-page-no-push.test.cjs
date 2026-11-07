const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Job pushes are sent by workers/job-digest-worker on a timer. The admin page must not also push when a job is saved,
// or students get the old per-job spam on top of the digest.
const html = fs.readFileSync(path.resolve(__dirname, '../admin.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).filter(s => s.includes('supabaseClient'));

test('admin.html sends no push notification when a job is saved', () => {
  for (const needle of ['sendNotification', 'triggerNotifications', 'notifyOrBatch', 'job_notification_batches', 'auth-check.bhansalimanan55', 'CLOUDFLARE_WORKER_URL']) {
    assert.ok(!html.includes(needle), `admin.html still contains ${needle}`);
  }
});

test('admin.html still saves new and edited jobs', () => {
  assert.ok(html.includes('.from(table).insert('), 'creating a job is gone');
  assert.ok(/\.from\(table\)\s*\.update\(|\.from\(table\)\.update\(/.test(html), 'editing a job is gone');
});

test('the admin inline script still parses', () => {
  assert.ok(scripts.length > 0, 'no inline admin script found');
  for (const script of scripts) assert.doesNotThrow(() => new Function(script));
});
