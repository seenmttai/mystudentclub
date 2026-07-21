import { getDaysAgo } from './date-utils.js';

function isSalaryDisclosed(val) {
    if (!val) return false;
    const clean = val.toString().replace(/[₹\s\-\.]/g, '').toLowerCase();
    return clean !== '' && clean !== 'notdisclosed' && clean !== 'nil' && clean !== 'null' && clean !== 'na';
}

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentSession = null;
let allApplications = [];
let savedJobsList = [];
let filteredApplications = [];
let currentPortalFilter = 'all';
let currentViewMode = 'applied'; // 'applied' | 'saved'
let currentSearchTerm = '';
let currentSort = 'newest';

const SAVED_JOBS_KEY = 'msc_saved_jobs';

const PORTAL_DISPLAY_NAMES = {
    'Industrial Training Job Portal': 'Industrial Training',
    'Articleship Jobs': 'Articleship',
    'Semi Qualified Jobs': 'Semi Qualified',
    'Fresher Jobs': 'CA Freshers',
    'Experienced CA Jobs': 'Experienced CA'
};

const dom = {
    loader: null,
    historyContent: null,
    searchInput: null,
    sortBySelect: null,
    portalFilters: null,
    applicationCount: null,
    modalOverlay: null,
    modalBody: null,
    modalCloseBtn: null
};

// Initialize DOM elements
function initializeDOM() {
    dom.loader = document.getElementById('loader');
    dom.historyContent = document.getElementById('historyContent');
    dom.searchInput = document.getElementById('searchInput');
    dom.sortBySelect = document.getElementById('sortBySelect');
    dom.portalFilters = document.getElementById('portalFilters');
    dom.applicationCount = document.getElementById('applicationCount');
    dom.modalOverlay = document.getElementById('modal');
    dom.modalBody = document.getElementById('modal-body-content');
    dom.modalCloseBtn = document.getElementById('modalCloseBtn');
    dom.resetFiltersBtn = document.getElementById('resetFiltersBtn');
    dom.portalSelectMobile = document.getElementById('portalSelectMobile');
}

let enrollmentStatusCache = null;

async function prefetchEnrollmentStatus(userId) {
    try {
        const { count: anyCount, error: e1 } = await supabaseClient
            .from('enrollment')
            .select('course', { count: 'exact', head: true })
            .eq('uuid', userId);
        if (e1) throw e1;
        const hasAny = (anyCount || 0) > 0;
        enrollmentStatusCache = { any: hasAny, industrialTraining: false, freshers: false };
        if (hasAny) {
            const [r1, r2] = await Promise.all([
                supabaseClient.from('enrollment').select('course', { count: 'exact', head: true }).eq('uuid', userId).eq('course', 'industrial-training-mastery'),
                supabaseClient.from('enrollment').select('course', { count: 'exact', head: true }).eq('uuid', userId).eq('course', 'msc-ca-freshers-program')
            ]);
            enrollmentStatusCache.industrialTraining = (r1.count || 0) > 0;
            enrollmentStatusCache.freshers = (r2.count || 0) > 0;
        }
    } catch (e) {
        console.error('Failed to prefetch enrollment:', e);
        enrollmentStatusCache = { any: false, industrialTraining: false, freshers: false };
    }
}

function isEnrolledSync(tableName) {
    if (!enrollmentStatusCache) return false;
    if (tableName === 'Industrial Training Job Portal') return enrollmentStatusCache.industrialTraining;
    return enrollmentStatusCache.any;
}

// Check authentication
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;

    if (!currentSession) {
        window.location.href = '/login.html';
        return false;
    }

    await prefetchEnrollmentStatus(session.user.id);

    updateAuthUI();
    return true;
}

function updateAuthUI() {
    const authContainer = document.querySelector('.auth-buttons-container');
    if (!authContainer) return;

    if (currentSession) {
        authContainer.innerHTML = `
            <a href="/profile.html" class="auth-icon-btn" title="My Profile">
                <i class="fas fa-user"></i>
            </a>
        `;
    } else {
        authContainer.innerHTML = `
            <a href="/login.html" class="auth-icon-btn" title="Login">
                <i class="fas fa-sign-in-alt"></i>
            </a>
        `;
    }
}

