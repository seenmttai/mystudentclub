/**
 * MSC Articleship Program: the CV Builder's articleship stage (row 1.5) on /cv-builder/?stage=articleship.
 *
 * The page stays the CV Builder (form, preview, Word and PDF export). This file adds, for the articleship stage only:
 * - the panel on top of the form: order (structure A–H) and design chosen separately, both from the CV Recommender's
 *   pick on open; "Start from the example" and "The Nothing CV"; the certificate count and the earned Work Simulation
 *   lines; the live checks;
 * - the design picker: the look-book's designs by number ("Designs") and all 62 layouts ("All");
 * - the thumbnails: an untouched CV shows each design with its own fictional applicant;
 * - the export: the programme's header and footer lines stay on the preview, never on the CV a firm receives
 *   (V3-STRUCTURE decision 2).
 * Pure logic: scripts/articleship-cv-builder.js. cv-script.js calls window.MSCArticleshipStage.* behind optional chaining.
 */
(function () {
    'use strict';

    const logic = window.MSCArticleshipCvBuilder;
    const progress = window.MSCArticleshipProgress;
    if (!logic) return;

    const BASE = '/articleship-program/cv-builder/';
    const LINKS = {
        recommender: '/articleship-program/cv-recommender/',
        workSimulation: '/articleship-program/work-simulation/',
        checklist: '/articleship-program/cv-checklist/',
        programme: '/learning-management-system/course?course=msc-articleship-program'
    };
    const params = new URLSearchParams(window.location.search);
    const state = {
        host: null,
        designs: [],
        examples: {},
        situations: logic.SITUATIONS,
        tab: 'designs',
        panelOpen: null,
        showAllChecks: false,
        earned: [],
        freshBlank: false,
        refreshTimer: null
    };

    const getJson = url => fetch(url, { cache: 'no-cache' }).then(res => (res.ok ? res.json() : null)).catch(() => null);
    const dataReady = Promise.all([getJson(BASE + 'designs.json'), getJson(BASE + 'examples.json'), getJson(LINKS.recommender + 'situations.json')]);

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
        const out = logic.createBlank(current, { structure: (pick() && pick().situation) || 'A', order: pick() && pick().order });
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
        state.host.setCv(next, { templateFile });
        if (message) state.host.toast(message);
        render();
    }

    function useDesign(design, quiet) {
        if (!design) return;
        if (state.host.templateFile() === design.file) { render(); return; }
        if (state.host.isLocked(design.file)) { state.host.choose(design.file, design.name); return; }
        state.host.useTemplate(design.file);
        if (!quiet) state.host.toast(`Design ${design.number} on. Your text is unchanged.`);
        render();
    }

    function applyOrder(situationId) {
        const p = pick();
        const next = logic.applyStructure(cv(), situationId, {
            order: p && p.situation === situationId ? p.order : null,
            situations: state.situations
        });
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

    function startExample() {
        const design = currentDesign();
        const structure = currentStructure();
        const letter = logic.personaFor(design, structure ? structure.id : 'A');
        if (!confirmReplace('the example')) return;
        const p = pick();
        const next = logic.createExample(state.examples, letter, cv(), {
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
        if (!progress || !progress.open) return [];
        try {
            const store = progress.open('work-simulation', { defaults: {} });
            return logic.readEarnedLines(store.get());
        } catch (_) {
            return [];
        }
    }

    /** Lines the student sent with "Add to my CV" arrive by themselves, once each. */
    function importQueued() {
        if (!progress || !progress.open) return;
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
        } else if (!counts.mscSimulation) {
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
        const flags = logic.checkCv(data, { examples: state.examples, overflow: state.host.overflow && state.host.overflow() });
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
        // A kept design is set in its STYLE CV font unless the student picked one in the font menu.
        const fontPlan = logic.fontFor(data, design);
        if (fontPlan && state.host.setFont) {
            data.articleshipFontAuto = fontPlan.font;
            state.host.setFont(fontPlan.font);
        }
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
            const flags = logic.checkCv(data, { examples: state.examples });
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
                        design && design.tag ? h('span', { class: 'asb-tag' + (design.portalSafe ? ' is-portal' : ''), text: design.tag }) : null,
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
        const p = pick();
        const pickDesign = p ? logic.resolveDesign(state.designs, p.design) : null;
        const items = state.tab === 'all'
            ? all.map(layout => {
                const kept = logic.designForFile(state.designs, layout.file);
                return { file: layout.file, renderFile: layout.renderFile, title: kept ? kept.name : layout.name, design: kept };
            })
            : state.designs.map(design => ({ file: design.file, renderFile: design.renderFile, title: design.name, design }));
        grid.replaceChildren(...items.map(item => {
            const locked = state.host.isLocked(item.file);
            const design = item.design;
            const card = h('div', {
                class: 'template-card asb-card' + (item.file === currentTemplate ? ' active' : '') + (locked ? ' locked' : ''),
                role: 'button', tabindex: '0', 'data-file': item.file,
                'aria-label': design ? `Design ${design.number}, ${design.name}` : item.title
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
                    design && design.tag ? h('span', { class: 'asb-tag' + (design.portalSafe ? ' is-portal' : ''), text: design.tag }) : null,
                    pickDesign && design && pickDesign.number === design.number ? h('span', { class: 'asb-badge', text: 'Your pick' }) : null
                ]),
                state.tab === 'designs' && design && design.line ? h('p', { class: 'asb-card-line', text: design.line }) : null
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
        for (let waited = 0; state.host.isLocked(design.file) && !state.host.accessChecked() && waited < 10000; waited += 250) {
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
        const [designsJson, examplesJson, situationsJson] = await dataReady;
        state.situations = situationsJson ? logic.mergeSituations(situationsJson) : logic.SITUATIONS;
        state.designs = logic.normaliseDesigns(designsJson, galleryLayouts());
        state.examples = logic.normaliseExamples(examplesJson);
        state.earned = readEarned();
        relabelOptions();

        const p = pick();
        const plan = logic.planPick(p, state.designs, cv());
        let design = null;
        if (plan && plan.apply) {
            const next = logic.applyStructure(cv(), plan.situation, { order: plan.order, situations: state.situations });
            next.articleshipPickApplied = plan.key;
            state.host.setCv(next);
            state.host.toast('Opened with your CV Recommender pick.');
            design = plan.design;
        } else if (state.freshBlank) {
            design = state.designs[0] || null;
        }
        importQueued();
        render();
        useAccountClient();
        if (design) openOnDesign(design, state.host.templateFile());

        if (progress && progress.onSettingsChange) progress.onSettingsChange(() => scheduleRender());
        try {
            progress.open('work-simulation', { defaults: {} }).subscribe(() => { state.earned = readEarned(); scheduleRender(); });
        } catch (_) { /* no Work Simulation data on this device */ }
    }

    window.MSCArticleshipStage = Object.freeze({
        isActive,
        init: host => { init(host).catch(error => { if (window.console) window.console.error(error); }); },
        blankCv,
        previewSource,
        layoutName,
        exportHtml,
        renderTemplateCards,
        onChange: () => { if (state.host && isActive()) scheduleRender(); },
        // For tests and debugging only.
        _state: state
    });
})();
