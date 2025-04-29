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
const menuButton = document.getElementById('menuButton');
const expandedMenu = document.getElementById('expandedMenu');
const menuCloseBtn = document.getElementById('menuCloseBtn');
const header = document.querySelector('.floating-header'); 
const opportunitiesText = document.getElementById('opportunitiesText'); 

const notificationsBtn = document.getElementById('notificationsBtn');
const notificationPopup = document.getElementById('notificationPopup');
const closeNotificationPopup = document.getElementById('closeNotificationPopup');
const notificationStatus = document.getElementById('notificationStatus');
const subscribedTopicsList = document.getElementById('subscribedTopicsList');
const locationSelect = document.getElementById('locationSelect');
const jobTypeSelect = document.getElementById('jobTypeSelect');
const subscribeBtn = document.getElementById('subscribeBtn');
const notificationBadge = document.getElementById('notificationBadge');

let isFetching = false; 
let page = 0; 
const limit = 12; 
let timeout = null; 
let hasMoreData = true; 
let currentSlide = 0, slides = [], totalSlides = 0; 
let lastScrollY = 0; 

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
const JOB_TYPES = [
  { value: "industrial", label: "Industrial Training" },
  { value: "semi", label: "Semi Qualified" },
  { value: "fresher", label: "Fresher" }
];
const LOCATIONS = [
  "mumbai", "bangalore", "gurgaon", "pune", "kolkata",
  "delhi", "noida", "bengaluru", "hyderabad", "ahmedabad",
  "chennai", "gurugram", "jaipur", "new delhi"
].slice(0, MAX_LOCATIONS); 

const SYNC_TIMESTAMP_KEY = 'notificationSyncTimestamp'; 
const SUBSCRIBED_TOPICS_KEY = 'subscribedTopics'; 

let messaging; 
let fcmToken = null; 

function generateTopicName(location, jobType) {
  const formattedLocation = location.toLowerCase().replace(/\s+/g, '-');
  return `${formattedLocation}-${jobType}`;
}

function formatTopicForDisplay(topicName) {
  const parts = topicName.split('-');
  if (parts.length < 2) return { location: topicName, jobType: '' }; 

  const jobType = parts.pop(); 
  const location = parts.join('-'); 

  const displayLocation = location.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  let displayJobType = '';
  const jobTypeObj = JOB_TYPES.find(type => type.value === jobType);
  if (jobTypeObj) {
    displayJobType = jobTypeObj.label;
  } else {

    displayJobType = jobType.charAt(0).toUpperCase() + jobType.slice(1);
  }

  return { location: displayLocation, jobType: displayJobType };
}

function showStatus(message, type = 'info') {
  if (!notificationStatus) return;

  notificationStatus.textContent = message;
  notificationStatus.style.display = 'block';

  if (type === 'error') {
    notificationStatus.style.backgroundColor = '#fee2e2'; 
    notificationStatus.style.color = '#b91c1c'; 
  } else if (type === 'success') {
    notificationStatus.style.backgroundColor = '#dcfce7'; 
    notificationStatus.style.color = '#15803d'; 
  } else { 
    notificationStatus.style.backgroundColor = '#eff6ff'; 
    notificationStatus.style.color = '#1e40af'; 
  }

  if (type !== 'error') {
    setTimeout(() => {

      if (notificationStatus.textContent === message) {
        notificationStatus.style.display = 'none';
      }
    }, 3000); 
  }
}

function getSubscribedTopics() {
  const topicsJson = localStorage.getItem(SUBSCRIBED_TOPICS_KEY);
  try {
    return topicsJson ? JSON.parse(topicsJson) : [];
  } catch (e) {
    console.error("Error parsing subscribed topics from localStorage:", e);
    return []; 
  }
}

function saveSubscribedTopics(topics) {

  if (Array.isArray(topics)) {
    localStorage.setItem(SUBSCRIBED_TOPICS_KEY, JSON.stringify(topics));
    updateNotificationBadge(); 
  } else {
    console.error("Attempted to save non-array as subscribed topics:", topics);
  }
}

function updateNotificationBadge() {
  if (!notificationBadge) return;
  const topics = getSubscribedTopics();

  notificationBadge.style.visibility = topics.length > 0 ? 'visible' : 'hidden';
}

