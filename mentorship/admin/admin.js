/* =============================================================================
   Mentorship admin console (/mentorship/admin/). Owner: admin builder.
   Staff only (mentorship_staff: admin | senior_mentor). Senior mentors get the same
   views read-only, except the staff note on a mentor. Everything else is SPEC.md §11.
   URL state: ?tab=overview|applications|mentors|matches|unmatched|switches|payouts|reviews|settings|staff
              ?mentor=<uuid> opens that mentor's review panel.
   ========================================================================== */
import {
  initPage, isMockMode, html, setContent, skeleton, emptyState, qs, PATHS, timeAgo, programLabel, plural,
} from '/mentorship/assets/mentorship-core.js?v=1';
import { load, invalidate, UUID_RE, sumBy } from './admin-shared.js?v=1';
import { renderOverview } from './admin-overview.js?v=1';
import { renderApplications, renderMentors } from './admin-mentors.js?v=1';
import { openMentorPanel } from './admin-mentor-panel.js?v=1';
import { renderMatches, renderUnmatched, renderSwitches, openMatchModal } from './admin-matches.js?v=1';
import { renderPayouts } from './admin-payouts.js?v=1';
import { renderReviews, renderSettings, renderStaff } from './admin-settings.js?v=1';

if (isMockMode()) await import('./mock.js?v=1');

const TABS = [
  { key: 'overview', label: 'Overview', icon: 'fa-gauge-high', render: renderOverview },
  { key: 'applications', label: 'Applications', icon: 'fa-inbox', render: renderApplications },
  { key: 'mentors', label: 'Mentors', icon: 'fa-user-graduate', render: renderMentors },
  { key: 'matches', label: 'Matches', icon: 'fa-link', render: renderMatches },
  { key: 'unmatched', label: 'Unmatched', icon: 'fa-user-clock', render: renderUnmatched },
  { key: 'switches', label: 'Switches', icon: 'fa-right-left', render: renderSwitches },
  { key: 'payouts', label: 'Payouts', icon: 'fa-indian-rupee-sign', render: renderPayouts },
  { key: 'reviews', label: 'Reviews', icon: 'fa-star', render: renderReviews },
  { key: 'settings', label: 'Settings', icon: 'fa-sliders', render: renderSettings },
  { key: 'staff', label: 'Staff', icon: 'fa-users-gear', render: renderStaff },
];
const TAB_ALIASES = { flags: 'overview', 'red-flags': 'overview', payout: 'payouts', switch: 'switches', config: 'settings' };

const main = document.getElementById('ms-main');
setContent(main, html`<div class="ms-container ms-container--wide ms-section">${skeleton('page')}</div>`);

/** Shared app object handed to every tab module. */
const app = {
  ctx: null,
  canWrite: false,
  tab: 'overview',
  token: 0,
  filters: {},            // per-tab filter memory while the page is open
  panel: null,
  isLive(token) { return token === app.token; },
  go(tab, opts) { return go(tab, opts); },
  refresh(opts) { return refresh(opts); },
  openMentor(id) { return openMentorPanel(id, app); },
  openMatch(m) { return openMatchModal(m, app); },
  setParam(name, value) {
    const u = new URL(location.href);
    if (value === null || value === undefined || value === '') u.searchParams.delete(name); else u.searchParams.set(name, value);
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  },
};

function normalizeTab(t) {
  const k = TAB_ALIASES[t] || t;
  return TABS.some((x) => x.key === k) ? k : 'overview';
}

/* ---------- gates --------------------------------------------------------- */

function renderGate({ icon, title, text, action }) {
  setContent(main, html`<div class="ms-container ms-container--narrow ms-section"><div class="ms-card">${emptyState({ icon, title, text, action })}</div></div>`);
}

/* ---------- frame --------------------------------------------------------- */

