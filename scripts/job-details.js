import { getDaysAgo } from './date-utils.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

const JOB_TITLE_MAP = {
    "Industrial Training Job Portal": "Industrial Trainee",
    "Fresher Jobs": "CA Fresher",
    "Semi Qualified Jobs": "Semi Qualified Chartered Accountant",
    "Articleship Jobs": "Articleship Trainee"
};

const TABLE_MAP = {
    "industrial": "Industrial Training Job Portal",
    "fresher": "Fresher Jobs",
    "semi": "Semi Qualified Jobs",
    "articleship": "Articleship Jobs"
};

async function init() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');

    let tableParam = params.get('type') || params.get('table');

    setBackLink(tableParam);

    if (!id) {
        showError('No job ID specified.');
        return;
    }

    let tableName = 'Industrial Training Job Portal';
    if (tableParam) {
        if (TABLE_MAP[tableParam]) tableName = TABLE_MAP[tableParam];
        else if (Object.values(TABLE_MAP).includes(tableParam)) tableName = tableParam;
    }

    try {
        await fetchJobDetails(id, tableName);
    } catch (error) {
        showError('Job not found or error loading details.');
        console.error(error);
    }
}

function setBackLink(type) {
    const backLink = document.getElementById('backLink');
    const backLinkText = document.getElementById('backLinkText');

    if (!backLink || !backLinkText) return;

    const portalMap = {
        'industrial': { url: '/', label: 'Industrial Training' },
        'fresher': { url: '/fresher.html', label: 'Fresher Jobs' },
        'semi': { url: '/semi-qualified.html', label: 'Semi Qualified' },
        'articleship': { url: '/articleship.html', label: 'Articleship' }
    };

    const portal = portalMap[type] || portalMap['industrial'];
    backLink.href = portal.url;
    backLinkText.textContent = 'Back to jobs';
}

function renderMarkdown(text) {
    if (!text) return 'No description provided.';

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

    html = '<p>' + html + '</p>';

    html = html.replace(/<p><\/p>/g, '');

    return html;
}

