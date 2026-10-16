/* Airy Flow chrome for the resource hub pages: theme toggle, side menu, resources dropdown, greeting, logout.
   The new hub links are live (no longer gated); the legacy QA flag below only un-hides any element still marked
   [data-gated-resource], so it is a harmless no-op. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  try {
    var saved = localStorage.getItem('msc-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (_) {}

  /* Back navigation that also works when the page is the FIRST entry of the app WebView (history.back() is a silent no-op there).
     Order: a real previous entry -> history.back(); else the Flutter shell -> native 'closeWebView' handler (pops the WebView route);
     else the home page. Any element with [data-rh-back] is wired by the delegated listener below (no javascript: URLs). */
  function hasBackTarget() {
    var h = window.history;
    if (!h || !(h.length > 1)) return false;
    var nav = window.navigation;
    if (nav && typeof nav.canGoBack === 'boolean') {
      if (nav.canGoBack) return true; // the Navigation API only lists same-origin entries
      try { var ref = document.referrer; return !!ref && new URL(ref).origin !== window.location.origin; } catch (_) { return false; }
    }
    return true; // older engines: trust history.length (guarded by the timeout in goBack)
  }
  function goHome() {
    try { window.location.assign('/'); } catch (_) { window.location.href = '/'; }
    return 'home';
  }
  function leaveShell() {
    var bridge = window.flutter_inappwebview;
    if (bridge && typeof bridge.callHandler === 'function') {
      try {
        var pending = bridge.callHandler('closeWebView');
        if (pending && typeof pending.then === 'function') pending.then(null, goHome);
        return 'flutter';
      } catch (_) { /* fall through to the web fallback */ }
    }
    return goHome();
  }
  function goBack() {
    if (!hasBackTarget()) return leaveShell();
    var nav = window.navigation, left = false;
    var mark = function () { left = true; };
    window.addEventListener('pagehide', mark);
    window.history.back();
    if (!(nav && typeof nav.canGoBack === 'boolean')) {
      // No Navigation API: back may still be a no-op (e.g. only forward entries). If this page is still here, leave the shell instead.
      setTimeout(function () { window.removeEventListener('pagehide', mark); if (!left) leaveShell(); }, 1500);
    }
    return 'history';
  }
  window.MSCNav = window.MSCNav || {};
  window.MSCNav.goBack = goBack;
  window.MSCNav.hasBackTarget = hasBackTarget;
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('[data-rh-back]') : null;
    if (!link) return;
    e.preventDefault();
    goBack();
  });

  function init() {
    var menu = $('expandedMenu'), backdrop = $('menuBackdrop'), menuBtn = $('menuButton'), closeBtn = $('menuCloseBtn');
    function openMenu() { menu.classList.add('active'); backdrop && backdrop.classList.add('active'); document.body.style.overflow = 'hidden'; }
    function closeMenu() { menu.classList.remove('active'); backdrop && backdrop.classList.remove('active'); document.body.style.overflow = ''; }
    if (menu && menuBtn) {
      menuBtn.addEventListener('click', openMenu);
      closeBtn && closeBtn.addEventListener('click', closeMenu);
      backdrop && backdrop.addEventListener('click', closeMenu);
      document.addEventListener('click', function (e) {
        if (menu.classList.contains('active') && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu();
      });
    }
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu && menu.classList.contains('active')) closeMenu(); });
    window.addEventListener('pageshow', function () { if (menu && !menu.classList.contains('active')) document.body.style.overflow = ''; });
    var theme = $('themeToggleBtn');
    theme && theme.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('msc-theme', next); } catch (_) {}
    });
    var dropBtn = $('resourcesDropdownBtn'), dropContent = $('resourcesDropdown');
    if (dropBtn && dropContent) {
      dropBtn.addEventListener('click', function () {
        var open = dropContent.classList.toggle('active');
        var icon = dropBtn.querySelector('.dropdown-icon');
        icon && icon.classList.toggle('open', open);
      });
    }
    try {
      if (localStorage.getItem('msc-enable-new-resources') === '1') {
        document.querySelectorAll('[data-gated-resource]').forEach(function (el) { el.hidden = false; });
      }
    } catch (_) {}
    try {
      var profile = JSON.parse(localStorage.getItem('userProfileData') || '{}');
      var name = profile.name && profile.name.trim();
      if (name && $('greetingText') && $('greetingName')) {
        $('greetingText').textContent = 'Hello,';
        $('greetingName').textContent = name.split(' ')[0];
      }
      var authKey = Object.keys(localStorage).find(function (k) { return k.indexOf('auth-token') !== -1; });
      var session = authKey ? JSON.parse(localStorage.getItem(authKey) || 'null') : null;
      if (session && session.access_token) {
        var h = $('history-nav-link'); if (h) h.style.display = '';
      }
    } catch (_) {}
    var logout = $('logoutMenuBtn');
    logout && logout.addEventListener('click', async function () {
      try {
        var client = window.supabaseClient || (window.getSupabaseClient && window.getSupabaseClient());
        if (client) await client.auth.signOut();
      } catch (_) {}
      try { localStorage.clear(); } catch (_) {}
      window.location.href = '/login.html';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
