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
    assert.deepEqual(core.findMatches(pages, 'icitss'), [{ page: 1, item: 2, last: 2, start: 0, end: 6 }, { page: 3, item: 0, last: 0, start: 12, end: 18 }]);
    assert.deepEqual(core.findMatches(pages, "sir/ma'am"), [{ page: 1, item: 0, last: 0, start: 10, end: 19 }]);
    assert.deepEqual(core.findMatches(pages, 'completed ICITSS and'), [{ page: 1, item: 1, last: 3, start: 7, end: 4 }]);
    // Offsets are in the raw text, so the reader marks just the searched words (a run of spaces counts as one).
    assert.deepEqual(core.findMatches([['Your  CV checklist and CV  templates']], 'cv'), [{ page: 1, item: 0, last: 0, start: 6, end: 8 }, { page: 1, item: 0, last: 0, start: 23, end: 25 }]);
    assert.deepEqual(core.findMatches([['Two\u00a0words here']], 'words here'), [{ page: 1, item: 0, last: 0, start: 4, end: 14 }]);
    assert.equal(core.rawIndex('a  b', 2), 3);
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

// Application templates p6, the mail box: line tops on the page (pt from the top) and each line's width, as pdf.js
// reads them. Paragraphs sit 1.30x the line pitch apart (20.9 / 16.1), and the PDF breaks some lines mid-sentence.
const APP_P6 = [
    [282.2, "Respected Sir/Ma'am,", 103.9],
    [303.7, "I would like to apply for articleship in [Firm]'s [statutory audit] team, [City].", 363.3],
    [319.9, 'I saw the opening on [your LinkedIn page].', 205.5],
    [340.8, 'I have cleared both groups of CA Intermediate,', 223.8],
    [356.9, 'Group I in [Month Year] and Group II in [Month Year], and completed ICITSS.', 366.7],
    [377.8, 'Since then I have [practised vouchers, GST invoices', 245.7],
    [393.9, 'and a bank reconciliation in TallyPrime].', 191.2],
    [415.4, '[Your Pune team audits manufacturers; that is the work I want to learn.]', 342.9],
    [436.3, 'I can join from [date]. My CV and cover letter are attached.', 280.2],
    [452.5, 'I would be grateful for a chance to interview.', 214.3],
    [473.4, 'Thanking you,', 67.6],
    [489.5, '[Your name]', 57.9]
];

test('Copy keeps a blank line between paragraphs and joins lines the PDF broke mid-sentence (Application templates p6)', () => {
    const items = APP_P6.map(([top, str, w]) => item(str, 93.6, 842 - top, w, 10.8));
    const text = core.textInBox(items, [79.5, 335.3, 544.8, 586.2]);
    assert.equal(text, [
        "Respected Sir/Ma'am,",
        "I would like to apply for articleship in [Firm]'s [statutory audit] team, [City]. I saw the opening on [your LinkedIn page].",
        'I have cleared both groups of CA Intermediate, Group I in [Month Year] and Group II in [Month Year], and completed ICITSS.',
        'Since then I have [practised vouchers, GST invoices and a bank reconciliation in TallyPrime].',
        '[Your Pune team audits manufacturers; that is the work I want to learn.]',
        'I can join from [date]. My CV and cover letter are attached. I would be grateful for a chance to interview.',
        'Thanking you,\n[Your name]'
    ].join('\n\n'));
    assert.equal(text.split('\n\n').length, 7, "'\\n\\n' between the paragraphs");
    assert.deepEqual(text.split('\n').filter(l => /,$/.test(l)), ["Respected Sir/Ma'am,", 'Thanking you,'], 'no break after a comma in mid-sentence');
});

test('Copy: paragraphs only 1.26x the line pitch apart (Back-out templates) still get their blank line', () => {
    const box = [79.5, 300, 544.5, 600];
    const items = [
        item('Respected Mr/Ms [Surname],', 97.3, 570, 160, 13.5),
        item('On [date], I accepted your offer of articleship in your [domain] team.', 97.3, 544.5, 380, 13.5),
        item('I will not be joining on [joining date],', 97.3, 519, 200, 13.5),
        item('because [one true reason from Mail 1’s list].', 97.3, 498.8, 240, 13.5),
        item('Thanking you,', 97.3, 473.3, 80, 13.5),
        item('[Your name]', 98.3, 453.1, 70, 13.5)
    ];
    assert.equal(core.textInBox(items, box),
        'Respected Mr/Ms [Surname],\n\nOn [date], I accepted your offer of articleship in your [domain] team.\n\n' +
        'I will not be joining on [joining date], because [one true reason from Mail 1’s list].\n\nThanking you,\n[Your name]');
});

