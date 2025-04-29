import { getDaysAgo } from './date-utils.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js';
import { getMessaging, getToken, onMessage, deleteToken } from 'https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging.js';

const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey, { global: { headers: { 'apikey': supabaseKey } } });
const jobsContainer = document.getElementById('jobs');
const loader = document.getElementById('loader');
const modal = document.getElementById('modal');
const modalContent = document.getElementById('modal-content');
const searchInput = document.getElementById('searchInput');
const locationSearchInput = document.getElementById('locationSearchInput');
const salaryFilter = document.getElementById('salaryFilter');
const categoryFilter = document.getElementById('categoryFilter');
const loadMoreButton = document.getElementById('loadMore');
let isFetching = false;
let page = 0;
const limit = 12;
let timeout = null;
let hasMoreData = true;
const menuButton = document.getElementById('menuButton');
const expandedMenu = document.getElementById('expandedMenu');
const menuCloseBtn = document.getElementById('menuCloseBtn');
let currentSlide = 0, slides = [], totalSlides = 0;

let currentTable = 'Industrial Training Job Portal';
if (window.location.pathname.includes('articleship')) {
  currentTable = 'Articleship Jobs';
} else if (window.location.pathname.includes('semi-qualified')) {
  currentTable = 'Semi Qualified Jobs';
} else if (window.location.pathname.includes('fresher')) {
  currentTable = 'Fresher Jobs';
}

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
const MANAGE_SUBSCRIPTION_FUNCTION_URL = 'https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription';

const MAX_LOCATIONS = 15;
const JOB_TYPES = ["semi", "industrial", "fresher"];

function generateTopicName(location, jobType) {
  const formattedLocation = location.toLowerCase().replace(/\s+/g, '-');
  return `${formattedLocation}-${jobType}`;
}

const STATUS_MESSAGE_DURATION = 3000;
const SUBSCRIBED_TOPIC_BG_COLOR = '#e0e7ff';

const locations = ["mumbai", "bangalore", "gurgaon", "pune", "kolkata", "delhi", "noida", "bengaluru", "hyderabad", "ahmedabad", "chennai", "gurugram", "jaipur", "new delhi"].slice(0, MAX_LOCATIONS);

const notificationPrefsBtn = document.getElementById('notificationPrefsBtn');
const notificationPopup = document.getElementById('notificationPopup');
const closeNotificationPopupBtn = document.getElementById('closeNotificationPopupBtn');
const notificationPopupStatus = document.getElementById('notificationPopupStatus');
const subscribedTopicsList = document.getElementById('subscribedTopicsList');
const popupLocationSelect = document.getElementById('popupLocationSelect');
const popupJobTypeSelect = document.getElementById('popupJobTypeSelect');
const subscribeTopicBtn = document.getElementById('subscribeTopicBtn');

let messaging;
let fcmToken = null;
let subscribedTopicsCache = [];

const LAST_SYNC_TIMESTAMP_KEY = 'lastNotificationSyncTimestamp';
const SUBSCRIBED_TOPICS_KEY = 'subscribedFCMTopics';
const NOTIFICATION_PERMISSION_KEY = 'notificationPermissionState';

function showStatus(message, type = 'info') {
  if (!notificationPopupStatus) return;
  notificationPopupStatus.textContent = message;
  notificationPopupStatus.style.display = 'block';
  notificationPopupStatus.style.backgroundColor = type === 'error' ? '#fee2e2' : (type === 'success' ? '#dcfce7' : '#eff6ff');
  notificationPopupStatus.style.color = type === 'error' ? '#b91c1c' : (type === 'success' ? '#15803d' : '#1e40af');
  notificationPopupStatus.style.border = `1px solid ${type === 'error' ? '#fecaca' : (type === 'success' ? '#bbf7d0' : '#bfdbfe')}`;
}

