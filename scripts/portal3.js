import { getDaysAgo } from './date-utils.js';
import { isProfileComplete, generateEmailBody, showResumeRedirectModal, showToast } from './ai-helper.js';

// ============================================================
//  CONFIG
// ============================================================
const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = window._mscSupabaseClient || supabase.createClient(supabaseUrl, supabaseKey);
window._mscSupabaseClient = supabaseClient;
const WORKER_URL = 'https://storer.bhansalimanan55.workers.dev';

const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyBTIXRJbaZy_3ulG0C8zSI_irZI7Ht2Y-8',
    authDomain: 'msc-notif.firebaseapp.com',
    projectId: 'msc-notif',
    storageBucket: 'msc-notif.appspot.com',
    messagingSenderId: '228639798414',
    appId: '1:228639798414:web:b8b3c96b15da5b770a45df',
    measurementId: 'G-X4M23TB936'
};
const VAPID_KEY = 'BGlNz4fQGzftJPr2U860MsoIo0dgNcqb2y2jAEbwJzjmj8CbDwJy_kD4eRAcruV6kNRs6Kz-mh9rdC37tVgeI5I';

const JOB_TYPES_NOTIF = [
    { value: 'industrial', label: 'Industrial Training' },
    { value: 'semi', label: 'Semi Qualified' },
    { value: 'fresher', label: 'Fresher' },
    { value: 'articleship', label: 'Articleship' }
];
const LOCATIONS_NOTIF = ['mumbai', 'bangalore', 'gurgaon', 'pune', 'kolkata', 'delhi', 'noida', 'hyderabad', 'ahmedabad', 'chennai', 'jaipur'];

const EMAIL_SUBJECT_MAP = {
    'Industrial Training Job Portal': 'Application for CA Industrial Training',
    'Fresher Jobs': 'Application for CA Fresher Position',
    'Semi Qualified Jobs': 'Application for Semi Qualified CA Position',
    'Articleship Jobs': 'Application for CA Articleship'
};

// ============================================================
//  PORTAL DEFINITIONS
// ============================================================
const PORTALS = [
    { id: 'industrial',  label: 'Industrial Training', table: 'Industrial Training Job Portal', experience: null },
    { id: 'articleship', label: 'Articleship',          table: 'Articleship Jobs',               experience: null },
    { id: 'fresher',     label: 'CA Fresher',           table: 'Fresher Jobs',                   experience: 'Freshers' },
    { id: 'semi',        label: 'Semi Qualified',       table: 'Semi Qualified Jobs',            experience: null },
];

const PREF_TO_PORTAL = {
    'industrial': 'industrial', 'CA Industrial Training Default': 'industrial',
    'articleship': 'articleship', 'CA Articleship': 'articleship',
    'fresher': 'fresher', 'fresher_fresher': 'fresher', 'fresher_experienced': 'fresher', 'CA Fresher': 'fresher',
    'semi': 'semi', 'semi_fresher': 'semi', 'semi_experienced': 'semi', 'Semi Qualified CA': 'semi',
};

const PORTAL_URLS = {
    industrial:  'index.html',
    articleship: 'ca-articleship-jobs.html',
    fresher:     'ca-fresher-jobs.html',
    semi:        'semi-qualified-ca-jobs.html',
};

// ============================================================
//  STATE
// ============================================================
let currentPortalId = 'industrial';
let currentTable = 'Industrial Training Job Portal';
let currentExperience = null;
let currentSession = null;
let appliedJobIds = new Set();
let isFetching = false;
let page = 0;
const limit = 15;
let hasMoreData = true;
let debounceTimeout = null;
let allLocations = [];
let allCategories = {};
let cachedSortedLocations = null;
let cachedSortedCategories = null;
let currentFcmToken = null;
let firebaseMessaging;

const state = {
    keywords: [], locations: [], categories: [],
    salary: '', sortBy: 'popular', applicationStatus: 'all'
};

const dom = {};

// Company avatar colors + gradient palettes (from prototype)
const COMPANY_COLORS = [
    { bg: '#FFF3C4', fg: '#92600A' }, { bg: '#DCFCE7', fg: '#166534' },
    { bg: '#DBEAFE', fg: '#1E40AF' }, { bg: '#FFEDD5', fg: '#9A3412' },
    { bg: '#EDE9FE', fg: '#5B21B6' }, { bg: '#CFFAFE', fg: '#155E75' },
    { bg: '#FCE7F3', fg: '#9D174D' }, { bg: '#FEF9C3', fg: '#713F12' },
];

const DPDP_CONSENT_TEXT = 'I consent to My Student Club sharing my CV and profile details with registered companies and recruiters for job-matching purposes.';

window.flutter_app = { isReady: false, fcmToken: null };
window.setFcmToken = function (token) {
    window.flutter_app.fcmToken = token;
    if (dom.topicSelectionArea && dom.topicSelectionArea.style.display !== 'flex') {
        updatePermissionStatusUI();
    }
};

// ============================================================
//  UTILITIES
// ============================================================
function getCompanyColors(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
    return COMPANY_COLORS[Math.abs(h) % COMPANY_COLORS.length];
}
function getInitials(name) {
    const parts = name.replace(/&|\.|,|LLP|Ltd|Co\b/gi, ' ').trim().split(/\s+/).filter(Boolean);
    return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || (name[0] || '?').toUpperCase();
}
function updateFilterCache() {
    cachedSortedLocations = [...allLocations].sort((a, b) => b.length - a.length);
    const cats = allCategories[currentTable] || [];
    cachedSortedCategories = [...cats].sort((a, b) => b.length - a.length);
}

// ============================================================
//  PORTAL MANAGEMENT
// ============================================================
function getDefaultPortalId() {
    try {
        const onboarding = JSON.parse(localStorage.getItem('onboardingSegmentData') || '{}');
        const pref = localStorage.getItem('userJobPreference') || onboarding.looking_for;
        return PREF_TO_PORTAL[pref] || 'industrial';
    } catch (_) { return 'industrial'; }
}

function switchPortal(portalId) {
    const url = PORTAL_URLS[portalId];
    if (url) window.location.href = url;
}

function renderPortalChips() {
    if (!dom.portalChips) return;
    const preferred = getDefaultPortalId() || 'industrial';
    const sorted = [...PORTALS].sort((a, b) => {
        if (a.id === preferred) return -1;
        if (b.id === preferred) return 1;
        return 0;
    });
    dom.portalChips.innerHTML = sorted.map(p => {
        if (p.id === currentPortalId) {
            return `<span class="portal-chip active">${p.label}</span>`;
        }
        return `<a href="${PORTAL_URLS[p.id]}" class="portal-chip">${p.label}</a>`;
    }).join('');
}

// ============================================================
//  TRENDING SECTION
// ============================================================
async function fetchTrendingJobs() {
    if (!dom.trendingSection || !dom.trendingScroll) return;
    dom.trendingScroll.innerHTML = `<div class="trending-placeholder">${[0, 1, 2].map(() => '<div class="trending-card-skeleton"></div>').join('')}</div>`;
    try {
        const { data, error } = await supabaseClient
            .from(currentTable)
            .select('id, Company, Location, Salary, Category, "Application ID", application_count, Created_At, Description, connect_link')
            .order('application_count', { ascending: false, nullsFirst: false })
            .limit(8);
        if (error) throw error;
        const jobs = (data || []).filter(j => (j.application_count || 0) > 0);
        if (jobs.length === 0) { dom.trendingSection.style.display = 'none'; return; }
        dom.trendingSection.style.display = 'block';
        dom.trendingScroll.innerHTML = jobs.map((job, i) => renderTrendingCard(job, i)).join('');
        dom.trendingScroll.querySelectorAll('.trending-card').forEach((card, i) => {
            card.addEventListener('click', () => showJobDetail(jobs[i]));
        });
    } catch (_) {
        dom.trendingSection.style.display = 'none';
    }
}

function renderTrendingCard(job, _idx) {
    const initials = getInitials(job.Company || '');
    const applicants = job.application_count || 0;
    const isStipend = currentTable === 'Industrial Training Job Portal' || currentTable === 'Articleship Jobs';
    const salaryStr = job.Salary ? `₹${job.Salary}${isStipend ? '/mo' : ''}` : '';
    const location = job.Location ? job.Location.split(',')[0] : '';
    const meta = [location, salaryStr].filter(Boolean).join(' · ');
    return `
        <button class="trending-card">
            <div class="tc-deco1"></div>
            <div class="tc-deco2"></div>
            <div class="tc-top">
                <div class="tc-avatar">${initials}</div>
                ${applicants > 0 ? `<div class="tc-badge">🔥 ${applicants} applied</div>` : ''}
            </div>
            <div class="tc-body">
                <div class="tc-name">${job.Company || 'Company'}</div>
                <div class="tc-role">${job.Category || ''}</div>
            </div>
            <div class="tc-footer-row">
                ${meta ? `<div class="tc-meta" style="margin-top:0">${meta}</div>` : '<div></div>'}
                <div class="tc-apply">Apply →</div>
            </div>
        </button>`;
}

