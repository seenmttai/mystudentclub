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

const MAX_LOCATIONS = 15;
const JOB_TYPES = ["semi", "industrial", "fresher"];

function generateTopicName(location, jobType) {
  const formattedLocation = location.toLowerCase().replace(/\s+/g, '-');
  return `${formattedLocation}-${jobType}`;
}

const STATUS_MESSAGE_DURATION = 3000;
const SUBSCRIBED_TOPIC_BG_COLOR = '#e0e7ff';

const locations = ["mumbai", "bangalore", "gurgaon", "pune", "kolkata", "delhi", "noida", "bengaluru", "hyderabad", "ahmedabad", "chennai", "gurugram", "jaipur", "new delhi"].slice(0, MAX_LOCATIONS);

const notificationStatusDiv = document.getElementById('notification-permission-status');
const enableNotificationsBtn = document.getElementById('enable-notifications-btn');
const topicSelectionArea = document.getElementById('topic-selection-area');
const topicCheckboxesDiv = document.getElementById('topic-checkboxes');
const fcmTokenDisplay = document.getElementById('fcm-token-display');

let messaging;
let fcmToken = null;

async function initializeFCM() {
  try {
    const app = initializeApp(firebaseConfig);
    messaging = getMessaging(app);

    onMessage(messaging, (payload) => {
      console.log('Foreground message received. ', payload);
      const notif = payload.notification || {};
      const notification = new Notification(notif.title, {
        body: notif.body,
        icon: notif.icon || '/assets/icon-70x70.png',
        data: { click_action: payload.data?.link || payload.fcmOptions?.link || '/' }
      });
      notification.onclick = (event) => {
        event.preventDefault();
        window.open(notification.data.click_action, '_blank');
        notification.close();
      };
    });

    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        console.log('Service Worker registered successfully.');
      } catch (error) {
        console.error('Service Worker registration failed:', error);
        showStatus(`Service Worker registration failed: ${error.message}`, 'error');
        return;
      }
    } else {
      console.warn('Service workers are not supported in this browser.');
      showStatus('Notifications require Service Worker support.', 'error');
      return;
    }

    handlePermissionStatus(Notification.permission);

  } catch(err) {
     console.error("Error initializing Firebase app or messaging:", err);
     showStatus("Could not initialize notifications system.", "error");
  }
}

