import { createClient } from '@supabase/supabase-js';
// Using markdown-pdfjs(Created by Manan Bhansali, which is me :-) ) for PDF generation. 

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.7.107/build/pdf.worker.min.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';

let userId = null;
let supabase = null;
let authUser = null;
let isPremiumEnrolled = false;

const IP_REVIEW_LIMIT = 1;
const FREE_USER_LIFETIME_LIMIT = 3;
const IP_REVIEW_COUNT_KEY = 'msc_cv_ip_review_count';

const PREMIUM_COURSES = [
    { title: "CA Articleship Mastery (ITM)", url: "https://mystudentclub.com/courses/industrial-training-mastery", desc: "Complete guide to landing top Big4 & industrial training articleships." },
    { title: "CA Fresher Mastery", url: "https://mystudentclub.com/courses/ca-fresher-mastery", desc: "A-Z placement preparation for newly qualified Chartered Accountants." },
    { title: "Finance & Accounting Mastery", url: "https://mystudentclub.com/courses/finance-mastery", desc: "Core financial modeling, statutory audit, and tax consulting skills." }
];

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

const heroSection = document.getElementById('heroSection');
const uploadSection = document.getElementById('uploadSection');
const uploadPageHistorySection = document.getElementById('uploadPageHistorySection');
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
const downloadReportBtn = document.getElementById('downloadReportBtn');
const startOverBtn = document.getElementById('startOverBtn');
const scoreText = document.getElementById('scoreText');
const scoreProgress = document.getElementById('scoreProgress');
const scoreJustification = document.getElementById('scoreJustification');
const tipsSection = document.getElementById('tipsSection');
const categoryItems = document.querySelectorAll('.category-item');
const recruiterTipsContent = document.querySelector('#recruiterTipsSection .content-area');
const measurableResultsContent = document.querySelector('#measurableResultsSection .content-area');
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
    setupTabs();
    setupCollapsibleSections();
    await loadHistory();

    const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener('click', () => loadHistory());
    }
});

function setupUserId() {
    userId = localStorage.getItem('msc_cv_reviewer_uuid');
    if (!userId) {
        userId = self.crypto.randomUUID();
        localStorage.setItem('msc_cv_reviewer_uuid', userId);
    }
}

function setupTabs() {
    const tabContainer = document.querySelector('.tabs');
    if (!tabContainer) return;
    tabContainer.addEventListener('click', async (e) => {
        const btn = e.target.closest('.tab-btn');
        if (btn) {
            const tabId = btn.dataset.tab;

            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            const targetTab = document.getElementById(`tab-${tabId}`);
            if (targetTab) targetTab.classList.add('active');

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

menuButton.addEventListener('click', (e) => {
    e.stopPropagation();
    expandedMenu.classList.toggle('active');
});

menuCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    expandedMenu.classList.remove('active');
});

const logoutMenuBtn = document.getElementById('logoutMenuBtn');
if (logoutMenuBtn) {
    logoutMenuBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
            if (!supabase) initializeSupabase();
            if (supabase && supabase.auth) {
                await supabase.auth.signOut();
            }
        } catch (err) {
            console.error('Error during logout:', err);
        }
        localStorage.removeItem('msc_cv_ip_review_count');
        localStorage.removeItem('msc_active_review_id');
        window.location.reload();
    });
}

function updateAuthUI() {
    const logoutBtn = document.getElementById('logoutMenuBtn');
    if (logoutBtn) {
        logoutBtn.style.display = authUser ? 'flex' : 'none';
    }
}

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
    else showNoticeModal('Invalid File', 'Please upload a PDF file.');
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file && file.type === 'application/pdf') handleFile(file);
    else showNoticeModal('Invalid File', 'Please upload a PDF file.');
}

async function handleFile(file) {
    selectedFile = file;
    fileName.textContent = file.name;
    fileSize.textContent = formatFileSize(file.size);
    dropArea.style.display = 'none';
    previewArea.style.display = 'flex';
    previewArea.classList.add('flex-col', 'gap-4');

    proceedToReviewBtn.disabled = true;
    proceedToReviewBtn.classList.add('opacity-50', 'cursor-not-allowed');
    removeFileBtn.disabled = true;

    try {
        await generatePdfPreview(file);
        proceedToReviewBtn.disabled = false;
        proceedToReviewBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    } catch (error) {
        showNoticeModal('Error Processing PDF', `Error processing PDF: ${error.message}. Please try another file.`);
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
        localStorage.setItem('import_cv_images', JSON.stringify(pdfImages));
    } catch (error) {
        pdfImages = [];
        throw error;
    }
}

