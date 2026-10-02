/* =============================================================================
   Shared helpers for the mentor-side pages: /mentorship/apply/, /training/, /mentor/.
   Owner: mentor builder. Core is imported with the one exact specifier.
   ========================================================================== */
import {
  html, safeUrl, loginUrl, PATHS, labelOf, DOMAINS, LANGUAGES, CITIES,
  firstName, programLabel, avatarHtml, tierChip, stageLabel, ratingHtml, journeyLines, labelsOf,
  DEFAULT_CONFIG, waLink, mailtoLink, programCopy,
} from '/mentorship/assets/mentorship-core.js?v=1';

export const QUALIFIED_STAGES = ['qualified_fresher', 'qualified_experienced'];
export const FINAL_STAGES = ['final_in_it', 'final_it_done', 'final_articleship_done'];
export const IT_NOW_STAGES = ['final_in_it', 'final_it_done'];
export const isQualifiedStage = (s) => QUALIFIED_STAGES.includes(s);

/* ---- small shared screens ------------------------------------------------- */

/** "Being set up" callout (SPEC §13 copy). */
export function backendNotReady() {
  return html`<section class="ms-container ms-container--narrow ms-section">
    <div class="ms-callout ms-callout--gray"><i class="fas fa-screwdriver-wrench" aria-hidden="true"></i>
      <div><span class="ms-callout__title">Almost there</span>Mentorship is being set up. Please check back soon.</div></div>
  </section>`;
}

/** Load error with a retry button (data-ms-retry). */
export function loadError(err) {
  return html`<section class="ms-container ms-container--narrow ms-section">
    <div class="ms-callout ms-callout--danger"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>
      <div><span class="ms-callout__title">This page did not load</span>${err?.message || 'Something went wrong. Please try again.'}
        <div class="ms-mt-8"><button type="button" class="ms-btn ms-btn--outline ms-btn--sm" data-ms-retry><i class="fas fa-rotate-right"></i><span>Try again</span></button></div>
      </div></div>
  </section>`;
}

export function bindRetry(root) {
  root.querySelector('[data-ms-retry]')?.addEventListener('click', () => location.reload());
}

/**
 * Centered status screen: { icon, tone, eyebrow, title, text, actions:[{label, href, variant, icon}], extra }.
 * `extra` is html`` placed under the text.
 */
export function statusScreen({ icon = 'fa-seedling', tone = 'blue', eyebrow = '', title = '', text = '', actions = [], extra = '' } = {}) {
  return html`<section class="ms-container ms-container--narrow ms-section">
    <div class="ms-card ms-mentor-status">
      <div class="ms-mentor-status__icon ms-tone-${tone}"><i class="fas ${icon}" aria-hidden="true"></i></div>
      ${eyebrow ? html`<span class="ms-eyebrow">${eyebrow}</span>` : ''}
      <h1 class="ms-h2">${title}</h1>
      ${text ? html`<p class="ms-lead ms-mentor-status__text">${text}</p>` : ''}
      ${extra}
      ${actions.length ? html`<div class="ms-btn-row ms-btn-row--stack ms-mentor-status__actions">${actions.map((a) => html`
        <a class="ms-btn ms-btn--${a.variant || 'primary'}" href="${safeUrl(a.href)}">${a.icon ? html`<i class="fas ${a.icon}" aria-hidden="true"></i>` : ''}<span>${a.label}</span></a>`)}</div>` : ''}
    </div>
  </section>`;
}

/** Logged-out screen with the site's login convention (path-only redirect). */
export function loggedOutScreen({ title, text, path, icon = 'fa-right-to-bracket', extraActions = [] }) {
  return statusScreen({
    icon, title, text,
    actions: [{ label: 'Log in to continue', href: loginUrl(path), icon: 'fa-right-to-bracket' }, ...extraActions],
  });
}

