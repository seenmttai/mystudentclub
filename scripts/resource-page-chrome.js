/* Airy Flow chrome for the resource hub pages: theme toggle, side menu, resources dropdown, greeting, logout.
   New hub links (data-gated-resource) stay hidden until the backend/route checklist passes; QA can reveal them with
   localStorage.setItem('msc-enable-new-resources', '1'). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  try {
    var saved = localStorage.getItem('msc-theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
  } catch (_) {}

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
