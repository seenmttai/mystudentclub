const { test } = require('node:test');
const assert = require('node:assert/strict');
const LMS = require('../scripts/articleship-lms.js');

const pdf = { title: 'Application templates', view_storage_path: 'articleship-program-v3/day-2/Application templates.pdf', group: 'Write your mails' };

test('copy flag: true or "reader" → copyable reader, "browser" → browser viewer, anything else → normal routing', () => {
    assert.equal(LMS.copyMode({ ...pdf, copy: true }), 'reader');
    assert.equal(LMS.copyMode({ ...pdf, copy: 'reader' }), 'reader');
    assert.equal(LMS.copyMode({ ...pdf, copy: 'true' }), 'reader');
    assert.equal(LMS.copyMode({ ...pdf, copy: 'browser' }), 'browser');
    assert.equal(LMS.copyMode(pdf), null);
    assert.equal(LMS.copyMode({ ...pdf, copy: false }), null);
    assert.equal(LMS.copyMode({ title: 'x', copy: true, view_storage_path: 'a/list.csv' }), null, 'only PDFs');
    assert.equal(LMS.copyMode({ title: 'x', copy: true, view_storage_path: 'None' }), null);
    assert.equal(LMS.copyMode(null), null);
});

test('the "Templates" canvas viewer: never for copy rows, never when the course turns it off', () => {
    const template = { ...pdf, group: 'Templates' };
    assert.equal(LMS.useTemplateCanvas(template, {}), true);
    assert.equal(LMS.useTemplateCanvas(template, { templateCanvas: false }), false);
    assert.equal(LMS.useTemplateCanvas({ ...template, copy: true }, {}), false);
    assert.equal(LMS.useTemplateCanvas(pdf, {}), false);
});

test('reader and browser URLs carry the signed link, the page and the title', () => {
    const signed = 'https://auth.mystudentclub.com/storage/v1/object/sign/b/a.pdf?token=t&x=1';
    const url = new URL(LMS.copyReaderUrl(signed, { page: 3, title: 'Cover letters' }), 'https://www.mystudentclub.com');
    assert.equal(url.pathname, '/ca-resource/read/');
    assert.equal(url.searchParams.get('pdf'), signed);
    assert.equal(url.searchParams.get('page'), '3');
    assert.equal(url.searchParams.get('title'), 'Cover letters');
    assert.ok(!LMS.copyReaderUrl(signed, { page: 1 }).includes('page='), 'page 1 is the default');
    assert.ok(!LMS.copyReaderUrl(signed, { page: -2 }).includes('page='));
    assert.equal(LMS.browserViewerUrl(signed + '#old', 4), signed + '#page=4');
    assert.equal(LMS.copyTarget({ ...pdf, copy: 'browser' }, signed, 2), signed + '#page=2');
    assert.equal(LMS.copyTarget(pdf, signed, 2), null);
});

test('deep links accept programme PDFs only', () => {
    assert.ok(LMS.isProgrammePdfPath('articleship-program-v3/day-4/GST booklet.pdf'));
    assert.ok(LMS.isProgrammePdfPath('articleship-program-v2/day-5/domain-roadmaps/MSC Domain Roadmaps.pdf'));
    for (const bad of ['articleship-program-v3/day-7/x.pdf', 'articleship-program-v3/day-1/x.docx', 'premium/x.pdf',
        'articleship-program-v3/day-1/../../secret.pdf', 'https://evil.test/articleship-program-v3/day-1/x.pdf', '']) {
        assert.equal(LMS.isProgrammePdfPath(bad), false, bad);
    }
});

test('download labels, tool links and Sheet copy links', () => {
    assert.equal(LMS.downloadLabel({ download_storage_path: 'a/Cover letters.docx' }), 'Download Word');
    assert.equal(LMS.downloadLabel({ download_storage_path: 'a/x.XLSX' }), 'Download Excel');
    assert.equal(LMS.downloadLabel({ download_storage_path: 'a/x.pdf' }), 'Download PDF');
    assert.equal(LMS.downloadLabel({ download_storage_path: 'a/x.pdf', download_label: 'Download to print' }), 'Download to print');
    assert.equal(LMS.downloadLabel({}), 'Download');
    assert.ok(LMS.isSameOriginToolUrl('/articleship-program/cv-checklist/'));
    assert.ok(!LMS.isSameOriginToolUrl('//evil.test/x'));
    assert.ok(!LMS.isSameOriginToolUrl('https://www.mystudentclub.com/x'));
    assert.ok(LMS.isSheetCopyUrl('https://docs.google.com/spreadsheets/d/1aB-c_D/copy'));
    assert.ok(!LMS.isSheetCopyUrl('https://docs.google.com/spreadsheets/d/1aB-c_D/edit'));
});

test('tools link to a page of a programme PDF through the course (Day d = session d + 1)', () => {
    assert.equal(LMS.resourceLink(1, 'Choose your CV', 5),
        '/learning-management-system/course?course=msc-articleship-program&session=2&resource=Choose+your+CV&page=5');
    assert.equal(LMS.resourceLink(4, 'GST booklet'), '/learning-management-system/course?course=msc-articleship-program&session=5&resource=GST+booklet');
    assert.equal(LMS.resourceLink(5), '/learning-management-system/course?course=msc-articleship-program&session=6');
    assert.throws(() => LMS.resourceLink(7, 'x'));
});
