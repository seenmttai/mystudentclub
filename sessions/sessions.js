// Events & live sessions page: www.mystudentclub.com/sessions/ (Cloudflare Pages) and notify.mystudentclub.com/sessions/
// (msc-mail Worker; /events redirects there). Free webinars, pre-placement talks, doubt sessions, masterclasses and
// multi-day series (one card, one form, registered for every day). ?a=<audience> filters the list and preselects the form.
// index.html loads this file as <script type="module" src="/sessions/sessions.js"> (absolute, so it resolves the same with or
// without the trailing slash). The pure helpers are exported for site/test/sessions.test.js; init() only runs in a browser
// page that has the [data-msc-sessions] mount point. URLs and audience labels mirror spec/facts.json; the test fails on drift.
// No libraries, no trackers. localStorage holds only the chosen audience key, never a name, email or phone.
// Every registrant joins the MSC emails for their stage (founder decision, 30 Sep 2026): there is no marketing checkbox.

export const CONFIG = {
  // 'auto' = same origin when served from notify.* or a local dev host, else MAIL_HOST. Or a full origin, no trailing slash.
  // www always calls the Worker (its CORS allows www, the bare domain and localhost), so a local `npx serve` shows live events.
  API_BASE: 'https://notify.mystudentclub.com',
  // Cloudflare Turnstile site key. Empty = no widget. The Worker enforces it only when TURNSTILE_SECRET is set.
  TURNSTILE_SITE_KEY: '',
  MAIL_HOST: 'https://notify.mystudentclub.com',
  SITE: 'https://www.mystudentclub.com',
  YOUTUBE: 'https://www.youtube.com/@capadambhansali',
  LINKS_HUB: 'https://www.mystudentclub.com/links/',
  PRIVACY: 'https://www.mystudentclub.com/privacy-policy',
  CONTACT_EMAIL: 'contact@mystudentclub.com',
  SOURCE: 'sessions-page',
  // Stored with the consent record (email_consents.text_version): which version of this page someone registered on.
  CONSENT_VERSION: 'events-2026-10-01',
  STORAGE_KEY: 'msc_audience',
  FETCH_TIMEOUT_MS: 12000,
};

/** mail_sessions.kind → the label on the card. */
export const KINDS = {
  'free-webinar': 'Free webinar',
  'series-day': 'Series',
  'pre-placement-talk': 'Pre-placement talk',
  'doubt-session': 'Doubt session',
  masterclass: 'Masterclass',
};

/** Short chip labels for the ?a= filter (same keys and order as AUDIENCES). */
export const CHIP_LABELS = {
  'industrial-training': 'Industrial Training',
  articleship: 'Articleship',
  'ca-fresher': 'CA Freshers',
  'semi-qualified': 'Semi-Qualified',
  'experienced-ca': 'Experienced CAs',
  other: 'Others',
};

/** [key, label] in the order the "I am a" select shows them. Keys are identical to career_intakes.stage. */
export const AUDIENCES = [
  ['industrial-training', 'CA Industrial Training'],
  ['articleship', 'CA Articleship'],
  ['ca-fresher', 'CA Fresher'],
  ['semi-qualified', 'Semi-Qualified CA'],
  ['experienced-ca', 'Experienced CA'],
  ['other', 'Others'],
];

// Short forms people use in shared links (?a=it). Every target must be an audience key.
export const AUDIENCE_ALIASES = {
  it: 'industrial-training',
  industrial: 'industrial-training',
  fresher: 'ca-fresher',
  freshers: 'ca-fresher',
  semi: 'semi-qualified',
  experienced: 'experienced-ca',
  others: 'other',
};

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k); // Object.hasOwn is missing in older in-app browsers
const LABELS = Object.fromEntries(AUDIENCES);
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 330 * 60 * 1000; // India has no DST, so a fixed offset is exact.

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const isAudience = (a) => typeof a === 'string' && has(LABELS, a);

export const audienceLabel = (a) => (isAudience(a) ? LABELS[a] : 'Everyone');

/** ?a= value → audience key, or null. */
export function audienceFromParam(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  if (isAudience(v)) return v;
  return has(AUDIENCE_ALIASES, v) ? AUDIENCE_ALIASES[v] : null;
}

/** Preselected audience: ?a= wins, then what this browser chose last time, else none (the visitor picks). */
export function initialAudience({ search = '', storage = null } = {}) {
  let fromUrl = null;
  try {
    fromUrl = audienceFromParam(new URLSearchParams(search).get('a'));
  } catch {
    /* malformed query */
  }
  if (fromUrl) return fromUrl;
  const stored = storage ? storage.get(CONFIG.STORAGE_KEY) : null;
  return isAudience(stored) ? stored : null;
}

