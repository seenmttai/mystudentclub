const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// Per-browser notification topic sync (scripts/portal3.js and scripts/portal-email.js). Firebase subscribes device
// tokens, so turning a topic off on one device must also turn it off on the others when they next open the site.
const root = path.resolve(__dirname, '..');
const START = '// ---- Per-browser topic sync';
const END = '// ---- end per-browser topic sync';
const blockOf = file => {
  const s = fs.readFileSync(path.join(root, 'scripts', file), 'utf8').replace(/\r\n/g, '\n');
  const a = s.indexOf(START), b = s.indexOf(END);
  assert.ok(a >= 0 && b > a, `${file} has the topic sync block`);
  return s.slice(a, b);
};

function load({ device = null, fail = () => false } = {}) {
  const store = new Map();
  if (device) store.set('mscDeviceTopics', JSON.stringify(device));
  const calls = [];
  const ctx = {
    JOB_TYPES_NOTIF: [{ value: 'industrial' }, { value: 'semi' }, { value: 'fresher' }, { value: 'articleship' }],
    LOCATIONS_NOTIF: ['mumbai', 'bangalore', 'gurgaon', 'pune', 'kolkata', 'delhi', 'noida', 'hyderabad', 'ahmedabad', 'chennai', 'jaipur'],
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push(body);
      const bad = fail(body);
      return { ok: !bad, text: async () => (bad ? 'nope' : 'ok') };
    },
    JSON, Array, Set, Promise, Error,
  };
  vm.runInNewContext(`${blockOf('portal3.js')}\nthis.api = { mscReconcileTopics, mscTopicRequest, MSC_ALL_JOB_TOPICS };`, ctx);
  const deviceNow = () => JSON.parse(store.get('mscDeviceTopics') || 'null');
  return { api: ctx.api, calls, deviceNow, store };
}
const topicsOf = (calls, action, token) => calls.filter(c => c.action === action && (!token || c.token === token)).map(c => c.topic).sort();

test('every job topic is known: all, the four portal topics and 11 cities x 4 portals', () => {
  const { api } = load();
  assert.equal(api.MSC_ALL_JOB_TOPICS.length, 1 + 4 + 44);
  for (const t of ['all', 'Industrial-all', 'fresher-all', 'semi-all', 'articleship-all', 'mumbai-industrial', 'jaipur-articleship']) assert.ok(api.MSC_ALL_JOB_TOPICS.includes(t), t);
});

test('first sync on a browser clears every old job topic not on the account list, then subscribes the list', async () => {
  const { api, calls, deviceNow } = load();
  const failures = await api.mscReconcileTopics('T', ['Industrial-all'], false);
  assert.equal(failures, 0);
  assert.equal(topicsOf(calls, 'unsubscribe').length, 48);
  assert.ok(!topicsOf(calls, 'unsubscribe').includes('Industrial-all'));
  assert.deepEqual(topicsOf(calls, 'subscribe'), ['Industrial-all']);
  assert.deepEqual(deviceNow(), { token: 'T', topics: ['Industrial-all'] });
});

test('turned off on another device: this browser unsubscribes exactly those topics', async () => {
  const { api, calls, deviceNow } = load({ device: { token: 'T', topics: ['all', 'Industrial-all', 'mumbai-industrial'] } });
  await api.mscReconcileTopics('T', ['mumbai-industrial'], false);
  assert.deepEqual(topicsOf(calls, 'unsubscribe'), ['Industrial-all', 'all']);
  assert.deepEqual(topicsOf(calls, 'subscribe'), []);
  assert.deepEqual(deviceNow().topics, ['mumbai-industrial']);
});

test('turned on on another device: this browser subscribes it', async () => {
  const { api, calls, deviceNow } = load({ device: { token: 'T', topics: [] } });
  await api.mscReconcileTopics('T', ['fresher-all'], false);
  assert.deepEqual(topicsOf(calls, 'subscribe'), ['fresher-all']);
  assert.deepEqual(topicsOf(calls, 'unsubscribe'), []);
  assert.deepEqual(deviceNow().topics, ['fresher-all']);
});

test('nothing changed means no calls, and the daily refresh re-subscribes the list', async () => {
  const quiet = load({ device: { token: 'T', topics: ['all'] } });
  await quiet.api.mscReconcileTopics('T', ['all'], false);
  assert.equal(quiet.calls.length, 0);
  const daily = load({ device: { token: 'T', topics: ['all'] } });
  await daily.api.mscReconcileTopics('T', ['all'], true);
  assert.deepEqual(topicsOf(daily.calls, 'subscribe'), ['all']);
});

test('a new browser token releases the old token\'s topics and cleans up the new one', async () => {
  const { api, calls, deviceNow } = load({ device: { token: 'OLD', topics: ['all', 'semi-all'] } });
  await api.mscReconcileTopics('NEW', [], false);
  assert.deepEqual(topicsOf(calls, 'unsubscribe', 'OLD'), ['all', 'semi-all']);
  assert.equal(topicsOf(calls, 'unsubscribe', 'NEW').length, 49);
  assert.deepEqual(deviceNow(), { token: 'NEW', topics: [] });
});

test('a first clean-up that partly failed is retried on the next page load', async () => {
  const { api, store } = load({ fail: c => c.topic === 'pune-semi' });
  const failures = await api.mscReconcileTopics('T', [], false);
  assert.equal(failures, 1);
  assert.equal(store.has('mscDeviceTopics'), false, 'forgotten, so the next load cleans up again');
});

test('a single change keeps this browser\'s list in step and changes nothing when the call fails', async () => {
  const ok = load({ device: { token: 'T', topics: ['all'] } });
  await ok.api.mscTopicRequest('T', 'Industrial-all', 'subscribe');
  assert.deepEqual(ok.deviceNow().topics, ['all', 'Industrial-all']);
  await ok.api.mscTopicRequest('T', 'all', 'unsubscribe');
  assert.deepEqual(ok.deviceNow().topics, ['Industrial-all']);
  const bad = load({ device: { token: 'T', topics: ['all'] }, fail: () => true });
  await assert.rejects(bad.api.mscTopicRequest('T', 'all', 'unsubscribe'));
  assert.deepEqual(bad.deviceNow().topics, ['all']);
});

test('both portal scripts carry the same sync block, use it for every change, and skip it inside the app', () => {
  assert.equal(blockOf('portal3.js'), blockOf('portal-email.js'));
  for (const file of ['portal3.js', 'portal-email.js']) {
    const s = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    assert.ok(s.includes('await mscTopicRequest(currentFcmToken, topic, action);'), `${file}: changes go through the helper`);
    assert.ok(!/fetch\(\s*['"]https:\/\/us-central1-msc-notif\.cloudfunctions\.net\/manageTopicSubscription/.test(s), `${file}: no direct call left`);
    assert.match(s, /async function syncNotificationTopics\(\) \{\s*\/\/[^\n]*\n\s*if \(window\.flutter_app && window\.flutter_app\.isReady\) return;/, `${file}: the app manages its own topics`);
    assert.match(s, /mscReconcileTopics\(currentFcmToken, [a-zA-Z.]*notification_subscriptions, false\)/, `${file}: reconciles when the account list loads`);
  }
});
