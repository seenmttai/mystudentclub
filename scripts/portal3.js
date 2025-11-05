import { getDaysAgo } from './date-utils.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

window.flutter_app = {
    isReady: false, 
    fcmToken: null
};
window.setFcmToken = function(token) {
    window.flutter_app.fcmToken = token;
    const topicSelectionArea = document.getElementById('topic-selection-area');
    if (topicSelectionArea && topicSelectionArea.style.display !== 'block') {
        updatePermissionStatusUI();
    }
};

let isFetching = false;
let page = 0;
const limit = 15;
let hasMoreData = true;
let currentTable = 'Industrial Training Job Portal';
let currentSession = null;
let appliedJobIds = new Set();
let debounceTimeout = null;
let allLocations = [];
let allCategories = {};
let currentFcmToken = null;
let firebaseMessaging;

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBTIXRJbaZy_3ulG0C8zSI_irZI7Ht2Y-8",
  authDomain: "msc-notif.firebaseapp.com",
  projectId: "msc-notif",
  storageBucket: "msc-notif.appspot.com",
  messagingSenderId: "228639798414",
  appId: "1:228639798414:web:b8b3c96b15da5b770a45df",
  measurementId: "G-X4M23TB936"
};
const VAPID_KEY = "BGlNz4fQGzftJPr2U860MsoIo0dgNcqb2y2jAEbwJzjmj8CbDwJy_kD4eRAcruV6kNRs6Kz-mh9rdC37tVgeI5I";
const JOB_TYPES_NOTIF = [
  { value: "industrial", label: "Industrial Training" },
  { value: "semi", label: "Semi Qualified" },
  { value: "fresher", label: "Fresher" },
  { value: "articleship", label: "Articleship" }
];
const LOCATIONS_NOTIF = [ "mumbai", "bangalore", "gurgaon", "pune", "kolkata", "delhi", "noida", "hyderabad", "ahmedabad", "chennai", "jaipur" ];

const state = {
    keywords: [],
    locations: [],
    categories: [],
    salary: '',
    experience: '',
    sortBy: 'newest',
    applicationStatus: 'all'
};

const dom = {};

const JOB_TITLE_MAP = {
    "Industrial Training Job Portal": "Industrial Training",
    "Fresher Jobs": "CA Fresher",
    "Semi Qualified Jobs": "CA Semi Qualified",
    "Articleship Jobs": "Articleship Trainee"
};

const EMAIL_SUBJECT_MAP = {
    "Industrial Training Job Portal": "Application for CA Industrial Training Position for your organisation",
    "Fresher Jobs": "Application for CA Fresher Position for your organisation",
    "Semi Qualified Jobs": "Application for Semi Qualified CA Position for your organisation",
    "Articleship Jobs": "Application for CA Articleship Role for your organisation"
};

function setActivePortalTab() {
    const path = window.location.pathname;
    document.querySelectorAll('.portal-nav-bar .footer-tab, .site-footer-nav .footer-tab').forEach(tab => tab.classList.remove('active'));
    
    let activeSelector;
    const experienceFilterGroups = document.querySelectorAll('.experience-filter-group');

    experienceFilterGroups.forEach(el => el.style.display = 'none');

    if (path.includes('/articleship')) {
        currentTable = 'Articleship Jobs';
        activeSelector = 'a[href="/articleship.html"]';
    } else if (path.includes('/semi-qualified')) {
        currentTable = 'Semi Qualified Jobs';
        activeSelector = 'a[href="/semi-qualified.html"]';
        experienceFilterGroups.forEach(el => el.style.display = 'block');
    } else if (path.includes('/fresher')) {
        currentTable = 'Fresher Jobs';
        activeSelector = 'a[href="/fresher.html"]';
        experienceFilterGroups.forEach(el => el.style.display = 'block');
    } else { 
        currentTable = 'Industrial Training Job Portal';
        activeSelector = 'a[href="/"]';
    }

    document.querySelectorAll(activeSelector).forEach(el => el.classList.add('active'));
}

function renderJobCard(job) {
    const jobCard = document.createElement('article');
    jobCard.className = 'job-card';
    jobCard.dataset.jobId = job.id;
    jobCard.addEventListener('click', () => showModal(job));
    
    const companyName = (job.Company || '').trim();
    const companyInitial = companyName ? companyName.charAt(0).toUpperCase() : '?';
    const postedDate = job.Created_At ? getDaysAgo(job.Created_At) : 'N/A';
    const isApplied = appliedJobIds.has(job.id);
    const buttonText = isApplied ? 'Applied' : 'View Details';
    const buttonClass = isApplied ? 'applied' : '';

    jobCard.innerHTML = `
        <div class="job-card-logo">${companyInitial}</div>
        <div class="job-card-details">
            <div class="job-card-header">
                <h3 class="job-card-company">${job.Company || 'N/A'}</h3>
                <p class="job-card-posted">Posted ${postedDate}</p>
            </div>
            <div class="job-card-meta">
                <span class="job-tag">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    ${job.Location || 'N/A'}
                </span>
                ${job.Salary ? `<span class="job-tag"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>₹${job.Salary}</span>` : ''}
                ${job.Category ? `<span class="job-tag">${job.Category}</span>` : ''}
            </div>
        </div>
        <div class="job-card-actions">
             <button class="apply-now-card-btn ${buttonClass}">${buttonText}</button>
        </div>`;

    return jobCard;
}