// ============================================================
//  JOB LIST
// ============================================================
function renderJobCard(job) {
    const colors = getCompanyColors(job.Company || '');
    const initials = getInitials(job.Company || '');
    const isApplied = appliedJobIds.has(job.id);
    const postedDate = job.Created_At ? getDaysAgo(job.Created_At) : '';
    const applicants = job.application_count || 0;
    const portalLabel = PORTALS.find(p => p.id === currentPortalId)?.label || '';

    const card = document.createElement('article');
    card.className = 'job-card-new';
    card.dataset.jobId = job.id;
    card.innerHTML = `
        <div class="jc-top">
            <div class="jc-avatar" style="background:${colors.bg};color:${colors.fg}">${initials}</div>
            <div class="jc-info">
                <div class="jc-role">${job.Company || 'N/A'}</div>
                <div class="jc-company">${job.Category || ''}</div>
            </div>
            <button class="jc-bookmark${isBookmarked(job.id, currentTable) ? ' saved' : ''}" aria-label="Save">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="${isBookmarked(job.id, currentTable) ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4z"/>
                </svg>
            </button>
        </div>
        <div class="jc-chips">
            ${portalLabel ? `<span class="jc-chip jc-chip-type">${portalLabel}</span>` : ''}
            ${job.Location ? `<span class="jc-chip">📍 ${job.Location.split(',')[0]}</span>` : ''}
            ${job.Experience ? `<span class="jc-chip">${job.Experience}</span>` : ''}
        </div>
        <div class="jc-divider"></div>
        <div class="jc-footer">
            <div class="jc-footer-left">
                ${job.Salary ? (() => {
                    const isStipend = currentTable === 'Industrial Training Job Portal' || currentTable === 'Articleship Jobs';
                    const period = isStipend ? '<span class="jc-salary-period">/month</span>' : '';
                    return `<div class="jc-salary">₹${job.Salary}${period}</div>`;
                })() : ''}
                <div class="jc-meta">${postedDate}${applicants > 0 ? ` · ${applicants} applied` : ''}</div>
            </div>
            <button class="jc-apply-btn${isApplied ? ' applied' : ''}">${isApplied ? '✓ Applied' : 'Apply →'}</button>
        </div>`;

    card.addEventListener('click', (e) => {
        if (!e.target.closest('.jc-bookmark')) showJobDetail(job);
    });
    card.querySelector('.jc-bookmark').addEventListener('click', (e) => {
        e.stopPropagation();
        const bm = e.currentTarget;
        const nowSaved = toggleBookmark(job, currentTable);
        bm.classList.toggle('saved', nowSaved);
        bm.querySelector('svg').setAttribute('fill', nowSaved ? 'currentColor' : 'none');
        showToast(nowSaved ? 'Job saved!' : 'Removed from saved', 'info');
    });
    return card;
}

async function fetchJobs() {
    if (isFetching) return;
    isFetching = true;
    if (page === 0 && dom.loader) dom.loader.style.display = 'flex';
    const sentinelSpinner = document.querySelector('.sentinel-spinner');
    if (page > 0 && sentinelSpinner) sentinelSpinner.style.display = 'block';

    try {
        let selectCols = 'id, Company, Location, Salary, Description, Created_At, Category, "Application ID", application_count, connect_link';
        if (currentTable === 'Fresher Jobs') selectCols += ', Experience, yoe';
        else if (currentTable === 'Semi Qualified Jobs') selectCols += ', Experience';

        let query = supabaseClient.from(currentTable).select(selectCols);

        if (state.keywords.length > 0) {
            const ors = state.keywords.map(k => {
                const t = k.trim().replace(/\s+/g, '%');
                return `Company.ilike."%${t}%",Description.ilike."%${t}%",Category.ilike."%${t}%",Location.ilike."%${t}%"`;
            });
            query = query.or(ors.join(','));
        }
        if (state.locations.length > 0) {
            query = query.or(state.locations.map(l => `Location.ilike."%${l}%"`).join(','));
        }
        if (state.categories.length > 0) {
            query = query.or(state.categories.map(c => `Category.ilike."%${c}%"`).join(','));
        }
        if (state.salary) {
            if (state.salary.endsWith('+')) {
                const min = parseInt(state.salary);
                if (!isNaN(min)) query = query.gte('Salary', min);
            } else if (state.salary.includes('-')) {
                const [min, max] = state.salary.split('-').map(Number);
                if (!isNaN(min) && !isNaN(max)) query = query.gte('Salary', min).lte('Salary', max);
            }
        }
        if (currentTable === 'Fresher Jobs') {
            query = query.or('yoe.is.null,yoe.lte.1');
            query = query.eq('Experience', currentExperience || 'Freshers');
        } else if (currentExperience && currentTable === 'Semi Qualified Jobs') {
            query = query.eq('Experience', currentExperience);
        }
        if (state.applicationStatus === 'not_applied' && currentSession && appliedJobIds.size > 0) {
            query = query.not('id', 'in', `(${Array.from(appliedJobIds).join(',')})`);
        }

        let sortCol = 'Created_At', isAsc = false;
        if (state.sortBy === 'salary_asc') { sortCol = 'Salary'; isAsc = true; }
        else if (state.sortBy === 'salary_desc') { sortCol = 'Salary'; isAsc = false; }
        query = query.order(sortCol, { ascending: isAsc, nullsFirst: false }).order('id', { ascending: false });
        query = query.range(page * limit, (page + 1) * limit - 1);

        let { data, error } = await query;
        if (!error && data && state.sortBy === 'popular') {
            data.sort((a, b) => (b.application_count || 0) - (a.application_count || 0));
        }
        if (error) throw error;

        if (data && data.length > 0) {
            const frag = document.createDocumentFragment();
            data.forEach(job => frag.appendChild(renderJobCard(job)));
            if (dom.jobsList) dom.jobsList.appendChild(frag);
            page++;
            hasMoreData = data.length === limit;
            if (dom.jobsCount) dom.jobsCount.textContent = `${page * limit}+ jobs`;
        } else {
            hasMoreData = false;
            if (page === 0 && dom.jobsList) {
                dom.jobsList.innerHTML = `
                    <div class="no-jobs-state">
                        <div class="no-jobs-icon">🔍</div>
                        <div class="no-jobs-title">No jobs found</div>
                        <div class="no-jobs-sub">Try different filters or search terms</div>
                    </div>`;
            }
        }
    } catch (err) {
        if (page === 0 && dom.jobsList) {
            const isNetwork = (err.message || '').toLowerCase().includes('fetch') || (err.message || '').toLowerCase().includes('network');
            dom.jobsList.innerHTML = isNetwork
                ? `<div class="no-jobs-state"><div class="no-jobs-icon">🔧</div><div class="no-jobs-title">Under Maintenance</div><div class="no-jobs-sub">We'll be back in 30 minutes.</div></div>`
                : `<div class="no-jobs-state"><div class="no-jobs-sub" style="color:#DC2626">Error: ${err.message}</div></div>`;
        }
    } finally {
        isFetching = false;
        if (dom.loader) dom.loader.style.display = 'none';
        if (sentinelSpinner) sentinelSpinner.style.display = 'none';
        renderActiveFilters();
    }
}

function resetAndFetch() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        page = 0;
        hasMoreData = true;
        if (dom.jobsList) dom.jobsList.innerHTML = '';
        if (dom.jobsCount) dom.jobsCount.textContent = '';
        fetchJobs();
    }, 300);
}

function setupInfiniteScroll() {
    const sentinel = document.getElementById('sentinel');
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && hasMoreData && !isFetching) fetchJobs();
        });
    }, { rootMargin: '200px', threshold: 0.1 });
    observer.observe(sentinel);
}

// ============================================================
//  SEARCH
// ============================================================
function processSearch(inputEl) {
    let value = inputEl.value.trim();
    if (!value) return;
    if (!cachedSortedLocations || !cachedSortedCategories) updateFilterCache();

    const escapeRegExp = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const existingLocations = new Set(state.locations.map(l => l.toLowerCase()));
    const existingCategories = new Set(state.categories.map(c => c.toLowerCase()));
    const existingKeywords = new Set(state.keywords);

    const extract = (list, existingSet, targetArr) => {
        for (const item of list) {
            if (existingSet.has(item.toLowerCase())) continue;
            const regex = new RegExp(`(^|[\\s,])${escapeRegExp(item)}(?=$|[\\s,])`, 'gi');
            if (regex.test(value)) {
                targetArr.push(item);
                existingSet.add(item.toLowerCase());
                value = value.replace(regex, ' ');
            }
        }
    };
    extract(cachedSortedLocations || [], existingLocations, state.locations);
    extract(cachedSortedCategories || [], existingCategories, state.categories);

    const rest = value.trim();
    if (rest) {
        rest.split(',').map(t => t.trim()).filter(Boolean).forEach(term => {
            const clean = term.replace(/\s+/g, ' ');
            if (clean && !existingKeywords.has(clean)) { state.keywords.push(clean); existingKeywords.add(clean); }
        });
    }
    inputEl.value = '';
    renderActiveFilters();
    resetAndFetch();
}

function renderActiveFilters() {
    if (!dom.activeFiltersBar) return;
    const pills = [
        ...state.keywords.map(k => ({ text: k, type: 'keywords', val: k })),
        ...state.locations.map(l => ({ text: l, type: 'locations', val: l })),
        ...state.categories.map(c => ({ text: c, type: 'categories', val: c })),
        ...(state.salary ? [{ text: `Stipend: ${state.salary}`, type: 'salary', val: '' }] : []),
    ];
    if (pills.length === 0) { dom.activeFiltersBar.style.display = 'none'; return; }
    dom.activeFiltersBar.style.display = 'flex';
    dom.activeFiltersBar.innerHTML = pills.map(p => `
        <span class="active-filter-tag">
            ${p.text}
            <button class="filter-tag-remove" data-type="${p.type}" data-val="${p.val}">×</button>
        </span>`).join('');
    dom.activeFiltersBar.querySelectorAll('.filter-tag-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const { type, val } = btn.dataset;
            if (type === 'salary') state.salary = '';
            else state[type] = state[type].filter(i => i !== val);
            renderActiveFilters();
            resetAndFetch();
        });
    });
}

