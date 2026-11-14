const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// 10 Nov 2026: the "View Application Details & Link to Apply" button called the BrowserGuard
// Worker on workers.dev. When that request could not get through (office firewall, blocker,
// patchy data, preview link) students saw a bare "Failed to fetch" and could not apply.
// Signed-in students now get the link as soon as a job opens: read straight from Supabase,
// with BrowserGuard only as the backup.
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'portal3.js'), 'utf8');

function loadHelpers({ supabaseResult, supabaseThrows, guardResult, guardThrows }) {
  const start = source.indexOf('const applicationDetailsCache = new Map();');
  const fnStart = source.indexOf('function friendlyApplicationLoadError(');
  assert.ok(start >= 0 && fnStart > start, 'portal3.js should define the application link loader');
  const end = source.indexOf('\n}\n', fnStart) + 2;
  const calls = { supabase: 0, guard: 0, selects: [] };
  const query = {
    select(cols) { calls.selects.push(cols); return this; },
    eq() { return this; },
    async maybeSingle() {
      calls.supabase += 1;
      await new Promise((r) => setTimeout(r, 5));
      if (supabaseThrows) throw supabaseThrows;
      return supabaseResult;
    }
  };
  const ctx = {
    console: { warn() {}, error() {}, log() {} },
    setTimeout,
    currentTable: 'Articleship Jobs',
    currentSession: { user: { id: 'u1' }, access_token: 't' },
    BROWSER_GUARD_WORKER_URL: 'https://guard.example',
    supabaseClient: { from: () => query },
    getCachedUnlockedJob: () => null,
    unlockJobDetails: async () => {
      calls.guard += 1;
      if (guardThrows) throw guardThrows;
      return guardResult;
    }
  };
  vm.runInNewContext(`${source.slice(start, end)}
    this.load = loadApplicationDetails; this.cached = getCachedApplicationDetails; this.friendly = friendlyApplicationLoadError;`, ctx);
  return { ...ctx, calls };
}

test('the reveal button is gone; signed-in students get the link without a tap', () => {
  assert.doesNotMatch(source, /btnRevealAppId/);
  assert.doesNotMatch(source, /View Application Details & Link to Apply/);
  assert.match(source, /Loading application link/);
});

test('the link is read straight from Supabase, no Worker call', async () => {
  const h = loadHelpers({ supabaseResult: { data: { 'Application ID': 'https://jobs.example/apply', Description: 'Full JD' }, error: null } });
  const details = await h.load({ id: 7 });
  assert.equal(details.applicationId, 'https://jobs.example/apply');
  assert.equal(details.description, 'Full JD');
  assert.equal(h.calls.guard, 0);
  assert.match(h.calls.selects[0], /"Application ID"/);
});

test('opening the same job twice, or twice at once, reads it once', async () => {
  const h = loadHelpers({ supabaseResult: { data: { 'Application ID': 'hr@example.com', Description: null }, error: null } });
  const [a, b] = await Promise.all([h.load({ id: 9 }), h.load({ id: 9 })]);
  assert.equal(a, b);
  await h.load({ id: 9 });
  assert.equal(h.calls.supabase, 1);
  assert.equal(h.cached({ id: 9 }).applicationId, 'hr@example.com');
});

test('a Supabase error falls back to BrowserGuard', async () => {
  const h = loadHelpers({
    supabaseResult: { data: null, error: { message: 'permission denied for column Application ID' } },
    guardResult: { applicationId: 'https://guard.example/link', description: 'JD' }
  });
  const details = await h.load({ id: 3 });
  assert.equal(details.applicationId, 'https://guard.example/link');
  assert.equal(h.calls.guard, 1);
});

test('a network failure on Supabase also falls back to BrowserGuard', async () => {
  const h = loadHelpers({ supabaseThrows: new TypeError('Failed to fetch'), guardResult: { applicationId: 'x@y.com' } });
  const details = await h.load({ id: 4 });
  assert.equal(details.applicationId, 'x@y.com');
  assert.equal(details.description, null);
});

test('when both fail the error is shown in plain words, and a retry reads again', async () => {
  const h = loadHelpers({ supabaseThrows: new TypeError('Failed to fetch'), guardThrows: new TypeError('Failed to fetch') });
  await assert.rejects(h.load({ id: 5 }), (err) => {
    assert.equal(h.friendly(err), "Couldn't load the application link. Check your internet and try again.");
    return true;
  });
  await assert.rejects(h.load({ id: 5 }));
  assert.equal(h.calls.supabase, 2, 'a failed load is not cached');
});

test('server messages from BrowserGuard are kept; browser network errors are reworded', () => {
  const h = loadHelpers({});
  assert.equal(h.friendly(new Error('Verify your account before viewing application details')), 'Verify your account before viewing application details');
  assert.match(h.friendly(new TypeError('Load failed')), /Check your internet/);
  assert.match(h.friendly(new Error('NetworkError when attempting to fetch resource.')), /Check your internet/);
  assert.match(h.friendly(null), /Check your internet/);
});

test('a late description fetch never puts the masked text back on a loaded job', () => {
  // www fetches the description separately; if it lands after the link loaded, it must not re-mask.
  const at = source.search(/select\(['"]Description['"]\)/);
  if (at < 0) return; // mobile has no separate description fetch
  const callback = source.slice(at, at + 1500);
  assert.match(callback, /getCachedApplicationDetails\(job\)/);
  assert.match(callback, /isShowingThisJob\(\)/);
});

test('Apply Now never opens a blank "#" tab when a job has no link', () => {
  assert.match(source, /applyLink && applyLink !== ['"]#['"]\) window\.open\(applyLink/);
  assert.match(source, /targetApplyLink && targetApplyLink !== ['"]#['"]/);
});

test('an expired session sends the student to sign in instead of retrying forever', () => {
  assert.match(source, /error\?\.status === 401/);
  assert.match(source, /Sign in again/);
});