function showModal(job) {
    const companyName = (job.Company || '').trim();
    const companyInitial = companyName ? companyName.charAt(0).toUpperCase() : '?';
    const postedDate = job.Created_At ? getDaysAgo(job.Created_At) : 'N/A';
    const applyLink = getApplicationLink(job['Application ID']);
    const isMailto = applyLink.startsWith('mailto:');
    const isApplied = appliedJobIds.has(job.id);
    const buttonClass = isApplied ? 'applied' : '';

    let actionsHtml = '';
    if (isMailto) {
        const simpleApplyText = isApplied ? 'Applied' : 'Simple Apply';
        const aiApplyText = isApplied ? 'Applied' : 'AI Powered Apply';
        actionsHtml = `
            <button id="modalSimpleApplyBtn" class="btn btn-secondary ${buttonClass}">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                <span>${simpleApplyText}</span>
            </button>
            <button id="modalAiApplyBtn" class="btn btn-primary ${buttonClass}">
                <svg fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>
                <span class="btn-text">${aiApplyText}</span>
                <i class="fas fa-spinner fa-spin"></i>
            </button>`;
    } else {
        const applyText = isApplied ? 'Applied' : 'Apply Now';
        actionsHtml = `
            <a href="${applyLink}" id="modalExternalApplyBtn" class="btn btn-primary ${buttonClass}" target="_blank">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                ${applyText}
            </a>`;
    }

    dom.modalBody.innerHTML = `
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
        <div class="modal-actions">${actionsHtml}</div>
        <div class="modal-section">
            <h3><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>Apply here!</h3>
            <p class="modal-description">${job['Application ID'] || 'No Application ID Available'}</p>
        </div>
        <div class="modal-section">
            <h3><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Job Description</h3>
            <p class="modal-description">${job.Description || 'No description available.'}</p>
        </div>`;
        
    dom.modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    if (isMailto) {
        document.getElementById('modalSimpleApplyBtn').addEventListener('click', (e) => handleApplyClick(job, e.currentTarget, false));
        document.getElementById('modalAiApplyBtn').addEventListener('click', (e) => handleApplyClick(job, e.currentTarget, true));
    } else {
        document.getElementById('modalExternalApplyBtn').addEventListener('click', (e) => handleApplyClick(job, e.currentTarget));
    }
}

function closeModal() {
    dom.modalOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
}

async function fetchFilterOptions() {
    try {
        const [locationsResponse, categoriesResponse] = await Promise.all([
            fetch('/locations.json'),
            fetch('/categories.json')
        ]);

        if (!locationsResponse.ok || !categoriesResponse.ok) {
            throw new Error('Failed to load filter data');
        }

        allLocations = await locationsResponse.json();
        allCategories = await categoriesResponse.json();

    } catch (error) {
        console.error("Error fetching filter options from JSON:", error);
        allLocations = [];
        allCategories = {};
    }
}

async function fetchJobs() {
    if (isFetching) return;
    isFetching = true;
    dom.loader.style.display = 'block';
    dom.loadMoreButton.style.display = 'none';

    try {
        let selectColumns = 'id, Company, Location, Salary, Description, Created_At, Category, "Application ID"';
        if (currentTable === "Fresher Jobs" || currentTable === "Semi Qualified Jobs") {
            selectColumns += ', Experience';
        }
        
        let query = supabaseClient.from(currentTable).select(selectColumns);
        
        if (state.keywords.length > 0) {
            const keywordOrs = state.keywords.map(k => `Company.ilike.%${k}%,Description.ilike.%${k}%,Category.ilike.%${k}%,Location.ilike.%${k}%`).join(',');
            query = query.or(keywordOrs);
        }
        if (state.locations.length > 0) {
            const locationOr = state.locations.map(loc => `Location.ilike.%${loc}%`).join(',');
            query = query.or(locationOr);
        }
        if (state.categories.length > 0) {
            const categoryOr = state.categories.map(cat => `Category.ilike.%${cat}%`).join(',');
            query = query.or(categoryOr);
        }
        if (state.salary) {
            if (state.salary.endsWith('+')) {
                const minValue = parseInt(state.salary);
                if (!isNaN(minValue)) query = query.gte('Salary', minValue);
            } else if (state.salary.includes('-')) {
                const [min, max] = state.salary.split('-').map(Number);
                if (!isNaN(min) && !isNaN(max)) query = query.gte('Salary', min).lte('Salary', max);
            }
        }
        if (state.experience && (currentTable === "Fresher Jobs" || currentTable === "Semi Qualified Jobs")) {
            query = query.eq('Experience', state.experience);
        }
        if (state.applicationStatus === 'not_applied' && currentSession && appliedJobIds.size > 0) {
            query = query.not('id', 'in', `(${[...appliedJobIds].join(',')})`);
        }

        const [sortCol, sortDir] = state.sortBy.split('_');
        const isAsc = sortDir === 'asc';
        query = query.order(sortCol === 'newest' ? 'Created_At' : 'Salary', {
            ascending: isAsc,
            nullsFirst: false
        }).order('id', { ascending: false });

        query = query.range(page * limit, (page + 1) * limit - 1);
        const { data, error } = await query;

        if (error) throw error;

        if (data && data.length > 0) {
            data.forEach(job => dom.jobsContainer.appendChild(renderJobCard(job)));
            page++;
            hasMoreData = data.length === limit;
            if (hasMoreData) dom.loadMoreButton.style.display = 'block';
        } else {
            hasMoreData = false;
            if (page === 0) dom.jobsContainer.innerHTML = '<p class="no-jobs-found">No jobs found matching your criteria.</p>';
        }
    } catch (error) {
        dom.jobsContainer.innerHTML = `<p class="no-jobs-found" style="color:red;">Failed to load jobs: ${error.message}</p>`;
    } finally {
        isFetching = false;
        dom.loader.style.display = 'none';
        renderActiveFilterPills();
        syncFiltersUI();
    }
}

function resetAndFetch() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        page = 0;
        dom.jobsContainer.innerHTML = '';
        hasMoreData = true;
        fetchJobs();
    }, 350);
}

function updateState(newState) {
    Object.assign(state, newState);
    resetAndFetch();
}

