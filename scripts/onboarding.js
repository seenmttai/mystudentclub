// Onboarding: the "which course, which stage" question the job portal asks a
// signed-in student who has no course, stage or looking_for yet. It renders
// its own markup, so every lane page can show it (styles: the
// "course-aware portal additions" block at the end of portal-style.css).
// portal3.js decides when it shows and what happens after a save.
//
// Step 1 asks the course (CA / CS / CMA), step 2 the stage cards for it.
// CA writes exactly what the old index.html form wrote, plus
// profile.qualification. CS / CMA write profile.qualification and
// profile.job_preference (cs_* / cma_* keys) into the jsonb, then try
// looking_for on its own, so an unknown CHECK constraint cannot lose the save.

import { QUALIFICATIONS, QUALIFICATION_ORDER, joinPreference, laneForPreference, lookingForOf } from './courses/courses.js';

const MODAL_ID = 'onboardingSegmentModal';
export const ONBOARDING_DISMISS_KEY = 'msc_onboarding_dismissed';

// field: which question the stage asks
//   articleshipEnd - CA articleship 1-year end date (articleship_1yr_end_date)
//   joining        - earliest joining date
//   caFinal        - CA Final attempt + years of experience
//   years          - years of experience (CS / CMA: picks fresher or experienced)
export const ONBOARDING_STAGES = {
    ca: [
        { key: 'industrial', label: 'CA Industrial Training', icon: 'fa-industry', tone: 'pink', field: 'articleshipEnd', lookingFor: 'CA Industrial Training Default', preference: 'industrial' },
        { key: 'articleship', label: 'CA Articleship', icon: 'fa-book-open', tone: 'orange', field: 'joining', lookingFor: 'CA Articleship', preference: 'articleship' },
        { key: 'fresher', label: 'CA Fresher', icon: 'fa-graduation-cap', tone: 'purple', field: 'caFinal', lookingFor: 'CA Fresher', preference: 'fresher_fresher' },
        { key: 'semi', label: 'Semi Qualified CA', icon: 'fa-briefcase', tone: 'blue', field: 'years', lookingFor: 'Semi Qualified CA', preference: 'semi_fresher' }
    ],
    cs: [
        { key: 'articleship', label: 'Articleship (training at firms)', icon: 'fa-book-open', tone: 'orange', field: 'joining' },
        { key: 'industrial', label: 'Training in companies', icon: 'fa-building', tone: 'pink', field: 'joining' },
        { key: 'semi', label: 'Semi-qualified CS jobs', icon: 'fa-briefcase', tone: 'blue', field: 'years' },
        { key: 'qualified', label: 'Qualified CS jobs', icon: 'fa-graduation-cap', tone: 'purple', field: 'years' }
    ],
    cma: [
        { key: 'articleship', label: 'Articleship', icon: 'fa-book-open', tone: 'orange', field: 'joining' },
        { key: 'industrial', label: 'Industrial training', icon: 'fa-industry', tone: 'pink', field: 'joining' },
        { key: 'semi', label: 'CMA Inter jobs', icon: 'fa-briefcase', tone: 'blue', field: 'years' },
        { key: 'qualified', label: 'Qualified CMA jobs', icon: 'fa-graduation-cap', tone: 'purple', field: 'years' }
    ]
};

export function stageDefinition(qualification, stage) {
    return (ONBOARDING_STAGES[qualification] || []).find(def => def.key === stage) || null;
}

// "2", " 1.5 yrs", "" -> 2, 1.5, 0. Anything unreadable counts as no experience.
export function parseYears(value) {
    const years = parseFloat(String(value ?? '').replace(',', '.'));
    return Number.isFinite(years) && years > 0 ? years : 0;
}

// One year or less is a fresher.
export function stageFromYears(value) {
    return parseYears(value) <= 1 ? 'fresher' : 'experienced';
}

function daysInMonth(month, year) {
    return new Date(year, month, 0).getDate();
}

// Same checks the old onboarding form ran on its date inputs.
export function validateDateParts(d, m, y) {
    if (m < 1 || m > 12) return 'Month must be between 01 and 12.';
    if (d < 1 || d > daysInMonth(m, y)) return `Day must be between 01 and ${daysInMonth(m, y)} for that month.`;
    if (y < 2000 || y > 2100) return 'Year must be between 2000 and 2100.';
    return null;
}

// CA Final month + year + "Already cleared" -> the ca_final_attempt text.
export function caFinalAttemptValue(month, year, cleared) {
    const hasDate = Boolean(month && year);
    if (cleared) return hasDate ? `${month} ${year} (Cleared)` : 'Cleared';
    return hasDate ? `${month} ${year}` : '';
}

