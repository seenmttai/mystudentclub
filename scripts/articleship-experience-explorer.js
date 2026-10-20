/**
 * MSC Articleship Program: Experience Explorer (row 5.2).
 *
 * Anonymous articleship experiences, searchable by firm, city, domain and task. Every card shows: there is no
 * experience-length filter and no "N months" line (the generator drops the field). Filters live in the URL:
 *   /articleship-program/experience-explorer/?domain=gst&city=mumbai&q=bdo
 * `domain` takes any of the programme's 13 slugs, labels or aliases (MSCArticleshipProgress.normaliseDomain), or `all`;
 * `city` takes a city or a common old name (Bombay, Gurgaon…), Delhi NCR as one; `nocity=1` adds the cards that name no
 * city; `q` is the search text. On a bare open (no `domain`, `city` or `q` in the URL) the student's shared "my domain"
 * is the default, and typing a search looks across every domain (with a "Show <my domain> only" offer).
 *
 * Order: cards that answer the search best come first (the words as one phrase in a work line, then all the words in
 * one line, then spread over the card); in a domain view, cards with more of that domain's work lines come first; then
 * the most specific work; then one card per firm in turn. Each card lists its matching lines first, marked.
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
    const FIRM_CHIPS = 10;
    const FIRM_FILL = 6;

    // The 13 domains (one vocabulary with every programme tool). Fallback only if the progress script is missing.
    const DOMAINS = Progress && Progress.DOMAINS ? Progress.DOMAINS : [];
    const domainLabel = slug => {
        const found = DOMAINS.find(domain => domain.slug === slug);
        return found ? found.label : slug;
    };

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
    const STOP_WORDS = new Set(['and', 'the', 'of', 'at', 'in', 'for', 'a', 'an', 'co', 'llp', 'ca', 'chartered', 'accountants', 'firm', 'firms', 'work']);
    // Words too broad to suggest one domain from the search box.
    const BROAD_WORDS = new Set(['audit', 'tax', 'risk', 'bank', 'banking', 'assurance', 'statutory', 'accounts', 'ia', 'dt', 'er']);

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
            .replace(/\s+/g, ' ').trim();
        if (canonicalFirms !== false) {
            for (const [brand, pattern] of FIRM_ALIASES) text = text.replace(pattern, ` ${brand.toLowerCase()} `);
        }
        return text.replace(/\s+/g, ' ').trim();
    }

    function tokens(query) {
        return [...new Set(normalise(query).split(' ').filter(token => token && !STOP_WORDS.has(token)))];
    }

    // A token of one or two letters ('it', 'gt', 'tp') matches a whole word only; a longer one matches a word start
    // ('audit' finds 'audits'). Every indexed text starts and ends with a space.
    const hasToken = (text, token) => text.includes(token.length <= 2 ? ` ${token} ` : ` ${token}`);

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

    /** A city from the URL → the name used on the cards (Delhi NCR grouped), or a tidy version of an unknown one. */
    function resolveCity(value, model) {
        const key = slug(value);
        if (!key) return '';
        const known = model && model.cityNames ? model.cityNames : [];
        const aliased = CITY_ALIASES[key];
        if (aliased) return aliased;
        const found = known.find(name => slug(name) === key);
        if (found) return found;
        return key.split('-').filter(Boolean).slice(0, 4).map(word => word[0].toUpperCase() + word.slice(1)).join(' ').slice(0, 40);
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
        const specific = records.map(record => record.bullets.filter(b => lineCount.get(b) < 10).length +
            record.bullets.reduce((sum, b) => sum + 1 / lineCount.get(b), 0) / 10);
        const sameWork = records.map(record => [...record.bullets].sort().join('\n'));
        const cityCount = new Map();
        for (const record of records) {
            const group = cityGroup(record.city);
            if (group) cityCount.set(group, (cityCount.get(group) || 0) + 1);
        }
        // Task groups for "Most common work here".
        const { task, taskText } = taskGroups(lineCount);
        return {
            records, specific, sameWork, bit, task, taskText,
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
    /** URL query → { q, domain ('' = all), city ('' = all), nocity, from: 'url' | 'mine' | null }. */
    function readState(search, options) {
        const opts = options || {};
        const params = new URLSearchParams(typeof search === 'string' ? search : '');
        const q = (params.get('q') || '').slice(0, 120);
        const rawDomain = params.get('domain');
        let domain = '';
        let from = null;
        if (rawDomain !== null && rawDomain.trim() !== '') {
            const resolved = resolveDomain(rawDomain);
            if (resolved && resolved !== 'all') { domain = resolved; from = 'url'; }
            else if (resolved === 'all') from = 'url';
        }
        // "My domain" fills a bare open only: a deep link (?q=, ?city=) shows exactly what it names.
        const deepLink = ['q', 'city'].some(key => (params.get(key) || '').trim() !== '');
        if (!from && !deepLink && opts.myDomain) {
            const mine = resolveDomain(opts.myDomain);
            if (mine && mine !== 'all') { domain = mine; from = 'mine'; }
        }
        const city = resolveCity(params.get('city'), opts.model);
        const nocity = Boolean(city) && params.get('nocity') === '1';
        return { q, domain, city, nocity, from };
    }

    /**
     * State → '?q=…&domain=…&city=…&nocity=1' ('' when nothing is set). `domain=all` only on a bare page that would
     * otherwise open on "my domain" (a link with q or city is never narrowed by it).
     */
    function writeSearch(state, options) {
        const opts = options || {};
        const params = new URLSearchParams();
        const q = String(state.q || '').trim();
        if (q) params.set('q', q);
        if (state.domain) params.set('domain', state.domain);
        else if (opts.myDomain && !q && !state.city) params.set('domain', 'all');
        if (state.city) params.set('city', slug(state.city));
        if (state.city && state.nocity) params.set('nocity', '1');
        const text = params.toString();
        return text ? `?${text}` : '';
    }

    // ---------- Querying ----------
    /**
     * How well a card answers the search: 3 = the words as one phrase in one work line (or a firm/city search the card
     * fully answers), 2 = all the words in one work line, 1 = the words spread over the card.
     * Words found in the firm or city line are not looked for in the work.
     */
    function workTokens(card, queryTokens) {
        return queryTokens.filter(token => !hasToken(card.head, token));
    }

    function scoreCard(card, queryTokens) {
        const work = workTokens(card, queryTokens);
        if (!work.length) return 3;
        const last = work[work.length - 1];
        const phrase = ` ${work.join(' ')}${last.length <= 2 ? ' ' : ''}`;
        let best = 1;
        for (const line of card.lines) {
            if (line.includes(phrase)) return 3;
            if (best < 2 && work.every(token => hasToken(line, token))) best = 2;
        }
        return best;
    }

    function match(model, queryTokens) {
        const ix = ensureIndex(model);
        const ids = [];
        const scores = new Map();
        for (let id = 0; id < model.records.length; id++) {
            const card = ix.cards[id];
            if (queryTokens.every(token => hasToken(card.all, token))) { ids.push(id); scores.set(id, scoreCard(card, queryTokens)); }
        }
        let broad = false;
        if (!ids.length) {
            // Nothing in the work, firm, city or skills: let the domain names and their synonyms answer.
            broad = true;
            for (let id = 0; id < model.records.length; id++) {
                const card = ix.cards[id];
                if (queryTokens.every(token => hasToken(card.all, token) || hasToken(card.extra, token))) { ids.push(id); scores.set(id, 1); }
            }
        }
        return { ids, scores, broad };
    }

    /** How many of a card's work lines belong to `domain` (0 when no domain is chosen). */
    function domainLines(model, id, domain) {
        const mask = domain ? model.bit[domain] : 0;
        if (!mask) return 0;
        return model.records[id].masks.reduce((sum, m) => sum + ((m & mask) ? 1 : 0), 0);
    }

    // Firms with more cards first, one card per firm in turn, so the first page shows many firms.
    function interleave(model, ids) {
        const groups = new Map();
        for (const id of ids) {
            const key = model.records[id].firm;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(id);
        }
        const ordered = [...groups.values()].sort((a, b) => b.length - a.length ||
            model.records[a[0]].firm.localeCompare(model.records[b[0]].firm));
        const total = ordered.reduce((sum, group) => sum + group.length, 0);
        const out = [];
        for (let round = 0; out.length < total; round++) {
            for (const group of ordered) if (round < group.length) out.push(group[round]);
        }
        return out;
    }

    /**
     * Display order. When the cards with no city are included, the chosen city's own cards all come first. Then tiers:
     * how well a card answers the search, then how many of its lines are the chosen domain's work (counted up to 3);
     * inside a tier the most specific work first, one card per firm in turn. A card whose tasks repeat, word for word,
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
            tier.set(id, score * 10 + Math.min(3, domainLines(model, id, opts.domain)));
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
        const found = searched ? searched.ids : model.records.map((_, id) => id);
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
        const ordered = arrange(model, ids, { scores: searched ? searched.scores : null, domain, nocity });
        const browsing = !queryTokens.length;
        return {
            ids: ordered, total: ids.length, found: found.length, tokens: queryTokens, broad: searched ? searched.broad : false,
            domainCounts, domainTotal, cityCounts, cityTotal, noCity,
            common: browsing && ids.length >= 8 ? commonWork(model, ids, domain) : [],
            firms: browsing ? topFirms(model, ids) : []
        };
    }

    // ---------- One card's lines: the search's lines first, then the domain's, then the rest ----------
    const MARK_WORDS = {
        tp: 'transfer[- ]pricing|TP', ifc: 'internal financial controls?|ICFR|IFCR|IFC', fdd: 'financial due diligence|FDD',
        gst: 'GST[A-Za-z0-9-]*|IGST|CGST|SGST|indirect tax', statutory: 'statutory|stat(?![A-Za-z])', modelling: 'modell?ing',
        diligence: 'due diligence|diligence', big4: 'big ?(?:4|four)', tax: 'tax(?:ation)?'
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
        const mask = ctx.domain ? model.bit[ctx.domain] || 0 : 0;
        const pattern = markPattern(work);
        const ranks = record.bullets.map((text, i) => {
            let rank = 4;
            if (work.length) {
                const line = card.lines[i];
                if (line.includes(phrase)) rank = 0;
                else if (work.every(token => hasToken(line, token))) rank = 1;
                else if (work.some(token => hasToken(line, token))) rank = 2;
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
     * options: { location, history, myDomain, pageSize, debounceMs, inputDelayMs, idle (null = no idle indexing), model
     *   (an already prepared model), onStats(model) }
     * Returns { state(), result(), set(partial), flush(), model, destroy() }.
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
        const mine = myDomain && myDomain !== 'all' ? myDomain : null;
        let state = readState(loc && loc.search ? loc.search : '', { model, myDomain: mine });
        let result = null;
        let limit = pageSize;
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
        const clear = el(doc, 'button', 'xp-clear', 'Clear all');
        clear.type = 'button';
        actions.append(roadmap, clear);
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
        container.replaceChildren(form, status, hint, glance, empty, results, moreWrap);

        const hrefFor = next => `${loc && loc.pathname ? loc.pathname : ''}${writeSearch(next, { myDomain: mine }) || '?'}`;

        function fillDomains() {
            const options = [el(doc, 'option', '', 'All domains')];
            options[0].value = '';
            for (const d of DOMAINS) {
                const option = el(doc, 'option', '', `${d.label} · ${number(result.domainCounts.get(d.slug) || 0)}`);
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
                const option = el(doc, 'option', '', `${name} · ${number(n)}`);
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
            const firmLink = el(doc, 'a', 'xp-firm-link', record.firm);
            firmLink.href = hrefFor({ q: record.firm, domain: '', city: '', nocity: false });
            firmLink.dataset.firm = record.firm;
            firmLink.title = `Every experience at ${record.firm}`;
            heading.append(firmLink);
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
                for (const line of cardLines(model, id, { tokens: result.tokens, domain: state.domain })) {
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

        function renderCards() {
            results.replaceChildren(...result.ids.slice(0, limit).map(card));
            const left = result.total - Math.min(limit, result.total);
            more.textContent = left > pageSize ? `Show more · ${number(left)} left` : `Show ${number(left)} more`;
            moreWrap.hidden = left <= 0;
        }

        function emptyTitle() {
            const q = state.q.trim();
            if (state.domain && !q) return `No ${domainLabel(state.domain)} experiences${state.city ? ` in ${state.city}` : ''}.`;
            if (q) return `Nothing matches “${q}”${state.domain || state.city ? ' with these filters' : ''}.`;
            return `No experiences in ${state.city}.`;
        }

        function renderStatus() {
            const where = [state.domain ? domainLabel(state.domain) : '', state.city].filter(Boolean).join(' · ');
            let text = `${number(result.total)} ${result.total === 1 ? 'experience' : 'experiences'}`;
            if (where) text += ` · ${where}`;
            if (state.city && state.nocity) text += ' + city not given';
            if (state.domain && state.from === 'mine') text += ' (your domain)';
            const none = result.total === 0;
            // With no cards the live region still speaks: it carries the empty state's title, shown only to screen readers.
            count.textContent = none ? emptyTitle() : text;
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
                roadmap.textContent = `${domainLabel(state.domain)} roadmap`;
            }
            clear.hidden = !(state.q.trim() || state.domain || state.city);
        }

        function hintButton(domain, n, keepQuery) {
            const button = el(doc, 'button', 'xp-hint-btn', `Show ${domainLabel(domain)} only · ${number(n)}`);
            button.type = 'button';
            button.dataset.domain = domain;
            if (keepQuery) button.dataset.keep = 'q';
            return button;
        }

        function renderHint() {
            hint.replaceChildren();
            const q = state.q.trim();
            if (!state.domain && q) {
                // The search box names a domain: offer that domain (the box is cleared, the domain filter takes over).
                const suggested = detectDomain(q);
                if (suggested) {
                    const n = model.records.reduce((sum, record) => sum +
                        (record.domains.includes(suggested) && (!state.city || cityGroup(record.city) === state.city ||
                            (state.nocity && !record.city)) ? 1 : 0), 0);
                    // Only when it changes what the student sees (not when the search already shows exactly that domain).
                    if (n && !(n === result.total && result.ids.every(id => model.records[id].domains.includes(suggested)))) {
                        hint.append(hintButton(suggested, n, false));
                    }
                }
                // A search looks across every domain; the student's own domain is one tap away (the search is kept).
                if (mine && mine !== suggested && result.total) {
                    const n = run(model, Object.assign({}, state, { domain: mine })).total;
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
                glance.append(block);
            }
            if (firms.length) {
                const block = el(doc, 'div', 'xp-firms-here');
                block.append(el(doc, 'h2', 'xp-glance-title', 'Firms here'));
                const chips = el(doc, 'div', 'xp-firm-chips');
                for (const item of firms) {
                    const chip = el(doc, 'a', 'xp-firm-chip');
                    chip.href = hrefFor(Object.assign({}, state, { q: item.firm }));
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
                : 'Try a firm, a city or one task, such as GST or stock audit.';
            empty.append(el(doc, 'p', '', tip));
            // The nearest search that does show cards comes first: every city, then every domain.
            const buttons = [];
            if (state.city) {
                const n = run(model, Object.assign({}, state, { city: '', nocity: false })).total;
                if (n) buttons.push({ action: 'clear-city', label: `Show every city · ${number(n)}` });
            }
            if (!buttons.length && state.domain && (q || state.city)) {
                const n = run(model, Object.assign({}, state, { domain: '' })).total;
                if (n) buttons.push({ action: 'clear-domain', label: `Show all domains · ${number(n)}` });
            }
            const row = el(doc, 'div', 'xp-empty-actions');
            for (const item of buttons) {
                const button = el(doc, 'button', 'ap-btn', item.label);
                button.type = 'button';
                button.dataset.action = item.action;
                row.append(button);
            }
            if (state.domain) {
                const link = el(doc, 'a', buttons.length ? 'ap-btn is-secondary' : 'ap-btn', `Open the ${domainLabel(state.domain)} roadmap`);
                link.href = roadmapHref(state.domain);
                row.append(link);
            }
            if (!buttons.length && (q || state.domain || state.city)) {
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
                { xp: { search: loc && loc.search ? loc.search : '', limit, y: Math.round(scrollY()) } });
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

        function render() {
            fillDomains();
            fillCities();
            renderStatus();
            renderHint();
            renderGlance();
            renderEmpty();
            renderCards();
        }

        // how: 'initial' | 'typing' | 'push' (a new history entry) | 'restore' (from history; `keep` = the saved depth)
        function update(partial, how, keep) {
            const p = partial || {};
            const has = key => Object.prototype.hasOwnProperty.call(p, key);
            const next = Object.assign({}, state, p);
            if (has('domain')) next.from = 'user';
            else if (has('q') && mine) {
                // "My domain" never silently narrows a search: typing looks across every domain, clearing the box returns.
                const typed = String(next.q || '').trim();
                if (typed && state.from === 'mine' && state.domain === mine) { next.domain = ''; next.from = 'mine-off'; }
                else if (!typed && state.from === 'mine-off' && !state.domain) { next.domain = mine; next.from = 'mine'; }
            }
            if (!next.city) next.nocity = false;
            state = next;
            result = run(model, state);
            limit = how === 'restore' && keep ? Math.max(pageSize, Number(keep) || pageSize) : pageSize;
            render();
            if (how === 'push' && hist && typeof hist.pushState === 'function') {
                if (urlTimer) { clearTimeout(urlTimer); urlTimer = null; }
                const search = writeSearch(state, { myDomain: mine });
                try { hist.pushState({ xp: { search, limit, y: 0 } }, '', `${loc.pathname}${search}`); } catch (_) { writeUrl(true); }
            } else if (how !== 'initial' && how !== 'restore') writeUrl(how !== 'typing');
        }

        function scrollToStatus() {
            const target = result.total ? status : empty;
            if (target && typeof target.scrollIntoView === 'function') {
                const top = target.getBoundingClientRect ? target.getBoundingClientRect().top : 0;
                if (top < 60 || top > (win.innerHeight || 800) * 0.6) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
        }

        function showFirm(firm, keepFilters) {
            const next = keepFilters ? { q: firm, domain: state.domain } : { q: firm, domain: '', city: '', nocity: false };
            input.value = firm;
            if (urlTimer) { clearTimeout(urlTimer); writeUrl(true); }
            saveView();
            update(next, 'push');
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
            update({ q: '', domain: '', city: '', nocity: false });
            input.focus();
        });
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
            if (action === 'clear-city') update({ city: '', nocity: false });
            else if (action === 'clear-domain') update({ domain: '' });
            else { input.value = ''; update({ q: '', domain: '', city: '', nocity: false }); }
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
        more.addEventListener('click', () => {
            const firstNew = Math.min(limit, result.total);
            limit += pageSize;
            renderCards();
            saveView();
            const heading = results.children[firstNew] && results.children[firstNew].querySelector('h2');
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
            input.value = state.q;
            update({}, 'restore', same ? saved.limit : 0);
            if (same && typeof win.scrollTo === 'function') win.scrollTo(0, Number(saved.y) || 0);
        };
        const onLeave = () => saveView();
        const onVisibility = () => { if (doc.visibilityState === 'hidden') saveView(); };
        win.addEventListener('popstate', onPopState);
        win.addEventListener('pagehide', onLeave);
        doc.addEventListener('visibilitychange', onVisibility);

        // First page now; the search index in idle time (a search before it is done finishes it at once).
        const saved = hist && hist.state && hist.state.xp;
        const restoring = saved && saved.search === (loc && loc.search ? loc.search : '');
        try { if (restoring && hist && 'scrollRestoration' in hist) hist.scrollRestoration = 'manual'; } catch (_) { /* read-only */ }
        update(null, restoring ? 'restore' : 'initial', restoring ? saved.limit : 0);
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
            flush: () => { if (urlTimer) { clearTimeout(urlTimer); writeUrl(true); } },
            destroy: () => {
                if (urlTimer) clearTimeout(urlTimer);
                if (inputTimer) clearTimeout(inputTimer);
                if (idleHandle) cancelIdle(idleHandle);
                win.removeEventListener('popstate', onPopState);
                win.removeEventListener('pagehide', onLeave);
                doc.removeEventListener('visibilitychange', onVisibility);
                container.replaceChildren();
            }
        };
    }

    /** The logo leads back to the course for a signed-in student, and to the programme's public page for a visitor. */
    function logoHref(signedIn) {
        return signedIn ? COURSE_PAGE : PROGRAMME_PAGE;
    }

    /** Page start: load ./experiences.json, read "my domain", mount, fill the intro numbers. */
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
        const controller = mount(container, data, Object.assign({}, opts, { model, myDomain, inputDelayMs: opts.inputDelayMs === undefined ? 90 : opts.inputDelayMs }));
        for (const node of doc.querySelectorAll('[data-xp="cards"]')) node.textContent = number(controller.model.cards);
        for (const node of doc.querySelectorAll('[data-xp="firms"]')) node.textContent = number(controller.model.firms);
        return controller;
    }

    return Object.freeze({
        DATA_VERSION, PAGE_SIZE, ROADMAPS, COURSE_PAGE, PROGRAMME_PAGE,
        normalise, tokens, hasToken, cityGroup, resolveDomain, resolveCity, detectDomain, taskKey,
        prepare, ensureIndex, readState, writeSearch, run, arrange, cardLines, commonWork, topFirms,
        roadmapHref, logoHref, mount, start
    });
});
