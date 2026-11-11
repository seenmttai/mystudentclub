// Structured vacancy filters for each job portal (Aniket, 6 Nov 2026).
//
// The values come from columns that the database fills from each vacancy's own text
// (supabase/migrations/202611060003_job_filter_fields.sql). This module owns:
//   - which filters each portal shows (FILTERS_BY_PORTAL),
//   - how a filter narrows the Supabase query (applyJobFilters),
//   - the filter controls in the desktop sidebar and the phone filter sheet (renderJobFilters),
//   - the "active filter" pills (describeJobFilters).
// It has no state of its own: portal3.js keeps the chosen values in state.extra.

export const PORTALS = {
    ARTICLESHIP: 'articleship',
    INDUSTRIAL: 'industrial',
    FRESHER: 'fresher',
    EXPERIENCED: 'experienced',
    SEMI: 'semi'
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function portalFor(table, experienced) {
    if (table === 'Articleship Jobs') return PORTALS.ARTICLESHIP;
    if (table === 'Industrial Training Job Portal') return PORTALS.INDUSTRIAL;
    if (table === 'Semi Qualified Jobs') return PORTALS.SEMI;
    if (table === 'Fresher Jobs') return experienced ? PORTALS.EXPERIENCED : PORTALS.FRESHER;
    return null;
}

// Extra columns each portal reads for cards and the job popup.
export function extraSelectColumns(table) {
    if (table === 'Articleship Jobs') return ', pay_min, pay_max, deadline, firm_size, exposure_areas, client_types, transfer_accepted';
    if (table === 'Industrial Training Job Portal' || table === 'Fresher Jobs' || table === 'Semi Qualified Jobs') {
        return ', pay_min, pay_max, deadline, employer_type';
    }
    return '';
}

// Same rules as public.job_filter_company_key() in the migration (tests keep them in step).
export function normalizeCompanyKey(name) {
    let k = String(name || '').toLowerCase();
    k = k.replace(/\([^)]*\)/g, ' ');
    k = k.replace(/&/g, ' and ');
    k = k.replace(/[^a-z0-9 ]+/g, ' ');
    k = k.replace(/\s+/g, ' ').trim();
    k = k.replace(/^the /, '');
    if (/^(ey|ernst and young)( |$)/.test(k)) return 'ey';
    if (/^deloitte( |$)/.test(k)) return 'deloitte';
    if (/^kpmg( |$)/.test(k)) return 'kpmg';
    if (/^(pwc|pricewaterhousecoopers|price waterhouse)( |$)/.test(k)) return 'pwc';
    if (/^accenture( |$)/.test(k)) return 'accenture';
    if (/^grant thornton( |$)/.test(k)) return 'grant thornton';
    if (/^bdo( |$)/.test(k)) return 'bdo';
    k = k.replace(/( (private|pvt|limited|ltd|llp|inc|plc|and co|co|and company|company|india|in india|gds|usi|global services|chartered accountants|and associates|associates))+$/, '');
    k = k.trim();
    return k || null;
}

function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDays(d, days) {
    const copy = new Date(d.getTime());
    copy.setDate(copy.getDate() + days);
    return copy;
}

function monthValue(y, m) {
    return `${y}-${String(m).padStart(2, '0')}-01`;
}

function monthLabel(value) {
    const [y, m] = value.split('-').map(Number);
    return `${MONTHS[m - 1]} ${y}`;
}

// ICAI CA exams run in January, May and September (May and November before 2025).
function attemptMonths(fromYear, toYear) {
    const out = [];
    for (let y = fromYear; y <= toYear; y++) {
        const months = y <= 2024 ? [5, 11] : [1, 5, 9];
        for (const m of months) out.push(monthValue(y, m));
    }
    return out;
}

// Industrial Training: the CA Final attempts a trainee could be writing next.
export function upcomingFinalAttempts(now = new Date()) {
    const current = monthValue(now.getFullYear(), now.getMonth() + 1);
    return attemptMonths(now.getFullYear(), now.getFullYear() + 4).filter(v => v > current).slice(0, 9);
}

