const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// 6 Nov 2026: the app's Articleship filter sheet gets Big 4 / Big 6 / Big 10 / Other firms. "Firm Type" is set by the
// database from the firm's name (master migration 202611060003); tiers are cumulative.
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/portal3.js'), 'utf8');
const page = fs.readFileSync(path.join(root, 'ca-articleship-jobs.html'), 'utf8');

function run(firmType, table = 'Articleship Jobs') {
  const start = source.indexOf('const FIRM_TYPE_TIERS');
  const end = source.indexOf('\n}\n', source.indexOf('function applyFirmTypeFilter', start)) + 2;
  const calls = [];
  const q = { in: (...a) => (calls.push(['in', ...a]), q), is: (...a) => (calls.push(['is', ...a]), q), eq: (...a) => (calls.push(['eq', ...a]), q) };
  vm.runInNewContext(`${source.slice(start, end)}; applyFirmTypeFilter(q);`, { state: { firmType }, currentTable: table, q });
  return JSON.parse(JSON.stringify(calls));
}

test('tiers are cumulative; Other firms = no Big tier; only on Articleship', () => {
  assert.deepEqual(run('Big 4'), [['in', 'Firm Type', ['Big 4']]]);
  assert.deepEqual(run('Big 6'), [['in', 'Firm Type', ['Big 4', 'Big 6']]]);
  assert.deepEqual(run('Big 10'), [['in', 'Firm Type', ['Big 4', 'Big 6', 'Big 10']]]);
  assert.deepEqual(run('Other'), [['is', 'Firm Type', null]]);
  assert.deepEqual(run(''), []);
  assert.deepEqual(run('Big 4', 'Industrial Training Job Portal'), []);
});

test('the Articleship sheet offers the five choices and the query applies them', () => {
  for (const v of ['', 'Big 4', 'Big 6', 'Big 10', 'Other']) assert.ok(page.includes(`data-firm="${v}"`), v);
  assert.match(source, /query = applyFirmTypeFilter\(query\);/);
  assert.match(source, /state\.firmType = "";\n\s*if \(dom\.sortBySelect\) dom\.sortBySelect\.value = "popular";/); // Reset clears it
});

test('application-status buttons no longer react to the firm pills', () => {
  assert.doesNotMatch(source, /#filterSheet \.pill-toggle/);
  assert.match(source, /#appStatusFilterGroup \.pill-toggle/);
});
