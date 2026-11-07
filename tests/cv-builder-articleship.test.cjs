const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const catalog = require('../cv-builder/cv-articleship.js');

const builder = fs.readFileSync(path.join(__dirname, '../cv-builder/cv-script.js'), 'utf8');
const renderer = fs.readFileSync(path.join(__dirname, '../cv-builder/cv-common.js'), 'utf8');

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
        getPlainTextFromHTML: value => String(value || '').replace(/<[^>]*>/g, ''),
        isArticleshipTemplate: file => Boolean(catalog.getTemplate(file))
    };
    const detectionStart = builder.indexOf('function isRealPhoneValue');
    const detectionEnd = builder.indexOf('function applyFormattedContact', detectionStart);
    vm.runInNewContext(builder.slice(detectionStart, detectionEnd), sandbox);
    const start = builder.indexOf('function hasArticleshipDraftData');
    const end = builder.indexOf('function updateArticleshipEditor', start);
    vm.runInNewContext(builder.slice(start, end), sandbox);
    return { sandbox, select, collection };
}

test('all 18 J1 applicant situations reuse the existing MSC layouts', () => {
    const situations = catalog.templates.filter(template => template.kind === 'situation');
    assert.deepEqual(situations.map(template => template.name), [
        'Classic Academic', 'Statutory Audit Foundations', 'Direct Tax Practice',
        'GST Reconciliation', 'Academic Highlights', 'Campus Leadership',
        'Accounting Practice', 'Audit & Tax', 'College Projects', 'Community Contribution',
        'Direct Entry Graduate', 'Excel First', 'Financial Analysis', 'IFC Controls',
        'Internal Audit Process', 'Separate Group Results', 'Sport & Responsibility',
        'Writing & Communication'
    ]);
    for (const template of situations) {
        const starter = catalog.createStarter(template.file);
        assert.ok(fs.existsSync(path.join(__dirname, '../cv-builder', catalog.resolveRenderFile(template.file))));
        assert.equal(template.sourceFile, `day-1/cv-templates/${template.name}.docx`);
        assert.deepEqual(starter.experience, []);
        assert.equal(starter.summary, '');
        assert.equal(starter.personal.name, '[First name]');
        assert.equal(starter.personal.phone, '');
        assert.ok(starter.education.some(entry => /CA Intermediate/.test(entry.degree)));
        assert.ok(starter.education.filter(entry => /CA Intermediate/.test(entry.degree)).every(entry => /Attempt/.test(entry.remarks)));
        assert.ok(starter.customSections.some(section => section.title === 'ICITSS'));
        assert.ok(catalog.hasUnchangedStarterContent(starter));
        assert.doesNotMatch(JSON.stringify(starter.personal), /Article Trainee Experience/);
    }
    assert.equal(catalog.resolveRenderFile('classic.html'), 'classic.html');
});

test('the 62 MSC gallery layouts have distinct renderers and matching Day 1 files', () => {
    const layouts = catalog.templates.filter(template => template.kind === 'gallery');
    assert.equal(layouts.length, 62);
    assert.equal(new Set(layouts.map(template => template.renderFile)).size, 62);
    assert.equal(new Set(catalog.templates.map(template => template.file)).size, 80);
    assert.equal(layouts[0].name, 'Classic');
    assert.equal(layouts.at(-1).name, 'Plain ATS');
    layouts.forEach((layout, index) => {
        const stem = layout.name === 'Firm Info' ? 'firm-info' : layout.renderFile.replace(/\.html$/, '');
        assert.equal(layout.sourceFile, `day-1/cv-gallery/${String(index + 1).padStart(2, '0')}-${stem}.docx`);
        assert.equal(catalog.resolveRenderFile(layout.file), layout.renderFile);
        assert.ok(fs.existsSync(path.join(__dirname, '../cv-builder', layout.renderFile)));
        const starter = catalog.createStarter(layout.file);
        assert.match(starter.summary, /Seeking articleship/);
        assert.deepEqual(starter.experience, []);
        assert.ok(starter.education.some(entry => /CA Intermediate/.test(entry.degree) && /Attempt/.test(entry.remarks)));
        assert.ok(starter.skills && starter.leadership.length && starter.certifications.length);
        assert.equal(starter.articleshipGallery, true);
        assert.equal(starter.articleshipLayoutName, layout.name);
        assert.doesNotMatch(JSON.stringify(starter), /Article Trainee Experience|industrial training|audit clients/i);
        assert.ok(catalog.hasUnchangedStarterContent(starter));
    });
});

test('the firm-info layout asks for the target firm without inventing past employment', () => {
    const starter = catalog.createStarter('articleship-layout-modern-elegant');
    const firm = starter.customSections.find(section => section.title === 'Target firm');
    assert.ok(firm);
    assert.deepEqual(firm.items, ['[Firm] | [Team] | [Office] | Available from [date]']);
    assert.deepEqual(starter.experience, []);
    assert.ok(starter.sectionOrder.indexOf(firm.id) < starter.sectionOrder.indexOf('education'));
});

