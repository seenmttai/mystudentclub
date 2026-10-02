/* =============================================================================
   /mentorship/apply/ : mentor application (5 steps + review), autosaved draft,
   and profile editing after submission. Owner: mentor builder. SPEC §7.
   ========================================================================== */
import {
  initPage, rpc, html, raw, setContent, showError, skeleton, toast, setBusy, qs, isMockMode, getContext,
  uploadFile, photoUrl, signedUrl, STORAGE, UPLOAD_RULES, normalizePhone, isValidIndianMobile, normalizeUrl, isLinkedInUrl,
  STAGES, STAGE_REQUIRED, DOMAINS, FIRM_TYPES, LANGUAGES, CITIES, CALL_SLOTS, WEEKLY_HOURS, EXPERIENCE_YEARS,
  MENTORING_EXPERIENCE, CONFLICTS, HEARD_FROM, MENTEE_CAPACITY, IT_DURATIONS, PROGRAMS, PROGRAM_KEYS, DUTIES,
  POLICY_CONSENTS, REQUIRED_CONSENTS, CODE_OF_CONDUCT, SCENARIO_QUESTION, PATHS, TIERS,
  attemptOptions, monthYearLabel, labelOf, labelsOf, formatDate, timeAgo, fillTemplate, firstName, isProgramEnabled,
  tierOf, stageLabel, statusBadge, track, istDateKey, formatINR, openModal, journeyLines, avatarHtml, loginUrl, getProfilePrefill,
  hasContactDetails, isReviewProfileUrl, isValidPersonName, removeFile, enabledPrograms, programCopy,
} from '/mentorship/assets/mentorship-core.js?v=1';
import {
  backendNotReady, loadError, bindRetry, statusScreen, journeySteps, mentorCardHtml, scrollToEl, local,
  isQualifiedStage, FINAL_STAGES, IT_NOW_STAGES,
} from '/mentorship/mentor/mentor-common.js?v=1';

if (isMockMode()) await import('/mentorship/mentor/mock-status.js?v=1');

const main = document.getElementById('ms-main');
setContent(main, html`<div class="ms-container ms-container--narrow ms-section">${skeleton('page')}</div>`);
const ctx = await initPage({ active: 'apply' });
const config = ctx.config;
const FEE = Number(config.mentor_fee_inr ?? 500);
const CAP = Math.max(1, Math.min(10, Number(config.max_mentees_cap || 10)));

/* ---------------------------------------------------------------------------
   Field model
   ------------------------------------------------------------------------ */
const VIS = {
  public: html`<span class="ms-vis ms-vis--public"><i class="fas fa-eye" aria-hidden="true"></i>Shown on your profile</span>`,
  matched: html`<span class="ms-vis ms-vis--matched"><i class="fas fa-user-check" aria-hidden="true"></i>Shared only with your matched mentees</span>`,
  private: html`<span class="ms-vis ms-vis--private"><i class="fas fa-lock" aria-hidden="true"></i>Only Team MSC sees this</span>`,
};
const NOW_YEAR = new Date().getFullYear();
const yearsRange = (from, to) => { const out = []; for (let y = to; y >= from; y--) out.push(y); return out; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const F = {
  full_name: { step: 1, label: 'Full name (as on ICAI records)', vis: 'public', type: 'text', max: 80, autocomplete: 'name', placeholder: 'e.g. Ananya Iyer' },
  email: { step: 1, label: 'Email', vis: 'matched', type: 'readonly', hint: 'From your MSC login. Mentees you are matched with can see it.' },
  mobile: { step: 1, label: 'Mobile number', vis: 'private', type: 'phone' },
  whatsapp: { step: 1, label: 'WhatsApp number', vis: 'matched', type: 'phone' },
  city: { step: 1, label: 'City', vis: 'public', type: 'city' },
  photo_path: { step: 1, label: 'Profile photo', vis: 'public', type: 'photo' },
  linkedin_url: { step: 1, label: 'LinkedIn profile', vis: 'private', type: 'url', placeholder: 'linkedin.com/in/your-name', hint: 'We use it to check your journey. Turn on the switch to show it on your profile.' },
  show_linkedin: { step: 1, label: 'Show LinkedIn on my profile', type: 'switch' },
  topmate_url: { step: 1, label: 'Topmate or other mentoring profile with reviews', vis: 'public', type: 'url', placeholder: 'topmate.io/your-name', hint: 'Optional, but recommended. Topmate, ADPList, MentorCruise, Superpeer, Unstop or Preplaced. Helps students trust you, and lets us check reviews.' },
  languages: { step: 1, label: 'Languages you can mentor in', vis: 'public', type: 'multi', options: LANGUAGES, max: 6, hint: 'Pick up to 6.' },

  stage: { step: 2, label: 'Where are you today?', vis: 'public', type: 'stage' },
  final_attempt: { step: 2, label: 'CA Final attempt', vis: 'public', type: 'attempt' },
  did_it: { step: 2, label: 'Did you do industrial training?', vis: 'public', type: 'yesno' },
  it_company: { step: 2, label: 'Industrial training company', vis: 'public', type: 'text', max: 80, contact: true, placeholder: 'e.g. Deloitte, Hindustan Unilever' },
  it_domain: { step: 2, label: 'IT domain', vis: 'public', type: 'select', options: DOMAINS },
  it_duration_months: { step: 2, label: 'IT duration', vis: 'public', type: 'select', number: true, options: IT_DURATIONS.map((n) => ({ key: n, label: `${n} months` })) },
  it_start: { step: 2, label: 'IT start month', vis: 'public', type: 'month', years: yearsRange(NOW_YEAR - 5, NOW_YEAR + 1) },
  it_city: { step: 2, label: 'IT city', vis: 'public', type: 'text', max: 40, contact: true, placeholder: 'Optional' },
  articleship_firm: { step: 2, label: 'Articleship firm', vis: 'public', type: 'text', max: 80, contact: true, placeholder: 'e.g. Shah & Co' },
  articleship_firm_type: { step: 2, label: 'Firm type', vis: 'public', type: 'select', options: FIRM_TYPES },
  articleship_domain: { step: 2, label: 'Main articleship domain', vis: 'public', type: 'select', options: DOMAINS },
  articleship_city: { step: 2, label: 'Articleship city', vis: 'public', type: 'text', max: 40, contact: true, placeholder: 'Optional' },
  articleship_year: { step: 2, label: 'Which year of articleship?', vis: 'public', type: 'radio', number: true, options: [{ key: 1, label: '1st year' }, { key: 2, label: '2nd year' }, { key: 3, label: '3rd year' }] },
  qualified_on: { step: 2, label: 'Qualified as CA in', vis: 'public', type: 'month', years: yearsRange(NOW_YEAR - 25, NOW_YEAR), hint: 'Shown as "CA since ..." on your profile.' },
  employer: { step: 2, label: 'Current employer', vis: 'public', type: 'text', max: 80, contact: true, placeholder: 'e.g. Tata Steel' },
  role_title: { step: 2, label: 'Current role', vis: 'public', type: 'text', max: 80, contact: true, placeholder: 'e.g. Finance Analyst' },
  experience_years: { step: 2, label: 'Experience after qualifying', vis: 'public', type: 'select', options: EXPERIENCE_YEARS },
  icai_number: { step: 2, label: 'ICAI registration or membership number', vis: 'private', type: 'text', max: 20, placeholder: 'e.g. WRO0123456', hint: 'Optional. Only used to verify you. Never shown.' },

  scores: { step: 3, label: 'Marks and attempts', vis: 'private', type: 'scores' },
  domains: { step: 3, label: 'Domains you can guide', vis: 'public', type: 'multi', options: DOMAINS, max: 6, hint: 'Pick up to 6. Students filter mentors by these.' },
  companies_known: { step: 3, label: 'Companies you know well or interviewed with', vis: 'public', type: 'tags', max: 15, itemMax: 60, hint: 'Type a name and press Enter or comma. Up to 15.' },
  headline: { step: 3, label: 'Your headline', vis: 'public', type: 'text', max: 90, counter: true, contact: true, placeholder: 'IT in Risk Advisory at Deloitte · Happy to help with Big 4 interviews' },
  bio: { step: 3, label: 'Your story, in your own words', vis: 'public', type: 'textarea', min: 120, max: 800, rows: 6, contact: true,
    hint: 'Write it like you are talking to a junior who is where you were. Your journey, and what you can help with. No phone numbers, emails or links.' },
  wish_i_knew: { step: 3, label: 'One thing you wish someone had told you before IT', vis: 'public', type: 'textarea', max: 200, rows: 2, contact: true, hint: 'Optional. Shown as a quote on your profile.' },

  programs: { step: 4, label: 'Which MSC programs do you want to mentor?', vis: 'public', type: 'programs' },
  max_mentees: { step: 4, label: 'How many mentees can you take per batch?', vis: 'public', type: 'select', number: true },
  weekly_hours: { step: 4, label: 'Hours you can give each week', vis: 'private', type: 'radio', options: WEEKLY_HOURS },
  call_slots: { step: 4, label: 'When can you usually take calls?', vis: 'public', type: 'multi', options: CALL_SLOTS },
  cv_path: { step: 4, label: 'Your CV', vis: 'private', type: 'cv' },
  why_mentor: { step: 4, label: 'Why do you want to mentor CA students?', vis: 'private', type: 'textarea', min: 80, max: 800, rows: 4 },
  scenario_answer: { step: 4, label: 'Scenario', vis: 'private', type: 'textarea', min: 120, max: 900, rows: 6, hint: 'Write it exactly as you would send it on WhatsApp.' },
  mentoring_experience: { step: 4, label: 'Have you guided juniors or article assistants before?', vis: 'private', type: 'radio', options: MENTORING_EXPERIENCE },
  conflicts: { step: 4, label: 'Anything we should know?', vis: 'private', type: 'conflicts', hint: 'This does not disqualify you. It helps us keep things fair.' },
  conflicts_note: { step: 4, label: 'Tell us a little more', vis: 'private', type: 'textarea', max: 300, rows: 3 },
  heard_from: { step: 4, label: 'How did you hear about MSC mentorship?', vis: 'private', type: 'select', options: HEARD_FROM, hint: 'Optional.' },

  accepting: { label: 'Taking new mentees', type: 'switch' },
};

const BASE_REQUIRED = ['full_name', 'mobile', 'whatsapp', 'city', 'photo_path', 'linkedin_url', 'languages', 'stage', 'scores', 'domains', 'headline', 'bio',
  'programs', 'max_mentees', 'weekly_hours', 'call_slots', 'cv_path', 'why_mentor', 'scenario_answer', 'mentoring_experience', 'conflicts'];
const STAGE_FIELDS = ['final_attempt', 'did_it', 'it_company', 'it_domain', 'it_duration_months', 'it_start', 'it_city', 'articleship_year', 'qualified_on', 'employer', 'role_title', 'experience_years'];
const PROFILE_FIELDS = ['photo_path', 'cv_path', 'headline', 'bio', 'wish_i_knew', 'languages', 'city', 'mobile', 'whatsapp', 'linkedin_url', 'show_linkedin',
  'topmate_url', 'domains', 'companies_known', 'call_slots', 'weekly_hours', 'programs', 'accepting', 'max_mentees'];
const ARRAY_FIELDS = ['languages', 'domains', 'companies_known', 'programs', 'call_slots', 'conflicts'];
const PHONE_FIELDS = ['mobile', 'whatsapp'];
const URL_FIELDS = ['linkedin_url', 'topmate_url'];
const SAVE_KEYS = Object.keys(F).filter((k) => !['email'].includes(k));

const STEPS = [
  { n: 1, title: 'About you', short: 'About you', sub: 'The basics students see first, and how we reach you.' },
  { n: 2, title: 'Your CA journey', short: 'Journey', sub: 'This is what students trust most. Be specific.' },
  { n: 3, title: 'Scores and expertise', short: 'Expertise', sub: 'Your marks stay private. Your expertise and story go on your profile.' },
  { n: 4, title: 'Mentoring', short: 'Mentoring', sub: 'Capacity, time, your CV, and a few questions only Team MSC sees.' },
  { n: 5, title: 'Commitments', short: 'Promises', sub: 'These are the promises MSC students count on. Tick each one only if you can keep it.' },
  { n: 6, title: 'Review and submit', short: 'Review', sub: 'Check your card, fix anything missing, then submit.' },
];

const WHEN = {
  final_attempt: () => FINAL_STAGES.includes(S.stage) || S.stage === 'in_articleship',
  did_it: () => isQualifiedStage(S.stage),
  it_company: () => IT_NOW_STAGES.includes(S.stage) || (isQualifiedStage(S.stage) && S.did_it === true),
  it_start: () => IT_NOW_STAGES.includes(S.stage),
  articleship_firm: () => !!S.stage,
  articleship_year: () => S.stage === 'in_articleship',
  qualified_on: () => isQualifiedStage(S.stage),
  experience_years: () => S.stage === 'qualified_experienced',
  icai_number: () => !!S.stage,
  conflicts_note: () => (S.conflicts || []).some((k) => k !== 'none'),
};
WHEN.it_domain = WHEN.it_company; WHEN.it_duration_months = WHEN.it_company;
WHEN.it_city = WHEN.it_start;
WHEN.articleship_firm_type = WHEN.articleship_firm; WHEN.articleship_domain = WHEN.articleship_firm; WHEN.articleship_city = WHEN.articleship_firm;
WHEN.employer = WHEN.qualified_on; WHEN.role_title = WHEN.qualified_on;

const isShown = (k) => !WHEN[k] || WHEN[k]();
function isRequired(k) {
  if (!isShown(k)) return false;
  if (BASE_REQUIRED.includes(k)) return true;
  if (k === 'conflicts_note') return true;
  if (S.stage && (STAGE_REQUIRED[S.stage] || []).includes(k)) return true;
  return isQualifiedStage(S.stage) && S.did_it === true && ['it_company', 'it_domain', 'it_duration_months'].includes(k);
}

/* ---------------------------------------------------------------------------
   State
   ------------------------------------------------------------------------ */
let row = null;            // server row (own full row)
let activeCount = 0;
let mode = 'form';         // form | edit
const S = {};              // working values (display formats for phones)
const dirty = new Set();
let dirtyConsents = {};
const rejected = new Map(); // key -> message from a server invalid_input
const stash = {};          // values of stage fields hidden by a stage change
const ui = { step: 1, cityOther: false, sameWa: true, showAll: false, photoLocal: '', cvLocalName: '', lastSaved: null, saveError: null, prefilled: new Set(), restoreOffer: null };
const draftKey = () => `ms_apply_draft_${ctx.user?.id || 'anon'}`;

const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length);
const toDisplayPhone = (p) => { const d = normalizePhone(p); return d.length === 12 && d.startsWith('91') ? d.slice(2) : String(p || ''); };