// ============================================================
//  FILTER SHEET
// ============================================================
function showFilterSheet() {
    dom.filterSheetOverlay?.classList.add('show');
    document.body.style.overflow = 'hidden';
    // Sync filter state to sheet UI
    if (dom.sortBySelect) dom.sortBySelect.value = state.sortBy;
    if (dom.salaryFilter) dom.salaryFilter.value = state.salary;
    renderLocationPills();
    renderStatusToggles();
    setupLocationDropdown();
}

function hideFilterSheet() {
    dom.filterSheetOverlay?.classList.remove('show');
    document.body.style.overflow = '';
}

function renderLocationPills() {
    if (!dom.locationPills) return;
    dom.locationPills.innerHTML = state.locations.map(l => `
        <span class="filter-pill">${l}
            <button data-loc="${l}">×</button>
        </span>`).join('');
    dom.locationPills.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
            state.locations = state.locations.filter(l => l !== btn.dataset.loc);
            renderLocationPills();
        });
    });
}

function renderStatusToggles() {
    document.querySelectorAll('#filterSheet .pill-toggle').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === state.applicationStatus);
    });
}

function setupLocationDropdown() {
    const input = dom.locationInput;
    const dropdown = dom.locationDropdown;
    if (!input || !dropdown) return;

    input.oninput = () => {
        const q = input.value.trim().toLowerCase();
        if (!q) { dropdown.classList.remove('show'); return; }
        const matches = (allLocations || []).filter(l =>
            l.toLowerCase().includes(q) && !state.locations.includes(l)
        ).slice(0, 8);
        if (matches.length === 0) { dropdown.classList.remove('show'); return; }
        dropdown.innerHTML = matches.map(l => `<div class="filter-dropdown-item">${l}</div>`).join('');
        dropdown.classList.add('show');
        dropdown.querySelectorAll('.filter-dropdown-item').forEach((item, i) => {
            item.addEventListener('click', () => {
                if (!state.locations.includes(matches[i])) state.locations.push(matches[i]);
                input.value = '';
                dropdown.classList.remove('show');
                renderLocationPills();
            });
        });
    };
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const val = input.value.trim();
            if (val && !state.locations.includes(val)) state.locations.push(val);
            input.value = '';
            dropdown.classList.remove('show');
            renderLocationPills();
        }
    };
}

function populateSalaryFilter() {
    if (!dom.salaryFilter) return;
    let options = [];
    if (currentTable === 'Industrial Training Job Portal') options = [
        { value: '', text: 'Any Stipend' },
        { value: '10000-20000', text: '₹10k - ₹20k' },
        { value: '20000-40000', text: '₹20k - ₹40k' },
        { value: '40000+', text: '₹40k+' }
    ];
    else if (currentTable === 'Articleship Jobs') options = [
        { value: '', text: 'Any Stipend' },
        { value: '0-5000', text: 'Below ₹5k' },
        { value: '5000-10000', text: '₹5k - ₹10k' },
        { value: '10000-15000', text: '₹10k - ₹15k' },
        { value: '15000+', text: '₹15k+' }
    ];
    else if (currentTable === 'Semi Qualified Jobs') options = [
        { value: '', text: 'Any Salary' },
        { value: '0-25000', text: 'Below ₹25k' },
        { value: '25000-35000', text: '₹25k - ₹35k' },
        { value: '35000-50000', text: '₹35k - ₹50k' },
        { value: '50000+', text: 'Above ₹50k' }
    ];
    else if (currentTable === 'Fresher Jobs') options = [
        { value: '', text: 'Any Salary' },
        { value: '0-1200000', text: '< 12 LPA' },
        { value: '1200000-1800000', text: '12-18 LPA' },
        { value: '1800000+', text: '> 18 LPA' }
    ];
    dom.salaryFilter.innerHTML = options.map(o => `<option value="${o.value}">${o.text}</option>`).join('');
    dom.salaryFilter.value = state.salary;
}

// ============================================================
//  JOB DETAIL BOTTOM SHEET
// ============================================================
function showJobDetail(job) {
    if (!dom.jobDetailOverlay || !dom.jobDetailContent) return;
    const colors = getCompanyColors(job.Company || '');
    const initials = getInitials(job.Company || '');
    const isApplied = appliedJobIds.has(job.id);
    const applyLink = getApplicationLink(job['Application ID'], job.Company);
    const isMailto = applyLink.startsWith('mailto:');
    const applicants = job.application_count || 0;

    // Build LinkedIn connect link
    const suffixPattern = /\b(pvt|private|ltd|limited|llp|llc|co|company|inc|corp|org|foundation|group|holdings|enterprises|solutions|services|consulting|consultancy|associates|partners|international|india|technologies?|tech)\b\.?/gi;
    let cleanedCo = (job.Company || '').replace(suffixPattern, '').replace(/[.,&\-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const coWords = cleanedCo.split(/\s+/).filter(w => w.length > 1).slice(0, 3).join(' ') || (job.Company || '').split(/\s+/).slice(0, 2).join(' ');
    const encodedCo = encodeURIComponent(`"${coWords}"`);
    let connectLink = `https://www.linkedin.com/search/results/people/?keywords=${encodedCo}%20AND%20(%22CA%22%20OR%20%22Industrial%20Trainee%22)&origin=GLOBAL_SEARCH_HEADER`;
    if (job.connect_link) connectLink = job.connect_link;

    let applyHtml = '';
    if (isMailto) {
        applyHtml = `
            <div class="jd-apply-section">
                <button class="jd-btn-secondary" id="jdSimpleApplyBtn">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,12 2,6"/></svg>
                    Simple Apply
                </button>
                <button class="jd-btn-primary${isApplied ? ' applied' : ''}" id="jdAiApplyBtn">
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    <span class="btn-text">AI Apply</span>
                    <i class="fas fa-spinner fa-spin" style="display:none"></i>
                </button>
            </div>`;
    } else {
        applyHtml = `
            <div class="jd-apply-section">
                <a href="${applyLink}" target="_blank" class="jd-btn-primary${isApplied ? ' applied' : ''}" id="jdExternalApplyBtn">Apply Now →</a>
            </div>`;
    }

    dom.jobDetailContent.innerHTML = `
        <div class="jd-topbar">
            <button class="jd-back-btn" id="jdBackBtn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m6-6-6 6 6 6"/></svg>
            </button>
            <span class="jd-topbar-title">Job Details</span>
            <div class="jd-topbar-actions">
                <button class="jd-action-btn" id="jdShareBtn" title="Share">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8M16 6l-4-4-4 4M12 2v13"/></svg>
                </button>
            </div>
        </div>
        <div class="jd-body">
            <div class="jd-hero-card">
                <div class="jd-hero-top">
                    <div class="jd-hero-avatar" style="background:${colors.bg};color:${colors.fg}">${initials}</div>
                    <div class="jd-hero-info">
                        <div class="jd-hero-company">${job.Company || ''}</div>
                        <div class="jd-hero-location">${job.Location || ''}</div>
                    </div>
                </div>
                ${job.Category ? `<div class="jd-hero-category">${job.Category}</div>` : ''}
                <div class="jd-stats-grid">
                    ${job.Salary ? `<div class="jd-stat"><span class="jd-stat-label">${(currentTable === 'Fresher Jobs' || currentTable === 'Semi Qualified Jobs') ? 'Salary' : 'Stipend'}</span><span class="jd-stat-value">₹${job.Salary}</span></div>` : ''}
                    ${applicants > 0 ? `<div class="jd-stat"><span class="jd-stat-label">Applicants</span><span class="jd-stat-value">${applicants}</span></div>` : ''}
                    ${job.Created_At ? `<div class="jd-stat"><span class="jd-stat-label">Posted</span><span class="jd-stat-value">${getDaysAgo(job.Created_At)}</span></div>` : ''}
                </div>
            </div>
            ${applyHtml}
            <div class="jd-secondary-actions">
                <a href="${connectLink}" target="_blank" class="jd-action-link">
                    <i class="fab fa-linkedin"></i> Connect to Peers
                </a>
                <button class="jd-action-link" id="jdShareInline">
                    <i class="fas fa-share-alt"></i> Share Job
                </button>
            </div>
            <div class="jd-section">
                <h3 class="jd-section-title">Application Details</h3>
                ${generateApplicationLinks(job['Application ID'])}
            </div>
            <div class="jd-section">
                <h3 class="jd-section-title">Job Description</h3>
                <div class="jd-description">${renderMarkdown(job.Description)}</div>
            </div>
            <div class="jd-report-link">Found an issue? <a href="/contact.html">Report it</a></div>
        </div>`;

    // Wire up buttons
    document.getElementById('jdBackBtn')?.addEventListener('click', hideJobDetail);
    document.getElementById('jdShareBtn')?.addEventListener('click', () => shareJob(job, document.getElementById('jdShareBtn')));
    document.getElementById('jdShareInline')?.addEventListener('click', (e) => shareJob(job, e.currentTarget));

    if (isMailto) {
        document.getElementById('jdSimpleApplyBtn')?.addEventListener('click', async (e) => {
            await recordApplication(job, e.currentTarget);
            openMailtoLink(applyLink);
        });
        document.getElementById('jdAiApplyBtn')?.addEventListener('click', async (e) => {
            await handleAiApplyClick(job, e.currentTarget, currentTable, applyLink);
        });
    } else {
        document.getElementById('jdExternalApplyBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            await recordApplication(job, e.currentTarget);
            window.open(applyLink, '_blank');
        });
    }

    dom.jobDetailContent.querySelectorAll('.modal-copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const text = btn.getAttribute('data-copy-text');
            const icon = btn.querySelector('i');
            navigator.clipboard.writeText(text).then(() => {
                const orig = icon.className;
                icon.className = 'fas fa-check';
                btn.style.background = '#22c55e';
                setTimeout(() => { icon.className = orig; btn.style.background = '#2563eb'; }, 2000);
            });
        });
    });

    dom.jobDetailOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
}

