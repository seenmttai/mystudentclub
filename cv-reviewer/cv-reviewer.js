import { createClient } from '@supabase/supabase-js';
// Using markdown-pdfjs(Created by Manan Bhansali, which is me :-) ) for PDF generation. 

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.7.107/build/pdf.worker.min.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';

let userId = null;
let supabase = null;
let authUser = null;
let isMscitEnrolled = false;
let isPremiumEnrolled = false;   // any enrollment row → unlimited reviews

const landingSection = document.getElementById('landingSection');
const heroSection = document.getElementById('heroSection');
const uploadSection = document.getElementById('uploadSection');
const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const browseButton = document.getElementById('browseButton');
const previewArea = document.getElementById('previewArea');
const previewThumbnail = document.getElementById('previewThumbnail');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFileBtn');
const proceedToReviewBtn = document.getElementById('proceedToReviewBtn');
//const domainSpecializationSection = document.getElementById('domainSpecializationSection');
//const backToUploadBtn = document.getElementById('backToUploadBtn');
//const domainSelect = document.getElementById('domainSelect');
//const specializationSelect = document.getElementById('specializationSelect');
//const analyzeBtn = document.getElementById('analyzeBtn');
const loadingSection = document.getElementById('loadingSection');
const loadingProgressText = document.getElementById('loadingProgressText');
const resultsSection = document.getElementById('resultsSection');
const headerPageTitle = document.getElementById('headerPageTitle');
const downloadReportBtn = document.getElementById('downloadReportBtn');
const startOverBtn = document.getElementById('startOverBtn');
const scoreText = document.getElementById('scoreText');
const scoreProgress = document.getElementById('scoreProgress');
const scoreJustification = document.getElementById('scoreJustification');
const tipsSection = document.getElementById('tipsSection');
const categoryItems = document.querySelectorAll('.category-item');
const recruiterTipsContent = document.querySelector('#recruiterTipsSection .content-area');
const measurableResultsContent = document.querySelector('#measurableResultsSection .content-area');

function showHeaderTitle() {
  if (headerPageTitle) headerPageTitle.style.display = 'flex';
}
function hideHeaderTitle() {
  if (headerPageTitle) headerPageTitle.style.display = 'none';
}
function showResults() {
  resultsSection.style.display = 'block';
  showHeaderTitle();
}
function hideResults() {
  resultsSection.style.display = 'none';
  hideHeaderTitle();
}
const phrasesSuggestionsContent = document.querySelector('#phrasesSuggestionsSection .content-area');
const hardSkillsContent = document.querySelector('#hardSkillsSection .content-area');
const softSkillsContent = document.querySelector('#softSkillsSection .content-area');
const actionVerbsContent = document.querySelector('#actionVerbsSection .content-area');
const grammarCheckContent = document.querySelector('#grammarCheckSection .content-area');
const formattingContent = document.querySelector('#formattingSection .content-area');
const educationContent = document.querySelector('#educationSection .content-area');
const articleshipContent = document.querySelector('#articleshipSection .content-area');
const finalRecommendationsContent = document.querySelector('#finalRecommendationsSection .content-area');
const interviewQuestionsContent = document.querySelector('#interviewQuestionsSection .content-area');
const menuButton = document.getElementById('menuButton');
const expandedMenu = document.getElementById('expandedMenu');
const menuCloseBtn = document.getElementById('menuCloseBtn');

const pdfPreviewModal = document.getElementById('pdfPreviewModal');
const pdfPreviewContainer = document.getElementById('pdfPreviewContainer');
const pdfPreviewCloseBtn = document.getElementById('pdfPreviewCloseBtn');
const pdfPreviewDownloadBtn = document.getElementById('pdfPreviewDownloadBtn');

let selectedFile = null;
let pdfDocument = null;
let pdfImages = [];
let analysisResultText = null;
let currentProgressInterval = null;

// --- Persistence state ---
const ACTIVE_REVIEW_KEY = 'msc_cv_active_review_id';
const ENROLL_URL = '/learning-management-system/';


// Courses offered in the "buy to unlock" popup (mirrors the CV Builder paywall).
const PREMIUM_COURSES = [
    {
        title: 'MSC Industrial Training Program',
        desc: 'Master industrial training requirements for CA candidates with real-world case studies.',
        url: 'https://www.mystudentclub.com/ca-industrial-training-program/'
    },
    {
        title: 'MSC CA Freshers Program',
        desc: 'A comprehensive program for CA freshers to kickstart their career.',
        url: 'https://www.mystudentclub.com/ca-industrial-training-program/'
    }
];

let activeReviewFileName = null;       // used for PDF filename after restore/history load
let historyReviews = [];               // latest fetched history rows (for click reload)
const downloadBtnDefaultHTML = downloadReportBtn ? downloadReportBtn.innerHTML : '';

// Sections gated for non-premium free users.
// Score, Recruiter Tips, Education and Articleship stay visible.
const LOCKED_SECTION_IDS = [
    'phrasesSuggestionsSection',
    'hardSkillsSection',
    'softSkillsSection',
    'actionVerbsSection',
    'grammarCheckSection',
    'formattingSection',
    'interviewQuestionsSection',
    'finalRecommendationsSection'
];

const specializationOptions = {
    "Finance & Accounting": ["Accountant", "Financial Analyst", "Statutory Auditor", "Internal Auditor", "Tax Consultant", "AP/AR Specialist", "Corporate Finance", "ESG Analyst", "Forensic Accountant", "Management Accountant", "Bookkeeper", "Equity Research"],
    "Banking": ["Relationship Manager", "Credit Analyst", "Investment Banker", "Risk Manager", "Compliance Officer", "Branch Manager", "Treasury Analyst"],
    "Human Resource": ["HR Generalist", "Recruiter", "Compensation & Benefits Specialist", "HR Business Partner", "Learning & Development Manager", "HR Operations"],
    "Marketing & Growth": ["Digital Marketing Manager", "Brand Manager", "Content Strategist", "SEO Specialist", "Growth Hacker", "Product Marketing Manager"],
    "Sales & Business Development": ["Sales Manager", "Business Development Manager", "Account Executive", "Sales Operations Analyst", "Key Account Manager"],
    "Technology": ["Software Engineer", "Data Scientist", "Product Manager", "UX/UI Designer", "DevOps Engineer", "Cybersecurity Analyst", "IT Support Specialist"]
};

document.addEventListener('DOMContentLoaded', async () => {
    //populateSpecializations();
    setupUserId();
    initializeSupabase(); // Initialize Supabase on page load
    const svg = document.querySelector('.score-chart');
    if (svg && !document.getElementById('scoreGradient')) {
        const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        defs.innerHTML = `
      <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
         <stop offset="0%" stop-color="#818cf8" />
         <stop offset="100%" stop-color="#4f46e5" />
      </linearGradient>`;
        svg.insertBefore(defs, svg.firstChild);
    }
    await refreshAuthUser();
    updateAuthUI();
    setupTrialGateModals();
    setupTabs();
    setupSubtabListeners();
    setupCollapsibleSections();
    setupHistoryInteraction();
    setFooterYear();
    setupCopyListeners();

    ['landingHistoryBtn', 'landingHistoryBtnMobile'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', showHistoryView);
        }
    });
    const navHistoryLink = document.getElementById('navHistoryLink');
    if (navHistoryLink) {
        navHistoryLink.addEventListener('click', () => {
            expandedMenu.classList.remove('active');
            showHistoryView();
        });
    }

    ['startOverBtn', 'headerAnalyzeAnotherBtn', 'menuAnalyzeAnotherBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', startNewAnalysis);
        }
    });

    ['btnFixInBuilder', 'menuFixInBuilderBtn'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                // Ensure they are saved in localStorage
                if (pdfImages && pdfImages.length > 0) {
                    localStorage.setItem('import_cv_images', JSON.stringify(pdfImages));
                    localStorage.setItem('import_cv_filename', (selectedFile ? selectedFile.name : '') || activeReviewFileName || 'Resume');
                }
                
                if (localStorage.getItem('import_cv_images')) {
                    window.location.href = '/cv-builder/?import_from_reviewer=true';
                } else {
                    showNoticeModal('Upload Required', 'Please upload and analyze a CV first before importing it to the CV Builder.', false);
                }
            });
        }
    });

    await restoreActiveReview();
});