test('Copy keeps the breaks a mail needs: address and signature lines, list items, fields, one item per line', () => {
    const box = [80, 100, 545, 700];
    // A letter: "To," block and the signature block keep every line; the body wraps are joined.
    const letter = [
        item('To,', 97, 680, 18, 12.5), item('The Partner', 97, 664, 60, 12.5), item('[Firm name], Jaipur', 97, 648, 100, 12.5),
        item('I want audit first because it shows me how every number in a business is', 97, 620, 430, 12.5),
        item('checked.', 97, 604, 45, 12.5),
        item('Thanking you,', 97, 576, 80, 12.5), item('Lakshya Khandelwal', 97, 560, 110, 12.5),
        item('98XXXXXXXX | lakshya.khandelwal@email.com', 97, 544, 240, 12.5)
    ];
    assert.equal(core.textInBox(letter, box),
        'To,\nThe Partner\n[Firm name], Jaipur\n\nI want audit first because it shows me how every number in a business is checked.\n\n' +
        'Thanking you,\nLakshya Khandelwal\n98XXXXXXXX | lakshya.khandelwal@email.com');
    // A numbered list, and a sentence after it.
    const list = [
        item('Thanks for accepting, [first name]! Two quick questions:', 97, 680, 300, 13.5),
        item('1. What work did you get in your first three months?', 97, 660, 280, 13.5),
        item('2. How did you get in: the portal, a mail or a referral?', 97, 640, 290, 13.5),
        item("I'm applying for [domain] articleship at [Firm], [City].", 97, 620, 290, 13.5)
    ];
    assert.equal(core.textInBox(list, box), 'Thanks for accepting, [first name]! Two quick questions:\n1. What work did you get in your first three months?\n' +
        "2. How did you get in: the portal, a mail or a referral?\nI'm applying for [domain] articleship at [Firm], [City].");
    // A prompt made of fields keeps one field per line; a lone "One update:" inside a message does not.
    const fields = [
        item('Write 3 LinkedIn connection notes, each under 180 characters.', 97, 680, 330, 12),
        item('To: [role] at [Firm], [City].', 97, 663, 150, 12), item('Tone: plain Indian English.', 97, 646, 150, 12)
    ];
    assert.equal(core.textInBox(fields, box), 'Write 3 LinkedIn connection notes, each under 180 characters.\nTo: [role] at [Firm], [City].\nTone: plain Indian English.');
    const message = [
        item('Following up on my application for the [City] team.', 97, 680, 280, 13.5),
        item('One update: [your new line].', 97, 660, 150, 13.5)
    ];
    assert.equal(core.textInBox(message, box), 'Following up on my application for the [City] team. One update: [your new line].');
    // "Respected [Sir/Ma'am]," then a lower-case line reads on; a heading keeps its line.
    assert.equal(core.textInBox([item("Respected [Sir/Ma'am],", 97, 680, 120, 12), item('you spoke to our batch.', 97, 663, 130, 12)], box),
        "Respected [Sir/Ma'am], you spoke to our batch.");
    // One item per line (no two lines closer than 1.8x their size): breaks stay even where the next word would not fit.
    const todo = [
        item('Write down every true item from question 2, with its year.', 124.7, 586.7, 348, 13.5),
        item('Finish the weekend stack and start your annual-report project.', 124.7, 557.5, 400, 13.5),
        item('Build your page from The Nothing CV in the CV Builder.', 124.7, 529.1, 336, 13.5)
    ];
    assert.equal(core.textInBox(todo, [79.5, 514.8, 544.8, 644.6]).split('\n').length, 3);
});

test('Copy joins a wrapped line even when its first word is split by a ligature ("fi" + "rst")', () => {
    const box = [79.5, 211.1, 544.8, 397.8];
    const items = [
        item('Read real experiences for both in Experience Explorer – Day 5:', 124.7, 291.9, 374.3, 13.5),
        item('fi', 124.7, 273.2, 7.5, 13.5), item('rst in your city, then across India.', 132.3, 273.2, 195.8, 13.5),
        item('Do one piece of real work in your domain: a job simulation or an', 124.7, 244, 382.5, 13.5),
        item('annual-report project (chapter 4).', 124.7, 225.3, 200.6, 13.5)
    ];
    assert.equal(core.textInBox(items, box),
        'Read real experiences for both in Experience Explorer – Day 5: first in your city, then across India.\n\n' +
        'Do one piece of real work in your domain: a job simulation or an annual-report project (chapter 4).');
});

