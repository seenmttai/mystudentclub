const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const dir = path.resolve(__dirname, '../workers/job-digest-worker');
const load = () => import(pathToFileURL(path.join(dir, 'index.mjs')).href);

const SUPA = 'https://supa.test';
const PUSH = 'https://push.test/';
const T = { industrial: 'Industrial Training Job Portal', fresher: 'Fresher Jobs', semi: 'Semi Qualified Jobs', articleship: 'Articleship Jobs' };

// "Now" is 11:00 IST. The previous run left every marker at 08:00 IST minus the one-minute settle gap.
const NOW = new Date('2026-11-05T05:30:00.000Z');
const MARKER = '2026-11-05T02:29:00.000Z';
const THROUGH = '2026-11-05T05:29:00.000Z'; // NOW minus the one-minute settle gap
const markers = () => ({ [T.industrial]: MARKER, [T.fresher]: MARKER, [T.semi]: MARKER, [T.articleship]: MARKER });
const at = minutesBeforeNow => new Date(NOW.getTime() - minutesBeforeNow * 60000).toISOString();
let nextId = 1;
const job = (minutesBeforeNow, Location, id = nextId++) => ({ id, Location, Created_At: at(minutesBeforeNow) });
const jobs = (n, minutesBeforeNow, Location) => Array.from({ length: n }, () => job(minutesBeforeNow, Location));

// Fake Supabase REST + fake push Worker. tables: {tableName: [{id, Location, Created_At}]}; state: {tableName: iso}.
function world({ tables = {}, state = markers(), pushOk = () => true, failRead = null } = {}) {
  const log = { pushes: [], writes: [], reads: [] };
  const marks = { ...state };
  const realFetch = global.fetch;
  global.fetch = async (url, init = {}) => {
    const u = new URL(url);
    if (url.startsWith(PUSH)) {
      const body = JSON.parse(init.body);
      log.pushes.push({ ...body, headers: init.headers });
      const ok = pushOk(body);
      return { ok, status: ok ? 200 : 502, json: async () => ({ success: ok, error: ok ? undefined : 'nope' }) };
    }
    assert.ok(url.startsWith(SUPA + '/rest/v1/'), `unexpected url ${url}`);
    const resource = decodeURIComponent(u.pathname.replace('/rest/v1/', ''));
    if (resource === 'job_digest_state') {
      if (init.method === 'POST') {
        const row = JSON.parse(init.body);
        log.writes.push(row);
        marks[row.table_name] = row.announced_through;
        return { ok: true, status: 201, json: async () => [] };
      }
      return { ok: true, status: 200, json: async () => Object.entries(marks).map(([table_name, announced_through]) => ({ table_name, announced_through })) };
    }
    log.reads.push(resource);
    if (failRead === resource) return { ok: false, status: 500, json: async () => ({}) };
    const [gt, lte] = u.searchParams.getAll('Created_At').map(v => v.replace(/^(gt|lte)\./, ''));
    assert.ok(gt && lte, 'a read must be bounded on both sides');
    assert.equal(u.searchParams.get('order'), 'Created_At.asc,id.asc');
    const rows = (tables[resource] || [])
      .filter(r => r.Created_At > gt && r.Created_At <= lte)
      .sort((a, b) => (a.Created_At < b.Created_At ? -1 : a.Created_At > b.Created_At ? 1 : String(a.id).localeCompare(String(b.id))))
      .slice(Number(u.searchParams.get('offset')), Number(u.searchParams.get('offset')) + Number(u.searchParams.get('limit')))
      .map(({ Location, Created_At }) => ({ Location, Created_At }));
    return { ok: true, status: 200, json: async () => rows };
  };
  return { log, marks, restore: () => { global.fetch = realFetch; } };
}

