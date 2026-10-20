/*
 * MSC Articleship Program: "Practise your interview" (row 4.13), the articleship mode of /ai-interview.html.
 * Builds the interviewer's plan from articleship-program/ai-interview/articleship-interview.json (the HR ladder with its
 * cross-questions, Core accounts, the domain booklet questions, workplace situations, the HR-call scenario set),
 * probes the student's own CV lines, renders the interviewer's instructions and reads the 1-4 scorecard back.
 * UMD: window.MSCArticleshipInterview in the page, require() in node --test.
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
    const MAX_LINE = 200;

    // Shown before the content file arrives (and if it never does); the content file's rounds replace them.
    const ROUNDS = Object.freeze([
        { id: 'full', label: 'Full interview', minutes: 30, hint: 'Intro, your CV, HR, core and your domain' },
        { id: 'technical', label: 'Technical round', minutes: 20, hint: 'Your CV lines, core accounts and your domain' },
        { id: 'hr', label: 'HR round', minutes: 20, hint: 'The sixteen questions every firm asks' },
        { id: 'call', label: 'HR call', minutes: 10, hint: 'The screening call before the interview' }
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
        full: { cv: 3, ladderFixed: ['why-domain', 'why-firm', 'attempts'], ladderExtra: 1, core: 4, domain: 4, situations: 1 },
        technical: { cv: 4, ladderFixed: ['why-domain'], ladderExtra: 0, core: 4, domain: 6, situations: 1, technicalSituations: true },
        hr: { cv: 2, ladderAll: true, core: 0, domain: 0, situations: 2 },
        call: { cv: 0, call: true }
    });

    // Which CV lines each round probes first.
    const CV_PREFERENCE = Object.freeze({
        full: ['simulation', 'programme', 'standard', 'tool', 'project', 'work', 'course', 'achievement', 'role', 'hobby'],
        technical: ['simulation', 'standard', 'tool', 'project', 'course', 'programme', 'work'],
        hr: ['role', 'achievement', 'hobby', 'work', 'programme', 'course', 'project'],
        call: []
    });

    const TECHNICAL_SITUATIONS = Object.freeze(['sit-fake-voucher', 'sit-round-sum', 'sit-untested', 'sit-ignore', 'sit-own-error', 'sit-data']);

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
        const direct = DOMAINS.find(domain => domain.slug === text || domain.label.toLowerCase() === text || domain.spoken.toLowerCase() === text);
        if (direct) return direct.slug;
        if (/indirect|gst/.test(text)) return 'gst';
        if (/direct tax|income/.test(text)) return 'direct-tax';
        if (/internal/.test(text)) return 'internal-audit';
        if (/statutory|audit/.test(text)) return 'statutory-audit';
        if (/ind ?as|financial reporting|accounting/.test(text)) return 'accounting';
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

    function cleanFirm(value) {
        return str(value).replace(/[<>{}\[\]"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
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

    // ---------- CV probes ----------
    // An education row (CA Inter marks, B.Com, college) is never "a course you took" or "a project".
    const EDUCATION_ROW = /\b(ca (inter(mediate)?|foundation|final)|b\.? ?com|m\.? ?com|bba|bms|class (x|xii|10|12)|hsc|ssc|cbse|icse|university|college|school)\b/i;
    const NOT_FOR_EDUCATION = ['course', 'project', 'work'];

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

    /**
     * The interviewer's plan. options: { round, domain, firm, firmType, toughness, coach, cvLines, cvText, asked, retry, seed }.
     * Returns { round, minutes, domain, firm, firmType, toughness, coach, opening, sections: [{ id, title, items }], rubric, ... }.
     */
    function buildPlan(content, options) {
        const opts = options || {};
        const data = content || {};
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
        const cvLines = list(opts.cvLines).map(cleanLine).filter(keepLine).slice(0, 80);
        const retry = list(opts.retry).map(str).map(s => s.trim()).filter(Boolean).slice(0, 3);

        if (shape.call) {
            const call = data.call || {};
            const questions = list(call.questions);
            add('call', 'The call', questions.map(q => asItem(q, vars)));
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
            add('opening', 'Opening', intro ? [asItem(intro, vars)] : []);
            if (retry.length) add('retry', 'Retry questions from their last practice', retry.map((q, i) => ({ id: 'retry-' + (i + 1), q, listen_for: [], cross: [] })));
            const probes = pickCvProbes(matchCvProbes(cvLines, data), round.id, shape.cv, data);
            add('cv', 'Their CV lines', probes.map((probe, i) => ({
                id: 'cv-' + (i + 1),
                cvLine: probe.line,
                q: 'CV line: "' + probe.line + '". ' + probe.ask,
                listen_for: [],
                cross: probe.cross
            })), 'Quote the line, then ask. Probe only what the CV says.');

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

            const domainQs = rankFresh(list(domainContent.questions), asked, rand).slice(0, shape.domain || 0);
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
            hasCv: cvLines.length > 0,
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

    /** Count each planned question once more in the store's data ({ asked: { id: n } }); keeps the map small. */
    function markAsked(data, plan) {
        const target = isObject(data) ? data : {};
        const asked = isObject(target.asked) ? target.asked : {};
        planQuestionIds(plan).forEach(id => { asked[id] = (Number(asked[id]) || 0) + 1; });
        target.asked = asked;
        return target;
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
        const lines = [number + '. ' + item.q];
        if (item.tests) lines.push('   Checks: ' + item.tests);
        if (item.listen_for && item.listen_for.length) lines.push('   Listen for: ' + item.listen_for.join('; '));
        if (item.cross && item.cross.length) lines.push('   Cross-questions: ' + item.cross.join(' / '));
        return lines.join('\n');
    }

    function renderPrompt(plan) {
        const toughness = toughnessInfo(plan.toughness);
        const firmType = firmTypeInfo(plan.firmType);
        const where = (plan.firm ? plan.firm + ', ' : '') + firmType.spoken;
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
        } else {
            out.push('No CV was shared. Ask about their education, skills and activities instead of inventing experience.');
        }

        out.push('', 'FINAL REPORT');
        out.push('When the interview ends, start the final report with this scorecard, one line per row, exactly in this form:');
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
    function parseScorecard(text, rubric) {
        const rows = list(rubric);
        if (!text || !rows.length) return null;
        const found = new Map();
        str(text).split(/\r?\n/).forEach(rawLine => {
            const line = rawLine.replace(/\*\*/g, '').replace(/^\s*[-*•]\s*/, '').trim();
            const match = line.match(/^(\d{1,2})[.)]\s*([^|]+?)\s*\|\s*([0-4](?:\.\d)?|n\/?a|-|–)\s*(?:\/\s*4)?\s*(?:\|(.*))?$/i);
            if (!match) return;
            let index = Number(match[1]) - 1;
            const name = match[2].trim().toLowerCase();
            const byName = rows.findIndex(row => row.row.toLowerCase().slice(0, 14) === name.slice(0, 14));
            if (byName !== -1) index = byName;
            if (index < 0 || index >= rows.length || found.has(index)) return;
            const parts = str(match[4]).split('|').map(part => part.trim());
            const field = label => {
                const part = parts.find(p => p.toLowerCase().startsWith(label));
                const value = part ? part.slice(label.length).replace(/^\s*:\s*/, '').replace(/^["\u201c](.*)["\u201d]$/, '$1').trim() : '';
                return /^(-+|\u2013|\u2014|n\/?a|none|not covered|not asked)\.?$/i.test(value) ? '' : value;
            };
            const raw = match[3].toLowerCase();
            const score = /^[0-4]/.test(raw) ? Math.max(0, Math.min(4, Math.round(Number(raw)))) : null;
            found.set(index, { score, evidence: field('evidence'), fix: field('fix'), retry: field('retry') });
        });
        if (found.size < Math.min(3, rows.length)) return null;
        const scored = rows.map((row, i) => ({ id: row.id, row: row.row, ...(found.get(i) || { score: null, evidence: '', fix: '', retry: '' }) }));
        const counted = scored.filter(row => row.score !== null);
        const total = counted.reduce((sum, row) => sum + row.score, 0);
        const weakest = counted.filter(row => row.score <= 2).sort((a, b) => a.score - b.score);
        return {
            rows: scored,
            total,
            max: counted.length * 4,
            weakest,
            retry: weakest.map(row => row.retry).filter(Boolean).slice(0, 3)
        };
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
     * otherRolesHref, onStart(setup) -> Promise }. cvSources: [{ kind: 'builder'|'profile', label, detail, lines }].
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
        let myDomain = null;
        try { myDomain = progress && progress.getMyDomain ? progress.getMyDomain() : null; } catch (_) { myDomain = null; }
        const lastDomain = normaliseDomain(last.domain);
        const domainDefault = (myDomain && (!lastDomain || last.myDomain !== myDomain)) ? myDomain : (lastDomain || myDomain || DEFAULT_DOMAIN);
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

        const form = el(doc, 'form', { class: 'ap-card aii-form', novalidate: true });
        form.appendChild(radioGroup(doc, 'aii-round', 'Round', rounds.map(round => ({
            value: round.id, label: round.label, meta: round.minutes + ' min · ' + round.hint
        })), rounds.some(round => round.id === last.round) ? last.round : rounds[0].id, 'is-rounds'));

        const domainSelect = el(doc, 'select', { id: 'aii-domain', class: 'aii-input', name: 'aii-domain' });
        DOMAINS.forEach(domain => domainSelect.appendChild(el(doc, 'option', { value: domain.slug, text: domain.label })));
        domainSelect.value = domainDefault;
        form.appendChild(el(doc, 'div', { class: 'aii-field' }, [el(doc, 'label', { class: 'aii-label', for: 'aii-domain', text: 'Domain' }), domainSelect]));

        const firmInput = el(doc, 'input', { id: 'aii-firm', class: 'aii-input', type: 'text', maxlength: '80', autocomplete: 'off', placeholder: 'Firm name (optional)' });
        firmInput.value = cleanFirm(last.firm);
        form.appendChild(el(doc, 'div', { class: 'aii-field' }, [el(doc, 'label', { class: 'aii-label', for: 'aii-firm', text: 'Firm' }), firmInput]));
        form.appendChild(radioGroup(doc, 'aii-firm-type', 'Firm size', FIRM_TYPES.map(type => ({ value: type.id, label: type.label })),
            FIRM_TYPES.some(type => type.id === last.firmType) ? last.firmType : 'mid', 'is-pills'));
        form.appendChild(radioGroup(doc, 'aii-toughness', 'Toughness', TOUGHNESS.map(level => ({ value: level.id, label: level.label })),
            toughnessInfo(last.toughness).id, 'is-pills'));

        const cvOptions = cvSources.map(source => ({ value: source.kind, label: source.label }))
            .concat([{ value: 'pdf', label: 'Upload PDF' }, { value: 'none', label: 'No CV' }]);
        const cvDefault = cvSources.length ? cvSources[0].kind : 'pdf';
        const cvGroup = radioGroup(doc, 'aii-cv', 'Your CV', cvOptions, cvDefault, 'is-pills');
        const fileInput = el(doc, 'input', { type: 'file', accept: 'application/pdf,.pdf', class: 'aii-file', id: 'aii-cv-file', 'aria-label': 'CV file (PDF)' });
        const fileNote = el(doc, 'p', { class: 'aii-note', 'aria-live': 'polite' });
        cvGroup.appendChild(fileInput);
        cvGroup.appendChild(fileNote);
        form.appendChild(cvGroup);

        const pickFile = () => { if (typeof fileInput.click === 'function') fileInput.click(); };
        const showCvNote = () => {
            const kind = checkedValue(form, 'aii-cv');
            const source = cvSources.find(item => item.kind === kind);
            const file = fileInput.files && fileInput.files[0];
            if (source) fileNote.replaceChildren(source.detail || '');
            else if (kind === 'pdf' && file) fileNote.replaceChildren(file.name + ' ', el(doc, 'button', { type: 'button', class: 'aii-linkbtn', text: 'Change' }));
            else if (kind === 'pdf') fileNote.replaceChildren(el(doc, 'button', { type: 'button', class: 'ap-btn is-secondary aii-choose', text: 'Choose your CV (PDF)' }));
            else fileNote.replaceChildren();
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

        const coach = el(doc, 'input', { type: 'checkbox', id: 'aii-coach', checked: !!last.coach });
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
        form.appendChild(error);
        form.appendChild(button);
        if (opts.fromDropdown && opts.otherRolesHref) {
            form.appendChild(el(doc, 'p', { class: 'aii-other' }, [el(doc, 'a', { class: 'ap-link', href: opts.otherRolesHref, text: 'Practising for another role?' })]));
        }

        const main = el(doc, 'main', { class: 'ap-main aii-main' }, [el(doc, 'div', { class: 'ap-hero' }, [title, lede]), form]);
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
        if (!card) { container.replaceChildren(); return null; }
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
        buildPlan, renderPrompt, welcomeLine, planQuestionIds, markAsked, parseScorecard,
        mountSetup, renderScorecard, rng
    });
});
