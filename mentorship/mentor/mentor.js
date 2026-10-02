/* =============================================================================
   /mentorship/mentor/ : mentor dashboard (mentees, checklist, weekly calls,
   earnings, resources). Owner: mentor builder. SPEC §10.
   ========================================================================== */
import {
  initPage, rpc, html, setContent, showError, skeleton, toast, setBusy, qs, isMockMode,
  PATHS, CHECKLIST_ITEMS, FIRST_MESSAGES, RESOURCES, HUNT_STAGES, CITIES, PAYOUT_STATUS,
  formatDate, formatINR, daysSince, weekNumber, istDateKey, labelOf, programLabel, firstName, fillTemplate,
  waLink, telLink, mailtoLink, safeUrl, copyText, openModal, emptyState, statusBadge, avatarHtml, tierChip, track, formatPhone,
} from '/mentorship/assets/mentorship-core.js?v=1';
import {
  backendNotReady, loadError, bindRetry, statusScreen, loggedOutScreen, journeySteps, templateVars, escalationLink, padamGptUrl,
  scrollToEl, waShare,
} from '/mentorship/mentor/mentor-common.js?v=1';

if (isMockMode()) await import('/mentorship/mentor/mock-status.js?v=1');

const main = document.getElementById('ms-main');
setContent(main, html`<div class="ms-container ms-section">${skeleton('page')}</div>`);
const ctx = await initPage({ active: 'mentor' });
const config = ctx.config;
const GPT = padamGptUrl(config);
const LINKS_URL = config.links_url || 'https://www.mystudentclub.com/links';

let mm = null;            // mentorship_my_mentor()
let mentees = [];         // mentorship_my_mentees() active
let past = null;          // closed matches (loaded on demand)
let tab = ['mentees', 'earnings', 'resources'].includes(qs('tab')) ? qs('tab') : 'mentees';
const open = new Set(qs('match') ? [qs('match')] : []);
const showAllCalls = new Set();

const MOODS = [
  { key: 'Upbeat', label: 'Upbeat', tone: 'green' }, { key: 'Steady', label: 'Steady', tone: 'blue' },
  { key: 'Low', label: 'Low', tone: 'amber' }, { key: 'Struggling', label: 'Struggling', tone: 'red' },
];
const MOOD_RX = /^Mood: (Upbeat|Steady|Low|Struggling)\.\s?/;
const parseNotes = (n) => { const m = MOOD_RX.exec(String(n || '')); return { mood: m ? m[1] : null, text: m ? String(n).slice(m[0].length) : String(n || '') }; };

const mentor = () => mm?.mentor || {};
const menteeFirst = (x) => x.mentee?.first_name || firstName(x.mentee?.full_name) || 'your mentee';
const isActive = (x) => x.status === 'active';
const done = (x, key) => !!x.checklist?.[key];
const doneCount = (x) => CHECKLIST_ITEMS.filter((c) => done(x, c.key)).length;

/* ---------------------------------------------------------------------------
   Templates
   ------------------------------------------------------------------------ */
function varsFor(x) {
  return templateVars({ mentor: mentor(), menteeName: x.mentee?.full_name || '', program: x.program, config: { ...config, links_url: LINKS_URL } });
}
function messageFor(x, key) {
  const t = FIRST_MESSAGES.find((m) => m.key === key) || FIRST_MESSAGES[0];
  return fillTemplate(t.text, varsFor(x));
}
function primaryMessage(x) { return messageFor(x, done(x, 'intro_sent') ? 'weekly' : 'intro'); }

/* ---------------------------------------------------------------------------
   Checklist rules
   ------------------------------------------------------------------------ */
function checkState(x, item) {
  const d = x.checklist?.[item.key];
  if (d) return { cls: 'is-done', meta: `Done ${formatDate(d.done_at)}${d.note ? ` · ${d.note}` : ''}` };
  if (item.key === 'intro_sent' && isActive(x) && !x.mentee?.whatsapp) return { cls: '', meta: 'Waiting for their WhatsApp number. Team MSC is getting it.' };
  if (!item.dueDays) return { cls: '', meta: item.hint };
  const age = daysSince(x.started_at) ?? 0;
  const due = new Date(Date.parse(x.started_at) + item.dueDays * 86400000);
  if (age < item.dueDays) return { cls: '', meta: `Due by ${formatDate(due, { year: undefined })} · ${item.hint}` };
  if (age === item.dueDays) return { cls: 'is-due', meta: `Due today · ${item.hint}` };
  const late = age - item.dueDays;
  return { cls: 'is-late', meta: `Overdue by ${late} ${late === 1 ? 'day' : 'days'} · ${item.hint}` };
}

function todayItems() {
  const items = [];
  for (const x of mentees.filter(isActive)) {
    const first = menteeFirst(x);
    const age = x.days_active ?? daysSince(x.started_at) ?? 0;
    // No WhatsApp on file yet (assigned by Team MSC): nothing to send, Team MSC is getting the number.
    if (!done(x, 'intro_sent') && x.mentee?.whatsapp) {
      items.push({ sev: age >= 1 ? 2 : 1, icon: 'fa-comment-dots', text: age >= 1 ? `Send ${first}'s intro (overdue)` : `Send ${first}'s intro (due today)`, match: x.match_id, wa: true, x });
    }
    const sinceCall = x.days_since_call ?? (x.last_call_on ? daysSince(x.last_call_on) : null);
    if ((x.flags || []).includes('no_call_8d')) {
      items.push({ sev: 2, icon: 'fa-phone-slash', text: `${first}: no call in ${sinceCall ?? age} days`, match: x.match_id, log: true });
    } else if (done(x, 'intro_sent') && age >= 3 && !(x.calls || []).some((c) => Number(c.week_no) === Number(x.week_no))) {
      items.push({ sev: 1, icon: 'fa-phone', text: `${first}: week ${x.week_no} call not logged yet`, match: x.match_id, log: true });
    }
    for (const key of ['first_call', 'cv_reviewed', 'mock_interview']) {
      const item = CHECKLIST_ITEMS.find((c) => c.key === key);
      const st = checkState(x, item);
      if (st.cls === 'is-late' && !(key === 'first_call' && (x.calls || []).length)) items.push({ sev: 1, icon: 'fa-list-check', text: `${first}: ${item.label.toLowerCase()} is overdue`, match: x.match_id });
    }
  }
  return items.sort((a, b) => b.sev - a.sev).slice(0, 6);
}

/* ---------------------------------------------------------------------------
   Header
   ------------------------------------------------------------------------ */
