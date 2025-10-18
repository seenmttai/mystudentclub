import { createClient } from '@supabase/supabase-js';
const { jsPDF } = window.jspdf;

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.7.107/build/pdf.worker.min.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';

let userId = null;
let supabase = null;

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

document.addEventListener('DOMContentLoaded', () => {
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

// Add this function to initialize Supabase with the user ID header
function initializeSupabase() {
    if (!userId) setupUserId();
    const headers = {
        'x-msc-user-id': userId
    };
    supabase = createClient(supabaseUrl, supabaseKey, {
        global: {
            headers: headers
        }
    });
}

proceedToReviewBtn.addEventListener('click', analyzeCv);

async function analyzeCv() {
  if (!selectedFile || pdfImages.length === 0) {
    alert('PDF not processed correctly. Please re-upload.');
    return;
  }

  const selectedDomain = 'Financing';
  const selectedSpecialization = 'Accounting';

  //domainSpecializationSection.style.display = 'none';
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
    if (!supabase || !userId) return;

    try {
        const scoreSection = extractSectionContent(reviewText, '<<<OVERALL_SCORE>>>', '<<<END_OVERALL_SCORE>>>');
        let score = 0;
        if (scoreSection) {
            const scoreMatch = scoreSection.match(/Score:\s*([\d.]+)\/100/i);
            if (scoreMatch) {
                score = parseFloat(scoreMatch[1]);
            }
        }

        const { data, error } = await supabase
            .from('msc_cv_ai_resume_reviews')
            .insert([
                { 
                    user_id: userId, 
                    score: score, 
                    review_data: { review: reviewText }, 
                    file_name: selectedFile.name 
                }
            ]);

        if (error) {
            console.error('Error saving review to Supabase:', error);
        } else {
            console.log('Review saved successfully:', data);
        }
    } catch (e) {
        console.error('Exception while saving review:', e);
    }
}

function startLoadingAnimation() {
    stopLoadingAnimation();
    let stage = 0;
    const stages = [
        "Uploading resume securely...",
        "Analyzing document structure...",
        "Extracting key skills and experience...",
        "Evaluating alignment with "+ "Financing" + " standards...",
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
         return `<div class="grammar-correction mb-2"><span class="original-text">${original}</span> <span class="text-lg mx-1 text-gray-400">→</span> <span class="corrected-text">${corrected}</span> ${issueHtml}</div>`;
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
    contentAreas.forEach(area => { if(area) area.innerHTML = '<p class="text-sm text-text-secondary italic">Loading...</p>'; });
    scoreText.textContent = '0';
    scoreProgress.setAttribute('stroke-dasharray', `0, 100`);
     categoryItems.forEach(item => {
        const pointsEl = item.querySelector('.points');
        const fillBar = item.querySelector('.category-fill');
        const maxPoints = pointsEl.textContent.split('/')[1] || '0';
        pointsEl.textContent = `0/${maxPoints}`;
        if(fillBar) fillBar.style.width = `0%`;
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
            return `<h${level+1} class="font-semibold mt-4 mb-2 text-lg">${content}</h${level+1}>`;
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

function formatFeedbackText(text) {
    if (!text) return '<p class="text-sm text-text-secondary italic">No details available.</p>';
    let html = simpleMarkdownToHtml(text);

    html = html.replace(/\[GOOD\]/g, '<span class="highlight-good" title="Good point">✓</span>');
    html = html.replace(/\[ISSUE\]/g, '<span class="highlight-issue" title="Area for improvement">✗</span>');

    html = html.replace(/<br>\s*\*   \*\*(.*?):\*\*/g, '<br><strong class="block mt-3 mb-1 text-base text-primary">$1:</strong>');
    html = html.replace(/^   \*\*(.*?):\*\*/g, '<strong class="block mt-3 mb-1 text-base text-primary">$1:</strong>');

     html = html.replace(/<br>\s*[\-\*]\s+/g, '<br><li>');
     html = html.replace(/<\/li><br>/g, '</li>');

     html = html.replace(/(<li>.*?<\/li>)/gs, (match) => {
         if (match.includes('<ul>') || match.includes('<ol>')) return match;
         return `<ul>${match}</ul>`;
     });
     html = html.replace(/<\/ul>\s*<ul>/g, '');

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
        const roundedScore = Math.round(currentScore);
        const displayScore = currentScore.toFixed(1);
        scoreTextEl.textContent = displayScore;
        scoreProgress.setAttribute('stroke-dasharray', `${roundedScore}, 100`);
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
        if(fillBar) fillBar.style.width = `${Math.min(percentage, 100)}%`;
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
        alert("No analysis report available to download.");
        return;
    }

    const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
    });

    // Add Poppins font
    // This is a simplified way. For production, you'd host the font file.
    // jsPDF has limited built-in font support. For full custom fonts, more setup is needed.
    // We'll stick to helvetica which is standard.

    let yPosition = 20;
    const leftMargin = 15;
    const rightMargin = 15;
    const usableWidth = 210 - leftMargin - rightMargin;

    const checkPageBreak = (height) => {
        if (yPosition + height > 280) { // 297mm page height minus margin
            doc.addPage();
            yPosition = 20; // Reset Y position for new page
        }
    };

    const renderMarkdown = (text) => {
        // Decode HTML entities that might have been created
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        const decodedText = tempDiv.textContent || tempDiv.innerText || "";
        
        const lines = decodedText.split('\n');
        lines.forEach(line => {
            line = line.trim();

             // Cleanup markers
            line = line.replace(/\[GOOD\]/g, '(✓)')
                       .replace(/\[ISSUE\]/g, '(✗)')
                       .replace(/<</g, '').replace(/>>/g, '') // remove markers
                       .replace(/---/g, '');


            if (line.startsWith('*   **') || line.startsWith('**')) { // Sub-heading like "**Contact Information:**"
                checkPageBreak(8);
                doc.setFont("helvetica", "bold");
                doc.setFontSize(11);
                doc.setTextColor(45, 52, 54);
                const content = line.replace(/\*/g, '').replace(/:$/, '');
                const splitText = doc.splitTextToSize(content + ':', usableWidth);
                doc.text(splitText, leftMargin, yPosition);
                yPosition += (splitText.length * 4) + 2;
            } else if (line.startsWith('*')) { // List item
                checkPageBreak(5);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.setTextColor(45, 52, 54);
                const content = '• ' + line.substring(1).trim();
                const splitText = doc.splitTextToSize(content, usableWidth - 3); // Indent for bullet
                doc.text(splitText, leftMargin + 3, yPosition);
                yPosition += (splitText.length * 4);
            } else if (line.trim()) { // Normal paragraph
                checkPageBreak(5);
                doc.setFont("helvetica", "normal");
                doc.setFontSize(10);
                doc.setTextColor(45, 52, 54);
                 const splitText = doc.splitTextToSize(line, usableWidth);
                 doc.text(splitText, leftMargin, yPosition);
                 yPosition += (splitText.length * 4);
            }
        });
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(63, 63, 186); // primary color
    doc.text("My Student Club", 105, yPosition, { align: 'center' });
    yPosition += 8;
    doc.setFontSize(16);
    doc.setTextColor(45, 52, 54);
    doc.text("CV Analysis Report", 105, yPosition, { align: 'center' });
    yPosition += 15;

    const sections = [
        { title: "Overall Score", start: '<<<OVERALL_SCORE>>>', end: '<<<END_OVERALL_SCORE>>>' },
        { title: "Recruiter Tips", start: '<<<RECRUITER_TIPS>>>', end: '<<<END_RECRUITER_TIPS>>>' },
        { title: "Measurable Results Analysis", start: '<<<MEASURABLE_RESULTS>>>', end: '<<<END_MEASURABLE_RESULTS>>>' },
        { title: "Predicted Interview Questions", start: '<<<INTERVIEW_QUESTIONS>>>', end: '<<<END_INTERVIEW_QUESTIONS>>>' },
        { title: "Phrases Suggestions", start: '<<<PHRASES_SUGGESTIONS>>>', end: '<<<END_PHRASES_SUGGESTIONS>>>' },
        { title: "Hard Skills Analysis", start: '<<<HARD_SKILLS>>>', end: '<<<END_HARD_SKILLS>>>' },
        { title: "Soft Skills Analysis", start: '<<<SOFT_SKILLS>>>', end: '<<<END_SOFT_SKILLS>>>' },
        { title: "Action Verbs Usage", start: '<<<ACTION_VERBS>>>', end: '<<<END_ACTION_VERBS>>>' },
        { title: "Grammar & Proofreading", start: '<<<GRAMMAR_CHECK>>>', end: '<<<END_GRAMMAR_CHECK>>>' },
        { title: "Formatting & Readability", start: '<<<FORMATTING_READABILITY>>>', end: '<<<END_FORMATTING_READABILITY>>>' },
        { title: "Education & Qualification", start: '<<<EDUCATION_QUALIFICATION>>>', end: '<<<END_EDUCATION_QUALIFICATION>>>' },
        { title: "Articleship Experience", start: '<<<ARTICLESHIP_EXPERIENCE>>>', end: '<<<END_ARTICLESHIP_EXPERIENCE>>>' },
        { title: "Final Recommendations", start: '<<<FINAL_RECOMMENDATIONS>>>', end: '<<<END_FINAL_RECOMMENDATIONS>>>' }
    ];

    sections.forEach(section => {
        const content = extractSectionContent(analysisResultText, section.start, section.end);
        if (content) {
            checkPageBreak(12);
            doc.setFont("helvetica", "bold");
            doc.setFontSize(14);
            doc.setTextColor(79, 70, 229); // primary-dark
            doc.text(section.title, leftMargin, yPosition);
            yPosition += 8;

            // Render content with basic markdown
            renderMarkdown(content.replace(/<<POINT>>/g, '').replace(/<<END_POINT>>/g, ''));
            yPosition += 6; // Space after section
        }
    });

    const safeFileName = selectedFile ? selectedFile.name.replace(/\.pdf$/i, '').replace(/[^a-z0-9_.-]/gi, '_') : 'CV';
    const filename = `${safeFileName}_Analysis_Report.pdf`;
    doc.save(filename);
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

async function loadLeaderboard() {
    const contentEl = document.getElementById('leaderboardContent');
    contentEl.innerHTML = 'Loading...';
    if (!supabase) {
        contentEl.innerHTML = 'Database connection not available.';
        return;
    }

    const { data, error } = await supabase
        .from('msc_cv_ai_resume_reviews')
        .select('score, created_at, file_name')
        .order('score', { ascending: false })
        .limit(10);

    if (error) {
        console.error('Error fetching leaderboard:', error);
        contentEl.innerHTML = '<p class="text-danger">Could not load leaderboard data.</p>';
        return;
    }

    if (!data || data.length === 0) {
        contentEl.innerHTML = '<p>No entries yet. Be the first!</p>';
        return;
    }

    let html = '<ol class="list-decimal list-inside space-y-3">';
    data.forEach((item, index) => {
        const date = new Date(item.created_at).toLocaleDateString();
        html += `<li class="p-3 rounded-lg border border-border bg-background-light">
                    <div class="flex justify-between items-center">
                        <span class="font-semibold text-primary">${item.score.toFixed(1)}%</span>
                        <span class="text-sm text-text-secondary">${date}</span>
                    </div>
                 </li>`;
    });
    html += '</ol>';
    contentEl.innerHTML = html;
}

async function loadHistory() {
    const contentEl = document.getElementById('historyContent');
    const detailEl = document.getElementById('historyDetailContent');
    detailEl.style.display = 'none';
    contentEl.innerHTML = 'Loading...';
    if (!supabase || !userId) {
        contentEl.innerHTML = 'Could not retrieve user history.';
        return;
    }
    
    const { data, error } = await supabase
        .from('msc_cv_ai_resume_reviews')
        .select('id, score, created_at, file_name, review_data', { head: false })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching history:', error);
        contentEl.innerHTML = `<p class="text-danger">Could not load history. ${error.message}</p>`;
        return;
    }

    if (!data || data.length === 0) {
        contentEl.innerHTML = '<p>You have no past reviews.</p>';
        return;
    }

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