function hideJobDetail() {
    dom.jobDetailOverlay?.classList.remove('show');
    document.body.style.overflow = '';
}

// ============================================================
//  APPLICATION UTILITIES (adapted from portal3.js)
// ============================================================
function getApplicationLink(id, companyName = 'the company') {
    if (!id) return '#';
    const trimmedId = id.trim();
    if (trimmedId.startsWith('http')) {
        try { new URL(trimmedId); return trimmedId; } catch (_) {}
    }
    if (trimmedId.includes('@')) return constructMailto({ 'Application ID': trimmedId, Company: companyName });
    return `https://www.google.com/search?q=${encodeURIComponent(trimmedId + ' careers')}`;
}

function constructMailto(job, body = '') {
    const rawLink = job['Application ID'];
    if (!rawLink) return '#';
    const emailMatch = rawLink.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) return '#';
    const email = emailMatch[0];
    const subjectBase = EMAIL_SUBJECT_MAP[currentTable] || 'Application for the role';
    const subject = `${subjectBase} at ${job.Company} (Ref: My Student Club)`;
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function openMailtoLink(mailtoUrl) {
    if (!mailtoUrl || mailtoUrl === '#') return;
    try {
        const link = document.createElement('a');
        link.href = mailtoUrl; link.style.display = 'none';
        link.setAttribute('target', '_self');
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { if (link.parentNode) document.body.removeChild(link); }, 100);
    } catch (_) { window.location.href = mailtoUrl; }
}

function generateApplicationLinks(applicationId) {
    if (!applicationId) return '<p style="color:#647592;font-size:13px">No Application ID Available</p>';
    const links = applicationId.split(',').map(l => l.trim()).filter(Boolean);
    if (links.length === 0) return '<p style="color:#647592;font-size:13px">No Application ID Available</p>';
    return links.map((link, i) => `
        <div class="jd-app-link-row" style="${i > 0 ? 'margin-top:8px' : ''}">
            <p class="jd-app-link-text">${link}</p>
            <button class="modal-copy-btn" data-copy-text="${link.replace(/"/g, '&quot;')}" title="Copy">
                <i class="fas fa-copy" style="font-size:14px;"></i>
            </button>
        </div>`).join('');
}

function renderMarkdown(text) {
    if (!text) return '<p style="color:#647592">No description available.</p>';
    let html = text
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');
    return '<p>' + html.replace(/<p><\/p>/g, '') + '</p>';
}

function shareJob(job, btnElement) {
    const jobType = currentPortalId;
    const jobUrl = `${window.location.origin}/job.html?id=${job.id}&type=${jobType}`;
    const shareText = `Check out this job at *${job.Company}* for *${job.Location}*\nURL - ${jobUrl}\n\nDo turn on notifications to stay updated with all such opportunities and ensure joining the whatsapp group below\nhttps://chat.whatsapp.com/D491zsqKmv25S2YLloSUBR`;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile && navigator.share) {
        navigator.share({ title: `Job at ${job.Company}`, text: shareText, url: jobUrl }).catch(() => {});
    } else {
        navigator.clipboard.writeText(shareText).then(() => {
            if (btnElement) {
                const orig = btnElement.innerHTML;
                btnElement.innerHTML = '<i class="fas fa-check"></i> Copied!';
                btnElement.style.background = '#22c55e'; btnElement.style.color = '#fff';
                setTimeout(() => { btnElement.innerHTML = orig; btnElement.style.background = ''; btnElement.style.color = ''; }, 2000);
            }
        }).catch(() => alert('Failed to copy.'));
    }
}

async function recordApplication(job, btnElement) {
    if (!currentSession) return true;
    const origHtml = btnElement.innerHTML;
    btnElement.innerHTML = '<div class="loader-spinner" style="width:18px;height:18px;border-width:2px;display:inline-block"></div>';
    try {
        let dbJobId = job.id, dbJobTable = currentTable;
        if (isNaN(job.id)) {
            dbJobId = Date.now() + Math.floor(Math.random() * 1000);
            dbJobTable = `${currentTable}|${job.id}`;
        }
        const { error } = await supabaseClient.from('job_applications').insert({
            user_id: currentSession.user.id, job_id: dbJobId, job_table: dbJobTable,
            applied_at: new Date().toISOString()
        });
        if (!error || error.code === '23505') {
            appliedJobIds.add(job.id);
            // Update card in list
            const card = dom.jobsList?.querySelector(`[data-job-id='${job.id}']`);
            if (card) {
                const btn = card.querySelector('.jc-apply-btn');
                if (btn) { btn.classList.add('applied'); btn.textContent = '✓ Applied'; }
            }
        }
        btnElement.classList.add('applied');
    } catch (_) {}
    btnElement.innerHTML = origHtml;
    return true;
}

async function handleAiApplyClick(job, btnElement, tableName, simpleMailtoLink) {
    if (!currentSession) { window.location.href = '/login.html'; return; }
    if (!isProfileComplete()) { showResumeRedirectModal(); return; }

    const btnText = btnElement.querySelector('.btn-text');
    const spinner = btnElement.querySelector('.fa-spinner');
    const origText = btnText?.textContent;
    if (btnText) btnText.textContent = 'Preparing…';
    if (spinner) spinner.style.display = 'inline-block';
    btnElement.style.pointerEvents = 'none';

    try {
        const emailBody = await generateEmailBody(job, tableName, supabaseClient, currentSession?.user);
        const emailMatch = (job['Application ID'] || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : '';
        const subject = simpleMailtoLink.split('subject=')[1]?.split('&')[0] || `Application for ${job.Category} (Ref: My Student Club)`;
        const aiMailto = `mailto:${email}?subject=${subject}&body=${encodeURIComponent(emailBody)}`;
        await recordApplication(job, btnElement);
        openMailtoLink(aiMailto);
    } catch (_) {
        showToast('Server busy, reverting to simple apply', 'error');
        await recordApplication(job, btnElement);
        setTimeout(() => openMailtoLink(simpleMailtoLink), 3000);
    } finally {
        if (btnText) btnText.textContent = origText;
        if (spinner) spinner.style.display = 'none';
        btnElement.style.pointerEvents = '';
    }
}

// ============================================================
//  BANNERS
// ============================================================
async function loadBanners() {
    const carousel = document.querySelector('.carousel');
    const bannerSection = document.querySelector('.banner-section');
    if (!carousel || !bannerSection) return;
    try {
        const { data, error } = await supabaseClient.from('Banners').select('Image, Hyperlink, Type, visible_to_unenrolled');
        if (error) throw error;
        const currentType = currentTable === 'Semi Qualified Jobs' ? 'Semi-Qualified' :
            currentTable === 'Fresher Jobs' ? 'Freshers' : currentTable.split(' ')[0];
        let isEnrolled = false;
        if (currentSession?.user?.id) {
            const { count } = await supabaseClient.from('enrollment').select('course', { count: 'exact', head: true }).eq('uuid', currentSession.user.id);
            if (count > 0) isEnrolled = true;
        }
        const relevant = (data || []).filter(b => {
            const matchesType = b.Type === 'All' || b.Type === currentType;
            const matchesEnroll = b.visible_to_unenrolled == null || (b.visible_to_unenrolled === true && !isEnrolled) || (b.visible_to_unenrolled === false && isEnrolled);
            return matchesType && matchesEnroll;
        });
        if (relevant.length === 0) { bannerSection.style.display = 'none'; return; }
        bannerSection.style.display = 'block';
        carousel.innerHTML = '';
        relevant.forEach((banner, i) => {
            const a = document.createElement('a');
            a.href = banner.Hyperlink; a.className = `carousel-item ${i === 0 ? 'active' : ''}`; a.target = '_blank';
            const img = document.createElement('img'); img.src = banner.Image; img.alt = 'Banner';
            a.appendChild(img); carousel.appendChild(a);
        });
        const slides = carousel.querySelectorAll('.carousel-item');
        if (slides.length > 1) {
            let cur = 0;
            setInterval(() => { slides.forEach(s => s.classList.remove('active')); slides[++cur % slides.length].classList.add('active'); cur %= slides.length; }, 5000);
        }
    } catch (_) { bannerSection.style.display = 'none'; }
}

// ============================================================
//  AUTH
// ============================================================
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;
    if (session?.user?.id && !localStorage.getItem('userProfileData')) fetchAndCacheProfileData();
    return session;
}

