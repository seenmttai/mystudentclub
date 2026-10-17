// CS / CMA job portal engine. One engine serves every course and lane; the
// page tells it which one through <body data-course="cs" data-lane="fresher">.
// Listings come from the existing job tables, narrowed to vacancies that are
// open to the course (see cs-cma-portal.sql and config.js).
import { COURSES, QUAL_PATTERNS, PAY_OPTIONS, LOCATIONS, LOCATION_ALIASES, BROWSER_GUARD_WORKER_URL } from './config.js';
import {
    TABLE_SLUGS, escapeHtml, safeHttpUrl, parseSearch, termOrFilter, locationOrFilter, anyOf,
    detectQualifications, matchesPattern, maskContacts, stripMarkdown, truncate, formatPay,
    timeAgo, isLikelyClosed, isoDaysAgo, parseApplyTarget, buildMailto, jobKey, parseJobKey,
    decodeFilters, encodeFilters, countActiveFilters, defaultFilters, WINDOW_OPTIONS, DEFAULT_WINDOW,
    applicationRow, appliedKeyFromRow, matchContext, isValidJobId, MAX_PLAUSIBLE_PAY, repostSignature, isCaFirmOnly
} from './core.js';
import { unlockJobDetails, getCachedUnlockedJob } from '../browser-guard.js';
import { getProfileCompletionItems, readCachedProfile } from '../profile-completion.js';

const PAGE_SIZE = 20;
const MAX_WINDOW_DAYS = Math.max(...WINDOW_OPTIONS);
const SAVED_JOBS_KEY = 'msc_saved_jobs'; // shared with the CA portal and history.html
const PRO_JOBS_KEY = 'msc_pro_portal_jobs'; // read by scripts/history.js to label CS/CMA entries
const PRO_JOBS_LIMIT = 300;
const MODE_KEY = 'pp_source_mode_v1';
const COUNT_CACHE_KEY = 'pp_lane_counts_v1';
const COUNT_TTL_MS = 10 * 60 * 1000;

const BASE_COLUMNS = 'id, Company, Location, Salary, Description, Created_At, Category, application_count, posts_link, "Primary Domain", posted_by';
const TABLE_COLUMNS = {
    'Fresher Jobs': ', Experience, yoe, "Secondary Domain", Tags, "Company Type", "Industry Type", "CTC Range"',
    'Semi Qualified Jobs': ', Experience, "Secondary Domain", Tags, "Company Type", "Industry Type"',
    'Industrial Training Job Portal': ', "Company Type", "Industry Type", "Stipend Range", "Functional Tags", "Technology Tags", is_exclusive',
    'Articleship Jobs': ', "Exposure Tags", "Firm Type", "Client Exposure Tags", "Stipend Range"'
};
const SEARCH_COLUMNS = {
    'Fresher Jobs': ['Company', 'Description', 'Primary Domain', 'Secondary Domain', 'Category', 'Location'],
    'Semi Qualified Jobs': ['Company', 'Description', 'Primary Domain', 'Secondary Domain', 'Category', 'Location'],
    'Industrial Training Job Portal': ['Company', 'Description', 'Primary Domain', 'Category', 'Location'],
    'Articleship Jobs': ['Company', 'Description', 'Primary Domain', 'Category', 'Location']
};
// Same wording the CA portal records in consentform (scripts/portal3.js).
const DPDP_CONSENT_TEXT = 'I consent to My Student Club sharing my CV and complete profile details with potential companies and recruiters for job-matching purposes.';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const app = {
    client: null,
    session: null,
    course: null,
    lane: null,
    mode: 'regex',
    filters: defaultFilters(),
    jobs: [],
    jobsByKey: new Map(),
    signatures: new Map(),
    applied: new Set(),
    cursor: null,
    page: 0,
    hasMore: false,
    loading: false,
    requestId: 0,
    total: null,
    activeKey: null,
    lastFocus: null,
    consent: null,
    refocusChip: null,
    focusNewCards: false,
    passthrough: {}
};

// ---------------------------------------------------------------- utilities

function icon(name, extraClass = '') {
    return `<svg class="pp-icon ${extraClass}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;
}

function storageGet(store, key, fallback) {
    try {
        const raw = store.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
        return fallback;
    }
}

function storageSet(store, key, value) {
    try {
        store.setItem(key, JSON.stringify(value));
    } catch (_) { /* private mode or quota: the page still works */ }
}

function toast(message, tone = 'info') {
    let region = $('#ppToast');
    if (!region) return;
    region.textContent = message;
    region.dataset.tone = tone;
    region.classList.add('is-visible');
    clearTimeout(region._timer);
    region._timer = setTimeout(() => region.classList.remove('is-visible'), 3200);
}

function track(event, params = {}) {
    try {
        if (typeof window.gtag === 'function') window.gtag('event', event, { course: app.course?.code, lane: app.lane?.key, ...params });
    } catch (_) { /* analytics must never break the page */ }
}

function loginUrl() {
    // Same-origin relative path only: login.html navigates to this value.
    return `/login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}

