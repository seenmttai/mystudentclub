// Job portal v2: the pure logic behind every listing page and the job detail page.
// No DOM and no network here, so tests/portal-v2-core.test.cjs can check all of it.
//
// Rules this file owns (Padam, 6 Nov 2026):
//  * Freshness: newest first. A vacancy's date is Posted_Date when present, else Created_At. Anything older than
//    FRESH_DAYS (15) is never shown as new and never ranked above a fresher one: it lives in a separate "older" list.
//  * Exclusive (is_exclusive = true) on every portal: shown as a teaser to everyone, but apply details
//    (Application ID, Apply_Link, posts_link, contact) only for students enrolled in that portal's programme.
//  * posts_link (the LinkedIn post a vacancy came from) is never part of a public query or page.

export const FRESH_DAYS = 15;
export const NEW_HOURS = 48;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// ---------------------------------------------------------------------------------------------------------------
// Portals
// ---------------------------------------------------------------------------------------------------------------

const PROGRAMMES = {
    industrial: {
        name: 'MSC Industrial Training Program',
        short: 'Industrial Training Program',
        href: '/ca-industrial-training-program',
        courses: ['industrial-training-mastery'],
    },
    articleship: {
        name: 'MSC Articleship Program',
        short: 'Articleship Program',
        href: '/articleship-program',
        courses: ['msc-articleship-program'],
    },
    freshers: {
        name: 'MSC CA Freshers Program',
        short: 'CA Freshers Program',
        href: '/msc-ca-fresher-program',
        courses: ['msc-ca-freshers-program'],
    },
};

// One entry per listing page. Fresher and Experienced share the "Fresher Jobs" table (column Experience).
export const PORTALS = {
    industrial: {
        key: 'industrial',
        table: 'Industrial Training Job Portal',
        path: '/',
        tabLabel: 'Industrial Training',
        heading: 'CA Industrial Training vacancies',
        audience: 'CA students looking for industrial training',
        roleFallback: 'Industrial Trainee',
        jobType: 'industrial',
        seoCategory: 'industrial',
        payLabel: 'Stipend',
        payUnit: 'month',
        payPresets: [20000, 30000, 40000],
        // Semi Qualified also points here: it is the programme its pages already link to (getCoursePageLink).
        programme: PROGRAMMES.industrial,
        facets: ['city', 'domain', 'companyType', 'industry'],
        extraColumns: ['"Company Type"', '"Industry Type"', '"Stipend Range"', '"Functional Tags"', '"Technology Tags"'],
    },
    articleship: {
        key: 'articleship',
        table: 'Articleship Jobs',
        path: '/ca-articleship-opportunities',
        tabLabel: 'Articleship',
        heading: 'CA Articleship opportunities',
        audience: 'CA Intermediate students looking for articleship',
        roleFallback: 'Article Assistant',
        jobType: 'articleship',
        seoCategory: 'articleship',
        payLabel: 'Stipend',
        payUnit: 'month',
        payPresets: [10000, 15000, 20000],
        programme: PROGRAMMES.articleship,
        facets: ['city', 'domain', 'firmType'],
        extraColumns: ['"Firm Type"', '"Stipend Range"', '"Exposure Tags"', '"Client Exposure Tags"'],
    },
    semi: {
        key: 'semi',
        table: 'Semi Qualified Jobs',
        path: '/semi-qualified-ca-jobs',
        tabLabel: 'Semi Qualified',
        heading: 'Semi-qualified CA jobs',
        audience: 'semi-qualified CAs',
        roleFallback: 'Semi Qualified CA',
        jobType: 'semi',
        seoCategory: 'semi-qualified',
        payLabel: 'Salary',
        payUnit: 'year',
        payPresets: [400000, 600000, 1000000],
        programme: PROGRAMMES.industrial,
        facets: ['city', 'experience', 'domain', 'companyType', 'industry'],
        extraColumns: ['Experience', '"Secondary Domain"', 'Tags', '"Company Type"', '"Industry Type"', '"Stipend Range"'],
    },
    fresher: {
        key: 'fresher',
        table: 'Fresher Jobs',
        path: '/ca-fresher-jobs',
        tabLabel: 'CA Freshers',
        heading: 'CA Fresher jobs',
        audience: 'newly qualified CAs',
        roleFallback: 'CA Fresher',
        jobType: 'fresher',
        seoCategory: 'fresher',
        payLabel: 'Salary',
        payUnit: 'year',
        payPresets: [800000, 1200000, 2000000],
        programme: PROGRAMMES.freshers,
        experienceLock: 'Freshers',
        maxYoe: 1,
        facets: ['city', 'domain', 'companyType', 'industry'],
        extraColumns: ['Experience', 'yoe', '"Secondary Domain"', 'Tags', '"Company Type"', '"Industry Type"', '"CTC Range"'],
    },
    experienced: {
        key: 'experienced',
        table: 'Fresher Jobs',
        path: '/experienced-ca-jobs',
        tabLabel: 'Experienced CA',
        heading: 'Experienced CA jobs',
        audience: 'experienced Chartered Accountants',
        roleFallback: 'Chartered Accountant',
        jobType: 'experienced',
        seoCategory: 'fresher',
        payLabel: 'Salary',
        payUnit: 'year',
        payPresets: [1200000, 2000000, 3000000],
        programme: PROGRAMMES.freshers,
        experienceLock: 'Experienced',
        facets: ['city', 'yoe', 'domain', 'companyType', 'industry'],
        extraColumns: ['Experience', 'yoe', '"Secondary Domain"', 'Tags', '"Company Type"', '"Industry Type"', '"CTC Range"'],
    },
};

