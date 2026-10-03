const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');

// Both files are ES modules in a "type": "commonjs" package, so import .mjs copies.
async function importCopy(rel) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msc-rail-'));
  const copy = path.join(dir, path.basename(rel).replace(/\.js$/, '.mjs'));
  fs.copyFileSync(path.join(root, rel), copy);
  return import(pathToFileURL(copy).href);
}

const NOW = new Date('2026-10-01T06:30:00Z'); // 12:00 IST
const at = (hours) => new Date(NOW.getTime() + hours * 3600e3).toISOString();
const PAYLOAD = {
  ok: true,
  sessions: [
    { id: 's1', slug: 'it-roadmap-live', title: 'IT roadmap <live>', starts_at: at(30), duration_min: 90 },
    { id: 's2', slug: 'campus-talk', title: 'Campus talk', kind: 'pre-placement-talk', starts_at: at(100), duration_min: 60 },
    { id: 's3', slug: 'full-one', title: 'Full one', starts_at: at(2), duration_min: 60, seats_left: 0 },
    { id: 'd1', slug: 'cv-day-1', title: 'Day 1', series_id: 'x1', starts_at: at(50), duration_min: 60 },
  ],
  series: [
    {
      id: 'x1',
      slug: 'cv-bootcamp',
      title: 'CV bootcamp',
      days: [
        { id: 'd1', title: 'Day 1', starts_at: at(50), duration_min: 60 },
        { id: 'd2', title: 'Day 2', starts_at: at(74), duration_min: 60 },
      ],
    },
  ],
};

function fakePage({ wide = true } = {}) {
  const list = { innerHTML: '', hidden: true };
  return {
    list,
    win: { location: { hostname: 'www.mystudentclub.com', origin: 'https://www.mystudentclub.com' }, matchMedia: () => ({ matches: wide }) },
    doc: { getElementById: (id) => (id === 'dv2SessionsList' ? list : null) },
  };
}

test('the rail shows the next two open events, with a series as one row', async () => {
  const rail = await importCopy('scripts/upcoming-sessions.js');
  const sessions = await importCopy('sessions/sessions.js');
  const items = rail.railItems(sessions, PAYLOAD, NOW);
  assert.deepEqual(items.map((x) => x.anchor), ['session-it-roadmap-live', 'series-cv-bootcamp']);

  const first = rail.railRowHtml(sessions, items[0], NOW);
  assert.match(first, /href="\/sessions\/#session-it-roadmap-live"/);
  assert.match(first, /<strong>IT roadmap &lt;live&gt;<\/strong>/);
  assert.match(first, /<small>Tomorrow · 6:00 pm IST<\/small>/);
  const series = rail.railRowHtml(sessions, items[1], NOW);
  assert.match(series, /<small>2-day series · Sat, 3 Oct · 2:00 pm IST<\/small>/);
});

test('mounting fills and shows the list from the Worker API', async () => {
  const rail = await importCopy('scripts/upcoming-sessions.js');
  const sessionsModule = await importCopy('sessions/sessions.js');
  const { list, win, doc } = fakePage();
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, json: async () => PAYLOAD };
  };
  const shown = await rail.mountUpcomingSessions(win, doc, { fetch, sessionsModule, now: () => NOW });
  assert.equal(shown, 2);
  assert.equal(calls[0].url, 'https://notify.mystudentclub.com/api/sessions');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(list.hidden, false);
  assert.equal(list.innerHTML.split('class="dv2-rail-link"').length - 1, 2);
});

test('the static card stays as it is when the rail is hidden, the API fails or nothing is scheduled', async () => {
  const rail = await importCopy('scripts/upcoming-sessions.js');
  const sessionsModule = await importCopy('sessions/sessions.js');

  const narrow = fakePage({ wide: false });
  let fetched = false;
  const never = async () => { fetched = true; throw new Error('should not fetch'); };
  assert.equal(await rail.mountUpcomingSessions(narrow.win, narrow.doc, { fetch: never, sessionsModule }), 0);
  assert.equal(fetched, false);

  for (const fetch of [
    async () => { throw new TypeError('network down'); },
    async () => ({ ok: false, json: async () => ({}) }),
    async () => ({ ok: true, json: async () => ({ ok: true, sessions: [], series: [] }) }),
  ]) {
    const page = fakePage();
    assert.equal(await rail.mountUpcomingSessions(page.win, page.doc, { fetch, sessionsModule, now: () => NOW }), 0);
    assert.equal(page.list.hidden, true);
    assert.equal(page.list.innerHTML, '');
  }
});

test('the homepage rail has the static card and loads the module', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /<div class="dv2-rail-card" id="dv2SessionsCard">\s*<h3>Upcoming Live Sessions<\/h3>/);
  assert.match(html, /<div id="dv2SessionsList" hidden><\/div>\s*<a href="\/sessions\/" class="dv2-rail-link">/);
  assert.match(html, /<script type="module" src="\/scripts\/upcoming-sessions\.js"><\/script>/);
});