function showStatus(message, type = 'info') {
  if (!notificationStatusDiv) return;
  notificationStatusDiv.textContent = message;
  notificationStatusDiv.style.display = 'block';
  notificationStatusDiv.style.backgroundColor = type === 'error' ? '#fee2e2' : (type === 'success' ? '#dcfce7' : '#eff6ff');
  notificationStatusDiv.style.color = type === 'error' ? '#b91c1c' : (type === 'success' ? '#15803d' : '#1e40af');
  notificationStatusDiv.style.border = `1px solid ${type === 'error' ? '#fecaca' : (type === 'success' ? '#bbf7d0' : '#bfdbfe')}`;
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

function generateTopicCheckboxes() {
  if (!topicCheckboxesDiv) return;
  topicCheckboxesDiv.innerHTML = '';

  locations.forEach(location => {
    JOB_TYPES.forEach(jobType => {
      const topicName = generateTopicName(location, jobType);
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.cursor = 'pointer';
      label.style.padding = '0.5rem';
      label.style.borderRadius = '6px';
      label.style.transition = 'background-color 0.2s';
      label.style.fontSize = '0.9rem';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = topicName;
      checkbox.id = `topic-${topicName}`;
      checkbox.style.marginRight = '0.5rem';
      checkbox.style.cursor = 'pointer';

      const span = document.createElement('span');
      const displayLocation = location.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      const displayJobType = jobType.charAt(0).toUpperCase() + jobType.slice(1);
      span.textContent = `${displayLocation} - ${displayJobType}`;

      label.appendChild(checkbox);
      label.appendChild(span);

      const isSubscribed = localStorage.getItem(topicName) === 'true';
      checkbox.checked = isSubscribed;
      if(isSubscribed) label.style.backgroundColor = SUBSCRIBED_TOPIC_BG_COLOR;

      checkbox.addEventListener('change', handleTopicChange);

      label.addEventListener('mouseover', () => { if(!checkbox.checked) label.style.backgroundColor = '#f1f5f9'; });
      label.addEventListener('mouseout', () => { if(!checkbox.checked) label.style.backgroundColor = 'transparent'; });

      topicCheckboxesDiv.appendChild(label);
    });
  });
}

async function handleTopicChange(event) {
  const checkbox = event.target;
  const topicName = checkbox.value;
  const label = checkbox.parentElement;

  if (!fcmToken) {
      showStatus('Cannot change subscription: Notification token not available. Try enabling notifications again.', 'error');
      checkbox.checked = !checkbox.checked;
      return;
  }

  const action = checkbox.checked ? 'subscribe' : 'unsubscribe';
  const functionUrl = 'https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription';

  checkbox.disabled = true;
  label.style.opacity = '0.7';
  showStatus(`Attempting to ${action} topic ${topicName}...`, 'info');

  try {
      const response = await fetch(functionUrl, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
          },
          body: JSON.stringify({
              token: fcmToken,
              topic: topicName,
              action: action
          })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
           throw new Error(result.error || `Server responded with status ${response.status}`);
      }

      if (checkbox.checked) {
          localStorage.setItem(topicName, 'true');
          console.log(`Successfully ${action}d ${topicName} via function.`);
          showStatus(`Subscribed to ${topicName}`, 'success');
          label.style.backgroundColor = SUBSCRIBED_TOPIC_BG_COLOR;
      } else {
          localStorage.removeItem(topicName);
          console.log(`Successfully ${action}d ${topicName} via function.`);
          showStatus(`Unsubscribed from ${topicName}`, 'info');
          label.style.backgroundColor = 'transparent';
      }

  } catch (err) {
      console.error(`Failed to ${action} topic ${topicName} via function:`, err);
      showStatus(`Failed to ${action} topic ${topicName}: ${err.message}`, 'error');
      checkbox.checked = !checkbox.checked;
      label.style.backgroundColor = checkbox.checked ? SUBSCRIBED_TOPIC_BG_COLOR : 'transparent';
  } finally {
      checkbox.disabled = false;
      label.style.opacity = '1';
      setTimeout(() => { if (notificationStatusDiv.textContent.includes(topicName)) showStatus(''); }, STATUS_MESSAGE_DURATION);
  }
}


async function requestTokenAndSyncSubscriptions() {
  if (!messaging) {
    console.error("Cannot request token: Messaging service not initialized.");
    showStatus("Error initializing notifications.", "error");
    return;
  }

  if (fcmToken) {
    console.log("Token already available.");
    if (fcmTokenDisplay) fcmTokenDisplay.textContent = `Debug Token: ${fcmToken.substring(0, 15)}...`;
    await syncAllSubscriptionsWithServer();
    return;
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
      console.log('FCM Token obtained:', currentToken);
      fcmToken = currentToken;
      if (fcmTokenDisplay) fcmTokenDisplay.textContent = `Debug Token: ${fcmToken.substring(0, 15)}...`;
      await syncAllSubscriptionsWithServer();
      showStatus("Notification token obtained.", "success");
      setTimeout(() => showStatus(''), STATUS_MESSAGE_DURATION);

    } else {
      console.log('No registration token available. Request permission to generate one.');
      if (Notification.permission === 'granted') {
        showStatus('Could not get notification token. Ensure service worker is active and VAPID key is correct.', 'error');
      } else {
        showStatus('Notification permission needed to get token.', 'info');
      }
    }
  } catch (err) {
    console.error('An error occurred while retrieving token. ', err);
    if (err.code === 'messaging/permission-blocked') {
        showStatus('Notification permission was blocked. Please enable it in browser settings.', 'error');
    } else {
        showStatus('Error getting notification token: ' + err.message, 'error');
    }
    if(fcmTokenDisplay) fcmTokenDisplay.textContent = '';
  }
}

