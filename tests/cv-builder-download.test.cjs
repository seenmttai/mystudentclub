const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadDownloadHelper(overrides = {}) {
    const scriptPath = path.join(__dirname, '..', 'cv-builder', 'cv-script.js');
    const source = fs.readFileSync(scriptPath, 'utf8');
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
