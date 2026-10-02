/* =============================================================================
   Admin console: shared data cache, helpers and modals. Owner: admin builder.
   Every write goes through a SECURITY DEFINER RPC (see SPEC.md §4.2 "Staff").
   ========================================================================== */
import {
  rpc, html, setContent, safeUrl, waLink, telLink, mailtoLink, formatPhone, firstName,
  avatarHtml, tierChip, stageLabel, ratingHtml, journeyLines, labelOf, labelsOf, CITIES, LANGUAGES,
  programLabel, openModal, showError, debounce, formatDate, emptyState, plural, DEFAULT_CONFIG, enabledPrograms, PROGRAM_KEYS, DOMAINS,
} from '/mentorship/assets/mentorship-core.js?v=1';

/* ---------- cache --------------------------------------------------------- */

const cache = new Map();
const arr = (v) => (Array.isArray(v) ? v : []);

/** Cached promise per key; a failed load is dropped so the next call retries. */
export function cached(key, loader, { force = false } = {}) {
  if (force || !cache.has(key)) {
    const p = Promise.resolve().then(loader);
    cache.set(key, p);
    p.catch(() => { if (cache.get(key) === p) cache.delete(key); });
  }
  return cache.get(key);
}

/** Drop cached keys equal to, or starting with `<prefix>:`. No args clears everything. */
export function invalidate(...prefixes) {
  for (const k of [...cache.keys()]) {
    if (!prefixes.length || prefixes.some((p) => k === p || k.startsWith(`${p}:`))) cache.delete(k);
  }
}

export const load = {
  overview: (o) => cached('overview', () => rpc('mentorship_admin_overview'), o),
  flags: (o) => cached('flags', async () => arr(await rpc('mentorship_admin_red_flags')), o),
  mentors: (o) => cached('mentors', async () => arr(await rpc('mentorship_admin_mentors')), o),
  /** status: 'active' | 'completed' | 'switched' | 'ended' | null (all). */
  matches: (status = 'active', program = null, o) => cached(`matches:${status || 'all'}:${program || 'all'}`,
    async () => arr(await rpc('mentorship_admin_matches', { p_status: status, p_program: program })), o),
  unmatched: (program = 'industrial-training', o) => cached(`unmatched:${program}`,
    async () => arr(await rpc('mentorship_admin_unmatched', { p_program: program })), o),
  /** status: 'pending' | 'approved' | 'declined' | 'withdrawn' | null (all). */
  switches: (status = 'pending', o) => cached(`switches:${status || 'all'}`,
    async () => arr(await rpc('mentorship_admin_switch_requests', { p_status: status })), o),
  reviews: (o) => cached('reviews', async () => arr(await rpc('mentorship_admin_reviews')), o),
  staff: (o) => cached('staff', async () => arr(await rpc('mentorship_admin_staff')), o),
  config: (o) => cached('config', async () => arr(await rpc('mentorship_admin_get_config')), o),
  detail: (id, o) => cached(`detail:${id}`, () => rpc('mentorship_admin_mentor_detail', { p_mentor_id: id }), o),
};

/** Invalidate everything a match-level write can change. */
export function invalidateMatchData() {
  invalidate('overview', 'flags', 'matches', 'unmatched', 'switches', 'mentors', 'detail');
}

/* ---------- formatting ---------------------------------------------------- */

export const cityLabel = (c) => labelOf(CITIES, c);
/** Phone for CSV: '91 98765 43210' (a leading + would trip the CSV formula guard and show as '+91...). */
export const csvPhone = (p) => formatPhone(p).replace(/^\+/, '');
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function daysAgoText(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '';
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  return `${n} days ago`;
}

/** Month key 'YYYY-MM' in IST for a timestamp. */
export function istMonthKey(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
}
export function monthLabel(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(key || '');
  if (!m) return key || '';
  return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, 1)));
}

/** Program keys worth showing in filters: enabled ones plus any present in the data. */
export function programOptions(config, extra = []) {
  const set = new Set([...enabledPrograms(config || DEFAULT_CONFIG), ...extra.filter(Boolean)]);
  return PROGRAM_KEYS.filter((k) => set.has(k));
}

export function haystack(...parts) {
  return parts.flat(3).filter((x) => x !== null && x !== undefined).map((x) => String(x)).join(' ').toLowerCase();
}

export function mentorHaystack(m) {
  return haystack(m.full_name, m.email, m.headline, m.it_company, m.articleship_firm, m.employer, m.companies_known,
    labelsOf(DOMAINS, m.domains), cityLabel(m.city), stageLabel(m.stage, { short: true }));
}