async function handlePermissionStatus(permission) {
  if (!messaging) {
    console.error("Messaging service not initialized when handling permission status.");
    showStatus("Error initializing notifications system.", "error");
    return;
  }

  if (permission === 'granted') {
    showStatus('Notifications are enabled.', 'success');
    if(enableNotificationsBtn) enableNotificationsBtn.style.display = 'none';
    if(topicSelectionArea) topicSelectionArea.style.display = 'block';
    generateTopicCheckboxes();
    await requestTokenAndSyncSubscriptions();
  } else if (permission === 'denied') {
    showStatus('Notifications are blocked. Please enable them in your browser settings.', 'error');
    if(enableNotificationsBtn) enableNotificationsBtn.style.display = 'none';
    if(topicSelectionArea) topicSelectionArea.style.display = 'none';
  } else {
    showStatus('Click the button to enable notifications for job alerts.');
    if(enableNotificationsBtn) enableNotificationsBtn.style.display = 'inline-block';
    if(topicSelectionArea) topicSelectionArea.style.display = 'none';
  }
}

async function initializeFCM() {
  if (!notificationPrefsBtn) {
    console.log("Notification button not found. Skipping FCM init.");
    return;
  }
  try {
    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);

    onMessage(messaging, (payload) => {
      console.log('Foreground message received. ', payload);
      const notif = payload.notification || {};
      const notification = new Notification(notif.title || "New Job Alert", {
        body: notif.body || "Check out the latest job postings!",
        icon: notif.icon || '/assets/icon-70x70.png',
        data: { click_action: payload.data?.link || payload.fcmOptions?.link || '/' }
      });
      notification.onclick = (event) => {
        event.preventDefault();
        window.open(notification.data.click_action, '_blank');
        notification.close();
      };
    });

    if (!('serviceWorker' in navigator)) {
        console.warn('Service workers are not supported.');
        setPopupStatus('Notifications require Service Worker support.', 'error');
        return;
    }

    try {
        await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('Service Worker registered successfully.');
    } catch (error) {
        console.error('Service Worker registration failed:', error);
        setPopupStatus(`Service Worker registration failed: ${error.message}`, 'error');
        return;
    }

    loadSubscribedTopicsFromLocal();

  } catch(err) {
     console.error("Error initializing Firebase app or messaging:", err);
     setPopupStatus("Could not initialize notifications system.", "error");
  }
}

function loadSubscribedTopicsFromLocal() {
    const storedTopics = localStorage.getItem(SUBSCRIBED_TOPICS_KEY);
    subscribedTopicsCache = storedTopics ? JSON.parse(storedTopics) : [];
    console.log("Loaded subscribed topics from cache:", subscribedTopicsCache);
}

function saveSubscribedTopicsToLocal() {
    localStorage.setItem(SUBSCRIBED_TOPICS_KEY, JSON.stringify(subscribedTopicsCache));
    console.log("Saved subscribed topics to cache:", subscribedTopicsCache);
}

function addTopicToCache(topicName) {
    if (!subscribedTopicsCache.includes(topicName)) {
        subscribedTopicsCache.push(topicName);
        saveSubscribedTopicsToLocal();
    }
}

function removeTopicFromCache(topicName) {
    subscribedTopicsCache = subscribedTopicsCache.filter(t => t !== topicName);
    saveSubscribedTopicsToLocal();
}

function isTopicSubscribedInCache(topicName) {
    return subscribedTopicsCache.includes(topicName);
}

function setPopupStatus(message, type = 'info', duration = 3000) {
  if (!notificationPopupStatus) return;
  notificationPopupStatus.textContent = message;
  notificationPopupStatus.className = `p-3 text-sm text-center ${
    type === 'error' ? 'bg-red-100 text-red-700' :
    type === 'success' ? 'bg-green-100 text-green-700' :
    'bg-blue-100 text-blue-700'
  }`;
  notificationPopupStatus.style.display = 'block';
  if (duration > 0) {
    setTimeout(() => {
      notificationPopupStatus.style.display = 'none';
      notificationPopupStatus.textContent = '';
    }, duration);
  }
}

