/* Shared navigation for every MSC public page, including generated job pages. */
(function () {
  'use strict';
  if (window.self !== window.top || document.getElementById('msc-site-navigation')) return;
  const groups = [
    ['Free Resources', [['Industrial Training', '/ca-industrial-training-resources'], ['Articleship', '/articleship-resources'], ['CA Fresher', '/ca-fresher-training-resources'], ['Semi-Qualified CA', '/semi-qualified-ca-resources']]],
    ['Tools', [['CV Builder', '/cv-builder/'], ['CV Reviewer', '/cv-reviewer/'], ['AI Interview Bot', '/ai-interview'], ['All tools & guides', '/explore']]],
    ['Programs', [['MSC Industrial Training Program', '/ca-industrial-training-program/'], ['MSC Articleship Program', '/articleship-program/'], ['MSC CA Fresher Program', '/msc-ca-fresher-program/']]]
  ];
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = src;
      script.onload = resolve; script.onerror = reject; document.head.append(script);
    });
  }
  async function client() {
    if (window.getSupabaseClient) return window.getSupabaseClient();
    if (window.supabaseClient && window.supabaseClient.auth) return window.supabaseClient;
    if (!window.supabase || !window.supabase.createClient) await loadScript('/scripts/vendor/supabase.js');
    await loadScript('/scripts/supabase-init.js?v=20260927.5');
    return window.getSupabaseClient();
  }
  function init() {
    if (document.getElementById('msc-site-navigation')) return;
    document.documentElement.classList.add('msc-shared-navigation');
    const header = document.createElement('header'); header.id = 'msc-site-navigation';
    header.innerHTML = `<div class="msc-nav-shell"><a class="msc-nav-brand" href="/" aria-label="My Student Club home"><img src="/favicon.svg" alt="" width="32" height="36"><span class="msc-nav-wordmark">My Student Club</span></a><button class="msc-nav-toggle" type="button" aria-label="Open main menu" aria-expanded="false" aria-controls="msc-main-menu"><span aria-hidden="true">☰</span><span>Menu</span></button><nav id="msc-main-menu" aria-label="Main navigation"><a class="msc-nav-link" href="/">Jobs</a>${groups.map(([label, links]) => `<details class="msc-nav-group"><summary>${label}<span aria-hidden="true">⌄</span></summary><div class="msc-nav-dropdown">${links.map(([name, url]) => `<a href="${url}">${name}</a>`).join('')}</div></details>`).join('')}<a class="msc-nav-link" href="https://hire.mystudentclub.com">For Recruiters</a><div class="msc-nav-account"><a class="msc-nav-link msc-member" href="/learning-management-system/" hidden>My Courses</a><details class="msc-nav-group msc-nav-account-menu msc-member" hidden><summary>My Account<span aria-hidden="true">⌄</span></summary><div class="msc-nav-dropdown"><a href="/profile.html">My Profile</a><a href="/history.html">My Applications</a></div></details><a class="msc-nav-profile msc-member" href="/profile.html?onboarding=1" hidden>Complete Profile</a><a class="msc-nav-login" href="/login.html">Log in / Sign up</a></div></nav></div>`;
    document.body.prepend(header);
    const logout = document.createElement('button');
    logout.type = 'button'; logout.className = 'msc-nav-logout'; logout.textContent = 'Log out';
    const authError = document.createElement('p');
    authError.className = 'msc-nav-auth-error'; authError.setAttribute('role', 'alert'); authError.hidden = true;
    header.querySelector('.msc-nav-account-menu .msc-nav-dropdown').append(logout, authError);
    // Move the original node so its notification handler, badge and popup keep working.
    const notifications = document.getElementById('notificationsBtn');
    if (notifications) header.querySelector('.msc-nav-account').append(notifications);
    const toggle = header.querySelector('.msc-nav-toggle');
    const close = () => { header.classList.remove('msc-nav-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open main menu'); };
    if (notifications) notifications.addEventListener('click', close);
    toggle.addEventListener('click', () => { const open = header.classList.toggle('msc-nav-open'); toggle.setAttribute('aria-expanded', String(open)); toggle.setAttribute('aria-label', open ? 'Close main menu' : 'Open main menu'); });
    header.querySelectorAll('details').forEach(detail => detail.addEventListener('toggle', () => {
      if (detail.open) header.querySelectorAll('details').forEach(other => { if (other !== detail) other.open = false; });
    }));
    document.addEventListener('click', event => { if (!header.contains(event.target)) { close(); header.querySelectorAll('details').forEach(item => { item.open = false; }); } });
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const expanded = header.querySelector('details[open]');
      const menuOpen = header.classList.contains('msc-nav-open');
      if (!expanded && !menuOpen) return;
      if (expanded) { expanded.open = false; expanded.querySelector('summary').focus(); }
      else { close(); toggle.focus(); }
    });
    header.addEventListener('focusout', event => {
      if (event.relatedTarget && !header.contains(event.relatedTarget)) {
        close(); header.querySelectorAll('details').forEach(item => { item.open = false; });
      }
    });
    const canonicalPath = path => path.replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/\/$/, '') || '/';
    const currentPath = canonicalPath(location.pathname);
    header.querySelectorAll('a').forEach(link => {
      const url = new URL(link.href);
      if (canonicalPath(url.pathname) === currentPath && url.host === location.host) {
        link.setAttribute('aria-current', 'page');
        const group = link.closest('details'); if (group) group.classList.add('msc-nav-current');
      }
    });
    if (['/', '/ca-articleship-opportunities', '/ca-fresher-jobs', '/semi-qualified-ca-jobs', '/experienced-ca-jobs'].includes(currentPath) || currentPath.startsWith('/jobs/')) header.querySelector('a.msc-nav-link').setAttribute('aria-current', 'page');
    const main = document.querySelector('main, .main-content, .main-content-area, .container');
    if (main) {
      if (!main.id) main.id = 'msc-main-content';
      if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
      const skip = document.createElement('a'); skip.className = 'msc-skip-link'; skip.href = '#' + main.id; skip.textContent = 'Skip to content';
      skip.addEventListener('click', () => main.focus({ preventScroll: false }));
      document.body.prepend(skip);
    }
    const pageClass = currentPath === '/links' ? 'msc-community' : currentPath === '/contact' ? 'msc-contact' : ['/interview-predictor','/career_navigator','/salary-estimator','/cv-checklist','/articleship-scorer','/linkedin-connection-message'].includes(currentPath) ? 'msc-support-tool' : '';
    if (pageClass) document.body.classList.add(pageClass);
    if (currentPath === '/mentor') document.body.classList.add('msc-mentor-page');
    if (currentPath === '/ICAI-Campus-Shortlisting-Predictor') document.body.classList.add('msc-campus-page');
    if (currentPath.startsWith('/articleship-firm-review')) document.body.classList.add('msc-reviews-page');
    const footerPages = ['/links', '/contact', '/explore', '/privacy-policy', '/interview-predictor', '/career_navigator', '/salary-estimator', '/cv-checklist', '/articleship-scorer', '/linkedin-connection-message'];
    if (footerPages.includes(currentPath) && !document.getElementById('msc-site-footer')) {
      const footer = document.createElement('footer'); footer.id = 'msc-site-footer';
      footer.innerHTML = '<div class="msc-footer-inner"><div><strong>My Student Club</strong><p>Resources, community and opportunities for your CA career.</p></div><nav aria-label="Helpful links"><a href="/">Find jobs</a><a href="/explore">Tools &amp; guides</a><a href="/links/">Community</a><a href="/contact">Contact us</a><a href="/privacy-policy">Privacy</a><a href="/ca-industrial-training-program/terms-and-conditions.html">Program terms</a></nav></div>';
      document.body.append(footer);
    }
    // Keep existing page scripts' header nodes and IDs intact while replacing their presentation.
    const top = document.querySelector('main, .main-content, .main-content-area, .container');
    if (!top || top.getBoundingClientRect().top < 76) document.body.classList.add('msc-needs-header-space');
    client().then(async sb => {
      const update = session => {
        header.querySelectorAll('.msc-member').forEach(item => { item.hidden = !session; });
        header.querySelector('.msc-nav-login').hidden = !!session;
      };
      const { data } = await sb.auth.getSession(); update(data.session);
      sb.auth.onAuthStateChange((event, session) => update(session));
      logout.addEventListener('click', async () => {
        if (logout.disabled) return;
        logout.disabled = true; logout.textContent = 'Logging out…'; authError.hidden = true;
        try {
          const result = await sb.auth.signOut();
          if (result.error) throw result.error;
          update(null); close();
          window.location.assign('/');
        } catch (_) {
          authError.textContent = 'Could not log out. Please try again.'; authError.hidden = false;
        } finally { logout.disabled = false; logout.textContent = 'Log out'; }
      });
      window.dispatchEvent(new CustomEvent('msc:auth-ready', { detail: { client: sb } }));
      if (!window.MSCCareerProfile) await loadScript('/scripts/career-profile.js?v=20260927.5');
      if (window.MSCCareerProfile && window.MSCCareerProfile.initOnboarding) window.MSCCareerProfile.initOnboarding();
    }).catch(error => console.warn('MSC account navigation could not initialize:', error.message));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