const env = (extra = {}) => ({ SUPABASE_URL: SUPA, PUSH_WORKER_URL: PUSH, SUPABASE_SERVICE_ROLE_KEY: 'svc', SECURE_API_KEY: 'push-key', DRY_RUN: 'false', ...extra });
const quiet = () => { const orig = { log: console.log, error: console.error }; console.log = () => {}; console.error = () => {}; return () => Object.assign(console, orig); };
async function run(w, { now = NOW, e = env() } = {}) {
  const { runDigest } = await load();
  const un = quiet();
  try { return await runDigest(e, now); } finally { un(); }
}
const titles = w => Object.fromEntries(w.log.pushes.map(p => [p.topic, p.title]));
const withWorld = (opts, body) => async () => { const w = world(opts); try { await body(w); } finally { w.restore(); } };

test('citiesIn finds every followable city a job names, including other spellings', async () => {
  const { citiesIn } = await load();
  assert.deepEqual(citiesIn('Gurugram, Haryana'), ['gurgaon']);
  assert.deepEqual(citiesIn('Bengaluru'), ['bangalore']);
  assert.deepEqual(citiesIn('Mumbai / Pune'), ['mumbai', 'pune']);
  assert.deepEqual(citiesIn('New Delhi'), ['delhi']);
  assert.deepEqual(citiesIn('Delhi NCR (Noida)'), ['delhi', 'noida']);
  assert.deepEqual(citiesIn('Remote'), []);
  assert.deepEqual(citiesIn(''), []);
  assert.deepEqual(citiesIn(null), []);
});

test('one digest sends a portal total, a total per city that jobs name, and an all total (uuid-id table included)', withWorld({
  tables: {
    [T.industrial]: [...jobs(2, 30, 'Mumbai'), job(60, 'Pune'), job(90, 'Remote')],
    [T.fresher]: [job(20, 'Gurugram')],
    [T.semi]: [{ id: '3f2b8c1e-0000-4000-8000-000000000001', Location: 'Chennai', Created_At: at(45) }],
  },
}, async w => {
  const summary = await run(w);
  assert.deepEqual(titles(w), {
    'Industrial-all': '4 new Industrial Training jobs',
    'mumbai-industrial': '2 new Industrial Training jobs in Mumbai',
    'pune-industrial': '1 new Industrial Training job in Pune',
    'fresher-all': '1 new Fresher job',
    'gurgaon-fresher': '1 new Fresher job in Gurgaon',
    'semi-all': '1 new Semi Qualified job',
    'chennai-semi': '1 new Semi Qualified job in Chennai',
    all: '6 new jobs posted',
  });
  assert.equal(summary.announced, 6);
  assert.deepEqual(summary.failed, []);
}));

test('markers move to the cut-off, and a second run over the same jobs sends nothing', withWorld({ tables: { [T.industrial]: jobs(3, 30, 'Mumbai') } }, async w => {
  await run(w);
  assert.deepEqual(w.log.writes.map(x => [x.table_name, x.announced_through]), [[T.industrial, THROUGH]]);
  const before = w.log.pushes.length;
  await run(w, { now: new Date(NOW.getTime() + 3 * 3600 * 1000) });
  assert.equal(w.log.pushes.length, before, 'the same jobs must not be announced twice');
}));

test('a job saved in the last minute is held back, then announced by the next run', withWorld({ tables: { [T.fresher]: [job(0.5, 'Pune')] } }, async w => {
  await run(w);
  assert.equal(w.log.pushes.length, 0, 'too fresh to count yet');
  await run(w, { now: new Date(NOW.getTime() + 3 * 3600 * 1000) });
  assert.equal(titles(w)['fresher-all'], '1 new Fresher job');
}));

test('a back-dated job (Created_At before the marker) is not announced', withWorld({ tables: { [T.industrial]: [job(600, 'Mumbai')] } }, async w => {
  await run(w);
  assert.equal(w.log.pushes.length, 0);
}));

test('a job dated in the future is announced when its date arrives, not before', withWorld({ tables: { [T.articleship]: [job(-120, 'Pune')] } }, async w => {
  await run(w);
  assert.equal(w.log.pushes.length, 0);
  await run(w, { now: new Date(NOW.getTime() + 3 * 3600 * 1000) });
  assert.equal(titles(w)['articleship-all'], '1 new Articleship job');
}));

