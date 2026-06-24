import { getDaysAgo } from './date-utils.js';
import { isProfileComplete, generateEmailBody, generateFallbackEmail, showResumeRedirectModal, showToast } from './ai-helper.js';

async function handleAiApplyClick(job, btnElement, tableName, simpleMailtoLink) {
    if (!currentSession) {
        window.location.href = '/login.html';
        return;
    }

    if (!isProfileComplete()) {
        showResumeRedirectModal();
        return;
    }

    const btnText = btnElement.querySelector('.btn-text');
    const spinner = btnElement.querySelector('.fa-spinner');
    const originalText = btnText.textContent;
    const originalPointerEvents = btnElement.style.pointerEvents;

    // Show loading state
    btnElement.classList.add('loading');
    btnText.textContent = 'Preparing...';
    if (spinner) spinner.style.display = 'inline-block';
    btnElement.style.pointerEvents = 'none';

    try {
        const emailBody = await generateEmailBody(job, tableName, supabaseClient, currentSession?.user);

        // Construct mailto with AI body
        const rawLink = job['Application ID'];
        const emailMatch = rawLink.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : '';
        const subject = simpleMailtoLink.split('subject=')[1]?.split('&')[0] || `Application for ${job.Category} (Ref: My Student Club)`;

        const aiMailto = `mailto:${email}?subject=${subject}&body=${encodeURIComponent(emailBody)}`;

        await recordApplication(job, btnElement);
        openMailtoLink(aiMailto);

    } catch (error) {
        console.error("AI Apply Failed:", error);
        showToast("Server busy, reverting to simple apply", "error");

        const rawLink = job['Application ID'];
        const emailMatch = rawLink.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : '';
        const subject = simpleMailtoLink.split('subject=')[1]?.split('&')[0] || `Application for ${job.Category} (Ref: My Student Club)`;

        const simpleMailto = `mailto:${email}?subject=${subject}`;

        await recordApplication(job, btnElement);
        setTimeout(() => {
            openMailtoLink(simpleMailto);
        }, 3000);
    } finally {
        // Reset button state
        btnElement.classList.remove('loading');
        btnText.textContent = originalText;
        if (spinner) spinner.style.display = 'none';
        btnElement.style.pointerEvents = originalPointerEvents;
    }
}

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
const WORKER_URL = 'https://storer.bhansalimanan55.workers.dev';

window.flutter_app = {
    isReady: false,
    fcmToken: null
};
window.setFcmToken = function (token) {
    window.flutter_app.fcmToken = token;
    const topicSelectionArea = document.getElementById('topic-selection-area');
    if (topicSelectionArea && topicSelectionArea.style.display !== 'block') {
        updatePermissionStatusUI();
    }
};

let isFetching = false;
let page = 0;
const limit = 15;
let hasMoreData = true;
let currentTable = 'Industrial Training Job Portal';
let currentSession = null;
let appliedJobIds = new Set();
let debounceTimeout = null;
let allLocations = [];
let allCategories = {};
let currentFcmToken = null;
let firebaseMessaging;
// Cache sorted locations/categories for performance
let cachedSortedLocations = null;
let cachedSortedCategories = null;

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBTIXRJbaZy_3ulG0C8zSI_irZI7Ht2Y-8",
    authDomain: "msc-notif.firebaseapp.com",
    projectId: "msc-notif",
    storageBucket: "msc-notif.appspot.com",
    messagingSenderId: "228639798414",
    appId: "1:228639798414:web:b8b3c96b15da5b770a45df",
    measurementId: "G-X4M23TB936"
};
const VAPID_KEY = "BGlNz4fQGzftJPr2U860MsoIo0dgNcqb2y2jAEbwJzjmj8CbDwJy_kD4eRAcruV6kNRs6Kz-mh9rdC37tVgeI5I";
const JOB_TYPES_NOTIF = [
    { value: "industrial", label: "Industrial Training" },
    { value: "semi", label: "Semi Qualified" },
    { value: "fresher", label: "Fresher" },
    { value: "articleship", label: "Articleship" }
];
const LOCATIONS_NOTIF = ["mumbai", "bangalore", "gurgaon", "pune", "kolkata", "delhi", "noida", "hyderabad", "ahmedabad", "chennai", "jaipur"];

const state = {
    keywords: [],
    locations: [],
    categories: [],
    salary: '',
    experience: '',
    sortBy: 'newest',
    applicationStatus: 'all',
    companyType: '',
    industryType: '',
    firmType: ''
};

const dom = {};

const JOB_TITLE_MAP = {
    "Industrial Training Job Portal": "Industrial Training",
    "Fresher Jobs": "CA Fresher",
    "Semi Qualified Jobs": "CA Semi Qualified",
    "Articleship Jobs": "Articleship Trainee"
};

const EMAIL_SUBJECT_MAP = {
    "Industrial Training Job Portal": "Application for CA Industrial Training",
    "Fresher Jobs": "Application for CA Fresher Position",
    "Semi Qualified Jobs": "Application for Semi Qualified CA Position",
    "Articleship Jobs": "Application for CA Articleship"
};

function isExperiencedFresherPortal() {
    const path = window.location.pathname.toLowerCase();
    return path.includes('/experienced-ca-jobs');
}

function isFresherPortal() {
    const path = window.location.pathname.toLowerCase();
    return path.includes('/ca-fresher-jobs');
}

function setActivePortalTab() {
    const path = window.location.pathname;
    document.querySelectorAll('.portal-nav-bar .footer-tab, .site-footer-nav .footer-tab').forEach(tab => tab.classList.remove('active'));

    let activeSelector;
    const experienceFilterGroups = document.querySelectorAll('.experience-filter-group');

    experienceFilterGroups.forEach(el => el.style.display = 'none');

    if (path.includes('/ca-articleship-opportunities') || path.includes('/jobs/articleship/')) {
        currentTable = 'Articleship Jobs';
        activeSelector = 'a[href="/ca-articleship-opportunities"]';
    } else if (path.includes('/semi-qualified-ca-jobs') || path.includes('/jobs/semi-qualified/')) {
        currentTable = 'Semi Qualified Jobs';
        activeSelector = 'a[href="/semi-qualified-ca-jobs"]';
        experienceFilterGroups.forEach(el => el.style.display = 'block');
    } else if (path.toLowerCase().includes('/experienced-ca-jobs') || path.includes('/jobs/experienced/')) {
        currentTable = 'Fresher Jobs';
        activeSelector = 'a[href="/experienced-ca-jobs"]';
        state.experience = 'Experienced';
        experienceFilterGroups.forEach(el => el.style.display = 'none');
    } else if (path.includes('/ca-fresher-jobs') || path.includes('/jobs/fresher/')) {
        currentTable = 'Fresher Jobs';
        activeSelector = 'a[href="/ca-fresher-jobs"]';
        state.experience = 'Freshers';
        experienceFilterGroups.forEach(el => el.style.display = 'none');
    } else {
        currentTable = 'Industrial Training Job Portal';
        activeSelector = 'a[href="/"]';
    }

    if (currentTable === 'Industrial Training Job Portal') {
        state.companyType = '';
    }

    document.querySelectorAll(activeSelector).forEach(el => el.classList.add('active'));

    // Update cache when table changes (categories are table-specific)
    if (allLocations.length > 0 || Object.keys(allCategories).length > 0) {
        updateFilterCache();
    }

    adjustFiltersForPortal();
}

function adjustFiltersForPortal() {
    const getFilterGroup = (elementId) => {
        const el = document.getElementById(elementId);
        return el ? el.closest('.filter-group') : null;
    };

    const companyTypeGroupDesktop = getFilterGroup('companyTypeFilterDesktop');
    const companyTypeGroupMobile = getFilterGroup('companyTypeFilterMobile');
    const industryTypeGroupDesktop = getFilterGroup('industryTypeFilterDesktop');
    const industryTypeGroupMobile = getFilterGroup('industryTypeFilterMobile');
    const firmTypeGroupDesktop = getFilterGroup('firmTypeFilterDesktop');
    const firmTypeGroupMobile = getFilterGroup('firmTypeFilterMobile');
    const experienceGroupDesktop = document.querySelector('.filter-sidebar .experience-filter-group');
    const experienceGroupMobile = document.querySelector('.filter-modal-content .experience-filter-group');
    const salaryGroupDesktop = getFilterGroup('salaryFilterDesktop');
    const salaryGroupMobile = getFilterGroup('salaryFilterMobile');

    const show = (el) => { if (el) el.style.display = 'block'; };
    const hide = (el) => { if (el) el.style.display = 'none'; };

    if (currentTable === 'Industrial Training Job Portal') {
        hide(companyTypeGroupDesktop);
        hide(companyTypeGroupMobile);
        show(industryTypeGroupDesktop);
        show(industryTypeGroupMobile);
        hide(firmTypeGroupDesktop);
        hide(firmTypeGroupMobile);
        hide(experienceGroupDesktop);
        hide(experienceGroupMobile);
        show(salaryGroupDesktop);
        show(salaryGroupMobile);

        document.querySelectorAll('label[for="salaryFilterDesktop"], label[for="salaryFilterMobile"]').forEach(label => {
            label.textContent = 'Stipend';
        });
    } else if (currentTable === 'Articleship Jobs') {
        hide(companyTypeGroupDesktop);
        hide(companyTypeGroupMobile);
        hide(industryTypeGroupDesktop);
        hide(industryTypeGroupMobile);
        show(firmTypeGroupDesktop);
        show(firmTypeGroupMobile);
        hide(experienceGroupDesktop);
        hide(experienceGroupMobile);
        show(salaryGroupDesktop);
        show(salaryGroupMobile);

        document.querySelectorAll('label[for="salaryFilterDesktop"], label[for="salaryFilterMobile"]').forEach(label => {
            label.textContent = 'Stipend';
        });
    } else if (currentTable === 'Fresher Jobs') {
        show(companyTypeGroupDesktop);
        show(companyTypeGroupMobile);
        show(industryTypeGroupDesktop);
        show(industryTypeGroupMobile);
        hide(firmTypeGroupDesktop);
        hide(firmTypeGroupMobile);
        hide(experienceGroupDesktop);
        hide(experienceGroupMobile);
        show(salaryGroupDesktop);
        show(salaryGroupMobile);

        document.querySelectorAll('label[for="salaryFilterDesktop"], label[for="salaryFilterMobile"]').forEach(label => {
            label.textContent = 'Salary';
        });
    } else if (currentTable === 'Semi Qualified Jobs') {
        show(companyTypeGroupDesktop);
        show(companyTypeGroupMobile);
        show(industryTypeGroupDesktop);
        show(industryTypeGroupMobile);
        hide(firmTypeGroupDesktop);
        hide(firmTypeGroupMobile);
        show(experienceGroupDesktop);
        show(experienceGroupMobile);
        show(salaryGroupDesktop);
        show(salaryGroupMobile);

        document.querySelectorAll('label[for="salaryFilterDesktop"], label[for="salaryFilterMobile"]').forEach(label => {
            label.textContent = 'Salary';
        });
    }
}

function renderJobCard(job) {
    const jobCard = document.createElement('article');
    jobCard.className = 'job-card';
    jobCard.dataset.jobId = job.id;

    const companyName = (job.Company || '').trim();
    const companyInitial = companyName ? companyName.charAt(0).toUpperCase() : '?';
    const postedDate = job.Created_At ? getDaysAgo(job.Created_At) : 'N/A';
    const isApplied = appliedJobIds.has(job.id);
    const isPopular = (job.application_count || 0) > 50;
    const buttonText = isApplied ? 'Applied' : 'View Details';
    const buttonClass = isApplied ? 'applied' : '';
    const applyLink = getApplicationLink(job['Application ID']);
    const applyButtonText = 'Apply Now';

    // Premium tags and metadata values
    const primaryDomain = job['Primary Domain'] || job.Category || 'N/A';
    const secondaryDomain = (currentTable === 'Fresher Jobs' || currentTable === 'Semi Qualified Jobs') ? job['Secondary Domain'] : null;
    const companyType = job['Company Type'];
    const firmType = job['Firm Type'];
    const industryType = job['Industry Type'];

    // Compensation display parsing
    let compText = '';
    if (currentTable === 'Fresher Jobs') {
        compText = job['CTC Range'] || (job.Salary ? `₹${job.Salary}` : '');
    } else if (currentTable === 'Articleship Jobs' || currentTable === 'Industrial Training Job Portal') {
        compText = job['Stipend Range'] || (job.Salary ? `₹${job.Salary}` : '');
    } else {
        compText = job.Salary ? `₹${job.Salary}` : '';
    }

    // Small tag array pills display
    let tagPillsHtml = '';
    let tagsList = [];
    if (currentTable === 'Fresher Jobs' || currentTable === 'Semi Qualified Jobs') {
        tagsList = Array.isArray(job.Tags) ? job.Tags : [];
    } else if (currentTable === 'Articleship Jobs') {
        tagsList = Array.isArray(job['Exposure Tags']) ? job['Exposure Tags'] : [];
    }

    if (tagsList && tagsList.length > 0) {
        tagPillsHtml = `<div class="job-card-tags-row" style="display: flex; gap: 0.35rem; flex-wrap: wrap; margin-top: 0.5rem; width: 100%;">
            ${tagsList.slice(0, 4).map(t => `<span class="pill-badge" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; background-color: #f1f5f9; color: #475569; border-radius: 9999px; border: 1px solid #e2e8f0; font-weight: 500;">${t}</span>`).join('')}
            ${tagsList.length > 4 ? `<span class="pill-badge" style="font-size: 0.75rem; padding: 0.2rem 0.5rem; background-color: #f1f5f9; color: #475569; border-radius: 9999px; border: 1px solid #e2e8f0; font-weight: 500;">+${tagsList.length - 4} more</span>` : ''}
        </div>`;
    }

    jobCard.innerHTML = `
        <div class="job-card-logo">${companyInitial}</div>
        <div class="job-card-details">
            <div class="job-card-header">
                <h3 class="job-card-company">${job.Company || 'N/A'}</h3>
                <p class="job-card-posted">Posted ${postedDate}</p>
            </div>
            <div class="job-card-tags" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;">
                ${isPopular ? `<span class="job-tag" style="background-color: #fef3c7; color: #d97706; border: 1px solid #fcd34d;">Popular</span>` : ''}
                <span class="job-tag">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    ${job.Location || 'N/A'}
                </span>
                ${compText ? `<span class="job-tag"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>${compText}</span>` : ''}
                <span class="job-tag primary-domain-tag" style="background-color: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; font-weight: 600;">${primaryDomain}</span>
                ${secondaryDomain ? `<span class="job-tag secondary-domain-tag" style="background-color: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; font-weight: 500;">${secondaryDomain}</span>` : ''}
                ${companyType ? `<span class="job-tag company-type-tag" style="background-color: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;"><i class="fas fa-building" style="margin-right: 4px; color: #4b5563;"></i>${companyType}</span>` : ''}
                ${firmType ? `<span class="job-tag firm-type-tag" style="background-color: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;"><i class="fas fa-briefcase" style="margin-right: 4px; color: #4b5563;"></i>${firmType}</span>` : ''}
                ${industryType ? `<span class="job-tag industry-type-tag" style="background-color: #f3f4f6; color: #374151; border: 1px solid #e5e7eb;"><i class="fas fa-industry" style="margin-right: 4px; color: #4b5563;"></i>${industryType}</span>` : ''}
            </div>
            ${tagPillsHtml}
        </div>
        <div class="job-card-actions">
             <a href="${applyLink}" target="_blank" class="apply-now-card-btn primary ${buttonClass}" style="background: #3B82F6; color: white; text-decoration: none; padding: 0.5rem 1rem; display: inline-flex; align-items: center; justify-content: center; min-height: 2.5rem;">${applyButtonText}</a>
             <button class="apply-now-card-btn secondary" style="padding: 0.5rem 1rem; min-height: 2.5rem;">View Details</button>
        </div>`;

    // Add click handler for Apply Now button
    const applyBtn = jobCard.querySelector('.apply-now-card-btn.primary');
    if (applyBtn) {
        applyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Mark as applied after a short delay (allows link to open first)
            setTimeout(() => markJobAsApplied(job), 500);
        });
    }

    // Add click handler to entire card for View Details
    jobCard.addEventListener('click', (e) => {
        if (!e.target.closest('.apply-now-card-btn.primary')) {
            showModal(job);
        }
    });

    return jobCard;
}

// Simple markdown renderer for job descriptions
function renderMarkdown(text) {
    if (!text) return 'No description available.';

    let html = text
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/__(.+?)__/g, '<strong>$1</strong>')
        // Italic
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        // Line breaks
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // Wrap in paragraph
    html = '<p>' + html + '</p>';

    // Fix multiple paragraph tags
    html = html.replace(/<p><\/p>/g, '');

    return html;
}

// Generate application links with copy buttons (handles comma-separated values)
function generateApplicationLinks(applicationId) {
    if (!applicationId) {
        return '<p class="modal-description">No Application ID Available</p>';
    }

    // Split by comma and trim whitespace
    const links = applicationId.split(',').map(link => link.trim()).filter(link => link);

    if (links.length === 0) {
        return '<p class="modal-description">No Application ID Available</p>';
    }

    // Generate HTML for each link with copy button
    return links.map((link, index) => `
        <div style="display: flex; align-items: center; gap: 0.75rem; background: #f8fafc; padding: 0.4rem; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: ${index < links.length - 1 ? '0.75rem' : '0'};">
            <p class="modal-description" style="flex: 1; margin: 0; word-break: break-all; font-size: 0.95rem;">${link}</p>
            <button class="modal-copy-btn" data-copy-text="${link.replace(/"/g, '&quot;')}" style="background: #2563eb; color: white; border: none; border-radius: 6px; padding: 0.6rem 0.8rem; cursor: pointer; transition: all 0.2s; flex-shrink: 0; min-width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;" title="Copy to clipboard">
                <i class="fas fa-copy" style="font-size: 1rem;"></i>
            </button>
        </div>
    `).join('');
}

// Share job using Web Share API or fallback to copy link
function shareJob(job, btnElement) {
    const jobType = currentTable === 'Industrial Training Job Portal' ? 'industrial' :
        currentTable === 'Fresher Jobs' ? 'fresher' :
            currentTable === 'Semi Qualified Jobs' ? 'semi' : 'articleship';
    const jobUrl = `${window.location.origin}/job.html?id=${job.id}&type=${jobType}`;

    const shareText = `Check out this job at *${job.Company}* for *${job.Location}*
