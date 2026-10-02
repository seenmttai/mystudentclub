/* Admin: Applications and Mentors tabs. Owner: admin builder. */
import {
  html, setContent, emptyState, avatarHtml, tierChip, stageLabel, statusBadge, ratingHtml, labelsOf,
  DOMAINS, LANGUAGES, MENTOR_STATUS, REQUIRED_CONSENTS, programLabel, formatDate, timeAgo, debounce, downloadCsv,
  rpc, toast, showError, firstName, confirmDialog, istDateKey, daysSince, plural,
} from '/mentorship/assets/mentorship-core.js?v=1';
import {
  load, chipsHtml, errorBlock, mentorHaystack, cityLabel, waIconLink, askText, invalidate, daysAgoText, csvPhone,
} from './admin-shared.js?v=1';

/* ========================================================================== */
/* Applications                                                               */
/* ========================================================================== */

const APP_FILTERS = [
  { value: 'queue', label: 'To review' },
  { value: 'training_passed', label: 'In review' },
  { value: 'submitted', label: 'Training pending' },
  { value: 'draft', label: 'Drafts' },
  { value: 'approved', label: 'Approved' },
  { value: 'paused', label: 'Paused' },
  { value: 'rejected', label: 'Not approved' },
  { value: 'all', label: 'All' },
];
const STATUS_ORDER = { training_passed: 0, submitted: 1, draft: 2, paused: 3, approved: 4, rejected: 5 };

export function consentCount(m) {
  const c = m?.consents || {};
  return REQUIRED_CONSENTS.filter((k) => !!c[k]).length;
}

function quizChip(m) {
  if (m.quiz_passed_at) return html`<span class="ms-chip ms-tone-green"><i class="fas fa-circle-check" aria-hidden="true"></i>Quiz ${m.quiz_best_pct ?? ''}%</span>`;
  if (Number(m.quiz_attempts) > 0) return html`<span class="ms-chip ms-tone-amber"><i class="fas fa-rotate" aria-hidden="true"></i>Quiz ${m.quiz_best_pct ?? 0}% · ${plural(m.quiz_attempts, 'try', 'tries')}</span>`;
  if (m.status === 'draft') return '';
  return html`<span class="ms-chip ms-tone-gray"><i class="fas fa-hourglass-half" aria-hidden="true"></i>Quiz not taken</span>`;
}

function appCard(m) {
  const consents = consentCount(m);
  const when = m.status === 'draft' ? (m.updated_at ? `Edited ${timeAgo(m.updated_at)}` : '')
    : m.submitted_at ? `Submitted ${timeAgo(m.submitted_at)}` : '';
  const company = m.it_company || m.employer || m.articleship_firm || '';
  return html`<article class="ms-card ms-card--hover ms-admin-app" role="button" tabindex="0" data-open="${m.id}" aria-label="Open application from ${m.full_name || 'mentor'}">
    <div class="ms-row ms-row--nowrap" style="--ms-gap:12px">
      ${avatarHtml({ name: m.full_name, photo_path: m.photo_path, verified: !!m.linkedin_checked, verifiedTitle: 'LinkedIn checked by Team MSC' })}
      <div class="ms-grow">
        <div class="ms-row" style="--ms-gap:6px"><strong class="ms-admin-app__name">${m.full_name || 'Unnamed applicant'}</strong>${m.tier ? tierChip(m.tier) : ''}${statusBadge('mentor', m.status)}</div>
        <div class="ms-small ms-text-2 ms-clamp-2 ms-mt-8">${[stageLabel(m.stage, { short: true }), company, cityLabel(m.city)].filter(Boolean).join(' · ') || 'Journey not filled yet'}</div>
      </div>
    </div>
    <div class="ms-chips">
      ${quizChip(m)}
      <span class="ms-chip ${consents === REQUIRED_CONSENTS.length ? 'ms-tone-green' : 'ms-tone-red'}"><i class="fas fa-list-check" aria-hidden="true"></i>Consents ${consents}/${REQUIRED_CONSENTS.length}</span>
      <span class="ms-chip ${m.cv_path ? 'ms-tone-blue' : 'ms-tone-gray'}"><i class="fas fa-file-pdf" aria-hidden="true"></i>${m.cv_path ? 'CV' : 'No CV'}</span>
      ${m.linkedin_url ? html`<span class="ms-chip ${m.linkedin_checked ? 'ms-tone-green' : 'ms-tone-outline'}"><i class="fab fa-linkedin" aria-hidden="true"></i>${m.linkedin_checked ? 'Checked' : 'LinkedIn'}</span>` : ''}
      ${m.topmate_url ? html`<span class="ms-chip ${m.topmate_checked ? 'ms-tone-green' : 'ms-tone-outline'}"><i class="fas fa-star" aria-hidden="true"></i>${m.topmate_checked ? 'Topmate checked' : 'Topmate'}</span>` : ''}
    </div>
    <div class="ms-row ms-between ms-xs ms-muted">
      <span>${when}</span>
      <span>${(m.programs || []).map((p) => programLabel(p)).join(', ')}</span>
    </div>
  </article>`;
}

