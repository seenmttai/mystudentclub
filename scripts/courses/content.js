// Long-form copy for the CS / CMA pages: rule summaries and FAQs. Used only
// by build-pages.js, so it never ships inside the browser bundle.
//
// Rules were summarised on 2026-10-17 from ICSI / ICMAI pages and, where the
// institute PDFs could not be fetched (several ICSI training rules), from
// secondary summaries; the page lists those sources too. When a rule changes,
// update it here and run `npm run build:pro-portal`.

export const AS_OF = 'October 2026';

export const CONTENT = {
    cs: {
        rulesTitle: 'How CS training works',
        rules: [
            'ICSI calls it long-term practical training. It lasts 21 months and is whole-time.',
            'You can start after passing CS Executive (both groups) or CS Professional. Either way, complete the one-month Executive Development Programme (EDP) first.',
            'Training must be with an ICSI-registered trainer: a Practising Company Secretary with at least one year of practice, a company that employs a whole-time CS and meets ICSI\'s size rules, an eligible LLP, or a body such as MCA, SEBI, the stock exchanges, RBI, a PSU or a bank.',
            'Register the training with ICSI soon after joining (the current guidelines allow 30 days). The first two months are probation.',
            'The minimum stipend is ₹5,000 a month nationwide for training registered on or after 1 August 2023. On ICSI\'s own placement portal in October 2026, the typical offer was about ₹10,000.',
            'To become an Associate member (ACS) you need CS Professional, the training (or an exemption), the EDP, the 30-day CLDP and a Training Clearance Certificate.'
        ],
        rulesSources: [
            { label: 'ICSI: long-term training', url: 'https://www.icsi.edu/long-term-training' },
            { label: 'ICSI placement portal (stipend offers)', url: 'https://placement.icsi.edu/PlacementApp/training' },
            { label: 'Taxguru: ICSI minimum stipend', url: 'https://taxguru.in/chartered-accountant/icsi-approves-minimum-stipend-of-rs-5000-per-month.html' },
            { label: 'Taxguru: ICSI trainer entitlement', url: 'https://taxguru.in/chartered-accountant/icsi-revises-training-entitlement-cs-trainers-firms.html' }
        ],
        howWeList: 'We show vacancies whose description says Company Secretary candidates can apply (for example "CA/CS", "CS Executive passed" or "Company Secretary trainee"), and hide ones that say CS candidates are not eligible or only want CS on top of a mandatory CA. Each listing quotes the line that matched so you can judge for yourself.',
        faq: [
            {
                q: 'Is CS training the same as CS articleship?',
                a: 'Yes. ICSI\'s official name is long-term practical training. "Articleship" is a CA term, but most CS students and many employers say CS articleship, CS training or CS internship for the same 21-month programme.',
                source: 'https://www.icsi.edu/long-term-training'
            },
            {
                q: 'When can I start CS training?',
                a: 'After you pass CS Executive (both groups) or CS Professional, and complete the one-month EDP either way. Generally, passing only one Executive group is not enough.',
                source: 'https://taxguru.in/chartered-accountant/important-announcement-related-completion-one-month-edp-icsi.html'
            },
            {
                q: 'What is the minimum stipend for CS trainees?',
                a: '₹5,000 a month if your training was registered on or after 1 August 2023. It is the same in every city, must be paid into your bank account and is payable during probation too. Many firms and companies pay more.',
                source: 'https://taxguru.in/chartered-accountant/icsi-approves-minimum-stipend-of-rs-5000-per-month.html'
            },
            {
                q: 'Can I do CS training in a CA firm?',
                a: 'Usually not. ICSI\'s trainer categories are Practising Company Secretaries, eligible companies and LLPs, and listed bodies, and LLPs registered with ICAI or ICMAI are excluded. Ask the firm whether a PCS will register your training, and confirm with ICSI if unsure. CA firms can still hire semi-qualified and qualified CS for jobs.',
                source: 'https://taxguru.in/chartered-accountant/icsi-revises-training-entitlement-cs-trainers-firms.html'
            },
            {
                q: 'What is a semi-qualified CS?',
                a: 'Someone who has passed CS Executive or CS Professional but is not yet an ICSI member (ACS). ICSI\'s own placement portal labels these jobs "Semi Qualified". Typical roles are secretarial executive and compliance executive.',
                source: 'https://placement.icsi.edu/PlacementApp/training'
            },
            {
                q: 'I am already working. Can I skip CS training?',
                a: 'An exemption can be claimed only after you pass all groups of CS Professional, and only with specified experience, such as several years in the secretarial department of an eligible company or under an experienced PCS. A fee applies.',
                source: 'https://www.icsi.edu/practical-training-exemption'
            }
        ]
    },
    cma: {
        rulesTitle: 'How CMA practical training works',
        rules: [
            'ICMAI calls it practical training. Students who registered for Intermediate on or after 11 February 2020 need 15 months of full-time training (35 hours a week).',
            'You can start as soon as you register for CMA Intermediate. You do not need to pass Intermediate first.',
            'At least 10 months must be certified on Form T-5 before you sit the CMA Final exam (by 31 August for December, by 28/29 February for June).',
            'Train under a Practising Cost Accountant or a firm of Cost Accountants (Form T-1, with UDIN), or in a recognised organisation (Form T-4): government bodies, PSUs, banks, insurers, universities, MSMEs and start-ups, or companies above ICMAI\'s turnover limit.',
            'Articleship registered with ICAI or ICSI does not count for CMA training.',
            'Minimum stipend: ₹2,000 a month in year one under a Practising Cost Accountant. In companies (from 1 August 2024), ₹15,000 to ₹20,000 a month in year one for Intermediate students and ₹20,000 to ₹25,000 for Final students, depending on the city.',
            'Report your training to ICMAI within 30 days of joining. You can change your trainer at most three times.'
        ],
        rulesSources: [
            { label: 'ICMAI: Practical Training Scheme 2020', url: 'https://icmai.in/Home/NewPracticalTrainingScheme2020' },
            { label: 'ICMAI: practical training FAQ', url: 'https://www.icmai.co.in/upload/Training/FAQ.pdf' }
        ],
        howWeList: 'We show vacancies whose description says CMA (ICMAI) candidates can apply (for example "CA/CMA", "CMA Inter", "ICWA" or "Cost Accountant"). We try to leave out US CMA roles (Certified Management Accountant, from the US-based IMA), "CMA data" (a bank loan report, not the qualification), and listings that say CMA candidates are not eligible or only want CMA on top of a mandatory CA. Each listing quotes the line that matched so you can judge for yourself.',
        faq: [
            {
                q: 'Is CMA articleship the same as CMA practical training?',
                a: 'Yes. ICMAI officially calls it practical training under the Practical Training Scheme 2020, and the trainee is a Cost & Management Trainee. Students commonly say CMA articleship or CMA internship.',
                source: 'https://icmai.in/Home/NewPracticalTrainingScheme2020'
            },
            {
                q: 'How long is CMA practical training and when can I start?',
                a: '15 months, for students who registered for Intermediate on or after 11 February 2020. You can start right after registering for CMA Intermediate. Students on the older scheme need three years.',
                source: 'https://www.icmai.co.in/upload/Training/FAQ.pdf'
            },
            {
                q: 'Can I do CMA training in a CA or CS firm?',
                a: 'CA or CS articleship is not recognised for CMA training. Training counts under a Practising Cost Accountant or firm of Cost Accountants, or in a recognised organisation. Work in a CA or CS firm\'s separate management consultancy division gets only partial credit, so ask who will sign your Form T-1 or T-4.',
                source: 'https://www.icmai.co.in/upload/Training/FAQ.pdf'
            },
            {
                q: 'What is the minimum stipend for CMA trainees?',
                a: 'Under a Practising Cost Accountant: ₹2,000, ₹3,000 and ₹4,000 a month in years one, two and three. In companies and other organisations (from 1 August 2024): ₹15,000 to ₹20,000 a month in year one for Intermediate students and ₹20,000 to ₹25,000 for Final students, depending on the city category.',
                source: 'https://www.icmai.co.in/upload/Training/FAQ.pdf'
            },
            {
                q: 'Is there a separate industrial training phase in CMA?',
                a: 'No. Unlike CA, CMA has no separate industrial phase: all 15 months can be done in a recognised organisation (Form T-4), such as a company, bank or PSU.',
                source: 'https://www.icmai.co.in/upload/Training/FAQ.pdf'
            },
            {
                q: 'A job mentions "CMA data". Is it meant for CMA students?',
                a: 'Not necessarily. CMA data is the Credit Monitoring Arrangement report banks use for working-capital loans. It has nothing to do with the CMA qualification, so we do not treat it as a CMA listing.',
                source: 'https://taxguru.in/finance/credit-monitoring-arrangement-cma-data-insight.html'
            },
            {
                q: 'Is CMA India the same as US CMA?',
                a: 'No. CMA India is ICMAI\'s statutory qualification and carries rights such as cost audit. US CMA (Certified Management Accountant) is a separate credential from the US-based Institute of Management Accountants (IMA). We try to leave out listings that ask only for US CMA.',
                source: 'https://www.imanet.org/'
            }
        ]
    }
};