async function openNotificationPopup() {
  if (!notificationPopup) return;

  setPopupStatus("Checking notification status...", "info", 0);

  const currentPermission = Notification.permission;
  localStorage.setItem(NOTIFICATION_PERMISSION_KEY, currentPermission);

  if (currentPermission === 'denied') {
      setPopupStatus("Notifications blocked by browser. Please enable in settings.", "error", 0);
      populatePopup();
      notificationPopup.classList.remove('hidden');
      notificationPopup.style.opacity = 1;
      return;
  }

  if (currentPermission === 'default') {
      setPopupStatus("Please grant permission to enable notifications.", "info", 0);
      try {
          const permissionRequested = await Notification.requestPermission();
          localStorage.setItem(NOTIFICATION_PERMISSION_KEY, permissionRequested);
          if (permissionRequested !== 'granted') {
              setPopupStatus("Permission not granted. Notifications disabled.", "warning", 0);
              populatePopup();
              notificationPopup.classList.remove('hidden');
              notificationPopup.style.opacity = 1;
              return;
          }
      } catch (err) {
          console.error("Error requesting permission:", err);
          setPopupStatus("Error requesting notification permission.", "error", 0);
          populatePopup();
          notificationPopup.classList.remove('hidden');
          notificationPopup.style.opacity = 1;
          return;
      }
  }

  if (Notification.permission === 'granted') {
      setPopupStatus("Getting notification token...", "info", 0);
      try {
          const tokenObtained = await requestNotificationToken();
          if (tokenObtained) {
             setPopupStatus("Token ready.", "success");
             await checkAndPerformDailySync();
          }
      } catch (err) {
         console.error("Error during token request or sync:", err);
      }
  }

  populatePopup();
  notificationPopup.classList.remove('hidden');
  notificationPopup.style.opacity = 1;
}

function closeNotificationPopup(event = null) {
  if (event && event.target !== notificationPopup && event.target !== closeNotificationPopupBtn && !closeNotificationPopupBtn?.contains(event.target)) {
     return;
  }
  if (notificationPopup) {
    notificationPopup.style.opacity = 0;
    setTimeout(() => notificationPopup.classList.add('hidden'), 300);
  }
}

function populatePopup() {
    if (popupLocationSelect) {
        popupLocationSelect.innerHTML = locations.map(loc => `<option value="${loc}">${loc.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</option>`).join('');
    }
    if (popupJobTypeSelect) {
        popupJobTypeSelect.innerHTML = JOB_TYPES.map(type => `<option value="${type}">${type.charAt(0).toUpperCase() + type.slice(1)}</option>`).join('');
    }
    updateSubscribedListUI();
}

function updateSubscribedListUI() {
    if (!subscribedTopicsList) return;
    subscribedTopicsList.innerHTML = '';

    if (subscribedTopicsCache.length === 0) {
        subscribedTopicsList.innerHTML = '<p class="text-sm text-gray-500 italic w-full">No subscriptions active.</p>';
        return;
    }

    subscribedTopicsCache.forEach(topicName => {
        const parts = topicName.split('-');
        const jobType = parts.pop();
        const location = parts.join('-');
        const displayLocation = location.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const displayJobType = jobType.charAt(0).toUpperCase() + jobType.slice(1);

        const topicElement = document.createElement('div');
        topicElement.className = 'bg-green-100 text-green-800 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-2';
        topicElement.innerHTML = `
            <span>${displayLocation} - ${displayJobType}</span>
            <button class="text-green-600 hover:text-green-900 transition-colors" data-topic="${topicName}" title="Unsubscribe">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        `;
        topicElement.querySelector('button').addEventListener('click', (e) => {
            e.stopPropagation();
            handleUnsubscribeClick(topicName, topicElement);
        });
        subscribedTopicsList.appendChild(topicElement);
    });
}

async function requestNotificationToken() {
  if (!messaging) {
    console.error("Cannot request token: Messaging service not initialized.");
    setPopupStatus("Error initializing notifications.", "error", 0);
    return false;
  }

  try {
    console.log("Requesting FCM token...");
    const registration = await navigator.serviceWorker.ready;
    console.log("Service worker ready for getToken:", registration);

    const currentToken = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration
    });

    if (currentToken) {
      console.log('FCM Token obtained/refreshed:', currentToken.substring(0, 10) + "...");
      fcmToken = currentToken;
      return true;
    } else {
      console.log('No registration token available. Request permission again.');
      if (Notification.permission === 'granted') {
        setPopupStatus('Could not get token. Service worker issue?', 'error', 0);
      } else {
        setPopupStatus('Notification permission needed to get token.', 'info', 0);
      }
      return false;
    }
  } catch (err) {
    console.error('Error retrieving token: ', err);
    if (err.code === 'messaging/permission-blocked' || err.code === 'messaging/notifications-blocked') {
        setPopupStatus('Notifications blocked. Please enable in browser settings.', 'error', 0);
    } else {
        setPopupStatus('Error getting notification token: ' + err.message, 'error', 0);
    }
    fcmToken = null;
    return false;
  }
}

