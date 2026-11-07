/**
 * MSC Articleship Program: Experience Explorer (row 5.2).
 *
 * Anonymous articleship experiences, searchable by firm, city, domain and task. Every card shows: there is no
 * experience-length filter and no "N months" line (the generator drops the field). Filters live in the URL:
 *   /articleship-program/experience-explorer/?domain=gst&city=mumbai&q=bdo
 *   /articleship-program/experience-explorer/?firm=Kirtane+%26+Pandit+LLP
 * `firm` is one firm exactly, as the cards name it (a card's firm name and the "Firms here" chips use it; `q` stays free
 * text). `domain` takes any of the programme's 13 slugs, labels or aliases (MSCArticleshipProgress.normaliseDomain), or `all`;
 * `city` takes a city or a common old name (Bombay, Gurgaon…), Delhi NCR as one (a city no card names is dropped, with a
 * one-line note); `nocity=1` adds the cards that name no city; `q` is the search text. On a bare open (no `domain`,
 * `city`, `firm` or `q` in the URL) the student's shared "my domain" is the default, read from this device at once and
 * from the account once it loads; typing a search looks across every domain (with a "Show <my domain> only" offer).
 *
 * Order: cards that answer the search best come first (the words as one phrase in a work line, then all the words in
 * one line, then spread over the card); a firm or city with a domain name ("BDO Mumbai stat audit") also finds that
 * firm's cards in the domain; in a domain view, cards with more of that domain's work lines come first; then the most
 * specific work, one card per firm in turn. Each card lists its matching lines first, marked.
 *
 * Data: ./experiences.json (version 5: one domain bitmask per work line), built by
 * msc-content/articleship-program/v3/build/day-5/5.2/build_explorer.mjs.
 * Browser: window.MSCArticleshipExplorer. Node (tests): require('./scripts/articleship-experience-explorer.js').
 */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root, require('./articleship-progress.js'));
    } else {
        root.MSCArticleshipExplorer = factory(root, root.MSCArticleshipProgress || null);
    }
})(typeof self !== 'undefined' ? self : globalThis, function (root, Progress) {
    'use strict';

    const DATA_VERSION = 5;
    const PAGE_SIZE = 12;
    const ROADMAPS = '/articleship-program/domain-roadmaps/';
    const COURSE_PAGE = '/learning-management-system/course?course=msc-articleship-program';
    const PROGRAMME_PAGE = '/articleship-program/';
    const COMMON_LINES = 6;
    const THIN = 8;
    const BIG_FIRM = 20; // a firm with this many cards or more is spread out, so smaller firms are seen too
    const GLANCE_AFTER = 3;
    const PHONE = '(max-width: 599px)';
    const ACCOUNT_SCRIPTS = ['/scripts/supabase.js', '/scripts/supabase-init.js'];
    const FIRM_CHIPS = 10;
    const FIRM_FILL = 6;
    const STOCK = 10; // a work line on this many cards or more is stock wording ("Prepared tax audit reports in Form 3CD.")

    // Day 5's "Top 100 Articleship Firms" row (5.3, Padam's sheet; it replaced Firms by domain, B9), behind "Find firms to
    // apply to". The same live check as the Domain roadmaps: FIRMS_LIVE is false while
    // articleship-program/domain-roadmaps/roadmaps.json lists the row in `unbuilt` (a test keeps the two equal, and checks
    // the row is in the course), so the button is never a dead end. FIRMS_HREF = a Sheet view link if the MSC team ever
    // puts the workbook in Google Sheets (roadmaps.json `links.firms`); while null, the course row. Signed-in students
    // only: the course is not open to a visitor.
    const FIRMS_RESOURCE = 'Top 100 Articleship Firms';
    const FIRMS_LIVE = true;
    const FIRMS_HREF = null;

    // "Next for <firm>": the Big 10 networks' apply routes (Day 2 row 2.1, the page where the network's section starts)
    // and their LinkedIn company ids (row 3.2's links); every other firm gets a LinkedIn keyword search on its name.
    const BIG10_ROUTES = 'Big 10 articleship routes';
    const NETWORKS = {
        'Deloitte': { name: 'Deloitte', page: 5, companies: ['1038'] },
        'PwC': { name: 'PwC', page: 5, companies: ['1044', '1092713'] },
        'EY': { name: 'EY', page: 6, companies: ['1073', '6885588'] },
        'KPMG': { name: 'KPMG', page: 6, companies: ['1079', '2525298', '27847990'] },
        'BDO': { name: 'BDO', page: 6, companies: ['3296137'] },
        'Grant Thornton': { name: 'Grant Thornton', page: 7, companies: ['909723'] },
        'RSM': { name: 'RSM', page: 7, companies: ['777667'] },
        'Lodha & Co. LLP': { name: 'Lodha & Co.', page: 7, keywords: '("Lodha & Co" OR "Lodha and Co")' },
        'S S Kothari Mehta & Co. LLP': { name: 'S S Kothari Mehta', page: 8, companies: ['6673968'] },
        'Sahni Natarajan & Bahl': { name: 'SNB', page: 8, companies: ['47460'] }
    };
    const LINKEDIN_PEOPLE = 'https://www.linkedin.com/search/results/people/';
    const LINKEDIN_INDIA = '["102713980"]';
    const ARTICLE_TITLES = '"Article Assistant" OR "CA Finalist"';

    // The 13 domains (one vocabulary with every programme tool). Fallback only if the progress script is missing.
    const DOMAINS = Progress && Progress.DOMAINS ? Progress.DOMAINS : [];
    const domainLabel = slug => {
        const found = DOMAINS.find(domain => domain.slug === slug);
        return found ? found.label : slug;
    };
    // The nearest domains, as the Domain roadmaps pair them: offered when a domain view has only a few cards.
    const RELATED = {
        'statutory-audit': ['internal-audit', 'direct-tax'], 'internal-audit': ['statutory-audit', 'forensic'],
        'direct-tax': ['statutory-audit', 'gst', 'ma-tax'], 'gst': ['direct-tax'], 'bank-audit': ['statutory-audit'],
        'transfer-pricing': ['direct-tax'], 'ma-tax': ['direct-tax'], 'valuation': ['fdd'], 'fdd': ['valuation', 'statutory-audit'],
        'forensic': ['internal-audit'], 'consulting': ['internal-audit'], 'accounting': ['statutory-audit'], 'ib-er': ['valuation', 'fdd']
    };
    /** A Day's row in the course page, at a page (the same link MSCArticleshipLms.resourceLink builds: session = Day + 1). */
    function courseHref(day, title, page) {
        const params = new URLSearchParams({ course: 'msc-articleship-program', session: String(day + 1) });
        if (title) params.set('resource', title);
        if (title && Number.isInteger(page) && page > 1) params.set('page', String(page));
        return `/learning-management-system/course?${params.toString()}`;
    }

    /** "Find firms to apply to": the Sheet once it exists, else Day 5's row; null while that row is not built. */
    function firmsHref() {
        if (!FIRMS_LIVE) return null;
        return FIRMS_HREF || courseHref(5, FIRMS_RESOURCE);
    }

    /** The name a firm goes by on LinkedIn, without "LLP", "& Co." or "Associates" (each spelling a profile may use). */
    function firmKeywords(firm) {
        const core = String(firm || '').replace(/\s+/g, ' ').trim()
            .replace(/(?:,?\s*(?:LLP|& Co\.?|and Co\.?|& Company|and Company|& Associates|and Associates|Associates|Chartered Accountants))+$/i, '')
            .replace(/[.,]+$/, '').trim() || String(firm || '').trim();
        const variants = new Set([core]);
        if (/&/.test(core)) variants.add(core.replace(/\s*&\s*/g, ' and '));
        // Initials: "S.N. Gupta" is also written "SN Gupta" and "S N Gupta"
        const lead = core.match(/^((?:[A-Z](?:\.\s*|\s+))+)(?=[A-Z][a-z])/);
        if (lead) {
            const letters = lead[1].replace(/[^A-Z]/g, '');
            const rest = core.slice(lead[1].length);
            variants.add(`${letters} ${rest}`);
            variants.add(`${letters.split('').join(' ')} ${rest}`);
        }
        return [...variants].slice(0, 3).map(name => `"${name.replace(/"/g, '')}"`).join(' OR ');
    }

    /** Current articles at a firm on LinkedIn ("Article Assistant" OR "CA Finalist", India), row 3.2's pattern. */
    function linkedinFirmHref(firm) {
        const network = NETWORKS[firm];
        const params = new URLSearchParams();
        if (network && network.companies) params.set('currentCompany', JSON.stringify(network.companies));
        else params.set('keywords', network && network.keywords ? network.keywords : firmKeywords(firm));
        params.set('titleFreeText', ARTICLE_TITLES);
        params.set('geoUrn', LINKEDIN_INDIA);
        params.set('origin', 'FACETED_SEARCH');
        return `${LINKEDIN_PEOPLE}?${params.toString().replace(/\+/g, '%20')}`;
    }

    /** A Big 10 network's apply route (its section in Big 10 articleship routes, Day 2), or null for any other firm. */
    function routeHref(firm) {
        const network = NETWORKS[firm];
        return network ? courseHref(2, BIG10_ROUTES, network.page) : null;
    }

    // ---------- Text normalising (the same rules for the cards and the query) ----------
    const FIRM_ALIASES = [
        ['PwC', /\b(?:pwc|p w c|price ?waterhouse(?: ?coopers)?|lovelock and lewes|dalal and shah|choksey bhargava)\b/g],
        ['EY', /\b(?:ey|e (?:and )?y|ernst (?:and )?young|s ?r ?batliboi|s ?r ?b ?c|s ?v ?ghatalia)\b/g],
        ['KPMG', /\b(?:kpmg|k p m g|b ?b ?s ?r|b ?s ?s ?r|b ?s ?r ?r|b ?s ?r)\b/g],
        ['Deloitte', /\b(?:deloitte(?: haskins and sells| touche tohmatsu)?|a ?f ?ferguson|c ?c ?chokshi|p ?c ?hansotia|s ?b ?billimoria|fraser and ross)\b/g],
        ['Grant Thornton', /\b(?:grant thornton(?: bharat)?|gt|walker chandiok)\b/g],
        ['BDO', /\b(?:bdo(?: india)?|m ?s ?k ?[abc])\b/g],
        ['RSM', /\b(?:rsm(?: india| astute consulting)?|suresh surana)\b/g],
        ['Forvis Mazars', /\b(?:forvis mazars(?: india)?|mazars|s ?n ?dhawan)\b/g],
        ['Baker Tilly', /\b(?:baker tilly(?: asa| india)?|a ?s ?a (?:and associates|corporate catalyst(?: india)?))\b/g],
        ['PKF', /\b(?:pkf|sridhar and santhanam)\b/g]
    ].map(([brand, pattern]) => [brand, new RegExp(`${pattern.source}(?: (?:and|co|company|chartered|accountants|llp|associates))*`, 'g')]);

    // Extra words a card answers to, so 'Big 4', 'Lovelock' or 'SRBC' find it.
    const BRAND_WORDS = {
        'PwC': 'price waterhouse pricewaterhousecoopers lovelock lewes dalal shah choksey bhargava big4',
        'EY': 'ernst young srbc batliboi ghatalia big4',
        'KPMG': 'bsr bbsr big4',
        'Deloitte': 'haskins sells touche tohmatsu ferguson chokshi hansotia billimoria fraser ross big4',
        'Grant Thornton': 'gt walker chandiok',
        'BDO': 'mska mskb mskc',
        'RSM': 'suresh surana astute',
        'Forvis Mazars': 'mazars dhawan',
        'Baker Tilly': 'asa corporate catalyst',
        'PKF': 'sridhar santhanam'
    };
    // Domain names and their plain synonyms. Searched only when nothing in the cards' own work, firm, city or skills
    // matches (so 'valuation' lists the cards that say it, and a domain word with no such card still finds its domain).
    // Task words (dcf, concurrent, tds, benchmarking…) are left out: the work lines carry them.
    const DOMAIN_WORDS = {
        'statutory-audit': 'statutory audit external assurance',
        'internal-audit': 'internal audit ifc risk controls',
        'direct-tax': 'direct tax income tax',
        'gst': 'gst goods services tax indirect',
        'bank-audit': 'bank audit banking',
        'transfer-pricing': 'transfer pricing',
        'ma-tax': 'm and a tax mergers acquisitions',
        'valuation': 'valuation',
        'fdd': 'financial due diligence transaction',
        'forensic': 'forensic',
        'consulting': 'consulting advisory',
        'accounting': 'accounting accounts mis company law',
        'ib-er': 'ib investment banking equity research'
    };
    const LABEL_WORDS = {
        'International tax': 'dtaa treaty cross border',
        'Company law': 'roc secretarial',
        'Financial analysis': 'mis budgets projections'
    };
    const LABEL_DOMAIN = { 'International tax': 'direct-tax', 'Company law': 'accounting', 'Financial analysis': 'accounting' };
    // Words every card answers to, or none does: a student's "articleship in Pune" is a search for Pune. ("opening" stays
    // in "opening balances", a real audit task.)
    const STOP_WORDS = new Set(['and', 'the', 'of', 'at', 'in', 'for', 'a', 'an', 'co', 'llp', 'ca', 'chartered', 'accountants',
        'firm', 'firms', 'work', 'articleship', 'articleships', 'article', 'articles', 'articled', 'experience', 'experiences',
        'job', 'jobs', 'internship', 'internships', 'trainee', 'trainees', 'opening', 'openings', 'vacancy', 'vacancies',
        'hiring', 'india', 'near', 'me', 'my', 'best', 'top', 'on', 'to', 'with', 'from']);
    // Words too broad to suggest one domain from the search box.
    const BROAD_WORDS = new Set(['audit', 'tax', 'risk', 'bank', 'banking', 'assurance', 'statutory', 'accounts', 'account', 'ia', 'dt', 'er']);
    // A card label ("International tax") answers a search only when some word is more than these.
    const WEAK_WORDS = new Set([...BROAD_WORDS, 'financial', 'company', 'analysis', 'law', 'services', 'service', 'goods']);

    function normalise(value, canonicalFirms) {
        let text = String(value == null ? '' : value).normalize('NFKD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
            .replace(/\bgurgaon\b/g, 'gurugram').replace(/\bbangalore\b/g, 'bengaluru')
            .replace(/\bbombay\b/g, 'mumbai').replace(/\bcalcutta\b/g, 'kolkata')
            .replace(/\bmadras\b/g, 'chennai').replace(/\bpoona\b/g, 'pune')
            .replace(/\bbaroda\b/g, 'vadodara').replace(/\bnew delhi\b/g, 'delhi')
            .replace(/\bcochin\b/g, 'kochi').replace(/\bmysore\b/g, 'mysuru').replace(/\bmangalore\b/g, 'mangaluru')
            .replace(/\baurangabad\b/g, 'chhatrapati sambhajinagar')
            .replace(/\bbig (?:4|four)\b/g, 'big4')
            .replace(/\bstat\b/g, 'statutory').replace(/\bintl\b/g, 'international')
            .replace(/\btaxation\b/g, 'tax').replace(/\bmodeling\b/g, 'modelling')
            .replace(/\b(?:icfr|ifcr|internal financial controls?)\b/g, 'ifc')
            .replace(/\bfinancial due diligence\b/g, 'fdd').replace(/\bdue diligence\b/g, 'diligence')
            .replace(/\btransfer pricing\b/g, 'tp').replace(/\bindirect tax\b/g, 'gst')
            .replace(/\bdirect tax\b/g, 'income tax').replace(/\b(?:igst|cgst|sgst)\b/g, 'gst')
            .replace(/\bitrs?\b/g, 'income tax return').replace(/\bit returns?\b/g, 'income tax return')
            .replace(/\bfil(?:ed|ing|es)\b/g, 'file')
            .replace(/\s+/g, ' ').trim();
        if (canonicalFirms !== false) {
            for (const [brand, pattern] of FIRM_ALIASES) text = text.replace(pattern, ` ${brand.toLowerCase()} `);
        }
        return text.replace(/\s+/g, ' ').trim();
    }

    /**
     * One search word without its plural ending, so 'mergers' finds 'merger' and 'taxes' finds 'tax' (a word start
     * matches longer words, so the singular finds both). Words of four letters or fewer stay (TDS, MIS, IFRS), and so do
     * '-ss', '-us' and '-is' endings (process, status, analysis).
     */
    function stem(token) {
        if (token.length < 5 || !token.endsWith('s') || /(?:ss|us|is)$/.test(token)) return token;
        if (/ies$/.test(token) && token.length > 6) return token.slice(0, -3); // liabilities → liabilit(y|ies)
        if (/(?:xes|ches|shes|sses|zes)$/.test(token)) return token.slice(0, -2); // taxes → tax, branches → branch
        return token.slice(0, -1);
    }

    function tokens(query) {
        const text = normalise(query);
        const keepOpening = /\bopening balance/.test(text);
        return [...new Set(text.split(' ')
            .filter(token => token && (!STOP_WORDS.has(token) || (keepOpening && token === 'opening')))
            .map(stem))];
    }

    // A token of one or two letters ('it', 'gt', 'tp') matches a whole word only; a longer one matches a word start
    // ('audit' finds 'audits'). Every indexed text starts and ends with a space.
    const hasToken = (text, token) => text.includes(token.length <= 2 ? ` ${token} ` : ` ${token}`);
    // The firm and city line answers whole words only ('bank' is not the firm 'Banka & Banka'), plurals included.
    const inHead = (card, token) => card.head.includes(` ${token} `) ||
        (token.length >= 4 && (card.head.includes(` ${token}s `) || card.head.includes(` ${token}es `)));

    // ---------- Cities: Delhi NCR is one choice; each card still shows its own city ----------
    const DELHI_NCR = new Set(['New Delhi', 'Gurugram', 'Noida', 'Greater Noida', 'Ghaziabad', 'Faridabad']);
    const CITY_ALIASES = {
        'delhi': 'Delhi NCR', 'new-delhi': 'Delhi NCR', 'ncr': 'Delhi NCR', 'delhi-ncr': 'Delhi NCR',
        'gurgaon': 'Delhi NCR', 'gurugram': 'Delhi NCR', 'noida': 'Delhi NCR', 'greater-noida': 'Delhi NCR',
        'ghaziabad': 'Delhi NCR', 'faridabad': 'Delhi NCR',
        'bombay': 'Mumbai', 'bangalore': 'Bengaluru', 'calcutta': 'Kolkata', 'madras': 'Chennai', 'poona': 'Pune',
        'baroda': 'Vadodara', 'cochin': 'Kochi', 'mysore': 'Mysuru', 'mangalore': 'Mangaluru',
        'aurangabad': 'Chhatrapati Sambhajinagar', 'sambhajinagar': 'Chhatrapati Sambhajinagar',
        'trivandrum': 'Thiruvananthapuram', 'calicut': 'Kozhikode', 'nasik': 'Nashik'
    };
    const cityGroup = city => (city && DELHI_NCR.has(city) ? 'Delhi NCR' : city || '');
    const slug = value => String(value == null ? '' : value).trim().toLowerCase()
        .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    function resolveDomain(value) {
        const text = String(value == null ? '' : value).trim();
        if (!text) return null;
        if (/^(?:all|any)$/i.test(text)) return 'all';
        return Progress && Progress.normaliseDomain ? Progress.normaliseDomain(text) : (DOMAINS.some(d => d.slug === text) ? text : null);
    }

    const tidyCity = key => key.split('-').filter(Boolean).slice(0, 4).map(word => word[0].toUpperCase() + word.slice(1)).join(' ').slice(0, 40);

    /**
     * A city from the URL → the name used on the cards (Delhi NCR grouped). With a model, a city no card names gives ''
     * (the page says so once); without one, a tidy version of the text.
     */
    function resolveCity(value, model) {
        const key = slug(value);
        if (!key) return '';
        const aliased = CITY_ALIASES[key];
        if (aliased) return aliased;
        if (!model || !model.cityNames) return tidyCity(key);
        return model.cityNames.find(name => slug(name) === key) || '';
    }

    /** A firm from the URL → the firm exactly as the cards name it (case and punctuation forgiven), or the text itself. */
    function resolveFirm(value, model) {
        const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, 120);
        if (!text || !model || !model.firmBySlug) return text;
        return model.firmBySlug.get(slug(text)) || text;
    }

    /**
     * The search words that name a place to look instead: a city the cards name (old names and Delhi NCR included, two
     * words too: "navi mumbai") and the one firm a word names ("kirtane", "bdo"). { city: '' | name, firm: '' | name }.
     */
    function placeIn(model, queryTokens) {
        const out = { city: '', firm: '' };
        const words = queryTokens || [];
        for (let i = 0; i < words.length && !out.city; i++) {
            for (const text of [words.slice(i, i + 2).join(' '), words[i]]) {
                const city = resolveCity(text, model);
                if (city && (model.cityNames.includes(city))) { out.city = city; break; }
            }
        }
        const ix = ensureIndex(model);
        for (const token of words) {
            if (token.length < 3 || resolveCity(token, model)) continue;
            const firms = new Set();
            for (let id = 0; id < model.records.length && firms.size < 2; id++) {
                if (inHead(ix.cards[id], token) && !` ${ix.norm(model.records[id].city)} `.includes(` ${token} `)) firms.add(model.records[id].firm);
            }
            if (firms.size === 1) { out.firm = [...firms][0]; break; }
        }
        return out;
    }

    /** The search box text names a domain ("consulting", "equity research", "GST") → its slug. */
    function detectDomain(query) {
        const text = String(query || '').trim();
        if (!text || text.length > 40 || BROAD_WORDS.has(slug(text))) return null;
        const found = resolveDomain(text);
        return found && found !== 'all' ? found : null;
    }

    // "Prepared tax audit reports for 40 clients." and "... for 10 clients." are one task: the part before a trailing
    // "for / of / at / across …" names it. Shown as the plain line when the data has it, else as the most common wording.
    const TASK_TAIL = / (?:for|of|at|across) [^.]*\.?$/;
    const taskKey = line => line.replace(TASK_TAIL, '').replace(/\.$/, '').trim();

    /**
     * Group the distinct work lines into tasks: the key is the line without its trailing "for / of / at / across …"
     * part, and a key of three or more words that starts a longer, commoner key joins it ("Filed GSTR-1 and GSTR-3B" →
     * "Filed GSTR-1 and GSTR-3B returns"). Each task is shown as its plain line when the data has one, else as its most
     * common wording.
     */
    function taskGroups(lineCount) {
        const task = new Map();
        const size = new Map();
        for (const [line, n] of lineCount) {
            const key = taskKey(line);
            task.set(line, key);
            size.set(key, (size.get(key) || 0) + n);
        }
        const byStart = new Map();
        const start = key => key.split(' ').slice(0, 3).join(' ');
        for (const key of size.keys()) {
            if (!byStart.has(start(key))) byStart.set(start(key), []);
            byStart.get(start(key)).push(key);
        }
        const into = new Map();
        for (const key of size.keys()) {
            if (key.split(' ').length < 3) continue;
            let best = null;
            for (const other of byStart.get(start(key))) {
                if (other !== key && other.startsWith(`${key} `) && size.get(other) >= size.get(key) &&
                    (!best || size.get(other) > size.get(best))) best = other;
            }
            if (best) into.set(key, best);
        }
        const resolve = key => { let out = key; for (let i = 0; i < 5 && into.has(out); i++) out = into.get(out); return out; };
        const taskText = new Map();
        for (const [line, n] of lineCount) {
            const own = task.get(line);
            const key = resolve(own);
            task.set(line, key);
            const shown = taskText.get(key);
            const plain = line === `${key}.`;
            if (!shown || (plain && !shown.plain) || (!shown.plain && !plain && n > shown.n)) taskText.set(key, { text: line, n, plain });
        }
        return { task, taskText };
    }

    // ---------- The model: what the first page needs, at once; the search index later ----------
    function prepare(data) {
        if (!data || data.version !== DATA_VERSION || !Array.isArray(data.records)) throw new Error('Experiences unavailable');
        const order = Array.isArray(data.tagOrder) ? data.tagOrder.map(String) : DOMAINS.map(d => d.slug);
        const bit = Object.create(null);
        order.forEach((name, index) => { if (index < 31) bit[name] = 1 << index; });
        const records = data.records.map(record => {
            const bullets = Array.isArray(record.bullets) ? record.bullets.map(String) : [];
            const tags = Array.isArray(record.tags) ? record.tags : [];
            return {
                firm: String(record.firm || ''),
                city: record.city ? String(record.city) : null,
                domains: Array.isArray(record.domains) ? record.domains.filter(d => typeof d === 'string') : [],
                labels: Array.isArray(record.labels) ? record.labels.map(String) : [],
                bullets,
                skills: Array.isArray(record.skills) ? record.skills.map(String) : [],
                masks: bullets.map((_, i) => (Number.isInteger(tags[i]) ? tags[i] : 0))
            };
        });
        // Stock lines ("Prepared tax audit reports in Form 3CD.") appear hundreds of times; rare lines are the concrete work.
        const lineCount = new Map();
        for (const record of records) for (const bullet of record.bullets) lineCount.set(bullet, (lineCount.get(bullet) || 0) + 1);
        const specific = records.map(record => record.bullets.filter(b => lineCount.get(b) < STOCK).length +
            record.bullets.reduce((sum, b) => sum + 1 / lineCount.get(b), 0) / 10);
        // A card made only of stock lines says nothing the common-work block does not.
        const stockOnly = records.map(record => record.bullets.every(b => lineCount.get(b) >= STOCK));
        const sameWork = records.map(record => [...record.bullets].sort().join('\n'));
        const cityCount = new Map();
        for (const record of records) {
            const group = cityGroup(record.city);
            if (group) cityCount.set(group, (cityCount.get(group) || 0) + 1);
        }
        // Task groups for "Most common work here".
        const { task, taskText } = taskGroups(lineCount);
        const firmBySlug = new Map();
        const firmCards = new Map();
        for (const record of records) {
            if (!firmBySlug.has(slug(record.firm))) firmBySlug.set(slug(record.firm), record.firm);
            firmCards.set(record.firm, (firmCards.get(record.firm) || 0) + 1);
        }
        const bigFirms = new Set([...firmCards].filter(([, n]) => n >= BIG_FIRM).map(([firm]) => firm));
        return {
            records, specific, stockOnly, sameWork, bit, task, taskText, firmBySlug, bigFirms,
            cityNames: [...cityCount.keys()],
            cards: records.length,
            firms: new Set(records.map(record => record.firm)).size,
            index: null
        };
    }

    // The search index: one normalised text per card part. Built in idle time after the first page, or at once when a
    // search needs it. Each distinct string is normalised once (1,278 distinct work lines for 8,692 lines).
    function indexRecord(record, norm, plain) {
        const firm = plain(record.firm);
        const initials = (firm.match(/^(?:[a-z] )+[a-z]\b/) || [''])[0].replace(/ /g, '');
        const head = [norm(record.firm), firm.replace(/ /g, ''), initials, norm(record.city),
            BRAND_WORDS[record.firm] || '', cityGroup(record.city) === 'Delhi NCR' ? 'delhi ncr' : ''].join(' ');
        const lines = record.bullets.map(bullet => ` ${norm(bullet)} `);
        const skills = ` ${record.skills.map(norm).join(' ')} `;
        const extra = [
            ...record.domains.map(d => norm(`${domainLabel(d)} ${DOMAIN_WORDS[d] || ''}`)),
            ...record.labels.map(label => norm(`${label} ${LABEL_WORDS[label] || ''}`))
        ].join(' ');
        const pad = text => ` ${text.replace(/\s+/g, ' ').trim()} `;
        const headText = pad(head);
        return { head: headText, lines, all: headText + lines.join('') + skills, extra: ` ${pad(extra)} ` };
    }

    function indexStep(model, deadline) {
        if (!model.index) {
            const memo = new Map();
            const memoPlain = new Map();
            const cached = (cache, value, make) => {
                if (value == null) return '';
                let out = cache.get(value);
                if (out === undefined) { out = make(value); cache.set(value, out); }
                return out;
            };
            model.index = {
                done: 0, cards: new Array(model.records.length),
                norm: value => cached(memo, value, normalise),
                plain: value => cached(memoPlain, value, text => normalise(text, false))
            };
        }
        const ix = model.index;
        while (ix.done < model.records.length) {
            ix.cards[ix.done] = indexRecord(model.records[ix.done], ix.norm, ix.plain);
            ix.done++;
            if (deadline && ix.done % 20 === 0 && deadline()) break;
        }
        return ix.done >= model.records.length;
    }

    /** Build the whole search index now (a search needs it). */
    function ensureIndex(model) {
        if (!model.index || model.index.done < model.records.length) indexStep(model, null);
        return model.index;
    }

    // ---------- URL state ----------
    /**
     * URL query → { q, firm ('' = every firm), domain ('' = all), city ('' = all), nocity, from: 'url' | 'mine' | null },
     * plus `badCity` when ?city= names a city no card has.
     */
    function readState(search, options) {
        const opts = options || {};
        const params = new URLSearchParams(typeof search === 'string' ? search : '');
        const q = (params.get('q') || '').slice(0, 120);
        const firm = resolveFirm(params.get('firm'), opts.model);
        const rawDomain = params.get('domain');
        let domain = '';
        let from = null;
        if (rawDomain !== null && rawDomain.trim() !== '') {
            const resolved = resolveDomain(rawDomain);
            if (resolved && resolved !== 'all') { domain = resolved; from = 'url'; }
            else if (resolved === 'all') from = 'url';
        }
        // "My domain" fills a bare open only: a deep link (?q=, ?city=) shows exactly what it names.
        const deepLink = ['q', 'city', 'firm'].some(key => (params.get(key) || '').trim() !== '');
        if (!from && !deepLink && opts.myDomain) {
            const mine = resolveDomain(opts.myDomain);
            if (mine && mine !== 'all') { domain = mine; from = 'mine'; }
        }
        const rawCity = params.get('city');
        const city = resolveCity(rawCity, opts.model);
        const nocity = Boolean(city) && params.get('nocity') === '1';
        const state = { q, firm, domain, city, nocity, from };
        if (!city && slug(rawCity)) state.badCity = tidyCity(slug(rawCity));
        return state;
    }

    /**
     * State → '?q=…&firm=…&domain=…&city=…&nocity=1' ('' when nothing is set). `domain=all` only on a bare page that
     * would otherwise open on "my domain" (a link with q, firm or city is never narrowed by it).
     */
    function writeSearch(state, options) {
        const opts = options || {};
        const params = new URLSearchParams();
        const q = String(state.q || '').trim();
        const firm = String(state.firm || '').trim();
        if (q) params.set('q', q);
        if (firm) params.set('firm', firm);
        if (state.domain) params.set('domain', state.domain);
        else if (opts.myDomain && !q && !state.city && !firm) params.set('domain', 'all');
        if (state.city) params.set('city', slug(state.city));
        if (state.city && state.nocity) params.set('nocity', '1');
        const text = params.toString();
        return text ? `?${text}` : '';
    }

    // ---------- Querying ----------
    /**
     * How well a card answers the search: 3 = the words as one phrase in one work line (or a firm/city search the card
     * fully answers), 2 = all the words in one work line, 1 = the words spread over the card, 0 = no match.
     * Words found (whole) in the firm or city line are not looked for in the work.
     * When the other words name a domain ("bank audit", "BDO Mumbai stat audit"), 2 goes to the cards with that domain's
     * work instead (plus a tenth for each of its lines, up to 3), the words found elsewhere get 1, and a search that also
     * names the firm or city finds that firm's domain cards even when no line says the words.
     */
    function workTokens(card, queryTokens) {
        return queryTokens.filter(token => !inHead(card, token));
    }

    function scoreCard(model, id, card, queryTokens, memo) {
        const textual = queryTokens.every(token => hasToken(card.all, token));
        const work = workTokens(card, queryTokens);
        if (!work.length) return textual ? 3 : 0;
        const last = work[work.length - 1];
        const phrase = ` ${work.join(' ')}${last.length <= 2 ? ' ' : ''}`;
        if (textual && card.lines.some(line => line.includes(phrase))) return 3;
        const named = namedDomain(work, memo);
        if (named) {
            const record = model.records[id];
            const bit = model.bit[named] || 0;
            const lines = record.masks.reduce((n, mask) => n + ((mask & bit) ? 1 : 0), 0);
            // Found on its domain alone, a card must carry the domain the filter uses too (its lines rank it).
            if (textual ? lines > 0 || record.domains.includes(named) : work.length < queryTokens.length && record.domains.includes(named)) {
                return 2 + Math.min(3, lines) / 10;
            }
            return textual ? 1 : 0;
        }
        if (!textual) return 0;
        return card.lines.some(line => work.every(token => hasToken(line, token))) ? 2 : 1;
    }

    /** The search words left after the firm and city, when they name a domain ("statutory audit", "GST"): its slug. */
    function namedDomain(work, memo) {
        if (!work.length) return null;
        const key = work.join(' ');
        if (!memo) return detectDomain(key);
        if (!memo.has(key)) memo.set(key, detectDomain(key));
        return memo.get(key);
    }

    // The domains whose names and synonyms hold every word (a search that found nothing in the cards' own text).
    function broadDomains(model, queryTokens) {
        const ix = ensureIndex(model);
        return DOMAINS.map(d => d.slug).filter(d => {
            const labels = Object.keys(LABEL_DOMAIN).filter(label => LABEL_DOMAIN[label] === d);
            const text = ` ${[domainLabel(d), DOMAIN_WORDS[d] || '', ...labels, ...labels.map(label => LABEL_WORDS[label] || '')].map(ix.norm).join(' ')} `;
            return queryTokens.every(token => hasToken(text, token));
        });
    }

    /**
     * The card labels ("International tax") whose name and words hold every search word. Weak words alone ("company",
     * "tax") name a label only when they are its whole name ("company law").
     */
    function labelsFor(model, queryTokens) {
        if (!queryTokens.length) return [];
        const ix = ensureIndex(model);
        const strong = queryTokens.some(token => !WEAK_WORDS.has(token));
        return Object.keys(LABEL_WORDS).filter(label => {
            const text = ` ${ix.norm(`${label} ${LABEL_WORDS[label]}`)} `;
            if (!queryTokens.every(token => hasToken(text, token))) return false;
            return strong || ix.norm(label).split(' ').map(stem).every(word => queryTokens.includes(word));
        });
    }

    /**
     * The one domain a search names, if any: by its name ("GST", "consulting"), by a card label ("international tax" →
     * Direct tax) or by a domain's plain words ("mergers" → M&A tax). Broad words alone ("tax", "audit") name none.
     */
    function suggestDomain(model, q, queryTokens) {
        const named = detectDomain(q);
        if (named) return named;
        const fromLabels = [...new Set(labelsFor(model, queryTokens).map(label => LABEL_DOMAIN[label]))];
        if (fromLabels.length === 1) return fromLabels[0];
        if (!queryTokens.length || queryTokens.every(token => WEAK_WORDS.has(token))) return null;
        const broad = broadDomains(model, queryTokens);
        return broad.length === 1 ? broad[0] : null;
    }

    function match(model, queryTokens) {
        const ix = ensureIndex(model);
        const ids = [];
        const scores = new Map();
        const memo = new Map();
        for (let id = 0; id < model.records.length; id++) {
            const score = scoreCard(model, id, ix.cards[id], queryTokens, memo);
            if (score) { ids.push(id); scores.set(id, score); }
        }
        // A search that names a card label ("international tax", "DTAA") also lists every card with that label, after the
        // cards whose own words answer it.
        const labels = labelsFor(model, queryTokens);
        if (labels.length) {
            for (let id = 0; id < model.records.length; id++) {
                if (!scores.has(id) && model.records[id].labels.some(label => labels.includes(label))) { ids.push(id); scores.set(id, 0.5); }
            }
        }
        let broad = false;
        let via = [];
        if (!ids.length) {
            // Nothing in the work, firm, city or skills: let the domain names and their synonyms answer.
            broad = true;
            for (let id = 0; id < model.records.length; id++) {
                const card = ix.cards[id];
                if (queryTokens.every(token => hasToken(card.all, token) || hasToken(card.extra, token))) { ids.push(id); scores.set(id, 1); }
            }
            via = ids.length ? broadDomains(model, queryTokens) : [];
        }
        const labelDomains = [...new Set(labels.map(label => LABEL_DOMAIN[label]))];
        return { ids, scores, broad, via, labels, focus: labelDomains.length === 1 ? labelDomains[0] : '' };
    }

    /** How many of a card's work lines belong to `domain` (0 when no domain is chosen). */
    function domainLines(model, id, domain) {
        const mask = domain ? model.bit[domain] : 0;
        if (!mask) return 0;
        return model.records[id].masks.reduce((sum, m) => sum + ((m & mask) ? 1 : 0), 0);
    }

    // In one round, the cards of the largest firms (BIG_FIRM cards or more) take at most one place in three while other
    // firms' cards last, so a student aiming at a mid-size firm sees mid-size firms from the first card.
    function spread(model, ids) {
        const big = [];
        const other = [];
        for (const id of ids) (model.bigFirms && model.bigFirms.has(model.records[id].firm) ? big : other).push(id);
        if (!big.length || !other.length) return ids;
        const out = [];
        for (let b = 0, o = 0; b < big.length || o < other.length;) {
            if (o < other.length) out.push(other[o++]);
            if (b < big.length) out.push(big[b++]);
            if (o < other.length) out.push(other[o++]);
        }
        return out;
    }

    // One card per firm in turn, each firm where its most specific card stands (`ids` come most specific first), so the
    // first page shows many firms and a firm with many cards is not put first for that alone.
    function interleave(model, ids) {
        const groups = new Map();
        for (const id of ids) {
            const key = model.records[id].firm;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(id);
        }
        const ordered = [...groups.values()];
        const total = ordered.reduce((sum, group) => sum + group.length, 0);
        const out = [];
        for (let round = 0; out.length < total; round++) {
            out.push(...spread(model, ordered.filter(group => round < group.length).map(group => group[round])));
        }
        return out;
    }

    /**
     * Display order. When the cards with no city are included, the chosen city's own cards all come first. Then tiers:
     * how well a card answers the search, then how many of its lines are the chosen domain's work (counted up to 3);
     * inside a tier the most specific work first, one card per firm in turn (in the order of each firm's best card). A card whose tasks repeat, word for word,
     * a card already listed moves to the end (of its city group), so a page never shows the same work twice while every
     * card stays counted and reachable.
     */
    function arrange(model, ids, options) {
        const opts = options || {};
        if (opts.nocity) {
            const known = ids.filter(id => model.records[id].city);
            const unknown = ids.filter(id => !model.records[id].city);
            const rest = Object.assign({}, opts, { nocity: false });
            return arrange(model, known, rest).concat(arrange(model, unknown, rest));
        }
        const tier = new Map();
        for (const id of ids) {
            const score = opts.scores ? opts.scores.get(id) || 0 : 0;
            tier.set(id, Math.round(score * 10) + Math.min(3, domainLines(model, id, opts.domain)));
        }
        const sorted = [...ids].sort((a, b) => tier.get(b) - tier.get(a) || model.specific[b] - model.specific[a] || a - b);
        const seen = new Set();
        const first = [];
        const repeats = [];
        for (const id of sorted) {
            if (seen.has(model.sameWork[id])) repeats.push(id);
            else { seen.add(model.sameWork[id]); first.push(id); }
        }
        const out = [];
        for (let start = 0; start < first.length;) {
            let end = start;
            while (end < first.length && tier.get(first[end]) === tier.get(first[start])) end++;
            out.push(...interleave(model, first.slice(start, end)));
            start = end;
        }
        return out.concat(repeats);
    }

    /** The most common tasks in these cards (the chosen domain's lines only), each counted once per card. */
    function commonWork(model, ids, domain, limit) {
        const mask = domain ? model.bit[domain] || 0 : 0;
        const counts = new Map();
        for (const id of ids) {
            const record = model.records[id];
            const seen = new Set();
            record.bullets.forEach((line, i) => {
                if (domain && !(record.masks[i] & mask)) return;
                const key = model.task.get(line);
                if (seen.has(key)) return;
                seen.add(key);
                counts.set(key, (counts.get(key) || 0) + 1);
            });
        }
        return [...counts].filter(([, n]) => n >= 2)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, limit || COMMON_LINES)
            .map(([key, n]) => ({ text: model.taskText.get(key).text, n }));
    }

    /** The firms with the most cards here (firms with one card only fill up a short list). */
    function topFirms(model, ids, limit) {
        const counts = new Map();
        for (const id of ids) {
            const firm = model.records[id].firm;
            counts.set(firm, (counts.get(firm) || 0) + 1);
        }
        const sorted = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
        const several = sorted.filter(([, n]) => n >= 2).length;
        return sorted.slice(0, Math.min(limit || FIRM_CHIPS, Math.max(several, FIRM_FILL))).map(([firm, n]) => ({ firm, n }));
    }

    /** Run a search: the cards in display order, plus the counts each filter would show. */
    function run(model, state) {
        const queryTokens = tokens(state.q);
        const searched = queryTokens.length ? match(model, queryTokens) : null;
        const firm = state.firm || '';
        let found = searched ? searched.ids : model.records.map((_, id) => id);
        if (firm) found = found.filter(id => model.records[id].firm === firm);
        const domain = state.domain || '';
        const city = state.city || '';
        const nocity = Boolean(city && state.nocity);
        const domainCounts = new Map(DOMAINS.map(d => [d.slug, 0]));
        const cityCounts = new Map();
        let domainTotal = 0;
        let cityTotal = 0;
        let noCity = 0;
        const ids = [];
        for (const id of found) {
            const record = model.records[id];
            const group = cityGroup(record.city);
            const inDomain = !domain || record.domains.includes(domain);
            const inCity = !city || group === city || (nocity && !record.city);
            if (inCity) {
                domainTotal++;
                for (const d of record.domains) domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
            }
            if (inDomain) {
                cityTotal++;
                if (group) cityCounts.set(group, (cityCounts.get(group) || 0) + 1);
                else noCity++;
            }
            if (inDomain && inCity) ids.push(id);
        }
        // A search answered by a domain's synonyms, or by a card label ("international tax"), ranks the cards and their
        // lines by that domain's work.
        const focus = searched ? (searched.broad && searched.via.length === 1 ? searched.via[0] : searched.focus || '') : '';
        const ordered = arrange(model, ids, { scores: searched ? searched.scores : null, domain: domain || focus, nocity });
        const browsing = !queryTokens.length;
        // At a glance counts the chosen city's own cards only, never the cards that name no city.
        const own = nocity ? ids.filter(id => model.records[id].city) : ids;
        const common = browsing && own.length >= THIN ? commonWork(model, own, domain) : [];
        // A domain or firm view lists the cards with work of their own first; the cards made only of lines ten or more
        // cards share come last, folded (the common-work block says how many; "Show more" reaches them).
        let list = ordered;
        let folded = 0;
        if (browsing && (domain || firm) && common.length >= 2) {
            const specific = ordered.filter(id => !model.stockOnly[id]);
            if (specific.length && specific.length < ordered.length) {
                folded = ordered.length - specific.length;
                list = specific.concat(ordered.filter(id => model.stockOnly[id]));
            }
        }
        return {
            ids: list, total: ids.length, found: found.length, tokens: queryTokens,
            broad: searched ? searched.broad : false, via: searched ? searched.via : [],
            labels: searched ? searched.labels : [], focus, folded,
            domainCounts, domainTotal, cityCounts, cityTotal, noCity,
            common, firms: browsing && !firm ? topFirms(model, own) : []
        };
    }

    // ---------- One card's lines: the search's lines first, then the domain's, then the rest ----------
    const MARK_WORDS = {
        tp: 'transfer[- ]pricing|TP', ifc: 'internal financial controls?|ICFR|IFCR|IFC', fdd: 'financial due diligence|FDD',
        gst: 'GST[A-Za-z0-9-]*|IGST|CGST|SGST|indirect tax', statutory: 'statutory|stat(?![A-Za-z])', modelling: 'modell?ing',
        diligence: 'due diligence|diligence', big4: 'big ?(?:4|four)', tax: 'tax(?:ation)?',
        income: 'income|ITRs?', return: 'returns?|ITRs?', file: 'fil(?:e|ed|es|ing)'
    };
    const escapeRe = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    function markPattern(work) {
        if (!work.length) return null;
        const parts = work.map(token => MARK_WORDS[token]
            ? `(?:${MARK_WORDS[token]})${token.length <= 2 ? '(?![A-Za-z0-9])' : '[A-Za-z0-9]*'}`
            : `${escapeRe(token)}${token.length <= 2 ? '(?![A-Za-z0-9])' : '[A-Za-z0-9]*'}`);
        try { return new RegExp(`(^|[^A-Za-z0-9])(${parts.join('|')})`, 'gi'); } catch (_) { return null; }
    }

    /** [{ text, rank, marked: [[start, end]…] }] in display order. rank 0–2 = search match, 3 = domain line, 4 = rest. */
    function cardLines(model, id, context) {
        const ctx = context || {};
        const record = model.records[id];
        const card = ctx.tokens && ctx.tokens.length ? ensureIndex(model).cards[id] : null;
        const work = card ? workTokens(card, ctx.tokens) : [];
        const last = work[work.length - 1] || '';
        const phrase = work.length ? ` ${work.join(' ')}${last.length <= 2 ? ' ' : ''}` : '';
        // "BDO Mumbai stat audit": the statutory audit lines come next when no line says the words.
        const named = namedDomain(work);
        const mask = (ctx.domain ? model.bit[ctx.domain] || 0 : 0) | (named ? model.bit[named] || 0 : 0);
        const pattern = markPattern(work);
        const ranks = record.bullets.map((text, i) => {
            let rank = 4;
            if (work.length) {
                const line = card.lines[i];
                if (line.includes(phrase)) rank = 0;
                else if (work.every(token => hasToken(line, token))) rank = 1;
                // one word of a domain's name ("statutory dues" for "stat audit") is not a match
                else if (!named && work.some(token => hasToken(line, token))) rank = 2;
            }
            if (rank === 4 && mask && (record.masks[i] & mask)) rank = 3;
            return rank;
        });
        // Marks go on the lines that hold every word; a card whose words are spread marks its partial lines instead.
        const markUpTo = ranks.some(rank => rank <= 1) ? 1 : 2;
        const lines = record.bullets.map((text, i) => {
            const rank = ranks[i];
            const marked = [];
            if (rank <= markUpTo && pattern) {
                pattern.lastIndex = 0;
                let found;
                while ((found = pattern.exec(text))) {
                    const start = found.index + found[1].length;
                    const end = start + found[2].length;
                    const prev = marked[marked.length - 1];
                    // "stock audits" is one mark, not two
                    if (prev && /^[\s-]*$/.test(text.slice(prev[1], start))) prev[1] = end;
                    else marked.push([start, end]);
                    if (!found[0].length) pattern.lastIndex++;
                }
            }
            return { text, rank, index: i, marked };
        });
        return lines.sort((a, b) => a.rank - b.rank || a.index - b.index);
    }

    function roadmapHref(domain) {
        return `${ROADMAPS}#${encodeURIComponent(domain)}`;
    }

    // ---------- The page ----------
    const number = value => Number(value).toLocaleString('en-IN');

    function el(doc, tag, className, text) {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined && text !== null && text !== '') node.textContent = text;
        return node;
    }

    const SEARCH_ICON = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"></circle><path d="m16 16 4.5 4.5"></path></svg>';

    const plainClick = event => !(event.defaultPrevented || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey);

    /**
     * Mount the Explorer into `container`.
     * options: { location, history, myDomain, signedIn, pageSize, debounceMs, inputDelayMs, idle (null = no idle
     *   indexing), model (an already prepared model), onStats(model), matchMedia (default window.matchMedia) }
     * Returns { state(), result(), set(partial), setMyDomain(slug), flush(), model, destroy() }.
     */
    function mount(container, data, options) {
        const opts = options || {};
        const doc = container.ownerDocument;
        const win = doc.defaultView || root;
        const loc = opts.location || win.location;
        const hist = opts.history === undefined ? win.history : opts.history;
        const pageSize = opts.pageSize || PAGE_SIZE;
        const debounceMs = opts.debounceMs === undefined ? 250 : opts.debounceMs;
        const model = opts.model || prepare(data);
        const myDomain = opts.myDomain ? resolveDomain(opts.myDomain) : null;
        let mine = myDomain && myDomain !== 'all' ? myDomain : null;
        let state = readState(loc && loc.search ? loc.search : '', { model, myDomain: mine });
        // A ?city= that no card names: said once, then forgotten.
        let badCity = state.badCity || '';
        delete state.badCity;
        const media = opts.matchMedia !== undefined ? opts.matchMedia : (typeof win.matchMedia === 'function' ? q => win.matchMedia(q) : null);
        const phone = media ? media(PHONE) : null;
        let result = null;
        let limit = pageSize;
        let open = false; // the folded cards (only common work) are shown
        let urlTimer = null;
        let inputTimer = null;
        let idleHandle = null;

        // Form
        const form = el(doc, 'form', 'xp-form');
        form.setAttribute('role', 'search');
        form.setAttribute('action', '');
        const searchLabel = el(doc, 'label', 'xp-sr', 'Search firms, cities and tasks');
        searchLabel.htmlFor = 'xp-q';
        const wrap = el(doc, 'div', 'xp-q-wrap');
        wrap.innerHTML = SEARCH_ICON;
        const input = el(doc, 'input', 'xp-q');
        Object.assign(input, { id: 'xp-q', type: 'search', name: 'q', placeholder: 'Try: BDO Mumbai stat audit', autocomplete: 'off', spellcheck: false });
        input.setAttribute('enterkeyhint', 'search');
        input.value = state.q;
        wrap.append(input);
        const filters = el(doc, 'div', 'xp-filters');
        const domainField = el(doc, 'div', 'xp-field');
        const domainLabelEl = el(doc, 'label', '', 'Domain');
        domainLabelEl.htmlFor = 'xp-domain';
        const domainSelect = el(doc, 'select', '');
        domainSelect.id = 'xp-domain';
        domainSelect.name = 'domain';
        domainField.append(domainLabelEl, domainSelect);
        const cityField = el(doc, 'div', 'xp-field');
        const cityLabelEl = el(doc, 'label', '', 'City');
        cityLabelEl.htmlFor = 'xp-city';
        const citySelect = el(doc, 'select', '');
        citySelect.id = 'xp-city';
        citySelect.name = 'city';
        cityField.append(cityLabelEl, citySelect);
        filters.append(domainField, cityField);
        form.append(searchLabel, wrap, filters);

        // Status row (the count is the live region, also when nothing matches), hint, at-a-glance, empty, results, more
        const status = el(doc, 'div', 'xp-status');
        const countWrap = el(doc, 'div', 'xp-count-wrap');
        const count = el(doc, 'p', 'xp-count');
        count.id = 'xp-count';
        count.setAttribute('role', 'status');
        count.setAttribute('aria-live', 'polite');
        count.setAttribute('aria-atomic', 'true');
        const noCityButton = el(doc, 'button', 'xp-nocity');
        noCityButton.type = 'button';
        countWrap.append(count, noCityButton);
        const actions = el(doc, 'div', 'xp-actions');
        const roadmap = el(doc, 'a', 'xp-roadmap');
        const allFirms = el(doc, 'button', 'xp-allfirms', 'All firms');
        allFirms.type = 'button';
        const clear = el(doc, 'button', 'xp-clear', 'Clear all');
        clear.type = 'button';
        actions.append(roadmap, allFirms, clear);
        status.append(countWrap, actions);
        const hint = el(doc, 'div', 'xp-hint');
        const glance = el(doc, 'section', 'xp-glance');
        glance.setAttribute('aria-label', 'At a glance');
        const empty = el(doc, 'div', 'xp-empty ap-card');
        const results = el(doc, 'section', 'xp-results');
        results.setAttribute('aria-label', 'Articleship experiences');
        const moreWrap = el(doc, 'div', 'xp-more');
        const more = el(doc, 'button', 'ap-btn is-secondary', 'Show more');
        more.type = 'button';
        moreWrap.append(more);
        // The way on: a nearby domain when this one is thin, then the roadmap, the firms to apply to and Day 5.
        const next = el(doc, 'section', 'xp-next');
        next.setAttribute('aria-label', 'What next');
        container.replaceChildren(form, status, hint, glance, empty, results, moreWrap, next);

        const hrefFor = target => `${loc && loc.pathname ? loc.pathname : ''}${writeSearch(target, { myDomain: mine }) || '?'}`;

        // Each option carries its count; the chosen one shows its name alone (the count line says how many), so a closed
        // select on a phone never cuts the name short.
        function fillDomains() {
            const options = [el(doc, 'option', '', 'All domains')];
            options[0].value = '';
            for (const d of DOMAINS) {
                const chosen = d.slug === state.domain;
                const option = el(doc, 'option', '', chosen ? d.label : `${d.label} · ${number(result.domainCounts.get(d.slug) || 0)}`);
                option.value = d.slug;
                options.push(option);
            }
            domainSelect.replaceChildren(...options);
            domainSelect.value = state.domain || '';
        }

        function fillCities() {
            const entries = [...result.cityCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
            if (state.city && !result.cityCounts.has(state.city)) entries.push([state.city, 0]);
            const options = [el(doc, 'option', '', 'All cities')];
            options[0].value = '';
            for (const [name, n] of entries) {
                const option = el(doc, 'option', '', name === state.city ? name : `${name} · ${number(n)}`);
                option.value = name;
                options.push(option);
            }
            citySelect.replaceChildren(...options);
            citySelect.value = state.city || '';
        }

        function card(id) {
            const record = model.records[id];
            const node = el(doc, 'article', 'xp-card');
            const heading = el(doc, 'h2', 'xp-firm');
            if (state.firm === record.firm) heading.textContent = record.firm;
            else {
                const firmLink = el(doc, 'a', 'xp-firm-link', record.firm);
                firmLink.href = hrefFor({ q: '', firm: record.firm, domain: '', city: '', nocity: false });
                firmLink.dataset.firm = record.firm;
                firmLink.title = `Every experience at ${record.firm}`;
                heading.append(firmLink);
            }
            node.append(heading);
            if (record.city) node.append(el(doc, 'p', 'xp-city', record.city));
            else if (state.city && state.nocity) node.append(el(doc, 'p', 'xp-city is-unknown', 'City not given'));
            if (record.domains.length) {
                const tags = el(doc, 'div', 'xp-tags');
                for (const d of record.domains) {
                    const tag = el(doc, 'button', 'xp-tag', domainLabel(d));
                    tag.type = 'button';
                    tag.dataset.domain = d;
                    const active = d === state.domain;
                    tag.setAttribute('aria-pressed', active ? 'true' : 'false');
                    tag.title = active ? 'Show all domains' : `Show ${domainLabel(d)} only`;
                    tags.append(tag);
                }
                node.append(tags);
            }
            if (record.bullets.length) {
                const list = el(doc, 'ul', 'xp-work');
                for (const line of cardLines(model, id, { tokens: result.tokens, domain: state.domain || result.focus })) {
                    const item = el(doc, 'li', line.rank <= 2 ? 'is-match' : line.rank === 3 ? 'is-domain' : '');
                    let at = 0;
                    for (const [start, end] of line.marked) {
                        if (start > at) item.append(doc.createTextNode(line.text.slice(at, start)));
                        item.append(el(doc, 'mark', '', line.text.slice(start, end)));
                        at = end;
                    }
                    if (at < line.text.length) item.append(doc.createTextNode(line.text.slice(at)));
                    list.append(item);
                }
                node.append(list);
            }
            if (record.skills.length) {
                const skills = el(doc, 'p', 'xp-skills');
                skills.append(el(doc, 'strong', '', 'Skills'), doc.createTextNode(' ' + record.skills.join(' · ')));
                node.append(skills);
            }
            return node;
        }

        // Where the folded cards (only common work) start; "Show more" stops there once, then offers them (`open`).
        const foldAt = () => result.total - result.folded;
        const reach = () => (open ? result.total : foldAt());
        const shownCount = () => Math.min(limit, reach());

        function renderCards() {
            const shown = shownCount();
            results.replaceChildren(...result.ids.slice(0, shown).map(card));
            const atFold = !open && result.folded > 0 && shown === foldAt();
            const left = reach() - shown;
            if (atFold) {
                more.textContent = `Show ${number(result.folded)} more with only common work`;
                more.dataset.fold = '1';
            } else {
                more.textContent = left > pageSize ? `Show more · ${number(left)} left` : `Show ${number(left)} more`;
                delete more.dataset.fold;
            }
            moreWrap.hidden = !atFold && left <= 0;
            placeGlance();
        }

        // On a phone the at-a-glance block sits after the first cards, so the first screen shows real work.
        function placeGlance() {
            const cards = results.querySelectorAll('.xp-card');
            const inline = Boolean(phone && phone.matches) && !glance.hidden && cards.length > GLANCE_AFTER;
            if (inline) {
                if (glance.parentNode !== results || glance.previousElementSibling !== cards[GLANCE_AFTER - 1]) results.insertBefore(glance, cards[GLANCE_AFTER]);
            } else if (glance.parentNode !== container || glance.nextSibling !== empty) {
                container.insertBefore(glance, empty);
            }
            glance.classList.toggle('is-inline', inline);
        }

        function emptyTitle() {
            const q = state.q.trim();
            const where = state.city ? ` in ${state.city}` : '';
            if (q) return `Nothing matches “${q}”${state.domain || state.city || state.firm ? ' with these filters' : ''}.`;
            if (state.firm) return `No ${state.domain ? `${domainLabel(state.domain)} ` : ''}experiences at ${state.firm}${where}.`;
            if (state.domain) return `No ${domainLabel(state.domain)} experiences${where}.`;
            return `No experiences in ${state.city}.`;
        }

        function renderStatus() {
            const none = result.total === 0;
            // With no cards the live region still speaks: it carries the empty state's title, shown only to screen readers.
            // On a phone the count shows the number (and the firm) only; the domain and city stay for screen readers, as the
            // selects already show them.
            count.replaceChildren();
            if (none) count.textContent = emptyTitle();
            else {
                count.append(el(doc, 'span', 'xp-count-n', `${number(result.total)} ${result.total === 1 ? 'experience' : 'experiences'}`));
                if (state.firm) count.append(el(doc, 'span', 'xp-count-firm', ` at ${state.firm}`));
                const where = [state.domain ? domainLabel(state.domain) : '', state.city].filter(Boolean).join(' · ');
                if (where) count.append(el(doc, 'span', 'xp-count-where', ` · ${where}${state.city && state.nocity ? ' + city not given' : ''}`));
                if (state.domain && state.from === 'mine') count.append(el(doc, 'span', 'xp-count-mine', ' (your domain)'));
            }
            count.classList.toggle('xp-sr', none);
            status.classList.toggle('is-empty', none);
            noCityButton.hidden = none || !state.city || (!state.nocity && !result.noCity);
            if (!noCityButton.hidden) {
                noCityButton.textContent = state.nocity ? `${state.city} only` : `+ ${number(result.noCity)} with no city given`;
                noCityButton.setAttribute('aria-pressed', state.nocity ? 'true' : 'false');
            }
            actions.hidden = none;
            roadmap.hidden = !state.domain;
            if (state.domain) {
                roadmap.href = roadmapHref(state.domain);
                // "Statutory audit roadmap"; on a phone just "Roadmap" (the domain is in the select above it)
                roadmap.replaceChildren(el(doc, 'span', 'xp-roadmap-domain', `${domainLabel(state.domain)} `),
                    el(doc, 'span', 'xp-roadmap-word', 'roadmap'));
                roadmap.setAttribute('aria-label', `${domainLabel(state.domain)} roadmap`);
            }
            allFirms.hidden = !state.firm;
            clear.hidden = !(state.q.trim() || state.domain || state.city || state.firm);
        }

        function hintButton(domain, n, keepQuery) {
            const button = el(doc, 'button', 'xp-hint-btn', `Show ${domainLabel(domain)} only · ${number(n)}`);
            button.type = 'button';
            button.dataset.domain = domain;
            if (keepQuery) button.dataset.keep = 'q';
            return button;
        }

        function domainCount(domain) {
            return run(model, Object.assign({}, state, { domain })).total;
        }

        function renderHint() {
            hint.replaceChildren();
            const q = state.q.trim();
            if (badCity) hint.append(el(doc, 'p', 'xp-note', `No experience names a city called “${badCity}”, so every city is shown.`));
            if (q && result.broad && result.total) {
                // Nothing says the words: say so, and name the domain these cards come from.
                const via = result.via.length === 1 ? result.via[0] : '';
                hint.append(el(doc, 'p', 'xp-note', via
                    ? `No card says “${q}”. These are ${domainLabel(via)} experiences that cover it.`
                    : `No card says “${q}”. These experiences are the closest.`));
                if (via && !state.domain) {
                    const n = run(model, Object.assign({}, state, { q: '', domain: via })).total;
                    if (n > result.total) hint.append(hintButton(via, n, false));
                }
            }
            let suggested = null;
            if (!state.domain && q) {
                // The search names a domain (by name, by its plain words or by a card label): offer that domain, even when
                // some cards say the words (the box is cleared, the domain filter takes over).
                suggested = suggestDomain(model, q, result.tokens);
                if (suggested) {
                    const n = run(model, Object.assign({}, state, { q: '', domain: suggested })).total;
                    // Only when it changes what the student sees (not when the search already shows exactly that domain).
                    if (n && !(n === result.total && result.ids.every(id => model.records[id].domains.includes(suggested))) &&
                        !hint.querySelector(`[data-domain="${suggested}"]`)) {
                        hint.append(hintButton(suggested, n, false));
                    }
                }
                // A search looks across every domain; the student's own domain is one tap away (the search is kept).
                if (mine && mine !== suggested && result.total) {
                    const n = domainCount(mine);
                    if (n && n < result.total) hint.append(hintButton(mine, n, true));
                }
            }
            hint.hidden = !hint.childNodes.length;
        }

        function renderGlance() {
            glance.replaceChildren();
            const common = result.common;
            const firms = result.firms.length > 1 ? result.firms : [];
            if (common.length >= 2) {
                const block = el(doc, 'div', 'xp-common');
                block.append(el(doc, 'h2', 'xp-glance-title', 'Most common work here'));
                const list = el(doc, 'ol', 'xp-common-list');
                for (const item of common) list.append(el(doc, 'li', '', item.text));
                block.append(list);
                // The cards made only of this kind of work are folded after the others.
                if (result.folded) {
                    block.append(el(doc, 'p', 'xp-common-more', `+ ${number(result.folded)} more ${result.folded === 1 ? 'experience lists' : 'experiences list'} only common work like this. ${result.folded === 1 ? 'It comes' : 'They come'} last.`));
                }
                glance.append(block);
            }
            if (firms.length) {
                const block = el(doc, 'div', 'xp-firms-here');
                block.append(el(doc, 'h2', 'xp-glance-title', 'Firms here'));
                const chips = el(doc, 'div', 'xp-firm-chips');
                for (const item of firms) {
                    const chip = el(doc, 'a', 'xp-firm-chip');
                    chip.href = hrefFor(Object.assign({}, state, { q: '', firm: item.firm }));
                    chip.dataset.firm = item.firm;
                    chip.dataset.keep = 'filters';
                    chip.append(el(doc, 'span', 'xp-firm-chip-name', item.firm), el(doc, 'span', 'xp-firm-chip-n', number(item.n)));
                    chip.setAttribute('aria-label', `${item.firm}, ${number(item.n)} ${item.n === 1 ? 'experience' : 'experiences'}`);
                    chips.append(chip);
                }
                block.append(chips);
                glance.append(block);
            }
            glance.hidden = !glance.childNodes.length;
            glance.classList.toggle('is-two', glance.childNodes.length === 2);
        }

        function renderEmpty() {
            empty.replaceChildren();
            empty.hidden = result.total > 0;
            if (result.total > 0) return;
            const q = state.q.trim();
            empty.append(el(doc, 'h2', 'xp-empty-title', emptyTitle()));
            const tip = state.domain
                ? 'Its roadmap shows the work and the firms.'
                : state.firm && !q && !state.city ? 'Check the spelling, or search for the name.'
                    : 'Try a firm, a city or one task, such as GST or stock audit.';
            empty.append(el(doc, 'p', '', tip));
            // A search word that is a city or one firm ("articleship Pune xyz"): that city or firm, with its count.
            const buttons = [];
            if (q) {
                const place = placeIn(model, result.tokens);
                if (place.city && place.city !== state.city) {
                    const n = run(model, Object.assign({}, state, { q: '', city: place.city, nocity: false })).total;
                    if (n) buttons.push({ action: 'place-city', value: place.city, label: `Show ${place.city} · ${number(n)}` });
                }
                if (place.firm && place.firm !== state.firm) {
                    const n = run(model, Object.assign({}, state, { q: '', firm: place.firm })).total;
                    if (n) buttons.push({ action: 'place-firm', value: place.firm, label: `Show ${place.firm} · ${number(n)}` });
                }
            }
            const placed = buttons.length;
            // Then the nearest search that does show cards: every city, then every domain.
            if (state.city) {
                const n = run(model, Object.assign({}, state, { city: '', nocity: false })).total;
                if (n) buttons.push({ action: 'clear-city', label: `Show every city · ${number(n)}` });
            }
            if (buttons.length === placed && state.domain && (q || state.city || state.firm)) {
                const n = run(model, Object.assign({}, state, { domain: '' })).total;
                if (n) buttons.push({ action: 'clear-domain', label: `Show all domains · ${number(n)}` });
            }
            if (buttons.length === placed && state.firm) {
                const n = run(model, Object.assign({}, state, { firm: '', q: state.firm, domain: '', city: '', nocity: false })).total;
                if (n) buttons.push({ action: 'firm-to-q', label: `Search “${state.firm}” · ${number(n)}` });
            }
            const row = el(doc, 'div', 'xp-empty-actions');
            for (const item of buttons) {
                const button = el(doc, 'button', 'ap-btn', item.label);
                button.type = 'button';
                button.dataset.action = item.action;
                if (item.value) button.dataset.value = item.value;
                row.append(button);
            }
            if (state.domain) {
                const link = el(doc, 'a', buttons.length ? 'ap-btn is-secondary' : 'ap-btn', `Open the ${domainLabel(state.domain)} roadmap`);
                link.href = roadmapHref(state.domain);
                row.append(link);
            }
            if (!buttons.length && (q || state.domain || state.city || state.firm)) {
                const reset = el(doc, 'button', 'ap-btn is-secondary', 'Clear all');
                reset.type = 'button';
                reset.dataset.action = 'clear-all';
                row.append(reset);
            }
            empty.append(row);
        }

        // ---------- History: the URL follows every change; the depth of "Show more" and the scroll survive Back ----------
        const scrollY = () => (typeof win.scrollY === 'number' ? win.scrollY : (win.pageYOffset || 0));
        function viewState() {
            return Object.assign({}, hist && hist.state && typeof hist.state === 'object' ? hist.state : {},
                { xp: { search: loc && loc.search ? loc.search : '', limit, open, y: Math.round(scrollY()) } });
        }
        function saveView() {
            if (!hist || typeof hist.replaceState !== 'function') return;
            try { hist.replaceState(viewState(), ''); } catch (_) { /* sandboxed frames */ }
        }

        function writeUrl(now) {
            if (!hist || typeof hist.replaceState !== 'function') return;
            const apply = () => {
                urlTimer = null;
                const search = writeSearch(state, { myDomain: mine });
                const path = loc && loc.pathname ? loc.pathname : '';
                const hash = loc && loc.hash ? loc.hash : '';
                try {
                    hist.replaceState(hist.state, '', `${path}${search}${hash}`);
                    hist.replaceState(viewState(), '');
                } catch (_) { /* sandboxed frames */ }
            };
            if (urlTimer) clearTimeout(urlTimer);
            if (now || !debounceMs) apply();
            else urlTimer = setTimeout(apply, debounceMs);
        }

        function renderNext() {
            next.replaceChildren();
            next.hidden = result.total === 0;
            if (next.hidden) return;
            // A thin view: the nearest domain, as the roadmaps pair them, with its count here.
            if (state.domain && result.total < THIN) {
                for (const related of RELATED[state.domain] || []) {
                    const n = domainCount(related);
                    if (n <= result.total) continue;
                    const box = el(doc, 'div', 'xp-related');
                    box.append(el(doc, 'p', '', `${result.total === 1 ? 'Only one experience' : `Only ${number(result.total)} experiences`} here. The nearest domain:`));
                    const button = el(doc, 'button', 'xp-hint-btn', `${domainLabel(related)} · ${number(n)}`);
                    button.type = 'button';
                    button.dataset.domain = related;
                    box.append(button);
                    next.append(box);
                    break;
                }
            }
            const visitor = opts.signedIn === false;
            const box = el(doc, 'div', 'xp-next-box');
            const row = el(doc, 'div', 'xp-next-links');
            const link = (text, href, secondary, external) => {
                const a = el(doc, 'a', secondary ? 'ap-btn is-secondary' : 'ap-btn', text);
                a.href = href;
                if (external) { a.target = '_blank'; a.rel = 'noopener'; }
                row.append(a);
                return a;
            };
            if (state.firm) {
                // A firm view: how that firm hires (a Big 10 network's apply route) and its articles on LinkedIn.
                box.classList.add('is-firm');
                box.append(el(doc, 'h2', 'xp-next-title', `Next for ${state.firm}`));
                box.append(el(doc, 'p', 'xp-next-line', 'Ask one of its articles how they got in.'));
                const route = visitor ? null : routeHref(state.firm);
                if (route) link(`How to apply to ${NETWORKS[state.firm].name}`, route, false).dataset.next = 'route';
                link('Its articles on LinkedIn', linkedinFirmHref(state.firm), Boolean(route), true).dataset.next = 'linkedin';
                if (state.domain) link(`See the ${domainLabel(state.domain)} roadmap`, roadmapHref(state.domain), true).dataset.next = 'roadmap';
            } else {
                box.append(el(doc, 'h2', 'xp-next-title', 'What next?'));
                link(state.domain ? `See the ${domainLabel(state.domain)} roadmap` : 'See the domain roadmaps',
                    state.domain ? roadmapHref(state.domain) : ROADMAPS, false).dataset.next = 'roadmap';
                const firms = visitor ? null : firmsHref();
                if (firms) link('Find firms to apply to', firms, true, /^https?:/i.test(firms)).dataset.next = 'firms';
            }
            const back = el(doc, 'a', 'xp-back', visitor ? 'About the programme' : 'Back to Day 5');
            back.href = visitor ? PROGRAMME_PAGE : courseHref(5);
            box.append(row, back);
            next.append(box);
        }

        function render() {
            fillDomains();
            fillCities();
            renderStatus();
            renderHint();
            renderGlance();
            renderEmpty();
            renderCards();
            renderNext();
        }

        // how: 'initial' | 'typing' | 'push' (a new history entry) | 'restore' (from history; `keep` = the saved { limit, open })
        function update(partial, how, keep) {
            const p = partial || {};
            const has = key => Object.prototype.hasOwnProperty.call(p, key);
            const target = Object.assign({}, state, p);
            if (how === 'mine') target.from = target.domain ? 'mine' : null;
            else if (has('domain')) target.from = 'user';
            else if (has('q') && mine) {
                // "My domain" never silently narrows a search: typing looks across every domain, clearing the box returns.
                const typed = String(target.q || '').trim();
                if (typed && state.from === 'mine' && state.domain === mine) { target.domain = ''; target.from = 'mine-off'; }
                else if (!typed && state.from === 'mine-off' && !state.domain) { target.domain = mine; target.from = 'mine'; }
            }
            if (!target.city) target.nocity = false;
            if (how !== 'initial' && how !== 'mine') badCity = '';
            state = target;
            result = run(model, state);
            limit = how === 'restore' && keep ? Math.max(pageSize, Number(keep.limit) || pageSize) : pageSize;
            open = Boolean(how === 'restore' && keep && keep.open);
            render();
            if (how === 'push' && hist && typeof hist.pushState === 'function') {
                if (urlTimer) { clearTimeout(urlTimer); urlTimer = null; }
                const search = writeSearch(state, { myDomain: mine });
                try { hist.pushState({ xp: { search, limit, open, y: 0 } }, '', `${loc.pathname}${search}`); } catch (_) { writeUrl(true); }
            } else if (how !== 'initial' && how !== 'restore' && how !== 'mine') writeUrl(how !== 'typing');
        }

        function scrollToStatus() {
            const target = result.total ? status : empty;
            if (target && typeof target.scrollIntoView === 'function') {
                const top = target.getBoundingClientRect ? target.getBoundingClientRect().top : 0;
                if (top < 60 || top > (win.innerHeight || 800) * 0.6) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
        }

        // A firm's name or chip: exactly that firm's cards (a chip keeps the domain and city it was shown for).
        function showFirm(firm, keepFilters) {
            const target = keepFilters ? { q: '', firm, domain: state.domain } : { q: '', firm, domain: '', city: '', nocity: false };
            input.value = '';
            if (urlTimer) { clearTimeout(urlTimer); writeUrl(true); }
            saveView();
            update(target, 'push');
            scrollToStatus();
        }

        input.addEventListener('input', () => {
            if (inputTimer) clearTimeout(inputTimer);
            const go = () => { inputTimer = null; update({ q: input.value }, 'typing'); };
            if (opts.inputDelayMs) inputTimer = setTimeout(go, opts.inputDelayMs);
            else go();
        });
        form.addEventListener('submit', event => {
            event.preventDefault();
            update({ q: input.value });
            if (typeof input.blur === 'function') input.blur();
        });
        domainSelect.addEventListener('change', () => update({ domain: domainSelect.value }));
        citySelect.addEventListener('change', () => update({ city: citySelect.value, nocity: citySelect.value ? state.nocity : false }));
        noCityButton.addEventListener('click', () => update({ nocity: !state.nocity }));
        clear.addEventListener('click', () => {
            input.value = '';
            update({ q: '', firm: '', domain: '', city: '', nocity: false });
            input.focus();
        });
        allFirms.addEventListener('click', () => update({ firm: '' }));
        hint.addEventListener('click', event => {
            const button = event.target.closest('[data-domain]');
            if (!button) return;
            if (button.dataset.keep === 'q') update({ domain: button.dataset.domain });
            else { input.value = ''; update({ q: '', domain: button.dataset.domain }); }
        });
        glance.addEventListener('click', event => {
            const chip = event.target.closest('a[data-firm]');
            if (!chip || !plainClick(event)) return;
            event.preventDefault();
            showFirm(chip.dataset.firm, true);
        });
        empty.addEventListener('click', event => {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            const action = button.dataset.action;
            if (action === 'place-city') { input.value = ''; update({ q: '', city: button.dataset.value, nocity: false }); }
            else if (action === 'place-firm') { input.value = ''; update({ q: '', firm: button.dataset.value }); }
            else if (action === 'clear-city') update({ city: '', nocity: false });
            else if (action === 'clear-domain') update({ domain: '' });
            else if (action === 'firm-to-q') { input.value = state.firm; update({ q: state.firm, firm: '', domain: '', city: '', nocity: false }); }
            else { input.value = ''; update({ q: '', firm: '', domain: '', city: '', nocity: false }); }
        });
        results.addEventListener('click', event => {
            const firm = event.target.closest('a[data-firm]');
            if (firm) {
                if (!plainClick(event)) return;
                event.preventDefault();
                showFirm(firm.dataset.firm, false);
                return;
            }
            const tag = event.target.closest('.xp-tag');
            if (!tag) return;
            // A pressed chip clears the domain; any other chip shows only its domain.
            update({ domain: tag.dataset.domain === state.domain ? '' : tag.dataset.domain });
            scrollToStatus();
        });
        next.addEventListener('click', event => {
            const button = event.target.closest('button[data-domain]');
            if (!button) return;
            update({ domain: button.dataset.domain });
            scrollToStatus();
        });
        more.addEventListener('click', () => {
            const firstNew = shownCount();
            if (more.dataset.fold) open = true;
            limit = firstNew + pageSize;
            renderCards();
            saveView();
            const newCard = results.querySelectorAll('.xp-card')[firstNew];
            const heading = newCard && newCard.querySelector('h2');
            if (heading) {
                heading.tabIndex = -1;
                heading.focus({ preventScroll: true });
                if (typeof heading.scrollIntoView === 'function') heading.scrollIntoView({ block: 'nearest' });
            }
        });

        const onPopState = event => {
            const saved = event && event.state && event.state.xp;
            const same = saved && saved.search === (loc.search || '');
            state = readState(loc.search, { model, myDomain: mine });
            delete state.badCity;
            input.value = state.q;
            update({}, 'restore', same ? saved : null);
            if (same && typeof win.scrollTo === 'function') win.scrollTo(0, Number(saved.y) || 0);
        };
        const onLeave = () => saveView();
        const onVisibility = () => { if (doc.visibilityState === 'hidden') saveView(); };
        win.addEventListener('popstate', onPopState);
        win.addEventListener('pagehide', onLeave);
        doc.addEventListener('visibilitychange', onVisibility);
        const onPhoneChange = () => placeGlance();
        if (phone && typeof phone.addEventListener === 'function') phone.addEventListener('change', onPhoneChange);

        // First page now; the search index in idle time (a search before it is done finishes it at once).
        const saved = hist && hist.state && hist.state.xp;
        const restoring = saved && saved.search === (loc && loc.search ? loc.search : '');
        try { if (restoring && hist && 'scrollRestoration' in hist) hist.scrollRestoration = 'manual'; } catch (_) { /* read-only */ }
        update(null, restoring ? 'restore' : 'initial', restoring ? saved : null);
        if (restoring && Number(saved.y) && typeof win.scrollTo === 'function') {
            const go = () => win.scrollTo(0, Number(saved.y));
            if (typeof win.requestAnimationFrame === 'function') win.requestAnimationFrame(go); else go();
        }
        const hasIdle = typeof win.requestIdleCallback === 'function';
        const idle = opts.idle !== undefined ? opts.idle : (hasIdle
            ? fn => win.requestIdleCallback(fn, { timeout: 1500 })
            : fn => win.setTimeout(() => fn({ timeRemaining: () => 8 }), 60));
        const cancelIdle = handle => {
            try { if (opts.idle === undefined && hasIdle) win.cancelIdleCallback(handle); else clearTimeout(handle); } catch (_) { /* gone */ }
        };
        if (idle) {
            const step = deadline => {
                idleHandle = null;
                const done = indexStep(model, () => !deadline || typeof deadline.timeRemaining !== 'function' || deadline.timeRemaining() < 2);
                if (!done) idleHandle = idle(step);
            };
            idleHandle = idle(step);
        }
        if (typeof opts.onStats === 'function') opts.onStats(model);

        return {
            model,
            state: () => Object.assign({}, state),
            result: () => result,
            limit: () => limit,
            set: partial => {
                if (partial && Object.prototype.hasOwnProperty.call(partial, 'q')) input.value = partial.q;
                update(partial);
            },
            /**
             * "My domain" arrived late (the account loaded after the first page): a page still on its bare open, or on
             * the old "my domain", follows it; anything the student or the link chose stays.
             */
            setMyDomain: value => {
                const resolved = value ? resolveDomain(value) : null;
                const nextMine = resolved && resolved !== 'all' ? resolved : null;
                if (nextMine === mine) return;
                const bare = state.from === null && !state.q.trim() && !state.firm && !state.city && !state.domain &&
                    !(loc && loc.search && new URLSearchParams(loc.search).get('domain'));
                const following = state.from === 'mine';
                mine = nextMine;
                if (bare || following) update({ domain: mine || '' }, 'mine');
                else renderHint();
            },
            flush: () => { if (urlTimer) { clearTimeout(urlTimer); writeUrl(true); } },
            destroy: () => {
                if (urlTimer) clearTimeout(urlTimer);
                if (inputTimer) clearTimeout(inputTimer);
                if (idleHandle) cancelIdle(idleHandle);
                win.removeEventListener('popstate', onPopState);
                win.removeEventListener('pagehide', onLeave);
                doc.removeEventListener('visibilitychange', onVisibility);
                if (phone && typeof phone.removeEventListener === 'function') phone.removeEventListener('change', onPhoneChange);
                container.replaceChildren();
            }
        };
    }

    /** The logo leads back to the course for a signed-in student, and to the programme's public page for a visitor. */
    function logoHref(signedIn) {
        return signedIn ? COURSE_PAGE : PROGRAMME_PAGE;
    }

    /**
     * A signed-in student's "my domain" may live in the account (set on another device). The page never waits for it:
     * the Supabase scripts load after the first page (only when a session is stored), then the settings are pulled and
     * the page follows a changed "my domain" (setMyDomain). Resolves with the loaded settings store, or null.
     */
    function loadScripts(doc, sources) {
        return new Promise((resolve, reject) => {
            let last = null;
            for (const src of sources) {
                if (doc.querySelector(`script[src="${src}"]`)) continue;
                const script = doc.createElement('script');
                script.src = src;
                script.async = false; // run in order: supabase.js, then supabase-init.js
                (doc.head || doc.body).append(script);
                last = script;
            }
            if (!last) { resolve(); return; }
            last.addEventListener('load', () => resolve(), { once: true });
            last.addEventListener('error', () => reject(new Error('Account scripts unavailable')), { once: true });
        });
    }

    async function connectAccount(doc, controller, opts) {
        if (!Progress || typeof Progress.settings !== 'function' || !controller) return null;
        try {
            const hasClient = Boolean(root.supabaseClient || typeof root.getSupabaseClient === 'function');
            if (!hasClient) await (opts.loadScripts || loadScripts)(doc, ACCOUNT_SCRIPTS);
            const store = opts.settings || Progress.settings();
            store.subscribe(() => controller.setMyDomain(Progress.getMyDomain(store)));
            await store.pull();
            controller.setMyDomain(Progress.getMyDomain(store));
            return store;
        } catch (_) {
            return null; // the device's own setting stays
        }
    }

    /** Page start: load ./experiences.json, read "my domain", mount, fill the intro numbers, then sync the account. */
    async function start(options) {
        const opts = options || {};
        const doc = opts.document || root.document;
        const container = doc.getElementById(opts.containerId || 'explorer');
        const fetcher = opts.fetch || root.fetch.bind(root);
        let signedIn = opts.signedIn;
        if (signedIn === undefined) {
            try { signedIn = Boolean(Progress && Progress._sessionUserId && Progress._sessionUserId()); } catch (_) { signedIn = false; }
        }
        for (const brand of doc.querySelectorAll('.ap-brand')) {
            brand.setAttribute('href', logoHref(signedIn));
            brand.setAttribute('aria-label', signedIn ? 'Back to the programme' : 'About the programme');
        }
        let data;
        let model;
        try {
            const response = await fetcher(opts.dataUrl || 'experiences.json', { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Experiences unavailable');
            data = await response.json();
            model = prepare(data);
        } catch (_) {
            const box = el(doc, 'div', 'xp-empty ap-card');
            box.append(el(doc, 'h2', 'xp-empty-title', 'The experiences did not load.'));
            box.append(el(doc, 'p', '', 'Check your connection and try again.'));
            const retry = el(doc, 'button', 'ap-btn', 'Try again');
            retry.type = 'button';
            retry.addEventListener('click', () => root.location.reload());
            box.append(retry);
            container.replaceChildren(box);
            return null;
        }
        let myDomain = opts.myDomain;
        if (myDomain === undefined) {
            try { myDomain = Progress && Progress.getMyDomain ? Progress.getMyDomain() : null; } catch (_) { myDomain = null; }
        }
        const controller = mount(container, data, Object.assign({}, opts, { model, myDomain, signedIn, inputDelayMs: opts.inputDelayMs === undefined ? 90 : opts.inputDelayMs }));
        for (const node of doc.querySelectorAll('[data-xp="cards"]')) node.textContent = number(controller.model.cards);
        for (const node of doc.querySelectorAll('[data-xp="firms"]')) node.textContent = number(controller.model.firms);
        if (signedIn && opts.account !== false) controller.account = connectAccount(doc, controller, opts);
        return controller;
    }

    return Object.freeze({
        DATA_VERSION, PAGE_SIZE, ROADMAPS, COURSE_PAGE, PROGRAMME_PAGE, STOCK, FIRMS_RESOURCE, FIRMS_LIVE, FIRMS_HREF,
        BIG10_ROUTES, NETWORKS,
        normalise, stem, tokens, hasToken, cityGroup, resolveDomain, resolveCity, resolveFirm, detectDomain, taskKey,
        labelsFor, suggestDomain, placeIn,
        prepare, ensureIndex, readState, writeSearch, run, arrange, cardLines, commonWork, topFirms,
        roadmapHref, courseHref, firmsHref, firmKeywords, linkedinFirmHref, routeHref, logoHref, mount, start, connectAccount
    });
});
