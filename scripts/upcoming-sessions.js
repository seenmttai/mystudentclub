// Homepage right rail: "Upcoming Live Sessions". The card and its "See all events" link are static HTML;
// this module adds the next events from the msc-mail Worker (the same API as /sessions/) when the rail is
// on screen (≥1280px). It reuses the Events page's own parsing from /sessions/sessions.js, loaded only then.
// Any failure leaves the static card as it is.

export const RAIL_QUERY = '(min-width: 1280px)';
export const RAIL_LIMIT = 2;
const TIMEOUT_MS = 8000;

/** Events-page items (series folded into one card, soonest first) → at most `limit` rail rows. */
export function railItems(sessionsModule, payload, now = new Date(), limit = RAIL_LIMIT) {
  const { normalizeSessions, normalizeSeries, buildItems } = sessionsModule;
  const items = buildItems(normalizeSessions(payload, now), normalizeSeries(payload, now));
  return items.filter((x) => !x.full && x.registrationOpen !== false).slice(0, limit);
}

/** One rail row: title, then "Tomorrow · 7:00 pm IST" (or the weekday and date), linking to its card. */
export function railRowHtml(sessionsModule, item, now = new Date()) {
  const { esc, formatIst, whenLabel } = sessionsModule;
  const ist = formatIst(item.startsAt);
  const day = whenLabel(item, now) || ist.date.replace(/ \d{4}$/, '');
  const when = day === 'Live now' ? day : `${day} · ${ist.time} IST`;
  const prefix = item.kind === 'series' ? `${item.days.length}-day series · ` : '';
  return (
    `<a href="/sessions/#${esc(item.anchor)}" class="dv2-rail-link">` +
    `<span class="dv2-rail-link-icon"><i class="fas ${item.kind === 'series' ? 'fa-layer-group' : 'fa-video'}" aria-hidden="true"></i></span>` +
    `<span class="dv2-trending-info"><strong>${esc(item.title)}</strong><small>${esc(prefix + when)}</small></span>` +
    `</a>`
  );
}

/** Wire the card. deps lets tests inject fetch, the sessions module and the clock. */
export async function mountUpcomingSessions(win = globalThis.window, doc = globalThis.document, deps = {}) {
  const list = doc.getElementById('dv2SessionsList');
  if (!list) return 0;
  if (win.matchMedia && !win.matchMedia(RAIL_QUERY).matches) return 0;
  try {
    const mod = deps.sessionsModule || (await import('/sessions/sessions.js'));
    const fetchImpl = deps.fetch || win.fetch.bind(win);
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
    let res;
    try {
      res = await fetchImpl(`${mod.resolveApiBase(win.location)}/api/sessions`, { headers: { accept: 'application/json' }, credentials: 'omit', signal: ctrl?.signal });
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (!res.ok) return 0;
    const now = deps.now ? deps.now() : new Date();
    const items = railItems(mod, await res.json(), now);
    if (!items.length) return 0;
    list.innerHTML = items.map((item) => railRowHtml(mod, item, now)).join('');
    list.hidden = false;
    return items.length;
  } catch {
    return 0;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const start = () => mountUpcomingSessions(window, document);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
