// Job portal page host (www). Since the v2 redesign (6 Nov 2026) the listing itself (search, filters, ranking,
// cards and the vacancy drawer) lives in scripts/portal-v2/. This file keeps what it always owned: login state,
// enrolments, the apply flows (BrowserGuard unlock, application records, Easy Apply, AI Apply), notifications,
// consent, onboarding, the profile banner and CV sync, and hands the listing a "host" with those parts.
import { isProfileComplete, generateEmailBody, showResumeRedirectModal, showToast } from './ai-helper.js';
import { unlockJobDetails, getCachedUnlockedJob } from './browser-guard.js';
import { calculateProfileCompletion as calculateSharedProfileCompletion, readCachedProfile } from './profile-completion.js';
import { isTeamPosted, portalFromPath } from './portal-v2/jobs-core.js?v=1';
import { mountPortalApp } from './portal-v2/portal-app.js?v=1';

async function handleAiApplyClick(job, btnElement, tableName, simpleMailtoLink) {
    if (isRecruiterPostedJob(job)) {
        if (!currentSession) {
            window.location.href = '/login.html';
            return;
        }
        if (!isProfileComplete()) {
            showRecruiterProfileWarningPopup(job, calculateProfileCompletion());
            return;
        }
        return recordApplication(job, btnElement);
    }

    if (!currentSession) {
        window.location.href = '/login.html';
        return;
    }

    if (!isProfileComplete()) {
        showResumeRedirectModal();
        return;
    }

    const btnText = btnElement.querySelector('.btn-text');
    const spinner = btnElement.querySelector('.fa-spinner');
    const originalText = btnText.textContent;
    const originalPointerEvents = btnElement.style.pointerEvents;

    // Show loading state
    btnElement.classList.add('loading');
    btnText.textContent = 'Preparing...';
    if (spinner) spinner.style.display = 'inline-block';
    btnElement.style.pointerEvents = 'none';

    try {
        const emailBody = await generateEmailBody(job, tableName, supabaseClient, currentSession?.user);
        const rawLink = job['Application ID'];
        const emailMatch = rawLink.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : '';
        const subject = simpleMailtoLink.split('subject=')[1]?.split('&')[0] || `Application for ${job.Category} (Ref: My Student Club)`;
        const aiMailto = `mailto:${email}?subject=${subject}&body=${encodeURIComponent(emailBody)}`;
        await recordApplication(job, btnElement);
        openMailtoLink(aiMailto);
    } catch (error) {
        console.error("AI Apply Failed:", error);
        showToast("Server busy, reverting to simple apply", "error");
        const rawLink = job['Application ID'];
        const emailMatch = rawLink.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        const email = emailMatch ? emailMatch[0] : '';
        const subject = simpleMailtoLink.split('subject=')[1]?.split('&')[0] || `Application for ${job.Category} (Ref: My Student Club)`;
        setTimeout(() => openMailtoLink(`mailto:${email}?subject=${subject}`), 3000);
    } finally {
        // Reset button state
        btnElement.classList.remove('loading');
        btnText.textContent = originalText;
        if (spinner) spinner.style.display = 'none';
        btnElement.style.pointerEvents = originalPointerEvents;
    }
}

const supabaseUrl = 'https://auth.mystudentclub.com';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = window.supabaseClient || (typeof getSupabaseClient === 'function' ? getSupabaseClient() : supabase.createClient(supabaseUrl, supabaseKey));
const BROWSER_GUARD_WORKER_URL = window.BROWSER_GUARD_WORKER_URL || 'https://browser-guard-unlock.bhansalimanan55.workers.dev';
const WORKER_URL = window.WORKER_URL || 'https://storer.bhansalimanan55.workers.dev';

window.flutter_app = {
    isReady: false,
    fcmToken: null
};
window.setFcmToken = function (token) {
    window.flutter_app.fcmToken = token;
    const topicSelectionArea = document.getElementById('topic-selection-area');
    if (topicSelectionArea && topicSelectionArea.style.display !== 'block') {
        updatePermissionStatusUI();
    }
};

// The listing page this is (Industrial Training, Articleship, Semi Qualified, CA Freshers or Experienced CA).
const PORTAL = portalFromPath(window.location.pathname);
let currentTable = PORTAL.table;
let portalApp = null;

let currentSession = null;
const pendingRecruiterApplications = new Set();
const completedRecruiterApplications = new Set();
let profileHydrationPromise = null;
let appliedJobIds = new Set();
let currentFcmToken = null;
let firebaseMessaging;

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBTIXRJbaZy_3ulG0C8zSI_irZI7Ht2Y-8",
    authDomain: "msc-notif.firebaseapp.com",
    projectId: "msc-notif",
    storageBucket: "msc-notif.appspot.com",
    messagingSenderId: "228639798414",
    appId: "1:228639798414:web:b8b3c96b15da5b770a45df",
    measurementId: "G-X4M23TB936"
};
const VAPID_KEY = "BGlNz4fQGzftJPr2U860MsoIo0dgNcqb2y2jAEbwJzjmj8CbDwJy_kD4eRAcruV6kNRs6Kz-mh9rdC37tVgeI5I";
const JOB_TYPES_NOTIF = [
    { value: "industrial", label: "Industrial Training" },
    { value: "semi", label: "Semi Qualified" },
    { value: "fresher", label: "Fresher" },
    { value: "articleship", label: "Articleship" }
];
const LOCATIONS_NOTIF = ["mumbai", "bangalore", "gurgaon", "pune", "kolkata", "delhi", "noida", "hyderabad", "ahmedabad", "chennai", "jaipur"];

// Type-wide ("All India") topic name for each job type, exactly as formatTopicForDisplay
// expects them. "Industrial-all" is capitalized where the other three aren't — that's an
// existing inconsistency in how these topics were named, not a typo.
function getTypeWideTopicForJobType(jobType) {
    if (jobType === 'industrial') return 'Industrial-all';
    if (jobType === 'fresher') return 'fresher-all';
    if (jobType === 'semi') return 'semi-all';
    if (jobType === 'articleship') return 'articleship-all';
    return null;
}

const dom = {};

const EMAIL_SUBJECT_MAP = {
    "Industrial Training Job Portal": "Application for CA Industrial Training",
    "Fresher Jobs": "Application for CA Fresher Position",
    "Semi Qualified Jobs": "Application for Semi Qualified CA Position",
    "Articleship Jobs": "Application for CA Articleship"
};

function shareJob(job, btnElement) {
    // industrial | articleship | semi | fresher | experienced (job.html sends each back to its own page)
    const jobType = PORTAL.jobType;
    const jobUrl = `${window.location.origin}/job.html?id=${job.id}&type=${jobType}`;

    const shareText = `Check out this job at *${job.Company}* for *${job.Location}*
URL - ${jobUrl}

Do turn on notifications to stay updated with all such opportunites and ensure joining the whatsapp group below
mystudentclub.com/links`;

    const shareData = {
        title: `Job at ${job.Company}`,
        text: shareText,
        url: jobUrl
    };

    // Simple mobile detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile && navigator.share) {
        // Native share dialog (works well on mobile)
        navigator.share(shareData).catch(err => console.log('Share cancelled'));
    } else {
        // Desktop: Copy to clipboard (avoids "lame" native dialog)
        navigator.clipboard.writeText(shareText).then(() => {
            if (btnElement) {
                const originalHtml = btnElement.innerHTML;
                const originalStyles = btnElement.style.cssText;

                // Visual feedback
                btnElement.innerHTML = '<i class="fas fa-check"></i> Copied!';
                btnElement.style.background = '#22c55e';
                btnElement.style.color = '#ffffff';

                setTimeout(() => {
                    btnElement.innerHTML = originalHtml;
                    btnElement.style.cssText = originalStyles;
                }, 2000);
            } else {
                alert('Job details copied to clipboard!');
            }
        }).catch(err => {
            alert('Failed to copy details.');
        });
    }
}