function headerHtml() {
  const m = mentor();
  const active = Number(mm.active_count ?? mentees.filter(isActive).length);
  const max = Number(m.max_mentees || 0);
  const pct = max ? Math.min(100, Math.round((active * 100) / max)) : 0;
  const esc = escalationLink(mm.escalation, m);
  const escFirst = firstName(String(mm.escalation?.name || '').replace(/\(.*\)/, '').trim());
  const escLabel = mm.escalation?.role === 'senior_mentor' && escFirst ? `Escalate to ${escFirst}` : 'Contact Team MSC';
  return html`<section class="ms-mentor-top"><div class="ms-container">
    <div class="ms-mentor-head">
      ${avatarHtml({ name: m.full_name, photo_path: m.photo_path, size: 'lg', verified: !!m.linkedin_checked, verifiedTitle: 'LinkedIn checked by Team MSC' })}
      <div class="ms-grow">
        <span class="ms-xs ms-muted ms-strong ms-mentor-head__eyebrow">MENTOR DASHBOARD</span>
        <h1 class="ms-h1 ms-mentor-head__title">Hi ${firstName(m.full_name) || 'there'}</h1>
        <div class="ms-row" style="--ms-gap:6px">${statusBadge('mentor', m.status)}${tierChip(m.tier)}${m.approved_at ? html`<span class="ms-xs ms-muted">Mentor since ${formatDate(m.approved_at, { day: undefined })}</span>` : ''}</div>
      </div>
      <a class="ms-btn ms-btn--outline ms-btn--sm ms-hide-mobile" href="${PATHS.apply}"><i class="fas fa-user-pen" aria-hidden="true"></i><span>Edit profile</span></a>
      <a class="ms-icon-btn ms-hide-desktop ms-mentor-head__edit" href="${PATHS.apply}" aria-label="Edit profile"><i class="fas fa-user-pen" aria-hidden="true"></i></a>
    </div>
    <div class="ms-mentor-overview">
      <div class="ms-card ms-mentor-capacity">
        <div class="ms-row ms-between ms-row--nowrap" style="--ms-gap:12px">
          <div><div class="ms-stat__label"><i class="fas fa-user-group" aria-hidden="true"></i>Mentees this batch</div>
            <div class="ms-mentor-capacity__value"><strong>${active}</strong> of ${max || '-'}</div></div>
          ${m.status === 'paused'
            ? html`<span class="ms-slots is-low"><span class="ms-dot"></span>Paused</span>`
            : html`<span class="ms-slots${active >= max ? ' is-full' : max - active <= 2 ? ' is-low' : ''}"><span class="ms-dot"></span>${active >= max ? 'Full' : m.accepting === false ? 'Not taking new' : `${max - active} open`}</span>`}
        </div>
        <div class="ms-progress ms-mt-8"><div class="ms-progress__bar" style="width:${pct}%"></div></div>
        <div class="ms-row ms-between ms-mt-16" style="--ms-gap:10px">
          <label class="ms-switch"><input type="checkbox" data-accepting ${m.accepting !== false ? 'checked' : ''}><span class="ms-switch__track"></span><span>Taking new mentees</span></label>
          <a class="ms-link ms-small" href="${PATHS.apply}">Change capacity</a>
        </div>
      </div>
      <div class="ms-mentor-quick">
        <a class="ms-mentor-quick__tile" href="${PATHS.training}#playbook"><i class="fas fa-book-open" aria-hidden="true"></i><span>Playbook</span></a>
        ${GPT ? html`<a class="ms-mentor-quick__tile" href="${GPT}" target="_blank" rel="noopener"><i class="fas fa-robot" aria-hidden="true"></i><span>Padam GPT</span></a>`
          : html`<span class="ms-mentor-quick__tile is-soon" aria-disabled="true"><i class="fas fa-robot" aria-hidden="true"></i><span>Padam GPT</span><span class="ms-soon-pill">Soon</span></span>`}
        <a class="ms-mentor-quick__tile ${esc.kind === 'whatsapp' ? 'is-wa' : ''}" href="${safeUrl(esc.href)}" ${esc.kind === 'contact' ? '' : html`target="_blank" rel="noopener"`} aria-label="${escLabel}">
          <i class="${esc.kind === 'whatsapp' ? 'fab fa-whatsapp' : 'fas fa-life-ring'}" aria-hidden="true"></i><span class="ms-hide-mobile">${escLabel}</span><span class="ms-hide-desktop">Escalate</span></a>
        <button type="button" class="ms-mentor-quick__tile" data-tab="resources"><i class="fas fa-link" aria-hidden="true"></i><span>Resources</span></button>
      </div>
    </div>
  </div></section>`;
}

/* ---------------------------------------------------------------------------
   Mentees tab
   ------------------------------------------------------------------------ */
function todayHtml() {
  const items = todayItems();
  if (!mentees.filter(isActive).length) return '';
  if (!items.length) return html`<div class="ms-hojayega">You are on top of every mentee right now. Keep the weekly calls going.</div>`;
  return html`<div class="ms-card ms-mentor-today">
    <div class="ms-card__head"><div><div class="ms-card__title"><i class="fas fa-sun" aria-hidden="true"></i> Today</div><div class="ms-card__sub">What needs you first</div></div></div>
    <ul class="ms-mentor-today__list">${items.map((it) => html`<li class="${it.sev >= 2 ? 'is-late' : 'is-due'}">
      <i class="fas ${it.icon}" aria-hidden="true"></i><span class="ms-grow">${it.text}</span>
      ${it.wa && it.x?.mentee?.whatsapp ? html`<a class="ms-btn ms-btn--whatsapp ms-btn--sm" href="${waLink(it.x.mentee.whatsapp, messageFor(it.x, 'intro'))}" target="_blank" rel="noopener" data-wa-intro="${it.match}"><i class="fab fa-whatsapp" aria-hidden="true"></i><span>Send</span></a>`
        : it.log ? html`<button type="button" class="ms-btn ms-btn--soft ms-btn--sm" data-log="${it.match}"><span>Log call</span></button>`
          : html`<button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-goto-match="${it.match}"><span>Open</span></button>`}
    </li>`)}</ul>
  </div>`;
}

