const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

test('legacy CV editor keeps dynamic fields named and template/section controls keyboard accessible', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'cv-builder2.html'), 'utf8');
  // External scripts/resources are not loaded. The local inline editor initializes
  // with its existing sample CV; no conversion, upload, or export is requested.
  const dom = new JSDOM(source, { runScripts: 'dangerously', virtualConsole: new VirtualConsole() });
  const { document, KeyboardEvent } = dom.window;
  try {
    const fields = [...document.querySelectorAll('.edu-item input, .exp-item input, .exp-item textarea, .del-btn')];
    assert.ok(fields.length > 10);
    assert.ok(fields.every(node => node.getAttribute('aria-label')?.trim()));
    const template = document.getElementById('t2-thumb');
    assert.equal(template.tagName, 'BUTTON');
    template.click();
    assert.equal(template.getAttribute('aria-pressed'), 'true');
    assert.equal(document.querySelectorAll('.t-thumb[aria-pressed="true"]').length, 1);
    assert.equal(document.getElementById('cv-page').className, 'page t2');
    const section = document.querySelector('.sec-head');
    section.focus();
    section.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    assert.equal(section.getAttribute('aria-expanded'), 'false');
    section.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    assert.equal(section.getAttribute('aria-expanded'), 'true');
    const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
    assert.equal(new Set(ids).size, ids.length);
  } finally {
    dom.window.close();
  }
});