async function recordApplication(job, btnElement) {
    if (!currentSession) {
        window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.href)}`;
        return false;
    }

    const recruiterPosted = isRecruiterPostedJob(job);
    if (recruiterPosted && !isProfileComplete()) {
        showRecruiterProfileWarningPopup(job, calculateProfileCompletion());
        return false;
    }
    const applicationKey = `${currentTable}:${job.id}`;
    if (recruiterPosted && (pendingRecruiterApplications.has(applicationKey) || completedRecruiterApplications.has(applicationKey) || appliedJobIds.has(job.id))) {
        showToast('Already applied to this vacancy.', 'info');
        return false;
    }

    const originalText = btnElement.innerHTML;
    if (recruiterPosted) {
        pendingRecruiterApplications.add(applicationKey);
        btnElement.style.pointerEvents = 'none';
        if ('disabled' in btnElement) btnElement.disabled = true;
    }
    btnElement.innerHTML = '<div class="loader-spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>';

    try {
        let dbJobId = job.id;
        let dbJobTable = currentTable;
        if (typeof job.id === 'string' && job.id.includes('-')) {
            dbJobId = Date.now() + Math.floor(Math.random() * 1000);
            dbJobTable = `${currentTable}|${job.id}`;
        }

        const { error } = await supabaseClient
            .from('job_applications')
            .insert({
                user_id: currentSession.user.id,
                job_id: dbJobId,
                job_table: dbJobTable,
                applied_at: new Date().toISOString()
            });

        if (error) {
            if (error.code === '23505') { // Unique violation (already applied)
                // Just proceed
            } else {
                throw error;
            }
        } else {
            // Success
            appliedJobIds.add(job.id);
            // Update local count if possible for immediate feedback (optional)
        }

        if (recruiterPosted) {
            completedRecruiterApplications.add(applicationKey);
            appliedJobIds.add(job.id);
        }

        btnElement.classList.add('applied');
        btnElement.innerHTML = recruiterPosted ? '<i class="fas fa-check"></i> Applied' : originalText;
        if (recruiterPosted) {
            // Keep the completed state visible while allowing the guarded click
            // handler to explain why another application will not be submitted.
            btnElement.style.pointerEvents = '';
            if ('disabled' in btnElement) btnElement.disabled = false;
        }
        showToast('Application submitted to the hirer dashboard.', 'success');
        return true;
    } catch (e) {
        console.error('Application exception:', e);
        if (recruiterPosted) {
            btnElement.style.pointerEvents = '';
            if ('disabled' in btnElement) btnElement.disabled = false;
        }
        btnElement.innerHTML = originalText;
        return false;
    } finally {
        if (recruiterPosted) pendingRecruiterApplications.delete(applicationKey);
    }
}

async function updateLastAccessDate(userId) {
    try {
        const { error } = await supabaseClient
            .from('profiles')
            .update({ last_access_date: new Date().toISOString() })
            .eq('uuid', userId);
        if (error) throw error;
    } catch (e) {
        console.error('Failed to update last access date:', e);
    }
}

async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;
    window.__mscSession = session;

    // If logged in, fetch and cache profile data
    if (session?.user?.id) {
        await prefetchEnrollmentStatus(session.user.id); // Await this to populate cache before page load/clicks
        // Update last access date when user opens the portal
        updateLastAccessDate(session.user.id);

        // Supabase is the source of truth for profile-dependent UI. Refresh it
        // before rendering prompts so signup values cannot be asked again.
        window.MSCProfileState.prepareUserCache(session.user.id);
        profileHydrationPromise = fetchAndCacheProfileData();
    }

    return session;
}

function updateHeaderAuth(session) {
    if (!dom.authButtonsContainer) return;
    if (session) {
        let email = session.user.email || 'User';
        let displayName = '';
        try {
            const profileData = JSON.parse(localStorage.getItem('userProfileData') || '{}');
            if (profileData.name && profileData.name.trim()) {
                displayName = profileData.name.trim();
            }
        } catch (e) {
            // Fall back to other name sources
        }
        if (!displayName && session.user && session.user.user_metadata && session.user.user_metadata.full_name) {
            displayName = session.user.user_metadata.full_name;
        }
        if (!displayName) {
            displayName = email.split('@')[0];
        }
        let initial = displayName.charAt(0).toUpperCase();
        dom.authButtonsContainer.innerHTML = `
            <div class="user-profile-container">
                <div class="user-icon-wrapper">
                    <div class="user-icon" data-email="${email}">${initial}</div>
                    <div class="user-hover-card">
                        <div class="user-hover-content">
                            <p class="user-email">${displayName}</p>
                            <a href="/profile.html" class="profile-link-btn">Edit Profile</a>
                            <button id="logoutBtn" class="logout-btn">Logout</button>
                        </div>
                    </div>
                </div>
            </div>`;
        const userProfileContainer = dom.authButtonsContainer.querySelector('.user-profile-container');
        const userIconWrapper = userProfileContainer.querySelector('.user-icon-wrapper');
        const userHoverCard = userProfileContainer.querySelector('.user-hover-card');

        userIconWrapper.addEventListener('click', (event) => {
            event.stopPropagation();
            userHoverCard.classList.toggle('show');
        });
        dom.authButtonsContainer.querySelector('#logoutBtn').addEventListener('click', handleLogout);
        checkUserEnrollment();
    } else {
        dom.authButtonsContainer.innerHTML = `<a href="/login.html" class="icon-button" aria-label="Login"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg></a>`;
    }
}

window.handleLogout = async () => {
    userEnrollmentsCache = null;
    enrollmentStatusCache = null;
    // Sign out from Supabase
    await supabaseClient.auth.signOut();

    // Clear all user-specific localStorage data
    localStorage.removeItem('userJobPreference');
    localStorage.removeItem('userProfileData');
    localStorage.removeItem('userCVFileName');
    localStorage.removeItem('userCVText');
    localStorage.removeItem('userCVImages');
    localStorage.removeItem('subscribedTopics');
    localStorage.removeItem('newUserSignup');
    localStorage.removeItem('newUserEmail');

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
            keysToRemove.push(key);
        }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // Reset app state
    currentSession = null;
    appliedJobIds.clear();
    updateHeaderAuth(null);
    const lmsNavLink = document.getElementById('lms-nav-link');
    if (lmsNavLink) lmsNavLink.style.display = 'none';

    // Redirect to home page
    window.location.href = '/';
};

async function fetchUserEnrollmentsOnce(userId) {
    if (userEnrollmentsCache !== null) {
        return userEnrollmentsCache;
    }
    if (!userId) {
        userEnrollmentsCache = [];
        enrollmentStatusCache = { any: false, industrialTraining: false, freshers: false };
        return userEnrollmentsCache;
    }
    try {
        const { data, error } = await supabaseClient
            .from('enrollment')
            .select('course')
            .eq('uuid', userId);
        if (error) throw error;
        userEnrollmentsCache = (data || []).map(e => e.course);
    } catch (err) {
        console.error("Failed to fetch user enrollments:", err);
        userEnrollmentsCache = [];
    }
    const hasAny = userEnrollmentsCache.length > 0;
    enrollmentStatusCache = {
        any: hasAny,
        industrialTraining: userEnrollmentsCache.includes('industrial-training-mastery'),
        freshers: userEnrollmentsCache.includes('msc-ca-freshers-program')
    };
    return userEnrollmentsCache;
}

async function checkUserEnrollment() {
    if (!currentSession || !currentSession.user) return;
    const lmsNavLink = document.getElementById('lms-nav-link');
    if (!lmsNavLink) return;
    await fetchUserEnrollmentsOnce(currentSession.user.id);
    lmsNavLink.style.display = (enrollmentStatusCache && enrollmentStatusCache.any) ? 'flex' : 'none';

    // Show My Applications link for logged in users
    const historyNavLink = document.getElementById('history-nav-link');
    if (historyNavLink && currentSession) {
        historyNavLink.style.display = 'flex';
    }
}

let userEnrollmentsCache = null;
let enrollmentStatusCache = null; // { any, industrialTraining, freshers }

async function prefetchEnrollmentStatus(userId) {
    await fetchUserEnrollmentsOnce(userId);
}

function isEnrolledSync(tableName) {
    if (!enrollmentStatusCache) return false;
    if (tableName === 'Industrial Training Job Portal') return enrollmentStatusCache.industrialTraining;
    return enrollmentStatusCache.any;
}

async function getUserEnrollments(userId) {
    return fetchUserEnrollmentsOnce(userId);
}

async function checkEnrollmentForTable(tableName, userId) {
    if (!userId) return false;
    await fetchUserEnrollmentsOnce(userId);
    return isEnrolledSync(tableName);
}

function clearEnrollmentCache() {
    userEnrollmentsCache = null;
    enrollmentStatusCache = null;
}

function getCoursePageLink() {
    return PORTAL.programme.href;
}

function showEnrollmentRequiredPopup() {
    const existing = document.querySelector('.cv-popup-overlay');
    if (existing) existing.remove();

    const popupHtml = `
        <div class="cv-popup-overlay">
            <div class="cv-popup-card">
                <div class="cv-popup-icon" style="background-color: #fef3c7; color: #d97706;">
                    <i class="fas fa-lock"></i>
                </div>
                <h3>Exclusive Premium Feature</h3>
                <p>This feature is exclusively only available for course enrolled students.</p>
                <div class="cv-popup-btns">
                    <a href="${getCoursePageLink()}" target="_blank" class="cv-popup-btn-primary">View Courses</a>
                    <button class="cv-popup-btn-secondary" id="closeEnrollmentPopup">Maybe Later</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', popupHtml);

    const overlay = document.querySelector('.cv-popup-overlay');
    setTimeout(() => overlay.classList.add('show'), 10);

    const closeBtn = document.getElementById('closeEnrollmentPopup');
    const closePopup = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
    };

    closeBtn.addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePopup();
    });
}




function isRecruiterPostedJob(job) {
    return isTeamPosted(job);
}

function showRecruiterProfileRequiredPopup(job) {
    const existing = document.querySelector('.recruiter-gate-popup-overlay');
    if (existing) existing.remove();

    const popupHtml = `
        <div class="recruiter-gate-popup-overlay cv-popup-overlay">
            <div class="cv-popup-card" style="max-width: 440px; text-align: center;">
                <div class="cv-popup-icon" style="background-color: #fee2e2; color: #ef4444; margin: 0 auto 1rem;">
                    <i class="fas fa-id-card-clip"></i>
                </div>
                <h3 style="font-size: 1.25rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem;">Profile Required to Apply</h3>
                <p style="font-size: 0.88rem; color: #475569; line-height: 1.5; margin-bottom: 1.5rem;">
                    This job is posted directly by a verified recruiter. Please fill your profile details and upload your CV before applying so the employer can review your candidacy.
                </p>
                <div class="cv-popup-btns" style="display: flex; flex-direction: column; gap: 0.75rem;">
                    <a href="/profile.html?redirect=${encodeURIComponent(window.location.href)}" class="cv-popup-btn-primary" style="display: block; text-align: center; text-decoration: none; padding: 0.75rem;">
                        <i class="fas fa-user-pen"></i> Complete Profile Now
                    </a>
                    <button type="button" class="cv-popup-btn-secondary" id="closeGateRequiredBtn" style="padding: 0.65rem;">
                        Maybe Later
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', popupHtml);
    const overlay = document.querySelector('.recruiter-gate-popup-overlay');
    setTimeout(() => overlay.classList.add('show'), 10);

    const closeBtn = document.getElementById('closeGateRequiredBtn');
    const closePopup = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
    };

    closeBtn.addEventListener('click', closePopup);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePopup();
    });
}

function showRecruiterProfileWarningPopup(job, percent) {
    const existing = document.querySelector('.recruiter-gate-popup-overlay');
    if (existing) existing.remove();

    const popupHtml = `
        <div class="recruiter-gate-popup-overlay cv-popup-overlay">
            <div class="cv-popup-card" style="max-width: 450px; text-align: center;">
                <div class="cv-popup-icon" style="background-color: #fef3c7; color: #d97706; margin: 0 auto 1rem;">
                    <i class="fas fa-triangle-exclamation"></i>
                </div>
                <h3 style="font-size: 1.2rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem;">Profile Incomplete (${percent}%)</h3>
                <p style="font-size: 0.88rem; color: #475569; line-height: 1.5; margin-bottom: 1.5rem;">
                    Your profile is only <strong>${percent}% complete</strong>. Easy Apply is available only when your profile is 100% complete.
                </p>
                <div class="cv-popup-btns" style="display: flex; gap: 0.75rem;">
                    <a href="/profile.html?redirect=${encodeURIComponent(window.location.href)}" class="cv-popup-btn-primary" style="flex: 1; text-align: center; text-decoration: none; padding: 0.75rem;">
                        <i class="fas fa-user-pen"></i> Complete Profile
                    </a>
                    <button type="button" class="cv-popup-btn-secondary" id="closeRecruiterGateBtn" style="flex: 1; padding: 0.75rem; font-weight: 600;">
                        Maybe Later
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', popupHtml);
    const overlay = document.querySelector('.recruiter-gate-popup-overlay');
    setTimeout(() => overlay.classList.add('show'), 10);

    const closeBtn = document.getElementById('closeRecruiterGateBtn');
    const closePopup = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
    };

    closeBtn.addEventListener('click', closePopup);

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePopup();
    });
}

function constructMailto(job, body = "") {
    const rawLink = job['Application ID'];
    if (!rawLink) return '#';
    const emailMatch = rawLink.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) return '#';
    const email = emailMatch[0];
    const subjectBase = EMAIL_SUBJECT_MAP[currentTable] || `Application for the role`;
    const subject = `${subjectBase} at ${job.Company} (Ref: My Student Club)`;
    return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/**
 * Opens a mailto link using a temporary anchor element to avoid browser security warnings.
 * This preserves the user gesture context and prevents "blocked from automatically composing email" warnings.
 * @param {string} mailtoUrl - The mailto: URL to open
 */
