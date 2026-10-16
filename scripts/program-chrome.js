/* Airy Flow chrome for the three program pages (Industrial / Articleship / Freshers):
   theme toggle, slide-in drawer, resources dropdown, logout. Theme key 'msc-theme' is shared across the app. */
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
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && menu.classList.contains('active')) closeMenu(); });
      menu.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href^="#"]');
        if (a) closeMenu();
      });
    }
    var theme = $('themeToggleBtn');
    theme && theme.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('msc-theme', next); } catch (_) {}
    });
    var dropBtn = $('resourcesDropdownBtn'), dropContent = $('resourcesDropdown');
    if (dropBtn && dropContent) {
      dropBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var open = dropContent.classList.toggle('active');
        var icon = dropBtn.querySelector('.dropdown-icon');
        icon && icon.classList.toggle('open', open);
      });
    }
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