removeFileBtn.addEventListener('click', resetUpload);

function resetUpload() {
    selectedFile = null;
    pdfDocument = null;
    pdfImages = [];
    fileInput.value = '';
    previewArea.style.display = 'none';
    dropArea.style.display = 'block';
    fileName.textContent = 'document.pdf';
    fileSize.textContent = '0 KB';
    previewThumbnail.innerHTML = '';
    proceedToReviewBtn.disabled = true;
    proceedToReviewBtn.classList.add('opacity-50', 'cursor-not-allowed');
}

// proceedToReviewBtn triggers analyzeCv directly

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
    isPremiumEnrolled = false;

    if (authUser) {
        try {
            const { count, error } = await supabase
                .from('enrollment')
                .select('course', { count: 'exact', head: true })
                .eq('uuid', authUser.id);
            if (!error && count > 0) {
                isPremiumEnrolled = true;
            }
        } catch (e) {
            console.warn('Error checking premium enrollment:', e);
        }
    }
    updateAuthUI();
}

proceedToReviewBtn.addEventListener('click', analyzeCv);

async function analyzeCv() {
    if (!selectedFile || pdfImages.length === 0) {
        showNoticeModal('PDF Not Ready', 'Please wait for the PDF preview and processing to complete.');
        return;
    }

    await refreshAuthUser();

    // 1) Guest Logged-Out Users: 1 Free Review limit -> prompt Login/Signup
    if (!authUser) {
        const ipCount = getIpReviewCount();
        if (ipCount >= IP_REVIEW_LIMIT) {
            openReviewLoginModal();
            return;
        }
    }
    // 2) Free Logged-In Users: 3 Lifetime Reviews limit -> prompt Course Enrollment
    else if (!isPremiumEnrolled) {
        const lifetimeCount = await getFreeUserLifetimeCount();
        if (lifetimeCount >= FREE_USER_LIFETIME_LIMIT) {
            openReviewBuyModal();
            const titleEl = document.getElementById('reviewBuyTitle');
            if (titleEl) titleEl.textContent = "You've used all 3 free reviews";
            return;
        }
    }

    const selectedDomain = 'Financing';
    const selectedSpecialization = 'Accounting';

    heroSection.style.display = 'none';
    uploadSection.style.display = 'none';
    if (uploadPageHistorySection) uploadPageHistorySection.style.display = 'none';
    loadingSection.style.display = 'block';
    resultsSection.style.display = 'none';
    tipsSection.style.display = 'none';

    loadingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });

    startLoadingAnimation();
    clearResultsContent();

    try {
        const response = await fetch('https://cv-reviewer.bhansalimanan55.workers.dev/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Domain': 'Financing',
                'X-Specialization': 'Accounting',
                'Origin': window.location.origin
            },
            body: JSON.stringify({ images: pdfImages })
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

        // Check if the uploaded resume is out of context (Non-CA/Finance CV)
        if (analysisResultText.includes('<<<OUT_OF_CONTEXT>>>')) {
            let msg = analysisResultText.replace('<<<OUT_OF_CONTEXT>>>', '').trim();
            if (!msg) {
                msg = "This AI CV Reviewer is custom-built exclusively for Chartered Accountants (CA), Finance, and Accounting professionals. Please upload a relevant resume.";
            }
            stopLoadingAnimation();
            loadingSection.style.display = 'none';
            uploadSection.style.display = 'block';
            if (heroSection) heroSection.style.display = 'block';
            showContextWarningModal(msg);
            return;
        }

        await refreshAuthUser();
        processStructuredResults(analysisResultText);
        applyRoleLocks();
        await saveReview(analysisResultText);

        if (!authUser) {
            incrementIpReviewCount();
        }

        loadingSection.style.display = 'none';
        resultsSection.style.display = 'block';
        tipsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
        stopLoadingAnimation();
        loadingSection.style.display = 'none';
        showNoticeModal('Analysis Failed', `Error during analysis: ${error.message}. Please try again later.`);
        resetToUploadStageOnError();
    }
}