function renderSubscribedTopics() {
  if (!subscribedTopicsList) return;

  subscribedTopicsList.innerHTML = ''; 
  const topics = getSubscribedTopics();

  if (topics.length === 0) {

    const noSubscriptions = document.createElement('p');
    noSubscriptions.className = 'no-subscriptions';
    noSubscriptions.textContent = 'No active subscriptions. Subscribe below to receive job alerts.';
    subscribedTopicsList.appendChild(noSubscriptions);
    return;
  }

  topics.forEach(topic => {
    const { location, jobType } = formatTopicForDisplay(topic); 

    const topicTag = document.createElement('div');
    topicTag.className = 'topic-tag'; 
    topicTag.innerHTML = `
      <span>${location} - ${jobType}</span>
      <button class="topic-remove" data-topic="${topic}" aria-label="Unsubscribe from ${location} - ${jobType}">×</button>
    `;

    subscribedTopicsList.appendChild(topicTag);
  });

  const removeButtons = subscribedTopicsList.querySelectorAll('.topic-remove');
  removeButtons.forEach(button => {
    button.addEventListener('click', async (e) => {
      e.stopPropagation(); 
      const topic = button.dataset.topic;
      button.disabled = true; 
      await unsubscribeFromTopic(topic);
      button.disabled = false;
    });
  });
}

async function subscribeToTopic(topic) {
  if (!fcmToken) {
    showStatus('Cannot subscribe: Notification token not available.', 'error');
    return false;
  }

  const functionUrl = 'https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription';
  showStatus(`Subscribing to ${topic}...`, 'info');

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: fcmToken,
        topic: topic,
        action: 'subscribe'
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || `Failed to subscribe to ${topic}`);
    }

    const topics = getSubscribedTopics();
    if (!topics.includes(topic)) {
      topics.push(topic);
      saveSubscribedTopics(topics);
    }

    showStatus(`Successfully subscribed to ${topic}`, 'success');
    renderSubscribedTopics(); 
    return true;

  } catch (err) {
    console.error(`Failed to subscribe to topic ${topic}:`, err);
    showStatus(`Failed to subscribe: ${err.message}`, 'error');
    return false;
  }
}

async function unsubscribeFromTopic(topic) {
  if (!fcmToken) {
    showStatus('Cannot unsubscribe: Notification token not available.', 'error');
    return false;
  }

  const functionUrl = 'https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription';
  showStatus(`Unsubscribing from ${topic}...`, 'info');

  try {
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: fcmToken,
        topic: topic,
        action: 'unsubscribe'
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {

      if (result.fcmError?.code !== 'messaging/registration-token-not-registered') {
         throw new Error(result.error || `Failed to unsubscribe from ${topic}`);
      } else {
         console.warn(`Token not registered for topic ${topic}, proceeding with local removal.`);
      }
    }

    let topics = getSubscribedTopics();
    topics = topics.filter(t => t !== topic);
    saveSubscribedTopics(topics);

    showStatus(`Successfully unsubscribed from ${topic}`, 'success');
    renderSubscribedTopics(); 
    return true;

  } catch (err) {
    console.error(`Failed to unsubscribe from topic ${topic}:`, err);
    showStatus(`Failed to unsubscribe: ${err.message}`, 'error');
    return false;
  }
}

function shouldSyncNotifications() {
  const lastSync = localStorage.getItem(SYNC_TIMESTAMP_KEY);
  if (!lastSync) return true; 

  const lastSyncDate = new Date(parseInt(lastSync));
  const today = new Date();

  return lastSyncDate.toDateString() !== today.toDateString();
}

function markSyncComplete() {
  localStorage.setItem(SYNC_TIMESTAMP_KEY, Date.now().toString());
}