function loadState(r, prefill = {}) {
  const src = r || {};
  for (const k of SAVE_KEYS) S[k] = src[k] ?? null;
  for (const k of ARRAY_FIELDS) S[k] = Array.isArray(src[k]) ? [...src[k]] : [];
  S.scores = src.scores && typeof src.scores === 'object' ? JSON.parse(JSON.stringify(src.scores)) : {};
  S.consents = Object.fromEntries(Object.keys(src.consents || {}).filter((k) => src.consents[k]).map((k) => [k, true]));
  S.email = src.email || ctx.email || '';
  S.show_linkedin = !!src.show_linkedin;
  S.accepting = src.accepting !== false;
  S.max_mentees = src.max_mentees ?? 5;
  if (!r) S.programs = ['industrial-training'];
  S.mobile = toDisplayPhone(S.mobile);
  S.whatsapp = toDisplayPhone(S.whatsapp);
  if (!r) {
    // New applicant: prefill from the MSC profile; saved with the first real change.
    if (!S.full_name && (ctx.name || prefill.name)) { S.full_name = (prefill.name || ctx.name || '').slice(0, 80); ui.prefilled.add('full_name'); }
    if (prefill.phone && isValidIndianMobile(prefill.phone)) {
      S.mobile = toDisplayPhone(prefill.phone); S.whatsapp = S.mobile; ui.prefilled.add('mobile'); ui.prefilled.add('whatsapp');
    }
    if (prefill.city) {
      const c = CITIES.find((x) => x.label.toLowerCase() === String(prefill.city).trim().toLowerCase());
      S.city = c ? c.key : String(prefill.city).trim().slice(0, 40);
      ui.prefilled.add('city');
    }
  }
  ui.sameWa = !S.whatsapp || S.whatsapp === S.mobile;
  ui.cityOther = !!S.city && !CITIES.some((c) => c.key === S.city && c.key !== 'other');
}

/* ---------------------------------------------------------------------------
   Validation
   ------------------------------------------------------------------------ */
// Same rule as the server (SQL mentorship_has_contact): numbers split by spaces count too, and so do group links.
const hasContact = (s) => hasContactDetails(s);
const CONTACT_COPY = 'Please remove phone numbers, emails and links. Students get your contact details only after they pick you.';
const num = (v) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

/** Format problems that would stop a value saving. '' when fine (empty is fine here). */
function formatError(k) {
  const v = S[k];
  if (k === 'full_name') return v && !isValidPersonName(v) ? 'Use letters only, as on your ICAI records (no numbers, emails or links).' : '';
  if (PHONE_FIELDS.includes(k)) return v && !isValidIndianMobile(v) ? 'Enter a 10-digit Indian mobile number.' : '';
  if (k === 'linkedin_url') return v && !isLinkedInUrl(v) ? 'Paste your profile link, like linkedin.com/in/your-name.' : '';
  if (k === 'topmate_url') {
    if (!v) return '';
    const u = normalizeUrl(v);
    if (!u || !u.startsWith('https://') || !/\.[a-z]{2,}/i.test(u)) return 'Paste the full https:// link to your profile.';
    return isReviewProfileUrl(u) ? '' : 'Use your Topmate profile link (topmate.io/your-name). ADPList, MentorCruise, Superpeer, Unstop and Preplaced links work too.';
  }
  if (k === 'city') {
    if (ui.cityOther && String(v || '').length > 40) return 'Keep it under 40 characters.';
    return ui.cityOther && hasContact(v) ? CONTACT_COPY : '';
  }
  if (k === 'companies_known') return (Array.isArray(v) ? v : []).some(hasContact) ? CONTACT_COPY : '';
  if (F[k]?.contact && hasContact(v)) return CONTACT_COPY;
  if (k === 'scores') return scoresFormatError();
  return '';
}
function scoresFormatError() {
  const s = S.scores || {};
  for (const part of ['foundation', 'inter', 'final']) {
    const p = s[part];
    if (!p || p.exempt) continue;
    if (num(p.marks) && (Number(p.marks) < 0 || !Number.isInteger(Number(p.marks)))) return 'Marks should be a whole number.';
    if (num(p.marks) && num(p.out_of) && Number(p.marks) > Number(p.out_of)) return `${labelPart(part)} marks cannot be more than ${p.out_of}.`;
  }
  return '';
}
const labelPart = (p) => ({ foundation: 'CA Foundation', inter: 'CA Inter', final: 'CA Final' }[p]);

/** Requirement problems (shown in review and after a submit attempt). */
function requirementError(k) {
  if (!isRequired(k)) return '';
  const v = S[k];
  const f = F[k] || {};
  if (k === 'scores') {
    const m = scoresMissing();
    return m.length ? `Add ${m.map((x) => x.label).join(', ')}.` : '';
  }
  if (isEmpty(v)) return f.type === 'multi' || f.type === 'programs' || f.type === 'conflicts' ? 'Pick at least one.' : 'This is required.';
  if (f.min && String(v).length < f.min) return `Write at least ${f.min} characters (${f.min - String(v).length} more).`;
  return '';
}
function scoresMissing() {
  const s = S.scores || {};
  const out = [];
  const need = (part) => {
    const p = s[part] || {};
    if (!(num(p.marks) && num(p.out_of) && num(p.attempts))) out.push({ key: `scores.${part}`, step: 3, label: `${labelPart(part)} marks` });
  };
  if (!s.foundation?.exempt) need('foundation');
  need('inter');
  if (isQualifiedStage(S.stage)) need('final');
  return out;
}

const FIELD_ORDER = Object.keys(F).filter((k) => F[k].step);
/** Everything that blocks submit: [{key, step, label, why}] in form order. */
function missingList() {
  const out = [];
  for (const k of FIELD_ORDER) {
    if (!isShown(k) || k === 'email') continue;
    const fe = isEmpty(S[k]) && k !== 'scores' ? '' : formatError(k);
    const re = requirementError(k);
    const why = fe || re || (rejected.has(k) ? rejected.get(k) : '');
    if (why) out.push({ key: k, step: F[k].step, label: k === 'scenario_answer' ? 'Scenario answer' : F[k].label, why });
  }
  const notTicked = REQUIRED_CONSENTS.filter((c) => !S.consents[c]);
  if (notTicked.length) out.push({ key: 'consents', step: 5, label: 'Commitments', why: `${notTicked.length} of ${REQUIRED_CONSENTS.length} not ticked yet.` });
  return out;
}
const stepMissing = (n) => missingList().filter((m) => m.step === n);

/* ---------------------------------------------------------------------------
   Server values
   ------------------------------------------------------------------------ */
function toServer(k) {
  const v = S[k];
  if (PHONE_FIELDS.includes(k)) return v ? normalizePhone(v) : null;
  if (URL_FIELDS.includes(k)) return v ? normalizeUrl(v) : null;
  if (ARRAY_FIELDS.includes(k)) return Array.isArray(v) ? v : [];
  if (k === 'scores') return cleanScores(S.scores);
  if (['show_linkedin', 'accepting'].includes(k)) return !!v;
  if (k === 'did_it') return v === true || v === false ? v : null;
  if (F[k]?.number || ['max_mentees', 'it_duration_months', 'articleship_year'].includes(k)) return num(v) ? Number(v) : null;
  if (typeof v === 'string') { const t = v.trim(); return t === '' ? null : t; }
  return v ?? null;
}
function cleanScores(s = {}) {
  const part = (p, withExempt) => {
    const x = s[p] || {};
    const o = { marks: num(x.marks) ? Number(x.marks) : null, out_of: num(x.out_of) ? Number(x.out_of) : null, attempts: num(x.attempts) ? Number(x.attempts) : null };
    if (withExempt) o.exempt = !!x.exempt;
    return o;
  };
  const out = { foundation: part('foundation', true), inter: part('inter'), rank_note: String(s.rank_note || '').trim().slice(0, 120) };
  out.final = isQualifiedStage(S.stage) || (s.final && num(s.final.marks)) ? part('final') : null;
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ---------------------------------------------------------------------------
   Autosave (draft): debounced 1.2 s, on blur, on step change, on hide.
   Fields the server refuses (invalid_input + hint) are dropped and kept locally.
   ------------------------------------------------------------------------ */
let saveTimer = null;
let saving = null;
let saveAgain = false;
let retryTimer = null;

function markDirty(k) {
  dirty.add(k);
  rejected.delete(k);
  backupSoon();
  if (mode === 'form') { scheduleSave(); renderSaveState(); } else renderEditBar();
}
function scheduleSave(ms = 1200) {
  if (mode !== 'form') return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, ms);
}
function flushSave() {
  clearTimeout(saveTimer);
  if (saving) { saveAgain = true; return saving; }
  saving = doSave().finally(() => {
    saving = null;
    if (saveStateMode === 'saving') saveStateMode = 'idle';
    renderSaveState();
    if (saveAgain) { saveAgain = false; flushSave(); }
  });
  return saving;
}
async function settle() {
  await flushSave();
  while (saving) await saving; // eslint-disable-line no-await-in-loop
}

function buildPatch(keys) {
  const patch = {};
  for (const k of keys) {
    if (rejected.has(k)) continue;
    if (formatError(k)) continue; // keep it local until it is valid
    patch[k] = toServer(k);
  }
  return patch;
}