// Fetch all applications for current user
async function fetchApplications() {
    if (!currentSession) return [];

    try {
        const { data, error } = await supabaseClient
            .from('job_applications')
            .select('*')
            .eq('user_id', currentSession.user.id)
            .order('applied_at', { ascending: false });

        if (error) throw error;

        // Fetch job details for each application
        const applicationsWithDetails = await Promise.all(
            data.map(async (app) => {
                try {
                    let targetTable = app.job_table;
                    let targetJobId = app.job_id;

                    if (app.job_table.includes('|')) {
                        const parts = app.job_table.split('|');
                        targetTable = parts[0];
                        targetJobId = parts[1]; // This is the UUID
                    }

                    let selectQuery = 'id, Company, Location, Category, Salary, Description, Created_At, "Application ID"';
                    if (targetTable === 'Fresher Jobs') selectQuery += ', Experience';

                    let queryCols = selectQuery;
                    if (targetTable === 'Industrial Training Job Portal') {
                        queryCols += ', is_exclusive';
                    }

                    let { data: jobData, error: jobError } = await supabaseClient
                        .from(targetTable)
                        .select(queryCols)
                        .eq('id', targetJobId)
                        .single();

                    if (jobError && jobError.message && jobError.message.includes('is_exclusive')) {
                        console.warn('is_exclusive column does not exist on Supabase yet. Retrying without it.');
                        const retryRes = await supabaseClient
                            .from(targetTable)
                            .select(selectQuery)
                            .eq('id', targetJobId)
                            .single();
                        jobData = retryRes.data;
                        jobError = retryRes.error;
                    }

                    if (jobError) {
                        console.error(`Failed to fetch job ${targetJobId} from ${targetTable}:`, jobError);
                        return {
                            ...app,
                            job_table: targetTable,
                            job_id: targetJobId,
                            job: {
                                id: targetJobId,
                                Company: 'Unknown Company',
                                Location: 'N/A',
                                Category: 'Job Unavailable',
                                Salary: 'N/A',
                                Description: 'This job post may have been removed or is inaccessible.',
                                Created_At: null,
                                "Application ID": '#'
                            }
                        };
                    }

                    return {
                        ...app,
                        job_table: targetTable,
                        job_id: targetJobId,
                        job: jobData
                    };
                } catch (err) {
                    console.error('Error fetching job details:', err);
                    return {
                        ...app,
                        job: {
                            id: app.job_id,
                            Company: 'Error Loading',
                            Category: 'Error',
                            Description: 'Failed to load job details.',
                            "Application ID": '#'
                        }
                    };
                }
            })
        );

        return applicationsWithDetails.filter(app => app !== null && app.job !== null);
    } catch (error) {
        console.error('Error fetching applications:', error);
        return [];
    }
}

// Fetch details for jobs saved via bookmark
function getSavedJobRefs() {
    try {
        return JSON.parse(localStorage.getItem(SAVED_JOBS_KEY) || '[]');
    } catch (e) {
        return [];
    }
}

async function fetchSavedJobs() {
    const refs = getSavedJobRefs();
    if (refs.length === 0) return [];

    const results = await Promise.all(refs.map(async (ref) => {
        try {
            const { data, error } = await supabaseClient
                .from(ref.table)
                .select('*')
                .eq('id', ref.id)
                .single();
            if (error || !data) return null;
            return {
                isSaved: true,
                applied_at: ref.savedAt,
                job_table: ref.table,
                job_id: ref.id,
                job: data
            };
        } catch (e) {
            return null;
        }
    }));

    return results.filter(Boolean).sort((a, b) => new Date(b.applied_at) - new Date(a.applied_at));
}

function removeSavedJob(jobId, table) {
    const refs = getSavedJobRefs().filter(r => !(String(r.id) === String(jobId) && r.table === table));
    localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(refs));
    savedJobsList = savedJobsList.filter(s => !(String(s.job_id) === String(jobId) && s.job_table === table));
    filterAndSortApplications();
}