function populateSalaryFilter() {
    const salaryFilters = [dom.salaryFilterDesktop, dom.salaryFilterMobile];
    let options = [];
    if (currentTable === "Industrial Training Job Portal") options = [
        { value: '', text: 'Any Stipend' }, 
        { value: '10000-20000', text: '₹10k - ₹20k' }, 
        { value: '20000-40000', text: '₹20k - ₹40k' }, 
        { value: '40000+', text: '₹40k+' }
    ];
    else if (currentTable === "Articleship Jobs") options = [
        { value: '', text: 'Any Stipend' }, 
        { value: '0-5000', text: 'Below ₹5k' }, 
        { value: '5000-10000', text: '₹5k - ₹10k' }, 
        { value: '10000-15000', text: '₹10k - ₹15k' }, 
        { value: '15000+', text: '₹15k+' }
    ];
    else if (currentTable === "Semi Qualified Jobs") options = [
        { value: '', text: 'Any Salary' }, 
        { value: '0-25000', text: 'Below ₹25k' }, 
        { value: '25000-35000', text: '₹25k - ₹35k' }, 
        { value: '35000-50000', text: '₹35k - ₹50k' }, 
        { value: '50000+', text: 'Above ₹50k' }
    ];
    else if (currentTable === "Fresher Jobs") options = [
        { value: '', text: 'Any Salary' }, 
        { value: '0-1200000', text: '< 12 LPA' }, 
        { value: '1200000-1800000', text: '12-18 LPA' }, 
        { value: '1800000+', text: '> 18 LPA' }
    ];

    salaryFilters.forEach(select => {
        if (!select) return;
        select.innerHTML = '';
        options.forEach(opt => { let o = document.createElement('option'); o.value = opt.value; o.textContent = opt.text; select.appendChild(o); });
        select.value = state.salary;
    });
}

function renderPills(container, items, type) {
    if (!container) return;
    container.innerHTML = '';
    items.forEach(item => {
        const pill = document.createElement('div');
        pill.className = 'selected-pill';
        pill.textContent = item;
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => {
            state[type] = state[type].filter(i => i !== item);
            renderPills(container, state[type], type);
            if (container.closest('.filter-sidebar')) {
                resetAndFetch();
            }
        };
        pill.appendChild(removeBtn);
        container.appendChild(pill);
    });
}

function renderActiveFilterPills() {
    dom.activeFiltersDisplay.innerHTML = '';
    const createPill = (item, type) => {
        const pill = document.createElement('div');
        pill.className = 'active-filter-pill';
        pill.textContent = item;
        pill.dataset.type = type;
        const removeBtn = document.createElement('button');
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => {
            state[type] = state[type].filter(i => i !== item);
            syncAndFetch();
        };
        pill.appendChild(removeBtn);
        dom.activeFiltersDisplay.appendChild(pill);
    };

    state.keywords.forEach(item => createPill(item, 'keywords'));
    state.locations.forEach(item => createPill(item, 'locations'));
    state.categories.forEach(item => createPill(item, 'categories'));
}

function syncFiltersUI() {
    renderPills(dom.locationPillsDesktop, state.locations, 'locations');
    renderPills(dom.locationPillsMobile, state.locations, 'locations');
    renderPills(dom.categoryPillsDesktop, state.categories, 'categories');
    renderPills(dom.categoryPillsMobile, state.categories, 'categories');

    if (dom.salaryFilterDesktop) dom.salaryFilterDesktop.value = state.salary;
    if (dom.salaryFilterMobile) dom.salaryFilterMobile.value = state.salary;
    if (dom.sortBySelect) dom.sortBySelect.value = state.sortBy;
    if (dom.sortBySelectMobile) dom.sortBySelectMobile.value = state.sortBy;

    document.querySelectorAll('.experience-filter-group .pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === state.experience);
    });
    document.querySelectorAll('.application-status-filter-group .pill-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === state.applicationStatus);
    });

    renderActiveFilterPills();
}

function syncAndFetch() {
    syncFiltersUI();
    resetAndFetch();
}

function setupMultiSelect(container) {
    if (!container) return;
    const input = container.querySelector('.multi-select-input');
    const optionsContainer = container.querySelector('.multi-select-options');
    const type = container.dataset.type;
    const pillsContainerId = `${type}Pills${container.closest('.filter-modal-content') ? 'Mobile' : 'Desktop'}`;
    const pillsContainer = document.getElementById(pillsContainerId);

    const renderOptions = (filter = '') => {
        const source = type === 'location' ? allLocations : (allCategories[currentTable] || []);
        const stateKey = type === 'location' ? 'locations' : 'categories';
        
        const filteredSource = source.filter(item => 
            item.toLowerCase().includes(filter.toLowerCase()) && 
            !state[stateKey].includes(item)
        );
        
        optionsContainer.innerHTML = '';
        
        filteredSource.forEach(item => {
            const optionEl = document.createElement('div');
            optionEl.className = 'multi-select-option';
            optionEl.textContent = item;
            optionEl.onclick = () => {
                if (!state[stateKey].includes(item)) {
                    state[stateKey].push(item);
                    renderPills(pillsContainer, state[stateKey], stateKey);
                    if (container.closest('.filter-sidebar')) resetAndFetch();
                }
                input.value = '';
                optionsContainer.classList.remove('show');
            };
            optionsContainer.appendChild(optionEl);
        });

        if (filter.trim()) {
            const customOption = document.createElement('div');
            customOption.className = 'multi-select-option';
            customOption.innerHTML = `Add filter for: <strong>"${filter}"</strong>`;
            customOption.onclick = () => {
                const term = filter.trim();
                if (term && !state[stateKey].includes(term)) {
                    state[stateKey].push(term);
                    renderPills(pillsContainer, state[stateKey], stateKey);
                    if (container.closest('.filter-sidebar')) resetAndFetch();
                }
                input.value = '';
                optionsContainer.classList.remove('show');
            };
            optionsContainer.appendChild(customOption);
        }

        optionsContainer.classList.toggle('show', optionsContainer.children.length > 0);
    };

    input.addEventListener('input', () => renderOptions(input.value));
    input.addEventListener('focus', () => renderOptions(input.value));
    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) optionsContainer.classList.remove('show');
    });
}