// What a completed onboarding writes. DOM-free so tests can pin it.
//   write.mode 'update' -> profiles.update(write.data).eq('uuid', id)
//   write.mode 'upsert' -> profiles.upsert({ uuid: id, ...write.data })
//   lookingForWrite     -> a separate, error-tolerant update (CS / CMA)
//   cachePatch          -> merged into localStorage.userProfileData (flat)
export function onboardingPlan({ qualification, stage, values = {}, existingProfile = {}, now = new Date() }) {
    const def = stageDefinition(qualification, stage);
    if (!def) return null;
    const updatedAt = now.toISOString();
    const merged = { ...(existingProfile || {}), qualification };

    if (qualification === 'ca') {
        if (stage === 'articleship') merged.articleship_earliest_joining_date = values.joining;
        if (stage === 'fresher') merged.fresher_years_of_experience = values.fresherYears;
        // Only the chosen stage's column: other stages' saved answers stay.
        const data = { looking_for: def.lookingFor, profile: merged, updated_at: updatedAt };
        if (stage === 'industrial') data.articleship_1yr_end_date = values.articleshipEnd || null;
        if (stage === 'fresher') data.ca_final_attempt = values.caFinalAttempt || null;
        if (stage === 'semi') data.years_of_experience = values.years || null;
        const columns = { ...data };
        delete columns.profile;
        delete columns.updated_at;
        // Semi: the years answer picks the Freshers or Experienced filter, as
        // it does for CS / CMA (more than a year is experienced).
        const preference = stage === 'semi' && stageFromYears(values.years) === 'experienced' ? 'semi_experienced' : def.preference;
        return {
            qualification,
            preference,
            lane: laneForPreference(preference),
            lookingFor: def.lookingFor,
            write: { mode: 'update', data },
            lookingForWrite: null,
            cachePatch: { ...merged, ...columns }
        };
    }

    const level = def.field === 'years' ? stageFromYears(values.years) : null;
    const caStage = stage === 'semi' ? `semi_${level}` : stage === 'qualified' ? `fresher_${level}` : stage;
    const preference = joinPreference(qualification, caStage);
    merged.job_preference = preference;
    if (def.field === 'joining') merged.earliest_joining_date = values.joining;
    const data = { profile: merged, updated_at: updatedAt };
    if (def.field === 'years') data.years_of_experience = String(values.years ?? '').trim() || null;
    const lookingFor = lookingForOf(preference);
    const cachePatch = { ...merged };
    if ('years_of_experience' in data) cachePatch.years_of_experience = data.years_of_experience;
    return {
        qualification,
        preference,
        lane: laneForPreference(preference),
        lookingFor,
        write: { mode: 'upsert', data },
        lookingForWrite: lookingFor ? { looking_for: lookingFor } : null,
        cachePatch
    };
}

export function onboardingDismissedThisSession() {
    try { return sessionStorage.getItem(ONBOARDING_DISMISS_KEY) === '1'; } catch (_) { return false; }
}

// ------------------------------------------------------------------ DOM

const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FINAL_YEARS = Array.from({ length: 2035 - 1980 + 1 }, (_, i) => 2035 - i);

const COURSE_ICONS = { ca: 'fa-calculator', cs: 'fa-scale-balanced', cma: 'fa-chart-pie' };

function dateField(id, label) {
    return `
        <label class="input-label-custom" for="${id}">${label}</label>
        <div class="input-with-icon">
            <i class="far fa-calendar-alt" aria-hidden="true"></i>
            <input type="date" id="${id}" class="form-input-custom" required>
        </div>`;
}

function yearsField(id, help, type = 'number') {
    const limits = type === 'number' ? ' min="0" max="50" step="0.5" inputmode="decimal"' : '';
    return `
        <label class="input-label-custom" for="${id}">Years of Experience <span class="help-text">(${help})</span></label>
        <div class="input-with-icon">
            <i class="fas fa-hourglass-half" aria-hidden="true"></i>
            <input type="${type}" id="${id}" class="form-input-custom" placeholder="e.g. 2 (${help})"${limits}>
        </div>`;
}

// One input per stage card, so every id is unique (two CS cards both ask
// years of experience).
function fieldId(qualification, def) {
    if (qualification === 'ca') {
        return {
            articleshipEnd: 'onb_articleship_1yr_end_date',
            joining: 'onb_articleship_earliest_joining',
            years: 'onb_years_of_experience'
        }[def.field];
    }
    return `onb_${qualification}_${def.key}_${def.field}`;
}

