/* =============================================================================
   Student-side shared UI for /mentorship/find/ and /mentorship/my-mentor/.
   Owner: student builder. Import with the exact specifier
     '/mentorship/find/mentor-ui.js?v=1'
   Exports the mentor card (same markup the apply preview can reuse), the profile
   sheet, facet helpers and the shared "what your mentor does" copy.
   ========================================================================== */
import {
  html, setContent, openModal, rpc, loadingBlock, emptyState, track,
  avatarHtml, ratingHtml, tierChip, stageLabel, journeyLines, starsHtml,
  labelOf, labelsOf, monthYearLabel, formatDate, plural, firstName, safeUrl, programLabel,
  DOMAINS, FIRM_TYPES, LANGUAGES, CITIES, CALL_SLOTS, REVIEW_TAGS, EXPERIENCE_YEARS, SITE_ORIGIN,
} from '/mentorship/assets/mentorship-core.js?v=1';

/* ---- copy shared by both pages ------------------------------------------- */

export const DISCLAIMER = 'Mentors share their own experience. Nobody on MSC can promise you a job, referral or placement, and no one should ask you for money.';
export const NOT_READY_TEXT = 'Mentorship is being set up. Please check back soon.';

/** What every MSC mentor does for a mentee (student-facing summary of DUTIES). */
export const INCLUDES = Object.freeze([
  { icon: 'fab fa-whatsapp', title: 'WhatsApp within hours', text: 'Your mentor responds within 4 to 5 hours and never leaves you unread at the end of the day.' },
  { icon: 'fas fa-phone', title: 'A call every week', text: 'How the hunt is going: applications, shortlists, interviews and one focus for the next week.' },
  { icon: 'fas fa-file-circle-check', title: 'CV review', text: 'Line-by-line feedback on your CV, then a re-check of the new version.' },
  { icon: 'fas fa-user-tie', title: 'Mock interview', text: 'At least one full mock before your real interviews, with honest feedback.' },
  { icon: 'fas fa-link', title: 'The right MSC resources', text: 'Guidebook, interview booklets and openings, shared when you need them.' },
  { icon: 'fas fa-flag-checkered', title: 'Help until you join', text: 'Offer letter, joining formalities, and a joining post that tags everyone who helped.' },
]);

/** What a mentor commits to, in the student's view (booking sheet). */
export const MENTOR_PROMISES = Object.freeze([
  'Responds to your WhatsApp within 4 to 5 hours, and never leaves you unread at the end of the day',
  'Calls you every week to check how the hunt is going',
  'Reviews your CV and takes at least one mock interview',
  'Keeps you applying, even when it feels slow',
  'Helps with joining formalities after your offer',
]);

/** What a mentor will never do. */
export const NEVER = Object.freeze([
  'Ask you for money, gifts or paid services',
  'Sell you a course or a paid group',
  'Move you to another WhatsApp or Telegram group',
  'Promise you a job, a referral or a placement',
]);

/** Mentor stage filter groups (find page). Each STAGES key belongs to exactly one group. */
export const STAGE_GROUPS = Object.freeze([
  { key: 'doing_it', label: 'Doing IT now', stages: ['final_in_it'] },
  { key: 'completed_it', label: 'Completed IT', stages: ['final_it_done'] },
  { key: 'articleship', label: 'Articleship background', stages: ['final_articleship_done', 'in_articleship'] },
  { key: 'qualified', label: 'Qualified CA', stages: ['qualified_fresher', 'qualified_experienced'] },
]);
export function stageGroupOf(stage) { return STAGE_GROUPS.find((g) => g.stages.includes(stage))?.key || ''; }

/* ---- data helpers ---------------------------------------------------------- */

function uniqueCi(values) {
  const seen = new Map();
  values.forEach((v) => {
    const s = String(v ?? '').trim();
    if (s && !seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s);
  });
  return [...seen.values()];
}