/* ---------- contact buttons ----------------------------------------------- */

export function waButton(phone, text = '', label = 'WhatsApp', { size = 'sm', variant = 'whatsapp', block = false, short = '' } = {}) {
  const href = safeUrl(waLink(phone, text), { allowRelative: false });
  const cls = `ms-btn ms-btn--${href ? variant : 'outline'} ms-btn--${size}${block ? ' ms-btn--block' : ''}`;
  const text_ = short ? html`<span><span class="ms-admin-long">${label}</span><span class="ms-admin-short">${short}</span></span>` : html`<span>${label}</span>`;
  if (!href) return html`<span class="${cls}" aria-disabled="true" title="No WhatsApp number saved"><i class="fab fa-whatsapp" aria-hidden="true"></i>${text_}</span>`;
  return html`<a class="${cls}" href="${href}" target="_blank" rel="noopener" aria-label="${label}"><i class="fab fa-whatsapp" aria-hidden="true"></i>${text_}</a>`;
}
export function callButton(phone, { size = 'sm' } = {}) {
  const href = safeUrl(telLink(phone), { allowRelative: false });
  return href ? html`<a class="ms-btn ms-btn--outline ms-btn--${size}" href="${href}"><i class="fas fa-phone" aria-hidden="true"></i><span>Call</span></a>` : '';
}
export function mailButton(email, subject = '', { size = 'sm' } = {}) {
  const href = safeUrl(mailtoLink(email, subject), { allowRelative: false });
  return href ? html`<a class="ms-btn ms-btn--outline ms-btn--${size}" href="${href}"><i class="fas fa-envelope" aria-hidden="true"></i><span>Email</span></a>` : '';
}
export function waIconLink(phone, text = '', title = 'WhatsApp') {
  const href = safeUrl(waLink(phone, text), { allowRelative: false });
  return href ? html`<a class="ms-admin-wa" href="${href}" target="_blank" rel="noopener" title="${title}" aria-label="${title}"><i class="fab fa-whatsapp" aria-hidden="true"></i></a>` : '';
}

/** Contact block for one person (mentee or mentor) inside a modal. */
export function personContact({ title, name, sub = '', photo_path = '', whatsapp, email, waText = '', subject = '' }) {
  return html`<div class="ms-admin-sec">
    <div class="ms-admin-sec__title">${title}</div>
    <div class="ms-person">${avatarHtml({ name, photo_path, size: 'sm' })}<div class="ms-grow">
      <div class="ms-person__name">${name || 'Unknown'}</div>
      <div class="ms-person__sub">${[formatPhone(whatsapp), email, sub].filter(Boolean).join(' · ')}</div>
    </div></div>
    <div class="ms-btn-row ms-mt-8">${waButton(whatsapp, waText)}${callButton(whatsapp)}${mailButton(email, subject)}</div>
  </div>`;
}

/* ---------- WhatsApp nudges (Team MSC voice; never quote a private pulse) -- */

export function mentorNudge(kind, { mentor = '', mentee = '', since = '' } = {}) {
  const m = firstName(mentor) || 'there';
  const s = mentee || 'your mentee';
  const t = {
    intro_late: `Hi ${m}, Team My Student Club here. ${s} was matched with you${since ? ` on ${formatDate(since)}` : ''} and the intro is not marked as sent yet. Could you send the intro message on WhatsApp today and tick it on your dashboard? Thank you!`,
    no_call_8d: `Hi ${m}, Team My Student Club here. We don't see a weekly call with ${s} in the last 8 days. Could you fix a 15-minute call this week and log it on your dashboard? Thank you!`,
    no_applications_2w: `Hi ${m}, Team My Student Club here. How are ${s}'s applications going? Could you set a small target with them this week and log it after your call? Hojayega!`,
  }[kind];
  return t || `Hi ${m}, Team My Student Club here. Just checking in on how it is going with ${s}. Could you make sure this week's call happens and is logged on your dashboard? Thank you!`;
}
export function menteeNudge(kind, { mentee = '', mentor = '', program = '' } = {}) {
  const s = firstName(mentee) || 'there';
  if (kind === 'unmatched') {
    return `Hi ${s}, Team My Student Club here. You are enrolled in the ${programLabel(program || 'industrial-training')} program but have not picked your mentor yet. Pick one here: https://www.mystudentclub.com/mentorship/find/ Hojayega!`;
  }
  if (kind === 'mentee_no_contact') return `Hi ${s}, Team My Student Club here. Your mentor${mentor ? `, ${firstName(mentor)},` : ''} is ready to start, but we do not have your WhatsApp number. Please add it on your My mentor page: https://www.mystudentclub.com/mentorship/my-mentor/`;
  if (kind === 'safety_flag') return `Hi ${s}, Team My Student Club here. Thank you for your review. We would like to understand what happened with your mentor. Is now a good time to talk?`;
  return `Hi ${s}, Team My Student Club here. Checking in on your mentorship${mentor ? ` with ${firstName(mentor)}` : ''}. How is it going so far?`;
}

