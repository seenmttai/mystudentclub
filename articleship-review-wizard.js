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

  // ── Modal shell ───────────────────────────────────────────────────────
  function init(client, opts = {}) {
    sb = client;
    onComplete = opts.onComplete || null;
    if (modal) return;
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
    const draft = loadDraft();
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
        <div class="arw-field" style="position: relative;">
          <label for="arw-review">Anonymous Review <span style="color:#dc2626">*</span></label>
          <textarea id="arw-review" rows="3" placeholder="Example: &quot;Great learning exposure in statutory audit. Working hours are standard (9-7 PM) but can stretch during tax season. Partners are approachable. Stipend is paid on time, and leaves for exams are supported.&quot;"></textarea>
          <div id="arw-char-counter" style="font-size: 11px; color: #64748b; text-align: right; margin-top: 0.25rem; font-family: monospace;">0 / 500 words · 0 characters</div>
        </div>
        <div class="arw-field">
          <label>Overall Rating <span style="color:#dc2626">*</span></label>
          <div class="arw-stars arw-stars-lg" id="arw-overall"></div>
        </div>
        <p class="arw-status" id="arw-status" role="status"></p>
        <div class="arw-step-footer">
          <button type="submit" class="arw-btn-primary"><i class="fas fa-paper-plane"></i> Submit Anonymous Review</button>
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
      state.savedData = Object.assign({}, state.savedData, {
        firmName: firmInput.value,
        location: locInput.value,
        reviewText: reviewTextarea.value,
        overallRating: Number(overallStars.dataset.value) || 0,
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

    function updateCounter() {
      const val = reviewTextarea.value;
      const characters = val.length;
      const words = val.trim().split(/\s+/).filter(Boolean).length;
      counterDiv.textContent = `${words} / 500 words · ${characters} characters`;
      if (words > 500) {
        counterDiv.style.color = '#dc2626';
        counterDiv.style.fontWeight = '700';
      } else {
        counterDiv.style.color = '#64748b';
        counterDiv.style.fontWeight = 'normal';
      }
    }
    reviewTextarea.addEventListener('input', () => {
      updateCounter();
      autoSaveStep1();
    });
    updateCounter();

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
    const firmName = document.getElementById('arw-firm').value.trim();
    const location = document.getElementById('arw-location').value.trim();
    const reviewText = document.getElementById('arw-review').value.trim();
    const overall = Number(document.getElementById('arw-overall').dataset.value) || 0;

    if (!firmName) return setStatus('Please enter your firm name.', 'err');
    if (!location) return setStatus('Please enter the office location.', 'err');
    if (!reviewText) return setStatus('Please write your review.', 'err');
    
    const wordsCount = reviewText.split(/\s+/).filter(Boolean).length;
    if (wordsCount > 500) return setStatus('Your review must not exceed 500 words.', 'err');

    if (!overall) return setStatus('Please give an overall rating.', 'err');

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

  function wireFooter(collect) {
    const go = async () => advance(collect ? collect() : {});
    document.getElementById('arw-next').addEventListener('click', go);
    document.getElementById('arw-skip').addEventListener('click', go);
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
        <label for="arw-stipend">Monthly Stipend (₹)</label>
        <input id="arw-stipend" type="number" min="0" inputmode="numeric" placeholder="e.g., 12000">
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
    if (saved.stipend !== undefined && saved.stipend !== null && stipendInput) {
      stipendInput.value = saved.stipend;
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
      const stipend = stipendInput ? stipendInput.value : '';
      if (stipend !== '' && Number(stipend) >= 0) patch.stipend = parseInt(stipend, 10);

      state.savedData = Object.assign({}, state.savedData, patch);
      state.pendingPatch = Object.assign({}, state.pendingPatch, patch);
      saveDraft();
      return patch;
    }

    if (stipendInput) stipendInput.addEventListener('input', autoSaveStep3);

    wireFooter(autoSaveStep3);
  }

  // ── Step 4: Learning & Exposure ───────────────────────────────────────
  function renderStep4() {
    const chips = (col, label, options) => `
      <span class="arw-group-label">${esc(label)} <small style="font-weight:400;color:#94a3b8">(select all that apply)</small></span>
      <div class="arw-chip-group" data-col="${col}">
        ${options.map(o => `<button type="button" class="arw-chip" data-v="${esc(o)}">${esc(o)}</button>`).join('')}
      </div>`;
    const body = document.getElementById('arw-body');
    body.innerHTML = stepShell('Step 4 — Learning & Exposure', `
      ${chips('domain_tags', 'Domain Worked In', DOMAIN_OPTIONS)}
      ${chips('client_tags', 'Client Exposure', CLIENT_OPTIONS)}
      ${chips('skill_tags', 'Skills Learned', SKILL_OPTIONS)}`, 'Finish');

    function autoSaveStep4() {
      const patch = {};
      body.querySelectorAll('.arw-chip-group').forEach(group => {
        const vals = [...group.querySelectorAll('.arw-chip.active')].map(c => c.dataset.v);
        if (vals.length) patch[group.dataset.col] = vals;
      });
      state.savedData = Object.assign({}, state.savedData, patch);
      state.pendingPatch = Object.assign({}, state.pendingPatch, patch);
      saveDraft();
      return patch;
    }

    body.querySelectorAll('.arw-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        autoSaveStep4();
      });
    });

    // Pre-populate saved answers
    const saved = state.savedData || {};
    ['domain_tags', 'client_tags', 'skill_tags'].forEach(col => {
      if (Array.isArray(saved[col])) {
        const group = body.querySelector(`.arw-chip-group[data-col="${col}"]`);
        if (group) {
          group.querySelectorAll('.arw-chip').forEach(chip => {
            if (saved[col].includes(chip.dataset.v)) {
              chip.classList.add('active');
            }
          });
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
        <p>Your feedback will help thousands of future CA students make informed decisions before joining an articleship firm.</p>
        <button type="button" class="arw-btn-primary" id="arw-done-btn">Done</button>
      </div>`;
    document.getElementById('arw-done-btn').addEventListener('click', () => {
      close();
      if (onComplete) onComplete();
    });
  }

  window.ArticleshipReviewWizard = {
    init, open, LABELS, RATING_FIELDS, DOMAIN_OPTIONS, CLIENT_OPTIONS, SKILL_OPTIONS,
  };
})();