/** localStorage that never throws (private mode, blocked site data, thumbnail renderers). */
export function safeStorage(win) {
  let ls = null;
  try {
    ls = win && win.localStorage ? win.localStorage : null;
  } catch {
    ls = null;
  }
  return {
    get(key) {
      try {
        return ls ? ls.getItem(key) : null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        if (ls) ls.setItem(key, value);
      } catch {
        /* quota or blocked: the page works without it */
      }
    },
  };
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/** Where the API lives. Same origin on notify.* (and local dev hosts), else the mail host. */
export function resolveApiBase(loc, configured = CONFIG.API_BASE) {
  if (configured && configured !== 'auto') return String(configured).replace(/\/+$/, '');
  const host = String(loc?.hostname ?? '').toLowerCase();
  const sameOrigin = /^notify\./.test(host) || LOCAL_HOSTS.has(host) || host.endsWith('.localhost');
  return sameOrigin && loc?.origin && loc.origin !== 'null' ? loc.origin : CONFIG.MAIL_HOST;
}

function toDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toInt(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const pick = (o, ...keys) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};

/** One API row → the shape the page renders, or null when it is unusable. Tolerates snake_case and camelCase. */
export function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(pick(raw, 'id', 'slug') ?? '').trim();
  const title = String(pick(raw, 'title') ?? '').trim();
  const startsAt = toDate(pick(raw, 'starts_at', 'startsAt', 'start'));
  if (!id || !title || !startsAt) return null;

  let durationMin = toInt(pick(raw, 'duration_min', 'durationMin', 'duration'));
  let endsAt = toDate(pick(raw, 'ends_at', 'endsAt', 'end'));
  if (!durationMin && endsAt) durationMin = Math.round((endsAt - startsAt) / 60000);
  if (!durationMin || durationMin <= 0) durationMin = 90; // mail_sessions.duration_min default
  if (!endsAt || endsAt <= startsAt) endsAt = new Date(startsAt.getTime() + durationMin * 60000);

  const capacity = toInt(pick(raw, 'capacity'));
  let seatsLeft = toInt(pick(raw, 'seats_left', 'seatsLeft', 'seats_remaining', 'seatsRemaining'));
  const registered = toInt(pick(raw, 'registered', 'registered_count', 'registeredCount'));
  if (seatsLeft === null && capacity !== null && registered !== null) seatsLeft = capacity - registered;
  if (seatsLeft !== null) seatsLeft = Math.max(0, seatsLeft);
  const fullFlag = pick(raw, 'is_full', 'isFull', 'full');
  const openFlag = pick(raw, 'registration_open', 'registrationOpen');

  const slug = String(pick(raw, 'slug') ?? id);
  const kind = has(KINDS, String(raw.kind ?? '')) ? raw.kind : 'free-webinar';
  return {
    id,
    slug,
    anchor: `session-${slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'x'}`,
    title,
    kind,
    seriesId: raw.series_id ? String(raw.series_id) : null,
    seriesPosition: toInt(pick(raw, 'series_position', 'seriesPosition')),
    audience: isAudience(raw.audience) ? raw.audience : null,
    description: String(pick(raw, 'description') ?? '').trim(),
    startsAt,
    endsAt,
    durationMin,
    capacity,
    seatsLeft,
    full: fullFlag === true || seatsLeft === 0,
    registrationOpen: openFlag !== false,
  };
}

/** API payload ({sessions:[…]} | […] | {data:[…]}) → sessions that have not ended, soonest first. */
export function normalizeSessions(payload, now = new Date()) {
  const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.sessions) ? payload.sessions : Array.isArray(payload?.data) ? payload.data : [];
  const seen = new Set();
  const out = [];
  for (const raw of rows) {
    const s = normalizeSession(raw);
    if (!s || seen.has(s.id) || s.endsAt <= now) continue;
    seen.add(s.id);
    out.push(s);
  }
  // Two slugs can sanitise to the same anchor; element ids must stay unique.
  const anchors = new Set();
  for (const s of out.sort((a, b) => a.startsAt - b.startsAt || a.title.localeCompare(b.title))) {
    let a = s.anchor;
    for (let n = 2; anchors.has(a); n++) a = `${s.anchor}-${n}`;
    anchors.add(a);
    s.anchor = a;
  }
  return out;
}

/**
 * API payload .series → one entry per multi-day series with at least one day still to come:
 * { id, slug, anchor, kind: 'series', title, audience, description, days: [{ id, title, position, startsAt, endsAt,
 *   durationMin, done, seatsLeft, full }], openDays, startsAt (next day), endsAt (last day), full }.
 */
export function normalizeSeries(payload, now = new Date()) {
  const rows = Array.isArray(payload?.series) ? payload.series : [];
  const out = [];
  const seen = new Set();
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id ?? '').trim();
    const title = String(raw.title ?? '').trim();
    if (!id || !title || seen.has(id)) continue;
    const days = (Array.isArray(raw.days) ? raw.days : [])
      .map((d, i) => {
        const startsAt = toDate(pick(d, 'starts_at', 'startsAt'));
        if (!startsAt) return null;
        const durationMin = toInt(pick(d, 'duration_min', 'durationMin')) || 90;
        let endsAt = toDate(pick(d, 'ends_at', 'endsAt'));
        if (!endsAt || endsAt <= startsAt) endsAt = new Date(startsAt.getTime() + durationMin * 60000);
        const seatsLeft = toInt(pick(d, 'seats_left', 'seatsLeft'));
        return {
          id: String(d.id ?? ''),
          title: String(d.title ?? '').trim() || `Day ${i + 1}`,
          position: toInt(d.position) || i + 1,
          startsAt,
          endsAt,
          durationMin,
          done: d.done === true || startsAt <= now,
          seatsLeft: seatsLeft === null ? null : Math.max(0, seatsLeft),
          full: seatsLeft !== null && seatsLeft <= 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.startsAt - b.startsAt);
    const open = days.filter((d) => !d.done);
    if (!open.length) continue;
    seen.add(id);
    const slug = String(raw.slug ?? id);
    out.push({
      id,
      slug,
      anchor: `series-${slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'x'}`,
      kind: 'series',
      title,
      audience: isAudience(raw.audience) ? raw.audience : null,
      description: String(raw.description ?? '').trim(),
      days,
      openDays: open.filter((d) => !d.full).length,
      startsAt: open[0].startsAt,
      endsAt: days.at(-1).endsAt,
      full: open.every((d) => d.full),
      registrationOpen: true,
    });
  }
  return out;
}