async function doSave({ keys = [...dirty], explicit = false } = {}) {
  if (!explicit && ui.prefilled.size && (keys.length || Object.keys(dirtyConsents).length)) {
    ui.prefilled.forEach((k) => dirty.add(k));
    keys = [...new Set([...keys, ...ui.prefilled])];
    ui.prefilled.clear();
  }
  const patch = buildPatch(keys);
  const consents = explicit ? null : (Object.keys(dirtyConsents).length ? { ...dirtyConsents } : null);
  if (consents) patch.consents = consents;
  if (!Object.keys(patch).length) { renderSaveState(); return { ok: true, empty: true, refused: [] }; }
  setSaveState('saving');
  const refused = []; // fields the server turned down in this save (they stay dirty and local)
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const out = await rpc('mentorship_save_mentor', { p_patch: patch }); // eslint-disable-line no-await-in-loop
      const created = !row;
      if (out && typeof out === 'object') row = out;
      for (const k of Object.keys(patch)) {
        if (k === 'consents') continue;
        if (same(patch[k], toServer(k))) dirty.delete(k);
      }
      if (consents) {
        for (const [ck, cv] of Object.entries(consents)) if (dirtyConsents[ck] === cv) delete dirtyConsents[ck];
        // Confirm only the keys this save sent (the server stamps true and removes false).
        if (row?.consents) for (const ck of Object.keys(consents)) if (!(ck in dirtyConsents)) S.consents[ck] = !!row.consents[ck];
      }
      ui.lastSaved = Date.now();
      ui.saveError = null;
      saveStateMode = 'idle';
      if (created) getContext({ force: true });
      backupNow();
      renderSaveState();
      refreshStepper();
      return { ok: true, refused };
    } catch (e) {
      const k = e.code === 'invalid_input' && e.hint ? hintKey(e.hint, patch) : null;
      if (k) {
        delete patch[k];
        refused.push(k);
        rejected.set(k, rejectCopy(k, e.hint));
        showFieldError(k);
        if (Object.keys(patch).length) continue;
        saveStateMode = 'idle';
        renderSaveState();
        return { ok: false, rejected: k, refused };
      }
      ui.saveError = e;
      backupNow();
      setSaveState('error');
      if (!explicit && (e.code === 'network' || e.code === 'unknown')) {
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => { if (dirty.size || Object.keys(dirtyConsents).length) flushSave(); }, 15000);
      }
      if (explicit) throw e;
      return { ok: false, error: e, refused };
    }
  }
  return { ok: false, refused };
}
function hintKey(hint, patch) {
  const h = String(hint);
  const keys = Object.keys(patch).sort((a, b) => b.length - a.length);
  return keys.find((k) => h === k || h.startsWith(`${k}.`) || h.startsWith(`${k}_`) || h.startsWith(`${k}:`) || h.startsWith(`${k} `))
    || (h.startsWith('consents') && patch.consents ? 'consents' : null);
}
function rejectCopy(k, hint) {
  if (k === 'max_mentees' || /below_active/.test(hint)) return `You have ${activeCount} active ${activeCount === 1 ? 'mentee' : 'mentees'}, so pick ${activeCount} or more.`;
  return mode === 'form' ? 'This did not save yet. Check it against the rules here; we keep it on this device meanwhile.' : 'This does not look right. Please check it.';
}

/* local backup (offered back if the server save fails) */
let backupTimer = null;
function backupSoon() { clearTimeout(backupTimer); backupTimer = setTimeout(backupNow, 400); }
function backupNow() {
  if (mode !== 'form') return;
  const keys = [...dirty];
  if (!keys.length && !Object.keys(dirtyConsents).length) { local.del(draftKey()); return; }
  const values = {};
  keys.forEach((k) => { values[k] = S[k]; });
  local.set(draftKey(), { at: Date.now(), values, consents: dirtyConsents, ui: { cityOther: ui.cityOther, sameWa: ui.sameWa } });
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && mode === 'form' && (dirty.size || Object.keys(dirtyConsents).length)) flushSave(); });
window.addEventListener('online', () => { if (mode === 'form' && (dirty.size || Object.keys(dirtyConsents).length)) flushSave(); });

/* save-state indicator */
let saveStateMode = 'idle';
function setSaveState(m) { saveStateMode = m; renderSaveState(); }
function renderSaveState() {
  const el = main.querySelector('[data-savestate]');
  if (!el) return;
  const pending = [...dirty].filter((k) => !rejected.has(k) && !formatError(k)).length + Object.keys(dirtyConsents).length;
  const localOnly = [...dirty].filter((k) => rejected.has(k) || formatError(k)).length;
  el.classList.remove('is-saving', 'is-error');
  if (saveStateMode === 'saving') { el.classList.add('is-saving'); el.textContent = 'Saving...'; return; }
  if (saveStateMode === 'error' && ui.saveError) { el.classList.add('is-error'); el.textContent = ui.saveError.code === 'network' ? 'Offline. Kept on this device' : 'Not saved. Kept on this device'; return; }
  if (pending) { el.classList.add('is-saving'); el.textContent = 'Saving soon...'; return; }
  if (localOnly) { el.classList.add('is-error'); el.textContent = `${localOnly} ${localOnly === 1 ? 'field needs' : 'fields need'} a fix`; return; }
  el.textContent = ui.lastSaved ? `Saved ${timeAgo(ui.lastSaved)}` : (row ? 'Draft saved' : 'Saves as you go');
}
setInterval(() => { if (saveStateMode !== 'saving') renderSaveState(); }, 30000);

/* ---------------------------------------------------------------------------
   Field rendering
   ------------------------------------------------------------------------ */
const sel = (cond) => (cond ? raw('selected') : '');
const chk = (cond) => (cond ? raw('checked') : '');
const hid = (cond) => (cond ? raw('hidden') : '');

function labelHtml(k, { group = false, text } = {}) {
  const f = F[k];
  const req = isRequired(k);
  const inner = html`<span class="${req ? 'ms-req' : ''}" data-reqlabel="${k}">${text || f.label}</span>`;
  return group ? html`<span class="ms-label" id="l-${k}">${inner}</span>` : html`<label class="ms-label" for="f-${k}">${inner}</label>`;
}
function errorHtml(k) {
  return html`<span class="ms-error" data-error="${k}" role="alert"><i class="fas fa-circle-exclamation" aria-hidden="true"></i><span></span></span>`;
}
function wrap(k, control, { group = false, span2 = false, hint, after = '', labelText } = {}) {
  const f = F[k];
  const h = hint ?? f.hint;
  return html`<div class="ms-field${span2 ? ' ms-span-2' : ''}" data-wrap="${k}" ${hid(!isShown(k))}>
    ${labelHtml(k, { group, text: labelText })}
    ${control}
    ${after}
    ${metaHtml(f.vis, h)}
    ${errorHtml(k)}
  </div>`;
}
/** Visibility tag + hint under the control (keeps labels one line so 2-column rows line up). */
function metaHtml(vis, hint) {
  if (!vis && !hint) return '';
  return html`<div class="ms-apply-meta">${vis ? VIS[vis] : ''}${hint ? html`<span class="ms-hint">${hint}</span>` : ''}</div>`;
}
function counterHtml(k) {
  return html`<span class="ms-counter" data-counter="${k}">${counterText(k)}</span>`;
}
function counterText(k) {
  const f = F[k];
  const n = String(S[k] || '').length;
  if (f.min && n < f.min) return `${n} / ${f.max} · ${f.min - n} more to go`;
  return `${n} / ${f.max}`;
}

function textControl(k) {
  const f = F[k];
  return html`<input class="ms-input" id="f-${k}" type="text" data-field="${k}" value="${S[k] ?? ''}" maxlength="${f.max || 200}"
    ${f.placeholder ? html`placeholder="${f.placeholder}"` : ''} autocomplete="${f.autocomplete || 'off'}">`;
}
function textareaControl(k) {
  const f = F[k];
  return html`<textarea class="ms-textarea" id="f-${k}" data-field="${k}" rows="${f.rows || 4}" maxlength="${f.max}"
    ${f.placeholder ? html`placeholder="${f.placeholder}"` : ''}>${S[k] ?? ''}</textarea>`;
}
function phoneControl(k) {
  return html`<div class="ms-input-group"><span class="ms-input-group__addon">+91</span>
    <input class="ms-input" id="f-${k}" type="tel" inputmode="numeric" autocomplete="${k === 'mobile' ? 'tel-national' : 'off'}" maxlength="14"
      placeholder="98765 43210" data-field="${k}" value="${S[k] ?? ''}" ${k === 'whatsapp' && ui.sameWa ? raw('readonly') : ''}></div>`;
}
function selectControl(k, options, placeholder = 'Select') {
  const v = S[k];
  return html`<select class="ms-select" id="f-${k}" data-field="${k}">
    <option value="">${placeholder}</option>
    ${options.map((o) => html`<option value="${o.key}" ${sel(String(o.key) === String(v ?? ''))}>${o.label}</option>`)}
  </select>`;
}
function chipsControl(k, options, type = 'checkbox') {
  const v = S[k];
  const isSel = (key) => (type === 'checkbox' ? (v || []).map(String).includes(String(key)) : String(v ?? '') === String(key));
  return html`<div class="ms-choices" role="${type === 'radio' ? 'radiogroup' : 'group'}" aria-labelledby="l-${k}" data-field="${k}">
    ${options.map((o) => html`<label class="ms-choice"><input type="${type}" name="c-${k}" value="${o.key}" ${chk(isSel(o.key))}><span>${o.label}</span></label>`)}
  </div>`;
}
function monthControl(k) {
  const f = F[k];
  const m = /^(\d{4})-(\d{2})$/.exec(String(S[k] || ''));
  const yy = m ? Number(m[1]) : '';
  const mm = m ? m[2] : '';
  const years = f.years.includes(yy) || !yy ? f.years : [yy, ...f.years];
  return html`<div class="ms-apply-month" data-field="${k}" role="group" aria-labelledby="l-${k}">
    <select class="ms-select" data-part="month" aria-label="Month"><option value="">Month</option>
      ${MONTHS.map((name, i) => { const v = String(i + 1).padStart(2, '0'); return html`<option value="${v}" ${sel(v === mm)}>${name}</option>`; })}</select>
    <select class="ms-select" data-part="year" aria-label="Year"><option value="">Year</option>
      ${years.map((y) => html`<option value="${y}" ${sel(y === yy)}>${y}</option>`)}</select>
  </div>`;
}
function attemptControl(k) {
  const opts = attemptOptions({ from: NOW_YEAR - 3, to: NOW_YEAR + 3 });
  if (S[k] && !opts.some((o) => o.key === S[k])) opts.unshift({ key: S[k], label: monthYearLabel(S[k]) });
  return selectControl(k, opts, 'Select attempt');
}
function cityControl() {
  const v = S.city;
  const key = ui.cityOther ? 'other' : (v || '');
  return html`<select class="ms-select" id="f-city" data-field="city" data-part="select" autocomplete="off">
      <option value="">Select your city</option>
      ${CITIES.map((c) => html`<option value="${c.key}" ${sel(c.key === key)}>${c.label}</option>`)}
    </select>
    <input class="ms-input ms-mt-8" type="text" data-field="city" data-part="other" maxlength="40" placeholder="Type your city" aria-label="Your city"
      value="${ui.cityOther ? v || '' : ''}" ${hid(!ui.cityOther)}>`;
}
function stageControl() {
  return html`<div class="ms-options ms-options--2" role="radiogroup" aria-labelledby="l-stage" data-field="stage">
    ${STAGES.map((s) => {
      const tier = TIERS.find((t) => t.key === s.tier);
      return html`<label class="ms-option"><input type="radio" name="c-stage" value="${s.key}" ${chk(S.stage === s.key)}>
        <span class="ms-option__mark"></span><span class="ms-option__body"><span class="ms-option__title">${s.label}</span>
        <span class="ms-option__desc">You would mentor as a ${tier?.label || 'mentor'}</span></span></label>`;
    })}
  </div>`;
}
function yesNoControl(k) {
  const v = S[k];
  return html`<div class="ms-choices" role="radiogroup" aria-labelledby="l-${k}" data-field="${k}">
    <label class="ms-choice"><input type="radio" name="c-${k}" value="yes" ${chk(v === true)}><span>Yes</span></label>
    <label class="ms-choice"><input type="radio" name="c-${k}" value="no" ${chk(v === false)}><span>No</span></label>
  </div>`;
}
function photoControl() {
  const src = ui.photoLocal || photoUrl(S.photo_path);
  const name = S.full_name || ctx.name || '';
  return html`<div class="ms-photo-pick ms-apply-photo" data-field="photo_path">
    <span class="ms-apply-photo__preview" data-photo-preview>${src ? html`<img src="${src}" alt="Your profile photo">` : avatarHtml({ name, size: 'xl' })}</span>
    <div class="ms-stack" style="--ms-gap:6px">
      <label class="ms-btn ms-btn--secondary ms-btn--sm ms-apply-filebtn">
        <input type="file" accept="${UPLOAD_RULES.photo.accept}" data-upload="photo" class="ms-apply-fileinput">
        <i class="fas fa-camera" aria-hidden="true"></i><span>${S.photo_path ? 'Change photo' : 'Upload photo'}</span>
      </label>
      <span class="ms-hint">A clear, smiling, passport-style photo. No logos or group photos.</span>
      <span class="ms-hint">${UPLOAD_RULES.photo.label}. We resize it for you.</span>
    </div>
  </div>`;
}
function cvControl() {
  if (S.cv_path) {
    const ts = Number((/cv-(\d+)\./.exec(S.cv_path) || [])[1]);
    const when = ts > 1e12 ? `Uploaded ${formatDate(ts)}` : 'Uploaded';
    return html`<div class="ms-file" data-field="cv_path">
      <span class="ms-file__icon"><i class="fas fa-file-pdf" aria-hidden="true"></i></span>
      <span class="ms-grow ms-stack" style="--ms-gap:0"><span class="ms-file__name ms-truncate">${ui.cvLocalName || 'Your CV (PDF)'}</span><span class="ms-xs ms-muted">${when}</span></span>
      <button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-action="view-cv"><i class="fas fa-eye" aria-hidden="true"></i><span>View</span></button>
      <label class="ms-btn ms-btn--outline ms-btn--sm ms-apply-filebtn"><input type="file" accept="${UPLOAD_RULES.cv.accept}" data-upload="cv" class="ms-apply-fileinput"><span>Replace</span></label>
    </div>`;
  }
  return html`<label class="ms-upload" data-field="cv_path" data-drop>
    <input type="file" accept="${UPLOAD_RULES.cv.accept}" data-upload="cv" aria-label="Upload your CV">
    <span class="ms-upload__icon"><i class="fas fa-file-arrow-up" aria-hidden="true"></i></span>
    <span class="ms-upload__title">Upload your CV</span>
    <span class="ms-upload__hint">${UPLOAD_RULES.cv.label}. Tap to choose, or drop it here.</span>
  </label>`;
}
function tagsControl(k) {
  const f = F[k];
  const items = S[k] || [];
  const quick = ['Deloitte', 'EY', 'KPMG', 'PwC', 'Grant Thornton', 'BDO India'].filter((c) => !items.some((i) => i.toLowerCase() === c.toLowerCase()));
  return html`<div class="ms-apply-tags" data-field="${k}" data-tags>
      ${items.map((t, i) => html`<span class="ms-apply-tag">${t}<button type="button" data-tag-remove="${i}" aria-label="Remove ${t}"><i class="fas fa-xmark" aria-hidden="true"></i></button></span>`)}
      <input class="ms-apply-tags__input" id="f-${k}" type="text" maxlength="${f.itemMax}" data-tag-input
        placeholder="${items.length ? 'Add another' : 'e.g. Deloitte, ITC, Avendus'}" ${items.length >= f.max ? raw('disabled') : ''} enterkeyhint="enter">
    </div>
    ${quick.length && items.length < f.max ? html`<div class="ms-apply-quick"><span class="ms-xs ms-muted">Quick add:</span>
      ${quick.map((c) => html`<button type="button" class="ms-chip ms-tone-outline ms-apply-quick__btn" data-tag-add="${c}"><i class="fas fa-plus" aria-hidden="true"></i>${c}</button>`)}</div>` : ''}`;
}
function scoresControl() {
  const s = S.scores || {};
  const p = (part) => s[part] || {};
  const attempts = (part) => html`<select class="ms-select" data-sub="${part}.attempts" aria-label="${labelPart(part)} attempts">
      <option value="">Attempts</option>${[1, 2, 3, 4, 5, 6].map((n) => html`<option value="${n}" ${sel(String(p(part).attempts ?? '') === String(n))}>${n === 1 ? '1st attempt' : `${n} attempts`}</option>`)}</select>`;
  const outOf = (part, opts, dflt = '') => html`<select class="ms-select" data-sub="${part}.out_of" aria-label="${labelPart(part)} total marks">
      <option value="">Out of</option>${opts.map((o) => html`<option value="${o.v}" ${sel(String(p(part).out_of ?? dflt) === String(o.v))}>${o.l}</option>`)}</select>`;
  const marks = (part) => html`<input class="ms-input" type="number" inputmode="numeric" min="0" max="800" step="1" placeholder="Marks" data-sub="${part}.marks" value="${p(part).marks ?? ''}" aria-label="${labelPart(part)} marks">`;
  const exempt = !!p('foundation').exempt;
  const block = (part, opts, extra = '') => html`<div class="ms-apply-score" data-part="${part}" ${part === 'final' ? hid(!isQualifiedStage(S.stage)) : ''}>
      <div class="ms-apply-score__head"><span class="ms-strong">${labelPart(part)}</span>${extra}</div>
      <div class="ms-apply-score__grid ${part === 'foundation' && exempt ? 'is-off' : ''}">${marks(part)}${outOf(part, opts, part === 'foundation' ? 400 : '')}${attempts(part)}</div>
    </div>`;
  return html`<div class="ms-apply-scores" data-field="scores" role="group" aria-labelledby="l-scores">
    ${block('foundation', [{ v: 400, l: 'out of 400' }, { v: 200, l: 'out of 200 (old CPT)' }], html`<label class="ms-check ms-check--plain ms-apply-exempt"><input type="checkbox" data-sub="foundation.exempt" ${chk(exempt)}><span class="ms-check__box"></span><span class="ms-check__text ms-small">Direct entry (no Foundation)</span></label>`)}
    ${block('inter', [{ v: 600, l: 'out of 600 (new scheme)' }, { v: 800, l: 'out of 800 (old scheme)' }])}
    ${block('final', [{ v: 600, l: 'out of 600 (new scheme)' }, { v: 800, l: 'out of 800 (old scheme)' }])}
    <div class="ms-field"><label class="ms-label" for="f-rank_note">Ranks or exemptions <span class="ms-muted ms-xs">(optional)</span></label>
      <input class="ms-input" id="f-rank_note" type="text" maxlength="120" data-sub="rank_note" value="${s.rank_note || ''}" placeholder="e.g. AIR 32 in Inter, exemption in Audit"></div>
  </div>`;
}
function programsControl() {
  const v = S.programs || [];
  return html`<div class="ms-options" role="group" aria-labelledby="l-programs" data-field="programs">
    ${PROGRAM_KEYS.map((k) => {
      const p = PROGRAMS[k];
      const on = isProgramEnabled(config, k);
      return html`<label class="ms-option"><input type="checkbox" value="${k}" ${chk(v.includes(k))}>
        <span class="ms-option__mark"></span><span class="ms-option__body">
          <span class="ms-option__title">${p.name} ${on ? '' : html`<span class="ms-soon-pill">Launching later</span>`}</span>
          <span class="ms-option__desc">${{ 'industrial-training': 'Students hunting for industrial training. Mentorship starts here.', articleship: 'Students choosing and applying for articleship.', 'ca-fresher': 'Newly qualified CAs looking for their first role.' }[k]}</span>
        </span></label>`;
    })}
  </div>`;
}
function conflictsControl() {
  const v = S.conflicts || [];
  return html`<div class="ms-options" role="group" aria-labelledby="l-conflicts" data-field="conflicts">
    ${CONFLICTS.map((c) => html`<label class="ms-option ms-apply-option--compact"><input type="checkbox" value="${c.key}" ${chk(v.includes(c.key))}>
      <span class="ms-option__mark"></span><span class="ms-option__body"><span class="ms-option__title">${c.label}</span></span></label>`)}
  </div>`;
}
function capacityOptions() {
  const min = mode === 'edit' ? Math.max(1, activeCount) : 1;
  return MENTEE_CAPACITY.filter((n) => n >= min && n <= CAP).map((n) => ({ key: n, label: `${n} ${n === 1 ? 'mentee' : 'mentees'}` }));
}

