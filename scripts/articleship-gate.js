/**
 * MSC Articleship Program: courtesy gate for the programme's web tools.
 * Shows a tool only to a signed-in student enrolled in msc-articleship-program (not "any programme").
 * It is a courtesy gate, not security: the page's content is still in the page. Real protection lives in Supabase.
 *
 * - A student verified on this device in the last 7 days sees the tool at once; the check re-runs quietly.
 * - A network error never locks a verified student out; a new device shows "Try again".
 * - On localhost the gate steps aside so builders can test; ?gate=check runs the real check, ?gate=login|enrol|retry
 *   previews each card.
 *
 * Browser: window.MSCArticleshipGate. Node (tests): require('./scripts/articleship-gate.js').
 * API reference: msc-content/articleship-program/v3/build/tools/PLATFORM.md
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCArticleshipGate = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const COURSE = 'msc-articleship-program';
    const CACHE_KEY = 'msc.articleship.gate';
    const CACHE_DAYS = 7;
    const PROGRAMME_URL = '/articleship-program/';
    const COURSE_URL = '/learning-management-system/course?course=msc-articleship-program';
    const LOGO = '/articleship-program/shared/msc-logo.svg';
    const ALIASES = Object.freeze({
        'articleship': COURSE, 'articleship-program': COURSE, 'articleship-mastery': COURSE, 'msc-articleship-mastery': COURSE
    });

    function canonicalCourse(course) {
        const value = String(course || '').trim().toLowerCase();
        return ALIASES[value] || value;
    }

    function isArticleshipCourse(course) {
        return canonicalCourse(course) === COURSE;
    }

    /** access: { user, courses, error } → 'allow' | 'login' | 'enrol' | 'retry' */
    function decide(access) {
        if (!access) return 'retry';
        if (access.error) return 'retry';
        if (!access.user) return 'login';
        return (access.courses || []).some(isArticleshipCourse) ? 'allow' : 'enrol';
    }

    function isLocalHost(hostname) {
        const host = String(hostname || '').toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1' || host.endsWith('.localhost');
    }

    function getClient() {
        try {
            return root.supabaseClient || (typeof root.getSupabaseClient === 'function' ? root.getSupabaseClient() : null);
        } catch (_) {
            return null;
        }
    }

    /** Server-verified user (auth.getUser) + their enrolment rows. Never trusts user_metadata or localStorage. */
    async function check(client) {
        const result = { user: null, courses: [], error: null };
        try {
            const db = client || getClient();
            if (!db) throw new Error('Account check is unavailable');
            const { data, error } = await db.auth.getUser();
            if (error) {
                if (error.name === 'AuthSessionMissingError' || /session missing|not authenticated|jwt/i.test(String(error.message || ''))) return result;
                throw error;
            }
            result.user = (data && data.user) || null;
            if (!result.user) return result;
            const response = await db.from('enrollment').select('course').eq('uuid', result.user.id);
            if (response.error) throw response.error;
            result.courses = [...new Set((response.data || []).map(row => row.course).filter(Boolean))];
            return result;
        } catch (error) {
            result.error = error;
            return result;
        }
    }

    function readCache(storage, userId, now) {
        try {
            const cached = JSON.parse(storage.getItem(CACHE_KEY) || 'null');
            if (!cached || cached.user !== userId) return false;
            return now - Number(cached.at) < CACHE_DAYS * 86400000;
        } catch (_) {
            return false;
        }
    }

    function writeCache(storage, userId, now) {
        try {
            if (userId) storage.setItem(CACHE_KEY, JSON.stringify({ user: userId, at: now }));
            else storage.removeItem(CACHE_KEY);
        } catch (_) { /* storage blocked */ }
    }

    function storedUserId() {
        try {
            if (root.__mscSession && root.__mscSession.user) return root.__mscSession.user.id || null;
            for (const key of ['sb-auth-auth-token', 'sb-izsggdtdiacxdsjjncdq-auth-token']) {
                const raw = root.localStorage && root.localStorage.getItem(key);
                const parsed = raw ? JSON.parse(raw) : null;
                if (parsed && parsed.user && parsed.user.id) return parsed.user.id;
            }
            return null;
        } catch (_) {
            return null;
        }
    }

    const CARDS = {
        loading: { title: '', text: '' },
        login: { title: 'Log in to open this', text: 'This tool is part of the MSC Articleship Program. Log in with the account you enrolled with.' },
        enrol: { title: 'Part of the MSC Articleship Program', text: 'This account is not enrolled in the programme yet.' },
        retry: { title: 'Could not check your access', text: 'Check your internet connection and try again.' }
    };

    function loginUrl(loc) {
        const path = (loc && (loc.pathname + loc.search + loc.hash)) || '/';
        return '/login.html?redirect=' + encodeURIComponent(path);
    }

    function renderCard(doc, state, actions) {
        let gate = doc.getElementById('ap-gate');
        if (!gate) {
            gate = doc.createElement('div');
            gate.id = 'ap-gate';
            gate.className = 'ap-gate';
            gate.setAttribute('role', 'dialog');
            gate.setAttribute('aria-modal', 'true');
            doc.body.appendChild(gate);
        }
        gate.textContent = '';
        const card = doc.createElement('div');
        card.className = 'ap-gate-card';
        const logo = doc.createElement('img');
        logo.src = LOGO;
        logo.alt = 'My Student Club';
        card.appendChild(logo);
        if (state === 'loading') {
            const loading = doc.createElement('div');
            loading.className = 'ap-gate-loading';
            const spinner = doc.createElement('div');
            spinner.className = 'ap-spinner';
            spinner.setAttribute('aria-label', 'Loading');
            loading.appendChild(spinner);
            card.appendChild(loading);
        } else {
            const copy = CARDS[state];
            const h1 = doc.createElement('h1');
            h1.textContent = copy.title;
            const p = doc.createElement('p');
            p.textContent = copy.text;
            card.appendChild(h1);
            card.appendChild(p);
            const box = doc.createElement('div');
            box.className = 'ap-gate-actions';
            actions.forEach((action, index) => {
                const node = doc.createElement(action.href ? 'a' : 'button');
                node.className = 'ap-btn is-block' + (index ? ' is-secondary' : '');
                node.textContent = action.label;
                if (action.href) node.href = action.href;
                else { node.type = 'button'; node.addEventListener('click', action.onClick); }
                box.appendChild(node);
            });
            card.appendChild(box);
        }
        gate.appendChild(card);
        gate.dataset.state = state;
        return gate;
    }

    function ensureNoindex(doc) {
        if (!doc.head || doc.querySelector('meta[name="robots"]')) return;
        const meta = doc.createElement('meta');
        meta.name = 'robots';
        meta.content = 'noindex';
        doc.head.appendChild(meta);
    }

    /**
     * Gate the current page. Resolves with { state: 'allow', user } once the tool may show (it never rejects).
     * options: { client, onAllow(user), storage, location, document, now }
     */
    function protect(options) {
        const opts = options || {};
        const doc = opts.document || root.document;
        const loc = opts.location || root.location || {};
        const storage = opts.storage || (function () { try { return root.localStorage; } catch (_) { return null; } })() ||
            { getItem: () => null, setItem() {}, removeItem() {} };
        const now = opts.now || (() => Date.now());
        const htmlEl = doc.documentElement;
        ensureNoindex(doc);

        let resolveAllowed;
        const allowed = new Promise(resolve => { resolveAllowed = resolve; });
        let shown = false;

        function allow(user, how) {
            if (!shown) {
                shown = true;
                htmlEl.classList.remove('ap-gated');
                const gate = doc.getElementById('ap-gate');
                if (gate) gate.remove();
                if (typeof opts.onAllow === 'function') {
                    try { opts.onAllow(user, how); } catch (error) { if (root.console) root.console.error(error); }
                }
                resolveAllowed({ state: 'allow', user, how });
            }
        }

        function block(state) {
            shown = false;
            htmlEl.classList.add('ap-gated');
            const actions = state === 'login'
                ? [{ label: 'Log in', href: loginUrl(loc) }, { label: 'About the programme', href: PROGRAMME_URL }]
                : state === 'enrol'
                    ? [{ label: 'See the programme', href: PROGRAMME_URL }, { label: 'Log in with another account', href: loginUrl(loc) }]
                    : [{ label: 'Try again', onClick: run }, { label: 'Back to the programme', href: COURSE_URL }];
            renderCard(doc, state, actions);
        }

        const params = new URLSearchParams(loc.search || '');
        const preview = params.get('gate');
        if (isLocalHost(loc.hostname) && preview !== 'check') {
            if (preview && CARDS[preview] && preview !== 'loading') block(preview);
            else allow(null, 'preview');
            return allowed;
        }

        async function run() {
            const cachedUser = storedUserId();
            const trusted = cachedUser && readCache(storage, cachedUser, now());
            if (trusted) allow({ id: cachedUser }, 'cache');
            else { htmlEl.classList.add('ap-gated'); renderCard(doc, 'loading', []); }
            const access = await check(opts.client);
            const state = decide(access);
            if (state === 'allow') {
                writeCache(storage, access.user.id, now());
                allow(access.user, 'verified');
            } else if (state === 'retry') {
                if (!trusted) block('retry');
            } else {
                writeCache(storage, null, now());
                block(state);
            }
            return state;
        }

        run();
        return allowed;
    }

    return Object.freeze({ COURSE, CACHE_KEY, canonicalCourse, isArticleshipCourse, decide, check, protect, isLocalHost, loginUrl });
});