export async function renderApplications(panel, app, token) {
  const f = app.filters.applications || (app.filters.applications = { status: 'queue', q: '' });
  if (f.preset) { f.status = APP_FILTERS.some((x) => x.value === f.preset) ? f.preset : 'queue'; delete f.preset; }
  let mentors;
  try { mentors = await load.mentors(); } catch (e) {
    if (!app.isLive(token)) return;
    setContent(panel, errorBlock(e, 'adm-app-retry'));
    panel.querySelector('#adm-app-retry')?.addEventListener('click', () => app.refresh({ hard: true }));
    return;
  }
  if (!app.isLive(token)) return;

  const countFor = (v) => mentors.filter((m) => (v === 'all' ? true : v === 'queue' ? ['training_passed', 'submitted'].includes(m.status) : m.status === v)).length;
  const options = APP_FILTERS.map((o) => ({ ...o, count: countFor(o.value) }));

  setContent(panel, html`
    <div class="ms-admin-toolbar">
      <label class="ms-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input class="ms-input" type="search" placeholder="Search name, email, company, city" value="${f.q}" data-q aria-label="Search applications"></label>
    </div>
    <div class="ms-admin-toolbar">${chipsHtml('appst', options, f.status, { label: 'Application status' })}</div>
    <p class="ms-small ms-muted ms-mb-16" data-note></p>
    <div class="ms-grid ms-grid--auto" data-list></div>`);

  const list = panel.querySelector('[data-list]');
  const note = panel.querySelector('[data-note]');
  const draw = () => {
    const term = f.q.trim().toLowerCase();
    const rows = mentors
      .filter((m) => (f.status === 'all' ? true : f.status === 'queue' ? ['training_passed', 'submitted'].includes(m.status) : m.status === f.status))
      .filter((m) => !term || mentorHaystack(m).includes(term))
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
        || String(a.submitted_at || a.updated_at || '').localeCompare(String(b.submitted_at || b.updated_at || '')));
    note.textContent = f.status === 'queue'
      ? 'In review first (quiz passed, ready to approve), then mentors still doing training. Oldest first.'
      : `${plural(rows.length, 'mentor')}`;
    if (!rows.length) {
      setContent(list, html`<div class="ms-card ms-admin-span-all">${emptyState({ icon: 'fa-inbox', title: f.status === 'queue' ? 'Nothing to review' : 'No applications here', text: f.status === 'queue' ? 'New applications show up here once a mentor submits. Hojayega.' : term ? 'Try a different search.' : '' })}</div>`);
      return;
    }
    setContent(list, html`${rows.map(appCard)}`);
  };
  draw();

  panel.querySelector('[data-q]').addEventListener('input', debounce((e) => { f.q = e.target.value; draw(); }, 150));
  panel.querySelector('[data-chips="appst"]').addEventListener('change', (e) => { f.status = e.target.value; draw(); });
  list.addEventListener('click', (e) => { const c = e.target.closest('[data-open]'); if (c) app.openMentor(c.dataset.open); });
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const c = e.target.closest('[data-open]');
    if (c) { e.preventDefault(); app.openMentor(c.dataset.open); }
  });
}

