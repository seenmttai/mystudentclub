importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.15.0/firebase-messaging-compat.js');

const firebaseConfig = {
    apiKey: "AIzaSyBTIXRJbaZy_3ulG0C8zSI_irZI7Ht2Y-8",
    authDomain: "msc-notif.firebaseapp.com",
    projectId: "msc-notif",
    storageBucket: "msc-notif.firebasestorage.app",
    messagingSenderId: "228639798414",
    appId: "1:228639798414:web:b8b3c96b15da5b770a45df",
    measurementId: "G-X4M23TB936"
};

try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
        const notificationTitle = payload.notification?.title || 'New Job Alert';
        const notificationOptions = {
            body: payload.notification?.body || 'A new job matching your preferences was posted.',
            icon: payload.notification?.icon || '/assets/icon-70x70.png',
            data: {
                click_action: payload.data?.link || payload.fcmOptions?.link || '/'
            }
        };

        return self.registration.showNotification(notificationTitle, notificationOptions);
    });

    self.addEventListener('notificationclick', (event) => {
        event.notification.close();
        const urlToOpen = event.notification.data?.click_action || '/';

        event.waitUntil(clients.matchAll({
            type: "window",
            includeUncontrolled: true
        }).then((clientList) => {
            for (const client of clientList) {
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        }));
    });

} catch (error) {
    console.error('[firebase-messaging-sw.js] Error:', error);
}