(function (root, factory) {
    const catalog = factory();
    if (typeof module === 'object' && module.exports) module.exports = catalog;
    if (root) root.MSCArticleship = catalog;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // Day 1 applicant situations and MSC layouts use the existing builder renderers.
    const baseStarter = {
        "personal": {
            "name": "[First name]",
            "tagline": "CA Intermediate | Both groups cleared",
            "contact": "",
            "phone": "",
            "email": "",
            "linkedin": "",
            "location": "[City]",
            "highlight1": "[Academic highlight]",
            "highlight2": "[Excel / practice project]",
            "highlight3": "[Extracurricular achievement]",
            "socialLinks": []
        },
        "summary": "",
        "education": [
            {
                "degree": "CA Intermediate — both groups",
                "institute": "ICAI",
                "year": "[Session / year]",
                "marks": "[Marks / maximum]",
                "remarks": "[Attempt number]",
                "mergedWithPrevious": false
            },
            {
                "degree": "[B.Com / degree — status]",
                "institute": "[University]",
                "year": "[Year]",
                "marks": "[Score / CGPA]",
                "remarks": "",
                "mergedWithPrevious": false
            },
            {
                "degree": "Class XII",
                "institute": "[Board]",
                "year": "[Year]",
                "marks": "[Score]",
                "remarks": "",
                "mergedWithPrevious": false
            },
            {
                "degree": "Class X",
                "institute": "[Board]",
                "year": "[Year]",
                "marks": "[Score]",
                "remarks": "",
                "mergedWithPrevious": false
            }
        ],
        "experience": [],
        "projects": [],
        "skills": "",
        "certifications": [
            {
                "name": "[Relevant course / certification]",
                "issuer": "[Provider] | [Month year]"
            }
        ],
        "achievements": [],
        "leadership": [],
        "interests": [],
        "customSections": [
            {
                "id": "custom_articleship_icitss",
                "title": "ICITSS",
                "items": [
                    "Information Technology: [status; month year]",
                    "Orientation: [status; month year]"
                ]
            },
            {
                "id": "custom_articleship_availability",
                "title": "Availability",
                "items": [
                    "Available from [date]"
                ]
            }
        ],
        "sectionOrder": [
            "summary",
            "education",
            "projects",
            "skills",
            "leadership",
            "achievements",
            "certifications",
            "custom_articleship_icitss",
            "custom_articleship_availability",
            "experience",
            "interests"
        ],
        "sectionTitles": {
            "education": "Education & Qualifications",
            "leadership": "Extracurriculars",
            "certifications": "Certifications",
            "skills": "Skills"
        },
        "sectionLabels": {
            "leadership": {
                "text": "Extracurriculars",
                "visible": true
            }
        },
        "sectionGroups": {},
        "themeAccent": "",
        "themeFont": ""
    };

    const definitions = [
        {
            "file": "articleship-classic-academic",
            "name": "Classic Academic",
            "renderFile": "classic.html",
            "accent": "#264e80",
            "style": "sans",
            "collection": "articleship",
            "sourceFile": "day-1/cv-templates/Classic Academic.docx",
            "skills": "<p><strong>Excel</strong>: [functions and tasks you can demonstrate]</p><p><strong>Accounting</strong>: [topics you can explain with an example]</p><p><strong>Communication</strong>: [languages used confidently]</p>",
            "leadership": [
                "[Activity / society] | [Role] | [Month year]",
                "Coordinated [activity] for [number of participants]; handled [specific task].",
                "[Achievement or responsibility] at [school / college / community]."
            ]
        },
        {
            "file": "articleship-statutory-audit-foundations",
            "name": "Statutory Audit Foundations",
            "renderFile": "classic.html",
            "accent": "#264e80",
            "style": "sans",
            "collection": "articleship",
            "sourceFile": "day-1/cv-templates/Statutory Audit Foundations.docx",
            "skills": "<p><strong>Audit knowledge</strong>: [assertions / evidence / documentation topics studied]</p><p><strong>Excel</strong>: [sorting, filters, lookups or PivotTables practised]</p>",
            "leadership": [
                "[Activity / organisation] | [Role] | [Dates]",
                "Explained [topic] to [audience] through [session / presentation].",
                "Organised [activity] and coordinated [your part of the work]."
            ],
            "projects": [
                {
                    "title": "[Audit practice case]",
                    "description": "Self-directed practice | [Month year]",
                    "bullets": [
                        "Matched [number of entries] to supporting documents in an audit practice file.",
                        "Prepared [audit-area workpaper] recording [procedure], evidence and [number of exceptions]."
                    ]
                }
            ]
        },
        {
            "file": "articleship-direct-tax-practice",
            "name": "Direct Tax Practice",
            "renderFile": "classic.html",
            "accent": "#264e80",
            "style": "sans",
            "collection": "articleship",
            "sourceFile": "day-1/cv-templates/Direct Tax Practice.docx",
            "skills": "<p><strong>Tax knowledge</strong>: [income heads / deductions / TDS topics studied]</p><p><strong>Excel</strong>: [computation and checking functions used]</p>",
            "leadership": [
                "[Study group / activity] | [Role] | [Dates]",
                "Presented [topic] with a worked example for [audience].",
                "Contributed to [quiz / event / community activity] through [task]."
            ],
            "projects": [
                {
                    "title": "[Income-tax computation case]",
                    "description": "Academic practice | [Month year]",
                    "bullets": [
                        "Prepared [computation] for a practice [taxpayer type] for [tax year / assessment year].",
                        "Documented [assumptions] and checked [calculation] against the case facts."
                    ]
                }
            ]
        },
        {
            "file": "articleship-gst-reconciliation",
            "name": "GST Reconciliation",
            "renderFile": "classic.html",
            "accent": "#264e80",
            "style": "sans",
            "collection": "articleship",
            "sourceFile": "day-1/cv-templates/GST Reconciliation.docx",
            "skills": "<p><strong>GST knowledge</strong>: [supply / input tax credit / return concepts studied]</p><p><strong>Excel</strong>: [lookups / SUMIFS / text cleaning practised]</p>",
            "leadership": [
                "[Organisation / activity] | [Role] | [Dates]",
                "Maintained [activity record] and resolved [specific issue].",
                "Presented [topic / result] to [audience]."
            ],
            "projects": [
                {
                    "title": "[GST reconciliation case]",
                    "description": "Self-directed practice | [Month year]",
                    "bullets": [
                        "Matched [number of invoices] across two practice registers using [matching fields].",
                        "Listed [number of unmatched items] and explained [main difference] for review."
                    ]
                }
            ]
        },
        {
            // Keep saved template IDs stable when a J1 format is renamed.
            "file": "articleship-minimal-split",
            "name": "Academic Highlights",
            "renderFile": "modern-split.html",
            "accent": "#28535e",
            "style": "split",
            "collection": "articleship",
            "sourceFile": "day-1/cv-templates/Academic Highlights.docx",
            "skills": "<p><strong>Technical knowledge</strong>: [relevant topics studied]</p><p><strong>Tools</strong>: [Excel tasks / other tools practised]</p>",
            "leadership": [
                "[Activity] | [Organisation] | [Dates]",
                "Represented [school / college / club] in [activity].",
                "Contributed [specific task] to [event / initiative]."
            ],
            "achievements": [
                "[Verified rank / subject score / scholarship] | [Exam / institution] | [Year].",
                "[Academic award] for [specific achievement] | [Year]."
            ],
            "sectionOrder": [
                "education", "achievements", "skills", "leadership", "certifications",
                "custom_articleship_icitss", "custom_articleship_availability",
                "summary", "experience", "projects", "interests"
            ]
        },
        {
            "file": "articleship-leadership-split",
            "name": "Campus Leadership",
            "renderFile": "modern-split.html",
            "accent": "#28535e",
            "style": "split",
            "collection": "articleship",
            "sourceFile": "day-1/cv-templates/Campus Leadership.docx",
            "skills": "<p><strong>Tools</strong>: [Excel / presentation tasks practised]</p><p><strong>Technical knowledge</strong>: [relevant accounting / audit / tax topics]</p>",
            "leadership": [
                "[Class representative / club role] | [Organisation] | [Dates]",
                "Managed a [₹ budget] across [number of events] with [number of team members].",
                "Resolved [issue] by [action] and delivered [outcome]."
            ],
            "interests": [
                "[Activity / competition] | [Dates]",
                "[Result / contribution] in [activity], supported by [record / certificate]."
            ],
            "leadershipTitle": "Positions of Responsibility",
            "interestsTitle": "Extracurricular Achievements",
            "sectionOrder": [
                "education", "leadership", "interests", "skills", "certifications",
                "custom_articleship_icitss", "custom_articleship_availability",
                "summary", "experience", "projects", "achievements"
            ]
        }
    ];

    const additionalSituations = [
        {
            name: 'Accounting Practice', file: 'articleship-accounting-practice', renderFile: 'classic.html',
            skills: '<p><strong>Accounting software</strong>: [software] — [tasks practised in a training file]</p><p><strong>Excel</strong>: [formulas and checking tasks practised]</p>',
            leadership: ['[Activity / organisation] | [Role] | [Dates]', 'Kept [records] for [activity] and checked [totals / details].', 'Contributed to [event] through [specific task].'],
            projects: [{ title: '[Bookkeeping practice file]', description: 'Self-directed practice | [Month year]', bullets: ['Recorded [number of sample transactions] and prepared [ledgers / trial balance].', 'Prepared a bank reconciliation using [practice statements] and explained differences.'] }]
        },
        {
            name: 'Audit & Tax', file: 'articleship-audit-tax', renderFile: 'classic.html',
            skills: '<p><strong>Accounting</strong>: [entries / reconciliation topics practised]</p><p><strong>Tools</strong>: [Excel / accounting software used]</p>',
            leadership: ['[Activity / organisation] | [Role] | [Dates]', 'Maintained [records / schedule] for [activity].', 'Coordinated [task] and shared [output] with [team].'],
            projects: [{ title: '[Accounting and reconciliation case]', description: 'Self-directed practice | [Month year]', bullets: ['Prepared [trial balance / bank reconciliation] from practice records.', 'Investigated [differences] and wrote a short explanation of [finding].'] }]
        },
        {
            name: 'College Projects', file: 'articleship-college-projects', renderFile: 'classic.html',
            skills: '<p><strong>Excel</strong>: [functions applied in the project]</p><p><strong>Research</strong>: [reports / data sources you have used]</p>',
            leadershipTitle: 'Campus Involvement',
            leadership: ['[College society] | [Role] | [Dates]', 'Coordinated [event / activity] and delivered [your responsibility].', 'Participated in [competition] with [result, if any].'],
            projects: [
                { title: '[College project title]', description: 'Academic project | [Month year]', bullets: ['Analysed [public / practice dataset] to answer [project question].', 'Prepared [report / presentation] explaining [finding] with [supporting calculation].'] },
                { title: '[Second relevant project]', description: 'Academic project | [Month year]', bullets: ['Prepared [deliverable] to study [question] using [public / practice data].'] }
            ]
        },
        {
            name: 'Community Contribution', file: 'articleship-community-contribution', renderFile: 'modern-split.html',
            skills: '<p><strong>Excel</strong>: [tasks practised]</p><p><strong>Communication</strong>: [languages / teaching or presentation tasks]</p>',
            leadershipTitle: 'Community Work',
            leadership: ['[Initiative / organisation] | [Role] | [Dates]', 'Helped organise [activity] by taking responsibility for [task].', 'Taught [topic] to [number of students] over [number of sessions].'],
            interestsTitle: 'Extracurriculars', interests: ['[Activity] | [Dates]', 'Prepared and delivered [session / presentation] on [topic].']
        },
        {
            name: 'Direct Entry Graduate', file: 'articleship-direct-entry-graduate', renderFile: 'classic.html',
            education: [
                { degree: 'CA Intermediate — both groups', institute: 'ICAI', year: '[Session / year]', marks: '[Marks / maximum]', remarks: '[Attempt number]' },
                { degree: '[Graduation degree]', institute: '[University]', year: '[Year]', marks: '[Score / CGPA]' },
                { degree: 'Class XII', institute: '[Board]', year: '[Year]', marks: '[Score]' },
                { degree: 'Class X', institute: '[Board]', year: '[Year]', marks: '[Score]' }
            ],
            skills: '<p><strong>Accounting & analysis</strong>: [tasks demonstrated during degree / project]</p><p><strong>Software</strong>: [Excel / accounting software used]</p>',
            leadershipTitle: 'Leadership & Extracurriculars',
            leadership: ['[Society / community] | [Role] | [Dates]', 'Took responsibility for [task] and delivered [output].', 'Participated in [activity] at [level / organisation].'],
            projects: [{ title: '[Graduation research project]', description: 'Academic project | [Month year]', bullets: ['Compared [public financial information / practice data] across [period].', 'Summarised [finding] in [report / presentation] and checked [key calculation].'] }]
        },
        {
            name: 'Excel First', file: 'articleship-excel-first', renderFile: 'modern-split.html',
            skills: '<p><strong>Data checks</strong>: [filters / duplicate checks / validation practised]</p><p><strong>Analysis</strong>: [SUMIFS / lookups / PivotTables practised]</p><p><strong>Work product</strong>: [shareable workbook link]</p>',
            leadership: ['[Event / organisation] | [Role] | [Dates]', 'Maintained [attendance / budget / results sheet] for [activity].', 'Explained [process / findings] to [team / audience].'],
            projects: [{ title: '[Excel reconciliation workbook]', description: 'Self-directed practice | [Month year]', bullets: ['Cleaned [number of rows] of practice data and matched [records] using [method].', 'Built [summary] with visible totals and an exceptions list.'] }],
            sectionOrder: ['skills', 'education', 'projects', 'leadership', 'certifications', 'custom_articleship_icitss', 'custom_articleship_availability', 'summary', 'experience', 'achievements', 'interests']
        },
        {
            name: 'Financial Analysis', file: 'articleship-financial-analysis', renderFile: 'classic.html',
            skills: '<p><strong>Analysis</strong>: [ratios / cash-flow analysis practised]</p><p><strong>Excel</strong>: [formulas / charts used]</p>',
            leadership: ['[Finance club / activity] | [Role] | [Dates]', 'Presented [business / accounting topic] to [audience].', 'Contributed [specific task] to [event / competition].'],
            projects: [{ title: '[Public financial statement analysis]', description: 'Independent study | [Month year]', bullets: ['Compared [public statements] over [period] using [ratios / cash-flow measures].', 'Summarised [finding] with [ratio / cash-flow calculation].'] }]
        },
        {
            name: 'IFC Controls', file: 'articleship-ifc-controls', renderFile: 'classic.html',
            skills: '<p><strong>Control concepts</strong>: [risk-control linkage / walkthrough concepts studied]</p><p><strong>Documentation</strong>: [Excel / flowchart tool used in practice]</p>',
            leadershipTitle: 'Responsibility & Extracurriculars',
            leadership: ['[Committee / event] | [Role] | [Dates]', 'Maintained [budget / approvals record] for [activity].', 'Followed up on [tasks] and reported [progress / outcome].'],
            projects: [{ title: '[Revenue-controls case]', description: 'Self-directed practice | [Month year]', bullets: ['Linked [financial-reporting risk] to [control] in a practice process.', 'Drafted a walkthrough note and [design / operation] test steps.'] }]
        },
        {
            name: 'Internal Audit Process', file: 'articleship-internal-audit-process', renderFile: 'modern-split.html',
            skills: '<p><strong>Process skills</strong>: [flowcharting / documentation practised]</p><p><strong>Tools</strong>: [Excel functions / presentation tools used]</p>',
            leadershipTitle: 'Responsibility & Extracurriculars',
            leadership: ['[Club / event] | [Role] | [Dates]', 'Tracked [tasks / event expenses] and followed up on [pending items].', 'Coordinated [activity] with [team / volunteers].'],
            projects: [{ title: '[Purchase-to-payment case]', description: 'Self-directed practice | [Month year]', bullets: ['Mapped [number of steps] from purchase request to payment in [practice case].', 'Linked [number of risks] to controls and drafted [test steps / observation].'] }],
            sectionOrder: ['skills', 'education', 'projects', 'leadership', 'certifications', 'custom_articleship_icitss', 'custom_articleship_availability', 'summary', 'experience', 'achievements', 'interests']
        },
        {
            name: 'Separate Group Results', file: 'articleship-separate-group-results', renderFile: 'classic.html',
            education: [
                { degree: 'CA Intermediate — Group I', institute: 'ICAI', year: '[Session / year]', marks: '[Marks / maximum]', remarks: '[Attempt number]' },
                { degree: 'CA Intermediate — Group II', institute: 'ICAI', year: '[Session / year]', marks: '[Marks / maximum]', remarks: '[Attempt number]' },
                { degree: '[B.Com / degree — status]', institute: '[University]', year: '[Year]', marks: '[Score / CGPA]' },
                { degree: 'Class XII', institute: '[Board]', year: '[Year]', marks: '[Score]' },
                { degree: 'Class X', institute: '[Board]', year: '[Year]', marks: '[Score]' }
            ],
            skills: '<p><strong>Excel</strong>: [specific functions and tasks practised]</p><p><strong>Domain knowledge</strong>: [relevant topics you can discuss]</p>',
            leadership: ['[Activity / community] | [Role] | [Dates]', 'Organised [specific task] during [activity].', 'Achieved [supported result] in [competition / event].'],
            projects: [{ title: '[Practice worksheet / case]', description: 'Self-directed practice | [Month year]', bullets: ['Prepared [output] using [practice / public data].', 'Checked [totals / assumptions] and documented [conclusion].'] }],
            sectionOrder: ['projects', 'education', 'skills', 'leadership', 'certifications', 'custom_articleship_icitss', 'custom_articleship_availability', 'summary', 'experience', 'achievements', 'interests']
        },
        {
            name: 'Sport & Responsibility', file: 'articleship-sport-responsibility', renderFile: 'modern-split.html',
            skills: '<p><strong>Excel</strong>: [tasks you can perform independently]</p><p><strong>Technical knowledge</strong>: [relevant subjects / concepts studied]</p>',
            leadershipTitle: 'Sport / Cultural Achievement',
            leadership: ['[Sport / art form] | [Club / institution] | [Dates]', 'Represented [team / institution] at [event / level].', '[Supported achievement / responsibility] during [actual period].'],
            interestsTitle: 'Other Extracurriculars', interests: ['[Activity] | [Role] | [Dates]', 'Coordinated [task] for [activity] with [team].']
        },
        {
            name: 'Writing & Communication', file: 'articleship-writing-communication', renderFile: 'classic.html',
            skills: '<p><strong>Technical knowledge</strong>: [accounting / audit / tax topics studied]</p><p><strong>Tools</strong>: [Excel / presentation tasks practised]</p>',
            leadershipTitle: 'Writing & Extracurriculars',
            leadership: ['[Publication / student group] | [Role] | [Dates]', 'Wrote [piece] on [topic] for [audience].', 'Presented [topic] at [event] and handled [your responsibility].'],
            projects: [{ title: '[Technical explainer / presentation]', description: 'Independent student work | [Month year]', bullets: ['Explained [topic] through [article / slides / worked example].', 'Checked [calculation / interpretation] and revised [specific part].'] }]
        }
    ].map(definition => ({
        ...definition,
        accent: definition.renderFile === 'modern-split.html' ? '#28535e' : '#264e80',
        style: definition.renderFile === 'modern-split.html' ? 'split' : 'sans',
        collection: 'articleship',
        sourceFile: `day-1/cv-templates/${definition.name}.docx`
    }));

    const galleryLayouts = [
        {"name": "Classic", "accent": "#1e40af", "style": "sans", "renderFile": "classic.html", "sourceFile": "day-1/cv-gallery/01-classic.docx"},
        {"name": "Ledger Layout", "accent": "#0d465f", "style": "ledger", "renderFile": "ledger-layout.html", "sourceFile": "day-1/cv-gallery/02-ledger-layout.docx"},
        {"name": "Structured Grid", "accent": "#2d5294", "style": "royal", "renderFile": "structured-grid.html", "sourceFile": "day-1/cv-gallery/03-structured-grid.docx"},
        {"name": "Pill Corporate", "accent": "#2d5294", "style": "pillcorp", "renderFile": "pill-corporate.html", "sourceFile": "day-1/cv-gallery/04-pill-corporate.docx"},
        {"name": "Hybrid Grid", "accent": "#0d465f", "style": "steel", "renderFile": "hybrid-grid.html", "sourceFile": "day-1/cv-gallery/05-hybrid-grid.docx"},
        {"name": "Corporate Box", "accent": "#003071", "style": "corpbox", "renderFile": "corporate-box.html", "sourceFile": "day-1/cv-gallery/06-corporate-box.docx"},
        {"name": "Bordered Grid", "accent": "#17365d", "style": "corpborder", "renderFile": "bordered-grid.html", "sourceFile": "day-1/cv-gallery/07-bordered-grid.docx"},
        {"name": "Split Ledger", "accent": "#17365d", "style": "serifsplit", "renderFile": "split-ledger.html", "sourceFile": "day-1/cv-gallery/08-split-ledger.docx"},
        {"name": "Academic Ledger", "accent": "#16365d", "style": "academicledger", "renderFile": "academic-ledger.html", "sourceFile": "day-1/cv-gallery/09-academic-ledger.docx"},
        {"name": "Firm Info", "accent": "#4f81bc", "style": "serif", "renderFile": "modern-elegant.html", "sourceFile": "day-1/cv-gallery/10-firm-info.docx"},
        {"name": "Grid Layout", "accent": "#059669", "style": "grid", "renderFile": "grid-layout.html", "sourceFile": "day-1/cv-gallery/11-grid-layout.docx"},
        {"name": "Professional", "accent": "#374151", "style": "clean", "renderFile": "professional.html", "sourceFile": "day-1/cv-gallery/12-professional.docx"},
        {"name": "Corporate", "accent": "#0369a1", "style": "formal", "renderFile": "corporate.html", "sourceFile": "day-1/cv-gallery/13-corporate.docx"},
        {"name": "Minimalist", "accent": "#6b7280", "style": "minimal", "renderFile": "minimalist.html", "sourceFile": "day-1/cv-gallery/14-minimalist.docx"},
        {"name": "Bold Modern", "accent": "#dc2626", "style": "bold", "renderFile": "bold-modern.html", "sourceFile": "day-1/cv-gallery/15-bold-modern.docx"},
        {"name": "Refined Classic", "accent": "#2F557F", "style": "refined", "renderFile": "refined-classic.html", "sourceFile": "day-1/cv-gallery/16-refined-classic.docx"},
        {"name": "Modern Bold", "accent": "#2c5d79", "style": "deepblue", "renderFile": "modern-bold.html", "sourceFile": "day-1/cv-gallery/17-modern-bold.docx"},
        {"name": "Executive", "accent": "#404040", "style": "dark", "renderFile": "executive.html", "sourceFile": "day-1/cv-gallery/18-executive.docx"},
        {"name": "Merit Layout", "accent": "#0f2f63", "style": "merit", "renderFile": "merit-layout.html", "sourceFile": "day-1/cv-gallery/19-merit-layout.docx"},
        {"name": "Clean Ledger", "accent": "#111111", "style": "mono", "renderFile": "clean-ledger.html", "sourceFile": "day-1/cv-gallery/20-clean-ledger.docx"},
        {"name": "Modern Split", "accent": "#28535e", "style": "split", "renderFile": "modern-split.html", "sourceFile": "day-1/cv-gallery/21-modern-split.docx"},
        {"name": "Horizon Split", "accent": "#1f385c", "style": "splitblue", "renderFile": "horizon-split.html", "sourceFile": "day-1/cv-gallery/22-horizon-split.docx"},
        {"name": "Professional Banner", "accent": "#155f82", "style": "bluebanner", "renderFile": "professional-banner.html", "sourceFile": "day-1/cv-gallery/23-professional-banner.docx"},
        {"name": "Executive Professional", "accent": "#1F4E79", "style": "navypro", "renderFile": "executive-professional.html", "sourceFile": "day-1/cv-gallery/24-executive-professional.docx"},
        {"name": "Corporate Grid", "accent": "#073761", "style": "tealgrid", "renderFile": "corporate-grid.html", "sourceFile": "day-1/cv-gallery/25-corporate-grid.docx"},
        {"name": "Banner Resume", "accent": "#1F487C", "style": "navybanner", "renderFile": "banner-resume.html", "sourceFile": "day-1/cv-gallery/26-banner-resume.docx"},
        {"name": "Elegant Grid", "accent": "#074F6A", "style": "tealserif", "renderFile": "elegant-grid.html", "sourceFile": "day-1/cv-gallery/27-elegant-grid.docx"},
        {"name": "Structured Ledger", "accent": "#1F487C", "style": "template27", "renderFile": "structured-ledger.html", "sourceFile": "day-1/cv-gallery/28-structured-ledger.docx"},
        {"name": "Classic Ledger", "accent": "#001F5F", "style": "template28", "renderFile": "classic-ledger.html", "sourceFile": "day-1/cv-gallery/29-classic-ledger.docx"},
        {"name": "Formal Ledger", "accent": "#1F3760", "style": "template29", "renderFile": "formal-ledger.html", "sourceFile": "day-1/cv-gallery/30-formal-ledger.docx"},
        {"name": "Smart Ledger", "accent": "#000D53", "style": "template30", "renderFile": "smart-ledger.html", "sourceFile": "day-1/cv-gallery/31-smart-ledger.docx"},
        {"name": "Modern Ledger", "accent": "#2E5395", "style": "template31", "renderFile": "modern-ledger.html", "sourceFile": "day-1/cv-gallery/32-modern-ledger.docx"},
        {"name": "Standard Ledger", "accent": "#0E4660", "style": "template32", "renderFile": "standard-ledger.html", "sourceFile": "day-1/cv-gallery/33-standard-ledger.docx"},
        {"name": "Classic Grid", "accent": "#2E5395", "style": "template33", "renderFile": "classic-grid.html", "sourceFile": "day-1/cv-gallery/34-classic-grid.docx"},
        {"name": "Profile Sidebar", "accent": "#464978", "style": "template34", "renderFile": "profile-sidebar.html", "sourceFile": "day-1/cv-gallery/35-profile-sidebar.docx"},
        {"name": "Compact Banner", "accent": "#292D2D", "style": "template35", "renderFile": "compact-banner.html", "sourceFile": "day-1/cv-gallery/36-compact-banner.docx"},
        {"name": "Dual Columns", "accent": "#292C2C", "style": "template36", "renderFile": "dual-columns.html", "sourceFile": "day-1/cv-gallery/37-dual-columns.docx"},
        {"name": "Inset Frame", "accent": "#45497D", "style": "template37", "renderFile": "inset-frame.html", "sourceFile": "day-1/cv-gallery/38-inset-frame.docx"},
        {"name": "Clean Rule", "accent": "#0D56C4", "style": "template38", "renderFile": "clean-rule.html", "sourceFile": "day-1/cv-gallery/39-clean-rule.docx"},
        {"name": "Continuous Outline", "accent": "#1F477B", "style": "template39", "renderFile": "continuous-outline.html", "sourceFile": "day-1/cv-gallery/40-continuous-outline.docx"},
        {"name": "Formal Docket", "accent": "#001F5E", "style": "template40", "renderFile": "formal-docket.html", "sourceFile": "day-1/cv-gallery/41-formal-docket.docx"},
        {"name": "Open Panel", "accent": "#8C8C8C", "style": "template41", "renderFile": "open-panel.html", "sourceFile": "day-1/cv-gallery/42-open-panel.docx"},
        {"name": "Executive Docket", "accent": "#1B365D", "style": "execdocket", "renderFile": "executive-docket.html", "sourceFile": "day-1/cv-gallery/43-executive-docket.docx"},
        {"name": "Tabular Ledger", "accent": "#1F4E79", "style": "tabledger", "renderFile": "tabular-ledger.html", "sourceFile": "day-1/cv-gallery/44-tabular-ledger.docx"},
        {"name": "Grid Docket", "accent": "#002060", "style": "griddocket", "renderFile": "grid-docket.html", "sourceFile": "day-1/cv-gallery/45-grid-docket.docx"},
        {"name": "Split Banner", "accent": "#002060", "style": "splitbanner", "renderFile": "split-banner.html", "sourceFile": "day-1/cv-gallery/46-split-banner.docx"},
        {"name": "Wave Grid", "accent": "#002060", "style": "wavegrid", "renderFile": "wave-grid.html", "sourceFile": "day-1/cv-gallery/47-wave-grid.docx"},
        {"name": "Side Panel", "accent": "#002060", "style": "sidepanel", "renderFile": "side-panel.html", "sourceFile": "day-1/cv-gallery/48-side-panel.docx"},
        {"name": "Classic Docket", "accent": "#002060", "style": "classicdocket", "renderFile": "classic-docket.html", "sourceFile": "day-1/cv-gallery/49-classic-docket.docx"},
        {"name": "Composite Ledger", "accent": "#002060", "style": "compositeledger", "renderFile": "composite-ledger.html", "sourceFile": "day-1/cv-gallery/50-composite-ledger.docx"},
        {"name": "Dotted Split", "accent": "#002060", "style": "dottedsplit", "renderFile": "dotted-split.html", "sourceFile": "day-1/cv-gallery/51-dotted-split.docx"},
        {"name": "Pill Header Split", "accent": "#0B2046", "style": "pillheader", "renderFile": "pill-header-split.html", "sourceFile": "day-1/cv-gallery/52-pill-header-split.docx"},
        {"name": "Banner Executive Split", "accent": "#05436E", "style": "bannerexecutive", "renderFile": "banner-executive-split.html", "sourceFile": "day-1/cv-gallery/53-banner-executive-split.docx"},
        {"name": "Sidebar Panel Split", "accent": "#004B87", "style": "sidebarpanel", "renderFile": "sidebar-panel-split.html", "sourceFile": "day-1/cv-gallery/54-sidebar-panel-split.docx"},
        {"name": "Timeline Flow Split", "accent": "#313A4A", "style": "timelineflow", "renderFile": "timeline-flow-split.html", "sourceFile": "day-1/cv-gallery/55-timeline-flow-split.docx"},
        {"name": "Executive Header Split", "accent": "#05436E", "style": "executiveheadersplit", "renderFile": "executive-header-split.html", "sourceFile": "day-1/cv-gallery/56-executive-header-split.docx"},
        {"name": "Bordered Box Ledger", "accent": "#102B4E", "style": "borderedboxledger", "renderFile": "bordered-box-ledger.html", "sourceFile": "day-1/cv-gallery/57-bordered-box-ledger.docx"},
        {"name": "Matrix Grid Ledger", "accent": "#185FA5", "style": "matrixgridledger", "renderFile": "matrix-grid-ledger.html", "sourceFile": "day-1/cv-gallery/58-matrix-grid-ledger.docx"},
        {"name": "Clean Line Executive", "accent": "#0B3052", "style": "cleanlineexecutive", "renderFile": "clean-line-executive.html", "sourceFile": "day-1/cv-gallery/59-clean-line-executive.docx"},
        {"name": "Minimalist Executive", "accent": "#0E2C55", "style": "minimalistexecutive", "renderFile": "minimalist-executive.html", "sourceFile": "day-1/cv-gallery/60-minimalist-executive.docx"},
        {"name": "Accent Split Summary", "accent": "#1A365D", "style": "accentsplitsummary", "renderFile": "accent-split-summary.html", "sourceFile": "day-1/cv-gallery/61-accent-split-summary.docx"},
        {"renderFile": "plain-ats.html", "name": "Plain ATS", "accent": "#111111", "style": "plainats", "sourceFile": "day-1/cv-gallery/62-plain-ats.docx"}
    ];

    const galleryDefinitions = galleryLayouts.map(layout => ({
        ...layout,
        file: `articleship-layout-${layout.renderFile.replace(/\.html$/, '')}`,
        collection: 'articleship',
        kind: 'gallery',
        summary: '<p>Seeking articleship in [domain] at [firm / city]. Keen to apply my CA Intermediate knowledge and build practical skills in [area].</p>',
        skills: '<p><strong>Excel</strong>: [functions and tasks you can demonstrate]</p><p><strong>Accounting / audit / tax</strong>: [topics you can explain with an example]</p><p><strong>Communication</strong>: [languages used confidently]</p>',
        leadership: ['[Activity / society] | [Role] | [Month year]', 'Coordinated [activity] for [number of participants]; handled [specific task].', '[Achievement or responsibility] at [school / college / community].'],
        ...(layout.renderFile === 'modern-elegant.html' ? {
            customSections: [
                { id: 'custom_articleship_target_firm', title: 'Target firm', items: ['[Firm] | [Team] | [Office] | Available from [date]'] },
                ...baseStarter.customSections.filter(section => section.id !== 'custom_articleship_availability')
            ],
            sectionOrder: ['summary', 'custom_articleship_target_firm', ...baseStarter.sectionOrder.filter(section => !['summary', 'custom_articleship_availability'].includes(section))]
        } : {})
    }));

    const profiles = [...definitions, ...additionalSituations, ...galleryDefinitions].map(definition => {
        const { summary = '', skills, leadership, education, customSections, projects = [], achievements = [], interests = [], leadershipTitle, interestsTitle, sectionOrder, ...template } = definition;
        const starter = JSON.parse(JSON.stringify(baseStarter));
        Object.assign(starter, { summary, skills, leadership, projects, achievements, interests });
        if (education) starter.education = JSON.parse(JSON.stringify(education));
        if (customSections) starter.customSections = JSON.parse(JSON.stringify(customSections));
        if (achievements.length) starter.sectionTitles.achievements = 'Academic Highlights';
        if (leadershipTitle) {
            starter.sectionTitles.leadership = leadershipTitle;
            starter.sectionLabels.leadership.text = leadershipTitle;
        }
        if (interestsTitle) {
            starter.sectionTitles.interests = interestsTitle;
            starter.sectionLabels.interests = { text: interestsTitle, visible: true };
        }
        if (sectionOrder) starter.sectionOrder = [...sectionOrder];
        return { kind: 'situation', ...template, starter };
    });
    const clone = value => JSON.parse(JSON.stringify(value));
    const contentKeys = ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'leadership', 'interests', 'customSections'];

    function getTemplate(file) {
        return profiles.find(profile => profile.file === file) || null;
    }

    function resolveRenderFile(file) {
        return getTemplate(file)?.renderFile || file;
    }

    function createStarter(file, tableSettings) {
        const profile = getTemplate(file);
        if (!profile) return null;
        const starter = clone(profile.starter);
        starter.templateFile = file;
        starter.articleshipApplicant = true;
        starter.articleshipGallery = profile.kind === 'gallery';
        starter.articleshipLayoutName = profile.name;
        starter.articleshipStarter = file;
        starter.tableSettings = clone(tableSettings || {});
        return starter;
    }

    function hasUnchangedStarterContent(data) {
        const profile = getTemplate(data?.articleshipStarter);
        if (!profile) return false;
        return contentKeys.every(key => JSON.stringify(normalizeContent(data[key])) === JSON.stringify(normalizeContent(profile.starter[key])));
    }

    function normalizeContent(value) {
        if (typeof value === 'string') {
            return value.replace(/<br\s*\/?>|<\/(?:p|li|div)>/gi, ' ')
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;|&#160;/gi, ' ')
                .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
                .replace(/\s+/g, ' ').trim();
        }
        if (Array.isArray(value)) return value.map(normalizeContent);
        if (value && typeof value === 'object') {
            return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalizeContent(value[key])]));
        }
        return value;
    }

    function buildAiPrompt(customPrompt) {
        const context = 'This CV is for a candidate who has cleared CA Intermediate and is seeking their first articleship. Polish only supplied facts. Do not invent employment, prior articleship, clients, responsibilities, qualifications, certifications, dates, scores or achievements. Keep square-bracket placeholders unchanged. Describe academic and self-directed projects as practice.';
        return [context, String(customPrompt || '').trim()].filter(Boolean).join('\n\n');
    }

    function getProgress(data) {
        function completed(value) {
            if (typeof value === 'string') {
                const text = normalizeContent(value);
                return Boolean(text && !/\[[^\]]*\]/.test(text));
            }
            if (Array.isArray(value)) return value.some(completed);
            if (value && typeof value === 'object') {
                const fields = Object.values(value).filter(field => typeof field === 'string' && field.trim());
                return fields.length > 0 && fields.every(completed);
            }
            return false;
        }
        const personal = data?.personal || {};
        let filled = completed(personal.name) ? 1 : 0;
        if ([personal.phone, personal.email, personal.linkedin, personal.location].some(completed)) filled += 1;
        if (completed(data.summary)) filled += 1;
        if (completed(data.skills)) filled += 1;
        if (completed(data.education)) filled += 1.5;
        if ([data.experience, data.projects, data.certifications, data.achievements, data.leadership].some(completed)) filled += 1.5;
        return Math.min((filled / 7) * 100, 100);
    }

    return {
        templates: profiles.map(({ starter, ...template }) => template),
        getTemplate,
        resolveRenderFile,
        createStarter,
        hasUnchangedStarterContent,
        buildAiPrompt,
        getProgress
    };
});
