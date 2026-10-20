/**
 * MSC Articleship Program: the CV checklist (row 1.8), /articleship-program/cv-checklist/.
 * The one home of the CV checks: ~22 ticks in the order you build a CV, "14 of 22 done", an example and a fix link on
 * each, saved through the progress engine (device at once, account when available). Ends on CV Reviewer, then the
 * personal review.
 *
 * Built on the shared checklist engine (scripts/articleship-checklist.js). This file adds the page around it: the
 * content load, a "Jump to N" button for the next unticked check, a section list on wide screens, the closing card
 * (always visible, green at 100%) and "Untick all".
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
            text: 'Once all ' + summary.total + ' are ticked, run the CV Reviewer on your PDF, then send it for a personal review.',
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

    function renderExamples(container, doc) {
        container.querySelectorAll('.ap-cl-example > p').forEach(p => {
            const lines = exampleLines(p.textContent);
            if (lines.length < 2 && !(lines[0] && lines[0].lead)) return;
            const box = el(doc, 'div', 'cvc-ex');
            lines.forEach(line => {
                const row = el(doc, 'p', line.lead ? 'cvc-ex-pair' : '');
                if (line.lead) {
                    row.appendChild(el(doc, 'strong', '', line.lead));
                    row.appendChild(doc.createTextNode(' → '));
                }
                row.appendChild(doc.createTextNode(line.rest));
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
     * options: { container, nav, end, lede, content, store, Checklist, confirm(message) => boolean }
     * Returns { list, model, summary(), jump(id), reset(), destroy() }.
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
        const ask = opts.confirm || (message => (typeof root.confirm === 'function' ? root.confirm(message) : true));

        if (opts.lede && full.intro) opts.lede.textContent = full.intro;

        const list = C.mount(container, withoutDone(content), {
            store,
            onChange: summary => paint(summary)
        });
        const model = list.model;
        renderExamples(container, doc);

        // Anchors for the side list.
        container.querySelectorAll('.ap-cl-section').forEach(section => {
            section.id = 'cvc-' + section.dataset.section;
        });

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
        let endParts = null;
        if (opts.end) {
            opts.end.textContent = '';
            const card = el(doc, 'div', 'cvc-end-card');
            const title = el(doc, 'h2', 'cvc-end-title');
            const text = el(doc, 'p', 'cvc-end-text');
            const links = el(doc, 'div', 'cvc-end-links');
            (full.done ? full.done.links : []).forEach((target, i) => {
                const a = el(doc, 'a', 'ap-btn is-block' + (i ? ' is-secondary' : ''), target.label);
                a.href = target.href;
                if (target.external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
                links.appendChild(a);
            });
            card.appendChild(title);
            card.appendChild(text);
            card.appendChild(links);
            opts.end.appendChild(card);
            endParts = { card, title, text };
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
            if (store) store.update(data => { data.ticks = {}; return data; });
            else model.items.forEach(item => list.tick(item.id, false));
            return list.summary();
        }

        paint(list.summary());
        return {
            list,
            model,
            summary: () => list.summary(),
            jump,
            reset: resetTicks,
            destroy() { list.destroy(); }
        };
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
        const gate = opts.Gate || root.MSCArticleshipGate;
        const Progress = opts.Progress || root.MSCArticleshipProgress;
        const C = checklistEngine(opts);
        const allowed = gate ? gate.protect() : Promise.resolve({ state: 'allow' });
        const content = loadContent(opts.url || CONTENT_URL, opts.fetch);
        return Promise.all([allowed, content]).then(([, data]) => {
            const store = Progress ? Progress.open(TOOL, { defaults: { ticks: {} }, merge: C.mergeTicks }) : null;
            return start({
                container,
                nav: doc.getElementById('cvc-nav'),
                end: doc.getElementById('cvc-end'),
                lede: doc.getElementById('cvc-lede'),
                content: data,
                store,
                Checklist: C
            });
        }).catch(error => {
            if (root.console) root.console.error(error);
            if (container) showError(container, () => root.location.reload());
            return null;
        });
    }

    return Object.freeze({ TOOL, CONTENT_URL, withoutDone, endState, navItems, nextItem, exampleLines, loadContent, start, boot });
});
