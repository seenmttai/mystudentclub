const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../ca-resource/read/reader-core.js');

const root = path.join(__dirname, '..');
const OPS = { save: 10, restore: 11, transform: 12, moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18,
    rectangle: 19, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28,
    setGState: 9, setFillRGBColor: 59, setFillGray: 57, setFillColor: 55, setFillColorN: 56, constructPath: 91,
    paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 };
const loc = { href: 'https://www.mystudentclub.com/ca-resource/read/?pdf=x', origin: 'https://www.mystudentclub.com' };

test('query: pdf, page from ?page or #page, title trimmed', () => {
    assert.deepEqual(core.parseQuery('?pdf=https%3A%2F%2Fa&page=4&title=%20Cover%20%20letters ', ''), { pdf: 'https://a', page: 4, title: 'Cover letters' });
    assert.equal(core.parseQuery('?pdf=x', '#page=7').page, 7);
    for (const bad of ['0', '-3', 'abc', '2.5x']) assert.equal(core.parseQuery('?page=' + bad, '').page, bad === '2.5x' ? 2 : 1);
    assert.equal(core.clampPage(99, 11), 11);
});

test('only MSC storage links, the PDF proxy or this site can be read', () => {
    const signed = 'https://auth.mystudentclub.com/storage/v1/object/sign/industrial-training-mastery-resources/articleship-program-v3/day-2/Application%20templates.pdf?token=abc';
    assert.ok(core.isAllowedPdfUrl(signed, loc));
    assert.ok(core.isAllowedPdfUrl('https://izsggdtdiacxdsjjncdq.supabase.co/storage/v1/object/sign/b/x.pdf?token=t', loc));
    assert.ok(core.isAllowedPdfUrl('https://pdf-proxy-viewer.bhansalimanan55.workers.dev/?url=' + encodeURIComponent(signed), loc));
    assert.ok(core.isAllowedPdfUrl('/assets/sample.pdf', loc));
    for (const bad of ['javascript:alert(1)', 'data:application/pdf;base64,AAAA', 'https://evil.example.com/storage/v1/object/x.pdf',
        'http://auth.mystudentclub.com/storage/v1/object/x.pdf', 'https://auth.mystudentclub.com/rest/v1/profiles',
        'https://pdf-proxy-viewer.bhansalimanan55.workers.dev/?url=https%3A%2F%2Fevil.example.com%2Fx.pdf', '']) {
        assert.equal(core.isAllowedPdfUrl(bad, loc), false, bad);
    }
    assert.ok(core.isAllowedPdfUrl('/x.pdf', { href: 'http://127.0.0.1:8765/', origin: 'http://127.0.0.1:8765' }), 'local preview');
});

test('Supabase project URLs go through the PDF proxy, the custom domain is fetched directly', () => {
    assert.match(core.fetchUrlFor('https://izsggdtdiacxdsjjncdq.supabase.co/storage/v1/object/sign/x'), /^https:\/\/pdf-proxy-viewer\./);
    assert.equal(core.fetchUrlFor('https://auth.mystudentclub.com/storage/v1/object/sign/x'), 'https://auth.mystudentclub.com/storage/v1/object/sign/x');
    assert.match(core.proxyUrlFor('https://auth.mystudentclub.com/x'), /\?url=https%3A%2F%2Fauth/);
});

test('links the reader follows: web, mail and phone only', () => {
    for (const ok of ['https://a.b', 'http://a.b', 'mailto:?subject=x', 'tel:+9198']) assert.ok(core.isSafeLink(ok), ok);
    for (const bad of ['javascript:x', 'file:///etc', 'data:text/html,x', '']) assert.ok(!core.isSafeLink(bad), bad);
    // MSC's own links stay on the site the reader is on (the app's mobile site keeps the student inside it).
    const deep = 'https://www.mystudentclub.com/learning-management-system/course?course=msc-articleship-program&session=1&resource=MSC+Articleship+Guidebook&page=158';
    assert.equal(core.siteLink(deep, { hostname: 'mobile.mystudentclub.com' }), '/learning-management-system/course?course=msc-articleship-program&session=1&resource=MSC+Articleship+Guidebook&page=158');
    assert.equal(core.siteLink(deep, { hostname: 'www.mystudentclub.com' }).startsWith('/learning-management-system/course?'), true);
    assert.equal(core.siteLink(deep, { hostname: '127.0.0.1' }).startsWith('/learning-management-system/'), true);
    assert.equal(core.siteLink(deep, { hostname: 'preview.pages.dev' }), null, 'a Pages preview keeps the absolute link');
    assert.equal(core.siteLink('https://www.icai.org/x', { hostname: 'mobile.mystudentclub.com' }), null);
    assert.equal(core.siteLink('mailto:a@b.c', { hostname: 'mobile.mystudentclub.com' }), null);
    assert.equal(core.opensInPlace({ hostname: 'mobile.mystudentclub.com' }, {}), true);
    assert.equal(core.opensInPlace({ hostname: 'www.mystudentclub.com' }, {}), false);
    assert.equal(core.opensInPlace({ hostname: 'www.mystudentclub.com' }, { flutter_inappwebview: {} }), true);
});