/** One field, by key. */
function field(k, opts = {}) {
  const f = F[k];
  switch (f.type) {
    case 'text': {
      const after = f.counter ? html`<div class="ms-row ms-end">${counterHtml(k)}</div>` : '';
      return wrap(k, textControl(k), { ...opts, after });
    }
    case 'readonly':
      return html`<div class="ms-field" data-wrap="${k}">${labelHtml(k)}<input class="ms-input" id="f-${k}" type="email" value="${S[k] || ''}" readonly>${metaHtml(f.vis, f.hint)}</div>`;
    case 'phone': {
      const after = k === 'whatsapp' ? html`<label class="ms-check ms-check--plain"><input type="checkbox" data-same-wa ${chk(ui.sameWa)}><span class="ms-check__box"></span><span class="ms-check__text ms-small">Same as my mobile number</span></label>` : '';
      return wrap(k, phoneControl(k), { ...opts, after });
    }
    case 'city': return wrap(k, cityControl(), opts);
    case 'url': {
      const after = k === 'linkedin_url' ? html`<label class="ms-switch ms-mt-8"><input type="checkbox" data-field="show_linkedin" ${chk(S.show_linkedin)}><span class="ms-switch__track"></span><span>Show LinkedIn on my profile</span></label>` : '';
      return wrap(k, html`<input class="ms-input" id="f-${k}" type="url" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck="false" data-field="${k}" value="${S[k] || ''}" placeholder="${f.placeholder}">`, { ...opts, after });
    }
    case 'multi': {
      const after = f.max ? html`<span class="ms-counter" data-counter="${k}" style="text-align:left">${(S[k] || []).length} of ${f.max} picked</span>` : '';
      return wrap(k, chipsControl(k, f.options), { ...opts, group: true, after, span2: true });
    }
    case 'radio': return wrap(k, chipsControl(k, f.options, 'radio'), { ...opts, group: true, span2: true });
    case 'yesno': return wrap(k, yesNoControl(k), { ...opts, group: true });
    case 'select': return wrap(k, selectControl(k, k === 'max_mentees' ? capacityOptions() : f.options), opts);
    case 'attempt': return wrap(k, attemptControl(k), { ...opts, labelText: S.stage === 'in_articleship' ? 'Planned CA Final attempt' : f.label });
    case 'month': return wrap(k, monthControl(k), { ...opts, group: true });
    case 'stage': return wrap(k, stageControl(), { ...opts, group: true, span2: true });
    case 'photo': return wrap(k, photoControl(), { ...opts, group: true, span2: true });
    case 'cv': return wrap(k, cvControl(), { ...opts, group: true, span2: true });
    case 'tags': return wrap(k, tagsControl(k), { ...opts, span2: true });
    case 'scores': return wrap(k, scoresControl(), { ...opts, group: true, span2: true, hint: 'Approximate is fine if you do not remember exactly.' });
    case 'textarea': {
      const after = html`<div class="ms-row ms-end">${counterHtml(k)}</div>`;
      return wrap(k, textareaControl(k), { ...opts, after, span2: true });
    }
    case 'programs': return wrap(k, programsControl(), { ...opts, group: true, span2: true });
    case 'conflicts': return wrap(k, conflictsControl(), { ...opts, group: true, span2: true });
    default: return '';
  }
}
const section = (title, body, { icon, sub } = {}) => html`<div class="ms-form-section">
  ${title ? html`<div class="ms-form-section__title">${icon ? html`<i class="fas ${icon} ms-apply-secicon" aria-hidden="true"></i>` : ''}${title}</div>` : ''}
  ${sub ? html`<p class="ms-hint ms-apply-secsub">${sub}</p>` : ''}
  ${body}</div>`;
const grid = (...fields) => html`<div class="ms-form-grid">${fields}</div>`;

/* ---------------------------------------------------------------------------
   Steps
   ------------------------------------------------------------------------ */
function step1() {
  return html`
    ${section('Basics', grid(field('full_name', { span2: true }), field('email', { span2: true }), field('mobile'), field('whatsapp'), field('city')), { icon: 'fa-id-card' })}
    ${section('Photo', field('photo_path'), { icon: 'fa-camera', sub: 'Profiles with a real photo get picked far more often.' })}
    ${section('Links', grid(field('linkedin_url', { span2: true }), field('topmate_url', { span2: true })), { icon: 'fa-link' })}
    ${section('Languages', field('languages'), { icon: 'fa-language' })}`;
}
function step2() {
  return html`
    ${section('', field('stage'))}
    <div class="ms-form-grid">${field('final_attempt')}${field('did_it')}</div>
    <div data-group="it" ${hid(!isShown('it_company'))}>${section('Industrial training', grid(field('it_company', { span2: true }), field('it_domain'), field('it_duration_months'), field('it_start'), field('it_city')), { icon: 'fa-building' })}</div>
    <div data-group="art" ${hid(!isShown('articleship_firm'))}>${section('Articleship', grid(field('articleship_firm', { span2: true }), field('articleship_firm_type'), field('articleship_domain'), field('articleship_city'), field('articleship_year')), { icon: 'fa-briefcase' })}</div>
    <div data-group="now" ${hid(!isShown('qualified_on'))}>${section('Now', grid(field('qualified_on'), field('experience_years'), field('employer'), field('role_title')), { icon: 'fa-user-tie' })}</div>
    <div data-group="icai" ${hid(!isShown('icai_number'))}>${section('Verification', grid(field('icai_number', { span2: true })), { icon: 'fa-shield-halved' })}</div>
    ${S.stage ? '' : html`<div class="ms-callout ms-callout--gray" data-group="nostage"><i class="fas fa-hand-pointer" aria-hidden="true"></i><div>Pick your stage and we will show only the questions that fit you.</div></div>`}`;
}
function step3() {
  return html`
    ${section('Your CA scores', field('scores'), { icon: 'fa-chart-simple' })}
    ${section('What you can help with', html`${field('domains')}${field('companies_known')}`, { icon: 'fa-compass' })}
    ${section('Your profile', html`${field('headline')}${field('bio')}${field('wish_i_knew')}`, { icon: 'fa-pen-nib', sub: 'Students read this before they pick you. Warm and specific beats formal.' })}`;
}
function step4() {
  const earn = html`<div class="ms-apply-earn"><i class="fas fa-indian-rupee-sign" aria-hidden="true"></i><span>You earn <strong>${formatINR(FEE)} per mentee</strong>, paid by Team MSC.</span></div>`;
  return html`
    ${section('Mentoring', html`${field('programs')}<div class="ms-apply-narrow">${field('max_mentees', { hint: 'Most mentors take 5 to 8. Each mentee needs a weekly call.' })}</div>${earn}${field('weekly_hours')}${field('call_slots')}`, { icon: 'fa-people-group' })}
    ${section('Your CV', field('cv_path'), { icon: 'fa-file-lines', sub: 'Team MSC uses it to understand your experience. Never shown to students.' })}
    ${section('A few questions just for Team MSC', html`
      ${field('why_mentor')}
      <div class="ms-apply-scenario"><span class="ms-apply-scenario__tag"><i class="fas fa-comment-dots" aria-hidden="true"></i>Scenario</span><p>${SCENARIO_QUESTION}</p></div>
      ${field('scenario_answer', { labelText: 'Your WhatsApp message back' })}
      ${field('mentoring_experience')}
      ${field('conflicts')}
      ${field('conflicts_note')}
      ${grid(field('heard_from'))}`, { icon: 'fa-lock', sub: 'Private. These help us understand how you would mentor.' })}`;
}

