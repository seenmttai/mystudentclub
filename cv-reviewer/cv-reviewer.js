import { createClient } from '@supabase/supabase-js';
// Using markdown-pdfjs(Created by Manan Bhansali, which is me :-) ) for PDF generation. 

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.7.107/build/pdf.worker.min.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';

let userId = null;
let supabase = null;
let authUser = null;

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
        if (e.target.matches('.tab-btn')) {
            const tabId = e.target.dataset.tab;

            document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');

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

proceedToReviewBtn.addEventListener('click', () => {
    if (!selectedFile || pdfImages.length === 0) {
        alert("Please wait for the PDF preview and processing to complete.");
        return;
    }
    uploadSection.style.display = 'none';
    //domainSpecializationSection.style.display = 'block';
    //domainSpecializationSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

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
}

proceedToReviewBtn.addEventListener('click', analyzeCv);

async function analyzeCv() {
    if (!selectedFile || pdfImages.length === 0) {
        alert('PDF not processed correctly. Please re-upload.');
        return;
    }

    const selectedDomain = 'Financing';
    const selectedSpecialization = 'Accounting';

    heroSection.style.display = 'none';
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
        console.log(analysisResultText);

        processStructuredResults(analysisResultText);
        await refreshAuthUser();
        await saveReview(analysisResultText);

        loadingSection.style.display = 'none';
        resultsSection.style.display = 'block';
        tipsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    } catch (error) {
        stopLoadingAnimation();
        loadingSection.style.display = 'none';
        alert(`Error during analysis: ${error.message}. Please try again later.`);
        resetToUploadStageOnError();
    }
}

async function saveReview(reviewText) {
    if (!supabase) return;

    const scoreSection = extractSectionContent(reviewText, '<<<OVERALL_SCORE>>>', '<<<END_OVERALL_SCORE>>>');
    let score = 0; const m = scoreSection?.match(/Score:\s*([\d.]+)\/100/i); if (m) score = parseFloat(parseFloat(m[1]).toFixed(2));

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
    let stage = 0;
    const stages = [
        "Uploading resume securely...",
        "Analyzing document structure...",
        "Extracting key skills and experience...",
        "Evaluating alignment with " + "Financing" + " standards...",
        "Assessing impact and achievements...",
        "Checking grammar and readability...",
        "Generating tailored recommendations for " + "Domain" + "...",
        "Compiling your detailed report...",
        "Finalizing results..."
    ];
    loadingProgressText.textContent = "Hang tight as we prepare the next steps!";

    currentProgressInterval = setInterval(() => {
        loadingProgressText.textContent = stages[stage % stages.length];
        stage++;
    }, 3000);
}

function stopLoadingAnimation() {
    if (currentProgressInterval) {
        clearInterval(currentProgressInterval);
        currentProgressInterval = null;
    }
    loadingProgressText.textContent = "Processing complete!";
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
        return `<div class="grammar-correction mb-2"><span class="original-text">${original}</span> <span class="text-lg mx-1 text-gray-400">â†’</span> <span class="corrected-text">${corrected}</span> ${issueHtml}</div>`;
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
    // After sentence boundaries followed by a capital letter â†’ start a new markdown bullet
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

    // The model often returns long paragraphs. Break them into bullet-friendly lines:
    // 1) After sentence boundaries (., ?, !) followed by a capital letter â†’ new bullet
    processedText = processedText.replace(/([.!?])\s+(?=[A-Z])/g, '$1\nâ€¢ ');
    // 2) After ISSUE markers when explanation continues
    processedText = processedText.replace(/(\[ISSUE(?:\s*-\s*SEVERITY:\s*(?:Critical|High|Moderate|Low))?[^\]]*\])\.?\s+([A-Z])/gi, '$1\nâ€¢ $2');
    // 3) Ensure inline numbered items become separate lines
    processedText = processedText.replace(/(\d)\.\s+([A-Z])/g, '\n$1. $2');

    // STEP 2: Convert to HTML
    let html = simpleMarkdownToHtml(processedText);

    // Replace [GOOD] with simple âœ“ symbol  
    html = html.replace(/\[GOOD\]/g, '<span class="highlight-good" title="Good point">âœ“</span>');

    // Replace [ISSUE] with simple âœ— symbol (without severity)
    html = html.replace(/\[ISSUE\](?!\s*-\s*SEVERITY)/g, '<span class="highlight-issue" title="Area for improvement">âœ—</span>');

    // Replace [ISSUE - SEVERITY: Level] with compact severity badges
    html = html.replace(/\[ISSUE\s*-\s*SEVERITY:\s*(Critical|High|Moderate|Low)(?:[^\]]*)\]/gi, (match, severity) => {
        const level = severity.toLowerCase();
        return `<span class="highlight-issue" title="Issue">âœ—</span><span class="severity-badge severity-${level}">${severity}</span>`;
    });

    // Format section labels: "*   *Label:*" pattern from prompt
    html = html.replace(/<br>\s*\*\s+\*\*([^*:]+):\*\*/g, '</p><h4 class="feedback-label">$1:</h4><p>');
    html = html.replace(/^\*\s+\*\*([^*:]+):\*\*/gm, '<h4 class="feedback-label">$1:</h4>');

    // Also handle simpler bold labels: "**Label:**"
    html = html.replace(/<br>\s*\*\*([^*:]+):\*\*/g, '</p><h4 class="feedback-label">$1:</h4><p>');

    // Convert bullet markers (â€¢ ) to styled paragraphs - strip the â€¢ since CSS adds it via ::before
    html = html.replace(/<br>\s*â€¢\s*/g, '</p><p class="feedback-bullet">');
    html = html.replace(/<p>â€¢\s*/g, '<p class="feedback-bullet">');
    html = html.replace(/^â€¢\s*/gm, '');

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

    const scoreInterval = setInterval(() => {
        currentScore += increment;
        if (currentScore >= score) {
            currentScore = score;
            clearInterval(scoreInterval);
        }
        const displayScore = currentScore.toFixed(1).replace(/\.0$/, '');
        scoreTextEl.textContent = displayScore;
        const clampedDash = Math.min(currentScore, 100);
        scoreProgress.setAttribute('stroke-dasharray', `${clampedDash.toFixed(1)}, 100`);
    }, stepTime);
}

