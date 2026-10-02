/* Admin: Matches, Unmatched and Switch requests tabs, plus the match modal. Owner: admin builder. */
import {
  html, setContent, emptyState, openModal, avatarHtml, statusBadge, starsHtml, labelOf, HUNT_STAGES, MATCH_STATUS, PAYOUT_STATUS, programLabel, formatDate, formatDateTime, timeAgo, debounce, downloadCsv, rpc, toast,
  showError, firstName, istDateKey, plural, formatPhone, formatINR, enabledPrograms, CHECKLIST_ITEMS,
} from '/mentorship/assets/mentorship-core.js?v=1';
import {
  load, chipsHtml, errorBlock, cityLabel, waButton, waIconLink, personContact, pickMentor, askText,
  invalidateMatchData, daysAgoText, haystack, programOptions, menteeNudge, mentorNudge, csvPhone,
} from './admin-shared.js?v=1';

const SOURCE_LABEL = { self: 'Picked by the student', admin: 'Assigned by Team MSC', switch: 'Reassigned' };
const REASSIGN_PICKS = ['Mentor is not responding', 'The student asked for a switch', 'Mentor is paused', 'Better domain fit'];

/* ========================================================================== */
/* Match modal                                                                */
/* ========================================================================== */

async function findMatch(id) {
  const act = await load.matches('active');
  let m = act.find((x) => x.match_id === id);
  if (!m) {
    const all = await load.matches(null);
    m = all.find((x) => x.match_id === id);
  }
  return m || null;
}

export async function openMatchModal(mOrId, app) {
  let m = mOrId && typeof mOrId === 'object' ? mOrId : null;
  if (!m) {
    try { m = await findMatch(mOrId); } catch (e) { showError(e); return; }
  }
  if (!m) { toast('That match is not in the list any more. Refresh and try again.', { type: 'warn' }); return; }
  const mentee = m.mentee || {};
  const mentor = m.mentor || {};
  const pulse = m.last_pulse;
  const done = Number(m.checklist_done || 0);
  const total = Number(m.checklist_total || CHECKLIST_ITEMS.length);
  const active = m.status === 'active';

  const body = html`<div class="ms-stack" style="--ms-gap:14px">
    <div class="ms-row" style="--ms-gap:6px">
      ${statusBadge('match', m.status)}
      <span class="ms-chip ms-tone-outline">${programLabel(m.program)}</span>
      <span class="ms-chip">${SOURCE_LABEL[m.source] || 'Match'}</span>
      <span class="ms-small ms-text-2">Week ${m.week_no || 1} · started ${formatDate(m.started_at)}${m.ended_at ? ` · closed ${formatDate(m.ended_at)}` : ''}</span>
    </div>
    <div class="ms-grid ms-grid--2">
      ${personContact({ title: 'Mentee', name: mentee.full_name, sub: cityLabel(mentee.city), whatsapp: mentee.whatsapp, email: mentee.email, waText: menteeNudge('', { mentee: mentee.full_name, mentor: mentor.full_name }), subject: 'Your MSC mentorship' })}
      ${personContact({ title: 'Mentor', name: mentor.full_name, whatsapp: mentor.whatsapp, email: mentor.email, waText: mentorNudge('', { mentor: mentor.full_name, mentee: mentee.full_name }), subject: `Your mentee ${mentee.full_name || ''}`.trim() })}
    </div>
    <section class="ms-admin-sec">
      <div class="ms-admin-sec__title"><span>Progress</span></div>
      <dl class="ms-kv">
        <dt>Checklist</dt><dd><div class="ms-admin-load"><span class="ms-strong">${done}/${total}</span><span class="ms-progress ms-admin-minibar"><span class="ms-progress__bar" style="width:${total ? Math.round((done / total) * 100) : 0}%"></span></span></div></dd>
        <dt>Last call</dt><dd>${m.last_call_on ? `${formatDate(m.last_call_on)} (${daysAgoText(m.days_since_call)})` : 'No call logged yet'}</dd>
        <dt>Hunt stage</dt><dd>${labelOf(HUNT_STAGES, m.latest_stage) || '—'}</dd>
        <dt>Last check-in</dt><dd>${pulse ? html`${starsHtml(pulse.rating)} <span class="ms-small">${pulse.rating}/5 · mentor called: ${pulse.mentor_called ? 'yes' : html`<strong class="ms-admin-bad">no</strong>`} · ${plural(pulse.applications_count || 0, 'application')} · ${timeAgo(pulse.created_at)}</span>` : 'No check-in yet'}</dd>
        ${pulse?.issue ? html`<dt>Issue raised</dt><dd><p class="ms-admin-answer ms-admin-answer--warn">${pulse.issue}</p><span class="ms-xs ms-muted">Private: the mentor never sees check-ins.</span></dd>` : ''}
        <dt>Review</dt><dd>${m.review ? html`${starsHtml(m.review.rating)} ${m.review.safety_flag ? html`<span class="ms-badge ms-tone-red">Safety flag</span>` : ''}` : 'Not yet'}</dd>
      </dl>
    </section>
    <section class="ms-admin-sec">
      <div class="ms-admin-sec__title"><span>Payout</span>${statusBadge('payout', m.payout_status)}</div>
      <dl class="ms-kv">
        <dt>Fee</dt><dd>${formatINR(m.fee_inr)}</dd>
        ${m.paid_at ? html`<dt>Paid on</dt><dd>${formatDate(m.paid_at)}</dd>` : ''}
        ${m.payout_ref ? html`<dt>Reference</dt><dd>${m.payout_ref}</dd>` : ''}
      </dl>
    </section>
  </div>`;

  const actions = [{ label: 'Mentor profile', variant: 'ghost', onClick: () => { app.openMentor(mentor.id); return true; } }];
  if (app.canWrite && active) {
    actions.push({ label: 'End match', variant: 'danger-soft', onClick: async (modal) => { modal.close(); await endMatch(m, app); return true; } });
    actions.push({ label: 'Reassign', variant: 'primary', onClick: async (modal) => { modal.close(); await reassign(m, app); return true; } });
  }
  openModal({ title: `${mentee.full_name || 'Mentee'} with ${mentor.full_name || 'mentor'}`, body, wide: true, actions });
}

