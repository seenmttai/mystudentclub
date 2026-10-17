// Course and lane definitions for the CS / CMA portal. Read by the browser
// engine (portal.js) and by the page generator (build-pages.js), so page copy,
// filters and queries always agree.
//
// Eligibility patterns are PostgreSQL regexes (ARE, case-insensitive), because
// the database filters with them. core.js converts the PostgreSQL-only word
// boundaries (\m, \M) for the browser. Each course has three parts, applied
// in this order so PostgREST stays well inside the 3 s anon statement timeout:
//   pre - cheap token gate (any CS / CMA-like word at all)
//   pos - the course is named as an accepted qualification
//   neg - the listing turns the course away, or only wants it on top of a
//         mandatory CA, or means US CMA (IMA) / CGMA
// Labelled against every CS match and a sample of CMA matches from the last
// 60 days on 2026-10-17: about 99% precise for both.

export const SITE = 'https://www.mystudentclub.com';
export const BROWSER_GUARD_WORKER_URL = 'https://browser-guard-unlock.bhansalimanan55.workers.dev';

const CS_MATCH = {
    pre: String.raw`(\mcs\M|company\s+secretar|icsi|\macs\M)`,
    pos: String.raw`((\mca|\mcma|\micwai?|\mcwa|\mmba|\mllb|\mcfa|\mcpa|\macca|\mcia|\mm\.?\s?com|\mb\.?\s?com|\mbba|\mbaf|\mgraduates?|\minter|\mipcc|\mfrm)\M\s*\)?\s*(,\s*or\s|,\s*and\s|/|,|&|\||\sor\s|\sand\s|and\s*/\s*or)\s*(semi[\s-]*qualified\s+)?\ma?cs\M(?!\s*(firms?|partners|consultants)\M)|\ma?cs\M(?!\s*(firms?|partners|consultants)\M)\s*(\(\s*[a-z]+\s*\))?\s*(/|,|&|\||\sor\s|\sand\s)\s*(ca|cma|icwai?|cwa|mba|llb|law|cfa|cpa|acca|m\.?\s?com|b\.?\s?com)\M|\ma?cs\M(?!\s*(firms?|partners|consultants)\M)\s*[-–(]?\s*(executive|professional|inter|intermediate|final|foundation|qualified|semi|trainee|student|aspirant|fresher|dropout|drop\s*out|article|pursuing|cleared|appeared|member|candidate|course)|(qualified|pursuing|\minter|fresher|aspiring)\s+(ca\s*/\s*)?\ma?cs\M(?!\s*(firms?|partners|consultants)\M)|(qualified|fresher|practi[sc]ing|aspiring|trainee)\s+(ca\s*/\s*)?company\s+secretar|company\s+secretar(y|ies)\s*[-–(:]*\s*(trainee|fresher|intern|executive|professional|cs\M|qualified|\d)|(accountant|\mca|\mcma|\micwa)\M\s*(\([a-z]+\))?\s*(/|,|\sor\s)\s*(cost\s*(&|and)?\s*(management|works)?\s*accountant\s*(/|,|\sor\s)\s*)?company\s+secretary\M|(hiring|looking\s+for|inviting|applications\s+from|openings?\s+for)[a-z\s-]*company\s+secretar|\micsi\M(?!\s+invoic))`,
    neg: String.raw`(not\s+eligible[^.\n]*\ma?cs\M|((\mca\M|chartered\s+accountant)[^.\n•]*(mandatory|required|is\s+a\s+must)|must\s+be\s+(an?\s+)?(qualified\s+)?(\mca\M|chartered\s+accountant))[^.\n•]*\ma?cs\M[^.\n•]*(advantage|plus|preferable|good\s+to\s+have|in\s+addition)|\mca\s*\+\s*cs\M|required:?\s*(qualified\s+)?ca\s*(&|and)\s*cs\M)`
};

const CMA_MATCH = {
    pre: String.raw`(\mcmas?\M|icwa|\mcwa\M|icmai?|cost\s*(and|&)?\s*(management|works)?\s*accountan|\macma\M)`,
    pos: String.raw`((?<!us\s)\mcmas?\M(?!\s*[-–:(]?\s*(data|prep|report|credit|statement|projection|format|study|working|project\s+fin|\(?\s*(us|usa|u\.s|ima)\M))|\micwai?s?\M|\maicwa|\mcwa\M|\micmai?\M|cost\s*(and|&)?\s*(management|works)?\s*accountan|\macma\M)`,
    neg: String.raw`(not\s+eligible[^.\n]*(\mcma\M|icwa)|\mcma\M[^.\n]*(not\s+eligible|should\s+not\s+apply|need\s+not\s+apply)|\mno\s+cma\M|❌[^.\n]*\mcma\M|((\mca\M|chartered\s+accountant)[^.\n•]*(mandatory|required|is\s+a\s+must)|must\s+be\s+(an?\s+)?(qualified\s+)?(\mca\M|chartered\s+accountant))[^.\n•]*(\mcma\M|icwa)[^.\n•]*(advantage|plus|preferable|good\s+to\s+have|in\s+addition)|\mus\s+cpa\s*/\s*cma\M|certified\s+management\s+accountant|\mcgma\M)`
};

