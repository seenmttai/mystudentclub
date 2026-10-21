const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const pages = fs.readdirSync(root).filter((f) => f.endsWith('.html'));

// portal3.js / portal-email.js call firebase.initializeApp(); without these tags
// the call throws, no FCM token is obtained and Subscribe shows
// "Notification service unavailable".
test('every page that loads the job portal script loads the Firebase scripts', () => {
  const portalPages = pages.filter((f) =>
    /scripts\/portal(3|-email)\.js/.test(fs.readFileSync(path.join(root, f), 'utf8')));
  assert.ok(portalPages.includes('index.html'), 'index.html should load the portal script');
  for (const f of portalPages) {
    const html = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(html, /firebase-app-compat\.js/, `${f} is missing firebase-app-compat.js`);
    assert.match(html, /firebase-messaging-compat\.js/, `${f} is missing firebase-messaging-compat.js`);
  }
});

test('FCM init failures are logged, not swallowed', () => {
  for (const f of ['portal3.js', 'portal-email.js']) {
    const src = fs.readFileSync(path.join(root, 'scripts', f), 'utf8');
    assert.match(src, /console\.error\('FCM init failed:'/, `${f} initializeFCM`);
    assert.match(src, /console\.error\('FCM token request failed:'/, `${f} requestTokenAndSync`);
  }
});
