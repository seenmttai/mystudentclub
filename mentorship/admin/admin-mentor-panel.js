/* Admin: mentor review panel (wide modal, deep-linked with ?mentor=<uuid>). Owner: admin builder. */
import {
  html, raw, setContent, openModal, loadingBlock, avatarHtml, tierChip, stageLabel, statusBadge, labelOf, labelsOf,
  DOMAINS, LANGUAGES, CALL_SLOTS, WEEKLY_HOURS, MENTORING_EXPERIENCE, CONFLICTS, HEARD_FROM, FIRM_TYPES,
  EXPERIENCE_YEARS, DUTIES, POLICY_CONSENTS, REQUIRED_CONSENTS, SCENARIO_QUESTION, MENTOR_STATUS, PATHS,
  formatDate, formatDateTime, timeAgo, programLabel, formatPhone, safeUrl, rpc, toast, showError, firstName,
  signedUrl, STORAGE, isMockMode, starsHtml, REVIEW_TAGS, statusBadge as badge, MENTEE_CAPACITY, DEFAULT_CONFIG,
  monthYearLabel, plural, PAYOUT_STATUS, MATCH_STATUS, photoUrl,
} from '/mentorship/assets/mentorship-core.js?v=1';
import {
  load, invalidate, mentorCardHtml, waButton, mailButton, callButton, cityLabel, errorBlock, daysAgoText,
} from './admin-shared.js?v=1';
import { setMentorStatus, consentCount } from './admin-mentors.js?v=1';

const EVENT_LABELS = {
  application_submitted: 'Application submitted',
  quiz_attempt: 'Quiz attempt',
  status_changed: 'Status changed',
  match_created: 'Mentee matched',
  match_reassigned: 'Mentee reassigned',
  match_ended: 'Match ended',
  switch_requested: 'Switch requested',
  switch_resolved: 'Switch resolved',
  payout_updated: 'Payout updated',
  review_hidden: 'Review hidden',
  config_changed: 'Setting changed',
  staff_changed: 'Staff changed',
  mentor_updated_by_staff: 'Updated by Team MSC',
  profile_link_changed: 'Profile link or photo changed: check again',
};

let openPanel = null;

export async function openMentorPanel(id, app) {
  if (openPanel) openPanel.close();
  app.setParam('mentor', id);
  const modal = openModal({
    title: 'Mentor review',
    body: loadingBlock('Loading the application...'),
    wide: true,
    onClose: () => { if (openPanel === modal) openPanel = null; app.setParam('mentor', null); },
  });
  modal.el.classList.add('ms-admin-modal-xl');
  openPanel = modal;
  await fill(modal, id, app);
  return modal;
}

async function fill(modal, id, app, { force = false } = {}) {
  let detail;
  let staff = [];
  try {
    const [d, s] = await Promise.all([load.detail(id, { force }), load.staff().catch(() => [])]);
    detail = d;
    staff = s;
  } catch (e) {
    setContent(modal.body, errorBlock(e, 'adm-panel-retry'));
    modal.body.querySelector('#adm-panel-retry')?.addEventListener('click', () => fill(modal, id, app, { force: true }));
    return;
  }
  if (!detail?.mentor) {
    setContent(modal.body, errorBlock({ message: 'We could not find this mentor.' }));
    return;
  }
  const m = detail.mentor;
  modal.el.querySelector('.ms-modal__title').textContent = m.full_name ? `${m.full_name}` : 'Mentor review';
  setContent(modal.body, panelHtml(detail, staff, app));
  bind(modal, detail, app);
}

/* ---------- markup -------------------------------------------------------- */

function section(title, body, { right = '', cls = '' } = {}) {
  return html`<section class="ms-admin-sec ${cls}"><div class="ms-admin-sec__title"><span>${title}</span>${right}</div>${body}</section>`;
}

