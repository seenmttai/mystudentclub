/* Admin: Reviews, Settings and Staff tabs. Owner: admin builder. */
import {
  html, setContent, emptyState, starsHtml, labelsOf, REVIEW_TAGS, PROGRAMS, PROGRAM_KEYS, DEFAULT_CONFIG, DEFAULT_ESCALATION_CONTACT, formatDate, timeAgo, rpc, toast, showError, confirmDialog, normalizeUrl, normalizePhone, isValidIndianMobile,
  formatPhone, embedVideo, getConfig, programLabel, debounce, firstName, formatINR,
} from '/mentorship/assets/mentorship-core.js?v=1';
import { load, chipsHtml, errorBlock, invalidate, haystack, waIconLink } from './admin-shared.js?v=1';

/* ========================================================================== */
/* Reviews                                                                    */
/* ========================================================================== */

const REVIEW_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'safety', label: 'Safety flags' },
  { value: 'low', label: '3 stars or less' },
  { value: 'hidden', label: 'Hidden' },
];

export async function renderReviews(panel, app, token) {
  const f = app.filters.reviews || (app.filters.reviews = { status: 'all', q: '' });
  if (f.preset) { f.status = REVIEW_FILTERS.some((x) => x.value === f.preset) ? f.preset : 'all'; delete f.preset; }
  let rows;
  try { rows = await load.reviews(); } catch (e) {
    if (!app.isLive(token)) return;
    setContent(panel, errorBlock(e, 'adm-rv-retry'));
    panel.querySelector('#adm-rv-retry')?.addEventListener('click', () => app.refresh({ hard: true }));
    return;
  }
  if (!app.isLive(token)) return;
  const test = {
    all: () => true,
    safety: (r) => r.safety_flag,
    low: (r) => Number(r.rating) <= 3,
    hidden: (r) => !r.published,
  };
  const filtered = () => {
    const term = f.q.trim().toLowerCase();
    return rows.filter(test[f.status] || test.all)
      .filter((r) => !term || haystack(r.mentor_name, r.mentee_name, r.body, r.private_note).includes(term))
      .sort((a, b) => (Number(b.safety_flag) - Number(a.safety_flag)) || String(b.created_at).localeCompare(String(a.created_at)));
  };

  setContent(panel, html`<div data-root>
    <div class="ms-admin-toolbar">
      <label class="ms-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input class="ms-input" type="search" placeholder="Search mentor, mentee or text" value="${f.q}" data-q aria-label="Search reviews"></label>
    </div>
    <div class="ms-admin-toolbar">${chipsHtml('rvst', REVIEW_FILTERS.map((o) => ({ ...o, count: rows.filter(test[o.value]).length })), f.status, { label: 'Review filter' })}</div>
    <p class="ms-small ms-muted ms-mb-16">Safety flags first. Mentors cannot delete reviews; hiding one removes it from the public profile and the rating.</p>
    <div class="ms-grid ms-grid--2" data-list></div>
  </div>`);
  const root = panel.querySelector('[data-root]');
  const list = root.querySelector('[data-list]');
  const draw = () => {
    const shown = filtered();
    if (!shown.length) {
      setContent(list, html`<div class="ms-card ms-admin-span-all">${emptyState({ icon: 'fa-star', title: rows.length ? 'No reviews for this filter' : 'No reviews yet', text: rows.length ? '' : 'Students can review their mentor after 4 weeks together.' })}</div>`);
      return;
    }
    setContent(list, html`${shown.map((r) => html`<article class="ms-card ms-admin-reviewcard${r.safety_flag ? ' is-flagged' : ''}${r.published ? '' : ' is-hidden'}">
      <div class="ms-row ms-between" style="--ms-gap:8px">
        <span class="ms-row" style="--ms-gap:6px">${starsHtml(r.rating)}<span class="ms-strong ms-small">${r.rating}/5</span></span>
        <span class="ms-row" style="--ms-gap:6px">
          ${r.safety_flag ? html`<span class="ms-badge ms-tone-red"><i class="fas fa-shield-halved" aria-hidden="true"></i>Safety flag</span>` : ''}
          ${r.published ? html`<span class="ms-badge ms-tone-green">Public</span>` : html`<span class="ms-badge ms-tone-gray">Hidden</span>`}
        </span>
      </div>
      <div class="ms-small ms-mt-8"><button type="button" class="ms-admin-linkbtn" data-mentor="${r.mentor_id}">${r.mentor_name || 'Mentor'}</button> <span class="ms-muted">reviewed by ${r.mentee_name || 'a mentee'} · ${formatDate(r.created_at)}</span></div>
      ${(r.tags || []).length ? html`<div class="ms-chips ms-mt-8">${labelsOf(REVIEW_TAGS, r.tags).map((t) => html`<span class="ms-chip">${t}</span>`)}</div>` : ''}
      ${r.body ? html`<p class="ms-admin-answer ms-mt-8">${r.body}</p>` : html`<p class="ms-xs ms-muted ms-mt-8">No public text.</p>`}
      ${r.safety_flag ? html`<p class="ms-small ms-admin-bad ms-mt-8">The student says the mentor asked for money, sold a course or promised a job.</p>` : ''}
      ${r.private_note ? html`<p class="ms-xs ms-admin-private ms-mt-8"><i class="fas fa-lock" aria-hidden="true"></i> Private to Team MSC: ${r.private_note}</p>` : ''}
      ${app.canWrite ? html`<div class="ms-card__foot">
        <button type="button" class="ms-btn ms-btn--${r.published ? 'outline' : 'secondary'} ms-btn--sm" data-toggle="${r.id}" data-pub="${r.published ? '0' : '1'}"><i class="fas ${r.published ? 'fa-eye-slash' : 'fa-eye'}" aria-hidden="true"></i><span>${r.published ? 'Hide from profile' : 'Publish again'}</span></button>
        <button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-mentor="${r.mentor_id}"><span>Mentor</span></button>
      </div>` : ''}
    </article>`)}`);
  };
  draw();
  root.querySelector('[data-q]').addEventListener('input', debounce((e) => { f.q = e.target.value; draw(); }, 150));
  root.querySelector('[data-chips="rvst"]').addEventListener('change', (e) => { f.status = e.target.value; draw(); });
  list.addEventListener('click', async (e) => {
    const mn = e.target.closest('[data-mentor]');
    if (mn && mn.dataset.mentor) { app.openMentor(mn.dataset.mentor); return; }
    const tg = e.target.closest('[data-toggle]');
    if (!tg) return;
    const r = rows.find((x) => x.id === tg.dataset.toggle);
    const publish = tg.dataset.pub === '1';
    if (!publish) {
      const ok = await confirmDialog({ title: 'Hide this review?', message: 'It disappears from the mentor\'s public profile and their rating is recalculated. You can publish it again later.', confirmText: 'Hide review', danger: true });
      if (!ok) return;
    }
    try {
      tg.disabled = true;
      const res = await rpc('mentorship_admin_set_review', { p_review_id: tg.dataset.toggle, p_published: publish });
      if (r) r.published = res && typeof res.published === 'boolean' ? res.published : publish;
      toast(publish ? 'Review is public again.' : 'Review hidden.', { type: 'success' });
      invalidate('mentors', 'detail', 'overview');
      draw();
    } catch (err) { showError(err); tg.disabled = false; }
  });
}