/** Every organisation on a mentor's profile (IT company, employer, articleship firm, companies they know). */
export function companiesOf(m = {}) {
  return uniqueCi([m.it_company, m.employer, m.articleship_firm, ...(Array.isArray(m.companies_known) ? m.companies_known : [])]);
}
/** Organisations worth offering as company filter chips (skips small/mid-size articleship firms). */
export function filterCompaniesOf(m = {}) {
  const big = ['big4', 'network'].includes(m.articleship_firm_type);
  return uniqueCi([m.it_company, m.employer, big ? m.articleship_firm : '', ...(Array.isArray(m.companies_known) ? m.companies_known : [])]);
}
/** Lower-cased text the search box matches against. */
export function searchHaystack(m = {}) {
  return [
    m.full_name, m.headline, m.it_company, m.articleship_firm, m.employer, m.role_title,
    ...(m.companies_known || []), ...labelsOf(DOMAINS, [...(m.domains || []), m.it_domain, m.articleship_domain].filter(Boolean)),
    labelOf(CITIES, m.city), labelOf(FIRM_TYPES, m.articleship_firm_type), stageLabel(m.stage, { short: true }),
  ].filter(Boolean).join(' • ').toLowerCase();
}
/** Bayesian rating used by "Recommended": (avg*count + 4.5*3) / (count + 3). */
export function bayesRating(m = {}) {
  const n = Number(m.review_count) || 0;
  return ((Number(m.rating_avg) || 0) * n + 4.5 * 3) / (n + 3);
}
/** Free-text city (profiles) -> { key, other } using CITIES keys and labels. */
export function cityKeyFromText(text) {
  const s = String(text || '').trim();
  if (!s) return { key: '', other: '' };
  const hit = CITIES.find((c) => c.key === s || c.label.toLowerCase() === s.toLowerCase());
  if (hit && hit.key !== 'other') return { key: hit.key, other: '' };
  return { key: 'other', other: s.slice(0, 40) };
}
/** Same-origin path for a www.mystudentclub.com URL (so links work on previews), else the URL. */
export function sitePath(url) {
  const u = String(url || '').trim();
  // Only the exact origin, or the origin followed by "/": 'https://www.mystudentclub.comjavascript:...'
  // must not lose its prefix and come back as a javascript: link.
  if (u === SITE_ORIGIN) return '/';
  if (u.startsWith(`${SITE_ORIGIN}/`)) return safeUrl(u.slice(SITE_ORIGIN.length), { allowRelative: true });
  return safeUrl(u);
}

/* ---- markup ---------------------------------------------------------------- */

export function slotsHtml(m = {}) {
  if (!m.available) {
    return html`<span class="ms-slots is-full"><span class="ms-dot"></span>${m.accepting === false ? 'Not taking mentees' : 'Full this batch'}</span>`;
  }
  const n = Math.max(0, Number(m.slots_left) || 0);
  return html`<span class="ms-slots${n <= 2 ? ' is-low' : ''}"><span class="ms-dot"></span>${plural(n, 'slot')} left</span>`;
}

/** Button or link for a choose state: { label, disabled, href, title, action }. */
function chooseHtml(m, st, size = 'sm') {
  if (!st) return '';
  const cls = `ms-btn ms-btn--primary ms-btn--${size}`;
  if (st.href) return html`<a class="${cls}" href="${safeUrl(st.href)}">${st.label}</a>`;
  return html`<button type="button" class="${cls}" data-action="choose" data-id="${m.id}"${st.disabled ? ' disabled' : ''} title="${st.title || ''}"><span>${st.label}</span></button>`;
}

/**
 * Mentor card (.ms-mentor-card) from the public mentor shape (SPEC §4.3).
 * opts.choose: { label, disabled, href, title } or null to hide the Choose button.
 */
