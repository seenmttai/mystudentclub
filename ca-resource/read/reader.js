/**
 * Copyable PDF reader for programme files a student copies from (mail and message templates, the Guidebook,
 * search links…). Text can be selected and copied, links (web, mailto, internal pages) work, search works, and each
 * white copy box gets a one-tap "Copy" button. Opened by the LMS for rows flagged `copy` (scripts/articleship-lms.js).
 */
(function () {
    'use strict';
    const core = window.MSCReaderCore;
    const pdfjs = window.pdfjsLib;
    const $ = id => document.getElementById(id);
    const els = {
        title: $('rd-title'), doc: $('rd-doc'), page: $('rd-page'), total: $('rd-total'),
        state: $('rd-state'), stateText: $('rd-state-text'), stateAction: $('rd-state-action'),
        searchBtn: $('rd-search-btn'), search: $('rd-search'), searchInput: $('rd-search-input'),
        searchCount: $('rd-search-count'), searchPrev: $('rd-search-prev'), searchNext: $('rd-search-next'),
        outlineBtn: $('rd-outline-btn'), outline: $('rd-outline'), outlineList: $('rd-outline-list'), outlineClose: $('rd-outline-close'),
        zoomIn: $('rd-zoom-in'), zoomOut: $('rd-zoom-out'), toast: $('rd-toast')
    };
    const query = core.parseQuery(location.search, location.hash);
    const KEEP_RADIUS = 4;
    const state = {
        pdf: null, total: 0, base: null, zoom: 1, width: 0, email: '',
        pages: [], rendered: new Map(), current: 1, texts: [],
        matches: [], matchIndex: -1, term: '', observer: null, layoutToken: 0
    };

    // ---------- small helpers ----------
    function setState(message, opts) {
        const options = opts || {};
        els.state.hidden = false;
        els.state.classList.toggle('is-error', Boolean(options.error));
        els.stateText.textContent = message;
        els.stateAction.hidden = !options.action;
        if (options.action) {
            els.stateAction.textContent = options.action.label;
            els.stateAction.href = options.action.href;
        }
    }

    let toastTimer = null;
    function toast(message) {
        els.toast.textContent = message;
        els.toast.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => els.toast.classList.remove('is-on'), 2200);
    }

    async function copyText(text) {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch (_) { /* fall back below */ }
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
        area.remove();
        return ok;
    }

    function docWidth() {
        const style = getComputedStyle(els.doc);
        const available = Math.max(240, els.doc.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
        const natural = Math.min(available, 860);
        return Math.round(Math.min(available * Math.max(state.zoom, 1), natural * state.zoom));
    }

    // ---------- loading ----------
    async function fetchPdf(url) {
        const first = core.fetchUrlFor(url);
        try {
            const response = await fetch(first);
            if (response.ok) return await response.arrayBuffer();
            if (response.status === 400 || response.status === 403) throw Object.assign(new Error('expired'), { expired: true });
        } catch (error) {
            if (error && error.expired) throw error;
        }
        if (first === url && /^https:/i.test(url)) {
            const response = await fetch(core.proxyUrlFor(url));
            if (response.ok) return await response.arrayBuffer();
            if (response.status === 400 || response.status === 403) throw Object.assign(new Error('expired'), { expired: true });
        }
        throw new Error('fetch failed');
    }

    async function signedInEmail() {
        try {
            const client = window.getSupabaseClient ? window.getSupabaseClient() : window.supabaseClient;
            if (!client) return { ok: false };
            const { data } = await client.auth.getSession();
            const user = data && data.session && data.session.user;
            return user ? { ok: true, email: user.email || '' } : { ok: false };
        } catch (_) {
            return { ok: false };
        }
    }

    async function start() {
        if (!core || !pdfjs) {
            setState('This reader could not start. Please reload the page.', { error: true });
            return;
        }
        if (!query.pdf) {
            setState('Open this file from your course.', { error: true, action: { label: 'Go to your courses', href: '/learning-management-system/' } });
            return;
        }
        if (!core.isAllowedPdfUrl(query.pdf, location)) {
            setState('This link cannot be opened here.', { error: true, action: { label: 'Go to your courses', href: '/learning-management-system/' } });
            return;
        }
        const session = await signedInEmail();
        if (!session.ok) {
            setState('Log in to read this file.', { error: true, action: { label: 'Log in', href: '/login.html?redirect=' + encodeURIComponent('/learning-management-system/') } });
            return;
        }
        state.email = session.email;
        if (query.title) setTitle(query.title);
        let data;
        try {
            data = await fetchPdf(query.pdf);
        } catch (error) {
            setState(error && error.expired ? 'This link has expired. Open the file again from your course.' : 'The file did not load. Check your connection and open it again from your course.',
                { error: true, action: { label: 'Back to your course', href: '/learning-management-system/' } });
            return;
        }
        try {
            state.pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
        } catch (_) {
            setState('This file could not be opened.', { error: true, action: { label: 'Back to your course', href: '/learning-management-system/' } });
            return;
        }
        state.total = state.pdf.numPages;
        els.total.textContent = String(state.total);
        if (!query.title) {
            try {
                const meta = await state.pdf.getMetadata();
                const docTitle = meta && meta.info && meta.info.Title;
                setTitle(docTitle && !/^untitled/i.test(docTitle) ? docTitle : 'Document');
            } catch (_) { setTitle('Document'); }
        }
        const first = await state.pdf.getPage(1);
        state.base = first.getViewport({ scale: 1 });
        buildPages();
        els.state.hidden = true;
        goToPage(core.clampPage(query.page, state.total), { instant: true });
        buildOutline();
    }

    function setTitle(text) {
        els.title.textContent = text;
        document.title = text + ' | My Student Club';
    }

    // ---------- layout and lazy rendering ----------
    function buildPages() {
        state.width = docWidth();
        const height = Math.round(state.width * (state.base.height / state.base.width));
        els.doc.textContent = '';
        state.pages = [];
        for (let n = 1; n <= state.total; n++) {
            const div = document.createElement('section');
            div.className = 'rd-page';
            div.dataset.page = String(n);
            div.setAttribute('aria-label', 'Page ' + n);
            div.style.width = state.width + 'px';
            div.style.height = height + 'px';
            els.doc.appendChild(div);
            state.pages.push(div);
        }
        if (state.observer) state.observer.disconnect();
        state.observer = new IntersectionObserver(entries => {
            entries.forEach(entry => { if (entry.isIntersecting) renderPage(Number(entry.target.dataset.page)); });
        }, { root: null, rootMargin: '120% 0px' });
        state.pages.forEach(div => state.observer.observe(div));
    }

    function relayout() {
        if (!state.pdf) return;
        const keep = state.current;
        state.layoutToken += 1;
        state.rendered.forEach(entry => entry.cancel && entry.cancel());
        state.rendered.clear();
        buildPages();
        goToPage(keep, { instant: true });
    }

    function evictFarPages(center) {
        state.rendered.forEach((entry, n) => {
            if (Math.abs(n - center) > KEEP_RADIUS && entry.done) {
                const div = state.pages[n - 1];
                if (div) div.textContent = '';
                state.rendered.delete(n);
            }
        });
    }

    async function renderPage(n) {
        if (!state.pdf || state.rendered.has(n) || n < 1 || n > state.total) return;
        const token = state.layoutToken;
        const entry = { done: false, cancelled: false, cancel() { this.cancelled = true; if (this.task) this.task.cancel(); } };
        state.rendered.set(n, entry);
        const div = state.pages[n - 1];
        try {
            const page = await state.pdf.getPage(n);
            if (entry.cancelled || token !== state.layoutToken) return;
            const base = page.getViewport({ scale: 1 });
            const scale = state.width / base.width;
            const viewport = page.getViewport({ scale });
            const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
            div.style.height = Math.round(viewport.height) + 'px';

            const canvas = document.createElement('canvas');
            canvas.width = Math.floor(viewport.width * dpr);
            canvas.height = Math.floor(viewport.height * dpr);
            canvas.style.width = Math.round(viewport.width) + 'px';
            canvas.style.height = Math.round(viewport.height) + 'px';
            const ctx = canvas.getContext('2d', { alpha: false });
            entry.task = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
            await entry.task.promise;
            if (entry.cancelled || token !== state.layoutToken) return;
            if (state.email) drawWatermark(ctx, canvas.width, canvas.height, dpr, state.email);

            const textContent = await page.getTextContent();
            state.texts[n - 1] = textContent.items.map(item => item.str || '');
            const textLayer = document.createElement('div');
            textLayer.className = 'textLayer';
            textLayer.style.setProperty('--scale-factor', String(scale));
            const textDivs = [];
            const textTask = pdfjs.renderTextLayer({ textContentSource: textContent, container: textLayer, viewport, textDivs });
            await textTask.promise;
            const end = document.createElement('div');
            end.className = 'endOfContent';
            textLayer.appendChild(end);
            bindSelecting(textLayer);

            const links = document.createElement('div');
            links.className = 'rd-links';
            await addLinks(page, viewport, links);

            if (entry.cancelled || token !== state.layoutToken) return;
            div.textContent = '';
            div.appendChild(canvas);
            div.appendChild(textLayer);
            div.appendChild(links);
            entry.textDivs = textDivs;
            entry.done = true;
            paintHits(n);
            addCopyButtons(page, viewport, textContent, div).catch(() => {});
            evictFarPages(state.current);
        } catch (error) {
            if (!entry.cancelled && error && error.name !== 'RenderingCancelledException') {
                state.rendered.delete(n);
                if (window.console) console.error('Page ' + n + ' failed', error);
            }
        }
    }

    function bindSelecting(layer) {
        layer.addEventListener('mousedown', () => layer.classList.add('selecting'));
        document.addEventListener('mouseup', () => layer.classList.remove('selecting'));
    }

    function drawWatermark(ctx, width, height, scale, email) {
        ctx.save();
        ctx.font = '600 ' + Math.round(13 * scale) + 'px Inter, sans-serif';
        ctx.fillStyle = 'rgba(100, 116, 139, 0.10)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.rotate(-30 * Math.PI / 180);
        for (let x = -width; x < width * 2; x += 260 * scale) {
            for (let y = -height; y < height * 2; y += 190 * scale) ctx.fillText(email, x, y);
        }
        ctx.restore();
    }

    async function addLinks(page, viewport, layer) {
        let annotations = [];
        try { annotations = await page.getAnnotations({ intent: 'display' }); } catch (_) { return; }
        annotations.forEach(annotation => {
            if (annotation.subtype !== 'Link') return;
            const rect = viewport.convertToViewportRectangle(annotation.rect);
            const a = document.createElement('a');
            a.style.left = Math.min(rect[0], rect[2]) + 'px';
            a.style.top = Math.min(rect[1], rect[3]) + 'px';
            a.style.width = Math.abs(rect[2] - rect[0]) + 'px';
            a.style.height = Math.abs(rect[3] - rect[1]) + 'px';
            const url = annotation.url || annotation.unsafeUrl;
            if (url && core.isSafeLink(url)) {
                // MSC's own links (course deep links, tools) stay on the site the reader is on; in the app they open in
                // place, on the desktop site in a new tab as before.
                const own = core.siteLink(url, window.location);
                a.href = own || url;
                const inPlace = own && core.opensInPlace(window.location, window);
                if (/^https?:/i.test(url) && !inPlace) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
                a.title = /^mailto:/i.test(url) ? 'Open in your mail app' : url;
            } else if (annotation.dest) {
                a.href = '#';
                a.title = 'Go to page';
                a.addEventListener('click', event => { event.preventDefault(); goToDest(annotation.dest); });
            } else {
                return;
            }
            layer.appendChild(a);
        });
    }

    /** The page's text lines in page pixels (a little taller than the glyphs), for placing Copy buttons. */
    function textRects(items, viewport) {
        return (items || []).filter(item => item && item.str && item.str.trim() && item.transform).map(item => {
            const h = Math.abs(item.height || item.transform[3] || 10);
            const x = item.transform[4];
            const y = item.transform[5];
            const r = viewport.convertToViewportRectangle([x, y - h * 0.25, x + (item.width || 0), y + h * 0.95]);
            return { left: Math.min(r[0], r[2]), right: Math.max(r[0], r[2]), top: Math.min(r[1], r[3]), bottom: Math.max(r[1], r[3]) };
        });
    }

    async function addCopyButtons(page, viewport, textContent, div) {
        const opList = await page.getOperatorList();
        const boxes = core.copyBoxes(opList, pdfjs.OPS);
        let texts = null;
        boxes.forEach(box => {
            const text = core.textInBox(textContent.items, box);
            // A CV sample or template (its contact line at the top) is there to look at, not to paste.
            if (!text || core.isCvSample(text)) return;
            texts = texts || textRects(textContent.items, viewport);
            const rect = viewport.convertToViewportRectangle(box);
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'rd-copy';
            button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg><span>Copy</span>';
            button.setAttribute('aria-label', 'Copy this box');
            // On the box's top border at its right end (half above the box, half on its padding), so it covers none
            // of the box's lines; core.copyButtonSpot moves it (or makes it icon-only) where text would be under it.
            button.style.visibility = 'hidden';
            div.appendChild(button);
            const full = { width: button.offsetWidth || 24, height: button.offsetHeight || 24 };
            button.classList.add('is-compact');
            const compact = { width: button.offsetWidth || full.height, height: button.offsetHeight || full.height };
            const spot = core.copyButtonSpot(
                { left: Math.min(rect[0], rect[2]), right: Math.max(rect[0], rect[2]), top: Math.min(rect[1], rect[3]), bottom: Math.max(rect[1], rect[3]) },
                texts, [full, compact], { width: viewport.width, height: viewport.height });
            if (spot.size === 0) button.classList.remove('is-compact');
            button.style.left = spot.left + 'px';
            button.style.top = spot.top + 'px';
            button.style.visibility = '';
            button.addEventListener('click', async () => {
                const ok = await copyText(text);
                if (ok) {
                    button.classList.add('is-done');
                    button.querySelector('span').textContent = 'Copied';
                    toast(/\[[^\]]+\]/.test(text) ? 'Copied. Fill in the [brackets] before you send.' : 'Copied');
                    setTimeout(() => { button.classList.remove('is-done'); button.querySelector('span').textContent = 'Copy'; }, 2200);
                } else {
                    toast('Select the text and copy it instead');
                }
            });
        });
    }

    // ---------- navigation ----------
    function goToPage(n, opts) {
        const page = core.clampPage(n, state.total);
        const div = state.pages[page - 1];
        if (!div) return;
        // Clear the fixed bar (and the search bar, which sits under it on a phone).
        const headerSpace = 56 + 10 + (!els.search.hidden && window.innerWidth < 768 ? 56 : 0);
        window.scrollTo({ top: Math.max(0, div.offsetTop - headerSpace), behavior: opts && opts.instant ? 'auto' : 'smooth' });
        setCurrent(page);
        renderPage(page);
    }

    async function goToDest(dest) {
        try {
            const explicit = typeof dest === 'string' ? await state.pdf.getDestination(dest) : dest;
            if (!explicit || !explicit[0]) return;
            const index = typeof explicit[0] === 'object' ? await state.pdf.getPageIndex(explicit[0]) : Number(explicit[0]);
            if (Number.isInteger(index)) goToPage(index + 1);
        } catch (_) { /* a broken internal link does nothing */ }
    }

    function setCurrent(n) {
        if (state.current === n && els.page.value === String(n)) return;
        state.current = n;
        if (document.activeElement !== els.page) els.page.value = String(n);
    }

    let scrollFrame = null;
    window.addEventListener('scroll', () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => {
            scrollFrame = null;
            const middle = window.innerHeight / 2;
            for (let i = 0; i < state.pages.length; i++) {
                const rect = state.pages[i].getBoundingClientRect();
                if (rect.bottom >= middle) { setCurrent(i + 1); break; }
            }
            evictFarPages(state.current);
        });
    }, { passive: true });

    els.page.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); goToPage(els.page.value); els.page.blur(); }
    });
    els.page.addEventListener('blur', () => { els.page.value = String(state.current); });
    els.page.addEventListener('focus', () => els.page.select());

    // ---------- zoom ----------
    function setZoom(next) {
        state.zoom = Math.max(0.6, Math.min(2.4, Math.round(next * 10) / 10));
        relayout();
    }
    els.zoomIn.addEventListener('click', () => setZoom(state.zoom + 0.2));
    els.zoomOut.addEventListener('click', () => setZoom(state.zoom - 0.2));
    let resizeTimer = null;
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        if (window.innerWidth === lastWidth) return; // phone address bar show/hide only changes the height
        lastWidth = window.innerWidth;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(relayout, 200);
    });

    // ---------- search ----------
    function openSearch(open) {
        els.search.hidden = !open;
        els.searchBtn.setAttribute('aria-expanded', String(open));
        if (open) els.searchInput.focus();
        else { clearHits(); state.matches = []; state.matchIndex = -1; state.term = ''; els.searchCount.textContent = ''; }
    }
    els.searchBtn.addEventListener('click', () => openSearch(els.search.hidden));

    async function allTexts() {
        for (let n = 1; n <= state.total; n++) {
            if (state.texts[n - 1]) continue;
            const page = await state.pdf.getPage(n);
            const content = await page.getTextContent();
            state.texts[n - 1] = content.items.map(item => item.str || '');
        }
        return state.texts;
    }

    function clearHits() {
        document.querySelectorAll('.textLayer .rd-hit').forEach(node => node.classList.remove('rd-hit', 'is-current'));
        document.querySelectorAll('.textLayer .rd-hit-part').forEach(part => {
            const parent = part.parentNode;
            parent.replaceChild(document.createTextNode(part.textContent), part);
            parent.normalize();
        });
    }

    /** Wrap [start, end) of a text div's text in a highlight; false when the div has no text node to wrap. */
    function wrapPart(node, start, end, current) {
        const textNode = [...node.childNodes].find(child => child.nodeType === 3);
        if (!textNode) return false;
        const from = Math.max(0, Math.min(start, textNode.data.length));
        const to = Math.max(from, Math.min(end, textNode.data.length));
        if (to === from) return true;
        const range = document.createRange();
        range.setStart(textNode, from);
        range.setEnd(textNode, to);
        const part = document.createElement('span');
        part.className = 'rd-hit-part' + (current ? ' is-current' : '');
        range.surroundContents(part);
        return true;
    }

    /**
     * Mark just the searched words: in the first item from where the match starts, in the last item up to where it
     * stops, and the items in between whole. Each text div's stretches are wrapped from its end back, so the offsets of
     * the earlier ones stay valid; a div with no text node gets the whole-item mark.
     */
    function paintHits(n) {
        const entry = state.rendered.get(n);
        if (!entry || !entry.textDivs || !state.matches.length) return;
        const parts = new Map();
        state.matches.forEach((match, index) => {
            if (match.page !== n) return;
            const current = index === state.matchIndex;
            for (let i = match.item; i <= match.last; i++) {
                if (!entry.textDivs[i]) continue;
                const start = i === match.item && Number.isFinite(match.start) ? match.start : 0;
                const end = i === match.last && Number.isFinite(match.end) ? match.end : Infinity;
                if (!parts.has(i)) parts.set(i, []);
                parts.get(i).push({ start, end, current });
            }
        });
        parts.forEach((list, i) => {
            const node = entry.textDivs[i];
            list.sort((a, b) => b.start - a.start).forEach(part => {
                if (wrapPart(node, part.start, part.end, part.current)) return;
                node.classList.add('rd-hit');
                node.classList.toggle('is-current', part.current);
            });
        });
    }

    async function runSearch(direction) {
        const term = els.searchInput.value.trim();
        if (!state.pdf) return;
        if (term !== state.term) {
            state.term = term;
            clearHits();
            els.searchCount.textContent = term.length < 2 ? '' : '…';
            if (term.length < 2) { state.matches = []; els.searchPrev.disabled = true; return; }
            state.matches = core.findMatches(await allTexts(), term);
            state.matchIndex = -1;
        }
        if (!state.matches.length) {
            els.searchCount.textContent = 'No match';
            els.searchPrev.disabled = true;
            return;
        }
        const count = state.matches.length;
        state.matchIndex = state.matchIndex < 0 ? 0 : (state.matchIndex + direction + count) % count;
        els.searchCount.textContent = (state.matchIndex + 1) + ' of ' + count;
        els.searchPrev.disabled = count < 2;
        clearHits();
        const match = state.matches[state.matchIndex];
        goToPage(match.page);
        state.rendered.forEach((_, n) => paintHits(n));
        const entry = state.rendered.get(match.page);
        const node = entry && entry.textDivs && entry.textDivs[match.item];
        if (node && node.scrollIntoView) node.scrollIntoView({ block: 'center' });
        else setTimeout(() => {
            const later = state.rendered.get(match.page);
            const target = later && later.textDivs && later.textDivs[match.item];
            if (target && target.scrollIntoView) target.scrollIntoView({ block: 'center' });
        }, 600);
    }

    els.search.addEventListener('submit', event => { event.preventDefault(); runSearch(1); });
    els.searchPrev.addEventListener('click', () => runSearch(-1));
    els.searchInput.addEventListener('keydown', event => { if (event.key === 'Escape') openSearch(false); });
    document.addEventListener('keydown', event => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f' && state.pdf) {
            event.preventDefault();
            openSearch(true);
        }
    });

    // ---------- contents (the PDF's bookmarks) ----------
    async function buildOutline() {
        let outline = null;
        try { outline = await state.pdf.getOutline(); } catch (_) { outline = null; }
        if (!outline || !outline.length) return;
        const list = items => {
            const ul = document.createElement('ul');
            items.forEach(item => {
                const li = document.createElement('li');
                const a = document.createElement('a');
                a.href = '#';
                a.textContent = item.title;
                a.addEventListener('click', event => {
                    event.preventDefault();
                    if (item.dest) goToDest(item.dest);
                    else if (item.url && core.isSafeLink(item.url)) window.open(item.url, '_blank', 'noopener');
                    if (window.innerWidth < 1100) toggleOutline(false);
                });
                li.appendChild(a);
                if (item.items && item.items.length) li.appendChild(list(item.items));
                ul.appendChild(li);
            });
            return ul;
        };
        els.outlineList.appendChild(list(outline));
        els.outlineBtn.hidden = false;
    }
    function toggleOutline(open) {
        els.outline.hidden = !open;
        document.body.classList.toggle('rd-outline-open', open);
        els.outlineBtn.setAttribute('aria-expanded', String(open));
    }
    els.outlineBtn.addEventListener('click', () => { toggleOutline(els.outline.hidden); if (window.innerWidth >= 1100) relayout(); });
    els.outlineClose.addEventListener('click', () => { toggleOutline(false); if (window.innerWidth >= 1100) relayout(); });

    start();
})();