function openMailtoLink(mailtoUrl) {
    if (!mailtoUrl || mailtoUrl === '#') return;

    try {
        const link = document.createElement('a');
        link.href = mailtoUrl;
        link.style.display = 'none';
        link.setAttribute('target', '_self');
        document.body.appendChild(link);
        link.click();
        // Remove the element after a short delay to ensure the click is processed
        setTimeout(() => {
            if (link.parentNode) {
                document.body.removeChild(link);
            }
        }, 100);
    } catch (error) {
        console.error('Error opening mailto link:', error);
        // Fallback to window.location.href if the anchor method fails
        window.location.href = mailtoUrl;
    }
}


function getApplicationLink(id, companyName = 'the company') {
    if (!id) return '#';
    const trimmedId = id.trim();
    if (trimmedId.startsWith('http')) {
        try {
            new URL(trimmedId);
            return trimmedId;
        } catch (_) {
        }
    }
    if (trimmedId.includes('@')) {
        return constructMailto({ 'Application ID': trimmedId, Company: companyName });
    }
    return `https://www.google.com/search?q=${encodeURIComponent(trimmedId + ' careers')}`;
}

async function loadBanners() {
    const carousel = document.querySelector('.carousel');
    const bannerSection = document.querySelector('.banner-section');
    if (!carousel || !bannerSection) return;
    try {
        const { data, error } = await supabaseClient.from('Banners').select('Image, Hyperlink, Type, visible_to_unenrolled');
        if (error) throw error;
        const banners = data;
        carousel.innerHTML = '';
        const currentType = currentTable === "Semi Qualified Jobs" ? "Semi-Qualified" : currentTable === "Fresher Jobs" ? "Freshers" : currentTable.split(' ')[0];

        // Determine if current user is enrolled in any course
        let isEnrolled = false;
        if (currentSession?.user?.id) {
            await fetchUserEnrollmentsOnce(currentSession.user.id);
            isEnrolled = Boolean(enrollmentStatusCache && enrollmentStatusCache.any);
        }

        const relevantBanners = banners.filter(b => {
            const matchesType = b.Type === 'All' || b.Type === currentType;
            const matchesEnrollment = b.visible_to_unenrolled === null ||
                b.visible_to_unenrolled === undefined ||
                (b.visible_to_unenrolled === true && !isEnrolled) ||
                (b.visible_to_unenrolled === false && isEnrolled);
            return matchesType && matchesEnrollment;
        });

        if (relevantBanners.length === 0) { bannerSection.style.display = 'none'; return; }
        bannerSection.style.display = 'block';

        relevantBanners.forEach((banner, i) => {
            const a = document.createElement('a');
            a.href = banner.Hyperlink;
            a.className = `carousel-item ${i === 0 ? 'active' : ''}`;
            a.target = "_blank";
            const img = document.createElement('img');
            img.src = banner.Image;
            img.alt = `Banner`;
            a.appendChild(img);
            carousel.appendChild(a);
        });

        const slides = document.querySelectorAll('.carousel-item');
        const fitCarouselToSlide = (slide) => {
            const image = slide?.querySelector('img');
            if (!image) return;

            const updateAspectRatio = () => {
                if (image.naturalWidth && image.naturalHeight) {
                    carousel.style.aspectRatio = `${image.naturalWidth} / ${image.naturalHeight}`;
                }
            };

            if (image.complete) updateAspectRatio();
            else image.addEventListener('load', updateAspectRatio, { once: true });
        };
        const showSlide = (idx) => {
            slides.forEach(s => s.classList.remove('active'));
            const activeSlide = slides[idx];
            activeSlide.classList.add('active');
            fitCarouselToSlide(activeSlide);
        };

        showSlide(0);
        if (slides.length > 1) {
            let currentSlide = 0;
            setInterval(() => {
                currentSlide = (currentSlide + 1) % slides.length;
                showSlide(currentSlide);
            }, 5000);
        }
    } catch (e) {
        bannerSection.style.display = 'none';
    }
}

function showNotifStatus(message, type = 'info') { if (dom.notificationStatusEl) { dom.notificationStatusEl.textContent = message; dom.notificationStatusEl.className = `notification-status status-${type}`; dom.notificationStatusEl.style.display = 'block'; if (type !== 'error') setTimeout(() => { dom.notificationStatusEl.style.display = 'none'; }, 3000); } }
function getSubscribedTopics() { return JSON.parse(localStorage.getItem('subscribedTopics') || '[]'); }
async function saveSubscribedTopics(topics) {
    localStorage.setItem('subscribedTopics', JSON.stringify(topics));
    updateNotificationBadge();

    // Also save to Supabase profile if logged in
    if (currentSession?.user?.id) {
        try {
            const { data: existingProfile } = await supabaseClient
                .from('profiles')
                .select('profile')
                .eq('uuid', currentSession.user.id)
                .maybeSingle();

            const profileData = existingProfile?.profile || {};
            profileData.notification_subscriptions = topics;
            if (!profileData.email && currentSession.user.email) profileData.email = currentSession.user.email;

            await supabaseClient.from('profiles').upsert({
                uuid: currentSession.user.id,
                profile: profileData,
                updated_at: new Date().toISOString()
            });
        } catch (e) {
            console.log('Could not save subscriptions to profile:', e);
        }
    }
}
function updateNotificationBadge() { if (dom.notificationBadge) dom.notificationBadge.style.visibility = getSubscribedTopics().length > 0 ? 'visible' : 'hidden'; }

function renderSubscribedTopics() {
    if (!dom.subscribedTopicsListEl) return;
    dom.subscribedTopicsListEl.innerHTML = '';
    const topics = getSubscribedTopics();
    if (topics.length === 0) {
        dom.subscribedTopicsListEl.innerHTML = '<p class="no-subscriptions">No active subscriptions.</p>';
    } else {
        topics.forEach(topic => {
            const { location, jobType } = formatTopicForDisplay(topic);
            const tag = document.createElement('div');
            tag.className = 'topic-tag';
            tag.innerHTML = `<span>${location}${jobType ? ` - ${jobType}` : ''}</span><button class="topic-remove" data-topic="${topic}">×</button>`;
            dom.subscribedTopicsListEl.appendChild(tag);
        });
        dom.subscribedTopicsListEl.querySelectorAll('.topic-remove').forEach(btn => btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const topic = btn.dataset.topic;
            if (await unsubscribeFromTopic(topic) && topic === 'all') { dom.topicAllCheckbox.checked = false; }
        }));
    }
    if (dom.topicAllCheckbox) dom.topicAllCheckbox.checked = topics.includes('all');
    updateSpecificTopicAreaVisibility();
}

function formatTopicForDisplay(topic) {
    if (topic === 'all') return { location: 'All', jobType: 'Notifications' };

    // Check for specific All India topics
    if (topic === 'Industrial-all') return { location: 'All India', jobType: 'Industrial Training' };
    if (topic === 'fresher-all') return { location: 'All India', jobType: 'Fresher' };
    if (topic === 'semi-all') return { location: 'All India', jobType: 'Semi Qualified' };
    if (topic === 'articleship-all') return { location: 'All India', jobType: 'Articleship' };

    const parts = topic.split('-');
    if (parts.length < 2) return { location: topic, jobType: '' };
    const jobTypeVal = parts.pop();
    const location = parts.join('-').replace(/-/g, ' ');
    const jobType = JOB_TYPES_NOTIF.find(t => t.value === jobTypeVal)?.label || jobTypeVal;
    return { location: location.charAt(0).toUpperCase() + location.slice(1), jobType };
}

function updateSpecificTopicAreaVisibility() { if (dom.specificSubscriptionForm) dom.specificSubscriptionForm.style.display = dom.topicAllCheckbox.checked ? 'none' : 'block'; }
async function manageTopicSubscription(topic, action) {
    // Actively try to get token if missing
    if (!currentFcmToken) {
        // Prioritize App token if available
        if (window.flutter_app.fcmToken) {
            currentFcmToken = window.flutter_app.fcmToken;
        }
        else if (window.flutter_app.isReady) {
        } else {
            if (Notification.permission === 'granted') {
                showNotifStatus('Connecting to notification service...', 'info');
                await requestTokenAndSync();
            } else {
                showNotifStatus('Please enable notifications first.', 'error');
                return false;
            }
        }
    }

    currentFcmToken = window.flutter_app.fcmToken || currentFcmToken;

    if (!currentFcmToken) {
        showNotifStatus('Notification service unavailable. Please refresh or check permissions.', 'error');
        return false;
    }
    try {
        const response = await fetch(
            'https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: currentFcmToken, topic, action }),
            }
        );
        if (!response.ok) throw new Error(await response.text());
        let topics = getSubscribedTopics();
        if (action === 'subscribe' && !topics.includes(topic)) topics.push(topic);
        else if (action === 'unsubscribe')
            topics = topics.filter((t) => t !== topic);
        saveSubscribedTopics(topics);
        renderSubscribedTopics();
        return true;
    } catch (err) {
        showNotifStatus(`Failed to ${action}`, 'error');
        return false;
    }
}
async function subscribeToTopic(topic) { return manageTopicSubscription(topic, 'subscribe'); }
async function unsubscribeFromTopic(topic) { return manageTopicSubscription(topic, 'unsubscribe'); }

function updatePermissionStatusUI() {
    if (!dom.permissionStatusDiv) return;

    if (window.flutter_app.isReady) {
        dom.enableNotificationsBtn.style.display = 'none';
        dom.topicSelectionArea.style.display = 'block';
        dom.permissionStatusDiv.textContent = 'Notifications are managed by the app.';
        dom.permissionStatusDiv.className = 'notification-status status-success';
        dom.permissionStatusDiv.style.display = 'block';
        return;
    }

    const permission = Notification.permission;
    dom.enableNotificationsBtn.style.display = permission === 'default' ? 'block' : 'none';
    dom.topicSelectionArea.style.display = permission === 'granted' ? 'block' : 'none';
    if (permission === 'granted') {
        dom.permissionStatusDiv.textContent = 'Notifications are enabled.';
        dom.permissionStatusDiv.className = 'notification-status status-success';
    } else if (permission === 'denied') {
        dom.permissionStatusDiv.textContent = 'Notifications are blocked in browser settings.';
        dom.permissionStatusDiv.className = 'notification-status status-error';
    } else {
        dom.permissionStatusDiv.textContent = 'Enable notifications for job alerts.';
        dom.permissionStatusDiv.className = 'notification-status status-info';
    }
    dom.permissionStatusDiv.style.display = 'block';
}
function populateNotificationDropdowns() { if (dom.locationSelectEl) { dom.locationSelectEl.innerHTML = '<option value="" disabled selected>Select Location</option><option value="all">All India</option>'; LOCATIONS_NOTIF.sort().forEach(loc => { const opt = document.createElement('option'); opt.value = loc; opt.textContent = loc.charAt(0).toUpperCase() + loc.slice(1); dom.locationSelectEl.appendChild(opt); }); } if (dom.jobTypeSelectEl) { dom.jobTypeSelectEl.innerHTML = '<option value="" disabled selected>Select Job Type</option>'; JOB_TYPES_NOTIF.forEach(type => { const opt = document.createElement('option'); opt.value = type.value; opt.textContent = type.label; dom.jobTypeSelectEl.appendChild(opt); }); } }

