// Course and lane definitions for the CS / CMA portal. Read by the browser
// engine (portal.js) and by the page generator (build-pages.js), so page copy,
// filters and queries always agree.
//
// Patterns are written in the subset of regex syntax shared by JavaScript and
// PostgreSQL (POSIX ARE, case-insensitive): no \b, no \m; word edges are
// spelled out as (^|[^a-z0-9]) ... ([^a-z0-9]|$). They were checked against
// live listings on 2026-10-17 (see cs-cma-portal.sql for the same patterns).

export const SITE = 'https://www.mystudentclub.com';
export const BROWSER_GUARD_WORKER_URL = 'https://browser-guard-unlock.bhansalimanan55.workers.dev';

const L = '(^|[^a-z0-9])';
const R = '([^a-z0-9]|$)';
const SEP = String.raw`(\s*[/,&|]\s*|\s+(or|and)\s+)`;
const STAGE_WORDS = '(executive|professional|inter|intermediate|final|foundation|qualified|freshers?|trainees?|interns?|students?|candidates?|aspirants?|pursuing)';
const NEGATION = String.raw`(not\s+(be\s+)?eligible|should\s+not\s+apply|need\s+not\s+apply|ineligible|are\s+not\s+considered)`;

const CS_PATTERN = [
    `${L}(ca|cma|icwa|icwai)${SEP}cs${R}`,
    `${L}cs${SEP}(ca|cma|icwa|llb)${R}`,
    String.raw`${L}cs\s*[-(]?\s*${STAGE_WORDS}${R}`,
    String.raw`${L}(qualified|semi[- ]?qualified|pursuing|associate|practi[cs]ing)\s+(cs|company\s+secretar(y|ies))${R}`,
    `${L}(icsi|acs|fcs)${R}`,
    String.raw`company\s+secretar(y|ies)\s*(trainee|intern|cum)`,
    String.raw`(hiring|seeking|looking\s+for|requires?|wanted|position|opening|vacancy)[^.\n]{0,30}company\s+secretar`,
    String.raw`secretarial\s+(intern|trainee|assistant|executive|officer)`,
    String.raw`${L}pcs\s+firm`
].join('|');

const CMA_PATTERN = [
    // "CA/CMA", "CS or CMA", but not "CA/CMA (US)"
    String.raw`${L}(ca|cs)${SEP}cma(?!\s*[-(]?\s*(us|usa)${R})${R}`,
    `${L}cma${SEP}(ca|cs)${R}`,
    String.raw`${L}cma\s*[-(]?\s*${STAGE_WORDS}${R}`,
    String.raw`${L}(qualified|semi[- ]?qualified|pursuing)\s+cma${R}`,
    `${L}(icmai|icwai|icwa|aicwa|cwa)${R}`,
    String.raw`cost\s+(and|&)\s+management\s+accountan`,
    String.raw`cost\s+accountan`
].join('|');

export const QUAL_PATTERNS = {
    CA: String.raw`${L}(ca|icai|aca|fca)${R}|chartered\s+accountan`,
    CS: CS_PATTERN,
    CMA: CMA_PATTERN
};

export const PAY_OPTIONS = {
    stipend: [5000, 10000, 15000, 20000],
    salary: [300000, 500000, 800000, 1200000]
};

export const LOCATIONS = [
    'Mumbai', 'Delhi', 'Gurugram', 'Noida', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune', 'Kolkata',
    'Ahmedabad', 'Jaipur', 'Indore', 'Lucknow', 'Chandigarh', 'Kochi', 'Coimbatore', 'Bhubaneswar',
    'Nagpur', 'Vadodara', 'Surat', 'Pan India / Remote'
];

export const LOCATION_ALIASES = {
    Mumbai: ['Mumbai', 'Bombay', 'Navi Mumbai', 'Thane'],
    Gurugram: ['Gurugram', 'Gurgaon'],
    Bengaluru: ['Bengaluru', 'Bangalore'],
    Kolkata: ['Kolkata', 'Calcutta'],
    Chennai: ['Chennai', 'Madras'],
    Kochi: ['Kochi', 'Cochin', 'Ernakulam'],
    Vadodara: ['Vadodara', 'Baroda'],
    'Pan India / Remote': ['Pan India', 'Remote', 'Work from home', 'Anywhere in India']
};