function renderFrame(ctx) {
  const roleLabel = ctx.isAdmin ? 'Admin' : 'Senior mentor';
  const mockToggle = isMockMode()
    ? html`<a class="ms-btn ms-btn--ghost ms-btn--sm" href="?staff=${ctx.isAdmin ? 'senior' : 'admin'}" title="Mock mode only"><i class="fas fa-flask" aria-hidden="true"></i><span>View as ${ctx.isAdmin ? 'senior mentor' : 'admin'}</span></a>`
    : '';
  setContent(main, html`
    <div class="ms-container ms-container--wide ms-admin">
      <div class="ms-pagehead">
        <div class="ms-pagehead__title">
          <span class="ms-eyebrow"><i class="fas fa-shield-halved" aria-hidden="true"></i> Team MSC</span>
          <h1 class="ms-h2">Mentorship admin</h1>
          <div class="ms-row ms-small ms-muted" style="--ms-gap:6px">
            <span>Signed in as ${ctx.name || ctx.email}</span>
            <span class="ms-badge ${ctx.isAdmin ? 'ms-tone-blue' : 'ms-tone-purple'}">${roleLabel}</span>
            <span id="adm-updated"></span>
          </div>
        </div>
        <div class="ms-row">
          ${mockToggle}
          <button type="button" class="ms-btn ms-btn--outline ms-btn--sm" id="adm-refresh"><i class="fas fa-rotate" aria-hidden="true"></i><span>Refresh</span></button>
        </div>
      </div>
      ${ctx.isAdmin ? '' : html`<div class="ms-callout ms-callout--gray ms-mt-8"><i class="fas fa-eye" aria-hidden="true"></i><span>You are viewing as a senior mentor. You can see everything and add staff notes on mentors. Approvals, reassignments, payouts and settings are done by an admin.</span></div>`}
      <div class="ms-admin-kpis" id="adm-kpis" aria-live="polite">${Array.from({ length: 6 }, () => html`<div class="ms-stat"><div class="ms-skel ms-skel--line" style="width:60%"></div><div class="ms-skel ms-skel--title ms-mt-8" style="width:40%"></div></div>`)}</div>
      <div class="ms-admin-tabbar">
        <div class="ms-tabs" role="tablist" aria-label="Admin sections" id="adm-tabs">
          ${TABS.map((t) => html`<button type="button" class="ms-tab" role="tab" id="adm-tab-${t.key}" aria-controls="adm-panel" aria-selected="false" data-tab="${t.key}"><i class="fas ${t.icon}" aria-hidden="true"></i>${t.label}<span class="ms-badge ms-admin-tabcount" data-count="${t.key}" hidden></span></button>`)}
        </div>
      </div>
      <section class="ms-admin-panel" id="adm-panel" role="tabpanel" tabindex="-1" aria-live="polite"></section>
    </div>`);
  app.panel = document.getElementById('adm-panel');

  document.getElementById('adm-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) go(b.dataset.tab);
  });
  document.getElementById('adm-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex((t) => t.key === app.tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    go(next.key);
    document.getElementById(`adm-tab-${next.key}`)?.focus();
  });
  document.getElementById('adm-refresh').addEventListener('click', () => refresh({ hard: true }));
  main.addEventListener('click', (e) => {
    const k = e.target.closest('a[data-go]');
    if (!k || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    e.preventDefault();
    go(k.dataset.go, { filter: k.dataset.filter || null });
  });
}

/* ---------- KPIs + tab counts --------------------------------------------- */

function stat({ label, icon, value, sub = '', tone = '', go: tab, filter = '' }) {
  return html`<a class="ms-stat ms-admin-kpi${tone ? ` ms-stat--${tone}` : ''}" href="?tab=${tab}" data-go="${tab}" data-filter="${filter}">
    <div class="ms-stat__label"><i class="fas ${icon}" aria-hidden="true"></i>${label}</div>
    <div class="ms-stat__value">${value}</div>
    ${sub ? html`<div class="ms-stat__sub" title="${sub}">${sub}</div>` : ''}
  </a>`;
}

