'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../articleship-program/work-simulation/js/ws-engine.js');
const S = require('../articleship-program/work-simulation/js/ws-store.js');

class MemStorage {
  constructor(init) { this.m = new Map(Object.entries(init || {})); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}
class ThrowingStorage { getItem() { throw new Error('denied'); } setItem() { throw new Error('quota'); } removeItem() { throw new Error('denied'); } }
const KEY = 'msc-articleship:work-simulation';
const sample = (t, stars) => ({ v: 1, updatedAt: t, levels: { 'sa-1': { updatedAt: t, attempts: 1, best: { stars, passed: true, clause: 'vouched 20 bills', month: 'Nov 2026', at: t } } }, cv: {} });

test('localStorage adapter: load, save, garbage and absent data', () => {
  const st = new MemStorage();
  const store = S.createStore({ global: {}, storage: st });
  assert.deepEqual(store.loadLocal(), E.emptyState());
  store.save(sample(5, 2));
  assert.equal(JSON.parse(st.getItem(KEY)).levels['sa-1'].best.stars, 2);
  assert.equal(store.loadLocal().levels['sa-1'].best.stars, 2);
  st.setItem(KEY, '{not json');
  assert.deepEqual(store.loadLocal(), E.emptyState());
});

test('throwing and missing storage never break the app', async () => {
  for (const storage of [new ThrowingStorage(), null]) {
    const store = S.createStore({ global: {}, storage });
    assert.deepEqual(store.loadLocal(), E.emptyState());
    assert.doesNotThrow(() => store.save(sample(1, 1)));
    assert.equal(await store.getDomain(), null);
    assert.equal(await store.setDomain('gst'), 'gst');
    const r = await store.addCvLine({ domain: 'gst', cvName: 'GST Work Simulation', line: 'GST Work Simulation, MSC Articleship Program | Nov 2026: Prepared returns' });
    assert.equal(r.queued, false);
  }
  // a window whose localStorage getter throws (cookies blocked)
  const g = {}; Object.defineProperty(g, 'localStorage', { get() { throw new Error('SecurityError'); } });
  const store = S.createStore({ global: g });
  assert.deepEqual(store.loadLocal(), E.emptyState());
  assert.doesNotThrow(() => store.save(sample(1, 1)));
});

test('MSCProgress adapter (sync): merge per level, newest wins, written back to both sides', async () => {
  const st = new MemStorage({ [KEY]: JSON.stringify({ v: 1, updatedAt: 9, levels: { 'sa-1': { updatedAt: 9, attempts: 2, best: { stars: 3 } }, 'gst-1': { updatedAt: 2, attempts: 1 } }, cv: {} }) });
  const saved = [];
  const remote = { v: 1, updatedAt: 7, levels: { 'sa-1': { updatedAt: 4, attempts: 1, best: { stars: 1 } }, 'dt-1': { updatedAt: 7, attempts: 1 } }, cv: {} };
  const P = { load: tool => { assert.equal(tool, 'work-simulation'); return remote; }, save: (tool, state) => { saved.push([tool, state]); } };
  const store = S.createStore({ global: { MSCProgress: P }, storage: st, remoteDelay: 0 });
  const m = await store.load();
  assert.equal(m.levels['sa-1'].best.stars, 3);
  assert.ok(m.levels['dt-1'] && m.levels['gst-1']);
  await store.flush();
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], 'work-simulation');
  assert.ok(saved[0][1].levels['dt-1']);
  assert.ok(JSON.parse(st.getItem(KEY)).levels['dt-1'], 'local copy has the merge');
});

