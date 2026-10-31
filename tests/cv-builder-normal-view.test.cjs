const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const catalog = require('../cv-builder/cv-articleship.js');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const builder = read('cv-builder/cv-script.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The builder's template start-up, run with a fake template dropdown. */
function startUp(cvData, articleshipMode) {
    const select = { options: [], appendChild(option) { this.options.push(option); } };
    const sandbox = {
        window: { MSCArticleship: articleshipMode ? catalog : undefined },
        document: { getElementById: id => (id === 'template-select' ? select : {}), createElement: () => ({}) },
        cvData: structuredClone(cvData),
        IS_ARTICLESHIP_MODE: articleshipMode,
        getDefaultTableSettings: () => ({}),
        hasUserEnteredData: () => false,
        isArticleshipTemplate: file => articleshipMode && Boolean(catalog.getTemplate(file))
    };
    const start = builder.indexOf('function hasArticleshipDraftData');
    vm.runInNewContext(builder.slice(start, builder.indexOf('function updateArticleshipEditor', start)), sandbox);
    sandbox.initializeArticleshipTemplates();
    return { sandbox, select };
}

test('the normal CV Builder lists none of the articleship designs and has no way into Articleship', () => {
    const draft = { personal: { name: 'Riya' }, summary: 'My own objective.', templateFile: 'classic.html' };
    const { sandbox, select } = startUp(draft, false);
    assert.equal(select.options.length, 0, 'no articleship design in the template dropdown');
    assert.equal(JSON.stringify(sandbox.cvData), JSON.stringify(draft), 'the CV is untouched');
    // The template panel: each mode lists only its own catalog.
    assert.ok(builder.includes('TEMPLATES.filter(t => isArticleshipTemplate(t.file) === IS_ARTICLESHIP_MODE)'));
    // There is no collection switch, setter or collection-driven mode in the page or the script.
    assert.doesNotMatch(read('cv-builder/index.html'), /template-collection|setTemplateCollection/);
    assert.doesNotMatch(builder, /templateCollection|setTemplateCollection|template-collection/);
});

test('in Articleship mode only the Articleship catalog is offered', () => {
    const select = { options: [{ value: 'classic.html', remove() { this.removed = true; } }], appendChild(option) { this.options.push(option); } };
    const sandbox = {
        window: { MSCArticleship: catalog },
        document: { getElementById: id => (id === 'template-select' ? select : {}), createElement: () => ({}) },
        cvData: { personal: { name: 'Riya' } },
        IS_ARTICLESHIP_MODE: true,
        getDefaultTableSettings: () => ({}),
        hasUserEnteredData: () => false,
        isArticleshipTemplate: file => Boolean(catalog.getTemplate(file))
    };
    const start = builder.indexOf('function hasArticleshipDraftData');
    vm.runInNewContext(builder.slice(start, builder.indexOf('function updateArticleshipEditor', start)), sandbox);
    sandbox.addArticleshipTemplateOptions();
    assert.equal(select.options[0].removed, true, 'the normal option leaves the Articleship dropdown');
    assert.equal(select.options.length, 1 + catalog.templates.length);
});

test('the articleship data is downloaded only for an authorised Articleship host', async () => {
    const cases = [
        ['no host mode', { mode: undefined, access: 'allow' }, 0],
        ['normal mode', { mode: 'normal', access: 'allow' }, 0],
        ['articleship without access', { mode: 'articleship', access: 'login' }, 0],
        ['authorised articleship', { mode: 'articleship', access: 'allow' }, 3]
    ];
    for (const [label, hostMode, expected] of cases) {
        // A stale ?stage=articleship URL in the page must not activate the stage by itself.
        const dom = new JSDOM('<!doctype html><body><div class="editor-content"></div><select id="template-select"></select></body>', { url: 'http://127.0.0.1/cv-builder/?stage=articleship', runScripts: 'outside-only' });
        const win = dom.window;
        const fetched = [];
        win.fetch = target => { fetched.push(target); return Promise.resolve({ ok: false, json: () => Promise.resolve(null) }); };
        win.MSCArticleshipProgress = { WORK_SIMULATION_LIVE: false, getCvPick: () => null, open: () => ({ get: () => ({}), subscribe: () => () => {} }), settings: () => ({ pull: () => Promise.resolve() }), onSettingsChange: () => () => {} };
        win.MSCArticleshipCvBuilder = require('../scripts/articleship-cv-builder.js');
        win.eval(read('articleship-program/cv-builder/stage.js'));
        assert.equal(fetched.length, 0, 'nothing is fetched when the script loads');
        assert.equal(win.MSCArticleshipStage.isActive(), false, 'inactive before init');
        // Any other host call the panel makes is a no-op here; only the fetches matter.
        const known = { ...hostMode, getCv: () => ({}), templateFile: () => 'classic.html', gallery: () => [], isLocked: () => false, accessChecked: () => true };
        const host = new Proxy(known, { get: (target, key) => (key in target ? target[key] : () => undefined) });
        try { await win.MSCArticleshipStage.init(host); } catch (_) { /* the stub data is empty */ }
        await sleep(20);
        assert.equal(fetched.length, expected, label);
        assert.equal(win.MSCArticleshipStage.isActive(), expected > 0, label);
        dom.window.close();
    }
});

test('Executive Professional bolds a certificate up to its colon within 40 characters; 90 only on an articleship CV', () => {
    const html = read('cv-builder/executive-professional.html');
    const start = html.indexOf('function esc(s)');
    const code = html.slice(start, html.indexOf('function scaleToFit()', start)) + '\nthis.renderCertsBold = renderCertsBold;';
    let listener = null;
    const list = { innerHTML: '' };
    const sandbox = {
        window: { addEventListener: (type, fn) => { if (type === 'message') listener = fn; } },
        document: { querySelector: selector => (selector === '[data-list="certifications"]' ? list : null) }
    };
    vm.runInNewContext(code, sandbox);
    const long = 'Statutory Audit Work Simulation, MSC Articleship Program | Mar 2026: 3 tasks, 40 vouchers';
    const short = 'Excel: PivotTables and XLOOKUP';
    const render = articleshipApplicant => {
        listener({ data: { type: 'update-cv', payload: { personal: {}, certifications: [long, short], articleshipApplicant } } });
        sandbox.renderCertsBold();
        return list.innerHTML;
    };
    const normal = render(false);
    assert.match(normal, /<li><b>Excel:<\/b> PivotTables and XLOOKUP<\/li>/, 'a short title is bolded as before');
    assert.match(normal, /<li>Statutory Audit Work Simulation[^<]*<\/li>/, 'a long title stays plain on everyone else\'s CV');
    assert.match(render(true), /<li><span><b>Statutory Audit Work Simulation, MSC Articleship Program \| Mar 2026:<\/b>/);
});
