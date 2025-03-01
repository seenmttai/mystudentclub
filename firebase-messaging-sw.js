importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDWwcmZCb0_IjanZ1XcRTPsbg08bKei1G4",
  authDomain: "mystudentclub.firebaseapp.com",
  projectId: "mystudentclub",
  storageBucket: "mystudentclub.firebasestorage.app",
  messagingSenderId: "606394251878",
  appId: "1:606394251878:web:27b5d66b4bb00ea6d14ba7",
  measurementId: "G-22V6NK4GXT"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message', payload);
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icon.png' 
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});