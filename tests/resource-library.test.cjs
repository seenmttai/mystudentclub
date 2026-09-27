const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const library = require('../scripts/resource-library.js');

test('catalogue projection excludes URLs and other private resource properties', () => {
    const rows = [
        {program_type:'articleship',title:'Interview master guide',category:'interview-guidance',sort_order:1,url:'SECRET',view_storage_path:'PRIVATE',description:'PRIVATE'},
        {program_type:'articleship',title:'Interview master guide',category:'interview-guidance'},
        {program_type:'ca-fresher',title:'Wrong program'},
        {program_type:'articleship',title:''}
    ];
    const result = library.sanitizeCatalogue(rows, 'articleship');
    assert.equal(result.length, 1);
    assert.deepEqual(Object.keys(result[0]).sort(), ['category','premium','program','sort_order','title']);
    assert.ok(!JSON.stringify(result).includes('SECRET'));
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('editable free resources point to real Word archives and retain PDF previews', () => {
    for (const page of Object.values(library.pages)) {
        for (const resource of page.resources.filter(r => r.format === 'DOCX')) {
            assert.match(resource.downloadUrl, /\.docx$/);
            assert.match(resource.viewUrl, /\.pdf$/);
            const download = path.join(__dirname, '..', resource.downloadUrl);
            const preview = path.join(__dirname, '..', resource.viewUrl);
            assert.equal(fs.readFileSync(download).subarray(0,4).toString('hex'), '504b0304');
            assert.ok(fs.existsSync(preview));
            assert.ok(!resource.fileName.includes('%20'));
        }
    }
});

test('Articleship duplicates only the three editable Fresher resources; Semi Qualified duplicates the full set', () => {
    assert.equal(library.pages.articleship.resources.length, 3);
    assert.ok(library.pages.articleship.resources.every(r => r.format === 'DOCX'));
    assert.deepEqual(library.pages.articleship.resources.map(r => r.downloadUrl),library.pages['ca-fresher'].resources.slice(0,3).map(r => r.downloadUrl));
    assert.deepEqual(library.pages['semi-qualified'].resources.map(r => r.downloadUrl),library.pages['ca-fresher'].resources.map(r => r.downloadUrl));
});

test('download filenames decode URL encoding without introducing path separators', () => {
    assert.equal(library.cleanFileName('Cover%20Letter%20CA%20Fresher.docx'), 'Cover Letter CA Fresher.docx');
    assert.equal(library.cleanFileName('Cover%2520Letter.docx'), 'Cover Letter.docx');
    assert.equal(library.cleanFileName('../../bad/name.docx'), '..-..-bad-name.docx');
    assert.equal(library.cleanFileName('bad%name.docx'), 'bad%name.docx');
});

test('all resource pages use shared navigation, form collection, and correct community CTA', () => {
    for (const slug of ['ca-industrial-training-resources','ca-fresher-training-resources','articleship-resources','semi-qualified-ca-resources']) {
        const html = fs.readFileSync(path.join(__dirname,'..',slug+'.html'),'utf8');
        for (const required of ['site-navigation.js','career-profile.js','resource-form-collector.js','resource-library.js','href="/links"']) assert.ok(html.includes(required), slug+': '+required);
    }
});

test('resource sections keep free files before premium titles and sort numbered template series naturally', () => {
    const free = library.pages['industrial-training'].resources;
    const premium = [62, 10, 2, 20, 1, 11, 3].map(number => ({ title: 'Industrial CV Template ' + number, premium: true, sort_order: 10 }));
    premium.push({ title: 'Featured programme guide', premium: true, sort_order: 1 });
    const before = JSON.stringify({free, premium});
    const sections = library.organizeResources(free, premium);
    assert.deepEqual(Object.keys(sections), ['free', 'premium']);
    assert.deepEqual(sections.free.slice(0, 3).map(resource => resource.title), ['CV Template 2', 'CV Template 3', 'Cover Letter']);
    assert.ok(sections.free.every(resource => !resource.premium));
    assert.ok(sections.premium.every(resource => resource.premium));
    assert.deepEqual(sections.premium.map(resource => resource.title), ['Featured programme guide', ...[1, 2, 3, 10, 11, 20, 62].map(number => 'Industrial CV Template ' + number)]);
    assert.equal(JSON.stringify({free, premium}), before, 'sorting does not mutate the source catalogue');
});

test('premium search matches all supplied words across the entire catalogue without mutating results', () => {
    const resources = ['Industrial CV Template 2', 'Finance Interview Questions', 'Industrial CV Template 62'].map(title => ({title}));
    assert.deepEqual(library.searchResources(resources, '  template 62  ').map(resource => resource.title), ['Industrial CV Template 62']);
    assert.deepEqual(library.searchResources(resources, 'INTERVIEW finance').map(resource => resource.title), ['Finance Interview Questions']);
    assert.deepEqual(library.searchResources(resources, 'missing'), []);
    assert.equal(library.searchResources(resources, '').length, 3);
});