function flagChips(x) {
  const out = [];
  if ((x.flags || []).includes('mentee_no_contact') || (isActive(x) && !x.mentee?.whatsapp)) out.push(html`<span class="ms-chip ms-tone-gray"><i class="fas fa-address-card" aria-hidden="true"></i>Waiting for their number</span>`);
  else if ((x.flags || []).includes('intro_late') || (!done(x, 'intro_sent') && (x.days_active ?? daysSince(x.started_at)) >= 1)) out.push(html`<span class="ms-chip ms-tone-red"><i class="fas fa-comment-slash" aria-hidden="true"></i>Intro overdue</span>`);
  if ((x.flags || []).includes('no_call_8d')) out.push(html`<span class="ms-chip ms-tone-amber"><i class="fas fa-phone-slash" aria-hidden="true"></i>No call 8+ days</span>`);
  return out;
}

function menteeCard(x) {
  const isOpen = open.has(x.match_id);
  const first = menteeFirst(x);
  const n = doneCount(x);
  const pct = Math.round((n * 100) / CHECKLIST_ITEMS.length);
  const lastCall = x.last_call_on ? `Last call ${x.days_since_call === 0 ? 'today' : x.days_since_call === 1 ? 'yesterday' : `${x.days_since_call ?? daysSince(x.last_call_on)} days ago`}` : 'No call logged yet';
  const wa = x.mentee?.whatsapp;
  const calls = x.calls || [];
  const shown = showAllCalls.has(x.match_id) ? calls : calls.slice(0, 5);
  return html`<article class="ms-card ms-mentor-mentee${isOpen ? ' is-open' : ''}" id="m-${x.match_id}" data-match="${x.match_id}">
    <div class="ms-mentor-mentee__head">
      ${avatarHtml({ name: x.mentee?.full_name, size: '' })}
      <div class="ms-grow">
        <div class="ms-mentor-mentee__name">${x.mentee?.full_name || 'Mentee'}</div>
        <div class="ms-mentor-mentee__sub">Week ${x.week_no || weekNumber(x.started_at)} · ${programLabel(x.program)}${x.mentee?.city ? ` · ${labelOf(CITIES, x.mentee.city)}` : ''}</div>
      </div>
      <div class="ms-mentor-ring" style="--pct:${pct}" title="${n} of ${CHECKLIST_ITEMS.length} checklist items done"><span>${n}/${CHECKLIST_ITEMS.length}</span></div>
    </div>
    <div class="ms-chips ms-mentor-mentee__facts">
      ${flagChips(x)}
      <span class="ms-chip"><i class="fas fa-phone" aria-hidden="true"></i>${lastCall}</span>
      ${x.latest_stage ? html`<span class="ms-chip ms-tone-blue"><i class="fas fa-route" aria-hidden="true"></i>${labelOf(HUNT_STAGES, x.latest_stage)}</span>` : ''}
      ${x.latest_applications !== null && x.latest_applications !== undefined ? html`<span class="ms-chip"><i class="fas fa-paper-plane" aria-hidden="true"></i>${x.latest_applications} ${Number(x.latest_applications) === 1 ? 'application' : 'applications'} last call</span>` : ''}
    </div>
    <div class="ms-mentor-mentee__actions">
      ${wa ? html`<a class="ms-btn ms-btn--whatsapp ms-mentor-mentee__wa" href="${waLink(wa, primaryMessage(x))}" target="_blank" rel="noopener" ${done(x, 'intro_sent') ? '' : html`data-wa-intro="${x.match_id}"`}>
          <i class="fab fa-whatsapp" aria-hidden="true"></i><span>${done(x, 'intro_sent') ? `WhatsApp ${first}` : `Send intro to ${first}`}</span></a>`
        : html`<span class="ms-btn ms-btn--outline ms-mentor-mentee__wa" aria-disabled="true"><i class="fas fa-hourglass-half" aria-hidden="true"></i><span>Team MSC is getting ${first}'s number</span></span>`}
      ${wa ? html`<a class="ms-btn ms-btn--outline ms-btn--sm" href="${telLink(wa)}"><i class="fas fa-phone" aria-hidden="true"></i><span>Call</span></a>` : ''}
      ${x.mentee?.email ? html`<a class="ms-btn ms-btn--outline ms-btn--sm" href="${mailtoLink(x.mentee.email, 'Your MSC mentorship')}"><i class="fas fa-envelope" aria-hidden="true"></i><span>Email</span></a>` : ''}
      <button type="button" class="ms-btn ms-btn--outline ms-btn--sm" data-templates="${x.match_id}"><i class="fas fa-message" aria-hidden="true"></i><span>Templates</span></button>
    </div>
    <div class="ms-xs ms-muted ms-mentor-mentee__contact">${wa ? formatPhone(wa) : ''}${wa && x.mentee?.email ? ' · ' : ''}${x.mentee?.email || ''}</div>
    ${wa ? '' : html`<p class="ms-hint"><i class="fas fa-circle-info" aria-hidden="true"></i> ${first} has not added a WhatsApp number yet. Team MSC is getting it, and it shows here as soon as they add it on their My mentor page. Until then, email works.</p>`}
    <button type="button" class="ms-mentor-mentee__toggle" data-toggle="${x.match_id}" aria-expanded="${isOpen ? 'true' : 'false'}" aria-controls="mb-${x.match_id}">
      <span>Checklist and weekly calls</span><i class="fas fa-chevron-down" aria-hidden="true"></i></button>
    <div class="ms-mentor-mentee__body" id="mb-${x.match_id}" ${isOpen ? '' : 'hidden'}>
      <div class="ms-mentor-mentee__cols">
        <section>
          <div class="ms-row ms-between ms-mb-8"><h3 class="ms-h3">Checklist</h3><span class="ms-xs ms-muted">${n} of ${CHECKLIST_ITEMS.length} done</span></div>
          <ul class="ms-checklist">${CHECKLIST_ITEMS.map((c) => {
            const st = checkState(x, c);
            const isDone = done(x, c.key);
            return html`<li class="ms-checkitem ${st.cls}">
              <button type="button" class="ms-checkitem__toggle" data-check="${c.key}" data-match-id="${x.match_id}" aria-pressed="${isDone ? 'true' : 'false'}"
                aria-label="${isDone ? `Mark "${c.label}" as not done` : `Mark "${c.label}" as done`}" ${isActive(x) ? '' : 'disabled'}><i class="fas fa-check" aria-hidden="true"></i></button>
              <div class="ms-checkitem__body"><div class="ms-checkitem__label">${c.label}</div><div class="ms-checkitem__meta">${st.meta}</div></div>
              ${c.key === 'intro_sent' && !isDone && wa ? html`<a class="ms-btn ms-btn--whatsapp ms-btn--sm" href="${waLink(wa, messageFor(x, 'intro'))}" target="_blank" rel="noopener" data-wa-intro="${x.match_id}" aria-label="Send intro on WhatsApp"><i class="fab fa-whatsapp" aria-hidden="true"></i></a>` : ''}
              ${c.key === 'joining_post' && !isDone && wa && done(x, 'joined') ? html`<a class="ms-btn ms-btn--soft ms-btn--sm" href="${waLink(wa, messageFor(x, 'joining_post'))}" target="_blank" rel="noopener" aria-label="Send joining post reminder"><i class="fab fa-whatsapp" aria-hidden="true"></i></a>` : ''}
            </li>`;
          })}</ul>
        </section>
        <section>
          <div class="ms-row ms-between ms-mb-8"><h3 class="ms-h3">Weekly calls</h3>
            ${isActive(x) ? html`<button type="button" class="ms-btn ms-btn--primary ms-btn--sm" data-log="${x.match_id}"><i class="fas fa-plus" aria-hidden="true"></i><span>Log this week's call</span></button>` : ''}</div>
          ${calls.length ? html`<ul class="ms-timeline ms-mentor-calls">${shown.map((c) => {
            const { mood, text } = parseNotes(c.notes);
            const moodTone = MOODS.find((m) => m.key === mood)?.tone || 'gray';
            return html`<li class="${['offer', 'joined'].includes(c.hunt_stage) ? 'is-good' : ''}">
              <div class="ms-timeline__title">Week ${c.week_no} · ${labelOf(HUNT_STAGES, c.hunt_stage) || 'Call'}</div>
              <div class="ms-timeline__meta">Called ${formatDate(c.called_on, { year: undefined })} · ${c.applications_count ?? 0} ${Number(c.applications_count) === 1 ? 'application' : 'applications'} · ${c.interviews_count ?? 0} ${Number(c.interviews_count) === 1 ? 'interview' : 'interviews'}</div>
              ${mood ? html`<span class="ms-chip ms-tone-${moodTone} ms-mentor-mood">${mood}</span>` : ''}
              ${text ? html`<p class="ms-mentor-calls__notes ms-clamp-3">${text}</p>` : ''}
            </li>`;
          })}</ul>
          ${calls.length > 5 ? html`<button type="button" class="ms-btn ms-btn--ghost ms-btn--sm ms-mt-8" data-allcalls="${x.match_id}"><span>${showAllCalls.has(x.match_id) ? 'Show fewer' : callsLabel(x, calls)}</span></button>` : ''}`
            : html`<div class="ms-mentor-nocalls"><i class="fas fa-phone-volume" aria-hidden="true"></i><span>No calls logged yet. After each weekly call, log it here in 30 seconds.</span></div>`}
        </section>
      </div>
    </div>
  </article>`;
}

/** The dashboard gets the newest 12 calls; say so when a long hunt has more. */
function callsLabel(x, calls) {
  const total = Number(x.calls_total ?? calls.length);
  return total > calls.length ? `Show the last ${calls.length} of ${total} calls` : `Show all ${calls.length} calls`;
}

function menteesTab() {
  const active = mentees.filter(isActive);
  if (!active.length) {
    return html`${mentor().status === 'paused' ? '' : ''}
      <div class="ms-card">${emptyState({ icon: 'fa-user-group', title: 'No mentees yet', text: 'When a student picks you, they show up here with their WhatsApp number. Meanwhile, keep your profile sharp and reread the playbook.',
        action: { label: 'Reread the playbook', href: `${PATHS.training}#playbook` } })}</div>
      ${pastHtml()}`;
  }
  return html`${todayHtml()}
    <div class="ms-stack" style="--ms-gap:14px">${active.map(menteeCard)}</div>
    ${pastHtml()}`;
}

function pastHtml() {
  if (past === null) {
    return html`<div class="ms-center ms-mt-16"><button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-past><i class="fas fa-clock-rotate-left" aria-hidden="true"></i><span>Show past mentees</span></button></div>`;
  }
  const rows = past.filter((x) => !isActive(x));
  return html`<div class="ms-card ms-mt-16">
    <div class="ms-card__title ms-mb-8">Past mentees</div>
    ${rows.length ? html`<ul class="ms-mentor-past">${rows.map((x) => html`<li>
      ${avatarHtml({ name: x.mentee?.full_name, size: 'sm' })}
      <div class="ms-grow"><div class="ms-strong ms-small">${x.mentee?.full_name}</div><div class="ms-xs ms-muted">${programLabel(x.program)} · ${formatDate(x.started_at)}${x.ended_at ? ` to ${formatDate(x.ended_at)}` : ''} · ${doneCount(x)}/${CHECKLIST_ITEMS.length} checklist</div></div>
      ${statusBadge('match', x.status)}</li>`)}</ul>` : html`<p class="ms-small ms-muted">No past mentees yet.</p>`}
  </div>`;
}

/* ---------------------------------------------------------------------------
   Earnings tab
   ------------------------------------------------------------------------ */
function earningsTab() {
  const e = mm.earnings || {};
  const fee = Number(e.fee_inr ?? config.mentor_fee_inr ?? 500);
  const active = Number(e.active_count ?? mentees.filter(isActive).length);
  const rows = e.rows || [];
  return html`<div class="ms-stats">
      <div class="ms-stat"><div class="ms-stat__label"><i class="fas fa-indian-rupee-sign" aria-hidden="true"></i>Fee</div><div class="ms-stat__value">${formatINR(fee)}</div><div class="ms-stat__sub">per mentee</div></div>
      <div class="ms-stat"><div class="ms-stat__label"><i class="fas fa-users" aria-hidden="true"></i>This batch</div><div class="ms-stat__value">${formatINR(e.active_value_inr ?? active * fee)}</div><div class="ms-stat__sub">${active} active × ${formatINR(fee)}</div></div>
      <div class="ms-stat ms-stat--warn"><div class="ms-stat__label"><i class="fas fa-hourglass-half" aria-hidden="true"></i>Due</div><div class="ms-stat__value">${formatINR(e.due_inr || 0)}</div><div class="ms-stat__sub">Being processed</div></div>
      <div class="ms-stat ms-stat--good"><div class="ms-stat__label"><i class="fas fa-circle-check" aria-hidden="true"></i>Paid</div><div class="ms-stat__value">${formatINR(e.paid_inr || 0)}</div><div class="ms-stat__sub">So far</div></div>
    </div>
    ${rows.length ? html`<div class="ms-table-wrap ms-mt-16"><table class="ms-table ms-table--stack">
      <thead><tr><th>Mentee</th><th>Program</th><th>Started</th><th>Match</th><th>Payout</th><th class="ms-num">Fee</th><th>Paid on</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr>
        <td data-label="Mentee" class="ms-strong">${r.mentee_name}</td>
        <td data-label="Program">${programLabel(r.program)}</td>
        <td data-label="Started">${formatDate(r.started_at)}</td>
        <td data-label="Match">${statusBadge('match', r.status)}</td>
        <td data-label="Payout">${statusBadge('payout', r.payout_status)}</td>
        <td data-label="Fee" class="ms-num">${formatINR(r.fee_inr)}</td>
        <td data-label="Paid on">${r.paid_at ? html`<span class="ms-mentor-paid">${formatDate(r.paid_at)}${r.payout_ref ? html`<span class="ms-xs ms-muted">${r.payout_ref}</span>` : ''}</span>` : '-'}</td>
      </tr>`)}</tbody></table></div>`
      : html`<div class="ms-card ms-mt-16">${emptyState({ icon: 'fa-wallet', title: 'No payouts yet', text: 'Each mentee who picks you shows up here with their payout status.' })}</div>`}
    <div class="ms-callout ms-callout--gray ms-mt-16"><i class="fas fa-circle-info" aria-hidden="true"></i><div>
      <span class="ms-callout__title">How payouts work</span>
      Each mentee's fee moves from <strong>${PAYOUT_STATUS.unpaid.label}</strong> to <strong>${PAYOUT_STATUS.due.label}</strong> to <strong>${PAYOUT_STATUS.paid.label}</strong>.
      Payouts are made by Team MSC. Questions? Ask your senior mentor. No money ever comes from mentees.</div></div>`;
}