function updateHeaderAuth(session) {
    const container = document.querySelector('.auth-buttons-container');
    if (session) {
        let displayName = 'User';
        try {
            const p = JSON.parse(localStorage.getItem('userProfileData') || '{}');
            if (p.name?.trim()) {
                displayName = p.name.trim();
            } else {
                const email = session.user.email || '';
                displayName = email.split('@')[0] || 'User';
            }
        } catch (_) {
            const email = session.user.email || '';
            displayName = email.split('@')[0] || 'User';
        }
        const initial = displayName.charAt(0).toUpperCase();
        if (dom.greetingName) dom.greetingName.textContent = displayName || 'there';
        if (!container) return;

        container.innerHTML = `
            <div class="user-profile-container">
                <div class="user-icon-wrapper">
                    <div class="user-icon">${initial}</div>
                    <div class="user-hover-card">
                        <div class="user-hover-content">
                            <p class="user-email">${displayName}</p>
                            <a href="/profile.html" class="profile-link-btn">Edit Profile</a>
                            <button id="logoutBtn" class="logout-btn">Logout</button>
                        </div>
                    </div>
                </div>
            </div>`;
        container.querySelector('.user-icon-wrapper').addEventListener('click', (e) => {
            e.stopPropagation();
            container.querySelector('.user-hover-card').classList.toggle('show');
        });
        container.querySelector('#logoutBtn').addEventListener('click', handleLogout);
        checkUserEnrollment();
    } else {
        container.innerHTML = `<a href="/login.html" class="hdr-icon-btn" aria-label="Login">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/>
                <path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/>
            </svg>
        </a>`;
    }
}

window.handleLogout = async () => {
    await supabaseClient.auth.signOut();
    ['userJobPreference','userProfileData','userCVFileName','userCVText','userCVImages','subscribedTopics','newUserSignup','newUserEmail'].forEach(k => localStorage.removeItem(k));
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) keysToRemove.push(key);
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    currentSession = null; appliedJobIds.clear();
    updateHeaderAuth(null);
    document.getElementById('appStatusFilterGroup')?.style && (document.getElementById('appStatusFilterGroup').style.display = 'none');
    state.applicationStatus = 'all';
    window.location.href = '/';
};

async function checkUserEnrollment() {
    if (!currentSession?.user) return;
    const lms = document.getElementById('lms-nav-link');
    const hist = document.getElementById('history-nav-link');
    if (hist) hist.style.display = 'flex';
    if (!lms) return;
    try {
        const { count, error } = await supabaseClient.from('enrollment').select('course', { count: 'exact', head: true }).eq('uuid', currentSession.user.id);
        lms.style.display = (!error && count > 0) ? 'flex' : 'none';
    } catch (_) { lms.style.display = 'none'; }
}

async function initializeUserFeatures() {
    if (!currentSession) return;
    document.getElementById('appStatusFilterGroup')?.style && (document.getElementById('appStatusFilterGroup').style.display = 'flex');
    try {
        const { data, error } = await supabaseClient.from('job_applications').select('job_id, job_table')
            .eq('user_id', currentSession.user.id).like('job_table', `${currentTable}%`);
        if (!error) {
            appliedJobIds = new Set(data.map(app =>
                app.job_table.includes('|') ? app.job_table.split('|')[1] : app.job_id
            ));
        }
    } catch (_) {}
    checkAndSyncCVBackground();
}

// ============================================================
//  PROFILE & PREFERENCES
// ============================================================
async function fetchAndCacheProfileData() {
    if (!currentSession?.user?.id) return null;
    try {
        const { data } = await supabaseClient.from('profiles')
            .select('profile, looking_for, articleship_1yr_end_date, ca_inter_attempt, ca_final_attempt, years_of_experience, ocr_cv')
            .eq('uuid', currentSession.user.id).single();
        if (data) {
            if (data.ocr_cv) { localStorage.setItem('userCVText', data.ocr_cv); setCloudSyncFlag(); }
            const profileObj = data.profile || {};
            profileObj.looking_for = data.looking_for;
            profileObj.articleship_1yr_end_date = data.articleship_1yr_end_date;
            profileObj.ca_inter_attempt = data.ca_inter_attempt;
            profileObj.ca_final_attempt = data.ca_final_attempt;
            profileObj.years_of_experience = data.years_of_experience;
            localStorage.setItem('userProfileData', JSON.stringify(profileObj));
            if (profileObj.job_preference) localStorage.setItem('userJobPreference', profileObj.job_preference);
            if (profileObj.notification_subscriptions?.length) {
                localStorage.setItem('subscribedTopics', JSON.stringify(profileObj.notification_subscriptions));
                updateNotificationBadge();
            }
            return profileObj;
        }
    } catch (_) {}
    return null;
}

async function saveJobPreference(preference) {
    localStorage.setItem('userJobPreference', preference);
    if (currentSession?.user?.id) {
        try {
            const { data: existing } = await supabaseClient.from('profiles').select('profile').eq('uuid', currentSession.user.id).single();
            const profileData = existing?.profile || {};
            profileData.job_preference = preference;
            await supabaseClient.from('profiles').upsert({ uuid: currentSession.user.id, profile: profileData, updated_at: new Date().toISOString() });
        } catch (_) {}
    }
}

// ============================================================
//  CV SYNC
// ============================================================
function isCloudSynced() { return localStorage.getItem('cv_cloud_synced') === 'true' || document.cookie.split(';').some(c => c.trim().startsWith('cv_cloud_synced=true')); }
function setCloudSyncFlag() { localStorage.setItem('cv_cloud_synced', 'true'); localStorage.setItem('cv_images_synced', 'true'); document.cookie = 'cv_cloud_synced=true; max-age=31536000; path=/'; }
function clearCloudSyncFlag() { localStorage.removeItem('cv_cloud_synced'); localStorage.removeItem('cv_images_synced'); document.cookie = 'cv_cloud_synced=; Max-Age=0; path=/'; }

async function checkAndSyncCVBackground() {
    if (!currentSession) return false;
    const userCVImages = localStorage.getItem('userCVImages');
    const userCVText = localStorage.getItem('userCVText');
    if (userCVImages) {
        if (localStorage.getItem('cv_images_synced') === 'true') return true;
    } else {
        return isCloudSynced() ? true : false;
    }
    try {
        const images = JSON.parse(userCVImages);
        const response = await fetch(WORKER_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: currentSession.user.id, images, pdf_text: userCVText || '' }) });
        if (!response.ok) { clearCloudSyncFlag(); return false; }
        const data = await response.json();
        if (data.ok && data.response && data.uploaded) {
            const finalText = data.ocr_text || userCVText || '';
            if (data.ocr_text) localStorage.setItem('userCVText', finalText);
            await supabaseClient.from('profiles').upsert({ uuid: currentSession.user.id, ocr_cv: finalText, updated_at: new Date().toISOString() });
            setCloudSyncFlag();
            return true;
        }
        clearCloudSyncFlag(); return false;
    } catch (_) { clearCloudSyncFlag(); return false; }
}

// ============================================================
//  NOTIFICATIONS
// ============================================================
function showNotifStatus(message, type = 'info') {
    if (dom.notificationStatusEl) {
        dom.notificationStatusEl.textContent = message;
        dom.notificationStatusEl.className = `notification-status status-${type}`;
        dom.notificationStatusEl.style.display = 'block';
        if (type !== 'error') setTimeout(() => { dom.notificationStatusEl.style.display = 'none'; }, 3000);
    }
}
function getSubscribedTopics() { return JSON.parse(localStorage.getItem('subscribedTopics') || '[]'); }
async function saveSubscribedTopics(topics) {
    localStorage.setItem('subscribedTopics', JSON.stringify(topics));
    updateNotificationBadge();
    if (currentSession?.user?.id) {
        try {
            const { data: existing } = await supabaseClient.from('profiles').select('profile').eq('uuid', currentSession.user.id).single();
            const profileData = existing?.profile || {};
            profileData.notification_subscriptions = topics;
            await supabaseClient.from('profiles').upsert({ uuid: currentSession.user.id, profile: profileData, updated_at: new Date().toISOString() });
        } catch (_) {}
    }
}
function updateNotificationBadge() { if (dom.notifDot) dom.notifDot.style.visibility = getSubscribedTopics().length > 0 ? 'visible' : 'hidden'; }

function renderSubscribedTopics() {
    if (!dom.subscribedTopicsListEl) return;
    dom.subscribedTopicsListEl.innerHTML = '';
    const topics = getSubscribedTopics();
    if (topics.length === 0) { dom.subscribedTopicsListEl.innerHTML = '<p class="no-subscriptions">No active subscriptions.</p>'; }
    else {
        topics.forEach(topic => {
            const { location, jobType } = formatTopicForDisplay(topic);
            const tag = document.createElement('div'); tag.className = 'topic-tag';
            tag.innerHTML = `<span>${location}${jobType ? ` - ${jobType}` : ''}</span><button class="topic-remove" data-topic="${topic}">×</button>`;
            dom.subscribedTopicsListEl.appendChild(tag);
        });
        dom.subscribedTopicsListEl.querySelectorAll('.topic-remove').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const topic = btn.dataset.topic;
                if (await unsubscribeFromTopic(topic) && topic === 'all') { if (dom.topicAllCheckbox) dom.topicAllCheckbox.checked = false; }
            });
        });
    }
    if (dom.topicAllCheckbox) dom.topicAllCheckbox.checked = topics.includes('all');
    updateSpecificTopicAreaVisibility();
}

