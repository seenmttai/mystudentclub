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

    /**
     * The text of one copy box, ready to paste into a mail: lines that only wrap are joined, paragraphs are separated
     * by a blank line, short lines and lines ending in punctuation (sign-offs, addresses) keep their break.
     * items: pdf.js text items ({ str, transform, width, height }); box: [x1, y1, x2, y2] in PDF space.
     */
    function textInBox(items, box) {
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
        if (!inside.length) return '';
        const lines = [];
        inside.forEach(item => {
            const line = lines[lines.length - 1];
            if (line && Math.abs(line.y - item.y) <= Math.min(line.h, item.h) * 0.5) {
                const gap = item.x - line.right;
                const needsSpace = gap > item.h * 0.15 && !/\s$/.test(line.text) && !/^\s/.test(item.str);
                line.text += (needsSpace ? ' ' : '') + item.str;
                line.right = Math.max(line.right, item.x + item.w);
            } else {
                lines.push({ text: item.str, y: item.y, h: item.h, left: item.x, right: item.x + item.w });
            }
        });
        lines.forEach(line => { line.text = line.text.replace(/\s+/g, ' ').trim(); });
        const pitches = [];
        for (let i = 1; i < lines.length; i++) pitches.push(lines[i - 1].y - lines[i].y);
        const pitch = pitches.length ? Math.min(...pitches.filter(p => p > 0).concat([Infinity])) : 0;
        const width = box[2] - box[0];
        let out = '';
        lines.forEach((line, i) => {
            if (i === 0) { out = line.text; return; }
            const prev = lines[i - 1];
            const gap = prev.y - line.y;
            const paragraph = pitch && gap > pitch * 1.35;
            const prevIsWrap = (prev.right - box[0]) > width * 0.62 && !/[.,:;!?)]$/.test(prev.text) && !/^\[[^\]]*\]$/.test(prev.text);
            if (paragraph) out += '\n\n' + line.text;
            else if (prevIsWrap) out += ' ' + line.text;
            else out += '\n' + line.text;
        });
        return out.trim();
    }

    return Object.freeze({
        PROXY, clampPage, parseQuery, isLocalHost, isAllowedPdfUrl, fetchUrlFor, proxyUrlFor, isSafeLink, siteLink, opensInPlace,
        normaliseSearch, searchPattern, findMatches, rawIndex, copyBoxes, textInBox, _multiply: multiply
    });
});
