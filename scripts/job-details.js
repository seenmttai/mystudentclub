// /jobs?id=…&type=… : one vacancy on its own page (job portal v2, 6 Nov 2026).
// It shows the same detail as the portal drawer. Applying happens in the portal (the drawer owns the BrowserGuard
// unlock, Easy Apply profile checks, AI Apply and application records), so every apply button here opens the
// vacancy there through /job.html. Public columns only: no Application ID, Apply_Link or posts_link is fetched.

import {
    canSeeApplyDetails,
    cardHeadline,
    companyName,
    detailColumns,
    escapeHtml,
    peersSearchUrl,
    portalFromJobType,
    PORTALS,
    publicJob,
    selectWithFallback,
    shareUrl,
} from './portal-v2/jobs-core.js?v=1';
import { detailHtml } from './portal-v2/job-view.js?v=1';

const SAVED_KEY = 'msc_saved_jobs';
const supabaseClient = window.supabaseClient || (typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null);

const TABLE_TO_PORTAL = {
    'Industrial Training Job Portal': PORTALS.industrial,
    'Fresher Jobs': PORTALS.fresher,
    'Semi Qualified Jobs': PORTALS.semi,
    'Articleship Jobs': PORTALS.articleship,
};

const state = { session: null, courses: [], job: null, portal: PORTALS.industrial };

function portalFromParams(params) {
    const type = params.get('type') || params.get('table') || '';
    return TABLE_TO_PORTAL[type] || portalFromJobType(type, PORTALS.industrial);
}

function readSaved() {
    try {
        const saved = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
}

function isSaved(job) {
    return readSaved().some((s) => String(s.id) === String(job.id) && s.table === state.portal.table);
}

function toggleSaved(job) {
    const list = readSaved();
    const index = list.findIndex((s) => String(s.id) === String(job.id) && s.table === state.portal.table);
    if (index >= 0) list.splice(index, 1);
    else list.push({ id: job.id, table: state.portal.table, savedAt: new Date().toISOString() });
    try {
        localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    } catch { /* storage blocked */ }
}

// Same rule as the portal's existing perks (AI Apply, Connect with peers): IT enrolment on the IT portal,
// any enrolment elsewhere.
function hasPerks() {
    if (state.portal.key === 'industrial') return state.courses.includes('industrial-training-mastery');
    return state.courses.length > 0;
}

async function loadCourses(userId) {
    try {
        const { data, error } = await supabaseClient.from('enrollment').select('course').eq('uuid', userId);
        if (error) throw error;
        return (data || []).map((row) => row.course);
    } catch (error) {
        console.warn('Enrolments could not load:', error);
        return [];
    }
}

function portalLink(job) {
    return `/job.html?id=${encodeURIComponent(job.id)}&type=${encodeURIComponent(state.portal.jobType)}`;
}

function render() {
    const job = state.job;
    const container = document.getElementById('jobDetailsContainer');
    const loading = document.getElementById('loadingState');
    container.innerHTML = detailHtml(job, state.portal, {
        now: new Date(),
        loggedIn: Boolean(state.session),
        courses: state.courses,
        saved: isSaved(job),
        returnUrl: window.location.pathname + window.location.search,
        headingId: 'jobTitle',
        descriptionLoading: false,
    });
    loading.hidden = true;
    container.hidden = false;
    const headline = cardHeadline(job, state.portal);
    document.title = `${headline.title}${headline.companyFirst ? '' : ` at ${companyName(job)}`} | My Student Club`;
}

function showError(message) {
    const loading = document.getElementById('loadingState');
    loading.innerHTML = `<div class="pv2-empty pv2-error" role="alert">
  <div class="pv2-empty-art" aria-hidden="true"><i class="fa-solid fa-briefcase"></i></div>
  <h3>${escapeHtml(message)}</h3>
  <p>It may have been filled or taken down. Fresh vacancies are on the portal.</p>
  <div class="pv2-empty-actions"><a class="pv2-btn pv2-btn-primary" href="${escapeHtml(state.portal.path)}">See fresh vacancies</a></div>
</div>`;
}

async function onClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target || !state.job) return;
    const job = state.job;
    const action = target.dataset.action;
    if (['apply', 'reveal', 'easy-apply'].includes(action)) {
        event.preventDefault();
        window.location.href = portalLink(job);
    } else if (action === 'save') {
        toggleSaved(job);
        render();
    } else if (action === 'share') {
        const url = shareUrl(job, state.portal, window.location.origin);
        const text = `Check out this job at *${companyName(job)}*\nURL - ${url}`;
        if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
            navigator.share({ title: `Job at ${companyName(job)}`, text, url }).catch(() => {});
        } else {
            try {
                await navigator.clipboard.writeText(text);
                target.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Copied';
            } catch { /* clipboard blocked */ }
        }
    } else if (action === 'peers') {
        event.preventDefault();
        if (!state.session) {
            window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.href)}`;
        } else if (!hasPerks() || !canSeeApplyDetails(job, state.portal, state.courses)) {
            window.open(state.portal.programme.href, '_blank', 'noopener');
        } else {
            window.open(peersSearchUrl(job, state.portal), '_blank', 'noopener');
        }
    }
}

async function init() {
    const params = new URLSearchParams(window.location.search);
    state.portal = portalFromParams(params);
    const backLink = document.getElementById('backLink');
    if (backLink) backLink.href = state.portal.path;
    const id = params.get('id');
    if (!id) {
        showError('No vacancy was named in this link.');
        return;
    }
    if (!supabaseClient) {
        showError('This page could not connect. Please refresh.');
        return;
    }
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        state.session = session || null;
    } catch {
        state.session = null;
    }
    const coursesPromise = state.session?.user?.id ? loadCourses(state.session.user.id) : Promise.resolve([]);
    const result = await selectWithFallback((omit) => supabaseClient
        .from(state.portal.table)
        .select(detailColumns(state.portal, { omit }))
        .eq('id', id)
        .maybeSingle());
    const row = Array.isArray(result.data) ? result.data[0] : result.data;
    if (result.error || !row || row.hidden === true) {
        if (result.error) console.error('Vacancy failed to load:', result.error);
        showError('This vacancy is no longer listed.');
        return;
    }
    state.courses = await coursesPromise;
    state.job = publicJob(row);
    state.job.__detailLoaded = true;
    render();
    document.getElementById('jobDetailsContainer').addEventListener('click', onClick);
}

init();
