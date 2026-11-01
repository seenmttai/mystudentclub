document.addEventListener('DOMContentLoaded', () => {
  // Use the same Firebase notification service as the fresher/articleship waitlists.
  const FIREBASE_CONFIG = {
    apiKey: 'AIzaSyBTIXRJbaZy_3ulG0C8zSI_irZI7Ht2Y-8',
    authDomain: 'msc-notif.firebaseapp.com',
    projectId: 'msc-notif',
    storageBucket: 'msc-notif.appspot.com',
    messagingSenderId: '228639798414',
    appId: '1:228639798414:web:b8b3c96b15da5b770a45df',
    measurementId: 'G-X4M23TB936'
  };
  const VAPID_KEY = 'BGlNz4fQGzftJPr2U860MsoIo0dgNcqb2y2jAEbwJzjmj8CbDwJy_kD4eRAcruV6kNRs6Kz-mh9rdC37tVgeI5I';
  const TOPIC = 'industrial-program-notify';
  // Same notifiable topic as the mobile IT page, so both sites land in one waitlist.
  const NOTIFIABLE_TOPIC = 'industrial-training';
  const STORAGE_KEY = 'msc_waitlist_' + TOPIC;
  const MANAGE_TOPIC_URL = 'https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription';
  const buttons = Array.from(document.querySelectorAll('.js-notify-btn'));
  const originalLabels = buttons.map(button => button.innerHTML);
  const status = document.getElementById('notifyStatus');
  const toast = document.getElementById('notifyStatusToast');
  const successMessage = "You're on the list! We'll notify you when industrial training seats open.";
  let pending = false;
  let subscribed = false;
  let toastTimeout;

  function updateButtons() {
    buttons.forEach((button, index) => {
      button.disabled = pending || subscribed;
      button.setAttribute('aria-busy', String(pending));
      button.classList.toggle('subscribed', subscribed);
      button.innerHTML = subscribed
        ? '<span>Added to Waitlist ✓</span>'
        : pending ? '<span>Enabling...</span>' : originalLabels[index];
    });
  }

  function showStatus(message, type = 'info', showToast = true) {
    if (status) {
      status.textContent = message;
      status.className = 'waitlist-status waitlist-status--' + type;
    }
    if (toast && showToast) {
      toast.textContent = message;
      toast.className = 'notify-status notify-status--' + type + ' show';
      clearTimeout(toastTimeout);
      toastTimeout = setTimeout(() => toast.classList.remove('show'), 5000);
    }
  }

  function getDeviceKey() {
    let key = localStorage.getItem('msc_device_key');
    if (!key) {
      key = 'dk_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 9);
      localStorage.setItem('msc_device_key', key);
    }
    return key;
  }

  function getDb() {
    return typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
  }

  // join_waitlist / is_on_waitlist are Supabase functions (SQL: notifiable_waitlist_functions, run by the maintainer).
  // Until they exist, PostgREST says the function is missing and we use the old direct insert.
  function isMissingFunction(error) {
    return error && (error.code === 'PGRST202' || error.status === 404 || /could not find the function/i.test(error.message || ''));
  }

  // The waitlist row is what the team counts and mails from; the push topic alone can't be counted.
  async function saveToNotifiable() {
    const db = getDb();
    if (!db) return;
    const { error } = await db.rpc('join_waitlist', { p_topic: NOTIFIABLE_TOPIC, p_key: getDeviceKey() });
    if (!error) return;
    if (!isMissingFunction(error)) {
      console.error('Industrial training waitlist row:', error);
      return;
    }
    const email = window.__mscSession?.user?.email || null;
    const { error: insertError } = await db.from('notifiable').insert({ key: getDeviceKey(), email, topic: NOTIFIABLE_TOPIC });
    if (insertError) console.error('Industrial training waitlist row:', insertError);
  }

  // The notifiable table can't be read from the browser, so ask the yes/no function instead.
  // This lets a signed-in student see "Added to Waitlist" on a new browser or after clearing data.
  async function syncFromDatabase() {
    const db = getDb();
    if (!db || subscribed) return;
    try {
      const { data, error } = await db.rpc('is_on_waitlist', { p_topic: NOTIFIABLE_TOPIC, p_key: localStorage.getItem('msc_device_key') });
      if (error || data !== true) return;
      subscribed = true;
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch (_) { }
      updateButtons();
      showStatus(successMessage, 'success', false);
    } catch (_) { }
  }

  try {
    subscribed = localStorage.getItem(STORAGE_KEY) === 'true';
  } catch (_) { }
  if (subscribed) {
    updateButtons();
    showStatus(successMessage, 'success', false);
  }

  syncFromDatabase();

  async function subscribeToWaitlist() {
    if (pending || subscribed) return;
    pending = true;
    updateButtons();
    showStatus('Setting up notification...', 'info', false);

    try {
      if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
        showStatus('This browser does not support push notifications. Please try another browser.');
        return;
      }
      if (typeof firebase === 'undefined') {
        throw new Error('Firebase notification service is unavailable');
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        showStatus(permission === 'denied'
          ? 'Notifications are blocked. Allow them in your browser settings, then try again.'
          : 'Please allow notifications to join the waitlist.');
        return;
      }

      if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      const serviceWorkerRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await firebase.messaging().getToken({
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration
      });
      if (!token) throw new Error('No Firebase messaging token was returned');

      const response = await fetch(MANAGE_TOPIC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, topic: TOPIC, action: 'subscribe' })
      });
      if (!response.ok) throw new Error('Waitlist subscription failed: ' + response.status);

      try {
        await saveToNotifiable();
      } catch (error) {
        console.error('Industrial training waitlist row:', error);
      }

      subscribed = true;
      try {
        localStorage.setItem(STORAGE_KEY, 'true');
      } catch (_) { }
      showStatus(successMessage, 'success');
    } catch (error) {
      console.error('Industrial training waitlist:', error);
      showStatus("We couldn't enable notifications. Please try again.", 'error');
    } finally {
      pending = false;
      updateButtons();
    }
  }

  buttons.forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      return subscribeToWaitlist();
    });
  });
});