/* ---------------------------------------------------------------------------
   Resources tab
   ------------------------------------------------------------------------ */
function resourcesTab() {
  return html`<div class="ms-card ms-mentor-gpt">
      <div class="ms-mentor-gpt__icon"><i class="fas fa-robot" aria-hidden="true"></i></div>
      <div class="ms-grow"><div class="ms-card__title">Padam GPT ${GPT ? '' : html`<span class="ms-soon-pill">Coming soon</span>`}</div>
        <p class="ms-small ms-text-2">An AI trained on Padam's answers, for interview-prep questions. Never paste a mentee's personal details into it.</p></div>
      ${GPT ? html`<a class="ms-btn ms-btn--gradient ms-btn--sm" href="${GPT}" target="_blank" rel="noopener"><span>Open</span><i class="fas fa-arrow-up-right-from-square" aria-hidden="true"></i></a>` : ''}
    </div>
    <div class="ms-grid ms-grid--auto ms-mt-16 ms-mentor-resgrid">${RESOURCES.map((r) => html`<div class="ms-card ms-card--flat ms-mentor-res">
      <span class="ms-mentor-res__icon"><i class="fas ${r.icon}" aria-hidden="true"></i></span>
      <div class="ms-grow"><a class="ms-strong ms-mentor-res__title" href="${safeUrl(r.url)}" target="_blank" rel="noopener">${r.label}</a>${r.desc ? html`<div class="ms-xs ms-muted">${r.desc}</div>` : ''}</div>
      <div class="ms-mentor-res__actions">
        <button type="button" class="ms-icon-btn" data-copy="${r.url}" aria-label="Copy link to ${r.label}" title="Copy link"><i class="fas fa-copy" aria-hidden="true"></i></button>
        <a class="ms-icon-btn ms-mentor-res__wa" href="${waShare(`${r.label}: ${r.url}`)}" target="_blank" rel="noopener" aria-label="Share ${r.label} on WhatsApp" title="Share on WhatsApp"><i class="fab fa-whatsapp" aria-hidden="true"></i></a>
      </div>
    </div>`)}</div>`;
}

