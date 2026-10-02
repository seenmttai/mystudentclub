/* =============================================================================
   Find a mentor (/mentorship/find/). Owner: student builder.
   Directory of approved mentors for a program, filters + sort, profile sheet
   (?mentor=<id>), booking sheet (mentorship_save_student -> mentorship_book) and
   the success screen. Spec: SPEC.md §9.1.
   ========================================================================== */
import {
  initPage, rpc, html, setContent, showError, skeleton, emptyState, qs, $, debounce, toast, openModal,
  loginUrl, PATHS, PROGRAMS, programLabel, enabledPrograms, getContext, getProfilePrefill, programCopy,
  DOMAINS, FIRM_TYPES, LANGUAGES, CITIES, STUDENT_COMMITMENTS, labelOf, firstName, plural,
  normalizePhone, isValidIndianMobile, isValidPersonName, formatPhone, waLink, safeUrl, track, LIMITS,
} from '/mentorship/assets/mentorship-core.js?v=1';
import {
  mentorCardHtml, mentorMiniHtml, openMentorProfile, filterCompaniesOf, searchHaystack, bayesRating, cityKeyFromText,
  STAGE_GROUPS, stageGroupOf, includesHtml, neverListHtml, notReadyHtml, errorStateHtml, DISCLAIMER, MENTOR_PROMISES,
} from '/mentorship/find/mentor-ui.js?v=1';

const main = document.getElementById('ms-main');
setContent(main, html`<div class="ms-container ms-section">${skeleton('page')}</div>`);

const ctx = await initPage({ active: 'find' });
const config = ctx.config || {};
const minReviews = Number(config.min_reviews_for_rating ?? 3);
const enabled = enabledPrograms(config);

const SORTS = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'rating', label: 'Highest rated' },
  { key: 'reviews', label: 'Most reviews' },
  { key: 'experience', label: 'Most experienced' },
  { key: 'slots', label: 'Most slots left' },
  { key: 'newest', label: 'Newest' },
];
const SENIORITY = { in_articleship: 1, final_articleship_done: 2, final_in_it: 3, final_it_done: 4, qualified_fresher: 5, qualified_experienced: 6 };
const EXP_RANK = { '1-2': 1, '2-3': 2, '3-5': 3, '5+': 4 };
const SET_FILTERS = ['domains', 'companies', 'stages', 'firmTypes', 'languages'];

const state = {
  program: enabled[0] || 'industrial-training',
  mentors: [],
  loaded: false,
  q: '',
  available: true,
  sort: 'recommended',
  domains: new Set(), companies: new Set(), stages: new Set(), firmTypes: new Set(), languages: new Set(), city: '',
  companyNames: new Map(),
  sheet: null,
  prefill: null,
};
const panel = document.createElement('div');
panel.className = 'ms-find-filters';
panel.id = 'find-filters';

/* ---- small helpers ---------------------------------------------------------- */

const matchFor = (p) => (ctx.activeMatches || []).find((x) => x.program === p) || null;
/** A finished (completed) or Team MSC-closed (ended) mentorship: no self-booking in that program. */
const closedFor = (p) => (matchFor(p) ? null : (ctx.closedMatches || []).find((x) => x.program === p) || null);
const enrolledIn = (p) => (ctx.enrolledPrograms || []).includes(p);
const programInfo = (p) => PROGRAMS[p] || PROGRAMS['industrial-training'];

function setParam(key, value) {
  const u = new URL(location.href);
  if (value === null || value === undefined || value === '') u.searchParams.delete(key);
  else u.searchParams.set(key, value);
  history.replaceState(history.state, '', u.pathname + u.search + u.hash);
}
function myMentorUrl(program) {
  return enabled.length > 1 ? `${PATHS.myMentor}?program=${encodeURIComponent(program)}` : PATHS.myMentor;
}

/** Which program to open: ?program= if enabled, else one the student can still book, else the first enabled. */
function pickProgram() {
  const asked = qs('program');
  if (asked && enabled.includes(asked)) return { program: asked, explicit: true };
  const open = enabled.find((p) => enrolledIn(p) && !matchFor(p) && !closedFor(p));
  const anyEnrolled = enabled.find((p) => enrolledIn(p));
  return { program: open || anyEnrolled || enabled[0], explicit: false };
}

/** Choose button state for a mentor (card + profile sheet). */
function chooseState(m) {
  const first = m.first_name || firstName(m.full_name);
  if (ctx.mentor?.id && ctx.mentor.id === m.id) return { label: 'This is you', disabled: true, title: 'You cannot book yourself' };
  if (matchFor(state.program)) return { label: 'Choose', sheetLabel: 'You already have a mentor', disabled: true, title: 'You already have a mentor for this program' };
  const closed = closedFor(state.program);
  if (closed) {
    return closed.status === 'completed'
      ? { label: 'Choose', sheetLabel: 'Your mentorship is complete', disabled: true, title: 'Your mentorship for this program is complete' }
      : { label: 'Choose', sheetLabel: 'Ask Team MSC for a mentor', disabled: true, title: 'Team MSC sets up your next mentor. Write to us from the contact page.' };
  }
  if (!enrolledIn(state.program)) return { label: 'Enrol to choose', href: programInfo(state.program).page };
  if (Array.isArray(m.programs) && m.programs.length && !m.programs.includes(state.program)) return { label: 'Not in this program', disabled: true };
  if (!m.available) return { label: m.accepting === false ? 'Not taking mentees' : 'Full', disabled: true };
  return { label: 'Choose', sheetLabel: `Choose ${first}`, action: 'choose' };
}

