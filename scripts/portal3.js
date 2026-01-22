import { getDaysAgo } from './date-utils.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

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
    applicationStatus: 'all'
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
    return path.includes('/experienced-ca');
}

function isFresherPortal() {
    const path = window.location.pathname.toLowerCase();
    return path.includes('/fresher');
}

function setActivePortalTab() {
    const path = window.location.pathname;
    document.querySelectorAll('.portal-nav-bar .footer-tab, .site-footer-nav .footer-tab').forEach(tab => tab.classList.remove('active'));

    let activeSelector;
    const experienceFilterGroups = document.querySelectorAll('.experience-filter-group');

    experienceFilterGroups.forEach(el => el.style.display = 'none');

    if (path.includes('/articleship')) {
        currentTable = 'Articleship Jobs';
        activeSelector = 'a[href="/articleship.html"]';
    } else if (path.includes('/semi-qualified')) {
        currentTable = 'Semi Qualified Jobs';
        activeSelector = 'a[href="/semi-qualified.html"]';
        experienceFilterGroups.forEach(el => el.style.display = 'block');
    } else if (path.toLowerCase().includes('/experienced-ca')) {
        currentTable = 'Fresher Jobs';
        activeSelector = 'a[href="/experienced-ca.html"]';
        state.experience = 'Experienced';
        experienceFilterGroups.forEach(el => el.style.display = 'none');
    } else if (path.includes('/fresher')) {
        currentTable = 'Fresher Jobs';
        activeSelector = 'a[href="/fresher.html"]';
        state.experience = 'Freshers';
        experienceFilterGroups.forEach(el => el.style.display = 'none');
    } else {
        currentTable = 'Industrial Training Job Portal';
        activeSelector = 'a[href="/"]';
    }

    document.querySelectorAll(activeSelector).forEach(el => el.classList.add('active'));

    // Update cache when table changes (categories are table-specific)
    if (allLocations.length > 0 || Object.keys(allCategories).length > 0) {
        updateFilterCache();
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
    const buttonText = isApplied ? 'Applied' : 'View Details';
    const buttonClass = isApplied ? 'applied' : '';
    const applyLink = getApplicationLink(job['Application ID']);
    const applyButtonText = isApplied ? 'Applied' : 'Apply Now';

    jobCard.innerHTML = `
        <div class="job-card-logo">${companyInitial}</div>
        <div class="job-card-details">
            <div class="job-card-header">
                <h3 class="job-card-company">${job.Company || 'N/A'}</h3>
                <p class="job-card-posted">Posted ${postedDate}</p>
            </div>
                <span class="job-tag">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    ${job.Location || 'N/A'}
                </span>
                ${job.Salary ? `<span class="job-tag"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>₹${job.Salary}</span>` : ''}
                ${job.Category ? `<span class="job-tag">${job.Category}</span>` : ''}
            </div>
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

function showModal(job) {
    const companyName = (job.Company || '').trim();
    const companyInitial = companyName ? companyName.charAt(0).toUpperCase() : '?';
    const postedDate = job.Created_At ? getDaysAgo(job.Created_At) : 'N/A';
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

    let actionsHtml = '';
    if (isMailto) {
        const simpleApplyText = isApplied ? 'Applied' : 'Simple Apply';
        const aiApplyText = isApplied ? 'Applied' : 'AI Powered Apply';
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
        actionsHtml += `
            <div style="display: flex; gap: 0.75rem; margin-top: 0.75rem; flex-wrap: wrap;">
                <a href="${connectLink}" target="_blank" class="btn btn-secondary" style="flex: 1; min-width: calc(50% - 0.375rem); padding: 0.1rem 1rem; min-height: 2rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    <i class="fab fa-linkedin"></i>
                    Connect to Peers
                </a>
                <button id="modalShareBtnInline" class="btn btn-secondary" style="flex: 1; min-width: calc(50% - 0.375rem); padding: 0.1rem 1rem; min-height: 2rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    <i class="fas fa-share-alt"></i>
                    Share this job
                </button>
            </div>`;
    } else {
        const applyText = isApplied ? 'Applied' : 'Apply Now';
        actionsHtml = `
            <a href="${applyLink}" id="modalExternalApplyBtn" class="btn btn-primary ${buttonClass}" target="_blank" style="padding: 0.5rem 1rem; min-height: 3rem; display: flex; align-items: center; justify-content: center;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                ${applyText}
            </a>`;
        actionsHtml += `
            <div style="display: flex; gap: 0.75rem; margin-top: 0.75rem; flex-wrap: wrap;">
                <a href="${connectLink}" target="_blank" class="btn btn-secondary" style="flex: 1; min-width: calc(50% - 0.375rem); padding: 0.1rem 1rem; min-height: 2rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    <i class="fab fa-linkedin"></i>
                    Connect to Peers
                </a>
                <button id="modalShareBtnInline" class="btn btn-secondary" style="flex: 1; min-width: calc(50% - 0.375rem); padding: 0.1rem 1rem; min-height: 2rem; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
                    <i class="fas fa-share-alt"></i>
                    Share this job
                </button>
            </div>`;
    }

    dom.modalBody.innerHTML = `
        <div class="modal-header">
            <div class="modal-logo">${companyInitial}</div>
            <div class="modal-title-group">
                <h2>${job.Company}</h2>
                <p>${job.Location}</p>
            </div>
        </div>
        <div class="modal-meta-tags">
            ${job.Salary ? `<span class="job-tag">${(currentTable === 'Semi Qualified Jobs' || currentTable === 'Fresher Jobs') ? 'Salary' : 'Stipend'}: ₹${job.Salary}</span>` : ''}
            <span class="job-tag">Posted: ${postedDate}</span>
            ${job.Category ? `<span class="job-tag">Category: ${job.Category}</span>` : ''}
        </div>
        <div class="modal-actions" style="display: flex; flex-direction: column; gap: 0;">${actionsHtml}</div>
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
        document.getElementById('modalSimpleApplyBtn').addEventListener('click', (e) => handleApplyClick(job, e.currentTarget, false));
        document.getElementById('modalAiApplyBtn').addEventListener('click', (e) => handleApplyClick(job, e.currentTarget, true));
    } else {
        document.getElementById('modalExternalApplyBtn').addEventListener('click', (e) => handleApplyClick(job, e.currentTarget));
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
        let selectColumns = 'id, Company, Location, Salary, Description, Created_At, Category, "Application ID"';
        if (currentTable === "Fresher Jobs" || currentTable === "Semi Qualified Jobs") {
            selectColumns += ', Experience';
        }

        let query = supabaseClient.from(currentTable).select(selectColumns);

        // Optimize keyword query building - pre-process terms once
        if (state.keywords.length > 0) {
            const keywordOrs = [];
            for (let i = 0; i < state.keywords.length; i++) {
                // wildcard matching for spaces to find "PhonePe" from "Phone Pe"
                const flexibleTerm = state.keywords[i].trim().replace(/\s+/g, '%');
                keywordOrs.push(
                    `Company.ilike."%${flexibleTerm}%",Description.ilike."%${flexibleTerm}%",Category.ilike."%${flexibleTerm}%",Location.ilike."%${flexibleTerm}%"`
                );
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
                categoryOr.push(`Category.ilike."%${state.categories[i]}%"`);
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

        if (state.applicationStatus === 'not_applied' && currentSession && appliedJobIds.size > 0) {
            // Supabase requires parenthesized tuple format for 'in' operator: (1,2,3)
            const appliedIds = Array.from(appliedJobIds);
            const tupleString = `(${appliedIds.join(',')})`;
            query = query.not('id', 'in', tupleString);
        }

        const [sortCol, sortDir] = state.sortBy.split('_');
        const isAsc = sortDir === 'asc';
        query = query.order(sortCol === 'newest' ? 'Created_At' : 'Salary', {
            ascending: isAsc,
            nullsFirst: false
        }).order('id', { ascending: false });

        query = query.range(page * limit, (page + 1) * limit - 1);
        const { data, error } = await query;

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
            dom.jobsContainer.innerHTML = `<p class="no-jobs-found" style="color:red;">Failed to load jobs: ${error.message}</p>`;
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
        { value: '0-5000', text: 'Below ₹5k' },
        { value: '5000-10000', text: '₹5k - ₹10k' },
        { value: '10000-15000', text: '₹10k - ₹15k' },
        { value: '15000+', text: '₹15k+' }
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
        { value: '0-1200000', text: '< 12 LPA' },
        { value: '1200000-1800000', text: '12-18 LPA' },
        { value: '1800000+', text: '> 18 LPA' }
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

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;

    // If logged in, fetch and cache profile data
    if (session?.user?.id) {
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
        // Try to get name from stored profile data
        let displayName = email;
        try {
            const profileData = JSON.parse(localStorage.getItem('userProfileData') || '{}');
            if (profileData.name && profileData.name.trim()) {
                displayName = profileData.name.trim();
            }
        } catch (e) {
            // Fall back to email if profile data parsing fails
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
}

function isProfileComplete() {
    try {
        const images = JSON.parse(localStorage.getItem('userCVImages') || '[]');
        return Array.isArray(images) && images.length > 0;
    } catch (e) {
        return false;
    }
}

async function handleApplyClick(job, buttonElement, isAiApply = false) {

    markJobAsApplied(job);

    if (isAiApply) {
        if (!currentSession) { window.location.href = '/login.html'; return; }
        if (!isProfileComplete()) {
            const fallbackBody = generateFallbackEmail(job);
            openMailtoLink(constructMailto(job, fallbackBody));
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
            const textEl = btn.querySelector('span') || btn.querySelector('.btn-text') || btn;
            if (textEl) textEl.textContent = 'Applied';
        }
    });

    // Update job card buttons
    const card = document.querySelector(`.job-card[data-job-id='${job.id}']`);
    if (card) {
        // Update primary Apply Now button only
        const applyBtn = card.querySelector('.apply-now-card-btn.primary');
        if (applyBtn) {
            applyBtn.classList.add('applied');
            applyBtn.textContent = 'Applied';
        }
    }

    try {
        const { error } = await supabaseClient
            .from('job_applications')
            .insert({ user_id: currentSession.user.id, job_id: job.id, job_table: currentTable });
        if (error) throw error;
    } catch (error) {
        console.error('Failed to save application status:', error);
    }
}

async function generateEmailBody(profileData, cvImages, job) {
    const workerUrl = 'https://emailgenerator.bhansalimanan55.workers.dev/';
    try {
        const response = await fetch(workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                images: cvImages,
                profile_data: profileData,
                job_details: {
                    company_name: job.Company,
                    job_description: job.Description,
                    job_location: job.Location,
                    job_title: JOB_TITLE_MAP[currentTable] || 'the role'
                }
            })
        });
        if (!response.ok) throw new Error(`AI worker responded with status: ${response.status}`);
        const data = await response.json();
        return data.email_body || "";
    } catch (error) {
        console.error('generateEmailBody error:', error);
        return "";
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

function generateFallbackEmail(job) {
    return `Dear Hiring Manager,

I am writing to express my interest in the ${job.Category || 'Articleship'} position at ${job.Company}.

With my academic background and passion for the field, I am confident that I would be a valuable addition to your team.

I have attached my resume for your review. I would welcome the opportunity to discuss how my skills can contribute to your organization's success.

Thank you for considering my application.

Best regards,
[Your Name]

---
Application submitted via My Student Club`;
}

async function loadBanners() {
    const carousel = document.querySelector('.carousel');
    const bannerSection = document.querySelector('.banner-section');
    if (!carousel || !bannerSection) return;
    try {
        const { data, error } = await supabaseClient.from('Banners').select('Image, Hyperlink, Type');
        if (error) throw error;
        const banners = data;
        carousel.innerHTML = '';
        const currentType = currentTable === "Semi Qualified Jobs" ? "Semi-Qualified" : currentTable === "Fresher Jobs" ? "Freshers" : currentTable.split(' ')[0];
        const relevantBanners = banners.filter(b => b.Type === 'All' || b.Type === currentType);

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
                .single();

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
function populateNotificationDropdowns() { if (dom.locationSelectEl) { dom.locationSelectEl.innerHTML = '<option value="" disabled selected>Select Location</option>'; LOCATIONS_NOTIF.sort().forEach(loc => { const opt = document.createElement('option'); opt.value = loc; opt.textContent = loc.charAt(0).toUpperCase() + loc.slice(1); dom.locationSelectEl.appendChild(opt); }); } if (dom.jobTypeSelectEl) { dom.jobTypeSelectEl.innerHTML = '<option value="" disabled selected>Select Job Type</option>'; JOB_TYPES_NOTIF.forEach(type => { const opt = document.createElement('option'); opt.value = type.value; opt.textContent = type.label; dom.jobTypeSelectEl.appendChild(opt); }); } }

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
            .select('job_id')
            .eq('user_id', currentSession.user.id)
            .eq('job_table', currentTable);
        if (error) throw error;
        appliedJobIds = new Set(data.map(app => app.job_id));
    } catch (error) {
        console.error('Error fetching applied jobs:', error);
    }
}

function setupEventListeners() {
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
    if (dom.subscribeBtnEl) dom.subscribeBtnEl.addEventListener('click', async () => { const location = dom.locationSelectEl.value; const jobType = dom.jobTypeSelectEl.value; if (!location || !jobType) return; const topicName = `${location}-${jobType}`; if (await subscribeToTopic(topicName)) { dom.locationSelectEl.selectedIndex = 0; dom.jobTypeSelectEl.selectedIndex = 0; dom.subscribeBtnEl.disabled = true; } });
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
            resourcesDropdown.classList.toggle('active');
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
        if (resourcesDropdown && resourcesDropdown.classList.contains('active') && !resourcesDropdown.contains(e.target) && !resourcesBtn.contains(e.target)) {
            resourcesDropdown.classList.remove('active');
            if (resourcesBtn.querySelector('.dropdown-icon')) resourcesBtn.querySelector('.dropdown-icon').classList.remove('open');
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
    const selectorIds = ['sortBySelect', 'salaryFilterDesktop', 'sortBySelectMobile', 'salaryFilterMobile', 'locationSelect', 'jobTypeSelect'];

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
    dom.locationPillsDesktop = document.getElementById('locationPillsDesktop');
    dom.categoryPillsDesktop = document.getElementById('categoryPillsDesktop');
    dom.desktopResetBtn = document.getElementById('desktopResetBtn');
    dom.openFilterModalBtn = document.getElementById('open-filter-modal-btn');
    dom.filterModalOverlay = document.getElementById('filterModalOverlay');
    dom.closeFilterModalBtn = document.getElementById('closeFilterModalBtn');
    dom.applyFiltersBtn = document.getElementById('applyFiltersBtn');
    dom.mobileResetBtn = document.getElementById('mobileResetBtn');
    dom.salaryFilterMobile = document.getElementById('salaryFilterMobile');
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

    if (!session) {
        let visitCount = parseInt(localStorage.getItem('portalVisitCount') || '0');
        visitCount++;
        localStorage.setItem('portalVisitCount', visitCount.toString());
        if (visitCount >= 5) {
            document.getElementById('loginPromptOverlay').style.display = 'flex';
            const layout = document.querySelector('.job-portal-layout');
            if (layout) layout.style.display = 'none';
            return;
        }
    } else {
        localStorage.removeItem('portalVisitCount');
        await initializeUserFeatures();
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
                document.getElementById('resumePromptModal').style.display = 'flex';
            }, 1000);
        }

        localStorage.removeItem('newUserSignup');
        localStorage.removeItem('newUserEmail');
    }
});

