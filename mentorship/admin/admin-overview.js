/* Admin: Overview tab (pipeline, matches and red flags). Owner: admin builder. */
import {
  html, setContent, emptyState, RED_FLAGS, MENTOR_STATUS, programLabel, formatDate, timeAgo, formatINR, plural,
  rpc, toast, showError, firstName,
} from '/mentorship/assets/mentorship-core.js?v=1';
import {
  load, waButton, mentorNudge, menteeNudge, chipsHtml, errorBlock, pickMentor, invalidateMatchData,
} from './admin-shared.js?v=1';
import { reassign } from './admin-matches.js?v=1';

const SEVERITY = { high: { label: 'High', tone: 'red' }, medium: { label: 'Medium', tone: 'amber' } };

export async function renderOverview(panel, app, token) {
  const [ovR, flagsR, mentorsR, activeR] = await Promise.allSettled([
    load.overview(), load.flags(), load.mentors(), load.matches('active'),
  ]);
  const waitingPrograms = flagsR.status === 'fulfilled' ? [...new Set(flagsR.value.filter((x) => x.kind === 'unmatched').map((x) => x.program).filter(Boolean))] : [];
  const waitingR = await Promise.allSettled(waitingPrograms.map((p) => load.unmatched(p)));
  const waitingWa = new Map();
  waitingR.forEach((r) => { if (r.status === 'fulfilled') r.value.forEach((u) => waitingWa.set(u.user_id, u.whatsapp)); });
  if (!app.isLive(token)) return;
  if (ovR.status === 'rejected' && flagsR.status === 'rejected') {
    setContent(panel, errorBlock(ovR.reason, 'adm-ov-retry'));
    panel.querySelector('#adm-ov-retry')?.addEventListener('click', () => app.refresh({ hard: true }));
    return;
  }
  const ov = ovR.status === 'fulfilled' ? ovR.value : null;
  const flags = flagsR.status === 'fulfilled' ? flagsR.value : [];
  const mentors = mentorsR.status === 'fulfilled' ? mentorsR.value : [];
  const active = activeR.status === 'fulfilled' ? activeR.value : [];
  const mentorById = new Map(mentors.map((m) => [m.id, m]));
  const matchById = new Map(active.map((m) => [m.match_id, m]));

  const f = app.filters.overview || (app.filters.overview = { severity: 'all', kind: 'all' });
  const counts = ov?.counts || {};
  const ms = counts.mentors || {};

  const pipeline = ['draft', 'submitted', 'training_passed', 'approved', 'paused', 'rejected'].map((k) => html`
    <a class="ms-admin-pipe ms-tone-${MENTOR_STATUS[k].tone}" href="?tab=applications" data-go="applications" data-filter="${k}">
      <span class="ms-admin-pipe__n">${ms[k] ?? 0}</span><span class="ms-admin-pipe__l">${MENTOR_STATUS[k].label}</span>
    </a>`);

  const payouts = counts.payouts || {};
  const byProgram = Object.entries(counts.matches_by_program || {});

  const kinds = [...new Set(flags.map((x) => x.kind))];
  const shown = flags
    .filter((x) => (f.severity === 'all' || x.severity === f.severity) && (f.kind === 'all' || x.kind === f.kind))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'high' ? -1 : 1) || String(a.since || '').localeCompare(String(b.since || '')));

  const flagItem = (x) => {
    const meta = RED_FLAGS[x.kind] || { label: x.kind, icon: 'fa-flag' };
    const mentor = mentorById.get(x.mentor_id);
    const match = matchById.get(x.match_id);
    const menteeWa = match?.mentee?.whatsapp || null;
    const mentorWa = mentor?.whatsapp || match?.mentor?.whatsapp || null;
    const actions = [];
    if (x.mentor_id && x.kind !== 'safety_flag' && x.kind !== 'mentee_no_contact') actions.push(waButton(mentorWa, mentorNudge(x.kind, { mentor: x.mentor_name, mentee: x.mentee_name, since: match?.started_at }), 'WhatsApp mentor', { short: 'Mentor' }));
    if (x.mentee_user_id && x.kind !== 'unmatched') actions.push(waButton(menteeWa, menteeNudge(x.kind, { mentee: x.mentee_name, mentor: x.mentor_name }), 'WhatsApp mentee', { variant: 'outline', short: 'Mentee' }));
    if (x.kind === 'unmatched') {
      actions.push(waButton(waitingWa.get(x.mentee_user_id), menteeNudge('unmatched', { mentee: x.mentee_name, program: x.program }), 'WhatsApp student', { variant: 'outline', short: 'Student' }));
      if (app.canWrite) actions.push(html`<button type="button" class="ms-btn ms-btn--primary ms-btn--sm" data-assign="${x.mentee_user_id}" data-program="${x.program}" data-name="${x.mentee_name || ''}"><i class="fas fa-user-plus" aria-hidden="true"></i><span>Assign mentor</span></button>`);
    }
    if (x.match_id) actions.push(html`<button type="button" class="ms-btn ms-btn--outline ms-btn--sm" data-match="${x.match_id}"><i class="fas fa-link" aria-hidden="true"></i><span>Match</span></button>`);
    if (x.match_id && app.canWrite && x.kind !== 'switch_pending') actions.push(html`<button type="button" class="ms-btn ms-btn--outline ms-btn--sm" data-reassign="${x.match_id}"><i class="fas fa-right-left" aria-hidden="true"></i><span>Reassign</span></button>`);
    if (x.kind === 'switch_pending') actions.push(html`<a class="ms-btn ms-btn--primary ms-btn--sm" href="?tab=switches" data-go="switches"><span>Review request</span></a>`);
    if (x.kind === 'safety_flag') actions.push(html`<a class="ms-btn ms-btn--primary ms-btn--sm" href="?tab=reviews" data-go="reviews" data-filter="safety"><span>Open review</span></a>`);
    return html`<li class="ms-admin-flag ms-admin-flag--${x.severity === 'high' ? 'high' : 'medium'}">
      <span class="ms-admin-flag__icon" aria-hidden="true"><i class="fas ${meta.icon}"></i></span>
      <div class="ms-grow ms-stack" style="--ms-gap:4px">
        <div class="ms-row ms-between" style="--ms-gap:6px">
          <strong class="ms-admin-flag__title">${meta.label}</strong>
          <span class="ms-badge ms-tone-${SEVERITY[x.severity]?.tone || 'gray'}">${SEVERITY[x.severity]?.label || x.severity}</span>
        </div>
        <div class="ms-small">${x.mentee_name ? html`<strong>${x.mentee_name}</strong>` : ''}${x.mentor_name ? html` · mentor <button type="button" class="ms-admin-linkbtn ms-admin-linkbtn--inline" data-mentor="${x.mentor_id}">${x.mentor_name}</button>` : ''}${x.program ? html` · ${programLabel(x.program)}` : ''}</div>
        ${x.detail ? html`<div class="ms-small ms-text-2">${x.detail}</div>` : ''}
        <div class="ms-xs ms-muted">${x.since ? html`Since ${formatDate(x.since)} (${timeAgo(x.since)})` : ''}</div>
        <div class="ms-btn-row ms-mt-8 ms-admin-flag__actions">${actions}</div>
      </div>
    </li>`;
  };

  const group = (sev) => {
    const rows = shown.filter((x) => x.severity === sev);
    if (!rows.length) return '';
    return html`<div class="ms-stack" style="--ms-gap:10px">
      <h3 class="ms-admin-subhead"><span class="ms-dot ms-admin-dot--${sev}" aria-hidden="true"></span>${SEVERITY[sev].label} priority <span class="ms-muted ms-small">${rows.length}</span></h3>
      <ul class="ms-admin-flags">${rows.map(flagItem)}</ul>
    </div>`;
  };

  setContent(panel, html`
    <div class="ms-admin-overview">
      <div class="ms-stack ms-admin-overview__main" style="--ms-gap:16px">
        <div class="ms-row ms-between">
          <h2 class="ms-h3">Red flags <span class="ms-muted ms-small">${flags.length ? `${flags.length} open` : ''}</span></h2>
        </div>
        ${flagsR.status === 'rejected' ? errorBlock(flagsR.reason) : ''}
        ${flags.length ? html`<div class="ms-admin-toolbar">
          ${chipsHtml('sev', [
            { value: 'all', label: 'All', count: flags.length },
            { value: 'high', label: 'High', count: flags.filter((x) => x.severity === 'high').length },
            { value: 'medium', label: 'Medium', count: flags.filter((x) => x.severity === 'medium').length },
          ], f.severity, { label: 'Severity' })}
          <select class="ms-select ms-admin-select" data-kind aria-label="Flag type">
            <option value="all">All types</option>
            ${kinds.map((k) => html`<option value="${k}"${k === f.kind ? ' selected' : ''}>${RED_FLAGS[k]?.label || k}</option>`)}
          </select>
        </div>` : ''}
        ${flags.length
          ? (shown.length ? html`${group('high')}${group('medium')}` : emptyState({ icon: 'fa-filter', title: 'No flags for this filter' }))
          : (flagsR.status === 'fulfilled' ? html`<div class="ms-card">${emptyState({ icon: 'fa-circle-check', title: 'No red flags right now', text: 'Every active match looks on track. Nice. Check back tomorrow.' })}</div>` : '')}
      </div>

      <aside class="ms-stack ms-admin-overview__side" style="--ms-gap:16px">
        <div class="ms-card">
          <div class="ms-card__head"><div><div class="ms-card__title">Mentor pipeline</div><div class="ms-card__sub">Tap a stage to open the list</div></div></div>
          <div class="ms-admin-pipeline">${pipeline}</div>
        </div>
        <div class="ms-card">
          <div class="ms-card__head"><div><div class="ms-card__title">Matches</div><div class="ms-card__sub">${plural(counts.active_matches ?? active.length, 'active match', 'active matches')}</div></div>
            <a class="ms-link ms-small" href="?tab=matches" data-go="matches">Open</a></div>
          ${byProgram.length ? html`<dl class="ms-kv">${byProgram.map(([p, n]) => html`<dt>${programLabel(p)}</dt><dd>${n}</dd>`)}</dl>` : html`<p class="ms-small ms-muted">No matches yet.</p>`}
          <dl class="ms-kv ms-mt-16">
            <dt>Waiting for a mentor</dt><dd><a class="ms-link" href="?tab=unmatched" data-go="unmatched">${counts.unmatched ?? 0}</a></dd>
            <dt>Switch requests</dt><dd><a class="ms-link" href="?tab=switches" data-go="switches">${counts.switch_pending ?? 0} pending</a></dd>
          </dl>
        </div>
        <div class="ms-card">
          <div class="ms-card__head"><div><div class="ms-card__title">Payouts</div><div class="ms-card__sub">${plural(payouts.due_count || 0, 'match', 'matches')} due</div></div>
            <a class="ms-link ms-small" href="?tab=payouts" data-go="payouts">Open</a></div>
          <dl class="ms-kv">
            <dt>Due</dt><dd class="ms-strong">${formatINR(payouts.due_inr || 0)}</dd>
            <dt>Not due yet</dt><dd>${formatINR(payouts.unpaid_inr || 0)}</dd>
            <dt>Paid</dt><dd>${formatINR(payouts.paid_inr || 0)}</dd>
          </dl>
        </div>
      </aside>
    </div>`);

  panel.querySelector('[data-chips="sev"]')?.addEventListener('change', (e) => { f.severity = e.target.value; renderOverview(panel, app, token); });
  panel.querySelector('[data-kind]')?.addEventListener('change', (e) => { f.kind = e.target.value; renderOverview(panel, app, token); });

  panel.querySelectorAll('[data-mentor]').forEach((b) => b.addEventListener('click', () => app.openMentor(b.dataset.mentor)));
  panel.querySelectorAll('[data-match]').forEach((b) => b.addEventListener('click', () => app.openMatch(b.dataset.match)));
  panel.querySelectorAll('[data-reassign]').forEach((b) => b.addEventListener('click', async () => {
    const m = matchById.get(b.dataset.reassign);
    if (m) reassign(m, app); else app.openMatch(b.dataset.reassign);
  }));
  panel.querySelectorAll('[data-assign]').forEach((b) => b.addEventListener('click', () => assignFromFlag(b, app)));
}

async function assignFromFlag(b, app) {
  const { assign: userId, program, name } = b.dataset;
  const pick = await pickMentor({ title: `Assign a mentor to ${name || 'this student'}`, intro: `${programLabel(program)}. Both get an email once the match is created.`, program, confirmLabel: 'Create match' });
  if (!pick) return;
  try {
    await rpc('mentorship_admin_create_match', { p_mentee_user_id: userId, p_mentor_id: pick.mentor.id, p_program: program, p_force: pick.force });
    toast(`${firstName(name) || 'The student'} is now matched with ${pick.mentor.full_name}.`, { type: 'success' });
    invalidateMatchData();
    app.refresh();
  } catch (e) { showError(e); }
}
