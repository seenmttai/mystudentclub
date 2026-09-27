import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.44.4/+esm';
import { captureCvPreviewBase64 } from './cv-review-bridge.js';

const SUPABASE_URL = 'https://auth.mystudentclub.com';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';

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

let supabase = null;
let authUser = null;
let isPremiumEnrolled = false;
let userId = null;
let currentProgressInterval = null;
let latestAnalysisResult = null;
let latestAnalysisScore = 0;
let isEvaluating = false;
let lastAnalyzedCvHash = null;

function setupUserId() {
    userId = localStorage.getItem('msc_cv_reviewer_uuid');
    if (!userId) {
        userId = self.crypto?.randomUUID ? self.crypto.randomUUID() : ('usr_' + Math.random().toString(36).slice(2));
        localStorage.setItem('msc_cv_reviewer_uuid', userId);
    }
}

function initializeSupabase() {
    setupUserId();
    const headers = { 'x-msc-user-id': userId };
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { storageKey: 'sb-izsggdtdiacxdsjjncdq-auth-token' },
        global: { headers }
    });
}

async function refreshAuthUser() {
    if (!supabase) initializeSupabase();
    try {
        const { data } = await supabase.auth.getUser();
        authUser = data?.user || null;
    } catch {
        authUser = null;
    }
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
}

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
    } catch {
        return 0;
    }
}

function getCvDataSignature() {
    try {
        const activeCvData = window.cvData || {};
        return JSON.stringify({
            p: activeCvData.personal,
            s: activeCvData.summary,
            exp: activeCvData.experience?.length,
            edu: activeCvData.education?.length,
            skl: activeCvData.skills
        });
    } catch {
        return String(Date.now());
    }
}

/* ── 3D Scanner & Real-Time Progress Checklist ── */
function resetLoadingChecklist() {
    for (let num = 1; num <= 4; num++) {
        const stepEl = document.getElementById(`embeddedLoadStep${num}`);
        if (!stepEl) continue;
        stepEl.className = 'loading-step';
        const bulletEl = stepEl.querySelector('.step-bullet');
        if (bulletEl) bulletEl.innerHTML = '';
    }
}