test('MSCProgress adapter (Promise) and a failing remote', async () => {
  const saves = [];
  const P = { load: () => Promise.resolve(JSON.stringify(sample(3, 2))), save: (t, s) => new Promise(r => setTimeout(() => { saves.push(s); r(); }, 5)) };
  const store = S.createStore({ global: { MSCProgress: P }, storage: new MemStorage(), remoteDelay: 10 });
  const m = await store.load();
  assert.equal(m.levels['sa-1'].best.stars, 2);
  store.save(sample(20, 3));
  store.save(sample(21, 3));
  await new Promise(r => setTimeout(r, 40));
  await store.flush();
  assert.equal(saves[saves.length - 1].updatedAt, 21, 'debounced: the latest state goes up');
  const bad = { load: () => { throw new Error('42P01'); }, save: () => Promise.reject(new Error('PGRST205')) };
  const s2 = S.createStore({ global: { MSCProgress: bad }, storage: new MemStorage({ [KEY]: JSON.stringify(sample(1, 1)) }), remoteDelay: 0, timeout: 50 });
  assert.equal((await s2.load()).levels['sa-1'].best.stars, 1, 'stays local silently');
  assert.doesNotThrow(() => s2.save(sample(2, 2)));
  await s2.flush();
  const hang = { load: () => new Promise(() => {}), save: () => {} };
  const s3 = S.createStore({ global: { MSCProgress: hang }, storage: new MemStorage(), timeout: 30 });
  assert.deepEqual(await s3.load(), E.emptyState(), 'a remote that never answers times out');
  const partial = { load: () => null };            // no save: not a progress adapter
  assert.equal(S.createStore({ global: { MSCProgress: partial }, storage: new MemStorage() }).hasRemote(), false);
});

// consistency pass round 1 (I01): the account held sa-1 passed; after a failed or timed-out load the page used to push
// a state with dt-1 alone, replacing the account copy
test('a failed or late load never lets a save replace the account copy', async () => {
  const account = sample(3, 3);
  const dt1 = (t) => ({ v: 1, updatedAt: t, levels: { 'dt-1': { updatedAt: t, attempts: 1, attempt: { n: 1, answers: { t1: { i1: { call: 'ok' } } }, hints: {}, startedAt: t, task: 0 } } }, cv: {} });
  for (const fail of ['reject', 'throw', 'timeout', 'garbage']) {
    let loads = 0;
    const saves = [];
    const P = {
      load: () => {
        loads++;
        if (loads === 1) {
          if (fail === 'reject') return Promise.reject(new Error('network'));
          if (fail === 'throw') throw new Error('42P01');
          if (fail === 'timeout') return new Promise(() => {});
          return 12;                                            // no state: not an answer
        }
        return Promise.resolve(JSON.parse(JSON.stringify(account)));
      },
      save: (tool, state) => { saves.push(state); }
    };
    const st = new MemStorage();
    const store = S.createStore({ global: { MSCProgress: P }, storage: st, remoteDelay: 0, timeout: 30 });
    const told = [];
    store.onRemote(s => told.push(s));
    const first = await store.load();
    assert.deepEqual(Object.keys(first.levels), [], fail + ': stays local');
    assert.equal(saves.length, 0, fail + ': nothing pushed after a failed load');
    store.save(dt1(10));
    await store.flush();
    await new Promise(r => setTimeout(r, 5));
    assert.equal(loads, 2, fail + ': the account is read again before the first save');
    assert.ok(saves.length >= 1, fail + ': the merge goes up once the account answers');
    saves.forEach(s => assert.ok(s.levels['sa-1'] && s.levels['sa-1'].best.passed, fail + ': a push never drops the account’s sa-1'));
    assert.ok(saves[saves.length - 1].levels['dt-1'], fail + ': and carries the new dt-1');
    assert.equal(told.length, 1, fail + ': the page is handed the merge');
    assert.ok(told[0].levels['sa-1'] && told[0].levels['dt-1']);
    assert.ok(JSON.parse(st.getItem(KEY)).levels['sa-1'], fail + ': the local copy takes in the account’s level');
    // later saves of the page's own state (which may not hold sa-1 yet) still keep the account's sa-1
    store.save(dt1(20));
    await store.flush();
    assert.ok(saves[saves.length - 1].levels['sa-1'] && saves[saves.length - 1].levels['dt-1'].updatedAt === 20);
  }
  // a second failed read keeps the state waiting, unsent
  const saves = [];
  const down = { load: () => Promise.reject(new Error('offline')), save: (t, s) => saves.push(s) };
  const s2 = S.createStore({ global: { MSCProgress: down }, storage: new MemStorage(), remoteDelay: 0, timeout: 30 });
  await s2.load();
  s2.save(dt1(5));
  await s2.flush();
  await s2.flush();
  assert.equal(saves.length, 0, 'still no answer: nothing sent');
  // an adapter the site defines after the first load is read before it is written to
  const g = {};
  const late = [];
  const s3 = S.createStore({ global: g, storage: new MemStorage(), remoteDelay: 0, timeout: 30 });
  await s3.load();
  g.MSCProgress = { load: () => JSON.parse(JSON.stringify(account)), save: (t, s) => late.push(s) };
  s3.save(dt1(7));
  await s3.flush();
  assert.equal(late.length, 1);
  assert.ok(late[0].levels['sa-1'] && late[0].levels['dt-1'], 'a late adapter gets the merge, not dt-1 alone');
});

