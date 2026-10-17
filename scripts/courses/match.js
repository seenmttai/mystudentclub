// Pure text helpers for the course-aware portal: search terms that cannot
// break a PostgREST filter, city spellings, and the CS / CMA eligibility
// regexes run in the browser (stored as PostgreSQL patterns in courses.js).
// DOM-free and unit-tested in tests/courses.test.cjs.

// Keeps letters, digits, spaces and a few symbols that appear in company names
// and domains (M&A, S&P, Ind-AS, CA/CS). Everything that has meaning in a
// PostgREST filter string (commas, parentheses, quotes, backslashes, wildcards)
// is removed, so a typed term can never change the shape of the query.
export function sanitizeTerm(raw) {
    return String(raw ?? '')
        .normalize('NFKC')
        .replace(/[^\p{L}\p{N}&+/.\- ]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 40);
}

// "tax, audit , big 4" -> ["tax", "audit", "big 4"]. Commas separate terms,
// each term must match somewhere in the listing (AND across terms).
export function parseSearch(raw) {
    const seen = new Set();
    const terms = [];
    for (const part of String(raw ?? '').split(',')) {
        const term = sanitizeTerm(part);
        const key = term.toLowerCase();
        if (term.length >= 2 && !seen.has(key)) {
            seen.add(key);
            terms.push(term);
        }
        if (terms.length === 5) break;
    }
    return terms;
}

// Builds one PostgREST or() group: the term may appear in any of the columns.
// Spaces become wildcards so "phone pe" also finds "PhonePe".
export function termOrFilter(term, columns) {
    const clean = sanitizeTerm(term);
    if (!clean) return '';
    const pattern = `*${clean.replace(/ /g, '*')}*`;
    return columns
        .map(col => `${col.includes(' ') ? `"${col}"` : col}.ilike."${pattern}"`)
        .join(',');
}

// `aliases` maps a city label to every spelling seen in listings
// (Bengaluru/Bangalore, Gurugram/Gurgaon), so one tick finds all of them.
export function locationOrFilter(locations, aliases = {}) {
    const terms = new Set();
    for (const label of locations || []) {
        for (const spelling of aliases[label] || [label]) {
            const clean = sanitizeTerm(spelling);
            if (clean) terms.add(clean);
        }
    }
    return Array.from(terms).map(term => `Location.ilike."*${term}*"`).join(',');
}

// Joins regex alternatives into one alternation.
export function anyOf(patterns) {
    const list = (patterns || []).filter(Boolean);
    if (list.length === 0) return '';
    return list.length === 1 ? list[0] : `(${list.join('|')})`;
}

// Patterns are written for PostgreSQL (ARE). The only PostgreSQL-specific
// escapes they use are word boundaries: \m (start of word), \M (end of word)
// and \y (either). Everything else means the same in JavaScript.
export function pgToJs(pattern) {
    return String(pattern).replace(/\\([mMy])/g, (_, kind) => (kind === 'm' ? '\\b(?=\\w)' : kind === 'M' ? '\\b(?<=\\w)' : '\\b'));
}

const regexCache = new Map();
export function toRegExp(pattern) {
    if (!pattern) return null;
    if (!regexCache.has(pattern)) regexCache.set(pattern, new RegExp(pgToJs(pattern), 'is'));
    return regexCache.get(pattern);
}

export function matchesPattern(text, pattern) {
    const re = toRegExp(pattern);
    return Boolean(re && re.test(String(text ?? '')));
}

// A course match is { pre, pos, neg }: the gate and the positive pattern must
// match and the negative must not. A plain string is treated as { pos }.
export function courseMatches(text, match) {
    const m = typeof match === 'string' ? { pos: match } : (match || {});
    if (!m.pos) return false;
    if (m.pre && !matchesPattern(text, m.pre)) return false;
    if (!matchesPattern(text, m.pos)) return false;
    return !(m.neg && matchesPattern(text, m.neg));
}

// Firm-training lanes: who would sign the student's training? `check` is a
// lane's trainerCheck from courses.js ({ trainer, caFirm }). Returns 'trainer'
// (a PCS / Cost Accountant is named), 'ca-firm' (a CA firm and no such
// trainer), or 'unnamed' (neither).
export function trainerStatus(text, check) {
    if (check?.trainer && matchesPattern(text, check.trainer)) return 'trainer';
    if (check?.caFirm && matchesPattern(text, check.caFirm)) return 'ca-firm';
    return 'unnamed';
}

// The sentence around the first match, shown so a student can judge
// eligibility themselves ("Qualified CA/CMA/CS required").
export function matchContext(text, pattern, radius = 90) {
    const re = toRegExp(pattern);
    const source = String(text ?? '');
    const match = re && re.exec(source);
    if (!match) return '';
    const start = Math.max(0, match.index - radius);
    const end = Math.min(source.length, match.index + match[0].length + radius);
    const snippet = source.slice(start, end).replace(/\s+/g, ' ').trim();
    return `${start > 0 ? '…' : ''}${snippet}${end < source.length ? '…' : ''}`;
}
