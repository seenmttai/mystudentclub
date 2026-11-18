// "Open in the app" on the website (Padam, 10 Nov 2026: the bar Safari shows for an app, on Android phones too).
//
//   1. iPhone Safari shows Apple's own Smart App Banner from the page's <meta name="apple-itunes-app"> tag.
//      This file does nothing there.
//   2. Every other phone browser (Android; Chrome, Instagram, WhatsApp … on an iPhone) cannot show Apple's banner, so
//      this file shows a small bar with the same parts: the app icon, its name, Open and ×.
//
// Never inside the MSC app, on a computer or a tablet, for a crawler, or after the × (30 days) or a tap on Open (7 days).
//
// A page carries it with two lines in <head>: the apple-itunes-app tag and this script (see index.html). They are on
// the job lists and job pages, free resources, firm reviews, sessions, the links page and the blog. Programme,
// payment and sign-in pages never get them: a student who is about to enrol must not be sent away to a store.
(function (global) {
    'use strict';

    var APP = {
        name: 'My Student Club',
        line: 'CA jobs & articleship',
        icon: '/favicon.png',
        appStoreId: '6756720522',
        appStore: 'https://apps.apple.com/in/app/my-student-club/id6756720522',
        playPackage: 'com.app.msc',
        // Play's install referrer: Play Console → Acquisition reports show these installs as "website / app_banner".
        referrer: 'utm_source=website&utm_medium=app_banner&utm_campaign=website_app_banner'
    };

    var HIDE_KEY = 'msc_app_banner_hide_until';
    var CLOSE_DAYS = 30;
    var TAP_DAYS = 7;
    var DAY_MS = 86400000;
    var SHOW_AFTER_MS = 1200;

    // ───────────── who sees it (pure: the tests run every rule) ─────────────

    /** The phone this browser runs on; null on a computer or a tablet (an iPad says it is a Mac). */
    function phoneOf(ua) {
        ua = String(ua || '');
        if (/Windows Phone/i.test(ua)) return null;
        if (/iPhone|iPod/.test(ua)) return 'ios';
        if (/Android/i.test(ua) && /Mobile/i.test(ua)) return 'android';
        return null;
    }

    /** A crawler or a link preview, never a person. (A CUBOT phone is a person.) */
    function isCrawler(ua) {
        return /bot|crawl|spider|lighthouse|headless|facebookexternalhit|inspectiontool/i
            .test(String(ua || '').replace(/\bCUBOT\b/gi, ''));
    }

    /** iPhone Safari itself, which shows Apple's banner. Chrome, Firefox, the Google app and in-app browsers do not. */
    function iosSafari(ua) {
        ua = String(ua || '');
        if (!/iPhone|iPod/.test(ua) || !/Version\/[\d.]+.*Safari\//.test(ua)) return false;
        return !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\/|DuckDuckGo|YaBrowser|FBAN|FBAV|FBIOS|Instagram|Line\/|MicroMessenger|WhatsApp|Snapchat|Pinterest|LinkedInApp|Twitter/.test(ua);
    }

    /** Inside the MSC app: its web view carries the Flutter bridge and loads mobile.mystudentclub.com. */
    function inMscApp(win) {
        if (!win) return false;
        if (win.flutter_inappwebview) return true;
        var host = String((win.location && win.location.hostname) || '').toLowerCase();
        return host === 'mobile.mystudentclub.com';
    }

    /**
     * Facebook's, Instagram's or WhatsApp's own browser on Android. They load Google Play's web page inside themselves,
     * where Install asks for a Google sign-in, so they get the Play Store app's own link instead (playIntentUrl).
     */
    function metaBrowser(ua) {
        ua = String(ua || '');
        if (!/Android/i.test(ua)) return false;
        return /\bInstagram \d|FB_IAB\/|FBAN\/|FBAV\/|\bWhatsApp\/\d/.test(ua);
    }

    function playUrl() {
        return 'https://play.google.com/store/apps/details?id=' + APP.playPackage + '&referrer=' + encodeURIComponent(APP.referrer);
    }

    /** The same listing as an Android intent for the Play Store app, with Google Play's web page as the fallback. */
    function playIntentUrl() {
        return 'intent://details?id=' + APP.playPackage + '&referrer=' + encodeURIComponent(APP.referrer) +
            '#Intent;scheme=market;package=com.android.vending;S.browser_fallback_url=' + encodeURIComponent(playUrl()) + ';end';
    }

    /** Where Open goes on this phone. */
    function storeLink(phone, ua) {
        if (phone === 'ios') return APP.appStore;
        return metaBrowser(ua) ? playIntentUrl() : playUrl();
    }

    /** Still hidden: the stored time (ms) is in the future, and no further away than the longest hide. */
    function hiddenNow(stored, now) {
        var until = Number(stored);
        return isFinite(until) && until > now && until - now <= CLOSE_DAYS * DAY_MS + 60000;
    }

    /**
     * The phone the bar shows on, or null.
     * env: { ua, inApp, wide (768 px and up), framed (inside another page), hidden (hiddenNow) }
     */
    function bannerFor(env) {
        var phone = phoneOf(env.ua);
        if (!phone || env.wide || env.framed || env.inApp || env.hidden) return null;
        if (isCrawler(env.ua) || iosSafari(env.ua)) return null;
        return phone;
    }

    // ───────────── the bar ─────────────

    var CSS = [
        '#msc-app-banner{position:fixed;left:12px;right:12px;bottom:calc(var(--msc-app-banner-lift,0px) + 12px + env(safe-area-inset-bottom,0px));',
        'z-index:999;display:flex;align-items:center;gap:10px;box-sizing:border-box;max-width:480px;margin:0 auto;padding:10px 12px 10px 4px;',
        'background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:18px;box-shadow:0 12px 32px rgba(15,23,42,.18);',
        'font-family:inherit;line-height:1.25;transform:translateY(160%);opacity:0;transition:transform .4s cubic-bezier(.16,1,.3,1),opacity .3s ease}',
        '#msc-app-banner.is-on{transform:none;opacity:1}',
        '#msc-app-banner.is-typing{transform:translateY(160%);opacity:0;pointer-events:none}',
        '#msc-app-banner *{box-sizing:border-box}',
        '#msc-app-banner .mab-close{flex:0 0 auto;width:36px;height:44px;margin:0;padding:0;border:0;background:none;color:#64748b;font:inherit;font-size:22px;line-height:1;cursor:pointer;-webkit-tap-highlight-color:transparent}',
        '#msc-app-banner .mab-icon{flex:0 0 auto;width:46px;height:46px;border-radius:11px;border:1px solid #e2e8f0;background:#fff;object-fit:cover}',
        '#msc-app-banner .mab-text{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:1px}',
        '#msc-app-banner .mab-name{font-size:15px;font-weight:600;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '#msc-app-banner .mab-line{font-size:12.5px;color:#475569;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '#msc-app-banner .mab-store{font-size:11.5px;color:#64748b}',
        '#msc-app-banner .mab-open{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-width:72px;height:38px;padding:0 18px;',
        'border-radius:999px;background:#2563eb;color:#fff;font-size:15px;font-weight:600;text-decoration:none;-webkit-tap-highlight-color:transparent}',
        '#msc-app-banner .mab-open:active{background:#1d4ed8}',
        '@media (prefers-reduced-motion:reduce){#msc-app-banner{transition:none}}',
        '@media print{#msc-app-banner{display:none}}'
    ].join('');

    function readHidden(win, now) {
        try {
            return hiddenNow(win.localStorage.getItem(HIDE_KEY), now);
        } catch (_) {
            return false; // no storage (a private window): it shows, and closes for this page only
        }
    }

    function hideFor(win, days) {
        try {
            win.localStorage.setItem(HIDE_KEY, String(Date.now() + days * DAY_MS));
        } catch (_) {
            // nothing keeps it: it shows again on the next page
        }
    }

    /** Counts shows, taps and closes in Google Analytics on the pages that load it. */
    function track(win, action, phone) {
        try {
            if (typeof win.gtag === 'function') win.gtag('event', 'app_banner_' + action, { platform: phone });
        } catch (_) {
            // analytics must never break the page
        }
    }

    /**
     * How much of the bottom of the screen something else already holds (the resource pages' bottom menu): the bar
     * floats above it. A full-screen layer (a pop-up's backdrop) is not a bottom bar.
     */
    function bottomLift(win, bar) {
        var doc = win.document;
        if (!doc.elementsFromPoint) return 0;
        var h = win.innerHeight;
        var w = win.innerWidth;
        var top = h;
        [0.5, 0.12, 0.88].forEach(function (x) {
            var stack = doc.elementsFromPoint(Math.round(w * x), h - 3) || [];
            for (var i = 0; i < stack.length; i++) {
                for (var el = stack[i]; el && el !== doc.body && el.nodeType === 1; el = el.parentElement) {
                    if (el === bar) break;
                    if (win.getComputedStyle(el).position !== 'fixed') continue;
                    var r = el.getBoundingClientRect();
                    if (r.height < h * 0.5 && r.bottom >= h - 1 && r.top < top) top = r.top;
                    break;
                }
            }
        });
        return Math.max(0, Math.round(h - top));
    }

    function isTextField(el) {
        if (!el || !el.tagName) return false;
        var tag = el.tagName.toLowerCase();
        if (tag === 'textarea' || tag === 'select' || el.isContentEditable) return true;
        return tag === 'input' && !/^(button|submit|checkbox|radio|file|range|color|image|reset|hidden)$/i.test(el.type || '');
    }

    function build(win, phone) {
        var doc = win.document;
        var ua = win.navigator.userAgent;

        if (!doc.getElementById('msc-app-banner-style')) {
            var style = doc.createElement('style');
            style.id = 'msc-app-banner-style';
            style.textContent = CSS;
            doc.head.appendChild(style);
        }

        var bar = doc.createElement('div');
        bar.id = 'msc-app-banner';
        bar.setAttribute('role', 'region');
        bar.setAttribute('aria-label', APP.name + ' app');
        bar.innerHTML =
            '<button type="button" class="mab-close" aria-label="Close">&times;</button>' +
            '<img class="mab-icon" src="' + APP.icon + '" width="46" height="46" alt="">' +
            '<div class="mab-text">' +
            '<span class="mab-name">' + APP.name + '</span>' +
            '<span class="mab-line">' + APP.line.replace(/&/g, '&amp;') + '</span>' +
            '<span class="mab-store">Free on ' + (phone === 'ios' ? 'the App Store' : 'Google Play') + '</span>' +
            '</div>' +
            '<a class="mab-open" rel="noopener" href="' + storeLink(phone, ua).replace(/&/g, '&amp;') + '">Open</a>';

        function lift() {
            bar.style.setProperty('--msc-app-banner-lift', bottomLift(win, bar) + 'px');
        }

        function remove() {
            win.removeEventListener('resize', lift);
            doc.removeEventListener('focusin', onFocusIn);
            doc.removeEventListener('focusout', onFocusOut);
            if (bar.parentNode) bar.parentNode.removeChild(bar);
        }

        function onFocusIn(e) {
            if (isTextField(e.target)) bar.classList.add('is-typing'); // the keyboard is up: stay out of the way
        }

        function onFocusOut() {
            bar.classList.remove('is-typing');
        }

        bar.querySelector('.mab-close').addEventListener('click', function () {
            hideFor(win, CLOSE_DAYS);
            track(win, 'close', phone);
            remove();
        });
        bar.querySelector('.mab-open').addEventListener('click', function () {
            hideFor(win, TAP_DAYS);
            track(win, 'open', phone);
            win.setTimeout(remove, 400);
        });

        doc.body.appendChild(bar);
        lift();
        win.addEventListener('resize', lift);
        doc.addEventListener('focusin', onFocusIn);
        doc.addEventListener('focusout', onFocusOut);
        // Two frames later, so the bar slides up instead of appearing.
        win.setTimeout(function () {
            lift();
            bar.classList.add('is-on');
            track(win, 'show', phone);
        }, 50);
        win.setTimeout(lift, 2500); // a bottom menu that drew late

        return bar;
    }

    /** Shows the bar if this browser should see it. Returns the phone it showed for, or null. */
    function init(win) {
        win = win || global;
        var doc = win.document;
        if (!doc || !doc.body || doc.getElementById('msc-app-banner')) return null;
        var framed = false;
        try {
            framed = win.self !== win.top;
        } catch (_) {
            framed = true;
        }
        var phone = bannerFor({
            ua: win.navigator.userAgent,
            inApp: inMscApp(win),
            wide: !!(win.matchMedia && win.matchMedia('(min-width: 768px)').matches),
            framed: framed,
            hidden: readHidden(win, Date.now())
        });
        if (!phone) return null;
        build(win, phone);
        return phone;
    }

    global.MSCAppBanner = {
        APP: APP,
        HIDE_KEY: HIDE_KEY,
        CLOSE_DAYS: CLOSE_DAYS,
        TAP_DAYS: TAP_DAYS,
        phoneOf: phoneOf,
        isCrawler: isCrawler,
        iosSafari: iosSafari,
        inMscApp: inMscApp,
        metaBrowser: metaBrowser,
        playUrl: playUrl,
        playIntentUrl: playIntentUrl,
        storeLink: storeLink,
        hiddenNow: hiddenNow,
        bannerFor: bannerFor,
        init: init
    };

    // On a page: wait for it to settle, then show. (The tests load this file without a document and call init().)
    if (global.document && global.setTimeout && !global.MSC_APP_BANNER_MANUAL) {
        var start = function () {
            global.setTimeout(function () { init(global); }, SHOW_AFTER_MS);
        };
        if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', start);
        else start();
    }
})(window);
