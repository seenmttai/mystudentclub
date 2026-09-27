// Shared shell wiring for all LMS pages
(function () {
  // ── Theme toggle (event delegation — survives Vue re-renders) ──
  document.addEventListener('click', function (e) {
    if (e.target.closest('#themeToggleBtn')) {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('msc-theme', next);
    }
  });

  // ── Side menu open/close (delegation — elements may be inside Vue #app) ──
  document.addEventListener('click', function (e) {
    if (e.target.closest('#lmsMenuBtn') || e.target.closest('#menuButton')) {
      const menu = document.getElementById('lmsExpandedMenu') || document.getElementById('expandedMenu');
      const overlay = document.getElementById('menuBackdrop') || document.getElementById('lmsMenuOverlay');
      menu && menu.classList.add('active');
      overlay && overlay.classList.add('active');
      return;
    }
    if (
      e.target.closest('#lmsMenuCloseBtn') ||
      e.target.closest('#menuCloseBtn') ||
      e.target.closest('#menuBackdrop') ||
      e.target.closest('#lmsMenuOverlay')
    ) {
      const menu = document.getElementById('lmsExpandedMenu') || document.getElementById('expandedMenu');
      const overlay = document.getElementById('menuBackdrop') || document.getElementById('lmsMenuOverlay');
      menu && menu.classList.remove('active');
      overlay && overlay.classList.remove('active');
      return;
    }
  });

  // ── Resources dropdown toggle (delegation) ──
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('#resourcesDropdownBtn') || e.target.closest('.menu-item-dropdown > button');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const parent = btn.closest('.menu-item-dropdown');
      const dropdown = parent ? parent.querySelector('.dropdown-content') : document.getElementById('resourcesDropdown');
      const icon = btn.querySelector('.dropdown-icon');
      if (dropdown) dropdown.classList.toggle('active');
      if (icon) icon.classList.toggle('open');
    }
  });

  // ── MutationObserver to keep backdrop in sync ──
  document.addEventListener('DOMContentLoaded', function () {
    const menu = document.getElementById('lmsExpandedMenu') || document.getElementById('expandedMenu');
    const overlay = document.getElementById('menuBackdrop') || document.getElementById('lmsMenuOverlay');
    if (menu && overlay && window.MutationObserver) {
      new MutationObserver(function () {
        overlay.classList.toggle('active', menu.classList.contains('active'));
      }).observe(menu, { attributes: true, attributeFilter: ['class'] });
    }
  });

  // ── Logout (delegation) ──
  document.addEventListener('click', function (e) {
    if (e.target.closest('#lmsLogoutMenuBtn') || e.target.closest('#logoutMenuBtn')) {
      if (typeof window._lmsLogout === 'function') {
        window._lmsLogout();
      } else {
        localStorage.clear();
        window.location.href = '/login.html';
      }
    }
  });
})();