// CA Fresher: the attempts a newly qualified CA could have cleared.
export function recentQualifyingAttempts(now = new Date()) {
    const current = monthValue(now.getFullYear(), now.getMonth() + 1);
    return attemptMonths(now.getFullYear() - 3, now.getFullYear()).filter(v => v <= current).reverse().slice(0, 8);
}

function nextMonths(now, count) {
    const out = [];
    for (let i = 0; i < count; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        out.push(monthValue(d.getFullYear(), d.getMonth() + 1));
    }
    return out;
}

const opt = (value, label) => ({ value, label: label || value });

// The attempt window is stored as attempt_from / attempt_to (either may be empty = no limit).
// A job fits the student's attempt when it falls inside that window; jobs that name no attempt fit everyone.
function applyAttempt(q, value) {
    return q.or(`attempt_from.is.null,attempt_from.lte.${value}`).or(`attempt_to.is.null,attempt_to.gte.${value}`);
}

function notTrue(column) {
    return `${column}.is.null,${column}.eq.false`;
}

const COMMON = {
    postedWithin: {
        key: 'postedWithin', label: 'Posted within', kind: 'select',
        options: () => [opt('', 'Any time'), opt('1', 'Last 24 hours'), opt('3', 'Last 3 days'), opt('7', 'Last 7 days')],
        apply: (q, v, now) => q.gte('Created_At', new Date(now.getTime() - Number(v) * 86400000).toISOString()),
        pill: v => ({ '1': 'Posted: last 24 hours', '3': 'Posted: last 3 days', '7': 'Posted: last 7 days' }[v])
    },
    applyMethod: {
        key: 'applyMethod', label: 'Apply method', kind: 'chips',
        options: () => [opt('Easy Apply'), opt('Email'), opt('Form / link', 'Form or link'), opt('WhatsApp / call', 'WhatsApp or call')],
        apply: (q, v) => q.overlaps('apply_methods', v),
        pill: v => `Apply: ${v}`
    },
    deadline: {
        key: 'deadline', label: 'Deadline', kind: 'select',
        options: () => [opt('', 'Any'), opt('soon', 'Closing in 7 days'), opt('given', 'Has a last date')],
        apply: (q, v, now) => {
            const today = isoDate(now);
            q = q.gte('deadline', today);
            return v === 'soon' ? q.lte('deadline', isoDate(addDays(now, 7))) : q;
        },
        pill: v => (v === 'soon' ? 'Closing in 7 days' : 'Has a last date')
    },
    company: {
        key: 'company', label: 'Company', kind: 'text', placeholder: 'e.g. EY, ITC, Deloitte',
        apply: (q, v) => {
            const key = normalizeCompanyKey(v);
            if (!key) return q;
            return q.or(`company_key.eq."${key}",company_key.like."${key} *"`);
        },
        pill: v => `Company: ${v}`
    },
    locationType: {
        key: 'locationType', label: 'Location type', kind: 'chips',
        options: () => [opt('pan', 'Pan-India / multiple cities'), opt('remote', 'Remote')],
        apply: (q, v) => {
            const parts = [];
            if (v.includes('pan')) parts.push('is_pan_india.is.true');
            if (v.includes('remote')) parts.push('work_mode.eq.Remote');
            return parts.length ? q.or(parts.join(',')) : q;
        },
        pill: v => (v === 'pan' ? 'Pan-India' : 'Remote')
    },
    payDisclosed: {
        key: 'payDisclosed', label: 'Pay', kind: 'chips',
        options: ctx => [opt('yes', ctx.payKind === 'annual' ? 'Shows salary' : 'Shows stipend')],
        apply: (q, v) => (v.includes('yes') ? q.not('pay_min', 'is', null) : q),
        pill: () => 'Pay shown'
    },
    immediate: {
        key: 'immediate', label: 'Joining', kind: 'chips',
        options: () => [opt('yes', 'Immediate joiners')],
        apply: (q, v) => (v.includes('yes') ? q.is('immediate_joining', true) : q),
        pill: () => 'Immediate joiners'
    },
    workMode: {
        key: 'workMode', label: 'Work mode', kind: 'select',
        options: () => [opt('', 'Any'), opt('Office'), opt('Hybrid'), opt('Remote')],
        apply: (q, v) => q.eq('work_mode', v),
        pill: v => `Work mode: ${v}`
    },
    tools: {
        key: 'tools', label: 'Tools and systems', kind: 'chips',
        options: () => ['Excel', 'Tally', 'SAP', 'Oracle', 'Other ERP', 'Power BI', 'Python', 'SQL', 'Tableau / Alteryx', 'VBA / Macros'].map(v => opt(v)),
        apply: (q, v) => q.overlaps('tools', v),
        pill: v => v
    },
    examCriteria: {
        key: 'examCriteria', label: 'Exam criteria', kind: 'select',
        options: () => [opt('', 'Any'), opt('no-first', 'No first-attempt condition'), opt('first', 'First attempt required'), opt('rank', 'Rank holders preferred')],
        apply: (q, v) => {
            if (v === 'no-first') return q.or('exam_criteria.is.null,exam_criteria.not.cs.{"First attempt"}');
            if (v === 'first') return q.contains('exam_criteria', ['First attempt']);
            if (v === 'rank') return q.contains('exam_criteria', ['Rank holder']);
            return q;
        },
        pill: v => ({ 'no-first': 'No first-attempt condition', first: 'First attempt required', rank: 'Rank holders preferred' }[v])
    },
    workTypes: {
        key: 'workTypes', label: 'Type of work', kind: 'chips',
        options: () => ['US / UK accounting', 'US GAAP / IFRS', 'Ind AS', 'KPO / Shared services', 'CA firm practice', 'In-house finance', 'Virtual CFO / Outsourcing'].map(v => opt(v)),
        apply: (q, v) => q.overlaps('work_types', v),
        pill: v => v
    },
    shift: {
        key: 'shift', label: 'Shift', kind: 'select',
        options: () => [opt('', 'Any'), opt('Day', 'Day shift'), opt('US / UK shift'), opt('Rotational')],
        apply: (q, v) => q.eq('shift', v),
        pill: v => `Shift: ${v}`
    },
    workingDays: {
        key: 'workingDays', label: 'Working days', kind: 'select',
        options: () => [opt('', 'Any'), opt('5', '5-day week'), opt('6', '6-day week')],
        apply: (q, v) => q.eq('working_days', Number(v)),
        pill: v => `${v}-day week`
    },
    notice: {
        key: 'notice', label: 'Notice period accepted', kind: 'select',
        options: () => [opt('', 'Any'), opt('0', 'Immediate only'), opt('30', 'Up to 30 days'), opt('60', 'Up to 60 days'), opt('90', 'Up to 90 days')],
        apply: (q, v) => (v === '0' ? q.eq('notice_days', 0) : q.lte('notice_days', Number(v))),
        pill: v => (v === '0' ? 'Notice: immediate' : `Notice: up to ${v} days`)
    }
};