// consistency pass round 1 (I02): what the page saved while the account was still answering is in the merge
test('a slow load merges the local copy as it is when the account answers', async () => {
  const st = new MemStorage({ [KEY]: JSON.stringify(sample(2, 1)) });
  let answer;
  const saves = [];
  const P = { load: () => new Promise(r => { answer = r; }), save: (t, s) => saves.push(s) };
  const store = S.createStore({ global: { MSCProgress: P }, storage: st, remoteDelay: 0, timeout: 1000 });
  const loading = store.load();
  // the student taps Start on dt-1 while the account is still answering
  const started = { v: 1, updatedAt: 50, levels: { 'sa-1': sample(2, 1).levels['sa-1'], 'dt-1': { updatedAt: 50, attempts: 1, attempt: { n: 1, answers: {}, hints: {}, startedAt: 50, task: 0 } } }, cv: {} };
  store.save(started);
  assert.equal(saves.length, 0, 'nothing goes up before the account has answered');
  answer({ v: 1, updatedAt: 9, levels: { 'gst-1': { updatedAt: 9, attempts: 1, best: { stars: 3, passed: true, clause: 'prepared returns', month: 'Nov 2026', at: 9 } } }, cv: {} });
  const merged = await loading;
  assert.ok(merged.levels['dt-1'] && merged.levels['dt-1'].attempt, 'the attempt started during the load is kept');
  assert.ok(merged.levels['gst-1'] && merged.levels['sa-1']);
  await store.flush();
  const last = saves[saves.length - 1];
  assert.ok(last && last.levels['dt-1'] && last.levels['gst-1'] && last.levels['sa-1'], 'the account gets all three');
  assert.ok(JSON.parse(st.getItem(KEY)).levels['dt-1'].attempt, 'and so does the local copy');
});

test('my domain: shared key, MSCProgress first, ids validated', async () => {
  const st = new MemStorage();
  const store = S.createStore({ global: {}, storage: st });
  assert.equal(await store.setDomain('direct-tax'), 'direct-tax');
  assert.equal(st.getItem('msc-articleship:my-domain'), 'direct-tax');
  assert.equal(store.getDomainLocal(), 'direct-tax');
  st.setItem('msc-articleship:my-domain', '"gst"');
  assert.equal(await store.getDomain(), 'gst', 'JSON-quoted value accepted');
  st.setItem('msc-articleship:my-domain', 'astrology');
  assert.equal(await store.getDomain(), null, 'unknown ids ignored');
  await store.setDomain(null);
  assert.equal(st.getItem('msc-articleship:my-domain'), null);
  let set = null;
  const P = { getDomain: () => Promise.resolve('valuation'), setDomain: id => { set = id; } };
  const s2 = S.createStore({ global: { MSCProgress: P }, storage: st });
  assert.equal(await s2.getDomain(), 'valuation');
  assert.equal(st.getItem('msc-articleship:my-domain'), 'valuation', 'mirrored locally');
  await s2.setDomain('fdd');
  assert.equal(set, 'fdd');
  const P2 = { getDomain: () => null };
  st.setItem('msc-articleship:my-domain', 'gst');
  assert.equal(await S.createStore({ global: { MSCProgress: P2 }, storage: st }).getDomain(), 'gst', 'remote empty: local wins');
  // consistency pass round 2 (I2-09): a domain picked while a slow getDomain is still answering is kept in the key
  st.removeItem('msc-articleship:my-domain');
  let answer; const slow = { getDomain: () => new Promise(r => { answer = r; }) };
  const s3 = S.createStore({ global: { MSCProgress: slow }, storage: st });
  const late = s3.getDomain();
  await s3.setDomain('gst');
  answer('ib-er');
  assert.equal(await late, 'gst', 'the student’s pick wins over a late answer');
  assert.equal(st.getItem('msc-articleship:my-domain'), 'gst');
  assert.equal(S.DOMAIN_IDS.length, 13);
});

