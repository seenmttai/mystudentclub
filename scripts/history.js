import { getDaysAgo } from './date-utils.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = window._mscSupabaseClient || supabase.createClient(supabaseUrl, supabaseKey);
window._mscSupabaseClient = supabaseClient;

const BOOKMARKS_KEY = 'msc_bookmarks';

const PORTAL_LABELS = {
    'Industrial Training Job Portal': 'Industrial',
    'Articleship Jobs': 'Articleship',
    'Semi Qualified Jobs': 'Semi Qualified',
    'Fresher Jobs': 'CA Fresher',
    'Experienced CA Jobs': 'Experienced CA',
};

const PORTAL_URLS = {
    'Industrial Training Job Portal': '/index-new.html',
    'Articleship Jobs': '/articleship-new.html',
    'Fresher Jobs': '/fresher-new.html',
    'Semi Qualified Jobs': '/semi-new.html',
};

// ── State ──
let currentSession = null;
let allApplications = [];
let bookmarks = [];
let activeTab = 'applied';
let searchTerm = '';
let activePortalFilter = 'all';

// ── Helpers ──
function getInitials(name) {
    return (name || '').split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}
const PALETTE = [
    { bg: '#EEF2FF', fg: '#4338CA' }, { bg: '#FEF3C7', fg: '#92400E' },
    { bg: '#DCFCE7', fg: '#166534' }, { bg: '#FCE7F3', fg: '#9D174D' },
    { bg: '#E0F2FE', fg: '#0369A1' }, { bg: '#FFF7ED', fg: '#9A3412' },
    { bg: '#F0FDF4', fg: '#15803D' }, { bg: '#FFF1F2', fg: '#BE123C' },
];
function getAvatarColors(name) {
    let h = 0;
    for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
    return PALETTE[h % PALETTE.length];
}


