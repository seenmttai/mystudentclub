/**
 * MSC Articleship Program: Domain roadmaps (Day 5, row 5.1).
 *
 * One card per domain (the 13 in MSCArticleshipProgress.DOMAINS), in MSCIT's Domain.docx pattern: what an article does
 * (first three months, later) · who it suits · pros · cons · where it leads, then pairs well with, busy season, five
 * likely questions (→ the booklet, and a mock interview on them), Work Simulation levels and the line they earn, free
 * picks, the paid option for later, and three jumps: Experience Explorer (?domain=), Top 100 Articleship Firms and a LinkedIn
 * people search. The same jumps sit in one line under the card's name, so a student who knows the domain needs no scroll.
 * Tiles follow the content's `groups` (where most articles work, then the specialist teams; MSC's experience data).
 *
 * Anchors: /articleship-program/domain-roadmaps/#<slug> (also ?domain=<slug or alias>). "My domain" and the backup are
 * the shared setting every programme tool reads (MSCArticleshipProgress.setMyDomain).
 *
 * Content: articleship-program/domain-roadmaps/roadmaps.json. normalise() accepts the field names a content build is
 * likely to use (see the alias lists below), drops unsafe links and never renders text as HTML.
 *
 * Release switch: MSCArticleshipProgress.WORK_SIMULATION_LIVE (the one flag in scripts/articleship-progress.js, read
 * here as WORK_SIMULATION_LIVE). While false (release 1), nothing on the page points at the Work Simulation: the "Earn
 * the CV line" part (levels, the line, the link) stays hidden, and any other line of the content that names it loses
 * that sentence (MSCArticleshipProgress.releaseContent). Release 2 flips the shared flag.
 *
 * Wiring (data only, no code change): `unbuilt` = the course rows whose file is not uploaded yet; every jump to one of
 * them is hidden (never a dead link, never "coming soon"). Remove a row from it once its file is in the course.
 * `links.workSimulation` = the Work Simulation page once it is on the site (each level then opens itself:
 * ?domain=<slug>&level=<id>); while it is null one link opens Day 1, where its row sits. `links.firms` = the Firms by
 * domain Sheet's view link once it exists; while null, Day 5's row. `booklet.page` = the page where the card's questions
 * start in its Day 4 booklet (`booklet.find` names that heading; the intro link has the same two fields).
 *
 * Browser: window.MSCArticleshipRoadmaps. Node (tests): require('./scripts/articleship-domain-roadmaps.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCArticleshipRoadmaps = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const PATHS = Object.freeze({
        page: '/articleship-program/domain-roadmaps/',
        content: '/articleship-program/domain-roadmaps/roadmaps.json',
        icons: '/articleship-program/domain-roadmaps/icons/',
        explorer: '/articleship-program/experience-explorer/',
        workSimulation: '/articleship-program/work-simulation/',
        practise: '/ai-interview.html?mode=articleship'
    });

    // Release 1 ships without the Work Simulation (Padam, 20 Oct): its part of every card stays hidden until the shared
    // switch (MSCArticleshipProgress.WORK_SIMULATION_LIVE) is true.
    const WORK_SIMULATION_LIVE = platformWorkSimulationLive();

    // What each free pick is, said plainly beside "First pick" / "Second pick".
    const PICK_KINDS = Object.freeze({
        simulation: 'Simulation', classes: 'Free classes', tutorial: 'Official tutorial', videos: 'Official videos',
        module: 'Free module', reading: 'Free reading'
    });

    // Fallbacks used when the content file leaves a field out.
    const DEFAULT_ICONS = Object.freeze({
        'statutory-audit': 'magnifier', 'internal-audit': 'flow', 'direct-tax': 'calculator', 'gst': 'receipt',
        'bank-audit': 'clipboard', 'transfer-pricing': 'groups', 'ma-tax': 'scissors', 'valuation': 'seedling',
        'fdd': 'sheet', 'forensic': 'flag', 'consulting': 'bulb', 'accounting': 'ledger', 'ib-er': 'briefcase'
    });
    const ICON_NAMES = Object.freeze(Object.values(DEFAULT_ICONS));

    // Day 4 booklet that answers each card's questions (row titles in build/lms/lms-rows.json). Consulting has no
    // booklet: its card carries the answer outlines itself.
    const DEFAULT_BOOKLETS = Object.freeze({
        'statutory-audit': 'Statutory audit booklet', 'internal-audit': 'Internal audit booklet',
        'direct-tax': 'Direct tax booklet', 'gst': 'GST booklet', 'bank-audit': 'Specialist teams booklet',
        'transfer-pricing': 'Specialist teams booklet', 'ma-tax': 'Specialist teams booklet',
        'valuation': 'Specialist teams booklet', 'fdd': 'Specialist teams booklet', 'forensic': 'Specialist teams booklet',
        'consulting': null, 'accounting': 'Core accounting booklet', 'ib-er': 'Specialist teams booklet'
    });

    // LinkedIn people search: articles ("Article Assistant" OR "CA Finalist", D3-2) in the domain, India preloaded.
    const DEFAULT_LINKEDIN = Object.freeze({
        'statutory-audit': '"statutory audit"', 'internal-audit': '"internal audit" OR "risk advisory"',
        'direct-tax': '"direct tax" OR "income tax"', 'gst': 'GST OR "indirect tax"',
        'bank-audit': '"bank audit" OR "concurrent audit"', 'transfer-pricing': '"transfer pricing"',
        'ma-tax': '"M&A tax"', 'valuation': 'valuation', 'fdd': '"due diligence"', 'forensic': 'forensic',
        'consulting': 'consulting OR "risk advisory"', 'accounting': 'accounting OR MIS OR "company law"',
        'ib-er': '"equity research" OR "investment banking"'
    });
    const LINKEDIN_PEOPLE = 'https://www.linkedin.com/search/results/people/';
    const LINKEDIN_INDIA = '["102713980"]';
    const ARTICLE_TITLES = '"article assistant" OR "CA Finalist"';

    const FIRMS_TITLE = 'Top 100 Articleship Firms'; // Padam's sheet (B9); it replaced Firms by domain on Day 5
    const FIRMS_DAY = 5;
    const BOOKLET_DAY = 4;
    const WORK_SIMULATION_TITLE = 'Work Simulation';
    const WORK_SIMULATION_DAY = 1;

    // ---------- dependencies (globals in the page, require() in node) ----------
    function dependency(globalName, path) {
        if (root && root[globalName]) return root[globalName];
        if (typeof require === 'function') {
            try { return require(path); } catch (_) { /* not available */ }
        }
        return null;
    }
    function progressApi() { return dependency('MSCArticleshipProgress', './articleship-progress.js'); }
    function lmsApi() { return dependency('MSCArticleshipLms', './articleship-lms.js'); }
    /** The release switch every tool reads; false without the platform script. */
    function platformWorkSimulationLive() {
        const progress = progressApi();
        return Boolean(progress && progress.WORK_SIMULATION_LIVE === true);
    }

    const FALLBACK_DOMAINS = Object.freeze([
        ['statutory-audit', 'Statutory audit'], ['internal-audit', 'Internal audit, risk & IFC'], ['direct-tax', 'Direct tax'],
        ['gst', 'GST'], ['bank-audit', 'Bank audit'], ['transfer-pricing', 'Transfer pricing'], ['ma-tax', 'M&A tax'],
        ['valuation', 'Valuation'], ['fdd', 'Financial due diligence'], ['forensic', 'Forensic'],
        ['consulting', 'Consulting & risk advisory'], ['accounting', 'Accounting, MIS & company law'], ['ib-er', 'IB & equity research']
    ].map(([slug, label]) => Object.freeze({ slug, label })));

    function domains() {
        const P = progressApi();
        return P && Array.isArray(P.DOMAINS) && P.DOMAINS.length ? P.DOMAINS : FALLBACK_DOMAINS;
    }

    function slugify(value) {
        return String(value == null ? '' : value).trim().toLowerCase()
            .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    /** Any label, slug or alias → canonical slug, or null. */
    function toSlug(value) {
        const P = progressApi();
        if (P && typeof P.normaliseDomain === 'function') return P.normaliseDomain(value);
        const slug = slugify(value);
        const found = FALLBACK_DOMAINS.find(d => d.slug === slug || slugify(d.label) === slug);
        return found ? found.slug : null;
    }

    function labelOf(slug) {
        const found = domains().find(d => d.slug === slug);
        return found ? found.label : '';
    }

    // ---------- text and links ----------
    function text(value) {
        if (value === undefined || value === null) return '';
        if (typeof value === 'object') return '';
        // eslint-disable-next-line no-control-regex
        return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
    }

    function list(value, itemText) {
        const read = itemText || text;
        if (value === undefined || value === null || value === '') return [];
        const items = Array.isArray(value) ? value : [value];
        return items.map(read).filter(Boolean);
    }

    function pick(obj, keys) {
        if (!obj || typeof obj !== 'object') return undefined;
        for (const key of keys) {
            const value = obj[key];
            if (value === undefined || value === null) continue;
            if (typeof value === 'string' && !value.trim()) continue;
            if (Array.isArray(value) && !value.length) continue;
            return value;
        }
        return undefined;
    }

    /** Only same-site paths, in-page anchors and https links ever render. */
    function safeHref(value) {
        const href = text(value);
        if (!href) return '';
        if (/^\/(?!\/)/.test(href) || href.startsWith('#') || href.startsWith('?')) return href;
        if (/^https:\/\/[^\s"'<>]+$/i.test(href)) return href;
        return '';
    }

    function isExternal(href) {
        return /^https:\/\//i.test(href) && !/^https:\/\/(www\.|mobile\.)?mystudentclub\.com(\/|$)/i.test(href);
    }

    // ---------- link builders ----------
    function resourceHref(day, title, page) {
        const L = lmsApi();
        if (L && typeof L.resourceLink === 'function') return L.resourceLink(day, title || '', page);
        const params = new URLSearchParams({ course: 'msc-articleship-program', session: String(Number(day) + 1) });
        if (title) params.set('resource', String(title));
        if (title && Number(page) > 1) params.set('page', String(Number(page)));
        return '/learning-management-system/course?' + params.toString();
    }

    function explorerHref(slug, options) {
        const opts = options || {};
        const params = new URLSearchParams();
        const domain = opts.domain === undefined ? slug : (opts.domain ? (toSlug(opts.domain) || '') : '');
        if (domain) params.set('domain', domain);
        if (text(opts.city)) params.set('city', text(opts.city));
        if (text(opts.q)) params.set('q', text(opts.q));
        const query = params.toString();
        return PATHS.explorer + (query ? '?' + query : '');
    }

    /** A level's own link on the Work Simulation page (`base` = links.workSimulation, default its folder). */
    function levelHref(slug, levelId, base) {
        const params = new URLSearchParams({ domain: slug });
        const id = slugify(levelId);
        if (id) params.set('level', id);
        return (safeHref(base) || PATHS.workSimulation) + '?' + params.toString();
    }

    /** A technical-round mock on this domain in Practise your interview (`base` = links.practise). */
    function practiseHref(slug, base) {
        const href = safeHref(base) || PATHS.practise;
        const [path, query] = href.split('?');
        const params = new URLSearchParams(query || '');
        if (!params.has('mode')) params.set('mode', 'articleship');
        params.set('round', 'technical');
        if (slug) params.set('domain', slug);
        return path + '?' + params.toString();
    }

    function linkedinHref(keywords) {
        const words = text(keywords);
        const query = words ? '(' + ARTICLE_TITLES + ') AND (' + words + ')' : ARTICLE_TITLES;
        return LINKEDIN_PEOPLE + '?keywords=' + encodeURIComponent(query) + '&geoUrn=' + encodeURIComponent(LINKEDIN_INDIA);
    }

    function linkFrom(raw, fallbackLabel) {
        if (!raw) return null;
        if (typeof raw === 'string') {
            const href = safeHref(raw);
            return href ? { label: fallbackLabel || href, href, external: isExternal(href) } : null;
        }
        if (typeof raw !== 'object') return null;
        let href = '';
        let row = null;
        const resource = raw.resource;
        if (resource && typeof resource === 'object' && Number.isInteger(Number(resource.day))) {
            const day = Number(resource.day);
            if (day >= 0 && day <= 6) {
                const page = Math.max(1, Math.floor(Number(resource.page)) || 1);
                row = { day, title: text(resource.title), page, find: text(pick(resource, ['find', 'part', 'section'])) };
                href = resourceHref(day, row.title, page);
            }
        }
        if (!href) href = safeHref(pick(raw, ['href', 'url', 'link']));
        if (!href) return null;
        const label = text(pick(raw, ['label', 'title', 'name', 'text'])) || fallbackLabel || href;
        return { label, href, external: isExternal(href), row };
    }

    /** "4|GST booklet" for a course row; the `unbuilt` list is a Set of these. */
    function rowKey(day, title) { return Number(day) + '|' + text(title).toLowerCase(); }

    /** Content `unbuilt` (rows whose file is not in the course yet) → Set of row keys. */
    function unbuiltRows(raw) {
        const keys = new Set();
        (Array.isArray(raw) ? raw : []).forEach(item => {
            if (!item || typeof item !== 'object') return;
            const day = Number(item.day);
            const title = text(pick(item, ['title', 'resource', 'name']));
            if (Number.isInteger(day) && day >= 0 && day <= 6 && title) keys.add(rowKey(day, title));
        });
        return keys;
    }

    // ---------- normalise ----------
    function normaliseWhat(raw) {
        if (!raw) return { first: [], later: [], note: '' };
        if (typeof raw === 'string' || Array.isArray(raw)) return { first: list(raw), later: [], note: '' };
        return {
            first: list(pick(raw, ['first', 'first_three_months', 'first_3_months', 'firstThreeMonths', 'start', 'early', 'now'])),
            later: list(pick(raw, ['later', 'after', 'later_on', 'laterOn', 'year_two', 'then'])),
            note: text(pick(raw, ['note', 'also', 'line', 'extra']))
        };
    }

    function normaliseLeads(raw) {
        if (!raw) return { text: '', easier: '' };
        if (typeof raw === 'string') return { text: text(raw), easier: '' };
        if (Array.isArray(raw)) return { text: list(raw).join(' · '), easier: '' };
        const main = pick(raw, ['text', 'exits', 'next', 'where', 'roles']);
        return {
            text: Array.isArray(main) ? list(main).join(' · ') : text(main),
            easier: text(pick(raw, ['easier', 'makes_it_easier', 'helps', 'easier_with']))
        };
    }

    /** "Question" or { q, a }: a = a short answer outline, only where no booklet answers the card. */
    function normaliseQuestion(item) {
        if (typeof item === 'string') return text(item) ? { q: text(item), a: '' } : null;
        const q = text(pick(item, ['q', 'question', 'text', 'title']));
        if (!q) return null;
        return { q, a: text(pick(item, ['a', 'answer', 'outline', 'how'])) };
    }

    /** Levels link to themselves only when the Work Simulation page is wired (`wsBase`); otherwise href is ''. */
    function normaliseLevels(raw, slug, wsBase) {
        return (Array.isArray(raw) ? raw : (raw ? [raw] : [])).map((item, i) => {
            const title = typeof item === 'string' ? text(item) : text(pick(item, ['title', 'label', 'name']));
            if (!title) return null;
            const id = (item && typeof item === 'object' && text(pick(item, ['id', 'level', 'slug']))) || slugify(title) || (slug + '-' + (i + 1));
            const custom = item && typeof item === 'object' ? safeHref(pick(item, ['href', 'url'])) : '';
            return { id: slugify(id), title, href: custom || (wsBase ? levelHref(slug, id, wsBase) : '') };
        }).filter(Boolean);
    }

    function normalisePicks(raw) {
        return (Array.isArray(raw) ? raw : (raw ? [raw] : [])).map(item => {
            if (!item || typeof item !== 'object') return null;
            const label = text(pick(item, ['label', 'name', 'title']));
            if (!label) return null;
            const href = safeHref(pick(item, ['href', 'url', 'link']));
            const kind = slugify(pick(item, ['kind', 'type']));
            return {
                label, href, external: href ? isExternal(href) : false,
                kind: PICK_KINDS[kind] ? kind : '',
                note: text(pick(item, ['note', 'why', 'text', 'what']))
            };
        }).filter(Boolean);
    }

    /** Extra lines; a link to a course row not in the course yet is dropped (the line itself stays). */
    function normaliseExtra(raw, isLive) {
        return (Array.isArray(raw) ? raw : (raw ? [raw] : [])).map(item => {
            if (typeof item === 'string') return text(item) ? { text: text(item), link: null } : null;
            if (!item || typeof item !== 'object') return null;
            const body = text(pick(item, ['text', 'line', 'note']));
            if (!body) return null;
            const link = linkFrom(item.link || null);
            return { text: body, link: link && isLive(link) ? link : null };
        }).filter(Boolean);
    }

    function normaliseDomainCard(raw, defaults, warnings) {
        const slug = toSlug(pick(raw, ['slug', 'id', 'domain', 'key'])) || toSlug(pick(raw, ['label', 'title', 'name']));
        if (!slug) { warnings.push('Unknown domain: ' + text(pick(raw, ['slug', 'id', 'label', 'title']))); return null; }
        const label = text(pick(raw, ['label', 'title', 'name'])) || labelOf(slug);
        const iconName = slugify(pick(raw, ['icon']));
        const icon = ICON_NAMES.includes(iconName) ? iconName : DEFAULT_ICONS[slug];

        // booklet: null or false on purpose = no booklet (the card's questions carry their outlines instead).
        const noBooklet = Object.prototype.hasOwnProperty.call(raw, 'booklet') && (raw.booklet === null || raw.booklet === false);
        const bookletRaw = noBooklet ? undefined : pick(raw, ['booklet', 'answers', 'booklet_title']);
        const bookletTitle = noBooklet ? '' : (typeof bookletRaw === 'string' ? text(bookletRaw)
            : text(pick(bookletRaw, ['title', 'label', 'name'])) || DEFAULT_BOOKLETS[slug] || '');
        const bookletPage = bookletRaw && typeof bookletRaw === 'object' ? Math.max(1, Math.floor(Number(bookletRaw.page)) || 1) : 1;
        const bookletFind = bookletRaw && typeof bookletRaw === 'object' ? text(pick(bookletRaw, ['find', 'part', 'section'])) : '';

        // Firms: the card's own link, else the page-wide one; none while that course row is not in the course yet.
        const firmsRaw = pick(raw, ['firms', 'firms_link']);
        const firmsOwn = firmsRaw ? linkFrom(firmsRaw, FIRMS_TITLE) : null;
        const firmsHref = firmsOwn && defaults.isLive(firmsOwn) ? firmsOwn : (firmsOwn ? null : defaults.firms);
        const firmsHint = text(pick(raw, ['firms_filter', 'firms_tab', 'firms_hint'])) ||
            (firmsRaw && typeof firmsRaw === 'object' ? text(pick(firmsRaw, ['hint', 'filter', 'tab'])) : '');

        // Default: ?domain=<slug>. A card whose domain the Explorer does not tag can search words instead ({ q }).
        const explorerRaw = pick(raw, ['explorer', 'experiences']);
        const explorerOpts = Object.assign({}, explorerRaw && typeof explorerRaw === 'object' ? explorerRaw : {});
        if (explorerOpts.domain === undefined && text(explorerOpts.q)) explorerOpts.domain = '';
        const explorer = typeof explorerRaw === 'string' && safeHref(explorerRaw)
            ? safeHref(explorerRaw)
            : explorerHref(slug, explorerOpts);

        const linkedinRaw = pick(raw, ['linkedin', 'linkedin_search', 'search']);
        let linkedin = '';
        if (typeof linkedinRaw === 'string') {
            linkedin = /^https:/i.test(linkedinRaw) ? safeHref(linkedinRaw) : linkedinHref(linkedinRaw);
        } else if (linkedinRaw && typeof linkedinRaw === 'object') {
            linkedin = safeHref(pick(linkedinRaw, ['href', 'url'])) || linkedinHref(pick(linkedinRaw, ['keywords', 'words', 'query']) || DEFAULT_LINKEDIN[slug]);
        }
        if (!linkedin) linkedin = linkedinHref(DEFAULT_LINKEDIN[slug]);

        const cvLines = pick(raw, ['cv_line', 'cvLine', 'earned_line', 'cv_lines', 'cvLines']);

        return {
            slug,
            label,
            icon,
            iconSrc: PATHS.icons + icon + '.svg',
            tagline: text(pick(raw, ['tagline', 'short', 'one_line', 'oneLine', 'summary'])),
            enjoy: text(pick(raw, ['enjoy', 'enjoy_if', 'enjoyIf', 'interest_test', 'interestTest'])),
            note: text(pick(raw, ['note', 'key_line', 'keyLine', 'registration', 'registration_note'])),
            what: normaliseWhat(pick(raw, ['what', 'what_an_article_does', 'whatAnArticleDoes', 'work'])),
            suits: list(pick(raw, ['suits', 'who', 'who_it_suits', 'whoItSuits'])),
            pros: list(pick(raw, ['pros'])),
            cons: list(pick(raw, ['cons'])),
            leads: normaliseLeads(pick(raw, ['leads', 'exits', 'where_it_leads', 'whereItLeads'])),
            pairs: [...new Set(list(pick(raw, ['pairs', 'pairs_well_with', 'pairsWellWith', 'pairs_with'])).map(toSlug))]
                .filter(other => other && other !== slug),
            season: text(pick(raw, ['season', 'busy_season', 'busySeason'])),
            questions: (function (q) { return (Array.isArray(q) ? q : (q ? [q] : [])).map(normaliseQuestion).filter(Boolean); })(
                pick(raw, ['questions', 'how_you_are_tested', 'howYouAreTested', 'interview_questions'])),
            // `live` = false while the booklet is not in the course yet: the questions show, the link does not.
            booklet: bookletTitle ? {
                title: bookletTitle, page: bookletPage, find: bookletFind,
                href: resourceHref(BOOKLET_DAY, bookletTitle, bookletPage),
                live: defaults.isLive({ row: { day: BOOKLET_DAY, title: bookletTitle } })
            } : null,
            practise: practiseHref(slug, defaults.practise),
            levels: normaliseLevels(pick(raw, ['levels', 'work_simulation', 'workSimulation', 'simulation_levels']), slug, defaults.workSimulation),
            cvLine: Array.isArray(cvLines) ? list(cvLines)[0] || '' : text(cvLines),
            picks: normalisePicks(pick(raw, ['picks', 'free_picks', 'freePicks', 'simulations', 'free'])),
            paid: normalisePicks(pick(raw, ['paid', 'paid_option', 'paidOption', 'paid_later', 'later_paid'])),
            extra: normaliseExtra(pick(raw, ['extra', 'good_to_know', 'goodToKnow', 'notes']), defaults.isLive),
            // null while Top 100 Articleship Firms is not in the course yet (the Firms jumps are then left out).
            firms: firmsHref ? { href: firmsHref.href, external: firmsHref.external, hint: firmsHint } : null,
            explorer,
            linkedin
        };
    }

    function normaliseRule(raw) {
        if (!raw) return [];
        if (typeof raw === 'string') return [{ if: '', then: text(raw) }];
        return (Array.isArray(raw) ? raw : [raw]).map(row => {
            if (typeof row === 'string') return { if: '', then: text(row) };
            return { if: text(pick(row, ['if', 'when', 'you_are'])), then: text(pick(row, ['then', 'pick', 'do', 'answer'])) };
        }).filter(row => row.then);
    }

    function normaliseTeams(raw) {
        if (!raw) return null;
        const rows = (Array.isArray(raw) ? raw : (Array.isArray(raw.rows) ? raw.rows : [])).map(row => {
            if (!row || typeof row !== 'object') return null;
            const label = text(pick(row, ['label', 'name', 'team']));
            if (!label) return null;
            return { label, domain: toSlug(pick(row, ['domain', 'card', 'slug'])), text: text(pick(row, ['text', 'meaning', 'line'])) };
        }).filter(Boolean);
        if (!rows.length) return null;
        return {
            title: text(Array.isArray(raw) ? '' : raw.title) || 'Team names on application forms',
            intro: text(Array.isArray(raw) ? '' : raw.intro),
            rows
        };
    }

    function normaliseGlossary(raw) {
        let entries = raw;
        if (raw && !Array.isArray(raw) && typeof raw === 'object') {
            entries = Object.keys(raw).map(term => ({ term, meaning: raw[term] }));
        }
        return (Array.isArray(entries) ? entries : []).map(entry => {
            if (!entry || typeof entry !== 'object') return null;
            const term = text(pick(entry, ['term', 'word', 'title']));
            const meaning = text(pick(entry, ['meaning', 'text', 'definition']));
            return term && meaning ? { term, meaning } : null;
        }).filter(Boolean);
    }

    /**
     * Content `groups` ([{ title, domains: [slug…] }]) → [{ title, slugs }] over the cards that exist, each card once.
     * Cards no group names join the last group; with no groups, one untitled group in the programme's order.
     */
    function normaliseGroups(raw, present, warnings) {
        const used = new Set();
        const groups = (Array.isArray(raw) ? raw : []).map(group => {
            if (!group || typeof group !== 'object') return null;
            const slugs = list(pick(group, ['domains', 'slugs', 'cards']), item => toSlug(item) || '')
                .filter(slug => present.has(slug) && !used.has(slug));
            slugs.forEach(slug => used.add(slug));
            return slugs.length ? { title: text(pick(group, ['title', 'label', 'name'])), slugs } : null;
        }).filter(Boolean);
        const rest = domains().map(d => d.slug).filter(slug => present.has(slug) && !used.has(slug));
        if (rest.length) {
            if (groups.length) {
                warnings.push('Not in a group: ' + rest.join(', '));
                groups[groups.length - 1].slugs.push(...rest);
            } else {
                groups.push({ title: '', slugs: rest });
            }
        }
        return groups;
    }

    /**
     * Content JSON → the model the page renders. Throws only when no domain card can be read.
     * Cards come out in the content's group order (else the programme's), whatever order the file lists them in; a
     * duplicate slug keeps the first card. `warnings` lists what was skipped, for tests and the review stage.
     * options: { workSimulationLive } (default WORK_SIMULATION_LIVE; tests set it).
     */
    function normalise(content, options) {
        if (!content || typeof content !== 'object') throw new TypeError('Roadmaps content must be an object');
        const opts = options || {};
        // The Work Simulation: shown only once it is released (its part of each card below); before that, no other line
        // of the content names it either.
        const wsLive = opts.workSimulationLive === undefined ? WORK_SIMULATION_LIVE : Boolean(opts.workSimulationLive);
        const P = progressApi();
        // `rows: false`: this tool keeps its own built-rows list (`unbuilt`, kept equal to the release by its tests).
        if (P && typeof P.releaseContent === 'function') content = P.releaseContent(content, { workSimulationLive: wsLive, rows: false }) || {};
        const warnings = [];
        let rawDomains = pick(content, ['domains', 'cards', 'roadmaps']);
        if (rawDomains && !Array.isArray(rawDomains) && typeof rawDomains === 'object') {
            rawDomains = Object.keys(rawDomains).map(key => Object.assign({ slug: key }, rawDomains[key]));
        }
        const links = content.links && typeof content.links === 'object' ? content.links : {};
        const resources = content.resources && typeof content.resources === 'object' ? content.resources : {};
        const rowOf = (key, day, title) => {
            const r = resources[key] && typeof resources[key] === 'object' ? resources[key] : {};
            const d = Number.isInteger(Number(r.day)) && Number(r.day) >= 0 && Number(r.day) <= 6 ? Number(r.day) : day;
            return { day: d, title: text(r.title) || title };
        };
        // A jump to a course row whose file is not in the course yet is never shown.
        const unbuilt = unbuiltRows(pick(content, ['unbuilt', 'not_built', 'hidden_rows']));
        const isLive = link => !(link && link.row && unbuilt.has(rowKey(link.row.day, link.row.title)));
        const firmsRow = rowOf('firms', FIRMS_DAY, FIRMS_TITLE);
        const firmsLink = linkFrom(links.firms || pick(content, ['firms_href', 'firmsHref', 'firms_url']), FIRMS_TITLE) ||
            { label: FIRMS_TITLE, href: resourceHref(firmsRow.day, firmsRow.title), external: false, row: firmsRow };
        const firmsDefault = isLive(firmsLink) ? firmsLink : null;
        // The Work Simulation's link: its page once on the site, else its row's Day.
        const wsBase = safeHref(links.workSimulation);
        const wsRow = rowOf('workSimulation', WORK_SIMULATION_DAY, WORK_SIMULATION_TITLE);
        const workSimulation = wsBase
            ? { href: wsBase, wired: true, external: isExternal(wsBase), live: wsLive }
            : { href: resourceHref(wsRow.day, wsRow.title), wired: false, external: false, live: wsLive && isLive({ row: wsRow }) };
        const practise = safeHref(links.practise) || PATHS.practise;
        const seen = new Map();
        for (const raw of Array.isArray(rawDomains) ? rawDomains : []) {
            if (!raw || typeof raw !== 'object') continue;
            const card = normaliseDomainCard(raw, { firms: firmsDefault, workSimulation: wsBase, practise, isLive }, warnings);
            if (!card) continue;
            if (seen.has(card.slug)) { warnings.push('Duplicate domain: ' + card.slug); continue; }
            seen.set(card.slug, card);
        }
        if (!seen.size) throw new Error('Roadmaps content has no domain cards');
        const groups = normaliseGroups(pick(content, ['groups', 'order']), new Set(seen.keys()), warnings);
        const cards = groups.flatMap(group => group.slugs).map(slug => seen.get(slug));
        cards.forEach((card, index) => { card.index = index; });
        // Pairs only point at cards that exist on this page.
        cards.forEach(card => { card.pairs = card.pairs.filter(other => seen.has(other)); });
        domains().map(d => d.slug).filter(slug => !seen.has(slug)).forEach(slug => warnings.push('Missing domain: ' + slug));
        const introLink = linkFrom(pick(content, ['intro_link', 'introLink']) || null);
        if (introLink && introLink.row && introLink.row.find && introLink.row.page === 1) {
            introLink.label += ' (' + introLink.row.find + ' part)';
        }
        return {
            title: text(content.title) || 'Domain roadmaps',
            rule: normaliseRule(pick(content, ['rule', 'the_rule', 'pick_rule'])),
            ruleNote: text(pick(content, ['rule_note', 'ruleNote'])),
            introTitle: text(pick(content, ['intro_title', 'introTitle'])) || 'What an interviewer checks',
            intro: text(pick(content, ['intro', 'lede', 'top_line'])),
            introLink: introLink && isLive(introLink) ? introLink : null,
            workSimulation,
            groups,
            unbuilt: [...unbuilt],
            domains: cards,
            bySlug: Object.fromEntries(cards.map(card => [card.slug, card])),
            teams: normaliseTeams(pick(content, ['teams', 'team_names', 'teamNames'])),
            lockin: text(pick(content, ['lockin', 'lock_in', 'not_locked_in', 'moves'])),
            glossary: normaliseGlossary(pick(content, ['glossary', 'words'])),
            warnings
        };
    }

    /** Content checks the review stage runs (also in node --test): every domain, the full card pattern, five questions. */
    function validate(content) {
        const problems = [];
        let model;
        try { model = normalise(content); } catch (error) { return [error.message]; }
        problems.push(...model.warnings);
        for (const card of model.domains) {
            const need = [
                ['what an article does', card.what.first.length + card.what.later.length > 0],
                ['who it suits', card.suits.length > 0],
                ['pros', card.pros.length > 0],
                ['cons', card.cons.length > 0],
                ['where it leads', Boolean(card.leads.text)],
                ['five questions', card.questions.length === 5],
                ['booklet or answer outlines', Boolean(card.booklet) || (card.questions.length > 0 && card.questions.every(q => q.a))],
                ['Work Simulation level', card.levels.length > 0],
                ['tagline', Boolean(card.tagline)]
            ];
            need.filter(([, ok]) => !ok).forEach(([what]) => problems.push(card.slug + ': no ' + what));
        }
        if (!model.rule.length) problems.push('no 20-minute rule line');
        return problems;
    }

    /** "#gst", "?domain=Indirect tax" → 'gst'; anything else → null. */
    function slugFromLocation(loc) {
        if (!loc) return null;
        const hash = String(loc.hash || '').replace(/^#/, '');
        if (hash) {
            try { return toSlug(decodeURIComponent(hash)); } catch (_) { return toSlug(hash); }
        }
        try {
            const params = new URLSearchParams(String(loc.search || ''));
            return toSlug(params.get('domain'));
        } catch (_) {
            return null;
        }
    }

    /** "You genuinely like tax law." → "You'll enjoy this if you genuinely like tax law." */
    function enjoyLine(value) {
        const line = text(value);
        if (!line) return '';
        if (/^you'?ll enjoy/i.test(line)) return line;
        const clause = /^[A-Z][a-z]/.test(line) ? line.charAt(0).toLowerCase() + line.slice(1) : line;
        return "You'll enjoy this if " + clause;
    }

    // ---------- DOM ----------
    function el(doc, tag, className, content) {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined && content !== null) node.textContent = content;
        return node;
    }

    function anchor(doc, className, href, label, external) {
        const a = el(doc, 'a', className, label);
        a.href = href;
        if (external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        return a;
    }

    function bullets(doc, items, className) {
        const ul = el(doc, 'ul', 'dr-list' + (className ? ' ' + className : ''));
        items.forEach(item => ul.appendChild(el(doc, 'li', '', item)));
        return ul;
    }

    function section(doc, title, className) {
        const box = el(doc, 'section', 'dr-sec' + (className ? ' ' + className : ''));
        if (title) box.appendChild(el(doc, 'h3', 'dr-h3', title));
        return box;
    }

    function icon(doc, card, size) {
        const img = el(doc, 'img', 'dr-ico');
        img.src = card.iconSrc;
        img.alt = '';
        img.width = size;
        img.height = size;
        img.loading = 'lazy';
        img.decoding = 'async';
        return img;
    }

    function actionRow(doc, href, title, hint, external, kind) {
        const a = anchor(doc, 'dr-action dr-action-' + kind, href, null, external);
        a.appendChild(el(doc, 'span', 'dr-action-title', title));
        if (hint) a.appendChild(el(doc, 'span', 'dr-action-hint', hint));
        return a;
    }

    /**
     * Render the roadmaps into `container`. options: { settings (an MSCArticleshipProgress settings store), location,
     * history, wideQuery (default '(min-width: 960px)'), onOpen(slug), workSimulationLive }.
     * Returns { model, open(slug), showIndex(), destroy() }.
     */
    function mount(container, content, options) {
        const opts = options || {};
        const doc = container.ownerDocument || root.document;
        const win = doc.defaultView || root;
        const model = content && content.domains && content.bySlug ? content : normalise(content, opts);
        const P = progressApi();
        const store = opts.settings || (P && typeof P.settings === 'function' ? P.settings() : null);
        const loc = opts.location || win.location;
        const hist = opts.history || win.history;
        const wide = typeof win.matchMedia === 'function' ? win.matchMedia(opts.wideQuery || '(min-width: 960px)') : null;
        const state = { current: null, last: null };

        function mine() {
            if (!store) return { my: null, backup: null };
            const data = store.get() || {};
            return { my: toSlug(data.myDomain), backup: toSlug(data.backupDomain) };
        }

        container.textContent = '';
        const app = el(doc, 'div', 'dr');
        app.dataset.view = 'index';

        // Top: the rule (yellow: the key line) and my domain, short enough that the first tiles show on a phone's first
        // screen. The three-things line sits under the tiles.
        const top = el(doc, 'section', 'dr-top');
        if (model.rule.length) {
            const rule = el(doc, 'div', 'ap-sticky dr-rule');
            rule.appendChild(el(doc, 'strong', 'dr-rule-label', 'My rule'));
            const rows = el(doc, 'dl', 'dr-rule-rows');
            model.rule.forEach(row => {
                const wrap = el(doc, 'div', 'dr-rule-row');
                if (row.if) wrap.appendChild(el(doc, 'dt', '', row.if));
                wrap.appendChild(el(doc, 'dd', '', row.then));
                rows.appendChild(wrap);
            });
            rule.appendChild(rows);
            if (model.ruleNote) rule.appendChild(el(doc, 'p', 'dr-rule-note', model.ruleNote));
            top.appendChild(rule);
        }
        const mineLine = el(doc, 'div', 'dr-mine-line');
        top.appendChild(mineLine);
        app.appendChild(top);

        const layout = el(doc, 'div', 'dr-layout');
        const nav = el(doc, 'nav', 'dr-nav');
        nav.setAttribute('aria-label', 'Domains');
        nav.appendChild(el(doc, 'h2', 'dr-nav-title', 'The ' + model.domains.length + ' domains'));
        const tileBySlug = {};
        model.groups.forEach(group => {
            if (group.title) nav.appendChild(el(doc, 'h3', 'dr-group-title', group.title));
            const tiles = el(doc, 'ol', 'dr-tiles');
            group.slugs.forEach(slug => {
                const card = model.bySlug[slug];
                const li = el(doc, 'li', 'dr-tile-item');
                const a = anchor(doc, 'dr-tile', '#' + card.slug);
                a.id = 'tile-' + card.slug;
                a.appendChild(icon(doc, card, 36));
                const words = el(doc, 'span', 'dr-tile-words');
                words.appendChild(el(doc, 'span', 'dr-tile-label', card.label));
                if (card.tagline) words.appendChild(el(doc, 'span', 'dr-tile-tag', card.tagline));
                a.appendChild(words);
                const badge = el(doc, 'span', 'dr-badge ap-hidden');
                a.appendChild(badge);
                li.appendChild(a);
                tiles.appendChild(li);
                tileBySlug[card.slug] = { a, badge };
            });
            nav.appendChild(tiles);
        });
        layout.appendChild(nav);

        // No aria-live: the whole card re-renders on every switch, and focus already moves to its name.
        const cardBox = el(doc, 'article', 'dr-card ap-card');
        cardBox.id = 'dr-card';
        layout.appendChild(cardBox);
        app.appendChild(layout);

        // Bottom: what an interviewer checks, team names on forms, the lock-in line, glossary.
        const more = el(doc, 'section', 'dr-more');
        if (model.intro) {
            const box = el(doc, 'div', 'dr-intro');
            box.appendChild(el(doc, 'h2', 'dr-intro-title', model.introTitle));
            box.appendChild(el(doc, 'p', 'dr-intro-text', model.intro));
            if (model.introLink) {
                box.appendChild(anchor(doc, 'dr-go dr-go-tight', model.introLink.href, model.introLink.label, model.introLink.external));
            }
            more.appendChild(box);
        }
        if (model.teams) {
            const details = el(doc, 'details', 'dr-fold');
            details.appendChild(el(doc, 'summary', 'dr-fold-title', model.teams.title));
            if (model.teams.intro) details.appendChild(el(doc, 'p', 'dr-fold-intro', model.teams.intro));
            const rows = el(doc, 'ul', 'dr-teams');
            model.teams.rows.forEach(row => {
                const li = el(doc, 'li', 'dr-team');
                li.appendChild(el(doc, 'span', 'dr-team-label', row.label));
                if (row.text) li.appendChild(el(doc, 'span', 'dr-team-text', row.text));
                if (row.domain && model.bySlug[row.domain]) {
                    li.appendChild(anchor(doc, 'dr-chip', '#' + row.domain, model.bySlug[row.domain].label));
                }
                rows.appendChild(li);
            });
            details.appendChild(rows);
            more.appendChild(details);
        }
        if (model.lockin) {
            const lock = el(doc, 'div', 'dr-lockin');
            lock.appendChild(el(doc, 'strong', '', 'Not locked in'));
            lock.appendChild(el(doc, 'p', '', model.lockin));
            more.appendChild(lock);
        }
        if (model.glossary.length) {
            const details = el(doc, 'details', 'dr-fold');
            details.appendChild(el(doc, 'summary', 'dr-fold-title', 'Words you will hear'));
            const dl = el(doc, 'dl', 'dr-glossary');
            model.glossary.forEach(entry => {
                const wrap = el(doc, 'div', 'dr-term');
                wrap.appendChild(el(doc, 'dt', '', entry.term));
                wrap.appendChild(el(doc, 'dd', '', entry.meaning));
                dl.appendChild(wrap);
            });
            details.appendChild(dl);
            more.appendChild(details);
        }
        if (more.childNodes.length) app.appendChild(more);
        container.appendChild(app);

        function paintMine() {
            const { my, backup } = mine();
            model.domains.forEach(card => {
                const tile = tileBySlug[card.slug];
                const label = card.slug === my ? 'My domain' : (card.slug === backup ? 'Backup' : '');
                tile.badge.textContent = label;
                tile.badge.classList.toggle('ap-hidden', !label);
                tile.badge.classList.toggle('is-backup', card.slug === backup);
                tile.a.classList.toggle('is-mine', card.slug === my);
            });
            mineLine.textContent = '';
            if (my && model.bySlug[my]) {
                const words = el(doc, 'p', 'dr-mine-words');
                words.appendChild(doc.createTextNode('My domain: '));
                words.appendChild(anchor(doc, 'ap-link', '#' + my, model.bySlug[my].label));
                if (backup && model.bySlug[backup]) {
                    words.appendChild(doc.createTextNode(' · Backup: '));
                    words.appendChild(anchor(doc, 'ap-link', '#' + backup, model.bySlug[backup].label));
                }
                mineLine.appendChild(words);
                const clear = el(doc, 'button', 'dr-clear', 'Clear');
                clear.type = 'button';
                clear.setAttribute('aria-label', backup ? 'Clear my domain and backup' : 'Clear my domain');
                clear.addEventListener('click', () => setMine(null, 'clear'));
                mineLine.appendChild(clear);
            }
            mineLine.classList.toggle('ap-hidden', !my);
        }

        /**
         * how: 'mine' (make `slug` my domain; promoting the backup swaps the two), 'backup' (make `slug` the backup),
         * 'unbackup' (drop the backup), 'clear' (drop both).
         */
        function setMine(slug, how) {
            if (!store) return;
            const current = mine();
            if (how === 'clear' || how === 'unbackup') {
                store.update(data => {
                    if (how === 'clear') data.myDomain = null;
                    data.backupDomain = null;
                    return data;
                });
                return;
            }
            let next;
            if (how === 'backup') {
                if (!current.my || current.my === slug) return;
                next = { my: current.my, backup: slug };
            } else {
                // The backup made "my domain": the old one becomes the backup, so nothing is lost.
                next = { my: slug, backup: current.backup === slug ? current.my : current.backup };
            }
            if (P && typeof P.setMyDomain === 'function') {
                P.setMyDomain(next.my, { backup: next.backup || null }, store);
            } else {
                store.update(data => {
                    data.myDomain = next.my;
                    data.backupDomain = next.backup && next.backup !== next.my ? next.backup : null;
                    return data;
                });
            }
        }

        function mineControls(card) {
            const { my, backup } = mine();
            const box = el(doc, 'div', 'dr-mine');
            const button = (label, className, how) => {
                const b = el(doc, 'button', 'ap-btn ' + className, label);
                b.type = 'button';
                b.addEventListener('click', () => setMine(card.slug, how));
                box.appendChild(b);
            };
            if (card.slug === my) {
                box.appendChild(el(doc, 'span', 'dr-pill is-mine', 'My domain'));
            } else if (card.slug === backup) {
                box.appendChild(el(doc, 'span', 'dr-pill is-backup', 'My backup'));
                button('Make this my domain', 'dr-make', 'mine');
                button('Not my backup', 'is-secondary dr-unbackup', 'unbackup');
            } else {
                button('Make this my domain', 'dr-make', 'mine');
                if (my) button('Make it my backup', 'is-secondary dr-make-backup', 'backup');
            }
            return box;
        }

        function renderCard(card) {
            cardBox.textContent = '';
            cardBox.dataset.domain = card.slug;

            const back = anchor(doc, 'dr-back', '#all', 'All domains');
            back.addEventListener('click', backToIndex);
            cardBox.appendChild(back);

            const head = el(doc, 'header', 'dr-card-head');
            head.appendChild(icon(doc, card, 52));
            const titles = el(doc, 'div', 'dr-card-titles');
            const h2 = el(doc, 'h2', 'dr-card-title', card.label);
            h2.tabIndex = -1;
            titles.appendChild(h2);
            // Under the name: the one-line tagline. The "you'll enjoy this if" line only stands in when a card has
            // no tagline or no "Who it suits" list, so the card never says the same thing twice.
            const sub = card.tagline || (card.suits.length ? enjoyLine(card.enjoy) : '');
            if (sub) titles.appendChild(el(doc, 'p', 'dr-enjoy', sub));
            head.appendChild(titles);
            cardBox.appendChild(head);
            const mineBox = el(doc, 'div', 'dr-mine-slot');
            mineBox.appendChild(mineControls(card));
            cardBox.appendChild(mineBox);

            // The three jumps in one line, so a student who knows the domain needs no scroll (the full ones close the card).
            const quick = el(doc, 'nav', 'dr-quick');
            quick.setAttribute('aria-label', card.label + ': open');
            quick.appendChild(anchor(doc, 'dr-quick-link', card.explorer, 'Experiences'));
            if (card.firms) quick.appendChild(anchor(doc, 'dr-quick-link', card.firms.href, 'Firms', card.firms.external));
            quick.appendChild(anchor(doc, 'dr-quick-link', card.linkedin, 'LinkedIn', true));
            cardBox.appendChild(quick);

            if (card.note) {
                const note = el(doc, 'div', 'ap-sticky dr-note');
                note.appendChild(el(doc, 'strong', '', 'Before you apply'));
                note.appendChild(el(doc, 'p', '', card.note));
                cardBox.appendChild(note);
            }

            if (card.what.first.length || card.what.later.length) {
                const what = section(doc, 'What an article does');
                if (card.what.first.length) {
                    what.appendChild(el(doc, 'h4', 'dr-h4', card.what.later.length ? 'First three months' : 'The work'));
                    what.appendChild(bullets(doc, card.what.first));
                }
                if (card.what.later.length) {
                    what.appendChild(el(doc, 'h4', 'dr-h4', 'Later'));
                    what.appendChild(bullets(doc, card.what.later));
                }
                if (card.what.note) what.appendChild(el(doc, 'p', 'dr-aside', card.what.note));
                cardBox.appendChild(what);
            }
            if (card.suits.length || card.enjoy) {
                const suits = section(doc, 'Who it suits');
                if (card.suits.length) suits.appendChild(bullets(doc, card.suits));
                else suits.appendChild(el(doc, 'p', 'dr-p', enjoyLine(card.enjoy)));
                cardBox.appendChild(suits);
            }
            if (card.pros.length || card.cons.length) {
                const pc = el(doc, 'div', 'dr-pc');
                if (card.pros.length) {
                    const pros = section(doc, 'Pros', 'dr-pros');
                    pros.appendChild(bullets(doc, card.pros, 'is-pros'));
                    pc.appendChild(pros);
                }
                if (card.cons.length) {
                    const cons = section(doc, 'Cons', 'dr-cons');
                    cons.appendChild(bullets(doc, card.cons, 'is-cons'));
                    pc.appendChild(cons);
                }
                cardBox.appendChild(pc);
            }
            if (card.leads.text) {
                const leads = section(doc, 'Where it leads');
                leads.appendChild(el(doc, 'p', 'dr-p', card.leads.text));
                if (card.leads.easier) {
                    const easier = el(doc, 'p', 'dr-aside');
                    easier.appendChild(el(doc, 'b', '', 'Easier with: '));
                    easier.appendChild(doc.createTextNode(card.leads.easier));
                    leads.appendChild(easier);
                }
                cardBox.appendChild(leads);
            }
            if (card.pairs.length || card.season) {
                const facts = el(doc, 'dl', 'dr-facts');
                if (card.pairs.length) {
                    const row = el(doc, 'div', 'dr-fact');
                    row.appendChild(el(doc, 'dt', '', 'Pairs well with'));
                    const dd = el(doc, 'dd', 'dr-chips');
                    card.pairs.forEach(other => dd.appendChild(anchor(doc, 'dr-chip', '#' + other, model.bySlug[other].label)));
                    row.appendChild(dd);
                    facts.appendChild(row);
                }
                if (card.season) {
                    const row = el(doc, 'div', 'dr-fact');
                    row.appendChild(el(doc, 'dt', '', 'Busy season'));
                    row.appendChild(el(doc, 'dd', '', card.season));
                    facts.appendChild(row);
                }
                cardBox.appendChild(facts);
            }
            if (card.questions.length) {
                const tested = section(doc, 'How you are tested');
                const ol = el(doc, 'ol', 'dr-questions');
                card.questions.forEach(q => {
                    const li = el(doc, 'li');
                    if (q.a) {
                        // No booklet answers this card: a short outline folds out under the question.
                        const fold = el(doc, 'details', 'dr-answer');
                        fold.appendChild(el(doc, 'summary', 'dr-answer-q', q.q));
                        fold.appendChild(el(doc, 'p', 'dr-answer-a', q.a));
                        li.appendChild(fold);
                    } else {
                        li.textContent = q.q;
                    }
                    ol.appendChild(li);
                });
                tested.appendChild(ol);
                const goes = el(doc, 'div', 'dr-gos');
                if (card.booklet && card.booklet.live) {
                    const label = (card.questions.some(q => q.a) ? 'More in the ' : 'Answers in the ') + card.booklet.title +
                        (card.booklet.find ? ', ' + card.booklet.find + ' part' : '');
                    goes.appendChild(anchor(doc, 'dr-go', card.booklet.href, label));
                }
                if (card.practise) goes.appendChild(anchor(doc, 'dr-go dr-go-practise', card.practise, 'Practise them in a mock interview'));
                if (goes.childNodes.length) tested.appendChild(goes);
                cardBox.appendChild(tested);
            }
            // The Work Simulation part shows only once it is released (WORK_SIMULATION_LIVE): never a promise of a page
            // that is not there.
            if (model.workSimulation.live && (card.levels.length || card.cvLine)) {
                const earn = section(doc, 'Earn the CV line');
                if (card.levels.length) {
                    const wired = card.levels.some(level => level.href);
                    if (!wired) earn.appendChild(el(doc, 'p', 'dr-p dr-levels-intro', 'Do the real tasks once, in the Work Simulation:'));
                    const ul = el(doc, 'ul', 'dr-levels' + (wired ? '' : ' is-plain'));
                    card.levels.forEach(level => {
                        const li = el(doc, 'li');
                        li.appendChild(level.href ? anchor(doc, 'dr-level', level.href, level.title) : el(doc, 'span', 'dr-level is-plain', level.title));
                        ul.appendChild(li);
                    });
                    earn.appendChild(ul);
                    if (!wired && model.workSimulation) {
                        earn.appendChild(anchor(doc, 'dr-go', model.workSimulation.href, 'Open the Work Simulation', model.workSimulation.external));
                    }
                }
                if (card.cvLine) {
                    const line = el(doc, 'figure', 'dr-cvline');
                    line.appendChild(el(doc, 'figcaption', '', 'A line you can earn'));
                    line.appendChild(el(doc, 'p', '', card.cvLine));
                    if (/\[[^\]]+\]/.test(card.cvLine)) {
                        line.appendChild(el(doc, 'p', 'dr-cvline-hint', 'Your own counts and month fill in when you finish the level.'));
                    }
                    earn.appendChild(line);
                }
                cardBox.appendChild(earn);
            }
            if (card.picks.length || card.paid.length) {
                const practise = section(doc, 'Practise free');
                // The whole pick is the link (one big tap target); its kind says plainly what it is.
                const picksList = (items, labels) => {
                    const ul = el(doc, 'ul', 'dr-picks');
                    items.forEach((item, i) => {
                        const li = el(doc, 'li', 'dr-pick-item');
                        const box = item.href ? anchor(doc, 'dr-pick is-link', item.href, null, item.external) : el(doc, 'div', 'dr-pick');
                        const tag = [labels && labels[i], PICK_KINDS[item.kind]].filter(Boolean).join(' · ');
                        if (tag) box.appendChild(el(doc, 'span', 'dr-pick-no', tag));
                        box.appendChild(el(doc, 'span', 'dr-pick-name', item.label));
                        if (item.note) box.appendChild(el(doc, 'span', 'dr-pick-note', item.note));
                        li.appendChild(box);
                        ul.appendChild(li);
                    });
                    return ul;
                };
                if (card.picks.length) practise.appendChild(picksList(card.picks, ['First pick', 'Second pick']));
                if (card.paid.length) {
                    practise.appendChild(el(doc, 'h4', 'dr-h4', 'Paid, for later'));
                    practise.appendChild(picksList(card.paid));
                }
                cardBox.appendChild(practise);
            }
            if (card.extra.length) {
                const extra = section(doc, 'Good to know');
                const ul = el(doc, 'ul', 'dr-list');
                card.extra.forEach(item => {
                    const li = el(doc, 'li', '', item.text);
                    // The link on its own line: a full-size tap target, not a word inside the sentence.
                    if (item.link) {
                        li.appendChild(doc.createElement('br'));
                        li.appendChild(anchor(doc, 'dr-go dr-go-tight', item.link.href, item.link.label, item.link.external));
                    }
                    ul.appendChild(li);
                });
                extra.appendChild(ul);
                cardBox.appendChild(extra);
            }

            const actions = section(doc, 'Go further', 'dr-actions');
            const grid = el(doc, 'div', 'dr-action-grid');
            grid.appendChild(actionRow(doc, card.explorer, 'See real experiences', 'Experience Explorer', false, 'explorer'));
            if (card.firms) {
                grid.appendChild(actionRow(doc, card.firms.href, 'Firms for this domain',
                    card.firms.hint ? FIRMS_TITLE + ' · ' + card.firms.hint + (/ or /.test(card.firms.hint) ? ' tabs' : ' tab') : FIRMS_TITLE, card.firms.external, 'firms'));
            }
            grid.appendChild(actionRow(doc, card.linkedin, 'Articles in it on LinkedIn',
                'Swap India for your city under Locations', true, 'linkedin'));
            grid.classList.add('is-' + grid.childNodes.length);
            actions.appendChild(grid);
            cardBox.appendChild(actions);

            const pn = el(doc, 'nav', 'dr-prevnext');
            pn.setAttribute('aria-label', 'Other domains');
            const prev = model.domains[card.index - 1];
            const next = model.domains[card.index + 1];
            if (prev) pn.appendChild(anchor(doc, 'dr-prev', '#' + prev.slug, prev.label));
            if (next) pn.appendChild(anchor(doc, 'dr-next', '#' + next.slug, next.label));
            cardBox.appendChild(pn);
        }

        function isWide() { return Boolean(wide && wide.matches); }

        function show(slug, how) {
            const card = slug && model.bySlug[slug];
            const fallback = model.bySlug[mine().my] || model.domains[0];
            state.current = card ? slug : null;
            const shown = card || fallback;
            renderCard(shown);
            app.dataset.view = card ? 'card' : 'index';
            if (doc.body) doc.body.classList.toggle('dr-card-open', Boolean(card));
            Object.keys(tileBySlug).forEach(other => {
                const active = other === shown.slug && (card || isWide());
                tileBySlug[other].a.classList.toggle('is-active', Boolean(active));
                if (active) tileBySlug[other].a.setAttribute('aria-current', 'true');
                else tileBySlug[other].a.removeAttribute('aria-current');
            });
            if (how === 'nav') {
                if (card) {
                    const heading = cardBox.querySelector('.dr-card-title');
                    if (heading && typeof heading.focus === 'function') {
                        try { heading.focus({ preventScroll: true }); } catch (_) { heading.focus(); }
                    }
                    if (typeof win.scrollTo === 'function') {
                        const top = isWide() ? Math.max(0, cardBox.getBoundingClientRect().top + (win.pageYOffset || 0) - 72) : 0;
                        if (!isWide() || cardBox.getBoundingClientRect().top < 56) win.scrollTo(0, top);
                    }
                } else if (state.last && tileBySlug[state.last] && typeof tileBySlug[state.last].a.scrollIntoView === 'function') {
                    tileBySlug[state.last].a.scrollIntoView({ block: 'center' });
                }
            }
            if (card) state.last = slug;
            if (opts.setTitle !== false) doc.title = (card ? card.label + ' | ' : '') + 'Domain roadmaps | My Student Club';
            if (card && typeof opts.onOpen === 'function') opts.onOpen(slug);
        }

        function route(how) {
            const hash = String(loc.hash || '').replace(/^#/, '');
            const slug = slugFromLocation(loc);
            const fromIndex = app.dataset.view === 'index';
            const canReplace = hist && typeof hist.replaceState === 'function';
            // Aliases and ?domain= become the canonical anchor, so the address can be shared.
            if (slug && hash !== slug && canReplace) {
                const search = String(loc.search || '').replace(/([?&])domain=[^&]*&?/, '$1').replace(/[?&]$/, '');
                try { hist.replaceState(hist.state, '', String(loc.pathname || '') + search + '#' + slug); } catch (_) { /* ignore */ }
            }
            // A card opened from the index remembers it, so "All domains" can step back instead of adding an entry.
            if (how === 'nav' && slug && model.bySlug[slug] && fromIndex && canReplace) {
                const entry = Object.assign({}, hist.state && typeof hist.state === 'object' ? hist.state : {}, { drFromIndex: true });
                try { hist.replaceState(entry, ''); } catch (_) { /* ignore */ }
            }
            show(slug, how);
        }

        /** "All domains": back to the index entry when the card came from it; otherwise swap this entry for the index. */
        function backToIndex(event) {
            if (event && typeof event.preventDefault === 'function') event.preventDefault();
            const fromIndex = hist && hist.state && typeof hist.state === 'object' && hist.state.drFromIndex;
            if (fromIndex && typeof hist.back === 'function') { hist.back(); return; }
            if (hist && typeof hist.replaceState === 'function') {
                try { hist.replaceState(null, '', String(loc.pathname || '') + String(loc.search || '')); } catch (_) { /* ignore */ }
            }
            show(null, 'nav');
        }

        const onHash = () => route('nav');
        win.addEventListener('hashchange', onHash);
        const onWide = () => show(state.current, 'resize');
        if (wide) {
            if (typeof wide.addEventListener === 'function') wide.addEventListener('change', onWide);
            else if (typeof wide.addListener === 'function') wide.addListener(onWide);
        }
        const unsubscribe = store && typeof store.subscribe === 'function'
            ? store.subscribe(() => {
                paintMine();
                const slot = cardBox.querySelector('.dr-mine-slot');
                const shown = model.bySlug[cardBox.dataset.domain];
                if (slot && shown) { slot.textContent = ''; slot.appendChild(mineControls(shown)); }
            })
            : null;

        paintMine();
        route('load');

        return {
            model,
            open(slug) { const s = toSlug(slug); if (s) loc.hash = '#' + s; },
            showIndex() { backToIndex(); },
            current() { return state.current; },
            destroy() {
                win.removeEventListener('hashchange', onHash);
                if (wide) {
                    if (typeof wide.removeEventListener === 'function') wide.removeEventListener('change', onWide);
                    else if (typeof wide.removeListener === 'function') wide.removeListener(onWide);
                }
                if (typeof unsubscribe === 'function') unsubscribe();
                container.textContent = '';
            }
        };
    }

    /** Page start: fetch the content, mount, and offer a retry on a network error. */
    function start(container, options) {
        const opts = options || {};
        const doc = container.ownerDocument || root.document;
        const fetcher = opts.fetch || (root.fetch ? root.fetch.bind(root) : null);
        container.textContent = '';
        const loading = el(doc, 'div', 'dr-loading');
        loading.appendChild(el(doc, 'div', 'ap-spinner'));
        container.appendChild(loading);
        const content = fetcher(opts.url || PATHS.content, { cache: 'no-cache', credentials: 'same-origin' })
            .then(response => {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            });
        return Promise.all([content, opts.ready])
            .then(([data]) => mount(container, data, opts))
            .catch(error => {
                if (root.console && error) root.console.error(error);
                container.textContent = '';
                const box = el(doc, 'div', 'ap-card dr-error');
                box.appendChild(el(doc, 'p', '', 'The roadmaps did not load. Check your connection and try again.'));
                const retry = el(doc, 'button', 'ap-btn', 'Try again');
                retry.type = 'button';
                retry.addEventListener('click', () => start(container, opts));
                box.appendChild(retry);
                container.appendChild(box);
                return null;
            });
    }

    /** Page entry: the courtesy gate and the content load together, then the roadmaps mount into #app. */
    function boot(options) {
        const opts = options || {};
        const doc = opts.document || root.document;
        const container = opts.container || doc.getElementById('app');
        const gate = opts.Gate || root.MSCArticleshipGate;
        const ready = gate && typeof gate.protect === 'function' ? gate.protect() : Promise.resolve({ state: 'allow' });
        return start(container, Object.assign({}, opts, { ready }));
    }

    return Object.freeze({
        PATHS, DEFAULT_BOOKLETS, DEFAULT_LINKEDIN, DEFAULT_ICONS, WORK_SIMULATION_LIVE, PICK_KINDS,
        normalise, validate, safeHref, isExternal, explorerHref, levelHref, linkedinHref, practiseHref, resourceHref,
        slugFromLocation, enjoyLine, mount, start, boot
    });
});