export function mentorCardHtml(m, { choose = null, minReviews = 3, profileButton = true } = {}) {
  const lines = journeyLines(m).slice(0, 2);
  const domains = labelsOf(DOMAINS, m.domains || []);
  const langs = labelsOf(LANGUAGES, m.languages || []);
  const topmate = safeUrl(m.topmate_url, { allowRelative: false });
  return html`<article class="ms-card ms-card--hover ms-mentor-card${m.available ? '' : ' is-full'}" data-mentor-id="${m.id}">
    <div class="ms-mentor-card__top">
      ${avatarHtml({ name: m.full_name, photo_path: m.photo_path, size: 'lg', verified: !!m.linkedin_checked, verifiedTitle: 'LinkedIn checked by Team MSC' })}
      <div class="ms-grow">
        <div class="ms-mentor-card__name"><span>${m.full_name}</span>${tierChip(m.tier)}</div>
        <div class="ms-mentor-card__stage">${stageLabel(m.stage, { short: true })}</div>
        <div class="ms-mt-8">${ratingHtml(m.rating_avg, m.review_count, minReviews)}</div>
      </div>
    </div>
    ${m.headline ? html`<p class="ms-mentor-card__headline ms-clamp-2">${m.headline}</p>` : ''}
    ${lines.length ? html`<div class="ms-mentor-card__journey">${lines.map((l) => html`<div><i class="fas ${l.icon}" aria-hidden="true"></i><span class="ms-clamp-2"><strong>${l.label}:</strong> ${l.text}</span></div>`)}</div>` : ''}
    ${domains.length ? html`<div class="ms-chips" aria-label="Domains">${domains.slice(0, 3).map((d) => html`<span class="ms-chip">${d}</span>`)}${domains.length > 3 ? html`<span class="ms-chip ms-tone-outline">+${domains.length - 3}</span>` : ''}</div>` : ''}
    <div class="ms-mentor-card__meta">
      ${langs.length ? html`<span><i class="fas fa-language" aria-hidden="true"></i>${langs.join(', ')}</span>` : ''}
      ${m.city ? html`<span><i class="fas fa-location-dot" aria-hidden="true"></i>${labelOf(CITIES, m.city)}</span>` : ''}
      ${topmate ? html`<a class="ms-link" href="${topmate}" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i>Topmate${m.topmate_checked ? ' reviews' : ''}</a>` : ''}
    </div>
    <div class="ms-mentor-card__foot">
      ${slotsHtml(m)}<span class="ms-grow"></span>
      ${profileButton ? html`<button type="button" class="ms-btn ms-btn--secondary ms-btn--sm" data-action="profile" data-id="${m.id}"><span>Profile</span></button>` : ''}
      ${chooseHtml(m, choose)}
    </div>
  </article>`;
}

/** Compact mentor row (booking sheet, success screen). */
export function mentorMiniHtml(m, { extra = '' } = {}) {
  const line = journeyLines(m)[0];
  return html`<div class="ms-find-mini">
    ${avatarHtml({ name: m.full_name, photo_path: m.photo_path, size: 'lg', verified: !!m.linkedin_checked, verifiedTitle: 'LinkedIn checked by Team MSC' })}
    <div class="ms-grow">
      <div class="ms-mentor-card__name"><span>${m.full_name}</span>${tierChip(m.tier)}</div>
      <div class="ms-mentor-card__stage">${stageLabel(m.stage, { short: true })}</div>
      ${line ? html`<div class="ms-xs ms-text-2 ms-mt-8 ms-clamp-2"><i class="fas ${line.icon}" aria-hidden="true"></i> ${line.text}</div>` : ''}
      ${extra}
    </div>
  </div>`;
}