function renderMarkdown(text) {
    if (!text) return '<p style="color:var(--sub);font-size:0.875rem;">No description available.</p>';
    return '<p>' + text
        .replace(/^### (.*)$/gim, '</p><h3 style="font-size:14px;font-weight:700;color:var(--text);margin:10px 0 4px">$1</h3><p>')
        .replace(/^## (.*)$/gim, '</p><h2 style="font-size:15px;font-weight:700;color:var(--text);margin:12px 0 4px">$1</h2><p>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>') + '</p>';
}

// ── Bookmarks ──
function getBookmarks() { try { return JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]'); } catch { return []; } }
function saveBookmarks(bms) { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bms)); }
function removeBookmark(id, table) {
    const bms = getBookmarks().filter(b => !(b.id === id && b.table === table));
    saveBookmarks(bms);
    bookmarks = bms;
}

// ── Theme ──
function applyTheme() {
    const saved = localStorage.getItem('msc-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
}

// ── Auth ──
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;
    if (!session) { window.location.href = '/login.html'; return false; }
    const greetingText = document.getElementById('greetingText');
    const greetingName = document.getElementById('greetingName');
    if (greetingText) greetingText.textContent = 'Welcome!';
    if (greetingName) {
        let name = session.user.email || 'User';
        try { const p = JSON.parse(localStorage.getItem('userProfileData') || '{}'); if (p.name?.trim()) name = p.name.trim(); } catch {}
        greetingName.textContent = name;
    }
    // Show auth-gated menu items
    document.getElementById('history-nav-link')?.removeAttribute('style');
    document.getElementById('lms-nav-link')?.removeAttribute('style');
    return true;
}

// ── Fetch applications ──
async function fetchApplications() {
    if (!currentSession) return [];
    try {
        const { data, error } = await supabaseClient
            .from('job_applications')
            .select('*')
            .eq('user_id', currentSession.user.id)
            .order('applied_at', { ascending: false });
        if (error) throw error;

        return (await Promise.all(data.map(async (app) => {
            try {
                let targetTable = app.job_table;
                let targetJobId = app.job_id;
                if (app.job_table.includes('|')) {
                    const [t, id] = app.job_table.split('|');
                    targetTable = t; targetJobId = id;
                }
                let sel = 'id, Company, Location, Category, Salary, Description, Created_At, "Application ID", "Primary Domain", "Company Type", "Industry Type"';
                if (targetTable === 'Fresher Jobs') {
                    sel += ', Experience, yoe, "Secondary Domain", Tags, "CTC Range"';
                } else if (targetTable === 'Semi Qualified Jobs') {
                    sel += ', Experience, "Secondary Domain", Tags';
                } else if (targetTable === 'Industrial Training Job Portal') {
                    sel += ', "Stipend Range", "Functional Tags", "Technology Tags"';
                } else if (targetTable === 'Articleship Jobs') {
                    sel += ', "Exposure Tags", "Firm Type", "Client Exposure Tags", "Stipend Range"';
                }
                const { data: job, error: je } = await supabaseClient.from(targetTable).select(sel).eq('id', targetJobId).single();
                if (je) return { ...app, job_table: targetTable, job_id: targetJobId, job: { id: targetJobId, Company: 'Unknown Company', Location: 'N/A', Category: 'Job Unavailable', Description: 'This job post may have been removed.', 'Application ID': '#' } };
                return { ...app, job_table: targetTable, job_id: targetJobId, job };
            } catch { return null; }
        }))).filter(Boolean);
    } catch { return []; }
}

// ── Toast ──
function showToast(msg, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// ── Render applied card ──
function renderAppliedCard(app) {
    const job = app.job;
    const colors = getAvatarColors(job.Company || '');
    const initials = getInitials(job.Company || '');
    const appliedDate = app.applied_at ? getDaysAgo(app.applied_at) : '';
    let portalLabel = PORTAL_LABELS[app.job_table] || app.job_table;
    if (app.job_table === 'Fresher Jobs' && job.Experience === 'Experienced') portalLabel = 'Experienced CA';
    const isStipend = app.job_table === 'Industrial Training Job Portal' || app.job_table === 'Articleship Jobs';

    const primaryDomain = job['Primary Domain'] || job.Category || '';
    const secondaryDomain = (app.job_table === 'Fresher Jobs' || app.job_table === 'Semi Qualified Jobs') ? job['Secondary Domain'] : null;
    const companyType = job['Company Type'];
    const firmType = job['Firm Type'];
    const industryType = job['Industry Type'];
    
    const postedDate = job.Created_At ? getDaysAgo(job.Created_At) : '';
    const postedText = postedDate ? `Posted ${postedDate}` : '';

    const card = document.createElement('article');
    card.className = 'job-card-new';
    card.innerHTML = `
        <div class="jc-top">
            <div class="jc-avatar" style="background:${colors.bg};color:${colors.fg}">${initials}</div>
            <div class="jc-info">
                <div class="jc-role">${job.Company || 'N/A'}</div>
                <div class="jc-company">${postedText}</div>
            </div>
            <span class="hist-applied-badge">✓ Applied</span>
        </div>
        <div class="jc-chips">
            <span class="jc-chip jc-chip-type">${portalLabel}</span>
            ${primaryDomain ? `<span class="jc-chip jc-chip-domain">${primaryDomain}</span>` : ''}
            ${secondaryDomain ? `<span class="jc-chip jc-chip-domain" style="background-color: #e0f2fe; color: #0369a1; border-color: #bae6fd;">${secondaryDomain}</span>` : ''}
            ${companyType ? `<span class="jc-chip"><i class="fa-solid fa-building" style="margin-right: 4px; color: #94a3b8;"></i>${companyType}</span>` : ''}
            ${firmType ? `<span class="jc-chip"><i class="fa-solid fa-briefcase" style="margin-right: 4px; color: #94a3b8;"></i>${firmType}</span>` : ''}
            ${industryType ? `<span class="jc-chip"><i class="fa-solid fa-industry" style="margin-right: 4px; color: #94a3b8;"></i>${industryType}</span>` : ''}
            ${job.Location ? `<span class="jc-chip"><i class="fa-regular fa-compass" style="margin-right: 4px; color: #94a3b8;"></i>${job.Location.split(',')[0]}</span>` : ''}
        </div>
        <div class="jc-divider"></div>
        <div class="jc-footer">
            <div class="jc-footer-left">
                ${(() => {
                  if (job.Salary) {
                    const period = isStipend ? '<span class="jc-salary-period">/month</span>' : "";
                    return `<div class="jc-salary">₹${job.Salary}${period}</div>`;
                  } else if (app.job_table === "Fresher Jobs" && job["CTC Range"]) {
                    return `<div class="jc-salary">${job["CTC Range"]}</div>`;
                  } else if (isStipend && job["Stipend Range"]) {
                    let range = job["Stipend Range"];
                    if (range && /^\d+/.test(range.trim())) {
                      range = `₹${range}`;
                    }
                    const period = isStipend ? '<span class="jc-salary-period">/month</span>' : "";
                    return `<div class="jc-salary">${range}${period}</div>`;
                  } else {
                    return "";
                  }
                })()}
                <div class="jc-meta">${appliedDate ? `Applied ${appliedDate}` : ''}</div>
            </div>
            <button class="jc-apply-btn applied">View →</button>
        </div>`;
    card.addEventListener('click', () => showJobDetail(job, { type: 'applied', appliedAt: app.applied_at, jobTable: app.job_table }));
    return card;
}

// ── Render saved card ──
function renderSavedCard(bm) {
    const colors = getAvatarColors(bm.Company || '');
    const initials = getInitials(bm.Company || '');
    const portalLabel = PORTAL_LABELS[bm.table] || bm.table || '';
    const savedDate = bm.savedAt ? getDaysAgo(bm.savedAt) : '';
    const isStipend = bm.table === 'Industrial Training Job Portal' || bm.table === 'Articleship Jobs';

    const primaryDomain = bm['Primary Domain'] || bm.Category || '';
    const secondaryDomain = (bm.table === 'Fresher Jobs' || bm.table === 'Semi Qualified Jobs') ? bm['Secondary Domain'] : null;
    const companyType = bm['Company Type'];
    const firmType = bm['Firm Type'];
    const industryType = bm['Industry Type'];
    
    const postedDate = bm.Created_At ? getDaysAgo(bm.Created_At) : '';
    const postedText = postedDate ? `Posted ${postedDate}` : '';

    const card = document.createElement('article');
    card.className = 'job-card-new';
    card.innerHTML = `
        <div class="jc-top">
            <div class="jc-avatar" style="background:${colors.bg};color:${colors.fg}">${initials}</div>
            <div class="jc-info">
                <div class="jc-role">${bm.Company || 'N/A'}</div>
                <div class="jc-company">${postedText}</div>
            </div>
            <button class="jc-bookmark saved" data-id="${bm.id}" data-table="${bm.table || ''}" aria-label="Remove saved">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4z"/></svg>
            </button>
        </div>
        <div class="jc-chips">
            ${portalLabel ? `<span class="jc-chip jc-chip-type">${portalLabel}</span>` : ''}
            ${primaryDomain ? `<span class="jc-chip jc-chip-domain">${primaryDomain}</span>` : ''}
            ${secondaryDomain ? `<span class="jc-chip jc-chip-domain" style="background-color: #e0f2fe; color: #0369a1; border-color: #bae6fd;">${secondaryDomain}</span>` : ''}
            ${companyType ? `<span class="jc-chip"><i class="fa-solid fa-building" style="margin-right: 4px; color: #94a3b8;"></i>${companyType}</span>` : ''}
            ${firmType ? `<span class="jc-chip"><i class="fa-solid fa-briefcase" style="margin-right: 4px; color: #94a3b8;"></i>${firmType}</span>` : ''}
            ${industryType ? `<span class="jc-chip"><i class="fa-solid fa-industry" style="margin-right: 4px; color: #94a3b8;"></i>${industryType}</span>` : ''}
            ${bm.Location ? `<span class="jc-chip"><i class="fa-regular fa-compass" style="margin-right: 4px; color: #94a3b8;"></i>${bm.Location.split(',')[0]}</span>` : ''}
        </div>
        <div class="jc-divider"></div>
        <div class="jc-footer">
            <div class="jc-footer-left">
                ${(() => {
                  if (bm.Salary) {
                    const period = isStipend ? '<span class="jc-salary-period">/month</span>' : "";
                    return `<div class="jc-salary">₹${bm.Salary}${period}</div>`;
                  } else if (bm.table === "Fresher Jobs" && bm["CTC Range"]) {
                    return `<div class="jc-salary">${bm["CTC Range"]}</div>`;
                  } else if (isStipend && bm["Stipend Range"]) {
                    let range = bm["Stipend Range"];
                    if (range && /^\d+/.test(range.trim())) {
                      range = `₹${range}`;
                    }
                    const period = isStipend ? '<span class="jc-salary-period">/month</span>' : "";
                    return `<div class="jc-salary">${range}${period}</div>`;
                  } else {
                    return "";
                  }
                })()}
                <div class="jc-meta">${savedDate ? `Saved ${savedDate}` : ''}</div>
            </div>
            <button class="jc-apply-btn">Apply →</button>
        </div>`;

    card.querySelector('.jc-apply-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = PORTAL_URLS[bm.table] || '/index-new.html';
    });

    card.querySelector('.jc-bookmark').addEventListener('click', (e) => {
        e.stopPropagation();
        removeBookmark(bm.id, bm.table);
        updateTabCounts();
        renderContent();
        showToast('Removed from saved', 'info');
    });

    card.addEventListener('click', () => showJobDetail(bm, { type: 'saved', savedAt: bm.savedAt, table: bm.table }));
    return card;
}

// ── Filter helpers ──
function getFilteredApplied() {
    let apps = allApplications;
    if (activePortalFilter !== 'all') {
        apps = apps.filter(app => {
            if (activePortalFilter === 'Fresher Jobs') return app.job_table === 'Fresher Jobs' && app.job?.Experience !== 'Experienced';
            return app.job_table === activePortalFilter;
        });
    }
    if (searchTerm) {
        const q = searchTerm.toLowerCase();
        apps = apps.filter(a => (a.job.Company || '').toLowerCase().includes(q) || (a.job.Location || '').toLowerCase().includes(q));
    }
    return apps;
}

function getFilteredSaved() {
    if (!searchTerm) return bookmarks;
    const q = searchTerm.toLowerCase();
    return bookmarks.filter(b => (b.Company || '').toLowerCase().includes(q) || (b.Location || '').toLowerCase().includes(q));
}

// ── Render content ──
function renderContent() {
    const content = document.getElementById('histContent');
    if (!content) return;
    content.innerHTML = '';

    const items = activeTab === 'applied' ? getFilteredApplied() : getFilteredSaved();

    if (items.length === 0) {
        const isEmpty = activeTab === 'applied' ? allApplications.length === 0 : bookmarks.length === 0;
        content.innerHTML = `
            <div class="empty-state-new">
                <div class="esn-icon">${activeTab === 'applied' ? '📋' : '🔖'}</div>
                <div class="esn-title">${activeTab === 'applied'
                    ? (isEmpty ? "No applications yet" : "No results found")
                    : (isEmpty ? "No saved jobs" : "No results found")}</div>
                <div class="esn-sub">${activeTab === 'applied'
                    ? (isEmpty ? "Apply to jobs and they'll show up here." : "Try a different search or filter.")
                    : (isEmpty ? "Tap the bookmark icon on any job to save it." : "Try a different search term.")}</div>
                ${activeTab === 'applied' && isEmpty ? '<a href="/index-new.html" class="btn btn-primary" style="margin-top:1.25rem;display:inline-flex;">Browse Jobs</a>' : ''}
            </div>`;
        return;
    }

    items.forEach(item => content.appendChild(
        activeTab === 'applied' ? renderAppliedCard(item) : renderSavedCard(item)
    ));
}

// ── Portal chips ──
function renderPortalChips() {
    const wrap = document.getElementById('portalChips');
    if (!wrap) return;
    const chips = [
        { id: 'all', label: 'All' },
        { id: 'Industrial Training Job Portal', label: 'Industrial' },
        { id: 'Articleship Jobs', label: 'Articleship' },
        { id: 'Fresher Jobs', label: 'CA Fresher' },
        { id: 'Semi Qualified Jobs', label: 'Semi Qualified' },
    ];
    wrap.innerHTML = chips.map(c =>
        `<button class="portal-chip${c.id === activePortalFilter ? ' active' : ''}" data-id="${c.id}">${c.label}</button>`
    ).join('');
    wrap.querySelectorAll('.portal-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            activePortalFilter = btn.dataset.id;
            wrap.querySelectorAll('.portal-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderContent();
        });
    });
}