async function syncAllSubscriptionsWithServer() {
    if (!fcmToken || !topicCheckboxesDiv) return;
    console.log("Syncing all topic subscriptions with server state...");
    const checkboxes = topicCheckboxesDiv.querySelectorAll('input[type="checkbox"]');
    const functionUrl = 'https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription';
    const promises = [];

    checkboxes.forEach(checkbox => {
        const topicName = checkbox.value;
        const shouldBeSubscribed = checkbox.checked;
        const action = shouldBeSubscribed ? 'subscribe' : 'unsubscribe';
        const label = checkbox.parentElement;

        promises.push(
            (async () => {
                checkbox.disabled = true;
                label.style.opacity = '0.7';
                try {
                    const response = await fetch(functionUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: fcmToken, topic: topicName, action: action })
                    });
                    const result = await response.json();
                    if (!response.ok || !result.success) {
                        throw new Error(result.error || `Sync failed for ${topicName}`);
                    }
                    console.log(`Synced ${topicName}: ${action} successful.`);
                    localStorage.setItem(topicName, shouldBeSubscribed ? 'true' : 'false');
                     label.style.backgroundColor = shouldBeSubscribed ? SUBSCRIBED_TOPIC_BG_COLOR : 'transparent';
                } catch (err) {
                    console.error(`Sync failed for ${topicName}:`, err);
                    const storedState = localStorage.getItem(topicName) === 'true';
                    checkbox.checked = storedState;
                    label.style.backgroundColor = storedState ? SUBSCRIBED_TOPIC_BG_COLOR : 'transparent';
                    showStatus(`Failed to sync ${topicName}. Please try toggling it again.`, 'error');
                } finally {
                    checkbox.disabled = false;
                     label.style.opacity = '1';
                }
            })()
        );
    });

    await Promise.all(promises);
    console.log("Subscription sync process complete.");
     showStatus("Preferences synced.", "success");
     setTimeout(() => showStatus(''), STATUS_MESSAGE_DURATION);
}

if (enableNotificationsBtn) {
  enableNotificationsBtn.addEventListener('click', async () => {
    try {
      const permission = await Notification.requestPermission();
      handlePermissionStatus(permission);
    } catch (err) {
      console.error("Error requesting notification permission:", err);
      showStatus('Could not request notification permission: ' + err.message, 'error');
    }
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await checkAuth();
  updateHeaderAuth(session);
  await loadBanners();
  populateSalaryFilter(currentTable);
  fetchJobs();
  fetchCategories();
  updateOpportunitiesTextDisplay(currentTable);
  await initializeFCM();

  const resourcesBtn = document.getElementById('resourcesDropdownBtn');
  const resourcesDropdown = document.getElementById('resourcesDropdown');
  const dropdownIcon = resourcesBtn?.querySelector('.dropdown-icon');

  if (resourcesBtn && resourcesDropdown && dropdownIcon) {
      resourcesBtn.addEventListener('click', (e) => {
          e.preventDefault();
          resourcesDropdown.classList.toggle('active');
          dropdownIcon.classList.toggle('open');
      });

      document.addEventListener('click', (e) => {
          if (!resourcesBtn.contains(e.target) && !resourcesDropdown.contains(e.target)) {
              resourcesDropdown.classList.remove('active');
              dropdownIcon.classList.remove('open');
          }
      });
  }

  if(menuButton && expandedMenu && menuCloseBtn) {
      menuButton.addEventListener('click', () => expandedMenu.classList.toggle('active'));
      menuCloseBtn.addEventListener('click', () => expandedMenu.classList.remove('active'));
      document.addEventListener('click', (e) => {
          if (!expandedMenu.contains(e.target) && !menuButton.contains(e.target) && expandedMenu.classList.contains('active')) {
              expandedMenu.classList.remove('active');
          }
      });
  }
});


async function checkAuth() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session;
}

export function updateHeaderAuth(session) {
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

export { showModal, getApplicationLink };

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


if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        page = 0;
        jobsContainer.innerHTML = '';
        hasMoreData = true;
        loadMoreButton.style.display = 'none';
        fetchJobs()
      }, 300)
    });
}

if (locationSearchInput) {
    locationSearchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        page = 0;
        jobsContainer.innerHTML = '';
        hasMoreData = true;
        loadMoreButton.style.display = 'none';
        fetchJobs()
      }, 300)
    });
}

if (salaryFilter) {
    salaryFilter.addEventListener('change', () => {
      page = 0;
      jobsContainer.innerHTML = '';
      hasMoreData = true;
      loadMoreButton.style.display = 'none';
      fetchJobs()
    });
}

if (categoryFilter) {
    categoryFilter.addEventListener('change', () => {
      page = 0;
      jobsContainer.innerHTML = '';
      hasMoreData = true;
      loadMoreButton.style.display = 'none';
      fetchJobs()
    });
}

if (loadMoreButton) {
    loadMoreButton.addEventListener('click', () => {
      fetchJobs()
    });
}

window.addEventListener('scroll', handleScroll);