function fieldMarkup(qualification, def) {
    if (qualification === 'ca') {
        if (def.field === 'articleshipEnd') return dateField(fieldId(qualification, def), 'Articleship 1 year end date');
        if (def.field === 'joining') return dateField(fieldId(qualification, def), 'Earliest Joining Date');
        if (def.field === 'caFinal') {
            return `
                <span class="input-label-custom" id="onb_ca_final_label">CA Final Attempt Month &amp; Year</span>
                <div class="attempt-picker-row" role="group" aria-labelledby="onb_ca_final_label">
                    <select id="onb_ca_final_attempt_month" class="form-input-custom select-custom" aria-label="CA Final attempt month">
                        <option value="" disabled selected>Month</option>
                        ${MONTHS.map(m => `<option>${m}</option>`).join('')}
                    </select>
                    <select id="onb_ca_final_attempt_year" class="form-input-custom select-custom" aria-label="CA Final attempt year">
                        <option value="" disabled selected>Year</option>
                        ${FINAL_YEARS.map(y => `<option>${y}</option>`).join('')}
                    </select>
                </div>
                <label class="cleared-check-label">
                    <input type="checkbox" id="onb_ca_final_cleared"> Already Cleared / Passed
                </label>
                <div class="onboarding-field-gap">${yearsField('onb_fresher_years_of_experience', 'put 0 if none')}</div>`;
        }
        return yearsField(fieldId(qualification, def), 'if Fresher put 0', 'text');
    }
    if (def.field === 'joining') return dateField(fieldId(qualification, def), 'Earliest joining date');
    return yearsField(fieldId(qualification, def), 'put 0 if none');
}

function stageCardsMarkup(qualification) {
    return ONBOARDING_STAGES[qualification].map((def, index) => `
        <label class="onboarding-option-card${index === 0 ? ' active' : ''}">
            <input type="radio" name="onbStage" value="${def.key}" class="onboarding-option-input"${index === 0 ? ' checked' : ''}>
            <span class="option-icon-box ${def.tone}-gradient" aria-hidden="true"><i class="fas ${def.icon}"></i></span>
            <span class="option-title">${esc(def.label)}</span>
        </label>`).join('');
}

function stageFieldsMarkup(qualification) {
    return ONBOARDING_STAGES[qualification].map((def, index) => `
        <div class="onboarding-conditional-field${index === 0 ? ' active' : ''}" data-stage="${def.key}">
            ${fieldMarkup(qualification, def)}
        </div>`).join('');
}