/** One list for the page: series cards plus events that are not a day of a listed series, soonest first. */
export function buildItems(sessions, series = []) {
  const inSeries = new Set(series.map((s) => s.id));
  return [...series, ...sessions.filter((s) => !(s.seriesId && inSeries.has(s.seriesId)))].sort((a, b) => a.startsAt - b.startsAt || a.title.localeCompare(b.title));
}

/** The ?a= filter: events for that audience plus events for everyone. */
export function filterItems(items, audience) {
  return isAudience(audience) ? items.filter((x) => !x.audience || x.audience === audience) : items;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** Date → IST parts, e.g. {date: 'Mon, 5 Oct 2026', time: '7:00 pm', ymd: '2026-10-05'}. Independent of the device timezone. */
export function formatIst(date) {
  const d = new Date(date.getTime() + IST_OFFSET_MS);
  const h24 = d.getUTCHours();
  const h12 = h24 % 12 || 12;
  return {
    date: `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    time: `${h12}:${pad2(d.getUTCMinutes())} ${h24 < 12 ? 'am' : 'pm'}`,
    ymd: `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`,
  };
}

/** 'Live now' | 'Today' | 'Tomorrow' | null, by the IST calendar. */
export function whenLabel(session, now = new Date()) {
  if (session.startsAt <= now && now < session.endsAt) return 'Live now';
  const day = (d) => Math.floor((d.getTime() + IST_OFFSET_MS) / 86400000);
  const diff = day(session.startsAt) - day(now);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return null;
}

export function durationLabel(min) {
  if (min >= 60 && min % 60 === 0) return `${min / 60} hr${min === 60 ? '' : 's'}`;
  if (min > 60) return `${Math.floor(min / 60)} hr ${min % 60} min`;
  return `${min} min`;
}

export function seatsLabel(session) {
  if (session.full) return 'Full';
  if (session.seatsLeft === null) return '';
  return `${session.seatsLeft} seat${session.seatsLeft === 1 ? '' : 's'} left`;
}

/** 'asha.k@example.com' → 'a•••@example.com' (shown on the success panel; never logged). */
export function maskEmail(email) {
  const [user, domain] = String(email ?? '').split('@');
  if (!user || !domain) return '';
  return `${user[0]}•••@${domain}`;
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;
// Same rules as validateRegistration() in worker/src/sessions.js, so the visitor hears about a problem before sending.
const URLISH_RE = /(:\/\/|www\.|@|\.(com|in|net|org|info|xyz|ru|io|co|biz|top|link)\b)/i;
const INDIAN_MOBILE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;

const FIELD_MESSAGES = {
  name: 'Please enter your name (2 to 80 letters).',
  email: 'Please enter a valid email address.',
  phone: 'Please enter a 10-digit Indian mobile number, or leave it empty.',
  audience: 'Please choose the option that fits you best.',
};
const FIELDS = Object.keys(FIELD_MESSAGES);

/** Form values → {ok, errors: {field: message}, values: cleaned}. */
export function validateRegistration(input) {
  const name = String(input?.name ?? '').replace(/\s+/g, ' ').trim();
  const email = String(input?.email ?? '').trim();
  const phoneRaw = String(input?.phone ?? '').trim();
  const phone = phoneRaw.replace(/[\s().-]/g, '');
  const audience = String(input?.audience ?? '');
  const errors = {};
  if (name.length < 2 || name.length > 80 || !/\p{L}/u.test(name) || URLISH_RE.test(name)) errors.name = FIELD_MESSAGES.name;
  if (email.length > 254 || !EMAIL_RE.test(email)) errors.email = FIELD_MESSAGES.email;
  if (phoneRaw && !INDIAN_MOBILE_RE.test(phone)) errors.phone = FIELD_MESSAGES.phone;
  if (!isAudience(audience)) errors.audience = FIELD_MESSAGES.audience;
  return {
    ok: Object.keys(errors).length === 0,
    errors,
    values: { name, email, phone: phoneRaw ? phone : '', audience },
  };
}

/**
 * Cleaned values → POST /api/sessions/:id/register (or /api/sessions/series/:id/register) JSON body
 * (worker/src/sessions.js validateRegistration). consent_version names the page version for the consent log.
 */
export function buildRegisterBody(values, turnstileToken = '') {
  const body = {
    name: values.name,
    email: values.email,
    phone: values.phone || null,
    audience: values.audience,
    consent_version: CONFIG.CONSENT_VERSION,
    source: CONFIG.SOURCE,
  };
  if (turnstileToken) body.turnstile_token = turnstileToken;
  return body;
}

/**
 * HTTP status + parsed JSON → what the page should show. Tolerant of {ok, error|code|status|reason, message, field}.
 * The Worker's own message wins when it sends one (its messages are written for visitors).
 */
export function interpretRegisterResponse(status, body) {
  const b = body && typeof body === 'object' ? body : {};
  const code = [b.code, b.error, b.reason, typeof b.status === 'string' ? b.status : null]
    .filter((v) => typeof v === 'string' && v)
    .join(' ')
    .toLowerCase();
  const human = typeof b.message === 'string' && b.message.trim() ? b.message.trim() : null;
  const duplicate = b.duplicate === true || b.already_registered === true || b.alreadyRegistered === true || /already|duplicate/.test(code);
  const full = b.full === true || /\b(full|session[ _-]?full|capacity[ _-]?reached|sold[ _-]?out|no[ _-]?seats)\b/.test(code);

  const delayed = b.email_delayed === true;
  // A series registration can skip days that are full; the Worker names them.
  const extra = Array.isArray(b.full_days) && b.full_days.length ? { fullDays: b.full_days.map((d) => String(d)) } : {};

  if (status >= 200 && status < 300 && b.ok !== false) return { ok: true, kind: duplicate ? 'duplicate' : 'registered', delayed, ...extra };
  if (duplicate) return { ok: true, kind: 'duplicate', delayed };
  if (full) return { ok: false, kind: 'full', message: human || 'Sorry, this session is full.' };
  if (status === 409) return { ok: true, kind: 'duplicate', delayed }; // Conflict on (session_id, email) = already registered
  if (status === 404 || status === 410 || /closed|not.?found|past|ended|unpublished/.test(code)) {
    return { ok: false, kind: 'closed', message: human || 'Registration for this session has closed.' };
  }
  if (status === 429 || /rate|too.?many/.test(code)) {
    return { ok: false, kind: 'rate', message: human || 'Too many attempts from this device. Please wait a few minutes and try again.' };
  }
  if (/turnstile|captcha|challenge|bot/.test(code) || (status === 403 && !code)) {
    return { ok: false, kind: 'captcha', message: human || 'The security check did not pass. Please try again.' };
  }
  if (status === 400 || status === 422 || /invalid|required|missing/.test(code)) {
    const field = FIELDS.includes(b.field) ? b.field : FIELDS.find((f) => code.includes(f)) || null;
    return { ok: false, kind: 'invalid', field, message: human || (field ? FIELD_MESSAGES[field] : 'Please check your details and try again.') };
  }
  return { ok: false, kind: 'server', message: human || 'Something went wrong on our side. Please try again in a minute.' };
}

async function withTimeout(fetchImpl, url, init, ms) {
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  try {
    return await fetchImpl(url, ctrl ? { ...init, signal: ctrl.signal } : init);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** GET /api/sessions → {ok, sessions, series} | {ok: false, error}. */
export async function fetchSessions(fetchImpl, apiBase, { now = new Date(), timeoutMs = CONFIG.FETCH_TIMEOUT_MS } = {}) {
  try {
    const res = await withTimeout(fetchImpl, `${apiBase}/api/sessions`, { headers: { accept: 'application/json' }, credentials: 'omit' }, timeoutMs);
    if (!res.ok) return { ok: false, error: `http ${res.status}` };
    const payload = await res.json();
    return { ok: true, sessions: normalizeSessions(payload, now), series: normalizeSeries(payload, now) };
  } catch (e) {
    return { ok: false, error: e?.name === 'AbortError' ? 'timeout' : 'network' };
  }
}

/** POST /api/sessions/:id/register → interpretRegisterResponse() result, or a network failure. */
export function registerForSession(fetchImpl, apiBase, sessionId, body, opts = {}) {
  return postRegistration(fetchImpl, `${apiBase}/api/sessions/${encodeURIComponent(sessionId)}/register`, body, opts);
}

/** POST /api/sessions/series/:id/register: every upcoming day of the series in one go. */
export function registerForSeries(fetchImpl, apiBase, seriesId, body, opts = {}) {
  return postRegistration(fetchImpl, `${apiBase}/api/sessions/series/${encodeURIComponent(seriesId)}/register`, body, opts);
}

async function postRegistration(fetchImpl, url, body, { timeoutMs = CONFIG.FETCH_TIMEOUT_MS } = {}) {
  let res;
  try {
    res = await withTimeout(
      fetchImpl,
      url,
      { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body), credentials: 'omit' },
      timeoutMs,
    );
  } catch {
    return { ok: false, kind: 'network', message: 'We could not reach the server. Check your connection and try again.' };
  }
  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return interpretRegisterResponse(res.status, parsed);
}

// ---------- HTML rendering (strings; every dynamic value goes through esc) ----------

const ICONS = {
  calendar:
    '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/></svg>',
  clock: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  check: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>',
  play: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/></svg>',
  layers: '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 9 5-9 5-9-5 9-5z"/><path d="m3 13 9 5 9-5"/></svg>',
};

function paragraphs(text) {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function audienceOptions(selected) {
  const opts = [`<option value=""${selected ? '' : ' selected'} disabled>Choose one</option>`];
  for (const [key, label] of AUDIENCES) opts.push(`<option value="${esc(key)}"${key === selected ? ' selected' : ''}>${esc(label)}</option>`);
  return opts.join('');
}

// labelHtml is static markup from this file, never user data.
function field(p, name, labelHtml, input) {
  return (
    `<div class="field field-${name}">` +
    `<label for="${p}-${name}">${labelHtml}</label>` +
    input.replace('%ARIA%', `aria-describedby="${p}-${name}-err"`) +
    `<p class="field-error" id="${p}-${name}-err" hidden></p>` +
    `</div>`
  );
}

/** "Register for all 3 days" for a series with several open days, else "Register". */
export function submitLabel(item) {
  return item?.kind === 'series' && item.openDays > 1 ? `Register for all ${item.openDays} days` : 'Register';
}

/** Registration form for item i (an event or a series). audience = the visitor's preselected audience (?a= or last choice). */
export function renderForm(session, i, { audience = null, hidden = false, turnstile = false } = {}) {
  const p = `s${i}`;
  const selected = isAudience(audience) ? audience : null;
  const isSeries = session?.kind === 'series';
  return (
    `<form class="reg" id="${p}-form" data-session-index="${i}" novalidate${hidden ? ' hidden' : ''} aria-labelledby="${p}-form-title">` +
    `<h4 class="reg-title" id="${p}-form-title">${isSeries ? (session.openDays > 1 ? `Register once for all ${session.openDays} days` : 'Register for the series') : 'Register for this event'}</h4>` +
    `<div class="grid">` +
    field(p, 'name', 'Full name', `<input id="${p}-name" name="name" type="text" autocomplete="name" maxlength="80" required %ARIA%>`) +
    field(p, 'email', 'Email', `<input id="${p}-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" spellcheck="false" required %ARIA%>`) +
    field(p, 'phone', 'Phone <span class="optional">(optional)</span>', `<input id="${p}-phone" name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="20" %ARIA%>`) +
    field(p, 'audience', 'I am a', `<select id="${p}-audience" name="audience" required %ARIA%>${audienceOptions(selected)}</select>`) +
    `</div>` +
    (turnstile ? `<div class="turnstile" id="${p}-turnstile"></div>` : '') +
    `<button type="submit" class="btn btn-primary btn-block">${esc(submitLabel(session))}</button>` +
    `<div class="result" id="${p}-result" role="status" aria-live="polite"></div>` +
    `</form>`
  );
}

/** One session card. opts.expanded shows the form right away; otherwise a Register button reveals it. */
export function renderSessionCard(session, i, { now = new Date(), audience = null, expanded = false, turnstile = false } = {}) {
  const p = `s${i}`;
  const ist = formatIst(session.startsAt);
  const chip = whenLabel(session, now);
  const seats = seatsLabel(session);
  const badgeClass = session.audience ? `badge badge-${session.audience}` : 'badge badge-everyone';
  const kind = session.kind && session.kind !== 'free-webinar' && has(KINDS, session.kind) ? KINDS[session.kind] : null;
  let action;
  if (session.full) {
    action = `<p class="closed">This session is full. <a href="${esc(CONFIG.YOUTUBE)}">Watch past sessions on YouTube</a>.</p>`;
  } else if (!session.registrationOpen) {
    action = `<p class="closed">Registration for this session has closed. <a href="${esc(CONFIG.YOUTUBE)}">Watch past sessions on YouTube</a>.</p>`;
  } else {
    action =
      (expanded ? '' : `<button type="button" class="btn btn-primary" data-action="expand" aria-expanded="false" aria-controls="${p}-form">Register</button>`) +
      renderForm(session, i, { audience, hidden: !expanded, turnstile });
  }
  return (
    `<article class="session" id="${esc(session.anchor)}" aria-labelledby="${p}-title">` +
    `<div class="session-top">` +
    `<span class="${esc(badgeClass)}">${esc(audienceLabel(session.audience))}</span>` +
    (kind ? `<span class="kind">${esc(kind)}</span>` : '') +
    (chip ? `<span class="chip${chip === 'Live now' ? ' chip-live' : ''}">${esc(chip)}</span>` : '') +
    (seats ? `<span class="seats${session.full ? ' seats-full' : ''}">${esc(seats)}</span>` : '') +
    `</div>` +
    `<h3 class="session-title" id="${p}-title">${esc(session.title)}</h3>` +
    `<p class="when">${ICONS.calendar}<time datetime="${esc(session.startsAt.toISOString())}">${esc(ist.date)} · ${esc(ist.time)} IST</time>` +
    `<span class="dur">${ICONS.clock}${esc(durationLabel(session.durationMin))}</span></p>` +
    (session.description ? `<div class="desc">${paragraphs(session.description)}</div>` : '') +
    `<div class="action">${action}</div>` +
    `</article>`
  );
}

/** One card for a multi-day series: every day listed (done days struck through), one form for all open days. */
export function renderSeriesCard(series, i, { now = new Date(), audience = null, expanded = false, turnstile = false } = {}) {
  const p = `s${i}`;
  const badgeClass = series.audience ? `badge badge-${series.audience}` : 'badge badge-everyone';
  const next = series.days.find((d) => !d.done);
  const chip = next ? whenLabel(next, now) : null;
  const days = series.days
    .map((d) => {
      const ist = formatIst(d.startsAt);
      const state = d.done ? '<span class="day-state">Done</span>' : d.full ? '<span class="day-state">Full</span>' : '';
      return (
        `<li class="day${d.done ? ' day-done' : ''}">` +
        `<span class="day-n">Day ${esc(d.position)}</span>` +
        `<span class="day-body"><span class="day-title">${esc(d.title)}</span>` +
        `<time datetime="${esc(d.startsAt.toISOString())}">${esc(ist.date)} · ${esc(ist.time)} IST</time>` +
        `<span class="dur">${esc(durationLabel(d.durationMin))}</span></span>${state}</li>`
      );
    })
    .join('');
  let action;
  if (series.full) {
    action = `<p class="closed">This series is full. <a href="${esc(CONFIG.YOUTUBE)}">Watch past sessions on YouTube</a>.</p>`;
  } else {
    action =
      (expanded ? '' : `<button type="button" class="btn btn-primary" data-action="expand" aria-expanded="false" aria-controls="${p}-form">${esc(submitLabel(series))}</button>`) +
      renderForm(series, i, { audience, hidden: !expanded, turnstile });
  }
  const count = series.days.length;
  return (
    `<article class="session session-series" id="${esc(series.anchor)}" aria-labelledby="${p}-title">` +
    `<div class="session-top">` +
    `<span class="${esc(badgeClass)}">${esc(audienceLabel(series.audience))}</span>` +
    `<span class="kind">${ICONS.layers}Series · ${esc(count)} ${count === 1 ? 'day' : 'days'}</span>` +
    (chip ? `<span class="chip${chip === 'Live now' ? ' chip-live' : ''}">${esc(chip)}</span>` : '') +
    `</div>` +
    `<h3 class="session-title" id="${p}-title">${esc(series.title)}</h3>` +
    (series.description ? `<div class="desc">${paragraphs(series.description)}</div>` : '') +
    `<ol class="days" aria-label="Days of this series">${days}</ol>` +
    `<div class="action">${action}</div>` +
    `</article>`
  );
}

/** All cards (events and series). A single item, or the one named in the URL hash, opens with its form already showing. */
export function renderList(items, { now = new Date(), audience = null, hash = '', turnstile = false } = {}) {
  const target = String(hash || '').replace(/^#/, '');
  return items
    .map((s, i) => {
      const expanded = items.length === 1 || target === s.anchor || target === s.slug;
      return s.kind === 'series'
        ? renderSeriesCard(s, i, { now, audience, expanded, turnstile })
        : renderSessionCard(s, i, { now, audience, expanded, turnstile });
    })
    .join('');
}

/** The ?a= chips: "All events" plus one per audience; the current one carries aria-current. */
export function renderChips(current = null) {
  const chip = (key, label) =>
    `<a class="filter" href="${key ? `?a=${esc(key)}` : '?'}" data-audience="${esc(key)}"${(current || '') === key ? ' aria-current="true"' : ''}>${esc(label)}</a>`;
  return chip('', 'All events') + AUDIENCES.map(([key]) => chip(key, CHIP_LABELS[key])).join('');
}

export function renderFilteredEmpty(audience) {
  return (
    `<div class="state state-empty">` +
    `<div class="state-icon-wrap state-icon-empty"><i class="fas fa-filter"></i></div>` +
    `<span class="state-badge"><span class="badge-dot"></span> Stage Filter</span>` +
    `<p class="state-title">No upcoming event for ${esc(CHIP_LABELS[audience] || audienceLabel(audience))} right now</p>` +
    `<p class="state-text">New live sessions and workshops are added regularly. You can reset your filter to view all events, or watch 100+ past sessions on YouTube.</p>` +
    `<div class="actions">` +
    `<a class="btn btn-primary" href="?" data-audience=""><i class="fas fa-layer-group"></i> See all events</a>` +
    `<a class="btn btn-youtube" href="${esc(CONFIG.YOUTUBE)}" target="_blank" rel="noopener"><i class="fab fa-youtube"></i> Watch on YouTube</a>` +
    `</div>` +
    `</div>`
  );
}

function fallbackLinks() {
  return (
    `<div class="actions">` +
    `<a class="btn btn-youtube" href="${esc(CONFIG.YOUTUBE)}" target="_blank" rel="noopener"><i class="fab fa-youtube"></i> Watch on YouTube</a>` +
    `<a class="btn btn-secondary" href="${esc(CONFIG.LINKS_HUB)}"><i class="fas fa-arrow-up-right-from-square"></i> All MSC links</a>` +
    `</div>`
  );
}

export function renderEmpty() {
  return (
    `<div class="state state-empty">` +
    `<div class="state-icon-wrap state-icon-empty"><i class="fas fa-calendar-check"></i></div>` +
    `<span class="state-badge"><span class="badge-dot"></span> Schedule Update</span>` +
    `<p class="state-title">No live session is scheduled right now</p>` +
    `<p class="state-text">We're lining up our next free Big 4 masterclasses and guest webinars. Meanwhile, catch over 100+ past session recordings on YouTube or find every MSC group on the <a href="${esc(CONFIG.LINKS_HUB)}">MSC links page</a>.</p>` +
    fallbackLinks() +
    `<div class="state-footer-note"><i class="fas fa-bell"></i> New dates drop weekly · Calendar invites sent directly on registration</div>` +
    `</div>`
  );
}

export function renderError() {
  return (
    `<div class="state state-error">` +
    `<div class="state-icon-wrap"><i class="fas fa-satellite-dish"></i></div>` +
    `<span class="state-badge state-badge-sync"><span class="badge-dot pulse"></span> Live Schedule Sync</span>` +
    `<p class="state-title">We couldn't connect to the live schedule right now</p>` +
    `<p class="state-text">Our events feed is momentarily taking longer to respond. Tap <strong>Try again</strong> below to reconnect, or explore 100+ recorded masterclasses and interview sessions on YouTube.</p>` +
    `<div class="actions">` +
    `<button type="button" class="btn btn-primary" data-action="retry"><i class="fas fa-rotate-right"></i> Try again</button>` +
    `<a class="btn btn-youtube" href="${esc(CONFIG.YOUTUBE)}" target="_blank" rel="noopener"><i class="fab fa-youtube"></i> Watch on YouTube</a>` +
    `<a class="btn btn-secondary" href="${esc(CONFIG.LINKS_HUB)}">All MSC links</a>` +
    `</div>` +
    `<div class="state-footer-note"><i class="fas fa-shield-halved"></i> 100% Free · No sign-up fees · Never any charges for sessions</div>` +
    `</div>`
  );
}

export function renderLoading() {
  return `<div class="skeleton" aria-hidden="true"><div></div><div></div></div><p class="visually-hidden">Loading sessions…</p>`;
}

export function renderSuccess(kind, email, { delayed = false, fullDays = [], series = null } = {}) {
  const masked = maskEmail(email);
  const days = series && series.openDays > 1 ? ` for all ${series.openDays} days` : '';
  const title = kind === 'duplicate' ? `You're already registered${days}` : `You're registered${days}`;
  return (
    `<div class="success" tabindex="-1">` +
    `<p class="success-title">${ICONS.check}${title}</p>` +
    `<p>Check your inbox for the calendar invite${masked ? ` (sent to <strong>${esc(masked)}</strong>)` : ''}.</p>` +
    (fullDays.length ? `<p>${esc(fullDays.join(', '))} ${fullDays.length === 1 ? 'is' : 'are'} full, so you're registered for the other days.</p>` : '') +
    (delayed ? `<p>Our mail is running a little late today; it will reach you within a few minutes.</p>` : '') +
    `<p class="muted">Not there in 5 minutes? Look in Spam or Promotions, or write to <a href="mailto:${esc(CONFIG.CONTACT_EMAIL)}">${esc(CONFIG.CONTACT_EMAIL)}</a>.</p>` +
    `</div>`
  );
}

// ---------- Browser glue ----------

let turnstileLoad = null;
function loadTurnstile(doc, win) {
  if (win.turnstile) return Promise.resolve(win.turnstile);
  if (!turnstileLoad) {
    turnstileLoad = new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => (win.turnstile ? resolve(win.turnstile) : reject(new Error('turnstile missing')));
      s.onerror = () => reject(new Error('turnstile failed to load'));
      doc.head.appendChild(s);
    });
  }
  return turnstileLoad;
}