function signupUrl() {
    return `/sign-up.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
}

function laneByKey(course, key) {
    return course.lanes.find(lane => lane.key === key) || null;
}

function laneForJob(job) {
    // A job is shown under the lane of the page it was opened from; on the hub
    // page each job carries the lane it was fetched for.
    return job.__lane || app.lane;
}

function isRecruiterPosted(job) {
    return Boolean(job?.posted_by);
}

function companyInitial(job) {
    const name = String(job?.Company || '').trim();
    return name ? name.charAt(0).toUpperCase() : '?';
}

function payText(job) {
    const lane = laneForJob(job);
    return formatPay(job, lane?.pay || 'salary');
}

function domainText(job) {
    return job['Primary Domain'] || job.Category || '';
}

function qualificationsFor(job) {
    if (!job.__quals) job.__quals = detectQualifications(job.Description || '', QUAL_PATTERNS);
    return job.__quals;
}

function stageMentions(job) {
    if (!job.__stages) {
        job.__stages = (app.course.stages || [])
            .filter(stage => stage.pattern && matchesPattern(job.Description || '', stage.pattern))
            .map(stage => stage.label);
    }
    return job.__stages;
}

// ---------------------------------------------------------------- saved / applied

function savedRefs() {
    const refs = storageGet(localStorage, SAVED_JOBS_KEY, []);
    return Array.isArray(refs) ? refs : [];
}

function isSaved(job) {
    return savedRefs().some(ref => String(ref.id) === String(job.id) && ref.table === job.__table);
}

function toggleSaved(job) {
    const refs = savedRefs();
    const index = refs.findIndex(ref => String(ref.id) === String(job.id) && ref.table === job.__table);
    if (index >= 0) {
        refs.splice(index, 1);
        forgetCourseRef(job, 'saved');
        toast('Removed from saved listings.');
    } else {
        refs.push({ id: job.id, table: job.__table, savedAt: new Date().toISOString() });
        rememberCourseRef(job, 'saved');
        rememberCourse();
        toast('Saved. Find it any time under Applications → Saved.', 'success');
        track('pp_save', { job: jobKey(job.__table, job.id) });
    }
    storageSet(localStorage, SAVED_JOBS_KEY, refs);
    syncSavedButtons(job);
    updateSavedCount();
}

function syncSavedButtons(job) {
    const key = jobKey(job.__table, job.id);
    const saved = isSaved(job);
    $$(`[data-save="${key}"]`).forEach(button => {
        button.setAttribute('aria-pressed', String(saved));
        button.classList.toggle('is-on', saved);
        const label = button.querySelector('.pp-save-label');
        if (label) label.textContent = saved ? 'Saved' : 'Save';
    });
}

function updateSavedCount() {
    // Saved listings show under "Saved only"; a raw count would include saves
    // from other sections that share the table, so none is shown.
}

// Tells the Applications page (history.js) which course and section a saved or
// applied listing came from, since the job tables themselves are shared with CA.
// history.js labels an entry as CS / CMA only for what happened here:
// `how` is 'saved' or 'applied'.
function rememberCourseRef(job, how) {
    const lane = laneForJob(job);
    if (!lane) return;
    const refs = storageGet(localStorage, PRO_JOBS_KEY, {});
    const key = `${job.__table}:${job.id}`;
    const previous = refs[key] || {};
    delete refs[key];
    refs[key] = {
        label: `${app.course.name} · ${lane.tab}`,
        path: `${lane.path}?job=${encodeURIComponent(jobKey(job.__table, job.id))}`,
        saved: Boolean(previous.saved),
        applied: Boolean(previous.applied),
        [how]: true
    };
    const keys = Object.keys(refs);
    keys.slice(0, Math.max(0, keys.length - PRO_JOBS_LIMIT)).forEach(old => delete refs[old]);
    storageSet(localStorage, PRO_JOBS_KEY, refs);
}

function forgetCourseRef(job, how) {
    const refs = storageGet(localStorage, PRO_JOBS_KEY, {});
    const key = `${job.__table}:${job.id}`;
    if (!refs[key]) return;
    refs[key][how] = false;
    if (!refs[key].saved && !refs[key].applied) delete refs[key];
    storageSet(localStorage, PRO_JOBS_KEY, refs);
}

// The CA homepage skips its CA-only onboarding for CS / CMA students. Record
// the course only when someone acts here (save or apply), not on a visit.
function rememberCourse() {
    try {
        localStorage.setItem('msc_course', app.course.key);
    } catch (_) { /* ignore */ }
}

function isApplied(job) {
    return app.applied.has(jobKey(job.__table, job.id));
}

async function loadApplied() {
    if (!app.session) return;
    try {
        const { data, error } = await app.client
            .from('job_applications')
            .select('job_id, job_table')
            .eq('user_id', app.session.user.id)
            .limit(2000);
        if (error) throw error;
        app.applied = new Set((data || []).map(appliedKeyFromRow).filter(Boolean));
    } catch (error) {
        console.warn('[pro-portal] could not load applications', error);
    }
}

async function recordApplication(job) {
    const key = jobKey(job.__table, job.id);
    if (!app.session) return false;
    if (app.applied.has(key)) return true;
    app.applied.add(key);
    const { error } = await app.client.from('job_applications').insert(applicationRow(app.session.user.id, job.__table, job.id));
    if (error && error.code !== '23505') {
        app.applied.delete(key);
        console.warn('[pro-portal] could not record application', error);
        return false;
    }
    rememberCourseRef(job, 'applied');
    rememberCourse();
    $$(`[data-card="${key}"]`).forEach(card => card.classList.add('is-applied'));
    $$(`[data-card="${key}"] .pp-applied-flag`).forEach(flag => { flag.hidden = false; });
    return true;
}

// ---------------------------------------------------------------- Easy Apply (recruiter-posted)

async function loadConsent() {
    if (!app.session || app.consent !== null) return app.consent;
    try {
        const { data } = await app.client
            .from('consentform')
            .select('cv_sharing_consent')
            .eq('user_id', app.session.user.id)
            .maybeSingle();
        app.consent = Boolean(data?.cv_sharing_consent);
    } catch (_) {
        app.consent = false;
    }
    return app.consent;
}

async function recordConsent() {
    const now = new Date().toISOString();
    const { error } = await app.client.from('consentform').upsert({
        user_id: app.session.user.id,
        cv_sharing_consent: true,
        consent_text: DPDP_CONSENT_TEXT,
        consented_at: now,
        withdrawn_at: null,
        user_agent: navigator.userAgent,
        updated_at: now
    }, { onConflict: 'user_id' });
    if (error) throw error;
    app.consent = true;
}

// The profile cache can be stale on these pages, so refresh it the same way
// the CA portal does before checking completeness.
async function freshProfile() {
    if (app.session && window.MSCProfileState?.hydrateProfileFromSupabase) {
        try {
            const hydrated = await window.MSCProfileState.hydrateProfileFromSupabase(app.client, app.session.user);
            if (hydrated?.data?.ocr_cv) localStorage.setItem('userCVText', hydrated.data.ocr_cv);
            if (hydrated?.profile) return { ...hydrated.profile, looking_for: hydrated.data?.looking_for };
        } catch (error) {
            console.warn('[pro-portal] profile refresh failed', error);
        }
    }
    return readCachedProfile(localStorage);
}

// Same checklist as the CA portal minus "job preference", whose options are all
// CA lanes; requiring it would push CS/CMA students into CA redirects.
// Marks a button busy without the disabled property, so keyboard focus stays
// on it (and inside the detail sheet) while the request runs.
function setBusy(button, busy, html) {
    button.setAttribute('aria-disabled', String(busy));
    button.classList.toggle('is-busy', busy);
    if (html !== undefined) button.innerHTML = html;
}

const isBusy = button => button.getAttribute('aria-disabled') === 'true';

function profileCompletion(profile) {
    const items = getProfileCompletionItems(profile, localStorage).filter(item => item.label !== 'Add job preference');
    const total = items.reduce((sum, item) => sum + item.boost, 0);
    const filled = items.filter(item => item.filled).reduce((sum, item) => sum + item.boost, 0);
    return total ? Math.round((filled / total) * 100) : 0;
}

async function easyApply(job, button) {
    if (!app.session) {
        window.location.href = loginUrl();
        return;
    }
    const consent = $('#ppConsent');
    const status = $('#ppEasyStatus');
    if (consent && !consent.checked) {
        consent.focus();
        toast('Tick the consent box to share your profile with this recruiter.', 'error');
        return;
    }
    if (isBusy(button)) return;
    const original = button.innerHTML;
    setBusy(button, true, '<span class="pp-spinner" aria-hidden="true"></span> Checking your profile…');
    try {
        const percent = profileCompletion(await freshProfile());
        if (percent < 100) {
            if (status) {
                status.innerHTML = `Your profile is ${percent}% complete. Recruiters receive your full profile and CV, so finish it first. <a href="/profile.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}">Complete my profile</a>`;
                status.classList.add('is-warn');
            }
            toast(`Complete your profile (${percent}%) to use Easy Apply.`, 'error');
            setBusy(button, false, original);
            if (status) {
                status.setAttribute('tabindex', '-1');
                status.focus();
            }
            return;
        }
        if (app.consent !== true) await recordConsent();
        if (!(await recordApplication(job))) throw new Error('Could not send your application. Please try again.');
        toast(`Application sent to ${job.Company || 'the recruiter'}.`, 'success');
        track('pp_easy_apply', { job: jobKey(job.__table, job.id) });
        if (app.activeKey === jobKey(job.__table, job.id)) renderDetail(job);
    } catch (error) {
        console.error('[pro-portal] easy apply failed', error);
        if (button.isConnected) setBusy(button, false, original);
        toast(error?.message || 'Could not send your application. Please try again.', 'error');
    }
}

// ---------------------------------------------------------------- data source

// "tagged" uses the eligible_courses column added by cs-cma-portal.sql;
// "regex" is the fallback that works before the migration runs.
async function detectMode() {
    const forced = new URLSearchParams(window.location.search).get('source');
    if (forced === 'regex' || forced === 'tagged') return forced;
    const cached = storageGet(sessionStorage, MODE_KEY, null);
    if (cached === 'regex' || cached === 'tagged') return cached;
    let mode = 'regex';
    try {
        const { error } = await app.client
            .from('Articleship Jobs')
            .select('id')
            .contains('eligible_courses', [app.course.code])
            .limit(1);
        if (!error) mode = 'tagged';
    } catch (_) { /* keep regex */ }
    storageSet(sessionStorage, MODE_KEY, mode);
    return mode;
}

function applyCourseFilter(query, course, lane, days) {
    if (days) query = query.gte('Created_At', isoDaysAgo(Math.min(days, MAX_WINDOW_DAYS)));
    if (app.mode === 'tagged') {
        query = query.contains('eligible_courses', [course.code]);
    } else {
        // Order matters: PostgREST keeps it, and the cheap gate lets Postgres
        // skip most rows before the expensive patterns run.
        query = query
            .filter('Description', 'imatch', course.match.pre)
            .filter('Description', 'imatch', course.match.pos)
            .not('Description', 'imatch', course.match.neg);
    }
    if (lane.experience) query = query.eq('Experience', lane.experience);
    if (lane.table === 'Industrial Training Job Portal') {
        // Vacancies MSC curates as exclusive belong to the paid CA programme.
        // Recruiter posts are flagged exclusive by post-a-job too, but there is
        // no CS/CMA programme, so those stay visible with Easy Apply.
        query = query.or('is_exclusive.is.null,is_exclusive.eq.false,posted_by.not.is.null');
    }
    return query;
}

function applyUserFilters(query, lane, filters) {
    for (const term of parseSearch(filters.q)) {
        const group = termOrFilter(term, SEARCH_COLUMNS[lane.table]);
        if (group) query = query.or(group);
    }
    const locations = locationOrFilter(filters.locations, LOCATION_ALIASES);
    if (locations) query = query.or(locations);
    const categoryPattern = anyOf(app.course.categories
        .filter(category => filters.categories.includes(category.key))
        .map(category => category.pattern));
    if (categoryPattern) query = query.filter('Description', 'imatch', categoryPattern);
    if (filters.payMin) query = query.gte('Salary', filters.payMin).lte('Salary', MAX_PLAUSIBLE_PAY[lane.pay]);
    if (filters.savedOnly) {
        const ids = savedRefs().filter(ref => ref.table === lane.table).map(ref => String(ref.id)).filter(isValidJobId);
        query = query.in('id', ids); // an empty list matches nothing
    }
    if (filters.hideApplied && app.applied.size) {
        const ids = Array.from(app.applied)
            .filter(key => key.startsWith(`${TABLE_SLUGS[lane.table]}:`))
            .map(key => key.slice(key.indexOf(':') + 1))
            .filter(isValidJobId)
            .slice(-200); // bound the URL length
        if (ids.length) query = query.not('id', 'in', `(${ids.join(',')})`);
    }
    return query;
}

function columnsFor(table) {
    return BASE_COLUMNS + (TABLE_COLUMNS[table] || '');
}

function tagJob(job, lane) {
    job.__table = lane.table;
    job.__lane = lane;
    return job;
}

async function fetchPage({ reset }) {
    const lane = app.lane;
    const requestId = ++app.requestId;
    if (reset) {
        app.cursor = null;
        app.page = 0;
        app.total = null;
    }
    app.loading = true;
    renderListStatus();

    let query = app.client.from(lane.table).select(columnsFor(lane.table), reset ? { count: 'exact' } : undefined);
    query = applyCourseFilter(query, app.course, lane, app.filters.days || DEFAULT_WINDOW);
    query = applyUserFilters(query, lane, app.filters);

    if (app.filters.sort === 'pay') {
        query = query.order('Salary', { ascending: false, nullsFirst: false })
            .order('Created_At', { ascending: false })
            .order('id', { ascending: false })
            .range(app.page * PAGE_SIZE, app.page * PAGE_SIZE + PAGE_SIZE - 1);
    } else {
        query = query.order('Created_At', { ascending: false }).order('id', { ascending: false });
        if (app.cursor) {
            const at = app.cursor.createdAt;
            query = query.or(`Created_At.lt."${at}",and(Created_At.eq."${at}",id.lt.${app.cursor.id})`);
        }
        query = query.limit(PAGE_SIZE);
    }

    try {
        const { data, error, count } = await query;
        if (requestId !== app.requestId) return; // a newer search replaced this one
        if (error) throw error;
        let rows = (data || []).map(job => tagJob(job, lane));
        if (app.filters.sort === 'pay') {
            // Junk Salary values (a typed range glued into one number) sort to the
            // top server-side; keep them in the results but after real pay.
            const plausible = job => Number(job.Salary) > 0 && Number(job.Salary) <= MAX_PLAUSIBLE_PAY[lane.pay];
            rows = [...rows.filter(plausible), ...rows.filter(job => !plausible(job))];
        }
        if (reset) {
            app.jobs = [];
            app.jobsByKey.clear();
            app.signatures.clear();
            if (typeof count === 'number') app.total = count;
        }
        const added = [];
        const reposted = new Set();
        for (const job of rows) {
            const key = jobKey(job.__table, job.id);
            if (app.jobsByKey.has(key)) continue;
            app.jobsByKey.set(key, job);
            // Newest copy wins; older reposts only bump its counter.
            const signature = repostSignature(job, { byCompany: lane.key.endsWith('training') });
            const original = app.signatures.get(signature);
            if (original) {
                original.__reposts = (original.__reposts || 0) + 1;
                reposted.add(original);
                continue;
            }
            app.signatures.set(signature, job);
            app.jobs.push(job);
            added.push(job);
        }
        const last = (data || [])[(data || []).length - 1];
        if (last) app.cursor = { createdAt: last.Created_At, id: last.id };
        app.page += 1;
        app.hasMore = rows.length === PAGE_SIZE;
        app.loading = false;
        renderJobs({ reset, added });
        reposted.forEach(paintRepostCount);
        if (reposted.size) renderSummary();
    } catch (error) {
        if (requestId !== app.requestId) return;
        app.loading = false;
        console.error('[pro-portal] listing query failed', error);
        if (reset) {
            renderListError(error);
            return;
        }
        // Keep the listings already on screen; the cursor is unchanged, so the
        // button simply retries.
        renderListStatus();
        const more = $('#ppMore');
        if (more) {
            more.hidden = false;
            more.textContent = 'Could not load more. Try again';
        }
        toast('Could not load more listings. Check your connection and try again.', 'error');
    }
}

// Deep links (?job=) obey the same rules as the list, minus the date window:
// the listing must be open to this course and not a programme exclusive.
// Returns { job } or { blocked: true, table, id } for a listing that exists
// elsewhere on the site but not on this course's pages.
async function fetchJobByKey(key) {
    const parsed = parseJobKey(key);
    if (!parsed) return { job: null };
    if (app.jobsByKey.has(key)) return { job: app.jobsByKey.get(key) };
    const lane = (app.lane && app.lane.table === parsed.table ? app.lane : null)
        || app.course.lanes.find(l => l.table === parsed.table);
    if (!lane) return { job: null };
    try {
        let query = app.client.from(parsed.table).select(columnsFor(parsed.table));
        query = applyCourseFilter(query, app.course, lane, 0).eq('id', parsed.id);
        const { data, error } = await query.maybeSingle();
        if (error) return { job: null };
        if (!data) return { blocked: true, table: parsed.table, id: parsed.id };
        const job = tagJob(data, lane);
        app.jobsByKey.set(key, job);
        return { job };
    } catch (_) {
        return { job: null };
    }
}

async function laneCount(course, lane) {
    let query = app.client.from(lane.table).select('id', { count: 'exact', head: true });
    query = applyCourseFilter(query, course, lane, DEFAULT_WINDOW);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? 0;
}

async function loadLaneCounts(course) {
    const cacheKey = `${COUNT_CACHE_KEY}:${course.key}:${app.mode}`;
    const cached = storageGet(sessionStorage, cacheKey, null);
    if (cached && Date.now() - cached.at < COUNT_TTL_MS) return cached.counts;
    const counts = {};
    await Promise.all(course.lanes.map(async lane => {
        try {
            counts[lane.key] = await laneCount(course, lane);
        } catch (_) {
            counts[lane.key] = null;
        }
    }));
    storageSet(sessionStorage, cacheKey, { at: Date.now(), counts });
    return counts;
}

function paintLaneCounts(counts) {
    for (const [key, count] of Object.entries(counts || {})) {
        $$(`[data-lane-count="${key}"]`).forEach(el => {
            el.textContent = typeof count === 'number' ? String(count) : '';
            el.hidden = typeof count !== 'number';
        });
    }
    revealCurrentLane();
}

// ---------------------------------------------------------------- rendering: header

function renderAuth() {
    const slot = $('#ppAuth');
    if (!slot) return;
    if (app.session) {
        const profile = storageGet(localStorage, 'userProfileData', {});
        const name = String(profile?.name || app.session.user.email || '').trim();
        slot.innerHTML = `
            <a class="pp-btn pp-btn-ghost pp-hide-sm" href="/history.html">${icon('check-circle')}<span>Applications</span></a>
            <a class="pp-avatar" href="/profile.html" aria-label="Your profile">${escapeHtml(name.charAt(0).toUpperCase() || 'U')}</a>`;
    } else {
        slot.innerHTML = `
            <a class="pp-btn pp-btn-ghost" href="${escapeHtml(loginUrl())}">Log in</a>
            <a class="pp-btn pp-btn-primary pp-hide-sm" href="${escapeHtml(signupUrl())}">Sign up free</a>`;
    }
}

function bindMenu() {
    const toggle = $('#ppMenuToggle');
    const menu = $('#ppMenu');
    if (!toggle || !menu) return;
    // The menu scrolls inside the viewport; the page behind it stays put.
    const close = () => {
        menu.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        document.documentElement.classList.remove('pp-menu-open');
    };
    toggle.addEventListener('click', () => {
        const open = menu.hidden;
        menu.hidden = !open;
        toggle.setAttribute('aria-expanded', String(open));
        document.documentElement.classList.toggle('pp-menu-open', open);
        if (open) menu.querySelector('a')?.focus();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !menu.hidden) {
            close();
            toggle.focus();
        }
    });
    document.addEventListener('click', event => {
        if (!menu.hidden && !menu.contains(event.target) && !toggle.contains(event.target)) close();
    });
}

// ---------------------------------------------------------------- rendering: cards

function qualificationBadges(job, { compact = false } = {}) {
    const quals = qualificationsFor(job);
    if (!quals.length) return '';
    const items = quals.map(code => `<span class="pp-qual${code === app.course.code ? ' is-course' : ''}">${escapeHtml(code)}</span>`).join('');
    return `<span class="pp-quals" title="Qualifications this listing mentions">${compact ? '' : '<span class="pp-quals-label">Open to</span>'}${items}</span>`;
}

function caFirmFlag(job, lane = laneForJob(job)) {
    return lane.trainerCheck && isCaFirmOnly(`${job.Company || ''}\n${job.Description || ''}`, lane.trainerCheck)
        ? lane.trainerCheck
        : null;
}

function cardHtml(job) {
    const key = jobKey(job.__table, job.id);
    const lane = laneForJob(job);
    const firmFlag = caFirmFlag(job, lane);
    const pay = payText(job);
    const domain = domainText(job);
    const closed = isLikelyClosed(job.Created_At);
    const days = timeAgo(job.Created_At);
    const fresh = !closed && /today|yesterday/.test(days);
    const snippet = truncate(maskContacts(stripMarkdown(job.Description || '')), 150);
    const saved = isSaved(job);
    const applied = isApplied(job);
    const href = `${lane.path}?job=${encodeURIComponent(key)}`;
    const meta = [
        job.Location ? `<span>${icon('pin')}${escapeHtml(truncate(job.Location, 40))}</span>` : '',
        domain ? `<span>${icon('briefcase')}${escapeHtml(domain)}</span>` : '',
        job.Experience && lane.key === 'semi-qualified' ? `<span>${icon('clock')}${escapeHtml(job.Experience)}</span>` : ''
    ].filter(Boolean).join('');
    return `
        <article class="pp-card${closed ? ' is-closed' : ''}${applied ? ' is-applied' : ''}${app.activeKey === key ? ' is-active' : ''}" data-card="${key}">
            <div class="pp-card-logo" aria-hidden="true">${escapeHtml(companyInitial(job))}</div>
            <div class="pp-card-body">
                <h3 class="pp-card-title"><a href="${escapeHtml(href)}" data-open="${key}">${escapeHtml(job.Company || 'Company not named')}</a></h3>
                <p class="pp-card-meta">${meta}</p>
                ${snippet ? `<p class="pp-card-snippet">${escapeHtml(snippet)}</p>` : ''}
                <div class="pp-card-foot">
                    ${qualificationBadges(job)}
                    ${firmFlag ? `<span class="pp-firm-flag" title="${escapeHtml(firmFlag.note)}">${icon('alert')}${escapeHtml(firmFlag.badge)}</span>` : ''}
                    <span class="pp-card-time${closed ? ' is-closed' : ''}">${closed ? `${icon('alert')}Posted ${escapeHtml(days)} · may be filled` : `${fresh ? '<span class="pp-dot" aria-hidden="true"></span>' : ''}Posted ${escapeHtml(days)}`}</span>
                    <span class="pp-applied-flag" ${applied ? '' : 'hidden'}>${icon('check')}Applied</span>
                    <span class="pp-repost" data-repost ${job.__reposts ? '' : 'hidden'}>${job.__reposts ? `Reposted ${job.__reposts + 1}×` : ''}</span>
                </div>
            </div>
            <div class="pp-card-side">
                ${pay ? `<span class="pp-card-pay">${escapeHtml(pay)}</span>` : `<span class="pp-card-pay is-muted">${lane.pay === 'stipend' ? 'Stipend not stated' : 'Salary not stated'}</span>`}
                <button type="button" class="pp-icon-btn${saved ? ' is-on' : ''}" data-save="${key}" aria-pressed="${saved}" aria-label="Save ${escapeHtml(job.Company || 'listing')}">${icon('bookmark')}</button>
            </div>
        </article>`;
}

function paintRepostCount(job) {
    const badge = $(`[data-card="${jobKey(job.__table, job.id)}"] [data-repost]`);
    if (!badge) return;
    badge.hidden = false;
    badge.textContent = `Reposted ${job.__reposts + 1}×`;
    badge.title = 'The same opening was posted more than once. We show the newest copy.';
}

function renderSkeleton(count = 4) {
    return Array.from({ length: count }, () => `
        <div class="pp-card pp-skeleton" aria-hidden="true">
            <div class="pp-card-logo"></div>
            <div class="pp-card-body"><span></span><span></span><span></span></div>
        </div>`).join('');
}

function renderListStatus() {
    const list = $('#ppList');
    const more = $('#ppMore');
    if (!list) return;
    if (app.loading && app.page === 0) {
        list.setAttribute('aria-busy', 'true');
        list.innerHTML = renderSkeleton();
    }
    if (more) {
        more.hidden = !(app.hasMore || (app.loading && app.page > 0));
        setBusy(more, app.loading);
        more.textContent = app.loading && app.page > 0 ? 'Loading…' : 'Show more listings';
    }
}

function renderSummary() {
    const el = $('#ppSummary');
    if (!el) return;
    const windowText = `in the last ${app.filters.days} days`;
    if (app.total === null) {
        el.textContent = '';
        return;
    }
    const noun = app.lane.noun || 'listings';
    const merged = app.jobs.reduce((sum, job) => sum + (job.__reposts || 0), 0);
    el.innerHTML = app.total === 0
        ? `No ${escapeHtml(noun)} ${windowText}`
        : `<strong>${app.total.toLocaleString('en-IN')}</strong> ${escapeHtml(noun)} ${windowText}${merged ? ` <span class="pp-muted">· ${merged} repost${merged > 1 ? 's' : ''} merged</span>` : ''}`;
}

function renderJobs({ reset, added }) {
    const list = $('#ppList');
    if (!list) return;
    list.setAttribute('aria-busy', 'false');
    if (reset) list.innerHTML = '';
    if (app.jobs.length === 0) {
        list.innerHTML = emptyStateHtml();
        bindEmptyState(list);
    } else {
        list.insertAdjacentHTML('beforeend', added.map(cardHtml).join(''));
        if (!reset && app.focusNewCards) {
            const first = added[0] && $(`[data-card="${CSS.escape(jobKey(added[0].__table, added[0].id))}"] [data-open]`);
            if (first) first.focus();
        }
    }
    app.focusNewCards = false;
    renderSummary();
    renderListStatus();
    renderActiveChips();
    if (reset) {
        const live = $('#ppLive');
        if (live) live.textContent = app.total === null ? '' : `${app.total} ${app.lane.noun || 'listings'} found`;
    }
}

function emptyStateHtml() {
    const active = countActiveFilters(app.filters);
    const otherLanes = app.course.lanes.filter(lane => lane.key !== app.lane.key);
    const suggestions = [];
    if (active) suggestions.push(`<button type="button" class="pp-btn pp-btn-primary" data-empty="clear">Clear all filters</button>`);
    if (app.filters.days < MAX_WINDOW_DAYS) suggestions.push(`<button type="button" class="pp-btn pp-btn-ghost" data-empty="widen">Include the last ${MAX_WINDOW_DAYS} days</button>`);
    return `
        <div class="pp-empty">
            <div class="pp-empty-icon" aria-hidden="true">${icon('search')}</div>
            <h3>${active ? 'Nothing matches these filters' : escapeHtml(app.lane.emptyTitle || 'No openings right now')}</h3>
            <p>${escapeHtml(active ? 'Try fewer filters or a wider date range.' : (app.lane.emptyHint || 'New listings are added through the day. Check back soon.'))}</p>
            ${suggestions.length ? `<div class="pp-empty-actions">${suggestions.join('')}</div>` : ''}
            <p class="pp-empty-sub">Other ${escapeHtml(app.course.name)} openings:</p>
            <ul class="pp-empty-lanes">
                ${otherLanes.map(lane => `<li><a href="${escapeHtml(lane.path)}">${escapeHtml(lane.tab)} <span class="pp-count" data-lane-count="${lane.key}" hidden></span></a></li>`).join('')}
            </ul>
        </div>`;
}

function bindEmptyState(root) {
    root.querySelector('[data-empty="clear"]')?.addEventListener('click', () => {
        app.filters = defaultFilters();
        syncControls();
        commitFilters();
    });
    root.querySelector('[data-empty="widen"]')?.addEventListener('click', () => {
        app.filters.days = MAX_WINDOW_DAYS;
        syncControls();
        commitFilters();
    });
    paintLaneCounts(storageGet(sessionStorage, `${COUNT_CACHE_KEY}:${app.course.key}:${app.mode}`, null)?.counts);
}

function renderListError(error) {
    const list = $('#ppList');
    if (!list) return;
    list.setAttribute('aria-busy', 'false');
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    list.innerHTML = `
        <div class="pp-empty pp-error" role="alert">
            <div class="pp-empty-icon" aria-hidden="true">${icon('alert')}</div>
            <h3>${offline ? 'You appear to be offline' : 'We could not load listings'}</h3>
            <p>${offline ? 'Reconnect and try again.' : 'This is usually temporary. Please try again in a moment.'}</p>
            <div class="pp-empty-actions"><button type="button" class="pp-btn pp-btn-primary" data-retry>Try again</button></div>
        </div>`;
    list.querySelector('[data-retry]').addEventListener('click', () => fetchPage({ reset: true }));
    const more = $('#ppMore');
    if (more) more.hidden = true;
    track('pp_list_error', { code: error?.code || 'unknown' });
}

// ---------------------------------------------------------------- filters UI

function renderActiveChips() {
    const wrap = $('#ppChips');
    if (!wrap) return;
    const chips = [];
    const f = app.filters;
    if (f.q) chips.push({ label: `“${f.q}”`, clear: () => { f.q = ''; } });
    f.locations.forEach(loc => chips.push({ label: loc, clear: () => { f.locations = f.locations.filter(x => x !== loc); } }));
    f.categories.forEach(key => {
        const category = app.course.categories.find(c => c.key === key);
        if (category) chips.push({ label: category.label, clear: () => { f.categories = f.categories.filter(x => x !== key); } });
    });
    if (f.payMin) chips.push({ label: payOptionLabel(f.payMin), clear: () => { f.payMin = 0; } });
    if (f.days !== DEFAULT_WINDOW) chips.push({ label: `Last ${f.days} days`, clear: () => { f.days = DEFAULT_WINDOW; } });
    if (f.savedOnly) chips.push({ label: 'Saved only', clear: () => { f.savedOnly = false; } });
    if (f.hideApplied) chips.push({ label: 'Hiding applied', clear: () => { f.hideApplied = false; } });
    wrap.innerHTML = chips.map((chip, i) => `<button type="button" class="pp-chip" data-chip="${i}">${escapeHtml(chip.label)}${icon('x')}<span class="pp-sr">Remove filter</span></button>`).join('')
        + (chips.length > 1 ? '<button type="button" class="pp-chip-clear" data-chip="all">Clear all</button>' : '');
    wrap.hidden = chips.length === 0;
    if (app.refocusChip !== null && app.refocusChip !== undefined) {
        const buttons = wrap.querySelectorAll('[data-chip]');
        const target = buttons[Math.min(app.refocusChip, buttons.length - 1)] || $('#ppSearch');
        app.refocusChip = null;
        target?.focus();
    }
    wrap.querySelectorAll('[data-chip]').forEach(button => {
        button.addEventListener('click', () => {
            app.refocusChip = button.dataset.chip === 'all' ? 0 : Number(button.dataset.chip);
            if (button.dataset.chip === 'all') {
                app.filters = { ...defaultFilters(), sort: app.filters.sort };
            } else {
                chips[Number(button.dataset.chip)].clear();
            }
            syncControls();
            commitFilters();
        });
    });
    const badge = $('#ppFilterBadge');
    if (badge) {
        const n = countActiveFilters(app.filters) - (app.filters.q ? 1 : 0);
        badge.textContent = n ? String(n) : '';
        badge.hidden = !n;
    }
}

function payOptionLabel(value) {
    const kind = app.lane.pay;
    if (kind === 'stipend') return `₹${value.toLocaleString('en-IN')}+ / month`;
    return `₹${value / 100000}+ LPA`;
}

function buildFilterControls() {
    const form = $('#ppFilters');
    if (!form) return;
    const locationOptions = LOCATIONS.map(loc => `
        <label class="pp-check"><input type="checkbox" name="loc" value="${escapeHtml(loc)}"><span>${escapeHtml(loc)}</span></label>`).join('');
    const categoryOptions = app.course.categories.map(category => `
        <label class="pp-check"><input type="checkbox" name="cat" value="${escapeHtml(category.key)}"><span>${escapeHtml(category.label)}</span></label>`).join('');
    const payOptions = (PAY_OPTIONS[app.lane.pay] || []).map(value => `
        <label class="pp-radio"><input type="radio" name="pay" value="${value}"><span>${escapeHtml(payOptionLabel(value))}</span></label>`).join('');
    form.innerHTML = `
        <fieldset class="pp-fieldset">
            <legend>Posted</legend>
            <div class="pp-segment">
                ${WINDOW_OPTIONS.map(days => `<label><input type="radio" name="days" value="${days}"><span>${days} days</span></label>`).join('')}
            </div>
        </fieldset>
        <fieldset class="pp-fieldset">
            <legend>${app.lane.pay === 'stipend' ? 'Minimum stipend' : 'Minimum salary'}</legend>
            <label class="pp-radio"><input type="radio" name="pay" value="0"><span>Any</span></label>
            ${payOptions}
            <p class="pp-hint">Listings that do not state pay are hidden when a minimum is set.</p>
        </fieldset>
        <fieldset class="pp-fieldset">
            <legend>Work area</legend>
            <div class="pp-checklist">${categoryOptions}</div>
        </fieldset>
        <fieldset class="pp-fieldset">
            <legend>City</legend>
            <div class="pp-checklist pp-checklist-cols">${locationOptions}</div>
        </fieldset>
        <fieldset class="pp-fieldset">
            <legend>My listings</legend>
            <label class="pp-check"><input type="checkbox" name="saved"><span>Saved only</span></label>
            <label class="pp-check${app.session ? '' : ' is-disabled'}"><input type="checkbox" name="hideApplied" ${app.session ? '' : 'disabled'}><span>Hide ones I applied to${app.session ? '' : ' (log in)'}</span></label>
        </fieldset>`;
    form.addEventListener('change', () => {
        readControls();
        commitFilters();
    });
    updateSavedCount();
}

function syncControls() {
    const f = app.filters;
    const search = $('#ppSearch');
    if (search && document.activeElement !== search) search.value = f.q;
    const form = $('#ppFilters');
    if (form) {
        $$('input[name="loc"]', form).forEach(input => { input.checked = f.locations.some(loc => loc.toLowerCase() === input.value.toLowerCase()); });
        $$('input[name="cat"]', form).forEach(input => { input.checked = f.categories.includes(input.value); });
        $$('input[name="pay"]', form).forEach(input => { input.checked = Number(input.value) === Number(f.payMin || 0); });
        $$('input[name="days"]', form).forEach(input => { input.checked = Number(input.value) === f.days; });
        const saved = $('input[name="saved"]', form);
        if (saved) saved.checked = f.savedOnly;
        const hide = $('input[name="hideApplied"]', form);
        if (hide) hide.checked = f.hideApplied;
    }
    const sort = $('#ppSort');
    if (sort) sort.value = f.sort;
}

function readControls() {
    const form = $('#ppFilters');
    if (!form) return;
    const f = app.filters;
    f.locations = $$('input[name="loc"]:checked', form).map(input => input.value);
    f.categories = $$('input[name="cat"]:checked', form).map(input => input.value);
    f.payMin = Number($('input[name="pay"]:checked', form)?.value || 0);
    f.days = Number($('input[name="days"]:checked', form)?.value || DEFAULT_WINDOW);
    f.savedOnly = Boolean($('input[name="saved"]', form)?.checked);
    f.hideApplied = Boolean($('input[name="hideApplied"]', form)?.checked);
}

const OWN_PARAMS = new Set(['q', 'loc', 'cat', 'pay', 'days', 'sort', 'saved', 'hide_applied', 'job', 'source']);

function currentUrl({ job = app.activeKey } = {}) {
    return `${window.location.pathname}${encodeFilters(app.filters, { ...app.passthrough, job })}`;
}

function commitFilters() {
    history.replaceState({ job: app.activeKey }, '', currentUrl());
    fetchPage({ reset: true });
    track('pp_filter', { active: countActiveFilters(app.filters) });
}

function bindListControls() {
    const searchForm = $('#ppSearchForm');
    const search = $('#ppSearch');
    let debounce = null;
    searchForm?.addEventListener('submit', event => {
        event.preventDefault();
        clearTimeout(debounce);
        app.filters.q = search.value.trim();
        commitFilters();
        if (window.matchMedia('(max-width: 899px)').matches) search.blur();
    });
    search?.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
            const next = search.value.trim();
            if (next === app.filters.q) return;
            if (next && parseSearch(next).length === 0) return; // only symbols typed so far
            app.filters.q = next;
            commitFilters();
        }, 450);
    });
    $('#ppSort')?.addEventListener('change', event => {
        app.filters.sort = event.target.value === 'pay' ? 'pay' : 'newest';
        commitFilters();
    });
    $('#ppMore')?.addEventListener('click', () => {
        if (app.loading || !app.hasMore) return;
        app.focusNewCards = true;
        fetchPage({ reset: false });
    });
    const sentinel = $('#ppSentinel');
    if (sentinel && 'IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            if (entries.some(entry => entry.isIntersecting) && app.hasMore && !app.loading && app.page > 0 && app.page < 6) {
                fetchPage({ reset: false });
            }
        }, { rootMargin: '400px' }).observe(sentinel);
    }
    const list = $('#ppList');
    list?.addEventListener('click', event => {
        const save = event.target.closest('[data-save]');
        if (save) {
            event.preventDefault();
            const job = app.jobsByKey.get(save.dataset.save);
            if (job) toggleSaved(job);
            return;
        }
        const open = event.target.closest('[data-open]');
        if (open && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
            event.preventDefault();
            openJob(open.dataset.open, { push: true, trigger: open });
        }
    });
    bindFilterDrawer();
}

function bindFilterDrawer() {
    const drawer = $('#ppDrawer');
    const openBtn = $('#ppOpenFilters');
    if (!drawer || !openBtn) return;
    const closeBtns = $$('[data-close-drawer]', drawer);
    const mq = window.matchMedia('(max-width: 1199px)');
    const panel = drawer.querySelector('.pp-drawer-panel');
    const syncDialog = () => {
        if (!panel) return;
        if (mq.matches) {
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('aria-labelledby', 'ppDrawerTitle');
        } else {
            panel.removeAttribute('role');
            panel.removeAttribute('aria-modal');
            panel.removeAttribute('aria-labelledby');
        }
    };
    const setOpen = open => {
        drawer.classList.toggle('is-open', open);
        document.documentElement.classList.toggle('pp-lock', open && mq.matches);
        openBtn.setAttribute('aria-expanded', String(open));
        syncDialog();
        if (open) {
            drawer.querySelector('[data-close-drawer]')?.focus();
        } else {
            openBtn.focus();
        }
    };
    openBtn.addEventListener('click', () => setOpen(true));
    closeBtns.forEach(btn => btn.addEventListener('click', () => setOpen(false)));
    document.addEventListener('keydown', event => {
        if (!drawer.classList.contains('is-open') || !mq.matches) return;
        if (event.key === 'Escape') setOpen(false);
        if (event.key === 'Tab') trapFocus(event, panel);
    });
    drawer.addEventListener('click', event => {
        if (event.target === drawer) setOpen(false);
    });
    mq.addEventListener?.('change', () => {
        syncDialog();
        if (!mq.matches) {
            drawer.classList.remove('is-open');
            openBtn.setAttribute('aria-expanded', 'false');
            if (!(isSheet() && app.activeKey)) document.documentElement.classList.remove('pp-lock');
        }
    });
}

function trapFocus(event, container) {
    if (!container) return;
    const focusable = $$('a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])', container)
        .filter(el => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (!container.contains(active) || active === container) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
    }
}

// ---------------------------------------------------------------- detail panel

const isSheet = () => window.matchMedia('(max-width: 899px)').matches;

// The detail panel is a modal sheet below 900px and a side panel above it.
function syncSheetMode() {
    const panel = $('#ppDetail');
    if (!panel) return;
    const modal = isSheet() && Boolean(app.activeKey);
    if (modal) {
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        document.documentElement.classList.add('pp-lock');
        return;
    }
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    if (!$('#ppDrawer')?.classList.contains('is-open')) document.documentElement.classList.remove('pp-lock');
}

async function openJob(key, { push = false, trigger = null } = {}) {
    const panel = $('#ppDetail');
    if (!panel) return;
    const previousKey = app.activeKey;
    app.lastFocus = trigger || document.activeElement;
    app.activeKey = key;
    $$('.pp-card.is-active').forEach(card => card.classList.remove('is-active'));
    $(`[data-card="${CSS.escape(key)}"]`)?.classList.add('is-active');
    panel.classList.add('is-open');
    panel.innerHTML = `<div class="pp-detail-inner"><div class="pp-detail-loading">${renderSkeleton(1)}</div></div>`;
    syncSheetMode();
    // `pushed` marks entries this page added, so Close can safely go back.
    // Switching listings replaces that entry, so Close always means close.
    if (push && previousKey !== key) {
        if (previousKey && history.state?.pushed) history.replaceState({ job: key, pushed: true }, '', currentUrl({ job: key }));
        else history.pushState({ job: key, pushed: true }, '', currentUrl({ job: key }));
    }
    const { job, blocked, table, id } = await fetchJobByKey(key);
    if (app.activeKey !== key) return;
    if (!job) {
        const caType = { 'Industrial Training Job Portal': 'industrial', 'Articleship Jobs': 'articleship', 'Semi Qualified Jobs': 'semi', 'Fresher Jobs': 'fresher' }[table];
        panel.innerHTML = `
            <div class="pp-detail-inner">
                <div class="pp-detail-top"><span></span><button type="button" class="pp-icon-btn" data-close-detail aria-label="Close">${icon('x')}</button></div>
                <div class="pp-empty">
                    <h3>${blocked ? `This listing is not open to ${escapeHtml(app.course.name)} students` : 'This listing is no longer available'}</h3>
                    <p>${blocked ? 'It does not mention ' + escapeHtml(app.course.name) + ' candidates, or it is reserved for MSC programme members.' : 'It may have been filled or removed.'}</p>
                    ${blocked && caType ? `<div class="pp-empty-actions"><a class="pp-btn pp-btn-ghost" href="/job.html?id=${encodeURIComponent(id)}&type=${caType}">View it on the CA portal</a></div>` : ''}
                </div>
            </div>`;
        bindDetail(panel, null);
        return;
    }
    if (isRecruiterPosted(job)) await loadConsent();
    if (app.activeKey !== key) return;
    renderDetail(job);
    track('pp_view_job', { job: key });
}

function closeJob({ pop = false } = {}) {
    const panel = $('#ppDetail');
    if (!panel || !app.activeKey) return;
    const key = app.activeKey;
    app.activeKey = null;
    panel.classList.remove('is-open');
    syncSheetMode();
    panel.innerHTML = detailPlaceholderHtml();
    $$('.pp-card.is-active').forEach(card => card.classList.remove('is-active'));
    if (!pop) history.replaceState({ job: null }, '', currentUrl({ job: null }));
    // The list may have re-rendered (filters changed on Back); fall back to
    // the same listing's new card. On Back, wait a tick: returning to a
    // #fragment entry (the skip link) resets focus after popstate.
    const restore = () => {
        const target = app.lastFocus && document.contains(app.lastFocus)
            ? app.lastFocus
            : $(`[data-card="${CSS.escape(key)}"] [data-open]`);
        target?.focus();
    };
    if (pop) setTimeout(restore, 0);
    else restore();
}

// Leaving a listing opened from the list goes back one entry; a listing that
// was the landing page (shared link) just closes, so we never leave the site.
function dismissJob() {
    if (history.state?.pushed) history.back();
    else closeJob();
}

function detailPlaceholderHtml() {
    const tips = app.lane?.tips || [];
    return `
        <div class="pp-detail-inner pp-detail-placeholder">
            <div class="pp-empty-icon" aria-hidden="true">${icon('cursor')}</div>
            <h2>Select a listing</h2>
            <p>Pick any opening on the left to see pay, eligibility and how to apply.</p>
            ${tips.length ? `<div class="pp-tips"><h3>${escapeHtml(app.lane.tipsTitle || 'Tips')}</h3><ul>${tips.map(tip => `<li>${escapeHtml(tip)}</li>`).join('')}</ul></div>` : ''}
        </div>`;
}

function factsHtml(job) {
    const lane = laneForJob(job);
    const facts = [];
    const pay = payText(job);
    facts.push([lane.pay === 'stipend' ? 'Stipend' : 'Salary', pay || 'Not stated']);
    if (job.Location) facts.push(['Location', job.Location]);
    facts.push(['Posted', `${timeAgo(job.Created_At)}${job.Created_At ? ` (${new Date(job.Created_At).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })})` : ''}`]);
    if (domainText(job)) facts.push(['Work area', domainText(job)]);
    if (job['Secondary Domain']) facts.push(['Also covers', job['Secondary Domain']]);
    if (job['Firm Type']) facts.push(['Firm type', job['Firm Type']]);
    if (job['Company Type']) facts.push(['Company type', job['Company Type']]);
    if (job['Industry Type']) facts.push(['Industry', job['Industry Type']]);
    if (job.Experience && lane.key === 'semi-qualified') facts.push(['Experience', job.Experience]);
    return `<dl class="pp-facts">${facts.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>`;
}

function eligibilityHtml(job) {
    const quals = qualificationsFor(job);
    const stages = stageMentions(job);
    const forCourse = quals.includes(app.course.code);
    const context = forCourse ? matchContext(stripMarkdown(job.Description || ''), app.course.match.pos) : '';
    return `
        <section class="pp-eligibility${forCourse ? '' : ' is-unclear'}" aria-label="Who can apply">
            <h3>${icon(forCourse ? 'check-circle' : 'alert')}Who can apply</h3>
            <p>${forCourse
                ? `This listing mentions <strong>${escapeHtml(app.course.name)}</strong> candidates${stages.length ? ` (${escapeHtml(stages.join(', '))})` : ''}.`
                : `This listing was tagged for ${escapeHtml(app.course.name)}, but the description does not say so in words we recognise. Read it fully before applying.`}</p>
            ${context ? `<blockquote class="pp-quote">${escapeHtml(maskContacts(context))}</blockquote>` : ''}
            ${quals.length ? `<p class="pp-eligibility-quals">${qualificationBadges(job)}</p>` : ''}
        </section>`;
}

function descriptionHtml(text, { masked }) {
    const clean = stripMarkdown(masked ? maskContacts(text) : text);
    if (!clean) return '<p class="pp-muted">No description provided.</p>';
    return clean.split(/\n{2,}/).map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('');
}

function applyState(job, unlocked) {
    if (isRecruiterPosted(job)) return { mode: 'easy', applied: isApplied(job) };
    if (!app.session) return { mode: 'login' };
    if (unlocked) return { mode: 'unlocked', target: parseApplyTarget(unlocked.applicationId) };
    return { mode: 'locked', applied: isApplied(job) };
}

function emailSubject(job) {
    return `${laneForJob(job).applySubject} at ${job.Company || 'your organisation'} (Ref: My Student Club)`;
}

// "How to apply": explains the method. The single primary button lives in
// the sticky bar (ctaHtml) so there is never more than one Apply button.
function howToApplyHtml(job, state) {
    let body = '';
    if (state.mode === 'easy') {
        if (!app.session) {
            body = `<p class="pp-apply-lead">${icon('bolt')}<span>Posted directly by the recruiter. Log in and apply with your My Student Club profile and CV in one tap.</span></p>`;
        } else if (state.applied) {
            body = `<p class="pp-apply-lead is-done">${icon('check-circle')}<span>Application sent. The recruiter sees your profile and CV in their dashboard.</span></p>`;
        } else {
            body = `
                <p class="pp-apply-lead">${icon('bolt')}<span>Posted directly by the recruiter. Easy Apply sends them your My Student Club profile and CV.</span></p>
                <label class="pp-consent"><input type="checkbox" id="ppConsent"${app.consent ? ' checked' : ''}><span>${escapeHtml(DPDP_CONSENT_TEXT)} <a href="/privacy-policy.html" target="_blank" rel="noopener">Privacy policy</a></span></label>
                <p id="ppEasyStatus" class="pp-apply-sub" aria-live="polite"></p>`;
        }
    } else if (state.mode === 'login') {
        body = `
            <p class="pp-apply-lead">${icon('lock')}<span>Log in to see the recruiter's email or application link. It's free.</span></p>
            <p class="pp-apply-sub">New here? <a href="${escapeHtml(signupUrl())}">Create a free account</a></p>`;
    } else if (state.mode === 'locked') {
        body = `
            ${state.applied ? `<p class="pp-apply-lead is-done">${icon('check-circle')}<span>You applied to this listing.</span></p>` : ''}
            <p class="pp-apply-lead">${icon('mail')}<span>Tap <strong>${state.applied ? 'Show application details' : 'Apply now'}</strong> to see the recruiter's email or link. We'll add it to your Applications.</span></p>`;
    } else if (state.target.type === 'email') {
        body = `
            <p class="pp-apply-lead">${icon('mail')}<span>Apply by email. A draft opens with the subject filled in; attach your CV before sending.</span></p>
            <div class="pp-copy">
                <code>${escapeHtml(state.target.email)}</code>
                <button type="button" class="pp-btn pp-btn-ghost pp-btn-sm" data-copy="${escapeHtml(state.target.email)}">${icon('copy')}Copy</button>
            </div>
            <p class="pp-apply-sub">No email app? Copy the address and use the subject: <em>${escapeHtml(emailSubject(job))}</em></p>`;
    } else if (state.target.type === 'url') {
        body = `<p class="pp-apply-lead">${icon('external')}<span>Apply on the recruiter's page at <strong>${escapeHtml(new URL(state.target.url).hostname)}</strong>.</span></p>`;
    } else if (state.target.type === 'search') {
        body = `<p class="pp-apply-lead">${icon('external')}<span>The recruiter did not share a link. Search their careers page.</span></p>`;
    } else {
        body = `<p class="pp-apply-lead">${icon('alert')}<span>This listing has no application details. Check the original post.</span></p>`;
    }
    const unlocked = state.mode === 'unlocked' && state.target.type !== 'none';
    return `<section class="pp-apply${unlocked ? ' is-unlocked' : ''}" aria-labelledby="ppApplyTitle">
            <h3 id="ppApplyTitle">How to apply</h3>
            ${body}
        </section>`;
}