// Render list layout application card
function renderApplicationCard(application) {
    const job = application.job;
    const companyName = (job.Company || '').trim();
    const companyInitial = companyName ? companyName.charAt(0).toUpperCase() : '?';
    const appliedDate = application.applied_at ? getDaysAgo(application.applied_at) : 'N/A';

    let portalName = PORTAL_DISPLAY_NAMES[application.job_table] || application.job_table;
    if (application.job_table === 'Fresher Jobs' && job.Experience === 'Experienced') {
        portalName = 'Experienced CA';
    }

    const isExclusive = !!job.is_exclusive;
    const isLocked = isExclusive && !isEnrolledSync('Industrial Training Job Portal');

    const card = document.createElement('article');
    card.className = 'job-card' + (isExclusive ? ' job-card-exclusive' : ''); // Reuse portal card styles from portal-style.css
    card.dataset.applicationId = application.id;
    card.dataset.jobId = application.job_id;

    if (application.job_table === 'Fresher Jobs' && job.Experience === 'Experienced') {
        card.dataset.jobTable = 'Experienced CA Jobs';
    } else {
        card.dataset.jobTable = application.job_table;
    }

    const roleLabel = job.Role || (application.job_table === 'Industrial Training Job Portal' ? 'Industrial Trainee' : application.job_table === 'Articleship Jobs' ? 'Articleship' : 'Professional');
    const compText = job.Salary ? `${job.Salary}` : '';
    const descriptionText = job.Description ? job.Description.replace(/[#*_`\[\]]/g, '').trim() : '';
    const snippet = descriptionText ? `${descriptionText.slice(0, 110)}${descriptionText.length > 110 ? '...' : ''}` : 'No description available.';

    const statusText = application.isSaved ? 'Saved' : 'Applied';
    const isPopular = (application.job.application_count || 0) > 50;

    card.innerHTML = `
        <div class="job-card-top-row">
            <div class="job-card-logo">${companyInitial}</div>
            <div class="job-card-header">
                <h3 class="job-card-role-title" style="margin-bottom: 0.15rem;">${roleLabel}</h3>
                <h4 class="job-card-company" style="font-size: 0.9rem; font-weight: 500; color: #475569; margin-bottom: 0.25rem;">${job.Company || 'N/A'}</h4>
                <p class="job-card-posted old" style="font-size: 0.72rem; color: #94a3b8; font-weight: 500;">
                    ${statusText} ${appliedDate}
                </p>
            </div>
            <button class="job-card-bookmark" title="Save job" aria-label="Bookmark job" style="display: none;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
            </button>
        </div>
        <div class="job-card-tags" style="margin-bottom: 0.75rem;">
            ${isExclusive ? `<span class="job-tag tag-exclusive"><i class="fas fa-star"></i> Exclusive</span>` : ""}
            ${isPopular ? `<span class="job-tag tag-popular"><i class="fas fa-fire"></i> Popular</span>` : ''}
            <span class="job-tag tag-primary">${portalName}</span>
            ${job.Location ? `
                <span class="job-tag">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="11" height="11"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    ${job.Location}
                </span>` : ''}
            ${isSalaryDisclosed(compText) ? `<span class="job-tag" style="background-color: #ecfdf5; color: #065f46; border-color: #a7f3d0;">₹${compText}</span>` : ''}
            ${job.Category ? `<span class="job-tag">${job.Category}</span>` : ''}
        </div>
        <p class="job-card-description" style="margin-bottom: 0.85rem;">${snippet}</p>
        <div class="job-card-actions" style="display: grid; grid-template-columns: ${application.isSaved ? '1fr 1fr' : '1fr 1.5fr'}; gap: 0.5rem; margin-top: auto; width: 100%;">
             ${application.isSaved 
                 ? `<button class="unsave-btn" type="button" style="padding: 0.65rem 1rem; background: #fff; color: #ef4444; border: 1.5px solid #fee2e2; border-radius: 12px; font-size: 0.82rem; font-weight: 600; cursor: pointer; transition: all 0.2s;">Remove</button>` 
                 : `<div class="app-status-badge" style="display: inline-flex; align-items: center; justify-content: center; gap: 0.25rem; padding: 0.65rem 1rem; border-radius: 12px; font-size: 0.82rem; font-weight: 700; background: rgba(16, 185, 129, 0.08); color: #10b981; border: 1.5px solid rgba(16, 185, 129, 0.15); box-sizing: border-box; text-align: center; height: 38px;">
                      <svg fill="currentColor" viewBox="0 0 24 24" style="width:11px; height:11px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>Applied
                    </div>`}
             <button class="view-details-card-btn secondary" type="button" style="width: 100%;">View Details ›</button>
        </div>
    `;

    card.addEventListener('click', () => {
        if (isLocked) {
            showExclusiveLockedModal(job);
        } else {
            showJobModal(application);
        }
    });

    const unsaveBtn = card.querySelector('.unsave-btn');
    if (unsaveBtn) {
        unsaveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeSavedJob(application.job_id, application.job_table);
        });
    }

    return card;
}