// Simpler patterns for categories, stages and the CA badge only run in the
// browser or as an extra filter, so they stay in the JS/PostgreSQL subset.
const L = '(^|[^a-z0-9])';
const R = '([^a-z0-9]|$)';
const SEP = String.raw`(\s*[/,&]\s*|\s+or\s+|\s+and\s+)`;

export const QUAL_PATTERNS = {
    CA: { pos: String.raw`${L}(ca|icai|aca|fca)${R}|chartered\s+accountan` },
    CS: CS_MATCH,
    CMA: CMA_MATCH
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

// Firm-training lanes read the CA articleship table, so most posts come from
// CA firms that also invite CS / CMA students. Neither ICSI nor ICMAI counts
// training at a CA firm, so the browser flags a post that names a CA firm and
// no CS / CMA trainer (company name + description, browser only).
// Statutory audit is reserved for CAs, so an audit firm here is a CA firm.
const CA_FIRM = String.raw`chartered\s+accountan|\mca(\s*/\s*(cs|cma|acca))*\s+(firm|articles?|articled|articleship)\M|\micai\M|\maudit\s+firm|audit\s+and\s+[a-z]+\s+firm|accounting\s+(and|&)\s+audit\s+firm|statutory\s+(and\s+[a-z-]+\s+)?audits?\M`;

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
    match: CS_MATCH,
    applyPitch: 'I am pursuing the Company Secretary course with ICSI and want to build hands-on experience in secretarial compliance, corporate law and governance.',
    // Stage hints shown in the listing detail (browser only).
    stages: [
        { label: 'CS Executive', pattern: String.raw`\mcs\s*[-(]?\s*(executive|inter(mediate)?\M)|executive\s+(level|programme|program)|\minter(mediate)?\s+(ca(\s*[/,&]\s*|\s+or\s+|\s+and\s+))?(cma(\s*[/,&]\s*|\s+or\s+|\s+and\s+))?cs\M|\mca(\s*[/,&]\s*|\s+or\s+|\s+and\s+)(cma(\s*[/,&]\s*|\s+or\s+|\s+and\s+))?cs\s*\(?\s*inter` },
        { label: 'CS Professional', pattern: String.raw`\mcs\s*[-(]?\s*(professional\s+(student|pursuing|programme|program|level|cleared|appeared|module|group|course)|final(ist)?\M)|pursuing\s+cs\s+professional|professional\s+programme` },
        { label: 'Semi-qualified CS', pattern: String.raw`semi[\s-]*qualified\s+(ca(\s*[/,&]\s*|\s+or\s+|\s+and\s+))?(cma(\s*[/,&]\s*|\s+or\s+|\s+and\s+))?(cs\M|company\s+secretar)|\mcs\s+semi[\s-]*qualified|\mcs\s*(/\s*\w+\s*)*drop\s*-?\s*outs?|(ca|cma)\s*/\s*(cma\s*/\s*)?cs\s+drop\s*-?\s*outs?` },
        { label: 'Qualified CS', pattern: String.raw`(?<!semi[\s-])(?<!semi)qualified\s+(ca(\s*[/,&]\s*|\s+or\s+|\s+and\s+))?(cma(\s*[/,&]\s*|\s+or\s+|\s+and\s+))?(cs\M|company\s+secretar)|\mcs\s+qualified|\macs\M|company\s+secretar(y|ies)\s*\(cs\)|\mcs\s*\(\s*qualified` }
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
        title: 'CS Jobs & Training (Articleship) for Company Secretary Students | My Student Club',
        description: 'Find CS training (articleship) openings, jobs for CS Executive and Professional passed students, and roles for newly qualified and experienced Company Secretaries, updated daily.',
        h1: 'CS jobs and training',
        eyebrow: 'For ICSI students and Company Secretaries',
        lede: 'Training (articleship) openings, jobs for CS Executive and Professional passed students, and roles for qualified Company Secretaries. Every listing says CS candidates can apply.',
        stageTitle: 'Where are you in CS?'
    },
    lanes: [
        {
            key: 'firm-training',
            path: '/cs-articleship',
            table: 'Articleship Jobs',
            pay: 'stipend',
            tab: 'Training at firms',
            aka: 'CS articleship',
            stage: 'CS Executive or Professional passed, EDP done',
            icon: 'building',
            noun: 'training openings',
            h1: 'CS articleship and training at firms',
            title: 'CS Articleship & Trainee Openings at Firms | My Student Club',
            description: 'CS articleship and trainee openings at firms that invite CS students. We flag CA firms, where you must confirm ICSI will count your 21-month training.',
            lede: 'Trainee openings at firms that invite CS students. Most come from CA firms, and ICSI counts the 21 months only under a registered trainer such as a Practising Company Secretary, so we flag every CA-firm listing.',
            callout: {
                tone: 'warn',
                title: 'Check before you join',
                summary: 'Most listings here are CA firms. Confirm a Practising Company Secretary will register your training.',
                body: 'ICSI counts the 21 months only with an ICSI-registered trainer, such as a Practising Company Secretary with at least one year of practice. CA and CMA firms are generally not eligible trainers. Most listings here come from CA firms that also invite CS students, and we mark them "CA firm". Before you accept, ask whether a PCS will register your training, then register it with ICSI soon after joining.',
                source: 'https://www.icsi.edu/long-term-training'
            },
            trainerCheck: {
                trainer: String.raw`practi[sc]ing\s+company\s+secretar|\mpcs\M|firm\s+of\s+(practi[sc]ing\s+)?company\s+secretar|company\s+secretar(y|ies)\s+firm|\mcs\s+firm|(&|and)\s*(co|associates)\.?,?\s+company\s+secretaries`,
                caFirm: CA_FIRM,
                badge: 'CA firm: check ICSI registration',
                note: 'This listing looks like a CA firm. ICSI generally does not count training at CA firms, so before you join, ask whether a Practising Company Secretary will register your 21-month training with ICSI.'
            },
            applySubject: 'Application for CS Training (Articleship)',
            applyNoun: 'CS training',
            emptyTitle: 'No firm training openings for CS right now',
            emptyHint: 'Firms post through the day. Try a wider date range or check semi-qualified CS jobs.',
            tipsTitle: 'Before you accept a training seat',
            tips: [
                'You can start after passing CS Executive (both groups) or CS Professional. Either way, finish the one-month EDP first.',
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
            stage: 'CS Executive or Professional passed, EDP done',
            icon: 'factory',
            noun: 'training openings',
            h1: 'CS training in companies (CS management trainee)',
            title: 'CS Management Trainee & Training in Companies | My Student Club',
            // The CA industrial-training table rarely names CS, so this lane is
            // often empty: keep it out of search results until it has listings.
            noindex: true,
            description: 'CS management trainee openings in companies, banks and PSUs for CS Executive and Professional passed students, when companies post them here.',
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
            emptyHint: 'Companies rarely post CS training seats here. Check training at firms or semi-qualified CS jobs, or widen the date range.',
            tipsTitle: 'Getting a company training seat',
            tips: [
                'Listed companies, NBFCs and PSUs run the biggest secretarial teams. Target them first.',
                'Ask whether the company employs a whole-time CS who can register your training.',
                'The first two months are probation. After that, ICSI allows a change of trainer only in exceptional cases, with an NOC and 60 days\' notice. Check the current ICSI training guidelines.'
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
            description: 'Jobs that accept semi-qualified CS (Executive or Professional passed): accounts, audit, tax, compliance and secretarial roles at firms and companies.',
            lede: 'Paid roles open to students who have passed CS Executive or Professional but are not yet ICSI members. Many are accounts, audit and tax roles that also take CS; filter by work area to find secretarial and compliance work.',
            applyPitch: 'I have passed CS [Executive / Professional] with ICSI and want to build hands-on experience in secretarial compliance, corporate law and governance.',
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
            applyPitch: 'I am a newly qualified Company Secretary (ACS) and want to start my career in secretarial compliance, corporate law and governance.',
            idLabel: 'ICSI membership no.',
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
            applyPitch: 'I am a qualified Company Secretary with [N] years of post-qualification experience in secretarial compliance, corporate law and governance.',
            idLabel: 'ICSI membership no.',
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
    match: CMA_MATCH,
    applyPitch: 'I am a CMA student with ICMAI and want hands-on experience in costing, cost audit and management accounting.',
    // Stage hints shown in the listing detail (browser only).
    stages: [
        { label: 'CMA Inter', pattern: String.raw`\mcma\s*[-(]?\s*(inter(mediate)?\M|\(i\))|\minter(mediate)?\s+(ca(\s*[/,&]\s*|\s+or\s+|\s+and\s+))?(cma|icwai?|cwa)\M|\micwai?\s*[-(]?\s*inter|\mcwa\s*[-(]?\s*(inter|\(i\))|\mca(\s*[/,&]\s*|\s+or\s+|\s+and\s+)cma\s*((\s*[/,&]\s*|\s+or\s+|\s+and\s+)cs)?\s*\(?\s*inter` },
        { label: 'CMA Final', pattern: String.raw`\mcma\s*[-(]?\s*final(ist)?\M|\mfinal\s+cma|\micwai?\s+final|\mca(\s*[/,&]\s*|\s+or\s+|\s+and\s+)cma\s*((\s*[/,&]\s*|\s+or\s+|\s+and\s+)cs)?\s+final(ist)?` },
        { label: 'Semi-qualified CMA', pattern: String.raw`semi[\s-]*qualified\s+(ca(\s*[/,&]\s*|\s+or\s+|\s+and\s+))?(cma|icwa|cwa)|\mcma\s+semi|\m(cma|icwa|cwa)\s*(/\s*\w+\s*)*drop\s*-?\s*outs?|\mca\s*/\s*cma\s*(/\s*cs)?\s*(drop\s*-?\s*outs?|dropouts?|\(discontinued\))|discontinued\s+ca\s*/\s*cma` },
        { label: 'Qualified CMA', pattern: String.raw`(?<!semi[\s-])(?<!semi)qualified\s+(ca(\s*[/,&]\s*|\s+or\s+|\s+and\s+))?(cma|icwa|cwa|cost\s+accountant)|\mcma\s+qualified|\macma\M|qualified\s+cost\s+(and\s+|&\s*)?(management\s+|works\s+)?accountant|\m(ca|cma)\s*/\s*cma\s+qualified` },
        { label: 'Pursuing CMA', pattern: String.raw`pursuing\s+(ca(\s*[/,&]\s*|\s+or\s+|\s+and\s+))?cma|\mcma\s+(pursuing|aspirants?|students?)|\mca\s*(/|&|and|or)\s*cma\s+(pursuing|aspirants?|students?)` }
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
        description: 'Find CMA articleship (practical training), industrial training in companies and PSUs, CMA Inter jobs, and roles for CMA Final qualified freshers and experienced Cost Accountants, updated daily.',
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
            tab: 'Training at firms',
            aka: 'CMA articleship',
            stage: 'Registered for CMA Intermediate or later',
            icon: 'building',
            noun: 'training openings',
            h1: 'CMA articleship and training at firms',
            title: 'CMA Articleship & Trainee Openings at Firms | My Student Club',
            description: 'CMA articleship and trainee openings at firms that invite CMA students. We flag CA firms: ICMAI counts firm training only under a Practising Cost Accountant.',
            lede: 'Trainee openings at firms that invite CMA students. Most come from CA firms, and CA articleship does not count for CMA, so we flag every CA-firm listing. ICMAI calls this practical training; most students say CMA articleship.',
            callout: {
                tone: 'warn',
                title: 'Check before you join',
                summary: 'Most listings here are CA firms. Only a Practising Cost Accountant can sign your Form T-1.',
                body: 'ICMAI counts practical training done under a Practising Cost Accountant or a firm of Cost Accountants (Form T-1), or in a recognised organisation (Form T-4). Articleship registered with ICAI or ICSI does not count. Most listings here come from CA firms that also invite CMA students, and we mark them "CA firm". Unless a Practising Cost Accountant there will sign your Form T-1, the months will not count.',
                source: 'https://www.icmai.co.in/upload/Training/FAQ.pdf'
            },
            trainerCheck: {
                trainer: String.raw`practi[sc]ing\s+cost\s+accountant|firm\s+of\s+cost\s+accountant|cost\s+accountants?\s+firm|(&|and)\s*(co|associates)\.?,?\s+cost\s+accountants|,\s*cost\s+accountants\M|\mcma\s+firm`,
                caFirm: CA_FIRM,
                badge: 'CA firm: check Form T-1',
                note: 'This listing looks like a CA firm. CA articleship does not count for CMA: the months count only if a Practising Cost Accountant signs your Form T-1, so ask before you join.'
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
                'Some PSUs run Industrial Trainee (Finance) schemes for CA / CMA Inter passed students, usually with an age limit. Watch their career pages.',
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
            applyPitch: 'I have passed CMA Intermediate with ICMAI and want hands-on experience in costing, accounts and management accounting.',
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
            title: 'CMA Fresher Jobs for CMA Final Qualified Candidates | My Student Club',
            description: 'Jobs for CMA Final qualified freshers: cost accountant, FP&A, controllership, internal audit and PSU finance roles. Updated daily with salary and city.',
            lede: 'Roles for CMA Final qualified candidates with up to one year of experience: cost accountant, FP&A analyst, internal auditor and PSU finance officer.',
            applyPitch: 'I have recently qualified CMA Final with ICMAI and want to start my career in costing, cost audit and management accounting.',
            idLabel: 'ICMAI registration / membership no.',
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
            applyPitch: 'I am a qualified Cost and Management Accountant with [N] years of experience in costing, cost audit and management accounting.',
            idLabel: 'ICMAI membership no.',
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