const DUTY_GROUPS = [
  { title: 'Responding', icon: 'fa-reply', keys: ['reply_within_5h', 'no_unread_eod', 'urgent_calls'] },
  { title: 'Weekly rhythm', icon: 'fa-calendar-week', keys: ['weekly_call', 'log_on_dashboard'] },
  { title: 'Hunt support', icon: 'fa-briefcase', keys: ['cv_review', 'mock_interview', 'keep_them_applying', 'know_resources', 'use_padam_gpt', 'elder_sibling'] },
  { title: 'Joining', icon: 'fa-flag-checkered', keys: ['joining_help', 'joining_post'] },
  { title: 'Never', icon: 'fa-ban', keys: ['no_selling', 'no_poaching', 'no_guessing', 'no_placement_promise', 'privacy'] },
];
function consentRow(c, detail) {
  return html`<label class="ms-check" data-consent-row="${c.key}"><input type="checkbox" data-consent="${c.key}" ${chk(S.consents[c.key])}>
    <span class="ms-check__box"></span><span class="ms-check__text"><strong>${c.title}</strong><small>${detail ?? c.detail}</small></span></label>`;
}
function step5() {
  const done = REQUIRED_CONSENTS.filter((k) => S.consents[k]).length;
  const byKey = Object.fromEntries(DUTIES.map((d) => [d.key, d]));
  return html`
    <div class="ms-apply-consent-head">
      <div class="ms-row ms-between"><span class="ms-strong">Your promises</span><span class="ms-small ms-muted" data-consent-count>${done} of ${REQUIRED_CONSENTS.length} ticked</span></div>
      <div class="ms-progress ms-progress--green ms-mt-8"><div class="ms-progress__bar" data-consent-bar style="width:${Math.round((done * 100) / REQUIRED_CONSENTS.length)}%"></div></div>
    </div>
    ${DUTY_GROUPS.map((g) => html`<div class="ms-form-section ms-apply-consents">
      <div class="ms-form-section__title"><i class="fas ${g.icon} ms-apply-secicon" aria-hidden="true"></i>${g.title}</div>
      <div class="ms-stack" style="--ms-gap:8px">${g.keys.map((k) => consentRow(byKey[k]))}</div></div>`)}
    <div class="ms-card ms-card--soft ms-card--flat ms-apply-coc">
      <div class="ms-form-section__title"><i class="fas fa-scale-balanced ms-apply-secicon" aria-hidden="true"></i>Code of conduct</div>
      <ul class="ms-apply-coc__list">${CODE_OF_CONDUCT.map((l) => html`<li>${l}</li>`)}</ul>
    </div>
    <div class="ms-form-section ms-apply-consents">
      <div class="ms-form-section__title"><i class="fas fa-file-signature ms-apply-secicon" aria-hidden="true"></i>Agreements</div>
      <div class="ms-stack" style="--ms-gap:8px">${POLICY_CONSENTS.map((c) => consentRow(c, c.key === 'payout_terms' ? fillTemplate(c.detail, { fee: FEE }) : c.detail))}</div>
    </div>`;
}

function publicPreview() {
  const m = {
    full_name: S.full_name, photo_path: S.photo_path, tier: S.stage ? tierOf(S.stage) : 'peer_mentor', stage: S.stage, city: S.city,
    languages: S.languages, headline: S.headline, it_company: isShown('it_company') ? S.it_company : null, it_domain: isShown('it_domain') ? S.it_domain : null,
    it_duration_months: isShown('it_duration_months') ? S.it_duration_months : null, articleship_firm: S.articleship_firm, articleship_firm_type: S.articleship_firm_type,
    articleship_domain: S.articleship_domain, employer: isShown('employer') ? S.employer : null, role_title: isShown('role_title') ? S.role_title : null,
    qualified_on: isShown('qualified_on') ? S.qualified_on : null, final_attempt: isShown('final_attempt') ? S.final_attempt : null,
    max_mentees: Number(S.max_mentees || 5), slots_left: Number(S.max_mentees || 5), available: true, rating_avg: null, review_count: 0, linkedin_checked: false,
  };
  return html`<div class="ms-mentor-preview">
    <span class="ms-mentor-preview__label"><i class="fas fa-eye" aria-hidden="true"></i>This is how students will see you</span>
    ${mentorCardHtml(m, { minReviews: Number(config.min_reviews_for_rating || 3) })}
  </div>`;
}

