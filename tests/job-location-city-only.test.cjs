// One location style (6 Nov 2026). The SQL lives on master (migration 202611060004); the app's city filter
// also searches the other name of a city.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

test('city filter also searches the other name of a city (portal and jobs by email)', () => {
  for (const file of ['portal3.js', 'portal-email.js']) {
    const source = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
    const start = source.indexOf('const CITY_ALIASES');
    const end = source.indexOf('\n}\n', source.indexOf('function expandLocationTerms', start)) + 2;
    const ctx = {};
    vm.runInNewContext(`${source.slice(start, end)}; this.fn = expandLocationTerms;`, ctx);
    assert.deepEqual([...ctx.fn(['Bangalore'])], ['Bangalore', 'bengaluru'], file);
    assert.deepEqual([...ctx.fn(['Gurugram', 'Noida'])], ['Gurugram', 'gurgaon', 'Noida'], file);
    assert.deepEqual([...ctx.fn(['Delhi'])], ['Delhi', 'new delhi'], file);
    assert.match(source, /expandLocationTerms\(state\.locations\)/, file);
  }
});

