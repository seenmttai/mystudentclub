import { getDaysAgo } from './date-utils.js';

const supabaseUrl = 'https://api.mystudentclub.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

let currentSession = null;
let allApplications = [];
let filteredApplications = [];
let currentPortalFilter = 'all';
let currentSearchTerm = '';
let currentSort = 'newest';

const PORTAL_DISPLAY_NAMES = {
    'Industrial Training Job Portal': 'Industrial Training',
    'Articleship Jobs': 'Articleship',
    'Semi Qualified Jobs': 'Semi Qualified',
    'Fresher Jobs': 'CA Freshers',
    'Experienced CA Jobs': 'Experienced CA'
};

const dom = {
    loader: null,
    historyContent: null,
    searchInput: null,
    sortBySelect: null,
    portalFilters: null,
    applicationCount: null,
    modalOverlay: null,
    modalBody: null,
    modalCloseBtn: null
};

// Initialize DOM elements
function initializeDOM() {
    dom.loader = document.getElementById('loader');
    dom.historyContent = document.getElementById('historyContent');
    dom.searchInput = document.getElementById('searchInput');
    dom.sortBySelect = document.getElementById('sortBySelect');
    dom.portalFilters = document.getElementById('portalFilters');
    dom.applicationCount = document.getElementById('applicationCount');
    dom.modalOverlay = document.getElementById('modal');
    dom.modalBody = document.getElementById('modal-body-content');
    dom.modalCloseBtn = document.getElementById('modalCloseBtn');
    dom.resetFiltersBtn = document.getElementById('resetFiltersBtn');
    dom.portalSelectMobile = document.getElementById('portalSelectMobile');
}

// Check authentication
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;

    if (!currentSession) {
        window.location.href = '/login.html';
        return false;
    }

    // Update auth UI
    updateAuthUI();
    return true;
}

function updateAuthUI() {
    const authContainer = document.querySelector('.auth-buttons-container');
    if (!authContainer) return;

    if (currentSession) {
        authContainer.innerHTML = `
            <a href="/profile.html" class="auth-icon-btn" title="My Profile">
                <i class="fas fa-user"></i>
            </a>
        `;
    } else {
        authContainer.innerHTML = `
            <a href="/login.html" class="auth-icon-btn" title="Login">
                <i class="fas fa-sign-in-alt"></i>
            </a>
        `;
    }
}

// Fetch all applications for current user
async function fetchApplications() {
    if (!currentSession) return [];

    try {
        const { data, error } = await supabaseClient
            .from('job_applications')
            .select('*')
            .eq('user_id', currentSession.user.id)
            .order('applied_at', { ascending: false });

        if (error) throw error;

        // Fetch job details for each application
        const applicationsWithDetails = await Promise.all(
            data.map(async (app) => {
                try {
                    // Start Hack: Check for piggybacked UUID in job_table
                    let targetTable = app.job_table;
                    let targetJobId = app.job_id;

                    if (app.job_table.includes('|')) {
                        const parts = app.job_table.split('|');
                        targetTable = parts[0];
                        targetJobId = parts[1]; // This is the UUID
                    }
                    // End Hack

                    let selectQuery = 'id, Company, Location, Category, Salary, Description, Created_At, "Application ID"';
                    if (targetTable === 'Fresher Jobs') selectQuery += ', Experience';

                    const { data: jobData, error: jobError } = await supabaseClient
                        .from(targetTable)
                        .select(selectQuery)
                        .eq('id', targetJobId) // Use the real ID (UUID or Int)
                        .single();

                    if (jobError) {
                        console.error(`Failed to fetch job ${targetJobId} from ${targetTable}:`, jobError);
                        // Return a placeholder so the application is still visible
                        return {
                            ...app,
                            // Fix: Ensure we use the clean table name for grouping/filtering later
                            job_table: targetTable,
                            job_id: targetJobId,
                            job: {
                                id: targetJobId,
                                Company: 'Unknown Company',
                                Location: 'N/A',
                                Category: 'Job Unavailable',
                                Salary: 'N/A',
                                Description: 'This job post may have been removed or is inaccessible.',
                                Created_At: null,
                                "Application ID": '#'
                            }
                        };
                    }

                    return {
                        ...app,
                        // Fix: Normalize the app object with clean data
                        job_table: targetTable,
                        job_id: targetJobId,
                        job: jobData
                    };
                } catch (err) {
                    console.error('Error fetching job details:', err);
                    return {
                        ...app,
                        job: {
                            id: app.job_id,
                            Company: 'Error Loading',
                            Category: 'Error',
                            Description: 'Failed to load job details.',
                            "Application ID": '#'
                        }
                    };
                }
            })
        );

        // Filter out failed fetches
        return applicationsWithDetails.filter(app => app !== null && app.job !== null);
    } catch (error) {
        console.error('Error fetching applications:', error);
        return [];
    }
}