function updateLoadingChecklist(stage) {
    let currentStep = 1;
    if (stage >= 2 && stage <= 3) currentStep = 2;
    else if (stage >= 4 && stage <= 5) currentStep = 3;
    else if (stage >= 6) currentStep = 4;

    const checkIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
    const spinIcon = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;

    for (let num = 1; num <= 4; num++) {
        const stepEl = document.getElementById(`embeddedLoadStep${num}`);
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

function startLoadingAnimation() {
    stopLoadingAnimation();
    resetLoadingChecklist();
    let stage = 0;

    const stages = [
        "Capturing high-resolution CV snapshot...",
        "Analyzing document structure and layout hierarchy...",
        "Evaluating alignment with CA & Finance standards...",
        "Assessing experience metrics, impact, and achievements...",
        "Auditing action verbs, phrasing, and corporate tone...",
        "Checking corporate readiness and grammar...",
        "Synthesizing category scores and rewrite suggestions...",
        "Compiling your comprehensive evaluation report...",
        "Finalizing results..."
    ];

    const progressText = document.getElementById('embeddedLoadingProgressText');
    if (progressText) progressText.textContent = stages[0];
    updateLoadingChecklist(0);

    currentProgressInterval = setInterval(() => {
        stage++;
        if (progressText) progressText.textContent = stages[stage % stages.length];
        updateLoadingChecklist(stage);
    }, 2500);
}

function stopLoadingAnimation() {
    if (currentProgressInterval) {
        clearInterval(currentProgressInterval);
        currentProgressInterval = null;
    }
    const progressText = document.getElementById('embeddedLoadingProgressText');
    if (progressText) progressText.textContent = "Evaluation complete!";
}

/* ── Content Extraction & Parsing ── */
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
        .replace(/^#{1,6}\s+(.*$)/gm, (_match, content) => `<h4 class="font-semibold mt-4 mb-2 text-base">${content}</h4>`)
        .replace(/^\s*[\-\*]\s+(.*$)/gm, '<li>$1</li>')
        .replace(/^\s*\d+\.\s+(.*$)/gm, '<li>$1</li>')
        .replace(/<\/li>\s*<li>/g, '</li><li>')
        .replace(/(<li>.*?<\/li>)/gs, (_match, content) => `<ul>${content}</ul>`)
        .replace(/(\r\n|\n|\r)/g, '<br>')
        .replace(/<br>\s*<br>/g, '</p><p>')
        .replace(/^<p>|<\/p>$/g, '')
        .replace(/^(.+?)$/gm, (match) => {
            if (match.trim().startsWith('<') || /^\s*(<li>|<ul>|<ol>)/.test(match)) return match;
            return `<p>${match}</p>`;
        })
        .replace(/<p>\s*<\/p>/g, '');
}

function formatFeedbackText(text) {
    if (!text) return '<p class="text-sm italic" style="color:var(--cvr-text-sub);">No details available.</p>';

    let processedText = text;
    processedText = processedText.replace(/(\[GOOD\])\s*(\[ISSUE(?:\s*-\s*SEVERITY:\s*(?:Critical|High|Moderate|Low))?[^\]]*\])/gi, '$1\n• $2');
    processedText = processedText.replace(/(\u2022\s*)?(\[ISSUE(?:\s*-\s*SEVERITY:\s*(?:Critical|High|Moderate|Low))?[^\]]*\])\s*\n\s*(?:[\u2022\*\-]\s*)?/gi, '\n• $2 ');
    processedText = processedText.replace(/^(\s*(?:\*\s*)?\*\*([^*:]+):\*\*)[ \t]+(?=[A-Z]|\[)/gm, '$1\n• ');
    processedText = processedText.replace(/([.!?](?:\s*\[GOOD\])?)[ \t]+(?=[A-Z]|\[(?:GOOD|ISSUE))/gi, '$1\n• ');
    processedText = processedText.replace(/\s+(\d+)\.\s+/g, '\n• ');
    processedText = processedText.replace(/^(\d+)\.\s+/gm, '');

    let html = simpleMarkdownToHtml(processedText);

    html = html.replace(/\[GOOD\]/gi, '<span class="highlight-good" title="Good point">&#10003;</span>');
    html = html.replace(/\[ISSUE\](?!\s*-\s*SEVERITY)/gi, '<span class="highlight-issue" title="Area for improvement">&#10007;</span>');
    html = html.replace(/\[ISSUE\s*-\s*SEVERITY:\s*(Critical|High|Moderate|Low)(?:[^\]]*)\]/gi, (_match, severity) => {
        const level = severity.toLowerCase();
        return `<span class="highlight-issue" title="Issue">&#10007;</span><span class="severity-badge severity-${level}">${severity}</span>`;
    });

    html = html.replace(/<br>\s*\*\s+\*\*([^*:]+):\*\*/g, '</p><h4 class="feedback-label">$1:</h4><p>');
    html = html.replace(/^\*\s+\*\*([^*:]+):\*\*/gm, '<h4 class="feedback-label">$1:</h4>');
    html = html.replace(/<br>\s*\*\*([^*:]+):\*\*/g, '</p><h4 class="feedback-label">$1:</h4><p>');

    html = html.replace(/<br>\s*\u2022\s*/g, '</p><p class="feedback-bullet">');
    html = html.replace(/<p>\u2022\s*/g, '<p class="feedback-bullet">');
    html = html.replace(/^\u2022\s*/gm, '');

    html = html.replace(/<br>\s*(\d+)\.\s+/g, '</p><p class="feedback-numbered"><strong>$1.</strong> ');
    html = html.replace(/<br>\s*<br>/g, '</p><p>');
    html = html.replace(/<br>\s*-\s+/g, '</p><p class="feedback-bullet">');
    html = html.replace(/<br>\s*\*\s+/g, '</p><p class="feedback-bullet">');

    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<\/p>\s*<\/p>/g, '</p>');
    return html;
}