function startNewAnalysis() {
    localStorage.removeItem(ACTIVE_REVIEW_KEY);
    analysisResultText = null;
    activeReviewFileName = null;
    resetUpload();
    hideResults();
    if (tipsSection) tipsSection.style.display = 'none';
    if (loadingSection) loadingSection.style.display = 'none';
    if (landingSection) landingSection.style.display = 'block';
    if (expandedMenu) expandedMenu.classList.remove('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setupCopyListeners() {
    document.addEventListener('click', async (e) => {
        const btn = e.target.closest('.copy-suggestion-btn, .copy-grammar-btn');
        if (!btn) return;

        e.preventDefault();
        e.stopPropagation();

        const textToCopy = btn.dataset.text;
        if (!textToCopy) return;

        try {
            await navigator.clipboard.writeText(textToCopy);
            const icon = btn.querySelector('i');
            const tooltip = btn.querySelector('.copy-success-tooltip');
            
            if (icon) {
                icon.className = 'fa-solid fa-check';
            }
            if (tooltip) {
                tooltip.classList.add('show');
            }
            
            setTimeout(() => {
                if (icon) {
                    icon.className = 'fa-regular fa-copy';
                }
                if (tooltip) {
                    tooltip.classList.remove('show');
                }
            }, 2000);
        } catch (err) {
            console.error('Failed to copy text:', err);
        }
    });
}

function updateAuthUI() {
    const authLink = document.querySelector('.auth-icon-btn');
    if (!authLink) return;

    if (authUser) {
        authLink.setAttribute('href', '/profile.html');
        authLink.setAttribute('title', `Logged in as ${authUser.email}`);
        const initial = (authUser.email || 'U').charAt(0).toUpperCase();
        authLink.innerHTML = `
          <div class="user-avatar-initial" style="width: 32px; height: 32px; border-radius: 50%; background: #1d4ed8; color: #ffffff; display: grid; place-items: center; font-size: 0.9rem; font-weight: 700; border: 2px solid #ffffff; box-shadow: 0 0 0 1px #1d4ed8;">
            ${initial}
          </div>
        `;
    } else {
        authLink.setAttribute('href', '/login');
        authLink.setAttribute('title', 'Login');
        authLink.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;display:block;">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        `;
    }
}

function setFooterYear() {
    const el = document.getElementById('footerYear');
    if (el) el.textContent = new Date().getFullYear();
}

// --- Free-trial gate: modals + remaining-count indicator ---
function openReviewLoginModal() {
    const overlay = document.getElementById('reviewLoginOverlay');
    if (overlay) overlay.classList.add('active');
}
function closeReviewLoginModal() {
    const overlay = document.getElementById('reviewLoginOverlay');
    if (overlay) overlay.classList.remove('active');
}
function openReviewBuyModal() {
    const list = document.getElementById('reviewBuyCourseList');
    if (list) {
        list.innerHTML = PREMIUM_COURSES.map(c => `
            <a class="trial-course-card" href="${escapeHtml(c.url)}" target="_blank" rel="noopener noreferrer">
                <span class="trial-course-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 10 12 5 2 10l10 5 10-5z"></path>
                        <path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5"></path>
                    </svg>
                </span>
                <div class="trial-course-info">
                    <div class="trial-course-title">${escapeHtml(c.title)}</div>
                    <div class="trial-course-desc">${escapeHtml(c.desc)}</div>
                </div>
                <span class="trial-course-cta" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m13 6 6 6-6 6"></path></svg>
                </span>
            </a>`).join('');
    }
    const overlay = document.getElementById('reviewBuyOverlay');
    if (overlay) overlay.classList.add('active');
}
function closeReviewBuyModal() {
    const overlay = document.getElementById('reviewBuyOverlay');
    if (overlay) overlay.classList.remove('active');
}


function showContextWarningModal(message) {
    const overlay = document.getElementById('contextWarningOverlay');
    const desc = document.getElementById('contextWarningText');
    if (desc && message) desc.textContent = message;
    if (overlay) overlay.classList.add('active');
}
function closeContextWarningModal() {
    const overlay = document.getElementById('contextWarningOverlay');
    if (overlay) overlay.classList.remove('active');
    resetToUploadStage();
}

function showNoticeModal(title, message, isError = true) {
    const overlay = document.getElementById('noticeModalOverlay');
    const titleEl = document.getElementById('noticeModalTitle');
    const descEl = document.getElementById('noticeModalText');
    const emblem = document.getElementById('noticeModalEmblem');
    
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = message;
    
    if (emblem) {
        if (isError) {
            emblem.style.background = 'rgba(239, 68, 68, 0.1)';
            emblem.style.color = '#ef4444';
            emblem.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
        } else {
            emblem.style.background = 'rgba(37, 99, 235, 0.1)';
            emblem.style.color = '#2563eb';
            emblem.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        }
    }
    
    if (overlay) overlay.classList.add('active');
}

function closeNoticeModal() {
    const overlay = document.getElementById('noticeModalOverlay');
    if (overlay) overlay.classList.remove('active');
}

// Wire modal close buttons, backdrop clicks, Esc, and the indicator CTA. Called once on load.
function setupTrialGateModals() {
    document.getElementById('reviewLoginClose')?.addEventListener('click', closeReviewLoginModal);
    document.getElementById('reviewBuyClose')?.addEventListener('click', closeReviewBuyModal);
    document.getElementById('contextWarningClose')?.addEventListener('click', closeContextWarningModal);
    document.getElementById('contextWarningBtn')?.addEventListener('click', closeContextWarningModal);
    document.getElementById('noticeModalClose')?.addEventListener('click', closeNoticeModal);
    document.getElementById('noticeModalBtn')?.addEventListener('click', closeNoticeModal);
    
    ['reviewLoginOverlay', 'reviewBuyOverlay', 'contextWarningOverlay', 'noticeModalOverlay'].forEach(id => {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        overlay.addEventListener('click', (e) => { 
            if (e.target === overlay) {
                if (id === 'reviewLoginOverlay') closeReviewLoginModal();
                else if (id === 'reviewBuyOverlay') closeReviewBuyModal();
                else if (id === 'contextWarningOverlay') closeContextWarningModal();
                else if (id === 'noticeModalOverlay') closeNoticeModal();
            }
        });
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        closeReviewLoginModal();
        closeReviewBuyModal();
        closeContextWarningModal();
        closeNoticeModal();
    });
    // "unlock unlimited" link in the depleted indicator opens the buy popup.
    const indicator = document.getElementById('trialIndicator');
    if (indicator) {
        indicator.addEventListener('click', (e) => {
            const cta = e.target.closest('.trial-indicator-cta');
            if (!cta) return;
            e.preventDefault();
            openReviewBuyModal();
        });
    }
}

function activateTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tabId));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const target = document.getElementById(`tab-${tabId}`);
    if (target) target.classList.add('active');

    // Centralized visibility sync for analysis sub-tabs row
    const analysisSubTabs = document.getElementById('analysisSubTabs');
    if (analysisSubTabs) {
        analysisSubTabs.style.display = tabId === 'analysis' ? '' : 'none';
    }
}

function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]
    ));
}

// --- Partial view locking for non-premium users ---
function lockPillHTML() {
    return `<span class="section-lock-pill"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>Locked</span>`;
}

function lockPanelHTML() {
    return `
    <div class="lock-panel">
      <div class="lock-skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
      <div class="lock-overlay">
        <span class="lock-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        </span>
        <h4>Unlock the full report</h4>
        <p>Enroll in any MSC course to unlock complete detailed recommendations, phrasing rewrites, and skill gap analyses.</p>
        <button type="button" class="lock-cta open-buy-modal-btn">Enroll to Unlock Full Report
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
        </button>
      </div>
    </div>`;
}

document.addEventListener('click', (e) => {
    const lockBtn = e.target.closest('.lock-cta, .open-buy-modal-btn');
    if (lockBtn) {
        e.preventDefault();
        openReviewBuyModal();
    }
});