URL - ${jobUrl}

Do turn on notifications to stay updated with all such opportunites and ensure joining the whatsapp group below
https://chat.whatsapp.com/D491zsqKmv25S2YLloSUBR`;

    const shareData = {
        title: `Job at ${job.Company}`,
        text: shareText,
        url: jobUrl
    };

    // Simple mobile detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile && navigator.share) {
        // Native share dialog (works well on mobile)
        navigator.share(shareData).catch(err => console.log('Share cancelled'));
    } else {
        // Desktop: Copy to clipboard (avoids "lame" native dialog)
        navigator.clipboard.writeText(shareText).then(() => {
            if (btnElement) {
                const originalHtml = btnElement.innerHTML;
                const originalStyles = btnElement.style.cssText;

                // Visual feedback
                btnElement.innerHTML = '<i class="fas fa-check"></i> Copied!';
                btnElement.style.background = '#22c55e';
                btnElement.style.color = '#ffffff';

                setTimeout(() => {
                    btnElement.innerHTML = originalHtml;
                    btnElement.style.cssText = originalStyles;
                }, 2000);
            } else {
                alert('Job details copied to clipboard!');
            }
        }).catch(err => {
            alert('Failed to copy details.');
        });
    }
}

// Check if job has custom connect link
function checkConnectLink(job) {
    if (job.connect_link && job.connect_link.trim() !== '') return job.connect_link;
    if (job['connect_link'] && job['connect_link'].trim() !== '') return job['connect_link'];
    return null;
}

async function recordApplication(job, btnElement) {
    if (!currentSession) return true; // Allow default navigation if not logged in

    const originalText = btnElement.innerHTML;
    btnElement.innerHTML = '<div class="loader-spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>';

    try {
        const { error } = await supabaseClient
            .from('job_applications')
            .insert({
                user_id: currentSession.user.id,
                job_id: job.id,
                job_table: currentTable,
                applied_at: new Date().toISOString()
            });

        if (error) {
            if (error.code === '23505') { // Unique violation (already applied)
                // Just proceed
            } else {
                console.error('Error recording application:', error);
            }
        } else {
            // Success
            appliedJobIds.add(job.id);
            // Update local count if possible for immediate feedback (optional)
        }

        btnElement.classList.add('applied');
        btnElement.innerHTML = originalText;
        return true;
    } catch (e) {
        console.error('Application exception:', e);
        btnElement.innerHTML = originalText;
        return true; // Still allow navigation
    }
}

function showModal(job) {
    const companyName = (job.Company || '').trim();
    const companyInitial = companyName ? companyName.charAt(0).toUpperCase() : '?';
    const postedDate = job.Created_At ? getDaysAgo(job.Created_At) : 'N/A';
    const applyCount = job.application_count || 0;
    const applyLink = getApplicationLink(job['Application ID'], job.Company);
    const isMailto = applyLink.startsWith('mailto:');
    const isApplied = appliedJobIds.has(job.id);
    const buttonClass = isApplied ? 'applied' : '';

    // Connect to Peers Logic
    let connectLink = checkConnectLink(job);
    if (!connectLink) {
        const suffixPattern = /\b(pvt|private|ltd|limited|llp|llc|co|company|inc|incorporated|corp|corporation|org|organization|foundation|group|holdings|enterprises|solutions|services|consulting|consultancy|associates|partners|international|india|technologies?|tech)\b\.?/gi;
        let cleanedCompany = companyName.replace(suffixPattern, '').replace(/[.,&\-]+/g, ' ').replace(/\s+/g, ' ').trim();
        const companyWords = cleanedCompany.split(/\s+/).filter(w => w.length > 1).slice(0, 3).join(' ') || companyName.split(/\s+/).slice(0, 2).join(' ');
        const encodedCompany = encodeURIComponent(`"${companyWords}"`);
        if (currentTable === 'Articleship Jobs') {
            connectLink = `https://www.linkedin.com/search/results/people/?keywords=${encodedCompany}%20AND%20%22CA%20Finalist%22&origin=FACETED_SEARCH&schoolFilter=%5B%221968486%22%2C%22272365%22%5D&sid=Chv`;
        } else if (currentTable === 'Fresher Jobs' || currentTable === 'Semi Qualified Jobs') {
            connectLink = `https://www.linkedin.com/search/results/people/?keywords=${encodedCompany}%20AND%20(%22CA%22%20OR%20%22Chartered%20Accountant%22)&origin=GLOBAL_SEARCH_HEADER&schoolFilter=%5B%221968486%22%2C%22272365%22%5D&sid=%3Avx`;
        } else {
            connectLink = `https://www.linkedin.com/search/results/people/?keywords=${encodedCompany}%20AND%20(%22CA%20Finalist%22%20OR%20%22Industrial%20Trainee%22%20OR%20%22Industrial%20Training%22)&origin=FACETED_SEARCH&schoolFilter=%5B%221968486%22%2C%22272365%22%5D&sid=~vG`;
        }
    }

    // Build the bottom action link row with View Original Post if available
    let linksHtml = '';
    const connectButtonHtml = `
        <a href="${connectLink}" id="modalConnectPeersBtn" target="_blank" class="btn btn-secondary" style="flex: 1; min-width: calc(33% - 0.5rem); padding: 0.1rem 1rem; min-height: 2rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
            <i class="fab fa-linkedin"></i>
            Connect to Peers
        </a>`;
    const shareButtonHtml = `
        <button id="modalShareBtnInline" class="btn btn-secondary" style="flex: 1; min-width: calc(33% - 0.5rem); padding: 0.1rem 1rem; min-height: 2rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
            <i class="fas fa-share-alt"></i>
            Share this job
        </button>`;
    
    if (job.posts_link) {
        const originalPostHtml = `
            <a href="${job.posts_link}" id="modalOriginalPostBtn" target="_blank" class="btn btn-secondary" style="flex: 1; min-width: calc(33% - 0.5rem); padding: 0.1rem 1rem; min-height: 2rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem; border-color: #0a66c2; color: #0a66c2;">
                <i class="fab fa-linkedin"></i>
                Original Post
            </a>`;
        linksHtml = `
            <div style="display: flex; gap: 0.5rem; margin-top: 0.75rem; flex-wrap: wrap;">
                ${connectButtonHtml}
                ${originalPostHtml}
                ${shareButtonHtml}
            </div>`;
    } else {
        linksHtml = `
            <div style="display: flex; gap: 0.75rem; margin-top: 0.75rem; flex-wrap: wrap;">
                ${connectButtonHtml}
                ${shareButtonHtml}
            </div>`;
    }

    let actionsHtml = '';
    if (isMailto) {
        const simpleApplyText = 'Simple Apply';
        const aiApplyText = 'AI Powered Apply';
        actionsHtml = `
            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                <button id="modalSimpleApplyBtn" class="btn btn-secondary ${buttonClass}" style="flex: 1; min-width: 100%; padding: 0.5rem 1rem; min-height: 3rem;">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                    <span>${simpleApplyText}</span>
                </button>
                <button id="modalAiApplyBtn" class="btn btn-primary ${buttonClass}" style="flex: 1; min-width: 100%; padding: 0.5rem 1rem; min-height: 3rem;">
                    <svg fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                    <span class="btn-text">${aiApplyText}</span>
                    <i class="fas fa-spinner fa-spin"></i>
                </button>
            </div>`;
        actionsHtml += linksHtml;
    } else {
        const applyText = 'Apply Now';
        actionsHtml = `
            <a href="${applyLink}" id="modalExternalApplyBtn" class="btn btn-primary ${buttonClass}" target="_blank" style="padding: 0.5rem 1rem; min-height: 3rem; display: flex; align-items: center; justify-content: center;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                ${applyText}
            </a>`;
        actionsHtml += linksHtml;
    }

    // Compensation display range parsing for modal
    const compRange = currentTable === 'Fresher Jobs' ? job['CTC Range'] : (currentTable === 'Articleship Jobs' || currentTable === 'Industrial Training Job Portal') ? job['Stipend Range'] : null;
    const compLabel = (currentTable === 'Semi Qualified Jobs' || currentTable === 'Fresher Jobs') ? 'Salary' : 'Stipend';
    const compDisplay = compRange || (job.Salary ? `₹${job.Salary}` : null);

    const primaryDomain = job['Primary Domain'] || job.Category || 'N/A';

    // Detailed categorization tag pills
    let tagsSectionsHtml = '';
    const renderPillSection = (title, tags, bgColor, textColor, borderColor) => {
        if (!Array.isArray(tags) || tags.length === 0) return '';
        return `
            <div class="modal-section" style="margin-top: 1rem;">
                <h3 style="font-size: 1rem; font-weight: 600; color: #374151; margin-bottom: 0.5rem;">${title}</h3>
                <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${tags.map(t => `<span class="modal-pill" style="font-size: 0.85rem; padding: 0.3rem 0.75rem; background-color: ${bgColor}; color: ${textColor}; border: 1px solid ${borderColor}; border-radius: 9999px; font-weight: 500;">${t}</span>`).join('')}
                </div>
            </div>`;
    };

    if (currentTable === "Fresher Jobs" || currentTable === "Semi Qualified Jobs") {
        tagsSectionsHtml += renderPillSection("Key Skills & Tags", job.Tags, "#f1f5f9", "#334155", "#e2e8f0");
    } else if (currentTable === "Industrial Training Job Portal") {
        tagsSectionsHtml += renderPillSection("Functional Competencies", job["Functional Tags"], "#eff6ff", "#1e40af", "#bfdbfe");
        tagsSectionsHtml += renderPillSection("Tech Stack & Tools", job["Technology Tags"], "#f5f3ff", "#5b21b6", "#ddd6fe");
    } else if (currentTable === "Articleship Jobs") {
        tagsSectionsHtml += renderPillSection("Areas of Exposure", job["Exposure Tags"], "#ecfdf5", "#065f46", "#a7f3d0");
        tagsSectionsHtml += renderPillSection("Client Sector Exposure", job["Client Exposure Tags"], "#fff7ed", "#9a3412", "#ffedd5");
    }

    dom.modalBody.innerHTML = `
        <div class="modal-header">
            <div class="modal-logo">${companyInitial}</div>
            <div class="modal-title-group">
                <h2>${job.Company}</h2>
                <p>${job.Location}</p>
            </div>
        </div>
        <div class="modal-meta-tags" style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
            ${compDisplay ? `<span class="job-tag">${compLabel}: ${compDisplay}</span>` : ''}
            <span class="job-tag">Posted: ${postedDate}</span>
            <span class="job-tag" style="background-color: #eff6ff; color: #1d4ed8; border-color: #bfdbfe; font-weight: 600;">Category: ${primaryDomain}</span>
            ${job['Secondary Domain'] ? `<span class="job-tag" style="background-color: #e0f2fe; color: #0369a1; border-color: #bae6fd;">Secondary: ${job['Secondary Domain']}</span>` : ''}
            ${job['Company Type'] ? `<span class="job-tag"><i class="fas fa-building" style="margin-right: 4px;"></i>${job['Company Type']}</span>` : ''}
            ${job['Firm Type'] ? `<span class="job-tag"><i class="fas fa-briefcase" style="margin-right: 4px;"></i>${job['Firm Type']}</span>` : ''}
            ${job['Industry Type'] ? `<span class="job-tag"><i class="fas fa-industry" style="margin-right: 4px;"></i>${job['Industry Type']}</span>` : ''}
        </div>
        <div class="modal-actions" style="display: flex; flex-direction: column; gap: 0;">${actionsHtml}</div>
        ${tagsSectionsHtml}
        <div class="modal-section">
            <h3><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>Apply here!</h3>
            ${generateApplicationLinks(job['Application ID'])}
        </div>
        <div class="modal-section">
            <h3><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Job Description</h3>
            <div class="modal-description">${renderMarkdown(job.Description)}</div>
        </div>
        <div class="modal-footer" style="text-align: center; padding: 1rem; border-top: 1px solid #e5e7eb; margin-top: 5rem;">
            <p style="color: #6b7280; font-size: 0.9rem;">
                Found an issue with job posting? 
                <a href="/contact.html" style="color: #2563eb; text-decoration: none; font-weight: 500;">Report it</a>
            </p>
        </div>`;

    dom.modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (isMailto) {
        const modalSimpleApplyBtn = document.getElementById('modalSimpleApplyBtn');
        const modalAiApplyBtn = document.getElementById('modalAiApplyBtn');

        if (modalSimpleApplyBtn) {
            modalSimpleApplyBtn.addEventListener('click', async (e) => {
                e.preventDefault(); // Prevent default mailto behavior initially
                const shouldProceed = await recordApplication(job, e.currentTarget);
                if (shouldProceed) {
                    window.open(applyLink, '_blank'); // Open mailto link
                }
            });
        }
        if (modalAiApplyBtn) {
            modalAiApplyBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                if (!currentSession) {
                    window.location.href = '/login.html';
                    return;
                }
                if (isEnrolledSync(currentTable)) {
                    await handleAiApplyClick(job, e.currentTarget, currentTable, applyLink);
                } else {
                    showEnrollmentRequiredPopup();
                }
            });
        }
    } else {
        const modalExternalApplyBtn = document.getElementById('modalExternalApplyBtn');
        if (modalExternalApplyBtn) {
            modalExternalApplyBtn.addEventListener('click', async (e) => {
                e.preventDefault(); // Prevent default navigation initially
                const shouldProceed = await recordApplication(job, e.currentTarget);
                if (shouldProceed) {
                    window.open(applyLink, '_blank'); // Open external link
                }
            });
        }
    }

    const modalConnectPeersBtn = document.getElementById('modalConnectPeersBtn');
    if (modalConnectPeersBtn) {
        modalConnectPeersBtn.addEventListener('click', (e) => {
            if (!currentSession) {
                e.preventDefault();
                window.location.href = '/login.html';
                return;
            }
            console.log('[Enrollment] cache:', enrollmentStatusCache, 'table:', currentTable);
            if (!isEnrolledSync(currentTable)) {
                e.preventDefault();
                showEnrollmentRequiredPopup();
            }
            // enrolled: let natural <a href target="_blank"> open the link
        });
    }

    const modalOriginalPostBtn = document.getElementById('modalOriginalPostBtn');
    if (modalOriginalPostBtn) {
        modalOriginalPostBtn.addEventListener('click', (e) => {
            if (!currentSession) {
                e.preventDefault();
                window.location.href = '/login.html';
                return;
            }
            console.log('[Enrollment] cache:', enrollmentStatusCache, 'table:', currentTable);
            if (!isEnrolledSync(currentTable)) {
                e.preventDefault();
                showEnrollmentRequiredPopup();
            }
            // enrolled: let natural <a href target="_blank"> open the link
        });
    }

    // Attach copy button event listeners (multiple buttons for comma-separated links)
    const copyBtns = document.querySelectorAll('.modal-copy-btn');
    copyBtns.forEach((copyBtn, index) => {
        copyBtn.addEventListener('click', () => {
            const text = copyBtn.getAttribute('data-copy-text');
            // Pass button element directly for visual feedback
            const icon = copyBtn.querySelector('i');
            const originalClass = icon.className;

            navigator.clipboard.writeText(text).then(() => {
                icon.className = 'fas fa-check';
                copyBtn.style.background = '#22c55e';
                setTimeout(() => {
                    icon.className = originalClass;
                    copyBtn.style.background = '#2563eb';
                }, 2000);
            }).catch(err => {
                console.error('Copy failed:', err);
                alert('Failed to copy. Please copy manually.');
            });
        });
    });

    // Attach share button event listener (inline button in actions)
    const shareBtnInline = document.getElementById('modalShareBtnInline');
    if (shareBtnInline) {
        shareBtnInline.addEventListener('click', (e) => {
            e.stopPropagation();
            shareJob(job, e.currentTarget);
        });
    }
}

