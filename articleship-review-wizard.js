/* Articleship Review Wizard — shared anonymous review submission component.
   Used by articleship-firm-reviews.html and articleship-firm-review.html.
   Requires: Supabase JS client passed to init(); Font Awesome for icons.
   Backend: search_firms / submit_review_step1 / update_review_progress RPCs. */
(function () {
  'use strict';

  // ── Catalogs ──────────────────────────────────────────────────────────
  const DOMAIN_OPTIONS = ['Statutory Audit','Internal Audit','Bank Audit','Concurrent Audit','Income Tax','GST','Direct Tax','Indirect Tax','Accounting','Outsourcing','Due Diligence','Valuation','Transaction Advisory','Risk Advisory','Forensic Audit','Transfer Pricing','FEMA','IBC','Company Law / ROC','Management Consultancy','Other'];
  const CLIENT_OPTIONS = ['Listed Companies','Unlisted Companies','Startups','MSMEs','Banks','NBFCs','Manufacturing','IT / SaaS','Government / PSU','Foreign Clients','Trusts / NGOs','HNIs'];
  const SKILL_OPTIONS = ['Excel','SAP','Oracle','Power BI','Income Tax','GST','Internal Audit','Statutory Audit','Financial Modelling','Ind AS / IFRS','Automation','Data Analytics'];

  const RATING_FIELDS = [
    ['learning_exposure_rating', 'Learning Exposure'],
    ['partner_accessibility_rating', 'Partner Accessibility'],
    ['work_culture_rating', 'Work Culture'],
    ['work_life_balance_rating', 'Work-Life Balance'],
    ['stipend_timeliness_rating', 'Stipend Timeliness'],
    ['leave_support_rating', 'Leave Support'],
    ['transfer_support_rating', 'Transfer Support'],
  ];

  const LABELS = {
    transfer_requested: { yes: 'Yes', no: 'No', not_sure: 'Not Sure' },
    transfer_approved: { yes: 'Yes', no: 'No', mixed: 'Mixed' },
    allow_industrial_training: { yes: 'Yes', no: 'No', depends: 'Depends on Partner' },
    stipend_on_time: { always: 'Always', sometimes_delayed: 'Sometimes Delayed', frequently_delayed: 'Frequently Delayed' },
    working_hours: { lt8: 'Less than 8 Hours', '8_9': '8–9 Hours', '9_10': '9–10 Hours', '10_12': '10–12 Hours', gt12: 'More than 12 Hours' },
    weekend_working: { never: 'Never', occasionally: 'Occasionally', frequently: 'Frequently' },
    outstation_travel: { never: 'Never', occasionally: 'Occasionally', frequently: 'Frequently' },
    personal_leave: { easy: 'Easy to Get', sometimes_difficult: 'Sometimes Difficult', difficult: 'Difficult to Get' },
  };

  const DRAFT_KEY = 'afr_wizard_draft';
  const DEVICE_KEY = 'afr_device_token';
  const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

  // ── Validation / anti-abuse config ────────────────────────────────────
  const MIN_WORDS = 30;
  const MAX_WORDS = 500;
  const STIPEND_MAX = 50000;
  const STIPEND_YEAR_MIN = 2019;
  const MIN_SUBMIT_MS = 4000; // a fresh form submitted faster than this ⇒ treat as a bot

  // Unverifiable allegations we refuse to publish (whole-word, case-insensitive).
  const ALLEGATION_WORDS = ['fraud', 'fraudulent', 'scam', 'scamster', 'cheat', 'cheated', 'cheating', 'bribe', 'bribery', 'corrupt', 'corruption', 'harass', 'harassed', 'harassment', 'molest', 'molested', 'molestation', 'illegal', 'launder', 'laundering', 'embezzle', 'embezzled', 'embezzlement', 'forgery', 'forged', 'criminal', 'theft', 'stole', 'stolen', 'rape', 'raped', 'casteist', 'casteism', 'racist', 'racism', 'pervert', 'predator'];
  const ALLEGATION_RE = new RegExp('\\b(' + ALLEGATION_WORDS.join('|') + ')\\b', 'i');
  // Honorific + a capitalised word ⇒ names a specific person. CA/Adv share a course-term stoplist.
  const HONORIFIC_RE = /\b(mr|mrs|ms|miss|shri|smt|dr)\b\.?\s+([A-Za-z][a-z]{1,})/gi;
  const TITLE_RE = /\b(ca|adv|advocate)\b\.?\s+([A-Z][a-z]{2,})/;
  const TITLE_STOPWORDS = new Set(['final', 'inter', 'intermediate', 'foundation', 'firm', 'firms', 'course', 'courses', 'exam', 'exams', 'article', 'articles', 'articleship', 'student', 'students', 'result', 'results', 'institute', 'curriculum', 'syllabus', 'practice', 'profession', 'professional', 'fresher', 'freshers', 'aspirant', 'aspirants']);

  function wordCount(s) {
    return String(s || '').trim().split(/\s+/).filter(Boolean).length;
  }
  // Best-effort personal-name detector (backstop is the consent checkbox).
  function namesIndividual(t) {
    let m;
    HONORIFIC_RE.lastIndex = 0;
    while ((m = HONORIFIC_RE.exec(t)) !== null) {
      const name = m[2];
      if (name[0] === name[0].toUpperCase()) return true; // honorific + Capitalised ⇒ a name
    }
    const title = t.match(TITLE_RE);
    return !!(title && !TITLE_STOPWORDS.has(title[2].toLowerCase()));
  }
  // Returns { ok, message } for the free-text review body.
  function validateReviewText(text) {
    const t = String(text || '').trim();
    const words = wordCount(t);
    if (words < MIN_WORDS) {
      return { ok: false, message: `Please write at least ${MIN_WORDS} words so your review is useful to others (currently ${words}).` };
    }
    if (words > MAX_WORDS) {
      return { ok: false, message: `Your review must not exceed ${MAX_WORDS} words.` };
    }
    const alleg = t.match(ALLEGATION_RE);
    if (alleg) {
      return { ok: false, message: `Please remove "${alleg[1]}". We can't publish unverifiable allegations — describe what happened factually instead.` };
    }
    if (namesIndividual(t)) {
      return { ok: false, message: `Please don't name individuals. Remove personal names and refer to the role instead (e.g., "the principal", "a senior").` };
    }
    return { ok: true, message: '' };
  }

  let sb = null;
  let onComplete = null;
  let modal = null;
  let lastFocused = null;
  let state = null; // { step, firmId, firmName, lock, reviewId, editToken, pendingPatch }

  // ── Utils ─────────────────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
  }
  function deviceToken() {
    let t = localStorage.getItem(DEVICE_KEY);
    if (!t) { t = uuid(); localStorage.setItem(DEVICE_KEY, t); }
    return t;
  }
  function normName(s) {
    return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase();
  }
  function loadDraft() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (d && Date.now() - d.savedAt < DRAFT_TTL_MS) return d;
    } catch (e) { /* corrupt draft — ignore */ }
    return null;
  }
  function saveDraft() {
    if (!state) return;
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      reviewId: state.reviewId || null,
      editToken: state.editToken || null,
      firmId: state.firmId || null,
      firmName: state.firmName || '',
      step: state.step || 1,
      pendingPatch: state.pendingPatch || {},
      savedData: state.savedData || {},
      savedAt: Date.now(),
    }));
  }
  function clearDraft() { localStorage.removeItem(DRAFT_KEY); }

  function toast(msg) {
    let t = document.querySelector('.arw-toast');
    if (!t) { t = document.createElement('div'); t.className = 'arw-toast'; document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove('show'), 3000);
  }
  function setStatus(msg, cls) {
    const el = document.getElementById('arw-status');
    if (el) { el.textContent = msg || ''; el.className = 'arw-status' + (cls ? ' ' + cls : ''); }
  }

  // ── Guidelines & safe-harbour disclaimer overlay ──────────────────────
  function openGuidelines() {
    let ov = document.getElementById('arw-guidelines-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'arw-guidelines-overlay';
      ov.className = 'arw-guidelines-overlay';
      ov.innerHTML = `
        <div class="arw-guidelines-card" role="dialog" aria-modal="true" aria-labelledby="arw-guidelines-title">
          <button type="button" class="arw-guidelines-close" aria-label="Close">&times;</button>
          <h3 id="arw-guidelines-title"><i class="fas fa-scale-balanced"></i> Review Guidelines &amp; Disclaimer</h3>
          <p class="arw-guidelines-lead">Reviews are anonymous, first-hand opinions meant to help fellow CA students. Please keep them fair and factual.</p>
          <div class="arw-guidelines-cols">
            <div>
              <h4 class="ok"><i class="fas fa-circle-check"></i> Please do</h4>
              <ul>
                <li>Share your own genuine experience at the firm.</li>
                <li>Be specific about stipend, hours, learning and culture.</li>
                <li>Describe roles ("the principal", "a senior") — not people.</li>
              </ul>
            </div>
            <div>
              <h4 class="no"><i class="fas fa-circle-xmark"></i> Please don't</h4>
              <ul>
                <li>Name individuals or partners.</li>
                <li>Make unverifiable allegations (fraud, harassment, etc.).</li>
                <li>Post hearsay, abuse, or anything you can't stand behind.</li>
              </ul>
            </div>
          </div>
          <p class="arw-guidelines-disclaimer"><i class="fas fa-circle-info"></i> Reviews express the personal opinions of anonymous contributors, not those of My Student Club. As an intermediary we host user-generated content and are not liable for it; reported reviews are examined and removed if they breach these guidelines.</p>
          <button type="button" class="arw-btn-primary arw-guidelines-got">Got it</button>
        </div>`;
      document.body.appendChild(ov);
      const closeOv = () => ov.classList.remove('active');
      ov.querySelector('.arw-guidelines-close').addEventListener('click', closeOv);
      ov.querySelector('.arw-guidelines-got').addEventListener('click', closeOv);
      ov.addEventListener('click', e => { if (e.target === ov) closeOv(); });
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && ov.classList.contains('active')) closeOv();
      });
    }
    ov.classList.add('active');
  }

  let isInline = false;

  // ── Modal / Inline shell ──────────────────────────────────────────────
  function init(client, opts = {}) {
    sb = client;
    onComplete = opts.onComplete || null;
    if (modal) return;

    if (opts.container) {
      isInline = true;
      const target = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
      if (target) {
        modal = document.createElement('div');
        modal.id = 'arw-inline-container';
        modal.className = 'arw-inline-wrapper active';
        modal.innerHTML = `
          <div class="arw-card arw-inline-card" role="region" aria-label="Review Submission Form">
            <div class="arw-header">
              <div>
                <h2 id="arw-title">Share Your Anonymous Review</h2>
                <p class="arw-anon"><i class="fas fa-user-secret"></i> 100% anonymous — we never collect anything that identifies you</p>
              </div>
            </div>
            <div class="arw-progress" hidden>
              <div class="arw-progress-label"><span id="arw-progress-text"></span></div>
              <div class="arw-progress-track"><div class="arw-progress-fill" id="arw-progress-fill"></div></div>
            </div>
            <div class="arw-body" id="arw-body"></div>
          </div>`;
        target.appendChild(modal);
        if (opts.autoOpen !== false) {
          open(opts);
        }
        return;
      }
    }

    modal = document.createElement('div');
    modal.id = 'arw-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="arw-card" role="dialog" aria-modal="true" aria-labelledby="arw-title">
        <div class="arw-header">
          <div>
            <h2 id="arw-title">Share Your Anonymous Review</h2>
            <p class="arw-anon"><i class="fas fa-user-secret"></i> 100% anonymous — we never collect anything that identifies you</p>
          </div>
          <button type="button" class="arw-close" aria-label="Close"><i class="fas fa-times"></i></button>
        </div>
        <div class="arw-progress" hidden>
          <div class="arw-progress-label"><span id="arw-progress-text"></span></div>
          <div class="arw-progress-track"><div class="arw-progress-fill" id="arw-progress-fill"></div></div>
        </div>
        <div class="arw-body" id="arw-body"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.arw-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && modal.classList.contains('active')) close();
    });
    modal.addEventListener('keydown', e => {
      if (e.key !== 'Tab' || !modal.classList.contains('active')) return;
      const focusable = [...modal.querySelectorAll('button,[href],input,textarea')]
        .filter(el => !el.disabled && el.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function open(opts = {}) {
    if (!modal) throw new Error('ArticleshipReviewWizard.init() must be called first.');
    lastFocused = document.activeElement;
    const draft = opts.forceNew ? null : loadDraft();
    const wantsFirm = opts.firmId || null;
    // Resume rules: with a firm id or firm name match, resume draft.
    const firmMatches = draft && (
      wantsFirm ? (draft.firmId === wantsFirm || normName(draft.firmName) === normName(opts.firmName))
      : opts.lock ? normName(draft.firmName) === normName(opts.firmName)
      : true);
    if (firmMatches) {
      state = {
        step: draft.step || 1,
        firmId: draft.firmId || opts.firmId || null,
        firmName: draft.firmName || opts.firmName || '',
        lock: !!opts.lock,
        reviewId: draft.reviewId || null,
        editToken: draft.editToken || null,
        pendingPatch: draft.pendingPatch || {},
        savedData: draft.savedData || {},
      };
    } else {
      state = {
        step: 1, firmId: opts.firmId || null, firmName: opts.firmName || '',
        lock: !!opts.lock, reviewId: null, editToken: null, pendingPatch: {},
        savedData: {},
      };
    }
    renderStep();
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }

  function close() {
    if (isInline) return;
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    // Mid-flow drafts survive close() — resume within 24h.
    if (state && state.step === 5) {
      clearDraft();
      state = null;
    }
  }

  // ── Star input widget ─────────────────────────────────────────────────
  function buildStars(container) {
    container.dataset.value = '';
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = '<i class="far fa-star"></i>';
      btn.setAttribute('aria-label', i + ' star');
      btn.addEventListener('click', () => {
        container.dataset.value = container.dataset.value === String(i) ? '' : String(i);
        paintStars(container);
      });
      container.appendChild(btn);
    }
  }
  function paintStars(container) {
    const v = Number(container.dataset.value) || 0;
    container.querySelectorAll('button').forEach((b, idx) => {
      b.querySelector('i').className = idx < v ? 'fas fa-star' : 'far fa-star';
      b.classList.toggle('filled', idx < v);
    });
  }

  // ── Segmented single-select group ─────────────────────────────────────
  function segHTML(col, options) {
    return `<div class="arw-seg" data-col="${col}">` +
      options.map(([v, l]) => `<button type="button" data-v="${esc(v)}">${esc(l)}</button>`).join('') +
      '</div>';
  }
  function wireSegs(root, onChange) {
    root.querySelectorAll('.arw-seg').forEach(group => {
      group.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', () => {
          const wasActive = btn.classList.contains('active');
          group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
          if (!wasActive) btn.classList.add('active');
          if (onChange) onChange(group.dataset.col);
        });
      });
    });
  }
  function segValue(root, col) {
    const active = root.querySelector(`.arw-seg[data-col="${col}"] button.active`);
    return active ? active.dataset.v : null;
  }

  // ── Progress bar ──────────────────────────────────────────────────────
  function updateProgress() {
    const wrap = modal.querySelector('.arw-progress');
    if (state.step >= 2 && state.step <= 4) {
      wrap.hidden = false;
      document.getElementById('arw-progress-text').textContent = 'Step ' + state.step + ' of 4';
      document.getElementById('arw-progress-fill').style.width = (state.step / 4) * 100 + '%';
    } else {
      wrap.hidden = true;
    }
  }

  // ── Step rendering ────────────────────────────────────────────────────
  function renderStep() {
    updateProgress();
    document.getElementById('arw-title').textContent =
      state.step === 1 ? 'Share Your Anonymous Review' :
      state.step === 2 ? 'Rate Your Experience (Step 2/4)' :
      state.step === 3 ? 'Work Environment (Step 3/4)' :
      state.step === 4 ? 'Domains & Skills Worked In (Step 4/4)' :
      state.step === 5 ? 'Review Submitted' : 'Anonymous Review';
    if (state.step === 1) renderStep1();
    else if (state.step === 2) renderStep2();
    else if (state.step === 3) renderStep3();
    else if (state.step === 4) renderStep4();
    else renderDone();
  }

  // ── Step 1 ────────────────────────────────────────────────────────────
  function renderStep1() {
    const body = document.getElementById('arw-body');
    body.innerHTML = `
      <form id="arw-step1">
        <div class="arw-grid-2">
          <div class="arw-field arw-firm-wrap">
            <label for="arw-firm">Firm Name <span style="color:#dc2626">*</span></label>
            <input id="arw-firm" autocomplete="off" placeholder="Start typing your firm's name…" value="${esc(state.firmName)}">
            <div class="arw-firm-results" id="arw-firm-results" hidden></div>
          </div>
          <div class="arw-field arw-location-wrap">
            <label for="arw-location">Office Location <span style="color:#dc2626">*</span></label>
            <input id="arw-location" autocomplete="off" placeholder="e.g., Mumbai">
            <div class="arw-location-results" id="arw-location-results" hidden></div>
          </div>
        </div>
        <div class="arw-field" style="position: relative;">
          <label for="arw-review">Anonymous Review <span style="color:#dc2626">*</span></label>
          <textarea id="arw-review" rows="4" placeholder="Example: &quot;Great learning exposure in statutory audit. Working hours are standard (9-7 PM) but can stretch during tax season. Partners are approachable. Stipend is paid on time, and leaves for exams are supported.&quot;"></textarea>
          <div id="arw-char-counter" style="font-size: 11px; color: #64748b; text-align: right; margin-top: 0.35rem; font-family: monospace;">0 / ${MIN_WORDS} words minimum</div>
        </div>
        <div class="arw-field">
          <label>Overall Rating <span style="color:#dc2626">*</span></label>
          <div class="arw-stars arw-stars-lg" id="arw-overall"></div>
        </div>
        <!-- Honeypot: hidden from humans; bots that fill it are silently dropped. -->
        <div class="arw-hp" aria-hidden="true">
          <label for="arw-hp-field">Company website</label>
          <input id="arw-hp-field" type="text" name="company_url" tabindex="-1" autocomplete="off">
        </div>
        <label class="arw-consent">
          <input type="checkbox" id="arw-consent">
          <span>I confirm this is my own genuine experience, it names no individuals and contains no unverifiable allegations, and I accept the <button type="button" class="arw-guidelines-link" id="arw-guidelines-open">Review Guidelines</button>.</span>
        </label>
        <p class="arw-status" id="arw-status" role="status"></p>
        <div class="arw-step-footer">
          <button type="submit" class="arw-btn-primary" id="arw-step1-submit"><i class="fas fa-paper-plane"></i> Submit Anonymous Review</button>
        </div>
      </form>`;

    const overallStars = document.getElementById('arw-overall');
    buildStars(overallStars);

    const firmInput = document.getElementById('arw-firm');
    const results = document.getElementById('arw-firm-results');
    const reviewTextarea = document.getElementById('arw-review');
    const counterDiv = document.getElementById('arw-char-counter');
    const locInput = document.getElementById('arw-location');
    const locResults = document.getElementById('arw-location-results');

    // Pre-populate Step 1 if returning/resuming
    const saved = state.savedData || {};
    if (saved.firmName && !firmInput.value) firmInput.value = saved.firmName;
    if (saved.location) locInput.value = saved.location;
    if (saved.reviewText) reviewTextarea.value = saved.reviewText;
    if (saved.overallRating) {
      overallStars.dataset.value = String(saved.overallRating);
      paintStars(overallStars);
    }

    function autoSaveStep1() {
      const consentEl = document.getElementById('arw-consent');
      state.savedData = Object.assign({}, state.savedData, {
        firmName: firmInput.value,
        location: locInput.value,
        reviewText: reviewTextarea.value,
        overallRating: Number(overallStars.dataset.value) || 0,
        consent: consentEl ? consentEl.checked : false,
      });
      state.firmName = firmInput.value;
      saveDraft();
    }

    if (state.lock) {
      firmInput.readOnly = true;
    } else {
      let debounce = null;
      firmInput.addEventListener('input', () => {
        state.firmId = null; // typed text invalidates any earlier selection
        state.firmName = firmInput.value;
        autoSaveStep1();
        clearTimeout(debounce);
        const q = firmInput.value.trim();
        if (q.length < 2) { results.hidden = true; return; }
        debounce = setTimeout(async () => {
          try {
            const { data, error } = await sb.rpc('search_firms', { q });
            if (error) throw error;
            const items = data || [];
            const exact = items.some(f => normName(f.name) === normName(q));
            results.innerHTML =
              items.map(f => `<button type="button" class="arw-firm-item" data-id="${f.id}" data-name="${esc(f.name)}">${esc(f.name)}</button>`).join('') +
              (exact ? '' : `<button type="button" class="arw-firm-item" data-name="${esc(q)}">${esc(q)}</button>`);
            results.hidden = false;
            results.querySelectorAll('.arw-firm-item').forEach(btn => {
              btn.addEventListener('click', () => {
                state.firmId = btn.dataset.id || null;
                state.firmName = btn.dataset.name;
                firmInput.value = btn.dataset.name;
                results.hidden = true;
                autoSaveStep1();
              });
            });
          } catch (e) { results.hidden = true; }
        }, 250);
      });
      document.addEventListener('click', e => {
        if (!results.hidden && !results.contains(e.target) && e.target !== firmInput) results.hidden = true;
      });
    }

    // Time-trap: remember when a *fresh* form appeared. Resumed drafts skip the check.
    state.step1RenderedAt = Date.now();
    state.step1WasFresh = !(saved.reviewText && saved.reviewText.trim());

    const consentBox = document.getElementById('arw-consent');
    const submitBtn = document.getElementById('arw-step1-submit');
    if (saved.consent) consentBox.checked = true;

    function refreshSubmitState() {
      const words = wordCount(reviewTextarea.value);
      const ready = words >= MIN_WORDS && consentBox.checked;
      submitBtn.disabled = !ready;
    }
    function updateCounter() {
      const words = wordCount(reviewTextarea.value);
      if (words > MAX_WORDS) {
        counterDiv.textContent = `${words} / ${MAX_WORDS} words — too long`;
        counterDiv.style.color = '#dc2626';
        counterDiv.style.fontWeight = '700';
      } else if (words < MIN_WORDS) {
        counterDiv.textContent = `${words} / ${MIN_WORDS} words minimum`;
        counterDiv.style.color = '#dc2626';
        counterDiv.style.fontWeight = '600';
      } else {
        counterDiv.textContent = `${words} words · looks good`;
        counterDiv.style.color = '#16a34a';
        counterDiv.style.fontWeight = '600';
      }
    }
    reviewTextarea.addEventListener('input', () => {
      updateCounter();
      refreshSubmitState();
      autoSaveStep1();
    });
    consentBox.addEventListener('change', () => {
      refreshSubmitState();
      autoSaveStep1();
    });
    const guidelinesOpen = document.getElementById('arw-guidelines-open');
    if (guidelinesOpen) guidelinesOpen.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openGuidelines(); });
    updateCounter();
    refreshSubmitState();

    const fixedCities = ["Mumbai", "Delhi", "Gurgaon", "Noida", "Bangalore", "Pune", "Kolkata", "Chennai", "Hyderabad", "Ahmedabad", "Jaipur"];

    function renderLocResults() {
      const q = locInput.value.trim();
      const normQ = normName(q);
      const matches = fixedCities.filter(c => normName(c).includes(normQ));
      const exact = matches.some(c => normName(c) === normQ);
      
      let html = matches.map(c => `<button type="button" class="arw-location-item" data-name="${esc(c)}">${esc(c)}</button>`).join('');
      if (q && !exact) {
        html += `<button type="button" class="arw-location-item" data-name="${esc(q)}">${esc(q)}</button>`;
      }
      
      if (!html) {
        locResults.hidden = true;
        return;
      }
      locResults.innerHTML = html;
      locResults.hidden = false;
      locResults.querySelectorAll('.arw-location-item').forEach(btn => {
        btn.addEventListener('click', () => {
          locInput.value = btn.dataset.name;
          locResults.hidden = true;
          autoSaveStep1();
        });
      });
    }

    locInput.addEventListener('focus', renderLocResults);
    locInput.addEventListener('input', () => {
      renderLocResults();
      autoSaveStep1();
    });
    document.addEventListener('click', e => {
      if (!locResults.hidden && !locResults.contains(e.target) && e.target !== locInput) {
        locResults.hidden = true;
      }
    });

    overallStars.querySelectorAll('button').forEach(b => b.addEventListener('click', autoSaveStep1));

    document.getElementById('arw-step1').addEventListener('submit', submitStep1);
    (state.lock ? locInput : firmInput).focus();
  }

  async function submitStep1(e) {
    e.preventDefault();
    const hp = (document.getElementById('arw-hp-field')?.value || '').trim();
    const tooFast = state.step1WasFresh && (Date.now() - (state.step1RenderedAt || 0)) < MIN_SUBMIT_MS;
    // Silent bot drop: mimic success without touching the database.
    if (hp || tooFast) {
      clearDraft();
      state.step = 5;
      renderStep();
      return;
    }

    const firmName = document.getElementById('arw-firm').value.trim();
    const location = document.getElementById('arw-location').value.trim();
    const reviewText = document.getElementById('arw-review').value.trim();
    const overall = Number(document.getElementById('arw-overall').dataset.value) || 0;
    const consented = document.getElementById('arw-consent')?.checked;

    if (!firmName) return setStatus('Please enter your firm name.', 'err');
    if (!location) return setStatus('Please enter the office location.', 'err');

    const textCheck = validateReviewText(reviewText);
    if (!textCheck.ok) return setStatus(textCheck.message, 'err');

    if (!overall) return setStatus('Please give an overall rating.', 'err');
    if (!consented) return setStatus('Please accept the Review Guidelines to continue.', 'err');

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';
    try {
      const { data, error } = await sb.rpc('submit_review_step1', {
        p_firm_id: state.firmId,
        p_new_firm_name: state.firmId ? null : firmName,
        p_location: location,
        p_review_text: reviewText,
        p_overall_rating: overall,
        p_device_token: deviceToken(),
        p_honeypot: hp,
      });
      if (error) throw error;
      state.reviewId = data.review_id;
      state.editToken = data.edit_token;
      state.firmId = data.firm_id;
      state.firmName = firmName;
      state.savedData = Object.assign({}, state.savedData, {
        firmName,
        location,
        reviewText,
        overallRating: overall
      });
      state.step = 2;
      saveDraft();
      if (onComplete) onComplete(); // review is live — let the page refresh in background
      renderStep();
    } catch (err) {
      setStatus(err.message || 'Something went wrong. Please try again.', 'err');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Anonymous Review';
    }
  }

  // ── Steps 2–4 shared chrome ───────────────────────────────────────────
  function stepShell(title, inner, nextLabel) {
    const showBack = state && state.step > 1 && state.step < 5;
    return `
      <div class="arw-step">
        ${inner}
        <p class="arw-status" id="arw-status" role="status"></p>
        <div class="arw-step-footer">
          ${showBack ? `<button type="button" class="arw-btn-ghost" id="arw-back"><i class="fas fa-arrow-left"></i> Back</button>` : ''}
          <button type="button" class="arw-btn-ghost" id="arw-skip">Skip</button>
          <button type="button" class="arw-btn-primary" id="arw-next">${esc(nextLabel)} <i class="fas fa-arrow-right"></i></button>
        </div>
      </div>`;
  }

  function wireFooter(collect, validate) {
    const go = async (checked) => {
      if (checked && validate) {
        const err = validate();
        if (err) { setStatus(err, 'err'); return; }
      }
      setStatus('');
      advance(collect ? collect() : {});
    };
    document.getElementById('arw-next').addEventListener('click', () => go(true));
    document.getElementById('arw-skip').addEventListener('click', () => go(false));
    const backBtn = document.getElementById('arw-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (collect) {
          const currentPatch = collect();
          state.savedData = Object.assign({}, state.savedData, currentPatch);
          state.pendingPatch = Object.assign({}, state.pendingPatch, currentPatch);
        }
        state.step -= 1;
        saveDraft();
        renderStep();
      });
    }
  }

  async function advance(patch) {
    state.savedData = Object.assign({}, state.savedData, patch);
    const merged = Object.assign({}, state.pendingPatch, patch);
    if (Object.keys(merged).length && state.reviewId && state.editToken) {
      const nextBtn = document.getElementById('arw-next');
      if (nextBtn) nextBtn.disabled = true;
      try {
        const { error } = await sb.rpc('update_review_progress', {
          p_review_id: state.reviewId,
          p_edit_token: state.editToken,
          p_patch: merged,
        });
        if (error) throw error;
        state.pendingPatch = {};
      } catch (err) {
        if (/token mismatch|not found/i.test(err.message || '')) {
          // Stale draft: the Step-1 review is already posted; discard and close.
          clearDraft();
          toast('This draft has expired — your review from Step 1 is already posted.');
          close();
          return;
        }
        state.pendingPatch = merged; // keep answers, retry on next Next/Skip
        toast("Couldn't save — will retry on the next step.");
      } finally {
        if (nextBtn) nextBtn.disabled = false;
      }
    }
    state.step += 1;
    if (state.step >= 5) {
      clearDraft();
      state.step = 5;
    } else {
      saveDraft();
    }
    renderStep();
  }

  // ── Step 2: Firm Experience ───────────────────────────────────────────
  function renderStep2() {
    const body = document.getElementById('arw-body');
    body.innerHTML = stepShell('Step 2 — Firm Experience', `
      <div class="arw-field">
        <span class="arw-group-label">Would you recommend this firm?</span>
        ${segHTML('would_recommend', [['true', '👍 Yes'], ['false', '👎 No']])}
      </div>
      <span class="arw-group-label">Rate your experience</span>
      <div class="arw-rating-list">
        ${RATING_FIELDS.map(([col, label]) => `
          <div class="arw-rating-row">
            <span>${esc(label)}</span>
            <div class="arw-stars" data-col="${col}"></div>
          </div>`).join('')}
      </div>`, 'Next');
    body.querySelectorAll('.arw-stars').forEach(buildStars);
    wireSegs(body, () => autoSaveStep2());

    // Pre-populate saved answers
    const saved = state.savedData || {};
    if (saved.would_recommend !== undefined && saved.would_recommend !== null) {
      const recVal = String(saved.would_recommend);
      const btn = body.querySelector(`.arw-seg[data-col="would_recommend"] button[data-v="${recVal}"]`);
      if (btn) btn.classList.add('active');
    }
    RATING_FIELDS.forEach(([col]) => {
      if (saved[col]) {
        const starContainer = body.querySelector(`.arw-stars[data-col="${col}"]`);
        if (starContainer) {
          starContainer.dataset.value = String(saved[col]);
          paintStars(starContainer);
        }
      }
    });

    function autoSaveStep2() {
      const patch = {};
      const rec = segValue(body, 'would_recommend');
      if (rec !== null) patch.would_recommend = rec === 'true';
      body.querySelectorAll('.arw-stars[data-col]').forEach(g => {
        const v = Number(g.dataset.value) || 0;
        if (v) patch[g.dataset.col] = v;
      });
      state.savedData = Object.assign({}, state.savedData, patch);
      state.pendingPatch = Object.assign({}, state.pendingPatch, patch);
      saveDraft();
      return patch;
    }

    body.querySelectorAll('.arw-stars button').forEach(b => b.addEventListener('click', autoSaveStep2));

    wireFooter(autoSaveStep2);
  }

  // ── Step 3: Work Experience ───────────────────────────────────────────
  function renderStep3() {
    const opt = col => Object.entries(LABELS[col]);
    const body = document.getElementById('arw-body');
    body.innerHTML = stepShell('Step 3 — Work Experience', `
      <div class="arw-field">
        <span class="arw-group-label">Did you or any of your colleagues request a transfer?</span>
        ${segHTML('transfer_requested', opt('transfer_requested'))}
      </div>
      <div class="arw-field" id="arw-transfer-approved-wrap" hidden>
        <span class="arw-group-label">Was the transfer ultimately approved?</span>
        ${segHTML('transfer_approved', opt('transfer_approved'))}
      </div>
      <div class="arw-field">
        <span class="arw-group-label">Do they allow to go for Industrial Training?</span>
        ${segHTML('allow_industrial_training', opt('allow_industrial_training'))}
      </div>
      <div class="arw-field">
        <label>Monthly Stipend (₹)</label>
        <div class="arw-stipend-row">
          <input id="arw-stipend" type="number" min="0" max="${STIPEND_MAX}" inputmode="numeric" placeholder="e.g., 12000">
          <div class="arw-custom-select" id="arw-stipend-year-wrap">
            <button type="button" class="arw-select-trigger" id="arw-stipend-year-trigger" aria-haspopup="listbox" aria-expanded="false">
              <span class="arw-select-label placeholder" id="arw-stipend-year-label">Year</span>
              <i class="fas fa-chevron-down arw-select-arrow"></i>
            </button>
            <div class="arw-select-menu" role="listbox" id="arw-stipend-year-menu">
              <div class="arw-select-option" data-value="" role="option">Year</div>
              ${(() => { const y = new Date().getFullYear(); let o = ''; for (let i = y; i >= STIPEND_YEAR_MIN; i--) o += `<div class="arw-select-option" data-value="${i}" role="option">${i}</div>`; return o; })()}
            </div>
            <input type="hidden" id="arw-stipend-year" name="stipend_year" value="">
          </div>
        </div>
        <div class="arw-field-hint" id="arw-stipend-hint">Enter monthly stipend (max ₹${STIPEND_MAX.toLocaleString('en-IN')}) and the year it applied to.</div>
      </div>
      <div class="arw-field">
        <span class="arw-group-label">Was the stipend paid on time?</span>
        ${segHTML('stipend_on_time', opt('stipend_on_time'))}
      </div>
      <div class="arw-field">
        <span class="arw-group-label">Average Working Hours</span>
        ${segHTML('working_hours', opt('working_hours'))}
      </div>
      <div class="arw-field">
        <span class="arw-group-label">Weekend Working</span>
        ${segHTML('weekend_working', opt('weekend_working'))}
      </div>
      <div class="arw-field">
        <span class="arw-group-label">Outstation Travel</span>
        ${segHTML('outstation_travel', opt('outstation_travel'))}
      </div>
      <div class="arw-field">
        <span class="arw-group-label">Personal Leave</span>
        ${segHTML('personal_leave', opt('personal_leave'))}
      </div>`, 'Next');

    wireSegs(body, col => {
      if (col === 'transfer_requested') {
        document.getElementById('arw-transfer-approved-wrap').hidden =
          segValue(body, 'transfer_requested') !== 'yes';
      }
      autoSaveStep3();
    });

    // Pre-populate saved answers
    const saved = state.savedData || {};
    ['transfer_requested', 'transfer_approved', 'allow_industrial_training', 'stipend_on_time', 'working_hours', 'weekend_working', 'outstation_travel', 'personal_leave'].forEach(col => {
      if (saved[col]) {
        const btn = body.querySelector(`.arw-seg[data-col="${col}"] button[data-v="${saved[col]}"]`);
        if (btn) btn.classList.add('active');
      }
    });
    if (saved.transfer_requested === 'yes') {
      const wrap = document.getElementById('arw-transfer-approved-wrap');
      if (wrap) wrap.hidden = false;
    }
    const stipendInput = document.getElementById('arw-stipend');
    const stipendYearWrap = document.getElementById('arw-stipend-year-wrap');
    const stipendYearTrigger = document.getElementById('arw-stipend-year-trigger');
    const stipendYearLabel = document.getElementById('arw-stipend-year-label');
    const stipendYearMenu = document.getElementById('arw-stipend-year-menu');
    const stipendYear = document.getElementById('arw-stipend-year');
    const stipendHint = document.getElementById('arw-stipend-hint');

    function setStipendYearValue(val) {
      if (!stipendYear) return;
      const cleanVal = val ? String(val) : '';
      stipendYear.value = cleanVal;
      if (stipendYearLabel) {
        stipendYearLabel.textContent = cleanVal || 'Year';
        stipendYearLabel.classList.toggle('placeholder', !cleanVal);
      }
      if (stipendYearMenu) {
        stipendYearMenu.querySelectorAll('.arw-select-option').forEach(opt => {
          opt.classList.toggle('selected', opt.dataset.value === cleanVal);
        });
      }
      refreshStipendHint();
      autoSaveStep3();
    }

    if (saved.stipend !== undefined && saved.stipend !== null && stipendInput) {
      stipendInput.value = saved.stipend;
    }
    if (saved.stipend_year) {
      setStipendYearValue(saved.stipend_year);
    }

    // Custom select interaction logic
    if (stipendYearTrigger && stipendYearWrap) {
      stipendYearTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = stipendYearWrap.classList.contains('active');
        stipendYearWrap.classList.toggle('active', !isActive);
        stipendYearTrigger.setAttribute('aria-expanded', !isActive ? 'true' : 'false');
      });
    }

    if (stipendYearMenu) {
      stipendYearMenu.querySelectorAll('.arw-select-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          setStipendYearValue(opt.dataset.value);
          if (stipendYearWrap) stipendYearWrap.classList.remove('active');
          if (stipendYearTrigger) stipendYearTrigger.setAttribute('aria-expanded', 'false');
        });
      });
    }

    const handleOutsideClick = (e) => {
      if (stipendYearWrap && !stipendYearWrap.contains(e.target)) {
        stipendYearWrap.classList.remove('active');
        if (stipendYearTrigger) stipendYearTrigger.setAttribute('aria-expanded', 'false');
      }
    };
    document.addEventListener('click', handleOutsideClick);

    // Returns an error string (blocks Next) or null. Skip bypasses it.
    function stipendError() {
      const raw = stipendInput ? stipendInput.value.trim() : '';
      if (raw === '') return null;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return 'Please enter a valid stipend amount.';
      if (n > STIPEND_MAX) return `Stipend looks too high — please enter a monthly amount up to ₹${STIPEND_MAX.toLocaleString('en-IN')}.`;
      if (n > 0 && stipendYear && !stipendYear.value) return 'Please select the year this stipend applied to.';
      return null;
    }
    function refreshStipendHint() {
      if (!stipendHint) return;
      const err = stipendError();
      stipendHint.textContent = err || `Enter monthly stipend (max ₹${STIPEND_MAX.toLocaleString('en-IN')}) and the year it applied to.`;
      stipendHint.classList.toggle('err', !!err);
    }

    function autoSaveStep3() {
      const patch = {};
      ['transfer_requested', 'allow_industrial_training', 'stipend_on_time', 'working_hours',
       'weekend_working', 'outstation_travel', 'personal_leave'].forEach(col => {
        const v = segValue(body, col);
        if (v) patch[col] = v;
      });
      if (patch.transfer_requested === 'yes') {
        const ta = segValue(body, 'transfer_approved');
        if (ta) patch.transfer_approved = ta;
      }
      const stipend = stipendInput ? stipendInput.value.trim() : '';
      const stipendNum = Number(stipend);
      // Only persist an in-range stipend so an out-of-range value never poisons averages.
      if (stipend !== '' && Number.isFinite(stipendNum) && stipendNum >= 0 && stipendNum <= STIPEND_MAX) {
        patch.stipend = parseInt(stipend, 10);
        if (stipendYear && stipendYear.value) patch.stipend_year = parseInt(stipendYear.value, 10);
      }
      state.savedData = Object.assign({}, state.savedData, patch);
      state.pendingPatch = Object.assign({}, state.pendingPatch, patch);
      saveDraft();
      return patch;
    }

    if (stipendInput) stipendInput.addEventListener('input', () => { refreshStipendHint(); autoSaveStep3(); });
    refreshStipendHint();

    wireFooter(autoSaveStep3, stipendError);
  }

  function getSuggestedTags(firmName) {
    const fn = String(firmName || '').toLowerCase().trim();
    if (!fn) return new Set();

    const suggested = new Set();
    if (/kpmg|deloitte|pwc|pricewaterhouse|ey\b|ernst|bdo|grant thornton|haribhakti|singhi|walker chandiok|mska|s\.r\. batliboi|b s r/i.test(fn)) {
      ['Statutory Audit', 'Internal Audit', 'Direct Tax', 'Indirect Tax', 'Risk Advisory', 'Ind AS / IFRS', 'Financial Modelling', 'Listed Companies'].forEach(t => suggested.add(t));
    }
    if (/tax|direct tax|indirect tax|gst/i.test(fn)) {
      ['Income Tax', 'GST', 'Direct Tax', 'Indirect Tax', 'Transfer Pricing', 'FEMA'].forEach(t => suggested.add(t));
    }
    if (/audit|statutory|risk/i.test(fn)) {
      ['Statutory Audit', 'Internal Audit', 'Bank Audit', 'Concurrent Audit', 'Risk Advisory'].forEach(t => suggested.add(t));
    }
    if (/advisory|valuation|corporate|transaction|consulting/i.test(fn)) {
      ['Valuation', 'Due Diligence', 'Transaction Advisory', 'Financial Modelling', 'Management Consultancy'].forEach(t => suggested.add(t));
    }
    if (suggested.size === 0) {
      ['Statutory Audit', 'Income Tax', 'GST', 'Excel', 'Tally', 'Accounting', 'MSMEs'].forEach(t => suggested.add(t));
    }
    return suggested;
  }

  // ── Step 4: Learning & Exposure ───────────────────────────────────────
  function renderStep4() {
    const suggestedTags = getSuggestedTags(state.firmName);
    const hasSuggestions = suggestedTags.size > 0 && state.firmName;

    const bannerHTML = hasSuggestions ? `
      <div style="background:#f0f9ff;border:1.5px solid #bae6fd;border-radius:10px;padding:0.6rem 0.85rem;margin-bottom:1.1rem;font-size:0.825rem;color:#0369a1;display:flex;align-items:center;gap:0.5rem;">
        <i class="fas fa-wand-magic-sparkles" style="color:#0284c7;"></i>
        <span>Smart suggestions highlighted for <strong>${esc(state.firmName)}</strong> — tap to select.</span>
      </div>` : '';

    const chips = (col, label, options) => `
      <span class="arw-group-label">${esc(label)} <small style="font-weight:400;color:#94a3b8">(select all that apply)</small></span>
      <div class="arw-chip-group" data-col="${col}">
        ${options.map(o => {
          const isSugg = suggestedTags.has(o);
          return `<button type="button" class="arw-chip${isSugg ? ' arw-chip-suggested' : ''}" data-v="${esc(o)}">${esc(o)}${isSugg ? ' ✨' : ''}</button>`;
        }).join('')}
      </div>`;
    const body = document.getElementById('arw-body');
    body.innerHTML = stepShell('Step 4 — Learning & Exposure', `
      ${bannerHTML}
      ${chips('domain_tags', 'Domain Worked In', DOMAIN_OPTIONS)}
      <div id="arw-custom-domain-box" style="margin: -0.25rem 0 0.85rem; display: none;">
        <input type="text" id="arw-custom-domain-input" placeholder="Specify custom domain (e.g. ESG Consulting, M&A Tax, IFC)" style="width: 100%; height: 40px; padding: 0 0.85rem; border: 1.5px solid #cbd5e1; border-radius: 8px; font-family: inherit; font-size: 0.875rem; color: #0f172a; outline: none; transition: border-color 0.15s ease;">
      </div>
      ${chips('client_tags', 'Client Exposure', CLIENT_OPTIONS)}
      ${chips('skill_tags', 'Skills Learned', SKILL_OPTIONS)}`, 'Finish');

    const customDomainBox = document.getElementById('arw-custom-domain-box');
    const customDomainInput = document.getElementById('arw-custom-domain-input');

    function autoSaveStep4() {
      const patch = {};
      body.querySelectorAll('.arw-chip-group').forEach(group => {
        const col = group.dataset.col;
        let vals = [...group.querySelectorAll('.arw-chip.active')].map(c => c.dataset.v);
        
        // If domain_tags has "Other" and user typed a custom domain, include the specified custom domain
        if (col === 'domain_tags' && vals.includes('Other') && customDomainInput && customDomainInput.value.trim()) {
          const customVal = customDomainInput.value.trim();
          vals = vals.filter(v => v !== 'Other').concat(customVal);
        }
        if (vals.length) patch[col] = vals;
      });
      state.savedData = Object.assign({}, state.savedData, patch);
      state.pendingPatch = Object.assign({}, state.pendingPatch, patch);
      saveDraft();
      return patch;
    }

    body.querySelectorAll('.arw-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        
        // Toggle custom domain input when "Other" domain chip is clicked
        if (chip.dataset.v === 'Other' && chip.closest('[data-col="domain_tags"]')) {
          const isOtherActive = chip.classList.contains('active');
          if (customDomainBox) {
            customDomainBox.style.display = isOtherActive ? 'block' : 'none';
            if (isOtherActive && customDomainInput) customDomainInput.focus();
          }
        }
        autoSaveStep4();
      });
    });

    if (customDomainInput) {
      customDomainInput.addEventListener('input', () => {
        const customDomain = customDomainInput.value.toLowerCase().trim();
        // Dynamically highlight matching skill tags if custom domain mentions audit/tax/advisory/tech
        if (customDomain) {
          body.querySelectorAll('.arw-chip-group[data-col="skill_tags"] .arw-chip').forEach(skillChip => {
            const skillName = skillChip.dataset.v.toLowerCase();
            if (customDomain.includes('tax') && (skillName.includes('tax') || skillName.includes('gst'))) {
              skillChip.classList.add('arw-chip-suggested');
            } else if (customDomain.includes('audit') && skillName.includes('audit')) {
              skillChip.classList.add('arw-chip-suggested');
            } else if ((customDomain.includes('esg') || customDomain.includes('advisory') || customDomain.includes('m&a') || customDomain.includes('valuation')) && (skillName.includes('modelling') || skillName.includes('analytics'))) {
              skillChip.classList.add('arw-chip-suggested');
            }
          });
        }
        autoSaveStep4();
      });
    }

    // Pre-populate saved answers
    const saved = state.savedData || {};
    ['domain_tags', 'client_tags', 'skill_tags'].forEach(col => {
      if (Array.isArray(saved[col])) {
        const group = body.querySelector(`.arw-chip-group[data-col="${col}"]`);
        if (group) {
          group.querySelectorAll('.arw-chip').forEach(chip => {
            if (saved[col].includes(chip.dataset.v)) {
              chip.classList.add('active');
              if (chip.dataset.v === 'Other' && col === 'domain_tags' && customDomainBox) {
                customDomainBox.style.display = 'block';
              }
            }
          });
          // Pre-fill custom domain if saved
          if (col === 'domain_tags') {
            const customSaved = saved[col].find(v => !DOMAIN_OPTIONS.includes(v));
            if (customSaved && customDomainInput && customDomainBox) {
              const otherBtn = group.querySelector('.arw-chip[data-v="Other"]');
              if (otherBtn) otherBtn.classList.add('active');
              customDomainBox.style.display = 'block';
              customDomainInput.value = customSaved;
            }
          }
        }
      }
    });

    wireFooter(autoSaveStep4);
  }

  // ── Done ──────────────────────────────────────────────────────────────
  function renderDone() {
    const body = document.getElementById('arw-body');
    body.innerHTML = `
      <div class="arw-done">
        <div class="arw-done-emoji">🎉</div>
        <h3>Thank You!</h3>
        <p>Your anonymous review has been submitted successfully.</p>
        <p style="font-size:0.85rem;color:#64748b;">Your feedback will help thousands of future CA students make informed decisions before joining an articleship firm.</p>
        <div class="arw-done-actions">
          <a href="/articleship-firm-reviews.html" id="arw-browse-all-btn" class="arw-done-btn-primary"><i class="fas fa-search"></i> Browse All Reviews</a>
          <button type="button" id="arw-submit-another-btn" class="arw-done-btn-secondary"><i class="fas fa-plus"></i> Submit Another</button>
        </div>
      </div>`;

    const browseBtn = document.getElementById('arw-browse-all-btn');
    if (browseBtn) {
      browseBtn.addEventListener('click', (e) => {
        if (window.location.pathname.endsWith('articleship-firm-reviews.html')) {
          e.preventDefault();
          closeModal();
        }
      });
    }

    const submitAnother = document.getElementById('arw-submit-another-btn');
    if (submitAnother) {
      submitAnother.addEventListener('click', () => {
        clearDraft();
        open({ forceNew: true });
      });
    }

    if (onComplete) onComplete();
  }

  window.ArticleshipReviewWizard = {
    init, open, openGuidelines, LABELS, RATING_FIELDS, DOMAIN_OPTIONS, CLIENT_OPTIONS, SKILL_OPTIONS,
  };
})();
