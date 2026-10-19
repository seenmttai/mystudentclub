const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const catalog = require('../cv-builder/cv-articleship.js');

const builder = fs.readFileSync(path.join(__dirname, '../cv-builder/cv-script.js'), 'utf8');

function loadStarterHelpers(data) {
    const select = { options: [], appendChild(option) { this.options.push(option); } };
    const collection = {};
    const sandbox = {
        window: { MSCArticleship: catalog },
        document: {
            getElementById: id => id === 'template-select' ? select : collection,
            createElement: () => ({})
        },
        cvData: structuredClone(data),
        templateCollection: 'articleship',
        getDefaultTableSettings: () => ({}),
        hasUserEnteredData: value => Boolean(value.personal?.name || value.summary || value.education?.length),
        isArticleshipTemplate: file => Boolean(catalog.getTemplate(file))
    };
    const start = builder.indexOf('function hasArticleshipDraftData');
    const end = builder.indexOf('function updateArticleshipEditor', start);
    vm.runInNewContext(builder.slice(start, end), sandbox);
    return { sandbox, select, collection };
}

test('six J1 applicant formats reuse the existing MSC layouts', () => {
    assert.deepEqual(catalog.templates.map(template => template.name), [
        'Classic Academic', 'Statutory Audit Foundations', 'Direct Tax Practice',
        'GST Reconciliation', 'Academic Highlights', 'Campus Leadership'
    ]);
    for (const template of catalog.templates) {
        const starter = catalog.createStarter(template.file);
        assert.ok(fs.existsSync(path.join(__dirname, '../cv-builder', catalog.resolveRenderFile(template.file))));
        assert.equal(template.sourceFile, `day-1/cv-templates/${template.name}.docx`);
        assert.deepEqual(starter.experience, []);
        assert.equal(starter.summary, '');
        assert.equal(starter.personal.name, '[First name]');
        assert.equal(starter.personal.phone, '');
        assert.ok(starter.education.some(entry => /CA Intermediate/.test(entry.degree)));
        assert.ok(starter.customSections.some(section => section.title === 'ICITSS'));
        assert.ok(catalog.hasUnchangedStarterContent(starter));
    }
    assert.equal(catalog.resolveRenderFile('classic.html'), 'classic.html');
});

test('renamed J1 formats retain saved template selections', () => {
    assert.equal(catalog.getTemplate('articleship-minimal-split').name, 'Academic Highlights');
    assert.equal(catalog.getTemplate('articleship-leadership-split').name, 'Campus Leadership');
    const starter = catalog.createStarter('articleship-leadership-split');
    starter.summary = 'My saved objective from an earlier draft.';
    starter.personal.name = 'Your edited name';
    const { sandbox, select } = loadStarterHelpers(starter);
    const before = JSON.stringify(sandbox.cvData);
    sandbox.initializeArticleshipTemplates();
    assert.ok(select.options.some(option => option.value === starter.templateFile));
    assert.equal(JSON.stringify(sandbox.cvData), before);
});

test('the Articleship link starts a fresh applicant CV and leaves existing drafts intact', () => {
    const fresh = loadStarterHelpers({ personal: {}, education: [] });
    fresh.sandbox.initializeArticleshipTemplates();
    assert.equal(fresh.select.options.length, 6);
    assert.equal(fresh.sandbox.cvData.templateFile, catalog.templates[0].file);
    assert.deepEqual(Array.from(fresh.sandbox.cvData.experience), []);

    const draft = { personal: { name: 'Your name' }, summary: 'My own objective.', templateFile: 'classic.html' };
    const existing = loadStarterHelpers(draft);
    existing.sandbox.initializeArticleshipTemplates();
    assert.equal(JSON.stringify(existing.sandbox.cvData), JSON.stringify(draft));
});

test('changing an untouched starter keeps personal edits and loads the chosen domain', () => {
    const starter = catalog.createStarter(catalog.templates[0].file);
    starter.personal.name = 'Your edited name';
    // Quill normalizes the empty objective as soon as the editor loads.
    starter.summary = `<p>${starter.summary}</p>`;
    const { sandbox } = loadStarterHelpers(starter);
    const target = catalog.templates.find(template => template.name === 'Direct Tax Practice');
    assert.equal(sandbox.applyArticleshipStarter(target.file), true);
    assert.equal(sandbox.cvData.personal.name, 'Your edited name');
    assert.equal(sandbox.cvData.projects[0].title, '[Income-tax computation case]');
});

test('Articleship seeding preserves drafts with only a location, highlight or other personal field', () => {
    for (const personal of [
        { location: 'Your city' },
        { highlight1: 'Your academic result' },
        { highlight2: 'Your project' },
        { highlight3: 'Your activity' },
        { socialLinks: [{ label: 'Your portfolio', url: '' }] },
        { preferredLocation: 'Your preferred city' }
    ]) {
        const draft = { personal, templateFile: 'classic.html' };
        const { sandbox } = loadStarterHelpers(draft);
        const before = JSON.stringify(sandbox.cvData);
        sandbox.initializeArticleshipTemplates();
        assert.equal(JSON.stringify(sandbox.cvData), before);
        assert.equal(sandbox.applyArticleshipStarter(catalog.templates[0].file), false);
        assert.equal(JSON.stringify(sandbox.cvData), before);
    }
});

