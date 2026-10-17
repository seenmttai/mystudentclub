const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
// scripts/ has no package.json "type": "module", so load the browser module as source.
const load = () => import(`data:text/javascript,${encodeURIComponent(fs.readFileSync(path.join(root, 'scripts', 'pay-parse.js'), 'utf8'))}`);

test('pay text becomes the bottom of the range in rupees', async () => {
  const { payMinimum } = await load();
  const cases = [
    ['10000-25000', 10000],
    ['₹3.5 - 4.5 LPA', 350000],
    ['12 LPA', 1200000],
    ['50k', 50000],
    ['15,000/month', 15000],
    ['8-10 lakhs', 800000],
    ['', ''],
    ['Not disclosed', ''],
    ['Best in industry', ''],
    ['50000 per month or 1200000', 50000],
    ['₹ 6,00,000 p.a.', 600000],
    ['1,200,000', 1200000],
    ['Rs 25000 - Rs 30000', 25000],
    ['10 to 12 LPA', 1000000],
    ['3.5L-4.5L', 350000],
    ['15K - 20K per month', 15000],
    ['1-1.5 lakh p.m.', 100000],
    ['1.2 Cr', 12000000],
    ['25000 - 10000', 10000],
    ['10000,20000', 10000],
    ['20 Lacs', 2000000],
    ['Up to 25000', 25000],
    ['35,000 - 40,000/- per month', 35000],
  ];
  for (const [text, expected] of cases) assert.equal(payMinimum(text), expected, JSON.stringify(text));
  assert.equal(payMinimum(null), '');
  assert.equal(payMinimum(undefined), '');
});

test('ranges keep both ends; single amounts are their own range', async () => {
  const { parsePay } = await load();
  assert.deepEqual(parsePay('₹3.5 - 4.5 LPA'), { min: 350000, max: 450000 });
  assert.deepEqual(parsePay('8-10 lakhs'), { min: 800000, max: 1000000 });
  assert.deepEqual(parsePay('50k'), { min: 50000, max: 50000 });
  // A unit on the first amount does not leak onto an unrelated second one.
  assert.deepEqual(parsePay('50k, 2 bonuses'), { min: 50000, max: 50000 });
  assert.equal(parsePay('Not disclosed'), null);
});

test('post-a-job sends the parsed minimum under the same salary field', () => {
  const html = fs.readFileSync(path.join(root, 'post-a-job.html'), 'utf8');
  assert.doesNotMatch(html, /salary\.replace\(\/\[\^0-9\.\]\/g, ''\)/, 'the digit-stripping parser is gone');
  assert.match(html, /import\('\/scripts\/pay-parse\.js'\)/);
  assert.match(html, /salary: /);
});