/* ---------- mentor card (same markup as the find page, per SPEC §9.1) ----- */

export function mentorCardHtml(m, { minReviews = DEFAULT_CONFIG.min_reviews_for_rating, foot = null, lines = 2 } = {}) {
  const journey = journeyLines(m).slice(0, lines);
  const max = Number(m.max_mentees || 0);
  const active = Number(m.active_mentees ?? m.active_count ?? 0);
  const slots = m.slots_left ?? Math.max(0, max - active);
  const langs = labelsOf(LANGUAGES, m.languages).slice(0, 3).join(', ');
  const city = cityLabel(m.city);
  return html`<article class="ms-card ms-mentor-card${slots <= 0 ? ' is-full' : ''}">
    <div class="ms-mentor-card__top">
      ${avatarHtml({ name: m.full_name, photo_path: m.photo_path, size: 'lg', verified: !!m.linkedin_checked, verifiedTitle: 'LinkedIn checked by Team MSC' })}
      <div class="ms-grow">
        <div class="ms-mentor-card__name">${m.full_name || 'Unnamed'} ${m.tier ? tierChip(m.tier) : ''}</div>
        <div class="ms-mentor-card__stage">${stageLabel(m.stage, { short: true }) || 'Stage not set'}</div>
        <div class="ms-mt-8">${ratingHtml(m.rating_avg, m.review_count, minReviews)}</div>
      </div>
    </div>
    ${m.headline ? html`<p class="ms-mentor-card__headline ms-clamp-2">${m.headline}</p>` : html`<p class="ms-mentor-card__headline ms-muted">No headline yet.</p>`}
    ${journey.length ? html`<div class="ms-mentor-card__journey">${journey.map((l) => html`<div><i class="fas ${l.icon}" aria-hidden="true"></i><span><strong>${l.label}:</strong> ${l.text}</span></div>`)}</div>` : ''}
    <div class="ms-mentor-card__meta">
      ${langs ? html`<span><i class="fas fa-language" aria-hidden="true"></i>${langs}</span>` : ''}
      ${city ? html`<span><i class="fas fa-location-dot" aria-hidden="true"></i>${city}</span>` : ''}
    </div>
    <div class="ms-mentor-card__foot">
      <span class="ms-slots${slots <= 0 ? ' is-full' : slots <= 2 ? ' is-low' : ''}"><span class="ms-dot" aria-hidden="true"></span>${slots <= 0 ? 'Full' : `${plural(slots, 'slot')} left`}</span>
      ${foot || ''}
    </div>
  </article>`;
}

/* ---------- filter chips (radio) ------------------------------------------ */

let _chipSeq = 0;
/** Radio chips: options [{value, label, count?}]. Returns markup; read with chipsValue(el). */
export function chipsHtml(name, options, value, { label = 'Filter' } = {}) {
  const id = `${name}-${++_chipSeq}`;
  return html`<div class="ms-admin-chips" role="radiogroup" aria-label="${label}" data-chips="${name}">${options.map((o) => html`
    <label class="ms-choice"><input type="radio" name="${id}" value="${o.value}"${o.value === value ? ' checked' : ''}><span>${o.label}${o.count !== undefined && o.count !== null ? html` <b class="ms-admin-chip-count">${o.count}</b>` : ''}</span></label>`)}
  </div>`;
}

/* ---------- generic text prompt ------------------------------------------- */

/**
 * askText({ title, label, hint, placeholder, value, required, min, max, picks, confirmLabel, variant, intro })
 * -> Promise<string|null> (null when cancelled).
 */