/* ---------------------------------------------------------------------------
   Page
   ------------------------------------------------------------------------ */
function tabsHtml() {
  const n = mentees.filter(isActive).length;
  const t = (key, icon, label, badge = '') => html`<button type="button" class="ms-tab${tab === key ? ' is-active' : ''}" role="tab" aria-selected="${tab === key ? 'true' : 'false'}" data-tab="${key}">
    <i class="fas ${icon}" aria-hidden="true"></i>${label}${badge !== '' ? html` <span class="ms-badge ms-tone-blue">${badge}</span>` : ''}</button>`;
  return html`<div class="ms-tabs ms-mentor-tabs" role="tablist" aria-label="Dashboard">${t('mentees', 'fa-user-group', 'Mentees', n)}${t('earnings', 'fa-wallet', 'Earnings')}${t('resources', 'fa-link', 'Resources')}</div>`;
}
function panelHtml() {
  return tab === 'earnings' ? earningsTab() : tab === 'resources' ? resourcesTab() : menteesTab();
}
function render() {
  const m = mentor();
  setContent(main, html`${headerHtml()}
    <section class="ms-container ms-section ms-mentor-main">
      ${m.status === 'paused' ? html`<div class="ms-callout ms-callout--warn ms-mb-16"><i class="fas fa-circle-pause" aria-hidden="true"></i><div><span class="ms-callout__title">Your profile is paused</span>
        ${m.pause_reason ? html`${m.pause_reason} ` : ''}You will not get new mentees while paused. Keep helping your current mentees as usual; everything below still works.</div></div>` : ''}
      <div class="ms-mb-16">${tabsHtml()}</div>
      <div data-panel role="tabpanel">${panelHtml()}</div>
    </section>`);
  if (open.size) {
    const id = [...open][0];
    const el = main.querySelector(`[data-match="${CSS.escape(id)}"]`);
    if (el && qs('match')) setTimeout(() => scrollToEl(el, { smooth: false }), 60);
  }
}
function renderPanel() {
  setContent(main.querySelector('[data-panel]'), panelHtml());
  main.querySelectorAll('[data-tab]').forEach((b) => {
    if (!b.classList.contains('ms-tab')) return;
    const on = b.dataset.tab === tab;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const badge = main.querySelector('.ms-tab[data-tab="mentees"] .ms-badge');
  if (badge) badge.textContent = String(mentees.filter(isActive).length);
}
function rerenderCard(matchId) {
  const x = mentees.find((m) => m.match_id === matchId);
  const el = main.querySelector(`[data-match="${CSS.escape(matchId)}"]`);
  if (!x || !el) { renderPanel(); return; }
  const tmp = document.createElement('div');
  setContent(tmp, menteeCard(x));
  el.replaceWith(tmp.firstElementChild);
  const today = main.querySelector('.ms-mentor-today, [data-panel] > .ms-hojayega');
  if (today) {
    const t2 = document.createElement('div');
    setContent(t2, todayHtml());
    if (t2.firstElementChild) today.replaceWith(t2.firstElementChild); else today.remove();
  }
}
function setTab(t) {
  tab = t;
  const u = new URL(location.href);
  if (t === 'mentees') u.searchParams.delete('tab'); else u.searchParams.set('tab', t);
  history.replaceState(null, '', u);
  renderPanel();
  track('mentor_dashboard_tab', { tab: t });
}

/* ---------------------------------------------------------------------------
   Actions
   ------------------------------------------------------------------------ */
async function toggleCheck(btn) {
  const id = btn.dataset.matchId;
  const key = btn.dataset.check;
  const x = mentees.find((m) => m.match_id === id);
  if (!x) return;
  const was = done(x, key);
  const prev = x.checklist?.[key];
  x.checklist = { ...(x.checklist || {}) };
  if (was) delete x.checklist[key]; else x.checklist[key] = { done_at: new Date().toISOString(), note: '' };
  rerenderCard(id);
  try {
    const res = await rpc('mentorship_set_checklist', { p_match_id: id, p_item: key, p_done: !was });
    if (res?.checklist) x.checklist = res.checklist;
    if (!was && key === 'intro_sent') x.flags = (x.flags || []).filter((f) => f !== 'intro_late');
    rerenderCard(id);
    if (!was) toast(`${CHECKLIST_ITEMS.find((c) => c.key === key)?.label || 'Done'}. Nice!`, { type: 'success', timeout: 2500 });
    track('mentor_checklist', { item: key, done: !was });
  } catch (e) {
    x.checklist = { ...(x.checklist || {}) };
    if (was) x.checklist[key] = prev; else delete x.checklist[key];
    rerenderCard(id);
    showError(e);
  }
}

function openTemplates(x) {
  const first = menteeFirst(x);
  const wa = x.mentee?.whatsapp;
  const modal = openModal({
    title: `Messages for ${first}`, wide: true,
    body: html`<p class="ms-small ms-text-2 ms-mb-16">Filled in for ${first}. Edit anything before you send; it should sound like you.</p>
      <div class="ms-stack" style="--ms-gap:16px">${FIRST_MESSAGES.map((t, i) => html`<div class="ms-mentor-tpl">
        <div class="ms-row ms-between ms-row--nowrap" style="--ms-gap:8px"><div class="ms-grow"><div class="ms-strong ms-small">${t.title}</div><div class="ms-xs ms-muted">${t.when}</div></div></div>
        <span class="ms-template">${messageFor(x, t.key)}</span>
        <div class="ms-btn-row"><button type="button" class="ms-btn ms-btn--soft ms-btn--sm" data-copy-tpl="${i}"><i class="fas fa-copy" aria-hidden="true"></i><span>Copy</span></button>
          ${wa ? html`<a class="ms-btn ms-btn--whatsapp ms-btn--sm" href="${waLink(wa, messageFor(x, t.key))}" target="_blank" rel="noopener" ${t.key === 'intro' ? html`data-wa-intro="${x.match_id}"` : ''}><i class="fab fa-whatsapp" aria-hidden="true"></i><span>Open in WhatsApp</span></a>` : ''}</div>
      </div>`)}</div>`,
  });
  modal.body.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy-tpl]');
    if (b) copyText(messageFor(x, FIRST_MESSAGES[Number(b.dataset.copyTpl)].key), 'Message copied');
    const w = e.target.closest('[data-wa-intro]');
    if (w) nudgeIntro(x);
  });
}

