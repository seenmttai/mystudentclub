import { getDaysAgo } from './date-utils.js';

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
const experienceFilter = document.getElementById('experienceFilter');

const notificationsBtn = document.getElementById('notificationsBtn');
const notificationPopup = document.getElementById('notificationPopup');
const closeNotificationPopup = document.getElementById('closeNotificationPopup');
const notificationStatusEl = document.getElementById('notificationStatus');
const notificationBadge = document.getElementById('notificationBadge');
const topicAllCheckbox = document.getElementById('topic-all');
const topicSelectionArea = document.getElementById('topic-selection-area');
const permissionStatusDiv = document.getElementById('notification-permission-status');
const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
const subscribedTopicsListEl = document.getElementById('subscribedTopicsList');
const locationSelectEl = document.getElementById('locationSelect');
const jobTypeSelectEl = document.getElementById('jobTypeSelect');
const subscribeBtnEl = document.getElementById('subscribeBtn');
const specificSubscriptionForm = document.getElementById('specific-subscription-form');

let isFetching = false;
let page = 0;
const limit = 15;
let debounceTimeout = null;
let hasMoreData = true;
let currentTable = 'Industrial Training Job Portal';
let currentSession = null;
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
const LOCATIONS_NOTIF = [
  "mumbai", "bangalore", "gurgaon", "pune", "kolkata",
  "delhi", "noida", "bengaluru", "hyderabad", "ahmedabad",
  "chennai", "gurugram", "jaipur", "new delhi"
];
const SYNC_TIMESTAMP_KEY = 'notificationSyncTimestamp';
const SUBSCRIBED_TOPICS_KEY = 'subscribedTopics';

