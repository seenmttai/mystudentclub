/**
 * MSC Articleship Program: Experience Explorer (row 5.2).
 *
 * Anonymous articleship experiences, searchable by firm, city, domain and task. Every card shows: there is no
 * experience-length filter and no "N months" line (the generator drops the field). Filters live in the URL:
 *   /articleship-program/experience-explorer/?domain=gst&city=mumbai&q=bdo
 * `domain` takes any of the programme's 13 slugs, labels or aliases (MSCArticleshipProgress.normaliseDomain), or `all`;
 * `city` takes a city or a common old name (Bombay, Gurgaon…), Delhi NCR as one; `q` is the search text.
 * On a bare open (no `domain`, `city` or `q` in the URL) the student's shared "my domain" is the default.
 *
 * Data: ./experiences.json (version 4), built by msc-content/articleship-program/v3/build/day-5/5.2/build_explorer.mjs.
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

    const DATA_VERSION = 4;
    const PAGE_SIZE = 12;
    const ROADMAPS = '/articleship-program/domain-roadmaps/';

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
    const DOMAIN_WORDS = {
        'statutory-audit': 'statutory audit external assurance',
        'internal-audit': 'internal audit ifc risk controls process',
        'direct-tax': 'direct tax income tax tds itr',
        'gst': 'gst goods services tax indirect',
        'bank-audit': 'bank audit branch concurrent',
        'transfer-pricing': 'transfer pricing benchmarking',
        'ma-tax': 'm and a tax mergers acquisitions restructuring deals',
        'valuation': 'valuation dcf modelling',
        'fdd': 'financial due diligence deals transaction',
        'forensic': 'forensic fraud investigation',
        'consulting': 'consulting advisory',
        'accounting': 'accounting accounts bookkeeping mis company law',
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

    // ---------- The model: cards indexed once ----------
    function prepare(data) {
        if (!data || data.version !== DATA_VERSION || !Array.isArray(data.records)) throw new Error('Experiences unavailable');
        const records = data.records.map(record => ({
            firm: String(record.firm || ''),
            city: record.city ? String(record.city) : null,
            domains: Array.isArray(record.domains) ? record.domains.filter(d => typeof d === 'string') : [],
            labels: Array.isArray(record.labels) ? record.labels.map(String) : [],
            bullets: Array.isArray(record.bullets) ? record.bullets.map(String) : [],
            skills: Array.isArray(record.skills) ? record.skills.map(String) : []
        }));
        const search = records.map(record => {
            const firm = normalise(record.firm, false);
            const initials = (firm.match(/^(?:[a-z] )+[a-z]\b/) || [''])[0].replace(/ /g, '');
            const parts = [
                normalise(record.firm), firm.replace(/ /g, ''), initials, normalise(record.city),
                ...record.domains.map(d => normalise(`${domainLabel(d)} ${DOMAIN_WORDS[d] || ''}`)),
                ...record.labels.map(label => normalise(`${label} ${LABEL_WORDS[label] || ''}`)),
                ...record.bullets.map(bullet => normalise(bullet)),
                ...record.skills.map(skill => normalise(skill)),
                BRAND_WORDS[record.firm] || '',
                cityGroup(record.city) === 'Delhi NCR' ? 'delhi ncr' : ''
            ];
            return ` ${parts.join(' ').replace(/\s+/g, ' ').trim()}`;
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
        return {
            records, search, specific, sameWork,
            cityNames: [...cityCount.keys()],
            cards: records.length,
            firms: new Set(records.map(record => record.firm)).size
        };
    }

    // ---------- URL state ----------
    /** URL query → { q, domain ('' = all), city ('' = all), from: 'url' | 'mine' | null }. */
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
        return { q, domain, city, from };
    }

    /** State → '?q=…&domain=…&city=…' ('' when nothing is set). `domain=all` only when it overrides "my domain". */
    function writeSearch(state, options) {
        const opts = options || {};
        const params = new URLSearchParams();
        const q = String(state.q || '').trim();
        if (q) params.set('q', q);
        if (state.domain) params.set('domain', state.domain);
        else if (opts.myDomain) params.set('domain', 'all');
        if (state.city) params.set('city', slug(state.city));
        const text = params.toString();
        return text ? `?${text}` : '';
    }

    // ---------- Querying ----------
    function idsFor(model, queryTokens) {
        const ids = [];
        for (let id = 0; id < model.records.length; id++) {
            const text = model.search[id];
            if (queryTokens.every(token => text.includes(` ${token}`))) ids.push(id);
        }
        return ids;
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

    // Most specific work first. A card whose tasks repeat, word for word, a card already listed moves to the very end,
    // so a page never shows the same work twice while every card stays counted and reachable.
    function arrange(model, ids) {
        const seen = new Set();
        const first = [];
        const repeats = [];
        for (const id of [...ids].sort((a, b) => model.specific[b] - model.specific[a] || a - b)) {
            if (seen.has(model.sameWork[id])) repeats.push(id);
            else { seen.add(model.sameWork[id]); first.push(id); }
        }
        return interleave(model, first).concat(repeats);
    }

    /** Run a search: the cards in display order, plus the counts each filter would show. */
    function run(model, state) {
        const found = idsFor(model, tokens(state.q));
        const domain = state.domain || '';
        const city = state.city || '';
        const domainCounts = new Map(DOMAINS.map(d => [d.slug, 0]));
        const cityCounts = new Map();
        let domainTotal = 0;
        let cityTotal = 0;
        const ids = [];
        for (const id of found) {
            const record = model.records[id];
            const group = cityGroup(record.city);
            const inDomain = !domain || record.domains.includes(domain);
            const inCity = !city || group === city;
            if (inCity) {
                domainTotal++;
                for (const d of record.domains) domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
            }
            if (inDomain) {
                cityTotal++;
                if (group) cityCounts.set(group, (cityCounts.get(group) || 0) + 1);
            }
            if (inDomain && inCity) ids.push(id);
        }
        return { ids: arrange(model, ids), total: ids.length, found: found.length, domainCounts, domainTotal, cityCounts, cityTotal };
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

    /**
     * Mount the Explorer into `container`.
     * options: { location, history, myDomain, pageSize, debounceMs, onStats(model) }
     * Returns { state(), set(partial), flush(), model, destroy() }.
     */
    function mount(container, data, options) {
        const opts = options || {};
        const doc = container.ownerDocument;
        const win = doc.defaultView || root;
        const loc = opts.location || win.location;
        const hist = opts.history === undefined ? win.history : opts.history;
        const pageSize = opts.pageSize || PAGE_SIZE;
        const debounceMs = opts.debounceMs === undefined ? 250 : opts.debounceMs;
        const model = prepare(data);
        const myDomain = opts.myDomain ? resolveDomain(opts.myDomain) : null;
        const mine = myDomain && myDomain !== 'all' ? myDomain : null;
        let state = readState(loc && loc.search ? loc.search : '', { model, myDomain: mine });
        let result = null;
        let limit = pageSize;
        let urlTimer = null;
        let inputTimer = null;

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

        // Status row, hint, empty state, results, more
        const status = el(doc, 'div', 'xp-status');
        const count = el(doc, 'p', 'xp-count');
        count.id = 'xp-count';
        count.setAttribute('role', 'status');
        count.setAttribute('aria-live', 'polite');
        count.setAttribute('aria-atomic', 'true');
        const actions = el(doc, 'div', 'xp-actions');
        const roadmap = el(doc, 'a', 'xp-roadmap');
        const clear = el(doc, 'button', 'xp-clear', 'Clear all');
        clear.type = 'button';
        actions.append(roadmap, clear);
        status.append(count, actions);
        const hint = el(doc, 'div', 'xp-hint');
        const empty = el(doc, 'div', 'xp-empty ap-card');
        const results = el(doc, 'section', 'xp-results');
        results.setAttribute('aria-label', 'Articleship experiences');
        const moreWrap = el(doc, 'div', 'xp-more');
        const more = el(doc, 'button', 'ap-btn is-secondary', 'Show more');
        more.type = 'button';
        moreWrap.append(more);
        container.replaceChildren(form, status, hint, empty, results, moreWrap);

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

        function card(record) {
            const node = el(doc, 'article', 'xp-card');
            node.append(el(doc, 'h2', 'xp-firm', record.firm));
            if (record.city) node.append(el(doc, 'p', 'xp-city', record.city));
            if (record.domains.length) {
                const tags = el(doc, 'div', 'xp-tags');
                for (const d of record.domains) {
                    const tag = el(doc, 'button', 'xp-tag', domainLabel(d));
                    tag.type = 'button';
                    tag.dataset.domain = d;
                    const active = d === state.domain;
                    tag.setAttribute('aria-pressed', active ? 'true' : 'false');
                    tag.title = active ? '' : `Show ${domainLabel(d)} only`;
                    tags.append(tag);
                }
                node.append(tags);
            }
            if (record.bullets.length) {
                const list = el(doc, 'ul', 'xp-work');
                for (const bullet of record.bullets) list.append(el(doc, 'li', '', bullet));
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
            results.replaceChildren(...result.ids.slice(0, limit).map(id => card(model.records[id])));
            const left = result.total - Math.min(limit, result.total);
            more.textContent = left > pageSize ? `Show more · ${number(left)} left` : `Show ${number(left)} more`;
            moreWrap.hidden = left <= 0;
        }

        function renderStatus() {
            const where = [state.domain ? domainLabel(state.domain) : '', state.city].filter(Boolean).join(' · ');
            let text = `${number(result.total)} ${result.total === 1 ? 'experience' : 'experiences'}`;
            if (where) text += ` · ${where}`;
            if (state.domain && state.from === 'mine') text += ' (your domain)';
            count.textContent = text;
            count.hidden = result.total === 0;
            roadmap.hidden = !state.domain;
            if (state.domain) {
                roadmap.href = roadmapHref(state.domain);
                roadmap.textContent = `${domainLabel(state.domain)} roadmap`;
            }
            clear.hidden = !(state.q.trim() || state.domain || state.city);
            status.hidden = result.total === 0;
        }

        function renderHint() {
            hint.replaceChildren();
            const suggested = !state.domain ? detectDomain(state.q) : null;
            hint.hidden = !suggested;
            if (!suggested) return;
            const n = model.records.reduce((sum, record) => sum +
                (record.domains.includes(suggested) && (!state.city || cityGroup(record.city) === state.city) ? 1 : 0), 0);
            // Only when it changes what the student sees (not when the search already shows exactly that domain).
            if (!n || (n === result.total && result.ids.every(id => model.records[id].domains.includes(suggested)))) {
                hint.hidden = true;
                return;
            }
            const button = el(doc, 'button', 'xp-hint-btn', `Show ${domainLabel(suggested)} only · ${number(n)}`);
            button.type = 'button';
            button.dataset.domain = suggested;
            hint.append(button);
        }

        function renderEmpty() {
            empty.replaceChildren();
            empty.hidden = result.total > 0;
            if (result.total > 0) return;
            const q = state.q.trim();
            let title;
            if (state.domain && !q) title = `No ${domainLabel(state.domain)} experiences${state.city ? ` in ${state.city}` : ''}.`;
            else if (q) title = `Nothing matches “${q}”${state.domain || state.city ? ' with these filters' : ''}.`;
            else title = `No experiences in ${state.city}.`;
            empty.append(el(doc, 'h2', 'xp-empty-title', title));
            const tip = state.domain
                ? 'Its roadmap shows the work and the firms.'
                : 'Try a firm, a city or one task, such as GST or stock audit.';
            empty.append(el(doc, 'p', '', tip));
            // The nearest search that does show cards comes first: every city, then every domain.
            const buttons = [];
            if (state.city) {
                const n = run(model, Object.assign({}, state, { city: '' })).total;
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

        function writeUrl(now) {
            if (!hist || typeof hist.replaceState !== 'function') return;
            const apply = () => {
                urlTimer = null;
                const search = writeSearch(state, { myDomain: mine });
                const path = loc && loc.pathname ? loc.pathname : '';
                const hash = loc && loc.hash ? loc.hash : '';
                try { hist.replaceState(hist.state, '', `${path}${search}${hash}`); } catch (_) { /* sandboxed frames */ }
            };
            if (urlTimer) clearTimeout(urlTimer);
            if (now || !debounceMs) apply();
            else urlTimer = setTimeout(apply, debounceMs);
        }

        function update(partial, how) {
            const next = Object.assign({}, state, partial || {});
            if (partial && Object.prototype.hasOwnProperty.call(partial, 'domain')) next.from = 'user';
            state = next;
            result = run(model, state);
            limit = pageSize;
            fillDomains();
            fillCities();
            renderStatus();
            renderHint();
            renderEmpty();
            renderCards();
            if (how !== 'initial') writeUrl(how !== 'typing');
        }

        function scrollToStatus() {
            const target = status.hidden ? empty : status;
            if (target && typeof target.scrollIntoView === 'function') {
                const top = target.getBoundingClientRect ? target.getBoundingClientRect().top : 0;
                if (top < 60 || top > (win.innerHeight || 800) * 0.6) target.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
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
        citySelect.addEventListener('change', () => update({ city: citySelect.value }));
        clear.addEventListener('click', () => {
            input.value = '';
            update({ q: '', domain: '', city: '' });
            input.focus();
        });
        hint.addEventListener('click', event => {
            const button = event.target.closest('[data-domain]');
            if (!button) return;
            input.value = '';
            update({ q: '', domain: button.dataset.domain });
        });
        empty.addEventListener('click', event => {
            const button = event.target.closest('[data-action]');
            if (!button) return;
            const action = button.dataset.action;
            if (action === 'clear-city') update({ city: '' });
            else if (action === 'clear-domain') update({ domain: '' });
            else { input.value = ''; update({ q: '', domain: '', city: '' }); }
        });
        results.addEventListener('click', event => {
            const tag = event.target.closest('.xp-tag');
            if (!tag || tag.dataset.domain === state.domain) return;
            update({ domain: tag.dataset.domain });
            scrollToStatus();
        });
        more.addEventListener('click', () => {
            const firstNew = Math.min(limit, result.total);
            limit += pageSize;
            renderCards();
            const heading = results.children[firstNew] && results.children[firstNew].querySelector('h2');
            if (heading) {
                heading.tabIndex = -1;
                heading.focus({ preventScroll: true });
                if (typeof heading.scrollIntoView === 'function') heading.scrollIntoView({ block: 'nearest' });
            }
        });

        update(null, 'initial');
        if (typeof opts.onStats === 'function') opts.onStats(model);

        return {
            model,
            state: () => Object.assign({}, state),
            result: () => result,
            set: partial => {
                if (partial && Object.prototype.hasOwnProperty.call(partial, 'q')) input.value = partial.q;
                update(partial);
            },
            flush: () => { if (urlTimer) { clearTimeout(urlTimer); writeUrl(true); } },
            destroy: () => { if (urlTimer) clearTimeout(urlTimer); if (inputTimer) clearTimeout(inputTimer); container.replaceChildren(); }
        };
    }

    /** Page start: load ./experiences.json, read "my domain", mount, fill the intro numbers. */
    async function start(options) {
        const opts = options || {};
        const doc = opts.document || root.document;
        const container = doc.getElementById(opts.containerId || 'explorer');
        const fetcher = opts.fetch || root.fetch.bind(root);
        let data;
        try {
            const response = await fetcher(opts.dataUrl || 'experiences.json', { credentials: 'same-origin' });
            if (!response.ok) throw new Error('Experiences unavailable');
            data = await response.json();
            prepare(data);
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
        const controller = mount(container, data, Object.assign({}, opts, { myDomain, inputDelayMs: opts.inputDelayMs === undefined ? 90 : opts.inputDelayMs }));
        for (const node of doc.querySelectorAll('[data-xp="cards"]')) node.textContent = number(controller.model.cards);
        for (const node of doc.querySelectorAll('[data-xp="firms"]')) node.textContent = number(controller.model.firms);
        return controller;
    }

    return Object.freeze({
        DATA_VERSION, PAGE_SIZE, ROADMAPS,
        normalise, tokens, cityGroup, resolveDomain, resolveCity, detectDomain,
        prepare, readState, writeSearch, run, arrange, roadmapHref, mount, start
    });
});