function kv(rows) {
  const items = rows.filter((r) => r && r[1] !== null && r[1] !== undefined && r[1] !== '');
  if (!items.length) return html`<p class="ms-small ms-muted">Nothing filled yet.</p>`;
  return html`<dl class="ms-kv">${items.map(([k, v]) => html`<dt>${k}</dt><dd>${v}</dd>`)}</dl>`;
}

function link(url, label) {
  const u = safeUrl(url, { allowRelative: false });
  return u ? html`<a class="ms-link" href="${u}" target="_blank" rel="noopener noreferrer">${label || u} <i class="fas fa-arrow-up-right-from-square ms-xs" aria-hidden="true"></i></a>` : '';
}

function photoLink(m) {
  const url = safeUrl(photoUrl(m.photo_path), { allowRelative: false });
  if (!m.photo_path) return html`<span class="ms-small ms-admin-missing">No profile photo yet.</span>`;
  if (!url) return html`<span class="ms-small ms-muted">Photo uploaded (preview not available in mock mode).</span>`;
  return html`<a class="ms-link ms-small" href="${url}" target="_blank" rel="noopener noreferrer"><i class="fas fa-image" aria-hidden="true"></i> Open the full-size photo</a><span class="ms-xs ms-muted">Check it is a clear, smiling, passport-style photo.</span>`;
}

function statusNote(m, active) {
  const st = m.status;
  if (st === 'rejected') {
    return html`<div class="ms-callout ms-callout--danger"><i class="fas fa-circle-xmark" aria-hidden="true"></i><div>
      <span class="ms-callout__title">Not approved${m.rejected_at ? ` on ${formatDate(m.rejected_at)}` : ''}</span>
      ${m.reject_reason || 'No reason saved.'}${m.reapply_after ? html` <span class="ms-muted">Can apply again from ${formatDate(m.reapply_after)}.</span>` : ''}</div></div>`;
  }
  if (st === 'paused') {
    return html`<div class="ms-callout ms-callout--warn"><i class="fas fa-circle-pause" aria-hidden="true"></i><div>
      <span class="ms-callout__title">Paused${m.paused_at ? ` since ${formatDate(m.paused_at)}` : ''}</span>${m.pause_reason || 'No reason saved.'}
      ${active ? html` <span class="ms-muted">${plural(active, 'current mentee')} continue.</span>` : ''}</div></div>`;
  }
  if (st === 'submitted') {
    return html`<div class="ms-callout"><i class="fas fa-graduation-cap" aria-hidden="true"></i><div><span class="ms-callout__title">Training pending</span>Approve unlocks once the training quiz is passed. You can still review everything and add notes now.</div></div>`;
  }
  if (st === 'training_passed') {
    return html`<div class="ms-callout ms-callout--success"><i class="fas fa-circle-check" aria-hidden="true"></i><div><span class="ms-callout__title">Ready for review</span>Quiz passed${m.quiz_passed_at ? ` ${timeAgo(m.quiz_passed_at)}` : ''}. Check the CV, LinkedIn and scenario answer, then approve or not.</div></div>`;
  }
  if (st === 'draft') {
    return html`<div class="ms-callout ms-callout--gray"><i class="fas fa-pen" aria-hidden="true"></i><div><span class="ms-callout__title">Draft</span>Not submitted yet. Nothing to decide until they submit.</div></div>`;
  }
  return '';
}

