const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// The notification bell's job-type dropdown is built from JOB_TYPES_NOTIF, and "All India"
// picks the type-wide topic. Experienced CA must be offered and map to the topics the job digest worker sends to
// (experienced-all and <city>-experienced, from the Experienced rows of Fresher Jobs).
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

// Mobile: on /experienced-ca-jobs, /experienced-ca and /semi-qualified the bell pickers are plain <select>s, which never
// set data-value, so Subscribe stayed disabled. Both the button check and the subscribe handler read either kind now.
test('mobile bell: Subscribe works with the plain <select> pickers too', () => {
  const src = fs.readFileSync(path.join(root, 'scripts/portal3.js'), 'utf8');
  assert.match(src, /function notifSelectValue\(el\)/);
  assert.match(src, /el\.dataset\.value \|\| \(el\.tagName === "SELECT" \? el\.value : ""\)/);
  assert.match(src, /notifSelectValue\(dom\.locationSelectEl\) && notifSelectValue\(dom\.jobTypeSelectEl\)/);
  assert.match(src, /const location = notifSelectValue\(dom\.locationSelectEl\);/);
  assert.doesNotMatch(src, /(locationSelectEl|jobTypeSelectEl)\?\.dataset\.value/);
});