if (window.location.pathname.includes('articleship')) {
  currentTable = 'Articleship Jobs';
} else if (window.location.pathname.includes('semi-qualified')) {
  currentTable = 'Semi Qualified Jobs';
} else if (window.location.pathname.includes('fresher')) {
  currentTable = 'Fresher Jobs';
}

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
        </div>`;
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
        </div>`;
    modalOverlay.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const peerConnectBtn = document.getElementById('peerConnectBtn');
    peerConnectBtn.style.pointerEvents = 'none';
    peerConnectBtn.style.opacity = '0.5';

    try {
        const { data, error } = await supabaseClient.from(currentTable).select('connect_link').eq('id', job.id).single();
        if (error && error.code !== 'PGRST116') throw error;

        let peerConnectLink;
        if (data && data.connect_link && isValidUrl(data.connect_link)) {
            peerConnectLink = data.connect_link;
        } else {
            const keywords = `"Industrial Trainee" AND "${job.Company}"`;
            peerConnectLink = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(keywords)}&origin=FACETED_SEARCH`;
        }
        peerConnectBtn.href = peerConnectLink;
    } catch (error) {
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
        let query = supabaseClient.from(currentTable).select('id, Company, Location, Salary, Description, Created_At, Category, "Application ID"');
        const searchTerm = searchInput.value.trim();
        if (searchTerm) query = query.or(`Company.ilike.%${searchTerm}%,Location.ilike.%${searchTerm}%,Description.ilike.%${searchTerm}%,Category.ilike.%${searchTerm}%`);
        const locationSearch = locationSearchInput.value.trim();
        if (locationSearch) query = query.ilike('Location', `%${locationSearch}%`);
        const salary = salaryFilter.value;
        if (salary) {
            if (salary.endsWith('+')) query = query.gte('Salary', parseInt(salary));
            else if (salary.includes('-')) {
                const [min, max] = salary.split('-').map(Number);
                query = query.gte('Salary', min).lte('Salary', max);
            }
        }
        const category = categoryFilter.value;
        if (category) query = query.ilike('Category', `%${category}%`);
        const experienceFilter = document.getElementById('experienceFilter');
        if (experienceFilter && (currentTable === "Fresher Jobs" || currentTable === "Semi Qualified Jobs")) {
            const experience = experienceFilter.value;
            if (experience) {
                query = query.eq('Experience', experience);
            }
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
    if (table === "Industrial Training Job Portal") options = [{ value: '', text: 'Any Stipend' }, { value: '10000-20000', text: '₹10k - ₹20k' }, { value: '20000-40000', text: '₹20k - ₹40k' }, { value: '40000+', text: '₹40k+' }];
    else if (table === "Articleship Jobs") options = [{ value: '', text: 'Any Stipend' }, { value: '0-5000', text: 'Below ₹5k' }, { value: '5000-10000', text: '₹5k - ₹10k' }, { value: '10000-15000', text: '₹10k - ₹15k' }, { value: '15000+', text: '₹15k+' }];
    else if (table === "Semi Qualified Jobs") options = [{ value: '', text: 'Any Salary' }, { value: '0-25000', text: 'Below ₹25k' }, { value: '25000-35000', text: '₹25k - ₹35k' }, { value: '35000-50000', text: '₹35k - ₹50k' }, { value: '50000+', text: 'Above ₹50k' }];
    else if (table === "Fresher Jobs") options = [{ value: '', text: 'Any Salary' }, { value: '0-12', text: '< 12 LPA' }, { value: '12-18', text: '12-18 LPA' }, { value: '18+', text: '> 18 LPA' }];
    options.forEach(opt => { let o = document.createElement('option'); o.value = opt.value; o.textContent = opt.text; salaryFilter.appendChild(o); });
}

async function fetchCategories() {
    categoryFilter.innerHTML = `<option value="">All Categories</option>`;
    let categories = [];
    if (currentTable === "Industrial Training Job Portal" || currentTable === "Articleship Jobs") categories = ["Accounting", "Auditing", "Finance", "Taxation", "Costing", "Consultancy"];
    else if (currentTable === "Fresher Jobs" || currentTable === "Semi Qualified Jobs") categories = ["Accounting", "Audit", "Consultancy", "Controllership", "Direct Taxation", "Equity Research", "Finance", "Investment Banking", "Private Equity", "Indirect Taxation", "Internal Audit", "Statutory Audit"];
    categories.sort().forEach(category => { const option = document.createElement('option'); option.value = category; option.textContent = category; categoryFilter.appendChild(option); });
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
        authButtonsContainer.innerHTML = `<div class="user-profile-container"><div class="user-icon-wrapper"><div class="user-icon" data-email="${email}">${initial}</div><div class="user-hover-card"><div class="user-hover-content"><p class="user-email">${email}</p><button onclick="handleLogout()" class="logout-btn">Logout</button></div></div></div></div>`;
    } else {
        authButtonsContainer.innerHTML = `<a href="/login.html" class="icon-button" aria-label="Login"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></a>`;
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
            let currentType = currentTable === "Semi Qualified Jobs" ? "Semi-Qualified" : currentTable === "Fresher Jobs" ? "Freshers" : currentTable.split(' ')[0];
            return banner.Type === 'All' || banner.Type === currentType;
        });
        if (relevantBanners.length === 0) { bannerSection.style.display = 'none'; return; }
        bannerSection.style.display = 'block';
        relevantBanners.forEach((banner, i) => {
            const a = document.createElement('a'); a.href = banner.Hyperlink; a.className = `carousel-item ${i === 0 ? 'active' : ''}`; a.target = "_blank";
            const img = document.createElement('img'); img.src = banner.Image; img.alt = `Banner`; a.appendChild(img); carousel.appendChild(a);
        });
        const slides = document.querySelectorAll('.carousel-item');
        if (slides.length > 0) {
            let currentSlide = 0;
            const showSlide = (idx) => { slides.forEach(s => s.classList.remove('active')); slides[idx].classList.add('active'); };
            showSlide(currentSlide);
            setInterval(() => { currentSlide = (currentSlide + 1) % slides.length; showSlide(currentSlide); }, 5000);
        }
    } catch (e) { bannerSection.style.display = 'none'; }
}

function showNotifStatus(message, type = 'info') {
    if (!notificationStatusEl) return;
    notificationStatusEl.textContent = message;
    notificationStatusEl.className = `notification-status status-${type}`;
    notificationStatusEl.style.display = 'block';
    if (type !== 'error') setTimeout(() => { notificationStatusEl.style.display = 'none'; }, 3000);
}

function getSubscribedTopics() { return JSON.parse(localStorage.getItem(SUBSCRIBED_TOPICS_KEY) || '[]'); }
function saveSubscribedTopics(topics) { localStorage.setItem(SUBSCRIBED_TOPICS_KEY, JSON.stringify(topics)); updateNotificationBadge(); }
function updateNotificationBadge() { if (notificationBadge) notificationBadge.style.visibility = getSubscribedTopics().length > 0 ? 'visible' : 'hidden'; }

function formatTopicForDisplay(topicName) {
    if (topicName === 'all') return { location: 'All', jobType: 'Notifications' };
    const parts = topicName.split('-');
    if (parts.length < 2) return { location: topicName, jobType: '' };
    const jobTypeVal = parts.pop();
    const location = parts.join('-');
    const displayLocation = location.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const jobTypeObj = JOB_TYPES_NOTIF.find(type => type.value === jobTypeVal);
    const displayJobType = jobTypeObj ? jobTypeObj.label : jobTypeVal.charAt(0).toUpperCase() + jobTypeVal.slice(1);
    return { location: displayLocation, jobType: displayJobType };
}

function renderSubscribedTopics() {
    if (!subscribedTopicsListEl) return;
    subscribedTopicsListEl.innerHTML = '';
    const topics = getSubscribedTopics();
    if (topics.length === 0) {
        subscribedTopicsListEl.innerHTML = '<p class="no-subscriptions">No active subscriptions.</p>';
    } else {
        topics.forEach(topic => {
            const { location, jobType } = formatTopicForDisplay(topic);
            const topicTag = document.createElement('div');
            topicTag.className = 'topic-tag';
            topicTag.innerHTML = `<span>${location}${jobType ? ` - ${jobType}`: ''}</span><button class="topic-remove" data-topic="${topic}">×</button>`;
            subscribedTopicsListEl.appendChild(topicTag);
        });
        subscribedTopicsListEl.querySelectorAll('.topic-remove').forEach(button => {
            button.addEventListener('click', async (e) => {
                e.stopPropagation();
                const topic = button.dataset.topic;
                if (await unsubscribeFromTopic(topic) && topic === 'all' && topicAllCheckbox) {
                    topicAllCheckbox.checked = false;
                    updateSpecificTopicAreaVisibility();
                }
            });
        });
    }
    if (topicAllCheckbox) topicAllCheckbox.checked = topics.includes('all');
    updateSpecificTopicAreaVisibility();
}

function updateSpecificTopicAreaVisibility() {
    if (!topicAllCheckbox || !specificSubscriptionForm) return;
    specificSubscriptionForm.style.display = topicAllCheckbox.checked ? 'none' : 'block';
}

async function manageTopicSubscription(topic, action) {
    if (!currentFcmToken) { showNotifStatus('Cannot manage subscription: Notification token not available.', 'error'); return false; }
    try {
        showNotifStatus(`${action === 'subscribe' ? 'Subscribing to' : 'Unsubscribing from'} ${topic}...`, 'info');
        const response = await fetch('https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: currentFcmToken, topic: topic, action: action })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || `Failed to ${action} ${topic}`);
        let topics = getSubscribedTopics();
        if (action === 'subscribe' && !topics.includes(topic)) topics.push(topic);
        else if (action === 'unsubscribe') topics = topics.filter(t => t !== topic);
        saveSubscribedTopics(topics);
        showNotifStatus(`Successfully ${action}d ${topic}`, 'success');
        renderSubscribedTopics();
        return true;
    } catch (err) {
        showNotifStatus(`Failed to ${action}: ${err.message}`, 'error');
        return false;
    }
}
async function subscribeToTopic(topic) { return manageTopicSubscription(topic, 'subscribe'); }
async function unsubscribeFromTopic(topic) { return manageTopicSubscription(topic, 'unsubscribe'); }

function updatePermissionStatusUI() {
    if (!permissionStatusDiv || !enableNotificationsBtn || !topicSelectionArea) return;
    const permission = Notification.permission;
    enableNotificationsBtn.style.display = permission === 'default' ? 'block' : 'none';
    topicSelectionArea.style.display = permission === 'granted' ? 'block' : 'none';
    if (permission === 'granted') {
        permissionStatusDiv.textContent = 'Notifications are enabled.';
        permissionStatusDiv.className = 'notification-status status-success';
    } else if (permission === 'denied') {
        permissionStatusDiv.textContent = 'Notifications are blocked. Please enable them in browser settings.';
        permissionStatusDiv.className = 'notification-status status-error';
    } else {
        permissionStatusDiv.textContent = 'Enable notifications for job alerts.';
        permissionStatusDiv.className = 'notification-status status-info';
    }
    permissionStatusDiv.style.display = 'block';
}

function populateNotificationDropdowns() {
    if (locationSelectEl) {
        locationSelectEl.innerHTML = '<option value="" disabled selected>Select Location</option>';
        LOCATIONS_NOTIF.forEach(loc => { const opt = document.createElement('option'); opt.value = loc; opt.textContent = loc.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); locationSelectEl.appendChild(opt); });
    }
    if (jobTypeSelectEl) {
        jobTypeSelectEl.innerHTML = '<option value="" disabled selected>Select Job Type</option>';
        JOB_TYPES_NOTIF.forEach(type => { const opt = document.createElement('option'); opt.value = type.value; opt.textContent = type.label; jobTypeSelectEl.appendChild(opt); });
    }
}

async function initializeFCM() {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(FIREBASE_CONFIG);
        }
        firebaseMessaging = firebase.messaging();
        firebaseMessaging.onMessage((payload) => {
            const notif = payload.notification || {};
            new Notification(notif.title, { body: notif.body, icon: notif.icon || '/assets/icon-70x70.png' });
        });
        if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        if (Notification.permission === 'granted') await requestTokenAndSyncSubscriptions();
    } catch(err) { console.error("Error initializing Firebase Messaging:", err); }
}

async function requestTokenAndSyncSubscriptions() {
    if (!firebaseMessaging) return;
    try {
        const token = await firebaseMessaging.getToken({ vapidKey: VAPID_KEY });
        if (token) {
            currentFcmToken = token;
            await syncNotificationTopics();
        }
    } catch (err) { console.error('An error occurred while retrieving token.', err); }
}

function shouldSyncNotifications() {
    const lastSync = localStorage.getItem(SYNC_TIMESTAMP_KEY);
    if (!lastSync) return true;
    return new Date(parseInt(lastSync)).toDateString() !== new Date().toDateString();
}
function markSyncComplete() { localStorage.setItem(SYNC_TIMESTAMP_KEY, Date.now().toString()); }

async function syncNotificationTopics() {
    if (!currentFcmToken || !shouldSyncNotifications()) return;
    try {
        showNotifStatus("Syncing notification preferences...", "info");
        const savedTopics = getSubscribedTopics();
        const results = await Promise.all(savedTopics.map(topic => manageTopicSubscription(topic, 'subscribe')));
        const failedTopics = results.filter(success => !success).length;
        if (failedTopics > 0) showNotifStatus(`Sync completed with ${failedTopics} errors`, "error");
        else showNotifStatus("Notification preferences synced", "success");
        markSyncComplete();
    } catch (err) { showNotifStatus("Failed to sync preferences", "error"); }
}

function setupNotificationPopup() {
    if (!notificationsBtn || !notificationPopup || !closeNotificationPopup) return;
    populateNotificationDropdowns();
    if (enableNotificationsBtn) {
        enableNotificationsBtn.addEventListener('click', async () => {
            try {
                const permission = await Notification.requestPermission();
                updatePermissionStatusUI();
                if (permission === 'granted') {
                    showNotifStatus("Notifications enabled!", 'success');
                    await initializeFCM();
                    renderSubscribedTopics();
                } else { showNotifStatus("Permission not granted.", 'info'); }
            } catch (err) { showNotifStatus("Error enabling notifications.", 'error'); }
        });
    }
    if (topicAllCheckbox) {
        topicAllCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            if (!(await (isChecked ? subscribeToTopic('all') : unsubscribeFromTopic('all')))) e.target.checked = !isChecked;
        });
    }
    if (locationSelectEl && jobTypeSelectEl && subscribeBtnEl) {
        const updateSubBtnState = () => { subscribeBtnEl.disabled = !(locationSelectEl.value && jobTypeSelectEl.value); };
        locationSelectEl.addEventListener('change', updateSubBtnState);
        jobTypeSelectEl.addEventListener('change', updateSubBtnState);
        updateSubBtnState();
        subscribeBtnEl.addEventListener('click', async () => {
            const location = locationSelectEl.value, jobType = jobTypeSelectEl.value;
            if (!location || !jobType) { showNotifStatus("Please select location and job type", "error"); return; }
            const topicName = `${location.toLowerCase().replace(/\s+/g, '-')}-${jobType}`;
            if (getSubscribedTopics().includes(topicName)) { showNotifStatus("Already subscribed to this topic", "info"); return; }
            if (await subscribeToTopic(topicName)) { locationSelectEl.selectedIndex = 0; jobTypeSelectEl.selectedIndex = 0; subscribeBtnEl.disabled = true; }
        });
    }
}

function setupEventListeners() {
    modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
    modalCloseBtn.addEventListener('click', closeModal);
    searchInput.addEventListener('input', resetAndFetch);
    locationSearchInput.addEventListener('input', resetAndFetch);
    salaryFilter.addEventListener('change', resetAndFetch);
    categoryFilter.addEventListener('change', resetAndFetch);
    const experienceFilter = document.getElementById('experienceFilter');
    if (experienceFilter) {
        experienceFilter.addEventListener('change', resetAndFetch);
    }
    loadMoreButton.addEventListener('click', fetchJobs);
    menuButton.addEventListener('click', () => expandedMenu.classList.add('active'));
    menuCloseBtn.addEventListener('click', () => expandedMenu.classList.remove('active'));
    document.addEventListener('click', (e) => {
        if (expandedMenu.classList.contains('active') && !expandedMenu.contains(e.target) && !menuButton.contains(e.target)) {
            expandedMenu.classList.remove('active');
        }
        if (notificationPopup.style.display === 'flex' && !notificationPopup.contains(e.target) && !notificationsBtn.contains(e.target)) {
            notificationPopup.style.display = 'none';
        }
    });
    const resourcesBtn = document.getElementById('resourcesDropdownBtn');
    const resourcesDropdown = document.getElementById('resourcesDropdown');
    if (resourcesBtn && resourcesDropdown) {
        const dropdownIcon = resourcesBtn.querySelector('.dropdown-icon');
        resourcesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resourcesDropdown.classList.toggle('active');
            if(dropdownIcon) dropdownIcon.classList.toggle('open');
        });
    }
    notificationsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notificationPopup.style.display = notificationPopup.style.display === 'flex' ? 'none' : 'flex';
        if (notificationPopup.style.display === 'flex') {
            updatePermissionStatusUI();
            if (Notification.permission === 'granted') {
                if (!firebaseMessaging || !currentFcmToken) initializeFCM().then(() => renderSubscribedTopics());
                else renderSubscribedTopics();
            } else { renderSubscribedTopics(); if(topicSelectionArea) topicSelectionArea.style.display = 'none'; }
        }
    });
    closeNotificationPopup.addEventListener('click', () => { notificationPopup.style.display = 'none'; });
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
    if (Notification.permission === 'granted') {
        initializeFCM().then(() => updateNotificationBadge());
    } else {
        updateNotificationBadge();
    }
});