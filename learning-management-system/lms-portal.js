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
    if (e.target.closest('#lmsMenuBtn')) {
      const menu = document.getElementById('lmsExpandedMenu');
      const overlay = document.getElementById('lmsMenuOverlay');
      menu && menu.classList.add('active');
      overlay && overlay.classList.add('active');
      return;
    }
    if (e.target.closest('#lmsMenuCloseBtn') || e.target.closest('#lmsMenuOverlay')) {
      const menu = document.getElementById('lmsExpandedMenu');
      const overlay = document.getElementById('lmsMenuOverlay');
      menu && menu.classList.remove('active');
      overlay && overlay.classList.remove('active');
      return;
    }
  });

  // ── Logout (delegation) ──
  document.addEventListener('click', function (e) {
    if (e.target.closest('#lmsLogoutMenuBtn')) {
      if (typeof window._lmsLogout === 'function') window._lmsLogout();
    }
  });
})();
