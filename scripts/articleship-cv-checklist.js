/**
 * MSC Articleship Program: the CV checklist (row 1.8), /articleship-program/cv-checklist/.
 * The one home of the CV checks: ~22 ticks in the order you build a CV, "14 of 22 done", an example and a fix link on
 * each, saved through the progress engine (device at once, account when available). Ends on CV Reviewer, then the
 * personal review.
 *
 * Built on the shared checklist engine (scripts/articleship-checklist.js). This file adds the page around it: the
 * content load, a "Jump to N" button for the next unticked check, a section list on wide screens, the closing card
 * (always visible, green at 100%; the one-per-student personal review is sent once all checks are ticked, so its
 * button here is live at 100%), "Untick all", the shared "my domain" in the file-name example and the review message,
 * and a slimmer progress row on phones once the student scrolls past the title.
 *
 * Browser: window.MSCArticleshipCvChecklist (boot() is called by the page). Node (tests): require('./scripts/articleship-cv-checklist.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCArticleshipCvChecklist = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    const TOOL = 'cv-checklist';
    const CONTENT_URL = '/articleship-program/cv-checklist/cv-checklist.json';
    const INTRO = '{n} checks, in the order you build a CV. Tick a check only when your PDF passes it.';

    // "my domain" as it goes in a file name: "Riya Sharma - Articleship CV - GST.pdf".
    const FILE_DOMAIN = Object.freeze({
        'statutory-audit': 'Audit', 'internal-audit': 'Internal Audit', 'direct-tax': 'Direct Tax', 'gst': 'GST',
        'bank-audit': 'Bank Audit', 'transfer-pricing': 'Transfer Pricing', 'ma-tax': 'M and A Tax', 'valuation': 'Valuation',
        'fdd': 'Due Diligence', 'forensic': 'Forensic', 'consulting': 'Consulting', 'accounting': 'Accounting',
        'ib-er': 'Equity Research'
    });

    function checklistEngine(options) {
        if (options && options.Checklist) return options.Checklist;
        if (root.MSCArticleshipChecklist) return root.MSCArticleshipChecklist;
        if (typeof require === 'function') return require('./articleship-checklist.js');
        throw new Error('Checklist engine missing');
    }

    function el(doc, tag, className, content) {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined) node.textContent = content;
        return node;
    }

    /** The intro with the real count, so it never goes stale when the content changes ("{n} checks, …"). */
    function introText(intro, total) {
        const textValue = String(intro || '').trim() || INTRO;
        return textValue.replace(/\{n\}/g, String(total)).replace(/^\d+(?= checks?\b)/, String(total));
    }

    /** The personal review link: the closing card's WhatsApp (or other non-MSC) link, or one labelled as the review. */
    function isReviewLink(link) {
        return Boolean(link) && (/^https:\/\/wa\.me\//i.test(link.href) || /personal/i.test(link.label || ''));
    }

    /** What the student sends for the personal review; they type the question and attach the PDF before sending. */
    function reviewMessage(state) {
        const s = state || {};
        const count = s.total ? ' (' + (s.done === undefined ? s.total : s.done) + ' of ' + s.total + ')' : '';
        return [
            'Hi, my CV checklist is done' + count + '. Please review my articleship CV.',
            'Domain: ' + (s.domain || ''),
            'My question: ',
            'CV PDF attached'
        ].join('\n');
    }

    /** The review link with the message as its preset text (wa.me reads `text`; spaces as %20, never "+"). */
    function reviewHref(base, message) {
        const href = String(base || '');
        if (!/^https:\/\/wa\.me\//i.test(href)) return href;
        return href.split('?')[0] + '?text=' + encodeURIComponent(message);
    }

    /** "Your Name - Articleship CV - GST.pdf" lines for the student's domain and backup (none when no domain is set). */
    function fileNames(domains) {
        const d = domains || {};
        return [d.main, d.backup].filter(Boolean).filter((slug, i, all) => all.indexOf(slug) === i)
            .map(slug => FILE_DOMAIN[slug]).filter(Boolean)
            .map(name => 'Your Name - Articleship CV - ' + name + '.pdf');
    }

    /** The content without its closing card: this page draws that card itself, so it can show before 100% too. */
    function withoutDone(content) {
        if (!content || Array.isArray(content)) return content;
        const copy = Object.assign({}, content);
        delete copy.done;
        delete copy.finish;
        return copy;
    }

    /** What the closing card says: the content's own title and text at 100%, a "then" line before it. */
    function endState(summary, done) {
        const links = (done && done.links) || [];
        if (summary.complete) {
            return {
                complete: true,
                title: (done && done.title) || 'All done',
                text: (done && done.text) || '',
                links
            };
        }
        return {
            complete: false,
            title: 'Then, two reviews',
            text: 'Run the CV Reviewer on your PDF. Then send it for your one personal review, once all ' + summary.total + ' are ticked.',
            links
        };
    }

    /** One row per section for the side list: "Header 3/5". */
    function navItems(model, summary) {
        return model.sections.map(section => {
            const counts = summary.sections.find(s => s.id === section.id) || { done: 0, total: section.items.length };
            return {
                id: section.id,
                anchor: 'cvc-' + section.id,
                title: section.title || 'Checks',
                count: counts.done + '/' + counts.total,
                complete: counts.total > 0 && counts.done === counts.total
            };
        });
    }

    /** The next unticked check, as the number the student sees ("Jump to 15"); null when all are done. */
    function nextItem(model, summary) {
        if (!summary.next) return null;
        const item = model.items.find(entry => entry.id === summary.next);
        return item ? { id: item.id, no: item.no, label: 'Jump to ' + item.no } : null;
    }

    /**
     * An example's lines for the fold-out: one block per line, and a "claim → question" line split so the claim can be
     * bold ("Tally Prime" → "Pass a purchase entry with GST."). Plain text only; nothing is parsed as HTML.
     */
    function exampleLines(text) {
        return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
            const at = line.indexOf(' → ');
            if (at > 0 && at < 60) return { lead: line.slice(0, at), rest: line.slice(at + 3) };
            return { lead: '', rest: line };
        });
    }

    /** "reconciled **₹4.2 lakh** of …" → [{ text, bold }]: how a bold example shows bold. Plain text, never HTML. */
    function boldParts(text) {
        const parts = [];
        String(text || '').split(/\*\*(.+?)\*\*/).forEach((part, i) => {
            if (part) parts.push({ text: part, bold: i % 2 === 1 });
        });
        return parts;
    }

    function appendText(doc, node, text) {
        boldParts(text).forEach(part => node.appendChild(part.bold ? el(doc, 'strong', 'cvc-ex-bold', part.text) : doc.createTextNode(part.text)));
    }

    function renderExamples(container, doc) {
        container.querySelectorAll('.ap-cl-example > p').forEach(p => {
            const lines = exampleLines(p.textContent);
            const box = el(doc, 'div', 'cvc-ex');
            lines.forEach(line => {
                const row = el(doc, 'p', line.lead ? 'cvc-ex-pair' : '');
                if (line.lead) {
                    row.appendChild(el(doc, 'strong', '', line.lead));
                    row.appendChild(doc.createTextNode(' → '));
                }
                appendText(doc, row, line.rest);
                box.appendChild(row);
            });
            p.replaceWith(box);
        });
    }

    async function loadContent(url, fetchImpl) {
        const doFetch = fetchImpl || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
        if (!doFetch) throw new Error('No fetch');
        const response = await doFetch(url || CONTENT_URL, { cache: 'no-cache', credentials: 'same-origin' });
        if (!response || !response.ok) throw new Error('Checklist content did not load (' + (response ? response.status : 'no response') + ')');
        return response.json();
    }

    function reducedMotion() {
        try { return Boolean(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
    }

    /**
     * Mount the checklist and the page parts around it.
     * options: { container, nav, end, lede, content, store, Checklist, confirm(message) => boolean,
     *            domains() => { main, backup } (slugs of the shared "my domain"), domainLabel(slug) => label, now() }
     * Returns { list, model, summary(), jump(id), reset(), refreshDomain(), destroy() }.
     */
    function start(options) {
        const opts = options || {};
        const container = opts.container;
        if (!container) throw new Error('No container');
        const doc = container.ownerDocument || root.document;
        const C = checklistEngine(opts);
        const content = opts.content;
        const full = C.normalise(content);
        const store = opts.store || null;
        const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
        const ask = opts.confirm || (message => (typeof root.confirm === 'function' ? root.confirm(message) : true));
        const readDomains = () => {
            try { return (typeof opts.domains === 'function' && opts.domains()) || {}; } catch (_) { return {}; }
        };
        const labelOf = slug => {
            if (!slug) return '';
            try { return (typeof opts.domainLabel === 'function' && opts.domainLabel(slug)) || FILE_DOMAIN[slug] || ''; } catch (_) { return FILE_DOMAIN[slug] || ''; }
        };

        if (opts.lede) opts.lede.textContent = introText(full.intro, full.total);

        const list = C.mount(container, withoutDone(content), {
            store,
            now,
            onChange: summary => paint(summary)
        });
        const model = list.model;
        renderExamples(container, doc);

        // Anchors for the side list; each "Example" names its check for screen readers.
        container.querySelectorAll('.ap-cl-section').forEach(section => {
            section.id = 'cvc-' + section.dataset.section;
        });
        model.items.forEach(item => {
            const summaryEl = container.querySelector('.ap-cl-item[data-id="' + item.id + '"] .ap-cl-example > summary');
            if (summaryEl) summaryEl.setAttribute('aria-label', 'Example for check ' + item.no);
        });

        // Only the count is announced; the "Jump to N" button beside it stays out of the live region.
        const progress = container.querySelector('.ap-progress');
        const countEl = container.querySelector('.ap-progress-count');
        if (progress && countEl) {
            progress.removeAttribute('role');
            progress.removeAttribute('aria-live');
            countEl.setAttribute('role', 'status');
            countEl.setAttribute('aria-live', 'polite');
        }

        // "Jump to N" in the sticky progress row.
        const progressText = container.querySelector('.ap-progress-text');
        const next = el(doc, 'button', 'cvc-next');
        next.type = 'button';
        if (progressText) progressText.insertBefore(next, progressText.querySelector('.ap-progress-pct'));
        next.addEventListener('click', () => {
            const target = nextItem(model, list.summary());
            if (target) jump(target.id);
        });

        // "Untick all" under the list (two CVs for two domains: check the second one from zero).
        const resetRow = el(doc, 'div', 'cvc-reset-row');
        const reset = el(doc, 'button', 'cvc-reset', 'Untick all');
        reset.type = 'button';
        reset.addEventListener('click', () => {
            if (!list.summary().done) return;
            if (!ask('Untick all ' + model.total + ' checks?')) return;
            resetTicks();
        });
        resetRow.appendChild(reset);
        container.appendChild(resetRow);

        // The student's own file name(s) under the file-name example, from the shared "my domain".
        const fileItem = model.items.find(item => item.id === 'file-name') ||
            model.items.find(item => /Articleship CV - /.test(item.example));
        const fileBox = fileItem ? container.querySelector('.ap-cl-item[data-id="' + fileItem.id + '"] .cvc-ex') : null;
        let fileLines = [];
        function refreshDomain() {
            fileLines.forEach(node => node.remove());
            fileLines = [];
            if (!fileBox) return;
            const names = fileNames(readDomains());
            names.forEach((name, i) => {
                const row = el(doc, 'p', 'cvc-ex-mine');
                row.appendChild(el(doc, 'strong', '', i ? 'Your backup: ' : 'Yours: '));
                row.appendChild(doc.createTextNode(name));
                fileBox.insertBefore(row, fileBox.children[1] || null);
                fileLines.push(row);
            });
            // Two lines read top to bottom: main, then backup.
            if (fileLines.length === 2) fileBox.insertBefore(fileLines[0], fileLines[1]);
        }

        // Side list of sections (shown on wide screens).
        const navLinks = new Map();
        if (opts.nav) {
            opts.nav.textContent = '';
            const heading = el(doc, 'h2', 'cvc-nav-title', 'Sections');
            const ol = el(doc, 'ol', 'cvc-nav-list');
            navItems(model, list.summary()).forEach(entry => {
                const li = el(doc, 'li');
                const a = el(doc, 'a', 'cvc-nav-link');
                a.href = '#' + entry.anchor;
                a.appendChild(el(doc, 'span', 'cvc-nav-name', entry.title));
                const count = el(doc, 'span', 'cvc-nav-count', entry.count);
                a.appendChild(count);
                li.appendChild(a);
                ol.appendChild(li);
                navLinks.set(entry.id, { a, count });
            });
            opts.nav.appendChild(heading);
            opts.nav.appendChild(ol);
        }

        // Closing card: always there, so the next step is never hidden; it turns green at 100%.
        // The personal review (one per student) opens only at 100%, with its message built when it is tapped.
        let endParts = null;
        if (opts.end) {
            opts.end.textContent = '';
            const card = el(doc, 'div', 'cvc-end-card');
            const title = el(doc, 'h2', 'cvc-end-title');
            const text = el(doc, 'p', 'cvc-end-text');
            const links = el(doc, 'div', 'cvc-end-links');
            let review = null;
            (full.done ? full.done.links : []).forEach((target, i) => {
                const a = el(doc, 'a', 'ap-btn is-block' + (i ? ' is-secondary' : ''), target.label);
                a.href = target.href;
                if (target.external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
                if (!review && isReviewLink(target)) {
                    review = { a, target };
                    a.classList.add('cvc-review');
                    a.addEventListener('click', event => {
                        if (!list.summary().complete) { event.preventDefault(); return; }
                        a.href = reviewLink();
                    });
                }
                links.appendChild(a);
            });
            card.appendChild(title);
            card.appendChild(text);
            card.appendChild(links);
            opts.end.appendChild(card);
            endParts = { card, title, text, review };
        }

        function reviewLink() {
            const summary = list.summary();
            const message = reviewMessage({ done: summary.done, total: summary.total, domain: labelOf(readDomains().main) });
            return reviewHref(endParts.review.target.href, message);
        }

        function paintReview(summary) {
            const review = endParts && endParts.review;
            if (!review) return;
            const a = review.a;
            if (summary.complete) {
                a.textContent = review.target.label;
                a.href = reviewLink();
                a.removeAttribute('aria-disabled');
                a.removeAttribute('role');
                a.classList.remove('is-disabled');
                if (review.target.external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
            } else {
                a.textContent = review.target.label + ' ';
                a.appendChild(el(doc, 'span', 'cvc-after', '(after all ' + summary.total + ')'));
                a.removeAttribute('href');
                a.removeAttribute('target');
                a.setAttribute('role', 'link');
                a.setAttribute('aria-disabled', 'true');
                a.classList.add('is-disabled');
            }
        }

        function paint(summary) {
            // Nothing ticked yet: check 1 is already in view, so the jump only appears once the student has started.
            const target = summary.done > 0 ? nextItem(model, summary) : null;
            next.textContent = target ? target.label : '';
            next.hidden = !target;
            if (target) next.setAttribute('aria-label', 'Jump to check ' + target.no);
            reset.hidden = summary.done === 0;
            navItems(model, summary).forEach(entry => {
                const parts = navLinks.get(entry.id);
                if (!parts) return;
                parts.count.textContent = entry.count;
                parts.a.classList.toggle('is-complete', entry.complete);
            });
            if (endParts) {
                const state = endState(summary, full.done);
                endParts.card.classList.toggle('is-complete', state.complete);
                endParts.title.textContent = state.title;
                endParts.text.textContent = state.text;
                paintReview(summary);
            }
            return summary;
        }

        function jump(id) {
            const li = container.querySelector('.ap-cl-item[data-id="' + String(id).replace(/"/g, '') + '"]');
            if (!li) return false;
            if (typeof li.scrollIntoView === 'function') li.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
            li.classList.remove('cvc-flash');
            // Restart the highlight even when the same item is jumped to twice.
            void li.offsetWidth;
            li.classList.add('cvc-flash');
            const input = li.querySelector('input');
            if (input && typeof input.focus === 'function') {
                try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
            }
            return true;
        }

        function resetTicks() {
            if (store) {
                // Each untick is stamped, so another device's older ticks do not come back in a merge.
                store.update(data => {
                    const off = {};
                    Object.keys((data && data.ticks) || {}).forEach(id => { off[id] = false; });
                    return C.applyTicks ? Object.assign(C.applyTicks(data, off, now()), { ticks: {} }) : Object.assign(data, { ticks: {} });
                });
            } else {
                model.items.forEach(item => list.tick(item.id, false));
            }
            return list.summary();
        }

        refreshDomain();
        paint(list.summary());
        return {
            list,
            model,
            summary: () => list.summary(),
            jump,
            reset: resetTicks,
            refreshDomain() { refreshDomain(); paint(list.summary()); },
            destroy() { list.destroy(); }
        };
    }

    /**
     * Phones: the sticky progress row slims down once the title has scrolled away, and grows back at the top.
     * options: { target (the title block), progress (.ap-progress), Observer (IntersectionObserver) }. Returns stop().
     */
    function watchCompact(options) {
        const o = options || {};
        const Observer = o.Observer || root.IntersectionObserver;
        if (!o.target || !o.progress || typeof Observer !== 'function') return () => {};
        const observer = new Observer(entries => {
            const entry = entries[entries.length - 1];
            if (entry) o.progress.classList.toggle('cvc-compact', !entry.isIntersecting);
        }, { rootMargin: '-56px 0px 0px 0px' });
        observer.observe(o.target);
        return () => { observer.disconnect(); o.progress.classList.remove('cvc-compact'); };
    }

    function showError(container, retry) {
        const doc = container.ownerDocument || root.document;
        container.textContent = '';
        const card = el(doc, 'div', 'ap-card cvc-error');
        card.appendChild(el(doc, 'p', '', 'The checklist didn’t open. Check your connection and try again.'));
        const button = el(doc, 'button', 'ap-btn', 'Try again');
        button.type = 'button';
        button.addEventListener('click', retry);
        card.appendChild(button);
        container.appendChild(card);
    }

    /** Page entry: gate, content and store, then start. */
    function boot(options) {
        const opts = options || {};
        const doc = opts.document || root.document;
        const container = doc.getElementById('app');
        const gate = opts.Gate === undefined ? root.MSCArticleshipGate : opts.Gate;
        const Progress = opts.Progress === undefined ? root.MSCArticleshipProgress : opts.Progress;
        // Without the gate (its script failed to load) or after an error, never leave the page hidden behind
        // html.ap-gated; a gate card that is showing keeps it.
        const unhide = () => {
            if (!doc.getElementById('ap-gate')) doc.documentElement.classList.remove('ap-gated');
        };
        let C;
        let allowed;
        try {
            C = checklistEngine(opts);
            allowed = gate && typeof gate.protect === 'function' ? gate.protect() : Promise.resolve({ state: 'allow' });
        } catch (error) {
            allowed = Promise.reject(error);
        }
        if (!gate) unhide();
        const content = loadContent(opts.url || CONTENT_URL, opts.fetch);
        return Promise.all([allowed, content]).then(([, data]) => {
            const store = Progress ? Progress.open(TOOL, { defaults: { ticks: {} }, merge: C.mergeTicks }) : null;
            const page = start({
                container,
                nav: doc.getElementById('cvc-nav'),
                end: doc.getElementById('cvc-end'),
                lede: doc.getElementById('cvc-lede'),
                content: data,
                store,
                Checklist: C,
                domains: () => (Progress && typeof Progress.getMyDomain === 'function'
                    ? { main: Progress.getMyDomain(), backup: typeof Progress.getBackupDomain === 'function' ? Progress.getBackupDomain() : null }
                    : {}),
                domainLabel: slug => (Progress && typeof Progress.domainLabel === 'function' ? Progress.domainLabel(slug) : '')
            });
            watchCompact({ target: doc.querySelector('.cvc-hero'), progress: container.querySelector('.ap-progress') });
            if (Progress && typeof Progress.onSettingsChange === 'function') {
                try { Progress.onSettingsChange(() => page.refreshDomain()); } catch (_) { /* the domain line is optional */ }
            }
            return page;
        }).catch(error => {
            if (root.console) root.console.error(error);
            unhide();
            if (container) showError(container, () => root.location.reload());
            return null;
        });
    }

    return Object.freeze({
        TOOL, CONTENT_URL, FILE_DOMAIN, introText, isReviewLink, reviewMessage, reviewHref, fileNames, withoutDone, endState,
        navItems, nextItem, exampleLines, boldParts, loadContent, watchCompact, start, boot
    });
});
