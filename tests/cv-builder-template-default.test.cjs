const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'cv-builder', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'cv-builder', 'cv-script.js'), 'utf8');

function loadPreferredTemplateFile() {
    const start = script.indexOf('function getPreferredTemplateFile');
    const end = script.indexOf('\n        function getSelectedTemplateFile', start);
    assert.notEqual(start, -1, 'template preference helper should exist');
    assert.notEqual(end, -1, 'template preference helper boundary should exist');

    const sandbox = { DEFAULT_TEMPLATE_FILE: 'classic.html' };
    vm.runInNewContext(`${script.slice(start, end)}\nthis.getPreferredTemplateFile = getPreferredTemplateFile;`, sandbox);
    return sandbox.getPreferredTemplateFile;
}

test('Classic is the explicit markup default', () => {
    assert.match(html, /<option value="classic\.html" selected>Classic<\/option>/);
    assert.match(html, /<iframe id="cv-frame" src="classic\.html"><\/iframe>/);
});

test('a saved template preference wins over the Classic default', () => {
    const getPreferredTemplateFile = loadPreferredTemplateFile();
    const available = ['classic.html', 'ledger-layout.html'];

    assert.equal(getPreferredTemplateFile(undefined, available), 'classic.html');
    assert.equal(getPreferredTemplateFile('ledger-layout.html', available), 'ledger-layout.html');
    assert.equal(getPreferredTemplateFile('missing.html', available), 'classic.html');
});
