pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.7.107/build/pdf.worker.min.js';

const dropArea = document.getElementById('dropArea');
const fileInput = document.getElementById('fileInput');
const browseButton = document.getElementById('browseButton');
const uploadSection = document.getElementById('uploadSection');
const previewArea = document.getElementById('previewArea');
const previewThumbnail = document.getElementById('previewThumbnail');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const removeFileBtn = document.getElementById('removeFileBtn');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadingSection = document.getElementById('loadingSection');
const resultsSection = document.getElementById('resultsSection');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const downloadReportBtn = document.getElementById('downloadReportBtn');
const startOverBtn = document.getElementById('startOverBtn');
const scoreText = document.getElementById('scoreText');
const scoreProgress = document.getElementById('scoreProgress');
const menuButton = document.getElementById('menuButton');
const expandedMenu = document.getElementById('expandedMenu');
const menuCloseBtn = document.getElementById('menuCloseBtn');

const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const strengthsContent = document.getElementById('strengthsContent');
const improvementsContent = document.getElementById('improvementsContent');
const recommendationsContent = document.getElementById('recommendationsContent');
const evaluationContent = document.getElementById('evaluationContent');

const categories = {
  structure: document.getElementById('structureCategory'),
  impact: document.getElementById('impactCategory'),
  expertise: document.getElementById('expertiseCategory'),
  experience: document.getElementById('experienceCategory'),
  presentation: document.getElementById('presentationCategory')
};

let selectedFile = null;
let pdfDocument = null;
let pdfImages = [];
let analysisResult = null;

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

tabButtons.forEach(button => {
  button.addEventListener('click', () => {

    tabButtons.forEach(btn => btn.classList.remove('active'));
    tabPanes.forEach(pane => pane.classList.remove('active'));

    button.classList.add('active');
    document.getElementById(`${button.dataset.tab}Tab`).classList.add('active');
  });
});

browseButton.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', handleFileSelect);

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, preventDefaults, false);
});

['dragenter', 'dragover'].forEach(eventName => {
  dropArea.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, unhighlight, false);
});

dropArea.addEventListener('drop', handleDrop, false);

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function highlight() {
  dropArea.classList.add('dragover');
}

function unhighlight() {
  dropArea.classList.remove('dragover');
}

function handleDrop(e) {
  const dt = e.dataTransfer;
  const file = dt.files[0];

  if (file && file.type === 'application/pdf') {
    handleFile(file);
  } else {
    alert('Please upload a PDF file');
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];

  if (file && file.type === 'application/pdf') {
    handleFile(file);
  } else {
    alert('Please upload a PDF file');
  }
}

async function handleFile(file) {
  selectedFile = file;

  fileName.textContent = file.name;
  fileSize.textContent = formatFileSize(file.size);

  dropArea.style.display = 'none';
  previewArea.style.display = 'block';

  await generatePdfPreview(file);
}

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return bytes + ' bytes';
  } else if (bytes < 1048576) {
    return (bytes / 1024).toFixed(1) + ' KB';
  } else {
    return (bytes / 1048576).toFixed(1) + ' MB';
  }
}

async function generatePdfPreview(file) {
  try {

    previewThumbnail.innerHTML = '';
    pdfImages = [];

    const arrayBuffer = await file.arrayBuffer();

    pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const page = await pdfDocument.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;

    previewThumbnail.appendChild(canvas);

    await convertPdfToImages();

  } catch (error) {
    console.error('Error generating PDF preview:', error);
    alert('Error loading PDF file. Please try another file.');
  }
}

