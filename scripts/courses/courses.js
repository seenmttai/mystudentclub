// Qualifications (CA, CS, CMA) and their job lanes: the one registry the
// portal engine (scripts/portal3.js), the profile pages, the page generator
// (scripts/courses/build-pages.js) and the tests read. DOM-free on purpose.
//
// Every lane reads one of the four job tables. CA lanes show the whole table,
// exactly as before. CS and CMA lanes show only listings whose description
// says CS or CMA candidates can apply, using three PostgreSQL regexes per
// course, applied in this order so PostgREST stays inside the anon timeout:
//   pre - cheap token gate (any CS / CMA-like word at all)
//   pos - the course is named as an accepted qualification
//   neg - the listing turns the course away, only wants it on top of a
//         mandatory CA, means US CMA (IMA) / CGMA, or uses "CMA" for a bank's
//         Credit Monitoring Arrangement
// Labelled against every CS match and a sample of CMA matches from the last
// 60 days on 2026-10-17: about 99% precise for both. Older listings (the
// 180-day regex window) are noisier; team-composition posts ("a firm of CAs,
// CSs and Cost Accountants") need eligible_courses to be corrected by hand. After cs-cma-portal.sql
// runs, lanes filter on the indexed eligible_courses column instead.

export const SITE = 'https://www.mystudentclub.com';

const CS_MATCH = {
    pre: String.raw`(\mcs\M|company\s+secretar|icsi|\macs\M)`,
    pos: String.raw`((\mca|\mcma|\micwai?|\mcwa|\mmba|\mllb|\mcfa|\mcpa|\macca|\mcia|\mm\.?\s?com|\mb\.?\s?com|\mbba|\mbaf|\mgraduates?|\minter|\mipcc|\mfrm)\M\s*\)?\s*(,\s*or\s|,\s*and\s|/|,|&|\||\sor\s|\sand\s|and\s*/\s*or)\s*(semi[\s-]*qualified\s+)?\ma?cs\M(?!\s*(firms?|partners|consultants)\M)|\ma?cs\M(?!\s*(firms?|partners|consultants)\M)\s*(\(\s*[a-z]+\s*\))?\s*(/|,|&|\||\sor\s|\sand\s)\s*(ca|cma|icwai?|cwa|mba|llb|law|cfa|cpa|acca|m\.?\s?com|b\.?\s?com)\M|\ma?cs\M(?!\s*(firms?|partners|consultants)\M)\s*[-–(]?\s*(executive|professional|inter|intermediate|final|foundation|qualified|semi|trainee|student|aspirant|fresher|dropout|drop\s*out|article|pursuing|cleared|appeared|member|candidate|course)|(qualified|pursuing|\minter|fresher|aspiring)\s+(ca\s*/\s*)?\ma?cs\M(?!\s*(firms?|partners|consultants)\M)|(qualified|fresher|practi[sc]ing|aspiring|trainee)\s+(ca\s*/\s*)?company\s+secretar|company\s+secretar(y|ies)\s*[-–(:]*\s*(trainee|fresher|intern|executive|professional|cs\M|qualified|\d)|(accountant|\mca|\mcma|\micwa)\M\s*(\([a-z]+\))?\s*(/|,|\sor\s)\s*(cost\s*(&|and)?\s*(management|works)?\s*accountant\s*(/|,|\sor\s)\s*)?company\s+secretary\M|(hiring|looking\s+for|inviting|applications\s+from|openings?\s+for)[a-z\s-]*company\s+secretar|\micsi\M(?!\s+invoic))`,
    neg: String.raw`(not\s+eligible[^.\n]*\ma?cs\M|((\mca\M|chartered\s+accountant)[^.\n•]*(mandatory|required|is\s+a\s+must)|must\s+be\s+(an?\s+)?(qualified\s+)?(\mca\M|chartered\s+accountant))[^.\n•]*\ma?cs\M[^.\n•]*(advantage|plus|preferable|good\s+to\s+have|in\s+addition)|\mca\s*\+\s*cs\M|required:?\s*(qualified\s+)?ca\s*(&|and)\s*cs\M|(\mca\M|chartered\s+accountant)\s*(\(ca\))?\s*(&|and|with)\s*(company\s+secretary|\mcs\M)\s*(\(cs\))?\s*(qualification|mandatory))`
};