// Render application card
function renderApplicationCard(application) {
    const job = application.job;
    const companyName = (job.Company || '').trim();
    const companyInitial = companyName ? companyName.charAt(0).toUpperCase() : '?';
    const appliedDate = application.applied_at ? getDaysAgo(application.applied_at) : 'N/A';

    // Determine Portal Name dynamically
    let portalName = PORTAL_DISPLAY_NAMES[application.job_table] || application.job_table;
    if (application.job_table === 'Fresher Jobs' && job.Experience === 'Experienced') {
        portalName = 'Experienced CA';
    }

    const card = document.createElement('article');
    card.className = 'application-card';
    card.dataset.applicationId = application.id;
    card.dataset.jobId = application.job_id;

    // Set data-portal for filtering
    if (application.job_table === 'Fresher Jobs' && job.Experience === 'Experienced') {
        card.dataset.jobTable = 'Experienced CA Jobs'; // Custom tag for filtering
    } else {
        card.dataset.jobTable = application.job_table;
    }

    const isPopular = (application.job.application_count || 0) > 50;

    card.innerHTML = `
        <div class="application-card-logo">${companyInitial}</div>
        <div class="application-card-details">
            <div class="application-card-header">
                <h3 class="application-card-company">${job.Company || 'N/A'}</h3>
                <p class="application-card-applied">Applied ${appliedDate}</p>
            </div>
            <div class="application-card-meta">
                ${isPopular ? `<span class="job-tag" style="background-color: #fef3c7; color: #d97706; border: 1px solid #fcd34d;">Popular</span>` : ''}
                <span class="app-status-badge">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>
                    Applied
                </span>
                <span class="app-portal-tag">${portalName}</span>
                ${job.Location ? `<span class="job-tag">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    ${job.Location}
                </span>` : ''}
                ${job.Category ? `<span class="job-tag">${job.Category}</span>` : ''}
                ${job.Salary ? `<span class="job-tag">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                    ₹${job.Salary}
                </span>` : ''}
            </div>
        </div>
        <div class="application-card-actions">
             <button class="view-details-btn secondary" type="button">View Details</button>
        </div>
    `;

    // Add click handler to show job details
    card.addEventListener('click', () => showJobModal(application));

    return card;
}

// Show job details modal
function showJobModal(application) {
    const job = application.job;
    const companyName = (job.Company || '').trim();
    const companyInitial = companyName ? companyName.charAt(0).toUpperCase() : '?';
    const appliedDate = application.applied_at ? getDaysAgo(application.applied_at) : 'N/A';
    const portalName = PORTAL_DISPLAY_NAMES[application.job_table] || application.job_table;

    // Simple markdown renderer
    const renderMarkdown = (text) => {
        if (!text) return 'No description available.';
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
        return '<p>' + html + '</p>';
    };

    // Generate application links
    const generateApplicationLinks = (applicationId) => {
        if (!applicationId) return '<p class="modal-description">No Application ID Available</p>';
        const links = applicationId.split(',').map(link => link.trim()).filter(link => link);
        if (links.length === 0) return '<p class="modal-description">No Application ID Available</p>';

        return links.map((link, index) => `
            <div style="display: flex; align-items: center; gap: 0.75rem; background: #f8fafc; padding: 0.4rem; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: ${index < links.length - 1 ? '0.75rem' : '0'};">
                <p class="modal-description" style="flex: 1; margin: 0; word-break: break-all; font-size: 0.95rem;">${link}</p>
                <button class="modal-copy-btn" data-copy-text="${link.replace(/"/g, '&quot;')}" style="background: #2563eb; color: white; border: none; border-radius: 6px; padding: 0.6rem 0.8rem; cursor: pointer; transition: all 0.2s; flex-shrink: 0; min-width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;" title="Copy to clipboard">
                    <i class="fas fa-copy" style="font-size: 1rem;"></i>
                </button>
            </div>
        `).join('');
    };

    dom.modalBody.innerHTML = `
        <div class="modal-header">
            <div class="modal-logo">${companyInitial}</div>
            <div class="modal-title-group">
                <h2>${job.Company}</h2>
                <p>${job.Location}</p>
            </div>
        </div>
        <div class="modal-meta-tags">
            <span class="job-tag" style="background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%); border: 1px solid #6ee7b7; color: #065f46;">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 14px; height: 14px;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                </svg>
                Applied ${appliedDate}
            </span>
            <span class="job-tag">Portal: ${portalName}</span>
            ${job.Salary ? `<span class="job-tag">${application.job_table.includes('Semi Qualified') || application.job_table.includes('Fresher') ? 'Salary' : 'Stipend'}: ₹${job.Salary}</span>` : ''}
            ${job.Category ? `<span class="job-tag">Category: ${job.Category}</span>` : ''}
        </div>
        <div class="modal-section">
            <h3><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" /></svg>Application Link</h3>
            ${generateApplicationLinks(job['Application ID'])}
        </div>
        <div class="modal-section">
            <h3><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Job Description</h3>
            <div class="modal-description">${renderMarkdown(job.Description)}</div>
        </div>
    `;

    dom.modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Attach copy button event listeners
    const copyBtns = document.querySelectorAll('.modal-copy-btn');
    copyBtns.forEach(copyBtn => {
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const text = copyBtn.getAttribute('data-copy-text');
            const icon = copyBtn.querySelector('i');
            const originalClass = icon.className;

            navigator.clipboard.writeText(text).then(() => {
                icon.className = 'fas fa-check';
                copyBtn.style.background = '#22c55e';
                setTimeout(() => {
                    icon.className = originalClass;
                    copyBtn.style.background = '#2563eb';
                }, 2000);
            }).catch(err => {
                console.error('Copy failed:', err);
                alert('Failed to copy. Please copy manually.');
            });
        });
    });
}