async function initializeFCM() {
    if (window.flutter_app.isReady) {
        currentFcmToken = window.flutter_app.fcmToken;
        await syncNotificationTopics();
        return;
    }

    try {
        if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
        firebaseMessaging = firebase.messaging();
        firebaseMessaging.onMessage(payload => { });
        if ('serviceWorker' in navigator) await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        if (Notification.permission === 'granted') await requestTokenAndSync();
    } catch (err) { console.error('FCM init failed:', err); }
}

async function requestTokenAndSync() {
    if (window.flutter_app.isReady) return;
    if (!firebaseMessaging) return;
    try {
        const token = await firebaseMessaging.getToken({ vapidKey: VAPID_KEY });
        if (token) { currentFcmToken = token; await syncNotificationTopics(); }
    } catch (err) {
        console.error('FCM token request failed:', err);
    }
}
function shouldSync() { const lastSync = localStorage.getItem('notificationSyncTimestamp'); if (!lastSync) return true; return new Date(parseInt(lastSync)).toDateString() !== new Date().toDateString(); }
async function syncNotificationTopics() {
    currentFcmToken = window.flutter_app.fcmToken || currentFcmToken;
    if (!currentFcmToken || !shouldSync()) return;
    await Promise.all(getSubscribedTopics().map(topic => manageTopicSubscription(topic, 'subscribe')));
    localStorage.setItem('notificationSyncTimestamp', Date.now().toString());
}

async function initializeUserFeatures() {
    if (!currentSession) return;
    try {
        const { data, error } = await supabaseClient
            .from('job_applications')
            .select('job_id, job_table')
            .eq('user_id', currentSession.user.id)
            .like('job_table', `${currentTable}%`); // Use LIKE to match both "Table" and "Table|UUID"

        if (error) throw error;

        // Extract IDs: If piggybacked (contains |), use the UUID part. Otherwise use normal job_id.
        appliedJobIds = new Set(data.map(app => {
            if (app.job_table.includes('|')) {
                return app.job_table.split('|')[1]; // Return the UUID
            }
            return app.job_id;
        }));
    } catch (error) {
        console.error('Error fetching applied jobs:', error);
    }
    checkAndSyncCVBackground(); // Run background sync check
}

function setupEventListeners() {
    if (dom.menuButton) dom.menuButton.addEventListener('click', () => dom.expandedMenu.classList.add('active'));
    if (dom.menuCloseBtn) dom.menuCloseBtn.addEventListener('click', () => dom.expandedMenu.classList.remove('active'));

    if (dom.notificationsBtn) dom.notificationsBtn.addEventListener('click', (e) => {
        e.stopPropagation(); dom.notificationPopup.style.display = dom.notificationPopup.style.display === 'flex' ? 'none' : 'flex';
        if (dom.notificationPopup.style.display === 'flex') {
            updatePermissionStatusUI();
            if (window.flutter_app.isReady || Notification.permission === 'granted') {
                if (!firebaseMessaging && !window.flutter_app.isReady) initializeFCM().then(renderSubscribedTopics);
                else renderSubscribedTopics();
            } else {
                renderSubscribedTopics();
            }
        }
    });

    if (dom.closeNotificationPopup) dom.closeNotificationPopup.addEventListener('click', () => dom.notificationPopup.style.display = 'none');
    if (dom.enableNotificationsBtn) dom.enableNotificationsBtn.addEventListener('click', async () => { try { const permission = await Notification.requestPermission(); updatePermissionStatusUI(); if (permission === 'granted') await initializeFCM(); } catch (err) { } });
    if (dom.topicAllCheckbox) {
        dom.topicAllCheckbox.addEventListener('change', async (e) => {
            const isChecked = e.target.checked;
            e.target.disabled = true; // Disable to prevent multi-clicks
            try {
                const success = isChecked ? await subscribeToTopic('all') : await unsubscribeFromTopic('all');
                if (!success) {
                    e.target.checked = !isChecked; // Revert if failed
                }
            } catch (err) {
                console.error('Subscription error:', err);
                e.target.checked = !isChecked;
            } finally {
                e.target.disabled = false; // Re-enable
            }
        });
    }
    if (dom.subscribeBtnEl) dom.subscribeBtnEl.addEventListener('click', async () => {
        const location = dom.locationSelectEl.value;
        const jobType = dom.jobTypeSelectEl.value;
        if (!location || !jobType) return;

        let topicName;
        if (location === 'all') {
            topicName = getTypeWideTopicForJobType(jobType);
        } else {
            topicName = `${location}-${jobType}`;
        }

        if (await subscribeToTopic(topicName)) {
            dom.locationSelectEl.selectedIndex = 0;
            dom.jobTypeSelectEl.selectedIndex = 0;
            dom.subscribeBtnEl.disabled = true;
            // Reset custom select UI if present
            if (dom.locationSelectEl.parentElement.classList.contains('custom-select-wrapper')) {
                dom.locationSelectEl.parentElement.querySelector('.custom-select-trigger span').textContent = 'Select Location';
                dom.locationSelectEl.parentElement.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
            }
            if (dom.jobTypeSelectEl.parentElement.classList.contains('custom-select-wrapper')) {
                dom.jobTypeSelectEl.parentElement.querySelector('.custom-select-trigger span').textContent = 'Select Job Type';
                dom.jobTypeSelectEl.parentElement.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
            }
        }
    });
    if (dom.locationSelectEl && dom.jobTypeSelectEl && dom.subscribeBtnEl) {
        const updateSubBtn = () => { dom.subscribeBtnEl.disabled = !(dom.locationSelectEl.value && dom.jobTypeSelectEl.value); };
        dom.locationSelectEl.addEventListener('change', updateSubBtn);
        dom.jobTypeSelectEl.addEventListener('change', updateSubBtn);
    }

    const resourcesBtn = document.getElementById('resourcesDropdownBtn');
    if (resourcesBtn) {
        const resourcesDropdown = document.getElementById('resourcesDropdown');
        const dropdownIcon = resourcesBtn.querySelector('.dropdown-icon');
        resourcesBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (resourcesDropdown) resourcesDropdown.classList.toggle('active');
            if (dropdownIcon) dropdownIcon.classList.toggle('open');
        });
    }

    const toolsBtn = document.getElementById('toolsDropdownBtn');
    if (toolsBtn) {
        const toolsDropdown = document.getElementById('toolsDropdown');
        const dropdownIcon = toolsBtn.querySelector('.dropdown-icon');
        toolsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toolsDropdown.classList.toggle('active');
            if (dropdownIcon) dropdownIcon.classList.toggle('open');
        });
    }

    document.addEventListener('click', (e) => {
        if (dom.expandedMenu && dom.expandedMenu.classList.contains('active') && !dom.expandedMenu.contains(e.target) && !dom.menuButton.contains(e.target)) dom.expandedMenu.classList.remove('active');
        if (dom.notificationPopup && dom.notificationPopup.style.display === 'flex' && !dom.notificationPopup.contains(e.target) && !dom.notificationsBtn.contains(e.target)) dom.notificationPopup.style.display = 'none';
        const resourcesDropdown = document.getElementById('resourcesDropdown');
        const resourcesBtn = document.getElementById('resourcesDropdownBtn');
        if (resourcesDropdown && resourcesDropdown.classList.contains('active') && !resourcesDropdown.contains(e.target) && (!resourcesBtn || !resourcesBtn.contains(e.target))) {
            resourcesDropdown.classList.remove('active');
            if (resourcesBtn && resourcesBtn.querySelector('.dropdown-icon')) resourcesBtn.querySelector('.dropdown-icon').classList.remove('open');
        }
        const toolsDropdown = document.getElementById('toolsDropdown');
        const toolsBtn = document.getElementById('toolsDropdownBtn');
        if (toolsDropdown && toolsDropdown.classList.contains('active') && !toolsDropdown.contains(e.target) && !toolsBtn.contains(e.target)) {
            toolsDropdown.classList.remove('active');
            if (toolsBtn.querySelector('.dropdown-icon')) toolsBtn.querySelector('.dropdown-icon').classList.remove('open');
        }

        const userProfileContainer = document.querySelector('.user-profile-container');
        const userHoverCard = document.querySelector('.user-hover-card');
        if (userProfileContainer && userHoverCard && userHoverCard.classList.contains('show')) {
            if (!userProfileContainer.contains(e.target)) {
                userHoverCard.classList.remove('show');
            }
        }
    });
}

