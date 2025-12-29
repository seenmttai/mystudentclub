import { getDaysAgo } from './date-utils.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

const JOB_TITLE_MAP = {
    "Industrial Training Job Portal": "Industrial Trainee",
    "Fresher Jobs": "CA Fresher",
    "Semi Qualified Jobs": "Semi Qualified Chartered Accountant", // User specified example
    "Articleship Jobs": "Articleship Trainee"
};

// Also map for simple display/logic if needed
const TABLE_MAP = {
    "industrial": "Industrial Training Job Portal",
    "fresher": "Fresher Jobs",
    "semi": "Semi Qualified Jobs",
    "articleship": "Articleship Jobs"
};

async function init() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    // Allow type param (industrial, fresher, semi, articleship) or table name directly
    let tableParam = params.get('type') || params.get('table');

    if (!id) {
        showError('No job ID specified.');
        return;
    }

    let tableName = 'Industrial Training Job Portal'; // Default
    if (tableParam) {
        if (TABLE_MAP[tableParam]) tableName = TABLE_MAP[tableParam];
        else if (Object.values(TABLE_MAP).includes(tableParam)) tableName = tableParam;
    }

    try {
        await fetchJobDetails(id, tableName);
    } catch (error) {
        // If failed and no explicit table was provided, maybe try others? 
        // For now, just show error.
        showError('Job not found or error loading details.');
        console.error(error);
    }
}

async function fetchJobDetails(id, tableName) {
    // Select * first to see if connect_link exists, or explicitly select key fields + connect_link
    // I'll try selecting specific fields plus connect_link. If connect_link column doesn't exist, Supabase might error.
    // However, I can't know for sure if the column exists without schema. 
    // Safest is to select *

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

    const companyName = (job.Company || 'Company Name').trim();
    const companyInitial = companyName.charAt(0).toUpperCase();
    const postedDate = job.Created_At ? getDaysAgo(job.Created_At) : 'Recently';
    const salary = job.Salary ? `₹${job.Salary}` : 'Not Disclosed';
    const location = job.Location || 'Remote / Unspecified';
    const category = job.Category || 'General';
    const description = job.Description || 'No description provided.';
    const applyLink = job['Application ID'] || '#';

    // Connect to Peers Logic
    let connectLink = checkConnectLink(job);
    if (!connectLink) {
        const searchKeywordSuffix = JOB_TITLE_MAP[tableName] || "Chartered Accountant";
        // User example: "Deutch Bank Semi Qualified Chartered Accountant"
        const query = `${companyName} ${searchKeywordSuffix}`;
        connectLink = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(query)}&origin=SWITCH_SEARCH_VERTICAL`;
    }

    const html = `
      <div class="job-header-section">
        <div class="job-header-content">
          <div class="company-logo-large">${companyInitial}</div>
          <div class="job-title-block">
            <h1 class="job-company-name">${companyName}</h1>
            <div class="job-company-name">
                <i class="fas fa-map-marker-alt"></i> ${location}
                <span style="margin: 0 10px">•</span>
                <i class="far fa-clock"></i> Posted ${postedDate}
            </div>
          </div>
        </div>
        <!-- Decorative background elements could go here -->
      </div>

      <div class="job-body">
        <div class="main-column">
             <div class="info-grid">
                <div class="info-card">
                    <div class="info-icon"><i class="fas fa-money-bill-wave"></i></div>
                    <div class="info-text">
                        <small>Stipend/Salary</small>
                        <span>${salary}</span>
                    </div>
                </div>
                <div class="info-card">
                    <div class="info-icon"><i class="fas fa-briefcase"></i></div>
                    <div class="info-text">
                        <small>Job Type</small>
                        <span>${category}</span>
                    </div>
                </div>
             </div>

            <div class="description-section">
                <h2><i class="fas fa-align-left" style="color: var(--primary-color);"></i> Job Description</h2>
                <div class="description-content">${formatDescription(description)}</div>
            </div>
        </div>

        <aside class="action-sidebar">
            <div class="action-card">
                <h3>Interested?</h3>
                <p style="color: #64748b; margin-bottom: 1.5rem; font-size: 0.9rem;">
                    Apply now or connect with peers at this company.
                </p>
                
                <a href="${getSafeLink(applyLink)}" target="_blank" class="btn-large btn-primary-large">
                    <i class="fas fa-paper-plane"></i> Apply Now
                </a>

                <a href="${connectLink}" target="_blank" class="btn-large btn-linkedin">
                    <i class="fab fa-linkedin"></i> Connect to Peers
                </a>
                
                <p style="font-size: 0.8rem; color: #94a3b8; margin-top: 1rem;">
                    Found a bug? <a href="/contact.html" style="color: var(--primary-color);">Report it</a>
                </p>
            </div>
        </aside>
      </div>
    `;

    container.innerHTML = html;
    container.classList.add('fade-in');
    loadingState.style.display = 'none';
    container.style.display = 'block';
}

function checkConnectLink(job) {
    // Check various possible column names for connect_link as not sure of exact schema
    // User said "column connect_link"
    if (job.connect_link && job.connect_link.trim() !== '') return job.connect_link;
    if (job['connect_link'] && job['connect_link'].trim() !== '') return job['connect_link'];
    return null;
}

function formatDescription(text) {
    if (!text) return '';
    // Convert newlines to <br> and possibly auto-link URLs
    return text.replace(/\n/g, '<br>');
}

function getSafeLink(link) {
    if (!link) return '#';
    const lower = link.toLowerCase().trim();
    if (lower.startsWith('mailto:')) return link;
    if (lower.startsWith('http')) return link;
    return `https://${link}`; // Fallback
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