function copyApplyLink(event) {
    const btn = event.currentTarget;
    const text = btn.getAttribute('data-copy-text');

    if (!text || text === 'N/A') return;

    navigator.clipboard.writeText(text).then(() => {
        const icon = btn.querySelector('i');
        icon.className = 'fas fa-check';
        btn.style.color = '#22c55e';
        setTimeout(() => {
            icon.className = 'fas fa-copy';
            btn.style.color = '';
        }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
        alert('Failed to copy. Please copy manually.');
    });
}

async function fetchJobDetails(id, tableName) {
    const { data, error } = await supabaseClient
        .from(tableName)
        .select('*')
        .eq('id', id)
        .single();

    if (error) throw error;
    if (!data) throw new Error('Job not found');

    renderJob(data, tableName);
}

function renderJob(job, tableName) {
    const container = document.getElementById('jobDetailsContainer');
    const loadingState = document.getElementById('loadingState');

    currentTableName = tableName;

    const companyName = (job.Company || 'Company Name').trim();
    const companyInitial = companyName.charAt(0).toUpperCase();
    const postedDate = job.Created_At ? getDaysAgo(job.Created_At) : 'Recently';
    const salary = job.Salary ? `₹${job.Salary}` : '';
    const location = job.Location || 'Remote / Unspecified';
    const category = job.Category || 'General';
    const description = job.Description || 'No description provided.';

    const applyInfo = getApplicationLink(job['Application ID']);

    let connectLink = checkConnectLink(job);
    if (!connectLink) {
        const searchKeywordSuffix = JOB_TITLE_MAP[tableName] || "Chartered Accountant";
        const query = `${companyName} ${searchKeywordSuffix}`;
        connectLink = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}&origin=SWITCH_SEARCH_VERTICAL`;
    }

    const applyButtonsHtml = generateApplyButtons(applyInfo, job);

    const html = `
      <div class="job-header-section">
        <div class="job-header-content">
          <div class="company-logo-large">${companyInitial}</div>
          <div class="job-title-block">
            <h1>${companyName}</h1>
            <div class="job-meta-row">
                <div class="job-meta-item">
                    <i class="fas fa-map-marker-alt"></i>
                    <span>${location}</span>
                </div>
                ${salary ? `
                <div class="job-meta-item">
                    <span>Stipend: ${salary}</span>
                </div>
                ` : ''}
                <div class="job-meta-item">
                    <i class="far fa-clock"></i>
                    <span>Posted ${postedDate}</span>
                </div>
                <div class="job-meta-item">
                    <i class="fas fa-tag"></i>
                    <span>${category}</span>
                </div>
            </div>
            
            <!-- Mobile Apply Buttons (visible only on mobile) -->
            <div class="mobile-apply-btn">
                ${applyButtonsHtml}
            </div>
          </div>
        </div>
      </div>

      <div class="job-body">
        <div class="main-column">
            <div class="description-section">
                <h2><i class="fas fa-file-lines"></i> Job Description</h2>
                <div class="description-content">${renderMarkdown(description)}</div>
            </div>
        </div>

        <aside class="action-sidebar">
            <div class="action-card">
                <h3>Apply here</h3>
                
                <div class="info-grid">
                    <div class="info-card">
                        <div>
                            <span class="info-label">${applyInfo.isEmail ? 'Email' : 'Apply Link'}</span>
                            <div class="info-value-container">
                                <div class="info-value-scroll">
                                    <i class="fas ${applyInfo.isEmail ? 'fa-envelope' : 'fa-link'}"></i>
                                    <span class="apply-link-text">${applyInfo.isEmail ? applyInfo.email : job['Application ID'] || 'N/A'}</span>
                                </div>
                                <button class="copy-btn" data-copy-text="${applyInfo.isEmail ? applyInfo.email : job['Application ID'] || 'N/A'}" title="Copy">
                                    <i class="fas fa-copy"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <h3 style="margin-top: 1rem;">Interested?</h3>
                <p>Apply now or connect with peers at this company.</p>
                
                ${applyButtonsHtml}

                <a href="${connectLink}" target="_blank" class="btn-large btn-linkedin">
                    <i class="fab fa-linkedin"></i> Connect to Peers
                </a>
                
                <div class="action-card-footer">
                    False job vacancy? <a href="/contact.html">Report it</a>
                </div>
            </div>
        </aside>
      </div>
    `;

    container.innerHTML = html;
    container.classList.add('fade-in');
    loadingState.style.display = 'none';
    container.style.display = 'block';

    if (applyInfo.isEmail) {
        const aiApplyBtn = document.getElementById('aiApplyBtn');
        if (aiApplyBtn) {
            aiApplyBtn.addEventListener('click', () => handleAiApply(job, aiApplyBtn, tableName));
        }
    }

    const copyBtn = container.querySelector('.copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyApplyLink);
    }
}

function getApplicationLink(id) {
    if (!id) return { link: '#', isEmail: false };
    const trimmedId = id.trim();

    if (trimmedId.toLowerCase().startsWith('http')) {
        try {
            new URL(trimmedId);
            return { link: trimmedId, isEmail: false };
        } catch (_) { }
    }

    if (trimmedId.includes('@')) {
        const emailMatch = trimmedId.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
            return { link: trimmedId, isEmail: true, email: emailMatch[0] };
        }
    }

    return {
        link: `https://www.google.com/search?q=${encodeURIComponent(trimmedId + ' careers')}`,
        isEmail: false
    };
}

const EMAIL_SUBJECT_MAP = {
    "Industrial Training Job Portal": "Application for CA Industrial Training",
    "Fresher Jobs": "Application for CA Fresher",
    "Semi Qualified Jobs": "Application for Semi Qualified CA",
    "Articleship Jobs": "Application for CA Articleship"
};

function constructMailto(job, tableName, body = "") {
    const rawLink = job['Application ID'];
    if (!rawLink) return '#';
    const emailMatch = rawLink.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) return '#';
    const email = emailMatch[0];
    const subjectBase = EMAIL_SUBJECT_MAP[tableName] || `Application for ${job.Category || 'the role'} Position`;
    const subject = `${subjectBase} at ${job.Company} (Ref: My Student Club)`;
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