/* ---- logged-out, not-ready, closed ------------------------------------------ */

function renderLoggedOut() {
  const p = programInfo(enabled[0] || 'industrial-training');
  setContent(main, html`
    <section class="ms-hero ms-find-hero"><div class="ms-container"><div class="ms-hero__inner">
      <span class="ms-eyebrow"><i class="fas fa-user-group" aria-hidden="true"></i> MSC Mentorship</span>
      <h1 class="ms-h1">Find a senior who has done it</h1>
      <p class="ms-lead">MSC mentors are CA students and freshers who have done industrial training or articleship. Pick one, and they guide you on WhatsApp and on a weekly call, all the way to joining. Hojayega.</p>
      <div class="ms-btn-row ms-btn-row--stack">
        <a class="ms-btn ms-btn--primary ms-btn--lg" href="${loginUrl()}"><i class="fas fa-right-to-bracket" aria-hidden="true"></i><span>Log in to see mentors</span></a>
        <a class="ms-btn ms-btn--secondary ms-btn--lg" href="${PATHS.hub}"><span>How mentorship works</span></a>
      </div>
      <p class="ms-small ms-text-2">Mentor profiles open once you log in.</p>
    </div></div></section>
    <div class="ms-container ms-section ms-stack" style="--ms-gap:20px">
      <div class="ms-stack" style="--ms-gap:6px"><h2 class="ms-h2">What your mentor does</h2>
        <p class="ms-text-2">Every mentor has done the hunt themselves, signed every MSC mentor commitment and passed Team MSC's training.</p></div>
      ${includesHtml()}
      <div class="ms-grid ms-grid--2">
        <div class="ms-card ms-card--flat"><div class="ms-card__title ms-mb-8">Your mentor will never</div>${neverListHtml()}</div>
        <div class="ms-card ms-card--soft ms-stack" style="--ms-gap:8px">
          <div class="ms-card__title">Mentors are part of the ${p.name}</div>
          <p class="ms-small ms-text-2">Enrolled students pick their mentor here. Not enrolled yet? See what the program includes.</p>
          <div><a class="ms-btn ms-btn--secondary ms-btn--sm" href="${safeUrl(p.page)}"><span>See the program</span></a></div>
        </div>
      </div>
      <p class="ms-find-note"><i class="fas fa-shield-halved" aria-hidden="true"></i> ${DISCLAIMER}</p>
    </div>`);
}

function renderClosed() {
  setContent(main, html`<div class="ms-container ms-container--narrow ms-section"><div class="ms-card">
    ${emptyState({ icon: 'fa-door-closed', title: 'Mentor booking is not open right now', text: 'Team MSC opens mentorship program by program. Please check back soon.', action: { label: 'How mentorship works', href: PATHS.hub } })}
  </div></div>`);
}

/* ---- directory -------------------------------------------------------------- */