async function syncNotificationTopics() {
  if (!fcmToken) {
    console.log("Cannot sync: FCM token not available");
    return;
  }

  if (!shouldSyncNotifications()) {
    console.log("Skipping notification sync - already synced today");
    return; 
  }

  try {
    showStatus("Syncing notification preferences...", "info");
    console.log("Syncing notification topics with server...");

    const savedTopics = getSubscribedTopics();
    let syncPromises = [];

    const allPossibleTopics = [];
    LOCATIONS.forEach(loc => {
        JOB_TYPES.forEach(type => {
            allPossibleTopics.push(generateTopicName(loc, type.value));
        });
    });

    allPossibleTopics.forEach(topic => {
        const shouldBeSubscribed = savedTopics.includes(topic);
        const action = shouldBeSubscribed ? 'subscribe' : 'unsubscribe';

        syncPromises.push(
            fetch('https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token: fcmToken,
                    topic: topic,
                    action: action
                })
            }).then(response => response.json())
              .then(result => {
                  if (!result.success) {

                      console.warn(`Failed to sync topic ${topic} (${action}): ${result.error}`);
                  }
                  return { topic, success: result.success };
              })
              .catch(err => {
                  console.error(`Error syncing topic ${topic} (${action}):`, err);
                  return { topic, success: false }; 
              })
        );
    });

    const results = await Promise.all(syncPromises);
    const failedSyncs = results.filter(r => !r.success).length;

    if (failedSyncs > 0) {
      console.warn(`Sync completed with ${failedSyncs} errors.`);
      showStatus(`Sync completed with ${failedSyncs} errors`, "error");
    } else {
      console.log("Notification sync completed successfully");
      showStatus("Notification preferences synced successfully", "success");
    }

    markSyncComplete(); 

  } catch (err) {
    console.error("Error during notification sync:", err);
    showStatus("Failed to sync notification preferences", "error");
  }
}