function applyRoleLocks() {
    clearRoleLocks();
    if (isPremiumEnrolled) return;

    LOCKED_SECTION_IDS.forEach(id => {
        const section = document.getElementById(id);
        if (!section) return;
        section.classList.add('locked');

        const h3 = section.querySelector('.section-header h3');
        if (h3 && !h3.querySelector('.section-lock-pill')) {
            h3.insertAdjacentHTML('beforeend', lockPillHTML());
        }

        const content = section.querySelector('.content-area');
        if (content) {
            content.classList.remove('collapsed');
            content.innerHTML = lockPanelHTML();
        }
        const icon = section.querySelector('.toggle-icon');
        if (icon) icon.classList.remove('collapsed');
    });

    if (downloadReportBtn) {
        downloadReportBtn.classList.add('is-locked');
        downloadReportBtn.dataset.locked = 'true';
        downloadReportBtn.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>Unlock full report`;
    }
}

function clearRoleLocks() {
    LOCKED_SECTION_IDS.forEach(id => {
        const section = document.getElementById(id);
        if (!section) return;
        section.classList.remove('locked');
        const pill = section.querySelector('.section-lock-pill');
        if (pill) pill.remove();
    });
    if (downloadReportBtn) {
        downloadReportBtn.classList.remove('is-locked');
        downloadReportBtn.dataset.locked = 'false';
        downloadReportBtn.innerHTML = downloadBtnDefaultHTML;
    }
}

// --- Persistence: restore the active review on page load ---
async function restoreActiveReview() {
    const activeId = localStorage.getItem(ACTIVE_REVIEW_KEY);
    if (!activeId) return;

    if (!supabase) initializeSupabase();

    landingSection.style.display = 'none';
    loadingSection.style.display = 'block';
    loadingProgressText.textContent = 'Loading your saved report...';

    try {
        const { data, error } = await supabase
            .from('msc_cv_ai_resume_reviews')
            .select('score, review_data, file_name, created_at')
            .eq('id', activeId)
            .single();

        if (error || !data || !data.review_data || !data.review_data.review) {
            throw { isDbError: true, message: error ? error.message : 'Saved review not found' };
        }

        analysisResultText = data.review_data.review;
        activeReviewFileName = data.file_name || null;

        processStructuredResults(analysisResultText);
        applyRoleLocks();

        loadingSection.style.display = 'none';
        showResults();
        tipsSection.style.display = 'block';
        activateTab('analysis');
        window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (err) {
        console.warn('Could not restore active review:', err.message || err);
        if (err && err.isDbError) {
            localStorage.removeItem(ACTIVE_REVIEW_KEY);
        }
        loadingSection.style.display = 'none';
        landingSection.style.display = 'block';
    }
}

// --- History: load a past review into the main analysis view ---
function setupHistoryInteraction() {
    const contentEl = document.getElementById('historyContent');
    if (!contentEl) return;
    const open = itemEl => {
        const review = historyReviews.find(r => String(r.id) === String(itemEl.dataset.reviewId));
        if (review) loadReviewIntoView(review);
    };
    contentEl.addEventListener('click', e => {
        const itemEl = e.target.closest('.history-item');
        if (itemEl) open(itemEl);
    });
    contentEl.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const itemEl = e.target.closest('.history-item');
        if (itemEl) { e.preventDefault(); open(itemEl); }
    });
}

function loadReviewIntoView(review) {
    const reviewText = review.review_data?.review;
    if (!reviewText) return;

    analysisResultText = reviewText;
    activeReviewFileName = review.file_name || null;

    processStructuredResults(reviewText);
    applyRoleLocks();

    localStorage.setItem(ACTIVE_REVIEW_KEY, review.id);

    document.querySelectorAll('.history-item').forEach(el => {
        el.classList.toggle('is-active', String(el.dataset.reviewId) === String(review.id));
    });

    activateTab('analysis');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setupUserId() {
    userId = localStorage.getItem('msc_cv_reviewer_uuid');
    if (!userId) {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            userId = crypto.randomUUID();
        } else {
            userId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
        localStorage.setItem('msc_cv_reviewer_uuid', userId);
    }
}

function setupTabs() {
    const tabContainer = document.querySelector('.tabs');
    if (!tabContainer) return;
    tabContainer.addEventListener('click', async (e) => {
        if (e.target.matches('.tab-btn')) {
            const tabId = e.target.dataset.tab;
            activateTab(tabId);

            if (tabId === 'leaderboard') {
                await loadLeaderboard();
            } else if (tabId === 'history') {
                await loadHistory();
            }
        }
    });
}

function setupCollapsibleSections() {
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.addEventListener('click', (e) => {
        const header = e.target.closest('.section-header');
        if (header) {
            const content = header.nextElementSibling;
            const icon = header.querySelector('.toggle-icon');
            content.classList.toggle('collapsed');
            icon.classList.toggle('collapsed');
        }
    });
}

menuButton.addEventListener('click', () => {
    expandedMenu.classList.toggle('active');
});

menuCloseBtn.addEventListener('click', () => {
    expandedMenu.classList.remove('active');
});

document.addEventListener('click', (e) => {
    if (!expandedMenu.contains(e.target) && !menuButton.contains(e.target) && expandedMenu.classList.contains('active')) {
        expandedMenu.classList.remove('active');
    }
});

browseButton.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', handleFileSelect);
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => dropArea.addEventListener(eventName, preventDefaults, false));
['dragenter', 'dragover'].forEach(eventName => dropArea.addEventListener(eventName, highlight, false));
['dragleave', 'drop'].forEach(eventName => dropArea.addEventListener(eventName, unhighlight, false));
dropArea.addEventListener('drop', handleDrop, false);

function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
function highlight() { dropArea.classList.add('dragover'); }
function unhighlight() { dropArea.classList.remove('dragover'); }

function handleDrop(e) {
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') handleFile(file);
    else alert('Please upload a PDF file');
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') handleFile(file);
    else alert('Please upload a PDF file');
}

async function handleFile(file) {
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    dropArea.style.display = 'none';
    previewArea.style.display = 'grid';

    proceedToReviewBtn.disabled = true;
    proceedToReviewBtn.classList.add('opacity-50', 'cursor-not-allowed');
    removeFileBtn.disabled = true;

    try {
        await generatePdfPreview(file);
        proceedToReviewBtn.disabled = false;
        proceedToReviewBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } catch (error) {
        alert(`Error processing PDF: ${error.message}. Please try another file.`);
        resetUpload();
    } finally {
        removeFileBtn.disabled = false;
    }
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function generatePdfPreview(file) {
    previewThumbnail.innerHTML = '<div class="text-center p-4 text-text-secondary">Generating preview...</div>';
    pdfImages = [];

    try {
        const arrayBuffer = await file.arrayBuffer();
        pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        const page = await pdfDocument.getPage(1);
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport: viewport }).promise;

        previewThumbnail.innerHTML = '';
        previewThumbnail.appendChild(canvas);

        await convertPdfToImages();

    } catch (error) {
        previewThumbnail.innerHTML = '<div class="text-center p-4 text-red-600">Error loading preview.</div>';
        throw error;
    }
}

async function convertPdfToImages() {
    pdfImages = [];
    if (!pdfDocument) return;

    try {
        const scale = 1.5;
        for (let i = 1; i <= pdfDocument.numPages; i++) {
            const page = await pdfDocument.getPage(i);
            const viewport = page.getViewport({ scale: scale });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
            pdfImages.push(imageDataUrl.split(',')[1]);
        }
        // Save to localStorage immediately so it survives page reloads or logins
        localStorage.setItem('import_cv_images', JSON.stringify(pdfImages));
        localStorage.setItem('import_cv_filename', (selectedFile ? selectedFile.name : '') || 'Resume');
    } catch (error) {
        pdfImages = [];
        localStorage.removeItem('import_cv_images');
        localStorage.removeItem('import_cv_filename');
        throw error;
    }
}

removeFileBtn.addEventListener('click', resetUpload);

function resetUpload() {
    selectedFile = null;
    pdfDocument = null;
    pdfImages = [];
    localStorage.removeItem('import_cv_images');
    localStorage.removeItem('import_cv_filename');
    fileInput.value = '';
    previewArea.style.display = 'none';
    dropArea.style.display = 'block';
    fileName.textContent = 'document.pdf';
    fileSize.textContent = '0 KB';
    previewThumbnail.innerHTML = '';
    proceedToReviewBtn.disabled = true;
    proceedToReviewBtn.classList.add('opacity-50', 'cursor-not-allowed');
}

/*backToUploadBtn.addEventListener('click', () => {
    //domainSpecializationSection.style.display = 'none';
    uploadSection.style.display = 'block';
});*/

//domainSelect.addEventListener('change', populateSpecializations);

/*function populateSpecializations() {
    //const selectedDomain = domainSelect.value;
    //const options = specializationOptions[selectedDomain] || [];
    //specializationSelect.innerHTML = '';

    if (options.length === 0) {
        specializationSelect.innerHTML = '<option value="" disabled selected>No specializations available</option>';
        specializationSelect.disabled = true;
    } else {
        options.forEach(spec => {
            const option = document.createElement('option');
            option.value = spec;
            option.textContent = spec;
            specializationSelect.appendChild(option);
        });
        specializationSelect.disabled = false;
        if (specializationSelect.options.length > 0) {
             specializationSelect.options[0].selected = true;
        }
    }
}*/

function initializeSupabase() {
    if (!userId) setupUserId();
    const headers = {
        'x-msc-user-id': userId
    };
    supabase = createClient(supabaseUrl, supabaseKey, { global: { headers } });
}

async function refreshAuthUser() {
    if (!supabase) initializeSupabase();
    const { data } = await supabase.auth.getUser();
    authUser = data?.user || null;

    isMscitEnrolled = false;
    isPremiumEnrolled = false;
    if (authUser) {
        try {
            // Any enrollment row → premium (unlimited reviews).
            const { count: anyCount, error: anyErr } = await supabase
                .from('enrollment')
                .select('course', { count: 'exact', head: true })
                .eq('uuid', authUser.id);
            if (!anyErr && anyCount > 0) {
                isPremiumEnrolled = true;
            }
        } catch (e) {
            console.warn('Error checking premium enrollment:', e);
        }
        try {
            // Specific MSCIT course → unlocks the Industrial deep-dive sections.
            const { count, error } = await supabase
                .from('enrollment')
                .select('course', { count: 'exact', head: true })
                .eq('uuid', authUser.id)
                .eq('course', 'industrial-training-mastery');
            if (!error && count > 0) {
                isMscitEnrolled = true;
            }
        } catch (e) {
            console.warn('Error checking MSCIT enrollment:', e);
        }
    }
}


// --- Three-tier usage limits ---
// IP-based (no login): 1 review forever → then login required
// Free logged-in:      3 reviews forever → then enroll required
// Paid (MSC enrolled): unlimited frontend (backend enforces 10/day)
const IP_REVIEW_LIMIT = 1;
const FREE_USER_LIFETIME_LIMIT = 3;
const IP_REVIEW_COUNT_KEY = 'msc_cv_ip_review_count';

function getIpReviewCount() {
    return parseInt(localStorage.getItem(IP_REVIEW_COUNT_KEY) || '0', 10);
}
function incrementIpReviewCount() {
    const current = getIpReviewCount();
    localStorage.setItem(IP_REVIEW_COUNT_KEY, String(current + 1));
}

async function getFreeUserLifetimeCount() {
    if (!supabase || !authUser) return 0;
    try {
        const { count, error } = await supabase
            .from('msc_cv_ai_resume_reviews')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', authUser.id);
        if (error) return 0;
        return count || 0;
    } catch (e) {
        return 0;
    }
}

proceedToReviewBtn.addEventListener('click', analyzeCv);

async function analyzeCv() {
    if (!selectedFile || pdfImages.length === 0) {
        alert('PDF not processed correctly. Please re-upload.');
        return;
    }

    // Refresh auth user status to determine if user has full access (MSC enrolled) or partial access
    await refreshAuthUser();
    updateAuthUI();

    // --- Three-tier gating ---
    // 1) IP-based (not logged in): 2 reviews forever → then require login
    if (!authUser) {
        const ipCount = getIpReviewCount();
        if (ipCount >= IP_REVIEW_LIMIT) {
            openReviewLoginModal();
            return;
        }
    }
    // 2) Free logged-in (not enrolled): 3 reviews forever → then require enrollment
    else if (!isPremiumEnrolled) {
        const lifetimeCount = await getFreeUserLifetimeCount();
        if (lifetimeCount >= FREE_USER_LIFETIME_LIMIT) {
            openReviewBuyModal();
            const titleEl = document.getElementById('reviewBuyTitle');
            if (titleEl) titleEl.textContent = "You've used all 3 free reviews";
            return;
        }
    }
    // 3) Premium enrolled users: no frontend limit (backend handles 10/day)

    const selectedDomain = 'Financing';
    const selectedSpecialization = 'Accounting';

    landingSection.style.display = 'none';
    loadingSection.style.display = 'block';
    hideResults();
    tipsSection.style.display = 'none';

    loadingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

    startLoadingAnimation();
    clearResultsContent();

    try {
        const domainHeader = 'Financing';
        const specializationHeader = 'Accounting';

        const response = await fetch('https://cv-reviewer.bhansalimanan55.workers.dev/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Domain': domainHeader,
                'X-Specialization': specializationHeader,
                'Origin': window.location.origin
            },
            body: JSON.stringify({ images: pdfImages, isPremium: isPremiumEnrolled })
        });

        stopLoadingAnimation();

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response.' }));
            throw new Error(`Analysis failed: ${response.status} - ${errorData.error || response.statusText}`);
        }

        const data = await response.json();

        if (!data.ok || !data.response) {
            throw new Error(`Analysis unsuccessful: ${data.error || 'Received invalid data from server.'}`);
        }

        analysisResultText = data.response;

        // Check if the uploaded resume is out of context
        if (analysisResultText.includes('<<<OUT_OF_CONTEXT>>>')) {
            let msg = analysisResultText.replace('<<<OUT_OF_CONTEXT>>>', '').trim();
            if (!msg) {
                msg = "This AI CV Reviewer is custom-built exclusively for Chartered Accountants (CA), Finance, and Accounting professionals. Please upload a relevant resume.";
            }
            loadingSection.style.display = 'none';
            showContextWarningModal(msg);
            return;
        }

        activeReviewFileName = selectedFile ? selectedFile.name : null;

        processStructuredResults(analysisResultText);
        applyRoleLocks();
        await refreshAuthUser();
        const reviewId = await saveReview(analysisResultText);
        if (reviewId) {
            localStorage.setItem(ACTIVE_REVIEW_KEY, reviewId);
        }

        // Track IP-based review count for unauthenticated users
        // (logged-in users are tracked via Supabase rows automatically)
        if (!authUser) {
            incrementIpReviewCount();
        }

        loadingSection.style.display = 'none';
        showResults();
        tipsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
        stopLoadingAnimation();
        loadingSection.style.display = 'none';
        showNoticeModal('Analysis Failed', error.message || 'An unexpected error occurred. Please try again later.');
        resetToUploadStageOnError();
    }
}

async function saveReview(reviewText) {
    if (!supabase) return null;

    const scoreSection = extractSectionContent(reviewText, '<<<OVERALL_SCORE>>>', '<<<END_OVERALL_SCORE>>>');
    let score = 0; const m = scoreSection?.match(/Score:\s*([\d.]+)\/100/i); if (m) score = parseFloat(parseFloat(m[1]).toFixed(2));

    const insertPayload = {
        user_id: authUser ? authUser.id : userId,
        user_name: authUser ? (authUser.user_metadata?.full_name || authUser.email || 'User') : null,
        score,
        review_data: { review: reviewText, target_role: 'standard' },
        file_name: selectedFile ? selectedFile.name : 'resume.pdf'
    };

    const { data, error } = await supabase
        .from('msc_cv_ai_resume_reviews')
        .insert([insertPayload])
        .select('id')
        .single();
    if (error) {
        console.error('Error saving review to Supabase:', error);
        return null;
    }
    return data?.id ?? null;
}

function startLoadingAnimation() {
    stopLoadingAnimation();
    resetLoadingChecklist();
    let stage = 0;

    const stages = [
        "Uploading resume securely...",
        "Analyzing document structure...",
        "Extracting key skills and experience...",
        "Evaluating alignment with CA standards...",
        "Assessing articleship impact and achievements...",
        "Checking corporate readiness and grammar...",
        "Generating tailored recommendations...",
        "Compiling your detailed report...",
        "Finalizing results..."
    ];
    loadingProgressText.textContent = "Hang tight as we prepare the next steps!";
    updateLoadingChecklist(0);

    currentProgressInterval = setInterval(() => {
        loadingProgressText.textContent = stages[stage % stages.length];
        updateLoadingChecklist(stage);
        stage++;
    }, 3000);
}

function resetLoadingChecklist() {
    for (let num = 1; num <= 4; num++) {
        const stepEl = document.getElementById(`loadStep${num}`);
        if (!stepEl) continue;
        stepEl.className = 'loading-step';
        const bulletEl = stepEl.querySelector('.step-bullet');
        if (bulletEl) {
            bulletEl.innerHTML = '';
        }
    }
}

function updateLoadingChecklist(stage) {
    let currentStep = 1;
    if (stage >= 2 && stage <= 3) {
        currentStep = 2;
    } else if (stage >= 4 && stage <= 5) {
        currentStep = 3;
    } else if (stage >= 6) {
        currentStep = 4;
    }

    for (let num = 1; num <= 4; num++) {
        const stepEl = document.getElementById(`loadStep${num}`);
        if (!stepEl) continue;
        const bulletEl = stepEl.querySelector('.step-bullet');

        if (num < currentStep) {
            stepEl.className = 'loading-step completed';
            if (bulletEl) {
                bulletEl.innerHTML = '<i class="fa-solid fa-check"></i>';
            }
        } else if (num === currentStep) {
            stepEl.className = 'loading-step active';
            if (bulletEl && !bulletEl.querySelector('.fa-spinner')) {
                bulletEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            }
        } else {
            stepEl.className = 'loading-step';
            if (bulletEl) {
                bulletEl.innerHTML = '';
            }
        }
    }
}

function stopLoadingAnimation() {
    if (currentProgressInterval) {
        clearInterval(currentProgressInterval);
        currentProgressInterval = null;
    }
    loadingProgressText.textContent = "Processing complete!";
    
    // Mark all steps completed on success
    for (let num = 1; num <= 4; num++) {
        const stepEl = document.getElementById(`loadStep${num}`);
        if (stepEl) {
            stepEl.className = 'loading-step completed';
            const bulletEl = stepEl.querySelector('.step-bullet');
            if (bulletEl) {
                bulletEl.innerHTML = '<i class="fa-solid fa-check"></i>';
            }
        }
    }
}

function extractSectionContent(text, startMarker, endMarker) {
    if (!text) return null;
    const startIndex = text.indexOf(startMarker);
    if (startIndex === -1) return null;

    const contentStartIndex = startIndex + startMarker.length;
    const endIndex = text.indexOf(endMarker, contentStartIndex);

    if (endIndex === -1) {
        const nextMarkerIndex = text.indexOf('<<<', contentStartIndex);
        return nextMarkerIndex !== -1 ? text.substring(contentStartIndex, nextMarkerIndex).trim() : text.substring(contentStartIndex).trim();
    }

    return text.substring(contentStartIndex, endIndex).trim();
}

function parseAndDisplayOverallScore(text) {
    const scoreSection = extractSectionContent(text, '<<<OVERALL_SCORE>>>', '<<<END_OVERALL_SCORE>>>');
    let overallScore = 0;
    let justification = "Not available.";

    if (scoreSection) {
        const scoreMatch = scoreSection.match(/Score:\s*([\d.]+)\/100/i);
        const justMatch = scoreSection.match(/Justification:\s*(.*)/is);

        if (scoreMatch) {
            overallScore = parseFloat(scoreMatch[1]);
        }
        if (justMatch) {
            justification = justMatch[1].trim();
        }
    } else {
        const fallbackScoreMatch = text.match(/<score>([\d.]+)<\/score>/i) || text.match(/Overall Score:\s*([\d.]+)\/100/i);
        if (fallbackScoreMatch) {
            overallScore = parseFloat(fallbackScoreMatch[1]);
            justification = "Score extracted via fallback method.";
        }
    }

    const badgeEl = document.getElementById('scoreRatingBadge');
    if (badgeEl) {
        let label = "Needs Polish";
        let ratingClass = "rating-badge-poor";
        if (overallScore >= 85) {
            label = "Excellent";
            ratingClass = "rating-badge-excellent";
        } else if (overallScore >= 70) {
            label = "Good";
            ratingClass = "rating-badge-good";
        } else if (overallScore >= 50) {
            label = "Average";
            ratingClass = "rating-badge-average";
        }
        badgeEl.className = `score-rating-badge mt-3 text-center ${ratingClass}`;
        badgeEl.textContent = label;
    }

    animateScore(overallScore);
    scoreJustification.innerHTML = simpleMarkdownToHtml(justification);
    return overallScore;
}

function parseAndDisplayRecruiterTips(text) {
    const content = extractSectionContent(text, '<<<RECRUITER_TIPS>>>', '<<<END_RECRUITER_TIPS>>>');
    recruiterTipsContent.innerHTML = content ? formatFeedbackText(content) : '<p class="text-text-secondary">No recruiter tips available.</p>';
}

function parseAndDisplayMeasurableResults(text) {
    const content = extractSectionContent(text, '<<<MEASURABLE_RESULTS>>>', '<<<END_MEASURABLE_RESULTS>>>');
    if (!content) {
        measurableResultsContent.innerHTML = '<p class="text-text-secondary">No measurable results analysis available.</p>';
        return;
    }

    const points = content.split(/<<END_POINT>>|---/);
    let html = '';
    points.forEach((point) => {
        if (!point.trim()) return;

        const originalMatch = point.match(/Original:\s*"([\s\S]+?)"/i);
        const critiqueMatch = point.match(/Critique:\s*([\s\S]+?)(?=Rewrite Suggestion \d+:|$)/i);

        html += `<div class="feedback-point border-b border-border pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0">`;
        if (originalMatch && originalMatch[1]) {
            html += `
            <div class="original-text-wrap mb-3">
              <span class="wrap-label"><i class="fa-solid fa-triangle-exclamation mr-1.5"></i>Original phrasing</span>
              <p class="original-content">${escapeHtml(originalMatch[1].trim())}</p>
            </div>`;
        }
        if (critiqueMatch && critiqueMatch[1]) {
            html += `<p class="mb-3 text-sm text-text-secondary"><strong>Critique:</strong> ${formatFeedbackText(critiqueMatch[1].trim())}</p>`;
        }

        const allSuggestions = [...point.matchAll(/Rewrite Suggestion \d+:\s*([\s\S]+?)(?=Rewrite Suggestion \d+:|$)/gi)];

        if (allSuggestions.length > 0) {
            html += `<div class="mt-2 text-sm"><strong>Rewrite Suggestions:</strong>`;
            html += `<div class="mt-2 space-y-2">`;
            allSuggestions.forEach(match => {
                const suggestionText = match[1].trim();
                if (suggestionText) {
                    const plainText = suggestionText.replace(/\*\*/g, '').replace(/`/g, '').replace(/\*/g, '');
                    html += `
                    <div class="suggestion-text-wrap group">
                      <span class="wrap-label"><i class="fa-solid fa-circle-check mr-1.5"></i>AI Recommendation</span>
                      <div class="suggestion-content text-sm">${simpleMarkdownToHtml(suggestionText)}</div>
                      <button type="button" class="copy-suggestion-btn" data-text="${escapeHtml(plainText)}" title="Copy suggestion">
                        <i class="fa-regular fa-copy"></i>
                        <span class="copy-success-tooltip">Copied!</span>
                      </button>
                    </div>`;
                }
            });
            html += `</div></div>`;
        }
        html += `</div>`;
    });
    measurableResultsContent.innerHTML = html || '<p class="text-text-secondary">Could not parse measurable results.</p>';
}