function renderShell() {
  const p = programInfo(state.program);
  setContent(main, html`
    <section class="ms-hero ms-find-hero"><div class="ms-container"><div class="ms-hero__inner">
      <span class="ms-eyebrow"><i class="fas fa-user-group" aria-hidden="true"></i> <span id="find-eyebrow">${p.label} mentors</span></span>
      <h1 class="ms-h1">Find your mentor</h1>
      <p class="ms-lead" id="find-lead">${leadText(state.program)}</p>
    </div></div></section>
    <div class="ms-container ms-find-wrap">
      <div id="find-banner"></div>
      <div id="find-tabs"></div>
      <div class="ms-filterbar ms-find-bar">
        <div class="ms-row ms-row--nowrap">
          <label class="ms-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><span class="ms-sr-only">Search mentors</span>
            <input class="ms-input" type="search" id="find-q" placeholder="Search company, domain or name" autocomplete="off" enterkeyhint="search"></label>
          <button type="button" class="ms-btn ms-btn--outline ms-find-filter-btn" id="find-filter-btn" aria-haspopup="dialog">
            <i class="fas fa-sliders" aria-hidden="true"></i><span>Filters</span><span class="ms-find-filter-count" id="find-filter-count" hidden>0</span></button>
        </div>
        <div class="ms-scroll-x ms-find-active" id="find-active"></div>
      </div>
      <div class="ms-layout ms-find-layout">
        <aside class="ms-layout__aside ms-find-aside" id="find-aside" aria-label="Filters"><div class="ms-card ms-find-aside__card" id="find-aside-card"></div></aside>
        <section class="ms-find-results" aria-label="Mentors">
          <div class="ms-row ms-between ms-find-results-head">
            <p class="ms-small ms-text-2" id="find-count" aria-live="polite"></p>
            <label class="ms-find-sort"><span>Sort</span>
              <select class="ms-select" id="find-sort">${SORTS.map((s) => html`<option value="${s.key}"${s.key === state.sort ? ' selected' : ''}>${s.label}</option>`)}</select></label>
          </div>
          <div id="find-grid">${skeleton('cards', 4)}</div>
        </section>
      </div>
      <p class="ms-find-note ms-mt-24"><i class="fas fa-shield-halved" aria-hidden="true"></i> ${DISCLAIMER}</p>
    </div>`);
  $('#find-aside-card').appendChild(panel);
  renderTabs();
  renderBanner();

  $('#find-q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim().toLowerCase(); renderResults(); }, 180));
  $('#find-sort').addEventListener('change', (e) => { state.sort = e.target.value; renderResults(); });
  $('#find-filter-btn').addEventListener('click', openFilterSheet);
  $('#find-active').addEventListener('click', onActiveChipClick);
  $('#find-grid').addEventListener('click', onGridClick);
  $('#find-tabs').addEventListener('click', onTabClick);
}

function leadText(program) {
  return `${programCopy(program).findLead} Pick one, and they message you on WhatsApp within 24 hours. Hojayega.`;
}

function renderTabs() {
  const box = $('#find-tabs');
  if (!box) return;
  if (enabled.length < 2) { setContent(box, ''); return; }
  setContent(box, html`<div class="ms-tabs ms-find-tabs" role="tablist" aria-label="Program">${enabled.map((p) => html`
    <button type="button" class="ms-tab${p === state.program ? ' is-active' : ''}" role="tab" aria-selected="${p === state.program ? 'true' : 'false'}" data-program="${p}">
      ${programLabel(p)}${matchFor(p) ? html` <span class="ms-badge ms-tone-green">Matched</span>` : ''}</button>`)}</div>`);
}

function renderBanner() {
  const box = $('#find-banner');
  if (!box) return;
  const p = programInfo(state.program);
  const lead = $('#find-lead');
  if (lead) lead.textContent = leadText(state.program);
  const eyebrow = $('#find-eyebrow');
  if (eyebrow) eyebrow.textContent = `${p.label} mentors`;
  const match = matchFor(state.program);
  const closed = closedFor(state.program);
  if (closed) {
    const done = closed.status === 'completed';
    setContent(box, html`<div class="ms-callout ${done ? 'ms-callout--success' : 'ms-callout--gray'} ms-find-banner"><i class="fas ${done ? 'fa-flag-checkered' : 'fa-circle-info'}" aria-hidden="true"></i>
      <div class="ms-grow"><span class="ms-callout__title">${done ? `Your ${p.label} mentorship is complete` : `Your ${p.label} mentorship was closed`}</span>
        ${done ? 'Congratulations! You can look around, but each program comes with one mentorship.' : 'Team MSC sets up your next mentor with you. Write to us and we will help.'}
        <div class="ms-mt-8"><a class="ms-btn ms-btn--outline ms-btn--sm" href="${done ? myMentorUrl(state.program) : PATHS.contact}"><span>${done ? 'Open My mentor' : 'Contact Team MSC'}</span></a></div></div></div>`);
    return;
  }
  if (match) {
    const m = state.mentors.find((x) => x.id === match.mentor_id);
    setContent(box, html`<div class="ms-callout ms-callout--success ms-find-banner"><i class="fas fa-circle-check" aria-hidden="true"></i>
      <div class="ms-grow"><span class="ms-callout__title">You are matched with ${m ? m.full_name : 'your mentor'}</span>
        You can look around, but you have your ${p.label} mentor already. Need a change? Ask from My mentor.
        <div class="ms-mt-8"><a class="ms-btn ms-btn--success ms-btn--sm" href="${myMentorUrl(state.program)}"><span>Open My mentor</span></a></div></div></div>`);
    return;
  }
  if (!enrolledIn(state.program)) {
    setContent(box, html`<div class="ms-card ms-find-upsell">
      <span class="ms-find-upsell__icon"><i class="fas fa-graduation-cap" aria-hidden="true"></i></span>
      <div class="ms-stack" style="--ms-gap:8px">
        <strong class="ms-find-upsell__title">Mentors are part of the ${p.name}</strong>
        <p class="ms-small ms-text-2">Enrol in the program to pick your mentor. Until then, look around: every mentor below has been through the ${p.label.toLowerCase()} hunt.</p>
        <div class="ms-btn-row"><a class="ms-btn ms-btn--primary ms-btn--sm" href="${safeUrl(p.page)}"><span>See the program</span></a></div>
        <p class="ms-xs ms-muted">Already enrolled? It can take a few minutes to show here. Refresh the page, or <a class="ms-link" href="${PATHS.contact}">contact us</a>.</p>
      </div></div>`);
    return;
  }
  setContent(box, html`<ol class="ms-find-steps" aria-label="How it works">
    <li><span>1</span>Pick a senior who has done it</li>
    <li><span>2</span>WhatsApp from them within 24 hours</li>
    <li><span>3</span>A call every week until you join</li></ol>`);
}

/* ---- data ------------------------------------------------------------------- */

async function loadMentors() {
  const grid = $('#find-grid');
  if (grid) setContent(grid, skeleton('cards', 4));
  setContent($('#find-count'), '');
  try {
    const list = await rpc('mentorship_list_mentors', { p_program: state.program });
    state.mentors = (Array.isArray(list) ? list : []).map((m, i) => ({
      ...m,
      _i: i,
      _hay: searchHaystack(m),
      _companies: filterCompaniesOf(m).map((c) => c.toLowerCase()),
      _group: stageGroupOf(m.stage),
      _domains: [...new Set([...(m.domains || []), m.it_domain].filter(Boolean))],
      _city: String(m.city || '').toLowerCase(),
    }));
    state.loaded = true;
  } catch (e) {
    state.mentors = [];
    state.loaded = false;
    if (grid) {
      setContent(grid, html`<div class="ms-card">${emptyState({ icon: 'fa-circle-exclamation', title: 'We could not load mentors', text: e.message, action: { label: 'Try again', id: 'find-retry' } })}</div>`);
    }
    renderFilters();
    return;
  }
  renderBanner();
  renderFilters();
  renderResults();
}

/** Facet counts over the whole list: [[key, count], ...] sorted by count. */
function facet(getKeys) {
  const counts = new Map();
  state.mentors.forEach((m) => new Set(getKeys(m).filter(Boolean)).forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function choiceGroup(title, name, options, { limit = 0 } = {}) {
  const selected = state[name];
  if (options.length < 2 && !options.some((o) => selected.has(o.value))) return '';
  const shown = limit ? options.slice(0, limit) : options;
  selected.forEach((v) => { if (!shown.some((o) => o.value === v)) { const o = options.find((x) => x.value === v); if (o) shown.push(o); } });
  return html`<fieldset class="ms-fieldset"><legend class="ms-label">${title}</legend><div class="ms-choices">${shown.map((o) => html`
    <label class="ms-choice"><input type="checkbox" name="${name}" value="${o.value}"${selected.has(o.value) ? ' checked' : ''}><span>${o.label}<em class="ms-find-n">${o.n}</em></span></label>`)}</div></fieldset>`;
}

function renderFilters() {
  state.companyNames = new Map();
  state.mentors.forEach((m) => filterCompaniesOf(m).forEach((c) => { if (!state.companyNames.has(c.toLowerCase())) state.companyNames.set(c.toLowerCase(), c); }));
  const domains = facet((m) => m._domains).map(([k, n]) => ({ value: k, label: labelOf(DOMAINS, k), n }));
  const companies = facet((m) => m._companies).map(([k, n]) => ({ value: k, label: state.companyNames.get(k) || k, n }));
  const groupCounts = new Map(facet((m) => [m._group]));
  const stages = STAGE_GROUPS.filter((g) => groupCounts.has(g.key)).map((g) => ({ value: g.key, label: g.label, n: groupCounts.get(g.key) }));
  const firmCounts = new Map(facet((m) => [m.articleship_firm_type]));
  const firms = FIRM_TYPES.filter((f) => firmCounts.has(f.key)).map((f) => ({ value: f.key, label: f.label, n: firmCounts.get(f.key) }));
  const langs = facet((m) => m.languages || []).map(([k, n]) => ({ value: k, label: labelOf(LANGUAGES, k), n }));
  const cityLabels = new Map();
  state.mentors.forEach((m) => { if (m._city && !cityLabels.has(m._city)) cityLabels.set(m._city, labelOf(CITIES, m.city)); });
  const cities = facet((m) => [m._city]).map(([k, n]) => ({ value: k, label: cityLabels.get(k) || k, n }));

  if (!state.mentors.length) {
    setContent(panel, html`<p class="ms-small ms-muted">Filters appear once mentors are listed.</p>`);
    return;
  }
  setContent(panel, html`
    <div class="ms-row ms-between ms-find-filters__head"><h2 class="ms-h3">Filters</h2>
      <button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-action="reset"><span>Reset all</span></button></div>
    ${choiceGroup('Domain', 'domains', domains)}
    ${choiceGroup('Company', 'companies', companies, { limit: 10 })}
    ${choiceGroup('Mentor stage', 'stages', stages)}
    ${choiceGroup('Articleship firm type', 'firmTypes', firms)}
    ${cities.length > 1 || state.city ? html`<div class="ms-field"><label class="ms-label" for="find-city">City</label>
      <select class="ms-select" id="find-city"><option value="">All cities</option>${cities.map((c) => html`<option value="${c.value}"${c.value === state.city ? ' selected' : ''}>${c.label} (${c.n})</option>`)}</select></div>` : ''}
    ${choiceGroup('Language', 'languages', langs)}`);
}

panel.addEventListener('change', (e) => {
  const t = e.target;
  if (SET_FILTERS.includes(t.name)) {
    if (t.checked) state[t.name].add(t.value); else state[t.name].delete(t.value);
  } else if (t.id === 'find-city') state.city = t.value;
  renderResults();
});
panel.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="reset"]')) { resetFilters(); renderFilters(); renderResults(); }
});

