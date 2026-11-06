const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// 6 Nov 2026: the job popup cut the description at 260 characters ("Sanpada,...") until the student
// revealed the application. Every job now shows its full description; only contact details are masked.
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'portal3.js'), 'utf8');

function loadMasker() {
  const start = source.indexOf('function getMaskedDescription(');
  assert.ok(start >= 0, 'portal3.js should define getMaskedDescription');
  const end = source.indexOf('\n}\n', start) + 2;
  const ctx = {};
  vm.runInNewContext(`${source.slice(start, end)}; this.fn = getMaskedDescription;`, ctx);
  return ctx.fn;
}

test('job popup never shortens the description', () => {
  assert.doesNotMatch(source, /getTruncatedDescription/);
  const mask = loadMasker();
  const long = 'Galactico Corporate Services Limited invites applications. '.repeat(30) + 'Last line here.';
  const out = mask(long);
  assert.ok(out.endsWith('Last line here.'), 'full text should reach the last line');
  assert.ok(!out.endsWith('...'));
});

test('contact details stay masked before the application is revealed', () => {
  const mask = loadMasker();
  const out = mask('Mail hr@example.com or call +91 9876543210, see https://example.com/apply now');
  assert.match(out, /\[email protected\]/);
  assert.match(out, /\[phone protected\]/);
  assert.match(out, /\[link protected\]/);
  assert.doesNotMatch(out, /hr@example\.com|9876543210|https:\/\//);
  assert.equal(mask(''), 'No description available.');
});
