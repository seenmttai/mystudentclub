const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Joining pill (6 Nov 2026, Aniket). joining_label is set by the database (master's migration
// 202611060002_it_joining_label.sql); the app shows it on Industrial Training cards and in the job sheet.
const portal = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'portal3.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'portal-style.css'), 'utf8');

test('Industrial Training columns include joining_label', () => {
  assert.match(portal, /is_exclusive, "Company Type", "Industry Type", joining_label'/);
});

test('card and job sheet show the pill only for Industrial Training', () => {
  const pills = portal.match(/currentTable === "Industrial Training Job Portal" && job\.joining_label \? `<span class="jc-chip jc-chip-joining">/g) || [];
  assert.equal(pills.length, 2);
  assert.match(css, /\.jc-chip-joining \{/);
  assert.match(css, /\[data-theme="dark"\] \.jc-chip-joining \{/);
});