/** Wire the page. deps lets a test inject fetch/now. */
export function init(win = globalThis.window, doc = globalThis.document, deps = {}) {
  const root = doc.querySelector('[data-msc-sessions]');
  if (!root) return null;
  const filters = doc.querySelector('[data-msc-filters]');
  const status = doc.getElementById('sessions-status');
  const fetchImpl = deps.fetch || win.fetch.bind(win);
  const now = () => (deps.now ? deps.now() : new Date());
  const storage = safeStorage(win);
  const apiBase = resolveApiBase(win.location);
  const useTurnstile = Boolean(CONFIG.TURNSTILE_SITE_KEY);
  const widgets = new Map();
  let sessions = []; // the rendered items: events and series cards
  let all = [];
  let filter = null;
  try {
    filter = audienceFromParam(new URLSearchParams(win.location.search).get('a'));
  } catch {
    filter = null;
  }

  const announce = (text) => {
    if (status) status.textContent = text;
  };

  async function mountTurnstile(form) {
    if (!useTurnstile || widgets.has(form.id)) return;
    const box = form.querySelector('.turnstile');
    if (!box) return;
    widgets.set(form.id, null);
    try {
      const ts = await loadTurnstile(doc, win);
      widgets.set(form.id, ts.render(box, { sitekey: CONFIG.TURNSTILE_SITE_KEY, action: 'session-register' }));
    } catch {
      widgets.delete(form.id); // the Worker decides; without a secret it ignores the token
    }
  }

  function paint() {
    if (filters) filters.innerHTML = renderChips(filter);
    const audience = filter || initialAudience({ search: win.location.search, storage });
    widgets.clear();
    if (all.length === 0) {
      sessions = [];
      root.innerHTML = renderEmpty();
      announce('No live event is scheduled right now.');
      return false;
    }
    sessions = filterItems(all, filter);
    if (sessions.length === 0) {
      root.innerHTML = renderFilteredEmpty(filter);
      announce('No event for this group right now.');
      return false;
    }
    root.innerHTML = renderList(sessions, { now: now(), audience, hash: win.location.hash, turnstile: useTurnstile });
    announce(`${sessions.length} upcoming event${sessions.length === 1 ? '' : 's'}.`);
    root.querySelectorAll('form.reg:not([hidden])').forEach(mountTurnstile);
    return true;
  }

  function setFilter(key) {
    filter = isAudience(key) ? key : null;
    try {
      const url = new URL(win.location.href);
      if (filter) url.searchParams.set('a', filter);
      else url.searchParams.delete('a');
      win.history?.replaceState?.(null, '', url.pathname + url.search + url.hash);
    } catch {
      /* the list still filters */
    }
    if (filter) storage.set(CONFIG.STORAGE_KEY, filter);
    paint();
  }

  if (filters) {
    filters.addEventListener('click', (e) => {
      const a = e.target.closest('[data-audience]');
      if (!a) return;
      e.preventDefault();
      setFilter(a.getAttribute('data-audience'));
    });
  }

  async function load() {
    root.setAttribute('aria-busy', 'true');
    root.innerHTML = renderLoading();
    const res = await fetchSessions(fetchImpl, apiBase, { now: now() });
    if (!res.ok) {
      sessions = [];
      all = [];
      if (filters) filters.innerHTML = '';
      root.innerHTML = renderError();
      announce("We couldn't load the events right now.");
    } else {
      all = buildItems(res.sessions, res.series ?? []);
      if (paint()) {
        let target = null;
        try {
          target = win.location.hash ? doc.getElementById(decodeURIComponent(win.location.hash.slice(1))) : null;
        } catch {
          target = null;
        }
        if (target && root.contains(target)) target.scrollIntoView();
      }
    }
    root.setAttribute('aria-busy', 'false');
  }

  function setFieldError(form, name, message) {
    const input = form.elements.namedItem(name);
    const err = doc.getElementById(`${form.id.replace(/-form$/, '')}-${name}-err`);
    if (input) {
      if (message) input.setAttribute('aria-invalid', 'true');
      else input.removeAttribute('aria-invalid');
    }
    if (err) {
      err.textContent = message || '';
      err.hidden = !message;
    }
  }

  function showResult(form, message, tone) {
    const box = form.querySelector('.result');
    if (!box) return;
    box.className = `result${tone ? ` result-${tone}` : ''}`;
    box.textContent = message || '';
  }

  root.addEventListener('click', (e) => {
    const link = e.target.closest('[data-audience]');
    if (link && root.contains(link)) {
      e.preventDefault();
      setFilter(link.getAttribute('data-audience'));
      return;
    }
    const btn = e.target.closest('[data-action]');
    if (!btn || !root.contains(btn)) return;
    if (btn.dataset.action === 'retry') {
      load();
    } else if (btn.dataset.action === 'expand') {
      const form = doc.getElementById(btn.getAttribute('aria-controls'));
      if (!form) return;
      form.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      btn.hidden = true;
      mountTurnstile(form);
      form.querySelector('input[name="name"]')?.focus();
    }
  });

  root.addEventListener('submit', async (e) => {
    const form = e.target.closest('form.reg');
    if (!form) return;
    e.preventDefault();
    if (form.dataset.busy === '1') return;
    const session = sessions[Number(form.dataset.sessionIndex)];
    if (!session) return;

    const el = form.elements;
    const v = validateRegistration({
      name: el.namedItem('name')?.value,
      email: el.namedItem('email')?.value,
      phone: el.namedItem('phone')?.value,
      audience: el.namedItem('audience')?.value,
    });
    for (const name of FIELDS) setFieldError(form, name, v.errors[name]);
    if (!v.ok) {
      showResult(form, 'Please fix the highlighted fields.', 'error');
      el.namedItem(Object.keys(v.errors)[0])?.focus();
      return;
    }

    let token = '';
    const widgetId = widgets.get(form.id);
    const hasWidget = useTurnstile && widgetId !== undefined && widgetId !== null && win.turnstile;
    if (hasWidget) {
      token = win.turnstile.getResponse(widgetId) || '';
      if (!token) {
        showResult(form, 'Please complete the security check above the button.', 'error');
        return;
      }
    }

    const button = form.querySelector('button[type="submit"]');
    form.dataset.busy = '1';
    form.setAttribute('aria-busy', 'true');
    if (button) {
      button.disabled = true;
      button.textContent = 'Registering…';
    }
    showResult(form, '', null);

    const body = buildRegisterBody(v.values, token);
    const isSeries = session.kind === 'series';
    const r = isSeries ? await registerForSeries(fetchImpl, apiBase, session.id, body) : await registerForSession(fetchImpl, apiBase, session.id, body);

    form.dataset.busy = '';
    form.removeAttribute('aria-busy');
    if (r.ok) {
      storage.set(CONFIG.STORAGE_KEY, v.values.audience);
      const wrap = doc.createElement('div');
      wrap.innerHTML = renderSuccess(r.kind, v.values.email, { delayed: r.delayed, fullDays: r.fullDays ?? [], series: isSeries ? session : null });
      const panel = wrap.firstElementChild;
      form.replaceWith(panel);
      panel.focus();
      announce(r.kind === 'duplicate' ? `You're already registered for ${session.title}.` : `You're registered for ${session.title}.`);
      return;
    }
    if (button) {
      button.disabled = r.kind === 'full' || r.kind === 'closed';
      button.textContent = submitLabel(session);
    }
    if (r.field) {
      setFieldError(form, r.field, r.message);
      el.namedItem(r.field)?.focus();
    }
    showResult(form, r.message, 'error');
    if (hasWidget) win.turnstile.reset(widgetId);
  });

  load();
  return { reload: load };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined' && document.querySelector('[data-msc-sessions]')) {
  init(window, document);
}