function ctaHtml(job, state) {
    const key = jobKey(job.__table, job.id);
    const saved = isSaved(job);
    let primary;
    if (state.mode === 'easy') {
        if (!app.session) primary = `<a class="pp-btn pp-btn-primary" href="${escapeHtml(loginUrl())}">Log in to Easy Apply</a>`;
        else if (state.applied) primary = `<button type="button" class="pp-btn pp-btn-done" disabled>${icon('check')}Applied</button>`;
        else primary = `<button type="button" class="pp-btn pp-btn-primary" data-easy-apply>${icon('bolt')}Send my application</button>`;
    } else if (state.mode === 'login') {
        primary = `<a class="pp-btn pp-btn-primary" href="${escapeHtml(loginUrl())}">Log in to apply</a>`;
    } else if (state.mode === 'locked') {
        primary = `<button type="button" class="pp-btn pp-btn-primary" data-apply>${state.applied ? 'Show application details' : 'Apply now'}</button>`;
    } else if (state.target.type === 'email') {
        primary = `<a class="pp-btn pp-btn-primary" href="${escapeHtml(buildMailto(state.target.email, emailSubject(job), emailBody(job)))}" data-apply-mail>${icon('mail')}Open email draft</a>`;
    } else if (state.target.type === 'url' || state.target.type === 'search') {
        primary = `<a class="pp-btn pp-btn-primary" href="${escapeHtml(state.target.url)}" target="_blank" rel="noopener noreferrer" data-apply-link>${state.target.type === 'url' ? 'Open application page' : 'Search careers page'}${icon('external')}</a>`;
    } else {
        const postUrl = safeHttpUrl(job.posts_link);
        primary = postUrl
            ? `<a class="pp-btn pp-btn-primary" href="${escapeHtml(postUrl)}" target="_blank" rel="noopener noreferrer nofollow">Open original post${icon('external')}</a>`
            : `<button type="button" class="pp-btn pp-btn-done" disabled>No application details</button>`;
    }
    return `<div class="pp-detail-cta">
            <button type="button" class="pp-icon-btn pp-cta-save${saved ? ' is-on' : ''}" data-save="${key}" aria-pressed="${saved}" aria-label="Save ${escapeHtml(job.Company || 'listing')}">${icon('bookmark')}</button>
            ${primary}
        </div>`;
}

