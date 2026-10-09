const textValue = (...values) => values.some(value => {
    if (Array.isArray(value)) return value.some(item => String(item || '').trim());
    return String(value ?? '').trim();
});

const SCHOOL_CGPA_SCALES = ['4', '5', '10'];

export function normalizeSchoolScoreType(value) {
    return String(value || '').trim().toLowerCase() === 'cgpa' ? 'cgpa' : 'percentage';
}

export function normalizeSchoolScoreValue(value) {
    return String(value ?? '').trim().replace(/%\s*$/, '').trim();
}

export function isValidSchoolScore(profile = {}, prefix) {
    const type = normalizeSchoolScoreType(profile[`${prefix}_score_type`]);
    const raw = normalizeSchoolScoreValue(profile[`${prefix}_percentage`]);
    if (!raw || !/^\d+(?:\.\d{1,2})?$/.test(raw)) return false;
    const score = Number(raw);
    if (!Number.isFinite(score)) return false;
    if (type === 'cgpa') {
        const scale = String(profile[`${prefix}_cgpa_scale`] || '').trim();
        return SCHOOL_CGPA_SCALES.includes(scale) && score >= 0 && score <= Number(scale);
    }
    return score >= 0 && score <= 100;
}

export function isSchoolEducationComplete(profile = {}, prefix) {
    const board = String(profile[`${prefix}_board`] || '').trim();
    const school = String(profile[`${prefix}_school`] || '').trim();
    const year = Number(profile[`${prefix}_year`]);
    const currentYear = new Date().getFullYear();
    return Boolean(board && school && Number.isInteger(year) && year >= 1900 && year <= currentYear && isValidSchoolScore(profile, prefix));
}

export function formatSchoolScore(profile = {}, prefix) {
    const raw = normalizeSchoolScoreValue(profile[`${prefix}_percentage`]);
    if (!raw) return '';
    const type = normalizeSchoolScoreType(profile[`${prefix}_score_type`]);
    if (type === 'cgpa') return `${raw} / ${profile[`${prefix}_cgpa_scale`] || '10'} CGPA`;
    return `${raw}%`;
}

export function hasResumeEvidence(profile = {}, storage = globalThis.localStorage) {
    const localText = storage?.getItem?.('userCVText') || '';
    const localPdf = storage?.getItem?.('userCVPdf') || '';
    const localName = storage?.getItem?.('userCVFileName') || '';
    let localImages = [];
    try {
        const parsedImages = JSON.parse(storage?.getItem?.('userCVImages') || '[]');
        localImages = Array.isArray(parsedImages) ? parsedImages : [];
    } catch (_) {
        localImages = [];
    }

    return Boolean(textValue(
        localText,
        localPdf,
        localName,
        localImages,
        profile.ocr_cv,
        profile.cv_filename,
        profile.resume_filename,
        profile.cv_cloud_synced ? 'synced' : ''
    ));
}

const EMPLOYMENT_PORTALS = ['fresher_experienced', 'semi_experienced', 'articleship'];
const CA_FINAL_PORTALS = ['fresher_fresher', 'fresher_experienced'];
const CA_INTER_PORTALS = ['industrial', 'articleship', 'semi_fresher', 'semi_experienced'];

function educationRoute(portal) {
    if (CA_FINAL_PORTALS.includes(portal)) {
        return { section: 'sec-ca-education', form: 'sec-ca-final-form' };
    }
    if (CA_INTER_PORTALS.includes(portal)) {
        return { section: 'sec-ca-education', form: 'sec-ca-inter-form' };
    }
    return { section: 'sec-ca-education', form: '' };
}

function experienceRoute(portal) {
    if (EMPLOYMENT_PORTALS.includes(portal)) {
        return { section: 'sec-employment', form: 'sec-experience-form' };
    }
    return { section: 'sec-articleship', form: 'sec-art-form' };
}

function organizationRoute(portal) {
    if (EMPLOYMENT_PORTALS.includes(portal)) {
        return { section: 'sec-employment', form: 'sec-experience-form' };
    }
    return { section: 'sec-articleship', form: 'sec-it-form' };
}

