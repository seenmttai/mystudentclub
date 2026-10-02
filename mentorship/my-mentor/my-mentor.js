/* =============================================================================
   My mentor (/mentorship/my-mentor/). Owner: student builder. Spec: SPEC.md §9.2.
   Mentor contact, step-by-step progress, weekly pulse (?pulse=1), review after
   review_after_days (?review=1), switch request, resources and past mentors.
   ========================================================================== */
import {
  initPage, rpc, html, setContent, showError, skeleton, qs, $, toast, openModal, setBusy,
  loginUrl, PATHS, PROGRAMS, programLabel, enabledPrograms, programCopy,
  normalizePhone, isValidIndianMobile, isValidPersonName,
  HUNT_STAGES, REVIEW_TAGS, CHECKLIST_ITEMS, CALL_SLOTS, RESOURCES, LIMITS,
  avatarHtml, tierChip, ratingHtml, stageLabel, journeyLines, starsHtml, statusBadge,
  labelOf, labelsOf, firstName, plural, formatDate, formatPhone, timeAgo, istWeekStart, weekNumber, daysSince,
  waLink, telLink, mailtoLink, safeUrl, track,
} from '/mentorship/assets/mentorship-core.js?v=1';
import {
  openMentorProfile, includesHtml, neverListHtml, notReadyHtml, errorStateHtml, sitePath, DISCLAIMER,
} from '/mentorship/find/mentor-ui.js?v=1';

const main = document.getElementById('ms-main');
setContent(main, html`<div class="ms-container ms-section">${skeleton('page')}</div>`);

const ctx = await initPage({ active: 'my-mentor' });
const config = ctx.config || {};
const minReviews = Number(config.min_reviews_for_rating ?? 3);
const reviewDays = Number(config.review_after_days ?? 28);
const enabled = enabledPrograms(config);
const switchLimit = Math.max(1, Number(config.switch_limit ?? 1));
const switchTimes = switchLimit === 1 ? 'once' : switchLimit === 2 ? 'twice' : `${switchLimit} times`;

const RATING_WORDS = { 1: 'Not helpful', 2: 'Could be better', 3: 'Okay', 4: 'Good', 5: 'Excellent' };
const PULSE_FIELDS_DEFAULT = { applications: 0, stage: '', called: null, rating: 0, issue: '' };

/** Student-facing steps, tied to the mentor's checklist keys (key null = recurring). */
const STEPS = [
  { key: 'intro_sent', title: 'Intro on WhatsApp', text: 'Within 24 hours of matching. Save the number and send your CV.', when: 'Day 1' },
  { key: 'first_call', title: 'First call', text: 'Your stage, target domains and where you have applied so far.', when: 'First few days' },
  { key: null, title: 'A call every week', text: 'Applications, shortlists, interviews and one focus for the next week.', when: 'Every week' },
  { key: 'cv_reviewed', title: 'CV review', text: 'Line-by-line feedback, then a re-check of your new version.', when: 'First week' },
  { key: 'resources_shared', title: 'The right MSC resources', text: 'Guidebook, interview booklets and openings for your domain.', when: 'First week' },
  { key: 'mock_interview', title: 'Mock interview', text: 'At least one full mock before your real interviews.', when: 'Before interviews' },
  { key: 'offer_received', title: 'Offer', text: 'Go through the offer letter together before you accept.', when: 'When it comes' },
  { key: 'joining_formalities', title: 'Joining formalities', text: 'Documents, ICAI paperwork and first-week doubts.', when: 'After the offer' },
  { key: 'joined', title: 'You join', text: 'Your first day. All the best!', when: 'Joining' },
  { key: 'joining_post', title: 'Joining post on LinkedIn', text: 'Tag Padam Bhansali, My Student Club, your mentor and your parents. They earned it too.', when: 'First week after joining' },
];

const state = { data: null, matches: [], current: null, pulseOpen: false, reviewEditing: false, uid: 0 };
const nextId = (p) => `${p}-${++state.uid}`;

/* ---- helpers ------------------------------------------------------------------ */

function setParam(key, value) {
  const u = new URL(location.href);
  if (value === null || value === undefined || value === '') u.searchParams.delete(key);
  else u.searchParams.set(key, value);
  history.replaceState(history.state, '', u.pathname + u.search + u.hash);
}
const programInfo = (p) => PROGRAMS[p] || PROGRAMS['industrial-training'];
const findUrl = (p) => (enabled.length > 1 ? `${PATHS.find}?program=${encodeURIComponent(p)}` : PATHS.find);
const mentorFirst = (m) => m?.first_name || firstName(m?.full_name);
const studentName = () => state.data?.student?.full_name || ctx.student?.full_name || ctx.name || '';
const weekLabel = (ymd) => formatDate(`${ymd}T12:00:00+05:30`, { year: undefined });