function emailBody(job) {
    const profile = storageGet(localStorage, 'userProfileData', {});
    const lane = laneForJob(job);
    const name = String(profile?.name || '').trim() || '[Your name]';
    return [
        'Dear Hiring Team,',
        '',
        `I would like to apply for the ${lane.applyNoun} opportunity at ${job.Company || 'your organisation'}${job.Location ? ` (${job.Location})` : ''} that I found on My Student Club.`,
        '',
        lane.applyPitch || app.course.applyPitch,
        '',
        'I have attached my CV for your consideration and would be glad to share any further details or join a call at your convenience.',
        '',
        'Thank you for your time.',
        '',
        'Regards,',
        name,
        `[Phone] | ${lane.idLabel || `${app.course.institute} registration no.`}: [your number]`
    ].join('\n');
}

function renderDetail(job, unlocked = null) {
    const panel = $('#ppDetail');
    const key = jobKey(job.__table, job.id);
    const lane = laneForJob(job);
    const cached = app.session ? getCachedUnlockedJob(job.id, job.__table, app.session) : null;
    unlocked = unlocked || cached;
    const state = applyState(job, unlocked);
    const description = unlocked?.description || job.Description || '';
    const postUrl = safeHttpUrl(job.posts_link);
    const closed = isLikelyClosed(job.Created_At);
    const firmFlag = caFirmFlag(job, lane);
    panel.innerHTML = `
        <div class="pp-detail-inner">
            <div class="pp-detail-top">
                <span class="pp-lane-pill">${escapeHtml(lane.tab)}</span>
                <button type="button" class="pp-icon-btn" data-close-detail aria-label="Close listing">${icon('x')}</button>
            </div>
            <header class="pp-detail-head">
                <div class="pp-card-logo" aria-hidden="true">${escapeHtml(companyInitial(job))}</div>
                <div>
                    <h2 id="ppDetailTitle" tabindex="-1">${escapeHtml(job.Company || 'Company not named')}</h2>
                    <p class="pp-muted">${escapeHtml([domainText(job), job.Location].filter(Boolean).join(' · '))}</p>
                </div>
            </header>
            <div class="pp-detail-actions">
                <button type="button" class="pp-btn pp-btn-ghost pp-btn-sm" data-share="${key}">${icon('share')}Share</button>
                ${postUrl ? `<a class="pp-btn pp-btn-ghost pp-btn-sm" href="${escapeHtml(postUrl)}" target="_blank" rel="noopener noreferrer nofollow">${icon('external')}Original post</a>` : ''}
            </div>
            ${closed ? `<p class="pp-warning" role="note">${icon('alert')}Posted ${escapeHtml(timeAgo(job.Created_At))}. Listings older than two weeks are often filled, so apply soon or check the original post.</p>` : ''}
            ${firmFlag ? `<p class="pp-warning" role="note">${icon('alert')}${escapeHtml(firmFlag.note)}</p>` : ''}
            ${factsHtml(job)}
            ${eligibilityHtml(job)}
            ${howToApplyHtml(job, state)}
            <section class="pp-description" aria-label="Full description">
                <h3>About this opening</h3>
                ${descriptionHtml(description, { masked: !unlocked && !(isRecruiterPosted(job) && app.session) })}
                ${!unlocked && !(isRecruiterPosted(job) && app.session) ? '<p class="pp-hint">Contact details appear after you log in and choose to apply.</p>' : ''}
            </section>
            <div class="pp-safety" role="note">
                ${icon('shield')}
                <p><strong>Never pay for a training seat or job.</strong> My Student Club does not charge students to apply. If anyone asks for a fee or deposit, <a href="/contact.html">report this listing</a>.</p>
            </div>
            ${ctaHtml(job, state)}
        </div>`;
    bindDetail(panel, job);
    const heading = $('#ppDetailTitle');
    if (heading && (isSheet() || document.activeElement === document.body || app.lastFocus?.dataset?.open)) heading.focus({ preventScroll: !isSheet() });
    if (!unlocked) panel.scrollTop = 0;
}

