const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'admin.js'), 'utf8');

// admin.js is a plain (non-module) browser script. Loading it in a vm context needs
// just enough stubbing for its two top-level side effects (supabase.createClient(...)
// and the DOMContentLoaded registration) to not throw; none of the functions under
// test here touch the DOM, fetch or Supabase.
function loadAdminBatching() {
  const context = {
    supabase: { createClient: () => ({}) },
    document: { addEventListener: () => {} },
    Date, Number, Math, JSON, String, console,
  };
  context.globalThis = context;
  const executable = `${source}\nthis.batching = { shouldFlushJobNotificationBatch, computeJobNotificationBatchUpdate, NOTIFICATION_BATCH_WINDOW_HOURS };`;
  vm.runInNewContext(executable, context);
  return context.batching;
}

const { shouldFlushJobNotificationBatch, computeJobNotificationBatchUpdate, NOTIFICATION_BATCH_WINDOW_HOURS } = loadAdminBatching();

test('the batch window constant is 3 hours', () => {
  assert.equal(NOTIFICATION_BATCH_WINDOW_HOURS, 3);
});

test('shouldFlushJobNotificationBatch flushes immediately when never sent before', () => {
  assert.equal(shouldFlushJobNotificationBatch(null), true);
  assert.equal(shouldFlushJobNotificationBatch(undefined), true);
});

test('shouldFlushJobNotificationBatch does not flush inside the 3-hour window', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const lastSentAt = new Date(now - (2 * 60 * 60 * 1000)).toISOString(); // 2h ago
  assert.equal(shouldFlushJobNotificationBatch(lastSentAt, now), false);
});

test('shouldFlushJobNotificationBatch flushes exactly at the 3-hour boundary', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const exactlyThreeHoursAgo = new Date(now - (3 * 60 * 60 * 1000)).toISOString();
  assert.equal(shouldFlushJobNotificationBatch(exactlyThreeHoursAgo, now), true);
});

test('shouldFlushJobNotificationBatch flushes once past the 3-hour window', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const fourHoursAgo = new Date(now - (4 * 60 * 60 * 1000)).toISOString();
  assert.equal(shouldFlushJobNotificationBatch(fourHoursAgo, now), true);
});

test('shouldFlushJobNotificationBatch does not flush one millisecond before the boundary', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const justUnderThreeHours = new Date(now - (3 * 60 * 60 * 1000) + 1).toISOString();
  assert.equal(shouldFlushJobNotificationBatch(justUnderThreeHours, now), false);
});

test('computeJobNotificationBatchUpdate flushes immediately on the first-ever call (no row yet)', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const update = computeJobNotificationBatchUpdate(null, now);
  assert.equal(update.shouldFlush, true);
  assert.equal(update.pendingCount, 1);
  assert.equal(update.nextRow.pending_count, 0);
  assert.equal(update.nextRow.last_sent_at, new Date(now).toISOString());
});

test('computeJobNotificationBatchUpdate just increments and does not reset when inside the window', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const lastSentAt = new Date(now - (60 * 60 * 1000)).toISOString(); // 1h ago
  const row = { pending_count: 4, last_sent_at: lastSentAt };
  const update = computeJobNotificationBatchUpdate(row, now);
  assert.equal(update.shouldFlush, false);
  assert.equal(update.pendingCount, 5);
  assert.equal(update.nextRow.pending_count, 5);
  assert.equal(update.nextRow.last_sent_at, lastSentAt); // unchanged
});

test('computeJobNotificationBatchUpdate flushes and resets the counter once the window has elapsed', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const lastSentAt = new Date(now - (5 * 60 * 60 * 1000)).toISOString(); // 5h ago
  const row = { pending_count: 7, last_sent_at: lastSentAt };
  const update = computeJobNotificationBatchUpdate(row, now);
  assert.equal(update.shouldFlush, true);
  assert.equal(update.pendingCount, 8, 'message should count this job too (7 pending + this one)');
  assert.equal(update.nextRow.pending_count, 0, 'counter resets after flushing');
  assert.equal(update.nextRow.last_sent_at, new Date(now).toISOString());
});

test('computeJobNotificationBatchUpdate treats a missing pending_count on an existing row as zero', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const row = { last_sent_at: null };
  const update = computeJobNotificationBatchUpdate(row, now);
  assert.equal(update.pendingCount, 1);
  assert.equal(update.shouldFlush, true);
});