function step6(serverMissing = null) {
  const list = serverMissing || missingList();
  const byStep = STEPS.slice(0, 5).map((s) => ({ ...s, items: list.filter((m) => m.step === s.n) }));
  const ready = !list.length;
  return html`
    <div class="ms-apply-review">
      <div class="ms-apply-review__preview">${publicPreview()}</div>
      <div class="ms-stack" style="--ms-gap:12px">
        ${ready
          ? html`<div class="ms-callout ms-callout--success"><i class="fas fa-circle-check" aria-hidden="true"></i><div><span class="ms-callout__title">Everything is in</span>Submit when you are ready. You can still edit your public profile later.</div></div>`
          : html`<div class="ms-callout ms-callout--warn"><i class="fas fa-list-check" aria-hidden="true"></i><div><span class="ms-callout__title">${list.length} ${list.length === 1 ? 'thing' : 'things'} left before you can submit</span>Tap Fix to jump straight to it.</div></div>`}
        <ul class="ms-apply-checklist">
          ${byStep.map((s) => html`<li class="${s.items.length ? 'is-open' : 'is-done'}">
            <div class="ms-apply-checklist__head"><span class="ms-apply-checklist__dot"><i class="fas ${s.items.length ? 'fa-circle-exclamation' : 'fa-check'}" aria-hidden="true"></i></span>
              <span class="ms-grow ms-strong">${s.title}</span>
              <button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-goto="${s.n}">${s.items.length ? 'Fix' : 'Edit'}</button></div>
            ${s.items.length ? html`<ul class="ms-apply-checklist__items">${s.items.map((m) => html`<li><button type="button" class="ms-link ms-apply-fixlink" data-goto="${m.step}" data-focus="${m.key}">${m.label}</button><span class="ms-muted"> · ${m.why || 'Missing'}</span></li>`)}</ul>` : ''}
          </li>`)}
        </ul>
        <p class="ms-xs ms-muted">After you submit: the mentor lecture, the playbook and a short quiz. Team MSC reviews every application within 7 days.</p>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------------------
   Form shell
   ------------------------------------------------------------------------ */
function stepDone(n) {
  if (n === 6) return false;
  return !stepMissing(n).length;
}
function stepperHtml() {
  return html`<ol class="ms-stepper ms-apply-stepper" aria-label="Application steps">
    ${STEPS.map((s) => html`<li class="ms-step ${s.n === ui.step ? 'is-active' : stepDone(s.n) ? 'is-done' : ''}">
      <button type="button" data-goto="${s.n}" aria-label="Step ${s.n}: ${s.title}" ${s.n === ui.step ? raw('aria-current="step"') : ''}>
        <span class="ms-step__dot">${s.n}</span><span class="ms-step__label">${s.short}</span></button></li>`)}
  </ol>`;
}
function completion() {
  const req = FIELD_ORDER.filter((k) => isRequired(k)).length + REQUIRED_CONSENTS.length;
  const miss = missingList();
  const consentMiss = REQUIRED_CONSENTS.filter((c) => !S.consents[c]).length;
  const missing = miss.filter((m) => m.key !== 'consents').length + consentMiss;
  return Math.max(0, Math.min(100, Math.round(((req - missing) * 100) / req)));
}
function refreshStepper() {
  const host = main.querySelector('[data-stepper]');
  if (host) setContent(host, stepperHtml());
  const pct = completion();
  const bar = main.querySelector('[data-complete-bar]');
  if (bar) bar.style.width = `${pct}%`;
  const label = main.querySelector('[data-complete-label]');
  if (label) label.textContent = `${pct}% complete`;
}

/** The landing title follows the open programs (Industrial Training copy until others open). */
function heroTitle() {
  const open = enabledPrograms(config);
  return open.length === 1 ? programCopy(open[0]).applyHero : 'Help the next batch of CA students through their hunt';
}

function heroHtml() {
  const back = !!row;
  const rejectedOpen = row?.status === 'rejected';
  return html`<section class="ms-hero ms-apply-hero${back ? ' ms-apply-hero--back' : ''}"><div class="ms-container ms-container--narrow"><div class="ms-hero__inner">
    <span class="ms-eyebrow"><i class="fas fa-hand-holding-heart" aria-hidden="true"></i>Become an MSC mentor</span>
    <h1 class="ms-h1">${rejectedOpen ? 'Apply again' : back && S.full_name ? `Welcome back, ${firstName(S.full_name)}` : heroTitle()}</h1>
    <p class="ms-lead">${back ? 'Pick up where you left off. Everything saves as you go, so you can stop and come back anytime.' : 'Takes about 10 minutes. Everything saves as you go, so you can stop and come back anytime.'}</p>
    <div class="ms-mentor-facts">
      <span class="ms-chip"><i class="fas fa-indian-rupee-sign" aria-hidden="true"></i>${formatINR(FEE)} per mentee</span>
      <span class="ms-chip"><i class="fas fa-users" aria-hidden="true"></i>1 to ${CAP} mentees per batch</span>
      <span class="ms-chip"><i class="fas fa-graduation-cap" aria-hidden="true"></i>Training and a short quiz</span>
    </div>
  </div></div></section>`;
}

function renderForm() {
  mode = 'form';
  const rej = row?.status === 'rejected';
  setContent(main, html`${heroHtml()}
    <section class="ms-container ms-container--narrow ms-section ms-apply-wrap">
      ${rej ? html`<div class="ms-callout ms-mb-16"><i class="fas fa-rotate" aria-hidden="true"></i><div><span class="ms-callout__title">You can apply again</span>
        ${row.reject_reason ? html`Last time Team MSC said: "${String(row.reject_reason).trim().replace(/[.!\s]+$/, '')}." ` : ''}Update anything that needs care, then submit from the Review step.</div></div>` : ''}
      <div data-restore></div>
      <div class="ms-card ms-apply-card">
        <div data-stepper>${stepperHtml()}</div>
        <div class="ms-apply-complete"><div class="ms-progress"><div class="ms-progress__bar" data-complete-bar style="width:${completion()}%"></div></div><span class="ms-xs ms-muted" data-complete-label>${completion()}% complete</span></div>
        <form class="ms-form ms-apply-form" novalidate data-form autocomplete="off">
          <div data-step-body></div>
          <div class="ms-sticky-actions ms-apply-actions">
            <span class="ms-savestate" data-savestate aria-live="polite"></span>
            <span class="ms-grow"></span>
            <button type="button" class="ms-btn ms-btn--ghost" data-action="back" aria-label="Back"><i class="fas fa-arrow-left" aria-hidden="true"></i><span>Back</span></button>
            <button type="button" class="ms-btn ms-btn--primary" data-action="next" data-primary><span>Continue</span><i class="fas fa-arrow-right" aria-hidden="true"></i></button>
          </div>
        </form>
      </div>
    </section>`);
  bindForm(main.querySelector('[data-form]'));
  showRestoreOffer();
  goStep(ui.step, { scroll: false });
}

function goStep(n, { scroll = true, focusKey = null } = {}) {
  const prev = ui.step;
  ui.step = Math.min(6, Math.max(1, Number(n) || 1));
  if (prev !== ui.step && mode === 'form') flushSave();
  const body = main.querySelector('[data-step-body]');
  const s = STEPS[ui.step - 1];
  setContent(body, html`<div class="ms-apply-stephead">
      <span class="ms-xs ms-muted">${ui.step <= 5 ? `Step ${ui.step} of 5` : 'Last step'}</span>
      <h2 class="ms-h2">${s.title}</h2>
      <p class="ms-text-2 ms-small">${s.sub}</p>
    </div>
    ${[step1, step2, step3, step4, step5, step6][ui.step - 1]()}`);
  const back = main.querySelector('[data-action="back"]');
  const next = main.querySelector('[data-primary]');
  back.hidden = ui.step === 1;
  setContent(next, ui.step === 6 ? html`<i class="fas fa-paper-plane" aria-hidden="true"></i><span><span class="ms-hide-mobile">Submit application</span><span class="ms-hide-desktop">Submit</span></span>`
    : ui.step === 5 ? html`<span>Review</span><i class="fas fa-arrow-right" aria-hidden="true"></i>` : html`<span>Continue</span><i class="fas fa-arrow-right" aria-hidden="true"></i>`);
  next.dataset.action = ui.step === 6 ? 'submit' : 'next';
  const url = new URL(location.href);
  url.searchParams.set('step', String(ui.step));
  history.replaceState(null, '', url);
  refreshStepper();
  renderSaveState();
  if (ui.showAll) validateVisible(true);
  else for (const k of FIELD_ORDER) if (!isEmpty(S[k]) && formatError(k)) showFieldError(k);
  rejected.forEach((_, k) => showFieldError(k));
  if (scroll) scrollToEl(main.querySelector('.ms-apply-card'), { smooth: false });
  if (focusKey) {
    const k = focusKey.split('.')[0];
    const w = main.querySelector(`[data-wrap="${k}"]`) || main.querySelector('[data-consent]:not(:checked)')?.closest('.ms-check');
    if (w) {
      setTimeout(() => {
        scrollToEl(w);
        (w.querySelector('input:not([type=hidden]):not([readonly]), select, textarea') || w).focus?.({ preventScroll: true });
      }, 60);
    }
  }
  track('mentor_apply_step', { step: ui.step });
}

/* ---------------------------------------------------------------------------
   Reading inputs
   ------------------------------------------------------------------------ */
function readField(k, host) {
  const f = F[k];
  switch (f?.type || (k === 'show_linkedin' || k === 'accepting' ? 'switch' : '')) {
    case 'text': case 'textarea': case 'url': return host.value;
    case 'phone': return host.value.replace(/[^\d\s+-]/g, '');
    case 'switch': return host.checked;
    case 'select': case 'attempt': return host.value === '' ? null : (f.number ? Number(host.value) : host.value);
    case 'multi': case 'programs': case 'conflicts':
      return [...host.querySelectorAll('input:checked')].map((i) => i.value);
    case 'radio': { const v = host.querySelector('input:checked')?.value; return v === undefined ? null : (f.number ? Number(v) : v); }
    case 'stage': return host.querySelector('input:checked')?.value || null;
    case 'yesno': { const v = host.querySelector('input:checked')?.value; return v === 'yes' ? true : v === 'no' ? false : null; }
    case 'month': {
      const m = host.querySelector('[data-part="month"]').value;
      const y = host.querySelector('[data-part="year"]').value;
      return m && y ? `${y}-${m}` : null;
    }
    default: return S[k];
  }
}
function readScores(host) {
  const out = JSON.parse(JSON.stringify(S.scores || {}));
  host.querySelectorAll('[data-sub]').forEach((el) => {
    const [a, b] = el.dataset.sub.split('.');
    if (!b) { out[a] = el.value; return; }
    out[a] = out[a] || {};
    out[a][b] = el.type === 'checkbox' ? el.checked : (el.value === '' ? null : Number(el.value));
  });
  return out;
}

function applyVisibility() {
  main.querySelectorAll('[data-wrap]').forEach((w) => { w.hidden = !isShown(w.dataset.wrap); });
  const groups = { it: 'it_company', art: 'articleship_firm', now: 'qualified_on', icai: 'icai_number' };
  Object.entries(groups).forEach(([g, k]) => { const el = main.querySelector(`[data-group="${g}"]`); if (el) el.hidden = !isShown(k); });
  main.querySelector('[data-group="nostage"]')?.toggleAttribute('hidden', !!S.stage);
  const fin = main.querySelector('.ms-apply-score[data-part="final"]');
  if (fin) fin.hidden = !isQualifiedStage(S.stage);
  main.querySelectorAll('[data-reqlabel]').forEach((el) => {
    const k = el.dataset.reqlabel;
    el.classList.toggle('ms-req', isRequired(k));
    if (k === 'final_attempt') el.textContent = S.stage === 'in_articleship' ? 'Planned CA Final attempt' : F.final_attempt.label;
  });
}

/** Stage change: stash values of fields that just got hidden (and clear them on the server). */
function onStageChange() {
  for (const k of STAGE_FIELDS) {
    if (!isShown(k) && !isEmpty(S[k])) { stash[k] = S[k]; S[k] = null; markDirty(k); }
    else if (isShown(k) && isEmpty(S[k]) && !isEmpty(stash[k])) { S[k] = stash[k]; delete stash[k]; markDirty(k); restoreControl(k); }
  }
  applyVisibility();
}
function restoreControl(k) {
  const w = main.querySelector(`[data-wrap="${k}"]`);
  if (!w) return;
  const tmp = document.createElement('div');
  setContent(tmp, field(k));
  w.replaceWith(tmp.firstElementChild);
}

function showFieldError(k, msg) {
  const w = main.querySelector(`[data-wrap="${k}"]`);
  if (!w) return;
  const m = msg ?? (rejected.get(k) || (isEmpty(S[k]) && k !== 'scores' ? '' : formatError(k)));
  w.classList.toggle('is-invalid', !!m);
  const span = w.querySelector(`[data-error="${k}"] span`);
  if (span) span.textContent = m || '';
}
function validateVisible(includeRequired) {
  main.querySelectorAll('[data-wrap]').forEach((w) => {
    const k = w.dataset.wrap;
    if (w.hidden || !F[k]) return;
    const m = rejected.get(k) || (isEmpty(S[k]) && k !== 'scores' ? '' : formatError(k)) || (includeRequired ? requirementError(k) : '');
    showFieldError(k, m);
  });
}

function updateCounter(k) {
  const el = main.querySelector(`[data-counter="${k}"]`);
  if (!el) return;
  const f = F[k];
  if (f.type === 'multi') { el.textContent = `${(S[k] || []).length} of ${f.max} picked`; return; }
  el.textContent = counterText(k);
  el.classList.toggle('is-over', String(S[k] || '').length > f.max);
}

/* ---------------------------------------------------------------------------
   Events
   ------------------------------------------------------------------------ */
function bindForm(form) {
  form.addEventListener('submit', (e) => e.preventDefault());
  form.addEventListener('input', onInput);
  form.addEventListener('change', onChange);
  form.addEventListener('focusout', onBlur);
  form.addEventListener('keydown', onKeydown);
  main.addEventListener('click', onClick);
  form.addEventListener('dragover', (e) => { const d = e.target.closest?.('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('is-dragover'); } });
  form.addEventListener('dragleave', (e) => e.target.closest?.('[data-drop]')?.classList.remove('is-dragover'));
  form.addEventListener('drop', (e) => {
    const d = e.target.closest?.('[data-drop]');
    if (!d) return;
    e.preventDefault();
    d.classList.remove('is-dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleUpload('cv', file);
  });
}

function onInput(e) {
  const t = e.target;
  if (t.matches('[data-tag-input]')) {
    if (t.value.includes(',')) { addTags(t.value); t.value = ''; }
    return;
  }
  if (t.matches('[data-consent], [data-same-wa], [data-upload]')) return;
  const host = t.closest('[data-field]');
  if (!host) return;
  const k = host.dataset.field;
  if (k === 'scores') { S.scores = readScores(host); markDirty('scores'); showFieldError('scores', ''); return; }
  if (k === 'city') { readCity(); return; }
  const type = F[k]?.type;
  if (!['text', 'textarea', 'url', 'phone'].includes(type)) return;
  S[k] = readField(k, t);
  if (k === 'mobile' && ui.sameWa) { S.whatsapp = S.mobile; const w = main.querySelector('#f-whatsapp'); if (w) w.value = S.mobile; markDirty('whatsapp'); }
  updateCounter(k);
  if (main.querySelector(`[data-wrap="${k}"]`)?.classList.contains('is-invalid')) {
    const m = (isEmpty(S[k]) ? '' : formatError(k)) || (ui.showAll ? requirementError(k) : '');
    showFieldError(k, m);
  }
  markDirty(k);
}

function readCity() {
  const s = main.querySelector('[data-field="city"][data-part="select"]');
  const o = main.querySelector('[data-field="city"][data-part="other"]');
  ui.cityOther = s?.value === 'other';
  if (o) o.hidden = !ui.cityOther;
  S.city = ui.cityOther ? (o?.value || '').trim() || null : (s?.value || null);
  markDirty('city');
}

function onChange(e) {
  const t = e.target;
  if (t.matches('[data-upload]')) { const file = t.files?.[0]; t.value = ''; if (file) handleUpload(t.dataset.upload, file); return; }
  if (t.matches('[data-consent]')) { setConsent(t.dataset.consent, t.checked); return; }
  if (t.matches('[data-same-wa]')) {
    ui.sameWa = t.checked;
    const w = main.querySelector('#f-whatsapp');
    if (w) { w.readOnly = ui.sameWa; if (ui.sameWa) { w.value = S.mobile || ''; } }
    if (ui.sameWa) { S.whatsapp = S.mobile; markDirty('whatsapp'); showFieldError('whatsapp', ''); } else w?.focus();
    return;
  }
  const host = t.closest('[data-field]');
  if (!host) return;
  const k = host.dataset.field;
  if (k === 'scores') {
    if (t.dataset.sub === 'foundation.exempt') main.querySelector('.ms-apply-score[data-part="foundation"] .ms-apply-score__grid')?.classList.toggle('is-off', t.checked);
    S.scores = readScores(host); markDirty('scores'); showFieldError('scores'); return;
  }
  if (k === 'city') { readCity(); return; }
  const type = F[k]?.type;
  if (['text', 'textarea', 'url', 'phone'].includes(type)) return; // handled on input
  let v = readField(k, k === 'show_linkedin' || k === 'accepting' ? t : host);
  if (type === 'multi' && F[k].max && v.length > F[k].max) {
    t.checked = false;
    v = v.filter((x) => x !== t.value);
    toast(`Pick up to ${F[k].max}.`, { type: 'warn' });
  }
  if (k === 'conflicts') {
    if (t.value === 'none' && t.checked) v = ['none'];
    else if (t.checked) v = v.filter((x) => x !== 'none');
    host.querySelectorAll('input').forEach((i) => { i.checked = v.includes(i.value); });
  }
  S[k] = v;
  markDirty(k);
  updateCounter(k);
  if (k === 'stage' || k === 'did_it') { onStageChange(); refreshStepper(); }
  if (k === 'conflicts') applyVisibility();
  showFieldError(k, ui.showAll ? (formatError(k) || requirementError(k)) : '');
  if (mode === 'form') scheduleSave(400);
}

function onBlur(e) {
  const t = e.target;
  if (t.matches('[data-tag-input]')) { if (t.value.trim()) { addTags(t.value); t.value = ''; } return; }
  const host = t.closest('[data-field]');
  if (!host) return;
  const k = host.dataset.field;
  if (k === 'scores') { showFieldError('scores'); return; }
  if (['text', 'textarea', 'url', 'phone'].includes(F[k]?.type)) {
    if (URL_FIELDS.includes(k) && S[k] && !formatError(k)) { S[k] = normalizeUrl(S[k]); t.value = S[k]; }
    if (typeof S[k] === 'string' && S[k] !== S[k].trim() && F[k].type !== 'textarea') { S[k] = S[k].trim(); t.value = S[k]; }
    showFieldError(k, (isEmpty(S[k]) ? '' : formatError(k)) || (ui.showAll ? requirementError(k) : ''));
  }
  if (mode === 'form' && dirty.size) scheduleSave(150);
}

function onKeydown(e) {
  const t = e.target;
  if (t.matches('[data-tag-input]')) {
    if (e.key === 'Enter') { e.preventDefault(); addTags(t.value); t.value = ''; }
    else if (e.key === 'Backspace' && !t.value && (S.companies_known || []).length) { removeTag(S.companies_known.length - 1); }
    return;
  }
  if (e.key === 'Enter' && t.matches('input:not([type=checkbox]):not([type=radio])')) e.preventDefault();
}

async function onClick(e) {
  const t = e.target.closest('button, a');
  if (!t || !main.contains(t)) return;
  if (t.dataset.goto) { e.preventDefault(); goStep(Number(t.dataset.goto), { focusKey: t.dataset.focus || null }); return; }
  if (t.dataset.tagRemove !== undefined) { removeTag(Number(t.dataset.tagRemove)); return; }
  if (t.dataset.tagAdd) { addTags(t.dataset.tagAdd); return; }
  const action = t.dataset.action;
  if (!action) return;
  if (action === 'next') { goStep(ui.step + 1); return; }
  if (action === 'back') { goStep(ui.step - 1); return; }
  if (action === 'submit') { await submitApplication(t); return; }
  if (action === 'view-cv') { await viewCv(t); return; }
  if (action === 'restore') { restoreBackup(); return; }
  if (action === 'discard') { local.del(draftKey()); setContent(main.querySelector('[data-restore]'), ''); return; }
  if (action === 'save-profile') { await saveProfile(t); return; }
  if (action === 'preview') { openModal({ title: 'Your mentor card', body: publicPreview() }); }
}

/* tags */
function addTags(text) {
  const f = F.companies_known;
  const items = [...(S.companies_known || [])];
  let capped = false;
  let refused = false;
  String(text || '').split(',').map((x) => x.trim().replace(/\s+/g, ' ').slice(0, f.itemMax)).filter(Boolean).forEach((x) => {
    if (hasContact(x)) { refused = true; return; }
    if (items.some((i) => i.toLowerCase() === x.toLowerCase())) return;
    if (items.length >= f.max) { capped = true; return; }
    items.push(x);
  });
  if (capped) toast(`Up to ${f.max} companies.`, { type: 'warn' });
  if (refused) toast('Company names only, please: no phone numbers, emails or links.', { type: 'warn' });
  if (same(items, S.companies_known)) return;
  S.companies_known = items;
  rerenderTags();
  markDirty('companies_known');
}
function removeTag(i) {
  S.companies_known = (S.companies_known || []).filter((_, j) => j !== i);
  rerenderTags();
  markDirty('companies_known');
}
function rerenderTags() {
  const w = main.querySelector('[data-wrap="companies_known"]');
  if (!w) return;
  const tmp = document.createElement('div');
  setContent(tmp, field('companies_known'));
  const fresh = tmp.firstElementChild;
  w.replaceWith(fresh);
  fresh.querySelector('[data-tag-input]')?.focus({ preventScroll: true });
}

/* consents */
function setConsent(key, on) {
  S.consents[key] = !!on;
  if (mode !== 'form') return;
  dirtyConsents[key] = !!on;
  backupSoon();
  const done = REQUIRED_CONSENTS.filter((k) => S.consents[k]).length;
  const c = main.querySelector('[data-consent-count]');
  if (c) c.textContent = `${done} of ${REQUIRED_CONSENTS.length} ticked`;
  const bar = main.querySelector('[data-consent-bar]');
  if (bar) bar.style.width = `${Math.round((done * 100) / REQUIRED_CONSENTS.length)}%`;
  scheduleSave(0);
  refreshStepper();
}

/* uploads */
async function handleUpload(kind, file) {
  const k = kind === 'photo' ? 'photo_path' : 'cv_path';
  const w = main.querySelector(`[data-wrap="${k}"]`);
  w?.classList.add('is-busy');
  showFieldError(k, '');
  const busyBtn = w?.querySelector('.ms-apply-filebtn');
  busyBtn?.classList.add('is-loading');
  const oldPath = row?.[k] || null; // the file the server references now (deleted once the new one is saved)
  try {
    // Storage takes uploads only from mentor applicants (a mentor row), so make the draft first.
    await ensureDraftRow();
    const path = await uploadFile(kind, file);
    if (kind === 'photo') {
      if (ui.photoLocal) URL.revokeObjectURL(ui.photoLocal);
      ui.photoLocal = URL.createObjectURL(file);
    } else ui.cvLocalName = file.name;
    S[k] = path;
    rejected.delete(k);
    // Uploads always save straight away so the stored file is never orphaned.
    let ok = false;
    if (mode === 'form') {
      dirty.add(k);
      await settle();
      ok = !dirty.has(k);
    } else {
      const res = await doSave({ keys: [k], explicit: true }).catch((e) => { showError(e); return { ok: false }; });
      ok = !!res?.ok && !(res.refused || []).includes(k);
    }
    if (ok) {
      toast(kind === 'photo' ? 'Photo saved.' : 'CV saved.', { type: 'success' });
      // The replaced file is no longer referenced: delete it so it does not stay readable.
      if (oldPath && oldPath !== path && !String(oldPath).startsWith('mock/')) removeFile(kind, oldPath);
    }
    else if (mode === 'form') toast('Uploaded. It will save to your application when you are back online.', { type: 'warn' });
    const tmp = document.createElement('div');
    setContent(tmp, field(k));
    main.querySelector(`[data-wrap="${k}"]`)?.replaceWith(tmp.firstElementChild);
    track('mentor_upload', { kind });
  } catch (e) {
    showFieldError(k, e.message || 'Upload failed. Please try again.');
    w?.classList.remove('is-busy');
  } finally {
    busyBtn?.classList.remove('is-loading');
    refreshStepper();
    if (mode !== 'form') renderEditBar();
  }
}
/** Create the draft row (status draft) if this is the applicant's very first action. */
async function ensureDraftRow() {
  if (row) return;
  const out = await rpc('mentorship_save_mentor', { p_patch: {} });
  if (out && typeof out === 'object') row = out;
  getContext({ force: true });
}

async function viewCv(btn) {
  if (!S.cv_path) return;
  setBusy(btn, true);
  try {
    const url = await signedUrl(STORAGE.cv, S.cv_path, 300);
    if (!url || url.startsWith('#')) { toast('Preview is not available in mock mode.', { type: 'info' }); return; }
    window.open(url, '_blank', 'noopener');
  } catch (e) { showError(e); } finally { setBusy(btn, false); }
}

/* restore offer */
function showRestoreOffer() {
  const b = local.get(draftKey());
  const host = main.querySelector('[data-restore]');
  if (!b || !host) return;
  const hasVals = Object.keys(b.values || {}).length || Object.keys(b.consents || {}).length;
  const serverAt = Date.parse(row?.updated_at || 0) || 0;
  if (!hasVals || b.at <= serverAt) { local.del(draftKey()); return; }
  ui.restoreOffer = b;
  setContent(host, html`<div class="ms-callout ms-callout--warn ms-mb-16"><i class="fas fa-clock-rotate-left" aria-hidden="true"></i>
    <div class="ms-grow"><span class="ms-callout__title">Unsaved changes from ${timeAgo(b.at)}</span>Some of your answers did not reach our server last time. Restore them?
      <div class="ms-btn-row ms-mt-8"><button type="button" class="ms-btn ms-btn--primary ms-btn--sm" data-action="restore"><span>Restore</span></button>
      <button type="button" class="ms-btn ms-btn--ghost ms-btn--sm" data-action="discard"><span>Discard</span></button></div></div></div>`);
}
function restoreBackup() {
  const b = ui.restoreOffer;
  if (!b) return;
  Object.entries(b.values || {}).forEach(([k, v]) => { if (k in F) { S[k] = v; dirty.add(k); } });
  Object.entries(b.consents || {}).forEach(([k, v]) => { S.consents[k] = !!v; dirtyConsents[k] = !!v; });
  if (b.ui) { ui.cityOther = !!b.ui.cityOther; ui.sameWa = b.ui.sameWa !== false; }
  setContent(main.querySelector('[data-restore]'), '');
  goStep(ui.step, { scroll: false });
  flushSave();
  toast('Restored. Saving now.', { type: 'success' });
}

/* ---------------------------------------------------------------------------
   Submit
   ------------------------------------------------------------------------ */
async function submitApplication(btn) {
  ui.showAll = true;
  const miss = missingList();
  if (miss.length) {
    goStep(6, { scroll: false });
    toast(`${miss.length} ${miss.length === 1 ? 'thing' : 'things'} left. Tap Fix to jump to each one.`, { type: 'warn' });
    return;
  }
  setBusy(btn, true);
  try {
    // Clear answers hidden by the chosen stage so the public profile stays accurate.
    for (const k of [...STAGE_FIELDS, 'conflicts_note']) if (!isShown(k) && !isEmpty(S[k])) { S[k] = null; dirty.add(k); }
    await settle();
    const stuck = [...dirty].filter((k) => rejected.has(k) || formatError(k));
    if (stuck.length) { goStep(6, { scroll: false }); toast('A few answers did not save. Fix them and try again.', { type: 'error' }); return; }
    if (dirty.size || Object.keys(dirtyConsents).length) {
      const r = await doSave();
      if (!r.ok) { toast('We could not save everything. Check your connection and try again.', { type: 'error' }); return; }
    }
    const res = await rpc('mentorship_submit_application');
    if (res?.ok) {
      local.del(draftKey());
      track('mentor_application_submitted', { stage: S.stage || '' });
      await getContext({ force: true });
      renderSubmitted(res.status);
      return;
    }
    const serverMissing = (res?.missing || []).map(mapServerMissing);
    ui.showAll = true;
    goStep(6, { scroll: false });
    if (serverMissing.length) {
      const body = main.querySelector('[data-step-body]');
      setContent(body, html`<div class="ms-apply-stephead"><span class="ms-xs ms-muted">Last step</span><h2 class="ms-h2">Review and submit</h2>
        <p class="ms-text-2 ms-small">Team MSC's check found a few gaps.</p></div>${step6(serverMissing)}`);
    }
    toast('A few details are still missing.', { type: 'warn' });
  } catch (e) {
    if (e.code === 'reapply_later') toast(`You can apply again from ${formatDate(e.hint)}.`, { type: 'warn' });
    else showError(e);
  } finally { setBusy(btn, false); }
}
function mapServerMissing(key) {
  const k = String(key);
  if (k.startsWith('consents')) {
    const c = k.split('.')[1];
    const item = [...DUTIES, ...POLICY_CONSENTS].find((d) => d.key === c);
    return { key: k, step: 5, label: 'Commitment', why: item ? item.title : 'Tick every commitment.' };
  }
  const base = k.split('.')[0];
  const f = F[base];
  if (base === 'scores') return { key: k, step: 3, label: k.includes('.') ? `${labelPart(k.split('.')[1]) || 'CA'} marks` : 'CA scores', why: 'Missing' };
  return { key: base, step: f?.step || 1, label: f?.label || base.replace(/_/g, ' '), why: 'Missing' };
}