test('search finds words inside an item, across items and ignores curly quotes and case', () => {
    const pages = [['Respected Sir/Ma’am,', 'I have completed ', 'ICITSS', ' and can join'], [], ['Still doing ICITSS?']];
    assert.deepEqual(core.findMatches(pages, 'icitss'), [{ page: 1, item: 2, last: 2 }, { page: 3, item: 0, last: 0 }]);
    assert.deepEqual(core.findMatches(pages, "sir/ma'am"), [{ page: 1, item: 0, last: 0 }]);
    assert.deepEqual(core.findMatches(pages, 'completed ICITSS and'), [{ page: 1, item: 1, last: 3 }]);
    assert.deepEqual(core.findMatches(pages, 'x'), [], 'one letter is not searched');
    assert.ok(core.searchPattern("ma'am").test('Ma’am'));
    assert.equal(core.searchPattern('a.b').test('axb'), false, 'search text is never a regular expression');
});

function rect(x, y, w, h) { return [OPS.constructPath, [[OPS.rectangle], [x, y, w, h], null]]; }
function list(ops) { return { fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) }; }

test('copy boxes: opaque white shapes at least 100 mm wide, in page space, through transforms and groups', () => {
    const white = new Uint8ClampedArray([255, 255, 255]);
    const ops = list([
        [OPS.save, null], [OPS.transform, [0.24, 0, 0, -0.24, 0, 841.92]],
        [OPS.setFillRGBColor, new Uint8ClampedArray([255, 248, 236])], rect(0, 0, 2480, 3508), [OPS.fill, null], // cream paper
        [OPS.save, null], [OPS.transform, [3.125, 0, 0, 3.125, 331.25, 1500]],
        [OPS.paintFormXObjectBegin, [null, null]],
        [OPS.setFillRGBColor, white], [OPS.setGState, [[['ca', 1]]]], rect(0, 0, 620, 51), [OPS.fill, null], // subject box
        [OPS.paintFormXObjectEnd, []], [OPS.restore, null],
        [OPS.setFillRGBColor, white], rect(331, 2200, 1938, 1000), [OPS.fill, null], // mail box
        [OPS.setFillRGBColor, white], rect(331, 3300, 300, 100), [OPS.fill, null], // too narrow
        [OPS.setGState, [[['ca', 0.5]]]], rect(331, 100, 1938, 300), [OPS.fill, null], // see-through
        [OPS.setGState, [[['ca', 1]]]], [OPS.setFillRGBColor, '#ffffff'],
        [OPS.constructPath, [[OPS.moveTo, OPS.lineTo, OPS.curveTo, OPS.lineTo, OPS.closePath], [331, 400, 2269, 400, 2280, 420, 2290, 600, 2269, 700, 331, 700], null]],
        [OPS.eoFill, null], // rounded white shape drawn as a path
        [OPS.setFillRGBColor, white], rect(331, 2300, 1900, 900), [OPS.fill, null], // inside the mail box: not repeated
        [OPS.restore, null]
    ]);
    const boxes = core.copyBoxes(ops, OPS).map(b => b.map(v => Math.round(v)));
    assert.equal(boxes.length, 3);
    const [subject, mail, rounded] = boxes;
    assert.ok(subject[2] - subject[0] > 100 * 72 / 25.4, 'subject box is over 100 mm wide');
    assert.deepEqual(subject, [80, 444, 545, 482]); // form placed at (331.25, 1500) in a 0.24 flipped page space
    assert.ok(mail[3] > mail[1] && mail[2] - mail[0] > 400);
    assert.ok(rounded[2] - rounded[0] > 450);
});

function item(str, x, y, w, h = 11) { return { str, transform: [h, 0, 0, h, x, y], width: w, height: h }; }

test('box text pastes well into a mail: wraps joined, paragraphs kept, sign-off lines kept', () => {
    const box = [80, 300, 545, 560];
    const items = [
        item('Respected Sir/Ma\'am,', 90, 540, 120),
        item('I have cleared both groups of CA Intermediate in my first attempt', 90, 515, 400),
        item('and would like to join your ', 90, 499, 160), item('[domain]', 250, 499, 50), item(' team in ', 300, 499, 45), item('[City]', 345, 499, 35), item('.', 380, 499, 3),
        item('Thanking you,', 90, 470, 80),
        item('[Your name]', 90, 454, 70),
        item('[Mobile]', 90, 438, 45), item('| ICAI Reg. No.', 140, 438, 85), item('[number]', 230, 438, 50),
        item('Outside the box', 90, 200, 100)
    ];
    assert.equal(core.textInBox(items, box),
        "Respected Sir/Ma'am,\n\nI have cleared both groups of CA Intermediate in my first attempt and would like to join your [domain] team in [City].\n\nThanking you,\n[Your name]\n[Mobile] | ICAI Reg. No. [number]");
    assert.equal(core.textInBox([item('Articleship | CA Inter', 90, 120, 200)], [80, 110, 545, 140]), 'Articleship | CA Inter');
    assert.equal(core.textInBox(items, [0, 0, 10, 10]), '');
});

test('the reader page loads the vendored pdf.js, the shared client and allows copying', () => {
    const html = fs.readFileSync(path.join(root, 'ca-resource/read/index.html'), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, /src="\/scripts\/vendor\/pdf\.min\.js"/);
    assert.match(html, /src="\/scripts\/supabase-init\.js"/);
    assert.ok(!/createClient\(/.test(html), 'no second Supabase client in the page');
    const js = fs.readFileSync(path.join(root, 'ca-resource/read/reader.js'), 'utf8');
    assert.ok(!/addEventListener\(\s*'(copy|cut|contextmenu)'[^)]*preventDefault/.test(js), 'copy is never blocked');
    assert.ok(!/beforeprint/.test(js));
    assert.match(js, /renderTextLayer\(/, 'text layer on');
    assert.match(js, /getAnnotations\(/, 'links on');
    assert.ok(!/innerHTML\s*=\s*[^'"]*(title|text|str)/.test(js), 'PDF text never goes into innerHTML');
});