function actionsHtml(m, active, app) {
  if (!app.canWrite) return '';
  const st = m.status;
  const quiz = !!m.quiz_passed_at;
  const btns = [];
  if (['training_passed', 'rejected'].includes(st)) {
    btns.push(html`<button type="button" class="ms-btn ms-btn--success" data-act="approved"${quiz ? '' : raw(' disabled title="Approve unlocks once the quiz is passed"')}><i class="fas fa-check" aria-hidden="true"></i><span>Approve</span></button>`);
  }
  if (st === 'submitted') {
    btns.push(html`<button type="button" class="ms-btn ms-btn--success" disabled title="Approve unlocks once the quiz is passed"><i class="fas fa-check" aria-hidden="true"></i><span>Approve</span></button>`);
  }
  if (st === 'paused') btns.push(html`<button type="button" class="ms-btn ms-btn--primary" data-act="approved"><i class="fas fa-play" aria-hidden="true"></i><span>Resume</span></button>`);
  if (st === 'approved') btns.push(html`<button type="button" class="ms-btn ms-btn--outline" data-act="paused"><i class="fas fa-pause" aria-hidden="true"></i><span>Pause</span></button>`);
  if (['submitted', 'training_passed', 'approved', 'paused'].includes(st)) {
    btns.push(html`<button type="button" class="ms-btn ms-btn--danger-soft" data-act="rejected"${active > 0 ? raw(` disabled title="Reassign their ${Number(active)} active mentees first"`) : ''}><i class="fas fa-xmark" aria-hidden="true"></i><span>Not approve</span></button>`);
  }
  if (!btns.length) return '';
  return html`<div class="ms-admin-review__actions">
    <div class="ms-btn-row">${btns}</div>
    ${active > 0 && st !== 'rejected' ? html`<span class="ms-xs ms-muted">To remove this mentor, reassign their ${plural(active, 'active mentee')} first.</span>` : ''}
  </div>`;
}

function scoresTable(scores = {}) {
  const box = (label, sc, { exemptOk = false } = {}) => {
    let main = 'Not given';
    let sub = '';
    if (exemptOk && sc?.exempt) { main = 'Direct entry'; sub = 'No Foundation'; } else if (sc && sc.marks !== undefined && sc.marks !== null && sc.marks !== '') {
      const pct = sc.out_of ? Math.round((Number(sc.marks) / Number(sc.out_of)) * 1000) / 10 : null;
      main = `${sc.marks} / ${sc.out_of ?? '–'}`;
      sub = [pct === null ? '' : `${pct}%`, sc.attempts ? plural(sc.attempts, 'attempt') : ''].filter(Boolean).join(' · ');
    }
    return html`<div class="ms-admin-score"><span class="ms-admin-score__label">${label}</span><span class="ms-admin-score__main">${main}</span>${sub ? html`<span class="ms-admin-score__sub">${sub}</span>` : ''}</div>`;
  };
  return html`<div class="ms-admin-scores">${box('CA Foundation', scores.foundation, { exemptOk: true })}${box('CA Inter', scores.inter)}${box('CA Final', scores.final)}</div>
    ${scores.rank_note ? html`<p class="ms-small ms-mt-8"><strong>Ranks / exemptions:</strong> ${scores.rank_note}</p>` : ''}`;
}

function consentsHtml(m) {
  const c = m.consents || {};
  const items = [...DUTIES, ...POLICY_CONSENTS];
  const missing = items.filter((d) => !c[d.key]).length;
  return html`<details class="ms-acc ms-admin-acc"${missing ? ' open' : ''}>
    <summary>${missing ? html`<span class="ms-badge ms-tone-red">${missing} missing</span>` : html`<span class="ms-badge ms-tone-green">All ${items.length} agreed</span>`} Commitments and consents</summary>
    <div class="ms-acc__body"><ul class="ms-admin-consents">${items.map((d) => html`
      <li class="ms-admin-consent${c[d.key] ? '' : ' is-missing'}">
        <i class="fas ${c[d.key] ? 'fa-circle-check' : 'fa-circle-xmark'}" aria-hidden="true"></i>
        <span class="ms-grow">${d.title}</span>
        <span class="ms-xs ms-muted ms-nowrap">${c[d.key] ? formatDateTime(c[d.key]) : 'Not agreed'}</span>
      </li>`)}</ul></div>
  </details>`;
}