test('Add to my CV: creates cv_maker_data, one line per domain, keeps the rest, queues the import', async () => {
  const st = new MemStorage();
  let t = 100;
  const store = S.createStore({ global: {}, storage: st, now: () => t++ });
  const l1 = 'Statutory Audit Work Simulation, MSC Articleship Program | Nov 2026: Vouched 20 bills';
  let r = await store.addCvLine({ domain: 'statutory-audit', cvName: 'Statutory Audit Work Simulation', line: l1 });
  assert.equal(r.cv, 'created');
  let cv = JSON.parse(st.getItem('cv_maker_data'));
  assert.deepEqual(cv.certifications, [{ name: l1, issuer: '' }]);
  // a real CV with other certificates and an older MSC line written as HTML
  st.setItem('cv_maker_data', JSON.stringify({ personal: { name: 'Asha' }, certifications: [
    { name: 'PwC US Audit Job Simulation (Forage) | Oct 2026: Tested controls', issuer: '' },
    { name: '<b>Statutory Audit Work Simulation, MSC Articleship Program</b> | Oct 2026: Counted stock', issuer: '' },
    'NISM Series VIII',
    { name: 'GST Work Simulation, MSC Articleship Program | Oct 2026: Prepared returns', issuer: '' }] }));
  r = await store.addCvLine({ domain: 'statutory-audit', cvName: 'Statutory Audit Work Simulation', line: l1 });
  assert.equal(r.cv, 'updated');
  cv = JSON.parse(st.getItem('cv_maker_data'));
  assert.equal(cv.personal.name, 'Asha');
  assert.equal(cv.certifications.length, 4);
  assert.deepEqual(cv.certifications[1], { name: l1, issuer: '' }, 'replaced in place');
  assert.equal(cv.certifications[2], 'NISM Series VIII');
  assert.match(cv.certifications[3].name, /^GST Work Simulation/);
  r = await store.addCvLine({ domain: 'valuation', cvName: 'Valuation Work Simulation', line: 'Valuation Work Simulation, MSC Articleship Program | Nov 2026: Built a DCF' });
  assert.equal(r.cv, 'added');
  assert.equal(JSON.parse(st.getItem('cv_maker_data')).certifications.length, 5);
  const q = JSON.parse(st.getItem('msc-articleship:cv-import'));
  assert.equal(q.length, 2, 'one queued entry per domain');
  assert.deepEqual(Object.keys(q[0]).sort(), ['at', 'domain', 'line', 'source']);
  assert.equal(q[0].source, 'work-simulation');
  // never overwrite a CV that cannot be read
  st.setItem('cv_maker_data', '{broken');
  r = await store.addCvLine({ domain: 'gst', cvName: 'GST Work Simulation', line: 'GST Work Simulation, MSC Articleship Program | Nov 2026: X' });
  assert.equal(r.cv, 'skipped');
  assert.equal(st.getItem('cv_maker_data'), '{broken');
  // cv_maker_data that is not an object
  st.setItem('cv_maker_data', '[1,2]');
  assert.equal((await store.addCvLine({ domain: 'gst', cvName: 'GST Work Simulation', line: 'x' })).cv, 'skipped');
  // consistency pass round 2 (I2-02): valid JSON whose certifications is not a list is the student's own data in a
  // shape this page does not know: skipped, and the stored value is left byte for byte
  for (const raw of ['{"personal":{"name":"Asha"},"certifications":"CA Inter, ICAI"}', '{"certifications":{"0":{"name":"CA Inter","issuer":"ICAI"}}}']) {
    st.setItem('cv_maker_data', raw);
    assert.equal((await store.addCvLine({ domain: 'gst', cvName: 'GST Work Simulation', line: 'GST Work Simulation, MSC Articleship Program | Nov 2026: X' })).cv, 'skipped');
    assert.equal(st.getItem('cv_maker_data'), raw);
    assert.equal(S.upsertCertification(raw, 'GST Work Simulation', 'x').status, 'skipped');
  }
  // a null certifications is treated as none yet (a list is created)
  assert.equal(S.upsertCertification('{"certifications":null}', 'GST Work Simulation', 'x').status, 'added');
});