export async function reassign(m, app) {
  const pick = await pickMentor({
    title: `Reassign ${m.mentee?.full_name || 'this mentee'}`,
    intro: `Now with ${m.mentor?.full_name || 'their mentor'}. This match closes as "switched" and a new one starts today. The student and the new mentor both get an email.`,
    program: m.program, excludeIds: [m.mentor?.id].filter(Boolean), confirmLabel: 'Reassign',
    reason: { label: 'Reason', placeholder: 'Short and kind: if the student asked for a switch, they see this as our reply', min: 5, picks: REASSIGN_PICKS },
    allowForce: true,
  });
  if (!pick) return false;
  try {
    await rpc('mentorship_admin_reassign', { p_match_id: m.match_id, p_new_mentor_id: pick.mentor.id, p_reason: pick.reason, p_force: pick.force });
    toast(`${firstName(m.mentee?.full_name) || 'The mentee'} is now with ${pick.mentor.full_name}.`, { type: 'success' });
    invalidateMatchData();
    app.refresh();
    return true;
  } catch (e) {
    if (e.code === 'mentor_full') toast(`${pick.mentor.full_name} is full. Turn on the capacity override to assign anyway.`, { type: 'error', timeout: 6000 });
    else showError(e);
    return false;
  }
}

async function endMatch(m, app) {
  let result = null;
  const body = document.createElement('div');
  body.className = 'ms-stack';
  const seq = Date.now();
  setContent(body, html`
    <p class="ms-small ms-text-2">This frees a slot for ${m.mentor?.full_name || 'the mentor'}. The payout status stays as it is; set it from the Payouts tab.</p>
    <div class="ms-options" role="radiogroup" aria-label="How did it end?">
      <label class="ms-option"><input type="radio" name="end-${seq}" value="completed" checked><span class="ms-option__mark"></span><span class="ms-option__body"><span class="ms-option__title">Completed</span><span class="ms-option__desc">They joined, or the hunt is over.</span></span></label>
      <label class="ms-option"><input type="radio" name="end-${seq}" value="ended"><span class="ms-option__mark"></span><span class="ms-option__body"><span class="ms-option__title">Ended early</span><span class="ms-option__desc">Stopped before the end: dropped out, left the program, or the mentor left.</span></span></label>
    </div>
    <div class="ms-field"><label class="ms-label" for="end-r-${seq}">Reason</label><textarea class="ms-textarea" id="end-r-${seq}" rows="2" maxlength="600" placeholder="Short and kind: the student may see it if they asked for a switch"></textarea>
      <span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Please add a reason when ending early.</span></div>`);
  await new Promise((resolve) => {
    openModal({
      title: `End ${firstName(m.mentee?.full_name) || 'this'}'s match?`, body, onClose: resolve,
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: 'End match', variant: 'danger',
          onClick: async () => {
            const status = body.querySelector(`input[name="end-${seq}"]:checked`)?.value || 'completed';
            const ta = body.querySelector('textarea');
            const reason = ta.value.trim();
            if (status === 'ended' && reason.length < 5) { ta.closest('.ms-field').classList.add('is-invalid'); ta.focus(); return false; }
            await rpc('mentorship_admin_end_match', { p_match_id: m.match_id, p_status: status, p_reason: reason || null });
            result = status;
            return true;
          },
        },
      ],
    });
  });
  if (result) {
    toast(result === 'completed' ? 'Match marked as completed.' : 'Match ended.', { type: 'success' });
    invalidateMatchData();
    app.refresh();
  }
}