function initCustomSelects() {
    const selectorIds = ['locationSelect', 'jobTypeSelect'];

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select-wrapper')) {
            document.querySelectorAll('.custom-select-wrapper.open').forEach(wrapper => {
                wrapper.classList.remove('open');
                const opts = wrapper.querySelector('.custom-options');
                if (opts) {
                    opts.style.opacity = '0';
                    setTimeout(() => opts.style.display = 'none', 200);
                }
            });
        }
    });

    selectorIds.forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;

        // Ensure we don't double-wrap if re-run
        if (select.parentNode.classList.contains('custom-select-wrapper')) return;

        // Create Custom UI
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';

        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        trigger.innerHTML = `<span>${select.options[select.selectedIndex]?.text || 'Select'}</span><div class="custom-arrow"></div>`;

        const optionsList = document.createElement('div');
        optionsList.className = 'custom-options';

        // Function to rebuild options
        const buildOptions = () => {
            optionsList.innerHTML = '';
            Array.from(select.options).forEach(opt => {
                const div = document.createElement('div');
                div.className = `custom-option ${opt.selected ? 'selected' : ''}`;
                div.textContent = opt.text;
                div.dataset.value = opt.value;
                div.addEventListener('click', (e) => {
                    e.stopPropagation();
                    select.value = opt.value;
                    trigger.querySelector('span').textContent = opt.text;
                    wrapper.classList.remove('open');
                    optionsList.style.display = 'none'; // Instant hide

                    // Visual update
                    optionsList.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
                    div.classList.add('selected');

                    // Trigger native event
                    select.dispatchEvent(new Event('change'));
                });
                optionsList.appendChild(div);
            });
        };

        // Initial build
        buildOptions();

        // Assemble
        select.style.display = 'none';
        select.parentNode.insertBefore(wrapper, select);
        wrapper.appendChild(select); // Move select inside to keep DOM clean-ish
        wrapper.appendChild(trigger);
        wrapper.appendChild(optionsList);

        // Toggle Event
        trigger.addEventListener('click', () => {
            const isOpen = wrapper.classList.contains('open');
            // Close others
            document.querySelectorAll('.custom-select-wrapper.open').forEach(w => {
                if (w !== wrapper) {
                    w.classList.remove('open');
                    w.querySelector('.custom-options').style.display = 'none';
                }
            });

            if (!isOpen) {
                wrapper.classList.add('open');
                optionsList.style.display = 'block';
                // Trigger reflow
                optionsList.offsetHeight;
                optionsList.style.opacity = '1';
            } else {
                wrapper.classList.remove('open');
                optionsList.style.opacity = '0';
                setTimeout(() => optionsList.style.display = 'none', 200);
            }
        });

        // REACTIVITY: Watch for Native Changes (JS updates, Resets)
        // 1. MutationObserver for option changes (dynamic loading)
        const observer = new MutationObserver(() => {
            buildOptions();
            const sel = select.options[select.selectedIndex];
            if (sel) trigger.querySelector('span').textContent = sel.text;
        });
        observer.observe(select, { childList: true, subtree: true });

        // 2. Intercept programmatic .value changes (e.g. Reset Button)
        const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
        Object.defineProperty(select, 'value', {
            get: function () { return descriptor.get.call(this); },
            set: function (val) {
                descriptor.set.call(this, val);
                // Update UI
                const sel = this.options[this.selectedIndex];
                if (sel) {
                    trigger.querySelector('span').textContent = sel.text;
                    optionsList.querySelectorAll('.custom-option').forEach(o => {
                        o.classList.toggle('selected', o.dataset.value === val);
                    });
                }
            }
        });

        // 3. Listen for internal value changes (standard change event)
        select.addEventListener('change', () => {
            const sel = select.options[select.selectedIndex];
            if (sel) {
                trigger.querySelector('span').textContent = sel.text;
                optionsList.querySelectorAll('.custom-option').forEach(o => {
                    o.classList.toggle('selected', o.dataset.value === select.value);
                });
            }
        });
    });
}

// What the v2 listing (scripts/portal-v2/portal-app.js) may call. Everything about applying stays here.
function createPortalHost() {
    const applicationLink = (job) => getApplicationLink(job['Application ID'], job.Company);
    return {
        portal: PORTAL,
        supabase: supabaseClient,
        getSession: () => currentSession,
        getCourses: () => userEnrollmentsCache || [],
        getAppliedIds: () => appliedJobIds,
        // Existing perks (AI Apply, Connect with peers, Original post): any enrolment, IT enrolment on the IT portal.
        isEnrolledForPerks: () => isEnrolledSync(currentTable),
        getCachedUnlock: (job) => (currentSession ? getCachedUnlockedJob(job.id, currentTable, currentSession) : null),
        unlock: (job) => unlockJobDetails(job, currentTable, currentSession, { endpoint: BROWSER_GUARD_WORKER_URL }),
        recordApplication: (job, button) => recordApplication(job, button),
        easyApply: (job, button) => recordApplication(job, button),
        simpleApply: async (job, button) => {
            if (currentSession) await recordApplication(job, button);
            openMailtoLink(applicationLink(job));
        },
        aiApply: async (job, button) => {
            if (!currentSession) {
                window.location.href = '/login.html';
                return;
            }
            if (!isEnrolledSync(currentTable)) {
                showEnrollmentRequiredPopup();
                return;
            }
            await handleAiApplyClick(job, button, currentTable, applicationLink(job));
        },
        openMailto: (job) => openMailtoLink(applicationLink(job)),
        share: (job, button) => shareJob(job, button),
        requireEnrollment: () => showEnrollmentRequiredPopup(),
        toast: (message, type) => showToast(message, type),
    };
}

async function initializePage() {
    dom.menuButton = document.getElementById('menuButton');
    dom.expandedMenu = document.getElementById('expandedMenu');
    dom.menuCloseBtn = document.getElementById('menuCloseBtn');
    dom.authButtonsContainer = document.querySelector('.auth-buttons-container');
    dom.notificationsBtn = document.getElementById('notificationsBtn');
    dom.notificationPopup = document.getElementById('notificationPopup');
    dom.closeNotificationPopup = document.getElementById('closeNotificationPopup');
    dom.notificationStatusEl = document.getElementById('notificationStatus');
    dom.notificationBadge = document.getElementById('notificationBadge');
    dom.topicAllCheckbox = document.getElementById('topic-all');
    dom.topicSelectionArea = document.getElementById('topic-selection-area');
    dom.permissionStatusDiv = document.getElementById('notification-permission-status');
    dom.enableNotificationsBtn = document.getElementById('enable-notifications-btn');
    dom.subscribedTopicsListEl = document.getElementById('subscribedTopicsList');
    dom.locationSelectEl = document.getElementById('locationSelect');
    dom.jobTypeSelectEl = document.getElementById('jobTypeSelect');
    dom.subscribeBtnEl = document.getElementById('subscribeBtn');
    dom.specificSubscriptionForm = document.getElementById('specific-subscription-form');

    initCustomSelects();
    setupEventListeners();

    // Start loading vacancies at once; login, enrolments and applications fill in when they arrive.
    portalApp = mountPortalApp(createPortalHost());
    const sharedParams = new URLSearchParams(window.location.search);
    if (portalApp && sharedParams.get('id')) {
        portalApp.openSharedJob(sharedParams.get('id'), sharedParams.get('type'));
    }

    const session = await checkAuth();
    // Wait for the server-backed profile cache before rendering the account
    // widget so it cannot briefly (or permanently) show an older name.
    if (session && profileHydrationPromise) {
        await profileHydrationPromise;
    }
    updateHeaderAuth(session);

    if (session) {
        localStorage.removeItem('portalVisitCount');
        await initializeUserFeatures();
        portalApp?.rerender();

        // Onboarding Check: Ensure looking_for details are completed
        let profile = profileHydrationPromise ? await profileHydrationPromise : null;
        const cached = localStorage.getItem('userProfileData');
        if (!profile && cached) {
            try { profile = JSON.parse(cached); } catch (e) { }
        }
        if (!profile && !profileHydrationPromise) {
            profile = await fetchAndCacheProfileData();
        }

        // Show onboarding segment modal if looking_for is not set on the homepage
        if (!profile || !profile.looking_for) {
            const path = window.location.pathname;
            if (path === '/' || path === '/index.html') {
                setTimeout(() => {
                    showOnboardingSegmentModal();
                }, 800); // Small pleasant delay after load
            }
        } else {
            // User has a default portal set — redirect if arriving from an external link/bookmark
            const lookingForToPreference = {
                'CA Industrial Training Default': 'industrial',
                'CA Articleship': 'articleship',
                'CA Fresher': 'fresher_fresher',
                'Semi Qualified CA': 'semi_fresher'
            };
            const pref = getJobPreference() || lookingForToPreference[profile.looking_for];
            if (pref && !sharedParams.get('id')) {
                redirectToPreferredPortal(pref);
            }
        }
    } else {
        // Track visits for unlogged users
        let visitCount = parseInt(localStorage.getItem('portalVisitCount') || '0');
        visitCount++;
        localStorage.setItem('portalVisitCount', visitCount);

        if (visitCount === 3) {
            showToast("Create a free account to keep browsing jobs, get vacancy alerts, and access exclusive career tools.", "info");
        } else if (visitCount >= 5) {
            const overlay = document.getElementById('loginPromptOverlay');
            if (overlay) {
                overlay.style.display = 'flex';
                document.body.style.overflow = 'hidden'; // Prevent browsing jobs
            }
        }
    }

    loadBanners();
    populateNotificationDropdowns();
    updateNotificationBadge();
    if ((typeof Notification !== 'undefined' && Notification.permission === 'granted') || window.flutter_app.isReady) {
        initializeFCM();
    }
    renderProfileCompletionBanner();
    dv2UpdateProfileWidgets();
}

document.addEventListener('DOMContentLoaded', initializePage);

// Handle explicit portal nav navigation flag
document.addEventListener('DOMContentLoaded', () => {
    const handlePortalClick = (e) => {
        const tabLink = e.target.closest('.pv2-tabs .pv2-tab, .site-footer-nav .footer-tab');
        if (tabLink) {
            sessionStorage.setItem('explicitPortalNav', 'true');
        }
    };
    document.addEventListener('click', handlePortalClick);
});

document.addEventListener('DOMContentLoaded', async () => {
    const isNewUser = localStorage.getItem('newUserSignup');
    const hasResume = localStorage.getItem('userCVText');

    if (isNewUser === 'true') {
        const session = currentSession || (await supabaseClient.auth.getSession()).data.session;
        if (profileHydrationPromise) await profileHydrationPromise;
        const onboardingDismissed = window.MSCProfileState?.wasOnboardingDismissed(session?.user?.email);

        if (session && !hasResume && !onboardingDismissed) {
            setTimeout(() => {
                const modal = document.getElementById('resumePromptModal');
                if (modal) {
                    let roleType = 'Industrial Trainees/Article Assistants/CA Freshers/Experienced CA/Semi Qualified CA';
                    const cachedProfile = localStorage.getItem('userProfileData');
                    let profile = null;
                    if (cachedProfile) {
                        try { profile = JSON.parse(cachedProfile); } catch (e) { }
                    }
                    const jobPref = localStorage.getItem('userJobPreference');
                    const lookingFor = profile?.looking_for;

                    if (jobPref === 'industrial' || lookingFor === 'CA Industrial Training Default') {
                        roleType = 'Industrial Trainees';
                    } else if (jobPref === 'articleship' || lookingFor === 'CA Articleship') {
                        roleType = 'Article Assistants';
                    } else if (jobPref === 'fresher_fresher') {
                        roleType = 'CA Freshers';
                    } else if (jobPref === 'fresher_experienced') {
                        roleType = 'Experienced CA';
                    } else if (lookingFor === 'CA Fresher') {
                        roleType = 'CA Freshers';
                    } else if (jobPref === 'semi_fresher' || jobPref === 'semi_experienced' || lookingFor === 'Semi Qualified CA') {
                        roleType = 'Semi Qualified CA';
                    } else {
                        const path = window.location.pathname;
                        if (path.includes('/articleship')) roleType = 'Article Assistants';
                        else if (path.toLowerCase().includes('/experienced-ca')) roleType = 'Experienced CA';
                        else if (path.includes('/fresher')) roleType = 'CA Freshers';
                        else if (path.includes('/semi-qualified')) roleType = 'Semi Qualified CA';
                        else roleType = 'Industrial Trainees';
                    }

                    const titleEl = document.getElementById('resumePromptTitle');
                    const descEl = document.getElementById('resumePromptDesc');
                    const roleTypeEl = document.getElementById('resumePromptRoleType');

                    if (titleEl) titleEl.textContent = 'Complete your MSC Profile';
                    if (roleTypeEl) {
                        roleTypeEl.textContent = roleType;
                    } else if (descEl) {
                        descEl.innerHTML = `Complete your MSC Profile and get discovered by 1000+ recruiters hiring for <strong>${roleType}</strong>.`;
                    }
                    modal.style.display = 'flex';
                }
            }, 1000);
        }

        localStorage.removeItem('newUserSignup');
        localStorage.removeItem('newUserEmail');
    }
});