function processAndApplySearch(inputElement) {
    const value = inputElement.value.trim();
    if (!value) return;

    const terms = value.split(/[\s,]+/).filter(Boolean);
    const currentCategories = allCategories[currentTable] || [];

    terms.forEach(term => {
        const lowerTerm = term.toLowerCase();
        
        const isLocation = allLocations.some(loc => loc.toLowerCase() === lowerTerm);
        const isCategory = currentCategories.some(cat => cat.toLowerCase() === lowerTerm);

        if (isLocation && !state.locations.includes(term)) {
            state.locations.push(term);
        } else if (isCategory && !state.categories.includes(term)) {
            state.categories.push(term);
        } else if (!isLocation && !isCategory && !state.keywords.includes(term)) {
            state.keywords.push(term);
        }
    });

    inputElement.value = '';
    syncAndFetch();
}

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;
    return session;
}

function updateHeaderAuth(session) {
    if (!dom.authButtonsContainer) return;
    if (session) {
        let email = session.user.email || 'User';
        let initial = email.charAt(0).toUpperCase();
        dom.authButtonsContainer.innerHTML = `
            <div class="user-profile-container">
                <div class="user-icon-wrapper">
                    <div class="user-icon" data-email="${email}">${initial}</div>
                    <div class="user-hover-card">
                        <div class="user-hover-content">
                            <p class="user-email">${email}</p>
                            <a href="/profile.html" class="profile-link-btn">Edit Profile</a>
                            <button id="logoutBtn" class="logout-btn">Logout</button>
                        </div>
                    </div>
                </div>
            </div>`;
        const userProfileContainer = dom.authButtonsContainer.querySelector('.user-profile-container');
        const userIconWrapper = userProfileContainer.querySelector('.user-icon-wrapper');
        const userHoverCard = userProfileContainer.querySelector('.user-hover-card');

        userIconWrapper.addEventListener('click', (event) => {
            event.stopPropagation();
            userHoverCard.classList.toggle('show');
        });
        dom.authButtonsContainer.querySelector('#logoutBtn').addEventListener('click', handleLogout);
        checkUserEnrollment();
    } else {
        dom.authButtonsContainer.innerHTML = `<a href="/login.html" class="icon-button" aria-label="Login"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></a>`;
    }
}

window.handleLogout = async () => {
    await supabaseClient.auth.signOut();
    currentSession = null;
    appliedJobIds.clear();
    updateHeaderAuth(null);
    document.querySelectorAll('.application-status-filter-group').forEach(el => el.style.display = 'none');
    const lmsNavLink = document.getElementById('lms-nav-link');
    if (lmsNavLink) lmsNavLink.style.display = 'none';
    state.applicationStatus = 'all';
    resetAndFetch();
};

async function checkUserEnrollment() {
    if (!currentSession || !currentSession.user) return;
    const lmsNavLink = document.getElementById('lms-nav-link');
    if (!lmsNavLink) return;
    try {
        const { error, count } = await supabaseClient.from('enrollment').select('course', { count: 'exact', head: true }).eq('uuid', currentSession.user.id);
        if (error) throw error;
        lmsNavLink.style.display = count > 0 ? 'flex' : 'none';
    } catch (error) { lmsNavLink.style.display = 'none'; }
}

function isProfileComplete() { return !!localStorage.getItem('userCVText'); }

async function handleApplyClick(job, buttonElement, isAiApply = false) {

    markJobAsApplied(job);

    if (isAiApply) {
        if (!currentSession) { window.location.href = '/login.html'; return; }
        if (!isProfileComplete()) {
            alert("Your profile is incomplete. Please upload your resume to use the AI Apply feature.");
            window.location.href = `/profile.html?redirect=${encodeURIComponent(window.location.href)}`;
            return;
        }

        const btnText = buttonElement.querySelector('.btn-text');
        const spinner = buttonElement.querySelector('i.fa-spin');
        const originalText = btnText.textContent;
        btnText.textContent = 'Preparing...';
        if (spinner) spinner.style.display = 'inline-block';
        buttonElement.disabled = true;

        try {
            const profileData = JSON.parse(localStorage.getItem('userProfileData') || '{}');
            const cvText = localStorage.getItem('userCVText');
            const emailBody = await generateEmailBody({ profile_data: profileData, cv_text: cvText }, job);
            window.location.href = constructMailto(job, emailBody);
        } catch (e) {
            alert("Could not generate AI email. Opening a standard email draft.");
            window.location.href = constructMailto(job, ""); 
        } finally {
            btnText.textContent = originalText;
            if (spinner) spinner.style.display = 'none';
            buttonElement.disabled = false;
        }
    } else {
        const applyLink = getApplicationLink(job['Application ID']);
        if (applyLink.startsWith('mailto:')) {
            window.location.href = applyLink;
        }
    }
}

async function markJobAsApplied(job) {
    if (!currentSession || appliedJobIds.has(job.id)) return;

    appliedJobIds.add(job.id);

    document.querySelectorAll(`#modalSimpleApplyBtn, #modalAiApplyBtn, #modalExternalApplyBtn`).forEach(btn => {
        if (btn) {
            btn.classList.add('applied');
            const textEl = btn.querySelector('span') || btn;
            if (textEl) textEl.textContent = 'Applied';
        }
    });
    
    const card = document.querySelector(`.job-card[data-job-id='${job.id}']`);
    if (card) {
        const cardButton = card.querySelector('.apply-now-card-btn');
        if (cardButton) {
            cardButton.classList.add('applied');
            cardButton.textContent = 'Applied';
        }
    }

    try {
        const { error } = await supabaseClient
            .from('job_applications')
            .insert({ user_id: currentSession.user.id, job_id: job.id, job_table: currentTable });
        if (error) throw error;
    } catch (error) {
        console.error('Failed to save application status:', error);
    }
}

