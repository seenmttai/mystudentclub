// Applications, saved jobs and hirer posts across the CA / CS / CMA lanes:
// which lane an entry on the Applications page (history.html) belongs to and
// where its link goes, how the hirer dashboard pairs a job_applications row
// with its job, how it describes a CS / CMA candidate, and the "Open to" line
// post-a-job adds. DOM-free; tested in tests/applications.test.cjs.
//
// job_applications.job_table stays the physical table name (or "Table|uuid"):
// hirer RLS and the unlock worker match it exactly, so lanes never go there.

import { QUALIFICATIONS, QUALIFICATION_ORDER, laneById, lanesFor, normalizeQualification } from './courses.js';
import { courseMatches } from './match.js';
import { fieldLabel, fieldValueLabel, stageSummary, trainingSummary } from './profile-fields.js';

// Words older rows stored instead of the table name.
const TABLE_ALIASES = {
    industrial: 'Industrial Training Job Portal',
    'industrial-training': 'Industrial Training Job Portal',
    fresher: 'Fresher Jobs',
    freshers: 'Fresher Jobs',
    experienced: 'Fresher Jobs',
    semi: 'Semi Qualified Jobs',
    'semi-qualified': 'Semi Qualified Jobs',
    articleship: 'Articleship Jobs'
};

export function normalizeTable(table) {
    const raw = String(table ?? '').trim();
    return TABLE_ALIASES[raw.toLowerCase()] || raw;
}

// job_applications row -> { table, id } of the job. UUID job ids ride in
// job_table as "Table|uuid" (job_id then holds a placeholder number).
export function applicationRef(row) {
    const raw = String(row?.job_table ?? '');
    const bar = raw.indexOf('|');
    if (bar >= 0) return { table: normalizeTable(raw.slice(0, bar)), id: raw.slice(bar + 1).trim() };
    return { table: normalizeTable(raw), id: String(row?.job_id ?? '').trim() };
}

// Does this application belong to this job? Ids repeat across the four
// tables, so the table must agree too whenever the job says which it is in.
export function applicationMatchesJob(row, job) {
    if (!row || !job) return false;
    const ref = applicationRef(row);
    if (!ref.id || ref.id !== String(job.id ?? '').trim()) return false;
    const jobTable = normalizeTable(job.table_name || job.table || '');
    return !jobTable || ref.table === jobTable;
}

// The lane of `qualification` that reads `table`; Experience splits Fresher
// Jobs into its fresher and experienced lanes.
export function laneForTable(table, experience = null, qualification = 'ca') {
    const lanes = lanesFor(qualification).filter(lane => lane.table === normalizeTable(table));
    if (lanes.length <= 1) return lanes[0] || null;
    const wanted = experience === 'Experienced' ? 'Experienced' : 'Freshers';
    return lanes.find(lane => lane.experience === wanted) || lanes[0];
}

// Saved job ({ id, table, lane?, savedAt } in localStorage msc_saved_jobs).
// Entries saved before lanes existed, or whose lane reads another table, are
// the CA lane for their table.
export function laneForSaved(ref, job = null) {
    const lane = laneById(ref?.lane);
    if (lane && lane.table === normalizeTable(ref?.table)) {
        if (lane.experience && job?.Experience) return laneForTable(lane.table, job.Experience, lane.qualification);
        return lane;
    }
    return laneForTable(ref?.table, job?.Experience, 'ca');
}

// Applied job: job_applications has no lane column, so a CS / CMA student's
// application counts as their course's lane when the listing names the
// course (the same patterns the CS / CMA lanes use). Everything else is CA.
// `table` may be the stored word: rows saying "experienced" stay Experienced
// CA even when the listing is gone and its Experience is unknown.
export function laneForApplication(table, job, studentQualification) {
    const experience = job?.Experience
        || (String(table ?? '').trim().toLowerCase() === 'experienced' ? 'Experienced' : null);
    const qualification = normalizeQualification(studentQualification);
    const match = qualification ? QUALIFICATIONS[qualification].match : null;
    if (match && courseMatches(job?.Description, match)) {
        const lane = laneForTable(table, experience, qualification);
        if (lane) return lane;
    }
    return laneForTable(table, experience, 'ca');
}

// Chip text. CA lanes keep their tab names ("CA Freshers", "Experienced CA");
// CS / CMA lead with the course: "CS · Semi Qualified", "CMA · Freshers".
export function laneChipLabel(lane) {
    if (!lane) return '';
    if (lane.qualification === 'ca') return lane.navLabel;
    const code = QUALIFICATIONS[lane.qualification].label;
    const rest = lane.navLabel.replace(new RegExp(`\\b${code}\\b`, 'g'), '').replace(/\s+/g, ' ').trim();
    return `${code} · ${rest || lane.navLabel}`;
}

