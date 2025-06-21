import { getDaysAgo } from '../scripts/date-utils.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

const jobsContainer = document.getElementById('jobs');
const loader = document.getElementById('loader');
const modalOverlay = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const searchInput = document.getElementById('searchInput');
const locationSearchInput = document.getElementById('locationSearchInput');
const salaryFilter = document.getElementById('salaryFilter');
const categoryFilter = document.getElementById('categoryFilter');
const loadMoreButton = document.getElementById('loadMore');
const footerNav = document.querySelector('.footer-nav');
const menuButton = document.getElementById('menuButton');
const menuCloseBtn = document.getElementById('menuCloseBtn');
const expandedMenu = document.getElementById('expandedMenu');
const authButtonsContainer = document.querySelector('.auth-buttons');

let isFetching = false;
let page = 0;
const limit = 15;
let timeout = null;
let hasMoreData = true;
let currentTable = 'Industrial Training Job Portal';

function renderJobCard(job) {
    const jobCard = document.createElement('article');
    jobCard.className = 'job-card';
    jobCard.addEventListener('click', () => showModal(job));

    const companyInitial = job.Company ? job.Company.charAt(0).toUpperCase() : '?';
    const postedDate = job.Created_At ? getDaysAgo(job.Created_At) : 'N/A';

    jobCard.innerHTML = `
        <div class="job-card-logo">${companyInitial}</div>
        <div class="job-card-details">
            <div class="job-card-header">
                <h3 class="job-card-company">${job.Company || 'N/A'}</h3>
                <p class="job-card-posted">Posted ${postedDate}</p>
            </div>
            <div class="job-card-meta">
                <span class="job-tag">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    ${job.Location || 'N/A'}
                </span>
                ${job.Salary ? `
                <span class="job-tag">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    ₹${job.Salary}
                </span>` : ''}
            </div>
        </div>
    `;
    return jobCard;
}

function getPeerLink(job) {
    if (job.connect_link && isValidUrl(job.connect_link)) {
        return job.connect_link;
    }
    const companyName = job.Company || '';
    const keywords = `"Industrial Trainee" AND "${companyName}"`;
    return `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}&origin=FACETED_SEARCH`;
}

function showModal(job) {
    const companyInitial = job.Company ? job.Company.charAt(0).toUpperCase() : '?';
    const postedDate = job.Created_At ? getDaysAgo(job.Created_At) : 'N/A';
    
    modalBody.innerHTML = `
        <div class="modal-header">
            <div class="modal-logo">${companyInitial}</div>
            <div class="modal-title-group">
                <h2>${job.Company}</h2>
                <p>${job.Location}</p>
            </div>
        </div>
        <div class="modal-meta-tags">
            ${job.Salary ? `<span class="job-tag">Stipend: ₹${job.Salary}</span>` : ''}
            <span class="job-tag">Posted: ${postedDate}</span>
            ${job.Category ? `<span class="job-tag">Category: ${job.Category}</span>` : ''}
        </div>
        <div class="modal-section">
            <h3>Job Description</h3>
            <p class="modal-description">${job.Description || 'No description available.'}</p>
        </div>
        <div class="modal-actions">
            <a href="${getApplicationLink(job['Application ID'])}" class="btn btn-primary" ${isValidUrl(job['Application ID']) ? 'target="_blank"' : ''}>Apply Now</a>
            <a href="${getPeerLink(job)}" class="btn btn-secondary" target="_blank">Connect to Peer</a>
        </div>
    `;
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    modalOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
}

function isValidUrl(s) {
    try { new URL(s); return true; } catch (_) { return false; }
}

function getApplicationLink(id) {
    if (!id) return '#';
    if (isValidUrl(id)) return id;
    let emails = id.split(/,|\s/).filter(e => e && e.includes('@'));
    if (emails.length === 0) return '#';
    let email = emails[0];
    let subject = `Application for ${currentTable.replace(' Jobs', '')} (Ref: My Student Club)`;
    return `mailto:${email}?subject=${encodeURIComponent(subject)}`;
}