async function generateEmailBody(profile, job) {
    const workerUrl = 'https://emailgenerator.bhansalimanan55.workers.dev/';
    try {
        const response = await fetch(workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                profile_data: profile,
                job_details: {
                    company_name: job.Company,
                    job_description: job.Description,
                    job_location: job.Location,
                    job_title: JOB_TITLE_MAP[currentTable] || 'the role'
                }
            })
        });
        if (!response.ok) throw new Error(`AI worker responded with status: ${response.status}`);
        const data = await response.json();
        return data.email_body || "";
    } catch (error) {
        return ""; 
    }
}

function constructMailto(job, body = "") {
    const rawLink = job['Application ID'];
    if (!rawLink) return '#';
    const emailMatch = rawLink.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) return '#';
    const email = emailMatch[0];
    const subjectBase = EMAIL_SUBJECT_MAP[currentTable] || `Application for the role for your organisation`;
    const subject = `${subjectBase} (Ref: My Student Club)`;
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function getApplicationLink(id) {
    if (!id) return '#';
    const trimmedId = id.trim();
    if (trimmedId.startsWith('http')) {
        try {
            new URL(trimmedId);
            return trimmedId;
        } catch (_) {
        }
    }
    if (trimmedId.includes('@')) {
        return constructMailto({ 'Application ID': trimmedId, Company: 'the company' });
    }
    return `https://www.google.com/search?q=${encodeURIComponent(trimmedId + ' careers')}`;
}

async function loadBanners() {
    const carousel = document.querySelector('.carousel');
    const bannerSection = document.querySelector('.banner-section');
    if (!carousel || !bannerSection) return;
    try {
        const { data, error } = await supabaseClient.from('Banners').select('Image, Hyperlink, Type');
        if (error) throw error;
        const banners = data;
        carousel.innerHTML = '';
        const currentType = currentTable === "Semi Qualified Jobs" ? "Semi-Qualified" : currentTable === "Fresher Jobs" ? "Freshers" : currentTable.split(' ')[0];
        const relevantBanners = banners.filter(b => b.Type === 'All' || b.Type === currentType);

        if (relevantBanners.length === 0) { bannerSection.style.display = 'none'; return; }
        bannerSection.style.display = 'block';
        
        relevantBanners.forEach((banner, i) => {
            const a = document.createElement('a');
            a.href = banner.Hyperlink;
            a.className = `carousel-item ${i === 0 ? 'active' : ''}`;
            a.target = "_blank";
            const img = document.createElement('img');
            img.src = banner.Image;
            img.alt = `Banner`;
            a.appendChild(img);
            carousel.appendChild(a);
        });

        const slides = document.querySelectorAll('.carousel-item');
        if (slides.length > 1) {
            let currentSlide = 0;
            const showSlide = (idx) => { slides.forEach(s => s.classList.remove('active')); slides[idx].classList.add('active'); };
            setInterval(() => { currentSlide = (currentSlide + 1) % slides.length; showSlide(currentSlide); }, 5000);
        }
    } catch (e) {
        bannerSection.style.display = 'none';
    }
}

function showNotifStatus(message, type = 'info') { if(dom.notificationStatusEl) { dom.notificationStatusEl.textContent = message; dom.notificationStatusEl.className = `notification-status status-${type}`; dom.notificationStatusEl.style.display = 'block'; if(type!=='error') setTimeout(() => { dom.notificationStatusEl.style.display = 'none'; }, 3000); } }
function getSubscribedTopics() { return JSON.parse(localStorage.getItem('subscribedTopics') || '[]'); }
function saveSubscribedTopics(topics) { localStorage.setItem('subscribedTopics', JSON.stringify(topics)); updateNotificationBadge(); }
function updateNotificationBadge() { if (dom.notificationBadge) dom.notificationBadge.style.visibility = getSubscribedTopics().length > 0 ? 'visible' : 'hidden'; }

function renderSubscribedTopics() {
    if (!dom.subscribedTopicsListEl) return;
    dom.subscribedTopicsListEl.innerHTML = '';
    const topics = getSubscribedTopics();
    if (topics.length === 0) {
        dom.subscribedTopicsListEl.innerHTML = '<p class="no-subscriptions">No active subscriptions.</p>';
    } else {
        topics.forEach(topic => {
            const { location, jobType } = formatTopicForDisplay(topic);
            const tag = document.createElement('div');
            tag.className = 'topic-tag';
            tag.innerHTML = `<span>${location}${jobType ? ` - ${jobType}`: ''}</span><button class="topic-remove" data-topic="${topic}">×</button>`;
            dom.subscribedTopicsListEl.appendChild(tag);
        });
        dom.subscribedTopicsListEl.querySelectorAll('.topic-remove').forEach(btn => btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const topic = btn.dataset.topic;
            if (await unsubscribeFromTopic(topic) && topic === 'all') { dom.topicAllCheckbox.checked = false; }
        }));
    }
    if (dom.topicAllCheckbox) dom.topicAllCheckbox.checked = topics.includes('all');
    updateSpecificTopicAreaVisibility();
}

function formatTopicForDisplay(topic) {
    if (topic === 'all') return { location: 'All', jobType: 'Notifications' };
    const parts = topic.split('-');
    if (parts.length < 2) return { location: topic, jobType: '' };
    const jobTypeVal = parts.pop();
    const location = parts.join('-').replace(/-/g, ' ');
    const jobType = JOB_TYPES_NOTIF.find(t => t.value === jobTypeVal)?.label || jobTypeVal;
    return { location: location.charAt(0).toUpperCase() + location.slice(1), jobType };
}