// Close modal
function closeModal() {
    dom.modalOverlay.style.display = 'none';
    document.body.style.overflow = 'auto';
}

// Filter and sort applications
function filterAndSortApplications() {
    // Filter by portal
    let filtered = allApplications;
    if (currentPortalFilter !== 'all') {
        if (currentPortalFilter === 'Experienced CA Jobs') {
            filtered = filtered.filter(app => app.job_table === 'Fresher Jobs' && app.job?.Experience === 'Experienced');
        } else if (currentPortalFilter === 'Fresher Jobs') {
            filtered = filtered.filter(app => app.job_table === 'Fresher Jobs' && app.job?.Experience !== 'Experienced');
        } else {
            filtered = filtered.filter(app => app.job_table === currentPortalFilter);
        }
    }

    // Filter by search term
    if (currentSearchTerm.trim()) {
        const searchLower = currentSearchTerm.toLowerCase();
        filtered = filtered.filter(app => {
            const company = (app.job.Company || '').toLowerCase();
            const location = (app.job.Location || '').toLowerCase();
            return company.includes(searchLower) || location.includes(searchLower);
        });
    }

    // Sort
    if (currentSort === 'newest') {
        filtered.sort((a, b) => new Date(b.applied_at) - new Date(a.applied_at));
    } else if (currentSort === 'oldest') {
        filtered.sort((a, b) => new Date(a.applied_at) - new Date(b.applied_at));
    } else if (currentSort === 'company_asc') {
        filtered.sort((a, b) => (a.job.Company || '').localeCompare(b.job.Company || ''));
    } else if (currentSort === 'company_desc') {
        filtered.sort((a, b) => (b.job.Company || '').localeCompare(a.job.Company || ''));
    }

    filteredApplications = filtered;
    renderApplications();
    updateCounts();
}

// Update application counts
function updateCounts() {
    const total = allApplications.length;
    dom.applicationCount.textContent = total;

    // Update portal pill counts
    const counts = {
        'all': total,
        'Industrial Training Job Portal': 0,
        'Articleship Jobs': 0,
        'Semi Qualified Jobs': 0,
        'Fresher Jobs': 0,
        'Experienced CA Jobs': 0
    };

    allApplications.forEach(app => {
        let key = app.job_table;
        if (app.job_table === 'Fresher Jobs' && app.job?.Experience === 'Experienced') {
            key = 'Experienced CA Jobs';
        }

        if (counts.hasOwnProperty(key)) {
            counts[key]++;
        }
    });

    Object.keys(counts).forEach(portal => {
        const countElement = document.querySelector(`[data-count="${portal}"]`);
        if (countElement) {
            countElement.textContent = counts[portal];
        }
    });
}

