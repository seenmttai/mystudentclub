/**
 * MSC Articleship Program: CV Recommender (Day 1 · Choose your CV, row 1.2).
 *
 * Nine taps → one of the situations A–H, its section order (personalised to the proof the student has), the variant
 * lines to add, a suggested design and "See it" (its page in Choose your CV, or The Nothing CV for H).
 * Deterministic rules only, no AI. The pick is saved to the shared setting so the CV Builder opens with it.
 *
 * Content: /articleship-program/cv-recommender/situations.json (the one situation list shared by Choose your CV, this
 * tool and the CV Builder) and designs.json (the CV templates look-book's designs, numbered as in the look-book).
 *
 * Browser: window.MSCCvRecommender. Node (tests): require('./scripts/articleship-cv-recommender.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCCvRecommender = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const TOOL = 'cv-recommender';
    const SITUATION_CODES = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    const OWN_PROJECTS = Object.freeze(['model', 'annual-report']);
    const DEFAULT_RANK = Object.freeze(['academics', 'work', 'projects', 'roles', 'skills']);

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

    function buildQuestions() {
        return [
            { id: 'rank', type: 'rank', title: 'Rank your strengths', hint: 'Tap them from strongest to weakest.' },
            {
                id: 'inter', type: 'single', title: 'How did you clear Inter?', options: [
                    { id: 'first', label: 'Both groups, first attempt' },
                    { id: 'later', label: 'Both groups, a later attempt' },
                    { id: 'separate', label: 'Groups in different sittings' },
                    { id: 'one-awaited', label: 'One group cleared, one awaited' },
                    { id: 'both-awaited', label: 'Both groups, result awaited' }
                ]
            },
            {
                id: 'gap', type: 'single', title: 'Any gap?', options: [
                    { id: 'none', label: 'None' },
                    { id: 'after-foundation', label: 'After Foundation' },
                    { id: 'after-inter', label: 'After Inter' },
                    { id: 'missed-sitting', label: 'A missed or skipped sitting' },
                    { id: 'year-out', label: 'A year out' }
                ]
            },
            {
                id: 'graduation', type: 'single', title: 'Your graduation', options: [
                    { id: 'regular', label: 'Pursuing, regular college' },
                    { id: 'distance', label: 'Pursuing, distance or evening' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'direct-entry', label: 'Graduate, direct entry', hint: 'No Foundation row' },
                    { id: 'stopped', label: 'Started, then stopped' },
                    { id: 'none', label: 'Not pursuing' }
                ]
            },
            {
                id: 'icitss', type: 'single', title: 'Your ICITSS', hint: 'Orientation Course + IT Training', options: [
                    { id: 'done', label: 'Completed' },
                    { id: 'ongoing', label: 'Ongoing' },
                    { id: 'pending', label: 'Not started' }
                ]
            },
            {
                id: 'work', type: 'multi', title: 'Work you have done', hint: 'Tap all that apply.', options: [
                    { id: 'ca-firm', label: 'CA firm internship' },
                    { id: 'company', label: 'Company or start-up internship' },
                    { id: 'family', label: 'Family business books' },
                    { id: 'tuition', label: 'Tuition' },
                    { id: 'part-time', label: 'Part-time or freelance accounts' },
                    { id: 'none', label: 'None yet', exclusive: true }
                ]
            },
            {
                id: 'projects', type: 'multi', title: 'Projects you have done', hint: 'Tap all that apply.', options: [
                    { id: 'work-simulation', label: 'Work Simulation level' },
                    { id: 'job-simulation', label: 'A job simulation', hint: 'Forage or similar' },
                    { id: 'model', label: 'Excel model or dashboard' },
                    { id: 'annual-report', label: 'Annual-report project' },
                    { id: 'none', label: 'None yet', exclusive: true }
                ]
            },
            {
                id: 'course', type: 'single', title: 'Another course alongside?', options: [
                    { id: 'none', label: 'None' },
                    { id: 'cs', label: 'CS' },
                    { id: 'cma', label: 'CMA' },
                    { id: 'cfa', label: 'CFA' },
                    { id: 'degree', label: 'Another degree', hint: 'LL.B. or similar' }
                ]
            },
            {
                id: 'domain', type: 'single', title: 'Your target domain', grid: true,
                options: domainList().map(d => ({ id: d.slug, label: d.label })).concat([{ id: 'unsure', label: 'Not sure yet' }])
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
        return {
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

    /**
     * 1. Graduate through direct entry → G.
     * 2. No work and no project, and the top strength is Work done or Projects → H (The Nothing CV).
     * 3. Walk the ranking: Academics → A (both groups together: first attempt or both awaited) or B (any other way);
     *    Work done → C if any work; Projects → D if any project; Roles → E; Skills → F. A strength with no proof is
     *    skipped and the next one is tried.
     */
    function chooseSituation(answers) {
        const a = ruleAnswers(answers);
        if (a.graduation === 'direct-entry') return 'G';
        const top = a.rank[0];
        if (proofCount(a) === 0 && (top === 'work' || top === 'projects')) return 'H';
        for (const strength of a.rank) {
            if (strength === 'academics') return a.inter === 'first' || a.inter === 'both-awaited' ? 'A' : 'B';
            if (strength === 'work' && a.work.length) return 'C';
            if (strength === 'projects' && a.projects.length) return 'D';
            if (strength === 'roles') return 'E';
            if (strength === 'skills') return 'F';
        }
        return 'H';
    }

    /** The situation's order, minus blocks the student has nothing for, plus their work or own projects. */
    function personaliseOrder(situation, answers) {
        const a = ruleAnswers(answers);
        const hasWork = a.work.length > 0;
        const hasOwnProjects = a.projects.some(id => OWN_PROJECTS.includes(id));
        const order = (situation.order || []).filter(id => (id !== 'experience' || hasWork) && (id !== 'projects' || hasOwnProjects));
        const add = [];
        if (hasWork && !order.includes('experience')) add.push('experience');
        if (hasOwnProjects && !order.includes('projects')) add.push('projects');
        if (add.length) {
            const anchor = (situation.insertAfter || []).find(id => order.includes(id)) || 'education';
            let index = order.indexOf(anchor);
            if (index === -1) index = Math.max(order.indexOf('education'), 0);
            order.splice(index + 1, 0, ...add);
        }
        return order;
    }

    function leadBlock(situation, order) {
        if (situation.lead && order.includes(situation.lead)) return situation.lead;
        const edu = order.indexOf('education');
        return edu !== -1 && order[edu + 1] ? order[edu + 1] : 'education';
    }

    function fill(text, values) {
        return String(text || '').replace(/\{(\w+)\}/g, (match, key) => (values && values[key] !== undefined ? values[key] : match));
    }

    function variantIdsFor(answers) {
        const a = ruleAnswers(answers);
        const ids = [];
        if (a.inter === 'one-awaited') ids.push('g2-awaited');
        if (a.inter === 'both-awaited') ids.push('result-awaited');
        if (a.inter === 'separate') ids.push('groups-separately');
        if (a.inter === 'later') ids.push('more-attempts');
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
            const ask = id === 'gap' && def.asks && def.asks[a.gap] ? def.asks[a.gap] : def.ask;
            return {
                id,
                label: fill(def.label, values),
                note: fill((course && course.note) || def.note || '', values) || null,
                lines: (def.lines || []).map(line => fill(line, values)).filter(Boolean),
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

    function thinProofFor(code, answers, data) {
        const def = (data && data.thinProof) || {};
        const ws = data && data.links && data.links.workSimulation;
        if (code === 'H') {
            // The Nothing CV is the main answer; the Work Simulation is the step after it.
            return ws && def.textNothing ? { label: def.labelNothing || def.label || 'Then', text: def.textNothing, links: [{ label: 'Work Simulation', href: ws }] } : null;
        }
        const a = ruleAnswers(answers);
        const count = a.work.length + a.projects.length;
        if (!(count === 0 || (count <= 1 && code !== 'A'))) return null;
        const day = (data && data.day) || 1;
        const hasSimulation = a.projects.includes('work-simulation');
        const links = [];
        if (!hasSimulation && ws) links.push({ label: 'Work Simulation', href: ws });
        links.push({ label: 'The Nothing CV', href: link(day, resourceTitle(data, 'nothing', 'The Nothing CV'), def.page || 3) });
        return {
            label: def.label || 'Thin on proof?',
            text: hasSimulation ? (def.textHasSimulation || def.text) : def.text,
            links
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

    /** designs.json in any reasonable shape → [{ number, id, name, tag, portalSafe, bestFor, page, line }], by number. */
    function normaliseDesigns(raw) {
        const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.designs) ? raw.designs : (raw && Array.isArray(raw.kept) ? raw.kept : []));
        const out = [];
        list.forEach((item, index) => {
            if (!item || typeof item !== 'object') return;
            const number = Number(item.number !== undefined ? item.number : (item.no !== undefined ? item.no : (item.n !== undefined ? item.n : index + 1)));
            const name = String(item.name || item.title || '').trim();
            if (!Number.isInteger(number) || number < 1 || !name) return;
            const tags = [].concat(item.tags || [], item.tag || [], item.label || []).map(String);
            const portalSafe = item.portalSafe === true || item.portal_safe === true || tags.some(tag => /portal/i.test(tag));
            let bestFor = letterList(item.bestFor || item.best_for || item.situations || item.for);
            if (!bestFor.length && /^[A-H]$/i.test(String(item.persona || ''))) bestFor = [String(item.persona).toUpperCase()];
            const page = Number(item.page || item.lookbookPage || item.lookbook_page);
            const lineText = item.line || item.bestForLine || item.best_for_line || (typeof item.bestFor === 'string' && !bestFor.length ? item.bestFor : '');
            out.push({
                number,
                id: String(item.id || item.slug || item.key || item.file || name).trim(),
                name,
                tag: portalSafe ? 'Portal-safe' : (tags.find(tag => /print/i.test(tag)) ? 'Print' : (tags[0] || '')),
                portalSafe,
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

    // ---------- The recommendation ----------

    function recommend(answers, data) {
        if (!data || !data.situations) throw new Error('Situations data missing');
        const a = ruleAnswers(answers);
        const code = chooseSituation(a);
        const situation = data.situations[code];
        if (!situation) throw new Error('Situation ' + code + ' missing from the data');
        const sections = data.sections || {};
        const order = personaliseOrder(situation, a);
        const lead = leadBlock(situation, order);
        const blocks = order.map(id => ({
            id,
            label: (situation.labels && situation.labels[id]) || (sections[id] && sections[id].label) || id,
            example: (situation.examples && situation.examples[id]) || (sections[id] && sections[id].example) || '',
            lead: id === lead
        }));
        const variants = variantsFor(a, data);
        const designs = normaliseDesigns(data.designs);
        const design = suggestDesign(designs, code, variants.map(v => v.id));
        const portal = portalDesign(designs);
        const day = data.day || 1;
        const isNothing = situation.resource === 'nothing';
        const seeIt = {
            label: 'See it',
            href: link(day, resourceTitle(data, isNothing ? 'nothing' : 'choose', isNothing ? 'The Nothing CV' : 'Choose your CV'), situation.page || 1)
        };
        const unsure = a.domain === 'unsure' && data.unsure ? {
            label: data.unsure.label,
            text: data.unsure.text,
            link: data.links && data.links.domainRoadmaps ? { label: 'Domain roadmaps', href: data.links.domainRoadmaps } : null
        } : null;
        const heading = situation.heading && situation.heading.mark
            ? { before: situation.heading.before || '', mark: situation.heading.mark, after: situation.heading.after || '' }
            : { before: 'Use the ', mark: situation.name, after: ' order' };
        return {
            situation: code,
            name: situation.name,
            heading,
            leadNote: situation.leadNote || 'your strength',
            reason: situation.reason,
            order,
            blocks,
            variants,
            thinProof: thinProofFor(code, a, data),
            design,
            designLink: design ? link(day, resourceTitle(data, 'templates', 'CV templates'), design.page) : null,
            portal: portal && (!design || portal.number !== design.number) && data.portal
                ? { design: portal, text: fill(data.portal, { design: portal.name + ' (No. ' + portal.number + ')' }) }
                : null,
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
        if (!optionIds(questionId).includes(optionId)) return a;
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
        return a;
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
     * progress (MSCArticleshipProgress), heroEl (optional element hidden after step 1), mainEl (gets .is-wide on the result) }.
     */
    function mount(el, options) {
        const opts = options || {};
        const doc = el.ownerDocument || root.document;
        const win = doc.defaultView || root;
        const h = makeH(doc);
        const data = opts.data;
        const store = opts.store;
        const progress = opts.progress || progressApi();
        const state = { step: 0, answers: cleanAnswers(null), view: 'quiz' };
        let touched = false;
        let advanceTimer = null;

        function loadFromStore() {
            const saved = store ? store.get() : {};
            state.answers = cleanAnswers(saved.answers);
            if (!state.answers.domain && progress && progress.getMyDomain) {
                const mine = progress.getMyDomain();
                if (mine && optionIds('domain').includes(mine)) state.answers.domain = mine;
            }
            const complete = isComplete(state.answers);
            state.view = saved.done && complete ? 'result' : 'quiz';
            state.step = Math.min(Number.isInteger(saved.step) ? saved.step : firstUnanswered(saved.answers), QUESTIONS.length - 1);
            if (state.step > firstUnanswered(state.answers)) state.step = Math.min(firstUnanswered(state.answers), QUESTIONS.length - 1);
        }

        function persist(extra) {
            if (!store) return;
            store.update(d => Object.assign(d, { answers: state.answers, step: state.step }, extra || {}));
        }

        function go(step) {
            touched = true;
            win.clearTimeout(advanceTimer);
            state.step = Math.max(0, Math.min(step, QUESTIONS.length - 1));
            state.view = 'quiz';
            persist({ done: false });
            render(true);
        }

        function finish() {
            touched = true;
            win.clearTimeout(advanceTimer);
            if (!isComplete(state.answers)) { go(firstUnanswered(state.answers)); return; }
            const result = recommend(state.answers, data);
            state.view = 'result';
            persist({ done: true, situation: result.situation, savedAt: new Date().toISOString() });
            if (progress) {
                try {
                    if (result.domain && progress.setMyDomain) progress.setMyDomain(result.domain);
                    if (progress.setCvPick) progress.setCvPick(toCvPick(result));
                } catch (_) { /* the pick is a convenience for the CV Builder; the result still shows */ }
            }
            render(true);
        }

        function answer(q, optionId) {
            touched = true;
            state.answers = tap(state.answers, q.id, optionId);
            persist();
            if (q.type === 'single') {
                render(false);
                win.clearTimeout(advanceTimer);
                const from = state.step;
                advanceTimer = win.setTimeout(() => {
                    if (state.view !== 'quiz' || state.step !== from) return;
                    if (from === QUESTIONS.length - 1) finish();
                    else go(from + 1);
                }, 160);
            } else {
                render(false);
            }
        }

        function stepBar() {
            const n = state.step + 1;
            const pct = Math.round((state.step / QUESTIONS.length) * 100);
            return h('div', { class: 'cvr-stepbar' }, [
                h('span', { class: 'cvr-count', text: n + ' of ' + QUESTIONS.length }),
                h('div', { class: 'cvr-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': QUESTIONS.length, 'aria-valuenow': state.step, 'aria-label': 'Questions answered' },
                    h('span', { style: 'width:' + pct + '%' }))
            ]);
        }

        function rankList(q) {
            const rank = state.answers.rank;
            const items = STRENGTHS.map(s => {
                const at = rank.indexOf(s.id);
                const ranked = at !== -1;
                return h('button', {
                    type: 'button',
                    class: 'cvr-rank-item' + (ranked ? ' is-ranked' : ''),
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
            const items = q.options.map(o => {
                const on = multi ? value.includes(o.id) : value === o.id;
                return h('button', {
                    type: 'button',
                    class: 'cvr-opt' + (on ? ' is-on' : '') + (multi ? ' is-multi' : ''),
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
            const showNext = q.type !== 'single' || answered;
            const heading = h('h2', { class: 'cvr-q', tabindex: '-1', text: q.title });
            const card = h('section', { class: 'cvr-card ap-card', 'aria-live': 'polite' }, [
                stepBar(),
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
                        onclick: () => (last ? finish() : go(state.step + 1))
                    }, last ? 'Show my CV' : 'Next') : null
                ])
            ]);
            el.replaceChildren(card);
            if (focus) {
                try { heading.focus({ preventScroll: true }); } catch (_) { heading.focus(); }
                if (win.scrollTo) { try { win.scrollTo({ top: 0, behavior: 'auto' }); } catch (_) { /* jsdom */ } }
            }
        }

        function paper(result) {
            const blocks = result.blocks.map((b, i) => h('li', { class: 'cvr-block' + (b.lead ? ' is-lead' : '') + (b.id === 'header' ? ' is-header' : '') }, [
                h('span', { class: 'cvr-pen', 'aria-hidden': 'true', text: String(i + 1) }),
                h('div', { class: 'cvr-block-body' }, [
                    h('span', { class: 'cvr-block-head' }, [
                        h('span', { class: 'cvr-block-label', text: b.label }),
                        b.lead ? h('span', { class: 'cvr-lead-note', text: result.leadNote }) : null
                    ]),
                    h('span', { class: 'cvr-block-example', text: b.example }),
                    h('span', { class: 'cvr-lines', 'aria-hidden': 'true' }, [h('i'), h('i')])
                ])
            ]));
            return h('figure', { class: 'cvr-paper' }, [
                h('ol', { class: 'cvr-blocks', 'aria-label': 'Your CV, section by section' }, blocks),
                h('figcaption', { class: 'cvr-caption', text: 'One page. A block with nothing true in it is dropped, never filled.' })
            ]);
        }

        function variantCard(v) {
            const text = v.lines.join('\n');
            const copyBtn = v.lines.length ? h('button', {
                type: 'button', class: 'cvr-copy',
                onclick: event => {
                    const btn = event.currentTarget;
                    copyText(win, text).then(ok => {
                        btn.textContent = ok ? 'Copied' : 'Select and copy';
                        win.setTimeout(() => { btn.textContent = 'Copy'; }, 1600);
                    });
                }
            }, 'Copy') : null;
            return h('li', { class: 'cvr-variant ap-sticky' }, [
                h('strong', { text: v.label }),
                v.note ? h('p', { class: 'cvr-variant-note', text: v.note }) : null,
                v.lines.length ? h('div', { class: 'cvr-line' }, [h('code', { text: text }), copyBtn]) : null,
                v.ask ? h('p', { class: 'cvr-ask' }, [h('span', { text: 'If asked: ' }), v.ask]) : null
            ]);
        }

        function linkList(links) {
            return links.map(l => {
                const href = safeHref(l.href);
                return href ? h('a', { class: 'ap-link', href }, l.label) : null;
            });
        }

        function renderResult(focus) {
            const result = recommend(state.answers, data);
            const title = h('h1', { class: 'cvr-result-title', tabindex: '-1' }, [
                h('span', { class: 'cvr-badge', text: result.situation }),
                h('span', {}, [result.heading.before, h('span', { class: 'ap-mark', text: result.heading.mark }), result.heading.after])
            ]);
            const designCard = result.design ? h('div', { class: 'cvr-design ap-card' }, [
                h('span', { class: 'cvr-kicker', text: 'Suggested design' }),
                h('p', { class: 'cvr-design-name' }, [
                    h('span', { class: 'cvr-design-no', text: 'No. ' + result.design.number }),
                    ' ' + result.design.name,
                    result.design.tag ? h('span', { class: 'cvr-tag' + (result.design.portalSafe ? ' is-portal' : ''), text: result.design.tag }) : null
                ]),
                result.design.line ? h('p', { class: 'cvr-design-line', text: result.design.line }) : null,
                safeHref(result.designLink) ? h('a', { class: 'ap-link', href: result.designLink }, 'See it in CV templates') : null,
                result.portal ? h('p', { class: 'cvr-portal', text: result.portal.text }) : null
            ]) : null;
            const lines = result.variants.length ? h('section', { class: 'cvr-variants-wrap' }, [
                h('h2', { class: 'ap-h2', text: 'Add these lines' }),
                h('ul', { class: 'cvr-variants' }, result.variants.map(variantCard))
            ]) : null;
            const thin = result.thinProof ? h('div', { class: 'cvr-note is-thin' }, [
                h('strong', { text: result.thinProof.label }), ' ' + result.thinProof.text + ' ',
                h('span', { class: 'cvr-note-links' }, linkList(result.thinProof.links))
            ]) : null;
            const unsure = result.unsure ? h('div', { class: 'cvr-note' }, [
                h('strong', { text: result.unsure.label }), ' ' + result.unsure.text + ' ',
                result.unsure.link ? h('span', { class: 'cvr-note-links' }, linkList([result.unsure.link])) : null
            ]) : null;
            const actions = h('div', { class: 'cvr-actions' }, [
                safeHref(result.seeIt.href) ? h('a', { class: 'ap-btn is-block', href: result.seeIt.href }, result.seeIt.label) : null,
                h('p', { class: 'cvr-saved', text: 'The CV Builder opens with this order and design.' })
            ]);
            const view = h('div', { class: 'cvr-result' }, [
                h('header', { class: 'cvr-result-head' }, [
                    h('span', { class: 'cvr-kicker', text: 'Your CV order' }),
                    title,
                    h('p', { class: 'cvr-reason', text: result.reason })
                ]),
                h('div', { class: 'cvr-result-grid' }, [
                    h('div', { class: 'cvr-col-paper' }, [paper(result)]),
                    h('div', { class: 'cvr-col-side' }, [
                        actions,
                        designCard,
                        thin,
                        unsure,
                        lines,
                        h('button', { type: 'button', class: 'ap-btn is-secondary is-block cvr-change', onclick: () => go(0) }, 'Change my answers')
                    ])
                ])
            ]);
            el.replaceChildren(view);
            if (focus) {
                try { title.focus({ preventScroll: true }); } catch (_) { title.focus(); }
                if (win.scrollTo) { try { win.scrollTo({ top: 0, behavior: 'auto' }); } catch (_) { /* jsdom */ } }
            }
        }

        function render(focus) {
            const quiz = state.view === 'quiz';
            if (opts.heroEl) opts.heroEl.classList.toggle('ap-hidden', !(quiz && state.step === 0));
            if (opts.mainEl) opts.mainEl.classList.toggle('is-wide', !quiz);
            if (quiz) renderQuiz(focus);
            else renderResult(focus);
        }

        loadFromStore();
        render(false);
        if (store && store.subscribe) {
            store.subscribe((value, meta) => {
                const source = meta && meta.source;
                if (touched || source === 'local') return;
                loadFromStore();
                render(false);
            });
        }
        return {
            state: () => JSON.parse(JSON.stringify(state)),
            render,
            go,
            finish
        };
    }

    return Object.freeze({
        TOOL, SITUATION_CODES, STRENGTHS, QUESTIONS, OWN_PROJECTS,
        cleanAnswers, ruleAnswers, isAnswered, firstUnanswered, isComplete, proofCount, tap,
        chooseSituation, personaliseOrder, leadBlock, variantIdsFor, variantsFor, thinProofFor,
        normaliseDesigns, suggestDesign, portalDesign, recommend, toCvPick, mount
    });
});