function yoeFilter(bands) {
    return {
        key: 'yoe', label: 'Years of experience', kind: 'select',
        options: () => [opt('', 'Any')].concat(bands.map(b => opt(b.value, b.label))),
        apply: (q, v) => {
            const band = bands.find(b => b.value === v);
            if (!band) return q;
            if (band.min != null) q = q.gte('yoe', band.min);
            if (band.max != null) q = q.lte('yoe', band.max);
            return q;
        },
        pill: v => `Experience: ${(bands.find(b => b.value === v) || {}).label || v}`
    };
}

const ARTICLESHIP = [
    {
        key: 'interRequirement', label: 'CA Inter requirement', kind: 'select',
        options: () => [opt('', 'Any'), opt('Single group accepted', 'One group cleared is enough'), opt('Awaiting result accepted', 'Awaiting result accepted'), opt('Both groups required', 'Both groups required')],
        apply: (q, v) => q.eq('inter_requirement', v),
        pill: v => v
    },
    {
        key: 'ittOc', label: 'ITT & OC', kind: 'select',
        options: () => [opt('', 'Any'), opt('required', 'ITT & OC must be done'), opt('not-mentioned', 'ITT & OC not asked for')],
        apply: (q, v) => (v === 'required' ? q.is('itt_oc_required', true) : q.or(notTrue('itt_oc_required'))),
        pill: v => (v === 'required' ? 'ITT & OC required' : 'ITT & OC not asked')
    },
    {
        key: 'transfer', label: 'Transfer cases', kind: 'chips',
        options: () => [opt('yes', 'Transfer cases accepted')],
        apply: (q, v) => (v.includes('yes') ? q.is('transfer_accepted', true) : q),
        pill: () => 'Transfer cases accepted'
    },
    {
        key: 'exposure', label: 'Work exposure', kind: 'chips',
        options: () => ['Statutory Audit', 'Tax Audit', 'Direct Tax', 'GST', 'Internal Audit', 'Bank Audit', 'ROC & Company Law', 'Litigation',
            'Virtual CFO & Outsourcing', 'Valuation & Due Diligence', 'Transfer Pricing & International Tax', 'Ind AS & IFRS', 'Forensic Audit',
            'Accounting & Finalisation', 'Project Finance'].map(v => opt(v)),
        apply: (q, v) => q.overlaps('exposure_areas', v),
        pill: v => v
    },
    {
        key: 'clientTypes', label: 'Client type', kind: 'chips',
        options: () => ['Listed & MNC clients', 'Foreign clients', 'Banks & NBFCs', 'Startups', 'PSU & Government', 'SMEs & family businesses'].map(v => opt(v)),
        apply: (q, v) => q.overlaps('client_types', v),
        pill: v => v
    },
    {
        key: 'outstation', label: 'Outstation audits', kind: 'select',
        options: () => [opt('', 'Any'), opt('yes', 'Includes outstation audits / travel'), opt('no', 'No travel mentioned')],
        apply: (q, v) => (v === 'yes' ? q.is('outstation_audits', true) : q.or(notTrue('outstation_audits'))),
        pill: v => (v === 'yes' ? 'Outstation audits' : 'No travel mentioned')
    },
    COMMON.payDisclosed,
    COMMON.postedWithin,
    COMMON.applyMethod,
    COMMON.deadline,
    COMMON.company,
    COMMON.locationType
];

