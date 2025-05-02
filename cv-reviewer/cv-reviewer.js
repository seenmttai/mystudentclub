pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.7.107/build/pdf.worker.min.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

const loginPromptModal = document.getElementById('loginPromptModal');
const loginForm = document.getElementById('login-form');
const loginErrorMessage = document.getElementById('login-error-message');
const googleSignInButton = document.getElementById('google-signin-btn');

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
const proceedToDomainBtn = document.getElementById('proceedToDomainBtn');
const domainSpecializationSection = document.getElementById('domainSpecializationSection');
const backToUploadBtn = document.getElementById('backToUploadBtn');
const domainSelect = document.getElementById('domainSelect');
const specializationSelect = document.getElementById('specializationSelect');
const analyzeBtn = document.getElementById('analyzeBtn');
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
  checkAuth();
  populateSpecializations();
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
});

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

async function checkAuth() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (error) {
        console.error("Error getting session:", error);
        showLoginPrompt();
        return;
    }

    if (session) {
        showCvReviewer();
    } else {
        showLoginPrompt();
    }
}

function showLoginPrompt() {
    loginPromptModal.classList.add('active');
    heroSection.style.display = 'none';
    uploadSection.style.display = 'none';
    resultsSection.style.display = 'none';
    tipsSection.style.display = 'none';
    domainSpecializationSection.style.display = 'none';
    loadingSection.style.display = 'none';
}

function showCvReviewer() {
    loginPromptModal.classList.remove('active');
    heroSection.style.display = 'block';
    uploadSection.style.display = 'block';
}

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const loginButton = loginForm.querySelector('.login-btn');

    loginButton.classList.add('loading');
    loginButton.disabled = true;
    loginErrorMessage.classList.remove('show');

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        showCvReviewer();

    } catch (error) {
        loginErrorMessage.textContent = error.message;
        loginErrorMessage.classList.add('show');
    } finally {
        loginButton.classList.remove('loading');
        loginButton.disabled = false;
    }
});

googleSignInButton.addEventListener('click', async () => {
    loginErrorMessage.classList.remove('show');
    googleSignInButton.disabled = true;
    try {
        const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: window.location.href
            }
        });
        if (error) throw error;
    } catch (error) {
        console.error('Google Sign-In Error:', error);
        loginErrorMessage.textContent = error.message || 'Failed to sign in with Google. Please try again.';
        loginErrorMessage.classList.add('show');
        googleSignInButton.disabled = false;
    }
});

supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
        showCvReviewer();
    } else if (event === 'SIGNED_OUT') {
        showLoginPrompt();
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

  proceedToDomainBtn.disabled = true;
  proceedToDomainBtn.classList.add('opacity-50', 'cursor-not-allowed');
  removeFileBtn.disabled = true;

  try {
    await generatePdfPreview(file);
    proceedToDomainBtn.disabled = false;
    proceedToDomainBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  } catch (error) {
     console.error("Error handling file:", error);
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
    console.error('Error generating PDF preview:', error);
    previewThumbnail.innerHTML = '<div class="text-center p-4 text-red-600">Error loading preview.</div>';
    throw error;
  }
}

async function convertPdfToImages() {
  pdfImages = [];
  if (!pdfDocument) return;

  console.log(`Converting ${pdfDocument.numPages} pages to images...`);
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
    console.log("PDF to image conversion complete.");
  } catch (error) {
    console.error('Error converting PDF to images:', error);
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
  proceedToDomainBtn.disabled = true;
  proceedToDomainBtn.classList.add('opacity-50', 'cursor-not-allowed');
}