let currentTableName = 'Industrial Training Job Portal';

function generateApplyButtons(applyInfo, job) {
    if (applyInfo.isEmail) {
        const simpleMailto = constructMailto(job, currentTableName, generateFallbackEmail(job));
        return `
            <div class="email-apply-buttons">
                <a href="${simpleMailto}" class="btn-large btn-secondary-large" id="simpleApplyBtn">
                    <i class="fas fa-envelope"></i> Simple Apply
                </a>
                <button class="btn-large btn-ai-apply" id="aiApplyBtn">
                    <i class="fas fa-magic"></i>
                    <span class="btn-text">AI Powered Apply</span>
                    <i class="fas fa-spinner fa-spin"></i>
                </button>
            </div>
        `;
    } else {
        return `
            <a href="${applyInfo.link}" target="_blank" class="btn-large btn-primary-large">
                <i class="fas fa-external-link-alt"></i> Apply Now
            </a>
        `;
    }
}

function isProfileComplete() {
    try {
        const images = JSON.parse(localStorage.getItem('userCVImages') || '[]');
        return Array.isArray(images) && images.length > 0;
    } catch (e) {
        return false;
    }
}

async function getCurrentSession() {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        return session;
    } catch (e) {
        return null;
    }
}

async function handleAiApply(job, buttonElement, tableName) {
    const btnText = buttonElement.querySelector('.btn-text');
    const spinner = buttonElement.querySelector('.fa-spinner');
    const originalText = btnText.textContent;

    const session = await getCurrentSession();
    if (!session) {
        window.location.href = '/login.html';
        return;
    }

    if (!isProfileComplete()) {
        alert('Please complete your profile by uploading your CV first.');
        window.location.href = '/profile.html';
        return;
    }

    buttonElement.classList.add('loading');
    btnText.textContent = 'Preparing...';
    if (spinner) spinner.style.display = 'inline-block';
    buttonElement.disabled = true;

    try {
        const profileData = JSON.parse(localStorage.getItem('userProfileData') || '{}');
        const cvImages = JSON.parse(localStorage.getItem('userCVImages') || '[]');

        const emailBody = await generateEmailBody(profileData, cvImages, job, tableName);

        window.location.href = constructMailto(job, tableName, emailBody);
    } catch (e) {
        console.error('AI Apply error:', e);
        const fallbackBody = generateFallbackEmail(job);
        window.location.href = constructMailto(job, tableName, fallbackBody);
    } finally {
        buttonElement.classList.remove('loading');
        btnText.textContent = originalText;
        if (spinner) spinner.style.display = 'none';
        buttonElement.disabled = false;
    }
}

async function generateEmailBody(profileData, cvImages, job, tableName) {
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
                    job_title: JOB_TITLE_MAP[tableName] || job.Category || 'the role'
                }
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`AI worker responded with status: ${response.status}`);
        }

        const data = await response.json();

        if (data.email_body && data.email_body.trim() !== '') {
            return data.email_body;
        } else {
            return generateFallbackEmail(job);
        }
    } catch (error) {
        console.error('generateEmailBody error:', error);
        return generateFallbackEmail(job);
    }
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

function checkConnectLink(job) {
    if (job.connect_link && job.connect_link.trim() !== '') return job.connect_link;
    if (job['connect_link'] && job['connect_link'].trim() !== '') return job['connect_link'];
    return null;
}

function formatDescription(text) {
    if (!text) return '';
    return text.replace(/\n/g, '<br>');
}

function showError(msg) {
    const loadingState = document.getElementById('loadingState');
    loadingState.innerHTML = `<div style="text-align:center; padding: 2rem; color: #ef4444;">
        <i class="fas fa-exclamation-circle" style="font-size: 3rem; margin-bottom: 1rem;"></i>
        <h3>Error</h3>
        <p>${msg}</p>
        <a href="/" class="btn-large btn-secondary-large" style="margin-top: 1rem; display: inline-flex; width: auto;">Go Home</a>
    </div>`;
}

init();