function eventDetail(e) {
  const d = e.detail && typeof e.detail === 'object' ? e.detail : {};
  const bits = [];
  if (d.from || d.to) bits.push(`${MENTOR_STATUS[d.from]?.label || d.from || 'New'} → ${MENTOR_STATUS[d.to]?.label || d.to || '?'}`);
  if (d.score_pct !== undefined && d.score_pct !== null) bits.push(`${d.score_pct}%${d.correct !== undefined ? ` (${d.correct}/${d.total})` : ''}${d.passed ? ', passed' : ''}`);
  if (d.program) bits.push(programLabel(d.program));
  if (d.source) bits.push({ self: 'picked by the student', admin: 'assigned by Team MSC', switch: 'reassigned' }[d.source] || d.source);
  if (e.kind === 'payout_updated' && d.status) bits.push(PAYOUT_STATUS[d.status]?.label || d.status);
  else if (e.kind === 'match_ended' && d.status) bits.push(MATCH_STATUS[d.status]?.label || d.status);
  if (d.reference) bits.push(`ref ${d.reference}`);
  if (d.reason) bits.push(String(d.reason));
  if (d.forced) bits.push('capacity override');
  if (Array.isArray(d.fields) && d.fields.length) bits.push(d.fields.map((f) => String(f).replace(/_/g, ' ')).join(', '));
  return bits.join(' · ');
}