export function askText({
  title = 'Add a note', intro = '', label = 'Note', hint = '', placeholder = '', value = '', required = true,
  min = 0, max = 600, picks = [], confirmLabel = 'Save', variant = 'primary', multiline = true,
} = {}) {
  return new Promise((resolve) => {
    let result = null;
    const body = document.createElement('div');
    body.className = 'ms-stack';
    const fid = `ms-admin-ask-${Date.now()}`;
    setContent(body, html`
      ${intro ? html`<div class="ms-small ms-text-2">${intro}</div>` : ''}
      ${picks.length ? html`<div class="ms-stack" style="--ms-gap:6px"><span class="ms-xs ms-muted">Quick picks</span><div class="ms-chips">${picks.map((p, i) => html`<button type="button" class="ms-chip ms-tone-outline ms-admin-pick-chip" data-pick="${i}">${p}</button>`)}</div></div>` : ''}
      <div class="ms-field">
        <label class="ms-label" for="${fid}"><span class="${required ? 'ms-req' : ''}">${label}</span></label>
        ${multiline
          ? html`<textarea class="ms-textarea" id="${fid}" rows="3" maxlength="${max}" placeholder="${placeholder}">${value}</textarea>`
          : html`<input class="ms-input" id="${fid}" maxlength="${max}" placeholder="${placeholder}" value="${value}">`}
        <div class="ms-row ms-between">${hint ? html`<span class="ms-hint">${hint}</span>` : html`<span></span>`}<span class="ms-counter" data-counter></span></div>
        <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span data-err></span></span>
      </div>`);
    const input = body.querySelector(`#${fid}`);
    const field = input.closest('.ms-field');
    const counter = body.querySelector('[data-counter]');
    const count = () => { counter.textContent = `${input.value.length} / ${max}`; };
    count();
    input.addEventListener('input', () => { count(); field.classList.remove('is-invalid'); });
    body.querySelectorAll('[data-pick]').forEach((b) => b.addEventListener('click', () => {
      input.value = picks[Number(b.dataset.pick)] || '';
      count(); field.classList.remove('is-invalid'); input.focus();
    }));
    openModal({
      title, body, onClose: () => resolve(result),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: confirmLabel, variant,
          onClick: () => {
            const v = input.value.trim();
            const err = (required && !v) ? 'This is required.' : (v && v.length < min) ? `Please write at least ${min} characters.` : '';
            if (err) { body.querySelector('[data-err]').textContent = err; field.classList.add('is-invalid'); input.focus(); return false; }
            result = v;
            return true;
          },
        },
      ],
    });
    setTimeout(() => input.focus(), 30);
  });
}

/* ---------- mentor picker ------------------------------------------------- */

/**
 * pickMentor({ title, intro, program, excludeIds, confirmLabel, reason: {label, placeholder, min, required, picks}, allowForce })
 * -> Promise<{ mentor, force, reason } | null>
 * Lists approved mentors for the program; full / not-accepting mentors appear only with "force".
 */
