/* Keep the original homepage brand while sharing the tested navigation behavior. */
(() => {
  function restoreHomepageBrand() {
    const brand = document.querySelector('#msc-site-navigation .msc-nav-brand img');
    if (brand) {
      brand.src = '/assets/logo.png';
      brand.alt = 'My Student Club';
      brand.width = 200;
      brand.height = 36;
    }
    const login = document.querySelector('#msc-site-navigation .msc-nav-login');
    if (login && !login.hidden) login.textContent = 'Sign Up / Login';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', restoreHomepageBrand);
  else restoreHomepageBrand();
})();