function showExclusiveLockedModal(job) {
    const companyName = (job.Company || '').trim();
    const companyInitial = companyName ? companyName.charAt(0).toUpperCase() : '?';

    dom.modalBody.innerHTML = `
        <div class="modal-header">
            <div class="modal-logo">${companyInitial}</div>
            <div class="modal-title-group">
                <h2>${job.Company || 'Company'}</h2>
                <p>${job.Location || ''}</p>
            </div>
        </div>
        <div style="
            text-align: center;
            padding: 2.5rem 1.5rem 2rem;
            background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%);
            border-radius: 16px;
            border: 1.5px solid #fbbf24;
            margin: 1.25rem 0;
        ">
            <div style="
                width: 64px; height: 64px;
                background: linear-gradient(135deg, #f59e0b, #d97706);
                border-radius: 50%;
                display: flex; align-items: center; justify-content: center;
                margin: 0 auto 1rem;
                box-shadow: 0 8px 20px rgba(245,158,11,0.35);
            ">
                <i class="fas fa-lock" style="color: white; font-size: 1.5rem;"></i>
            </div>
            <div style="
                display: inline-flex; align-items: center; gap: 0.4rem;
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: white; font-size: 0.7rem; font-weight: 700;
                padding: 3px 10px; border-radius: 999px; letter-spacing: 0.06em;
                margin-bottom: 1rem;
            ">
                <i class="fas fa-star" style="font-size: 0.65rem;"></i> EXCLUSIVE VACANCY
            </div>
            <h3 style="font-size: 1.15rem; font-weight: 700; color: #92400e; margin-bottom: 0.6rem;">
                MSC Program Members Only
            </h3>
            <p style="color: #78350f; font-size: 0.9rem; line-height: 1.6; margin-bottom: 1.5rem; max-width: 320px; margin-left: auto; margin-right: auto;">
                This vacancy is exclusively available to students enrolled in the <strong>MSC CA Industrial Training Program</strong>. Enroll to unlock full details and apply directly.
            </p>
            <a href="/ca-industrial-training-program" target="_blank" style="
                display: inline-flex; align-items: center; gap: 0.5rem;
                background: linear-gradient(135deg, #f59e0b, #d97706);
                color: white; font-weight: 600; font-size: 0.92rem;
                padding: 0.75rem 1.75rem; border-radius: 10px;
                text-decoration: none;
                box-shadow: 0 4px 14px rgba(245,158,11,0.4);
                transition: transform 0.2s, box-shadow 0.2s;
            " onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(245,158,11,0.5)'" onmouseout="this.style.transform='';this.style.boxShadow='0 4px 14px rgba(245,158,11,0.4)'">
                <i class="fas fa-graduation-cap"></i>
                Enroll in MSC Program
            </a>
            ${!currentSession ? `
            <p style="margin-top: 1rem; font-size: 0.82rem; color: #92400e;">
                Already enrolled? <a href="/login.html" style="color: #d97706; font-weight: 600; text-decoration: underline;">Sign in</a> to access.
            </p>` : ''}
        </div>
        <div class="modal-footer" style="text-align: center; padding: 1rem; border-top: 1px solid #e5e7eb; margin-top: 1rem;">
            <p style="color: #6b7280; font-size: 0.85rem;">
                <i class="fas fa-shield-alt" style="color: #f59e0b; margin-right: 4px;"></i>
                Exclusive vacancies are MSCIT program enrolled students only.
            </p>
        </div>`;

    dom.modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

// Record application in Supabase when applying from saved view
async function recordApplicationFromSaved(application) {
    if (!currentSession) return false;
    try {
        const { error } = await supabaseClient
            .from('job_applications')
            .insert({
                user_id: currentSession.user.id,
                job_id: application.job_id,
                job_table: application.job_table,
                applied_at: new Date().toISOString()
            });
        if (error && error.code !== '23505') { // ignore duplicate
            console.error('Error recording application:', error);
            return false;
        }
        return true;
    } catch (e) {
        console.error('Application exception:', e);
        return false;
    }
}

// Show job details modal (as premium centered popup)
function showJobModal(application) {
    const job = application.job;
    const companyName = (job.Company || '').trim();
    const companyInitial = companyName ? companyName.charAt(0).toUpperCase() : '?';
    const appliedDate = application.applied_at ? getDaysAgo(application.applied_at) : 'N/A';
    const portalName = PORTAL_DISPLAY_NAMES[application.job_table] || application.job_table;

    const renderMarkdown = (text) => {
        if (!text) return 'No description available.';
        let html = text
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/__(.+?)__/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/_(.+?)_/g, '<em>$1</em>')
            .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        return '<p>' + html + '</p>';
    };

    const generateApplicationLinks = (applicationId) => {
        if (!applicationId) return '<p class="modal-description">No Application ID Available</p>';
        const links = applicationId.split(',').map(link => link.trim()).filter(link => link);
        if (links.length === 0) return '<p class="modal-description">No Application ID Available</p>';

        return links.map((link, index) => `
            <div style="display: flex; align-items: center; gap: 0.75rem; background: #f8fafc; padding: 0.4rem; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: ${index < links.length - 1 ? '0.75rem' : '0'};">
                <p class="modal-description" style="flex: 1; margin: 0; word-break: break-all; font-size: 0.95rem; background:none; border:none; padding:0;">${link}</p>
                <button class="modal-copy-btn" data-copy-text="${link.replace(/"/g, '&quot;')}" style="background: #3b82f6; color: white; border: none; border-radius: 6px; padding: 0.6rem 0.8rem; cursor: pointer; transition: all 0.2s; flex-shrink: 0; min-width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;" title="Copy to clipboard">
                    <i class="fas fa-copy" style="font-size: 1rem;"></i>
                </button>
            </div>
        `).join('');
    };

    dom.modalBody.innerHTML = `
        <div class="modal-header">
            <div class="modal-logo">${companyInitial}</div>
            <div class="modal-title-group">
                <h2>${job.Company}</h2>
                <p>${job.Location}</p>
            </div>
        </div>

        <div class="modal-meta-tags" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
            ${application.isSaved ? `<span class="job-tag" style="background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8;">
                <svg fill="currentColor" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
                Saved ${appliedDate}
            </span>` : `<span class="job-tag" style="background: #ecfdf5; border-color: #a7f3d0; color: #065f46;">
                <svg fill="currentColor" viewBox="0 0 24 24" style="width: 12px; height: 12px; margin-right: 4px;"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                Applied ${appliedDate}
            </span>`}
            <span class="job-tag" style="background-color: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; font-weight: 600;">${portalName}</span>
            ${isSalaryDisclosed(job.Salary) ? `<span class="job-tag">${application.job_table.includes('Semi Qualified') || application.job_table.includes('Fresher') ? 'Salary' : 'Stipend'}: ₹${job.Salary}</span>` : ''}
            ${job.Category ? `<span class="job-tag">Category: ${job.Category}</span>` : ''}
        </div>

        ${application.isSaved ? `
        <div style="display: flex; gap: 0.65rem; flex-wrap: wrap;">
            <button id="modalApplyNowBtn" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.7rem 1.25rem; background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: #fff; border: none; border-radius: 12px; font-size: 0.88rem; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 12px rgba(59,130,246,0.25);">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                Apply Now
            </button>
        </div>
        ` : ''}

        <div class="modal-section">
            <h3><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>Apply here!</h3>
            ${generateApplicationLinks(job['Application ID'])}
        </div>

        <div class="modal-section">
            <h3><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Job Description</h3>
            <div class="modal-description">${renderMarkdown(job.Description)}</div>
        </div>

        <div class="modal-footer" style="text-align: center; padding: 1rem; border-top: 1px solid #e5e7eb; margin-top: 1rem;">
            <p style="color: #6b7280; font-size: 0.9rem;">
                Found an issue with this job posting?
                <a href="/contact.html" style="color: #2563eb; text-decoration: none; font-weight: 500;">Report it</a>
            </p>
        </div>
    `;

    dom.modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Copy clipboards
    const copyBtns = dom.modalBody.querySelectorAll('.modal-copy-btn');
    copyBtns.forEach(copyBtn => {
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const text = copyBtn.getAttribute('data-copy-text');
            const icon = copyBtn.querySelector('i');
            const originalClass = icon.className;

            navigator.clipboard.writeText(text).then(() => {
                icon.className = 'fas fa-check';
                copyBtn.style.background = '#10b981';
                setTimeout(() => {
                    icon.className = originalClass;
                    copyBtn.style.background = '#3b82f6';
                }, 2000);
            }).catch(err => {
                console.error('Copy failed:', err);
                alert('Failed to copy.');
            });
        });
    });

    // Apply Now button (only in saved view)
    if (application.isSaved) {
        const applyNowBtn = dom.modalBody.querySelector('#modalApplyNowBtn');
        if (applyNowBtn) {
            applyNowBtn.addEventListener('click', async () => {
                const appId = job['Application ID'];
                const firstLink = appId ? appId.split(',')[0].trim() : null;

                // Determine link type
                let applyHref = null;
                if (firstLink) {
                    if (firstLink.toLowerCase().startsWith('http')) {
                        applyHref = firstLink;
                    } else if (firstLink.includes('@')) {
                        applyHref = `mailto:${firstLink}`;
                    } else {
                        applyHref = `https://www.google.com/search?q=${encodeURIComponent(firstLink + ' careers')}`;
                    }
                }

                // Show loading
                applyNowBtn.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:0.9rem;"></i> Applying...';
                applyNowBtn.disabled = true;

                const success = await recordApplicationFromSaved(application);

                if (success) {
                    // Build full application record and push to allApplications
                    const newApp = {
                        ...application,
                        isSaved: false,
                        applied_at: new Date().toISOString()
                    };
                    delete newApp.isSaved;
                    allApplications.unshift(newApp);

                    // Remove from saved list
                    removeSavedJob(application.job_id, application.job_table);

                    // Close modal
                    closeModal();

                    // Switch to applied view
                    const appliedBtn = document.getElementById('appliedToggleBtn');
                    const savedBtn = document.getElementById('savedToggleBtn');
                    currentViewMode = 'applied';
                    if (appliedBtn) appliedBtn.classList.add('active');
                    if (savedBtn) savedBtn.classList.remove('active');
                    filterAndSortApplications();
                    updateCounts();

                    // Open the apply link
                    if (applyHref) window.open(applyHref, '_blank');
                } else {
                    applyNowBtn.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="15" height="15"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg> Apply Now';
                    applyNowBtn.disabled = false;
                    alert('Failed to record application. Please try again.');
                }
            });
        }
    }
}