function formatTopicForDisplay(topic) {
    if (topic === 'all') return { location: 'All', jobType: 'Notifications' };
    if (topic === 'Industrial-all') return { location: 'All India', jobType: 'Industrial Training' };
    if (topic === 'fresher-all') return { location: 'All India', jobType: 'Fresher' };
    if (topic === 'semi-all') return { location: 'All India', jobType: 'Semi Qualified' };
    if (topic === 'articleship-all') return { location: 'All India', jobType: 'Articleship' };
    const parts = topic.split('-'); if (parts.length < 2) return { location: topic, jobType: '' };
    const jobTypeVal = parts.pop();
    const location = parts.join('-').replace(/-/g, ' ');
    const jobType = JOB_TYPES_NOTIF.find(t => t.value === jobTypeVal)?.label || jobTypeVal;
    return { location: location.charAt(0).toUpperCase() + location.slice(1), jobType };
}

function updateSpecificTopicAreaVisibility() { if (dom.specificSubscriptionForm) dom.specificSubscriptionForm.style.display = dom.topicAllCheckbox?.checked ? 'none' : 'block'; }

async function manageTopicSubscription(topic, action) {
    if (!currentFcmToken) {
        if (window.flutter_app.fcmToken) currentFcmToken = window.flutter_app.fcmToken;
        else if (!window.flutter_app.isReady) {
            if (Notification.permission === 'granted') { showNotifStatus('Connecting…', 'info'); await requestTokenAndSync(); }
            else { showNotifStatus('Please enable notifications first.', 'error'); return false; }
        }
    }
    currentFcmToken = window.flutter_app.fcmToken || currentFcmToken;
    if (!currentFcmToken) { showNotifStatus('Notification service unavailable.', 'error'); return false; }
    try {
        const response = await fetch('https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: currentFcmToken, topic, action })
        });
        if (!response.ok) throw new Error(await response.text());
        let topics = getSubscribedTopics();
        if (action === 'subscribe' && !topics.includes(topic)) topics.push(topic);
        else if (action === 'unsubscribe') topics = topics.filter(t => t !== topic);
        saveSubscribedTopics(topics); renderSubscribedTopics(); return true;
    } catch (e) {
        const msg = e?.message?.includes('500') ? 'Notification server error. Try again later.' : `Failed to ${action} — check your connection.`;
        showNotifStatus(msg, 'error');
        return false;
    }
}
async function subscribeToTopic(topic) { return manageTopicSubscription(topic, 'subscribe'); }
async function unsubscribeFromTopic(topic) { return manageTopicSubscription(topic, 'unsubscribe'); }

function updatePermissionStatusUI() {
    if (!dom.permissionStatusDiv) return;
    if (window.flutter_app.isReady) {
        if (dom.enableNotificationsBtn) dom.enableNotificationsBtn.style.display = 'none';
        if (dom.topicSelectionArea) dom.topicSelectionArea.style.display = 'flex';
        dom.permissionStatusDiv.textContent = 'Notifications are managed by the app.';
        dom.permissionStatusDiv.className = 'notification-status status-success';
        dom.permissionStatusDiv.style.display = 'block';
        return;
    }
    const permission = Notification.permission;
    if (dom.enableNotificationsBtn) dom.enableNotificationsBtn.style.display = permission === 'default' ? 'block' : 'none';
    if (dom.topicSelectionArea) dom.topicSelectionArea.style.display = permission === 'granted' ? 'flex' : 'none';
    if (permission === 'granted') { dom.permissionStatusDiv.textContent = 'Notifications are enabled.'; dom.permissionStatusDiv.className = 'notification-status status-success'; }
    else if (permission === 'denied') { dom.permissionStatusDiv.textContent = 'Notifications are blocked in browser settings.'; dom.permissionStatusDiv.className = 'notification-status status-error'; }
    else { dom.permissionStatusDiv.textContent = 'Enable notifications for job alerts.'; dom.permissionStatusDiv.className = 'notification-status status-info'; }
    dom.permissionStatusDiv.style.display = 'block';
}

function populateNotificationDropdowns() {
    if (dom.locationSelectEl) {
        dom.locationSelectEl.innerHTML = '<option value="" disabled selected>Select Location</option><option value="all">All India</option>';
        LOCATIONS_NOTIF.sort().forEach(loc => { const o = document.createElement('option'); o.value = loc; o.textContent = loc.charAt(0).toUpperCase() + loc.slice(1); dom.locationSelectEl.appendChild(o); });
    }
    if (dom.jobTypeSelectEl) {
        dom.jobTypeSelectEl.innerHTML = '<option value="" disabled selected>Select Job Type</option>';
        JOB_TYPES_NOTIF.forEach(t => { const o = document.createElement('option'); o.value = t.value; o.textContent = t.label; dom.jobTypeSelectEl.appendChild(o); });
    }
}

async function initializeFCM() {
    if (window.flutter_app.isReady) { currentFcmToken = window.flutter_app.fcmToken; await syncNotificationTopics(); return; }
    try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        firebaseMessaging = firebase.messaging();
        await requestTokenAndSync();
    } catch (_) {}
}

async function requestTokenAndSync() {
    if (window.flutter_app.isReady || !firebaseMessaging) return;
    try {
        const token = await firebaseMessaging.getToken({ vapidKey: VAPID_KEY });
        if (token) { currentFcmToken = token; await syncNotificationTopics(); }
    } catch (_) {}
}

function shouldSync() {
    const last = localStorage.getItem('notificationSyncTimestamp');
    return !last || new Date(parseInt(last)).toDateString() !== new Date().toDateString();
}

async function syncNotificationTopics() {
    currentFcmToken = window.flutter_app.fcmToken || currentFcmToken;
    if (!currentFcmToken || !shouldSync()) return;
    await Promise.all(getSubscribedTopics().map(topic => manageTopicSubscription(topic, 'subscribe')));
    localStorage.setItem('notificationSyncTimestamp', Date.now().toString());
}

// ============================================================
//  SHARED JOB URL
// ============================================================
function checkAndOpenSharedJob() {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get('id'), jobType = params.get('type');
    if (!jobId || !jobType) return;
    // Switch to the right portal first
    const portalId = jobType === 'semi' ? 'semi' : jobType === 'fresher' ? 'fresher' : jobType === 'articleship' ? 'articleship' : 'industrial';
    switchPortal(portalId);
    fetchSharedJob(jobId);
    window.history.replaceState({}, '', window.location.pathname);
}

async function fetchSharedJob(jobId) {
    try {
        const { data, error } = await supabaseClient.from(currentTable).select('*').eq('id', jobId).single();
        if (!error && data) setTimeout(() => showJobDetail(data), 400);
    } catch (_) {}
}

// ============================================================
//  FILTER OPTIONS
// ============================================================
async function fetchFilterOptions() {
    try {
        const [locRes, catRes] = await Promise.all([fetch('/locations.json'), fetch('/categories.json')]);
        if (!locRes.ok || !catRes.ok) throw new Error('Filter data unavailable');
        allLocations = await locRes.json();
        allCategories = await catRes.json();
        updateFilterCache();
    } catch (_) {
        allLocations = []; allCategories = {}; updateFilterCache();
    }
}

// ============================================================
//  ONBOARDING + JOB PREFERENCE MODALS
// ============================================================
function showOnboardingSegmentModal() {
    const modal = document.getElementById('onboardingSegmentModal');
    if (modal) { modal.style.display = 'flex'; modal.offsetHeight; modal.classList.add('show-modal'); }
}
function hideOnboardingSegmentModal() {
    const modal = document.getElementById('onboardingSegmentModal');
    if (modal) { modal.classList.remove('show-modal'); setTimeout(() => { modal.style.display = 'none'; }, 400); }
}

