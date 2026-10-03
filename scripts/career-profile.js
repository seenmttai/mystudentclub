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
    link.rel = 'stylesheet'; link.href = '/scripts/career-profile.css?v=20260927.9'; link.dataset.mscCareer = 'true';
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
    if (stage === 'industrial-training') html += input('industrial_training_eligibility_date','Eligibility Date','date',values.industrial_training_eligibility_date,'min="2024-01-01" max="2050-12-31"');
    if (stage === 'semi-qualified') html += select('experience_type','Years of Experience Excluding Articleship',[['fresher','Fresher'],['other','Other']],values.experience_type);
    if (['experienced-ca','semi-qualified'].includes(stage)) html += `<div data-experience-fields${stage === 'semi-qualified' && values.experience_type !== 'other' ? ' hidden' : ''}><div class="msc-career-row">${select('experience_years', stage === 'semi-qualified' ? 'Years (excluding articleship)' : 'Years of Experience',Array.from({length:61},(_,i)=>String(i)),values.experience_years)}${select('experience_months','Months',Array.from({length:12},(_,i)=>String(i)),values.experience_months)}</div></div>`;
    if (stage === 'other') html += input('other_stage','Please describe your career stage','text',values.other_stage,'maxlength="120"');
    return html;
  }
  function disclosure(stage) {
    return `<div class="msc-career-disclosure"><p><strong>Before you submit:</strong> Please recheck all details, especially the <strong>year and date fields</strong>${stage === 'industrial-training' ? ' in your <strong>eligibility date</strong>' : ''}, as these will appear in your profile shared with recruiters.</p><label class="msc-career-consent"><input type="checkbox" name="sharing_consent" required><span>${CONSENT}</span></label></div>`;
  }
  function mountFields(container, options = {}) {
    loadStyles();
    const fixedStage = options.stage;
    const initial = options.values || {};
    const stages = Object.entries(STAGES).filter(([stage]) => options.allowOther || stage !== 'other').map(([stage,label]) => [stage, options.allowOther && ['industrial-training','articleship'].includes(stage) ? `${label} Aspirant` : label]);
    container.classList.add('msc-career-fields');
    container.innerHTML = `${fixedStage ? '' : select('career_stage',options.label || 'Job Looking For?',stages,initial.stage)}<div data-stage-fields></div><div data-disclosure></div>`;
    const stageSelect = container.querySelector('[name="career_stage"]');
    const redraw = () => {
      const stage = fixedStage || stageSelect.value;
      container.querySelector('[data-stage-fields]').innerHTML = stage ? stageFields(stage, initial) : '';
      container.querySelector('[data-disclosure]').innerHTML = stage ? disclosure(stage) : '';
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
        const stage = fixedStage || stageSelect.value;
        const result = { stage, consent_version: VERSION, consent_text: CONSENT, consent_at: new Date().toISOString() };
        container.querySelectorAll('input,select').forEach(el => {
          if (el.disabled || el.name === 'career_stage') return;
          result[el.name] = el.type === 'checkbox' ? el.checked : el.value.trim();
        });
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
  async function persist(details, source, expectedUser) {
    const user = await currentUser();
    if ((expectedUser?.id || 'guest') !== (user?.id || 'guest')) throw new Error('Your account changed. Please reopen this form.');
    // Authenticated identity always comes from the current session, never a cached form or another account.
    const normalized = { ...details, email: user?.email || details.email, name: details.name || user?.user_metadata?.full_name || user?.user_metadata?.name };
    const { error } = await client().rpc('submit_career_intake', { p_stage: details.stage, p_details: normalized, p_source: {...source,user_agent:navigator.userAgent || ''} });
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
    backdrop.innerHTML = `<section class="msc-career-dialog" role="dialog" aria-modal="true" aria-labelledby="msc-career-title"><button type="button" class="msc-career-close" aria-label="Close">×</button><h2 id="msc-career-title">${escapeHTML(options.title || 'Access Resource')}</h2><p>${escapeHTML(options.subtitle || 'Share your details to access free resources and relevant opportunities.')}</p><form class="msc-career-form">${identityFields}${input('phone','Phone Number','tel',meta.phone || '', 'autocomplete="tel" pattern="[+]?[0-9]{10,15}" maxlength="16"')}<div data-career-fields></div><p class="msc-career-error" role="alert" hidden></p><button type="submit" class="msc-career-primary">${escapeHTML(options.submitLabel || 'Continue')}</button></form></section>`;
    document.body.appendChild(backdrop); document.body.style.overflow = 'hidden';
    const fields = mountFields(backdrop.querySelector('[data-career-fields]'),{ stage:options.stage,allowOther:options.allowOther,label:options.stageLabel,values:options.values });
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
    backdrop.querySelector('.msc-career-close').addEventListener('click',()=>close(false));
    backdrop.addEventListener('click',event=>{if(event.target === backdrop && !options.required) close(false);});
    backdrop.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, button = form.querySelector('button[type="submit"]'), error = form.querySelector('[role="alert"]');
      if (!form.reportValidity()) return;
      button.disabled = true; button.textContent = 'Saving…'; error.hidden = true;
      try {
        const data = new FormData(form), details = fields.read();
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
  async function finishAuth(user, redirect) {
    const authenticated = await currentUser();
    if (!authenticated || (user && user.id !== authenticated.id)) return false;
    user = authenticated;
    redirect = safeRedirect(redirect || user.user_metadata?.msc_auth_redirect || '/');
    let hasIntake = false;
    const metadata = user.user_metadata || {};
    if (metadata.msc_career_intake?.sharing_consent) {
      const stage = metadata.msc_career_intake.stage;
      hasIntake = Boolean(await existingDetails(user,stage));
      if (!hasIntake) { await persist({...metadata.msc_career_intake,name:metadata.full_name || metadata.name || metadata.msc_career_intake.name,email:user.email},{kind:'signup',title:'Account signup',url:'/login.html'},user); hasIntake = true; }
    } else {
      const {data,error} = await client().from('career_intakes').select('stage').eq('user_id',user.id).eq('consent_version',VERSION).limit(1);
      if (error) throw new Error('Unable to load your signup details. Please try again.');
      hasIntake = Boolean(data?.length);
      if (!hasIntake) hasIntake = Boolean(await formModal({title:'Complete your signup',subtitle:'Tell us what opportunity you are looking for.',required:true,source:{kind:'signup',title:'Account signup',url:'/login.html'},submitLabel:'Save and Continue'},user));
    }
    if (!hasIntake) return false;
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
  global.MSCCareerProfile = {initOnboarding,markAuthPending,getCurrentStage:()=>safeGet(`${PREFIX}${identity || 'guest'}:current-stage`),ensureForTool,ensureForResource,mountFields,finishAuth,safeRedirect,clearGuestState,STAGES};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',startProfileTour); else startProfileTour();
})(window);