function isSameDay(timestamp1, timestamp2) {
    const date1 = new Date(timestamp1);
    const date2 = new Date(timestamp2);
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

async function checkAndPerformDailySync() {
    const lastSyncTimestamp = parseInt(localStorage.getItem(LAST_SYNC_TIMESTAMP_KEY) || '0', 10);
    const now = Date.now();

    if (!isSameDay(lastSyncTimestamp, now)) {
        console.log("Performing daily subscription sync...");
        setPopupStatus("Syncing preferences with server...", "info", 0);
        await syncAllSubscriptionsWithServer();
        localStorage.setItem(LAST_SYNC_TIMESTAMP_KEY, now.toString());
        console.log("Daily sync complete.");
         setPopupStatus("Preferences synced.", "success");
    } else {
        console.log("Daily sync already performed today.");
        if (notificationPopupStatus?.textContent.includes("Syncing")) {
             setPopupStatus("");
        }
    }
}

async function syncAllSubscriptionsWithServer() {
    if (!fcmToken) {
        console.warn("Cannot sync, FCM token not available.");
        return;
    }
    console.log("Syncing based on local cache state:", subscribedTopicsCache);
    const allPossibleTopics = [];
    locations.forEach(loc => {
        JOB_TYPES.forEach(type => {
            allPossibleTopics.push(generateTopicName(loc, type));
        });
    });

    const promises = allPossibleTopics.map(topicName => {
        const shouldBeSubscribed = isTopicSubscribedInCache(topicName);
        const action = shouldBeSubscribed ? 'subscribe' : 'unsubscribe';
        return callManageSubscriptionAPI(topicName, action, null, false);
    });

    try {
        await Promise.all(promises);
        console.log("Server sync based on local cache complete.");
    } catch (error) {
        console.error("Error during server sync:", error);
        setPopupStatus("Error syncing preferences with server.", "error");
    }
}

async function handleSubscribeClick() {
  if (!popupLocationSelect || !popupJobTypeSelect) return;
  const location = popupLocationSelect.value;
  const jobType = popupJobTypeSelect.value;
  const topicName = generateTopicName(location, jobType);

  if (isTopicSubscribedInCache(topicName)) {
      setPopupStatus(`${topicName} is already subscribed.`, 'info');
      return;
  }

  handleSubscribe(topicName);
}

async function handleSubscribe(topicName) {
    if (!fcmToken) {
        setPopupStatus("Cannot subscribe: Enable notifications first.", "warning");
        return;
    }
    setPopupStatus(`Subscribing to ${topicName}...`, 'info', 0);
    if(subscribeTopicBtn) subscribeTopicBtn.disabled = true;

    try {
        await callManageSubscriptionAPI(topicName, 'subscribe');
    } catch (error) {
        setPopupStatus(`Failed to subscribe: ${error.message}`, 'error');
    } finally {
         if(subscribeTopicBtn) subscribeTopicBtn.disabled = false;
    }
}

async function handleUnsubscribeClick(topicName, topicElement) {
    if (!fcmToken) {
        setPopupStatus("Cannot unsubscribe: Enable notifications first.", "warning");
        return;
    }
    setPopupStatus(`Unsubscribing from ${topicName}...`, 'info', 0);
     if (topicElement) topicElement.style.opacity = '0.5';

    try {
        await callManageSubscriptionAPI(topicName, 'unsubscribe');
    } catch (error) {
        setPopupStatus(`Failed to unsubscribe: ${error.message}`, 'error');
         if (topicElement) topicElement.style.opacity = '1';
    }
}

async function callManageSubscriptionAPI(topicName, action, elementToUpdate = null, updateUICache = true) {
    console.log(`Calling API to ${action} topic: ${topicName}`);
    const functionUrl = MANAGE_SUBSCRIPTION_FUNCTION_URL;

    const response = await fetch(functionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: fcmToken, topic: topicName, action: action })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
        console.error(`API Error (${action}ing ${topicName}):`, result.error || response.statusText);
        throw new Error(result.error || `Server responded with status ${response.status}`);
    }

    console.log(`API Success: ${action}d ${topicName}`);

    if (updateUICache) {
        if (action === 'subscribe') {
            addTopicToCache(topicName);
            setPopupStatus(`Subscribed to ${topicName}!`, 'success');
        } else {
            removeTopicFromCache(topicName);
            setPopupStatus(`Unsubscribed from ${topicName}.`, 'success');
        }
        updateSubscribedListUI();
    }
}

