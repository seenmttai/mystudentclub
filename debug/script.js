import { getDaysAgo } from '../scripts/date-utils.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);

const jobsContainer = document.getElementById('jobs');
const loader = document.getElementById('loader');
const modalOverlay = document.getElementById('modal');
const modalBody = document.getElementById('modal-body-content');
const modalCloseBtn = document.getElementById('modalCloseBtn');
const searchInput = document.getElementById('searchInput');
const locationSearchInput = document.getElementById('locationSearchInput');
const salaryFilter = document.getElementById('salaryFilter');
const categoryFilter = document.getElementById('categoryFilter');
const loadMoreButton = document.getElementById('loadMore');
const siteFooterNav = document.querySelector('.site-footer-nav');
const menuButton = document.getElementById('menuButton');
const expandedMenu = document.getElementById('expandedMenu');
const menuCloseBtn = document.getElementById('menuCloseBtn');
const authButtonsContainer = document.querySelector('.auth-buttons-container');
const notificationsBtn = document.getElementById('notificationsBtn');
const notificationPopup = document.getElementById('notificationPopup');
const closeNotificationPopup = document.getElementById('closeNotificationPopup');
const notificationStatus = document.getElementById('notificationStatus');
const notificationBadge = document.getElementById('notificationBadge');
const topicAllCheckbox = document.getElementById('topic-all');
const topicSelectionArea = document.getElementById('topic-selection-area');
const permissionStatusDiv = document.getElementById('notification-permission-status');
const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
const subscribedTopicsList = document.getElementById('subscribedTopicsList');
const locationSelect = document.getElementById('locationSelect');
const jobTypeSelect = document.getElementById('jobTypeSelect');
const subscribeBtn = document.getElementById('subscribeBtn');
const specificSubscriptionForm = document.getElementById('specific-subscription-form');

let isFetching = false;
let page = 0;
const limit = 15;
let debounceTimeout = null;
let hasMoreData = true;
let currentTable = 'Industrial Training Job Portal';
let currentSession = null;

const firebaseConfig = {
  apiKey: "AIzaSyBTIXRJbaZy_3ulG0C8zSI_irZI7Ht2Y-8",
  authDomain: "msc-notif.firebaseapp.com",
  projectId: "msc-notif",
  storageBucket: "msc-notif.appspot.com",
  messagingSenderId: "228639798414",
  appId: "1:228639798414:web:b8b3c96b15da5b770a45df",
  measurementId: "G-X4M23TB936"
};
const VAPID_KEY = "BGlNz4fQGzftJPr2U860MsoIo0dgNcqb2y2jAEbwJzjmj8CbDwJy_kD4eRAcruV6kNRs6Kz-mh9rdC37tVgeI5I";
const JOB_TYPES = [
  { value: "industrial", label: "Industrial Training" },
  { value: "semi", label: "Semi Qualified" },
  { value: "fresher", label: "Fresher" }
];
const LOCATIONS = [
  "mumbai", "bangalore", "gurgaon", "pune", "kolkata",
  "delhi", "noida", "bengaluru", "hyderabad", "ahmedabad",
  "chennai", "gurugram", "jaipur", "new delhi"
];
const SUBSCRIBED_TOPICS_KEY = 'subscribedTopics';
let messaging;
let fcmToken = null;

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
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    ${job.Location || 'N/A'}
                </span>
                ${job.Salary ? `<span class="job-tag"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>₹${job.Salary}</span>` : ''}
                ${job.Category ? `<span class="job-tag">${job.Category}</span>` : ''}
            </div>
        </div>
    `;
    return jobCard;
}

async function showModal(job) {
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
            <h3><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>Job Description</h3>
            <p class="modal-description">${job.Description || 'No description available.'}</p>
        </div>
        <div class="modal-actions">
            <a href="${getApplicationLink(job['Application ID'])}" class="btn btn-primary" ${isValidUrl(job['Application ID']) ? 'target="_blank"' : ''}>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                Apply Now
            </a>
            <a id="peerConnectBtn" href="#" class="btn btn-secondary" target="_blank">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
                <span>Connect to Peer</span>
            </a>
        </div>
    `;
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const peerConnectBtn = document.getElementById('peerConnectBtn');
    peerConnectBtn.style.pointerEvents = 'none';
    peerConnectBtn.style.opacity = '0.5';

    try {
        const { data, error } = await supabaseClient
            .from(currentTable)
            .select('connect_link')
            .eq('id', job.id)
            .single();

        if (error) throw error;

        let peerConnectLink;
        if (data && data.connect_link && isValidUrl(data.connect_link)) {
            peerConnectLink = data.connect_link;
        } else {
            const keywords = `"Industrial Trainee" AND "${job.Company}"`;
            peerConnectLink = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}&origin=FACETED_SEARCH`;
        }
        peerConnectBtn.href = peerConnectLink;
    } catch (error) {
        console.error("Failed to fetch connect_link:", error);
        const keywords = `"Industrial Trainee" AND "${job.Company}"`;
        peerConnectBtn.href = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}&origin=FACETED_SEARCH`;
    } finally {
        peerConnectBtn.style.pointerEvents = 'auto';
        peerConnectBtn.style.opacity = '1';
    }
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
        let query = supabaseClient
            .from(currentTable)
            .select('id, Company, Location, Salary, Description, Created_At, Category, "Application ID"');

        const searchTerm = searchInput.value.trim();
        if (searchTerm) {
            query = query.or(`Company.ilike.%${searchTerm}%,Location.ilike.%${searchTerm}%,Description.ilike.%${searchTerm}%,Category.ilike.%${searchTerm}%`);
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
            if (page === 0) jobsContainer.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 2rem 0;">No jobs found matching your criteria.</p>';
        }
    } catch (error) {
        console.error('Error fetching jobs:', error);
        jobsContainer.innerHTML = '<p style="text-align:center; color: red; padding: 2rem 0;">Failed to load jobs. Please try again.</p>';
    } finally {
        isFetching = false;
        loader.style.display = 'none';
    }
}

