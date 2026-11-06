const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// The admin page you actually post jobs from is admin.html, which carries its own inline script.
// scripts/admin.js is NOT loaded by any page, so batching that only exists there never runs.
// These tests load the real inline script of admin.html and drive triggerNotifications end to end
// against a fake Supabase table and a fake fetch.
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

function inlineScript() {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const found = scripts.find(s => s.includes('async function triggerNotifications('));
  assert.ok(found, 'admin.html has no inline script defining triggerNotifications');
  return found;
}

// In-memory stand-in for the one table the batching code touches.
function fakeSupabase(rows = {}, { failReads = false } = {}) {
  const table = { ...rows };
  return {
    table,
    client: {
      from(name) {
        assert.equal(name, 'job_notification_batches', `unexpected table ${name}`);
        return {
          select() {
            return {
              eq(_col, topic) {
                return { maybeSingle: async () => failReads
                  ? { data: null, error: { message: 'boom' } }
                  : { data: table[topic] ? { ...table[topic] } : null, error: null } };
              },
            };
          },
          upsert: async (row) => { table[row.topic] = { pending_count: row.pending_count, last_sent_at: row.last_sent_at }; return { error: null }; },
        };
      },
    },
  };
}

function load({ rows, sendOk = true, failReads = false } = {}) {
  const db = fakeSupabase(rows, { failReads });
  const calls = [];
  const noop = () => {};
  const context = {
    supabase: { createClient: () => db.client },
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    window: { addEventListener: noop, location: { href: '', search: '' } },
    localStorage: { getItem: () => null, setItem: noop },
    fetch: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return { ok: sendOk, statusText: 'x', json: async () => ({ success: sendOk }) };
    },
    Date, Number, Math, JSON, String, Promise, URL, URLSearchParams, console: { log: noop, error: noop, warn: noop },
    setTimeout, clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(`${inlineScript()}\nthis.api = { triggerNotifications };`, context);
  return { api: context.api, db, calls };
}

const job = (Location, table = 'Industrial Training Job Portal') => ({ Company: 'Acme', Location, table });
const hoursAgo = (h) => new Date(Date.now() - h * 3600 * 1000).toISOString();

test('admin.html no longer sends one push per job with the old text', () => {
  assert.ok(!html.includes('New ${portalName} job in'), 'old per-job notification text is still in admin.html');
});

test('admin.html defines the batching code itself instead of relying on scripts/admin.js', () => {
  const script = inlineScript();
  for (const name of ['notifyOrBatch', 'computeJobNotificationBatchUpdate', 'shouldFlushJobNotificationBatch', 'TYPE_WIDE_TOPIC_MAP']) {
    assert.ok(script.includes(name), `admin.html inline script is missing ${name}`);
  }
});

test('first job on fresh topics pushes once each to the city topic, the type-wide topic and all', async () => {
  const { api, db, calls } = load();
  await api.triggerNotifications(job('Mumbai, Maharashtra'), 'token');
  assert.deepEqual(calls.map(c => c.topic).sort(), ['Industrial-all', 'all', 'mumbai-industrial']);
  const byTopic = Object.fromEntries(calls.map(c => [c.topic, c.title]));
  assert.equal(byTopic['mumbai-industrial'], '1+ new jobs posted for Mumbai - Industrial Training');
  assert.equal(byTopic['Industrial-all'], '1+ new jobs posted for Industrial Training');
  assert.equal(byTopic.all, '1+ new jobs posted');
  for (const topic of ['mumbai-industrial', 'Industrial-all', 'all']) {
    assert.equal(db.table[topic].pending_count, 0, `${topic} counter should reset after a send`);
    assert.ok(db.table[topic].last_sent_at, `${topic} should record last_sent_at`);
  }
});

test('a second job inside the 3-hour window sends nothing and only counts', async () => {
  const sent = hoursAgo(1);
  const rows = Object.fromEntries(['mumbai-industrial', 'Industrial-all', 'all'].map(t => [t, { pending_count: 0, last_sent_at: sent }]));
  const { api, db, calls } = load({ rows });
  await api.triggerNotifications(job('Mumbai'), 'token');
  assert.equal(calls.length, 0, 'no push expected inside the window');
  for (const topic of Object.keys(rows)) {
    assert.equal(db.table[topic].pending_count, 1);
    assert.equal(db.table[topic].last_sent_at, sent, 'last_sent_at must not move without a send');
  }
});