function parseAndDisplayPhrasesSuggestions(text) {
    const content = extractSectionContent(text, '<<<PHRASES_SUGGESTIONS>>>', '<<<END_PHRASES_SUGGESTIONS>>>');
    if (!content) {
        phrasesSuggestionsContent.innerHTML = '<p class="text-text-secondary">No phrase suggestions available.</p>';
        return;
    }

    const points = content.split(/<<END_POINT>>|---/);
    let html = '';
    points.forEach((point) => {
        if (!point.trim()) return;

        const originalMatch = point.match(/Original:\s*"([\s\S]+?)"/i);
        const critiqueMatch = point.match(/Critique:\s*([\s\S]+?)(?=Rewrite Suggestion \d+:|$)/i);

        html += `<div class="feedback-point border-b border-border pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0">`;
        if (originalMatch && originalMatch[1]) {
            html += `
            <div class="original-text-wrap mb-3">
              <span class="wrap-label"><i class="fa-solid fa-triangle-exclamation mr-1.5"></i>Original phrasing</span>
              <p class="original-content">${escapeHtml(originalMatch[1].trim())}</p>
            </div>`;
        }
        if (critiqueMatch && critiqueMatch[1]) {
            html += `<p class="mb-3 text-sm text-text-secondary"><strong>Critique:</strong> ${formatFeedbackText(critiqueMatch[1].trim())}</p>`;
        }

        const allSuggestions = [...point.matchAll(/Rewrite Suggestion \d+:\s*([\s\S]+?)(?=Rewrite Suggestion \d+:|$)/gi)];

        if (allSuggestions.length > 0) {
            html += `<div class="mt-2 text-sm"><strong>Rewrite Suggestions:</strong>`;
            html += `<div class="mt-2 space-y-2">`;
            allSuggestions.forEach(match => {
                const suggestionText = match[1].trim();
                if (suggestionText) {
                    const plainText = suggestionText.replace(/\*\*/g, '').replace(/`/g, '').replace(/\*/g, '');
                    html += `
                    <div class="suggestion-text-wrap group">
                      <span class="wrap-label"><i class="fa-solid fa-circle-check mr-1.5"></i>AI Recommendation</span>
                      <div class="suggestion-content text-sm">${simpleMarkdownToHtml(suggestionText)}</div>
                      <button type="button" class="copy-suggestion-btn" data-text="${escapeHtml(plainText)}" title="Copy suggestion">
                        <i class="fa-regular fa-copy"></i>
                        <span class="copy-success-tooltip">Copied!</span>
                      </button>
                    </div>`;
                }
            });
            html += `</div></div>`;
        }
        html += `</div>`;
    });
    phrasesSuggestionsContent.innerHTML = html || '<p class="text-text-secondary">Could not parse phrase suggestions.</p>';
}

function parseAndDisplayHardSkills(text) {
    const content = extractSectionContent(text, '<<<HARD_SKILLS>>>', '<<<END_HARD_SKILLS>>>');
    hardSkillsContent.innerHTML = content ? formatFeedbackText(content) : '<p class="text-text-secondary">No hard skills analysis available.</p>';
}

function parseAndDisplaySoftSkills(text) {
    const content = extractSectionContent(text, '<<<SOFT_SKILLS>>>', '<<<END_SOFT_SKILLS>>>');
    softSkillsContent.innerHTML = content ? formatFeedbackText(content) : '<p class="text-text-secondary">No soft skills analysis available.</p>';
}

function parseAndDisplayActionVerbs(text) {
    const content = extractSectionContent(text, '<<<ACTION_VERBS>>>', '<<<END_ACTION_VERBS>>>');
    actionVerbsContent.innerHTML = content ? formatFeedbackText(content) : '<p class="text-text-secondary">No action verb analysis available.</p>';
}

function parseAndDisplayGrammarCheck(text) {
    const content = extractSectionContent(text, '<<<GRAMMAR_CHECK>>>', '<<<END_GRAMMAR_CHECK>>>');
    if (!content) {
        grammarCheckContent.innerHTML = '<p class="text-text-secondary">No grammar check results available.</p>';
        return;
    }

    let html = formatFeedbackText(content);

    html = html.replace(/Original:\s*"([^"]+?)"\s*->\s*Corrected:\s*"([^"]+?)"(\s*<span class="highlight-issue.*?<\/span>)?/gi, (match, original, corrected, issueMarker) => {
        const issueHtml = issueMarker || '';
        const escapedCorrected = escapeHtml(corrected);
        return `
        <div class="grammar-correction mb-3">
          <div class="flex flex-col gap-1">
            <span class="original-text">${original}</span>
            <div class="flex items-center gap-1.5 mt-0.5">
              <i class="fa-solid fa-arrow-right text-success text-xs"></i>
              <span class="corrected-text">${corrected}</span>
              ${issueHtml}
            </div>
          </div>
          <button type="button" class="copy-grammar-btn" data-text="${escapedCorrected}" title="Copy correction">
            <i class="fa-regular fa-copy"></i>
            <span class="copy-success-tooltip">Copied!</span>
          </button>
        </div>`;
    });

    grammarCheckContent.innerHTML = html;
}

function parseAndDisplayFormatting(text) {
    const content = extractSectionContent(text, '<<<FORMATTING_READABILITY>>>', '<<<END_FORMATTING_READABILITY>>>');
    formattingContent.innerHTML = content ? formatFeedbackText(content) : '<p class="text-text-secondary">No formatting analysis available.</p>';
}
function parseAndDisplayEducation(text) {
    const content = extractSectionContent(text, '<<<EDUCATION_QUALIFICATION>>>', '<<<END_EDUCATION_QUALIFICATION>>>');
    educationContent.innerHTML = content ? formatFeedbackText(content) : '<p class="text-text-secondary">No education analysis available.</p>';
}
function parseAndDisplayArticleship(text) {
    const content = extractSectionContent(text, '<<<ARTICLESHIP_EXPERIENCE>>>', '<<<END_ARTICLESHIP_EXPERIENCE>>>');
    articleshipContent.innerHTML = content ? formatFeedbackText(content) : '<p class="text-text-secondary">No articleship analysis available.</p>';
}
function parseAndDisplayFinalRecommendations(text) {
    const content = extractSectionContent(text, '<<<FINAL_RECOMMENDATIONS>>>', '<<<END_FINAL_RECOMMENDATIONS>>>');
    finalRecommendationsContent.innerHTML = content ? formatFeedbackText(content) : '<p class="text-text-secondary">No final recommendations available.</p>';
}

function parseAndDisplayInterviewQuestions(text) {
    const content = extractSectionContent(text, '<<<INTERVIEW_QUESTIONS>>>', '<<<END_INTERVIEW_QUESTIONS>>>');
    interviewQuestionsContent.innerHTML = content ? formatFeedbackText(content) : '<p class="text-text-secondary">No interview questions available.</p>';
}

function processStructuredResults(resultsText) {
    clearResultsContent();

    const overallScore = parseAndDisplayOverallScore(resultsText);

    parseAndDisplayRecruiterTips(resultsText);
    parseAndDisplayMeasurableResults(resultsText);
    parseAndDisplayPhrasesSuggestions(resultsText);
    parseAndDisplayHardSkills(resultsText);
    parseAndDisplaySoftSkills(resultsText);
    parseAndDisplayActionVerbs(resultsText);
    parseAndDisplayGrammarCheck(resultsText);
    parseAndDisplayFormatting(resultsText);
    parseAndDisplayEducation(resultsText);
    parseAndDisplayArticleship(resultsText);
    parseAndDisplayFinalRecommendations(resultsText);
    parseAndDisplayInterviewQuestions(resultsText);

    updateScoreBreakdown(overallScore, resultsText);
    resetSubtabsToDefault();
}

function clearResultsContent() {
    const contentAreas = [
        recruiterTipsContent, measurableResultsContent, phrasesSuggestionsContent,
        hardSkillsContent, softSkillsContent, actionVerbsContent, grammarCheckContent,
        formattingContent, educationContent, articleshipContent, finalRecommendationsContent,
        interviewQuestionsContent, scoreJustification
    ];
    contentAreas.forEach(area => { if (area) area.innerHTML = '<p class="text-sm text-text-secondary italic">Loading...</p>'; });
    scoreText.textContent = '0';
    scoreProgress.setAttribute('stroke-dasharray', `0, 100`);
    categoryItems.forEach(item => {
        const pointsEl = item.querySelector('.points');
        const fillBar = item.querySelector('.category-fill');
        const maxPoints = pointsEl.textContent.split('/')[1] || '0';
        pointsEl.textContent = `0/${maxPoints}`;
        if (fillBar) fillBar.style.width = `0%`;
    });
}

function simpleMarkdownToHtml(md) {
    if (!md) return '';
    let html = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    return html
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-700 px-1 rounded text-sm break-all whitespace-normal overflow-wrap-anywhere" style="word-break: break-all; overflow-wrap: anywhere; white-space: normal;">$1</code>')
        .replace(/^#{1,6}\s+(.*$)/gm, (match, content) => {
            const level = match.indexOf(' ');
            return `<h${level + 1} class="font-semibold mt-4 mb-2 text-lg">${content}</h${level + 1}>`;
        })
        .replace(/^\s*[\-\*]\s+(.*$)/gm, '<li>$1</li>')
        .replace(/^\s*\d+\.\s+(.*$)/gm, '<li>$1</li>')
        .replace(/<\/li>\s*<li>/g, '</li><li>')
        .replace(/(<li>.*?<\/li>)/gs, (match, content) => {

            if (match.includes('<ul>') || match.includes('<ol>')) return match;

            const listType = /^\s*[\-\*]/.test(md) ? 'ul' : 'ol';
            return `<${listType}>${content}</${listType}>`;
        })
        .replace(/(\r\n|\n|\r)/g, '<br>')
        .replace(/<(ul|ol)>\s*<br>/gi, '<$1>')
        .replace(/<br>\s*<\/(ul|ol)>/gi, '</$1>')
        .replace(/<br>\s*<(ul|ol)/gi, '<$1')
        .replace(/<\/(ul|ol)>\s*<br>/gi, '</$1>')
        .replace(/<li>\s*<br>/gi, '<li>')
        .replace(/<br>\s*<\/li>/gi, '</li>')
        .replace(/<\/li>\s*<br>/gi, '</li>')
        .replace(/<br>\s*<br>/g, '</p><p>')
        .replace(/^<p>|<\/p>$/g, '')
        .replace(/^(.+?)$/gm, (match) => {
            if (match.trim().startsWith('<') || match.trim().startsWith('<') || /^\s*(<li>|<ul>|<ol>)/.test(match)) {
                return match;
            }
            return `<p>${match}</p>`;
        })
        .replace(/<p>\s*<\/p>/g, '');
}

function cleanRawText(t) {
    let out = (t || '');

    // 1) Turn section markers into human-readable headings (to match UI sections)
    const sectionMap = {
        OVERALL_SCORE: 'Overall Score',
        RECRUITER_TIPS: 'Recruiter Tips',
        MEASURABLE_RESULTS: 'Measurable Results',
        PHRASES_SUGGESTIONS: 'Phrases Suggestions',
        HARD_SKILLS: 'Hard Skills Analysis',
        SOFT_SKILLS: 'Soft Skills Analysis',
        ACTION_VERBS: 'Action Verbs Usage',
        GRAMMAR_CHECK: 'Grammar & Proofreading',
        FORMATTING_READABILITY: 'Formatting & Readability',
        EDUCATION_QUALIFICATION: 'Education & Qualification',
        ARTICLESHIP_EXPERIENCE: 'Articleship Experience',
        INTERVIEW_QUESTIONS: 'Predicted Interview Questions',
        FINAL_RECOMMENDATIONS: 'Final Recommendations'
    };

    Object.entries(sectionMap).forEach(([marker, title]) => {
        const startRe = new RegExp(`\\*?\\*?<<<${marker}>>>`, 'g');
        const endRe = new RegExp(`\\*?\\*?<<<END_${marker}>>>`, 'g');
        out = out.replace(startRe, `\n\n## ${title}\n\n`);
        out = out.replace(endRe, '\n\n');
    });

    // Remove any leftover markers / point delimiters
    out = out
        .replace(/<<<.*?>>>/gs, '')
        .replace(/<<POINT>>|<<END_POINT>>/g, '')
        .trim();

    // Remove stray ** (bold markers) that appear after section headings or standalone
    out = out.replace(/^##\s+([^\n]+)\n\*\*\s*$/gm, '## $1\n');  // After section headings
    out = out.replace(/^\*\*\s*$/gm, '');  // Standalone ** on their own line
    out = out.replace(/\n\*\*\n/g, '\n');  // ** between newlines

    // 2) Mirror the bullet splitting used for on-page formatting
    // Separate inline label header from first bullet item if on same line
    out = out.replace(/^(\s*(?:\*\s*)?\*\*([^*:]+):\*\*)[ \t]+(?=[A-Z]|\[)/gm, '$1\n- ');

    // After sentence boundaries (optionally followed by GOOD/ISSUE status tag), start a new markdown bullet
    out = out.replace(
        /([.!?](?:\s*\[(?:GOOD|ISSUE(?:\s*-\s*SEVERITY:\s*(?:Critical|High|Moderate|Low))?)[^\]]*\])?)[ \t]+(?=[A-Z]|\[(?:GOOD|ISSUE)(?:\s*-\s*SEVERITY:\s*(?:Critical|High|Moderate|Low))?[^\]]*\]\s+[A-Z])/gi,
        '$1\n- '
    );

    // Ensure inline numbered items become separate lines
    out = out.replace(/(\d)\.\s+([A-Z])/g, '\n$1. $2');

    // 3) Special handling for "Priority X (...):" items that often appear inline
    // Turn each new Priority into its own bullet so the PDF matches visual grouping
    out = out.replace(/\s+(Priority\s+\d+\s*\([^)]*\):)/g, '\n- $1');

    return out;
}

function formatFeedbackText(text) {
    if (!text) return '<p class="text-sm text-text-secondary italic">No details available.</p>';

    // STEP 1: Pre-process raw text before HTML conversion
    let processedText = text;

    // The model often returns long paragraphs. Break them into bullet-friendly lines:
    // 0a) Separate adjacent [GOOD] [ISSUE...] tags so [ISSUE...] starts on a new bullet line
    processedText = processedText.replace(/(\[GOOD\])\s*(\[ISSUE(?:\s*-\s*SEVERITY:\s*(?:Critical|High|Moderate|Low))?[^\]]*\])/gi, '$1\n\u2022 $2');

    // 0b) If an [ISSUE...] tag is on a line by itself before a bullet item, attach it to the bullet text
    processedText = processedText.replace(/(\u2022\s*)?(\[ISSUE(?:\s*-\s*SEVERITY:\s*(?:Critical|High|Moderate|Low))?[^\]]*\])\s*\n\s*(?:[\u2022\*\-]\s*)?/gi, '\n\u2022 $2 ');

    // 1) Separate inline label header from first bullet item if on same line
    processedText = processedText.replace(/^(\s*(?:\*\s*)?\*\*([^*:]+):\*\*)[ \t]+(?=[A-Z]|\[)/gm, '$1\n\u2022 ');

    // 2) After sentence boundaries (optionally followed by GOOD status tag), start a new bullet
    processedText = processedText.replace(
        /([.!?](?:\s*\[GOOD\])?)[ \t]+(?=[A-Z]|\[(?:GOOD|ISSUE))/gi,
        '$1\n\u2022 '
    );
    // 3) Convert inline numbered items (1. 2. 3. etc.) to bullet points
    // First, handle patterns like "text. 1. more" or "text 1. more" - any " N. " pattern
    processedText = processedText.replace(/\s+(\d+)\.\s+/g, '\n ');
    // Also handle numbered items at the very start of text
    processedText = processedText.replace(/^(\d+)\.\s+/gm, '');

    // STEP 2: Convert to HTML
    let html = simpleMarkdownToHtml(processedText);

    // Replace [GOOD] with a check mark.
    html = html.replace(/\[GOOD\]/gi, '<span class="highlight-good" title="Good point">&#10003;</span>');

    // Replace [ISSUE] with a cross mark (without severity).
    html = html.replace(/\[ISSUE\](?!\s*-\s*SEVERITY)/gi, '<span class="highlight-issue" title="Area for improvement">&#10007;</span>');

    // Replace [ISSUE - SEVERITY: Level] with compact severity badges
    html = html.replace(/\[ISSUE\s*-\s*SEVERITY:\s*(Critical|High|Moderate|Low)(?:[^\]]*)\]/gi, (match, severity) => {
        const level = severity.toLowerCase();
        return `<span class="highlight-issue" title="Issue">&#10007;</span><span class="severity-badge severity-${level}">${severity}</span>`;
    });

    // Format section labels: "*   *Label:*" pattern from prompt
    html = html.replace(/<br>\s*\*\s+\*\*([^*:]+):\*\*/g, '</p><h4 class="feedback-label">$1:</h4><p>');
    html = html.replace(/^\*\s+\*\*([^*:]+):\*\*/gm, '<h4 class="feedback-label">$1:</h4>');

    // Also handle simpler bold labels: "**Label:**"
    html = html.replace(/<br>\s*\*\*([^*:]+):\*\*/g, '</p><h4 class="feedback-label">$1:</h4><p>');

    // Convert bullet markers (\u2022) to styled paragraphs; CSS adds the visual bullet via ::before.
    html = html.replace(/<br>\s*\u2022\s*/g, '</p><p class="feedback-bullet">');
    html = html.replace(/<p>\u2022\s*/g, '<p class="feedback-bullet">');
    html = html.replace(/^\u2022\s*/gm, '');

    // Convert numbered items to styled format (remove ::before bullet for numbered items)
    html = html.replace(/<br>\s*(\d+)\.\s+/g, '</p><p class="feedback-numbered"><strong>$1.</strong> ');

    // Also convert <br><br> to separate paragraphs for better spacing
    html = html.replace(/<br>\s*<br>/g, '</p><p>');

    // Convert hyphen list markers to feedback-bullet paragraphs (NOT ul/li to avoid double bullets)
    html = html.replace(/<br>\s*-\s+/g, '</p><p class="feedback-bullet">');
    html = html.replace(/<br>\s*\*\s+/g, '</p><p class="feedback-bullet">');

    // Clean up empty paragraphs and list breaks
    html = html.replace(/<(ul|ol)>\s*<br>/gi, '<$1>');
    html = html.replace(/<br>\s*<\/(ul|ol)>/gi, '</$1>');
    html = html.replace(/<li>\s*<br>/gi, '<li>');
    html = html.replace(/<br>\s*<\/li>/gi, '</li>');
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<\/p>\s*<\/p>/g, '</p>');
    html = html.replace(/<p>\s*<p/g, '<p');

    return html;
}

function animateScore(score) {
    const scoreTextEl = document.getElementById('scoreText');
    if (!scoreTextEl) return;

    const start = performance.now();
    const duration = 1600; // 1.6s duration

    function easeOutCubic(x) {
        return 1 - Math.pow(1 - x, 3);
    }

    function step(timestamp) {
        const elapsed = timestamp - start;
        const progress = Math.min(elapsed / duration, 1);
        const currentVal = easeOutCubic(progress) * score;

        const displayScore = currentVal.toFixed(1).replace(/\.0$/, '');
        scoreTextEl.textContent = displayScore;
        
        const clampedDash = Math.min(currentVal, 100);
        scoreProgress.setAttribute('stroke-dasharray', `${clampedDash.toFixed(1)}, 100`);

        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            scoreTextEl.textContent = score.toFixed(1).replace(/\.0$/, '');
            scoreProgress.setAttribute('stroke-dasharray', `${Math.min(score, 100).toFixed(1)}, 100`);
        }
    }

    requestAnimationFrame(step);
}

function updateScoreBreakdown(overallScore, resultsText) {
    try {
        const categoryScores = {};
        const scorePatterns = {
            structure: /Structure.*?Completeness.*?(\d+)\s*\/\s*20/i,
            impact: /Impact.*?Demonstration.*?(\d+)\s*\/\s*25/i,
            expertise: /Professional.*?Expertise.*?(\d+)\s*\/\s*25/i,
            experience: /Experience.*?Description.*?(\d+)\s*\/\s*20/i,
            presentation: /Overall.*?Presentation.*?(\d+)\s*\/\s*10/i
        };

        let foundSpecificScores = true;
        if (resultsText) {
            for (const [key, pattern] of Object.entries(scorePatterns)) {
                const match = resultsText.match(pattern);
                if (match && match[1]) {
                    categoryScores[key] = parseInt(match[1], 10);
                } else {
                    foundSpecificScores = false;
                }
            }
        } else {
            foundSpecificScores = false;
        }

        categoryItems.forEach(item => {
            const categoryKey = item.dataset.category;
            const pointsEl = item.querySelector('.points');
            const fillBar = item.querySelector('.category-fill');
            if (!pointsEl) return;

            const maxPointsText = pointsEl.textContent.split('/')[1];
            if (!maxPointsText) return;
            const digitMatch = maxPointsText.match(/\d+/);
            if (!digitMatch) return;
            const maxPoints = parseInt(digitMatch[0], 10);

            let calculatedPoints = 0;
            let percentage = 0;

            if (foundSpecificScores && categoryScores[categoryKey] !== undefined) {
                calculatedPoints = Math.min(categoryScores[categoryKey], maxPoints);
                percentage = (calculatedPoints / maxPoints) * 100;
            } else {
                calculatedPoints = Math.round((overallScore / 100) * maxPoints);
                percentage = (calculatedPoints / maxPoints) * 100;
            }

            pointsEl.textContent = `${calculatedPoints}/${maxPoints} pts`;
            if (fillBar) fillBar.style.width = `${Math.min(percentage, 100)}%`;
        });
    } catch (e) {
        console.warn('Error in updateScoreBreakdown:', e);
    }
}

function setupSubtabListeners() {
    const tabBtns = document.querySelectorAll('.analysis-tab-btn');
    const tabContents = document.querySelectorAll('.subtab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.style.display = 'none');

            btn.classList.add('active');
            const targetId = `subtab-${btn.dataset.subtab}`;
            const targetContent = document.getElementById(targetId);
            if (targetContent) {
                targetContent.style.display = 'block';
            }
        });
    });
}

