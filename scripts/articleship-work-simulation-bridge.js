/**
 * MSC Articleship Program: the site side of the Work Simulation (row 1.6, /articleship-program/work-simulation/).
 *
 * The page is self-contained (package A) and works on its own; when window.MSCProgress exists it uses it
 * (articleship-program/work-simulation INTEGRATION.md §3). This file defines window.MSCProgress over the shared
 * progress engine (window.MSCArticleshipProgress), so on the site:
 * - progress syncs to the student's account as tool "work-simulation" (table articleship_tool_progress), in the
 *   engine's own local copy msc.articleship.work-simulation. The page keeps its own key msc-articleship:work-simulation
 *   (§2) and this file never touches it;
 * - "My domain" is the one every programme tool reads and writes (settings.myDomain);
 * - the tool's saved data also carries the lines other tools read (the CV Builder stage and the AI interview, through
 *   articleship-cv-builder.js readEarnedLines): `earned`, one line per domain with a passed level, built exactly as
 *   "My CV lines" builds it (MSCWSEngine.domainLine), and `cvQueue`, the lines the student sent with "Add to my CV".
 *   The page ignores both keys when it loads.
 *
 * Load order on the page: supabase.js, supabase-init.js, articleship-progress.js, this file, then the page's scripts.
 * Browser: window.MSCProgress and window.MSCArticleshipWorkSimulation. Node (tests): require(...).create(options).
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        root.MSCArticleshipWorkSimulation = api;
        if (!root.MSCProgress && root.MSCArticleshipProgress) root.MSCProgress = api.create();
    }
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const TOOL = 'work-simulation';
    const CATALOGUE_URL = 'data/catalogue.json';
    const DERIVED = Object.freeze(['earned', 'cvQueue']);

    const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

    /** The page's own state: the saved data without the keys this file adds for other tools. */
    function stateOf(data) {
        if (!isObject(data)) return null;
        const out = {};
        Object.keys(data).forEach(key => { if (!DERIVED.includes(key)) out[key] = clone(data[key]); });
        return Object.keys(out).length ? out : null;
    }

    /** One entry per domain, the newest kept: [{ domain, line, at }]. */
    function mergeQueue(...lists) {
        const byDomain = new Map();
        lists.forEach(list => (Array.isArray(list) ? list : []).forEach(item => {
            if (!isObject(item) || typeof item.line !== 'string' || !item.line.trim()) return;
            const domain = typeof item.domain === 'string' && item.domain ? item.domain : item.line.split(',')[0];
            const at = Number(item.at) || 0;
            const held = byDomain.get(domain);
            if (!held || at >= held.at) byDomain.set(domain, { domain, line: item.line, at });
        }));
        return [...byDomain.values()].sort((a, b) => a.at - b.at);
    }

    /** The lines the student added on "My CV lines" (state.cv[domain].addedLine). */
    function addedLines(state) {
        const cv = isObject(state) && isObject(state.cv) ? state.cv : {};
        return Object.keys(cv).filter(domain => isObject(cv[domain]) && typeof cv[domain].addedLine === 'string')
            .map(domain => ({ domain, line: cv[domain].addedLine, at: Number(cv[domain].addedAt) || 0 }));
    }

    /** One line per domain with a passed, published level, as "My CV lines" shows it. */
    function earnedLines(engine, catalogue, state) {
        if (!engine || typeof engine.domainLine !== 'function' || !isObject(catalogue) || !Array.isArray(catalogue.domains)) return null;
        const out = [];
        catalogue.domains.forEach(domain => {
            let line = null;
            try { line = engine.domainLine(catalogue, state, domain.id, false); } catch (_) { line = null; }
            if (typeof line === 'string' && line) out.push({ domain: domain.id, line });
        });
        return out;
    }

    /**
     * options (all optional; the browser's are used when absent): progress (MSCArticleshipProgress), engine
     * (() => MSCWSEngine), catalogue (() => Promise<catalogue>), isHidden (() => boolean).
     */
    function create(options) {
        const opts = options || {};
        const progress = () => opts.progress || root.MSCArticleshipProgress || null;
        const engine = () => (typeof opts.engine === 'function' ? opts.engine() : root.MSCWSEngine) || null;
        const isHidden = opts.isHidden || (() => {
            try { return Boolean(root.document && root.document.visibilityState === 'hidden'); } catch (_) { return false; }
        });
        let catalogue = null;
        function getCatalogue() {
            if (!catalogue) {
                const read = opts.catalogue || (() => root.fetch(CATALOGUE_URL, { credentials: 'same-origin' }).then(res => (res.ok ? res.json() : null)));
                catalogue = Promise.resolve().then(read).catch(() => null)
                    .then(value => { if (!value) catalogue = null; return value; });
            }
            return catalogue;
        }

        /** Two devices changed it since the last sync: the page's own merge (better pass kept), queues joined. */
        function mergeData(local, remote) {
            const E = engine();
            const state = E && typeof E.mergeStates === 'function' ? E.mergeStates(stateOf(local) || {}, stateOf(remote) || {})
                : ((Number(local && local.updatedAt) || 0) >= (Number(remote && remote.updatedAt) || 0) ? stateOf(local) : stateOf(remote)) || {};
            const earned = mergeQueue(remote && remote.earned, local && local.earned).map(({ domain, line }) => ({ domain, line }));
            return Object.assign(state, { earned, cvQueue: mergeQueue(remote && remote.cvQueue, local && local.cvQueue, addedLines(state)) });
        }

        let opened = null;
        function store() {
            const P = progress();
            if (!P || typeof P.open !== 'function') throw new Error('MSCArticleshipProgress is not on this page');
            if (!opened) opened = P.open(TOOL, { defaults: {}, merge: mergeData });
            return opened;
        }

        function load(tool) {
            if (tool !== TOOL) return Promise.resolve(null);
            const s = store();
            return Promise.resolve(s.ready).catch(() => null).then(() => stateOf(s.get()));
        }

        function save(tool, state) {
            if (tool !== TOOL || !isObject(state)) return Promise.resolve(false);
            const s = store();
            return getCatalogue().then(cat => {
                const lines = earnedLines(engine(), cat, state);
                s.update(current => Object.assign(clone(state), {
                    earned: lines || (Array.isArray(current.earned) ? current.earned : []),
                    cvQueue: mergeQueue(current.cvQueue, addedLines(state))
                }));
                // The page's last save of a visit comes as the tab is hidden: send it now, not after the debounce.
                if (isHidden()) s.flush();
                return true;
            });
        }

        function getDomain() {
            const P = progress();
            if (!P) return null;
            const settings = P.settings();
            return Promise.resolve(settings.ready).catch(() => null).then(() => P.getMyDomain(settings));
        }

        function setDomain(id) {
            const P = progress();
            if (!P) return null;
            if (id) return P.setMyDomain(id);
            P.settings().update(data => Object.assign(data, { myDomain: null }));
            return null;
        }

        function addCvLine(entry) {
            if (!isObject(entry) || typeof entry.line !== 'string' || !entry.line) return false;
            store().update(current => Object.assign(current, {
                cvQueue: mergeQueue(current.cvQueue, [{ domain: entry.domain, line: entry.line, at: Number(entry.at) || Date.now() }])
            }));
            return true;
        }

        return Object.freeze({ TOOL, load, save, getDomain, setDomain, addCvLine, _mergeData: mergeData });
    }

    return Object.freeze({ TOOL, CATALOGUE_URL, create, stateOf, mergeQueue, addedLines, earnedLines });
});