function resetAndFetch() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        page = 0;
        jobsContainer.innerHTML = '';
        hasMoreData = true;
        fetchJobs();
    }, 350);
}

function populateSalaryFilter(table) {
    salaryFilter.innerHTML = '';
    let options = [];
    if (table === "Industrial Training Job Portal") {
        options = [{ value: '', text: 'Any Stipend' }, { value: '10000-20000', text: '₹10k - ₹20k' }, { value: '20000-40000', text: '₹20k - ₹40k' }, { value: '40000+', text: '₹40k+' }];
    } else if (table === "Articleship Jobs") {
        options = [{ value: '', text: 'Any Stipend' }, { value: '0-5000', text: 'Below ₹5k' }, { value: '5000-10000', text: '₹5k - ₹10k' }, { value: '10000-15000', text: '₹10k - ₹15k' }, { value: '15000+', text: '₹15k+' }];
    } else if (table === "Semi Qualified Jobs") {
        options = [{ value: '', text: 'Any Salary' }, { value: '0-25000', text: 'Below ₹25k' }, { value: '25000-35000', text: '₹25k - ₹35k' }, { value: '35000-50000', text: '₹35k - ₹50k' }, { value: '50000+', text: 'Above ₹50k' }];
    } else if (table === "Fresher Jobs") {
        options = [{ value: '', text: 'Any Salary' }, { value: '0-12', text: '< 12 LPA' }, { value: '12-18', text: '12-18 LPA' }, { value: '18+', text: '> 18 LPA' }];
    }
    options.forEach(opt => {
        let o = document.createElement('option');
        o.value = opt.value; o.textContent = opt.text;
        salaryFilter.appendChild(o);
    });
}

async function fetchCategories() {
    categoryFilter.innerHTML = `<option value="">All Categories</option>`;
    let categories = [];
    if (currentTable === "Industrial Training Job Portal" || currentTable === "Articleship Jobs") {
        categories = ["Accounting", "Auditing", "Finance", "Taxation", "Costing", "Consultancy"];
    } else if (currentTable === "Fresher Jobs" || currentTable === "Semi Qualified Jobs") {
        categories = ["Accounting", "Audit", "Consultancy", "Controllership", "Direct Taxation", "Equity Research", "Finance", "Investment Banking", "Private Equity", "Indirect Taxation", "Internal Audit", "Statutory Audit"];
    }
    categories.sort().forEach(category => {
        const option = document.createElement('option');
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    });
}

