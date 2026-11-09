
// ai-helper.js - Encapsulates AI Apply logic and UI helpers
import { calculateProfileCompletion, getMissingProfileItems, readCachedProfile } from './profile-completion.js';

const AI_WORKER_URL = 'https://emailgenerator.bhansalimanan55.workers.dev/';

/**
 * Checks whether the user has completed the shared 100% profile checklist.
 * @returns {boolean} True if profile is considered complete.
 */
export function isProfileComplete() {
    try {
        return calculateProfileCompletion(readCachedProfile(localStorage), localStorage) === 100;
    } catch (e) {
        return false;
    }
}

/**
 * Details from job object needed for the AI worker
 * @param {Object} job 
 * @param {string} tableName 
 */
export function getJobPayload(job, tableName) {
    const JOB_TITLE_MAP = {
        "Industrial Training Job Portal": "Industrial Trainee",
        "Fresher Jobs": "CA Fresher",
        "Semi Qualified Jobs": "Semi Qualified Chartered Accountant",
        "Articleship Jobs": "Articleship Trainee"
    };

    return {
        company_name: job.Company,
        job_description: job.Description,
        job_location: job.Location,
        job_title: JOB_TITLE_MAP[tableName] || job.Category || 'the role'
    };
}


/**
 * Calls the worker to generate the email body.
 * @param {Object} job 
 * @param {string} tableName 
 * @param {Object} supabaseClient - Supabase client instance
 * @param {Object} user - Current user object
 * @returns {Promise<string>} The generated email body.
 */
export async function generateEmailBody(job, tableName, supabaseClient, user) {
    const profileData = JSON.parse(localStorage.getItem('userProfileData') || '{}');
    let cvText = localStorage.getItem('userCVText') || '';

    // 1. If text is missing locally, try fetching from Supabase (OCR_CV)
    if (!cvText && user) {
        try {
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('ocr_cv')
                .eq('uuid', user.id)
                .single();

            if (data && data.ocr_cv) {
                cvText = data.ocr_cv;
                localStorage.setItem('userCVText', cvText); // Cache it
            }
        } catch (e) {
            console.warn("Retrying fetch of ocr_cv failed", e);
        }
    }

    // 2. Decide payload
    const payload = {
        profile_data: profileData,
        job_details: getJobPayload(job, tableName)
    };

    if (cvText && cvText.trim().length > 0) {
        // Option A: Use OCR Text
        payload.pdf_text = cvText;
        payload.ocr_text = cvText; // Send as both for compatibility
        payload.images = [];
    } else {
        // Option B: Fallback to Images
        const cvImages = JSON.parse(localStorage.getItem('userCVImages') || '[]');
        if (cvImages.length > 0) {
            payload.images = cvImages;

            // Background Report: Missing OCR Text
            if (user) {
                // Fire and forget report
                supabaseClient.from('course_reports').insert({
                    user_id: user.id,
                    course_slug: 'ai-apply-fallback',
                    description: `OCR Text missing for user ${user.id} (${user.email}). Used legacy image cache.`,
                    page_url: window.location.href
                }).then(() => { }).catch(err => console.error("Report error", err));
            }
        } else {
            // Option C: No data at all
            throw new Error("No CV data found (Text or Images)");
        }
    }

    try {
        const response = await fetch(AI_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`AI worker responded with status: ${response.status}`);
        }

        const data = await response.json();

        if (data.email_body && data.email_body.trim() !== '') {
            return data.email_body;
        } else {
            throw new Error('Empty response from AI');
        }
    } catch (error) {
        console.error('generateEmailBody error:', error);
        throw error; // Re-throw to handle in UI
    }
}

/**
 * Generates the fallback email body (simple template).
 * @param {Object} job 
 * @param {string} tableName 
 * @returns {string}
 */
export function generateFallbackEmail(job, tableName) {
    const category = job.Category || 'the role';
    return `Dear Hiring Manager,

I am writing to express my interest in the ${category} position at ${job.Company}.

With my academic background and passion for the field, I am confident that I would be a valuable addition to your team.

I have attached my resume for your review. I would welcome the opportunity to discuss how my skills can contribute to your organization's success.

Thank you for considering my application.

Best regards,
[Your Name]

---
Application submitted via My Student Club`;
}

/**
 * Shows a toast notification at the bottom of the screen.
 * @param {string} message 
 * @param {string} type 'info' | 'error' | 'success'
 */
