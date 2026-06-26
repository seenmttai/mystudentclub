const supabaseUrl = 'https://izsggdtdiacxdsjjncdq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);
pdfjsLib.GlobalWorkerOptions.workerSrc = '/scripts/vendor/pdf.worker.min.js';
const WORKER_URL = 'https://profile.mystudentclub.com';

// DOM refs
const profileForm = document.getElementById('profile-form');
const loadingOverlay = document.getElementById('loading-overlay');
const saveBtn = document.getElementById('saveBtn');
let currentUser = null;
let lastUpdatedISO = null;
let currentLookingFor = null;

// =================== TOAST NOTIFICATIONS ===================
function showToast(message, type = 'info', duration = 6000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const safeDuration = duration > 0 ? Math.max(duration, 3500) : 0;

    const icons = {
        success: '<i class="fas fa-check-circle"></i>',
        error: '<i class="fas fa-times-circle"></i>',
        warning: '<i class="fas fa-exclamation-triangle"></i>',
        info: '<i class="fas fa-info-circle"></i>'
    };

    const titles = {
        success: 'Success',
        error: 'Error',
        warning: 'Warning',
        info: 'Information'
    };

    const toast = document.createElement('div');
    toast.className = `p2-toast p2-toast-${type}`;
    toast.innerHTML = `
        <div class="p2-toast-icon">${icons[type] || icons.info}</div>
        <div class="p2-toast-content">
            <div class="p2-toast-title">${titles[type] || titles.info}</div>
            <div class="p2-toast-message">${message}</div>
        </div>
        <button class="p2-toast-close" aria-label="Close notification">
            <i class="fas fa-times"></i>
        </button>
        <div class="p2-toast-progress"></div>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => {
        toast.classList.add('is-visible');
    });

    const closeBtn = toast.querySelector('.p2-toast-close');
    const progressBar = toast.querySelector('.p2-toast-progress');
    let autoDismissTimer = null;
    let remainingTime = safeDuration;
    let timerStartedAt = null;
    let isClosing = false;

    const setProgressWidth = (value) => {
        if (!progressBar) return;
        progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
    };

    const startTimer = () => {
        if (remainingTime <= 0 || isClosing) return;
        if (autoDismissTimer) clearTimeout(autoDismissTimer);
        timerStartedAt = Date.now();
        if (progressBar) {
            progressBar.style.transition = 'none';
            setProgressWidth((remainingTime / safeDuration) * 100);
            requestAnimationFrame(() => {
                progressBar.style.transition = `width ${remainingTime}ms linear`;
                setProgressWidth(0);
            });
        }
        autoDismissTimer = setTimeout(() => {
            removeToast();
        }, remainingTime);
    };

    const pauseTimer = () => {
        if (!autoDismissTimer || isClosing) return;
        clearTimeout(autoDismissTimer);
        autoDismissTimer = null;
        if (timerStartedAt) {
            remainingTime -= Date.now() - timerStartedAt;
            remainingTime = Math.max(0, remainingTime);
        }
        if (progressBar) {
            const computedWidth = parseFloat(window.getComputedStyle(progressBar).width);
            const toastWidth = parseFloat(window.getComputedStyle(toast).width) || 1;
            progressBar.style.transition = 'none';
            setProgressWidth((computedWidth / toastWidth) * 100);
        }
    };

    const removeToast = () => {
        if (isClosing) return;
        isClosing = true;
        toast.classList.remove('is-visible');
        toast.classList.add('is-exiting');
        if (autoDismissTimer) {
            clearTimeout(autoDismissTimer);
            autoDismissTimer = null;
        }
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    };

    closeBtn.addEventListener('click', removeToast);

    toast.addEventListener('mouseenter', pauseTimer);
    toast.addEventListener('mouseleave', () => {
        if (safeDuration > 0) startTimer();
    });
    toast.addEventListener('focusin', pauseTimer);
    toast.addEventListener('focusout', () => {
        if (safeDuration > 0) startTimer();
    });

    if (safeDuration > 0) {
        startTimer();
    } else {
        setProgressWidth(0);
    }

    return toast;
}

const ENTRY_CLEAR_MAP = {
    'summary-entry-display': ['profile_summary', 'headline'],
    'cert-entry-display': ['cert_name', 'cert_issuer', 'cert_year', 'cert_url'],
    'edu-final-display': ['ca_final_course', 'ca_final_attempts_type', 'ca_final_attempts', 'ca_final_clear_month', 'ca_final_clear_year', 'ca_final_app_month', 'ca_final_app_year', 'ca_final_air'],
    'edu-inter-display': ['ca_inter_course', 'ca_inter_attempts_type', 'ca_inter_attempts', 'ca_inter_clear_month', 'ca_inter_clear_year', 'ca_inter_air'],
    'edu-found-display': ['ca_found_course', 'ca_found_attempts_type', 'ca_found_attempts', 'ca_found_clear_month', 'ca_found_clear_year'],
    'edu-grad-display': ['grad_degree', 'grad_university', 'grad_year', 'grad_percentage'],
    'edu-12-display': ['class12_board', 'class12_school', 'class12_year', 'class12_percentage'],
    'edu-10-display': ['class10_board', 'class10_school', 'class10_year', 'class10_percentage'],
    'edu-other-display': ['other_edu_level', 'other_edu_course', 'other_edu_institute', 'other_edu_year', 'other_edu_score'],
    'emp-org-display': ['is_current_employment', 'employment_type', 'emp_exp_years', 'emp_exp_months', 'emp_company_name', 'emp_job_title', 'emp_join_year', 'emp_join_month', 'emp_salary_currency', 'emp_current_salary', 'emp_salary_breakdown', 'emp_skills_hidden', 'emp_job_profile', 'emp_notice_period'],
    'emp-art-display': ['articleship_firm_type', 'articleship_firm_name', 'articleship_domain', 'articleship_domain_other'],
    'emp-it-display': ['industrial_training_company'],
    'project-entry-display': ['project_title', 'project_tag', 'project_client', 'project_status', 'project_worked_from_year', 'project_worked_from_month', 'project_details', 'project_attachment_name'],
    'key-skills-entry-display': ['key_skills']
};

const ENTRY_DEFAULT_VALUE_MAP = {
    is_current_employment: 'Yes',
    employment_type: 'Full-time',
    emp_salary_currency: 'INR',
    project_status: 'In progress'
};

// File configs
const fileConfig = {
    resume: {
        input: document.getElementById('resume'),
        dropZone: document.getElementById('resumeDropZone'),
        displayArea: document.getElementById('resume-display-area'),
        filenameEl: document.getElementById('resume-filename'),
        uploadArea: document.getElementById('resume-upload-area'),
        storageKeyText: 'userCVText',
        storageKeyName: 'userCVFileName',
        storageKeyImages: 'userCVImages'
    },
    cover_letter: {
        input: document.getElementById('cover_letter'),
        dropZone: document.getElementById('coverLetterDropZone'),
        displayArea: document.getElementById('cover-letter-display-area'),
        filenameEl: document.getElementById('cover-letter-filename'),
        uploadArea: document.getElementById('cover-letter-upload-area'),
        storageKeyText: 'userCoverLetterText',
        storageKeyName: 'userCoverLetterFileName'
    }
};

// =================== SKILLS LOGIC ===================
let skillsList = [];
let keySkillsList = [];

function renderSkills() {
    const skillsInput = document.getElementById('skills_input');
    const skillsContainer = document.getElementById('skills_container');
    const skillsHidden = document.getElementById('emp_skills_hidden');
    if (!skillsContainer) return;
    
    // clear old tags
    document.querySelectorAll('.p2-skill-tag').forEach(tag => tag.remove());

    skillsList.forEach((skill, index) => {
        const tag = document.createElement('span');
        tag.className = 'p2-skill-tag';
        tag.innerHTML = `${skill} <i class="fas fa-times" data-index="${index}"></i>`;
        skillsContainer.insertBefore(tag, skillsInput);
    });

    if (skillsHidden) skillsHidden.value = skillsList.join(', ');

    // Remove listener
    document.querySelectorAll('.p2-skill-tag i').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            skillsList.splice(idx, 1);
            renderSkills();
        });
    });
}

function renderKeySkills() {
    const keySkillsInput = document.getElementById('key_skills_input');
    const keySkillsContainer = document.getElementById('key_skills_container');
    const keySkillsHidden = document.getElementById('key_skills');
    if (!keySkillsContainer) return;

    // clear old tags
    document.querySelectorAll('.p2-key-skill-tag').forEach(tag => tag.remove());

    keySkillsList.forEach((skill, index) => {
        const tag = document.createElement('span');
        tag.className = 'p2-key-skill-tag';
        tag.innerHTML = `${skill} <i class="fas fa-times" data-key-index="${index}"></i>`;
        keySkillsContainer.insertBefore(tag, keySkillsInput);
    });

    if (keySkillsHidden) keySkillsHidden.value = keySkillsList.join(', ');

    // Remove listener
    document.querySelectorAll('.p2-key-skill-tag i').forEach(closeBtn => {
        closeBtn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.getAttribute('data-key-index'));
            keySkillsList.splice(idx, 1);
            renderKeySkills();
        });
    });
}

// =================== AUTH ===================
async function checkAuth() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
        window.location.href = '/login.html';
        return null;
    }
    currentUser = session.user;
    return session.user;
}

// =================== LOADING ===================
function showLoading(visible, text = 'Loading...') {
    if (visible) {
        loadingOverlay.querySelector('p').textContent = text;
        loadingOverlay.style.display = 'flex';
    } else {
        loadingOverlay.style.display = 'none';
    }
}

// =================== WIZARD CONSTANTS ===================
const WZ_QUESTION_CONFIGS = {
    preferred_locations: {
        id: 'preferred_locations', icon: '📍',
        question: 'Where are you looking for opportunities?',
        hint: 'Select all that apply — or type a city and press Enter',
        type: 'chips_custom',
        options: ['Mumbai', 'Delhi NCR', 'Bangalore', 'Hyderabad', 'Pune', 'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur', 'PAN India'],
        profileKey: 'preferred_locations', optional: true
    },
    relocation: {
        id: 'relocation', icon: '🔄',
        question: 'Are you open to relocating for the right opportunity?',
        hint: null, type: 'radio',
        options: [
            { label: 'Yes, open to relocation', value: 'Yes' },
            { label: 'No, prefer current city', value: 'No' },
            { label: 'PAN India — anywhere in India', value: 'PAN India' }
        ],
        profileKey: 'relocation_preference', optional: false
    },
    joining_date: {
        id: 'joining_date', icon: '📅',
        question: 'When can you start?',
        hint: 'Earliest date you can join',
        type: 'date', profileKey: 'earliest_joining_date', optional: true
    },
    expected_ctc: {
        id: 'expected_ctc', icon: '💰',
        question: 'What is your expected CTC?',
        hint: 'Annual package in INR',
        type: 'salary', profileKey: 'expected_salary', optional: true
    },
    expected_stipend: {
        id: 'expected_stipend', icon: '💰',
        question: 'What monthly stipend are you expecting?',
        hint: 'In ₹ — leave blank if not sure',
        type: 'salary', profileKey: 'expected_salary', optional: true
    },
    preferred_domains: {
        id: 'preferred_domains', icon: '🎯',
        question: 'Which domains are you interested in?',
        hint: 'Select all that apply',
        type: 'chips',
        options: ['FP&A', 'Business Finance', 'Treasury', 'Controllership', 'Financial Reporting', 'Internal Audit', 'Risk Management', 'Direct Tax', 'GST', 'Transfer Pricing', 'Valuation', 'Due Diligence', 'Investment Banking', 'Equity Research', 'Consulting', 'Data Analytics / Power BI', 'ESG & Sustainability', 'Other'],
        profileKey: 'preferred_domains', optional: true
    },
    preferred_domains_industrial: {
        id: 'preferred_domains', icon: '🎯',
        question: 'Which domains are you interested in?',
        hint: 'Select all that apply',
        type: 'chips',
        options: ['FP&A', 'Business Finance', 'Supply Chain Finance', 'Treasury', 'Controllership', 'Financial Reporting', 'Banking & Credit', 'Internal Audit', 'Forensics', 'Direct Tax', 'GST', 'Transfer Pricing', 'Valuation', 'Due Diligence', 'Investment Banking', 'Equity Research', 'Consulting', 'Strategy', 'Deal Advisory', 'Mergers & Acquisition', 'Costing', 'MIS Reporting', 'Other'],
        profileKey: 'preferred_domains', optional: true
    },
    preferred_firm_type: {
        id: 'preferred_firm_type', icon: '🏢',
        question: 'What type of CA firm are you looking for?',
        hint: 'Select all that apply',
        type: 'chips',
        options: ['Big 4', 'Big 6', 'Big 10', 'Mid Size', 'Small Size', 'Any'],
        profileKey: 'preferred_firm_type', optional: true
    },
    preferred_industries: {
        id: 'preferred_industries', icon: '🏭',
        question: 'Which industries would you like to work in?',
        hint: 'Select all that apply',
        type: 'chips',
        options: ['Banking', 'Financial Services', 'FMCG', 'Manufacturing', 'Pharma', 'IT', 'E-Commerce', 'Automobile', 'Infrastructure', 'Real Estate', 'Consulting', 'Retail', 'Energy', 'Telecom', 'Logistics', 'Others'],
        profileKey: 'preferred_industries', optional: true
    },
    preferred_industries_industrial: {
        id: 'preferred_industries', icon: '🏭',
        question: 'Which industries would you like to work in?',
        hint: 'Select all that apply',
        type: 'chips',
        options: ['Banking', 'Financial Services', 'Insurance', 'Consulting', 'FMCG', 'Manufacturing', 'IT / Technology', 'E-Commerce', 'Pharma & Healthcare', 'Automobile', 'Infrastructure', 'Energy & Power', 'Logistics & Supply Chain', 'Telecom', 'Real Estate', 'Retail', 'Media & Entertainment', 'Other'],
        profileKey: 'preferred_industries', optional: true
    },
    notice_period: {
        id: 'notice_period', icon: '📋',
        question: 'What is your current notice period?',
        hint: null, type: 'radio',
        options: [
            { label: 'Immediate Joiner', value: 'Immediate Joiner' },
            { label: '15 Days or less', value: '15 Days or less' },
            { label: '1 Month', value: '1 Month' },
            { label: '2 Months', value: '2 Months' },
            { label: '3 Months', value: '3 Months' }
        ],
        profileKey: 'notice_period', optional: true
    },
    employment_status: {
        id: 'employment_status', icon: '💼',
        question: 'What is your current employment status?',
        hint: null, type: 'radio',
        options: [
            { label: 'Currently Employed', value: 'Employed' },
            { label: 'Currently Unemployed / Actively looking', value: 'Unemployed' }
        ],
        profileKey: 'current_employment_status', optional: false
    }
};

const WZ_ROLE_QUESTIONS = {
    'industrial':          ['preferred_locations', 'joining_date', 'expected_stipend', 'preferred_domains_industrial', 'preferred_industries_industrial'],
    'articleship':         ['preferred_locations', 'relocation', 'joining_date', 'expected_stipend', 'preferred_domains', 'preferred_firm_type', 'preferred_industries'],
    'fresher_fresher':     ['preferred_locations', 'relocation', 'joining_date', 'expected_ctc', 'preferred_domains', 'preferred_industries'],
    'fresher_experienced': ['preferred_locations', 'relocation', 'joining_date', 'expected_ctc', 'preferred_domains', 'preferred_industries', 'notice_period'],
    'semi_fresher':        ['preferred_locations', 'relocation', 'joining_date', 'expected_ctc', 'preferred_domains', 'preferred_industries', 'employment_status', 'notice_period'],
    'semi_experienced':    ['preferred_locations', 'relocation', 'joining_date', 'expected_ctc', 'preferred_domains', 'preferred_industries', 'employment_status', 'notice_period'],
};

// Master list of fields to check after AI extraction — portal-specific
function getWzMissingFields(portalType) {
    const f = (id, label, icon, type, optional, placeholder, hint) => ({ id, label, icon, type, inputName: id, profileKey: id, required: !optional, optional: !!optional, placeholder: placeholder || '', hint: hint || '' });

    const common = [
        f('name',            'Full Name',        '👤', 'text'),
        f('contact_number',  'Contact Number',   '📱', 'tel'),
        f('current_city',    'Current City',     '📍', 'text', true),
        f('linkedin_url',    'LinkedIn Profile', '💼', 'url',  true),
        f('profile_summary', 'Profile Summary',  '📝', 'textarea', true),
        f('grad_degree',     'Graduation Degree','🎓', 'text', true),
    ];

    const caInterFields = [
        f('ca_inter_clear_year',          'CA Inter Cleared Year',              '📚', 'text',   true),
        f('ca_inter_score',               'CA Inter Score %',                   '📊', 'text',   true),
        f('ca_inter_attempts',            'CA Inter Attempts',                  '🔄', 'number', true, 'e.g. Write 1 if First Attempt'),
        f('articleship_firm_name',        'Articleship Firm',                   '🏢', 'text',   true),
        f('articleship_domain',           'Articleship Domain(s)',              '📂', 'text',   true),
        f('articleship_client_industries','Client Industries','🏭', 'text', true, 'e.g., Banking, FMCG, Manufacturing, IT, Pharma', "If you've worked with clients across multiple industries during your articleship, list them separated by commas (e.g., Banking, Manufacturing, FMCG). This helps recruiters understand your industry exposure."),
        f('additional_qualifications',    'Additional Qualifications (e.g., CFA, CPA)','🎓','text',true),
    ];

    const caFinalFields = [
        f('ca_final_clear_year',          'CA Final Cleared Year',              '🏆', 'text',   true),
        f('ca_final_score',               'CA Final Score %',                   '📊', 'text',   true),
        f('ca_final_attempts',            'CA Final Attempts',                  '🔄', 'number', true),
        f('ca_inter_clear_year',          'CA Inter Cleared Year',              '📚', 'text',   true),
        f('ca_inter_score',               'CA Inter Score %',                   '📊', 'text',   true),
        f('ca_inter_attempts',            'CA Inter Attempts',                  '🔄', 'number', true, 'e.g. Write 1 if First Attempt'),
        f('articleship_firm_name',        'Articleship Firm',                   '🏢', 'text',   true),
        f('articleship_domain',           'Articleship Domain(s)',              '📂', 'text',   true),
        f('articleship_client_industries','Client Industries','🏭', 'text', true, 'e.g., Banking, FMCG, Manufacturing, IT, Pharma', "If you've worked with clients across multiple industries during your articleship, list them separated by commas (e.g., Banking, Manufacturing, FMCG). This helps recruiters understand your industry exposure."),
        f('additional_qualifications',    'Additional Qualifications (e.g., CFA, CPA)','🎓','text',true),
    ];

    const empFields = [
        f('emp_company_name',  'Current Company',   '🏢', 'text', true),
        f('emp_job_title',     'Current Job Title', '💼', 'text', true),
        f('emp_current_salary','Current CTC',       '💰', 'text', true),
    ];

    if (portalType === 'industrial' || portalType === 'articleship') return [...common, ...caInterFields];
    if (portalType === 'semi_fresher')    return [...common, ...caInterFields];
    if (portalType === 'semi_experienced')return [...common, ...caInterFields, ...empFields];
    if (portalType === 'fresher_experienced') return [...common, ...caFinalFields, ...empFields];
    return [...common, ...caFinalFields]; // fresher_fresher
}


// =================== PORTAL SECTIONS ===================
function applyPortalSections(type) {
    if (!type) return;
    document.querySelectorAll('[data-portal]').forEach(el => {
        const portals = el.dataset.portal.split(',').map(s => s.trim());
        el.style.display = portals.includes(type) ? '' : 'none';
    });
}

// =================== CHIP MULTI-SELECT HELPERS ===================
function initChipMultiSelect(containerSelector, hiddenId) {
    const container = document.getElementById(containerSelector);
    const hidden = document.getElementById(hiddenId);
    if (!container || !hidden) return;
    container.addEventListener('click', e => {
        const chip = e.target.closest('.p2-chip');
        if (!chip) return;
        const chk = chip.querySelector('input[type="checkbox"]');
        if (!chk) return;
        chk.checked = !chk.checked;
        chip.classList.toggle('selected', chk.checked);
        hidden.value = Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(c => c.value).join(', ');
    });
}

function restoreChipMultiSelect(containerSelector, hiddenId) {
    const container = document.getElementById(containerSelector);
    const hidden = document.getElementById(hiddenId);
    if (!container || !hidden || !hidden.value) return;
    const vals = hidden.value.split(',').map(s => s.trim());
    container.querySelectorAll('input[type="checkbox"]').forEach(chk => {
        if (vals.includes(chk.value)) { chk.checked = true; chk.closest('.p2-chip').classList.add('selected'); }
    });
}

// =================== WIZARD CONTROLLER ===================
const WZ = (() => {
    const st = {
        phase: 'cv',
        programType: null,
        profileData: {},
        answers: {},
        prefQueue: [],
        prefIdx: 0,
        missingQueue: [],
        missingIdx: 0,
        reviewItems: [],
        history: [],
        currentSlot: 'a',
        aiStatus: 'idle',
        aiData: null,
        storerDone: false,
    };

    // DOM refs
    const dom = {};

    // ------ Init ------
    function init(profileData, lookingFor) {
        st.profileData = profileData || {};
        const isNewUser = !profileData || !profileData.name;
        const hasType = !!lookingFor;
        if (!isNewUser && hasType) {
            showMain();
            return;
        }
        dom.wizard   = document.getElementById('profile-wizard');
        dom.body     = document.getElementById('wz-body');
        dom.screenA  = document.getElementById('wz-screen-a');
        dom.screenB  = document.getElementById('wz-screen-b');
        dom.fill     = document.getElementById('wz-progress-fill');
        dom.pill     = document.getElementById('wz-step-pill');
        dom.backBtn  = document.getElementById('wz-back-btn');
        dom.nextBtn  = document.getElementById('wz-next-btn');
        dom.skipBtn  = document.getElementById('wz-skip-btn');

        if (lookingFor) {
            st.programType = resolveSubtype(mapLookingForToType(lookingFor), profileData);
        }

        dom.wizard.style.display = 'flex';

        dom.nextBtn.addEventListener('click', () => handleNext());
        dom.backBtn.addEventListener('click', () => handleBack());
        dom.skipBtn.addEventListener('click', () => handleSkip());

        goTo('cv', 'forward');
    }

    function showMain() {
        const m = document.getElementById('profile-main');
        if (m) m.style.display = '';
        const wz = document.getElementById('profile-wizard');
        if (wz) wz.style.display = 'none';
        applyPortalSections(st.programType);
    }

    // Resolve fresher/semi subtype from YOE in profileData; null means "ask wizard"
    function resolveSubtype(type, profileData) {
        if (type !== 'fresher_fresher' && type !== 'semi_fresher') return type;
        const yoeRaw = profileData ? (profileData.emp_exp_years != null ? profileData.emp_exp_years : profileData.yoe_years) : null;
        const yoe = parseInt(yoeRaw || '', 10);
        if (isNaN(yoe) || yoeRaw == null) return null; // unknown — ask in wizard
        if (yoe >= 1) return type === 'fresher_fresher' ? 'fresher_experienced' : 'semi_experienced';
        return type; // 0 years = fresher/semi_fresher confirmed
    }

    function mapLookingForToType(lf) {
        const map = {
            'CA Industrial Training Default': 'industrial',
            'CA Articleship': 'articleship',
            'CA Freshers': 'fresher_fresher',
            'CA Fresher (Fresher)': 'fresher_fresher',
            'CA Fresher (Experienced)': 'fresher_experienced',
            'Semi Qualified CA': 'semi_fresher',
        };
        return map[lf] || null;
    }

    function typeToLookingFor(type) {
        const map = {
            'industrial': 'CA Industrial Training Default',
            'articleship': 'CA Articleship',
            'fresher_fresher': 'CA Freshers',
            'fresher_experienced': 'CA Fresher (Experienced)',
            'semi_fresher': 'Semi Qualified CA',
            'semi_experienced': 'Semi Qualified CA',
        };
        return map[type] || 'CA Freshers';
    }

    // ------ Progress ------
    function updateProgress() {
        const phases = ['cv', 'type', 'subtype', 'prefs', 'missing', 'review', 'preview', 'publish'];
        const idx = phases.indexOf(st.phase);
        const total = phases.length;
        const pct = Math.round(((idx + 1) / total) * 100);
        if (dom.fill) dom.fill.style.width = pct + '%';

        let label = 'Step ' + (idx + 1);
        if (st.phase === 'prefs' && st.prefQueue.length) {
            label = `Preferences ${st.prefIdx + 1}/${st.prefQueue.length}`;
        } else if (st.phase === 'missing' && st.missingQueue.length) {
            label = `Details ${st.missingIdx + 1}/${st.missingQueue.length}`;
        }
        if (dom.pill) dom.pill.textContent = label;
    }

    // ------ Screen transitions ------
    function goTo(phase, direction) {
        st.phase = phase;
        updateProgress();

        const html = buildScreen(phase);
        const currentSlot = st.currentSlot;
        const nextSlot = currentSlot === 'a' ? 'b' : 'a';
        const currentEl = document.getElementById('wz-screen-' + currentSlot);
        const nextEl    = document.getElementById('wz-screen-' + nextSlot);

        nextEl.innerHTML = html;
        nextEl.className = 'wz-screen wz-screen-' + nextSlot + ' wz-enter-' + (direction === 'forward' ? 'fwd' : 'back');

        // force reflow
        void nextEl.offsetHeight;

        requestAnimationFrame(() => {
            currentEl.classList.remove('wz-active');
            currentEl.classList.add(direction === 'forward' ? 'wz-exit-fwd' : 'wz-exit-back');

            nextEl.classList.remove('wz-enter-fwd', 'wz-enter-back');
            nextEl.classList.add('wz-active');
            st.currentSlot = nextSlot;

            setTimeout(() => mountScreen(phase), 420);
        });

        // Back button visibility
        dom.backBtn.style.visibility = (st.history.length > 0 || phase !== 'cv') ? 'visible' : 'hidden';
        dom.skipBtn.style.display = 'none';
        dom.nextBtn.style.display = '';
        dom.nextBtn.textContent = (phase === 'publish') ? 'View Full Profile →' : 'Continue →';
    }

    // ------ Screen HTML builders ------
    function buildScreen(phase) {
        switch (phase) {
            case 'cv':       return buildCV();
            case 'type':     return buildType();
            case 'subtype':  return buildSubtype();
            case 'prefs':    return buildQuestion(WZ_QUESTION_CONFIGS[st.prefQueue[st.prefIdx]]);
            case 'missing':  return buildMissing(st.missingQueue[st.missingIdx]);
            case 'review':   return buildReview();
            case 'preview':  return buildPreview();
            case 'publish':  return buildPublish();
            default: return '';
        }
    }

    function buildCV() {
        const cachedName = localStorage.getItem('userCVFileName') || '';
        const hasFile = !!cachedName;
        return `<div class="wz-inner">
            <div class="wz-q-icon">🚀</div>
            <h2 class="wz-q-title">Create your MSC Profile in under 2 minutes</h2>
            <p class="wz-q-hint">Upload your resume to auto-fill details. AI will extract your information while you answer a few quick questions.</p>
            ${hasFile ? `
            <div class="wz-cv-file-tag" id="wz-cv-tag">
                <i class="fas fa-file-pdf"></i>
                <span id="wz-cv-fname">${escHtml(cachedName)}</span>
                <button type="button" class="wz-cv-file-remove" id="wz-cv-remove"><i class="fas fa-times"></i></button>
            </div>` : `
            <div class="wz-cv-upload-zone" id="wz-cv-zone">
                <input type="file" id="wz-cv-input" accept=".pdf">
                <div class="wz-cv-icon"><i class="fas fa-cloud-upload-alt"></i></div>
                <p class="wz-cv-label">Click to upload resume</p>
                <p class="wz-cv-sub">PDF only — Max 5 MB</p>
            </div>
            <div class="wz-cv-or">or</div>
            <button type="button" class="wz-cv-skip" id="wz-cv-skip-upload">Continue Without Resume</button>`}
            <div class="wz-consent-card">
                <label class="wz-consent-label" for="wz-consent-chk">
                    <input type="checkbox" id="wz-consent-chk" ${document.getElementById('cvSharingConsent')?.checked ? 'checked' : ''}>
                    <span>I consent to My Student Club sharing my CV and profile details with registered companies and recruiters for job-matching purposes.</span>
                </label>
                <div class="wz-consent-footer">
                    <a href="/privacy-policy.html" target="_blank" rel="noopener noreferrer" class="wz-consent-link"><i class="fas fa-external-link-alt"></i> Privacy Policy</a>
                    <span class="wz-consent-status" id="wz-consent-status"></span>
                </div>
            </div>
        </div>`;
    }

    function buildType() {
        return `<div class="wz-inner">
            <div class="wz-q-icon">🎓</div>
            <h2 class="wz-q-title">Choose Your Career Path</h2>
            <div class="wz-type-grid" id="wz-type-grid">
                <div class="wz-type-card" data-type="industrial">
                    <div class="wz-type-icon">🏭</div>
                    <div class="wz-type-label">CA Industrial Training</div>
                </div>
                <div class="wz-type-card" data-type="articleship">
                    <div class="wz-type-icon">📜</div>
                    <div class="wz-type-label">Articleship</div>
                </div>
                <div class="wz-type-card" data-type="fresher">
                    <div class="wz-type-icon">🎓</div>
                    <div class="wz-type-label">CA Jobs</div>
                </div>
                <div class="wz-type-card" data-type="semi">
                    <div class="wz-type-icon">📊</div>
                    <div class="wz-type-label">Semi Qualified CA Opportunities</div>
                </div>
            </div>
        </div>`;
    }

    function buildSubtype() {
        return `<div class="wz-inner">
            <div class="wz-q-icon">💼</div>
            <h2 class="wz-q-title">Are you a fresher or experienced?</h2>
            <p class="wz-q-hint">As a qualified CA, let us know your experience level.</p>
            <div class="wz-radio-grid" id="wz-subtype-grid">
                <div class="wz-radio-card" data-sub="fresher_fresher">
                    <div class="wz-radio-dot"></div>
                    <div>
                        <div class="wz-radio-label">Fresher (0–2 years)</div>
                        <div class="wz-radio-sub">No significant post-qualification experience</div>
                    </div>
                </div>
                <div class="wz-radio-card" data-sub="fresher_experienced">
                    <div class="wz-radio-dot"></div>
                    <div>
                        <div class="wz-radio-label">Experienced (2+ years)</div>
                        <div class="wz-radio-sub">Post-qualification work experience</div>
                    </div>
                </div>
            </div>
        </div>`;
    }

    function buildQuestion(cfg) {
        if (!cfg) return '<div class="wz-inner"><p>Loading...</p></div>';
        let inputHtml = '';
        const saved = st.answers[cfg.id];
        if (cfg.type === 'radio') {
            inputHtml = `<div class="wz-radio-grid" id="wz-q-radio">` +
                cfg.options.map(opt => {
                    const val = typeof opt === 'object' ? opt.value : opt;
                    const lbl = typeof opt === 'object' ? opt.label : opt;
                    const sel = saved === val ? ' wz-selected' : '';
                    return `<div class="wz-radio-card${sel}" data-val="${escHtml(val)}">
                        <div class="wz-radio-dot"></div>
                        <div><div class="wz-radio-label">${escHtml(lbl)}</div></div>
                    </div>`;
                }).join('') + `</div>`;
        } else if (cfg.type === 'chips' || cfg.type === 'chips_custom') {
            const savedArr = Array.isArray(saved) ? saved : [];
            inputHtml = `<div class="wz-chip-grid" id="wz-q-chips">` +
                cfg.options.map(o => {
                    const sel = savedArr.includes(o) ? ' wz-selected' : '';
                    return `<span class="wz-chip${sel}" data-val="${escHtml(o)}">${escHtml(o)}</span>`;
                }).join('') + `</div>`;
            if (cfg.type === 'chips_custom') {
                inputHtml += `<div class="wz-input-wrap" style="margin-top:12px;">
                    <input class="wz-input" id="wz-custom-chip-input" placeholder="Type a city and press Enter…">
                </div>`;
            }
        } else if (cfg.type === 'date') {
            inputHtml = `<div class="wz-input-wrap"><input class="wz-input" type="date" id="wz-q-date" value="${escHtml(saved || '')}"></div>`;
        } else if (cfg.type === 'salary') {
            inputHtml = `<div class="wz-input-wrap">
                <input class="wz-input" type="text" id="wz-q-salary" placeholder="e.g., 6,00,000" value="${escHtml(saved || '')}">
                <span class="wz-not-sure-link" id="wz-not-sure">Not sure / Skip</span>
            </div>`;
        }
        const skipBtn = (cfg.optional && cfg.type !== 'salary') ? `<span class="wz-not-sure-link" style="display:inline-block;margin-top:14px;" id="wz-q-skip">Skip this question</span>` : '';
        return `<div class="wz-inner">
            <div class="wz-q-icon">${cfg.icon}</div>
            <h2 class="wz-q-title">${escHtml(cfg.question)}</h2>
            ${cfg.hint ? `<p class="wz-q-hint">${escHtml(cfg.hint)}</p>` : '<p></p>'}
            ${inputHtml}
            ${skipBtn}
        </div>`;
    }

    function buildMissing(field) {
        if (!field) return '<div class="wz-inner"><p>Almost done...</p></div>';
        // Priority: wizard answer → DB/form value → AI prefill (user reviews before confirming)
        const userAnswered = st.answers['missing_' + field.id] || getFormValue(field.inputName);
        const aiPrefill = userAnswered ? '' : String(getAiVal(field) || '');
        const saved = userAnswered || aiPrefill;
        let inputHtml = '';
        if (field.type === 'textarea') {
            inputHtml = `<textarea class="wz-textarea" id="wz-missing-input" rows="4" placeholder="Write a brief professional summary...">${escHtml(saved)}</textarea>`;
        } else {
            const ph = field.placeholder || (field.type === 'url' ? 'https://linkedin.com/in/yourprofile' : '');
            inputHtml = `<input class="wz-input" type="${field.type}" id="wz-missing-input" placeholder="${escHtml(ph)}" value="${escHtml(saved)}">`;
        }
        const aiTag = st.aiStatus === 'loading'
            ? `<div class="wz-ai-banner"><div class="wz-ai-dot"></div>Resume is being auto-filled in the background…</div>`
            : (aiPrefill ? `<div class="wz-ai-banner" style="background:rgba(99,102,241,0.08);border-color:rgba(99,102,241,0.25);"><span style="font-size:0.85em;">✨ Auto-filled from your CV — edit if needed</span></div>` : '');
        const skipHtml = field.optional ? `<span class="wz-not-sure-link" style="display:inline-block;margin-top:14px;" id="wz-q-skip">Skip</span>` : '';
        return `<div class="wz-inner">
            ${aiTag}
            <div class="wz-q-icon">${field.icon}</div>
            <h2 class="wz-q-title">${escHtml(field.label)}</h2>
            ${field.hint ? `<p class="wz-q-hint">${escHtml(field.hint)}</p>` : ''}
            <div class="wz-input-wrap" style="margin-top:0.5rem;">${inputHtml}</div>
            ${skipHtml}
        </div>`;
    }

    function buildReview() {
        const groups = buildReviewGroups();
        const hasAny = groups.some(g => g.fields.some(f => f.value));
        if (!hasAny) return `<div class="wz-inner"><h2 class="wz-q-title">Almost there!</h2><p class="wz-q-hint">Click Continue to preview your profile.</p></div>`;
        return `<div class="wz-inner" style="max-width:620px;">
            <div class="wz-q-icon">✅</div>
            <h2 class="wz-q-title">Review auto-filled details</h2>
            <p class="wz-q-hint">Your resume was processed. Verify and edit anything that looks wrong.</p>
            ${groups.filter(g => g.fields.some(f => f.value)).map(g => `
            <div style="margin-bottom:1.25rem;">
                <div style="font-size:0.78rem;font-weight:700;color:#999;letter-spacing:0.06em;text-transform:uppercase;margin-bottom:8px;">${escHtml(g.label)}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
                    ${g.fields.filter(f => f.value).map(f => `
                    <div class="${f.wide ? 'wz-review-field wz-review-field-wide' : 'wz-review-field'}" style="${f.wide ? 'grid-column:1/-1;' : ''}">
                        <label class="wz-review-field-label">${escHtml(f.label)}</label>
                        ${f.textarea
                            ? `<textarea class="wz-input wz-textarea" name="rv_${escHtml(f.key)}" rows="3">${escHtml(f.value)}</textarea>`
                            : `<input class="wz-input" name="rv_${escHtml(f.key)}" type="text" value="${escHtml(f.value)}">`
                        }
                    </div>`).join('')}
                </div>
            </div>`).join('')}
        </div>`;
    }

    function buildPreview() {
        const nameVal = getFormValue('name') || st.answers['missing_name'] || 'Your Name';
        const emailVal = currentUser?.email || '';
        const phone = getFormValue('contact_number') || st.answers['missing_contact_number'] || '—';
        const city = getFormValue('current_city') || st.answers['missing_current_city'] || '—';
        const summary = getFormValue('profile_summary') || st.answers['missing_profile_summary'] || '';
        const prefLoc = formatArrayAnswer(st.answers['preferred_locations']) || '—';
        const domain = formatArrayAnswer(st.answers['preferred_domains']) || '—';
        const industry = formatArrayAnswer(st.answers['preferred_industries']) || '—';
        return `<div class="wz-inner" style="max-width:640px;">
            <h2 class="wz-q-title">Review Your Profile</h2>
            <p class="wz-q-hint">Here's a summary of what we've collected. You can edit everything after publishing.</p>
            <div style="background:#F5F6FA;border-radius:12px;padding:1.25rem;margin-bottom:1rem;">
                <div style="font-size:1.2rem;font-weight:700;margin-bottom:4px;">${escHtml(nameVal)}</div>
                <div style="font-size:0.85rem;color:#555;margin-bottom:10px;">${escHtml(emailVal)} · ${escHtml(phone)} · ${escHtml(city)}</div>
                ${summary ? `<div style="font-size:0.9rem;color:#333;line-height:1.55;border-top:1px solid #E8E8E8;padding-top:10px;">${escHtml(summary)}</div>` : ''}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                ${previewItem('Preferred Locations', prefLoc)}
                ${previewItem('Domains', domain)}
                ${previewItem('Industries', industry)}
                ${previewItem('Relocation', st.answers['relocation'] || '—')}
                ${previewItem('Expected Salary / Stipend', st.answers['expected_ctc'] || st.answers['expected_stipend'] || getFormValue('expected_salary') || '—')}
                ${previewItem('Joining Date', st.answers['joining_date'] || getFormValue('earliest_joining_date') || '—')}
            </div>
        </div>`;
    }

    function previewItem(label, value) {
        return `<div style="background:#fff;border:1px solid #E8E8E8;border-radius:8px;padding:10px 12px;">
            <div style="font-size:0.75rem;color:#999;margin-bottom:2px;">${escHtml(label)}</div>
            <div style="font-size:0.88rem;font-weight:500;color:#1A1A1A;">${escHtml(String(value))}</div>
        </div>`;
    }

    function buildPublish() {
        const name = getFormValue('name') || st.answers['missing_name'] || 'Your';
        const pct = calcCompleteness();
        const missing = buildCompletenessTips(pct);
        dom.nextBtn.style.display = 'none';
        dom.backBtn.style.visibility = 'hidden';
        return `<div class="wz-inner wz-publish-screen">
            <div class="wz-publish-icon">🎉</div>
            <h2 class="wz-publish-title">Profile Created!</h2>
            <p class="wz-publish-sub">Your profile is now visible to recruiters, ${escHtml(name.split(' ')[0])}.</p>
            <div style="max-width:360px;margin:0 auto 1rem;">
                <div style="display:flex;justify-content:space-between;font-size:0.85rem;font-weight:600;color:#1A1A1A;margin-bottom:4px;"><span>Profile Completeness</span><span>${pct}%</span></div>
                <div class="wz-completeness-bar-wrap"><div class="wz-completeness-bar" id="wz-comp-bar" style="width:0%"></div></div>
            </div>
            ${missing}
            <div class="wz-publish-actions">
                <button type="button" class="wz-btn-secondary" id="wz-complete-later">Complete Later</button>
                <button type="button" class="wz-btn-primary" id="wz-improve-profile">View Full Profile →</button>
            </div>
        </div>`;
    }

    function buildCompletenessTips(pct) {
        if (pct >= 90) return '';
        const tips = [];
        if (!getFormValue('profile_summary') && !st.answers['missing_profile_summary']) tips.push('+8% Add Profile Summary');
        if (!getFormValue('linkedin_url') && !st.answers['missing_linkedin_url'])       tips.push('+5% Add LinkedIn Profile');
        if (!getFormValue('key_skills') && !getFormValue('emp_skills_hidden'))          tips.push('+5% Add Key Skills');
        if (!getFormValue('articleship_client_industries'))                             tips.push('+6% Add Client Industry Exposure');
        if (!getFormValue('cert_name'))                                                 tips.push('+3% Add a Certification');
        if (!getFormValue('preferred_domains') && !st.answers['preferred_domains'])    tips.push('+6% Add Preferred Domains');
        if (!tips.length) return '';
        return `<div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:12px 14px;max-width:360px;margin:0 auto 1rem;text-align:left;">
            <div style="font-size:0.82rem;color:#F97316;font-weight:600;margin-bottom:6px;">Complete to improve visibility:</div>
            ${tips.slice(0, 3).map(t => `<div style="font-size:0.82rem;color:#555;padding:2px 0;">${escHtml(t)}</div>`).join('')}
        </div>`;
    }

    // ------ Mount (bind events after render) ------
    function mountScreen(phase) {
        const activeEl = document.getElementById('wz-screen-' + st.currentSlot);
        switch (phase) {
            case 'cv':       mountCV(activeEl); break;
            case 'type':     mountType(activeEl); break;
            case 'subtype':  mountSubtype(activeEl); break;
            case 'prefs':    mountQuestion(activeEl); break;
            case 'missing':  mountMissing(activeEl); break;
            case 'review':   mountReview(); break;
            case 'preview':  break;
            case 'publish':  mountPublish(); break;
        }
    }

    function mountCV(el) {
        const zone = el.querySelector('#wz-cv-zone');
        const inp = el.querySelector('#wz-cv-input');
        const removeBtn = el.querySelector('#wz-cv-remove');
        const skipUpload = el.querySelector('#wz-cv-skip-upload');

        if (inp) {
            inp.addEventListener('change', e => {
                const f = e.target.files[0];
                if (f) handleWzFileSelect(f);
            });
        }
        if (zone) {
            ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('hover'); }));
            ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('hover'); }));
            zone.addEventListener('drop', e => {
                const f = e.dataTransfer.files[0];
                if (f) handleWzFileSelect(f);
            });
        }
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                localStorage.removeItem('userCVFileName');
                localStorage.removeItem('userCVText');
                localStorage.removeItem('userCVImages');
                localStorage.removeItem('userCVPdf');
                clearCloudSyncFlag();
                goTo('cv', 'forward');
            });
        }
        if (skipUpload) {
            skipUpload.addEventListener('click', () => {
                saveConsentFromWizard();
                proceedAfterCV();
            });
        }
    }

    function mountType(el) {
        el.querySelectorAll('.wz-type-card').forEach(card => {
            card.addEventListener('click', () => {
                el.querySelectorAll('.wz-type-card').forEach(c => c.classList.remove('wz-selected'));
                card.classList.add('wz-selected');
                st._pendingType = card.getAttribute('data-type');
            });
        });
    }

    function mountSubtype(el) {
        el.querySelectorAll('.wz-radio-card').forEach(card => {
            card.addEventListener('click', () => {
                el.querySelectorAll('.wz-radio-card').forEach(c => c.classList.remove('wz-selected'));
                card.classList.add('wz-selected');
                st._pendingSubtype = card.getAttribute('data-sub');
            });
        });
    }

    function mountQuestion(el) {
        const cfg = WZ_QUESTION_CONFIGS[st.prefQueue[st.prefIdx]];
        if (!cfg) return;

        if (cfg.type === 'radio') {
            el.querySelectorAll('.wz-radio-card').forEach(card => {
                card.addEventListener('click', () => {
                    el.querySelectorAll('.wz-radio-card').forEach(c => c.classList.remove('wz-selected'));
                    card.classList.add('wz-selected');
                });
            });
        } else if (cfg.type === 'chips' || cfg.type === 'chips_custom') {
            el.querySelectorAll('.wz-chip').forEach(chip => {
                chip.addEventListener('click', () => chip.classList.toggle('wz-selected'));
            });
            if (cfg.type === 'chips_custom') {
                const customInp = el.querySelector('#wz-custom-chip-input');
                if (customInp) {
                    customInp.addEventListener('keydown', e => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = customInp.value.trim();
                            if (!val) return;
                            const grid = el.querySelector('#wz-q-chips');
                            if (grid) {
                                const chip = document.createElement('span');
                                chip.className = 'wz-chip wz-selected';
                                chip.dataset.val = val;
                                chip.textContent = val;
                                chip.addEventListener('click', () => chip.classList.toggle('wz-selected'));
                                grid.appendChild(chip);
                            }
                            customInp.value = '';
                        }
                    });
                }
            }
        }

        const skipLink = el.querySelector('#wz-q-skip');
        if (skipLink) skipLink.addEventListener('click', () => advancePref(null));

        const notSure = el.querySelector('#wz-not-sure');
        if (notSure) notSure.addEventListener('click', () => advancePref(null));
    }

    function mountMissing(el) {
        const skipLink = el.querySelector('#wz-q-skip');
        if (skipLink) skipLink.addEventListener('click', () => advanceMissing(null));
    }

    function mountPublish() {
        setTimeout(() => {
            const bar = document.getElementById('wz-comp-bar');
            if (bar) bar.style.width = calcCompleteness() + '%';
        }, 100);

        const later = document.getElementById('wz-complete-later');
        const improve = document.getElementById('wz-improve-profile');
        const finish = () => { finishWizard(); };
        if (later) later.addEventListener('click', finish);
        if (improve) improve.addEventListener('click', finish);
    }

    // ------ Navigation logic ------
    function handleNext() {
        const phase = st.phase;
        if (phase === 'cv') {
            const consentGiven = document.getElementById('wz-consent-chk')?.checked
                || document.getElementById('cvSharingConsent')?.checked;
            if (!consentGiven) {
                showToast('Please accept the data sharing consent to continue.', 'warning', 5000);
                return;
            }
            saveConsentFromWizard();
            saveConsentRecord(true).catch(console.error); // fire independently — don't wait on storer
            fireStorerAndProfill();
            proceedAfterCV();
        } else if (phase === 'type') {
            if (!st._pendingType) { showToast('Please select what you are looking for.', 'warning'); return; }
            const t = st._pendingType;
            if (t === 'fresher') {
                st.history.push({ phase: 'type' });
                goTo('subtype', 'forward');
            } else {
                st.programType = t === 'semi' ? 'semi_fresher' : t;
                buildPrefQueue();
                st.history.push({ phase: 'type' });
                goTo('prefs', 'forward');
            }
        } else if (phase === 'subtype') {
            if (!st._pendingSubtype) { showToast('Please select your experience level.', 'warning'); return; }
            st.programType = st._pendingSubtype;
            buildPrefQueue();
            st.history.push({ phase: 'subtype' });
            goTo('prefs', 'forward');
        } else if (phase === 'prefs') {
            collectPrefAnswer();
            advancePref('collected');
        } else if (phase === 'missing') {
            collectMissingAnswer();
            advanceMissing('collected');
        } else if (phase === 'review') {
            collectReviewAnswers();
            saveProgress(); // save reviewed/confirmed AI data to Supabase
            st.history.push({ phase: 'review' });
            goTo('preview', 'forward');
        } else if (phase === 'preview') {
            st.history.push({ phase: 'preview' });
            goTo('publish', 'forward');
        } else if (phase === 'publish') {
            finishWizard();
        }
    }

    function handleBack() {
        const prev = st.history.pop();
        if (!prev) return;
        if (prev.phase === 'prefs') {
            st.prefIdx = typeof prev.idx === 'number' ? prev.idx : Math.max(0, st.prefIdx - 1);
        } else if (prev.phase === 'missing') {
            st.missingIdx = typeof prev.idx === 'number' ? prev.idx : Math.max(0, st.missingIdx - 1);
        }
        goTo(prev.phase, 'back');
    }

    function handleSkip() { handleNext(); }

    function proceedAfterCV() {
        if (!st.programType) {
            st.history.push({ phase: 'cv' });
            goTo('type', 'forward');
            return;
        }
        // For fresher/semi from DB, subtype may still be unresolved if YOE was absent
        if (st.programType === 'fresher_fresher' || st.programType === 'semi_fresher') {
            const yoeRaw = getFormValue('emp_exp_years') || (st.profileData ? st.profileData.emp_exp_years : null);
            const yoe = parseInt(yoeRaw || '', 10);
            if (isNaN(yoe) || yoeRaw == null) {
                // YOE unknown — show subtype screen so user can choose
                st._pendingType = st.programType === 'fresher_fresher' ? 'fresher' : 'semi';
                st.history.push({ phase: 'cv' });
                goTo('subtype', 'forward');
                return;
            }
        }
        buildPrefQueue();
        st.history.push({ phase: 'cv' });
        goTo('prefs', 'forward');
    }

    // ------ Preferences phase ------
    function buildPrefQueue() {
        st.prefQueue = WZ_ROLE_QUESTIONS[st.programType] || WZ_ROLE_QUESTIONS['fresher_fresher'];
        st.prefIdx = 0;
    }

    function collectPrefAnswer() {
        const cfg = WZ_QUESTION_CONFIGS[st.prefQueue[st.prefIdx]];
        if (!cfg) return;
        const el = document.getElementById('wz-screen-' + st.currentSlot);
        let val = null;
        if (cfg.type === 'radio') {
            const sel = el.querySelector('.wz-radio-card.wz-selected');
            val = sel ? sel.getAttribute('data-val') : null;
        } else if (cfg.type === 'chips' || cfg.type === 'chips_custom') {
            val = Array.from(el.querySelectorAll('.wz-chip.wz-selected')).map(c => c.getAttribute('data-val'));
            if (!val.length) val = null;
        } else if (cfg.type === 'date') {
            val = el.querySelector('#wz-q-date')?.value || null;
        } else if (cfg.type === 'salary') {
            val = el.querySelector('#wz-q-salary')?.value?.trim() || null;
        }
        if (val !== null) st.answers[cfg.id] = val;
    }

    function advancePref(_collected) {
        if (_collected === null) {
            const cfg = WZ_QUESTION_CONFIGS[st.prefQueue[st.prefIdx]];
            if (cfg) delete st.answers[cfg.id]; // purge any previously saved answer for this question
        }
        saveProgress(); // save after every single preference question
        st.history.push({ phase: 'prefs', idx: st.prefIdx });
        st.prefIdx++;
        if (st.prefIdx >= st.prefQueue.length) {
            buildMissingQueue();
            if (st.missingQueue.length) {
                goTo('missing', 'forward');
            } else {
                buildReviewItems();
                if (st.reviewItems.length) goTo('review', 'forward');
                else goTo('preview', 'forward');
            }
        } else {
            goTo('prefs', 'forward');
        }
    }

    // AI field name aliases: form field id → AI response key when they differ
    const AI_KEY_ALIASES = { current_city: 'current_location' };

    function getAiVal(f) {
        if (!st.aiData) return '';
        const alias = AI_KEY_ALIASES[f.id];
        return st.aiData[alias] || st.aiData[f.inputName] || st.aiData[f.id] || '';
    }

    // ------ Missing fields phase ------
    function buildMissingQueue() {
        const fields = getWzMissingFields(st.programType);
        const skipped = JSON.parse(localStorage.getItem('wz_skipped_fields') || '[]');
        st.missingQueue = fields.filter(f => {
            if (skipped.includes(f.id)) return false;           // user previously skipped — never re-ask
            if (st.answers['missing_' + f.id]) return false;   // user already answered in wizard
            if (getFormValue(f.inputName)) return false;        // form already has a DB/profile value
            return true;
            // Note: AI data is shown as a pre-fill inside the input, not used to skip fields
        });
        st.missingIdx = 0;
    }

    function collectMissingAnswer() {
        const field = st.missingQueue[st.missingIdx];
        if (!field) return;
        const el = document.getElementById('wz-screen-' + st.currentSlot);
        const inp = el.querySelector('#wz-missing-input');
        const val = inp ? inp.value.trim() : '';
        if (val) {
            st.answers['missing_' + field.id] = val;
            // Also set in the main form for continuity
            const mainInput = document.getElementById(field.inputName) || profileForm.elements[field.inputName];
            if (mainInput) mainInput.value = val;
        }
    }

    function advanceMissing(_collected) {
        if (_collected === null) {
            const field = st.missingQueue[st.missingIdx];
            if (field) {
                const skipped = JSON.parse(localStorage.getItem('wz_skipped_fields') || '[]');
                if (!skipped.includes(field.id)) skipped.push(field.id);
                localStorage.setItem('wz_skipped_fields', JSON.stringify(skipped));
            }
        }
        saveProgress(); // save after every single missing-field question
        st.history.push({ phase: 'missing', idx: st.missingIdx });
        st.missingIdx++;
        if (st.missingIdx >= st.missingQueue.length) {
            buildReviewItems();
            if (st.reviewItems.length) goTo('review', 'forward');
            else goTo('preview', 'forward');
        } else {
            goTo('missing', 'forward');
        }
    }

    // ------ Review items ------
    function buildReviewItems() {
        // Show review step whenever a resume was uploaded (AI may have filled fields)
        // or when any AI data is available. buildReviewGroups() handles the actual content.
        const hasFile = !!localStorage.getItem('userCVFileName');
        const hasAI   = !!st.aiData;
        st.reviewItems = (hasFile || hasAI) ? [{ label: '_show', value: '_show' }] : [];
    }

    function buildReviewGroups() {
        const type = st.programType || 'fresher_fresher';
        // fv: form value first, then AI data fallback
        const fv = k => { const v = getFormValue(k); return v || (st.aiData ? (st.aiData[k] || '') : ''); };
        const fv2 = (k1, k2) => { const a = fv(k1); const b = fv(k2); return a ? (b ? a + ' ' + b : a) : b; };

        const personalGroup = {
            label: 'Personal Details',
            fields: [
                { key: 'name',            label: 'Full Name',        value: fv('name') },
                { key: 'contact_number',  label: 'Contact Number',   value: fv('contact_number') },
                { key: 'current_city',    label: 'Current City',     value: fv('current_city') },
                { key: 'current_location',label: 'Current Location', value: fv('current_location') },
                { key: 'gender',          label: 'Gender',           value: fv('gender') },
                { key: 'date_of_birth',   label: 'Date of Birth',    value: fv('date_of_birth') },
                { key: 'linkedin_url',    label: 'LinkedIn URL',     value: fv('linkedin_url'), wide: true },
                { key: 'profile_summary', label: 'Profile Summary',  value: fv('profile_summary'), wide: true, textarea: true },
            ]
        };

        const educationGroup = {
            label: 'Education',
            fields: [
                { key: 'grad_degree',        label: 'Graduation Degree', value: fv('grad_degree') },
                { key: 'grad_university',    label: 'University',        value: fv('grad_university') },
                { key: 'grad_year',          label: 'Graduation Year',   value: fv('grad_year') },
                { key: 'grad_percentage',    label: 'Graduation %/CGPA', value: fv('grad_percentage') },
                { key: 'class12_school',     label: 'Class XII School',  value: fv('class12_school') },
                { key: 'class12_percentage', label: 'Class XII %',       value: fv('class12_percentage') },
                { key: 'class10_school',     label: 'Class X School',    value: fv('class10_school') },
                { key: 'class10_percentage', label: 'Class X %',         value: fv('class10_percentage') },
            ]
        };

        if (type === 'industrial' || type === 'articleship') {
            return [
                personalGroup,
                {
                    label: 'CA Journey',
                    fields: [
                        { key: 'ca_inter_course',      label: 'CA Inter',          value: fv('ca_inter_course') },
                        { key: 'ca_inter_clear_month', label: 'CA Inter Cleared',  value: fv2('ca_inter_clear_month','ca_inter_clear_year') },
                        { key: 'ca_inter_air',         label: 'CA Inter AIR',      value: fv('ca_inter_air') },
                        { key: 'ca_found_course',      label: 'CA Foundation',     value: fv('ca_found_course') },
                        { key: 'ca_found_clear_month', label: 'Foundation Cleared',value: fv2('ca_found_clear_month','ca_found_clear_year') },
                        { key: 'ca_final_app_month',   label: 'CA Final Appearing',value: fv2('ca_final_app_month','ca_final_app_year') },
                    ]
                },
                educationGroup,
                {
                    label: 'Articleship',
                    fields: [
                        { key: 'articleship_firm_type', label: 'Firm Type',  value: fv('articleship_firm_type') },
                        { key: 'articleship_firm_name', label: 'Firm Name',  value: fv('articleship_firm_name') },
                        { key: 'articleship_domain',    label: 'Domain',     value: fv('articleship_domain') },
                        { key: 'industrial_training_company', label: 'Industrial Training Company', value: fv('industrial_training_company'), wide: true },
                    ]
                },
            ];
        }

        if (type === 'semi_fresher' || type === 'semi_experienced') {
            return [
                personalGroup,
                {
                    label: 'CA Journey',
                    fields: [
                        { key: 'ca_inter_course',      label: 'CA Inter',           value: fv('ca_inter_course') },
                        { key: 'ca_inter_clear_month', label: 'CA Inter Cleared',   value: fv2('ca_inter_clear_month','ca_inter_clear_year') },
                        { key: 'ca_inter_air',         label: 'CA Inter AIR',       value: fv('ca_inter_air') },
                        { key: 'ca_final_app_month',   label: 'CA Final Appearing', value: fv2('ca_final_app_month','ca_final_app_year') },
                    ]
                },
                educationGroup,
                {
                    label: 'Articleship',
                    fields: [
                        { key: 'articleship_firm_type', label: 'Firm Type', value: fv('articleship_firm_type') },
                        { key: 'articleship_firm_name', label: 'Firm Name', value: fv('articleship_firm_name') },
                        { key: 'articleship_domain',    label: 'Domain',    value: fv('articleship_domain') },
                    ]
                },
                {
                    label: 'Employment',
                    fields: [
                        { key: 'emp_company_name', label: 'Company',    value: fv('emp_company_name') },
                        { key: 'emp_job_title',    label: 'Designation',value: fv('emp_job_title') },
                        { key: 'emp_join_year',    label: 'Joined',     value: fv2('emp_join_month','emp_join_year') },
                        { key: 'emp_job_profile',  label: 'Profile',    value: fv('emp_job_profile'), wide: true, textarea: true },
                    ]
                },
            ];
        }

        // fresher_fresher, fresher_experienced (default)
        return [
            personalGroup,
            {
                label: 'CA Journey',
                fields: [
                    { key: 'ca_final_course',      label: 'CA Final',          value: fv('ca_final_course') },
                    { key: 'ca_final_clear_month', label: 'CA Final Cleared',  value: fv2('ca_final_clear_month','ca_final_clear_year') },
                    { key: 'ca_final_air',         label: 'CA Final AIR',      value: fv('ca_final_air') },
                    { key: 'ca_inter_course',      label: 'CA Inter',          value: fv('ca_inter_course') },
                    { key: 'ca_inter_clear_month', label: 'CA Inter Cleared',  value: fv2('ca_inter_clear_month','ca_inter_clear_year') },
                    { key: 'ca_inter_air',         label: 'CA Inter AIR',      value: fv('ca_inter_air') },
                    { key: 'ca_found_course',      label: 'CA Foundation',     value: fv('ca_found_course') },
                ]
            },
            educationGroup,
            {
                label: 'Articleship',
                fields: [
                    { key: 'articleship_firm_type', label: 'Firm Type', value: fv('articleship_firm_type') },
                    { key: 'articleship_firm_name', label: 'Firm Name', value: fv('articleship_firm_name') },
                    { key: 'articleship_domain',    label: 'Domain',    value: fv('articleship_domain') },
                    { key: 'industrial_training_company', label: 'Industrial Training Company', value: fv('industrial_training_company'), wide: true },
                ]
            },
            {
                label: 'Employment',
                fields: [
                    { key: 'emp_company_name', label: 'Company',     value: fv('emp_company_name') },
                    { key: 'emp_job_title',    label: 'Designation', value: fv('emp_job_title') },
                    { key: 'emp_join_year',    label: 'Joined',      value: fv2('emp_join_month','emp_join_year') },
                    { key: 'emp_job_profile',  label: 'Profile',     value: fv('emp_job_profile'), wide: true, textarea: true },
                ]
            },
        ];
    }

    function mountReview() {
        if (st.aiStatus !== 'loading') return; // already done or no file — render is already correct
        // AI still in flight — show a "hold on" banner and re-render once it resolves
        const activeEl = document.getElementById('wz-screen-' + st.currentSlot);
        if (!activeEl) return;
        const banner = document.createElement('div');
        banner.className = 'wz-ai-banner';
        banner.id = 'wz-review-ai-banner';
        banner.innerHTML = '<div class="wz-ai-dot"></div>Extracting resume details — refreshing in a moment…';
        const inner = activeEl.querySelector('.wz-inner');
        if (inner) inner.prepend(banner);

        const poll = setInterval(() => {
            if (st.aiStatus !== 'loading') {
                clearInterval(poll);
                // Re-render the review screen in-place with the now-populated form data
                const el2 = document.getElementById('wz-screen-' + st.currentSlot);
                if (el2 && st.phase === 'review') {
                    el2.innerHTML = buildReview();
                }
            }
        }, 600);
    }

    function collectReviewAnswers() {
        const activeEl = document.getElementById('wz-screen-' + st.currentSlot);
        if (!activeEl) return;
        activeEl.querySelectorAll('[name^="rv_"]').forEach(inp => {
            const key = inp.name.replace('rv_', '');
            const val = inp.value.trim(); // intentionally allow empty — user may have deleted wrong AI value
            const mainEl = document.getElementById(key) || profileForm.elements[key];
            if (mainEl) mainEl.value = val;
        });
    }

    // ------ Fire storer + profill in parallel, no await — user never waits ------
    function fireStorerAndProfill() {
        // Prefer in-memory (survives localStorage quota failures), fall back to localStorage
        const images = window._wzCVImages?.length
            ? window._wzCVImages
            : (() => { try { return JSON.parse(localStorage.getItem('userCVImages') || '[]'); } catch { return []; } })();
        if (!images.length) return; // no resume uploaded, nothing to do

        const base64Pdf = window._wzCVPdf || localStorage.getItem('userCVPdf') || '';
        const userId = currentUser?.id;
        st.aiStatus = 'loading';

        // ── Storer: does OCR, uploads file, returns ocr_text ──
        fetch('https://storer.bhansalimanan55.workers.dev', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, images, pdf: base64Pdf, pdf_text: '' })
        })
        .then(r => r.json())
        .then(d => {
            if (!d.ok) return;
            if (d.ocr_text) localStorage.setItem('userCVText', d.ocr_text);
            if (d.uploaded) {
                st.storerDone = true;
                setCloudSyncFlag();
                const consentGiven = document.getElementById('cvSharingConsent')?.checked;
                if (consentGiven) saveConsentRecord(true).catch(() => {});
            }
        })
        .catch(() => {});

        // ── Profill: needs only images + portal type so it extracts the right fields ──
        fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, images, pdf_text: '', pdf: base64Pdf, portal_type: st.programType || 'fresher_fresher' })
        })
        .then(r => r.json())
        .then(data => {
            if (!data.ok) { st.aiStatus = 'failed'; return; }
            if (data.is_cv === false) {
                st.aiStatus = 'failed';
                showToast('The uploaded file does not appear to be a valid resume.', 'warning', 6000);
                return;
            }
            const parsed = parseGeminiJson(data.response);
            if (!parsed) { st.aiStatus = 'failed'; return; }
            if (parsed.is_valid_cv === false) {
                st.aiStatus = 'failed';
                showToast('The uploaded file does not appear to be a valid resume.', 'warning', 6000);
                return;
            }
            st.aiData = parsed;
            st.aiStatus = 'done';
            // Only fill form fields that are still empty — never override what user typed
            populateFormSafe(parsed);
            // Trigger change on attempts dropdowns so hidden count inputs become visible
            ['ca_final_attempts_type', 'ca_inter_attempts_type', 'ca_found_attempts_type'].forEach(id => {
                const el = document.getElementById(id);
                if (el && el.value) el.dispatchEvent(new Event('change'));
            });
            // Trigger AIR visibility based on AI-populated performance values
            ['ca_final_performance', 'ca_inter_performance'].forEach(id => {
                const el = document.getElementById(id);
                if (el && el.value) el.dispatchEvent(new Event('change'));
            });
            // Sync chip UI for any multi-select fields AI populated
            restoreChipMultiSelect('art_client_industries_chips', 'articleship_client_industries');
            restoreChipMultiSelect('art_domain_chips', 'articleship_domain');
            restoreChipMultiSelect('addl_qual_chips', 'additional_qualifications');
            restoreChipMultiSelect('preferred_domains_chips', 'preferred_domains');
            restoreChipMultiSelect('preferred_industries_chips', 'preferred_industries');
            restoreChipMultiSelect('preferred_firm_type_chips', 'preferred_firm_type');
            restoreChipMultiSelect('preferred_company_type_chips', 'preferred_company_type');
            restoreChipMultiSelect('emp_domain_chips', 'emp_domain');
            restoreChipMultiSelect('prev_emp_domain_chips', 'prev_emp_domain');
            refreshHeader();
            // If AI arrives while the user is mid-missing-phase, prefill the current visible
            // input with the AI value — but only if the user hasn't typed anything yet
            if (st.phase === 'missing') {
                const field = st.missingQueue[st.missingIdx];
                if (field) {
                    const aiVal = String(getAiVal(field) || '').trim();
                    if (aiVal) {
                        const activeEl = document.getElementById('wz-screen-' + st.currentSlot);
                        const inp = activeEl?.querySelector('#wz-missing-input');
                        if (inp && !inp.value.trim()) {
                            inp.value = aiVal;
                            // Show "auto-filled" banner if not already present
                            const inner = activeEl?.querySelector('.wz-inner');
                            if (inner && !inner.querySelector('.wz-ai-banner')) {
                                const banner = document.createElement('div');
                                banner.className = 'wz-ai-banner';
                                banner.style.cssText = 'background:rgba(99,102,241,0.08);border-color:rgba(99,102,241,0.25);';
                                banner.innerHTML = '<span style="font-size:0.85em;">✨ Auto-filled from your CV — edit if needed</span>';
                                inner.prepend(banner);
                            } else if (inner) {
                                const existing = inner.querySelector('.wz-ai-banner');
                                if (existing) existing.innerHTML = '<span style="font-size:0.85em;">✨ Auto-filled from your CV — edit if needed</span>';
                            }
                        }
                    }
                }
            }
        })
        .catch(() => { st.aiStatus = 'failed'; });
    }

    async function saveConsentFromWizard() {
        const chk = document.getElementById('wz-consent-chk');
        const mainChk = document.getElementById('cvSharingConsent');
        if (chk && mainChk) {
            mainChk.checked = chk.checked;
            if (!chk.checked) return;
        }
        // Will be formally saved when storer succeeds (same as current logic)
    }

    // ------ File handling in wizard — images + base64 only, no text extraction, no AI calls ------
    async function handleWzFileSelect(file) {
        if (!file) return;
        if (file.type !== 'application/pdf') { showToast('Please upload a PDF file.', 'warning'); return; }
        if (file.size > 5 * 1024 * 1024) { showToast('File size must be under 5 MB.', 'warning'); return; }

        const nextBtn = document.getElementById('wz-next-btn');
        if (nextBtn) { nextBtn.disabled = true; nextBtn.textContent = 'Reading PDF…'; }

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            // Canvas render only — no text extraction
            const images = await convertPdfToImages(pdfDoc);

            // Base64 encode PDF for storer
            const base64Pdf = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            // Keep images in memory so fireStorerAndProfill can still run if localStorage is full
            window._wzCVImages  = images;
            window._wzCVPdf     = base64Pdf;
            try { localStorage.setItem('userCVImages', JSON.stringify(images)); } catch {
                showToast('Resume is large — AI will still process it, but local caching was skipped.', 'warning');
            }
            try { localStorage.setItem('userCVPdf', base64Pdf); } catch { /* ignore */ }
            localStorage.setItem('userCVFileName', file.name);
            localStorage.removeItem('userCVText'); // storer will set this on Next

            if (st.phase === 'cv') goTo('cv', 'forward');
        } catch (e) {
            console.error(e);
            showToast('Could not read the PDF. Please try a different file.', 'error');
        } finally {
            if (nextBtn) { nextBtn.disabled = false; nextBtn.textContent = 'Continue →'; }
        }
    }

    // ------ Final save ------
    async function finishWizard() {
        if (!currentUser) { showMain(); return; }
        showLoading(true, 'Saving your profile…');
        try {
            // Collect all wizard answers into the main form (writes values + hidden inputs)
            applyAnswersToForm();

            // Visually restore chip UI so career section shows correct selections immediately
            restoreChipMultiSelect('preferred_domains_chips', 'preferred_domains');
            restoreChipMultiSelect('preferred_industries_chips', 'preferred_industries');
            restoreChipMultiSelect('preferred_firm_type_chips', 'preferred_firm_type');
            restoreChipMultiSelect('preferred_company_type_chips', 'preferred_company_type');

            // Build profile object from form
            const profileData = buildProfileFromForm();
            profileData.cv_cloud_synced = isCloudSynced();

            // Wizard-specific fields (stored in profile JSON)
            if (st.answers['preferred_locations']) profileData.preferred_locations = Array.isArray(st.answers['preferred_locations']) ? st.answers['preferred_locations'].join(', ') : st.answers['preferred_locations'];
            if (st.answers['relocation']) profileData.relocation_preference = st.answers['relocation'];
            if (st.answers['joining_date']) profileData.earliest_joining_date = st.answers['joining_date'];
            if (st.answers['expected_ctc'])     profileData.expected_salary    = st.answers['expected_ctc'];
            if (st.answers['expected_stipend']) profileData.expected_stipend_min = st.answers['expected_stipend'];
            if (st.answers['preferred_domains']) profileData.preferred_domains = Array.isArray(st.answers['preferred_domains']) ? st.answers['preferred_domains'].join(', ') : st.answers['preferred_domains'];
            if (st.answers['preferred_industries']) profileData.preferred_industries = Array.isArray(st.answers['preferred_industries']) ? st.answers['preferred_industries'].join(', ') : st.answers['preferred_industries'];
            if (st.answers['preferred_firm_type']) profileData.preferred_firm_type = Array.isArray(st.answers['preferred_firm_type']) ? st.answers['preferred_firm_type'].join(', ') : st.answers['preferred_firm_type'];
            if (st.answers['notice_period']) profileData.notice_period = st.answers['notice_period'];
            if (st.answers['employment_status']) profileData.current_employment_status = st.answers['employment_status'];

            // Set job_preference to match programType
            if (st.programType) profileData.job_preference = st.programType;

            const lookingForVal = typeToLookingFor(st.programType);

            const { error } = await supabaseClient.from('profiles').upsert({
                uuid: currentUser.id,
                profile: profileData,
                ocr_cv: localStorage.getItem('userCVText') || '',
                looking_for: lookingForVal,
                updated_at: new Date().toISOString()
            });
            if (error) throw error;
            currentLookingFor = lookingForVal;
            localStorage.setItem('userProfileData', JSON.stringify(profileData));
            refreshHeader();
        } catch (e) {
            console.error(e);
            showToast('Could not save profile. Please try again.', 'error');
        } finally {
            showLoading(false);
        }
        showMain();
    }

    function applyAnswersToForm() {
        const fieldMap = {
            'missing_name': 'name',
            'missing_contact_number': 'contact_number',
            'missing_current_city': 'current_city',
            'missing_linkedin_url': 'linkedin_url',
            'missing_profile_summary': 'profile_summary',
        };
        Object.entries(fieldMap).forEach(([ansKey, inputName]) => {
            const val = st.answers[ansKey];
            if (!val) return;
            const el = document.getElementById(inputName) || profileForm.elements[inputName];
            if (el) el.value = val;
        });

        // Attempts: user typed a number → set the count input + auto-switch the type dropdown
        ['ca_final_attempts', 'ca_inter_attempts', 'ca_found_attempts'].forEach(field => {
            const raw = st.answers['missing_' + field];
            if (!raw) return;
            const num = parseInt(raw, 10);
            if (isNaN(num)) return;
            const countEl = document.getElementById(field);
            const typeEl  = document.getElementById(field + '_type');
            if (countEl) countEl.value = num;
            if (typeEl) {
                typeEl.value = num <= 1 ? 'First Attempt' : 'Other';
                typeEl.dispatchEvent(new Event('change'));
            }
        });

        if (st.answers['joining_date']) {
            const el = document.getElementById('earliest_joining_date') || profileForm.elements['earliest_joining_date'];
            if (el) el.value = st.answers['joining_date'];
        }
        if (st.answers['notice_period']) {
            const el = document.getElementById('notice_period') || profileForm.elements['notice_period'];
            if (el) el.value = st.answers['notice_period'];
        }
        if (st.answers['expected_stipend']) {
            const el = document.getElementById('expected_stipend_min') || profileForm.elements['expected_stipend_min'];
            if (el) el.value = st.answers['expected_stipend'];
        }
        if (st.answers['expected_ctc']) {
            const el = document.getElementById('expected_salary') || profileForm.elements['expected_salary'];
            if (el) el.value = st.answers['expected_ctc'];
        }
        if (st.answers['preferred_locations']) {
            const el = document.getElementById('preferred_locations') || profileForm.elements['preferred_locations'];
            const val = Array.isArray(st.answers['preferred_locations']) ? st.answers['preferred_locations'].join(', ') : st.answers['preferred_locations'];
            if (el) el.value = val;
        }
        if (st.answers['relocation']) {
            const el = document.getElementById('relocation_preference');
            if (el) el.value = st.answers['relocation'];
        }
        if (st.answers['employment_status']) {
            const el = document.getElementById('current_employment_status');
            if (el) el.value = st.answers['employment_status'];
        }
        if (st.answers['preferred_domains']) {
            const el = document.getElementById('preferred_domains');
            if (el) el.value = formatArrayAnswer(st.answers['preferred_domains']);
        }
        if (st.answers['preferred_industries']) {
            const el = document.getElementById('preferred_industries');
            if (el) el.value = formatArrayAnswer(st.answers['preferred_industries']);
        }
        if (st.answers['preferred_firm_type']) {
            const el = document.getElementById('preferred_firm_type');
            if (el) el.value = formatArrayAnswer(st.answers['preferred_firm_type']);
        }
        // Chip fields from missing-fields wizard (user typed comma-separated) → hidden input + restore chips
        if (st.answers['missing_articleship_domain']) {
            const el = document.getElementById('articleship_domain');
            if (el) { el.value = st.answers['missing_articleship_domain']; restoreChipMultiSelect('art_domain_chips', 'articleship_domain'); }
        }
        if (st.answers['missing_articleship_client_industries']) {
            const el = document.getElementById('articleship_client_industries');
            if (el) { el.value = st.answers['missing_articleship_client_industries']; restoreChipMultiSelect('art_client_industries_chips', 'articleship_client_industries'); }
        }
        if (st.answers['missing_additional_qualifications']) {
            const el = document.getElementById('additional_qualifications');
            if (el) { el.value = st.answers['missing_additional_qualifications']; restoreChipMultiSelect('addl_qual_chips', 'additional_qualifications'); }
        }

        if (st.programType) {
            const jp = document.getElementById('job_preference');
            if (jp) jp.value = st.programType;
        }
    }

    function buildProfileFromForm() {
        const obj = {};
        if (!profileForm) return obj;
        Array.from(profileForm.elements).forEach(el => {
            if (!el.name || el.disabled) return;
            if (el.type === 'radio') { if (el.checked) obj[el.name] = el.value; return; }
            if (el.type === 'checkbox') return; // chip checkboxes are unnamed; named checkboxes saved via hidden inputs
            if (el.value) obj[el.name] = el.value;
        });
        return obj;
    }

    // Maps AI response keys to form field names when they differ
    const AI_TO_FORM_ALIASES = { current_location: 'current_city' };

    // ------ populateFormSafe: like populateForm but never overwrites existing values ------
    function populateFormSafe(profileData) {
        if (!profileForm || !profileData) return;
        for (const key in profileData) {
            if (key === 'resume' || key === 'cover_letter' || key === 'project_attachment') continue;
            const val = profileData[key];
            if (val === null || val === undefined || val === '') continue;
            const formKey = AI_TO_FORM_ALIASES[key] || key;
            const field = profileForm.elements[formKey];
            if (!field) continue;
            if (field.value && field.value.trim()) continue; // user already filled this — skip
            field.value = val;
        }
        // Also sync email from auth in case it was cleared
        const emailField = document.getElementById('email');
        if (emailField && !emailField.value && currentUser?.email) {
            emailField.value = currentUser.email;
        }
    }

    // ------ Progressive save: debounced upsert — prevents concurrent 409s on rapid clicks ------
    let _saveTimer = null;
    function saveProgress() {
        clearTimeout(_saveTimer);
        _saveTimer = setTimeout(_doSaveProgress, 400);
    }
    function _doSaveProgress() {
        if (!currentUser) return;
        applyAnswersToForm();
        const profileData = buildProfileFromForm();
        profileData.cv_cloud_synced = isCloudSynced();
        // Wizard preference fields
        if (st.answers['preferred_locations']) profileData.preferred_locations = formatArrayAnswer(st.answers['preferred_locations']);
        if (st.answers['relocation'])          profileData.relocation_preference = st.answers['relocation'];
        if (st.answers['joining_date'])        profileData.earliest_joining_date = st.answers['joining_date'];
        if (st.answers['expected_ctc'] || st.answers['expected_stipend']) profileData.expected_salary = st.answers['expected_ctc'] || st.answers['expected_stipend'];
        if (st.answers['preferred_domains'])   profileData.preferred_domains = formatArrayAnswer(st.answers['preferred_domains']);
        if (st.answers['preferred_industries'])profileData.preferred_industries = formatArrayAnswer(st.answers['preferred_industries']);
        if (st.answers['preferred_firm_type']) profileData.preferred_firm_type = formatArrayAnswer(st.answers['preferred_firm_type']);
        if (st.answers['notice_period'])       profileData.notice_period = st.answers['notice_period'];
        if (st.answers['employment_status'])   profileData.current_employment_status = st.answers['employment_status'];
        if (st.programType)                    profileData.job_preference = st.programType;

        const lookingForVal = st.programType ? typeToLookingFor(st.programType) : undefined;

        const upsertData = { uuid: currentUser.id, profile: profileData, updated_at: new Date().toISOString() };
        if (lookingForVal) upsertData.looking_for = lookingForVal;

        supabaseClient.from('profiles').upsert(upsertData).then(({ error }) => {
            if (error) console.warn('Progress save failed:', error.message);
            else localStorage.setItem('userProfileData', JSON.stringify(profileData));
        });
    }

    // ------ Helpers ------
    function getFormValue(name) {
        if (!profileForm) return '';
        const el = profileForm.elements[name] || document.getElementById(name);
        return el ? (el.value || '').trim() : '';
    }

    function formatArrayAnswer(val) {
        if (!val) return '';
        if (Array.isArray(val)) return val.join(', ');
        return String(val);
    }

    function escHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function calcCompleteness() {
        const ans = k => st.answers['missing_' + k] || st.answers[k];
        let score = 20; // base for having an account
        if (getFormValue('name')           || ans('name'))           score += 10;
        if (getFormValue('contact_number') || ans('contact_number')) score += 10;
        if (localStorage.getItem('userCVFileName'))                  score += 10;
        if (getFormValue('profile_summary')|| ans('profile_summary'))score += 8;
        if (getFormValue('linkedin_url')   || ans('linkedin_url'))   score += 5;
        if (st.answers['preferred_locations'] || getFormValue('preferred_locations')) score += 5;
        if (st.answers['preferred_domains'] || getFormValue('preferred_domains'))     score += 6;
        if (st.answers['preferred_industries'] || getFormValue('preferred_industries')) score += 5;
        if (st.programType || getFormValue('job_preference'))        score += 5;
        if (getFormValue('articleship_client_industries'))           score += 6;
        if (getFormValue('cert_name'))                               score += 3;
        if (getFormValue('key_skills') || getFormValue('emp_skills_hidden')) score += 5;
        if (getFormValue('grad_degree'))                             score += 2;
        return Math.min(score, 100);
    }

    return { init };
})();

// =================== PROFILE LOAD ===================
async function loadProfile() {
    if (!currentUser) return null;
    showLoading(true, 'Fetching your profile...');
    let profileObj = null;

    try {
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('profile, ocr_cv, updated_at, looking_for')
            .eq('uuid', currentUser.id)
            .maybeSingle();

        if (error) throw error;

        if (data) {
            lastUpdatedISO = data.updated_at;
            if (data.looking_for) currentLookingFor = data.looking_for;
            if (data.profile) {
                profileObj = data.profile;
                populateForm(data.profile);
                localStorage.setItem('userProfileData', JSON.stringify(data.profile));
            }
            if (data.ocr_cv) {
                localStorage.setItem('userCVText', data.ocr_cv);
                if (data.profile && data.profile.cv_cloud_synced) {
                    setCloudSyncFlag();
                } else {
                    clearCloudSyncFlag();
                }
            } else {
                clearCloudSyncFlag();
            }
        } else {
            const localProfile = localStorage.getItem('userProfileData');
            if (localProfile) {
                profileObj = JSON.parse(localProfile);
                populateForm(profileObj);
            }
        }

        // Show cached files
        ['resume', 'cover_letter'].forEach(type => {
            const config = fileConfig[type];
            if (type === 'resume') {
                const cachedImages = localStorage.getItem(config.storageKeyImages);
                const cachedName = localStorage.getItem(config.storageKeyName);
                if (cachedImages && cachedName) showFileDisplay(type, cachedName);
            } else {
                const cachedName = localStorage.getItem(config.storageKeyName);
                if (cachedName) showFileDisplay(type, cachedName);
            }
        });

        setTimeout(() => refreshHeader(), 150);
        return profileObj;

    } catch (e) {
        console.error(e);
        const localProfile = localStorage.getItem('userProfileData');
        if (localProfile) {
            profileObj = JSON.parse(localProfile);
            populateForm(profileObj);
        }
        setTimeout(() => refreshHeader(), 150);
        return profileObj;
    } finally {
        showLoading(false);
    }
}

// =================== POPULATE FORM ===================
function populateForm(profileData) {
    for (const key in profileData) {
        if (key === 'resume' || key === 'cover_letter' || key === 'project_attachment') continue;
        const field = profileForm.elements[key];
        if (field) field.value = profileData[key];
    }

    const emailField = document.getElementById('email');
    if (emailField && !emailField.value && currentUser?.email) {
        emailField.value = currentUser.email;
    }

    const domainOther = document.getElementById('articleship_domain_other');
    const domainOtherGroup = document.getElementById('articleship_domain_other_group');
    if (domainOther && profileData.articleship_domain === 'Other') {
        if (domainOtherGroup) domainOtherGroup.style.display = 'block';
    }

    const jobPref = document.getElementById('job_preference');
    if (jobPref) jobPref.dispatchEvent(new Event('change'));

    // Backward compatibility: old headline field maps to profile_summary if empty.
    const summaryField = document.getElementById('profile_summary');
    if (summaryField && !summaryField.value && profileData.headline) {
        summaryField.value = profileData.headline;
    }
    const headlineField = document.getElementById('headline');
    if (headlineField && summaryField) {
        headlineField.value = summaryField.value || '';
    }

    if (profileData.project_attachment_name) {
        showProjectFileDisplay(profileData.project_attachment_name);
    } else {
        hideProjectFileDisplay();
    }

    if (profileData.emp_skills_hidden) {
        skillsList = profileData.emp_skills_hidden.split(',').map(s => s.trim()).filter(Boolean);
        renderSkills();
    } else {
        skillsList = [];
        renderSkills();
    }

    if (profileData.key_skills) {
        keySkillsList = profileData.key_skills.split(',').map(s => s.trim()).filter(Boolean);
        renderKeySkills();
    } else {
        keySkillsList = [];
        renderKeySkills();
    }

    const noticeSelect = document.getElementById('notice_period');
    if (noticeSelect) noticeSelect.dispatchEvent(new Event('change'));
}

// =================== FILE HANDLING ===================
function showFileDisplay(type, filename) {
    const config = fileConfig[type];
    if (!config) return;
    config.filenameEl.textContent = filename;
    config.displayArea.style.display = 'block';
    config.uploadArea.style.display = 'none';
}

function hideFileDisplay(type) {
    const config = fileConfig[type];
    if (!config) return;
    config.filenameEl.textContent = '';
    config.displayArea.style.display = 'none';
    config.uploadArea.style.display = 'block';
    localStorage.removeItem(config.storageKeyText);
    localStorage.removeItem(config.storageKeyName);
    if (config.storageKeyImages) localStorage.removeItem(config.storageKeyImages);
    if (type === 'resume') localStorage.removeItem('userCVPdf');
    config.input.value = '';
}

function showProjectFileDisplay(filename) {
    const filenameEl = document.getElementById('project-filename');
    const hiddenInput = document.getElementById('project_attachment_name');
    const display = document.getElementById('project-file-display');
    if (filenameEl) filenameEl.textContent = filename;
    if (hiddenInput) hiddenInput.value = filename || '';
    if (display) display.style.display = filename ? 'block' : 'none';
}

function hideProjectFileDisplay() {
    const fileInput = document.getElementById('project_attachment');
    const filenameEl = document.getElementById('project-filename');
    const hiddenInput = document.getElementById('project_attachment_name');
    const display = document.getElementById('project-file-display');
    if (fileInput) fileInput.value = '';
    if (filenameEl) filenameEl.textContent = '';
    if (hiddenInput) hiddenInput.value = '';
    if (display) display.style.display = 'none';
}

function clearFormValueByName(name) {
    const nodes = profileForm.querySelectorAll(`[name="${name}"]`);
    if (!nodes.length) return;

    if (nodes.length > 1 && nodes[0].type === 'radio') {
        nodes.forEach(n => n.checked = false);
        const defaultValue = ENTRY_DEFAULT_VALUE_MAP[name];
        if (defaultValue) {
            const defaultNode = [...nodes].find(n => n.value === defaultValue);
            if (defaultNode) defaultNode.checked = true;
        }
        return;
    }

    const field = nodes[0];
    const defaultValue = ENTRY_DEFAULT_VALUE_MAP[name];

    if (field.tagName === 'SELECT') {
        field.value = defaultValue || '';
    } else if (field.type === 'checkbox' || field.type === 'radio') {
        field.checked = !!defaultValue;
    } else {
        field.value = defaultValue || '';
    }
}

function syncEmploymentChipSelection() {
    document.querySelectorAll('#emp_type_chips .p2-chip').forEach(chip => {
        const radio = chip.querySelector('input[type="radio"]');
        chip.classList.toggle('selected', !!(radio && radio.checked));
    });
}

function clearEntryData(entryId) {
    const fields = ENTRY_CLEAR_MAP[entryId] || [];
    fields.forEach(clearFormValueByName);

    if (entryId === 'emp-org-display') {
        // Clear skills using existing handlers so internal list also resets.
        let closeIcon = document.querySelector('.p2-skill-tag i');
        while (closeIcon) {
            closeIcon.click();
            closeIcon = document.querySelector('.p2-skill-tag i');
        }
        const skillsHidden = document.getElementById('emp_skills_hidden');
        if (skillsHidden) skillsHidden.value = '';
        const skillsInput = document.getElementById('skills_input');
        if (skillsInput) skillsInput.value = '';
        syncEmploymentChipSelection();
    }

    if (entryId === 'project-entry-display') {
        hideProjectFileDisplay();
    }

    if (entryId === 'summary-entry-display') {
        const summaryInput = document.getElementById('profile_summary');
        const summaryLeft = document.getElementById('summary-left');
        const headlineHidden = document.getElementById('headline');
        if (summaryInput) summaryInput.value = '';
        if (headlineHidden) headlineHidden.value = '';
        if (summaryLeft) summaryLeft.textContent = '1000';
    }

    if (entryId === 'key-skills-entry-display') {
        keySkillsList = [];
        renderKeySkills();
    }

    refreshHeader();
}

function attachEntryRemoveButtons() {
    document.querySelectorAll('.p2-saved-entry .p2-entry-edit[data-toggle]').forEach(editLink => {
        const header = editLink.closest('.p2-saved-entry-header');
        const entry = editLink.closest('.p2-saved-entry');
        if (!header || !entry) return;

        let actionsWrap = header.querySelector('.p2-entry-actions');
        if (!actionsWrap) {
            actionsWrap = document.createElement('div');
            actionsWrap.className = 'p2-entry-actions';
            header.appendChild(actionsWrap);
        }

        if (!actionsWrap.contains(editLink)) {
            actionsWrap.appendChild(editLink);
        }

        if (actionsWrap.querySelector('.p2-entry-remove')) return;

        const removeBtn = document.createElement('a');
        removeBtn.href = 'javascript:void(0)';
        removeBtn.className = 'p2-entry-remove';
        removeBtn.setAttribute('title', 'Remove');
        removeBtn.setAttribute('data-entry-id', entry.id);
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';

        actionsWrap.insertBefore(removeBtn, editLink);
    });
}

async function handleFile(file, type) {
    if (!file) return;
    const config = fileConfig[type];
    if (!config) return;

    if (type === 'resume' && file.size > 5 * 1024 * 1024) {
        showToast('Resume file size exceeds the 5 MB limit. Please upload a smaller file.', 'error');
        hideFileDisplay('resume');
        return;
    }

    if (type === 'resume') {
        localStorage.removeItem('cv_images_synced');
    }

    showLoading(true, `Processing ${type.replace('_', ' ')}...`);
    try {
        let textContent = '';
        let images = [];
        let base64Pdf = '';

        if (type === 'cover_letter' && file.type !== 'application/pdf') {
            showToast('Please upload your Cover Letter in PDF format only.', 'warning');
            return;
        }

        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const text = await page.getTextContent();
                textContent += text.items.map(s => s.str).join(' ');
            }

            if (type === 'resume') {
                base64Pdf = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
                try {
                    localStorage.setItem('userCVPdf', base64Pdf);
                } catch (e) {
                    console.error('Failed to cache PDF base64 in localStorage:', e);
                }

                showLoading(true, 'Converting resume to images...');
                images = await convertPdfToImages(pdf);
                if (images.length > 0) {
                    try {
                        localStorage.setItem(config.storageKeyImages, JSON.stringify(images));
                    } catch (e) {
                        showToast('Resume is too large. Please reupload your resume.', 'error');
                    }
                    showLoading(true, 'Validating and Autofilling details...');
                    const extractResult = await extractProfileData(images, textContent, base64Pdf);
                    if (extractResult && extractResult.is_valid === false) {
                        showToast(extractResult.message, 'error', 8000);
                        hideFileDisplay('resume');
                        return;
                    } else if (extractResult && extractResult.data) {
                        populateForm(extractResult.data);
                        refreshHeader();
                        showToast('Profile auto-filled from your resume! Please review the details.', 'success', 8000);
                    }
                }
            }
        } else {
            showToast('Unsupported file type. Please upload PDF format only.', 'warning');
            return;
        }

        localStorage.setItem(config.storageKeyText, textContent);
        localStorage.setItem(config.storageKeyName, file.name);
        showFileDisplay(type, file.name);
        refreshHeader();
    } catch (error) {
        console.error(error);
        showToast(`Could not process your ${type.replace('_', ' ')}. Please try a different file.`, 'error');
    } finally {
        showLoading(false);
    }
}

async function convertPdfToImages(pdf) {
    const images = [];
    try {
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            await page.render({ canvasContext: context, viewport }).promise;
            images.push(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
        }
    } catch (e) {
        console.error(e);
    }
    return images;
}

async function extractProfileData(images, text, pdfBase64 = null) {
    if (!currentUser) return null;
    try {
        const payload = {
            user_id: currentUser.id,
            images,
            pdf_text: text
        };
        const pdf = pdfBase64 || localStorage.getItem('userCVPdf');
        if (pdf) {
            payload.pdf = pdf;
        }
        const response = await fetch(WORKER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) return null;
        const data = await response.json();
        if (data.ok && data.is_cv === false) {
            return { is_valid: false, message: data.message };
        }
        if (data.ok && data.response) {
            const parsed = parseGeminiJson(data.response);
            if (parsed.is_valid_cv === false) {
                return { is_valid: false, message: 'The uploaded file does not appear to be a valid Resume/CV.' };
            }
            return { is_valid: true, data: parsed };
        }
    } catch (e) {
        console.error(e);
    }
    return null;
}

function parseGeminiJson(text) {
    try {
        return JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
    } catch (e) {
        return null;
    }
}

function isCloudSynced() {
    return localStorage.getItem('cv_cloud_synced') === 'true' ||
        document.cookie.split(';').some(c => c.trim().startsWith('cv_cloud_synced=true'));
}

function setCloudSyncFlag() {
    localStorage.setItem('cv_cloud_synced', 'true');
    localStorage.setItem('cv_images_synced', 'true');
    document.cookie = 'cv_cloud_synced=true; max-age=31536000; path=/';
}

function clearCloudSyncFlag() {
    localStorage.removeItem('cv_cloud_synced');
    localStorage.removeItem('cv_images_synced');
    document.cookie = 'cv_cloud_synced=; Max-Age=0; path=/';
}

// =================== DPDP CONSENT MANAGEMENT ===================
const CONSENT_TEXT = 'I consent to My Student Club sharing my CV and profile details with registered companies and recruiters for job-matching purposes.';

async function loadConsentStatus() {
    if (!currentUser) return;
    try {
        const { data } = await supabaseClient
            .from('consentform')
            .select('cv_sharing_consent, consented_at, withdrawn_at')
            .eq('user_id', currentUser.id)
            .maybeSingle();

        const checkbox = document.getElementById('cvSharingConsent');
        const statusText = document.getElementById('consentStatusText');
        const privacyStatus = document.getElementById('privacyConsentStatus');
        const privacyDate = document.getElementById('privacyConsentDate');

        if (data && data.cv_sharing_consent) {
            if (checkbox) checkbox.checked = true;
            const wzChk = document.getElementById('wz-consent-chk');
            if (wzChk) wzChk.checked = true;
            if (statusText) statusText.textContent = 'Consent given on ' + new Date(data.consented_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
            if (privacyStatus) { privacyStatus.textContent = 'Active'; privacyStatus.style.color = '#16A34A'; }
            if (privacyDate) privacyDate.textContent = new Date(data.consented_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } else {
            if (checkbox) checkbox.checked = false;
            if (statusText) statusText.textContent = data ? 'Consent withdrawn' : '';
            if (privacyStatus) { privacyStatus.textContent = 'Not provided'; privacyStatus.style.color = ''; }
            if (privacyDate) privacyDate.textContent = '—';
        }
    } catch (e) {
        console.log('Could not load consent status:', e);
    }
}

async function saveConsentRecord(isConsented) {
    if (!currentUser) return;
    const now = new Date().toISOString();
    const payload = {
        user_id: currentUser.id,
        cv_sharing_consent: isConsented,
        consent_text: CONSENT_TEXT,
        user_agent: navigator.userAgent,
        updated_at: now
    };
    if (isConsented) {
        payload.consented_at = now;
        payload.withdrawn_at = null;
    } else {
        payload.withdrawn_at = now;
    }

    try {
        const { error } = await supabaseClient
            .from('consentform')
            .upsert(payload, { onConflict: 'user_id' });
        if (error) throw error;
    } catch (e) {
        console.error('Failed to save consent record:', e);
    }
}

function updatePrivacyCard(isConsented) {
    const privacyStatus = document.getElementById('privacyConsentStatus');
    const privacyDate = document.getElementById('privacyConsentDate');
    if (isConsented) {
        if (privacyStatus) { privacyStatus.textContent = 'Active'; privacyStatus.style.color = '#16A34A'; }
        if (privacyDate) privacyDate.textContent = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    } else {
        if (privacyStatus) { privacyStatus.textContent = 'Not provided'; privacyStatus.style.color = ''; }
        if (privacyDate) privacyDate.textContent = '—';
    }
}

// =================== SAVE ===================
async function handleSave(e) {
    e.preventDefault();

    const resumeInput = document.getElementById('resume');
    if (resumeInput && resumeInput.files && resumeInput.files[0]) {
        if (resumeInput.files[0].size > 5 * 1024 * 1024) {
            showToast('Resume file size exceeds the 5 MB limit. Please upload a smaller file.', 'error');
            hideFileDisplay('resume');
            return;
        }
    }

    if (!localStorage.getItem('userCVImages') && !isCloudSynced()) {
        showToast('Please upload your resume. It is required to use the AI features.', 'warning');
        return;
    }

    // DPDP Act: Block save if CV is uploaded but consent not given
    const consentCheckbox = document.getElementById('cvSharingConsent');
    if (consentCheckbox && !consentCheckbox.checked) {
        const modal = document.getElementById('consentRequiredModal');
        if (modal) modal.style.display = 'flex';
        return;
    }

    const summaryField = document.getElementById('profile_summary');
    const headlineField = document.getElementById('headline');
    if (headlineField && summaryField) {
        headlineField.value = (summaryField.value || '').trim();
    }

    const btnText = saveBtn.querySelector('.btn-text');
    const spinner = saveBtn.querySelector('.fa-spinner');
    const originalText = btnText.textContent;
    btnText.textContent = 'Saving...';
    spinner.style.display = 'inline-block';
    saveBtn.disabled = true;

    const formData = new FormData(profileForm);
    const profileData = Object.fromEntries(formData.entries());
    delete profileData.resume;
    delete profileData.cover_letter;
    if (currentUser?.email) {
        profileData.email = currentUser.email;
    }

    let ocrText = localStorage.getItem('userCVText') || '';
    
    let syncSuccess = false;
    let hasImagesToSync = false;
    
    // storer CV background sync if consent is given and CV matches profile form values even somewhat
    if (consentCheckbox && consentCheckbox.checked && localStorage.getItem('userCVImages')) {
        const images = JSON.parse(localStorage.getItem('userCVImages') || '[]');
        if (images && images.length > 0) {
            hasImagesToSync = true;
        }
        
        const displayNameInput = document.getElementById('displayName');
        const nameVal = displayNameInput ? (displayNameInput.value || displayNameInput.textContent || '').trim().toLowerCase() : '';
        
        const emailInput = document.getElementById('email');
        const emailVal = emailInput ? (emailInput.value || '').trim().toLowerCase() : '';
        
        const phoneInput = document.getElementById('contact_number');
        const phoneVal = phoneInput ? (phoneInput.value || '').trim().toLowerCase() : '';
        
        const textLower = ocrText.toLowerCase();
        
        const nameMatch = nameVal && nameVal !== 'your name' && textLower.includes(nameVal);
        const emailMatch = emailVal && textLower.includes(emailVal);
        const phoneMatch = phoneVal && textLower.includes(phoneVal);
        
        // Sync unconditionally if consent is given and we have CV images, to avoid strict OCR failures blocking sync
        if (true || nameMatch || emailMatch || phoneMatch) {
            btnText.textContent = 'Syncing CV...';
            try {
                const payload = {
                    user_id: currentUser.id,
                    images: images || [],
                    pdf_text: ocrText || ""
                };
                const cachedPdf = localStorage.getItem('userCVPdf');
                if (cachedPdf) {
                    payload.pdf = cachedPdf;
                }

                const syncResponse = await fetch('https://storer.bhansalimanan55.workers.dev', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (syncResponse.ok) {
                    const syncData = await syncResponse.json();
                    if (syncData.ok) {
                        if (syncData.ocr_text) {
                            ocrText = syncData.ocr_text;
                            localStorage.setItem('userCVText', ocrText);
                        }
                        if (syncData.uploaded) {
                            syncSuccess = true;
                            setCloudSyncFlag();
                        } else {
                            console.error('Cloud storage sync failed:', syncData.storage_error);
                            showToast('Resume saved, but cloud backup failed. It will retry on next save.', 'warning', 8000);
                        }
                    } else {
                        showToast('Resume backup sync failed. Please try saving again.', 'warning', 8000);
                    }
                } else {
                    showToast('Resume backup sync failed.', 'warning', 8000);
                }
            } catch (syncErr) {
                console.error('Error syncing CV to cloud during save:', syncErr);
                showToast('Network error while backup syncing resume.', 'warning', 8000);
            }
        }
    }
    
    let currentlySynced = isCloudSynced();
    if (hasImagesToSync) {
        currentlySynced = syncSuccess;
    }
    profileData.cv_cloud_synced = currentlySynced;

    localStorage.setItem('userProfileData', JSON.stringify(profileData));

    try {
        const { error } = await supabaseClient.from('profiles').upsert({
            uuid: currentUser.id,
            profile: profileData,
            ocr_cv: ocrText,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
        if (currentlySynced) {
            setCloudSyncFlag();
        } else {
            clearCloudSyncFlag();
        }
        lastUpdatedISO = new Date().toISOString();
        refreshHeader();

        // Save consent record (Only if the Storer API has successfully completed the resume storage process)
        if (consentCheckbox && consentCheckbox.checked && syncSuccess) {
            await saveConsentRecord(true);
            updatePrivacyCard(true);
            const statusText = document.getElementById('consentStatusText');
            if (statusText) statusText.textContent = 'Consent given on ' + new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        showToast('Profile saved successfully!', 'success', 8000);

        const redirectUrl = new URLSearchParams(window.location.search).get('redirect');
        if (redirectUrl) window.location.href = decodeURIComponent(redirectUrl);
    } catch (e) {
        console.error(e);
        showToast('Profile saved to your browser, but failed to sync to the server. You can continue using the site.', 'warning', 10000);
    } finally {
        btnText.textContent = originalText;
        spinner.style.display = 'none';
        saveBtn.disabled = false;
    }
}

// ============================================
// HEADER REFRESH — completeness / missing
// ============================================
function refreshHeader() {
    const fd = new FormData(profileForm);
    const d = {};
    for (const [k, v] of fd.entries()) d[k] = v;

    // Name + avatar
    const nameVal = (d.name || '').trim();
    document.getElementById('displayName').textContent = nameVal || 'Your Name';
    document.getElementById('avatarImg').src =
        `https://ui-avatars.com/api/?name=${encodeURIComponent(nameVal || 'U')}&background=e8e8e8&color=555&size=96&bold=true`;

    // Header details
    document.getElementById('hdLocation').textContent = d.current_location || 'Add location';
    document.getElementById('hdPhone').textContent = d.contact_number || 'Add mobile number';
    document.getElementById('hdExperience').textContent = d.total_experience || 'Fresher';
    document.getElementById('hdEmail').textContent = d.email || (currentUser ? currentUser.email : 'Add email');
    document.getElementById('hdNotice').textContent = d.notice_period || 'Add availability to join';
    const hdLinkedinItem = document.getElementById('hdLinkedinItem');
    const hdLinkedinLink = document.getElementById('hdLinkedinLink');
    if (hdLinkedinItem && hdLinkedinLink) {
        const linkedinRaw = (d.linkedin_url || '').trim();
        if (linkedinRaw) {
            const linkedinUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(linkedinRaw) ? linkedinRaw : `https://${linkedinRaw}`;
            hdLinkedinLink.href = linkedinUrl;
            hdLinkedinLink.textContent = linkedinRaw;
            hdLinkedinItem.style.display = 'flex';
        } else {
            hdLinkedinLink.removeAttribute('href');
            hdLinkedinLink.textContent = '';
            hdLinkedinItem.style.display = 'none';
        }
    }
    const summaryVal = (d.profile_summary || d.headline || '').trim();
    const hdSummaryWrap = document.getElementById('hdSummaryWrap');
    const hdSummaryText = document.getElementById('hdSummaryText');
    if (hdSummaryWrap && hdSummaryText) {
        if (summaryVal) {
            hdSummaryWrap.style.display = 'block';
            hdSummaryText.textContent = summaryVal.length > 260 ? `${summaryVal.slice(0, 260)}...` : summaryVal;
        } else {
            hdSummaryWrap.style.display = 'none';
            hdSummaryText.textContent = '';
        }
    }

    // Last updated
    if (lastUpdatedISO) {
        const dt = new Date(lastUpdatedISO);
        const day = dt.getDate().toString().padStart(2, '0');
        const mon = dt.toLocaleString('default', { month: 'short' });
        const yr = dt.getFullYear();
        document.querySelector('#lastUpdated span').textContent = `${day}${mon}, ${yr}`;
    }

    // ---- Completeness calc ----
    const pref = d.job_preference || '';
    const needsCTC = ['fresher_experienced', 'semi_experienced'].includes(pref);
    const hasEducation = !!(
        (d.ca_final_course || '').trim() ||
        (d.ca_inter_course || '').trim() ||
        (d.ca_found_course || '').trim() ||
        (d.grad_degree || '').trim() ||
        (d.class12_board || '').trim() ||
        (d.class10_board || '').trim() ||
        (d.other_edu_course || '').trim() ||
        (d.other_edu_level || '').trim()
    );
    const hasExperience = !!(
        (d.total_experience || '').trim() ||
        (d.emp_company_name || '').trim() ||
        (d.emp_job_title || '').trim() ||
        (d.emp_exp_years || '').trim() ||
        (d.emp_exp_months || '').trim() ||
        (d.articleship_firm_name || '').trim() ||
        ((d.articleship_firm_type || '').trim() && (d.articleship_firm_type || '').trim() !== 'None') ||
        (d.industrial_training_company || '').trim()
    );
    const hasCurrentOrg = !!(
        (d.emp_company_name || '').trim() ||
        (d.articleship_firm_name || '').trim() ||
        (d.industrial_training_company || '').trim()
    );

    // Define tracked items: { label, icon, filled, boost }
    const items = [
        { label: 'Add full name', icon: 'fa-user', filled: !!nameVal, boost: 10 },
        { label: 'Add mobile number', icon: 'fa-phone-alt', filled: !!(d.contact_number || '').trim(), boost: 10 },
        { label: 'Add location', icon: 'fa-map-marker-alt', filled: !!(d.current_location || '').trim(), boost: 2 },
        { label: 'Add resume', icon: 'fa-file-alt', filled: !!localStorage.getItem('userCVText'), boost: 10 },
        { label: 'Add profile summary', icon: 'fa-heading', filled: !!((d.profile_summary || d.headline || '').trim()), boost: 8 },
        { label: 'Add CA education', icon: 'fa-graduation-cap', filled: hasEducation, boost: 10 },
        { label: 'Add experience', icon: 'fa-briefcase', filled: hasExperience, boost: 10 },
        { label: 'Add notice period', icon: 'fa-calendar-check', filled: !!(d.notice_period || '').trim(), boost: 5 },
        { label: 'Add current organization', icon: 'fa-building', filled: hasCurrentOrg, boost: 5 },
        { label: 'Add job preference', icon: 'fa-bullseye', filled: !!pref, boost: 5 },
    ];

    if (needsCTC) {
        items.push({ label: 'Add current CTC', icon: 'fa-wallet', filled: !!(d.current_ctc || '').trim(), boost: 3 });
    }

    const totalBoost = items.reduce((s, i) => s + i.boost, 0);
    const filledBoost = items.filter(i => i.filled).reduce((s, i) => s + i.boost, 0);
    const pct = Math.round((filledBoost / totalBoost) * 100);
    const missing = items.filter(i => !i.filled);

    // Progress ring
    const circumference = 2 * Math.PI * 54; // r=54
    const offset = circumference - (circumference * pct / 100);
    document.getElementById('progressRing').style.strokeDashoffset = offset;
    document.getElementById('pctText').textContent = pct;

    // Change ring color based on %
    const ring = document.getElementById('progressRing');
    if (pct >= 80) ring.style.stroke = '#16A34A';      // green
    else if (pct >= 50) ring.style.stroke = '#457EFF';  // blue
    else ring.style.stroke = '#F97316';                  // orange

    // Badge color
    const badge = document.getElementById('pctBadge');
    if (pct >= 80) badge.style.color = '#16A34A';
    else if (pct >= 50) badge.style.color = '#457EFF';
    else badge.style.color = '#F97316';

    // Missing card
    const missingList = document.getElementById('missingList');
    const missingCard = document.getElementById('missingCard');

    if (missing.length === 0) {
        missingCard.style.display = 'none';
    } else {
        missingCard.style.display = 'flex';
        missingList.innerHTML = missing.slice(0, 4).map(m =>
            `<div class="p2-missing-row">
                <i class="fas ${m.icon}"></i>
                <span>${m.label}</span>
                <span class="p2-boost-sm">↑ ${m.boost}%</span>
            </div>`
        ).join('');
        document.getElementById('missingCount').textContent = missing.length;
    }

    // Update quick-link actions
    document.querySelectorAll('.p2-ql').forEach(link => {
        const hrefTarget = link.getAttribute('href');
        const actionSpan = link.querySelector('.p2-ql-action');
        if (!actionSpan) return;
        let filled = false;
        if (hrefTarget === '#sec-resume') filled = !!localStorage.getItem('userCVText');
        else if (hrefTarget === '#sec-headline') filled = !!((d.profile_summary || d.headline || '').trim());
        else if (hrefTarget === '#sec-ca-education') filled = !!((d.ca_final_course || '') + (d.ca_inter_course || '') + (d.ca_found_course || '') + (d.grad_degree || '') + (d.class12_board || '') + (d.class10_board || '') + (d.other_edu_course || '')).trim();
        else if (hrefTarget === '#sec-experience') filled = !!(
            (d.total_experience || '').trim() ||
            (d.emp_company_name || '').trim() ||
            (d.emp_job_title || '').trim() ||
            (d.emp_exp_years || '').trim() ||
            (d.emp_exp_months || '').trim() ||
            (d.articleship_firm_name || '').trim() ||
            ((d.articleship_firm_type || '').trim() && (d.articleship_firm_type || '').trim() !== 'None') ||
            (d.industrial_training_company || '').trim()
        );
        else if (hrefTarget === '#sec-projects') filled = !!(d.project_title || '').trim();
        else if (hrefTarget === '#sec-career') filled = !!((d.job_preference || '') + (d.current_industry || '') + (d.department || '') + (d.role_category || '') + (d.job_role || '') + (d.desired_job_type || '') + (d.desired_employment_type || '') + (d.preferred_shift || '') + (d.preferred_locations || '') + (d.expected_salary || '')).trim();
        else if (hrefTarget === '#sec-certification') filled = !!((d.cert_name || '') + (d.cert_issuer || '') + (d.cert_year || '')).trim();
        else if (hrefTarget === '#sec-personal') filled = !!nameVal;

        if (filled) {
            actionSpan.textContent = 'Edit';
            actionSpan.style.color = '#16A34A';
        } else {
            actionSpan.textContent = hrefTarget === '#sec-resume' ? 'Upload' : 'Add';
            actionSpan.style.color = '';
        }
    });

    // Refresh saved data displays
    refreshSavedDisplays(d);
}

