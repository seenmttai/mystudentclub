/* Shared navigation for every MSC public page, including generated job pages. */
(function () {
  'use strict';
  if (window.self !== window.top || document.getElementById('msc-site-navigation')) return;
  const groups = [
    ['Free Resources', [['Industrial Training', '/ca-industrial-training-resources'], ['Articleship', '/articleship-resources'], ['CA Fresher', '/ca-fresher-training-resources'], ['Semi-Qualified CA', '/semi-qualified-ca-resources']]],
    ['Tools', [['CV Builder', '/cv-builder/'], ['CV Reviewer', '/cv-reviewer/'], ['AI Interview Bot', '/ai-interview']]],
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
    await loadScript('/scripts/supabase-init.js');
    return window.getSupabaseClient();
  }
  function init() {
    if (document.getElementById('msc-site-navigation')) return;
    document.documentElement.classList.add('msc-shared-navigation');
    const header = document.createElement('header'); header.id = 'msc-site-navigation';
    header.innerHTML = `<div class="msc-nav-shell"><a class="msc-nav-brand" href="/" aria-label="My Student Club home"><img src="/assets/logo.png" alt="My Student Club" width="200" height="36"></a><button class="msc-nav-toggle" type="button" aria-label="Open main menu" aria-expanded="false" aria-controls="msc-main-menu"><span aria-hidden="true">☰</span><span>Menu</span></button><nav id="msc-main-menu" aria-label="Main navigation"><a class="msc-nav-link" href="/">Jobs</a>${groups.map(([label, links]) => `<details class="msc-nav-group"><summary>${label}<span aria-hidden="true">⌄</span></summary><div class="msc-nav-dropdown">${links.map(([name, url]) => `<a href="${url}">${name}</a>`).join('')}</div></details>`).join('')}<a class="msc-nav-link" href="https://hire.mystudentclub.com">For Recruiters</a><div class="msc-nav-account"><a class="msc-nav-link msc-member" href="/learning-management-system/" hidden>My Courses</a><details class="msc-nav-group msc-nav-account-menu msc-member" hidden><summary>My Account<span aria-hidden="true">⌄</span></summary><div class="msc-nav-dropdown"><a href="/profile.html">My Profile</a><a href="/history.html">My Applications</a></div></details><a class="msc-nav-profile msc-member" href="/profile.html?onboarding=1" hidden>Complete Profile</a><a class="msc-nav-login" href="/login.html">Sign Up / Login</a></div></nav></div>`;
    document.body.prepend(header);
    // Move the original node so its notification handler, badge and popup keep working.
    const notifications = document.getElementById('notificationsBtn');
    if (notifications) header.querySelector('.msc-nav-account').append(notifications);
    const toggle = header.querySelector('.msc-nav-toggle');
    const close = () => { header.classList.remove('msc-nav-open'); toggle.setAttribute('aria-expanded', 'false'); };
    if (notifications) notifications.addEventListener('click', close);
    toggle.addEventListener('click', () => { const open = header.classList.toggle('msc-nav-open'); toggle.setAttribute('aria-expanded', String(open)); });
    header.querySelectorAll('details').forEach(detail => detail.addEventListener('toggle', () => {
      if (detail.open) header.querySelectorAll('details').forEach(other => { if (other !== detail) other.open = false; });
    }));
    document.addEventListener('click', event => { if (!header.contains(event.target)) { close(); header.querySelectorAll('details').forEach(item => { item.open = false; }); } });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); header.querySelectorAll('details').forEach(item => { item.open = false; }); toggle.focus(); } });
    header.querySelectorAll('a').forEach(link => { if (new URL(link.href).pathname === location.pathname && new URL(link.href).host === location.host) link.setAttribute('aria-current', 'page'); });
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
      window.dispatchEvent(new CustomEvent('msc:auth-ready', { detail: { client: sb } }));
      if (!window.MSCCareerProfile) await loadScript('/scripts/career-profile.js');
      if (window.MSCCareerProfile && window.MSCCareerProfile.initOnboarding) window.MSCCareerProfile.initOnboarding();
    }).catch(error => console.warn('MSC account navigation could not initialize:', error.message));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