export const PORTAL_ORDER = ['industrial', 'articleship', 'semi', 'fresher', 'experienced'];

// The share-link "type" values that job.html and the portals understand.
const JOB_TYPE_TO_PORTAL = {
    industrial: 'industrial',
    articleship: 'articleship',
    semi: 'semi',
    'semi-qualified': 'semi',
    fresher: 'fresher',
    experienced: 'experienced',
};

export function portalFromPath(pathname = '/') {
    const path = String(pathname || '/').toLowerCase();
    if (path.includes('/ca-articleship-opportunities') || path.includes('/jobs/articleship/')) return PORTALS.articleship;
    if (path.includes('/semi-qualified-ca-jobs') || path.includes('/jobs/semi-qualified/')) return PORTALS.semi;
    if (path.includes('/experienced-ca-jobs')) return PORTALS.experienced;
    if (path.includes('/ca-fresher-jobs') || path.includes('/jobs/fresher/')) return PORTALS.fresher;
    return PORTALS.industrial;
}

export function portalFromJobType(type, fallback = PORTALS.industrial) {
    const key = JOB_TYPE_TO_PORTAL[String(type || '').toLowerCase().trim()];
    return key ? PORTALS[key] : fallback;
}

// ---------------------------------------------------------------------------------------------------------------
// Columns: what a public query may read
// ---------------------------------------------------------------------------------------------------------------

// Never selected by a listing or a public page. Application ID comes only through the BrowserGuard unlock,
// posts_link only for enrolled students, on demand (see privateLinkColumns).
export const PRIVATE_COLUMNS = ['Application ID', 'Apply_Link', 'posts_link'];

// Columns that may not exist yet (is_exclusive is new on three tables; hidden comes with PR #153). The query
// helpers below retry without them, so the page works before and after each migration.
export const OPTIONAL_COLUMNS = ['is_exclusive', 'hidden'];

const BASE_LIST_COLUMNS = [
    'id', 'Company', 'Location', 'Salary', 'Created_At', 'Posted_Date', 'Category', '"Primary Domain"',
    'Job_Title', 'Company_Logo_URL', 'application_count', 'posted_by', 'hirer_email',
];

export function listColumns(portal, { omit = [] } = {}) {
    const optional = OPTIONAL_COLUMNS.filter((col) => !omit.includes(col));
    return [...BASE_LIST_COLUMNS, ...portal.extraColumns, ...optional].join(', ');
}

// The detail view adds the description and the custom "connect with peers" link (both public).
export function detailColumns(portal, options = {}) {
    return `${listColumns(portal, options)}, Description, connect_link`;
}

export function hasPrivateColumn(columns) {
    const text = String(columns || '');
    return PRIVATE_COLUMNS.some((col) => text.includes(col));
}

// Which optional column an error is about, if it says the column is missing.
export function missingOptionalColumn(error) {
    const message = String(error?.message || error?.details || '');
    if (!/does not exist|could not find|schema cache/i.test(message)) return null;
    return OPTIONAL_COLUMNS.find((col) => message.includes(col)) || null;
}

// Column-level grants: anon cannot read a column nobody granted it, and Postgres then refuses the whole select.
export function isPermissionError(error) {
    return Boolean(error && (error.code === '42501' || /permission denied/i.test(String(error.message || ''))));
}

/**
 * Run a select that may name optional columns. runQuery(omit) must build and await the query with
 * listColumns(portal, { omit }). Returns { data, error, omitted }. Retries without a column that does not exist.
 * A permission error does not say which column, so it drops the optional columns one at a time from the end
 * (hidden before is_exclusive), keeping every column the visitor may read.
 */
export async function selectWithFallback(runQuery, initialOmit = []) {
    let omit = OPTIONAL_COLUMNS.filter((col) => initialOmit.includes(col));
    for (let attempt = 0; attempt <= OPTIONAL_COLUMNS.length; attempt++) {
        const result = await runQuery(omit);
        const error = result?.error;
        if (!error) return { data: result.data || [], error: null, omitted: omit };
        const missing = missingOptionalColumn(error);
        if (missing && !omit.includes(missing)) {
            omit = [...omit, missing];
            continue;
        }
        const remaining = OPTIONAL_COLUMNS.filter((col) => !omit.includes(col));
        if (isPermissionError(error) && remaining.length) {
            const dropped = remaining[remaining.length - 1];
            if (dropped === 'is_exclusive' && typeof console !== 'undefined') {
                // Only happens for logged-out visitors if the migration's column grant is missing. They cannot
                // apply anyway (applying needs a login, and logged-in users can read is_exclusive).
                console.warn('is_exclusive is not readable here; exclusive vacancies cannot be marked for this visitor.');
            }
            omit = [...omit, dropped];
            continue;
        }
        return { data: [], error, omitted: omit };
    }
    return { data: [], error: new Error('Could not load vacancies'), omitted: omit };
}

// ---------------------------------------------------------------------------------------------------------------
// Dates and freshness
// ---------------------------------------------------------------------------------------------------------------