function nudgeIntro(x) {
  if (done(x, 'intro_sent')) return;
  setTimeout(() => toast(`Sent it? Tick "Intro WhatsApp sent" for ${menteeFirst(x)} so Team MSC knows.`, { type: 'info', timeout: 6000 }), 600);
}

function stepperHtml(id, value, max) {
  return html`<div class="ms-mentor-stepper">
    <button type="button" class="ms-icon-btn" data-step="${id}" data-delta="-1" aria-label="Decrease"><i class="fas fa-minus" aria-hidden="true"></i></button>
    <input class="ms-input" id="${id}" type="number" inputmode="numeric" min="0" max="${max}" step="1" value="${value}">
    <button type="button" class="ms-icon-btn" data-step="${id}" data-delta="1" aria-label="Increase"><i class="fas fa-plus" aria-hidden="true"></i></button>
  </div>`;
}

function openLogCall(x) {
  const today = istDateKey();
  const start = istDateKey(x.started_at);
  const wk = Math.min(60, weekNumber(x.started_at) || 1);
  const existing = (x.calls || []).find((c) => Number(c.week_no) === wk);
  const ex = existing ? parseNotes(existing.notes) : { mood: null, text: '' };
  const NOTES_MAX = 1000;
  let weekTouched = false;
  const modal = openModal({
    title: `Log a call with ${menteeFirst(x)}`,
    body: html`<form class="ms-form ms-mentor-logform" novalidate>
      ${existing ? html`<div class="ms-callout ms-callout--gray"><i class="fas fa-pen" aria-hidden="true"></i><div>Week ${wk} is already logged. Saving again updates it.</div></div>` : ''}
      <div class="ms-form-grid">
        <div class="ms-field"><label class="ms-label" for="lc-date"><span class="ms-req">Date of the call</span></label>
          <input class="ms-input" id="lc-date" type="date" min="${start}" max="${today}" value="${existing?.called_on || today}">
          <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span></span></span></div>
        <div class="ms-field"><label class="ms-label" for="lc-week"><span class="ms-req">Week</span></label>
          <input class="ms-input" id="lc-week" type="number" inputmode="numeric" min="1" max="60" value="${wk}">
          <span class="ms-hint">Week 1 is the first 7 days after the match.</span>
          <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span></span></span></div>
        <div class="ms-field ms-span-2"><label class="ms-label" for="lc-stage"><span class="ms-req">Where are they in the hunt?</span></label>
          <select class="ms-select" id="lc-stage"><option value="">Pick a stage</option>
            ${HUNT_STAGES.map((s) => html`<option value="${s.key}" ${(existing?.hunt_stage || x.latest_stage) === s.key ? 'selected' : ''}>${s.label}</option>`)}</select>
          <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span></span></span></div>
        <div class="ms-field"><label class="ms-label" for="lc-apps">Applications this week</label>${stepperHtml('lc-apps', existing?.applications_count ?? 0, 500)}</div>
        <div class="ms-field"><label class="ms-label" for="lc-int">Interviews this week</label>${stepperHtml('lc-int', existing?.interviews_count ?? 0, 100)}</div>
        <div class="ms-field ms-span-2"><span class="ms-label" id="lc-mood-l">How are they feeling?</span>
          <div class="ms-choices" role="radiogroup" aria-labelledby="lc-mood-l">${MOODS.map((m) => html`<label class="ms-choice"><input type="radio" name="lc-mood" value="${m.key}" ${ex.mood === m.key ? 'checked' : ''}><span>${m.label}</span></label>`)}</div></div>
        <div class="ms-field ms-span-2"><label class="ms-label" for="lc-notes">Notes</label>
          <textarea class="ms-textarea" id="lc-notes" rows="4" maxlength="${NOTES_MAX - 20}" placeholder="What you discussed, blockers, and the one focus for next week.">${ex.text}</textarea>
          <span class="ms-hint">Only you and Team MSC see these notes.</span></div>
      </div>
    </form>`,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      { label: existing ? 'Update call' : 'Save call', variant: 'primary', onClick: (md) => saveCall(md, x) },
    ],
  });
  const f = modal.body;
  f.querySelector('form').addEventListener('submit', (e) => e.preventDefault());
  f.querySelector('#lc-week').addEventListener('input', () => { weekTouched = true; });
  f.querySelector('#lc-date').addEventListener('change', (e) => {
    if (weekTouched || !e.target.value) return;
    f.querySelector('#lc-week').value = String(Math.min(60, weekNumber(x.started_at, new Date(`${e.target.value}T12:00:00+05:30`)) || 1));
  });
  f.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (!b) return;
    const inp = f.querySelector(`#${b.dataset.step}`);
    const max = Number(inp.max || 500);
    inp.value = String(Math.max(0, Math.min(max, (parseInt(inp.value, 10) || 0) + Number(b.dataset.delta))));
  });
}