const CMA_MATCH = {
    pre: String.raw`(\mcmas?\M|icwa|\mcwa\M|icmai?|cost\s*(and|&)?\s*(management|works)?\s*accountan|\macma\M)`,
    pos: String.raw`((?<!us\s)\mcmas?\M(?!\s*[-–:(]?\s*(data|prep|report|credit|statement|projection|format|study|working|project\s+fin|\(?\s*(us|usa|u\.s|ima)\M))|\micwai?s?\M|\maicwa|\mcwa\M|\micmai?\M|cost\s*(and|&)?\s*(management|works)?\s*accountan|\macma\M)`,
    neg: String.raw`(not\s+eligible[^.\n]*(\mcma\M|icwa)|\mcma\M[^.\n]*(not\s+eligible|should\s+not\s+apply|need\s+not\s+apply)|\mno\s+cma\M|❌[^.\n]*\mcma\M|((\mca\M|chartered\s+accountant)[^.\n•]*(mandatory|required|is\s+a\s+must)|must\s+be\s+(an?\s+)?(qualified\s+)?(\mca\M|chartered\s+accountant))[^.\n•]*(\mcma\M|icwa)[^.\n•]*(advantage|plus|preferable|good\s+to\s+have|in\s+addition)|\mus\s+cpa\s*/\s*cma\M|certified\s+management\s+accountant|\mcgma\M|\mcma\M[^.\n;]{0,40}not\s+considered|exclusively\s+for[^.\n]{0,40}\mca\s+(training|articleship)|\mbank\s+cma\M|\mcma\s*(/|&|and)\s*(working|lender|mca\M)|\m\d+\s+cma\s+partners)`
};

// Firm-training lanes read the CA articleship table, so most posts come from
// CA firms that also invite CS / CMA students. Neither ICSI nor ICMAI counts
// training at a CA firm, so the portal flags posts that name a CA firm, or no
// trainer the institute accepts. Statutory audit is reserved for CAs, so an
// audit firm here is a CA firm.
const CA_FIRM = String.raw`chartered\s+accountan|\micitss\M|\mca(\s*/\s*(cs|cma|acca))*\s+(firm|articles?|articled|articleship)\M|\micai\M|\maudit\s+firm|audit\s+and\s+[a-z]+\s+firm|accounting\s+(and|&)\s+audit\s+firm|statutory\s+(and\s+[a-z-]+\s+)?audits?\M`;

export const QUALIFICATIONS = {
    ca: {
        key: 'ca',
        code: 'CA',
        label: 'CA',
        name: 'Chartered Accountancy',
        student: 'CA student',
        institute: 'ICAI',
        instituteUrl: 'https://www.icai.org/',
        match: null,
        homePath: '/'
    },
    cs: {
        key: 'cs',
        code: 'CS',
        label: 'CS',
        name: 'Company Secretary',
        student: 'CS student',
        institute: 'ICSI',
        instituteUrl: 'https://www.icsi.edu/',
        match: CS_MATCH,
        homePath: '/cs-articleship',
        // LinkedIn "Connect to peers" search terms (CA keeps its own queries).
        peersKeywords: '("Company Secretary" OR "CS Executive" OR "CS Professional")'
    },
    cma: {
        key: 'cma',
        code: 'CMA',
        label: 'CMA',
        name: 'Cost and Management Accountant',
        student: 'CMA student',
        institute: 'ICMAI',
        instituteUrl: 'https://icmai.in/',
        match: CMA_MATCH,
        homePath: '/cma-articleship',
        peersKeywords: '("CMA" OR "Cost Accountant" OR "ICWA")'
    }
};

export const QUALIFICATION_ORDER = ['ca', 'cs', 'cma'];

// Regex-mode CS/CMA queries only look this far back, so a lane with few
// matches (CS training in companies) cannot scan the whole table.
export const REGEX_WINDOW_DAYS = 180;

const CS_TRAINER_CHECK = {
    trainer: String.raw`practi[sc]ing\s+company\s+secretar|\mpcs\M|firm\s+of\s+(practi[sc]ing\s+)?company\s+secretar|company\s+secretar(y|ies)\s+firm|\mcs\s+firm|(&|and)\s*(co|associates)\.?,?\s+company\s+secretaries`,
    caFirm: CA_FIRM,
    'ca-firm': {
        badge: 'CA firm: check ICSI registration',
        note: 'This listing looks like a CA firm. ICSI generally does not count training at CA firms, so before you join, ask whether a Practising Company Secretary will register your 21-month training with ICSI.'
    },
    unnamed: {
        badge: 'No PCS named: check ICSI registration',
        note: 'This listing does not name a Practising Company Secretary. Before you join, ask who will register your 21-month training with ICSI.'
    }
};