/* ========================================================================== */
/* Settings                                                                   */
/* ========================================================================== */

const GROUPS = [
  { title: 'Mentor fee', icon: 'fa-indian-rupee-sign', keys: ['mentor_fee_inr'] },
  { title: 'Training and tools', icon: 'fa-graduation-cap', keys: ['lecture_video_url', 'padam_gpt_url', 'links_url'] },
  { title: 'Escalation contact', icon: 'fa-life-ring', keys: ['escalation_contact'] },
  { title: 'Programs open for mentorship', icon: 'fa-layer-group', keys: ['programs_enabled'] },
  { title: 'Quiz, reviews and switches', icon: 'fa-list-check', keys: ['quiz_pass_pct', 'quiz_cooldown_hours', 'review_after_days', 'min_reviews_for_rating', 'switch_limit', 'max_mentees_cap'] },
  { title: 'Red flag rules', icon: 'fa-flag', keys: ['red_flag_call_days', 'unmatched_after_days', 'unmatched_since'], note: 'Private: only used by this console.' },
];
const FIELDS = {
  mentor_fee_inr: { type: 'int', label: 'Fee per mentee (Rs)', min: 0, max: 100000, hint: 'New matches use this. Existing matches keep the fee they started with.' },
  lecture_video_url: { type: 'url', label: 'Mentor lecture video', hint: 'A YouTube, Vimeo, Loom, Google Drive or .mp4 link.', video: true },
  padam_gpt_url: { type: 'url', label: 'Padam GPT link', hint: 'Empty shows a "coming soon" pill to mentors.' },
  links_url: { type: 'url', label: 'All resources link', hint: 'Used in the mentor message templates.' },
  escalation_contact: { type: 'contact', label: 'Fallback escalation contact', hint: 'Mentors without a senior mentor see this contact on their dashboard.' },
  programs_enabled: { type: 'programs', label: 'Programs' },
  quiz_pass_pct: { type: 'int', label: 'Quiz pass mark (%)', min: 50, max: 100 },
  quiz_cooldown_hours: { type: 'int', label: 'Quiz retry wait (hours)', min: 0, max: 720 },
  review_after_days: { type: 'int', label: 'Reviews open after (days)', min: 1, max: 365 },
  min_reviews_for_rating: { type: 'int', label: 'Reviews needed before stars show', min: 1, max: 50 },
  switch_limit: { type: 'int', label: 'Switches per student per program', min: 0, max: 5 },
  max_mentees_cap: { type: 'int', label: 'Most mentees a mentor can pick', min: 1, max: 10, hint: 'The application form offers 1 to 10.' },
  red_flag_call_days: { type: 'int', label: 'Flag when no call is logged for (days)', min: 3, max: 60 },
  unmatched_after_days: { type: 'int', label: 'Flag an unmatched student after (days)', min: 0, max: 60 },
  unmatched_since: { type: 'date', label: 'Ignore enrollments before', hint: 'Earlier batches never get an "unmatched" flag.' },
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Keys that must stay private if they are ever created from this page (seeded rows keep their flag). */
// Not in the public config (mentorship_get_config): staff thresholds, and the escalation contact (staff details).
const PRIVATE_KEYS = ['unmatched_after_days', 'unmatched_since', 'red_flag_call_days', 'escalation_contact'];
const DEFAULTS = { ...DEFAULT_CONFIG, escalation_contact: DEFAULT_ESCALATION_CONTACT };

function videoKindText(url) {
  const v = embedVideo(url);
  if (!url) return 'Empty: the training page shows "lecture coming soon".';
  if (!v) return 'Not a valid link.';
  if (v.kind === 'iframe') return 'Plays inside the training page.';
  if (v.kind === 'file') return 'Plays as a video file inside the training page.';
  return 'Opens in a new tab (not an embeddable video link).';
}

function fieldHtml(key, row, disabled, solo = false) {
  const def = FIELDS[key] || { type: 'json', label: key };
  const value = row ? row.value : DEFAULTS[key];
  const id = `cfg-${key}`;
  const meta = html`<span class="ms-xs ms-muted">${row ? (row.is_public ? 'Public' : 'Private') : 'Not set yet, using the default'}${row?.updated_at ? ` · changed ${timeAgo(row.updated_at)}` : ''}</span>`;
  const err = html`<span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span data-err></span></span>`;
  const dis = disabled ? ' disabled' : '';
  if (def.type === 'int') {
    return html`<div class="ms-field${solo ? ' ms-span-2' : ''}" data-key="${key}"><label class="ms-label" for="${id}">${def.label}</label>
      <input class="ms-input ms-admin-num" id="${id}" type="number" inputmode="numeric" step="1" min="${def.min}" max="${def.max}" value="${value ?? ''}"${dis}>
      ${def.hint ? html`<span class="ms-hint">${def.hint}</span>` : ''}${meta}${err}</div>`;
  }
  if (def.type === 'url') {
    return html`<div class="ms-field ms-span-2" data-key="${key}"><label class="ms-label" for="${id}">${def.label}</label>
      <input class="ms-input" id="${id}" type="url" inputmode="url" placeholder="https://" value="${value || ''}"${dis}>
      ${def.hint ? html`<span class="ms-hint">${def.hint}</span>` : ''}
      ${def.video ? html`<span class="ms-hint ms-strong" data-video-kind>${videoKindText(value || '')}</span>` : ''}${meta}${err}</div>`;
  }
  if (def.type === 'date') {
    return html`<div class="ms-field" data-key="${key}"><label class="ms-label" for="${id}">${def.label}</label>
      <input class="ms-input" id="${id}" type="date" value="${value || ''}"${dis}>
      ${def.hint ? html`<span class="ms-hint">${def.hint}</span>` : ''}${meta}${err}</div>`;
  }
  if (def.type === 'contact') {
    const v = value && typeof value === 'object' ? value : {};
    const wa = normalizePhone(v.whatsapp || '');
    return html`<div class="ms-field ms-span-2" data-key="${key}"><span class="ms-label">${def.label}</span>
      <div class="ms-form-grid">
        <div class="ms-field"><label class="ms-label ms-xs" for="${id}-name">Name</label><input class="ms-input" id="${id}-name" data-part="name" maxlength="60" value="${v.name || ''}"${dis}></div>
        <div class="ms-field"><label class="ms-label ms-xs" for="${id}-wa">WhatsApp</label><div class="ms-input-group"><span class="ms-input-group__addon">+91</span><input class="ms-input" id="${id}-wa" data-part="whatsapp" type="tel" inputmode="tel" maxlength="14" value="${wa.length === 12 ? wa.slice(2) : (v.whatsapp || '')}"${dis}></div></div>
        <div class="ms-field ms-span-2"><label class="ms-label ms-xs" for="${id}-email">Email</label><input class="ms-input" id="${id}-email" data-part="email" type="email" inputmode="email" value="${v.email || ''}"${dis}></div>
      </div>
      ${def.hint ? html`<span class="ms-hint">${def.hint}</span>` : ''}${meta}${err}</div>`;
  }
  if (def.type === 'programs') {
    const on = Array.isArray(value) ? value : [];
    return html`<div class="ms-field ms-span-2" data-key="${key}"><span class="ms-label">${def.label}</span>
      <div class="ms-stack" style="--ms-gap:10px">${PROGRAM_KEYS.map((p) => html`<label class="ms-switch"><input type="checkbox" data-program="${p}"${on.includes(p) ? ' checked' : ''}${dis}><span class="ms-switch__track"></span><span>${PROGRAMS[p].name}</span></label>`)}</div>
      <span class="ms-hint">Students enrolled in an open program can pick mentors. Turning one off stops new bookings; current matches continue.</span>${meta}${err}</div>`;
  }
  return html`<div class="ms-field ms-span-2" data-key="${key}"><label class="ms-label" for="${id}">${key}</label>
    <textarea class="ms-textarea ms-admin-mono" id="${id}" rows="3"${dis}>${JSON.stringify(value ?? null, null, 2)}</textarea>
    <span class="ms-hint">Raw JSON value.</span>${meta}${err}</div>`;
}

/** Read a field's value. Returns { value } or { error }. */
function readField(el) {
  const key = el.dataset.key;
  const def = FIELDS[key] || { type: 'json' };
  if (def.type === 'int') {
    const raw = el.querySelector('input').value.trim();
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n)) return { error: 'Enter a whole number.' };
    if (n < def.min || n > def.max) return { error: `Use a number from ${def.min} to ${def.max}.` };
    return { value: n };
  }
  if (def.type === 'url') {
    const raw = el.querySelector('input').value.trim();
    if (!raw) return { value: '' };
    const u = normalizeUrl(raw);
    if (!u || !u.startsWith('https://')) return { error: 'Use a full https:// link, or leave it empty.' };
    return { value: u };
  }
  if (def.type === 'date') {
    const raw = el.querySelector('input').value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { error: 'Pick a date.' };
    return { value: raw };
  }
  if (def.type === 'contact') {
    const part = (p) => el.querySelector(`[data-part="${p}"]`).value.trim();
    const name = part('name');
    const waRaw = part('whatsapp');
    const email = part('email');
    if (!name) return { error: 'Add a name, for example Team My Student Club.' };
    if (waRaw && !isValidIndianMobile(waRaw)) return { error: 'WhatsApp must be a 10-digit Indian mobile number.' };
    if (email && !EMAIL_RE.test(email)) return { error: 'That email does not look right.' };
    return { value: { name, whatsapp: waRaw ? normalizePhone(waRaw) : '', email } };
  }
  if (def.type === 'programs') {
    return { value: PROGRAM_KEYS.filter((p) => el.querySelector(`[data-program="${p}"]`)?.checked) };
  }
  try { return { value: JSON.parse(el.querySelector('textarea').value) }; } catch { return { error: 'That is not valid JSON.' }; }
}

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export async function renderSettings(panel, app, token) {
  let rows;
  try { rows = await load.config(); } catch (e) {
    if (!app.isLive(token)) return;
    setContent(panel, errorBlock(e, 'adm-cfg-retry'));
    panel.querySelector('#adm-cfg-retry')?.addEventListener('click', () => app.refresh({ hard: true }));
    return;
  }
  if (!app.isLive(token)) return;
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const known = new Set(GROUPS.flatMap((g) => g.keys));
  const extra = rows.filter((r) => !known.has(r.key)).map((r) => r.key);
  const groups = extra.length ? [...GROUPS, { title: 'Other settings', icon: 'fa-gear', keys: extra }] : GROUPS;
  const disabled = !app.canWrite;
  const original = (key) => (byKey.has(key) ? byKey.get(key).value : DEFAULTS[key]);

  setContent(panel, html`<div data-root class="ms-stack" style="--ms-gap:16px">
    ${disabled ? html`<div class="ms-callout ms-callout--gray"><i class="fas fa-lock" aria-hidden="true"></i><span>Only admins can change settings. You can see the current values.</span></div>` : ''}
    <div class="ms-grid ms-grid--2 ms-admin-settings">
      ${groups.map((g, i) => html`<form class="ms-card ms-admin-cfg" data-group="${i}" novalidate>
        <div class="ms-card__head"><div><div class="ms-card__title"><i class="fas ${g.icon} ms-admin-cfg__icon" aria-hidden="true"></i>${g.title}</div>${g.note ? html`<div class="ms-card__sub">${g.note}</div>` : ''}</div></div>
        <div class="ms-form-grid">${g.keys.map((k) => fieldHtml(k, byKey.get(k), disabled, g.keys.length === 1))}</div>
        ${disabled ? '' : html`<div class="ms-card__foot"><span class="ms-xs ms-muted" data-state>No changes</span><span class="ms-grow"></span><button type="submit" class="ms-btn ms-btn--primary ms-btn--sm" disabled><span>Save</span></button></div>`}
      </form>`)}
    </div>
  </div>`);
  if (disabled) return;

  const root = panel.querySelector('[data-root]');
  root.querySelectorAll('form[data-group]').forEach((form) => {
    const fields = [...form.querySelectorAll('[data-key]')];
    const saveBtn = form.querySelector('button[type="submit"]');
    const state = form.querySelector('[data-state]');
    const dirtyKeys = () => fields.filter((el) => {
      const r = readField(el);
      return r.error ? true : !same(r.value, original(el.dataset.key));
    });
    const update = () => {
      const n = dirtyKeys().length;
      saveBtn.disabled = !n;
      state.textContent = n ? `${n} unsaved ${n === 1 ? 'change' : 'changes'}` : 'No changes';
      form.querySelectorAll('[data-video-kind]').forEach((hint) => {
        const v = hint.closest('[data-key]').querySelector('input').value.trim();
        hint.textContent = videoKindText(v ? normalizeUrl(v) : '');
      });
    };
    form.addEventListener('input', () => { fields.forEach((el) => el.classList.remove('is-invalid')); update(); });
    form.addEventListener('change', update);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const changes = [];
      let bad = false;
      fields.forEach((el) => {
        const r = readField(el);
        if (r.error) { el.classList.add('is-invalid'); el.querySelector('[data-err]').textContent = r.error; bad = true; return; }
        if (!same(r.value, original(el.dataset.key))) changes.push({ key: el.dataset.key, value: r.value });
      });
      if (bad || !changes.length) return;
      const prog = changes.find((c) => c.key === 'programs_enabled');
      if (prog) {
        const before = original('programs_enabled') || [];
        const off = before.filter((p) => !prog.value.includes(p));
        const on = prog.value.filter((p) => !before.includes(p));
        const msg = [
          on.length ? `Opening: ${on.map((p) => programLabel(p)).join(', ')}. Enrolled students can pick mentors right away, so make sure approved mentors list this program.` : '',
          off.length ? `Closing: ${off.map((p) => programLabel(p)).join(', ')}. New bookings stop; current matches continue.` : '',
          !prog.value.length ? 'No program will be open, so nobody can book a mentor.' : '',
        ].filter(Boolean).join(' ');
        const ok = await confirmDialog({ title: 'Change open programs?', message: msg, confirmText: 'Save', danger: !!off.length });
        if (!ok) return;
      }
      if (changes.some((c) => c.key === 'mentor_fee_inr')) {
        const c = changes.find((x) => x.key === 'mentor_fee_inr');
        const ok = await confirmDialog({ title: 'Change the mentor fee?', message: `New matches will use ${formatINR(c.value)} per mentee. Existing matches keep their fee. The hub, application and dashboards show the new amount.`, confirmText: 'Save fee' });
        if (!ok) return;
      }
      saveBtn.disabled = true;
      saveBtn.classList.add('is-loading');
      try {
        for (const c of changes) {
          // eslint-disable-next-line no-await-in-loop
          await rpc('mentorship_admin_set_config', { p_key: c.key, p_value: c.value, p_is_public: byKey.has(c.key) ? null : !PRIVATE_KEYS.includes(c.key) });
        }
        toast(changes.length === 1 ? 'Setting saved.' : `${changes.length} settings saved.`, { type: 'success' });
        const stamp = new Date().toISOString();
        changes.forEach((c) => {
          const row = byKey.get(c.key);
          if (row) { row.value = c.value; row.updated_at = stamp; } else byKey.set(c.key, { key: c.key, value: c.value, is_public: !PRIVATE_KEYS.includes(c.key), updated_at: stamp });
        });
        invalidate('config', 'overview', 'flags', 'unmatched');
        try { app.ctx.config = await getConfig({ force: true }); } catch { /* keep old */ }
        app.refresh({ tab: false });
        update();
      } catch (err) {
        if (err.code === 'invalid_input') toast(`That value was not accepted${err.hint ? ` (${err.hint})` : ''}.`, { type: 'error' });
        else showError(err);
      } finally {
        saveBtn.classList.remove('is-loading');
        update();
      }
    });
  });
}