/* ========================================================================== */
/* Mentors (approved + paused)                                                */
/* ========================================================================== */

const SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'load', label: 'Most mentees' },
  { value: 'slots', label: 'Most free slots' },
  { value: 'rating', label: 'Lowest rating' },
  { value: 'call', label: 'Oldest call' },
  { value: 'flags', label: 'Most flags' },
];

function callSummary(matches) {
  if (!matches.length) return { last: null, overdue: 0 };
  let last = null;
  let overdue = 0;
  matches.forEach((x) => {
    if (x.last_call_on && (!last || x.last_call_on > last)) last = x.last_call_on;
    const d = x.days_since_call ?? (x.last_call_on ? daysSince(x.last_call_on) : daysSince(x.started_at));
    if (d !== null && d >= 8) overdue += 1;
  });
  return { last, overdue };
}

export async function renderMentors(panel, app, token) {
  const f = app.filters.mentors || (app.filters.mentors = { status: 'live', q: '', sort: 'name', program: 'all' });
  if (f.preset) { f.status = ['approved', 'paused'].includes(f.preset) ? f.preset : 'live'; delete f.preset; }
  const [mR, aR, flR] = await Promise.allSettled([load.mentors(), load.matches('active'), load.flags()]);
  if (!app.isLive(token)) return;
  if (mR.status === 'rejected') {
    setContent(panel, errorBlock(mR.reason, 'adm-m-retry'));
    panel.querySelector('#adm-m-retry')?.addEventListener('click', () => app.refresh({ hard: true }));
    return;
  }
  const active = aR.status === 'fulfilled' ? aR.value : [];
  const flags = flR.status === 'fulfilled' ? flR.value : [];
  const byMentor = new Map();
  active.forEach((x) => { const k = x.mentor?.id; if (!k) return; if (!byMentor.has(k)) byMentor.set(k, []); byMentor.get(k).push(x); });
  const flagCount = new Map();
  flags.forEach((x) => { if (x.mentor_id) flagCount.set(x.mentor_id, (flagCount.get(x.mentor_id) || 0) + 1); });

  const all = mR.value.filter((m) => ['approved', 'paused'].includes(m.status)).map((m) => {
    const mm = byMentor.get(m.id) || [];
    const calls = callSummary(mm);
    return { ...m, _active: Number(m.active_count ?? mm.length), _slots: Math.max(0, Number(m.max_mentees || 0) - Number(m.active_count ?? mm.length)), _calls: calls, _flags: flagCount.get(m.id) || 0 };
  });
  const programs = [...new Set(all.flatMap((m) => m.programs || []))];

  const sorters = {
    name: (a, b) => String(a.full_name).localeCompare(String(b.full_name)),
    load: (a, b) => b._active - a._active,
    slots: (a, b) => b._slots - a._slots,
    rating: (a, b) => (Number(a.rating_avg ?? 9) - Number(b.rating_avg ?? 9)),
    call: (a, b) => String(a._calls.last || '').localeCompare(String(b._calls.last || '')),
    flags: (a, b) => b._flags - a._flags,
  };
  const filterRows = () => {
    const term = f.q.trim().toLowerCase();
    return all
      .filter((m) => f.status === 'live' || m.status === f.status)
      .filter((m) => f.program === 'all' || (m.programs || []).includes(f.program))
      .filter((m) => !term || mentorHaystack(m).includes(term))
      .sort((a, b) => sorters[f.sort](a, b) || sorters.name(a, b));
  };

  setContent(panel, html`
    <div class="ms-admin-toolbar">
      <label class="ms-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input class="ms-input" type="search" placeholder="Search name, company, domain, city" value="${f.q}" data-q aria-label="Search mentors"></label>
      ${programs.length > 1 ? html`<select class="ms-select ms-admin-select" data-program aria-label="Program"><option value="all">All programs</option>${programs.map((p) => html`<option value="${p}"${p === f.program ? ' selected' : ''}>${programLabel(p)}</option>`)}</select>` : ''}
      <select class="ms-select ms-admin-select" data-sort aria-label="Sort">${SORTS.map((s) => html`<option value="${s.value}"${s.value === f.sort ? ' selected' : ''}>Sort: ${s.label}</option>`)}</select>
      <button type="button" class="ms-btn ms-btn--outline" data-csv><i class="fas fa-file-csv" aria-hidden="true"></i><span>Export CSV</span></button>
    </div>
    <div class="ms-admin-toolbar">${chipsHtml('mst', [
      { value: 'live', label: 'Approved and paused', count: all.length },
      { value: 'approved', label: 'Approved', count: all.filter((m) => m.status === 'approved').length },
      { value: 'paused', label: 'Paused', count: all.filter((m) => m.status === 'paused').length },
    ], f.status, { label: 'Mentor status' })}</div>
    <div data-list></div>`);

  const list = panel.querySelector('[data-list]');
  const draw = () => {
    const rows = filterRows();
    if (!rows.length) {
      setContent(list, html`<div class="ms-card">${emptyState({ icon: 'fa-user-graduate', title: all.length ? 'No mentor matches' : 'No approved mentors yet', text: all.length ? 'Try a different search or filter.' : 'Approve applications from the Applications tab and they show up here.' })}</div>`);
      return;
    }
    setContent(list, html`<div class="ms-table-wrap"><table class="ms-table ms-table--stack ms-admin-table">
      <thead><tr><th>Mentor</th><th>Mentees</th><th>Rating</th><th>Last call logged</th><th>Flags</th><th>New mentees</th><th><span class="ms-sr-only">Actions</span></th></tr></thead>
      <tbody>${rows.map((m) => {
        const pct = m.max_mentees ? Math.min(100, Math.round((m._active / m.max_mentees) * 100)) : 0;
        return html`<tr>
          <td class="ms-admin-td-main" data-label="Mentor">
            <div class="ms-person">${avatarHtml({ name: m.full_name, photo_path: m.photo_path, size: 'sm', verified: !!m.linkedin_checked, verifiedTitle: 'LinkedIn checked by Team MSC' })}
              <div class="ms-grow"><button type="button" class="ms-admin-linkbtn" data-open="${m.id}">${m.full_name}</button>
                <div class="ms-person__sub">${[stageLabel(m.stage, { short: true }), cityLabel(m.city)].filter(Boolean).join(' · ')}</div>
                <div class="ms-xs ms-muted">${m.status === 'paused' ? html`<span class="ms-badge ms-tone-amber">Paused</span> ` : ''}${m.senior_mentor_name ? `Senior: ${m.senior_mentor_name}` : 'No senior mentor'}</div>
              </div></div>
          </td>
          <td data-label="Mentees"><div class="ms-admin-load"><span class="ms-strong">${m._active}/${m.max_mentees || 0}</span><span class="ms-progress ms-admin-minibar${pct >= 100 ? ' ms-progress--amber' : ''}"><span class="ms-progress__bar" style="width:${pct}%"></span></span></div></td>
          <td data-label="Rating">${ratingHtml(m.rating_avg, m.review_count, 1)}</td>
          <td data-label="Last call logged"><span><span>${m._calls.last ? daysAgoText(daysSince(m._calls.last)) : m._active ? 'None yet' : '–'}</span>${m._calls.overdue ? html`<span class="ms-badge ms-tone-amber ms-admin-ml">${m._calls.overdue} overdue</span>` : ''}</span></td>
          <td data-label="Flags">${m._flags ? html`<span class="ms-badge ms-tone-red">${m._flags}</span>` : html`<span class="ms-muted">0</span>`}</td>
          <td data-label="New mentees">${m.status === 'paused' ? html`<span class="ms-muted">Paused</span>` : m.accepting ? html`<span class="ms-badge ms-tone-green">Taking</span>` : html`<span class="ms-badge ms-tone-gray">Not taking</span>`}</td>
          <td class="ms-admin-td-actions" data-label="Actions"><div class="ms-btn-row ms-admin-actions">
            ${waIconLink(m.whatsapp, `Hi ${firstName(m.full_name)}, Team My Student Club here.`, `WhatsApp ${m.full_name}`)}
            <button type="button" class="ms-btn ms-btn--outline ms-btn--sm" data-open="${m.id}"><span>Open</span></button>
            ${app.canWrite ? (m.status === 'approved'
              ? html`<button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-pause="${m.id}"><span>Pause</span></button>`
              : html`<button type="button" class="ms-btn ms-btn--soft ms-btn--sm" data-resume="${m.id}"><span>Resume</span></button>`) : ''}
          </div></td>
        </tr>`;
      })}</tbody></table></div>
      <p class="ms-xs ms-muted ms-mt-8">${plural(rows.length, 'mentor')}. "Overdue" counts active mentees with no call logged in 8+ days.</p>`);
  };
  draw();

  panel.querySelector('[data-q]').addEventListener('input', debounce((e) => { f.q = e.target.value; draw(); }, 150));
  panel.querySelector('[data-sort]').addEventListener('change', (e) => { f.sort = e.target.value; draw(); });
  panel.querySelector('[data-program]')?.addEventListener('change', (e) => { f.program = e.target.value; draw(); });
  panel.querySelector('[data-chips="mst"]').addEventListener('change', (e) => { f.status = e.target.value; draw(); });
  list.addEventListener('click', async (e) => {
    const open = e.target.closest('[data-open]');
    if (open) { app.openMentor(open.dataset.open); return; }
    const pause = e.target.closest('[data-pause]');
    if (pause) { await setMentorStatus(app, all.find((m) => m.id === pause.dataset.pause), 'paused'); return; }
    const resume = e.target.closest('[data-resume]');
    if (resume) await setMentorStatus(app, all.find((m) => m.id === resume.dataset.resume), 'approved');
  });
  panel.querySelector('[data-csv]').addEventListener('click', () => {
    const rows = filterRows();
    downloadCsv(`msc-mentors-${istDateKey()}`, rows, [
      { key: 'full_name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { label: 'WhatsApp', value: (m) => csvPhone(m.whatsapp) },
      { label: 'Status', value: (m) => MENTOR_STATUS[m.status]?.label || m.status },
      { label: 'Tier', value: (m) => (m.tier === 'ca_mentor' ? 'CA Mentor' : 'Peer Mentor') },
      { label: 'Stage', value: (m) => stageLabel(m.stage) },
      { label: 'City', value: (m) => cityLabel(m.city) },
      { label: 'Programs', value: (m) => (m.programs || []).map((p) => programLabel(p)) },
      { label: 'Domains', value: (m) => labelsOf(DOMAINS, m.domains) },
      { label: 'Languages', value: (m) => labelsOf(LANGUAGES, m.languages) },
      { label: 'IT company', value: (m) => m.it_company || '' },
      { label: 'Articleship firm', value: (m) => m.articleship_firm || '' },
      { label: 'Active mentees', value: (m) => m._active },
      { label: 'Max mentees', value: (m) => m.max_mentees },
      { label: 'Rating', value: (m) => (m.rating_avg === null || m.rating_avg === undefined ? '' : Number(m.rating_avg).toFixed(2)) },
      { label: 'Reviews', value: (m) => m.review_count || 0 },
      { label: 'Taking new mentees', value: (m) => (m.accepting ? 'Yes' : 'No') },
      { label: 'Last call logged', value: (m) => m._calls.last || '' },
      { label: 'Mentees overdue for a call', value: (m) => m._calls.overdue },
      { label: 'Open red flags', value: (m) => m._flags },
      { label: 'Senior mentor', value: (m) => m.senior_mentor_name || '' },
      { label: 'Approved on', value: (m) => (m.approved_at ? formatDate(m.approved_at) : '') },
    ]);
  });
}

/* ========================================================================== */
/* Status changes (shared with the review panel)                              */
/* ========================================================================== */

export const REJECT_PICKS = [
  'We already have enough mentors for your profile this batch.',
  'Please add a clearer photo and your LinkedIn profile, then apply again.',
  'Your scenario answer needs more care. Please read the playbook and apply again.',
  'We could not confirm your CA journey from your LinkedIn and CV.',
];
export const PAUSE_PICKS = [
  'Weekly calls are being missed.',
  'Mentees are waiting too long for a response.',
  'Mentor asked for a break.',
  'On hold while we look into a mentee report.',
];

/**
 * Approve / reject / pause / resume with the right confirmation. Returns the updated row or null.
 * Server rules (SPEC §3.3): approve needs the quiz; reject is refused while mentees are active.
 */
export async function setMentorStatus(app, m, status) {
  if (!m || !app.canWrite) return null;
  const name = m.full_name || 'this mentor';
  let reason = null;
  if (status === 'approved') {
    const ok = await confirmDialog({
      title: m.status === 'paused' ? `Resume ${firstName(name)}?` : `Approve ${firstName(name)}?`,
      message: m.status === 'paused'
        ? `${name} shows up in the directory again and can get new mentees.`
        : `${name} goes live in the directory and can be picked by students.`,
      confirmText: m.status === 'paused' ? 'Resume' : 'Approve',
    });
    if (!ok) return null;
  } else if (status === 'rejected') {
    reason = await askText({
      title: `Not approve ${firstName(name)}?`,
      intro: 'They see this note on their application and can apply again after 30 days. Keep it kind and specific.',
      label: 'Reason', picks: REJECT_PICKS, min: 10, max: 400, confirmLabel: 'Not approve', variant: 'danger',
    });
    if (reason === null) return null;
  } else if (status === 'paused') {
    reason = await askText({
      title: `Pause ${firstName(name)}?`,
      intro: 'They are hidden from the directory and get no new mentees. Their current mentees continue. They see this reason on their dashboard.',
      label: 'Reason', picks: PAUSE_PICKS, min: 5, max: 400, confirmLabel: 'Pause mentor', variant: 'danger',
    });
    if (reason === null) return null;
  }
  try {
    const row = await rpc('mentorship_admin_set_status', { p_mentor_id: m.id, p_status: status, p_reason: reason });
    const msg = { approved: m.status === 'paused' ? `${name} is live again.` : `${name} is approved and live in the directory.`, rejected: `${name} was not approved. The note is on their application.`, paused: `${name} is paused.` }[status];
    toast(msg, { type: 'success' });
    invalidate('mentors', 'overview', 'flags', `detail:${m.id}`);
    app.refresh();
    return row;
  } catch (e) {
    if (e.code === 'invalid_transition' && /is_staff/.test(String(e.hint || ''))) {
      toast(`${name} is Team MSC staff. Staff read what mentees share privately, so remove the staff role first, then approve.`, { type: 'error', timeout: 8000 });
    } else if (e.code === 'invalid_transition' && /active/i.test(String(e.hint || ''))) {
      toast(`${name} still has active mentees. Reassign them from the Matches tab first.`, { type: 'error', timeout: 6000 });
    } else if (e.code === 'quiz_not_passed') {
      toast(`${name} has not passed the training quiz yet.`, { type: 'error' });
    } else showError(e);
    return null;
  }
}
