// Shared Notify Me helper (scripts/notify-waitlist.js) and its wiring on the program pages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const helperSrc = fs.readFileSync(path.join(root, 'scripts', 'notify-waitlist.js'), 'utf8');
const PAGES = [['msc-ca-fresher-program', 'ca-fresher'], ['articleship-program', 'articleship']];

function load(storage = {}) {
  const logged = [];
  const localStorage = {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null),
    setItem: (key, value) => { storage[key] = String(value); },
  };
  const window = {};
  vm.runInNewContext(helperSrc, { window, localStorage, console: { error: (...args) => logged.push(args) }, Date, Math });
  return { waitlist: window.MSCWaitlist, storage, logged };
}

// rpc: 'ok' | 'missing' | { error } ; isOn: value returned by is_on_waitlist
function fakeDb({ rpc = 'ok', isOn = false, insertError = null, throws = false } = {}) {
  const calls = { rpcs: [], inserts: [] };
  return {
    calls,
    rpc: async (name, args) => {
      calls.rpcs.push({ name, key: args.p_key, topic: args.p_topic });
      if (throws) throw new Error('network down');
      if (rpc === 'missing') return { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } };
      if (rpc && rpc.error) return { data: null, error: rpc.error };
      return { data: name === 'is_on_waitlist' ? isOn : null, error: null };
    },
    from: (table) => ({
      insert: async (row) => { calls.inserts.push({ table, key: row.key, email: row.email, topic: row.topic }); return { error: insertError }; },
    }),
  };
}

test('join goes through join_waitlist with a stored device key and never sends an email', async () => {
  const { waitlist, storage } = load();
  const db = fakeDb();
  await waitlist.join(db, 'ca-fresher', 'someone@example.com');
  assert.equal(db.calls.rpcs.length, 1);
  assert.equal(db.calls.rpcs[0].name, 'join_waitlist');
  assert.equal(db.calls.rpcs[0].topic, 'ca-fresher');
  assert.match(db.calls.rpcs[0].key, /^dk_/);
  assert.equal(storage.msc_device_key, db.calls.rpcs[0].key);
  assert.equal(db.calls.inserts.length, 0);
});

test('join reuses the existing device key so one browser stays one row', async () => {
  const { waitlist } = load({ msc_device_key: 'dk_existing' });
  const db = fakeDb();
  await waitlist.join(db, 'articleship-program');
  assert.equal(db.calls.rpcs[0].key, 'dk_existing');
});

test('before the SQL is run, join falls back to the direct insert and ignores duplicate-key errors', async () => {
  const { waitlist, logged } = load({ msc_device_key: 'dk_existing' });
  const db = fakeDb({ rpc: 'missing', insertError: { code: '23505', message: 'duplicate key' } });
  await waitlist.join(db, 'industrial-training', 'someone@example.com');
  assert.deepEqual(db.calls.inserts, [{ table: 'notifiable', key: 'dk_existing', email: 'someone@example.com', topic: 'industrial-training' }]);
  assert.equal(logged.length, 0);
});

test('any other join error is logged and does not fall back to an insert', async () => {
  const { waitlist, logged } = load();
  const db = fakeDb({ rpc: { error: { code: '42501', message: 'permission denied' } } });
  await waitlist.join(db, 'ca-fresher');
  assert.equal(db.calls.inserts.length, 0);
  assert.equal(logged.length, 1);
});

test('join and isOn are harmless without a Supabase client', async () => {
  const { waitlist } = load();
  await waitlist.join(null, 'ca-fresher');
  assert.equal(await waitlist.isOn(null, 'ca-fresher'), false);
});

test('isOn is true only when the database says yes, and never creates a device key', async () => {
  const fresh = load();
  assert.equal(await fresh.waitlist.isOn(fakeDb({ isOn: true }), 'ca-fresher'), true);
  assert.equal(fresh.storage.msc_device_key, undefined);

  const known = load({ msc_device_key: 'dk_known' });
  const db = fakeDb({ isOn: false });
  assert.equal(await known.waitlist.isOn(db, 'ca-fresher'), false);
  assert.equal(db.calls.rpcs[0].key, 'dk_known');
  assert.equal(db.calls.rpcs[0].name, 'is_on_waitlist');
});

test('isOn treats a missing function, an error or a network failure as not on the list', async () => {
  for (const opts of [{ rpc: 'missing' }, { rpc: { error: { code: 'XX', message: 'boom' } } }, { throws: true }]) {
    const { waitlist } = load();
    assert.equal(await waitlist.isOn(fakeDb({ ...opts, isOn: true }), 'ca-fresher'), false);
  }
});

test('each program page loads the helper first and uses its own topic', () => {
  for (const [dir, topic] of PAGES) {
    const html = fs.readFileSync(path.join(root, dir, 'index.html'), 'utf8');
    const tag = html.search(/<script src="[^"]*scripts\/notify-waitlist\.js\?v=[\d.]+"><\/script>/);
    const firstUse = html.indexOf('MSCWaitlist');
    assert.ok(tag !== -1, `${dir} loads the helper`);
    assert.ok(tag < firstUse, `${dir} loads the helper before using it`);
    assert.match(html, new RegExp(`MSCWaitlist\\??\\.join\\([^'"]*['"]${topic}['"]`), `${dir} join topic`);
    assert.match(html, new RegExp(`MSCWaitlist\\??\\.isOn\\([^'"]*['"]${topic}['"]`), `${dir} isOn topic`);
    assert.doesNotMatch(html, /from\(['"]notifiable['"]\)/, `${dir} no direct insert left`);
  }
});