function initOnboardingSegmentForm() {
    const form = document.getElementById('onboardingSegmentForm');
    if (!form) return;
    const cards = document.querySelectorAll('.onboarding-option-card');
    const selectedInput = document.getElementById('selectedLookingFor');
    const fields = {
        'CA Industrial Training Default': { element: document.getElementById('field-industrial'), input: document.getElementById('articleship_1yr_end_date') },
        'CA Articleship':  { element: document.getElementById('field-articleship'), input: document.getElementById('ca_inter_attempt') },
        'CA Fresher':      { element: document.getElementById('field-fresher'), input: document.getElementById('ca_final_attempt') },
        'Semi Qualified CA': { element: document.getElementById('field-semi'), input: document.getElementById('years_of_experience') }
    };

    const defaultVal = selectedInput.value;
    Object.entries(fields).forEach(([key, item]) => {
        const isDefault = key === defaultVal;
        item.element?.classList.toggle('active', isDefault);
        if (item.input) { item.input.required = isDefault; item.input.disabled = !isDefault; }
    });

    cards.forEach(card => {
        card.addEventListener('click', () => {
            const value = card.getAttribute('data-value');
            if (!value) return;
            cards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedInput.value = value;
            Object.entries(fields).forEach(([key, item]) => {
                const active = key === value;
                item.element?.classList.toggle('active', active);
                if (item.input) { item.input.required = active; item.input.disabled = !active; }
            });
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!currentSession?.user?.id) { hideOnboardingSegmentModal(); return; }
        const lookingFor = selectedInput.value;
        const updateData = {
            looking_for: lookingFor,
            articleship_1yr_end_date: lookingFor === 'CA Industrial Training Default' ? (document.getElementById('articleship_1yr_end_date').value || null) : null,
            ca_inter_attempt: lookingFor === 'CA Articleship' ? (document.getElementById('ca_inter_attempt').value || null) : null,
            ca_final_attempt: lookingFor === 'CA Fresher' ? (document.getElementById('ca_final_attempt').value || null) : null,
            years_of_experience: lookingFor === 'Semi Qualified CA' ? (document.getElementById('years_of_experience').value || null) : null,
            updated_at: new Date().toISOString()
        };
        const submitBtn = form.querySelector('.onboarding-submit-btn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Saving…</span><i class="fas fa-spinner fa-spin"></i>';
        try {
            const { error } = await supabaseClient.from('profiles').update(updateData).eq('uuid', currentSession.user.id);
            if (error) throw error;
            const cached = localStorage.getItem('userProfileData');
            let profileObj = {};
            try { profileObj = JSON.parse(cached || '{}'); } catch (_) {}
            Object.assign(profileObj, updateData);
            localStorage.setItem('userProfileData', JSON.stringify(profileObj));
            hideOnboardingSegmentModal();
            showToast('Personalization complete! Enjoy your personalized feed.', 'success');
            const prefMapping = { 'CA Industrial Training Default': 'industrial', 'CA Articleship': 'articleship', 'CA Fresher': 'fresher', 'Semi Qualified CA': 'semi' };
            const mappedPref = prefMapping[lookingFor];
            if (mappedPref) {
                await saveJobPreference(mappedPref);
                const targetPortalId = PREF_TO_PORTAL[mappedPref];
                if (targetPortalId && targetPortalId !== currentPortalId) setTimeout(() => switchPortal(targetPortalId), 800);
            }
        } catch (err) {
            showToast('Failed to save preferences. Please try again.', 'error');
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<span>Continue to Portal</span><i class="fas fa-arrow-right"></i>';
        }
    });
}

function initJobPreferenceModal() {
    document.querySelectorAll('.pref-option-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const preference = btn.dataset.preference;
            if (!preference) return;
            document.querySelectorAll('.pref-option-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            await saveJobPreference(preference);
            setTimeout(() => {
                document.getElementById('jobPreferenceModal').style.display = 'none';
                document.body.style.overflow = '';
                const portalId = PREF_TO_PORTAL[preference];
                if (portalId) switchPortal(portalId);
            }, 300);
        });
    });

    document.getElementById('skipPreferenceBtn')?.addEventListener('click', async () => {
        await saveJobPreference('industrial');
        document.getElementById('jobPreferenceModal').style.display = 'none';
        document.body.style.overflow = '';
        switchPortal('industrial');
    });
}

// ============================================================
//  DPDP CONSENT
// ============================================================
async function checkAndPromptConsent() {
    if (!currentSession || !localStorage.getItem('userCVText')) return;
    try {
        const { data } = await supabaseClient.from('consentform').select('cv_sharing_consent').eq('user_id', currentSession.user.id).maybeSingle();
        if (!data || !data.cv_sharing_consent) {
            setTimeout(() => { const modal = document.getElementById('cvConsentPromptModal'); if (modal) modal.style.display = 'flex'; }, 1500);
        }
    } catch (_) {}
}

// ============================================================
//  EVENT LISTENERS
// ============================================================
function setupEventListeners() {
    // Search
    dom.searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); processSearch(dom.searchInput); }
    });

    // Filter fab
    dom.filterBtn?.addEventListener('click', () => showFilterSheet());
    dom.filterSheetOverlay?.addEventListener('click', (e) => { if (e.target === dom.filterSheetOverlay) hideFilterSheet(); });
    document.getElementById('closeFilterSheet')?.addEventListener('click', hideFilterSheet);

    // Filter sheet apply/reset
    document.getElementById('applyFiltersBtn')?.addEventListener('click', () => {
        if (dom.sortBySelect) state.sortBy = dom.sortBySelect.value;
        if (dom.salaryFilter) state.salary = dom.salaryFilter.value;
        renderActiveFilters();
        resetAndFetch();
        hideFilterSheet();
    });
    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
        state.keywords = []; state.locations = []; state.categories = [];
        state.salary = ''; state.sortBy = 'popular'; state.applicationStatus = 'all';
        if (dom.sortBySelect) dom.sortBySelect.value = 'popular';
        if (dom.salaryFilter) dom.salaryFilter.value = '';
        if (dom.locationInput) dom.locationInput.value = '';
        renderLocationPills();
        renderStatusToggles();
        renderActiveFilters();
        resetAndFetch();
    });

    // Filter sheet sort + status toggles
    dom.sortBySelect?.addEventListener('change', () => { state.sortBy = dom.sortBySelect.value; });
    document.querySelectorAll('#filterSheet .pill-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
            state.applicationStatus = btn.dataset.value;
            document.querySelectorAll('#filterSheet .pill-toggle').forEach(b => b.classList.toggle('active', b.dataset.value === state.applicationStatus));
        });
    });

    // Job detail overlay backdrop
    dom.jobDetailOverlay?.addEventListener('click', (e) => { if (e.target === dom.jobDetailOverlay) hideJobDetail(); });

    // Notifications
    dom.notificationsBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        const popup = dom.notificationPopup;
        const showing = popup.style.display === 'flex';
        popup.style.display = showing ? 'none' : 'flex';
        if (!showing) {
            updatePermissionStatusUI();
            if (window.flutter_app.isReady || Notification.permission === 'granted') {
                if (!firebaseMessaging && !window.flutter_app.isReady) initializeFCM().then(renderSubscribedTopics);
                else renderSubscribedTopics();
            } else renderSubscribedTopics();
        }
    });
    dom.closeNotificationPopup?.addEventListener('click', () => { dom.notificationPopup.style.display = 'none'; });
    dom.enableNotificationsBtn?.addEventListener('click', async () => {
        if (!('Notification' in window)) {
            showNotifStatus('Notifications are not supported in this browser.', 'error');
            return;
        }
        const btn = dom.enableNotificationsBtn;
        const prev = btn.textContent;
        btn.textContent = 'Requesting…';
        btn.disabled = true;
        try {
            const perm = await Notification.requestPermission();
            updatePermissionStatusUI();
            if (perm === 'granted') await initializeFCM();
            else if (perm === 'denied') showNotifStatus('Notifications blocked. Please allow them in browser settings.', 'error');
        } catch (e) {
            showNotifStatus('Could not request notification permission.', 'error');
        } finally {
            btn.textContent = prev;
            btn.disabled = false;
        }
    });
    dom.topicAllCheckbox?.addEventListener('change', async (e) => {
        e.target.disabled = true;
        try {
            const ok = e.target.checked ? await subscribeToTopic('all') : await unsubscribeFromTopic('all');
            if (!ok) e.target.checked = !e.target.checked;
        } catch (_) { e.target.checked = !e.target.checked; }
        finally { e.target.disabled = false; }
    });
    dom.subscribeBtnEl?.addEventListener('click', async () => {
        const location = dom.locationSelectEl?.value;
        const jobType = dom.jobTypeSelectEl?.value;
        if (!location || !jobType) return;
        let topicName;
        if (location === 'all') topicName = `${jobType === 'industrial' ? 'Industrial' : jobType}-all`;
        else topicName = `${location}-${jobType}`;
        if (await subscribeToTopic(topicName)) {
            if (dom.locationSelectEl) dom.locationSelectEl.selectedIndex = 0;
            if (dom.jobTypeSelectEl) dom.jobTypeSelectEl.selectedIndex = 0;
            if (dom.subscribeBtnEl) dom.subscribeBtnEl.disabled = true;
        }
    });
    const updateSubBtn = () => { if (dom.subscribeBtnEl) dom.subscribeBtnEl.disabled = !(dom.locationSelectEl?.value && dom.jobTypeSelectEl?.value); };
    dom.locationSelectEl?.addEventListener('change', updateSubBtn);
    dom.jobTypeSelectEl?.addEventListener('change', updateSubBtn);

    // Theme toggle
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const next = isDark ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('msc-theme', next);
        });
    }

    // Menu
    dom.menuButton?.addEventListener('click', () => dom.expandedMenu?.classList.add('active'));
    dom.menuCloseBtn?.addEventListener('click', () => dom.expandedMenu?.classList.remove('active'));

    // Logout button in side menu
    document.getElementById('logoutMenuBtn')?.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        localStorage.clear();
        window.location.href = '/login.html';
    });

    // Resources dropdown in menu
    const resourcesBtn = document.getElementById('resourcesDropdownBtn');
    if (resourcesBtn) {
        resourcesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const dropdown = document.getElementById('resourcesDropdown');
            const icon = resourcesBtn.querySelector('.dropdown-icon');
            dropdown?.classList.toggle('active');
            icon?.classList.toggle('open');
        });
    }

    // Global click close
    document.addEventListener('click', (e) => {
        if (dom.expandedMenu?.classList.contains('active') && !dom.expandedMenu.contains(e.target) && !dom.menuButton?.contains(e.target)) {
            dom.expandedMenu.classList.remove('active');
        }
        if (dom.notificationPopup?.style.display === 'flex' && !dom.notificationPopup.contains(e.target) && !dom.notificationsBtn?.contains(e.target)) {
            dom.notificationPopup.style.display = 'none';
        }
        const resourcesDropdown = document.getElementById('resourcesDropdown');
        if (resourcesDropdown?.classList.contains('active') && !resourcesDropdown.contains(e.target) && !resourcesBtn?.contains(e.target)) {
            resourcesDropdown.classList.remove('active');
        }
        const userHoverCard = document.querySelector('.user-hover-card');
        const userProfileContainer = document.querySelector('.user-profile-container');
        if (userHoverCard?.classList.contains('show') && !userProfileContainer?.contains(e.target)) {
            userHoverCard.classList.remove('show');
        }
        const locationDropdown = document.getElementById('locationDropdown');
        if (locationDropdown && !locationDropdown.contains(e.target) && e.target !== dom.locationInput) {
            locationDropdown.classList.remove('show');
        }
    });

    // Modal close helpers (existing modals)
    document.getElementById('skipResumePrompt')?.addEventListener('click', () => { document.getElementById('resumePromptModal').style.display = 'none'; });
    document.getElementById('resumePromptModal')?.addEventListener('click', (e) => { if (e.target.id === 'resumePromptModal') e.currentTarget.style.display = 'none'; });
    document.getElementById('cvConsentAcceptBtn')?.addEventListener('click', async () => {
        document.getElementById('cvConsentPromptModal').style.display = 'none';
        showToast('Syncing your CV to cloud...', 'info');
        try {
            const syncSuccess = await checkAndSyncCVBackground();
            if (syncSuccess) {
                const now = new Date().toISOString();
                await supabaseClient.from('consentform').upsert({ user_id: currentSession.user.id, cv_sharing_consent: true, consent_text: DPDP_CONSENT_TEXT, consented_at: now, withdrawn_at: null, user_agent: navigator.userAgent, updated_at: now }, { onConflict: 'user_id' });
                showToast('Thank you! Your CV has been backed up and consent recorded.', 'success');
            } else { showToast('CV backup sync failed. Please complete/update your profile to consent.', 'error', 8000); }
        } catch (_) { showToast('Could not save consent. Please try again from your profile.', 'error'); }
    });
    document.getElementById('cvConsentDeclineBtn')?.addEventListener('click', () => { document.getElementById('cvConsentPromptModal').style.display = 'none'; window.location.href = '/profile.html'; });
    document.getElementById('closeProfileIncomplete')?.addEventListener('click', () => { document.getElementById('profileIncompleteModal').style.display = 'none'; });
}