function bindDetail(panel, job) {
    panel.querySelectorAll('[data-close-detail]').forEach(btn => btn.addEventListener('click', dismissJob));
    if (!job) return;
    panel.querySelector('[data-save]')?.addEventListener('click', () => toggleSaved(job));
    panel.querySelector('[data-share]')?.addEventListener('click', () => shareJob(job));
    panel.querySelector('[data-apply]')?.addEventListener('click', event => applyToJob(job, event.currentTarget));
    panel.querySelector('[data-easy-apply]')?.addEventListener('click', event => easyApply(job, event.currentTarget));
    panel.querySelector('[data-copy]')?.addEventListener('click', async event => {
        try {
            await navigator.clipboard.writeText(event.currentTarget.dataset.copy);
            toast('Email address copied.', 'success');
        } catch (_) {
            toast('Copy failed. Select the address and copy it manually.', 'error');
        }
    });
    panel.querySelectorAll('[data-apply-mail], [data-apply-link]').forEach(link => link.addEventListener('click', () => {
        recordApplication(job);
        track('pp_apply_open', { job: jobKey(job.__table, job.id) });
    }));
}

async function applyToJob(job, button) {
    if (!app.session) {
        window.location.href = loginUrl();
        return;
    }
    if (isBusy(button)) return;
    const original = button.innerHTML;
    setBusy(button, true, '<span class="pp-spinner" aria-hidden="true"></span> Getting details…');
    try {
        const key = jobKey(job.__table, job.id);
        const unlocked = await unlockJobDetails(job, job.__table, app.session, { endpoint: BROWSER_GUARD_WORKER_URL });
        await recordApplication(job);
        if (app.activeKey !== key) {
            // The student moved on; the details are cached for when they come back.
            toast(`Application details for ${job.Company || 'that listing'} are ready. Open it again to apply.`, 'success');
            return;
        }
        renderDetail(job, unlocked);
        track('pp_apply_unlock', { job: jobKey(job.__table, job.id) });
        const target = parseApplyTarget(unlocked.applicationId);
        $('#ppDetail [data-apply-mail], #ppDetail [data-apply-link]')?.focus();
        if (target.type === 'email') toast('Email draft ready. Attach your CV before sending.', 'success');
    } catch (error) {
        console.error('[pro-portal] unlock failed', error);
        if (button.isConnected) setBusy(button, false, original);
        toast(error?.status === 401 ? 'Your session expired. Please log in again.' : (error?.message || 'Could not load application details. Please try again.'), 'error');
    }
}