function resetSubtabsToDefault() {
    const tabBtns = document.querySelectorAll('.analysis-tab-btn');
    const tabContents = document.querySelectorAll('.subtab-content');
    
    tabBtns.forEach((btn, index) => {
        const targetContent = document.getElementById(`subtab-${btn.dataset.subtab}`);
        if (index === 0) {
            btn.classList.add('active');
            if (targetContent) targetContent.style.display = 'block';
        } else {
            btn.classList.remove('active');
            if (targetContent) targetContent.style.display = 'none';
        }
    });
}

startOverBtn.addEventListener('click', resetToUploadStage);
document.getElementById('headerAnalyzeAnotherBtn')?.addEventListener('click', resetToUploadStage);

// Mobile side-menu CTA buttons — same actions as header buttons
document.getElementById('menuAnalyzeAnotherBtn')?.addEventListener('click', () => {
    document.getElementById('expandedMenu')?.classList.remove('active');
    resetToUploadStage();
});
document.getElementById('menuFixInBuilderBtn')?.addEventListener('click', () => {
    document.getElementById('expandedMenu')?.classList.remove('active');
    if (pdfImages && pdfImages.length > 0) {
        localStorage.setItem('import_cv_images', JSON.stringify(pdfImages));
        localStorage.setItem('import_cv_filename', (selectedFile ? selectedFile.name : '') || activeReviewFileName || 'Resume');
        window.location.href = '/cv-builder/?import_from_reviewer=true';
    } else {
        alert('Please upload a CV to analyze first before importing it to the CV Builder.');
    }
});

