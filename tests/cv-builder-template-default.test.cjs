// Adapted from canonical master tests/cv-builder-template-default.test.cjs for the mobile CV builder.
// Mobile keeps a hidden #template-select; Classic must be the first/default option and the preview iframe default,
// and a saved template (state.templateFile) must win over the Classic fallback.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const html = read('cv-builder/index.html');
const script = read('cv-builder/cv-script.js');

test('Classic is the first template option and the preview default', () => {
    const select = html.match(/<select id="template-select"[^>]*>\s*<option value="([^"]+)"/);
    assert.ok(select, 'template select should exist');
    assert.equal(select[1], 'classic.html');
    assert.match(html, /<iframe id="cv-frame" src="classic\.html"><\/iframe>/);
});

test('selected template falls back to Classic', () => {
    assert.match(script, /function getSelectedTemplateFile\(\) \{\s*return document\.getElementById\('template-select'\)\?\.value \|\| 'classic\.html';/);
});

test('a saved template preference wins over the Classic default', () => {
    assert.match(script, /const rawTemplate = state\.templateFile \|\| 'classic\.html';/);
});
