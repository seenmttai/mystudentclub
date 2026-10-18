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
    const start = builder.indexOf('function initializeArticleshipTemplates');
    const end = builder.indexOf('function updateArticleshipEditor', start);
    vm.runInNewContext(builder.slice(start, end), sandbox);
    return { sandbox, select, collection };
}

test('six J1 applicant formats reuse the existing MSC layouts', () => {
    assert.deepEqual(catalog.templates.map(template => template.name), [
        'Classic Academic', 'Statutory Audit Foundations', 'Direct Tax Practice',
        'GST Reconciliation', 'Minimal Split', 'Leadership Split'
    ]);
    for (const template of catalog.templates) {
        const starter = catalog.createStarter(template.file);
        assert.ok(fs.existsSync(path.join(__dirname, '../cv-builder', catalog.resolveRenderFile(template.file))));
        assert.match(template.sourceFile, /^day-1\/cv-templates\/.+\.docx$/);
        assert.deepEqual(starter.experience, []);
        assert.equal(starter.personal.name, '[YOUR NAME]');
        assert.equal(starter.personal.phone, '[Mobile]');
        assert.ok(starter.education.some(entry => /CA Intermediate/.test(entry.degree)));
        assert.ok(starter.customSections.some(section => section.title === 'ICITSS'));
        assert.ok(catalog.hasUnchangedStarterContent(starter));
    }
    assert.equal(catalog.resolveRenderFile('classic.html'), 'classic.html');
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
    // Quill wraps a plain objective in a paragraph as soon as the editor loads.
    starter.summary = `<p>${starter.summary}</p>`;
    const { sandbox } = loadStarterHelpers(starter);
    const target = catalog.templates.find(template => template.name === 'Direct Tax Practice');
    assert.equal(sandbox.applyArticleshipStarter(target.file), true);
    assert.equal(sandbox.cvData.personal.name, 'Your edited name');
    assert.match(sandbox.cvData.summary, /direct tax articleship/);
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
        window: { MSCArticleship: catalog },
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