function resetFilters({ keepAvailable = false } = {}) {
  SET_FILTERS.forEach((k) => state[k].clear());
  state.city = '';
  if (!keepAvailable) state.available = true;
}
function activeFilterCount() {
  return SET_FILTERS.reduce((n, k) => n + state[k].size, 0) + (state.city ? 1 : 0);
}

function passes(m, { ignoreAvailable = false } = {}) {
  if (state.available && !ignoreAvailable && !m.available) return false;
  if (state.q && !state.q.split(/\s+/).every((t) => m._hay.includes(t))) return false;
  if (state.domains.size && !m._domains.some((d) => state.domains.has(d))) return false;
  if (state.companies.size && !m._companies.some((c) => state.companies.has(c))) return false;
  if (state.stages.size && !state.stages.has(m._group)) return false;
  if (state.firmTypes.size && !state.firmTypes.has(m.articleship_firm_type)) return false;
  if (state.languages.size && !(m.languages || []).some((l) => state.languages.has(l))) return false;
  if (state.city && m._city !== state.city) return false;
  return true;
}

function sorter(key) {
  const avail = (a, b) => Number(!!b.available) - Number(!!a.available);
  const rated = (m) => ((Number(m.review_count) || 0) >= minReviews ? Number(m.rating_avg) || 0 : 0);
  const by = {
    recommended: (a, b) => bayesRating(b) - bayesRating(a),
    rating: (a, b) => rated(b) - rated(a) || (b.review_count || 0) - (a.review_count || 0),
    reviews: (a, b) => (b.review_count || 0) - (a.review_count || 0) || bayesRating(b) - bayesRating(a),
    experience: (a, b) => (SENIORITY[b.stage] || 0) - (SENIORITY[a.stage] || 0) || (EXP_RANK[b.experience_years] || 0) - (EXP_RANK[a.experience_years] || 0) || (b.mentees_total || 0) - (a.mentees_total || 0),
    slots: (a, b) => (b.slots_left || 0) - (a.slots_left || 0),
    newest: (a, b) => String(b.approved_at || '').localeCompare(String(a.approved_at || '')),
  }[key] || (() => 0);
  return (a, b) => avail(a, b) || by(a, b) || a._i - b._i;
}