// ── Tab counts ──
function updateTabCounts() {
    const ac = document.getElementById('appliedCount');
    const sc = document.getElementById('savedCount');
    if (ac) ac.textContent = allApplications.length;
    if (sc) sc.textContent = bookmarks.length;
}

// ── Bottom sheet ──
function showJobDetail(job, meta) {
    const content = document.getElementById('jobDetailContent');
    if (!content) return;

    const colors = getAvatarColors(job.Company || '');
    const initials = getInitials(job.Company || '');
    const isApplied = meta?.type === 'applied';

    const generateLinks = (appId) => {
        if (!appId || appId === '#') return `<p style="color:var(--sub);font-size:0.85rem;">No application link available.</p>`;
        return appId.split(',').map(link => link.trim()).filter(Boolean).map(link => `
            <div class="hist-link-row">
                <span class="hist-link-text">${link}</span>
                <button class="hist-copy-btn" data-copy="${link.replace(/"/g, '&quot;')}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>
            </div>`).join('');
    };

    const portalLabel = meta?.jobTable ? (PORTAL_LABELS[meta.jobTable] || meta.jobTable) : (PORTAL_LABELS[meta?.table] || '');

    content.innerHTML = `
        <div class="jd-topbar">
            <button class="jd-back-btn" id="jdBackBtn">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m6-6-6 6 6 6"/></svg>
            </button>
            <span class="jd-topbar-title">${isApplied ? 'Application Details' : 'Saved Job'}</span>
            <div style="width:36px"></div>
        </div>
        <div class="jd-body">
            <div class="jd-hero-card">
                <div class="jd-hero-top">
                    <div class="jd-hero-avatar" style="background:${colors.bg};color:${colors.fg}">${initials}</div>
                    <div class="jd-hero-info">
                        <div class="jd-hero-company">${job.Company || ''}</div>
                        <div class="jd-hero-location">${job.Location || ''}</div>
                    </div>
                </div>
                ${job.Category ? `<div class="jd-hero-category">${job.Category}</div>` : ''}
                <div class="jd-stats-grid">
                    ${isApplied ? `<div class="jd-stat"><span class="jd-stat-label">Applied</span><span class="jd-stat-value">${meta.appliedAt ? getDaysAgo(meta.appliedAt) : 'N/A'}</span></div>` : ''}
                    ${job.Salary ? `<div class="jd-stat"><span class="jd-stat-label">Stipend/Salary</span><span class="jd-stat-value">₹${job.Salary}</span></div>` : ''}
                    ${portalLabel ? `<div class="jd-stat"><span class="jd-stat-label">Portal</span><span class="jd-stat-value">${portalLabel}</span></div>` : ''}
                </div>
            </div>

            ${isApplied ? `
            <div class="jd-section">
                <h3 class="jd-section-title">Application Link</h3>
                ${generateLinks(job['Application ID'])}
            </div>` : `
            <div class="jd-apply-section">
                <a href="${PORTAL_URLS[meta?.table] || '/index-new.html'}" class="jd-btn-primary" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;">Apply Now →</a>
            </div>`}

            <div class="jd-section">
                <h3 class="jd-section-title">Job Description</h3>
                <div class="jd-description">${renderMarkdown(job.Description)}</div>
            </div>
        </div>`;

    content.querySelectorAll('.hist-copy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(btn.dataset.copy).then(() => {
                btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>';
                setTimeout(() => {
                    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
                }, 2000);
            }).catch(() => showToast('Could not copy', 'error'));
        });
    });

    document.getElementById('jdBackBtn')?.addEventListener('click', hideJobDetail);

    const overlay = document.getElementById('jobDetailOverlay');
    const sheet = document.getElementById('jobDetailSheet');
    overlay?.classList.add('show');
    sheet?.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function hideJobDetail() {
    document.getElementById('jobDetailOverlay')?.classList.remove('show');
    document.getElementById('jobDetailSheet')?.classList.remove('open');
    document.body.style.overflow = '';
}