document.getElementById('skipResumePrompt')?.addEventListener('click', () => {
    const modal = document.getElementById('resumePromptModal');
    if (modal) modal.style.display = 'none';
    window.MSCProfileState?.setOnboardingDismissed(currentSession?.user?.email);
});

document.getElementById('resumePromptModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'resumePromptModal') {
        const modal = document.getElementById('resumePromptModal');
        if (modal) modal.style.display = 'none';
        window.MSCProfileState?.setOnboardingDismissed(currentSession?.user?.email);
    }
});

// =================== DPDP CONSENT CHECK ===================
const DPDP_CONSENT_TEXT = 'I consent to My Student Club sharing my CV and complete profile details with potential companies and recruiters for job-matching purposes.';

function getOrInjectConsentModal() {
    let modal = document.getElementById('cvConsentPromptModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'cvConsentPromptModal';
        modal.className = 'modal-overlay-container';
        modal.style.cssText = 'display: none; z-index: 2004;';
        modal.innerHTML = `
    <div class="modal-dialog" style="max-width: 460px;">
      <div style="padding: 2rem; text-align: center;">
        <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, #D1FAE5, #ECFDF5); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem;">
          <i class="fas fa-shield-alt" style="font-size: 1.75rem; color: #16A34A;"></i>
        </div>
        <h3 style="font-size: 1.25rem; font-weight: 700; color: #1f2937; margin-bottom: 0.5rem;">Your CV Data Consent</h3>
        <p style="color: #6b7280; margin-bottom: 0.25rem; line-height: 1.6; font-size: 0.92rem;">
          Under India's <strong>Digital Personal Data Protection Act, 2023</strong>, we need your explicit permission to share your CV with employers.
        </p>
        <div style="background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 10px; padding: 1rem; margin: 1.25rem 0; text-align: left;">
          <p style="color: #374151; font-size: 0.88rem; line-height: 1.6; margin: 0;">
            <i class="fas fa-quote-left" style="color: #16A34A; margin-right: 0.3rem; font-size: 0.7rem;"></i>
            I consent to My Student Club sharing my CV and complete profile details with potential companies and recruiters for job-matching purposes.
            <i class="fas fa-quote-right" style="color: #16A34A; margin-left: 0.3rem; font-size: 0.7rem;"></i>
          </p>
        </div>
        <button id="cvConsentAcceptBtn" class="btn btn-primary"
          style="width: 100%; padding: 0.875rem; font-size: 1rem; margin-bottom: 0.75rem; background: linear-gradient(135deg, #16A34A, #15803D); border-color: #16A34A;">
          <i class="fas fa-check-circle"></i>&nbsp; I Agree — Share My CV
        </button>
        <button id="cvConsentDeclineBtn"
          style="background: none; border: none; color: #6b7280; cursor: pointer; font-size: 0.85rem; padding: 0.5rem; transition: color 0.2s;">
          No thanks — take me to my profile
        </button>
        <p style="color: #9CA3AF; font-size: 0.75rem; margin-top: 0.75rem; line-height: 1.5;">
          You can withdraw consent at any time from your <a href="/profile.html" style="color: #457EFF;">profile page</a>.
          <a href="/privacy-policy.html" target="_blank" style="color: #457EFF;">Read our Privacy Policy</a>.
        </p>
      </div>
    </div>`;
        document.body.appendChild(modal);
    }
    bindConsentModalButtons();
    return modal;
}

function bindConsentModalButtons() {
    const acceptBtn = document.getElementById('cvConsentAcceptBtn');
    if (acceptBtn && !acceptBtn.dataset.bound) {
        acceptBtn.dataset.bound = 'true';
        acceptBtn.addEventListener('click', async () => {
            console.log("DEBUG: cvConsentAcceptBtn clicked!");
            const modal = document.getElementById('cvConsentPromptModal');
            if (modal) modal.style.display = 'none';
            sessionStorage.setItem('cvConsentDismissed', 'true');
            localStorage.setItem('cvConsentDismissed', 'true');
            showToast('Syncing your CV to cloud...', 'info');
            try {
                const now = new Date().toISOString();
                // Save consent record immediately
                await supabaseClient.from('consentform').upsert({
                    user_id: currentSession.user.id,
                    cv_sharing_consent: true,
                    consent_text: DPDP_CONSENT_TEXT,
                    consented_at: now,
                    withdrawn_at: null,
                    user_agent: navigator.userAgent,
                    updated_at: now
                }, { onConflict: 'user_id' });

                const syncSuccess = await checkAndSyncCVBackground();
                if (syncSuccess) {
                    showToast('Thank you! Your CV has been backed up and your consent has been recorded.', 'success');
                } else {
                    showToast('Consent recorded successfully! Note: CV background sync will complete on your next profile save.', 'info', 6000);
                }
            } catch (e) {
                console.error('Failed to save consent:', e);
                showToast('Could not save consent. Please try again from your profile.', 'error');
            }
        });
    }

    const declineBtn = document.getElementById('cvConsentDeclineBtn');
    if (declineBtn && !declineBtn.dataset.bound) {
        declineBtn.dataset.bound = 'true';
        declineBtn.addEventListener('click', async () => {
            const modal = document.getElementById('cvConsentPromptModal');
            if (modal) modal.style.display = 'none';
            sessionStorage.setItem('cvConsentDismissed', 'true');
            localStorage.setItem('cvConsentDismissed', 'true');

            if (currentSession && currentSession.user) {
                try {
                    const now = new Date().toISOString();
                    await supabaseClient.from('consentform').upsert({
                        user_id: currentSession.user.id,
                        cv_sharing_consent: false,
                        consent_text: DPDP_CONSENT_TEXT,
                        consented_at: null,
                        withdrawn_at: now,
                        user_agent: navigator.userAgent,
                        updated_at: now
                    }, { onConflict: 'user_id' });
                } catch (e) {
                    console.error('Failed to record consent decline:', e);
                }
            }

            window.location.href = '/profile.html';
        });
    }
}

async function checkAndPromptConsent() {
    if (!currentSession) return;
    if (sessionStorage.getItem('cvConsentDismissed') === 'true' || localStorage.getItem('cvConsentDismissed') === 'true') {
        return;
    }
    const hasCV = localStorage.getItem('userCVText');
    if (!hasCV) return; // No CV uploaded, no consent needed

    try {
        const { data } = await supabaseClient
            .from('consentform')
            .select('cv_sharing_consent')
            .eq('user_id', currentSession.user.id)
            .maybeSingle();

        // Only prompt if no record exists in consentform table (data is null)
        // If data exists (whether cv_sharing_consent is true or false), the user has already responded/consented/declined.
        if (!data) {
            const path = window.location.pathname;
            if (path === '/' || path === '/index.html' || path.includes('/articleship') || path.includes('/fresher') || path.includes('/semi-qualified') || path.includes('/experienced')) {
                setTimeout(() => {
                    const modal = getOrInjectConsentModal();
                    if (modal) modal.style.display = 'flex';
                }, 1500);
            }
        }
    } catch (e) {
        console.log('Consent check:', e);
    }
}

// Trigger consent check and register listeners after page loads
document.addEventListener('DOMContentLoaded', () => {
    bindConsentModalButtons();
    setTimeout(() => checkAndPromptConsent(), 2000);
});

const JOB_PREFERENCE_KEY = 'userJobPreference';

// Map preference values to redirect URLs
const PREFERENCE_REDIRECT_MAP = {
    'industrial': '/',
    'articleship': '/ca-articleship-opportunities',
    'fresher_fresher': '/ca-fresher-jobs',
    'fresher_experienced': '/experienced-ca-jobs',
    'semi_fresher': '/semi-qualified-ca-jobs',
    'semi_experienced': '/semi-qualified-ca-jobs'
};

function getCurrentPagePreference() {
    const path = window.location.pathname;
    if (path.includes('/articleship')) return 'articleship';
    if (path.toLowerCase().includes('/experienced-ca')) return 'fresher_experienced';
    if (path.includes('/fresher')) return 'fresher_fresher';
    if (path.includes('/semi-qualified')) return portalApp?.state?.filters?.experience === 'Experienced' ? 'semi_experienced' : 'semi_fresher';
    return 'industrial';
}

// Get saved job preference
function getJobPreference() {
    return localStorage.getItem(JOB_PREFERENCE_KEY);
}

// Save job preference
async function saveJobPreference(preference) {
    localStorage.setItem(JOB_PREFERENCE_KEY, preference);

    // Also save to Supabase profile if logged in
    if (currentSession?.user?.id) {
        try {
            const { data: existingProfile } = await supabaseClient
                .from('profiles')
                .select('profile')
                .eq('uuid', currentSession.user.id)
                .maybeSingle();

            const profileData = existingProfile?.profile || {};
            profileData.job_preference = preference;
            if (!profileData.email && currentSession.user.email) profileData.email = currentSession.user.email;

            await supabaseClient.from('profiles').upsert({
                uuid: currentSession.user.id,
                profile: profileData,
                updated_at: new Date().toISOString()
            });
        } catch (e) {
            console.log('Could not save preference to profile:', e);
        }
    }
}

// Auto-subscribe a student to their matching job-category topic ("{Type}-all") the
// first time they set a job preference, so batched job notifications actually reach
// them without requiring them to find the manual subscribe UI first.
//
// "First time" check: call this ONLY from the onboarding segment modal's submit
// handler (see its one call site below). That modal is only ever shown when
// `!profile.looking_for` (see the auth-state-change handler), i.e. the student has
// never completed career intake before — so every save reachable from there is a
// first-time save, never a later edit. As a second, independent safeguard against
// duplicate subscribes (e.g. a user who already subscribed manually, or a modal
// shown twice), this also skips subscribing if the topic is already subscribed.
//
// The modal's submit button click is a real user gesture, so it's a legitimate
// moment to ask for browser notification permission here (same call the manual
// "Enable Notifications" button makes) rather than silently giving up when
// permission hasn't been granted yet, which is what happened before this. If the
// student denies it (or we're inside the Flutter WebView, where permission is the
// native app's job, not the browser's), this just skips subscribing — it never
// blocks or fails the job-preference save itself, which has already completed by
// the time this runs.
async function autoSubscribeToJobCategoryTopic(preference) {
    const jobType = String(preference || '').split('_')[0];
    const topic = getTypeWideTopicForJobType(jobType);
    if (!topic || getSubscribedTopics().includes(topic)) return;
    try {
        if (!window.flutter_app.isReady && Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            updatePermissionStatusUI();
            if (permission === 'granted') await initializeFCM();
        }
        await subscribeToTopic(topic);
    } catch (err) {
        console.warn('Auto-subscribe to job category topic failed:', err);
    }
}