function closeModal() {
    dom.modalOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function updateFilterCache() {
    cachedSortedLocations = allLocations.length > 0
        ? [...allLocations].sort((a, b) => b.length - a.length)
        : [];


    const currentCategories = allCategories[currentTable] || [];
    cachedSortedCategories = currentCategories.length > 0
        ? [...currentCategories].sort((a, b) => b.length - a.length)
        : [];

}

async function fetchFilterOptions() {
    try {
        const [locationsResponse, categoriesResponse] = await Promise.all([
            fetch('/locations.json'),
            fetch('/categories.json')
        ]);

        if (!locationsResponse.ok || !categoriesResponse.ok) {
            throw new Error('Failed to load filter data');
        }

        allLocations = await locationsResponse.json();
        allCategories = await categoriesResponse.json();
        updateFilterCache();

    } catch (error) {
        console.error("Error fetching filter options from JSON:", error);
        allLocations = [];
        allCategories = {};
        updateFilterCache();
    }
}

async function fetchJobs() {
    if (isFetching) return;
    isFetching = true;

    // Only show the main full-screen loader if it's the first page load
    if (page === 0 && dom.loader) {
        dom.loader.style.display = 'block';
    }

    // Show spinner in sentinel if we are loading more
    const sentinelSpinner = document.querySelector('.sentinel-spinner');
    if (page > 0 && sentinelSpinner) {
        sentinelSpinner.style.display = 'block';
    }

    // if (dom.loadMoreButton) dom.loadMoreButton.style.display = 'none'; // Removed

    try {
        let selectColumns = 'id, Company, Location, Salary, Description, Created_At, Category, "Application ID", application_count, posts_link, "Primary Domain"';
        if (currentTable === "Fresher Jobs") {
            selectColumns += ', Experience, yoe, "Secondary Domain", Tags, "Company Type", "Industry Type", "CTC Range"';
        } else if (currentTable === "Semi Qualified Jobs") {
            selectColumns += ', Experience, "Secondary Domain", Tags, "Company Type", "Industry Type"';
        } else if (currentTable === "Industrial Training Job Portal") {
            selectColumns += ', "Company Type", "Industry Type", "Stipend Range", "Functional Tags", "Technology Tags"';
        } else if (currentTable === "Articleship Jobs") {
            selectColumns += ', "Exposure Tags", "Firm Type", "Client Exposure Tags", "Stipend Range"';
        }

        let query = supabaseClient.from(currentTable).select(selectColumns);

        // Optimize keyword query building - pre-process terms once
        if (state.keywords.length > 0) {
            const keywordOrs = [];
            for (let i = 0; i < state.keywords.length; i++) {
                const keyword = state.keywords[i].trim();
                // wildcard matching for spaces to find "PhonePe" from "Phone Pe"
                const flexibleTerm = keyword.replace(/\s+/g, '%');
                
                const cols = [
                    `Company.ilike."%${flexibleTerm}%"`,
                    `Description.ilike."%${flexibleTerm}%"`,
                    `Category.ilike."%${flexibleTerm}%"`,
                    `Location.ilike."%${flexibleTerm}%"`,
                    `"Primary Domain".ilike."%${flexibleTerm}%"`
                ];
                
                if (currentTable === "Fresher Jobs") {
                    cols.push(`"Secondary Domain".ilike."%${flexibleTerm}%"`);
                    cols.push(`Tags.cs.{"${keyword}"}`);
                } else if (currentTable === "Semi Qualified Jobs") {
                    cols.push(`"Secondary Domain".ilike."%${flexibleTerm}%"`);
                    cols.push(`Tags.cs.{"${keyword}"}`);
                } else if (currentTable === "Industrial Training Job Portal") {
                    cols.push(`"Functional Tags".cs.{"${keyword}"}`);
                    cols.push(`"Technology Tags".cs.{"${keyword}"}`);
                } else if (currentTable === "Articleship Jobs") {
                    cols.push(`"Exposure Tags".cs.{"${keyword}"}`);
                    cols.push(`"Client Exposure Tags".cs.{"${keyword}"}`);
                }
                
                keywordOrs.push(...cols);
            }
            query = query.or(keywordOrs.join(','));
        }

        if (state.locations.length > 0) {
            const locationOr = [];
            for (let i = 0; i < state.locations.length; i++) {
                locationOr.push(`Location.ilike."%${state.locations[i]}%"`);
            }
            query = query.or(locationOr.join(','));
        }

        if (state.categories.length > 0) {
            const categoryOr = [];
            for (let i = 0; i < state.categories.length; i++) {
                const cat = state.categories[i];
                const hasSecondary = (currentTable === "Fresher Jobs" || currentTable === "Semi Qualified Jobs");
                
                categoryOr.push(`"Primary Domain".eq."${cat}"`);
                if (hasSecondary) {
                    categoryOr.push(`"Secondary Domain".eq."${cat}"`);
                }
                categoryOr.push(`Category.ilike."%${cat}%"`);
            }
            query = query.or(categoryOr.join(','));
        }

        if (state.salary) {
            if (state.salary.endsWith('+')) {
                const minValue = parseInt(state.salary);
                if (!isNaN(minValue)) query = query.gte('Salary', minValue);
            } else if (state.salary.includes('-')) {
                const [min, max] = state.salary.split('-').map(Number);
                if (!isNaN(min) && !isNaN(max)) query = query.gte('Salary', min).lte('Salary', max);
            }
        }

        if (currentTable === 'Fresher Jobs') {
            query = query.or('yoe.is.null,yoe.lte.1');
        }

        // Experience filter:
        // - Semi Qualified: optional filter via UI
        // - Fresher: locked to Freshers
        // - Experienced CA: locked to Experienced
        if (currentTable === "Fresher Jobs") {
            const lockedValue = isExperiencedFresherPortal() ? 'Experienced' : 'Freshers';
            query = query.eq('Experience', lockedValue);
        } else if (state.experience && currentTable === "Semi Qualified Jobs") {
            query = query.eq('Experience', state.experience);
        }

        // Apply new Company Type, Industry Type and Firm Type filters
        if (state.companyType && (currentTable === "Fresher Jobs" || currentTable === "Semi Qualified Jobs")) {
            query = query.eq('Company Type', state.companyType);
        }
        if (state.industryType && (currentTable === "Fresher Jobs" || currentTable === "Semi Qualified Jobs" || currentTable === "Industrial Training Job Portal")) {
            query = query.eq('Industry Type', state.industryType);
        }
        if (state.firmType && currentTable === "Articleship Jobs") {
            query = query.eq('Firm Type', state.firmType);
        }

        if (state.applicationStatus === 'not_applied' && currentSession && appliedJobIds.size > 0) {
            // Supabase requires parenthesized tuple format for 'in' operator: (1,2,3)
            const appliedIds = Array.from(appliedJobIds);
            const tupleString = `(${appliedIds.join(',')})`;
            query = query.not('id', 'in', tupleString);
        }

        let sortCol = 'Created_At';
        let isAsc = false;

        if (state.sortBy === 'salary_asc') { sortCol = 'Salary'; isAsc = true; }
        else if (state.sortBy === 'salary_desc') { sortCol = 'Salary'; isAsc = false; }
        // For 'popular' (default) and 'newest', we fetch by Created_At DESC from DB to get latest batch

        query = query.order(sortCol, {
            ascending: isAsc,
            nullsFirst: false
        }).order('id', { ascending: false });

        query = query.range(page * limit, (page + 1) * limit - 1);
        let { data, error } = await query;

        if (!error && data && state.sortBy === 'popular') {
            data.sort((a, b) => (b.application_count || 0) - (a.application_count || 0));
        }

        if (error) throw error;

        if (data && data.length > 0) {
            // Batch DOM operations using DocumentFragment for better performance
            const fragment = document.createDocumentFragment();
            for (let i = 0; i < data.length; i++) {
                fragment.appendChild(renderJobCard(data[i]));
            }
            if (dom.jobsContainer) {
                dom.jobsContainer.appendChild(fragment);
            }

            page++;
            hasMoreData = data.length === limit;
            // if (hasMoreData && dom.loadMoreButton) {
            //     dom.loadMoreButton.style.display = 'block';
            // }
        } else {
            hasMoreData = false;
            if (page === 0 && dom.jobsContainer) {
                dom.jobsContainer.innerHTML = '<p class="no-jobs-found">No jobs found matching your criteria.</p>';
            }
        }
    } catch (error) {
        if (dom.jobsContainer) {
            const errMsg = (error.message || '').toLowerCase();
            const isNetworkError = errMsg.includes('failed to fetch') ||
                errMsg.includes('network') ||
                errMsg.includes('fetch');

            if (isNetworkError) {
                dom.jobsContainer.innerHTML = `
                    <div style="text-align: center; padding: 3rem 1rem; color: #ef4444;">
                        <i class="fas fa-tools" style="font-size: 3rem; margin-bottom: 1rem; color: #f59e0b;"></i>
                        <h3 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; color: #1f2937;">Site Under Maintenance</h3>
                        <p style="color: #6b7280;">We will be back online in 30 minutes.</p>
                    </div>`;
            } else {
                dom.jobsContainer.innerHTML = `<p class="no-jobs-found" style="color:red;">Failed to load jobs: ${error.message}</p>`;
            }
        }
    } finally {
        isFetching = false;
        if (dom.loader) dom.loader.style.display = 'none';

        // Hide sentinel spinner
        if (sentinelSpinner) sentinelSpinner.style.display = 'none';

        // Defer UI updates to avoid blocking render
        const updateUI = () => {
            renderActiveFilterPills();
            syncFiltersUI();
        };
        if (typeof requestAnimationFrame !== 'undefined') {
            requestAnimationFrame(updateUI);
        } else {
            // Fallback for very old browsers
            setTimeout(updateUI, 0);
        }
    }
}

function resetAndFetch() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        page = 0;
        if (dom.jobsContainer) dom.jobsContainer.innerHTML = '';
        hasMoreData = true;
        fetchJobs();
    }, 350);
}

function updateState(newState) {
    Object.assign(state, newState);
    resetAndFetch();
}

function populateSalaryFilter() {
    const salaryFilters = [dom.salaryFilterDesktop, dom.salaryFilterMobile];
    let options = [];
    if (currentTable === "Industrial Training Job Portal") options = [
        { value: '', text: 'Any Stipend' },
        { value: '10000-20000', text: '₹10k - ₹20k' },
        { value: '20000-40000', text: '₹20k - ₹40k' },
        { value: '40000+', text: '₹40k+' }
    ];
    else if (currentTable === "Articleship Jobs") options = [
        { value: '', text: 'Any Stipend' },
        { value: '0-5000', text: 'Below ₹5,000' },
        { value: '5000-10000', text: '₹5,000-10,000' },
        { value: '10000-15000', text: '₹10,000-15,000' },
        { value: '15000-20000', text: '₹15,000-20,000' },
        { value: '20000+', text: '₹20,000+' }
    ];
    else if (currentTable === "Semi Qualified Jobs") options = [
        { value: '', text: 'Any Salary' },
        { value: '0-25000', text: 'Below ₹25k' },
        { value: '25000-35000', text: '₹25k - ₹35k' },
        { value: '35000-50000', text: '₹35k - ₹50k' },
        { value: '50000+', text: 'Above ₹50k' }
    ];
    else if (currentTable === "Fresher Jobs") options = [
        { value: '', text: 'Any Salary' },
        { value: '0-800000', text: 'Below ₹8 LPA' },
        { value: '800000-1200000', text: '₹8-12 LPA' },
        { value: '1200000-1500000', text: '₹12-15 LPA' },
        { value: '1500000-2000000', text: '₹15-20 LPA' },
        { value: '2000000-3000000', text: '₹20-30 LPA' },
        { value: '3000000+', text: '₹30+ LPA' }
    ];

    salaryFilters.forEach(select => {
        if (!select) return;
        select.innerHTML = '';
        options.forEach(opt => { let o = document.createElement('option'); o.value = opt.value; o.textContent = opt.text; select.appendChild(o); });
        select.value = state.salary;
    });
}

function renderPills(container, items, type) {
    if (!container) return;
    container.innerHTML = '';
    items.forEach(item => {
        const pill = document.createElement('div');
        pill.className = 'selected-pill';
        pill.textContent = item;
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => {
            state[type] = state[type].filter(i => i !== item);
            renderPills(container, state[type], type);
            if (container.closest('.filter-sidebar')) {
                resetAndFetch();
            }
        };
        pill.appendChild(removeBtn);
        container.appendChild(pill);
    });
}

function renderActiveFilterPills() {
    dom.activeFiltersDisplay.innerHTML = '';
    const createPill = (item, type) => {
        const pill = document.createElement('div');
        pill.className = 'active-filter-pill';
        pill.textContent = item;
        pill.dataset.type = type;
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => {
            state[type] = state[type].filter(i => i !== item);
            syncAndFetch();
        };
        pill.appendChild(removeBtn);
        dom.activeFiltersDisplay.appendChild(pill);
    };

    state.keywords.forEach(item => createPill(item, 'keywords'));
    state.locations.forEach(item => createPill(item, 'locations'));
    state.categories.forEach(item => createPill(item, 'categories'));
}