async function saveCall(modal, x) {
  const f = modal.body;
  const err = (id, msg) => {
    const w = f.querySelector(`#${id}`).closest('.ms-field');
    w.classList.toggle('is-invalid', !!msg);
    const s = w.querySelector('.ms-error span');
    if (s) s.textContent = msg || '';
    return !!msg;
  };
  const date = f.querySelector('#lc-date').value;
  const week = parseInt(f.querySelector('#lc-week').value, 10);
  const stage = f.querySelector('#lc-stage').value;
  const apps = parseInt(f.querySelector('#lc-apps').value, 10) || 0;
  const ints = parseInt(f.querySelector('#lc-int').value, 10) || 0;
  const mood = f.querySelector('input[name="lc-mood"]:checked')?.value || null;
  const text = f.querySelector('#lc-notes').value.trim();
  const today = istDateKey();
  const start = istDateKey(x.started_at);
  let bad = false;
  bad = err('lc-date', !date ? 'Pick the date of the call.' : date > today ? 'The call date cannot be in the future.' : date < start ? `The match started on ${formatDate(x.started_at)}.` : '') || bad;
  bad = err('lc-week', !Number.isInteger(week) || week < 1 || week > 60 ? 'Week should be between 1 and 60.' : '') || bad;
  bad = err('lc-stage', !stage ? 'Pick where they are in the hunt.' : '') || bad;
  if (bad) return false;
  const notes = `${mood ? `Mood: ${mood}. ` : ''}${text}`.trim().slice(0, 1000) || null;
  const row = await rpc('mentorship_log_call', {
    p_match_id: x.match_id, p_week_no: week, p_called_on: date, p_stage: stage,
    p_applications: Math.min(500, apps), p_interviews: Math.min(100, ints), p_notes: notes,
  });
  const call = row && typeof row === 'object' ? row : { week_no: week, called_on: date, hunt_stage: stage, applications_count: apps, interviews_count: ints, notes, created_at: new Date().toISOString() };
  const isNewWeek = !(x.calls || []).some((c) => Number(c.week_no) === Number(call.week_no));
  if (isNewWeek && x.calls_total !== undefined && x.calls_total !== null) x.calls_total = Number(x.calls_total) + 1;
  x.calls = [call, ...(x.calls || []).filter((c) => Number(c.week_no) !== Number(call.week_no))].sort((a, b) => Number(b.week_no) - Number(a.week_no));
  const latest = [...x.calls].sort((a, b) => String(b.called_on).localeCompare(String(a.called_on)))[0];
  x.last_call_on = latest?.called_on || null;
  x.days_since_call = latest ? daysSince(latest.called_on) : null;
  x.latest_stage = x.calls[0]?.hunt_stage || stage;
  x.latest_applications = x.calls[0]?.applications_count ?? apps;
  if (x.days_since_call !== null && x.days_since_call < 8) x.flags = (x.flags || []).filter((fl) => fl !== 'no_call_8d');
  open.add(x.match_id);
  rerenderCard(x.match_id);
  toast(`Week ${call.week_no} call logged.${done(x, 'first_call') ? '' : ' Tick "First call done" too.'}`, { type: 'success' });
  track('mentor_call_logged', { week: call.week_no });
  return true;
}

async function loadPast(btn) {
  setBusy(btn, true);
  try {
    past = await rpc('mentorship_my_mentees', { p_include_closed: true }) || [];
    renderPanel();
  } catch (e) { showError(e); setBusy(btn, false); }
}

async function setAccepting(input) {
  const on = input.checked;
  const paused = mentor().status === 'paused';
  input.disabled = true;
  try {
    const row = await rpc('mentorship_save_mentor', { p_patch: { accepting: on } });
    if (row && typeof row === 'object') mm.mentor = { ...mm.mentor, ...row };
    else mm.mentor.accepting = on;
    mm.mentor.accepting = on;
    const top = main.querySelector('.ms-mentor-top');
    if (top) { const tmp = document.createElement('div'); setContent(tmp, headerHtml()); top.replaceWith(tmp.firstElementChild); }
    toast(on ? (paused ? 'Saved. You will get new mentees once Team MSC resumes your profile.' : 'You are taking new mentees.')
      : 'New mentees paused. Your current mentees are not affected.', { type: 'success' });
    track('mentor_accepting', { on });
  } catch (e) { input.checked = !on; showError(e); } finally { input.disabled = false; }
}

