
// ai-helper.js - Encapsulates AI Apply logic and UI helpers

const AI_WORKER_URL = 'https://emailgenerator.bhansalimanan55.workers.dev/';

/**
 * Checks if the user has completed their profile (mainly uploaded a resume).
 * @returns {boolean} True if profile is considered complete.
 */
export function isProfileComplete() {
    try {
        const images = JSON.parse(localStorage.getItem('userCVImages') || '[]');
        // Check for both image array (PDF) or text content (TXT/PDF text)
        const text = localStorage.getItem('userCVText');
        return (Array.isArray(images) && images.length > 0) || (text && text.trim().length > 0);
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
 * @returns {Promise<string>} The generated email body.
 */
export async function generateEmailBody(job, tableName) {
    const profileData = JSON.parse(localStorage.getItem('userProfileData') || '{}');
    const cvImages = JSON.parse(localStorage.getItem('userCVImages') || '[]');
    const cvText = localStorage.getItem('userCVText') || '';

    try {
        const response = await fetch(AI_WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                images: cvImages,
                pdf_text: cvText, // Send text if images are missing (e.g. for TXT files)
                profile_data: profileData,
                job_details: getJobPayload(job, tableName)
            })
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

/**
 * Shows a modal redirecting the user to the profile page.
 */
export function showResumeRedirectModal() {
    // Check if we can use the existing #profileIncompleteModal in index.html
    const profileModal = document.getElementById('profileIncompleteModal');
    
    if (profileModal) {
        // Reuse existing modal
        profileModal.style.display = 'flex';
        
        // Ensure the "I'll do this later" button closes it
        const closeBtn = profileModal.querySelector('#closeProfileIncomplete');
        const modalCloseAction = profileModal.querySelector('.modal-close-action');
        
        if (closeBtn) {
            closeBtn.onclick = () => { profileModal.style.display = 'none'; };
        }
        if (modalCloseAction) {
            modalCloseAction.onclick = () => { profileModal.style.display = 'none'; };
        }
        
        // Close on overlay click
        profileModal.onclick = (e) => { 
            if (e.target === profileModal) profileModal.style.display = 'none'; 
        };
        return;
    }

    // If not found (e.g. on other pages), create one dynamically
    let modal = document.getElementById('ai-redirect-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'ai-redirect-modal';
        modal.className = 'modal-overlay-container';
        modal.style.zIndex = '10000'; // High z-index to sit on top of everything
        modal.innerHTML = `
            <div class="modal-dialog" style="max-width: 400px;">
                <button class="modal-close-action">×</button>
                 <div style="padding: 2rem; text-align: center;">
                    <i class="fas fa-file-pdf" style="font-size: 3rem; color: #ef4444; margin-bottom: 1rem;"></i>
                    <h3>Your profile is incomplete</h3>
                    <p style="margin: 1rem 0; color: #6b7280;">
                        Please upload your CV to PDF to use <strong>AI Powered Apply</strong>.
                    </p>
                    <a href="/profile.html?redirect=${encodeURIComponent(window.location.href)}" class="btn btn-primary" style="width: 100%;">
                        Go to Profile
                    </a>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        // Attach close handlers
        const closeBtn = modal.querySelector('.modal-close-action');
        closeBtn.onclick = () => { modal.style.display = 'none'; };
        modal.onclick = (e) => { if(e.target === modal) modal.style.display = 'none'; };
    }

    modal.style.display = 'flex';
}
