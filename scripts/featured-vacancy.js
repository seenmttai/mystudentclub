// Featured vacancies (Nov 2026): a recruiter's ₹999 Vacancy Boost on hire.mystudentclub.com sets featured_until on the
// job row for 15 days. While it is in the future the vacancy is pinned on top of page 1 of its section (matching the
// student's filters) with a small "Featured" tag. Featured never locks or gates a job: that is is_exclusive
// (exclusive-vacancy.js), which a Boost never sets.

export const FEATURED_SELECT = ', featured_until';

export function isFeatured(job, now = Date.now()) {
    const until = job && job.featured_until ? Date.parse(job.featured_until) : NaN;
    return Number.isFinite(until) && until > now;
}

// Reading featured_until fails until the Boost SQL adds the column ("column … featured_until does not exist", 42703 /
// PGRST204), and for visitors who aren't signed in until it is granted to them: the job tables use column grants, and
// Postgres then answers "permission denied for table …" (42501) without naming the column. Either way the page drops
// featured_until and carries on.
export function isFeaturedColumnError(error) {
    if (!error) return false;
    const message = String(error.message || '');
    return /featured_until/.test(message) || error.code === '42501' || /permission denied/i.test(message);
}

// Page 1: the pinned groups in turn (Featured first, then e.g. Articleship exclusives), each in the student's sort,
// then the rest of the page. A job shows once, in the first group that has it.
export function mergePinnedJobs(rest, groups, sortBy) {
    const pinnedIds = new Set();
    const pinned = [];
    for (const group of groups) {
        const jobs = Array.isArray(group) ? group.slice() : [];
        // The database already orders each group by the student's sort; "popular" is sorted here, like the page.
        if (sortBy === 'popular') jobs.sort((a, b) => (b.application_count || 0) - (a.application_count || 0));
        for (const job of jobs) {
            if (!job || pinnedIds.has(job.id)) continue;
            pinnedIds.add(job.id);
            pinned.push(job);
        }
    }
    const others = (Array.isArray(rest) ? rest : []).filter((job) => job && !pinnedIds.has(job.id));
    return { jobs: [...pinned, ...others], pinnedIds };
}

// Preview only (localhost and *.pages.dev with ?featured-demo): shows one vacancy as Featured, on top, so the tag can be
// seen before any vacancy is boosted. Never runs on www.
export function applyFeaturedDemo(jobs, loc = (typeof window !== 'undefined' ? window.location : null), now = Date.now()) {
    try {
        const host = loc.hostname;
        const previewHost = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.pages.dev');
        if (!previewHost || !new URLSearchParams(loc.search).has('featured-demo')) return jobs;
    } catch (_) {
        return jobs;
    }
    if (!Array.isArray(jobs) || jobs.some((job) => isFeatured(job, now))) return jobs;
    const fresh = (job) => job && !job.is_exclusive && now - Date.parse(job.Created_At) < 15 * 24 * 60 * 60 * 1000;
    const index = jobs.findIndex(fresh);
    if (index < 0) return jobs;
    const [demo] = jobs.splice(index, 1);
    demo.featured_until = new Date(now + 15 * 24 * 60 * 60 * 1000).toISOString();
    jobs.unshift(demo);
    return jobs;
}