document.getElementById('skipResumePrompt')?.addEventListener('click', () => {
    document.getElementById('resumePromptModal').style.display = 'none';
});

document.getElementById('resumePromptModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'resumePromptModal') {
        document.getElementById('resumePromptModal').style.display = 'none';
    }
});

const JOB_PREFERENCE_KEY = 'userJobPreference';

// Map preference values to redirect URLs
const PREFERENCE_REDIRECT_MAP = {
    'industrial': '/',
    'articleship': '/articleship.html',
    'fresher_fresher': '/fresher.html',
    'fresher_experienced': '/experienced-ca.html',
    'semi_fresher': '/semi-qualified.html',
    'semi_experienced': '/semi-qualified.html'
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
                .single();

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
            .select('profile')
            .eq('uuid', currentSession.user.id)
            .single();

        if (data?.profile) {
            localStorage.setItem('userProfileData', JSON.stringify(data.profile));

            if (data.profile.job_preference) {
                localStorage.setItem(JOB_PREFERENCE_KEY, data.profile.job_preference);
            }

            if (data.profile.notification_subscriptions && Array.isArray(data.profile.notification_subscriptions)) {
                localStorage.setItem('subscribedTopics', JSON.stringify(data.profile.notification_subscriptions));
                updateNotificationBadge();
            }

            return data.profile;
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

    const hasNavigatedInSession = sessionStorage.getItem('msc_session_active');
    
    if (hasNavigatedInSession) {
        return false;
    }
    
    sessionStorage.setItem('msc_session_active', 'true');

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

// Show job preference modal
function showJobPreferenceModal() {
    const modal = document.getElementById('jobPreferenceModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

// Hide job preference modal
function hideJobPreferenceModal() {
    const modal = document.getElementById('jobPreferenceModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Initialize preference modal event listeners
function initJobPreferenceModal() {
    const preferenceOptions = document.querySelectorAll('.pref-option-btn');

    preferenceOptions.forEach(btn => {
        btn.addEventListener('click', async () => {
            const preference = btn.dataset.preference;
            if (!preference) return;

            preferenceOptions.forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');

            await saveJobPreference(preference);

            setTimeout(() => {
                hideJobPreferenceModal();

                if (preference === 'fresher_experienced' || preference === 'semi_experienced') {
                    state.experience = 'Experienced';
                } else if (preference === 'fresher_fresher' || preference === 'semi_fresher') {
                    state.experience = 'Freshers';
                }

                // Redirect to preferred portal
                if (!redirectToPreferredPortal(preference)) {
                    syncFiltersUI();
                    resetAndFetch();
                }
            }, 200);
        });
    });

    // Skip button handler - set industrial as default and redirect
    const skipBtn = document.getElementById('skipPreferenceBtn');
    if (skipBtn) {
        skipBtn.addEventListener('click', async () => {
            await saveJobPreference('industrial');
            hideJobPreferenceModal();

            const path = window.location.pathname;
            if (path !== '/' && path !== '/index.html') {
                window.location.href = '/';
            }
        });
    }

    // Close modal on background click
    const modal = document.getElementById('jobPreferenceModal');
    if (modal) {
        modal.addEventListener('click', (e) => {
            // Don't close on background click - user must select an option
        });
    }
}

// Check and handle job preference on page load
document.addEventListener('DOMContentLoaded', async () => {
    setTimeout(async () => {
        const preference = await loadJobPreferenceFromProfile();

        if (currentSession && !preference) {
            const path = window.location.pathname;
            if (path === '/' || path === '/index.html' ||
                path.includes('/articleship') || path.includes('/fresher') ||
                path.includes('/semi-qualified')) {
                showJobPreferenceModal();
            }
        } else if (currentSession && preference) {
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

            redirectToPreferredPortal(preference);
        }

        // Initialize modal event listeners
        initJobPreferenceModal();
    }, 500);
});