test('no new jobs means no push and no write', withWorld({ tables: {} }, async w => {
  await run(w);
  assert.equal(w.log.pushes.length, 0);
  assert.equal(w.log.writes.length, 0);
}));

test('pushes authenticate with the X-API-Key only, never a login', withWorld({ tables: { [T.articleship]: [job(30, 'Chennai')] } }, async w => {
  await run(w);
  assert.ok(w.log.pushes.length >= 2);
  for (const p of w.log.pushes) {
    assert.equal(p.headers['X-API-Key'], 'push-key');
    assert.equal(p.headers.Authorization, undefined);
  }
}));

test('if the portal push fails the marker stays so the next run retries, and nothing else is announced', withWorld({
  tables: { [T.industrial]: jobs(2, 30, 'Mumbai') }, pushOk: m => m.topic !== 'Industrial-all',
}, async w => {
  const summary = await run(w);
  assert.equal(w.log.writes.length, 0, 'marker must not move after a failed portal push');
  assert.deepEqual(w.log.pushes.map(p => p.topic), ['Industrial-all'], 'no city or all push after the portal push failed');
  assert.deepEqual(summary.failed, ['Industrial-all']);
}));

test('a failed city push is logged but does not hold back the marker', withWorld({
  tables: { [T.industrial]: jobs(2, 30, 'Mumbai') }, pushOk: m => m.topic !== 'mumbai-industrial',
}, async w => {
  const summary = await run(w);
  assert.deepEqual(w.log.writes.map(x => x.announced_through), [THROUGH]);
  assert.deepEqual(summary.failed, ['mumbai-industrial']);
}));

test('a portal whose read fails is skipped and the others still go out', withWorld({
  tables: { [T.industrial]: [job(30, 'Mumbai')], [T.semi]: [job(30, 'Pune', 'u1')] }, failRead: T.industrial,
}, async w => {
  const summary = await run(w);
  assert.ok(w.log.pushes.some(p => p.topic === 'semi-all'));
  assert.ok(!w.log.pushes.some(p => p.topic === 'Industrial-all'));
  assert.deepEqual(w.log.writes.map(x => x.table_name), [T.semi]);
  assert.ok(summary.failed.includes(T.industrial));
}));

test('a table with no usable marker row is skipped instead of announcing its whole history', withWorld({
  tables: { [T.fresher]: jobs(3, 30, 'Pune'), [T.industrial]: jobs(2, 30, 'Mumbai') },
  state: { [T.industrial]: 'not a date', [T.semi]: MARKER, [T.articleship]: MARKER },
}, async w => {
  await run(w);
  assert.equal(w.log.pushes.length, 0);
  assert.equal(w.log.writes.length, 0);
}));

test('DRY_RUN reads and logs but sends nothing and moves no marker', withWorld({ tables: { [T.industrial]: jobs(2, 30, 'Mumbai') } }, async w => {
  const summary = await run(w, { e: env({ DRY_RUN: 'true' }) });
  assert.equal(w.log.pushes.length, 0);
  assert.equal(w.log.writes.length, 0);
  assert.equal(summary.dryRun, true);
}));

test('more than one page of new jobs is counted in full and announced once', withWorld({
  tables: { [T.industrial]: Array.from({ length: 2500 }, (_, i) => job(150 - i / 20, 'Mumbai')) },
}, async w => {
  await run(w);
  assert.equal(w.log.reads.filter(r => r === T.industrial).length, 3, '1000 + 1000 + 500');
  assert.equal(titles(w)['Industrial-all'], '2500 new Industrial Training jobs');
  assert.equal(w.log.writes[0].announced_through, THROUGH);
}));