export function toDate(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

/** The date a vacancy was posted: Posted_Date when present, else Created_At. Never in the future. */
export function postedAt(job, now = new Date()) {
    const posted = toDate(job?.Posted_Date);
    const created = toDate(job?.Created_At);
    const limit = now.getTime() + 5 * 60 * 1000;
    if (posted && posted.getTime() <= limit) return posted;
    if (created) return created.getTime() <= limit ? created : new Date(now.getTime());
    if (posted) return new Date(now.getTime());
    return null;
}

export function ageMs(job, now = new Date()) {
    const date = postedAt(job, now);
    return date ? Math.max(0, now.getTime() - date.getTime()) : Infinity;
}

export function isFresh(job, now = new Date()) {
    return ageMs(job, now) <= FRESH_DAYS * DAY_MS;
}

export function isNew(job, now = new Date()) {
    return ageMs(job, now) <= NEW_HOURS * HOUR_MS;
}

export function freshnessCutoff(now = new Date(), days = FRESH_DAYS) {
    return new Date(now.getTime() - days * DAY_MS);
}

export function postedLabel(job, now = new Date()) {
    const age = ageMs(job, now);
    if (!Number.isFinite(age)) return 'Date not known';
    const hours = Math.floor(age / HOUR_MS);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(age / DAY_MS);
    if (days === 1) return '1 day ago';
    if (days < 60) return `${days} days ago`;
    const months = Math.floor(days / 30);
    return `${months} months ago`;
}

// ---------------------------------------------------------------------------------------------------------------
// Pay
// ---------------------------------------------------------------------------------------------------------------

export function isPayDisclosed(value) {
    if (value === null || value === undefined) return false;
    const clean = String(value).replace(/[₹\s\-.]/g, '').toLowerCase();
    return clean !== '' && !['notdisclosed', 'nil', 'null', 'na', 'n/a', '0', 'undisclosed', 'notmentioned'].includes(clean);
}

/** Salary in the portal's unit (rupees per month for stipends, per year for salaries), or null. */
export function payValue(job, portal) {
    const amount = Number(job?.Salary);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (portal.payUnit === 'year') {
        if (amount < 100) return Math.round(amount * 100000); // "12" written for 12 LPA
        if (amount < 100000) return amount * 12; // a monthly figure
        return amount > 50000000 ? null : amount; // above ₹5 crore a year is a typo, not a salary
    }
    if (amount < 1000) return null; // not a real monthly stipend
    if (amount >= 100000) {
        const monthly = Math.round(amount / 12); // an annual figure
        return monthly > 500000 ? null : monthly; // e.g. "15000-20000" stored as 1500020000
    }
    return amount;
}

function trimNumber(value) {
    return String(Number(value.toFixed(1))).replace(/\.0$/, '');
}

export function formatAmount(value, unit) {
    if (!Number.isFinite(value) || value <= 0) return '';
    if (unit === 'year') return `₹${trimNumber(value / 100000)} LPA`;
    if (value >= 1000) return `₹${trimNumber(value / 1000)}k/month`;
    return `₹${Math.round(value)}/month`;
}

function rangeText(job, portal) {
    const raw = portal.payUnit === 'year' ? (job?.['CTC Range'] || job?.['Stipend Range']) : job?.['Stipend Range'];
    if (!isPayDisclosed(raw)) return '';
    return String(raw).replace(/\s+/g, ' ').trim();
}

/** Short pay text for a card, '' when not disclosed. */
export function formatPay(job, portal, { maxLength = 32 } = {}) {
    const value = payValue(job, portal);
    if (value) return formatAmount(value, portal.payUnit);
    const range = rangeText(job, portal);
    if (!range) return '';
    return range.length > maxLength ? `${range.slice(0, maxLength - 1).trim()}…` : range;
}

/** Full pay text for the detail view: the recruiter's own range when given, else the amount. */
export function formatPayLong(job, portal) {
    return rangeText(job, portal) || formatPay(job, portal);
}

export function payPresetLabel(amount, portal) {
    return `${formatAmount(amount, portal.payUnit).replace('/month', '')}+`;
}

// ---------------------------------------------------------------------------------------------------------------
// Exclusive, Easy Apply, hidden
// ---------------------------------------------------------------------------------------------------------------

export function isExclusiveJob(job) {
    return Boolean(job?.is_exclusive);
}

export function isEnrolledInProgramme(portal, courses) {
    if (!Array.isArray(courses) || !courses.length) return false;
    return portal.programme.courses.some((course) => courses.includes(course));
}

/** True when this student may see how to apply (Application ID, links, contact, original post). */
export function canSeeApplyDetails(job, portal, courses) {
    return !isExclusiveJob(job) || isEnrolledInProgramme(portal, courses);
}

/** Posted by a recruiter on hire.mystudentclub.com or by the MSC team: applications go to the hirer dashboard. */
export function isTeamPosted(job) {
    const applicationId = String(job?.['Application ID'] || '').trim().toLowerCase();
    return Boolean(job && (job.posted_by || job.hirer_email || applicationId === 'recruit@mystudentclub.com'));
}

/** The existing perks rule (AI Apply, Connect with peers, Original post): IT enrolment on IT, any enrolment elsewhere. */
export function hasProgrammePerks(portal, courses) {
    if (!Array.isArray(courses)) return false;
    if (portal.key === 'industrial') return courses.includes('industrial-training-mastery');
    return courses.length > 0;
}

// Saved vacancies: localStorage "msc_saved_jobs" = [{ id, table, savedAt }] (My Applications → Saved Jobs reads it).
export const SAVED_JOBS_KEY = 'msc_saved_jobs';

export function readSavedJobs(storage) {
    try {
        const saved = JSON.parse(storage.getItem(SAVED_JOBS_KEY) || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
}

export function isSavedJob(storage, job, table) {
    return readSavedJobs(storage).some((s) => String(s.id) === String(job.id) && s.table === table);
}

/** Save or unsave; returns true when the vacancy is now saved. */
export function toggleSavedJob(storage, job, table, now = new Date()) {
    const list = readSavedJobs(storage);
    const index = list.findIndex((s) => String(s.id) === String(job.id) && s.table === table);
    if (index >= 0) list.splice(index, 1);
    else list.push({ id: job.id, table, savedAt: now.toISOString() });
    try {
        storage.setItem(SAVED_JOBS_KEY, JSON.stringify(list));
    } catch { /* storage blocked: saving just doesn't persist */ }
    return index < 0;
}

export function isListable(job) {
    return Boolean(job) && job.hidden !== true;
}

/** The portal's own rows: the Fresher page shows freshers (0–1 years), the Experienced page experienced roles. */
export function matchesPortalBase(job, portal) {
    if (!isListable(job)) return false;
    if (portal.experienceLock) {
        if (normalizeExperience(job.Experience) !== portal.experienceLock) return false;
        if (portal.maxYoe !== undefined && job.yoe !== null && job.yoe !== undefined && Number(job.yoe) > portal.maxYoe) {
            return false;
        }
    }
    return true;
}

export function normalizeExperience(value) {
    const text = String(value || '').trim().toLowerCase();
    if (text === 'freshers' || text === 'fresher') return 'Freshers';
    if (text === 'experienced') return 'Experienced';
    return '';
}

/**
 * What the apply area of a vacancy shows:
 *  locked   – exclusive and the student is not enrolled in this portal's programme: teaser + enrol / log in
 *  login    – not logged in: log in to apply
 *  easy     – posted on hire.msc or by the MSC team: Easy Apply sends the profile to the hirer dashboard
 *  unlock   – logged in: Apply now / see how to apply (BrowserGuard unlock fetches the Application ID)
 *  revealed – the Application ID has been unlocked in this session
 * ctx: { loggedIn, courses, unlocked }
 */
export function applyState(job, portal, ctx = {}) {
    if (!canSeeApplyDetails(job, portal, ctx.courses)) return 'locked';
    if (!ctx.loggedIn) return 'login';
    if (isTeamPosted(job)) return 'easy';
    if (ctx.unlocked && ctx.unlocked.applicationId) return 'revealed';
    return 'unlock';
}

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/** The unlocked "Application ID" → what to show: emails, links, or text to search for. */
export function applicationTargets(applicationId) {
    return String(applicationId || '')
        .split(/[,;\n]+/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((value) => {
            const url = safeHttpUrl(value);
            if (url) return { kind: 'url', value, href: url };
            const email = value.match(EMAIL_RE);
            if (email) return { kind: 'email', value: email[0], href: '' };
            return { kind: 'search', value, href: `https://www.google.com/search?q=${encodeURIComponent(`${value} careers`)}` };
        });
}

/** Strip anything private before a job object is handed to the page (defence in depth). */
export function publicJob(job) {
    if (!job || typeof job !== 'object') return job;
    const copy = { ...job };
    for (const col of PRIVATE_COLUMNS) delete copy[col];
    return copy;
}

// ---------------------------------------------------------------------------------------------------------------
// Text: escaping, locations, titles, descriptions
// ---------------------------------------------------------------------------------------------------------------

export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function cleanText(value) {
    if (value === null || value === undefined) return '';
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined' ? '' : text;
}

export function safeHttpUrl(value) {
    const text = String(value || '').trim();
    if (!/^https?:\/\//i.test(text)) return '';
    try {
        const url = new URL(text);
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
        return '';
    }
}

// Canonical city name → the spellings that mean it. Matching is "location contains alias" (case-insensitive),
// the same rule as the database's ilike, so a city filter returns the same rows in both places.
export const CITIES = [
    ['Mumbai', ['mumbai', 'bombay']],
    ['Bengaluru', ['bengaluru', 'bangalore']],
    ['Gurugram', ['gurugram', 'gurgaon']],
    ['Delhi', ['delhi']],
    ['Noida', ['noida']],
    ['Hyderabad', ['hyderabad']],
    ['Pune', ['pune']],
    ['Chennai', ['chennai', 'madras']],
    ['Kolkata', ['kolkata', 'calcutta']],
    ['Ahmedabad', ['ahmedabad']],
    ['Jaipur', ['jaipur']],
    ['Kochi', ['kochi', 'cochin']],
    ['Vadodara', ['vadodara', 'baroda']],
    ['Indore', ['indore']],
    ['Chandigarh', ['chandigarh']],
    ['Mohali', ['mohali']],
    ['Lucknow', ['lucknow']],
    ['Surat', ['surat']],
    ['Nagpur', ['nagpur']],
    ['Coimbatore', ['coimbatore']],
    ['Thane', ['thane']],
    ['Bhubaneswar', ['bhubaneswar']],
    ['Remote', ['remote', 'work from home', 'wfh']],
];
const CITY_ALIASES = new Map(CITIES);

export function cityAliases(city) {
    return CITY_ALIASES.get(city) || [String(city || '').toLowerCase()];
}

export function citiesOf(location) {
    const text = String(location || '').toLowerCase();
    if (!text) return [];
    return CITIES.filter(([, aliases]) => aliases.some((alias) => text.includes(alias))).map(([city]) => city);
}

const STATE_WORDS = /^(india|maharashtra|karnataka|haryana|telangana|tamil nadu|west bengal|uttar pradesh|gujarat|rajasthan|kerala|punjab|madhya pradesh|odisha|delhi ncr|ncr|andhra pradesh|bihar|assam|goa)$/i;

/** "Mumbai, Maharashtra, India" → "Mumbai"; "Lower Parel, Mumbai" stays. */
export function displayLocation(location) {
    const parts = cleanText(location).split(',').map((part) => part.trim()).filter(Boolean);
    const kept = parts.filter((part, index) => index === 0 || !STATE_WORDS.test(part));
    return kept.join(', ') || 'Location not given';
}

export function domainOf(job) {
    const domain = cleanText(job?.['Primary Domain']) || cleanText(job?.Category);
    return domain && domain.toLowerCase() !== 'other' ? domain : '';
}

export function roleTitle(job, portal) {
    const title = cleanText(job?.Job_Title);
    if (title && title.toLowerCase() !== cleanText(job?.Company).toLowerCase()) return title;
    const domain = domainOf(job);
    return domain ? `${domain} · ${portal.roleFallback}` : portal.roleFallback;
}

/**
 * What a card leads with. With a real job title: the title, then the company. Without one (most Industrial
 * Training and Articleship rows): the company, then the role, so students scan companies instead of a column of
 * identical "Industrial Trainee" headings.
 */
export function cardHeadline(job, portal) {
    const title = cleanText(job?.Job_Title);
    const company = companyName(job);
    if (title && title.toLowerCase() !== company.toLowerCase()) return { title, subtitle: company, companyFirst: false };
    return { title: company, subtitle: roleTitle(job, portal), companyFirst: true };
}

export function companyName(job) {
    return cleanText(job?.Company) || 'Company not named';
}

export function monogram(name) {
    const words = cleanText(name).replace(/[^A-Za-z0-9 ]/g, ' ').split(' ').filter(Boolean);
    if (!words.length) return '?';
    return (words[0][0] + (words[1] ? words[1][0] : '')).toUpperCase();
}

export function monogramHue(name) {
    let hash = 0;
    for (const char of cleanText(name).toLowerCase()) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return [214, 228, 199, 168, 262, 24, 340, 190][hash % 8];
}

const CONTACT_PATTERNS = [
    [/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email hidden]'],
    [/(?:https?:\/\/|www\.)[^\s)<>]+/gi, '[link hidden]'],
    [/(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}/g, '[phone hidden]'],
];

/** Hide emails, links and phone numbers (for teasers and public pages). */
export function maskContacts(text) {
    let clean = String(text || '');
    for (const [pattern, replacement] of CONTACT_PATTERNS) clean = clean.replace(pattern, replacement);
    return clean;
}

export function truncateText(text, maxLength) {
    const clean = String(text || '').trim();
    if (clean.length <= maxLength) return clean;
    let cut = clean.slice(0, maxLength);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.6) cut = cut.slice(0, lastSpace);
    return `${cut.trim()}…`;
}

function inlineMarkdown(escaped) {
    return escaped
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/(^|[\s(])\*(?!\s)(.+?)\*(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>')
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (match, label, href) => {
            const url = safeHttpUrl(href.replace(/&amp;/g, '&'));
            return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer nofollow">${label}</a>` : label;
        });
}

/**
 * Description text → safe HTML (escaped first, then a small markdown subset: headings, bold, italic, bullet lists,
 * links). mask: hide contacts; maxLength: cut to a teaser.
 */
export function descriptionHtml(text, { mask = false, maxLength = 0 } = {}) {
    let source = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!source) return '';
    if (mask) source = maskContacts(source);
    if (maxLength) source = truncateText(source, maxLength);
    const blocks = [];
    let list = [];
    let paragraph = [];
    const flushList = () => {
        if (list.length) blocks.push(`<ul>${list.map((item) => `<li>${item}</li>`).join('')}</ul>`);
        list = [];
    };
    const flushParagraph = () => {
        if (paragraph.length) blocks.push(`<p>${paragraph.join('<br>')}</p>`);
        paragraph = [];
    };
    for (const rawLine of source.split('\n')) {
        const line = rawLine.trim();
        if (!line) {
            flushList();
            flushParagraph();
            continue;
        }
        const heading = line.match(/^#{1,6}\s+(.*)$/);
        const bullet = line.match(/^(?:[-*•▪●]|\d+[.)])\s+(.*)$/);
        if (heading) {
            flushList();
            flushParagraph();
            blocks.push(`<h4>${inlineMarkdown(escapeHtml(heading[1]))}</h4>`);
        } else if (bullet) {
            flushParagraph();
            list.push(inlineMarkdown(escapeHtml(bullet[1])));
        } else {
            flushList();
            paragraph.push(inlineMarkdown(escapeHtml(line)));
        }
    }
    flushList();
    flushParagraph();
    return blocks.join('');
}

export function tagsOf(job) {
    const tags = [];
    for (const key of ['Tags', 'Functional Tags', 'Technology Tags', 'Exposure Tags', 'Client Exposure Tags']) {
        const value = job?.[key];
        const items = Array.isArray(value) ? value : (typeof value === 'string' && value ? value.split(',') : []);
        for (const item of items) {
            const tag = cleanText(item);
            if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase())) tags.push(tag);
        }
    }
    return tags;
}

// ---------------------------------------------------------------------------------------------------------------
// Search, filters, facets
// ---------------------------------------------------------------------------------------------------------------

export function normalizeSearch(text) {
    return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function haystack(job) {
    if (job && job.__haystack) return job.__haystack;
    const parts = [
        job?.Company, job?.Job_Title, job?.Category, job?.['Primary Domain'], job?.['Secondary Domain'], job?.Location,
        job?.['Company Type'], job?.['Industry Type'], job?.['Firm Type'], ...tagsOf(job),
    ];
    const text = normalizeSearch(parts.filter(Boolean).join(' | '));
    const value = { text, compact: text.replace(/[^a-z0-9]/g, '') };
    if (job && typeof job === 'object') {
        Object.defineProperty(job, '__haystack', { value, enumerable: false, configurable: true });
    }
    return value;
}

/** Every word of the query must appear (in any field). "phone pe" matches PhonePe; Bangalore matches Bengaluru. */
export function matchesQuery(job, query) {
    const tokens = normalizeSearch(query).split(/[\s,]+/).filter((token) => token.length >= 2);
    if (!tokens.length) return true;
    const hay = haystack(job);
    const joined = tokens.join('');
    if (tokens.length > 1 && hay.compact.includes(joined)) return true;
    return tokens.every((token) => {
        const alternatives = [token];
        for (const [, aliases] of CITIES) if (aliases.includes(token)) alternatives.push(...aliases);
        return alternatives.some((alt) => hay.text.includes(alt) || hay.compact.includes(alt.replace(/[^a-z0-9]/g, '')));
    });
}

export const POSTED_WINDOWS = [
    { id: '1', label: 'Last 24 hours', days: 1 },
    { id: '3', label: 'Last 3 days', days: 3 },
    { id: '7', label: 'Last 7 days', days: 7 },
];

export const YOE_BUCKETS = [
    { id: '0-2', label: '0–2 yrs', min: 0, max: 2 },
    { id: '3-5', label: '3–5 yrs', min: 3, max: 5 },
    { id: '6-9', label: '6–9 yrs', min: 6, max: 9 },
    { id: '10+', label: '10+ yrs', min: 10, max: Infinity },
];

export function emptyFilters() {
    return {
        q: '',
        cities: [],
        domains: [],
        companyTypes: [],
        industries: [],
        firmTypes: [],
        experience: '',
        yoe: '',
        payMin: 0,
        posted: '',
        exclusiveOnly: false,
        easyApplyOnly: false,
        notApplied: false,
    };
}

export function activeFilterCount(filters) {
    const f = filters || emptyFilters();
    return f.cities.length + f.domains.length + f.companyTypes.length + f.industries.length + f.firmTypes.length
        + (f.experience ? 1 : 0) + (f.yoe ? 1 : 0) + (f.payMin ? 1 : 0) + (f.posted ? 1 : 0)
        + (f.exclusiveOnly ? 1 : 0) + (f.easyApplyOnly ? 1 : 0) + (f.notApplied ? 1 : 0);
}

function valueIn(list, value) {
    if (!list.length) return true;
    const clean = cleanText(value);
    return Boolean(clean) && list.includes(clean);
}

/**
 * Does a job pass the filters? ctx: { now, appliedIds (Set of String ids) }. skip: a facet name to ignore
 * (used to count that facet's own options).
 */
export function matchesFilters(job, filters, portal, ctx = {}, skip = '') {
    const f = filters || emptyFilters();
    const now = ctx.now || new Date();
    if (!matchesPortalBase(job, portal)) return false;
    if (f.q && !matchesQuery(job, f.q)) return false;
    if (skip !== 'city' && f.cities.length) {
        const cities = citiesOf(job.Location);
        if (!f.cities.some((city) => cities.includes(city))) return false;
    }
    if (skip !== 'domain' && !valueIn(f.domains, domainOf(job))) return false;
    if (skip !== 'companyType' && !valueIn(f.companyTypes, job['Company Type'])) return false;
    if (skip !== 'industry' && !valueIn(f.industries, job['Industry Type'])) return false;
    if (skip !== 'firmType' && !valueIn(f.firmTypes, job['Firm Type'])) return false;
    if (skip !== 'experience' && f.experience && normalizeExperience(job.Experience) !== f.experience) return false;
    if (skip !== 'yoe' && f.yoe) {
        const bucket = YOE_BUCKETS.find((b) => b.id === f.yoe);
        const years = job.yoe === null || job.yoe === undefined || job.yoe === '' ? NaN : Number(job.yoe);
        if (bucket && !(Number.isFinite(years) && years >= bucket.min && years <= bucket.max)) return false;
    }
    if (f.payMin) {
        const pay = payValue(job, portal);
        if (!pay || pay < f.payMin) return false;
    }
    if (f.posted) {
        const window = POSTED_WINDOWS.find((w) => w.id === f.posted);
        if (window && ageMs(job, now) > window.days * DAY_MS) return false;
    }
    if (f.exclusiveOnly && !isExclusiveJob(job)) return false;
    if (f.easyApplyOnly && !isTeamPosted(job)) return false;
    if (f.notApplied && ctx.appliedIds && ctx.appliedIds.has(String(job.id))) return false;
    return true;
}

const FACET_VALUE = {
    city: (job) => citiesOf(job.Location),
    domain: (job) => [domainOf(job)],
    companyType: (job) => [cleanText(job['Company Type'])],
    industry: (job) => [cleanText(job['Industry Type'])],
    firmType: (job) => [cleanText(job['Firm Type'])],
    experience: (job) => [normalizeExperience(job.Experience)],
    yoe: (job) => {
        const years = job.yoe === null || job.yoe === undefined || job.yoe === '' ? NaN : Number(job.yoe);
        if (!Number.isFinite(years)) return [];
        const bucket = YOE_BUCKETS.find((b) => years >= b.min && years <= b.max);
        return bucket ? [bucket.id] : [];
    },
};

/** Option counts per facet, each counted with every other filter applied (so counts match what a click shows). */
export function facetCounts(jobs, filters, portal, ctx = {}) {
    const result = {};
    for (const facet of portal.facets) {
        const counts = new Map();
        for (const job of jobs) {
            if (!matchesFilters(job, filters, portal, ctx, facet)) continue;
            for (const value of FACET_VALUE[facet](job)) {
                if (!value || value.toLowerCase() === 'other' || value.toLowerCase() === 'null') continue;
                counts.set(value, (counts.get(value) || 0) + 1);
            }
        }
        result[facet] = [...counts.entries()]
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
    }
    return result;
}

// ---------------------------------------------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------------------------------------------

export const SORTS = {
    newest: 'Newest first',
    pay: 'Highest pay',
    popular: 'Most applied',
};

function byNewest(now) {
    return (a, b) => {
        const diff = ageMs(a, now) - ageMs(b, now);
        if (diff) return Number.isFinite(diff) ? diff : (Number.isFinite(ageMs(a, now)) ? -1 : 1);
        return String(b.id).localeCompare(String(a.id), undefined, { numeric: true });
    };
}

/**
 * Split jobs into fresh (≤ 15 days, sorted by the chosen sort) and older (always newest first, shown after every
 * fresh vacancy). A pay or popularity sort only reorders fresh vacancies, so nothing old climbs above them.
 */
export function rankJobs(jobs, { sort = 'newest', now = new Date(), portal } = {}) {
    const fresh = [];
    const older = [];
    for (const job of jobs || []) (isFresh(job, now) ? fresh : older).push(job);
    const newest = byNewest(now);
    if (sort === 'pay' && portal) {
        fresh.sort((a, b) => (payValue(b, portal) || 0) - (payValue(a, portal) || 0) || newest(a, b));
    } else if (sort === 'popular') {
        fresh.sort((a, b) => (Number(b.application_count) || 0) - (Number(a.application_count) || 0) || newest(a, b));
    } else {
        fresh.sort(newest);
    }
    older.sort(newest);
    return { fresh, older };
}

/** Merge newly fetched rows into a list, keeping the first copy of each id. */
export function mergeById(existing, incoming) {
    const seen = new Set(existing.map((job) => String(job.id)));
    const merged = [...existing];
    for (const job of incoming || []) {
        const id = String(job?.id);
        if (!seen.has(id)) {
            seen.add(id);
            merged.push(job);
        }
    }
    return merged;
}

// ---------------------------------------------------------------------------------------------------------------
// Server-side filters for the "older vacancies" query (PostgREST), mirroring matchesFilters where it can
// ---------------------------------------------------------------------------------------------------------------

/** Make user text safe inside a PostgREST or() filter: no commas, brackets, quotes, wildcards or backslashes. */
export function sanitizeForFilter(text) {
    return String(text || '').replace(/[,()"'\\%*:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// Text columns every job table has. The client check (matchesFilters) also reads tags, so it re-checks every row.
const SEARCH_COLUMNS = ['Company', 'Job_Title', 'Category', 'Location', '"Primary Domain"', '"Secondary Domain"', '"Company Type"', '"Industry Type"'];

/**
 * Apply the base portal rule and the filters that the database can check to a Supabase query builder.
 * Pay, posted window and "not applied" are checked afterwards with matchesFilters.
 */
export function applyServerFilters(query, filters, portal) {
    let q = query;
    if (portal.experienceLock) q = q.eq('Experience', portal.experienceLock);
    if (portal.maxYoe !== undefined) q = q.or(`yoe.is.null,yoe.lte.${portal.maxYoe}`);
    const f = filters || emptyFilters();
    const tokens = sanitizeForFilter(f.q).split(' ').filter((token) => token.length >= 2).slice(0, 4);
    for (const token of tokens) {
        q = q.or(SEARCH_COLUMNS.map((col) => `${col}.ilike.*${token}*`).join(','));
    }
    if (f.cities.length) {
        const ors = [];
        for (const city of f.cities) for (const alias of cityAliases(city)) ors.push(`Location.ilike.*${sanitizeForFilter(alias)}*`);
        q = q.or(ors.join(','));
    }
    // supabase-js quotes values that contain commas or brackets; quotes and backslashes are dropped here.
    const exact = (column, values) => {
        const clean = values.map((value) => cleanText(value).replace(/["\\]/g, '')).filter(Boolean);
        if (clean.length) q = q.in(column, clean);
    };
    if (f.domains.length) {
        // domainOf() falls back to Category, so the database is asked for either; matchesFilters narrows it again.
        const list = f.domains.map((value) => `"${cleanText(value).replace(/["\\]/g, '')}"`).join(',');
        q = q.or(`"Primary Domain".in.(${list}),Category.in.(${list})`);
    }
    if (f.companyTypes.length) exact('Company Type', f.companyTypes);
    if (f.industries.length) exact('Industry Type', f.industries);
    if (f.firmTypes.length) exact('Firm Type', f.firmTypes);
    if (f.experience) q = q.eq('Experience', f.experience);
    if (f.easyApplyOnly) q = q.or('posted_by.not.is.null,hirer_email.not.is.null');
    return q;
}

// ---------------------------------------------------------------------------------------------------------------
// URL state: filters survive a reload and can be shared
// ---------------------------------------------------------------------------------------------------------------

const LIST_PARAMS = { city: 'cities', domain: 'domains', ctype: 'companyTypes', industry: 'industries', firm: 'firmTypes' };

export function filtersToParams(filters, sort = 'newest') {
    const params = new URLSearchParams();
    const f = filters || emptyFilters();
    if (f.q) params.set('q', f.q);
    for (const [param, key] of Object.entries(LIST_PARAMS)) for (const value of f[key]) params.append(param, value);
    if (f.experience) params.set('exp', f.experience);
    if (f.yoe) params.set('yoe', f.yoe);
    if (f.payMin) params.set('pay', String(f.payMin));
    if (f.posted) params.set('posted', f.posted);
    if (f.exclusiveOnly) params.set('exclusive', '1');
    if (f.easyApplyOnly) params.set('easy', '1');
    if (f.notApplied) params.set('notapplied', '1');
    if (sort && sort !== 'newest') params.set('sort', sort);
    return params;
}

export function filtersFromParams(params) {
    const p = params instanceof URLSearchParams ? params : new URLSearchParams(params || '');
    const f = emptyFilters();
    f.q = cleanText(p.get('q')).slice(0, 80);
    for (const [param, key] of Object.entries(LIST_PARAMS)) {
        f[key] = [...new Set(p.getAll(param).map(cleanText).filter(Boolean))].slice(0, 12);
    }
    const exp = normalizeExperience(p.get('exp'));
    if (exp) f.experience = exp;
    if (YOE_BUCKETS.some((b) => b.id === p.get('yoe'))) f.yoe = p.get('yoe');
    const pay = Number(p.get('pay'));
    if (Number.isFinite(pay) && pay > 0) f.payMin = pay;
    if (POSTED_WINDOWS.some((w) => w.id === p.get('posted'))) f.posted = p.get('posted');
    f.exclusiveOnly = p.get('exclusive') === '1';
    f.easyApplyOnly = p.get('easy') === '1';
    f.notApplied = p.get('notapplied') === '1';
    const sort = Object.prototype.hasOwnProperty.call(SORTS, p.get('sort')) ? p.get('sort') : 'newest';
    return { filters: f, sort };
}

// ---------------------------------------------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------------------------------------------

export function shareUrl(job, portal, origin = 'https://www.mystudentclub.com') {
    return `${origin}/job.html?id=${encodeURIComponent(job.id)}&type=${encodeURIComponent(portal.jobType)}`;
}

export function slugifyText(text) {
    if (text === null || text === undefined || text === '') return '';
    return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
}

/** LinkedIn people search for "connect with peers" (same queries the portal used before). */
export function peersSearchUrl(job, portal) {
    const custom = safeHttpUrl(job?.connect_link);
    if (custom) return custom;
    const suffix = /\b(pvt|private|ltd|limited|llp|llc|co|company|inc|incorporated|corp|corporation|org|organization|foundation|group|holdings|enterprises|solutions|services|consulting|consultancy|associates|partners|international|india|technologies?|tech)\b\.?/gi;
    const name = companyName(job);
    const cleaned = name.replace(suffix, '').replace(/[.,&-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const words = cleaned.split(/\s+/).filter((w) => w.length > 1).slice(0, 3).join(' ') || name.split(/\s+/).slice(0, 2).join(' ');
    const company = encodeURIComponent(`"${words}"`);
    const schools = 'schoolFilter=%5B%221968486%22%2C%22272365%22%5D';
    if (portal.key === 'articleship') {
        return `https://www.linkedin.com/search/results/people/?keywords=${company}%20AND%20%22CA%20Finalist%22&origin=FACETED_SEARCH&${schools}`;
    }
    if (portal.key === 'industrial') {
        return `https://www.linkedin.com/search/results/people/?keywords=${company}%20AND%20(%22CA%20Finalist%22%20OR%20%22Industrial%20Trainee%22%20OR%20%22Industrial%20Training%22)&origin=FACETED_SEARCH&${schools}`;
    }
    return `https://www.linkedin.com/search/results/people/?keywords=${company}%20AND%20(%22CA%22%20OR%20%22Chartered%20Accountant%22)&origin=GLOBAL_SEARCH_HEADER&${schools}`;
}
