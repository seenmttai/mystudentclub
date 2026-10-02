/* =============================================================================
   Mentorship hub (/mentorship/). Owner: admin builder.
   The page content is static HTML (indexable). This module only:
   - fills config values (mentor fee, review weeks, open programs),
   - swaps the hero / mentor / closing CTAs for the visitor's role,
   - shows a small status card (your mentor, your application, admin),
   - for logged-in visitors, previews a few mentors who are taking mentees.
   Every failure leaves the static page as it is.
   ========================================================================== */
import {
  initPage, rpc, html, setContent, safeUrl, formatINR, PATHS, PROGRAMS, enabledPrograms, programLabel,
  loginUrl, statusBadge, MENTOR_STATUS, avatarHtml, tierChip, stageLabel, ratingHtml, journeyLines,
  labelOf, labelsOf, CITIES, LANGUAGES, waLink, firstName, track, DEFAULT_CONFIG, plural,
} from '/mentorship/assets/mentorship-core.js?v=1';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------- small builders ------------------------------------------------ */

function btn(href, label, { icon = '', variant = 'primary', size = 'lg', id = '' } = {}) {
  const url = safeUrl(href);
  if (!url) return '';
  return html`<a class="ms-btn ms-btn--${variant}${size ? ` ms-btn--${size}` : ''}" href="${url}" data-hub-track="${id || label}">${icon ? html`<i class="fas ${icon}" aria-hidden="true"></i>` : ''}<span>${label}</span></a>`;
}

/** Where a mentor (any status) should go next. */
function mentorAction(status) {
  switch (status) {
    case 'draft': return { href: PATHS.apply, label: 'Continue your application', icon: 'fa-pen-to-square' };
    case 'rejected': return { href: PATHS.apply, label: 'Your mentor application', icon: 'fa-file-lines' };
    case 'submitted': return { href: PATHS.training, label: 'Mentor training', icon: 'fa-graduation-cap' };
    case 'training_passed':
    case 'approved':
    case 'paused': return { href: PATHS.mentor, label: 'Mentor dashboard', icon: 'fa-gauge' };
    default: return { href: PATHS.apply, label: 'Become a mentor', icon: 'fa-hand-holding-heart' };
  }
}

/** Ordered list of actions for this visitor: [{href, label, icon, id}]. */
function visitorActions(ctx, mainProgram) {
  const findLabel = 'Find your mentor';
  if (!ctx.user) {
    return [
      { href: loginUrl(PATHS.find), label: findLabel, icon: 'fa-magnifying-glass', id: 'find_login' },
      { href: PATHS.apply, label: 'Become a mentor', id: 'apply' },
    ];
  }
  const progs = enabledPrograms(ctx.config);
  const enrolled = progs.filter((p) => (ctx.enrolledPrograms || []).includes(p));
  const matched = new Set((ctx.activeMatches || []).map((m) => m.program));
  const waiting = enrolled.filter((p) => !matched.has(p));
  const mentor = ctx.mentor ? { ...mentorAction(ctx.mentor.status), id: 'mentor' } : null;
  const out = [];
  if (mentor && !enrolled.length && !matched.size) out.push(mentor);
  if (matched.size) out.push({ href: PATHS.myMentor, label: 'Open My mentor', icon: 'fa-user-group', id: 'my_mentor' });
  if (waiting.length) out.push({ href: PATHS.find, label: findLabel, icon: 'fa-magnifying-glass', id: 'find' });
  if (!enrolled.length && !matched.size && !ctx.mentor) {
    const p = PROGRAMS[mainProgram] || PROGRAMS['industrial-training'];
    out.push({ href: PATHS.find, label: findLabel, icon: 'fa-magnifying-glass', id: 'find_browse' });
    out.push({ href: p.page, label: `Join the ${p.label} Program`, icon: 'fa-arrow-right', id: 'join_program' });
  }
  if (mentor && (enrolled.length || matched.size)) out.push(mentor);
  if (ctx.isStaff) out.push({ href: PATHS.admin, label: 'Admin', icon: 'fa-shield-halved', id: 'admin' });
  return out;
}

function renderActions(el, actions, { size = 'lg', variants = ['primary', 'secondary', 'outline', 'ghost'] } = {}) {
  if (!el || !actions.length) return;
  setContent(el, html`${actions.map((a, i) => btn(a.href, a.label, {
    icon: a.icon, size, id: a.id, variant: a.id === 'admin' ? 'ghost' : variants[Math.min(i, variants.length - 1)],
  }))}`);
}

/* ---------- config-driven text -------------------------------------------- */