function syncFiltersUI() {
    renderPills(dom.locationPillsDesktop, state.locations, 'locations');
    renderPills(dom.locationPillsMobile, state.locations, 'locations');
    renderPills(dom.categoryPillsDesktop, state.categories, 'categories');
    renderPills(dom.categoryPillsMobile, state.categories, 'categories');

    if (dom.salaryFilterDesktop) dom.salaryFilterDesktop.value = state.salary;
    if (dom.salaryFilterMobile) dom.salaryFilterMobile.value = state.salary;
    if (dom.sortBySelect) dom.sortBySelect.value = state.sortBy;
    if (dom.sortBySelectMobile) dom.sortBySelectMobile.value = state.sortBy;

    if (dom.companyTypeFilterDesktop) dom.companyTypeFilterDesktop.value = state.companyType;
    if (dom.companyTypeFilterMobile) dom.companyTypeFilterMobile.value = state.companyType;
    if (dom.industryTypeFilterDesktop) dom.industryTypeFilterDesktop.value = state.industryType;
    if (dom.industryTypeFilterMobile) dom.industryTypeFilterMobile.value = state.industryType;
    if (dom.firmTypeFilterDesktop) dom.firmTypeFilterDesktop.value = state.firmType;
    if (dom.firmTypeFilterMobile) dom.firmTypeFilterMobile.value = state.firmType;

    document.querySelectorAll('.experience-filter-group .pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === state.experience);
    });
    document.querySelectorAll('.application-status-filter-group .pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === state.applicationStatus);
    });

    renderActiveFilterPills();
}

function syncAndFetch() {
    syncFiltersUI();
    resetAndFetch();
}

function setupMultiSelect(container) {
    if (!container) return;
    const input = container.querySelector('.multi-select-input');
    const optionsContainer = container.querySelector('.multi-select-options');
    const type = container.dataset.type;
    const pillsContainerId = `${type}Pills${container.closest('.filter-modal-content') ? 'Mobile' : 'Desktop'}`;
    const pillsContainer = document.getElementById(pillsContainerId);

    const renderOptions = (filter = '') => {
        const source = type === 'location' ? allLocations : (allCategories[currentTable] || []);
        const stateKey = type === 'location' ? 'locations' : 'categories';

        const filteredSource = source.filter(item =>
            item.toLowerCase().includes(filter.toLowerCase()) &&
            !state[stateKey].includes(item)
        );

        optionsContainer.innerHTML = '';

        filteredSource.forEach(item => {
            const optionEl = document.createElement('div');
            optionEl.className = 'multi-select-option';
            optionEl.textContent = item;
            optionEl.onclick = () => {
                if (!state[stateKey].includes(item)) {
                    state[stateKey].push(item);
                    renderPills(pillsContainer, state[stateKey], stateKey);
                    if (container.closest('.filter-sidebar')) resetAndFetch();
                }
                input.value = '';
                optionsContainer.classList.remove('show');
            };
            optionsContainer.appendChild(optionEl);
        });

        if (filter.trim()) {
            const customOption = document.createElement('div');
            customOption.className = 'multi-select-option';
            customOption.innerHTML = `Add filter for: <strong>"${filter}"</strong>`;
            customOption.onclick = () => {
                const term = filter.trim();
                if (term && !state[stateKey].includes(term)) {
                    state[stateKey].push(term);
                    renderPills(pillsContainer, state[stateKey], stateKey);
                    if (container.closest('.filter-sidebar')) resetAndFetch();
                }
                input.value = '';
                optionsContainer.classList.remove('show');
            };
            optionsContainer.appendChild(customOption);
        }

        optionsContainer.classList.toggle('show', optionsContainer.children.length > 0);
    };

    input.addEventListener('input', () => renderOptions(input.value));
    input.addEventListener('focus', () => renderOptions(input.value));

    // Add Enter key handler to apply filter (similar to keyword search)
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const filterValue = input.value.trim();
            if (filterValue) {
                const stateKey = type === 'location' ? 'locations' : 'categories';
                // Check if it's an exact match from the source list
                const source = type === 'location' ? allLocations : (allCategories[currentTable] || []);
                const exactMatch = source.find(item => item.toLowerCase() === filterValue.toLowerCase());

                if (exactMatch && !state[stateKey].includes(exactMatch)) {
                    // Use the exact match from source (preserves casing)
                    state[stateKey].push(exactMatch);
                } else if (!state[stateKey].includes(filterValue)) {
                    // Add as custom filter
                    state[stateKey].push(filterValue);
                }

                renderPills(pillsContainer, state[stateKey], stateKey);
                input.value = '';
                optionsContainer.classList.remove('show');

                // Trigger fetch if in sidebar (not modal)
                if (container.closest('.filter-sidebar')) {
                    resetAndFetch();
                }
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) optionsContainer.classList.remove('show');
    });
}

function processAndApplySearch(inputElement) {
    let value = inputElement.value.trim();
    if (!value) return;

    // Use cached sorted arrays and Sets for O(1) lookups
    if (!cachedSortedLocations || !cachedSortedCategories) {
        updateFilterCache();
    }

    const sortedLocations = cachedSortedLocations || [];
    const sortedCategories = cachedSortedCategories || [];

    // Pre-compile regex escape function (moved outside loop)
    const escapeRegExp = (string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Use Sets for O(1) duplicate checking instead of array.some()
    const existingLocations = new Set(state.locations.map(l => l.toLowerCase()));
    const existingCategories = new Set(state.categories.map(c => c.toLowerCase()));
    const existingKeywords = new Set(state.keywords);

    // Optimized extraction with single regex compilation per item
    const extractTerms = (list, existingSet, targetArray) => {
        for (let i = 0; i < list.length; i++) {
            const item = list[i];
            const itemLower = item.toLowerCase();

            // Skip if already exists
            if (existingSet.has(itemLower)) continue;

            // Match whole words/phrases bounded by start/end or delimiters
            const escaped = escapeRegExp(item);
            const regex = new RegExp(`(^|[\\s,])${escaped}(?=$|[\\s,])`, 'gi');

            if (regex.test(value)) {
                targetArray.push(item);
                existingSet.add(itemLower);
                // Remove matched term from input string
                value = value.replace(regex, ' ');
            }
        }
    };

    extractTerms(sortedLocations, existingLocations, state.locations);
    extractTerms(sortedCategories, existingCategories, state.categories);

    // Remaining text is treated as keywords, split by comma (not space)
    // This allows "Phone Pe" to be treated as a single keyword phrase
    const remainingValue = value.trim();
    if (remainingValue) {
        const terms = remainingValue.split(',').map(t => t.trim()).filter(Boolean);

        for (let i = 0; i < terms.length; i++) {
            // Normalize internal spaces (e.g. "Phone   Pe" -> "Phone Pe")
            const cleanTerm = terms[i].replace(/\s+/g, ' ');
            if (cleanTerm && !existingKeywords.has(cleanTerm)) {
                state.keywords.push(cleanTerm);
                existingKeywords.add(cleanTerm);
            }
        }
    }

    inputElement.value = '';
    syncAndFetch();
}

async function updateLastAccessDate(userId) {
    try {
        const { error } = await supabaseClient
            .from('profiles')
            .update({ last_access_date: new Date().toISOString() })
            .eq('uuid', userId);
        if (error) throw error;
    } catch (e) {
        console.error('Failed to update last access date:', e);
    }
}

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;

    // If logged in, fetch and cache profile data
    if (session?.user?.id) {
        prefetchEnrollmentStatus(session.user.id); // fire-and-forget, populates enrollmentStatusCache
        // Update last access date when user opens the portal
        updateLastAccessDate(session.user.id);

        // Check if profile data needs to be fetched (not in localStorage)
        const cachedProfile = localStorage.getItem('userProfileData');
        if (!cachedProfile) {
            fetchAndCacheProfileData(); // Don't await, let it run in background
        }
    }

    return session;
}

function updateHeaderAuth(session) {
    if (!dom.authButtonsContainer) return;
    if (session) {
        let email = session.user.email || 'User';
        let displayName = '';
        try {
            const profileData = JSON.parse(localStorage.getItem('userProfileData') || '{}');
            if (profileData.name && profileData.name.trim()) {
                displayName = profileData.name.trim();
            }
        } catch (e) {
            // Fall back to other name sources
        }
        if (!displayName && session.user && session.user.user_metadata && session.user.user_metadata.full_name) {
            displayName = session.user.user_metadata.full_name;
        }
        if (!displayName) {
            displayName = email.split('@')[0];
        }
        let initial = displayName.charAt(0).toUpperCase();
        dom.authButtonsContainer.innerHTML = `
            <div class="user-profile-container">
                <div class="user-icon-wrapper">
                    <div class="user-icon" data-email="${email}">${initial}</div>
                    <div class="user-hover-card">
                        <div class="user-hover-content">
                            <p class="user-email">${displayName}</p>
                            <a href="/profile.html" class="profile-link-btn">Edit Profile</a>
                            <button id="logoutBtn" class="logout-btn">Logout</button>
                        </div>
                    </div>
                </div>
            </div>`;
        const userProfileContainer = dom.authButtonsContainer.querySelector('.user-profile-container');
        const userIconWrapper = userProfileContainer.querySelector('.user-icon-wrapper');
        const userHoverCard = userProfileContainer.querySelector('.user-hover-card');

        userIconWrapper.addEventListener('click', (event) => {
            event.stopPropagation();
            userHoverCard.classList.toggle('show');
        });
        dom.authButtonsContainer.querySelector('#logoutBtn').addEventListener('click', handleLogout);
        checkUserEnrollment();
    } else {
        dom.authButtonsContainer.innerHTML = `<a href="/login.html" class="icon-button" aria-label="Login"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></a>`;
    }
}

window.handleLogout = async () => {
    userEnrollmentsCache = null;
    enrollmentStatusCache = null;
    // Sign out from Supabase
    await supabaseClient.auth.signOut();

    // Clear all user-specific localStorage data
    localStorage.removeItem('userJobPreference');
    localStorage.removeItem('userProfileData');
    localStorage.removeItem('userCVFileName');
    localStorage.removeItem('userCVText');
    localStorage.removeItem('userCVImages');
    localStorage.removeItem('subscribedTopics');
    localStorage.removeItem('newUserSignup');
    localStorage.removeItem('newUserEmail');

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Reset app state
    currentSession = null;
    appliedJobIds.clear();
    updateHeaderAuth(null);
    document.querySelectorAll('.application-status-filter-group').forEach(el => el.style.display = 'none');
    const lmsNavLink = document.getElementById('lms-nav-link');
    if (lmsNavLink) lmsNavLink.style.display = 'none';
    state.applicationStatus = 'all';
    state.experience = 'All';

    // Redirect to home page
    window.location.href = '/';
};

async function checkUserEnrollment() {
    if (!currentSession || !currentSession.user) return;
    const lmsNavLink = document.getElementById('lms-nav-link');
    if (!lmsNavLink) return;
    try {
        const { error, count } = await supabaseClient.from('enrollment').select('course', { count: 'exact', head: true }).eq('uuid', currentSession.user.id);
        if (error) throw error;
        lmsNavLink.style.display = count > 0 ? 'flex' : 'none';
    } catch (error) { lmsNavLink.style.display = 'none'; }

    // Show My Applications link for logged in users
    const historyNavLink = document.getElementById('history-nav-link');
    if (historyNavLink && currentSession) {
        historyNavLink.style.display = 'flex';
    }
}

let userEnrollmentsCache = null;
let enrollmentStatusCache = null; // { any, industrialTraining, freshers }

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
    if (tableName === 'Fresher Jobs') return enrollmentStatusCache.freshers;
    return enrollmentStatusCache.any;
}

async function getUserEnrollments(userId) {
    if (userEnrollmentsCache !== null) {
        return userEnrollmentsCache;
    }
    try {
        const { data, error } = await supabaseClient
            .from('enrollment')
            .select('course')
            .eq('uuid', userId);
        if (error) throw error;
        userEnrollmentsCache = (data || []).map(e => e.course);
        return userEnrollmentsCache;
    } catch (err) {
        console.error("Failed to fetch user enrollments:", err);
        return [];
    }
}

async function checkEnrollmentForTable(tableName, userId) {
    if (!userId) return false;
    try {
        let query = supabaseClient
            .from('enrollment')
            .select('course', { count: 'exact', head: true })
            .eq('uuid', userId);
        if (tableName === 'Industrial Training Job Portal') {
            query = query.eq('course', 'industrial-training-mastery');
        } else if (tableName === 'Fresher Jobs') {
            query = query.eq('course', 'msc-ca-freshers-program');
        }
        const { count, error } = await query;
        if (error) throw error;
        return count > 0;
    } catch (err) {
        console.error('Failed to check enrollment:', err);
        return false;
    }
}

function showEnrollmentRequiredPopup() {
    const existing = document.querySelector('.cv-popup-overlay');
    if (existing) existing.remove();

    const popupHtml = `
        <div class="cv-popup-overlay">
            <div class="cv-popup-card">
                <div class="cv-popup-icon" style="background-color: #fef3c7; color: #d97706;">
                    <i class="fas fa-lock"></i>
                </div>
                <h3>Exclusive Premium Feature</h3>
                <p>This feature is exclusively only available for course enrolled students.</p>
                <div class="cv-popup-btns">
                    <a href="https://www.mystudentclub.com/#courses" target="_blank" class="cv-popup-btn-primary">View Courses</a>
                    <button class="cv-popup-btn-secondary" id="closeEnrollmentPopup">Maybe Later</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', popupHtml);

    const overlay = document.querySelector('.cv-popup-overlay');
    setTimeout(() => overlay.classList.add('show'), 10);

    const closeBtn = document.getElementById('closeEnrollmentPopup');
    const closePopup = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
    };

    closeBtn.addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePopup();
    });
}



async function handleApplyClick(job, buttonElement, isAiApply = false) {

    markJobAsApplied(job);

    if (isAiApply) {
        if (!currentSession) { window.location.href = '/login.html'; return; }
        if (!isProfileComplete()) {
            showCvUploadPopup();
            return;
        }

        const btnText = buttonElement.querySelector('.btn-text');
        const spinner = buttonElement.querySelector('i.fa-spin');
        const originalText = btnText.textContent;
        btnText.textContent = 'Preparing...';
        if (spinner) spinner.style.display = 'inline-block';
        buttonElement.disabled = true;

        try {
            const profileData = JSON.parse(localStorage.getItem('userProfileData') || '{}');
            const cvImages = JSON.parse(localStorage.getItem('userCVImages') || '[]');
            const emailBody = await generateEmailBody(profileData, cvImages, job);
            openMailtoLink(constructMailto(job, emailBody));
        } catch (e) {
            const fallbackBody = generateFallbackEmail(job);
            openMailtoLink(constructMailto(job, fallbackBody));
        } finally {
            btnText.textContent = originalText;
            if (spinner) spinner.style.display = 'none';
            buttonElement.disabled = false;
        }
    } else {
        const applyLink = getApplicationLink(job['Application ID']);
        if (applyLink.startsWith('mailto:')) {
            const fallbackBody = generateFallbackEmail(job);
            openMailtoLink(constructMailto(job, fallbackBody));
        }
    }
}

async function markJobAsApplied(job) {
    if (!currentSession || appliedJobIds.has(job.id)) return;

    appliedJobIds.add(job.id);

    // Update modal buttons
    document.querySelectorAll(`#modalSimpleApplyBtn, #modalAiApplyBtn, #modalExternalApplyBtn`).forEach(btn => {
        if (btn) {
            btn.classList.add('applied');
            // Keep original button text
        }
    });

    // Update job card buttons
    const card = document.querySelector(`.job-card[data-job-id='${job.id}']`);
    if (card) {
        // Update primary Apply Now button only
        const applyBtn = card.querySelector('.apply-now-card-btn.primary');
        if (applyBtn) {
            applyBtn.classList.add('applied');
            // Keep original button text
        }
    }

    // Hack for UUIDs in BigInt column (Frontend-only solution)
    let dbJobId = job.id;
    let dbJobTable = currentTable;

    // Check if ID is UUID/String (non-numeric)
    if (isNaN(job.id)) {
        // Generate a random safe integer to satisfy BigInt constraint and Unique Constraint
        // Using timestamp + random to minimize collision
        dbJobId = Date.now() + Math.floor(Math.random() * 1000);

        // Store the REAL UUID in the table name column (Piggyback)
        dbJobTable = `${currentTable}|${job.id}`;
    }

    try {
        const { error } = await supabaseClient
            .from('job_applications')
            .insert({ user_id: currentSession.user.id, job_id: dbJobId, job_table: dbJobTable });
        if (error) throw error;
    } catch (error) {
        console.error('Failed to save application status:', error);
    }
}