function setupFooterNav() {
    const navItems = [
        { name: 'Industrial Training', table: 'Industrial Training Job Portal', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>' },
        { name: 'Articleship', table: 'Articleship Jobs', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>' },
        { name: 'Semi Qualified', table: 'Semi Qualified Jobs', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>' },
        { name: 'Freshers', table: 'Fresher Jobs', icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>' }
    ];

    siteFooterNav.innerHTML = navItems.map(item => `
        <button class="footer-tab ${item.table === currentTable ? 'active' : ''}" data-table="${item.table}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">${item.icon}</svg>
            <span>${item.name}</span>
        </button>
    `).join('');

    siteFooterNav.querySelectorAll('.footer-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            currentTable = tab.dataset.table;
            siteFooterNav.querySelectorAll('.footer-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            populateSalaryFilter(currentTable);
            fetchCategories();
            resetAndFetch();
            loadBanners();
        });
    });
}

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;
    return session;
}

function updateHeaderAuth(session) {
    if (!authButtonsContainer) return;
    if (session) {
        let email = session.user.email || 'User';
        let initial = email.charAt(0).toUpperCase();
        authButtonsContainer.innerHTML = `
            <div class="user-profile-container">
                <div class="user-icon-wrapper">
                    <div class="user-icon" data-email="${email}">${initial}</div>
                    <div class="user-hover-card">
                        <div class="user-hover-content">
                            <p class="user-email">${email}</p>
                            <button onclick="handleLogout()" class="logout-btn">Logout</button>
                        </div>
                    </div>
                </div>
            </div>`;
        const userIconWrapper = authButtonsContainer.querySelector('.user-icon-wrapper');
        userIconWrapper.addEventListener('click', (e) => {
            e.stopPropagation();
            userIconWrapper.querySelector('.user-hover-card').classList.toggle('active');
        });
    } else {
        authButtonsContainer.innerHTML = `
            <a href="../login.html" class="icon-button" aria-label="Login">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
            </a>`;
    }
}

window.handleLogout = async () => {
    await supabaseClient.auth.signOut();
    currentSession = null;
    updateHeaderAuth(null);
}

async function loadBanners() {
    const carousel = document.querySelector('.carousel');
    const bannerSection = document.querySelector('.banner-section');
    if (!carousel || !bannerSection) return;

    try {
        const { data: banners, error } = await supabaseClient.from('Banners').select('Image, Hyperlink, Type');
        if (error) throw error;

        carousel.innerHTML = '';

        const relevantBanners = banners.filter(banner => {
            let currentType = currentTable === "Semi Qualified Jobs" ? "Semi-Qualified" :
                              currentTable === "Fresher Jobs" ? "Freshers" :
                              currentTable.split(' ')[0];
            return banner.Type === 'All' || banner.Type === currentType;
        });

        if (relevantBanners.length === 0) {
            bannerSection.style.display = 'none';
            return;
        }
        
        bannerSection.style.display = 'block';
        relevantBanners.forEach((banner) => {
            const a = document.createElement('a');
            a.href = banner.Hyperlink;
            a.target = "_blank";
            const img = document.createElement('img');
            img.src = banner.Image;
            img.alt = `Banner`;
            a.appendChild(img);
            carousel.appendChild(a);
        });
    } catch (e) { console.error("Error loading banners", e); }
}

function setupNotificationPopup() {
    populateLocationDropdown();
    populateJobTypeDropdown();
    enableNotificationsBtn.addEventListener('click', async () => {
        try {
            const permission = await Notification.requestPermission();
            updatePermissionStatusUI();
            if (permission === 'granted') {
                await initializeFCM();
            }
        } catch (err) {
            console.error("Error requesting notification permission:", err);
        }
    });
}

function populateLocationDropdown() {
     if (!locationSelect) return;
     locationSelect.innerHTML = '<option value="" disabled selected>Select Location</option>';
     LOCATIONS.forEach(location => {
       const option = document.createElement('option');
       option.value = location;
       option.textContent = location.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
       locationSelect.appendChild(option);
     });
}

function populateJobTypeDropdown() {
     if (!jobTypeSelect) return;
     jobTypeSelect.innerHTML = '<option value="" disabled selected>Select Job Type</option>';
     JOB_TYPES.forEach(type => {
       const option = document.createElement('option');
       option.value = type.value;
       option.textContent = type.label;
       jobTypeSelect.appendChild(option);
     });
}

function updatePermissionStatusUI() {
    if (!permissionStatusDiv || !enableNotificationsBtn || !topicSelectionArea) return;
    const permission = Notification.permission;
    if (permission === 'granted') {
        permissionStatusDiv.textContent = 'Notifications are enabled.';
        permissionStatusDiv.style.backgroundColor = '#dcfce7';
        permissionStatusDiv.style.color = '#15803d';
        enableNotificationsBtn.style.display = 'none';
        topicSelectionArea.style.display = 'block';
    } else if (permission === 'denied') {
        permissionStatusDiv.textContent = 'Notifications are blocked. Please enable them in your browser settings.';
        permissionStatusDiv.style.backgroundColor = '#fee2e2';
        permissionStatusDiv.style.color = '#b91c1c';
        enableNotificationsBtn.style.display = 'none';
        topicSelectionArea.style.display = 'none';
    } else {
        permissionStatusDiv.textContent = 'Enable notifications to receive job alerts.';
        permissionStatusDiv.style.backgroundColor = '#eff6ff';
        permissionStatusDiv.style.color = '#1e40af';
        enableNotificationsBtn.style.display = 'block';
        topicSelectionArea.style.display = 'none';
    }
}

async function initializeFCM() {
    try {
        const app = initializeApp(firebaseConfig);
        messaging = getMessaging(app);
        if ('serviceWorker' in navigator) {
            await navigator.serviceWorker.register('../firebase-messaging-sw.js');
        }
        if (Notification.permission === 'granted') {
            const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
            if (currentToken) {
                fcmToken = currentToken;
            }
        }
    } catch(err) {
        console.error("Error initializing Firebase for notifications:", err);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const session = await checkAuth();
    updateHeaderAuth(session);
    populateSalaryFilter(currentTable);
    fetchCategories();
    fetchJobs();
    setupEventListeners();
    setupFooterNav();
    loadBanners();
    setupNotificationPopup();
    updatePermissionStatusUI();
    if (Notification.permission === 'granted') {
        await initializeFCM();
    }
});