/** Ordered journey for the profile sheet timeline: [{ title, text, tone }]. */
export function journeyTimeline(m = {}) {
  const items = [];
  if (m.articleship_firm || m.articleship_firm_type) {
    const now = m.stage === 'in_articleship';
    items.push({
      title: now ? `Articleship (now${m.articleship_year ? `, year ${m.articleship_year}` : ''})` : 'Articleship',
      text: [m.articleship_firm, labelOf(FIRM_TYPES, m.articleship_firm_type), labelOf(DOMAINS, m.articleship_domain), m.articleship_city].filter(Boolean).join(' · '),
      tone: now ? '' : 'is-good',
    });
  }
  if (m.it_company) {
    const now = m.stage === 'final_in_it';
    items.push({
      title: now ? 'Industrial training (now)' : 'Industrial training',
      text: [m.it_company, labelOf(DOMAINS, m.it_domain), m.it_duration_months ? `${m.it_duration_months} months` : '', m.it_start ? `from ${monthYearLabel(m.it_start)}` : ''].filter(Boolean).join(' · '),
      tone: now ? '' : 'is-good',
    });
  }
  if (m.qualified_on) items.push({ title: 'Qualified as a CA', text: monthYearLabel(m.qualified_on), tone: 'is-good' });
  else if (m.final_attempt) items.push({ title: 'CA Final', text: `Attempt ${monthYearLabel(m.final_attempt)}`, tone: 'is-muted' });
  if (m.employer) {
    const exp = m.experience_years ? `${labelOf(EXPERIENCE_YEARS, m.experience_years)} after qualifying` : '';
    items.push({ title: 'Now', text: [[m.role_title, m.employer].filter(Boolean).join(', '), exp].filter(Boolean).join(' · '), tone: '' });
  }
  return items;
}

/** "What your mentor does" grid. */
export function includesHtml() {
  return html`<div class="ms-grid ms-grid--3 ms-find-includes">${INCLUDES.map((x) => html`
    <div class="ms-card ms-card--flat ms-find-include">
      <span class="ms-find-include__icon"><i class="${x.icon}" aria-hidden="true"></i></span>
      <div><div class="ms-strong">${x.title}</div><p class="ms-small ms-text-2">${x.text}</p></div>
    </div>`)}</div>`;
}

export function neverListHtml() {
  return html`<ul class="ms-find-never">${NEVER.map((t) => html`<li><i class="fas fa-xmark" aria-hidden="true"></i><span>${t}</span></li>`)}</ul>`;
}

export function notReadyHtml() {
  return html`<div class="ms-container ms-container--narrow ms-section">
    <div class="ms-callout ms-callout--gray"><i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
      <div><span class="ms-callout__title">Almost ready</span>${NOT_READY_TEXT}</div></div></div>`;
}

export function errorStateHtml(err) {
  return html`<div class="ms-container ms-container--narrow ms-section"><div class="ms-card">
    ${emptyState({ icon: 'fa-circle-exclamation', title: 'We could not load this page', text: err?.message || 'Something went wrong. Please try again.', action: { label: 'Try again', id: 'ms-retry' } })}
  </div></div>`;
}

/* ---- profile sheet --------------------------------------------------------- */

function reviewsHtml(data, first, minReviews) {
  const m = data.mentor || {};
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  const tags = Object.entries(data.tag_counts || {}).sort((a, b) => b[1] - a[1]);
  const head = (Number(m.review_count) || 0) >= minReviews
    ? html`<div class="ms-row" style="--ms-gap:10px"><span class="ms-find-bigrating">${Number(m.rating_avg || 0).toFixed(1)}</span>${starsHtml(m.rating_avg)}<span class="ms-small ms-muted">${plural(m.review_count, 'review')}</span></div>`
    : html`<div class="ms-row">${ratingHtml(m.rating_avg, m.review_count, minReviews)}<span class="ms-small ms-muted">${m.review_count ? `${plural(m.review_count, 'review')} so far` : ''}</span></div>`;
  if (!reviews.length) {
    return html`${head}<p class="ms-small ms-text-2 ms-mt-8">No reviews yet. This mentor is new to MSC.</p>`;
  }
  return html`${head}
    ${tags.length ? html`<div class="ms-chips ms-mt-8">${tags.map(([k, n]) => html`<span class="ms-chip ms-tone-green">${labelOf(REVIEW_TAGS, k)} <span aria-label="${n} times">×${n}</span></span>`)}</div>` : ''}
    <ul class="ms-find-reviews">${reviews.map((r) => html`<li class="ms-find-review">
      <div class="ms-row ms-between"><span>${starsHtml(r.rating)}</span><span class="ms-xs ms-muted">${formatDate(r.created_at, { day: undefined })}</span></div>
      ${r.tags?.length ? html`<div class="ms-chips">${labelsOf(REVIEW_TAGS, r.tags).map((t) => html`<span class="ms-chip">${t}</span>`)}</div>` : ''}
      ${r.body ? html`<p class="ms-find-review__body">${r.body}</p>` : ''}
      <div class="ms-xs ms-muted">${r.author || 'MSC student'}${r.program ? ` · ${programLabel(r.program)}` : ''}</div>
    </li>`)}</ul>
    <p class="ms-xs ms-muted">Reviews are from ${first}'s MSC mentees, after 4 weeks together.</p>`;
}