function setCount(key, n, tone = 'gray') {
  const el = document.querySelector(`[data-count="${key}"]`);
  if (!el) return;
  if (!n) { el.hidden = true; return; }
  el.textContent = String(n);
  el.className = `ms-badge ms-admin-tabcount ms-tone-${tone}`;
  el.hidden = false;
}

async function refreshKpis() {
  const box = document.getElementById('adm-kpis');
  if (!box) return;
  const [ovR, mentorsR, activeR] = await Promise.allSettled([load.overview(), load.mentors(), load.matches('active')]);
  const ov = ovR.status === 'fulfilled' ? ovR.value : null;
  const mentors = mentorsR.status === 'fulfilled' ? mentorsR.value : [];
  const active = activeR.status === 'fulfilled' ? activeR.value : [];
  if (!ov) {
    setContent(box, html`<div class="ms-callout ms-callout--danger ms-admin-kpis__err"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span>Could not load the numbers: ${ovR.reason?.message || 'please refresh.'}</span></div>`);
    return;
  }
  const c = ov.counts || {};
  const ms = c.mentors || {};
  const flags = c.red_flags || {};
  const flagsOpen = Number(flags.high || 0) + Number(flags.medium || 0);
  const approvedRows = mentors.filter((m) => m.status === 'approved');
  const freeSlots = sumBy(approvedRows.filter((m) => m.accepting), (m) => Math.max(0, Number(m.max_mentees || 0) - Number(m.active_count || 0)));
  const reviewed = mentors.filter((m) => Number(m.review_count || 0) > 0 && m.rating_avg !== null && m.rating_avg !== undefined);
  const reviewCount = sumBy(reviewed, (m) => m.review_count);
  const reviewAvg = reviewCount ? sumBy(reviewed, (m) => Number(m.rating_avg) * Number(m.review_count)) / reviewCount : null;
  const recent = Date.now() - 14 * 86400000;
  const pulses = active.map((m) => m.last_pulse).filter((p) => p && Number(p.rating) > 0 && Date.parse(p.updated_at || p.created_at || 0) >= recent);
  const pulseAvg = pulses.length ? sumBy(pulses, (p) => p.rating) / pulses.length : null;
  const byProgram = Object.entries(c.matches_by_program || {}).filter(([, n]) => n > 0).map(([p, n]) => `${programLabel(p)} ${n}`).join(' · ');

  setContent(box, html`
    ${stat({ label: 'Mentors approved', icon: 'fa-user-check', value: ms.approved ?? 0, sub: `${ms.paused || 0} paused · ${freeSlots} free ${freeSlots === 1 ? 'slot' : 'slots'}`, go: 'mentors' })}
    ${stat({ label: 'Mentees matched', icon: 'fa-link', value: c.active_matches ?? 0, sub: byProgram || 'Active matches', go: 'matches' })}
    ${stat({ label: 'Waiting for a mentor', icon: 'fa-user-clock', value: c.unmatched ?? 0, sub: 'Enrolled, no mentor yet', tone: Number(c.unmatched) > 0 ? 'warn' : '', go: 'unmatched' })}
    ${stat({ label: 'Red flags open', icon: 'fa-flag', value: flagsOpen, sub: `${flags.high || 0} high · ${flags.medium || 0} medium`, tone: Number(flags.high) > 0 ? 'danger' : flagsOpen ? 'warn' : 'good', go: 'overview' })}
    ${stat({ label: 'Avg check-in rating', icon: 'fa-heart-pulse', value: pulseAvg === null ? '–' : html`${pulseAvg.toFixed(1)}<small> / 5</small>`, sub: `${pulses.length ? `${plural(pulses.length, 'mentee')}, last 14 days` : 'No check-ins in 14 days'}${reviewAvg === null ? '' : ` · reviews ${reviewAvg.toFixed(1)}`}`, tone: pulseAvg !== null && pulseAvg < 4 ? 'warn' : '', go: 'matches' })}
    ${stat({ label: 'Applications to review', icon: 'fa-inbox', value: ms.training_passed ?? 0, sub: `${ms.submitted || 0} doing training · ${plural(ms.draft || 0, 'draft')}`, tone: Number(ms.training_passed) > 0 ? 'warn' : '', go: 'applications' })}
  `);

  setCount('overview', flagsOpen, Number(flags.high) > 0 ? 'red' : 'amber');
  setCount('applications', Number(ms.training_passed || 0), 'purple');
  setCount('unmatched', Number(c.unmatched || 0), 'amber');
  setCount('switches', Number(c.switch_pending || 0), 'amber');
  setCount('payouts', Number(c.payouts?.due_count || 0), 'amber');
  const up = document.getElementById('adm-updated');
  if (up) up.textContent = ov.generated_at ? `Updated ${timeAgo(ov.generated_at)}` : '';
}