function constructMailto(job, body = "") {
    const rawLink = job['Application ID'];
    if (!rawLink) return '#';
    const emailMatch = rawLink.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) return '#';
    const email = emailMatch[0];
    const subjectBase = EMAIL_SUBJECT_MAP[currentTable] || `Application for the role`;
    const subject = `${subjectBase} at ${job.Company} (Ref: My Student Club)`;
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Opens a mailto link using a temporary anchor element to avoid browser security warnings.
 * This preserves the user gesture context and prevents "blocked from automatically composing email" warnings.
 * @param {string} mailtoUrl - The mailto: URL to open
 */
function openMailtoLink(mailtoUrl) {
    if (!mailtoUrl || mailtoUrl === '#') return;

    try {
        const link = document.createElement('a');
        link.href = mailtoUrl;
        link.style.display = 'none';
        link.setAttribute('target', '_self');
        document.body.appendChild(link);
        link.click();
        // Remove the element after a short delay to ensure the click is processed
        setTimeout(() => {
            if (link.parentNode) {
                document.body.removeChild(link);
            }
        }, 100);
    } catch (error) {
        console.error('Error opening mailto link:', error);
        // Fallback to window.location.href if the anchor method fails
        window.location.href = mailtoUrl;
    }
}

function showCvUploadPopup() {
    // Remove existing if any
    const existing = document.querySelector('.cv-popup-overlay');
    if (existing) existing.remove();

    const popupHtml = `
        <div class="cv-popup-overlay">
            <div class="cv-popup-card">
                <div class="cv-popup-icon">
                    <i class="fas fa-file-upload"></i>
                </div>
                <h3>CV Upload Required</h3>
                <p>Please upload your CV in your profile to enable AI Powered Apply. This allows our AI to personalize your application materials.</p>
                <div class="cv-popup-btns">
                    <a href="/profile.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}" class="cv-popup-btn-primary">Upload CV Now</a>
                    <button class="cv-popup-btn-secondary" id="closeCvPopup">Maybe Later</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', popupHtml);

    // Trigger animation
    const overlay = document.querySelector('.cv-popup-overlay');
    setTimeout(() => overlay.classList.add('show'), 10);

    // Close logic
    const closeBtn = document.getElementById('closeCvPopup');
    const closePopup = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
    };

    closeBtn.addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePopup();
    });
}


function getApplicationLink(id, companyName = 'the company') {
    if (!id) return '#';
    const trimmedId = id.trim();
    if (trimmedId.startsWith('http')) {
        try {
            new URL(trimmedId);
            return trimmedId;
        } catch (_) {
        }
    }
    if (trimmedId.includes('@')) {
        return constructMailto({ 'Application ID': trimmedId, Company: companyName });
    }
    return `https://www.google.com/search?q=${encodeURIComponent(trimmedId + ' careers')}`;
}

// function generateFallbackEmail(job) {
//     return `Dear Hiring Manager,

// I am writing to express my interest in the ${job.Category || 'Articleship'} position at ${job.Company}.

// With my academic background and passion for the field, I am confident that I would be a valuable addition to your team.

// I have attached my resume for your review. I would welcome the opportunity to discuss how my skills can contribute to your organization's success.

// Thank you for considering my application.

// Best regards,
// [Your Name]

// ---
// Application submitted via My Student Club`;
// }

async function loadBanners() {
    const carousel = document.querySelector('.carousel');
    const bannerSection = document.querySelector('.banner-section');
    if (!carousel || !bannerSection) return;
    try {
        const { data, error } = await supabaseClient.from('Banners').select('Image, Hyperlink, Type, visible_to_unenrolled');
        if (error) throw error;
        const banners = data;
        carousel.innerHTML = '';
        const currentType = currentTable === "Semi Qualified Jobs" ? "Semi-Qualified" : currentTable === "Fresher Jobs" ? "Freshers" : currentTable.split(' ')[0];

        // Determine if current user is enrolled in any course
        let isEnrolled = false;
        if (currentSession?.user?.id) {
            const { count, error: enrollErr } = await supabaseClient
                .from('enrollment')
                .select('course', { count: 'exact', head: true })
                .eq('uuid', currentSession.user.id);
            if (!enrollErr && count > 0) {
                isEnrolled = true;
            }
        }

        const relevantBanners = banners.filter(b => {
            const matchesType = b.Type === 'All' || b.Type === currentType;
            const matchesEnrollment = b.visible_to_unenrolled === null || 
                                      b.visible_to_unenrolled === undefined || 
                                      (b.visible_to_unenrolled === true && !isEnrolled) || 
                                      (b.visible_to_unenrolled === false && isEnrolled);
            return matchesType && matchesEnrollment;
        });

        if (relevantBanners.length === 0) { bannerSection.style.display = 'none'; return; }
        bannerSection.style.display = 'block';

        relevantBanners.forEach((banner, i) => {
            const a = document.createElement('a');
            a.href = banner.Hyperlink;
            a.className = `carousel-item ${i === 0 ? 'active' : ''}`;
            a.target = "_blank";
            const img = document.createElement('img');
            img.src = banner.Image;
            img.alt = `Banner`;
            a.appendChild(img);
            carousel.appendChild(a);
        });

        const slides = document.querySelectorAll('.carousel-item');
        if (slides.length > 1) {
            let currentSlide = 0;
            const showSlide = (idx) => { slides.forEach(s => s.classList.remove('active')); slides[idx].classList.add('active'); };
            setInterval(() => { currentSlide = (currentSlide + 1) % slides.length; showSlide(currentSlide); }, 5000);
        }
    } catch (e) {
        bannerSection.style.display = 'none';
    }
}

function showNotifStatus(message, type = 'info') { if (dom.notificationStatusEl) { dom.notificationStatusEl.textContent = message; dom.notificationStatusEl.className = `notification-status status-${type}`; dom.notificationStatusEl.style.display = 'block'; if (type !== 'error') setTimeout(() => { dom.notificationStatusEl.style.display = 'none'; }, 3000); } }
function getSubscribedTopics() { return JSON.parse(localStorage.getItem('subscribedTopics') || '[]'); }
async function saveSubscribedTopics(topics) {
    localStorage.setItem('subscribedTopics', JSON.stringify(topics));
    updateNotificationBadge();

    // Also save to Supabase profile if logged in
    if (currentSession?.user?.id) {
        try {
            const { data: existingProfile } = await supabaseClient
                .from('profiles')
                .select('profile')
                .eq('uuid', currentSession.user.id)
                .maybeSingle();

            const profileData = existingProfile?.profile || {};
            profileData.notification_subscriptions = topics;

            await supabaseClient.from('profiles').upsert({
                uuid: currentSession.user.id,
                profile: profileData,
                updated_at: new Date().toISOString()
            });
        } catch (e) {
            console.log('Could not save subscriptions to profile:', e);
        }
    }
}
function updateNotificationBadge() { if (dom.notificationBadge) dom.notificationBadge.style.visibility = getSubscribedTopics().length > 0 ? 'visible' : 'hidden'; }

function renderSubscribedTopics() {
    if (!dom.subscribedTopicsListEl) return;
    dom.subscribedTopicsListEl.innerHTML = '';
    const topics = getSubscribedTopics();
    if (topics.length === 0) {
        dom.subscribedTopicsListEl.innerHTML = '<p class="no-subscriptions">No active subscriptions.</p>';
    } else {
        topics.forEach(topic => {
            const { location, jobType } = formatTopicForDisplay(topic);
            const tag = document.createElement('div');
            tag.className = 'topic-tag';
            tag.innerHTML = `<span>${location}${jobType ? ` - ${jobType}` : ''}</span><button class="topic-remove" data-topic="${topic}">×</button>`;
            dom.subscribedTopicsListEl.appendChild(tag);
        });
        dom.subscribedTopicsListEl.querySelectorAll('.topic-remove').forEach(btn => btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const topic = btn.dataset.topic;
            if (await unsubscribeFromTopic(topic) && topic === 'all') { dom.topicAllCheckbox.checked = false; }
        }));
    }
    if (dom.topicAllCheckbox) dom.topicAllCheckbox.checked = topics.includes('all');
    updateSpecificTopicAreaVisibility();
}

function formatTopicForDisplay(topic) {
    if (topic === 'all') return { location: 'All', jobType: 'Notifications' };

    // Check for specific All India topics
    if (topic === 'Industrial-all') return { location: 'All India', jobType: 'Industrial Training' };
    if (topic === 'fresher-all') return { location: 'All India', jobType: 'Fresher' };
    if (topic === 'semi-all') return { location: 'All India', jobType: 'Semi Qualified' };
    if (topic === 'articleship-all') return { location: 'All India', jobType: 'Articleship' };

    const parts = topic.split('-');
    if (parts.length < 2) return { location: topic, jobType: '' };
    const jobTypeVal = parts.pop();
    const location = parts.join('-').replace(/-/g, ' ');
    const jobType = JOB_TYPES_NOTIF.find(t => t.value === jobTypeVal)?.label || jobTypeVal;
    return { location: location.charAt(0).toUpperCase() + location.slice(1), jobType };
}

function updateSpecificTopicAreaVisibility() { if (dom.specificSubscriptionForm) dom.specificSubscriptionForm.style.display = dom.topicAllCheckbox.checked ? 'none' : 'block'; }
async function manageTopicSubscription(topic, action) {
    // Actively try to get token if missing
    if (!currentFcmToken) {
        // Prioritize App token if available
        if (window.flutter_app.fcmToken) {
            currentFcmToken = window.flutter_app.fcmToken;
        }
        else if (window.flutter_app.isReady) {
        } else {
            if (Notification.permission === 'granted') {
                showNotifStatus('Connecting to notification service...', 'info');
                await requestTokenAndSync();
            } else {
                showNotifStatus('Please enable notifications first.', 'error');
                return false;
            }
        }
    }

    currentFcmToken = window.flutter_app.fcmToken || currentFcmToken;

    if (!currentFcmToken) {
        showNotifStatus('Notification service unavailable. Please refresh or check permissions.', 'error');
        return false;
    }
    try {
        const response = await fetch(
            'https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: currentFcmToken, topic, action }),
            }
        );
        if (!response.ok) throw new Error(await response.text());
        let topics = getSubscribedTopics();
        if (action === 'subscribe' && !topics.includes(topic)) topics.push(topic);
        else if (action === 'unsubscribe')
            topics = topics.filter((t) => t !== topic);
        saveSubscribedTopics(topics);
        renderSubscribedTopics();
        return true;
    } catch (err) {
        showNotifStatus(`Failed to ${action}`, 'error');
        return false;
    }
}
async function subscribeToTopic(topic) { return manageTopicSubscription(topic, 'subscribe'); }
async function unsubscribeFromTopic(topic) { return manageTopicSubscription(topic, 'unsubscribe'); }

function updatePermissionStatusUI() {
    if (!dom.permissionStatusDiv) return;

    if (window.flutter_app.isReady) {
        dom.enableNotificationsBtn.style.display = 'none';
        dom.topicSelectionArea.style.display = 'block';
        dom.permissionStatusDiv.textContent = 'Notifications are managed by the app.';
        dom.permissionStatusDiv.className = 'notification-status status-success';
        dom.permissionStatusDiv.style.display = 'block';
        return;
    }

    const permission = Notification.permission;
    dom.enableNotificationsBtn.style.display = permission === 'default' ? 'block' : 'none';
    dom.topicSelectionArea.style.display = permission === 'granted' ? 'block' : 'none';
    if (permission === 'granted') {
        dom.permissionStatusDiv.textContent = 'Notifications are enabled.';
        dom.permissionStatusDiv.className = 'notification-status status-success';
    } else if (permission === 'denied') {
        dom.permissionStatusDiv.textContent = 'Notifications are blocked in browser settings.';
        dom.permissionStatusDiv.className = 'notification-status status-error';
    } else {
        dom.permissionStatusDiv.textContent = 'Enable notifications for job alerts.';
        dom.permissionStatusDiv.className = 'notification-status status-info';
    }
    dom.permissionStatusDiv.style.display = 'block';
}
function populateNotificationDropdowns() { if (dom.locationSelectEl) { dom.locationSelectEl.innerHTML = '<option value="" disabled selected>Select Location</option><option value="all">All India</option>'; LOCATIONS_NOTIF.sort().forEach(loc => { const opt = document.createElement('option'); opt.value = loc; opt.textContent = loc.charAt(0).toUpperCase() + loc.slice(1); dom.locationSelectEl.appendChild(opt); }); } if (dom.jobTypeSelectEl) { dom.jobTypeSelectEl.innerHTML = '<option value="" disabled selected>Select Job Type</option>'; JOB_TYPES_NOTIF.forEach(type => { const opt = document.createElement('option'); opt.value = type.value; opt.textContent = type.label; dom.jobTypeSelectEl.appendChild(opt); }); } }

async function initializeFCM() {
    if (window.flutter_app.isReady) {
        currentFcmToken = window.flutter_app.fcmToken;
        await syncNotificationTopics();
        return;
    }

    try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        firebaseMessaging = firebase.messaging();
        firebaseMessaging.onMessage(payload => { });
        if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        if (Notification.permission === 'granted') await requestTokenAndSync();
    } catch (err) { }
}

async function requestTokenAndSync() {
    if (window.flutter_app.isReady) return;
    if (!firebaseMessaging) return;
    try {
        const token = await firebaseMessaging.getToken({ vapidKey: VAPID_KEY });
        if (token) { currentFcmToken = token; await syncNotificationTopics(); }
    } catch (err) {
    }
}
function shouldSync() { const lastSync = localStorage.getItem('notificationSyncTimestamp'); if (!lastSync) return true; return new Date(parseInt(lastSync)).toDateString() !== new Date().toDateString(); }
async function syncNotificationTopics() {
    currentFcmToken = window.flutter_app.fcmToken || currentFcmToken;
    if (!currentFcmToken || !shouldSync()) return;
    await Promise.all(getSubscribedTopics().map(topic => manageTopicSubscription(topic, 'subscribe')));
    localStorage.setItem('notificationSyncTimestamp', Date.now().toString());
}

async function initializeUserFeatures() {
    if (!currentSession) return;
    document.querySelectorAll('.application-status-filter-group').forEach(el => el.style.display = 'block');
    try {
        const { data, error } = await supabaseClient
            .from('job_applications')
            .select('job_id, job_table')
            .eq('user_id', currentSession.user.id)
            .like('job_table', `${currentTable}%`); // Use LIKE to match both "Table" and "Table|UUID"

        if (error) throw error;

        // Extract IDs: If piggybacked (contains |), use the UUID part. Otherwise use normal job_id.
        appliedJobIds = new Set(data.map(app => {
            if (app.job_table.includes('|')) {
                return app.job_table.split('|')[1]; // Return the UUID
            }
            return app.job_id;
        }));
    } catch (error) {
        console.error('Error fetching applied jobs:', error);
    }
    checkAndSyncCVBackground(); // Run background sync check
}

function updateSortOptions() {
    ['sortBySelect', 'sortBySelectMobile'].forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            // Check if options already exist to avoid duplicates
            if (!select.querySelector('option[value="popular"]')) {
                const popularOpt = document.createElement('option');
                popularOpt.value = 'popular';
                popularOpt.textContent = 'Sort by Trending';
                select.insertBefore(popularOpt, select.firstChild);
            }
            // Rename 'newest' to 'Sort by Last Created' or Update text
            const newestOpt = select.querySelector('option[value="newest"]');
            if (newestOpt) {
                newestOpt.textContent = 'Sort by Last Created';
            }
            // Ensure default is popular
            if (select.value === 'newest') select.value = 'popular';
        }
    });
}