const INDUSTRIAL = [
    {
        key: 'finalAttempt', label: 'Your CA Final attempt', kind: 'select',
        options: ({ now }) => [opt('', 'Any')].concat(upcomingFinalAttempts(now).map(v => opt(v, monthLabel(v)))),
        apply: (q, v) => applyAttempt(q, v),
        pill: v => `Final attempt: ${monthLabel(v)}`
    },
    {
        key: 'duration', label: 'Training duration', kind: 'select',
        options: () => [opt('', 'Any'), opt('under12', 'Less than 12 months allowed')],
        apply: (q) => q.lt('duration_min_months', 12),
        pill: () => 'Less than 12 months allowed'
    },
    COMMON.examCriteria,
    {
        key: 'joining', label: 'Joining', kind: 'select',
        options: ({ now }) => [opt('', 'Any'), opt('immediate', 'Immediate joiners')].concat(nextMonths(now, 6).map(v => opt(v, `Joining ${monthLabel(v)}`))),
        apply: (q, v) => (v === 'immediate' ? q.is('immediate_joining', true) : q.eq('joining_month', v)),
        pill: v => (v === 'immediate' ? 'Immediate joiners' : `Joining ${monthLabel(v)}`)
    },
    COMMON.payDisclosed,
    COMMON.postedWithin,
    COMMON.applyMethod,
    COMMON.deadline,
    COMMON.company,
    COMMON.locationType
];