function updateSpecificTopicAreaVisibility() { if (dom.specificSubscriptionForm) dom.specificSubscriptionForm.style.display = dom.topicAllCheckbox.checked ? 'none' : 'block'; }
async function manageTopicSubscription(topic, action) { 
    currentFcmToken = window.flutter_app.fcmToken || currentFcmToken;
    let retries = 3; 
    while (!currentFcmToken && retries > 0) {
        currentFcmToken = window.flutter_app.fcmToken || currentFcmToken;
        
        if (currentFcmToken) {
            break; 
        }

        retries--;
        showNotifStatus(`Loading...`, 'info');
        await new Promise(resolve => setTimeout(resolve, 10000));
    }

    if (!currentFcmToken) {
        showNotifStatus('Token not available. Please refresh the page.', 'error');
        return false;
    }
    try { 
        const response = await fetch('https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ token: currentFcmToken, topic, action }) }); 
        if (!response.ok) throw new Error(await response.text()); 
        let topics = getSubscribedTopics(); 
        if (action === 'subscribe' && !topics.includes(topic)) topics.push(topic); 
        else if (action === 'unsubscribe') topics = topics.filter(t => t !== topic); 
        saveSubscribedTopics(topics); 
        renderSubscribedTopics(); 
        return true; 
    } catch (err) { 
        showNotifStatus(`Failed to ${action}`, 'error'); 
        return false; 
    } 
}
async function subscribeToTopic(topic) { return manageTopicSubscription(topic, 'subscribe'); }
async function unsubscribeFromTopic(topic) { return manageTopicSubscription(topic, 'unsubscribe'); }

function updatePermissionStatusUI() { 
    if (!dom.permissionStatusDiv) return;
    
    if (window.flutter_app.isReady) {
        dom.enableNotificationsBtn.style.display = 'none';
        dom.topicSelectionArea.style.display = 'block';
        dom.permissionStatusDiv.textContent = 'Notifications are managed by the app.';
        dom.permissionStatusDiv.className = 'notification-status status-success';
        dom.permissionStatusDiv.style.display = 'block';
        return;
    }

    const permission = Notification.permission; 
    dom.enableNotificationsBtn.style.display = permission === 'default' ? 'block' : 'none'; 
    dom.topicSelectionArea.style.display = permission === 'granted' ? 'block' : 'none'; 
    if (permission === 'granted') { 
        dom.permissionStatusDiv.textContent = 'Notifications are enabled.'; 
        dom.permissionStatusDiv.className = 'notification-status status-success'; 
    } else if (permission === 'denied') { 
        dom.permissionStatusDiv.textContent = 'Notifications are blocked in browser settings.'; 
        dom.permissionStatusDiv.className = 'notification-status status-error'; 
    } else { 
        dom.permissionStatusDiv.textContent = 'Enable notifications for job alerts.'; 
        dom.permissionStatusDiv.className = 'notification-status status-info'; 
    } 
    dom.permissionStatusDiv.style.display = 'block'; 
}
function populateNotificationDropdowns() { if (dom.locationSelectEl) { dom.locationSelectEl.innerHTML = '<option value="" disabled selected>Select Location</option>'; LOCATIONS_NOTIF.sort().forEach(loc => { const opt=document.createElement('option'); opt.value=loc; opt.textContent=loc.charAt(0).toUpperCase()+loc.slice(1); dom.locationSelectEl.appendChild(opt); }); } if (dom.jobTypeSelectEl) { dom.jobTypeSelectEl.innerHTML = '<option value="" disabled selected>Select Job Type</option>'; JOB_TYPES_NOTIF.forEach(type => { const opt=document.createElement('option'); opt.value=type.value; opt.textContent=type.label; dom.jobTypeSelectEl.appendChild(opt); }); } }

async function initializeFCM() {
    if (window.flutter_app.isReady) {
        currentFcmToken = window.flutter_app.fcmToken;
        await syncNotificationTopics();
        return;
    }

    try { 
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG); 
        firebaseMessaging = firebase.messaging(); 
        firebaseMessaging.onMessage(payload => {}); 
        if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/firebase-messaging-sw.js'); 
        if (Notification.permission === 'granted') await requestTokenAndSync(); 
    } catch(err) {} 
}

async function requestTokenAndSync() { 
    if (window.flutter_app.isReady) return; 
    if (!firebaseMessaging) return; 
    try { 
        const token = await firebaseMessaging.getToken({ vapidKey: VAPID_KEY }); 
        if (token) { currentFcmToken = token; await syncNotificationTopics(); } 
    } catch (err) {
    } 
}
function shouldSync() { const lastSync = localStorage.getItem('notificationSyncTimestamp'); if (!lastSync) return true; return new Date(parseInt(lastSync)).toDateString() !== new Date().toDateString(); }
async function syncNotificationTopics() { 
    currentFcmToken = window.flutter_app.fcmToken || currentFcmToken;
    if (!currentFcmToken || !shouldSync()) return; 
    await Promise.all(getSubscribedTopics().map(topic => manageTopicSubscription(topic, 'subscribe'))); 
    localStorage.setItem('notificationSyncTimestamp', Date.now().toString()); 
}

async function initializeUserFeatures() {
    if (!currentSession) return;
    document.querySelectorAll('.application-status-filter-group').forEach(el => el.style.display = 'block');
    try {
        const { data, error } = await supabaseClient
            .from('job_applications')
            .select('job_id')
            .eq('user_id', currentSession.user.id)
            .eq('job_table', currentTable);
        if (error) throw error;
        appliedJobIds = new Set(data.map(app => app.job_id));
    } catch (error) {
        console.error('Error fetching applied jobs:', error);
    }
}