proceedToDomainBtn.addEventListener('click', () => {
    if (!selectedFile || pdfImages.length === 0) {
         alert("Please wait for the PDF preview and processing to complete.");
         return;
     }
    uploadSection.style.display = 'none';
    domainSpecializationSection.style.display = 'block';
    domainSpecializationSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

backToUploadBtn.addEventListener('click', () => {
    domainSpecializationSection.style.display = 'none';
    uploadSection.style.display = 'block';
});

domainSelect.addEventListener('change', populateSpecializations);

function populateSpecializations() {
    const selectedDomain = domainSelect.value;
    const options = specializationOptions[selectedDomain] || [];
    specializationSelect.innerHTML = '';

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
}

analyzeBtn.addEventListener('click', analyzeCv);

async function analyzeCv() {
  if (!selectedFile || pdfImages.length === 0) {
    alert('PDF not processed correctly. Please re-upload.');
    return;
  }
  if (!domainSelect.value || !specializationSelect.value) {
      alert('Please select a domain and specialization.');
      return;
  }

  const selectedDomain = domainSelect.value;
  const selectedSpecialization = specializationSelect.value;

  domainSpecializationSection.style.display = 'none';
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
        'X-Domain': selectedDomain,
        'X-Specialization': selectedSpecialization,
        'Origin': window.location.origin
      },
      body: JSON.stringify({ images: pdfImages })
    });

    stopLoadingAnimation();

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response.' }));
      console.error('API Error Response:', errorData);
      throw new Error(`Analysis failed: ${response.status} - ${errorData.error || response.statusText}`);
    }

    const data = await response.json();

    if (!data.ok || !data.response) {
        console.error("API returned ok:false or no response text:", data);
        throw new Error(`Analysis unsuccessful: ${data.error || 'Received invalid data from server.'}`);
    }

    analysisResultText = data.response;
    console.log("Raw AI Response Received.");

    processStructuredResults(analysisResultText);

    loadingSection.style.display = 'none';
    resultsSection.style.display = 'block';
    tipsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (error) {
    console.error('Error analyzing CV:', error);
    stopLoadingAnimation();
    loadingSection.style.display = 'none';
    alert(`Error during analysis: ${error.message}. Please try again later.`);
    resetToUploadStageOnError();
  }
}

