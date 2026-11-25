// Is the student's CV really on file? (Padam, 25 Nov 2026: "make it compulsory to have cv in their profile".)
// A profile can name a CV (cv_filename, a copy in this browser) whose upload never reached storage, so no recruiter
// ever gets it. hire.mystudentclub.com GET /api/student/cv-status checks the stored file with the student's own token.
// The answer is kept in localStorage 'msc_cv_on_file' as {uid, state: 'yes'|'no', at}; profile-completion.js counts
// "Add resume" done only while the state is not 'no' for the profile's owner. Unknown (offline, an error) is never 'no'.
// Self-contained on purpose: a browser holding an older cached profile-completion.js must not break this import.
export const CV_ON_FILE_KEY = 'msc_cv_on_file';   // the same key profile-completion.js reads

export function readCvOnFile(storage = globalThis.localStorage, uid = null) {
    try {
        const v = JSON.parse(storage?.getItem?.(CV_ON_FILE_KEY) || 'null');
        if (!v || (v.state !== 'yes' && v.state !== 'no')) return null;
        if (uid && v.uid !== uid) return null;
        return v;
    } catch (_) {
        return null;
    }
}
export const CV_STATUS_URL = 'https://hire.mystudentclub.com/api/student/cv-status';
const FRESH_MS = { yes: 6 * 60 * 60 * 1000, no: 60 * 1000 };

export function markCvOnFile(uid, onFile, storage = globalThis.localStorage, now = Date.now()) {
    try {
        if (!uid) return;
        storage?.setItem?.(CV_ON_FILE_KEY, JSON.stringify({ uid, state: onFile ? 'yes' : 'no', at: now }));
    } catch (_) { /* storage blocked: the check simply runs again next time */ }
}

// true | false | null (unknown). session: a Supabase session ({access_token, user: {id}}).
export async function checkCvOnFile(session, { fetchImpl = globalThis.fetch, storage = globalThis.localStorage, force = false, timeoutMs = 6000, now = Date.now() } = {}) {
    const uid = session?.user?.id, token = session?.access_token;
    if (!uid || !token || typeof fetchImpl !== 'function') return null;
    const cached = readCvOnFile(storage, uid);
    if (!force && cached && now - (Number(cached.at) || 0) < FRESH_MS[cached.state]) return cached.state === 'yes';
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        const res = await fetchImpl(CV_STATUS_URL, { headers: { Authorization: `Bearer ${token}` }, signal: controller?.signal });
        if (!res?.ok) return cached ? cached.state === 'yes' : null;
        const data = await res.json();
        if (!data || data.ok !== true || typeof data.hasCv !== 'boolean') return cached ? cached.state === 'yes' : null;
        markCvOnFile(uid, data.hasCv, storage, now);
        return data.hasCv;
    } catch (_) {
        return cached ? cached.state === 'yes' : null;
    } finally {
        if (timer) clearTimeout(timer);
    }
}