function bind() {
  main.addEventListener('click', async (e) => {
    const t = e.target.closest('button, a');
    if (!t || !main.contains(t)) return;
    if (t.dataset.tab) { e.preventDefault(); setTab(t.dataset.tab); if (!t.classList.contains('ms-tab')) scrollToEl(main.querySelector('.ms-mentor-tabs')); return; }
    if (t.dataset.toggle) {
      const id = t.dataset.toggle;
      if (open.has(id)) open.delete(id); else open.add(id);
      const card = t.closest('.ms-mentor-mentee');
      const body = card.querySelector('.ms-mentor-mentee__body');
      body.hidden = !open.has(id);
      card.classList.toggle('is-open', open.has(id));
      t.setAttribute('aria-expanded', open.has(id) ? 'true' : 'false');
      return;
    }
    if (t.dataset.check) { await toggleCheck(t); return; }
    if (t.dataset.log) { const x = mentees.find((m) => m.match_id === t.dataset.log); if (x) openLogCall(x); return; }
    if (t.dataset.templates) { const x = mentees.find((m) => m.match_id === t.dataset.templates); if (x) openTemplates(x); return; }
    if (t.dataset.gotoMatch) {
      open.add(t.dataset.gotoMatch);
      rerenderCard(t.dataset.gotoMatch);
      scrollToEl(main.querySelector(`[data-match="${CSS.escape(t.dataset.gotoMatch)}"]`));
      return;
    }
    if (t.dataset.allcalls) {
      const id = t.dataset.allcalls;
      if (showAllCalls.has(id)) showAllCalls.delete(id); else showAllCalls.add(id);
      rerenderCard(id);
      return;
    }
    if (t.dataset.waIntro) { const x = mentees.find((m) => m.match_id === t.dataset.waIntro); if (x) nudgeIntro(x); return; }
    if (t.matches('[data-past]')) { await loadPast(t); return; }
    if (t.dataset.copy) { copyText(t.dataset.copy, 'Link copied'); }
  });
  main.addEventListener('change', (e) => { if (e.target.matches('[data-accepting]')) setAccepting(e.target); });
}

/* ---------------------------------------------------------------------------
   Gate + boot (SPEC §10 status table)
   ------------------------------------------------------------------------ */
async function boot() {
  if (!ctx.user) {
    // Keep ?match= / ?tab= through login (the match mail links to /mentorship/mentor/?match=<id>).
    setContent(main, loggedOutScreen({ title: 'Mentor dashboard', text: 'Log in to see your mentees, their checklists, your weekly calls and your payouts.', path: location.pathname + location.search,
      icon: 'fa-gauge', extraActions: [{ label: 'Become a mentor', href: PATHS.apply, variant: 'ghost' }] }));
    return;
  }
  if (!ctx.backendReady) { setContent(main, backendNotReady()); return; }
  if (ctx.error) { setContent(main, loadError(ctx.error)); bindRetry(main); return; }
  const st = ctx.mentor?.status;
  if (!st) {
    setContent(main, statusScreen({ icon: 'fa-hand-holding-heart', eyebrow: 'Mentor dashboard', title: 'Become an MSC mentor',
      text: `Done your industrial training or articleship? Guide CA students through their hunt. ${formatINR(config.mentor_fee_inr ?? 500)} per mentee, paid by Team MSC.`,
      actions: [{ label: 'Apply to mentor', href: PATHS.apply, icon: 'fa-file-pen' }, { label: 'How mentorship works', href: PATHS.hub, variant: 'ghost' }], extra: journeySteps(-1) }));
    return;
  }
  if (st === 'draft') {
    setContent(main, statusScreen({ icon: 'fa-file-pen', tone: 'amber', eyebrow: 'Mentor dashboard', title: 'Continue your application',
      text: 'Your draft is saved. Finish it and submit; your training opens right after.',
      actions: [{ label: 'Continue your application', href: PATHS.apply, icon: 'fa-arrow-right' }], extra: journeySteps(0) }));
    return;
  }
  // Live mentors: load the profile and the mentees in parallel (fast first paint).
  const live = st === 'approved' || st === 'paused';
  const menteesP = live ? rpc('mentorship_my_mentees', { p_include_closed: false }).catch((e) => e) : null;
  try { mm = await rpc('mentorship_my_mentor'); } catch (e) { setContent(main, loadError(e)); bindRetry(main); return; }
  const status = mm?.mentor?.status || st;
  if (status === 'submitted') {
    setContent(main, statusScreen({ icon: 'fa-graduation-cap', eyebrow: 'Mentor dashboard', title: 'Next: mentor training',
      text: 'Watch the lecture, read the playbook and pass a short quiz. Then Team MSC reviews your application.',
      actions: [{ label: 'Open mentor training', href: PATHS.training, icon: 'fa-arrow-right' }], extra: journeySteps(1) }));
    return;
  }
  if (status === 'training_passed') {
    setContent(main, statusScreen({ icon: 'fa-user-shield', tone: 'purple', eyebrow: 'Mentor dashboard', title: "You're in review",
      text: 'You passed the training. Team MSC reviews every application within 7 days, and we will email you the decision. Once you are approved, this page becomes your dashboard: your mentees, their checklists, your calls and your payouts.',
      actions: [{ label: 'Reread the playbook', href: `${PATHS.training}#playbook`, icon: 'fa-book-open', variant: 'secondary' }, { label: 'Edit your profile', href: PATHS.apply, variant: 'ghost' }],
      extra: journeySteps(2) }));
    return;
  }
  if (status === 'rejected') {
    const openAgain = !mm.mentor.reapply_after || istDateKey() >= String(mm.mentor.reapply_after).slice(0, 10);
    setContent(main, statusScreen({ icon: 'fa-hourglass-half', tone: 'amber', eyebrow: 'Mentor dashboard', title: 'Not approved this time',
      text: openAgain ? 'You can apply again now. Update your application and submit it.' : `Thank you for applying. You can apply again from ${formatDate(mm.mentor.reapply_after)}.`,
      extra: mm.mentor.reject_reason ? html`<div class="ms-callout ms-callout--gray"><i class="fas fa-comment" aria-hidden="true"></i><div><span class="ms-callout__title">Note from Team MSC</span>${mm.mentor.reject_reason}</div></div>` : '',
      actions: openAgain ? [{ label: 'Update and reapply', href: PATHS.apply, icon: 'fa-rotate' }] : [{ label: 'Back to mentorship', href: PATHS.hub, variant: 'secondary' }] }));
    return;
  }
  const res = menteesP ? await menteesP : await rpc('mentorship_my_mentees', { p_include_closed: false }).catch((e) => e);
  if (res instanceof Error) { setContent(main, loadError(res)); bindRetry(main); return; }
  mentees = Array.isArray(res) ? res : [];
  mentees = mentees.filter(isActive);
  if (!open.size && mentees.length && mentees.length <= 2) open.add(mentees[0].match_id);
  render();
  bind();
}

await boot();