/* ========================================================================== */
/* Matches tab                                                                */
/* ========================================================================== */

const MATCH_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'switched', label: 'Switched' },
  { value: 'ended', label: 'Ended' },
  { value: 'all', label: 'All' },
];
const MATCH_SORTS = [
  { value: 'attention', label: 'Needs attention first' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'mentor', label: 'Mentor name' },
];

function callDays(x) {
  if (x.days_since_call !== null && x.days_since_call !== undefined) return x.days_since_call;
  return null;
}
function attentionScore(x) {
  let s = 0;
  const d = callDays(x);
  if (d === null ? (x.week_no || 1) > 1 : d >= 8) s += 2;
  if (x.last_pulse && (Number(x.last_pulse.rating) < 4 || x.last_pulse.mentor_called === false)) s += 3;
  if (x.last_pulse?.issue) s += 2;
  if (x.review?.safety_flag) s += 5;
  return s;
}

export async function renderMatches(panel, app, token) {
  const f = app.filters.matches || (app.filters.matches = { status: 'active', program: 'all', q: '', sort: 'attention' });
  const status = f.status === 'all' ? null : f.status;
  let rows;
  try { rows = await load.matches(status, f.program === 'all' ? null : f.program); } catch (e) {
    if (!app.isLive(token)) return;
    setContent(panel, errorBlock(e, 'adm-mt-retry'));
    panel.querySelector('#adm-mt-retry')?.addEventListener('click', () => app.refresh({ hard: true }));
    return;
  }
  if (!app.isLive(token)) return;
  const programs = programOptions(app.ctx.config, rows.map((r) => r.program));

  const filtered = () => {
    const term = f.q.trim().toLowerCase();
    const sorters = {
      attention: (a, b) => attentionScore(b) - attentionScore(a) || String(a.started_at).localeCompare(String(b.started_at)),
      newest: (a, b) => String(b.started_at).localeCompare(String(a.started_at)),
      oldest: (a, b) => String(a.started_at).localeCompare(String(b.started_at)),
      mentor: (a, b) => String(a.mentor?.full_name).localeCompare(String(b.mentor?.full_name)),
    };
    return rows.filter((x) => !term || haystack(x.mentee?.full_name, x.mentee?.email, x.mentee?.city, x.mentor?.full_name, x.mentor?.email).includes(term))
      .sort(sorters[f.sort] || sorters.attention);
  };

  setContent(panel, html`
    <div class="ms-admin-toolbar">
      <label class="ms-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input class="ms-input" type="search" placeholder="Search mentee or mentor" value="${f.q}" data-q aria-label="Search matches"></label>
      ${programs.length > 1 ? html`<select class="ms-select ms-admin-select" data-program aria-label="Program"><option value="all">All programs</option>${programs.map((p) => html`<option value="${p}"${p === f.program ? ' selected' : ''}>${programLabel(p)}</option>`)}</select>` : ''}
      <select class="ms-select ms-admin-select" data-sort aria-label="Sort">${MATCH_SORTS.map((s) => html`<option value="${s.value}"${s.value === f.sort ? ' selected' : ''}>${s.label}</option>`)}</select>
      <button type="button" class="ms-btn ms-btn--outline" data-csv><i class="fas fa-file-csv" aria-hidden="true"></i><span>Export CSV</span></button>
    </div>
    <div class="ms-admin-toolbar">${chipsHtml('mtst', MATCH_FILTERS, f.status, { label: 'Match status' })}</div>
    <div data-list></div>`);

  const list = panel.querySelector('[data-list]');
  const draw = () => {
    const shown = filtered();
    if (!shown.length) {
      setContent(list, html`<div class="ms-card">${emptyState({ icon: 'fa-link', title: rows.length ? 'No match fits this search' : `No ${f.status === 'all' ? '' : MATCH_STATUS[f.status]?.label.toLowerCase() || ''} matches yet`, text: rows.length ? 'Try another name.' : f.status === 'active' ? 'When students pick a mentor, they show up here.' : '' })}</div>`);
      return;
    }
    setContent(list, html`<div class="ms-table-wrap"><table class="ms-table ms-table--stack ms-admin-table">
      <thead><tr><th>Mentee</th><th>Mentor</th><th>Week</th><th>Last call</th><th>Last check-in</th><th>Checklist</th><th>Payout</th><th><span class="ms-sr-only">Actions</span></th></tr></thead>
      <tbody>${shown.map((x) => {
        const d = callDays(x);
        const late = d === null ? (x.week_no || 1) > 1 : d >= 8;
        const p = x.last_pulse;
        const done = Number(x.checklist_done || 0);
        const total = Number(x.checklist_total || CHECKLIST_ITEMS.length);
        return html`<tr>
          <td class="ms-admin-td-main" data-label="Mentee"><div class="ms-person">${avatarHtml({ name: x.mentee?.full_name, size: 'sm' })}<div class="ms-grow">
            <button type="button" class="ms-admin-linkbtn" data-match="${x.match_id}">${x.mentee?.full_name || 'Mentee'}</button>
            <div class="ms-person__sub">${[cityLabel(x.mentee?.city), programs.length > 1 ? programLabel(x.program) : '', x.status !== 'active' ? MATCH_STATUS[x.status]?.label : ''].filter(Boolean).join(' · ')}</div></div>${waIconLink(x.mentee?.whatsapp, menteeNudge('', { mentee: x.mentee?.full_name, mentor: x.mentor?.full_name }), `WhatsApp ${x.mentee?.full_name || 'mentee'}`)}</div></td>
          <td data-label="Mentor"><button type="button" class="ms-admin-linkbtn" data-mentor="${x.mentor?.id}">${x.mentor?.full_name || '—'}</button></td>
          <td data-label="Week"><span><span class="ms-strong">${x.week_no || 1}</span> <span class="ms-xs ms-muted">since ${formatDate(x.started_at, { year: undefined })}</span></span></td>
          <td data-label="Last call">${x.last_call_on ? html`<span class="${late ? 'ms-admin-bad' : ''}">${daysAgoText(d)}</span>` : html`<span class="${late ? 'ms-admin-bad' : 'ms-muted'}">None yet</span>`}</td>
          <td data-label="Last check-in">${p ? html`<span class="ms-admin-pulse">${starsHtml(p.rating)}${p.mentor_called === false ? html`<span class="ms-badge ms-tone-red" title="Mentee says the mentor did not call">No call</span>` : ''}${p.issue ? html`<i class="fas fa-triangle-exclamation ms-admin-warnicon" title="Issue raised" aria-label="Issue raised"></i>` : ''}</span>` : html`<span class="ms-muted">None yet</span>`}</td>
          <td data-label="Checklist"><div class="ms-admin-load"><span>${done}/${total}</span><span class="ms-progress ms-admin-minibar"><span class="ms-progress__bar" style="width:${total ? Math.round((done / total) * 100) : 0}%"></span></span></div></td>
          <td data-label="Payout">${statusBadge('payout', x.payout_status)}</td>
          <td class="ms-admin-td-actions" data-label="Actions"><div class="ms-btn-row ms-admin-actions">
            <button type="button" class="ms-btn ms-btn--outline ms-btn--sm" data-match="${x.match_id}"><span>Open</span></button>
            ${app.canWrite && x.status === 'active' ? html`<button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-reassign="${x.match_id}"><span>Reassign</span></button>` : ''}
          </div></td>
        </tr>`;
      })}</tbody></table></div>
      <p class="ms-xs ms-muted ms-mt-8">${plural(shown.length, 'match', 'matches')}. Check-ins are private to Team MSC; mentors never see them.</p>`);
  };
  draw();

  const byId = (id) => rows.find((x) => x.match_id === id);
  panel.querySelector('[data-q]').addEventListener('input', debounce((e) => { f.q = e.target.value; draw(); }, 150));
  panel.querySelector('[data-sort]').addEventListener('change', (e) => { f.sort = e.target.value; draw(); });
  panel.querySelector('[data-program]')?.addEventListener('change', (e) => { f.program = e.target.value; renderMatches(panel, app, token); });
  panel.querySelector('[data-chips="mtst"]').addEventListener('change', (e) => { f.status = e.target.value; setContent(list, html`<div class="ms-loading"><span class="ms-spinner"></span></div>`); renderMatches(panel, app, token); });
  list.addEventListener('click', (e) => {
    const mt = e.target.closest('[data-match]');
    if (mt) { openMatchModal(byId(mt.dataset.match) || mt.dataset.match, app); return; }
    const mn = e.target.closest('[data-mentor]');
    if (mn && mn.dataset.mentor) { app.openMentor(mn.dataset.mentor); return; }
    const ra = e.target.closest('[data-reassign]');
    if (ra) reassign(byId(ra.dataset.reassign), app);
  });
  panel.querySelector('[data-csv]').addEventListener('click', () => {
    downloadCsv(`msc-matches-${f.status}-${istDateKey()}`, filtered(), [
      { label: 'Mentee', value: (x) => x.mentee?.full_name || '' },
      { label: 'Mentee email', value: (x) => x.mentee?.email || '' },
      { label: 'Mentee WhatsApp', value: (x) => csvPhone(x.mentee?.whatsapp) },
      { label: 'Mentee city', value: (x) => cityLabel(x.mentee?.city) },
      { label: 'Mentor', value: (x) => x.mentor?.full_name || '' },
      { label: 'Mentor email', value: (x) => x.mentor?.email || '' },
      { label: 'Program', value: (x) => programLabel(x.program) },
      { label: 'Status', value: (x) => MATCH_STATUS[x.status]?.label || x.status },
      { label: 'Source', value: (x) => SOURCE_LABEL[x.source] || x.source || '' },
      { label: 'Started', value: (x) => istDateKey(x.started_at) },
      { label: 'Week', value: (x) => x.week_no || '' },
      { label: 'Last call', value: (x) => x.last_call_on || '' },
      { label: 'Days since call', value: (x) => x.days_since_call ?? '' },
      { label: 'Hunt stage', value: (x) => labelOf(HUNT_STAGES, x.latest_stage) },
      { label: 'Last check-in rating', value: (x) => x.last_pulse?.rating ?? '' },
      { label: 'Mentor called (check-in)', value: (x) => (x.last_pulse ? (x.last_pulse.mentor_called ? 'Yes' : 'No') : '') },
      { label: 'Applications (check-in)', value: (x) => x.last_pulse?.applications_count ?? '' },
      { label: 'Issue raised', value: (x) => x.last_pulse?.issue || '' },
      { label: 'Checklist done', value: (x) => `${x.checklist_done || 0}/${x.checklist_total || CHECKLIST_ITEMS.length}` },
      { label: 'Review rating', value: (x) => x.review?.rating ?? '' },
      { label: 'Safety flag', value: (x) => (x.review?.safety_flag ? 'Yes' : '') },
      { label: 'Fee (Rs)', value: (x) => x.fee_inr ?? '' },
      { label: 'Payout', value: (x) => PAYOUT_STATUS[x.payout_status]?.label || x.payout_status },
      { label: 'Paid on', value: (x) => (x.paid_at ? istDateKey(x.paid_at) : '') },
      { label: 'Payout reference', value: (x) => x.payout_ref || '' },
    ]);
  });
}