export async function pickMentor({
  title = 'Pick a mentor', intro = '', program = null, excludeIds = [], confirmLabel = 'Assign',
  reason = null, allowForce = true,
} = {}) {
  let mentors;
  try { mentors = await load.mentors(); } catch (e) { showError(e); return null; }
  const pool = mentors
    .filter((m) => m.status === 'approved' && (!program || (m.programs || []).includes(program)) && !excludeIds.includes(m.id))
    .map((m) => ({ ...m, _slots: Math.max(0, Number(m.max_mentees || 0) - Number(m.active_count || 0)) }))
    .map((m) => ({ ...m, _open: !!m.accepting && m._slots > 0 }))
    .sort((a, b) => (Number(b._open) - Number(a._open)) || (b._slots - a._slots)
      || (Number(b.rating_avg || 0) - Number(a.rating_avg || 0)) || String(a.full_name).localeCompare(String(b.full_name)));

  return new Promise((resolve) => {
    let result = null;
    const seq = Date.now();
    const body = document.createElement('div');
    body.className = 'ms-stack ms-admin-picker';
    setContent(body, html`
      ${intro ? html`<p class="ms-small ms-text-2">${intro}</p>` : ''}
      <label class="ms-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input class="ms-input" type="search" placeholder="Search name, company, domain, city" data-q aria-label="Search mentors"></label>
      ${allowForce ? html`<label class="ms-switch ms-small"><input type="checkbox" data-force><span class="ms-switch__track"></span><span>Include full mentors and those not taking new mentees (override capacity)</span></label>` : ''}
      <div class="ms-options ms-admin-picker__list" data-list role="radiogroup" aria-label="Mentors"></div>
      ${reason ? html`<div class="ms-field" data-reason-field>
        <label class="ms-label" for="pick-reason-${seq}"><span class="${reason.required === false ? '' : 'ms-req'}">${reason.label || 'Reason'}</span></label>
        ${reason.picks?.length ? html`<div class="ms-chips">${reason.picks.map((p, i) => html`<button type="button" class="ms-chip ms-tone-outline ms-admin-pick-chip" data-rpick="${i}">${p}</button>`)}</div>` : ''}
        <textarea class="ms-textarea" id="pick-reason-${seq}" rows="2" maxlength="600" placeholder="${reason.placeholder || ''}" data-reason></textarea>
        <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span data-reason-err>Please add a reason.</span></span>
      </div>` : ''}
      <div class="ms-error ms-admin-picker__err" data-pick-err><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span>Pick a mentor first.</span></div>`);

    const q = body.querySelector('[data-q]');
    const forceEl = body.querySelector('[data-force]');
    const list = body.querySelector('[data-list]');
    const pickErr = body.querySelector('[data-pick-err]');
    let selected = '';

    const draw = () => {
      const term = q.value.trim().toLowerCase();
      const force = !!forceEl?.checked;
      const rows = pool.filter((m) => (force || m._open) && (!term || mentorHaystack(m).includes(term)));
      if (!rows.length) {
        setContent(list, emptyState({ icon: 'fa-user-slash', title: pool.length ? 'No mentor matches' : 'No approved mentors for this program', text: pool.some((m) => !m._open) && !force ? 'Some mentors are full or not taking new mentees. Turn on the override to see them.' : '' }));
        return;
      }
      setContent(list, html`${rows.map((m) => {
        const company = m.it_company || m.employer || m.articleship_firm || '';
        return html`<label class="ms-option ms-admin-pick${m._open ? '' : ' is-full'}">
          <input type="radio" name="pick-${seq}" value="${m.id}"${m.id === selected ? ' checked' : ''}>
          <span class="ms-option__mark"></span>
          <span class="ms-option__body">
            <span class="ms-option__title">${m.full_name} <span class="ms-admin-pick__rating">${ratingHtml(m.rating_avg, m.review_count)}</span></span>
            <span class="ms-option__desc">${[stageLabel(m.stage, { short: true }), company, cityLabel(m.city)].filter(Boolean).join(' · ')}</span>
            <span class="ms-option__desc"><span class="ms-slots${m._slots <= 0 ? ' is-full' : m._slots <= 2 ? ' is-low' : ''}">${m.active_count || 0} of ${m.max_mentees || 0} mentees · ${m._slots <= 0 ? 'full' : `${plural(m._slots, 'slot')} free`}</span>${m.accepting ? '' : html` <span class="ms-badge ms-tone-amber">Not taking new mentees</span>`}</span>
          </span>
        </label>`;
      })}`);
    };
    draw();
    q.addEventListener('input', debounce(draw, 120));
    forceEl?.addEventListener('change', draw);
    list.addEventListener('change', (e) => { if (e.target.name === `pick-${seq}`) { selected = e.target.value; pickErr.classList.remove('is-shown'); } });
    const reasonEl = body.querySelector('[data-reason]');
    reasonEl?.addEventListener('input', () => reasonEl.closest('.ms-field').classList.remove('is-invalid'));
    body.querySelectorAll('[data-rpick]').forEach((b) => b.addEventListener('click', () => {
      reasonEl.value = reason.picks[Number(b.dataset.rpick)] || '';
      reasonEl.closest('.ms-field').classList.remove('is-invalid');
    }));

    openModal({
      title, body, wide: true, onClose: () => resolve(result),
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: confirmLabel, variant: 'primary',
          onClick: () => {
            const mentor = pool.find((m) => m.id === selected);
            if (!mentor) { pickErr.classList.add('is-shown'); return false; }
            const text = reasonEl ? reasonEl.value.trim() : '';
            const min = reason?.min ?? 5;
            if (reason && reason.required !== false && text.length < min) {
              body.querySelector('[data-reason-err]').textContent = text ? `Please write at least ${min} characters.` : 'Please add a reason.';
              reasonEl.closest('.ms-field').classList.add('is-invalid');
              reasonEl.focus();
              return false;
            }
            result = { mentor, force: !mentor._open, reason: text || null };
            return true;
          },
        },
      ],
    });
    setTimeout(() => q.focus(), 30);
  });
}

/* ---------- misc ---------------------------------------------------------- */

export function errorBlock(err, onRetryId = '') {
  return html`<div class="ms-callout ms-callout--danger"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><div>
    <span class="ms-callout__title">Could not load this</span>${err?.message || 'Something went wrong. Please try again.'}
    ${onRetryId ? html`<div class="ms-mt-8"><button type="button" class="ms-btn ms-btn--outline ms-btn--sm" id="${onRetryId}"><i class="fas fa-rotate" aria-hidden="true"></i><span>Try again</span></button></div>` : ''}
  </div></div>`;
}

export function sumBy(rows, fn) { return rows.reduce((a, r) => a + (Number(fn(r)) || 0), 0); }