export function getProfileCompletionItems(profile = {}, storage = globalThis.localStorage) {
    const d = profile || {};
    const pref = String(d.job_preference || d.looking_for || '').trim();
    const needsCTC = ['fresher_experienced', 'semi_experienced'].includes(pref);
    const educationTarget = educationRoute(pref);
    const experienceTarget = experienceRoute(pref);
    const organizationTarget = organizationRoute(pref);

    const hasEducation = textValue(
        d.ca_final_course,
        d.ca_inter_course,
        d.ca_found_course,
        d.grad_degree,
        d.other_edu_course,
        d.other_edu_level
    );
    const hasExperience = textValue(
        d.total_experience,
        d.emp_company_name,
        d.emp_job_title,
        d.emp_exp_years,
        d.emp_exp_months,
        d.articleship_firm_name,
        d.articleship_firm_type && d.articleship_firm_type !== 'None' ? d.articleship_firm_type : '',
        d.industrial_training_company
    );
    const hasCurrentOrg = textValue(
        d.emp_company_name,
        d.articleship_firm_name,
        d.industrial_training_company
    );

    const items = [
        { label: 'Add full name', icon: 'fa-user', filled: textValue(d.name, d.full_name), boost: 14, section: 'sec-personal', form: 'sec-personal-form' },
        { label: 'Add mobile number', icon: 'fa-phone-alt', filled: textValue(d.contact_number, d.mobile, d.phone, d.phone_number), boost: 10, section: 'sec-personal', form: 'sec-personal-form' },
        { label: 'Add location', icon: 'fa-map-marker-alt', filled: textValue(d.current_city, d.current_location, d.city, d.location), boost: 3, section: 'sec-personal', form: 'sec-personal-form' },
        { label: 'Add resume', icon: 'fa-file-alt', filled: hasResumeEvidence(d, storage), boost: 14, section: 'sec-resume', form: '' },
        { label: 'Add profile summary', icon: 'fa-heading', filled: textValue(d.profile_summary, d.headline), boost: 10, section: 'sec-headline', form: 'sec-headline-form' },
        { label: 'Add CA education', icon: 'fa-graduation-cap', filled: hasEducation, boost: 4, ...educationTarget },
        { label: 'Add Class XII details', icon: 'fa-school', filled: isSchoolEducationComplete(d, 'class12'), boost: 4, section: 'sec-ca-education', form: 'sec-12-form' },
        { label: 'Add Class X details', icon: 'fa-school', filled: isSchoolEducationComplete(d, 'class10'), boost: 4, section: 'sec-ca-education', form: 'sec-10-form' },
        { label: 'Add experience', icon: 'fa-briefcase', filled: hasExperience, boost: 12, ...experienceTarget },
        { label: 'Add notice period', icon: 'fa-calendar-check', filled: textValue(d.notice_period), boost: 7, section: 'sec-availability', form: 'sec-availability-form' },
        { label: pref === 'articleship' ? 'Add prior work experience' : 'Add current organization', icon: 'fa-building', filled: hasCurrentOrg, boost: 7, ...organizationTarget },
        { label: 'Add job preference', icon: 'fa-bullseye', filled: textValue(pref), boost: 7, section: 'sec-career', form: 'sec-career-form' },
        // Certifications are optional profile enrichment and must not affect
        // completion or Easy Apply eligibility. The former 2% certification
        // weight is assigned to Key Skills instead.
        { label: 'Add key skills', icon: 'fa-tools', filled: textValue(d.key_skills, d.skills, d.emp_skills_hidden), boost: 4, section: 'sec-skills', form: 'sec-skills-form' },
    ];

    if (needsCTC) {
        items.push({ label: 'Add current CTC', icon: 'fa-wallet', filled: textValue(d.emp_current_salary), boost: 3, section: 'sec-availability', form: 'sec-availability-form' });
    }

    return items;
}

export function calculateProfileCompletion(profile = {}, storage = globalThis.localStorage) {
    const items = getProfileCompletionItems(profile, storage);
    const total = items.reduce((sum, item) => sum + item.boost, 0);
    const filled = items.filter(item => item.filled).reduce((sum, item) => sum + item.boost, 0);
    return total ? Math.round((filled / total) * 100) : 0;
}

export function readCachedProfile(storage = globalThis.localStorage) {
    try {
        return JSON.parse(storage?.getItem?.('userProfileData') || '{}');
    } catch (_) {
        return {};
    }
}