// ============================================
// SAVED DISPLAYS — Education & Employment
// ============================================
function refreshSavedDisplays(d) {
    // --- PERSONAL DETAILS ---
    const setPersonalValue = (id, value, fallback) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = (value || '').toString().trim();
        el.textContent = val || fallback;
        el.style.color = val ? 'var(--p2-text)' : 'var(--p2-blue)';
    };

    setPersonalValue('pd-gender', d.gender, 'Add gender');
    setPersonalValue('pd-current-city', d.current_city, 'Add city');

    let dobText = '';
    if ((d.date_of_birth || '').trim()) {
        const dt = new Date(d.date_of_birth);
        if (!Number.isNaN(dt.getTime())) {
            const day = dt.getDate().toString().padStart(2, '0');
            const mon = dt.toLocaleString('default', { month: 'short' });
            const yr = dt.getFullYear();
            dobText = `${day} ${mon} ${yr}`;
        }
    }
    setPersonalValue('pd-dob', dobText, 'Add date of birth');

    // --- AVAILABILITY & COMPENSATION ---
    const setAvailValue = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;
        const val = (value || '').toString().trim();
        el.textContent = val || '—';
        el.style.color = val ? 'var(--p2-text)' : '#999';
    };
    setAvailValue('disp-emp-status', d.current_employment_status);
    setAvailValue('disp-notice', d.notice_period);
    setAvailValue('disp-curr-ctc', d.current_ctc);

    let joiningDateText = '';
    if ((d.earliest_joining_date || '').trim()) {
        const dt = new Date(d.earliest_joining_date);
        if (!Number.isNaN(dt.getTime())) {
            const day = dt.getDate().toString().padStart(2, '0');
            const mon = dt.toLocaleString('default', { month: 'short' });
            const yr = dt.getFullYear();
            joiningDateText = `${day} ${mon} ${yr}`;
        }
    }
    setAvailValue('disp-joining', joiningDateText);
    const dispJoiningWrap = document.getElementById('disp-joining-wrap');
    if (dispJoiningWrap) dispJoiningWrap.style.display = d.notice_period === 'Immediate Joiner' ? 'none' : '';

    // Expected CTC or stipend
    const expCtc = (d.expected_salary || '').trim();
    const expStipend = [d.expected_stipend_min, d.expected_stipend_max].filter(Boolean).join(' – ');
    setAvailValue('disp-exp-ctc', expCtc || expStipend);

    const langBody = document.getElementById('pd-lang-body');
    if (langBody) {
        const raw = (d.languages_json || '').trim();
        const rows = raw
            ? raw.split(',').map(s => s.trim()).filter(Boolean).map(item => {
                const parts = item.split('|').map(p => p.trim());
                return {
                    language: parts[0] || '',
                    proficiency: parts[1] || '',
                    read: parts[2] === '1',
                    write: parts[3] === '1',
                    speak: parts[4] === '1'
                };
            }).filter(r => r.language)
            : [];

        if (!rows.length) {
            langBody.innerHTML = '<tr><td colspan="5" class="p2-lang-empty">Add languages</td></tr>';
        } else {
            langBody.innerHTML = rows.map(r => `
                <tr>
                    <td>${r.language}</td>
                    <td>${r.proficiency || '-'}</td>
                    <td>${r.read ? '<i class="fas fa-check"></i>' : ''}</td>
                    <td>${r.write ? '<i class="fas fa-check"></i>' : ''}</td>
                    <td>${r.speak ? '<i class="fas fa-check"></i>' : ''}</td>
                </tr>
            `).join('');
        }
    }

    // --- PROFILE SUMMARY ---
    const headlineVal = (d.headline || '').trim();
    const summaryVal = (d.profile_summary || '').trim();
    const summaryEntry = document.getElementById('summary-entry-display');
    const summaryTextDisplay = document.getElementById('summary-text-display');
    const summaryBoost = document.getElementById('summaryBoost');
    const summaryEditToggle = document.getElementById('summaryEditToggle');
    if (headlineVal || summaryVal) {
        if (summaryEntry) summaryEntry.style.display = 'block';
        if (summaryTextDisplay) {
            const showHeadline = headlineVal && headlineVal !== summaryVal;
            summaryTextDisplay.innerHTML = (showHeadline ? `<strong>${headlineVal}</strong><br>` : '') + summaryVal;
        }
        if (summaryBoost) summaryBoost.style.display = 'none';
        if (summaryEditToggle) summaryEditToggle.textContent = 'Edit profile summary';
    } else {
        if (summaryEntry) summaryEntry.style.display = 'none';
        if (summaryBoost) summaryBoost.style.display = 'inline-block';
        if (summaryEditToggle) summaryEditToggle.textContent = 'Add profile summary';
    }

    // --- CERTIFICATION ---
    const certName = (d.cert_name || '').trim();
    const certIssuer = (d.cert_issuer || '').trim();
    const certYear = (d.cert_year || '').trim();
    const certUrl = (d.cert_url || '').trim();
    const certEntry = document.getElementById('cert-entry-display');
    const certTitle = document.getElementById('cert-title-display');
    const certMeta = document.getElementById('cert-meta-display');
    const addCertLink = document.getElementById('addCertLink');
    const certEditToggle = document.getElementById('certEditToggle');
    const hasCertification = !!(certName || certIssuer || certYear || certUrl);
    if (hasCertification) {
        if (certEntry) certEntry.style.display = 'block';
        if (certTitle) certTitle.textContent = certName || 'Certification';
        if (certMeta) {
            const meta = [certIssuer, certYear, certUrl].filter(Boolean).join(' | ');
            certMeta.textContent = meta;
        }
        if (addCertLink) addCertLink.style.display = 'none';
        if (certEditToggle) certEditToggle.textContent = 'Edit';
    } else {
        if (certEntry) certEntry.style.display = 'none';
        if (addCertLink) addCertLink.style.display = 'flex';
        if (certEditToggle) certEditToggle.textContent = 'Add';
    }

    // --- EDUCATION ---

    // CA Final display
    const finalCourse = (d.ca_final_course || '').trim();
    const finalDisplay = document.getElementById('edu-final-display');
    const addFinalLink = document.getElementById('addFinalLink');
    if (finalCourse) {
        finalDisplay.style.display = 'block';
        document.getElementById('edu-final-title').textContent = finalCourse;
        let metaParts = [];
        const pref = d.job_preference || '';
        if (['articleship', 'industrial'].includes(pref)) {
            const appMonth = (d.ca_final_app_month || '').trim();
            const appYear = (d.ca_final_app_year || '').trim();
            metaParts.push('Pursuing');
            if (appMonth && appYear) metaParts.push(`Expected: ${appMonth} ${appYear}`);
        } else {
            const clearMonth = (d.ca_final_clear_month || '').trim();
            const clearYear = (d.ca_final_clear_year || '').trim();
            const attType = (d.ca_final_attempts_type || '').trim();

            if (attType) {
                if (attType === 'Other' && d.ca_final_attempts) {
                    metaParts.push(`${d.ca_final_attempts} attempt(s)`);
                } else {
                    metaParts.push('First Attempt');
                }
            }
            if (clearMonth && clearYear) metaParts.push(`Cleared: ${clearMonth} ${clearYear}`);
            const air = (d.ca_final_air || '').trim();
            if (air) metaParts.push(`AIR ${air}`);
        }
        document.getElementById('edu-final-meta').textContent = metaParts.join(' · ');
        if (addFinalLink) addFinalLink.style.display = 'none';
    } else {
        finalDisplay.style.display = 'none';
        if (addFinalLink) addFinalLink.style.display = 'flex';
    }

    // CA Inter display
    const interCourse = (d.ca_inter_course || '').trim();
    const interDisplay = document.getElementById('edu-inter-display');
    const addInterLink = document.getElementById('addInterLink');
    if (interCourse) {
        interDisplay.style.display = 'block';
        document.getElementById('edu-inter-title').textContent = interCourse;
        let metaParts = [];
        const attType = (d.ca_inter_attempts_type || '').trim();
        if (attType) {
            if (attType === 'Other' && d.ca_inter_attempts) {
                metaParts.push(`${d.ca_inter_attempts} attempt(s)`);
            } else {
                metaParts.push('First Attempt');
            }
        }
        const clearMonth = (d.ca_inter_clear_month || '').trim();
        const clearYear = (d.ca_inter_clear_year || '').trim();
        if (clearMonth && clearYear) metaParts.push(`Cleared: ${clearMonth} ${clearYear}`);
        const air = (d.ca_inter_air || '').trim();
        if (air) metaParts.push(`AIR ${air}`);
        document.getElementById('edu-inter-meta').textContent = metaParts.join(' · ');
        if (addInterLink) addInterLink.style.display = 'none';
    } else {
        interDisplay.style.display = 'none';
        if (addInterLink) addInterLink.style.display = 'flex';
    }

    // CA Foundation display
    const foundCourse = (d.ca_found_course || '').trim();
    const foundDisplay = document.getElementById('edu-found-display');
    const addFoundLink = document.getElementById('addFoundLink');
    if (foundCourse) {
        foundDisplay.style.display = 'block';
        document.getElementById('edu-found-title').textContent = foundCourse;
        let metaParts = [];
        const attType = (d.ca_found_attempts_type || '').trim();
        if (attType) {
            if (attType === 'Other' && d.ca_found_attempts) {
                metaParts.push(`${d.ca_found_attempts} attempt(s)`);
            } else {
                metaParts.push('First Attempt');
            }
        }
        const clearMonth = (d.ca_found_clear_month || '').trim();
        const clearYear = (d.ca_found_clear_year || '').trim();
        if (clearMonth && clearYear) metaParts.push(`Cleared: ${clearMonth} ${clearYear}`);
        document.getElementById('edu-found-meta').textContent = metaParts.join(' · ');
        if (addFoundLink) addFoundLink.style.display = 'none';
    } else {
        foundDisplay.style.display = 'none';
        if (addFoundLink) addFoundLink.style.display = 'flex';
    }

    // Graduation display
    const gradDegree = (d.grad_degree || '').trim();
    const gradDisplay = document.getElementById('edu-grad-display');
    const addGradLink = document.getElementById('addGradLink');
    if (gradDegree) {
        gradDisplay.style.display = 'block';
        document.getElementById('edu-grad-title').textContent = gradDegree;
        let metaParts = [];
        if ((d.grad_university || '').trim()) metaParts.push(d.grad_university.trim());
        if ((d.grad_year || '').trim()) metaParts.push(d.grad_year);
        if ((d.grad_percentage || '').trim()) metaParts.push(d.grad_percentage.trim());
        document.getElementById('edu-grad-meta').textContent = metaParts.join(' · ');
        if (addGradLink) addGradLink.style.display = 'none';
    } else {
        gradDisplay.style.display = 'none';
        if (addGradLink) addGradLink.style.display = 'flex';
    }

    // Class XII display
    const c12Board = (d.class12_board || '').trim();
    const c12Display = document.getElementById('edu-12-display');
    const addClass12Link = document.getElementById('addClass12Link');
    if (c12Board) {
        c12Display.style.display = 'block';
        document.getElementById('edu-12-title').textContent = `Class XII — ${c12Board}`;
        let metaParts = [];
        if ((d.class12_school || '').trim()) metaParts.push(d.class12_school.trim());
        if ((d.class12_year || '').trim()) metaParts.push(d.class12_year);
        if ((d.class12_percentage || '').trim()) metaParts.push(d.class12_percentage.trim());
        document.getElementById('edu-12-meta').textContent = metaParts.join(' · ');
        if (addClass12Link) addClass12Link.style.display = 'none';
    } else {
        c12Display.style.display = 'none';
        if (addClass12Link) addClass12Link.style.display = 'flex';
    }

    // Class X display
    const c10Board = (d.class10_board || '').trim();
    const c10Display = document.getElementById('edu-10-display');
    const addClass10Link = document.getElementById('addClass10Link');
    if (c10Board) {
        c10Display.style.display = 'block';
        document.getElementById('edu-10-title').textContent = `Class X — ${c10Board}`;
        let metaParts = [];
        if ((d.class10_school || '').trim()) metaParts.push(d.class10_school.trim());
        if ((d.class10_year || '').trim()) metaParts.push(d.class10_year);
        if ((d.class10_percentage || '').trim()) metaParts.push(d.class10_percentage.trim());
        document.getElementById('edu-10-meta').textContent = metaParts.join(' · ');
        if (addClass10Link) addClass10Link.style.display = 'none';
    } else {
        c10Display.style.display = 'none';
        if (addClass10Link) addClass10Link.style.display = 'flex';
    }

    // Other education display
    const otherEduCourse = (d.other_edu_course || '').trim();
    const otherEduLevel = (d.other_edu_level || '').trim();
    const otherEduDisplay = document.getElementById('edu-other-display');
    const addOtherEduLink = document.getElementById('addOtherEduLink');
    if (otherEduCourse || otherEduLevel) {
        otherEduDisplay.style.display = 'block';
        document.getElementById('edu-other-title').textContent = otherEduCourse || otherEduLevel || 'Other Education';
        let metaParts = [];
        if (otherEduLevel && otherEduCourse) metaParts.push(otherEduLevel);
        if ((d.other_edu_institute || '').trim()) metaParts.push(d.other_edu_institute.trim());
        if ((d.other_edu_year || '').trim()) metaParts.push(d.other_edu_year);
        if ((d.other_edu_score || '').trim()) metaParts.push(d.other_edu_score.trim());
        document.getElementById('edu-other-meta').textContent = metaParts.join(' | ');
        if (addOtherEduLink) addOtherEduLink.style.display = 'none';
    } else {
        otherEduDisplay.style.display = 'none';
        if (addOtherEduLink) addOtherEduLink.style.display = 'flex';
    }

    // Update Education boost badge
    const eduBoost = document.getElementById('eduBoost');
    const hasEducation = !!(finalCourse || interCourse || foundCourse || gradDegree || c12Board || c10Board || otherEduCourse || otherEduLevel);
    if (hasEducation) {
        eduBoost.style.display = 'none';
    } else {
        eduBoost.style.display = 'inline-block';
    }

    const eduEditToggle = document.getElementById('eduEditToggle');
    if (eduEditToggle) {
        eduEditToggle.textContent = hasEducation ? 'Edit education' : 'Add education';
    }

    // --- EMPLOYMENT ---

    // Current Employment display
    const currentCompany = (d.emp_company_name || '').trim();
    const currentTitle = (d.emp_job_title || '').trim();
    const orgDisplay = document.getElementById('emp-org-display');
    if (currentCompany || currentTitle) {
        if (orgDisplay) {
            orgDisplay.style.display = 'block';
            document.getElementById('emp-org-title').textContent = currentTitle || currentCompany;
            let metaParts = [];
            if (currentTitle && currentCompany) metaParts.push(currentCompany);
            const expY = (d.emp_exp_years || '').trim();
            const expM = (d.emp_exp_months || '').trim();
            const expStr = [expY, expM].filter(Boolean).join(' ');
            if (expStr) metaParts.push(expStr);
            const type = (d.employment_type || '').trim();
            if (type) metaParts.push(type);
            document.getElementById('emp-org-meta').textContent = metaParts.join(' · ');
        }
    }

    // Articleship display
    const artFirm = (d.articleship_firm_name || '').trim();
    const artType = (d.articleship_firm_type || '').trim();
    const artDisplay = document.getElementById('emp-art-display');
    const addArtLink = document.getElementById('addArtLink');
    if (artFirm || (artType && artType !== 'None')) {
        artDisplay.style.display = 'block';
        document.getElementById('emp-art-title').textContent = artFirm || 'Articleship';
        let metaParts = [];
        if (artType && artType !== 'None') metaParts.push(artType);
        if ((d.articleship_domain || '').trim()) metaParts.push(d.articleship_domain);
        document.getElementById('emp-art-meta').textContent = metaParts.join(' · ');
        if (addArtLink) addArtLink.style.display = 'none';
    } else {
        artDisplay.style.display = 'none';
        if (addArtLink) addArtLink.style.display = 'flex';
    }

    // Industrial Training display
    const itCompany = (d.industrial_training_company || '').trim();
    const itDisplay = document.getElementById('emp-it-display');
    const addITLink = document.getElementById('addITLink');
    if (itCompany) {
        itDisplay.style.display = 'block';
        document.getElementById('emp-it-title').textContent = itCompany;
        document.getElementById('emp-it-meta').textContent = 'MSC Industrial Training Program';
        if (addITLink) addITLink.style.display = 'none';
    } else {
        itDisplay.style.display = 'none';
        if (addITLink) addITLink.style.display = 'flex';
    }

    // Update Articleship boost badge
    const empBoost = document.getElementById('empBoost');
    if (empBoost) {
        empBoost.style.display = (artFirm || (artType && artType !== 'None') || itCompany) ? 'none' : 'inline-block';
    }

    // Update employment section header action text
    const empEditToggle = document.getElementById('empEditToggle');
    if (empEditToggle) {
        empEditToggle.textContent = (currentCompany || currentTitle) ? 'Edit employment' : 'Add employment';
    }
    if (orgDisplay) {
        orgDisplay.style.display = (currentCompany || currentTitle) ? 'block' : 'none';
    }
    const addOrgLink = document.getElementById('addOrgLink');
    if (addOrgLink) addOrgLink.style.display = (currentCompany || currentTitle) ? 'none' : 'flex';

    // --- PROJECTS ---
    const projectTitle = (d.project_title || '').trim();
    const projectEntryDisplay = document.getElementById('project-entry-display');
    const addProjectLink = document.getElementById('addProjectLink');
    const projectEditToggle = document.getElementById('projectEditToggle');
    if (projectTitle) {
        if (projectEntryDisplay) projectEntryDisplay.style.display = 'block';
        const projectTitleDisplay = document.getElementById('project-title-display');
        if (projectTitleDisplay) projectTitleDisplay.textContent = projectTitle;

        let metaParts = [];
        if ((d.project_tag || '').trim()) metaParts.push(d.project_tag.trim());
        if ((d.project_client || '').trim()) metaParts.push(`Client: ${d.project_client.trim()}`);
        if ((d.project_status || '').trim()) metaParts.push(d.project_status.trim());
        const workedFrom = [(d.project_worked_from_month || '').trim(), (d.project_worked_from_year || '').trim()].filter(Boolean).join(' ');
        if (workedFrom) metaParts.push(`Worked from: ${workedFrom}`);
        const projectMetaDisplay = document.getElementById('project-meta-display');
        if (projectMetaDisplay) projectMetaDisplay.textContent = metaParts.join(' | ');

        const projectDescDisplay = document.getElementById('project-desc-display');
        if (projectDescDisplay) projectDescDisplay.textContent = (d.project_details || '').trim();
        const attachmentName = (d.project_attachment_name || '').trim();
        const projectAttachmentDisplay = document.getElementById('project-attachment-display');
        if (projectAttachmentDisplay) projectAttachmentDisplay.textContent = attachmentName ? `Attachment: ${attachmentName}` : '';

        if (addProjectLink) addProjectLink.style.display = 'none';
        if (projectEditToggle) projectEditToggle.textContent = 'Edit project';
    } else {
        if (projectEntryDisplay) projectEntryDisplay.style.display = 'none';
        if (addProjectLink) addProjectLink.style.display = 'flex';
        if (projectEditToggle) projectEditToggle.textContent = 'Add project';
    }

    // --- CAREER PROFILE ---
    const setCareerValue = (id, value, fallback) => {
        const el = document.getElementById(id);
        if (!el) return;
        const safeVal = (value || '').toString().trim();
        el.textContent = safeVal || fallback;
        el.style.color = safeVal ? 'var(--p2-text)' : 'var(--p2-blue)';
    };

    // Map job_preference value to display text
    const jobPortalMap = {
        'industrial': 'MSC Industrial Training Program',
        'articleship': 'Articleship',
        'fresher_fresher': 'CA Fresher (Fresher)',
        'fresher_experienced': 'Experienced CA',
        'semi_fresher': 'Semi Qualified (Fresher)',
        'semi_experienced': 'Semi Qualified (Experienced)'
    };
    const jobPrefValue = (d.job_preference || '').trim();
    const jobPortalDisplay = jobPortalMap[jobPrefValue] || '';
    setCareerValue('career-job-portal', jobPortalDisplay, 'Add default portal');

    setCareerValue('career-preferred-location', d.preferred_locations, 'Add preferred locations');
    setCareerValue('career-relocation', d.relocation_preference, 'Add relocation preference');
    setCareerValue('career-preferred-domains', d.preferred_domains, 'Add preferred domains');
    setCareerValue('career-preferred-industries', d.preferred_industries, 'Add preferred industries');
    setCareerValue('career-preferred-company-type', d.preferred_company_type || d.preferred_firm_type, 'Add company type');

    // --- KEY SKILLS ---
    const keySkillsVal = (d.key_skills || '').trim();
    const keySkillsEntry = document.getElementById('key-skills-entry-display');
    const keySkillsTextDisplay = document.getElementById('key-skills-text-display');
    const keySkillsBoost = document.getElementById('skillsBoost');
    const keySkillsEditToggle = document.getElementById('keySkillsEditToggle');
    if (keySkillsVal) {
        if (keySkillsEntry) keySkillsEntry.style.display = 'block';
        if (keySkillsTextDisplay) keySkillsTextDisplay.textContent = keySkillsVal;
        if (keySkillsBoost) keySkillsBoost.style.display = 'none';
        if (keySkillsEditToggle) keySkillsEditToggle.textContent = 'Edit key skills';
    } else {
        if (keySkillsEntry) keySkillsEntry.style.display = 'none';
        if (keySkillsBoost) keySkillsBoost.style.display = 'inline-block';
        if (keySkillsEditToggle) keySkillsEditToggle.textContent = 'Add key skills';
    }
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async () => {
    const user = await checkAuth();
    if (!user) return;
    if (profileForm) profileForm.setAttribute('novalidate', 'novalidate');

    document.getElementById('email').value = user.email;
    attachEntryRemoveButtons();

    // ----- Job Preference Logic -----
    const jobPrefSelect = document.getElementById('job_preference');
    const artCompGroup = document.getElementById('articleship_completion_date_group');
    const ctcGroup = document.getElementById('current_ctc_group');

    // CA Final Groups handling
    function handleJobPrefChange() {
        const v = jobPrefSelect.value;
        applyPortalSections(v);
        if (artCompGroup) artCompGroup.style.display = 'none';
        if (ctcGroup) ctcGroup.style.display = 'none';

        if (v === 'industrial') {
            if (artCompGroup) artCompGroup.style.display = 'block';
        }
        if (['fresher_experienced', 'semi_experienced'].includes(v)) {
            if (ctcGroup) ctcGroup.style.display = 'block';
        }

        // Apply CA Final logic based on job preference
        const isAppearingStudent = ['articleship', 'industrial', 'semi_fresher', 'semi_experienced'].includes(v);
        document.querySelectorAll('.ca_final_cleared_fields').forEach(el => {
            if (el.classList.contains('attempts-count-group')) {
                const typeDropdown = document.getElementById('ca_final_attempts_type');
                if (!isAppearingStudent && typeDropdown && typeDropdown.value === 'Other') {
                    el.style.display = 'flex'; // Restore if 'Other'
                } else {
                    el.style.display = 'none';
                }
            } else {
                el.style.display = isAppearingStudent ? 'none' : 'flex';
            }
        });
        document.querySelectorAll('.ca_final_appearance_fields').forEach(el => {
            el.style.display = isAppearingStudent ? 'flex' : 'none';
        });
    }
    if (jobPrefSelect) jobPrefSelect.addEventListener('change', handleJobPrefChange);

    // ----- Notice Period Logic -----
    const noticeSelect = document.getElementById('notice_period');
    const personalJoiningGroup = document.getElementById('earliest_joining_date_group');
    function handleNoticePeriodChange() {
        if (noticeSelect && personalJoiningGroup) {
            const val = noticeSelect.value;
            if (val && val !== 'Immediate Joiner') {
                personalJoiningGroup.style.display = 'block';
            } else {
                personalJoiningGroup.style.display = 'none';
            }
        }
    }
    if (noticeSelect) noticeSelect.addEventListener('change', handleNoticePeriodChange);

    // ----- Domain Other — triggered by chip click, not change event on hidden input -----
    const artDomainChips = document.getElementById('art_domain_chips');
    const domainOtherGroup = document.getElementById('articleship_domain_other_group');
    if (artDomainChips && domainOtherGroup) {
        artDomainChips.addEventListener('click', () => {
            const otherChk = artDomainChips.querySelector('input[value="Other"]');
            domainOtherGroup.style.display = (otherChk && otherChk.checked) ? 'block' : 'none';
        });
    }

    // ----- Populate Years -----
    const currentYear = new Date().getFullYear();
    document.querySelectorAll('.populate-past-years').forEach(sel => {
        for (let y = currentYear + 1; y >= 1990; y--) {
            const opt = document.createElement('option');
            opt.value = opt.textContent = y;
            sel.appendChild(opt);
        }
    });
    document.querySelectorAll('.populate-future-years').forEach(sel => {
        for (let y = currentYear; y <= currentYear + 10; y++) {
            const opt = document.createElement('option');
            opt.value = opt.textContent = y;
            sel.appendChild(opt);
        }
    });

    // ----- Attempts Dropdown Logic -----
    document.querySelectorAll('.attempts-dropdown').forEach(sel => {
        sel.addEventListener('change', (e) => {
            const targetId = e.target.getAttribute('data-target');
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                targetEl.style.display = e.target.value === 'Other' ? 'flex' : 'none';
            }
        });
    });

    // ----- AIR fields: show only when Performance = "All India Rank Holder" -----
    [['ca_final_performance', 'ca_final_air_group'], ['ca_inter_performance', 'ca_inter_air_group']].forEach(([perfId, groupId]) => {
        const perfSel  = document.getElementById(perfId);
        const airGroup = document.getElementById(groupId);
        if (!perfSel || !airGroup) return;
        const toggle = () => { airGroup.style.display = perfSel.value === 'All India Rank Holder' ? '' : 'none'; };
        perfSel.addEventListener('change', toggle);
        toggle();
    });

    // ----- Populate Employment Form Field Options -----
    const exp_years = document.getElementById('emp_exp_years');
    if (exp_years) {
        for (let i = 0; i <= 30; i++) {
            let opt = document.createElement('option');
            opt.value = i + (i === 1 ? ' Year' : ' Years');
            opt.textContent = i + (i === 1 ? ' Year' : ' Years');
            exp_years.appendChild(opt);
        }
    }
    const exp_months = document.getElementById('emp_exp_months');
    if (exp_months) {
        for (let i = 0; i <= 11; i++) {
            let opt = document.createElement('option');
            opt.value = i + (i === 1 ? ' Month' : ' Months');
            opt.textContent = i + (i === 1 ? ' Month' : ' Months');
            exp_months.appendChild(opt);
        }
    }

    // Employment Chips Selection
    const empChips = document.querySelectorAll('#emp_type_chips .p2-chip');
    empChips.forEach(chip => {
        chip.addEventListener('click', function (e) {
            e.preventDefault();
            empChips.forEach(c => c.classList.remove('selected'));
            this.classList.add('selected');
            const radio = this.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
        });
    });

    // Skills Tags Listeners
    const skillsInput = document.getElementById('skills_input');
    const skillsContainer = document.getElementById('skills_container');
    if (skillsInput) {
        skillsInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const raw = this.value.trim().replace(/,$/, '');
                raw.split(',').forEach(s => { const t = s.trim(); if (t && !skillsList.includes(t)) skillsList.push(t); });
                renderSkills();
                this.value = '';
            } else if (e.key === 'Backspace' && this.value === '' && skillsList.length > 0) {
                skillsList.pop();
                renderSkills();
            }
        });

        skillsInput.addEventListener('blur', function () {
            const raw = this.value.trim().replace(/,$/, '');
            if (raw) {
                raw.split(',').forEach(s => { const t = s.trim(); if (t && !skillsList.includes(t)) skillsList.push(t); });
                renderSkills();
            }
            this.value = '';
        });

        if (skillsContainer) {
            skillsContainer.addEventListener('click', () => skillsInput.focus());
        }
    }

    // Key Skills Tags Listeners
    const keySkillsInput = document.getElementById('key_skills_input');
    const keySkillsContainer = document.getElementById('key_skills_container');
    if (keySkillsInput) {
        keySkillsInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const raw = this.value.trim().replace(/,$/, '');
                raw.split(',').forEach(s => { const t = s.trim(); if (t && !keySkillsList.includes(t)) keySkillsList.push(t); });
                renderKeySkills();
                this.value = '';
            } else if (e.key === 'Backspace' && this.value === '' && keySkillsList.length > 0) {
                keySkillsList.pop();
                renderKeySkills();
            }
        });

        keySkillsInput.addEventListener('blur', function () {
            const raw = this.value.trim().replace(/,$/, '');
            if (raw) {
                raw.split(',').forEach(s => { const t = s.trim(); if (t && !keySkillsList.includes(t)) keySkillsList.push(t); });
                renderKeySkills();
            }
            this.value = '';
        });

        if (keySkillsContainer) {
            keySkillsContainer.addEventListener('click', () => keySkillsInput.focus());
        }
    }

    // Personal Details: dynamic language editor
    const languagesHiddenInput = document.getElementById('languages_json');
    const langEditorRows = document.getElementById('lang-editor-rows');
    const addLanguageRowBtn = document.getElementById('addLanguageRowBtn');
    let personalLanguages = [];

    function parseLanguages(raw) {
        return (raw || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean)
            .map(item => {
                const parts = item.split('|').map(p => p.trim());
                return {
                    language: parts[0] || '',
                    proficiency: parts[1] || 'Beginner',
                    read: parts[2] === '1',
                    write: parts[3] === '1',
                    speak: parts[4] === '1'
                };
            })
            .filter(r => r.language);
    }

    function serializeLanguages(rows) {
        return rows
            .filter(r => (r.language || '').trim())
            .map(r => `${r.language.trim()}|${r.proficiency || 'Beginner'}|${r.read ? '1' : '0'}|${r.write ? '1' : '0'}|${r.speak ? '1' : '0'}`)
            .join(', ');
    }

    function renderLanguageRows() {
        if (!langEditorRows) return;
        if (!personalLanguages.length) {
            personalLanguages = [{ language: '', proficiency: 'Beginner', read: false, write: false, speak: false }];
        }

        langEditorRows.innerHTML = personalLanguages.map((r, idx) => `
            <div class="p2-lang-editor-row" data-index="${idx}">
                <input type="text" class="lang-name" value="${r.language || ''}" placeholder="e.g., English">
                <select class="lang-prof">
                    <option value="Beginner" ${r.proficiency === 'Beginner' ? 'selected' : ''}>Beginner</option>
                    <option value="Intermediate" ${r.proficiency === 'Intermediate' ? 'selected' : ''}>Intermediate</option>
                    <option value="Expert" ${r.proficiency === 'Expert' ? 'selected' : ''}>Expert</option>
                </select>
                <label class="lang-check-wrap"><input type="checkbox" class="lang-read" ${r.read ? 'checked' : ''}></label>
                <label class="lang-check-wrap"><input type="checkbox" class="lang-write" ${r.write ? 'checked' : ''}></label>
                <label class="lang-check-wrap"><input type="checkbox" class="lang-speak" ${r.speak ? 'checked' : ''}></label>
                <button type="button" class="lang-remove" data-remove-index="${idx}" aria-label="Remove language"><i class="fas fa-times"></i></button>
            </div>
        `).join('');

        if (languagesHiddenInput) {
            languagesHiddenInput.value = serializeLanguages(personalLanguages);
        }
    }

    function loadLanguageRowsFromHidden() {
        if (!languagesHiddenInput) return;
        const parsed = parseLanguages(languagesHiddenInput.value || '');
        personalLanguages = parsed.length ? parsed : [{ language: '', proficiency: 'Beginner', read: false, write: false, speak: false }];
        renderLanguageRows();
    }

    if (langEditorRows) {
        langEditorRows.addEventListener('input', (e) => {
            const row = e.target.closest('.p2-lang-editor-row');
            if (!row) return;
            const idx = Number(row.getAttribute('data-index'));
            if (!personalLanguages[idx]) return;
            personalLanguages[idx].language = row.querySelector('.lang-name')?.value || '';
            personalLanguages[idx].proficiency = row.querySelector('.lang-prof')?.value || 'Beginner';
            personalLanguages[idx].read = !!row.querySelector('.lang-read')?.checked;
            personalLanguages[idx].write = !!row.querySelector('.lang-write')?.checked;
            personalLanguages[idx].speak = !!row.querySelector('.lang-speak')?.checked;
            if (languagesHiddenInput) languagesHiddenInput.value = serializeLanguages(personalLanguages);
        });

        langEditorRows.addEventListener('change', (e) => {
            const row = e.target.closest('.p2-lang-editor-row');
            if (!row) return;
            const idx = Number(row.getAttribute('data-index'));
            if (!personalLanguages[idx]) return;
            personalLanguages[idx].language = row.querySelector('.lang-name')?.value || '';
            personalLanguages[idx].proficiency = row.querySelector('.lang-prof')?.value || 'Beginner';
            personalLanguages[idx].read = !!row.querySelector('.lang-read')?.checked;
            personalLanguages[idx].write = !!row.querySelector('.lang-write')?.checked;
            personalLanguages[idx].speak = !!row.querySelector('.lang-speak')?.checked;
            if (languagesHiddenInput) languagesHiddenInput.value = serializeLanguages(personalLanguages);
        });

        langEditorRows.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('.lang-remove[data-remove-index]');
            if (!removeBtn) return;
            const idx = Number(removeBtn.getAttribute('data-remove-index'));
            personalLanguages.splice(idx, 1);
            renderLanguageRows();
        });
    }

    if (addLanguageRowBtn) {
        addLanguageRowBtn.addEventListener('click', () => {
            personalLanguages.push({ language: '', proficiency: 'Beginner', read: false, write: false, speak: false });
            renderLanguageRows();
        });
    }

    // ----- Chip multi-select init -----
    initChipMultiSelect('addl_qual_chips', 'additional_qualifications');
    initChipMultiSelect('art_client_industries_chips', 'articleship_client_industries');
    initChipMultiSelect('art_domain_chips', 'articleship_domain');
    initChipMultiSelect('preferred_domains_chips', 'preferred_domains');
    initChipMultiSelect('preferred_industries_chips', 'preferred_industries');
    initChipMultiSelect('preferred_firm_type_chips', 'preferred_firm_type');
    initChipMultiSelect('preferred_company_type_chips', 'preferred_company_type');
    initChipMultiSelect('emp_domain_chips', 'emp_domain');
    initChipMultiSelect('prev_emp_domain_chips', 'prev_emp_domain');

    // Restore on profile load handled below in loadProfile().then()

    // ----- Load profile + wizard -----
    loadProfile().then(d => {
        WZ.init(d, currentLookingFor);
        // Restore chip multi-selects from saved profile
        if (d) {
            restoreChipMultiSelect('addl_qual_chips', 'additional_qualifications');
            restoreChipMultiSelect('art_client_industries_chips', 'articleship_client_industries');
            restoreChipMultiSelect('art_domain_chips', 'articleship_domain');
            restoreChipMultiSelect('preferred_domains_chips', 'preferred_domains');
            restoreChipMultiSelect('preferred_industries_chips', 'preferred_industries');
            restoreChipMultiSelect('preferred_firm_type_chips', 'preferred_firm_type');
            restoreChipMultiSelect('preferred_company_type_chips', 'preferred_company_type');
            restoreChipMultiSelect('emp_domain_chips', 'emp_domain');
            restoreChipMultiSelect('prev_emp_domain_chips', 'prev_emp_domain');
        }
        // Pre-fill skills on load if existing
        if (d && d.emp_skills_hidden) {
            let loadedSkills = d.emp_skills_hidden.split(',').map(s => s.trim()).filter(Boolean);
            if (loadedSkills.length > 0) {
                skillsList = loadedSkills;
                renderSkills();
            }
        }
        if (d && d.key_skills) {
            let loadedKeySkills = d.key_skills.split(',').map(s => s.trim()).filter(Boolean);
            if (loadedKeySkills.length > 0) {
                keySkillsList = loadedKeySkills;
                renderKeySkills();
            }
        }
        const projectDetailsInput = document.getElementById('project_details');
        const projectDetailsLeft = document.getElementById('project-details-left');
        if (projectDetailsInput && projectDetailsLeft) {
            const left = 1000 - (projectDetailsInput.value || '').length;
            projectDetailsLeft.textContent = `${Math.max(0, left)}`;
        }
        const summaryInput = document.getElementById('profile_summary');
        const summaryLeft = document.getElementById('summary-left');
        if (summaryInput && summaryLeft) {
            const left = 1000 - (summaryInput.value || '').length;
            summaryLeft.textContent = `${Math.max(0, left)}`;
        }
        loadLanguageRowsFromHidden();
    });

    // ----- File uploads -----
    ['resume', 'cover_letter'].forEach(type => {
        const config = fileConfig[type];
        if (!config) return;

        if (config.input) {
            config.input.addEventListener('change', (e) => handleFile(e.target.files[0], type));
        }

        if (config.dropZone) {
            ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
                config.dropZone.addEventListener(ev, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (['dragenter', 'dragover'].includes(ev)) config.dropZone.classList.add('hover');
                    else config.dropZone.classList.remove('hover');
                }, false);
            });
            config.dropZone.addEventListener('drop', (e) => handleFile(e.dataTransfer.files[0], type));
        }
    });

    // Remove file buttons
    document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('.p2-remove-file');
        if (btn && btn.getAttribute('data-target')) {
            hideFileDisplay(btn.getAttribute('data-target'));
            refreshHeader();
        }
    });

    // Saved-entry remove (X) buttons
    document.body.addEventListener('click', (e) => {
        const removeBtn = e.target.closest('.p2-entry-remove');
        if (!removeBtn) return;
        e.preventDefault();
        clearEntryData(removeBtn.getAttribute('data-entry-id'));
    });

    // Project attachment selection
    const projectAttachmentInput = document.getElementById('project_attachment');
    const projectFileRemoveBtn = document.getElementById('project-file-remove');
    if (projectAttachmentInput) {
        projectAttachmentInput.addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (f) showProjectFileDisplay(f.name);
            else hideProjectFileDisplay();
            refreshHeader();
        });
    }
    if (projectFileRemoveBtn) {
        projectFileRemoveBtn.addEventListener('click', () => {
            hideProjectFileDisplay();
            refreshHeader();
        });
    }

    // Project details character counter
    const projectDetailsInput = document.getElementById('project_details');
    const projectDetailsLeft = document.getElementById('project-details-left');
    function updateProjectCharCount() {
        if (!projectDetailsInput || !projectDetailsLeft) return;
        const left = 1000 - (projectDetailsInput.value || '').length;
        projectDetailsLeft.textContent = `${Math.max(0, left)}`;
    }
    if (projectDetailsInput) {
        projectDetailsInput.addEventListener('input', updateProjectCharCount);
        updateProjectCharCount();
    }

    // Profile summary character counter + sync headline field
    const profileSummaryInput = document.getElementById('profile_summary');
    const summaryLeft = document.getElementById('summary-left');
    const headlineHidden = document.getElementById('headline');
    function updateSummaryCharCount() {
        if (!profileSummaryInput || !summaryLeft) return;
        const left = 1000 - (profileSummaryInput.value || '').length;
        summaryLeft.textContent = `${Math.max(0, left)}`;
        if (headlineHidden) headlineHidden.value = (profileSummaryInput.value || '').trim();
    }
    if (profileSummaryInput) {
        profileSummaryInput.addEventListener('input', updateSummaryCharCount);
        updateSummaryCharCount();
    }

    // ----- Collapsible card sections -----
    // Helper: toggle a form section (now acting as Modals)
    function toggleForm(targetId) {
        const target = document.getElementById(targetId);
        if (!target) return;

        // Close all other forms to ensure only one modal is active
        document.querySelectorAll('.p2-card-form:not(.collapsed)').forEach(f => {
            if (f.id !== targetId) f.classList.add('collapsed');
        });

        target.classList.toggle('collapsed');

        const backdrop = document.getElementById('p2_global_backdrop');
        if (!target.classList.contains('collapsed')) {
            document.body.classList.add('p2-modal-open');
            if (backdrop) backdrop.style.display = 'block';
        } else {
            document.body.classList.remove('p2-modal-open');
            if (backdrop) backdrop.style.display = 'none';
        }
    }

    function ensureModalControls() {
        document.querySelectorAll('.p2-card-form').forEach(form => {
            if (!form.id) return;

            // Top-right close button (X)
            if (!form.querySelector('.p2-modal-close')) {
                const closeBtn = document.createElement('button');
                closeBtn.type = 'button';
                closeBtn.className = 'p2-modal-close';
                closeBtn.setAttribute('data-close', form.id);
                closeBtn.setAttribute('aria-label', 'Close');
                closeBtn.innerHTML = '<i class="fas fa-times"></i>';
                form.appendChild(closeBtn);
            }

            // Ensure inline actions with Cancel + Save
            let actions = form.querySelector('.p2-inline-actions');
            if (!actions) {
                actions = document.createElement('div');
                actions.className = 'p2-inline-actions';
                form.appendChild(actions);
            }

            if (!actions.querySelector('.p2-inline-cancel[data-close]')) {
                const cancelBtn = document.createElement('button');
                cancelBtn.type = 'button';
                cancelBtn.className = 'p2-inline-cancel';
                cancelBtn.setAttribute('data-close', form.id);
                cancelBtn.textContent = 'Cancel';
                actions.appendChild(cancelBtn);
            }

            if (!actions.querySelector('.p2-inline-save[data-save]') && !actions.querySelector('.p2-btn-save')) {
                const saveBtn = document.createElement('button');
                saveBtn.type = 'button';
                saveBtn.className = 'p2-inline-save';
                saveBtn.setAttribute('data-save', form.id);
                saveBtn.textContent = 'Save';
                actions.appendChild(saveBtn);
            } else if (actions.querySelector('.p2-btn-save') && !actions.querySelector('.p2-btn-save[data-save]')) {
                const existingSave = actions.querySelector('.p2-btn-save');
                existingSave.setAttribute('data-save', form.id);
            }
        });
    }

    function openFormIfCollapsed(targetId) {
        const target = document.getElementById(targetId);
        if (target && target.classList.contains('collapsed')) {
            toggleForm(targetId);
        }
    }

    function normalizeUrlField(input) {
        if (!input) return;
        const raw = (input.value || '').trim();
        if (!raw) return;
        if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(raw)) {
            input.value = raw;
            return;
        }
        // Allow users to type domain-only URLs and normalize before validity checks.
        if (/^[\w.-]+\.[a-z]{2,}([\/?#].*)?$/i.test(raw)) {
            input.value = `https://${raw}`;
            return;
        }
        input.value = raw;
    }

    function findFirstInvalidControl() {
        normalizeUrlField(document.getElementById('linkedin_url'));
        normalizeUrlField(document.getElementById('cert_url'));

        const controls = Array.from(profileForm.elements).filter((el) =>
            el &&
            typeof el.checkValidity === 'function' &&
            !el.disabled &&
            !!el.name
        );
        return controls.find((el) => !el.checkValidity()) || null;
    }

    function revealInvalidControl(control) {
        const parentForm = control.closest('.p2-card-form');
        if (parentForm && parentForm.classList.contains('collapsed')) {
            openFormIfCollapsed(parentForm.id);
        }
        setTimeout(() => {
            control.focus({ preventScroll: false });
            if (typeof control.reportValidity === 'function') control.reportValidity();
        }, 0);
    }

    ensureModalControls();

    // Header card-actions (top-right "Add education" / "Add employment" etc.)
    document.querySelectorAll('.p2-card-action[data-toggle]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            toggleForm(link.getAttribute('data-toggle'));
        });
    });

    // Header profile edit pen
    document.querySelectorAll('.p2-edit-pen[data-toggle]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            toggleForm(link.getAttribute('data-toggle'));
        });
    });

    // Add-links ("+ Add CA qualification", "+ Add graduation", etc.)
    document.querySelectorAll('.p2-add-link[data-toggle]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            toggleForm(link.getAttribute('data-toggle'));
        });
    });

    // Entry edit pencils
    document.querySelectorAll('.p2-entry-edit[data-toggle]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            openFormIfCollapsed(link.getAttribute('data-toggle'));
        });
    });

    // Career/Personal saved-content area should also open the related edit modal.
    document.querySelectorAll('.p2-display-clickable[data-toggle]').forEach(display => {
        display.addEventListener('click', (e) => {
            if (e.target.closest('a, button, input, select, textarea, label')) return;
            openFormIfCollapsed(display.getAttribute('data-toggle'));
        });
        display.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            openFormIfCollapsed(display.getAttribute('data-toggle'));
        });
    });

    // Cancel buttons
    document.querySelectorAll('.p2-inline-cancel[data-close]').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-close');
            const target = document.getElementById(targetId);
            if (target && !target.classList.contains('collapsed')) {
                toggleForm(targetId); // Re-use toggle logic to handle backdrop correctly
            }
            // Refresh displays after closing
            refreshHeader();
        });
    });

    // Modal top-right X close
    document.body.addEventListener('click', (e) => {
        const closeBtn = e.target.closest('.p2-modal-close[data-close]');
        if (!closeBtn) return;
        const targetId = closeBtn.getAttribute('data-close');
        const target = document.getElementById(targetId);
        if (target && !target.classList.contains('collapsed')) {
            toggleForm(targetId);
        }
        refreshHeader();
    });

    // Modal Save buttons (section-level save, closes popup only)
    document.body.addEventListener('click', (e) => {
        const saveActionBtn = e.target.closest('.p2-inline-save[data-save], .p2-btn-save[data-save]');
        if (!saveActionBtn) return;
        const targetId = saveActionBtn.getAttribute('data-save');
        const target = document.getElementById(targetId);
        if (target && !target.classList.contains('collapsed')) {
            toggleForm(targetId);
        }
        refreshHeader();
    });

    // Close modal when clicking the global backdrop
    const backdrop = document.getElementById('p2_global_backdrop');
    if (backdrop) {
        backdrop.addEventListener('click', () => {
            document.querySelectorAll('.p2-card-form:not(.collapsed)').forEach(f => {
                f.classList.add('collapsed');
            });
            document.body.classList.remove('p2-modal-open');
            backdrop.style.display = 'none';
            refreshHeader();
        });
    }

    // ----- Save -----
    profileForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const invalidControl = findFirstInvalidControl();
        if (invalidControl) {
            revealInvalidControl(invalidControl);
            return;
        }
        await handleSave(e);
    });

    // ----- Menu (shared) -----
    const menuButton = document.getElementById('menuButton');
    const expandedMenu = document.getElementById('expandedMenu');
    const menuCloseBtn = document.getElementById('menuCloseBtn');
    const authButtonsContainer = document.querySelector('.auth-buttons-container');

    if (user) {
        let displayName = '';
        try {
            const pd = JSON.parse(localStorage.getItem('userProfileData') || '{}');
            if (pd.name && pd.name.trim()) displayName = pd.name.trim();
        } catch (e) { }
        if (!displayName && user.user_metadata && user.user_metadata.full_name) {
            displayName = user.user_metadata.full_name;
        }
        if (!displayName) {
            displayName = user.email.split('@')[0];
        }
        const initial = displayName.charAt(0).toUpperCase();
        authButtonsContainer.innerHTML = `<div class="user-profile-container"><div class="user-icon-wrapper"><div class="user-icon" data-email="${user.email}">${initial}</div><div class="user-hover-card"><div class="user-hover-content"><p class="user-email">${displayName}</p><a href="/profile.html" class="profile-link-btn">Edit Profile</a><button id="logoutBtn" class="logout-btn">Logout</button></div></div></div></div>`;

        const userIconWrapper = authButtonsContainer.querySelector('.user-icon-wrapper');
        const userHoverCard = authButtonsContainer.querySelector('.user-hover-card');
        if (userIconWrapper && userHoverCard) {
            userIconWrapper.addEventListener('click', (event) => {
                event.stopPropagation();
                userHoverCard.classList.toggle('show');
            });
        }

        document.getElementById('logoutBtn').addEventListener('click', async () => {
            await supabaseClient.auth.signOut();
            localStorage.clear();
            window.location.href = '/login.html';
        });
    }

    menuButton.addEventListener('click', () => expandedMenu.classList.add('active'));
    menuCloseBtn.addEventListener('click', () => expandedMenu.classList.remove('active'));

    // ----- DPDP Consent Initialization -----
    await loadConsentStatus();

    // Consent Required Modal — close and scroll to checkbox
    const consentModalAcceptBtn = document.getElementById('consentModalAcceptBtn');
    if (consentModalAcceptBtn) {
        consentModalAcceptBtn.addEventListener('click', () => {
            document.getElementById('consentRequiredModal').style.display = 'none';
            const consentCard = document.getElementById('cvConsentCard');
            if (consentCard) {
                consentCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
                consentCard.style.animation = 'p2consentFadeIn 0.5s ease';
                setTimeout(() => consentCard.style.animation = '', 600);
            }
        });
    }

    // Live update privacy card when consent checkbox changes
    const cvConsentCheckbox = document.getElementById('cvSharingConsent');
    if (cvConsentCheckbox) {
        cvConsentCheckbox.addEventListener('change', () => {
            if (!cvConsentCheckbox.checked) {
                // Consent withdrawal — save immediately
                saveConsentRecord(false);
                updatePrivacyCard(false);
                const statusText = document.getElementById('consentStatusText');
                if (statusText) statusText.textContent = 'Consent withdrawn';
                showToast('CV sharing consent withdrawn. Your CV will no longer be shared with employers.', 'warning', 8000);
            }
        });
    }
});

