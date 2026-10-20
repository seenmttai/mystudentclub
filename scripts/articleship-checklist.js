/**
 * MSC Articleship Program: one checklist engine for the CV checklist (row 1.8) and the LinkedIn profile checklist
 * (row 3.1). Content is JSON; ticks save through MSCArticleshipProgress (device at once, account when available).
 *
 * Browser: window.MSCArticleshipChecklist. Node (tests): require('./scripts/articleship-checklist.js').
 * Markup classes come from /articleship-program/shared/articleship-tools.css.
 * API reference: msc-content/articleship-program/v3/build/tools/PLATFORM.md
 */
(function (root, factory) {
    'use strict';
    const api = factory(root);
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCArticleshipChecklist = api;
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
    'use strict';

    function text(value) {
        return value === undefined || value === null ? '' : String(value).trim();
    }

    function slug(value) {
        return text(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
    }

    /** Only links a student can safely follow: same-site paths, anchors, https, mailto. */
    function safeHref(value) {
        const href = text(value);
        if (!href) return '';
        if (/^\/(?!\/)/.test(href) || href.startsWith('#') || href.startsWith('?')) return href;
        if (/^https:\/\/[^\s]+$/i.test(href)) return href;
        if (/^mailto:[^\s]+$/i.test(href)) return href;
        return '';
    }

    function isExternal(href) {
        return /^https:\/\//i.test(href) && !/^https:\/\/(www\.|mobile\.)?mystudentclub\.com(\/|$)/i.test(href);
    }

    function pickFirst(item, keys) {
        for (const key of keys) {
            if (item[key] !== undefined && item[key] !== null && text(item[key]) !== '') return item[key];
        }
        return undefined;
    }

    function normaliseFix(item) {
        const raw = pickFirst(item, ['fix', 'fix_link', 'fixLink', 'link', 'href', 'url']);
        let label = text(pickFirst(item, ['fix_label', 'fixLabel', 'link_label', 'linkLabel']));
        let href = '';
        if (raw && typeof raw === 'object') {
            href = safeHref(raw.href || raw.url || raw.link);
            label = label || text(raw.label || raw.text || raw.title);
        } else {
            href = safeHref(raw);
        }
        if (!href) return null;
        return { href, label: label || 'Fix it', external: isExternal(href) };
    }

    function normaliseItem(raw, index) {
        const item = typeof raw === 'string' ? { check: raw } : (raw || {});
        const check = text(pickFirst(item, ['check', 'text', 'title', 'label', 'item']));
        if (!check) throw new Error('Checklist item ' + (index + 1) + ' has no text');
        const example = pickFirst(item, ['example', 'eg', 'good', 'hint', 'example_or_link']);
        return {
            id: slug(pickFirst(item, ['id', 'key'])) || slug(check),
            check,
            why: text(pickFirst(item, ['why', 'note'])),
            example: Array.isArray(example) ? example.map(text).filter(Boolean).join('\n') : text(example),
            fix: normaliseFix(item),
            section: text(pickFirst(item, ['section', 'group', 'stage']))
        };
    }

    function normaliseDone(done) {
        if (!done) return null;
        if (typeof done === 'string') return { title: '', text: text(done), links: [] };
        const links = (Array.isArray(done.links) ? done.links : [])
            .map(link => ({ label: text(link.label || link.text), href: safeHref(link.href || link.url) }))
            .filter(link => link.label && link.href)
            .map(link => Object.assign(link, { external: isExternal(link.href) }));
        return { title: text(done.title), text: text(done.text || done.body), links };
    }

    /**
     * Accepts { title, intro, items: [...] } (items carry `section`), { sections: [{ title, items }] } or a bare array.
     * Returns { title, intro, done, sections: [{ id, title, items }], items (flat, numbered), total }.
     */
    function normalise(content) {
        const source = Array.isArray(content) ? { items: content } : (content || {});
        const sections = [];
        const byTitle = new Map();
        const addTo = (title, item) => {
            const key = title || '';
            if (!byTitle.has(key)) {
                const section = { id: slug(key) || 'checks', title: key, items: [] };
                byTitle.set(key, section);
                sections.push(section);
            }
            byTitle.get(key).items.push(item);
        };
        let index = 0;
        if (Array.isArray(source.sections)) {
            source.sections.forEach(section => {
                const title = text(section.title || section.name || section.section);
                (section.items || section.checks || []).forEach(raw => addTo(title, normaliseItem(raw, index++)));
            });
        }
        (Array.isArray(source.items) ? source.items : Array.isArray(source.checks) ? source.checks : [])
            .forEach(raw => { const item = normaliseItem(raw, index++); addTo(item.section, item); });
        if (!index) throw new Error('Checklist has no items');

        const seen = new Map();
        const flat = [];
        sections.forEach(section => section.items.forEach(item => {
            const base = item.id;
            const count = (seen.get(base) || 0) + 1;
            seen.set(base, count);
            if (count > 1) item.id = base + '-' + count;
            item.no = flat.length + 1;
            item.sectionId = section.id;
            flat.push(item);
        }));
        return {
            tool: text(source.tool),
            title: text(source.title),
            intro: text(source.intro || source.lede),
            done: normaliseDone(source.done || source.finish),
            sections,
            items: flat,
            total: flat.length
        };
    }

    function progressLabel(done, total) {
        return done + ' of ' + total + ' done';
    }

    /** Ticks for items no longer in the content are ignored. */
    function summarise(model, ticks) {
        const t = ticks || {};
        const sections = model.sections.map(section => {
            const done = section.items.filter(item => t[item.id] === true).length;
            return { id: section.id, title: section.title, done, total: section.items.length };
        });
        const done = sections.reduce((sum, section) => sum + section.done, 0);
        const total = model.total;
        const next = model.items.find(item => t[item.id] !== true) || null;
        return {
            done, total,
            percent: total ? Math.round((done / total) * 100) : 0,
            complete: total > 0 && done === total,
            label: progressLabel(done, total),
            sections,
            next: next ? next.id : null
        };
    }

    /** Merge used when two devices both changed the ticks: keep every tick from both. */
    function mergeTicks(localData, remoteData) {
        const local = (localData && localData.ticks) || {};
        const remote = (remoteData && remoteData.ticks) || {};
        const ticks = {};
        Object.keys(remote).forEach(id => { if (remote[id] === true) ticks[id] = true; });
        Object.keys(local).forEach(id => { if (local[id] === true) ticks[id] = true; });
        return Object.assign({}, remoteData, localData, { ticks });
    }

    // ---------- DOM ----------
    function el(doc, tag, className, content) {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        if (content !== undefined) node.textContent = content;
        return node;
    }

    function link(doc, className, target) {
        const a = el(doc, 'a', className, target.label);
        a.href = target.href;
        if (target.external) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        return a;
    }

    /**
     * Render the checklist into `container` and keep it in step with `store` (an MSCArticleshipProgress store).
     * options: { store, numbers (default true), progress (default true), labels: { example }, onChange(summary) }
     * Returns { model, summary(), refresh(), destroy() }.
     */
    function mount(container, content, options) {
        const opts = options || {};
        const doc = container.ownerDocument || root.document;
        const model = normalise(content);
        const store = opts.store;
        const labels = Object.assign({ example: 'Example' }, opts.labels || {});
        const numbers = opts.numbers !== false;
        let ticks = Object.assign({}, (store && store.get().ticks) || {});

        container.textContent = '';
        container.classList.add('ap-checklist');
        if (!numbers) container.classList.add('no-numbers');

        let progress = null;
        if (opts.progress !== false) {
            progress = el(doc, 'div', 'ap-progress');
            progress.setAttribute('role', 'status');
            progress.setAttribute('aria-live', 'polite');
            const row = el(doc, 'div', 'ap-progress-text');
            row.appendChild(el(doc, 'span', 'ap-progress-count'));
            row.appendChild(el(doc, 'span', 'ap-progress-pct'));
            const bar = el(doc, 'div', 'ap-progress-bar');
            bar.appendChild(el(doc, 'span'));
            progress.appendChild(row);
            progress.appendChild(bar);
            container.appendChild(progress);
        }

        const inputs = new Map();
        const sectionCounts = new Map();
        model.sections.forEach(section => {
            const block = el(doc, 'section', 'ap-cl-section');
            block.dataset.section = section.id;
            if (section.title) {
                const heading = el(doc, 'h2', 'ap-cl-section-title');
                heading.appendChild(el(doc, 'span', '', section.title));
                const count = el(doc, 'span', 'ap-cl-count');
                heading.appendChild(count);
                sectionCounts.set(section.id, count);
                block.appendChild(heading);
            }
            const list = el(doc, 'ol', 'ap-cl-list');
            section.items.forEach(item => {
                const li = el(doc, 'li', 'ap-cl-item');
                li.dataset.id = item.id;
                const label = el(doc, 'label', 'ap-cl-check');
                const input = doc.createElement('input');
                input.type = 'checkbox';
                input.name = item.id;
                input.addEventListener('change', () => setTick(item.id, input.checked));
                label.appendChild(input);
                label.appendChild(el(doc, 'span', 'ap-cl-box'));
                if (numbers) label.appendChild(el(doc, 'span', 'ap-cl-no', String(item.no)));
                label.appendChild(el(doc, 'span', 'ap-cl-text', item.check));
                li.appendChild(label);
                if (item.why) li.appendChild(el(doc, 'p', 'ap-cl-why', item.why));
                if (item.example || item.fix) {
                    const extra = el(doc, 'div', 'ap-cl-extra');
                    if (item.example) {
                        const details = el(doc, 'details', 'ap-cl-example');
                        details.appendChild(el(doc, 'summary', '', labels.example));
                        details.appendChild(el(doc, 'p', '', item.example));
                        extra.appendChild(details);
                    }
                    if (item.fix) extra.appendChild(link(doc, 'ap-cl-fix', item.fix));
                    li.appendChild(extra);
                }
                inputs.set(item.id, { input, li });
                list.appendChild(li);
            });
            block.appendChild(list);
            container.appendChild(block);
        });

        let doneBlock = null;
        if (model.done) {
            doneBlock = el(doc, 'div', 'ap-cl-done ap-hidden');
            if (model.done.title) doneBlock.appendChild(el(doc, 'h2', '', model.done.title));
            if (model.done.text) doneBlock.appendChild(el(doc, 'p', '', model.done.text));
            if (model.done.links.length) {
                const links = el(doc, 'div', 'ap-cl-done-links');
                model.done.links.forEach((target, i) => links.appendChild(link(doc, 'ap-btn' + (i ? ' is-secondary' : ''), target)));
                doneBlock.appendChild(links);
            }
            container.appendChild(doneBlock);
        }

        function paint() {
            const summary = summarise(model, ticks);
            inputs.forEach(({ input, li }, id) => {
                const on = ticks[id] === true;
                input.checked = on;
                li.classList.toggle('is-done', on);
            });
            summary.sections.forEach(section => {
                const count = sectionCounts.get(section.id);
                if (count) count.textContent = section.done + '/' + section.total;
            });
            if (progress) {
                progress.querySelector('.ap-progress-count').textContent = summary.label;
                progress.querySelector('.ap-progress-pct').textContent = summary.percent + '%';
                progress.querySelector('.ap-progress-bar > span').style.width = summary.percent + '%';
                progress.classList.toggle('is-complete', summary.complete);
            }
            if (doneBlock) doneBlock.classList.toggle('ap-hidden', !summary.complete);
            return summary;
        }

        function changed() {
            const summary = paint();
            if (typeof opts.onChange === 'function') opts.onChange(summary);
            return summary;
        }

        function setTick(id, on) {
            if (!inputs.has(id)) return null;
            const next = Object.assign({}, ticks);
            if (on) next[id] = true; else delete next[id];
            if (store) {
                // The store tells every subscriber (this list included), so the page repaints once.
                store.update(data => { data.ticks = next; return data; });
                return summarise(model, ticks);
            }
            ticks = next;
            return changed();
        }

        const unsubscribe = store ? store.subscribe(data => {
            ticks = Object.assign({}, (data && data.ticks) || {});
            changed();
        }) : null;

        paint();
        return {
            model,
            summary: () => summarise(model, ticks),
            refresh: paint,
            tick: setTick,
            destroy() { if (unsubscribe) unsubscribe(); }
        };
    }

    return Object.freeze({ normalise, summarise, progressLabel, mergeTicks, safeHref, mount });
});