function profileBodyHtml(data, { minReviews }) {
  const m = data.mentor || {};
  const first = m.first_name || firstName(m.full_name);
  const topmate = safeUrl(m.topmate_url, { allowRelative: false });
  const linkedin = safeUrl(m.linkedin_url, { allowRelative: false });
  const timeline = journeyTimeline(m);
  const domains = labelsOf(DOMAINS, m.domains || []);
  const companies = Array.isArray(m.companies_known) ? m.companies_known.filter(Boolean) : [];
  const langs = labelsOf(LANGUAGES, m.languages || []);
  const slots = labelsOf(CALL_SLOTS, m.call_slots || []);
  return html`<div class="ms-find-profile">
    <div class="ms-find-profile__head">
      ${avatarHtml({ name: m.full_name, photo_path: m.photo_path, size: 'xl', verified: !!m.linkedin_checked, verifiedTitle: 'LinkedIn checked by Team MSC' })}
      <div class="ms-grow ms-stack" style="--ms-gap:6px">
        <div class="ms-mentor-card__name ms-find-profile__name"><span>${m.full_name}</span>${tierChip(m.tier)}</div>
        <div class="ms-small ms-text-2">${stageLabel(m.stage)}</div>
        <div class="ms-chips">
          ${m.linkedin_checked ? html`<span class="ms-badge ms-tone-green"><i class="fas fa-circle-check" aria-hidden="true"></i>LinkedIn checked</span>` : ''}
          ${m.topmate_checked ? html`<span class="ms-badge ms-tone-green"><i class="fas fa-circle-check" aria-hidden="true"></i>Topmate reviews checked</span>` : ''}
        </div>
      </div>
    </div>
    ${m.headline ? html`<p class="ms-find-profile__headline">${m.headline}</p>` : ''}
    <div class="ms-find-facts">
      <div>${ratingHtml(m.rating_avg, m.review_count, minReviews)}</div>
      <div>${slotsHtml(m)}</div>
      ${Number(m.mentees_total) > 0 ? html`<div class="ms-small ms-text-2"><i class="fas fa-user-graduate" aria-hidden="true"></i> ${plural(m.mentees_total, 'MSC mentee')} so far</div>` : ''}
      ${m.city ? html`<div class="ms-small ms-text-2"><i class="fas fa-location-dot" aria-hidden="true"></i> ${labelOf(CITIES, m.city)}</div>` : ''}
    </div>
    ${topmate || linkedin ? html`<div class="ms-btn-row">
      ${topmate ? html`<a class="ms-btn ms-btn--outline ms-btn--sm" href="${topmate}" target="_blank" rel="noopener"><i class="fas fa-star" aria-hidden="true"></i><span>See reviews on Topmate</span></a>` : ''}
      ${linkedin ? html`<a class="ms-btn ms-btn--outline ms-btn--sm" href="${linkedin}" target="_blank" rel="noopener"><i class="fab fa-linkedin" aria-hidden="true"></i><span>LinkedIn</span></a>` : ''}
    </div>` : ''}
    ${m.wish_i_knew ? html`<blockquote class="ms-find-quote"><span class="ms-xs ms-strong">One thing I wish I knew</span>“${m.wish_i_knew}”</blockquote>` : ''}
    ${m.bio ? html`<section><h3 class="ms-find-profile__h">About ${first}</h3><p class="ms-find-bio">${m.bio}</p></section>` : ''}
    ${timeline.length ? html`<section><h3 class="ms-find-profile__h">Journey</h3><ol class="ms-timeline ms-find-timeline">${timeline.map((t) => html`<li class="${t.tone}"><div class="ms-timeline__title">${t.title}</div><div class="ms-timeline__meta">${t.text}</div></li>`)}</ol></section>` : ''}
    ${domains.length ? html`<section><h3 class="ms-find-profile__h">Can guide you on</h3><div class="ms-chips">${domains.map((d) => html`<span class="ms-chip ms-tone-blue">${d}</span>`)}</div></section>` : ''}
    ${companies.length ? html`<section><h3 class="ms-find-profile__h">Companies ${first} knows well</h3><div class="ms-chips">${companies.map((c) => html`<span class="ms-chip">${c}</span>`)}</div></section>` : ''}
    <div class="ms-grid ms-grid--2" style="--ms-gap:16px">
      ${langs.length ? html`<section><h3 class="ms-find-profile__h">Languages</h3><p class="ms-small">${langs.join(', ')}</p></section>` : ''}
      ${slots.length ? html`<section><h3 class="ms-find-profile__h">Usually free for calls</h3><p class="ms-small">${slots.join(' · ')}</p></section>` : ''}
    </div>
    <section><h3 class="ms-find-profile__h">Reviews</h3>${reviewsHtml(data, first, minReviews)}</section>
    <p class="ms-find-note"><i class="fas fa-shield-halved" aria-hidden="true"></i> ${DISCLAIMER}</p>
  </div>`;
}