function startLoadingAnimation() {
    stopLoadingAnimation();
    let stage = 0;
    const stages = [
        "Uploading resume securely...",
        "Analyzing document structure...",
        "Extracting key skills and experience...",
        "Evaluating alignment with "+ domainSelect.value + " standards...",
        "Assessing impact and achievements...",
        "Checking grammar and readability...",
        "Generating tailored recommendations for " + specializationSelect.value + "...",
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
         console.warn(`End marker ${endMarker} not found after ${startMarker}.`);
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
        const scoreMatch = scoreSection.match(/Score:\s*(\d+)\/100/i);
        const justMatch = scoreSection.match(/Justification:\s*(.*)/is);

        if (scoreMatch) {
            overallScore = parseInt(scoreMatch[1], 10);
        } else {
             console.warn("Could not parse score from OVERALL_SCORE section.");
        }
        if (justMatch) {
            justification = justMatch[1].trim();
        } else {
             console.warn("Could not parse justification from OVERALL_SCORE section.");
        }
    } else {
         console.warn("Could not find <<<OVERALL_SCORE>>> section.");

         const fallbackScoreMatch = text.match(/<score>(\d+)<\/score>/i) || text.match(/Overall Score:\s*(\d+)\/100/i);
         if (fallbackScoreMatch) {
            overallScore = parseInt(fallbackScoreMatch[1], 10);
            justification = "Score extracted via fallback method.";
            console.log("Used fallback score:", overallScore);
         } else {
            console.error("Could not find score via primary or fallback methods.");
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

    const points = content.split('---');
    let html = '';
    points.forEach((point) => {
        if (point.trim()) {
            const originalMatch = point.match(/Original:\s*"([\s\S]+?)"/i);
            const critiqueMatch = point.match(/Critique:\s*([\s\S]+?)(Rewrite Suggestions:|Suggestion 1:|\* Suggestion 1:|\n\n|\*   Suggestion|$)/i);
            const suggestionsBlockMatch = point.match(/(Rewrite Suggestions.*?):\s*([\s\S]*)/i);

            html += `<div class="feedback-point border-b border-border pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0">`;
            if (originalMatch && originalMatch[1]) {
                 html += `<p class="mb-1 text-sm"><strong>Original:</strong> <code class="text-xs">${originalMatch[1].trim()}</code></p>`;
            }
            if (critiqueMatch && critiqueMatch[1]) {
                 html += `<p class="mb-2 text-sm"><strong>Critique:</strong> ${formatFeedbackText(critiqueMatch[1].trim())}</p>`;
            }
             if (suggestionsBlockMatch && suggestionsBlockMatch[2]) {
                 html += `<div class="mt-2 text-sm"><strong>Rewrite Suggestions:</strong>`;
                 const suggestionsText = suggestionsBlockMatch[2].trim();
                 const suggestions = suggestionsText.split(/\* Suggestion \d+:|\n\s*-\s*|\n\s*\*\s*/i).filter(s => s.trim());
                 if (suggestions.length > 0) {
                    html += `<ul class="list-none ml-0 mt-1 space-y-1">`;
                    suggestions.forEach(sugg => {
                        const trimmedSugg = sugg.trim().replace(/^"|"$/g, '');
                        if(trimmedSugg) {
                            html += `<li class="rewrite-suggestion">${simpleMarkdownToHtml(trimmedSugg)}</li>`;
                        }
                    });
                    html += `</ul>`;
                 } else {
                    html += `<p class="text-xs text-text-secondary ml-2 italic">No specific suggestions parsed.</p>`;
                 }
                 html += `</div>`;
            }
            html += `</div>`;
        }
    });
    measurableResultsContent.innerHTML = html || '<p class="text-text-secondary">Could not parse measurable results.</p>';
}

function parseAndDisplayPhrasesSuggestions(text) {
     const content = extractSectionContent(text, '<<<PHRASES_SUGGESTIONS>>>', '<<<END_PHRASES_SUGGESTIONS>>>');
     if (!content) {
         phrasesSuggestionsContent.innerHTML = '<p class="text-text-secondary">No phrase suggestions available.</p>';
         return;
     }
     const points = content.split('---');
     let html = '';
     points.forEach((point) => {
        if (point.trim()) {
            const originalMatch = point.match(/Original:\s*"([\s\S]+?)"/i);
            const critiqueMatch = point.match(/Critique:\s*([\s\S]+?)(Rewrite Suggestions:|Suggestion 1:|\* Suggestion 1:|\n\n|\*   Suggestion|$)/i);
            const suggestionsBlockMatch = point.match(/(Rewrite Suggestions.*?):\s*([\s\S]*)/i);

            html += `<div class="feedback-point border-b border-border pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0">`;
            if (originalMatch && originalMatch[1]) {
                html += `<p class="mb-1 text-sm"><strong>Original:</strong> <code class="text-xs">${originalMatch[1].trim()}</code></p>`;
            }
            if (critiqueMatch && critiqueMatch[1]) {
                html += `<p class="mb-2 text-sm"><strong>Critique:</strong> ${formatFeedbackText(critiqueMatch[1].trim())}</p>`;
            }
            if (suggestionsBlockMatch && suggestionsBlockMatch[2]) {
                html += `<div class="mt-2 text-sm"><strong>Rewrite Suggestions:</strong>`;
                const suggestionsText = suggestionsBlockMatch[2].trim();
                const suggestions = suggestionsText.split(/\* Suggestion \d+:|\n\s*-\s*|\n\s*\*\s*/i).filter(s => s.trim());
                 if (suggestions.length > 0) {
                    html += `<ul class="list-none ml-0 mt-1 space-y-1">`;
                    suggestions.forEach(sugg => {
                       const trimmedSugg = sugg.trim().replace(/^"|"$/g, '');
                        if(trimmedSugg) {
                            html += `<li class="rewrite-suggestion">${simpleMarkdownToHtml(trimmedSugg)}</li>`;
                        }
                    });
                    html += `</ul>`;
                 } else {
                    html += `<p class="text-xs text-text-secondary ml-2 italic">No specific suggestions parsed.</p>`;
                 }
                html += `</div>`;
            }
            html += `</div>`;
        }
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
    const content = extractSectionContent(text, '<<<ARTICLESIP_EXPERIENCE>>>', '<<<END_ARTICLESIP_EXPERIENCE>>>');
    articleshipContent.innerHTML = content ? formatFeedbackText(content) : '<p class="text-text-secondary">No articleship analysis available.</p>';
}
function parseAndDisplayFinalRecommendations(text) {
    const content = extractSectionContent(text, '<<<FINAL_RECOMMENDATIONS>>>', '<<<END_FINAL_RECOMMENDATIONS>>>');
    finalRecommendationsContent.innerHTML = content ? formatFeedbackText(content) : '<p class="text-text-secondary">No final recommendations available.</p>';
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

    updateScoreBreakdown(overallScore, resultsText);
}

function clearResultsContent() {
    const contentAreas = [
        recruiterTipsContent, measurableResultsContent, phrasesSuggestionsContent,
        hardSkillsContent, softSkillsContent, actionVerbsContent, grammarCheckContent,
        formattingContent, educationContent, articleshipContent, finalRecommendationsContent,
        scoreJustification
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
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, ''');

    const blocks = html.split(/(\n{2,})/);
    let inList = false;
    let listType = '';

    html = blocks.map(block => {
        if (block.match(/^\s*$/)) return block;

        if (block.match(/^#{1,6}\s+/)) {
            inList = false;
            return block.replace(/^#{1,6}\s+(.*$)/gm, (match, content) => {
                 const level = match.indexOf(' ');
                 return `<h${level + 1} class="font-semibold mt-4 mb-2 text-lg">${content.trim()}</h${level + 1}>`;
            });
        }

        const lines = block.split('\n');
        let listHtml = '';
        let currentListItems = '';

        lines.forEach(line => {
            const ulMatch = line.match(/^\s*([-\*\+])\s+(.*)/);
            const olMatch = line.match(/^\s*(\d+)\.\s+(.*)/);

            if (ulMatch || olMatch) {
                const itemContent = ulMatch ? ulMatch[2] : olMatch[2];
                const currentItemType = ulMatch ? 'ul' : 'ol';

                if (!inList) {
                    inList = true;
                    listType = currentItemType;
                    currentListItems += `<${listType} class="list-${listType === 'ul' ? 'disc' : 'decimal'} ml-5 mb-4">`;
                } else if (listType !== currentItemType) {
                    currentListItems += `</${listType}>`;
                    listType = currentItemType;
                    currentListItems += `<${listType} class="list-${listType === 'ul' ? 'disc' : 'decimal'} ml-5 mb-4">`;
                }

                 let inlineHtml = itemContent
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-700 px-1 rounded text-sm">$1</code>');
                currentListItems += `<li>${inlineHtml}</li>`;

            } else {
                if (inList) {
                    currentListItems += `</${listType}>`;
                    listHtml += currentListItems;
                    currentListItems = '';
                    inList = false;
                }
                let inlineHtml = line
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/`([^`]+)`/g, '<code class="bg-gray-200 dark:bg-gray-700 px-1 rounded text-sm">$1</code>');

                if (inlineHtml.trim()) {
                   listHtml += `<p>${inlineHtml}</p>`;
                }
            }
        });

        if (inList) {
            currentListItems += `</${listType}>`;
            listHtml += currentListItems;
        }

        return listHtml;

    }).join('');

    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/(\n{2,})/g, '\n');

    return html;
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

    const scoreInterval = setInterval(() => {
        currentScore += increment;
        if (currentScore >= score) {
            currentScore = score;
            clearInterval(scoreInterval);
        }
        const roundedScore = Math.round(currentScore);
        scoreText.textContent = roundedScore;
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
             console.warn(`Could not parse specific score for category: ${key}`);
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
             console.log(`Using fallback score for ${categoryKey}`);
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
    domainSpecializationSection.style.display = 'none';
    loadingSection.style.display = 'none';
    checkAuth();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

downloadReportBtn.addEventListener('click', () => {
  if (!analysisResultText) {
      alert("No analysis report available to download.");
      return;
  }

  let reportContent = `My Student Club - CV Analysis Report\n`;
  reportContent += `=====================================\n\n`;
  reportContent += `Domain: ${domainSelect.value}\n`;
  reportContent += `Specialization: ${specializationSelect.value}\n\n`;

  const sections = [
      { title: "Overall Score", start: '<<<OVERALL_SCORE>>>', end: '<<<END_OVERALL_SCORE>>>' },
      { title: "Recruiter Tips", start: '<<<RECRUITER_TIPS>>>', end: '<<<END_RECRUITER_TIPS>>>' },
      { title: "Measurable Results Analysis", start: '<<<MEASURABLE_RESULTS>>>', end: '<<<END_MEASURABLE_RESULTS>>>' },
      { title: "Phrases Suggestions", start: '<<<PHRASES_SUGGESTIONS>>>', end: '<<<END_PHRASES_SUGGESTIONS>>>' },
      { title: "Hard Skills Analysis", start: '<<<HARD_SKILLS>>>', end: '<<<END_HARD_SKILLS>>>' },
      { title: "Soft Skills Analysis", start: '<<<SOFT_SKILLS>>>', end: '<<<END_SOFT_SKILLS>>>' },
      { title: "Action Verbs Usage", start: '<<<ACTION_VERBS>>>', end: '<<<END_ACTION_VERBS>>>' },
      { title: "Grammar & Proofreading", start: '<<<GRAMMAR_CHECK>>>', end: '<<<END_GRAMMAR_CHECK>>>' },
      { title: "Formatting & Readability", start: '<<<FORMATTING_READABILITY>>>', end: '<<<END_FORMATTING_READABILITY>>>' },
      { title: "Education & Qualification", start: '<<<EDUCATION_QUALIFICATION>>>', end: '<<<END_EDUCATION_QUALIFICATION>>>' },
      { title: "Articleship Experience", start: '<<<ARTICLESIP_EXPERIENCE>>>', end: '<<<END_ARTICLESIP_EXPERIENCE>>>' },
      { title: "Final Recommendations", start: '<<<FINAL_RECOMMENDATIONS>>>', end: '<<<END_FINAL_RECOMMENDATIONS>>>' }
  ];

  sections.forEach(section => {
      const content = extractSectionContent(analysisResultText, section.start, section.end);
      if (content) {
          reportContent += `${section.title}\n`;
          reportContent += `${'-'.repeat(section.title.length)}\n`;
           let cleanedContent = content
               .replace(/\[GOOD\]/g, '(+)')
               .replace(/\[ISSUE\]/g, '(-)')
               .replace(/<br>/g, '\n')
               .replace(/<p>/g, '\n')
               .replace(/<\/p>/g, '')
               .replace(/<strong>(.*?)<\/strong>/g, '*$1*')
               .replace(/<em>(.*?)<\/em>/g, '_$1_')
               .replace(/<code>(.*?)<\/code>/g, '`$1`')
               .replace(/<ul>/g, '')
               .replace(/<\/ul>/g, '')
               .replace(/<ol>/g, '')
               .replace(/<\/ol>/g, '')
               .replace(/<li>/g, '\n - ')
               .replace(/<\/li>/g, '')
               .replace(/<h[1-6].*?>(.*?)<\/h[1-6]>/g, '\n### $1\n')
               .replace(/^\s*•\s*/gm, ' - ')
               .replace(/Original:\s*<code.*?>([\s\S]*?)<\/code>/gi, 'Original: "$1"')
               .replace(/Critique:\s*/gi, '\nCritique: ')
               .replace(/Rewrite Suggestions:/gi, '\nRewrite Suggestions:')
               .replace(/<div class="rewrite-suggestion">([\s\S]*?)<\/div>/gi, '  * Suggestion: $1')
               .replace(/<div class="grammar-correction.*?"><span class="original-text">(.*?)<\/span>.*?<span class="corrected-text">(.*?)<\/span>.*?<\/div>/gi, '\n Correction: "$1" -> "$2"')
               .replace(/<span class="highlight-good".*?>✓<\/span>/g,'(+)')
               .replace(/<span class="highlight-issue".*?>✗<\/span>/g,'(-)')
               .replace(/&/g, '&')
               .replace(/</g, '<')
               .replace(/>/g, '>')
               .replace(/"/g, '"')
               .replace(/'/g, "'")
               .replace(/\n\s*\n/g, '\n\n')
               .trim();

           reportContent += cleanedContent + '\n\n';
      } else {
           reportContent += `${section.title}\n`;
           reportContent += `${'-'.repeat(section.title.length)}\n`;
           reportContent += `(No details available for this section)\n\n`;
      }
  });

  reportContent += `---------------------------------------------------------------\n`;
  reportContent += `Generated by My Student Club CV Reviewer\n`;

  const blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeFileName = selectedFile ? selectedFile.name.replace(/[^a-z0-9_.-]/gi, '_').replace('.pdf', '') : 'CV';
  a.href = url;
  a.download = `${safeFileName}_Analysis_Report.txt`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
});

function resetToUploadStageOnError() {
     loadingSection.style.display = 'none';
     resultsSection.style.display = 'none';
     tipsSection.style.display = 'none';
     domainSpecializationSection.style.display = 'none';
     resetUpload();
     uploadSection.style.display = 'block';
     heroSection.style.display = 'block';
     uploadSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}