// CS and CMA profile fields: the keys the profile page saves into
// profiles.profile (jsonb) and the labels the hirer dashboard shows. CA
// fields keep their existing names (ca_final_*, ca_inter_*, ca_found_*,
// articleship_*, industrial_training_company, it_*). DOM-free.
//
// The profile page replaces the whole jsonb on every save, so each key here
// must have a named, enabled control in profile.html (hidden is fine,
// disabled or missing is not), and none may be `required`.

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];

export const PROFILE_FIELDS = {
    cs: [
        { key: 'cs_icsi_reg_no', label: 'ICSI registration no.' },
        {
            key: 'cs_exec_status', label: 'CS Executive', options: {
                pursuing: 'Pursuing', module1: 'Module 1 passed', module2: 'Module 2 passed', both: 'Both modules passed'
            }
        },
        { key: 'cs_exec_attempts', label: 'CS Executive attempts' },
        { key: 'cs_exec_clear_month', label: 'CS Executive passed (month)', options: 'month' },
        { key: 'cs_exec_clear_year', label: 'CS Executive passed (year)' },
        { key: 'cs_edp_done', label: 'Executive Development Programme (EDP)', options: { yes: 'Completed', no: 'Not yet' } },
        {
            key: 'cs_prof_status', label: 'CS Professional', options: {
                not_started: 'Not started', pursuing: 'Pursuing', partial: 'Some modules passed', passed: 'All modules passed'
            }
        },
        { key: 'cs_prof_clear_month', label: 'CS Professional passed (month)', options: 'month' },
        { key: 'cs_prof_clear_year', label: 'CS Professional passed (year)' },
        { key: 'cs_acs_no', label: 'ACS membership no.' },
        { key: 'cs_training_type', label: 'Training with', options: { pcs: 'Practising Company Secretary (firm)', company: 'Company' } },
        { key: 'cs_training_org', label: 'Training organisation' },
        { key: 'cs_training_start_month', label: 'Training start (month)', options: 'month' },
        { key: 'cs_training_start_year', label: 'Training start (year)' },
        { key: 'cs_training_end_month', label: 'Training end (month)', options: 'month' },
        { key: 'cs_training_end_year', label: 'Training end (year)' },
        { key: 'cs_training_is_current', label: 'Currently in training', options: { yes: 'Yes' } }
    ],
    cma: [
        { key: 'cma_icmai_reg_no', label: 'ICMAI registration no.' },
        {
            key: 'cma_inter_status', label: 'CMA Intermediate', options: {
                pursuing: 'Pursuing', group1: 'Group I passed', group2: 'Group II passed', both: 'Both groups passed'
            }
        },
        { key: 'cma_inter_attempts', label: 'CMA Intermediate attempts' },
        { key: 'cma_inter_clear_month', label: 'CMA Intermediate passed (month)', options: 'month' },
        { key: 'cma_inter_clear_year', label: 'CMA Intermediate passed (year)' },
        {
            key: 'cma_final_status', label: 'CMA Final', options: {
                not_started: 'Not started', pursuing: 'Pursuing', group3: 'Group III passed', group4: 'Group IV passed', both: 'Both groups passed'
            }
        },
        { key: 'cma_final_clear_month', label: 'CMA Final passed (month)', options: 'month' },
        { key: 'cma_final_clear_year', label: 'CMA Final passed (year)' },
        { key: 'cma_acma_no', label: 'ACMA membership no.' },
        { key: 'cma_training_type', label: 'Training with', options: { t1: 'Practising Cost Accountant (Form T-1)', t4: 'Recognised organisation (Form T-4)' } },
        { key: 'cma_training_org', label: 'Training organisation' },
        { key: 'cma_training_start_month', label: 'Training start (month)', options: 'month' },
        { key: 'cma_training_start_year', label: 'Training start (year)' },
        { key: 'cma_training_end_month', label: 'Training end (month)', options: 'month' },
        { key: 'cma_training_end_year', label: 'Training end (year)' },
        { key: 'cma_training_is_current', label: 'Currently in training', options: { yes: 'Yes' } }
    ]
};

const FIELD_BY_KEY = new Map(Object.values(PROFILE_FIELDS).flat().map(field => [field.key, field]));

export const MONTH_OPTIONS = MONTHS;

// Human label for a stored value ('both' -> 'Both modules passed'); unknown
// values are shown as typed.
export function fieldValueLabel(key, value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const field = FIELD_BY_KEY.get(key);
    if (!field || !field.options || field.options === 'month') return raw;
    return field.options[raw] || raw;
}

export function fieldLabel(key) {
    return FIELD_BY_KEY.get(key)?.label || key;
}

// The one-line summary a recruiter sees on a candidate card.
export function stageSummary(qualification, profile = {}) {
    const p = profile || {};
    if (qualification === 'cs') {
        const parts = [];
        if (p.cs_exec_status) parts.push(`Executive: ${fieldValueLabel('cs_exec_status', p.cs_exec_status)}`);
        if (p.cs_prof_status && p.cs_prof_status !== 'not_started') parts.push(`Professional: ${fieldValueLabel('cs_prof_status', p.cs_prof_status)}`);
        if (p.cs_acs_no) parts.push('ACS');
        return parts.join(' · ');
    }
    if (qualification === 'cma') {
        const parts = [];
        if (p.cma_inter_status) parts.push(`Inter: ${fieldValueLabel('cma_inter_status', p.cma_inter_status)}`);
        if (p.cma_final_status && p.cma_final_status !== 'not_started') parts.push(`Final: ${fieldValueLabel('cma_final_status', p.cma_final_status)}`);
        if (p.cma_acma_no) parts.push('ACMA');
        return parts.join(' · ');
    }
    return '';
}

// Training line for CS / CMA candidates ("Company: Tata Steel").
export function trainingSummary(qualification, profile = {}) {
    const p = profile || {};
    const prefix = qualification === 'cs' ? 'cs' : qualification === 'cma' ? 'cma' : null;
    if (!prefix || !p[`${prefix}_training_org`]) return '';
    const type = fieldValueLabel(`${prefix}_training_type`, p[`${prefix}_training_type`]);
    return type ? `${type}: ${p[`${prefix}_training_org`]}` : String(p[`${prefix}_training_org`]);
}

// Does the profile carry this course's education? (profile completion)
export function hasCourseEducation(qualification, profile = {}) {
    const p = profile || {};
    if (qualification === 'cs') return Boolean(p.cs_exec_status || p.cs_prof_status || p.cs_icsi_reg_no);
    if (qualification === 'cma') return Boolean(p.cma_inter_status || p.cma_final_status || p.cma_icmai_reg_no);
    return false;
}

export function hasCourseTraining(qualification, profile = {}) {
    const p = profile || {};
    if (qualification === 'cs') return Boolean(p.cs_training_org);
    if (qualification === 'cma') return Boolean(p.cma_training_org);
    return false;
}
