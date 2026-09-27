const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function page(failLogout = false, markup = '<header class="floating-header"><div class="header-container"><a id="brand">MSC</a><button id="menuButton">Menu</button></div></header><div id="expandedMenu"><button id="menuCloseBtn">Close</button><div class="menu-items"><button id="menuAnalyzeAnotherBtn">Analyze another</button></div></div>') {
  const console = new VirtualConsole();
  const dom = new JSDOM('<!doctype html><head></head><body data-resource-stage="articleship">'+markup+'<main><input aria-label="Search jobs"></main></body>', {
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
  return { dom, state, nav: dom.window.document.querySelector('.msc-native-nav') };
}

test('signed-in account menu can log out and clear account-specific completion', async () => {
  const { dom, state, nav } = await page();
  const menu = nav.querySelector('.msc-native-group.msc-native-member');
  assert.equal(menu.hidden, false);
  assert.equal(menu.querySelector('button').textContent, 'Log out');
  menu.querySelector('button').click(); await tick();
  assert.equal(state.signOutCalls, 1);
  assert.equal(state.cleared, 1);
  assert.equal(dom.window.sessionStorage.getItem('msc_career_v2:member-a:ca-fresher'), null);
  assert.equal(dom.window.localStorage.getItem('userProfileData'), null);
  assert.equal(menu.hidden, true);
  assert.equal(nav.querySelector('.msc-native-login').hidden, false);
  dom.window.close();
});

test('failed logout retains the signed-in state and gives a retryable error', async () => {
  const { dom, state, nav } = await page(true);
  const logout = nav.querySelector('.msc-native-logout');
  logout.click(); await tick();
  assert.equal(state.signOutCalls, 1);
  assert.equal(state.cleared, 0);
  assert.equal(nav.querySelector('.msc-native-group.msc-native-member').hidden, false);
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


test('native header, page actions and resource drawer remain usable without a replacement bar', async () => {
  const {dom}=await page(); const doc=dom.window.document;
  assert.equal(doc.querySelectorAll('header').length,1);
  assert.equal(doc.querySelector('#brand').parentElement.className,'header-container');
  assert.ok(doc.querySelector('#menuAnalyzeAnotherBtn'));
  assert.equal(doc.querySelector('#msc-site-navigation'),null);
  assert.equal(doc.documentElement.classList.contains('msc-shared-navigation'),false);
  doc.querySelector('#menuButton').click();await tick();
  assert.ok(doc.querySelector('#expandedMenu').classList.contains('active'));
  assert.equal(doc.querySelector('#menuButton').getAttribute('aria-expanded'),'true');
  doc.querySelector('#menuCloseBtn').click();await tick();
  assert.equal(doc.querySelector('#menuButton').getAttribute('aria-expanded'),'false');dom.window.close();
});

test('headerless CV builder receives a toolbar menu without a new header or offset', async () => {
  const {dom}=await page(false,'<div class="editor-header"><div class="brand-row"><button id="export">Export</button></div></div>');
  assert.equal(dom.window.document.querySelectorAll('header').length,0);
  assert.ok(dom.window.document.querySelector('.brand-row > .msc-native-compact'));
  assert.ok(dom.window.document.querySelector('#export'));
  assert.equal(dom.window.document.body.classList.contains('msc-needs-header-space'),false);dom.window.close();
});

test('native Jobs controls stay in place when navigation links are refreshed', async () => {
  const {dom}=await page(false,'<header class="site-header"><div class="header-container"><img id="original-logo"><nav class="dv2-header-nav"></nav><div class="nav-actions"><button id="notificationsBtn">Notifications</button><button id="dv2CompleteProfileBtn">Complete Profile</button></div></div></header>');
  const doc=dom.window.document;
  assert.equal(doc.querySelectorAll('header').length,1);
  assert.ok(doc.querySelector('.nav-actions > #notificationsBtn'));
  assert.ok(doc.querySelector('.nav-actions > #dv2CompleteProfileBtn'));
  assert.ok(doc.querySelector('.header-container > #original-logo'));
  assert.ok(doc.querySelector('.dv2-header-nav a[href="/articleship-resources"]'));dom.window.close();
});