/* ========================================================================== */
/* Unmatched tab                                                              */
/* ========================================================================== */

export async function renderUnmatched(panel, app, token) {
  const progs = enabledPrograms(app.ctx.config);
  const f = app.filters.unmatched || (app.filters.unmatched = { program: progs[0] || 'industrial-training', q: '' });
  if (!progs.includes(f.program) && progs.length) f.program = progs[0];
  let rows;
  try { rows = await load.unmatched(f.program); } catch (e) {
    if (!app.isLive(token)) return;
    setContent(panel, errorBlock(e, 'adm-um-retry'));
    panel.querySelector('#adm-um-retry')?.addEventListener('click', () => app.refresh({ hard: true }));
    return;
  }
  if (!app.isLive(token)) return;
  const filtered = () => {
    const term = f.q.trim().toLowerCase();
    return rows.filter((x) => !term || haystack(x.name, x.email, x.city, x.batch).includes(term))
      .sort((a, b) => Number(b.days_waiting || 0) - Number(a.days_waiting || 0));
  };

  setContent(panel, html`
    <div class="ms-admin-toolbar">
      <label class="ms-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input class="ms-input" type="search" placeholder="Search name, email, city, batch" value="${f.q}" data-q aria-label="Search students"></label>
      ${progs.length > 1 ? html`<select class="ms-select ms-admin-select" data-program aria-label="Program">${progs.map((p) => html`<option value="${p}"${p === f.program ? ' selected' : ''}>${programLabel(p)}</option>`)}</select>` : ''}
      <button type="button" class="ms-btn ms-btn--outline" data-csv><i class="fas fa-file-csv" aria-hidden="true"></i><span>Export CSV</span></button>
    </div>
    <p class="ms-small ms-muted ms-mb-16">Enrolled in ${programLabel(f.program)} (or saved a contact card) with no active mentor. Longest wait first. A WhatsApp nudge with the Find link usually does it.</p>
    <div data-list></div>`);

  const list = panel.querySelector('[data-list]');
  const draw = () => {
    const shown = filtered();
    if (!shown.length) {
      setContent(list, html`<div class="ms-card">${emptyState({ icon: 'fa-face-smile', title: rows.length ? 'Nobody fits this search' : 'Everyone has a mentor', text: rows.length ? '' : 'No enrolled student is waiting right now.' })}</div>`);
      return;
    }
    setContent(list, html`<div class="ms-table-wrap"><table class="ms-table ms-table--stack ms-admin-table">
      <thead><tr><th>Student</th><th>WhatsApp</th><th>Enrolled</th><th>Waiting</th><th><span class="ms-sr-only">Actions</span></th></tr></thead>
      <tbody>${shown.map((x) => {
        const d = x.days_waiting === null || x.days_waiting === undefined ? null : Number(x.days_waiting);
        return html`<tr>
          <td class="ms-admin-td-main" data-label="Student"><div class="ms-person">${avatarHtml({ name: x.name || x.email, size: 'sm' })}<div class="ms-grow">
            <div class="ms-person__name">${x.name || 'No name'}</div>
            <div class="ms-person__sub">${[x.email, cityLabel(x.city), x.batch ? `Batch ${x.batch}` : ''].filter(Boolean).join(' · ')}</div>
            ${x.has_student_row ? '' : html`<div class="ms-xs ms-muted">Has not opened Find a mentor yet</div>`}</div></div></td>
          <td data-label="WhatsApp">${x.whatsapp ? waButton(x.whatsapp, menteeNudge('unmatched', { mentee: x.name, program: f.program }), formatPhone(x.whatsapp), { variant: 'outline' }) : html`<span class="ms-muted">Not saved</span>`}</td>
          <td data-label="Enrolled">${x.enrolled_at ? formatDate(x.enrolled_at) : '—'}</td>
          <td data-label="Waiting">${d === null ? html`<span class="ms-muted">—</span>` : html`<span class="ms-badge ${d >= 7 ? 'ms-tone-red' : d >= 2 ? 'ms-tone-amber' : 'ms-tone-gray'}">${plural(d, 'day')}</span>`}</td>
          <td class="ms-admin-td-actions" data-label="Actions">${app.canWrite ? html`<button type="button" class="ms-btn ms-btn--primary ms-btn--sm" data-assign="${x.user_id}"><i class="fas fa-user-plus" aria-hidden="true"></i><span>Assign mentor</span></button>` : ''}</td>
        </tr>`;
      })}</tbody></table></div>
      <p class="ms-xs ms-muted ms-mt-8">${plural(shown.length, 'student')} waiting.</p>`);
  };
  draw();

  panel.querySelector('[data-q]').addEventListener('input', debounce((e) => { f.q = e.target.value; draw(); }, 150));
  panel.querySelector('[data-program]')?.addEventListener('change', (e) => { f.program = e.target.value; renderUnmatched(panel, app, token); });
  list.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-assign]');
    if (!b) return;
    const x = rows.find((r) => r.user_id === b.dataset.assign);
    const pick = await pickMentor({ title: `Assign a mentor to ${x?.name || 'this student'}`, intro: `${programLabel(f.program)}. Both get an email once the match is created.${x?.whatsapp ? '' : ' This student has not saved a WhatsApp number yet, so ask them to add it on My mentor.'}`, program: f.program, confirmLabel: 'Create match' });
    if (!pick) return;
    try {
      await rpc('mentorship_admin_create_match', { p_mentee_user_id: b.dataset.assign, p_mentor_id: pick.mentor.id, p_program: f.program, p_force: pick.force });
      toast(`${firstName(x?.name) || 'The student'} is now matched with ${pick.mentor.full_name}.`, { type: 'success' });
      invalidateMatchData();
      app.refresh();
    } catch (err) {
      if (err.code === 'already_matched') { toast('This student already has an active mentor for this program.', { type: 'warn' }); invalidateMatchData(); app.refresh(); } else showError(err);
    }
  });
  panel.querySelector('[data-csv]').addEventListener('click', () => {
    downloadCsv(`msc-unmatched-${f.program}-${istDateKey()}`, filtered(), [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { label: 'WhatsApp', value: (x) => csvPhone(x.whatsapp) },
      { label: 'City', value: (x) => cityLabel(x.city) },
      { key: 'batch', label: 'Batch' },
      { label: 'Enrolled', value: (x) => (x.enrolled_at ? istDateKey(x.enrolled_at) : '') },
      { key: 'days_waiting', label: 'Days waiting' },
      { label: 'Opened Find a mentor', value: (x) => (x.has_student_row ? 'Yes' : 'No') },
    ]);
  });
}