// Close drawer modal
function closeModal() {
    dom.modalOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Filter and sort applications
function filterAndSortApplications() {
    let filtered = currentViewMode === 'saved' ? savedJobsList : allApplications;

    // Apply portal filters in applied view
    if (currentViewMode === 'applied' && currentPortalFilter !== 'all') {
        if (currentPortalFilter === 'Experienced CA Jobs') {
            filtered = filtered.filter(app => app.job_table === 'Fresher Jobs' && app.job?.Experience === 'Experienced');
        } else if (currentPortalFilter === 'Fresher Jobs') {
            filtered = filtered.filter(app => app.job_table === 'Fresher Jobs' && app.job?.Experience !== 'Experienced');
        } else {
            filtered = filtered.filter(app => app.job_table === currentPortalFilter);
        }
    }

    // Apply search filter (Company, Location)
    if (currentSearchTerm.trim()) {
        const searchLower = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(app => {
            const company = (app.job.Company || '').toLowerCase();
            const location = (app.job.Location || '').toLowerCase();
            return company.includes(searchLower) || location.includes(searchLower);
        });
    }

    // Sorting logic
    if (currentSort === 'newest') {
        filtered.sort((a, b) => new Date(b.applied_at) - new Date(a.applied_at));
    } else if (currentSort === 'oldest') {
        filtered.sort((a, b) => new Date(a.applied_at) - new Date(b.applied_at));
    } else if (currentSort === 'company_asc') {
        filtered.sort((a, b) => (a.job.Company || '').localeCompare(b.job.Company || ''));
    } else if (currentSort === 'company_desc') {
        filtered.sort((a, b) => (b.job.Company || '').localeCompare(a.job.Company || ''));
    }

    filteredApplications = filtered;
    renderApplications();
    updateCounts();
}

// Update counters
function updateCounts() {
    // View Mode Count Badges
    const vmtApplied = document.getElementById('vmtAppliedCount');
    const vmtSaved = document.getElementById('vmtSavedCount');
    if (vmtApplied) vmtApplied.textContent = allApplications.length;
    if (vmtSaved) vmtSaved.textContent = savedJobsList.length;

    // Inline counter
    if (dom.applicationCount) {
        dom.applicationCount.textContent = allApplications.length;
    }

    // Portal pill count tags
    const portalCounts = {
        'all': allApplications.length,
        'Industrial Training Job Portal': 0,
        'Articleship Jobs': 0,
        'Semi Qualified Jobs': 0,
        'Fresher Jobs': 0,
        'Experienced CA Jobs': 0
    };

    allApplications.forEach(app => {
        let key = app.job_table;
        if (app.job_table === 'Fresher Jobs' && app.job?.Experience === 'Experienced') {
            key = 'Experienced CA Jobs';
        }
        if (portalCounts.hasOwnProperty(key)) {
            portalCounts[key]++;
        }
    });

    Object.keys(portalCounts).forEach(portal => {
        const countElement = document.querySelector(`[data-count="${portal}"]`);
        if (countElement) {
            countElement.textContent = portalCounts[portal];
        }
    });
}

// Render dynamic content
function renderApplications() {
    if (!dom.historyContent) return;

    if (filteredApplications.length === 0) {
        if (currentViewMode === 'saved') {
            dom.historyContent.innerHTML = `
                <div class="empty-state">
                    <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    <h3>No saved jobs found</h3>
                    <p>Bookmarks help you remember interesting jobs. Tap the bookmark icon on any portal card to save jobs here.</p>
                    <a href="/" class="empty-state-cta">Browse Portals</a>
                </div>
            `;
            return;
        }

        dom.historyContent.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3>No applications found</h3>
                <p>Track your recruitment process easily here. Tap applied links in any portal to see items list here.</p>
                <a href="/" class="empty-state-cta">Browse Jobs</a>
            </div>
        `;
        return;
    }

    dom.historyContent.innerHTML = '';

    filteredApplications.forEach(app => {
        dom.historyContent.appendChild(renderApplicationCard(app));
    });
}

// Initialize Page Controller
async function initializePage() {
    initializeDOM();

    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;

    if (dom.loader) dom.loader.style.display = 'flex';

    // Parallel fetch from Supabase and LocalStorage bookmarks
    [allApplications, savedJobsList] = await Promise.all([fetchApplications(), fetchSavedJobs()]);
    filteredApplications = [...allApplications];

    if (dom.loader) dom.loader.style.display = 'none';

    renderApplications();
    updateCounts();

    setupEventListeners();
    initCustomSelects();
}

// Attach Event Listeners
function setupEventListeners() {
    // Search input keyword filtering
    if (dom.searchInput) {
        dom.searchInput.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value;
            filterAndSortApplications();
        });
    }

    // Sorting selection dropdown
    if (dom.sortBySelect) {
        dom.sortBySelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            filterAndSortApplications();
        });
    }

    // Portal header filter tabs click mapping
    if (dom.portalFilters) {
        const tabs = dom.portalFilters.querySelectorAll('.footer-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                currentPortalFilter = tab.dataset.portal;

                if (dom.portalSelectMobile) {
                    dom.portalSelectMobile.value = currentPortalFilter;
                }

                filterAndSortApplications();
            });
        });
    }

    // Main Toggle: Applied vs Saved Opportunity View Mode
    const appliedBtn = document.getElementById('appliedToggleBtn');
    const savedBtn = document.getElementById('savedToggleBtn');

    function setViewMode(mode) {
        currentViewMode = mode;
        if (appliedBtn) appliedBtn.classList.toggle('active', mode === 'applied');
        if (savedBtn) savedBtn.classList.toggle('active', mode === 'saved');

        const tabsContainer = document.querySelector('.portal-tabs-container');
        if (tabsContainer) {
            tabsContainer.style.opacity = mode === 'saved' ? '0.4' : '1';
            tabsContainer.style.pointerEvents = mode === 'saved' ? 'none' : '';
        }

        filterAndSortApplications();
    }

    if (appliedBtn) appliedBtn.addEventListener('click', () => setViewMode('applied'));
    if (savedBtn) savedBtn.addEventListener('click', () => setViewMode('saved'));

    // Mobile Portal drop sync
    if (dom.portalSelectMobile) {
        dom.portalSelectMobile.addEventListener('change', (e) => {
            currentPortalFilter = e.target.value;

            if (dom.portalFilters) {
                const pills = dom.portalFilters.querySelectorAll('.portal-pill');
                pills.forEach(p => {
                    if (p.dataset.portal === currentPortalFilter) {
                        p.classList.add('active');
                    } else {
                        p.classList.remove('active');
                    }
                });
            }

            filterAndSortApplications();
        });
    }

    // Modal drawer close triggers
    if (dom.modalCloseBtn) {
        dom.modalCloseBtn.addEventListener('click', closeModal);
    }
    if (dom.modalOverlay) {
        dom.modalOverlay.addEventListener('click', (e) => {
            if (e.target === dom.modalOverlay) {
                closeModal();
            }
        });
    }

    // Top Header menu toggle triggers
    const menuButton = document.getElementById('menuButton');
    const menuCloseBtn = document.getElementById('menuCloseBtn');
    const expandedMenu = document.getElementById('expandedMenu');

    if (menuButton && expandedMenu) {
        menuButton.addEventListener('click', () => {
            expandedMenu.classList.add('active');
        });
    }

    if (menuCloseBtn && expandedMenu) {
        menuCloseBtn.addEventListener('click', () => {
            expandedMenu.classList.remove('active');
        });
    }

    // Mobile Sidebar filter buttons
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    const mobileFilterToggle = document.getElementById('mobileFilterToggle');
    const filterSidebar = document.getElementById('filterSidebar');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');

    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', (e) => {
            const searchFilter = document.getElementById('searchInput');
            if (searchFilter) {
                searchFilter.value = e.target.value;
                searchFilter.dispatchEvent(new Event('input'));
            }
        });
    }

    if (mobileFilterToggle && filterSidebar) {
        mobileFilterToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            filterSidebar.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }

    function closeSidebar() {
        if (filterSidebar) {
            filterSidebar.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', closeSidebar);
    }

    document.addEventListener('click', (e) => {
        if (filterSidebar && filterSidebar.classList.contains('active')) {
            if (!filterSidebar.contains(e.target) && !mobileFilterToggle.contains(e.target)) {
                closeSidebar();
            }
        }
    });
}

// Re-implement Custom Select Dropdown logic to align with styles
function initCustomSelects() {
    const selectorIds = ['sortBySelect', 'portalSelectMobile'];

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select-wrapper')) {
            document.querySelectorAll('.custom-select-wrapper.open').forEach(wrapper => {
                wrapper.classList.remove('open');
                const opts = wrapper.querySelector('.custom-options');
                if (opts) {
                    opts.style.opacity = '0';
                    setTimeout(() => opts.style.display = 'none', 200);
                }
            });
        }
    });

    selectorIds.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        if (select.parentNode.classList.contains('custom-select-wrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        trigger.innerHTML = `<span>${select.options[select.selectedIndex]?.text || 'Select'}</span><div class="custom-arrow"></div>`;

        const optionsList = document.createElement('div');
        optionsList.className = 'custom-options';

        const buildOptions = () => {
            optionsList.innerHTML = '';
            Array.from(select.options).forEach(opt => {
                const div = document.createElement('div');
                div.className = `custom-option ${opt.selected ? 'selected' : ''}`;
                div.textContent = opt.text;
                div.dataset.value = opt.value;
                div.addEventListener('click', (e) => {
                    e.stopPropagation();
                    select.value = opt.value;
                    trigger.querySelector('span').textContent = opt.text;
                    wrapper.classList.remove('open');
                    optionsList.style.display = 'none';

                    optionsList.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                    div.classList.add('selected');

                    select.dispatchEvent(new Event('change'));
                });
                optionsList.appendChild(div);
            });
        };

        buildOptions();

        select.style.display = 'none';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select);
        wrapper.appendChild(trigger);
        wrapper.appendChild(optionsList);

        trigger.addEventListener('click', () => {
            const isOpen = wrapper.classList.contains('open');
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                if (w !== wrapper) {
                    w.classList.remove('open');
                    w.querySelector('.custom-options').style.display = 'none';
                }
            });

            if (!isOpen) {
                wrapper.classList.add('open');
                optionsList.style.display = 'block';
                optionsList.offsetHeight;
                optionsList.style.opacity = '1';
            } else {
                wrapper.classList.remove('open');
                optionsList.style.opacity = '0';
                setTimeout(() => optionsList.style.display = 'none', 200);
            }
        });

        const observer = new MutationObserver(() => {
            buildOptions();
            const sel = select.options[select.selectedIndex];
            if (sel) trigger.querySelector('span').textContent = sel.text;
        });
        observer.observe(select, { childList: true, subtree: true });

        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        Object.defineProperty(select, 'value', {
            get: function () { return descriptor.get.call(this); },
            set: function (val) {
                descriptor.set.call(this, val);
                const sel = this.options[this.selectedIndex];
                if (sel) {
                    trigger.querySelector('span').textContent = sel.text;
                    optionsList.querySelectorAll('.custom-option').forEach(o => {
                        o.classList.toggle('selected', o.dataset.value === val);
                    });
                }
            }
        });

        select.addEventListener('change', () => {
            const sel = select.options[select.selectedIndex];
            if (sel) {
                trigger.querySelector('span').textContent = sel.text;
                optionsList.querySelectorAll('.custom-option').forEach(o => {
                    o.classList.toggle('selected', o.dataset.value === select.value);
                });
            }
        });
    });
}

document.addEventListener('DOMContentLoaded', initializePage);
