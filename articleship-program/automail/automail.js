/* MSC Articleship Program · Automail install page logic.
 *
 * Three jobs, all testable in node (tests/automail.test.js):
 *   1. config: turn the master Sheet's /copy link in config.js into the "Make my copy" href, or keep the button
 *      disabled while it is still the placeholder (console warning for the team, nothing on screen); and show the
 *      cold-mailing-list lines only when config.js says the master has the list (coldList: true);
 *   2. device: phone mode on a touch-only device (a phone or tablet), laptop mode otherwise, however narrow the window;
 *   3. sharing: "Send this link to myself" uses Web Share where the browser has it, else a mailto: with the link;
 *      "Copy link" uses the Clipboard API, else a selected text copy.
 *
 * UMD: window.MSCAutomailPage in the browser (it starts itself on DOMContentLoaded), require() in node.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.MSCAutomailPage = api;
    if (root.document) {
      if (root.document.readyState === 'loading') {
        root.document.addEventListener('DOMContentLoaded', function () { api.start(root); });
      } else {
        api.start(root);
      }
    }
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ config */

  // The value config.js ships with. Anything that is not a Google Sheets link or file ID counts as "not set".
  var PLACEHOLDER = 'PASTE-THE-COPY-LINK-HERE';
  // A Google Drive file ID: letters, digits, "-" and "_". Real Sheets IDs are 44 characters; allow 25–80.
  var ID_RE = /^[A-Za-z0-9_-]{25,80}$/;
  var SHEET_URL_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{25,80})(?:\/[A-Za-z]*)?(?:[?#][^\s"'<>]*)?$/;

  /** The master Sheet's file ID from a /copy link, an /edit link, a share link or the bare ID; '' if none. */
  function sheetIdFrom(value) {
    if (typeof value !== 'string') return '';
    var v = value.trim();
    if (!v || v === PLACEHOLDER) return '';
    if (ID_RE.test(v)) return v;
    var m = SHEET_URL_RE.exec(v);
    return m ? m[1] : '';
  }

  /** The link "Make my copy" opens: Google's documented form, https://docs.google.com/spreadsheets/d/<ID>/copy. */
  function copyLinkFrom(value) {
    var id = sheetIdFrom(value);
    return id ? 'https://docs.google.com/spreadsheets/d/' + id + '/copy' : '';
  }

  /** Reads window.MSC_AUTOMAIL_CONFIG.copyLink. Returns {ready, href, reason}. */
  function readConfig(cfg) {
    var raw = cfg && typeof cfg === 'object' ? cfg.copyLink : undefined;
    if (raw === undefined || raw === null) return { ready: false, href: '', reason: 'missing' };
    if (typeof raw !== 'string') return { ready: false, href: '', reason: 'invalid' };
    if (!raw.trim() || raw.trim() === PLACEHOLDER) return { ready: false, href: '', reason: 'placeholder' };
    var href = copyLinkFrom(raw);
    return href ? { ready: true, href: href, reason: '' } : { ready: false, href: '', reason: 'invalid' };
  }

  var WARNING = '[Automail] config.js has no master Sheet link yet, so "Make my copy" stays disabled. ' +
    'The MSC team sets copyLink once (AUTOMAIL-SETUP.md).';

  /** Sets up the "Make my copy" link element from the config. Warns in the console only, never on the page. */
  function applyConfig(el, cfg, consoleLike) {
    var state = readConfig(cfg);
    if (!el) return state;
    if (state.ready) {
      el.setAttribute('href', state.href);
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener');
      el.removeAttribute('aria-disabled');
      el.removeAttribute('role');
    } else {
      el.removeAttribute('href');
      el.removeAttribute('target');
      el.setAttribute('role', 'link');
      el.setAttribute('aria-disabled', 'true');
      if (consoleLike && typeof consoleLike.warn === 'function') {
        consoleLike.warn(state.reason === 'invalid'
          ? '[Automail] config.js copyLink is not a Google Sheets link or file ID, so "Make my copy" stays disabled.'
          : WARNING);
      }
    }
    return state;
  }

  /* ------------------------------------------------------------------ device */

  // Decided by the input, not the width: a laptop with Chrome snapped to half the screen is still a laptop.
  var QUERIES = {
    touchOnly: '(hover: none) and (pointer: coarse)'
  };

  /** 'phone' on a touch-only device, else 'laptop'. `matches(query)` -> boolean. */
  function detectMode(matches) {
    if (typeof matches !== 'function') return 'laptop';
    var touch = false;
    try { touch = !!matches(QUERIES.touchOnly); } catch (e) { touch = false; }
    return touch ? 'phone' : 'laptop';
  }

  /* ------------------------------------------------------------------ the cold mailing list */

  /** True only when config.js says the master has the cold mailing list (the MSC team sets it with the list). */
  function coldListOn(cfg) {
    return !!(cfg && typeof cfg === 'object' && cfg.coldList === true);
  }

  /**
   * Shows the lines about "Add firms from the cold mailing list" (marked data-cold-list, hidden in the HTML, so they
   * stay hidden without JS) when the master has the list, and gives a drawing its fuller description
   * (data-label-cold) and its circle numbers (data-cold-n). Returns whether they are shown.
   */
  function applyColdList(doc, cfg) {
    var on = coldListOn(cfg);
    if (!doc || typeof doc.querySelectorAll !== 'function') return on;
    var marked = doc.querySelectorAll('[data-cold-list]');
    for (var i = 0; i < marked.length; i++) {
      if (on) marked[i].removeAttribute('hidden'); else marked[i].setAttribute('hidden', '');
    }
    var labelled = doc.querySelectorAll('[data-label-cold]');
    for (var j = 0; j < labelled.length; j++) {
      if (on) labelled[j].setAttribute('aria-label', labelled[j].getAttribute('data-label-cold'));
    }
    // A drawing numbers its circles only when there are two of them.
    var numbered = doc.querySelectorAll('[data-cold-n]');
    for (var k = 0; k < numbered.length; k++) {
      if (on) numbered[k].setAttribute('data-n', numbered[k].getAttribute('data-cold-n')); else numbered[k].removeAttribute('data-n');
    }
    return on;
  }

  /* ------------------------------------------------------------------ the link to share */

  /** The page's own address to send: the canonical link when it is an https URL, else this page without query or hash. */
  function pageUrl(canonicalHref, loc) {
    if (typeof canonicalHref === 'string' && /^https:\/\/[^\s]+$/.test(canonicalHref.trim())) return canonicalHref.trim();
    if (loc && loc.origin && loc.origin !== 'null' && typeof loc.pathname === 'string') return loc.origin + loc.pathname;
    if (loc && typeof loc.href === 'string') return loc.href.split('#')[0].split('?')[0];
    return '';
  }

  var MAIL_SUBJECT = 'Automail: open this on your laptop';
  var MAIL_BODY = 'Open this on your laptop, in Chrome, signed in to the Gmail you apply from:';

  // RFC 6068: percent-encode everything, spaces as %20 (never "+"), line breaks as %0D%0A.
  function mailEncode(s) {
    return encodeURIComponent(s).replace(/%0A/g, '%0D%0A');
  }

  /** mailto: with no address (the student picks themselves), a subject and the link in the body. */
  function mailtoHref(url) {
    return 'mailto:?subject=' + mailEncode(MAIL_SUBJECT) + '&body=' + mailEncode(MAIL_BODY + '\n\n' + url);
  }

  function shareData(url) {
    return { title: 'Automail', text: 'Open this on your laptop: ', url: url };
  }

  /**
   * "Send this link to myself". Web Share where available; otherwise (or if sharing fails) the mailto: link.
   * env: {nav, url, openMailto(href)}. Resolves to 'shared' | 'cancelled' | 'mailto'.
   */
  function sendToSelf(env) {
    var nav = env && env.nav;
    var url = env && env.url;
    var openMailto = env && env.openMailto;
    function fallback() {
      if (typeof openMailto === 'function') openMailto(mailtoHref(url));
      return 'mailto';
    }
    var data = shareData(url);
    var canShare = nav && typeof nav.share === 'function' &&
      (typeof nav.canShare !== 'function' || safeCanShare(nav, data));
    if (!canShare) return Promise.resolve(fallback());
    var p;
    try {
      p = nav.share(data);
    } catch (e) {
      return Promise.resolve(fallback());
    }
    return Promise.resolve(p).then(function () { return 'shared'; }, function (err) {
      if (err && err.name === 'AbortError') return 'cancelled';
      return fallback();
    });
  }

  function safeCanShare(nav, data) {
    try { return !!nav.canShare(data); } catch (e) { return false; }
  }

  /**
   * "Copy link". Clipboard API first, then a selected-text copy. env: {nav, url, legacyCopy(text) -> bool}.
   * Resolves to 'copied' | 'failed'.
   */
  function copyLink(env) {
    var nav = env && env.nav;
    var url = env && env.url;
    var legacy = env && env.legacyCopy;
    function tryLegacy() {
      try { return typeof legacy === 'function' && legacy(url) ? 'copied' : 'failed'; } catch (e) { return 'failed'; }
    }
    if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      var p;
      try { p = nav.clipboard.writeText(url); } catch (e) { return Promise.resolve(tryLegacy()); }
      return Promise.resolve(p).then(function () { return 'copied'; }, function () { return tryLegacy(); });
    }
    return Promise.resolve(tryLegacy());
  }

  var COPY_WORDS = { copied: 'Link copied.', failed: 'Copy this link: ' };

  /* ------------------------------------------------------------------ browser start */

  function legacyCopyIn(doc) {
    return function (text) {
      if (!doc || !doc.body || typeof doc.execCommand !== 'function') return false;
      var ta = doc.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      doc.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
      doc.body.removeChild(ta);
      return ok;
    };
  }

  function start(win) {
    var doc = win.document;
    var html = doc.documentElement;
    html.classList.remove('no-js');
    html.classList.add('js');

    // 1. Make my copy, and the cold mailing list lines when the master has the list
    applyConfig(doc.getElementById('make-copy'), win.MSC_AUTOMAIL_CONFIG, win.console);
    applyColdList(doc, win.MSC_AUTOMAIL_CONFIG);

    // 2. Laptop or phone, kept up to date when the window changes
    var mm = typeof win.matchMedia === 'function' ? function (q) { return win.matchMedia(q).matches; } : null;
    function setMode() { html.setAttribute('data-mode', detectMode(mm)); }
    setMode();
    if (mm) {
      Object.keys(QUERIES).forEach(function (k) {
        var list = win.matchMedia(QUERIES[k]);
        if (typeof list.addEventListener === 'function') list.addEventListener('change', setMode);
        else if (typeof list.addListener === 'function') list.addListener(setMode);
      });
    }

    // 3. Send this link to myself / Copy link
    var canonical = doc.querySelector('link[rel="canonical"]');
    var url = pageUrl(canonical ? canonical.getAttribute('href') : '', win.location);
    var send = doc.getElementById('send-link');
    var status = doc.getElementById('link-status');
    if (send) {
      send.setAttribute('href', mailtoHref(url));
      send.addEventListener('click', function (ev) {
        var nav = win.navigator;
        if (!(nav && typeof nav.share === 'function')) return; // the mailto: href does the work
        ev.preventDefault();
        sendToSelf({ nav: nav, url: url, openMailto: function (href) { win.location.href = href; } });
      });
    }
    var copyBtn = doc.getElementById('copy-link');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        copyLink({ nav: win.navigator, url: url, legacyCopy: legacyCopyIn(doc) }).then(function (result) {
          if (!status) return;
          status.textContent = result === 'copied' ? COPY_WORDS.copied : COPY_WORDS.failed + url;
        });
      });
    }
    return { mode: html.getAttribute('data-mode'), url: url };
  }

  return {
    PLACEHOLDER: PLACEHOLDER,
    QUERIES: QUERIES,
    MAIL_SUBJECT: MAIL_SUBJECT,
    MAIL_BODY: MAIL_BODY,
    COPY_WORDS: COPY_WORDS,
    sheetIdFrom: sheetIdFrom,
    copyLinkFrom: copyLinkFrom,
    readConfig: readConfig,
    applyConfig: applyConfig,
    detectMode: detectMode,
    coldListOn: coldListOn,
    applyColdList: applyColdList,
    pageUrl: pageUrl,
    mailtoHref: mailtoHref,
    shareData: shareData,
    sendToSelf: sendToSelf,
    copyLink: copyLink,
    start: start
  };
}));