function programSentence(progs) {
  const names = progs.map((p) => PROGRAMS[p]?.label).filter(Boolean);
  if (!names.length) return 'Mentorship opens for MSC program students soon.';
  if (names.length === 1) return `Mentorship is part of the MSC ${names[0]} Program.`;
  return `Mentorship is part of the MSC ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} programs.`;
}

function fillConfig(config) {
  const fee = Number(config?.mentor_fee_inr ?? DEFAULT_CONFIG.mentor_fee_inr);
  if (Number.isFinite(fee) && fee > 0) {
    $$('[data-hub-fee]').forEach((el) => { el.textContent = formatINR(fee); });
    $$('[data-hub-fee-example]').forEach((el) => { el.textContent = formatINR(fee * 8); });
  }
  const days = Number(config?.review_after_days ?? DEFAULT_CONFIG.review_after_days);
  if (Number.isFinite(days) && days > 0) {
    const weeks = Math.round(days / 7);
    $$('[data-hub-review-weeks]').forEach((el) => { el.textContent = weeks >= 1 && days % 7 === 0 ? plural(weeks, 'week') : plural(days, 'day'); });
  }
  const sentence = programSentence(enabledPrograms(config));
  $$('[data-hub-programs]').forEach((el) => { el.textContent = sentence; });
}

/* ---------- status card --------------------------------------------------- */