function setupEventListeners() {
    dom.modalOverlay.addEventListener('click', (e) => { if (e.target === dom.modalOverlay) closeModal(); });
    dom.modalCloseBtn.addEventListener('click', closeModal);
    dom.loadMoreButton.addEventListener('click', () => fetchJobs());

    [dom.searchInputMobile, dom.searchInputDesktop].forEach(input => {
        if (input) {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    processAndApplySearch(input);
                }
            });
            const searchButton = input.parentElement.querySelector('.search-button');
            if(searchButton) {
                searchButton.addEventListener('click', () => processAndApplySearch(input));
            }
        }
    });

    const handleSortChange = (e) => {
        const newSortBy = e.target.value;
        if (state.sortBy !== newSortBy) {
            updateState({ sortBy: newSortBy });
            if (e.target.id === 'sortBySelect' && dom.sortBySelectMobile) {
                dom.sortBySelectMobile.value = newSortBy;
            } else if (e.target.id === 'sortBySelectMobile' && dom.sortBySelect) {
                dom.sortBySelect.value = newSortBy;
            }
        }
    };
    
    if (dom.sortBySelect) dom.sortBySelect.addEventListener('change', handleSortChange);
    if (dom.sortBySelectMobile) dom.sortBySelectMobile.addEventListener('change', handleSortChange);
    
    dom.menuButton.addEventListener('click', () => dom.expandedMenu.classList.add('active'));
    dom.menuCloseBtn.addEventListener('click', () => dom.expandedMenu.classList.remove('active'));

    dom.openFilterModalBtn.addEventListener('click', () => dom.filterModalOverlay.classList.add('show'));
    dom.closeFilterModalBtn.addEventListener('click', () => dom.filterModalOverlay.classList.remove('show'));
    dom.filterModalOverlay.addEventListener('click', (e) => { if (e.target === dom.filterModalOverlay) dom.filterModalOverlay.classList.remove('show'); });
    
    dom.applyFiltersBtn.addEventListener('click', () => {
        state.salary = dom.salaryFilterMobile.value;
        syncAndFetch();
        dom.filterModalOverlay.classList.remove('show');
    });

    [dom.desktopResetBtn, dom.mobileResetBtn].forEach(btn => {
        if(btn) btn.addEventListener('click', () => {
            state.keywords = [];
            state.locations = []; 
            state.categories = []; 
            state.salary = ''; 
            state.experience = '';
            state.sortBy = 'newest';
            state.applicationStatus = 'all';
            if (dom.searchInputMobile) dom.searchInputMobile.value = '';
            if (currentTable === 'Fresher Jobs') {
                state.experience = 'Freshers';
            }
            if (dom.searchInputDesktop) dom.searchInputDesktop.value = '';
            syncAndFetch();
            if (btn.id === 'mobileResetBtn') dom.filterModalOverlay.classList.remove('show');
        });
    });

    if(dom.salaryFilterDesktop) dom.salaryFilterDesktop.addEventListener('change', () => updateState({ salary: dom.salaryFilterDesktop.value }));

    document.querySelectorAll('.experience-filter-group .pill-options').forEach(group => {
        group.addEventListener('click', (e) => {
            if (e.target.classList.contains('pill-btn')) {
                const value = e.target.dataset.value;
                state.experience = state.experience === value ? '' : value;
                syncAndFetch();
            }
        });
    });

    document.querySelectorAll('.application-status-filter-group .pill-options').forEach(group => {
        group.addEventListener('click', (e) => {
            if (e.target.classList.contains('pill-btn')) {
                const value = e.target.dataset.value;
                state.applicationStatus = value;
                syncAndFetch();
            }
        });
    });

    document.querySelectorAll('.multi-select-container').forEach(setupMultiSelect);
    
    if(dom.notificationsBtn) dom.notificationsBtn.addEventListener('click', (e) => {
        e.stopPropagation(); dom.notificationPopup.style.display = dom.notificationPopup.style.display === 'flex' ? 'none' : 'flex';
        if (dom.notificationPopup.style.display === 'flex') { 
            updatePermissionStatusUI(); 
            if (window.flutter_app.isReady || Notification.permission === 'granted') { 
                if (!firebaseMessaging && !window.flutter_app.isReady) initializeFCM().then(renderSubscribedTopics); 
                else renderSubscribedTopics(); 
            } else { 
                renderSubscribedTopics(); 
            } 
        }
    });

    if(dom.closeNotificationPopup) dom.closeNotificationPopup.addEventListener('click', () => dom.notificationPopup.style.display = 'none');
    if(dom.enableNotificationsBtn) dom.enableNotificationsBtn.addEventListener('click', async () => { try { const permission = await Notification.requestPermission(); updatePermissionStatusUI(); if (permission === 'granted') await initializeFCM(); } catch (err) {} });
    if(dom.topicAllCheckbox) dom.topicAllCheckbox.addEventListener('change', (e) => e.target.checked ? subscribeToTopic('all') : unsubscribeFromTopic('all'));
    if(dom.subscribeBtnEl) dom.subscribeBtnEl.addEventListener('click', async () => { const location = dom.locationSelectEl.value; const jobType = dom.jobTypeSelectEl.value; if (!location || !jobType) return; const topicName = `${location}-${jobType}`; if (await subscribeToTopic(topicName)) { dom.locationSelectEl.selectedIndex = 0; dom.jobTypeSelectEl.selectedIndex = 0; dom.subscribeBtnEl.disabled = true; } });
    if(dom.locationSelectEl && dom.jobTypeSelectEl && dom.subscribeBtnEl) {
        const updateSubBtn = () => { dom.subscribeBtnEl.disabled = !(dom.locationSelectEl.value && dom.jobTypeSelectEl.value); };
        dom.locationSelectEl.addEventListener('change', updateSubBtn);
        dom.jobTypeSelectEl.addEventListener('change', updateSubBtn);
    }

    const resourcesBtn = document.getElementById('resourcesDropdownBtn');
    if (resourcesBtn) {
        const resourcesDropdown = document.getElementById('resourcesDropdown');
        const dropdownIcon = resourcesBtn.querySelector('.dropdown-icon');
        resourcesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resourcesDropdown.classList.toggle('active');
            if (dropdownIcon) dropdownIcon.classList.toggle('open');
        });
    }

    document.addEventListener('click', (e) => {
        if (dom.expandedMenu && dom.expandedMenu.classList.contains('active') && !dom.expandedMenu.contains(e.target) && !dom.menuButton.contains(e.target)) dom.expandedMenu.classList.remove('active');
        if (dom.notificationPopup && dom.notificationPopup.style.display === 'flex' && !dom.notificationPopup.contains(e.target) && !dom.notificationsBtn.contains(e.target)) dom.notificationPopup.style.display = 'none';
        const resourcesDropdown = document.getElementById('resourcesDropdown');
        const resourcesBtn = document.getElementById('resourcesDropdownBtn');
        if (resourcesDropdown && resourcesDropdown.classList.contains('active') && !resourcesDropdown.contains(e.target) && !resourcesBtn.contains(e.target)) {
            resourcesDropdown.classList.remove('active');
            if (resourcesBtn.querySelector('.dropdown-icon')) resourcesBtn.querySelector('.dropdown-icon').classList.remove('open');
        }

        const userProfileContainer = document.querySelector('.user-profile-container');
        const userHoverCard = document.querySelector('.user-hover-card');
        if (userProfileContainer && userHoverCard && userHoverCard.classList.contains('show')) {
            if (!userProfileContainer.contains(e.target)) {
                userHoverCard.classList.remove('show');
            }
        }
    });
}