// Render applications
function renderApplications() {
    if (!dom.historyContent) return;

    if (filteredApplications.length === 0) {
        dom.historyContent.innerHTML = `
            <div class="empty-state">
                <svg class="empty-state-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3>${allApplications.length === 0 ? "You haven't applied to any jobs yet" : 'No applications found'}</h3>
                <p>${allApplications.length === 0 ? 'Start your job search journey by browsing available opportunities across our job portals.' : 'Try adjusting your search or filter criteria.'}</p>
                ${allApplications.length === 0 ? '<a href="/" class="empty-state-cta"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width: 20px; height: 20px;"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>Browse Jobs</a>' : ''}
            </div>
        `;
        return;
    }

    // Show all in flat list (no grouping)
    dom.historyContent.innerHTML = '';

    // Create a container for the grid/list if needed, or append directly
    // Using direct append for now to match existing style
    filteredApplications.forEach(app => {
        dom.historyContent.appendChild(renderApplicationCard(app));
    });
}

// Initialize page
async function initializePage() {
    initializeDOM();

    const isAuthenticated = await checkAuth();
    if (!isAuthenticated) return;

    // Show loader
    if (dom.loader) dom.loader.style.display = 'flex';

    // Fetch applications
    allApplications = await fetchApplications();
    filteredApplications = [...allApplications];

    // Hide loader
    if (dom.loader) dom.loader.style.display = 'none';

    // Render
    renderApplications();
    updateCounts();

    // Setup event listeners
    setupEventListeners();

    // Initialize custom dropdowns
    initCustomSelects();
}