test('a CV sample (contact line at the top) gets no Copy button; a letter signed with one does', () => {
    assert.ok(core.isCvSample('+91 98XXXXXXXX Reyansh Malhotra reyansh.malhotra@email.com\n\nCA Intermediate cleared | Chandigarh'));
    assert.ok(core.isCvSample('Anvita Joshi\nCA Intermediate cleared, first attempt | Pune\n+91 98XXXXXXXX | anvita.joshi@email.com'));
    assert.ok(core.isCvSample('CAREER OBJECTIVE\n\nNavya Bansal\n\nCA Intermediate cleared\nlinkedin.com/in/navya-xxxxx'));
    // CV templates p28: the contact block comes after a long objective, under CV section headings.
    assert.ok(core.isCvSample('CAREER OBJECTIVE\n\nNavya Bansal\n\n' + 'Ran a first-digit test on 1,800 public expense entries. '.repeat(5) +
        '\n\n+91 98XXXXXXXX\n\nnavya.bansal@email.com\n\nEDUCATION\n\nCA Intermediate'));
    const letter = '[Today’s date]\n\nTo,\nThe Partner\n[Firm name], Jaipur\n\n' + 'I have cleared CA Intermediate. '.repeat(10) +
        '\n\nThanking you,\nLakshya Khandelwal\n98XXXXXXXX | lakshya.khandelwal@email.com';
    assert.ok(!core.isCvSample(letter));
    assert.ok(!core.isCvSample("Respected Sir/Ma'am,\n\nThanking you,\n[Your name]\n[Mobile] | ICAI Reg. No. [number]"));
});

test('Copy button: on the box top border at its right end, and never on a line of text', () => {
    const page = { width: 860, height: 1216 };
    const full = { width: 78, height: 30 };
    const compact = { width: 30, height: 30 };
    const box = { left: 115, top: 400, right: 787, bottom: 600 };
    const line = (left, top, right) => ({ left, top, right, bottom: top + 18 });
    // Room above the box and on its padding: the button straddles the top border, right-aligned.
    let spot = core.copyButtonSpot(box, [line(140, 425, 600)], [full, compact], page);
    assert.deepEqual(spot, { left: 787 - 8 - 78, top: 400 - 15, size: 0 });
    // A tight box whose first line runs to the right edge: the button moves off that line, and covers no text.
    const texts = [line(130, 404, 780), line(130, 426, 780), line(130, 448, 500), line(130, 380, 780)];
    spot = core.copyButtonSpot(box, texts, [full, compact], page);
    const size = [full, compact][spot.size];
    const rect = { left: spot.left, top: spot.top, right: spot.left + size.width, bottom: spot.top + size.height };
    assert.ok(!texts.some(t => rect.left < t.right && rect.right > t.left && rect.top < t.bottom && rect.bottom > t.top), JSON.stringify(spot));
    assert.ok(rect.left >= box.left && rect.right <= page.width);
    // Table rows with no free border: the page margin beside the row, icon-only if the label does not fit there.
    const row = { left: 140, top: 500, right: 787, bottom: 540 };
    const rowTexts = [line(150, 486, 785), line(150, 502, 785), line(150, 520, 785), line(150, 538, 785)];
    spot = core.copyButtonSpot(row, rowTexts, [full, compact], page);
    assert.equal(spot.left, 791);
    assert.equal(spot.size, 1, 'compact in the margin');
});

test('the reader places Copy buttons with copyButtonSpot and skips CV samples', () => {
    const js = fs.readFileSync(path.join(root, 'ca-resource/read/reader.js'), 'utf8');
    assert.match(js, /core\.isCvSample\(text\)/);
    assert.match(js, /core\.copyButtonSpot\(/);
    const css = fs.readFileSync(path.join(root, 'ca-resource/read/reader.css'), 'utf8');
    assert.ok(!/\.rd-copy\s*\{[^}]*transform/.test(css), 'the button is placed by its left/top, not shifted by a transform');
    assert.match(css, /\.rd-copy\.is-compact\s*\{/);
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