test('the two-column gallery keeps one native custom-section title', () => {
    const source = fs.readFileSync(path.join(__dirname, '../cv-builder/dual-columns.html'), 'utf8');
    const start = source.indexOf('function fixUniversalAndCustomSectionHeaders');
    const end = source.indexOf('function moveCertificationsUnderProjects', start);
    let removed = 0;
    let hasNativeTitle = true;
    const list = { classList: { remove() {}, contains: () => true } };
    const wrapper = {
        querySelector(selector) {
            if (selector === '[data-list]') return list;
            if (selector === ':scope > .section-head') return {};
            if (selector === ':scope > .section-head > .section-title') return hasNativeTitle ? {} : null;
            return null;
        },
        querySelectorAll: () => [{ remove() { removed += 1; } }]
    };
    const sandbox = {
        document: { querySelector: selector => selector.includes('data-custom-section-root') ? wrapper : null }
    };
    vm.runInNewContext(source.slice(start, end), sandbox);
    const data = { articleshipGallery: true, customSections: [{ id: 'icitss', title: 'ICITSS' }] };
    sandbox.fixUniversalAndCustomSectionHeaders(data);
    assert.equal(removed, 1);
    removed = 0;
    sandbox.fixUniversalAndCustomSectionHeaders({ ...data, articleshipGallery: false });
    assert.equal(removed, 0, 'the existing general CV rendering is unchanged');
    hasNativeTitle = false;
    sandbox.fixUniversalAndCustomSectionHeaders(data);
    assert.equal(removed, 0, 'a generic title stays until its native replacement exists');
});

test('layouts without result columns still show the supplied Inter marks and attempt', () => {
    const appended = [];
    const fields = { marks: [], remarks: [] };
    const education = {
        querySelectorAll(selector) {
            if (selector === 'th' || selector === 'table') return [];
            return fields[selector.match(/data-field="(\w+)"/)[1]];
        },
        appendChild(element) { appended.push(element); }
    };
    const sandbox = {
        stripTags: value => value.replace(/<[^>]*>/g, ''),
        document: {
            querySelectorAll: () => [],
            querySelector: () => education,
            createElement: () => ({
                style: {}, children: [], setAttribute() {},
                appendChild(element) { this.children.push(element); }
            })
        }
    };
    const start = renderer.indexOf('function renderArticleshipAcademicResults');
    const end = renderer.indexOf('function renderArticleshipBranding', start);
    vm.runInNewContext(renderer.slice(start, end), sandbox);
    const data = {
        articleshipGallery: true,
        education: [{ degree: 'CA Intermediate — both groups', marks: '412 / 600', remarks: '2' }]
    };
    for (const degree of ['CA Intermediate — both groups', 'CA Inter — both groups']) {
        appended.length = 0;
        data.education[0].degree = degree;
        sandbox.renderArticleshipAcademicResults(data);
        assert.equal(appended[0].children[0].textContent, `${degree} | Marks: 412 / 600 | Attempt: 2`);
    }

    appended.length = 0;
    fields.marks.push({ textContent: '412 / 600', getClientRects: () => [{}] });
    fields.remarks.push({ textContent: '2', getClientRects: () => [{}] });
    sandbox.renderArticleshipAcademicResults(data);
    assert.equal(appended.length, 0, 'a complete native table does not get duplicate result lines');
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
    assert.equal(fresh.select.options.length, catalog.templates.length);
    assert.equal(fresh.sandbox.cvData.templateFile, catalog.templates[0].file);
    assert.deepEqual(Array.from(fresh.sandbox.cvData.experience), []);

    const draft = { personal: { name: 'Your name' }, summary: 'My own objective.', templateFile: 'classic.html' };
    const existing = loadStarterHelpers(draft);
    existing.sandbox.initializeArticleshipTemplates();
    assert.equal(JSON.stringify(existing.sandbox.cvData), JSON.stringify(draft));
});

test('separate group results preserve each group session, marks and attempt field', () => {
    const starter = catalog.createStarter('articleship-separate-group-results');
    const groups = starter.education.filter(entry => /CA Intermediate/.test(entry.degree));
    assert.deepEqual(groups.map(entry => entry.degree), ['CA Intermediate — Group I', 'CA Intermediate — Group II']);
    for (const group of groups) {
        assert.equal(group.year, '[Session / year]');
        assert.equal(group.marks, '[Marks / maximum]');
        assert.equal(group.remarks, '[Attempt number]');
    }
});

test('changing an untouched starter keeps personal edits and loads the chosen domain', () => {
    const starter = catalog.createStarter(catalog.templates[0].file);
    starter.personal.name = 'Your edited name';
    // Quill normalizes an empty objective as soon as the editor loads.
    starter.summary = `<p>${starter.summary}</p>`;
    const { sandbox } = loadStarterHelpers(starter);
    const target = catalog.templates.find(template => template.name === 'Direct Tax Practice');
    assert.equal(sandbox.applyArticleshipStarter(target.file), true);
    assert.equal(sandbox.cvData.personal.name, 'Your edited name');
    assert.equal(sandbox.cvData.projects[0].title, '[Income-tax computation case]');
});

test('opening Articleship templates preserves a draft with only personal details', () => {
    for (const personal of [
        { location: 'Your city' },
        { highlight1: 'Your academic result' },
        { highlight2: 'Your project' },
        { highlight3: 'Your activity' },
        { phone: '9' },
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
