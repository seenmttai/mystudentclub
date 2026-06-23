// Shared shell wiring for all LMS pages
(function () {
  // Theme toggle
  const themeBtn = document.getElementById('themeToggleBtn');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('msc-theme', next);
    });
  }

  // Side menu open/close — .expanded-menu uses 'active' class (portal-style.css line 281)
  const menuBtn = document.getElementById('lmsMenuBtn');
  const closeBtn = document.getElementById('lmsMenuCloseBtn');
  const overlay = document.getElementById('lmsMenuOverlay');
  const menu = document.getElementById('lmsExpandedMenu');

  function openMenu() {
    menu && menu.classList.add('active');
    overlay && overlay.classList.add('active');
  }
  function closeMenu() {
    menu && menu.classList.remove('active');
    overlay && overlay.classList.remove('active');
  }

  if (menuBtn) menuBtn.addEventListener('click', openMenu);
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  if (overlay) overlay.addEventListener('click', closeMenu);

  // Logout: each page sets window._lmsLogout before this script runs
  const logoutBtn = document.getElementById('lmsLogoutMenuBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', function () {
    if (typeof window._lmsLogout === 'function') window._lmsLogout();
  });
})();
