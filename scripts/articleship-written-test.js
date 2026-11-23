/**
 * MSC Articleship Program: Written test practice (row 4.11) wired to the platform.
 *
 * The page itself (articleship-program/written-test/js/*.js) keeps every paper's state through a small key-value API,
 * `ArticleshipProgress.create({ tool, prefix })` → get / set / remove / pull / flush / hasRemote / keys. This file gives
 * it that API on top of the platform progress engine (MSCArticleshipProgress), so the written test saves like every
 * other programme tool: on the device at once, then one `written-test` row per student in the account
 * (data = { papers: { <paperId>: <that paper's state> } }), a stored copy of another account dropped on a shared browser.
 *   - Keys starting with "cache." (the copy of a paper being sat, kept so a changed paper never changes under a student)
 *     stay in this browser's localStorage only; they are paper text, not progress.
 *   - Two devices that both changed papers since the last sync: per paper, the later change wins.
 *   - The account copy stays under the engine's size cap: the oldest attempts in each paper's history go first
 *     (best, last and the running attempt are always kept).
 *   - A newer copy arriving from the account or another tab is announced to the page as a `storage` event on the
 *     paper's own key, which the page already listens to.
 * It also sets `window.MSCGate` (the page asks it before loading papers) to the platform courtesy gate.
 *
 * Browser: window.ArticleshipProgress, window.MSCGate, window.MSCWrittenTest. Node (tests): require() this file.
 * Papers: articleship-program/written-test/papers/<id>.json + index.json (scripts/articleship-written-test-papers.js).
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else {
        root.MSCWrittenTest = api;
        root.ArticleshipProgress = { create: api.createProgress };
        if (!root.MSCGate) root.MSCGate = api.gate();
    }
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const TOOL = 'written-test';
    const LOCAL_PREFIX = 'cache.';
    const SYNC_LIMIT = 200000;          // under the engine's 250 KB account cap, with room for the envelope
    const READY_WAIT_MS = 4000;         // never hold a paper back longer than this for the account copy
    const DEFAULTS = Object.freeze({ papers: {} });

    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function stamp(value) {
        return isPlainObject(value) && typeof value.updatedAt === 'number' ? value.updatedAt : 0;
    }

    function papersOf(data) {
        return isPlainObject(data) && isPlainObject(data.papers) ? data.papers : {};
    }

    /** Two devices both changed it since the last sync: per paper, the later change wins; nothing is lost. */
    function mergePapers(local, remote) {
        const a = papersOf(local);
        const b = papersOf(remote);
        const papers = {};
        new Set(Object.keys(a).concat(Object.keys(b))).forEach(id => {
            if (!(id in b)) papers[id] = a[id];
            else if (!(id in a)) papers[id] = b[id];
            else papers[id] = stamp(a[id]) >= stamp(b[id]) ? a[id] : b[id];
        });
        return Object.assign({}, isPlainObject(remote) ? remote : {}, isPlainObject(local) ? local : {}, { papers });
    }

    /** Keep the account copy under the cap: shorten every paper's history, oldest attempts first. */
    function fitForSync(data, limit) {
        const max = limit || SYNC_LIMIT;
        if (JSON.stringify(data).length <= max) return data;
        const out = JSON.parse(JSON.stringify(data));
        const papers = papersOf(out);
        for (const keep of [20, 10, 5, 2, 1, 0]) {
            Object.keys(papers).forEach(id => {
                const st = papers[id];
                if (isPlainObject(st) && Array.isArray(st.history) && st.history.length > keep) {
                    st.history = keep ? st.history.slice(-keep) : [];
                }
            });
            if (JSON.stringify(out).length <= max) break;
        }
        return out;
    }

    function browserStorage() {
        try {
            const storage = root.localStorage;
            const probe = 'msc.articleship.probe';
            storage.setItem(probe, '1');
            storage.removeItem(probe);
            return storage;
        } catch (_) {
            return null;
        }
    }

    function withTimeout(promise, ms) {
        return new Promise(resolve => {
            let done = false;
            const finish = value => { if (!done) { done = true; resolve(value); } };
            setTimeout(() => finish('timeout'), ms);
            Promise.resolve(promise).then(finish, () => finish('error'));
        });
    }

    /**
     * The page's storage API. Options: tool (must be 'written-test' for the platform row), prefix (localStorage prefix
     * for cache keys), store (a platform store; default MSCArticleshipProgress.open), engine, storage, readyWaitMs,
     * syncLimit, dispatch (fn(key) announcing a changed paper; default a window `storage` event).
     */
    function createProgress(options) {
        const opts = options || {};
        const tool = opts.tool || TOOL;
        const prefix = opts.prefix || ('msc.articleship.' + tool);
        const engine = opts.engine || root.MSCArticleshipProgress;
        const store = opts.store || (engine && engine.open(tool, { defaults: DEFAULTS, merge: mergePapers }));
        if (!store) throw new Error('The written test needs scripts/articleship-progress.js first');
        const storage = opts.storage === undefined ? browserStorage() : opts.storage;
        const memory = {};
        const readyWaitMs = opts.readyWaitMs === undefined ? READY_WAIT_MS : opts.readyWaitMs;
        const syncLimit = opts.syncLimit || SYNC_LIMIT;
        const isLocal = key => String(key).indexOf(LOCAL_PREFIX) === 0;
        const full = key => prefix + '.' + key;

        function readLocal(key) {
            let raw = null;
            if (storage) { try { raw = storage.getItem(full(key)); } catch (_) { raw = null; } }
            if (raw == null && Object.prototype.hasOwnProperty.call(memory, key)) raw = memory[key];
            if (raw == null) return null;
            try { return JSON.parse(raw); } catch (_) { return null; }
        }

        function writeLocal(key, value) {
            const raw = JSON.stringify(value);
            memory[key] = raw;
            if (!storage) return false;
            try {
                storage.setItem(full(key), raw);
                return true;
            } catch (_) {
                // Full: drop the other cached papers once, then try again.
                try {
                    const drop = [];
                    for (let i = 0; i < storage.length; i++) {
                        const k = storage.key(i);
                        if (k && k.indexOf(prefix + '.' + LOCAL_PREFIX) === 0 && k !== full(key)) drop.push(k);
                    }
                    drop.forEach(k => storage.removeItem(k));
                    storage.setItem(full(key), raw);
                    return true;
                } catch (__) {
                    return false;
                }
            }
        }

        function get(key) {
            if (isLocal(key)) return readLocal(key);
            const papers = papersOf(store.get());
            return Object.prototype.hasOwnProperty.call(papers, key) ? papers[key] : null;
        }

        function set(key, value) {
            if (isLocal(key)) return writeLocal(key, value);
            const data = store.get();
            data.papers = Object.assign({}, papersOf(data), { [key]: value });
            store.set(fitForSync(data, syncLimit));
            return true;
        }

        function remove(key) {
            delete memory[key];
            if (isLocal(key)) {
                if (storage) { try { storage.removeItem(full(key)); } catch (_) { /* ignore */ } }
                return;
            }
            const data = store.get();
            const papers = Object.assign({}, papersOf(data));
            if (!(key in papers)) return;
            delete papers[key];
            data.papers = papers;
            store.set(data);
        }

        // Tell the page about papers that changed under it (account copy pulled, another tab, account switch).
        const dispatch = opts.dispatch || (key => {
            if (!root.dispatchEvent) return;
            let event;
            try { event = new root.StorageEvent('storage', { key }); } catch (_) {
                event = new root.Event('storage');
                try { Object.defineProperty(event, 'key', { value: key }); } catch (__) { /* ignore */ }
            }
            root.dispatchEvent(event);
        });
        let seen = {};
        const remember = data => {
            seen = {};
            Object.entries(papersOf(data)).forEach(([id, st]) => { seen[id] = stamp(st); });
        };
        remember(store.get());
        if (typeof store.subscribe === 'function') {
            store.subscribe((data, meta) => {
                const source = meta && meta.source;
                const before = seen;
                remember(data);
                if (source === 'local') return;
                const ids = new Set(Object.keys(before).concat(Object.keys(seen)));
                ids.forEach(id => { if (before[id] !== seen[id]) dispatch(full(id)); });
            });
        }

        const ready = store.ready ? withTimeout(store.ready, readyWaitMs) : Promise.resolve('local');

        return {
            tool,
            prefix,
            persistent: Boolean(storage),
            store,
            hasRemote: () => true,
            key: full,
            get,
            set,
            remove,
            pull: key => ready.then(() => get(key)),
            flush: () => Promise.resolve(typeof store.flush === 'function' ? store.flush() : true).then(() => undefined, () => undefined),
            keys() {
                const out = Object.keys(papersOf(store.get()));
                if (storage) {
                    try {
                        for (let i = 0; i < storage.length; i++) {
                            const k = storage.key(i);
                            if (k && k.indexOf(prefix + '.' + LOCAL_PREFIX) === 0) out.push(k.slice(prefix.length + 1));
                        }
                    } catch (_) { /* ignore */ }
                }
                return out;
            }
        };
    }

    /** The page's MSCGate: the platform courtesy gate (login / enrolment card), true once the student may see it. */
    function gate(gateApi) {
        return {
            check() {
                const g = gateApi || root.MSCArticleshipGate;
                if (!g || typeof g.protect !== 'function') return true;
                return g.protect().then(result => Boolean(result && result.state === 'allow'), () => true);
            }
        };
    }

    return Object.freeze({ TOOL, LOCAL_PREFIX, SYNC_LIMIT, DEFAULTS, createProgress, mergePapers, fitForSync, gate });
});