// Fetch and cache user profile data from Supabase on login
async function fetchAndCacheProfileData() {
    if (!currentSession?.user?.id) return null;

    try {
        const hydrated = await window.MSCProfileState.hydrateProfileFromSupabase(supabaseClient, currentSession.user);
        const data = hydrated.data;

        if (data) {
            const profileObj = hydrated.profile || data.profile || {};
            console.log("DEBUG fetchAndCacheProfileData:", {
                ocr_cv_length: data.ocr_cv ? data.ocr_cv.length : null,
                profileObj_cv_cloud_synced: profileObj.cv_cloud_synced
            });
            if (data.ocr_cv) {
                localStorage.setItem('userCVText', data.ocr_cv);
                if (profileObj.cv_cloud_synced) {
                    console.log("DEBUG: Calling setCloudSyncFlag()");
                    setCloudSyncFlag();
                } else {
                    console.log("DEBUG: Calling clearCloudSyncFlag() because cv_cloud_synced is falsy");
                    clearCloudSyncFlag();
                }
            } else {
                console.log("DEBUG: Calling clearCloudSyncFlag() because ocr_cv is empty");
                clearCloudSyncFlag();
            }
            // Inject dedicated columns to local cached profile representation
            profileObj.looking_for = data.looking_for;
            profileObj.articleship_1yr_end_date = data.articleship_1yr_end_date;
            profileObj.ca_inter_attempt = data.ca_inter_attempt;
            profileObj.ca_final_attempt = data.ca_final_attempt;
            profileObj.years_of_experience = data.years_of_experience;

            window.MSCProfileState.cacheProfile(profileObj, currentSession.user.id);

            if (profileObj.job_preference) {
                localStorage.setItem(JOB_PREFERENCE_KEY, profileObj.job_preference);
            }

            if (profileObj.notification_subscriptions && Array.isArray(profileObj.notification_subscriptions)) {
                localStorage.setItem('subscribedTopics', JSON.stringify(profileObj.notification_subscriptions));
                updateNotificationBadge();
            }

            renderProfileCompletionBanner();
            return profileObj;
        }
    } catch (e) {
        console.log('Could not fetch profile data:', e);
    }
    return null;
}

// Load job preference from profile if not in localStorage
async function loadJobPreferenceFromProfile() {
    if (getJobPreference()) return getJobPreference();

    if (currentSession?.user?.id) {
        try {
            const cachedProfile = localStorage.getItem('userProfileData');
            if (cachedProfile) {
                const profile = JSON.parse(cachedProfile);
                if (profile.job_preference) {
                    localStorage.setItem(JOB_PREFERENCE_KEY, profile.job_preference);
                    return profile.job_preference;
                }
            }

            const profile = await fetchAndCacheProfileData();
            if (profile?.job_preference) {
                return profile.job_preference;
            }
        } catch (e) {
            console.log('Could not load preference from profile:', e);
        }
    }
    return null;
}

// Redirect to preferred portal if not already on it
function redirectToPreferredPortal(preference) {
    if (sessionStorage.getItem('explicitPortalNav') === 'true') {
        return false;
    }

    const currentPref = getCurrentPagePreference();
    const targetUrl = PREFERENCE_REDIRECT_MAP[preference];

    if (currentPref === preference) return false;

    // Skip auto-redirect when running inside Flutter WebView app
    if (window.flutter_app?.isReady) {
        return false;
    }

    const referrer = document.referrer;
    if (referrer) {
        try {
            const referrerUrl = new URL(referrer);
            const currentHost = window.location.hostname;
            if (referrerUrl.hostname === currentHost) {
                return false;
            }
        } catch (e) {
            // Invalid referrer URL, continue with redirect logic
        }
    }

    // Same Semi Qualified page, other experience level: set the listing's experience filter instead of reloading.
    if ((preference === 'semi_fresher' || preference === 'semi_experienced') &&
        (currentPref === 'semi_fresher' || currentPref === 'semi_experienced')) {
        portalApp?.setFilters({ experience: preference === 'semi_experienced' ? 'Experienced' : 'Freshers' });
        return false;
    }

    if (targetUrl) {
        window.location.href = targetUrl;
        return true;
    }
    return false;
}

function isCloudSynced() {
    return localStorage.getItem('cv_cloud_synced') === 'true' ||
        document.cookie.split(';').some(c => c.trim().startsWith('cv_cloud_synced=true'));
}

function setCloudSyncFlag() {
    localStorage.setItem('cv_cloud_synced', 'true');
    localStorage.setItem('cv_images_synced', 'true');
    document.cookie = "cv_cloud_synced=true; max-age=31536000; path=/";
}

function clearCloudSyncFlag() {
    localStorage.removeItem('cv_cloud_synced');
    localStorage.removeItem('cv_images_synced');
    document.cookie = "cv_cloud_synced=; Max-Age=0; path=/";
}

async function checkAndSyncCVBackground() {
    if (!currentSession) return false;

    // Check if we have cached CV data to sync
    const userCVImages = localStorage.getItem('userCVImages');
    let userCVText = localStorage.getItem('userCVText');

    console.log("DEBUG checkAndSyncCVBackground:", {
        userCVImages_exists: !!userCVImages,
        isCloudSynced: isCloudSynced()
    });

    // If we have local images but they haven't been successfully synced yet during this user's lifecycle,
    // we upload them regardless of general cloud synced status (since they could be missing in the bucket)
    if (userCVImages) {
        if (localStorage.getItem('cv_images_synced') === 'true') {
            return true; // Already synced this local file
        }
    } else {
        // No local images, fallback to checking general cloud sync
        if (isCloudSynced()) {
            console.log("DEBUG: checkAndSyncCVBackground returning true because isCloudSynced is true");
            return true;
        }
        console.log("DEBUG: checkAndSyncCVBackground returning false because isCloudSynced is false");
        return false; // Nothing to sync
    }

    try {
        console.log("Background Sync: Uploading cached CV to storer...");
        const images = JSON.parse(userCVImages);

        const payload = {
            user_id: currentSession.user.id,
            images: images,
            pdf_text: userCVText || ""
        };

        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            clearCloudSyncFlag();
            return false;
        }

        const data = await response.json();

        if (data.ok && data.response) {
            if (data.uploaded) {
                let finalOcrText = userCVText || "";
                if (data.ocr_text) {
                    finalOcrText = data.ocr_text;
                    localStorage.setItem('userCVText', finalOcrText);
                }

                // Get cached profile and update cv_cloud_synced
                const cachedProfile = localStorage.getItem('userProfileData');
                let profileObj = {};
                if (cachedProfile) {
                    try {
                        profileObj = JSON.parse(cachedProfile);
                    } catch (e) { }
                }
                profileObj.cv_cloud_synced = true;
                if (!profileObj.email && currentSession.user.email) profileObj.email = currentSession.user.email;
                localStorage.setItem('userProfileData', JSON.stringify(profileObj));

                // Update Supabase
                await supabaseClient.from('profiles').upsert({
                    uuid: currentSession.user.id,
                    profile: profileObj,
                    ocr_cv: finalOcrText,
                    updated_at: new Date().toISOString()
                });

                setCloudSyncFlag();
                console.log("Background Sync: Complete.");
                return true;
            } else {
                console.error("Background Sync: Worker returned uploaded=false", data.storage_error);
                clearCloudSyncFlag();
                return false;
            }
        } else {
            clearCloudSyncFlag();
            return false;
        }
    } catch (e) {
        console.error("Background Sync Failed:", e);
        clearCloudSyncFlag();
        return false;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    setTimeout(async () => {
        const preference = await loadJobPreferenceFromProfile();

        // Semi Qualified: start on the student's own experience level, unless the link already chose one.
        const linkChoseExperience = new URLSearchParams(window.location.search).has('exp');
        if (currentSession && preference && PORTAL.key === 'semi' && !linkChoseExperience) {
            if (preference === 'semi_experienced') portalApp?.setFilters({ experience: 'Experienced' });
            else if (preference === 'semi_fresher') portalApp?.setFilters({ experience: 'Freshers' });
        }

        initOnboardingSegmentForm();
    }, 500);
});

// ==========================================
// ONBOARDING QUESTIONNAIRE SEGMENT MODAL
// ==========================================

// Show Onboarding Segment Modal with premium transition
function showOnboardingSegmentModal() {
    const modal = document.getElementById('onboardingSegmentModal');
    if (modal) {
        modal.style.display = 'flex';
        // Trigger reflow for animation
        modal.offsetHeight;
        modal.classList.add('show-modal');
    }
}

// Hide Onboarding Segment Modal with premium transition
function hideOnboardingSegmentModal() {
    const modal = document.getElementById('onboardingSegmentModal');
    if (modal) {
        modal.classList.remove('show-modal');
        setTimeout(() => {
            modal.style.display = 'none';
        }, 400);
    }
}