/** The 4-step mentor journey (apply, training, review, live). `at` = index of the current step. */
export function journeySteps(at = 0, { row = false } = {}) {
  const steps = [
    { icon: 'fa-file-pen', title: 'Apply', text: 'About 10 minutes. It saves as you go.' },
    { icon: 'fa-graduation-cap', title: 'Training', text: 'The mentor lecture, the playbook and a short quiz.' },
    { icon: 'fa-user-shield', title: 'Review by Team MSC', text: 'We review every application within 7 days.' },
    { icon: 'fa-user-group', title: 'Students pick you', text: 'Your profile goes live and mentees choose you.' },
  ];
  return html`<ol class="ms-mentor-journey${row ? ' ms-mentor-journey--row' : ''}">${steps.map((s, i) => html`
    <li class="${i < at ? 'is-done' : i === at ? 'is-current' : ''}">
      <span class="ms-mentor-journey__dot"><i class="fas ${i < at ? 'fa-check' : s.icon}" aria-hidden="true"></i></span>
      <span class="ms-mentor-journey__body"><strong>${s.title}</strong><small>${s.text}</small></span>
    </li>`)}</ol>`;
}

/* ---- template variables (SPEC §10) ----------------------------------------- */

const FIRM_PHRASE = { big4: 'a Big 4 firm', network: 'a Big 6 / network firm', mid_size: 'a mid-size firm', small: 'a small firm' };
const SLOT_PHRASE = {
  weekday_morning: 'tomorrow morning', weekday_lunch: 'tomorrow at lunch', weekday_evening: 'this evening',
  weekday_late: 'tonight after 10', saturday: 'this Saturday', sunday: 'this Sunday',
};

/** Domain label for running text: 'Risk advisory & controls' -> 'risk advisory & controls', keeps 'FP&A'. */
export function domainPhrase(key) {
  const l = labelOf(DOMAINS, key);
  if (!l) return '';
  return /^[A-Z][a-z]/.test(l) ? l.charAt(0).toLowerCase() + l.slice(1) : l;
}

/** "I did my industrial training at Deloitte in risk advisory & controls, and I am now ..." (no full stop). */
export function mentorLine(m = {}) {
  let line = '';
  const itNow = m.stage === 'final_in_it';
  if (m.it_company) {
    line = `${itNow ? 'I am doing my industrial training' : 'I did my industrial training'} at ${m.it_company}${m.it_domain ? ` in ${domainPhrase(m.it_domain)}` : ''}`;
  } else if (m.articleship_firm_type || m.articleship_domain) {
    line = `${m.stage === 'in_articleship' ? 'I am doing my articleship' : 'I did my articleship'} at ${FIRM_PHRASE[m.articleship_firm_type] || 'a CA firm'}${m.articleship_domain ? ` in ${domainPhrase(m.articleship_domain)}` : ''}`;
  }
  if (isQualifiedStage(m.stage) && m.employer) {
    line += `${line ? ', and ' : ''}I am now ${m.role_title ? `${m.role_title} at ` : 'working at '}${m.employer}`;
  }
  return line || 'I have been through the same CA journey you are on now';
}

export function slotPhrase(slots) {
  const first = Array.isArray(slots) ? slots[0] : null;
  return SLOT_PHRASE[first] || 'this week';
}

/** Variables for FIRST_MESSAGES. */
export function templateVars({ mentor = {}, menteeName = '', program = 'industrial-training', config = DEFAULT_CONFIG } = {}) {
  return {
    mentee_first: firstName(menteeName),
    mentor_first: firstName(mentor.full_name),
    mentor_name: mentor.full_name || '',
    program: programLabel(program),
    links_url: config?.links_url || DEFAULT_CONFIG.links_url,
    slot: slotPhrase(mentor.call_slots),
    mentor_line: mentorLine(mentor),
    openings: programCopy(program).openings,
  };
}

/* ---- escalation + Padam GPT ------------------------------------------------ */

