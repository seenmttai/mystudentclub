const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const shareScripts = [
  path.join(root, 'scripts', 'portal3.js'),
  path.join(root, 'scripts', 'portal-email.js'),
];

const expectedShareCopy = /Do turn on notifications to stay updated with all such opportunites and ensure joining the whatsapp group below\r?\nmystudentclub\.com\/links`;/;
const retiredShareUrl = ['https://chat.whatsapp.com', 'D491zsqKmv25S2YLloSUBR'].join('/');

test('all vacancy share paths use the links page in the share copy', () => {
  for (const scriptPath of shareScripts) {
    const source = fs.readFileSync(scriptPath, 'utf8');

    assert.equal(
      source.split('function shareJob(').length - 1,
      1,
      `${path.relative(root, scriptPath)} should have one vacancy share function`,
    );
    assert.match(
      source,
      expectedShareCopy,
      `${path.relative(root, scriptPath)} should preserve the share copy and use the links URL`,
    );
    assert.ok(
      !source.includes(retiredShareUrl),
      `${path.relative(root, scriptPath)} must not use the retired WhatsApp group URL`,
    );
    assert.match(
      source,
      /const jobUrl = `\$\{window\.location\.origin\}\/job\.html\?id=\$\{job\.id\}&type=\$\{jobType\}`;/,
      `${path.relative(root, scriptPath)} must keep the canonical job share URL`,
    );
  }
});

test('job.html keeps its canonical redirect behavior', () => {
  const source = fs.readFileSync(path.join(root, 'job.html'), 'utf8');

  assert.match(source, /window\.location\.href = `\$\{portalPages\[rawJobType\]\}\?id=/);
  assert.match(source, /window\.location\.href = `\/\?id=\$\{encodeURIComponent\(jobId\)\}&type=industrial`;/);
  assert.doesNotMatch(source, /mystudentclub\.com\/links/);
});
