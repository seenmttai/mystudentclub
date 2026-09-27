const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function page(failLogout = false) {
  const console = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><head></head><body><main><input aria-label="Search jobs"></main></body>', {
    url: 'https://www.mystudentclub.com/', runScripts: 'outside-only', virtualConsole: console
  });
  const callbacks = [], state = { signOutCalls: 0, cleared: 0 };
  const session = { user: { id: 'member-a', email: 'member@example.test' } };
  const sb = { auth: {
    getSession: async () => ({ data: { session } }),
    onAuthStateChange: callback => { callbacks.push(callback); },
    signOut: async () => {
      state.signOutCalls++;
      if (failLogout) return { error: new Error('Network unavailable') };
      callbacks.forEach(callback => callback('SIGNED_OUT', null));
      return { error: null };
    }
  } };
  dom.window.localStorage.setItem('sb-izsggdtdiacxdsjjncdq-auth-token', JSON.stringify(session));
  dom.window.localStorage.setItem('userProfileData', '{"name":"Member A"}');
  dom.window.sessionStorage.setItem('msc_career_v2:member-a:ca-fresher', 'true');
  dom.window.supabase = { createClient: () => sb };
  dom.window.MSCCareerProfile = { initOnboarding() {}, clearGuestState() { state.cleared++; } };
  for (const file of ['supabase-init.js', 'site-navigation.js']) {
    dom.window.eval(fs.readFileSync(path.join(__dirname, '../scripts', file), 'utf8'));
  }
  await tick(); await tick();
  return { dom, state, nav: dom.window.document.querySelector('#msc-site-navigation') };
}

test('signed-in account menu can log out and clear account-specific completion', async () => {
  const { dom, state, nav } = await page();
  const menu = nav.querySelector('.msc-nav-account-menu');
  assert.equal(menu.hidden, false);
  assert.equal(menu.querySelector('button').textContent, 'Log out');
  menu.querySelector('button').click(); await tick();
  assert.equal(state.signOutCalls, 1);
  assert.equal(state.cleared, 1);
  assert.equal(dom.window.sessionStorage.getItem('msc_career_v2:member-a:ca-fresher'), null);
  assert.equal(dom.window.localStorage.getItem('userProfileData'), null);
  assert.equal(menu.hidden, true);
  assert.equal(nav.querySelector('.msc-nav-login').hidden, false);
  dom.window.close();
});

test('failed logout retains the signed-in state and gives a retryable error', async () => {
  const { dom, state, nav } = await page(true);
  const logout = nav.querySelector('.msc-nav-logout');
  logout.click(); await tick();
  assert.equal(state.signOutCalls, 1);
  assert.equal(state.cleared, 0);
  assert.equal(nav.querySelector('.msc-nav-account-menu').hidden, false);
  assert.equal(logout.disabled, false);
  assert.match(nav.querySelector('[role="alert"]').textContent, /Could not log out/);
  assert.equal(nav.querySelector('[role="alert"]').hidden, false);
  dom.window.close();
});

test('Escape leaves page input focus intact unless a navigation menu is open', async () => {
  const { dom, nav } = await page();
  const input = dom.window.document.querySelector('main input');
  input.focus();
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(dom.window.document.activeElement, input);
  const group = nav.querySelector('details');
  group.open = true;
  group.querySelector('a').focus();
  dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(group.open, false);
  assert.equal(dom.window.document.activeElement, group.querySelector('summary'));
  dom.window.close();
});