async function shareJob(job) {
    const lane = laneForJob(job);
    const url = `${window.location.origin}${lane.path}?job=${encodeURIComponent(jobKey(job.__table, job.id))}`;
    const text = `${job.Company || 'A company'} is hiring: ${lane.tab} for ${app.course.name} students${job.Location ? ` in ${job.Location}` : ''}. Apply via My Student Club:`;
    track('pp_share', { job: jobKey(job.__table, job.id) });
    if (navigator.share) {
        try {
            await navigator.share({ title: job.Company || 'Opening', text, url });
            return;
        } catch (error) {
            if (error?.name === 'AbortError') return;
        }
    }
    try {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast('Link copied. Share it with your friends.', 'success');
    } catch (_) {
        window.prompt('Copy this link', url);
    }
}

function bindDetailKeys() {
    const panel = $('#ppDetail');
    if (!panel) return;
    // On document, so Esc and the focus trap still work after a click on
    // plain text or a busy button. On desktop, Esc closes only from the panel.
    document.addEventListener('keydown', event => {
        if (!app.activeKey || $('#ppDrawer')?.classList.contains('is-open')) return;
        const sheet = isSheet();
        if (event.key === 'Escape' && (sheet || panel.contains(document.activeElement))) dismissJob();
        if (event.key === 'Tab' && sheet) trapFocus(event, panel);
    });
    window.matchMedia('(max-width: 899px)').addEventListener?.('change', syncSheetMode);
    window.addEventListener('popstate', () => {
        const params = new URLSearchParams(window.location.search);
        const key = params.get('job');
        const next = decodeFilters(window.location.search, filterOptions());
        const filtersChanged = encodeFilters(next) !== encodeFilters(app.filters);
        if (filtersChanged) {
            app.filters = next;
            syncControls();
            fetchPage({ reset: true });
        }
        if (key && parseJobKey(key)) openJob(key, { push: false });
        else closeJob({ pop: true });
    });
}