export function showToast(message, type = 'info') {
    // Inject styles if not present (fallback)
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            .toast-notification {
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(100px);
                background: #333;
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 11000 !important;
                transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.3s ease;
                opacity: 0;
                font-size: 0.95rem;
                pointer-events: none;
                display: flex;
                align-items: center;
                gap: 10px;
                font-family: 'Poppins', sans-serif;
            }
            .toast-notification.show {
                transform: translateX(-50%) translateY(0);
                opacity: 1;
            }
            .toast-error { background: #ef4444; }
            .toast-success { background: #22c55e; }
            .toast-info { background: #1f2937; }
        `;
        document.head.appendChild(style);
    }

    let toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;
    toast.innerHTML = `
        <div class="toast-content">
            <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
            <span>${message}</span>
        </div>
    `;

    document.body.appendChild(toast);

    // Trigger animation with a small delay to ensure DOM update
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                document.body.removeChild(toast);
            }
        }, 300); // Wait for fade out
    }, 3000);
}

const PROFILE_GATE_ID = 'profile-gate-modal';

function missingItemLabel(label) {
    const text = String(label || '').replace(/^Add\s+/i, '').trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function injectProfileGateStyles() {
    if (document.getElementById('profile-gate-styles')) return;
    const style = document.createElement('style');
    style.id = 'profile-gate-styles';
    style.textContent = `
        .profile-gate-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 1rem; background: rgba(31, 41, 55, 0.7); backdrop-filter: blur(6px); font-family: 'Poppins', sans-serif; }
        .profile-gate-card { background: #fff; border-radius: 16px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2); width: 100%; max-width: 420px; padding: 1.75rem 1.5rem; text-align: center; }
        .profile-gate-card h3 { margin: 0 0 0.5rem; font-size: 1.15rem; font-weight: 700; color: #111827; }
        .profile-gate-card p { margin: 0 0 1rem; font-size: 0.9rem; line-height: 1.5; color: #4b5563; }
        .profile-gate-list { margin: 0 0 1.25rem; padding: 0.75rem 1rem 0.75rem 2rem; max-height: 200px; overflow-y: auto; text-align: left; font-size: 0.9rem; color: #1f2937; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 10px; }
        .profile-gate-list li { padding: 0.15rem 0; }
        .profile-gate-btn { display: block; width: 100%; box-sizing: border-box; padding: 0.7rem 1rem; border-radius: 10px; font-family: inherit; font-size: 0.92rem; font-weight: 600; text-align: center; text-decoration: none; cursor: pointer; }
        .profile-gate-btn.primary { background: #4f46e5; color: #fff; border: none; margin-bottom: 0.6rem; }
        .profile-gate-btn.primary:hover { background: #4338ca; }
        .profile-gate-btn.secondary { background: #fff; color: #4b5563; border: 1px solid #d1d5db; }
    `;
    document.head.appendChild(style);
}

/**
 * Shows a modal listing exactly which profile items are still missing for
 * AI Powered Apply, with a button that opens the first one on the profile page.
 * Name kept for existing callers; it no longer asks for a CV when one exists.
 */
export function showResumeRedirectModal() {
    let missing = [];
    let percent = null;
    try {
        const profile = readCachedProfile(localStorage);
        missing = getMissingProfileItems(profile, localStorage);
        percent = calculateProfileCompletion(profile, localStorage);
    } catch (_) {
        // Fall back to the generic message below.
    }

    const cvMissing = missing.some(item => item.label === 'Add resume');
    const first = missing[0];
    const profileUrl = `/profile.html?redirect=${encodeURIComponent(window.location.href)}`
        + (first?.section ? `&section=${encodeURIComponent(first.section)}&form=${encodeURIComponent(first.form || '')}` : '');

    const intro = missing.length
        ? `${cvMissing ? '' : 'Your CV is uploaded, but '}AI Powered Apply needs a complete profile to personalise your email. Please add:`
        : 'We could not check your profile. Please open it, save once, and try again.';
    const list = missing.length
        ? `<ul class="profile-gate-list">${missing.map(item => `<li>${missingItemLabel(item.label)}</li>`).join('')}</ul>`
        : '';

    injectProfileGateStyles();
    document.getElementById(PROFILE_GATE_ID)?.remove();

    const modal = document.createElement('div');
    modal.id = PROFILE_GATE_ID;
    modal.className = 'profile-gate-overlay';
    modal.innerHTML = `
        <div class="profile-gate-card" role="dialog" aria-modal="true" aria-labelledby="profileGateTitle">
            <h3 id="profileGateTitle">Complete your profile${percent === null ? '' : ` (${percent}% done)`}</h3>
            <p>${intro}</p>
            ${list}
            <a href="${profileUrl}" class="profile-gate-btn primary">Complete Profile</a>
            <button type="button" class="profile-gate-btn secondary" data-close>I'll do this later</button>
        </div>
    `;

    const close = () => {
        modal.remove();
        document.removeEventListener('keydown', onKeydown);
    };
    const onKeydown = (e) => { if (e.key === 'Escape') close(); };
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('[data-close]')) close();
    });
    document.addEventListener('keydown', onKeydown);
    document.body.appendChild(modal);
}