// Setup event listeners
function setupEventListeners() {
    // Search
    if (dom.searchInput) {
        dom.searchInput.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value;
            filterAndSortApplications();
        });
    }

    // Sort
    if (dom.sortBySelect) {
        dom.sortBySelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            filterAndSortApplications();
        });
    }

    // Portal filters
    if (dom.portalFilters) {
        const pills = dom.portalFilters.querySelectorAll('.portal-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                currentPortalFilter = pill.dataset.portal;

                // Sync mobile dropdown
                if (dom.portalSelectMobile) {
                    dom.portalSelectMobile.value = currentPortalFilter;
                }

                filterAndSortApplications();
            });
        });
    }

    // Mobile Portal Dropdown
    if (dom.portalSelectMobile) {
        dom.portalSelectMobile.addEventListener('change', (e) => {
            currentPortalFilter = e.target.value;

            // Sync desktop pills
            if (dom.portalFilters) {
                const pills = dom.portalFilters.querySelectorAll('.portal-pill');
                pills.forEach(p => {
                    if (p.dataset.portal === currentPortalFilter) {
                        p.classList.add('active');
                    } else {
                        p.classList.remove('active');
                    }
                });
            }

            filterAndSortApplications();
        });
    }

    // Modal close
    if (dom.modalCloseBtn) {
        dom.modalCloseBtn.addEventListener('click', closeModal);
    }
    if (dom.modalOverlay) {
        dom.modalOverlay.addEventListener('click', (e) => {
            if (e.target === dom.modalOverlay) {
                closeModal();
            }
        });
    }

    // Menu toggle
    const menuButton = document.getElementById('menuButton');
    const menuCloseBtn = document.getElementById('menuCloseBtn');
    const expandedMenu = document.getElementById('expandedMenu');

    if (menuButton && expandedMenu) {
        menuButton.addEventListener('click', () => {
            expandedMenu.classList.add('active');
        });
    }

    if (menuCloseBtn && expandedMenu) {
        menuCloseBtn.addEventListener('click', () => {
            expandedMenu.classList.remove('active');
        });
    }

    // Dropdown toggles
    const dropdownBtns = document.querySelectorAll('.menu-item-dropdown:not(.always-open) .menu-item');
    dropdownBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const dropdown = btn.nextElementSibling;
            const icon = btn.querySelector('.dropdown-icon');
            if (dropdown) {
                dropdown.classList.toggle('active');
                if (icon) icon.classList.toggle('open');
            }
        });
    });

    // --- Mobile Interactions ---
    const mobileSearchInput = document.getElementById('mobileSearchInput');
    const mobileFilterToggle = document.getElementById('mobileFilterToggle');
    const filterSidebar = document.getElementById('filterSidebar');
    const closeSidebarBtn = document.getElementById('closeSidebarBtn');

    // Sync Mobile Search with Desktop Search Logic
    if (mobileSearchInput) {
        mobileSearchInput.addEventListener('input', (e) => {
            const searchFilter = document.getElementById('searchFilter') || document.getElementById('searchInput');
            if (searchFilter) {
                searchFilter.value = e.target.value;
                // Trigger the existing search logic
                searchFilter.dispatchEvent(new Event('input'));
            }
        });
    }

    // Toggle Filter Sidebar on Mobile
    if (mobileFilterToggle && filterSidebar) {
        mobileFilterToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            filterSidebar.classList.add('active');
            document.body.style.overflow = 'hidden';
        });
    }

    // Close Sidebar Helper
    function closeSidebar() {
        if (filterSidebar) {
            filterSidebar.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    if (closeSidebarBtn) {
        closeSidebarBtn.addEventListener('click', closeSidebar);
    }

    // Close sidebar when clicking outside
    document.addEventListener('click', (e) => {
        if (filterSidebar && filterSidebar.classList.contains('active')) {
            // Check if click is outside sidebar and not on the toggle button
            if (!filterSidebar.contains(e.target) && !mobileFilterToggle.contains(e.target)) {
                closeSidebar();
            }
        }
    });
}



// Custom Dropdown Implementation (Matches index.html/portal3.js)
function initCustomSelects() {
    const selectorIds = ['sortBySelect', 'portalSelectMobile'];

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select-wrapper')) {
            document.querySelectorAll('.custom-select-wrapper.open').forEach(wrapper => {
                wrapper.classList.remove('open');
                const opts = wrapper.querySelector('.custom-options');
                if (opts) {
                    opts.style.opacity = '0';
                    setTimeout(() => opts.style.display = 'none', 200);
                }
            });
        }
    });

    selectorIds.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        // Ensure we don't double-wrap if re-run
        if (select.parentNode.classList.contains('custom-select-wrapper')) return;

        // Create Custom UI
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        trigger.innerHTML = `<span>${select.options[select.selectedIndex]?.text || 'Select'}</span><div class="custom-arrow"></div>`;

        const optionsList = document.createElement('div');
        optionsList.className = 'custom-options';

        // Function to rebuild options
        const buildOptions = () => {
            optionsList.innerHTML = '';
            Array.from(select.options).forEach(opt => {
                const div = document.createElement('div');
                div.className = `custom-option ${opt.selected ? 'selected' : ''}`;
                div.textContent = opt.text;
                div.dataset.value = opt.value;
                div.addEventListener('click', (e) => {
                    e.stopPropagation();
                    select.value = opt.value;
                    trigger.querySelector('span').textContent = opt.text;
                    wrapper.classList.remove('open');
                    optionsList.style.display = 'none'; // Instant hide

                    // Visual update
                    optionsList.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                    div.classList.add('selected');

                    // Trigger native event
                    select.dispatchEvent(new Event('change'));
                });
                optionsList.appendChild(div);
            });
        };

        // Initial build
        buildOptions();

        // Assemble
        select.style.display = 'none';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select); // Move select inside to keep DOM clean-ish
        wrapper.appendChild(trigger);
        wrapper.appendChild(optionsList);

        // Toggle Event
        trigger.addEventListener('click', () => {
            const isOpen = wrapper.classList.contains('open');
            // Close others
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                if (w !== wrapper) {
                    w.classList.remove('open');
                    w.querySelector('.custom-options').style.display = 'none';
                }
            });

            if (!isOpen) {
                wrapper.classList.add('open');
                optionsList.style.display = 'block';
                // Trigger reflow
                optionsList.offsetHeight;
                optionsList.style.opacity = '1';
            } else {
                wrapper.classList.remove('open');
                optionsList.style.opacity = '0';
                setTimeout(() => optionsList.style.display = 'none', 200);
            }
        });

        // REACTIVITY: Watch for Native Changes (JS updates, Resets)
        // 1. MutationObserver for option changes (dynamic loading)
        const observer = new MutationObserver(() => {
            buildOptions();
            const sel = select.options[select.selectedIndex];
            if (sel) trigger.querySelector('span').textContent = sel.text;
        });
        observer.observe(select, { childList: true, subtree: true });

        // 2. Intercept programmatic .value changes (e.g. Reset Button)
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        Object.defineProperty(select, 'value', {
            get: function () { return descriptor.get.call(this); },
            set: function (val) {
                descriptor.set.call(this, val);
                // Update UI
                const sel = this.options[this.selectedIndex];
                if (sel) {
                    trigger.querySelector('span').textContent = sel.text;
                    optionsList.querySelectorAll('.custom-option').forEach(o => {
                        o.classList.toggle('selected', o.dataset.value === val);
                    });
                }
            }
        });

        // 3. Listen for internal value changes (standard change event)
        select.addEventListener('change', () => {
            const sel = select.options[select.selectedIndex];
            if (sel) {
                trigger.querySelector('span').textContent = sel.text;
                optionsList.querySelectorAll('.custom-option').forEach(o => {
                    o.classList.toggle('selected', o.dataset.value === select.value);
                });
            }
        });
    });
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', initializePage);