function renderResults() {
  const grid = $('#find-grid');
  if (!grid) return;
  const list = state.mentors.filter((m) => passes(m)).sort(sorter(state.sort));
  const label = programInfo(state.program).label;
  if (state.loaded) {
    setContent($('#find-count'), list.length ? plural(list.length, 'mentor') : '');
  }
  if (!state.loaded) { /* error state already shown */ } else if (!state.mentors.length) {
    setContent(grid, html`<div class="ms-card">${emptyState({ icon: 'fa-user-clock', title: 'Mentors are being onboarded', text: `${label} mentors are being approved right now. Please check back in a day or two.` })}</div>`);
  } else if (!list.length) {
    const fullOnly = state.available && state.mentors.some((m) => passes(m, { ignoreAvailable: true }));
    setContent(grid, html`<div class="ms-card">${fullOnly
      ? emptyState({ icon: 'fa-hourglass-half', title: 'Matching mentors are full right now', text: 'Slots open up as mentees finish. You can still see full mentors, or try other filters.', action: { label: 'Show full mentors too', id: 'find-show-full' } })
      : emptyState({ icon: 'fa-filter-circle-xmark', title: 'No mentors match these filters', text: 'Try fewer filters or a different search.', action: { label: 'Reset filters', id: 'find-reset' } })}</div>`);
  } else {
    setContent(grid, html`<div class="ms-grid ms-grid--auto ms-find-grid">${list.map((m) => mentorCardHtml(m, { choose: chooseState(m), minReviews }))}</div>`);
  }
  renderActiveChips();
  const n = activeFilterCount();
  const badge = $('#find-filter-count');
  if (badge) { badge.hidden = !n; badge.textContent = String(n); }
  $('#find-filter-btn')?.setAttribute('aria-label', n ? `Filters, ${n} active` : 'Filters');
  if (state.sheet) {
    const btn = state.sheet.buttons[1];
    if (btn) btn.textContent = list.length ? `Show ${plural(list.length, 'mentor')}` : 'No mentors match';
  }
}

function renderActiveChips() {
  const box = $('#find-active');
  if (!box) return;
  const chip = (group, value, label) => html`<button type="button" class="ms-find-chip ms-find-chip--on" data-remove="${group}" data-value="${value}" aria-label="Remove filter ${label}"><span>${label}</span><i class="fas fa-xmark" aria-hidden="true"></i></button>`;
  const stageLabelOf = (k) => STAGE_GROUPS.find((g) => g.key === k)?.label || k;
  const chips = [
    ...[...state.domains].map((k) => chip('domains', k, labelOf(DOMAINS, k))),
    ...[...state.companies].map((k) => chip('companies', k, state.companyNames.get(k) || k)),
    ...[...state.stages].map((k) => chip('stages', k, stageLabelOf(k))),
    ...[...state.firmTypes].map((k) => chip('firmTypes', k, labelOf(FIRM_TYPES, k))),
    ...(state.city ? [chip('city', state.city, labelOf(CITIES, state.city) || state.city)] : []),
    ...[...state.languages].map((k) => chip('languages', k, labelOf(LANGUAGES, k))),
  ];
  setContent(box, html`<button type="button" class="ms-find-chip" data-toggle="available" aria-pressed="${state.available ? 'true' : 'false'}">
      <i class="fas ${state.available ? 'fa-square-check' : 'fa-square'}" aria-hidden="true"></i><span>Free slots only</span></button>${chips}`);
}

function onActiveChipClick(e) {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.toggle === 'available') state.available = !state.available;
  else if (b.dataset.remove === 'city') state.city = '';
  else if (SET_FILTERS.includes(b.dataset.remove)) state[b.dataset.remove].delete(b.dataset.value);
  else return;
  renderFilters();
  renderResults();
}

