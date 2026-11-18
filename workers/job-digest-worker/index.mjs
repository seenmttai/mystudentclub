// Job digest: a few times a day, ONE push per topic that says how many jobs were added since the last digest.
// It replaces the per-job pushes the admin page and hiremsc used to send (those are removed when this goes live).
// Runs from the Cloudflare cron in wrangler.toml. Nothing here runs when a job is posted.
//
// How it counts: every job table has Created_At (timestamptz, default now()). job_digest_state keeps, per table, the
// moment up to which jobs were already announced. A run announces the jobs created after that moment and up to one
// minute ago, then moves the marker to that cut-off. Consequences:
//   - A job saved with a back-dated Created_At (the admin form allows it) is not "new", so it is not announced.
//   - A job dated in the future is announced when its date arrives.
//   - Editing a job keeps its Created_At, so an edit never re-announces it.
// The one-minute gap means a job whose insert is still committing is not skipped for good: the next run gets it.
//
// Who gets what (topics are the ones the website subscribes students to, scripts/portal3.js):
//   {Type}-all    "N new Industrial Training jobs"            portal total, once per run
//   {city}-{type} "N new Industrial Training jobs in Mumbai"  only the jobs that name that city
//   all           "N new jobs posted"                         every portal together
// A student who follows a portal and a city gets both messages (at most 2 per portal per run).

const SITE = 'https://www.mystudentclub.com';

// table: the Supabase table. type: the topic suffix. topic: the portal-wide topic as students subscribe to it
// ("Industrial-all" is capitalised where the others are not - that is how it is subscribed, do not "fix" it).
export const PORTALS = [
  { table: 'Industrial Training Job Portal', type: 'industrial', name: 'Industrial Training', topic: 'Industrial-all', link: `${SITE}/` },
  { table: 'Fresher Jobs', type: 'fresher', name: 'Fresher', topic: 'fresher-all', link: `${SITE}/ca-fresher-jobs` },
  { table: 'Semi Qualified Jobs', type: 'semi', name: 'Semi Qualified', topic: 'semi-all', link: `${SITE}/semi-qualified-ca-jobs` },
  { table: 'Articleship Jobs', type: 'articleship', name: 'Articleship', topic: 'articleship-all', link: `${SITE}/ca-articleship-opportunities` },
];

// The cities a student can follow (LOCATIONS_NOTIF in scripts/portal3.js) and the other spellings job posts use.
export const CITY_ALIASES = {
  mumbai: ['mumbai'],
  bangalore: ['bangalore', 'bengaluru'],
  gurgaon: ['gurgaon', 'gurugram'],
  pune: ['pune'],
  kolkata: ['kolkata'],
  delhi: ['delhi'],
  noida: ['noida'],
  hyderabad: ['hyderabad'],
  ahmedabad: ['ahmedabad'],
  chennai: ['chennai'],
  jaipur: ['jaipur'],
};

const PAGE_SIZE = 1000; // PostgREST returns at most 1000 rows per request
const MAX_PAGES = 10; // a run reads at most 10,000 new jobs; a run with more is announced in full by the next runs
const SETTLE_MS = 60 * 1000; // only jobs at least this old are counted (see the note at the top)

const capitalize = word => word.charAt(0).toUpperCase() + word.slice(1);
const jobs = n => (n === 1 ? 'job' : 'jobs');

// Every distinct followable city a job's Location text names ("Mumbai / Pune" -> both, "Gurugram, Haryana" -> gurgaon).
export function citiesIn(location) {
  const text = String(location || '').toLowerCase();
  return Object.entries(CITY_ALIASES)
    .filter(([, aliases]) => aliases.some(alias => new RegExp(`\\b${alias}\\b`).test(text)))
    .map(([city]) => city);
}

// The pushes for one portal's new jobs: the portal total first (it decides whether the marker moves), then each city.
export function messagesFor(portal, rows) {
  const perCity = new Map();
  for (const row of rows) for (const city of citiesIn(row.Location)) perCity.set(city, (perCity.get(city) || 0) + 1);
  const messages = [{
    topic: portal.topic,
    title: `${rows.length} new ${portal.name} ${jobs(rows.length)}`,
    description: `Tap to see the latest ${portal.name} openings on My Student Club.`,
    link: portal.link,
  }];
  for (const [city, count] of [...perCity].sort(([a], [b]) => a.localeCompare(b))) {
    messages.push({
      topic: `${city}-${portal.type}`,
      title: `${count} new ${portal.name} ${jobs(count)} in ${capitalize(city)}`,
      description: `Tap to see the latest ${portal.name} openings in ${capitalize(city)}.`,
      link: portal.link,
    });
  }
  return messages;
}

