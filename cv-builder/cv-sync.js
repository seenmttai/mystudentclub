/**
 * CV Builder account sync: the draft and the saved versions follow a signed-in student to every device.
 *
 * One "slot" is one JSON value (the draft, or the list of saved versions). A slot lives on the device at once and, for a
 * signed-in student, in one row of a Supabase table: (user_id, tool) -> data, with a server-clock updated_at.
 *   - normal Builder:      table cv_builder_progress, tools 'cv-draft' and 'cv-history'
 *   - Articleship Builder: table articleship_tool_progress, tool 'cv-history' (its draft already uses that table's store)
 * The page works with no table, no network and no login: every failure leaves the device copy in charge.
 *
 * Rules (decided with Aniket, 13 Nov 2026):
 *   - the draft saves on every change (device at once, account about a second later and when the tab is hidden);
 *   - two devices changed it: the newest change wins and the older CV becomes a saved version, so nothing is lost;
 *   - an empty CV never replaces a CV that has content;
 *   - saved versions: the newest 10; a new save pushes out the oldest; a deleted version stays deleted on every device.
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCCvSync = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const HISTORY_LIMIT = 10;
    // The table rejects a value above 512 KB; stay well below it.
    const HISTORY_MAX_BYTES = 450000;
    // articleship_tool_progress rejects a value above 256 KB.
    const HISTORY_MAX_BYTES_ARTICLESHIP = 240000;
    const DRAFT_MAX_BYTES = 200000;
    const DELETED_LIMIT = 50;
    const ENVELOPE_VERSION = 1;
    // supabase-js keeps the session under sb-<first host label>-auth-token: "sb-auth-…" for auth.mystudentclub.com.
    const AUTH_KEYS = ['sb-auth-auth-token', 'sb-izsggdtdiacxdsjjncdq-auth-token'];

    function clone(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function isPlainObject(value) {
        return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
    }

    // ---------- Saved versions ----------

    /** Newest first, at most `limit`; while the list is too big for the table the oldest versions go first. */
    function trimHistory(items, limit, maxBytes) {
        const max = limit === undefined ? HISTORY_LIMIT : limit;
        const bytes = maxBytes === undefined ? HISTORY_MAX_BYTES : maxBytes;
        const list = (Array.isArray(items) ? items : [])
            .filter(item => isPlainObject(item) && item.id !== undefined && item.id !== null)
            .slice()
            .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0) || Number(b.id) - Number(a.id));
        const seen = new Set();
        const unique = list.filter(item => (seen.has(item.id) ? false : (seen.add(item.id), true)));
        let kept = unique.slice(0, max);
        while (kept.length > 1 && JSON.stringify(kept).length > bytes) kept = kept.slice(0, -1);
        return kept;
    }

    function normaliseHistory(data, maxBytes) {
        const source = isPlainObject(data) ? data : {};
        const deleted = Array.isArray(source.deleted) ? source.deleted.slice(0, DELETED_LIMIT) : [];
        const gone = new Set(deleted);
        return { items: trimHistory((Array.isArray(source.items) ? source.items : []).filter(item => !gone.has(item && item.id)), HISTORY_LIMIT, maxBytes), deleted };
    }

    /** Two devices changed the list: keep every version both have, minus what either device deleted, newest 10. */
    function mergeHistory(local, remote, maxBytes) {
        const a = normaliseHistory(local, Infinity);
        const b = normaliseHistory(remote, Infinity);
        const deleted = [...new Set([...a.deleted, ...b.deleted])].slice(0, DELETED_LIMIT);
        const gone = new Set(deleted);
        return { items: trimHistory([...a.items, ...b.items].filter(item => !gone.has(item.id)), HISTORY_LIMIT, maxBytes), deleted };
    }

    /** A student deleted one version: it leaves the list and its id is remembered so a sync cannot bring it back. */
    function withoutVersion(data, id) {
        const current = normaliseHistory(data, Infinity);
        const deleted = [id, ...current.deleted.filter(item => item !== id)].slice(0, DELETED_LIMIT);
        return { items: current.items.filter(item => item.id !== id), deleted };
    }

    /** A new save: it goes first, and the oldest version leaves when there are more than 10. */
    function withVersion(data, snapshot, maxBytes) {
        const current = normaliseHistory(data, Infinity);
        return { items: trimHistory([snapshot, ...current.items.filter(item => item.id !== snapshot.id)], HISTORY_LIMIT, maxBytes), deleted: current.deleted.filter(id => id !== snapshot.id) };
    }

    // ---------- The draft ----------

    /**
     * Two devices changed the draft ({ cv, at }). The newest change wins; the other CV is returned as `loser` so the page
     * can keep it as a saved version. An empty CV never wins and is never kept.
     */
    function mergeDrafts(local, remote, isEmpty) {
        const empty = typeof isEmpty === 'function' ? isEmpty : value => !value;
        const a = isPlainObject(local) ? local : { cv: null, at: 0 };
        const b = isPlainObject(remote) ? remote : { cv: null, at: 0 };
        const aEmpty = empty(a.cv);
        const bEmpty = empty(b.cv);
        if (aEmpty && bEmpty) return { data: clone(a.at >= b.at ? a : b), loser: null };
        if (aEmpty) return { data: clone(b), loser: null };
        if (bEmpty) return { data: clone(a), loser: null };
        if (JSON.stringify(a.cv) === JSON.stringify(b.cv)) return { data: clone(Number(a.at) >= Number(b.at) ? a : b), loser: null };
        const localWins = (Number(a.at) || 0) >= (Number(b.at) || 0);
        return localWins ? { data: clone(a), loser: clone(b) } : { data: clone(b), loser: clone(a) };
    }

    // ---------- One slot: device copy + account row ----------

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

    /** "This table is not there (yet)": only then does a slot stop trying for the session. */
    function isMissingTableError(error) {
        if (!error) return false;
        const code = String(error.code || '');
        const message = String(error.message || '') + ' ' + String(error.details || '') + ' ' + String(error.hint || '');
        return code === 'PGRST205' || code === '42P01' || code === 'PGRST106' || Number(error.status) === 404 ||
            /could not find the table|relation .* does not exist|schema cache/i.test(message);
    }

    /** local: envelope; remote: null | { data, updated_at } -> { action: 'none' | 'push' | 'pull' | 'merge', data, remoteTime }. */
    function reconcile(local, remote, merge) {
        if (!remote) return { action: local.updatedAt > 0 ? 'push' : 'none', data: local.data, remoteTime: 0 };
        const remoteTime = Date.parse(remote.updated_at) || 0;
        const remoteData = isPlainObject(remote.data) ? remote.data : {};
        if (!local.dirty) {
            return remoteTime !== local.syncedAt ? { action: 'pull', data: remoteData, remoteTime } : { action: 'none', data: local.data, remoteTime };
        }
        if (remoteTime === local.syncedAt) return { action: 'push', data: local.data, remoteTime };
        if (typeof merge === 'function') return { action: 'merge', data: merge(clone(local.data), clone(remoteData)), remoteTime };
        return local.updatedAt >= remoteTime ? { action: 'push', data: local.data, remoteTime } : { action: 'pull', data: remoteData, remoteTime };
    }

    function browserStorage() {
        try {
            const storage = root.localStorage;
            storage.setItem('msc.cv-sync.probe', '1');
            storage.removeItem('msc.cv-sync.probe');
            return storage;
        } catch (_) {
            const memory = new Map();
            return { getItem: key => (memory.has(key) ? memory.get(key) : null), setItem: (key, value) => { memory.set(key, String(value)); }, removeItem: key => { memory.delete(key); } };
        }
    }

    function browserSessionFlags() {
        try { return root.sessionStorage; } catch (_) { return null; }
    }

    /** The signed-in user id without a network call. */
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
        } catch (_) { /* no stored session */ }
        return null;
    }

    async function currentUserId(client, storage) {
        try {
            if (client && client.auth && typeof client.auth.getSession === 'function') {
                const { data } = await client.auth.getSession();
                return data && data.session && data.session.user ? data.session.user.id : null;
            }
        } catch (_) { /* fall back to the stored session */ }
        return sessionUserId(storage);
    }

    /**
     * Options: table, tool, key (device storage key), defaults, merge(local, remote), maxBytes,
     *   getClient() -> Supabase client | null, userId() -> id | null, storage, sessionFlags, now, debounceMs (default 800),
     *   remote: false keeps the slot on this device only.
     */
    function createSlot(options) {
        const opts = options || {};
        if (!opts.table || !opts.tool || !opts.key) throw new Error('createSlot needs table, tool and key');
        const storage = opts.storage || browserStorage();
        const sessionFlags = opts.sessionFlags === undefined ? browserSessionFlags() : opts.sessionFlags;
        const getClient = opts.getClient || (() => null);
        const now = opts.now || (() => Date.now());
        const debounceMs = opts.debounceMs === undefined ? 800 : opts.debounceMs;
        const maxBytes = opts.maxBytes || DRAFT_MAX_BYTES;
        const defaults = isPlainObject(opts.defaults) ? opts.defaults : {};
        const syncUser = opts.userId || (() => sessionUserId(storage));
        const missingFlag = 'msc.cv-sync.missing:' + opts.table;
        const listeners = new Set();
        let envelope = readEnvelope(storage.getItem(opts.key), defaults);
        let remoteState = opts.remote === false ? 'off' : 'idle';
        let editVersion = 0;
        let timer = null;
        let inFlight = null;
        let destroyed = false;
        let ownerChanged = false;

        // Another student signed in on this browser: never carry their CV into this account.
        const visibleUser = syncUser();
        if (visibleUser && envelope.owner && envelope.owner !== visibleUser) {
            envelope = emptyEnvelope(defaults, visibleUser);
            ownerChanged = true;
            persist();
        }

        function persist() {
            try { storage.setItem(opts.key, JSON.stringify(envelope)); } catch (_) { /* quota or blocked: the memory copy still works */ }
        }

        function emit(source) {
            listeners.forEach(listener => {
                try { listener(clone(envelope.data), { source, tool: opts.tool }); } catch (error) { if (root.console) root.console.error(error); }
            });
        }

        function remoteDisabled() {
            if (remoteState === 'off' || remoteState === 'missing') return true;
            try { return Boolean(sessionFlags && sessionFlags.getItem(missingFlag) === '1'); } catch (_) { return false; }
        }

        function markMissing() {
            remoteState = 'missing';
            try { if (sessionFlags) sessionFlags.setItem(missingFlag, '1'); } catch (_) { /* ignore */ }
        }

        async function push() {
            if (remoteDisabled()) return false;
            const client = getClient();
            if (!client || typeof client.from !== 'function') return false;
            const userId = await currentUserId(client, storage);
            if (!userId) return false;
            if (envelope.owner && envelope.owner !== userId) return false;
            if (JSON.stringify(envelope.data).length > maxBytes) { remoteState = 'too-large'; return false; }
            const version = editVersion;
            try {
                const { data, error } = await client.from(opts.table)
                    .upsert({ user_id: userId, tool: opts.tool, data: envelope.data }, { onConflict: 'user_id,tool' })
                    .select('updated_at').single();
                if (error) {
                    if (isMissingTableError(error)) markMissing(); else remoteState = 'error';
                    return false;
                }
                envelope.syncedAt = Date.parse(data && data.updated_at) || now();
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

        function flush() {
            if (timer) { clearTimeout(timer); timer = null; }
            if (inFlight) return inFlight.then(saved => (saved && envelope.dirty ? flush() : saved));
            if (!envelope.dirty) return Promise.resolve(true);
            inFlight = push().finally(() => { inFlight = null; });
            return inFlight;
        }

        function schedulePush() {
            if (remoteDisabled() || destroyed) return;
            if (timer) clearTimeout(timer);
            if (debounceMs <= 0) { flush(); return; }
            timer = setTimeout(() => { timer = null; flush(); }, debounceMs);
        }

        async function pull() {
            if (remoteDisabled()) return 'local';
            const client = getClient();
            if (!client || typeof client.from !== 'function') return 'local';
            const userId = await currentUserId(client, storage);
            if (!userId) return 'local';
            if (envelope.owner && envelope.owner !== userId) {
                envelope = emptyEnvelope(defaults, userId);
                ownerChanged = true;
                persist();
                emit('account-switch');
            }
            try {
                const { data, error } = await client.from(opts.table).select('data, updated_at').eq('tool', opts.tool).maybeSingle();
                if (error) {
                    if (isMissingTableError(error)) markMissing(); else remoteState = 'error';
                    return 'local';
                }
                const decision = reconcile(envelope, data || null, opts.merge);
                if (decision.action === 'pull') {
                    envelope = { v: ENVELOPE_VERSION, data: Object.assign(clone(defaults), clone(decision.data)), updatedAt: decision.remoteTime, syncedAt: decision.remoteTime, dirty: false, owner: userId };
                    persist();
                    emit('remote');
                } else if (decision.action === 'push' || decision.action === 'merge') {
                    if (decision.action === 'merge') {
                        envelope.data = Object.assign(clone(defaults), decision.data);
                        envelope.updatedAt = Math.max(now(), envelope.updatedAt + 1);
                        persist();
                        emit('merge');
                    }
                    envelope.syncedAt = decision.remoteTime || envelope.syncedAt;
                    envelope.dirty = true;
                    envelope.owner = userId;
                    editVersion += 1;
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

        const slot = {
            tool: opts.tool,
            key: opts.key,
            get: () => clone(envelope.data),
            set(next, source) {
                if (!isPlainObject(next)) throw new TypeError('A slot holds a plain object');
                envelope.data = clone(next);
                envelope.updatedAt = Math.max(now(), envelope.updatedAt + 1);
                envelope.dirty = true;
                if (!envelope.owner) envelope.owner = syncUser() || null;
                editVersion += 1;
                persist();
                emit(source || 'local');
                schedulePush();
            },
            subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
            flush,
            pull,
            owner: () => envelope.owner,
            ownerChanged: () => ownerChanged,
            status: () => ({ remote: remoteState, dirty: envelope.dirty, updatedAt: envelope.updatedAt }),
            destroy() { destroyed = true; if (timer) clearTimeout(timer); listeners.clear(); }
        };
        return slot;
    }

    return Object.freeze({
        HISTORY_LIMIT, HISTORY_MAX_BYTES, HISTORY_MAX_BYTES_ARTICLESHIP, DRAFT_MAX_BYTES,
        trimHistory, mergeHistory, withVersion, withoutVersion, normaliseHistory, mergeDrafts,
        reconcile, isMissingTableError, createSlot, sessionUserId
    });
});