const FRESHER = [
    {
        key: 'qualifyingAttempt', label: 'Your qualifying attempt', kind: 'select',
        options: ({ now }) => [opt('', 'Any')].concat(recentQualifyingAttempts(now).map(v => opt(v, monthLabel(v)))),
        apply: (q, v) => applyAttempt(q, v),
        pill: v => `Qualified: ${monthLabel(v)}`
    },
    COMMON.examCriteria,
    {
        key: 'fresherYoe', label: 'Experience', kind: 'select',
        options: () => [opt('', 'Any'), opt('0', 'Freshers only (0 years)'), opt('1', 'Up to 1 year')],
        apply: (q, v) => (v === '0' ? q.eq('yoe', 0) : q.lte('yoe', 1)),
        pill: v => (v === '0' ? 'Freshers only' : 'Up to 1 year')
    },
    COMMON.workTypes,
    COMMON.shift,
    COMMON.workMode,
    COMMON.immediate,
    COMMON.payDisclosed,
    COMMON.postedWithin,
    COMMON.applyMethod,
    COMMON.deadline,
    COMMON.company,
    COMMON.locationType
];

const EXPERIENCED = [
    yoeFilter([
        { value: '1-3', label: '1–3 years', min: 1, max: 3 },
        { value: '4-6', label: '4–6 years', min: 4, max: 6 },
        { value: '7-9', label: '7–9 years', min: 7, max: 9 },
        { value: '10+', label: '10+ years', min: 10, max: null }
    ]),
    {
        key: 'pqe', label: 'Experience counted', kind: 'select',
        options: () => [opt('', 'Any'), opt('pqe', 'Post-qualification (PQE) asked'), opt('total', 'Total experience is fine')],
        apply: (q, v) => (v === 'pqe' ? q.is('pqe_required', true) : q.or(notTrue('pqe_required'))),
        pill: v => (v === 'pqe' ? 'PQE asked' : 'Total experience is fine')
    },
    COMMON.tools,
    COMMON.notice,
    COMMON.workTypes,
    COMMON.shift,
    COMMON.workMode,
    COMMON.payDisclosed,
    COMMON.postedWithin,
    COMMON.applyMethod,
    COMMON.deadline,
    COMMON.company,
    COMMON.locationType
];

const SEMI = [
    yoeFilter([
        { value: '0-1', label: '0–1 year', min: 0, max: 1 },
        { value: '2-3', label: '2–3 years', min: 2, max: 3 },
        { value: '4-6', label: '4–6 years', min: 4, max: 6 },
        { value: '7+', label: '7+ years', min: 7, max: null }
    ]),
    COMMON.tools,
    COMMON.workMode,
    COMMON.workTypes,
    COMMON.workingDays,
    COMMON.payDisclosed,
    COMMON.postedWithin,
    COMMON.applyMethod,
    COMMON.deadline,
    COMMON.company,
    COMMON.locationType
];

export const FILTERS_BY_PORTAL = {
    [PORTALS.ARTICLESHIP]: ARTICLESHIP,
    [PORTALS.INDUSTRIAL]: INDUSTRIAL,
    [PORTALS.FRESHER]: FRESHER,
    [PORTALS.EXPERIENCED]: EXPERIENCED,
    [PORTALS.SEMI]: SEMI
};

// Firm size (Articleship) and Company Type (the rest). The www pages have their own dropdowns for
// these; mobile.mystudentclub.com shows them through this module (options.withTypeFilters).
// The tiers include each other: Big 6 = Big 4 + Grant Thornton + BDO; Big 10 adds RSM, Forvis Mazars,
// Baker Tilly (ASA) and Nexdigm. Each firm is stored at its smallest tier.
export const FIRM_TIERS = {
    'Big 4': ['Big 4'],
    'Big 6': ['Big 4', 'Big 6'],
    'Big 10': ['Big 4', 'Big 6', 'Big 10']
};

const FIRM_SIZE = {
    key: 'firmSize', label: 'Firm size', kind: 'select',
    options: () => [opt('', 'Any'), opt('Big 4'), opt('Big 6'), opt('Big 10'), opt('Mid-size CA Firm'), opt('Small-size CA Firm'), opt('Other', 'Other CA firms')],
    apply: (q, v) => (FIRM_TIERS[v] ? q.in('firm_size', FIRM_TIERS[v]) : q.eq('firm_size', v)),
    pill: v => v
};