function showSlide(i) { if (!slides || slides.length === 0) return; slides.forEach(s => s.classList.remove('active')); currentSlide = (i + totalSlides) % totalSlides; slides[currentSlide].classList.add('active') }

function renderJobCard(job, table) {
  const jobCard = document.createElement('article');
  jobCard.className = 'job-card';
  jobCard.onclick = (e) => {
    if (!e.target.closest('.admin-job-actions')) {
      showModal(job);
    }
  };

  let postedInfo = '';
  if (job.Created_At) {
    const daysAgo = getDaysAgo(job.Created_At);
    postedInfo = `<span class="job-tag time-tag">
      <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>
      Posted ${daysAgo}
    </span>`;
  }

  jobCard.innerHTML = `
    <div class="admin-job-actions">
      <button class="icon-btn edit-icon-btn" data-job-id="${job.id}" data-job-table="${table}" title="Edit Job">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
      </button>
      <button class="icon-btn delete-icon-btn" onclick="deleteJob(${job.id}, '${table}')" title="Delete Job">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
      </button>
    </div>
    <div class="job-info">
      <h2 class="job-company">${job.Company || 'Company Name N/A'}</h2>
      <div class="job-meta">
        <span class="job-tag location-tag">
          <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
          ${job.Location || 'Location N/A'}
        </span>
        ${job.Salary ? `
          <span class="job-tag salary-tag">
            <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            ₹${job.Salary}
          </span>
        ` : ''}
        ${postedInfo}
      </div>
    </div>
  `;

  return jobCard;
}

function isValidUrl(s) {
  try {
    new URL(s);
    return true
  } catch (_) {
    return false
  }
}

function getApplicationLink(id) {
  if (!id) return '#';
  if (isValidUrl(id)) return id;
  let emails = id.split(/,|\s/).filter(e => e && e.includes('@'));
  if (emails.length === 0) return '#';
  let email = emails[0];
  let subject = "";
  if (currentTable === "Industrial Training Job Portal") subject = "Application for CA Industrial Training (Ref - My Student Club)";
  else if (currentTable === "Articleship Jobs") subject = "Application for Articleship (Ref - My Student Club)";
  else if (currentTable === "Fresher Jobs") subject = "Application for Role of CA Fresher in your Organization (Ref - My Student Club)";
  else if (currentTable === "Semi Qualified Jobs") subject = "Application for Semi Qualified Roles in your Organization (Ref - My Student Club)";
  return `mailto:${email}?subject=${encodeURIComponent(subject)}`
}

function showModal(job) {
  let postedInfo = '';
  if (job.Created_At) {
    const daysAgo = getDaysAgo(job.Created_At);
    postedInfo = `<p class="job-posted"><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>Posted ${daysAgo}</p>`;
  }

  modalContent.innerHTML = `
    <h2 class="modal-company" style="color:#003399;">${job.Company}</h2>
    <p class="job-location"><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
    </svg>${job.Location}</p>
    ${job.Salary ? `<p class="job-salary"><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>₹${job.Salary}</p>` : ''}
    ${postedInfo}
    <section class="modal-section">
      <h3><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
      </svg>Job Details</h3>
      <dl class="job-details-list">
        <li><dd class="modal-description-text">${job.Description || 'N/A'}</dd></li>
      </dl>
    </section>
    <section class="modal-section">
      <h3><svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5"/>
      </svg>Apply Now</h3>
      ${job['Application ID'] ? `<a href="${getApplicationLink(job['Application ID'])}" class="apply-btn" ${isValidUrl(job['Application ID']) ? 'target="_blank"' : ''}>
        <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
        </svg>Apply</a>` : 'Contact details are in description'}
    </section>
  `; modal.style.display = 'flex'; document.body.style.overflow = 'hidden';
}