function animateScore(score) {
    let currentScore = 0;
    const duration = 1400;
    const stepTime = 20;
    const steps = duration / stepTime;
    const increment = score / steps;

    const scoreTextEl = document.getElementById('embeddedScoreText');
    const scoreGradeBadge = document.getElementById('embeddedScoreGradeBadge');
    const scoreProgress = document.getElementById('embeddedScoreProgress');

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

    const interval = setInterval(() => {
        currentScore += increment;
        if (currentScore >= score) {
            currentScore = score;
            clearInterval(interval);
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
            if (match && match[1]) categoryScores[key] = parseInt(match[1], 10);
        }
    }

    const safeOverall = (typeof overallScore === 'number' && !isNaN(overallScore)) ? overallScore : 0;
    const categoryItems = document.querySelectorAll('#reviewerResults .category-item');

    categoryItems.forEach(item => {
        const categoryKey = item.dataset.category;
        const pointsEl = item.querySelector('.points');
        const fillBar = item.querySelector('.category-fill');
        if (!pointsEl) return;

        const maxMatch = pointsEl.textContent.match(/\/(\d+)/);
        const maxPoints = maxMatch ? parseInt(maxMatch[1], 10) : 20;

        let calculated = 0;
        let pct = 0;
        if (categoryScores[categoryKey] !== undefined) {
            calculated = Math.min(categoryScores[categoryKey], maxPoints);
            pct = (calculated / maxPoints) * 100;
        } else {
            calculated = Math.round((safeOverall / 100) * maxPoints);
            pct = safeOverall;
        }

        pointsEl.textContent = `${calculated}/${maxPoints} pts`;
        if (fillBar) fillBar.style.width = `${Math.min(pct, 100)}%`;
    });
}

function parseAndDisplayMeasurableResults(text) {
    const container = document.querySelector('#measurableResultsSection .content-area');
    if (!container) return;
    const content = extractSectionContent(text, '<<<MEASURABLE_RESULTS>>>', '<<<END_MEASURABLE_RESULTS>>>');
    if (!content) {
        container.innerHTML = '<p class="text-sm italic" style="color:var(--cvr-text-sub);">No measurable results analysis available.</p>';
        return;
    }

    const points = content.split(/<<END_POINT>>|---/);
    let html = '';
    points.forEach((point) => {
        if (!point.trim()) return;
        const originalMatch = point.match(/Original:\s*"([\s\S]+?)"/i);
        const critiqueMatch = point.match(/Critique:\s*([\s\S]+?)(?=Rewrite Suggestion \d+:|$)/i);

        html += `<div class="feedback-point">`;
        if (originalMatch && originalMatch[1]) {
            html += `<p class="mb-1 text-sm"><strong>Original:</strong> <code>${originalMatch[1].trim()}</code></p>`;
        }
        if (critiqueMatch && critiqueMatch[1]) {
            html += `<p class="mb-2 text-sm"><strong>Critique:</strong> ${formatFeedbackText(critiqueMatch[1].trim())}</p>`;
        }

        const allSuggestions = [...point.matchAll(/Rewrite Suggestion \d+:\s*([\s\S]+?)(?=Rewrite Suggestion \d+:|$)/gi)];
        if (allSuggestions.length > 0) {
            html += `<div class="mt-2 text-sm"><strong>Rewrite Suggestions:</strong><ul class="list-none ml-0 mt-1 space-y-1">`;
            allSuggestions.forEach(match => {
                const s = match[1].trim();
                if (s) html += `<li class="rewrite-suggestion">${simpleMarkdownToHtml(s)}</li>`;
            });
            html += `</ul></div>`;
        }
        html += `</div>`;
    });
    container.innerHTML = html || '<p class="text-sm italic" style="color:var(--cvr-text-sub);">Could not parse measurable results.</p>';
}

function parseAndDisplayPhrasesSuggestions(text) {
    const container = document.querySelector('#phrasesSuggestionsSection .content-area');
    if (!container) return;
    const content = extractSectionContent(text, '<<<PHRASES_SUGGESTIONS>>>', '<<<END_PHRASES_SUGGESTIONS>>>');
    if (!content) {
        container.innerHTML = '<p class="text-sm italic" style="color:var(--cvr-text-sub);">No phrase suggestions available.</p>';
        return;
    }

    const points = content.split(/<<END_POINT>>|---/);
    let html = '';
    points.forEach((point) => {
        if (!point.trim()) return;
        const originalMatch = point.match(/Original:\s*"([\s\S]+?)"/i);
        const critiqueMatch = point.match(/Critique:\s*([\s\S]+?)(?=Rewrite Suggestion \d+:|$)/i);

        html += `<div class="feedback-point">`;
        if (originalMatch && originalMatch[1]) {
            html += `<p class="mb-1 text-sm"><strong>Original:</strong> <code>${originalMatch[1].trim()}</code></p>`;
        }
        if (critiqueMatch && critiqueMatch[1]) {
            html += `<p class="mb-2 text-sm"><strong>Critique:</strong> ${formatFeedbackText(critiqueMatch[1].trim())}</p>`;
        }

        const allSuggestions = [...point.matchAll(/Rewrite Suggestion \d+:\s*([\s\S]+?)(?=Rewrite Suggestion \d+:|$)/gi)];
        if (allSuggestions.length > 0) {
            html += `<div class="mt-2 text-sm"><strong>Rewrite Suggestions:</strong><ul class="list-none ml-0 mt-1 space-y-1">`;
            allSuggestions.forEach(match => {
                const s = match[1].trim();
                if (s) html += `<li class="rewrite-suggestion">${simpleMarkdownToHtml(s)}</li>`;
            });
            html += `</ul></div>`;
        }
        html += `</div>`;
    });
    container.innerHTML = html || '<p class="text-sm italic" style="color:var(--cvr-text-sub);">Could not parse phrase suggestions.</p>';
}

function parseAndDisplayGrammarCheck(text) {
    const container = document.querySelector('#grammarCheckSection .content-area');
    if (!container) return;
    const content = extractSectionContent(text, '<<<GRAMMAR_CHECK>>>', '<<<END_GRAMMAR_CHECK>>>');
    if (!content) {
        container.innerHTML = '<p class="text-sm italic" style="color:var(--cvr-text-sub);">No grammar check results available.</p>';
        return;
    }

    let html = formatFeedbackText(content);
    html = html.replace(/Original:\s*"([^"]+?)"\s*->\s*Corrected:\s*"([^"]+?)"(\s*<span class="highlight-issue.*?<\/span>)?/gi, (_match, original, corrected, issueMarker) => {
        const issueHtml = issueMarker || '';
        return `<div class="grammar-correction mb-2"><span class="original-text">${original}</span> <span style="color:#94a3b8; font-size:1.1em; margin:0 4px;">&rarr;</span> <span class="corrected-text">${corrected}</span> ${issueHtml}</div>`;
    });
    container.innerHTML = html;
}

function renderSimpleFeedbackSection(sectionId, markerName, rawText, emptyMsg) {
    const container = document.querySelector(`#${sectionId} .content-area`);
    if (!container) return;
    const content = extractSectionContent(rawText, `<<<${markerName}>>>`, `<<<END_${markerName}>>>`);
    container.innerHTML = content ? formatFeedbackText(content) : `<p class="text-sm italic" style="color:var(--cvr-text-sub);">${emptyMsg}</p>`;
}

function processStructuredResults(resultsText) {
    const overallScore = extractOverallScoreValue(resultsText);
    latestAnalysisScore = overallScore;

    const scoreSection = extractSectionContent(resultsText, '<<<OVERALL_SCORE>>>', '<<<END_OVERALL_SCORE>>>');
    let justification = "Score justification based on comprehensive AI resume audit.";
    if (scoreSection) {
        const justMatch = scoreSection.match(/Justification:\s*([\s\S]+)/i);
        if (justMatch && justMatch[1]) justification = justMatch[1].trim();
        else justification = scoreSection.replace(/Score:\s*\**[\d.]+\**(?:\/\d+)?/gi, '').trim() || justification;
    }

    animateScore(overallScore);

    const justificationEl = document.getElementById('scoreJustification');
    if (justificationEl) justificationEl.innerHTML = formatFeedbackText(justification);

    renderSimpleFeedbackSection('recruiterTipsSection', 'RECRUITER_TIPS', resultsText, 'No recruiter tips available.');
    parseAndDisplayMeasurableResults(resultsText);
    parseAndDisplayPhrasesSuggestions(resultsText);
    renderSimpleFeedbackSection('hardSkillsSection', 'HARD_SKILLS', resultsText, 'No hard skills analysis available.');
    renderSimpleFeedbackSection('softSkillsSection', 'SOFT_SKILLS', resultsText, 'No soft skills analysis available.');
    renderSimpleFeedbackSection('actionVerbsSection', 'ACTION_VERBS', resultsText, 'No action verb analysis available.');
    parseAndDisplayGrammarCheck(resultsText);
    renderSimpleFeedbackSection('formattingSection', 'FORMATTING_READABILITY', resultsText, 'No formatting analysis available.');
    renderSimpleFeedbackSection('educationSection', 'EDUCATION_QUALIFICATION', resultsText, 'No education analysis available.');
    renderSimpleFeedbackSection('articleshipSection', 'ARTICLESHIP_EXPERIENCE', resultsText, 'No articleship experience analysis available.');
    renderSimpleFeedbackSection('interviewQuestionsSection', 'INTERVIEW_QUESTIONS', resultsText, 'No interview questions available.');
    renderSimpleFeedbackSection('finalRecommendationsSection', 'FINAL_RECOMMENDATIONS', resultsText, 'No final recommendations available.');

    updateScoreBreakdown(overallScore, resultsText);
}

/* ── Role Gating & Locking ── */
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

    const downloadBtn = document.getElementById('downloadReportBtn');
    if (downloadBtn) {
        downloadBtn.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>Unlock full report`;
        downloadBtn.dataset.locked = 'true';
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
    const downloadBtn = document.getElementById('downloadReportBtn');
    if (downloadBtn) {
        downloadBtn.innerHTML = `<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>Download Report`;
        downloadBtn.dataset.locked = 'false';
    }
}

/* ── Modals ── */
export function openReviewBuyModal() {
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

export function closeReviewBuyModal() {
    const overlay = document.getElementById('reviewBuyOverlay');
    if (overlay) overlay.classList.remove('active');
}

export function showNoticeModal(title, message, isError = true) {
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

export function closeNoticeModal() {
    const overlay = document.getElementById('noticeModalOverlay');
    if (overlay) overlay.classList.remove('active');
}

export function showContextWarningModal(message, title = 'Invalid Resume Content') {
    const overlay = document.getElementById('contextWarningOverlay');
    const titleEl = document.getElementById('contextWarningTitle');
    const desc = document.getElementById('contextWarningText');
    if (titleEl && title) titleEl.textContent = title;
    if (desc && message) desc.textContent = message;
    if (overlay) overlay.classList.add('active');
}

export function closeContextWarningModal() {
    const overlay = document.getElementById('contextWarningOverlay');
    if (overlay) overlay.classList.remove('active');
}

/* ── Save to Supabase ── */
async function saveReview(reviewText, cvFileName = 'CV') {
    if (!supabase) return;
    try {
        const score = extractOverallScoreValue(reviewText);
        const insertPayload = {
            user_id: authUser ? authUser.id : userId,
            user_name: authUser ? (authUser.user_metadata?.full_name || authUser.email || 'User') : null,
            score,
            review_data: { review: reviewText },
            file_name: cvFileName
        };
        await supabase.from('msc_cv_ai_resume_reviews').insert([insertPayload]);
    } catch (e) {
        console.warn('Error saving review:', e);
    }
}

/* ── Core Review Evaluation Flow ── */
export async function runReviewEvaluation(force = false) {
    const currentHash = getCvDataSignature();
    if (!force && latestAnalysisResult && lastAnalyzedCvHash === currentHash) {
        // Show cached results instantly
        showResultsView();
        return;
    }

    if (isEvaluating) return;
    isEvaluating = true;

    await refreshAuthUser();

    // Limit check for guest users
    if (!authUser) {
        const ipCount = getIpReviewCount();
        if (ipCount >= IP_REVIEW_LIMIT) {
            isEvaluating = false;
            showNoticeModal('Login Required', 'You have used your 1 free guest review. Please sign in to your MSC account to get 3 additional free reviews.');
            return;
        }
    } else if (!isPremiumEnrolled) {
        const lifetimeCount = await getFreeUserLifetimeCount();
        if (lifetimeCount >= FREE_USER_LIFETIME_LIMIT) {
            isEvaluating = false;
            openReviewBuyModal();
            return;
        }
    }

    showLoadingView();
    startLoadingAnimation();

    try {
        const { image, fileName } = await captureCvPreviewBase64(window);
        if (!image) throw new Error('Could not capture the current CV preview.');

        const response = await fetch('https://cv-reviewer.bhansalimanan55.workers.dev/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Domain': 'Financing',
                'X-Specialization': 'Accounting',
                'Origin': window.location.origin
            },
            body: JSON.stringify({ images: [image] })
        });

        stopLoadingAnimation();

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Server returned ${response.status}`);
        }

        const data = await response.json();
        if (!data.ok || !data.response) {
            throw new Error(data.error || 'Received invalid evaluation data.');
        }

        const resultText = data.response;

        if (resultText.includes('<<<OUT_OF_CONTEXT>>>')) {
            let msg = resultText.replace('<<<OUT_OF_CONTEXT>>>', '').trim();
            if (!msg) {
                msg = "This AI CV Reviewer is custom-built exclusively for Chartered Accountants (CA), Finance, and Accounting professionals. Please ensure your CV content is relevant.";
            }

            const isBlankNotice = msg.toLowerCase().includes('blank') || msg.toLowerCase().includes('unreadable');
            const title = isBlankNotice ? "Invalid Resume Content" : "Specialized for Finance & CA";

            showLoadingView(false);
            showErrorView(title, msg, true);
            showContextWarningModal(msg, title);
            return;
        }

        latestAnalysisResult = resultText;
        lastAnalyzedCvHash = currentHash;

        await refreshAuthUser();
        processStructuredResults(resultText);
        applyRoleLocks();
        await saveReview(resultText, fileName);

        if (!authUser) {
            incrementIpReviewCount();
        }

        showResultsView();
    } catch (error) {
        stopLoadingAnimation();
        showLoadingView(false);
        const errMsg = error.message || 'An error occurred during evaluation. Please try again.';
        showErrorView('Analysis Error', errMsg, false);
        showNoticeModal('Analysis Failed', errMsg);
        console.error('Review evaluation error:', error);
    } finally {
        isEvaluating = false;
    }
}

