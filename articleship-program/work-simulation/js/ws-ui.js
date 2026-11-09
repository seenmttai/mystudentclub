/* MSC Articleship Program · Work Simulation UI (browser only): hash router and screens.
   Needs ws-engine.js, ws-docs.js and ws-store.js loaded first. */
(function () {
  'use strict';
  var E = window.MSCWSEngine, D = window.MSCWSDocs, S = window.MSCWSStore;
  var root = document.getElementById('app');
  var live = document.getElementById('ws-live');
  var esc = D.esc;
  var PREVIEW = /(?:^|[?&])preview=1(?:&|$)/.test(location.search);
  var HTML = document.documentElement;
  var CV_BUILDER = HTML.getAttribute('data-cv-builder') || '/cv-builder/?stage=articleship';
  var LOGIN_URL = HTML.getAttribute('data-login-url') || '/learning-management-system/';
  var JOIN_URL = HTML.getAttribute('data-join-url') || '/learning-management-system/';
  var COURSE = 'msc-articleship-program';
  var DESKTOP = window.matchMedia ? window.matchMedia('(min-width: 1024px)') : { matches: false };

  /* Tool text in Padam's voice and the house style (curly quotes, no exclamation marks). */
  var COPY = {
    padam: 'I built this so you can do an article’s first-year work before you join. Every answer gets a senior’s note. Every CV line here is true, because you did it.',
    padamBy: 'CA Padam Bhansali',
    cvRule: 'Put these under Certifications and job simulations.',
    oneLine: 'One line per domain on your CV: pick one level, or your best two, in ',
    oneLineSolo: 'One line per domain on your CV: this is your {d} line, kept in ',
    pickNote: 'Pick up to two levels for this line.',
    handInAsk: 'Hand in this task?',
    handInNote: 'You can’t change these answers after this.',
    handInYes: 'Hand it in',
    handedIn: 'Handed in. You can read these answers but not change them.',
    notPassed: 'Read the notes, then try again.',
    hintCost: 'A hint costs one star on this level.',
    sampleMisses: 'This prints your answers as you gave them, wrong ones too. For a sample with every answer right, try the level again first.',
    allDone: 'You have done every level here. Your lines are ready in My CV lines.'
  };

  var app = {
    cat: null, world: {}, levels: {}, loading: {}, failed: {}, state: E.emptyState(), store: null, myDomain: null,
    route: { name: 'loading' }, gated: false, fromLink: false, scrolls: {}, saveTimer: null,
    ui: { filter: {}, rfilter: {}, view: {}, hint: null, tab: {}, pane: {}, other: {}, hunt: {}, copied: null, adding: null, typing: false, pendingRender: false }
  };

  /* ------------------------------------------------------------------ small helpers */
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function announce(msg) { if (!live) return; live.textContent = ''; setTimeout(function () { live.textContent = msg; }, 30); }
  function arr(v) { return Array.isArray(v) ? v : (v === undefined || v === null || v === '' ? [] : [v]); }
  // a sign and its amount never split over two lines ("+₹18,64,000" broke after the "+" on a phone)
  // (val-1: a range of amounts, "₹109–142 crore", is one amount too)
  // con-1 round 2 (designer S1): the amount keeps its unit word, so "₹1,094.50" never ends a line with "lakh" starting
  // the next, where it reads as rupees beside a ₹ lakh figure ("₹1,094.50 lakh", "₹27 crore", "₹109–142 crore")
  function escNum(t) { return esc(t).replace(/([+−-]?₹[\d,.]+(?:–\d(?:[\d,.]*\d)?)?(?:[  ](?:lakh|crore)(?![\w-]))?)/g, '<span class="nw">$1</span>'); }
  // the senior's notes, the mail lines, workings and the CV line: an amount with its sign, a part code ("6306-ZZ"), a
  // return or form name ("GSTR-2B", "GSTR-1A") and a slash-numbered bill with a hyphenated year ("KP/26-27/1187") stay
  // on one line (gst-1: "KP/26-" read as a minus at a line end); "cut-off" and "GRN-2027-04-0007" are left to wrap.
  // val-1: a year or a range written with an en dash ("2030–31", "12–14%", "16–32 times") and a span of time ("5-year",
  // "11-month") stay whole too ("2030– / 31" on a phone)
  // dt-1: a part code whose group starts with a digit ("6205-2RS") is held as the documents hold it (ws-docs PART_RE:
  // the group has a capital), so "2026-27" is still left alone
  // gst-2 round 1: a form name's plural keeps it whole ("GSTR-1s", "GSTR-3Bs"; "Chakan’s GSTR-" / "1s?" in a hint and
  // the fail bubble), as ws-docs CODE_RE does
  // consistency pass round 1 (P05): every code the papers hold whole (ws-docs CODE_RE via nwCodes: "JW-0617",
  // "FA-27-01", "GSTR-1s") is held whole in the notes, labels and whys too; the old rule here kept only codes of up to
  // three characters after one hyphen, so "JW-" / "0617" broke in sa-2's review at 360 px and "FA-27-" / "01" in sa-3's
  function escText(t) {
    return D.nwCodes(escNum(t).replace(/(^|[^\w-])(\d{3,}-(?=[A-Z0-9]{0,3}[A-Z])[A-Z0-9]{1,4})(?![\w-])/g, '$1<span class="nw">$2</span>'))
      .replace(/(^|[^\w\/-])([A-Z]{1,5}(?:\/[A-Z]{1,5})*\/\d{2,4}-\d{2}\/\d{1,6})(?![\w\/-])/g, '$1<span class="nw">$2</span>')
      // sa-1 round 6 (designer S1): a slash number that ends in its year ("PSG/0938/26-27", "RF/2291/26-27") is held as
      // ws-docs SLASH_END_YEAR_RE holds it in a paper: whole up to 16 characters, and a longer one keeps its final year
      // whole with a break chance at the slash before it, so it never reads "26-" / "27" at a line end
      .replace(/(^|[^\w\/-])([A-Z][A-Za-z0-9]{0,7}(?:\/[A-Za-z0-9]{1,8})*\/\d{2,4}-\d{2})(?![\w\/-])/g, function (m, pre, no) {
        return pre + (no.length <= 16 ? '<span class="nw">' + no + '</span>' : no.replace(/\/(\d{2,4}-\d{2})$/, '/<wbr><span class="nw">$1</span>'));
      })
      .replace(/(^|[^\w>₹.,–-])(\d(?:[\d,.]*\d)?–\d(?:[\d,.]*\d)?%?)(?![\w%–])/g, '$1<span class="nw">$2</span>')
      // con-1 round 2 (designer S1): a count with its unit word and a clock time stay whole ("1.3" / "lakh", "To me by
      // 5" / "pm" on a phone), as does a held range with its unit ("2–3 lakh"); a ₹ amount is escNum's ("₹1,094.50
      // lakh"), which the guard leaves alone, and "₹ lakh" with no figure is not touched
      .replace(/(^|[^\w>₹.,:–\-+−])([+−]?\d(?:[\d,.:]*\d)?[  ](?:lakh|crore|am|pm)(?![\w-]))/g, '$1<span class="nw">$2</span>')
      .replace(/(<span class="nw">[+−]?\d(?:[\d,.]*\d)?–\d(?:[\d,.]*\d)?)<\/span>([  ](?:lakh|crore)(?![\w-]))/g, '$1$2</span>')
      // a number joined to its word stays whole: "3-year", and xl-1 round 1 any such compound ("Cleaned a 71-" / "row
      // ledger…" on My CV lines; "3-ply")
      .replace(/(^|[^\w-])(\d+-[a-z]{2,})(?![\w-])/g, '$1<span class="nw">$2</span>')
      // dt-2 round 4 (designer S1): a range of months stays whole ("₹27,373 for July–" / "September" in a review note,
      // "register, Apr–" / "Sep" in a pack list), as ws-docs nwDates holds it in a paper; before the month rule, so
      // "Apr–Jun 2026" may still break before its year
      .replace(/^[^]*$/, function (h) { return D.nwMonthRanges ? D.nwMonthRanges(h) : h; })
      // sa-3 round 1: a month and its year stay together ("Program | Oct" / "2026" on the done screen and My CV lines);
      // dt-4 round 2: with the day before them, if there is one, so the day never hangs at a line end before a held
      // month and year ("to be paid on 20" / "October 2027" in a review at 390 px); sa-1 round 6 (designer S2): a day
      // and its month stay together with no year too ("reached Tamhini’s stores on 30" / "March" in the senior’s notes,
      // in a level whose lesson is reading two dates side by side), the year joining them when one follows
      .replace(/(^|[^\w])((?:\d{1,2}[  ](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:[  ]\d{4})?)|(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) \d{4}))(?!\w)/g, '$1<span class="nw">$2</span>')
      // dt-3: a section number with its brackets stays whole ("section 143(1)" / "(a)" broke in the reply on a phone;
      // the same rule as ws-docs SECTION_RE: 143(1)(a)(iv), 36(1)(va), 2(24)(x), 139(1))
      .replace(/(^|[^\w(>&#;])(\d{1,3}[A-Z]{0,4}(?:\((?:\d{1,3}[A-Za-z]{0,2}|[a-z]{1,5}|[A-Z]{1,2})\)){1,4})(?![\w(])/g, '$1<span class="nw">$2</span>')
      // sa-7 round 2 (designer S2, as a pattern): a clause reference without a section number before it ("(vii)(a)",
      // "(xi)(b)") stays whole too, as ws-docs CLAUSE_RE holds it in a paper; a lone "(a)" or "(₹)" is left alone
      .replace(/(^|[^\w(>&#;])(\([ivx]{1,5}\)(?:\((?:[a-z]{1,2}|[A-Z])\)){1,3})(?![\w(])/g, '$1<span class="nw">$2</span>')
      // acc-1 round 1 (designer S5): a whole date stays on one line, as ws-docs' DATE_RE holds it in a paper ("Bills
      // dated 06-04-" / "2027" under an item on the list read as a minus at a line end)
      .replace(/(^|[^\w\-\/])(\d{1,2}-(?:\d{2}|[A-Z][a-z]{2})-\d{4})(?![\w\-])/g, '$1<span class="nw">$2</span>')
      // sa-1 round 6 (fixer 2): a range of days held above takes its month too ("22–31 Dec", "10–14 Aug"), as ws-docs
      // nwDates joins them in a paper, so the range never reads "22–31" / "Dec" at a line end
      .replace(/^[^]*$/, function (h) { return D.nwDayRanges ? D.nwDayRanges(h) : h; })
      // sa-1 round 6 (fixer 3, as dt-1 round 6's pattern): a " · " is held to the word before it, as escLabel,
      // escTitle and ws-docs hd() hold theirs, so no line of a note, prompt or review starts with the dot (sa-7's
      // live annexure read "… year ended 31 March 2027" / "· your clauses" on the desktop once its date was held)
      .replace(/ · /g, ' · ');
  }
  // a title never breaks inside a hyphenated or dashed word ("cut- / off" in Caveat on a phone); the shipped font
  // subsets have no non-breaking hyphen (U+2011), so the word is held together with markup
  // sa-6 round 1: a middot never opens a line ("Kilimani Motor Spares" / "· customer, Kenya"): it is held to the word
  // before it, so the heading breaks after the dot
  function escTitle(t) { return esc(t).replace(/(\S+[-–]\S+)/g, '<span class="nw">$1</span>').replace(/ · /g, ' · '); }
  // an item label holds its codes on one line, as a document does ("CNC TC-35 · FA-27-04" broke after "FA-27-" beside
  // the call chip on a phone); sa-2 r1b: so do a part code that starts with digits ("6205-2RS", ws-docs nwParts), a
  // number joined to a word ("5-ply") and a number with its unit ("240 mm"), which broke as "6205-" / "2RS" (a minus
  // at a line end) once the row carried its call chip
  function escLabel(t) {
    var h = esc(t);
    if (D.nwCodes) h = D.nwCodes(h);
    if (D.nwParts) h = D.nwParts(h);
    // acc-1 round 1 (designer S5): a year or range with an en dash stays whole too ("Depreciation 2026–" / "27" beside
    // the call chip on a phone), as escText and the papers hold it
    if (D.nwRanges) h = D.nwRanges(h);
    // dt-1 round 6: a day keeps its month, as ws-docs nwDates holds it in a paper and escText in a note (sa-1 round 6's
    // rule): gst-2's "Old lathe sold on 14" / "December" and "credit note 001 of 28" / "March" broke beside the call chip
    if (D.nwDates) h = D.nwDates(h);
    // sa-1 round 6 (fixer 2): beside a call chip the year may still wrap after a held day and month: cl-1's "Meeting 94
    // · 12 November 2026" held whole set the label's minimum width and clipped its Exception chip by 11 px at 360 px;
    // now "12 November" / "2026" there, and one line wherever it fits
    h = h.replace(/<span class="nw">(\d{1,2}(?:–\d{1,2})?[ \u00a0][A-Z][a-z]{2,8}) (\d{4})<\/span>/g, '<span class="nw">$1</span> $2');
    // dt-1 round 6 (designer S2, as a pattern): its " · " is held to the word before it, as escTitle and ws-docs hd()
    // hold theirs, so no line of a list, review or work sample starts with the dot
    return h.replace(/(^|[\s(,])(\d+(?:-[a-z]+| (?:mm|cm|kg|inch|nos)))(?=[\s,)]|$)/g, '$1<span class="nw">$2</span>').replace(/ · /g, '\u00a0· ');
  }
  // the CV line as escText holds it, and a clause's hyphenated first verb stays whole (sa-2 r1b: "Test-" / "counted"
  // split at the start of the line a student copies by eye, on the phone's yellow card). sa-1 round 8 (designer
  // optional 1): so does every hyphenated word of letters in the line, as escTitle holds a title's ("(2 cut-" / "off,
  // 1 unapproved PO" on My CV lines at 390, "Vouched 20 year-" / "end purchase bills" on the done screen at 1366); the
  // text copied is the same, only the display holds. Notes and prompts (escText) still wrap at a hyphen. sa-1 round 8
  // (second fixer): a bare count keeps the word it counts, so no line of the card ends on "(2", "1" or "7" ("flagged 7
  // exceptions (2" / "cut-off, 1 unapproved PO, 1" / "overpricing" once "cut-off" was held); the count runs with one word,
  // a held word or code, or a possessive ("4 managers’"). for-1 round 3 (designer optional 2): a compound joined by an en
  // dash is held as a hyphenated one is ("…holiday postings and vendor–" / "employee matches" on the done screen at 1366)
  function escLine(t) {
    return escText(t).replace(/(^|[\s(])([A-Za-z]+(?:[-–][A-Za-z]+)+)(?=[\s,;:.)]|$)/g, '$1<span class="nw">$2</span>')
      .replace(/(^|[\s(])(\d+(?:[,.]\d+)* (?:<span class="nw">[^<]{1,24}<\/span>|[A-Za-z]+(?:’[a-z]*)?))(?=[\s,;:.)]|$)/g, '$1<span class="nw">$2</span>');
  }
  function plural(n, one, many) { return n === 1 ? one : many; }
  function capWord(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function doodle(name, cls, alt) { return '<img class="' + (cls || '') + '" src="img/doodles/' + name + '.svg" alt="' + esc(alt || '') + '"' + (alt ? '' : ' aria-hidden="true"') + '>'; }
  var SVG = {
    chev: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    prev: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    up: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 12.5 10 7l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 7.5 10 13l5.5-5.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    back: '<svg viewBox="0 0 60 30" aria-hidden="true"><path d="M56 18 C 40 8, 24 8, 8 15" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><path d="M17 7 L 7 15 L 18 21" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    docs: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h8l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7.5 3.5z" fill="#fff" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 3.5V8h4M9 12h6M9 15.5h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 20.5 20.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    flag: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M6 4.5c4-2 7 2 12 0v8c-5 2-8-2-12 0" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V3.5h10V8M7 17H4.5V9.5A1.5 1.5 0 0 1 6 8h12a1.5 1.5 0 0 1 1.5 1.5V17H17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M7 13.5h10v7H7z" fill="#fff" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
    next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M13 6.5 18.5 12 13 17.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  var STAR = 'M 20.32 2.83 Q 22.26 8.66 24.52 14.37 Q 30.56 14.29 36.57 14.91 Q 32.02 19.14 27.28 23.14 Q 28.83 28.89 30.32 34.65 Q 24.92 31.66 19.71 28.35 Q 14.54 31.44 9.56 34.82 Q 11.20 28.99 12.64 23.10 Q 7.94 19.38 3.35 15.53 Q 9.63 15.23 15.86 14.28 Q 17.84 8.46 20.32 2.83 Z';
  function stars(n, cls) {
    var out = '';
    for (var i = 0; i < 3; i++) out += '<svg viewBox="0 0 40 40" class="' + (i < n ? 'star-on' : 'star-off') + '"><path d="' + STAR + '" stroke-width="2.1" stroke-linejoin="round"/></svg>';
    return '<span class="stars ' + (cls || '') + '" role="img" aria-label="' + n + ' of 3 stars">' + out + '</span>';
  }
  function starIcon() { return '<svg viewBox="0 0 40 40" class="star-on" aria-hidden="true"><path d="' + STAR + '" stroke-width="2.4" stroke-linejoin="round"/></svg>'; }
  function crumb(href, label) { return '<a class="crumb" href="' + href + '">' + SVG.back + esc(label) + '</a>'; }

  function fetchJSON(url) {
    return fetch(url, { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error(r.status + ' ' + url);
      return r.json();
    });
  }
  function domain(id) { return E.domainById(app.cat, id); }
  function meta(id) { return E.levelMeta(app.cat, id); }
  function visible(metaRow) { return !!metaRow && (PREVIEW || metaRow.published); }
  function display(metaRow) { return E.levelDisplay(domain(metaRow.domain), metaRow); }
  function people() {
    var w = app.world || {}, out = {};
    var list = Array.isArray(w.people) ? w.people : (w.people && typeof w.people === 'object' ? Object.keys(w.people).map(function (k) { var p = w.people[k]; if (p && !p.id) p.id = k; return p; }) : []);
    list.forEach(function (p) { if (p && p.id) out[p.id] = p; });
    return out;
  }
  function person(id, level) {
    var p = null;
    if (level && Array.isArray(level.people)) p = level.people.filter(function (x) { return x && x.id === id; })[0] || null;
    if (!p) p = people()[id] || null;
    if (!p) return { id: id, name: id ? String(id) : '', role: '', roleShort: '', initials: '', color: '' };
    var name = p.name || p.displayName || [p.first || p.firstName, p.last || p.surname || p.lastName].filter(Boolean).join(' ') || p.id;
    var initials = p.initials || name.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').slice(0, 2).toUpperCase();
    // roleShort ("Audit senior") is what a chat header shows; role is the world bible's longer description
    return { id: p.id, name: name, first: name.split(/\s+/)[0], role: p.role || p.title || '', roleShort: p.roleShort || '', initials: initials, color: p.color || p.colour || p.avatar || p.avatarColor || '' };
  }
  function avatar(p) {
    var c = /^#[0-9a-f]{3,8}$/i.test(p.color || '') ? p.color : '#06152F';
    return '<span class="av" style="background:' + c + '" aria-hidden="true">' + esc(p.initials) + '</span>';
  }
  // Desktop documents pane: when a re-render would draw the same pane (same signature), the live pane is kept as it
  // is, so a 500-row ledger is not rebuilt on every click and the student's scroll position in it stays put.
  function paneShell(sig) {
    var cur = root.querySelector('.docs-pane[data-sig]');
    return cur && cur.getAttribute('data-sig') === sig ? '<aside class="docs-pane" aria-label="Documents" data-sig="' + esc(sig) + '" data-keep="1"></aside>' : null;
  }
  function docCtx(level, sheetLink, docLink) {
    var c = { world: app.world, person: function (id) { return person(id, level); } };
    if (sheetLink) c.sheetLink = sheetLink;
    if (docLink) c.docLink = docLink;
    // xl-1 round 1: a mail's attachment given as { name, file } links to files/<level id>/<file>
    if (level && level.id) c.levelId = level.id;
    return c;
  }
  // an Excel tab names another sheet of the workbook: when that sheet is a paper of this pack (its sheetName), the tab
  // opens it as the arrows do (val-1: "Value" on the DCF sheet); make(j) gives the tags for the paper at index j
  function sheetLinker(docs, make) {
    return function (name) {
      for (var j = 0; j < docs.length; j++) if (docs[j] && docs[j].sheetName === name) return make(j);
      return null;
    };
  }
  // mat-1 round 1 (designer S5): a mail's attachment given as { name, doc } opens that paper of the pack, the same way
  // (make(j, cls): the tags, with the chip's own class); null when the paper is not in this list, so it stays a chip
  function docLinker(docs, make) {
    return function (id, cls) {
      for (var j = 0; j < docs.length; j++) if (docs[j] && docs[j].id === id) return make(j, cls);
      return null;
    };
  }
  function ls(id) { return E.levelState(app.state, id); }

  /* ------------------------------------------------------------------ state and saving */
  function commit(next, opts) {
    app.state = next;
    if (app.saveTimer) clearTimeout(app.saveTimer);
    if (opts && opts.now) { app.state = app.store.save(app.state); return; }
    app.saveTimer = setTimeout(function () { app.saveTimer = null; app.state = app.store.save(app.state); }, 250);
  }
  function flushSave() {
    if (app.saveTimer) { clearTimeout(app.saveTimer); app.saveTimer = null; app.state = app.store.save(app.state); }
    if (app.store) app.store.flush();
  }
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flushSave(); });

  function ensureLevel(id) {
    if (app.levels[id]) return Promise.resolve(app.levels[id]);
    if (app.loading[id]) return app.loading[id];
    app.loading[id] = fetchJSON('data/levels/' + encodeURIComponent(id) + '.json').then(function (lv) {
      app.levels[id] = lv; delete app.loading[id]; return lv;
    }, function (e) { delete app.loading[id]; app.failed[id] = true; throw e; });
    return app.loading[id];
  }

  // the level the home screen offers is fetched quietly, so its case file opens at once (a failure here is silent
  // and leaves the normal load to try again)
  function prefetchLevel(id) {
    if (app.levels[id] || app.loading[id] || app.prefetched === id) return;
    app.prefetched = id;
    setTimeout(function () {
      fetchJSON('data/levels/' + encodeURIComponent(id) + '.json').then(function (lv) { if (!app.levels[id]) app.levels[id] = lv; }, function () {});
    }, 300);
  }

  /* ------------------------------------------------------------------ routing */
  function parseRoute(hash) {
    var p = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    if (!p.length) return { name: 'home' };
    if (p[0] === 'cv') return { name: 'cv' };
    if (p[0] === 'd' && p[1]) return { name: 'domain', domain: p[1] };
    if (p[0] === 'l' && p[1]) {
      var id = p[1];
      if (!p[2]) return { name: 'intro', level: id };
      if (p[2] === 'docs') return { name: 'intro', level: id, viewer: true, doc: p[3] ? parseInt(p[3], 10) : null };
      if (p[2] === 'review') return { name: 'review', level: id };
      if (p[2] === 'done') return { name: 'review', level: id, done: true };
      if (p[2] === 'sample') return { name: 'sample', level: id };
      if (p[2] === 't' && p[3]) {
        var r = { name: 'task', level: id, task: parseInt(p[3], 10) };
        if (p[4] === 'i' && p[5]) { r.name = 'item'; r.item = parseInt(p[5], 10); }
        else if (p[4] === 'docs') { r.viewer = true; r.doc = p[5] ? parseInt(p[5], 10) : null; }
        return r;
      }
    }
    return { name: 'notfound' };
  }
  // History: opening a bill or a document pushes one entry; stepping bill to bill or paper to paper replaces it
  // (data-replace links, swipes, arrow keys), so the phone's Back returns to the list or closes the viewer.
  // app.backTo is the route the current entry was pushed from (null when unknown: after Back, a reload or a typed
  // address). An "up" link (data-up: All bills, Back to the list, Close documents) goes Back when that is where it
  // leads, instead of piling a new entry on top; when it is unknown, the up link replaces the current entry.
  function go(hash, replace) {
    app.fromLink = true;
    // the entry keeps its state when its address is replaced (the boot entry's mark, below)
    if (replace) { app.nav = 'replace'; history.replaceState(history.state, '', hash); onRoute(); }
    else if (location.hash === hash) onRoute();
    else { app.nav = 'push'; location.hash = hash; }
  }
  function goUp(hash) {
    if (app.backTo && app.backTo === hash && history.length > 1) { app.upNav = true; history.back(); }
    else go(hash, true);
  }
  function onRoute() {
    var prevKey = app.routeKey;
    if (prevKey) app.scrolls[prevKey] = window.scrollY;
    app.leftViewer = !!prevKey && /\/docs\/\d*$/.test(prevKey);   // leaving the documents viewer (afterRender)
    var nav = app.nav; app.nav = null;
    // consistency pass round 1 (P01): a route reached by the browser's Back or Forward (no link, no go()), and the route
    // it came from, so the work screen can walk past stale task entries after a hand-in
    app.histNav = !nav && !app.fromLink; app.prevKey = prevKey || null; app.walking = null;
    app.route = parseRoute(location.hash);
    app.routeKey = location.hash || '#/';
    if (nav === 'push') app.backTo = prevKey || null;
    else if (nav !== 'replace' && prevKey !== app.routeKey) app.backTo = null;
    app.ui.hint = null; app.ui.hintOpen = null;
    // for-1 round 1: a toast ("Added to your CV") belongs to the screen it was said on
    $all('.toast').forEach(function (t) { if (t.parentNode) t.parentNode.removeChild(t); });
    render(true);
  }

  // P01: one step of a walk past stale entries is one more Back. At the oldest entry the browser keeps (Chromium keeps
  // 50, so a long session loses the page's first entries) Back does nothing: with no popstate in 600 ms the walk ends
  // there, the review put in that entry's place
  function walkBack(to) {
    var n = app.pops || 0;
    app.walking = to;
    setTimeout(function () { history.back(); }, 0);
    clearTimeout(app.walkTimer);
    app.walkTimer = setTimeout(function () { if (app.walking === to && (app.pops || 0) === n) { app.walking = null; go(to, true); } }, 600);
  }
  // P01: an entry whose address was replaced by the one before it (a task opened before its hand-in, put back in
  // place) gives a Back with no hashchange; a walk past stale entries goes on from there (or stops at the boot entry)
  window.addEventListener('popstate', function () {
    app.pops = (app.pops || 0) + 1;
    if (!app.walking || (location.hash || '#/') !== app.routeKey) return;
    if (history.state && history.state.wsBoot) { var to = app.walking; app.walking = null; go(to, true); return; }
    walkBack(app.walking);
  });

  function render(isNav) {
    closeSheet(true);
    if (app.gated) { root.innerHTML = gateScreen(); return; }
    if (!app.cat) { root.innerHTML = '<div class="loading">Opening Work Simulation…</div>'; return; }
    var r = app.route, html;
    try {
      if (r.name === 'home') html = homeScreen();
      else if (r.name === 'domain') html = domainScreen(r);
      else if (r.name === 'cv') html = cvScreen();
      else if (r.name === 'intro' || r.name === 'task' || r.name === 'item' || r.name === 'review' || r.name === 'sample') html = levelScreen(r);
      else html = notFound();
    } catch (e) {
      if (window.console) console.error(e);
      html = errorScreen();
    }
    if (html === null) return;              // waiting for data; the loader renders again
    if (!patchAroundPane(html)) root.innerHTML = html;
    document.body.classList.toggle('no-scroll', !!$('.viewer', root));
    syncInert();
    updateTopbar();
    afterRender(isNav);
  }
  // Wide tables scroll inside their own box. A strip pinned above the table (inside the box, so a document's
  // frame stays whole) carries a button that pages the table sideways and says when there is more to the right.
  function sxLabel(el) {
    return tableAtEnd(el) ? SVG.prev + '<span>First columns</span>' : '<span>More columns</span>' + SVG.chev;
  }
  // The table is at its end when no column (the pinned ones and the pad aside) runs past the box's right edge,
  // however many pixels the box could still scroll: dt-1's sheets kept "More columns" over 17 px of empty room, and
  // the next tap slid the first column under the row numbers ("1-01-2027" for 11-01-2027). A column still cut at the
  // right edge is always more to page to (ia-1: an invoice's Amount column stopped 5 px short).
  function tableAtEnd(el) {
    return el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 || !nextColumn(el);
  }
  // the leftmost column whose right edge is past the box's right edge (4 px of slack for a table's outer rule and
  // rounding: dt-2's Note column, 2 px wider than the room, took a tap of its own). xl-1 round 2: once a sheet has
  // paged, a column cut only in its cells' right padding counts as shown, since every character of it is on screen
  // (Varun's tie offered a third page holding T alone, for 7 px of T's 8 px padding); the first page keeps 4 px.
  function nextColumn(el) {
    var box = el.getBoundingClientRect(), slack = endSlack(el);
    return $all('thead th', el).filter(function (th) {
      return th.colSpan === 1 && !/\bstick[01]\b|\bsx-pad\b/.test(th.className) && th.getBoundingClientRect().right - box.left > el.clientWidth + slack;
    }).sort(function (a, b) { return a.getBoundingClientRect().left - b.getBoundingClientRect().left; })[0] || null;
  }
  function endSlack(el) {
    if (!(el.scrollLeft > 0) || !el.querySelector('table.dt-sheet')) return 4;
    var td = el.querySelector('table.dt-sheet tbody td:not(.stick0):not(.stick1)');
    return Math.max(4, td ? parseFloat(getComputedStyle(td).paddingRight) || 0 : 0);
  }
  // When the new screen keeps the live documents pane (see paneShell), only the nodes around it are replaced: the
  // pane stays in the DOM untouched, with its layout, scroll position and focus.
  function patchAroundPane(html) {
    var live = root.querySelector('.docs-pane[data-sig]');
    if (!live || html.indexOf('data-keep="1"') < 0) return false;
    var tpl = document.createElement('div');
    tpl.innerHTML = html;
    var shell = tpl.querySelector('.docs-pane[data-keep]'), work = live.parentNode, next = shell && shell.parentNode;
    if (!shell || shell.getAttribute('data-sig') !== live.getAttribute('data-sig') || !work || !next ||
      !work.classList.contains('work') || work.parentNode !== root || next.parentNode !== tpl) return false;
    Array.prototype.slice.call(work.childNodes).forEach(function (n) { if (n !== live) work.removeChild(n); });
    Array.prototype.slice.call(next.childNodes).forEach(function (n) { if (n !== shell) work.appendChild(n); });
    work.className = next.className;
    Array.prototype.slice.call(root.childNodes).forEach(function (n) { if (n !== work) root.removeChild(n); });
    Array.prototype.slice.call(tpl.childNodes).forEach(function (n) { if (n !== next) root.appendChild(n); });
    return true;
  }
  function markScrollables(scope) {
    $all('.doc-scroll', scope || root).forEach(function (el) {
      var strip = el.firstElementChild && el.firstElementChild.classList.contains('sx') ? el.firstElementChild : null;
      var table = strip ? strip.nextElementSibling : el.firstElementChild;
      var wide = !!table && table.scrollWidth > el.clientWidth + 4;
      if (wide && !strip) {
        el.insertAdjacentHTML('afterbegin', '<div class="sx"><button type="button" class="sx-btn" data-act="sx"></button></div>');
        strip = el.firstElementChild;
      }
      if (!wide && strip) { strip.parentNode.removeChild(strip); strip = null; }
      el.classList.toggle('is-wide', wide);
      // only a box that scrolls needs to be a tab stop (keyboard users scroll it with the arrow keys)
      if (wide) el.setAttribute('tabindex', '0'); else el.removeAttribute('tabindex');
      if (!strip) { edgeFade(el, table); return; }
      strip.style.width = el.clientWidth + 'px';
      // fdd-1 round 1: a sheet with `startPage: "last"` opens on its last page, the column the student works in (the
      // databook's nine months) with as many whole columns before it as fit, once each time the paper is shown;
      // "First columns" is one tap back to the years
      if (el.getAttribute('data-start') === 'last' && !el.hasAttribute('data-started') && el.clientWidth > 0) {
        el.setAttribute('data-started', '1');
        var to = lastPageLeft(el);
        if (to !== null && to > 0) el.scrollLeft = to;
      }
      var btn = strip.firstElementChild;
      btn.innerHTML = sxLabel(el);
      edgeFade(el, strip.nextElementSibling);
      if (!el.getAttribute('data-sx')) {
        el.setAttribute('data-sx', '1');
        el.addEventListener('scroll', function () {
          var b = el.querySelector('.sx-btn'); if (!b) return;
          var html = sxLabel(el); if (b.innerHTML !== html) b.innerHTML = html;
          if (!el._fadeQ) {
            el._fadeQ = 1;
            requestAnimationFrame(function () { el._fadeQ = 0; var s = el.firstElementChild; edgeFade(el, s && s.classList.contains('sx') ? s.nextElementSibling : null); });
          }
        }, { passive: true });
      }
    });
  }
  // sa-4 round 4 (designer optional 1): while a paged table has more to its right, the column cut at its right edge fades
  // out to the paper: its last 14 px on screen are gone and the 24 px before them fade, never further left than that
  // column's own left edge, so a column shown whole keeps every letter. When the cut column's body would show a glyph in
  // under a quarter of its rows, that is no peek, only stray marks (the bank report's Total row showed a lone "2" beside
  // "Total (43 credits)": 7 px of the first digit of 21,66,562.00, wider than the right-aligned amounts above it; the
  // payroll summary's total a lone "6"): its body rows fade out before the first such glyph (never left of the column's
  // own left rule), while its heading keeps the fade. A wider peek keeps its "more to the right" cue. The mask sits on
  // the table, in its own coordinates and moved with the scroll, not on the box, so the box's focus ring and the More
  // columns strip are never faded; at the table's end (tableAtEnd, as the button's label) it goes.
  var FADE_GONE = 14, FADE_RAMP = 24, FADE_SEEN = 8;
  function edgeFade(el, body) {
    var cut = body && el.clientWidth > 0 && el.classList.contains('is-wide') && !tableAtEnd(el) ? nextColumn(el) : null;
    var m = '', size = '';
    if (cut) {
      var b = body.getBoundingClientRect(), box = el.getBoundingClientRect(), right = box.left + el.clientLeft + el.clientWidth;
      var r = right - b.left, c = cut.getBoundingClientRect().left - b.left, gone = r - FADE_GONE;
      // the cut column's cells, row by row (the cell that runs past the edge): how many have text, how many show a glyph
      // (a row whose cell there starts left of the column, one spanning several columns as xl-1's raw sheet has, is no
      // cell of the cut column and is left out)
      var rows = 0, shown = 0, first = Infinity, cl = c + b.left;
      $all('tbody tr, tfoot tr', body).slice(0, 300).forEach(function (tr) {
        for (var i = 0; i < tr.cells.length; i++) {
          var td = tr.cells[i], q = td.getBoundingClientRect();
          if (/\bstick[01]\b/.test(td.className) || !(q.left < right - 1 && q.right > right + 1)) continue;
          if (q.left < cl - 1 || !td.textContent.trim()) return;
          rows++;
          var rg = document.createRange(); rg.selectNodeContents(td);
          var gl = Array.prototype.reduce.call(rg.getClientRects(), function (a, x) { return x.width > 0 ? Math.min(a, x.left - b.left) : a; }, Infinity);
          if (gl < gone - FADE_SEEN) { shown++; first = Math.min(first, gl); }   // one starting in the ramp's last 8 px is too faint to read
          return;
        }
      });
      gone = Math.max(gone, c + 1);
      var from = Math.max(gone - FADE_RAMP, c + 1);
      m = 'linear-gradient(to right, #000 ' + Math.round(from) + 'px, transparent ' + Math.round(gone) + 'px)';
      // a glyph in under a quarter of the rows: the first layer covers the heading only, and a second one, gone just
      // before the first such glyph, the whole table (the layers add, so the heading keeps its fade and the stray marks go)
      if (shown && rows >= 4 && shown * 4 < rows) {
        var head = body.tHead, hh = head ? Math.round(head.getBoundingClientRect().bottom - b.top) : 0;
        var end = Math.max(c + 1, first - 1), rows2 = 'linear-gradient(to right, #000 ' + Math.round(Math.max(end - FADE_RAMP, c + 1)) + 'px, transparent ' + Math.round(end) + 'px)';
        if (hh > 0) { m = m + ', ' + rows2; size = '100% ' + hh + 'px, 100% 100%'; } else m = rows2;
      }
    }
    el.classList.toggle('sx-more', !!cut);
    if (body && body._fade !== m + size) {
      body._fade = m + size;
      body.style.webkitMaskImage = body.style.maskImage = m;
      body.style.webkitMaskSize = body.style.maskSize = size;
      body.style.webkitMaskRepeat = body.style.maskRepeat = size ? 'no-repeat' : '';
      body.style.webkitMaskPosition = body.style.maskPosition = size ? '0 0, 0 0' : '';
    }
  }
  // Pages a wide table column by column: the first column that is not fully in view starts right after the pinned
  // columns (one or two: an invoice pins Sl and Description), so no column is ever skipped under them.
  function pinnedEdge(el) {
    var box = el.getBoundingClientRect(), edge = 0;
    $all('thead th.stick0, thead th.stick1', el).forEach(function (th) { edge = Math.max(edge, th.getBoundingClientRect().right - box.left); });
    return edge;
  }
  // The last page would otherwise stop short and leave a column cut by the pinned ones (a rate read as "9.50"): an
  // empty header cell at the right end gives the table just enough room to line the last page up too. Its width is
  // set from the real end once the cell exists, so the box can scroll exactly to `left` (a new cell can be born with
  // a width of its own: a sheet's letter row gave it 17 px, which used to be counted twice).
  function padTable(el, left) {
    var table = el.querySelector('table'), head = table && table.tHead, row = head && head.rows[0];
    if (!row) return;
    var pad = row.querySelector('th.sx-pad');
    if (!pad) { pad = document.createElement('th'); pad.className = 'sx-pad'; pad.setAttribute('aria-hidden', 'true'); pad.rowSpan = head.rows.length; row.appendChild(pad); }
    for (var i = 0; i < 3; i++) {
      var over = (el.scrollWidth - el.clientWidth) - left;
      if (over > -1 && over < 1) break;
      var w = Math.max(0, Math.ceil(pad.getBoundingClientRect().width - over));
      pad.style.width = pad.style.minWidth = w + 'px';
    }
  }
  // At the end (nothing runs past the right edge) the button goes back to the first columns; it never scrolls on
  // into empty room. A column wider than the room beside the pinned ones is read a page at a time, the last page
  // lining its right edge up with the box's (that never needs the pad).
  function pageTable(btn) {
    var el = btn.closest('.doc-scroll'); if (!el) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var behavior = reduce ? 'auto' : 'smooth';
    var next = tableAtEnd(el) ? null : nextColumn(el);
    if (!next) {
      el.scrollTo({ left: 0, behavior: behavior });
      var old = el.querySelector('th.sx-pad'); if (old) setTimeout(function () { if (el.scrollLeft < 4 && old.parentNode) old.parentNode.removeChild(old); }, reduce ? 0 : 600);
      return;
    }
    el.scrollTo({ left: pageLeft(el), behavior: behavior });
  }
  // where a last page starts (fdd-1 round 1, `startPage: "last"`): the leftmost column from which every column to the
  // end fits beside the pinned ones, lined up right after them, so the page ends on the last column and no column is
  // cut on either side (a last column wider than the room is its own page, as the More columns button reads it)
  function lastPageLeft(el) {
    var heads = $all('thead th', el).filter(function (th) { return th.colSpan === 1 && !/\bstick[01]\b|\bsx-pad\b/.test(th.className); })
      .sort(function (a, b) { return a.getBoundingClientRect().left - b.getBoundingClientRect().left; });
    if (!heads.length) return null;
    var box = el.getBoundingClientRect(), edge = pinnedEdge(el), room = el.clientWidth - edge;
    var end = heads[heads.length - 1].getBoundingClientRect().right, first = heads[heads.length - 1];
    for (var i = 0; i < heads.length; i++) { if (end - heads[i].getBoundingClientRect().left <= room + 4) { first = heads[i]; break; } }
    var maxLeft = el.scrollWidth - el.clientWidth;
    var left = el.scrollLeft + (first.getBoundingClientRect().left - box.left) - edge;
    if (left > maxLeft + 1) { padTable(el, left); maxLeft = el.scrollWidth - el.clientWidth; }
    return Math.max(0, Math.min(left, maxLeft));
  }
  // where the next page starts: the first column not fully in view, lined up right after the pinned ones (null at the
  // end), for the More columns button
  function pageLeft(el) {
    var next = nextColumn(el); if (!next) return null;
    var box = el.getBoundingClientRect(), edge = pinnedEdge(el), r = next.getBoundingClientRect();
    var maxLeft = el.scrollWidth - el.clientWidth;
    var left = el.scrollLeft + (r.left - box.left) - edge;
    // for-1 round 2: a column only a little wider than the room (by no more than its cells' two side paddings, 12 px) is
    // lined up with half the excess under the pinned edge and half past the right one, so its text shows whole on this
    // tap and the next tap moves on (at 360 the register's Party, 8 px over, took a second tap that moved 8 px)
    var excess = r.width - (el.clientWidth - edge);
    if (excess > 0 && excess <= 12 && left > el.scrollLeft + 1) left += Math.ceil(excess / 2);
    if (left <= el.scrollLeft + 1) left = el.scrollLeft + Math.min(Math.max(80, el.clientWidth - edge - 24), r.right - box.left - el.clientWidth);
    if (left > maxLeft + 1) { padTable(el, left); maxLeft = el.scrollWidth - el.clientWidth; }
    return Math.min(left, maxLeft);
  }
  // sa-1 round 5 (designer S2): a round seal is as big as its words. The ring was 104 px whatever it said (78 px of
  // text width), so a long word ran over it (Kudalwadi's 102 px line, "LUBRICANTS", sa-3's "COMMERCIAL"). Each seal's
  // words are laid out once in an unrotated copy off screen (so a seal in a tab not shown yet is sized too) and the
  // ring is set to clamp(104, the diagonal of the text box + 14, 148) px, which leaves the text's corners 4 px inside
  // the double border; a seal that still does not fit at 148 px steps down to 12 px type and .02em. A ring that grows
  // makes the paper's band for it (pb-l / pt-l) as much taller, so the seal never covers the text beside it.
  var SEAL_MIN = 104, SEAL_MAX = 148, SEAL_AIR = 14;
  function fitSeals(scope) {
    var spans = $all('.ann-round > span:not([data-fit])', scope || root);
    if (!spans.length || !document.body) return;
    var probe = document.createElement('div'), ps = document.createElement('span'), rg = document.createRange();
    probe.className = 'ann ann-stamp ann-round';
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;left:-10000px;top:0;visibility:hidden;transform:none;max-width:none';
    probe.appendChild(ps);
    document.body.appendChild(probe);
    var need = function () {
      rg.selectNodeContents(ps);
      var b = rg.getBoundingClientRect();
      return Math.ceil(Math.sqrt(b.width * b.width + b.height * b.height)) + SEAL_AIR;
    };
    // the smallest ring from 104 px up that holds the words, or 0 when 148 px does not
    var ring = function (small) {
      ps.style.fontSize = small ? '12px' : ''; ps.style.letterSpacing = small ? '.02em' : '';
      for (var size = SEAL_MIN, i = 0; i < 8; i++) {
        ps.style.width = ps.style.height = size + 'px';
        var n = need();
        if (n <= size) return size;
        if (size >= SEAL_MAX) return 0;
        size = Math.min(SEAL_MAX, n);
      }
      return 0;
    };
    spans.forEach(function (s) {
      ps.innerHTML = s.innerHTML;
      var small = false, size = ring(false);
      if (!size) { small = true; size = ring(true) || SEAL_MAX; }
      s.setAttribute('data-fit', String(size));
      if (size === SEAL_MIN && !small) return;
      s.style.width = s.style.height = size + 'px';
      if (small) { s.style.fontSize = '12px'; s.style.letterSpacing = '.02em'; }
      var ann = s.parentNode, paper = ann && ann.closest ? ann.closest('.doc-paper') : null, grow = size - SEAL_MIN;
      var side = ann && /\bat-bottom/.test(ann.className) ? 'Bottom' : ann && /\bat-top/.test(ann.className) ? 'Top' : '';
      if (!paper || !side || grow <= 0) return;
      var key = 'data-seal-' + side.toLowerCase(), had = parseFloat(paper.getAttribute(key) || '0') || 0;
      if (grow <= had) return;
      var pad = parseFloat(getComputedStyle(paper)['padding' + side]) || 0;
      if (!pad) return;   // a sheet or a chat keeps no band at its top: its stamp sits over the grid
      paper.style['padding' + side] = (pad + grow - had) + 'px';
      paper.setAttribute(key, String(grow));
      // a bank's or portal's band sits in the top padding (a negative margin as tall as the band): it moves up with it
      if (side === 'Top') $all('.bk-band, .pt-band', paper).forEach(function (b) { b.style.marginTop = ((parseFloat(getComputedStyle(b).marginTop) || 0) - (grow - had)) + 'px'; });
    });
    document.body.removeChild(probe);
  }
  function afterRender(isNav) {
    var r = app.route;
    markScrollables(document);
    fitSeals(document);
    if (r.name === 'sample') fitSample();
    if (r.name === 'review' && r.done && isNav) {
      var d = $('#done'); if (d) { d.scrollIntoView(); app.fromLink = false; return; }
    }
    if (!isNav) return;
    var saved = app.scrolls[app.routeKey], up = app.upNav;
    // sa-7 round 1 (designer S2): Close on the documents viewer goes Back (goUp), and lands where the viewer was opened,
    // as the phone's Back does, so a paper opened from clause (ix)(a) nine screens down closes back to that clause
    // instead of the top of the page. Other up links (All bills) keep the top
    var closing = up && app.leftViewer && saved !== undefined;
    app.upNav = false;
    if ((app.fromLink && !closing) || saved === undefined) window.scrollTo(0, 0);
    else window.scrollTo(0, saved);
    if (app.fromLink || up) {
      var h = $('.viewer [data-focus]', root) || $('[data-focus]', root) || $('h1', root);
      if (h) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
    }
    app.fromLink = false;
    // dt-2 round 4 (designer S2): on a desktop, an item that opens on a paper holding its own framed row (`docRow`)
    // brings that row into the documents pane at once, as a tab switch does (three of dt-2's six deductors opened with
    // Form 168's frame under the pane's fold at 1366 × 900). A phone opens on the item's heading and prompt, and its
    // pane holds no paper, so nothing changes there
    if (r.name === 'item' && root.querySelector('.docs-pane [role="tabpanel"] tr.row-focus')) showFocusRow(true);
  }
  function setInert(els, on) {
    els.forEach(function (el) { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); });
  }
  // Dialogs take what is behind them out of the tab order: the full-screen documents viewer (inside #app), and a
  // modal or the bin card sheet (appended to body, over everything).
  function syncInert() {
    var dialog = !!($('#modal') || $('#sheet-pop')), viewer = !!$('.viewer', root);
    setInert($all('.topbar, .skip'), dialog || viewer);
    setInert([document.getElementById('main')].filter(Boolean), dialog);
    setInert(Array.prototype.slice.call(root.children).filter(function (el) { return !el.classList.contains('viewer'); }), viewer);
  }
  function updateTopbar() {
    var el = document.getElementById('cv-count');
    if (!el || !app.cat) return;
    var n = cvDomains().length;
    el.textContent = String(n);
    el.className = 'count' + (n ? '' : ' zero');
    var link = el.parentNode;
    if (link) link.setAttribute('aria-label', 'My CV lines, ' + n + ' ' + plural(n, 'line', 'lines'));
  }
  function setTitle(t) { document.title = (t ? t + ' | ' : '') + 'Work Simulation | MSC Articleship Program'; }

  /* ------------------------------------------------------------------ common screens */
  function notFound() {
    setTitle('');
    return '<div class="page"><div class="card err"><h1 class="screen-title" data-focus>This page is not here</h1><p>It may have moved.</p><a class="btn btn-primary" href="#/">Back to Work Simulation</a></div></div>';
  }
  function errorScreen() {
    setTitle('');
    return '<div class="page"><div class="card err"><h1 class="screen-title" data-focus>This did not open</h1><p>Check your connection and try again.</p><a class="btn btn-primary" href="#/">Back to Work Simulation</a></div></div>';
  }
  function gateScreen() {
    setTitle('');
    return '<div class="page"><div class="card gate">' + doodle('briefcase') + '<h1 class="screen-title" data-focus>Part of the MSC Articleship Program</h1>' +
      '<p class="lead">Log in with the account you joined with to open Work Simulation.</p><div class="btn-row" style="justify-content:center">' +
      '<a class="btn btn-primary" href="' + esc(LOGIN_URL) + '">Log in</a><a class="btn btn-secondary" href="' + esc(JOIN_URL) + '">Join</a></div></div></div>';
  }

  /* ------------------------------------------------------------------ home */
  function domainOrder() {
    var first = {};
    E.visibleLevels(app.cat, PREVIEW).forEach(function (l) { if (first[l.domain] === undefined) first[l.domain] = l.order; });
    return (app.cat.domains || []).filter(function (d) { return first[d.id] !== undefined; }).sort(function (a, b) {
      if (a.id === app.myDomain) return -1;
      if (b.id === app.myDomain) return 1;
      return first[a.id] - first[b.id];
    });
  }
  function homeScreen() {
    setTitle('');
    var next = E.continueLevel(app.cat, app.state, PREVIEW), mode = 'continue';
    if (!next) { next = E.nextLevel(app.cat, app.state, app.myDomain, PREVIEW); mode = 'start'; }
    if (next) prefetchLevel(next.id);
    var opts = '<option value="">Not decided yet</option>' + (app.cat.domains || []).map(function (d) {
      return '<option value="' + esc(d.id) + '"' + (d.id === app.myDomain ? ' selected' : '') + '>' + esc(d.name) + '</option>';
    }).join('');
    var nextCard = '';
    if (next) {
      var dm = domain(next.domain), st = ls(next.id);
      // tried and not passed: the student's first attempt is remembered here as it is on the case file and My CV lines
      if (mode === 'start' && st && st.attempts > 0 && !E.passed(st)) mode = 'retry';
      var bits = [mode === 'retry' ? 'Not passed yet' : '', next.minutes ? next.minutes + ' min' : ''];
      if (mode === 'continue' && st && st.attempt) {
        var lvl = app.levels[next.id];
        if (lvl && lvl.tasks) bits.push('Task ' + Math.min((st.attempt.task || 0) + 1, lvl.tasks.length) + ' of ' + lvl.tasks.length);
      }
      // sa-1 round 5 (designer S5): "Start here" is for a first visit; once the student has passed any level the next one
      // is "Up next", so the screen they land on after Level 1 never reads as if that pass did not count
      var anyPassed = E.visibleLevels(app.cat, PREVIEW).some(function (l) { return E.passed(ls(l.id)); });
      nextCard = '<section class="next-card" aria-labelledby="nc-t"><div class="nc-top">' + doodle(dm ? dm.icon : 'clipboard', 'nc-ico') +
        '<div><span class="tape small">' + (mode === 'continue' ? 'Continue' : mode === 'retry' ? 'Try again' : anyPassed ? 'Up next' : 'Start here') + '</span><h2 id="nc-t">' + escTitle(display(next)) + '</h2>' +
        '<div class="meta">' + esc(bits.filter(Boolean).join(' · ')) + '</div></div></div>' +
        (mode === 'retry' ? '<button class="btn btn-primary btn-block" data-act="try-again" data-level="' + esc(next.id) + '">Try again' + SVG.next + '</button>'
          : '<a class="btn btn-primary btn-block" href="#/l/' + esc(next.id) + (mode === 'continue' && st && st.attempt ? '/t/' + ((st.attempt.task || 0) + 1) : '') + '">' +
            (mode === 'continue' ? 'Continue' : 'Start') + SVG.next + '</a>') + '</section>';
    } else if (E.visibleLevels(app.cat, PREVIEW).length) {
      nextCard = '<section class="next-card" aria-labelledby="nc-t"><div class="nc-top">' + doodle('trophy', 'nc-ico') +
        '<div><h2 id="nc-t">' + esc(COPY.allDone) + '</h2></div></div>' +
        '<a class="btn btn-primary btn-block" href="#/cv">My CV lines' + SVG.next + '</a></section>';
    }
    var cards = domainOrder().map(function (d) {
      var pr = E.domainProgress(app.cat, app.state, d.id, PREVIEW);
      var mine = d.id === app.myDomain;
      return '<a class="dcard' + (mine ? ' mine' : '') + '" href="#/d/' + esc(d.id) + '">' + (mine ? '<span class="mine-tag">My domain</span>' : '') +
        doodle(d.icon) + '<span class="d-name">' + esc(d.name) + '</span>' +
        '<span class="d-meta"><span>' + pr.done + ' of ' + pr.total + ' done</span>' +
        '<span class="bar" aria-hidden="true"><i style="width:' + (pr.total ? Math.round(pr.done / pr.total * 100) : 0) + '%"></i></span>' +
        (pr.stars ? '<span class="d-stars" role="img" aria-label="' + pr.stars + ' ' + plural(pr.stars, 'star', 'stars') + '">' + starIcon() + pr.stars + '</span>' : '') +
        (pr.closed ? '<span class="closed-mini">File closed</span>' : '') + '</span>' + '<span class="chev">' + SVG.chev + '</span></a>';
    }).join('');
    return '<div class="page wide"><section class="hero"><h1 class="vh">Work Simulation</h1>' +
      '<p class="quote">' + esc(COPY.padam) + '</p><p class="quote-by">' + esc(COPY.padamBy) + '</p></section>' +
      '<div class="mydomain"><label for="my-domain">My domain</label><select id="my-domain" class="select" data-bind="my-domain">' + opts + '</select></div>' +
      nextCard + (cards ? '<h2 class="section-title">Domains</h2><div class="domain-grid">' + cards + '</div>' : '') + '</div>';
  }

  /* ------------------------------------------------------------------ domain */
  function domainScreen(r) {
    var d = domain(r.domain);
    var list = d ? E.domainLevels(app.cat, d.id, PREVIEW) : [];
    if (!d || !list.length) return notFound();
    setTitle(d.name);
    var waiting = list.filter(function (l) { return !app.levels[l.id] && !app.failed[l.id]; });
    if (waiting.length) Promise.all(waiting.map(function (l) { return ensureLevel(l.id).catch(function () { return null; }); }))
      .then(function () { if (app.route.name === 'domain' && app.route.domain === d.id) render(false); });
    var pr = E.domainProgress(app.cat, app.state, d.id, PREVIEW);
    // the stage map
    var stages = {};
    E.STAGES.forEach(function (s) { stages[s] = []; });
    list.forEach(function (l) {
      var lv = app.levels[l.id]; if (!lv) return;
      var done = E.passed(ls(l.id));
      (lv.tasks || []).forEach(function (t) {
        var st = E.STAGES.indexOf(t.stage) >= 0 ? t.stage : 'Fieldwork';
        stages[st].push({ done: done, title: t.title, n: l.number });
      });
    });
    var map = '<div class="stage-map workpaper" role="group" aria-label="Engagement map"><div class="stage-row">' + E.STAGES.map(function (s) {
      var ts = stages[s], dn = ts.filter(function (x) { return x.done; }).length;
      // consistency pass round 1 (P04): a stage the domain has no task in reads as not part of this file, never as open work
      var cls = !ts.length ? 'none' : dn === ts.length ? 'done' : dn ? 'part' : '';
      return '<div class="stage ' + cls + '"><span class="node" aria-hidden="true"></span><span class="s-name">' + esc(s) + '</span>' +
        '<span class="s-count">' + (ts.length ? dn + ' of ' + ts.length : '–') + '</span>' +
        '<span class="dots" aria-hidden="true">' + ts.map(function (x) { return '<i class="' + (x.done ? 'on' : '') + '"></i>'; }).join('') + '</span>' +
        '<ul class="stage-tasks">' + ts.map(function (x) { return '<li class="' + (x.done ? 'on' : '') + '">' + x.n + ' · ' + escTitle(x.title) + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</div></div>';
    var rows = list.map(function (l) {
      var st = ls(l.id), chip = '';
      if (E.passed(st)) chip = '<span class="chip passed">Passed</span>';
      else if (E.inProgress(st)) chip = '<span class="chip progress">In progress</span>';
      else if (st && st.attempts) chip = '<span class="chip retry">Try again</span>';
      return '<li><a class="lrow" href="#/l/' + esc(l.id) + '"><span class="num" aria-hidden="true">' + l.number + '</span><span class="t">' + escTitle(l.title) + '</span>' +
        '<span class="m"><span>' + (l.minutes ? l.minutes + ' min' : '') + '</span>' + (st && st.best ? stars(st.best.stars) : '') + '</span>' +
        '<span class="end">' + chip + '</span></a></li>';
    }).join('');
    var lastPass = list.map(function (l) { var s = ls(l.id); return s && s.best && s.best.passed ? s.best : null; }).filter(Boolean)
      .sort(function (a, b) { return (b.at || 0) - (a.at || 0); })[0];
    return '<div class="page">' + crumb('#/', 'All domains') +
      '<div class="dom-head"><div><h1 class="screen-title" data-focus>' + escTitle(d.name) + '</h1>' +
      '<div class="meta">' + pr.done + ' of ' + pr.total + ' ' + plural(pr.total, 'level', 'levels') + ' done' + (pr.stars ? ' · ' + pr.stars + ' of ' + pr.maxStars + ' stars' : '') + '</div></div>' +
      doodle(d.icon, 'ico') + (d.blurb ? '<p class="blurb">' + escText(d.blurb) + '</p>' : '') + '</div>' +
      (pr.closed ? '<div class="closed-stamp" role="img" aria-label="File closed">File closed' + (lastPass && lastPass.month ? '<small>' + esc(lastPass.month) + '</small>' : '') + '</div>' : '') +
      map + '<h2 class="section-title">Levels</h2><ol class="level-list">' + rows + '</ol>' + secondRep(d) + '</div>';
  }
  function secondRep(d) {
    var r = d && d.secondRep;
    if (!r || !r.title) return '';
    var bits = [r.provider, r.time].filter(Boolean).join(' · ');
    return '<section class="card rep"><span class="tape small blue">Second rep</span><div class="r-title">' + esc(r.title) + '</div>' +
      (bits ? '<div class="r-meta">' + escText(bits) + '</div>' : '') + (r.why ? '<p>' + escText(r.why) + '</p>' : '') +
      (r.url && /^https:\/\//.test(r.url) ? '<a class="btn btn-secondary" href="' + esc(r.url) + '" target="_blank" rel="noopener">Open' + (r.provider ? ' on ' + esc(r.provider) : '') + SVG.next + '</a>' : '') + '</section>';
  }

  /* ------------------------------------------------------------------ level screens (shared loader) */
  function levelScreen(r) {
    var m = meta(r.level);
    if (!visible(m)) return notFound();
    var lv = app.levels[r.level];
    if (!lv) {
      if (app.failed[r.level]) return errorScreen();
      ensureLevel(r.level).then(function () { if (app.route.level === r.level) render(true); }, function () { if (app.route.level === r.level) render(true); });
      root.innerHTML = '<div class="loading">Opening the case file…</div>';
      return null;
    }
    if (r.name === 'intro') return introScreen(lv, m, r);
    if (r.name === 'review') return reviewScreen(lv, m, r);
    if (r.name === 'sample') return sampleScreen(lv, m);
    return workScreen(lv, m, r);
  }

  /* documents: lists, groups, viewer */
  function taskDocs(lv, task) {
    if (task && Array.isArray(task.docs) && task.docs.length) {
      return task.docs.map(function (id) { return E.findDoc(lv, id); }).filter(Boolean);
    }
    return packDocs(lv, task);
  }
  // the pack as the story stands: a paper with `arrives: "<task id>"` (dt-3: the intimation that comes two months
  // after the reply) is left out of the case file and of every task but its own, which lists it in its docs
  function packDocs(lv, task) {
    return (lv.documents || []).filter(function (d) { return !d.arrives || (task && d.arrives === task.id); });
  }
  function groupLabel(lv, gid, firstDoc) {
    var found = null;
    (lv.tasks || []).some(function (t) {
      return (t.items || []).some(function (it) { if ((it.docs || []).indexOf(firstDoc.id) >= 0) { found = it.label; return true; } return false; });
    });
    if (found) return found;
    var t = String(firstDoc.title || ''), i = t.lastIndexOf(' · ');
    return i > 0 ? t.slice(0, i) : gid;
  }
  function groupDocs(lv, docs) {
    var out = [], byG = {};
    docs.forEach(function (d, i) {
      if (!d.group) { out.push({ doc: d, index: i }); return; }
      if (!byG[d.group]) { byG[d.group] = { group: d.group, docs: [] }; out.push(byG[d.group]); }
      byG[d.group].docs.push({ doc: d, index: i });
    });
    out.forEach(function (g) { if (g.group) g.label = groupLabel(lv, g.group, g.docs[0].doc); });
    return out;
  }
  // xl-1 round 1: papers that share `packGroup: "<label>"` fold into one entry of the case file's pack and of the
  // viewer's list (one optgroup in the desktop pane), where the first of them stands; each keeps its `group` (its
  // item's papers). A level without packGroup lists exactly as before.
  function packFold(groups) {
    var out = [], byP = {};
    groups.forEach(function (g) {
      var list = g.group ? g.docs : [g], pg = list[0].doc.packGroup;
      if (typeof pg !== 'string' || !pg || !list.every(function (x) { return x.doc.packGroup === pg; })) { out.push(g); return; }
      if (!byP[pg]) { byP[pg] = { pack: pg, entries: [], n: 0 }; out.push(byP[pg]); }
      byP[pg].entries.push(g);
      byP[pg].n += list.length;
    });
    return out;
  }
  var TYPE_ICON ={ invoice: 'receipt', po: 'clipboard', grn: 'clipboard', table: 'ledger', letter: 'envelope', chat: 'people', bins: 'clipboard', card: 'pin' };
  function docIcon(d) {
    if (d.icon && /^[a-z-]+$/.test(d.icon)) return d.icon;
    if (d.type === 'table' && (d.style === 'portal' || d.style === 'sheet')) return 'sheet';
    if (d.type === 'letter' && (d.style === 'policy' || d.style === 'memo' || d.style === 'minutes')) return 'clipboard';
    return TYPE_ICON[d.type] || 'sheet';
  }
  // inViewer: the list inside the documents viewer, whose links replace the history entry (list → paper)
  function packList(lv, docs, base, inViewer) {
    var groups = packFold(groupDocs(lv, docs));
    function row(x, title) {
      // title: a one-paper group's name, with the paper's own kind under it ("Invoice 1 · Ashvaratha Motors" over "Tax invoice")
      // dt-3 round 2: a paper whose kind would read only "Table" shows its tab instead ("Audit report" under the two tax
      // audit report extracts); a level's own kindLabel still wins, and other kinds are unchanged
      var plainKind = D.typeLabel(x.doc) === 'Table' && x.doc.tab ? x.doc.tab : D.typeLabel(x.doc);
      var label = title || x.doc.title || D.typeLabel(x.doc), kind = title ? D.tabLabel(x.doc) || D.typeLabel(x.doc) : plainKind;
      var same = title ? kind.toLowerCase() === label.toLowerCase() : label.toLowerCase().indexOf(kind.toLowerCase()) === 0;
      return '<li><a href="' + base + (x.index + 1) + '"' + (inViewer ? ' data-replace' : '') + '>' + doodle(docIcon(x.doc), 'p-ico') + '<span>' + escText(label) + (same ? '' : '<span class="p-sub">' + escText(kind) + '</span>') + '</span></a></li>';
    }
    var flat = docs.length <= 8;
    return groups.map(function (g) {
      if (g.pack) {
        // the folded papers: a one-paper group is a row under its item's name, as below; a larger group lists its papers
        var inner = g.entries.map(function (e) {
          if (!e.group) return row(e);
          return e.docs.length === 1 ? row(e.docs[0], e.label) : e.docs.map(function (x) { return row(x); }).join('');
        }).join('');
        return '<details class="pack-group"><summary><span class="pg-name">' + escTitle(g.pack) + '</span><span class="count">' + g.n + ' ' + plural(g.n, 'document', 'documents') + '</span></summary><ul class="pack">' + inner + '</ul></details>';
      }
      if (!g.group) return '<ul class="pack">' + row(g) + '</ul>';
      if (flat) return '<ul class="pack">' + g.docs.map(function (x) { return row(x); }).join('') + '</ul>';
      // a group of one paper is a plain row under the group's name (gst-1: twelve one-invoice folders took two taps
      // each and read as broken disclosures)
      if (g.docs.length === 1) return '<ul class="pack">' + row(g.docs[0], g.label) + '</ul>';
      // the group's name holds its codes and hyphenated words together ("Forged gear blank GB-" / "110" on a phone), in
      // one element: the summary is a flex row, and loose text beside a held word made three columns (dt-1 round 1:
      // "Item 7 · / VMC-10 / in the block")
      return '<details class="pack-group"><summary><span class="pg-name">' + escTitle(g.label) + '</span><span class="count">' + g.docs.length + ' ' + plural(g.docs.length, 'document', 'documents') + '</span></summary><ul class="pack">' + g.docs.map(function (x) { return row(x); }).join('') + '</ul></details>';
    }).join('');
  }
  function docOptions(lv, docs, current) {
    return packFold(groupDocs(lv, docs)).map(function (g) {
      function opt(x) { return '<option value="' + x.index + '"' + (x.index === current ? ' selected' : '') + '>' + esc(x.doc.title || D.typeLabel(x.doc)) + '</option>'; }
      if (g.pack) return '<optgroup label="' + esc(g.pack) + '">' + g.entries.map(function (e) { return e.group ? e.docs.map(opt).join('') : opt(e); }).join('') + '</optgroup>';
      return g.group ?'<optgroup label="' + esc(g.label) + '">' + g.docs.map(opt).join('') + '</optgroup>' : opt(g);
    }).join('');
  }
  function viewer(lv, docs, idx, base, closeHref) {
    var title, body, foot = '';
    if (idx === null || idx === undefined || isNaN(idx) || !docs[idx - 1]) {
      title = '<div class="v-title">Documents <small>' + docs.length + ' in the pack</small></div>';
      body = packList(lv, docs, base, true);
    } else {
      var d = docs[idx - 1];
      // xl-1 round 2: a task with one paper (xl-1 t4's pivot) opens on it from the Documents button (taskHead), so its
      // viewer has no "1 of 1", no "All documents" leading to a one-row list and no dead arrows: the close returns
      title = '<div class="v-title" data-focus tabindex="-1">' + escText(d.title || D.typeLabel(d)) + (docs.length > 1 ? '<small>' + idx + ' of ' + docs.length + '</small>' : '') + '</div>';
      var vlink = function (j, cls) { return { open: '<a class="' + (cls || 'xl-link') + '" href="' + base + (j + 1) + '" data-replace>', close: '</a>' }; };
      body = D.renderDocument(d, docCtx(lv, sheetLinker(docs, vlink), docLinker(docs, vlink)));
      if (docs.length > 1) foot ='<div class="viewer-foot"><a class="btn btn-secondary" href="' + base + '" data-replace>All documents</a>' +
        '<a class="icon-btn" href="' + (idx > 1 ? base + (idx - 1) : '#') + '" data-replace aria-label="Previous document"' + (idx > 1 ? '' : ' aria-disabled="true" tabindex="-1" style="opacity:.4;pointer-events:none"') + '>' + SVG.prev + '</a>' +
        '<a class="icon-btn" href="' + (idx < docs.length ? base + (idx + 1) : '#') + '" data-replace aria-label="Next document"' + (idx < docs.length ? '' : ' aria-disabled="true" tabindex="-1" style="opacity:.4;pointer-events:none"') + '>' + SVG.chev + '</a></div>';
    }
    return '<div class="viewer" role="dialog" aria-modal="true" aria-label="Documents" data-viewer-base="' + esc(base) + '" data-count="' + docs.length + '" data-idx="' + (idx || 0) + '">' +
      '<div class="viewer-head">' + title + '<a class="icon-btn" href="' + closeHref + '" aria-label="Close documents" data-close data-up>' + SVG.close + '</a></div>' +
      '<div class="viewer-body">' + body + '</div>' + foot + '</div>';
  }

  /* ------------------------------------------------------------------ level intro */
  function introScreen(lv, m, r) {
    var d = domain(m.domain), st = ls(lv.id);
    setTitle(display(m));
    var docs = packDocs(lv, null);
    var base = '#/l/' + esc(lv.id) + '/docs/';
    var c = lv.case || {};
    var rows = [['Your role', c.role], ['Client', c.client], ['Team', c.team], ['Goal', c.goal], ['Period', c.period], ['Where', c.where]]
      .filter(function (x) { return x[1]; }).map(function (x) { return '<div class="cf-row"><dt>' + esc(x[0]) + '</dt><dd>' + escText(x[1]) + '</dd></div>'; }).join('');
    var brief = '';
    if (lv.brief) {
      var p = person(lv.brief.from, lv);
      brief = '<section class="wa" aria-label="Message from ' + esc(p.name) + '"><div class="wa-head">' + avatar(p) + '<div class="who"><b>' + esc(p.name) + '</b><span>' + esc(p.roleShort || p.role) + '</span></div></div>' +
        '<div class="wa-body">' + (lv.brief.messages || []).map(function (msg, i, a) {
          return '<div class="bub">' + escText(msg) + (i === a.length - 1 && lv.brief.time ? '<span class="time">' + esc(lv.brief.time) + '</span>' : '') + '</div>';
        }).join('') + '</div></section>';
    }
    var nTasks = (lv.tasks || []).length;
    var action, barCls = 'actionbar', quiet = '', review = '<a class="btn btn-secondary" href="#/l/' + esc(lv.id) + '/review">Your review</a>';
    if (st && st.attempt && st.attempt.submittedAt) {
      if (st.best && st.best.passed && st.best.stars >= 3) {
        // nothing left to earn here: the main button goes on, and a fresh attempt stays one quiet tap away, at the foot
        // of the page (in the bar it made the phone's sticky bar two rows tall)
        var nx = E.nextLevel(app.cat, app.state, app.myDomain, PREVIEW);
        if (nx && nx.id === lv.id) nx = null;
        action = review + (nx ? '<a class="btn btn-primary grow" href="#/l/' + esc(nx.id) + '">Next level' + SVG.next + '</a>'
          : '<a class="btn btn-primary grow" href="#/cv">My CV lines' + SVG.next + '</a>');
        quiet = '<p class="quiet-retry">Want to do it once more? <button class="link-btn" data-act="try-again">Try again</button></p>';
      } else action = review + '<button class="btn btn-primary grow" data-act="try-again">Try again</button>';
    } else if (st && st.attempt) {
      action = '<button class="btn btn-primary grow" data-act="start">Continue' + SVG.next + '</button>';
    } else {
      action = (st && st.best ? review : '') + '<button class="btn btn-primary grow" data-act="start">Start' + SVG.next + '</button>';
    }
    var html = '<div class="page">' + crumb('#/d/' + esc(m.domain), d ? d.name : 'Back') +
      '<div><span class="tape">' + esc((d ? d.short || d.name : '') + ' ' + m.number) + '</span></div>' +
      '<h1 class="screen-title" data-focus>' + escTitle(lv.title || m.title) + '</h1>' +
      '<div class="intro-meta"><span>' + esc((lv.minutes || m.minutes) + ' min') + '</span><span>' + nTasks + ' ' + plural(nTasks, 'task', 'tasks') + '</span>' +
      (st && st.best ? stars(st.best.stars) + (st.best.passed ? '<span class="chip passed">Passed</span>' : '') : '') + '</div>' +
      '<div class="learn-do"><section class="card"><h2>What you’ll learn</h2><ul class="pen-list">' + (lv.learn || []).map(function (x) { return '<li>' + escText(x) + '</li>'; }).join('') + '</ul></section>' +
      '<section class="card"><h2>What you’ll do</h2><ul class="pen-list">' + (lv['do'] || []).map(function (x) { return '<li>' + escText(x) + '</li>'; }).join('') + '</ul></section></div>' +
      // xl-1 round 1: a level's own download sits under the senior's brief, above the pack, so a laptop student meets the
      // file before Start (after 17 papers it sat under the desktop's floating Start button); only xl-1 has one
      '<section class="casefile workpaper" aria-label="Case file"><span class="cf-tab">Case file</span><dl>' + rows + '</dl></section>' + brief + downloads(lv, lv.downloads) +
      '<h2 class="section-title">Documents <small>' + docs.length + ' in the pack</small></h2>' + packList(lv, docs, base) + quiet +
      '<div class="' + barCls + '">' + action + '</div></div>';
    if (r.viewer) html += viewer(lv, docs, r.doc, base, '#/l/' + esc(lv.id));
    return html;
  }
  function downloads(lv, list) {
    if (!Array.isArray(list) || !list.length) return '';
    return '<div class="downloads">' + list.map(function (f) {
      var href = 'files/' + encodeURIComponent(lv.id) + '/' + String(f.file || '').split('/').map(encodeURIComponent).join('/');
      return '<a class="btn btn-secondary" href="' + href + '" download>' + SVG.docs + esc(f.label || f.file) + '</a>' + (f.note ? '<p class="meta">' + esc(f.note) + '</p>' : '');
    }).join('') + '</div>';
  }

  /* ------------------------------------------------------------------ work screen */
  function attemptOf(lv) { var st = ls(lv.id); return st && st.attempt && !st.attempt.submittedAt ? st.attempt : null; }
  function answersOf(lv) { var a = attemptOf(lv); return a ? a.answers || {} : {}; }
  function workScreen(lv, m, r) {
    var tasks = lv.tasks || [];
    var st = ls(lv.id);
    if (!attemptOf(lv)) {
      // consistency pass round 1 (P01): after Submit every task, item and paper entry of the attempt is stale. Reached by
      // Back (or Forward) from inside the level, it is passed over (history.back() again), so one Back from the review
      // lands on the case file, or the screen the level was opened from, never on the same review five times over. A
      // typed, reloaded or linked task address still opens the review in its place; the page's first entry (the boot
      // mark) is never walked past, so Back never leaves the tool on its own.
      if (st && st.attempt && st.attempt.submittedAt) {
        var bootEntry = history.state && history.state.wsBoot;
        if (app.histNav && !bootEntry && app.prevKey && app.prevKey.indexOf('#/l/' + lv.id + '/') === 0) {
          walkBack('#/l/' + lv.id + '/review'); return null;
        }
        setTimeout(function () { go('#/l/' + lv.id + '/review', true); }, 0); return null;
      }
      setTimeout(function () { go('#/l/' + lv.id, true); }, 0); return null;
    }
    var ti = r.task - 1;
    if (!(ti >= 0 && ti < tasks.length)) return notFound();
    // a task that must be handed in first (lockOnLeave) keeps the later tasks closed until it is
    var first = E.handInBefore(lv, attemptOf(lv), ti);
    if (first >= 0) { setTimeout(function () { go('#/l/' + lv.id + '/t/' + (first + 1), true); }, 0); return null; }
    var task = tasks[ti];
    if ((attemptOf(lv).task || 0) !== ti) commit(E.setCurrentTask(app.state, lv.id, ti));
    if (r.name === 'item') return itemScreen(lv, m, r, task, ti);
    setTitle(task.title + ' · ' + display(m));
    var docs = taskDocs(lv, task);
    var base = '#/l/' + esc(lv.id) + '/t/' + r.task + '/docs/';
    var desktop = DESKTOP.matches;
    var paneIdx = desktop && r.viewer && r.doc ? r.doc - 1 : (app.ui.pane[lv.id + ':' + task.id] || 0);
    if (desktop && r.viewer && r.doc) app.ui.pane[lv.id + ':' + task.id] = paneIdx;
    var psig = 'task|' + lv.id + '|' + task.id + '|' + paneIdx;
    var paneLink = function (j, cls) { return { open: '<button type="button" class="' + (cls || 'xl-link') + '" data-act="pane-go" data-key="' + esc(lv.id + ':' + task.id) + '" data-idx="' + j + '">', close: '</button>' }; };
    var pane = docs.length && desktop ? paneShell(psig) || '<aside class="docs-pane" aria-label="Documents" data-sig="' + esc(psig) + '"><p class="dp-title">Documents</p><div class="dp-head">' +
      '<label class="vh" for="doc-select">Document</label><select id="doc-select" class="select" data-bind="pane-doc" data-key="' + esc(lv.id + ':' + task.id) + '">' + docOptions(lv, docs, paneIdx) + '</select>' +
      '<button class="icon-btn" data-act="pane-step" data-step="-1" data-key="' + esc(lv.id + ':' + task.id) + '" aria-label="Previous document"' + (paneIdx > 0 ? '' : ' disabled') + '>' + SVG.prev + '</button>' +
      '<button class="icon-btn" data-act="pane-step" data-step="1" data-key="' + esc(lv.id + ':' + task.id) + '" aria-label="Next document"' + (paneIdx < docs.length - 1 ? '' : ' disabled') + '>' + SVG.chev + '</button></div>' +
      (docs[paneIdx] ? D.renderDocument(docs[paneIdx], docCtx(lv, sheetLinker(docs, paneLink), docLinker(docs, paneLink))) : '') + '</aside>' : '';
    var html = '<div class="work' + (pane || !desktop ? ' two' : '') + '">' + pane + '<div class="task-pane">' + crumb('#/l/' + esc(lv.id), 'Case file') +
      taskHead(lv, task, ti, tasks.length, docs.length ? base : null, docs.length) +
      '<div class="task-body" id="task-body">' + taskBody(lv, task) + '</div>' + taskNav(lv, ti, tasks.length) + '</div></div>';
    if (r.viewer && !desktop) html += viewer(lv, docs, r.doc, base, '#/l/' + esc(lv.id) + '/t/' + r.task);
    return html;
  }
  function taskHead(lv, task, ti, n, docsBase, nDocs) {
    return '<header class="task-head"><div class="t-top"><span class="t-of">Task ' + (ti + 1) + ' of ' + n + '</span><span class="tape small">' + esc(task.stage || 'Fieldwork') + '</span></div>' +
      '<h1 data-focus>' + escTitle(task.title) + '</h1><p class="prompt">' + escText(task.prompt) + '</p>' + lockedNote(lv, task) +
      '<div class="task-tools">' + (docsBase ? '<a class="btn btn-secondary docs-btn" href="' + docsBase + (nDocs === 1 ? '1' : '') + '">' + SVG.docs + 'Documents <span class="n">' + nDocs + '</span></a>' : '') +
      (isLockedTask(lv, task) || (task.type === 'items' && hintsShown(lv, task)) ? '' : hintButton(lv, task)) + '</div>' + hintBox(lv, task) + downloads(lv, task.downloads) + '</header>';
  }
  // lockOnLeave: true, or { ask, note, yes, done } (the hand-in question, its second line, the button, the note after)
  function lockSpec(task) { return task && task.lockOnLeave ? (typeof task.lockOnLeave === 'object' ? task.lockOnLeave : {}) : null; }
  function isLockedTask(lv, task) { return E.isLocked(attemptOf(lv), task.id); }
  function lockedNote(lv, task) {
    if (!isLockedTask(lv, task)) return '';
    return '<p class="locked-note">' + esc((lockSpec(task) || {}).done || COPY.handedIn) + '</p>';
  }
  function lockWrap(lv, task, html) {
    return html && isLockedTask(lv, task) ? '<fieldset class="locked-set" disabled>' + html + '</fieldset>' : html;
  }
  function hintsShown(lv, task) { var a = attemptOf(lv); return a && a.hints ? a.hints[task.id] || 0 : 0; }
  // sa-1 round 5 (designer optional 3): on an item's screen the button says the hint is the task's, not the item's
  // (Bill 5's button gave the task's cut-off hint, and the GST-rate hint was a second star)
  function hintButton(lv, task, onItem) {
    var total = (task.hints || []).length, shown = hintsShown(lv, task);
    if (!total || shown >= total) return '';
    return '<button class="btn btn-quiet" data-act="hint-ask" data-task="' + esc(task.id) + '" aria-expanded="' + (app.ui.hint === task.id) + '">' +
      (shown ? 'Another hint' : 'Hint') + (onItem ? ' for this task' : '') + ' (costs a star)</button>';
  }
  function hintBox(lv, task) {
    var shown = hintsShown(lv, task), out = '';
    var confirm = app.ui.hint === task.id ? '<div class="hint-confirm" role="group" aria-label="Use a hint"><p>' + esc(COPY.hintCost) + '</p><span class="hc-btns"><button class="btn btn-primary btn-sm" data-act="hint-yes" data-task="' + esc(task.id) + '">Show hint</button><button class="btn btn-secondary btn-sm" data-act="hint-no">Not now</button></span></div>' : '';
    // an items list is the screen a student returns to after every bill: a paid hint folds under "Your hint" there, as
    // on the item screens, open only right after paying, so the first bill stays above the fold
    // dt-1 round 6 (designer optional 1): and in the item screens' order, what was paid for first, then the offer of
    // another ("Your hint", then "Another hint (costs a star)" or its question), so the two screens of one task agree
    if (shown && task.type === 'items') {
      out += '<details class="hint-inline"' + (app.ui.hintOpen === task.id ? ' open' : '') + '><summary>' + (shown > 1 ? 'Your hints' : 'Your hint') + '</summary><div class="hi-body">' +
        (task.hints || []).slice(0, shown).map(function (h) { return '<p>' + escText(h) + '</p>'; }).join('') + '</div></details>' +
        (isLockedTask(lv, task) ? '' : confirm || hintButton(lv, task));
    } else out += confirm;
    for (var i = 0; i < shown && task.type !== 'items'; i++) {
      var h = (task.hints || [])[i] || '';
      out += h.length <= 60 ? '<div class="sticky blue hand"><span class="s-label">Hint</span>' + escText(h) + '</div>'
        : '<div class="sticky blue"><span class="s-label">Hint</span>' + escText(h) + '</div>';
    }
    return out ? '<div class="hint-box" id="hint-box">' + out + '</div>' : '<div class="hint-box" id="hint-box" hidden></div>';
  }
  // An items task with items still to check: the main button opens the first unchecked one ("Check Bill 4"), and the
  // way on to the next task is the secondary button until every item is checked (an empty bill list never invites a
  // skip). Elsewhere the way on is the main button.
  function firstUnchecked(lv, task) {
    if (task.type !== 'items' || isLockedTask(lv, task)) return -1;
    var a = answersOf(lv)[task.id] || {}, items = task.items || [];
    for (var i = 0; i < items.length; i++) if (!E.itemAnswered(task, items[i], a[items[i].id])) return i;
    return -1;
  }
  // sa-6 round 4 (designer optional 2): Keep working on the submit or hand-in box of an items task opens its first item
  // still to check (a data-href the modal-close action follows), as the list's main button does; nothing while the
  // student is already on that item's screen
  function itemGoAttr(lv, task) {
    var k = firstUnchecked(lv, task), ti = lv.tasks.indexOf(task);
    if (k < 0 || ti < 0) return '';
    var r = app.route || {};
    if (r.name === 'item' && r.task === ti + 1 && r.item === k + 1) return '';
    return ' data-href="#/l/' + esc(lv.id) + '/t/' + (ti + 1) + '/i/' + (k + 1) + '"';
  }
  function taskNav(lv, ti, n) {
    var task = lv.tasks[ti];
    var todo = firstUnchecked(lv, task), noun = E.nounFor(task);
    var check = '';
    if (todo >= 0) {
      // an item's `short` names it on the button ("Check Pooja", sa-4: "Check E1090" took two lines on a phone)
      var it0 = task.items[todo];
      var lab = (typeof it0.short === 'string' && it0.short) || String(it0.label || '').split(' · ')[0] || capWord(noun[0]) + ' ' + (todo + 1);
      // a number holds to the word before it, so a tight bar wraps "Check / Line 1", never "Check Line / 1" (sa-5); a
      // name of words alone ("Leave encashment") may still wrap between them, so it never runs past the button
      check = '<a class="btn btn-primary grow" href="#/l/' + esc(lv.id) + '/t/' + (ti + 1) + '/i/' + (todo + 1) + '">Check ' + esc(lab).replace(/ (?=\d)/g, '&nbsp;') + SVG.next + '</a>';
    }
    var cls = check ? 'btn btn-secondary' : 'btn btn-primary grow';
    // with three buttons on a phone the way back is the arrow alone (its name stays for screen readers)
    var prev = ti > 0 ? (check ? '<a class="btn btn-secondary btn-icon" href="#/l/' + esc(lv.id) + '/t/' + ti + '" aria-label="Task ' + ti + '">' + SVG.prev + '</a>'
      : '<a class="btn btn-secondary" href="#/l/' + esc(lv.id) + '/t/' + ti + '">' + SVG.prev + 'Task ' + ti + '</a>') : '';
    var handIn = ti < n - 1 && lockSpec(task) && !isLockedTask(lv, task);
    var next = ti < n - 1 ? (handIn ? '<button class="' + cls + '" data-act="hand-in" data-index="' + ti + '">Next: task ' + (ti + 2) + (check ? '' : SVG.next) + '</button>'
      : '<a class="' + cls + '" href="#/l/' + esc(lv.id) + '/t/' + (ti + 2) + '">Next: task ' + (ti + 2) + (check ? '' : SVG.next) + '</a>')
      // dt-3 round 2: beside a "Check …" button a phone shows "Submit" alone (" for review" stays in its name for screen
      // readers, ws.css .ab-more): the unwrapping 178 px "Submit for review" left "Check Computation" 40 px off a 390 px
      // screen on dt-3's last task; wider screens and the two-button bar keep the whole label
      : '<button class="' + (check ? 'btn btn-secondary' : 'btn btn-primary grow') + '" data-act="submit">' + (check ? 'Submit<span class="ab-more"> for review</span>' : 'Submit for review') + '</button>';
    return '<div class="actionbar">' + prev + next + check + '</div>';
  }
  function taskBody(lv, task) {
    var a = answersOf(lv)[task.id];
    switch (task.type) {
      case 'items': return itemsList(lv, task, a);
      case 'worksheet': return lockWrap(lv, task, worksheet(lv, task, a));
      case 'choice': return lockWrap(lv, task, choiceTask(lv, task, a));
      case 'order': return lockWrap(lv, task, orderTask(lv, task, a));
      case 'compose': return lockWrap(lv, task, composeTask(lv, task, a));
      case 'hunt': return lockWrap(lv, task, huntTask(lv, task, a));
      default: return '';
    }
  }

  /* items: workpaper list */
  function gateField(task) { return (task.fields || []).filter(function (f) { return f.gate; })[0] || null; }
  function optLabel(field, id, short) {
    var o = (field.options || []).filter(function (x) { return x.id === id; })[0];
    return o ? (short && o.short ? o.short : o.label) : String(id);
  }
  function itemSummary(task, item) {
    return (task.columns || []).filter(function (c) { return c.key !== 'label'; }).map(function (c) {
      var v = item[c.key];
      if (v === undefined || v === null || v === '') return '';
      return typeof v === 'number' ? E.formatValue(v, c.format) : String(v);
    }).filter(Boolean).join('\u00a0· ');
  }
  function itemsList(lv, task, a) {
    a = a || {};
    var items = task.items || [], gate = gateField(task), noun = E.nounFor(task);
    var key = lv.id + ':' + task.id, f = app.ui.filter[key] || 'all';
    var done = items.filter(function (it) { return E.itemAnswered(task, it, a[it.id]); }).length;
    var plan = floorDoc(lv, task), view = plan ? app.ui.view[key] || 'floor' : 'list';
    var progress = '<div class="progress-line"><span class="bar" aria-hidden="true"><i style="width:' + Math.round(done / Math.max(1, items.length) * 100) + '%"></i></span>' +
      done + ' of ' + items.length + ' ' + noun[1] + ' checked</div>';
    var switcher = plan ? '<div class="viewswitch" role="group" aria-label="Show the ' + esc(noun[1]) + ' as">' + [['floor', 'Floor'], ['list', 'List']].map(function (x) {
      return '<button class="vs-btn" data-act="view" data-key="' + esc(key) + '" data-val="' + x[0] + '" aria-pressed="' + (view === x[0]) + '">' + x[1] + '</button>';
    }).join('') + '</div>' : '';
    if (view === 'floor') return '<div class="ilist-head">' + progress + switcher + '</div>' + floorHtml(lv, task, a, plan);
    var filters = [['all', 'All ' + items.length], ['todo', 'To check']];
    // filter chips and row chips use an option's short label when it has one (gst-1: four long calls made three rows
    // of filters and squeezed every invoice row to four or five lines)
    // dt-3 round 2: a list of four items or fewer shows no call filters (dt-3's three adjustments: "All 3 · To check ·
    // Agree · In part · Disagree" took two rows above three rows); "All" and "To check" stay
    var callChips = gate && items.length > 4;
    if (!callChips && f.indexOf('g:') === 0) f = 'all';
    if (callChips) (gate.options || []).forEach(function (o) { filters.push(['g:' + o.id, o.short || o.label]); });
    var rows = items.map(function (it, i) {
      var ia = a[it.id] || {}, ans = E.itemAnswered(task, it, ia);
      if (f === 'todo' && ans) return '';
      if (f.indexOf('g:') === 0 && ia[gate.id] !== f.slice(2)) return '';
      var chip = '';
      // a number field with `chip: true` adds the figure typed under the call on the list ("Add back" / "₹13.50"), so
      // the student can run down every amount before the hand-in without opening each item (dt-4); stacked, so the chip
      // is no wider than the call and the item's name keeps its width
      var chipN = (task.fields || []).filter(function (fl) { return fl.kind === 'number' && fl.chip === true; })[0];
      var chipFig = chipN && E.fieldVisible(chipN, ia) && E.parseNumber(ia[chipN.id]) !== null ? (chipN.prefix || '') + E.tidyNumberText(ia[chipN.id]) : '';
      // mat-1 round 1 (designer optional 1): on a task with no main call, a choice field with `chip: true` puts its pick
      // on the list instead of "Done" (mat-1's routes: "Dividend", "Capital gains", "Dividend first"), so the list reads
      // as the table it is; without it, "Done" as before
      var chipC = !gate && (task.fields || []).filter(function (fl) { return fl.kind === 'choice' && fl.chip === true; })[0];
      // mat-1 round 3 (designer S3): such a pick ("Dividend up to profits") is wider than a call, so on a phone the row
      // is marked `has-pick` and the chip goes under the item's name (ws.css), which keeps the row's width
      var pick = false;
      if (gate && ia[gate.id]) chip = chipFig ? '<span class="chip ink has-fig"><span>' + esc(optLabel(gate, ia[gate.id], true)) + '</span><span class="cfig">' + esc(chipFig) + '</span></span>'
        : '<span class="chip ink">' + esc(optLabel(gate, ia[gate.id], true)) + '</span>';
      else if (chipC && ia[chipC.id] && E.fieldVisible(chipC, ia)) { chip = '<span class="chip ink">' + esc(optLabel(chipC, ia[chipC.id], true)) + '</span>'; pick = true; }
      else if (ans) chip = '<span class="chip ink">Done</span>';
      var sub = itemSummary(task, it);
      return '<li><a class="irow' + (pick ? ' has-pick' : '') + '" href="#/l/' + esc(lv.id) + '/t/' + (lv.tasks.indexOf(task) + 1) + '/i/' + (i + 1) + '">' +
        '<img class="mark" src="img/doodles/' + (ans ? 'box-tick' : 'box') + '.svg" alt="' + (ans ? 'Checked' : 'Not checked') + '">' +
        '<span><span class="lbl">' + escLabel(it.label) + '</span>' + (sub ? '<span class="sub">' + escText(sub) + '</span>' : '') + '</span>' + (chip || '<span></span>') +
        '<span class="chev">' + SVG.chev + '</span></a></li>';
    }).join('');
    return '<div class="ilist-head">' + progress + switcher +
      '<div class="filters" role="group" aria-label="Show">' + filters.map(function (x) {
        return '<button class="filter" data-act="filter" data-key="' + esc(key) + '" data-val="' + esc(x[0]) + '" aria-pressed="' + (f === x[0]) + '">' + esc(x[1]) + '</button>';
      }).join('') + '</div></div>' +
      '<div class="workpaper"><ul class="ilist">' + (rows || '<li class="meta" style="padding:14px">Nothing here.</li>') + '</ul></div>';
  }
  // An items task may carry "map": "<bins document id>" (sa-2's stores plan). Its list screen then opens on the floor:
  // the plan drawn small, each item on its own bin (the item's `bin`, else its id), the student's call written on it
  // once made, and the bins not on the list greyed and inert, so the count is a walk across the floor. List is one
  // tap away (and is what a level without a map shows).
  function floorDoc(lv, task) {
    var d = task && task.map ? E.findDoc(lv, task.map) : null;
    return d && d.type === 'bins' ? d : null;
  }
  function floorHtml(lv, task, a, plan) {
    var items = task.items || [], gate = gateField(task), g = plan.grid || { rows: 1, cols: 1 }, at = {}, byBin = {}, cells = '';
    var ti = lv.tasks.indexOf(task) + 1;
    items.forEach(function (it, i) { byBin[it.bin || it.id] = i; });
    (plan.bins || []).forEach(function (b) { var p = D.posOf(b.pos); if (p) at[p.r + ':' + p.c] = b; });
    for (var r = 0; r < g.rows; r++) {
      for (var c = 0; c < g.cols; c++) {
        var b = at[r + ':' + c];
        if (!b) { cells += '<div class="fl-empty" aria-hidden="true"></div>'; continue; }
        var name = '<span class="fl-pos">' + esc(b.pos) + '</span><span class="fl-name">' + escTitle(b.short || b.item) + '</span>';
        var k = byBin[b.id];
        if (k === undefined) { cells += '<div class="fl-bin off">' + name + '<span class="vh">, not on the list</span></div>'; continue; }
        var it = items[k], ia = a[it.id] || {}, done = E.itemAnswered(task, it, ia);
        var call = gate && ia[gate.id] ? optLabel(gate, ia[gate.id], true) : '';
        var state = done ? (call || 'checked') : call ? call + ', not finished' : 'not checked yet';
        cells += '<a class="fl-bin on' + (done ? ' fl-done' : '') + '" href="#/l/' + esc(lv.id) + '/t/' + ti + '/i/' + (k + 1) + '" aria-label="' + esc(b.pos + ', ' + (b.short || b.item) + ': ' + state) + '">' +
          // a checked bin carries the List view's checked box (sa-2 r1b: a bare green tick read as "right" on a wrong call)
          name + (done ? '<img class="fl-tick" src="img/doodles/box-tick.svg" alt="">' : '') + (call ? '<span class="fl-call">' + esc(call) + '</span>' : '') + '</a>';
      }
    }
    return '<div class="floor"><div class="fl-head"><b>' + esc(plan.room || plan.title || '') + '</b></div>' +
      '<div class="fl-grid" style="grid-template-columns: repeat(' + g.cols + ', minmax(0, 1fr))">' + cells + '</div>' +
      (plan.door ? '<div class="fl-door">' + esc(plan.door) + '</div>' : '') +
      '<p class="fl-hint">' + esc(task.mapHint || 'Tap a ' + E.nounFor(task)[0] + ' on your list to open it. The grey ones are not on it.') + '</p></div>';
  }

  // sa-6 round 1: an item may name its own row in a shared paper (`docRow: { "<doc id>": "<row _id>" }`); on the item's
  // screen that row is framed (Golconda's row among the tracker's ten yellow open rows, under Other papers). A copy:
  // the level's document is never changed. dt-2 round 3 (designer S2): the value may be a list of row ids, all framed (a
  // deductor's two quarter rows in Form 168); showFocusRow brings the first into view. A single id keeps its meaning.
  function itemDoc(d, it) {
    var rid = it && it.docRow && d ? it.docRow[d.id] : undefined;
    if (rid === undefined || !Array.isArray(d.rows)) return d;
    var ids = [].concat(rid);
    var c = {}; Object.keys(d).forEach(function (key) { c[key] = d[key]; });
    c.rows = d.rows.map(function (row) {
      if (ids.indexOf(row._id) < 0) return row;
      var x = {}; Object.keys(row).forEach(function (key) { x[key] = row[key]; }); x._focus = true; return x;
    });
    return c;
  }
  // sa-3 round 4 (designer S1): the item screen's documents pane carries its signature (data-sig, which paneShell keeps)
  // only in the desktop layout. On a phone the pane holds only the item's name, as the papers sit under the heading; a
  // window that then widens past 1024 px (a tablet turned to landscape, a half-screen laptop window maximised) kept that
  // title-only pane, with no tabs and no paper, until the student moved to another item. Inside the desktop layout the
  // kept pane, its scroll and its focus are as before.
  function itemPaneHtml(desk, sig, label, inner) {
    return '<aside class="docs-pane" aria-label="Documents"' + (desk ? ' data-sig="' + esc(sig) + '"' : '') + '><p class="dp-title">' + escLabel(label) + '</p>' + (desk ? inner : '') + '</aside>';
  }
  /* items: one item with its own documents and the fields */
  function itemScreen(lv, m, r, task, ti) {
    if (task.type !== 'items') return notFound();
    var items = task.items || [], k = r.item - 1, it = items[k];
    if (!it) return notFound();
    setTitle(it.label + ' · ' + display(m));
    var noun = E.nounFor(task);
    var docs = (it.docs || []).map(function (id) { return E.findDoc(lv, id); }).filter(Boolean);
    var others = otherPapers(lv, task, it, docs);
    var nTabs = docs.length + (others.length ? 1 : 0);
    var tkey = lv.id + ':' + it.id, tab = Math.min(app.ui.tab[tkey] || 0, Math.max(0, nTabs - 1));
    var onOthers = others.length && tab === docs.length;
    var tabNames = docs.map(function (d) { return D.tabLabel(d); });
    if (others.length) tabNames.push('Other papers');
    var tabs = nTabs > 1 ? '<div class="tabs" role="tablist" aria-label="Documents for this ' + esc(noun[0]) + '">' + tabNames.map(function (name, i) {
      return '<button class="tab' + (i === docs.length ? ' tab-other' : '') + '" role="tab" id="tab-' + i + '" aria-selected="' + (i === tab) + '" aria-controls="tabpanel" data-act="tab" data-key="' + esc(tkey) + '" data-val="' + i + '"' + (i === tab ? '' : ' tabindex="-1"') + '>' + esc(name) +
        (i === docs.length ? ' <span class="n">' + others.length + '</span>' : '') + '</button>';
    }).join('') + '</div>' : '';
    var panel = '';
    if (onOthers) {
      var okey = lv.id + ':' + task.id + ':other', oi = Math.min(app.ui.other[okey] || 0, others.length - 1);
      panel = '<div class="other-head"><label class="vh" for="other-doc">Paper</label><select id="other-doc" class="select" data-bind="other-doc" data-key="' + esc(okey) + '">' +
        others.map(function (d, i) { return '<option value="' + i + '"' + (i === oi ? ' selected' : '') + '>' + esc(d.title || D.typeLabel(d)) + '</option>'; }).join('') + '</select></div>' +
        D.renderDocument(itemDoc(others[oi], it), docCtx(lv));
    } else if (docs[tab]) panel = D.renderDocument(itemDoc(docs[tab], it), docCtx(lv));
    var docHtml = panel ? '<div' + (nTabs > 1 ? ' role="tabpanel" id="tabpanel" aria-labelledby="tab-' + tab + '"' : '') + '>' + panel + '</div>' : '';
    var base = '#/l/' + esc(lv.id) + '/t/' + (ti + 1);
    var prev = k > 0 ? base + '/i/' + k : null, next = k < items.length - 1 ? base + '/i/' + (k + 2) : null;
    var sub = itemSummary(task, it);
    var gate = gateField(task), locked = isLockedTask(lv, task);
    // the documents render once: in the left pane on a desktop, under the heading on a phone
    var desk = DESKTOP.matches;
    // The call, the questions and Next. Phone: the questions sit under the documents and the sticky bar holds the
    // call and Next; while the call is open the bar holds only the call (Fine and Exception across its width), so
    // its main button is never a tap that does nothing. Desktop: one column in reading order (the call, the questions
    // it opens, Next), so Tab and a screen reader meet them in the order the eye does (WCAG 2.4.3).
    var gOpen = !locked && gateOpen(lv, task, it), rOpen = !locked && !gOpen && restOpen(lv, task, it) > 0;
    var gateHtml = gate ? '<div class="ibar-gate">' + lockWrap(lv, task, fieldsHtml(lv, task, it, 'gate')) + gateSum(lv, task, it, locked) + '</div>' : '';
    var restHtml = lockWrap(lv, task, restPanel(lv, task, it));
    var navHtml = '<div class="ibar-nav">' + (locked ? '' : moreBelow(lv, task, it)) + (next ? '<a class="btn btn-primary next-btn" href="' + next + '" data-replace>Next ' + esc(noun[0]) + SVG.next + '</a>' : '<a class="btn btn-primary next-btn" href="' + base + '" data-up>Back to the list</a>') + '</div>';
    // a three-way call (Fine · Disallow · Report only) sits in one row of three, never a 2 × 2 grid with a hole
    var gate3 = gate && (gate.options || []).length === 3;
    // gate-many (more than two calls): on a narrow phone the made call and Next take a row each (gst-1 at 360 px: the
    // 2 × 2 call grid beside Next ran 13 px past the screen)
    // gate-grid (a four-way call, drawn 2 × 2): on a phone the made call folds to one button beside Next, and opens again
    // on a tap (sa-2: the grid beside Next wrapped "Keep / out" and took 154 px of an 844 px screen)
    var barOpen = '<div class="ibar' + (gate ? '' : ' no-gate') + (gate3 ? ' gate3' : '') + (gateMany(gate) ? ' gate-many' : '') + (gateGrid(gate) ? ' gate-grid' : '') + (gOpen ? ' gate-open' : '') + (rOpen ? ' fields-open' : '') + '" id="ibar">';
    var tail = desk ? barOpen + gateHtml + restHtml + navHtml + '</div>' : restHtml + barOpen + gateHtml + navHtml + '</div>';
    var isig = 'item|' + lv.id + '|' + task.id + '|' + it.id + '|' + tab + '|' + (onOthers ? (app.ui.other[lv.id + ':' + task.id + ':other'] || 0) : '');
    return '<div class="work two">' + ((desk && paneShell(isig)) || itemPaneHtml(desk, isig, it.label, tabs + docHtml)) +
      '<div class="task-pane idetail"><div class="idetail-top">' + crumb(base, 'All ' + noun[1]).replace('<a ', '<a data-up ') + '<span class="pos">' + (k + 1) + ' of ' + items.length + '</span>' +
      '<a class="icon-btn" ' + (prev ? 'href="' + prev + '" data-replace' : 'aria-disabled="true" tabindex="-1" style="opacity:.4;pointer-events:none"') + ' aria-label="Previous ' + esc(noun[0]) + '">' + SVG.prev + '</a>' +
      '<a class="icon-btn" ' + (next ? 'href="' + next + '" data-replace' : 'aria-disabled="true" tabindex="-1" style="opacity:.4;pointer-events:none"') + ' aria-label="Next ' + esc(noun[0]) + '">' + SVG.chev + '</a></div>' +
      '<h1 data-focus>' + escTitle(it.label) + '</h1>' + (sub ? '<p class="i-sub">' + escText(sub) + '</p>' : '') + lockedNote(lv, task) + itemHints(lv, task) +
      recallNote(lv, it, answersOf(lv)) + (it.prompt ? '<p>' + escText(it.prompt) + '</p>' : '') +
      '<div class="idetail-docs">' + (desk ? '' : tabs + docHtml) + '</div>' + tail + '</div></div>';
  }
  // ba-1 round 1 (designer S3): an item's `recall` ({ task, cell, label, prefix?, unit? }) puts the student's own entry
  // in a worksheet cell of an earlier task on the item's screen, as a small blue sticky above the papers (Kuruli's item
  // asks for the drawing power worked out in task 1, handed in nine accounts earlier: five taps away on a phone). It is
  // the student's figure, or "not filled", never the key; a reference the level does not have shows nothing. Blue, not
  // yellow: yellow is the key line's alone (SPEC §10).
  function recallNote(lv, it, answers) {
    var rc = it && it.recall;
    if (!rc || typeof rc !== 'object' || typeof rc.cell !== 'string') return '';
    var t = E.findTask(lv, rc.task);
    if (!t || t.type !== 'worksheet' || !E.inputCells(t).some(function (c) { return c.key === rc.cell; })) return '';
    var v = ((answers || {})[t.id] || {})[rc.cell], n = E.parseNumber(v), txt;
    if (n === null) txt = E.isEmpty(v) ? 'not filled' : String(v);
    else txt = (n < 0 ? '−' : '') + (rc.prefix || '') + E.tidyNumberText(v).replace(/^[−-]/, '') + (rc.unit ? ' ' + rc.unit : '');
    return '<div class="sticky blue recall"><span class="s-label">' + escLabel(rc.label || '') + '</span><b>' + escNum(txt) + '</b></div>';
  }
  // The hints the student has paid for stay with them on every item, folded under "Your hint"; the hint button is
  // here too, so asking for one does not mean going back to the list.
  function itemHints(lv, task) {
    var list = task.hints || [], shown = hintsShown(lv, task), out = '';
    if (!list.length) return '';
    if (shown) {
      out += '<details class="hint-inline"' + (app.ui.hintOpen === task.id ? ' open' : '') + '><summary>' + (shown > 1 ? 'Your hints' : 'Your hint') + '</summary><div class="hi-body">' +
        list.slice(0, shown).map(function (h) { return '<p>' + escText(h) + '</p>'; }).join('') + '</div></details>';
    }
    if (!isLockedTask(lv, task)) {
      if (app.ui.hint === task.id) {
        out += '<div class="hint-confirm" role="group" aria-label="Use a hint"><p>' + esc(COPY.hintCost) + '</p><span class="hc-btns"><button class="btn btn-primary btn-sm" data-act="hint-yes" data-task="' + esc(task.id) + '">Show hint</button><button class="btn btn-secondary btn-sm" data-act="hint-no">Not now</button></span></div>';
      } else out += hintButton(lv, task, true);
    }
    return out ? '<div class="item-hints" id="hint-box">' + out + '</div>' : '';
  }
  // The task's shared papers (vendor master, policy, register…) stay one tap away under "Other papers": the
  // task's pack minus this item's own papers and the papers of the other items (and their groups).
  function otherPapers(lv, task, it, mine) {
    var myGroups = {}, otherIds = {}, otherGroups = {};
    mine.forEach(function (d) { if (d.group) myGroups[d.group] = 1; });
    (task.items || []).forEach(function (x) {
      if (x === it) return;
      (x.docs || []).forEach(function (id) {
        otherIds[id] = 1;
        var d = E.findDoc(lv, id);
        if (d && d.group && !myGroups[d.group]) otherGroups[d.group] = 1;
      });
    });
    return taskDocs(lv, task).filter(function (d) {
      return mine.indexOf(d) < 0 && !(otherIds[d.id] && !myGroups[d.group]) && !(d.group && otherGroups[d.group]);
    });
  }
  // phone: the questions under the documents are easy to miss, so the sticky bar says how many are still open
  function restOpen(lv, task, it) {
    var ia = (answersOf(lv)[task.id] || {})[it.id] || {};
    return (task.fields || []).filter(function (f) {
      return !f.gate && f.kind !== 'text' && E.fieldVisible(f, ia) && !E.fieldAnswered(f, ia[f.id]);
    }).length;
  }
  // the main call (Fine or Exception) is still open on this item
  function gateOpen(lv, task, it) {
    var g = gateField(task); if (!g) return false;
    var ia = (answersOf(lv)[task.id] || {})[it.id] || {};
    return !E.fieldAnswered(g, ia[g.id]);
  }
  // phone: while the main call is open the bar holds only the call (no button beside it); once it is made, while
  // questions under the documents are open, the main button takes the student to them; then it is "Next bill"
  function gateMany(gate) { return !!gate && (gate.options || []).length > 2; }
  // fdd-1 round 1: a three-way gate with `fold: true` folds the same way once made (fdd-1's Add back · Deduct · No
  // adjustment, beside task 2's folded four-way call); a three-way gate without it keeps its row of three, as before
  function gateGrid(gate) { var n = gate ? (gate.options || []).length : 0; return n === 4 || (n === 3 && gate.fold === true); }
  var PEN = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16l1-4 8.5-8.5 3 3L8 15z M12 5l3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
  // the folded call: "Your call · Excess" (a button that opens the four calls again; plain text once handed in). It
  // uses the field's and the option's short labels when they have them (gst-1: "Which GSTR-1 · Hosur"), so it stays
  // two lines beside Next on a 360 px phone; the open call, the review and the work sample keep the full labels
  function gateSum(lv, task, it, locked) {
    var g = gateField(task); if (!gateGrid(g)) return '';
    var v = ((answersOf(lv)[task.id] || {})[it.id] || {})[g.id];
    var val = '<span class="gs-t">' + esc(v ? optLabel(g, v, true) : '') + '</span>', key = esc(g.short || g.label);
    if (locked) return '<p class="gate-sum is-static"><span class="gs-k">' + key + '</span><span class="gs-v">' + val + '</span></p>';
    return '<button type="button" class="btn btn-secondary gate-sum" data-act="gate-change" aria-expanded="false"><span class="gs-k">' + key + '</span><span class="gs-v">' + val + PEN + '</span><span class="vh">, change it</span></button>';
  }
  // a tap on the folded call opens the four calls across the bar; a pick (or the same pick again, or Escape, or focus
  // leaving them) folds them back
  function openGateChange() {
    var bar = document.getElementById('ibar'); if (!bar) return;
    bar.classList.add('gate-change');
    var sum = bar.querySelector('.gate-sum'); if (sum) sum.setAttribute('aria-expanded', 'true');
    var r = bar.querySelector('.ibar-gate input:checked') || bar.querySelector('.ibar-gate input');
    if (r) r.focus();
  }
  function closeGateChange(focusSum) {
    var bar = document.getElementById('ibar'); if (!bar || !bar.classList.contains('gate-change')) return;
    bar.classList.remove('gate-change');
    var sum = bar.querySelector('.gate-sum'); if (!sum) return;
    sum.setAttribute('aria-expanded', 'false');
    if (focusSum && sum.offsetParent) sum.focus();
  }
  function syncGateSum(lv, task, it) {
    var bar = document.getElementById('ibar'), g = gateField(task), v = bar && bar.querySelector('.gate-sum .gs-t');
    if (!v || !g) return;
    var ia = (answersOf(lv)[task.id] || {})[it.id] || {};
    v.textContent = ia[g.id] ? optLabel(g, ia[g.id], true) : '';
  }
  // sa-6 round 1: a box that holds text but no figure it can take ("5/4" for a day) is not "more to fill": the student
  // filled it, so the bar asks them to check it ("Check 1 box"), and the box says why under it
  function moreBelowText(n, bad) {
    return bad ? 'Check ' + bad + (bad === 1 ? ' box' : ' boxes') : Math.max(n, 1) + ' more to fill';
  }
  function badOpen(lv, task, it) {
    var ia = (answersOf(lv)[task.id] || {})[it.id] || {};
    return (task.fields || []).filter(function (f) { return !f.gate && E.fieldVisible(f, ia) && E.numberInvalid(f, ia[f.id]); }).length;
  }
  function moreBelowBtn(n, bad) {
    return '<button type="button" class="btn btn-primary more-below" id="more-below" data-act="to-fields">' + moreBelowText(n, bad) + SVG.down + '</button>';
  }
  function moreBelow(lv, task, it) {
    if (gateOpen(lv, task, it)) return '';
    return moreBelowBtn(restOpen(lv, task, it), badOpen(lv, task, it));
  }
  function updateMoreBelow(lv, task, it) {
    var bar = document.getElementById('ibar');
    if (!bar || isLockedTask(lv, task)) return;
    // the boxes flagged on screen (a box is flagged when the student leaves it, not while they type "5 Apr…")
    var g = gateOpen(lv, task, it), n = g ? 0 : restOpen(lv, task, it), bad = g ? 0 : $all('#fields input[aria-invalid="true"]').length, b = document.getElementById('more-below');
    if (!g && !b) {
      var nav = bar.querySelector('.ibar-nav');
      if (nav) { nav.insertAdjacentHTML('afterbegin', moreBelowBtn(n, bad)); b = document.getElementById('more-below'); }
    }
    if (b && n) b.innerHTML = moreBelowText(n, bad) + SVG.down;
    bar.classList.toggle('gate-open', g);
    bar.classList.toggle('gate-many', gateMany(gateField(task)));
    if (bar.classList.contains('fields-open') !== !!n) {
      var hadFocus = b && document.activeElement === b;
      bar.classList.toggle('fields-open', !!n);
      if (hadFocus && !n) { var nx = bar.querySelector('.next-btn'); if (nx) nx.focus(); }
    }
  }
  // which: 'gate' (the main call, in the sticky bar) or 'rest' (everything else, under the documents)
  function fieldsHtml(lv, task, it, which) {
    var ia = (answersOf(lv)[task.id] || {})[it.id] || {};
    return (task.fields || []).map(function (f) {
      if (which === 'gate' && !f.gate) return '';
      if (which === 'rest' && f.gate) return '';
      if (!E.fieldVisible(f, ia)) return '';
      return fieldHtml(task, it, f, ia[f.id]);
    }).join('');
  }
  function restPanel(lv, task, it) {
    var html = fieldsHtml(lv, task, it, 'rest');
    // mat-1 round 1 (designer S4): a task with no main call names the item over its questions (shown on a phone only,
    // ws.css .fp-item), so after "4 more to fill" the screen still says which route they are for
    if (html && !gateField(task)) html = '<p class="fp-item">' + escLabel(it.short || it.label) + '</p>' + html;
    return '<div class="fields-panel' + (html ? '' : ' empty') + '" id="fields" aria-label="Details">' + html + '</div>';
  }
  function fieldHtml(task, it, f, v) {
    var name = 'f-' + it.id + '-' + f.id;
    var data = ' data-task="' + esc(task.id) + '" data-item="' + esc(it.id) + '" data-field="' + esc(f.id) + '" data-kind="' + esc(f.kind) + '"';
    if (f.kind === 'choice') {
      var o = f.options || [];
      // up to four options are big buttons, more are a select; `buttons: true` keeps up to six short ones as buttons,
      // three to a row (dt-2: the five rates side by side, as a senior weighs "1% or 2%?")
      // sa-3 round 2: three options, not the main call, one of them longer than 18 characters, stack one to a row on a
      // phone (ws.css `.seg.stack`): "Capital work-in-progress" broke as "Capital work-in-" / "progress" in a 143 px
      // half-row at 360 px, where the held word needs 132 px against 120 px of room, and the third option sat alone
      var stack = !f.gate && o.length === 3 && o.some(function (x) { return String(x.label || '').length > 18; });
      // dt-3 round 2: four options are marked (`seg4`), so a desktop keeps them 2 × 2 where a three-way call's bar would
      // set them three to a row with one left over (ws.css; dt-3's "What decides" beside Agree · In part · Disagree)
      // sa-6 round 1: `layout: "list"` sets the options as radio rows, one to a row, left-aligned in regular weight (the
      // compose task's rows): four 14-word next steps were five-line bold centred buttons in a 2 × 2 grid at 390 px,
      // the hardest way to read and weigh four plans. Same inputs and data, so saving and scoring are unchanged.
      if (f.layout === 'list') {
        return '<fieldset class="field" style="border:0;padding:0;margin:0 0 14px"><legend class="f-label">' + escLabel(f.label) + '</legend><div class="opts">' +
          o.map(function (x) {
            return '<label class="opt-row"><input type="radio" name="' + esc(name) + '" value="' + esc(x.id) + '"' + (v === x.id ? ' checked' : '') + data + '><span class="box" aria-hidden="true"></span><span class="o-text">' + esc(x.label) + '</span></label>';
          }).join('') + '</div></fieldset>';
      }
      if (o.length <= 4 || f.buttons === true) {
        return '<fieldset class="field" style="border:0;padding:0;margin:0 0 14px"><legend class="f-label">' + escLabel(f.label) + '</legend><div class="seg' + (o.length > 2 ? ' wrap' : '') + (o.length > 4 ? ' seg3' : '') + (o.length === 4 ? ' seg4' : '') + (stack ? ' stack' : '') + '">' +
          o.map(function (x) {
            return '<label class="seg-opt"><input type="radio" name="' + esc(name) + '" value="' + esc(x.id) + '"' + (v === x.id ? ' checked' : '') + data + '><span>' + esc(x.label) + '</span></label>';
          }).join('') + '</div></fieldset>';
      }
      return '<div class="field"><label class="f-label" for="' + esc(name) + '">' + escLabel(f.label) + '</label><select class="select" id="' + esc(name) + '"' + data + '>' +
        '<option value="">Choose</option>' + o.map(function (x) { return '<option value="' + esc(x.id) + '"' + (v === x.id ? ' selected' : '') + '>' + esc(x.label) + '</option>'; }).join('') + '</select></div>';
    }
    if (f.kind === 'multi') {
      var vals = Array.isArray(v) ? v : [];
      return '<fieldset class="field" style="border:0;padding:0;margin:0 0 14px"><legend class="f-label">' + escLabel(f.label) + ' <span class="opt">Pick all that apply</span></legend><div class="opts">' +
        (f.options || []).map(function (x) {
          // dt-3 round 1: a year written with an en dash stays whole in a pick-list row ("FY 2025–" / "26")
          return '<label class="opt-row"><input type="checkbox" name="' + esc(name) + '" value="' + esc(x.id) + '"' + (vals.indexOf(x.id) >= 0 ? ' checked' : '') + data + '><span class="box" aria-hidden="true"></span><span class="o-text">' + (D.nwRanges ? D.nwRanges(esc(x.label)) : esc(x.label)) + '</span></label>';
        }).join('') + '</div></fieldset>';
    }
    if (f.kind === 'number') {
      // sa-6 round 1: the field's `placeholder` is drawn ("day" beside the unit "April"; dt-3's "e.g. 1,25,000" and
      // sa-4's "In rupees" were declared but never shown), and a box holding text that is no figure the field takes is
      // flagged under the box with the field's `invalidNote` (aria-invalid, named by aria-describedby)
      var bad = E.numberInvalid(f, v);
      return '<div class="field"><label class="f-label" for="' + esc(name) + '">' + escLabel(f.label) + '</label><div class="num">' + signButton(v, f.sign) + (f.prefix ? '<span class="pre">' + esc(f.prefix) + '</span>' : '') +
        '<input id="' + esc(name) + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" value="' + esc(v === undefined ? '' : E.tidyNumberText(v)) + '"' + data +
        (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + (bad ? ' aria-invalid="true" aria-describedby="' + esc(name) + '-bad"' : '') + '>' +
        (f.unit ? '<span class="unit">' + esc(f.unit) + '</span>' : '') + '</div>' +
        '<p class="f-bad" id="' + esc(name) + '-bad"' + (bad ? '' : ' hidden') + '>' + esc(badNote(f)) + '</p></div>';
    }
    if (f.kind === 'text') {
      return '<div class="field"><label class="f-label" for="' + esc(name) + '">' + escLabel(f.label) + ' <span class="opt">(not marked)</span></label>' +
        '<textarea class="textarea" id="' + esc(name) + '" maxlength="400" rows="3"' + data + (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') + '>' + esc(v || '') + '</textarea></div>';
    }
    return '';
  }

  // An iPhone's number pad has no minus key: every number box has a ± button that flips the sign of what is typed
  // (`"sign": false` on a field or cell leaves it out, for counts that are never below zero)
  function signButton(v, opt) {
    if (opt === false) return '';
    return '<button type="button" class="sign-btn" data-act="sign" aria-label="Plus or minus" aria-pressed="' + E.isNegativeText(v) + '">±</button>';
  }
  function syncSign(input) {
    var box = input && input.closest ? input.closest('.num') : null, btn = box && box.querySelector('.sign-btn');
    if (btn) btn.setAttribute('aria-pressed', String(E.isNegativeText(input.value)));
  }
  function badNote(f) { return f.invalidNote || (f.integer === true ? 'Type a whole number only, like 12' : 'Type a number only, like 1,25,000'); }
  // the item field a number box belongs to (null for a worksheet cell)
  function numberField(el) {
    var lv = currentLevel(); if (!lv || !el.hasAttribute('data-field')) return null;
    var task = E.findTask(lv, el.getAttribute('data-task'));
    return task ? E.findField(task, el.getAttribute('data-field')) : null;
  }
  // flag (or clear) a number box: red line under it, aria-invalid, and the note named by aria-describedby only while it
  // shows (a hidden note that is still referenced is read out)
  function markNumber(el, f, flag) {
    var note = document.getElementById(el.id + '-bad'), bad = !!flag && E.numberInvalid(f, el.value);
    if (bad) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', el.id + '-bad'); }
    else { el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
    if (note) note.hidden = !bad;
    // a worksheet box's cell lays its note out under the box (css .ws td.ws-bad)
    var wtd = el.hasAttribute('data-ws') && el.closest ? el.closest('td') : null;
    if (wtd) wtd.classList.toggle('ws-bad', bad);
  }
  // mat-1 round 2 (designer S1): a worksheet box is a number box too. Text that is no figure ("0.22 crore" under a
  // "₹ crore" column) was taken as a blank: no flag, "2 figures still empty" at the hand-in, then marked wrong in red.
  // Now it is flagged under the box as an item's number box is (SPEC §7.1, §7.2): the cell's own `unit` word is taken
  // off first (E.readTyped), `integer: true` takes whole numbers only, and the note is the cell's or the task's
  // `invalidNote`, else a plain one for the column's kind of figure
  // con-1 round 1 (designer S1): the cell's `maxAbs`, else its task's, makes a bigger figure unreadable too (E.overMax via
  // fieldAnswered): ₹5,74,60,000 typed in a ₹ lakh box is flagged with the invalidNote and said apart at the hand-in
  function wsField(cell, task) {
    var max = cell && typeof cell.maxAbs === 'number' ? cell.maxAbs : task && typeof task.maxAbs === 'number' ? task.maxAbs : undefined;
    return { kind: 'number', integer: !!cell && cell.integer === true, unit: cell && typeof cell.unit === 'string' ? cell.unit : undefined, maxAbs: max };
  }
  function wsInputId(task, key) { return 'ws-' + task.id + '-' + String(key).replace(/[^\w-]/g, '-'); }
  function wsBadNote(task, cell, col) {
    var fmt = String(cell.format || (col && col.format) || '');
    return cell.invalidNote || task.invalidNote || (cell.integer === true ? 'Type a whole number only, like 12' : fmt.indexOf('inr') === 0 || fmt === 'int' ? 'Type a number only, like 1,25,000' : 'Type a number only, like 12.5');
  }
  // the field of the worksheet box `el` (null for any other box)
  function wsFieldOf(el) {
    var lv = currentLevel(); if (!lv || !el.hasAttribute('data-ws')) return null;
    var task = E.findTask(lv, el.getAttribute('data-ws')), key = el.getAttribute('data-key');
    var c = task ? E.inputCells(task).filter(function (x) { return x.key === key; })[0] : null;
    return c ? wsField(c.cell, task) : null;
  }
  // a worksheet's input cells that hold text but no figure, and the first box Keep working goes to: the first of those,
  // else the first one still empty (null when every box holds a figure)
  function wsUnread(task, a) { a = a || {}; return E.inputCells(task).filter(function (c) { return E.numberInvalid(wsField(c.cell, task), a[c.key]); }); }
  function wsFirstOpen(task, a) {
    a = a || {};
    var c = wsUnread(task, a)[0] || E.inputCells(task).filter(function (x) { return E.parseNumber(a[x.key]) === null; })[0];
    return c ? wsInputId(task, c.key) : null;
  }
  function refreshItemBar(el) {
    var lv = currentLevel(); if (!lv) return;
    var task = E.findTask(lv, el.getAttribute('data-task')), iid = el.getAttribute('data-item');
    var it = task && (task.items || []).filter(function (x) { return x.id === iid; })[0];
    if (it) updateMoreBelow(lv, task, it);
  }
  function tidyNumberInput(el) {
    // sa-6 round 1: "5 April" typed into a box that already says "April" is read as 5 (the unit word is taken off);
    // round 2: in a whole-number box "8th" and "8th April" read 8 too (E.readTyped)
    // mat-1 round 2: a worksheet box is read and flagged the same way (wsFieldOf)
    var f = numberField(el) || wsFieldOf(el), v = f ? E.readTyped(f, el.value) : el.value;
    var t = E.tidyNumberText(v);
    if (t !== el.value) { el.value = t; onField(el, true); }
    syncSign(el);
    if (f) { markNumber(el, f, true); if (el.hasAttribute('data-field')) refreshItemBar(el); }
  }

  /* worksheet */
  function cellAffix(cell, col) {
    var fmt = cell.format || col.format;
    return { pre: cell.prefix || (fmt === 'inr' || fmt === 'inr2' || fmt === 'inr0' ? '₹' : ''), unit: cell.unit || (fmt && fmt.indexOf('pct') === 0 ? '%' : '') };
  }
  // gst-3 round 1: a rupee cell typed with one decimal shows its paise to two places once the student leaves it
  // ("32,65,608.5" reads "32,65,608.50"): money never shows one decimal (SPEC §6). The figure is the same.
  function padRupeeCell(el) {
    var lv = currentLevel(), task = lv && E.findTask(lv, el.getAttribute('data-ws'));
    var key = String(el.getAttribute('data-key') || ''), dot = key.indexOf('.');
    if (!task || dot < 0 || !/\.\d$/.test(el.value.trim()) || E.parseNumber(el.value) === null) return;
    var row = (task.rows || []).filter(function (x) { return x.id === key.slice(0, dot); })[0];
    var col = (task.columns || []).filter(function (x) { return x.key === key.slice(dot + 1); })[0];
    var cell = row && row.cells ? row.cells[key.slice(dot + 1)] : null;
    if (!cell || typeof cell !== 'object' || !col || cellAffix(cell, col).pre !== '₹') return;
    el.value = el.value.trim() + '0'; onField(el, true);
  }
  function wsGrid(task) { var n = (task.columns || []).length - 1; return task.layout === 'grid' && n >= 2 && n <= 4; }
  function wsTable(task) { return task.layout === 'table' && (task.columns || []).length === 2; }
  // con-1 round 2 (designer optional 3): a worksheet's progress line speaks in the task's own noun, as its hand-in box
  // does ("0 of 8 figures filled" beside "6 figures still empty"); a sheet with no noun keeps "cells"
  function wsProgText(task, p) { return p.done + ' of ' + p.total + ' ' + E.nounFor(task)[1] + ' filled'; }
  function worksheet(lv, task, a) {
    a = a || {};
    var cols = task.columns || [];
    var head = '<thead><tr>' + cols.map(function (c, i) { return '<th' + (i && c.format ? ' class="r"' : '') + ' scope="col">' + esc(c.label) + '</th>'; }).join('') + '</tr></thead>';
    var body = (task.rows || []).map(function (row) {
      var cells = row.cells || {}, rowLabel = String(cells[cols[0] && cols[0].key] || '');
      return '<tr class="' + (row['_class'] === 'total' || row.total ? 'ws-total' : '') + '">' + cols.map(function (c, i) {
        var v = cells[c.key];
        if (i === 0) return '<td class="rowhead" data-label="' + esc(c.label) + '">' + escText(v) + '</td>';
        if (v && typeof v === 'object' && v.input) {
          // mat-1 round 2 (designer S1): each box has an id and a note under it, shown (aria-invalid, aria-describedby)
          // while the box holds text that is no figure, as an item's number box does
          var key = row.id + '.' + c.key, af = cellAffix(v, c), wid = wsInputId(task, key), wbad = E.numberInvalid(wsField(v, task), a[key]);
          return '<td class="r' + (wbad ? ' ws-bad' : '') + '" data-label="' + esc(c.label) + '"><div class="num">' + signButton(a[key], v.sign) + (af.pre ? '<span class="pre">' + esc(af.pre) + '</span>' : '') +
            '<input id="' + esc(wid) + '" type="text" inputmode="decimal" autocomplete="off" spellcheck="false" aria-label="' + esc(rowLabel + ', ' + c.label) + '" value="' + esc(a[key] === undefined ? '' : E.tidyNumberText(a[key])) + '" data-ws="' + esc(task.id) + '" data-key="' + esc(key) + '"' +
            (wbad ? ' aria-invalid="true" aria-describedby="' + esc(wid) + '-bad"' : '') + '>' +
            (af.unit ? '<span class="unit">' + esc(af.unit) + '</span>' : '') + '</div>' +
            '<p class="f-bad" id="' + esc(wid) + '-bad"' + (wbad ? '' : ' hidden') + '>' + esc(wsBadNote(task, v, c)) + '</p></td>';
        }
        var txt = typeof v === 'number' ? E.formatCell(v, c.format, E.cellSigned(c, v)) : (v === undefined || v === null ? '' : String(v));
        // ia-2 round 2: a text cell (`tx`) reads from the left when it wraps on a phone's card (ia-2's "Breach"); on a
        // total row a blank or dash text cell (`nil`) is left off the card, where it read as an empty field ("Breach –").
        // The desktop table keeps every cell as before
        var tcls = typeof v === 'number' ? 'r given' : 'tx' + ((row['_class'] === 'total' || row.total) && (txt.trim() === '' || txt.trim() === '–') ? ' nil' : '');
        return '<td class="' + tcls + '" data-label="' + esc(c.label) + '">' + esc(txt) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var p = E.taskProgress(lv, task, a);
    // `noteAt: "top"` puts the task's note above the sheet, where a note that explains the given rows is read before
    // them (dt-4: "Kunal’s list after your calls…" sat below the eight boxes, under the fold on a phone); by default it
    // stays below, as before
    var wsNote = task.note ? '<p class="meta" style="margin-' + (task.noteAt === 'top' ? 'bottom' : 'top') + ':10px">' + esc(task.note) + '</p>' : '';
    return '<div class="progress-line"><span class="bar" aria-hidden="true"><i style="width:' + Math.round(p.done / Math.max(1, p.total) * 100) + '%"></i></span><span id="ws-prog">' + wsProgText(task, p) + '</span></div>' +
      (task.noteAt === 'top' ? wsNote : '') +
      // `layout: "table"` (one value column with short labels, val-1's DCF): label and figure stay on one row at every
      // width, the column named once in the header, instead of a tall card per row that repeats "₹ crore".
      // `layout: "grid"` (val-1's three-year bridge, two to four short columns): where rows become cards, each card keeps
      // its figures side by side under their headers. Without a layout, rows become cards as before
      '<div class="workpaper ws-wrap ws-in' + (wsTable(task) ? ' ws-one' : '') + (wsGrid(task) ? ' ws-grid" style="--ws-n:' + (cols.length - 1) : '') + '"><table class="ws">' + head + '<tbody>' + body + '</tbody></table></div>' +
      (task.noteAt === 'top' ? '' : wsNote);
  }

  /* choice */
  // xl-1 round 1: a question with `code: true` has formulas for options; their text is set in the formula bar's mono face
  // (.fx), on the task, in the review, in the model answer and on the work sample, so formulas that differ by one token
  // line up and can be compared. Other questions read as before.
  function optText(q, text) {
    // a formula may break after an opening bracket or a sheet's "!" as well as at its spaces, so "Answer:" keeps the
    // start of a long formula on its own line at 360 px ("=SUMIFS(" beside it, not pushed to the next line)
    return q && q.code === true ? '<span class="fx">' + esc(text).replace(/([(!])/g, '$1<wbr>') + '</span>' : escText(text);
  }
  function choiceTask(lv, task, a) {
    a = a || {};
    return (task.questions || []).map(function (q, qi) {
      var v = a[q.id], type = q.multi ? 'checkbox' : 'radio', name = 'q-' + task.id + '-' + q.id;
      return '<fieldset class="card q-card" style="margin:0 0 14px"><legend class="vh">Question ' + (qi + 1) + '</legend><p class="' + qTextClass(task) + '"><span class="q-num">' + (qi + 1) + '</span>' + escText(q.text) + '</p>' +
        '<p class="q-hint">' + (q.multi ? 'Pick all that apply.' : 'Pick one.') + '</p><div class="opts">' + (q.options || []).map(function (o) {
          var on = q.multi ? (Array.isArray(v) && v.indexOf(o.id) >= 0) : v === o.id;
          return '<label class="opt-row"><input type="' + type + '" name="' + esc(name) + '" value="' + esc(o.id) + '"' + (on ? ' checked' : '') + ' data-q="' + esc(q.id) + '" data-task="' + esc(task.id) + '" data-multi="' + (q.multi ? 1 : 0) + '"><span class="box" aria-hidden="true"></span><span class="o-text">' + optText(q, o.text) + '</span></label>';
        }).join('') + '</div></fieldset>';
    }).join('');
  }

  /* order */
  function orderTask(lv, task, a) {
    var order = E.currentOrder(lv, task, a);
    var byId = {}; (task.steps || []).forEach(function (s) { byId[s.id] = s; });
    return '<p class="meta">Use the arrows to move a step up or down.</p><div class="workpaper"><ol class="order-list" id="order-list">' + order.map(function (id, i) {
      var s = byId[id] || { text: id };
      return '<li data-step="' + esc(id) + '"' + (app.ui.moved === id ? ' class="moved"' : '') + '><span class="o-n" aria-hidden="true">' + (i + 1) + '</span><span class="o-t">' + esc(s.text) + '</span><span class="o-btns">' +
        '<button class="icon-btn" data-act="move" data-task="' + esc(task.id) + '" data-step="' + esc(id) + '" data-dir="-1" aria-label="Move up: ' + esc(s.text) + '"' + (i === 0 ? ' disabled' : '') + '>' + SVG.up + '</button>' +
        '<button class="icon-btn" data-act="move" data-task="' + esc(task.id) + '" data-step="' + esc(id) + '" data-dir="1" aria-label="Move down: ' + esc(s.text) + '"' + (i === order.length - 1 ? ' disabled' : '') + '>' + SVG.down + '</button></span></li>';
    }).join('') + '</ol></div>';
  }

  /* compose */
  // the live note: the template's line breaks are kept (shown with white-space: pre-line); the student's own line goes
  // where the template says {_free}, else at the end
  function composePreview(task, a) {
    a = a || {};
    var slots = task.slots || [], tpl = task.template || slots.map(function (s) { return '{' + s.id + '}'; }).join(' ');
    var free = typeof a._free === 'string' ? a._free.trim() : '', placed = false;
    // sa-1 round 6 (designer S2 and optional 2): the template's own words and the student's own line hold their dates,
    // amounts and codes as the review prints the whole note (escText), so the live note never wraps "1 to 8" / "April"
    // or a subject line's "of 18" / "February 2027" (gst-3 at 390 px)
    var html = tpl.split(/(\{[\w-]+\})/).map(function (part, k, parts) {
      if (k % 2 === 0) return escText(part);
      var id = part.slice(1, -1);
      if (id === '_free') { placed = true; return escText(free); }
      var slot = slots.filter(function (s) { return s.id === id; })[0];
      if (!slot) return '';
      var o = E.slotOption(slot, a[id]);
      if (!o) slot = gapSlot(slot, parts[k - 1]);
      // cl-1 round 3: an unfilled slot's gap holds its name as the slot's own heading does (escLabel: codes, dates and the
      // " · " held), so at a line end it never breaks "MSME-" / "1" or starts a line with "·" (cl-1's live note at 360)
      return o ? escText(o.text) : '<span class="gap">' + escLabel(slot.label) + '</span>';
    }).join('');
    if (free && !placed) html += (tpl.indexOf('\n') >= 0 ? '\n\n' : ' ') + escText(free);
    return noteTitle(task, html.split('\n').map(function (l) { return l.replace(/^[ \t]+|[ \t]+$/g, ''); }).join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, ''));
  }
  // sa-7 round 4 (designer optional 1): where the template's words just before an unfilled slot already end with the
  // slot's short reference (the part of its label before " · ", as "(i)(b) {c2}" for "(i)(b) · Physical verification"),
  // the gap shows only the rest of the label, so the empty draft reads "(i)(b) Physical verification", not
  // "(i)(b) (i)(b) · Physical verification". Any other gap keeps its whole label.
  function gapSlot(slot, before) {
    var lab = String(slot.label || ''), cut = lab.indexOf(' · '), ref = cut > 0 ? lab.slice(0, cut) : '';
    var b = String(before || '').replace(/\s+$/, ''), at = b.length - ref.length;
    if (!ref || at < 0 || b.slice(at) !== ref || (at > 0 && /\S/.test(b.charAt(at - 1)))) return slot;
    return { id: slot.id, label: lab.slice(cut + 3) };
  }
  // mat-1 round 1 (designer optional 3): a template whose first line starts with "# " prints that line as the note's
  // title, bold and without the "# ", wherever the note is shown (the live note, the review, the model answer, the work
  // sample); `html` is the note already escaped. Only the template's own first line: a student's line is never a title.
  function noteTitle(task, html) {
    html = noteBold(task, html);
    if (!/^# /.test(String((task && task.template) || '')) || String(html).indexOf('# ') !== 0) return html;
    var nl = html.indexOf('\n');
    return '<b class="pn-title">' + (nl < 0 ? html.slice(2) : html.slice(2, nl)) + '</b>' + (nl < 0 ? '' : html.slice(nl));
  }
  // ia-1 round 3 (designer optional 3): a template may set its own words in bold with **…** (ia-1's observation
  // headings and their parts, "Condition:", "Cause:", "Owner:", as a draft report prints them), wherever noteTitle shows
  // the note. A run turns bold only when its words are one of the template's own runs, so the asterisks in a student's
  // own line print as typed; a template with no ** (every other level) prints exactly as before
  function noteBold(task, html) {
    var runs = String((task && task.template) || '').match(/\*\*[^*{}\n]+\*\*/g);
    if (!runs) return html;
    var plain = function (s) {
      return String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;|\u00a0|\u2060/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    };
    var own = runs.map(function (m) { return plain(m.slice(2, -2)); });
    return String(html).replace(/\*\*([^*\n]+?)\*\*/g, function (m, inner) { return own.indexOf(plain(inner)) >= 0 ? '<b class="pn-k">' + inner + '</b>' : m; });
  }
  // sa-7 round 1 (designer S2): a slot may name the paper(s) it is built from (`docs`, ids in the task's docs): a link
  // under the slot's title opens that paper (the phone's viewer, which closes back to this place on the page; the
  // desktop pane), so a student nine screens down a ten-clause task never scrolls back up to Documents. A locked task's
  // desktop links are left out (a button in a disabled fieldset does nothing); the phone's links still open the papers
  function slotPapers(lv, task, s) {
    if (!Array.isArray(s.docs) || !s.docs.length) return '';
    var desktop = DESKTOP.matches;
    if (desktop && isLockedTask(lv, task)) return '';
    var docs = taskDocs(lv, task), ti = (lv.tasks || []).indexOf(task);
    var base = '#/l/' + esc(lv.id) + '/t/' + (ti + 1) + '/docs/';
    var out = s.docs.map(function (id) {
      var j = -1;
      docs.forEach(function (d, k) { if (j < 0 && d.id === id) j = k; });
      if (j < 0) return '';
      var lab = '<span class="sp-k">Paper</span><span class="sp-t">' + escText(docs[j].title || D.typeLabel(docs[j])) + '</span>';
      return desktop ? '<button type="button" class="slot-paper" data-act="pane-go" data-key="' + esc(lv.id + ':' + task.id) + '" data-idx="' + j + '" data-val="' + esc(s.id) + '">' + SVG.docs + lab + '</button>'
        : '<a class="slot-paper" href="' + base + (j + 1) + '">' + SVG.docs + lab + '</a>';
    }).join('');
    return out ? '<div class="slot-papers">' + out + '</div>' : '';
  }
  // sa-7 round 1 (designer S3): a long composed text (six slots or more: ia-1's two observations, sa-7's ten clauses)
  // counts its picks above the first slot, as a worksheet counts its cells ("6 of 10 clauses picked")
  function composeProgress(lv, task, a) {
    if ((task.slots || []).length < 6) return '';
    var p = E.taskProgress(lv, task, a);
    return '<div class="progress-line"><span class="bar" aria-hidden="true"><i style="width:' + Math.round(p.done / Math.max(1, p.total) * 100) + '%"></i></span><span id="cmp-prog">' + composeProgText(task, p) + '</span></div>';
  }
  function composeProgText(task, p) { return p.done + ' of ' + p.total + ' ' + E.nounFor(task)[1] + ' picked'; }
  // the slots still to pick, in order (the hand-in's "Keep working" goes to the first)
  function openSlots(task, a) {
    a = a || {};
    return (task.slots || []).filter(function (s) { return !(s.options || []).some(function (o) { return o.id === a[s.id]; }); });
  }
  // sa-7 round 1 (designer optional 7): a question of more than 25 words (a case to read, sa-7's opinion cases) is set
  // in semibold, so six lines on a phone are not one heavy block; a short question keeps the bold.
  // con-1 round 1 (designer S3): the weight is the task's, not each question's: when any question of the task runs over
  // 25 words, every question of it is semibold (con-1's four managers showed in 800, 600, 600 and 800)
  function qTextClass(task) {
    var long = ((task && task.questions) || []).some(function (q) { return String(q.text || '').split(/\s+/).filter(Boolean).length > 25; });
    return 'q-text' + (long ? ' q-long' : '');
  }
  function composeTask(lv, task, a) {
    a = a || {};
    var slots = composeProgress(lv, task, a) + (task.slots || []).map(function (s) {
      var name = 'c-' + task.id + '-' + s.id;
      // ia-1 round 1: a slot may open a new part of the text (`heading`: "Observation 2 · …"), so a student ten slots
      // down a phone knows which observation the lines belong to
      return (s.heading ? '<h2 class="slot-head">' + escText(s.heading) + '</h2>' : '') +
        '<fieldset class="slot" id="slot-' + esc(task.id) + '-' + esc(s.id) + '" style="border:0;padding:0"><legend class="s-title">' + esc(s.label).replace(/ · /g, '\u00a0· ') + '</legend>' + slotPapers(lv, task, s) + '<div class="opts">' + (s.options || []).map(function (o) {
        return '<label class="opt-row"><input type="radio" name="' + esc(name) + '" value="' + esc(o.id) + '"' + (a[s.id] === o.id ? ' checked' : '') + ' data-slot="' + esc(s.id) + '" data-task="' + esc(task.id) + '"><span class="box" aria-hidden="true"></span><span class="o-text">' + escText(o.text) + '</span></label>';
      }).join('') + '</div></fieldset>';
    }).join('');
    var free = task.freeText ? '<div class="field"><label class="f-label" for="free-' + esc(task.id) + '">' + esc(task.freeText.label || 'Your own line') + ' <span class="opt">(not marked)</span></label>' +
      '<textarea class="textarea" id="free-' + esc(task.id) + '" maxlength="400" rows="3" data-free="' + esc(task.id) + '">' + esc(a._free || '') + '</textarea></div>' : '';
    return slots + '<div class="workpaper preview-note"><div class="pn-label">' + esc(task.previewLabel || 'Your note') + '</div><div class="pn-text" id="compose-preview">' + composePreview(task, a) +
      '</div></div>' + free;
  }

  /* hunt */
  var WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
  function parseDate(s) {
    if (s === undefined || s === null) return null;
    s = String(s).trim();
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = /^(\d{1,2})[-./ ](\d{1,2})[-./ ](\d{2,4})$/.exec(s);
    if (m) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
    // for-1 round 2: the whole month word is read ("October" took "Octo" and found no month), any start of its name of
    // three letters or more ("Oct", "Sept", "October")
    m = /^(\d{1,2})[-./\s]+([A-Za-z]{3,9})\.?[-./\s,]*(\d{2,4})$/.exec(s);
    var mi = m ? monthOf(m[2]) : undefined;
    if (mi !== undefined) return new Date(m[3].length === 2 ? 2000 + +m[3] : +m[3], mi, +m[1]);
    return null;
  }
  var MONTHS = 'january february march april may june july august september october november december'.split(' ');
  function monthOf(w) {
    w = String(w || '').toLowerCase();
    var i = MON[w.slice(0, 3)];
    return w.length >= 3 && i !== undefined && MONTHS[i].indexOf(w) === 0 ? i : undefined;
  }
  // for-1 round 2: a search typed as a date finds the rows of that day, in the calendar's form ("2 October 2026", "2nd Oct",
  // "Friday 2 October", "7–11 November 2026", "October 2026") or the way people write one ("02/10/2026", "2.10", "02-10"),
  // day first, the year optional. Returns { d1, d2, m, y } (days d1 to d2 of month m; y null when not typed), else null.
  function parseSearchDate(q) {
    var s = String(q || '').replace(/\s+/g, ' ').trim().replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,? /i, '').replace(/[,.]$/, '');
    var yr = function (t) { return t === undefined ? null : t.length === 2 ? 2000 + +t : +t; };
    var out = null, m, mi;
    if ((m = /^(\d{1,2})(?:st|nd|rd|th)?(?: ?(?:-|–|to) ?(\d{1,2})(?:st|nd|rd|th)?)?[-./ ]*([A-Za-z]{3,9})\.?(?:[-./, ]+(\d{2}|\d{4}))?$/i.exec(s)) && (mi = monthOf(m[3])) !== undefined)
      out = { d1: +m[1], d2: m[2] ? +m[2] : +m[1], m: mi, y: yr(m[4]) };
    else if ((m = /^([A-Za-z]{3,9})\.? (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{2}|\d{4}))?$/i.exec(s)) && (mi = monthOf(m[1])) !== undefined)
      out = { d1: +m[2], d2: +m[2], m: mi, y: yr(m[3]) };
    else if ((m = /^([A-Za-z]{3,9})\.?[-./, ]+(\d{4})$/i.exec(s)) && (mi = monthOf(m[1])) !== undefined)
      out = { d1: 1, d2: 31, m: mi, y: +m[2] };
    else if ((m = /^(\d{1,2})[-./](\d{1,2})(?:[-./](\d{2}|\d{4}))?$/.exec(s)) && +m[2] >= 1 && +m[2] <= 12)
      out = { d1: +m[1], d2: +m[1], m: +m[2] - 1, y: yr(m[3]) };
    return out && out.d1 >= 1 && out.d1 <= out.d2 && out.d2 <= 31 ? out : null;
  }
  function huntKeys(task, doc) {
    var cols = doc.columns || [], k = task.keys || {};
    function find(pred) { var c = cols.filter(pred)[0]; return c ? c.key : null; }
    return {
      date: k.date || find(function (c) { return c.format === 'date' || /date/i.test(c.key); }),
      amount: k.amount || find(function (c) { return c.format === 'inr' || c.format === 'amount' || /amount|amt/i.test(c.key); }),
      party: k.party || find(function (c) { return /party|vendor|payee|name/i.test(c.key); }),
      text: k.text || find(function (c) { return /narration|particular|desc|remark/i.test(c.key); }),
      ref: k.ref || find(function (c) { return /vch|voucher|ref|no$/i.test(c.key); }),
      // for-1 round 1: `keys.bill` names the column of bill or document numbers, shown in the review's row heads, the
      // model answer and the work sample (a duplicate or a round sum is read off that column)
      bill: k.bill || null
    };
  }
  // the row's bill or reference as the review, model answer and work sample print it ("no bill / ref" when empty)
  function huntBill(doc, keys, row) {
    if (!keys.bill || !row) return '';
    var v = row[keys.bill];
    if (v !== undefined && v !== null && v !== '') return String(v);
    var col = (doc.columns || []).filter(function (c) { return c.key === keys.bill; })[0];
    return 'no ' + String(col ? col.label || col.key : keys.bill).toLowerCase();
  }
  // the columns the rows mostly fill (more than half): an empty cell in one is said at its place in the row's line
  // ("no bill / ref") and found by those words
  function huntFilled(doc) {
    var dataRows = (doc.rows || []).filter(function (r) { return !r._class || r._class === 'data'; }), filled = {};
    (doc.columns || []).forEach(function (c) { filled[c.key] = dataRows.filter(function (r) { var v = r[c.key]; return v !== undefined && v !== null && v !== ''; }).length * 2 > dataRows.length; });
    return filled;
  }
  // for-1 round 1: the four tests are one at a time; these are their toggles
  var HUNT_TESTS = ['weekend', 'round', 'dups', 'match'];
  // the filters that narrow the list, named for an empty view ("No rows match Duplicates and the search “02-10-2026”")
  function huntFilterNames(task, hs) {
    var out = [];
    if (hs.weekend) out.push('Weekend');
    if (hs.round) out.push('Round sums');
    if (hs.dups) out.push('Duplicates');
    if (hs.party) out.push('payments to ' + hs.party);
    if (hs.flagged) out.push('Flagged');
    if (hs.q && hs.q.trim()) out.push('the search “' + hs.q.trim() + '”');
    return out;
  }
  function norm(v) { return String(v === undefined || v === null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function huntState(task) { var k = task.id; if (!app.ui.hunt[k]) app.ui.hunt[k] = { q: '', sort: 'orig', weekend: false, round: false, dups: false, flagged: false, match: false, limit: 60, pop: null, party: null }; return app.ui.hunt[k]; }
  function matchPairs(lv, task) {
    var mw = task.matchWith;
    if (!mw) return [];
    var L = E.findDoc(lv, mw.left), R = E.findDoc(lv, mw.right);
    if (!L || !R) return [];
    var out = [];
    (L.rows || []).forEach(function (lr) {
      (R.rows || []).forEach(function (rr) {
        var on = (mw.keys || []).filter(function (k) { var a = norm(lr[k.left]), b = norm(rr[k.right]); return a && a === b; });
        if (on.length) out.push({ left: lr, right: rr, on: on });
      });
    });
    return out;
  }
  function huntRows(lv, task, doc, hs, flags) {
    var keys = huntKeys(task, doc);
    var rows = (doc.rows || []).filter(function (r) { return !r._class || r._class === 'data'; }).map(function (r, i) { return { r: r, i: i }; });
    var q = hs.q.trim().toLowerCase();
    // for-1 round 1: a figure is found as the screen prints it ("1,56,609.60", "₹60,000" as well as "156609.6"): a number
    // cell is searched in its shown form too and, when the search holds a digit, with ₹, commas and spaces taken out of both
    // for-1 round 2: a search typed as a date also finds the rows of that day (sd, parseSearchDate); with a digit in it, a
    // text cell is compared with spaces, "/", "-" and "." taken out of both (qs: "KEO1184" and "keo 1184" find KEO/1184
    // and KEO-1184, the way Manav's duplicate rule reads bills; never the date column, whose figures would run together);
    // and the words a row's line adds are found too ("by apexec02", "no bill / ref")
    if (q) {
      var qd = /\d/.test(q) ? q.replace(/[₹,\s]/g, '') : null, fmt = {};
      // (a search read as a date skips the bill comparison: "2.10" is 2 October, not every voucher holding "210")
      var SEP = /[\s\/\-.–]/g, sd = keys.date ? parseSearchDate(q) : null, qs = qd !== null && !sd ? q.replace(SEP, '') : null;
      if (qs === '') qs = null;
      var cols = doc.columns || [], filled = huntFilled(doc), ml = task.metaLabels || {};
      cols.forEach(function (c) { fmt[c.key] = c.format; });
      rows = rows.filter(function (x) {
        if (sd) {
          var dt = parseDate(x.r[keys.date]);
          if (dt && dt.getMonth() === sd.m && dt.getDate() >= sd.d1 && dt.getDate() <= sd.d2 && (sd.y === null || dt.getFullYear() === sd.y)) return true;
        }
        var hit = Object.keys(x.r).some(function (k) {
          if (k.charAt(0) === '_') return false;
          var v = x.r[k];
          if (String(v).toLowerCase().indexOf(q) >= 0) return true;
          if (typeof v !== 'number') return qs !== null && k !== keys.date && String(v).toLowerCase().replace(SEP, '').indexOf(qs) >= 0;
          var shown = (k === keys.amount ? E.formatINR(v, { decimals: 2 }) : E.formatValue(v, fmt[k])).toLowerCase();
          return shown.indexOf(q) >= 0 || (qd !== null && shown.replace(/[₹,\s]/g, '').indexOf(qd) >= 0);
        });
        return hit || cols.some(function (c) {
          var v = x.r[c.key], empty = v === undefined || v === null || v === '';
          if (empty) return filled[c.key] && ('no ' + String(c.label || c.key).toLowerCase()).indexOf(q) >= 0;
          return !!ml[c.key] && (String(ml[c.key]) + ' ' + String(v)).toLowerCase().indexOf(q) >= 0;
        });
      });
    }
    if (hs.weekend && keys.date) rows = rows.filter(function (x) { var d = parseDate(x.r[keys.date]); return d && (d.getDay() === 0 || d.getDay() === 6); });
    var roundTo = task.roundTo || 1000;
    if (hs.round && keys.amount) rows = rows.filter(function (x) { var v = x.r[keys.amount]; return typeof v === 'number' && v !== 0 && Math.abs(v) % roundTo === 0; });
    if (hs.flagged) rows = rows.filter(function (x) { return flags[x.r[task.rowKey || '_id']] !== undefined; });
    if (hs.party && keys.party) rows = rows.filter(function (x) { return norm(x.r[keys.party]) === norm(hs.party); });
    var groups = null;
    if (hs.dups) {
      var dk = task.dupKeys || [keys.party, keys.amount].filter(Boolean), byK = {};
      rows.forEach(function (x) { var k = dk.map(function (c) { return norm(x.r[c]); }).join('|'); (byK[k] = byK[k] || []).push(x); });
      groups = Object.keys(byK).filter(function (k) { return byK[k].length > 1; }).map(function (k) { return byK[k]; });
      rows = groups.reduce(function (a, g) { return a.concat(g); }, []);
    }
    if (!groups) {
      if (hs.sort === 'amount' && keys.amount) rows.sort(function (a, b) { return (b.r[keys.amount] || 0) - (a.r[keys.amount] || 0); });
      else if (hs.sort === 'party' && keys.party) rows.sort(function (a, b) { return String(a.r[keys.party]).localeCompare(String(b.r[keys.party])); });
      else if (hs.sort === 'date' && keys.date) rows.sort(function (a, b) { var x = parseDate(a.r[keys.date]), y = parseDate(b.r[keys.date]); return (x ? x.getTime() : 0) - (y ? y.getTime() : 0); });
    }
    return { rows: rows, groups: groups, keys: keys };
  }
  function huntTask(lv, task, a) {
    var doc = E.findDoc(lv, task.dataset);
    if (!doc) return '';
    var hs = huntState(task), flags = E.huntFlags(a), tools = task.tools || ['search', 'sort', 'weekend', 'round', 'duplicates', 'match'];
    var nFlags = Object.keys(flags).length;
    var toolbar = '<div class="hunt-tools">' + (tools.indexOf('search') >= 0 ? '<label class="search">' + SVG.search + '<span class="vh">Search the register</span><input type="search" id="hunt-q-' + esc(task.id) + '" value="' + esc(hs.q) + '" placeholder="Party, date, amount or bill" data-hunt-q="' + esc(task.id) + '" autocomplete="off" enterkeyhint="search"></label>' : '') +
      '<div class="hunt-row2">' + (tools.indexOf('sort') >= 0 ? '<label class="vh" for="hsort">Sort</label><select id="hsort" class="select" data-hunt-sort="' + esc(task.id) + '"' + (hs.dups ? ' disabled' : '') + '>' +
        [['orig', 'As exported'], ['date', 'Date'], ['amount', 'Amount, high to low'], ['party', 'Party, A to Z']].map(function (o) { return '<option value="' + o[0] + '"' + (hs.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>' : '') +
      (tools.indexOf('weekend') >= 0 ? toggle(task, 'weekend', 'Weekend') : '') + (tools.indexOf('round') >= 0 ? toggle(task, 'round', 'Round sums') : '') +
      (tools.indexOf('duplicates') >= 0 ? toggle(task, 'dups', 'Duplicates') : '') + (tools.indexOf('match') >= 0 && task.matchWith ? toggle(task, 'match', task.matchWith.label || 'Match') : '') +
      toggle(task, 'flagged', 'Flagged (' + nFlags + ')') + '</div></div>';
    return toolbar + '<div id="hunt-res-' + esc(task.id) + '">' + huntResults(lv, task, a) + '</div>';
  }
  function huntResults(lv, task, a) {
    var doc = E.findDoc(lv, task.dataset);
    if (!doc) return '';
    var hs = huntState(task), flags = E.huntFlags(a);
    var res = huntRows(lv, task, doc, hs, flags), keys = res.keys;
    var dataRows = (doc.rows || []).filter(function (r) { return !r._class || r._class === 'data'; }), total = dataRows.length;
    var nFlags = Object.keys(flags).length;
    // a column the rows mostly fill (more than half): an empty cell in it is said at its place in the row's line
    var filled = huntFilled(doc);
    var matchHtml = '';
    if (hs.match && task.matchWith) {
      var pairs = matchPairs(lv, task), mw = task.matchWith;
      // for-1: one vendor matching two employees (a salary account, a home address) is one entry with one button, not
      // two identical "Show payments to" buttons
      var mgroups = [], byParty = {};
      pairs.forEach(function (p) {
        var pv = mw.link ? p.left[mw.link.left || 'name'] : p.left[mw.leftName || 'name'];
        if (!byParty[pv]) { byParty[pv] = { party: pv, pairs: [] }; mgroups.push(byParty[pv]); }
        byParty[pv].pairs.push(p);
      });
      matchHtml = '<div class="workpaper match-panel"><h3>' + esc(mw.title || 'Matches between the two masters') + '</h3>' + (mgroups.length ? '<ul>' + mgroups.map(function (g) {
        return '<li>' + g.pairs.map(function (p) {
          var ln = p.left[mw.leftName || 'name'], rn = p.right[mw.rightName || 'name'];
          return '<div><b>' + esc(ln) + '</b> and <b>' + esc(rn) + '</b>: same ' + esc(p.on.map(function (k) { return k.label || k.left; }).join(', ')) + '</div>';
        }).join('') +
          '<div><button class="btn btn-secondary btn-sm" data-act="hunt-party" data-task="' + esc(task.id) + '" data-val="' + esc(g.party) + '">Show payments to ' + esc(g.party) + '</button></div></li>';
      }).join('') + '</ul>' : '<p class="meta">No matches.</p>') + '</div>';
    }
    var shown = res.rows.slice(0, hs.limit);
    var rk = task.rowKey || '_id';
    function rowHtml(x) {
      var r = x.r, id = r[rk], fl = flags[id];
      var d = keys.date ? parseDate(r[keys.date]) : null, wd = d ? WEEKDAY[d.getDay()] : '';
      var amt = keys.amount && typeof r[keys.amount] === 'number' ? E.formatINR(r[keys.amount], { decimals: 2 }) : '';
      // for-1: each of the row's other columns holds together (a bill "UFPL/26-27/1652" broke after "26-" and a date
      // "05-08" after "05-" on a phone), a short one whole and a long one at its spaces only; the middot is held to the
      // piece before it, so no line opens with "·"
      var more = (doc.columns || []).filter(function (c) { return [keys.date, keys.amount, keys.party].indexOf(c.key) < 0; })
        .map(function (c) {
          // for-1 round 1: an empty cell in a mostly filled column says so ("no bill / ref": the round-sum rule turns on
          // that empty column), and a task's `metaLabels` names a cell ("by apexec02": a person, not the bank feed)
          var v = r[c.key], ml = task.metaLabels && task.metaLabels[c.key];
          if (v === undefined || v === null || v === '') return filled[c.key] ? 'no ' + String(c.label || c.key).toLowerCase() : '';
          var sv = typeof v === 'number' ? E.formatValue(v, c.format) : String(v);
          return ml ? ml + ' ' + sv : sv;
        }).filter(Boolean)
        .map(function (s) {
          return s.length <= 22 ? '<span class="nw">' + esc(s) + '</span>'
            // dt-2 round 4: a word with an en dash is held too ("Cash management service charges, Apr–" / "Jun 2026" in
            // for-1's ledger at 390, found by play's month-range check)
            : s.split(' ').map(function (w) { return /[\/\-–]/.test(w) ? '<span class="nw">' + esc(w) + '</span>' : esc(w); }).join(' ');
        }).join('&nbsp;· ');
      var pop = '';
      if (hs.pop === String(id)) {
        pop = '<div class="reason-pop" role="group" aria-label="Why flag this row"><p class="f-label">Why are you flagging it?</p><div class="opts">' + (task.reasons || []).map(function (rs) {
          return '<button class="btn btn-secondary btn-block" data-act="hunt-flag" data-task="' + esc(task.id) + '" data-row="' + esc(id) + '" data-val="' + esc(rs.id) + '"' + (fl === rs.id ? ' aria-pressed="true" style="border-color:#06152F;background:#06152F;color:#fff"' : '') + '>' + esc(rs.label) + '</button>';
        }).join('') + '</div><div class="btn-row" style="margin-top:8px">' + (fl ? '<button class="btn btn-quiet" data-act="hunt-unflag" data-task="' + esc(task.id) + '" data-row="' + esc(id) + '">Remove flag</button>' : '') +
          '<button class="btn btn-quiet" data-act="hunt-pop" data-task="' + esc(task.id) + '" data-row="">Cancel</button></div></div>';
      }
      var reason = fl ? (task.reasons || []).filter(function (rs) { return rs.id === fl; })[0] : null;
      return '<li class="hrow' + (fl ? ' flagged' : '') + '" data-row="' + esc(id) + '"><div class="h-main"><div class="h-top">' +
        (keys.date ? '<span class="h-date">' + esc(r[keys.date]) + '</span><span class="h-day' + (wd === 'Sat' || wd === 'Sun' ? ' we' : '') + '">' + wd + '</span>' : '') +
        (keys.party ? '<span class="h-party">' + esc(r[keys.party]) + '</span>' : '') + '</div>' + (more ? '<div class="h-more">' + more + '</div>' : '') + '</div>' +
        '<div class="h-act"><span class="h-amt">' + esc(amt) + '</span><button class="flag-btn' + (fl ? ' on' : '') + '" data-act="hunt-pop" data-task="' + esc(task.id) + '" data-row="' + esc(id) + '" aria-expanded="' + (hs.pop === String(id)) + '">' + SVG.flag + esc(reason ? (reason.short || reason.label) : 'Flag') + '</button></div>' + pop + '</li>';
    }
    var list;
    if (res.groups) {
      var used = 0;
      list = res.groups.map(function (g) {
        if (used >= hs.limit) return '';
        used += g.length;
        return '<li class="dup-head">Same ' + esc((task.dupLabel || 'party and amount')) + ': ' + g.length + ' entries</li>' + g.map(rowHtml).join('');
      }).join('');
    } else list = shown.map(rowHtml).join('');
    // for-1 round 1: the vendor picked from the match panel is a line of its own (no "·" left at a line's end); an empty
    // view names every filter that is on, with one button that clears them all; a long list ends with a way back up to
    // the tests (the toolbar is not sticky)
    var on = huntFilterNames(task, hs);
    var empty = on.length ? '<li class="hrow hunt-empty"><span class="meta">No rows match ' + esc(on.join(' and ')) + '.</span><button class="btn btn-secondary btn-sm" data-act="hunt-clear" data-task="' + esc(task.id) + '">Clear filters</button></li>'
      : '<li class="hrow"><span class="meta">No rows match.</span></li>';
    var shownN = Math.min(res.rows.length, hs.limit);
    // for-1 round 2: a filter row, the vendor's name on the left (wrapping in its own box) and "Show all" on the right, so
    // no separator is left at a line's end ("Supplies ·") or start ("· show all") at any width
    return matchHtml + (hs.party ? '<p class="hunt-party"><span>Payments to ' + esc(hs.party) + '</span><button class="link-btn" data-act="hunt-party" data-task="' + esc(task.id) + '" data-val="" aria-label="Show all payments">Show all</button></p>' : '') +
      '<p class="hunt-count" aria-live="polite">Showing ' + shownN + ' of ' + res.rows.length + (res.rows.length !== total ? ' (' + total + ' in all)' : '') + ' · ' + nFlags + ' flagged</p>' +
      '<ul class="hunt-list">' + (list || empty) + '</ul>' +
      (res.rows.length > hs.limit ? '<button class="btn btn-secondary more-btn" data-act="hunt-more" data-task="' + esc(task.id) + '">Show ' + Math.min(60, res.rows.length - hs.limit) + ' more</button>' : '') +
      (shownN > 8 ? '<p class="hunt-foot"><button class="link-btn" data-act="hunt-top" data-task="' + esc(task.id) + '">Back to the tests</button></p>' : '');
  }
  // a box opened under the finger is scrolled up until it clears the sticky bar at the foot (never past the top bar)
  function revealAboveBar(el) {
    var r = el.getBoundingClientRect(), topH = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top'), 10) || 60;
    var bar = $('#ibar') || $('.actionbar'), bottom = window.innerHeight;
    if (bar) { var br = bar.getBoundingClientRect(); if (br.top < bottom && br.bottom > 0) bottom = br.top; }
    var dy = r.bottom + 8 - bottom;
    if (dy > 0) window.scrollBy(0, Math.min(dy, Math.max(0, r.top - topH - 8)));
  }
  function focusFlag(id) {
    var fb = $('.hrow[data-row="' + CSS.escape(id) + '"] .flag-btn');
    if (fb) { try { fb.focus({ preventScroll: true }); } catch (e) { fb.focus(); } }
  }
  function toggle(task, key, label) {
    var hs = huntState(task);
    return '<button class="toggle" data-act="hunt-toggle" data-task="' + esc(task.id) + '" data-val="' + key + '" aria-pressed="' + !!hs[key] + '">' + esc(label) + '</button>';
  }

  /* ------------------------------------------------------------------ review */
  function reviewData(lv) {
    var st = ls(lv.id);
    if (!st) return null;
    if (st.attempt && st.attempt.submittedAt && st.attempt.result) return { answers: st.attempt.answers || {}, result: st.attempt.result, n: st.attempt.n, latest: true };
    if (st.best) {
      var ans = E.bestAnswers(st);
      if (ans) return { answers: ans, result: st.best, n: st.best.n, latest: false };
    }
    return null;
  }
  function scoreLine(task, r) {
    if (task.type === 'order') return r.inOrder ? 'In the right order' : r.right + ' of ' + r.of + ' in sequence';
    if (task.type === 'hunt') return r.right + ' of ' + r.of + ' found' + (r.wrong ? '\u00a0· ' + r.wrong + ' wrong ' + plural(r.wrong, 'flag', 'flags') : '');
    // method marks (a cell's `follow`): a figure worked right from the student's own wrong one is said apart from the right ones
    if (task.type === 'worksheet') return r.right + ' of ' + r.of + ' right' + (r.followed ? '\u00a0· ' + r.followed + ' ' + plural(r.followed, 'follows', 'follow') + ' your figures' : '');
    if (task.type === 'compose') return r.right + ' of ' + r.of + ' ' + E.nounFor(task)[1] + ' right';
    return r.right + ' of ' + r.of + ' right';
  }
  function reviewScreen(lv, m, r) {
    var rd = reviewData(lv);
    if (!rd) { setTimeout(function () { go('#/l/' + lv.id, true); }, 0); return null; }
    setTitle('Review · ' + display(m));
    var st = ls(lv.id), res = rd.result, scored = E.scoreLevel(lv, rd.answers);
    var reviewer = person((lv.wrap && lv.wrap.from) || (lv.brief && lv.brief.from), lv);
    // a level with passNeeds can fail at 50% or more: say which work fell short (e.g. the bill calls)
    var shortIds = res.passed ? [] : E.passNeedsShort(lv, scored).map(function (p) { return p.task; });
    var retryText = COPY.notPassed;
    if (shortIds.length && scored.accuracy + 1e-9 >= 0.5) {
      var need = (lv.passNeeds || []).filter(function (p) { return p.task === shortIds[0]; })[0] || {};
      var ti0 = (lv.tasks || []).map(function (t) { return t.id; }).indexOf(shortIds[0]);
      retryText = (need.note || ('Task ' + (ti0 + 1) + ' needs more right before this level passes.')) + ' ' + COPY.notPassed;
    }
    var head = '<section class="card result" aria-label="Your result">' + stars(res.stars, 'big') +
      '<div class="r-pass">' + (res.passed ? 'Passed' : 'Not passed yet') + '</div><div class="r-acc">' + E.pctShown(res.accuracy) + '% right</div>' +
      (res.hints ? '<div class="r-hints">' + res.hints + ' ' + plural(res.hints, 'hint', 'hints') + ' used' + hintCost(res) + '</div>' : '') +
      '<ul class="r-tasks">' + (lv.tasks || []).map(function (t) { var tr = scored.tasks[t.id]; return '<li><span>' + escTitle(t.title) + '</span><b>' + esc(scoreLine(t, tr)) + '</b></li>'; }).join('') + '</ul>' +
      (res.passed && st && st.best && st.best.passed ? '<a class="btn btn-primary btn-block r-jump" href="#/l/' + esc(lv.id) + '/done">See your CV line' + SVG.down + '</a>'
        : '<p class="r-retry">' + esc(retryText) + '</p><button class="btn btn-primary btn-block" data-act="try-again">Try again</button>') + '</section>';
    // the closing note: wrap on a pass at 90% and above with every composed text right; wrapPartial on any other pass
    // (when the level has one); wrapRetry on a fail
    var wn = E.wrapFor(lv, res, scored);
    var wrapWho = wn ? person(wn.from || (lv.wrap && lv.wrap.from) || (lv.brief && lv.brief.from), lv) : reviewer;
    var wrap = wn ? '<section class="wa" aria-label="Note from ' + esc(wrapWho.name) + '"><div class="wa-head">' + avatar(wrapWho) + '<div class="who"><b>' + esc(wrapWho.name) + '</b><span>' + esc(wrapWho.roleShort || wrapWho.role) + '</span></div></div><div class="wa-body"><div class="bub">' + escText(wn.text) + '</div></div></section>' : '';
    var tasksHtml = (lv.tasks || []).map(function (t, i) { return taskReview(lv, t, i, rd.answers[t.id], scored.tasks[t.id], reviewer, !res.passed); }).join('');
    var principles = (lv.principles || []).length ? '<div class="sticky blue"><span class="s-label">Principles</span><ul class="pen-list">' + lv.principles.map(function (p) { return '<li>' + escText(p) + '</li>'; }).join('') + '</ul></div>' : '';
    var earlier = !res.passed && st && st.best && st.best.passed ? '<p class="meta">Your earlier pass still stands: ' + stars(st.best.stars) + ' Its line is in <a href="#/cv">My CV lines</a>.</p>' : '';
    var after = res.passed ? doneSection(lv, m, st) : '<section class="card retry-box"><p>' + esc(retryText) + '</p>' + earlier + '<button class="btn btn-primary" data-act="try-again">Try again</button></section>';
    var retry3 = res.passed && res.stars < 3 && rd.latest ? '<p class="meta" style="text-align:center;margin-top:10px">Want all three stars? <button class="link-btn" data-act="try-again">Try again</button></p>' : '';
    return '<div class="page">' + crumb('#/l/' + esc(lv.id), 'Case file') + '<h1 class="screen-title" data-focus>Review</h1>' + head + retry3 + wrap + tasksHtml +
      modelSection(lv, !res.passed) + principles + after + '</div>';
  }
  function fieldAnswerText(f, v, short) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return f.kind === 'multi' ? 'none' : 'not answered';
    if (f.kind === 'choice') return optLabel(f, v, short);
    if (f.kind === 'multi') return v.map(function (x) { return optLabel(f, x, short); }).join(', ');
    if (f.kind === 'number') {
      // the field's prefix (₹) is said back with the figure, after any minus: "₹1,40,000", "−₹2,500"; rupees print
      // whole or with two paise digits, never one ("₹18,974.40")
      // sa-2 r1b: the unit stays on the figure's line (a no-break space: "Answer: 3,400" / "nos" split on a phone)
      var n = E.parseNumber(v);
      // sa-6 round 1: text that is no figure is said back as typed, without the box's unit ("5 April April" read as a
      // contradiction beside "Answer: 5 April")
      if (n === null) return 'not a number: ' + String(v);
      var body = f.prefix === '₹' ? E.formatINR(Math.abs(n), { symbol: false }) : E.formatNumber(Math.abs(n), 'auto', 3);
      return (n < 0 && /[1-9]/.test(body) ? '−' : '') + (f.prefix || '') + body + (f.unit ? '\u00a0' + f.unit : '');
    }
    return String(v);
  }
  // acc-1 round 1 (designer S3, editor S10): a field may carry `lead` ("Dr", "Cr"), said before its answer wherever the
  // answers are joined into one line with no labels (the all-right review line, the model key, the work sample's
  // detail), so a journal entry says which account is debited ("Dr Bank charges · Cr Satpura Bank – current account");
  // a labelled line ("Debit: …") keeps its label, and a field without one is said as before
  function leadText(f, s) { return f && typeof f.lead === 'string' && f.lead ? f.lead + ' ' + s : s; }
  // The student's answer said back field by field: what they got wrong; a partly right reason list split into the
  // right picks, the wrong ones ("Not this:") and the missed ones; what they flagged that the key does not have (a
  // reason on a bill that was fine); then what they got right. A short wrong word or year ("Exception", "2026–27") is
  // struck through; a wrong number and a long label are red, never struck (a strike hides a minus sign, and a struck
  // sentence is hard to read on a phone).
  // dt-2 r2: a signed rupee figure said back holds its sign (escNum: "· −" / "₹720" on a phone read as positive)
  function wrongSpan(txt, numeric, max) {
    return '<span class="' + (numeric || txt.length > (max || 24) ? 'you-long' : 'you wrong') + '">' + (numeric ? escNum(txt) : esc(txt)) + '</span>';
  }
  // dt-2 round 5 (designer optional 3): one look per field. A choice field whose every option is 30 characters or fewer
  // strikes any wrong pick, so one list never shows one call struck and the same field's other call in red (dt-2's
  // task 2: "~~Ask the deductor~~" on Lothal, "Tamhini corrects its books" in red on Vayuvega, only because the second
  // is 26 characters). A field with a longer option, a multi field and a figure keep the 24-character rule
  function strikeMax(f) {
    return f.kind === 'choice' && f.options && f.options.length && f.options.every(function (o) { return String(o.label || '').length <= 30; }) ? 30 : 24;
  }
  function youSpan(f, v) {
    if (E.isEmpty(v)) return '<span class="you none">' + esc(fieldAnswerText(f, v)) + '</span>';
    return wrongSpan(fieldAnswerText(f, v), f.kind === 'number', strikeMax(f));
  }
  // sa-2 r2: a short label said back ("Nothing else", "Slow-moving", "Count tag wrong") reads as one unit, so a review
  // line breaks only between its parts (" · ", "; "), never inside one ("Nothing" / "else" on a phone); escNum keeps a
  // signed ₹ figure whole as before, and a longer label still wraps
  // dt-3 round 2: but never inside an en-dash year or range (escText's rule): "Bonus register for FY 2025–" / "26" in a
  // review's "Answer:" line on a desktop
  function holdShort(s) { var h = escNum(s); return String(s).length <= 18 ? '<span class="nw">' + h + '</span>' : h.replace(/(^|[^\w>₹.,–-])(\d(?:[\d,.]*\d)?–\d(?:[\d,.]*\d)?%?)(?![\w%–])/g, '$1<span class="nw">$2</span>'); }
  function sayLabel(l) { return String(l == null ? '' : l).replace(/\?\s*$/, ''); }
  // ba-1 round 1 (designer S4): when any line is wrong, every field is said back in the task's field order with its
  // label, a right one in ink where it falls ("What decides it: Oldest instalment not fully paid"), never in a trailing
  // unlabelled "Right:" line that read as "the right answer is"; what the student answered that the key does not need
  // comes straight after the call's line: a reason flagged (a multi field) stays red ("You flagged:", sa-1's meaning),
  // a pick or a figure the call did not need is in pencil under one lead ("Not needed for Standard: SMA-0 · 22 days"),
  // since a right observation under a wrong call is not a mistake. All right: the one-line "Your call:" as before.
  function itemAnswerHtml(task, it, ia) {
    var rv = E.itemReview(task, it, ia || {});
    var rights = [], pairs = [], lines = [], wrongN = 0, gate = gateField(task), gateAt = -1;
    rv.fields.forEach(function (r) {
      var f = E.findField(task, r.id);
      // gst-2 round 1: a field label holds its codes ("On the way to Chakan’s GSTR-1s") wherever it is printed
      // dt-3 round 1: a label asked as a question loses its "?" before the colon ("In the appeal set?:")
      // sa-6 round 4 (designer optional 1): the main call is said "Your call:" on every row of a review, as the all-right
      // line says it; a partly right row printed its field label, so one list read "Your call: Differs · Money in transit"
      // two rows under "Where it stands: Differs" (the other fields keep their labels)
      var k = '<span class="k">' + (gate && r.id === gate.id ? 'Your call' : escLabel(sayLabel(f.label))) + ':</span> ';
      if (gate && r.id === gate.id) gateAt = lines.length;
      if (r.state === 'right') {
        rights.push(leadText(f, fieldAnswerText(f, r.expected)));
        // mat-1 round 1 (designer S3): with no main call, each answer is said with its question's short name, so a bare
        // "No" says what it answers ("Promoter tax: No · Cost comes off: No")
        pairs.push('<span class="k">' + escLabel(f.short || sayLabel(f.label)) + ':</span> ' + holdShort(fieldAnswerText(f, r.expected, true)));
        lines.push(k + '<span class="you-ok">' + holdShort(fieldAnswerText(f, r.expected)) + '</span>');
        return;
      }
      wrongN++;
      if (r.state === 'partial' && r.picks) {
        var lab = function (pk) { return optLabel(f, pk.id); };
        var ok = r.picks.filter(function (pk) { return pk.ok; }), bad = r.picks.filter(function (pk) { return !pk.ok && !pk.missed; }), miss = r.picks.filter(function (pk) { return pk.missed; });
        lines.push(k + '<span class="you-ok">' + ok.map(lab).map(holdShort).join('; ') + '</span>' +
          (bad.length ? '<br><span class="k">Not this:</span> <span class="you-long">' + bad.map(lab).map(holdShort).join('; ') + '</span>' : '') +
          (miss.length ? '<br><span class="k">Missed:</span> <span class="right">' + miss.map(lab).map(holdShort).join('; ') + '</span>' : ''));
      } else if (E.isEmpty(r.given) && !E.fieldVisible(f, ia || {})) {
        // a question the student's own call kept hidden is not "not answered" (gst-1: "Where in Chakan’s October
        // GSTR-1: not answered" in red after a wrong return); only the right answer is said
        // dt-3 round 2 (editor): a hidden pick list too, so two hidden fields read alike ("Amount in dispute: Answer:
        // ₹9,60,000" sat over "Papers that prove it: none Answer: Computation …" after a wrong "Agree")
        // dt-1 r2: "Answer:" stays with its figure (a no-break space; "₹78,35,000 Answer:" / "₹23,75,000" on a phone)
        lines.push(k + '<span class="k">Answer:</span>&nbsp;<span class="right">' + holdShort(fieldAnswerText(f, r.expected)) + '</span>');
      } else lines.push(k + youSpan(f, r.given) + ' <span class="k">Answer:</span>&nbsp;<span class="right">' + holdShort(fieldAnswerText(f, r.expected)) + '</span>');
    });
    // dt-3 round 1: a field may name its own extra line (`extraLabel`: "Papers you picked" for proof papers, which the
    // student picked rather than flagged); a multi field without one keeps "You flagged" (sa-1's reasons on a fine bill)
    var extras = [], quiet = [];
    rv.extra.forEach(function (x) {
      var f = E.findField(task, x.id);
      if (f.kind === 'multi' || f.extraLabel) {
        var xl = f.extraLabel || (f.kind === 'multi' ? 'You flagged' : sayLabel(f.label));
        extras.push('<span class="k">' + escLabel(xl) + ':</span> <span class="you-long">' + (f.kind === 'multi' ? arr(x.given).map(function (id) { return holdShort(optLabel(f, id)); }).join('; ') : holdShort(fieldAnswerText(f, x.given))) + '</span>');
      // acc-1 round 2 (designer S3): the pencil line is a joined summary too, so a field's lead is said there as well
      // ("Not needed for No entry: Dr Salaries and wages · Cr Salary payable · ₹3,96,000")
      } else quiet.push(holdShort(leadText(f, fieldAnswerText(f, x.given))));
    });
    if (quiet.length) {
      var gr = gate && rv.fields.filter(function (r) { return r.id === gate.id && r.state !== 'right'; })[0];
      extras.push('<span class="k">Not needed' + (gr ? ' for ' + holdShort(fieldAnswerText(gate, gr.expected)) : '') + ':</span> <span class="you-extra">' + quiet.join('&nbsp;· ') + '</span>');
    }
    if (extras.length) { var at = gateAt >= 0 ? gateAt + 1 : lines.length; lines.splice.apply(lines, [at, 0].concat(extras)); }
    var html = !wrongN && !extras.length ? (gate ? '<p class="ans"><span class="k">Your call:</span> ' + rights.map(holdShort).join('&nbsp;· ') + '</p>' : '<p class="ans">' + pairs.join('&nbsp;· ') + '</p>')
      : '<p class="ans">' + lines.join('<br>') + '</p>';
    // dt-1 round 9 (designer S1): the student's own note gets escText's holds, as the work sample prints it, so a typed
    // "22 Dec" or "KP/26-27/1187" never splits at a line end on the review ("…to one shop on 22" / "Dec, paid in cash.")
    (task.fields || []).filter(function (f) { return f.kind === 'text' && ia && ia[f.id]; }).forEach(function (f) {
      html += '<p class="ans"><span class="k">Your note:</span> <em>' + escText(ia[f.id]) + '</em></p>';
    });
    return html;
  }
  function mark(ok, partial) {
    return '<img class="mk" src="img/doodles/' + (ok ? 'tick' : 'cross') + '.svg" alt="' + (ok ? 'Right' : partial ? 'Partly right' : 'Not right') + '">';
  }
  // val-1 r2: a worksheet row's mark and its "2 of 3 right" label. One meaning per tick (sa-2): a row that earns every
  // mark with a cell that only follows the student's own figures is not "Right"; it gets the tick's shape in Day 1 ink,
  // said as "Follows your figures". The label counts right cells only, so two right and one follow says "2 of 3 right"
  function wsRowMark(okN, earnN, n) {
    return earnN === n && okN < n ? '<span class="mk mk-follow" role="img" aria-label="Follows your figures"></span>' : mark(earnN === n, earnN > 0);
  }
  // ia-1 round 3 (designer optional 2): a review row's label and its orange tag ("Partly right", "2 of 3 right"). The
  // label is one box, so when the two do not fit on a line the tag moves under it whole and the label keeps its words:
  // "Purchase 7 · Lonand" / "Masala Partly right" at 390 px (the last word and the tag had no break between them)
  // now reads "Purchase 7 · Lonand Masala" / "Partly right". A row with no tag is as before
  function nLabel(html, tag) { return tag ? '<span class="n-lt">' + html + '</span>' + tag : html; }
  function wsRowPartial(okN, n) {
    return okN && okN < n ? '<span class="partial">' + okN + ' of ' + n + ' right</span>' : '';
  }
  function say(who, text) { return text ? '<p class="say"><span class="who">' + esc(who.first || who.name) + '</span>' + escText(text) + '</p>' : ''; }
  // what the hints cost, said where the stars are ("1 hint used · one star off"), so a 78% with one star explains itself
  function hintCost(res) {
    if (!res || !res.passed || !res.hints) return '';
    var off = Math.min(res.hints, E.band(res.accuracy || 0) - (res.stars || 0));
    return off > 0 ? '\u00a0· ' + (off === 1 ? 'one star' : off === 2 ? 'two stars' : off + ' stars') + ' off' : '';
  }
  // sa-4 round 2: a missed item that weighs more than one (the find the task is about) says so, so "6 of 7 right" beside
  // "86% right" reads as it should; nothing is said on a right item or on a level whose items all weigh one
  function weightLine(task, it, sc) {
    var w = E.itemWeight(it);
    if (sc.correct || !(w > 1)) return '';
    var times = { 2: 'twice', 3: 'three times', 4: 'four times', 5: 'five times', 6: 'six times' }[w] || E.formatNumber(w) + ' times';
    return '<p class="n-weight">This ' + esc(E.nounFor(task)[0]) + ' counts ' + times + ' in this task’s score.</p>';
  }
  // The order review. ia-1 round 1: the ticks follow the score (one longest run in sequence, E.lcsMembers), so "7 of 8
  // in sequence" shows seven ticks and the step out of place, marked; on a right order every step carries the senior's
  // note (the control and its evidence at each step). Round 2: on a wrong order a step out of place says where it goes
  // ("It goes at step 4."), and each note prints once, under "The right order" (the notes printed twice, one screen
  // apart: about 2,500 px of the same words on a phone); a tick holds to its step's last word.
  // holdTail: the last word of escaped text (a held span counts as one word) and what follows it sit in one no-wrap
  // span. A no-break space alone is not enough: Chrome still breaks before an inline image ("…into the ERP" / "✓").
  function holdTail(html, tail) {
    var cut = -1, inTag = false, depth = 0;
    for (var i = 0; i < html.length; i++) {
      var ch = html.charAt(i);
      if (ch === '<') { inTag = true; if (html.substr(i, 5) === '<span') depth++; else if (html.substr(i, 6) === '</span') depth--; }
      else if (ch === '>') inTag = false;
      else if (ch === ' ' && !inTag && depth === 0) cut = i;
    }
    return html.slice(0, cut + 1) + '<span class="nw">' + html.slice(cut + 1) + tail + '</span>';
  }
  function orderReview(task, r) {
    var byId = {}; (task.steps || []).forEach(function (s) { byId[s.id] = s; });
    var yours = r.order || [], answer = task.answer || [];
    // ia-1 round 5 (designer optional 1): a "run" of one step puts no two steps in sequence, so it is ticked only where it
    // sits at its own number; otherwise it is marked like the rest, with the step it goes at (a reversed walkthrough
    // ticked "① The bank pays Shikrapur …" with no "It goes at step 8"). The score line still counts it ("1 of 8").
    var run = E.lcsMembers(yours, answer);
    if (!r.inOrder && run.length === 1 && yours.indexOf(run[0]) !== answer.indexOf(run[0])) run = [];
    var inSeq = {}; run.forEach(function (id) { inSeq[id] = true; });
    var stepText = function (id) { return escText(byId[id] ? byId[id].text : id); };
    var stepNote = function (id) { return task.notes && task.notes[id] ? '<br><span class="meta">' + escText(task.notes[id]) + '</span>' : ''; };
    var tick = doodle('tick', '', 'In sequence').replace('<img ', '<img style="width:20px;height:18px;vertical-align:-3px" ');
    return '<div class="workpaper" style="padding:14px 16px"><p class="label">Your order</p><ol class="model-steps">' + yours.map(function (id) {
      if (inSeq[id]) return '<li>' + holdTail(stepText(id), '&nbsp;' + tick) + (r.inOrder ? stepNote(id) : '') + '</li>';
      var at = answer.indexOf(id) + 1;
      return '<li class="oop-step">' + stepText(id) + ' <span class="oop">Out of place</span>' + (at ? '<br><span class="meta">It goes at step ' + at + '.</span>' : '') + '</li>';
    }).join('') + '</ol>' + (!r.inOrder ? '<p class="label" style="margin-top:12px">The right order</p><ol class="model-steps">' + answer.map(function (id) {
      return '<li>' + stepText(id) + stepNote(id) + '</li>';
    }).join('') + '</ol>' : '') + '</div>';
  }
  function taskReview(lv, task, i, a, r, who, failed) {
    var head = '<div class="tr-head"><h2>' + escTitle(task.title) + '</h2><span class="tr-score">' + esc(scoreLine(task, r)) + '</span></div>';
    var body = '';
    if (task.type === 'items') {
      a = a || {};
      var key = lv.id + ':' + task.id;
      var missed = (task.items || []).filter(function (it) { return !r.items[it.id].correct; }).length;
      // ia-2 round 2: a list of more than 20 items with some missed opens on Missed (ia-2's 40 claims were about 22,600 px
      // of notes on a phone); "All 40" is one tap away, and a shorter list opens on All as before
      // sa-2 round 4 (designer optional 3): an attempt that did not pass opens on Missed too, so the misses come first
      // (sa-2's failed review was about 15,300 px at 390); the student's own pick still wins
      var f = app.ui.rfilter[key] || (((task.items || []).length > 20 || failed) && missed && missed < task.items.length ? 'missed' : 'all');
      var rows = (task.items || []).map(function (it) {
        var sc = r.items[it.id];
        if (f === 'missed' && sc.correct) return '';
        var ia = a[it.id] || {};
        var amt = itemSummary(task, it);
        return '<li class="nrow">' + mark(sc.correct, sc.score > 0) + '<div><div class="n-top"><span class="n-lbl">' + nLabel(escLabel(it.label), sc.score > 0 && !sc.correct ? '<span class="partial">Partly right</span>' : '') + '</span>' +
          (amt ? '<span class="n-amt">' + esc(amt) + '</span>' : '') + '</div>' + weightLine(task, it, sc) + itemAnswerHtml(task, it, ia) + say(who, it.note) + '</div></li>';
      }).join('');
      body = (missed && missed < (task.items || []).length ? '<div class="filters" role="group" aria-label="Show" style="margin:0 0 10px">' +
        '<button class="filter" data-act="rfilter" data-key="' + esc(key) + '" data-val="all" aria-pressed="' + (f === 'all') + '">All ' + task.items.length + '</button>' +
        '<button class="filter" data-act="rfilter" data-key="' + esc(key) + '" data-val="missed" aria-pressed="' + (f === 'missed') + '">Missed ' + missed + '</button></div>' : '') +
        '<div class="workpaper"><ul class="notes">' + rows + '</ul></div>';
    } else if (task.type === 'worksheet') {
      a = a || {};
      var cells = E.inputCells(task), byRow = {}, rowOrder = [];
      cells.forEach(function (cl) { if (!byRow[cl.row.id]) { byRow[cl.row.id] = []; rowOrder.push(cl.row.id); } byRow[cl.row.id].push(cl); });
      body = '<div class="workpaper"><ul class="notes">' + rowOrder.map(function (rid) {
        var list = byRow[rid], row = list[0].row;
        var rowLabel = String((row.cells || {})[(task.columns[0] || {}).key] || '');
        var okN = list.filter(function (cl) { return r.cells[cl.key]; }).length;
        var earnN = okN + list.filter(function (cl) { return r.follows && r.follows[cl.key]; }).length;
        // a wrong value is red, never struck (a strike hides a minus sign), then the answer; a column of changes
        // (signed) prints an increase with a plus, for the student's value and the answer alike. A figure that follows
        // the student's own wrong one (method marks) is in ink, marked so, then the right figure
        // gst-1 r3: "right figure" is one unit (a no-break space; "Follows your figures · right" / "figure ₹…" on a
        // phone read the line-end "right" as a verdict on the ticked row)
        var lines = list.map(function (cl) {
          var ok = r.cells[cl.key], fo = !ok && r.follows && r.follows[cl.key], given = a[cl.key], gv = E.parseNumber(given), fmt = cl.cell.format || cl.col.format;
          var sg = E.cellSigned(cl.col, cl.cell), empty = gv === null && !given;
          var you = gv === null ? (given ? String(given) : 'not answered') : E.formatCell(gv, fmt, sg);
          // a one-column table (val-1's DCF): the row label is the heading already, so no "₹ crore:" before each figure
          // acc-1 round 1 (editor and designer optionals): a column label's trailing "(₹)" is left off before a rupee
          // figure, which carries its own ₹ ("After the close: ₹33,49,000", not "After the close (₹): ₹33,49,000")
          var colLab = fmt === 'inr' ? String(cl.col.label).replace(/\s*\(₹\)\s*$/, '') : cl.col.label;
          var colK = wsTable(task) ? '' : '<span class="k">' + esc(colLab) + ':</span> ';
          // xl-1: a signed figure keeps its sign with its ₹ (escNum), as wrongSpan does: "−" / "₹3,41,000" split in a
          // right value under a long column label on a 360 px phone
          var keyFig = escNum(E.formatCell(E.parseNumber([].concat(cl.cell.answer)[0]), fmt, sg));
          return '<p class="ans ws-ans">' + colK + (ok ? '<b>' + escNum(you) + '</b>' + doodle('tick', 'mini', 'right')
            : fo ? '<b>' + escNum(you) + '</b> <span class="follows">Follows your figures</span>&nbsp;· <span class="k">right&nbsp;figure</span>&nbsp;<span class="right">' + keyFig + '</span>'
            : (empty ? '<span class="you none">' + esc(you) + '</span>' : wrongSpan(you, true)) + ' <span class="k">Answer:</span>&nbsp;<span class="right">' + keyFig + '</span>') +
            (cl.cell.working ? ' <span class="working">' + escText(cl.cell.working) + '</span>' : '') + '</p>';
        }).join('');
        var notes = list.map(function (cl) { return say(who, task.notes && task.notes[cl.key]); }).join('');
        return '<li class="nrow">' + wsRowMark(okN, earnN, list.length) + '<div><div class="n-top"><span class="n-lbl">' + nLabel(escText(rowLabel),
          wsRowPartial(okN, list.length)) + '</span></div>' + lines + notes + '</div></li>';
      }).join('') + '</ul></div>';
    } else if (task.type === 'choice') {
      // the senior answers the student's own pick: a right pick gets its why from her; a wrong pick gets her why on
      // that mistake, then the answer with its why in small print. Long wrong text is red, never struck through.
      a = a || {};
      body = (task.questions || []).map(function (q, qi) {
        var s = r.questions[q.id], ok = s >= 1;
        var picked = q.multi ? (Array.isArray(a[q.id]) ? a[q.id] : []) : (a[q.id] ? [a[q.id]] : []);
        var lines = '';
        if (!picked.length) lines += '<p class="ans"><span class="k">You picked:</span> <span class="you none">nothing</span></p>';
        (q.options || []).forEach(function (o) {
          if (picked.indexOf(o.id) < 0) return;
          lines += o.correct ? '<p class="ans"><span class="k">You picked:</span> <b>' + optText(q, o.text) + '</b></p>' + say(who, o.why)
            : '<p class="ans"><span class="k">You picked:</span> <span class="you-long">' + optText(q, o.text) + '</span></p>' + say(who, o.why);
        });
        (q.options || []).forEach(function (o) {
          if (!o.correct || picked.indexOf(o.id) >= 0) return;
          lines += '<p class="ans"><span class="k">' + (q.multi && picked.length ? 'Missed:' : 'Answer:') + '</span> <span class="right">' + optText(q, o.text) + '</span></p>' +
            (o.why ? (picked.length ? '<p class="ans meta">' + escText(o.why) + '</p>' : say(who, o.why)) : '');
        });
        return '<div class="card q-card"><div class="nrow" style="padding:0;border:0">' + mark(ok, s > 0) + '<div><p class="' + qTextClass(task) + '"><span class="q-num">' + (qi + 1) + '</span>' + escText(q.text) +
          // ia-1 round 3 (designer optional 1): a partly right pick (only a multi question can be one) says so in orange after
          // the question, as an items row does, beside the cross its alt text already calls "Partly right"
          (s > 0 && !ok ? ' <span class="partial">Partly right</span>' : '') + '</p>' +
          lines + say(who, q.note) + '</div></div></div>';
      }).join('');
    } else if (task.type === 'order') {
      body = orderReview(task, r);
    } else if (task.type === 'compose') {
      a = a || {};
      body = '<div class="workpaper preview-note"><div class="pn-label">' + esc(task.previewLabel || 'Your note') + '</div><div class="pn-text">' + noteTitle(task, escText(E.composeText(task, a, { blank: '[…]' }))) + '</div></div>' +
        '<div class="workpaper"><ul class="notes">' + (task.slots || []).map(function (s) {
          // a right line is already in the note above: the senior just says why. A wrong line: what the student
          // picked (red, not struck: a long struck sentence is unreadable), the senior on that mistake, then the answer.
          var o = E.slotOption(s, a[s.id]), right = (s.options || []).filter(function (x) { return x.correct; })[0], ok = !!(o && o.correct);
          var inner = ok ? say(who, right && right.why)
            : '<p class="ans"><span class="k">You picked:</span> ' + (o ? '<span class="you-long">' + escText(o.text) + '</span>' : '<span class="you none">nothing</span>') + '</p>' +
              (o ? say(who, o.why) : '') +
              '<p class="ans"><span class="k">Answer:</span> <span class="right">' + escText(right ? right.text : '') + '</span></p>' +
              (right && right.why ? (o ? '<p class="ans meta">' + escText(right.why) + '</p>' : say(who, right.why)) : '');
          return '<li class="nrow">' + mark(ok) + '<div><div class="n-top"><span class="n-lbl">' + esc(s.label).replace(/ · /g, '\u00a0· ') + '</span></div>' + inner + '</div></li>';
        }).join('') + '</ul></div>';
    } else if (task.type === 'hunt') {
      var doc = E.findDoc(lv, task.dataset), flags = E.huntFlags(a), rk = task.rowKey || '_id';
      var keys = doc ? huntKeys(task, doc) : {};
      var rowsById = {}; ((doc && doc.rows) || []).forEach(function (row) { rowsById[row[rk]] = row; });
      var rlabel = function (id) { var rs = (task.reasons || []).filter(function (x) { return x.id === id; })[0]; return rs ? rs.label : id; };
      var rowText = function (id) {
        var row = rowsById[id]; if (!row) return String(id);
        return [row[keys.date], row[keys.party], huntBill(doc, keys, row), typeof row[keys.amount] === 'number' ? E.formatINR(row[keys.amount], { decimals: 2 }) : ''].filter(Boolean).join('\u00a0· ');
      };
      var ans = task.answer || {};
      var found = [], notFound = [], wrong = [];
      Object.keys(ans).forEach(function (id) {
        var reasons = Array.isArray(ans[id]) ? ans[id] : [ans[id]];
        if (flags[id] !== undefined && reasons.indexOf(flags[id]) >= 0) found.push(id); else notFound.push(id);
      });
      Object.keys(flags).forEach(function (id) { var reasons = ans[id] === undefined ? [] : (Array.isArray(ans[id]) ? ans[id] : [ans[id]]); if (reasons.indexOf(flags[id]) < 0) wrong.push(id); });
      var li = function (id, ok, extra) {
        var reasons = ans[id] === undefined ? [] : (Array.isArray(ans[id]) ? ans[id] : [ans[id]]);
        // sa-1 round 6 (fixer 2, the designer's S1 as a pattern): a row's head holds its bill number, date and amount as
        // a note does (escText), so for-1's review at 360 px no longer reads "UFPL/26-" / "27/1652"
        return '<li class="nrow">' + mark(ok) + '<div><div class="n-top"><span class="n-lbl">' + escText(rowText(id)) + '</span></div><p class="ans">' + extra(id, reasons) + '</p>' +
          // for-1: a row flagged that fails no test and has no note of its own gets the task's `fineNote`
          say(who, (task.notes && task.notes[id]) || (ans[id] === undefined && flags[id] !== undefined ? task.fineNote : '')) + '</div></li>';
      };
      // for-1 round 1: the misses and the wrong flags come first, as they are what teach; the finds come after, folded
      // under one line when there is anything to put right (17 notes on rows already right pushed the 2 misses three
      // phone screens down). A reason label picked wrongly is red, never struck, whatever its length
      var fine = wrong.filter(function (id) { return ans[id] === undefined; });
      var redLabel = function (txt) { return '<span class="you-long">' + esc(txt) + '</span>'; };
      var foundList = '<div class="workpaper"><ul class="notes">' + found.map(function (id) { return li(id, true, function (x, rs) { return '<span class="right">' + esc(rlabel(flags[x])) + '</span>'; }); }).join('') + '</ul></div>';
      body = (notFound.length ? '<p class="label">Missed</p><div class="workpaper"><ul class="notes">' + notFound.map(function (id) {
          return li(id, false, function (x, rs) { return (flags[x] ? '<span class="k">You:</span> ' + redLabel(rlabel(flags[x])) + ' ' : '') + '<span class="k">Answer:</span>&nbsp;<span class="right">' + esc(rs.map(rlabel).join(' or ')) + '</span>'; });
        }).join('') + '</ul></div>' : '') +
        (fine.length ? '<p class="label"' + (notFound.length ? ' style="margin-top:14px"' : '') + '>Flagged, but fine</p><div class="workpaper"><ul class="notes">' + fine.map(function (id) {
          return li(id, false, function (x) { return '<span class="k">You:</span> ' + redLabel(rlabel(flags[x])); });
        }).join('') + '</ul></div>' : '') +
        (!found.length ? '' : notFound.length || fine.length
          ? '<details class="found-fold"><summary>' + found.length + ' found · ' + esc(who.first || who.name) + '’s notes</summary>' + foundList + '</details>'
          : '<p class="label">Found</p>' + foundList);
    }
    return '<section class="task-review">' + head + body + '</section>';
  }
  // Model answer: the senior's intro and blocks always show; the key task by task is open after a failed attempt
  // and folded after a pass (the notes above already give every right answer).
  function modelSection(lv, open) {
    var blocks = [];
    (lv.tasks || []).forEach(function (t) {
      var inner = '';
      if (t.type === 'items') {
        inner = '<div class="workpaper"><ul class="notes">' + (t.items || []).map(function (it) {
          var exp = it.answer || {};
          var txt = (t.fields || []).filter(function (f) { return f.kind !== 'text' && exp[f.id] !== undefined && !(Array.isArray(exp[f.id]) && !exp[f.id].length); })
            // acc-1: each answer is held as the item review holds it (holdShort: escNum, and a label of 18 characters or
            // fewer on one line), so "Sundry debtors" never splits in the key at 360 px
            // acc-1 round 1: a field's `lead` ("Dr", "Cr") is said before its answer here too (leadText)
            .map(function (f) { return holdShort(leadText(f, fieldAnswerText(f, exp[f.id]))); }).join('&nbsp;· ');
          return '<li class="nrow" style="grid-template-columns:1fr"><div><span class="n-lbl">' + escLabel(it.label) + '</span><p class="ans">' + txt + '</p></div></li>';
        }).join('') + '</ul></div>';
      } else if (t.type === 'worksheet') {
        var cols = t.columns || [];
        // ia-2 round 2: as on the work sample (ia-2 round 1), a column is right-aligned only when it holds figures; a text
        // column ("Breach", "Ready for use") reads from the left, and a total row's dash is left off a phone's card
        var mNum = cols.map(function (c, i) {
          return i > 0 && (!!c.format || (t.rows || []).some(function (row) { var v = (row.cells || {})[c.key]; return typeof v === 'number' || !!(v && typeof v === 'object' && v.input); }));
        });
        inner = '<div class="workpaper ws-wrap"><table class="ws"><thead><tr>' + cols.map(function (c, i) { return '<th' + (mNum[i] ? ' class="r"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
          (t.rows || []).map(function (row) {
            var tot = row._class === 'total' || row.total;
            return '<tr class="' + (tot ? 'ws-total' : '') + '">' + cols.map(function (c, i) {
              var v = (row.cells || {})[c.key];
              if (i === 0) return '<td class="rowhead" data-label="' + esc(c.label) + '">' + escText(v) + '</td>';
              if (v && typeof v === 'object' && v.input) return '<td class="r" data-label="' + esc(c.label) + '"><span class="mv"><b>' + esc(E.formatCell(E.parseNumber([].concat(v.answer)[0]), v.format || c.format, E.cellSigned(c, v))) + '</b>' + (v.working ? '<span class="meta">' + escText(v.working) + '</span>' : '') + '</span></td>';
              var mt = typeof v === 'number' ? E.formatCell(v, c.format, E.cellSigned(c, v)) : String(v || '');
              var mc = mNum[i] || typeof v === 'number' ? 'r' : 'tx' + (tot && (mt.trim() === '' || mt.trim() === '–') ? ' nil' : '');
              return '<td class="' + mc + '" data-label="' + esc(c.label) + '">' + esc(mt) + '</td>';
            }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>';
      } else if (t.type === 'choice') {
        inner = '<ul class="pen-list">' + (t.questions || []).map(function (q) {
          return '<li><b>' + escText(q.text) + '</b><br>' + (q.options || []).filter(function (o) { return o.correct; }).map(function (o) { return optText(q, o.text); }).join('; ') + '</li>';
        }).join('') + '</ul>';
      } else if (t.type === 'order') {
        var byId = {}; (t.steps || []).forEach(function (s) { byId[s.id] = s; });
        inner = '<ol class="model-steps">' + (t.answer || []).map(function (id) { return '<li>' + escText(byId[id] ? byId[id].text : id) + '</li>'; }).join('') + '</ol>';
      } else if (t.type === 'compose') {
        inner = '<div class="workpaper model-note"><div class="pn-text">' + noteTitle(t, escText(E.composeText(t, {}, { model: true }))) + '</div></div>';
      } else if (t.type === 'hunt') {
        var doc = E.findDoc(lv, t.dataset), rk = t.rowKey || '_id', keys = doc ? huntKeys(t, doc) : {};
        var byRow = {}; ((doc && doc.rows) || []).forEach(function (row) { byRow[row[rk]] = row; });
        inner = '<ul class="pen-list">' + Object.keys(t.answer || {}).map(function (id) {
          var row = byRow[id] || {}, rs = [].concat(t.answer[id]).map(function (x) { var o = (t.reasons || []).filter(function (y) { return y.id === x; })[0]; return o ? o.label : x; });
          return '<li>' + escText([row[keys.date], row[keys.party], huntBill(doc, keys, row), typeof row[keys.amount] === 'number' ? E.formatINR(row[keys.amount], { decimals: 2 }) : ''].filter(Boolean).join('\u00a0· ')) + ': <b>' + esc(rs.join(' or ')) + '</b></li>';
        }).join('') + '</ul>';
      }
      blocks.push('<div class="mb"><p class="label">' + escTitle(t.title) + '</p>' + inner + '</div>');
    });
    var extra = ((lv.model && lv.model.blocks) || []).map(function (b) { return '<div class="mb">' + modelBlock(lv, b) + '</div>'; }).join('');
    return '<section class="model" aria-labelledby="model-t"><h2 class="section-title" id="model-t">Model answer</h2>' +
      (lv.model && lv.model.intro ? '<p>' + escText(lv.model.intro) + '</p>' : '') + extra +
      '<details class="model-key"' + (open ? ' open' : '') + '><summary>' + (open ? 'The answers, task by task' : 'See every answer, task by task') + '</summary>' + blocks.join('') + '</details>' +
      '</section>';
  }
  function modelBlock(lv, b) {
    if (!b) return '';
    if (b.type === 'text') return '<p>' + escText(b.text) + '</p>';
    // for-1 round 2: a list may carry a `label`, set in the hand a model table's title uses ("Rows that only look wrong")
    if (b.type === 'list') return (b.label ? '<p class="rv-cap mb-cap">' + escText(b.label) + '</p>' : '') + '<ul class="pen-list">' + (b.items || []).map(function (x) { return '<li>' + escText(x) + '</li>'; }).join('') + '</ul>';
    if (b.type === 'note') { var p = person(b.from, lv); return '<p class="say"><span class="who">' + esc(p.first || p.name) + '</span>' + escText(b.text) + '</p>'; }
    if (b.type === 'table') {
      var cols = b.columns || [];
      // on a phone the header row is hidden and the rows stack as cards, so the first column's label (the table's
      // title: "GSTR-1 B2B", "3B, reworked") is printed above it; two tables never run together (gst-1).
      // val-1: a table of figures with `grid: true` (a bridge, a sensitivity grid) stays a grid on a phone, so its
      // columns can be read down and added up (its header row shows, so no caption); a column with a number format
      // lines up on the right even where a cell is text ("–", "+84", "11.3%"). dt-1: a text cell holds its codes and
      // amounts as model text does ("8 · Bearings 6205-" / "2RS" at 1366)
      // dt-4 round 2: a grid of a label and one figure column is a computation, kept narrow wider than a phone (.rv-one)
      var grid = b.grid === true, numCol = function (c) { return !!c.format && c.format !== 'text'; };
      var one = grid && cols.length === 2 && !numCol(cols[0]) && numCol(cols[1]);
      return (cols[0] && cols[0].label && !grid ? '<p class="rv-cap">' + escText(cols[0].label) + '</p>' : '') + '<div class="doc-scroll" tabindex="0"><table class="rv-table' + (grid ? ' rv-grid' : '') + (one ? ' rv-one' : '') + '"><thead><tr>' + cols.map(function (c) { return '<th' + (numCol(c) ? ' class="r"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        (b.rows || []).map(function (r) {
          return '<tr' + (r._class === 'total' ? ' class="rv-total" style="font-weight:800"' : '') + '>' + cols.map(function (c) { var v = r[c.key]; return '<td data-label="' + esc(c.label) + '"' + (typeof v === 'number' || numCol(c) ? ' class="r"' : '') + '>' + (typeof v === 'number' ? esc(E.formatValue(v, c.format)) : escText(v || '')) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>';
    }
    return '';
  }

  /* ------------------------------------------------------------------ done: the line, CV, interview, second rep */
  function lineFor(lv, m, best) {
    var d = domain(m.domain);
    return d && best && best.clause ? E.buildLine(d.cvName, best.month, best.clause) : null;
  }
  // addLine: the domain line Add to my CV writes; copyLine: what Copy copies (the same domain line on every screen)
  function cvButtons(domainId, addLine, copyLine, key) {
    var c = app.state.cv[domainId] || {};
    var added = c.addedLine === addLine;
    var adding = app.ui.adding === domainId;
    var copied = app.ui.copied === key;
    return '<div class="btn-row"><button class="btn btn-secondary" data-act="copy" data-key="' + esc(key) + '" data-text="' + esc(copyLine) + '">' + SVG.copy + (copied ? 'Copied' : 'Copy') + '</button>' +
      (added ? '<span class="btn btn-done" role="status">' + doodle('tick') + 'Added</span>'
        : '<button class="btn btn-primary" data-act="add-cv" data-domain="' + esc(domainId) + '"' + (adding ? ' disabled' : '') + '>' + (c.addedLine ? 'Update my CV' : 'Add to my CV') + '</button>') + '</div>' +
      (added ? '<div class="added-row"><a class="btn btn-secondary btn-sm" href="' + esc(CV_BUILDER) + '">Open CV Builder' + SVG.next + '</a></div>' : '');
  }
  function doneSection(lv, m, st) {
    var best = st && st.best;
    if (!best || !best.passed) return '';
    var d = domain(m.domain), line = lineFor(lv, m, best);
    var domLine = E.domainLine(app.cat, app.state, m.domain, PREVIEW);
    var values = best.counts || {};
    var qa = (lv.interview || []).map(function (q, i) {
      return '<div class="card qa"><p class="q"><span class="n" aria-hidden="true">' + (i + 1) + '</span><span>' + escText(q.q) + '</span></p>' +
        (q.checking ? '<p class="checking"><b>They’re checking:</b> ' + escText(q.checking) + '</p>' : '') +
        '<ul class="pen-list">' + E.outlineLines(lv, i, values).map(function (x) { return '<li>' + escText(x) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
    var nxt = E.nextLevel(app.cat, app.state, app.myDomain, PREVIEW);
    if (nxt && nxt.id === lv.id) nxt = null;
    // consistency pass round 2 (P2-05): the line that goes on the CV is always the yellow key-line sticky with Copy and
    // Add under it (as on My CV lines); when the domain line differs, this level's own line is said above it as text
    var twoLines = !!(line && domLine && domLine !== line);
    return '<section class="done" id="done" aria-labelledby="done-t"><h2 class="section-title" id="done-t">Your line</h2>' +
      (twoLines ? '<p class="meta lvl-line">This level’s line: <span class="ll">' + escLine(line) + '</span></p><p class="meta">Your CV gets one ' + esc(d.short || d.name) + ' line, from your picks in My CV lines:</p><div class="sticky"><p class="line-text">' + escLine(domLine) + '</p></div>'
        : line ? '<div class="sticky"><p class="line-text">' + escLine(line) + '</p></div>' : '') +
      // consistency pass round 1 (P03): Copy copies exactly the domain line Add to my CV writes (SPEC §8), as on My CV lines
      (line ? cvButtons(m.domain, domLine || line, domLine || line, 'done:' + lv.id) : '') +
      // for-1 round 3 (editor optional): a domain with one level offers no second level to pick ("or your best two" read
      // oddly under forensic's only line); the rule is said for that domain instead
      '<p class="rule-line">' + (E.domainLevels(app.cat, m.domain, PREVIEW).length === 1 ? esc(COPY.oneLineSolo.replace('{d}', d.short || d.name)) : esc(COPY.oneLine)) + '<a href="#/cv">My CV lines</a>.</p>' +
      (qa ? '<h2 class="section-title">They will ask you</h2>' + qa : '') + secondRep(d) +
      '<div class="btn-row" style="margin-top:22px"><a class="btn btn-secondary" href="#/l/' + esc(lv.id) + '/sample">' + SVG.print + 'Print work sample</a>' +
      (nxt ? '<a class="btn btn-primary" href="#/l/' + esc(nxt.id) + '">Next level' + SVG.next + '</a>' : '<a class="btn btn-primary" href="#/cv">My CV lines' + SVG.next + '</a>') + '</div></section>';
  }

  /* ------------------------------------------------------------------ My CV lines */
  function cvDomains() {
    return domainOrder().filter(function (d) { return E.passedInDomain(app.cat, app.state, d.id, PREVIEW).length; });
  }
  function cvScreen() {
    setTitle('My CV lines');
    var list = cvDomains();
    if (!list.length) {
      var nxt = E.nextLevel(app.cat, app.state, app.myDomain, PREVIEW);
      return '<div class="page">' + crumb('#/', 'Work Simulation') + '<h1 class="screen-title" data-focus>My CV lines</h1><div class="card empty"><p>Pass a level and its CV line appears here, with your own numbers in it.</p>' +
        (nxt ? '<a class="btn btn-primary" href="#/l/' + esc(nxt.id) + '">' + (ls(nxt.id) && ls(nxt.id).attempts ? 'Try again: ' : 'Start ') + esc(display(nxt)) + '</a>' : '') + '</div></div>';
    }
    var cards = list.map(function (d) {
      var passed = E.passedInDomain(app.cat, app.state, d.id, PREVIEW);
      var picks = E.cvPicks(app.cat, app.state, d.id, PREVIEW);
      var line = E.domainLine(app.cat, app.state, d.id, PREVIEW);
      var rows = passed.slice().sort(function (a, b) { return a.meta.number - b.meta.number; }).map(function (x) {
        var on = picks.indexOf(x.id) >= 0, lock = !on && picks.length >= 2;
        // consistency pass round 2 (P2-03): a name, so a tick or untick keeps focus on this box after the re-render
        return '<label class="opt-row"' + (lock ? ' style="opacity:.6"' : '') + '><input type="checkbox" name="pick-' + esc(d.id) + '" data-pick="' + esc(d.id) + '" value="' + esc(x.id) + '"' + (on ? ' checked' : '') + (lock ? ' disabled' : '') + '><span class="box" aria-hidden="true"></span>' +
          '<span class="o-text"><b>' + escTitle(x.meta.number + ' · ' + x.meta.title) + '</b><br><span class="meta">' + esc(x.best.month || '') + '</span> ' + stars(x.best.stars) + '</span></label>';
      }).join('');
      return '<section class="card cvcard" aria-labelledby="cv-' + esc(d.id) + '"><div class="cv-top">' + doodle(d.icon) + '<h2 id="cv-' + esc(d.id) + '">' + esc(d.name) + '</h2></div>' +
        (passed.length > 1 ? '<p class="pick-note">' + esc(COPY.pickNote) + '</p><div class="opts cv-picks">' + rows + '</div>' : '') +
        (line ? '<div class="sticky"><p class="line-text">' + escLine(line) + '</p></div>' + cvButtons(d.id, line, line, 'cv:' + d.id) : '') + '</section>';
    }).join('');
    return '<div class="page">' + crumb('#/', 'Work Simulation') + '<h1 class="screen-title" data-focus>My CV lines</h1><p class="lead">' + esc(COPY.cvRule) + '</p>' + cards + '</div>';
  }

  /* ------------------------------------------------------------------ work sample (one A4 page) */
  function sampleScreen(lv, m) {
    var st = ls(lv.id);
    var data = null;
    // consistency pass round 2 (P2-04): the MSC work sample is printed only from a passed best (its own answers);
    // before a pass the link opens the review of a handed-in attempt, else the case file
    if (st && st.best && st.best.passed) { var ba = E.bestAnswers(st); if (ba) data = { answers: ba, res: st.best }; }
    if (!data) { var to = reviewData(lv) ? '#/l/' + lv.id + '/review' : '#/l/' + lv.id; setTimeout(function () { go(to, true); }, 0); return null; }
    setTitle('Work sample · ' + display(m));
    var d = domain(m.domain), res = data.res, answers = data.answers;
    var line = res.passed && res.clause ? E.buildLine(d.cvName, res.month, res.clause) : null;
    var c = lv.case || {};
    var name = app.state.sampleName || '';
    var tasks = (lv.tasks || []).map(function (t, i) { return '<h2>Task ' + (i + 1) + ' · ' + escTitle(t.title) + ' <span style="font-weight:600;color:#5B6474">(' + esc(t.stage || '') + ')</span></h2>' + sampleTask(lv, t, answers[t.id]); }).join('');
    // the logo file's own SVG is inlined once fetched (it prints in every engine; an <img> SVG can drop out of a
    // headless print), else the same file as an image
    var logo = app.logoSvg ? '<span class="sh-logo" role="img" aria-label="My Student Club">' + app.logoSvg + '</span>' : '<img src="img/logo/msc-logo-horizontal-colour.svg" alt="My Student Club">';
    var sheet = '<div class="sheet" id="sheet"><div class="sh-head">' + logo + '<div class="sh-t">MSC Articleship Program | Work Simulation work sample</div></div>' +
      '<h1>' + escTitle(display(m)) + '</h1><div class="sh-meta"><span><b>Client (fictional):</b> ' + esc(String(c.client || '').split(', ')[0]) + '</span>' + (c.period ? '<span><b>Period:</b> ' + escText(c.period) + '</span>' : '') +
      '<span class="sh-by"><b>Prepared by:</b> ' + (name ? esc(name) : '______________________') + '</span><span><b>Month:</b> ' + esc(res.month || E.monthLabel(res.at || Date.now())) + '</span>' +
      '<span><b>Auto-checked:</b> ' + E.pctShown(res.accuracy) + '% right</span></div>' + tasks +
      (line ? '<div class="sh-line"><span class="k">CV line earned</span>' + escLine(line) + '</div>' : '') +
      '<div class="sh-foot"><span>CA Padam Bhansali | My Student Club</span><span>mystudentclub.com</span></div></div>';
    return '<div class="page sample-page">' + crumb('#/l/' + esc(lv.id) + '/review', 'Review') + '<h1 class="screen-title" data-focus>Work sample</h1>' +
      '<div class="sample-tools"><div class="name-row"><label class="f-label" for="sample-name">Prepared by</label><input id="sample-name" type="text" maxlength="60" autocomplete="name" placeholder="Your name" value="' + esc(name) + '" data-bind="sample-name"></div>' +
      // sa-1 round 5 (designer optional 4): a sample from a pass with misses prints those answers as given, unmarked, on
      // the page an interviewer reads; one line before the button says so (screen only, as the whole tools row is)
      (E.pctShown(res.accuracy) < 100 ? '<p class="locked-note sample-note">' + esc(COPY.sampleMisses) + '</p>' : '') +
      '<button class="btn btn-primary" data-act="print">' + SVG.print + 'Print / Save as PDF</button></div>' +
      '<div class="sheet-frame" id="sheet-frame">' + sheet + '</div></div>';
  }
  function sampleTask(lv, t, a) {
    a = a || {};
    // ba-1 round 3 (designer S1): each hyphenated word of letters in escaped markup is held whole, by escLine's rule for
    // the CV line ("NPA (Sub-" / "standard; …)" ended three lines of ba-1's 3-star A4 sample); used on the items detail
    // and sub-line, never on the student's own note
    function holdHyphens(h) { return h.replace(/(^|[\s(])([A-Za-z]+(?:-[A-Za-z]+)+)(?=[\s,;:.)]|$)/g, '$1<span class="nw">$2</span>'); }
    if (t.type === 'items') {
      var gate = gateField(t), items = t.items || [];
      var other = (t.fields || []).filter(function (f) { return f !== gate && f.kind !== 'text'; });
      var textF = (t.fields || []).filter(function (f) { return f.kind === 'text'; });
      var lineOf = function (it) {
        var ia = a[it.id] || {};
        // sa-6 round 3: capitalised like the calls beside it ("Agrees", "Differs") and the grouped sample's "Not checked"
        var call = gate ? (ia[gate.id] ? optLabel(gate, ia[gate.id]) : 'Not checked') : '';
        // a pick marked quiet (sa-2's "Nothing else") is left out of the detail, so the real notes stand out
        var quiet = function (f) { return f.kind === 'choice' && (f.options || []).some(function (o) { return o.quiet && o.id === ia[f.id]; }); };
        // acc-1 round 1: a field's `lead` ("Dr", "Cr") is said before its answer, so the sample shows the entry's sides
        var det = other.filter(function (f) { return E.fieldVisible(f, ia) && !E.isEmpty(ia[f.id]) && !quiet(f); }).map(function (f) { return leadText(f, fieldAnswerText(f, ia[f.id], true)); }).join('; ');
        var note = textF.map(function (f) { return ia[f.id]; }).filter(Boolean).join(' ');
        // a gate marked neutral (gst-1: which GSTR-1 an invoice goes in) is a destination, not a finding: printed in ink,
        // never green for the first option and red for the rest
        return { call: call, det: det, note: note, ok: gate && gate.neutral ? null : gate && gate.options && ia[gate.id] === (gate.options[0] || {}).id };
      };
      var callCls = function (x) { return x.ok === null ? 'plain' : x.ok ? 'tk' : 'ex'; };
      // dt-1 r2: a short two-word call ("Report only", "Keep out") stays on one line in the table's call column on a
      // phone; a longer call ("Hosur (Tamil Nadu)") still wraps, so the column never pushes the table wide
      var callText = function (s) { s = String(s); return s.length <= 12 && s.split(' ').length === 2 ? s.replace(' ', '\u00a0') : s; };
      // dt-3: a task whose items carry only the call (the appeal set: "Goes in" / "Stays out") prints no empty Detail column
      var lns = items.map(lineOf);
      var showDet = lns.some(function (x) { return x.det || x.note; });
      // ia-2 round 1: labels that already carry their own number in order ("Row 1 · …", "Item 2 · …") print no # column
      // as well, so no row reads "1 · Row 1 · …" (a bin or employee code is not its number: sa-2's A1, sa-4's E1090)
      // mat-1 round 1 (designer optional 2): letters in order carry their own order too ("Route A · …", "Route B · …")
      var ownMark = function (mk) { return items.every(function (it, i) { return new RegExp('(^|\\s)' + mk(i) + '$').test(String(it.label || '').split(' · ')[0]); }); };
      var ownNo = items.length && (ownMark(function (i) { return i + 1; }) || (items.length <= 26 && ownMark(function (i) { return String.fromCharCode(65 + i); })));
      // consistency pass round 1 (P02): one item to a line in two columns, its sub-line after its label ("Item 1 · Flood
      // loss · Hitesh adds ₹126 lakh: Add back"), so a long list prints at a size an interviewer can read across a table
      // (fdd-1 printed at 4.4 pt with one item per two lines and the call far right). `num` is the index printed before
      // it (none when the label carries its own number); `call` false leaves the call out (a grouped sample's head says it).
      var colLine = function (it, i, num, call) {
        var x = lns[i], sub = itemSummary(t, it);
        // gst-1 round 4 (designer optional 1): a call of 18 characters or fewer stays whole, as holdShort keeps it in the
        // review, so no line starts "· October (B2B, IGST)"
        // sa-1 round 5 (designer S1): the detail, the sub-line and the student's own note go through escText, which holds
        // an en-dash year ("Fine (2026–" / "27)" printed six times on the 3-star A4 sample) as well as amounts and codes
        // ia-1 round 5 (designer optional 2): the student's own note follows a " · " held to the word before it, so a call
        // and the note's first word never read as one phrase ("Fine Rate as per rate contract")
        // ba-1 round 3 (designer S1): the detail and the sub-line hold each hyphenated word of letters (holdHyphens, as
        // the CV line does), so no line of the printed sample ends "NPA (Sub-"; the student's own note is left as typed
        var tail = (call && x.call ? ': <span class="' + callCls(x) + (String(x.call).length <= 18 ? ' nw' : '') + '">' + esc(x.call) + '</span>' + (x.det ? ' (' + holdHyphens(escText(x.det)) + ')' : '') : x.det ? ': ' + holdHyphens(escText(x.det)) : '') + (x.note ? '&nbsp;· <i>' + escText(x.note) + '</i>' : '');
        return '<div>' + (num ? '<b>' + num + '.</b> ' : '') + escLabel(it.label) + (sub ? '&nbsp;· <span class="sub">' + holdHyphens(escText(sub)) + '</span>' : '') + tail + '</div>';
      };
      // dt-3 round 2: `sampleGroups` ([{ call, label }] in order) prints the items under the student's own calls, the
      // first group numbered 1, 2, 3 as an index is ("The appeal set", then "Left in the file"); an item with no call
      // goes last under "Not checked". The group head says the call, so the call is left out of each line.
      // fdd-1 round 1: labels with their own number in order ("Line 1 · …" … "Line 11 · …") print no index here
      // either, so a sort into groups never reads as an index of its first group alone (dt-3 and xl-1 keep theirs)
      // consistency pass round 1 (P02): the groups print in two columns, each head kept with its first line
      // dt-3 round 3 (designer optional 4): a group that carries `whole: true` prints in one column, its head and every
      // line together, while it has eight items or fewer (the appeal set read 1–5 at the foot of the left column and 6
      // at the top of the right one, above "Left in the file", even on the key); a longer one breaks as before, so a
      // student who marks every paper in still gets two even columns. Groups without the key print exactly as before.
      if (gate && Array.isArray(t.sampleGroups) && t.sampleGroups.length) {
        var placed = {}, secs = t.sampleGroups.map(function (g) {
          var idx = []; items.forEach(function (it, i) { if (!placed[i] && (a[it.id] || {})[gate.id] === g.call) { placed[i] = 1; idx.push(i); } });
          return { label: g.label, idx: idx, whole: g.whole === true };
        });
        var left = []; items.forEach(function (it, i) { if (!placed[i]) left.push(i); });
        if (left.length) secs.push({ label: 'Not checked', idx: left });
        var n = 0;
        return '<div class="cols2 s-groups">' + secs.map(function (sc, si) {
          if (!sc.idx.length) return '';
          var grp = '<div class="grp">' + escText(sc.label) + ' <span class="g-n">(' + sc.idx.length + ')</span></div>' + sc.idx.map(function (i) {
            return colLine(items[i], i, !ownNo && si === 0 ? ++n : 0, false);
          }).join('');
          return sc.whole && sc.idx.length <= 8 ? '<div class="g-whole">' + grp + '</div>' : grp;
        }).join('') + '</div>';
      }
      if (t.sampleColumns !== true && items.length > 8) {
        return '<div class="cols2">' + items.map(function (it, i) {
          // a label that already carries its number ("Bill 1 · Sohna Friction") is not numbered again
          return colLine(it, i, /\d/.test(String(it.label || '').split(' · ')[0]) ? 0 : i + 1, true);
        }).join('') + '</div>';
      }
      // ia-2 round 1: `sampleColumns: true` prints the task as a matrix, one column per non-text field headed by the
      // field's short label (an RCM: Control | Type | Nature | Test), in place of one "Detail" string with semicolons;
      // the student's own note stays a last column. A blank or hidden field prints "–".
      var mcols = t.sampleColumns === true ? other : null;
      var mnotes = mcols && lns.some(function (x) { return x.note; });
      var colCells = function (it, x) {
        var ia = a[it.id] || {};
        return mcols.map(function (f) {
          var v = ia[f.id], quietPick = f.kind === 'choice' && (f.options || []).some(function (o) { return o.quiet && o.id === v; });
          return '<td>' + (E.fieldVisible(f, ia) && !E.isEmpty(v) && !quietPick ? escText(fieldAnswerText(f, v, true)) : '–') + '</td>';
        }).join('') + (mnotes ? '<td>' + (x.note ? '<i>' + escText(x.note) + '</i>' : '') + '</td>' : '');
      };
      return '<table><thead><tr>' + (ownNo ? '' : '<th>#</th>') + '<th>' + esc(capWord(E.nounFor(t)[0])) + '</th>' + (gate ? '<th>' + escLabel(gate.label) + '</th>' : '') +
        (mcols ? mcols.map(function (f) { return '<th>' + escLabel(f.short || f.label) + '</th>'; }).join('') + (mnotes ? '<th>Note</th>' : '') : showDet ? '<th>Detail</th>' : '') + '</tr></thead><tbody>' + items.map(function (it, i) {
        var x = lns[i];
        // consistency pass round 2 (P2-01): the sub-line follows the label on its line, as colLine prints it
        var sub = itemSummary(t, it);
        // sa-1 round 5 (designer S1): escText, as colLine, so a year in a Detail cell never splits at its en dash
        // ba-1 round 3 (designer S1, as a pattern): the Detail cell and the sub-line hold hyphenated words, as colLine
        return '<tr>' + (ownNo ? '' : '<td>' + (i + 1) + '</td>') + '<td>' + escLabel(it.label) + (sub ? '&nbsp;· <span class="sub">' + holdHyphens(escText(sub)) + '</span>' : '') + '</td>' + (gate ? '<td class="' + callCls(x) + '">' + esc(callText(x.call)) + '</td>' : '') +
          (mcols ? colCells(it, x) : showDet ? '<td>' + holdHyphens(escText(x.det)) + (x.note ? (x.det ? '<br>' : '') + '<i>' + escText(x.note) + '</i>' : '') + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table>';
    }
    if (t.type === 'worksheet') {
      var cols = t.columns || [];
      // a one-column computation (layout "table") is printed as narrow as a real one, not with the figure 160 mm from
      // its label across the A4 page (dt-4 round 1)
      // ia-2 round 1: a column is right-aligned only when it holds figures (it has a format, or a cell is an input or a
      // number); a text column (ia-2's "Breach", sa-3's "Ready for use") reads from the left, as a workpaper prints it
      var numCol = cols.map(function (c, i) {
        return i > 0 && (!!c.format || (t.rows || []).some(function (row) { var v = (row.cells || {})[c.key]; return typeof v === 'number' || !!(v && typeof v === 'object' && v.input); }));
      });
      // consistency pass round 1 (P02): any worksheet with one value column (label + figure) prints at most 60% wide, so
      // the figure sits near its label (val-1 t3, fdd-1 t3 ran the width of the page)
      var oneCls = wsTable(t) || cols.length === 2 ? ' class="s-one"' : '', wsRows = t.rows || [];
      var wsHead = '<thead><tr>' + cols.map(function (c, i) { return '<th' + (numCol[i] ? ' class="r"' : '') + '>' + esc(c.label) + '</th>'; }).join('') + '</tr></thead>';
      // val-1 round 3 (designer S2): a long one-column computation may name `sampleBreak` (a row id, not its first): it
      // prints as two such tables side by side, the named row opening the second, each with the same head (val-1's DCF:
      // the hand-worked year, then the value), so the page is not 13 rows tall with 60% of its width empty. No key: as before
      var wsBreak = oneCls && typeof t.sampleBreak === 'string' ? wsRows.map(function (row) { return row.id; }).indexOf(t.sampleBreak) : -1;
      var wsTbl = function (rows) { return '<table' + oneCls + '>' + wsHead + '<tbody>' + rows.map(wsRowHtml).join('') + '</tbody></table>'; };
      var wsRowHtml = function (row) {
        return '<tr' + (row._class === 'total' || row.total ? ' class="tot"' : '') + '>' + cols.map(function (c, i) {
          var v = (row.cells || {})[c.key];
          if (v && typeof v === 'object' && v.input) {
            var g = E.parseNumber(a[row.id + '.' + c.key]), k0 = E.parseNumber([].concat(v.answer)[0]);
            // a cell that takes either sign (an adjustment whose row says which way it goes) prints in the key's sign
            // once right, so one row of the sample never reads "−48 · 48 · 48" (the review keeps what was typed)
            if (g !== null && k0 && E.cellCorrect(v, g) && [].concat(v.answer).some(function (x) { return E.parseNumber(x) === -k0; })) g = k0 < 0 ? -Math.abs(g) : Math.abs(g);
            // gst-1 round 4 (designer S2): each figure is held whole, so a narrow column on the phone preview never breaks
            // the sign off it ("–" / "₹1,80,06,000" read as an empty cell, the sheet's own mark, then a positive figure)
            return '<td class="r"><b>' + (g === null ? '–' : '<span class="nw">' + esc(E.formatCell(g, v.format || c.format, E.cellSigned(c, v))) + '</span>') + '</b></td>'; }
          return '<td' + (numCol[i] ? ' class="r"' : '') + '>' + (typeof v === 'number' ? '<span class="nw">' + esc(E.formatCell(v, c.format, E.cellSigned(c, v))) + '</span>' : escText(v || '')) + '</td>';
        }).join('') + '</tr>';
      };
      return wsBreak > 0 ? '<div class="s-pair">' + wsTbl(wsRows.slice(0, wsBreak)) + wsTbl(wsRows.slice(wsBreak)) + '</div>' : wsTbl(wsRows);
    }
    if (t.type === 'choice') {
      return '<table><tbody>' + (t.questions || []).map(function (q, i) {
        var v = a[q.id], picked = (q.options || []).filter(function (o) { return Array.isArray(v) ? v.indexOf(o.id) >= 0 : o.id === v; }).map(function (o) { return optText(q, o.text); });
        // ia-1 round 1: several picks print one to a line, as a workpaper lists them ("…bank letter; A call-back…" read oddly)
        // consistency pass round 2 (P2-01): a long question prints its `sample` (the point it asks, 12 words or fewer)
        // ba-1 round 3 (designer S1, as a pattern): the question and the picks hold their hyphenated words, as the items lines do
        return '<tr><td style="width:44%"><b>' + (i + 1) + '.</b> ' + holdHyphens(escText(typeof q.sample === 'string' && q.sample.trim() ? q.sample : q.text)) + '</td><td>' + (picked.length ? picked.map(holdHyphens).join('<br>') : 'no answer') + '</td></tr>';
      }).join('') + '</tbody></table>';
    }
    if (t.type === 'order') {
      var byId = {}; (t.steps || []).forEach(function (s) { byId[s.id] = s; });
      // ia-1 round 3 (designer S1): a step says itself through escText, as the order review does, so "₹2,58,000" holds
      var ord = E.currentOrder(lv, t, a), stepLi = function (id) { return '<li>' + holdHyphens(escText(byId[id] ? byId[id].text : id)) + '</li>'; };
      // ia-1 round 3 (designer S1): more than six steps print as two numbered lists side by side (steps 1 to half, then
      // the rest from half + 1), so short steps no longer leave half the A4 width empty (ia-1's eight steps ended at 55%
      // of it and the page printed at zoom 0.733). Not CSS columns: a step that wraps splits them 5/3. Six or fewer: as before
      if (ord.length > 6) {
        var half = Math.ceil(ord.length / 2);
        return '<div class="s-pair s-order"><ol>' + ord.slice(0, half).map(stepLi).join('') + '</ol><ol start="' + (half + 1) + '">' + ord.slice(half).map(stepLi).join('') + '</ol></div>';
      }
      return '<ol style="margin:0;padding-left:18px">' + ord.map(stepLi).join('') + '</ol>';
    }
    if (t.type === 'compose') {
      // consistency pass round 2 (P2-01): one <p> per paragraph (a blank line in the template), a single line break a
      // <br>, so the printed note keeps its shape without a blank line's height between paragraphs
      // ba-1 round 3 (designer S1, as a pattern): the note holds its hyphenated words too (for-1's printed note read
      // "…and the tidy-" / "up would…" once play.mjs looked for a letter–hyphen line end on the A4 page)
      var nh = noteTitle(t, holdHyphens(escText(E.composeText(t, a, { blank: '[…]' }))));
      return '<div class="note-box">' + String(nh).split(/\n{2,}/).map(function (para) {
        return '<p>' + para.replace(/^\n+|\n+$/g, '').replace(/\n/g, '<br>') + '</p>';
      }).join('') + '</div>';
    }
    if (t.type === 'hunt') {
      var doc = E.findDoc(lv, t.dataset), flags = E.huntFlags(a), rk = t.rowKey || '_id';
      if (!doc) return '';
      var keys = huntKeys(t, doc), ids = Object.keys(flags), byRow = {};
      (doc.rows || []).forEach(function (row) { byRow[row[rk]] = row; });
      var shownIds = ids.slice(0, 24);
      // for-1 round 1: with `keys.bill` the bill column prints too ("KEO-1184", "no bill / ref"): for a duplicate or a
      // round sum it is the evidence
      var billCol = keys.bill ? (doc.columns || []).filter(function (c) { return c.key === keys.bill; })[0] : null, nc = billCol ? 5 : 4;
      return '<table><thead><tr><th>Date</th><th>Party</th>' + (billCol ? '<th>' + esc(billCol.label) + '</th>' : '') + '<th class="r">Amount</th><th>Flag</th></tr></thead><tbody>' + shownIds.map(function (id) {
        var row = byRow[id] || {}, rs = (t.reasons || []).filter(function (x) { return x.id === flags[id]; })[0];
        return '<tr><td>' + esc(row[keys.date] || '') + '</td><td>' + esc(row[keys.party] || '') + '</td>' + (billCol ? '<td class="nw">' + esc(huntBill(doc, keys, row)) + '</td>' : '') + '<td class="r">' + esc(typeof row[keys.amount] === 'number' ? E.formatNumber(row[keys.amount], 2) : '') + '</td><td>' + esc(rs ? rs.label : flags[id]) + '</td></tr>';
      }).join('') + (ids.length > shownIds.length ? '<tr><td colspan="' + nc + '" class="more">' + (ids.length - shownIds.length) + ' more flagged rows</td></tr>' : '') + (!ids.length ? '<tr><td colspan="' + nc + '" class="more">No rows flagged.</td></tr>' : '') + '</tbody></table>';
    }
    return '';
  }
  function fitSample() {
    var frame = $('#sheet-frame'), sheet = $('#sheet');
    if (!frame || !sheet) return;
    var w = frame.clientWidth || 718;
    var s = Math.min(1, w / 718);
    sheet.style.transform = 'scale(' + s + ')';
    frame.style.height = Math.ceil(sheet.offsetHeight * s) + 'px';
    // one A4 page: the sheet is laid out as it prints (190 mm wide, no padding); when it is too tall it is zoomed
    // out and widened by the same factor, so it still fills the page width. The largest zoom that fits wins.
    var avail = 277 * 96 / 25.4 - 8, W = 190 * 96 / 25.4;   // A4 minus 10 mm margins, in CSS px
    sheet.classList.add('measure-print');
    var fits = function (z) { sheet.style.zoom = String(z); sheet.style.width = (W / z) + 'px'; return sheet.getBoundingClientRect().height <= avail; };
    var zoom = 1;
    if (!fits(1)) {
      var lo = 0.3, hi = 1;
      for (var i = 0; i < 9; i++) { var mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
      zoom = lo;
    }
    sheet.style.zoom = ''; sheet.style.width = '';
    sheet.classList.remove('measure-print');
    sheet.style.setProperty('--print-zoom', String(Math.floor(zoom * 1000) / 1000));
    // consistency pass round 1 (P02): the zoom the page settled on, so it can be measured (play.mjs warns under 0.75,
    // about 6.5 pt body text); the sheet stays one A4 page whatever it is (law row 1.6: a one-page work sample)
    sheet.setAttribute('data-print-zoom', String(Math.floor(zoom * 1000) / 1000));
  }
  window.addEventListener('resize', function () { if (app.route.name === 'sample') fitSample(); markScrollables(document); });
  window.addEventListener('beforeprint', function () { fitSeals(document); if (app.route.name === 'sample') fitSample(); });

  /* ------------------------------------------------------------------ actions */
  function currentLevel() { return app.route.level ? app.levels[app.route.level] : null; }
  function rerenderPart(id, html) { var el = document.getElementById(id); if (el) el.innerHTML = html; }
  function keepFocus(fn) {
    var a = document.activeElement, sel = null;
    if (a && a !== document.body) {
      if (a.id) sel = '#' + CSS.escape(a.id);
      else if (a.name && a.value !== undefined && (a.type === 'radio' || a.type === 'checkbox')) sel = 'input[name="' + CSS.escape(a.name) + '"][value="' + CSS.escape(a.value) + '"]';
      else if (a.getAttribute('data-act')) {
        // consistency pass round 2 (P2-03): data-domain too, so Enter on GST's "Add to my CV" stays on GST's card
        var attrs = ['data-act', 'data-step', 'data-dir', 'data-val', 'data-row', 'data-key', 'data-task', 'data-domain', 'data-index', 'data-level'].filter(function (k) { return a.hasAttribute(k); });
        sel = attrs.map(function (k) { return '[' + k + '="' + CSS.escape(a.getAttribute(k)) + '"]'; }).join('');
      }
    }
    var y = window.scrollY;
    fn();
    if (sel) { var n = $(sel); if (n && !n.disabled) { try { n.focus({ preventScroll: true }); } catch (e) { n.focus(); } } }
    window.scrollTo(0, y);
  }
  function softRender() { keepFocus(function () { render(false); }); }
  // iber-1 round 1 (designer S1): a tab or Other-papers switch that shows the item's own framed row (`docRow`) brings
  // that row into view when it is not: on a phone the page scrolls so the row sits 12 px under the top bar (Wadhwan's
  // row in the call notes sat at y = 1037 of an 844 px screen, under the item bar); on a desktop the documents pane
  // scrolls. Only after a switch, never on first load; no smooth scroll under prefers-reduced-motion. dt-2 round 4: and,
  // inside a desktop pane only, when an item opens on such a paper (afterRender; `instant`, as the pane is new)
  function showFocusRow(instant) {
    var row = $('[role="tabpanel"] tr.row-focus');
    if (!row || !row.offsetParent) return;
    var behavior = instant === true || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) ? 'auto' : 'smooth';
    // dt-2 round 4: a frame of several rows (a deductor's two quarters) counts as one, from its first row's top to its
    // last row's bottom, so a second row cut by the pane's or the screen's foot is brought in too
    var framed = row.closest('[role="tabpanel"]').querySelectorAll('tr.row-focus'), r0 = row.getBoundingClientRect();
    var rb = { top: r0.top, bottom: framed[framed.length - 1].getBoundingClientRect().bottom }, pane = row.closest('.docs-pane');
    // dt-2 round 6 (designer S1): the top of the table's head (`thead`: a sheet's column letters and head row), if shown
    var tb = row.closest('table'), th = tb && tb.tHead, hr = th && th.getBoundingClientRect(), ht = hr && hr.height > 0 ? hr.top : null;
    if (pane) {   // desktop: the pane is as tall as the screen, so only a pane that scrolls can hide the row
      if (pane.scrollHeight <= pane.clientHeight + 1 || getComputedStyle(pane).overflowY === 'visible') return;
      var pb = pane.getBoundingClientRect(), y = focusTarget(ht, rb, pb.top, Math.min(pb.bottom, window.innerHeight));
      if (y === null) return;
      pane.scrollTo({ top: Math.max(0, pane.scrollTop + y - pb.top - 12), behavior: behavior });
      return;
    }
    var top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top'), 10) || 60;
    var bar = document.getElementById('ibar'), bb = bar && bar.getBoundingClientRect();
    var bottom = bb && bb.height > 0 && getComputedStyle(bar).position === 'sticky' ? bb.top : window.innerHeight;
    var y2 = focusTarget(ht, rb, top, bottom);
    if (y2 === null) return;
    window.scrollTo({ top: Math.max(0, y2 + window.scrollY - top - 12), behavior: behavior });
  }
  // dt-2 round 6 (designer S1): where the frame (rb) and its table's head (top at ht; null when the table has none) fit
  // in the view (top to bottom) together, the head comes in with the frame and sits 12 px under the view's top, so a
  // framed figure is never read without its column (Lothal's 28,093 sat under the phone's top bar with "Jul–Sep (₹)"
  // above the screen); otherwise the frame's top, as before. A frame in view stays put, unless both fit and its head is
  // cut above it. Returns the y (viewport px) to bring 12 px under the view's top, or null when nothing need move
  function focusTarget(ht, rb, top, bottom) {
    var both = ht !== null && ht < rb.top && rb.bottom - ht <= bottom - top - 24;
    if (rb.top >= top && rb.bottom <= bottom && (!both || ht >= top)) return null;
    return both ? ht : rb.top;
  }

  function startLevel() {
    var lv = currentLevel(); if (!lv) return;
    var st = ls(lv.id);
    var fresh = !(st && st.attempt && !st.attempt.submittedAt);
    commit(E.startAttempt(app.state, lv.id, Date.now()), { now: true });
    var t = fresh ? 1 : (ls(lv.id).attempt.task || 0) + 1;
    go('#/l/' + lv.id + '/t/' + t);
  }
  function tryAgain(levelId) {
    var lv = currentLevel(), id = levelId || (lv && lv.id);
    if (!id || !visible(meta(id))) return;
    commit(E.startAttempt(app.state, id, Date.now()), { now: true });
    app.ui.filter = {}; app.ui.hunt = {};
    go('#/l/' + id + '/t/1');
  }
  function submit(force) {
    var lv = currentLevel(); if (!lv) return;
    var att = attemptOf(lv);
    var miss = E.unanswered(lv, answersOf(lv)).filter(function (x) { return !E.isLocked(att, x.task.id); });
    // mat-1 round 2: a worksheet's boxes that hold text but no figure are said apart from the empty ones (missLine)
    miss.forEach(function (x) { if (x.type === 'worksheet') x.bad = wsUnread(x.task, answersOf(lv)[x.task.id]).length; });
    if (miss.length && !force) { openSubmitModal(lv, miss); return; }
    closeModal();
    commit(E.submitAttempt(app.state, lv, Date.now()), { now: true });
    go('#/l/' + lv.id + '/review');
  }
  function missLine(x) {
    if (x.type === 'order') return 'The steps are still in the order they started in.';
    if (x.type === 'hunt') return 'No rows flagged yet.';
    // mat-1 round 2 (designer S1): flagged worksheet boxes are not "still empty" while each shows what was typed
    // ("1 figure can’t be read. 1 figure still empty.")
    if (x.type === 'worksheet' && x.bad > 0) {
      var nEmpty = x.missing - x.bad;
      return x.bad + ' ' + (x.bad === 1 ? x.noun[0] : x.noun[1]) + ' can’t be read.' + (nEmpty > 0 ? ' ' + nEmpty + ' ' + (nEmpty === 1 ? x.noun[0] : x.noun[1]) + ' still empty.' : '');
    }
    var verb = x.type === 'items' ? 'not checked yet' : x.type === 'worksheet' ? 'still empty' : x.type === 'compose' ? 'not picked yet' : 'not answered yet';
    return x.missing + ' ' + (x.missing === 1 ? x.noun[0] : x.noun[1]) + ' ' + verb + '.';
  }
  function openSubmitModal(lv, miss) {
    var many = miss.length > 1;
    var link = function (x) { return '<a href="#/l/' + esc(lv.id) + '/t/' + (x.index + 1) + '" data-act="modal-go">Task ' + (x.index + 1) + '</a>'; };
    var body = many ? '<ul>' + miss.map(function (x) { return '<li>' + link(x) + ': ' + esc(missLine(x)) + '</li>'; }).join('') + '</ul>'
      : '<p>' + (miss[0].index === lv.tasks.length - 1 ? '' : link(miss[0]) + ': ') + esc(missLine(miss[0])) + '</p>';
    // sa-7 round 1: on a composed text with open slots (the last task, on screen), Keep working goes to the first open one
    var here = app.route && app.route.name === 'task' ? lv.tasks[app.route.task - 1] : null, goSlot = '';
    if (here && here.type === 'compose' && miss.some(function (x) { return x.task === here; })) {
      var open = openSlots(here, answersOf(lv)[here.id]);
      if (open.length) goSlot = ' data-goto="slot-' + esc(here.id) + '-' + esc(open[0].id) + '"';
    }
    // mat-1 round 2: on a worksheet (the last task, on screen), Keep working goes to the first flagged box, else the
    // first empty one
    if (here && here.type === 'worksheet' && miss.some(function (x) { return x.task === here; })) {
      var wgo = wsFirstOpen(here, answersOf(lv)[here.id]);
      if (wgo) goSlot = ' data-goto="' + esc(wgo) + '"';
    }
    // sa-6 round 4 (designer optional 2): on an items task (on screen, its list or one of its items), Keep working opens
    // the first item still to check, as the list's "Check Kudalwadi" does; a compose or worksheet task already went to its
    // first open slot or box. Nothing is added while the student is on that item
    var hereI = app.route && (app.route.name === 'task' || app.route.name === 'item') ? lv.tasks[app.route.task - 1] : null;
    if (hereI && hereI.type === 'items' && miss.some(function (x) { return x.task === hereI; })) goSlot += itemGoAttr(lv, hereI);
    var el = document.createElement('div');
    el.className = 'modal-back'; el.id = 'modal';
    // acc-1 round 2 (designer S4): with work still open, Keep working is the main button here too, as on the hand-in box
    // (SPEC §9.4); the eye (blue) and the keyboard (focus) now agree on the step that ends the attempt
    el.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-t"><h2 id="m-t">Submit anyway?</h2>' + body +
      '<div class="btn-row"><button class="btn btn-primary" data-act="modal-close"' + goSlot + '>Keep working</button><button class="btn btn-secondary" data-act="submit-force">Submit anyway</button></div></div>';
    el.addEventListener('click', function (e) { if (e.target === el) closeModal(); });
    app.lastFocus = document.activeElement;
    document.body.appendChild(el);
    syncInert();
    var b = el.querySelector('[data-act="modal-close"]'); if (b) b.focus();
  }
  // Leaving a lockOnLeave task: one question, then its answers are read-only for this attempt
  function openHandInModal(lv, ti) {
    var task = lv.tasks[ti], spec = lockSpec(task) || {};
    var p = E.taskProgress(lv, task, answersOf(lv)[task.id]);
    var missing = typeof p.total === 'number' ? p.total - p.done : 0, ask = spec.ask || COPY.handInAsk, noteText = spec.note || COPY.handInNote;
    // for-1 round 1: a hunt has no total to count down, so no flags at all is the open work (Keep working stays the main
    // button), and with flags the question names how many go ("Hand your 20 flags to Manav?")
    if (task.type === 'hunt') {
      var nfl = Object.keys(E.huntFlags(answersOf(lv)[task.id])).length, hn = E.nounFor(task);
      // for-1 round 2: with nothing flagged, the second line says what the hand-in stops ("You can’t add flags after
      // this."), as "change them" had nothing to point to
      if (!nfl) { missing = 1; noteText = 'You can’t add ' + hn[1] + ' after this.'; }
      else if (!/\d/.test(ask) && ask.indexOf(' ' + hn[1] + ' ') >= 0) ask = ask.replace(' ' + hn[1] + ' ', ' ' + nfl + ' ' + (nfl === 1 ? hn[0] : hn[1]) + ' ');
    }
    var wsBad = task.type === 'worksheet' && missing > 0 ? wsUnread(task, answersOf(lv)[task.id]).length : 0;
    var miss = missing > 0 ? missLine({ type: task.type, missing: missing, noun: E.nounFor(task), bad: wsBad }) + ' ' : '';
    // sa-7 round 1 (designer S3): with slots still open on a composed text, the line names them where their titles carry
    // a short reference before " · " ("4 clauses not picked yet: (xi)(a), (xi)(b), (xiv)(a) and (xxi)."), and Keep
    // working takes the student to the first open one (data-goto: the slot's fieldset, its first option focused)
    var goSlot = '';
    if (task.type === 'compose' && missing > 0) {
      var open = openSlots(task, answersOf(lv)[task.id]);
      // sa-7 round 2 (designer S2): a word joiner (U+2060, never drawn) between ")" and "(" keeps each reference on one
      // line; the box broke "(xiv)" / "(a)" at 390 px
      var refs = open.map(function (s) { var i = String(s.label || '').indexOf(' · '); return i > 0 && i <= 16 ? String(s.label).slice(0, i).replace(/\)\(/g, ')⁠(') : null; });
      if (open.length && refs.every(Boolean)) miss = miss.replace(/\.\s$/, ': ' + (refs.length > 1 ? refs.slice(0, -1).join(', ') + ' and ' + refs[refs.length - 1] : refs[0]) + '. ');
      if (open.length) goSlot = ' data-goto="slot-' + esc(task.id) + '-' + esc(open[0].id) + '"';
    }
    // mat-1 round 2 (designer S1): with boxes open on a worksheet, Keep working goes to the first flagged box ("can’t be
    // read"), else the first empty one, as an item's "Check 1 box" goes to its flagged box first
    if (task.type === 'worksheet' && missing > 0) {
      var wgo = wsFirstOpen(task, answersOf(lv)[task.id]);
      if (wgo) goSlot = ' data-goto="' + esc(wgo) + '"';
    }
    // sa-6 round 4 (designer optional 2): with items still to check, Keep working opens the first of them
    if (task.type === 'items' && missing > 0) goSlot += itemGoAttr(lv, task);
    var el = document.createElement('div');
    el.className = 'modal-back'; el.id = 'modal';
    el.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="m-t" aria-describedby="m-d"><h2 id="m-t">' + esc(ask) + '</h2>' +
      '<p id="m-d">' + esc(miss + noteText) + '</p>' +
      '<div class="btn-row"><button class="btn ' + (missing > 0 ? 'btn-primary' : 'btn-secondary') + '" data-act="modal-close"' + goSlot + '>Keep working</button><button class="btn ' + (missing > 0 ? 'btn-secondary' : 'btn-primary') + '" data-act="hand-in-yes" data-index="' + ti + '">' + esc(spec.yes || COPY.handInYes) + '</button></div></div>';
    el.addEventListener('click', function (e) { if (e.target === el) closeModal(); });
    app.lastFocus = document.activeElement;
    document.body.appendChild(el);
    syncInert();
    var b = el.querySelector('[data-act="modal-close"]'); if (b) b.focus();
  }
  // sa-7 round 1 (designer S3): Keep working on a hand-in with open slots: the first open slot comes to the top of the
  // screen, under the sticky bar, with its first option focused (ArrowDown then walks its options)
  // mat-1 round 2: the id may name a worksheet box itself; its row (a card on a phone) comes to the top, the box focused
  // sa-7 round 2 (designer optional 1): a slot that opens a part of the text under its own heading ("Fraud" above
  // (xi)(a)) brings the heading to the top with it, so the student sees which part the open clause is in
  function goToSlot(id) {
    var fs = document.getElementById(id); if (!fs) return;
    var self = /^(INPUT|SELECT|TEXTAREA)$/.test(fs.tagName), box = self ? (fs.closest('tr') || fs) : fs;
    var head = !self && fs.previousElementSibling;
    if (head && head.classList.contains('slot-head')) box = head;
    var top = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top'), 10) || 60;
    window.scrollTo(0, Math.max(0, box.getBoundingClientRect().top + window.scrollY - top - 12));
    var r = self ? (fs.disabled ? null : fs) : fs.querySelector('input:not([disabled])');
    if (r) { try { r.focus({ preventScroll: true }); } catch (e) { r.focus(); } }
  }
  function closeModal() {
    var m = $('#modal'); if (!m) return;
    m.parentNode.removeChild(m);
    syncInert();
    if (app.lastFocus && document.contains(app.lastFocus)) app.lastFocus.focus();
  }
  function openBin(docId, binId, opener) {
    var lv = currentLevel(); if (!lv) return;
    var doc = E.findDoc(lv, docId); if (!doc) return;
    var b = (doc.bins || []).filter(function (x) { return x.id === binId; })[0]; if (!b) return;
    closeSheet(true);
    var el = document.createElement('div');
    el.className = 'sheet-pop'; el.id = 'sheet-pop';
    el.innerHTML = '<div class="sp-in" role="dialog" aria-modal="true" aria-labelledby="sp-t"><div class="sp-head"><h2 id="sp-t">' + esc('Bin ' + b.pos + ' · ' + b.item) + '</h2><button class="icon-btn" data-act="sheet-close" aria-label="Close bin card">' + SVG.close + '</button></div>' +
      D.renderBinCard(doc, binId, docCtx(lv)) + '</div>';
    el.addEventListener('click', function (e) { if (e.target === el) closeSheet(); });
    app.binOpener = opener;
    document.body.appendChild(el);
    syncInert();
    var c = el.querySelector('[data-act="sheet-close"]'); if (c) c.focus();
  }
  function closeSheet(silent) {
    var s = $('#sheet-pop'); if (!s) return;
    s.parentNode.removeChild(s);
    syncInert();
    if (!silent && app.binOpener && document.contains(app.binOpener)) app.binOpener.focus();
  }
  function showToast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t);
    // sa-1 round 5 (designer optional 2): a toast never sits on a button or link the student may tap next ("Added to
    // your CV" covered "Next level" at the foot of the phone's done screen); over one, it shows under the top bar instead
    function covers() {
      var tr = t.getBoundingClientRect();
      return $all('main a, main button, main input, .actionbar a, .actionbar button').some(function (el) {
        var r = el.getBoundingClientRect();
        return r.width && r.height && r.bottom > tr.top && r.top < tr.bottom && r.right > tr.left && r.left < tr.right;
      });
    }
    // sa-1 round 7 (designer optional 3): the same test runs again on every scroll while the toast shows, so a student
    // who taps Add and then scrolls to the foot never finds it over "Next level"; once moved up, it stays up
    function onScroll() { if (t.parentNode && !/\btoast-top\b/.test(t.className) && covers()) t.className += ' toast-top'; }
    if (covers()) t.className += ' toast-top';
    else window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    setTimeout(function () {
      window.removeEventListener('scroll', onScroll, { capture: true });
      if (t.parentNode) t.parentNode.removeChild(t);
    }, 2200);
  }
  function copyText(text) {
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok ? Promise.resolve() : Promise.reject(new Error('copy'));
    }
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).catch(fallback);
    return fallback();
  }
  function addCv(domainId) {
    var d = domain(domainId); if (!d) return;
    var line = E.domainLine(app.cat, app.state, domainId, PREVIEW);
    if (!line) return;
    app.ui.adding = domainId; softRender();
    app.store.addCvLine({ domain: domainId, cvName: d.cvName, line: line }).then(function (res) {
      app.ui.adding = null;
      // consistency pass round 1 (I03): the line counts as added only when a site hook took it or cv_maker_data was
      // written; a CV that cannot be read (skipped) or a write that failed (storage full or blocked) keeps the Add
      // button, and the student is asked to copy the line
      var ok = !!res && (res.hook || res.cv === 'created' || res.cv === 'added' || res.cv === 'updated');
      if (ok) {
        var s = E.normalizeState(JSON.parse(JSON.stringify(app.state)));
        var c = s.cv[domainId] || { picks: [], updatedAt: 0 };
        c.addedLine = line; c.addedAt = Date.now(); c.updatedAt = c.addedAt; s.cv[domainId] = c; s.updatedAt = c.addedAt;
        commit(s, { now: true });
      }
      softRender();
      cvFocus(domainId, ok);
      var msg = ok ? 'Added to your CV' : 'Copy the line into your CV';
      announce(msg);
      showToast(msg);
    }, function () { app.ui.adding = null; softRender(); cvFocus(domainId, false); announce('Copy the line into your CV'); showToast('Copy the line into your CV'); });
  }
  // consistency pass round 2 (P2-03): after Add, focus stays on the card it was pressed on (WCAG 2.4.3): its "Open CV
  // Builder" link once the line is added, else its own Add button; never <body> or another domain's card
  function cvFocus(domainId, added) {
    var card = null;
    $all('section.cvcard').forEach(function (c) { if (c.getAttribute('aria-labelledby') === 'cv-' + domainId) card = c; });
    card = card || $('#done');
    if (!card) return;
    var t = (added && card.querySelector('.added-row a')) || card.querySelector('[data-act="add-cv"][data-domain="' + CSS.escape(domainId) + '"]') || card.querySelector('.added-row a');
    if (t) { try { t.focus({ preventScroll: true }); } catch (e) { t.focus(); } }
  }
  function setPick(domainId, levelId, on) {
    var picks = E.cvPicks(app.cat, app.state, domainId, PREVIEW).slice();
    var i = picks.indexOf(levelId);
    if (on && i < 0) { if (picks.length >= 2) return; picks.push(levelId); }
    if (!on && i >= 0) {
      // consistency pass round 2 (P2-03): the only pick stays ticked, and the student is told why
      if (picks.length <= 1) { softRender(); var why = 'A line needs one level. Tick another level first.'; announce(why); showToast(why); return; }
      picks.splice(i, 1);
    }
    var s = E.normalizeState(JSON.parse(JSON.stringify(app.state)));
    var c = s.cv[domainId] || { picks: [], updatedAt: 0 };
    c.picks = picks; c.chosen = true; c.updatedAt = Date.now(); s.cv[domainId] = c; s.updatedAt = c.updatedAt;
    commit(s);
    softRender();
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (a && !e.defaultPrevented) {
      if (a.getAttribute('aria-disabled') === 'true' || a.getAttribute('href') === '#') { e.preventDefault(); return; }
      if (a.getAttribute('data-act') === 'modal-go') { app.lastFocus = null; closeModal(); }
      var href = a.getAttribute('href');
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || (e.button && e.button !== 0)) return;   // a new tab or window
      if (a.hasAttribute('data-up')) { e.preventDefault(); app.fromLink = true; goUp(href); return; }
      if (a.hasAttribute('data-replace')) { e.preventDefault(); go(href, true); return; }
      app.fromLink = true;
      if (href === location.hash) { e.preventDefault(); onRoute(); }
      else app.nav = 'push';
      return;
    }
    // the same call tapped again on the opened four calls (no change event) folds them too
    var gpick = e.target.closest ? e.target.closest('#ibar.gate-change .ibar-gate .seg-opt') : null;
    if (gpick) { var gin = gpick.querySelector('input'); if (gin && gin.checked) setTimeout(function () { closeGateChange(true); }, 0); }
    var bin = e.target.closest ? e.target.closest('[data-bin]') : null;
    if (bin) { var dEl = bin.closest('[data-doc]'); if (dEl) openBin(dEl.getAttribute('data-doc'), bin.getAttribute('data-bin'), bin); return; }
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), lv = currentLevel();
    switch (act) {
      case 'start': startLevel(); break;
      case 'try-again': tryAgain(b.getAttribute('data-level')); break;
      case 'submit': submit(false); break;
      case 'hand-in': if (lv) openHandInModal(lv, parseInt(b.getAttribute('data-index'), 10) || 0); break;
      case 'hand-in-yes':
        if (!lv) break;
        var hIdx = parseInt(b.getAttribute('data-index'), 10) || 0, hTask = lv.tasks[hIdx];
        app.lastFocus = null; closeModal();
        if (hTask) commit(E.lockTask(app.state, lv.id, hTask.id, Date.now()), { now: true });
        go('#/l/' + lv.id + '/t/' + (hIdx + 2));
        break;
      case 'sign':
        var sBox = b.closest('.num'), sIn = sBox && sBox.querySelector('input');
        if (!sIn || sIn.disabled) break;
        sIn.value = E.toggleSign(sIn.value);
        onField(sIn, true);
        syncSign(sIn);
        if (E.parseNumber(sIn.value) === null) { sIn.focus(); try { sIn.setSelectionRange(sIn.value.length, sIn.value.length); } catch (er2) { /* ignore */ } }
        announce(E.isNegativeText(sIn.value) ? 'Minus' : 'Plus');
        break;
      case 'submit-force': submit(true); break;
      case 'modal-close':
        var gto = b.getAttribute('data-goto'), ghr = b.getAttribute('data-href');
        closeModal();
        if (ghr) go(ghr);
        else if (gto) goToSlot(gto);
        break;
      case 'sheet-close': closeSheet(); break;
      case 'hint-ask': app.ui.hint = b.getAttribute('data-task'); softRender(); var y = $('[data-act="hint-yes"]'); if (y) y.focus(); break;
      case 'hint-no': app.ui.hint = null; softRender(); break;
      case 'hint-yes':
        if (lv) {
          commit(E.useHint(app.state, lv, b.getAttribute('data-task'), Date.now()), { now: true }); app.ui.hint = null; app.ui.hintOpen = b.getAttribute('data-task'); softRender();
          var hb = $('#hint-box .sticky:last-child') || $('#hint-box .hint-inline .hi-body p:last-child');
          if (hb) { hb.setAttribute('tabindex', '-1'); hb.focus(); }
        }
        break;
      case 'filter': app.ui.filter[b.getAttribute('data-key')] = b.getAttribute('data-val'); softRender(); break;
      case 'view': app.ui.view[b.getAttribute('data-key')] = b.getAttribute('data-val'); softRender(); break;
      case 'gate-change': openGateChange(); break;
      case 'rfilter': app.ui.rfilter[b.getAttribute('data-key')] = b.getAttribute('data-val'); softRender(); break;
      case 'tab':
        app.ui.tab[b.getAttribute('data-key')] = parseInt(b.getAttribute('data-val'), 10) || 0;
        softRender();
        var tb = document.querySelector('.tab[aria-selected="true"]'); if (tb && tb.offsetParent) tb.focus();
        showFocusRow();
        break;
      case 'pane-go':   // a sheet tab in the desktop pane: the same select-and-show as the arrows
        app.ui.pane[b.getAttribute('data-key')] = Math.max(0, parseInt(b.getAttribute('data-idx'), 10) || 0); softRender();
        var dg = $('.docs-pane'); if (dg) dg.scrollTop = 0;
        break;
      case 'pane-step':
        var key = b.getAttribute('data-key'); var cur = app.ui.pane[key] || 0;
        app.ui.pane[key] = Math.max(0, cur + parseInt(b.getAttribute('data-step'), 10)); softRender();
        var ds = $('.docs-pane'); if (ds) ds.scrollTop = 0;
        break;
      case 'move':
        if (!lv) break;
        var task = E.findTask(lv, b.getAttribute('data-task')), step = b.getAttribute('data-step'), dir = parseInt(b.getAttribute('data-dir'), 10);
        var order = E.currentOrder(lv, task, answersOf(lv)[task.id]), i = order.indexOf(step), j = i + dir;
        if (i < 0 || j < 0 || j >= order.length) break;
        order.splice(i, 1); order.splice(j, 0, step);
        // ia-1 round 1: the moved row stays under the finger (or the mouse): the page scrolls by as much as the row moved,
        // so the arrow just tapped is where it was and the list slides under it (at the top of the page the scroll stops
        // and the row moves the last bit itself)
        var li0 = b.closest('li'), y0 = li0 ? li0.getBoundingClientRect().top : null;
        commit(E.setTaskKey(E.setTaskKey(app.state, lv.id, task.id, 'order', order), lv.id, task.id, 'touched', true));
        app.ui.moved = step;
        keepFocus(function () { render(false); });
        app.ui.moved = null;
        var li1 = $('#order-list li[data-step="' + CSS.escape(step) + '"]');
        if (li1 && y0 !== null) { var dy = li1.getBoundingClientRect().top - y0; if (Math.abs(dy) >= 1) window.scrollTo(0, Math.max(0, window.scrollY + dy)); }
        var mb = $('[data-act="move"][data-step="' + CSS.escape(step) + '"][data-dir="' + dir + '"]');
        if (!mb || mb.disabled) mb = $('[data-act="move"][data-step="' + CSS.escape(step) + '"]:not([disabled])');
        if (mb) { try { mb.focus({ preventScroll: true }); } catch (e) { mb.focus(); } }
        announce('Moved to step ' + (j + 1) + ' of ' + order.length);
        break;
      case 'hunt-toggle':
        if (!lv) break;
        var ht = E.findTask(lv, b.getAttribute('data-task')), hs = huntState(ht), k2 = b.getAttribute('data-val');
        // for-1 round 1: one test at a time (each button looks like one of the lead's tests, and two stacked read "No
        // rows match"); turning a test on or off also drops the vendor picked from the match panel. Search and Flagged
        // still combine with a test
        if (HUNT_TESTS.indexOf(k2) >= 0) { var hto = !hs[k2]; HUNT_TESTS.forEach(function (x) { hs[x] = false; }); hs[k2] = hto; hs.party = null; }
        else hs[k2] = !hs[k2];
        hs.limit = 60; hs.pop = null; softRender(); break;
      case 'hunt-clear':
        if (!lv) break;
        var hcl = huntState(E.findTask(lv, b.getAttribute('data-task')));
        hcl.q = ''; hcl.party = null; hcl.flagged = false; HUNT_TESTS.forEach(function (x) { hcl[x] = false; }); hcl.limit = 60; hcl.pop = null;
        softRender();
        var hq0 = $('[data-hunt-q="' + CSS.escape(b.getAttribute('data-task')) + '"]') || $('.hunt-tools .toggle');
        if (hq0) { try { hq0.focus({ preventScroll: true }); } catch (e) { hq0.focus(); } }
        announce('Filters cleared');
        break;
      case 'hunt-top':
        var htools = $('.hunt-tools');
        if (htools) {
          window.scrollTo(0, Math.max(0, htools.getBoundingClientRect().top + window.scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top'), 10) || 60) - 12));
          var htf = $('.hunt-tools .toggle[aria-pressed="true"]') || $('.hunt-tools input, .hunt-tools .toggle');
          if (htf) { try { htf.focus({ preventScroll: true }); } catch (e) { htf.focus(); } }
        }
        break;
      case 'hunt-more': if (lv) { huntState(E.findTask(lv, b.getAttribute('data-task'))).limit += 60; softRender(); } break;
      case 'hunt-party':
        if (lv) { var hp = huntState(E.findTask(lv, b.getAttribute('data-task'))); hp.party = b.getAttribute('data-val') || null; hp.limit = 60; softRender(); var hc = $('.hunt-count'); if (hc) hc.scrollIntoView({ block: 'nearest' }); }
        break;
      case 'hunt-pop':
        if (!lv) break;
        var hq = huntState(E.findTask(lv, b.getAttribute('data-task'))), row = b.getAttribute('data-row'), hwas = hq.pop;
        hq.pop = row && hq.pop !== row ? row : null; softRender();
        // for-1 round 1: the reason box opens whole above the sticky bar; Cancel (or Escape) puts focus back on the row's
        // Flag button, not at the top of the page
        if (hq.pop) {
          var rpop = $('.reason-pop'); if (rpop) revealAboveBar(rpop);
          var first = $('.reason-pop button'); if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
        } else if (hwas) focusFlag(hwas);
        break;
      case 'hunt-flag': case 'hunt-unflag':
        if (!lv) break;
        var tid = b.getAttribute('data-task'), rid = b.getAttribute('data-row'), val = act === 'hunt-flag' ? b.getAttribute('data-val') : null;
        commit(E.updateAnswers(app.state, lv.id, tid, function (cur) {
          cur = cur && typeof cur === 'object' ? cur : {}; cur.flags = cur.flags || {};
          if (val) cur.flags[rid] = val; else delete cur.flags[rid];
          return cur;
        }, Date.now()));
        huntState(E.findTask(lv, tid)).pop = null; softRender();
        var fb = $('.hrow[data-row="' + CSS.escape(rid) + '"] .flag-btn'); if (fb) fb.focus();
        announce(val ? 'Flagged' : 'Flag removed');
        break;
      case 'copy':
        var text = b.getAttribute('data-text'), ck = b.getAttribute('data-key');
        copyText(text).then(function () { app.ui.copied = ck; softRender(); announce('Copied'); setTimeout(function () { if (app.ui.copied === ck) { app.ui.copied = null; softRender(); } }, 2000); }, function () { showToast('Select the line and copy it'); });
        break;
      case 'add-cv': addCv(b.getAttribute('data-domain')); break;
      case 'sx': pageTable(b); break;
      case 'to-fields':
        var fp = $('#fields');
        if (fp) {
          var top = fp.getBoundingClientRect().top + window.scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--top'), 10) || 60) - 12;
          window.scrollTo({ top: top, behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
          // a flagged box first ("Check 1 box"), then the first one still empty
          var empty = $('#fields input[aria-invalid="true"]') || $all('#fields input[type="text"], #fields select, #fields input[type="radio"], #fields input[type="checkbox"]').filter(function (x) {
            if (x.type === 'radio' || x.type === 'checkbox') return !$all('input[name="' + CSS.escape(x.name) + '"]:checked').length;
            return !x.value;
          })[0];
          if (empty) { try { empty.focus({ preventScroll: true }); } catch (er) { empty.focus(); } }
        }
        break;
      case 'print':
        // the logo must be decoded before the print snapshot is taken
        var imgs = $all('#sheet img');
        if (imgs.every(function (im) { return im.complete && im.naturalWidth > 0; })) { fitSample(); printPage(); break; }
        Promise.all(imgs.map(function (im) { return im.decode ? im.decode().catch(function () {}) : null; })).then(function () { fitSample(); printPage(); });
        break;
      default: break;
    }
  });

  function onField(el, isInput) {
    var lv = currentLevel();
    if (el.getAttribute('data-bind') === 'my-domain') {
      app.myDomain = el.value || null;
      app.domainTouched = true;
      app.store.setDomain(app.myDomain);
      softRender(); return;
    }
    if (el.getAttribute('data-bind') === 'sample-name') {
      var s = E.normalizeState(JSON.parse(JSON.stringify(app.state)));
      s.sampleName = el.value.slice(0, 60); s.updatedAt = Date.now();
      commit(s);
      var sh = $('#sheet .sh-by');
      if (sh) sh.innerHTML = '<b>Prepared by:</b> ' + (s.sampleName ? esc(s.sampleName) : '______________________');
      return;
    }
    if (el.getAttribute('data-bind') === 'other-doc') {
      app.ui.other[el.getAttribute('data-key')] = parseInt(el.value, 10) || 0; softRender(); showFocusRow(); return;
    }
    if (el.getAttribute('data-bind') === 'pane-doc') {
      app.ui.pane[el.getAttribute('data-key')] = parseInt(el.value, 10) || 0; softRender();
      var ds = $('.docs-pane'); if (ds) ds.scrollTop = 0; return;
    }
    if (el.hasAttribute('data-pick')) { setPick(el.getAttribute('data-pick'), el.value, el.checked); return; }
    if (!lv) return;
    var now = Date.now();
    if (el.hasAttribute('data-field')) {
      var tid = el.getAttribute('data-task'), iid = el.getAttribute('data-item'), fid = el.getAttribute('data-field'), kind = el.getAttribute('data-kind');
      var val;
      if (kind === 'multi') val = $all('input[name="' + CSS.escape(el.name) + '"]:checked').map(function (x) { return x.value; });
      else val = el.value;
      commit(E.setItemField(app.state, lv.id, tid, iid, fid, val, now));
      var task = E.findTask(lv, tid), it = (task.items || []).filter(function (x) { return x.id === iid; })[0];
      if (it) updateMoreBelow(lv, task, it);
      // a four-way call on a phone folds once made: a tap folds it at once (focus to the folded call, as the picked
      // button is gone); arrow keys keep it open until focus leaves the calls
      var gf = gateField(task), gbar = document.getElementById('ibar');
      if (it && gf && gf.id === fid) syncGateSum(lv, task, it);
      if (it && gf && gf.id === fid && gbar && gbar.classList.contains('gate-grid') && !DESKTOP.matches) {
        if (Date.now() - (app.lastPointer || 0) < 1500) { gbar.classList.add('gate-change'); closeGateChange(true); }
        else gbar.classList.add('gate-change');
      }
      if (!isInput && (kind === 'choice' || kind === 'multi')) {
        var f0 = $('#fields'), wasEmpty = f0 ? f0.classList.contains('empty') : true, before = f0 ? f0.innerHTML : '';
        keepFocus(function () {
          var f = $('#fields');
          if (f && it) { var html = fieldsHtml(lv, task, it, 'rest'); f.innerHTML = html; f.classList.toggle('empty', !html); }
        });
        if (it) updateMoreBelow(lv, task, it);
        var f1 = $('#fields');
        // on a phone, a call that opens new questions brings them into view
        if (f1 && !DESKTOP.matches && el.closest('#ibar') && !f1.classList.contains('empty') && (wasEmpty || f1.innerHTML.length > before.length)) {
          var rect = f1.getBoundingClientRect(), bar = $('#ibar');
          var barH = bar ? bar.getBoundingClientRect().height : 0;
          if (rect.top > window.innerHeight - barH - 60 || rect.top < 70) window.scrollTo({ top: window.scrollY + rect.top - 80, behavior: 'smooth' });
        }
      }
      return;
    }
    if (el.hasAttribute('data-ws')) {
      var wt = el.getAttribute('data-ws');
      commit(E.setTaskKey(app.state, lv.id, wt, el.getAttribute('data-key'), el.value, now));
      var wtask = E.findTask(lv, wt), p = E.taskProgress(lv, wtask, answersOf(lv)[wt]);
      var wp = $('#ws-prog'); if (wp) wp.textContent = wsProgText(wtask, p);
      var pbar = wp && wp.parentNode.querySelector('.bar i'); if (pbar) pbar.style.width = Math.round(p.done / Math.max(1, p.total) * 100) + '%';
      return;
    }
    if (el.hasAttribute('data-q')) {
      var qt = el.getAttribute('data-task'), qid = el.getAttribute('data-q');
      var qv = el.getAttribute('data-multi') === '1' ? $all('input[name="' + CSS.escape(el.name) + '"]:checked').map(function (x) { return x.value; }) : el.value;
      commit(E.setTaskKey(app.state, lv.id, qt, qid, qv, now));
      return;
    }
    if (el.hasAttribute('data-slot')) {
      var ct = el.getAttribute('data-task');
      commit(E.setTaskKey(app.state, lv.id, ct, el.getAttribute('data-slot'), el.value, now));
      var ctask = E.findTask(lv, ct), ca = answersOf(lv)[ct] || {};
      rerenderPart('compose-preview', composePreview(ctask, ca));
      // sa-7 round 1: the count of picks above the slots follows each pick (composeProgress)
      var cp = $('#cmp-prog');
      if (cp) {
        var cpp = E.taskProgress(lv, ctask, ca); cp.textContent = composeProgText(ctask, cpp);
        var cbar = cp.parentNode.querySelector('.bar i'); if (cbar) cbar.style.width = Math.round(cpp.done / Math.max(1, cpp.total) * 100) + '%';
      }
      announce(capWord(ctask.previewLabel || 'Your note') + ' updated');
      return;
    }
    if (el.hasAttribute('data-free')) {
      var ft = el.getAttribute('data-free');
      commit(E.setTaskKey(app.state, lv.id, ft, '_free', el.value.slice(0, 400), now));
      var ftask = E.findTask(lv, ft), fa = answersOf(lv)[ft] || {};
      rerenderPart('compose-preview', composePreview(ftask, fa));
      return;
    }
    if (el.hasAttribute('data-hunt-q')) {
      var hs = huntState(E.findTask(lv, el.getAttribute('data-hunt-q')));
      hs.q = el.value; hs.limit = 60; hs.pop = null;
      clearTimeout(app.huntTimer);
      var htid = el.getAttribute('data-hunt-q');
      app.huntTimer = setTimeout(function () {
        var task = E.findTask(lv, htid);
        rerenderPart('hunt-res-' + htid, huntResults(lv, task, answersOf(lv)[htid]));
      }, 160);
      return;
    }
    if (el.hasAttribute('data-hunt-sort')) {
      var hs2 = huntState(E.findTask(lv, el.getAttribute('data-hunt-sort')));
      hs2.sort = el.value; softRender();
    }
  }
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el.matches('input[type="text"], textarea, input[type="search"]') && !el.hasAttribute('data-bind')) {
      // a typed figure is shown back in Indian grouping once the student leaves the box (the number stays the same)
      if (el.hasAttribute('data-ws') || el.getAttribute('data-kind') === 'number') tidyNumberInput(el);
      if (el.hasAttribute('data-ws')) padRupeeCell(el);
      return;
    }
    onField(el, false);
  });
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.matches('input[type="text"], textarea, input[type="search"]')) {
      // a flagged number box clears as soon as what is typed reads as a figure (it is flagged again only on leaving)
      if (el.getAttribute('aria-invalid') === 'true' && el.getAttribute('data-kind') === 'number') {
        var nf = numberField(el); if (nf && !E.numberInvalid(nf, el.value)) markNumber(el, nf, false);
      }
      // mat-1 round 2: a flagged worksheet box too
      if (el.getAttribute('aria-invalid') === 'true' && el.hasAttribute('data-ws')) {
        var wf = wsFieldOf(el); if (wf && !E.numberInvalid(wf, E.readTyped(wf, el.value))) markNumber(el, wf, false);
      }
      onField(el, true);
      if (el.hasAttribute('data-ws') || el.getAttribute('data-kind') === 'number') syncSign(el);
    }
  });
  document.addEventListener('pointerdown', function () { app.lastPointer = Date.now(); }, true);
  // the four calls opened from the folded call fold back when focus leaves them (a tap elsewhere, Tab on)
  document.addEventListener('focusout', function (e) {
    var g = e.target && e.target.closest ? e.target.closest('#ibar.gate-change .ibar-gate') : null;
    if (!g) return;
    setTimeout(function () { var bar = document.getElementById('ibar'); if (bar && !bar.querySelector('.ibar-gate').contains(document.activeElement)) closeGateChange(false); }, 0);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if ($('#modal')) { closeModal(); return; }
      if ($('#sheet-pop')) { closeSheet(); return; }
      if ($('#ibar.gate-change')) { closeGateChange(true); return; }
      // for-1 round 1: Escape closes a hunt row's reason box as Cancel does
      var rcan = $('.reason-pop [data-act="hunt-pop"]'); if (rcan && !$('.viewer')) { rcan.click(); return; }
      var close = $('.viewer [data-close]'); if (close) { app.fromLink = true; goUp(close.getAttribute('href')); return; }
    }
    if ($('#modal') && e.key === 'Tab') {
      var f = $all('#modal button'); if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
    var v = $('.viewer');
    if (v && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) {
      stepViewer(v, e.key === 'ArrowRight' ? 1 : -1);
    }
    var tab = e.target.closest && e.target.closest('.tab');
    if (tab && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      var tabs = $all('.tab', tab.parentNode), i = tabs.indexOf(tab), j = (i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      e.preventDefault(); tabs[j].click();
    }
  });
  // Inside MSC's app a WebView may ignore window.print(): the host can offer its own print (INTEGRATION.md §6a)
  function printPage() {
    var A = window.MSCApp;
    if (A && typeof A.print === 'function') { try { A.print(); return; } catch (e) { /* fall back to the browser */ } }
    window.print();
  }
  function stepViewer(v, dir) {
    var base = v.getAttribute('data-viewer-base'), n = parseInt(v.getAttribute('data-count'), 10), i = parseInt(v.getAttribute('data-idx'), 10);
    if (!i) return;
    var j = i + dir;
    if (j < 1 || j > n) return;
    go(base + j, true);
  }
  var touch = null;
  document.addEventListener('touchstart', function (e) {
    var vb = e.target.closest && e.target.closest('.viewer-body');
    if (!vb || e.touches.length !== 1 || e.target.closest('.doc-scroll')) { touch = null; return; }
    touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (!touch) return;
    var t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    var v = $('.viewer');
    if (v && Math.abs(dx) > 70 && Math.abs(dy) < 45 && Date.now() - touch.t < 600) stepViewer(v, dx < 0 ? 1 : -1);
    touch = null;
  }, { passive: true });
  if (DESKTOP.addEventListener) DESKTOP.addEventListener('change', function () { softRender(); });
  else if (DESKTOP.addListener) DESKTOP.addListener(function () { softRender(); });

  /* ------------------------------------------------------------------ boot */
  function checkGate() {
    var A = window.MSCProgramAccess;
    if (!A || typeof A.getAccess !== 'function') return;
    Promise.resolve().then(function () { return A.getAccess(); }).then(function (acc) {
      if (!acc || typeof acc !== 'object') return;
      var courses = Array.isArray(acc.courses) ? acc.courses.map(function (c) { return String(c && c.slug ? c.slug : c).toLowerCase(); }) : null;
      var ok = courses ? courses.indexOf(COURSE) >= 0 : acc.hasAccess !== false;
      if (!ok) { app.gated = true; render(true); }
    }, function () { /* courtesy gate only: stay open on errors */ });
  }
  // SPEC §2: no service worker. Unregister any left over from an earlier deploy of this path.
  function dropServiceWorkers() {
    try {
      var sw = navigator.serviceWorker;
      if (!sw || !sw.getRegistrations) return;
      var here = location.pathname.replace(/[^/]*$/, '');
      sw.getRegistrations().then(function (regs) {
        regs.forEach(function (r) { try { if (new URL(r.scope).pathname.indexOf(here) === 0) r.unregister(); } catch (e) { /* ignore */ } });
      }, function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }
  function loadLogo() {
    fetch('img/logo/msc-logo-horizontal-colour.svg', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      var i = t.indexOf('<svg');
      if (i < 0 || /<script|<foreignObject|\son[a-z]+\s*=|javascript:/i.test(t)) return;
      app.logoSvg = t.slice(i).replace(/<svg([^>]*?)\swidth="[^"]*"/, '<svg$1').replace(/<svg([^>]*?)\sheight="[^"]*"/, '<svg$1')
        .replace('<svg', '<svg aria-hidden="true" focusable="false"').replace(/<title>[^<]*<\/title>/, '');
      if (app.route.name === 'sample') softRender();
    }, function () { /* the <img> stays */ });
  }
  // consistency pass round 1 (I02): the account's copy is merged into the page's state as it is now (per level the
  // newer updatedAt wins), never put in its place, so an attempt started while MSCProgress.load was still answering
  // (Start tapped at 3 s on a slow phone) stays, with its route
  function adoptRemote(merged) {
    if (!merged) return;
    var next = E.mergeStates(app.state, merged);
    if (JSON.stringify(next) === JSON.stringify(app.state)) return;
    app.state = app.store.save(next);
    var a = document.activeElement;
    if (a && /INPUT|TEXTAREA/.test(a.tagName)) return;
    softRender();
  }
  function boot() {
    dropServiceWorkers();
    loadLogo();
    app.store = S.createStore({ global: window });
    // the page's first history entry is marked, so a walk back past stale task entries (workScreen) stops there
    try { history.replaceState({ wsBoot: 1 }, '', location.href); } catch (e) { /* ignore */ }
    app.state = app.store.loadLocal();
    app.myDomain = app.store.getDomainLocal();
    window.addEventListener('hashchange', onRoute);
    app.route = parseRoute(location.hash);
    app.routeKey = location.hash || '#/';
    render(true);
    Promise.all([fetchJSON('data/catalogue.json'), fetchJSON('data/world.json').catch(function () { return {}; })]).then(function (res) {
      app.cat = res[0]; app.world = res[1] || {};
      render(true);
      checkGate();
      app.store.onRemote(adoptRemote);
      app.store.load().then(adoptRemote);
      // a domain the student picks while the account is still answering is not overwritten by that late answer
      app.store.getDomain().then(function (d) { if (!app.domainTouched && d !== app.myDomain) { app.myDomain = d; if (app.route.name === 'home') softRender(); } });
    }, function () {
      root.innerHTML = errorScreen();
    });
  }
  window.MSCWSApp = { state: function () { return app.state; }, route: function () { return app.route; } };
  boot();
})();