function resetToUploadStage() {
    localStorage.removeItem(ACTIVE_REVIEW_KEY);
    clearRoleLocks();
    analysisResultText = null;
    activeReviewFileName = null;
    resetUpload();
    hideResults();
    tipsSection.style.display = 'none';
    //domainSpecializationSection.style.display = 'none';
    loadingSection.style.display = 'none';
    landingSection.style.display = 'block';
    heroSection.style.display = 'block';
    uploadSection.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Re-initialize supabase client in case user ID was just set.
    if (!supabase) initializeSupabase();
}

downloadReportBtn.addEventListener('click', () => {
    if (downloadReportBtn.dataset.locked === 'true') {
        openReviewBuyModal();
        return;
    }
    if (!analysisResultText) {
        alert("No analysis report available to preview.");
        return;
    }
    if (!window.MarkdownPDF) {
        alert("PDF generator not available. Please reload the page.");
        return;
    }
    const cleaned = cleanRawText(analysisResultText);
    const baseName = activeReviewFileName || (selectedFile ? selectedFile.name : 'CV');
    const safeFileName = baseName.replace(/\.pdf$/i, '').replace(/[^a-z0-9_.-]/gi, '_');
    const headerHtml = `
      <div style="text-align:center;padding:8px 0;font-family:'Poppins',sans-serif;color:#111827;font-weight:600;">
        My Student Club &middot; CV Analysis Report
      </div>`;
    const footerHtml = `
      <div style="text-align:center;padding:6px 0;font-size:10px;color:#6b7280;font-family:'Poppins',sans-serif;">
        Generated ${new Date().toLocaleDateString()}
      </div>`;
    const pdfCss = `
      @page { size: A4 portrait; margin: 14mm; }
      * { box-sizing: border-box; }
      body { font-family: 'Poppins', sans-serif; color: #0f172a; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
      .mdpdf-content { padding: 2mm 0; }
      h1, h2, h3, h4 { color: #111827; font-weight:700; break-after: avoid-page; page-break-after: avoid; }
      p, li { color: #374151; line-height: 1.7; font-size: 12px; orphans: 3; widows: 3; }
      ul, ol { margin: 0 0 10px 18px; padding: 0; }
      p, li, ul, ol, table, thead, tbody, tr, td, blockquote, pre, code, h1, h2, h3, h4 {
        break-inside: avoid-page;
        page-break-inside: avoid;
      }
      .good-marker { color: #059669; font-weight: 700; }
      .issue-marker { color: #dc2626; font-weight: 700; }
      .sev-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 4px; }
      .sev-critical { background: #fee2e2; color: #991b1b; }
      .sev-high { background: #ffedd5; color: #9a3412; }
      .sev-moderate { background: #fef3c7; color: #92400e; }
      .sev-low { background: #f0fdf4; color: #065f46; }
    `;
    const pdfOptions = {
        format: 'a4',
        orientation: 'portrait',
        margin: 14,
        css: pdfCss,
        header: headerHtml,
        footer: footerHtml,
        image: { type: 'jpeg', quality: 1.0 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            scrollY: 0,
            scrollX: 0,
            letterRendering: true,
            windowWidth: 1200
        },
        pagebreak: {
            mode: ['avoid-all', 'css', 'legacy'],
            avoid: ['p', 'li', 'ul', 'ol', 'table', 'tr', 'td', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'code']
        }
    };
    const markdown = `# CV Analysis Report\n\n${fixInlineCodeMarkdown(cleaned)}`;

    pdfPreviewContainer.innerHTML = '';
    MarkdownPDF.render(markdown, pdfPreviewContainer, pdfOptions);

    pdfPreviewModal.style.display = 'block';

    const onDownload = () => {
        MarkdownPDF.download(markdown, {
            filename: `${safeFileName}_Analysis_Report.pdf`,
            ...pdfOptions
        }).finally(() => {
            pdfPreviewModal.style.display = 'none';
            pdfPreviewDownloadBtn.removeEventListener('click', onDownload);
        });
    };
    pdfPreviewDownloadBtn.addEventListener('click', onDownload);
});

