// MSC exclusive vacancies on the Articleship portal (9 Nov 2026).
//
// Two kinds of "Exclusive by My Student Club" vacancy:
//  - 'full'    Posted by MSC (admin) and ticked Exclusive. Only MSC Articleship Program students can open
//              and apply. Everyone else sees a lock screen that sends them to the programme.
//  - 'partial' Posted by an outside recruiter on hire.msc (Easy Apply). Everyone can view and apply, but
//              the card, the job view and an after-apply pop-up say it is exclusive to My Student Club and
//              point to the MSC Articleship Program for a better shortlist chance.
//
// The other portals keep their rule from 26 Oct 2026: a vacancy locks only when it is ticked
// Exclusive (is_exclusive), whoever posted it.

export const ARTICLESHIP_TABLE = 'Articleship Jobs';

export const ARTICLESHIP_PROGRAM = Object.freeze({
    slug: 'msc-articleship-program',
    name: 'MSC Articleship Program',
    url: '/articleship-program/',
    price: '₹1,499',
    listPrice: '₹1,999'
});

const PROGRAM_BENEFITS = [
    '6-day placement masterclass',
    'Personal CV review and mock interviews',
    'Tons of resources: 1,000+ HR mail IDs and the LMS library',
    'Mentorship to land the right articleship'
];

const MSC_DOMAIN = '@mystudentclub.com';

