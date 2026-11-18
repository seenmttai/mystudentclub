/**
 * MSC Articleship Program: the CV Builder's articleship stage (row 1.5).
 *
 * Pure logic shared by /cv-builder/?stage=articleship and its tests:
 * - the eight situations (A–H) as section orders, applied without touching the design or the content;
 * - the CV Recommender's pick (shared setting) read into a structure + a design;
 * - the designs kept for the look-book (numbered as in the look-book; all 62 layouts stay under "All"), each set in its
 *   own font and colour unless the student picks their own;
 * - "Start from the example" (each design's own fictional applicant) and "The Nothing CV" starters;
 * - earned Work Simulation lines imported into "Certifications and job simulations", with the count of outside
 *   certificates (house rule 2: four at most; MSC lines and ICITSS are not counted);
 * - the live, non-blocking checks of the articleship stage.
 *
 * Release switch: MSCArticleshipProgress.WORK_SIMULATION_LIVE (the one flag in scripts/articleship-progress.js, read
 * here as WORK_SIMULATION_LIVE; options.workSimulationLive overrides it per call). While false (release 1), the blank CV
 * has no Work Simulation line, releaseExamples() takes every Work Simulation line and sentence out of the applicants
 * (starters and thumbnails), and the checks never name it; the stage also stops reading and offering earned lines.
 *
 * Browser: window.MSCArticleshipCvBuilder. Node (tests): require('./scripts/articleship-cv-builder.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MSCArticleshipCvBuilder = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    // ---------- Release switch (shared: MSCArticleshipProgress.WORK_SIMULATION_LIVE) ----------
    function progressApi() {
        if (root && root.MSCArticleshipProgress) return root.MSCArticleshipProgress;
        if (typeof require === 'function') {
            try { return require('./articleship-progress.js'); } catch (_) { /* optional */ }
        }
        return null;
    }
    // Release 1 ships without the Work Simulation (row 1.6): nothing here offers it until the shared switch is true.
    const WORK_SIMULATION_LIVE = (() => {
        const progress = progressApi();
        return Boolean(progress && progress.WORK_SIMULATION_LIVE === true);
    })();

    /** The release one call draws: options.workSimulationLive (true or false) wins, else the shared switch. */
    function workSimulationLive(options) {
        return options && typeof options.workSimulationLive === 'boolean' ? options.workSimulationLive : WORK_SIMULATION_LIVE;
    }

    const CERT_TITLE = 'Certifications and job simulations';
    const OUTSIDE_CAP = 4;
    const PROGRAM_LINE_ONGOING = 'MSC Articleship Program (ongoing)';
    const PROGRAM_LINE_DONE = 'Completed MSC Articleship Program — foundational understanding of work and tasks across all domains';

    // The CV Builder's own section keys (cv-script.js BASE_SECTION_ORDER).
    const BUILDER_SECTIONS = ['summary', 'education', 'experience', 'projects', 'skills', 'certifications', 'achievements', 'leadership', 'interests'];

    // One vocabulary for the CV Recommender's pick, Choose your CV and the CV Builder (TL-M10): block ids → builder keys.
    const BLOCK_ALIASES = {
        header: null, personal: null, contact: null, name: null,
        objective: 'summary', summary: 'summary', 'career-objective': 'summary', profile: 'summary',
        education: 'education', academics: 'education', 'education-table': 'education', qualifications: 'education',
        icitss: 'education', 'itt-oc': 'education',
        work: 'experience', 'work-done': 'experience', 'work-experience': 'experience', experience: 'experience',
        internship: 'experience', internships: 'experience',
        projects: 'projects', project: 'projects', 'projects-and-simulations': 'projects',
        certifications: 'certifications', certificates: 'certifications', 'certifications-and-job-simulations': 'certifications',
        simulations: 'certifications', 'job-simulations': 'certifications', courses: 'certifications',
        roles: 'leadership', leadership: 'leadership', 'roles-and-activities': 'leadership', 'roles-and-achievements': 'leadership',
        'roles-and-extra-curriculars': 'leadership', 'extra-curriculars': 'leadership', extracurriculars: 'leadership',
        activities: 'leadership', 'positions-of-responsibility': 'leadership',
        achievements: 'achievements', awards: 'achievements', 'academic-highlights': 'achievements',
        skills: 'skills', 'skills-with-proof': 'skills',
        interests: 'interests', hobbies: 'interests'
    };

    const DEFAULT_TITLES = {
        summary: 'Career objective',
        education: 'Education',
        experience: 'Work experience',
        projects: 'Projects',
        skills: 'Skills',
        certifications: CERT_TITLE,
        achievements: 'Achievements',
        leadership: 'Roles and extra-curriculars',
        interests: 'Interests'
    };

    // Titles the builder or an earlier starter may have set on its own; anything else is the student's and is kept.
    const REPLACEABLE_TITLES = new Set([
        '', 'certifications', 'certification', 'certifications & courses', 'extracurriculars', 'extra-curriculars',
        'leadership', 'positions of responsibility', 'responsibility & extracurriculars', 'campus involvement',
        'leadership & extracurriculars', 'writing & extracurriculars', 'community work', 'sport / cultural achievement',
        'academic highlights', 'achievements & awards', 'achievements', 'experience', 'experience / articleship',
        'work experience', 'career objective', 'summary', 'professional summary', 'projects', 'skills', 'interests',
        'interests & hobbies', 'education', 'education & qualifications', 'roles and extra-curriculars',
        'roles and achievements', CERT_TITLE.toLowerCase()
    ]);

    // The eight situations (V3-STRUCTURE row 1.1; one list shared with the CV Recommender). Order = blocks after the
    // header; an empty block is never shown, so its place only matters once the student fills it.
    const SITUATIONS = Object.freeze([
        { id: 'A', name: 'Academics', label: 'Academics first',
          reason: 'Your marks are your loudest proof, so they sit on top with every Remark filled.',
          order: ['summary', 'education', 'achievements', 'certifications', 'leadership', 'skills', 'interests', 'projects', 'experience'] },
        { id: 'B', name: 'Groups separately', label: 'Groups cleared separately',
          reason: 'Show each group clearly and put your proof of improvement right under them.',
          order: ['summary', 'education', 'certifications', 'projects', 'experience', 'leadership', 'skills', 'achievements', 'interests'] },
        { id: 'C', name: 'Work experience', label: 'Work done first',
          reason: 'Real work beats everything at your stage. It goes right after your education.',
          order: ['summary', 'education', 'experience', 'certifications', 'skills', 'leadership', 'achievements', 'interests', 'projects'] },
        { id: 'D', name: 'Projects', label: 'Projects first',
          reason: 'Your projects show you can already do the work. They go right after your education.',
          order: ['summary', 'education', 'projects', 'certifications', 'skills', 'leadership', 'achievements', 'interests', 'experience'] },
        { id: 'E', name: 'Extra-curriculars', label: 'Roles first',
          reason: 'Your roles show you can own a task and handle people. They go right after your education.',
          order: ['summary', 'education', 'leadership', 'achievements', 'certifications', 'skills', 'interests', 'projects', 'experience'],
          titles: { leadership: 'Positions of responsibility' } },
        { id: 'F', name: 'Skills with proof', label: 'Skills first',
          reason: 'Your skills are your edge. Name the functions and put the proof next to each.',
          order: ['summary', 'education', 'skills', 'projects', 'certifications', 'achievements', 'leadership', 'interests', 'experience'] },
        { id: 'G', name: 'Direct entry', label: 'Graduate, direct entry',
          reason: 'No Foundation row for you. Your graduation row carries the Remarks.',
          order: ['summary', 'education', 'projects', 'certifications', 'leadership', 'achievements', 'skills', 'interests', 'experience'] },
        { id: 'H', name: 'Nothing yet', label: 'The Nothing CV',
          reason: 'One weekend gives you four certificates and a project line.',
          order: ['summary', 'education', 'certifications', 'projects', 'leadership', 'achievements', 'skills', 'interests', 'experience'] }
    ].map(Object.freeze));

    // Variant lines that sit on top of any situation (row 1.1), keyed loosely so any Recommender id maps.
    const VARIANTS = Object.freeze([
        { id: 'result-awaited', test: /await|g2|pending-result/, label: 'Result awaited',
          line: 'CA Intermediate Group II | [Year] | ICAI | Result awaited' },
        { id: 'exemption', test: /exempt/, label: 'Exemption, then the rest cleared',
          line: 'Remarks: Exemption in [paper]; remaining papers cleared [Month Year]' },
        { id: 'gap', test: /gap|year-out|missed|skipped/, label: 'A gap',
          line: 'No CV line unless you did real work in it. Ready answer: "[Month Year] to [Month Year] I [true reason]. Since then I have [what you completed]."' },
        { id: 'icitss', test: /icitss|itt|oc-/, label: 'ICITSS not done yet',
          line: 'ICITSS (OC + ITT) | ICAI | Ongoing, completes [Month Year]' },
        { id: 'distance', test: /distance|evening|open-university/, label: 'Distance B.Com',
          line: 'B.Com (distance learning) | [Years] | [University] | Pursuing (Year [N]: [score])' },
        { id: 'cs-cma', test: /(^|-)cs($|-)|cma|company-secretary|cost/, label: 'CA with CS or CMA',
          line: '[CS / CMA] [level] | [Year] | [Institute] | Pursuing' },
        { id: 'course', test: /cfa|course|degree|llb/, label: 'Another course',
          line: '[Course] | Registered, Level I exam [Month Year]' },
        { id: 'stopped', test: /stop|discontinu|dropped/, label: 'Degree stopped',
          line: 'B.Com | [University] | Discontinued after Year 1' }
    ].map(Object.freeze));

    const DOMAIN_SHORT = {
        'statutory-audit': 'Statutory audit', 'internal-audit': 'Internal audit', 'direct-tax': 'Direct tax', gst: 'GST',
        'bank-audit': 'Bank audit', 'transfer-pricing': 'Transfer pricing', 'ma-tax': 'M&A tax', valuation: 'Valuation',
        fdd: 'Financial due diligence', forensic: 'Forensic', consulting: 'Consulting', accounting: 'Accounting',
        'ib-er': 'Equity research'
    };

    const clone = value => (value === undefined ? value : JSON.parse(JSON.stringify(value)));
    const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

    function slug(value) {
        return String(value == null ? '' : value).trim().toLowerCase()
            .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    function plainText(value) {
        return String(value == null ? '' : value)
            .replace(/<br\s*\/?>|<\/(?:p|li|div)>/gi, ' ')
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;|&#160;/gi, ' ')
            .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
            .replace(/\s+/g, ' ').trim();
    }

    // ---------- Structure ----------

    /** A block id from any tool (Recommender, Choose your CV) → the builder's section key, or null for the header. */
    function toSectionKey(id) {
        const key = slug(id).replace(/^custom-?/, '');
        if (BUILDER_SECTIONS.includes(key)) return key;
        if (Object.prototype.hasOwnProperty.call(BLOCK_ALIASES, key)) return BLOCK_ALIASES[key];
        return undefined;
    }

    /** A list of block ids → builder section keys in order, duplicates and unknowns dropped. */
    function toBuilderOrder(order) {
        const out = [];
        (Array.isArray(order) ? order : []).forEach(id => {
            const key = toSectionKey(id);
            if (key && !out.includes(key)) out.push(key);
        });
        return out;
    }

    function getSituation(id, list) {
        const letter = String(id || '').trim().toUpperCase().charAt(0);
        return (Array.isArray(list) ? list : SITUATIONS).find(situation => situation.id === letter) || null;
    }

    /**
     * The CV Recommender's situations.json (the shared list, TL-M10) laid over the built-in eight: its names, reasons
     * and section orders win, so the Recommender, Choose your CV and the Builder say the same thing.
     */
    function mergeSituations(json) {
        const source = json && isObject(json.situations) ? json.situations : (isObject(json) ? json : {});
        return SITUATIONS.map(base => {
            const raw = source[base.id];
            if (!isObject(raw)) return base;
            const order = toBuilderOrder(raw.order);
            return Object.freeze(Object.assign({}, base, {
                name: plainText(raw.name) || base.name,
                reason: plainText(raw.reason) || base.reason,
                order: order.length >= 2 ? orderFor(base.id, order) : base.order
            }));
        });
    }

    /** The full order: the situation's (or the pick's) blocks first, then every other section and custom section. */
    function orderFor(situationId, pickOrder, customIds, list) {
        const situation = getSituation(situationId, list);
        const fromPick = toBuilderOrder(pickOrder);
        const primary = fromPick.length >= 2 ? fromPick : (situation ? situation.order : BUILDER_SECTIONS);
        const order = [];
        [...primary, ...(situation ? situation.order : []), ...BUILDER_SECTIONS].forEach(key => {
            if (BUILDER_SECTIONS.includes(key) && !order.includes(key)) order.push(key);
        });
        (customIds || []).forEach(id => { if (id && !order.includes(id)) order.push(id); });
        return order;
    }

    function setTitle(cv, key, title, force) {
        if (!isObject(cv.sectionTitles)) cv.sectionTitles = {};
        const current = String(cv.sectionTitles[key] || '').trim();
        if (force || REPLACEABLE_TITLES.has(current.toLowerCase())) cv.sectionTitles[key] = title;
        if (!isObject(cv.sectionLabels)) cv.sectionLabels = {};
        const label = cv.sectionLabels[key];
        const labelText = label && typeof label.text === 'string' ? label.text.trim() : '';
        if (['certifications', 'leadership', 'achievements', 'skills', 'interests'].includes(key)
            && (force || REPLACEABLE_TITLES.has(labelText.toLowerCase()))) {
            cv.sectionLabels[key] = { text: key === 'certifications' ? 'Certifications and simulations' : title, visible: label ? label.visible !== false : true };
        }
    }

    /** The articleship titles; certifications is always "Certifications and job simulations" (house rule 2). */
    function applyTitles(cv, situationId, list) {
        const situation = getSituation(situationId, list);
        const titles = Object.assign({}, DEFAULT_TITLES, situation && situation.titles);
        Object.keys(titles).forEach(key => setTitle(cv, key, titles[key], key === 'certifications'));
        return cv;
    }

    /**
     * Apply a structure (section order) without touching the design or any content. Returns a new CV object.
     * opts.order: the Recommender's block ids (they win when they name at least two blocks).
     * opts.situations: the merged situation list (mergeSituations).
     */
    function applyStructure(cvData, situationId, opts) {
        const options = opts || {};
        const cv = clone(cvData || {});
        const situation = getSituation(situationId, options.situations);
        const customIds = (Array.isArray(cv.customSections) ? cv.customSections : []).map(section => section && section.id).filter(Boolean);
        cv.sectionOrder = orderFor(situation && situation.id, options.order, customIds, options.situations);
        applyTitles(cv, situation && situation.id, options.situations);
        if (situation) cv.articleshipStructure = situation.id;
        return cv;
    }

    /**
     * What to do with the CV Recommender's saved pick on open: apply it once per pick (savedAt), never again after the
     * student changes the order or the design by hand. → { apply, situation, order, design, key } | null
     */
    function planPick(pick, designs, cv) {
        if (!isObject(pick) || !getSituation(pick.situation)) return null;
        const key = String(pick.savedAt || [pick.situation, pick.design, (pick.order || []).join('.')].join('|'));
        const design = resolveDesign(designs, pick.design);
        return {
            apply: !(cv && cv.articleshipPickApplied === key),
            situation: getSituation(pick.situation).id,
            order: Array.isArray(pick.order) ? pick.order.slice() : [],
            design,
            domain: pick.domain || null,
            key
        };
    }

    function variantsFor(ids) {
        const out = [];
        (Array.isArray(ids) ? ids : []).forEach(id => {
            const key = slug(id);
            const variant = VARIANTS.find(item => item.id === key) || VARIANTS.find(item => item.test.test(key));
            if (variant && !out.includes(variant)) out.push(variant);
        });
        return out;
    }

    // ---------- Designs (look-book numbers) ----------

    function stemOf(renderFile) {
        return String(renderFile || '').replace(/^.*\//, '').replace(/\.html$/i, '');
    }

    // STYLE.md "CVs and cover letters": one font per CV from these five (the builder's font menu has all five).
    const CV_FONTS = ['Arial', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman'];

    function cvFont(value) {
        const text = String(value || '').trim().toLowerCase().replace(/^times$/, 'times new roman');
        return CV_FONTS.find(font => font.toLowerCase() === text) || '';
    }

    /**
     * How a kept design is set on the page and in the exported file: its look-book font and colour (designs.json "font",
     * "accent"), unless the student picked their own in the font or colour menu. Nothing is stored on the CV, so every
     * thumbnail shows its own design's look and a change of design brings that design's font and colour with it.
     * → { font, accent } ('' = the layout's own).
     */
    function themeFor(cvData, design) {
        const cv = cvData || {};
        const ownFont = String(cv.themeFont || '').trim();
        const autoFont = String(cv.articleshipFontAuto || '').trim(); // set by an earlier build of this stage
        const ownAccent = hexColour(cv.themeAccent);
        return {
            font: ownFont && ownFont !== autoFont ? ownFont : ((design && design.font) || ''),
            accent: ownAccent || ((design && design.accent) || '')
        };
    }

    function letters(value) {
        return [].concat(value || []).map(item => String(item).trim().toUpperCase())
            .filter(item => /^[A-I]$/.test(item));
    }

    function hexColour(value) {
        const text = String(value || '').trim().replace(/^#/, '');
        return /^[0-9a-f]{6}$/i.test(text) ? `#${text.toUpperCase()}` : '';
    }

    /** "Strong marks: the education grid…" → "Strong marks" (the best-for words a small card shows). */
    function bestForLabel(design) {
        const line = design && design.line ? String(design.line) : '';
        const head = line.split(/:\s/)[0];
        return head && head.length < line.length && head.length <= 40 ? head : '';
    }

    /** The designs that suit an order: the ones made for it first, then the ones that also suit it, by number. */
    function designsFor(designs, situationId) {
        const letter = String(situationId || '').trim().toUpperCase().charAt(0);
        const list = Array.isArray(designs) ? designs : [];
        if (!letter) return [];
        return list.filter(design => design.situations.includes(letter))
            .concat(list.filter(design => !design.situations.includes(letter) && (design.also || []).includes(letter)));
    }

    /**
     * designs.json (row 1.4, the look-book's kept designs) → [{ number, id, name, file, renderFile, gallery, tag ('Print',
     * 'Portal-safe' or 'Screen'), portalSafe, screen, line, situations (the orders it is the pick for), also, persona,
     * example, font, accent }], by look-book number. Accepts { designs | kept | items: [] } or an array; a design names
     * its layout by renderFile / layout / file stem, or by its v2 gallery number (1–62).
     * galleryFiles: the 62 gallery layouts in gallery order ([{ file, renderFile, name }]).
     */
    function normaliseDesigns(json, galleryFiles) {
        const list = Array.isArray(json) ? json : (json && (json.designs || json.kept || json.items)) || [];
        const gallery = Array.isArray(galleryFiles) ? galleryFiles : [];
        const out = [];
        list.forEach((raw, index) => {
            if (!isObject(raw) || raw.kept === false || raw.drop === true) return;
            const number = Number(raw.number || raw.no || raw.lookbook || raw.design || index + 1);
            const galleryNo = Number(raw.gallery || raw.v2 || raw.galleryNumber || raw.layoutNumber || raw.source_number || 0) || null;
            let renderFile = raw.renderFile || raw.render_file || raw.layout || raw.template || raw.stem || '';
            if (!renderFile && typeof raw.file === 'string' && /\.html$|^articleship-layout-/.test(raw.file)) renderFile = raw.file;
            renderFile = String(renderFile).replace(/^.*\//, '').replace(/^articleship-layout-/, '');
            if (renderFile && !/\.html$/i.test(renderFile)) renderFile += '.html';
            if (!renderFile && galleryNo && gallery[galleryNo - 1]) renderFile = gallery[galleryNo - 1].renderFile;
            if (!renderFile) return;
            const fromGallery = gallery.find(item => item.renderFile === renderFile);
            if (gallery.length && !fromGallery) return; // not one of the 62 layouts the Builder can render
            const tags = []
                .concat(raw.tag || [], raw.tags || [], raw.label || [])
                .map(tag => String(tag).trim())
                .filter(Boolean);
            const portalSafe = raw.portalSafe === true || raw.portal_safe === true || tags.some(tag => /portal|ats/i.test(tag));
            const screen = !portalSafe && !tags.some(tag => /print/i.test(tag)) && tags.some(tag => /screen|pdf/i.test(tag));
            const situations = letters(raw.situations || raw.for || (Array.isArray(raw.bestFor) ? raw.bestFor : []));
            const also = letters(raw.also || raw.alsoFor || raw.also_for).filter(letter => !situations.includes(letter));
            const persona = letters(raw.persona || raw.applicant || raw.situation)[0] || situations[0] || null;
            const lineText = raw.line || raw.bestForLine || raw.best_for_line || raw.best || raw.best_for
                || (typeof raw.bestFor === 'string' ? raw.bestFor : '') || raw.reason || '';
            const example = [raw.example, raw.cv, raw.sample].find(item => isObject(item) && isObject(item.personal)) || null;
            const design = {
                number: Number.isFinite(number) && number > 0 ? Math.round(number) : index + 1,
                id: slug(raw.id || raw.slug || raw.name || stemOf(renderFile)),
                name: String(raw.name || raw.title || (fromGallery && fromGallery.name) || stemOf(renderFile)).trim(),
                file: (fromGallery && fromGallery.file) || `articleship-layout-${stemOf(renderFile)}`,
                renderFile,
                gallery: galleryNo || (fromGallery ? gallery.indexOf(fromGallery) + 1 : null),
                tag: portalSafe ? 'Portal-safe' : (screen ? 'Screen' : 'Print'),
                portalSafe,
                screen,
                line: plainText(lineText),
                situations,
                also,
                persona,
                example,
                font: cvFont(raw.font || raw.cvFont || raw.typeface),
                accent: hexColour(raw.accent || raw.acc || raw.colour || raw.color)
            };
            if (!out.some(item => item.file === design.file || item.number === design.number)) out.push(design);
        });
        return out.sort((a, b) => a.number - b.number);
    }

    /** A pick's design (number, "3", "Design 3", a file or a render file) → one of the designs, or null. */
    function resolveDesign(designs, ref) {
        if (ref === null || ref === undefined || ref === '') return null;
        const list = Array.isArray(designs) ? designs : [];
        const text = String(ref).trim();
        const number = Number((text.match(/^(?:design\s*)?(\d+)$/i) || [])[1]);
        if (number) return list.find(design => design.number === number) || null;
        const stem = stemOf(text).replace(/^articleship-layout-/, '');
        return list.find(design => design.file === text || design.id === slug(text) || stemOf(design.renderFile) === stem
            || slug(design.name) === slug(text)) || null;
    }

    function designForFile(designs, file) {
        return (Array.isArray(designs) ? designs : []).find(design => design.file === file) || null;
    }

    // ---------- Starters ----------

    /**
     * Each look-book design's own applicant (examples.json "designs": { "<number>": cv }) put on the design as its
     * example, unless designs.json already carries one inline. Returns the same designs.
     */
    function attachApplicants(designs, json) {
        const byDesign = json && (isObject(json.designs) ? json.designs : (isObject(json.byDesign) ? json.byDesign : null));
        (Array.isArray(designs) ? designs : []).forEach(design => {
            const cv = byDesign && byDesign[String(design.number)];
            if (!design.example && isObject(cv) && isObject(cv.personal)) design.example = cv;
            const letter = design.example && letters(design.example.situation)[0];
            if (letter) design.persona = letter;
        });
        return designs;
    }

    /** Every applicant (the letter personas and each design's own), for spotting lines still copied from one. */
    function allApplicants(examples, designs) {
        const out = Object.assign({}, examples || {});
        (Array.isArray(designs) ? designs : []).forEach(design => {
            if (design.example) out[`design-${design.number}`] = design.example;
        });
        return out;
    }

    /** The order an applicant's CV is set in: its situation; I (CA with CS or CMA) uses the Academics order. */
    function structureOf(letter) {
        const id = String(letter || '').trim().toUpperCase().charAt(0);
        if (id === 'I') return 'A';
        return getSituation(id) ? id : 'A';
    }

    /** examples.json → { A: cv, … }. Accepts { personas: { A: … } }, { A: … } or [{ id: 'A', cv: … }]. */
    function normaliseExamples(json) {
        const out = {};
        const source = json && (json.personas || json.examples) ? (json.personas || json.examples) : json;
        const entries = Array.isArray(source)
            ? source.map(item => [item && (item.id || item.persona || item.situation), item && (item.cv || item.data || item)])
            : Object.entries(source || {});
        entries.forEach(([id, cv]) => {
            const letter = String(id || '').trim().toUpperCase().charAt(0);
            if (/^[A-I]$/.test(letter) && isObject(cv) && isObject(cv.personal)) out[letter] = cv;
        });
        return out;
    }

    const META_KEYS = ['id', 'persona', 'situation', 'design', 'note', 'cv', 'data', 'templateFile', 'articleshipStarter',
        'articleshipExample', 'articleshipNothingCv', 'articleshipPickApplied', 'articleshipStructure', 'articleshipImported',
        'articleshipLayoutName', 'articleshipGallery', 'articleshipApplicant', 'articleshipOrderSet'];

    function stripMeta(cv) {
        const out = clone(cv);
        META_KEYS.forEach(key => { delete out[key]; });
        return out;
    }

    // The keys a starter fills; everything else on the CV (design, colours, table settings) is the student's.
    const CONTENT_KEYS = ['personal', 'summary', 'education', 'experience', 'projects', 'skills', 'certifications',
        'achievements', 'leadership', 'interests', 'customSections'];

    function emptyContent() {
        return {
            personal: { name: '', tagline: '', contact: '', phone: '', email: '', linkedin: '', location: '', socialLinks: [] },
            summary: '', education: [], experience: [], projects: [], skills: '', certifications: [],
            achievements: [], leadership: [], interests: [], customSections: []
        };
    }

    /** Put a starter's content on the CV; the design, colours, fonts and table settings stay as they are. */
    function withContent(cvData, content) {
        const cv = clone(cvData || {});
        const source = Object.assign(emptyContent(), clone(content || {}));
        CONTENT_KEYS.forEach(key => { cv[key] = source[key]; });
        ['sectionTitles', 'sectionLabels'].forEach(key => { cv[key] = isObject(source[key]) ? clone(source[key]) : {}; });
        if (!isObject(cv.sectionGroups)) cv.sectionGroups = {};
        return cv;
    }

    /** The persona a design shows in the look-book (its own applicant, else the first situation it is made for). */
    function personaFor(design, fallback) {
        const own = design && design.example && letters(design.example.situation)[0];
        if (own) return own;
        if (design && design.persona) return design.persona;
        if (design && design.situations && design.situations[0]) return design.situations[0];
        return fallback || 'A';
    }

    /**
     * "Start from the example": the fictional applicant's CV put on the student's CV. The design is never reset by a
     * starter. opts: { design (its inline example wins), structure, order, situations }.
     */
    function createExample(examples, personaId, cvData, opts) {
        const options = opts || {};
        const letter = String(personaId || '').trim().toUpperCase().charAt(0);
        const source = (options.design && options.design.example) || (examples && examples[letter]);
        if (!source) return null;
        const structure = options.structure || structureOf(source.situation || letter);
        let cv = withContent(cvData, stripMeta(source));
        cv = applyStructure(cv, structure, { order: options.order, situations: options.situations });
        cv.articleshipApplicant = true;
        cv.articleshipExample = letter;
        cv.articleshipStarter = `example:${letter}`;
        delete cv.articleshipNothingCv;
        return cv;
    }

    /** "The Nothing CV": persona H with structure H, on the student's current design. */
    function createNothingCv(examples, cvData, opts) {
        const cv = createExample(examples, 'H', cvData, Object.assign({}, opts, { structure: 'H', order: null, design: null }));
        if (!cv) return null;
        cv.articleshipNothingCv = true;
        cv.articleshipStarter = 'nothing';
        return cv;
    }

    // The empty block a blank CV still shows when its order leads with it (C work, D and F projects, E achievements), so
    // the student sees the order's shape at once (every gap a [bracket], to fill or delete). Fixed per letter, so a blank
    // is recognised whichever situations list is loaded.
    const LEAD_BLOCK = { C: 'experience', D: 'projects', E: 'achievements', F: 'projects' };
    const LEAD_PLACEHOLDERS = {
        experience: () => [{
            role: '[Role]', company: '[Firm or business], [City]', dates: '[Month Year] – [Month Year]', intro: '', category: '',
            bullets: ['[What you did, with a number]'], mergedWithPrevious: false, titleMergedWithPrevious: false
        }],
        projects: () => [{ title: '[Project]', description: '[For whom or where] | [Month Year]', bullets: ['[What you did, with a number]'] }],
        achievements: () => ['[Rank, prize or scholarship], [Year]: [out of how many]']
    };

    /**
     * The blank articleship CV a new student opens: every row in the articleship shape, every gap a [bracket], the
     * certifications section titled per house rule 2 with the programme line. ICITSS is a row of the education table
     * (house rule 2). With an order (A–H), the block it leads with is shown even when empty. The Work Simulation's line
     * is one of the gaps only once it is out (options.workSimulationLive, else the shared switch).
     */
    function blankContent(structureId, options) {
        const content = {
            personal: {
                name: '[Your name]', tagline: 'CA Intermediate cleared ([Month Year]) | Seeking articleship in [domain]', contact: '',
                phone: '', email: '', linkedin: '', location: '[City]', socialLinks: []
            },
            summary: '<p>CA Intermediate cleared ([both groups], [Month Year]); ICITSS [completed]. [Your best proof in one line, with a number]. Seeking articleship in [domain].</p>',
            education: [
                { degree: 'CA Intermediate (both groups)', year: '[Month Year]', institute: 'ICAI', marks: '[Marks]/600', remarks: '[Attempt; best paper]', mergedWithPrevious: false },
                { degree: 'ICITSS (OC + ITT)', year: '[Month Year]', institute: 'ICAI', marks: '[Completed / Ongoing]', remarks: '[An award or presentation, if any]', mergedWithPrevious: false },
                { degree: 'CA Foundation', year: '[Year]', institute: 'ICAI', marks: '[Marks]/400', remarks: '[Attempt]', mergedWithPrevious: false },
                { degree: 'B.Com', year: '[Years]', institute: '[University]', marks: '[CGPA or %]', remarks: '[Pursuing / Completed]', mergedWithPrevious: false },
                { degree: 'Class XII ([Board])', year: '[Year]', institute: '[School], [City]', marks: '[%]', remarks: '[Best subject score]', mergedWithPrevious: false },
                { degree: 'Class X ([Board])', year: '[Year]', institute: '[School], [City]', marks: '[%]', remarks: '[Rank with batch size, if any]', mergedWithPrevious: false }
            ],
            experience: [],
            projects: [],
            skills: '<p><strong>Excel ([level])</strong>: [functions you can show, e.g. XLOOKUP, PivotTables]</p><p><strong>Tally Prime ([level])</strong>: [what you can do in it]</p>',
            certifications: [
                workSimulationLive(options)
                    ? { name: '[Domain] Work Simulation, MSC Articleship Program | [Month Year]: [what you did, with your counts]', issuer: '' }
                    : null,
                { name: '[Company] [Simulation] Job Simulation (Forage) | [Month Year]: [what you did]', issuer: '' },
                { name: PROGRAM_LINE_ONGOING, issuer: '' }
            ].filter(Boolean),
            achievements: [],
            leadership: ['[Role], [society or event], [Year]: [what you did, with a number]'],
            interests: [],
            customSections: []
        };
        const lead = LEAD_BLOCK[String(structureId || '').trim().toUpperCase().charAt(0)];
        if (lead) content[lead] = LEAD_PLACEHOLDERS[lead]();
        return content;
    }

    /** Is this content one of the blank CVs (any order's, either release's)? */
    function isBlankContent(cvData) {
        return [false, true].some(live => [''].concat(Object.keys(LEAD_BLOCK))
            .some(letter => sameContent(cvData, blankContent(letter, { workSimulationLive: live }))));
    }

    /** opts: { structure, order, situations, workSimulationLive }. */
    function createBlank(cvData, opts) {
        const options = opts || {};
        const structure = options.structure || 'A';
        let cv = withContent(cvData, blankContent(structure, options));
        cv = applyStructure(cv, structure, { order: options.order, situations: options.situations });
        cv.articleshipApplicant = true;
        cv.articleshipStarter = 'blank';
        delete cv.articleshipExample;
        delete cv.articleshipNothingCv;
        return cv;
    }

    function contentText(value) {
        if (typeof value === 'string') return plainText(value).toLowerCase();
        if (Array.isArray(value)) return value.map(contentText).filter(Boolean);
        if (isObject(value)) {
            const out = {};
            Object.keys(value).sort().forEach(key => {
                if (key === 'mergedWithPrevious' || key === 'titleMergedWithPrevious') return;
                const text = contentText(value[key]);
                if ((Array.isArray(text) && text.length) || (!Array.isArray(text) && text)) out[key] = text;
            });
            return out;
        }
        return value;
    }

    function sameContent(a, b) {
        return CONTENT_KEYS.every(key => JSON.stringify(contentText(a && a[key])) === JSON.stringify(contentText(b && b[key])));
    }

    /**
     * Is the CV still a starter, untouched? → 'blank' | 'example' | 'nothing' | null (the student has written in it).
     * Used to show each design with its own applicant in the picker, and to replace a starter without asking.
     */
    function untouchedStarter(cvData, examples, designs) {
        const cv = cvData || {};
        if (!CONTENT_KEYS.some(key => {
            const text = contentText(cv[key]);
            return Array.isArray(text) ? text.length : (isObject(text) ? Object.keys(text).length : Boolean(text));
        })) return 'blank';
        const kind = String(cv.articleshipStarter || '');
        if (kind === 'blank' && isBlankContent(cv)) return 'blank';
        if (kind === 'nothing' && examples && examples.H && sameContent(cv, stripMeta(examples.H))) return 'nothing';
        const letter = (kind.match(/^example:([A-I])$/) || [])[1];
        if (letter) {
            const inline = (Array.isArray(designs) ? designs : []).filter(design => design.example && personaFor(design) === letter)
                .map(design => design.example);
            const sources = [examples && examples[letter], ...inline].filter(Boolean);
            if (sources.some(source => sameContent(cv, stripMeta(source)))) return 'example';
        }
        return null;
    }

    /** Lines still copied word for word from an example applicant (they are not the student's facts). */
    function exampleLeftovers(cvData, examples) {
        const cv = cvData || {};
        const mine = new Set();
        const collect = (target, value) => {
            if (typeof value === 'string') { const t = plainText(value).toLowerCase(); if (t.length > 24 && !/\[[^\]]*\]/.test(t)) target.add(t); }
            else if (Array.isArray(value)) value.forEach(item => collect(target, item));
            else if (isObject(value)) Object.entries(value).forEach(([key, item]) => { if (!['degree', 'institute', 'year', 'marks', 'remarks', 'issuer', 'mergedWithPrevious'].includes(key)) collect(target, item); });
        };
        // Certification lines are left out: the same simulation gives everyone the same line.
        const keys = ['summary', 'experience', 'projects', 'achievements', 'leadership', 'interests', 'customSections'];
        keys.forEach(key => collect(mine, cv[key]));
        const theirs = new Set();
        Object.values(examples || {}).forEach(example => keys.forEach(key => collect(theirs, example && example[key])));
        let count = 0;
        mine.forEach(line => { if (theirs.has(line)) count += 1; });
        const names = Object.values(examples || {}).map(example => plainText(example && example.personal && example.personal.name).toLowerCase()).filter(Boolean);
        const name = plainText(cv.personal && cv.personal.name).toLowerCase();
        return { lines: count, name: Boolean(name && names.includes(name)) };
    }

    /**
     * examples.json (or any applicant CV) for this release: before the Work Simulation is out, every applicant (the
     * letter personas and each design's own) without its Work Simulation lines, and without the sentences, clauses or
     * list items that name it (MSCArticleshipProgress.releaseContent). A copy; options: { workSimulationLive }.
     */
    function releaseExamples(json, options) {
        const progress = progressApi();
        if (!json || typeof json !== 'object' || !progress || typeof progress.releaseContent !== 'function') return json;
        return progress.releaseContent(json, { workSimulationLive: workSimulationLive(options) }) || {};
    }

    // ---------- Certifications and job simulations ----------

    function certText(item) {
        if (typeof item === 'string') return plainText(item);
        if (!isObject(item)) return '';
        const name = plainText(item.name || '');
        const issuer = plainText(item.issuer || '');
        return [name, issuer].filter(Boolean).join(name && issuer ? ' - ' : '');
    }

    /** A line that is still only the starter's frame: every word the student must write is a [bracket]. */
    function isPlaceholderOnly(text) {
        const value = String(text || '');
        if (!/\[[^\]]*\]/.test(value)) return false;
        const rest = value.replace(/\[[^\]]*\]/g, ' ')
            .replace(/work simulation|msc articleship program(me)?|job simulation|\(forage\)|forage|certificate|course/gi, ' ')
            .replace(/[|:;,.\-–—()\s]/g, '');
        return rest.length < 3;
    }

    /** 'msc-program' | 'msc-simulation' | 'icitss' | 'placeholder' | 'empty' | 'outside' (house rule 2). */
    function classifyCertification(item) {
        const text = certText(item);
        if (!text) return 'empty';
        if (isPlaceholderOnly(text)) return 'placeholder';
        if (/\bwork simulation\b/i.test(text) && /\bMSC\b/i.test(text)) return 'msc-simulation';
        if (/\bMSC Articleship Program(me)?\b/i.test(text)) return 'msc-program';
        if (/\bICITSS\b|\borientation course\b|\b(information technology|IT) training\b|\bITT\b/i.test(text)) return 'icitss';
        return 'outside';
    }

    function countCertificates(list) {
        const counts = { outside: 0, mscSimulation: 0, mscProgram: 0, icitss: 0, placeholder: 0, cap: OUTSIDE_CAP, over: false, simulationDomains: {} };
        (Array.isArray(list) ? list : []).forEach(item => {
            const kind = classifyCertification(item);
            if (kind === 'outside') counts.outside += 1;
            else if (kind === 'msc-simulation') {
                counts.mscSimulation += 1;
                const domain = (certText(item).match(/^(.*?)\s+work simulation/i) || [])[1];
                if (domain) {
                    const key = slug(domain);
                    counts.simulationDomains[key] = (counts.simulationDomains[key] || 0) + 1;
                }
            } else if (kind === 'msc-program') counts.mscProgram += 1;
            else if (kind === 'icitss') counts.icitss += 1;
            else if (kind === 'placeholder') counts.placeholder += 1;
        });
        counts.over = counts.outside > OUTSIDE_CAP;
        counts.label = `${counts.outside} of ${OUTSIDE_CAP} outside certificates`;
        return counts;
    }

    function domainLabel(domain) {
        const key = slug(domain);
        if (DOMAIN_SHORT[key]) return DOMAIN_SHORT[key];
        const text = String(domain || '').trim();
        return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
    }

    /** One earned line in house rule 2's format: "<Domain> Work Simulation, MSC Articleship Program | <Month Year>: <what you did>". */
    function formatEarnedLine(entry) {
        if (!isObject(entry)) return plainText(entry);
        const given = plainText(entry.line || entry.cvLine || entry.cv_line || entry.text || '');
        if (given) return given;
        const did = plainText(entry.did || entry.what || entry.summary || '');
        if (!did) return '';
        const domain = domainLabel(entry.domain || entry.domainLabel || '');
        const month = plainText(entry.month || entry.monthYear || entry.when || '[Month Year]');
        return `${domain} Work Simulation, MSC Articleship Program | ${month}: ${did}`;
    }

    /**
     * The Work Simulation's saved data (progress tool "work-simulation") → earned lines
     * [{ id, domain, level, line }]. Accepts earned / earnedLines / lines / cvLines arrays, a levels map with
     * earnedLine, and the "Add to my CV" queue (cvQueue). Duplicates (same text) are dropped.
     */
    function readEarnedLines(data) {
        if (!isObject(data)) return [];
        const raw = [];
        ['cvQueue', 'addToCv', 'earned', 'earnedLines', 'lines', 'cvLines'].forEach(key => {
            const value = data[key];
            if (Array.isArray(value)) value.forEach(item => raw.push(item));
            else if (isObject(value)) Object.entries(value).forEach(([id, item]) => raw.push(isObject(item) ? Object.assign({ id }, item) : { id, line: item }));
        });
        if (isObject(data.levels)) {
            Object.entries(data.levels).forEach(([id, level]) => {
                if (!isObject(level)) return;
                const line = level.earnedLine || level.cvLine || level.line;
                if (line && level.done !== false) raw.push({ id, domain: level.domain, level: level.title || level.name, line: typeof line === 'string' ? line : formatEarnedLine(line) });
            });
        }
        const seen = new Set();
        const out = [];
        raw.forEach((item, index) => {
            const line = formatEarnedLine(item);
            if (!line || !/work simulation/i.test(line)) return;
            const key = line.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            const domainText = (line.match(/^(.*?)\s+work simulation/i) || [])[1] || (isObject(item) ? item.domain : '') || '';
            out.push({
                id: String((isObject(item) && (item.id || item.levelId)) || `line-${index + 1}`),
                domain: slug(isObject(item) && item.domain ? item.domain : domainText),
                level: plainText(isObject(item) ? (item.level || item.title || '') : ''),
                line
            });
        });
        return out;
    }

    /**
     * The domain part of a Work Simulation line, lower-case: "gst work simulation" for "GST Work Simulation, MSC
     * Articleship Program | …"; '' for any other line (and for the blank CV's "[Domain] Work Simulation" gap).
     */
    function simulationPrefix(text) {
        const match = plainText(text).match(/^(.*?\bwork simulation),\s*MSC Articleship Program\b/i);
        return match && !/\[/.test(match[1]) ? match[1].trim().toLowerCase() : '';
    }

    function hasLine(cv, line) {
        const target = plainText(line).toLowerCase();
        return (cv && Array.isArray(cv.certifications) ? cv.certifications : []).some(item => certText(item).toLowerCase() === target
            || plainText(isObject(item) ? item.name : item).toLowerCase() === target);
    }

    /**
     * Add earned Work Simulation lines to "Certifications and job simulations". Never touches other sections or the
     * design; removes only untouched placeholder rows. Returns { cv, added, skipped, counts }.
     */
    function importEarnedLines(cvData, lines) {
        const cv = clone(cvData || {});
        if (!Array.isArray(cv.certifications)) cv.certifications = [];
        // Straight double quotes become curly ones: the builder writes each line into an input's value="…".
        const curly = text => String(text).replace(/"([^"]*)"/g, '\u201C$1\u201D').replace(/"/g, '\u201D');
        const incoming = (Array.isArray(lines) ? lines : [lines])
            .map(item => (isObject(item) ? item.line || formatEarnedLine(item) : plainText(item)))
            .filter(Boolean).map(curly);
        let added = 0;
        let skipped = 0;
        let replaced = 0;
        incoming.forEach(line => {
            if (hasLine(cv, line)) { skipped += 1; return; }
            // One line per domain: a newer line for a domain takes the place of the one the CV holds
            // ("<CV name>, MSC Articleship Program …", the Work Simulation's INTEGRATION.md §5).
            const prefix = simulationPrefix(line);
            const at = prefix ? cv.certifications.findIndex(item => classifyCertification(item) === 'msc-simulation'
                && simulationPrefix(certText(item)) === prefix) : -1;
            if (at !== -1) {
                cv.certifications[at] = Object.assign({}, isObject(cv.certifications[at]) ? cv.certifications[at] : {}, { name: line, issuer: '' });
                replaced += 1;
            } else cv.certifications.push({ name: line, issuer: '' });
            added += 1;
        });
        if (added) {
            cv.certifications = cv.certifications.filter(item => classifyCertification(item) !== 'placeholder' && classifyCertification(item) !== 'empty');
            // Earned lines sit under the program line's neighbours: MSC lines first, then outside certificates.
            const rank = item => ({ 'msc-simulation': 0, 'msc-program': 2 }[classifyCertification(item)] ?? 1);
            cv.certifications = cv.certifications.map((item, index) => ({ item, index }))
                .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index).map(entry => entry.item);
            if (!Array.isArray(cv.sectionOrder)) cv.sectionOrder = BUILDER_SECTIONS.slice();
            if (!cv.sectionOrder.includes('certifications')) cv.sectionOrder.splice(Math.min(3, cv.sectionOrder.length), 0, 'certifications');
            setTitle(cv, 'certifications', CERT_TITLE, true);
        }
        return { cv, added, skipped, replaced, counts: countCertificates(cv.certifications) };
    }

    // ---------- Live checks (non-blocking) ----------

    const RED_LIST = [
        { re: /\b(led|spearheaded|headed|handled)\b[^.;]{0,40}\baudits?\b/i, word: 'led the audit' },
        { re: /\bend[- ]to[- ]end audit/i, word: 'end-to-end audit' },
        { re: /\b(approved|authori[sz]ed|signed(?:\s+off)?)\b/i },
        { re: /(?<!varsity\s)\bcertified\b/i, word: 'certified' },
        { re: /\b(pioneered|leveraged|synergi[sz]ed|forged|enforced|arbitrated)\b/i },
        { re: /\bbasic knowledge of\b/i, word: 'basic knowledge of' },
        { re: /\b(hard[- ]?working|dedicated|keen learner|quick learner|team player)\b/i }
    ];

    function linesOf(cv) {
        const lines = [];
        const push = (section, text, raw) => { if (text !== undefined) lines.push({ section, text: plainText(text), raw: String(raw == null ? text : raw) }); };
        String(cv.summary || '').split(/<\/p>|<br\s*\/?>|\n/i).forEach(part => { if (plainText(part)) push('summary', part); });
        (cv.experience || []).forEach(entry => {
            if (!isObject(entry)) return;
            (entry.bullets || []).forEach(bullet => push('experience', bullet));
        });
        (cv.projects || []).forEach(entry => {
            if (!isObject(entry)) return;
            (entry.bullets || []).forEach(bullet => push('projects', bullet));
        });
        ['achievements', 'leadership', 'interests'].forEach(key => (cv[key] || []).forEach(item => push(key, item)));
        (cv.certifications || []).forEach(item => push('certifications', certText(item), isObject(item) ? item.name : item));
        (cv.customSections || []).forEach(section => (section && section.items || []).forEach(item => push('custom', item)));
        return lines;
    }

    function allText(cv) {
        const parts = [];
        const walk = value => {
            if (typeof value === 'string') parts.push(plainText(value));
            else if (Array.isArray(value)) value.forEach(walk);
            else if (isObject(value)) Object.entries(value).forEach(([key, item]) => {
                if (['tableSettings', 'sectionOrder', 'sectionLabels', 'sectionGroups', 'templateFile', 'themeAccent', 'themeFont',
                    'articleshipStarter', 'articleshipLayoutName', 'articleshipExample', 'articleshipStructure', 'articleshipPickApplied', 'id'].includes(key)) return;
                walk(item);
            });
        };
        walk({ personal: cv.personal, summary: cv.summary, education: cv.education, experience: cv.experience, projects: cv.projects,
            skills: cv.skills, certifications: cv.certifications, achievements: cv.achievements, leadership: cv.leadership,
            interests: cv.interests, customSections: cv.customSections });
        return parts.join('\n');
    }

    const MONTHS_SHORT = 'jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
    // "May" is the same written either way, so it never decides the style.
    const MONTHS_LONG = 'january|february|march|april|june|july|august|september|october|november|december';

    /**
     * Non-blocking flags (row 1.5): [{ id, text }], most useful first. Text is short and says the fix.
     * options: { examples, overflow, workSimulationLive }.
     */
    function checkCv(cvData, options) {
        const cv = cvData || {};
        const opts = options || {};
        const flags = [];
        const add = (id, text) => { if (!flags.some(flag => flag.id === id)) flags.push({ id, text }); };
        const text = allText(cv);
        const lines = linesOf(cv);

        if (opts.examples) {
            const left = exampleLeftovers(cv, opts.examples);
            if (left.name) add('example-details', 'Put your own name, phone, email and LinkedIn in place of the example\'s.');
            if (left.lines) add('example-lines', `${left.lines} line${left.lines === 1 ? ' is' : 's are'} still the example's: write your own or delete ${left.lines === 1 ? 'it' : 'them'}.`);
        }

        const brackets = (text.match(/\[[^\]\n]{1,80}\]/g) || []).length + (text.match(/\bXXX\b/g) || []).length;
        if (brackets) add('brackets', `Fill or delete ${brackets} [bracket]${brackets === 1 ? '' : 's'}.`);

        const emptyBullets = ['experience', 'projects'].reduce((sum, key) => sum + (cv[key] || [])
            .reduce((inner, entry) => inner + ((isObject(entry) && Array.isArray(entry.bullets)) ? entry.bullets.filter(bullet => !plainText(bullet)).length : 0), 0), 0)
            + ['achievements', 'leadership', 'interests'].reduce((sum, key) => sum + (cv[key] || []).filter(item => !plainText(item)).length, 0);
        if (emptyBullets) add('empty-bullet', `Delete ${emptyBullets} empty bullet${emptyBullets === 1 ? '' : 's'}.`);

        const counts = countCertificates(cv.certifications);
        if (counts.over) add('cap', `${counts.outside} outside certificates: keep your best ${OUTSIDE_CAP}. MSC lines don't count.`);
        if (counts.icitss) add('icitss-cert', 'ICITSS goes in your education table, not in certifications.');
        if (workSimulationLive(opts) && Object.values(counts.simulationDomains).some(count => count > 1)) {
            add('one-per-domain', 'One Work Simulation line per domain: keep your best.');
        }

        (cv.experience || []).forEach(entry => {
            if (!isObject(entry)) return;
            const blob = plainText([entry.role, entry.company, entry.category, entry.intro, ...(entry.bullets || [])].join(' '));
            if (/simulation|forage|virtual (work )?experience|virtual intern/i.test(blob)) {
                add('simulation-experience', `Move simulations from Experience to "${CERT_TITLE}".`);
            }
        });

        (cv.education || []).forEach(row => {
            if (!isObject(row)) return;
            const awaited = /result awaited/i.test([row.year, row.marks, row.remarks, row.degree].join(' '));
            const marks = String(row.marks || '').replace(/\[[^\]]*\]/g, '');
            if (awaited && /\d/.test(marks)) add('awaited-score', 'A row says "Result awaited": remove its score.');
        });

        lines.forEach(line => {
            if (line.section === 'certifications' && /^(MSC|Completed MSC)/.test(line.text)) return;
            for (const item of RED_LIST) {
                const match = line.text.match(item.re);
                if (match) { add(`red-${slug(item.word || match[0])}`, `Change "${item.word || match[0].toLowerCase()}": a trainee doesn't write it.`); break; }
            }
            if (/\bresponsible for\b/i.test(line.text)) add('responsible', 'Start with a verb, not "Responsible for".');
            if (/(^|[.;:]\s*)I (am|have|was|did|worked|completed|led|handled|prepared|learnt|learned|want|wish|would|will|also)\b/.test(line.text)) add('first-person', 'Drop "I": start each line with the verb.');
            if (/\bparticipated\b/i.test(line.text) && !/\b(winner|won|runner|finalist|rank|top|presented|placed|position|\d)/i.test(line.text)) {
                add('participated', '"Participated" alone says nothing: write what you did there.');
            }
            if (/(prepar|finalis|draft)\w*[^.;]{0,30}(financial statements|final accounts|books of accounts)/i.test(line.text)
                && /\baudit/i.test(line.text) && /client/i.test(line.text)) {
                add('independence', 'An auditor can\'t prepare its audit client\'s accounts: write what you checked.');
            }
            const bold = (line.raw.match(/<(strong|b)>/gi) || []).length;
            if (bold > 2) add('bold', 'Bold one or two fragments a line at most.');
        });

        const verbs = {};
        lines.filter(line => ['experience', 'projects', 'leadership', 'achievements'].includes(line.section)).forEach(line => {
            const verb = (line.text.match(/^([A-Za-z]+)/) || [])[1];
            if (verb && verb.length > 3) verbs[verb.toLowerCase()] = (verbs[verb.toLowerCase()] || 0) + 1;
        });
        const repeated = Object.entries(verbs).find(([, count]) => count >= 3);
        if (repeated) add('same-verb', `"${repeated[0].charAt(0).toUpperCase() + repeated[0].slice(1)}" starts ${repeated[1]} lines: vary the verbs.`);

        const dateText = text.replace(/\[[^\]]*\]/g, '');
        const styles = new Set();
        if (new RegExp(`\\b(${MONTHS_SHORT})\\.?\\s*'?\\d{2,4}\\b`, 'i').test(dateText)) styles.add('short');
        if (new RegExp(`\\b(${MONTHS_LONG})\\s+\\d{4}\\b`, 'i').test(dateText)) styles.add('long');
        if (/\b(0?[1-9]|1[0-2])[/-](19|20)\d{2}\b/.test(dateText)) styles.add('numeric');
        if (styles.size > 1) add('months', 'Write every month the same way, e.g. "Mar 2026".');

        if (cv.themeFont && !cvFont(cv.themeFont)) add('font', `Use one font a firm's laptop has: ${CV_FONTS.slice(0, -1).join(', ')} or ${CV_FONTS.at(-1)}.`);

        if (opts.overflow) flags.unshift({ id: 'one-page', text: 'It no longer fits one page, so the text is shrinking. Cut your weakest lines.' });
        return flags;
    }

    // ---------- AI guard (row 1.5-2) ----------
    const AI_GUARD = 'AI may reword your facts. It may not add a fact, a number, a client, a tool or a result. Where a number is missing it writes [ADD], and you fill it from your own records.';

    // ---------- The MSC programme line (B7: Padam's exact wording once done) ----------

    /** 'ongoing' | 'done' | null: which programme line the CV carries. */
    function programLine(cvData) {
        const list = cvData && Array.isArray(cvData.certifications) ? cvData.certifications : [];
        if (list.some(item => plainText(isObject(item) ? item.name : item) === PROGRAM_LINE_DONE)) return 'done';
        if (list.some(item => classifyCertification(item) === 'msc-program')) return 'ongoing';
        return null;
    }

    /** Swap "MSC Articleship Program (ongoing)" for Padam's completed line (or add it). Returns a new CV. */
    function useCompletedLine(cvData) {
        const cv = clone(cvData || {});
        if (!Array.isArray(cv.certifications)) cv.certifications = [];
        const index = cv.certifications.findIndex(item => classifyCertification(item) === 'msc-program');
        if (index === -1) cv.certifications.push({ name: PROGRAM_LINE_DONE, issuer: '' });
        else cv.certifications[index] = Object.assign({}, isObject(cv.certifications[index]) ? cv.certifications[index] : {}, { name: PROGRAM_LINE_DONE, issuer: '' });
        return cv;
    }

    return Object.freeze({
        CERT_TITLE, OUTSIDE_CAP, PROGRAM_LINE_ONGOING, PROGRAM_LINE_DONE, BUILDER_SECTIONS, DEFAULT_TITLES, CONTENT_KEYS,
        SITUATIONS, VARIANTS, AI_GUARD, WORK_SIMULATION_LIVE, workSimulationLive, releaseExamples,
        plainText, toSectionKey, toBuilderOrder, getSituation, mergeSituations, orderFor, applyStructure, applyTitles,
        variantsFor, planPick,
        normaliseDesigns, resolveDesign, designForFile, designsFor, bestForLabel, personaFor, CV_FONTS, cvFont, themeFor,
        normaliseExamples, attachApplicants, allApplicants, structureOf,
        createExample, createNothingCv, createBlank, blankContent, isBlankContent, withContent, untouchedStarter,
        exampleLeftovers,
        classifyCertification, countCertificates, formatEarnedLine, readEarnedLines, importEarnedLines, domainLabel,
        programLine, useCompletedLine,
        checkCv
    });
});
