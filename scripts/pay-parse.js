// Pay text typed by hirers on post-a-job ("10000-25000", "₹3.5 - 4.5 LPA",
// "50k", "15,000/month") -> rupees. The job tables keep one number in Salary,
// which the portal sorts and filters on (q.gte('Salary', min)), so we store
// the bottom of the range. DOM-free; tested in tests/pay-parse.test.cjs.

// Longest spellings first, so "lakhs" is not read as "l" + "akhs".
const UNIT_PATTERN = String.raw`(lpa|lakhs?|lacs?|lac|l(?![a-z])|crores?|cr(?![a-z])|thousand|k(?![a-z]))`;
const UNIT_RUPEES = { l: 100000, cr: 10000000, k: 1000 };

// A number with Indian or western grouping (1,20,000 / 120,000 / 120000) and
// an optional unit right after it. A comma not followed by a 2-3 digit group
// ("10000,20000") separates two numbers instead.
const AMOUNT = new RegExp(String.raw`(\d+(?:,\d{2,3}(?!\d))*(?:\.\d+)?)\s*${UNIT_PATTERN}?`, 'gi');
const RANGE_JOINER = /^\s*(?:-|–|—|to)\s*(?:rs\.?|inr|₹)?\s*$/i;

function unitRupees(unit) {
    const key = String(unit || '').toLowerCase();
    if (!key) return null;
    if (key === 'lpa' || key.startsWith('la') || key === 'l') return UNIT_RUPEES.l;
    if (key.startsWith('cr')) return UNIT_RUPEES.cr;
    return UNIT_RUPEES.k;
}

// { min, max } in rupees, or null when the text holds no amount ("Not
// disclosed", "Best in industry"). A unit written once applies to the whole
// range: "8-10 lakhs" is 8 lakh to 10 lakh.
export function parsePay(text) {
    const source = String(text ?? '').normalize('NFKC');
    const amounts = [];
    for (const match of source.matchAll(AMOUNT)) {
        amounts.push({
            value: Number(match[1].replace(/,/g, '')),
            unit: unitRupees(match[2]),
            start: match.index,
            end: match.index + match[0].length
        });
        if (amounts.length === 2) break;
    }
    if (amounts.length === 0 || !Number.isFinite(amounts[0].value)) return null;

    const [first, second] = amounts;
    const isRange = second && RANGE_JOINER.test(source.slice(first.end, second.start));
    const firstUnit = first.unit ?? (isRange ? second.unit : null) ?? 1;
    const low = Math.round(first.value * firstUnit);
    if (!isRange) return { min: low, max: low };
    const high = Math.round(second.value * (second.unit ?? 1));
    return { min: Math.min(low, high), max: Math.max(low, high) };
}

// The bottom of the range in rupees, or '' when the text names no amount.
export function payMinimum(text) {
    const pay = parsePay(text);
    return pay ? pay.min : '';
}