function setupEventListeners() {
    updateSortOptions();
    dom.modalOverlay.addEventListener('click', (e) => { if (e.target === dom.modalOverlay) closeModal(); });
    dom.modalCloseBtn.addEventListener('click', closeModal);
    // dom.loadMoreButton.addEventListener('click', () => fetchJobs()); // Removed

    [dom.searchInputMobile, dom.searchInputDesktop].forEach(input => {
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    processAndApplySearch(input);
                }
            });
            const searchButton = input.parentElement.querySelector('.search-button');
            if (searchButton) {
                searchButton.addEventListener('click', () => processAndApplySearch(input));
            }
        }
    });

    const handleSortChange = (e) => {
        const newSortBy = e.target.value;
        if (state.sortBy !== newSortBy) {
            updateState({ sortBy: newSortBy });
            if (e.target.id === 'sortBySelect' && dom.sortBySelectMobile) {
                dom.sortBySelectMobile.value = newSortBy;
            } else if (e.target.id === 'sortBySelectMobile' && dom.sortBySelect) {
                dom.sortBySelect.value = newSortBy;
            }
        }
    };

    if (dom.sortBySelect) dom.sortBySelect.addEventListener('change', handleSortChange);
    if (dom.sortBySelectMobile) dom.sortBySelectMobile.addEventListener('change', handleSortChange);

    dom.menuButton.addEventListener('click', () => dom.expandedMenu.classList.add('active'));
    dom.menuCloseBtn.addEventListener('click', () => dom.expandedMenu.classList.remove('active'));

    dom.openFilterModalBtn.addEventListener('click', () => dom.filterModalOverlay.classList.add('show'));
    dom.closeFilterModalBtn.addEventListener('click', () => dom.filterModalOverlay.classList.remove('show'));
    dom.filterModalOverlay.addEventListener('click', (e) => { if (e.target === dom.filterModalOverlay) dom.filterModalOverlay.classList.remove('show'); });

    dom.applyFiltersBtn.addEventListener('click', () => {
        state.salary = dom.salaryFilterMobile.value;
        if (dom.companyTypeFilterMobile) state.companyType = dom.companyTypeFilterMobile.value;
        if (dom.industryTypeFilterMobile) state.industryType = dom.industryTypeFilterMobile.value;
        if (dom.firmTypeFilterMobile) state.firmType = dom.firmTypeFilterMobile.value;
        syncAndFetch();
        dom.filterModalOverlay.classList.remove('show');
    });

    [dom.desktopResetBtn, dom.mobileResetBtn].forEach(btn => {
        if (btn) btn.addEventListener('click', () => {
            state.keywords = [];
            state.locations = [];
            state.categories = [];
            state.salary = '';
            state.experience = '';
            state.sortBy = 'newest';
            state.applicationStatus = 'all';
            state.companyType = '';
            state.industryType = '';
            state.firmType = '';
            if (dom.searchInputMobile) dom.searchInputMobile.value = '';
            if (currentTable === 'Fresher Jobs') {
                state.experience = isExperiencedFresherPortal() ? 'Experienced' : 'Freshers';
            }
            if (dom.searchInputDesktop) dom.searchInputDesktop.value = '';
            syncAndFetch();
            if (btn.id === 'mobileResetBtn') dom.filterModalOverlay.classList.remove('show');
        });
    });

    if (dom.salaryFilterDesktop) dom.salaryFilterDesktop.addEventListener('change', () => updateState({ salary: dom.salaryFilterDesktop.value }));
    if (dom.companyTypeFilterDesktop) dom.companyTypeFilterDesktop.addEventListener('change', () => updateState({ companyType: dom.companyTypeFilterDesktop.value }));
    if (dom.industryTypeFilterDesktop) dom.industryTypeFilterDesktop.addEventListener('change', () => updateState({ industryType: dom.industryTypeFilterDesktop.value }));
    if (dom.firmTypeFilterDesktop) dom.firmTypeFilterDesktop.addEventListener('change', () => updateState({ firmType: dom.firmTypeFilterDesktop.value }));

    // Experience filter UI is only meaningful for Semi Qualified now.
    document.querySelectorAll('.experience-filter-group .pill-options').forEach(group => {
        group.addEventListener('click', (e) => {
            if (e.target.classList.contains('pill-btn')) {
                if (currentTable !== 'Semi Qualified Jobs') return;
                const value = e.target.dataset.value;
                state.experience = state.experience === value ? '' : value;
                syncAndFetch();
            }
        });
    });

    document.querySelectorAll('.application-status-filter-group .pill-options').forEach(group => {
        group.addEventListener('click', (e) => {
            if (e.target.classList.contains('pill-btn')) {
                const value = e.target.dataset.value;
                state.applicationStatus = value;
                syncAndFetch();
            }
        });
    });

    document.querySelectorAll('.multi-select-container').forEach(setupMultiSelect);

    if (dom.notificationsBtn) dom.notificationsBtn.addEventListener('click', (e) => {
        e.stopPropagation(); dom.notificationPopup.style.display = dom.notificationPopup.style.display === 'flex' ? 'none' : 'flex';
        if (dom.notificationPopup.style.display === 'flex') {
            updatePermissionStatusUI();
            if (window.flutter_app.isReady || Notification.permission === 'granted') {
                if (!firebaseMessaging && !window.flutter_app.isReady) initializeFCM().then(renderSubscribedTopics);
                else renderSubscribedTopics();
            } else {
                renderSubscribedTopics();
            }
        }
    });

    if (dom.closeNotificationPopup) dom.closeNotificationPopup.addEventListener('click', () => dom.notificationPopup.style.display = 'none');
    if (dom.enableNotificationsBtn) dom.enableNotificationsBtn.addEventListener('click', async () => { try { const permission = await Notification.requestPermission(); updatePermissionStatusUI(); if (permission === 'granted') await initializeFCM(); } catch (err) { } });
    if (dom.topicAllCheckbox) {
        dom.topicAllCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            e.target.disabled = true; // Disable to prevent multi-clicks
            try {
                const success = isChecked ? await subscribeToTopic('all') : await unsubscribeFromTopic('all');
                if (!success) {
                    e.target.checked = !isChecked; // Revert if failed
                }
            } catch (err) {
                console.error('Subscription error:', err);
                e.target.checked = !isChecked;
            } finally {
                e.target.disabled = false; // Re-enable
            }
        });
    }
    if (dom.subscribeBtnEl) dom.subscribeBtnEl.addEventListener('click', async () => {
        const location = dom.locationSelectEl.value;
        const jobType = dom.jobTypeSelectEl.value;
        if (!location || !jobType) return;

        let topicName;
        if (location === 'all') {
            if (jobType === 'industrial') topicName = 'Industrial-all';
            else if (jobType === 'fresher') topicName = 'fresher-all';
            else if (jobType === 'semi') topicName = 'semi-all';
            else if (jobType === 'articleship') topicName = 'articleship-all';
        } else {
            topicName = `${location}-${jobType}`;
        }

        if (await subscribeToTopic(topicName)) {
            dom.locationSelectEl.selectedIndex = 0;
            dom.jobTypeSelectEl.selectedIndex = 0;
            dom.subscribeBtnEl.disabled = true;
            // Reset custom select UI if present
            if (dom.locationSelectEl.parentElement.classList.contains('custom-select-wrapper')) {
                dom.locationSelectEl.parentElement.querySelector('.custom-select-trigger span').textContent = 'Select Location';
                dom.locationSelectEl.parentElement.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
            }
            if (dom.jobTypeSelectEl.parentElement.classList.contains('custom-select-wrapper')) {
                dom.jobTypeSelectEl.parentElement.querySelector('.custom-select-trigger span').textContent = 'Select Job Type';
                dom.jobTypeSelectEl.parentElement.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
            }
        }
    });
    if (dom.locationSelectEl && dom.jobTypeSelectEl && dom.subscribeBtnEl) {
        const updateSubBtn = () => { dom.subscribeBtnEl.disabled = !(dom.locationSelectEl.value && dom.jobTypeSelectEl.value); };
        dom.locationSelectEl.addEventListener('change', updateSubBtn);
        dom.jobTypeSelectEl.addEventListener('change', updateSubBtn);
    }

    const resourcesBtn = document.getElementById('resourcesDropdownBtn');
    if (resourcesBtn) {
        const resourcesDropdown = document.getElementById('resourcesDropdown');
        const dropdownIcon = resourcesBtn.querySelector('.dropdown-icon');
        resourcesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (resourcesDropdown) resourcesDropdown.classList.toggle('active');
            if (dropdownIcon) dropdownIcon.classList.toggle('open');
        });
    }

    const toolsBtn = document.getElementById('toolsDropdownBtn');
    if (toolsBtn) {
        const toolsDropdown = document.getElementById('toolsDropdown');
        const dropdownIcon = toolsBtn.querySelector('.dropdown-icon');
        toolsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toolsDropdown.classList.toggle('active');
            if (dropdownIcon) dropdownIcon.classList.toggle('open');
        });
    }

    document.addEventListener('click', (e) => {
        if (dom.expandedMenu && dom.expandedMenu.classList.contains('active') && !dom.expandedMenu.contains(e.target) && !dom.menuButton.contains(e.target)) dom.expandedMenu.classList.remove('active');
        if (dom.notificationPopup && dom.notificationPopup.style.display === 'flex' && !dom.notificationPopup.contains(e.target) && !dom.notificationsBtn.contains(e.target)) dom.notificationPopup.style.display = 'none';
        const resourcesDropdown = document.getElementById('resourcesDropdown');
        const resourcesBtn = document.getElementById('resourcesDropdownBtn');
        if (resourcesDropdown && resourcesDropdown.classList.contains('active') && !resourcesDropdown.contains(e.target) && (!resourcesBtn || !resourcesBtn.contains(e.target))) {
            resourcesDropdown.classList.remove('active');
            if (resourcesBtn && resourcesBtn.querySelector('.dropdown-icon')) resourcesBtn.querySelector('.dropdown-icon').classList.remove('open');
        }
        const toolsDropdown = document.getElementById('toolsDropdown');
        const toolsBtn = document.getElementById('toolsDropdownBtn');
        if (toolsDropdown && toolsDropdown.classList.contains('active') && !toolsDropdown.contains(e.target) && !toolsBtn.contains(e.target)) {
            toolsDropdown.classList.remove('active');
            if (toolsBtn.querySelector('.dropdown-icon')) toolsBtn.querySelector('.dropdown-icon').classList.remove('open');
        }

        const userProfileContainer = document.querySelector('.user-profile-container');
        const userHoverCard = document.querySelector('.user-hover-card');
        if (userProfileContainer && userHoverCard && userHoverCard.classList.contains('show')) {
            if (!userProfileContainer.contains(e.target)) {
                userHoverCard.classList.remove('show');
            }
        }
    });
}

// Optimal Custom Dropdown Implementation
function initCustomSelects() {
    const selectorIds = [
        'sortBySelect', 'salaryFilterDesktop', 'sortBySelectMobile', 'salaryFilterMobile', 'locationSelect', 'jobTypeSelect',
        'companyTypeFilterDesktop', 'companyTypeFilterMobile',
        'industryTypeFilterDesktop', 'industryTypeFilterMobile',
        'firmTypeFilterDesktop', 'firmTypeFilterMobile'
    ];

    // Close dropdowns on outside click
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

        // Ensure we don't double-wrap if re-run
        if (select.parentNode.classList.contains('custom-select-wrapper')) return;

        // Create Custom UI
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        trigger.innerHTML = `<span>${select.options[select.selectedIndex]?.text || 'Select'}</span><div class="custom-arrow"></div>`;

        const optionsList = document.createElement('div');
        optionsList.className = 'custom-options';

        // Function to rebuild options
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
                    optionsList.style.display = 'none'; // Instant hide

                    // Visual update
                    optionsList.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                    div.classList.add('selected');

                    // Trigger native event
                    select.dispatchEvent(new Event('change'));
                });
                optionsList.appendChild(div);
            });
        };

        // Initial build
        buildOptions();

        // Assemble
        select.style.display = 'none';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select); // Move select inside to keep DOM clean-ish
        wrapper.appendChild(trigger);
        wrapper.appendChild(optionsList);

        // Toggle Event
        trigger.addEventListener('click', () => {
            const isOpen = wrapper.classList.contains('open');
            // Close others
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                if (w !== wrapper) {
                    w.classList.remove('open');
                    w.querySelector('.custom-options').style.display = 'none';
                }
            });

            if (!isOpen) {
                wrapper.classList.add('open');
                optionsList.style.display = 'block';
                // Trigger reflow
                optionsList.offsetHeight;
                optionsList.style.opacity = '1';
            } else {
                wrapper.classList.remove('open');
                optionsList.style.opacity = '0';
                setTimeout(() => optionsList.style.display = 'none', 200);
            }
        });

        // REACTIVITY: Watch for Native Changes (JS updates, Resets)
        // 1. MutationObserver for option changes (dynamic loading)
        const observer = new MutationObserver(() => {
            buildOptions();
            const sel = select.options[select.selectedIndex];
            if (sel) trigger.querySelector('span').textContent = sel.text;
        });
        observer.observe(select, { childList: true, subtree: true });

        // 2. Intercept programmatic .value changes (e.g. Reset Button)
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        Object.defineProperty(select, 'value', {
            get: function () { return descriptor.get.call(this); },
            set: function (val) {
                descriptor.set.call(this, val);
                // Update UI
                const sel = this.options[this.selectedIndex];
                if (sel) {
                    trigger.querySelector('span').textContent = sel.text;
                    optionsList.querySelectorAll('.custom-option').forEach(o => {
                        o.classList.toggle('selected', o.dataset.value === val);
                    });
                }
            }
        });

        // 3. Listen for internal value changes (standard change event)
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

function setupInfiniteScroll() {
    const sentinel = document.getElementById('sentinel');
    if (!sentinel) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && hasMoreData && !isFetching) {
                fetchJobs();
            }
        });
    }, {
        root: null,
        rootMargin: '200px', // Load before user reaches the very bottom
        threshold: 0.1
    });

    observer.observe(sentinel);
}

