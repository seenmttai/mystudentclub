// Static guards for the CV builder preview sheet (floating Color / Font / Download pills on the preview pane).
// Regression: the Color pill silently did nothing because the .template-theme-panel markup that
// openPreviewSheet('color') moves into the sheet had been removed from index.html, so
// moveIntoSheet(null) threw "Cannot read properties of null (reading 'before')".
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const html = read('cv-builder/index.html');
const preview = read('cv-builder/cv-preview.js');

test('cv-builder/index.html loads cv-preview.js, which defines openPreviewSheet', () => {
    assert.match(html, /<script src="cv-preview\.js(\?v=[^"]*)?"><\/script>/);
    assert.match(preview, /window\.openPreviewSheet = kind =>/);
    assert.match(preview, /window\.closePreviewSheet = \(\) =>/);
});

test('every openPreviewSheet kind used in the HTML is handled by cv-preview.js', () => {
    const kinds = [...new Set([...html.matchAll(/openPreviewSheet\('([a-z-]+)'\)/g)].map((m) => m[1]))];
    assert.ok(kinds.includes('color') && kinds.includes('font'), `expected color and font pills, got ${kinds.join(', ')}`);
    for (const kind of kinds) {
        const handled = new RegExp(`kind === '${kind}'`).test(preview) || new RegExp(`\\n\\s+${kind}: '`).test(preview);
        assert.ok(handled, `openPreviewSheet('${kind}') has no handler in cv-preview.js`);
    }
});

test('the color sheet has its source panel in the DOM and the sheet guards null moves / showModal failures', () => {
    assert.match(html, /<section class="template-theme-panel"/);
    for (const id of ['template-theme-swatches', 'theme-accent-picker', 'theme-accent-value', 'theme-accent-chip']) {
        assert.ok(html.includes(`id="${id}"`), `index.html is missing #${id} required by renderThemeControls()`);
    }
    assert.match(preview, /function moveIntoSheet\(node\) \{\s*if \(!node\) return false;/);
    assert.match(preview, /try \{[\s\S]*?sheet\.showModal\(\);[\s\S]*?\} catch \(error\) \{[\s\S]*?sheet\.setAttribute\('open', ''\);/);
});