function modalMarkup() {
    const courses = QUALIFICATION_ORDER.map(key => {
        const q = QUALIFICATIONS[key];
        return `
            <button type="button" class="onboarding-course-card" data-qualification="${key}">
                <span class="onboarding-course-icon" aria-hidden="true"><i class="fas ${COURSE_ICONS[key]}"></i></span>
                <span class="onboarding-course-code">${esc(q.label)}</span>
                <span class="onboarding-course-name">${esc(q.name)}</span>
                <span class="onboarding-course-inst">${esc(q.institute)}</span>
            </button>`;
    }).join('');
    return `
        <div class="modal-dialog onboarding-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="onbTitle" aria-describedby="onbDesc">
            <button type="button" class="onboarding-close-btn" aria-label="Close">
                <i class="fas fa-xmark" aria-hidden="true"></i>
            </button>
            <div class="onboarding-modal-card">
                <div class="onboarding-modal-header">
                    <img src="/assets/logo.png" alt="My Student Club" class="onboarding-brand-logo">
                    <h3 id="onbTitle" tabindex="-1">Help Us Personalize Your Portal</h3>
                    <p id="onbDesc">Tell us what you are looking for to see the best opportunities.</p>
                </div>
                <div class="onboarding-step" data-step="course">
                    <p class="input-label-custom" id="onbCourseLabel">Which course are you pursuing?</p>
                    <div class="onboarding-course-grid" role="group" aria-labelledby="onbCourseLabel">${courses}</div>
                </div>
                <form class="onboarding-step onboarding-form" data-step="stage" novalidate hidden>
                    <button type="button" class="onboarding-back-btn">
                        <i class="fas fa-arrow-left" aria-hidden="true"></i>
                        <span class="onboarding-back-label">Change course</span>
                    </button>
                    <fieldset class="form-group-custom onboarding-stage-fieldset">
                        <legend class="input-label-custom">I am looking for:</legend>
                        <div class="onboarding-options-grid"></div>
                    </fieldset>
                    <div class="dynamic-question-container"></div>
                    <button type="submit" class="onboarding-submit-btn">
                        <span>Continue to Portal</span>
                        <i class="fas fa-arrow-right" aria-hidden="true"></i>
                    </button>
                </form>
            </div>
        </div>`;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let modal = null;
let options = null;
let lastFocus = null;
let selectedQualification = null;

function reportInvalid(el, message) {
    el.setCustomValidity(message);
    el.reportValidity();
    el.addEventListener('change', () => el.setCustomValidity(''), { once: true });
    el.addEventListener('input', () => el.setCustomValidity(''), { once: true });
}

// Required date field: returns the YYYY-MM-DD value, or null after flagging it.
function readDate(id, emptyMessage) {
    const el = modal.querySelector(`#${id}`);
    const raw = el?.value || '';
    if (!raw) {
        reportInvalid(el, emptyMessage);
        return null;
    }
    const [yyyy, mm, dd] = raw.split('-').map(Number);
    const error = validateDateParts(dd, mm, yyyy);
    if (error) {
        reportInvalid(el, error);
        return null;
    }
    return raw;
}

function readValues(qualification, def) {
    const value = id => modal.querySelector(`#${id}`)?.value ?? '';
    if (qualification === 'ca') {
        if (def.field === 'articleshipEnd') {
            const articleshipEnd = readDate(fieldId(qualification, def), 'Please select a date.');
            return articleshipEnd === null ? null : { articleshipEnd };
        }
        if (def.field === 'joining') {
            const joining = readDate(fieldId(qualification, def), 'Please select your earliest joining date.');
            return joining === null ? null : { joining };
        }
        if (def.field === 'caFinal') {
            const month = value('onb_ca_final_attempt_month');
            const year = value('onb_ca_final_attempt_year');
            const cleared = Boolean(modal.querySelector('#onb_ca_final_cleared')?.checked);
            const caFinalAttempt = caFinalAttemptValue(month, year, cleared);
            if (!caFinalAttempt) {
                reportInvalid(modal.querySelector('#onb_ca_final_attempt_month'), 'Please select both month and year, or tick Already Cleared.');
                return null;
            }
            return { caFinalAttempt, fresherYears: value('onb_fresher_years_of_experience') };
        }
        return { years: value(fieldId(qualification, def)) };
    }
    if (def.field === 'joining') {
        const joining = readDate(fieldId(qualification, def), 'Please select your earliest joining date.');
        return joining === null ? null : { joining };
    }
    return { years: value(fieldId(qualification, def)) };
}

function selectedStage() {
    return modal.querySelector('input[name="onbStage"]:checked')?.value || ONBOARDING_STAGES[selectedQualification][0].key;
}

function showStageFields(stage) {
    modal.querySelectorAll('.onboarding-option-card').forEach(card => {
        card.classList.toggle('active', card.querySelector('input')?.value === stage);
    });
    modal.querySelectorAll('.onboarding-conditional-field').forEach(field => {
        const active = field.dataset.stage === stage;
        field.classList.toggle('active', active);
        // Hidden questions must not block the submit or be read.
        field.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), select').forEach(el => { el.disabled = !active; });
    });
}

function showStep(step) {
    const courseStep = modal.querySelector('[data-step="course"]');
    const stageStep = modal.querySelector('[data-step="stage"]');
    courseStep.hidden = step !== 'course';
    stageStep.hidden = step !== 'stage';
    if (step === 'course') {
        const preferred = modal.querySelector(`.onboarding-course-card[data-qualification="${selectedQualification || options?.lane?.qualification || 'ca'}"]`);
        (preferred || modal.querySelector('.onboarding-course-card'))?.focus();
    } else {
        modal.querySelector('input[name="onbStage"]:checked')?.focus();
    }
}

function chooseCourse(qualification) {
    selectedQualification = qualification;
    const form = modal.querySelector('[data-step="stage"]');
    form.querySelector('.onboarding-options-grid').innerHTML = stageCardsMarkup(qualification);
    form.querySelector('.dynamic-question-container').innerHTML = stageFieldsMarkup(qualification);
    form.querySelector('.onboarding-back-label').textContent = `${QUALIFICATIONS[qualification].label} · Change course`;
    showStageFields(selectedStage());
    showStep('stage');
}

