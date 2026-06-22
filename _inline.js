document.addEventListener("DOMContentLoaded", async () => {
  // Menu Toggle
  const menuButton = document.getElementById("menuButton");
  const expandedMenu = document.getElementById("expandedMenu");
  const menuCloseBtn = document.getElementById("menuCloseBtn");

  if (menuButton && expandedMenu) {
    menuButton.addEventListener("click", () =>
      expandedMenu.classList.add("active"),
    );
  }
  if (menuCloseBtn && expandedMenu) {
    menuCloseBtn.addEventListener("click", () =>
      expandedMenu.classList.remove("active"),
    );
  }

  // Dropdowns
  const dropdowns = document.querySelectorAll(".menu-item-dropdown button");
  dropdowns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const content = btn.nextElementSibling;
      if (content) {
        content.style.display =
          content.style.display === "block" ? "none" : "block";
        btn.classList.toggle("active");
      }
    });
  });

  // Supabase Credentials
  const SUPABASE_URL = "https://izsggdtdiacxdsjjncdq.supabase.co";
  const SUPABASE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0";
  let sb = null;
  if (typeof supabase !== "undefined") {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  // Auth Check
  let session = null;
  if (sb) {
    const { data } = await sb.auth.getSession();
    session = data?.session;
    const authContainer = document.querySelector(".auth-buttons-container");
    const lmsLink = document.getElementById("lms-nav-link");

    if (authContainer) {
      if (session) {
        authContainer.innerHTML =
          '<a href="/profile.html" class="auth-icon-btn" aria-label="Your profile"><i class="fas fa-user"></i></a>';
        if (lmsLink) lmsLink.style.display = "flex";
      } else {
        authContainer.innerHTML =
          '<a href="/login.html" class="auth-icon-btn" aria-label="Log in"><i class="fas fa-sign-in-alt"></i></a>';
      }
    }
  }

  // Dynamic Batch Month Calculation (-2 months)
  const d = new Date();
  d.setMonth(d.getMonth() - 2);
  const monthShort = d.toLocaleString("en-US", { month: "short" });
  const monthLong = d.toLocaleString("en-US", { month: "long" });
  const yearShort = d.getFullYear().toString().slice(-2);

  const batchFormat1 = `${monthShort}'${yearShort}`; // Dec'25
  const batchFormat2 = `${monthLong}`; // December
  const batchFormat3 = `${monthShort} '${yearShort}`; // Dec '25

  document
    .querySelectorAll(".dynamic-batch-month")
    .forEach((el) => (el.textContent = batchFormat1));
  document
    .querySelectorAll(".dynamic-batch-month-long")
    .forEach((el) => (el.textContent = batchFormat2));
  document
    .querySelectorAll(".dynamic-batch-month-space")
    .forEach((el) => (el.textContent = batchFormat3));

  // ==========================================
  // NOTIFY ME PUSH NOTIFICATIONS FLOW
  // ==========================================
  const NOTIFY_FIREBASE_CONFIG = {
    apiKey: "AIzaSyBTIXRJbaZy_3ulG0C8zSI_irZI7Ht2Y-8",
    authDomain: "msc-notif.firebaseapp.com",
    projectId: "msc-notif",
    storageBucket: "msc-notif.appspot.com",
    messagingSenderId: "228639798414",
    appId: "1:228639798414:web:b8b3c96b15da5b770a45df",
    measurementId: "G-X4M23TB936",
  };
  const NOTIFY_VAPID_KEY =
    "BGlNz4fQGzftJPr2U860MsoIo0dgNcqb2y2jAEbwJzjmj8CbDwJy_kD4eRAcruV6kNRs6Kz-mh9rdC37tVgeI5I";
  const NOTIFY_TOPIC = "industrial-training-program-notify";
  const MANAGE_TOPIC_URL =
    "https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription";

  function getOrCreateDeviceKey() {
    let key = localStorage.getItem("msc_device_key");
    if (!key) {
      key =
        "dk_" +
        Date.now().toString(36) +
        "_" +
        Math.random().toString(36).slice(2, 9);
      localStorage.setItem("msc_device_key", key);
    }
    return key;
  }

  function setNotifyStatus(msg, type) {
    const el = document.getElementById("notifyStatus");
    if (!el) return;
    el.textContent = msg;
    el.className = "notify-status show notify-status--" + type;
    if (type !== "error")
      setTimeout(() => (el.className = "notify-status"), 4000);
  }

  async function saveToNotifiable(fcmToken) {
    if (!sb) return;
    const deviceKey = getOrCreateDeviceKey();
    const email = session?.user?.email || null;
    await sb
      .from("notifiable")
      .insert({ key: deviceKey, email, topic: "industrial-training" })
      .throwOnError();
  }

  async function initNotifyMe() {
    const btn = document.getElementById("notifyMeBtn");
    const workshopBtn = document.getElementById("registerButtonWorkshop");
    const footerBtn = document.getElementById("notifyMeFooterBtn");
    const allBtns = [btn, workshopBtn, footerBtn];

    function syncButtonStates(subscribed) {
      if (btn) {
        btn.querySelector(".notify-btn-text").textContent = subscribed
          ? "You Will Be Notified!"
          : "Notify Me When Open";
        btn.querySelector(".notify-btn-icon").textContent = subscribed
          ? "✅"
          : "🔔";
        btn.classList.toggle("subscribed", subscribed);
      }
      if (workshopBtn) {
        workshopBtn.querySelector(".notify-btn-text").textContent = subscribed
          ? "You Will Be Notified!"
          : "Notify Me When Open";
        workshopBtn.querySelector(".notify-btn-icon").textContent = subscribed
          ? "✅"
          : "🔔";
        workshopBtn.classList.toggle("subscribed", subscribed);
      }
      if (footerBtn) {
        footerBtn.querySelector(".notify-footer-text").textContent = subscribed
          ? "Notified"
          : "Notify Me";
        footerBtn.querySelector(".notify-footer-icon").textContent = subscribed
          ? "✅"
          : "🔔";
        footerBtn.classList.toggle("subscribed", subscribed);
      }
    }

    const isSubscribed =
      localStorage.getItem("notif_industrial_training_program") === "1";
    syncButtonStates(isSubscribed);

    async function handleNotifyClick() {
      if (this.disabled) return;
      allBtns.forEach((b) => b && (b.disabled = true));

      // Already subscribed — unsubscribe
      if (localStorage.getItem("notif_industrial_training_program") === "1") {
        const token = localStorage.getItem("notif_fcm_token_it");
        if (token) {
          try {
            await fetch(MANAGE_TOPIC_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                token,
                topic: NOTIFY_TOPIC,
                action: "unsubscribe",
              }),
            });
          } catch (_) {}
        }
        localStorage.removeItem("notif_industrial_training_program");
        localStorage.removeItem("notif_fcm_token_it");
        syncButtonStates(false);
        setNotifyStatus("Unsubscribed.", "info");
        allBtns.forEach((b) => b && (b.disabled = false));
        return;
      }

      // Request notification permission
      setNotifyStatus("Requesting permission…", "info");
      let permission;
      try {
        permission = await Notification.requestPermission();
      } catch (e) {
        permission = "denied";
      }

      if (permission !== "granted") {
        setNotifyStatus(
          "Please allow notifications in your browser settings.",
          "error",
        );
        allBtns.forEach((b) => b && (b.disabled = false));
        return;
      }

      // Initialize Firebase & get FCM token
      setNotifyStatus("Setting up…", "info");
      try {
        if (!firebase.apps.length)
          firebase.initializeApp(NOTIFY_FIREBASE_CONFIG);
        const messaging = firebase.messaging();
        if ("serviceWorker" in navigator) {
          await navigator.serviceWorker.register("/firebase-messaging-sw.js");
        }
        const fcmToken = await messaging.getToken({
          vapidKey: NOTIFY_VAPID_KEY,
        });
        if (!fcmToken) throw new Error("No FCM token");

        // Subscribe to FCM topic
        setNotifyStatus("Subscribing…", "info");
        const res = await fetch(MANAGE_TOPIC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: fcmToken,
            topic: NOTIFY_TOPIC,
            action: "subscribe",
          }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Subscription failed");

        // Save to Supabase notifiable table
        try {
          await saveToNotifiable(fcmToken);
        } catch (_) {
          /* ignore duplicate key */
        }

        localStorage.setItem("notif_industrial_training_program", "1");
        localStorage.setItem("notif_fcm_token_it", fcmToken);
        syncButtonStates(true);
        setNotifyStatus(
          "You're on the list! We'll notify you when the program opens.",
          "success",
        );
      } catch (err) {
        console.error("NotifyMe error:", err);
        setNotifyStatus("Something went wrong. Please try again.", "error");
      }

      allBtns.forEach((b) => b && (b.disabled = false));
    }

    allBtns.forEach((b) => {
      if (b) b.addEventListener("click", handleNotifyClick);
    });
  }

  initNotifyMe();
});
