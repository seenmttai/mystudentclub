const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// 6 Nov 2026: a shared job ended with the job link a second time. The message text already carries the link, so
// navigator.share must not get a separate url (WhatsApp and other apps append it after the text).
const root = path.resolve(__dirname, '..');

function runShare(file) {
  const source = fs.readFileSync(path.join(root, 'scripts', file), 'utf8');
  const start = source.indexOf('function shareJob(');
  assert.ok(start >= 0, `${file} has shareJob`);
  // The function ends at the first line that is exactly "}" after it.
  const end = source.indexOf('\n}\n', start) + 2;
  const shared = [];
  const ctx = {
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile', share: (d) => { shared.push(d); return Promise.resolve(); }, clipboard: { writeText: () => Promise.resolve() } },
    window: { location: { origin: 'https://www.mystudentclub.com' } },
    console, alert() {},
    currentTable: 'Industrial Training Job Portal', currentPortalId: 'industrial', state: { portalType: 'Industrial Training Job Portal' },
  };
  vm.runInNewContext(`${source.slice(start, end)}\nshareJob({ id: 42, Company: 'Galactico', Location: 'Navi Mumbai' }, null);`, ctx);
  return shared;
}

test('a shared job carries its link once', () => {
  for (const file of ['portal3.js', 'portal-email.js']) {
    const shared = runShare(file);
    assert.equal(shared.length, 1, file);
    const data = shared[0];
    assert.equal(data.url, undefined, `${file}: no separate url, or apps repeat the link at the end`);
    assert.equal((data.text.match(/job\.html\?id=42&type=industrial/g) || []).length, 1, file);
  }
});