pdfPreviewCloseBtn.addEventListener('click', () => {
    pdfPreviewModal.style.display = 'none';
});

pdfPreviewModal.addEventListener('click', (e) => {
    if (e.target === pdfPreviewModal) {
        pdfPreviewModal.style.display = 'none';
    }
});

function resetToUploadStageOnError() {
    loadingSection.style.display = 'none';
    hideResults();
    tipsSection.style.display = 'none';
    //domainSpecializationSection.style.display = 'none';
    resetUpload();
    landingSection.style.display = 'block';
    uploadSection.style.display = 'block';
    heroSection.style.display = 'block';
    uploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fixInlineCodeMarkdown(md) {
    if (!md) return md;
    let out = md.replace(/```[\s\S]*?```/g, '');          // remove fenced code blocks
    out = out.replace(/`([^`\n]+)`/g, '$1');               // strip inline code markers
    out = out.replace(/^\s*> ?(.*)$/gm, '$1');             // remove blockquote markers
    out = out.replace(/^\s*[-*_]{3,}\s*$/gm, '');          // remove horizontal rules
    out = out.replace(/^\|.*\|$/gm, m => m.replace(/\|/g, ' ').replace(/-+/g, ' ')); // flatten tables

    // Format markers for PDF output with HTML styling
    out = out.replace(/\[GOOD\]/g, '<span class="good-marker">&#10003;</span>');
    out = out.replace(/\[ISSUE\](?!\s*-\s*SEVERITY)/g, '<span class="issue-marker">&#10007;</span>');
    out = out.replace(/\[ISSUE\s*-\s*SEVERITY:\s*(Critical|High|Moderate|Low)(?:[^\]]*)\]/gi, (match, severity) => {
        const level = severity.toLowerCase();
        return `<span class="issue-marker">&#10007;</span><span class="sev-badge sev-${level}">${severity}</span>`;
    });

    // Split sentences for better readability in PDF
    out = out.replace(/([.!?])\s{2,}([A-Z])/g, '$1\n\n$2');

    return out;
}