// Initialize Onboarding Segment form and interactive elements
function initOnboardingSegmentForm() {
    const form = document.getElementById('onboardingSegmentForm');
    if (!form) return;

    const cards = document.querySelectorAll('.onboarding-option-card');
    const selectedInput = document.getElementById('selectedLookingFor');

    const fields = {
        'CA Industrial Training Default': { element: document.getElementById('field-industrial') },
        'CA Articleship': { element: document.getElementById('field-articleship') },
        'CA Fresher': { element: document.getElementById('field-fresher') },
        'Semi Qualified CA': { element: document.getElementById('field-semi') }
    };

    function setFieldActive(key, isActive) {
        const { element } = fields[key];
        if (!element) return;
        element.classList.toggle('active', isActive);
        element.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]), select').forEach(el => {
            el.disabled = !isActive;
        });
    }

    // Initialise state
    const defaultVal = selectedInput.value;
    Object.keys(fields).forEach(key => setFieldActive(key, key === defaultVal));

    // Card Selection Click Handlers
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const value = card.getAttribute('data-value');
            if (!value) return;
            cards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedInput.value = value;
            Object.keys(fields).forEach(key => setFieldActive(key, key === value));
        });
    });

    // Sync month+year selects → hidden attempt inputs
    function syncAttempt(monthId, yearId, clearedId, hiddenId, pickerRowId) {
        const monthEl = document.getElementById(monthId);
        const yearEl = document.getElementById(yearId);
        const clearedEl = document.getElementById(clearedId);
        const hiddenEl = document.getElementById(hiddenId);
        const rowEl = document.getElementById(pickerRowId);
        if (!monthEl || !yearEl || !clearedEl || !hiddenEl) return;

        function update() {
            const hasDate = monthEl.value && yearEl.value;
            if (clearedEl.checked) {
                rowEl.classList.add('cleared-active');
                const clearedLabel = clearedId === 'ca_inter_cleared' ? 'Cleared Both Groups' : 'Cleared';
                hiddenEl.value = hasDate ? `${monthEl.value} ${yearEl.value} (${clearedLabel})` : clearedLabel;
            } else {
                rowEl.classList.remove('cleared-active');
                hiddenEl.value = hasDate ? `${monthEl.value} ${yearEl.value}` : '';
            }
        }

        monthEl.addEventListener('change', update);
        yearEl.addEventListener('change', update);
        clearedEl.addEventListener('change', update);
    }

    syncAttempt('ca_final_attempt_month', 'ca_final_attempt_year', 'ca_final_cleared', 'ca_final_attempt', 'final-attempt-picker');

    // Date input validation helpers
    const dateInput = document.getElementById('articleship_1yr_end_date');

    function daysInMonth(month, year) {
        return new Date(year, month, 0).getDate();
    }

    function validateDateParts(d, m, y) {
        if (m < 1 || m > 12) return 'Month must be between 01 and 12.';
        if (d < 1 || d > daysInMonth(m, y)) return `Day must be between 01 and ${daysInMonth(m, y)} for that month.`;
        if (y < 2000 || y > 2100) return 'Year must be between 2000 and 2100.';
        return null;
    }

    if (dateInput) {
        dateInput.addEventListener('change', () => dateInput.setCustomValidity(''));
    }

    // Form submission sync to database
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!currentSession?.user?.id) {
            hideOnboardingSegmentModal();
            return;
        }

        const lookingFor = selectedInput.value;
        // type="date" value is YYYY-MM-DD or empty
        const articleshipDateRaw = document.getElementById('articleship_1yr_end_date').value;

        if (lookingFor === 'CA Industrial Training Default') {
            if (!articleshipDateRaw) {
                dateInput.setCustomValidity('Please select a date.');
                dateInput.reportValidity();
                dateInput.addEventListener('change', () => dateInput.setCustomValidity(''), { once: true });
                return;
            }
            const [yyyy, mm, dd] = articleshipDateRaw.split('-').map(Number);
            const dateErr = validateDateParts(dd, mm, yyyy);
            if (dateErr) {
                dateInput.setCustomValidity(dateErr);
                dateInput.reportValidity();
                dateInput.addEventListener('change', () => dateInput.setCustomValidity(''), { once: true });
                return;
            }
        }

        // Keep as YYYY-MM-DD for the database
        const articleshipDate = articleshipDateRaw || '';

        const earliestJoiningRaw = document.getElementById('articleship_earliest_joining')?.value || '';
        if (lookingFor === 'CA Articleship') {
            const joiningEl = document.getElementById('articleship_earliest_joining');
            if (!earliestJoiningRaw) {
                joiningEl.setCustomValidity('Please select your earliest joining date.');
                joiningEl.reportValidity();
                joiningEl.addEventListener('change', () => joiningEl.setCustomValidity(''), { once: true });
                return;
            }
            const [yyyy, mm, dd] = earliestJoiningRaw.split('-').map(Number);
            const joiningErr = validateDateParts(dd, mm, yyyy);
            if (joiningErr) {
                joiningEl.setCustomValidity(joiningErr);
                joiningEl.reportValidity();
                joiningEl.addEventListener('change', () => joiningEl.setCustomValidity(''), { once: true });
                return;
            }
        }

        const caFinalAttempt = document.getElementById('ca_final_attempt').value;
        const yearsOfExp = document.getElementById('years_of_experience').value;

        if (lookingFor === 'CA Fresher' && !caFinalAttempt) {
            const monthEl = document.getElementById('ca_final_attempt_month');
            monthEl.setCustomValidity('Please select both month and year, or tick Already Cleared.');
            monthEl.reportValidity();
            monthEl.addEventListener('change', () => monthEl.setCustomValidity(''), { once: true });
            return;
        }

        // Fetch current profile JSONB so we can merge without overwriting other fields
        const { data: existingRow } = await supabaseClient
            .from('profiles')
            .select('profile')
            .eq('uuid', currentSession.user.id)
            .maybeSingle();
        const mergedProfile = existingRow?.profile || {};
        if (lookingFor === 'CA Articleship') mergedProfile.articleship_earliest_joining_date = earliestJoiningRaw;
        if (lookingFor === 'CA Fresher') mergedProfile.fresher_years_of_experience = document.getElementById('fresher_years_of_experience').value;

        // Construct update object — only write the field for the chosen stage.
        // Do NOT null out other stages' fields; the user may switch stages later
        // and their previously saved data must be preserved.
        const updateData = {
            looking_for: lookingFor,
            profile: mergedProfile,
            updated_at: new Date().toISOString()
        };
        if (lookingFor === 'CA Industrial Training Default') updateData.articleship_1yr_end_date = articleshipDate || null;
        if (lookingFor === 'CA Fresher') updateData.ca_final_attempt = caFinalAttempt || null;
        if (lookingFor === 'Semi Qualified CA') updateData.years_of_experience = yearsOfExp || null;
        // ca_inter_attempt is managed by career-profile.js, never wiped here.

        const submitBtn = form.querySelector('.onboarding-submit-btn');
        const originalBtnText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>Saving preferences...</span><i class="fas fa-spinner fa-spin"></i>';

        try {
            const { error } = await supabaseClient
                .from('profiles')
                .update(updateData)
                .eq('uuid', currentSession.user.id);

            if (error) throw error;

            // Sync with local cached object in localStorage
            const cached = localStorage.getItem('userProfileData');
            let profileObj = {};
            if (cached) {
                try { profileObj = JSON.parse(cached); } catch (_) { }
            }

            // Merge properties locally
            Object.assign(profileObj, updateData);
            localStorage.setItem('userProfileData', JSON.stringify(profileObj));

            // Hide the modal beautifully
            hideOnboardingSegmentModal();

            // Notify user
            if (typeof showToast === 'function') {
                showToast("Personalization complete! Enjoy your personalized feed.", "success");
            }

            // Map and trigger portal redirect for seamless preference alignment
            let prefMapping = {
                'CA Industrial Training Default': 'industrial',
                'CA Articleship': 'articleship',
                'CA Fresher': 'fresher_fresher',
                'Semi Qualified CA': 'semi_fresher'
            };
            const mappedPref = prefMapping[lookingFor];
            if (mappedPref) {
                await saveJobPreference(mappedPref);
                autoSubscribeToJobCategoryTopic(mappedPref);
                setTimeout(() => {
                    redirectToPreferredPortal(mappedPref);
                }, 1000);
            }

        } catch (err) {
            console.error("Failed to submit onboarding answers:", err);
            if (typeof showToast === 'function') {
                showToast("Failed to save preferences. Please try again.", "error");
            } else {
                alert("Failed to save preferences. Please try again.");
            }
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    });
}

function calculateProfileCompletion() {
    if (!currentSession) return 0;
    return calculateSharedProfileCompletion(readCachedProfile(localStorage), localStorage);
}

function renderProfileCompletionBanner() {
    const existing = document.getElementById('profile-completion-banner');
    if (existing) {
        if (existing._observer) {
            existing._observer.disconnect();
        }
        existing.remove();
    }

    const percent = currentSession ? calculateProfileCompletion() : 0;

    const banner = document.createElement('div');
    banner.id = 'profile-completion-banner';
    banner.className = 'profile-completion-banner';
    banner.style.display = 'flex';

    const dismissedOnboarding = window.MSCProfileState?.wasOnboardingDismissed(currentSession?.user?.email);
    banner.classList.toggle('profile-onboarding-reminder', !!dismissedOnboarding);
    banner.innerHTML = `
        <div class="banner-text">
            <span>${percent === 100 ? '✅ Your profile is complete — you can use Easy Apply.' : `${dismissedOnboarding ? '🔎 Let recruiters find you — complete your Profile' : '🎯 Complete your Profile'}<span class="banner-desc"> to get 5x higher interview opportunities</span>.`}</span>
            <span class="completion-badge">Profile Completion: ${percent}%</span>
        </div>
        <a href="/profile.html" class="banner-btn">${percent === 100 ? 'View Profile' : 'Complete Profile'}</a>
    `;

    document.body.insertBefore(banner, document.body.firstChild);
    document.body.classList.add('with-completion-banner');

    if (window.ResizeObserver) {
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                const height = entry.target.offsetHeight;
                const isMobile = window.innerWidth < 1024;
                const basePadding = isMobile ? 60 : 70;
                document.body.style.paddingTop = (basePadding + height) + 'px';
                const header = document.querySelector('.site-header, .floating-header');
                if (header) {
                    if (isMobile) {
                        header.style.top = height + 'px';
                    } else {
                        header.style.top = '';
                    }
                }
            }
        });
        observer.observe(banner);
        banner._observer = observer;
    } else {
        setTimeout(() => {
            const bannerHeight = banner.offsetHeight;
            const isMobile = window.innerWidth < 1024;
            const basePadding = isMobile ? 60 : 70;
            document.body.style.paddingTop = (basePadding + bannerHeight) + 'px';
            const header = document.querySelector('.site-header, .floating-header');
            if (header) {
                header.style.top = isMobile ? (bannerHeight + 'px') : '';
            }
        }, 50);
    }
}

function dv2UpdateProfileWidgets() {
    const banner = document.getElementById('dv2PromoBanner');
    const headerBtn = document.getElementById('dv2CompleteProfileBtn');
    const ring = document.getElementById('dv2RingProgress');
    const ringPercent = document.getElementById('dv2RingPercent');
    const cta = document.getElementById('dv2PromoCta');
    if (!banner && !headerBtn) return;

    const percent = currentSession ? calculateProfileCompletion() : 0;

    // Viewport visibility is CSS's job (.dv2-visible only displays ≥1024px),
    // so resizing between mobile and desktop can never leak the button.
    if (headerBtn) {
        headerBtn.classList.toggle('dv2-visible', !!currentSession && percent < 100);
        const pctEl = document.getElementById('dv2ProfilePercent');
        if (pctEl) pctEl.textContent = percent + '%';
    }

    if (currentSession) {
        if (banner && percent === 100) banner.style.display = 'none';
    } else {
        if (cta) {
            cta.textContent = 'Sign Up Free';
            cta.href = '/sign-up.html';
        }
    }

    if (ring && ringPercent) {
        const circumference = 2 * Math.PI * 52; // r=52 in the SVG
        ring.style.strokeDashoffset = (circumference * (1 - percent / 100)).toFixed(1);
        ringPercent.textContent = percent + '%';
    }
}
