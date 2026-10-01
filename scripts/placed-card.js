/**
 * Profile page: the "Got placed? Share your offer letter" card (#sec-placed).
 * "I got placed" asks the msc-mail Worker for this user's offer-letter form:
 *   POST https://notify.mystudentclub.com/placed/start
 *   Authorization: Bearer <Supabase access token>
 *   → 200 { ok: true, url: "/placed?t=…&p=…", href: "https://notify.mystudentclub.com/placed?t=…&p=…" }
 *   → 401 { error: "sign_in", message } (no or expired session), else { error, message } to show
 * (msc-mail worker/src/forms.js placedStart) and opens that form in the same tab. The form (company, role,
 * joining date, offer letter) and everything after it live in the Worker. Only a /placed page on the
 * Worker's own origin is followed.
 */
(function (global) {
    'use strict';

    var ENDPOINT = 'https://notify.mystudentclub.com/placed/start';
    var FORM_ORIGIN = 'https://notify.mystudentclub.com';
    var TIMEOUT_MS = 15000;
    var MESSAGES = {
        failed: 'We could not open the form right now. Please try again in a minute.',
        offline: 'You seem to be offline. Check your connection and try again.'
    };

    /** The form URL from the Worker's reply (href, else url resolved on the Worker), only if it is its /placed page. */
    function formUrlFrom(body) {
        var candidates = body ? [body.href, body.url] : [];
        for (var i = 0; i < candidates.length; i++) {
            if (typeof candidates[i] !== 'string' || !candidates[i].trim()) continue;
            try {
                var u = new URL(candidates[i].trim(), FORM_ORIGIN);
                if (u.origin === FORM_ORIGIN && /^\/placed\/?$/.test(u.pathname)) return u.href;
            } catch (e) {
                /* try the next one */
            }
        }
        return null;
    }

    async function accessToken(win) {
        var client = win.supabaseClient || (typeof win.getSupabaseClient === 'function' ? win.getSupabaseClient() : null);
        if (!client || !client.auth || typeof client.auth.getSession !== 'function') return null;
        var res = await client.auth.getSession();
        var session = res && res.data ? res.data.session : null;
        return session && session.access_token ? session.access_token : null;
    }

    /**
     * → { url } to open, { login: true } when the session is missing or rejected, or { message } to show.
     */
    async function requestFormUrl(win, fetchImpl) {
        var token = await accessToken(win);
        if (!token) return { login: true };
        var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
        var res;
        try {
            res = await fetchImpl(ENDPOINT, {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ source: 'profile' }),
                credentials: 'omit',
                signal: ctrl ? ctrl.signal : undefined
            });
        } catch (e) {
            return { message: win.navigator && win.navigator.onLine === false ? MESSAGES.offline : MESSAGES.failed };
        } finally {
            if (timer) clearTimeout(timer);
        }
        if (res.status === 401) return { login: true };
        var body = null;
        try {
            body = await res.json();
        } catch (e) {
            body = null;
        }
        var url = res.ok ? formUrlFrom(body) : null;
        if (url) return { url: url };
        return { message: (body && typeof body.message === 'string' && body.message.trim()) || MESSAGES.failed };
    }

    function wire(win, doc, deps) {
        var btn = doc.getElementById('placedStartBtn');
        var status = doc.getElementById('placedStatus');
        if (!btn) return null;
        var spinner = btn.querySelector('.fa-spinner');
        var fetchImpl = (deps && deps.fetch) || win.fetch.bind(win);

        function busy(on) {
            btn.disabled = on;
            btn.setAttribute('aria-busy', on ? 'true' : 'false');
            if (spinner) spinner.hidden = !on;
        }

        async function onClick() {
            if (btn.disabled) return;
            busy(true);
            if (status) status.textContent = '';
            var result;
            try {
                result = await requestFormUrl(win, fetchImpl);
            } catch (e) {
                result = { message: MESSAGES.failed };
            }
            if (result.url) {
                win.location.assign(result.url);
                return; // leave the button busy while the form loads
            }
            if (result.login) {
                win.location.href = '/login.html';
                return;
            }
            busy(false);
            if (status) status.textContent = result.message;
        }

        btn.addEventListener('click', onClick);
        return { click: onClick };
    }

    global.MSCPlacedCard = { ENDPOINT: ENDPOINT, formUrlFrom: formUrlFrom, requestFormUrl: requestFormUrl, wire: wire };

    if (global.document && typeof global.fetch === 'function') {
        if (global.document.readyState === 'loading') {
            global.document.addEventListener('DOMContentLoaded', function () { wire(global, global.document); });
        } else {
            wire(global, global.document);
        }
    }
})(typeof window !== 'undefined' ? window : globalThis);