// ---------------------------------------------------------------- page setups

function filterOptions() {
    return {
        categoryKeys: app.course.categories.map(category => category.key),
        payOptions: PAY_OPTIONS[app.lane?.pay] || []
    };
}

// The lane strip scrolls sideways on small screens; start with the current
// lane in view instead of off to the right.
function revealCurrentLane() {
    const strip = $('.pp-lanes');
    const current = strip?.querySelector('[aria-current]');
    if (!strip || !current || strip.scrollWidth <= strip.clientWidth) return;
    const offset = current.getBoundingClientRect().left - strip.getBoundingClientRect().left;
    strip.scrollLeft += offset - (strip.clientWidth - current.offsetWidth) / 2;
}

async function initLane() {
    // Campaign tags (utm_*, gclid) stay in the URL for analytics.
    for (const [name, value] of new URLSearchParams(window.location.search)) {
        if (!OWN_PARAMS.has(name)) app.passthrough[name] = value;
    }
    app.filters = decodeFilters(window.location.search, filterOptions());
    buildFilterControls();
    syncControls();
    bindListControls();
    bindDetailKeys();
    const panel = $('#ppDetail');
    if (panel) panel.innerHTML = detailPlaceholderHtml();

    const initialJob = new URLSearchParams(window.location.search).get('job');
    history.replaceState({ job: parseJobKey(initialJob) ? initialJob : null }, '', currentUrl({ job: parseJobKey(initialJob) ? initialJob : null }));

    renderListStatus();
    const [mode] = await Promise.all([detectMode(), loadApplied()]);
    app.mode = mode;
    await fetchPage({ reset: true });
    if (parseJobKey(initialJob)) openJob(initialJob, { push: false });
    loadLaneCounts(app.course).then(paintLaneCounts).catch(() => {});
}