function renderSubmitted(status = 'submitted') {
  mode = 'done';
  const u = new URL(location.href);
  u.searchParams.delete('step');
  history.replaceState(null, '', u);
  if (status === 'training_passed') {
    // A re-application whose quiz was already passed goes straight back to review.
    setContent(main, statusScreen({
      icon: 'fa-user-shield', tone: 'purple', eyebrow: 'Application received', title: `Thank you, ${firstName(S.full_name) || 'mentor'}!`,
      text: 'You have already passed the mentor training, so your application goes straight to review. Team MSC reviews every application within 7 days, and we will email you the decision.',
      actions: [{ label: 'Reread the playbook', href: `${PATHS.training}#playbook`, icon: 'fa-book-open', variant: 'secondary' }, { label: 'Back to mentorship', href: PATHS.hub, variant: 'ghost' }],
      extra: journeySteps(2),
    }));
    window.scrollTo({ top: 0 });
    return;
  }
  setContent(main, statusScreen({
    icon: 'fa-circle-check', tone: 'green', eyebrow: 'Application received', title: `Thank you, ${firstName(S.full_name) || 'mentor'}!`,
    text: 'Application received. Next: watch the lecture, read the playbook and pass a short quiz. Team MSC reviews every application within 7 days.',
    actions: [{ label: 'Start mentor training', href: PATHS.training, icon: 'fa-graduation-cap' }, { label: 'Back to mentorship', href: PATHS.hub, variant: 'ghost' }],
    extra: journeySteps(1),
  }));
  window.scrollTo({ top: 0 });
}

/* ---------------------------------------------------------------------------
   Profile editing (submitted and later): profile fields only, explicit save
   ------------------------------------------------------------------------ */
