// Pure, DOM-free helpers for the CS / CMA job portal.
// Everything here is unit-tested in tests/pro-portal-core.test.cjs, so keep it
// free of browser globals (window, document, localStorage).

// Table name <-> URL slug, matching the CA portal and /jobs/<slug>/ pages.
export const TABLE_SLUGS = {
    'Industrial Training Job Portal': 'industrial',
    'Articleship Jobs': 'articleship',
    'Semi Qualified Jobs': 'semi-qualified',
    'Fresher Jobs': 'fresher'
};
export const SLUG_TABLES = Object.fromEntries(Object.entries(TABLE_SLUGS).map(([t, s]) => [s, t]));

// Same expiry rule as scripts/date-utils.js (JOB_EXPIRATION_DAYS).
export const LIKELY_CLOSED_DAYS = 15;

const DAY_MS = 24 * 60 * 60 * 1000;

export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Only http(s) links may be rendered as hrefs; anything else (javascript:,
// data:, relative junk) is dropped.
export function safeHttpUrl(value) {
    const raw = String(value ?? '').trim();
    if (!/^https?:\/\//i.test(raw)) return null;
    try {
        const url = new URL(raw);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch (_) {
        return null;
    }
}

// Keeps letters, digits, spaces and a few symbols that appear in company names
// and domains (M&A, S&P, Ind-AS, CA/CS). Everything that has meaning in a
// PostgREST filter string (commas, parentheses, quotes, backslashes, wildcards)
// is removed, so a typed term can never change the shape of the query.
export function sanitizeTerm(raw) {
    return String(raw ?? '')
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}&+/.\- ]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
}

// "tax, audit , big 4" -> ["tax", "audit", "big 4"]. Commas separate terms,
// each term must match somewhere in the listing (AND across terms).
export function parseSearch(raw) {
    const seen = new Set();
    const terms = [];
    for (const part of String(raw ?? '').split(',')) {
        const term = sanitizeTerm(part);
        const key = term.toLowerCase();
        if (term.length >= 2 && !seen.has(key)) {
            seen.add(key);
            terms.push(term);
        }
        if (terms.length === 5) break;
    }
    return terms;
}

// Builds one PostgREST or() group: the term may appear in any of the columns.
// Spaces become wildcards so "phone pe" also finds "PhonePe".
export function termOrFilter(term, columns) {
    const clean = sanitizeTerm(term);
    if (!clean) return '';
    const pattern = `*${clean.replace(/ /g, '*')}*`;
    return columns
        .map(col => `${col.includes(' ') ? `"${col}"` : col}.ilike."${pattern}"`)
        .join(',');
}

// `aliases` maps a city label to every spelling seen in listings
// (Bengaluru/Bangalore, Gurugram/Gurgaon), so one tick finds all of them.
export function locationOrFilter(locations, aliases = {}) {
    const terms = new Set();
    for (const label of locations || []) {
        for (const spelling of aliases[label] || [label]) {
            const clean = sanitizeTerm(spelling);
            if (clean) terms.add(clean);
        }
    }
    return Array.from(terms).map(term => `Location.ilike."*${term}*"`).join(',');
}

// Joins regex alternatives into one alternation.
export function anyOf(patterns) {
    const list = (patterns || []).filter(Boolean);
    if (list.length === 0) return '';
    return list.length === 1 ? list[0] : `(${list.join('|')})`;
}

// Patterns are written for PostgreSQL (ARE). The only PostgreSQL-specific
// escapes they use are word boundaries: \m (start of word), \M (end of word)
// and \y (either). Everything else means the same in JavaScript.
export function pgToJs(pattern) {
    return String(pattern).replace(/\\([mMy])/g, (_, kind) => (kind === 'm' ? '\\b(?=\\w)' : kind === 'M' ? '\\b(?<=\\w)' : '\\b'));
}

const regexCache = new Map();
export function toRegExp(pattern) {
    if (!pattern) return null;
    if (!regexCache.has(pattern)) regexCache.set(pattern, new RegExp(pgToJs(pattern), 'is'));
    return regexCache.get(pattern);
}

export function matchesPattern(text, pattern) {
    const re = toRegExp(pattern);
    return Boolean(re && re.test(String(text ?? '')));
}

// A course match is { pre, pos, neg }: the gate and the positive pattern must
// match and the negative must not. A plain string is treated as { pos }.
export function courseMatches(text, match) {
    const m = typeof match === 'string' ? { pos: match } : (match || {});
    if (!m.pos) return false;
    if (m.pre && !matchesPattern(text, m.pre)) return false;
    if (!matchesPattern(text, m.pos)) return false;
    return !(m.neg && matchesPattern(text, m.neg));
}

// Which qualifications does a listing say it is open to?
// `patterns` is QUAL_PATTERNS from config: { CA: {...}, CS: {...}, CMA: {...} }.
export function detectQualifications(text, patterns) {
    return Object.entries(patterns || {}).filter(([, match]) => courseMatches(text, match)).map(([code]) => code);
}

// Hides contact details in public descriptions; the full text is unlocked by
// the BrowserGuard worker after sign-in (same rule as the CA portal).
export function maskContacts(text) {
    return String(text ?? '')
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email hidden]')
        .replace(/\b(?:https?:\/\/|www\.)[^\s)]+/gi, '[link hidden]')
        .replace(/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '[phone hidden]');
}

