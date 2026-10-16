// Adapted from canonical master tests/cv-builder-download.test.cjs for the Airy Flow mobile CV builder.
// Master exposes triggerBlobDownload(); the mobile builder's equivalent is deliverDownloadedBlob() with the Flutter
// blobToBase64Handler bridge (kept as-is). These assertions pin the same contract: the blob URL must outlive the
// click, cleanup must still run when the click throws, and the native bridge receives base64 + filename.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'cv-builder', 'cv-script.js'), 'utf8').replace(/\r\n/g, '\n');

function loadHelper(overrides = {}) {
    const start = source.indexOf('function blobToBase64');
    const end = source.indexOf('async function deliverDownloadedBlob', start);
    const endFn = source.indexOf('\n}\n', end) + 3;
    assert.notEqual(start, -1, 'blobToBase64 helper should exist');
    assert.notEqual(end, -1, 'deliverDownloadedBlob should exist');

    const link = { style: {}, clickCalled: false, removed: false, click() { this.clickCalled = true; }, remove() { this.removed = true; }, ...overrides.link };
    const timers = [];
    const revokedUrls = [];
    class FakeReader {
        readAsDataURL() { this.result = 'data:application/pdf;base64,QUJD'; setTimeout(() => this.onload && this.onload(), 0); }
    }
    const sandbox = {
        window: { flutter_inappwebview: overrides.bridge },
        URL: { createObjectURL: () => 'blob:test-download', revokeObjectURL: (u) => revokedUrls.push(u) },
        document: { createElement: (t) => { assert.equal(t, 'a'); return link; }, body: { appendChild: (el) => { assert.equal(el, link); link.appended = true; } } },
        setTimeout: (cb, delay) => { timers.push({ cb, delay }); if (delay === 0) cb(); },
        FileReader: FakeReader, String, Error, Promise,
    };
    vm.runInNewContext(`${source.slice(start, endFn)}\nthis.deliverDownloadedBlob = deliverDownloadedBlob;`, sandbox);
    return { ...sandbox, link, timers, revokedUrls };
}

test('keeps the blob URL alive until the browser has accepted the download', async () => {
    const ctx = loadHelper();
    await ctx.deliverDownloadedBlob({ size: 123 }, 'resume.pdf');
    assert.equal(ctx.link.href, 'blob:test-download');
    assert.equal(ctx.link.download, 'resume.pdf');
    assert.equal(ctx.link.clickCalled, true);
    assert.equal(ctx.link.removed, true);
    assert.deepEqual(ctx.revokedUrls, []);
    const revoke = ctx.timers.find((t) => t.delay >= 60000);
    assert.ok(revoke, 'revocation must be delayed');
    revoke.cb();
    assert.deepEqual(ctx.revokedUrls, ['blob:test-download']);
});

test('removes the link even if starting the download throws', async () => {
    const err = new Error('download blocked');
    const ctx = loadHelper({ link: { click() { throw err; } } });
    await assert.rejects(() => ctx.deliverDownloadedBlob({ size: 1 }, 'resume.pdf'), err);
    assert.equal(ctx.link.removed, true);
});

test('hands the file to the Flutter bridge when running in the app', async () => {
    const calls = [];
    const ctx = loadHelper({ bridge: { callHandler: async (name, b64, filename) => { calls.push([name, b64, filename]); } } });
    await ctx.deliverDownloadedBlob({ size: 3 }, 'resume.pdf');
    assert.deepEqual(calls, [['blobToBase64Handler', 'QUJD', 'resume.pdf']]);
    assert.equal(ctx.link.clickCalled, false);
});