function renderEdit() {
  mode = 'edit';
  const st = row.status;
  const live = st === 'approved' || st === 'paused';
  const inTraining = st === 'submitted' || st === 'training_passed';
  setContent(main, html`
    <section class="ms-container ms-section ms-apply-edit">
      <div class="ms-pagehead">
        <div class="ms-pagehead__title">
          <span class="ms-eyebrow"><i class="fas fa-user-pen" aria-hidden="true"></i>${live ? 'Your mentor profile' : 'Your application'}</span>
          <h1 class="ms-h1">${live ? 'Edit your profile' : 'Application received'}</h1>
          <div class="ms-row">${statusBadge('mentor', st)}${row.submitted_at ? html`<span class="ms-small ms-muted">Submitted ${formatDate(row.submitted_at)}</span>` : ''}</div>
        </div>
        <div class="ms-btn-row">
          ${live ? html`<a class="ms-btn ms-btn--secondary" href="${PATHS.mentor}"><i class="fas fa-gauge" aria-hidden="true"></i><span>Mentor dashboard</span></a>`
            : html`<a class="ms-btn ms-btn--primary" href="${PATHS.training}"><i class="fas fa-graduation-cap" aria-hidden="true"></i><span>Go to training</span></a>`}
        </div>
      </div>
      ${st === 'paused' ? html`<div class="ms-callout ms-callout--warn ms-mb-16"><i class="fas fa-circle-pause" aria-hidden="true"></i><div><span class="ms-callout__title">Your profile is paused</span>
        ${row.pause_reason ? html`${row.pause_reason} ` : ''}You will not get new mentees while paused. Keep helping your current mentees as usual.</div></div>` : ''}
      ${inTraining ? html`<div class="ms-mb-16">${applicationSummary()}</div>` : ''}
      <div class="ms-layout ms-layout--right">
        <div class="ms-stack" style="--ms-gap:16px">
          ${live ? html`<div class="ms-card ms-apply-accepting">
            <div class="ms-row ms-between ms-row--nowrap" style="--ms-gap:12px">
              <div><div class="ms-card__title">Taking new mentees</div><div class="ms-card__sub">${activeCount} active · ${row.max_mentees} max. Turn this off when you are full or busy; current mentees are not affected.</div></div>
              <label class="ms-switch" aria-label="Taking new mentees"><input type="checkbox" data-accepting ${chk(S.accepting)}><span class="ms-switch__track"></span></label>
            </div></div>` : ''}
          <form class="ms-card ms-form ms-apply-form" novalidate data-form autocomplete="off">
            ${inTraining ? html`<div><h2 class="ms-h3">Edit public profile</h2><p class="ms-hint">You can update these while Team MSC reviews your application.</p></div>` : ''}
            ${section('Photo and basics', html`${field('photo_path')}${grid(field('city'), field('mobile'), field('whatsapp'))}${field('languages')}`, { icon: 'fa-id-card' })}
            ${section('Links', grid(field('linkedin_url', { span2: true }), field('topmate_url', { span2: true })), { icon: 'fa-link' })}
            ${section('Your profile', html`${field('headline')}${field('bio')}${field('wish_i_knew')}${field('domains')}${field('companies_known')}`, { icon: 'fa-pen-nib' })}
            ${section('Availability', html`${field('programs')}<div class="ms-apply-narrow">${field('max_mentees', { hint: activeCount ? `You have ${activeCount} active ${activeCount === 1 ? 'mentee' : 'mentees'}, so the lowest you can pick is ${activeCount}.` : 'Most mentors take 5 to 8. Each mentee needs a weekly call.' })}</div>${field('weekly_hours')}${field('call_slots')}`, { icon: 'fa-calendar-check' })}
            ${section('Your CV', field('cv_path'), { icon: 'fa-file-lines' })}
            <div class="ms-sticky-actions">
              <span class="ms-savestate" data-editstate>No changes</span>
              <span class="ms-grow"></span>
              <button type="button" class="ms-btn ms-btn--ghost ms-hide-desktop" data-action="preview"><i class="fas fa-eye" aria-hidden="true"></i><span>Preview</span></button>
              <button type="button" class="ms-btn ms-btn--primary" data-action="save-profile" disabled><span>Save changes</span></button>
            </div>
          </form>
        </div>
        <aside class="ms-layout__aside ms-hide-mobile">${publicPreview()}</aside>
      </div>
    </section>`);
  bindForm(main.querySelector('[data-form]'));
  main.querySelector('[data-accepting]')?.addEventListener('change', (e) => saveAccepting(e.target));
  for (const k of PROFILE_FIELDS) if (!isEmpty(S[k]) && formatError(k)) showFieldError(k);
  window.addEventListener('beforeunload', (e) => { if (mode === 'edit' && dirty.size) { e.preventDefault(); e.returnValue = ''; } });
}

function renderEditBar() {
  const n = [...dirty].length;
  const st = main.querySelector('[data-editstate]');
  const btn = main.querySelector('[data-action="save-profile"]');
  if (st) { st.textContent = n ? 'Unsaved changes' : 'All changes saved'; st.classList.toggle('is-saving', !!n); }
  if (btn) btn.disabled = !n;
  const aside = main.querySelector('.ms-layout__aside');
  if (aside) setContent(aside, publicPreview());
}

async function saveProfile(btn) {
  const keys = [...dirty].filter((k) => PROFILE_FIELDS.includes(k));
  const problems = keys.map((k) => [k, (isEmpty(S[k]) && k !== 'scores' ? '' : formatError(k)) || requirementErrorProfile(k)]).filter(([, m]) => m);
  problems.forEach(([k, m]) => showFieldError(k, m));
  if (problems.length) {
    scrollToEl(main.querySelector(`[data-wrap="${problems[0][0]}"]`));
    toast('Fix the highlighted fields, then save.', { type: 'warn' });
    return;
  }
  setBusy(btn, true);
  try {
    const res = await doSave({ keys, explicit: true });
    const refused = res.refused || [];
    // A field the server refused stays dirty (and on screen with its error), never "saved".
    if (res.ok) keys.filter((k) => !refused.includes(k)).forEach((k) => dirty.delete(k));
    if (res.ok && !refused.length) {
      toast('Profile updated.', { type: 'success' });
      track('mentor_profile_saved', {});
    } else if (refused.length || res.rejected) {
      const k = refused[0] || res.rejected;
      scrollToEl(main.querySelector(`[data-wrap="${k}"]`));
      toast(refused.length > 1 ? `${refused.length} fields need a fix. The rest is saved.` : res.ok ? 'One field needs a fix. The rest is saved.' : 'One field needs a fix.', { type: 'warn' });
    }
  } catch (e) { showError(e); } finally { setBusy(btn, false); renderEditBar(); }
}
function requirementErrorProfile(k) {
  if (!BASE_REQUIRED.includes(k)) return '';
  const v = S[k];
  if (isEmpty(v)) return F[k].type === 'multi' || F[k].type === 'programs' ? 'Pick at least one.' : 'This is required.';
  if (F[k].min && String(v).length < F[k].min) return `Write at least ${F[k].min} characters (${F[k].min - String(v).length} more).`;
  return '';
}
async function saveAccepting(input) {
  const on = input.checked;
  input.disabled = true;
  try {
    row = await rpc('mentorship_save_mentor', { p_patch: { accepting: on } }) || row;
    S.accepting = on;
    const paused = row?.status === 'paused';
    toast(on ? (paused ? 'Saved. You will get new mentees once Team MSC resumes your profile.' : 'You are taking new mentees.')
      : 'Paused new mentees. Current mentees are not affected.', { type: 'success' });
  } catch (e) { input.checked = !on; showError(e); } finally { input.disabled = false; }
}

function applicationSummary() {
  const lines = journeyLines(row);
  const consents = REQUIRED_CONSENTS.filter((k) => row.consents?.[k]).length;
  const quizDone = !!row.quiz_passed_at;
  return html`<div class="ms-card">
    <div class="ms-row ms-row--nowrap" style="--ms-gap:14px">${avatarHtml({ name: row.full_name, photo_path: row.photo_path, size: 'lg' })}
      <div class="ms-grow"><div class="ms-card__title">${row.full_name}</div><div class="ms-card__sub">${stageLabel(row.stage) || ''}</div></div></div>
    ${lines.length ? html`<div class="ms-mentor-card__journey ms-mt-16">${lines.map((l) => html`<div><i class="fas ${l.icon}" aria-hidden="true"></i><span><strong>${l.label}:</strong> ${l.text}</span></div>`)}</div>` : ''}
    <dl class="ms-kv ms-mt-16">
      <dt>Programs</dt><dd>${(row.programs || []).map((p) => PROGRAMS[p]?.label || p).join(', ') || '-'}</dd>
      <dt>Domains</dt><dd>${labelsOf(DOMAINS, row.domains).join(', ') || '-'}</dd>
      <dt>Mentees per batch</dt><dd>${row.max_mentees ?? '-'}</dd>
      <dt>Commitments</dt><dd>${consents} of ${REQUIRED_CONSENTS.length} ticked</dd>
      <dt>Training</dt><dd>${quizDone ? html`Quiz passed ${formatDate(row.quiz_passed_at)}` : 'Lecture, playbook and quiz pending'}</dd>
    </dl>
    <div class="ms-card__foot"><span class="ms-small ms-muted">${row.status === 'training_passed' ? 'Team MSC is reviewing your application. We review every application within 7 days.' : 'Next: finish your training so Team MSC can review you.'}</span></div>
  </div>`;
}

/* ---------------------------------------------------------------------------
   Logged out
   ------------------------------------------------------------------------ */
function renderLoggedOut() {
  setContent(main, html`
    <section class="ms-hero"><div class="ms-container"><div class="ms-hero__inner ms-apply-landing">
      <span class="ms-eyebrow"><i class="fas fa-hand-holding-heart" aria-hidden="true"></i>Become an MSC mentor</span>
      <h1 class="ms-h1">Done your IT or articleship? Become a mentor.</h1>
      <p class="ms-lead">Guide CA students through their industrial training hunt: WhatsApp support, a weekly call, CV review and mock interviews, all the way to joining. ${formatINR(FEE)} per mentee, paid by Team MSC.</p>
      <div class="ms-btn-row ms-btn-row--stack">
        <a class="ms-btn ms-btn--primary ms-btn--lg" href="${loginUrl(PATHS.apply)}"><i class="fas fa-right-to-bracket" aria-hidden="true"></i><span>Log in to apply</span></a>
        <a class="ms-btn ms-btn--secondary ms-btn--lg" href="${PATHS.hub}"><span>How mentorship works</span></a>
      </div>
    </div></div></section>
    <section class="ms-container ms-section ms-stack" style="--ms-gap:24px">
      <div><h2 class="ms-h2 ms-mb-16">How it works</h2>${journeySteps(-1, { row: true })}</div>
      <div class="ms-grid ms-grid--2">
        <div class="ms-card"><div class="ms-card__title"><i class="fas fa-list-check ms-apply-secicon" aria-hidden="true"></i>What you will need</div>
          <ul class="ms-apply-bullets ms-mt-8"><li>A clear profile photo</li><li>Your LinkedIn profile link</li><li>Your CV as a PDF</li><li>Your CA marks (they stay private)</li><li>About 10 quiet minutes</li></ul></div>
        <div class="ms-card"><div class="ms-card__title"><i class="fas fa-user-check ms-apply-secicon" aria-hidden="true"></i>Who we are looking for</div>
          <ul class="ms-apply-bullets ms-mt-8"><li>CA Final students who have done industrial training or articleship</li><li>Qualified CA freshers and experienced CAs</li><li>Ideally MSC alumni who remember the hunt</li><li>People who respond quickly and care about juniors</li></ul></div>
      </div>
      <div class="ms-hojayega">You remember how the hunt felt. One message from a senior can turn a bad week around.</div>
    </section>`);
}

/* ---------------------------------------------------------------------------
   Boot
   ------------------------------------------------------------------------ */
async function boot() {
  if (!ctx.user) { renderLoggedOut(); return; }
  if (!ctx.backendReady) { setContent(main, backendNotReady()); return; }
  if (ctx.error) { setContent(main, loadError(ctx.error)); bindRetry(main); return; }
  let mine = null;
  if (ctx.mentor) {
    try { mine = await rpc('mentorship_my_mentor'); } catch (e) {
      if (e.code !== 'not_found') { setContent(main, loadError(e)); bindRetry(main); return; }
    }
  }
  row = mine?.mentor || null;
  activeCount = Number(mine?.active_count || 0);
  const st = row?.status || null;
  if (!row) loadState(null, await getProfilePrefill().catch(() => ({})));
  else loadState(row);

  if (!st || st === 'draft') { ui.step = Math.min(6, Math.max(1, Number(qs('step')) || 1)); renderForm(); return; }
  if (st === 'rejected') {
    const open = !row.reapply_after || istDateKey() >= String(row.reapply_after).slice(0, 10);
    if (open) { ui.step = Math.min(6, Math.max(1, Number(qs('step')) || 1)); renderForm(); return; }
    setContent(main, statusScreen({
      icon: 'fa-hourglass-half', tone: 'amber', eyebrow: 'Mentor application', title: 'Not approved this time',
      text: `Thank you for applying. You can apply again from ${formatDate(row.reapply_after)}.`,
      extra: row.reject_reason ? html`<div class="ms-callout ms-callout--gray"><i class="fas fa-comment" aria-hidden="true"></i><div><span class="ms-callout__title">Note from Team MSC</span>${row.reject_reason}</div></div>` : '',
      actions: [{ label: 'Back to mentorship', href: PATHS.hub, variant: 'secondary' }],
    }));
    return;
  }
  renderEdit();
  if (qs('step')) { const u = new URL(location.href); u.searchParams.delete('step'); history.replaceState(null, '', u); }
}

await boot();
