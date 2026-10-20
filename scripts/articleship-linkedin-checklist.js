/**
 * MSC Articleship Program: the LinkedIn profile checklist (row 3.1), /articleship-program/linkedin-checklist/.
 * Twelve profile checks on the shared checklist engine, each with a good example and a link that opens the student's
 * own LinkedIn profile (or the exact LinkedIn page for that check). Ticks save through the progress engine.
 *
 * This file adds the page around the engine: the content load, the "Open my profile" card, a one-line "How:" click path
 * under each check, a default "Open my profile" link on every check (lighter, so the repeats don't shout), examples
 * drawn line by line ("> " lines = sample text in a white box; short "Label:" lead-ins in bold), white Copy boxes
 * (headline formula, About lines, result post, recommendation request) at the top of their fold-outs, the shared
 * "my domain" filled into the Copy boxes and examples, and the notes after the last check.
 *
 * Content JSON (articleship-program/linkedin-checklist/linkedin-checklist.json) = the engine's schema plus optional
 * `open` { label, href, hint }; per item `how` (one line), `example_label` (the fold-out's name), `copy` + `copy_label`
 * + `copy_aria`, `also` { label, href } (a second link beside the fix link); `notes` [{ title, text, link: { label, href } }]. Domain: `[domain]` (Copy boxes) and
 * `{domain|statutory audit}` (examples: the default until the student has set "my domain") are filled from
 * MSCArticleshipProgress.getMyDomain() and refilled when it changes.
 *
 * Ticks: the progress engine's store with the checklist engine's mergeTicks: when two devices both changed ticks before
 * a sync, the later change wins per check (a tick or an untick), so an untick on one device is not undone by the other.
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
    const EXAMPLE_LABEL = 'Examples';

    /**
     * "My domain" as it reads in a headline or an About line ("Seeking articleship in statutory audit"): the words people
     * search with (the roadmaps' LinkedIn keywords), not the long filter label.
     */
    const DOMAIN_PHRASE = Object.freeze({
        'statutory-audit': 'statutory audit', 'internal-audit': 'internal audit', 'direct-tax': 'direct tax', 'gst': 'GST',
        'bank-audit': 'bank audit', 'transfer-pricing': 'transfer pricing', 'ma-tax': 'M&A tax', 'valuation': 'valuation',
        'fdd': 'due diligence', 'forensic': 'forensic audit', 'consulting': 'consulting', 'accounting': 'accounting & MIS',
        'ib-er': 'equity research'
    });

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

    /** A domain slug (or label) → the words for a headline; '' when unknown. labelFn(slug) gives a label for new slugs. */
    function domainPhrase(value, labelFn) {
        const slug = text(value).toLowerCase();
        if (!slug) return '';
        if (DOMAIN_PHRASE[slug]) return DOMAIN_PHRASE[slug];
        let label = '';
        try { label = typeof labelFn === 'function' ? text(labelFn(slug)) : ''; } catch (_) { label = ''; }
        // "Statutory audit" → "statutory audit"; acronyms ("GST", "IB & …") keep their capitals.
        return label && /^[A-Z][a-z]/.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label;
    }

    const DOMAIN_TOKEN = /\{domain(?:\|([^}]*))?\}/g;
    const HAS_DOMAIN = /\{domain(?:\|[^}]*)?\}|\[domain\]/;

    /** Fill "my domain": `{domain|default}` → the phrase (else the default); `[domain]` → the phrase (else kept). */
    function fillDomain(value, phrase) {
        const p = text(phrase);
        return String(value === undefined || value === null ? '' : value)
            .replace(DOMAIN_TOKEN, (_, fallback) => p || text(fallback) || '[domain]')
            .replace(/\[domain\]/g, p ? p : '[domain]');
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
        const extras = new Map();
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
            const label = text(raw.copy_label || raw.copyLabel) || 'Copy this';
            if (copy) copyById.set(match.id, { label, text: copy, aria: text(raw.copy_aria || raw.copyAria) || 'Copy ' + label.toLowerCase() });
            const how = text(raw.how);
            const exampleLabel = text(raw.example_label || raw.exampleLabel);
            const alsoRaw = raw.also && typeof raw.also === 'object' ? raw.also : {};
            const alsoHref = Checklist.safeHref ? Checklist.safeHref(alsoRaw.href || alsoRaw.url) : text(alsoRaw.href || alsoRaw.url);
            const also = alsoHref && text(alsoRaw.label) ? { label: text(alsoRaw.label), href: alsoHref } : null;
            if (how || exampleLabel || also) extras.set(match.id, { how, exampleLabel, also });
        });
        const notes = (Array.isArray(source.notes) ? source.notes : [])
            .map(note => {
                if (typeof note === 'string') return { title: '', text: text(note), link: null };
                const raw = (note && note.link) || {};
                const href = Checklist.safeHref ? Checklist.safeHref(raw.href || raw.url) : text(raw.href || raw.url);
                const label = text(raw.label || raw.text);
                return { title: text(note && note.title), text: joinLines(note && (note.text || note.body)), link: href && label ? { label, href } : null };
            })
            .filter(note => note.text);
        return { content: source, model, copies: copyById, extras, notes, open };
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

    /** A text node that may carry "my domain": keeps its template so the domain can be refilled later. */
    function setText(node, template, phrase) {
        const value = String(template === undefined || template === null ? '' : template);
        if (HAS_DOMAIN.test(value)) node.setAttribute('data-lc-tpl', value);
        node.textContent = fillDomain(value, phrase);
        return node;
    }

    /** Refill every domain-bearing text under `container` (after "my domain" changes). */
    function applyDomain(container, phrase) {
        if (!container) return;
        container.querySelectorAll('[data-lc-tpl]').forEach(node => { node.textContent = fillDomain(node.getAttribute('data-lc-tpl'), phrase); });
    }

    function copyBox(doc, copy, phrase) {
        const box = el(doc, 'div', 'lc-copy');
        const head = el(doc, 'div', 'lc-copy-head');
        head.appendChild(el(doc, 'span', 'lc-copy-label', copy.label));
        const button = el(doc, 'button', 'lc-copy-btn', 'Copy');
        button.type = 'button';
        button.setAttribute('aria-label', copy.aria || 'Copy ' + copy.label.toLowerCase());
        head.appendChild(button);
        box.appendChild(head);
        const body = setText(el(doc, 'p', 'lc-copy-text'), copy.text, phrase);
        box.appendChild(body);
        const status = el(doc, 'p', 'lc-copy-status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        box.appendChild(status);
        let timer = null;
        button.addEventListener('click', () => {
            const value = body.textContent;
            Promise.resolve(copyText(value, doc)).then(ok => {
                status.textContent = ok ? (/\[[^\]]+\]/.test(value) ? COPIED : 'Copied.') : 'Select the text and copy it.';
                button.textContent = ok ? 'Copied' : 'Copy';
                button.classList.toggle('is-done', !!ok);
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => { button.textContent = 'Copy'; button.classList.remove('is-done'); status.textContent = ''; }, 4000);
            });
        });
        return box;
    }

    /** Put each item's Copy box at the top of its fold-out, straight under the toggle (or under the item if it has none). */
    function addCopyBoxes(container, copies, phrase) {
        const doc = container.ownerDocument;
        copies.forEach((copy, id) => {
            const li = container.querySelector('.ap-cl-item[data-id="' + id + '"]');
            if (!li) return;
            const box = copyBox(doc, copy, phrase);
            const details = li.querySelector('.ap-cl-example');
            if (details) {
                const summary = details.querySelector('summary');
                details.insertBefore(box, summary ? summary.nextSibling : details.firstChild);
            } else {
                (li.querySelector('.ap-cl-extra') || li).appendChild(box);
            }
        });
    }

    /**
     * Per check: the one-line "How:" click path under the check, the fold-out's own name, and a lighter style for the
     * repeated default "Open my profile" links (the specific ones, such as "Edit my URL", keep the full style).
     */
    function decorateItems(container, extras, open, phrase) {
        const doc = container.ownerDocument;
        container.querySelectorAll('.ap-cl-item').forEach(li => {
            const extra = extras.get(li.getAttribute('data-id')) || {};
            if (extra.how) {
                const how = el(doc, 'p', 'lc-how');
                how.appendChild(el(doc, 'strong', '', 'How:'));
                how.appendChild(doc.createTextNode(' '));
                how.appendChild(setText(el(doc, 'span'), extra.how, phrase));
                const check = li.querySelector('.ap-cl-check');
                li.insertBefore(how, check ? check.nextSibling : li.firstChild);
            }
            const summary = li.querySelector('.ap-cl-example > summary');
            if (summary && extra.exampleLabel) summary.textContent = extra.exampleLabel;
            const fix = li.querySelector('.ap-cl-fix');
            if (fix && fix.getAttribute('href') === open.href && fix.textContent === open.label) fix.classList.add('lc-fix-profile');
            if (extra.also) {
                // A second link on one check (e.g. Featured → the Work Simulation work sample). MSC pages stay in the tab.
                const a = el(doc, 'a', 'ap-cl-fix lc-also', extra.also.label);
                a.href = extra.also.href;
                if (/^https:\/\//i.test(extra.also.href) && !/^https:\/\/(www\.|mobile\.)?mystudentclub\.com(\/|$)/i.test(extra.also.href)) {
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                }
                const row = li.querySelector('.ap-cl-extra');
                if (row) row.appendChild(a); else li.appendChild(a);
            }
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
    function formatExamples(container, phrase) {
        const doc = container.ownerDocument;
        container.querySelectorAll('.ap-cl-example > p').forEach(p => {
            const box = el(doc, 'div', 'lc-example');
            exampleBlocks(p.textContent).forEach(block => {
                let node;
                if (block.kind === 'sample') {
                    node = el(doc, 'blockquote', 'lc-sample');
                    block.lines.forEach(line => node.appendChild(setText(el(doc, 'p'), line, phrase)));
                } else {
                    node = el(doc, 'p', 'lc-line' + (block.kind === 'good' ? ' is-good' : block.kind === 'bad' ? ' is-bad' : ''));
                    if (block.label) {
                        node.appendChild(el(doc, 'strong', '', block.label + ':'));
                        node.appendChild(doc.createTextNode(' '));
                        node.appendChild(setText(el(doc, 'span'), block.text, phrase));
                    } else {
                        setText(node, block.text, phrase);
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

    function renderNotes(node, notes, phrase) {
        if (!node) return;
        const doc = node.ownerDocument;
        node.textContent = '';
        notes.forEach(note => {
            const card = el(doc, 'div', 'ap-sticky lc-note');
            if (note.title) card.appendChild(el(doc, 'strong', '', note.title));
            card.appendChild(setText(el(doc, 'p'), note.text, phrase));
            if (note.link) {
                // Programme pages open in the same tab; anything outside MSC opens in a new one.
                const a = el(doc, 'a', 'lc-note-link', note.link.label);
                a.href = note.link.href;
                if (/^https:\/\//i.test(note.link.href) && !/^https:\/\/(www\.|mobile\.)?mystudentclub\.com(\/|$)/i.test(note.link.href)) {
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                }
                card.appendChild(a);
            }
            node.appendChild(card);
        });
        node.classList.toggle('ap-hidden', !notes.length);
    }

    /**
     * Draw the tool. els: { app, open, notes, lede } (elements; open/notes/lede optional).
     * options: { store, Checklist, onChange, domain (slug of "my domain"), domainLabel(slug) }.
     * Returns { list, prepared, setDomain(slug) }.
     */
    function render(els, content, options) {
        const opts = options || {};
        const Checklist = engine('checklist', opts);
        const prepared = prepare(content, opts);
        let phrase = domainPhrase(opts.domain, opts.domainLabel);
        if (els.lede && text(prepared.content.intro)) els.lede.textContent = text(prepared.content.intro);
        renderOpen(els.open, prepared.open);
        const list = Checklist.mount(els.app, prepared.content, {
            store: opts.store,
            labels: { example: EXAMPLE_LABEL },
            onChange: opts.onChange
        });
        formatExamples(els.app, phrase);
        decorateItems(els.app, prepared.extras, prepared.open, phrase);
        addCopyBoxes(els.app, prepared.copies, phrase);
        renderNotes(els.notes, prepared.notes, phrase);
        return {
            list,
            prepared,
            setDomain(slug) {
                phrase = domainPhrase(slug, opts.domainLabel);
                applyDomain(els.app, phrase);
                applyDomain(els.notes, phrase);
                return phrase;
            }
        };
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

    /** The shared "my domain" slug, or null (no setting, or storage blocked). */
    function readDomain(Progress) {
        try { return Progress && typeof Progress.getMyDomain === 'function' ? Progress.getMyDomain() || null : null; } catch (_) { return null; }
    }

    /**
     * Page start: gate, content, store, render, then keep "my domain" filled in.
     * options (tests): { doc, fetch, store, Gate, Checklist, Progress, url }.
     */
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
        // "My domain" comes from the page's progress engine (or the test's); never opened just for this.
        const Progress = opts.Progress || root.MSCArticleshipProgress || null;
        const domainLabel = slug => (Progress && typeof Progress.domainLabel === 'function' ? Progress.domainLabel(slug) : '');
        // The open-profile link works before the content arrives.
        renderOpen(els.open, DEFAULT_OPEN);
        let watching = false;
        const start = () => loadContent(fetchImpl, opts.url).then(content => {
            const Checklist = engine('checklist', opts);
            const store = opts.store || engine('progress', opts).open(TOOL, { defaults: { ticks: {} }, merge: Checklist.mergeTicks });
            const page = render(els, content, { store, Checklist, domain: readDomain(Progress), domainLabel });
            if (!watching && Progress && typeof Progress.onSettingsChange === 'function') {
                try { Progress.onSettingsChange(() => page.setDomain(readDomain(Progress))); watching = true; } catch (_) { /* the domain fill is optional */ }
            }
            return page;
        }).catch(() => { showError(els.app, () => { start(); }); return null; });
        const gate = Gate && typeof Gate.protect === 'function' ? Gate.protect() : Promise.resolve({ state: 'allow' });
        return Promise.resolve(gate).then(start);
    }

    return Object.freeze({
        TOOL, CONTENT_URL, DEFAULT_OPEN, DOMAIN_PHRASE, joinLines, openTarget, prepare, parseLine, exampleBlocks,
        domainPhrase, fillDomain, copyText, render, boot
    });
});
