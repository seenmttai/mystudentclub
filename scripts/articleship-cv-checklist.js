/**
 * MSC Articleship Program: the CV checklist (row 1.8), /articleship-program/cv-checklist/.
 * The one home of the CV checks: ~22 ticks in the order you build a CV, "14 of 22 done", an example and a fix link on
 * each, saved through the progress engine (device at once, account when available). Ends on CV Reviewer, then the
 * personal review.
 *
 * Built on the shared checklist engine (scripts/articleship-checklist.js). This file adds the page around it: the
 * content load, a "Jump to N" button for the next unticked check (at 100% it becomes "Next: two reviews" and takes the
 * student to the closing card), a section list on wide screens, folds inside an example ("▸ More questions"), a
 * "Checking: GST CV / Direct Tax CV" switch when the student has a backup domain (ticks are kept per domain; with one
 * domain, "Add a second CV" sets the shared backup domain), the
 * closing card (always visible, green at 100%) with the one question for the personal review, "Untick all" with an
 * inline Yes / Cancel, the shared "my domain" in the file-name example and the review message, and a slimmer progress
 * row on phones once the student scrolls past the title.
 *
 * Stored data (one progress row, tool "cv-checklist"):
 *   { ticks, at }                   the CV checked before any domain was set (the first domain's CV takes it over)
 *   { cvs: { <slug>: { ticks, at } } } one CV per domain (my domain, backup)
 *   { checking: <slug> }            which CV the switch shows
 * Merges per domain with the checklist engine's mergeTicks (a later tick or untick wins).
 *
 * Release switch: MSCArticleshipProgress.WORK_SIMULATION_LIVE (the one flag in scripts/articleship-progress.js, read
 * here as WORK_SIMULATION_LIVE; start's options.workSimulationLive overrides it). While false (release 1), the checks
 * are drawn without the Work Simulation: an example line about it goes, a mixed line loses the sentence, clause or list
 * item that names it, a link to it goes (MSCArticleshipProgress.releaseContent). Release 2 flips the shared flag.
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
    // An example line "▸ More questions" starts a fold of its own; the lines after it go inside.
    const FOLD_MARK = '▸ ';

    // "my domain" as it goes in a file name, on the switch and in the review message: "Your Name - Articleship CV - GST.pdf".
    const FILE_DOMAIN = Object.freeze({
        'statutory-audit': 'Audit', 'internal-audit': 'Internal Audit', 'direct-tax': 'Direct Tax', 'gst': 'GST',
        'bank-audit': 'Bank Audit', 'transfer-pricing': 'Transfer Pricing', 'ma-tax': 'M&A Tax', 'valuation': 'Valuation',
        'fdd': 'Due Diligence', 'forensic': 'Forensic', 'consulting': 'Consulting', 'accounting': 'Accounting',
        'ib-er': 'IB and Equity Research'
    });

    function progressApi() {
        if (root && root.MSCArticleshipProgress) return root.MSCArticleshipProgress;
        if (typeof require === 'function') {
            try { return require('./articleship-progress.js'); } catch (_) { /* optional */ }
        }
        return null;
    }
    // Release 1 ships without the Work Simulation (row 1.6): no check names it until the shared switch is true.
    const WORK_SIMULATION_LIVE = (() => {
        const progress = progressApi();
        return Boolean(progress && progress.WORK_SIMULATION_LIVE === true);
    })();

    /** The checklist content as this release draws it (a copy; release 1: nothing about the Work Simulation). */
    function releaseContent(content, live) {
        const progress = progressApi();
        if (!content || !progress || typeof progress.releaseContent !== 'function') return content;
        const on = typeof live === 'boolean' ? live : WORK_SIMULATION_LIVE;
        const rows = withLiveRowLines(content, row => rowIdLive(progress, row, on));
        return progress.releaseContent(on ? withWorkSimulationLines(rows) : rows, { workSimulationLive: on });
    }

    /** Is course row "4.4" in the course? Not when ROWS_NOT_LIVE lists it (1.6 follows the Work Simulation switch). */
    function rowIdLive(progress, row, workSimulationLive) {
        const id = String(row);
        if (id === '1.6') return Boolean(workSimulationLive);
        const list = (progress && Array.isArray(progress.ROWS_NOT_LIVE)) ? progress.ROWS_NOT_LIVE : [];
        return !list.some(entry => entry && String(entry.row) === id);
    }

    /**
     * Rows not in the course yet (build/release/live.json, the same rows as ROWS_NOT_LIVE): a check's
     * "needs": { "<row>": { "replace": { line now: line once the row is live }, "also": [links] } } swaps that example
     * line and adds those links once the row is live; until then the check reads as it is. The "needs" key itself is
     * never drawn (a copy; the input is never changed).
     */
    function withLiveRowLines(content, isLive) {
        if (!content || !Array.isArray(content.items)) return content;
        const copy = clone(content);
        copy.items.forEach(item => {
            const needs = item && item.needs;
            if (!needs || typeof needs !== 'object') return;
            Object.keys(needs).forEach(row => {
                const spec = needs[row];
                if (row.startsWith('_') || !spec || typeof spec !== 'object' || !isLive(row)) return;
                const swap = spec.replace && typeof spec.replace === 'object' ? spec.replace : {};
                const swapLine = line => (typeof line === 'string' && Object.prototype.hasOwnProperty.call(swap, line)) ? String(swap[line]) : line;
                if (Array.isArray(item.example)) item.example = item.example.map(swapLine);
                else if (typeof item.example === 'string') item.example = item.example.split('\n').map(swapLine).join('\n');
                if (Array.isArray(spec.also) && spec.also.length) item.also = (Array.isArray(item.also) ? item.also : []).concat(clone(spec.also));
            });
            delete item.needs;
        });
        return copy;
    }

    /**
     * Release 2: a check's "work_simulation": { "replace": { release-1 line: release-2 line } } swaps that example line
     * (the PDF and sheet twins of row 1.8 do the same). Release 1 never calls this; its work_simulation keys are dropped
     * by the shared release filter.
     */
    function withWorkSimulationLines(content) {
        if (!content || !Array.isArray(content.items)) return content;
        const copy = clone(content);
        copy.items.forEach(item => {
            const swap = item && item.work_simulation && item.work_simulation.replace;
            if (!swap || typeof swap !== 'object') return;
            const swapLine = line => (typeof line === 'string' && Object.prototype.hasOwnProperty.call(swap, line)) ? String(swap[line]) : line;
            if (Array.isArray(item.example)) item.example = item.example.map(swapLine);
            else if (typeof item.example === 'string') item.example = item.example.split('\n').map(swapLine).join('\n');
        });
        return copy;
    }

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

    function clone(value) {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
    }

    function domainName(slug) {
        return (slug && FILE_DOMAIN[slug]) || '';
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

    /**
     * What the student sends for the personal review: the question first, then the domain and the checklist count;
     * the PDF follows in the chat (a link cannot attach it).
     */
    function reviewMessage(state) {
        const s = state || {};
        const lines = [
            'Hi, please review my articleship CV.',
            'My question: ' + String(s.question || '').trim(),
            'Domain: ' + (s.domain || '')
        ];
        if (s.total) lines.push('CV checklist: ' + (s.done === undefined ? s.total : s.done) + ' of ' + s.total + ' done');
        lines.push('I’m attaching my CV PDF next.');
        return lines.join('\n');
    }

    /** The review link with the message as its preset text (wa.me reads `text`; spaces as %20, never "+"). */
    function reviewHref(base, message) {
        const href = String(base || '');
        if (!/^https:\/\/wa\.me\//i.test(href)) return href;
        return href.split('?')[0] + '?text=' + encodeURIComponent(message);
    }

    /** The student's CVs, one per domain: my domain first, then the backup (none when no domain is set). */
    function cvList(domains) {
        const d = domains || {};
        return [d.main, d.backup].filter(slug => Boolean(domainName(slug))).filter((slug, i, all) => all.indexOf(slug) === i);
    }

    /** "Your Name - Articleship CV - GST.pdf" lines for the student's domain and backup (none when no domain is set). */
    function fileNames(domains) {
        return cvList(domains).map(slug => 'Your Name - Articleship CV - ' + domainName(slug) + '.pdf');
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
     * What the button in the progress row offers: nothing before the first tick (check 1 is in view), the next unticked
     * check while some are left, and the two reviews once all are ticked.
     */
    function nextStep(model, summary) {
        if (!summary.done) return null;
        if (summary.complete) return { kind: 'end', label: 'Next: two reviews', aria: 'Next: two reviews, after the checklist' };
        const item = nextItem(model, summary);
        return item ? { kind: 'check', id: item.id, no: item.no, label: item.label, aria: 'Jump to check ' + item.no } : null;
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

    /** An example split at its "▸ Title" lines: { main: [line], folds: [{ title, lines: [line] }] } (empty folds dropped). */
    function exampleGroups(text) {
        const groups = { main: [], folds: [] };
        let into = groups.main;
        String(text || '').split('\n').map(line => line.trim()).filter(Boolean).forEach(line => {
            if (line.startsWith(FOLD_MARK)) {
                const fold = { title: line.slice(FOLD_MARK.length).trim(), lines: [] };
                if (fold.title) { groups.folds.push(fold); into = fold.lines; }
                return;
            }
            into.push(line);
        });
        groups.folds = groups.folds.filter(fold => fold.lines.length);
        return groups;
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

    function exampleBox(doc, lines) {
        const box = el(doc, 'div', 'cvc-ex');
        exampleLines(lines.join('\n')).forEach(line => {
            const row = el(doc, 'p', line.lead ? 'cvc-ex-pair' : '');
            if (line.lead) {
                row.appendChild(el(doc, 'strong', '', line.lead));
                row.appendChild(doc.createTextNode(' → '));
            }
            appendText(doc, row, line.rest);
            box.appendChild(row);
        });
        return box;
    }

    /** Each example as line blocks; every "▸ Title" part becomes its own fold next to "Example". */
    function renderExamples(container, doc) {
        container.querySelectorAll('.ap-cl-example > p').forEach(p => {
            const details = p.parentNode;
            const groups = exampleGroups(p.textContent);
            p.replaceWith(exampleBox(doc, groups.main));
            let after = details;
            groups.folds.forEach(fold => {
                const more = el(doc, 'details', 'ap-cl-example cvc-fold');
                more.appendChild(el(doc, 'summary', '', fold.title));
                more.appendChild(exampleBox(doc, fold.lines));
                after.parentNode.insertBefore(more, after.nextSibling);
                after = more;
            });
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

    // ---------- Ticks per domain ----------

    function tickPart(source) {
        return { ticks: Object.assign({}, (source && source.ticks) || {}), at: Object.assign({}, (source && source.at) || {}) };
    }

    function hasAny(part) {
        return Boolean(part) && (Object.keys(part.ticks || {}).length > 0 || Object.keys(part.at || {}).length > 0);
    }

    /**
     * Two devices both changed the checklist: merge the CV without a domain and every domain's CV each on its own
     * (a later tick or untick wins, as the checklist engine's mergeTicks does). Everything else: this device's copy.
     */
    function mergeCvTicks(localData, remoteData, Checklist) {
        const C = Checklist || checklistEngine();
        const local = localData || {};
        const remote = remoteData || {};
        const merged = C.mergeTicks(local, remote);
        const localCvs = local.cvs || {};
        const remoteCvs = remote.cvs || {};
        const slugs = [...new Set([...Object.keys(remoteCvs), ...Object.keys(localCvs)])];
        if (slugs.length) {
            merged.cvs = {};
            slugs.forEach(slug => {
                const both = C.mergeTicks(tickPart(localCvs[slug]), tickPart(remoteCvs[slug]));
                merged.cvs[slug] = { ticks: both.ticks || {}, at: both.at || {} };
            });
        }
        return merged;
    }

    /**
     * The progress store as the checklist engine sees it: { ticks, at } of the CV being checked. The CV is the one the
     * switch picked (data.checking) when it is one of the student's domains, else my domain's, else the one without a
     * domain. My domain's CV starts from the ticks made before any domain was set, and takes them over on its first change.
     *   cvs() → the student's domains, my domain first ([] when none is set)
     */
    function cvStore(store, cvs) {
        const listeners = new Set();
        const list = () => { try { return cvs() || []; } catch (_) { return []; } };
        const slugOf = data => {
            const all = list();
            if (!all.length) return null;
            return all.includes(data && data.checking) ? data.checking : all[0];
        };
        const partFor = (data, slug) => {
            const d = data || {};
            if (!slug) return tickPart(d);
            if (d.cvs && d.cvs[slug]) return tickPart(d.cvs[slug]);
            return slug === list()[0] ? tickPart(d) : tickPart(null);
        };
        const pick = data => partFor(data, slugOf(data));
        const write = (data, change) => {
            const d = Object.assign({}, data || {});
            const slug = slugOf(d);
            const draft = pick(d);
            const returned = typeof change === 'function' ? change(draft) : Object.assign(draft, change || {});
            const next = tickPart(returned === undefined ? draft : returned);
            if (!slug) return Object.assign(d, next);
            const takingOver = !(d.cvs && d.cvs[slug]) && slug === list()[0] && hasAny(tickPart(d));
            d.cvs = Object.assign({}, d.cvs, { [slug]: next });
            if (takingOver) { d.ticks = {}; d.at = {}; }
            return d;
        };
        const unsubscribe = store.subscribe((data, info) => {
            const part = pick(data);
            listeners.forEach(listener => listener(clone(part), info));
        });
        return {
            get: () => pick(store.get()),
            update(change) {
                store.update(data => write(data, change));
                return pick(store.get());
            },
            subscribe(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
            /** The domain of the CV being checked (null when no domain is set). */
            slug: () => slugOf(store.get()),
            list,
            ticksFor: slug => partFor(store.get(), slug).ticks,
            choose(slug) {
                if (!list().includes(slug)) return false;
                store.update(data => Object.assign({}, data, { checking: slug }));
                return true;
            },
            /** Repaint after "my domain" changed (the CV shown may be another one now). */
            refresh() {
                const part = pick(store.get());
                listeners.forEach(listener => listener(clone(part), { source: 'domain' }));
            },
            destroy() { unsubscribe(); listeners.clear(); }
        };
    }

    /** A store kept in memory (tests, or no progress engine on the page). */
    function memoryStore(initial) {
        let data = clone(initial || { ticks: {} });
        const listeners = new Set();
        return {
            get: () => clone(data),
            update(change) {
                const draft = clone(data);
                const returned = typeof change === 'function' ? change(draft) : Object.assign(draft, change || {});
                data = clone(returned === undefined ? draft : returned);
                listeners.forEach(listener => listener(clone(data), { source: 'local' }));
                return clone(data);
            },
            subscribe(listener) {
                listeners.add(listener);
                return () => listeners.delete(listener);
            }
        };
    }

    /**
     * Mount the checklist and the page parts around it.
     * options: { container, nav, end, lede, switcher, content, store, Checklist,
     *            domains() => { main, backup } (slugs of the shared "my domain"), domainSlugs (the 13, in order),
     *            addBackup(slug) (saves the shared backup domain: "Add a second CV"), now(), workSimulationLive }
     * Returns { list, model, summary(), jump(id), jumpToEnd(), reset(), checking(), choose(slug), refreshDomain(), destroy() }.
     */
    function start(options) {
        const opts = options || {};
        const container = opts.container;
        if (!container) throw new Error('No container');
        const doc = container.ownerDocument || root.document;
        const C = checklistEngine(opts);
        const content = releaseContent(opts.content, opts.workSimulationLive);
        const full = C.normalise(content);
        const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
        const readDomains = () => {
            try { return (typeof opts.domains === 'function' && opts.domains()) || {}; } catch (_) { return {}; }
        };
        const store = opts.store || memoryStore({ ticks: {} });
        const view = cvStore(store, () => cvList(readDomains()));

        if (opts.lede) opts.lede.textContent = introText(full.intro, full.total);

        const list = C.mount(container, withoutDone(content), {
            store: view,
            now,
            onChange: summary => paint(summary)
        });
        const model = list.model;
        renderExamples(container, doc);

        // Anchors for the side list; each "Example" (and each fold) names its check for screen readers.
        container.querySelectorAll('.ap-cl-section').forEach(section => {
            section.id = 'cvc-' + section.dataset.section;
        });
        model.items.forEach(item => {
            const li = container.querySelector('.ap-cl-item[data-id="' + item.id + '"]');
            if (!li) return;
            li.querySelectorAll('.ap-cl-example > summary').forEach(summaryEl => {
                const fold = summaryEl.parentNode.classList.contains('cvc-fold');
                summaryEl.setAttribute('aria-label', (fold ? summaryEl.textContent + ', check ' : 'Example for check ') + item.no);
            });
        });

        // Only the count is announced; the button beside it stays out of the live region.
        const progress = container.querySelector('.ap-progress');
        const countEl = container.querySelector('.ap-progress-count');
        if (progress && countEl) {
            progress.removeAttribute('role');
            progress.removeAttribute('aria-live');
            countEl.setAttribute('role', 'status');
            countEl.setAttribute('aria-live', 'polite');
        }

        // "Jump to N" in the sticky progress row; "Next: two reviews" once all are ticked.
        const progressText = container.querySelector('.ap-progress-text');
        const next = el(doc, 'button', 'cvc-next');
        next.type = 'button';
        if (progressText) progressText.insertBefore(next, progressText.querySelector('.ap-progress-pct'));
        next.addEventListener('click', () => {
            const step = nextStep(model, list.summary());
            if (!step) return;
            if (step.kind === 'end') jumpToEnd(); else jump(step.id);
        });

        // "Untick all" under the list, confirmed in place (a WebView may answer window.confirm() with "no" unasked).
        const resetRow = el(doc, 'div', 'cvc-reset-row');
        const reset = el(doc, 'button', 'cvc-reset', 'Untick all');
        reset.type = 'button';
        const confirmBox = el(doc, 'div', 'cvc-confirm');
        confirmBox.setAttribute('role', 'group');
        confirmBox.hidden = true;
        const question = el(doc, 'span', 'cvc-confirm-q');
        question.id = 'cvc-confirm-q';
        confirmBox.setAttribute('aria-labelledby', question.id);
        const yes = el(doc, 'button', 'cvc-confirm-yes', 'Yes');
        yes.type = 'button';
        const cancel = el(doc, 'button', 'cvc-confirm-no', 'Cancel');
        cancel.type = 'button';
        confirmBox.appendChild(question);
        confirmBox.appendChild(yes);
        confirmBox.appendChild(cancel);
        resetRow.appendChild(reset);
        resetRow.appendChild(confirmBox);
        container.appendChild(resetRow);
        let confirming = false;
        function openConfirm() {
            if (!list.summary().done) return;
            const name = cvLabel(view.slug());
            question.textContent = 'Untick all ' + model.total + (view.list().length > 1 && name ? ' on your ' + name : '') + '?';
            confirming = true;
            reset.hidden = true;
            confirmBox.hidden = false;
            cancel.focus();
        }
        function closeConfirm(focusReset) {
            if (!confirming) return;
            confirming = false;
            confirmBox.hidden = true;
            reset.hidden = list.summary().done === 0;
            if (focusReset && !reset.hidden) reset.focus();
        }
        reset.addEventListener('click', openConfirm);
        cancel.addEventListener('click', () => closeConfirm(true));
        confirmBox.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); closeConfirm(true); }
        });
        yes.addEventListener('click', () => {
            confirming = false;
            confirmBox.hidden = true;
            resetTicks();
            if (model.items.length) jump(model.items[0].id);
        });

        // Two domains, two CVs: "Checking: GST CV / Direct Tax CV". Each keeps its own ticks.
        const switcher = opts.switcher || null;
        let switchParts = [];
        function cvLabel(slug) {
            const name = domainName(slug);
            return name ? name + ' CV' : '';
        }
        function renderAdd(main) {
            // One domain so far: a second CV starts here (it becomes the shared backup domain every tool reads).
            const label = el(doc, 'label', 'cvc-add');
            label.appendChild(el(doc, 'span', 'cvc-add-label', 'Applying in two domains?'));
            const select = doc.createElement('select');
            select.className = 'cvc-add-select';
            const first = el(doc, 'option', '', 'Add a second CV');
            first.value = '';
            select.appendChild(first);
            (opts.domainSlugs || Object.keys(FILE_DOMAIN)).filter(slug => slug !== main && domainName(slug)).forEach(slug => {
                const option = el(doc, 'option', '', cvLabel(slug));
                option.value = slug;
                select.appendChild(option);
            });
            select.addEventListener('change', () => {
                const slug = select.value;
                if (!slug) return;
                try { opts.addBackup(slug); } catch (_) { select.value = ''; return; }
                refreshDomain();
                paint(list.summary());
                const added = switchParts.find(part => part.slug === slug);
                if (added) added.input.focus();
            });
            label.appendChild(select);
            switcher.appendChild(label);
        }
        function renderSwitch() {
            if (!switcher) return;
            switcher.textContent = '';
            switchParts = [];
            const cvs = view.list();
            const canAdd = cvs.length === 1 && typeof opts.addBackup === 'function';
            switcher.hidden = cvs.length < 2 && !canAdd;
            if (canAdd) { renderAdd(cvs[0]); return; }
            if (cvs.length < 2) return;
            const set = el(doc, 'fieldset', 'cvc-cvs-set');
            set.appendChild(el(doc, 'legend', 'cvc-cvs-legend', 'Checking:'));
            const current = view.slug();
            cvs.forEach(slug => {
                const label = el(doc, 'label', 'cvc-cv');
                const input = doc.createElement('input');
                input.type = 'radio';
                input.name = 'cvc-cv';
                input.value = slug;
                input.checked = slug === current;
                input.addEventListener('change', () => {
                    if (!input.checked) return;
                    closeConfirm(false);
                    view.choose(slug);
                });
                label.appendChild(input);
                label.appendChild(el(doc, 'span', 'cvc-cv-name', cvLabel(slug)));
                const count = el(doc, 'span', 'cvc-cv-count');
                label.appendChild(count);
                set.appendChild(label);
                switchParts.push({ slug, input, label, count });
            });
            switcher.appendChild(set);
        }
        function paintSwitch() {
            const current = view.slug();
            switchParts.forEach(part => {
                const done = C.summarise(model, view.ticksFor(part.slug)).done;
                part.count.textContent = done + '/' + model.total;
                part.input.checked = part.slug === current;
                part.label.classList.toggle('is-current', part.slug === current);
            });
        }

        // The student's own file name(s) under the file-name example, from the shared "my domain".
        const fileItem = model.items.find(item => item.id === 'file-name') ||
            model.items.find(item => /Articleship CV - /.test(item.example));
        const fileBox = fileItem ? container.querySelector('.ap-cl-item[data-id="' + fileItem.id + '"] .cvc-ex') : null;
        let fileLines = [];
        function renderFileNames() {
            fileLines.forEach(node => node.remove());
            fileLines = [];
            if (!fileBox) return;
            const anchor = fileBox.children[1] || null;
            fileNames(readDomains()).forEach((name, i) => {
                const row = el(doc, 'p', 'cvc-ex-mine');
                row.appendChild(el(doc, 'strong', '', i ? 'For your backup domain: ' : 'For your domain: '));
                row.appendChild(doc.createTextNode(name));
                fileBox.insertBefore(row, anchor);
                fileLines.push(row);
            });
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

        // Closing card: always there, so the next step is never hidden; it turns green at 100%. The personal review is
        // open at any time, like its LMS row; its message carries the student's one question first, built when tapped.
        let endParts = null;
        if (opts.end) {
            opts.end.textContent = '';
            const card = el(doc, 'div', 'cvc-end-card');
            card.tabIndex = -1;
            const title = el(doc, 'h2', 'cvc-end-title');
            const text = el(doc, 'p', 'cvc-end-text');
            const links = el(doc, 'div', 'cvc-end-links');
            let review = null;
            (full.done ? full.done.links : []).forEach((target, i) => {
                const a = el(doc, 'a', 'ap-btn is-block' + (i ? ' is-secondary' : ''), target.label);
                a.href = target.href;
                if (target.external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
                if (!review && isReviewLink(target)) {
                    a.classList.add('cvc-review');
                    review = { a, target, field: null, hint: null };
                    if (/^https:\/\/wa\.me\//i.test(target.href)) {
                        const ask = el(doc, 'div', 'cvc-ask');
                        const label = el(doc, 'label', 'cvc-ask-label', 'Your one question for the reviewer');
                        label.htmlFor = 'cvc-question';
                        const field = doc.createElement('textarea');
                        field.id = 'cvc-question';
                        field.className = 'cvc-ask-field';
                        field.rows = 2;
                        field.maxLength = 300;
                        field.placeholder = 'e.g. Which line should I cut to keep it to one page?';
                        const hint = el(doc, 'p', 'cvc-ask-hint');
                        hint.id = 'cvc-question-hint';
                        hint.setAttribute('aria-live', 'polite');
                        field.setAttribute('aria-describedby', hint.id);
                        field.addEventListener('input', () => {
                            if (field.value.trim()) hint.textContent = '';
                            a.href = reviewLink();
                        });
                        ask.appendChild(label);
                        ask.appendChild(field);
                        ask.appendChild(hint);
                        links.appendChild(ask);
                        review.field = field;
                        review.hint = hint;
                    }
                    a.addEventListener('click', event => {
                        if (review.field && !review.field.value.trim()) {
                            // The review answers one question: ask for it here, so the message never goes bare.
                            event.preventDefault();
                            review.hint.textContent = 'Type your one question first. It goes at the top of the message.';
                            review.field.focus();
                            return;
                        }
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
            const review = endParts && endParts.review;
            if (!review) return '';
            const summary = list.summary();
            const message = reviewMessage({
                question: review.field ? review.field.value : '',
                done: summary.done,
                total: summary.total,
                domain: domainName(view.slug())
            });
            return reviewHref(review.target.href, message);
        }

        function paint(summary) {
            const step = nextStep(model, summary);
            next.textContent = step ? step.label : '';
            next.hidden = !step;
            next.classList.toggle('is-end', Boolean(step && step.kind === 'end'));
            if (step) next.setAttribute('aria-label', step.aria); else next.removeAttribute('aria-label');
            if (confirming && !summary.done) closeConfirm(false);
            reset.hidden = confirming || summary.done === 0;
            navItems(model, summary).forEach(entry => {
                const parts = navLinks.get(entry.id);
                if (!parts) return;
                parts.count.textContent = entry.count;
                parts.a.classList.toggle('is-complete', entry.complete);
            });
            paintSwitch();
            if (endParts) {
                const state = endState(summary, full.done);
                endParts.card.classList.toggle('is-complete', state.complete);
                endParts.title.textContent = state.title;
                endParts.text.textContent = state.text;
                if (endParts.review) endParts.review.a.href = reviewLink();
            }
            return summary;
        }

        function scrollTo(node) {
            if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
        }

        function flash(node) {
            node.classList.remove('cvc-flash');
            // Restart the highlight even when the same place is jumped to twice.
            void node.offsetWidth;
            node.classList.add('cvc-flash');
        }

        function focusQuietly(node) {
            if (!node || typeof node.focus !== 'function') return;
            try { node.focus({ preventScroll: true }); } catch (_) { node.focus(); }
        }

        function jump(id) {
            const li = container.querySelector('.ap-cl-item[data-id="' + String(id).replace(/"/g, '') + '"]');
            if (!li) return false;
            scrollTo(li);
            flash(li);
            focusQuietly(li.querySelector('input'));
            return true;
        }

        /** The closing card: CV Reviewer, then the personal review. */
        function jumpToEnd() {
            const card = endParts && endParts.card;
            if (!card) return false;
            scrollTo(opts.end);
            flash(card);
            focusQuietly(card.querySelector('a') || card);
            return true;
        }

        function resetTicks() {
            // Each untick is stamped, so another device's older ticks do not come back in a merge.
            view.update(data => {
                const off = {};
                Object.keys((data && data.ticks) || {}).forEach(id => { off[id] = false; });
                return Object.assign(C.applyTicks(data, off, now()), { ticks: {} });
            });
            return list.summary();
        }

        function refreshDomain() {
            renderSwitch();
            renderFileNames();
            view.refresh();
        }

        renderSwitch();
        renderFileNames();
        paint(list.summary());
        return {
            list,
            model,
            summary: () => list.summary(),
            jump,
            jumpToEnd,
            reset: resetTicks,
            checking: () => view.slug(),
            choose: slug => view.choose(slug),
            refreshDomain() { refreshDomain(); paint(list.summary()); },
            destroy() { list.destroy(); view.destroy(); }
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
            const store = Progress ? Progress.open(TOOL, { defaults: { ticks: {} }, merge: (local, remote) => mergeCvTicks(local, remote, C) }) : null;
            const page = start({
                container,
                nav: doc.getElementById('cvc-nav'),
                end: doc.getElementById('cvc-end'),
                lede: doc.getElementById('cvc-lede'),
                switcher: doc.getElementById('cvc-cvs'),
                content: data,
                store,
                Checklist: C,
                domains: () => (Progress && typeof Progress.getMyDomain === 'function'
                    ? { main: Progress.getMyDomain(), backup: typeof Progress.getBackupDomain === 'function' ? Progress.getBackupDomain() : null }
                    : {}),
                domainSlugs: Progress && Array.isArray(Progress.DOMAINS) ? Progress.DOMAINS.map(domain => domain.slug) : null,
                addBackup: Progress && typeof Progress.setMyDomain === 'function' && typeof Progress.getMyDomain === 'function'
                    ? slug => Progress.setMyDomain(Progress.getMyDomain(), { backup: slug })
                    : null
            });
            watchCompact({ target: doc.querySelector('.cvc-hero'), progress: container.querySelector('.ap-progress') });
            if (Progress && typeof Progress.onSettingsChange === 'function') {
                try { Progress.onSettingsChange(() => page.refreshDomain()); } catch (_) { /* the domain parts are optional */ }
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
        TOOL, CONTENT_URL, WORK_SIMULATION_LIVE, releaseContent, withLiveRowLines, FILE_DOMAIN, FOLD_MARK, introText, isReviewLink, reviewMessage, reviewHref, cvList, fileNames,
        domainName, withoutDone, endState, navItems, nextItem, nextStep, exampleLines, exampleGroups, boldParts,
        mergeCvTicks, cvStore, loadContent, watchCompact, start, boot
    });
});
