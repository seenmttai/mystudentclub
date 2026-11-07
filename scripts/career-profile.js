/** Shared career intake for signup, resources and career tools. */
(function (global) {
  'use strict';
  if (global.MSCCareerProfile) return;
  const VERSION = '2026-09-27';
  const PREFIX = 'msc_career_v2:';
  const STAGES = {
    'experienced-ca': 'Experienced CA',
    'ca-fresher': 'CA Fresher',
    'industrial-training': 'Industrial Training',
    'articleship': 'Articleship',
    'semi-qualified': 'Semi Qualified CA',
    'other': 'Others'
  };
  const CONSENT = 'I confirm that my details are correct and agree to My Student Club sharing my profile with recruiters and sending me relevant opportunities and updates via email.';
  // The promotional-emails tick-box on the sign-up pages. Recruiter sharing is not asked here: the site asks for it when a
  // CV is uploaded (portal3.js prompt, profile toggle). The wording must match record_signup_consent() in
  // supabase/migrations/202611070001_signup_consent_and_portal.sql, which stores it with the server time.
  const SIGNUP_CONSENT = {
    version: '2026-11-07',
    // Padam's call (6 Nov 2026): the box starts ticked and the student can untick it. Set false to start unticked.
    defaultChecked: true,
    boxes: [
      { name: 'promotional', text: 'Email me about new batches, events, updates and offers.' }
    ]
  };
  const SIGNUP_CONSENT_PENDING = 'msc_signup_consent_pending';
  let identity = null;
  let activeModal = null;
  let activeOnboarding = null;
  let authBound = false;
  let onboardingStarting = false;
  const completed = new Map();
  const client = () => global.supabaseClient || global.getSupabaseClient?.();
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeGet = key => { try { return sessionStorage.getItem(key); } catch (_) { return null; } };
  const safeSet = (key, value) => { try { sessionStorage.setItem(key, value); } catch (_) {} };
  function clearGuestState() {
    completed.clear();
    try {
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const key = sessionStorage.key(i);
        if (key === 'msc_lead_submitted' || key === 'msc_career_auth_pending' || key === 'msc_career_auth_redirect' || key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
      }
    } catch (_) {}
    activeModal?.cancel();
    activeOnboarding?.cancel();
  }
  async function currentUser() {
    const db = client();
    if (!db) throw new Error('Unable to connect. Please reload this page and try again.');
    if (!authBound) {
      authBound = true;
      db.auth.onAuthStateChange((event, session) => {
        const next = session?.user?.id || 'guest';
        if (event === 'SIGNED_OUT' || (identity && identity !== next)) clearGuestState();
        identity = next;
      });
    }
    const { data, error } = await db.auth.getSession();
    if (error) throw error;
    const user = data?.session?.user || null;
    const next = user?.id || 'guest';
    if (identity && identity !== next) clearGuestState();
    identity = next;
    // Legacy completion was shared across every user and every resource category.
    try { sessionStorage.removeItem('msc_lead_submitted'); } catch (_) {}
    return user;
  }
  function loadStyles() {
    if (document.querySelector('link[data-msc-career]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = '/scripts/career-profile.css?v=20261107.1'; link.dataset.mscCareer = 'true';
    document.head.appendChild(link);
  }
  function select(name, label, options, selected = '') {
    return `<label class="msc-career-field">${label}<select name="${name}" required><option value="">Select</option>${options.map(option => {
      const [value, text] = Array.isArray(option) ? option : [option, option];
      return `<option value="${escapeHTML(value)}"${String(value) === String(selected) ? ' selected' : ''}>${escapeHTML(text)}</option>`;
    }).join('')}</select></label>`;
  }
  function input(name, label, type = 'text', value = '', extra = '') {
    return `<label class="msc-career-field">${label}<input name="${name}" type="${type}" value="${escapeHTML(value)}" required ${extra}></label>`;
  }
  function stageFields(stage, values = {}) {
    const years = Array.from({ length: 27 }, (_, i) => String(2024 + i));
    let html = '';
    if (stage === 'ca-fresher') html += select('status', 'Current Status', ['Qualified', 'Result Awaited', 'Yet to Appear'], values.status);
    if (stage === 'articleship') html += select('status', 'Current Status', ['Cleared CA Intermediate Both Groups', 'Cleared one group', 'Results Awaited', 'Yet to Appear the Exams'], values.status);
    if (stage === 'semi-qualified') html += select('status', 'Current Status', ['Awaiting Results', 'Yet to Appear', 'Paused', 'Discontinued CA studies'], values.status);
    if (['experienced-ca','ca-fresher','industrial-training','articleship'].includes(stage)) {
      const inter = stage === 'articleship';
      const months = inter ? [['May','May'],['September','Sep'],['January','Jan']] : stage === 'experienced-ca' ? ['January','February','March','April','May','June','July','August','September','October','November','December'] : [['May','May'],['November','Nov']];
      // Experienced members can have historical qualification dates; other paths use the requested 2024–2050 range.
      const attemptYears = stage === 'experienced-ca' ? Array.from({ length: 101 }, (_, i) => String(1950 + i)) : years;
      html += `<fieldset class="msc-career-attempt"><legend>${inter ? 'CA Inter' : 'CA Final'} Attempt</legend><div class="msc-career-row">${select('attempt_month','Month',months,values.attempt_month)}${select('attempt_year','Year',attemptYears,values.attempt_year)}</div></fieldset>`;
    }
    if (['industrial-training','experienced-ca','semi-qualified'].includes(stage)) html += input('earliest_joining_date', stage === 'industrial-training' ? 'Earliest Joining Date for Industrial Training' : 'Earliest Joining Date', 'date', values.earliest_joining_date, 'min="2024-01-01" max="2050-12-31"');
    if (stage === 'industrial-training') html += input('industrial_training_eligibility_date','Industrial Training Eligibility Date','date',values.industrial_training_eligibility_date,'min="2024-01-01" max="2050-12-31"');
    if (stage === 'semi-qualified') html += select('experience_type','Years of Experience Excluding Articleship',[['fresher','Fresher'],['other','Other']],values.experience_type);
    if (['experienced-ca','semi-qualified'].includes(stage)) html += `<div data-experience-fields${stage === 'semi-qualified' && values.experience_type !== 'other' ? ' hidden' : ''}><div class="msc-career-row">${select('experience_years', stage === 'semi-qualified' ? 'Years (excluding articleship)' : 'Years of Experience',Array.from({length:61},(_,i)=>String(i)),values.experience_years)}${select('experience_months','Months',Array.from({length:12},(_,i)=>String(i)),values.experience_months)}</div></div>`;
    if (stage === 'other') html += input('other_stage','Please describe your career stage','text',values.other_stage,'maxlength="120"');
    return html;
  }
  function disclosure(stage) {
    return `<div class="msc-career-disclosure"><p><strong>Before you submit:</strong> Please recheck all details, especially the <strong>year and date fields</strong>${stage === 'industrial-training' ? ' in your <strong>Industrial Training eligibility date</strong>' : ''}, as these will appear in your profile shared with recruiters.</p><label class="msc-career-consent"><input type="checkbox" name="sharing_consent" required><span>${CONSENT}</span></label></div>`;
  }
  // Icon cards for the five portals. Icons and colours match the site's "What are you looking for?" picker.
  const STAGE_CARDS = [
    ['industrial-training', '#4f46e5,#6366f1', '<path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/>'],
    ['articleship', '#059669,#10b981', '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>'],
    ['ca-fresher', '#d97706,#f59e0b', '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>'],
    ['experienced-ca', '#ea580c,#fb923c', '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>'],
    ['semi-qualified', '#7c3aed,#8b5cf6', '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M8 7h6"/><path d="M8 11h8"/>']
  ];
  function stageCards(label, selected = '') {
    const cards = STAGE_CARDS.map(([stage, colours, icon]) => `<label class="msc-stage-card${stage === selected ? ' is-selected' : ''}"><input type="radio" name="career_stage" value="${stage}" required${stage === selected ? ' checked' : ''}><span class="msc-stage-icon" style="background:linear-gradient(135deg,${colours})"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg></span><span>${escapeHTML(STAGES[stage])}</span></label>`).join('');
    return `<fieldset class="msc-stage-cards"><legend>${escapeHTML(label)}</legend>${cards}</fieldset>`;
  }
  function mountFields(container, options = {}) {
    loadStyles();
    const fixedStage = options.stage;
    const initial = options.values || {};
    const stages = Object.entries(STAGES).filter(([stage]) => options.allowOther || stage !== 'other').map(([stage,label]) => [stage, options.allowOther && ['industrial-training','articleship'].includes(stage) ? `${label} Aspirant` : label]);
    container.classList.add('msc-career-fields');
    // The sign-up popup shows the portals as icon cards (same look as the site's "What are you looking for?" picker);
    // other forms keep the dropdown.
    const stagePicker = fixedStage ? '' : options.stageCards ? stageCards(options.label || 'What are you looking for?', initial.stage) : select('career_stage',options.label || 'Job Looking For?',stages,initial.stage);
    container.innerHTML = `${stagePicker}<div data-stage-fields></div><div data-disclosure></div>`;
    const stageSelect = container.querySelector('select[name="career_stage"]');
    const currentStage = () => fixedStage || stageSelect?.value || container.querySelector('input[name="career_stage"]:checked')?.value || '';
    container.querySelectorAll('input[name="career_stage"]').forEach(radio => radio.addEventListener('change', () => {
      container.querySelectorAll('.msc-stage-card').forEach(card => card.classList.toggle('is-selected', card.querySelector('input').checked));
      redraw();
    }));
    const redraw = () => {
      const stage = currentStage();
      container.querySelector('[data-stage-fields]').innerHTML = stage ? stageFields(stage, initial) : '';
      // The sign-up popup asks no consent: that was given by the tick-boxes on the sign-up page.
      container.querySelector('[data-disclosure]').innerHTML = stage && !options.noConsent ? disclosure(stage) : '';
      const type = container.querySelector('[name="experience_type"]');
      const experience = container.querySelector('[data-experience-fields]');
      const setExperience = () => {
        if (!experience || !type) return;
        experience.hidden = type.value !== 'other';
        experience.querySelectorAll('select').forEach(el => { el.disabled = experience.hidden; });
      };
      type?.addEventListener('change', setExperience); setExperience();
    };
    stageSelect?.addEventListener('change', redraw); redraw();
    return {
      read() {
        const stage = currentStage();
        const result = options.noConsent ? { stage } : { stage, consent_version: VERSION, consent_text: CONSENT, consent_at: new Date().toISOString() };
        container.querySelectorAll('input,select').forEach(el => {
          if (el.disabled || el.name === 'career_stage') return;
          result[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
        });
        if (options.noConsent) {
          if (!STAGES[stage]) throw new Error('Please choose what you are looking for.');
          return result;
        }
        if (!STAGES[stage] || !result.sharing_consent) throw new Error('Please complete your career details and confirm the disclosure.');
        return result;
      }
    };
  }
  function cacheKey(user, stage) { return `${PREFIX}${user?.id || 'guest'}:${stage}`; }
  async function existingDetails(user, stage) {
    const key = cacheKey(user, stage);
    if (completed.has(key)) return completed.get(key);
    if (!user) {
      try {
        const saved = JSON.parse(safeGet(key) || 'null');
        return saved?.stage === stage && saved.consent_version === VERSION && saved.sharing_consent ? saved : null;
      } catch (_) { return null; }
    }
    const { data, error } = await client().from('career_intakes').select('details,consent_version').eq('user_id', user.id).eq('stage', stage).maybeSingle();
    if (error) throw new Error('Unable to load your saved details. Please try again.');
    if (data?.consent_version === VERSION && data.details?.sharing_consent) {
      completed.set(key,data.details); return data.details;
    }
    return null;
  }
  async function hasEnrollment(user) {
    if (!user) return false;
    if (global.MSCProgramAccess?.getAccess) {
      const access = await global.MSCProgramAccess.getAccess(client());
      if (access.error) throw new Error('Unable to verify program access. Please try again.');
      return Boolean(access.hasAccess);
    }
    const { data, error } = await client().from('enrollment').select('course').eq('uuid',user.id);
    if (error) throw new Error('Unable to verify program access. Please try again.');
    return (data || []).some(row => ['industrial-training-mastery','msc-ca-freshers-program','msc-ca-articleship-program','articleship-program'].includes(row.course));
  }
  async function persist(details, source, expectedUser, rpcName = 'submit_career_intake') {
    const user = await currentUser();
    if ((expectedUser?.id || 'guest') !== (user?.id || 'guest')) throw new Error('Your account changed. Please reopen this form.');
    // Authenticated identity always comes from the current session, never a cached form or another account.
    const normalized = { ...details, email: user?.email || details.email, name: details.name || user?.user_metadata?.full_name || user?.user_metadata?.name };
    const { error } = await client().rpc(rpcName, { p_stage: details.stage, p_details: normalized, p_source: {...source,user_agent:navigator.userAgent || ''} });
    if (error) throw new Error('We could not save your details. Please try again; your form has been kept.');
    const key = cacheKey(user,details.stage);
    completed.set(key,normalized);
    safeSet(`${PREFIX}${user?.id || 'guest'}:current-stage`,details.stage);
    global.dispatchEvent(new CustomEvent('msc-career-profile-saved',{detail:{stage:details.stage}}));
    if (!user) safeSet(key,JSON.stringify(normalized));
    return normalized;
  }
  function formModal(options, user) {
    const scope = `${user?.id || 'guest'}:${options.source?.kind || 'intake'}:${options.stage || 'choose-stage'}`;
    // One category's open form must never authorize a simultaneous request for another.
    if (activeModal) return activeModal.scope === scope ? activeModal.promise : Promise.resolve(false);
    loadStyles();
    const previousFocus = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    const backdrop = document.createElement('div'); backdrop.className = 'msc-career-overlay';
    const meta = user?.user_metadata || {};
    const google = user?.app_metadata?.provider === 'google' || user?.identities?.some(item=>item.provider === 'google');
    const googleIdentity = Boolean(google && user?.email && String(meta.full_name || meta.name || '').trim());
    const identityFields = googleIdentity ? '<p class="msc-career-account">Your name and email are supplied by your Google account.</p>' : `${input('name','Name','text',meta.full_name || meta.name || '', 'autocomplete="name" maxlength="160"')}${user?.email ? '' : input('email','Email','email','','autocomplete="email"')}`;
    // The sign-up popup asks only the portal and its questions: no name, phone or consent (given on the sign-up page).
    const personalFields = options.signupIntake ? '' : `${identityFields}${input('phone','Phone Number','tel',meta.phone || '', 'autocomplete="tel" pattern="[+]?[0-9]{10,15}" maxlength="16"')}`;
    const closeButton = options.required ? '' : '<button type="button" class="msc-career-close" aria-label="Close">×</button>';
    backdrop.innerHTML = `<section class="msc-career-dialog" role="dialog" aria-modal="true" aria-labelledby="msc-career-title">${closeButton}<h2 id="msc-career-title">${escapeHTML(options.title || 'Access Resource')}</h2><p>${escapeHTML(options.subtitle || 'Share your details to access free resources and relevant opportunities.')}</p><form class="msc-career-form">${personalFields}<div data-career-fields></div><p class="msc-career-error" role="alert" hidden></p><button type="submit" class="msc-career-primary">${escapeHTML(options.submitLabel || 'Continue')}</button></form></section>`;
    document.body.appendChild(backdrop); document.body.style.overflow = 'hidden';
    const fields = mountFields(backdrop.querySelector('[data-career-fields]'),{ stage:options.stage,allowOther:options.allowOther,label:options.stageLabel,values:options.values,noConsent:options.signupIntake,stageCards:options.signupIntake });
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const close = result => {
      document.removeEventListener('keydown', keyHandler); backdrop.remove(); document.body.style.overflow = originalOverflow; activeModal = null; previousFocus?.focus?.(); resolve(result);
    };
    const keyHandler = event => {
      if (event.key === 'Escape' && !options.required) close(false);
      if (event.key !== 'Tab') return;
      const focusable = [...backdrop.querySelectorAll('button,input,select,a[href]')].filter(el => !el.disabled && el.offsetParent !== null);
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0]?.focus(); }
    };
    document.addEventListener('keydown',keyHandler);
    backdrop.querySelector('.msc-career-close')?.addEventListener('click',()=>close(false));
    backdrop.addEventListener('click',event=>{if(event.target === backdrop && !options.required) close(false);});
    backdrop.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, button = form.querySelector('button[type="submit"]'), error = form.querySelector('[role="alert"]');
      if (!form.reportValidity()) return;
      button.disabled = true; button.textContent = 'Saving…'; error.hidden = true;
      try {
        const data = new FormData(form), details = fields.read();
        if (options.signupIntake) {
          // Name from the account (sign-up form or Google); email from the session; no phone.
          details.name = String(meta.full_name || meta.name || '').trim();
          details.email = user?.email || '';
          const saved = await persist(details,options.source,user,'submit_signup_career_intake'); close(saved);
          return;
        }
        details.name = googleIdentity ? String(meta.full_name || meta.name).trim() : String(data.get('name') || '').trim();
        details.email = user?.email || String(data.get('email') || '').trim();
        details.phone = String(data.get('phone') || '').trim();
        const saved = await persist(details,options.source,user); close(saved);
      } catch (err) { error.textContent = err.message; error.hidden = false; button.disabled = false; button.textContent = options.submitLabel || 'Continue'; }
    });
    activeModal = { scope, promise, cancel:()=>close(false) };
    backdrop.querySelector('input,select')?.focus();
    return promise;
  }
  async function ensureForResource(stage, title, url) {
    const user = await currentUser();
    if (await hasEnrollment(user)) return true;
    const saved = await existingDetails(user,stage);
    if (saved) return true;
    return Boolean(await formModal({ stage,source:{kind:'resource',title,url},submitLabel:'Access Resource' },user));
  }
  async function ensureForTool(toolName) {
    const user = await currentUser();
    if (await hasEnrollment(user)) return true;
    // Each tool uses the same career data for the current account, but never inherits a different category's resource completion.
    const key = `${PREFIX}${user?.id || 'guest'}:tool-stage`;
    let stage = safeGet(key) || safeGet(`${PREFIX}${user?.id || 'guest'}:current-stage`);
    if (!stage && user) {
      const {data,error} = await client().from('career_intakes').select('stage,details,consent_version').eq('user_id',user.id).eq('consent_version',VERSION).order('updated_at',{ascending:false}).limit(1);
      if (error) throw new Error('Unable to load your saved career details. Please try again.');
      if (data?.[0]?.details?.sharing_consent) stage = data[0].stage || data[0].details.stage;
    }
    if (stage && await existingDetails(user,stage)) {
      safeSet(key,stage); safeSet(`${PREFIX}${user?.id || 'guest'}:current-stage`,stage);
      return true;
    }
    const result = await formModal({title:'Tell us about your career stage',subtitle:'Get support and opportunities relevant to your next step.',stageLabel:'Your Career Stage',allowOther:true,source:{kind:'tool',title:toolName,url:location.pathname}},user);
    if (result) safeSet(key,result.stage);
    return Boolean(result);
  }
  // ---- Sign-up consent and the required portal popup ----
  // The tick-box on the sign-up pages. read() -> {promotional, version}.
  function mountSignupConsent(container) {
    if (!container) return { read: () => null };
    loadStyles();
    container.classList.add('msc-signup-consent');
    container.innerHTML = SIGNUP_CONSENT.boxes.map(box => `<label class="msc-career-consent"><input type="checkbox" name="msc_consent_${box.name}"${SIGNUP_CONSENT.defaultChecked ? ' checked' : ''}><span>${escapeHTML(box.text)}</span></label>`).join('');
    return {
      read() {
        const ticked = name => Boolean(container.querySelector(`[name="msc_consent_${name}"]`)?.checked);
        return { promotional: ticked('promotional'), version: SIGNUP_CONSENT.version };
      }
    };
  }
  // Google sign-up leaves the page before an account exists, so the boxes travel in sessionStorage until login completes.
  function rememberSignupConsent(consent) {
    if (consent?.version === SIGNUP_CONSENT.version) safeSet(SIGNUP_CONSENT_PENDING, JSON.stringify(consent));
  }
  // Records the sign-up boxes once (server time and wording in the database). True once they are recorded; false for
  // accounts that never used the new sign-up, or while the database part is not live yet.
  async function recordSignupConsent(user) {
    const meta = user?.user_metadata || {};
    if (meta.msc_signup_consent_recorded) return true;
    let consent = meta.msc_signup_consent;
    if (!consent) { try { consent = JSON.parse(safeGet(SIGNUP_CONSENT_PENDING) || 'null'); } catch (_) { consent = null; } }
    if (!consent || consent.version !== SIGNUP_CONSENT.version) return false;
    const { error } = await client().rpc('record_signup_consent', { p_promotional: Boolean(consent.promotional), p_version: consent.version });
    if (error) { console.warn('Sign-up consent could not be recorded yet:', error.message); return false; }
    try { sessionStorage.removeItem(SIGNUP_CONSENT_PENDING); } catch (_) {}
    const { error: metaError } = await client().auth.updateUser({ data: { msc_signup_consent: consent, msc_signup_consent_recorded: true } });
    if (metaError) console.warn('Could not remember that sign-up consent was recorded.');
    return true;
  }
  // The required portal popup: only for accounts whose sign-up consent is recorded (so never for existing students, and
  // never while the database part is missing), and only until they have answered once.
  async function offerSignupIntake(user) {
    const doneKey = `${PREFIX}${user.id}:signup-intake-done`;
    // A new sign-up who refreshed or closed the tab on the "complete your profile" popup has not answered it yet.
    const profilePopupPending = Boolean(user.user_metadata?.msc_signup_consent) && !user.user_metadata?.msc_onboarding_seen;
    if (safeGet(doneKey) && !profilePopupPending) return true;
    if (!(await recordSignupConsent(user))) return true;
    const { data, error } = await client().from('career_intakes').select('stage, details').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1);
    if (error) return true;
    if (data?.length) {
      safeSet(doneKey, '1');
      if (!profilePopupPending) return true;
      // Portal already chosen: show the profile popup again, then go to that portal.
      await afterSignupIntake(user, { ...(data[0].details || {}), stage: data[0].stage });
      return false;
    }
    const saved = await formModal({
      title: 'One last step',
      subtitle: 'Tell us what you are looking for, so we can show you the right jobs and opportunities.',
      stageLabel: 'What are you looking for?',
      submitLabel: 'Continue',
      required: true,
      signupIntake: true,
      source: { kind: 'signup-intake', title: 'Account signup', url: location.pathname }
    }, user);
    if (!saved) return saved !== null;
    safeSet(doneKey, '1');
    // Then the "complete your profile" popup once, then the portal they chose. The caller stops here (navigation).
    await afterSignupIntake(user, saved);
    return false;
  }
  // The portal page for each choice, and the job_preference value portal3.js uses on those pages.
  const PORTAL_PAGES = {
    'industrial-training': '/',
    'articleship': '/ca-articleship-opportunities',
    'ca-fresher': '/ca-fresher-jobs',
    'experienced-ca': '/experienced-ca-jobs',
    'semi-qualified': '/semi-qualified-ca-jobs'
  };
  function portalPreference(saved) {
    switch (saved?.stage) {
      case 'industrial-training': return 'industrial';
      case 'articleship': return 'articleship';
      case 'ca-fresher': return 'fresher_fresher';
      case 'experienced-ca': return 'fresher_experienced';
      case 'semi-qualified': return saved.experience_type === 'fresher' ? 'semi_fresher' : 'semi_experienced';
      default: return null;
    }
  }
  async function afterSignupIntake(user, saved) {
    const preference = portalPreference(saved);
    if (preference) { try { localStorage.setItem('userJobPreference', preference); } catch (_) {} }
    let target = PORTAL_PAGES[saved.stage] || '/';
    if (!user.user_metadata?.msc_onboarding_seen) {
      const completeProfile = await showOnboarding();
      if (completeProfile === null) return;
      if (completeProfile) target = '/profile.html?onboarding=1#sec-resume';
      const { error } = await client().auth.updateUser({ data: { msc_onboarding_seen: true } });
      if (error) console.warn('Could not remember onboarding dismissal.');
    }
    try { sessionStorage.removeItem('msc_career_auth_pending'); sessionStorage.removeItem('msc_career_auth_redirect'); } catch (_) {}
    const here = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
    if (here !== target) global.location.href = target;
  }
  async function finishAuth(user, redirect) {
    const authenticated = await currentUser();
    if (!authenticated || (user && user.id !== authenticated.id)) return false;
    user = authenticated;
    redirect = safeRedirect(redirect || user.user_metadata?.msc_auth_redirect || '/');
    const metadata = user.user_metadata || {};
    try {
      if (!(await offerSignupIntake(user))) return false;
    } catch (error) {
      console.warn('Sign-up details step skipped:', error.message);
    }
    if (metadata.msc_career_intake?.sharing_consent) {
      try {
        const stage = metadata.msc_career_intake.stage;
        if (!(await existingDetails(user,stage))) {
          await persist({...metadata.msc_career_intake,name:metadata.full_name || metadata.name || metadata.msc_career_intake.name,email:user.email},{kind:'signup',title:'Account signup',url:'/login.html'},user);
        }
      } catch (error) {
        console.warn('Optional career details could not be saved:',error.message);
      }
    }
    if (!metadata.msc_onboarding_seen) {
      const completeProfile = await showOnboarding();
      if (completeProfile === null || (await currentUser())?.id !== user.id) return false;
      if (completeProfile) redirect = '/profile.html?onboarding=1#sec-resume';
      const { error } = await client().auth.updateUser({data:{msc_onboarding_seen:true}});
      if (error) console.warn('Could not remember onboarding dismissal.');
    }
    try { sessionStorage.removeItem('msc_career_auth_pending'); sessionStorage.removeItem('msc_career_auth_redirect'); } catch (_) {}
    global.location.href = safeRedirect(redirect);
    return true;
  }
  function safeRedirect(value) { try { const target = new URL(value,location.origin); return target.origin === location.origin ? target.pathname + target.search + target.hash : '/'; } catch (_) { return '/'; } }
  function showOnboarding() {
    if (activeOnboarding) return activeOnboarding.promise;
    loadStyles();
    const previousFocus = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    let cancel;
    const promise = new Promise(resolve=>{
      const box=document.createElement('div');box.className='msc-career-overlay';
      box.innerHTML='<section class="msc-career-dialog msc-onboarding" role="dialog" aria-modal="true" aria-labelledby="msc-onboarding-title"><p class="msc-career-eyebrow">YOUR NEXT OPPORTUNITY</p><h2 id="msc-onboarding-title">Don’t just search for jobs. Let recruiters find you.</h2><p>Share your details in <strong>less than 2 minutes</strong> with <strong>MSC’s network of 1,000+ recruiters</strong>. Let your next opportunity find you.</p><div class="msc-onboarding-steps"><span>1. Add your CV</span><span>2. Complete education &amp; experience</span><span>3. Set your availability</span></div><a href="/profile.html?onboarding=1#sec-resume" class="msc-career-primary">Complete My Profile →</a><button type="button" class="msc-career-later">I’ll do this later</button></section>';
      document.body.appendChild(box);
      document.body.style.overflow = 'hidden';
      const close = result => {
        document.removeEventListener('keydown',keyHandler); box.remove();
        document.body.style.overflow = originalOverflow; activeOnboarding = null;
        previousFocus?.focus?.(); resolve(result);
      };
      const keyHandler = event => {
        const first = box.querySelector('a'), last = box.querySelector('button');
        if (event.key === 'Escape') { event.preventDefault(); close(false); }
        if (event.key === 'Tab' && event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (event.key === 'Tab' && !event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      };
      document.addEventListener('keydown',keyHandler);
      cancel = () => close(null);
      box.querySelector('a').addEventListener('click',event=>{event.preventDefault();safeSet('msc_profile_tour','1');close(true);});
      box.querySelector('button').addEventListener('click',()=>close(false));
      box.querySelector('a').focus();
    });
    activeOnboarding = {promise,cancel};
    return promise;
  }
  function startProfileTour() {
    if (document.querySelector('.msc-profile-tour')) return;
    if (!location.pathname.includes('profile') || !(new URLSearchParams(location.search).has('onboarding') || safeGet('msc_profile_tour'))) return;
    loadStyles();
    try { sessionStorage.removeItem('msc_profile_tour'); } catch (_) {}
    const banner=document.createElement('aside'); banner.className='msc-profile-tour';
    banner.innerHTML='<strong>Complete Profile</strong><span>Start with your CV, then complete these sections so recruiters can find you.</span><nav><a href="#sec-resume">1. CV</a><a href="#sec-ca-education">2. Education</a><a href="#sec-career">3. Career preferences</a><a href="#sec-availability">4. Availability</a><a href="#sec-personal">5. Personal details</a></nav><button type="button" aria-label="Dismiss profile guide">×</button>';
    (document.querySelector('main') || document.body).prepend(banner);
    const sections=['sec-resume','sec-ca-education','sec-career','sec-availability','sec-personal'];
    sections.forEach(id=>document.getElementById(id)?.classList.add('msc-profile-highlight'));
    banner.querySelector('button').addEventListener('click',()=>{banner.remove();sections.forEach(id=>document.getElementById(id)?.classList.remove('msc-profile-highlight'));});
  }
  function markAuthPending(redirect = '/') {
    safeSet('msc_career_auth_pending','1');
    safeSet('msc_career_auth_redirect',safeRedirect(redirect));
  }
  async function initOnboarding() {
    startProfileTour();
    // Auth pages already own their confirmation flow. Other pages can be OAuth fallbacks.
    if (onboardingStarting || /\/(?:login|sign-up)(?:\.html)?\/?$/.test(location.pathname)) return;
    onboardingStarting = true;
    try {
      const user = await currentUser();
      if (!user) return;
      // A new sign-up who closed the tab before answering the portal popup gets it on whatever page they open next.
      try {
        if (!(await offerSignupIntake(user))) return;
      } catch (error) {
        console.warn('Sign-up details step skipped:', error.message);
      }
      const emailSignupPending = user.user_metadata?.msc_career_intake?.sharing_consent && !user.user_metadata?.msc_onboarding_seen;
      if (!safeGet('msc_career_auth_pending') && !emailSignupPending) return;
      await finishAuth(user,safeGet('msc_career_auth_redirect') || (emailSignupPending && user.user_metadata?.msc_auth_redirect) || location.pathname + location.search);
    } catch (error) {
      const notice = document.createElement('aside');
      notice.className = 'msc-profile-tour'; notice.setAttribute('role','alert');
      const message = document.createElement('span'); message.textContent = error.message;
      const retry = document.createElement('a'); retry.href = '/login.html'; retry.textContent = 'Complete signup';
      notice.append(message,retry); document.body.prepend(notice);
    } finally { onboardingStarting = false; }
  }
  global.MSCCareerProfile = {initOnboarding,markAuthPending,getCurrentStage:()=>safeGet(`${PREFIX}${identity || 'guest'}:current-stage`),ensureForTool,ensureForResource,mountFields,finishAuth,safeRedirect,clearGuestState,STAGES,mountSignupConsent,rememberSignupConsent,SIGNUP_CONSENT};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',startProfileTour); else startProfileTour();
})(window);
