const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'ca-industrial-training-program/index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'ca-industrial-training-program/waitlist.js'), 'utf8');
const storageKey = 'msc_waitlist_industrial-program-notify';
const buttonMarkup = [...html.matchAll(/<button\b[^>]*class="[^"]*\bjs-notify-btn\b[^"]*"[^>]*>([\s\S]*?)<\/button>/g)];

function load(options = {}) {
  const calls = { permissions: 0, registrations: [], tokens: [], requests: [] };
  const storage = { ...options.stored };
  const buttons = buttonMarkup.map(match => {
    const classes = new Set();
    return {
      innerHTML: match[1],
      disabled: false,
      attributes: {},
      classList: { toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } },
      setAttribute(name, value) { this.attributes[name] = value; },
      addEventListener(name, listener) { this[name] = listener; }
    };
  });
  const status = { textContent: '', className: '' };
  const toast = { textContent: '', className: '', classList: { remove() {} } };
  const registration = { scope: 'https://www.mystudentclub.com/' };
  let boot;
  const context = {
    document: {
      querySelectorAll: () => buttons,
      getElementById: id => id === 'notifyStatus' ? status : toast,
      addEventListener: (_, callback) => { boot = callback; }
    },
    navigator: { serviceWorker: { register: async url => { calls.registrations.push(url); return registration; } } },
    Notification: {
      requestPermission: async () => {
        calls.permissions++;
        return options.requestPermission ? options.requestPermission() : options.permission || 'granted';
      }
    },
    firebase: {
      apps: [],
      initializeApp() { this.apps.push({}); },
      messaging: () => ({ getToken: async config => { calls.tokens.push(config); return options.noToken ? null : 'test-token'; } })
    },
    fetch: async (url, init) => {
      calls.requests.push({ url, init });
      if (options.networkError) throw new Error('Network unavailable');
      return { ok: options.responseOk !== false, status: options.responseOk === false ? 500 : 200 };
    },
    localStorage: {
      getItem: key => {
        if (options.storageBlocked) throw new Error('Storage blocked');
        return storage[key] || null;
      },
      setItem: (key, value) => {
        if (options.storageBlocked) throw new Error('Storage blocked');
        storage[key] = value;
      }
    },
    console: { error() {} },
    setTimeout: () => 1,
    clearTimeout() {}
  };
  if (options.unsupported) delete context.Notification;
  if (options.firebaseUnavailable) delete context.firebase;
  vm.runInNewContext(source, context);
  boot();
  return { buttons, calls, storage, status, toast, registration, click: (index = 0) => buttons[index].click({ preventDefault() {} }) };
}

test('all industrial registration CTAs become waitlist buttons and checkout links are removed', () => {
  assert.equal(buttonMarkup.length, 4);
  for (const match of buttonMarkup) {
    assert.match(match[0], /type="button"/);
    assert.match(match[1], /Notify Me/);
  }
  assert.doesNotMatch(html, /payu\.in|Register Now|REGISTRATION LIVE|LIMITED SEATS/);
  assert.match(html, /REGISTRATION CLOSED/);
  assert.match(html, /<script src="waitlist\.js\?[^\"]+" defer><\/script>/);
});

test('successful signup uses the industrial topic and updates every CTA after the backend confirms', async () => {
  const page = load({ stored: { 'msc_waitlist_fresher-program-notify': 'true' } });
  assert.ok(page.buttons.every(button => !button.disabled));
  await page.click(2);
  assert.equal(page.calls.permissions, 1);
  assert.deepEqual(page.calls.registrations, ['/firebase-messaging-sw.js']);
  assert.equal(page.calls.tokens[0].serviceWorkerRegistration, page.registration);
  assert.equal(page.calls.requests[0].url, 'https://us-central1-msc-notif.cloudfunctions.net/manageTopicSubscription');
  assert.equal(page.calls.requests[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(page.calls.requests[0].init.body), {
    token: 'test-token', topic: 'industrial-program-notify', action: 'subscribe'
  });
  assert.equal(page.storage[storageKey], 'true');
  assert.ok(page.buttons.every(button => button.disabled && button.innerHTML.includes('Added to Waitlist')));
  assert.match(page.status.textContent, /industrial training seats open/);
  await page.click(3);
  assert.equal(page.calls.requests.length, 1);
});

test('a saved industrial subscription is restored without requesting permission again', async () => {
  const page = load({ stored: { [storageKey]: 'true' } });
  assert.ok(page.buttons.every(button => button.disabled && button.innerHTML.includes('Added to Waitlist')));
  await page.click();
  assert.equal(page.calls.permissions, 0);
  assert.equal(page.calls.requests.length, 0);
});

test('blocked or dismissed permission never records a signup and keeps all CTAs available', async () => {
  for (const permission of ['denied', 'default']) {
    const page = load({ permission });
    await page.click();
    assert.equal(page.storage[storageKey], undefined);
    assert.equal(page.calls.requests.length, 0);
    assert.ok(page.buttons.every(button => !button.disabled && button.innerHTML.includes('Notify Me')));
    assert.match(page.status.textContent, permission === 'denied' ? /browser settings/ : /allow notifications/);
  }
});

test('unsupported browsers and notification failures allow retry without claiming success', async () => {
  for (const options of [
    { unsupported: true }, { firebaseUnavailable: true }, { noToken: true },
    { responseOk: false }, { networkError: true }
  ]) {
    const page = load(options);
    await page.click();
    assert.equal(page.storage[storageKey], undefined);
    assert.ok(page.buttons.every(button => !button.disabled && button.innerHTML.includes('Notify Me')));
    assert.doesNotMatch(page.status.textContent, /You're on the list/);
    assert.match(page.status.textContent, /try|support/);
  }
});

test('pending permission disables every CTA and prevents duplicate subscription requests', async () => {
  let grantPermission;
  const permission = new Promise(resolve => { grantPermission = resolve; });
  const page = load({ requestPermission: () => permission });
  const signup = page.click();
  assert.ok(page.buttons.every(button => button.disabled && button.attributes['aria-busy'] === 'true'));
  await page.click(1);
  assert.equal(page.calls.permissions, 1);
  grantPermission('granted');
  await signup;
  assert.equal(page.calls.requests.length, 1);
  assert.ok(page.buttons.every(button => button.attributes['aria-busy'] === 'false'));
});

test('successful signup still works when browser storage is unavailable', async () => {
  const page = load({ storageBlocked: true });
  await page.click();
  assert.equal(page.calls.requests.length, 1);
  assert.ok(page.buttons.every(button => button.disabled && button.innerHTML.includes('Added to Waitlist')));
});