function onGridClick(e) {
  const b = e.target.closest('button[data-action], button[id]');
  if (!b) return;
  if (b.id === 'find-retry') { loadMentors(); return; }
  if (b.id === 'find-reset') { resetFilters({ keepAvailable: true }); state.q = ''; const q = $('#find-q'); if (q) q.value = ''; renderFilters(); renderResults(); return; }
  if (b.id === 'find-show-full') { state.available = false; renderResults(); return; }
  const m = state.mentors.find((x) => x.id === b.dataset.id);
  if (b.dataset.action === 'profile') openProfile(b.dataset.id, m);
  if (b.dataset.action === 'choose' && m) openBooking(m);
}

function onTabClick(e) {
  const b = e.target.closest('[data-program]');
  if (!b || b.dataset.program === state.program) return;
  state.program = b.dataset.program;
  setParam('program', state.program);
  resetFilters();
  renderTabs();
  renderBanner();
  loadMentors();
}

function openFilterSheet() {
  const home = $('#find-aside-card');
  const modal = openModal({
    title: 'Filters',
    body: panel,
    actions: [
      { label: 'Reset', variant: 'ghost', onClick: () => { resetFilters(); renderFilters(); renderResults(); return false; } },
      { label: 'Show mentors', variant: 'primary' },
    ],
    onClose: () => { state.sheet = null; home?.appendChild(panel); },
  });
  modal.el.classList.add('ms-find-filter-sheet');
  state.sheet = modal;
  renderResults();
}

/* ---- profile sheet ------------------------------------------------------------ */

function openProfile(id, preview = null) {
  if (!id) return;
  setParam('mentor', id);
  openMentorProfile(id, {
    minReviews,
    preview,
    choose: chooseState,
    onChoose: (m) => openBooking(state.mentors.find((x) => x.id === m.id) || m),
    onClose: () => setParam('mentor', null),
  });
}

/* ---- booking ------------------------------------------------------------------ */

function fieldHtml({ id, label, req = false, hint = '', error = '', control }) {
  return html`<div class="ms-field" data-field="${id}">
    <label class="ms-label" for="${id}"><span class="${req ? 'ms-req' : ''}">${label}</span></label>
    ${control}
    ${hint ? html`<span class="ms-hint">${hint}</span>` : ''}
    <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span>${error}</span></span>
  </div>`;
}

function setInvalid(form, field, invalid, message) {
  const el = form.querySelector(`[data-field="${field}"]`);
  if (!el) return;
  el.classList.toggle('is-invalid', !!invalid);
  if (message) { const t = el.querySelector('.ms-error > span'); if (t) t.textContent = message; }
}

async function getPrefill() {
  if (ctx.student) return { name: ctx.student.full_name || ctx.name || '', phone: ctx.student.whatsapp || '', city: ctx.student.city || '' };
  if (!state.prefill) state.prefill = getProfilePrefill().catch(() => ({}));
  const p = await state.prefill;
  return { name: p.name || ctx.name || '', phone: p.phone || '', city: p.city || '' };
}