async function saveReview(reviewText) {
    if (!supabase) return;

    const score = extractOverallScoreValue(reviewText);

    const insertPayload = {
        user_id: authUser ? authUser.id : userId,
        user_name: authUser ? (authUser.user_metadata?.full_name || authUser.email || 'User') : null,
        score, review_data: { review: reviewText }, file_name: selectedFile.name
    };

    const { error } = await supabase.from('msc_cv_ai_resume_reviews').insert([insertPayload]);
    if (error) console.error('Error saving review to Supabase:', error);
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
    const loadingProgressText = document.getElementById('loadingProgressText');
    if (loadingProgressText) loadingProgressText.textContent = "Hang tight as we prepare the next steps!";
    updateLoadingChecklist(0);

    currentProgressInterval = setInterval(() => {
        if (loadingProgressText) loadingProgressText.textContent = stages[stage % stages.length];
        updateLoadingChecklist(stage);
        stage++;
    }, 3000);
}

function stopLoadingAnimation() {
    if (currentProgressInterval) {
        clearInterval(currentProgressInterval);
        currentProgressInterval = null;
    }
    const loadingProgressText = document.getElementById('loadingProgressText');
    if (loadingProgressText) loadingProgressText.textContent = "Processing complete!";
}

function resetLoadingChecklist() {
    for (let num = 1; num <= 4; num++) {
        const stepEl = document.getElementById(`loadStep${num}`);
        if (!stepEl) continue;
        stepEl.className = 'loading-step';
        const bulletEl = stepEl.querySelector('.step-bullet');
        if (bulletEl) bulletEl.innerHTML = '';
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

    const checkIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const spinIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

    for (let num = 1; num <= 4; num++) {
        const stepEl = document.getElementById(`loadStep${num}`);
        if (!stepEl) continue;
        const bulletEl = stepEl.querySelector('.step-bullet');

        if (num < currentStep) {
            stepEl.className = 'loading-step completed';
            if (bulletEl) bulletEl.innerHTML = checkIcon;
        } else if (num === currentStep) {
            stepEl.className = 'loading-step active';
            if (bulletEl && !bulletEl.querySelector('svg')) {
                bulletEl.innerHTML = spinIcon;
            }
        } else {
            stepEl.className = 'loading-step';
            if (bulletEl) bulletEl.innerHTML = '';
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

function extractOverallScoreValue(text) {
    if (!text) return 0;
    const scoreSection = extractSectionContent(text, '<<<OVERALL_SCORE>>>', '<<<END_OVERALL_SCORE>>>');
    let overallScore = 0;

    if (scoreSection) {
        const scoreMatch = scoreSection.match(/Score:\s*\**([\d.]+)\**\s*\/\s*100/i) ||
                           scoreSection.match(/Score:\s*\**([\d.]+)\**/i) ||
                           scoreSection.match(/([\d.]+)\s*\/\s*100/i) ||
                           scoreSection.match(/Score\s*[:=]\s*([\d.]+)/i);
        if (scoreMatch && scoreMatch[1]) {
            overallScore = parseFloat(scoreMatch[1]);
        }
    }

    if (!overallScore || isNaN(overallScore)) {
        const fallbackMatch = text.match(/<score>([\d.]+)<\/score>/i) ||
                              text.match(/Overall Score:\s*\**([\d.]+)\**/i) ||
                              text.match(/Score:\s*\**([\d.]+)\**\s*\/\s*100/i) ||
                              text.match(/Score:\s*\**([\d.]+)\**/i) ||
                              text.match(/([\d.]+)\s*\/\s*100/i);
        if (fallbackMatch && fallbackMatch[1]) {
            overallScore = parseFloat(fallbackMatch[1]);
        }
    }

    return isNaN(overallScore) ? 0 : Math.min(Math.max(overallScore, 0), 100);
}

function parseAndDisplayOverallScore(text) {
    if (!text) return 0;

    const overallScore = extractOverallScoreValue(text);
    const scoreSection = extractSectionContent(text, '<<<OVERALL_SCORE>>>', '<<<END_OVERALL_SCORE>>>');
    let justification = "";

    if (scoreSection) {
        const justMatch = scoreSection.match(/Justification:\s*([\s\S]+)/i);
        if (justMatch && justMatch[1]) {
            justification = justMatch[1].trim();
        } else {
            justification = scoreSection.replace(/Score:\s*\**[\d.]+\**(?:\/\d+)?/gi, '').trim();
        }
    }

    if (!justification) {
        justification = "Score justification based on comprehensive AI resume audit.";
    }

    animateScore(overallScore);

    if (scoreJustification) {
        scoreJustification.innerHTML = formatFeedbackText(justification);
    }

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
            html += `<p class="mb-1 text-sm"><strong>Original:</strong> <code class="text-xs">${originalMatch[1].trim()}</code></p>`;
        }
        if (critiqueMatch && critiqueMatch[1]) {
            html += `<p class="mb-2 text-sm"><strong>Critique:</strong> ${formatFeedbackText(critiqueMatch[1].trim())}</p>`;
        }

        const allSuggestions = [...point.matchAll(/Rewrite Suggestion \d+:\s*([\s\S]+?)(?=Rewrite Suggestion \d+:|$)/gi)];

        if (allSuggestions.length > 0) {
            html += `<div class="mt-2 text-sm"><strong>Rewrite Suggestions:</strong>`;
            html += `<ul class="list-none ml-0 mt-1 space-y-1">`;
            allSuggestions.forEach(match => {
                const suggestionText = match[1].trim();
                if (suggestionText) {
                    html += `<li class="rewrite-suggestion">${simpleMarkdownToHtml(suggestionText)}</li>`;
                }
            });
            html += `</ul></div>`;
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
            html += `<p class="mb-1 text-sm"><strong>Original:</strong> <code class="text-xs">${originalMatch[1].trim()}</code></p>`;
        }
        if (critiqueMatch && critiqueMatch[1]) {
            html += `<p class="mb-2 text-sm"><strong>Critique:</strong> ${formatFeedbackText(critiqueMatch[1].trim())}</p>`;
        }

        const allSuggestions = [...point.matchAll(/Rewrite Suggestion \d+:\s*([\s\S]+?)(?=Rewrite Suggestion \d+:|$)/gi)];

        if (allSuggestions.length > 0) {
            html += `<div class="mt-2 text-sm"><strong>Rewrite Suggestions:</strong>`;
            html += `<ul class="list-none ml-0 mt-1 space-y-1">`;
            allSuggestions.forEach(match => {
                const suggestionText = match[1].trim();
                if (suggestionText) {
                    html += `<li class="rewrite-suggestion">${simpleMarkdownToHtml(suggestionText)}</li>`;
                }
            });
            html += `</ul></div>`;
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
        return `<div class="grammar-correction mb-2"><span class="original-text">${original}</span> <span class="text-lg mx-1 text-gray-400">&rarr;</span> <span class="corrected-text">${corrected}</span> ${issueHtml}</div>`;
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
}

function lockPillHTML() {
    return `<span class="section-lock-pill"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="12" height="12"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>Locked</span>`;
}

function lockPanelHTML() {
    return `
    <div class="lock-panel">
      <div class="lock-skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
      <div class="lock-overlay">
        <span class="lock-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="28" height="28"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
        </span>
        <h4>Unlock the full report</h4>
        <p>Enroll in any MSC course to unlock complete detailed recommendations, phrasing rewrites, and skill gap analyses.</p>
        <button type="button" class="lock-cta open-buy-modal-btn">Enroll to Unlock Full Report
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
        </button>
      </div>
    </div>`;
}

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
        downloadReportBtn.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>Unlock full report`;
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
    }
}

document.addEventListener('click', (e) => {
    // Open Buy Modal from lock CTA
    const lockBtn = e.target.closest('.lock-cta, .open-buy-modal-btn');
    if (lockBtn) {
        e.preventDefault();
        openReviewBuyModal();
        return;
    }

    // Close Login Modal (X button, cancel button, or clicking overlay backdrop)
    if (e.target.closest('#reviewLoginClose, #closeReviewLoginBtn, #cancelReviewLoginBtn') || e.target === document.getElementById('reviewLoginOverlay')) {
        closeReviewLoginModal();
    }

    // Close Buy Modal (X button, cancel button, or clicking overlay backdrop)
    if (e.target.closest('#reviewBuyClose, #closeReviewBuyBtn, #cancelReviewBuyBtn') || e.target === document.getElementById('reviewBuyOverlay')) {
        closeReviewBuyModal();
    }

    // Close Context Warning Modal (X button, Got It button, or clicking overlay backdrop)
    if (e.target.closest('#contextWarningClose, #contextWarningBtn, #closeContextWarningBtn, #ackContextWarningBtn') || e.target === document.getElementById('contextWarningOverlay')) {
        closeContextWarningModal();
    }

    // Close Notice / Error Modal (X button, Dismiss button, or clicking overlay backdrop)
    if (e.target.closest('#noticeModalClose, #noticeModalBtn, #closeNoticeModalBtn, #ackNoticeModalBtn') || e.target === document.getElementById('noticeModalOverlay')) {
        closeNoticeModal();
    }

    // Universal fallback: Any .trial-modal-close button closes its parent modal overlay
    const closeBtn = e.target.closest('.trial-modal-close');
    if (closeBtn) {
        const overlay = closeBtn.closest('.trial-modal-overlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeReviewLoginModal();
        closeReviewBuyModal();
        closeContextWarningModal();
        closeNoticeModal();
    }
});

function ensureUploadSectionVisible() {
    if (resultsSection && resultsSection.style.display === 'block') return;
    if (loadingSection && loadingSection.style.display === 'block') return;
    if (heroSection) heroSection.style.display = 'block';
    if (uploadSection) uploadSection.style.display = 'block';
    if (uploadPageHistorySection) uploadPageHistorySection.style.display = 'block';
}

function openReviewLoginModal() {
    const overlay = document.getElementById('reviewLoginOverlay');
    if (overlay) overlay.classList.add('active');
}
function closeReviewLoginModal() {
    const overlay = document.getElementById('reviewLoginOverlay');
    if (overlay) overlay.classList.remove('active');
    ensureUploadSectionVisible();
}

function openReviewBuyModal() {
    const list = document.getElementById('reviewBuyCourseList');
    if (list) {
        list.innerHTML = PREMIUM_COURSES.map(c => `
            <a class="trial-course-card" href="${c.url}" target="_blank" rel="noopener noreferrer">
                <span class="trial-course-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 10 12 5 2 10l10 5 10-5z"></path>
                        <path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5"></path>
                    </svg>
                </span>
                <div class="trial-course-info">
                    <div class="trial-course-title">${c.title}</div>
                    <div class="trial-course-desc">${c.desc}</div>
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
    ensureUploadSectionVisible();
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
    ensureUploadSectionVisible();
}

window.openReviewLoginModal = openReviewLoginModal;
window.openReviewBuyModal = openReviewBuyModal;
window.showContextWarningModal = showContextWarningModal;
window.showNoticeModal = showNoticeModal;
window.closeNoticeModal = closeNoticeModal;

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
        .replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-700 px-1 rounded text-sm">$1</code>')
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
        .replace(/<\/(ul|ol)>\s*<\1>/g, '')
        .replace(/(\r\n|\n|\r)/g, '<br>')
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
    // After sentence boundaries followed by a capital letter -> start a new markdown bullet
    out = out.replace(/([.!?])\s+(?=[A-Z])/g, '$1\n- ');

    // After ISSUE markers when explanation continues
    out = out.replace(
        /(\[ISSUE(?:\s*-\s*SEVERITY:\s*(?:Critical|High|Moderate|Low))?[^\]]*\])\.?\s+([A-Z])/gi,
        '$1\n- $2'
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

    // 0a) Separate adjacent [GOOD] [ISSUE...] tags so [ISSUE...] starts on a new bullet line
    processedText = processedText.replace(/(\[GOOD\])\s*(\[ISSUE(?:\s*-\s*SEVERITY:\s*(?:Critical|High|Moderate|Low))?[^\]]*\])/gi, '$1\n• $2');

    // 0b) If an [ISSUE...] tag is on a line by itself before a bullet item, attach it to the bullet text
    processedText = processedText.replace(/(\u2022\s*)?(\[ISSUE(?:\s*-\s*SEVERITY:\s*(?:Critical|High|Moderate|Low))?[^\]]*\])\s*\n\s*(?:[\u2022\*\-]\s*)?/gi, '\n• $2 ');

    // 1) Separate inline label header from first bullet item if on same line
    processedText = processedText.replace(/^(\s*(?:\*\s*)?\*\*([^*:]+):\*\*)[ \t]+(?=[A-Z]|\[)/gm, '$1\n• ');

    // 2) After sentence boundaries (optionally followed by GOOD status tag), start a new bullet
    processedText = processedText.replace(
        /([.!?](?:\s*\[GOOD\])?)[ \t]+(?=[A-Z]|\[(?:GOOD|ISSUE))/gi,
        '$1\n• '
    );
    // 3) Convert inline numbered items (1. 2. 3. etc.) to bullet points
    // First, handle patterns like "text. 1. more" or "text 1. more" - any " N. " pattern
    processedText = processedText.replace(/\s+(\d+)\.\s+/g, '\n• ');
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

    // Clean up empty paragraphs
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<\/p>\s*<\/p>/g, '</p>');
    html = html.replace(/<p>\s*<p/g, '<p');

    return html;
}

function animateScore(score) {
    let currentScore = 0;
    const duration = 1500;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = score / steps;

    const scoreTextEl = document.getElementById('scoreText');
    const scoreGradeBadge = document.getElementById('scoreGradeBadge');

    const updateGradeBadge = (val) => {
        if (!scoreGradeBadge) return;
        if (val >= 80) {
            scoreGradeBadge.textContent = 'Excellent';
            scoreGradeBadge.className = 'score-badge score-badge-excel';
        } else if (val >= 65) {
            scoreGradeBadge.textContent = 'Good';
            scoreGradeBadge.className = 'score-badge score-badge-good';
        } else if (val >= 45) {
            scoreGradeBadge.textContent = 'Average';
            scoreGradeBadge.className = 'score-badge score-badge-avg';
        } else {
            scoreGradeBadge.textContent = 'Needs Work';
            scoreGradeBadge.className = 'score-badge score-badge-low';
        }
    };

    const scoreInterval = setInterval(() => {
        currentScore += increment;
        if (currentScore >= score) {
            currentScore = score;
            clearInterval(scoreInterval);
        }
        const displayScore = currentScore.toFixed(1).replace(/\.0$/, '');
        if (scoreTextEl) scoreTextEl.textContent = displayScore;
        const clampedDash = Math.min(currentScore, 100);
        if (scoreProgress) scoreProgress.setAttribute('stroke-dasharray', `${clampedDash.toFixed(1)}, 100`);
        updateGradeBadge(currentScore);
    }, stepTime);
}

function updateScoreBreakdown(overallScore, resultsText) {
    const categoryScores = {};
    const scorePatterns = {
        structure: /(?:Structure|Completeness).*?(\d+)\s*\/\s*20/i,
        impact: /(?:Impact|Demonstration).*?(\d+)\s*\/\s*25/i,
        expertise: /(?:Professional|Expertise).*?(\d+)\s*\/\s*25/i,
        experience: /(?:Experience|Description).*?(\d+)\s*\/\s*20/i,
        presentation: /(?:Overall|Presentation).*?(\d+)\s*\/\s*10/i
    };

    if (resultsText) {
        for (const [key, pattern] of Object.entries(scorePatterns)) {
            const match = resultsText.match(pattern);
            if (match && match[1]) {
                categoryScores[key] = parseInt(match[1], 10);
            }
        }
    }

    const safeOverallScore = (typeof overallScore === 'number' && !isNaN(overallScore)) ? overallScore : 0;

    categoryItems.forEach(item => {
        const categoryKey = item.dataset.category;
        const pointsEl = item.querySelector('.points');
        const fillBar = item.querySelector('.category-fill');
        if (!pointsEl) return;

        const maxPointsText = pointsEl.textContent.split('/')[1];
        if (!maxPointsText) return;
        const maxPointsMatch = maxPointsText.match(/\d+/);
        if (!maxPointsMatch) return;
        const maxPoints = parseInt(maxPointsMatch[0], 10);

        let calculatedPoints = 0;
        let percentage = 0;

        if (categoryScores[categoryKey] !== undefined) {
            calculatedPoints = Math.min(categoryScores[categoryKey], maxPoints);
            percentage = (calculatedPoints / maxPoints) * 100;
        } else {
            calculatedPoints = Math.round((safeOverallScore / 100) * maxPoints);
            percentage = safeOverallScore;
        }

        pointsEl.textContent = `${calculatedPoints}/${maxPoints} pts`;
        if (fillBar) fillBar.style.width = `${Math.min(percentage, 100)}%`;
    });
}

startOverBtn.addEventListener('click', resetToUploadStage);

function resetToUploadStage() {
    resetUpload();
    resultsSection.style.display = 'none';
    tipsSection.style.display = 'none';
    //domainSpecializationSection.style.display = 'none';
    loadingSection.style.display = 'none';
    heroSection.style.display = 'block';
    uploadSection.style.display = 'block';
    if (uploadPageHistorySection) uploadPageHistorySection.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Re-initialize supabase client in case user ID was just set.
    if (!supabase) initializeSupabase();
}

downloadReportBtn.addEventListener('click', () => {
    if (!analysisResultText) {
        alert("No analysis report available to preview.");
        return;
    }
    if (!window.MarkdownPDF) {
        alert("PDF generator not available. Please reload the page.");
        return;
    }
    const cleaned = cleanRawText(analysisResultText);
    const safeFileName = (selectedFile ? selectedFile.name.replace(/\.pdf$/i, '') : 'CV')
        .replace(/[^a-z0-9_.-]/gi, '_');
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
    resultsSection.style.display = 'none';
    tipsSection.style.display = 'none';
    //domainSpecializationSection.style.display = 'none';
    resetUpload();
    uploadSection.style.display = 'block';
    if (uploadPageHistorySection) uploadPageHistorySection.style.display = 'block';
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
    contentEl.innerHTML = '<p class="text-sm text-text-secondary">Loading leaderboard...</p>';
    await refreshAuthUser();
    if (!supabase || !authUser) {
        contentEl.innerHTML = '<p class="text-sm text-text-secondary">You must be logged in to view and be part of the leaderboard.</p>';
        return;
    }
    const { data, error } = await supabase
        .from('msc_cv_ai_resume_reviews')
        .select('score, created_at, file_name, user_name')
        .order('score', { ascending: false })
        .limit(10);
    if (error) {
        console.error('Error fetching leaderboard:', error);
        contentEl.innerHTML = `<p class="text-danger text-sm">Could not load leaderboard data. ${error.message}</p>`;
        return;
    }
    if (!data?.length) {
        contentEl.innerHTML = '<p class="text-sm text-text-secondary">No entries yet. Be the first!</p>';
        return;
    }
    let html = '<div class="leaderboard-list space-y-2.5">';
    data.forEach((item, index) => {
        const date = new Date(item.created_at).toLocaleDateString();
        let name = 'Anonymous';
        if (item.user_name && !item.user_name.includes('@')) {
            name = item.user_name;
        } else if (item.file_name) {
            name = item.file_name;
        }
        const rank = index + 1;
        let rankBadgeClass = 'rank-badge-other';
        if (rank === 1) rankBadgeClass = 'rank-badge-1';
        else if (rank === 2) rankBadgeClass = 'rank-badge-2';
        else if (rank === 3) rankBadgeClass = 'rank-badge-3';

        html += `
            <div class="leaderboard-card p-3 rounded-xl border border-border bg-background-light flex items-center justify-between gap-3">
                <div class="flex items-center gap-3 min-w-0 flex-1">
                    <span class="rank-badge ${rankBadgeClass}">${rank}</span>
                    <div class="min-w-0 flex-1">
                        <p class="font-semibold text-text truncate text-sm" title="${name}">${name}</p>
                        <p class="text-xs text-text-secondary">${date}</p>
                    </div>
                </div>
                <div class="text-right flex-shrink-0">
                    <span class="font-bold text-base text-primary">${item.score.toFixed(1)}%</span>
                </div>
            </div>`;
    });
    html += '</div>';
    contentEl.innerHTML = html;
}

async function loadHistory() {
    const uploadHistoryEl = document.getElementById('historyContent');
    const tabHistoryEl = document.getElementById('tabHistoryContent');

    if (uploadHistoryEl) uploadHistoryEl.innerHTML = '<p class="text-sm text-text-secondary">Loading...</p>';
    if (tabHistoryEl) tabHistoryEl.innerHTML = '<p class="text-sm text-text-secondary">Loading...</p>';

    await refreshAuthUser();
    if (!supabase) {
        const msg = '<p class="text-sm text-text-secondary">Could not retrieve user history.</p>';
        if (uploadHistoryEl) uploadHistoryEl.innerHTML = msg;
        if (tabHistoryEl) tabHistoryEl.innerHTML = msg;
        return;
    }

    const historyUserId = authUser ? authUser.id : userId;
    const { data, error } = await supabase
        .from('msc_cv_ai_resume_reviews')
        .select('id, score, created_at, file_name, review_data')
        .eq('user_id', historyUserId)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching history:', error);
        const errorMsg = `<p class="text-danger text-sm">Could not load history. ${error.message}</p>`;
        if (uploadHistoryEl) uploadHistoryEl.innerHTML = errorMsg;
        if (tabHistoryEl) tabHistoryEl.innerHTML = errorMsg;
        return;
    }

    if (!data?.length) {
        const emptyMsg = '<p class="text-sm text-text-secondary">You have no past reviews.</p>';
        if (uploadHistoryEl) uploadHistoryEl.innerHTML = emptyMsg;
        if (tabHistoryEl) tabHistoryEl.innerHTML = emptyMsg;
        return;
    }

    let html = '<div class="space-y-2.5">';
    data.forEach(item => {
        let displayScore = item.score;
        if ((!displayScore || displayScore === 0) && item.review_data && item.review_data.review) {
            displayScore = extractOverallScoreValue(item.review_data.review);
        }
        const date = new Date(item.created_at).toLocaleString();
        html += `<div class="history-item p-3 rounded-xl border border-border bg-background-light cursor-pointer transition-all hover:border-primary" data-review-id="${item.id}">
                    <div class="flex justify-between items-center gap-3">
                        <div class="min-w-0 flex-1">
                            <p class="font-semibold text-text truncate text-sm" title="${item.file_name}">${item.file_name}</p>
                            <p class="text-xs text-text-secondary">${date}</p>
                        </div>
                        <span class="font-bold text-base text-primary flex-shrink-0">${Number(displayScore).toFixed(1)}%</span>
                    </div>
                 </div>`;
    });
    html += '</div>';

    if (uploadHistoryEl) uploadHistoryEl.innerHTML = html;
    if (tabHistoryEl) tabHistoryEl.innerHTML = html;

    const handleHistoryClick = (e) => {
        const itemEl = e.target.closest('.history-item');
        if (itemEl) {
            const reviewId = itemEl.dataset.reviewId;
            const reviewData = data.find(r => r.id == reviewId);
            if (reviewData && reviewData.review_data && reviewData.review_data.review) {
                analysisResultText = reviewData.review_data.review;
                if (fileName) fileName.textContent = reviewData.file_name || 'document.pdf';

                processStructuredResults(analysisResultText);
                applyRoleLocks();

                // Switch active tab back to Analysis
                document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
                const analysisBtn = document.querySelector('.tab-btn[data-tab="analysis"]');
                if (analysisBtn) analysisBtn.classList.add('active');

                document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
                const analysisTab = document.getElementById('tab-analysis');
                if (analysisTab) analysisTab.classList.add('active');

                heroSection.style.display = 'none';
                uploadSection.style.display = 'none';
                if (uploadPageHistorySection) uploadPageHistorySection.style.display = 'none';
                loadingSection.style.display = 'none';

                resultsSection.style.display = 'block';
                tipsSection.style.display = 'block';
                resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    };

    if (uploadHistoryEl) uploadHistoryEl.onclick = handleHistoryClick;
    if (tabHistoryEl) tabHistoryEl.onclick = handleHistoryClick;
}