function panelHtml(detail, staff, app) {
  const m = detail.mentor;
  const active = Number(detail.active_count || 0);
  const canWrite = app.canWrite;
  const cfg = app.ctx?.config || DEFAULT_CONFIG;
  const cap = Number(cfg.max_mentees_cap || 10);
  const seniors = staff.filter((s) => s.role === 'senior_mentor' && s.active);
  const consents = consentCount(m);
  const minReviews = Number(cfg.min_reviews_for_rating ?? DEFAULT_CONFIG.min_reviews_for_rating);
  const publicCard = mentorCardHtml({ ...m, active_mentees: active }, { minReviews, lines: 4 });

  const journey = kv([
    ['Stage', stageLabel(m.stage)],
    ['CA Final attempt', m.final_attempt ? monthYearLabel(m.final_attempt) : ''],
    ['Industrial training', m.it_company ? [m.it_company, labelOf(DOMAINS, m.it_domain), m.it_duration_months ? `${m.it_duration_months} months` : '', m.it_start ? `from ${monthYearLabel(m.it_start)}` : '', m.it_city].filter(Boolean).join(' · ') : (m.did_it === false ? 'Did not do IT' : '')],
    ['Articleship', m.articleship_firm ? [m.articleship_firm, labelOf(FIRM_TYPES, m.articleship_firm_type), labelOf(DOMAINS, m.articleship_domain), m.articleship_city, m.articleship_year ? `Year ${m.articleship_year}` : ''].filter(Boolean).join(' · ') : ''],
    ['Qualified', m.qualified_on ? monthYearLabel(m.qualified_on) : ''],
    ['Now', [m.role_title, m.employer].filter(Boolean).join(', ')],
    ['Experience', labelOf(EXPERIENCE_YEARS, m.experience_years)],
  ]);

  const contact = kv([
    ['Email', m.email],
    ['Mobile', formatPhone(m.mobile)],
    ['WhatsApp', formatPhone(m.whatsapp)],
    ['ICAI number', m.icai_number],
    ['LinkedIn', m.linkedin_url ? html`${link(m.linkedin_url, 'Open LinkedIn')} <span class="ms-xs ms-muted">${m.show_linkedin ? '(shown on profile)' : '(private)'}</span>` : html`<span class="ms-admin-missing">Missing</span>`],
    ['Topmate / reviews', m.topmate_url ? link(m.topmate_url, 'Open profile') : html`<span class="ms-muted">Not given</span>`],
    ['City', cityLabel(m.city)],
    ['Languages', labelsOf(LANGUAGES, m.languages).join(', ')],
  ]);

  const mentoring = kv([
    ['Programs', (m.programs || []).map((p) => programLabel(p)).join(', ')],
    ['Domains', labelsOf(DOMAINS, m.domains).join(', ')],
    ['Companies known', (m.companies_known || []).join(', ')],
    ['Mentees', `${active} active of ${m.max_mentees || 0} max`],
    ['Weekly hours', labelOf(WEEKLY_HOURS, m.weekly_hours)],
    ['Call slots', labelsOf(CALL_SLOTS, m.call_slots).join(', ')],
    ['Taking new mentees', m.accepting ? 'Yes' : 'No'],
    ['Heard about us', labelOf(HEARD_FROM, m.heard_from)],
  ]);

  const conflicts = (m.conflicts || []);
  const hasConflict = conflicts.length && !(conflicts.length === 1 && conflicts[0] === 'none');

  const training = m.training || {};
  const attempts = Array.isArray(detail.quiz_attempts) ? detail.quiz_attempts : [];

  const matches = Array.isArray(detail.matches) ? detail.matches : [];
  const reviews = Array.isArray(detail.reviews) ? detail.reviews : [];
  const events = Array.isArray(detail.events) ? detail.events : [];

  return html`<div class="ms-admin-review">
    <div class="ms-admin-review__head">
      ${avatarHtml({ name: m.full_name, photo_path: m.photo_path, size: 'xl', verified: !!m.linkedin_checked, verifiedTitle: 'LinkedIn checked by Team MSC' })}
      <div class="ms-grow ms-stack" style="--ms-gap:6px">
        <div class="ms-row" style="--ms-gap:8px"><h3 class="ms-h3">${m.full_name || 'Unnamed applicant'}</h3>${m.tier ? tierChip(m.tier) : ''}${statusBadge('mentor', m.status)}</div>
        <div class="ms-small ms-text-2">${[stageLabel(m.stage, { short: true }), cityLabel(m.city)].filter(Boolean).join(' · ')}</div>
        <div class="ms-xs ms-muted">${[m.submitted_at ? `Submitted ${formatDate(m.submitted_at)}` : 'Not submitted', m.approved_at ? `approved ${formatDate(m.approved_at)}` : '', m.updated_at ? `last edit ${timeAgo(m.updated_at)}` : ''].filter(Boolean).join(' · ')}</div>
        <div class="ms-btn-row">${waButton(m.whatsapp, `Hi ${firstName(m.full_name)}, Team My Student Club here.`)}${callButton(m.mobile || m.whatsapp)}${mailButton(m.email, 'Your MSC mentor application')}</div>
      </div>
    </div>

    ${statusNote(m, active)}
    ${actionsHtml(m, active, app)}

    <div class="ms-admin-review__grid">
      <div class="ms-stack" style="--ms-gap:14px">
        ${section('How students see this profile', html`<div class="ms-admin-preview">${publicCard}</div>
          ${m.bio ? html`<div class="ms-mt-16"><div class="ms-xs ms-muted ms-strong">About</div><p class="ms-admin-answer">${m.bio}</p></div>` : ''}
          ${m.wish_i_knew ? html`<div class="ms-mt-8"><div class="ms-xs ms-muted ms-strong">Wish I knew</div><blockquote class="ms-admin-quote">${m.wish_i_knew}</blockquote></div>` : ''}`)}
        ${section('CA journey', journey)}
        ${section('Screening answers', html`
          <div class="ms-stack" style="--ms-gap:12px">
            <div><div class="ms-xs ms-muted ms-strong">Why do you want to mentor CA students?</div><p class="ms-admin-answer">${m.why_mentor || '—'}</p></div>
            <div><div class="ms-xs ms-muted ms-strong">Scenario</div><blockquote class="ms-admin-quote">${SCENARIO_QUESTION}</blockquote><p class="ms-admin-answer">${m.scenario_answer || '—'}</p>
              <p class="ms-xs ms-muted ms-mt-8">Score it out of 6: empathy (2), a practical next step (2), no overpromising (1), clarity (1). 4 or more is a pass.</p></div>
            <dl class="ms-kv">
              <dt>Guided juniors before</dt><dd>${labelOf(MENTORING_EXPERIENCE, m.mentoring_experience) || '—'}</dd>
              <dt>Anything we should know</dt><dd>${conflicts.length ? labelsOf(CONFLICTS, conflicts).join('; ') : '—'}${hasConflict ? html` <span class="ms-badge ms-tone-amber">Check</span>` : ''}</dd>
              ${m.conflicts_note ? html`<dt>Their note</dt><dd>${m.conflicts_note}</dd>` : ''}
            </dl>
          </div>`)}
        ${section('Scores', scoresTable(m.scores || {}))}
      </div>

      <div class="ms-stack" style="--ms-gap:14px">
        ${section('CV and photo', html`${m.cv_path
          ? html`<div class="ms-file"><span class="ms-file__icon"><i class="fas fa-file-pdf" aria-hidden="true"></i></span><span class="ms-file__name ms-grow">CV (PDF)</span><button type="button" class="ms-btn ms-btn--secondary ms-btn--sm" data-cv><i class="fas fa-eye" aria-hidden="true"></i><span>View CV</span></button></div>
            <p class="ms-xs ms-muted ms-mt-8">Opens a private link that works for 5 minutes.</p>`
          : html`<p class="ms-small ms-admin-missing">No CV uploaded.</p>`}
          <div class="ms-row ms-mt-8" style="--ms-gap:10px">${photoLink(m)}</div>`)}
        ${section('Contact and links', contact)}
        ${section('Mentoring', mentoring)}
        ${section('Verification and notes', html`
          <div class="ms-stack" style="--ms-gap:12px">
            <label class="ms-switch"><input type="checkbox" data-check="linkedin_checked"${m.linkedin_checked ? ' checked' : ''}${canWrite ? '' : ' disabled'}><span class="ms-switch__track"></span><span>LinkedIn checked <span class="ms-xs ms-muted">(shows a tick on the profile)</span></span></label>
            <label class="ms-switch"><input type="checkbox" data-check="topmate_checked"${m.topmate_checked ? ' checked' : ''}${canWrite && m.topmate_url ? '' : ' disabled'}><span class="ms-switch__track"></span><span>Topmate reviews checked</span></label>
            <div class="ms-form-grid">
              <div class="ms-field">
                <label class="ms-label" for="adm-senior">Senior mentor</label>
                <select class="ms-select" id="adm-senior" data-senior${canWrite ? '' : ' disabled'}>
                  <option value="">None (escalates to Team MSC)</option>
                  ${seniors.map((s) => html`<option value="${s.user_id}"${s.user_id === m.senior_mentor_id ? ' selected' : ''}>${s.name || s.email}</option>`)}
                  ${m.senior_mentor_id && !seniors.some((s) => s.user_id === m.senior_mentor_id) ? html`<option value="${m.senior_mentor_id}" selected>Current (inactive or unknown)</option>` : ''}
                </select>
              </div>
              <div class="ms-field">
                <label class="ms-label" for="adm-max">Max mentees</label>
                <select class="ms-select" id="adm-max" data-max${canWrite ? '' : ' disabled'}>
                  ${MENTEE_CAPACITY.filter((n) => n <= cap).map((n) => html`<option value="${n}"${n === Number(m.max_mentees) ? ' selected' : ''}${n < active ? ' disabled' : ''}>${n}${n < active ? ' (below active)' : ''}</option>`)}
                </select>
              </div>
            </div>
            <div class="ms-field">
              <label class="ms-label" for="adm-note">Staff note <span class="ms-vis ms-vis--private"><i class="fas fa-lock" aria-hidden="true"></i>Only Team MSC sees this</span></label>
              <textarea class="ms-textarea" id="adm-note" rows="3" maxlength="2000" data-note placeholder="What you checked, what to watch, calls you had with them">${m.staff_note || ''}</textarea>
              <div class="ms-row ms-end"><button type="button" class="ms-btn ms-btn--secondary ms-btn--sm" data-save-note><span>Save note</span></button></div>
            </div>
          </div>`)}
        ${section('Training and quiz', html`
          ${kv([
            ['Lecture', training.lecture_at ? `Watched ${formatDate(training.lecture_at)}` : 'Not marked'],
            ['Playbook', training.playbook_at ? `Read ${formatDate(training.playbook_at)}` : 'Not marked'],
            ['Quiz', m.quiz_passed_at ? `Passed ${formatDate(m.quiz_passed_at)} · best ${m.quiz_best_pct ?? '–'}%` : Number(m.quiz_attempts) ? `Not passed yet · best ${m.quiz_best_pct ?? 0}% in ${plural(m.quiz_attempts, 'attempt')}` : 'Not taken'],
          ])}
          ${attempts.length ? html`<ul class="ms-timeline ms-mt-16">${attempts.map((a) => html`<li class="${a.passed ? 'is-good' : 'is-muted'}"><div class="ms-timeline__title">${a.score_pct}% · ${a.correct}/${a.total} ${a.passed ? 'passed' : 'not passed'}</div><div class="ms-timeline__meta">${formatDateTime(a.created_at)}</div></li>`)}</ul>` : ''}`)}
        ${consentsHtml(m)}
      </div>
    </div>

    ${section(`Mentees (${matches.length})`, matches.length ? html`<ul class="ms-admin-rows">${matches.map((x) => html`
      <li><button type="button" class="ms-admin-rowbtn" data-match="${x.match_id}">
        <span class="ms-grow"><strong>${x.mentee?.full_name || 'Mentee'}</strong> <span class="ms-xs ms-muted">${programLabel(x.program)} · week ${x.week_no || 1}</span>
          <span class="ms-xs ms-muted ms-admin-block">Last call ${x.last_call_on ? daysAgoText(x.days_since_call) : 'not logged'} · checklist ${x.checklist_done || 0}/${x.checklist_total || 9}</span></span>
        ${badge('match', x.status)} ${badge('payout', x.payout_status)}
      </button></li>`)}</ul>` : html`<p class="ms-small ms-muted">No mentees yet.</p>`)}

    ${section(`Reviews (${reviews.length})`, reviews.length ? html`<ul class="ms-admin-rows">${reviews.map((r) => html`
      <li class="ms-admin-review-row${r.published ? '' : ' is-hidden'}">
        <div class="ms-row ms-between" style="--ms-gap:6px">${starsHtml(r.rating)}<span class="ms-xs ms-muted">${r.mentee_name || ''} · ${formatDate(r.created_at)}</span></div>
        ${r.safety_flag ? html`<span class="ms-badge ms-tone-red"><i class="fas fa-shield-halved" aria-hidden="true"></i>Safety flag</span>` : ''}
        ${(r.tags || []).length ? html`<div class="ms-chips">${labelsOf(REVIEW_TAGS, r.tags).map((t) => html`<span class="ms-chip">${t}</span>`)}</div>` : ''}
        ${r.body ? html`<p class="ms-small">${r.body}</p>` : ''}
        ${r.private_note ? html`<p class="ms-xs ms-admin-private"><i class="fas fa-lock" aria-hidden="true"></i> ${r.private_note}</p>` : ''}
        ${r.published ? '' : html`<span class="ms-badge ms-tone-gray">Hidden from profile</span>`}
      </li>`)}</ul>` : html`<p class="ms-small ms-muted">No reviews yet.</p>`)}

    ${section('Activity', events.length ? html`<ul class="ms-timeline">${events.map((e) => html`<li>
      <div class="ms-timeline__title">${EVENT_LABELS[e.kind] || e.kind}</div>
      <div class="ms-small ms-text-2">${eventDetail(e)}</div>
      <div class="ms-timeline__meta">${[e.actor_name, formatDateTime(e.created_at)].filter(Boolean).join(' · ')}</div>
    </li>`)}</ul>` : html`<p class="ms-small ms-muted">No activity yet.</p>`)}

    <p class="ms-xs ms-muted">Consents ${consents}/${REQUIRED_CONSENTS.length}. Mentor id <code>${m.id}</code>. Public profile links go to <a class="ms-link" href="${PATHS.find}?mentor=${encodeURIComponent(m.id)}" target="_blank" rel="noopener">find a mentor</a> once approved.</p>
  </div>`;
}