test('the first job after the window flushes one push with the accumulated count and resets', async () => {
  const rows = { 'Industrial-all': { pending_count: 6, last_sent_at: hoursAgo(4) }, all: { pending_count: 6, last_sent_at: hoursAgo(4) } };
  const { api, db, calls } = load({ rows });
  await api.triggerNotifications(job('Somewhere with no known city'), 'token');
  assert.deepEqual(calls.map(c => c.topic).sort(), ['Industrial-all', 'all']);
  assert.equal(calls.find(c => c.topic === 'all').title, '7+ new jobs posted');
  assert.equal(calls.find(c => c.topic === 'Industrial-all').title, '7+ new jobs posted for Industrial Training');
  assert.equal(db.table.all.pending_count, 0);
});

test('a failed push keeps the count and the old last_sent_at so the next job retries', async () => {
  const old = hoursAgo(5);
  const { api, db } = load({ rows: { all: { pending_count: 2, last_sent_at: old } }, sendOk: false });
  await api.triggerNotifications(job('Pune', 'Articleship Jobs'), 'token');
  assert.equal(db.table.all.pending_count, 3, 'count must be kept (2 + this job)');
  assert.equal(db.table.all.last_sent_at, old, 'last_sent_at must not advance on a failed send');
});

test('if the batch table cannot be read, nothing is pushed and nothing is written', async () => {
  const { api, db, calls } = load({ failReads: true });
  await api.triggerNotifications(job('Delhi'), 'token');
  assert.equal(calls.length, 0);
  assert.deepEqual(db.table, {});
});

test('each portal maps to its own type-wide topic', async () => {
  for (const [table, topic] of [['Fresher Jobs', 'fresher-all'], ['Semi Qualified Jobs', 'semi-all'], ['Articleship Jobs', 'articleship-all'], ['Industrial Training Job Portal', 'Industrial-all']]) {
    const { api, calls } = load();
    await api.triggerNotifications(job('Nowhere', table), 'token');
    assert.ok(calls.some(c => c.topic === topic), `${table} should push to ${topic}`);
  }
});

test('no access token means no push and no database write', async () => {
  const { api, db, calls } = load();
  await api.triggerNotifications(job('Mumbai'), undefined);
  assert.equal(calls.length, 0);
  assert.deepEqual(db.table, {});
});

test('an Experienced job in Fresher Jobs also pushes to the Experienced CA city and All India topics', async () => {
  const { api, calls } = load();
  await api.triggerNotifications({ ...job('Mumbai', 'Fresher Jobs'), Experience: 'Experienced' }, 'token');
  assert.deepEqual(calls.map(c => c.topic).sort(), ['all', 'experienced-all', 'fresher-all', 'mumbai-experienced', 'mumbai-fresher']);
  const byTopic = Object.fromEntries(calls.map(c => [c.topic, c]));
  assert.equal(byTopic['mumbai-experienced'].title, '1+ new jobs posted for Mumbai - Experienced CA');
  assert.equal(byTopic['experienced-all'].title, '1+ new jobs posted for Experienced CA');
  assert.equal(byTopic['experienced-all'].link, 'https://www.mystudentclub.com/experienced-ca-jobs');
});

test('Fresher and unspecified-experience jobs do not push to the Experienced CA topics', async () => {
  for (const Experience of ['Freshers', null, undefined]) {
    const { api, calls } = load();
    await api.triggerNotifications({ ...job('Mumbai', 'Fresher Jobs'), Experience }, 'token');
    assert.ok(!calls.some(c => c.topic.includes('experienced')), `Experience=${Experience} should not reach experienced topics`);
  }
  const { api, calls } = load();
  await api.triggerNotifications({ ...job('Mumbai', 'Semi Qualified Jobs'), Experience: 'Experienced' }, 'token');
  assert.ok(!calls.some(c => c.topic.includes('experienced')), 'Semi Qualified experienced jobs stay on semi topics');
});