function updateScoreBreakdown(overallScore, resultsText) {

    const categoryScores = {};
    const scorePatterns = {
        structure: /Structure.*?Completeness.*?(\d+)\s*\/\s*20/i,
        impact: /Impact.*?Demonstration.*?(\d+)\s*\/\s*25/i,
        expertise: /Professional.*?Expertise.*?(\d+)\s*\/\s*25/i,
        experience: /Experience.*?Description.*?(\d+)\s*\/\s*20/i,
        presentation: /Overall.*?Presentation.*?(\d+)\s*\/\s*10/i
    };

    let foundSpecificScores = true;
    for (const [key, pattern] of Object.entries(scorePatterns)) {
        const match = resultsText.match(pattern);
        if (match && match[1]) {
            categoryScores[key] = parseInt(match[1], 10);
        } else {
            foundSpecificScores = false;

        }
    }

    categoryItems.forEach(item => {
        const categoryKey = item.dataset.category;
        const pointsEl = item.querySelector('.points');
        const fillBar = item.querySelector('.category-fill');
        const maxPointsText = pointsEl.textContent.split('/')[1];
        if (!maxPointsText) return;
        const maxPoints = parseInt(maxPointsText.match(/\d+/)[0], 10);

        let calculatedPoints = 0;
        let percentage = 0;

        if (foundSpecificScores && categoryScores[categoryKey] !== undefined) {
            calculatedPoints = Math.min(categoryScores[categoryKey], maxPoints);
            percentage = (calculatedPoints / maxPoints) * 100;
        } else {

            calculatedPoints = Math.round((overallScore / 100) * maxPoints);
            percentage = overallScore;
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
        My Student Club Â· CV Analysis Report
      </div>`;
    const footerHtml = `
      <div style="text-align:center;padding:6px 0;font-size:10px;color:#6b7280;font-family:'Poppins',sans-serif;">
        Generated ${new Date().toLocaleDateString()}
      </div>`;
    const pdfCss = `
      * { box-sizing: border-box; }
      body { font-family: 'Poppins', sans-serif; color: #0f172a; }
      h1, h2, h3 { color: #111827; font-weight:700; }
      p, li { color: #374151; line-height: 1.6; font-size: 12px; }
      ul, ol { margin: 0 0 10px 18px; padding: 0; }
      .good-marker { color: #059669; font-weight: 700; }
      .issue-marker { color: #dc2626; font-weight: 700; }
      .sev-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; margin-left: 4px; }
      .sev-critical { background: #fee2e2; color: #991b1b; }
      .sev-high { background: #ffedd5; color: #9a3412; }
      .sev-moderate { background: #fef3c7; color: #92400e; }
      .sev-low { background: #f0fdf4; color: #065f46; }
    `;
    const markdown = `# CV Analysis Report\n\n${fixInlineCodeMarkdown(cleaned)}`;

    pdfPreviewContainer.innerHTML = '';
    MarkdownPDF.render(markdown, pdfPreviewContainer, {
        css: pdfCss,
        header: headerHtml,
        footer: footerHtml
    });

    pdfPreviewModal.style.display = 'block';

    const onDownload = () => {
        MarkdownPDF.download(markdown, {
            filename: `${safeFileName}_Analysis_Report.pdf`,
            format: 'a4',
            orientation: 'portrait',
            margin: 12,
            css: pdfCss,
            header: headerHtml,
            footer: footerHtml
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
    out = out.replace(/\[GOOD\]/g, '<span class="good-marker">âœ“</span>');
    out = out.replace(/\[ISSUE\](?!\s*-\s*SEVERITY)/g, '<span class="issue-marker">âœ—</span>');
    out = out.replace(/\[ISSUE\s*-\s*SEVERITY:\s*(Critical|High|Moderate|Low)(?:[^\]]*)\]/gi, (match, severity) => {
        const level = severity.toLowerCase();
        return `<span class="issue-marker">âœ—</span><span class="sev-badge sev-${level}">${severity}</span>`;
    });

    // Split sentences for better readability in PDF
    out = out.replace(/([.!?])\s{2,}([A-Z])/g, '$1\n\n$2');

    return out;
}

async function loadLeaderboard() {
    const contentEl = document.getElementById('leaderboardContent');
    contentEl.innerHTML = 'Loading...';
    await refreshAuthUser();
    if (!supabase || !authUser) {
        contentEl.innerHTML = 'You must be logged in to view and be part of the leaderboard.';
        return;
    }
    const { data, error } = await supabase
        .from('msc_cv_ai_resume_reviews')
        .select('score, created_at, file_name, user_name')
        .order('score', { ascending: false })
        .limit(10);
    if (error) { console.error('Error fetching leaderboard:', error); contentEl.innerHTML = '<p class="text-danger">Could not load leaderboard data.</p>'; return; }
    if (!data?.length) { contentEl.innerHTML = '<p>No entries yet. Be the first!</p>'; return; }
    let html = '<ol class="list-decimal list-inside space-y-3">';
    data.forEach(item => {
        const date = new Date(item.created_at).toLocaleDateString();
        const name = item.user_name ? item.user_name : 'Anonymous';
        html += `<li class="p-3 rounded-lg border border-border bg-background-light">
                    <div class="flex justify-between items-center">
                        <span class="font-semibold text-primary">${item.score.toFixed(1)}%</span>
                        <span class="text-sm text-text-secondary">${name} â€¢ ${date}</span>
                    </div>
                 </li>`;
    });
    html += '</ol>'; contentEl.innerHTML = html;
}

async function loadHistory() {
    const contentEl = document.getElementById('historyContent'); const detailEl = document.getElementById('historyDetailContent');
    detailEl.style.display = 'none'; contentEl.innerHTML = 'Loading...';
    await refreshAuthUser();
    if (!supabase) { contentEl.innerHTML = 'Could not retrieve user history.'; return; }
    const historyUserId = authUser ? authUser.id : userId;
    const { data, error } = await supabase
        .from('msc_cv_ai_resume_reviews')
        .select('id, score, created_at, file_name, review_data')
        .eq('user_id', historyUserId)
        .order('created_at', { ascending: false })
        .limit(20);
    if (error) { console.error('Error fetching history:', error); contentEl.innerHTML = `<p class="text-danger">Could not load history. ${error.message}</p>`; return; }
    if (!data?.length) { contentEl.innerHTML = '<p>You have no past reviews.</p>'; return; }
    let html = '<div class="space-y-2">';
    data.forEach(item => {
        const date = new Date(item.created_at).toLocaleString();
        html += `<div class="history-item p-3 rounded-lg border border-border bg-background-light cursor-pointer hover:bg-gray-50" data-review-id="${item.id}">
                    <div class="flex justify-between items-center">
                        <div>
                            <p class="font-semibold">${item.file_name}</p>
                            <p class="text-sm text-text-secondary">${date}</p>
                        </div>
                        <span class="font-bold text-lg text-primary">${item.score.toFixed(1)}%</span>
                    </div>
                 </div>`;
    });
    html += '</div>';
    contentEl.innerHTML = html;

    contentEl.addEventListener('click', e => {
        const itemEl = e.target.closest('.history-item');
        if (itemEl) {
            const reviewId = itemEl.dataset.reviewId;
            const reviewData = data.find(r => r.id == reviewId);
            if (reviewData) {
                detailEl.innerHTML = `
                    <h4 class="text-lg font-semibold mb-2">Details for ${reviewData.file_name}</h4>
                    <div class="p-4 border rounded-lg bg-white">${formatFeedbackText(reviewData.review_data.review)}</div>
                `;
                detailEl.style.display = 'block';
                detailEl.scrollIntoView({ behavior: 'smooth' });
            }
        }
    });
}