test('Add to my CV calls the site hooks (sync, Promise, throwing)', async () => {
  const calls = [];
  for (const impl of [e => calls.push(e), e => Promise.resolve(calls.push(e)), () => { throw new Error('x'); }]) {
    const store = S.createStore({ global: { MSCProgress: { addCvLine: impl } }, storage: new MemStorage(), now: () => 7 });
    const r = await store.addCvLine({ domain: 'gst', cvName: 'GST Work Simulation', line: 'L' });
    assert.equal(typeof r.hook, 'boolean');
    assert.equal(r.cv, 'created');
  }
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { source: 'work-simulation', domain: 'gst', cvName: 'GST Work Simulation', line: 'L', at: 7 });
  const got = [];
  const s = S.createStore({ global: { MSCCvImport: { addLine: e => got.push(e) } }, storage: new MemStorage() });
  assert.equal((await s.addCvLine({ domain: 'gst', cvName: 'GST Work Simulation', line: 'L' })).hook, true);
  assert.equal(got.length, 1);
});

test('size cap: a huge state is trimmed under 60 KB without losing lines', () => {
  const big = E.emptyState();
  for (let i = 0; i < 27; i++) {
    const answers = { t1: {} };
    for (let k = 0; k < 40; k++) answers.t1['b' + k] = { verdict: 'exception', reasons: ['cutoff', 'rate'], note: 'x'.repeat(380) };
    big.levels['l' + i] = { updatedAt: i, attempts: 2, attempt: { n: 2, answers, hints: {}, startedAt: 1, task: 0, submittedAt: 5 },
      best: { n: 1, stars: 2, passed: true, accuracy: 0.8, clause: 'checked ' + i + ' things', month: 'Nov 2026', at: i, answers } };
  }
  assert.ok(S.sizeOf(big) > 300 * 1024);
  const fit = S.fitState(big);
  assert.ok(S.sizeOf(fit) <= 60 * 1024, 'fits: ' + S.sizeOf(fit));
  Object.keys(big.levels).forEach(id => {
    assert.equal(fit.levels[id].best.clause, big.levels[id].best.clause);
    assert.equal(fit.levels[id].best.stars, 2);
  });
  const st = new MemStorage();
  S.createStore({ global: {}, storage: st }).save(big);
  assert.ok(st.getItem(KEY).length <= 60 * 1024);
  const small = { v: 1, updatedAt: 1, levels: { a: { updatedAt: 1, attempts: 0 } }, cv: {} };
  assert.deepEqual(S.fitState(small), E.normalizeState(small), 'small states untouched');
});

test('upsertCertification and plain-text matching', () => {
  assert.equal(S.plain('<b>A&amp;B</b>&nbsp;x'), 'A&B x');
  const r = S.upsertCertification(null, 'M&A Tax Work Simulation', 'M&A Tax Work Simulation, MSC Articleship Program | Jan 2027: Drafted a note');
  assert.equal(r.status, 'created');
  const r2 = S.upsertCertification(r.value, 'M&A Tax Work Simulation', 'M&A Tax Work Simulation, MSC Articleship Program | Feb 2027: Drafted two notes');
  assert.equal(JSON.parse(r2.value).certifications.length, 1);
  assert.match(JSON.parse(r2.value).certifications[0].name, /Feb 2027/);
});
