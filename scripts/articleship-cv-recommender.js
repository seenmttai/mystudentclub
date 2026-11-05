/**
 * MSC Articleship Program: CV Recommender (Day 1 · Choose your CV, row 1.2).
 *
 * Nine questions → one of the situations A–H, its section order (personalised to the student's ranking and proof), the
 * lines to add, a suggested design and "See this order" (its page in Choose your CV, or The Nothing CV for H).
 * Deterministic rules only, no AI. The pick is saved to the shared setting so the CV Builder opens with it.
 *
 * Content: /articleship-program/cv-recommender/situations.json (the one situation list shared by Choose your CV, this
 * tool and the CV Builder) and the CV Builder's designs.json (/articleship-program/cv-builder/designs.json, the one
 * design list, numbered as in the CV templates look-book).
 *
 * Release switch: MSCArticleshipProgress.WORK_SIMULATION_LIVE (the one flag in scripts/articleship-progress.js, read
 * here as WORK_SIMULATION_LIVE). While false (release 1), nothing here offers, links or promises the Work Simulation:
 * no "Work Simulation level" tap, no Work Simulation link or line; thin proof points at The Nothing CV's four
 * certificates and its "one more true line" page instead. Release 2 flips the shared flag; also set situations.json
 * `links.workSimulation` to its page (each link then opens the student's domain: ?domain=<slug>).
 *
 * Browser: window.MSCCvRecommender. Node (tests): require('./scripts/articleship-cv-recommender.js');
 * `.withConfig({ workSimulationLive })` gives an instance with the flag set.
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCCvRecommender = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const TOOL = 'cv-recommender';
    // Release 1 ships without the Work Simulation (row 1.6): nothing here points at it until the shared switch is true.
    const WORK_SIMULATION_LIVE = platformWorkSimulationLive();
    /** A single-choice tap moves on after this long, so the student sees their tick first. */
    const ADVANCE_MS = 280;
    /** Taps are ignored this long after a new question appears, so a quick double tap never answers it too. */
    const TAP_GUARD_MS = 250;
    const SITUATION_CODES = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    const OWN_PROJECTS = Object.freeze(['model', 'annual-report']);
    const DEFAULT_RANK = Object.freeze(['academics', 'work', 'projects', 'roles', 'skills']);
    /** The design list both tools read (one file, so the Recommender and the CV Builder never disagree). */
    const DESIGNS_URL = '/articleship-program/cv-builder/designs.json';

    /** Which strength each CV block shows. Simulations live in Certifications and job simulations (house rule 2). */
    const STRENGTH_OF = Object.freeze({
        education: 'academics', experience: 'work', projects: 'projects', certifications: 'projects',
        leadership: 'roles', achievements: 'roles', skills: 'skills'
    });
    /** Order inside one strength's group (own projects before simulations, roles before achievements). */
    const GROUP_ORDER = Object.freeze(['experience', 'projects', 'certifications', 'leadership', 'achievements', 'skills']);
    /** Which work example the Work experience block shows when several are tapped (strongest first). */
    const WORK_PRIORITY = Object.freeze(['ca-firm', 'company', 'part-time', 'family', 'tuition']);

    const STRENGTHS = Object.freeze([
        { id: 'academics', label: 'Academics', hint: 'Marks, first attempt, a rank' },
        { id: 'work', label: 'Work done', hint: 'Internship, family business, tuition' },
        { id: 'projects', label: 'Projects', hint: 'Simulations, a model, a report study' },
        { id: 'roles', label: 'Roles & activities', hint: 'Posts held, events, sport' },
        { id: 'skills', label: 'Skills with proof', hint: 'Excel, Tally, Power BI' }
    ].map(Object.freeze));

    // Fallback list for Node tests without the progress engine; the page uses MSCArticleshipProgress.DOMAINS.
    const FALLBACK_DOMAINS = [
        ['statutory-audit', 'Statutory audit'], ['internal-audit', 'Internal audit, risk & IFC'], ['direct-tax', 'Direct tax'],
        ['gst', 'GST'], ['bank-audit', 'Bank audit'], ['transfer-pricing', 'Transfer pricing'], ['ma-tax', 'M&A tax'],
        ['valuation', 'Valuation'], ['fdd', 'Financial due diligence'], ['forensic', 'Forensic'],
        ['consulting', 'Consulting & risk advisory'], ['accounting', 'Accounting, MIS & company law'], ['ib-er', 'IB & equity research']
    ].map(([slug, label]) => ({ slug, label }));

    function progressApi() {
        if (root.MSCArticleshipProgress) return root.MSCArticleshipProgress;
        if (typeof require === 'function') {
            try { return require('./articleship-progress.js'); } catch (_) { /* optional */ }
        }
        return null;
    }

    /** The release switch every tool reads (MSCArticleshipProgress.WORK_SIMULATION_LIVE); false without the platform. */
    function platformWorkSimulationLive() {
        const progress = progressApi();
        return Boolean(progress && progress.WORK_SIMULATION_LIVE === true);
    }

    function lmsApi() {
        if (root.MSCArticleshipLms) return root.MSCArticleshipLms;
        if (typeof require === 'function') {
            try { return require('./articleship-lms.js'); } catch (_) { /* optional */ }
        }
        return null;
    }

    function domainList() {
        const progress = progressApi();
        return progress && Array.isArray(progress.DOMAINS) && progress.DOMAINS.length ? progress.DOMAINS : FALLBACK_DOMAINS;
    }

    /**
     * One instance of the tool. `config.workSimulationLive` overrides the release flag (the tests use it; release 2
     * flips the shared MSCArticleshipProgress.WORK_SIMULATION_LIVE instead).
     */
    function create(config) {
        const wsLive = config && typeof config.workSimulationLive === 'boolean' ? config.workSimulationLive : WORK_SIMULATION_LIVE;

        // Labels: 1–3 words (STYLE "Tool"). `chip` is the answer as the result's summary shows it.
        // Graduation comes before the gap, so a direct-entry graduate never sees "After Foundation".
        function buildQuestions() {
            return [
                { id: 'rank', type: 'rank', title: 'Rank your strengths', short: 'Strengths', hint: 'Tap them from strongest to weakest.' },
                {
                    id: 'inter', type: 'single', title: 'How did you clear Inter?', short: 'Inter', options: [
                        { id: 'first', label: 'Both, first attempt', hint: 'Both groups together' },
                        { id: 'later', label: 'Both, later attempt', hint: 'Both groups together' },
                        { id: 'separate', label: 'Different sittings', hint: 'Groups cleared separately', chip: 'Groups in different sittings' },
                        { id: 'one-awaited', label: 'One group awaited' },
                        { id: 'both-awaited', label: 'Both awaited', hint: 'Result not out yet', chip: 'Inter result awaited' }
                    ]
                },
                {
                    id: 'graduation', type: 'single', title: 'Your graduation', short: 'Graduation', options: [
                        { id: 'regular', label: 'Pursuing, regular', chip: 'Graduation: regular' },
                        { id: 'distance', label: 'Distance or evening', chip: 'Graduation: distance' },
                        { id: 'completed', label: 'Completed', chip: 'Graduation completed' },
                        { id: 'direct-entry', label: 'Direct entry', hint: 'Graduated first; no Foundation', chip: 'Direct entry graduate' },
                        { id: 'stopped', label: 'Started, then stopped', chip: 'Degree stopped' },
                        { id: 'none', label: 'Not pursuing', chip: 'No degree' }
                    ]
                },
                {
                    id: 'gap', type: 'single', title: 'Any gap?', short: 'Gap', options: [
                        { id: 'none', label: 'None', chip: 'No gap' },
                        { id: 'after-foundation', label: 'After Foundation', chip: 'Gap after Foundation', notWith: { graduation: ['direct-entry'] } },
                        { id: 'after-inter', label: 'After Inter', chip: 'Gap after Inter' },
                        { id: 'missed-sitting', label: 'Skipped a sitting', hint: 'Missed or skipped' },
                        { id: 'year-out', label: 'A year out', chip: 'A year out' }
                    ]
                },
                {
                    id: 'icitss', type: 'single', title: 'Your ICITSS', short: 'ICITSS', hint: 'Orientation Course + IT Training', options: [
                        { id: 'done', label: 'Completed', chip: 'ICITSS done' },
                        { id: 'ongoing', label: 'Ongoing', chip: 'ICITSS ongoing' },
                        { id: 'pending', label: 'Not started', chip: 'ICITSS not started' }
                    ]
                },
                {
                    id: 'work', type: 'multi', title: 'Work you have done', short: 'Work', hint: 'Tap all that apply.', options: [
                        { id: 'ca-firm', label: 'CA firm internship' },
                        { id: 'company', label: 'Company internship', hint: 'Or a start-up' },
                        { id: 'family', label: 'Family business books' },
                        { id: 'tuition', label: 'Tuition' },
                        { id: 'part-time', label: 'Part-time accounts', hint: 'Or freelance' },
                        { id: 'none', label: 'None yet', exclusive: true, chip: 'No work yet' }
                    ]
                },
                {
                    id: 'projects', type: 'multi', title: 'Projects you have done', short: 'Projects', hint: 'Tap all that apply.', options: [
                        // Offered only once the Work Simulation is out: before that, nobody can have done a level.
                        wsLive ? { id: 'work-simulation', label: 'Work Simulation level' } : null,
                        { id: 'job-simulation', label: 'Job simulation', hint: 'Forage or similar' },
                        { id: 'model', label: 'Excel model', hint: 'Or a dashboard' },
                        { id: 'annual-report', label: 'Annual-report project' },
                        { id: 'none', label: 'None yet', exclusive: true, chip: 'No projects yet' }
                    ].filter(Boolean)
                },
                {
                    id: 'course', type: 'single', title: 'Another course alongside?', short: 'Course', options: [
                        { id: 'none', label: 'None', chip: 'No other course' },
                        { id: 'cs', label: 'CS', chip: 'CS alongside' },
                        { id: 'cma', label: 'CMA', chip: 'CMA alongside' },
                        { id: 'cfa', label: 'CFA', chip: 'CFA alongside' },
                        { id: 'degree', label: 'Another degree', hint: 'LL.B. or similar', chip: 'Another degree' }
                    ]
                },
                {
                    id: 'domain', type: 'single', title: 'Your target domain', short: 'Domain', grid: true,
                    options: domainList().map(d => ({ id: d.slug, label: d.label }))
                        .concat([{ id: 'unsure', label: 'Not sure yet', chip: 'Domain not decided' }])
                }
            ];
        }

        const QUESTIONS = Object.freeze(buildQuestions());

        function question(id) {
            return QUESTIONS.find(q => q.id === id) || null;
        }

        function optionIds(id) {
            const q = question(id);
            return q && q.options ? q.options.map(o => o.id) : [];
        }

        function hiddenFor(option, answers) {
            return Boolean(option.notWith && Object.entries(option.notWith).some(([key, values]) => values.includes(answers && answers[key])));
        }

        /** The options a question shows for these answers ("After Foundation" is not offered to a direct-entry graduate). */
        function optionsFor(questionId, answers) {
            const q = question(questionId);
            return q && q.options ? q.options.filter(o => !hiddenFor(o, answers)) : [];
        }

        // ---------- Answers ----------

        function cleanRank(value) {
            const seen = [];
            (Array.isArray(value) ? value : []).forEach(item => {
                const id = String(item || '').trim();
                if (DEFAULT_RANK.includes(id) && !seen.includes(id)) seen.push(id);
            });
            return seen;
        }

        function cleanSingle(id, value) {
            const text = value === undefined || value === null ? '' : String(value).trim();
            return optionIds(id).includes(text) ? text : null;
        }

        function cleanMulti(id, value) {
            const allowed = optionIds(id);
            const list = [];
            (Array.isArray(value) ? value : []).forEach(item => {
                const text = String(item || '').trim();
                if (allowed.includes(text) && !list.includes(text)) list.push(text);
            });
            if (list.includes('none')) return ['none'];
            return list;
        }

        /** Raw stored answers → a clean copy (unknown values dropped). Multi answers keep 'none' as an explicit answer. */
        function cleanAnswers(raw) {
            const a = raw && typeof raw === 'object' ? raw : {};
            const out = {
                rank: cleanRank(a.rank),
                inter: cleanSingle('inter', a.inter),
                gap: cleanSingle('gap', a.gap),
                graduation: cleanSingle('graduation', a.graduation),
                icitss: cleanSingle('icitss', a.icitss),
                work: cleanMulti('work', a.work),
                projects: cleanMulti('projects', a.projects),
                course: cleanSingle('course', a.course),
                domain: cleanSingle('domain', a.domain)
            };
            // An answer the student can no longer see (gap after Foundation for a direct-entry graduate) is asked again.
            QUESTIONS.forEach(q => {
                if (q.type !== 'single' || !out[q.id]) return;
                const option = q.options.find(o => o.id === out[q.id]);
                if (option && hiddenFor(option, out)) out[q.id] = null;
            });
            return out;
        }

        function isAnswered(id, answers) {
            const a = cleanAnswers(answers);
            if (id === 'rank') return a.rank.length >= DEFAULT_RANK.length - 1;
            const value = a[id];
            return Array.isArray(value) ? value.length > 0 : Boolean(value);
        }

        function firstUnanswered(answers) {
            const index = QUESTIONS.findIndex(q => !isAnswered(q.id, answers));
            return index === -1 ? QUESTIONS.length : index;
        }

        function isComplete(answers) {
            return firstUnanswered(answers) === QUESTIONS.length;
        }

        /** Clean answers for the rules: full rank (missing strengths appended in the default order), multi 'none' → []. */
        function ruleAnswers(answers) {
            const a = cleanAnswers(answers);
            const rank = a.rank.concat(DEFAULT_RANK.filter(id => !a.rank.includes(id)));
            return Object.assign({}, a, {
                rank,
                work: a.work.filter(id => id !== 'none'),
                projects: a.projects.filter(id => id !== 'none')
            });
        }

        function proofCount(answers) {
            const a = ruleAnswers(answers);
            return a.work.length + a.projects.length;
        }

        // ---------- Rules (first match wins) ----------

        /** Both Inter groups together at the first try (cleared or awaited): the case the Academics order is made for. */
        function bothGroupsFirstTime(a) {
            return a.inter === 'first' || a.inter === 'both-awaited';
        }

        /**
         * One rule for every tool (Choose your CV, this tool, the CV Builder):
         * 1. Graduate through direct entry → G (no Foundation row; the Nothing CV pointer still shows when proof is thin).
         * 2. "None" on both work and projects, with Work done or Projects ranked number 1 → H (The Nothing CV): the
         *    strength they rank highest is the one they have nothing for yet.
         * 3. Otherwise walk the ranking: Academics → A (both groups together: first attempt or both awaited) or B (any
         *    other way); Work done → C if any work; Projects → D if any project; Roles → E; Skills → F. A strength with
         *    no proof is skipped and the next one is tried. So a student with no work and no project who ranks marks,
         *    roles or skills first keeps that order (A/B, E, F), and "Thin on proof?" points them at The Nothing CV.
         */
        function chooseSituation(answers) {
            const a = ruleAnswers(answers);
            if (a.graduation === 'direct-entry') return 'G';
            if (proofCount(a) === 0 && (a.rank[0] === 'work' || a.rank[0] === 'projects')) return 'H';
            for (const strength of a.rank) {
                if (strength === 'academics') return bothGroupsFirstTime(a) ? 'A' : 'B';
                if (strength === 'work' && a.work.length) return 'C';
                if (strength === 'projects' && a.projects.length) return 'D';
                if (strength === 'roles') return 'E';
                if (strength === 'skills') return 'F';
            }
            return 'H';
        }

        /** The situation's blocks, minus the ones the student has nothing for, plus their work or own projects. */
        function situationBlocks(situation, a) {
            const hasWork = a.work.length > 0;
            const hasOwnProjects = a.projects.some(id => OWN_PROJECTS.includes(id));
            const list = (situation.order || []).filter(id => (id !== 'experience' || hasWork) && (id !== 'projects' || hasOwnProjects));
            if (hasWork && !list.includes('experience')) list.push('experience');
            if (hasOwnProjects && !list.includes('projects')) list.push('projects');
            return list;
        }

        /**
         * The student's order. Header and objective first; then education, always (Choose your CV p2: "your number 1 comes
         * right after the education table"), with the situation's lead block right after it; then the other proof blocks
         * in the student's own ranking, so their number 5 goes last; Interests closes. H (The Nothing CV) keeps its fixed
         * order. → { order, lead, last: [the number 5's first block] }
         */
        function planOrder(situation, answers) {
            const a = ruleAnswers(answers);
            const blocks = situationBlocks(situation, a);
            let lead = situation.lead && blocks.includes(situation.lead) ? situation.lead : null;
            if (!lead) {
                // D with simulations only: the Projects block is dropped, so its strength's other block leads.
                const strength = STRENGTH_OF[situation.lead];
                lead = blocks.find(id => id !== 'education' && strength && STRENGTH_OF[id] === strength) || 'education';
            }
            if (situation.fixed) return { order: blocks, lead, last: [] };

            const leadStrength = lead === 'education' ? null : STRENGTH_OF[lead];
            const key = id => (STRENGTH_OF[id] === leadStrength ? -1 : a.rank.indexOf(STRENGTH_OF[id]));
            const others = blocks
                .filter(id => STRENGTH_OF[id] && id !== 'education' && id !== lead)
                .sort((x, y) => key(x) - key(y) || GROUP_ORDER.indexOf(x) - GROUP_ORDER.indexOf(y));
            const top = ['header', 'summary'].filter(id => blocks.includes(id));
            const tail = blocks.filter(id => !STRENGTH_OF[id] && !top.includes(id));
            const order = top.concat(['education'], lead === 'education' ? [] : [lead], others, tail);
            const fifth = a.rank[DEFAULT_RANK.length - 1];
            // The note sits once, on the first block of the number 5 (the rest of its group follows it). Marks ranked 5th:
            // the education table still comes first, so there is no note.
            const last = fifth === 'academics' ? [] : order.filter(id => id !== lead && STRENGTH_OF[id] === fifth).slice(0, 1);
            return { order, lead, last };
        }

        /** The order alone (the shared CV pick and the CV Builder take this). */
        function personaliseOrder(situation, answers) {
            return planOrder(situation, answers).order;
        }

        function fill(text, values) {
            return String(text || '').replace(/\{(\w+)\}/g, (match, key) => (values && values[key] !== undefined ? values[key] : match));
        }

        /** The domain a Work Simulation line is written for: the target domain, or statutory audit when not decided. */
        function lineDomain(a, data) {
            const lines = (data && data.workSimulation) || {};
            if (a.domain && a.domain !== 'unsure' && lines[a.domain]) return a.domain;
            return (data && data.defaultDomain) || 'statutory-audit';
        }

        /** One example line per block, from this student's answers where they change it. */
        function exampleFor(id, situation, a, data, code) {
            const byAnswer = (data && data.answerExamples) || {};
            // A and B lead with the Inter row, so it shows the way this student cleared it (awaited, a later attempt).
            const interRow = byAnswer.educationByInter && byAnswer.educationByInter[a.inter];
            if (id === 'education' && (code === 'A' || code === 'B') && interRow) return interRow;
            const own = situation.examples && situation.examples[id];
            if (own) return own;
            if (id === 'experience' && byAnswer.work) {
                const kind = WORK_PRIORITY.find(k => a.work.includes(k));
                if (kind && byAnswer.work[kind]) return byAnswer.work[kind];
            }
            if (id === 'projects' && byAnswer.projects) {
                const kind = OWN_PROJECTS.find(k => a.projects.includes(k));
                if (kind && byAnswer.projects[kind]) return byAnswer.projects[kind];
            }
            if (id === 'certifications') {
                const ws = data && data.workSimulation && data.workSimulation[lineDomain(a, data)];
                if (a.projects.includes('work-simulation') && ws) return ws;
                const certs = byAnswer.certifications || {};
                if (a.projects.includes('job-simulation') && certs['job-simulation']) return certs['job-simulation'];
                if (certs.none) return certs.none;
            }
            const sections = (data && data.sections) || {};
            return (sections[id] && sections[id].example) || '';
        }

        /**
         * The lines built from this student's own taps, block by block: every work they tapped (strongest first), every own
         * project, and their simulations (the Work Simulation line for their domain, a job simulation line).
         * → { experience: [...], projects: [...], certifications: [...] } (only blocks with a line).
         */
        function ownLinesByBlock(a, data) {
            const byAnswer = (data && data.answerExamples) || {};
            const out = {};
            const work = WORK_PRIORITY.filter(k => a.work.includes(k)).map(k => byAnswer.work && byAnswer.work[k]).filter(Boolean);
            if (work.length) out.experience = work;
            const projects = OWN_PROJECTS.filter(k => a.projects.includes(k)).map(k => byAnswer.projects && byAnswer.projects[k]).filter(Boolean);
            if (projects.length) out.projects = projects;
            const sims = [];
            const ws = data && data.workSimulation && data.workSimulation[lineDomain(a, data)];
            if (a.projects.includes('work-simulation') && ws) sims.push(ws);
            const job = byAnswer.certifications && byAnswer.certifications['job-simulation'];
            if (a.projects.includes('job-simulation') && job) sims.push(job);
            if (sims.length) out.certifications = sims;
            return out;
        }

        /**
         * The Work Simulation line shown is only an example when it is not written for the student's own domain ("Not
         * sure yet"): the level they did may be any domain's.
         */
        function simulationIsExample(a, data) {
            return a.projects.includes('work-simulation') && lineDomain(a, data) !== a.domain;
        }

        function domainName(slug) {
            const found = domainList().find(d => d.slug === slug);
            return found ? found.label : slug;
        }

        /** "Add these lines" cards for the student's own lines, in the order their blocks sit on the CV. */
        function ownLinesFor(order, a, data) {
            const defs = (data && data.ownLines) || {};
            const byBlock = ownLinesByBlock(a, data);
            const sections = (data && data.sections) || {};
            return (order || []).filter(id => byBlock[id]).map(id => {
                const def = defs[id] || {};
                const example = id === 'certifications' && simulationIsExample(a, data);
                const values = { domain: domainName(lineDomain(a, data)) };
                return {
                    id: 'own-' + id,
                    block: id,
                    label: fill((example && def.labelExample) || def.label || (sections[id] && sections[id].label) || id, values),
                    note: fill((example && def.noteExample) || def.note || '', values) || null,
                    lines: byBlock[id].slice(),
                    ask: null
                };
            });
        }

        function variantIdsFor(answers) {
            const a = ruleAnswers(answers);
            const ids = [];
            if (a.inter === 'one-awaited') ids.push('g2-awaited');
            if (a.inter === 'both-awaited') ids.push('result-awaited');
            if (a.inter === 'separate') ids.push('groups-separately');
            if (a.inter === 'later') ids.push('more-attempts');
            if (a.icitss === 'done') ids.push('icitss-done');
            if (a.icitss === 'ongoing') ids.push('icitss-ongoing');
            if (a.icitss === 'pending') ids.push('icitss-pending');
            if (a.graduation === 'regular') ids.push('pursuing');
            if (a.graduation === 'distance') ids.push('distance');
            if (a.graduation === 'stopped') ids.push('stopped');
            if (a.course === 'cs' || a.course === 'cma') ids.push('cs-cma');
            if (a.course === 'cfa' || a.course === 'degree') ids.push('other-course');
            if (a.gap && a.gap !== 'none') ids.push('gap');
            return ids;
        }

        /** The variant lines to add, filled for this student's answers. */
        function variantsFor(answers, data) {
            const a = ruleAnswers(answers);
            const defs = (data && data.variants) || {};
            return variantIdsFor(a).filter(id => defs[id]).map(id => {
                const def = defs[id];
                const course = def.courses && def.courses[a.course] ? def.courses[a.course] : null;
                const values = course ? { course: course.course, line: course.line } : {};
                const byGap = id === 'gap' && a.gap ? a.gap : null;
                const ask = byGap && def.asks && def.asks[byGap] ? def.asks[byGap] : def.ask;
                const lines = byGap && def.linesByKind && def.linesByKind[byGap] ? def.linesByKind[byGap] : (def.lines || []);
                return {
                    id,
                    label: fill(def.label, values),
                    note: fill((course && course.note) || def.note || '', values) || null,
                    lines: lines.map(line => fill(line, values)).filter(Boolean),
                    ask: ask ? fill(ask, values) : null
                };
            });
        }

        function link(day, title, page) {
            const lms = lmsApi();
            if (lms && typeof lms.resourceLink === 'function') return lms.resourceLink(day, title, page);
            const params = new URLSearchParams({ course: 'msc-articleship-program', session: String(Number(day) + 1) });
            if (title) params.set('resource', title);
            if (title && Number(page) > 1) params.set('page', String(page));
            return '/learning-management-system/course?' + params.toString();
        }

        function resourceTitle(data, key, fallback) {
            return (data && data.resources && data.resources[key]) || fallback;
        }

        /**
         * The Work Simulation, opened on the student's own domain (?domain=<slug>) once its page is on the site; until
         * then its own row in Day 1. Null while the Work Simulation is not released (WORK_SIMULATION_LIVE).
         */
        function workSimulationLink(data, domain) {
            if (!wsLive) return null;
            const direct = data && data.links && data.links.workSimulation;
            const title = resourceTitle(data, 'workSimulation', 'Work Simulation');
            if (!direct) return { label: 'Work Simulation', href: link((data && data.day) || 1, title) };
            const known = domain && domainList().some(d => d.slug === domain);
            const href = known ? direct + (direct.includes('?') ? '&' : '?') + 'domain=' + encodeURIComponent(domain) : direct;
            return { label: 'Work Simulation', href };
        }

        /** The Domain roadmaps page; without a page link, its own row in Day 5 (Domain guidance). */
        function domainRoadmapsLink(data) {
            const unsure = (data && data.unsure) || {};
            const label = unsure.linkLabel || 'Domain roadmaps';
            const direct = data && data.links && data.links.domainRoadmaps;
            if (direct) return { label, href: direct };
            return { label, href: link(unsure.day || 5, unsure.row || 'Domain roadmaps') };
        }

        /**
         * The "Thin on proof?" pointer (one piece of proof or none; A only with none) and H's "Then" step. With the Work
         * Simulation out: a level (opened on the student's domain) and The Nothing CV's four certificates. Before it:
         * the four certificates, then one more true line (The Nothing CV, "Earn one more true line").
         */
        function thinProofFor(code, answers, data) {
            const def = (data && data.thinProof) || {};
            const a = ruleAnswers(answers);
            const day = (data && data.day) || 1;
            const nothing = resourceTitle(data, 'nothing', 'The Nothing CV');
            const ws = workSimulationLink(data, a.domain);
            const more = { label: def.moreLabel || 'Earn one more line', href: link(day, nothing, def.morePage || 5) };
            if (code === 'H') {
                // The Nothing CV is the main answer; the Work Simulation (or one more true line) is the step after it.
                const text = ws ? def.textNothing : def.textNothingNoWs;
                return text ? { label: def.labelNothing || def.label || 'Then', text, links: [ws || more] } : null;
            }
            const count = a.work.length + a.projects.length;
            if (!(count === 0 || (count <= 1 && code !== 'A'))) return null;
            const hasSimulation = a.projects.includes('work-simulation');
            const certificates = { label: 'The Nothing CV', href: link(day, nothing, def.page || 4) };
            if (!ws) return { label: def.label || 'Thin on proof?', text: def.textNoWs || def.text, links: [certificates, more] };
            return {
                label: def.label || 'Thin on proof?',
                text: hasSimulation ? (def.textHasSimulation || def.text) : def.text,
                links: hasSimulation ? [certificates] : [ws, certificates]
            };
        }

        // ---------- Designs ----------

        function letterList(value) {
            const out = [];
            const push = item => {
                const text = String(item || '').trim();
                if (!text) return;
                if (/^[A-H]$/i.test(text)) out.push(text.toUpperCase());
                else if (/^[a-z][a-z0-9-]+$/.test(text)) out.push(text);
            };
            if (Array.isArray(value)) value.forEach(push);
            else if (typeof value === 'string' && /^\s*[A-H](\s*[,/·&]\s*[A-H])*\s*$/i.test(value)) value.split(/[,/·&]/).forEach(push);
            return out;
        }

        /**
         * designs.json in any reasonable shape → [{ number, id, name, tag, portalSafe, screen, bestFor, page, line }], by
         * number. The tag is read exactly as the CV Builder reads it: 'Portal-safe', 'Screen' (made to be sent as a PDF) or
         * 'Print' (the default), so both tools always show the same tag.
         */
        function normaliseDesigns(raw) {
            const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.designs) ? raw.designs : (raw && Array.isArray(raw.kept) ? raw.kept : []));
            const out = [];
            list.forEach((item, index) => {
                if (!item || typeof item !== 'object' || item.kept === false || item.drop === true) return;
                const number = Number(item.number !== undefined ? item.number : (item.no !== undefined ? item.no : (item.n !== undefined ? item.n : index + 1)));
                const name = String(item.name || item.title || '').trim();
                if (!Number.isInteger(number) || number < 1 || !name) return;
                const tags = [].concat(item.tag || [], item.tags || [], item.label || []).map(tag => String(tag).trim()).filter(Boolean);
                const portalSafe = item.portalSafe === true || item.portal_safe === true || tags.some(tag => /portal|ats/i.test(tag));
                const screen = !portalSafe && !tags.some(tag => /print/i.test(tag)) && tags.some(tag => /screen|pdf/i.test(tag));
                let bestFor = letterList(item.bestFor || item.best_for || item.situations || item.for);
                if (!bestFor.length && /^[A-H]$/i.test(String(item.persona || ''))) bestFor = [String(item.persona).toUpperCase()];
                const page = Number(item.page || item.lookbookPage || item.lookbook_page);
                const lineText = item.line || item.bestForLine || item.best_for_line || (typeof item.bestFor === 'string' && !bestFor.length ? item.bestFor : '');
                out.push({
                    number,
                    id: String(item.id || item.slug || item.key || item.file || name).trim(),
                    name,
                    tag: portalSafe ? 'Portal-safe' : (screen ? 'Screen' : 'Print'),
                    portalSafe,
                    screen,
                    bestFor,
                    page: Number.isInteger(page) && page > 0 ? page : number + 1,
                    line: lineText ? String(lineText) : ''
                });
            });
            const seen = new Set();
            return out.sort((x, y) => x.number - y.number).filter(d => (seen.has(d.number) ? false : seen.add(d.number)));
        }

        /** A design made for this situation wins; one made for a variant (e.g. CA with CS/CMA) breaks ties; then the lowest number. */
        function suggestDesign(designs, code, variantIds) {
            const list = Array.isArray(designs) ? designs : [];
            if (!list.length) return null;
            const ids = variantIds || [];
            let best = null;
            let bestScore = -1;
            list.forEach(design => {
                const score = (design.bestFor.includes(code) ? 2 : 0) + (design.bestFor.some(tag => ids.includes(tag)) ? 1 : 0);
                if (score > bestScore) { best = design; bestScore = score; }
            });
            return best;
        }

        /** The plain one-column design for firms' portals. */
        function portalDesign(designs) {
            const safe = (designs || []).filter(d => d.portalSafe);
            return safe.find(d => /plain|portal/i.test(d.name)) || safe[0] || null;
        }

        /**
         * A design made for one of the student's variants (No. 23 for CA with CS or CMA) that the suggested design is
         * not. A situation's own design always outranks a variant's, so this one is offered as a second line.
         */
        function variantDesign(designs, variantIds, suggested) {
            const ids = variantIds || [];
            if (suggested && suggested.bestFor.some(tag => ids.includes(tag))) return null;
            for (const design of designs || []) {
                if (suggested && design.number === suggested.number) continue;
                const variant = ids.find(id => design.bestFor.includes(id));
                if (variant) return { design, variant };
            }
            return null;
        }

        // ---------- The recommendation ----------

        function recommend(answers, data) {
            if (!data || !data.situations) throw new Error('Situations data missing');
            const a = ruleAnswers(answers);
            const code = chooseSituation(a);
            const situation = data.situations[code];
            if (!situation) throw new Error('Situation ' + code + ' missing from the data');
            const sections = data.sections || {};
            const plan = planOrder(situation, a);
            const own = ownLinesFor(plan.order, a, data);
            const blocks = plan.order.map(id => ({
                id,
                label: (situation.labels && situation.labels[id]) || (sections[id] && sections[id].label) || id,
                example: exampleFor(id, situation, a, data, code),
                lead: id === plan.lead,
                // The example comes from the student's own taps (their work, project or simulation), not a sample.
                own: own.some(card => card.block === id),
                note: plan.last.includes(id) ? (data.lastNote || 'your no. 5 goes last') : null
            }));
            const variants = variantsFor(a, data);
            const designs = normaliseDesigns(data.designs);
            const design = suggestDesign(designs, code, variants.map(v => v.id));
            const portal = portalDesign(designs);
            const day = data.day || 1;
            const isNothing = situation.resource === 'nothing';
            const seeIt = {
                label: situation.seeLabel || 'See this order',
                href: link(day, resourceTitle(data, isNothing ? 'nothing' : 'choose', isNothing ? 'The Nothing CV' : 'Choose your CV'), situation.page || 1)
            };
            const unsure = a.domain === 'unsure' && data.unsure ? {
                label: data.unsure.label,
                text: data.unsure.text,
                link: domainRoadmapsLink(data)
            } : null;
            const builder = designs.length > 0;
            // "Also fits": the variant's own design, e.g. "CA with CMA? No. 23 Centred lines fits it too."
            const extra = variantDesign(designs, variants.map(v => v.id), design);
            const extraText = extra && data.alsoFits && data.alsoFits[extra.variant];
            const also = extraText ? {
                design: extra.design,
                text: fill(extraText, {
                    label: (variants.find(v => v.id === extra.variant) || {}).label || '',
                    design: 'No. ' + extra.design.number + ' ' + extra.design.name
                }),
                href: link(day, resourceTitle(data, 'templates', 'CV templates'), extra.design.page)
            } : null;
            // Next: the CV Builder's own row in Day 1 (through the course, the one way in; no build link here).
            const nextDef = data.next || {};
            const nextText = (design ? nextDef.text : nextDef.textNoDesign) || nextDef.text || '';
            const next = nextText ? {
                text: fill(nextText, { design: design ? design.number : '' }),
                link: { label: nextDef.linkLabel || nextDef.dayLabel || ('Day ' + day), href: link(day, nextDef.row || null) }
            } : null;
            const msc = data.mscLine || {};
            const mscLine = msc.line ? {
                id: 'msc-line',
                label: msc.label,
                note: msc.note || null,
                lines: [msc.line],
                later: msc.later && msc.later.line ? { label: msc.later.label || 'Once you finish the programme', line: msc.later.line } : null,
                ask: null
            } : null;
            const heading = situation.heading && situation.heading.mark
                ? { before: situation.heading.before || '', mark: situation.heading.mark, after: situation.heading.after || '' }
                : { before: 'Use the ', mark: situation.name, after: ' order' };
            return {
                situation: code,
                name: situation.name,
                heading,
                leadNote: situation.leadNote || 'your strength',
                reason: (situation.reasonByInter && situation.reasonByInter[a.inter]) || situation.reason,
                order: plan.order,
                lead: plan.lead,
                blocks,
                variants,
                ownLines: own,
                mscLine,
                thinProof: thinProofFor(code, a, data),
                design,
                designLink: design ? link(day, resourceTitle(data, 'templates', 'CV templates'), design.page) : null,
                portal: portal && (!design || portal.number !== design.number) && data.portal
                    ? { design: portal, text: fill(data.portal, { design: portal.name + ' (No. ' + portal.number + ')' }) }
                    : null,
                also,
                // The CV Builder reads the same designs file, so a loaded list means it can open with this pick.
                builder,
                next,
                seeIt,
                domain: a.domain && a.domain !== 'unsure' ? a.domain : null,
                unsure
            };
        }

        /** What goes to the shared setting (MSCArticleshipProgress.setCvPick) for the CV Builder. */
        function toCvPick(result) {
            return {
                situation: result.situation,
                order: result.order.slice(),
                design: result.design ? result.design.number : null,
                variants: result.variants.map(v => v.id),
                domain: result.domain,
                source: TOOL
            };
        }

        /** True when two CV picks say the same thing (the time they were saved aside). */
        function samePick(x, y) {
            if (!x || !y) return false;
            const key = p => JSON.stringify([p.situation, p.order || [], p.design === undefined ? null : p.design, p.variants || [], p.domain || null]);
            return key(x) === key(y);
        }

        /** The answers as short chips for the result (each one reopens its question). → [{ step, id, title, text }] */
        function answerChips(answers) {
            const a = cleanAnswers(answers);
            const strength = id => (STRENGTHS.find(s => s.id === id) || {}).label || id;
            return QUESTIONS.map((q, step) => {
                let text = '';
                if (q.type === 'rank') {
                    text = a.rank.length ? strength(a.rank[0]) + ' first' : '';
                } else if (q.type === 'multi') {
                    const picked = a[q.id].map(id => q.options.find(o => o.id === id)).filter(Boolean);
                    if (picked.length === 1) text = picked[0].chip || picked[0].label;
                    else if (picked.length > 1) text = picked[0].label + ' +' + (picked.length - 1);
                } else {
                    const option = q.options.find(o => o.id === a[q.id]);
                    text = option ? (option.chip || option.label) : '';
                }
                return { step, id: q.id, title: q.title, text };
            }).filter(chip => chip.text);
        }

        /** Applies one tap to the answers and returns the new answers (pure). */
        function tap(answers, questionId, optionId) {
            const a = cleanAnswers(answers);
            const q = question(questionId);
            if (!q) return a;
            if (q.type === 'rank') {
                if (!DEFAULT_RANK.includes(optionId)) return a;
                const at = a.rank.indexOf(optionId);
                if (at !== -1) a.rank = a.rank.slice(0, at);
                else a.rank = a.rank.concat(optionId);
                if (a.rank.length === DEFAULT_RANK.length - 1) a.rank = a.rank.concat(DEFAULT_RANK.filter(id => !a.rank.includes(id)));
                return a;
            }
            if (!optionsFor(questionId, a).some(o => o.id === optionId)) return a;
            if (q.type === 'multi') {
                const option = q.options.find(o => o.id === optionId);
                let list = a[questionId].slice();
                if (list.includes(optionId)) list = list.filter(id => id !== optionId);
                else if (option.exclusive) list = [optionId];
                else list = list.filter(id => !q.options.some(o => o.exclusive && o.id === id)).concat(optionId);
                a[questionId] = list;
                return a;
            }
            a[questionId] = optionId;
            return cleanAnswers(a);
        }

        // ---------- Page (browser only) ----------

        function makeH(doc) {
            return function h(tag, attrs, children) {
                return element(doc, tag, attrs, children);
            };
        }

        function element(doc, tag, attrs, children) {
            const node = doc.createElement(tag);
            Object.entries(attrs || {}).forEach(([key, value]) => {
                if (value === null || value === undefined || value === false) return;
                if (key === 'class') node.className = value;
                else if (key === 'text') node.textContent = value;
                else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
                else node.setAttribute(key, value === true ? '' : String(value));
            });
            [].concat(children || []).forEach(child => {
                if (child === null || child === undefined || child === false) return;
                node.appendChild(typeof child === 'string' ? doc.createTextNode(child) : child);
            });
            return node;
        }

        function safeHref(href) {
            const value = String(href || '');
            return /^\/(?!\/)/.test(value) || /^https:\/\//.test(value) ? value : null;
        }

        function copyText(win, text) {
            const nav = win.navigator;
            if (nav && nav.clipboard && nav.clipboard.writeText) return nav.clipboard.writeText(text).then(() => true, () => fallbackCopy(win, text));
            return Promise.resolve(fallbackCopy(win, text));
        }

        function fallbackCopy(win, text) {
            try {
                const doc = win.document;
                const area = doc.createElement('textarea');
                area.value = text;
                area.setAttribute('readonly', '');
                area.style.position = 'fixed';
                area.style.opacity = '0';
                doc.body.appendChild(area);
                area.select();
                const ok = doc.execCommand && doc.execCommand('copy');
                area.remove();
                return Boolean(ok);
            } catch (_) {
                return false;
            }
        }

        /**
         * Mounts the tool. options: { data (situations.json + designs), store (progress store for this tool),
         * progress (MSCArticleshipProgress), heroEl (optional element hidden after step 1), mainEl (gets .is-wide on the
         * result), advanceMs / tapGuardMs (timings; tests shorten them) }.
         */
        function mount(el, options) {
            const opts = options || {};
            const doc = el.ownerDocument || root.document;
            const win = doc.defaultView || root;
            const h = makeH(doc);
            const data = opts.data;
            const store = opts.store;
            const progress = opts.progress || progressApi();
            const advanceMs = Number.isFinite(opts.advanceMs) ? opts.advanceMs : ADVANCE_MS;
            const tapGuardMs = Number.isFinite(opts.tapGuardMs) ? opts.tapGuardMs : TAP_GUARD_MS;
            const state = { step: 0, answers: cleanAnswers(null), view: 'quiz', editing: false };
            let touched = false;
            let advanceTimer = null;
            let guardUntil = 0;
            // For the motion only: the question last drawn, the option just tapped, and where the progress bar was.
            let shownStep = null;
            let shownPct = 0;
            let freshTap = null;
            // "My domain" is written from here only when the student tapped the domain question in this visit.
            let domainTapped = false;
            let uid = 0;
            // One quiet announcement per screen; the card itself is re-drawn, so it never carries aria-live.
            const live = h('p', { class: 'cvr-sr', role: 'status', 'aria-live': 'polite' });
            const view = h('div', { class: 'cvr-view' });
            el.replaceChildren(live, view);

            /** The shared "my domain" (every programme tool reads and sets it), when it is one of the 13. */
            function sharedDomain() {
                if (!progress || !progress.getMyDomain) return null;
                try {
                    const mine = progress.getMyDomain();
                    return mine && optionIds('domain').includes(mine) ? mine : null;
                } catch (_) {
                    return null;
                }
            }

            /**
             * The saved answers, with "my domain" taking over the domain answer when there is none yet, or when it
             * changed after these answers were saved (set in Domain roadmaps or another tool since). A "Not sure yet"
             * or another domain chosen here while my domain was already set stays as the student left it.
             */
            function loadFromStore() {
                const saved = store ? store.get() : {};
                state.answers = cleanAnswers(saved.answers);
                const mine = sharedDomain();
                const seen = saved.sharedDomain; // my domain when these answers were last saved (absent in older saves)
                if (mine && mine !== state.answers.domain && (!state.answers.domain || mine !== seen)) {
                    const replaced = Boolean(state.answers.domain);
                    state.answers.domain = mine;
                    if (replaced && store) store.update(d => Object.assign(d, { answers: state.answers, sharedDomain: mine }));
                }
                const complete = isComplete(state.answers);
                state.view = saved.done && complete ? 'result' : 'quiz';
                state.editing = false;
                state.step = Math.min(Number.isInteger(saved.step) ? saved.step : firstUnanswered(saved.answers), QUESTIONS.length - 1);
                if (state.step > firstUnanswered(state.answers)) state.step = Math.min(firstUnanswered(state.answers), QUESTIONS.length - 1);
            }

            function persist(extra) {
                if (!store) return;
                store.update(d => Object.assign(d, { answers: state.answers, step: state.step, sharedDomain: sharedDomain() }, extra || {}));
            }

            /** Keeps the CV Builder's pick equal to the result on screen (a reload recomputes it from today's designs). */
            function syncPick(result) {
                if (!progress || !progress.setCvPick) return;
                const next = toCvPick(result);
                let saved = null;
                try { saved = progress.getCvPick ? progress.getCvPick() : null; } catch (_) { saved = null; }
                if (samePick(saved, next)) return;
                try { progress.setCvPick(next); } catch (_) { /* a convenience for the CV Builder; the result still shows */ }
            }

            function go(step) {
                touched = true;
                win.clearTimeout(advanceTimer);
                state.step = Math.max(0, Math.min(step, QUESTIONS.length - 1));
                state.view = 'quiz';
                // A new question sits where the last tap was: the second half of a double tap must not answer it.
                guardUntil = Date.now() + tapGuardMs;
                persist({ done: false });
                render(true);
            }

            /** From the result: clear the answers and begin again at question 1. The CV Builder keeps the last pick until a new result is finished. */
            function restart() {
                if (typeof win.confirm === 'function' && !win.confirm('Clear your answers and start again from question 1?')) return;
                state.answers = cleanAnswers(null);
                state.editing = false;
                go(0);
            }

            /** From the result: open one question, then come straight back to the result. */
            function edit(step) {
                state.editing = true;
                go(step);
            }

            function finish() {
                touched = true;
                win.clearTimeout(advanceTimer);
                if (!isComplete(state.answers)) { go(firstUnanswered(state.answers)); return; }
                const result = recommend(state.answers, data);
                state.view = 'result';
                state.editing = false;
                if (progress) {
                    try {
                        // Only a domain tapped here becomes my domain, so an old answer never undoes a newer choice.
                        if (result.domain && domainTapped && progress.setMyDomain) progress.setMyDomain(result.domain);
                        domainTapped = false;
                        if (progress.setCvPick) progress.setCvPick(toCvPick(result));
                    } catch (_) { /* the pick is a convenience for the CV Builder; the result still shows */ }
                }
                persist({ done: true, situation: result.situation, savedAt: new Date().toISOString() });
                render(true);
            }

            function answer(q, optionId) {
                if (Date.now() < guardUntil) return;
                touched = true;
                if (q.id === 'domain') domainTapped = true;
                state.answers = tap(state.answers, q.id, optionId);
                freshTap = optionId;
                persist();
                render(false);
                if (q.type !== 'single') return;
                win.clearTimeout(advanceTimer);
                const from = state.step;
                advanceTimer = win.setTimeout(() => {
                    if (state.view !== 'quiz' || state.step !== from) return;
                    if (state.editing || from === QUESTIONS.length - 1) finish();
                    else go(from + 1);
                }, advanceMs);
            }

            function stepBar(grow) {
                const n = state.step + 1;
                const pct = Math.round((state.step / QUESTIONS.length) * 100);
                return h('div', { class: 'cvr-stepbar' }, [
                    h('span', { class: 'cvr-count', text: n + ' of ' + QUESTIONS.length }),
                    h('div', { class: 'cvr-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': QUESTIONS.length, 'aria-valuenow': state.step, 'aria-label': 'Questions answered' },
                        h('span', { class: grow ? 'is-grow' : null, style: 'width:' + pct + '%;--from:' + shownPct + '%' }))
                ]);
            }

            function rankList(q) {
                const rank = state.answers.rank;
                const items = STRENGTHS.map(s => {
                    const at = rank.indexOf(s.id);
                    const ranked = at !== -1;
                    return h('button', {
                        type: 'button',
                        class: 'cvr-rank-item' + (ranked ? ' is-ranked' : '') + (ranked && freshTap === s.id ? ' is-fresh' : ''),
                        'aria-pressed': ranked ? 'true' : 'false',
                        'aria-label': s.label + (ranked ? ', number ' + (at + 1) : ''),
                        onclick: () => answer(q, s.id)
                    }, [
                        h('span', { class: 'cvr-rank-no', 'aria-hidden': 'true', text: ranked ? String(at + 1) : '' }),
                        h('span', { class: 'cvr-opt-text' }, [h('span', { class: 'cvr-opt-label', text: s.label }), h('span', { class: 'cvr-opt-hint', text: s.hint })])
                    ]);
                });
                return h('div', { class: 'cvr-rank', role: 'group', 'aria-label': q.title }, items);
            }

            function optionList(q) {
                const value = state.answers[q.id];
                const multi = q.type === 'multi';
                const items = optionsFor(q.id, state.answers).map(o => {
                    const on = multi ? value.includes(o.id) : value === o.id;
                    return h('button', {
                        type: 'button',
                        class: 'cvr-opt' + (on ? ' is-on' : '') + (multi ? ' is-multi' : '') + (on && freshTap === o.id ? ' is-fresh' : ''),
                        'aria-pressed': on ? 'true' : 'false',
                        onclick: () => answer(q, o.id)
                    }, [
                        h('span', { class: 'cvr-tick', 'aria-hidden': 'true' }),
                        h('span', { class: 'cvr-opt-text' }, [h('span', { class: 'cvr-opt-label', text: o.label }), o.hint ? h('span', { class: 'cvr-opt-hint', text: o.hint }) : null])
                    ]);
                });
                return h('div', { class: 'cvr-options' + (q.grid ? ' is-grid' : ''), role: 'group', 'aria-label': q.title }, items);
            }

            function renderQuiz(focus) {
                const q = QUESTIONS[state.step];
                const answered = isAnswered(q.id, state.answers);
                const last = state.step === QUESTIONS.length - 1;
                const toResult = last || state.editing;
                const showNext = q.type !== 'single' || answered;
                const heading = h('h2', { class: 'cvr-q', tabindex: '-1', text: q.title });
                // A new question slides in (from the left when going back); a tap inside one only pops its own tick.
                const entering = focus || shownStep === null;
                const back = shownStep !== null && state.step < shownStep;
                const card = h('section', { class: 'cvr-card ap-card' + (entering ? ' cvr-enter' : '') + (entering && back ? ' cvr-enter-back' : ''), 'aria-label': 'Question ' + (state.step + 1) + ' of ' + QUESTIONS.length }, [
                    stepBar(entering),
                    heading,
                    q.hint ? h('p', { class: 'cvr-hint', text: q.hint }) : null,
                    q.type === 'rank' ? rankList(q) : optionList(q),
                    q.type === 'rank' && state.answers.rank.length ? h('button', {
                        type: 'button', class: 'cvr-reset', onclick: () => { touched = true; state.answers.rank = []; persist(); render(false); }
                    }, 'Start the ranking again') : null,
                    h('div', { class: 'cvr-nav' }, [
                        state.step > 0 ? h('button', { type: 'button', class: 'ap-btn is-secondary', onclick: () => go(state.step - 1) }, 'Back') : h('span'),
                        showNext ? h('button', {
                            type: 'button', class: 'ap-btn', disabled: answered ? null : true,
                            onclick: () => (toResult ? finish() : go(state.step + 1))
                        }, toResult ? 'Show my CV' : 'Next') : null
                    ])
                ]);
                view.replaceChildren(card);
                shownStep = state.step;
                shownPct = Math.round((state.step / QUESTIONS.length) * 100);
                freshTap = null;
                if (focus) {
                    live.textContent = 'Question ' + (state.step + 1) + ' of ' + QUESTIONS.length + ': ' + q.title;
                    try { heading.focus({ preventScroll: true }); } catch (_) { heading.focus(); }
                    if (win.scrollTo) { try { win.scrollTo({ top: 0, behavior: 'auto' }); } catch (_) { /* old browsers */ } }
                }
            }

            /**
             * The CV picture. On a phone the example lines show on the first three blocks, the lead block and every block
             * whose line comes from the student's own taps; the rest open with one tap (CSS shows them all from 900 px).
             */
            function paper(result) {
                const listId = 'cvr-paper-' + (++uid);
                const brief = (b, i) => (i > 2 && !b.lead && !b.own ? ' is-brief' : '');
                const blocks = result.blocks.map((b, i) => h('li', { class: 'cvr-block' + (b.lead ? ' is-lead' : '') + (b.own ? ' is-own' : '') + (b.note ? ' is-last' : '') + (b.id === 'header' ? ' is-header' : '') + brief(b, i) }, [
                    h('span', { class: 'cvr-pen', 'aria-hidden': 'true', text: String(i + 1) }),
                    h('div', { class: 'cvr-block-body' }, [
                        h('span', { class: 'cvr-block-head' }, [
                            h('span', { class: 'cvr-block-label', text: b.label }),
                            b.lead ? h('span', { class: 'cvr-lead-note', text: result.leadNote }) : null,
                            b.note ? h('span', { class: 'cvr-lead-note is-last', text: b.note }) : null
                        ]),
                        h('span', { class: 'cvr-block-example', text: b.example }),
                        h('span', { class: 'cvr-lines', 'aria-hidden': 'true' }, [h('i'), h('i')])
                    ])
                ]));
                const hidden = result.blocks.filter((b, i) => brief(b, i)).length;
                const figure = h('figure', { class: 'cvr-paper' });
                const more = hidden ? h('button', {
                    type: 'button', class: 'cvr-more', 'aria-expanded': 'false', 'aria-controls': listId,
                    onclick: () => {
                        const open = !figure.classList.contains('is-open');
                        figure.classList.toggle('is-open', open);
                        more.setAttribute('aria-expanded', open ? 'true' : 'false');
                        more.textContent = open ? 'Fewer example lines' : 'An example line for every block';
                    }
                }, 'An example line for every block') : null;
                figure.append(...[
                    h('ol', { class: 'cvr-blocks', id: listId, 'aria-label': 'Your CV, section by section' }, blocks),
                    more,
                    h('figcaption', { class: 'cvr-caption', text: 'One page. A block with nothing true in it is dropped, never filled.' })
                ].filter(Boolean));
                return figure;
            }

            /** "2 lines" until the student copies one, then "1 of 2 copied"; a group with everything copied turns green. */
            function refreshCount(group) {
                if (!group) return;
                const total = group.querySelectorAll('.cvr-variant').length;
                const done = group.querySelectorAll('.cvr-variant.is-copied').length;
                const el = group.querySelector('.cvr-lines-count');
                if (el) el.textContent = done ? done + ' of ' + total + ' copied' : total + (total === 1 ? ' line' : ' lines');
                group.classList.toggle('is-done', total > 0 && done === total);
            }

            function copyButton(label, text) {
                return h('button', {
                    type: 'button', class: 'cvr-copy', 'aria-label': 'Copy: ' + label, 'data-copy': text,
                    onclick: event => {
                        const btn = event.currentTarget;
                        copyText(win, text).then(ok => {
                            btn.textContent = ok ? 'Copied' : 'Select and copy';
                            const row = btn.closest('.cvr-variant');
                            if (ok && row) { row.classList.add('is-copied'); refreshCount(row.closest('.cvr-lines-group')); }
                            if (!ok) {
                                const body = btn.closest('.cvr-variant').querySelector('.cvr-variant-body');
                                const toggle = btn.closest('.cvr-variant').querySelector('.cvr-variant-toggle');
                                if (body && toggle) { body.hidden = false; toggle.setAttribute('aria-expanded', 'true'); }
                            }
                            win.setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
                        });
                    }
                }, 'Copy');
            }

            /**
             * One line to add: its label and Copy on one row. The student's own lines (their work, projects,
             * simulations) open at once; every other card shows the start of its line under the label, so Copy never
             * copies a line the student has not seen, and opens on a tap for the note and "If asked".
             */
            function variantCard(v, where) {
                const text = v.lines.join('\n');
                const id = 'cvr-v-' + (++uid);
                const open = Boolean(v.block);
                const later = v.later ? h('div', { class: 'cvr-later' }, [
                    h('div', { class: 'cvr-later-head' }, [
                        h('span', { class: 'cvr-later-label', text: v.later.label }),
                        copyButton(v.label + ', ' + v.later.label.toLowerCase(), v.later.line)
                    ]),
                    h('code', { class: 'cvr-line', text: v.later.line })
                ]) : null;
                const body = h('div', { class: 'cvr-variant-body', id, hidden: !open }, [
                    v.lines.length ? h('code', { class: 'cvr-line', text }) : null,
                    later,
                    v.note ? h('p', { class: 'cvr-variant-note', text: v.note }) : null,
                    v.ask ? h('p', { class: 'cvr-ask' }, [h('span', { text: 'If asked: ' }), v.ask]) : null
                ]);
                const toggle = h('button', {
                    type: 'button', class: 'cvr-variant-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': id,
                    onclick: () => {
                        const next = toggle.getAttribute('aria-expanded') !== 'true';
                        toggle.setAttribute('aria-expanded', next ? 'true' : 'false');
                        body.hidden = !next;
                    }
                }, [
                    h('span', { class: 'cvr-variant-head' }, [
                        h('span', { class: 'cvr-variant-top' }, [
                            h('span', { class: 'cvr-variant-label', text: v.label }),
                            where ? h('span', { class: 'cvr-where', text: 'Goes in ' + where }) : null
                        ]),
                        v.lines.length ? h('span', { class: 'cvr-variant-peek', 'aria-hidden': 'true', text: v.lines[0] }) : null
                    ]),
                    h('span', { class: 'cvr-chev', 'aria-hidden': 'true' })
                ]);
                return h('li', { class: 'cvr-variant' + (v.id === 'msc-line' ? ' is-msc' : '') + (v.block ? ' is-own' : '') }, [
                    h('div', { class: 'cvr-variant-row' }, [toggle, v.lines.length ? copyButton(v.label, text) : null]),
                    body
                ]);
            }

            function linkList(links) {
                return links.map(l => {
                    const href = safeHref(l.href);
                    return href ? h('a', { class: 'ap-link', href }, l.label) : null;
                });
            }

            function answerSummary() {
                const chips = answerChips(state.answers).map(chip => h('button', {
                    type: 'button', class: 'cvr-chip', 'aria-label': 'Change: ' + chip.title + ' (now ' + chip.text + ')',
                    onclick: () => edit(chip.step)
                }, chip.text));
                return h('section', { class: 'cvr-answers', 'aria-label': 'Your answers' }, [
                    h('h2', { class: 'ap-h2', text: 'Your answers' }),
                    h('p', { class: 'cvr-hint', text: 'Tap one to change it.' }),
                    h('div', { class: 'cvr-chips' }, chips)
                ]);
            }

            function renderResult(focus) {
                const result = recommend(state.answers, data);
                const title = h('h1', { class: 'cvr-result-title', tabindex: '-1' }, [
                    result.heading.before, h('span', { class: 'ap-mark', text: result.heading.mark }), result.heading.after
                ]);
                const design = result.design ? h('div', { class: 'cvr-design' }, [
                    h('span', { class: 'cvr-kicker', text: 'Suggested design' }),
                    h('p', { class: 'cvr-design-name' }, [
                        h('span', { class: 'cvr-design-no', text: 'No. ' + result.design.number }),
                        ' ' + result.design.name,
                        result.design.tag ? h('span', {
                            class: 'cvr-tag' + (result.design.portalSafe ? ' is-portal' : '') + (result.design.screen ? ' is-screen' : ''),
                            text: result.design.tag + (result.design.screen ? ': send as a PDF' : '')
                        }) : null
                    ]),
                    result.design.line ? h('p', { class: 'cvr-design-line', text: result.design.line }) : null,
                    safeHref(result.designLink) ? h('a', { class: 'ap-link cvr-design-link', href: result.designLink }, 'See it in CV templates') : null,
                    result.portal ? h('p', { class: 'cvr-portal', text: result.portal.text }) : null,
                    result.also ? h('p', { class: 'cvr-portal cvr-also' }, [
                        result.also.text + ' ',
                        safeHref(result.also.href) ? h('a', { class: 'ap-link cvr-also-link', href: result.also.href }, 'See No. ' + result.also.design.number) : null
                    ]) : null
                ]) : null;
                const nextParts = result.next ? result.next.text.split(/\{link\}|\{day\}/) : [];
                const next = result.next ? h('p', { class: 'cvr-next' }, nextParts.reduce((out, part, i) => {
                    if (i > 0) out.push(safeHref(result.next.link.href) ? h('a', { class: 'ap-link', href: result.next.link.href }, result.next.link.label) : result.next.link.label);
                    if (part) out.push(part);
                    return out;
                }, [])) : null;
                const pick = h('section', { class: 'cvr-pick ap-card', 'aria-label': 'Your order and design' }, [
                    safeHref(result.seeIt.href) ? h('a', { class: 'ap-btn is-block', href: result.seeIt.href }, result.seeIt.label) : null,
                    next,
                    design
                ]);
                // The student's own lines first (their work, projects, simulations), then the MSC line, then the variants.
                const blockLabel = id => (result.blocks.find(block => block.id === id) || {}).label || '';
                const own = result.ownLines.filter(Boolean);
                const also = [result.mscLine].concat(result.variants).filter(Boolean);
                const linesGroup = (kind, title, sub, cards, whereOf) => (cards.length ? h('div', { class: 'cvr-lines-group is-' + kind }, [
                    h('div', { class: 'cvr-lines-head' }, [
                        h('h3', { class: 'cvr-lines-title', text: title }),
                        h('span', { class: 'cvr-lines-count', 'aria-live': 'polite', text: cards.length + (cards.length === 1 ? ' line' : ' lines') })
                    ]),
                    h('p', { class: 'cvr-lines-sub', text: sub }),
                    h('ul', { class: 'cvr-variants' }, cards.map(card => variantCard(card, whereOf(card))))
                ]) : null);
                const lines = own.length || also.length ? h('section', { class: 'cvr-variants-wrap' }, [
                    h('h2', { class: 'ap-h2', text: 'Add these lines' }),
                    linesGroup('own', 'From your answers', 'Change the brackets and numbers to what you really did, then paste each where it belongs.', own, card => blockLabel(card.block)),
                    linesGroup('also', 'Also add, if it fits', 'Open one to read it first; Copy keeps track of what you have taken.', also, () => '')
                ]) : null;
                const thin = result.thinProof ? h('div', { class: 'cvr-note ' + (result.situation === 'H' ? 'is-next' : 'is-thin') }, [
                    h('strong', { text: result.thinProof.label }), ' ' + result.thinProof.text,
                    h('span', { class: 'cvr-note-links' }, linkList(result.thinProof.links))
                ]) : null;
                const unsure = result.unsure ? h('div', { class: 'cvr-note' }, [
                    h('strong', { text: result.unsure.label }), ' ' + result.unsure.text,
                    result.unsure.link ? h('span', { class: 'cvr-note-links' }, linkList([result.unsure.link])) : null
                ]) : null;
                const out = h('div', { class: 'cvr-result' }, [
                    h('header', { class: 'cvr-result-head' }, [
                        h('span', { class: 'cvr-kicker', text: 'Your CV order' }),
                        title,
                        h('p', { class: 'cvr-reason', text: result.reason })
                    ]),
                    h('div', { class: 'cvr-result-grid' + (thin ? ' has-notes' : '') }, [
                        pick,
                        thin ? h('div', { class: 'cvr-col-notes' }, [thin]) : null,
                        h('div', { class: 'cvr-col-paper' }, [paper(result)]),
                        h('div', { class: 'cvr-col-side' }, [unsure, lines, answerSummary(), h('div', { class: 'cvr-restart' }, [
                            h('button', { type: 'button', class: 'ap-btn is-secondary', onclick: restart }, 'Start over')
                        ])])
                    ])
                ]);
                view.replaceChildren(out);
                syncPick(result);
                if (focus) {
                    live.textContent = 'Your CV order: ' + result.heading.before + result.heading.mark + result.heading.after;
                    try { title.focus({ preventScroll: true }); } catch (_) { title.focus(); }
                    if (win.scrollTo) { try { win.scrollTo({ top: 0, behavior: 'auto' }); } catch (_) { /* old browsers */ } }
                }
            }

            function render(focus) {
                const quiz = state.view === 'quiz';
                if (opts.heroEl) opts.heroEl.classList.toggle('ap-hidden', !(quiz && state.step === 0 && !state.editing));
                if (opts.mainEl) opts.mainEl.classList.toggle('is-wide', !quiz);
                if (quiz) renderQuiz(focus);
                else renderResult(focus);
            }

            loadFromStore();
            render(false);
            if (store && store.subscribe) {
                // Answers synced from the account (or another tab) arrive after the first paint: show them unless the
                // student has already started tapping here.
                store.subscribe((value, meta) => {
                    const source = meta && meta.source;
                    if (touched || source === 'local') return;
                    loadFromStore();
                    render(false);
                });
            }
            if (progress && progress.onSettingsChange) {
                // "My domain" synced from the account or changed in another tab: the same rule as on load.
                progress.onSettingsChange((value, meta) => {
                    if (touched || (meta && meta.source === 'local')) return;
                    loadFromStore();
                    render(false);
                });
            }
            return {
                state: () => JSON.parse(JSON.stringify(state)),
                render,
                go,
                edit,
                finish
            };
        }

        return Object.freeze({
            TOOL, SITUATION_CODES, STRENGTHS, QUESTIONS, OWN_PROJECTS, STRENGTH_OF, DESIGNS_URL,
            WORK_SIMULATION_LIVE, ADVANCE_MS, TAP_GUARD_MS, workSimulationLive: wsLive, withConfig: create,
            cleanAnswers, ruleAnswers, isAnswered, firstUnanswered, isComplete, proofCount, tap, optionsFor, answerChips,
            chooseSituation, planOrder, personaliseOrder, variantIdsFor, variantsFor, ownLinesFor, thinProofFor, exampleFor,
            normaliseDesigns, suggestDesign, portalDesign, variantDesign, recommend, toCvPick, samePick, mount
        });
    }

    return create({});
});
