/**
 * Copyable PDF reader (/ca-resource/read/): the pure parts, shared by the page and its node tests.
 * Browser: window.MSCReaderCore. Node: require('./ca-resource/read/reader-core.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCReaderCore = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict';

    const PROXY = 'https://pdf-proxy-viewer.bhansalimanan55.workers.dev/?url=';
    const PDF_HOSTS = ['auth.mystudentclub.com', 'izsggdtdiacxdsjjncdq.supabase.co', 'pdf-proxy-viewer.bhansalimanan55.workers.dev'];
    const MM = 72 / 25.4;

    function clampPage(value, total) {
        const page = Number.parseInt(value, 10);
        const max = Number.isSafeInteger(total) && total > 0 ? total : 100000;
        if (!Number.isSafeInteger(page) || page < 1) return 1;
        return Math.min(page, max);
    }

    /** ?pdf=<signed url>&page=N&title=… (#page=N also works). */
    function parseQuery(search, hash) {
        const params = new URLSearchParams(search || '');
        const hashPage = /(?:^#|&)page=(\d{1,6})/.exec(hash || '');
        return {
            pdf: params.get('pdf') || '',
            page: clampPage(params.get('page') || (hashPage && hashPage[1]) || 1),
            title: (params.get('title') || '').replace(/\s+/g, ' ').trim().slice(0, 120)
        };
    }

    function isLocalHost(hostname) {
        const host = String(hostname || '').toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
    }

    /** Only MSC storage (signed links), its PDF proxy, or this site may be read; never javascript:, data: or other hosts. */
    function isAllowedPdfUrl(url, loc) {
        if (!url) return false;
        let parsed;
        try { parsed = new URL(url, loc && loc.href ? loc.href : 'https://www.mystudentclub.com/'); } catch (_) { return false; }
        const sameOrigin = loc && loc.origin && parsed.origin === loc.origin;
        if (sameOrigin) return parsed.protocol === 'https:' || isLocalHost(parsed.hostname);
        if (parsed.protocol !== 'https:') return false;
        if (!PDF_HOSTS.includes(parsed.hostname)) return false;
        if (parsed.hostname === 'pdf-proxy-viewer.bhansalimanan55.workers.dev') return isAllowedPdfUrl(parsed.searchParams.get('url'), null);
        return parsed.pathname.startsWith('/storage/v1/object/');
    }

    /** Supabase project URLs go through the PDF proxy (range/CORS); the rest are fetched directly. */
    function fetchUrlFor(url) {
        if (!url) return url;
        if (url.indexOf('pdf-proxy-viewer.') !== -1) return url;
        if (url.indexOf('.supabase.co/') !== -1) return PROXY + encodeURIComponent(url);
        return url;
    }

    function proxyUrlFor(url) {
        return url.indexOf('pdf-proxy-viewer.') !== -1 ? url : PROXY + encodeURIComponent(url);
    }

    /** Links inside a PDF the reader will follow. */
    function isSafeLink(url) {
        return /^(https?:|mailto:|tel:)/i.test(String(url || '').trim());
    }

    const SITE_HOSTS = ['www.mystudentclub.com', 'mystudentclub.com', 'mobile.mystudentclub.com'];

    /**
     * A link to MSC's own site (a course deep link, a tool) as a path on the site the reader is on, so the app's mobile
     * site keeps the student inside it; null for any other link.
     */
    function siteLink(url, loc) {
        let parsed;
        try { parsed = new URL(String(url || '').trim()); } catch (_) { return null; }
        if (parsed.protocol !== 'https:' || !SITE_HOSTS.includes(parsed.hostname)) return null;
        if (loc && loc.hostname && !SITE_HOSTS.includes(String(loc.hostname).toLowerCase()) && !isLocalHost(loc.hostname)) return null;
        return parsed.pathname + parsed.search + parsed.hash;
    }

    /** On the mobile site (the app's WebView) a link opens in place: there is no second tab to go to. */
    function opensInPlace(loc, win) {
        return /^mobile\./i.test(String(loc && loc.hostname || '')) || Boolean(win && win.flutter_inappwebview);
    }

    function normaliseSearch(value) {
        return String(value || '')
            .replace(/[‘’‚′]/g, "'")
            .replace(/[“”„″]/g, '"')
            .replace(/[–—]/g, '-')
            .replace(/ /g, ' ')
            .replace(/\s+/g, ' ')
            .toLowerCase();
    }

    /** The index in raw item text reached after `n` characters of its normalised form (a whitespace run counts as one). */
    function rawIndex(raw, n) {
        const text = String(raw || '');
        let i = 0;
        let norm = 0;
        while (i < text.length && norm < n) {
            if (/\s/.test(text[i])) { while (i < text.length && /\s/.test(text[i])) i += 1; }
            else i += 1;
            norm += 1;
        }
        return i;
    }

    /**
     * pages: array (one per page) of arrays of text-item strings. Returns every match as { page (1-based), item, last,
     * start, end }: found inside one item, or across neighbouring items of the same page (item = the first, last = the
     * last); start is where it begins in the first item's text and end where it stops in the last item's text, so the
     * reader can mark just the searched words.
     */
    function findMatches(pages, term) {
        const needle = normaliseSearch(term).trim();
        const results = [];
        if (needle.length < 2) return results;
        (pages || []).forEach((items, pageIndex) => {
            const strings = (items || []).map(normaliseSearch);
            const starts = [];
            let joined = '';
            strings.forEach(str => { starts.push(joined.length); joined += str; });
            let from = 0;
            while (from <= joined.length) {
                const at = joined.indexOf(needle, from);
                if (at === -1) break;
                let item = 0;
                while (item + 1 < starts.length && starts[item + 1] <= at) item += 1;
                let last = item;
                while (last + 1 < starts.length && starts[last + 1] < at + needle.length) last += 1;
                results.push({ page: pageIndex + 1, item, last,
                    start: rawIndex(items[item], at - starts[item]), end: rawIndex(items[last], at + needle.length - starts[last]) });
                from = at + needle.length;
            }
        });
        return results;
    }

    /** A case-insensitive pattern for the raw text layer: any whitespace run, straight or curly quotes, any dash. */
    function searchPattern(term) {
        const needle = normaliseSearch(term).trim();
        if (needle.length < 2) return null;
        const source = needle.split('').map(ch => {
            if (ch === ' ') return '\\s+';
            if (ch === "'") return "['\u2018\u2019\u201A\u2032]";
            if (ch === '"') return '["\u201C\u201D\u201E\u2033]';
            if (ch === '-') return '[-\u2013\u2014]';
            return ch.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
        }).join('');
        return new RegExp(source, 'i');
    }

    // ---------- Copy boxes: the white boxes a template asks you to copy ----------

    function multiply(m, n) {
        return [
            m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
            m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
            m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]
        ];
    }

    function apply(m, x, y) {
        return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    }

    /** pdf.js 3.x hands fill colours over as a Uint8ClampedArray [r, g, b] (0-255); older builds as '#rrggbb'. */
    function isWhite(color) {
        if (typeof color === 'string') return /^#?f{6}$/i.test(color.trim());
        if (color && typeof color.length === 'number') {
            const list = Array.from(color);
            if (list.length === 1) return isWhite(list[0]);
            if (list.length >= 3 && list.slice(0, 3).every(c => typeof c === 'number')) {
                const max = list.some(c => c > 1) ? 255 : 1;
                return list.slice(0, 3).every(c => c >= max * 0.995);
            }
        }
        return false;
    }

    function pathBounds(pathOps, coords, OPS) {
        let i = 0;
        const xs = [];
        const ys = [];
        const take = n => { const out = coords.slice(i, i + n); i += n; return out; };
        for (const op of pathOps) {
            if (op === OPS.rectangle) {
                const [x, y, w, h] = take(4);
                xs.push(x, x + w); ys.push(y, y + h);
            } else if (op === OPS.moveTo || op === OPS.lineTo) {
                const [x, y] = take(2); xs.push(x); ys.push(y);
            } else if (op === OPS.curveTo) {
                const c = take(6); xs.push(c[0], c[2], c[4]); ys.push(c[1], c[3], c[5]);
            } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
                const c = take(4); xs.push(c[0], c[2]); ys.push(c[1], c[3]);
            }
        }
        if (!xs.length) return null;
        return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    }

    /**
     * Walk a pdf.js 3.x operator list ({ fnArray, argsArray }) and return opaque white filled shapes at least
     * `minWidthMm` wide and 20 pt high, as [x1, y1, x2, y2] in PDF user space (y up). These are the copy boxes.
     */
    function copyBoxes(operatorList, OPS, options) {
        const opts = options || {};
        const minWidth = (opts.minWidthMm || 100) * MM;
        const minHeight = opts.minHeight || 20;
        const fns = operatorList.fnArray || [];
        const args = operatorList.argsArray || [];
        let state = { ctm: [1, 0, 0, 1, 0, 0], fill: null, alpha: 1 };
        const stack = [];
        let pending = null;
        const boxes = [];
        const fillOps = new Set([OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke].filter(v => v !== undefined));
        for (let k = 0; k < fns.length; k++) {
            const fn = fns[k];
            const a = args[k];
            if (fn === OPS.save) stack.push(Object.assign({}, state, { ctm: state.ctm.slice() }));
            else if (fn === OPS.restore) state = stack.pop() || state;
            else if (fn === OPS.transform) state.ctm = multiply(state.ctm, a);
            else if (fn === OPS.paintFormXObjectBegin) {
                stack.push(Object.assign({}, state, { ctm: state.ctm.slice() }));
                if (a && a[0] && a[0].length === 6) state.ctm = multiply(state.ctm, a[0]);
            } else if (fn === OPS.paintFormXObjectEnd) state = stack.pop() || state;
            else if (fn === OPS.setFillRGBColor || fn === OPS.setFillGray || fn === OPS.setFillColor || fn === OPS.setFillColorN) {
                state.fill = a;
            } else if (fn === OPS.setGState) {
                (a && a[0] || []).forEach(entry => { if (Array.isArray(entry) && entry[0] === 'ca') state.alpha = Number(entry[1]); });
            } else if (fn === OPS.constructPath) {
                pending = pathBounds(a[0] || [], a[1] || [], OPS);
            } else if (fillOps.has(fn)) {
                if (pending && isWhite(state.fill) && state.alpha > 0.99) {
                    const p1 = apply(state.ctm, pending[0], pending[1]);
                    const p2 = apply(state.ctm, pending[2], pending[3]);
                    const box = [Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1]), Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])];
                    if (box[2] - box[0] >= minWidth && box[3] - box[1] >= minHeight &&
                        !boxes.some(b => box[0] >= b[0] - 1 && box[1] >= b[1] - 1 && box[2] <= b[2] + 1 && box[3] <= b[3] + 1)) {
                        boxes.push(box);
                    }
                }
                pending = null;
            } else if (fn === OPS.endPath) {
                pending = null;
            }
        }
        return boxes;
    }

    // A short line that closes or addresses a mail ("Thanking you,", "Regards,", "To,"): the lines under it in the same
    // paragraph are a name, a firm and an address, each on its own line.
    const SIGN_OFF = /^(?:to|thanking you|thank you|thanks|regards|warm regards|best regards|kind regards|with regards|yours (?:sincerely|faithfully|truly)|sincerely)\s*,$/i;
    // A line that starts a list item ("1. ", "2) ", "• ", "- ") or a field ("Tone: ", "Tally Prime (working knowledge): ").
    const LIST_ITEM = /^(?:\d{1,2}[.)]\s|[•▪◦*\-–—]\s)/;
    const FIELD = /^[A-Z][^.:!?\[\]]{0,40}:\s/;

    function boxLines(items, box) {
        const inside = (items || []).filter(item => item && typeof item.str === 'string' && item.str !== '' && item.transform)
            .map(item => {
                const height = Math.abs(item.height || item.transform[3] || 10);
                return { str: item.str, x: item.transform[4], y: item.transform[5], w: item.width || 0, h: height };
            })
            .filter(item => {
                const cx = item.x + item.w / 2;
                const cy = item.y + item.h / 3;
                return cx >= box[0] && cx <= box[2] && cy >= box[1] && cy <= box[3];
            })
            .sort((a, b) => (Math.abs(b.y - a.y) > Math.min(a.h, b.h) * 0.5 ? b.y - a.y : a.x - b.x));
        const lines = [];
        inside.forEach(item => {
            const line = lines[lines.length - 1];
            if (line && Math.abs(line.y - item.y) <= Math.min(line.h, item.h) * 0.5) {
                const gap = item.x - line.right;
                const needsSpace = gap > item.h * 0.15 && !/\s$/.test(line.text) && !/^\s/.test(item.str);
                line.text += (needsSpace ? ' ' : '') + item.str;
                line.right = Math.max(line.right, item.x + item.w);
                line.items.push(item);
            } else {
                lines.push({ text: item.str, y: item.y, h: item.h, left: item.x, right: item.x + item.w, items: [item] });
            }
        });
        lines.forEach(line => { line.text = line.text.replace(/\s+/g, ' ').trim(); });
        return lines.filter(line => line.text);
    }

    /**
     * Width of the first word of a line. pdf.js gives one width per text item, and a word can span items (a ligature
     * such as "fi" is an item of its own: "fi" + "rst in your city"), so the items are added up to the first space.
     */
    function firstWordWidth(line) {
        let width = 0;
        let started = false;
        for (const item of line.items || []) {
            const str = item.str || '';
            const lead = started ? 0 : str.length - str.replace(/^\s+/, '').length;
            const rest = str.slice(lead);
            const space = rest.search(/\s/);
            const share = len => (str.length ? (item.w || 0) * (len / str.length) : 0);
            if (!rest.length) { if (started) break; continue; }
            started = true;
            if (space >= 0) return width + share(space);
            width += share(rest.length);
        }
        return width;
    }

    /**
     * The text of one copy box, ready to paste into a mail or a message: paragraphs are separated by a blank line;
     * inside a paragraph, lines are joined with a space (the PDF breaks lines for its page width or for looks, not for
     * the mail). A break stays after a greeting or a sign-off ("Respected Sir/Ma'am,", "Thanking you,"), in the name
     * and address lines under a sign-off or "To,", before a list item ("1. "), between fields ("Tone: "), after a line
     * ending in ":", after a short heading with no full stop ("What to do now"), and between the lines of a box that
     * has one item per line; a line that only wrapped (its next word would not have fitted) is always joined.
     * items: pdf.js text items ({ str, transform, width, height }); box: [x1, y1, x2, y2] in PDF space.
     */
    function textInBox(items, box) {
        const lines = boxLines(items, box);
        if (!lines.length) return '';
        const gaps = [];
        for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
        const positive = gaps.filter(g => g > 0);
        const pitch = positive.length ? Math.min(...positive) : 0;
        // The text column's right edge: the box's right side less the same inset the text has on the left.
        const inset = Math.max(0, Math.min(...lines.map(l => l.left)) - box[0]);
        const columnRight = box[2] - inset;
        const words = text => text.split(' ').filter(Boolean).length;
        // Field lines ("Tone: …", "Languages: …") keep their breaks only in a box that is a list of fields (two or more).
        const fieldBox = lines.filter(line => FIELD.test(line.text)).length >= 2;
        // No two lines of the box sit closer than 1.8x their font size: each line is its own paragraph or item (a
        // list with no wrapped line), so its breaks stay, and only a line that wrapped is joined.
        const sizes = lines.map(line => line.h).sort((a, b) => a - b);
        const loose = pitch > sizes[Math.floor(sizes.length / 2)] * 1.8;
        let out = '';
        let block = false; // inside the name/address lines under a sign-off or "To,"
        lines.forEach((line, i) => {
            if (i === 0) { out = line.text; block = SIGN_OFF.test(line.text); return; }
            const prev = lines[i - 1];
            const gap = prev.y - line.y;
            // Paragraphs are spaced at least 1.2x the line pitch in these PDFs (1.26x to 2x); lines inside one at 1x.
            if (pitch && gap > pitch * 1.18) {
                out += '\n\n' + line.text;
                block = SIGN_OFF.test(line.text);
                return;
            }
            const space = prev.h * 0.28;
            const wrapped = prev.right + space + firstWordWidth(line) > columnRight - 1;
            const startsLower = /^[a-z]/.test(line.text);
            // "Thanking you," / "Respected Sir/Ma'am," then a new line; "Respected Sir/Ma'am, you spoke…" reads on.
            const shortCommaLine = /,$/.test(prev.text) && words(prev.text) <= 4 && !startsLower;
            const heading = !/[.,;:!?)\]"”’]$/.test(prev.text) && words(prev.text) <= 5 && /^[A-Z[“"]/.test(line.text);
            const sentenceEnd = /[.?!:;]$/.test(prev.text);
            let keep;
            if (block || shortCommaLine) keep = true;
            else if (LIST_ITEM.test(line.text) && sentenceEnd) keep = true; // "…confirm:" / "…report to." then "3. …"
            else if (/:$/.test(prev.text) && /^[A-Z0-9]/.test(line.text)) keep = true; // "| [Month Year]:" then "Mapped…"
            else if (loose && /[.?!]$/.test(prev.text) && !startsLower) keep = true; // one item per line
            else if (wrapped) keep = false;
            else keep = loose || LIST_ITEM.test(line.text) || LIST_ITEM.test(prev.text) || (fieldBox && FIELD.test(line.text)) ||
                /:$/.test(prev.text) || heading;
            out += (keep ? '\n' : ' ') + line.text;
            if (SIGN_OFF.test(line.text)) block = true;
        });
        return out.trim();
    }

    const CONTACT = /(?:\+91[\s-]?)?\b[6-9][0-9X]{9}\b|[\w.-]+@[\w-]+\.[a-z]{2,}|linkedin\.com\/in\//i;
    const CV_HEADING = /^(?:career objective|objective|profile|summary|education|educational qualifications?|certifications?(?: and job simulations)?|job simulations|skills|key skills|projects?|experience|work experience|achievements|positions? of responsibility|extra-?curricular activities)$/i;

    /**
     * A copy box shows a CV (a sample or a template): its contact line (a mobile number, an email or a LinkedIn URL)
     * comes in its first few lines, or it has a contact line and two CV section headings ("EDUCATION", "SKILLS").
     * Such a box gets no Copy button. A letter's contact line is at its end, under no section heading.
     */
    function isCvSample(text) {
        const all = String(text || '');
        if (CONTACT.test(all.slice(0, 200))) return true;
        if (!CONTACT.test(all)) return false;
        const headings = new Set(all.split('\n').map(line => line.trim().toLowerCase()).filter(line => CV_HEADING.test(line)));
        return headings.size >= 2;
    }

    function overlaps(a, b, pad) {
        return a.left < b.right + pad && a.right > b.left - pad && a.top < b.bottom + pad && a.bottom > b.top - pad;
    }

    /**
     * Where a box's Copy button goes, in page pixels. First choice: on the box's top border at its right end, half
     * above the box and half on its padding, so it covers none of the box's lines. When text would be under it (a
     * tight box, a table row, a line that runs to the right edge, a label just above the box), the next spot that
     * covers no text: inside the top-right corner, a little higher, on the bottom border, inside the bottom-right
     * corner, then in the page margin beside the box; then the same with the compact (icon-only) button.
     * box: { left, top, right, bottom }; texts: [{ left, top, right, bottom }] of the page's text; sizes: the button's
     * { width, height }, full first, then compact; page: { width, height }.
     * Returns { left, top, size } (size: the index into sizes), or the top-border spot if nothing is clear.
     */
    function copyButtonSpot(box, texts, sizes, page) {
        const list = (Array.isArray(sizes) ? sizes : [sizes]).filter(Boolean);
        const inset = Math.min(8, Math.max(2, (box.right - box.left) * 0.02));
        const pageW = page && page.width || Infinity;
        const pageH = page && page.height || Infinity;
        const clear = (left, top, size) => left >= 0 && top >= 0 && left + size.width <= pageW && top + size.height <= pageH &&
            !(texts || []).some(t => overlaps({ left, top, right: left + size.width, bottom: top + size.height }, t, 1));
        for (let k = 0; k < list.length; k++) {
            const size = list[k];
            const left = Math.max(box.left, box.right - inset - size.width);
            const tops = [box.top - size.height / 2, box.top + 2];
            for (let top = box.top - size.height / 2 - 1; top >= box.top - size.height - 2; top -= 1) tops.push(top);
            tops.push(box.bottom - size.height / 2, box.bottom - size.height - 2);
            for (const top of tops) if (clear(left, top, size)) return { left, top, size: k };
            // Beside the box, in the page margin, level with its top (or lower, down to its bottom; a box lower than
            // the button gets it level with its middle).
            const beside = box.right + 4;
            const first = Math.min(box.top, (box.top + box.bottom - size.height) / 2);
            for (let top = first; top <= Math.max(first, box.bottom - size.height); top += 2) {
                if (clear(beside, top, size)) return { left: beside, top, size: k };
            }
        }
        const size = list[0] || { width: 0, height: 0 };
        return { left: Math.max(box.left, box.right - inset - size.width), top: Math.max(0, box.top - size.height / 2), size: 0 };
    }

    return Object.freeze({
        PROXY, clampPage, parseQuery, isLocalHost, isAllowedPdfUrl, fetchUrlFor, proxyUrlFor, isSafeLink, siteLink, opensInPlace,
        normaliseSearch, searchPattern, findMatches, rawIndex, copyBoxes, textInBox, isCvSample, copyButtonSpot, _multiply: multiply
    });
});