async function fetchJobs() {
    if (isFetching) return;
    isFetching = true;
    loader.style.display = 'block';
    loadMoreButton.style.display = 'none';

    try {
        let query = supabaseClient.from(currentTable).select('*', { count: 'exact' });

        const searchTerm = searchInput.value.trim();
        if (searchTerm) {
            query = query.or(`Company.ilike.%${searchTerm}%,Location.ilike.%${searchTerm}%,Description.ilike.%${searchTerm}%`);
        }
        const locationSearch = locationSearchInput.value.trim();
        if (locationSearch) {
            query = query.ilike('Location', `%${locationSearch}%`);
        }
        const salary = salaryFilter.value;
        if (salary) {
            if (salary.endsWith('+')) {
                query = query.gte('Salary', parseInt(salary));
            } else if (salary.includes('-')) {
                const [min, max] = salary.split('-').map(Number);
                query = query.gte('Salary', min).lte('Salary', max);
            }
        }
        const category = categoryFilter.value;
        if (category) {
            query = query.ilike('Category', `%${category}%`);
        }

        query = query.order('Created_At', { ascending: false }).range(page * limit, (page + 1) * limit - 1);
        const { data, error } = await query;

        if (error) throw error;

        if (data && data.length > 0) {
            data.forEach(job => jobsContainer.appendChild(renderJobCard(job)));
            page++;
            hasMoreData = data.length === limit;
            if (hasMoreData) loadMoreButton.style.display = 'block';
        } else {
            hasMoreData = false;
            if (page === 0) jobsContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary);">No jobs found matching your criteria.</p>';
        }
    } catch (error) {
        console.error('Error fetching jobs:', error);
        jobsContainer.innerHTML = '<p style="text-align:center; color: red;">Failed to load jobs. Please try again.</p>';
    } finally {
        isFetching = false;
        loader.style.display = 'none';
    }
}

function resetAndFetch() {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        page = 0;
        jobsContainer.innerHTML = '';
        hasMoreData = true;
        fetchJobs();
    }, 300);
}

function setupEventListeners() {
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
    modalCloseBtn.addEventListener('click', closeModal);
    searchInput.addEventListener('input', resetAndFetch);
    locationSearchInput.addEventListener('input', resetAndFetch);
    salaryFilter.addEventListener('change', resetAndFetch);
    categoryFilter.addEventListener('change', resetAndFetch);
    loadMoreButton.addEventListener('click', fetchJobs);
    menuButton.addEventListener('click', () => expandedMenu.classList.add('active'));
    menuCloseBtn.addEventListener('click', () => expandedMenu.classList.remove('active'));
    document.addEventListener('click', (e) => {
        if (!expandedMenu.contains(e.target) && !menuButton.contains(e.target)) {
            expandedMenu.classList.remove('active');
        }
    });
}

function populateSalaryFilter(table) {
    salaryFilter.innerHTML = '';
    let options = [];
    if (table === "Industrial Training Job Portal") {
        options = [{ value: '', text: 'Any Stipend' }, { value: '10000-20000', text: '₹10k - ₹20k' }, { value: '20000-40000', text: '₹20k - ₹40k' }, { value: '40000+', text: '₹40k+' }];
    } else {
        options = [{ value: '', text: 'Any Salary' }];
    }
    options.forEach(opt => {
        let o = document.createElement('option');
        o.value = opt.value; o.textContent = opt.text;
        salaryFilter.appendChild(o);
    });
}

async function fetchCategories() {
    categoryFilter.innerHTML = `<option value="">All Categories</option>`;
    let categories = ["Accounting", "Auditing", "Finance", "Taxation", "Consultancy", "Investment Banking"];
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
}

function setupFooterNav() {
    const navItems = [
        { name: 'Industrial Training', table: 'Industrial Training Job Portal', icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>' },
        { name: 'Articleship', table: 'Articleship Jobs', icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>' },
        { name: 'Semi Qualified', table: 'Semi Qualified Jobs', icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>' },
        { name: 'Freshers', table: 'Fresher Jobs', icon: '<path stroke-linecap="round" stroke-linejoin="round" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>' }
    ];

    footerNav.innerHTML = navItems.map(item => `
        <button class="footer-tab ${item.table === currentTable ? 'active' : ''}" data-table="${item.table}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.icon}</svg>
            <span>${item.name}</span>
        </button>
    `).join('');

    footerNav.querySelectorAll('.footer-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentTable = tab.dataset.table;
            footerNav.querySelectorAll('.footer-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            populateSalaryFilter(currentTable);
            fetchCategories();
            resetAndFetch();
        });
    });
}

async function updateHeaderAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
        authButtonsContainer.innerHTML = `<button class="header-icon-btn" id="profileBtn" aria-label="Profile"><svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"></path></svg></button>`;
    } else {
        authButtonsContainer.innerHTML = `<a href="/login.html" class="header-icon-btn" aria-label="Login"><svg viewBox="0 0 24 24"><path d="M12 5.9c1.16 0 2.1.94 2.1 2.1s-.94 2.1-2.1 2.1S9.9 9.16 9.9 8s.94-2.1 2.1-2.1m0 9c2.97 0 6.1 1.46 6.1 2.1v1.1H5.9V17c0-.64 3.13-2.1 6.1-2.1M12 4C9.79 4 8 5.79 8 8s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 9c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4z"></path></svg></a>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateHeaderAuth();
    populateSalaryFilter(currentTable);
    fetchCategories();
    fetchJobs();
    setupEventListeners();
    setupFooterNav();
});