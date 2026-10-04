const textValue = (...values) => values.some(value => {
    if (Array.isArray(value)) return value.some(item => String(item || '').trim());
    return String(value ?? '').trim();
});

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

export function getProfileCompletionItems(profile = {}, storage = globalThis.localStorage) {
    const d = profile || {};
    const pref = String(d.job_preference || d.looking_for || '').trim();
    const needsCTC = ['fresher_experienced', 'semi_experienced'].includes(pref);

    const hasEducation = textValue(
        d.ca_final_course,
        d.ca_inter_course,
        d.ca_found_course,
        d.grad_degree,
        d.class12_board,
        d.class10_board,
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
        { label: 'Add CA education', icon: 'fa-graduation-cap', filled: hasEducation, boost: 12, section: 'sec-ca-education', form: '' },
        { label: 'Add experience', icon: 'fa-briefcase', filled: hasExperience, boost: 12, section: 'sec-employment', form: 'sec-experience-form' },
        { label: 'Add notice period', icon: 'fa-calendar-check', filled: textValue(d.notice_period), boost: 7, section: 'sec-availability', form: 'sec-availability-form' },
        { label: 'Add current organization', icon: 'fa-building', filled: hasCurrentOrg, boost: 7, section: 'sec-employment', form: 'sec-experience-form' },
        { label: 'Add job preference', icon: 'fa-bullseye', filled: textValue(pref), boost: 7, section: 'sec-career', form: 'sec-career-form' },
        { label: 'Add key skills', icon: 'fa-tools', filled: textValue(d.key_skills, d.skills, d.emp_skills_hidden), boost: 2, section: 'sec-skills', form: 'sec-skills-form' },
        { label: 'Add a certification', icon: 'fa-certificate', filled: textValue(d.cert_name), boost: 2, section: 'sec-certification', form: 'sec-certification-form' },
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