// Where an entry opens: the lane page, which unlocks and applies as usual.
export function laneJobLink(lane, jobId) {
    const target = lane || laneById('ca-industrial');
    return `${target.path}?id=${encodeURIComponent(jobId)}&type=${encodeURIComponent(target.shareType)}`;
}

// ----------------------------------------------------------------- post-a-job

// "Who can apply?" -> the line appended to a post's description. The job
// tables have no eligibility column yet, so the CS / CMA lane patterns read
// it from here. A CA-only post gets no line (CA lanes show every listing).
export function openToLine(codes) {
    const wanted = new Set((codes || []).map(code => String(code).trim().toUpperCase()));
    const picked = QUALIFICATION_ORDER.map(key => QUALIFICATIONS[key].code).filter(code => wanted.has(code));
    if (!picked.some(code => code !== 'CA')) return '';
    return `Open to: ${picked.join(' / ')} students`;
}

export function withOpenToLine(description, codes) {
    const text = String(description ?? '').trimEnd();
    const line = openToLine(codes);
    return line ? `${text}\n\n${line}` : text;
}

// ----------------------------------------------------------------- hirer view

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function monthYear(month, year) {
    const y = String(year ?? '').trim();
    if (!y) return '';
    const m = MONTH_NAMES[Number(month) - 1];
    return m ? `${m} ${y}` : y;
}

function joinParts(parts) {
    return parts.filter(Boolean).join(' · ');
}

function examLine(p, prefix, statusKey, attemptsKey) {
    const status = fieldValueLabel(statusKey, p[statusKey]);
    const attempts = attemptsKey && p[attemptsKey] ? `${p[attemptsKey]} attempt${String(p[attemptsKey]) === '1' ? '' : 's'}` : '';
    const passed = monthYear(p[`${prefix}_clear_month`], p[`${prefix}_clear_year`]);
    return joinParts([status, attempts, passed ? `passed ${passed}` : '']);
}

function trainingPeriod(p, prefix) {
    const start = monthYear(p[`${prefix}_training_start_month`], p[`${prefix}_training_start_year`]);
    const end = p[`${prefix}_training_is_current`] === 'yes'
        ? 'present'
        : monthYear(p[`${prefix}_training_end_month`], p[`${prefix}_training_end_year`]);
    if (!start && !end) return '';
    return `${start || '?'} – ${end || '?'}`;
}

// What the hirer dashboard shows for a CS / CMA candidate in place of the CA
// rows (which would all read "Not provided"). null for CA: CA candidates
// keep the existing layout. Values are plain text; the page escapes them.
export function candidateDetails(qualification, profile = {}) {
    const q = normalizeQualification(qualification);
    if (!q || q === 'ca') return null;
    const p = profile || {};
    const graduation = p.grad_degree ? `${p.grad_degree}${p.grad_percentage ? ` (${p.grad_percentage}%)` : ''}` : '';
    const prefix = q;
    const academics = q === 'cs'
        ? [
            [fieldLabel('cs_exec_status'), examLine(p, 'cs_exec', 'cs_exec_status', 'cs_exec_attempts')],
            [fieldLabel('cs_edp_done'), fieldValueLabel('cs_edp_done', p.cs_edp_done)],
            [fieldLabel('cs_prof_status'), examLine(p, 'cs_prof', 'cs_prof_status', null)],
            [fieldLabel('cs_acs_no'), p.cs_acs_no],
            [fieldLabel('cs_icsi_reg_no'), p.cs_icsi_reg_no],
            ['Graduation', graduation]
        ]
        : [
            [fieldLabel('cma_inter_status'), examLine(p, 'cma_inter', 'cma_inter_status', 'cma_inter_attempts')],
            [fieldLabel('cma_final_status'), examLine(p, 'cma_final', 'cma_final_status', null)],
            [fieldLabel('cma_acma_no'), p.cma_acma_no],
            [fieldLabel('cma_icmai_reg_no'), p.cma_icmai_reg_no],
            ['Graduation', graduation]
        ];
    const experience = [
        [fieldLabel(`${prefix}_training_type`), fieldValueLabel(`${prefix}_training_type`, p[`${prefix}_training_type`])],
        [fieldLabel(`${prefix}_training_org`), p[`${prefix}_training_org`]],
        ['Training period', trainingPeriod(p, prefix)],
        ['Key Skills', p.key_skills]
    ];
    const clean = rows => rows.map(([label, value]) => [label, String(value ?? '').trim()]);
    return {
        qualification: q,
        chip: QUALIFICATIONS[q].label,
        stage: stageSummary(q, p),
        training: trainingSummary(q, p),
        academics: { title: `${QUALIFICATIONS[q].label} Status & Academics`, rows: clean(academics) },
        experience: { title: 'Training & Work Experience', rows: clean(experience) }
    };
}
