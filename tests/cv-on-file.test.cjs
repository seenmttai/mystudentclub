// scripts/cv-on-file.js: is the student's CV really on file? (hire.mystudentclub.com /api/student/cv-status)
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'cv-on-file.js'), 'utf8');

function load() {
  const data = {};
  const storage = { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } };
  const context = { JSON, Number, Boolean, Date, Map, Infinity, setTimeout, clearTimeout, AbortController, globalThis: {} };
  vm.runInNewContext(source.replace(/^export (const|function|async function) /gm, '$1 ')
    + '\nthis.m = { CV_ON_FILE_KEY, CV_STATUS_URL, readCvOnFile, markCvOnFile, checkCvOnFile };', context);
  return { m: context.m, data, storage };
}
const session = { access_token: 'tok', user: { id: 'u1' } };
const answer = (body, ok = true) => { const calls = []; const f = async (url, opts) => { calls.push({ url, opts }); return { ok, json: async () => body }; }; f.calls = calls; return f; };

test('asks hire.msc with the student\'s own token and stores the answer', async () => {
  const { m, data, storage } = load();
  const fetchImpl = answer({ ok: true, hasCv: false, format: null });
  assert.equal(await m.checkCvOnFile(session, { fetchImpl, storage, now: 1000 }), false);
  assert.equal(fetchImpl.calls[0].url, 'https://hire.mystudentclub.com/api/student/cv-status');
  assert.equal(fetchImpl.calls[0].opts.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(data[m.CV_ON_FILE_KEY]), { uid: 'u1', state: 'no', at: 1000 });
});

test('a fresh answer is reused; a "no" is re-asked after a minute so an upload shows quickly', async () => {
  const { m, storage } = load();
  m.markCvOnFile('u1', true, storage, 0);
  const never = answer({ ok: true, hasCv: false });
  assert.equal(await m.checkCvOnFile(session, { fetchImpl: never, storage, now: 60 * 60 * 1000 }), true);
  assert.equal(never.calls.length, 0);
  m.markCvOnFile('u1', false, storage, 0);
  const yes = answer({ ok: true, hasCv: true });
  assert.equal(await m.checkCvOnFile(session, { fetchImpl: yes, storage, now: 61 * 1000 }), true);
  assert.equal(yes.calls.length, 1);
});

test('unknown is never "missing": errors, bad answers and no session leave nothing stored', async () => {
  const { m, data, storage } = load();
  assert.equal(await m.checkCvOnFile(session, { fetchImpl: answer({ ok: false }, false), storage }), null);
  assert.equal(await m.checkCvOnFile(session, { fetchImpl: answer({ ok: true }), storage }), null);
  assert.equal(await m.checkCvOnFile(session, { fetchImpl: async () => { throw new Error('offline'); }, storage }), null);
  assert.equal(await m.checkCvOnFile(null, { fetchImpl: answer({ ok: true, hasCv: false }), storage }), null);
  assert.equal(data[m.CV_ON_FILE_KEY], undefined);
});

test('another account\'s stored answer is ignored', async () => {
  const { m, storage } = load();
  m.markCvOnFile('u2', false, storage, Date.now());
  assert.equal(m.readCvOnFile(storage, 'u1'), null);
  const yes = answer({ ok: true, hasCv: true });
  assert.equal(await m.checkCvOnFile(session, { fetchImpl: yes, storage }), true);
  assert.equal(yes.calls.length, 1);
});

test('mobile profile counts a known-missing CV as no resume and checks on load', () => {
  const profile = fs.readFileSync(path.join(root, 'scripts', 'profile.js'), 'utf8');
  assert.match(profile, /filled: !!localStorage\.getItem\("userCVText"\) && !cvKnownMissing\(\)/);
  assert.match(profile, /refreshCvOnFileState\(\);/);
  assert.match(profile, /markCvOnFile\(currentUser\?\.id, true\)/);
});
