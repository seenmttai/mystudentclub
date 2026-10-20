/**
 * MSC Articleship Program: the LinkedIn profile checklist (row 3.1), /articleship-program/linkedin-checklist/.
 * Twelve profile checks on the shared checklist engine, each with a good example and a link that opens the student's
 * own LinkedIn profile (or the exact LinkedIn page for that check). Ticks save through the progress engine.
 *
 * This file adds the page around the engine: the content load, the "Open my profile" card, a default "Open my profile"
 * link on every check, examples drawn line by line ("> " lines = sample text in a white box; "How:"-style lead-ins in
 * bold), white Copy boxes (headline formula, About lines, result post, recommendation request) inside the examples,
 * and the notes after the last check.
 *
 * Content JSON (articleship-program/linkedin-checklist/linkedin-checklist.json) = the engine's schema plus optional
 * `open` { label, href, hint }, per-item `copy` + `copy_label`, and `notes` [{ title, text }].
 *
 * Browser: window.MSCArticleshipLinkedinChecklist (boot() is called by the page).
 * Node (tests): require('./scripts/articleship-linkedin-checklist.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCArticleshipLinkedinChecklist = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const TOOL = 'linkedin-checklist';
    const CONTENT_URL = '/articleship-program/linkedin-checklist/linkedin-checklist.json';
    /** LinkedIn sends a signed-in member from /in/me/ to their own profile. */
    const DEFAULT_OPEN = Object.freeze({
        label: 'Open my profile',
        href: 'https://www.linkedin.com/in/me/',
        hint: 'Not opening in the app? In LinkedIn, tap your photo, then tap it again.'
    });
    const COPIED = 'Copied. Fill in the [brackets].';

    function engine(name, options) {
        const key = name === 'checklist' ? 'Checklist' : 'Progress';
        if (options && options[key]) return options[key];
        const globalName = name === 'checklist' ? 'MSCArticleshipChecklist' : 'MSCArticleshipProgress';
        if (root[globalName]) return root[globalName];
        if (typeof require === 'function') {
            return require(name === 'checklist' ? './articleship-checklist.js' : './articleship-progress.js');
        }
        throw new Error(globalName + ' missing');
    }

    function text(value) {
        return value === undefined || value === null ? '' : String(value).trim();
    }

    /** Lines → one string, keeping "" as a blank line (the engine drops empty array entries). */
    function joinLines(value) {
        if (!Array.isArray(value)) return text(value);
        const lines = value.map(line => (line === undefined || line === null ? '' : String(line).replace(/\s+$/, '')));
        while (lines.length && !lines[0].trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        return lines.join('\n').replace(/\n{3,}/g, '\n\n');
    }

    const FIX_KEYS = ['fix', 'fix_link', 'fixLink', 'link', 'href', 'url'];

    /** Does the item name its own link (in any of the engine's accepted shapes)? */
    function hasFix(item) {
        return FIX_KEYS.some(key => {
            const value = item[key];
            if (value && typeof value === 'object') return text(value.href || value.url || value.link) !== '';
            return text(value) !== '';
        });
    }

    /** The open-my-profile target: the content's own, else LinkedIn's /in/me/. Only https links are used. */
    function openTarget(content, safeHref) {
        const raw = (content && !Array.isArray(content) && content.open) || {};
        const href = safeHref ? safeHref(raw.href) : text(raw.href);
        return {
            label: text(raw.label) || DEFAULT_OPEN.label,
            href: /^https:\/\//i.test(href) ? href : DEFAULT_OPEN.href,
            hint: raw.hint === '' ? '' : (text(raw.hint) || DEFAULT_OPEN.hint)
        };
    }

    /**
     * The content as the engine wants it: every item gets the "Open my profile" link unless it names its own, and
     * multi-line examples keep their blank lines. Returns { content, copies: Map(id → {label, text}), notes, open }.
     */
    function prepare(content, options) {
        const Checklist = engine('checklist', options);
        const source = Array.isArray(content) ? { items: content } : Object.assign({}, content || {});
        const open = openTarget(source, Checklist.safeHref);
        const fixDefault = { label: open.label, href: open.href };
        const copyById = new Map();
        const mapItem = raw => {
            const item = typeof raw === 'string' ? { check: raw } : Object.assign({}, raw || {});
            if (Array.isArray(item.example)) item.example = joinLines(item.example);
            if (!hasFix(item)) item.fix = Object.assign({}, fixDefault);
            return item;
        };
        if (Array.isArray(source.items)) source.items = source.items.map(mapItem);
        if (Array.isArray(source.sections)) {
            source.sections = source.sections.map(section => Object.assign({}, section, { items: (section.items || section.checks || []).map(mapItem) }));
        }
        // The engine regroups items by section and de-duplicates ids, so find each copy's item by its check text
        // (in order, so two items with the same text still pair up one to one).
        const model = Checklist.normalise(source);
        const raws = [];
        if (Array.isArray(source.sections)) source.sections.forEach(section => section.items.forEach(item => raws.push(item)));
        if (Array.isArray(source.items)) source.items.forEach(item => raws.push(item));
        const used = new Set();
        raws.forEach(raw => {
            const check = text(raw.check || raw.text || raw.title || raw.label || raw.item);
            const match = model.items.find(item => !used.has(item.id) && item.check === check);
            if (!match) return;
            used.add(match.id);
            const copy = joinLines(raw.copy);
            if (copy) copyById.set(match.id, { label: text(raw.copy_label || raw.copyLabel) || 'Copy this', text: copy });
        });
        const notes = (Array.isArray(source.notes) ? source.notes : [])
            .map(note => (typeof note === 'string' ? { title: '', text: text(note) } : { title: text(note && note.title), text: joinLines(note && (note.text || note.body)) }))
            .filter(note => note.text);
        return { content: source, model, copies: copyById, notes, open };
    }

    function el(doc, tag, className, content) {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined) node.textContent = content;
        return node;
    }

    function externalLink(doc, className, target) {
        const a = el(doc, 'a', className, target.label);
        a.href = target.href;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return a;
    }

    /** Copy text to the clipboard; falls back to a hidden textarea where the Clipboard API is missing or blocked. */
    function copyText(value, doc) {
        const d = doc || root.document;
        const nav = d && d.defaultView ? d.defaultView.navigator : root.navigator;
        const fallback = () => {
            if (!d || !d.body) return false;
            const area = d.createElement('textarea');
            area.value = value;
            area.setAttribute('readonly', '');
            area.style.position = 'fixed';
            area.style.top = '-1000px';
            area.style.opacity = '0';
            d.body.appendChild(area);
            area.select();
            let ok = false;
            try { ok = d.execCommand('copy'); } catch (_) { ok = false; }
            d.body.removeChild(area);
            return ok;
        };
        if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
            return nav.clipboard.writeText(value).then(() => true, () => fallback());
        }
        return Promise.resolve(fallback());
    }

    function copyBox(doc, copy) {
        const box = el(doc, 'div', 'lc-copy');
        const head = el(doc, 'div', 'lc-copy-head');
        head.appendChild(el(doc, 'span', 'lc-copy-label', copy.label));
        const button = el(doc, 'button', 'lc-copy-btn', 'Copy');
        button.type = 'button';
        head.appendChild(button);
        box.appendChild(head);
        box.appendChild(el(doc, 'p', 'lc-copy-text', copy.text));
        const status = el(doc, 'p', 'lc-copy-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        box.appendChild(status);
        let timer = null;
        button.addEventListener('click', () => {
            Promise.resolve(copyText(copy.text, doc)).then(ok => {
                status.textContent = ok ? (/\[[^\]]+\]/.test(copy.text) ? COPIED : 'Copied.') : 'Select the text and copy it.';
                button.textContent = ok ? 'Copied' : 'Copy';
                button.classList.toggle('is-done', !!ok);
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('is-done'); status.textContent = ''; }, 4000);
            });
        });
        return box;
    }

    /** Put each item's Copy box at the end of its example fold-out (or under the item if it has no example). */
    function addCopyBoxes(container, copies) {
        const doc = container.ownerDocument;
        copies.forEach((copy, id) => {
            const li = container.querySelector('.ap-cl-item[data-id="' + id + '"]');
            if (!li) return;
            const host = li.querySelector('.ap-cl-example') || li.querySelector('.ap-cl-extra') || li;
            host.appendChild(copyBox(doc, copy));
        });
    }

    /**
     * One example line → { kind, label, text }. kind: 'sample' ("> " lines: the words the student writes), 'good' (✅),
     * 'bad' (❌), 'gap' (blank line) or 'line'. A short lead-in before ": " (at most four words, no double quotes) becomes the
     * label ("How", "Test", "Who can see it").
     */
    function parseLine(raw) {
        const line = raw === undefined || raw === null ? '' : String(raw).replace(/\s+$/, '');
        if (!line.trim()) return { kind: 'gap', label: '', text: '' };
        if (/^>\s?/.test(line)) return { kind: 'sample', label: '', text: line.replace(/^>\s?/, '') };
        const trimmed = line.trim();
        if (/^✅/.test(trimmed)) return { kind: 'good', label: '', text: trimmed };
        if (/^❌/.test(trimmed)) return { kind: 'bad', label: '', text: trimmed };
        const m = /^([^:"“”]{1,30}):\s+(\S[\s\S]*)$/.exec(trimmed);
        if (m && m[1].trim().split(/\s+/).length <= 4) return { kind: 'line', label: m[1].trim(), text: m[2] };
        return { kind: 'line', label: '', text: trimmed };
    }

    /** Group parsed lines into blocks: consecutive sample lines share one block. */
    function exampleBlocks(value) {
        const blocks = [];
        let gap = false;
        String(value || '').split('\n').map(parseLine).forEach(line => {
            if (line.kind === 'gap') { gap = blocks.length > 0; return; }
            const last = blocks[blocks.length - 1];
            if (line.kind === 'sample' && last && last.kind === 'sample' && !gap) last.lines.push(line.text);
            else if (line.kind === 'sample') blocks.push({ kind: 'sample', lines: [line.text], gap });
            else blocks.push(Object.assign({ gap }, line));
            gap = false;
        });
        return blocks;
    }

    /** Re-draw each example fold-out as separate lines (labels bold, sample text in a white box). Text only, never HTML. */
    function formatExamples(container) {
        const doc = container.ownerDocument;
        container.querySelectorAll('.ap-cl-example > p').forEach(p => {
            const box = el(doc, 'div', 'lc-example');
            exampleBlocks(p.textContent).forEach(block => {
                let node;
                if (block.kind === 'sample') {
                    node = el(doc, 'blockquote', 'lc-sample');
                    block.lines.forEach(text => node.appendChild(el(doc, 'p', '', text)));
                } else {
                    node = el(doc, 'p', 'lc-line' + (block.kind === 'good' ? ' is-good' : block.kind === 'bad' ? ' is-bad' : ''));
                    if (block.label) {
                        node.appendChild(el(doc, 'strong', '', block.label + ':'));
                        node.appendChild(doc.createTextNode(' ' + block.text));
                    } else {
                        node.textContent = block.text;
                    }
                }
                if (block.gap) node.classList.add('has-gap');
                box.appendChild(node);
            });
            p.replaceWith(box);
        });
    }

    function renderOpen(node, open) {
        if (!node) return;
        const doc = node.ownerDocument;
        node.textContent = '';
        node.appendChild(externalLink(doc, 'ap-btn is-block lc-open-btn', open));
        if (open.hint) node.appendChild(el(doc, 'p', 'lc-open-hint', open.hint));
    }

    function renderNotes(node, notes) {
        if (!node) return;
        const doc = node.ownerDocument;
        node.textContent = '';
        notes.forEach(note => {
            const card = el(doc, 'div', 'ap-sticky lc-note');
            if (note.title) card.appendChild(el(doc, 'strong', '', note.title));
            card.appendChild(el(doc, 'p', '', note.text));
            node.appendChild(card);
        });
        node.classList.toggle('ap-hidden', !notes.length);
    }

    /**
     * Draw the tool. els: { app, open, notes, lede } (elements; open/notes/lede optional).
     * options: { store, Checklist, onChange }. Returns { list, prepared }.
     */
    function render(els, content, options) {
        const opts = options || {};
        const Checklist = engine('checklist', opts);
        const prepared = prepare(content, opts);
        if (els.lede && text(prepared.content.intro)) els.lede.textContent = text(prepared.content.intro);
        renderOpen(els.open, prepared.open);
        const list = Checklist.mount(els.app, prepared.content, {
            store: opts.store,
            labels: { example: 'Good example' },
            onChange: opts.onChange
        });
        formatExamples(els.app);
        addCopyBoxes(els.app, prepared.copies);
        renderNotes(els.notes, prepared.notes);
        return { list, prepared };
    }

    function showError(app, retry) {
        const doc = app.ownerDocument;
        app.textContent = '';
        const card = el(doc, 'div', 'ap-card lc-error');
        card.appendChild(el(doc, 'p', '', 'The checklist didn\'t load. Check your connection and try again.'));
        const button = el(doc, 'button', 'ap-btn', 'Try again');
        button.type = 'button';
        button.addEventListener('click', retry);
        card.appendChild(button);
        app.appendChild(card);
    }

    function loadContent(fetchImpl, url) {
        return fetchImpl(url || CONTENT_URL, { cache: 'no-cache' }).then(response => {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        });
    }

    /** Page start: gate, content, store, render. options (tests): { doc, fetch, store, Gate, Checklist, Progress, url }. */
    function boot(options) {
        const opts = options || {};
        const doc = opts.doc || root.document;
        const els = {
            app: doc.getElementById('app'),
            open: doc.getElementById('lc-open'),
            notes: doc.getElementById('lc-notes'),
            lede: doc.getElementById('lc-lede')
        };
        const Gate = opts.Gate || root.MSCArticleshipGate;
        const fetchImpl = opts.fetch || (root.fetch ? root.fetch.bind(root) : null);
        // The open-profile link works before the content arrives.
        renderOpen(els.open, DEFAULT_OPEN);
        const start = () => loadContent(fetchImpl, opts.url).then(content => {
            const Checklist = engine('checklist', opts);
            const store = opts.store || engine('progress', opts).open(TOOL, { defaults: { ticks: {} }, merge: Checklist.mergeTicks });
            return render(els, content, { store, Checklist });
        }).catch(() => { showError(els.app, () => { start(); }); return null; });
        const gate = Gate && typeof Gate.protect === 'function' ? Gate.protect() : Promise.resolve({ state: 'allow' });
        return Promise.resolve(gate).then(start);
    }

    return Object.freeze({ TOOL, CONTENT_URL, DEFAULT_OPEN, joinLines, openTarget, prepare, parseLine, exampleBlocks, copyText, render, boot });
});