const CMA_TRAINER_CHECK = {
    trainer: String.raw`practi[sc]ing\s+cost\s+accountant|firm\s+of\s+cost\s+accountant|cost\s+accountants?\s+firm|(&|and)\s*(co|associates)\.?,?\s+cost\s+accountants|,\s*cost\s+accountants\M|\mcma\s+firm`,
    caFirm: CA_FIRM,
    'ca-firm': {
        badge: 'CA firm: check Form T-1',
        note: 'This listing looks like a CA firm. CA articleship does not count for CMA: the months count only if a Practising Cost Accountant signs your Form T-1, so ask before you join.'
    },
    unnamed: {
        badge: 'No Cost Accountant named: check Form T-1',
        note: 'This listing does not name a Practising Cost Accountant. Firm training counts for CMA only if one signs your Form T-1, so ask before you join.'
    }
};

const IND = 'Industrial Training Job Portal';
const ART = 'Articleship Jobs';
const SEMI = 'Semi Qualified Jobs';
const FRESH = 'Fresher Jobs';

// Lane fields:
//   id, qualification, slot (industrial | articleship | semi | fresher |
//   experienced: the CA lane it mirrors, also its tab icon), path (+ aliases),
//   table (physical table: never changes, the unlock worker, job_applications
//   and hirer RLS depend on it), experience ('Freshers' | 'Experienced' on
//   Fresher Jobs), navLabel (lane tab, two words max to fit the mobile grid),
//   roleLabel (card role fallback), emailSubject, aiTitle (AI cover letter
//   job title), shareType (job.html ?type=), bannerType (Banners.Type),
//   preferences (profile.job_preference keys that land here; first is
//   canonical), lookingFor (profiles.looking_for label), gate.premium (which
//   enrolment unlocks AI Apply / Connect to peers / Original post),
//   gate.recruiterLocked (recruiter Easy Apply posts need an enrolment),
//   hideCuratedExclusive (hide admin-curated programme-only listings).
//   CS/CMA pages also carry the SEO copy and the source CA page they are
//   generated from (scripts/courses/build-pages.js).
export const LANES = [
    // ------------------------------------------------------------- CA
    {
        id: 'ca-industrial', qualification: 'ca', slot: 'industrial', table: IND, experience: null,
        path: '/', aliases: ['/index', '/index.html'], file: 'index.html',
        navLabel: 'Industrial Training', roleLabel: 'Industrial Trainee',
        emailSubject: 'Application for CA Industrial Training', aiTitle: 'Industrial Trainee',
        shareType: 'industrial', bannerType: 'Industrial',
        preferences: ['industrial'], lookingFor: 'CA Industrial Training Default',
        gate: { premium: 'industrialTraining', recruiterLocked: true }
    },
    {
        id: 'ca-articleship', qualification: 'ca', slot: 'articleship', table: ART, experience: null,
        path: '/ca-articleship-opportunities', file: 'ca-articleship-opportunities.html',
        navLabel: 'Articleship', roleLabel: 'Articleship',
        emailSubject: 'Application for CA Articleship', aiTitle: 'Articleship Trainee',
        shareType: 'articleship', bannerType: 'Articleship',
        preferences: ['articleship'], lookingFor: 'CA Articleship',
        gate: { premium: 'any', recruiterLocked: true }
    },
    {
        id: 'ca-semi', qualification: 'ca', slot: 'semi', table: SEMI, experience: null,
        path: '/semi-qualified-ca-jobs', file: 'semi-qualified-ca-jobs.html',
        navLabel: 'Semi Qualified', roleLabel: 'Professional',
        emailSubject: 'Application for Semi Qualified CA Position', aiTitle: 'Semi Qualified Chartered Accountant',
        shareType: 'semi', bannerType: 'Semi-Qualified',
        preferences: ['semi_fresher', 'semi_experienced'], lookingFor: 'Semi Qualified CA',
        gate: { premium: 'any', recruiterLocked: true }
    },
    {
        id: 'ca-fresher', qualification: 'ca', slot: 'fresher', table: FRESH, experience: 'Freshers',
        path: '/ca-fresher-jobs', file: 'ca-fresher-jobs.html',
        navLabel: 'CA Freshers', roleLabel: 'Professional',
        emailSubject: 'Application for CA Fresher Position', aiTitle: 'CA Fresher',
        shareType: 'fresher', bannerType: 'Freshers',
        preferences: ['fresher_fresher'], lookingFor: 'CA Fresher',
        gate: { premium: 'any', recruiterLocked: true }
    },
    {
        id: 'ca-experienced', qualification: 'ca', slot: 'experienced', table: FRESH, experience: 'Experienced',
        path: '/experienced-ca-jobs', file: 'experienced-ca-jobs.html',
        navLabel: 'Experienced CA', roleLabel: 'Professional',
        emailSubject: 'Application for CA Fresher Position', aiTitle: 'CA Fresher',
        shareType: 'fresher', bannerType: 'Freshers',
        preferences: ['fresher_experienced'], lookingFor: 'CA Fresher',
        gate: { premium: 'any', recruiterLocked: true }
    },

    // ------------------------------------------------------------- CS (ICSI)
    {
        id: 'cs-articleship', qualification: 'cs', slot: 'articleship', table: ART, experience: null,
        path: '/cs-articleship', file: 'cs-articleship.html', source: 'ca-articleship-opportunities.html',
        navLabel: 'Articleship', roleLabel: 'CS Trainee',
        emailSubject: 'Application for CS Training (Articleship)', aiTitle: 'CS Trainee (Articleship)',
        shareType: 'cs-articleship', bannerType: 'CS',
        preferences: ['cs_articleship'], lookingFor: 'CS Articleship',
        gate: { premium: 'any', recruiterLocked: false },
        trainerCheck: CS_TRAINER_CHECK,
        title: 'CS Articleship & Trainee Openings at Firms - My Student Club',
        description: 'CS articleship and trainee openings at firms that invite CS Executive and Professional students. We flag CA firms, where you must confirm ICSI will count your 21-month training.',
        keywords: 'CS articleship, CS training, company secretary training, CS executive articleship, PCS firm training',
        note: {
            title: 'Check before you join',
            body: 'ICSI counts the 21 months only under a registered trainer such as a Practising Company Secretary. Most firms here are CA firms, so we flag them: ask who will register your training.',
            source: 'https://www.icsi.edu/long-term-training'
        }
    },
    {
        id: 'cs-industrial', qualification: 'cs', slot: 'industrial', table: IND, experience: null,
        path: '/cs-training-in-companies', file: 'cs-training-in-companies.html', source: 'index.html',
        navLabel: 'Company Training', roleLabel: 'Trainee',
        emailSubject: 'Application for CS Management Trainee', aiTitle: 'CS Management Trainee',
        shareType: 'cs-industrial', bannerType: 'CS',
        preferences: ['cs_industrial'], lookingFor: 'CS Industrial Training',
        gate: { premium: 'any', recruiterLocked: false }, hideCuratedExclusive: true,
        // Companies rarely post CS training here: keep it out of search
        // results and send course switches to articleship instead.
        noindex: true, thin: true,
        title: 'CS Training in Companies (Management Trainee) - My Student Club',
        description: 'CS management trainee openings in companies, banks and PSUs for CS Executive and Professional passed students, when companies post them here.',
        keywords: 'CS management trainee, CS training in company, company secretary trainee',
        note: {
            title: 'Few openings here',
            body: 'Companies rarely post CS training seats, and a company can train CS students only if it employs a whole-time Company Secretary.',
            source: 'https://www.icsi.edu/long-term-training',
            links: [
                { label: 'CS articleship', href: '/cs-articleship' },
                { label: 'semi-qualified CS jobs', href: '/semi-qualified-cs-jobs' }
            ]
        }
    },
    {
        id: 'cs-semi', qualification: 'cs', slot: 'semi', table: SEMI, experience: null,
        path: '/semi-qualified-cs-jobs', file: 'semi-qualified-cs-jobs.html', source: 'semi-qualified-ca-jobs.html',
        navLabel: 'Semi Qualified', roleLabel: 'Professional',
        emailSubject: 'Job Application (Semi-qualified CS)', aiTitle: 'Semi Qualified Company Secretary',
        shareType: 'cs-semi', bannerType: 'CS',
        preferences: ['cs_semi_fresher', 'cs_semi_experienced'], lookingFor: 'Semi Qualified CS',
        gate: { premium: 'any', recruiterLocked: false },
        title: 'Semi-Qualified CS Jobs for CS Executive & Professional Passed - My Student Club',
        description: 'Jobs that accept semi-qualified CS (Executive or Professional passed): accounts, audit, tax, compliance and secretarial roles at firms and companies.',
        keywords: 'semi qualified CS jobs, CS executive jobs, CS professional jobs, compliance executive jobs'
    },
    {
        id: 'cs-fresher', qualification: 'cs', slot: 'fresher', table: FRESH, experience: 'Freshers',
        path: '/cs-fresher-jobs', file: 'cs-fresher-jobs.html', source: 'ca-fresher-jobs.html',
        navLabel: 'CS Freshers', roleLabel: 'Professional',
        emailSubject: 'Application for Company Secretary (Fresher) Role', aiTitle: 'Company Secretary (Fresher)',
        shareType: 'cs-fresher', bannerType: 'CS',
        preferences: ['cs_fresher_fresher'], lookingFor: 'CS Fresher',
        gate: { premium: 'any', recruiterLocked: false },
        title: 'Company Secretary Fresher Jobs for Newly Qualified CS - My Student Club',
        description: 'Company Secretary fresher jobs for newly qualified ACS: assistant company secretary, compliance officer and secretarial roles, updated daily.',
        keywords: 'company secretary fresher jobs, CS fresher jobs, ACS jobs, compliance officer jobs'
    },
    {
        id: 'cs-experienced', qualification: 'cs', slot: 'experienced', table: FRESH, experience: 'Experienced',
        path: '/experienced-cs-jobs', file: 'experienced-cs-jobs.html', source: 'experienced-ca-jobs.html',
        navLabel: 'Experienced CS', roleLabel: 'Professional',
        emailSubject: 'Application for Company Secretary Role', aiTitle: 'Company Secretary',
        shareType: 'cs-experienced', bannerType: 'CS',
        preferences: ['cs_fresher_experienced'], lookingFor: 'CS Experienced',
        gate: { premium: 'any', recruiterLocked: false },
        title: 'Experienced Company Secretary Jobs & Compliance Roles - My Student Club',
        description: 'Company Secretary and compliance officer roles for experienced ACS and FCS at listed companies, NBFCs and firms.',
        keywords: 'experienced company secretary jobs, ACS FCS jobs, compliance officer jobs'
    },

    // ------------------------------------------------------------- CMA (ICMAI)
    {
        id: 'cma-articleship', qualification: 'cma', slot: 'articleship', table: ART, experience: null,
        path: '/cma-articleship', file: 'cma-articleship.html', source: 'ca-articleship-opportunities.html',
        navLabel: 'Articleship', roleLabel: 'CMA Trainee',
        emailSubject: 'Application for CMA Practical Training (Articleship)', aiTitle: 'CMA Trainee (Articleship)',
        shareType: 'cma-articleship', bannerType: 'CMA',
        preferences: ['cma_articleship'], lookingFor: 'CMA Articleship',
        gate: { premium: 'any', recruiterLocked: false },
        trainerCheck: CMA_TRAINER_CHECK,
        title: 'CMA Articleship & Practical Training Openings at Firms - My Student Club',
        description: 'CMA articleship and practical training openings at firms that invite CMA students. We flag CA firms: ICMAI counts firm training only under a Practising Cost Accountant.',
        keywords: 'CMA articleship, CMA practical training, cost accountant firm training, ICMAI training',
        note: {
            title: 'Check before you join',
            body: 'CA articleship does not count for CMA: firm training counts only under a Practising Cost Accountant (Form T-1). Most firms here are CA firms, so we flag them.',
            source: 'https://www.icmai.co.in/upload/Training/FAQ.pdf'
        }
    },
    {
        id: 'cma-industrial', qualification: 'cma', slot: 'industrial', table: IND, experience: null,
        path: '/cma-industrial-training', file: 'cma-industrial-training.html', source: 'index.html',
        navLabel: 'Industrial Training', roleLabel: 'CMA Industrial Trainee',
        emailSubject: 'Application for CMA Industrial Training', aiTitle: 'CMA Industrial Trainee',
        shareType: 'cma-industrial', bannerType: 'CMA',
        preferences: ['cma_industrial'], lookingFor: 'CMA Industrial Training',
        gate: { premium: 'any', recruiterLocked: false }, hideCuratedExclusive: true,
        title: 'CMA Industrial Training in Companies & PSUs - My Student Club',
        description: 'CMA industrial and practical training openings in companies, banks and PSUs for students registered in CMA Intermediate.',
        keywords: 'CMA industrial training, CMA practical training in company, ICMAI Form T-4',
        note: {
            title: 'How this differs from CA industrial training',
            body: 'CMA has no separate industrial-training phase: all 15 months of practical training can be done in a recognised organisation (Form T-4).',
            source: 'https://www.icmai.co.in/upload/Training/FAQ.pdf'
        }
    },
    {
        id: 'cma-semi', qualification: 'cma', slot: 'semi', table: SEMI, experience: null,
        path: '/cma-inter-jobs', file: 'cma-inter-jobs.html', source: 'semi-qualified-ca-jobs.html',
        navLabel: 'CMA Inter', roleLabel: 'Professional',
        emailSubject: 'Application for Costing / Accounts Role (CMA Inter)', aiTitle: 'CMA Inter (Semi Qualified)',
        shareType: 'cma-semi', bannerType: 'CMA',
        preferences: ['cma_semi_fresher', 'cma_semi_experienced'], lookingFor: 'Semi Qualified CMA',
        gate: { premium: 'any', recruiterLocked: false },
        title: 'CMA Inter Jobs for Semi-Qualified CMA Students - My Student Club',
        description: 'Jobs for CMA Intermediate passed students: costing executive, accounts, MIS, GST and internal audit roles at companies and firms.',
        keywords: 'CMA inter jobs, semi qualified CMA jobs, costing executive jobs, ICWA inter jobs'
    },
    {
        id: 'cma-fresher', qualification: 'cma', slot: 'fresher', table: FRESH, experience: 'Freshers',
        path: '/cma-fresher-jobs', file: 'cma-fresher-jobs.html', source: 'ca-fresher-jobs.html',
        navLabel: 'CMA Freshers', roleLabel: 'Professional',
        emailSubject: 'Application for Fresher Role (CMA Final Qualified)', aiTitle: 'CMA Fresher',
        shareType: 'cma-fresher', bannerType: 'CMA',
        preferences: ['cma_fresher_fresher'], lookingFor: 'CMA Fresher',
        gate: { premium: 'any', recruiterLocked: false },
        title: 'CMA Fresher Jobs for CMA Final Qualified Candidates - My Student Club',
        description: 'Jobs for CMA Final qualified freshers: cost accountant, FP&A, controllership, internal audit and PSU finance roles, updated daily.',
        keywords: 'CMA fresher jobs, CMA final qualified jobs, cost accountant fresher jobs'
    },
    {
        id: 'cma-experienced', qualification: 'cma', slot: 'experienced', table: FRESH, experience: 'Experienced',
        path: '/experienced-cma-jobs', file: 'experienced-cma-jobs.html', source: 'experienced-ca-jobs.html',
        navLabel: 'Experienced CMA', roleLabel: 'Professional',
        emailSubject: 'Application for Cost & Management Accountant Role', aiTitle: 'Cost & Management Accountant',
        shareType: 'cma-experienced', bannerType: 'CMA',
        preferences: ['cma_fresher_experienced'], lookingFor: 'CMA Experienced',
        gate: { premium: 'any', recruiterLocked: false },
        title: 'Experienced CMA & Cost Accountant Jobs - My Student Club',
        description: 'Cost controller, plant finance, FP&A, internal audit and PSU finance roles for experienced Cost and Management Accountants.',
        keywords: 'experienced CMA jobs, cost accountant jobs, cost controller jobs'
    }
];

