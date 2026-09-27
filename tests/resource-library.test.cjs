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