// ── Event listeners ──
function setupEventListeners() {
    // Theme toggle
    document.getElementById('themeToggleBtn')?.addEventListener('click', () => {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const next = isDark ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('msc-theme', next);
    });

    // Menu
    document.getElementById('menuButton')?.addEventListener('click', () => document.getElementById('expandedMenu')?.classList.add('active'));
    document.getElementById('menuCloseBtn')?.addEventListener('click', () => document.getElementById('expandedMenu')?.classList.remove('active'));

    // Logout button in side menu
    document.getElementById('logoutMenuBtn')?.addEventListener('click', async () => {
        await supabaseClient.auth.signOut();
        localStorage.clear();
        window.location.href = '/login.html';
    });

    // Resources dropdown
    document.getElementById('resourcesDropdownBtn')?.addEventListener('click', () => {
        const dd = document.getElementById('resourcesDropdown');
        const icon = document.querySelector('#resourcesDropdownBtn .dropdown-icon');
        dd?.classList.toggle('active');
        icon?.classList.toggle('open');
    });

    // Notifications popup
    document.getElementById('notificationsBtn')?.addEventListener('click', () => {
        const p = document.getElementById('notificationPopup');
        if (p) p.style.display = p.style.display === 'flex' ? 'none' : 'flex';
    });
    document.getElementById('closeNotificationPopup')?.addEventListener('click', () => {
        document.getElementById('notificationPopup').style.display = 'none';
    });

    // Tabs
    document.querySelectorAll('.hist-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTab = btn.dataset.tab;
            document.querySelectorAll('.hist-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const chipsWrap = document.getElementById('portalChipsWrap');
            if (chipsWrap) chipsWrap.style.display = activeTab === 'applied' ? '' : 'none';
            searchTerm = '';
            const si = document.getElementById('searchInput');
            if (si) si.value = '';
            renderContent();
        });
    });

    // Search
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        renderContent();
    });

    // Bottom sheet close
    document.getElementById('jobDetailOverlay')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('jobDetailOverlay')) hideJobDetail();
    });
}

// ── Init ──
async function initializePage() {
    applyTheme();

    const auth = await checkAuth();
    if (!auth) return;

    bookmarks = getBookmarks();

    const loader = document.getElementById('loader');
    if (loader) loader.style.display = 'flex';

    allApplications = await fetchApplications();

    if (loader) loader.style.display = 'none';

    updateTabCounts();
    renderPortalChips();
    renderContent();
    setupEventListeners();
}

document.addEventListener('DOMContentLoaded', initializePage);