async function initializePage() {
    dom.jobsContainer = document.getElementById('jobs');
    dom.loader = document.getElementById('loader');
    dom.modalOverlay = document.getElementById('modal');
    dom.modalBody = document.getElementById('modal-body-content');
    dom.modalCloseBtn = document.getElementById('modalCloseBtn');
    dom.searchInputMobile = document.getElementById('searchInputMobile');
    dom.searchInputDesktop = document.getElementById('searchFilterDesktop');
    dom.sortBySelect = document.getElementById('sortBySelect');
    dom.sortBySelectMobile = document.getElementById('sortBySelectMobile');
    // dom.loadMoreButton = document.getElementById('loadMore'); // Removed
    dom.activeFiltersDisplay = document.getElementById('active-filters-display');
    dom.menuButton = document.getElementById('menuButton');
    dom.expandedMenu = document.getElementById('expandedMenu');
    dom.menuCloseBtn = document.getElementById('menuCloseBtn');
    dom.authButtonsContainer = document.querySelector('.auth-buttons-container');
    dom.salaryFilterDesktop = document.getElementById('salaryFilterDesktop');
    dom.companyTypeFilterDesktop = document.getElementById('companyTypeFilterDesktop');
    dom.industryTypeFilterDesktop = document.getElementById('industryTypeFilterDesktop');
    dom.firmTypeFilterDesktop = document.getElementById('firmTypeFilterDesktop');
    dom.locationPillsDesktop = document.getElementById('locationPillsDesktop');
    dom.categoryPillsDesktop = document.getElementById('categoryPillsDesktop');
    dom.desktopResetBtn = document.getElementById('desktopResetBtn');
    dom.openFilterModalBtn = document.getElementById('open-filter-modal-btn');
    dom.filterModalOverlay = document.getElementById('filterModalOverlay');
    dom.closeFilterModalBtn = document.getElementById('closeFilterModalBtn');
    dom.applyFiltersBtn = document.getElementById('applyFiltersBtn');
    dom.mobileResetBtn = document.getElementById('mobileResetBtn');
    dom.salaryFilterMobile = document.getElementById('salaryFilterMobile');
    dom.companyTypeFilterMobile = document.getElementById('companyTypeFilterMobile');
    dom.industryTypeFilterMobile = document.getElementById('industryTypeFilterMobile');
    dom.firmTypeFilterMobile = document.getElementById('firmTypeFilterMobile');
    dom.locationPillsMobile = document.getElementById('locationPillsMobile');
    dom.categoryPillsMobile = document.getElementById('categoryPillsMobile');
    dom.notificationsBtn = document.getElementById('notificationsBtn');
    dom.notificationPopup = document.getElementById('notificationPopup');
    dom.closeNotificationPopup = document.getElementById('closeNotificationPopup');
    dom.notificationStatusEl = document.getElementById('notificationStatus');
    dom.notificationBadge = document.getElementById('notificationBadge');
    dom.topicAllCheckbox = document.getElementById('topic-all');
    dom.topicSelectionArea = document.getElementById('topic-selection-area');
    dom.permissionStatusDiv = document.getElementById('notification-permission-status');
    dom.enableNotificationsBtn = document.getElementById('enable-notifications-btn');
    dom.subscribedTopicsListEl = document.getElementById('subscribedTopicsList');
    dom.locationSelectEl = document.getElementById('locationSelect');
    dom.jobTypeSelectEl = document.getElementById('jobTypeSelect');
    dom.subscribeBtnEl = document.getElementById('subscribeBtn');
    dom.specificSubscriptionForm = document.getElementById('specific-subscription-form');

    setActivePortalTab();
    initCustomSelects();

    const session = await checkAuth();
    updateHeaderAuth(session);

    if (session) {
        localStorage.removeItem('portalVisitCount');
        await initializeUserFeatures();

        // Onboarding Check: Ensure looking_for details are completed
        let profile = null;
        const cached = localStorage.getItem('userProfileData');
        if (cached) {
            try { profile = JSON.parse(cached); } catch (e) {}
        }
        if (!profile || !profile.looking_for) {
            profile = await fetchAndCacheProfileData();
        }

        // Show onboarding segment modal if looking_for is not set on the homepage
        if (!profile || !profile.looking_for) {
            const path = window.location.pathname;
            if (path === '/' || path === '/index.html') {
                setTimeout(() => {
                    showOnboardingSegmentModal();
                }, 800); // Small pleasant delay after load
            }
        }
    } else {
        // Track visits for unlogged users
        let visitCount = parseInt(localStorage.getItem('portalVisitCount') || '0');
        visitCount++;
        localStorage.setItem('portalVisitCount', visitCount);

        if (visitCount === 3) {
            showToast("Create a free account to keep browsing jobs, get vacancy alerts, and access exclusive career tools.", "info");
        } else if (visitCount >= 5) {
            const overlay = document.getElementById('loginPromptOverlay');
            if (overlay) {
                overlay.style.display = 'flex';
                document.body.style.overflow = 'hidden'; // Prevent browsing jobs
            }
        }
    }

    if (currentTable === 'Fresher Jobs') {
        state.experience = 'Freshers';
    }

    await fetchFilterOptions();

    populateSalaryFilter();
    setupEventListeners();
    syncFiltersUI();
    setupInfiniteScroll(); // Initialize infinite scroll

    await Promise.all([fetchJobs(), loadBanners()]);

    // Check if a shared job link was opened
    checkAndOpenSharedJob();

    populateNotificationDropdowns();
    updateNotificationBadge();
    if (Notification.permission === 'granted' || window.flutter_app.isReady) {
        initializeFCM();
    }
    renderProfileCompletionBanner();
}

// Check URL parameters and auto-open job modal if shared link
function checkAndOpenSharedJob() {
    const urlParams = new URLSearchParams(window.location.search);
    const jobId = urlParams.get('id');
    const jobType = urlParams.get('type');

    if (jobId && jobType) {
        // Set proper table based on type
        if (jobType === 'semi') currentTable = 'Semi Qualified Jobs';
        else if (jobType === 'fresher') currentTable = 'Fresher Jobs';
        else if (jobType === 'articleship') currentTable = 'Articleship Jobs';
        // else Default stays Industrial

        // Fetch and open the specific job
        fetchSharedJob(jobId);

        // Clean URL without reloading
        window.history.replaceState({}, '', window.location.pathname);
    }
}

// Fetch a specific shared job and open modal
async function fetchSharedJob(jobId) {
    try {
        const { data, error } = await supabaseClient
            .from(currentTable)
            .select('*')
            .eq('id', jobId)
            .single();

        if (!error && data) {
            setTimeout(() => showModal(data), 300);
        }
    } catch (err) {
        console.error('Failed to fetch shared job:', err);
    }
}

document.addEventListener('DOMContentLoaded', initializePage);

// Check for new user signup and show resume prompt
document.addEventListener('DOMContentLoaded', async () => {
    const isNewUser = localStorage.getItem('newUserSignup');
    const hasResume = localStorage.getItem('userCVText');

    if (isNewUser === 'true') {
        const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
        const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
        const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

        const { data: { session } } = await supabaseClient.auth.getSession();

        if (session && !hasResume) {
            setTimeout(() => {
                const modal = document.getElementById('resumePromptModal');
                if (modal) {
                    let roleType = 'Industrial Trainees/Article Assistants/CA Freshers/Experienced CA/Semi Qualified CA';
                    const cachedProfile = localStorage.getItem('userProfileData');
                    let profile = null;
                    if (cachedProfile) {
                        try { profile = JSON.parse(cachedProfile); } catch (e) {}
                    }
                    const jobPref = localStorage.getItem('userJobPreference');
                    const lookingFor = profile?.looking_for;

                    if (jobPref === 'industrial' || lookingFor === 'CA Industrial Training Default') {
                        roleType = 'Industrial Trainees';
                    } else if (jobPref === 'articleship' || lookingFor === 'CA Articleship') {
                        roleType = 'Article Assistants';
                    } else if (jobPref === 'fresher_fresher') {
                        roleType = 'CA Freshers';
                    } else if (jobPref === 'fresher_experienced') {
                        roleType = 'Experienced CA';
                    } else if (lookingFor === 'CA Fresher') {
                        roleType = 'CA Freshers';
                    } else if (jobPref === 'semi_fresher' || jobPref === 'semi_experienced' || lookingFor === 'Semi Qualified CA') {
                        roleType = 'Semi Qualified CA';
                    } else {
                        const path = window.location.pathname;
                        if (path.includes('/articleship')) roleType = 'Article Assistants';
                        else if (path.toLowerCase().includes('/experienced-ca')) roleType = 'Experienced CA';
                        else if (path.includes('/fresher')) roleType = 'CA Freshers';
                        else if (path.includes('/semi-qualified')) roleType = 'Semi Qualified CA';
                        else roleType = 'Industrial Trainees';
                    }

                    const titleEl = document.getElementById('resumePromptTitle');
                    const descEl = document.getElementById('resumePromptDesc');
                    const roleTypeEl = document.getElementById('resumePromptRoleType');

                    if (titleEl) titleEl.textContent = 'Complete your MSC Profile';
                    if (roleTypeEl) {
                        roleTypeEl.textContent = roleType;
                    } else if (descEl) {
                        descEl.innerHTML = `Complete your MSC Profile and get discovered by 1000+ recruiters hiring for <strong>${roleType}</strong>.`;
                    }
                    modal.style.display = 'flex';
                }
            }, 1000);
        }

        localStorage.removeItem('newUserSignup');
        localStorage.removeItem('newUserEmail');
    }
});

document.getElementById('skipResumePrompt')?.addEventListener('click', () => {
    const modal = document.getElementById('resumePromptModal');
    if (modal) modal.style.display = 'none';
});

document.getElementById('resumePromptModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'resumePromptModal') {
        const modal = document.getElementById('resumePromptModal');
        if (modal) modal.style.display = 'none';
    }
});

// =================== DPDP CONSENT CHECK ===================
const DPDP_CONSENT_TEXT = 'I consent to My Student Club sharing my CV and profile details with registered companies and recruiters for job-matching purposes.';

async function checkAndPromptConsent() {
    if (!currentSession) return;
    const hasCV = localStorage.getItem('userCVText');
    if (!hasCV) return; // No CV uploaded, no consent needed

    try {
        const { data } = await supabaseClient
            .from('consentform')
            .select('cv_sharing_consent')
            .eq('user_id', currentSession.user.id)
            .maybeSingle();

        // If no record or consent is false/withdrawn, show prompt
        if (!data || !data.cv_sharing_consent) {
            const path = window.location.pathname;
            if (path === '/' || path === '/index.html' || path.includes('/articleship') || path.includes('/fresher') || path.includes('/semi-qualified') || path.includes('/experienced')) {
                setTimeout(() => {
                    const modal = document.getElementById('cvConsentPromptModal');
                    if (modal) modal.style.display = 'flex';
                }, 1500);
            }
        }
    } catch (e) {
        console.log('Consent check:', e);
    }
}

// Trigger consent check and register listeners after page loads
document.addEventListener('DOMContentLoaded', () => {
    // Consent Accept Button
    document.getElementById('cvConsentAcceptBtn')?.addEventListener('click', async () => {
        console.log("DEBUG: cvConsentAcceptBtn clicked!");
        document.getElementById('cvConsentPromptModal').style.display = 'none';
        showToast('Syncing your CV to cloud...', 'info');
        try {
            const syncSuccess = await checkAndSyncCVBackground();
            if (syncSuccess) {
                const now = new Date().toISOString();
                await supabaseClient.from('consentform').upsert({
                    user_id: currentSession.user.id,
                    cv_sharing_consent: true,
                    consent_text: DPDP_CONSENT_TEXT,
                    consented_at: now,
                    withdrawn_at: null,
                    user_agent: navigator.userAgent,
                    updated_at: now
                }, { onConflict: 'user_id' });

                showToast('Thank you! Your CV has been backed up and your consent has been recorded.', 'success');
            } else {
                showToast('CV backup sync failed. Please complete/update your profile to consent.', 'error', 8000);
            }
        } catch (e) {
            console.error('Failed to sync CV and save consent:', e);
            showToast('Could not save consent. Please try again from your profile.', 'error');
        }
    });

    // Consent Decline Button
    document.getElementById('cvConsentDeclineBtn')?.addEventListener('click', () => {
        document.getElementById('cvConsentPromptModal').style.display = 'none';
        window.location.href = '/profile.html';
    });

    setTimeout(() => checkAndPromptConsent(), 2000);
});

const JOB_PREFERENCE_KEY = 'userJobPreference';

// Map preference values to redirect URLs
const PREFERENCE_REDIRECT_MAP = {
    'industrial': '/',
    'articleship': '/ca-articleship-opportunities',
    'fresher_fresher': '/ca-fresher-jobs',
    'fresher_experienced': '/experienced-ca-jobs',
    'semi_fresher': '/semi-qualified-ca-jobs',
    'semi_experienced': '/semi-qualified-ca-jobs'
};

function getCurrentPagePreference() {
    const path = window.location.pathname;
    if (path.includes('/articleship')) return 'articleship';
    if (path.toLowerCase().includes('/experienced-ca')) return 'fresher_experienced';
    if (path.includes('/fresher')) return 'fresher_fresher';
    if (path.includes('/semi-qualified')) return state.experience === 'Experienced' ? 'semi_experienced' : 'semi_fresher';
    return 'industrial';
}

// Get saved job preference
function getJobPreference() {
    return localStorage.getItem(JOB_PREFERENCE_KEY);
}

// Save job preference
async function saveJobPreference(preference) {
    localStorage.setItem(JOB_PREFERENCE_KEY, preference);

    // Also save to Supabase profile if logged in
    if (currentSession?.user?.id) {
        try {
            const { data: existingProfile } = await supabaseClient
                .from('profiles')
                .select('profile')
                .eq('uuid', currentSession.user.id)
                .maybeSingle();

            const profileData = existingProfile?.profile || {};
            profileData.job_preference = preference;

            await supabaseClient.from('profiles').upsert({
                uuid: currentSession.user.id,
                profile: profileData,
                updated_at: new Date().toISOString()
            });
        } catch (e) {
            console.log('Could not save preference to profile:', e);
        }
    }
}

// Fetch and cache user profile data from Supabase on login
async function fetchAndCacheProfileData() {
    if (!currentSession?.user?.id) return null;

    try {
        const { data } = await supabaseClient
            .from('profiles')
            .select('profile, looking_for, articleship_1yr_end_date, ca_inter_attempt, ca_final_attempt, years_of_experience, ocr_cv')
            .eq('uuid', currentSession.user.id)
            .maybeSingle();

        if (data) {
            const profileObj = data.profile || {};
            console.log("DEBUG fetchAndCacheProfileData:", {
                ocr_cv_length: data.ocr_cv ? data.ocr_cv.length : null,
                profileObj_cv_cloud_synced: profileObj.cv_cloud_synced
            });
            if (data.ocr_cv) {
                localStorage.setItem('userCVText', data.ocr_cv);
                if (profileObj.cv_cloud_synced) {
                    console.log("DEBUG: Calling setCloudSyncFlag()");
                    setCloudSyncFlag();
                } else {
                    console.log("DEBUG: Calling clearCloudSyncFlag() because cv_cloud_synced is falsy");
                    clearCloudSyncFlag();
                }
            } else {
                console.log("DEBUG: Calling clearCloudSyncFlag() because ocr_cv is empty");
                clearCloudSyncFlag();
            }
            // Inject dedicated columns to local cached profile representation
            profileObj.looking_for = data.looking_for;
            profileObj.articleship_1yr_end_date = data.articleship_1yr_end_date;
            profileObj.ca_inter_attempt = data.ca_inter_attempt;
            profileObj.ca_final_attempt = data.ca_final_attempt;
            profileObj.years_of_experience = data.years_of_experience;

            localStorage.setItem('userProfileData', JSON.stringify(profileObj));

            if (profileObj.job_preference) {
                localStorage.setItem(JOB_PREFERENCE_KEY, profileObj.job_preference);
            }

            if (profileObj.notification_subscriptions && Array.isArray(profileObj.notification_subscriptions)) {
                localStorage.setItem('subscribedTopics', JSON.stringify(profileObj.notification_subscriptions));
                updateNotificationBadge();
            }

            renderProfileCompletionBanner();
            return profileObj;
        }
    } catch (e) {
        console.log('Could not fetch profile data:', e);
    }
    return null;
}

// Load job preference from profile if not in localStorage
async function loadJobPreferenceFromProfile() {
    if (getJobPreference()) return getJobPreference();

    if (currentSession?.user?.id) {
        try {
            const cachedProfile = localStorage.getItem('userProfileData');
            if (cachedProfile) {
                const profile = JSON.parse(cachedProfile);
                if (profile.job_preference) {
                    localStorage.setItem(JOB_PREFERENCE_KEY, profile.job_preference);
                    return profile.job_preference;
                }
            }

            const profile = await fetchAndCacheProfileData();
            if (profile?.job_preference) {
                return profile.job_preference;
            }
        } catch (e) {
            console.log('Could not load preference from profile:', e);
        }
    }
    return null;
}

// Redirect to preferred portal if not already on it
function redirectToPreferredPortal(preference) {
    const currentPref = getCurrentPagePreference();
    const targetUrl = PREFERENCE_REDIRECT_MAP[preference];

    if (currentPref === preference) return false;

    // Skip auto-redirect when running inside Flutter WebView app
    if (window.flutter_app?.isReady) {
        return false;
    }

    const referrer = document.referrer;
    if (referrer) {
        try {
            const referrerUrl = new URL(referrer);
            const currentHost = window.location.hostname;
            if (referrerUrl.hostname === currentHost) {
                return false;
            }
        } catch (e) {
            // Invalid referrer URL, continue with redirect logic
        }
    }

    // For fresher variants, check if we're on fresher page
    if ((preference === 'fresher_fresher' || preference === 'fresher_experienced') &&
        (currentPref === 'fresher_fresher' || currentPref === 'fresher_experienced')) {
        // We're on fresher page, just need to set experience filter
        if (preference === 'fresher_experienced') {
            state.experience = 'Experienced';
        } else {
            state.experience = 'Freshers';
        }
        syncFiltersUI();
        resetAndFetch();
        return false;
    }

    if ((preference === 'semi_fresher' || preference === 'semi_experienced') &&
        (currentPref === 'semi_fresher' || currentPref === 'semi_experienced')) {
        if (preference === 'semi_experienced') {
            state.experience = 'Experienced';
        } else {
            state.experience = 'Freshers';
        }
        syncFiltersUI();
        resetAndFetch();
        return false;
    }

    if (targetUrl) {
        window.location.href = targetUrl;
        return true;
    }
    return false;
}


