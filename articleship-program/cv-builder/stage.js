/**
 * MSC Articleship Program: the CV Builder's articleship stage (row 1.5) on /cv-builder/?stage=articleship.
 *
 * The page stays the CV Builder (form, preview, Word and PDF export). This file adds, for the articleship stage only:
 * - the panel on top of the form: order (structure A–H) and design chosen separately, both from the CV Recommender's
 *   pick on open (or from ?design=N, with &example=1 for that design's filled-in applicant: CV templates links here); "Start from the example" and "The Nothing CV"; the certificate count and the earned Work Simulation
 *   lines; the live checks;
 * - the design picker: the look-book's designs by number ("Designs", filtered by order or Portal-safe) and all 62
 *   layouts ("All");
 * - the thumbnails: an untouched CV shows each design with its own fictional applicant; a kept design brings its own
 *   font and colour unless the student picked theirs;
 * - the export: the programme's header and footer lines stay on the preview, never on the CV a firm receives
 *   (V3-STRUCTURE decision 2).
 * Pure logic: scripts/articleship-cv-builder.js. cv-script.js calls window.MSCArticleshipStage.* behind optional chaining.
 *
 * Release switch: MSCArticleshipProgress.WORK_SIMULATION_LIVE (the one flag every tool reads). While false (release 1),
 * nothing here names or offers the Work Simulation: no earned lines read, queued or offered, no "Earn a line" link, no
 * Work Simulation gap on the blank CV, and the applicants (starters, thumbnails) come without their Work Simulation
 * lines. Release 2 flips the shared flag and every part is back.
 */