const category = (key, label, pattern) => ({ key, label, pattern });

// ---------------------------------------------------------------- CS (ICSI)

const CS = {
    key: 'cs',
    code: 'CS',
    name: 'CS',
    fullName: 'Company Secretary',
    institute: 'ICSI',
    instituteFull: 'The Institute of Company Secretaries of India',
    instituteUrl: 'https://www.icsi.edu/',
    accent: '#0f766e',
    accentSoft: '#effcf9',
    hubPath: '/cs-jobs',
    pattern: CS_PATTERN,
    excludePattern: String.raw`${L}cs${R}[^.\n]{0,50}${NEGATION}|(not\s+eligible|should\s+not\s+apply|ineligible)[^.\n]{0,60}${L}cs${R}`,
    applyPitch: 'I am pursuing the Company Secretary course with ICSI and want to build hands-on experience in secretarial compliance, corporate law and governance.',
    stages: [
        { label: 'CS Executive', pattern: String.raw`${L}cs\s*[-(]?\s*executive|executive\s+(programme|program|level)` },
        { label: 'CS Professional', pattern: String.raw`${L}cs\s*[-(]?\s*professional` },
        { label: 'Qualified CS (ACS)', pattern: String.raw`(qualified|associate|member)\s+(cs|company\s+secretar)|${L}(acs|fcs)${R}|${L}cs\s*[-(]?\s*qualified` }
    ],
    categories: [
        category('secretarial', 'Secretarial & ROC filings', String.raw`secretarial|${L}roc${R}|mca\s*(21|v3|filing|portal|compliance)|annual\s+return|board\s+meeting|${L}agm${R}|minutes|statutory\s+registers|incorporation|e-?forms?`),
        category('listing', 'SEBI & listing compliance', String.raw`sebi|lodr|listing\s+(compliance|obligation|regulation)|stock\s+exchange|insider\s+trading|${L}pit${R}|takeover|${L}(nse|bse)${R}`),
        category('corporate-law', 'Corporate law & legal', String.raw`corporate\s+law|companies\s+act|legal|contract|agreement|drafting|litigation`),
        category('secretarial-audit', 'Secretarial audit', String.raw`secretarial\s+audit|${L}mr-?3${R}`),
        category('mergers', 'Mergers & restructuring', String.raw`merger|amalgamation|restructuring|demerger|due\s+diligence`),
        category('ipo', 'IPO & capital markets', String.raw`${L}ipo${R}|capital\s+market|drhp|rights\s+issue|private\s+placement|${L}qip${R}|fund\s*rais`),
        category('fema', 'FEMA, RBI & FDI', String.raw`fema|${L}rbi${R}|${L}(fdi|odi|ecb)${R}|foreign\s+(investment|exchange)`),
        category('ibc', 'Insolvency (IBC) & NCLT', String.raw`${L}ibc${R}|insolvency|cirp|nclt|liquidat|resolution\s+professional`),
        category('governance', 'Governance, ESG & CSR', String.raw`governance|${L}(esg|brsr|csr)${R}`),
        category('ipr', 'Trademark & IPR', String.raw`trade\s*mark|${L}ipr${R}|intellectual\s+property|copyright|patent`),
        category('labour', 'Labour law & payroll compliance', String.raw`labou?r\s+law|${L}(pf|esic|epf)${R}|payroll|shops?\s+(and|&)\s+establishment`),
        category('rta', 'Shares, RTA & investor relations', String.raw`investor\s+(relations|services|grievance)|${L}rta${R}|share\s+transfer|registrar\s+(and|&)\s+(share\s+)?transfer|${L}esop${R}`),
        category('nbfc', 'NBFC & regulatory compliance', String.raw`nbfc|regulatory\s+compliance|${L}(kyc|aml)${R}`),
        category('tax', 'GST & income tax', String.raw`${L}gst${R}|income\s+tax|${L}tds${R}|direct\s+tax|indirect\s+tax`),
        category('accounts', 'Accounts & audit', String.raw`accounts|accounting|audit|bookkeeping|tally`)
    ],
    hub: {
        path: '/cs-jobs',
        title: 'CS Jobs, Internships & Training for Company Secretary Students | My Student Club',
        description: 'Find CS internships at PCS firms and companies, CS Executive and Professional jobs, and roles for newly qualified and experienced Company Secretaries, updated daily.',
        h1: 'CS jobs and internships',
        eyebrow: 'For ICSI students and Company Secretaries',
        lede: 'Internships at PCS firms and companies, jobs for CS Executive and Professional students, and roles for qualified Company Secretaries. Every listing says CS candidates can apply.',
        stageTitle: 'Where are you in CS?'
    },
    lanes: [
        {
            key: 'firm-training',
            path: '/cs-articleship',
            table: 'Articleship Jobs',
            pay: 'stipend',
            tab: 'Training at PCS firms',
            aka: 'CS articleship',
            stage: 'CS Executive passed with EDP, or Professional passed',
            icon: 'building',
            noun: 'training openings',
            h1: 'CS training at PCS firms (CS articleship)',
            title: 'CS Articleship & 21-Month Training at PCS Firms | My Student Club',
            description: 'CS articleship openings: 21-month ICSI practical training at Practising Company Secretary firms for CS Executive and Professional passed students. Stipend, city and how to apply.',
            lede: 'Openings for the 21-month practical training at Practising Company Secretary (PCS) and other firms that welcome CS trainees. ICSI calls it long-term practical training; most students say CS articleship.',
            callout: {
                tone: 'warn',
                title: 'Check before you join',
                summary: 'Train only with an ICSI-registered trainer, usually a Practising Company Secretary.',
                body: 'ICSI counts the 21 months only with an ICSI-registered trainer, such as a Practising Company Secretary with at least one year of practice. CA and CMA firms are generally not eligible trainers, and many firms here are CA firms that also invite CS students, so ask whether a PCS will register your training. It must be registered with ICSI within 30 days of joining.',
                source: 'https://www.icsi.edu/long-term-training'
            },
            applySubject: 'Application for CS Training (Articleship)',
            applyNoun: 'CS training',
            emptyTitle: 'No PCS firm openings for CS right now',
            emptyHint: 'Firms post through the day. Try a wider date range or check training in companies.',
            tipsTitle: 'Before you accept a training seat',
            tips: [
                'You can start after passing both groups of CS Executive and the one-month EDP, or after CS Professional.',
                'ICSI\'s minimum stipend is ₹5,000 a month with no city tiers. Many PCS firms pay ₹8,000 to ₹15,000.',
                'Short 3 to 6 month internships do not count towards the 21 months.'
            ]
        },
        {
            key: 'company-training',
            path: '/cs-training-in-companies',
            table: 'Industrial Training Job Portal',
            pay: 'stipend',
            tab: 'Training in companies',
            aka: 'CS management trainee',
            stage: 'CS Executive passed with EDP, or Professional passed',
            icon: 'factory',
            noun: 'training openings',
            h1: 'CS training in companies (CS management trainee)',
            title: 'CS Management Trainee & Training in Companies | My Student Club',
            description: 'CS management trainee and 21-month training openings in listed companies, NBFCs, banks and PSUs for CS Executive and Professional passed students. Filter by city and stipend.',
            lede: 'Training openings in the secretarial and legal teams of companies, banks and PSUs, usually titled CS management trainee. Some students call this CS industrial training.',
            callout: {
                tone: 'info',
                title: 'Good to know',
                summary: 'The company must employ a whole-time Company Secretary to train you.',
                body: 'A company can train CS students only if it employs a whole-time Company Secretary and meets ICSI\'s size rules. Many companies and PSUs prefer CS Professional passed trainees and pay them more. ICSI\'s minimum stipend is ₹5,000 a month nationwide for training registered on or after 1 August 2023.',
                source: 'https://www.icsi.edu/long-term-training'
            },
            applySubject: 'Application for CS Management Trainee',
            applyNoun: 'CS management trainee',
            emptyTitle: 'No company training openings for CS right now',
            emptyHint: 'Companies post fewer CS training seats than firms. Check training at PCS firms, or widen the date range.',
            tipsTitle: 'Getting a company training seat',
            tips: [
                'Listed companies, NBFCs and PSUs run the biggest secretarial teams. Target them first.',
                'Ask whether the company employs a whole-time CS who can register your training.',
                'The first two months are probation. After that, changing trainer needs an NOC and 60 days\' notice.'
            ]
        },
        {
            key: 'semi-qualified',
            path: '/semi-qualified-cs-jobs',
            table: 'Semi Qualified Jobs',
            pay: 'salary',
            tab: 'Semi-qualified CS',
            aka: 'Executive or Professional passed',
            stage: 'CS Executive or Professional passed, not yet ACS',
            icon: 'layers',
            noun: 'jobs',
            h1: 'Semi-qualified CS jobs',
            title: 'Semi-Qualified CS Jobs for CS Executive & Professional Passed | My Student Club',
            description: 'Jobs for semi-qualified Company Secretaries who have passed CS Executive or Professional: secretarial executive, compliance executive and legal roles at firms and companies.',
            lede: 'Paid roles for students who have passed CS Executive or Professional but are not yet ICSI members: secretarial executive, compliance executive and legal associate.',
            applySubject: 'Application for Secretarial / Compliance Executive Role',
            applyNoun: 'secretarial role',
            emptyTitle: 'No semi-qualified CS jobs right now',
            emptyHint: 'Widen the date range or browse the training sections.',
            tipsTitle: 'Standing out as a semi-qualified CS',
            tips: [
                'Lead with work you have actually done: ROC e-filing, board minutes, statutory registers, SEBI disclosures.',
                'If you are in registered 21-month training, a parallel full-time job can put that training at risk.',
                'Put your ICSI stage (Executive or Professional, groups passed) at the top of your CV.'
            ]
        },
        {
            key: 'fresher',
            path: '/cs-fresher-jobs',
            table: 'Fresher Jobs',
            experience: 'Freshers',
            pay: 'salary',
            tab: 'CS freshers',
            aka: 'Newly qualified ACS',
            stage: 'Newly qualified ACS, 0–1 year',
            icon: 'sparkles',
            noun: 'fresher jobs',
            h1: 'Company Secretary fresher jobs',
            title: 'Company Secretary Fresher Jobs for Newly Qualified CS | My Student Club',
            description: 'Company Secretary fresher jobs for newly qualified ACS: assistant company secretary, compliance officer and secretarial roles. Updated daily with salary and city.',
            lede: 'Roles for newly qualified Company Secretaries (ACS) with up to one year of experience: assistant company secretary, compliance officer and secretarial officer.',
            applySubject: 'Application for Company Secretary (Fresher) Role',
            applyNoun: 'Company Secretary role',
            emptyTitle: 'No CS fresher jobs right now',
            emptyHint: 'Widen the date range, or check semi-qualified roles, which often accept fresh CS too.',
            tipsTitle: 'Landing your first CS role',
            tips: [
                'Mention your ICSI membership number. If membership is pending, write "ACS membership awaited".',
                'Highlight training work on listed-company compliance, if any.',
                'Track every application from the Applications page.'
            ]
        },
        {
            key: 'experienced',
            path: '/experienced-cs-jobs',
            table: 'Fresher Jobs',
            experience: 'Experienced',
            pay: 'salary',
            tab: 'Experienced CS',
            aka: 'ACS / FCS, 1+ years',
            stage: 'Qualified CS with 1+ years',
            icon: 'chart',
            noun: 'jobs',
            h1: 'Jobs for experienced Company Secretaries',
            title: 'Experienced Company Secretary Jobs & Compliance Roles | My Student Club',
            description: 'Company Secretary and compliance officer roles for experienced ACS and FCS at listed companies, NBFCs and firms. Filter by city, work area and salary.',
            lede: 'Company Secretary, compliance officer and legal roles for ACS and FCS with one or more years of post-qualification experience.',
            applySubject: 'Application for Company Secretary Role',
            applyNoun: 'Company Secretary role',
            emptyTitle: 'No experienced CS roles right now',
            emptyHint: 'Widen the date range. Senior roles are posted less often but stay open longer.',
            tipsTitle: 'For experienced CS',
            tips: [
                'Quantify scale: number of listed entities, board meetings or filings you handle.',
                'Name the regulations you own end to end (LODR, PIT, FEMA, IBC).'
            ]
        }
    ]
};