async function convertPdfToImages() {
  try {
    pdfImages = [];

    for (let i = 1; i <= pdfDocument.numPages; i++) {

      const page = await pdfDocument.getPage(i);
      const viewport = page.getViewport({ scale: 1.5 });

      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      const imageData = canvas.toDataURL('image/jpeg').split(',')[1];
      pdfImages.push(imageData);
    }

  } catch (error) {
    console.error('Error converting PDF to images:', error);
    alert('Error processing PDF. Please try another file.');
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
}

analyzeBtn.addEventListener('click', analyzeCv);

async function analyzeCv() {
  if (!selectedFile || pdfImages.length === 0) {
    alert('Please upload a valid PDF file first');
    return;
  }

  uploadSection.style.display = 'none';
  loadingSection.style.display = 'block';

  loadingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  startProgressAnimation();

  try {

    const response = await fetch('https://cv-reviewer.bhansalimanan55.workers.dev/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': window.location.origin
      },
      body: JSON.stringify({
        images: pdfImages
      })
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    analysisResult = data.response;

    const scoreMatch = analysisResult.match(/<score>(.*?)<\/score>/);
    const score = scoreMatch ? parseInt(scoreMatch[1]) : 0;

    processResults(analysisResult, score);

    loadingSection.style.display = 'none';
    resultsSection.style.display = 'block';

  } catch (error) {
    console.error('Error analyzing CV:', error);
    progressText.textContent = 'Error analyzing CV. Please try again.';
    progressText.style.color = 'var(--danger)';
  }
}

function startProgressAnimation() {
  let progress = 0;
  const interval = setInterval(() => {
    progress += 1;
    if (progress > 95) {
      clearInterval(interval);
    }
    progressFill.style.width = `${progress}%`;

    if (progress < 20) {
      progressText.textContent = 'Processing your CV...';
    } else if (progress < 40) {
      progressText.textContent = 'Analyzing structure and content...';
    } else if (progress < 60) {
      progressText.textContent = 'Evaluating professional expertise...';
    } else if (progress < 80) {
      progressText.textContent = 'Assessing impact statements...';
    } else {
      progressText.textContent = 'Finalizing your results...';
    }
  }, 100);
}

function processResults(resultsText, score) {

  animateScore(score);

  extractCategoryScores(resultsText);

  populateResultsContent(resultsText);
}

function animateScore(score) {
  let currentScore = 0;
  const scoreInterval = setInterval(() => {
    currentScore += 1;
    scoreText.textContent = currentScore;
    scoreProgress.setAttribute('stroke-dasharray', `${currentScore}, 100`);

    if (currentScore >= score) {
      clearInterval(scoreInterval);
    }
  }, 30);
}

function extractCategoryScores(resultsText) {
  const patterns = {
    structure: /Structure and Completeness[^0-9]*(\d+)[^0-9]*20/i,
    impact: /Impact Demonstration[^0-9]*(\d+)[^0-9]*25/i,
    expertise: /Professional Expertise[^0-9]*(\d+)[^0-9]*25/i,
    experience: /Experience Description[^0-9]*(\d+)[^0-9]*20/i,
    presentation: /Overall Presentation[^0-9]*(\d+)[^0-9]*10/i
  };

  for (const [category, pattern] of Object.entries(patterns)) {
    const match = resultsText.match(pattern);
    const score = match ? parseInt(match[1]) : 0;
    const maxScore = category === 'structure' || category === 'experience' ? 20 : 
                     category === 'presentation' ? 10 : 25;

    const categoryElement = categories[category];
    if (categoryElement) {
      const pointsDisplay = categoryElement.querySelector('.points');
      const fillBar = categoryElement.querySelector('.category-fill');

      pointsDisplay.textContent = `${score} / ${maxScore} pts`;
      fillBar.style.width = `${(score / maxScore) * 100}%`;
    }
  }
}

function populateResultsContent(resultsText) {

  function extractSection(startMarker, endMarker) {
    const startIndex = resultsText.indexOf(startMarker);
    if (startIndex === -1) return '';

    const endIndex = endMarker ? resultsText.indexOf(endMarker, startIndex) : resultsText.length;
    if (endIndex === -1) return resultsText.substring(startIndex + startMarker.length);

    return resultsText.substring(startIndex + startMarker.length, endIndex).trim();
  }

  function markdownToHtml(markdown) {
    if (!markdown) return '<p>No information available</p>';

    let html = markdown

      .replace(/^### (.*$)/gm, '<h4>$1</h4>')
      .replace(/^## (.*$)/gm, '<h3>$1</h3>')
      .replace(/^# (.*$)/gm, '<h2>$1</h2>')

      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')

      .replace(/\*(.*?)\*/g, '<em>$1</em>')

      .replace(/^\s*[\-\*]\s+(.*$)/gm, '<li>$1</li>')
      .replace(/^\s*(\d+)\.\s+(.*$)/gm, '<li>$1. $2</li>')

      .replace(/(ATS|Ind AS|IFRS|GAAP|Companies Act|Income Tax Act|GST|Tally|SAP|Excel|Power BI|Certification)/g, '<span class="highlight">$1</span>');

    html = html.replace(/<li>(.+?)<\/li>(\s*<li>)/g, '<li>$1</li>$2');
    html = html.replace(/<li>(.+?)<\/li>\s*(?!<li>)/g, '<ul><li>$1</li></ul>');

    html = html.replace(/<\/ul>\s*<ul>/g, '');

    const paragraphs = html.split(/\n\s*\n/);
    html = paragraphs.map(p => {
      if (!p.trim()) return '';
      if (p.includes('<h') || p.includes('<ul') || p.includes('<ol') || p.includes('<li')) return p;
      return `<p>${p}</p>`;
    }).join('\n');

    return html;
  }

  const strengthsSection = extractSection('2. Strengths Assessment:', '3. Critical Improvements:');
  strengthsContent.innerHTML = markdownToHtml(strengthsSection);

  const improvementsSection = extractSection('3. Critical Improvements:', '4. Strategic Enhancement Recommendations:');
  improvementsContent.innerHTML = markdownToHtml(improvementsSection);

  const recommendationsSection = extractSection('4. Strategic Enhancement Recommendations:', '5. Final Evaluation:');
  recommendationsContent.innerHTML = markdownToHtml(recommendationsSection);

  const evaluationSection = extractSection('5. Final Evaluation:', null);
  evaluationContent.innerHTML = markdownToHtml(evaluationSection);

  const generalSuggestions = `
    <h4>General Suggestions for All Candidates:</h4>
    <ol>
      <li>Take up NISM certification, easy to get, and very cost friendly, 999 Rs!</li>
      <li>If you have any other certification like excel power point do mention them</li>
      <li>In achievements you can showcase any extracurriculars like exemptions in ca inter, marathons participated, class rank, if you don't have enough, submit newsletters to ICAI this month prepared through AI, present papers or volunteer in conference, participate in ICAI events</li>
    </ol>
  `;

  recommendationsContent.innerHTML += generalSuggestions;
}

startOverBtn.addEventListener('click', () => {
  resetUpload();
  resultsSection.style.display = 'none';
  uploadSection.style.display = 'block';

  progressFill.style.width = '0%';
  progressText.textContent = 'Processing your CV...';
});

downloadReportBtn.addEventListener('click', () => {
  if (!analysisResult) return;

  const scoreMatch = analysisResult.match(/<score>(.*?)<\/score>/);
  const score = scoreMatch ? scoreMatch[1] : 0;

  const reportContent = `
    CV Analysis Report
    ==================

    Overall Score: ${score}/100

    ${analysisResult.replace(/<score>.*?<\/score>/g, '').trim()}

    ---------------------------------------------------------------
    Generated by My Student Club CV Reviewer
    Visit us at https:
  `;

  const blob = new Blob([reportContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'CV_Analysis_Report.txt';
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
});

document.addEventListener('DOMContentLoaded', () => {

  const svg = document.querySelector('.score-chart');
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#4f46e5" />
      <stop offset="100%" stop-color="#0ea5e9" />
    </linearGradient>
  `;
  svg.insertBefore(defs, svg.firstChild);
});