/* ========================================================================== */
/* Staff                                                                      */
/* ========================================================================== */

const ROLE_LABEL = { admin: 'Admin', senior_mentor: 'Senior mentor' };

async function upsertStaff(app, { email, role, name, whatsapp, active }, okMsg) {
  try {
    await rpc('mentorship_admin_upsert_staff', { p_email: email, p_role: role, p_name: name || null, p_whatsapp: whatsapp || null, p_active: active });
    toast(okMsg, { type: 'success' });
    invalidate('staff', 'mentors', 'detail');
    app.refresh({ kpis: false });
    return true;
  } catch (e) {
    if (e.code === 'not_found') toast('No MSC account uses that email yet. Ask them to sign up and log in once, then add them again.', { type: 'error', timeout: 7000 });
    else if (e.code === 'invalid_input' && /is_mentor/.test(String(e.hint || ''))) toast('This person is a live MSC mentor. Staff read what mentees tell Team MSC privately, so a mentor cannot also be staff. Reassign their mentees and close their mentor profile first.', { type: 'error', timeout: 9000 });
    else if (e.code === 'invalid_transition' || e.code === 'forbidden') toast(e.hint && /admin/i.test(e.hint) ? 'You cannot remove or demote the last active admin.' : e.message, { type: 'error' });
    else showError(e);
    return false;
  }
}