/* ---------- behaviour ----------------------------------------------------- */

function bind(modal, detail, app) {
  const m = detail.mentor;
  const root = modal.body;

  root.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
    const row = await setMentorStatus(app, { ...m, active_count: detail.active_count }, b.dataset.act);
    if (row) await fill(modal, m.id, app, { force: true });
  }));

  root.querySelector('[data-cv]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (isMockMode()) { toast('Mock mode: the private CV link would open here.', { type: 'info' }); return; }
    const win = window.open('', '_blank');
    try {
      btn.disabled = true;
      const url = await signedUrl(STORAGE.cv, m.cv_path, 300);
      const safe = safeUrl(url, { allowRelative: false });
      if (!safe) throw new Error('No link');
      if (win) { win.opener = null; win.location.href = safe; } else location.href = safe;
    } catch (err) {
      if (win) win.close();
      showError(err, 'Could not open the CV. Please try again.');
    } finally { btn.disabled = false; }
  });

  const patch = async (p, okMsg, { revert } = {}) => {
    try {
      await rpc('mentorship_admin_update_mentor', { p_mentor_id: m.id, p_patch: p });
      toast(okMsg, { type: 'success' });
      invalidate('mentors', `detail:${m.id}`);
      Object.assign(m, p);
      return true;
    } catch (e) {
      if (e.code === 'invalid_input' && /max_mentees/.test(String(e.hint || ''))) toast('That is below their current number of mentees.', { type: 'error' });
      else showError(e);
      revert?.();
      return false;
    }
  };

  root.querySelectorAll('[data-check]').forEach((cb) => cb.addEventListener('change', () => {
    const key = cb.dataset.check;
    const label = key === 'linkedin_checked' ? 'LinkedIn' : 'Topmate';
    patch({ [key]: cb.checked }, cb.checked ? `${label} marked as checked.` : `${label} check removed.`, { revert: () => { cb.checked = !cb.checked; } });
  }));

  const senior = root.querySelector('[data-senior]');
  if (senior) {
    let prev = senior.value;
    senior.addEventListener('change', async () => {
      const ok = await patch({ senior_mentor_id: senior.value || null }, senior.value ? 'Senior mentor assigned.' : 'Senior mentor removed.', { revert: () => { senior.value = prev; } });
      if (ok) prev = senior.value;
    });
  }
  const max = root.querySelector('[data-max]');
  if (max) {
    let prev = max.value;
    max.addEventListener('change', async () => {
      const ok = await patch({ max_mentees: Number(max.value) }, `Max mentees set to ${max.value}.`, { revert: () => { max.value = prev; } });
      if (ok) { prev = max.value; app.refresh({ tab: false }); }
    });
  }
  root.querySelector('[data-save-note]')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const note = root.querySelector('[data-note]').value.trim();
    btn.disabled = true;
    await patch({ staff_note: note }, 'Note saved.');
    btn.disabled = false;
  });

  root.querySelectorAll('[data-match]').forEach((b) => b.addEventListener('click', () => {
    const x = (detail.matches || []).find((y) => y.match_id === b.dataset.match);
    if (x) app.openMatch(x);
  }));
}
