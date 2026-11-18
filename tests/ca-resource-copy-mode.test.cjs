const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const core = require('../ca-resource/reader-core.js');

const root = path.join(__dirname, '..');
const ARTICLESHIP = 'https://auth.mystudentclub.com/storage/v1/object/sign/articleship-program-resources/articleship-program-v3/day-2/Application%20templates.pdf?token=t';
const INDUSTRIAL = 'https://auth.mystudentclub.com/storage/v1/object/sign/industrial-training-mastery-resources/MSCIT%20Guidebook-3.pdf?token=t';
const OPS = { save: 10, restore: 11, transform: 12, moveTo: 13, lineTo: 14, curveTo: 15, curveTo2: 16, curveTo3: 17, closePath: 18,
    rectangle: 19, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28,
    setGState: 9, setFillRGBColor: 59, setFillGray: 57, setFillColor: 55, setFillColorN: 56, constructPath: 91,
    paintFormXObjectBegin: 74, paintFormXObjectEnd: 75 };

/** The flipbook page as a student opens it, with pdf.js and turn.js stubbed (they are not needed for these parts). */
function openViewer(query, { clipboard } = {}) {
    const html = fs.readFileSync(path.join(root, 'ca-resource/index.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'https://mobile.mystudentclub.com/ca-resource/?' + query, runScripts: 'outside-only' });
    const { window } = dom;
    window.$ = () => ({ turn: () => ({ width: 600, height: 800 }) });
    window.pdfjsLib = { OPS };
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    if (clipboard) Object.defineProperty(window.navigator, 'clipboard', { value: clipboard, configurable: true });
    window.eval(fs.readFileSync(path.join(root, 'ca-resource/reader-core.js'), 'utf8'));
    // The script's top-level const/let stay inside this eval; getters returned by the same eval read them.
    const state = window.eval(fs.readFileSync(path.join(root, 'ca-resource/script.js'), 'utf8') +
        '\n;({ copyMode: () => copyMode, initialPage: () => INITIAL_PAGE, pendingCopyText: () => pendingCopyText, setPdfDoc: doc => { pdfDoc = doc; } })');
    return { dom, window, state };
}

const q = (pdf, extra = '') => 'pdf=' + encodeURIComponent(pdf) + extra;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function item(str, x, y, w, h = 11) { return { str, transform: [h, 0, 0, h, x, y], width: w, height: h }; }

// An A4 page at scale 1: pdf.js flips y (page space has y up, the screen has y down).
const viewport = { width: 595, height: 842, convertToViewportRectangle: ([x1, y1, x2, y2]) => [x1, 842 - y1, x2, 842 - y2] };
const white = new Uint8ClampedArray([255, 255, 255]);
const MAIL_BOX = [80, 300, 545, 560];
const mailOps = { fnArray: [OPS.setFillRGBColor, OPS.constructPath, OPS.fill], argsArray: [white, [[OPS.rectangle], [80, 300, 465, 260], null], null] };
const mailItems = [item("Respected Sir/Ma'am,", 90, 540, 120), item('I can join from [date].', 90, 515, 140), item('Thanking you,', 90, 470, 80), item('[Your name]', 90, 454, 70)];
const page = (pageNumber, ops, items, annotations = []) => ({
    pageNumber, getOperatorList: async () => ops, getTextContent: async () => ({ items }), getAnnotations: async () => annotations
});

function pageDiv(window) {
    const div = window.document.createElement('div');
    const canvas = window.document.createElement('canvas');
    div.appendChild(canvas);
    window.document.body.appendChild(div);
    return { div, canvas };
}

test('copy mode needs ?copy=1 and a signed link into the Articleship bucket; ?page and ?title are read', () => {
    let app = openViewer(q(ARTICLESHIP, '&copy=1&page=3&title=Application%20templates'));
    assert.equal(app.state.copyMode(), true);
    assert.equal(app.state.initialPage(), 3);
    assert.equal(app.window.document.title, 'Application templates | My Student Club');
    app.window.eval('setDocumentTitle')(null);
    assert.equal(app.window.document.getElementById('doc-title').textContent, 'Application templates', 'the header shows the row title');
    app.dom.window.close();

    app = openViewer(q(INDUSTRIAL, '&copy=1'));
    assert.equal(app.state.copyMode(), false, 'an Industrial file stays protected even with ?copy=1');
    app.dom.window.close();

    app = openViewer(q(ARTICLESHIP));
    assert.equal(app.state.copyMode(), false, 'no ?copy=1, no copy mode');
    assert.equal(app.state.initialPage(), 1);
    app.dom.window.close();

    app = openViewer(q(ARTICLESHIP, '&copy=1#page=9'));
    assert.equal(app.state.initialPage(), 9, '#page=N works too');
    app.dom.window.close();
});

test('a template box gets one Copy button that copies its text; a CV sample gets none', async () => {
    const written = [];
    const app = openViewer(q(ARTICLESHIP, '&copy=1'), { clipboard: { writeText: async text => { written.push(text); } } });
    try {
        const { window } = app;
        const { div, canvas } = pageDiv(window);
        await window.eval('renderCopyLayer')(page(2, mailOps, mailItems), viewport, div, canvas);
        const buttons = div.querySelectorAll('.pdf-copy-layer .pdf-copy-btn');
        assert.equal(buttons.length, 1);
        const button = buttons[0];
        assert.equal(button.type, 'button');
        // On the box's top border at its right end (page px): it never sits on one of the box's lines.
        assert.ok(parseFloat(button.style.left) > 400 && parseFloat(button.style.top) < 842 - 560 + 30, button.style.cssText);
        button.click();
        await tick(); await tick();
        assert.deepEqual(written, [core.textInBox(mailItems, MAIL_BOX)]);
        assert.match(written[0], /^Respected Sir\/Ma'am,\n/);
        assert.match(window.document.getElementById('copy-toast').textContent, /Fill in the \[brackets\]/);
        assert.equal(button.querySelector('span').textContent, 'Copied');

        const cv = pageDiv(window);
        const cvItems = [item('+91 98XXXXXXXX | anvita.joshi@email.com', 90, 540, 300), item('EDUCATION', 90, 515, 80)];
        await window.eval('renderCopyLayer')(page(5, mailOps, cvItems), viewport, cv.div, cv.canvas);
        assert.equal(cv.div.querySelectorAll('.pdf-copy-btn').length, 0, 'CV samples are to look at, not to paste');
    } finally {
        app.dom.window.close();
    }
});

test('a page re-rendered meanwhile (zoom, fit, search) gets no stale buttons; the box text is worked out once per page', async () => {
    const app = openViewer(q(ARTICLESHIP, '&copy=1'), { clipboard: { writeText: async () => {} } });
    try {
        const { window } = app;
        let reads = 0;
        const counted = { pageNumber: 7, getOperatorList: async () => { reads += 1; return mailOps; }, getTextContent: async () => ({ items: mailItems }) };
        const old = pageDiv(window);
        const pending = window.eval('renderCopyLayer')(counted, viewport, old.div, old.canvas);
        old.div.innerHTML = ''; // the render this was for is gone
        await pending;
        assert.equal(old.div.querySelectorAll('.pdf-copy-btn').length, 0);
        const fresh = pageDiv(window);
        await window.eval('renderCopyLayer')(counted, viewport, fresh.div, fresh.canvas);
        assert.equal(fresh.div.querySelectorAll('.pdf-copy-btn').length, 1);
        assert.equal(reads, 1, 'operator list read once for the page');
    } finally {
        app.dom.window.close();
    }
});

test('copying stays blocked; only a Copy button puts its own text in, also where the clipboard API is missing', async () => {
    const app = openViewer(q(ARTICLESHIP, '&copy=1'));
    try {
        const { window } = app;
        const copyEvent = () => {
            const set = [];
            const event = new window.Event('copy', { bubbles: true, cancelable: true });
            Object.defineProperty(event, 'clipboardData', { value: { setData: (type, value) => set.push([type, value]) } });
            window.document.dispatchEvent(event);
            return { event, set };
        };
        const plain = copyEvent();
        assert.equal(plain.event.defaultPrevented, true, 'a normal copy is blocked');
        assert.deepEqual(plain.set, [], 'and carries nothing');

        let fallback = null;
        window.document.execCommand = command => { fallback = copyEvent(); return command === 'copy'; };
        assert.equal(await window.eval('copyToClipboard')('Thanking you,\n[Your name]'), true);
        assert.deepEqual(fallback.set, [['text/plain', 'Thanking you,\n[Your name]']]);
        assert.equal(app.state.pendingCopyText(), null, 'the unblock lasts for that one copy only');
        assert.equal(window.document.querySelector('.copy-fallback'), null, 'the hidden field is removed');
        assert.deepEqual(copyEvent().set, [], 'the next copy is blocked again');
    } finally {
        app.dom.window.close();
    }
});

test('taps on a Copy button or a link never reach the page-flip, pan and swipe handlers', async () => {
    const app = openViewer(q(ARTICLESHIP, '&copy=1'), { clipboard: { writeText: async () => {} } });
    try {
        const { window } = app;
        const { div, canvas } = pageDiv(window);
        const reached = [];
        ['pointerdown', 'mousedown', 'touchstart', 'touchend'].forEach(type => div.addEventListener(type, () => reached.push(type)));
        await window.eval('renderCopyLayer')(page(2, mailOps, mailItems), viewport, div, canvas);
        const button = div.querySelector('.pdf-copy-btn');
        ['pointerdown', 'mousedown', 'touchstart', 'touchend'].forEach(type => button.dispatchEvent(new window.Event(type, { bubbles: true })));
        assert.deepEqual(reached, []);
    } finally {
        app.dom.window.close();
    }
});

test('copy-mode links: in-document links go to their page, MSC links stay on the site, javascript: links are dropped', async () => {
    const app = openViewer(q(ARTICLESHIP, '&copy=1'));
    try {
        const { window } = app;
        const { div } = pageDiv(window);
        const rect = [100, 700, 300, 720];
        const annotations = [
            { subtype: 'Link', url: 'https://www.mystudentclub.com/learning-management-system/course?course=msc-articleship-program&session=2', rect },
            { subtype: 'Link', unsafeUrl: 'javascript:alert(1)', rect },
            { subtype: 'Link', url: 'mailto:hr@firm.example', rect },
            { subtype: 'Link', dest: 'question-3', rect }
        ];
        await window.eval('renderAnnotationLayer')(page(1, mailOps, [], annotations), viewport, div);
        const links = [...div.querySelectorAll('.pdf-annotation-layer a')];
        assert.equal(links.length, 3);
        assert.equal(links[0].getAttribute('href'), '/learning-management-system/course?course=msc-articleship-program&session=2');
        assert.equal(links[0].target, '', 'in the app an MSC link opens in place (the WebView has no second tab)');
        assert.equal(links[1].getAttribute('href'), 'mailto:hr@firm.example');
        assert.equal(links[1].target, '');
        const visited = [];
        app.state.setPdfDoc({ getDestination: async () => [{ num: 40 }], getPageIndex: async () => 11 });
        window.goToPage = n => visited.push(n);
        links[2].dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
        await tick(); await tick();
        assert.deepEqual(visited, [12]);
    } finally {
        app.dom.window.close();
    }
});

test('other courses keep the old reader exactly: their old link layer, no Copy buttons', async () => {
    const app = openViewer(q(INDUSTRIAL));
    try {
        const { window } = app;
        const { div } = pageDiv(window);
        await window.eval('renderAnnotationLayer')(page(1, mailOps, [], [{ subtype: 'Link', url: 'https://www.icai.org/', rect: [100, 700, 300, 720] }]), viewport, div);
        const link = div.querySelector('.pdf-annotation-layer a');
        assert.equal(link.href, 'https://www.icai.org/');
        assert.equal(link.target, '_blank');
        assert.equal(app.state.copyMode(), false);
        assert.equal(div.querySelector('.pdf-copy-btn'), null);
    } finally {
        app.dom.window.close();
    }
});