window.closeModal = function(event) {
  if (event && (event.target === modal || event.target.classList.contains('modal-close'))) {
    modal.style.display = 'none';
    document.body.style.overflow = 'auto';
  }
}

function updateOpportunitiesTextDisplay(table) {
    if (!opportunitiesText) return;
    if (table === "Industrial Training Job Portal" || table === "Articleship Jobs") {
        opportunitiesText.style.display = 'block'
    } else {
        opportunitiesText.style.display = 'none'
    }
}

function populateSalaryFilter(table) {
  if (!salaryFilter) return;
  salaryFilter.innerHTML = '';
  let options = [];
  if (table === "Articleship Jobs") {
    options = [{ value: '', text: 'Any Stipend' }, { value: '0-5000', text: 'Below ₹5,000' }, { value: '5000-10000', text: '₹5,000 - ₹10,000' }, { value: '10000-15000', text: '₹10,000 - ₹15,000' }, { value: '15000+', text: '₹15,000+' }];
  }
  else if (table === "Industrial Training Job Portal") {
    options = [{ value: '', text: 'Any Stipend' }, { value: '10000-20000', text: '₹10,000 - ₹20,000' }, { value: '20000-40000', text: '₹20,000 - ₹40,000' }, { value: '40000+', text: '₹40,000+' }];
  }
  else if (table === "Semi Qualified Jobs") {
    options = [{ value: '', text: 'Any Salary' }, { value: '0-25000', text: 'Below ₹25,000' }, { value: '25000-35000', text: '₹25,000 - ₹35,000' }, { value: '35000-50000', text: '₹35,000 - ₹50,000' }, { value: '50000+', text: 'Above ₹50,000' }];
  }
  else if (table === "Fresher Jobs") {
    options = [{ value: '', text: 'Any Salary' }, { value: '0-12', text: 'Less than 12 LPA' }, { value: '12-18', text: '12-18 LPA' }, { value: '18+', text: 'More than 18 LPA' }];
  }
  options.forEach(opt => {
    let o = document.createElement('option');
    o.value = opt.value; o.text = opt.text;
    salaryFilter.appendChild(o);
  });
}

async function fetchJobs() {
  if (isFetching || !jobsContainer) return;
  isFetching = true;
  if (loader) loader.style.display = 'block';
  if (loadMoreButton) loadMoreButton.disabled = true;

  try {
    let query = supabaseClient.from(currentTable).select('*', { count: 'exact' });

    const searchTerm = searchInput?.value.trim();
    if (searchTerm) {
      const searchPattern = `%${searchTerm}%`;
      query = query.or(`Company.ilike.${searchPattern},Location.ilike.${searchPattern},Description.ilike.${searchPattern}`);
    }

    const locationSearch = locationSearchInput?.value.trim();
    if (locationSearch) {
      query = query.ilike('Location', `%${locationSearch}%`);
    }

    const salary = salaryFilter?.value;
    if (salary) {
      if (salary.endsWith('+')) {
        const minValue = parseInt(salary.replace('+', ''));
        query = query.gte('Salary', minValue);
      } else if (salary.includes('-')) {
        const [min, max] = salary.split('-').map(Number);
        query = query.gte('Salary', min).lte('Salary', max);
      }
    }

    const category = categoryFilter?.value;
    if (category) {
      query = query.ilike('Category', `%${category}%`);
    }

    query = query.order('Created_At', { ascending: false });
    query = query.range(page * limit, (page + 1) * limit - 1);
    const { data, error } = await query;

    if (error) {
      jobsContainer.textContent = 'Failed to load jobs. Please try again.';
      return;
    }

    if (data && data.length > 0) {
      data.forEach(job => {
        let card = renderJobCard(job, currentTable);
        jobsContainer.appendChild(card);
      });
      page++;
      hasMoreData = data.length === limit;
      if (loadMoreButton) loadMoreButton.style.display = hasMoreData ? 'block' : 'none';
    } else {
      hasMoreData = false;
      if (loadMoreButton) loadMoreButton.style.display = 'none';
      if (page === 0) jobsContainer.textContent = 'No jobs found.';
    }
  } catch (e) {
    if (jobsContainer) jobsContainer.textContent = 'Failed to load jobs. Please check your connection.';
  } finally {
    isFetching = false;
    if (loader) loader.style.display = 'none';
    if (loadMoreButton) loadMoreButton.disabled = false;
  }
}