export const allMessage = total => ({
  topic: 'all',
  title: `${total} new ${jobs(total)} posted`,
  description: 'Tap to see the latest openings on My Student Club.',
  link: `${SITE}/`,
});

// The legacy service_role key is a JWT, so it goes in both headers. The newer sb_secret_ keys are not JWTs: they go in
// the apikey header only.
function rest(env, path, init = {}) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      ...(String(key).startsWith('sb_') ? {} : { Authorization: `Bearer ${key}` }),
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
}

async function readMarkers(env) {
  const res = await rest(env, 'job_digest_state?select=table_name,announced_through');
  if (!res.ok) throw new Error(`job_digest_state read failed: ${res.status}`);
  return Object.fromEntries((await res.json()).map(row => [row.table_name, new Date(row.announced_through)]));
}

// Jobs created after `from` and up to `through`, oldest first, as {Location, Created_At}. Ties on Created_At are ordered
// by id so the pages never overlap. `capped` is true when MAX_PAGES was reached with more still waiting.
async function readNewJobs(env, table, from, through) {
  const rows = [];
  let capped = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ select: 'Location,Created_At', order: 'Created_At.asc,id.asc', limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    query.append('Created_At', `gt.${from.toISOString()}`);
    query.append('Created_At', `lte.${through.toISOString()}`);
    const res = await rest(env, `${encodeURIComponent(table)}?${query}`);
    if (!res.ok) throw new Error(`${table} read failed: ${res.status}`);
    const batch = await res.json();
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    capped = page === MAX_PAGES - 1;
  }
  return { rows, capped };
}

async function writeMarker(env, table, announcedThrough) {
  const res = await rest(env, 'job_digest_state?on_conflict=table_name', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ table_name: table, announced_through: announcedThrough.toISOString(), updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`job_digest_state write failed for ${table}: ${res.status}`);
}

// The push Worker accepts a superadmin login or this shared key (X-API-Key), so a cron needs no login.
async function send(env, message) {
  try {
    const res = await fetch(env.PUSH_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': env.SECURE_API_KEY },
      body: JSON.stringify(message),
    });
    const body = await res.json().catch(() => null);
    const ok = res.ok && body?.success !== false;
    if (!ok) console.error(`push rejected for topic ${message.topic}: ${res.status} ${body?.error || ''}`);
    return ok;
  } catch (error) {
    console.error(`push failed for topic ${message.topic}`, error);
    return false;
  }
}

// One digest run. Returns what happened so tests (and the log) can see it.
export async function runDigest(env, now = new Date()) {
  const dryRun = String(env.DRY_RUN).toLowerCase() === 'true';
  const through = new Date(now.getTime() - SETTLE_MS);
  const markers = await readMarkers(env);
  const summary = { dryRun, sent: [], failed: [], announced: 0 };

  for (const portal of PORTALS) {
    try {
      const marker = markers[portal.table];
      // The marker row is created (at the moment the migration ran) by the migration. Without one we would announce
      // the whole backlog, so skip and say so.
      if (!marker || Number.isNaN(marker.getTime())) { console.error(`no usable job_digest_state row for "${portal.table}", skipping`); continue; }
      const { rows, capped } = await readNewJobs(env, portal.table, marker, through);
      if (!rows.length) continue;
      // Normally everything up to `through` was read. If the page cap cut the read short, only move as far as the last
      // job actually read, so the rest is announced by the next run instead of being lost.
      const announcedThrough = capped ? new Date(rows[rows.length - 1].Created_At) : through;

      const [portalMessage, ...cityMessages] = messagesFor(portal, rows);
      if (dryRun) {
        console.log(`[dry run] ${portal.table}: ${rows.length} new, would send`, [portalMessage, ...cityMessages].map(m => `${m.topic}: ${m.title}`));
        continue;
      }
      // The portal push decides the marker: if it fails the marker stays, and the next run tries the same jobs again.
      if (!(await send(env, portalMessage))) { summary.failed.push(portalMessage.topic); continue; }
      summary.sent.push(portalMessage.topic);
      for (const message of cityMessages) (await send(env, message) ? summary.sent : summary.failed).push(message.topic);
      await writeMarker(env, portal.table, announcedThrough);
      summary.announced += rows.length;
    } catch (error) {
      console.error(`digest failed for ${portal.table}`, error);
      summary.failed.push(portal.table);
    }
  }

  if (summary.announced > 0) (await send(env, allMessage(summary.announced)) ? summary.sent : summary.failed).push('all');
  console.log('digest', JSON.stringify(summary));
  return summary;
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runDigest(env));
  },
};