async function renderStatus(ctx) {
  const box = $('#hub-status');
  if (!box || !ctx.user) return;
  const cards = [];

  if ((ctx.activeMatches || []).length) {
    try {
      const data = await rpc('mentorship_my_match');
      const m = (data?.matches || []).find((x) => x.status === 'active');
      if (m?.mentor) {
        const mentor = m.mentor;
        const wa = safeUrl(waLink(mentor.whatsapp, `Hi ${firstName(mentor.full_name)}, this is ${firstName(ctx.name) || 'your mentee'} from My Student Club.`), { allowRelative: false });
        cards.push(html`<div class="ms-hub-status__card">
          ${avatarHtml({ name: mentor.full_name, photo_path: mentor.photo_path, size: 'sm' })}
          <div class="ms-grow">
            <div class="ms-hub-status__label">Your mentor</div>
            <div class="ms-hub-status__name ms-truncate">${mentor.full_name}</div>
            <div class="ms-hub-status__sub">${programLabel(m.program)} · Week ${m.week_no || 1}${m.pulse_this_week ? '' : html` · <a class="ms-link" href="${PATHS.myMentor}?pulse=1">This week's check-in</a>`}</div>
          </div>
          ${wa ? html`<a class="ms-btn ms-btn--whatsapp ms-btn--sm" href="${wa}" target="_blank" rel="noopener"><i class="fab fa-whatsapp" aria-hidden="true"></i><span>WhatsApp</span></a>` : ''}
        </div>`);
      }
    } catch { /* the "Open My mentor" button is enough */ }
  }

  if (ctx.mentor && ctx.mentor.status !== 'approved') {
    const st = ctx.mentor.status;
    const action = mentorAction(st);
    cards.push(html`<div class="ms-hub-status__card">
      ${avatarHtml({ name: ctx.mentor.full_name || ctx.name, photo_path: ctx.mentor.photo_path, size: 'sm' })}
      <div class="ms-grow">
        <div class="ms-hub-status__label">Your mentor profile</div>
        <div class="ms-row" style="--ms-gap:6px">${statusBadge('mentor', st)}<span class="ms-hub-status__sub">${MENTOR_STATUS[st]?.help || ''}</span></div>
      </div>
      <a class="ms-btn ms-btn--outline ms-btn--sm" href="${safeUrl(action.href)}"><span>Open</span></a>
    </div>`);
  }

  if (!cards.length) return;
  box.className = 'ms-hub-status';
  setContent(box, html`${cards}`);
  box.hidden = false;
}

/* ---------- mentor preview (logged-in only: the directory is not public) -- */

function bayes(m) {
  const n = Number(m.review_count || 0);
  return (Number(m.rating_avg || 0) * n + 4.5 * 3) / (n + 3);
}

function mentorCard(m, minReviews) {
  const lines = journeyLines(m).slice(0, 2);
  const slots = Number(m.slots_left || 0);
  const langs = labelsOf(LANGUAGES, m.languages).slice(0, 3).join(', ');
  const city = labelOf(CITIES, m.city);
  const href = `${PATHS.find}?mentor=${encodeURIComponent(m.id)}`;
  return html`<article class="ms-card ms-card--hover ms-mentor-card">
    <div class="ms-mentor-card__top">
      ${avatarHtml({ name: m.full_name, photo_path: m.photo_path, size: 'lg', verified: !!m.linkedin_checked, verifiedTitle: 'LinkedIn checked by Team MSC' })}
      <div class="ms-grow">
        <div class="ms-mentor-card__name">${m.full_name} ${tierChip(m.tier)}</div>
        <div class="ms-mentor-card__stage">${stageLabel(m.stage, { short: true })}</div>
        <div class="ms-mt-8">${ratingHtml(m.rating_avg, m.review_count, minReviews)}</div>
      </div>
    </div>
    ${m.headline ? html`<p class="ms-mentor-card__headline ms-clamp-2">${m.headline}</p>` : ''}
    ${lines.length ? html`<div class="ms-mentor-card__journey">${lines.map((l) => html`<div><i class="fas ${l.icon}" aria-hidden="true"></i><span><strong>${l.label}:</strong> ${l.text}</span></div>`)}</div>` : ''}
    <div class="ms-mentor-card__meta">
      ${langs ? html`<span><i class="fas fa-language" aria-hidden="true"></i>${langs}</span>` : ''}
      ${city ? html`<span><i class="fas fa-location-dot" aria-hidden="true"></i>${city}</span>` : ''}
    </div>
    <div class="ms-mentor-card__foot">
      <span class="ms-slots${slots <= 2 ? ' is-low' : ''}"><span class="ms-dot" aria-hidden="true"></span>${plural(slots, 'slot')} left</span>
      <span class="ms-grow"></span>
      <a class="ms-btn ms-btn--secondary ms-btn--sm" href="${safeUrl(href)}"><span>View profile</span></a>
    </div>
  </article>`;
}

async function renderMentorPreview(ctx, program) {
  const section = $('#hub-mentors');
  const list = $('#hub-mentors-list');
  if (!section || !list || !ctx.user || !ctx.backendReady || !program) return;
  if ((ctx.activeMatches || []).some((m) => m.program === program)) return; // already has a mentor here
  if (ctx.mentor && !(ctx.enrolledPrograms || []).includes(program)) return; // mentors are not picking one
  try {
    const rows = await rpc('mentorship_list_mentors', { p_program: program });
    const pick = (Array.isArray(rows) ? rows : []).filter((m) => m.available)
      .sort((a, b) => bayes(b) - bayes(a)).slice(0, 3);
    if (!pick.length) return;
    const minReviews = Number(ctx.config?.min_reviews_for_rating ?? DEFAULT_CONFIG.min_reviews_for_rating);
    setContent(list, html`${pick.map((m) => mentorCard(m, minReviews))}`);
    const title = $('#hub-mentors-title');
    if (title && !(ctx.enrolledPrograms || []).includes(program)) title.textContent = 'Meet a few of our mentors';
    section.hidden = false;
  } catch { /* keep hidden */ }
}

/* ---------- boot ---------------------------------------------------------- */

async function boot() {
  const ctx = await initPage({ active: 'hub' });
  fillConfig(ctx.config);
  const progs = enabledPrograms(ctx.config);
  const mainProgram = progs[0] || 'industrial-training';

  renderActions($('#hub-cta'), visitorActions(ctx, mainProgram).slice(0, 4));
  renderActions($('#hub-cta-2'), visitorActions(ctx, mainProgram).filter((a) => a.id !== 'admin').slice(0, 2), { variants: ['primary', 'outline'] });

  const mentorCta = $('#hub-mentor-cta');
  if (mentorCta && ctx.mentor) {
    const a = mentorAction(ctx.mentor.status);
    setContent(mentorCta, html`<a class="ms-btn ms-btn--lg ms-hub-btn-light" href="${safeUrl(a.href)}" data-hub-track="mentor_section"><i class="fas ${a.icon}" aria-hidden="true"></i><span>${a.label}</span></a>`);
  }

  if (!ctx.backendReady) {
    const box = $('#hub-status');
    if (box) {
      setContent(box, html`<div class="ms-callout ms-callout--gray"><i class="fas fa-screwdriver-wrench" aria-hidden="true"></i><span>Mentorship is being set up. Please check back soon.</span></div>`);
      box.hidden = false;
    }
  } else {
    renderStatus(ctx);
    renderMentorPreview(ctx, mainProgram);
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-hub-track]');
    if (a) track('mentorship_hub_cta', { cta: a.dataset.hubTrack });
  });
}

boot().catch((e) => console.warn('[mentorship hub]', e));