function setupNotificationPopup() {

  if (!notificationsBtn || !notificationPopup || !closeNotificationPopup || !locationSelect || !jobTypeSelect || !subscribeBtn) {
      console.warn("Notification popup elements not found, skipping setup.");
      return;
  }

  LOCATIONS.forEach(location => {
    const option = document.createElement('option');
    option.value = location;

    option.textContent = location.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    locationSelect.appendChild(option);
  });

  JOB_TYPES.forEach(type => {
    const option = document.createElement('option');
    option.value = type.value;
    option.textContent = type.label;
    jobTypeSelect.appendChild(option);
  });

  const updateSubscribeButtonState = () => {
    const locationValue = locationSelect.value;
    const jobTypeValue = jobTypeSelect.value;
    subscribeBtn.disabled = !(locationValue && jobTypeValue);
  };

  locationSelect.addEventListener('change', updateSubscribeButtonState);
  jobTypeSelect.addEventListener('change', updateSubscribeButtonState);

  subscribeBtn.addEventListener('click', async () => {
    const location = locationSelect.value;
    const jobType = jobTypeSelect.value;

    if (!location || !jobType) {
      showStatus("Please select both location and job type", "error");
      return;
    }

    const topicName = generateTopicName(location, jobType);
    const topics = getSubscribedTopics();

    if (topics.includes(topicName)) {
      showStatus("You are already subscribed to this topic", "info");
      return;
    }

    subscribeBtn.disabled = true; 
    const success = await subscribeToTopic(topicName);
    if (success) {

      locationSelect.selectedIndex = 0;
      jobTypeSelect.selectedIndex = 0;
    }

    updateSubscribeButtonState();
  });

  notificationsBtn.addEventListener('click', async () => {
    const isVisible = notificationPopup.style.display === 'flex';

    if (!isVisible) {

      if (Notification.permission !== 'granted') {
         showStatus("Please enable notifications in your browser first.", "error");
         notificationPopup.style.display = 'flex'; 
         return; 
      }

      if (!messaging || !fcmToken) {
         showStatus("Initializing notifications...", "info");
         const initializedMessaging = await initializeFCM(); 
         if (!initializedMessaging || !fcmToken) {
            showStatus("Could not get notification token. Please refresh or check browser settings.", "error");
            notificationPopup.style.display = 'flex'; 
            return; 
         }
      }

      renderSubscribedTopics();
      notificationPopup.style.display = 'flex';

      await syncNotificationTopics();

    } else {

      notificationPopup.style.display = 'none';
    }
  });

  closeNotificationPopup.addEventListener('click', () => {
    notificationPopup.style.display = 'none';
  });

  document.addEventListener('click', (e) => {
    if (notificationPopup.style.display === 'flex' &&
        !notificationPopup.contains(e.target) &&
        !notificationsBtn.contains(e.target)) {
      notificationPopup.style.display = 'none';
    }
  });
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

function showModal(job) {
  if (!modal || !modalContent) return;
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
  if (event && modal && modalContent && (event.target === modal || event.target.classList.contains('modal-close'))) {
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
      return
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
      if (page === 0) jobsContainer.textContent = 'No jobs found.'
    }
  } catch (e) {
    if (jobsContainer) jobsContainer.textContent = 'Failed to load jobs. Please check your connection.'
  } finally {
    isFetching = false;
    if (loader) loader.style.display = 'none';
    if (loadMoreButton) loadMoreButton.disabled = false
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

function handleScroll() {
  if (!header) return;
  let cur = window.scrollY;
  if (cur > lastScrollY && cur > 100) header.classList.add('header-hidden');
  else header.classList.remove('header-hidden');
  lastScrollY = cur
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
  const authButtonsContainer = document.querySelector('.auth-buttons');
  if (!authButtonsContainer) return;

  const notificationButton = authButtonsContainer.querySelector('#notificationsBtn');

  let authElement = authButtonsContainer.querySelector('a[href="/login.html"], .user-profile-container');
  if (authElement) {
      authButtonsContainer.removeChild(authElement);
  }

  if (session) {

    let email = session.user.email || 'User';
    let initial = email.charAt(0).toUpperCase();
    const profileDiv = document.createElement('div');
    profileDiv.className = 'user-profile-container'; 
    profileDiv.innerHTML = `
      <div class="user-icon-wrapper">
        <div class="user-icon" data-email="${email}">${initial}</div>
        <div class="user-hover-card">
          <div class="user-hover-content">
            <p class="user-email">${email}</p>
            <button onclick="handleLogout()" class="logout-btn">Logout</button>
          </div>
        </div>
      </div>`;

    if (notificationButton) {
        notificationButton.insertAdjacentElement('afterend', profileDiv);
    } else {
        authButtonsContainer.appendChild(profileDiv); 
    }
  } else {

    const loginLink = document.createElement('a');
    loginLink.href = "/login.html";
    loginLink.className = "auth-icon-btn";
    loginLink.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a9 9 0 00-7 7h14a9 9 0 00-7-7z"/>
      </svg>`;

    if (notificationButton) {
        notificationButton.insertAdjacentElement('afterend', loginLink);
    } else {
        authButtonsContainer.appendChild(loginLink); 
    }
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

document.addEventListener('DOMContentLoaded', async () => {

  const session = await checkAuth();
  updateHeaderAuth(session); 
  await loadBanners();
  populateSalaryFilter(currentTable);
  fetchJobs();
  fetchCategories();
  updateOpportunitiesTextDisplay(currentTable);

  setupNotificationPopup();

  if (Notification.permission === 'granted') {
    try {
      await initializeFCM(); 
      updateNotificationBadge();
    } catch (err) {
      console.error("Error initializing FCM on load:", err);
    }
  } else {

    updateNotificationBadge();
  }

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

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        page = 0;
        if (jobsContainer) jobsContainer.innerHTML = '';
        hasMoreData = true;
        if (loadMoreButton) loadMoreButton.style.display = 'none';
        fetchJobs()
      }, 300)
    });
  }

  if (locationSearchInput) {
    locationSearchInput.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        page = 0;
        if (jobsContainer) jobsContainer.innerHTML = '';
        hasMoreData = true;
        if (loadMoreButton) loadMoreButton.style.display = 'none';
        fetchJobs()
      }, 300)
    });
  }

  if (salaryFilter) {
    salaryFilter.addEventListener('change', () => {
      page = 0;
      if (jobsContainer) jobsContainer.innerHTML = '';
      hasMoreData = true;
      if (loadMoreButton) loadMoreButton.style.display = 'none';
      fetchJobs()
    });
  }

  if (categoryFilter) {
    categoryFilter.addEventListener('change', () => {
      page = 0;
      if (jobsContainer) jobsContainer.innerHTML = '';
      hasMoreData = true;
      if (loadMoreButton) loadMoreButton.style.display = 'none';
      fetchJobs()
    });
  }

  if (loadMoreButton) {
    loadMoreButton.addEventListener('click', () => {
      fetchJobs()
    });
  }

  window.addEventListener('scroll', handleScroll);
});

export { showModal, getApplicationLink };