function counterHtml(id, max, len = 0) {
  return html`<div class="ms-counter" data-counter-for="${id}">${len} / ${max}</div>`;
}
function bindCounters(root) {
  root.querySelectorAll('[data-counter-for]').forEach((c) => {
    const input = root.querySelector(`#${c.dataset.counterFor}`);
    if (!input) return;
    const max = Number(input.getAttribute('maxlength')) || 0;
    const upd = () => { c.textContent = `${input.value.length} / ${max}`; c.classList.toggle('is-over', input.value.length > max); };
    input.addEventListener('input', upd);
    upd();
  });
}
function starInputHtml(name, value, idp) {
  return html`<div class="ms-star-input" role="radiogroup" aria-label="Rating out of 5">${[5, 4, 3, 2, 1].map((n) => html`
    <input type="radio" name="${name}" id="${idp}-${n}" value="${n}"${Number(value) === n ? ' checked' : ''}><label for="${idp}-${n}" title="${n}: ${RATING_WORDS[n]}"><span aria-hidden="true">★</span><span class="ms-sr-only">${n} stars, ${RATING_WORDS[n]}</span></label>`)}</div>`;
}
function bindStarWords(root, name) {
  const out = root.querySelector(`[data-star-word="${name}"]`);
  if (!out) return;
  const upd = () => { const v = root.querySelector(`input[name="${name}"]:checked`)?.value; out.textContent = v ? RATING_WORDS[v] : 'Tap a star'; };
  root.addEventListener('change', (e) => { if (e.target.name === name) upd(); });
  upd();
}
function markInvalid(root, field, invalid) {
  root.querySelector(`[data-field="${field}"]`)?.classList.toggle('is-invalid', !!invalid);
}
function scrollToCard(id) {
  const el = document.getElementById(id);
  if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

/* ---- states without an active match --------------------------------------------- */

function renderLoggedOut() {
  const pulse = qs('pulse') === '1';
  setContent(main, html`
    <section class="ms-hero"><div class="ms-container"><div class="ms-hero__inner">
      <span class="ms-eyebrow"><i class="fas fa-user-group" aria-hidden="true"></i> My mentor</span>
      <h1 class="ms-h1">${pulse ? 'Log in to share how this week went' : 'Your mentor, all in one place'}</h1>
      <p class="ms-lead">${pulse
        ? 'Your weekly check-in takes 30 seconds. Log in and it opens right away.'
        : 'Your mentor’s WhatsApp, your weekly check-in and every step from first call to joining. Log in to see it.'}</p>
      <div class="ms-btn-row ms-btn-row--stack">
        <a class="ms-btn ms-btn--primary ms-btn--lg" href="${loginUrl()}"><i class="fas fa-right-to-bracket" aria-hidden="true"></i><span>Log in to continue</span></a>
        <a class="ms-btn ms-btn--secondary ms-btn--lg" href="${PATHS.hub}"><span>How mentorship works</span></a>
      </div>
    </div></div></section>
    <div class="ms-container ms-section ms-stack" style="--ms-gap:20px">
      <h2 class="ms-h2">What your mentor does</h2>
      ${includesHtml()}
      <p class="ms-find-note"><i class="fas fa-shield-halved" aria-hidden="true"></i> ${DISCLAIMER}</p>
    </div>`);
}

function mentorRoleCallout() {
  const st = ctx.mentor?.status;
  if (!st) return '';
  const target = ['approved', 'paused'].includes(st) ? { href: PATHS.mentor, label: 'Open mentor dashboard' }
    : ['submitted', 'training_passed'].includes(st) ? { href: PATHS.training, label: 'Open mentor training' }
      : { href: PATHS.apply, label: 'Open your application' };
  return html`<div class="ms-callout ms-callout--gray"><i class="fas fa-hand-holding-heart" aria-hidden="true"></i><div class="ms-grow">
    <span class="ms-callout__title">Looking for your mentor side?</span>This page is for students. Your mentoring lives on its own page.
    <div class="ms-mt-8"><a class="ms-btn ms-btn--outline ms-btn--sm" href="${target.href}"><span>${target.label}</span></a></div></div></div>`;
}

/** A finished mentorship and no active one: completed (they joined) or closed early by Team MSC. */
function renderClosed(x, past) {
  const m = x.mentor || {};
  const first = mentorFirst(m);
  const prog = programInfo(x.program);
  const done = x.status === 'completed';
  const name = firstName(studentName());
  const otherOpen = enabled.filter((p) => p !== x.program && (ctx.enrolledPrograms || []).includes(p)
    && !(ctx.closedMatches || []).some((c) => c.program === p));
  setContent(main, html`
    <section class="ms-hero"><div class="ms-container"><div class="ms-hero__inner">
      <span class="ms-eyebrow"><i class="fas fa-user-group" aria-hidden="true"></i> My mentor · ${prog.label}</span>
      <h1 class="ms-h1">${done ? 'Your mentorship is complete' : 'Your mentorship was closed'}</h1>
      <p class="ms-lead">${done
        ? `${name ? `Well done, ${name}. ` : ''}Thank you for working with ${first} through your ${programCopy(x.program).hunt}. All the best for the road ahead!`
        : `Team MSC closed your mentorship with ${first}. Want to continue with a new mentor? Write to us and we will set one up with you.`}</p>
      <div class="ms-btn-row ms-btn-row--stack">
        ${done
          ? (x.can_review || x.review ? html`<button type="button" class="ms-btn ms-btn--primary ms-btn--lg" data-past-review="${x.match_id}"><i class="fas fa-star" aria-hidden="true"></i><span>${x.review ? 'Edit your review' : `Review ${first}`}</span></button>` : '')
          : html`<a class="ms-btn ms-btn--primary ms-btn--lg" href="${PATHS.contact}"><i class="fas fa-envelope" aria-hidden="true"></i><span>Contact Team MSC</span></a>`}
        <a class="ms-btn ms-btn--secondary ms-btn--lg" href="${PATHS.hub}"><span>Back to mentorship</span></a>
      </div>
    </div></div></section>
    <div class="ms-container ms-section ms-stack" style="--ms-gap:20px" id="mm-closed">
      ${otherOpen.length ? html`<div class="ms-callout"><i class="fas fa-circle-info" aria-hidden="true"></i><div>You can also pick a mentor for ${otherOpen.map((p, i) => html`${i ? ' and ' : ''}<a class="ms-link" href="${findUrl(p)}">${programLabel(p)}</a>`)}.</div></div>` : ''}
      ${done ? html`<div class="ms-card ms-card--soft"><div class="ms-card__title ms-mb-8"><i class="fab fa-linkedin" aria-hidden="true"></i> Your joining post</div>
        <p class="ms-small ms-text-2">Joined? Share it on LinkedIn and tag Padam Bhansali, My Student Club, ${first} and your parents. They earned it too. Hojayega became Ho gaya!</p></div>` : ''}
      ${past.length ? html`<div id="mm-past">${pastHtml(past)}</div>` : ''}
      <p class="ms-find-note"><i class="fas fa-shield-halved" aria-hidden="true"></i> ${DISCLAIMER}</p>
    </div>`);
  main.querySelector('.ms-hero [data-past-review]')?.addEventListener('click', (e) => openPastReview(e.currentTarget.dataset.pastReview));
}

function renderNoMatch(past) {
  // A completed mentorship (or one Team MSC closed) blocks self-booking for that program.
  const enrolledNow = ctx.enrolledPrograms || [];
  const closed = past.find((x) => x.status === 'completed' && (!enrolledNow.length || enrolledNow.includes(x.program)))
    || past.find((x) => x.status === 'ended' && (!enrolledNow.length || enrolledNow.includes(x.program))) || null;
  if (closed) { renderClosed(closed, past); return; }
  const openProgram = enabled.find((p) => (ctx.enrolledPrograms || []).includes(p));
  const prog = programInfo(openProgram || enabled[0] || 'industrial-training');
  const enrolled = !!openProgram;
  setContent(main, html`
    <section class="ms-hero"><div class="ms-container"><div class="ms-hero__inner">
      <span class="ms-eyebrow"><i class="fas fa-user-group" aria-hidden="true"></i> My mentor</span>
      <h1 class="ms-h1">${enrolled ? 'Pick your mentor' : 'Get a senior on your side'}</h1>
      <p class="ms-lead">${enrolled
        ? `A mentor is part of your ${prog.name}. Pick a senior whose journey looks like the one you want, and they message you on WhatsApp within 24 hours.`
        : `Mentors are part of the ${prog.name}. Once you enrol, you pick a senior who has done it, and they guide you every week until you join. Hojayega.`}</p>
      <div class="ms-btn-row ms-btn-row--stack">
        ${enrolled
          ? html`<a class="ms-btn ms-btn--primary ms-btn--lg" href="${findUrl(prog.key)}"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><span>Find your mentor</span></a>`
          : html`<a class="ms-btn ms-btn--primary ms-btn--lg" href="${safeUrl(prog.page)}"><span>See the program</span></a>
                 <a class="ms-btn ms-btn--secondary ms-btn--lg" href="${PATHS.find}"><span>Browse mentors</span></a>`}
      </div>
      ${!enrolled ? html`<p class="ms-small ms-text-2">Already enrolled? It can take a few minutes to show here. Refresh, or <a class="ms-link" href="${PATHS.contact}">contact us</a>.</p>` : ''}
    </div></div></section>
    <div class="ms-container ms-section ms-stack" style="--ms-gap:20px">
      ${mentorRoleCallout()}
      <div class="ms-stack" style="--ms-gap:6px"><h2 class="ms-h2">What your mentor does</h2>
        <p class="ms-text-2">Every MSC mentor has done the hunt, signed each mentor commitment and passed Team MSC's training.</p></div>
      ${includesHtml()}
      <div class="ms-card ms-card--flat"><div class="ms-card__title ms-mb-8">Your mentor will never</div>${neverListHtml()}</div>
      ${past.length ? html`<div id="mm-past">${pastHtml(past)}</div>` : ''}
      <p class="ms-find-note"><i class="fas fa-shield-halved" aria-hidden="true"></i> ${DISCLAIMER}</p>
    </div>`);
}

/* ---- main view ---------------------------------------------------------------- */

function render() {
  const active = state.matches.filter((m) => m.status === 'active');
  const past = state.matches.filter((m) => m.status !== 'active');
  const asked = qs('program');
  const cur = active.find((m) => m.program === asked) || active[0] || null;
  state.current = cur;
  if (!cur) { renderNoMatch(past); bindPast(); return; }

  const m = cur.mentor || {};
  const first = mentorFirst(m);
  const prog = programInfo(cur.program);
  const otherOpen = enabled.filter((p) => p !== cur.program && (ctx.enrolledPrograms || []).includes(p) && !active.some((x) => x.program === p));

  setContent(main, html`<div class="ms-container ms-section ms-mymentor">
    <header class="ms-mymentor-head">
      <span class="ms-eyebrow"><i class="fas fa-user-group" aria-hidden="true"></i> My mentor · ${prog.label}</span>
      <h1 class="ms-h1">${first} is your mentor</h1>
      <p class="ms-text-2">Matched on ${formatDate(cur.started_at)} · Week ${cur.week_no || weekNumber(cur.started_at)}</p>
    </header>
    ${active.length > 1 ? html`<div class="ms-tabs" role="tablist" aria-label="Program">${active.map((x) => html`
      <button type="button" class="ms-tab${x === cur ? ' is-active' : ''}" role="tab" aria-selected="${x === cur ? 'true' : 'false'}" data-program="${x.program}">${programLabel(x.program)}</button>`)}</div>` : ''}
    ${otherOpen.length ? html`<div class="ms-callout"><i class="fas fa-circle-info" aria-hidden="true"></i><div>You can also pick a mentor for ${otherOpen.map((p, i) => html`${i ? ' and ' : ''}<a class="ms-link" href="${findUrl(p)}">${programLabel(p)}</a>`)}.</div></div>` : ''}
    <div class="ms-layout ms-layout--right ms-mymentor-layout">
      <div class="ms-stack ms-mymentor-col" style="--ms-gap:16px">
        ${waNeededHtml(cur)}
        ${contactHtml(cur)}
        <section class="ms-card ms-mymentor-pulse" id="mm-pulse"></section>
        ${stepsHtml(cur)}
        <div class="ms-hojayega">Most ${programCopy(cur.program).openings} come late: sate hai, wo last last mein hi aate hai. Keep applying every week and keep ${first} posted.</div>
        <section class="ms-card" id="mm-review"></section>
      </div>
      <div class="ms-stack ms-mymentor-col" style="--ms-gap:16px">
        <section class="ms-card ms-card--flat ms-mymentor-never">
          <div class="ms-card__title ms-mb-8">${first} will never</div>
          ${neverListHtml()}
          <p class="ms-small ms-text-2 ms-mt-16">If something feels wrong, tell Team MSC through the <a class="ms-link" href="${PATHS.contact}">contact page</a>, or ask for a different mentor below.</p>
        </section>
        <section class="ms-card" id="mm-switch"></section>
        ${resourcesHtml()}
        ${past.length ? html`<div id="mm-past">${pastHtml(past)}</div>` : ''}
      </div>
    </div>
    <p class="ms-find-note ms-mt-24"><i class="fas fa-shield-halved" aria-hidden="true"></i> ${DISCLAIMER}</p>
  </div>`);

  renderPulse();
  renderReview();
  renderSwitch();
  bindMain();
  bindPast();
  bindWaForm();
}

/**
 * Team MSC can assign a mentor to a student who never filled the booking form, so there may be no
 * WhatsApp number yet: ask for it here (mentorship_save_student), or the mentor cannot reach them.
 */
function waNeededHtml(cur) {
  const s = state.data?.student;
  if (s?.whatsapp) return '';
  const first = mentorFirst(cur.mentor);
  const id = nextId('wa');
  return html`<section class="ms-card ms-mymentor-wa" id="mm-wa">
    <div class="ms-callout ms-callout--warn"><i class="fab fa-whatsapp" aria-hidden="true"></i><div>
      <span class="ms-callout__title">Add your WhatsApp so ${first} can reach you</span>
      Team MSC matched you with ${first}, but we do not have your WhatsApp number yet. Add it here and ${first} will message you.</div></div>
    <form class="ms-form ms-mt-16" novalidate data-wa-form>
      <div class="ms-form-grid">
        <div class="ms-field" data-field="name"><label class="ms-label" for="${id}-name"><span class="ms-req">Your full name</span></label>
          <input class="ms-input" id="${id}-name" name="name" autocomplete="name" maxlength="${LIMITS.full_name}" value="${s?.full_name || studentName()}">
          <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Use letters only, like on your ICAI records.</span></div>
        <div class="ms-field" data-field="wa"><label class="ms-label" for="${id}-wa"><span class="ms-req">Your WhatsApp number</span></label>
          <div class="ms-input-group"><span class="ms-input-group__addon">+91</span><input class="ms-input" id="${id}-wa" name="whatsapp" type="tel" inputmode="numeric" autocomplete="tel-national" maxlength="14" placeholder="98765 43210"></div>
          <span class="ms-hint">Only ${first} and Team MSC see this.</span>
          <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Enter a 10-digit Indian mobile number.</span></div>
      </div>
      <div class="ms-btn-row ms-mt-16"><button type="submit" class="ms-btn ms-btn--primary"><span>Save my number</span></button></div>
    </form>
  </section>`;
}

function bindWaForm() {
  const form = main.querySelector('[data-wa-form]');
  if (!form) return;
  form.addEventListener('input', (e) => e.target.closest('[data-field]')?.classList.remove('is-invalid'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.querySelector('[name="name"]').value.trim().replace(/\s+/g, ' ');
    const wa = form.querySelector('[name="whatsapp"]').value;
    const bad = { name: !isValidPersonName(name), wa: !isValidIndianMobile(wa) };
    Object.entries(bad).forEach(([k, v]) => markInvalid(form, k, v));
    if (bad.name || bad.wa) { form.querySelector('.is-invalid input')?.focus(); return; }
    const btn = form.querySelector('[type="submit"]');
    setBusy(btn, true);
    try {
      await rpc('mentorship_save_student', { p_full_name: name, p_whatsapp: normalizePhone(wa), p_city: state.data?.student?.city || null });
      toast(`Saved. ${mentorFirst(state.current?.mentor) || 'Your mentor'} can reach you on WhatsApp now.`, { type: 'success' });
      track('mentorship_student_whatsapp_added', {});
      await load();
    } catch (err) {
      const hint = String(err.hint || '');
      if (err.code === 'invalid_input' && /name/.test(hint)) markInvalid(form, 'name', true);
      else if (err.code === 'invalid_input' && /whatsapp/.test(hint)) markInvalid(form, 'wa', true);
      else showError(err);
    } finally { setBusy(btn, false); }
  });
}

function contactHtml(cur) {
  const m = cur.mentor || {};
  const first = mentorFirst(m);
  const hello = `Hi ${first}, this is ${studentName() || 'your mentee'} from My Student Club (${programLabel(cur.program)}).`;
  const wa = waLink(m.whatsapp, hello);
  const tel = telLink(m.whatsapp);
  const mail = mailtoLink(m.email, `${programLabel(cur.program)} mentorship`);
  const topmate = safeUrl(m.topmate_url, { allowRelative: false });
  const lines = journeyLines(m).slice(0, 2);
  const slots = labelsOf(CALL_SLOTS, m.call_slots || []);
  return html`<section class="ms-card ms-contact ms-mymentor-contact" aria-label="Your mentor">
    <div class="ms-person">
      ${avatarHtml({ name: m.full_name, photo_path: m.photo_path, size: 'lg', verified: !!m.linkedin_checked, verifiedTitle: 'LinkedIn checked by Team MSC' })}
      <div class="ms-grow">
        <div class="ms-mentor-card__name"><span class="ms-mymentor-name">${m.full_name}</span>${tierChip(m.tier)}</div>
        <div class="ms-person__sub">${stageLabel(m.stage, { short: true })}</div>
        <div class="ms-mt-8">${ratingHtml(m.rating_avg, m.review_count, minReviews)}</div>
      </div>
    </div>
    ${m.headline ? html`<p class="ms-mentor-card__headline">${m.headline}</p>` : ''}
    ${lines.length ? html`<div class="ms-mentor-card__journey">${lines.map((l) => html`<div><i class="fas ${l.icon}" aria-hidden="true"></i><span><strong>${l.label}:</strong> ${l.text}</span></div>`)}</div>` : ''}
    <div class="ms-contact__actions ms-mymentor-actions">
      ${wa ? html`<a class="ms-btn ms-btn--whatsapp" href="${wa}" target="_blank" rel="noopener" data-track="wa"><i class="fab fa-whatsapp" aria-hidden="true"></i><span>WhatsApp ${first}</span></a>` : ''}
      ${tel ? html`<a class="ms-btn ms-btn--outline" href="${tel}" data-track="call"><i class="fas fa-phone" aria-hidden="true"></i><span>Call</span></a>` : ''}
      ${mail ? html`<a class="ms-btn ms-btn--outline" href="${mail}" data-track="email"><i class="fas fa-envelope" aria-hidden="true"></i><span>Email</span></a>` : ''}
    </div>
    <dl class="ms-kv ms-mymentor-kv">
      ${m.whatsapp ? html`<dt>WhatsApp</dt><dd>${formatPhone(m.whatsapp)}</dd>` : ''}
      ${m.email ? html`<dt>Email</dt><dd>${m.email}</dd>` : ''}
      ${slots.length ? html`<dt>Usually free</dt><dd>${slots.join(' · ')}</dd>` : ''}
    </dl>
    <div class="ms-row ms-mymentor-links">
      <button type="button" class="ms-btn ms-btn--soft ms-btn--sm" data-action="profile"><i class="fas fa-id-badge" aria-hidden="true"></i><span>Full profile</span></button>
      ${topmate ? html`<a class="ms-btn ms-btn--ghost ms-btn--sm" href="${topmate}" target="_blank" rel="noopener"><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i><span>Topmate</span></a>` : ''}
    </div>
    <p class="ms-hint"><i class="fas fa-circle-info" aria-hidden="true"></i> Save ${first}'s number so messages reach you. For something urgent, like an interview in an hour, message first and call. ${first} calls back as soon as they can.</p>
  </section>`;
}

function stepsHtml(cur) {
  const cl = cur.checklist && typeof cur.checklist === 'object' ? cur.checklist : null;
  const keys = CHECKLIST_ITEMS.map((c) => c.key);
  const done = cl ? keys.filter((k) => cl[k]).length : 0;
  const nextKey = cl ? STEPS.find((s) => s.key && !cl[s.key])?.key : null;
  const week = cur.week_no || weekNumber(cur.started_at);
  return html`<section class="ms-card ms-mymentor-steps" id="mm-steps">
    <div class="ms-card__head">
      <div><h2 class="ms-card__title">${cl ? 'Your progress' : 'What to expect'}</h2>
        <div class="ms-card__sub">${cl ? `${mentorFirst(cur.mentor)} ticks these off as you go.` : 'Every MSC mentor follows these steps with you.'}</div></div>
      ${cl ? html`<span class="ms-badge ms-tone-blue">${done} of ${keys.length} done</span>` : ''}
    </div>
    ${cl ? html`<div class="ms-progress ms-progress--green ms-mb-16" role="progressbar" aria-valuemin="0" aria-valuemax="${keys.length}" aria-valuenow="${done}" aria-label="Progress"><div class="ms-progress__bar" style="width:${Math.round((done / keys.length) * 100)}%"></div></div>` : ''}
    <ol class="ms-timeline ms-find-timeline ms-mymentor-timeline">${STEPS.map((s) => {
      const isDone = !!(cl && s.key && cl[s.key]);
      const cls = isDone ? 'is-good' : !cl ? '' : s.key === null || s.key === nextKey ? '' : 'is-muted';
      const meta = isDone ? `Done ${formatDate(cl[s.key].done_at, { year: undefined })}`
        : s.key === null ? `You are in week ${week}` : s.when;
      return html`<li class="${cls}${s.key === nextKey ? ' is-next' : ''}">
        <div class="ms-row ms-between" style="--ms-gap:4px 10px"><div class="ms-timeline__title">${s.title}</div>
          <span class="ms-xs ${isDone ? 'ms-mymentor-done' : 'ms-muted'}">${isDone ? html`<i class="fas fa-check" aria-hidden="true"></i> ` : ''}${meta}</span></div>
        <div class="ms-timeline__meta">${s.text}</div></li>`;
    })}</ol>
  </section>`;
}

function resourcesHtml() {
  const links = sitePath(config.links_url || `${PATHS.links}`) || PATHS.links;
  const pick = ['it_guidebook', 'cv_reviewer', 'jobs', 'lms'];
  const items = RESOURCES.filter((r) => pick.includes(r.key));
  return html`<section class="ms-card ms-mymentor-res">
    <h2 class="ms-card__title ms-mb-8">MSC resources</h2>
    <a class="ms-mymentor-res__main" href="${links}" target="_blank" rel="noopener">
      <span class="ms-mymentor-res__icon"><i class="fas fa-link" aria-hidden="true"></i></span>
      <span class="ms-grow"><strong>Everything MSC has, one link</strong><span class="ms-xs ms-text-2">mystudentclub.com/links</span></span>
      <i class="fas fa-arrow-up-right-from-square ms-muted" aria-hidden="true"></i></a>
    <ul class="ms-mymentor-res__list">${items.map((r) => html`<li><a class="ms-link" href="${sitePath(r.url)}" target="_blank" rel="noopener"><i class="fas ${r.icon}" aria-hidden="true"></i>${r.label}</a></li>`)}</ul>
  </section>`;
}

function pastHtml(past) {
  return html`<section class="ms-card ms-mymentor-past"><h2 class="ms-card__title ms-mb-8">Past mentors</h2>
    <ul class="ms-mymentor-past__list">${past.map((x) => {
      const m = x.mentor || {};
      return html`<li>
        <div class="ms-person">${avatarHtml({ name: m.full_name, photo_path: m.photo_path, size: 'sm' })}
          <div class="ms-grow"><div class="ms-person__name">${m.full_name}</div>
            <div class="ms-person__sub">${programLabel(x.program)} · from ${formatDate(x.started_at, { year: undefined })}</div></div>
          ${statusBadge('match', x.status)}</div>
        ${x.review ? html`<button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-past-review="${x.match_id}"><i class="fas fa-pen" aria-hidden="true"></i><span>Edit your review</span></button>`
          : x.can_review ? html`<button type="button" class="ms-btn ms-btn--soft ms-btn--sm" data-past-review="${x.match_id}"><i class="fas fa-star" aria-hidden="true"></i><span>Review ${mentorFirst(m)}</span></button>` : ''}
      </li>`;
    })}</ul></section>`;
}

/* ---- pulse -------------------------------------------------------------------- */

function renderPulse() {
  const box = $('#mm-pulse');
  const cur = state.current;
  if (!box || !cur) return;
  const first = mentorFirst(cur.mentor);
  const p = cur.pulse_this_week;
  const ws = istWeekStart();
  const head = html`<div class="ms-card__head">
    <div><h2 class="ms-card__title"><i class="fas fa-heart-pulse ms-mymentor-pulse__icon" aria-hidden="true"></i>Weekly check-in</h2>
      <div class="ms-card__sub">Week of ${weekLabel(ws)} · Takes 30 seconds</div></div>
    ${p ? html`<span class="ms-badge ms-tone-green"><i class="fas fa-check" aria-hidden="true"></i>Done</span>` : html`<span class="ms-badge ms-tone-amber">Due this week</span>`}
  </div>`;
  const privacy = html`<p class="ms-hint ms-mymentor-private"><i class="fas fa-lock" aria-hidden="true"></i> Your answers go to Team MSC, not to your mentor.</p>`;

  if (state.pulseOpen) {
    const idp = nextId('pl');
    const v = p ? { applications: p.applications_count ?? 0, stage: p.hunt_stage || '', called: p.mentor_called, rating: p.rating, issue: p.issue || '' } : { ...PULSE_FIELDS_DEFAULT };
    setContent(box, html`${head}${privacy}
      <form class="ms-form ms-mymentor-pulse-form ms-mt-16" novalidate>
        <div class="ms-field" data-field="apps">
          <label class="ms-label" for="${idp}-apps">Applications you sent this week</label>
          <div class="ms-mymentor-stepper">
            <button type="button" class="ms-icon-btn" data-step="-1" aria-label="One less"><i class="fas fa-minus" aria-hidden="true"></i></button>
            <input class="ms-input" id="${idp}-apps" name="applications" type="number" inputmode="numeric" min="0" max="500" step="1" value="${v.applications}">
            <button type="button" class="ms-icon-btn" data-step="1" aria-label="One more"><i class="fas fa-plus" aria-hidden="true"></i></button>
          </div>
          <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Enter a number from 0 to 500.</span>
        </div>
        <fieldset class="ms-fieldset ms-field" data-field="stage"><legend class="ms-label"><span class="ms-req">Where are you in the hunt?</span></legend>
          <div class="ms-choices">${HUNT_STAGES.map((s) => html`<label class="ms-choice"><input type="radio" name="stage" value="${s.key}"${v.stage === s.key ? ' checked' : ''}><span>${s.label}</span></label>`)}</div>
          <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Pick the one closest to where you are.</span>
        </fieldset>
        <fieldset class="ms-fieldset ms-field" data-field="called"><legend class="ms-label"><span class="ms-req">Did ${first} call you this week?</span></legend>
          <div class="ms-options ms-options--2 ms-mymentor-yesno">
            <label class="ms-option"><input type="radio" name="called" value="yes"${v.called === true ? ' checked' : ''}><span class="ms-option__mark"></span><span class="ms-option__body"><span class="ms-option__title">Yes</span></span></label>
            <label class="ms-option"><input type="radio" name="called" value="no"${v.called === false ? ' checked' : ''}><span class="ms-option__mark"></span><span class="ms-option__body"><span class="ms-option__title">No</span></span></label>
          </div>
          <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Please choose one.</span>
        </fieldset>
        <fieldset class="ms-fieldset ms-field" data-field="rating"><legend class="ms-label"><span class="ms-req">How is ${first} doing as your mentor?</span></legend>
          <div class="ms-row" style="--ms-gap:12px">${starInputHtml('rating', v.rating, `${idp}-r`)}<span class="ms-small ms-text-2" data-star-word="rating"></span></div>
          <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Tap a star to rate.</span>
        </fieldset>
        <div class="ms-field">
          <label class="ms-label" for="${idp}-issue">Anything wrong? <span class="ms-vis ms-vis--private"><i class="fas fa-lock" aria-hidden="true"></i>Only Team MSC</span></label>
          <textarea class="ms-textarea ms-mymentor-short" id="${idp}-issue" name="issue" maxlength="${LIMITS.issue}" rows="3" placeholder="Optional. Late responses, a missed call, anything at all.">${v.issue}</textarea>
          ${counterHtml(`${idp}-issue`, LIMITS.issue, v.issue.length)}
        </div>
        <div class="ms-btn-row ms-btn-row--stack">
          <button type="submit" class="ms-btn ms-btn--primary"><span>${p ? 'Update check-in' : 'Submit check-in'}</span></button>
          <button type="button" class="ms-btn ms-btn--ghost" data-action="pulse-cancel"><span>Cancel</span></button>
        </div>
      </form>`);
    const form = box.querySelector('form');
    bindCounters(form);
    bindStarWords(form, 'rating');
    form.addEventListener('click', (e) => {
      const b = e.target.closest('[data-step]');
      if (!b) return;
      const input = form.querySelector('[name="applications"]');
      const n = Math.min(500, Math.max(0, (parseInt(input.value, 10) || 0) + Number(b.dataset.step)));
      input.value = String(n);
      markInvalid(form, 'apps', false);
    });
    form.addEventListener('change', (e) => { const f = e.target.closest('[data-field]'); if (f) f.classList.remove('is-invalid'); });
    form.addEventListener('submit', (e) => { e.preventDefault(); submitPulse(form); });
    box.querySelector('[data-action="pulse-cancel"]').addEventListener('click', () => { state.pulseOpen = false; renderPulse(); });
    return;
  }

  if (p) {
    const worry = Number(p.rating) <= 3 || p.mentor_called === false || (p.issue || '').trim();
    setContent(box, html`${head}
      <dl class="ms-mymentor-pulse-sum">
        <div><dt>Applications</dt><dd>${p.applications_count ?? 0}</dd></div>
        <div><dt>Stage</dt><dd>${labelOf(HUNT_STAGES, p.hunt_stage) || '-'}</dd></div>
        <div><dt>${first} called</dt><dd>${p.mentor_called ? 'Yes' : 'Not this week'}</dd></div>
        <div><dt>Your rating</dt><dd>${starsHtml(p.rating)}</dd></div>
      </dl>
      ${worry ? html`<div class="ms-callout ms-callout--warn ms-mt-16"><i class="fas fa-hands-holding" aria-hidden="true"></i><div>Thank you for telling us. Team MSC reads every check-in and steps in when something is not right.</div></div>` : ''}
      <div class="ms-row ms-between ms-mt-16">
        <span class="ms-xs ms-muted">Saved ${timeAgo(p.updated_at || p.created_at)} · ${plural(cur.pulses_count || 1, 'check-in')} so far</span>
        <button type="button" class="ms-btn ms-btn--outline ms-btn--sm" data-action="pulse-open"><i class="fas fa-pen" aria-hidden="true"></i><span>Edit</span></button>
      </div>
      ${privacy}`);
  } else {
    setContent(box, html`${head}
      <p class="ms-small ms-text-2">How many applications did you send, did ${first} call, and how is it going? It helps Team MSC spot problems early.</p>
      <button type="button" class="ms-btn ms-btn--primary ms-btn--block ms-mt-16" data-action="pulse-open"><i class="fas fa-pen-to-square" aria-hidden="true"></i><span>Fill this week's check-in</span></button>
      ${privacy}`);
  }
  box.querySelector('[data-action="pulse-open"]')?.addEventListener('click', () => { state.pulseOpen = true; renderPulse(); box.querySelector('input[name="applications"]')?.focus({ preventScroll: true }); });
}

async function submitPulse(form) {
  const cur = state.current;
  const btn = form.querySelector('[type="submit"]');
  const appsRaw = form.querySelector('[name="applications"]').value.trim();
  const apps = Number(appsRaw);
  const stage = form.querySelector('[name="stage"]:checked')?.value || '';
  const called = form.querySelector('[name="called"]:checked')?.value || '';
  const rating = Number(form.querySelector('[name="rating"]:checked')?.value || 0);
  const issue = form.querySelector('[name="issue"]').value.trim();
  const bad = {
    apps: appsRaw === '' || !Number.isInteger(apps) || apps < 0 || apps > 500,
    stage: !stage, called: !called, rating: rating < 1 || rating > 5,
  };
  Object.entries(bad).forEach(([k, v]) => markInvalid(form, k, v));
  const firstBad = Object.keys(bad).find((k) => bad[k]);
  if (firstBad) { form.querySelector(`[data-field="${firstBad}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  setBusy(btn, true);
  try {
    const row = await rpc('mentorship_submit_pulse', {
      p_match_id: cur.match_id, p_applications: apps, p_stage: stage, p_mentor_called: called === 'yes', p_rating: rating, p_issue: issue || null,
    });
    const wasNew = !cur.pulse_this_week;
    cur.pulse_this_week = row || { applications_count: apps, hunt_stage: stage, mentor_called: called === 'yes', rating, issue, created_at: new Date().toISOString() };
    if (wasNew) cur.pulses_count = (cur.pulses_count || 0) + 1;
    state.pulseOpen = false;
    renderPulse();
    toast('Thanks! Your check-in is saved.', { type: 'success' });
    track('mentorship_pulse_submitted', { program: cur.program });
    setParam('pulse', null);
  } catch (e) {
    if (e.code === 'match_not_active') { toast(e.message, { type: 'warn' }); load(); return; }
    showError(e);
  } finally {
    setBusy(btn, false);
  }
}

/* ---- review -------------------------------------------------------------------- */

function reviewFormHtml(match, idp) {
  const r = match.review || {};
  const first = mentorFirst(match.mentor);
  const tags = new Set(r.tags || []);
  return html`<form class="ms-form ms-mymentor-review-form" novalidate>
    <fieldset class="ms-fieldset ms-field" data-field="rating"><legend class="ms-label"><span class="ms-req">Overall, how was ${first} as your mentor?</span></legend>
      <div class="ms-row" style="--ms-gap:12px">${starInputHtml('rv_rating', r.rating, `${idp}-r`)}<span class="ms-small ms-text-2" data-star-word="rv_rating"></span></div>
      <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Tap a star to rate.</span>
    </fieldset>
    <fieldset class="ms-fieldset"><legend class="ms-label">What stood out? <span class="ms-hint">Pick up to ${LIMITS.review_tags}</span></legend>
      <div class="ms-choices" data-max="${LIMITS.review_tags}">${REVIEW_TAGS.map((t) => html`<label class="ms-choice"><input type="checkbox" name="rv_tags" value="${t.key}"${tags.has(t.key) ? ' checked' : ''}><span>${t.label}</span></label>`)}</div>
    </fieldset>
    <div class="ms-field">
      <label class="ms-label" for="${idp}-body">A few words for the next batch <span class="ms-vis ms-vis--public"><i class="fas fa-eye" aria-hidden="true"></i>Public</span></label>
      <textarea class="ms-textarea ms-mymentor-short" id="${idp}-body" name="rv_body" maxlength="${LIMITS.review_body}" rows="3" placeholder="Optional. What did ${first} help you with?">${r.body || ''}</textarea>
      <div class="ms-row ms-between"><span class="ms-hint">Shown on ${first}'s profile with your first name and initial.</span>${counterHtml(`${idp}-body`, LIMITS.review_body, (r.body || '').length)}</div>
    </div>
    <fieldset class="ms-fieldset ms-field" data-field="safety"><legend class="ms-label"><span class="ms-req">Did ${first} ask for money, sell you a course or promise a job?</span> <span class="ms-vis ms-vis--private"><i class="fas fa-lock" aria-hidden="true"></i>Only Team MSC</span></legend>
      <div class="ms-options ms-options--2 ms-mymentor-yesno">
        <label class="ms-option"><input type="radio" name="rv_safety" value="no"${match.review && !r.safety_flag ? ' checked' : ''}><span class="ms-option__mark"></span><span class="ms-option__body"><span class="ms-option__title">No</span></span></label>
        <label class="ms-option"><input type="radio" name="rv_safety" value="yes"${r.safety_flag ? ' checked' : ''}><span class="ms-option__mark"></span><span class="ms-option__body"><span class="ms-option__title">Yes</span></span></label>
      </div>
      <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Please choose one.</span>
    </fieldset>
    <div class="ms-field">
      <label class="ms-label" for="${idp}-note">Anything else for Team MSC? <span class="ms-vis ms-vis--private"><i class="fas fa-lock" aria-hidden="true"></i>Only Team MSC</span></label>
      <textarea class="ms-textarea ms-mymentor-short" id="${idp}-note" name="rv_note" maxlength="${LIMITS.notes}" rows="2" placeholder="Optional and private.">${r.private_note || ''}</textarea>
      ${counterHtml(`${idp}-note`, LIMITS.notes, (r.private_note || '').length)}
    </div>
  </form>`;
}

function bindReviewForm(form) {
  bindCounters(form);
  bindStarWords(form, 'rv_rating');
  const box = form.querySelector('[data-max]');
  const max = Number(box?.dataset.max || 3);
  const sync = () => {
    const boxes = [...form.querySelectorAll('[name="rv_tags"]')];
    const n = boxes.filter((b) => b.checked).length;
    boxes.forEach((b) => { b.disabled = !b.checked && n >= max; });
  };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'rv_tags') sync();
    const f = e.target.closest('[data-field]'); if (f) f.classList.remove('is-invalid');
  });
  sync();
}

/** Validate + submit a review form. Returns the saved row, or null when invalid/failed. */
async function submitReview(match, form) {
  const rating = Number(form.querySelector('[name="rv_rating"]:checked')?.value || 0);
  const safety = form.querySelector('[name="rv_safety"]:checked')?.value || '';
  const bad = { rating: rating < 1 || rating > 5, safety: !safety };
  Object.entries(bad).forEach(([k, v]) => markInvalid(form, k, v));
  const firstBad = Object.keys(bad).find((k) => bad[k]);
  if (firstBad) { form.querySelector(`[data-field="${firstBad}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return null; }
  const tags = [...form.querySelectorAll('[name="rv_tags"]:checked')].map((x) => x.value).slice(0, LIMITS.review_tags);
  const body = form.querySelector('[name="rv_body"]').value.trim();
  const note = form.querySelector('[name="rv_note"]').value.trim();
  try {
    const row = await rpc('mentorship_submit_review', {
      p_match_id: match.match_id, p_rating: rating, p_tags: tags, p_body: body || null, p_safety_flag: safety === 'yes', p_private_note: note || null,
    });
    match.review = row || { rating, tags, body, safety_flag: safety === 'yes', private_note: note, published: true, created_at: new Date().toISOString() };
    toast(safety === 'yes' ? 'Thank you. Team MSC will look into this.' : `Thanks! Your review helps the next batch.`, { type: 'success', timeout: 5000 });
    track('mentorship_review_submitted', { program: match.program });
    return match.review;
  } catch (e) {
    if (e.code === 'review_too_early') {
      const when = e.hint ? formatDate(e.hint) : formatDate(match.review_eligible_at);
      toast(when ? `You can review from ${when}.` : e.message, { type: 'warn' });
    } else showError(e);
    return null;
  }
}

function reviewDisplayHtml(match) {
  const r = match.review;
  const first = mentorFirst(match.mentor);
  return html`<div class="ms-stack" style="--ms-gap:10px">
    <div class="ms-row ms-between"><span class="ms-row" style="--ms-gap:8px">${starsHtml(r.rating)}<span class="ms-small ms-strong">${RATING_WORDS[r.rating] || ''}</span></span>
      <span class="ms-xs ms-muted">${formatDate(r.updated_at || r.created_at)}</span></div>
    ${r.tags?.length ? html`<div class="ms-chips">${labelsOf(REVIEW_TAGS, r.tags).map((t) => html`<span class="ms-chip ms-tone-green">${t}</span>`)}</div>` : ''}
    ${r.body ? html`<p class="ms-mymentor-quote">“${r.body}”</p>` : html`<p class="ms-small ms-muted">No written review.</p>`}
    <p class="ms-xs ms-muted">${r.published === false ? 'Team MSC has hidden this review from the profile.' : `Shown on ${first}'s profile with your first name and initial.`}${r.safety_flag ? ' You told Team MSC something was wrong. Thank you for that.' : ''}</p>
  </div>`;
}

function renderReview() {
  const box = $('#mm-review');
  const cur = state.current;
  if (!box || !cur) return;
  const first = mentorFirst(cur.mentor);
  const title = html`<div class="ms-card__head"><div><h2 class="ms-card__title"><i class="fas fa-star ms-mymentor-star" aria-hidden="true"></i>Review ${first}</h2>
    <div class="ms-card__sub">After ${reviewDays} days together, your review helps the next batch choose well.</div></div>
    ${cur.review ? html`<span class="ms-badge ms-tone-green">Submitted</span>` : ''}</div>`;

  if (!cur.can_review && !cur.review) {
    const days = Math.max(0, Math.min(reviewDays, daysSince(cur.started_at) || 0));
    setContent(box, html`${title}
      <p class="ms-small ms-text-2">You can review ${first} from <strong>${formatDate(cur.review_eligible_at)}</strong>.</p>
      <div class="ms-progress ms-mt-8" role="progressbar" aria-valuemin="0" aria-valuemax="${reviewDays}" aria-valuenow="${days}" aria-label="Days together"><div class="ms-progress__bar" style="width:${Math.round((days / reviewDays) * 100)}%"></div></div>
      <p class="ms-xs ms-muted ms-mt-8">${plural(days, 'day')} together so far. Meanwhile, the weekly check-in is the best way to tell us how it is going.</p>`);
    return;
  }
  if (cur.review && !state.reviewEditing) {
    setContent(box, html`${title}${reviewDisplayHtml(cur)}
      <div class="ms-mt-16"><button type="button" class="ms-btn ms-btn--outline ms-btn--sm" data-action="review-edit"><i class="fas fa-pen" aria-hidden="true"></i><span>Edit review</span></button></div>`);
    box.querySelector('[data-action="review-edit"]').addEventListener('click', () => { state.reviewEditing = true; renderReview(); });
    return;
  }
  const idp = nextId('rv');
  setContent(box, html`${title}${reviewFormHtml(cur, idp)}
    <div class="ms-btn-row ms-btn-row--stack ms-mt-16">
      <button type="button" class="ms-btn ms-btn--primary" data-action="review-save"><span>${cur.review ? 'Save changes' : 'Submit review'}</span></button>
      ${cur.review ? html`<button type="button" class="ms-btn ms-btn--ghost" data-action="review-cancel"><span>Cancel</span></button>` : ''}
    </div>`);
  const form = box.querySelector('form');
  bindReviewForm(form);
  const save = box.querySelector('[data-action="review-save"]');
  save.addEventListener('click', async () => {
    setBusy(save, true);
    const row = await submitReview(cur, form);
    setBusy(save, false);
    if (row) { state.reviewEditing = false; renderReview(); }
  });
  box.querySelector('[data-action="review-cancel"]')?.addEventListener('click', () => { state.reviewEditing = false; renderReview(); });
}

function openPastReview(matchId) {
  const match = state.matches.find((x) => x.match_id === matchId);
  if (!match) return;
  const first = mentorFirst(match.mentor);
  const body = document.createElement('div');
  setContent(body, reviewFormHtml(match, nextId('rvp')));
  const form = body.querySelector('form');
  bindReviewForm(form);
  openModal({
    title: `Review ${first}`,
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      { label: match.review ? 'Save changes' : 'Submit review', variant: 'primary', onClick: async () => { const row = await submitReview(match, form); if (!row) return false; refreshPast(); return true; } },
    ],
  });
}

/* ---- switch -------------------------------------------------------------------- */

function renderSwitch() {
  const box = $('#mm-switch');
  const cur = state.current;
  if (!box || !cur) return;
  const sr = cur.switch_request;
  const title = html`<h2 class="ms-card__title ms-mb-8"><i class="fas fa-right-left ms-mymentor-switch__icon" aria-hidden="true"></i>Need a different mentor?</h2>`;
  if (sr && sr.status === 'pending') {
    setContent(box, html`${title}
      <div class="ms-row ms-between"><span class="ms-small ms-text-2">Request sent ${timeAgo(sr.created_at)}</span>${statusBadge('switch', 'pending')}</div>
      ${sr.reason ? html`<p class="ms-mymentor-quote ms-mt-8">“${sr.reason}”</p>` : ''}
      <p class="ms-small ms-text-2 ms-mt-8">Team MSC has your request and will message you about it. Keep talking to ${mentorFirst(cur.mentor)} meanwhile, so your hunt does not pause.</p>`);
    return;
  }
  const declined = sr && sr.status === 'declined'
    ? html`<div class="ms-callout ms-callout--gray ms-mb-16"><i class="fas fa-circle-info" aria-hidden="true"></i><div><span class="ms-callout__title">Your last request was declined ${statusBadge('switch', 'declined')}</span>${sr.resolution_note || 'Team MSC decided to keep this match for now.'}</div></div>`
    : '';
  if (cur.switch_available) {
    setContent(box, html`${title}${declined}
      <p class="ms-small ms-text-2">If it is not working out, tell Team MSC why. You can switch ${switchTimes} per program, and Team MSC picks your new mentor with you.</p>
      <button type="button" class="ms-btn ms-btn--outline ms-btn--sm ms-mt-16" data-action="switch-open"><span>Request a different mentor</span></button>`);
    box.querySelector('[data-action="switch-open"]').addEventListener('click', openSwitch);
    return;
  }
  setContent(box, html`${title}${declined}
    <p class="ms-small ms-text-2">You have used your switch. Contact Team MSC if something is wrong.</p>
    <a class="ms-btn ms-btn--outline ms-btn--sm ms-mt-16" href="${PATHS.contact}"><span>Contact Team MSC</span></a>`);
}

function openSwitch() {
  const cur = state.current;
  const first = mentorFirst(cur.mentor);
  const [min, max] = LIMITS.switch_reason;
  const id = nextId('sw');
  const body = document.createElement('div');
  setContent(body, html`<div class="ms-stack" style="--ms-gap:14px">
    <p class="ms-small ms-text-2">Your reason goes to Team MSC. You can switch ${switchTimes} per program, so tell us honestly what is not working. If ${first} asked for money, sold a course or promised a job, say so here.</p>
    <div class="ms-field" data-field="reason">
      <label class="ms-label" for="${id}"><span class="ms-req">What is not working?</span></label>
      <textarea class="ms-textarea" id="${id}" maxlength="${max}" rows="4" placeholder="For example: no weekly call for two weeks, responses take two days."></textarea>
      <div class="ms-row ms-between"><span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Please write at least ${min} characters.</span><span class="ms-grow"></span>${counterHtml(id, max)}</div>
    </div>
    <p class="ms-xs ms-muted">Until Team MSC sets up your new mentor, ${first} stays your mentor.</p>
  </div>`);
  bindCounters(body);
  const ta = body.querySelector('textarea');
  ta.addEventListener('input', () => { if (ta.value.trim().length >= min) markInvalid(body, 'reason', false); });
  openModal({
    title: 'Request a different mentor',
    body,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: 'Send to Team MSC', variant: 'primary',
        onClick: async () => {
          const reason = ta.value.trim();
          if (reason.length < min || reason.length > max) { markInvalid(body, 'reason', true); ta.focus(); return false; }
          try {
            const row = await rpc('mentorship_request_switch', { p_match_id: cur.match_id, p_reason: reason });
            cur.switch_request = row || { status: 'pending', reason, created_at: new Date().toISOString() };
            cur.switch_available = false;
            renderSwitch();
            toast('Sent. Team MSC will message you about it.', { type: 'success' });
            track('mentorship_switch_requested', { program: cur.program });
            return true;
          } catch (e) {
            if (['switch_pending', 'switch_used', 'match_not_active'].includes(e.code)) { toast(e.message, { type: 'warn' }); load(); return true; }
            showError(e);
            return false;
          }
        },
      },
    ],
  });
}

/* ---- events -------------------------------------------------------------------- */

function bindMain() {
  const root = main.querySelector('.ms-mymentor');
  if (!root) return;
  root.addEventListener('click', (e) => {
    const tab = e.target.closest('.ms-tab[data-program]');
    if (tab) {
      setParam('program', tab.dataset.program);
      state.pulseOpen = false; state.reviewEditing = false;
      render();
      return;
    }
    if (e.target.closest('[data-action="profile"]')) {
      openMentorProfile(state.current.mentor.id, { minReviews, preview: state.current.mentor });
      return;
    }
    const t = e.target.closest('[data-track]');
    if (t) track('mentorship_contact_click', { method: t.dataset.track });
  });
}
function bindPast() {
  const box = $('#mm-past');
  if (!box || box.dataset.bound) return;
  box.dataset.bound = '1';
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-past-review]');
    if (b) openPastReview(b.dataset.pastReview);
  });
}
function refreshPast() {
  const box = $('#mm-past');
  if (box) setContent(box, pastHtml(state.matches.filter((m) => m.status !== 'active')));
}

/* ---- load ---------------------------------------------------------------------- */

async function load() {
  let data;
  try {
    data = await rpc('mentorship_my_match', {});
  } catch (e) {
    if (e.code === 'backend_missing') setContent(main, notReadyHtml());
    else if (e.code === 'not_logged_in' || e.code === 'session_expired') renderLoggedOut();
    else setContent(main, errorStateHtml(e));
    return;
  }
  state.data = data || {};
  state.matches = Array.isArray(data?.matches) ? data.matches : [];
  render();
  if (state.current) {
    if (qs('pulse') === '1' && state.current.status === 'active') { state.pulseOpen = true; renderPulse(); scrollToCard('mm-pulse'); }
    else if (qs('review') === '1') scrollToCard('mm-review');
  }
}

document.addEventListener('click', (e) => { if (e.target.closest('#ms-retry')) location.reload(); });

if (!ctx.backendReady) setContent(main, notReadyHtml());
else if (!ctx.user) renderLoggedOut();
else if (ctx.error) setContent(main, errorStateHtml(ctx.error));
else await load();
