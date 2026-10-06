const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const portalScripts = [
  path.join(root, 'scripts', 'portal3.js'),
  path.join(root, 'scripts', 'portal-email.js'),
];

test('portal scripts do not access Notification without typeof check', () => {
  for (const scriptPath of portalScripts) {
    const source = fs.readFileSync(scriptPath, 'utf8');

    // Should not have unguarded Notification.permission checks
    assert.doesNotMatch(
      source,
      /if\s*\(\s*Notification\.permission/g,
      `${path.relative(root, scriptPath)} has unguarded Notification.permission check`,
    );

    // Must have typeof Notification guards
    assert.match(
      source,
      /typeof\s+Notification\s*!==\s*['"]undefined['"]/g,
      `${path.relative(root, scriptPath)} must guard Notification with typeof check`,
    );

    assert.match(
      source,
      /typeof\s+Notification\s*===\s*['"]undefined['"]/g,
      `${path.relative(root, scriptPath)} must check for undefined Notification in UI status`,
    );
  }
});

test('runtime evaluation simulation with undefined Notification does not throw', () => {
  const prevNotification = globalThis.Notification;
  try {
    delete globalThis.Notification;

    assert.doesNotThrow(() => {
      const isNotifGranted = typeof Notification !== 'undefined' && Notification.permission === 'granted';
      const isFlutterReady = false;
      if (isNotifGranted || isFlutterReady) {
        // FCM init
      }
    });

    assert.doesNotThrow(() => {
      if (typeof Notification === 'undefined') {
        return 'unsupported';
      }
      return Notification.permission;
    });
  } finally {
    if (prevNotification !== undefined) {
      globalThis.Notification = prevNotification;
    }
  }
});