/**
 * Open the mentor profile sheet (wide modal) using mentorship_mentor_public.
 * opts.choose(mentor) -> { label, sheetLabel, disabled, href, title } | null (no Choose button)
 * opts.onChoose(mentor) runs after the sheet closes.
 */
export function openMentorProfile(id, { minReviews = 3, choose = null, onChoose = null, onClose = null, preview = null } = {}) {
  let loaded = null;
  const actions = [{ label: 'Close', variant: 'ghost' }];
  if (choose) {
    actions.push({
      label: 'Choose', variant: 'primary',
      onClick: (modal) => {
        if (!loaded) return false;
        const st = choose(loaded);
        if (!st || st.disabled) return false;
        if (st.href) { location.href = st.href; return false; }
        modal.close();
        onChoose?.(loaded);
        return false;
      },
    });
  }
  const modal = openModal({ title: 'Mentor profile', body: loadingBlock(preview?.full_name ? `Opening ${preview.full_name}'s profile...` : 'Opening profile...'), wide: true, actions, onClose });
  modal.el.classList.add('ms-find-sheet');
  const chooseBtn = choose ? modal.buttons[1] : null;
  if (chooseBtn) chooseBtn.disabled = true;
  rpc('mentorship_mentor_public', { p_mentor_id: id })
    .then((data) => {
      loaded = data?.mentor || null;
      if (!loaded) throw Object.assign(new Error('not_found'), { code: 'not_found' });
      setContent(modal.body, profileBodyHtml(data, { minReviews }));
      if (chooseBtn) {
        const st = choose(loaded);
        if (!st) chooseBtn.hidden = true;
        else {
          chooseBtn.textContent = st.sheetLabel || st.label;
          chooseBtn.disabled = !!st.disabled;
          if (st.title) chooseBtn.title = st.title;
        }
      }
      track('mentorship_profile_view');
    })
    .catch((e) => {
      setContent(modal.body, emptyState({
        icon: 'fa-user-slash', title: 'We could not open this profile',
        text: e?.code === 'not_found' ? 'This mentor is not listed right now. Please pick another mentor.' : (e?.message || 'Please try again.'),
      }));
      if (chooseBtn) chooseBtn.hidden = true;
    });
  return modal;
}
