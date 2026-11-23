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

// Copy and layout follow the Industrial Training lock screen (portal3.js showExclusiveLockedModal):
// icon, "Exclusive vacancy" pill, a title, one sentence, one button. Nothing more.
function enrollButton(label = 'Enroll in MSC Articleship Program') {
    return `<a class="msc-excl-cta" href="${ARTICLESHIP_PROGRAM.url}" target="_blank" rel="noopener"><i class="fas fa-graduation-cap" aria-hidden="true"></i> ${label}</a>`;
}

const PILL = '<div class="msc-excl-pill"><i class="fas fa-star" aria-hidden="true"></i> Exclusive vacancy</div>';

function lockPanel(signedIn, titleId = '') {
    return `<div class="msc-excl-panel">
            <div class="msc-excl-icon"><i class="fas fa-lock" aria-hidden="true"></i></div>
            ${PILL}
            <h3${titleId ? ` id="${titleId}"` : ''}>MSC Articleship Program Members Only</h3>
            <p>This vacancy is exclusive to My Student Club and open only to students enrolled in the <strong>MSC Articleship Program</strong>. Enroll to unlock full details and apply directly.</p>
            ${enrollButton()}
            ${signedIn ? '' : '<p class="msc-excl-help">Already enrolled? <a href="/login.html">Sign in</a> to access.</p>'}
        </div>`;
}

function footerLine(text) {
    return `<div class="modal-footer msc-excl-footer"><p><i class="fas fa-shield-alt" aria-hidden="true"></i> ${text}</p></div>`;
}

// One quiet line under the card's buttons, for outside recruiters' vacancies. Articleship portal only.
export function renderCardNote(job, tableName, enrolled) {
    if (tableName !== ARTICLESHIP_TABLE || enrolled || getExclusiveKind(job, tableName) !== 'partial') return '';
    ensureExclusiveStyles();
    return `<a class="msc-excl-line" href="${ARTICLESHIP_PROGRAM.url}" target="_blank" rel="noopener">
        <i class="fas fa-star" aria-hidden="true"></i>
        <span><strong>Exclusive on My Student Club</strong> · Higher shortlist chance with the MSC Articleship Program</span>
    </a>`;
}