function clean(value) {
    return String(value || '').trim().toLowerCase();
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// Same test the portal uses for Easy Apply (posted through hire.msc / post-a-job).
export function isRecruiterPostedJob(job) {
    const applicationId = clean(job?.['Application ID']);
    return Boolean(job && (job.posted_by || job.hirer_email || applicationId === 'recruit@mystudentclub.com'));
}

// MSC's own hire.msc account (recruit@mystudentclub.com and other team addresses) counts as the admin.
export function isMscOwnPosting(job) {
    if (!job) return false;
    return clean(job.hirer_email).endsWith(MSC_DOMAIN) || clean(job['Application ID']) === 'recruit@mystudentclub.com';
}

export function isOutsideRecruiterJob(job) {
    return isRecruiterPostedJob(job) && !isMscOwnPosting(job);
}

// 'full' | 'partial' | null
export function getExclusiveKind(job, tableName) {
    if (!job) return null;
    if (tableName !== ARTICLESHIP_TABLE) return job.is_exclusive ? 'full' : null;
    if (isOutsideRecruiterJob(job)) return 'partial';
    return job.is_exclusive ? 'full' : null;
}

export function isExclusiveLocked(job, tableName, enrolled) {
    return getExclusiveKind(job, tableName) === 'full' && !enrolled;
}

export function exclusiveTagLabel(tableName) {
    return tableName === ARTICLESHIP_TABLE ? 'Exclusive by MSC' : 'Exclusive';
}

// Paid Articleship registrations (PayU, no LMS) live in program_registration, matched on the login email.
// Returns [] when signed out or before the my_program_registrations() migration has run.
export async function fetchMyProgramRegistrations(client) {
    try {
        if (!client || typeof client.rpc !== 'function') return [];
        const { data, error } = await client.rpc('my_program_registrations');
        if (error || !Array.isArray(data)) return [];
        return data
            .map((row) => (typeof row === 'string' ? row : row && row.program))
            .filter(Boolean);
    } catch (_) {
        return [];
    }
}

function programLink(label, extraClass = '') {
    return `<a class="msc-excl-cta ${extraClass}" href="${ARTICLESHIP_PROGRAM.url}" target="_blank" rel="noopener">
        <i class="fas fa-graduation-cap" aria-hidden="true"></i>
        <span>${label}</span>
        <span class="msc-excl-cta-price">${ARTICLESHIP_PROGRAM.price}</span>
    </a>`;
}

function benefitsList() {
    return `<ul class="msc-excl-benefits">${PROGRAM_BENEFITS.map((b) => `<li><i class="fas fa-check" aria-hidden="true"></i>${b}</li>`).join('')}</ul>`;
}

// One line under the card's apply button. Articleship portal only.
export function renderCardNote(job, tableName, enrolled) {
    if (tableName !== ARTICLESHIP_TABLE) return '';
    const kind = getExclusiveKind(job, tableName);
    if (!kind) return '';
    ensureExclusiveStyles();
    if (enrolled) {
        return `<div class="msc-excl-note msc-excl-note--member"><i class="fas fa-circle-check" aria-hidden="true"></i><span>Exclusive by My Student Club · open to you as an MSC Articleship Program student</span></div>`;
    }
    const text = kind === 'full'
        ? '<strong>Exclusive by My Student Club.</strong> Enroll in the MSC Articleship Program to apply.'
        : '<strong>Exclusive on My Student Club.</strong> Get a higher shortlist chance with the MSC Articleship Program.';
    return `<a class="msc-excl-note" href="${ARTICLESHIP_PROGRAM.url}" target="_blank" rel="noopener">
        <i class="fas ${kind === 'full' ? 'fa-lock' : 'fa-star'}" aria-hidden="true"></i>
        <span>${text}</span>
        <i class="fas fa-arrow-right msc-excl-note-arrow" aria-hidden="true"></i>
    </a>`;
}

// Box under the Apply button in the job view. Articleship portal only.
export function renderModalNote(job, tableName, enrolled) {
    if (tableName !== ARTICLESHIP_TABLE) return '';
    const kind = getExclusiveKind(job, tableName);
    if (!kind) return '';
    if (enrolled) {
        return `<div class="msc-excl-note msc-excl-note--member msc-excl-note--modal"><i class="fas fa-circle-check" aria-hidden="true"></i><span>Exclusive by My Student Club · you're applying as an MSC Articleship Program student</span></div>`;
    }
    if (kind !== 'partial') return '';
    return `<div class="msc-excl-box">
        <div class="msc-excl-badge"><i class="fas fa-star" aria-hidden="true"></i> Exclusive vacancy by My Student Club</div>
        <p>The recruiter posted this vacancy directly on My Student Club, and many such vacancies are posted here every week.</p>
        <p><strong>Want a higher chance of getting shortlisted?</strong> Enroll in the MSC Articleship Program:</p>
        ${benefitsList()}
        ${programLink('Enroll in MSC Articleship Program')}
    </div>`;
}

function lockBody(signedIn, titleId = '') {
    return `<div class="msc-excl-lock-icon"><i class="fas fa-lock" aria-hidden="true"></i></div>
            <div class="msc-excl-badge"><i class="fas fa-star" aria-hidden="true"></i> Exclusive by My Student Club</div>
            <h3${titleId ? ` id="${titleId}"` : ''}>Only for MSC Articleship Program students</h3>
            <p>My Student Club posted this vacancy for its own students. Enroll in the <strong>MSC Articleship Program</strong> to see the full details and apply.</p>
            ${benefitsList()}
            ${programLink('Enroll in MSC Articleship Program')}
            <p class="msc-excl-lock-price">Registration ${ARTICLESHIP_PROGRAM.price} <s>${ARTICLESHIP_PROGRAM.listPrice}</s></p>
            ${signedIn
                ? '<p class="msc-excl-lock-help">Already registered? It unlocks when you sign in with the email you registered with.</p>'
                : '<p class="msc-excl-lock-help">Already registered? <a href="/login.html">Sign in</a> with the email you registered with.</p>'}`;
}

// Lock screen for MSC-posted exclusives (fills the job modal body). Articleship portal only.
export function renderLockScreen(job, { signedIn = false } = {}) {
    const company = escapeHtml((job?.Company || 'Company').trim());
    const initial = escapeHtml(((job?.Company || '').trim().charAt(0) || '?').toUpperCase());
    return `
        <div class="modal-header">
            <div class="modal-logo">${initial}</div>
            <div class="modal-title-group">
                <h2>${company}</h2>
                <p>${escapeHtml(job?.Location || '')}</p>
            </div>
        </div>
        <div class="msc-excl-lock">
            ${lockBody(signedIn)}
        </div>
        <div class="modal-footer" style="text-align: center; padding: 1rem; border-top: 1px solid #e5e7eb; margin-top: 1rem;">
            <p style="color: #6b7280; font-size: 0.85rem;">
                <i class="fas fa-shield-alt" style="color: #f59e0b; margin-right: 4px;"></i>
                Exclusive vacancies by My Student Club are for MSC Articleship Program students only.
            </p>
        </div>`;
}

function closeOverlay(overlay) {
    overlay.classList.remove('show');
    document.removeEventListener('keydown', overlay.__escHandler);
    setTimeout(() => overlay.remove(), 200);
}

function openOverlay(innerHtml, labelledBy) {
    ensureExclusiveStyles();
    document.querySelectorAll('.msc-excl-overlay').forEach((el) => el.remove());
    const overlay = document.createElement('div');
    overlay.className = 'msc-excl-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', labelledBy);
    overlay.innerHTML = `<div class="msc-excl-dialog">
        <button type="button" class="msc-excl-close" aria-label="Close"><i class="fas fa-xmark" aria-hidden="true"></i></button>
        ${innerHtml}
    </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    overlay.__escHandler = (e) => { if (e.key === 'Escape') closeOverlay(overlay); };
    document.addEventListener('keydown', overlay.__escHandler);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay || e.target.closest('.msc-excl-close') || e.target.closest('.msc-excl-later')) closeOverlay(overlay);
    });
    const focusTarget = overlay.querySelector('.msc-excl-cta') || overlay.querySelector('.msc-excl-close');
    if (focusTarget) focusTarget.focus({ preventScroll: true });
    return overlay;
}

// Same lock as a pop-up (the standalone job page, jobs.html).
export function showExclusiveLockPopup({ signedIn = false } = {}) {
    return openOverlay(`<div class="msc-excl-lock msc-excl-lock--popup">${lockBody(signedIn, 'mscExclLockTitle')}</div>`, 'mscExclLockTitle');
}

// After an Easy Apply on an outside recruiter's Articleship vacancy, for students not in the programme.
export function showExclusiveAppliedPopup(job) {
    const company = escapeHtml((job?.Company || 'the recruiter').trim());
    return openOverlay(`
        <div class="msc-excl-done"><i class="fas fa-check" aria-hidden="true"></i></div>
        <h3 id="mscExclAppliedTitle">Application submitted</h3>
        <p class="msc-excl-sub">Your profile and CV have been sent to <strong>${company}</strong>${company.endsWith('.') ? '' : '.'}</p>
        <div class="msc-excl-box msc-excl-box--popup">
            <div class="msc-excl-badge"><i class="fas fa-star" aria-hidden="true"></i> Exclusive vacancy by My Student Club</div>
            <p>Exclusive vacancies get a lot of applicants. The chance of a shortlist is low for a normal applicant and significantly higher for an MSC Articleship Program student.</p>
            <div class="msc-excl-compare" aria-hidden="true">
                <div class="msc-excl-compare-row"><span>Normal applicant</span><div class="msc-excl-bar"><i style="width: 22%"></i></div><b>Low</b></div>
                <div class="msc-excl-compare-row msc-excl-compare-row--msc"><span>MSC Articleship Program</span><div class="msc-excl-bar"><i style="width: 88%"></i></div><b>High</b></div>
            </div>
            ${benefitsList()}
        </div>
        ${programLink('Enroll in MSC Articleship Program')}
        <button type="button" class="msc-excl-later">Maybe later</button>
    `, 'mscExclAppliedTitle');
}

// Preview-only demo (localhost and *.pages.dev with ?exclusive-demo): marks the first two cards as the
// two kinds so both can be seen before any live vacancy is ticked. Never runs on www.
export function isExclusiveDemo() {
    try {
        const host = window.location.hostname;
        const previewHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.pages.dev');
        return previewHost && new URLSearchParams(window.location.search).has('exclusive-demo');
    } catch (_) {
        return false;
    }
}

export function applyExclusiveDemo(jobs, tableName) {
    if (tableName !== ARTICLESHIP_TABLE || !Array.isArray(jobs) || !isExclusiveDemo()) return jobs;
    if (jobs[0]) Object.assign(jobs[0], { is_exclusive: true, posted_by: null, hirer_email: null, __exclusiveDemo: true });
    if (jobs[1]) Object.assign(jobs[1], { is_exclusive: false, posted_by: 'preview-demo', hirer_email: 'hr@example-firm.in', __exclusiveDemo: true });
    return jobs;
}

let stylesAdded = false;
export function ensureExclusiveStyles() {
    if (stylesAdded || typeof document === 'undefined') return;
    stylesAdded = true;
    const style = document.createElement('style');
    style.id = 'msc-exclusive-styles';
    style.textContent = `
.job-card > .msc-excl-note { grid-column: 1 / -1; }
.msc-excl-note { display: flex; align-items: center; gap: 0.5rem; width: 100%; margin-top: 0.6rem; padding: 0.5rem 0.7rem;
  border-radius: 10px; background: #fffbeb; border: 1px dashed #f59e0b; color: #78350f; font-size: 0.78rem; line-height: 1.35;
  text-decoration: none; box-sizing: border-box; transition: background 0.2s, border-color 0.2s; }
.msc-excl-note:hover { background: #fef3c7; border-style: solid; }
.msc-excl-note > .fas:first-child { color: #d97706; flex-shrink: 0; }
.msc-excl-note strong { color: #92400e; }
.msc-excl-note-arrow { margin-left: auto; color: #d97706; font-size: 0.72rem; flex-shrink: 0; }
.msc-excl-note--member { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; }
.msc-excl-note--member > .fas:first-child { color: #16a34a; }
.msc-excl-note--modal { margin: 0.75rem 0 0; }
.job-card-actions + .msc-excl-note { margin-top: 0.6rem; }
.msc-excl-box { margin: 0.9rem 0 0.25rem; padding: 1rem 1.1rem; border-radius: 14px; border: 1.5px solid #fbbf24;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); color: #78350f; font-size: 0.88rem; line-height: 1.55; text-align: left; }
.msc-excl-box p { margin: 0 0 0.5rem; color: #78350f; }
.msc-excl-box strong { color: #92400e; }
.msc-excl-badge { display: inline-flex; align-items: center; gap: 0.4rem; margin-bottom: 0.6rem; padding: 3px 10px; border-radius: 999px;
  background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
.msc-excl-badge .fas { font-size: 0.62rem; }
.msc-excl-benefits { list-style: none; margin: 0.35rem 0 0.85rem; padding: 0; display: grid; gap: 0.3rem; }
.msc-excl-benefits li { display: flex; align-items: flex-start; gap: 0.5rem; color: #78350f; font-size: 0.85rem; }
.msc-excl-benefits .fa-check { color: #16a34a; margin-top: 0.22rem; font-size: 0.75rem; }
.msc-excl-cta { display: flex; align-items: center; justify-content: center; gap: 0.55rem; width: 100%; box-sizing: border-box;
  padding: 0.78rem 1rem; border-radius: 10px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff !important;
  font-weight: 700; font-size: 0.92rem; text-decoration: none; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35);
  transition: transform 0.2s, box-shadow 0.2s; }
.msc-excl-cta:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(245, 158, 11, 0.45); }
.msc-excl-cta:focus-visible, .msc-excl-later:focus-visible, .msc-excl-close:focus-visible, .msc-excl-note:focus-visible { outline: 2px solid #92400e; outline-offset: 2px; }
.msc-excl-cta-price { padding: 1px 8px; border-radius: 999px; background: rgba(255, 255, 255, 0.22); font-size: 0.8rem; }
.msc-excl-lock { text-align: center; padding: 2rem 1.25rem 1.5rem; margin: 1.25rem 0; border-radius: 16px; border: 1.5px solid #fbbf24;
  background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); }
.msc-excl-lock-icon { width: 60px; height: 60px; margin: 0 auto 0.9rem; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; font-size: 1.4rem; box-shadow: 0 8px 20px rgba(245, 158, 11, 0.35); }
.msc-excl-lock h3 { margin: 0 0 0.5rem; font-size: 1.12rem; font-weight: 700; color: #92400e; }
.msc-excl-lock > p { margin: 0 auto 0.9rem; max-width: 360px; color: #78350f; font-size: 0.9rem; line-height: 1.6; }
.msc-excl-lock .msc-excl-benefits { max-width: 320px; margin: 0 auto 1.1rem; text-align: left; }
.msc-excl-lock .msc-excl-cta { max-width: 340px; margin: 0 auto; }
.msc-excl-lock .msc-excl-lock-price { margin: 0.6rem 0 0; font-size: 0.8rem; color: #92400e; }
.msc-excl-lock .msc-excl-lock-help { margin: 0.6rem auto 0; font-size: 0.8rem; color: #92400e; }
.msc-excl-lock-help a { color: #b45309; font-weight: 600; text-decoration: underline; }
.msc-excl-lock--popup { margin: 0; padding: 1.4rem 1rem 1.1rem; border: none; }
.msc-excl-locked-details { padding: 0.9rem 1rem; border-radius: 12px; background: #fffbeb; border: 1px dashed #f59e0b; color: #78350f; font-size: 0.88rem; }
.msc-excl-overlay { position: fixed; inset: 0; z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(15, 23, 42, 0.55); opacity: 0; transition: opacity 0.2s ease; }
.msc-excl-overlay.show { opacity: 1; }
.msc-excl-dialog { position: relative; width: 100%; max-width: 440px; max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box;
  padding: 1.6rem 1.4rem 1.2rem; border-radius: 18px; background: #fff; text-align: center; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
  transform: translateY(10px) scale(0.98); transition: transform 0.2s ease; font-family: inherit; }
.msc-excl-overlay.show .msc-excl-dialog { transform: none; }
.msc-excl-close { position: absolute; top: 10px; right: 10px; width: 34px; height: 34px; border: none; border-radius: 50%;
  background: #f1f5f9; color: #475569; cursor: pointer; font-size: 1rem; }
.msc-excl-close:hover { background: #e2e8f0; }
.msc-excl-done { width: 54px; height: 54px; margin: 0 auto 0.75rem; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  background: #dcfce7; color: #16a34a; font-size: 1.4rem; }
.msc-excl-dialog h3 { margin: 0 0 0.3rem; font-size: 1.25rem; font-weight: 700; color: #0f172a; }
.msc-excl-sub { margin: 0 0 0.9rem; color: #475569; font-size: 0.9rem; }
.msc-excl-box--popup { margin: 0 0 0.9rem; }
.msc-excl-compare { display: grid; gap: 0.45rem; margin: 0.6rem 0 0.8rem; }
.msc-excl-compare-row { display: grid; grid-template-columns: minmax(0, 9.5rem) 1fr auto; align-items: center; gap: 0.55rem; font-size: 0.78rem; color: #78350f; }
.msc-excl-compare-row b { font-weight: 700; color: #92400e; min-width: 2.2rem; text-align: right; }
.msc-excl-bar { height: 8px; border-radius: 999px; background: rgba(146, 64, 14, 0.12); overflow: hidden; }
.msc-excl-bar i { display: block; height: 100%; border-radius: 999px; background: #cbd5e1; }
.msc-excl-compare-row--msc span, .msc-excl-compare-row--msc b { color: #15803d; font-weight: 700; }
.msc-excl-compare-row--msc .msc-excl-bar i { background: linear-gradient(90deg, #22c55e, #16a34a); }
.msc-excl-later { display: block; width: 100%; margin-top: 0.5rem; padding: 0.6rem; border: none; border-radius: 10px; background: transparent;
  color: #64748b; font-size: 0.88rem; font-weight: 600; cursor: pointer; }
.msc-excl-later:hover { background: #f8fafc; color: #334155; }
@media (max-width: 480px) {
  .msc-excl-dialog { padding: 1.4rem 1.1rem 1rem; }
  .msc-excl-compare-row { grid-template-columns: minmax(0, 7.5rem) 1fr auto; }
}
@media (prefers-reduced-motion: reduce) {
  .msc-excl-overlay, .msc-excl-dialog, .msc-excl-cta, .msc-excl-note { transition: none; }
}
`;
    document.head.appendChild(style);
}