/* ---------- routing ------------------------------------------------------- */

function go(tab, { replace = true, filter = null, scroll = true } = {}) {
  const key = normalizeTab(tab);
  app.tab = key;
  app.token += 1;
  if (filter) app.filters[key] = { ...(app.filters[key] || {}), preset: filter };
  document.querySelectorAll('#adm-tabs [data-tab]').forEach((b) => {
    const on = b.dataset.tab === key;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    b.tabIndex = on ? 0 : -1;
    if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  if (replace) app.setParam('tab', key === 'overview' ? null : key);
  app.panel.setAttribute('aria-labelledby', `adm-tab-${key}`);
  const t = TABS.find((x) => x.key === key);
  const token = app.token;
  setContent(app.panel, skeleton('list', 4));
  if (scroll) {
    const bar = document.querySelector('.ms-admin-tabbar');
    if (bar && bar.getBoundingClientRect().top < 0) bar.scrollIntoView({ block: 'start' });
  }
  Promise.resolve(t.render(app.panel, app, token)).catch((e) => {
    if (!app.isLive(token)) return;
    console.warn('[mentorship admin]', e);
    setContent(app.panel, html`<div class="ms-callout ms-callout--danger"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span>${e?.message || 'Something went wrong. Please refresh.'}</span></div>`);
  });
}

/** Re-fetch and redraw. hard: drop every cache. */
async function refresh({ hard = false, kpis = true, tab = true } = {}) {
  if (hard) invalidate();
  if (kpis) refreshKpis();
  if (tab) go(app.tab, { scroll: false });
}

/* ---------- boot ---------------------------------------------------------- */

async function boot() {
  const ctx = await initPage({ active: 'admin', auth: true });
  if (!ctx.backendReady) {
    renderGate({ icon: 'fa-screwdriver-wrench', title: 'Mentorship is being set up', text: 'Mentorship is being set up. Please check back soon.' });
    return;
  }
  if (ctx.error) {
    renderGate({ icon: 'fa-wifi', title: 'Could not load your account', text: ctx.error.message || 'Please check your connection and refresh.', action: { label: 'Refresh', href: location.pathname + location.search } });
    return;
  }
  if (!ctx.isStaff) {
    renderGate({ icon: 'fa-lock', title: 'This page is for Team MSC', text: 'You are signed in, but this console is only for Team MSC admins and senior mentors. Your mentorship pages are one tap away.', action: { label: 'Go to Mentorship', href: PATHS.hub } });
    return;
  }
  app.ctx = ctx;
  app.canWrite = !!ctx.isAdmin;
  renderFrame(ctx);
  refreshKpis();
  go(normalizeTab(qs('tab')), { scroll: false });
  const mid = qs('mentor');
  if (mid && UUID_RE.test(mid)) openMentorPanel(mid, app);
}

boot().catch((e) => {
  console.warn('[mentorship admin]', e);
  renderGate({ icon: 'fa-circle-exclamation', title: 'Something went wrong', text: e?.message || 'Please refresh the page.', action: { label: 'Refresh', href: location.pathname + location.search } });
});