test('closing and reopening the mobile template sheet restores both moved controls', () => {
    class Node {
        constructor(name) { this.name = name; this.children = []; this.parentElement = null; }
        append(node) {
            node.remove();
            this.children.push(node);
            node.parentElement = this;
        }
        remove() {
            if (!this.parentElement) return;
            const siblings = this.parentElement.children;
            siblings.splice(siblings.indexOf(this), 1);
            this.parentElement = null;
        }
        before(node) {
            node.remove();
            const parent = this.parentElement;
            parent.children.splice(parent.children.indexOf(this), 0, node);
            node.parentElement = parent;
        }
        replaceWith(node) { this.before(node); this.remove(); }
        replaceChildren() { for (const child of [...this.children]) child.remove(); }
    }
    const home = new Node('sidebar');
    const controls = new Node('collection');
    const color = new Node('color');
    const grid = new Node('grid');
    for (const node of [controls, color, grid]) home.append(node);
    const content = new Node('sheet content');
    const sandbox = {
        content,
        sheet: { dataset: {} },
        document: { createComment: () => new Node('placeholder'), getElementById: () => null }
    };
    const preview = fs.readFileSync(path.join(__dirname, '../cv-builder/cv-preview.js'), 'utf8');
    const start = preview.indexOf('let lastPanPoint = null;');
    const end = preview.indexOf('function showUnavailable', start);
    assert.ok(start >= 0 && end > start);
    vm.runInNewContext(preview.slice(start, end), sandbox);
    for (let cycle = 0; cycle < 2; cycle++) {
        assert.equal(sandbox.moveIntoSheet(controls), true);
        assert.equal(sandbox.moveIntoSheet(grid), true);
        assert.deepEqual(content.children.map(node => node.name), ['collection', 'grid']);
        sandbox.restoreContent();
        assert.deepEqual(home.children.map(node => node.name), ['collection', 'color', 'grid']);
        assert.deepEqual(content.children, []);
    }
});

test('Articleship thumbnails show a personal-only draft without replacing it with sample content', () => {
    const draft = {
        personal: { preferredLocation: 'Your preferred city' },
        education: [],
        templateFile: 'classic.html'
    };
    const { sandbox } = loadStarterHelpers(draft);
    Object.assign(sandbox, {
        normalizeSectionOrder() {},
        getSelectedTemplateFile: () => sandbox.cvData.templateFile,
        BASE_SECTION_ORDER: ['education'],
        normalizeHexColor: value => value,
        applyFormattedContact() {},
        DEMO_PREVIEW_DATA: { personal: { name: 'Sample CV' } }
    });
    const start = builder.indexOf('function buildPreviewPayload');
    const end = builder.indexOf('function injectPreviewData', start);
    vm.runInNewContext(builder.slice(start, end), sandbox);
    const before = JSON.stringify(sandbox.cvData);
    const payload = sandbox.buildPreviewPayload({ useDemoFallback: true, templateFile: catalog.templates[0].file });
    assert.equal(payload.personal.preferredLocation, draft.personal.preferredLocation);
    assert.equal(payload.personal.name, undefined);
    assert.equal(JSON.stringify(sandbox.cvData), before);
});

test('changing the layout preserves a CV after the student edits its content', () => {
    const starter = catalog.createStarter(catalog.templates[0].file);
    starter.education[0].marks = 'Your result';
    const { sandbox } = loadStarterHelpers(starter);
    const before = JSON.stringify(sandbox.cvData);
    assert.equal(sandbox.applyArticleshipStarter(catalog.templates[1].file), false);
    assert.equal(JSON.stringify(sandbox.cvData), before);
    assert.equal(catalog.getTemplate(catalog.templates[0].file).starter.education[0].marks, '[Marks / maximum]');
});

test('Articleship progress ignores placeholders and accepts evidence without prior employment', () => {
    const starter = catalog.createStarter(catalog.templates[0].file);
    assert.equal(catalog.getProgress(starter), 0);
    for (const template of catalog.templates) {
        assert.ok(catalog.getProgress(catalog.createStarter(template.file)) < 20);
    }
    const completed = {
        personal: { name: 'Your name', email: 'yourname@example.com' },
        summary: 'Seeking statutory audit articleship.',
        skills: 'Excel: lookups and PivotTables.',
        education: [{ degree: 'CA Intermediate', institute: 'ICAI', year: 'Your session', marks: 'Your result' }],
        certifications: [{ name: 'Your completed course', issuer: 'Your provider' }],
        experience: []
    };
    assert.equal(catalog.getProgress(completed), 100);
});

test('AI Enhance retains the Worker contract with applicant context', async () => {
    const template = catalog.templates.find(template => template.name === 'GST Reconciliation');
    let request;
    const sandbox = {
        window: { MSCArticleship: catalog, MscAiConsent: { request: async () => true } },
        document: { getElementById: () => ({ value: template.file }) },
        WORKER_URL: 'https://example.invalid',
        getTemplateRenderFile: file => catalog.resolveRenderFile(file),
        isArticleshipTemplate: file => Boolean(catalog.getTemplate(file)),
        fetch: async (url, options) => {
            request = { url, ...JSON.parse(options.body) };
            return { json: async () => ({ ok: true, refined_text: 'Supplied facts, shortened.' }) };
        }
    };
    const start = builder.indexOf('async function refineSection');
    const end = builder.indexOf('const AI_PROMPT_SUGGESTIONS', start);
    vm.runInNewContext(builder.slice(start, end), sandbox);
    assert.equal(await sandbox.refineSection('summary', 'My own objective.', 'Keep it short.'), 'Supplied facts, shortened.');
    assert.equal(request.url, 'https://example.invalid/refine-section');
    assert.equal(request.field_type, 'summary');
    assert.equal(request.template_id, 'template_classic');
    assert.equal(request.text, 'My own objective.');
    assert.match(request.custom_prompt, /seeking their first articleship/);
    assert.match(request.custom_prompt, /Do not invent/);
    assert.match(request.custom_prompt, /square-bracket placeholders unchanged/);
    assert.match(request.custom_prompt, /Keep it short\./);
});