export async function renderStaff(panel, app, token) {
  let rows;
  try { rows = await load.staff(); } catch (e) {
    if (!app.isLive(token)) return;
    setContent(panel, errorBlock(e, 'adm-st-retry'));
    panel.querySelector('#adm-st-retry')?.addEventListener('click', () => app.refresh({ hard: true }));
    return;
  }
  if (!app.isLive(token)) return;
  const meId = app.ctx.user?.id;
  rows = [...rows].sort((a, b) => (Number(b.active) - Number(a.active)) || (a.role === b.role ? 0 : a.role === 'admin' ? -1 : 1) || String(a.name || a.email).localeCompare(String(b.name || b.email)));

  setContent(panel, html`<div data-root class="ms-stack" style="--ms-gap:16px">
    <p class="ms-small ms-muted">Admins approve mentors, reassign mentees, mark payouts and change settings. Senior mentors can see everything, add notes on mentors and are the escalation contact for the mentors assigned to them.</p>
    ${rows.length ? html`<div class="ms-table-wrap"><table class="ms-table ms-table--stack ms-admin-table">
      <thead><tr><th>Person</th><th>Role</th><th>WhatsApp</th><th>Status</th><th>Added</th><th><span class="ms-sr-only">Actions</span></th></tr></thead>
      <tbody>${rows.map((s) => html`<tr class="${s.active ? '' : 'ms-admin-row-off'}">
        <td class="ms-admin-td-main" data-label="Person"><div class="ms-person__name">${s.name || s.email}${s.user_id === meId ? html` <span class="ms-badge ms-tone-blue">You</span>` : ''}</div><div class="ms-person__sub">${s.email}</div></td>
        <td data-label="Role">${app.canWrite
          ? html`<select class="ms-select ms-admin-select ms-admin-select--sm" data-role="${s.user_id}" aria-label="Role for ${s.email}">${Object.entries(ROLE_LABEL).map(([k, l]) => html`<option value="${k}"${k === s.role ? ' selected' : ''}>${l}</option>`)}</select>`
          : html`<span class="ms-badge ${s.role === 'admin' ? 'ms-tone-blue' : 'ms-tone-purple'}">${ROLE_LABEL[s.role] || s.role}</span>`}</td>
        <td data-label="WhatsApp">${s.whatsapp ? html`<span class="ms-row" style="--ms-gap:6px">${formatPhone(s.whatsapp)}${waIconLink(s.whatsapp, `Hi ${firstName(s.name) || 'there'}, Team My Student Club here.`, `WhatsApp ${s.name || s.email}`)}</span>` : html`<span class="ms-muted">—</span>`}</td>
        <td data-label="Status">${s.active ? html`<span class="ms-badge ms-tone-green">Active</span>` : html`<span class="ms-badge ms-tone-gray">Inactive</span>`}</td>
        <td data-label="Added">${s.created_at ? formatDate(s.created_at) : '—'}</td>
        <td class="ms-admin-td-actions" data-label="Actions">${app.canWrite ? html`<button type="button" class="ms-btn ms-btn--${s.active ? 'ghost' : 'soft'} ms-btn--sm" data-active="${s.user_id}" data-to="${s.active ? '0' : '1'}"><span>${s.active ? 'Deactivate' : 'Reactivate'}</span></button>` : ''}</td>
      </tr>`)}</tbody></table></div>` : html`<div class="ms-card">${emptyState({ icon: 'fa-users-gear', title: 'No staff yet' })}</div>`}

    ${app.canWrite ? html`<form class="ms-card ms-admin-addstaff" data-add novalidate>
      <div class="ms-card__head"><div><div class="ms-card__title">Add a team member</div><div class="ms-card__sub">They need an MSC account first: ask them to sign up and log in once.</div></div></div>
      <div class="ms-form-grid">
        <div class="ms-field"><label class="ms-label" for="st-email"><span class="ms-req">Email</span></label><input class="ms-input" id="st-email" name="email" type="email" inputmode="email" autocomplete="off" required><span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Enter their login email.</span></div>
        <div class="ms-field"><label class="ms-label" for="st-role"><span class="ms-req">Role</span></label><select class="ms-select" id="st-role" name="role"><option value="senior_mentor">Senior mentor</option><option value="admin">Admin</option></select></div>
        <div class="ms-field"><label class="ms-label" for="st-name">Name</label><input class="ms-input" id="st-name" name="name" maxlength="80"></div>
        <div class="ms-field"><label class="ms-label" for="st-wa">WhatsApp</label><div class="ms-input-group"><span class="ms-input-group__addon">+91</span><input class="ms-input" id="st-wa" name="whatsapp" type="tel" inputmode="tel" maxlength="14"></div><span class="ms-error"><i class="fas fa-circle-exclamation" aria-hidden="true"></i>Use a 10-digit Indian mobile number.</span></div>
      </div>
      <div class="ms-card__foot"><span class="ms-grow"></span><button type="submit" class="ms-btn ms-btn--primary"><i class="fas fa-user-plus" aria-hidden="true"></i><span>Add</span></button></div>
    </form>` : ''}
  </div>`);
  if (!app.canWrite) return;

  const root = panel.querySelector('[data-root]');
  const find = (id) => rows.find((s) => s.user_id === id);
  root.querySelectorAll('[data-role]').forEach((sel) => sel.addEventListener('change', async () => {
    const s = find(sel.dataset.role);
    const prev = s.role;
    if (s.user_id === meId && sel.value !== 'admin') {
      const ok = await confirmDialog({ title: 'Change your own role?', message: 'You will lose admin access on this page.', confirmText: 'Change my role', danger: true });
      if (!ok) { sel.value = prev; return; }
    }
    const ok = await upsertStaff(app, { email: s.email, role: sel.value, name: s.name, whatsapp: s.whatsapp, active: s.active }, `${s.name || s.email} is now ${ROLE_LABEL[sel.value].toLowerCase()}.`);
    if (!ok) sel.value = prev;
  }));
  root.querySelectorAll('[data-active]').forEach((b) => b.addEventListener('click', async () => {
    const s = find(b.dataset.active);
    const to = b.dataset.to === '1';
    if (!to) {
      const ok = await confirmDialog({ title: `Deactivate ${s.name || s.email}?`, message: s.user_id === meId ? 'You will lose access to this page.' : 'They lose access to this console. Mentors assigned to them fall back to the escalation contact in Settings.', confirmText: 'Deactivate', danger: true });
      if (!ok) return;
    }
    b.disabled = true;
    const ok = await upsertStaff(app, { email: s.email, role: s.role, name: s.name, whatsapp: s.whatsapp, active: to }, to ? `${s.name || s.email} is active again.` : `${s.name || s.email} is deactivated.`);
    if (!ok) b.disabled = false;
  }));
  const form = root.querySelector('[data-add]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fEmail = form.querySelector('#st-email');
    const fWa = form.querySelector('#st-wa');
    const role = form.querySelector('#st-role').value;
    const email = fEmail.value.trim().toLowerCase();
    const wa = fWa.value.trim();
    let bad = false;
    const mark = (input, on) => { input.closest('.ms-field').classList.toggle('is-invalid', on); if (on) bad = true; };
    mark(fEmail, !EMAIL_RE.test(email));
    mark(fWa, !!wa && !isValidIndianMobile(wa));
    if (bad) return;
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    const ok = await upsertStaff(app, { email, role, name: form.querySelector('#st-name').value.trim(), whatsapp: wa ? normalizePhone(wa) : '', active: true }, `${email} added as ${ROLE_LABEL[role].toLowerCase()}.`);
    btn.disabled = false;
    if (ok) form.reset();
  });
  form.addEventListener('input', (e) => e.target.closest('.ms-field')?.classList.remove('is-invalid'));
}