async function loadLeaderboard() {
    const contentEl = document.getElementById('leaderboardContent');
    if (!contentEl) return;
    contentEl.innerHTML = `
      <div class="leaderboard-loader flex flex-col items-center justify-center p-12">
        <i class="fa-solid fa-spinner fa-spin text-3xl text-primary mb-3"></i>
        <p class="text-sm font-medium text-text-secondary">Loading candidate rankings...</p>
      </div>`;
      
    await refreshAuthUser();
    if (!supabase || !authUser) {
        contentEl.innerHTML = `
          <div class="leaderboard-empty-state text-center p-8 border border-dashed border-border rounded-2xl bg-white shadow-sm">
            <div class="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3 text-xl">
              <i class="fa-solid fa-lock"></i>
            </div>
            <h4 class="font-bold text-text-primary text-base mb-1">Leaderboard Locked</h4>
            <p class="text-sm text-text-secondary mb-5 max-w-xs mx-auto">Sign in to your MSC account to view top candidate rankings and publish your score.</p>
            <a class="primary-btn inline-flex mx-auto" href="/login" style="color: #ffffff !important; padding: 0.65rem 1.5rem; border-radius: 12px; font-weight: 600;">Log in / Sign up</a>
          </div>`;
        return;
    }

    const { data, error } = await supabase
        .from('msc_cv_ai_resume_reviews')
        .select('id, score, created_at, file_name, user_name, user_id')
        .order('score', { ascending: false })
        .limit(100);

    if (error) { 
        console.error('Error fetching leaderboard:', error); 
        contentEl.innerHTML = '<p class="text-danger text-center p-4">Could not load leaderboard data.</p>'; 
        return; 
    }

    if (!data?.length) { 
        contentEl.innerHTML = '<p class="text-center p-8 text-text-secondary italic">No entries yet. Be the first to analyze your CV!</p>'; 
        return; 
    }

    // Filter duplicate users in memory to get unique user ranking (best score per user)
    const uniqueUsersMap = new Map();
    data.forEach(item => {
        const uid = item.user_id;
        if (uid && !uniqueUsersMap.has(uid)) {
            uniqueUsersMap.set(uid, item);
        }
    });

    const uniqueRankings = Array.from(uniqueUsersMap.values()).slice(0, 10);
    
    // Split into podium (top 3) and contenders list (4-10)
    const podiumItems = uniqueRankings.slice(0, 3);
    const listItems = uniqueRankings.slice(3);

    let html = '<div class="leaderboard-container">';

    // Render Podium for Top 3
    if (podiumItems.length > 0) {
        const second = podiumItems[1];
        const first = podiumItems[0];
        const third = podiumItems[2];

        const getPodiumCardHtml = (item, typeClass, rankLabel, num) => {
            if (!item) {
                return `
                <div class="podium-card ${typeClass}-podium opacity-40">
                    <div class="podium-badge">#${num}</div>
                    <div class="podium-avatar-wrap">
                        <div class="podium-avatar">-</div>
                    </div>
                    <div class="podium-user-name">Empty</div>
                    <div class="podium-score-tag">-</div>
                    <div class="podium-banner">${rankLabel}</div>
                </div>`;
            }

            const date = new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
            let name = 'Anonymous';
            if (item.user_name && !item.user_name.includes('@')) {
                name = item.user_name;
            } else if (item.file_name) {
                name = item.file_name.replace(/\.pdf$/i, '');
                if (name.length > 18) name = name.substring(0, 15) + '...';
            }
            const initial = name.charAt(0).toUpperCase();

            const crownHtml = (num === 1) ? '<div class="podium-crown"><i class="fa-solid fa-crown"></i></div>' : '';

            return `
            <div class="podium-card ${typeClass}-podium">
                ${crownHtml}
                <div class="podium-badge">#${num}</div>
                <div class="podium-avatar-wrap">
                    <div class="podium-avatar">${initial}</div>
                </div>
                <div class="podium-info-block">
                    <span class="podium-user-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
                    <span class="podium-user-date">${date}</span>
                </div>
                <div class="podium-score-tag">${item.score.toFixed(1)}%</div>
                <div class="podium-banner">${rankLabel}</div>
            </div>`;
        };

        html += `
        <div class="podium-wrapper">
            ${getPodiumCardHtml(second, 'silver', '2ND PLACE', 2)}
            ${getPodiumCardHtml(first, 'gold', '1ST PLACE', 1)}
            ${getPodiumCardHtml(third, 'bronze', '3RD PLACE', 3)}
        </div>`;
    }

    // Render list for ranks 4-10
    if (listItems.length > 0) {
        html += `
        <div class="contenders-section">
            <div class="contenders-header">
                <span class="contenders-title">Contenders (Ranks 4-10)</span>
                <span class="contenders-count">${listItems.length} active candidates</span>
            </div>
            <div class="contenders-list">`;
        
        listItems.forEach((item, index) => {
            const rank = index + 4;
            const date = new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            let name = 'Anonymous';
            if (item.user_name && !item.user_name.includes('@')) {
                name = item.user_name;
            } else if (item.file_name) {
                name = item.file_name.replace(/\.pdf$/i, '');
                if (name.length > 25) name = name.substring(0, 22) + '...';
            }
            const initial = name.charAt(0).toUpperCase();

            html += `
            <div class="contender-row">
                <div class="contender-left">
                    <span class="contender-rank">#${rank}</span>
                    <div class="contender-avatar">${initial}</div>
                    <div class="contender-info">
                        <p class="contender-name" title="${escapeHtml(name)}">${escapeHtml(name)}</p>
                        <p class="contender-date">${date}</p>
                    </div>
                </div>
                <div class="contender-right">
                    <div class="contender-bar-wrap">
                        <div class="contender-bar-fill" style="width: ${item.score}%"></div>
                    </div>
                    <span class="contender-score">${item.score.toFixed(1)}%</span>
                </div>
            </div>`;
        });

        html += `
            </div>
        </div>`;
    }

    html += '</div>';
    contentEl.innerHTML = html;
}

async function loadHistory() {
    const contentEl = document.getElementById('historyContent');
    const detailEl = document.getElementById('historyDetailContent');
    if (detailEl) detailEl.style.display = 'none';
    contentEl.innerHTML = 'Loading...';
    await refreshAuthUser();
    if (!supabase) { contentEl.innerHTML = 'Could not retrieve user history.'; return; }

    const historyUserId = authUser ? authUser.id : userId;
    let query = supabase
        .from('msc_cv_ai_resume_reviews')
        .select('id, score, created_at, file_name, review_data');

    // Merge authenticated and anonymous histories
    if (authUser && authUser.id && userId) {
        query = query.or(`user_id.eq.${authUser.id},user_id.eq.${userId}`);
    } else {
        query = query.eq('user_id', historyUserId);
    }

    const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) { console.error('Error fetching history:', error); contentEl.innerHTML = `<p class="text-danger">Could not load history. ${error.message}</p>`; return; }
    if (!data?.length) { contentEl.innerHTML = '<p>You have no past reviews.</p>'; return; }

    historyReviews = data;
    const activeId = localStorage.getItem(ACTIVE_REVIEW_KEY);

    let html = '<div class="space-y-2">';
    data.forEach(item => {
        const date = new Date(item.created_at).toLocaleString();
        const isActive = String(item.id) === String(activeId);
        const badges = isActive ? '<span class="history-badge history-badge--active">Viewing</span>' : '';
        html += `<div class="history-item${isActive ? ' is-active' : ''}" data-review-id="${item.id}" role="button" tabindex="0">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="history-file">${escapeHtml(item.file_name || 'Resume')} ${badges}</p>
                            <p class="history-date">${date}</p>
                            <span class="history-open-hint">Open in analysis
                              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px;height:14px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
                            </span>
                        </div>
                        <span class="history-score">${item.score.toFixed(1)}%</span>
                    </div>
                 </div>`;
    });
    html += '</div>';
    contentEl.innerHTML = html;
}

async function showHistoryView() {
    landingSection.style.display = 'none';
    showResults();
    tipsSection.style.display = 'none';
    
    // Clear viewing highlight when checking general history
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('is-active'));
    
    activateTab('history');
    await loadHistory();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Sync mobile menu CTA buttons with results section visibility
(function syncMenuCTAButtons() {
    const resultsEl = document.getElementById('resultsSection');
    const menuCTA = document.getElementById('menuCTAButtons');
    if (!resultsEl || !menuCTA) return;

    function update() {
        const visible = resultsEl.style.display !== 'none' && resultsEl.style.display !== '';
        menuCTA.style.display = visible ? 'flex' : 'none';
    }

    new MutationObserver(update).observe(resultsEl, { attributes: true, attributeFilter: ['style'] });
    update(); // run once on load
})();

// Expose functions globally for console debugging
window.openReviewLoginModal = openReviewLoginModal;
window.openReviewBuyModal = openReviewBuyModal;
window.showContextWarningModal = showContextWarningModal;
window.applyRoleLocks = applyRoleLocks;
window.clearRoleLocks = clearRoleLocks;
window.resetToUploadStage = resetToUploadStage;
window.showNoticeModal = showNoticeModal;
window.closeNoticeModal = closeNoticeModal;