export function stripMarkdown(text) {
    return String(text ?? '').replace(/[#*_`\[\]]/g, '').replace(/\r\n?/g, '\n').trim();
}

export function truncate(text, max) {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return `${lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut}…`;
}

export function isPayDisclosed(value) {
    if (value === null || value === undefined) return false;
    const clean = String(value).replace(/[₹\s\-.]/g, '').toLowerCase();
    return clean !== '' && clean !== '0' && !['notdisclosed', 'nil', 'null', 'na', 'n/a', 'undisclosed'].includes(clean);
}

function formatRupees(amount) {
    return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

function formatLpa(amount) {
    const lakhs = amount / 100000;
    const text = Number.isInteger(lakhs) ? String(lakhs) : lakhs.toFixed(1).replace(/\.0$/, '');
    return `₹${text} LPA`;
}

// Upper bounds for a believable Salary value. Hirer posts sometimes store a
// typed range as one number ("10000-25000" -> 1000025000), so anything above
// these is treated as "not stated" and kept out of pay filters and sorting.
export const MAX_PLAUSIBLE_PAY = { stipend: 200000, salary: 50000000 };

// Training lanes store a monthly stipend in Salary; job lanes store annual CTC.
// The free-text range columns win when present because they carry the unit.
export function formatPay(job, payKind) {
    const rangeColumn = payKind === 'stipend' ? 'Stipend Range' : 'CTC Range';
    const range = job?.[rangeColumn];
    if (isPayDisclosed(range)) {
        const text = String(range).trim();
        return /^\d/.test(text) ? `₹${text}` : text;
    }
    const amount = Number(job?.Salary);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (amount > (MAX_PLAUSIBLE_PAY[payKind] || MAX_PLAUSIBLE_PAY.salary)) return null;
    if (payKind === 'stipend') {
        return amount >= 100000 ? `${formatLpa(amount)}` : `${formatRupees(amount)} / month`;
    }
    return amount >= 100000 ? formatLpa(amount) : `${formatRupees(amount)} / month`;
}

export function daysSince(iso, now = Date.now()) {
    const time = new Date(iso).getTime();
    if (!Number.isFinite(time)) return null;
    return Math.max(0, Math.floor((now - time) / DAY_MS));
}

export function timeAgo(iso, now = Date.now()) {
    const days = daysSince(iso, now);
    if (days === null) return '';
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 14) return `${days} days ago`;
    if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
    return `${Math.floor(days / 30)} months ago`;
}

export function isLikelyClosed(iso, now = Date.now()) {
    const days = daysSince(iso, now);
    return days !== null && days > LIKELY_CLOSED_DAYS;
}

export function isoDaysAgo(days, now = Date.now()) {
    return new Date(now - days * DAY_MS).toISOString();
}

// Reads the protected "Application ID" returned by the unlock worker.
export function parseApplyTarget(applicationId) {
    const raw = String(applicationId ?? '').trim();
    if (!raw) return { type: 'none' };
    const url = safeHttpUrl(raw);
    if (url) return { type: 'url', url };
    const email = raw.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (email) return { type: 'email', email: email[0] };
    return { type: 'search', url: `https://www.google.com/search?q=${encodeURIComponent(`${raw} careers`)}` };
}

export function buildMailto(email, subject, body) {
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Firms often repost the same ad. In training sections one firm is almost
// always one opening, so group by firm; in job sections a company can have many
// roles, so group only identical opening text from the same company.
const COMPANY_NOISE = /\b(llp|pvt|private|ltd|limited|co|company|and|the|chartered|accountants?|associates)\b/g;

export function normalizeCompany(name) {
    return String(name ?? '').toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(COMPANY_NOISE, ' ').replace(/\s+/g, ' ').trim();
}

export function repostSignature(job, { byCompany = false } = {}) {
    const company = normalizeCompany(job?.Company);
    if (byCompany && company) return company;
    const text = String(stripMarkdown(job?.Description) ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    return `${company}|${text.slice(0, 160)}`;
}

export function jobKey(table, id) {
    return `${TABLE_SLUGS[table] || 'job'}:${id}`;
}

// Ids are bigints in most tables and UUIDs in "Semi Qualified Jobs".
const ID_PATTERN = /^(\d{1,15}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

export function isValidJobId(id) {
    return ID_PATTERN.test(String(id ?? ''));
}

export function parseJobKey(value) {
    const match = String(value ?? '').match(/^([a-z-]+):(.+)$/);
    if (!match || !SLUG_TABLES[match[1]] || !isValidJobId(match[2])) return null;
    return { table: SLUG_TABLES[match[1]], id: match[2].toLowerCase() };
}

// job_applications.job_id is a bigint, so UUID ids are stored the way the CA
// portal and history.js expect: a placeholder number plus "Table|uuid".
export function applicationRow(userId, table, id, now = Date.now()) {
    const numeric = /^\d+$/.test(String(id));
    return {
        user_id: userId,
        job_id: numeric ? Number(id) : now + Math.floor(Math.random() * 1000),
        job_table: numeric ? table : `${table}|${id}`,
        applied_at: new Date(now).toISOString()
    };
}

export function appliedKeyFromRow(row) {
    const raw = String(row?.job_table || '');
    if (!raw) return null;
    if (raw.includes('|')) {
        const [table, id] = raw.split('|');
        return TABLE_SLUGS[table] && isValidJobId(id) ? jobKey(table, String(id).toLowerCase()) : null;
    }
    return TABLE_SLUGS[raw] ? jobKey(raw, String(row.job_id)) : null;
}

// The sentence around the first match, shown so a student can judge
// eligibility themselves ("Qualified CA/CMA/CS required").
export function matchContext(text, pattern, radius = 90) {
    const re = toRegExp(pattern);
    const source = String(text ?? '');
    const match = re && re.exec(source);
    if (!match) return '';
    const start = Math.max(0, match.index - radius);
    const end = Math.min(source.length, match.index + match[0].length + radius);
    const snippet = source.slice(start, end).replace(/\s+/g, ' ').trim();
    return `${start > 0 ? '…' : ''}${snippet}${end < source.length ? '…' : ''}`;
}

export const WINDOW_OPTIONS = [7, 15, 30, 60];
export const DEFAULT_WINDOW = 30;

export function defaultFilters() {
    return { q: '', locations: [], categories: [], payMin: 0, days: DEFAULT_WINDOW, sort: 'newest', savedOnly: false, hideApplied: false };
}

const listParam = value => String(value || '').split(',').map(s => s.trim()).filter(Boolean);

// URL <-> filter state, so filtered views can be shared, bookmarked and
// restored with the back button.
export function decodeFilters(search, { categoryKeys = [], payOptions = [] } = {}) {
    const params = new URLSearchParams(search);
    const filters = defaultFilters();
    filters.q = String(params.get('q') || '').slice(0, 120);
    filters.locations = listParam(params.get('loc')).map(sanitizeTerm).filter(Boolean).slice(0, 8);
    filters.categories = listParam(params.get('cat')).filter(key => categoryKeys.includes(key));
    const pay = Number(params.get('pay'));
    filters.payMin = payOptions.includes(pay) ? pay : 0;
    const days = Number(params.get('days'));
    filters.days = WINDOW_OPTIONS.includes(days) ? days : DEFAULT_WINDOW;
    filters.sort = params.get('sort') === 'pay' ? 'pay' : 'newest';
    filters.savedOnly = params.get('saved') === '1';
    filters.hideApplied = params.get('hide_applied') === '1';
    return filters;
}

export function encodeFilters(filters, extra = {}) {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.locations?.length) params.set('loc', filters.locations.join(','));
    if (filters.categories?.length) params.set('cat', filters.categories.join(','));
    if (filters.payMin) params.set('pay', String(filters.payMin));
    if (filters.days && filters.days !== DEFAULT_WINDOW) params.set('days', String(filters.days));
    if (filters.sort === 'pay') params.set('sort', 'pay');
    if (filters.savedOnly) params.set('saved', '1');
    if (filters.hideApplied) params.set('hide_applied', '1');
    for (const [key, value] of Object.entries(extra)) {
        if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
    }
    const text = params.toString();
    return text ? `?${text}` : '';
}

export function countActiveFilters(filters) {
    return (filters.q ? 1 : 0)
        + (filters.locations?.length || 0)
        + (filters.categories?.length || 0)
        + (filters.payMin ? 1 : 0)
        + (filters.days !== DEFAULT_WINDOW ? 1 : 0)
        + (filters.savedOnly ? 1 : 0)
        + (filters.hideApplied ? 1 : 0);
}