test('a read cut short by the page cap moves the marker only as far as it read, so nothing is lost', withWorld({
  tables: { [T.industrial]: Array.from({ length: 10500 }, (_, i) => ({ id: i + 1, Location: 'Mumbai', Created_At: new Date(Date.parse(MARKER) + (i + 1) * 1000).toISOString() })) },
}, async w => {
  await run(w);
  assert.equal(titles(w)['Industrial-all'], '10000 new Industrial Training jobs');
  assert.equal(w.log.writes[0].announced_through, new Date(Date.parse(MARKER) + 10000 * 1000).toISOString(), 'marker stops at the 10,000th job read');
  w.log.pushes.length = 0;
  await run(w, { now: new Date(NOW.getTime() + 3 * 3600 * 1000) });
  assert.equal(titles(w)['Industrial-all'], '500 new Industrial Training jobs', 'the remaining 500 are announced next run');
}));

test('a job naming two cities counts for both but only once in the portal total', withWorld({ tables: { [T.fresher]: [job(30, 'Mumbai / Pune')] } }, async w => {
  await run(w);
  assert.deepEqual(titles(w), {
    'fresher-all': '1 new Fresher job',
    'mumbai-fresher': '1 new Fresher job in Mumbai',
    'pune-fresher': '1 new Fresher job in Pune',
    all: '1 new job posted',
  });
}));

test('both kinds of Supabase service key work: a legacy JWT goes in both headers, an sb_secret_ key in apikey only', async () => {
  const { runDigest } = await load();
  const seen = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init = {}) => { seen.push(init.headers); return { ok: true, status: 200, json: async () => [] }; };
  const un = quiet();
  try {
    await runDigest(env({ SUPABASE_SERVICE_ROLE_KEY: 'eyJlegacy.jwt.key' }), NOW);
    assert.equal(seen[0].apikey, 'eyJlegacy.jwt.key');
    assert.equal(seen[0].Authorization, 'Bearer eyJlegacy.jwt.key');
    seen.length = 0;
    await runDigest(env({ SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_abc123' }), NOW);
    assert.equal(seen[0].apikey, 'sb_secret_abc123');
    assert.equal(seen[0].Authorization, undefined, 'an sb_secret_ key must not be sent as a Bearer token');
  } finally { un(); global.fetch = realFetch; }
});

test('the cron runs at 8, 11, 14, 17 and 20 IST and the config holds no secret values', () => {
  const toml = fs.readFileSync(path.join(dir, 'wrangler.toml'), 'utf8');
  assert.match(toml, /crons = \["30 2,5,8,11,14 \* \* \*"\]/);
  const istHours = [2, 5, 8, 11, 14].map(h => { const m = h * 60 + 30 + 330; return `${Math.floor(m / 60) % 24}:${String(m % 60).padStart(2, '0')}`; });
  assert.deepEqual(istHours, ['8:00', '11:00', '14:00', '17:00', '20:00']);
  assert.match(toml, /workers_dev = false/);
  assert.ok(!/eyJ|sk-|secret_text/i.test(toml), 'no key material in wrangler.toml');
  assert.match(toml, /^DRY_RUN = "(true|false)"$/m, 'DRY_RUN is set explicitly');
  assert.match(toml, /update job_digest_state set announced_through = now\(\);/, 'the go-live step is written next to the switch');
});

test('the migration is additive, locked to the service role, never touches a job table and starts from now', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../supabase/migrations/202611050001_job_digest_state.sql'), 'utf8').toLowerCase();
  const code = sql.replace(/--.*$/gm, '');
  assert.ok(code.includes('create table if not exists public.job_digest_state'));
  assert.ok(code.includes('announced_through timestamptz not null default now()'));
  assert.ok(code.includes('enable row level security'));
  assert.ok(code.includes('revoke all on public.job_digest_state from anon, authenticated'));
  assert.ok(!/\b(drop|delete|truncate|alter\s+table\s+public\."?(industrial|fresher|semi|articleship))/.test(code), 'no destructive statement and no job table altered');
  assert.ok(!code.includes('public."'), 'the migration must not read or write a job table');
  for (const table of ['Industrial Training Job Portal', 'Fresher Jobs', 'Semi Qualified Jobs', 'Articleship Jobs']) assert.ok(code.includes(`'${table.toLowerCase()}'`), `marker row for ${table}`);
});
