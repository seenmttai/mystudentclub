const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'cv-builder', 'cv-script.js');

function readCvScript() {
    return fs.readFileSync(scriptPath, 'utf8');
}

function loadDownloadHelper(overrides = {}) {
    const source = readCvScript();
    const start = source.indexOf('function triggerBlobDownload');
    const end = source.indexOf('function toggleDownloadMenu', start);

    assert.notEqual(start, -1, 'download helper should exist');
    assert.notEqual(end, -1, 'download helper boundary should exist');

    const link = {
        style: {},
        clickCalled: false,
        removed: false,
        click() {
            this.clickCalled = true;
        },
        remove() {
            this.removed = true;
        },
        ...overrides.link,
    };
    const timers = [];
    const revokedUrls = [];
    const sandbox = {
        URL: {
            createObjectURL: () => 'blob:test-download',
            revokeObjectURL: (url) => revokedUrls.push(url),
        },
        document: {
            createElement: (tagName) => {
                assert.equal(tagName, 'a');
                return link;
            },
            body: {
                appendChild: (element) => {
                    assert.equal(element, link);
                    link.appended = true;
                },
            },
        },
        setTimeout: (callback, delay) => timers.push({ callback, delay }),
    };

    vm.runInNewContext(
        `${source.slice(start, end)}\nthis.triggerBlobDownload = triggerBlobDownload;`,
        sandbox,
    );

    return { ...sandbox, link, timers, revokedUrls };
}

function loadDeviceSaveHelpers({
    userAgent = 'Mozilla/5.0 (Linux; Android 14; Tablet)',
    platform = 'Linux armv8l',
    maxTouchPoints = 5,
    shareSupported = true,
} = {}) {
    const source = readCvScript();
    const start = source.indexOf('let pendingDeviceSave');
    const end = source.indexOf('function triggerBlobDownload', start);
    assert.notEqual(start, -1, 'device save helpers should exist');
    assert.notEqual(end, -1, 'device save helper boundary should exist');

    function createClassList() {
        const values = new Set();
        return {
            add: (value) => values.add(value),
            remove: (value) => values.delete(value),
            contains: (value) => values.has(value),
            toggle(value, force) {
                if (force) values.add(value);
                else values.delete(value);
            },
        };
    }

    const elements = {
        'device-save-overlay': {
            classList: createClassList(),
            attributes: {},
            setAttribute(name, value) {
                this.attributes[name] = value;
            },
        },
        'device-save-share': {
            classList: createClassList(),
            hidden: false,
            disabled: false,
            isConnected: true,
        },
        'device-save-print': { classList: createClassList() },
        'device-save-text': { textContent: '' },
        'device-save-status': { textContent: '' },
        'cv-frame': {
            contentWindow: {
                focus() {
                    this.focusCalled = true;
                },
                print() {
                    this.printCalled = true;
                },
            },
        },
    };
    const sharedPayloads = [];
    const toasts = [];

    class FakeFile {
        constructor(parts, name, options) {
            this.parts = parts;
            this.name = name;
            this.type = options.type;
            this.lastModified = options.lastModified;
        }
    }

    const sandbox = {
        navigator: {
            userAgent,
            platform,
            maxTouchPoints,
            canShare: shareSupported ? ({ files }) => files?.[0]?.type === 'application/pdf' : undefined,
            share: shareSupported ? async (payload) => sharedPayloads.push(payload) : undefined,
        },
        File: FakeFile,
        document: {
            getElementById: (id) => elements[id] || null,
        },
        showToast: (message) => toasts.push(message),
    };

    vm.runInNewContext(
        `${source.slice(start, end)}\nObject.assign(this, { shouldUseDeviceSaveFlow, openDeviceSaveModal, sharePreparedCvFile, printPreparedCv });`,
        sandbox,
    );

    return { ...sandbox, elements, sharedPayloads, toasts };
}

test('keeps the blob URL alive until the browser has accepted the download', () => {
    const context = loadDownloadHelper();
    const blob = { size: 123 };

    context.triggerBlobDownload(blob, 'resume.pdf');

    assert.equal(context.link.href, 'blob:test-download');
    assert.equal(context.link.download, 'resume.pdf');
    assert.equal(context.link.style.display, 'none');
    assert.equal(context.link.appended, true);
    assert.equal(context.link.clickCalled, true);
    assert.deepEqual(context.revokedUrls, []);
    assert.deepEqual(context.timers.map(({ delay }) => delay), [0, 60_000]);

    context.timers[0].callback();
    assert.equal(context.link.removed, true);
    assert.deepEqual(context.revokedUrls, []);

    context.timers[1].callback();
    assert.deepEqual(context.revokedUrls, ['blob:test-download']);
});

test('cleans up immediately if starting the download throws', () => {
    const downloadError = new Error('download blocked');
    const context = loadDownloadHelper({
        link: {
            click() {
                throw downloadError;
            },
        },
    });

    assert.throws(
        () => context.triggerBlobDownload({ size: 123 }, 'resume.pdf'),
        downloadError,
    );
    assert.equal(context.link.removed, true);
    assert.deepEqual(context.revokedUrls, ['blob:test-download']);
    assert.deepEqual(context.timers, []);
});

test('routes Android tablets and desktop-mode iPads to the device save flow', () => {
    const android = loadDeviceSaveHelpers();
    assert.equal(android.shouldUseDeviceSaveFlow(), true);

    const ipad = loadDeviceSaveHelpers({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
        platform: 'MacIntel',
        maxTouchPoints: 5,
    });
    assert.equal(ipad.shouldUseDeviceSaveFlow(), true);

    const desktop = loadDeviceSaveHelpers({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        platform: 'Win32',
        maxTouchPoints: 0,
    });
    assert.equal(desktop.shouldUseDeviceSaveFlow(), false);
});

test('shares the generated PDF through the tablet device menu', async () => {
    const context = loadDeviceSaveHelpers();
    const blob = { size: 123, type: 'application/pdf' };

    assert.equal(context.openDeviceSaveModal(blob, 'resume.pdf'), true);
    assert.equal(context.elements['device-save-overlay'].classList.contains('open'), true);
    assert.equal(context.elements['device-save-share'].hidden, false);

    await context.sharePreparedCvFile();

    assert.equal(context.sharedPayloads.length, 1);
    assert.equal(context.sharedPayloads[0].files[0].name, 'resume.pdf');
    assert.equal(context.sharedPayloads[0].files[0].type, 'application/pdf');
    assert.equal(context.elements['device-save-overlay'].classList.contains('open'), false);
    assert.deepEqual(context.toasts, ['PDF sent to your device save menu']);
});

test('offers native print-to-PDF when file sharing is unavailable', () => {
    const context = loadDeviceSaveHelpers({ shareSupported: false });
    const blob = { size: 123, type: 'application/pdf' };

    context.openDeviceSaveModal(blob, 'resume.pdf');

    assert.equal(context.elements['device-save-share'].hidden, true);
    assert.equal(context.elements['device-save-print'].classList.contains('btn-primary'), true);
    context.printPreparedCv();
    assert.equal(context.elements['cv-frame'].contentWindow.focusCalled, true);
    assert.equal(context.elements['cv-frame'].contentWindow.printCalled, true);
    assert.equal(context.elements['device-save-overlay'].classList.contains('open'), false);
});