const COMPANY_TYPE = {
    key: 'companyType', label: 'Company type', kind: 'select',
    options: () => [opt('', 'Any'), opt('Big 4'), opt('Big 6'), opt('MNC'), opt('Global Capability Centre (GCC)'), opt('Listed Company'),
        opt('Unlisted Company'), opt('Startup'), opt('Unicorn'), opt('Bank / NBFC'), opt('Investment Bank'), opt('PE / VC Fund'),
        opt('Consulting'), opt('CA Firm'), opt('Government / PSU'), opt('Family-Owned Business'), opt('Other')],
    apply: (q, v) => q.or(companyTypeFilter(v)),
    pill: v => v
};

// employer_type holds the Company Type in these labels; a posted "Company Type" always matches too,
// and both spellings of Consulting are the same thing.
export function companyTypeFilter(value) {
    const aliases = (value === 'Consulting' || value === 'Consulting Firm') ? ['Consulting', 'Consulting Firm'] : [value];
    const quote = v => `"${String(v).replace(/"/g, '')}"`;
    return aliases.map(v => `employer_type.eq.${quote(v)}`).concat(aliases.map(v => `"Company Type".eq.${quote(v)}`)).join(',');
}

export function filtersFor(portal, { withTypeFilters = false } = {}) {
    const defs = FILTERS_BY_PORTAL[portal] || [];
    if (!withTypeFilters || defs.length === 0) return defs;
    return [portal === PORTALS.ARTICLESHIP ? FIRM_SIZE : COMPANY_TYPE].concat(defs);
}

function isSet(value) {
    if (Array.isArray(value)) return value.length > 0;
    return value != null && String(value).trim() !== '';
}

// Narrow a Supabase query by every filter the student has set.
export function applyJobFilters(q, portal, values = {}, now = new Date(), options = {}) {
    for (const def of filtersFor(portal, options)) {
        const value = values[def.key];
        if (!isSet(value)) continue;
        q = def.apply(q, value, now) || q;
    }
    return q;
}

// One entry per chosen value, for the "active filters" pills: { key, value, label }.
export function describeJobFilters(portal, values = {}, options = {}) {
    const out = [];
    for (const def of filtersFor(portal, options)) {
        const value = values[def.key];
        if (!isSet(value)) continue;
        if (Array.isArray(value)) {
            for (const item of value) out.push({ key: def.key, value: item, label: def.pill(item) });
        } else {
            out.push({ key: def.key, value, label: def.pill(value) });
        }
    }
    return out.filter(p => p.label);
}

// Remove one chosen value (a chip) or the whole filter.
export function withoutFilterValue(values, key, value) {
    const next = { ...values };
    if (Array.isArray(next[key])) {
        next[key] = next[key].filter(v => v !== value);
        if (next[key].length === 0) delete next[key];
    } else {
        delete next[key];
    }
    return next;
}