// ---------------------------------------------------------------- CMA (ICMAI)

const CMA = {
    key: 'cma',
    code: 'CMA',
    name: 'CMA',
    fullName: 'Cost and Management Accountant',
    institute: 'ICMAI',
    instituteFull: 'The Institute of Cost Accountants of India',
    instituteUrl: 'https://icmai.in/',
    accent: '#6d28d9',
    accentSoft: '#f5f3ff',
    hubPath: '/cma-jobs',
    pattern: CMA_PATTERN,
    excludePattern: String.raw`(cma|icwa|cost\s+accountant)[^.\n]{0,50}${NEGATION}|(not\s+eligible|should\s+not\s+apply|ineligible)[^.\n]{0,60}(cma|icwa)`,
    applyPitch: 'I am a CMA student with ICMAI and want hands-on experience in costing, cost audit and management accounting.',
    stages: [
        { label: 'CMA Inter', pattern: String.raw`${L}cma\s*[-(]?\s*inter(mediate)?|${L}icwa\s*[-(]?\s*inter` },
        { label: 'CMA Final', pattern: String.raw`${L}cma\s*[-(]?\s*final` },
        { label: 'Qualified CMA', pattern: String.raw`(qualified|newly\s+qualified)\s+(cma|cost\s+accountant)|${L}cma\s*[-(]?\s*qualified|${L}(acma|fcma)${R}` }
    ],
    categories: [
        category('costing', 'Costing & cost control', String.raw`cost\s+(accounting|control|reduction|analysis|sheet|centre|center)|costing|standard\s+cost|product\s+cost`),
        category('cost-audit', 'Cost audit & cost records', String.raw`cost\s+audit|cost\s+records|${L}cra[-\s]?[1-4]${R}|section\s+148`),
        category('plant-finance', 'Plant & manufacturing finance', String.raw`plant|factory|manufacturing|production\s+cost|shop\s*floor`),
        category('budgeting', 'Budgeting, MIS & variance', String.raw`budget|${L}mis${R}|variance\s+analysis|forecast`),
        category('fpa', 'FP&A & business finance', String.raw`fp\s*&\s*a|financial\s+planning|business\s+finance|business\s+partner`),
        category('controllership', 'Controllership & reporting', String.raw`controllership|financial\s+reporting|month[-\s]end|book\s+closure|consolidation|ind\s*as|ifrs`),
        category('accounts', 'Accounts & finalisation', String.raw`finali[sz]ation|book\s*keeping|tally|accounts\s+(payable|receivable)|general\s+ledger|reconciliation`),
        category('gst', 'GST & indirect tax', String.raw`${L}gst${R}|indirect\s+tax|customs`),
        category('direct-tax', 'Income tax & TDS', String.raw`income\s+tax|direct\s+tax|${L}(tds|itr)${R}`),
        category('internal-audit', 'Internal audit & risk', String.raw`internal\s+audit|internal\s+control|${L}(ifc|sox)${R}|risk\s+advisory`),
        category('bank-audit', 'Stock & concurrent audit', String.raw`stock\s+audit|concurrent\s+audit|bank\s+audit|revenue\s+audit`),
        category('inventory', 'Inventory & supply chain', String.raw`inventory|stock\s+valuation|supply\s+chain|procurement|stores`),
        category('credit', 'Banking & credit appraisal', String.raw`credit\s+(appraisal|analysis|analyst)|cma\s+data|project\s+report|working\s+capital|banking`),
        category('psu', 'PSU & government', String.raw`${L}psu${R}|public\s+sector|government\s+of\s+india|navratna|maharatna|miniratna`),
        category('erp', 'SAP / ERP', String.raw`${L}(sap|erp|fico)${R}|oracle|ms\s+dynamics`)
    ],
    hub: {
        path: '/cma-jobs',
        title: 'CMA Jobs, Articleship & Industrial Training for ICMAI Students | My Student Club',
        description: 'Find CMA articleship (practical training), industrial training in companies and PSUs, CMA Inter jobs and roles for newly qualified and experienced Cost Accountants, updated daily.',
        h1: 'CMA jobs, articleship and training',
        eyebrow: 'For ICMAI students and Cost Accountants',
        lede: 'Practical training at firms and companies, jobs for CMA Inter students, and roles for qualified Cost and Management Accountants. Every listing says CMA candidates can apply.',
        stageTitle: 'Where are you in CMA?'
    },
    lanes: [
        {
            key: 'firm-training',
            path: '/cma-articleship',
            table: 'Articleship Jobs',
            pay: 'stipend',
            tab: 'Articleship (firms)',
            aka: 'Practical training at firms',
            stage: 'Registered for CMA Intermediate or later',
            icon: 'building',
            noun: 'training openings',
            h1: 'CMA articleship and practical training at firms',
            title: 'CMA Articleship & Practical Training Openings at Firms | My Student Club',
            description: 'CMA articleship (ICMAI practical training) openings at Cost Accountant and professional firms for students registered in CMA Intermediate. Stipend, city and how to apply.',
            lede: 'Practical training openings at firms that invite CMA students. ICMAI calls this practical training; most students call it CMA articleship.',
            callout: {
                tone: 'warn',
                title: 'Check before you join',
                summary: 'CA or CS articleship does not count for CMA. Ask who will sign your Form T-1.',
                body: 'ICMAI counts practical training done under a Practising Cost Accountant or a firm of Cost Accountants (Form T-1), or in a recognised organisation (Form T-4). Articleship registered with ICAI or ICSI does not count. Many firms here are CA firms that also invite CMA students, so ask who will sign your Form T-1 before you accept.',
                source: 'https://www.icmai.co.in/upload/Training/FAQ.pdf'
            },
            applySubject: 'Application for CMA Practical Training (Articleship)',
            applyNoun: 'CMA practical training',
            emptyTitle: 'No firm openings for CMA right now',
            emptyHint: 'Widen the date range, or look at industrial training: all 15 months of CMA training can be done in a company.',
            tipsTitle: 'Before you accept a training seat',
            tips: [
                'Confirm a Practising Cost Accountant will sign your Form T-1. CA or CS articleship does not count for CMA.',
                'ICMAI\'s minimum stipend at Cost Accountant firms is ₹2,000 a month in year one.',
                'Training is full-time (35 hours a week) and must be reported to ICMAI within 30 days of joining.'
            ]
        },
        {
            key: 'company-training',
            path: '/cma-industrial-training',
            table: 'Industrial Training Job Portal',
            pay: 'stipend',
            tab: 'Industrial training',
            aka: 'Practical training in companies & PSUs',
            stage: 'Registered for CMA Intermediate; PSU schemes need Inter passed',
            icon: 'factory',
            noun: 'training openings',
            h1: 'CMA industrial training in companies and PSUs',
            title: 'CMA Industrial Training in Companies & PSUs | My Student Club',
            description: 'CMA industrial training and practical training openings in companies, banks and PSUs, including Industrial Trainee (Finance) roles for CMA Inter passed students.',
            lede: 'Practical training in companies, banks and PSUs, plus Industrial Trainee (Finance) schemes for CMA Inter passed students.',
            callout: {
                tone: 'info',
                title: 'How this differs from CA industrial training',
                summary: 'All 15 months of CMA training can be done in a company or PSU.',
                body: 'CMA has no separate industrial-training phase. All 15 months of practical training can be done in a recognised organisation (Form T-4). From 1 August 2024, ICMAI\'s minimum stipend in companies is ₹15,000 to ₹20,000 a month in year one for Intermediate students, depending on the city.',
                source: 'https://www.icmai.co.in/upload/Training/FAQ.pdf'
            },
            applySubject: 'Application for CMA Industrial Training',
            applyNoun: 'CMA industrial training',
            emptyTitle: 'No industrial training openings for CMA right now',
            emptyHint: 'Company openings are fewer than firm openings. Widen the date range or check CMA Inter jobs.',
            tipsTitle: 'Getting industrial training',
            tips: [
                'PSUs (Coal India, NLC, BEL and others) run Industrial Trainee (Finance) schemes for CMA Inter passed students, often with an age limit of 28.',
                'Manufacturing companies value costing and plant-accounting exposure. Say what you have studied.',
                'Confirm the company qualifies as a recognised organisation for Form T-4.'
            ]
        },
        {
            key: 'semi-qualified',
            path: '/cma-inter-jobs',
            table: 'Semi Qualified Jobs',
            pay: 'salary',
            tab: 'CMA Inter jobs',
            aka: 'Semi-qualified CMA',
            stage: 'CMA Intermediate passed',
            icon: 'layers',
            noun: 'jobs',
            h1: 'Jobs for CMA Inter passed students',
            title: 'CMA Inter Jobs for Semi-Qualified CMA Students | My Student Club',
            description: 'Jobs for CMA Intermediate passed students: costing executive, accounts, MIS, GST and internal audit roles at companies and firms. Filter by city and salary.',
            lede: 'Paid roles for students who have passed CMA Intermediate: costing executive, accounts, MIS, GST and internal audit. Employers often call this semi-qualified CMA.',
            applySubject: 'Application for Costing / Accounts Role (CMA Inter)',
            applyNoun: 'role',
            emptyTitle: 'No CMA Inter jobs right now',
            emptyHint: 'Widen the date range or check industrial training, which many CMA Inter students take first.',
            tipsTitle: 'Standing out with CMA Inter',
            tips: [
                'A job in a recognised organisation and area can also count towards ICMAI practical training. Ask HR about Form T-4.',
                'Mention Tally, Excel and any ERP you have used.',
                'Say whether you are attempting CMA Final and when.'
            ]
        },
        {
            key: 'fresher',
            path: '/cma-fresher-jobs',
            table: 'Fresher Jobs',
            experience: 'Freshers',
            pay: 'salary',
            tab: 'CMA freshers',
            stage: 'CMA Final qualified (0–1 year)',
            icon: 'sparkles',
            noun: 'fresher jobs',
            h1: 'Jobs for newly qualified CMAs',
            title: 'CMA Fresher Jobs for Newly Qualified Cost Accountants | My Student Club',
            description: 'Jobs for CMA Final qualified freshers: cost accountant, FP&A, controllership, internal audit and PSU finance roles. Updated daily with salary and city.',
            lede: 'Roles for CMA Final qualified candidates with up to one year of experience: cost accountant, FP&A analyst, internal auditor and PSU finance officer.',
            applySubject: 'Application for Cost Accountant (Fresher) Role',
            applyNoun: 'Cost Accountant role',
            emptyTitle: 'No CMA fresher jobs right now',
            emptyHint: 'Widen the date range or check CMA Inter jobs, which often accept freshly qualified CMAs too.',
            tipsTitle: 'Landing your first CMA role',
            tips: [
                'Most freshers are not yet ACMA (membership needs three years of experience), so write "CMA Final qualified" on your CV.',
                'PSUs recruit CA/CMA qualified finance officers through written tests. Watch their notifications too.',
                'Track every application from the Applications page.'
            ]
        },
        {
            key: 'experienced',
            path: '/experienced-cma-jobs',
            table: 'Fresher Jobs',
            experience: 'Experienced',
            pay: 'salary',
            tab: 'Experienced CMA',
            stage: 'Qualified CMA with 1+ years',
            icon: 'chart',
            noun: 'jobs',
            h1: 'Jobs for experienced CMAs',
            title: 'Experienced CMA & Cost Accountant Jobs | My Student Club',
            description: 'Cost controller, plant finance, FP&A, internal audit and PSU finance roles for experienced Cost and Management Accountants. Filter by city, work area and salary.',
            lede: 'Cost controller, plant finance, FP&A and internal audit roles for Cost and Management Accountants with one or more years of experience.',
            applySubject: 'Application for Cost & Management Accountant Role',
            applyNoun: 'Cost & Management Accountant role',
            emptyTitle: 'No experienced CMA roles right now',
            emptyHint: 'Widen the date range. Senior roles are posted less often but stay open longer.',
            tipsTitle: 'For experienced CMAs',
            tips: [
                'Quantify impact: cost savings, plants or entities covered, audits signed.',
                'Cost audit under section 148 of the Companies Act is reserved for Cost Accountants. Highlight it if you have done it.'
            ]
        }
    ]
};

export const COURSES = { cs: CS, cma: CMA };