/* ========================================================================== */
/* Switch requests tab                                                        */
/* ========================================================================== */

const SWITCH_FILTERS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrawn', label: 'Withdrawn' },
  { value: 'all', label: 'All' },
];

export async function renderSwitches(panel, app, token) {
  const f = app.filters.switches || (app.filters.switches = { status: 'pending' });
  let rows;
  try { rows = await load.switches(f.status === 'all' ? null : f.status); } catch (e) {
    if (!app.isLive(token)) return;
    setContent(panel, errorBlock(e, 'adm-sw-retry'));
    panel.querySelector('#adm-sw-retry')?.addEventListener('click', () => app.refresh({ hard: true }));
    return;
  }
  if (!app.isLive(token)) return;
  rows = [...rows].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));

  setContent(panel, html`<div data-root>
    <div class="ms-admin-toolbar">${chipsHtml('swst', SWITCH_FILTERS, f.status, { label: 'Request status' })}</div>
    <p class="ms-small ms-muted ms-mb-16">Each student gets one switch per program. Approving reassigns them right away; the student sees your note on their My mentor page.</p>
    ${rows.length ? html`<div class="ms-grid ms-grid--2">${rows.map((x) => html`<article class="ms-card ms-admin-switch">
      <div class="ms-row ms-between" style="--ms-gap:8px">
        <div class="ms-person">${avatarHtml({ name: x.mentee?.full_name, size: 'sm' })}<div class="ms-grow">
          <div class="ms-person__name">${x.mentee?.full_name || 'Student'}</div>
          <div class="ms-person__sub">from ${x.mentor?.full_name || 'their mentor'} · ${programLabel(x.program)}</div></div></div>
        ${statusBadge('switch', x.status)}
      </div>
      <blockquote class="ms-admin-quote ms-mt-8">${x.reason || 'No reason given.'}</blockquote>
      <div class="ms-xs ms-muted ms-mt-8">Asked ${timeAgo(x.created_at)}${x.resolved_at ? ` · resolved ${formatDateTime(x.resolved_at)}` : ''}</div>
      ${x.resolution_note ? html`<p class="ms-small ms-mt-8"><strong>Note to the student:</strong> ${x.resolution_note}</p>` : ''}
      <div class="ms-card__foot">
        ${app.canWrite && x.status === 'pending' ? html`
          <button type="button" class="ms-btn ms-btn--primary ms-btn--sm" data-approve="${x.id}"><i class="fas fa-right-left" aria-hidden="true"></i><span>Approve and reassign</span></button>
          <button type="button" class="ms-btn ms-btn--danger-soft ms-btn--sm" data-decline="${x.id}"><span>Decline</span></button>` : ''}
        ${waButton(x.mentee?.whatsapp, `Hi ${firstName(x.mentee?.full_name) || 'there'}, Team My Student Club here. We got your request for a different mentor. Can we talk for 5 minutes today?`, 'WhatsApp', { variant: 'outline' })}
        ${x.match_id ? html`<button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-match="${x.match_id}"><span>Match</span></button>` : ''}
        ${x.mentor?.id ? html`<button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-mentor="${x.mentor.id}"><span>Mentor</span></button>` : ''}
      </div>
    </article>`)}</div>` : html`<div class="ms-card">${emptyState({ icon: 'fa-right-left', title: f.status === 'pending' ? 'No switch requests waiting' : 'No requests here', text: f.status === 'pending' ? 'When a student asks for a different mentor, it shows up here.' : '' })}</div>`}</div>`);

  panel.querySelector('[data-chips="swst"]').addEventListener('change', (e) => { f.status = e.target.value; renderSwitches(panel, app, token); });
  panel.querySelector('[data-root]').addEventListener('click', async (e) => {
    if (!app.isLive(token)) return;
    const mt = e.target.closest('[data-match]');
    if (mt) { openMatchModal(mt.dataset.match, app); return; }
    const mn = e.target.closest('[data-mentor]');
    if (mn) { app.openMentor(mn.dataset.mentor); return; }
    const ap = e.target.closest('[data-approve]');
    const dc = e.target.closest('[data-decline]');
    const id = ap?.dataset.approve || dc?.dataset.decline;
    const x = id ? rows.find((r) => r.id === id) : null;
    if (!x) return;
    if (ap) {
      const pick = await pickMentor({
        title: `New mentor for ${x.mentee?.full_name || 'this student'}`,
        intro: `Now with ${x.mentor?.full_name || 'their mentor'}. Their reason: "${x.reason || ''}"`,
        program: x.program, excludeIds: [x.mentor?.id].filter(Boolean), confirmLabel: 'Approve and reassign', allowForce: false,
        reason: { label: 'Note to the student (optional)', required: false, placeholder: 'For example: Your new mentor has done IT in your domain. Hojayega!' },
      });
      if (!pick) return;
      try {
        await rpc('mentorship_admin_resolve_switch', { p_request_id: x.id, p_approve: true, p_new_mentor_id: pick.mentor.id, p_note: pick.reason });
        toast(`Approved. ${firstName(x.mentee?.full_name) || 'The student'} is now with ${pick.mentor.full_name}.`, { type: 'success' });
        invalidateMatchData();
        app.refresh();
      } catch (err) { showError(err); }
    } else if (dc) {
      const note = await askText({
        title: 'Decline this request?',
        intro: 'The student sees this note on their My mentor page. A declined request still uses their one switch, so say what happens next.',
        label: 'Note to the student', min: 10, max: 600, confirmLabel: 'Decline request', variant: 'danger',
        picks: ['We spoke to your mentor and they will call you this week. If it still does not work, write to Team MSC from the contact page.'],
      });
      if (note === null) return;
      try {
        await rpc('mentorship_admin_resolve_switch', { p_request_id: x.id, p_approve: false, p_new_mentor_id: null, p_note: note });
        toast('Request declined. The student sees your note.', { type: 'success' });
        invalidateMatchData();
        app.refresh();
      } catch (err) { showError(err); }
    }
  });
}
