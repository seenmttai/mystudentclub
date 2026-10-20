/*
 * MSC Articleship Program: "Practise your interview" (row 4.13), the articleship mode of /ai-interview.html.
 * Builds the interviewer's plan from articleship-program/ai-interview/articleship-interview.json (the HR ladder with its
 * cross-questions, Core accounts, the domain booklet questions, workplace situations, the HR-call scenario set),
 * probes the student's own CV lines, renders the interviewer's instructions and reads the 1-4 scorecard back.
 * UMD: window.MSCArticleshipInterview in the page, require() in node --test.
 *
 * Release switch: MSCArticleshipProgress.WORK_SIMULATION_LIVE (the one flag in scripts/articleship-progress.js, read
 * here as WORK_SIMULATION_LIVE; options.workSimulationLive overrides it). While false (release 1), the interviewer never
 * hears of the Work Simulation: no question or listen-for line about its levels (MSCArticleshipProgress.releaseContent),
 * no earned lines read or probed, no "+ N Work Simulation lines" on the setup. Release 2 flips the shared flag.
 */
(function (root, factory) {
    const articleshipInterview = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = articleshipInterview;
    else root.MSCArticleshipInterview = articleshipInterview;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const ROLE = 'CA Articleship';
    const TOOL = 'ai-interview';
    const CONTENT_URL = '/articleship-program/ai-interview/articleship-interview.json';
    const BACK_URL = '/learning-management-system/course?course=msc-articleship-program&session=5';
    const LOGO_URL = '/articleship-program/shared/msc-logo.svg';
    const DEFAULT_DOMAIN = 'statutory-audit';
    const MAX_CV_TEXT = 3500;
    // The page reads the final report between these markers (ai-interview.html FINAL_REPORT_BLOCK_REGEX).
    const REPORT_START = '<<<FINAL_INTERVIEW_REPORT>>>';
    const REPORT_END = '<<<END_FINAL_INTERVIEW_REPORT>>>';
    const MAX_LINE = 200;

    // Shown before the content file arrives (and if it never does); the content file's rounds replace them.
    const ROUNDS = Object.freeze([
        { id: 'full', label: 'Full interview', minutes: 30, hint: 'Intro, CV, HR, core, domain' },
        { id: 'technical', label: 'Technical round', minutes: 20, hint: 'CV, core, your domain' },
        { id: 'hr', label: 'HR round', minutes: 20, hint: 'HR questions, situations' },
        { id: 'call', label: 'HR call', minutes: 10, hint: 'The screening call' }
    ].map(Object.freeze));

    // The programme's 13 domains (same slugs and labels as MSCArticleshipProgress.DOMAINS) + how a sentence says them.
    const DOMAINS = Object.freeze([
        { slug: 'statutory-audit', label: 'Statutory audit', spoken: 'statutory audit' },
        { slug: 'internal-audit', label: 'Internal audit, risk & IFC', spoken: 'internal audit' },
        { slug: 'direct-tax', label: 'Direct tax', spoken: 'direct tax' },
        { slug: 'gst', label: 'GST', spoken: 'GST' },
        { slug: 'bank-audit', label: 'Bank audit', spoken: 'bank audit' },
        { slug: 'transfer-pricing', label: 'Transfer pricing', spoken: 'transfer pricing' },
        { slug: 'ma-tax', label: 'M&A tax', spoken: 'M&A tax' },
        { slug: 'valuation', label: 'Valuation', spoken: 'valuation' },
        { slug: 'fdd', label: 'Financial due diligence', spoken: 'financial due diligence' },
        { slug: 'forensic', label: 'Forensic', spoken: 'forensic audit' },
        { slug: 'consulting', label: 'Consulting & risk advisory', spoken: 'consulting and risk advisory' },
        { slug: 'accounting', label: 'Accounting, MIS & company law', spoken: 'accounting and company law' },
        { slug: 'ib-er', label: 'IB & equity research', spoken: 'investment banking and equity research' }
    ].map(Object.freeze));

    const FIRM_TYPES = Object.freeze([
        { id: 'large', label: 'Big 4 / Big 6', worker: 'Big 4', spoken: 'a large network firm (Big 4 or Big 6)' },
        { id: 'mid', label: 'Mid-size', worker: 'Mid-Size', spoken: 'a mid-size CA firm' },
        { id: 'small', label: 'Small firm', worker: 'Small CA Firm', spoken: 'a small CA firm led by its partners' }
    ].map(Object.freeze));

    const TOUGHNESS = Object.freeze([
        {
            id: 'Easy', label: 'Friendly',
            rule: 'Friendly: warm and encouraging. Ask a cross-question only when an important point is missing. If they are stuck, give one small hint, then move on.'
        },
        {
            id: 'Medium', label: 'Standard',
            rule: 'Standard: a professional interviewer at a CA firm. When an answer is vague or misses a point under "Listen for", ask one cross-question before moving on.'
        },
        {
            id: 'Hard', label: 'Tough',
            rule: 'Tough: brisk and probing, never rude or aggressive. Cross-question most answers, up to two follow-ups, and ask for numbers and examples.'
        }
    ].map(Object.freeze));

    // How many of each kind a round asks (the plan is longer than the time on purpose: the interviewer trims from the end of a section).
    const ROUND_SHAPES = Object.freeze({
        full: { cv: 3, ladderFixed: ['why-domain', 'why-firm', 'attempts'], ladderExtra: 1, core: 5, domain: 5, situations: 1 },
        technical: { cv: 4, ladderFixed: ['why-domain'], ladderExtra: 0, core: 4, domain: 6, situations: 1, technicalSituations: true },
        hr: { cv: 2, ladderAll: true, core: 0, domain: 0, situations: 2 },
        call: { cv: 0, call: true }
    });

    // Which CV lines each round probes first.
    const CV_PREFERENCE = Object.freeze({
        full: ['simulation', 'work', 'programme', 'project', 'standard', 'tool', 'course', 'achievement', 'role', 'hobby'],
        technical: ['simulation', 'standard', 'tool', 'project', 'course', 'programme', 'work'],
        hr: ['role', 'achievement', 'hobby', 'work', 'programme', 'course', 'project'],
        call: []
    });

    const TECHNICAL_SITUATIONS = Object.freeze(['sit-fake-voucher', 'sit-round-sum', 'sit-untested', 'sit-ignore', 'sit-own-error', 'sit-data']);

    // Links from other tools (tracker, roadmaps, Work Simulation) may open a set mock: ?round=…&domain=…&firm=…
    const ROUND_ALIASES = Object.freeze({
        interview: 'full', 'full-interview': 'full', mock: 'full',
        tech: 'technical', 'technical-round': 'technical', domain: 'technical',
        'hr-round': 'hr', behavioural: 'hr', behavioral: 'hr',
        'hr-call': 'call', screening: 'call', phone: 'call', 'phone-call': 'call'
    });

    // The Work Simulation's progress store: the lines a student earned there are probed even before they reach the CV.
    const SIMULATION_TOOL = 'work-simulation';
    const MAX_EARNED = 6;

    function progressApi() {
        if (root && root.MSCArticleshipProgress) return root.MSCArticleshipProgress;
        if (typeof require === 'function') {
            try { return require('./articleship-progress.js'); } catch (_) { /* optional */ }
        }
        return null;
    }
    // Release 1 ships without the Work Simulation (row 1.6): the interviewer never names it until the shared switch is true.
    const WORK_SIMULATION_LIVE = (() => {
        const progress = progressApi();
        return Boolean(progress && progress.WORK_SIMULATION_LIVE === true);
    })();

    /** The release one call draws: options.workSimulationLive (true or false) wins, else the shared switch. */
    function workSimulationLive(options) {
        return options && typeof options.workSimulationLive === 'boolean' ? options.workSimulationLive : WORK_SIMULATION_LIVE;
    }

    /** The content as this release draws it (release 1: no question, cue or line about the Work Simulation). */
    function releaseFor(content, live) {
        const progress = progressApi();
        if (!content || !progress || typeof progress.releaseContent !== 'function') return content;
        return progress.releaseContent(content, { workSimulationLive: live }) || {};
    }

    // Words that tie an MSC Work Simulation line to its domain (the line starts "<Domain> Work Simulation, MSC Articleship Program").
    const DOMAIN_WORDS = Object.freeze([
        ['ma-tax', /m\s*&\s*a tax|buy-?back|capital reduction|demerger|slump sale/],
        ['transfer-pricing', /transfer pricing|arm'?s length|comparables|tnmm/],
        ['fdd', /due diligence|\bfdd\b|quality of earnings/],
        ['forensic', /forensic|red flags?/],
        ['bank-audit', /bank audit|branch audit|drawing power/],
        ['ib-er', /equity research|investment banking|\bib\b|analyst desk|target screen/],
        ['valuation', /valuation|\bdcf\b/],
        ['consulting', /consulting|profitability case|issue tree/],
        ['gst', /\bgst\b|gstr|\bitc\b|\bims\b/],
        ['direct-tax', /direct tax|income-?tax|tax audit|\btds\b|advance tax/],
        ['internal-audit', /internal audit|purchase-to-pay|\brcm\b|expense claims|control test/],
        ['accounting', /accounting|close the books|company law|board minutes/],
        ['statutory-audit', /statutory audit|vouching|physical verification|fixed assets|payroll|limited review|confirmations|caro/]
    ]);

    const LEGACY_RULES = [
        '- The candidate has cleared CA Intermediate and is applying for their first articleship. Do not assume prior articleship, client work or employment.',
        '- Ask one short question at a time. Cover their introduction, why they chose articleship and this firm, their CV, and the selected domain.',
        '- Test CA Intermediate concepts with simple practical scenarios. Calibrate every difficulty level to an incoming article assistant.',
        '- Use only details actually present in the CV. If no CV is supplied, ask about their education, skills and activities instead of inventing experience.',
        '- Include a question about willingness to learn, a question about teamwork, and a situation involving an error or an ethical concern.',
        '- When the candidate does not know, allow an honest response and move on. Do not demand knowledge gained only through client assignments.',
        '- Keep the interview professional. End with specific feedback on technical basics, clarity, honesty and two answers they can improve.'
    ];

    // ---------- small helpers ----------
    function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function list(value) { return Array.isArray(value) ? value : []; }
    function str(value) { return value === null || value === undefined ? '' : String(value); }

    function rng(seed) {
        let a = (Number(seed) >>> 0) || 0x9e3779b9;
        return function () {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function domainInfo(slug) {
        return DOMAINS.find(domain => domain.slug === slug) || null;
    }

    function normaliseDomain(value) {
        if (!value) return null;
        const progress = root && root.MSCArticleshipProgress;
        if (progress && typeof progress.normaliseDomain === 'function') {
            const slug = progress.normaliseDomain(value);
            if (slug && domainInfo(slug)) return slug;
        }
        const text = String(value).trim().toLowerCase();
        const spaced = text.replace(/[-_+]+/g, ' ').replace(/\s+/g, ' ');
        const direct = DOMAINS.find(domain => domain.slug === text || [domain.label, domain.spoken].some(name => {
            const lower = name.toLowerCase();
            return lower === text || lower === spaced;
        }));
        if (direct) return direct.slug;
        if (/indirect|gst/.test(text)) return 'gst';
        if (/direct.tax|income/.test(text)) return 'direct-tax';
        if (/internal/.test(text)) return 'internal-audit';
        if (/investment.bank|equity.research|\bib\b/.test(text)) return 'ib-er';
        if (/m\s*(&|and)\s*a|merger/.test(text)) return 'ma-tax';
        if (/consult|risk.advisory/.test(text)) return 'consulting';
        if (/bank/.test(text)) return 'bank-audit';
        if (/forensic/.test(text)) return 'forensic';
        if (/transfer.pricing|\btp\b/.test(text)) return 'transfer-pricing';
        if (/due.diligence|\bfdd\b/.test(text)) return 'fdd';
        if (/statutory|audit/.test(text)) return 'statutory-audit';
        if (/ind ?as|financial reporting|account|\bmis\b|company law/.test(text)) return 'accounting';
        if (/fp&a|corporate finance|valuation/.test(text)) return 'valuation';
        return null;
    }

    function roundInfo(content, id) {
        const rounds = content && list(content.rounds).length ? content.rounds : ROUNDS;
        return rounds.find(round => round.id === id) || rounds[0];
    }

    function firmTypeInfo(id) { return FIRM_TYPES.find(type => type.id === id) || FIRM_TYPES[1]; }
    function toughnessInfo(id) {
        if (id === 'Brutal') return TOUGHNESS[2];
        return TOUGHNESS.find(level => level.id === id || level.label === id) || TOUGHNESS[1];
    }

    // A firm name only: letters, digits, spaces and & . , ' ( ) -, at most 8 words. A shared ?firm= link cannot carry
    // markup or an instruction into the interviewer's prompt.
    const MAX_FIRM = 80;
    const MAX_FIRM_WORDS = 8;
    function cleanFirm(value) {
        const text = str(value).normalize('NFKC').replace(/[\u2018\u2019\u02bc]/g, "'").replace(/\s+/g, ' ')
            .replace(/[^\p{L}\p{M}\p{N} &.,'()\-]/gu, '').replace(/\s+/g, ' ').trim();
        return text.split(' ').slice(0, MAX_FIRM_WORDS).join(' ').slice(0, MAX_FIRM).trim();
    }

    function fill(text, vars) {
        return str(text)
            .replace(/\{domain\}/g, vars.domain)
            .replace(/\{other_domain\}/g, vars.otherDomain)
            .replace(/\{firm\}/g, vars.firm)
            .replace(/\{hook\}/g, '<the practical skill they named>');
    }

    // ---------- config for the existing page ----------
    function normalizeConfig(config) {
        if (!config || config.positionApplied !== ROLE) return config;
        const next = { ...config, experienceLevel: 'Fresher' };
        if (next.toughness === 'Brutal') next.toughness = 'Hard';
        return next;
    }

    // ---------- CV lines ----------
    function decodeEntities(text) {
        return str(text)
            .replace(/<\s*(br|\/p|\/li|\/div|\/h\d)\s*\/?>/gi, '\n')
            .replace(/<[^>]*>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#0?39;|&apos;/g, "'");
    }

    function cleanLine(line) {
        let text = decodeEntities(line).replace(/[​­]/g, '').replace(/\s+/g, ' ').trim();
        text = text.replace(/^(?:[•▪●◦‣∙·➢✓✔►▸*\-–—>]+\s*)+/, '').trim();
        text = text.replace(/^\(?\d{1,2}[.)]\s+/, '').trim();
        if (text.length > MAX_LINE) text = text.slice(0, MAX_LINE - 1).replace(/\s+\S*$/, '') + '…';
        return text;
    }

    const HEADINGS = /^(curriculum vitae|resume|r[ée]sum[ée]|profile|summary|professional summary|objective|career objective|education|educational qualifications?|academic (details|qualifications?)|qualifications?|experience|work experience|internships?|projects?|academic projects|skills|technical skills|key skills|soft skills|certifications?( and job simulations)?|courses|achievements|awards|extra-?curricular( activities)?|positions? of responsibility|leadership|interests|hobbies|languages( known)?|personal details|declaration|references)$/i;

    function isContactLine(text) {
        return /@|https?:\/\/|www\.|linkedin\.com|\bphone\b|\bmobile\b|\bemail\b|\be-mail\b|\baddress\b|date of birth|\bdob\b/i.test(text)
            || /(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/.test(text)
            || /\b\d[\d\s-]{9,}\d\b/.test(text.replace(/\b(19|20)\d{2}\s*[-–]\s*(19|20)?\d{2}\b/g, ''));
    }

    function keepLine(text) {
        if (!text || text.length < 6 || !/[a-z]/i.test(text)) return false;
        if (HEADINGS.test(text.replace(/[:\-–]+$/, '').trim())) return false;
        if (isContactLine(text)) return false;
        return true;
    }

    function finishLines(rawLines) {
        const merged = [];
        rawLines.forEach(raw => {
            const text = cleanLine(raw);
            if (!text) return;
            const prev = merged[merged.length - 1];
            const continues = prev && /^[a-z(&,]/.test(text) && !/[.:;!?]$/.test(prev) && (prev.length + text.length) < MAX_LINE * 1.5;
            if (continues) merged[merged.length - 1] = cleanLine(prev.replace(/…$/, '') + ' ' + text);
            else merged.push(text);
        });
        const seen = new Set();
        return merged.filter(text => {
            if (!keepLine(text)) return false;
            const key = text.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, 80);
    }

    /** Plain CV text (a profile's stored CV text, or text pulled from a PDF) to clean lines. */
    function cvLinesFromText(text) {
        return finishLines(decodeEntities(text).split(/\r?\n|[•▪●◦‣∙➢]/));
    }

    /** pdf.js text items [{ str, x, y, page }] to lines, top to bottom, left to right. */
    function cvLinesFromPdfItems(items) {
        const rows = [];
        list(items).forEach(item => {
            if (!item || !str(item.str).trim()) return;
            const page = Number(item.page) || 1;
            const y = Number(item.y) || 0;
            let row = rows.find(r => r.page === page && Math.abs(r.y - y) <= 2.5);
            if (!row) { row = { page, y, parts: [] }; rows.push(row); }
            row.parts.push({ x: Number(item.x) || 0, s: str(item.str) });
        });
        rows.sort((a, b) => a.page - b.page || b.y - a.y);
        const text = rows.map(row => row.parts.sort((a, b) => a.x - b.x).map(part => part.s).join(' ')).join('\n');
        return cvLinesFromText(text);
    }

    /** The CV Builder's saved CV (localStorage cv_maker_data) to lines. */
    function cvLinesFromBuilder(data) {
        if (!isObject(data)) return [];
        const lines = [];
        const add = value => { const text = decodeEntities(value).replace(/\s+/g, ' ').trim(); if (text) lines.push(text); };
        if (data.summary) decodeEntities(data.summary).split(/(?<=[.!?])\s+/).forEach(add);
        list(data.education).forEach(row => {
            if (!isObject(row)) return;
            add([row.degree, row.institute, row.year, row.marks, row.remarks].map(str).filter(Boolean).join(' | '));
        });
        list(data.experience).forEach(row => {
            if (!isObject(row)) return;
            const head = [row.role, row.company, row.category].map(str).filter(Boolean).join(', ');
            if (head) add(head);
            list(row.bullets).forEach(add);
        });
        list(data.projects).forEach(row => {
            if (!isObject(row)) return;
            add([row.title, row.description].map(str).filter(Boolean).join(': '));
            list(row.bullets).forEach(add);
        });
        list(data.certifications).forEach(row => {
            if (isObject(row)) add([row.name, row.issuer].map(str).filter(Boolean).join(' | '));
            else add(row);
        });
        list(data.achievements).forEach(add);
        list(data.leadership).forEach(add);
        list(data.customSections).forEach(section => {
            if (!isObject(section)) return;
            list(section.items).forEach(item => add(isObject(item) ? Object.values(item).map(str).join(' ') : item));
        });
        const skills = decodeEntities(data.skills).split(/[,;\n]/).map(s => s.trim()).filter(Boolean);
        if (skills.length) add('Skills: ' + skills.join(', '));
        const interests = list(data.interests).map(item => decodeEntities(item).trim()).filter(Boolean);
        if (interests.length) add('Interests: ' + interests.join(', '));
        return finishLines(lines);
    }

    function builderName(data) {
        const name = isObject(data) && isObject(data.personal) ? decodeEntities(data.personal.name).trim() : '';
        return /^\[.*\]$/.test(name) ? '' : name.slice(0, 60);
    }

    // ---------- Work Simulation lines ----------
    /**
     * The Work Simulation's saved data (progress tool "work-simulation") to its earned CV lines, read the way the CV
     * Builder reads them (articleship-cv-builder.js readEarnedLines): earned / earnedLines / lines / cvLines / cvQueue
     * arrays or maps, or a levels map with earnedLine. Only lines that name a Work Simulation; duplicates dropped.
     */
    function earnedLinesFrom(data) {
        if (!isObject(data)) return [];
        const raw = [];
        const take = item => {
            if (typeof item === 'string') { raw.push(item); return; }
            if (!isObject(item)) return;
            const given = item.line || item.cvLine || item.cv_line || item.earnedLine || item.text;
            if (typeof given === 'string') { raw.push(given); return; }
            const did = str(item.did || item.what || item.summary).trim();
            const domain = domainInfo(normaliseDomain(item.domain));
            if (did && domain) raw.push(domain.label + ' Work Simulation, MSC Articleship Program: ' + did);
        };
        ['cvQueue', 'addToCv', 'earned', 'earnedLines', 'lines', 'cvLines'].forEach(key => {
            const value = data[key];
            if (Array.isArray(value)) value.forEach(take);
            else if (isObject(value)) Object.values(value).forEach(take);
        });
        if (isObject(data.levels)) {
            Object.values(data.levels).forEach(level => {
                if (!isObject(level) || level.done === false) return;
                const line = level.earnedLine || level.cvLine || level.line;
                if (line) take(typeof line === 'string' ? line : Object.assign({ domain: level.domain }, line));
            });
        }
        const seen = new Set();
        return raw.map(cleanLine).filter(line => {
            if (!line || !/work simulation/i.test(line)) return false;
            const key = line.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        }).slice(0, MAX_EARNED);
    }

    function lineKey(text) {
        return str(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    }

    /** CV lines plus the earned lines the CV does not carry yet (a CV often keeps the line without its month). */
    function mergeCvLines(lines, extra) {
        const out = list(lines).map(str).filter(Boolean);
        const keys = out.map(lineKey);
        list(extra).forEach(line => {
            const text = cleanLine(line);
            const key = lineKey(text);
            if (!key) return;
            const did = lineKey(text.split(/:\s+/).slice(1).join(' '));
            const present = keys.some(k => k.includes(key) || (k.length > 30 && key.includes(k)) || (did.length > 20 && k.includes(did)));
            if (present) return;
            out.push(text);
            keys.push(key);
        });
        return out;
    }

    function readEarned(progress) {
        if (!progress || typeof progress.open !== 'function') return [];
        try { return earnedLinesFrom(progress.open(SIMULATION_TOOL, { defaults: {} }).get()); } catch (_) { return []; }
    }

    /** ?round=, ?domain= and ?firm= from a link into this tool (aliases and domain labels accepted). */
    function presetFromQuery(search, content) {
        let params;
        try { params = new URLSearchParams(str(search)); } catch (_) { return {}; }
        const rounds = content && list(content.rounds).length ? content.rounds : ROUNDS;
        const preset = {};
        const asked = str(params.get('round')).trim().toLowerCase().replace(/[\s_]+/g, '-');
        const round = ROUND_ALIASES[asked] || asked;
        if (round && rounds.some(item => item.id === round)) preset.round = round;
        const domain = normaliseDomain(params.get('domain'));
        if (domain) preset.domain = domain;
        const firm = cleanFirm(params.get('firm'));
        if (firm) preset.firm = firm;
        return preset;
    }

    // ---------- CV probes ----------
    // An education row (CA Inter marks, B.Com, college) is never "a course you took" or "a project".
    const EDUCATION_ROW = /\b(ca (inter(mediate)?|foundation|final)|b\.? ?com|m\.? ?com|bba|bms|class (x|xii|10|12)|hsc|ssc|cbse|icse|university|college|school)\b/i;
    const NOT_FOR_EDUCATION = ['course', 'project', 'work'];
    // "Explain the standard" and "what did you learn in the course" suit a line that names a standard or a course, not
    // a line that reports work done ("Prepared GSTR-1 data for 6 clients", "Three months as an intern: vouching, TDS").
    const KNOWLEDGE_PROBES = ['standard', 'course'];
    const WORK_LINE = /\b(intern(ship)?s?|worked|family business|freelanc\w*|articled)\b/i;
    const NAMES_STANDARD = /\b(ind ?as|as|sa|sqc)[ -]?\d{1,3}\b|accounting standard|standards? on auditing|schedule iii|caro\b/i;
    const DID_LINE = /^(prepared|vouched|reconciled|computed|calculated|reviewed|verified|audited|assisted|analy[sz]ed|kept|filed|maintained|handled|tested|matched|mapped|drafted|checked|recorded|posted|traced|compared|summari[sz]ed|scrutini[sz]ed|tallied|booked|entered|processed|supported|helped)\b/i;

    function compileProbes(content) {
        return list(content && content.cv_probes).map(probe => {
            let pattern = null;
            // "itt" (ICAI's IT training) must be a whole word, or "sitting" and "committee" read as courses.
            const source = str(probe.match).replace(/(^|\|)itt(?=\||$)/g, '$1\\bitt\\b');
            try { pattern = new RegExp(source, 'i'); } catch (_) { pattern = null; }
            return { ...probe, pattern };
        }).filter(probe => probe.pattern);
    }

    function simulationDomain(line) {
        const text = str(line).toLowerCase();
        const head = text.split(/work simulation|job simulation/)[0];
        const byName = DOMAINS.find(domain => head.includes(domain.label.toLowerCase()) || head.includes(domain.spoken.toLowerCase()));
        if (byName) return byName.slug;
        const hit = DOMAIN_WORDS.find(([, pattern]) => pattern.test(text));
        return hit ? hit[0] : null;
    }

    /** Every CV line with the first probe it fits (a simulation line wins over the programme line it names). */
    function matchCvProbes(lines, content) {
        const probes = compileProbes(content);
        const simulation = probes.find(probe => probe.type === 'simulation');
        return list(lines).map(line => {
            const text = str(line);
            let probe = null;
            if (simulation && /work simulation|job simulation/i.test(text)) probe = simulation;
            const education = EDUCATION_ROW.test(text);
            if (!probe) probe = probes.find(candidate => candidate.pattern.test(text) && !(education && NOT_FOR_EDUCATION.includes(candidate.type))) || null;
            if (probe && KNOWLEDGE_PROBES.includes(probe.type) && !education && !(probe.type === 'standard' && NAMES_STANDARD.test(text))) {
                const reported = DID_LINE.test(text) ? 'project' : WORK_LINE.test(text) ? 'work' : null;
                const better = reported && probes.find(candidate => candidate.type === reported);
                if (better) probe = better;
            }
            return probe ? { line: text, type: probe.type, label: probe.label, ask: probe.ask, cross: list(probe.cross) } : null;
        }).filter(Boolean);
    }

    function pickCvProbes(matches, roundId, max, content) {
        const preference = CV_PREFERENCE[roundId] || CV_PREFERENCE.full;
        if (!max || !preference.length) return [];
        const pool = list(matches).filter(match => preference.includes(match.type));
        const chosen = [];
        const used = new Set();
        for (let pass = 0; pass < 3 && chosen.length < max; pass += 1) {
            preference.forEach(type => {
                if (chosen.length >= max) return;
                const match = pool.find(candidate => candidate.type === type && !used.has(candidate.line));
                if (!match) return;
                used.add(match.line);
                chosen.push(match);
            });
        }
        return chosen.map(match => {
            const cross = match.cross.slice();
            if (match.type === 'simulation' && /work simulation/i.test(match.line)) {
                const slug = simulationDomain(match.line);
                const domain = slug && content && content.domains && content.domains[slug];
                if (domain) list(domain.simulation).forEach(q => cross.push(q));
            }
            return { ...match, cross };
        });
    }

    // ---------- choosing questions ----------
    function rankFresh(items, asked, rand) {
        return list(items)
            .map(item => ({ item, seen: Number((asked || {})[item.id]) || 0, r: rand() }))
            .sort((a, b) => a.seen - b.seen || a.r - b.r)
            .map(entry => entry.item);
    }

    function inOriginalOrder(picked, all) {
        const ids = new Set(picked.map(item => item.id));
        return list(all).filter(item => ids.has(item.id));
    }

    function pickCore(core, count, asked, rand) {
        if (!count) return [];
        const ranked = rankFresh(core, asked, rand);
        const chosen = [];
        const topics = new Set();
        const entry = ranked.find(item => item.topic === 'entries');
        if (entry) { chosen.push(entry); topics.add(entry.topic); }
        ranked.forEach(item => {
            if (chosen.length < count && !topics.has(item.topic)) { chosen.push(item); topics.add(item.topic); }
        });
        ranked.forEach(item => { if (chosen.length < count && !chosen.includes(item)) chosen.push(item); });
        return chosen;
    }

    function asItem(source, vars, extra) {
        return {
            id: source.id,
            q: fill(source.q, vars),
            tests: source.tests ? fill(source.tests, vars) : '',
            listen_for: list(source.listen_for).map(line => fill(line, vars)),
            cross: list(source.cross).map(line => fill(line, vars)),
            ...(extra || {})
        };
    }

    /** How many domain questions a practice asks: the round's number, but never the whole bank, so a retake rotates. */
    function domainCount(shape, bank) {
        const want = Number(shape && shape.domain) || 0;
        const size = list(bank).length;
        if (!want || !size) return 0;
        return Math.min(want, Math.max(1, size - 2));
    }

    /**
     * The interviewer's plan. options: { round, domain, firm, firmType, toughness, coach, cvLines, earnedLines, cvText,
     * cvAsImages, asked, retry, seed }.
     * earnedLines (Work Simulation lines) join the CV lines unless the CV already carries them (only once the Work
     * Simulation is out: options.workSimulationLive, else the shared switch). cvAsImages: the CV went
     * to the interviewer as page images (a scanned PDF with no text layer), so the prompt says it is attached.
     * Returns { round, minutes, domain, firm, firmType, toughness, coach, opening, sections: [{ id, title, items }], rubric, ... }.
     */
    function buildPlan(content, options) {
        const opts = options || {};
        const live = workSimulationLive(opts);
        const data = releaseFor(content || {}, live);
        const round = roundInfo(data, opts.round);
        const shape = ROUND_SHAPES[round.id] || ROUND_SHAPES.full;
        const slug = normaliseDomain(opts.domain) || DEFAULT_DOMAIN;
        const domain = domainInfo(slug);
        const domainContent = (data.domains && data.domains[slug]) || { questions: [], why: [], simulation: [], other: '' };
        const firm = cleanFirm(opts.firm);
        const firmType = firmTypeInfo(opts.firmType);
        const toughness = toughnessInfo(opts.toughness);
        const rand = rng(opts.seed === undefined ? Date.now() : opts.seed);
        const asked = isObject(opts.asked) ? opts.asked : {};
        const vars = {
            domain: domain.spoken,
            otherDomain: str(domainContent.other) || 'another team',
            firm: firm || 'our firm'
        };
        const sections = [];
        const add = (id, title, items, note) => { if (items.length) sections.push({ id, title, note: note || '', items }); };
        const cvLines = mergeCvLines(list(opts.cvLines).map(cleanLine).filter(keepLine).slice(0, 80), live ? opts.earnedLines : []).filter(keepLine);
        const retry = list(opts.retry).map(str).map(s => s.trim()).filter(Boolean).slice(0, 3);

        const cvAsImages = !cvLines.length && !!opts.cvAsImages;

        if (shape.call) {
            const call = data.call || {};
            const questions = list(call.questions);
            // The welcome line already asks the first call question ("Is this a good time to talk?"): never twice.
            add('call', 'The call', questions.map((q, i) => asItem(q, vars, i === 0 ? { spoken: true } : null)));
            const pressure = rankFresh(list(call.pressure), asked, rand);
            const howMany = toughness.id === 'Hard' ? 2 : 1;
            add('pressure', 'Pressure moments', inOriginalOrder(pressure.slice(0, howMany), call.pressure).map(q => asItem(q, vars)),
                'Bring each in once, at a natural point after the question on other offers. If they hold no other offer, start it with "Suppose".');
            if (retry.length) sections.unshift({ id: 'retry', title: 'Retry questions from their last practice', note: '', items: retry.map((q, i) => ({ id: 'retry-' + (i + 1), q, listen_for: [], cross: [] })) });
        } else {
            const ladder = list(data.ladder);
            const byId = id => ladder.find(item => item.id === id);
            const intro = byId('intro');
            const close = byId('questions-for-us');
            // The welcome line already asks them to introduce themselves; the item keeps its Listen for and cross-questions.
            add('opening', 'Opening', intro ? [asItem(intro, vars, { spoken: true })] : []);
            if (retry.length) add('retry', 'Retry questions from their last practice', retry.map((q, i) => ({ id: 'retry-' + (i + 1), q, listen_for: [], cross: [] })));
            const probes = pickCvProbes(matchCvProbes(cvLines, data), round.id, shape.cv, data);
            add('cv', 'Their CV lines', probes.map((probe, i) => ({
                id: 'cv-' + (i + 1),
                cvLine: probe.line,
                q: 'CV line: "' + probe.line + '". ' + probe.ask,
                listen_for: [],
                cross: probe.cross
            })), 'Quote the line, then ask. Probe only what the CV says.');
            if (cvAsImages && shape.cv) {
                add('cv', 'Their CV lines', [{
                    id: 'cv-images',
                    q: 'Pick ' + shape.cv + ' lines from the CV pages attached as images (work, projects, courses or simulations first). For each, quote the line, then ask what exactly they did, how, and what they learned.',
                    listen_for: ['Their own part in it, with numbers or examples', 'The concept behind it, at CA Intermediate level'],
                    cross: ['Walk me through one example step by step.', 'What would you do differently now?']
                }], 'Probe only what the CV says.');
            }

            let hr = [];
            if (shape.ladderAll) {
                hr = ladder.filter(item => item !== intro && item !== close);
            } else {
                const fixed = list(shape.ladderFixed).map(byId).filter(Boolean);
                const rest = rankFresh(ladder.filter(item => item !== intro && item !== close && !fixed.includes(item)), asked, rand);
                hr = inOriginalOrder(fixed.concat(rest.slice(0, shape.ladderExtra || 0)), ladder);
            }
            add('hr', round.id === 'technical' ? 'Why this domain' : 'HR questions', hr.map(item => {
                const built = asItem(item, vars);
                if (item.id === 'why-domain' && list(domainContent.why).length) {
                    built.listen_for = built.listen_for.concat(list(domainContent.why).map(line => 'For ' + domain.spoken + ': ' + line));
                }
                return built;
            }));

            const core = pickCore(list(data.core), shape.core, asked, rand);
            add('core', 'Core accounts', inOriginalOrder(core, data.core).map(item => asItem(item, vars)));

            const domainQs = rankFresh(list(domainContent.questions), asked, rand).slice(0, domainCount(shape, domainContent.questions));
            add('domain', domain.label, inOriginalOrder(domainQs, domainContent.questions).map(item => asItem(item, vars)));

            const pool = list(data.situations).filter(item => !shape.technicalSituations || TECHNICAL_SITUATIONS.includes(item.id));
            const situations = rankFresh(pool, asked, rand).slice(0, shape.situations || 0);
            add('situation', situations.length > 1 ? 'Workplace situations' : 'A workplace situation', situations.map(item => asItem(item, vars)));

            add('close', 'Close', close ? [asItem(close, vars)] : []);
        }

        const rubric = list(data.rubric && (shape.call ? data.rubric.call : data.rubric.default)).map(row => ({ id: row.id, row: row.row }));
        return {
            round: round.id,
            roundLabel: round.label,
            minutes: Number(round.minutes) || 30,
            domain: slug,
            domainLabel: domain.label,
            domainSpoken: domain.spoken,
            firm,
            firmType: firmType.id,
            toughness: toughness.id,
            coach: !!opts.coach,
            hasCv: cvLines.length > 0 || cvAsImages,
            cvAsImages,
            cvText: cvTextForPrompt(cvLines, opts.cvText),
            callRole: shape.call && data.call ? fill(data.call.role, vars) : '',
            callClose: shape.call && data.call ? str(data.call.close) : '',
            coachText: str(data.coach),
            rules: list(data.interviewer_rules).map(str),
            sections,
            rubric
        };
    }

    function cvTextForPrompt(lines, fallbackText) {
        let text = list(lines).join('\n');
        if (!text && fallbackText) text = cvLinesFromText(fallbackText).join('\n');
        return text.length > MAX_CV_TEXT ? text.slice(0, MAX_CV_TEXT).replace(/\n[^\n]*$/, '') : text;
    }

    function planQuestionIds(plan) {
        const ids = [];
        list(plan && plan.sections).forEach(section => list(section.items).forEach(item => {
            if (item.id && !/^(cv|retry)-/.test(item.id)) ids.push(item.id);
        }));
        return ids;
    }

    /**
     * Count questions once more in the store's data ({ asked: { id: n } }). ids: the questions the interview reached
     * (questionsReached); without it, every planned question. A mock left after a minute moves only what was asked.
     */
    function markAsked(data, plan, ids) {
        const target = isObject(data) ? data : {};
        const asked = isObject(target.asked) ? target.asked : {};
        const planned = new Set(planQuestionIds(plan));
        (Array.isArray(ids) ? ids.filter(id => planned.has(id)) : Array.from(planned)).forEach(id => { asked[id] = (Number(asked[id]) || 0) + 1; });
        target.asked = asked;
        return target;
    }

    const STOP_WORDS = new Set(('what which when where your their them they this that with from have will would could should about ' +
        'into than then there these those does done tell give explain please some just like also more most very each ' +
        'other only been were being after before again your yours ours shall must').split(' '));

    function keyWords(text) {
        return Array.from(new Set((str(text).toLowerCase().match(/[a-z0-9]+/g) || [])
            .filter(word => word.length >= 4 && !STOP_WORDS.has(word))
            .map(word => word.slice(0, 6))));
    }

    /**
     * The plan's question ids the interviewer actually reached: a question counts when one of the interviewer's messages
     * carries at least half of its key words (two at least). The opening counts once the candidate has answered.
     * said: the interviewer's messages (strings); answers: how many times the candidate spoke.
     */
    function questionsReached(plan, said, answers) {
        const messages = list(said).map(text => new Set(keyWords(text)));
        const reached = [];
        list(plan && plan.sections).forEach(section => list(section.items).forEach(item => {
            if (!item.id || /^(cv|retry)-/.test(item.id)) return;
            if (item.spoken) { if (Number(answers) > 0) reached.push(item.id); return; }
            const words = keyWords(item.q);
            if (!words.length) return;
            const need = Math.min(words.length, Math.max(2, Math.ceil(words.length / 2)));
            if (messages.some(set => words.filter(word => set.has(word)).length >= need)) reached.push(item.id);
        }));
        return reached;
    }

    const MAX_HISTORY = 30;

    /**
     * Save one finished mock into the tool's progress data: the questions reached (rotation), the retry questions from
     * the scorecard (the next practice offers them even if the student never taps "Practise my weak spots") and a
     * history entry { round, domain, total, max, at } that the tracker and the setup read ("Mocks done: 2, last 18/28").
     * mock: { plan, card, reached, answers, at }. A mock with no answer at all is not counted.
     */
    function recordMock(data, mock) {
        const target = isObject(data) ? data : {};
        const info = mock || {};
        const plan = info.plan || {};
        const answers = Number(info.answers) || 0;
        if (plan.sections) markAsked(target, plan, Array.isArray(info.reached) ? info.reached : []);
        const card = info.card || null;
        if (card && list(card.retry).length) {
            target.retry = card.retry.slice(0, 3);
            target.retryCall = plan.round === 'call';
        }
        if (answers > 0 || card) {
            const history = list(target.history).filter(isObject);
            history.push({
                round: plan.round || null,
                domain: plan.domain || null,
                total: card && card.max ? card.total : null,
                max: card && card.max ? card.max : null,
                at: info.at || new Date().toISOString()
            });
            target.history = history.slice(-MAX_HISTORY);
        }
        return target;
    }

    /** { done, last, text } from the tool's progress data: "Mocks done: 2, last 18/28" (or "Mocks done: 1"). */
    function mockSummary(data) {
        const history = list(isObject(data) ? data.history : null).filter(isObject);
        if (!history.length) return { done: 0, last: null, text: '' };
        const last = history[history.length - 1];
        const scored = history.slice().reverse().find(entry => Number(entry.max) > 0) || null;
        const text = 'Mocks done: ' + history.length + (scored ? ', last ' + scored.total + '/' + scored.max : '');
        return { done: history.length, last, lastScored: scored, text };
    }

    // ---------- whose CV is on this browser ----------
    // The CV Builder keeps its CV in localStorage (cv_maker_data) with no owner, and the profile's CV text (userCVText)
    // survives some sign-outs. On a shared phone the next student must not be offered the previous student's CV.
    const CV_GUARD_KEY = 'msc_ai_interview_cv_guard';
    const PROGRESS_PREFIX = 'msc.articleship.';

    function textSignature(text) {
        const value = str(text);
        let hash = 2166136261;
        for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
        return value.length + ':' + hash.toString(36);
    }

    function readStorage(storage, key) {
        try { return storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null; } catch (_) { return null; }
    }

    /** True when this browser holds programme progress or a profile cache owned by another account. */
    function otherStudentHere(storage, userId) {
        if (!storage || !userId) return false;
        const profileOwner = readStorage(storage, 'userProfileDataUserId') || readStorage(storage, 'msc_profile_cache_owner');
        if (profileOwner && profileOwner !== userId) return true;
        try {
            const count = Number(storage.length) || 0;
            for (let i = 0; i < count; i += 1) {
                const key = storage.key(i);
                if (!key || key.indexOf(PROGRESS_PREFIX) !== 0) continue;
                let envelope = null;
                try { envelope = JSON.parse(storage.getItem(key)); } catch (_) { envelope = null; }
                if (envelope && typeof envelope.owner === 'string' && envelope.owner && envelope.owner !== userId) return true;
            }
        } catch (_) { return false; }
        return false;
    }

    function readGuard(storage) {
        try {
            const guard = JSON.parse(readStorage(storage, CV_GUARD_KEY) || '{}');
            return isObject(guard) ? guard : {};
        } catch (_) { return {}; }
    }

    function writeGuard(storage, guard) {
        try { storage.setItem(CV_GUARD_KEY, JSON.stringify(guard)); } catch (_) { /* blocked storage: decided again next time */ }
    }

    /**
     * Which saved CVs this student may be offered: { builder, profile }. Call it before any progress store is opened
     * (opening one resets another account's progress). The first time a signed-in student meets another account's data
     * on this browser, the CVs found then are taken as that other student's and stay hidden from this one until they
     * change (the student edits the CV Builder CV) or this student has used that exact CV here before (claimCv).
     */
    function cvSourcesAllowed(storage, userId) {
        const builderRaw = readStorage(storage, 'cv_maker_data') || '';
        const profileRaw = readStorage(storage, 'userCVText') || '';
        if (!userId) return { builder: !!builderRaw, profile: !!profileRaw };
        const guard = readGuard(storage);
        const sig = { builder: builderRaw ? textSignature(builderRaw) : '', profile: profileRaw ? textSignature(profileRaw) : '' };
        if (otherStudentHere(storage, userId) && !(isObject(guard.hide) && guard.hide.user === userId)) {
            guard.hide = { user: userId, builder: sig.builder, profile: sig.profile };
            writeGuard(storage, guard);
        }
        const hide = isObject(guard.hide) && guard.hide.user === userId ? guard.hide : {};
        const mine = isObject(guard.claims) && isObject(guard.claims[userId]) ? guard.claims[userId] : {};
        const allowed = kind => !!sig[kind] && (mine[kind] === sig[kind] || hide[kind] !== sig[kind]);
        const profileOwner = readStorage(storage, 'userProfileDataUserId') || readStorage(storage, 'msc_profile_cache_owner');
        return {
            builder: allowed('builder'),
            profile: allowed('profile') && (!profileOwner || profileOwner === userId)
        };
    }

    /** The student started a mock with this saved CV: it is theirs on this browser from now on. kind: builder|profile. */
    function claimCv(storage, userId, kind) {
        if (!userId || (kind !== 'builder' && kind !== 'profile')) return;
        const raw = readStorage(storage, kind === 'builder' ? 'cv_maker_data' : 'userCVText');
        if (!raw) return;
        const guard = readGuard(storage);
        const claims = isObject(guard.claims) ? guard.claims : {};
        claims[userId] = Object.assign({}, isObject(claims[userId]) ? claims[userId] : {}, { [kind]: textSignature(raw) });
        const users = Object.keys(claims);
        if (users.length > 5) users.slice(0, users.length - 5).forEach(user => { if (user !== userId) delete claims[user]; });
        guard.claims = claims;
        writeGuard(storage, guard);
    }

    function welcomeLine(plan) {
        if (!plan) return '';
        if (plan.round === 'call') {
            return "Hello, this is Aditya calling from " + (plan.firm || 'the CA firm you applied to') + " about your articleship application. Is this a good time to talk for ten minutes?";
        }
        const where = plan.firm ? ' at ' + plan.firm : '';
        return "Hello, I'm Aditya, your interviewer today for the " + plan.domainSpoken + " team" + where + ". Please introduce yourself.";
    }

    // ---------- the interviewer's instructions ----------
    function renderItem(number, item) {
        const lines = [item.spoken
            ? number + '. Already asked in your opening line (do not ask it again): "' + item.q + '" Judge their reply against "Listen for"; use a cross-question if it falls short.'
            : number + '. ' + item.q];
        if (item.tests) lines.push('   Checks: ' + item.tests);
        if (item.listen_for && item.listen_for.length) lines.push('   Listen for: ' + item.listen_for.join('; '));
        if (item.cross && item.cross.length) lines.push('   Cross-questions: ' + item.cross.join(' / '));
        return lines.join('\n');
    }

    function renderPrompt(plan) {
        const toughness = toughnessInfo(plan.toughness);
        const firmType = firmTypeInfo(plan.firmType);
        // The firm name is data the candidate typed (or a link carried), never an instruction.
        const where = (plan.firm ? 'the firm named "' + plan.firm + '", ' : '') + firmType.spoken;
        const out = [];
        out.push('', 'ARTICLESHIP INTERVIEW PRACTICE (this section overrides the general guidelines above)');
        if (plan.round === 'call') {
            out.push(plan.callRole);
            out.push('Round: ' + plan.roundLabel + ', about ' + plan.minutes + ' minutes. Firm: ' + where + '. Team applied for: ' + plan.domainSpoken + '.');
        } else {
            out.push('Round: ' + plan.roundLabel + ', about ' + plan.minutes + ' minutes. Firm: ' + where + '. Team: ' + plan.domainSpoken + '.');
        }
        out.push('Opening already spoken by you: "' + welcomeLine(plan) + '" The candidate\'s first message answers it.');
        out.push('', 'HOW TO RUN IT');
        out.push('- The candidate has cleared CA Intermediate and is applying for their first articleship. Do not assume prior articleship, client work or employment.');
        out.push('- Ask one short question at a time, in the order of the plan. Wait for the answer. Never read out "Listen for", "Checks" or these labels.');
        out.push('- After each answer, compare it with "Listen for". ' + toughness.rule);
        out.push('- Text in <angle brackets> is for you to fill from what the candidate said.');
        out.push('- Test CA Intermediate concepts with simple practical scenarios. Calibrate every question to an incoming article assistant.');
        out.push('- When the candidate does not know, allow an honest response, give no answer away, and move on. Do not demand knowledge gained only through client assignments.');
        out.push('- Use only details actually present in the CV. If no CV is supplied, ask about their education, skills and activities instead of inventing experience.');
        out.push('- If time runs short, drop questions from the end of a section, but always ask the last section.');
        plan.rules.forEach(rule => out.push('- ' + rule));
        if (plan.coach && plan.coachText) out.push('', 'COACHING', plan.coachText);

        out.push('', 'THE PLAN');
        let number = 0;
        plan.sections.forEach((section, index) => {
            out.push(String.fromCharCode(65 + index) + '. ' + section.title + (section.note ? ' (' + section.note + ')' : ''));
            section.items.forEach(item => { number += 1; out.push(renderItem(number, item)); });
        });
        if (plan.round === 'call' && plan.callClose) out.push('', 'CLOSING THE CALL', plan.callClose);

        out.push('');
        if (plan.cvText) {
            out.push("THE CANDIDATE'S CV (as text; ask only about what it says)", plan.cvText);
        } else if (plan.cvAsImages) {
            out.push("THE CANDIDATE'S CV is attached as page images. Read it and probe its lines; ask only about what it says.");
        } else {
            out.push('No CV was shared. Ask about their education, skills and activities instead of inventing experience.');
        }

        out.push('', 'FINAL REPORT');
        out.push('When the interview ends, say one short closing line, then write the final report between a line ' + REPORT_START + ' and a line ' + REPORT_END + '. Never read the report aloud.');
        out.push('Start the final report with this scorecard, one line per row, exactly in this form:');
        out.push('<row number>. <row name> | <score>/4 | Evidence: "<their own words>" | Fix: <one fix> | Retry: <one fresh question on the same skill>');
        plan.rubric.forEach((row, i) => out.push((i + 1) + '. ' + row.row));
        out.push('Scores: 1 = missing, wrong or untrue; 2 = partly there; 3 = good with one gap; 4 = ready for a real interview. Write n/a as the score for a row the interview did not cover.');
        out.push('Quote evidence only from what they actually said. This is practice feedback, not a hiring prediction: never say whether they would be selected. After the scorecard, name the two answers to improve first.');
        return out.join('\n');
    }

    function getInstructions(config) {
        if (!config || config.positionApplied !== ROLE) return '';
        if (config.articleshipPlan && Array.isArray(config.articleshipPlan.sections)) return '\n' + renderPrompt(config.articleshipPlan);
        return '\n                    ARTICLESHIP INTERVIEW:\n' + LEGACY_RULES.map(rule => '                    ' + rule).join('\n');
    }

    // ---------- reading the scorecard back ----------
    // The interviewer is asked for "1. <row> | 3/4 | Evidence: … | Fix: … | Retry: …", but a model may answer with a
    // markdown table, "| Score: 3/4 |", "### 1. Row | 3/4" headings, a heading with "Score:" / "Evidence:" lines under
    // it, "3 out of 4" or prose ("Row: 3/4."). All of them are read; rows are matched by number or name prefix.
    const SCORE_SLASH = /(?:^|[^\d.\/])([0-4](?:\.\d)?)\s*(?:\/|out of)\s*4(?!\d|\.\d)/i;
    const SCORE_LABEL = /\b(?:score|rating|marks?)\s*[:=\-–]?\s*([0-4](?:\.\d)?)(?!\d|\.\d)(?!\s*(?:\/|out of)\s*[0-35-9])/i;
    const SCORE_CELL = /^([0-4](?:\.\d)?)(?:\s*(?:\/|out of)\s*4)?$/i;
    const NOT_SCORED = /^(?:score\s*[:=\-–]?\s*)?(?:n\/?a|-+|–|—|not (?:covered|asked|assessed|scored)|none|skipped)\.?$/i;
    const NOT_SCORED_IN_LINE = /\b(?:score\s*[:=\-–]?\s*)?(?:n\/a|not covered|not asked|not assessed)\b/i;
    const FIELD = /\b(evidence|fix|retry)(?:\s+question)?\s*(?:\([^)]*\))?\s*[:\-–]\s*/gi;
    const EMPTY_FIELD = /^(-+|–|—|n\/?a|none|not covered|not asked|nil)\.?$/i;
    const SCORECARD_HEADING = /^(?:your\s+|the\s+)?(?:interview\s+|practice\s+|final\s+)?(?:scorecard|score\s*card|scores)\s*:?$/i;

    function plainLine(raw) {
        return str(raw).replace(/\*\*|__/g, '').replace(/^\s*#{1,6}\s*/, '').replace(/^\s*(?:[-*•>]\s+)+/, '').trim();
    }

    function nameKey(text) {
        return str(text).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
    }

    /** text -> rubric index by name: the full name's first 14 characters, the part before ":", or its first word. */
    function rowMatcher(rows) {
        const keys = rows.map(row => {
            const full = nameKey(row.row);
            const head = nameKey(str(row.row).split(':')[0]);
            const first = full.split(' ')[0] || '';
            return { prefix: full.slice(0, 14).trim(), head: head.length >= 3 ? head : '', first: first.length >= 3 ? first : '' };
        });
        const firstWords = keys.map(k => k.first);
        return function (text) {
            const key = nameKey(text);
            if (!key) return -1;
            let best = -1;
            let bestLen = 0;
            keys.forEach((k, i) => {
                let len = 0;
                if (k.prefix && key.startsWith(k.prefix)) len = 100 + k.prefix.length;
                else if (k.head && (key === k.head || key.startsWith(k.head + ' '))) len = 50 + k.head.length;
                else if (k.first && firstWords.filter(word => word === k.first).length === 1 && (key === k.first || key.startsWith(k.first + ' '))) len = k.first.length;
                if (len > bestLen) { best = i; bestLen = len; }
            });
            return best;
        };
    }

    function cleanField(value) {
        const text = str(value).replace(/\s*\|+\s*$/, '').replace(/^[\s|:;,\-–]+/, '').trim()
            .replace(/^["“‘'](.*?)["”’']\.?$/, '$1').trim();
        return EMPTY_FIELD.test(text) ? '' : text;
    }

    /** "Evidence: … Fix: … Retry: …" inside one string -> { evidence, fix, retry }. */
    function labelledFields(text) {
        const out = {};
        const source = str(text);
        const marks = [];
        let match;
        FIELD.lastIndex = 0;
        while ((match = FIELD.exec(source))) marks.push({ name: match[1].toLowerCase(), start: match.index, end: FIELD.lastIndex });
        marks.forEach((mark, i) => {
            if (out[mark.name] !== undefined) return;
            out[mark.name] = cleanField(source.slice(mark.end, i + 1 < marks.length ? marks[i + 1].start : source.length));
        });
        return out;
    }

    /** A score in free text: "3/4", "3 out of 4", "Score: 3"; n/a -> NONE; nothing -> undefined. */
    const NONE = 'none';
    function scoreInText(text) {
        const value = str(text);
        let match = value.match(SCORE_SLASH) || value.match(SCORE_LABEL);
        if (match) return Number(match[1]);
        if (NOT_SCORED_IN_LINE.test(value)) return NONE;
        return undefined;
    }

    function scoreInCell(cell) {
        const value = str(cell).trim();
        if (NOT_SCORED.test(value)) return NONE;
        const match = value.match(SCORE_CELL);
        if (match) return Number(match[1]);
        const inText = value.match(SCORE_SLASH) || value.match(SCORE_LABEL);
        return inText ? Number(inText[1]) : undefined;
    }

    function headerMap(cells) {
        const map = {};
        cells.forEach((cell, i) => {
            const key = nameKey(cell);
            if (/^(score|rating|marks?)( out of 4| 1 4| 4)?$/.test(key)) map.score = i;
            else if (/^evidence/.test(key)) map.evidence = i;
            else if (/^fix/.test(key)) map.fix = i;
            else if (/^retry/.test(key)) map.retry = i;
            else if (/^(row|area|skill|criteri|parameter|dimension|aspect|competenc)/.test(key)) map.name = i;
            else if (/^(no|sr|s no|number)?$/.test(key) && i === 0) map.number = i;
        });
        return map.score !== undefined ? map : null;
    }

    function parseScorecard(text, rubric) {
        const rows = list(rubric);
        if (!text || !rows.length) return null;
        const matchRow = rowMatcher(rows);
        const found = new Map();
        const consumed = new Set();
        const lines = str(text).split(/\r?\n/);
        let header = null;
        let pending = null; // a row named on a heading line; its score and fields follow on the next lines
        let last = null; // the row a "Evidence: …" / "Fix: …" / "Retry: …" line under it belongs to

        const leadNumber = value => {
            const match = value.match(/^(?:row\s*)?(\d{1,2})\s*(?:[.):\-–]\s*|\s+(?=[a-z]))/i);
            return match ? { n: Number(match[1]), rest: value.slice(match[0].length).trim() } : { n: null, rest: value };
        };
        const indexFor = (n, name) => {
            const byName = matchRow(name);
            if (byName !== -1) return byName;
            return n && n >= 1 && n <= rows.length ? n - 1 : -1;
        };
        const save = (index, score, fields, lineIndexes) => {
            last = null;
            if (index < 0 || index >= rows.length || found.has(index) || score === undefined) return false;
            const value = score === NONE ? null : Math.max(0, Math.min(4, Math.round(Number(score))));
            const row = { score: value, evidence: fields.evidence || '', fix: fields.fix || '', retry: fields.retry || '' };
            found.set(index, row);
            lineIndexes.forEach(i => consumed.add(i));
            last = row;
            return true;
        };
        const closePending = () => {
            if (pending && pending.score !== undefined) save(pending.index, pending.score, pending.fields, pending.lines);
            pending = null;
        };

        lines.forEach((raw, lineIndex) => {
            const line = plainLine(raw);
            if (!line) return;

            // Markdown table rows.
            if (/^\|.*\|$/.test(line) || (line.split('|').length >= 3 && /^\|/.test(line))) {
                const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => plainLine(cell));
                if (cells.every(cell => /^:?-{2,}:?$/.test(cell) || !cell)) { if (header) consumed.add(lineIndex); return; }
                const map = headerMap(cells);
                if (map && !cells.some(cell => SCORE_SLASH.test(cell))) { closePending(); header = map; consumed.add(lineIndex); return; }
                closePending();
                let n = null;
                let nameAt = header && header.name !== undefined ? header.name : -1;
                if (header && header.number !== undefined && /^\d{1,2}[.)]?$/.test(cells[header.number])) n = parseInt(cells[header.number], 10);
                if (nameAt === -1) {
                    nameAt = cells.findIndex(cell => /[a-z]{3}/i.test(cell) && !SCORE_SLASH.test(cell) && !NOT_SCORED.test(cell) && !/^(evidence|fix|retry)\b/i.test(cell));
                    if (cells[0] && /^\d{1,2}[.)]?$/.test(cells[0])) n = parseInt(cells[0], 10);
                }
                if (nameAt === -1) return;
                const lead = leadNumber(cells[nameAt]);
                if (lead.n !== null && n === null) n = lead.n;
                const index = indexFor(n, lead.rest);
                if (index === -1) return;
                let scoreAt = header ? header.score : -1;
                let score = scoreAt >= 0 ? scoreInCell(cells[scoreAt]) : undefined;
                if (score === undefined) {
                    scoreAt = cells.findIndex((cell, i) => i !== nameAt && scoreInCell(cell) !== undefined && !/^(evidence|fix|retry)\b/i.test(cell));
                    score = scoreAt >= 0 ? scoreInCell(cells[scoreAt]) : undefined;
                }
                if (score === undefined) score = scoreInText(cells[nameAt].slice(lead.rest.length ? cells[nameAt].indexOf(lead.rest) + lead.rest.length : 0));
                const labelled = labelledFields(cells.filter((_, i) => i !== nameAt && i !== scoreAt).map(cell => /^(evidence|fix|retry)\b/i.test(cell) ? ' | ' + cell : ' | ' + cell).join(''));
                const fields = {};
                ['evidence', 'fix', 'retry'].forEach((name, order) => {
                    if (header && header[name] !== undefined) fields[name] = cleanField(cells[header[name]]);
                    else if (labelled[name] !== undefined) fields[name] = labelled[name];
                    else if (!header && scoreAt >= 0) {
                        const rest = cells.filter((cell, i) => i > Math.max(scoreAt, nameAt) && !/^(evidence|fix|retry)\b/i.test(cell));
                        fields[name] = cleanField(rest[order]);
                    }
                });
                save(index, score, fields, [lineIndex]);
                return;
            }

            // "Evidence: …" lines under a row that already has its score ("### 1. Row | 3/4").
            if (!pending && last && /^(evidence|fix|retry)(?:\s+question)?\b/i.test(line)) {
                const extra = labelledFields(line);
                Object.keys(extra).forEach(key => { if (!last[key]) last[key] = extra[key]; });
                consumed.add(lineIndex);
                return;
            }

            // "Score: 3/4", "Evidence: …" lines under a heading that named the row.
            if (pending) {
                const label = line.match(/^(score|rating|marks?|evidence|fix|retry)(?:\s+question)?\b/i);
                if (label) {
                    const kind = label[1].toLowerCase();
                    if (/^(score|rating|mark)/.test(kind)) {
                        const value = scoreInCell(line.replace(/^(score|rating|marks?)\s*[:=\-–]?\s*/i, '')) ;
                        if (value !== undefined && pending.score === undefined) pending.score = value;
                        const extra = labelledFields(line);
                        Object.keys(extra).forEach(key => { if (!pending.fields[key]) pending.fields[key] = extra[key]; });
                    } else {
                        const extra = labelledFields(line);
                        Object.keys(extra).forEach(key => { if (!pending.fields[key]) pending.fields[key] = extra[key]; });
                    }
                    pending.lines.push(lineIndex);
                    return;
                }
            }

            const lead = leadNumber(line);
            const byName = matchRow(lead.rest);
            if (byName === -1 && lead.n === null) { closePending(); last = null; return; }
            const index = indexFor(lead.n, lead.rest);
            if (index === -1) { closePending(); last = null; return; }
            // The text after the row name: "| 3/4 | Evidence …", ": 3/4.", " - 3 out of 4", " (Score: 3)".
            const lowerRest = lead.rest.toLowerCase();
            const canonical = str(rows[index].row).toLowerCase();
            let after = lowerRest.startsWith(canonical) ? lead.rest.slice(canonical.length) : lead.rest.replace(/^[^|:–—(]*?(?=\s*[|:–—(]|\s+-\s)/, '');
            if (after === lead.rest && byName === -1) after = lead.rest;
            let score = scoreInText(after);
            if (score === undefined) {
                const bare = after.match(/^\s*(?:[|:\-–—(]\s*)?([0-4](?:\.\d)?)(?:\s*points?)?\s*(?=[|.,;)]|$)/i);
                if (bare) score = Number(bare[1]);
            }
            closePending();
            const fields = labelledFields(after);
            if (score !== undefined) {
                save(index, score, fields, [lineIndex]);
                return;
            }
            // A heading naming the row with nothing scored yet: the score may follow on the next lines.
            if (lead.rest.length <= str(rows[index].row).length + 24) pending = { index, score: undefined, fields, lines: [lineIndex] };
        });
        closePending();

        if (found.size < Math.min(3, rows.length)) return null;
        // A "Scorecard" heading just above the first scored row goes with it.
        const first = Math.min(...consumed);
        for (let i = first - 1; i >= 0; i -= 1) {
            const line = plainLine(lines[i]);
            if (!line) continue;
            if (SCORECARD_HEADING.test(line)) consumed.add(i);
            break;
        }
        const scored = rows.map((row, i) => ({ id: row.id, row: row.row, ...(found.get(i) || { score: null, evidence: '', fix: '', retry: '' }) }));
        const counted = scored.filter(row => row.score !== null);
        const total = counted.reduce((sum, row) => sum + row.score, 0);
        const weakest = counted.filter(row => row.score <= 2).sort((a, b) => a.score - b.score);
        return {
            rows: scored,
            total,
            max: counted.length * 4,
            weakest,
            retry: weakest.map(row => row.retry).filter(Boolean).slice(0, 3),
            lines: Array.from(consumed).sort((a, b) => a - b)
        };
    }

    /** The report text without the scorecard lines parseScorecard read (the page shows those as the scorecard). */
    function stripScorecard(text, card) {
        if (!card || !Array.isArray(card.lines) || !card.lines.length) return str(text);
        const drop = new Set(card.lines);
        return str(text).split(/\r?\n/).filter((_, i) => !drop.has(i)).join('\n')
            .replace(/\n{3,}/g, '\n\n').trim();
    }

    /**
     * An interviewer message that carries the scorecard without the report markers: { spoken, report }, where spoken is
     * what came before the scorecard (the closing line, read aloud) and report is the rest (shown, never read aloud).
     * null when the message holds no scorecard.
     */
    function splitUnmarkedReport(text, rubric) {
        const card = parseScorecard(text, rubric);
        if (!card || !card.lines.length) return null;
        const lines = str(text).split(/\r?\n/);
        const first = card.lines[0];
        return {
            spoken: lines.slice(0, first).join(' ').replace(/\s+/g, ' ').trim(),
            report: lines.slice(first).join('\n').trim()
        };
    }

    /** The scorecard from the report, or else from the interviewer's last messages (a report sent without markers). */
    function findScorecard(reportText, messages, rubric) {
        const fromReport = parseScorecard(reportText, rubric);
        if (fromReport) return { card: fromReport, text: str(reportText), source: 'report' };
        const said = list(messages).filter(m => m && m.role === 'assistant').map(m => str(m.content)).slice(-4).reverse();
        for (const message of said) {
            const card = parseScorecard(message, rubric);
            if (card) return { card, text: message, source: 'message' };
        }
        return null;
    }

    // ---------- the setup screen (articleship mode) ----------
    function el(doc, tag, attrs, children) {
        const node = doc.createElement(tag);
        Object.entries(attrs || {}).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) return;
            if (key === 'class') node.className = value;
            else if (key === 'text') node.textContent = value;
            else if (key === 'checked' || key === 'disabled' || key === 'hidden') node[key] = !!value;
            else node.setAttribute(key, value === true ? '' : String(value));
        });
        list(children).forEach(child => { if (child) node.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child); });
        return node;
    }

    function radioGroup(doc, name, legend, options, selected, extraClass) {
        const wrap = el(doc, 'div', { class: 'aii-options ' + (extraClass || '') });
        options.forEach(option => {
            const input = el(doc, 'input', { type: 'radio', name, value: option.value, checked: option.value === selected });
            const label = el(doc, 'label', { class: 'aii-option' }, [input, el(doc, 'span', { class: 'aii-option-body' }, [
                el(doc, 'span', { class: 'aii-option-name', text: option.label }),
                option.meta ? el(doc, 'span', { class: 'aii-option-meta', text: option.meta }) : null
            ])]);
            wrap.appendChild(label);
        });
        return el(doc, 'fieldset', { class: 'aii-field' }, [el(doc, 'legend', { class: 'aii-label', text: legend }), wrap]);
    }

    function checkedValue(form, name) {
        const input = form.querySelector('input[name="' + name + '"]:checked');
        return input ? input.value : '';
    }

    /**
     * Mount the articleship setup into `container`. options: { content, store, progress, cvSources, fromDropdown,
     * otherRolesHref, onStart(setup) -> Promise, workSimulationLive }. cvSources: [{ kind: 'builder'|'profile', label,
     * detail, lines }].
     */
    function mountSetup(container, options) {
        const opts = options || {};
        const doc = container.ownerDocument;
        const content = opts.content || {};
        const rounds = list(content.rounds).length ? content.rounds : ROUNDS;
        const store = opts.store || null;
        const saved = store ? (store.get() || {}) : {};
        const last = isObject(saved.last) ? saved.last : {};
        const progress = opts.progress || null;
        const view = doc.defaultView;
        const preset = isObject(opts.preset) ? opts.preset
            : presetFromQuery(opts.query !== undefined ? opts.query : (view && view.location ? view.location.search : ''), content);
        let myDomain = null;
        try { myDomain = progress && progress.getMyDomain ? progress.getMyDomain() : null; } catch (_) { myDomain = null; }
        const lastDomain = normaliseDomain(last.domain);
        const domainDefault = normaliseDomain(preset.domain)
            || ((myDomain && (!lastDomain || last.myDomain !== myDomain)) ? myDomain : (lastDomain || myDomain || DEFAULT_DOMAIN));
        // Release 1: no Work Simulation, so no earned lines to read, show or probe.
        const live = workSimulationLive(opts);
        const earnedLines = () => (!live ? [] : Array.isArray(opts.earnedLines) ? earnedLinesFrom({ lines: opts.earnedLines }) : readEarned(progress));
        const cvSources = list(opts.cvSources).filter(source => source && list(source.lines).length >= 3);
        const retry = list(saved.retry).filter(Boolean);
        // Retry questions from a screening call go to a call; those from an interview go to an interview.
        const retryFits = round => (round === 'call') === !!saved.retryCall;

        const topbar = el(doc, 'header', { class: 'ap-topbar' }, [
            el(doc, 'a', { class: 'ap-brand', href: BACK_URL, 'aria-label': 'Back to the programme' }, [
                el(doc, 'img', { src: LOGO_URL, alt: 'My Student Club', width: '132', height: '26' })
            ]),
            el(doc, 'span', { class: 'ap-topbar-title', text: 'Practise your interview' })
        ]);
        const title = el(doc, 'h1', { class: 'ap-title' }, ['Your mock ', el(doc, 'span', { class: 'ap-mark', text: 'interview' })]);
        const lede = el(doc, 'p', { class: 'ap-lede', text: 'Real articleship questions, follow-ups on your answers and your own CV lines. A scorecard at the end.' });
        const summary = mockSummary(saved);
        const done = summary.done ? el(doc, 'p', { class: 'aii-done', text: summary.text }) : null;

        const form = el(doc, 'form', { class: 'ap-card aii-form', novalidate: true });
        form.appendChild(radioGroup(doc, 'aii-round', 'Round', rounds.map(round => ({
            value: round.id, label: round.label, meta: round.minutes + ' min · ' + round.hint
        })), rounds.some(round => round.id === preset.round) ? preset.round
            : rounds.some(round => round.id === last.round) ? last.round : rounds[0].id, 'is-rounds'));

        const domainSelect = el(doc, 'select', { id: 'aii-domain', class: 'aii-input', name: 'aii-domain' });
        DOMAINS.forEach(domain => domainSelect.appendChild(el(doc, 'option', { value: domain.slug, text: domain.label })));
        domainSelect.value = domainDefault;
        form.appendChild(el(doc, 'div', { class: 'aii-field' }, [el(doc, 'label', { class: 'aii-label', for: 'aii-domain', text: 'Domain' }), domainSelect]));

        const firmInput = el(doc, 'input', { id: 'aii-firm', class: 'aii-input', type: 'text', maxlength: '80', autocomplete: 'off', placeholder: 'Firm name (optional)' });
        firmInput.value = cleanFirm(preset.firm || last.firm);
        form.appendChild(el(doc, 'div', { class: 'aii-field' }, [el(doc, 'label', { class: 'aii-label', for: 'aii-firm', text: 'Firm' }), firmInput]));
        // Firm size and toughness fold under "More options", their current choice shown on the row.
        const moreState = el(doc, 'span', { class: 'aii-more-state' });
        const more = el(doc, 'details', { class: 'aii-more' }, [
            el(doc, 'summary', { class: 'aii-more-summary' }, [el(doc, 'span', { class: 'aii-label', text: 'More options' }), moreState]),
            el(doc, 'div', { class: 'aii-more-body' }, [
                radioGroup(doc, 'aii-firm-type', 'Firm size', FIRM_TYPES.map(type => ({ value: type.id, label: type.label })),
                    FIRM_TYPES.some(type => type.id === last.firmType) ? last.firmType : 'mid', 'is-pills'),
                radioGroup(doc, 'aii-toughness', 'Toughness', TOUGHNESS.map(level => ({ value: level.id, label: level.label })),
                    toughnessInfo(last.toughness).id, 'is-pills')
            ])
        ]);
        form.appendChild(more);
        const showMore = () => {
            moreState.textContent = firmTypeInfo(checkedValue(form, 'aii-firm-type')).label + ' · ' + toughnessInfo(checkedValue(form, 'aii-toughness')).label;
        };
        more.addEventListener('change', showMore);
        showMore();

        const cvOptions = cvSources.map(source => ({ value: source.kind, label: source.label }))
            .concat([{ value: 'pdf', label: 'Upload PDF' }, { value: 'none', label: 'No CV' }]);
        const cvDefault = cvSources.length ? cvSources[0].kind : 'pdf';
        const cvGroup = radioGroup(doc, 'aii-cv', 'Your CV', cvOptions, cvDefault, 'is-pills');
        const fileInput = el(doc, 'input', { type: 'file', accept: 'application/pdf,.pdf', class: 'aii-file', id: 'aii-cv-file', 'aria-label': 'CV file (PDF)' });
        const fileNote = el(doc, 'p', { class: 'aii-note', 'aria-live': 'polite' });
        const earnedNote = el(doc, 'p', { class: 'aii-note aii-earned' });
        cvGroup.appendChild(fileInput);
        cvGroup.appendChild(fileNote);
        cvGroup.appendChild(earnedNote);
        form.appendChild(cvGroup);

        const pickFile = () => { if (typeof fileInput.click === 'function') fileInput.click(); };
        // Work Simulation lines the chosen CV does not carry yet are probed too ("+ 2 Work Simulation lines").
        const showEarned = () => {
            const kind = checkedValue(form, 'aii-cv');
            const source = cvSources.find(item => item.kind === kind);
            const earned = kind === 'none' ? [] : earnedLines();
            const fresh = source ? mergeCvLines(source.lines, earned).length - source.lines.length : earned.length;
            earnedNote.textContent = fresh > 0 ? '+ ' + fresh + ' Work Simulation line' + (fresh > 1 ? 's' : '') : '';
        };
        const showCvNote = () => {
            const kind = checkedValue(form, 'aii-cv');
            const source = cvSources.find(item => item.kind === kind);
            const file = fileInput.files && fileInput.files[0];
            if (source) fileNote.replaceChildren(source.detail || '');
            else if (kind === 'pdf' && file) fileNote.replaceChildren(file.name + ' ', el(doc, 'button', { type: 'button', class: 'aii-linkbtn', text: 'Change' }));
            else if (kind === 'pdf') fileNote.replaceChildren(el(doc, 'button', { type: 'button', class: 'ap-btn is-secondary aii-choose', text: 'Choose your CV (PDF)' }));
            else fileNote.replaceChildren();
            showEarned();
        };
        fileNote.addEventListener('click', event => {
            if (event.target && event.target.tagName === 'BUTTON') pickFile();
        });
        cvGroup.addEventListener('change', event => {
            if (event.target === fileInput) {
                const pdf = form.querySelector('input[name="aii-cv"][value="pdf"]');
                if (pdf && fileInput.files && fileInput.files[0]) pdf.checked = true;
            }
            showCvNote();
        });
        // A tap on the "Upload PDF" pill (not keyboard arrows, which click the radio itself) opens the file picker.
        cvGroup.addEventListener('click', event => {
            const target = event.target;
            if (!target || target.tagName === 'INPUT' || target.tagName === 'BUTTON' || !target.closest) return;
            const label = target.closest('label.aii-option');
            if (label && label.querySelector('input[value="pdf"]') && !(fileInput.files && fileInput.files[0])) pickFile();
        });
        showCvNote();
        // Lines earned on another device arrive with the account copy of the Work Simulation's progress.
        if (live && !Array.isArray(opts.earnedLines) && progress && typeof progress.open === 'function') {
            try {
                const simulation = progress.open(SIMULATION_TOOL, { defaults: {} });
                if (simulation && typeof simulation.subscribe === 'function') simulation.subscribe(showEarned);
            } catch (_) { /* local only */ }
        }

        const coach =el(doc, 'input', { type: 'checkbox', id: 'aii-coach', checked: !!last.coach });
        form.appendChild(el(doc, 'label', { class: 'aii-switch', for: 'aii-coach' }, [coach, el(doc, 'span', { class: 'aii-switch-track', 'aria-hidden': 'true' }), el(doc, 'span', { text: 'Coach me after each answer' })]));

        let retryBox = null;
        let retryLabel = null;
        if (retry.length) {
            retryBox = el(doc, 'input', { type: 'checkbox', id: 'aii-retry', checked: true });
            retryLabel = el(doc, 'label', { class: 'aii-retry ap-sticky', for: 'aii-retry' }, [retryBox, el(doc, 'span', {}, [
                el(doc, 'strong', { text: 'Your weak spots' }), ' Start with the ' + Math.min(retry.length, 3) + ' retry question' + (retry.length > 1 ? 's' : '') + ' from your last scorecard.'
            ])]);
            form.appendChild(retryLabel);
            const syncRetry = () => { retryLabel.hidden = !retryFits(checkedValue(form, 'aii-round')); };
            form.addEventListener('change', syncRetry);
            syncRetry();
        }

        const error = el(doc, 'p', { class: 'aii-error', role: 'alert', hidden: true });
        const button = el(doc, 'button', { type: 'submit', class: 'ap-btn is-block aii-start', text: 'Start interview' });
        // On a phone the Start button stays in reach at the bottom of the screen.
        form.appendChild(el(doc, 'div', { class: 'aii-actions' }, [error, button]));
        if (opts.fromDropdown && opts.otherRolesHref) {
            form.appendChild(el(doc, 'p', { class: 'aii-other' }, [el(doc, 'a', { class: 'ap-link', href: opts.otherRolesHref, text: 'Practising for another role?' })]));
        }

        const main = el(doc, 'main', { class: 'ap-main aii-main' }, [el(doc, 'div', { class: 'ap-hero' }, [title, lede, done]), form]);
        container.replaceChildren(topbar, main);

        function readSetup() {
            const kind = checkedValue(form, 'aii-cv');
            const round = checkedValue(form, 'aii-round') || rounds[0].id;
            const source = cvSources.find(item => item.kind === kind);
            return {
                round,
                domain: domainSelect.value || DEFAULT_DOMAIN,
                firm: cleanFirm(firmInput.value),
                firmType: checkedValue(form, 'aii-firm-type') || 'mid',
                toughness: checkedValue(form, 'aii-toughness') || 'Medium',
                coach: !!coach.checked,
                retry: retryBox && retryBox.checked && retryFits(round) ? retry.slice(0, 3) : [],
                earnedLines: kind === 'none' ? [] : earnedLines(),
                cv: source ? { kind, lines: source.lines.slice() }
                    : kind === 'pdf' ? { kind, file: fileInput.files && fileInput.files[0] ? fileInput.files[0] : null }
                        : { kind: 'none' }
            };
        }

        form.addEventListener('submit', event => {
            event.preventDefault();
            const setup = readSetup();
            if (setup.cv.kind === 'pdf' && !setup.cv.file) {
                error.textContent = 'Choose your CV file, or pick No CV.';
                error.hidden = false;
                return;
            }
            error.hidden = true;
            if (store) {
                store.update(data => {
                    data.last = { round: setup.round, domain: setup.domain, myDomain, firm: setup.firm, firmType: setup.firmType, toughness: setup.toughness, coach: setup.coach };
                    if (setup.retry.length || (retryBox && !retryBox.checked && retryFits(setup.round))) { data.retry = []; data.retryCall = false; }
                    return data;
                });
            }
            button.disabled = true;
            button.textContent = 'Starting…';
            Promise.resolve(typeof opts.onStart === 'function' ? opts.onStart(setup) : null)
                .catch(() => {
                    error.textContent = 'This did not start. Check your connection and try again.';
                    error.hidden = false;
                })
                .finally(() => { button.disabled = false; button.textContent = 'Start interview'; });
        });

        return { form, readSetup };
    }

    // ---------- the scorecard on the report screen ----------
    function renderScorecard(container, card, options) {
        const opts = options || {};
        const doc = container.ownerDocument;
        if (!card) {
            // The report came back without a scorecard the page can read: one line, never a silent gap.
            if (opts.fallback) {
                container.replaceChildren(el(doc, 'p', { class: 'aii-sc-fallback', text: opts.fallback }));
                return container;
            }
            container.replaceChildren();
            return null;
        }
        const head = el(doc, 'div', { class: 'aii-sc-head' }, [
            el(doc, 'h2', { class: 'aii-sc-title', text: 'Your scorecard' }),
            card.max ? el(doc, 'span', { class: 'aii-sc-total', text: card.total + ' / ' + card.max }) : null
        ]);
        const rows = el(doc, 'ol', { class: 'aii-sc-rows' });
        card.rows.forEach(row => {
            const dots = el(doc, 'span', { class: 'aii-sc-dots', 'aria-label': row.score === null ? 'Not covered' : row.score + ' of 4' });
            for (let i = 1; i <= 4; i += 1) dots.appendChild(el(doc, 'span', { class: 'aii-sc-dot' + (row.score !== null && i <= row.score ? ' is-on' : '') }));
            const covered = row.score !== null;
            const item = el(doc, 'li', { class: 'aii-sc-row' + (covered && row.score <= 2 ? ' is-weak' : '') + (covered ? '' : ' is-skipped') }, [
                el(doc, 'div', { class: 'aii-sc-line' }, [el(doc, 'span', { class: 'aii-sc-name', text: row.row }),
                    el(doc, 'span', { class: 'aii-sc-meter' }, [covered ? dots : null,
                        el(doc, 'span', { class: 'aii-sc-score', text: covered ? row.score + '/4' : 'Not asked' })])]),
                row.evidence ? el(doc, 'p', { class: 'aii-sc-evidence', text: '“' + row.evidence + '”' }) : null,
                row.fix ? el(doc, 'p', { class: 'aii-sc-fix' }, [el(doc, 'strong', { text: 'Fix: ' }), row.fix]) : null,
                row.retry ? el(doc, 'p', { class: 'aii-sc-retry' }, [el(doc, 'strong', { text: 'Retry: ' }), row.retry]) : null
            ]);
            rows.appendChild(item);
        });
        const children = [head, rows];
        if (card.retry.length && typeof opts.onRetry === 'function') {
            const button = el(doc, 'button', { type: 'button', class: 'ap-btn aii-sc-again', text: 'Practise my weak spots' });
            button.addEventListener('click', () => opts.onRetry(card.retry.slice()));
            children.push(button);
        }
        container.replaceChildren(...children);
        return container;
    }

    return Object.freeze({
        ROLE, TOOL, CONTENT_URL, BACK_URL, ROUNDS, DOMAINS, FIRM_TYPES, TOUGHNESS, ROUND_SHAPES,
        normalizeConfig, getInstructions, normaliseDomain, firmTypeInfo, toughnessInfo, roundInfo, domainInfo,
        cvLinesFromText, cvLinesFromPdfItems, cvLinesFromBuilder, builderName, matchCvProbes, pickCvProbes, simulationDomain,
        earnedLinesFrom, mergeCvLines, presetFromQuery, SIMULATION_TOOL, WORK_SIMULATION_LIVE, workSimulationLive,
        buildPlan, renderPrompt, welcomeLine, planQuestionIds, markAsked, questionsReached, recordMock, mockSummary,
        parseScorecard, stripScorecard, findScorecard, splitUnmarkedReport, cleanFirm, domainCount,
        cvSourcesAllowed, claimCv, otherStudentHere, CV_GUARD_KEY, REPORT_START, REPORT_END,
        mountSetup, renderScorecard, rng
    });
});