// Lane tabs per qualification, in display order. CA keeps its order; CS and
// CMA put firm training first (it is what most of their students look for).
const LANE_ORDER = {
    ca: ['ca-industrial', 'ca-articleship', 'ca-semi', 'ca-fresher', 'ca-experienced'],
    cs: ['cs-articleship', 'cs-industrial', 'cs-semi', 'cs-fresher', 'cs-experienced'],
    cma: ['cma-articleship', 'cma-industrial', 'cma-semi', 'cma-fresher', 'cma-experienced']
};

const LANES_BY_ID = new Map(LANES.map(lane => [lane.id, lane]));

export function laneById(id) {
    return LANES_BY_ID.get(String(id || '')) || null;
}

export function lanesFor(qualification) {
    return (LANE_ORDER[normalizeQualification(qualification) || 'ca'] || []).map(laneById);
}

export function normalizeQualification(value) {
    const key = String(value ?? '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(QUALIFICATIONS, key) ? key : null;
}

// "/CA-Fresher-Jobs.html/" -> "/ca-fresher-jobs"; "/index.html" -> "/".
export function normalizePath(pathname) {
    let path = String(pathname || '/').split(/[?#]/)[0].toLowerCase();
    path = path.replace(/\/+$/, '').replace(/\.html$/, '');
    if (path === '' || path === '/index') return '/';
    return path.startsWith('/') ? path : `/${path}`;
}

const LANES_BY_PATH = new Map();
for (const lane of LANES) {
    for (const path of [lane.path, ...(lane.aliases || [])]) LANES_BY_PATH.set(normalizePath(path), lane);
}

// Which lane is this page? Generated pages say so on <body data-lane>; the
// path is the fallback. Unknown pages are CA Industrial Training, as before.
export function resolveLane(pathname, dataset = null) {
    return laneById(dataset?.lane) || LANES_BY_PATH.get(normalizePath(pathname)) || laneById('ca-industrial');
}

// The lane a course switch leads to: the same kind of lane in the other
// course, unless that one is thin (then the course's home lane).
export function equivalentLane(lane, qualification) {
    const key = normalizeQualification(qualification) || 'ca';
    if (lane && lane.qualification === key) return lane;
    const match = lanesFor(key).find(other => other.slot === lane?.slot);
    if (match && !match.thin) return match;
    return resolveLane(QUALIFICATIONS[key].homePath);
}

// ----------------------------------------------------------------- preferences

// profile.job_preference: CA keys are unchanged (industrial, articleship,
// semi_fresher, semi_experienced, fresher_fresher, fresher_experienced); CS and
// CMA use the same stage keys with a prefix (cs_semi_fresher, cma_articleship).
export const CA_STAGES = ['industrial', 'articleship', 'semi_fresher', 'semi_experienced', 'fresher_fresher', 'fresher_experienced'];

export function splitPreference(pref) {
    const raw = String(pref ?? '').trim().toLowerCase();
    if (!raw) return { qualification: null, stage: null };
    const match = raw.match(/^(cs|cma)_(.+)$/);
    const qualification = match ? match[1] : 'ca';
    const stage = match ? match[2] : raw;
    return CA_STAGES.includes(stage) ? { qualification, stage } : { qualification: null, stage: null };
}

export function joinPreference(qualification, stage) {
    const key = normalizeQualification(qualification) || 'ca';
    if (!CA_STAGES.includes(stage)) return null;
    return key === 'ca' ? stage : `${key}_${stage}`;
}

export function laneForPreference(pref) {
    const { qualification, stage } = splitPreference(pref);
    if (!qualification) return null;
    const key = joinPreference(qualification, stage);
    return LANES.find(lane => lane.preferences.includes(key)) || null;
}

// profiles.looking_for labels, including the ones older code wrote.
const LOOKING_FOR_PREFERENCES = {
    'ca industrial training default': 'industrial',
    'ca articleship': 'articleship',
    'semi qualified ca': 'semi_fresher',
    'ca fresher': 'fresher_fresher',
    'ca freshers': 'fresher_fresher',
    'ca fresher (fresher)': 'fresher_fresher',
    'ca fresher (experienced)': 'fresher_experienced'
};
for (const lane of LANES) {
    const key = lane.lookingFor.toLowerCase();
    if (!LOOKING_FOR_PREFERENCES[key]) LOOKING_FOR_PREFERENCES[key] = lane.preferences[0];
}

export function preferenceForLookingFor(lookingFor) {
    return LOOKING_FOR_PREFERENCES[String(lookingFor ?? '').trim().toLowerCase()] || null;
}

export function lookingForOf(pref) {
    const lane = laneForPreference(pref);
    if (!lane) return null;
    if (lane.qualification === 'ca' && pref === 'fresher_experienced') return 'CA Fresher';
    return lane.lookingFor;
}

// The student's qualification from any profile shape the site keeps: the
// Supabase row ({ profile: {...}, looking_for }), the flat cached copy in
// localStorage.userProfileData, or the profile jsonb itself. null = unknown.
export function qualificationOf(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const inner = profile.profile && typeof profile.profile === 'object' ? profile.profile : {};
    const explicit = normalizeQualification(profile.qualification) || normalizeQualification(inner.qualification);
    if (explicit) return explicit;
    for (const pref of [profile.job_preference, inner.job_preference]) {
        const { qualification } = splitPreference(pref);
        if (qualification) return qualification;
    }
    const fromLookingFor = preferenceForLookingFor(profile.looking_for ?? inner.looking_for);
    return fromLookingFor ? splitPreference(fromLookingFor).qualification : null;
}

// The lane a student's profile points at, or null.
export function preferredLaneOf(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const inner = profile.profile && typeof profile.profile === 'object' ? profile.profile : {};
    for (const pref of [profile.job_preference, inner.job_preference, preferenceForLookingFor(profile.looking_for ?? inner.looking_for)]) {
        const lane = laneForPreference(pref);
        if (lane) return lane;
    }
    const qualification = qualificationOf(profile);
    return qualification ? resolveLane(QUALIFICATIONS[qualification].homePath) : null;
}

// ----------------------------------------------------------------- shared links

// job.html?type=: the CA values thousands of static pages already use, plus
// one per CS/CMA lane.
const LEGACY_SHARE_TYPES = {
    industrial: 'ca-industrial',
    articleship: 'ca-articleship',
    semi: 'ca-semi',
    'semi-qualified': 'ca-semi',
    fresher: 'ca-fresher',
    experienced: 'ca-experienced'
};

export function laneForShareType(type) {
    const key = String(type ?? '').trim().toLowerCase();
    return laneById(LEGACY_SHARE_TYPES[key]) || LANES.find(lane => lane.shareType === key) || null;
}

// ----------------------------------------------------------------- queries

// "regex" filters Description with the course patterns (works today);
// "tagged" uses eligible_courses from cs-cma-portal.sql (faster, editable).
export function applyLaneScope(query, lane, { mode = 'regex', now = Date.now() } = {}) {
    if (!lane) return query;
    const qualification = QUALIFICATIONS[lane.qualification];
    let q = query;
    if (mode === 'tagged') {
        q = q.contains('eligible_courses', [qualification.code]);
    } else if (qualification.match) {
        const { pre, pos, neg } = qualification.match;
        q = q.gte('Created_At', new Date(now - REGEX_WINDOW_DAYS * 86400000).toISOString());
        q = q.filter('Description', 'imatch', pre).filter('Description', 'imatch', pos);
        if (neg) q = q.not('Description', 'imatch', neg);
    }
    if (lane.hideCuratedExclusive) {
        q = q.or('is_exclusive.is.null,is_exclusive.eq.false,posted_by.not.is.null');
    }
    return q;
}

// Detects whether the eligible_courses migration has run. The probe asks for
// one tagged row; PostgREST answers 400 if the column does not exist.
export async function detectEligibilityMode(client, storage = null) {
    const KEY = 'msc_eligibility_mode_v1';
    try {
        const cached = storage?.getItem(KEY);
        if (cached === 'regex' || cached === 'tagged') return cached;
    } catch (_) { /* storage blocked */ }
    let mode = 'regex';
    try {
        const { error } = await client.from(FRESH).select('id').contains('eligible_courses', ['CS']).limit(1);
        if (!error) mode = 'tagged';
    } catch (_) { /* network: stay on regex */ }
    try {
        storage?.setItem(KEY, mode);
    } catch (_) { /* storage blocked */ }
    return mode;
}

// City labels from /locations.json -> every spelling seen in listings.
export const LOCATION_ALIASES = {
    Bangalore: ['Bangalore', 'Bengaluru'],
    Gurgaon: ['Gurgaon', 'Gurugram'],
    Mumbai: ['Mumbai', 'Bombay', 'Navi Mumbai', 'Thane'],
    Kolkata: ['Kolkata', 'Calcutta'],
    Chennai: ['Chennai', 'Madras'],
    'Pan India': ['Pan India', 'Remote', 'Work from home', 'Anywhere in India']
};