// Panel under Apply Now in the job view, for outside recruiters' vacancies. Articleship portal only.
export function renderModalNote(job, tableName, enrolled) {
    if (tableName !== ARTICLESHIP_TABLE || enrolled || getExclusiveKind(job, tableName) !== 'partial') return '';
    return `<div class="msc-excl-panel msc-excl-panel--compact">
        ${PILL}
        <h3>Exclusive on My Student Club</h3>
        <p>Posted directly by the recruiter on My Student Club. Students in the <strong>MSC Articleship Program</strong> get the 6 Day Articleship Masterclass, CV review and mentorship, and a far better chance of being shortlisted.</p>
        ${enrollButton()}
    </div>`;
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
        ${lockPanel(signedIn)}
        ${footerLine('Exclusive vacancies are for MSC Articleship Program students only.')}`;
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
    return openOverlay(`${lockPanel(signedIn, 'mscExclLockTitle')}
        ${footerLine('Exclusive vacancies are for MSC Articleship Program students only.')}`, 'mscExclLockTitle');
}

// After an Easy Apply on an outside recruiter's Articleship vacancy, for students not in the programme.
export function showExclusiveAppliedPopup(job) {
    const company = escapeHtml((job?.Company || 'the recruiter').trim());
    return openOverlay(`<div class="msc-excl-panel">
            <div class="msc-excl-icon msc-excl-icon--done"><i class="fas fa-check" aria-hidden="true"></i></div>
            ${PILL}
            <h3 id="mscExclAppliedTitle">Application Submitted</h3>
            <p>Your profile and CV have been sent to <strong>${company}</strong>${company.endsWith('.') ? '' : '.'} This is an exclusive My Student Club vacancy: shortlist chances are low for a normal applicant and significantly higher for <strong>MSC Articleship Program</strong> students.</p>
            ${enrollButton()}
            <button type="button" class="msc-excl-later">Maybe later</button>
        </div>
        ${footerLine('6 Day Articleship Masterclass · CV review · Mentorship')}`, 'mscExclAppliedTitle');
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
    // Real MSC exclusives (pinned on top) already show the lock; only fake one when there are none.
    if (jobs[0] && !jobs.some((j) => j.is_exclusive)) {
        Object.assign(jobs[0], { is_exclusive: true, posted_by: null, hirer_email: null, __exclusiveDemo: true });
    }
    const ordinary = jobs.find((j) => !j.is_exclusive && !j.posted_by && !j.hirer_email);
    if (ordinary) Object.assign(ordinary, { posted_by: 'preview-demo', hirer_email: 'hr@example-firm.in', __exclusiveDemo: true });
    return jobs;
}

let stylesAdded = false;
export function ensureExclusiveStyles() {
    if (stylesAdded || typeof document === 'undefined') return;
    stylesAdded = true;
    const style = document.createElement('style');
    style.id = 'msc-exclusive-styles';
    // Values copied from the Industrial Training lock screen so both portals look the same.
    style.textContent = `
.job-card > .msc-excl-line { grid-column: 1 / -1; }
.msc-excl-line { display: flex; align-items: center; gap: 0.45rem; margin-top: 0.7rem; color: #b45309; font-size: 0.78rem;
  line-height: 1.4; text-decoration: none; }
.msc-excl-line .fa-star { color: #f59e0b; font-size: 0.72rem; flex-shrink: 0; }
.msc-excl-line strong { color: #92400e; font-weight: 700; }
.msc-excl-line:hover span { text-decoration: underline; }
.msc-excl-panel { text-align: center; padding: 2.5rem 1.5rem 2rem; margin: 1.25rem 0; border-radius: 16px;
  border: 1.5px solid #fbbf24; background: linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%); }
.msc-excl-panel--compact { padding: 1.5rem 1.25rem 1.4rem; margin: 1rem 0 0.25rem; }
.msc-excl-icon { width: 64px; height: 64px; margin: 0 auto 1rem; border-radius: 50%; display: flex; align-items: center;
  justify-content: center; background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 8px 20px rgba(245, 158, 11, 0.35);
  color: #fff; font-size: 1.5rem; }
.msc-excl-icon--done { background: linear-gradient(135deg, #22c55e, #16a34a); box-shadow: 0 8px 20px rgba(34, 197, 94, 0.3); }
.msc-excl-pill { display: inline-flex; align-items: center; gap: 0.4rem; margin-bottom: 1rem; padding: 3px 10px; border-radius: 999px;
  background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; font-size: 0.7rem; font-weight: 700; letter-spacing: 0.06em;
  text-transform: uppercase; }
.msc-excl-pill .fa-star { font-size: 0.65rem; }
.msc-excl-panel h3 { margin: 0 0 0.6rem; font-size: 1.15rem; font-weight: 700; color: #92400e; }
.msc-excl-panel p { max-width: 340px; margin: 0 auto 1.5rem; color: #78350f; font-size: 0.9rem; line-height: 1.6; }
.msc-excl-panel--compact h3 { font-size: 1.05rem; }
.msc-excl-panel--compact p { max-width: 420px; margin-bottom: 1.1rem; }
.msc-excl-cta { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.75rem 1.75rem; border-radius: 10px;
  background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff !important; font-weight: 600; font-size: 0.92rem;
  text-decoration: none; box-shadow: 0 4px 14px rgba(245, 158, 11, 0.4); transition: transform 0.2s, box-shadow 0.2s; }
.msc-excl-cta:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(245, 158, 11, 0.5); }
.msc-excl-panel .msc-excl-help { margin: 1rem auto 0; font-size: 0.82rem; color: #92400e; }
.msc-excl-help a { color: #d97706; font-weight: 600; text-decoration: underline; }
.msc-excl-later { display: block; margin: 0.85rem auto 0; padding: 0.25rem 0.5rem; border: none; background: none; color: #92400e;
  font-size: 0.85rem; font-weight: 600; cursor: pointer; }
.msc-excl-later:hover { text-decoration: underline; }
.msc-excl-footer { text-align: center; padding: 1rem; border-top: 1px solid #e5e7eb; margin-top: 1rem; }
.msc-excl-footer p { margin: 0; color: #6b7280; font-size: 0.85rem; }
.msc-excl-footer .fa-shield-alt { color: #f59e0b; margin-right: 4px; }
.msc-excl-cta:focus-visible, .msc-excl-later:focus-visible, .msc-excl-close:focus-visible, .msc-excl-line:focus-visible { outline: 2px solid #92400e; outline-offset: 2px; }
.msc-excl-locked-details { padding: 0.9rem 1rem; border-radius: 12px; background: #fffbeb; border: 1px dashed #f59e0b; color: #78350f; font-size: 0.88rem; }
.msc-excl-overlay { position: fixed; inset: 0; z-index: 100000; display: flex; align-items: center; justify-content: center; padding: 16px;
  background: rgba(15, 23, 42, 0.55); opacity: 0; transition: opacity 0.2s ease; }
.msc-excl-overlay.show { opacity: 1; }
.msc-excl-dialog { position: relative; width: 100%; max-width: 520px; max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box;
  padding: 1.5rem 1.5rem 0.5rem; border-radius: 20px; background: #fff; box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
  transform: translateY(10px) scale(0.98); transition: transform 0.2s ease; font-family: inherit; }
.msc-excl-overlay.show .msc-excl-dialog { transform: none; }
.msc-excl-dialog .msc-excl-panel { margin-top: 0.75rem; }
.msc-excl-close { position: absolute; top: 12px; right: 12px; width: 36px; height: 36px; border: none; border-radius: 50%;
  background: #f1f5f9; color: #475569; cursor: pointer; font-size: 1rem; z-index: 1; }
.msc-excl-close:hover { background: #e2e8f0; }
@media (max-width: 480px) {
  .msc-excl-dialog { padding: 1.1rem 1rem 0.25rem; }
  .msc-excl-panel { padding: 2rem 1.1rem 1.6rem; }
  .msc-excl-cta { padding: 0.75rem 1.25rem; }
}
@media (prefers-reduced-motion: reduce) {
  .msc-excl-overlay, .msc-excl-dialog, .msc-excl-cta { transition: none; }
}
`;
    document.head.appendChild(style);
}