function trapFocus(event) {
    if (event.key === 'Escape') {
        event.preventDefault();
        dismissOnboarding();
        return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(modal.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null || el === document.activeElement);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

async function submitOnboarding(event) {
    event.preventDefault();
    const { client, user } = options || {};
    if (!client || !user?.id) {
        hideOnboarding();
        return;
    }
    const qualification = selectedQualification;
    const stage = selectedStage();
    const def = stageDefinition(qualification, stage);
    const values = def && readValues(qualification, def);
    if (!values) return;

    const submitBtn = modal.querySelector('.onboarding-submit-btn');
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Saving preferences...</span><i class="fas fa-spinner fa-spin" aria-hidden="true"></i>';

    try {
        // Merge into the stored profile jsonb so nothing else is overwritten.
        // A failed read must not turn into a write of a near-empty profile.
        const { data: existingRow, error: readError } = await client
            .from('profiles')
            .select('profile')
            .eq('uuid', user.id)
            .maybeSingle();
        if (readError) throw readError;
        const plan = onboardingPlan({ qualification, stage, values, existingProfile: existingRow?.profile || {} });

        const { error } = plan.write.mode === 'update'
            ? await client.from('profiles').update(plan.write.data).eq('uuid', user.id)
            : await client.from('profiles').upsert({ uuid: user.id, ...plan.write.data });
        if (error) throw error;

        const cachePatch = { ...plan.cachePatch };
        if (plan.lookingForWrite) {
            // looking_for may be limited to CA labels: never let it fail the save.
            try {
                const { error: lookingForError } = await client.from('profiles').update(plan.lookingForWrite).eq('uuid', user.id);
                if (!lookingForError) cachePatch.looking_for = plan.lookingForWrite.looking_for;
            } catch (_) { /* keep the saved profile */ }
        }

        try {
            const cached = JSON.parse(localStorage.getItem('userProfileData') || '{}');
            localStorage.setItem('userProfileData', JSON.stringify(Object.assign(cached && typeof cached === 'object' ? cached : {}, cachePatch)));
        } catch (_) { /* storage blocked */ }

        hideOnboarding();
        options.toast?.('Personalization complete! Enjoy your personalized feed.', 'success');
        if (options.savePreference) await options.savePreference(plan.preference);
        options.onSaved?.(plan);
    } catch (err) {
        console.error('Failed to submit onboarding answers:', err);
        if (options.toast) options.toast('Failed to save preferences. Please try again.', 'error');
        else alert('Failed to save preferences. Please try again.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
    }
}

function ensureModal() {
    if (modal && document.body.contains(modal)) return modal;
    // Pages built before this module carried a static, CA-only copy.
    document.getElementById(MODAL_ID)?.remove();
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'modal-overlay-container';
    modal.style.cssText = 'display: none; z-index: 2004;';
    modal.innerHTML = modalMarkup();

    modal.querySelectorAll('.onboarding-course-card').forEach(btn => {
        btn.addEventListener('click', () => chooseCourse(btn.dataset.qualification));
    });
    modal.querySelector('.onboarding-back-btn').addEventListener('click', () => showStep('course'));
    modal.querySelector('.onboarding-close-btn').addEventListener('click', dismissOnboarding);
    modal.querySelector('.onboarding-options-grid').addEventListener('change', (e) => {
        if (e.target.name === 'onbStage') showStageFields(e.target.value);
    });
    modal.querySelector('.dynamic-question-container').addEventListener('change', (e) => {
        if (e.target.matches('input[type="date"]')) e.target.setCustomValidity('');
    });
    modal.querySelector('[data-step="stage"]').addEventListener('submit', submitOnboarding);
    modal.addEventListener('keydown', trapFocus);
    document.body.appendChild(modal);
    return modal;
}

// opts: { client, user, lane, qualification?, savePreference(pref), onSaved(plan), toast(msg, type) }
// A known qualification (saved on the profile page) skips straight to the
// stage step; "Change course" still goes back.
export function openOnboarding(opts) {
    options = opts || {};
    ensureModal();
    selectedQualification = null;
    lastFocus = document.activeElement;
    modal.style.display = 'flex';
    // Reflow so the entry transition runs.
    void modal.offsetHeight;
    modal.classList.add('show-modal');
    const known = options.qualification && QUALIFICATIONS[options.qualification] ? options.qualification : null;
    if (known) chooseCourse(known);
    else showStep('course');
}

export function hideOnboarding() {
    if (!modal) return;
    modal.classList.remove('show-modal');
    const closing = modal;
    setTimeout(() => {
        if (!closing.classList.contains('show-modal')) closing.style.display = 'none';
    }, 400);
    if (lastFocus && typeof lastFocus.focus === 'function' && document.body.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
}

// Close / Esc: ask again in the next browser session, not on every page.
export function dismissOnboarding() {
    try { sessionStorage.setItem(ONBOARDING_DISMISS_KEY, '1'); } catch (_) { /* storage blocked */ }
    hideOnboarding();
}
