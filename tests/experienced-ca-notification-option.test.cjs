const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// The notification bell's job-type dropdown is built from JOB_TYPES_NOTIF, and "All India"
// picks the type-wide topic. Experienced CA must be offered and map to the topic admin.html sends to.
const root = path.resolve(__dirname, '..');

for (const file of ['scripts/portal3.js', 'scripts/portal-email.js']) {
  const src = fs.readFileSync(path.join(root, file), 'utf8');

  test(`${file} offers Experienced CA in the notification job types`, () => {
    const block = src.match(/const JOB_TYPES_NOTIF = \[([\s\S]*?)\];/);
    assert.ok(block, 'JOB_TYPES_NOTIF not found');
    assert.match(block[1], /\{ value: "experienced", label: "Experienced CA" \}/);
  });

  test(`${file} subscribes All India + Experienced CA to experienced-all and shows it by name`, () => {
    // Either quote style: master's portal3.js uses single quotes, mobile's is Prettier-formatted.
    assert.match(src, /jobType === ['"]experienced['"]\)\s*(return|topicName =) ['"]experienced-all['"]/);
    assert.match(src, /topic === ['"]experienced-all['"]\)\s*return \{ location: ['"]All India['"], jobType: ['"]Experienced CA['"] \}/);
  });
}
