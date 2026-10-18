(function (root, factory) {
    const catalog = factory();
    if (typeof module === 'object' && module.exports) module.exports = catalog;
    if (root) root.MSCArticleship = catalog;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    // Adapted from the completed J1 Day 1 CV pack; renderer files stay shared with the existing builder.
    const baseStarter = {
        "personal": {
            "name": "[YOUR NAME]",
            "tagline": "CA Intermediate | Both groups cleared",
            "contact": "",
            "phone": "[Mobile]",
            "email": "[Email]",
            "linkedin": "[LinkedIn URL]",
            "location": "[City]",
            "socialLinks": []
        },
        "summary": "",
        "education": [
            {
                "degree": "CA Intermediate — both groups",
                "institute": "ICAI",
                "year": "[Session / year]",
                "marks": "[Marks / maximum]",
                "remarks": "",
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
                    "Available from [date]",
                    "Preferred location: [city]"
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
            "summary": "Objective",
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
            "summary": "CA Intermediate cleared; seeking articleship in [audit / tax] in [city].",
            "skills": "<p><strong>Excel</strong>: [functions and tasks you can demonstrate]</p><p><strong>Accounting</strong>: [topics you can explain with an example]</p><p><strong>Communication</strong>: [languages used confidently]</p>",
            "leadership": [
                "[Activity / society] | [Role] | [Month year]",
                "Contributed to [activity] by [your specific task].",
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
            "summary": "Seeking statutory audit articleship; interested in financial statements and audit evidence.",
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
                        "Matched [sample entries] to supporting documents in a practice dataset.",
                        "Prepared [workpaper] recording the procedure, evidence and exceptions."
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
            "summary": "Seeking direct tax articleship; keen to learn computation, research and compliance work.",
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
                        "Prepared [computation] for a fictional [taxpayer type] for [assessment year].",
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
            "summary": "Seeking indirect tax articleship; interested in GST data checks and reconciliations.",
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
                        "Compared [two practice registers] using [matching fields].",
                        "Listed [unmatched items] and documented possible reasons for review."
                    ]
                }
            ]
        },
        {
            "file": "articleship-minimal-split",
            "name": "Minimal Split",
            "renderFile": "modern-split.html",
            "accent": "#28535e",
            "style": "split",
            "collection": "articleship",
            "sourceFile": "day-1/cv-templates/Minimal Split.docx",
            "summary": "CA Intermediate cleared; seeking articleship in [audit / tax] in [city].",
            "skills": "<p><strong>Excel</strong>: [tasks you can demonstrate]</p><p><strong>Accounting</strong>: [topics studied]</p>",
            "leadership": [
                "[Activity / organisation] | [Role] | [Dates]",
                "Contributed [specific task] to [activity].",
                "Participated in [competition / event] at [level]."
            ],
            "achievements": [
                "[Verified achievement / relevant subject result] | [Exam / institution] | [Year]."
            ]
        },
        {
            "file": "articleship-leadership-split",
            "name": "Leadership Split",
            "renderFile": "modern-split.html",
            "accent": "#28535e",
            "style": "split",
            "collection": "articleship",
            "sourceFile": "day-1/cv-templates/Leadership Split.docx",
            "summary": "Seeking [domain] articleship; available in [city] from [date].",
            "skills": "<p><strong>Excel</strong>: [tasks practised]</p><p><strong>Technical knowledge</strong>: [relevant topics studied]</p>",
            "leadership": [
                "[Club / class role] | [Organisation] | [Dates]",
                "Coordinated [activity] and divided [tasks] across [team].",
                "Resolved [specific issue] through [action]."
            ],
            "achievements": [
                "[Verified achievement / relevant subject result] | [Exam / institution] | [Year]."
            ],
            "interests": [
                "[Activity / competition] | [Dates]",
                "Achieved [result] or delivered [specific contribution]."
            ],
            "leadershipTitle": "Positions of Responsibility"
        }
    ];

    const profiles = definitions.map(definition => {
        const { summary, skills, leadership, projects = [], achievements = [], interests = [], leadershipTitle, ...template } = definition;
        const starter = JSON.parse(JSON.stringify(baseStarter));
        Object.assign(starter, { summary, skills, leadership, projects, achievements, interests });
        if (template.renderFile === 'modern-split.html') {
            starter.sectionTitles.achievements = 'Academic Highlights';
            starter.customSections.push({ id: 'custom_articleship_languages', title: 'Languages', items: ['[Languages used confidently]'] });
            starter.sectionOrder.splice(starter.sectionOrder.indexOf('custom_articleship_availability'), 0, 'custom_articleship_languages');
        }
        if (leadershipTitle) {
            starter.sectionTitles.leadership = leadershipTitle;
            starter.sectionLabels.leadership.text = leadershipTitle;
            starter.sectionTitles.interests = 'Extracurriculars';
            starter.sectionLabels.interests = { text: 'Extracurriculars', visible: true };
            starter.sectionOrder = starter.sectionOrder.filter(key => key !== 'interests');
            starter.sectionOrder.splice(starter.sectionOrder.indexOf('leadership') + 1, 0, 'interests');
        }
        return { ...template, starter };
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