async function openBooking(m) {
  const st = chooseState(m);
  if (st.href) { location.href = st.href; return; }
  if (st.disabled) { toast(st.title || 'This mentor cannot be chosen right now.', { type: 'warn' }); return; }
  track('mentorship_book_start', { program: state.program });
  const pre = await getPrefill();
  const phone = normalizePhone(pre.phone);
  const city = cityKeyFromText(pre.city);
  const first = m.first_name || firstName(m.full_name);
  const prog = programInfo(state.program);

  const body = document.createElement('div');
  setContent(body, html`<div class="ms-stack ms-find-book" style="--ms-gap:18px">
    <div tabindex="-1" autofocus class="ms-find-book__focus">${mentorMiniHtml(m)}</div>
    <section>
      <h3 class="ms-find-profile__h">What happens next</h3>
      <ol class="ms-timeline ms-find-timeline ms-mt-8">
        <li><div class="ms-timeline__title">${first} gets your details today</div><div class="ms-timeline__meta">Your name, WhatsApp number and email. You both get an email too.</div></li>
        <li><div class="ms-timeline__title">A WhatsApp from ${first} within 24 hours</div><div class="ms-timeline__meta">Save the number. Keep your CV and the domains you like ready.</div></li>
        <li><div class="ms-timeline__title">Your first call this week</div><div class="ms-timeline__meta">Your stage, target domains and where you have applied so far.</div></li>
        <li class="is-good"><div class="ms-timeline__title">Every week until you join</div><div class="ms-timeline__meta">A call, CV review, a mock interview and the right MSC resources.</div></li>
      </ol>
    </section>
    <details class="ms-acc"><summary>What ${first} has promised MSC students</summary><div class="ms-acc__body">
      <ul class="ms-find-promises">${MENTOR_PROMISES.map((t) => html`<li><i class="fas fa-check" aria-hidden="true"></i><span>${t}</span></li>`)}
        <li class="is-never"><i class="fas fa-xmark" aria-hidden="true"></i><span>Never asks for money, sells a course or promises a job</span></li></ul>
    </div></details>
    <form class="ms-form" id="book-form" novalidate>
      <div class="ms-form-section__title"><i class="fas fa-id-card" aria-hidden="true"></i>Your details for ${first}</div>
      <div id="book-alert"></div>
      <div class="ms-form-grid">
        ${fieldHtml({ id: 'bk-name', label: 'Your full name', req: true, error: 'Please enter your name, in letters only.', control: html`<input class="ms-input" id="bk-name" name="name" autocomplete="name" maxlength="${LIMITS.full_name}" value="${pre.name}">` })}
        ${fieldHtml({ id: 'bk-wa', label: 'Your WhatsApp number', req: true, hint: `Only ${first} and Team MSC see this.`, error: 'Enter a 10-digit Indian mobile number.', control: html`<div class="ms-input-group"><span class="ms-input-group__addon">+91</span><input class="ms-input" id="bk-wa" name="whatsapp" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="14" placeholder="98765 43210" value="${phone ? phone.slice(-10) : ''}"></div>` })}
        ${fieldHtml({ id: 'bk-city', label: 'City (optional)', error: 'Keep the city under 40 characters.', control: html`<select class="ms-select" id="bk-city" name="city"><option value="">Select your city</option>${CITIES.map((c) => html`<option value="${c.key}"${c.key === city.key ? ' selected' : ''}>${c.label}</option>`)}</select>
          <input class="ms-input ms-mt-8" id="bk-city-other" name="city_other" maxlength="40" placeholder="Your city" value="${city.other}"${city.key === 'other' ? '' : ' hidden'}>` })}
      </div>
      <fieldset class="ms-fieldset ms-field" data-field="bk-commit"><legend class="ms-label"><span class="ms-req">Before you confirm</span></legend>
        ${STUDENT_COMMITMENTS.map((c) => html`<label class="ms-check"><input type="checkbox" name="commit" value="${c.key}"><span class="ms-check__box"></span><span class="ms-check__text"><strong>${c.title}</strong></span></label>`)}
        <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span>Please tick each one to continue.</span></span>
      </fieldset>
      <p class="ms-find-note"><i class="fas fa-shield-halved" aria-hidden="true"></i> ${DISCLAIMER}</p>
    </form>
  </div>`);
  const form = body.querySelector('#book-form');
  const citySel = body.querySelector('#bk-city');
  const cityOther = body.querySelector('#bk-city-other');
  citySel.addEventListener('change', () => { cityOther.hidden = citySel.value !== 'other'; if (!cityOther.hidden) cityOther.focus(); });
  form.addEventListener('input', (e) => {
    const f = e.target.closest('[data-field]');
    if (f?.classList.contains('is-invalid')) f.classList.remove('is-invalid');
  });
  form.addEventListener('change', (e) => {
    if (e.target.name === 'commit' && [...form.querySelectorAll('[name="commit"]')].every((x) => x.checked)) setInvalid(form, 'bk-commit', false);
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); modal.buttons[1]?.click(); });

  const modal = openModal({
    title: `Choose ${first} as your mentor`,
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      { label: `Confirm ${first} as my mentor`, variant: 'primary', onClick: () => submitBooking(m, form) },
    ],
  });
  modal.el.classList.add('ms-find-book-modal');
}

