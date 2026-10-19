const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');

function setupViewer() {
    const html = fs.readFileSync(path.join(root, 'ca-resource/index.html'), 'utf8');
    const css = fs.readFileSync(path.join(root, 'ca-resource/style.css'), 'utf8');
    const script = fs.readFileSync(path.join(root, 'ca-resource/script.js'), 'utf8');
    const dom = new JSDOM(html, {
        url: 'https://mystudentclub.com/ca-resource/index.html?pdf=test.pdf',
        runScripts: 'outside-only'
    });
    const { window } = dom;
    const style = window.document.createElement('style');
    style.textContent = css;
    window.document.head.appendChild(style);

    const viewer = window.document.getElementById('viewer-area');
    const flipbook = window.document.getElementById('flipbook');
    Object.defineProperties(viewer, {
        clientWidth: { value: 375 },
        clientHeight: { value: 600 }
    });
    viewer.style.padding = '4px';
    let bookSize = { width: 900, height: 900 };
    const turnCalls = [];
    window.$ = () => ({
        turn(command, value) {
            turnCalls.push([command, value]);
            if (command === 'size') return bookSize;
        }
    });
    let capturedPointer = null;
    viewer.setPointerCapture = id => { capturedPointer = id; };
    viewer.hasPointerCapture = id => capturedPointer === id;
    viewer.releasePointerCapture = id => {
        if (capturedPointer === id) capturedPointer = null;
    };

    window.eval(script);
    const pointer = (type, options = {}) => {
        const event = new window.MouseEvent(type, { bubbles: true });
        Object.defineProperties(event, {
            pointerId: { value: options.id ?? 1 },
            pointerType: { value: options.pointerType ?? 'mouse' },
            clientX: { value: options.x ?? 0 },
            clientY: { value: options.y ?? 0 },
            button: { value: options.button ?? 0 }
        });
        (options.target ?? viewer).dispatchEvent(event);
    };
    return { dom, window, viewer, flipbook, turnCalls, pointer,
        setBookSize: size => { bookSize = size; } };
}

test('enlarged mobile viewer permits scrolling and restores normal layout after fitting', () => {
    const app = setupViewer();
    try {
        const { window, viewer, flipbook, turnCalls } = app;
        assert.equal(window.getComputedStyle(flipbook).getPropertyValue('touch-action'), 'pan-x pan-y');
        window.eval('checkOverflow()');
        assert.equal(viewer.style.cursor, 'grab');
        assert.equal(flipbook.style.margin, '20px auto');
        assert.deepEqual(turnCalls.at(-1), ['disable', true]);

        app.setBookSize({ width: 300, height: 500 });
        window.eval('checkOverflow()');
        assert.equal(viewer.style.cursor, 'default');
        assert.equal(flipbook.style.margin, 'auto');
        assert.deepEqual(turnCalls.at(-1), ['disable', false]);
    } finally {
        app.dom.window.close();
    }
});

test('dragging a zoomed page scrolls with a mouse, but touch and controls are left alone', () => {
    const app = setupViewer();
    try {
        const { window, viewer, pointer } = app;
        window.eval('checkOverflow()');
        viewer.scrollLeft = 150;
        viewer.scrollTop = 200;

        pointer('pointerdown', { pointerType: 'touch', x: 200, y: 100 });
        pointer('pointermove', { pointerType: 'touch', x: 160, y: 80 });
        assert.equal(viewer.scrollLeft, 150);

        const button = window.document.createElement('button');
        viewer.appendChild(button);
        pointer('pointerdown', { target: button, x: 200, y: 100 });
        pointer('pointermove', { x: 160, y: 80 });
        assert.equal(viewer.scrollLeft, 150);

        pointer('pointerdown', { x: 200, y: 100 });
        pointer('pointermove', { x: 160, y: 80 });
        assert.equal(viewer.scrollLeft, 190);
        assert.equal(viewer.scrollTop, 220);
        assert.equal(viewer.style.cursor, 'grabbing');
        pointer('pointerup', { x: 160, y: 80 });
        assert.equal(viewer.style.cursor, 'grab');
    } finally {
        app.dom.window.close();
    }
});