function escapeHtml(text) {
    return String(text == null ? '' : text)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Render the controls for a portal into `container`. `getValues()` returns the current values,
// `onChange(nextValues)` is called on every change (the caller decides whether to fetch now).
// `classes` lets each site use its own form styles.
export function renderJobFilters(container, portal, {
    getValues, onChange, idPrefix = 'jf', now = new Date(), payKind = 'monthly', withTypeFilters = false,
    classes = { group: 'filter-group', label: '', select: 'filter-control', text: 'multi-select-input' }
}) {
    if (!container) return;
    const defs = filtersFor(portal, { withTypeFilters });
    const ctx = { now, payKind };
    container.innerHTML = defs.map(def => {
        const id = `${idPrefix}-${def.key}`;
        let control = '';
        if (def.kind === 'select') {
            control = `<select id="${id}" class="${classes.select || ''} jf-select" data-key="${def.key}">${def.options(ctx)
                .map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('')}</select>`;
        } else if (def.kind === 'chips') {
            const options = def.options(ctx);
            control = `<div class="jf-chip-options" data-key="${def.key}">${options
                .map(o => `<button type="button" class="jf-chip" data-key="${def.key}" data-value="${escapeHtml(o.value)}" aria-pressed="false">${escapeHtml(o.label)}</button>`).join('')}</div>`;
        } else if (def.kind === 'text') {
            control = `<input type="text" id="${id}" class="${classes.text || ''} jf-text" data-key="${def.key}" placeholder="${escapeHtml(def.placeholder || '')}" autocomplete="off">`;
        }
        const labelFor = def.kind === 'chips' ? '' : ` for="${id}"`;
        const labelClass = classes.label ? ` class="${classes.label}"` : '';
        return `<div class="${classes.group || ''} jf-group" data-key="${def.key}"><label${labelFor}${labelClass}>${escapeHtml(def.label)}</label>${control}</div>`;
    }).join('');

    container.querySelectorAll('.jf-select').forEach(select => {
        select.addEventListener('change', () => {
            const next = { ...getValues() };
            if (select.value) next[select.dataset.key] = select.value; else delete next[select.dataset.key];
            onChange(next);
        });
    });
    container.querySelectorAll('.jf-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const key = chip.dataset.key;
            const value = chip.dataset.value;
            const current = Array.isArray(getValues()[key]) ? getValues()[key] : [];
            const next = { ...getValues() };
            next[key] = current.includes(value) ? current.filter(v => v !== value) : current.concat(value);
            if (next[key].length === 0) delete next[key];
            onChange(next);
        });
    });
    container.querySelectorAll('.jf-text').forEach(input => {
        const commit = () => {
            const next = { ...getValues() };
            const text = input.value.trim();
            if (text) next[input.dataset.key] = text; else delete next[input.dataset.key];
            if ((getValues()[input.dataset.key] || '') !== (next[input.dataset.key] || '')) onChange(next);
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
        input.addEventListener('change', commit);
    });
    syncJobFilters(container, getValues());
}

// Show `values` in already-rendered controls.
export function syncJobFilters(container, values = {}) {
    if (!container) return;
    container.querySelectorAll('.jf-select').forEach(select => {
        select.value = values[select.dataset.key] || '';
    });
    container.querySelectorAll('.jf-chip').forEach(chip => {
        const chosen = Array.isArray(values[chip.dataset.key]) && values[chip.dataset.key].includes(chip.dataset.value);
        chip.classList.toggle('active', chosen);
        chip.setAttribute('aria-pressed', chosen ? 'true' : 'false');
    });
    container.querySelectorAll('.jf-text').forEach(input => {
        if (input.ownerDocument.activeElement !== input) input.value = values[input.dataset.key] || '';
    });
}

// "₹10k – ₹12k" / "₹8 – 12 LPA" from pay_min / pay_max, for cards with no written pay text.
export function formatPayRange(job, annual) {
    const min = Number(job && job.pay_min);
    const max = Number(job && job.pay_max);
    if (!min && !max) return '';
    const fmt = n => {
        if (annual) {
            const lakhs = n / 100000;
            return `${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)}`;
        }
        if (n >= 1000) {
            const k = n / 1000;
            return `₹${Number.isInteger(k) ? k : k.toFixed(1)}k`;
        }
        return `₹${n}`;
    };
    const lo = min || max;
    const hi = max || min;
    if (annual) return lo === hi ? `₹${fmt(lo)} LPA` : `₹${fmt(lo)} – ${fmt(hi)} LPA`;
    return lo === hi ? `${fmt(lo)}/month` : `${fmt(lo)} – ${fmt(hi)}/month`;
}

// "Apply by 15 Nov" for a deadline that has not passed.
export function formatDeadline(job, now = new Date()) {
    if (!job || !job.deadline) return '';
    const [y, m, d] = String(job.deadline).slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return '';
    if (String(job.deadline).slice(0, 10) < isoDate(now)) return '';
    return `Apply by ${d} ${MONTHS[m - 1]}`;
}