export function showErrorView(title, message, isWarning = true) {
    const loadingSection = document.getElementById('reviewerLoading');
    const resultsSection = document.getElementById('reviewerResults');
    const errorSection = document.getElementById('reviewerError');
    const titleEl = document.getElementById('reviewerErrorTitle');
    const msgEl = document.getElementById('reviewerErrorMessage');
    const iconWrap = document.getElementById('reviewerErrorIconWrap');

    if (loadingSection) loadingSection.style.display = 'none';
    if (resultsSection) resultsSection.style.display = 'none';

    if (titleEl && title) titleEl.textContent = title;
    if (msgEl && message) msgEl.textContent = message;

    if (iconWrap) {
        iconWrap.className = 'reviewer-error-icon-wrap ' + (isWarning ? 'warning' : 'error');
    }

    if (errorSection) {
        errorSection.style.display = 'block';
        errorSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function showLoadingView(show = true) {
    const loadingSection = document.getElementById('reviewerLoading');
    const resultsSection = document.getElementById('reviewerResults');
    const errorSection = document.getElementById('reviewerError');

    if (show && errorSection) errorSection.style.display = 'none';
    if (loadingSection) loadingSection.style.display = show ? 'block' : 'none';
    if (resultsSection) resultsSection.style.display = show ? 'none' : (latestAnalysisResult ? 'block' : 'none');
    if (show && loadingSection) loadingSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showResultsView() {
    const loadingSection = document.getElementById('reviewerLoading');
    const resultsSection = document.getElementById('reviewerResults');
    const errorSection = document.getElementById('reviewerError');

    if (errorSection) errorSection.style.display = 'none';
    if (loadingSection) loadingSection.style.display = 'none';
    if (resultsSection) {
        resultsSection.style.display = 'block';
        resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

export function openReview() {
    const currentHash = getCvDataSignature();
    if (!latestAnalysisResult || lastAnalyzedCvHash !== currentHash) {
        runReviewEvaluation(false);
    } else {
        showResultsView();
    }
}

export function reevaluateCv() {
    runReviewEvaluation(true);
}

/* ── PDF Report Generation & Native Flutter Delivery ── */
function cleanRawTextForPdf(t) {
    let out = (t || '');
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

    out = out.replace(/<<<.*?>>>/gs, '').replace(/<<POINT>>|<<END_POINT>>/g, '').trim();
    out = out.replace(/^##\s+([^\n]+)\n\*\*\s*$/gm, '## $1\n');
    out = out.replace(/^\*\*\s*$/gm, '');
    out = out.replace(/\n\*\*\n/g, '\n');
    out = out.replace(/([.!?])\s+(?=[A-Z])/g, '$1\n- ');
    out = out.replace(/(\d)\.\s+([A-Z])/g, '\n$1. $2');
    return out;
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
    return out;
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            const separator = result.indexOf(',');
            if (separator < 0) return reject(new Error('Could not encode the downloaded file.'));
            resolve(result.slice(separator + 1));
        };
        reader.onerror = () => reject(reader.error || new Error('Could not read the downloaded file.'));
        reader.onabort = () => reject(new Error('Reading the downloaded file was cancelled.'));
        reader.readAsDataURL(blob);
    });
}

async function deliverDownloadedBlob(blob, filename) {
    const nativeBridge = window.flutter_inappwebview;
    if (nativeBridge && typeof nativeBridge.callHandler === 'function') {
        const base64 = await blobToBase64(blob);
        await nativeBridge.callHandler('blobToBase64Handler', base64, filename);
        return;
    }
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    try {
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
    } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    }
}

// Global interceptor for programmatic link downloads in Flutter InAppWebView (prevents Android blob: errors)
(function setupFlutterDownloadInterceptor() {
    if (typeof window === 'undefined' || window.__flutterDownloadInterceptorReady) return;
    window.__flutterDownloadInterceptorReady = true;

    const handleAnchorDownload = (anchor) => {
        const nativeBridge = window.flutter_inappwebview;
        if (!nativeBridge || typeof nativeBridge.callHandler !== 'function') return false;

        const href = anchor.href || anchor.getAttribute('href') || '';
        const filename = anchor.download || anchor.getAttribute('download') || 'download.pdf';

        if (filename && (href.startsWith('blob:') || href.startsWith('data:'))) {
            fetch(href)
                .then(r => r.blob())
                .then(blob => deliverDownloadedBlob(blob, filename))
                .catch(err => console.error('Error handling blob download in Flutter WebView:', err));
            return true;
        }
        return false;
    };

    const origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
        if (handleAnchorDownload(this)) return;
        return origClick.apply(this, arguments);
    };

    const origDispatchEvent = HTMLAnchorElement.prototype.dispatchEvent;
    HTMLAnchorElement.prototype.dispatchEvent = function(event) {
        if (event && event.type === 'click' && handleAnchorDownload(this)) {
            return true;
        }
        return origDispatchEvent.apply(this, arguments);
    };
})();

export async function handleDownloadReport() {
    const downloadBtn = document.getElementById('downloadReportBtn');
    if (downloadBtn?.dataset?.locked === 'true') {
        openReviewBuyModal();
        return;
    }
    if (!latestAnalysisResult) {
        showNoticeModal('No Report Available', 'Please evaluate your CV first before downloading the report.');
        return;
    }
    if (!window.MarkdownPDF) {
        showNoticeModal('PDF Engine Loading', 'PDF generation tools are loading. Please try again in a few seconds.');
        return;
    }

    if (downloadBtn) {
        if (downloadBtn.disabled) return;
        downloadBtn.disabled = true;
    }
    const origHtml = downloadBtn ? downloadBtn.innerHTML : '';
    if (downloadBtn) {
        downloadBtn.innerHTML = `
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation: editorSpin 0.9s linear infinite; margin-right: 6px;">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10"/>
            </svg>
            <span>Generating PDF...</span>
        `;
    }

    try {
        const cleaned = cleanRawTextForPdf(latestAnalysisResult);
        const cvName = (window.cvData?.personal?.name || 'CV').trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        const safeFileName = `${cvName || 'CV'}_Analysis_Report.pdf`;

        const headerHtml = `
          <div style="text-align:center;padding:8px 0;font-family:'Poppins',sans-serif;color:#111827;font-weight:600;font-size:12px;">
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
          p, li { color: #374151; line-height: 1.7; font-size: 12px; }
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
            filename: safeFileName,
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

        await window.MarkdownPDF.download(markdown, pdfOptions);
    } catch (err) {
        console.error('PDF download error:', err);
        showNoticeModal('PDF Download Failed', err?.message || 'Failed to generate PDF. Please try again.');
    } finally {
        if (downloadBtn) {
            downloadBtn.disabled = false;
            downloadBtn.innerHTML = origHtml;
        }
    }
}

/* ── DOM Event Listeners Setup ── */
document.addEventListener('DOMContentLoaded', () => {
    setupUserId();
    initializeSupabase();

    // Accordions expand/collapse
    const reviewerResults = document.getElementById('reviewerResults');
    if (reviewerResults) {
        reviewerResults.addEventListener('click', (e) => {
            const header = e.target.closest('.section-header');
            if (header) {
                const section = header.closest('.feedback-section');
                if (section?.classList.contains('locked')) {
                    // locked sections stay open so skeleton is visible
                    return;
                }
                const content = header.nextElementSibling;
                const icon = header.querySelector('.toggle-icon');
                if (content) content.classList.toggle('collapsed');
                if (icon) icon.classList.toggle('collapsed');
            }
        });
    }

    // Lock CTA click opens buy modal
    document.addEventListener('click', (e) => {
        if (e.target.closest('.lock-cta, .open-buy-modal-btn')) {
            e.preventDefault();
            openReviewBuyModal();
        }

        // Close modals and button actions
        if (e.target.closest('#reviewBuyClose') || e.target === document.getElementById('reviewBuyOverlay')) {
            closeReviewBuyModal();
        }
        if (e.target.closest('#contextWarningBtn')) {
            closeContextWarningModal();
            if (typeof window.switchTab === 'function') {
                window.switchTab('editor');
            }
            return;
        }
        if (e.target.closest('#contextWarningClose') || e.target === document.getElementById('contextWarningOverlay')) {
            closeContextWarningModal();
        }
        if (e.target.closest('#noticeModalClose, #noticeModalBtn') || e.target === document.getElementById('noticeModalOverlay')) {
            closeNoticeModal();
        }
        if (e.target.closest('#pdfPreviewCloseBtn') || e.target === document.getElementById('pdfPreviewModal')) {
            const m = document.getElementById('pdfPreviewModal');
            if (m) m.style.display = 'none';
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeReviewBuyModal();
            closeContextWarningModal();
            closeNoticeModal();
            const m = document.getElementById('pdfPreviewModal');
            if (m) m.style.display = 'none';
        }
    });

    const downloadBtn = document.getElementById('downloadReportBtn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', handleDownloadReport);
    }

    const reevalBtn = document.getElementById('embeddedReevaluateBtn');
    if (reevalBtn) {
        reevalBtn.addEventListener('click', reevaluateCv);
    }
});

// Export globally for CV Builder interaction
window.cvReviewerEmbedded = {
    openReview,
    reevaluateCv,
    openReviewBuyModal,
    closeReviewBuyModal,
    showNoticeModal,
    showContextWarningModal,
    showErrorView
};