/** { href, label, kind } for the senior mentor / Team MSC escalation contact. */
export function escalationLink(esc = {}, mentor = {}) {
  const name = esc?.name || 'Team My Student Club';
  if (esc?.whatsapp) {
    const text = `Hi ${firstName(name)}, this is ${firstName(mentor.full_name) || 'an MSC mentor'}, MSC mentor. I need help with: `;
    return { href: waLink(esc.whatsapp, text), label: name, kind: 'whatsapp' };
  }
  if (esc?.email) return { href: mailtoLink(esc.email, 'MSC mentor: need help'), label: name, kind: 'email' };
  return { href: PATHS.contact, label: name, kind: 'contact' };
}

export function padamGptUrl(config) {
  return safeUrl(config?.padam_gpt_url || '', { allowRelative: false });
}

/* ---- mentor card preview (same markup as the find page's .ms-mentor-card) --- */

export function mentorCardHtml(m = {}, { minReviews = 3, note = '' } = {}) {
  const lines = journeyLines(m).slice(0, 2);
  const slots = Math.max(0, Number(m.slots_left ?? m.max_mentees ?? 0));
  const available = m.available ?? slots > 0;
  const name = m.full_name || 'Your name';
  return html`<article class="ms-card ms-mentor-card${available ? '' : ' is-full'}">
    <div class="ms-mentor-card__top">${avatarHtml({ name, photo_path: m.photo_path, size: 'lg', verified: !!m.linkedin_checked, verifiedTitle: 'LinkedIn checked by Team MSC' })}
      <div class="ms-grow">
        <div class="ms-mentor-card__name">${name} ${tierChip(m.tier)}</div>
        <div class="ms-mentor-card__stage">${stageLabel(m.stage, { short: true }) || 'Your CA stage'}</div>
        <div class="ms-mt-8">${ratingHtml(m.rating_avg, m.review_count, minReviews)}</div>
      </div>
    </div>
    <p class="ms-mentor-card__headline ms-clamp-2">${m.headline || 'Your headline shows here.'}</p>
    ${lines.length ? html`<div class="ms-mentor-card__journey">${lines.map((l) => html`<div><i class="fas ${l.icon}" aria-hidden="true"></i><span class="ms-clamp-2"><strong>${l.label}:</strong> ${l.text}</span></div>`)}</div>` : ''}
    <div class="ms-mentor-card__meta">
      ${(m.languages || []).length ? html`<span><i class="fas fa-language" aria-hidden="true"></i>${labelsOf(LANGUAGES, m.languages).join(', ')}</span>` : ''}
      ${m.city ? html`<span><i class="fas fa-location-dot" aria-hidden="true"></i>${labelOf(CITIES, m.city)}</span>` : ''}
    </div>
    <div class="ms-mentor-card__foot">
      <span class="ms-slots${available ? (slots <= 2 ? ' is-low' : '') : ' is-full'}"><span class="ms-dot"></span>${available ? `${slots} ${slots === 1 ? 'slot' : 'slots'} left` : 'Full this batch'}</span>
      <span class="ms-grow"></span>
      <span class="ms-btn ms-btn--secondary ms-btn--sm" aria-hidden="true">Profile</span>
      <span class="ms-btn ms-btn--primary ms-btn--sm" aria-hidden="true">Choose</span>
    </div>
    ${note ? html`<p class="ms-xs ms-muted">${note}</p>` : ''}
  </article>`;
}

/* ---- misc ------------------------------------------------------------------ */

/** Height of the fixed header + sticky sub-nav, for scroll offsets. */
export function stickyOffset() {
  const h = document.querySelector('.site-header')?.offsetHeight || 0;
  const s = document.querySelector('.ms-subnav')?.offsetHeight || 0;
  return h + s;
}
export function scrollToEl(el, { smooth = true, extra = 12 } = {}) {
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - stickyOffset() - extra;
  window.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' });
}

/** Per-viewer convenience storage (never required for correctness). */
export const local = {
  get(key) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignore */ } },
  del(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } },
};

/** Share text on WhatsApp without a number (resources). */
export function waShare(text) { return `https://wa.me/?text=${encodeURIComponent(String(text || ''))}`; }