async function fetchCategories() {
    if (!categoryFilter) return;
    try {
        categoryFilter.innerHTML = `<option value="">All Categories</option>`;
        let categories = [];

        if (currentTable === "Industrial Training Job Portal") {
          categories = ["Accounting", "Auditing", "Costing", "Finance", "Taxation"];
        } else if (currentTable === "Fresher Jobs") {
          categories = ["Accounting", "Audit", "Consultancy", "Controllership", "Direct Taxation", "Equity Research", "Finance", "Investment Banking", "Private Equity"];
        } else if (currentTable === "Semi Qualified Jobs") {
          categories = ["Consultancy", "Controllership", "Direct Taxation", "Finance", "Indirect Taxation", "Internal Audit", "Investment Banking", "Private Equity", "Statutory Audit"];
        } else if (currentTable === "Articleship Jobs") {
          categories = ["Accounting", "Auditing", "Costing", "Finance", "Taxation"];
        }

        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilter.appendChild(option);
        });
    } catch (e) { console.error("Error fetching categories:", e); }
}

let lastScrollY = 0;
const header = document.querySelector('.floating-header');
function handleScroll() {
  if (!header) return;
  let cur = window.scrollY;
  if (cur > lastScrollY && cur > 100) header.classList.add('header-hidden');
  else header.classList.remove('header-hidden');
  lastScrollY = cur;
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
      document.querySelector('main.container')?.classList.add('no-banner');
      return;
    } else {
      bannerSection.style.display = 'block';
      document.querySelector('main.container')?.classList.remove('no-banner');
    }

    relevantBanners.forEach((banner, i) => {
      const a = document.createElement('a');
      a.href = banner.Hyperlink;
      a.className = `carousel-item ${i === 0 ? 'active' : ''}`;
      a.target = "_blank";
      const img = document.createElement('img');
      img.src = banner.Image;
      img.alt = `Banner ${i + 1}`;
      a.appendChild(img);
      carousel.appendChild(a);
    });

    slides = document.querySelectorAll('.carousel-item');
    totalSlides = slides.length;
    currentSlide = 0;
    if (totalSlides > 0) {
      showSlide(0);
      setInterval(() => showSlide(currentSlide + 1), 5000);
    }
  } catch (e) { console.error("Error loading banners", e); }
}

async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

function updateHeaderAuth(session) {
  const authButtons = document.querySelector('.auth-buttons');
  if (!authButtons) return;
  if (session) {
    let email = session.user.email || 'User';
    let initial = email.charAt(0).toUpperCase();
    authButtons.innerHTML = `<div class="user-profile-container">
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
  } else {
    authButtons.innerHTML = `<a href="/login.html" class="auth-icon-btn">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a9 9 0 00-7 7h14a9 9 0 00-7-7z"/>
      </svg>
    </a>`;
  }
}

window.handleLogout = async () => {
  await supabaseClient.auth.signOut();
  window.location.reload();
}


window.showAddJobModal = function() {
  const modal = document.getElementById('job-edit-modal');
  if (!modal) return;
  const form = document.getElementById('job-form');
  if (!form) return;

  document.getElementById('job-edit-title').textContent = 'Add New Job';
  form.reset();

  const createdAtInput = form.querySelector('input[name="Created_At"]');
  if (createdAtInput) {
      const now = new Date();
      const localDatetime = new Date(now.getTime() - (now.getTimezoneOffset() * 60000))
        .toISOString()
        .slice(0, 16);
      createdAtInput.value = localDatetime;
  }

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

const handleSearch = debounceSearch(() => {
    page = 0;
    if (jobsContainer) jobsContainer.innerHTML = '';
    hasMoreData = true;
    if (loadMoreButton) loadMoreButton.style.display = 'none';
    fetchJobs()
}, 300);

function debounceSearch(fn, delay) {
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    }
}

export { showModal, getApplicationLink };