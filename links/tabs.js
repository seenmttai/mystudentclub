// /links deep links, so emails and posts can open the right tab:
//   /links/?tab=articleship   /links/?tab=fresher   /links/?tab=semi   /links/?tab=industrial
//   /links/#articleship       (the same names work as a #hash; ?tab= wins when both are given)
// Tab ids and a few aliases work too, and so does any tab the admin adds to the `links` table
// (it exists only after loadLiveLinks runs, so the request is retried on "msc:links-hydrated").
// An unknown name leaves the default tab. Needs switchTab() from the page's inline script.
(function (global) {
  'use strict';

  var ALIASES = {
    industrial: 'industrial',
    'industrial-training': 'industrial',
    it: 'industrial',
    fresher: 'ca',
    freshers: 'ca',
    'ca-fresher': 'ca',
    'ca-freshers': 'ca',
    ca: 'ca',
    articleship: 'articleship',
    article: 'articleship',
    semi: 'semi-qualified',
    'semi-qualified': 'semi-qualified',
    'semi-qualified-ca': 'semi-qualified',
    sq: 'semi-qualified'
  };

  function clean(value) {
    var v = String(value == null ? '' : value).trim().toLowerCase();
    try {
      v = decodeURIComponent(v);
    } catch (e) {
      /* keep the raw value */
    }
    return v.replace(/^tab-/, '');
  }

  /** { name, fromHash } from ?tab= or the #hash, or null. */
  function requestedTab(search, hash) {
    var fromQuery = '';
    try {
      fromQuery = new URLSearchParams(search || '').get('tab') || '';
    } catch (e) {
      fromQuery = '';
    }
    if (clean(fromQuery)) return { name: clean(fromQuery), fromHash: false };
    var h = clean(String(hash || '').replace(/^#/, ''));
    return h ? { name: h, fromHash: true } : null;
  }

  /** A requested name → the id of a tab that exists on the page, or null. */
  function resolveTab(name, doc) {
    var n = clean(name);
    if (!n) return null;
    var id = Object.prototype.hasOwnProperty.call(ALIASES, n) ? ALIASES[n] : n;
    return doc.getElementById('tab-' + id) && doc.getElementById(id) ? id : null;
  }

  /** Opens the requested tab. Returns its id, or null when there was nothing (yet) to open. */
  function openRequestedTab(win, doc) {
    var req = requestedTab(win.location.search, win.location.hash);
    if (!req) return null;
    var id = resolveTab(req.name, doc);
    if (!id || typeof win.switchTab !== 'function') return null;
    win.switchTab(doc.getElementById('tab-' + id), id);
    // A #hash also scrolls the browser to the tab's panel, past the tab bar: bring the tabs back into view.
    if (req.fromHash) {
      var tabs = doc.querySelector('.tabs-wrapper');
      if (tabs && typeof tabs.scrollIntoView === 'function') {
        win.requestAnimationFrame(function () { tabs.scrollIntoView({ block: 'start' }); });
      }
    }
    return id;
  }

  function init(win, doc) {
    var opened = openRequestedTab(win, doc);
    if (!opened) {
      doc.addEventListener('msc:links-hydrated', function () { openRequestedTab(win, doc); }, { once: true });
    }
    win.addEventListener('hashchange', function () { openRequestedTab(win, doc); });
    if (opened && requestedTab(win.location.search, win.location.hash).fromHash) {
      win.addEventListener('load', function () { openRequestedTab(win, doc); }, { once: true });
    }
  }

  global.MSCLinksTabs = { ALIASES: ALIASES, requestedTab: requestedTab, resolveTab: resolveTab, openRequestedTab: openRequestedTab, init: init };
  if (global.document && global.location) init(global, global.document);
})(typeof window !== 'undefined' ? window : globalThis);