// ============================================================
//  BOOKMARKS (localStorage)
// ============================================================
const BOOKMARKS_KEY = 'msc_bookmarks';
function getBookmarks() { try { return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]'); } catch { return []; } }
function saveBookmarks(bms) { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bms)); }
function isBookmarked(jobId, table) { return getBookmarks().some(b => b.id === jobId && b.table === table); }
function toggleBookmark(job, table) {
    const bms = getBookmarks();
    const idx = bms.findIndex(b => b.id === job.id && b.table === table);
    if (idx > -1) { bms.splice(idx, 1); saveBookmarks(bms); return false; }
    bms.unshift({ id: job.id, table, Company: job.Company, Category: job.Category, Location: job.Location, Salary: job.Salary, Experience: job.Experience, 'Application ID': job['Application ID'], Description: job.Description, savedAt: new Date().toISOString() });
    saveBookmarks(bms);
    return true;
}

// ============================================================
//  INITIALIZE PAGE
// ============================================================
async function initializePage() {
    // Cache DOM references
    dom.jobsList = document.getElementById('jobs-list');
    dom.loader = document.getElementById('loader');
    dom.portalChips = document.getElementById('portalChips');
    dom.trendingSection = document.getElementById('trendingSection');
    dom.trendingScroll = document.getElementById('trendingScroll');
    dom.jobsListTitle = document.getElementById('jobsListTitle');
    dom.jobsCount = document.getElementById('jobsCount');
    dom.searchInput = document.getElementById('searchInput');
    dom.activeFiltersBar = document.getElementById('activeFiltersBar');
    dom.filterBtn = document.getElementById('filterBtn');
    dom.filterSheetOverlay = document.getElementById('filterSheetOverlay');
    dom.sortBySelect = document.getElementById('sortBySelect');
    dom.salaryFilter = document.getElementById('salaryFilter');
    dom.locationInput = document.getElementById('locationInput');
    dom.locationDropdown = document.getElementById('locationDropdown');
    dom.locationPills = document.getElementById('locationPills');
    dom.appStatusFilterGroup = document.getElementById('appStatusFilterGroup');
    dom.jobDetailOverlay = document.getElementById('jobDetailOverlay');
    dom.jobDetailContent = document.getElementById('jobDetailContent');
    dom.menuButton = document.getElementById('menuButton');
    dom.expandedMenu = document.getElementById('expandedMenu');
    dom.menuCloseBtn = document.getElementById('menuCloseBtn');
    dom.notificationsBtn = document.getElementById('notificationsBtn');
    dom.notificationPopup = document.getElementById('notificationPopup');
    dom.closeNotificationPopup = document.getElementById('closeNotificationPopup');
    dom.notificationStatusEl = document.getElementById('notificationStatus');
    dom.notifDot = document.getElementById('notifDot');
    dom.topicAllCheckbox = document.getElementById('topic-all');
    dom.topicSelectionArea = document.getElementById('topic-selection-area');
    dom.permissionStatusDiv = document.getElementById('notification-permission-status');
    dom.enableNotificationsBtn = document.getElementById('enable-notifications-btn');
    dom.subscribedTopicsListEl = document.getElementById('subscribedTopicsList');
    dom.locationSelectEl = document.getElementById('locationSelect');
    dom.jobTypeSelectEl = document.getElementById('jobTypeSelect');
    dom.subscribeBtnEl = document.getElementById('subscribeBtn');
    dom.specificSubscriptionForm = document.getElementById('specific-subscription-form');
    dom.greetingText = document.getElementById('greetingText');
    dom.greetingName = document.getElementById('greetingName');

    // Apply saved theme immediately (before paint)
    const savedTheme = localStorage.getItem('msc-theme');
    if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

    // Set greeting
    if (dom.greetingText) dom.greetingText.textContent = 'Welcome!';
    if (dom.greetingName) dom.greetingName.textContent = 'User';

    // Read portal from per-page config (window.MSC_PORTAL_CONFIG)
    const pageConfig = window.MSC_PORTAL_CONFIG || PORTALS[0];
    currentPortalId = pageConfig.id;
    currentTable = pageConfig.table;
    currentExperience = pageConfig.experience || null;
    if (dom.jobsListTitle) dom.jobsListTitle.textContent = pageConfig.label + ' Jobs';

    // On the home page (Industrial Training), redirect to user's preferred portal
    // Only fires once per browser session so the user can still navigate back to this page
    if (pageConfig.isHome && !sessionStorage.getItem('msc_portal_redirected')) {
        const defaultId = getDefaultPortalId();
        if (defaultId && defaultId !== 'industrial' && PORTAL_URLS[defaultId]) {
            sessionStorage.setItem('msc_portal_redirected', '1');
            window.location.href = PORTAL_URLS[defaultId];
            return;
        }
    }

    renderPortalChips();

    // Auth check
    const session = await checkAuth();
    updateHeaderAuth(session);

    if (session) {
        localStorage.removeItem('portalVisitCount');
        await initializeUserFeatures();

        // Check if onboarding is needed
        let profile = null;
        try { profile = JSON.parse(localStorage.getItem('userProfileData') || 'null'); } catch (_) {}
        if (!profile?.looking_for) profile = await fetchAndCacheProfileData();
        if (!profile?.looking_for) setTimeout(showOnboardingSegmentModal, 800);
    } else {
        let visits = parseInt(localStorage.getItem('portalVisitCount') || '0') + 1;
        localStorage.setItem('portalVisitCount', visits);
        if (visits === 3) showToast('Create an account to unlock AI Apply and instant alerts!', 'info');
        else if (visits >= 5) {
            const overlay = document.getElementById('loginPromptOverlay');
            if (overlay) { overlay.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
        }
    }

    // Load filter options and populate
    await fetchFilterOptions();
    populateSalaryFilter();

    // Wire up event listeners
    setupEventListeners();
    setupInfiniteScroll();

    // Fetch data
    await Promise.all([fetchTrendingJobs(), fetchJobs(), loadBanners()]);

    // Handle shared job URL
    checkAndOpenSharedJob();

    // Notifications setup
    populateNotificationDropdowns();
    updateNotificationBadge();
    if (Notification.permission === 'granted' || window.flutter_app.isReady) initializeFCM();
}

document.addEventListener('DOMContentLoaded', initializePage);

// New user signup: show resume prompt
document.addEventListener('DOMContentLoaded', async () => {
    if (localStorage.getItem('newUserSignup') !== 'true') return;
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && !localStorage.getItem('userCVText')) {
        setTimeout(() => { document.getElementById('resumePromptModal').style.display = 'flex'; }, 1000);
    }
    localStorage.removeItem('newUserSignup');
    localStorage.removeItem('newUserEmail');
});

// Consent check + preference modal (deferred)
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => checkAndPromptConsent(), 2000);

    setTimeout(async () => {
        // Job preference modal if no preference set
        let preference = localStorage.getItem('userJobPreference');
        if (!preference && currentSession) {
            try {
                const cached = localStorage.getItem('userProfileData');
                if (cached) {
                    const p = JSON.parse(cached);
                    if (p.job_preference) { preference = p.job_preference; localStorage.setItem('userJobPreference', preference); }
                }
            } catch (_) {}
        }
        if (currentSession && !preference && !localStorage.getItem('userProfileData')?.includes('looking_for')) {
            // Show preference modal as fallback (onboarding modal is primary; this is a lighter alternative)
        }
        initJobPreferenceModal();
        initOnboardingSegmentForm();
    }, 600);
});