async function initHub() {
    const [mode] = await Promise.all([detectMode(), loadApplied()]);
    app.mode = mode;
    loadLaneCounts(app.course).then(paintLaneCounts).catch(() => {});
    const list = $('#ppHubLatest');
    if (!list) return;
    list.innerHTML = renderSkeleton(3);
    try {
        const perLane = await Promise.all(app.course.lanes.map(async lane => {
            let query = app.client.from(lane.table).select(columnsFor(lane.table));
            query = applyCourseFilter(query, app.course, lane, 15);
            const { data, error } = await query.order('Created_At', { ascending: false }).limit(3);
            if (error) throw error;
            return (data || []).map(job => tagJob(job, lane));
        }));
        const seen = new Set();
        const latest = perLane.flat()
            .sort((a, b) => new Date(b.Created_At) - new Date(a.Created_At))
            .filter(job => !seen.has(repostSignature(job)) && seen.add(repostSignature(job)))
            .slice(0, 6);
        latest.forEach(job => app.jobsByKey.set(jobKey(job.__table, job.id), job));
        list.innerHTML = latest.length
            ? latest.map(job => cardHtml(job)).join('')
            : `<div class="pp-empty"><h3>No new ${escapeHtml(app.course.name)} openings this fortnight</h3><p>Browse the sections above for older listings.</p></div>`;
        list.addEventListener('click', event => {
            const save = event.target.closest('[data-save]');
            if (save) {
                event.preventDefault();
                const job = app.jobsByKey.get(save.dataset.save);
                if (job) toggleSaved(job);
            }
        });
    } catch (error) {
        console.error('[pro-portal] hub query failed', error);
        list.innerHTML = `<div class="pp-empty pp-error" role="alert"><h3>We could not load the latest openings</h3><p>Please refresh the page in a moment.</p></div>`;
    }
}

async function init() {
    const body = document.body;
    app.course = COURSES[body.dataset.course];
    if (!app.course) return;
    app.lane = laneByKey(app.course, body.dataset.lane);
    app.client = window.supabaseClient || (typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null);
    bindMenu();
    revealCurrentLane();
    document.fonts?.ready.then(revealCurrentLane);
    // Rule callouts start collapsed so phones see listings first.
    if (window.matchMedia('(min-width: 900px)').matches) $$('[data-callout]').forEach(details => { details.open = true; });
    if (!app.client) {
        renderListError(new Error('Supabase client unavailable'));
        return;
    }
    try {
        const { data } = await app.client.auth.getSession();
        app.session = data?.session || null;
    } catch (_) {
        app.session = null;
    }
    renderAuth();
    if (app.lane) await initLane();
    else await initHub();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