function readBooking(form) {
  const name = form.querySelector('#bk-name').value.trim().replace(/\s+/g, ' ');
  const wa = form.querySelector('#bk-wa').value;
  const cityKey = form.querySelector('#bk-city').value;
  const cityOther = form.querySelector('#bk-city-other').value.trim();
  const commits = [...form.querySelectorAll('[name="commit"]')];
  const errors = [];
  if (name.length < 2 || name.length > LIMITS.full_name || !isValidPersonName(name)) errors.push('bk-name');
  if (!isValidIndianMobile(wa)) errors.push('bk-wa');
  if (cityKey === 'other' && cityOther.length > 40) errors.push('bk-city');
  if (!commits.every((c) => c.checked)) errors.push('bk-commit');
  ['bk-name', 'bk-wa', 'bk-city', 'bk-commit'].forEach((f) => setInvalid(form, f, errors.includes(f)));
  if (errors.length) {
    const el = form.querySelector(`[data-field="${errors[0]}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el?.querySelector('input, select')?.focus({ preventScroll: true });
    return null;
  }
  const city = cityKey === 'other' ? cityOther : cityKey;
  return { name, whatsapp: normalizePhone(wa), city: city || null };
}

async function submitBooking(m, form) {
  setContent(form.querySelector('#book-alert'), '');
  const data = readBooking(form);
  if (!data) return false;
  try {
    const student = await rpc('mentorship_save_student', { p_full_name: data.name, p_whatsapp: data.whatsapp, p_city: data.city });
    ctx.student = { full_name: student?.full_name || data.name, whatsapp: student?.whatsapp || data.whatsapp, city: student?.city ?? data.city };
    const match = await rpc('mentorship_book', { p_mentor_id: m.id, p_program: state.program });
    track('mentorship_booked', { program: state.program });
    renderSuccess(match, m);
    return true;
  } catch (e) {
    return handleBookError(e, form);
  }
}

function handleBookError(e, form) {
  const alert = form.querySelector('#book-alert');
  const prog = programInfo(state.program);
  switch (e?.code) {
    case 'mentor_full':
    case 'mentor_unavailable':
      toast(e.message, { type: 'warn', timeout: 6000 });
      loadMentors();
      return true;
    case 'already_matched':
    case 'mentorship_completed':
    case 'mentorship_ended':
      toast(e.message, { type: 'info', timeout: 6000 });
      setTimeout(() => { location.href = myMentorUrl(state.program); }, 1200);
      return true;
    case 'not_enrolled':
      setContent(alert, html`<div class="ms-callout ms-callout--warn"><i class="fas fa-graduation-cap" aria-hidden="true"></i><div>
        <span class="ms-callout__title">Mentors are part of the ${prog.name}</span>Enrol in the program to choose your mentor.
        <div class="ms-mt-8"><a class="ms-btn ms-btn--primary ms-btn--sm" href="${safeUrl(prog.page)}"><span>See the program</span></a></div></div></div>`);
      alert.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    case 'student_profile_missing':
      setInvalid(form, 'bk-wa', true, 'Add your WhatsApp number so your mentor can reach you.');
      return false;
    case 'invalid_input': {
      const hint = String(e.hint || '');
      const field = /name/.test(hint) ? 'bk-name' : /city/.test(hint) ? 'bk-city' : /whatsapp|phone|mobile/.test(hint) ? 'bk-wa' : '';
      if (field) setInvalid(form, field, true);
      else showError(e);
      return false;
    }
    case 'program_closed':
    case 'cannot_book_self':
      toast(e.message, { type: 'warn' });
      return true;
    case 'not_logged_in':
    case 'session_expired':
      toast(e.message, { type: 'warn' });
      setTimeout(() => { location.href = loginUrl(); }, 900);
      return false;
    default:
      showError(e);
      return false;
  }
}

function renderSuccess(match, picked) {
  const mentor = { ...picked, ...(match?.mentor || {}) };
  const first = mentor.first_name || firstName(mentor.full_name);
  const prog = programInfo(match?.program || state.program);
  const studentName = ctx.student?.full_name || ctx.name || '';
  const hello = `Hi ${first}, this is ${studentName || 'your new mentee'} from My Student Club. You are my mentor for ${prog.label}!`;
  const wa = waLink(mentor.whatsapp, hello);
  setParam('mentor', null);
  setContent(main, html`<div class="ms-container ms-container--narrow ms-section">
    <div class="ms-card ms-find-success">
      <div class="ms-find-success__icon" aria-hidden="true"><i class="fas fa-check"></i></div>
      <span class="ms-eyebrow">Matched · ${prog.label}</span>
      <h1 class="ms-h2">You are matched with ${mentor.full_name}!</h1>
      <p class="ms-lead">${first} will message you on WhatsApp within 24 hours. You will also get an email with their details.</p>
      <div class="ms-find-success__mentor">${mentorMiniHtml(mentor, { extra: mentor.whatsapp ? html`<div class="ms-small ms-mt-8"><i class="fab fa-whatsapp" aria-hidden="true"></i> ${formatPhone(mentor.whatsapp)}</div>` : '' })}</div>
      <div class="ms-btn-row ms-btn-row--stack">
        ${wa ? html`<a class="ms-btn ms-btn--whatsapp ms-btn--lg" href="${wa}" target="_blank" rel="noopener"><i class="fab fa-whatsapp" aria-hidden="true"></i><span>Say hi to ${first}</span></a>` : ''}
        <a class="ms-btn ms-btn--secondary ms-btn--lg" href="${myMentorUrl(prog.key)}"><span>Go to My mentor</span></a>
      </div>
      <div class="ms-hojayega">Save ${first}'s number now, keep your latest CV ready, and list where you have applied so far. Your first call happens this week.</div>
      <ol class="ms-timeline ms-find-timeline ms-find-success__next">
        <li><div class="ms-timeline__title">Within 24 hours</div><div class="ms-timeline__meta">${first} sends you an intro on WhatsApp.</div></li>
        <li><div class="ms-timeline__title">This week</div><div class="ms-timeline__meta">Your first call: stage, target domains, applications.</div></li>
        <li><div class="ms-timeline__title">Every Saturday</div><div class="ms-timeline__meta">A 30-second check-in on My mentor. Your answers go to Team MSC, not to your mentor.</div></li>
      </ol>
    </div>
  </div>`);
  window.scrollTo({ top: 0, behavior: 'smooth' });
  getContext({ force: true }).catch(() => {});
}

/* ---- start -------------------------------------------------------------------- */

async function start() {
  const { program, explicit } = pickProgram();
  state.program = program;
  if ((matchFor(program) || closedFor(program)) && !explicit && !qs('mentor') && qs('browse') !== '1') {
    location.replace(myMentorUrl(program));
    return;
  }
  if (!ctx.student) state.prefill = getProfilePrefill().catch(() => ({}));
  renderShell();
  await loadMentors();
  const deep = qs('mentor');
  if (deep) openProfile(deep, state.mentors.find((m) => m.id === deep) || null);
}

document.addEventListener('click', (e) => { if (e.target.closest('#ms-retry')) location.reload(); });

if (!ctx.backendReady) setContent(main, notReadyHtml());
else if (!ctx.user) renderLoggedOut();
else if (ctx.error) setContent(main, errorStateHtml(ctx.error));
else if (!enabled.length) renderClosed();
else await start();
