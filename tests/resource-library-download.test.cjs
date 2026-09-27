// Run with NODE_PATH pointing at the same jsdom installation used by career-profile tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const tick = () => new Promise(resolve => setImmediate(resolve));
function harness(response) {
    const root = path.join(__dirname, '..');
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'ca-industrial-training-resources.html'), 'utf8'), { url: 'https://mystudentclub.com/ca-industrial-training-resources', runScripts: 'outside-only' });
    const downloads = [], previews = [];
    dom.window.open = (url, target, features) => previews.push({ url, target, features });
    dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push({ href: this.href, filename: this.download }); };
    dom.window.URL.createObjectURL = () => 'blob:https://mystudentclub.com/verified-file';
    dom.window.URL.revokeObjectURL = () => {};
    dom.window.supabaseClient = { rpc: async () => ({ data: [] }) };
    dom.window.MSCCareerProfile = { ensureForResource: async () => true };
    dom.window.fetch = async () => { if (response instanceof Error) throw response; return response; };
    dom.window.eval(fs.readFileSync(path.join(root, 'scripts/resource-form-collector.js'), 'utf8'));
    dom.window.eval(fs.readFileSync(path.join(root, 'scripts/resource-library.js'), 'utf8'));
    return { dom, downloads, previews };
}

test('same-origin Word downloads use a Blob and readable name despite server filename headers', async () => {
    const { dom, downloads } = harness({ ok: true, headers: { get: key => key === 'content-type' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'inline; filename="bad%20name.docx"' }, blob: async () => ({ size: 100 }) });
    await tick();
    dom.window.document.querySelector('button[aria-label="Download DOCX: CV Template 2"]').click();
    await tick(); await tick();
    assert.deepEqual(downloads, [{ href: 'blob:https://mystudentclub.com/verified-file', filename: 'Industrial Training CV Template 2.docx' }]);
    dom.window.close();
});

test('HTTP, network, HTML fallback, and empty-file failures display an error without downloading', async () => {
    for (const response of [
        { ok: false, headers: { get: () => '' } },
        new Error('Network failed'),
        { ok: true, headers: { get: () => 'text/html' }, blob: async () => ({ size: 100 }) },
        { ok: true, headers: { get: () => 'application/octet-stream' }, blob: async () => ({ size: 0 }) }
    ]) {
        const { dom, downloads } = harness(response);
        await tick();
        dom.window.document.querySelector('button[aria-label="Download DOCX: CV Template 2"]').click();
        await tick(); await tick();
        assert.equal(downloads.length, 0);
        assert.match(dom.window.document.getElementById('resource-access-error').textContent, /This download could not be completed\. Please try again\./);
        dom.window.close();
    }
});


test('a guest who completed intake previews the public PDF without entering the login-only LMS viewer', async () => {
    const { dom, previews } = harness({});
    await tick();
    let intakeCalls = 0;
    dom.window.MSCCareerProfile.ensureForResource = async () => { intakeCalls++; return true; };
    dom.window.document.querySelector('button[aria-label="Preview: CV Template 3"]').click();
    await tick(); await tick();
    assert.equal(intakeCalls, 1);
    assert.deepEqual(previews, [{ url: 'https://mystudentclub.com/assets/ca-industrial-resources/Industrial_Training_CV_Template_1.pdf', target: '_blank', features: 'noopener,noreferrer' }]);
    dom.window.close();
});

test('Industrial CV Template 3 downloads with its displayed number rather than the legacy source filename', async () => {
    const { dom, downloads } = harness({ ok: true, headers: { get: () => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }, blob: async () => ({ size: 100 }) });
    await tick();
    dom.window.document.querySelector('button[aria-label="Download DOCX: CV Template 3"]').click();
    await tick(); await tick();
    assert.equal(downloads[0].filename, 'Industrial Training CV Template 3.docx');
    dom.window.close();
});