async function initializePage() {
    dom.jobsContainer = document.getElementById('jobs');
    dom.loader = document.getElementById('loader');
    dom.modalOverlay = document.getElementById('modal');
    dom.modalBody = document.getElementById('modal-body-content');
    dom.modalCloseBtn = document.getElementById('modalCloseBtn');
    dom.searchInputMobile = document.getElementById('searchInputMobile');
    dom.searchInputDesktop = document.getElementById('searchFilterDesktop');
    dom.sortBySelect = document.getElementById('sortBySelect');
    dom.sortBySelectMobile = document.getElementById('sortBySelectMobile');
    dom.loadMoreButton = document.getElementById('loadMore');
    dom.activeFiltersDisplay = document.getElementById('active-filters-display');
    dom.menuButton = document.getElementById('menuButton');
    dom.expandedMenu = document.getElementById('expandedMenu');
    dom.menuCloseBtn = document.getElementById('menuCloseBtn');
    dom.authButtonsContainer = document.querySelector('.auth-buttons-container');
    dom.salaryFilterDesktop = document.getElementById('salaryFilterDesktop');
    dom.locationPillsDesktop = document.getElementById('locationPillsDesktop');
    dom.categoryPillsDesktop = document.getElementById('categoryPillsDesktop');
    dom.desktopResetBtn = document.getElementById('desktopResetBtn');
    dom.openFilterModalBtn = document.getElementById('open-filter-modal-btn');
    dom.filterModalOverlay = document.getElementById('filterModalOverlay');
    dom.closeFilterModalBtn = document.getElementById('closeFilterModalBtn');
    dom.applyFiltersBtn = document.getElementById('applyFiltersBtn');
    dom.mobileResetBtn = document.getElementById('mobileResetBtn');
    dom.salaryFilterMobile = document.getElementById('salaryFilterMobile');
    dom.locationPillsMobile = document.getElementById('locationPillsMobile');
    dom.categoryPillsMobile = document.getElementById('categoryPillsMobile');
    dom.notificationsBtn = document.getElementById('notificationsBtn');
    dom.notificationPopup = document.getElementById('notificationPopup');
    dom.closeNotificationPopup = document.getElementById('closeNotificationPopup');
    dom.notificationStatusEl = document.getElementById('notificationStatus');
    dom.notificationBadge = document.getElementById('notificationBadge');
    dom.topicAllCheckbox = document.getElementById('topic-all');
    dom.topicSelectionArea = document.getElementById('topic-selection-area');
    dom.permissionStatusDiv = document.getElementById('notification-permission-status');
    dom.enableNotificationsBtn = document.getElementById('enable-notifications-btn');
    dom.subscribedTopicsListEl = document.getElementById('subscribedTopicsList');
    dom.locationSelectEl = document.getElementById('locationSelect');
    dom.jobTypeSelectEl = document.getElementById('jobTypeSelect');
    dom.subscribeBtnEl = document.getElementById('subscribeBtn');
    dom.specificSubscriptionForm = document.getElementById('specific-subscription-form');
    
    setActivePortalTab();

    const session = await checkAuth();
    updateHeaderAuth(session);

    if (!session) {
        let visitCount = parseInt(localStorage.getItem('portalVisitCount') || '0');
        visitCount++;
        localStorage.setItem('portalVisitCount', visitCount.toString());
        if (visitCount >= 30000) {
            document.getElementById('loginPromptOverlay').style.display = 'flex';
            const layout = document.querySelector('.job-portal-layout');
            if (layout) layout.style.display = 'none';
            return;
        }
    } else {
        localStorage.removeItem('portalVisitCount');
        await initializeUserFeatures();
    }

    if (currentTable === 'Fresher Jobs') {
        state.experience = 'Freshers';
    }
    
    await fetchFilterOptions();
    
    populateSalaryFilter();
    setupEventListeners();
    syncFiltersUI();
    
    await Promise.all([fetchJobs(), loadBanners()]);
    
    populateNotificationDropdowns();
    updateNotificationBadge();
    if (Notification.permission === 'granted' || window.flutter_app.isReady) {
        initializeFCM();
    }
}

document.addEventListener('DOMContentLoaded', initializePage);