/**
 * MSC Articleship Program: one progress engine for every programme tool.
 *
 * - Saves to localStorage at once (works logged out, offline, before any SQL is run).
 * - When the student is signed in and the table `public.articleship_tool_progress` exists, it also keeps one row per
 *   tool in their account (RLS: own rows only). Without the table, or on any network error, it stays local silently.
 * - Holds the shared settings every tool reads: "my domain" (+ backup) and the CV Recommender's pick for the CV Builder.
 *
 * Browser: window.MSCArticleshipProgress. Node (tests): require('./scripts/articleship-progress.js').
 * API reference: msc-content/articleship-program/v3/build/tools/PLATFORM.md
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCArticleshipProgress = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const TABLE = 'articleship_tool_progress';
    const KEY_PREFIX = 'msc.articleship.';
    const REMOTE_FLAG = 'msc.articleship.remote';
    // supabase-js stores the session under sb-<first host label>-auth-token: "sb-auth-…" for auth.mystudentclub.com
    // (the live client) and the project-ref key for older pages.
    const AUTH_KEYS = ['sb-auth-auth-token', 'sb-izsggdtdiacxdsjjncdq-auth-token'];
    const SETTINGS_TOOL = 'settings';
    const MAX_BYTES = 250000;
    const ENVELOPE_VERSION = 1;

    // The 13 domains used everywhere (keywords, roadmaps, booklets, Work Simulation, tracker), most common first.
    const DOMAINS = Object.freeze([
        { slug: 'statutory-audit', label: 'Statutory audit' },
        { slug: 'internal-audit', label: 'Internal audit, risk & IFC' },
        { slug: 'direct-tax', label: 'Direct tax' },
        { slug: 'gst', label: 'GST' },
        { slug: 'bank-audit', label: 'Bank audit' },
        { slug: 'transfer-pricing', label: 'Transfer pricing' },
        { slug: 'ma-tax', label: 'M&A tax' },
        { slug: 'valuation', label: 'Valuation' },
        { slug: 'fdd', label: 'Financial due diligence' },
        { slug: 'forensic', label: 'Forensic' },
        { slug: 'consulting', label: 'Consulting & risk advisory' },
        { slug: 'accounting', label: 'Accounting, MIS & company law' },
        { slug: 'ib-er', label: 'IB & equity research' }
    ].map(Object.freeze));

    const DOMAIN_ALIASES = Object.freeze({
        'audit': 'statutory-audit', 'statutory': 'statutory-audit', 'stat-audit': 'statutory-audit',
        'statutory-audit-assurance': 'statutory-audit', 'assurance': 'statutory-audit',
        'ia': 'internal-audit', 'internal-audit-risk-ifc': 'internal-audit', 'internal-audit-risk-and-ifc': 'internal-audit',
        'risk': 'internal-audit', 'ifc': 'internal-audit', 'risk-advisory': 'consulting',
        'dt': 'direct-tax', 'income-tax': 'direct-tax', 'tax': 'direct-tax',
        'idt': 'gst', 'indirect-tax': 'gst', 'goods-and-services-tax': 'gst',
        'bank': 'bank-audit', 'banking': 'bank-audit',
        'tp': 'transfer-pricing',
        'm-a-tax': 'ma-tax', 'm-and-a-tax': 'ma-tax', 'mergers-and-acquisitions-tax': 'ma-tax', 'deal-tax': 'ma-tax',
        'financial-due-diligence': 'fdd', 'due-diligence': 'fdd', 'transaction-advisory': 'fdd',
        'forensic-audit': 'forensic', 'forensics': 'forensic',
        'consulting-risk-advisory': 'consulting', 'consulting-and-risk-advisory': 'consulting', 'management-consulting': 'consulting',
        'accounting-mis-company-law': 'accounting', 'accounting-mis-and-company-law': 'accounting', 'accounts': 'accounting',
        'mis': 'accounting', 'company-law': 'accounting',
        'ib': 'ib-er', 'er': 'ib-er', 'ib-equity-research': 'ib-er', 'ib-and-equity-research': 'ib-er',
        'investment-banking': 'ib-er', 'equity-research': 'ib-er'
    });

    const SITUATIONS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

    function slugify(value) {
        return String(value == null ? '' : value).trim().toLowerCase()
            .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }

    /** Any label, slug or common alias → the canonical slug, or null. */
    function normaliseDomain(value) {
        const slug = slugify(value);
        if (!slug) return null;
        if (DOMAINS.some(domain => domain.slug === slug)) return slug;
        if (DOMAIN_ALIASES[slug]) return DOMAIN_ALIASES[slug];
        const byLabel = DOMAINS.find(domain => slugify(domain.label) === slug);
        if (byLabel) return byLabel.slug;
        const withoutAnd = slug.replace(/-and-/g, '-');
        return DOMAIN_ALIASES[withoutAnd] || null;
    }

    function domainLabel(value) {
        const slug = normaliseDomain(value);
        const found = DOMAINS.find(domain => domain.slug === slug);
        return found ? found.label : '';
    }

    function isValidTool(tool) {
        return typeof tool === 'string' && /^[a-z0-9][a-z0-9-]{1,39}$/.test(tool);
    }

    function storageKey(tool) {
        if (!isValidTool(tool)) throw new Error('Invalid tool key: ' + tool);
        return KEY_PREFIX + tool;
    }

    function clone(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    function emptyEnvelope(defaults, owner) {
        return { v: ENVELOPE_VERSION, data: clone(defaults || {}), updatedAt: 0, syncedAt: 0, dirty: false, owner: owner || null };
    }

    function readEnvelope(raw, defaults) {
        if (!raw) return emptyEnvelope(defaults);
        try {
            const parsed = JSON.parse(raw);
            if (!isPlainObject(parsed) || !isPlainObject(parsed.data)) return emptyEnvelope(defaults);
            return {
                v: ENVELOPE_VERSION,
                data: Object.assign(clone(defaults || {}), parsed.data),
                updatedAt: Number(parsed.updatedAt) || 0,
                syncedAt: Number(parsed.syncedAt) || 0,
                dirty: Boolean(parsed.dirty),
                owner: typeof parsed.owner === 'string' ? parsed.owner : null
            };
        } catch (_) {
            return emptyEnvelope(defaults);
        }
    }

    /** PostgREST / Postgres "this table is not there (yet)". Only then does the engine stop trying for the session. */
    function isMissingTableError(error) {
        if (!error) return false;
        const code = String(error.code || '');
        const message = String(error.message || '') + ' ' + String(error.details || '') + ' ' + String(error.hint || '');
        return code === 'PGRST205' || code === '42P01' || code === 'PGRST106' ||
            Number(error.status) === 404 ||
            /could not find the table|relation .* does not exist|schema cache/i.test(message);
    }

    /**
     * Decide what to do with the local copy and the account row.
     * local: envelope; remote: null | { data, updated_at }.
     * Returns { action: 'none' | 'push' | 'pull' | 'merge', data, remoteTime }.
     */
    function reconcile(local, remote, merge) {
        if (!remote) {
            return { action: local.updatedAt > 0 ? 'push' : 'none', data: local.data, remoteTime: 0 };
        }
        const remoteTime = Date.parse(remote.updated_at) || 0;
        const remoteData = isPlainObject(remote.data) ? remote.data : {};
        if (!local.dirty) {
            if (remoteTime !== local.syncedAt) return { action: 'pull', data: remoteData, remoteTime };
            return { action: 'none', data: local.data, remoteTime };
        }
        if (remoteTime === local.syncedAt) return { action: 'push', data: local.data, remoteTime };
        // Both changed since the last sync (two devices). A tool may merge; otherwise the later change wins.
        if (typeof merge === 'function') {
            return { action: 'merge', data: merge(clone(local.data), clone(remoteData)), remoteTime };
        }
        if (local.updatedAt >= remoteTime) return { action: 'push', data: local.data, remoteTime };
        return { action: 'pull', data: remoteData, remoteTime };
    }

    function browserStorage() {
        try {
            const storage = root.localStorage;
            const probe = KEY_PREFIX + 'probe';
            storage.setItem(probe, '1');
            storage.removeItem(probe);
            return storage;
        } catch (_) {
            const memory = new Map();
            return {
                getItem: key => (memory.has(key) ? memory.get(key) : null),
                setItem: (key, value) => { memory.set(key, String(value)); },
                removeItem: key => { memory.delete(key); }
            };
        }
    }

    function browserSessionFlags() {
        try { return root.sessionStorage; } catch (_) { return null; }
    }

    function browserClient() {
        try {
            return root.supabaseClient || (typeof root.getSupabaseClient === 'function' ? root.getSupabaseClient() : null);
        } catch (_) {
            return null;
        }
    }

    /** The signed-in user id without a network call (supabase-init keeps the stored session on window.__mscSession). */
    function sessionUserId(storage) {
        try {
            if (root.__mscSession && root.__mscSession.user && root.__mscSession.user.id) return root.__mscSession.user.id;
            const store = storage || browserStorage();
            for (const key of AUTH_KEYS) {
                const raw = store.getItem(key);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                const id = (parsed && parsed.user && parsed.user.id) || (parsed && parsed.currentSession && parsed.currentSession.user && parsed.currentSession.user.id);
                if (id) return id;
            }
            return null;
        } catch (_) {
            return null;
        }
    }

    async function currentUserId(client, storage) {
        try {
            if (client && client.auth && typeof client.auth.getSession === 'function') {
                const { data } = await client.auth.getSession();
                if (data && data.session && data.session.user) return data.session.user.id;
                return null;
            }
        } catch (_) { /* fall through to the stored session */ }
        return sessionUserId(storage);
    }

    /**
     * Create a store for one tool. Options (all optional; the browser defaults are used when absent):
     *   defaults   – the data shape a new student starts with
     *   merge      – (localData, remoteData) => data, used only when two devices changed it since the last sync
     *   storage    – localStorage-like; client – Supabase client; sessionFlags – sessionStorage-like
     *   now        – () => ms; debounceMs – delay before an account save (default 800)
     *   userId     – () => id | null (synchronous; defaults to the stored Supabase session)
     *   remote     – false to keep this store on the device only
     */
    function createStore(tool, options) {
        const opts = options || {};
        const key = storageKey(tool);
        const storage = opts.storage || browserStorage();
        const sessionFlags = opts.sessionFlags === undefined ? browserSessionFlags() : opts.sessionFlags;
        const getClient = () => (opts.client === undefined ? browserClient() : opts.client);
        const now = opts.now || (() => Date.now());
        const debounceMs = opts.debounceMs === undefined ? 800 : opts.debounceMs;
        const defaults = isPlainObject(opts.defaults) ? opts.defaults : {};
        const syncUser = opts.userId || (() => sessionUserId(storage));
        const listeners = new Set();
        let envelope = readEnvelope(storage.getItem(key), defaults);
        let remoteState = opts.remote === false ? 'off' : 'idle';
        let editVersion = 0;
        let timer = null;
        let inFlight = null;
        let destroyed = false;

        // Another student signed in on this browser: never carry their progress into this account.
        const visibleUser = syncUser();
        if (visibleUser && envelope.owner && envelope.owner !== visibleUser) {
            envelope = emptyEnvelope(defaults, visibleUser);
            persist();
        }

        function persist() {
            try { storage.setItem(key, JSON.stringify(envelope)); } catch (_) { /* quota or blocked: memory copy still works */ }
        }

        function emit(source) {
            const snapshot = clone(envelope.data);
            listeners.forEach(listener => {
                try { listener(clone(snapshot), { source, tool }); } catch (error) { if (root.console) root.console.error(error); }
            });
        }

        function remoteDisabled() {
            if (remoteState === 'off' || remoteState === 'missing') return true;
            try { return Boolean(sessionFlags && sessionFlags.getItem(REMOTE_FLAG) === 'missing'); } catch (_) { return false; }
        }

        function markMissing() {
            remoteState = 'missing';
            try { if (sessionFlags) sessionFlags.setItem(REMOTE_FLAG, 'missing'); } catch (_) { /* ignore */ }
        }

        function applyRemote(data, remoteTime, owner) {
            envelope = {
                v: ENVELOPE_VERSION, data: Object.assign(clone(defaults), clone(data)),
                updatedAt: remoteTime, syncedAt: remoteTime, dirty: false, owner: owner || envelope.owner
            };
            persist();
            emit('remote');
        }

        async function push() {
            if (remoteDisabled()) return false;
            const client = getClient();
            if (!client || typeof client.from !== 'function') return false;
            const userId = await currentUserId(client, storage);
            if (!userId) return false;
            if (envelope.owner && envelope.owner !== userId) return false;
            const body = JSON.stringify(envelope.data);
            if (body.length > MAX_BYTES) { remoteState = 'too-large'; return false; }
            const version = editVersion;
            try {
                const { data, error } = await client.from(TABLE)
                    .upsert({ user_id: userId, tool, data: envelope.data }, { onConflict: 'user_id,tool' })
                    .select('updated_at').single();
                if (error) {
                    if (isMissingTableError(error)) markMissing(); else remoteState = 'error';
                    return false;
                }
                const serverTime = Date.parse(data && data.updated_at) || now();
                envelope.syncedAt = serverTime;
                envelope.owner = userId;
                if (version === editVersion) envelope.dirty = false;
                persist();
                remoteState = 'synced';
                return true;
            } catch (_) {
                remoteState = 'error';
                return false;
            }
        }

        function schedulePush() {
            if (remoteDisabled() || destroyed) return;
            if (timer) clearTimeout(timer);
            if (debounceMs <= 0) { flush(); return; }
            timer = setTimeout(() => { timer = null; flush(); }, debounceMs);
        }

        function flush() {
            if (timer) { clearTimeout(timer); timer = null; }
            if (inFlight) return inFlight.then(() => (envelope.dirty ? flush() : true));
            if (!envelope.dirty) return Promise.resolve(true);
            inFlight = push().finally(() => { inFlight = null; });
            return inFlight;
        }

        async function pull() {
            if (remoteDisabled()) return 'local';
            const client = getClient();
            if (!client || typeof client.from !== 'function') return 'local';
            const userId = await currentUserId(client, storage);
            if (!userId) return 'local';
            if (envelope.owner && envelope.owner !== userId) {
                envelope = emptyEnvelope(defaults, userId);
                persist();
                emit('account-switch');
            }
            try {
                const { data, error } = await client.from(TABLE).select('data, updated_at').eq('tool', tool).maybeSingle();
                if (error) {
                    if (isMissingTableError(error)) markMissing(); else remoteState = 'error';
                    return 'local';
                }
                const decision = reconcile(envelope, data || null, opts.merge);
                if (decision.action === 'pull') applyRemote(decision.data, decision.remoteTime, userId);
                else if (decision.action === 'push' || decision.action === 'merge') {
                    if (decision.action === 'merge') {
                        envelope.data = Object.assign(clone(defaults), decision.data);
                        envelope.updatedAt = now();
                        persist();
                        emit('merge');
                    }
                    envelope.syncedAt = decision.remoteTime || envelope.syncedAt;
                    envelope.dirty = true;
                    envelope.owner = userId;
                    persist();
                    await flush();
                } else {
                    envelope.owner = userId;
                    persist();
                    remoteState = 'synced';
                }
                return decision.action;
            } catch (_) {
                remoteState = 'error';
                return 'local';
            }
        }

        function commit(next, source) {
            if (!isPlainObject(next)) throw new TypeError('Progress data must be a plain object');
            envelope.data = clone(next);
            envelope.updatedAt = Math.max(now(), envelope.updatedAt + 1);
            envelope.dirty = true;
            if (!envelope.owner) envelope.owner = syncUser() || null;
            editVersion += 1;
            persist();
            emit(source || 'local');
            schedulePush();
        }

        const store = {
            tool,
            key,
            get: () => clone(envelope.data),
            set: next => commit(next),
            update(change) {
                const current = clone(envelope.data);
                let next;
                if (typeof change === 'function') {
                    const returned = change(current);
                    next = returned === undefined ? current : returned;
                } else {
                    next = Object.assign(current, change || {});
                }
                commit(next);
                return clone(envelope.data);
            },
            clear() { commit(clone(defaults)); },
            subscribe(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            flush,
            pull,
            status: () => ({ remote: remoteDisabled() && remoteState === 'idle' ? 'missing' : remoteState, dirty: envelope.dirty, updatedAt: envelope.updatedAt }),
            destroy() {
                destroyed = true;
                if (timer) clearTimeout(timer);
                listeners.clear();
            },
            // Another tab saved the same tool: pick it up without a reload.
            _onStorageEvent(event) {
                if (!event || event.key !== key) return;
                envelope = readEnvelope(event.newValue, defaults);
                emit('other-tab');
            }
        };
        store.ready = opts.autoPull === false ? Promise.resolve('local') : Promise.resolve().then(pull);
        return store;
    }

    // ---------- Browser singletons ----------
    const openStores = new Map();
    let storageListenerBound = false;

    function bindStorageListener() {
        if (storageListenerBound || !root.addEventListener) return;
        storageListenerBound = true;
        root.addEventListener('storage', event => openStores.forEach(store => store._onStorageEvent(event)));
        const flushAll = () => openStores.forEach(store => { store.flush(); });
        root.addEventListener('pagehide', flushAll);
        root.addEventListener('online', () => openStores.forEach(store => { if (store.status().dirty) store.flush(); }));
        if (root.document && root.document.addEventListener) {
            root.document.addEventListener('visibilitychange', () => { if (root.document.visibilityState === 'hidden') flushAll(); });
        }
    }

    /** The page-level store for a tool (one per tool per page). */
    function open(tool, options) {
        if (openStores.has(tool)) return openStores.get(tool);
        const store = createStore(tool, options);
        openStores.set(tool, store);
        bindStorageListener();
        return store;
    }

    // ---------- Shared settings: "my domain" and the CV pick ----------
    const SETTINGS_DEFAULTS = Object.freeze({ myDomain: null, backupDomain: null, cvPick: null });

    function settings(options) {
        return open(SETTINGS_TOOL, Object.assign({ defaults: SETTINGS_DEFAULTS }, options || {}));
    }

    function getMyDomain(store) {
        return normaliseDomain((store || settings()).get().myDomain);
    }

    function getBackupDomain(store) {
        return normaliseDomain((store || settings()).get().backupDomain);
    }

    /** Set "my domain" (and optionally the backup). Unknown domains are refused. Returns the saved slug. */
    function setMyDomain(value, extra, store) {
        const slug = normaliseDomain(value);
        if (!slug) throw new Error('Unknown domain: ' + value);
        const target = store || settings();
        target.update(data => {
            data.myDomain = slug;
            if (extra && Object.prototype.hasOwnProperty.call(extra, 'backup')) {
                const backup = extra.backup ? normaliseDomain(extra.backup) : null;
                if (extra.backup && !backup) throw new Error('Unknown domain: ' + extra.backup);
                data.backupDomain = backup && backup !== slug ? backup : null;
            } else if (data.backupDomain === slug) {
                data.backupDomain = null;
            }
            return data;
        });
        return slug;
    }

    /** Validate and normalise a CV pick: { situation 'A'-'H', order [section ids], design, variants [], domain }. */
    function normaliseCvPick(pick) {
        if (!isPlainObject(pick)) throw new TypeError('CV pick must be an object');
        const situation = String(pick.situation || '').trim().toUpperCase();
        if (!SITUATIONS.includes(situation)) throw new Error('Unknown situation: ' + pick.situation);
        const order = Array.isArray(pick.order) ? pick.order.map(item => String(item).trim()).filter(Boolean) : [];
        const variants = Array.isArray(pick.variants) ? [...new Set(pick.variants.map(item => String(item).trim()).filter(Boolean))] : [];
        let design = pick.design;
        if (design !== null && design !== undefined && design !== '') {
            design = typeof design === 'number' ? design : String(design).trim();
            if (typeof design === 'string' && /^\d+$/.test(design)) design = Number(design);
        } else {
            design = null;
        }
        return {
            situation,
            order,
            design,
            variants,
            domain: pick.domain ? normaliseDomain(pick.domain) : null,
            source: pick.source ? String(pick.source) : 'cv-recommender',
            savedAt: pick.savedAt ? String(pick.savedAt) : new Date().toISOString()
        };
    }

    function setCvPick(pick, store) {
        const clean = normaliseCvPick(pick);
        const target = store || settings();
        target.update(data => {
            data.cvPick = clean;
            if (clean.domain && !data.myDomain) data.myDomain = clean.domain;
            return data;
        });
        return clean;
    }

    function getCvPick(store) {
        const pick = (store || settings()).get().cvPick;
        if (!pick) return null;
        try { return normaliseCvPick(pick); } catch (_) { return null; }
    }

    function onSettingsChange(listener, store) {
        return (store || settings()).subscribe(listener);
    }

    return Object.freeze({
        TABLE, KEY_PREFIX, SETTINGS_TOOL, MAX_BYTES, DOMAINS, SITUATIONS,
        normaliseDomain, domainLabel, isValidTool, storageKey, isMissingTableError, reconcile,
        createStore, open, settings, getMyDomain, getBackupDomain, setMyDomain,
        normaliseCvPick, setCvPick, getCvPick, onSettingsChange,
        _readEnvelope: readEnvelope, _sessionUserId: sessionUserId
    });
});