function isCloudSynced() {
    return localStorage.getItem('cv_cloud_synced') === 'true' ||
        document.cookie.split(';').some(c => c.trim().startsWith('cv_cloud_synced=true'));
}

function setCloudSyncFlag() {
    localStorage.setItem('cv_cloud_synced', 'true');
    localStorage.setItem('cv_images_synced', 'true');
    document.cookie = "cv_cloud_synced=true; max-age=31536000; path=/";
}

function clearCloudSyncFlag() {
    localStorage.removeItem('cv_cloud_synced');
    localStorage.removeItem('cv_images_synced');
    document.cookie = "cv_cloud_synced=; Max-Age=0; path=/";
}

async function checkAndSyncCVBackground() {
    if (!currentSession) return false;

    // Check if we have cached CV data to sync
    const userCVImages = localStorage.getItem('userCVImages');
    let userCVText = localStorage.getItem('userCVText');

    console.log("DEBUG checkAndSyncCVBackground:", {
        userCVImages_exists: !!userCVImages,
        isCloudSynced: isCloudSynced()
    });

    // If we have local images but they haven't been successfully synced yet during this user's lifecycle,
    // we upload them regardless of general cloud synced status (since they could be missing in the bucket)
    if (userCVImages) {
        if (localStorage.getItem('cv_images_synced') === 'true') {
            return true; // Already synced this local file
        }
    } else {
        // No local images, fallback to checking general cloud sync
        if (isCloudSynced()) {
            console.log("DEBUG: checkAndSyncCVBackground returning true because isCloudSynced is true");
            return true;
        }
        console.log("DEBUG: checkAndSyncCVBackground returning false because isCloudSynced is false");
        return false; // Nothing to sync
    }

    try {
        console.log("Background Sync: Uploading cached CV to storer...");
        const images = JSON.parse(userCVImages);

        const payload = {
            user_id: currentSession.user.id,
            images: images,
            pdf_text: userCVText || ""
        };

        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            clearCloudSyncFlag();
            return false;
        }

        const data = await response.json();

        if (data.ok && data.response) {
            if (data.uploaded) {
                let finalOcrText = userCVText || "";
                if (data.ocr_text) {
                    finalOcrText = data.ocr_text;
                    localStorage.setItem('userCVText', finalOcrText);
                }

                // Get cached profile and update cv_cloud_synced
                const cachedProfile = localStorage.getItem('userProfileData');
                let profileObj = {};
                if (cachedProfile) {
                    try {
                        profileObj = JSON.parse(cachedProfile);
                    } catch (e) {}
                }
                profileObj.cv_cloud_synced = true;
                localStorage.setItem('userProfileData', JSON.stringify(profileObj));

                // Update Supabase
                await supabaseClient.from('profiles').upsert({
                    uuid: currentSession.user.id,
                    profile: profileObj,
                    ocr_cv: finalOcrText,
                    updated_at: new Date().toISOString()
                });

                setCloudSyncFlag();
                console.log("Background Sync: Complete.");
                return true;
            } else {
                console.error("Background Sync: Worker returned uploaded=false", data.storage_error);
                clearCloudSyncFlag();
                return false;
            }
        } else {
            clearCloudSyncFlag();
            return false;
        }
    } catch (e) {
        console.error("Background Sync Failed:", e);
        clearCloudSyncFlag();
        return false;
    }
}


// Skip button handler - set industrial as default and redirect


// Check and handle job preference on page load
document.addEventListener('DOMContentLoaded', async () => {
    setTimeout(async () => {
        const preference = await loadJobPreferenceFromProfile();

        if (currentSession && preference) {
            if (preference === 'fresher_experienced' && currentTable === 'Fresher Jobs') {
                state.experience = 'Experienced';
                syncFiltersUI();
            } else if (preference === 'fresher_fresher' && currentTable === 'Fresher Jobs') {
                state.experience = 'Freshers';
                syncFiltersUI();
            } else if (preference === 'semi_experienced' && currentTable === 'Semi Qualified Jobs') {
                state.experience = 'Experienced';
                syncFiltersUI();
            } else if (preference === 'semi_fresher' && currentTable === 'Semi Qualified Jobs') {
                state.experience = 'Freshers';
                syncFiltersUI();
            }

            // redirectToPreferredPortal(preference);
        }

        initOnboardingSegmentForm();
    }, 500);
});

// ==========================================
// ONBOARDING QUESTIONNAIRE SEGMENT MODAL
// ==========================================

// Show Onboarding Segment Modal with premium transition
function showOnboardingSegmentModal() {
    const modal = document.getElementById('onboardingSegmentModal');
    if (modal) {
        modal.style.display = 'flex';
        // Trigger reflow for animation
        modal.offsetHeight;
        modal.classList.add('show-modal');
    }
}

// Hide Onboarding Segment Modal with premium transition
function hideOnboardingSegmentModal() {
    const modal = document.getElementById('onboardingSegmentModal');
    if (modal) {
        modal.classList.remove('show-modal');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 400);
    }
}

// Initialize Onboarding Segment form and interactive elements
function initOnboardingSegmentForm() {
    const form = document.getElementById('onboardingSegmentForm');
    if (!form) return;

    const cards = document.querySelectorAll('.onboarding-option-card');
    const selectedInput = document.getElementById('selectedLookingFor');

    const fields = {
        'CA Industrial Training Default': { element: document.getElementById('field-industrial') },
        'CA Articleship':                 { element: document.getElementById('field-articleship') },
        'CA Fresher':                     { element: document.getElementById('field-fresher') },
        'Semi Qualified CA':              { element: document.getElementById('field-semi') }
    };

    function setFieldActive(key, isActive) {
        const { element } = fields[key];
        if (!element) return;
        element.classList.toggle('active', isActive);
        element.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), select').forEach(el => {
            el.disabled = !isActive;
        });
    }

    // Initialise state
    const defaultVal = selectedInput.value;
    Object.keys(fields).forEach(key => setFieldActive(key, key === defaultVal));

    // Card Selection Click Handlers
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const value = card.getAttribute('data-value');
            if (!value) return;
            cards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedInput.value = value;
            Object.keys(fields).forEach(key => setFieldActive(key, key === value));
        });
    });

    // Sync month+year selects → hidden attempt inputs
    function syncAttempt(monthId, yearId, clearedId, hiddenId, pickerRowId) {
        const monthEl  = document.getElementById(monthId);
        const yearEl   = document.getElementById(yearId);
        const clearedEl = document.getElementById(clearedId);
        const hiddenEl = document.getElementById(hiddenId);
        const rowEl    = document.getElementById(pickerRowId);
        if (!monthEl || !yearEl || !clearedEl || !hiddenEl) return;

        function update() {
            if (clearedEl.checked) {
                hiddenEl.value = clearedId === 'ca_inter_cleared' ? 'Cleared Both Groups' : 'Cleared';
                rowEl.classList.add('cleared-active');
            } else {
                rowEl.classList.remove('cleared-active');
                hiddenEl.value = (monthEl.value && yearEl.value) ? `${monthEl.value} ${yearEl.value}` : '';
            }
        }

        monthEl.addEventListener('change', update);
        yearEl.addEventListener('change', update);
        clearedEl.addEventListener('change', update);
    }

    syncAttempt('ca_final_attempt_month', 'ca_final_attempt_year', 'ca_final_cleared', 'ca_final_attempt', 'final-attempt-picker');

    // Date input validation helpers
    const dateInput = document.getElementById('articleship_1yr_end_date');

    function daysInMonth(month, year) {
        return new Date(year, month, 0).getDate();
    }

    function validateDateParts(d, m, y) {
        if (m < 1 || m > 12) return 'Month must be between 01 and 12.';
        if (d < 1 || d > daysInMonth(m, y)) return `Day must be between 01 and ${daysInMonth(m, y)} for that month.`;
        if (y < 2000 || y > 2100) return 'Year must be between 2000 and 2100.';
        return null;
    }

    if (dateInput) {
        dateInput.addEventListener('change', () => dateInput.setCustomValidity(''));
    }

    // Form submission sync to database
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentSession?.user?.id) {
            hideOnboardingSegmentModal();
            return;
        }

        const lookingFor = selectedInput.value;
        // type="date" value is YYYY-MM-DD or empty
        const articleshipDateRaw = document.getElementById('articleship_1yr_end_date').value;

        if (lookingFor === 'CA Industrial Training Default') {
            if (!articleshipDateRaw) {
                dateInput.setCustomValidity('Please select a date.');
                dateInput.reportValidity();
                dateInput.addEventListener('change', () => dateInput.setCustomValidity(''), { once: true });
                return;
            }
            const [yyyy, mm, dd] = articleshipDateRaw.split('-').map(Number);
            const dateErr = validateDateParts(dd, mm, yyyy);
            if (dateErr) {
                dateInput.setCustomValidity(dateErr);
                dateInput.reportValidity();
                dateInput.addEventListener('change', () => dateInput.setCustomValidity(''), { once: true });
                return;
            }
        }

        // Keep as YYYY-MM-DD for the database
        const articleshipDate = articleshipDateRaw || '';

        const earliestJoiningRaw = document.getElementById('articleship_earliest_joining')?.value || '';
        if (lookingFor === 'CA Articleship') {
            const joiningEl = document.getElementById('articleship_earliest_joining');
            if (!earliestJoiningRaw) {
                joiningEl.setCustomValidity('Please select your earliest joining date.');
                joiningEl.reportValidity();
                joiningEl.addEventListener('change', () => joiningEl.setCustomValidity(''), { once: true });
                return;
            }
            const [yyyy, mm, dd] = earliestJoiningRaw.split('-').map(Number);
            const joiningErr = validateDateParts(dd, mm, yyyy);
            if (joiningErr) {
                joiningEl.setCustomValidity(joiningErr);
                joiningEl.reportValidity();
                joiningEl.addEventListener('change', () => joiningEl.setCustomValidity(''), { once: true });
                return;
            }
        }

        const caFinalAttempt = document.getElementById('ca_final_attempt').value;
        const yearsOfExp = document.getElementById('years_of_experience').value;

        if (lookingFor === 'CA Fresher' && !caFinalAttempt) {
            const monthEl = document.getElementById('ca_final_attempt_month');
            monthEl.setCustomValidity('Please select both month and year, or tick Already Cleared.');
            monthEl.reportValidity();
            monthEl.addEventListener('change', () => monthEl.setCustomValidity(''), { once: true });
            return;
        }

        // Fetch current profile JSONB so we can merge without overwriting other fields
        const { data: existingRow } = await supabaseClient
            .from('profiles')
            .select('profile')
            .eq('uuid', currentSession.user.id)
            .maybeSingle();
        const mergedProfile = existingRow?.profile || {};
        if (lookingFor === 'CA Articleship') mergedProfile.articleship_earliest_joining_date = earliestJoiningRaw;
        if (lookingFor === 'CA Fresher') mergedProfile.fresher_years_of_experience = document.getElementById('fresher_years_of_experience').value;

        // Construct update object
        const updateData = {
            looking_for: lookingFor,
            articleship_1yr_end_date: lookingFor === 'CA Industrial Training Default' ? (articleshipDate || null) : null,
            ca_inter_attempt: null,
            ca_final_attempt: lookingFor === 'CA Fresher' ? (caFinalAttempt || null) : null,
            years_of_experience: lookingFor === 'Semi Qualified CA' ? (yearsOfExp || null) : null,
            profile: mergedProfile,
            updated_at: new Date().toISOString()
        };

        const submitBtn = form.querySelector('.onboarding-submit-btn');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Saving preferences...</span><i class="fas fa-spinner fa-spin"></i>';

        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update(updateData)
                .eq('uuid', currentSession.user.id);

            if (error) throw error;

            // Sync with local cached object in localStorage
            const cached = localStorage.getItem('userProfileData');
            let profileObj = {};
            if (cached) {
                try { profileObj = JSON.parse(cached); } catch (_) {}
            }
            
            // Merge properties locally
            Object.assign(profileObj, updateData);
            localStorage.setItem('userProfileData', JSON.stringify(profileObj));

            // Hide the modal beautifully
            hideOnboardingSegmentModal();

            // Notify user
            if (typeof showToast === 'function') {
                showToast("Personalization complete! Enjoy your personalized feed.", "success");
            }

            // Map and trigger portal redirect for seamless preference alignment
            let prefMapping = {
                'CA Industrial Training Default': 'industrial',
                'CA Articleship': 'articleship',
                'CA Fresher': 'fresher_fresher',
                'Semi Qualified CA': 'semi_fresher'
            };
            const mappedPref = prefMapping[lookingFor];
            if (mappedPref) {
                await saveJobPreference(mappedPref);
                setTimeout(() => {
                    redirectToPreferredPortal(mappedPref);
                }, 1000);
            }

        } catch (err) {
            console.error("Failed to submit onboarding answers:", err);
            if (typeof showToast === 'function') {
                showToast("Failed to save preferences. Please try again.", "error");
            } else {
                alert("Failed to save preferences. Please try again.");
            }
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });
}

function calculateProfileCompletion() {
    const cachedProfile = localStorage.getItem('userProfileData');
    const hasResume = localStorage.getItem('userCVText') || localStorage.getItem('userCVPdf');
    
    let profile = null;
    if (cachedProfile) {
        try { profile = JSON.parse(cachedProfile); } catch (e) {}
    }

    if (!currentSession) return 0;
    if (!profile && !hasResume) return 10;

    let score = 0;
    
    if (hasResume) {
        score += 40;
    }

    if (profile) {
        if (profile.full_name || profile.name) score += 10;
        if (profile.mobile || profile.phone || profile.phone_number) score += 10;
        if (profile.city || profile.location) score += 10;
    }

    if (profile && (profile.looking_for || profile.job_preference)) {
        score += 15;
    }

    if (profile && (profile.key_skills || profile.skills || profile.emp_skills_hidden)) {
        score += 15;
    }

    return Math.min(100, score);
}

function renderProfileCompletionBanner() {
    const existing = document.getElementById('profile-completion-banner');
    if (existing) existing.remove();

    const percent = currentSession ? calculateProfileCompletion() : 0;
    
    if (percent === 100) {
        document.body.classList.remove('with-completion-banner');
        document.body.style.paddingTop = '';
        const header = document.querySelector('.site-header, .floating-header');
        if (header) header.style.top = '';
        return;
    }

    const banner = document.createElement('div');
    banner.id = 'profile-completion-banner';
    banner.className = 'profile-completion-banner';
    banner.style.display = 'flex';

    banner.innerHTML = `
        <div class="banner-text">
            <span>🎯 Complete your Profile<span class="banner-desc"> to get 5x higher interview opportunities</span>.</span>
            <span class="completion-badge">Profile Completion: ${percent}%</span>
        </div>
        <a href="/profile.html" class="banner-btn">Complete Profile</a>
    `;

    document.body.insertBefore(banner, document.body.firstChild);
    document.body.classList.add('with-completion-banner');

    setTimeout(() => {
        const bannerHeight = banner.offsetHeight;
        document.body.style.paddingTop = (70 + bannerHeight) + 'px';
        const header = document.querySelector('.site-header, .floating-header');
        if (header) {
            header.style.top = bannerHeight + 'px';
        }
    }, 50);
}