(function () {
    'use strict';

    const logic = window.MSCArticleshipCvBuilder;
    const progress = window.MSCArticleshipProgress;
    if (!logic) return;
    // The shared release switch (articleship-progress.js); the logic module's copy when the platform is missing.
    const WS_LIVE = progress ? progress.WORK_SIMULATION_LIVE === true : logic.WORK_SIMULATION_LIVE === true;
    const RELEASE = Object.freeze({ workSimulationLive: WS_LIVE });

    const BASE = '/articleship-program/cv-builder/';
    const LINKS = {
        recommender: '/articleship-program/cv-recommender/',
        // The Work Simulation page once the shared situations list names it; until then its Day in the course (row 1.6).
        workSimulation: '/learning-management-system/course?course=msc-articleship-program&session=2',
        checklist: '/articleship-program/cv-checklist/',
        // Day 1 in the course, where the CV Builder's row (1.5) sits.
        programme: '/learning-management-system/course?course=msc-articleship-program&session=2'
    };
    const params = new URLSearchParams(window.location.search);
    const state = {
        host: null,
        designs: [],
        examples: {},
        applicants: {},
        situations: logic.SITUATIONS,
        tab: 'designs',
        filter: 'all',
        panelOpen: null,
        showAllChecks: false,
        earned: [],
        freshBlank: false,
        refreshTimer: null
    };

    const getJson = url => fetch(url, { cache: 'no-cache' }).then(res => (res.ok ? res.json() : null)).catch(() => null);
    // Fetched the first time the articleship view opens, so the normal CV Builder never downloads the programme's data.
    let dataReady = null;
    const loadData = () => dataReady || (dataReady = Promise.all([getJson(BASE + 'designs.json'), getJson(BASE + 'examples.json'), getJson(LINKS.recommender + 'situations.json')]));

    // ---------- small DOM helpers ----------
    function h(tag, attrs, children) {
        const el = document.createElement(tag);
        Object.entries(attrs || {}).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) return;
            if (key === 'class') el.className = value;
            else if (key === 'text') el.textContent = value;
            else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
            else el.setAttribute(key, value === true ? '' : value);
        });
        [].concat(children || []).forEach(child => {
            if (child === null || child === undefined || child === false) return;
            el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
        });
        return el;
    }

    function isActive() {
        if (params.get('stage') === 'articleship') return true;
        return Boolean(state.host && state.host.collection() === 'articleship');
    }

    function cv() { return state.host ? state.host.getCv() : {}; }

    function pick() {
        try { return progress && progress.getCvPick ? progress.getCvPick() : null; } catch (_) { return null; }
    }

    function currentDesign() {
        return logic.designForFile(state.designs, state.host && state.host.templateFile());
    }

    function currentStructure() {
        const data = cv();
        return logic.getSituation(data.articleshipStructure, state.situations) || null;
    }

    function galleryLayouts() {
        return state.host ? state.host.gallery() : [];
    }

    // ---------- hooks called by cv-script.js ----------

    /** A new student's first CV: the blank articleship CV (every gap a [bracket]) on the first design. */
    function blankCv(current, tableSettings) {
        state.freshBlank = true;
        const p = pick();
        const out = logic.createBlank(current, { structure: (p && p.situation) || 'A', order: p && p.order, situations: state.situations, workSimulationLive: WS_LIVE });
        out.templateFile = 'articleship-layout-classic';
        out.tableSettings = JSON.parse(JSON.stringify(tableSettings || {}));
        return out;
    }

    /** Thumbnails: while the CV is an untouched blank, each design shows its own applicant (as in the look-book). */
    function previewSource(templateFile) {
        if (!isActive() || !Object.keys(state.examples).length) return null;
        const data = cv();
        if (logic.untouchedStarter(data, state.examples, state.designs) !== 'blank') return null;
        const design = logic.designForFile(state.designs, templateFile);
        const letter = logic.personaFor(design, currentStructure() ? currentStructure().id : 'A');
        const example = logic.createExample(state.examples, letter, data, { design, situations: state.situations });
        if (!example) return null;
        example.templateFile = templateFile;
        return example;
    }

    /** A kept design's own font and colour on the page and in the export, unless the student picked theirs. */
    function theme(templateFile, payload) {
        if (!isActive() || !payload) return;
        const design = logic.designForFile(state.designs, templateFile);
        if (!design) return;
        const set = logic.themeFor(cv(), design);
        payload.themeFont = set.font;
        payload.themeAccent = set.accent;
    }

    function layoutName(templateFile) {
        const design = logic.designForFile(state.designs, templateFile);
        return design ? `Design ${design.number} · ${design.name}` : null;
    }

    /** The CV a firm receives carries no programme header or footer (decision 2); the preview keeps them. */
    function exportHtml(doc) {
        if (!doc || !doc.documentElement || !doc.querySelector('[data-msc-program-brand]')) return null;
        const copy = doc.documentElement.cloneNode(true);
        copy.querySelectorAll('[data-msc-program-brand]').forEach(el => el.remove());
        return copy.outerHTML;
    }

    // ---------- applying things to the CV ----------

    function commit(next, message, templateFile) {
        const keep = keepPlace();
        state.host.setCv(next, { templateFile });
        if (message) state.host.toast(message);
        render();
        keep();
    }

    /**
     * Redrawing the form puts new text into its rich-text boxes, which takes the focus and scrolls the page to the last
     * one. Keep the student where they tapped: same scroll position, no box focused that they did not focus.
     */
    function keepPlace() {
        const saved = [];
        for (let el = panel && panel.parentElement; el; el = el.parentElement) saved.push([el, el.scrollTop]);
        if (document.scrollingElement) saved.push([document.scrollingElement, document.scrollingElement.scrollTop]);
        const focused = document.activeElement;
        const restore = () => {
            saved.forEach(([el, top]) => { if (el.scrollTop !== top) el.scrollTop = top; });
            const now = document.activeElement;
            if (now && now !== focused && now.closest && now.closest('.ql-editor')) now.blur();
        };
        return () => {
            restore();
            [60, 200, 450].forEach(ms => setTimeout(restore, ms));
        };
    }

    function useDesign(design, quiet) {
        if (!design) return;
        if (state.host.templateFile() === design.file) { render(); return; }
        if (state.host.isLocked(design.file)) { state.host.choose(design.file, design.name); return; }
        state.host.useTemplate(design.file);
        if (!quiet) state.host.toast(`Design ${design.number} on. Your text is unchanged.`);
        render();
    }

    /** An order on the CV; a blank CV still untouched is redrawn for it (its lead block shown), the design kept. */
    function withOrder(data, situationId, order) {
        const options = { order, situations: state.situations, workSimulationLive: WS_LIVE };
        if (logic.untouchedStarter(data, state.examples, state.designs) === 'blank') {
            return logic.createBlank(data, Object.assign({ structure: situationId }, options));
        }
        return logic.applyStructure(data, situationId, options);
    }

    function applyOrder(situationId) {
        const p = pick();
        const next = withOrder(cv(), situationId, p && p.situation === situationId ? p.order : null);
        next.articleshipOrderSet = true;
        state.panelOpen = null;
        commit(next, `Order ${situationId} on. Your design and text are unchanged.`);
    }

    function hasOwnWriting() {
        return logic.untouchedStarter(cv(), state.examples, state.designs) === null;
    }

    function confirmReplace(what) {
        if (!hasOwnWriting()) return true;
        return window.confirm(`Replace what you have written with ${what}? Undo brings it back.`);
    }

    /**
     * The design's applicant. Set in the student's order once they have one (the Recommender's pick or a tap on an
     * order); otherwise in the applicant's own order, as the look-book shows it.
     */
    function startExample() {
        const design = currentDesign();
        const data = cv();
        const structure = data.articleshipOrderSet || data.articleshipPickApplied ? currentStructure() : null;
        const letter = logic.personaFor(design, structure ? structure.id : 'A');
        if (!confirmReplace('the example')) return;
        const p = pick();
        const next = logic.createExample(state.examples, letter, data, {
            design,
            structure: structure ? structure.id : undefined,
            order: p && structure && p.situation === structure.id ? p.order : null,
            situations: state.situations
        });
        if (!next) return;
        commit(next, 'Example loaded. Make every line your own.');
    }

    function startNothing() {
        if (!confirmReplace('The Nothing CV')) return;
        const next = logic.createNothingCv(state.examples, cv(), { situations: state.situations });
        if (!next) return;
        commit(next, 'The Nothing CV loaded. Make every line your own.');
    }

    function newLines() {
        const data = cv();
        const done = new Set((data.articleshipImported || []).map(line => String(line).toLowerCase()));
        const on = new Set((data.certifications || []).map(item => logic.plainText(item && typeof item === 'object' ? item.name : item).toLowerCase()));
        return state.earned.filter(item => !on.has(item.line.toLowerCase()) && !done.has(item.line.toLowerCase()));
    }

    function addLines(lines, quietIfNone) {
        if (!lines.length) { if (!quietIfNone) state.host.toast('Those lines are already on your CV.'); return; }
        const result = logic.importEarnedLines(cv(), lines.map(item => item.line));
        const next = result.cv;
        next.articleshipImported = Array.from(new Set([...(next.articleshipImported || []), ...lines.map(item => item.line)]));
        const word = result.added === 1 ? 'line' : 'lines';
        const capNote = result.counts.over ? ` You have ${result.counts.outside} outside certificates: keep your best ${logic.OUTSIDE_CAP}.` : '';
        commit(next, `Added ${result.added} Work Simulation ${word} to "${logic.CERT_TITLE}".${capNote}`);
        openCertificationsEditor();
    }

    function openCertificationsEditor() {
        const details = document.querySelector('details[data-section="certifications"]');
        if (details) details.open = true;
    }

    function useCompleted() {
        commit(logic.useCompletedLine(cv()), 'Programme line updated.');
    }

    // ---------- Work Simulation lines ----------

    function readEarned() {
        if (!WS_LIVE || !progress || !progress.open) return [];
        try {
            const store = progress.open('work-simulation', { defaults: {} });
            return logic.readEarnedLines(store.get());
        } catch (_) {
            return [];
        }
    }

    /** Lines the student sent with "Add to my CV" arrive by themselves, once each. */
    function importQueued() {
        if (!WS_LIVE || !progress || !progress.open) return;
        let queued = [];
        try {
            const data = progress.open('work-simulation', { defaults: {} }).get();
            queued = logic.readEarnedLines({ cvQueue: data && (data.cvQueue || data.addToCv) });
        } catch (_) { queued = []; }
        const queuedSet = new Set(queued.map(item => item.line.toLowerCase()));
        const fresh = newLines().filter(item => queuedSet.has(item.line.toLowerCase()));
        if (fresh.length) addLines(fresh, true);
    }

    // ---------- the panel ----------

    let panel = null;

    function ensurePanel() {
        if (panel && document.body.contains(panel)) return panel;
        const content = document.querySelector('.editor-content');
        if (!content) return null;
        panel = h('section', { class: 'asb', id: 'articleship-stage', 'aria-label': 'Articleship CV' });
        content.insertBefore(panel, content.firstChild);
        return panel;
    }

    function row(key, label, value, extra, onClick, expanded) {
        return h('button', {
            type: 'button', class: 'asb-row', 'data-row': key, 'aria-expanded': expanded === undefined ? null : String(expanded), onclick: onClick
        }, [
            h('span', { class: 'asb-row-k', text: label }),
            h('span', { class: 'asb-row-v' }, [value, extra || null]),
            h('span', { class: 'asb-row-go', text: 'Change' })
        ]);
    }

    function renderPick(p) {
        if (p) {
            const design = logic.resolveDesign(state.designs, p.design);
            const bits = [`order ${p.situation}`];
            if (design) bits.push(`design ${design.number}`);
            return h('p', { class: 'asb-note' }, [`From your CV Recommender: ${bits.join(', ')}. `,
                h('a', { href: LINKS.recommender, class: 'asb-link', text: 'Redo it' })]);
        }
        return h('p', { class: 'asb-note' }, ['Not sure which order? ',
            h('a', { href: LINKS.recommender, class: 'asb-link', text: 'CV Recommender' }), ' picks it in a minute.']);
    }

    function renderOrders(structure, p) {
        return h('div', { class: 'asb-orders', role: 'list' }, state.situations.map(situation => h('button', {
            type: 'button',
            role: 'listitem',
            class: 'asb-order' + (structure && structure.id === situation.id ? ' is-on' : ''),
            'aria-pressed': String(Boolean(structure && structure.id === situation.id)),
            onclick: () => applyOrder(situation.id)
        }, [
            h('span', { class: 'asb-order-id', text: situation.id }),
            h('span', { class: 'asb-order-name', text: situation.name }),
            p && p.situation === situation.id ? h('span', { class: 'asb-badge', text: 'Your pick' }) : null
        ])));
    }

    function renderCertificates(data) {
        const counts = logic.countCertificates(data.certifications);
        const lines = newLines();
        const line = logic.programLine(data);
        const box = h('div', { class: 'asb-certs' + (counts.over ? ' is-over' : '') }, [
            h('h3', { class: 'asb-h3', text: 'Certifications and job simulations' }),
            h('p', { class: 'asb-count' }, [
                h('strong', { text: `${counts.outside} of ${logic.OUTSIDE_CAP}` }),
                ' outside certificates',
                counts.over ? h('span', { class: 'asb-warn', text: ` · keep your best ${logic.OUTSIDE_CAP}` }) : ' · MSC lines don\'t count'
            ])
        ]);
        if (lines.length) {
            box.appendChild(h('button', {
                type: 'button', class: 'asb-btn is-secondary is-block', 'data-action': 'add-lines', onclick: () => addLines(newLines())
            }, `Add ${lines.length} Work Simulation line${lines.length === 1 ? '' : 's'}`));
        } else if (WS_LIVE && !counts.mscSimulation) {
            box.appendChild(h('p', { class: 'asb-note' }, ['Earn a line with your own counts in ',
                h('a', { href: LINKS.workSimulation, class: 'asb-link', text: 'Work Simulation' }), '.']));
        }
        if (line === 'ongoing') {
            box.appendChild(h('button', { type: 'button', class: 'asb-textbtn', 'data-action': 'completed-line', onclick: useCompleted },
                'Finished the programme? Use the completed line'));
        }
        return box;
    }

    function renderChecks(data) {
        const flags = logic.checkCv(data, { examples: state.applicants, overflow: state.host.overflow && state.host.overflow(), workSimulationLive: WS_LIVE });
        const wrap = h('div', { class: 'asb-checks' });
        if (!flags.length) {
            wrap.appendChild(h('p', { class: 'asb-ok' }, ['No flags. Next: ',
                h('a', { href: LINKS.checklist, class: 'asb-link', text: 'CV checklist' }), '.']));
            return wrap;
        }
        const shown = state.showAllChecks ? flags : flags.slice(0, 3);
        wrap.appendChild(h('h3', { class: 'asb-h3' }, ['Fix before you send ', h('span', { class: 'asb-count-pill', text: String(flags.length) })]));
        wrap.appendChild(h('ul', { class: 'asb-flags' }, shown.map(flag => h('li', { 'data-flag': flag.id, text: flag.text }))));
        if (flags.length > shown.length) {
            wrap.appendChild(h('button', { type: 'button', class: 'asb-textbtn', onclick: () => { state.showAllChecks = true; render(); } },
                `Show all ${flags.length}`));
        }
        return wrap;
    }

    const COLLAPSE_KEY = 'msc.articleship.cv-builder.panel';

    function isCollapsed() {
        try { return window.localStorage.getItem(COLLAPSE_KEY) === 'closed'; } catch (_) { return false; }
    }

    function setCollapsed(closed) {
        try { window.localStorage.setItem(COLLAPSE_KEY, closed ? 'closed' : 'open'); } catch (_) { /* per-viewer convenience only */ }
        render();
    }

    function renderStarters(untouched, exampleName) {
        if (untouched) {
            // A starter on screen (or nothing yet): both starters as buttons, the example as the main one while blank.
            return h('div', { class: 'asb-start' }, [
                h('button', { type: 'button', class: 'asb-btn' + (untouched === 'blank' ? '' : ' is-secondary'), 'data-action': 'example', onclick: startExample }, [
                    'Start from the example',
                    exampleName ? h('span', { class: 'asb-btn-sub', text: exampleName }) : null
                ]),
                h('button', { type: 'button', class: 'asb-btn is-secondary', 'data-action': 'nothing', onclick: startNothing }, [
                    'The Nothing CV', h('span', { class: 'asb-btn-sub', text: 'Nothing on it yet?' })
                ])
            ]);
        }
        // The student has written their own: the starters stay, as one quiet line.
        return h('p', { class: 'asb-note asb-restart' }, ['Start again: ',
            h('button', { type: 'button', class: 'asb-textbtn', 'data-action': 'example', onclick: startExample }, 'the example'),
            ' · ',
            h('button', { type: 'button', class: 'asb-textbtn', 'data-action': 'nothing', onclick: startNothing }, 'The Nothing CV')]);
    }

    function render() {
        if (!state.host || !isActive()) return;
        const el = ensurePanel();
        if (!el) return;
        document.body.classList.add('asb-on');
        const data = cv();
        const p = pick();
        const structure = currentStructure();
        const design = currentDesign();
        const templateName = (document.getElementById('current-template-name') || {}).textContent || '';
        const untouched = logic.untouchedStarter(data, state.examples, state.designs);
        const exampleLetter = logic.personaFor(design, structure ? structure.id : 'A');
        const exampleSource = (design && design.example) || state.examples[exampleLetter];
        const exampleName = exampleSource && exampleSource.personal ? logic.plainText(exampleSource.personal.name) : '';
        const collapsed = isCollapsed();
        const designText = design ? `No. ${design.number} · ${design.name}` : (templateName || 'Choose one');

        const head = h('div', { class: 'asb-head' }, [
            h('a', { class: 'asb-back', href: LINKS.programme, text: 'MSC Articleship Program' }),
            h('div', { class: 'asb-head-row' }, [
                h('h2', { class: 'asb-title' }, ['Your ', h('span', { class: 'asb-mark', text: 'articleship' }), ' CV']),
                h('button', {
                    type: 'button', class: 'asb-fold', 'aria-expanded': String(!collapsed), 'aria-controls': 'asb-body',
                    'aria-label': collapsed ? 'Show the articleship panel' : 'Hide the articleship panel', onclick: () => setCollapsed(!collapsed)
                })
            ])
        ]);
        if (collapsed) {
            const flags = logic.checkCv(data, { examples: state.applicants, workSimulationLive: WS_LIVE });
            el.classList.add('is-folded');
            el.replaceChildren(head, h('p', { class: 'asb-note asb-folded-line', text:
                `Order ${structure ? structure.id : '–'} · ${designText}${flags.length ? ` · ${flags.length} to fix` : ''}` }));
            relabelCertificationsEditor();
            return;
        }
        el.classList.remove('is-folded');
        const children = [
            head,
            h('div', { id: 'asb-body' }, [
                renderPick(p),
                h('div', { class: 'asb-rows' }, [
                    row('order', 'Order', structure ? `${structure.id} · ${structure.name}` : 'Choose one', null,
                        () => { state.panelOpen = state.panelOpen === 'order' ? null : 'order'; render(); }, state.panelOpen === 'order'),
                    state.panelOpen === 'order' ? renderOrders(structure, p) : null,
                    row('design', 'Design', designText,
                        design && design.tag ? tagEl(design) : null,
                        () => { state.tab = 'designs'; state.host.openTemplates(); })
                ]),
                renderStarters(untouched, exampleName),
                renderCertificates(data),
                renderChecks(data)
            ])
        ];
        el.replaceChildren(...children);
        relabelCertificationsEditor();
    }

    function relabelCertificationsEditor() {
        const summary = document.querySelector('details[data-section="certifications"] > summary > span');
        if (summary && summary.textContent !== logic.CERT_TITLE) summary.textContent = logic.CERT_TITLE;
        const title = document.getElementById('inp-title-certifications');
        if (title) title.placeholder = `Default: ${logic.CERT_TITLE}`;
    }

    // ---------- the design picker ----------

    function tagEl(design) {
        return h('span', { class: 'asb-tag' + (design.portalSafe ? ' is-portal' : '') + (design.screen ? ' is-screen' : ''), text: design.tag });
    }

    /** The chips over the Designs tab: every design, the ones for the student's order, the Portal-safe ones. */
    function designFilters(structure) {
        const forOrder = structure ? logic.designsFor(state.designs, structure.id) : [];
        const portal = state.designs.filter(design => design.portalSafe);
        const chips = [{ id: 'all', label: `All ${state.designs.length}` }];
        if (forOrder.length) chips.push({ id: 'order', label: `For order ${structure.id}`, count: forOrder.length });
        if (portal.length) chips.push({ id: 'portal', label: 'Portal-safe', count: portal.length });
        if (!chips.some(chip => chip.id === state.filter)) state.filter = 'all';
        const items = state.filter === 'order' ? forOrder : (state.filter === 'portal' ? portal : state.designs);
        return { chips, items };
    }

    function renderTemplateCards(grid, currentTemplate) {
        if (!isActive() || !state.designs.length) return false;
        const sidebar = document.getElementById('template-sidebar');
        const collection = document.getElementById('template-collection');
        if (collection && collection.parentElement) collection.parentElement.hidden = true;
        let tabs = document.getElementById('asb-tabs');
        if (!tabs && sidebar) {
            tabs = h('div', { id: 'asb-tabs', class: 'asb-tabs', role: 'tablist' });
            sidebar.insertBefore(tabs, grid);
        }
        let filters = document.getElementById('asb-filters');
        if (!filters && sidebar) {
            filters = h('div', { id: 'asb-filters', class: 'asb-filters' });
            sidebar.insertBefore(filters, grid);
        }
        const all = galleryLayouts();
        const header = sidebar && sidebar.querySelector('.template-sidebar-header h3');
        if (header) header.textContent = 'Choose a design';
        if (tabs) {
            tabs.replaceChildren(
                h('button', { type: 'button', role: 'tab', class: 'asb-tab' + (state.tab === 'designs' ? ' is-on' : ''), 'aria-selected': String(state.tab === 'designs'),
                    onclick: () => { state.tab = 'designs'; state.host.renderCards(); } }, `Designs (${state.designs.length})`),
                h('button', { type: 'button', role: 'tab', class: 'asb-tab' + (state.tab === 'all' ? ' is-on' : ''), 'aria-selected': String(state.tab === 'all'),
                    onclick: () => { state.tab = 'all'; state.host.renderCards(); } }, `All ${all.length}`)
            );
        }
        const view = designFilters(currentStructure());
        if (filters) {
            filters.hidden = state.tab !== 'designs';
            filters.replaceChildren(
                h('div', { class: 'asb-chips', role: 'group', 'aria-label': 'Show' }, view.chips.map(chip => h('button', {
                    type: 'button', class: 'asb-chip' + (state.filter === chip.id ? ' is-on' : ''), 'aria-pressed': String(state.filter === chip.id),
                    'data-filter': chip.id, onclick: () => { state.filter = chip.id; state.host.renderCards(); }
                }, [chip.label, chip.count ? h('span', { class: 'asb-chip-n', text: String(chip.count) }) : null]))),
                h('p', { class: 'asb-legend' }, [
                    h('span', { class: 'asb-tag', text: 'Print' }), ' mail and walk-ins ',
                    h('span', { class: 'asb-tag is-portal', text: 'Portal-safe' }), ' careers portals ',
                    h('span', { class: 'asb-tag is-screen', text: 'Screen' }), ' send as a PDF'
                ])
            );
        }
        const p = pick();
        const pickDesign = p ? logic.resolveDesign(state.designs, p.design) : null;
        const items = state.tab === 'all'
            ? all.map(layout => {
                const kept = logic.designForFile(state.designs, layout.file);
                return { file: layout.file, renderFile: layout.renderFile, title: kept ? kept.name : layout.name, design: kept };
            })
            : view.items.map(design => ({ file: design.file, renderFile: design.renderFile, title: design.name, design }));
        grid.classList.toggle('asb-grid', state.tab === 'designs');
        grid.replaceChildren(...items.map(item => {
            const locked = state.host.isLocked(item.file);
            const design = item.design;
            const label = design ? logic.bestForLabel(design) : '';
            const card = h('div', {
                class: 'template-card asb-card' + (item.file === currentTemplate ? ' active' : '') + (locked ? ' locked' : ''),
                role: 'button', tabindex: '0', 'data-file': item.file, 'data-number': design ? String(design.number) : null,
                'aria-label': design ? `Design ${design.number}, ${design.name}, ${design.tag}` : item.title
            }, [
                h('div', { class: 'template-card-preview' }, [
                    h('iframe', { 'data-src': item.renderFile, 'data-template': item.file, title: item.title, tabindex: '-1' }),
                    h('div', { class: 'template-loading asb-loading', text: 'Loading…' }),
                    locked ? h('div', { class: 'template-lock-scrim' }) : null,
                    locked ? h('div', { class: 'template-premium-badge', text: 'PREMIUM' }) : null
                ]),
                h('div', { class: 'template-card-name asb-card-name' }, [
                    design ? h('span', { class: 'asb-no', text: `No. ${design.number}` }) : null,
                    h('span', { class: 'asb-card-title', text: item.title }),
                    design && design.tag ? tagEl(design) : null,
                    pickDesign && design && pickDesign.number === design.number ? h('span', { class: 'asb-badge', text: 'Your pick' }) : null
                ]),
                state.tab === 'designs' && design && design.line ? h('p', { class: 'asb-card-line' }, [
                    label ? h('span', { class: 'asb-card-for', text: label }) : null,
                    h('span', { class: 'asb-card-rest', text: label ? design.line.slice(label.length + 1).trim() : design.line })
                ]) : null
            ]);
            const choose = () => {
                if (design && !locked) { useDesign(design); state.host.closeTemplates(); return; }
                state.host.choose(item.file, design ? `No. ${design.number} ${design.name}` : item.title);
                render();
            };
            card.addEventListener('click', choose);
            card.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(); } });
            return card;
        }));
        return true;
    }

    /** The toolbar and the hidden select say the look-book number for a kept design. */
    function relabelOptions() {
        const select = document.getElementById('template-select');
        if (!select) return;
        state.designs.forEach(design => {
            const option = Array.from(select.options).find(item => item.value === design.file);
            if (option) option.textContent = `No. ${design.number} ${design.name}`;
        });
        state.host.syncName();
    }

    // ---------- start-up ----------

    function scheduleRender() {
        if (state.refreshTimer) clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(() => { state.refreshTimer = null; render(); }, 250);
    }

    function useAccountClient() {
        // The CV Builder makes its own Supabase client (window.mscSupabase); let the progress engine read the pick and
        // the Work Simulation lines saved on the student's other devices through it.
        if (typeof window.getSupabaseClient !== 'function' && !window.supabaseClient) {
            window.getSupabaseClient = () => window.mscSupabase || null;
        }
        const pullAll = () => {
            if (!progress || !progress.open) return;
            try { progress.settings().pull().then(scheduleRender, () => {}); } catch (_) { /* local only */ }
            if (!WS_LIVE) return;
            try { progress.open('work-simulation', { defaults: {} }).pull().then(() => { state.earned = readEarned(); importQueued(); scheduleRender(); }, () => {}); } catch (_) { /* local only */ }
        };
        if (window.mscSupabase) pullAll();
        window.addEventListener('msc-supabase-ready', pullAll, { once: true });
    }

    /**
     * Put the suggested design on, once the builder knows whether the student may use it (premium layouts unlock with
     * an MSC enrolment, checked after load). Never overrides a design the student picked in the meantime.
     */
    async function openOnDesign(design, startFile) {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        // The builder marks access "checked" as soon as it sees a session, before the enrolment lookup answers, so wait
        // for the lock itself to lift (or give up after a while: a student without access keeps the free design).
        for (let waited = 0; state.host.isLocked(design.file) && waited < 15000; waited += 250) {
            if (state.host.templateFile() !== startFile) return;
            await sleep(250);
        }
        if (state.host.isLocked(design.file) || state.host.templateFile() !== startFile) return;
        if (state.host.templateFile() !== design.file) state.host.useTemplate(design.file);
        render();
    }

    async function init(host) {
        state.host = host;
        if (!isActive()) return;
        document.body.classList.add('asb-on');
        const [designsJson, examplesRaw, situationsJson] = await loadData();
        // The applicants as this release shows them (release 1: without their Work Simulation lines).
        const examplesJson = logic.releaseExamples ? logic.releaseExamples(examplesRaw, RELEASE) : examplesRaw;
        state.situations = situationsJson ? logic.mergeSituations(situationsJson) : logic.SITUATIONS;
        if (situationsJson && situationsJson.links && typeof situationsJson.links.workSimulation === 'string'
            && situationsJson.links.workSimulation.startsWith('/')) LINKS.workSimulation = situationsJson.links.workSimulation;
        state.designs = logic.attachApplicants(logic.normaliseDesigns(designsJson, galleryLayouts()), examplesJson);
        state.examples = logic.normaliseExamples(examplesJson);
        state.applicants = logic.allApplicants(state.examples, state.designs);
        state.earned = readEarned();
        relabelOptions();

        const p = pick();
        const plan = logic.planPick(p, state.designs, cv());
        let design = null;
        if (plan && plan.apply) {
            const next = withOrder(cv(), plan.situation, plan.order);
            next.articleshipPickApplied = plan.key;
            state.host.setCv(next);
            state.host.toast('Opened with your CV Recommender pick.');
            design = plan.design;
        } else if (state.freshBlank) {
            design = state.designs[0] || null;
        }
        // A link from CV templates (row 1.4): ?design=N opens on that design; &example=1 also fills in its applicant,
        // so a student on a phone sees the full-size CV the look-book shows in small.
        const linked = logic.resolveDesign(state.designs, params.get('design'));
        if (linked) design = linked;
        importQueued();
        render();
        useAccountClient();
        if (design) {
            openOnDesign(design, state.host.templateFile()).then(() => {
                if (linked && params.get('example') === '1' && currentDesign() === linked) startExample();
            });
        }

        if (progress && progress.onSettingsChange) progress.onSettingsChange(() => scheduleRender());
        if (WS_LIVE) {
            try {
                progress.open('work-simulation', { defaults: {} }).subscribe(() => { state.earned = readEarned(); scheduleRender(); });
            } catch (_) { /* no Work Simulation data on this device */ }
        }
    }

    window.MSCArticleshipStage = Object.freeze({
        isActive,
        init: host => { init(host).catch(error => { if (window.console) window.console.error(error); }); },
        blankCv,
        previewSource,
        theme,
        layoutName,
        exportHtml,
        renderTemplateCards,
        onChange: () => { if (state.host && isActive()) scheduleRender(); },
        // For tests and debugging only.
        _state: state
    });
})();
