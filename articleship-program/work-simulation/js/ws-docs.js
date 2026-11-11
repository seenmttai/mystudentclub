/* MSC Articleship Program · Work Simulation document renderers (UMD, pure: JSON -> HTML string).
   Every string from a level file is escaped here. Browser: window.MSCWSDocs. Node: require('./ws-docs.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ws-engine.js'));
  else root.MSCWSDocs = factory(root.MSCWSEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  /* ------------------------------------------------------------------ basics */
  function esc(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function arr(v) { return Array.isArray(v) ? v : (v === undefined || v === null ? [] : [v]); }
  function r2(x) { return Math.round(x * 100) / 100; }
  function money(n) { return isNum(n) ? E.formatNumber(n, 2) : ''; }          // 48,970.00
  // a code: capitals (digits may follow), a hyphen, then groups of capitals and digits joined by hyphens or slashes,
  // with at least one digit somewhere (TC-35, FA-27-01/1, serials SMT-V85-27-0114 and HTS-CMM-0726, GSTR-2B); a code
  // that starts with a slash group (KS/2026-27/4418), a date, a part code like 6306-ZZ and lower-case words are left
  // to the rules below (nwParts, nwDates). gst-2 round 1: a plural keeps its code whole ("GSTR-1s", "GSTR-3Bs"), as
  // Chrome broke "Chakan’s GSTR-" / "1s?" in a hint and the fail bubble. sa-1 round 6 (designer S1): a joined group
  // runs to 7 characters, so an Udyam number ("UDYAM-MH-26-0906352", a 7-digit serial) is held whole too; the bill
  // broke it "UDYAM-MH-26-" / "0906352" at 390 and 360 px
  var CODE_RE = /(^|[^\w\-\/&;#])([A-Z][A-Z0-9]{0,5}-[A-Z0-9]{1,6}(?:[-\/][A-Z0-9]{1,7})*s?)(?![\w\-])/g;
  function nwCodes(h) {
    return String(h).replace(CODE_RE, function (m, pre, code) { return /\d/.test(code) ? pre + '<span class="nw">' + code + '</span>' : m; });
  }
  // val-1: a year or a range written with an en dash ("2022–23", "₹150–250 crore", "12–14%") stays on one line, as a
  // printed statement never splits "2030–31"; a hyphenated year in a document number ("KS/2026-27/4418") is nwDates'
  var RANGE_RE = /(^|[^\w>.,–\-\/#])(₹?\d(?:[\d,.]*\d)?–\d(?:[\d,.]*\d)?%?)(?![\w%–])/g;
  function nwRanges(h) { return String(h).replace(RANGE_RE, '$1<span class="nw">$2</span>'); }
  // con-1 round 2 (designer S1): a figure keeps its unit word and a clock time stays whole ("we sold 1.3" / "lakh more",
  // "₹27" / "crore less" in a mail on a phone; "7:15 pm"); a range held above takes its unit too ("₹150–250 crore").
  // "₹ lakh" with no figure is left alone
  var UNIT_RE = /(^|[^\w>.,:–\-\/#&;₹+−])([+−-]?₹?\d(?:[\d,.:]*\d)?[  ](?:lakh|crore|am|pm)(?![\w\-]))/g;
  var UNIT_RANGE_RE = /(<span class="nw">₹?\d(?:[\d,.]*\d)?–\d(?:[\d,.]*\d)?)<\/span>([  ](?:lakh|crore)(?![\w\-]))/g;
  function nwUnits(h) { return String(h).replace(UNIT_RE, '$1<span class="nw">$2</span>').replace(UNIT_RANGE_RE, '$1$2</span>'); }
  // sa-2: a part code of digits, a hyphen and a group with a capital ("6306-ZZ", "6205-2RS") stays on one line too
  // (a QC tag broke "6306-" / "ZZ"); a year range ("2026-27") and dates are left
  var PART_RE = /(^|[^\w\-\/&;#>])(\d{3,}-(?=[A-Z0-9]{0,3}[A-Z])[A-Z0-9]{1,4})(?![\w\-])/g;
  function nwParts(h) { return String(h).replace(PART_RE, '$1<span class="nw">$2</span>'); }
  // dt-3: a section number with its brackets stays on one line ("36(1)" / "(va)", "143(1)" / "(a)": a browser may break
  // between ")" and "("): 143(1)(a)(iv), 36(1)(va), 2(24)(x), 139(1); a bare "43B" or "(₹)" is left alone
  var SECTION_RE = /(^|[^\w(>&#;])(\d{1,3}[A-Z]{0,4}(?:\((?:\d{1,3}[A-Za-z]{0,2}|[a-z]{1,5}|[A-Z]{1,2})\)){1,4})(?![\w(])/g;
  // sa-7 round 2 (designer S2, as a pattern): a CARO clause reference with no section number before it ("(ix)(b)",
  // "(xiv)(a)" in a draft annexure's list) stays whole too; a lone "(x)" or "(a)" is left alone
  var CLAUSE_RE = /(^|[^\w(>&#;])(\([ivx]{1,5}\)(?:\((?:[a-z]{1,2}|[A-Z])\)){1,3})(?![\w(])/g;
  function nwSections(h) { return String(h).replace(SECTION_RE, '$1<span class="nw">$2</span>').replace(CLAUSE_RE, '$1<span class="nw">$2</span>'); }
  // sa-3 round 1: Chrome broke dates and document numbers at their hyphens ("dt 22-03-" / "2027", "TD/PO/CAP/2026-" /
  // "27/007"), on a desktop pane too, in papers whose lesson is reading dates side by side. Held: a whole date
  // (29-03-2027, 18-Jul-2026); the hyphenated year of a slash number, with a break chance before it, so a long number
  // breaks only at a slash ("TD/PO/CAP/" / "2026-27/004"); a number joined to a word ("2-axis", "14-inch", "24-tool").
  // "cut-off", GRN-2027-03-0389 and the codes above are unchanged
  // ia-1 round 1: a slash number of up to 16 characters (KF/PO/26-27/0455, QC/26-27/0176, PCCS/26-27/0162, the
  // shape ws-ui's escText holds on screen) is held whole, as no printed paper breaks it ("QC/" / "26-27/0176" still read
  // as two pieces beside the PO's date); a longer one keeps the break chance at the slash before its year (at 360 px an
  // invoice's key-value column holds 16 mono characters: sa-1's "TD/WO/2026-27/0007" held whole ran 9 px past the paper)
  var SLASH_NO_RE = /(^|[^\w\-\/&;#])([A-Z][A-Za-z0-9]{0,7}(?:\/[A-Z][A-Za-z0-9]{0,7})*\/\d{2,4}-\d{2}\/[0-9A-Z]{1,8})(?![\w\-\/])/g;
  var SLASH_NO_MAX = 16;
  // sa-1 round 6 (designer S1): a slash number that ends in its year ("RF/2291/26-27", "PSG/0938/26-27") is held whole
  // up to the same 16 characters (at 360 px the debit note broke "your invoice RF/2291/26-" / "27", which reads as a
  // split year); a longer one keeps its final year whole, with the break chance at the slash before it
  var SLASH_END_YEAR_RE = /(^|[^\w\-\/&;#])([A-Z][A-Za-z0-9]{0,7}(?:\/[A-Za-z0-9]{1,8})*\/\d{2,4}-\d{2})(?![\w\-\/])/g;
  var SLASH_YEAR_RE = /(\/)(\d{2,4}-\d{2})(?=\/|(?![\w\-]))/g;
  var DATE_RE = /(^|[^\w\-\/])(\d{1,2}-(?:\d{2}|[A-Z][a-z]{2})-\d{4})(?![\w\-])/g;
  var NUM_WORD_RE = /(^|[^\w\-\/])(\d+-[a-z]{2,10})(?![\w\-])/g;
  // sa-1 round 6 (designer S2): a day keeps its month, and its year when one follows ("Annual rate contract, 1" /
  // "April 2026" on two POs at 360 px; "own stock on 26" / "September." in a count report), and a month keeps its year,
  // as ws-ui's escText holds them in the senior's notes; run only on text not already held
  var MONTH_RE = /(^|[^\w])((?:\d{1,2}[  ](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:[  ]\d{4})?)|(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) \d{4}))(?!\w)/g;
  // sa-1 round 6 (fixer 2): a range of days held by nwRanges takes its month (and year) too, as a range takes its unit
  // (UNIT_RANGE_RE): "10–14 Aug" in ia-1's hand note read "10–" / "14 Aug." at 360 px, and "22–31" / "Dec" can break the
  // same way; ws-ui's escText runs it too
  var DAY_RANGE_MONTH_RE = /(<span class="nw">\d{1,2}–\d{1,2})<\/span>([ \u00a0])(?:<span class="nw">((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[ \u00a0]\d{4})<\/span>|((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?:[ \u00a0]\d{4})?)(?!\w))/g;
  function nwDayRanges(h) { return String(h).replace(DAY_RANGE_MONTH_RE, function (m, r, sp, my, mo) { return r + sp + (my || mo) + '</span>'; }); }
  // dt-2 round 4 (designer S1): a range of months stays whole ("Pallavi’s TDS receivable register, Apr–" / "Sep" in a
  // pack list, "July–" / "September" in a mail subject, Form 168's Quarter cells "Apr–" / "Jun 2026"), as a range of
  // days or figures does; it runs before the month rule, so "Apr–Jun 2026" in a narrow cell breaks only before its year.
  // ws-ui's escText runs it too
  var MONTH_RANGE_RE = /(^|[^\w–\-])((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)–(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?))(?![\w–])/g;
  function nwMonthRanges(h) { return String(h).replace(MONTH_RANGE_RE, '$1<span class="nw">$2</span>'); }
  // for-1 round 3 (designer S1): a short day-month date stays whole, as a full date does (a payment register's narration
  // read "Printed laminate rolls, bill of 11-" / "03" 90 times at 390 px, beside a hunt list that holds it), and so does a
  // bare year pair ("NPI 26-27 0471"); it runs last, on text not already held, and a "/", "-" or "." on either side
  // leaves the token alone, so a slash number keeps its own rule ("BP/26-27/0001") and "E-14" or "1.5-10" are untouched
  var DAY_MONTH_RE = /(^|[^\w\-\/.])(\d{1,2}-\d{2})(?![\w\-\/])/g;
  function nwDates(h) {
    var hold = function (m, pre, no) { return no.length <= SLASH_NO_MAX ? pre + '<span class="nw">' + no + '</span>' : m; };
    h = String(h).replace(SLASH_NO_RE, hold).replace(SLASH_END_YEAR_RE, hold);
    // the year rule, the month-range rule and the month rule run only on text not already held
    h = h.split(/(<span class="nw">[^<]*<\/span>)/).map(function (part, k) { return k % 2 ? part : nwMonthRanges(part.replace(SLASH_YEAR_RE, '$1<wbr><span class="nw">$2</span>')).replace(MONTH_RE, '$1<span class="nw">$2</span>'); }).join('');
    h = nwDayRanges(h.replace(DATE_RE, '$1<span class="nw">$2</span>').replace(NUM_WORD_RE, '$1<span class="nw">$2</span>'));
    return h.split(/(<span class="nw">[^<]*<\/span>)/).map(function (part, k) { return k % 2 ? part : part.replace(DAY_MONTH_RE, '$1<span class="nw">$2</span>'); }).join('');
  }
  // ia-1 round 1: an e-mail address in a table's text cell may break after its "@" (and only there), so a register's
  // address column is as narrow as the longer half and fits beside the pinned column on a phone: the part before the
  // "@", where a look-alike address differs, stays on one line ("shikrapur.boxes@" / "email.com")
  var MAIL_RE = /(^|[^\w.%+\-])([A-Za-z0-9._%+\-]+@)((?:[A-Za-z0-9\-]+\.)+[A-Za-z]{2,})(?![\w\-])/g;
  function mailBreak(h) { return String(h).replace(MAIL_RE, '$1$2<wbr>$3'); }
  // handwriting: a Z is written with a bar through it, as people write it beside digits, so "6306-ZZ" in the
  // handwritten face never reads "6306-22" (the cousin of the I/O rule for handwritten PANs)
  function hz(h) { return String(h).replace(/(^|>)([^<]+)/g, function (m, a, txt) { return a + txt.replace(/Z/g, '<span class="zb">Z</span>'); }); }
  // ia-2 round 3 (designer S1): a paper never opens a line with "·": the dot is held to the word before it, so the line
  // breaks after it. sa-1 round 5 held it on headings only (hd()); a claim print's cells and fields wrapped on a phone as
  // "Bus, Solapur–Pandharpur" / "· ticket" and "Originals ticked 25-11-2026" / "· paid 27-11-2026"
  // ia-2 round 4 (designer S1): a "×" is held to the word before it too, so no line opens with it ("1 night" /
  // "× ₹1,150"). The break is moved, not taken away: where the space after the sign was the no-break one (ia-1's
  // "200 bags ×\u00a050 kg"), the line may now break after the sign instead, so no paper gets wider (holding both sides
  // widened sa-1's and sa-2's tables at 360 px, and ia-1's GRN and invoices). A level that wants "2 days × ₹300" whole
  // writes both spaces as no-break spaces (ia-2's claim lines), and that is left as it is
  function dotHold(h) { return String(h).replace(/ · /g, '\u00a0· ').replace(/ ×(\u00a0?)/g, function (m, nb) { return nb ? '\u00a0× ' : '\u00a0×'; }); }
  function lines(v) { return arr(v).reduce(function (a, x) { return a.concat(String(x).split('\n')); }, []); }

  // ctx.hl: highlight strings for this document (from annotations of kind "highlight")
  function makeCtx(doc, ctx) {
    var c = {};
    ctx = ctx || {};
    Object.keys(ctx).forEach(function (k) { c[k] = ctx[k]; });
    c.hl = (doc.annotations || []).filter(function (a) { return a && a.kind === 'highlight' && a.text; })
      .map(function (a) { return { text: esc(a.text), color: a.color || 'yellow', used: false }; });
    return c;
  }
  // escaped text + **bold** + highlighter marks; a code of capitals, a hyphen and digits (machine TC-35, approval
  // CA-06, GRN-2027-03-0389, tag FA-27-01/1) is held on one line, as the font subsets have no non-breaking hyphen
  function t(s, c) {
    var h = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    if (c && c.hl) {
      c.hl.forEach(function (m) {
        if (m.used || !m.text) return;
        var i = h.indexOf(m.text);
        if (i >= 0) {
          h = h.slice(0, i) + '<mark class="doc-hl hl-' + esc(m.color) + '">' + m.text + '</mark>' + h.slice(i + m.text.length);
          m.used = true;
        }
      });
    }
    return dotHold(nwSections(nwDates(nwUnits(nwRanges(nwParts(nwCodes(h)))))));
  }
  // sa-1 round 5 (designer S6): a heading, company, subtitle or period line never starts with "·" (the gate register's
  // "TAMHINI DRIVETECH PRIVATE LIMITED" / "· MAIN GATE" at 390 px): the dot is held to the word before it, so the
  // line breaks after it, as ws-ui's joined lines and titles do (escTitle)
  // (ia-2 round 3: t() now holds every such dot itself, in cells and fields too; hd() keeps its name for headings)
  function hd(s, c) { return t(s, c).replace(/ · /g, '\u00a0· '); }
  // an Excel tab for another sheet of the workbook (val-1 round 1): where the app can open that sheet as a paper of the
  // pack (c.sheetLink returns the opening and closing tags of a link or button), it is a tab a student can tap; any
  // other tab is a plain grey label, never a control that does nothing
  function sheetTab(s, c) {
    var L = c && typeof c.sheetLink === 'function' ? c.sheetLink(s) : null;
    return L && L.open ? L.open + tabName(s, c) + L.close : '<span class="xl-label" aria-hidden="true">' + tabName(s, c) + '</span>';
  }
  // gst-2 round 1: a tab name with a held code ("GSTR-9 Chakan", "QC-0034") is one element inside its tab, which is a
  // flex box: loose text beside the held code became two flex items and lost the space ("GSTR-9Chakan"); a plain name
  // keeps its markup. sa-4 round 5: its class is xl-tname, an unstyled inline span; it was xl-name until xl-1 round 1
  // gave that class to the Name Box (a flex box with a border and padding), which split the tab again ("GSTR-9Chakan")
  function tabName(s, c) {
    var h = t(s, c);
    return h.indexOf('<') >= 0 ? '<span class="xl-tname">' + h + '</span>' : h;
  }
  function personName(c, id) {
    if (!id) return '';
    if (c && typeof c.person === 'function') { var p = c.person(id); if (p && p.name) return p.name; }
    return String(id);
  }
  function multiline(v, c) { return lines(v).map(function (l) { return t(l, c); }).join('<br>'); }

  /* ------------------------------------------------------------------ annotations */
  var POS = ['top-left', 'top', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom', 'bottom-right', 'inline'];
  var TICK = '<svg viewBox="0 0 30 26" aria-hidden="true"><path d="M4 14 C 7 17, 9 19, 11 22 C 16 13, 21 7, 27 3" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function xy(at) {
    if (at && typeof at === 'object' && isNum(at.x) && isNum(at.y)) return { x: Math.max(0, Math.min(90, at.x)), y: Math.max(0, Math.min(95, at.y)) };
    var m = /^(\d{1,2}(?:\.\d+)?)%\s*,\s*(\d{1,2}(?:\.\d+)?)%$/.exec(String(at || ''));
    return m ? { x: Math.min(90, +m[1]), y: Math.min(95, +m[2]) } : null;
  }
  function annotation(a) {
    if (!a || a.kind === 'highlight') return '';
    var p = xy(a.at);
    var at = p ? 'xy' : POS.indexOf(a.at) >= 0 ? a.at : (a.kind === 'stamp' ? 'top-right' : 'bottom-right');
    var color = /^(red|blue|violet|green|black)$/.test(a.color || '') ? a.color : (a.kind === 'stamp' ? 'red' : 'blue');
    var rot = isNum(a.rotate) ? a.rotate : (a.kind === 'stamp' ? -6 : a.kind === 'hand' ? -2 : 0);
    var cls = 'ann ann-' + esc(a.kind) + ' ink-' + color + ' at-' + at + (a.shape === 'round' ? ' ann-round' : '');
    var style = ' style="--rot:' + rot + 'deg' + (p ? ';left:' + p.x + '%;top:' + p.y + '%' : '') + '"';
    // sa-1 round 6 (fixer 2, the designer's S2 as a pattern): a handwritten note or stamp holds its ranges, dates and
    // numbers as the paper under it does, so ia-1's "N. Bhosale on leave 10–14" / "Aug." no longer splits at 360 px
    var body = lines(a.text).map(function (l) { return dotHold(nwDates(nwRanges(esc(l)))); }).join('<br>');
    if (a.kind === 'tick') return '<div class="' + cls + '"' + style + '>' + TICK + (a.text ? '<span>' + body + '</span>' : '') + '</div>';
    if (a.kind === 'sign') return '<div class="' + cls + '"' + style + '><span class="sig">' + body + '</span></div>';
    return '<div class="' + cls + '"' + style + '><span>' + body + '</span></div>';
  }
  function annotations(doc) {
    var list = (doc.annotations || []).filter(function (a) { return a && a.kind !== 'highlight'; });
    var abs = list.filter(function (a) { return a.at !== 'inline'; }).map(annotation).join('');
    var inl = list.filter(function (a) { return a.at === 'inline'; }).map(annotation).join('');
    // reserve a clear band at the top or bottom of the paper for stamps and notes placed there
    var size = function (a) { return a.kind === 'stamp' ? (a.shape === 'round' ? 3 : 2) : 1; };
    var top = 0, bottom = 0;
    list.forEach(function (a) {
      var at = typeof a.at === 'string' ? a.at : (xy(a.at) ? 'xy' : (a.kind === 'stamp' ? 'top-right' : 'bottom-right'));
      if (/^top/.test(at)) top = Math.max(top, size(a));
      if (/^bottom/.test(at)) bottom = Math.max(bottom, size(a));
    });
    var cls = (top ? ' pt-' + ['', 's', 'm', 'l'][top] : '') + (bottom ? ' pb-' + ['', 's', 'm', 'l'][bottom] : '');
    return { abs: abs, inline: inl ? '<div class="ann-flow">' + inl + '</div>' : '', cls: cls };
  }
  function sigHtml(name, cls) {
    if (!name) return '';
    return '<span class="sig' + (cls ? ' ' + cls : '') + '">' + esc(name) + '</span>';
  }
  function wrap(doc, inner, extra) {
    var an = annotations(doc);
    return '<article class="doc doc-' + esc(doc.type) + (extra ? ' ' + extra : '') + '" data-doc="' + esc(doc.id) + '">' +
      '<div class="doc-paper' + an.cls + '">' + inner + an.inline + an.abs + '</div></article>';
  }
  // `start` (fdd-1 round 1): "last" marks a sheet that opens on its last page on a phone (the app pages it there)
  function scroll(inner, cls, start) { return '<div class="doc-scroll' + (cls ? ' ' + cls : '') + '"' + (start === 'last' ? ' data-start="last"' : '') + ' tabindex="0">' + inner + '</div>'; }
  function kv(label, value, c) {
    if (value === undefined || value === null || value === '') return '';
    return '<div class="kv"><span class="k">' + esc(label) + '</span><span class="v">' + t(value, c) + '</span></div>';
  }

  /* ------------------------------------------------------------------ invoice */
  function invoiceTotals(doc) {
    var intra = doc.tax !== 'inter';
    var out = { intra: intra, lines: [], taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, charges: 0, qty: 0 };
    (doc.lines || []).forEach(function (l) {
      var taxable = isNum(l.taxable) ? l.taxable : r2((l.qty || 0) * (l.rate || 0));
      var rate = isNum(l.gstRate) ? l.gstRate : 0;
      var row = { taxable: taxable, rate: rate, cgst: 0, sgst: 0, igst: 0 };
      if (intra) {
        row.cgst = isNum(l.cgst) ? l.cgst : r2(taxable * rate / 200);
        row.sgst = isNum(l.sgst) ? l.sgst : r2(taxable * rate / 200);
      } else row.igst = isNum(l.igst) ? l.igst : r2(taxable * rate / 100);
      row.amount = r2(taxable + row.cgst + row.sgst + row.igst);
      out.lines.push(row);
      out.taxable += taxable; out.cgst += row.cgst; out.sgst += row.sgst; out.igst += row.igst;
      if (isNum(l.qty)) out.qty += l.qty;
    });
    (doc.charges || []).forEach(function (ch) { if (ch && isNum(ch.amount)) out.charges += ch.amount; });
    out.taxable = r2(out.taxable); out.cgst = r2(out.cgst); out.sgst = r2(out.sgst); out.igst = r2(out.igst);
    out.tax = r2(out.cgst + out.sgst + out.igst); out.charges = r2(out.charges);
    out.roundOff = isNum(doc.roundOff) ? doc.roundOff : 0;
    out.computed = r2(out.taxable + out.tax + out.charges + out.roundOff);
    out.total = isNum(doc.total) ? doc.total : out.computed;
    var byRate = {}, byHsn = {}, rateOrder = [], hsnOrder = [];
    (doc.lines || []).forEach(function (l, i) {
      var x = out.lines[i], rk = String(x.rate), hk = String(l.hsn || '') + '|' + rk;
      if (!byRate[rk]) { byRate[rk] = { rate: x.rate, cgst: 0, sgst: 0, igst: 0 }; rateOrder.push(rk); }
      if (!byHsn[hk]) { byHsn[hk] = { hsn: l.hsn || '', rate: x.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0 }; hsnOrder.push(hk); }
      ['cgst', 'sgst', 'igst'].forEach(function (k) { byRate[rk][k] = r2(byRate[rk][k] + x[k]); byHsn[hk][k] = r2(byHsn[hk][k] + x[k]); });
      byHsn[hk].taxable = r2(byHsn[hk].taxable + x.taxable);
    });
    out.byRate = rateOrder.map(function (k) { return byRate[k]; });
    out.byHsn = hsnOrder.map(function (k) { return byHsn[k]; });
    return out;
  }
  function party(p, label, c) {
    p = p || {};
    return '<div class="inv-party"><div class="inv-label">' + esc(label) + '</div>' +
      '<div class="inv-pname">' + t(p.name, c) + '</div>' +
      (p.address ? '<div>' + multiline(p.address, c) + '</div>' : '') +
      (p.gstin ? '<div>GSTIN/UIN: <b class="mono">' + t(p.gstin, c) + '</b></div>' : '') +
      (p.state ? '<div>State Name: ' + t(p.state, c) + (p.stateCode ? ', Code:&nbsp;' + t(p.stateCode, c) : '') + '</div>' : '') +
      (p.pan ? '<div>PAN: <span class="mono">' + t(p.pan, c) + '</span></div>' : '') + '</div>';
  }
  function qrSvg(text) {
    var n = 25, r = E.rng('qr:' + text), dark = [];
    for (var y = 0; y < n; y++) { dark[y] = []; for (var x = 0; x < n; x++) dark[y][x] = r() < 0.48; }
    function finder(ox, oy) {
      for (var y2 = -1; y2 <= 7; y2++) for (var x2 = -1; x2 <= 7; x2++) {
        var X = ox + x2, Y = oy + y2;
        if (X < 0 || Y < 0 || X >= n || Y >= n) continue;
        var ring = Math.max(Math.abs(x2 - 3), Math.abs(y2 - 3));
        dark[Y][X] = x2 >= 0 && x2 <= 6 && y2 >= 0 && y2 <= 6 && ring !== 2;
      }
    }
    finder(0, 0); finder(n - 7, 0); finder(0, n - 7);
    for (var i = 8; i < n - 8; i++) { dark[6][i] = i % 2 === 0; dark[i][6] = i % 2 === 0; }
    var d = '';
    for (var yy = 0; yy < n; yy++) for (var xx = 0; xx < n; xx++) if (dark[yy][xx]) d += 'M' + xx + ' ' + yy + 'h1v1h-1z';
    return '<svg class="qr" viewBox="-2 -2 ' + (n + 4) + ' ' + (n + 4) + '" aria-hidden="true"><rect x="-2" y="-2" width="' +
      (n + 4) + '" height="' + (n + 4) + '" fill="#fff"/><path d="' + d + '" fill="#111"/></svg>';
  }
  function pct(x) { return E.formatNumber(x, 'auto') + '%'; }
  // the e-invoice block (QR, IRN, Ack No., Ack Date): an invoice's, and since gst-3 round 1 a debit or credit note's
  // printed as a letter (`style: "letter"` with `irn`), as a notified person's notes are e-invoiced too
  function irnBlock(doc, c) {
    return doc.irn ? '<div class="inv-irn">' + qrSvg(doc.irn) + '<div>' + kv('IRN', doc.irn, c) + kv('Ack No.', doc.ackNo, c) + kv('Ack Date', doc.ackDate, c) + '</div></div>' : '';
  }
  function renderInvoice(doc, c) {
    var s = doc.supplier || {}, tt = invoiceTotals(doc), intra = tt.intra;
    var meta = [
      ['Invoice No.', doc.number], ['Dated', doc.date], ['Delivery note', doc.deliveryNote], ['Mode/terms of payment', doc.paymentTerms],
      ["Buyer’s order no.", doc.poRef], ['Order dated', doc.poDate], ['Dispatch doc no.', doc.dispatchDoc], ['Dispatched through', doc.dispatchedThrough],
      ['Destination', doc.destination], ['e-Way Bill No.', doc.ewayBill], ['Vehicle No.', doc.vehicle], ['Place of supply', doc.placeOfSupply]
    ].map(function (m) { return kv(m[0], m[1], c); }).join('');
    var head = '<div class="inv-title"><span>Tax Invoice</span><small>' + esc(doc.copy || 'Original for recipient') + '</small></div>' +
      '<div class="inv-head"><div class="inv-supplier"><div class="inv-name">' + t(s.name, c) + '</div>' +
      (s.address ? '<div>' + multiline(s.address, c) + '</div>' : '') +
      (s.gstin ? '<div>GSTIN/UIN: <b class="mono">' + t(s.gstin, c) + '</b></div>' : '') +
      (s.state ? '<div>State Name: ' + t(s.state, c) + (s.stateCode ? ', Code:&nbsp;' + t(s.stateCode, c) : '') + '</div>' : '') +
      ((s.phone || s.email) ? '<div>' + (s.phone ? 'Ph: ' + t(s.phone, c) : '') + (s.phone && s.email ? '\u00a0· ' : '') + (s.email ? 'E-mail: ' + t(s.email, c) : '') + '</div>' : '') +
      '</div><div class="inv-meta">' + meta + '</div></div>';
    var parties = '<div class="inv-parties' + (doc.shipTo ? '' : ' one') + '">' + (doc.shipTo ? party(doc.shipTo, 'Consignee (Ship to)', c) : '') +
      party(doc.buyer, 'Buyer (Bill to)', c) + '</div>';
    var units = {}; (doc.lines || []).forEach(function (l) { if (l.unit) units[l.unit] = 1; });
    var oneUnit = Object.keys(units).length === 1 ? Object.keys(units)[0] : '';
    var rows = (doc.lines || []).map(function (l, i) {
      var x = tt.lines[i];
      return '<tr class="inv-item"><td class="sl stick0">' + (i + 1) + '</td><td class="desc stick1"><b>' + t(l.desc, c) + '</b>' + (l.note ? '<div class="inv-note">' + t(l.note, c) + '</div>' : '') + '</td>' +
        '<td class="mono nw">' + t(l.hsn, c) + '</td><td class="r nw">' + (isNum(l.qty) ? t(E.formatNumber(l.qty, 'auto', 3), c) + (l.unit ? ' ' + t(l.unit, c) : '') : '') + '</td>' +
        '<td class="r nw">' + (isNum(l.rate) ? t(money(l.rate), c) : '') + '</td><td class="nw">' + t(l.unit || '', c) + '</td><td class="r nw">' + t(money(x.taxable), c) + '</td></tr>';
    }).join('');
    var taxRow = function (label, amount) {
      return '<tr class="inv-taxrow"><td class="stick0"></td><td class="stick1 r"><b><i>' + esc(label) + '</i></b></td><td></td><td></td><td></td><td></td><td class="r nw">' + t(amount, c) + '</td></tr>';
    };
    var taxes = tt.byRate.map(function (g) {
      if (!intra) return taxRow('IGST @ ' + pct(g.rate), money(g.igst));
      return taxRow('CGST @ ' + pct(g.rate / 2), money(g.cgst)) + taxRow('SGST @ ' + pct(g.rate / 2), money(g.sgst));
    }).join('') + (doc.charges || []).map(function (ch) { return taxRow(ch.label, money(ch.amount)); }).join('') +
      (isNum(doc.roundOff) && doc.roundOff !== 0 ? taxRow('Round off', doc.roundOff < 0 ? '(−)' + money(-doc.roundOff) : money(doc.roundOff)) : '');
    // a line whose description and note run long (a contract bill listing the month's jobs) gets a wider pinned
    // description on a phone, so it does not wrap a word or two to a line
    var longDesc = (doc.lines || []).some(function (l) { return (String(l.desc || '') + ' ' + String(l.note || '')).length > 80; });
    // sa-3 round 1: a bill whose every line has a services code (SAC 99…) describes services, not goods
    var services = (doc.lines || []).length > 0 && (doc.lines || []).every(function (l) { return /^99/.test(String(l.hsn || '').replace(/\s/g, '')); });
    var table = '<table class="inv-lines' + (longDesc ? ' long-desc' : '') + '"><thead><tr><th class="stick0">Sl<br>No.</th><th class="stick1">Description of ' + (services ? 'services' : 'goods') + '</th><th>HSN/SAC</th><th class="r">Quantity</th><th class="r">Rate</th><th>per</th><th class="r">Amount</th></tr></thead>' +
      '<tbody>' + rows + taxes + '</tbody><tfoot><tr><td class="stick0"></td><td class="stick1 r">Total</td><td></td><td class="r nw">' +
      (oneUnit ? t(E.formatNumber(tt.qty, 'auto', 3), c) + ' ' + t(oneUnit, c) : '') + '</td><td></td><td></td><td class="r nw grand">₹ ' + t(money(tt.total), c) + '</td></tr></tfoot></table>';
    var words = doc.amountInWords || E.amountInWords(tt.total, { prefix: 'INR' });
    var hsnHead = intra
      ? '<tr><th rowspan="2" class="stick0">HSN/SAC</th><th rowspan="2" class="r">Taxable value</th><th colspan="2" class="c">Central Tax</th><th colspan="2" class="c">State Tax</th><th rowspan="2" class="r">Total tax amount</th></tr><tr><th class="r">Rate</th><th class="r">Amount</th><th class="r">Rate</th><th class="r">Amount</th></tr>'
      : '<tr><th rowspan="2" class="stick0">HSN/SAC</th><th rowspan="2" class="r">Taxable value</th><th colspan="2" class="c">Integrated Tax</th><th rowspan="2" class="r">Total tax amount</th></tr><tr><th class="r">Rate</th><th class="r">Amount</th></tr>';
    var hsnRows = tt.byHsn.map(function (g) {
      var tax = r2(g.cgst + g.sgst + g.igst);
      return '<tr><td class="stick0 mono nw">' + t(g.hsn, c) + '</td><td class="r nw">' + t(money(g.taxable), c) + '</td>' +
        (intra ? '<td class="r nw">' + pct(g.rate / 2) + '</td><td class="r nw">' + t(money(g.cgst), c) + '</td><td class="r nw">' + pct(g.rate / 2) + '</td><td class="r nw">' + t(money(g.sgst), c) + '</td>'
          : '<td class="r nw">' + pct(g.rate) + '</td><td class="r nw">' + t(money(g.igst), c) + '</td>') + '<td class="r nw">' + t(money(tax), c) + '</td></tr>';
    }).join('');
    var hsnFoot = '<tr><td class="stick0 r">Total</td><td class="r nw">' + t(money(tt.taxable), c) + '</td>' +
      (intra ? '<td></td><td class="r nw">' + t(money(tt.cgst), c) + '</td><td></td><td class="r nw">' + t(money(tt.sgst), c) + '</td>' : '<td></td><td class="r nw">' + t(money(tt.igst), c) + '</td>') +
      '<td class="r nw">' + t(money(tt.tax), c) + '</td></tr>';
    var hsn = '<table class="inv-hsn"><thead>' + hsnHead + '</thead><tbody>' + hsnRows + '</tbody><tfoot>' + hsnFoot + '</tfoot></table>';
    var taxWords = doc.taxInWords || E.amountInWords(tt.tax, { prefix: 'INR' });
    var bank = doc.bank ? '<div class="inv-bank"><div class="inv-label">Company’s bank details</div>' +
      kv('Bank name', doc.bank.name, c) + kv('A/c No.', doc.bank.account, c) + kv('Branch & IFSC', [doc.bank.branch, doc.bank.ifsc].filter(Boolean).join(' & '), c) + '</div>' : '';
    var terms = doc.terms && doc.terms.length ? '<div class="inv-terms"><div class="inv-label">Declaration</div><ol>' +
      doc.terms.map(function (x) { return '<li>' + t(x, c) + '</li>'; }).join('') + '</ol></div>' : '';
    var irn = irnBlock(doc, c);
    var signFor = doc.signFor || s.name;
    var foot = '<div class="inv-foot"><div>' + (s.pan ? '<div class="inv-pan">Company’s PAN: <b class="mono">' + t(s.pan, c) + '</b></div>' : '') + terms + '</div>' +
      '<div class="inv-right">' + bank + '<div class="inv-sign"><div>for <b>' + t(signFor, c) + '</b></div><div class="sign-space">' + sigHtml(doc.signedBy) + '</div><div>Authorised Signatory</div></div></div></div>';
    var inner = (irn ? '<div class="inv-top">' + irn + '</div>' : '') + head + parties + scroll(table, 'inv-scroll') +
      '<div class="inv-words"><div><div class="inv-label">Amount chargeable (in words)</div><b>' + t(words, c) + '</b></div><span class="eoe">E. &amp; O.E</span></div>' +
      scroll(hsn, 'inv-scroll inv-hsn-wrap') +
      '<div class="inv-taxwords"><span class="inv-label">Tax amount (in words):</span> <b>' + t(taxWords, c) + '</b></div>' + foot +
      ((doc.footer || doc.style !== 'book') ? '<div class="inv-cg">' + dotHold(esc(doc.footer || 'This is a computer generated invoice.')) + '</div>' : '');
    // each vendor prints its own way: tally (default), erp (a large supplier's system print), dot (dot-matrix on
    // continuous stationery), book (a printed bill book filled in by hand)
    var look = INVOICE_STYLES.indexOf(doc.style) > 0 ? doc.style : 'tally';
    return wrap(doc, '<div class="inv">' + inner + '</div>', 'invs-' + look);
  }
  var INVOICE_STYLES = ['tally', 'erp', 'dot', 'book'];

  /* ------------------------------------------------------------------ purchase order */
  function poTotals(doc) {
    var total = 0;
    var ls = (doc.lines || []).map(function (l) {
      var amount = isNum(l.amount) ? l.amount : r2((l.qty || 0) * (l.rate || 0));
      total += amount; return amount;
    });
    return { lines: ls, total: r2(total) };
  }
  function signBox(label, who, date, c) {
    var name = isObj(who) ? who.name : who;
    var sign = isObj(who) ? (who.sign === undefined ? name : who.sign) : name;
    var filled = !!name;
    return '<div class="sbox' + (filled ? '' : ' empty') + '"><div class="sbox-l">' + esc(label) + '</div><div class="sbox-s">' +
      (filled && sign ? sigHtml(sign) : '') + '</div><div class="sbox-n">' + (filled ? t(name, c) : '&nbsp;') + '</div>' +
      '<div class="sbox-d">' + (date ? 'Date: ' + t(date, c) : (filled ? '' : 'Date:')) + '</div></div>';
  }
  function letterhead(co, c, cls) {
    if (!co || !co.name) return '';
    return '<div class="lh ' + (cls || '') + '"><div class="lh-name">' + t(co.name, c) + '</div>' +
      (co.address ? '<div class="lh-addr">' + multiline(co.address, c) + '</div>' : '') +
      ((co.gstin || co.cin || co.pan) ? '<div class="lh-ids">' + [co.gstin ? 'GSTIN: ' + t(co.gstin, c) : '', co.cin ? 'CIN: ' + t(co.cin, c) : '', co.pan ? 'PAN: ' + t(co.pan, c) : ''].filter(Boolean).join('\u00a0· ') + '</div>' : '') +
      ((co.phone || co.email) ? '<div class="lh-ids">' + [co.phone ? 'Ph: ' + t(co.phone, c) : '', co.email ? t(co.email, c) : ''].filter(Boolean).join('\u00a0· ') + '</div>' : '') + '</div>';
  }
  function companyOf(doc, c) {
    if (doc.company) return doc.company;
    var w = c && c.world;
    if (w && w.client && w.client.name) return w.client;
    return null;
  }
  function renderPo(doc, c) {
    var v = doc.vendor || {}, tt = poTotals(doc);
    var rows = (doc.lines || []).map(function (l, i) {
      return '<tr><td class="sl stick0">' + (i + 1) + '</td><td class="stick1">' + t(l.desc, c) + '</td><td class="r">' +
        (isNum(l.qty) ? E.formatNumber(l.qty, 'auto', 3) : '') + '</td><td>' + t(l.unit, c) + '</td><td class="r">' + money(l.rate) +
        '</td><td class="r">' + money(tt.lines[i]) + '</td></tr>';
    }).join('');
    var table = '<table class="po-lines"><thead><tr><th class="stick0">Sl</th><th class="stick1">Description</th><th class="r">Qty</th><th>Unit</th><th class="r">Rate (₹)</th><th class="r">Amount (₹)</th></tr></thead><tbody>' +
      rows + '</tbody><tfoot><tr><td class="stick0"></td><td class="stick1 r" colspan="1">Total</td><td></td><td></td><td></td><td class="r b">' + money(tt.total) + '</td></tr></tfoot></table>';
    var inner = letterhead(companyOf(doc, c), c) +
      '<div class="po-title">Purchase Order</div>' +
      '<div class="po-grid"><div class="po-vendor"><div class="inv-label">To</div><div class="inv-pname">' + t(v.name, c) + '</div>' +
      (v.address ? '<div>' + multiline(v.address, c) + '</div>' : '') + (v.gstin ? '<div>GSTIN: <span class="mono">' + t(v.gstin, c) + '</span></div>' : '') + '</div>' +
      '<div class="po-meta">' + kv('PO No.', doc.number, c) + kv('Date', doc.date, c) + kv('Delivery by', doc.deliveryBy, c) +
      kv('Deliver to', doc.deliverTo, c) + kv('Payment', doc.paymentTerms, c) + kv('Quotation ref.', doc.quoteRef, c) + '</div></div>' +
      (doc.intro ? '<p class="po-intro">' + t(doc.intro, c) + '</p>' : '<p class="po-intro">Please supply the following as per the terms below.</p>') +
      scroll(table) +
      (doc.taxNote ? '<p class="po-note">' + t(doc.taxNote, c) + '</p>' : '') +
      (doc.terms && doc.terms.length ? '<div class="po-terms"><div class="inv-label">Terms and conditions</div><ol>' + doc.terms.map(function (x) { return '<li>' + t(x, c) + '</li>'; }).join('') + '</ol></div>' : '') +
      '<div class="po-approve">' + signBox('Prepared by', doc.preparedBy, doc.preparedDate, c) +
      (doc.checkedBy !== undefined ? signBox('Checked by', doc.checkedBy, doc.checkedDate, c) : '') +
      signBox('Approved by', doc.approvedBy, doc.approvedBy ? doc.approvalDate : null, c) + '</div>';
    return wrap(doc, '<div class="po">' + inner + '</div>');
  }

  /* ------------------------------------------------------------------ goods receipt note */
  function renderGrn(doc, c) {
    var book = doc.style === 'book';
    var co = companyOf(doc, c);
    var rows = (doc.lines || []).map(function (l, i) {
      var cell = function (v) { return '<td class="r' + (book ? ' hw' : '') + '">' + (isNum(v) ? E.formatNumber(v, 'auto', 3) : (v ? t(v, c) : '')) + '</td>'; };
      return '<tr><td class="sl stick0">' + (i + 1) + '</td><td class="stick1' + (book ? ' hw' : '') + '">' + t(l.desc, c) + '</td><td' + (book ? ' class="hw"' : '') + '>' + t(l.unit, c) + '</td>' +
        cell(l.qtyChallan) + cell(l.qtyReceived) + cell(l.qtyAccepted) + cell(isNum(l.qtyRejected) ? l.qtyRejected : (book ? '' : 0)) +
        '<td' + (book ? ' class="hw"' : '') + '>' + t(l.remark || '', c) + '</td></tr>';
    }).join('');
    var hasChallanQty = (doc.lines || []).some(function (l) { return isNum(l.qtyChallan); });
    var table = '<table class="grn-lines' + (hasChallanQty ? '' : ' no-ch') + '"><thead><tr><th class="stick0">Sl</th><th class="stick1">Description</th><th>Unit</th>' +
      '<th class="r ch">As per challan</th><th class="r">Received</th><th class="r">Accepted</th><th class="r">Rejected</th><th>Remarks</th></tr></thead><tbody>' + rows + '</tbody></table>';
    function v(x) { return x ? '<span class="' + (book ? 'hw' : '') + '">' + t(x, c) + '</span>' : ''; }
    var inner = '<div class="grn-top">' + (co ? '<div class="grn-co">' + t(co.name, c) + '</div>' : '') +
      '<div class="grn-title">Goods Receipt Note</div>' + (doc.unit ? '<div class="grn-unit">' + t(doc.unit, c) + '</div>' : '') +
      '<div class="grn-no">No. <b>' + t(doc.number, c) + '</b></div></div>' +
      '<div class="grn-grid">' +
      '<div class="kv"><span class="k">Date</span><span class="v">' + v(doc.date) + '</span></div>' +
      '<div class="kv"><span class="k">Supplier</span><span class="v">' + v(isObj(doc.vendor) ? doc.vendor.name : doc.vendor) + '</span></div>' +
      '<div class="kv"><span class="k">PO ref.</span><span class="v">' + v(doc.poRef) + '</span></div>' +
      '<div class="kv"><span class="k">Invoice ref.</span><span class="v">' + v(doc.invoiceRef) + '</span></div>' +
      (doc.challan ? '<div class="kv"><span class="k">Challan no.</span><span class="v">' + v(doc.challan) + '</span></div>' : '') +
      (doc.vehicle ? '<div class="kv"><span class="k">Vehicle</span><span class="v">' + v(doc.vehicle) + '</span></div>' : '') +
      '</div>' + scroll(table) +
      (doc.remarks ? '<div class="grn-rem"><span class="k">Remarks:</span> ' + v(doc.remarks) + '</div>' : '') +
      '<div class="grn-signs"><div><div class="sign-space">' + sigHtml(doc.receivedSign || doc.receivedBy) + '</div><div class="grn-sl">Received by (Stores)' +
      (doc.receivedBy ? ': ' + t(doc.receivedBy, c) : '') + '</div></div>' +
      '<div><div class="sign-space">' + (doc.qcBy ? sigHtml(doc.qcSign || doc.qcBy) : '') + '</div><div class="grn-sl">Inspected by (QC)' + (doc.qcBy ? ': ' + t(doc.qcBy, c) : '') + '</div></div></div>';
    return wrap(doc, '<div class="grn">' + inner + '</div>', book ? 'grn-book' : 'grn-printed');
  }

  /* ------------------------------------------------------------------ tables (ledgers, registers, statements, portals) */
  var NUMERIC = { inr: 1, inr0: 1, inr2: 1, amount: 1, int: 1, qty: 1, num: 1, pct: 1, pct0: 1, pct1: 1, pct2: 1, lakh: 1, lakh2: 1, crore: 1, crore1: 1 };
  function colDecimals(doc, col) {
    var f = col.format;
    if (f !== 'inr' && f !== 'num') return null;
    if (doc.style === 'tally' || doc.style === 'bank' || doc.style === 'register') return f === 'inr' ? 2 : null;
    var frac = (doc.rows || []).some(function (r) { var v = r[col.key]; return isNum(v) && Math.round(v * 100) % 100 !== 0; });
    return frac ? 2 : 0;
  }
  function cellText(doc, col, v, dec) {
    if (v === undefined || v === null || v === '') return '';
    if (!isNum(v)) return null;                                   // text cell: escaped by caller
    var f = col.format, neg = v < 0, st = doc.style;
    var paren = st === 'statement' || col.negative === 'paren';
    var a = paren ? Math.abs(v) : v, s;
    if ((f === 'inr' || f === 'num') && dec !== null) s = E.formatNumber(a, dec);
    else if (f === 'int' || f === 'qty' || f === 'pct' || f === 'pct0' || f === 'pct1' || f === 'pct2' || f === 'amount' || f === 'lakh' || f === 'lakh2' || f === 'crore' || f === 'crore1' || f === 'inr0' || f === 'inr2') s = E.formatValue(a, f);
    else if (f === 'inr') s = E.formatNumber(a, 'auto');
    else s = E.formatValue(a, f);
    return paren && neg ? '(' + s + ')' : s;
  }
  function tableHtml(doc, c, opts) {
    opts = opts || {};
    var cols = doc.columns || [];
    var dec = {}; cols.forEach(function (col) { dec[col.key] = colDecimals(doc, col); });
    var lettersRow = '';
    // a sheet with `freeze: true` also pins its column A (the labels), as Excel's freeze panes would, so the labels
    // stay beside the figures when More columns pages a wide sheet on a phone
    var frz = !!(opts.sheet && doc.freeze);
    // xl-1: a sheet may be `headless` (a raw export whose own first rows are data: no row of column labels, rows
    // numbered from 1), a column may carry its own `letter` and a row its own number `_rn`, so an excerpt of a long
    // sheet ("rows 23–27, columns A–G and L") shows the row numbers and letters the full sheet and the file carry
    var headless = !!(opts.sheet && doc.headless === true);
    if (opts.sheet) {
      lettersRow = '<tr class="xl-letters"><th class="xl-corner stick0"></th>' + cols.map(function (col, i) {
        return '<th' + (frz && i === 0 ? ' class="stick1"' : '') + '>' + (col.letter ? esc(col.letter) : String.fromCharCode(65 + (i % 26))) + '</th>';
      }).join('') + '</tr>';
    }
    var head = '<thead>' + lettersRow + (headless ? '' : '<tr>' + (opts.sheet ? '<th class="xl-rn stick0">' + (isNum(doc.headRn) ? doc.headRn : 1) + '</th>' : '') + cols.map(function (col, i) {
      var al = col.align || (NUMERIC[col.format] ? 'r' : '');
      return '<th class="' + (al === 'right' || al === 'r' ? 'r' : al === 'center' ? 'c' : '') + (i === 0 && !opts.sheet ? ' stick0' : '') + (frz && i === 0 ? ' stick1' : '') + (col.wrap === true ? ' wrap' : '') + '">' + t(col.label, c) + '</th>';
    }).join('') + '</tr>') + '</thead>';
    var body = (doc.rows || []).map(function (row, ri) {
      // sa-6 round 1: `_focus` (set by the item screen from the item's `docRow`, never in level files) frames the item's
      // own row in a shared paper (Golconda's row among the tracker's ten open rows)
      var cls = 'row-' + esc(row._class || 'data') + (row._hl ? ' row-hl hl-' + esc(row._hl === true ? 'yellow' : row._hl) : '') + (row._focus ? ' row-focus' : '');
      var ind = isNum(row._indent) ? row._indent : 0;
      var skip = 0;      // a headless sheet's text that runs on over empty cells (below) stands in for them
      return '<tr class="' + cls + '"' + (row._id !== undefined ? ' data-row="' + esc(row._id) + '"' : '') + '>' +
        (opts.sheet ? '<td class="xl-rn stick0">' + (isNum(row._rn) ? row._rn : ri + (headless ? 1 : 2)) + '</td>' : '') +
        cols.map(function (col, i) {
          var v = row[col.key];
          if (skip > i) return '';
          // xl-1 round 1: on a headless sheet (a raw export), text runs on over the empty cells to its right, as Excel
          // shows it, so a title, page or narration line never widens its column (a 47-character narration made column
          // B wider than a 360 px phone, so More columns paged into the middle of it). Not in a frozen sheet's pinned
          // column, which wraps; never a number, a number stored as text, or right-aligned text.
          var span = 1;
          if (headless && !(frz && i === 0) && cellText(doc, col, v, dec[col.key]) === null && v !== undefined && v !== null && v !== '' &&
            !(Array.isArray(row._txt) && row._txt.indexOf(col.key) >= 0) && !col.align && !NUMERIC[col.format]) {
            while (i + span < cols.length && (row[cols[i + span].key] === undefined || row[cols[i + span].key] === null || row[cols[i + span].key] === '')) span++;
            skip = i + span;
          }
          if (span > 1) return '<td class="nw xl-spill" colspan="' + span + '">' + mailBreak(t(v, c)) + '</td>';
          var txt = cellText(doc, col, v, dec[col.key]);
          // xl-1: `_txt: [keys]` on a sheet row marks those cells as numbers stored as text, as Excel shows them: on
          // the left of the cell with the green mark in its top-left corner (named for screen readers too)
          var xt = !!(opts.sheet && Array.isArray(row._txt) && row._txt.indexOf(col.key) >= 0);
          var al = xt ? '' : col.align || (NUMERIC[col.format] ? 'r' : '');
          var shown = txt === null ? String(v === undefined || v === null ? '' : v) : txt;
          var nw = txt !== null || col.format === 'date' || col.mono || shown.length <= 10 || (shown.length <= 18 && shown.indexOf(' ') < 0);
          // for-1 round 1: a column with `wrap: true` wraps at a readable width, as Excel's Wrap Text does (a narration
          // that no phone page could show whole; a register's address that ran to seven lines in a narrow column)
          var klass = (al === 'right' || al === 'r' ? 'r' : al === 'center' ? 'c' : '') + (i === 0 && !opts.sheet ? ' stick0' : '') + (frz && i === 0 ? ' stick1' : '') + (col.wrap === true ? ' wrap' : nw ? ' nw' : ' wr') +
            (col.mono ? ' mono' : '') + (row._hlCols && row._hlCols.indexOf(col.key) >= 0 ? ' cell-hl' : '') + (xt ? ' xl-txt' : '');
          var style = i === 0 && ind ? ' style="padding-left:calc(.6em + ' + ind * 1.1 + 'em)"' : '';
          return '<td class="' + klass + '"' + style + '>' + (txt === null ? mailBreak(t(v, c)) : t(txt, c)) + (xt ? '<span class="vh"> (number stored as text)</span>' : '') + '</td>';
        }).join('') + '</tr>';
    }).join('');
    // dt-3 round 2: `pinFit: true` on a frozen sheet sizes its pinned column to its text (ws.css .pin-fit)
    return '<table class="dt dt-' + esc(doc.style || 'plain') + (frz && doc.pinFit === true ? ' pin-fit' : '') + '">' + head + '<tbody>' + body + '</tbody></table>';
  }
  function metaGrid(meta, c) {
    if (!meta || !meta.length) return '';
    return '<div class="dt-meta">' + meta.map(function (m) { return kv(m.label, m.value, c); }).join('') + '</div>';
  }
  function notesHtml(doc, c) {
    var out = '';
    if (doc.footer) out += '<div class="dt-footer">' + multiline(doc.footer, c) + '</div>';
    // notesNumbered: a statement's notes printed as "Notes" 1, 2, 3, as published results print them, so a review note
    // can say "note 2" (sa-5); otherwise a bulleted list
    var li = function (n) { return '<li>' + t(n, c) + '</li>'; };
    if (doc.notes && doc.notes.length) {
      out += doc.notesNumbered === true ? '<p class="dt-notes-h">Notes</p><ol class="dt-notes">' + doc.notes.map(li).join('') + '</ol>'
        : '<ul class="dt-notes">' + doc.notes.map(li).join('') + '</ul>';
    }
    return out;
  }
  function renderTable(doc, c) {
    var st = doc.style || 'plain';
    var co = doc.company || null, inner = '';
    var heading = doc.heading || doc.title;
    if (st === 'tally') {
      inner = '<div class="tl-head">' + (co ? '<div class="tl-co">' + hd(co.name || co, c) + '</div>' + (co.address ? '<div class="tl-addr">' + multiline(co.address, c) + '</div>' : '') : '') +
        '<div class="tl-ledger">' + hd(doc.ledger || heading, c) + '</div>' + (doc.subtitle ? '<div class="tl-sub">' + hd(doc.subtitle, c) + '</div>' : '') +
        (doc.period ? '<div class="tl-period">' + hd(doc.period, c) + '</div>' : '') + '</div>' +
        scroll(tableHtml(doc, c)) + notesHtml(doc, c) + '<div class="tl-page">Page 1</div>';
    } else if (st === 'register') {
      inner = '<div class="rg-head">' + (co ? '<div>' + hd(co.name || co, c) + '</div>' : '') + '<div class="rg-title">' + hd(heading, c) + '</div>' +
        (doc.subtitle ? '<div>' + hd(doc.subtitle, c) + '</div>' : '') + (doc.period ? '<div>' + hd(doc.period, c) + '</div>' : '') + '</div>' +
        scroll(tableHtml(doc, c)) + notesHtml(doc, c);
    } else if (st === 'bank') {
      inner = '<div class="bk-band"><span class="bk-name">' + hd(doc.brand || (co && co.name) || 'Bank', c) + '</span><span class="bk-doc">' + esc(doc.docName || 'Statement of Account') + '</span></div>' +
        (doc.subtitle ? '<div class="bk-branch">' + hd(doc.subtitle, c) + '</div>' : '') +
        metaGrid(doc.meta, c) + scroll(tableHtml(doc, c)) + notesHtml(doc, c) +
        '<div class="bk-foot">' + dotHold(esc(doc.footnote || 'This is a computer generated statement and does not need a signature.')) + '</div>';
    } else if (st === 'portal') {
      inner = '<div class="pt-band">' + hd(doc.brand || 'Portal', c) + '</div>' +
        // gst-2 round 1: the heading is one element of the flex title, so a held form name ("GSTR-1") keeps the heading's
        // ink and sits with the rest of it, and only the subtitle takes the light style
        '<div class="pt-title"><span class="pt-h">' + hd(heading, c) + '</span>' + (doc.subtitle ? '<span class="pt-sub">' + hd(doc.subtitle, c) + '</span>' : '') + '</div>' +
        metaGrid(doc.meta, c) + scroll(tableHtml(doc, c)) + notesHtml(doc, c);
    } else if (st === 'sheet') {
      // xl-1 round 1: `formulaCell` ("R5") prints Excel's Name Box before fx, so the formula reads as that cell's, not
      // as the column a phone page happens to show
      var nameBox = typeof doc.formulaCell === 'string' && /^[A-Z]{1,3}[1-9]\d{0,5}$/.test(doc.formulaCell) ? '<span class="xl-name">' + esc(doc.formulaCell) + '</span>' : '';
      inner = '<div class="xl-bar">' + nameBox + '<span class="xl-fx">fx</span><span class="xl-formula">' + t(doc.formula || '', c) + '</span></div>' +
        scroll(tableHtml(doc, c, { sheet: true }), '', doc.startPage) +
        '<div class="xl-tabs"><span class="on">' + tabName(doc.sheetName || 'Sheet1', c) + '</span>' + arr(doc.otherSheets).map(function (s) { return sheetTab(s, c); }).join('') + '</div>' + notesHtml(doc, c);
    } else if (st === 'statement') {
      inner = '<div class="fs-head">' + (co ? '<div class="fs-co">' + hd(co.name || co, c) + '</div>' + (co.cin ? '<div class="fs-cin">CIN: ' + t(co.cin, c) + '</div>' : '') : '') +
        '<div class="fs-title">' + hd(heading, c) + '</div>' + (doc.subtitle ? '<div class="fs-sub">' + hd(doc.subtitle, c) + '</div>' : '') + '</div>' +
        scroll(tableHtml(doc, c)) + notesHtml(doc, c);
    } else {
      // mat-1 round 1 (designer S6): a plain table that names its `company` prints it above the title, as a statutory
      // register is headed by the company whose book it is (PSC's members, Holdings' investments); without one, as before
      inner = (co ? '<div class="pl-co">' + hd(co.name || co, c) + '</div>' + (co.address ? '<div class="pl-addr">' + multiline(co.address, c) + '</div>' : '') : '') +
        (heading && doc.showHeading !== false ? '<div class="pl-title">' + hd(heading, c) + '</div>' : '') +
        (doc.subtitle ? '<div class="pl-sub">' + hd(doc.subtitle, c) + '</div>' : '') + metaGrid(doc.meta, c) +
        scroll(tableHtml(doc, c)) + notesHtml(doc, c);
    }
    return wrap(doc, inner, 'dts-' + esc(st));
  }

  /* ------------------------------------------------------------------ letters, mails, notices, minutes */
  // A table inside a letter, notice, memo or policy (a debit note's lines, a notice's demand) prints money as the
  // table documents do: an inr or num column with paise in any row prints every value to two places (2,296.80 beside
  // 25,520.00), a column of whole rupees prints none (638).
  function miniTable(tb, c) {
    var cols = tb.columns || [];
    var dec = {}; cols.forEach(function (col) { dec[col.key] = colDecimals({ rows: tb.rows, style: tb.style }, col); });
    // the first column (the row labels) is pinned, as in a table document, so More columns never shows a figure
    // without its label (gst-1: Pallavi's SGST column alone on a phone)
    function cls(col, i) { var k = (NUMERIC[col.format] ? 'r' : '') + (i === 0 ? (NUMERIC[col.format] ? ' ' : '') + 'stick0' : ''); return k ? ' class="' + k + '"' : ''; }
    return '<div class="doc-scroll" tabindex="0"><table class="dt dt-mini"><thead><tr>' + cols.map(function (col, i) {
      return '<th' + cls(col, i) + '>' + t(col.label, c) + '</th>';
    }).join('') + '</tr></thead><tbody>' + (tb.rows || []).map(function (r) {
      return '<tr class="row-' + esc(r._class || 'data') + '">' + cols.map(function (col, i) {
        var v = r[col.key], d = dec[col.key];
        var s = !isNum(v) ? null : d !== null && d !== undefined ? E.formatNumber(v, d) : E.formatValue(v, col.format === 'inr' ? 'num' : col.format);
        return '<td' + cls(col, i) + '>' + (s !== null ? esc(s) : t(v, c)) + '</td>';
      }).join('') + '</tr>';
    }).join('') + '</tbody></table></div>';
  }
  function bodyHtml(body, c) {
    var out = '', list = null, olist = null;
    function close() {
      if (list) { out += '<ul>' + list.join('') + '</ul>'; list = null; }
      if (olist) { out += '<ol>' + olist.join('') + '</ol>'; olist = null; }
    }
    arr(body).forEach(function (b) {
      if (isObj(b) && b.table) { close(); out += miniTable(b.table, c); return; }
      var s = String(b);
      if (/^- /.test(s)) { if (olist) close(); list = list || []; list.push('<li>' + t(s.slice(2), c) + '</li>'); return; }
      if (/^\d+\. /.test(s)) { if (list) close(); olist = olist || []; olist.push('<li>' + t(s.replace(/^\d+\. /, ''), c) + '</li>'); return; }
      close();
      if (/^## /.test(s)) out += '<h4>' + t(s.slice(3), c) + '</h4>';
      else if (s === '') out += '<div class="gap"></div>';
      else out += '<p>' + t(s, c) + '</p>';
    });
    close();
    return out;
  }
  function signOff(sign, c) {
    if (!sign) return '';
    if (typeof sign === 'string') return '<div class="lt-sign"><div class="sign-space">' + sigHtml(sign) + '</div><div>' + t(sign, c) + '</div></div>';
    return '<div class="lt-sign">' + (sign.closing ? '<div>' + t(sign.closing, c) + '</div>' : '') +
      (sign['for'] ? '<div>For <b>' + t(sign['for'], c) + '</b></div>' : '') +
      '<div class="sign-space">' + (sign.hand === false ? '' : sigHtml(sign.hand || sign.name)) + '</div>' +
      (sign.name ? '<div class="lt-sn">' + t(sign.name, c) + '</div>' : '') +
      (sign.role ? '<div>' + t(sign.role, c) + '</div>' : '') +
      (sign.note ? '<div class="lt-snote">' + t(sign.note, c) + '</div>' : '') + '</div>';
  }
  // a mail attachment's badge follows its extension: XLS for a workbook (.xlsx, .xls, .csv), DOC for .doc/.docx, IMG
  // for a photo; anything else keeps the PDF badge
  function fileKind(name) {
    var m = /\.([a-z0-9]+)\s*$/i.exec(String(name || ''));
    var k = m ? m[1].toLowerCase() : '';
    return /^xls/.test(k) || k === 'csv' ? ' x-xls' : /^doc/.test(k) ? ' x-doc' : /^(jpe?g|png|heic)$/.test(k) ? ' x-img' : '';
  }
  // a mail's attachment chip: a name (a chip, as before), or xl-1 round 1 `{ name, file }`, a link that downloads the
  // level's file (files/<level id>/<file>; the app passes the level id), so a chip that looks clickable opens the file
  // mat-1 round 1 (designer S5): `{ name, doc }` names a paper of the pack; where the app can open it (c.docLink(id,
  // class) returns the opening and closing tags of a link or button, as c.sheetLink does for a sheet tab) the chip opens
  // that paper; anywhere else (an item screen, a pack without that paper) it stays a plain chip, never a dead control
  // sa-4 round 5 (designer S1): the chip is a flex box, so its name sits in one .em-name span; bare, the date hold's
  // span (t() keeps "Dec 2026" together) split it into three flex items with the chip's gap between them
  // ("Salary register Apr– Dec 2026 .xlsx"); now the badge (::before) and the name are the only two
  function emName(x, c) { return '<span class="em-name">' + t(x, c) + '</span>'; }
  function emFile(c) {
    return function (a) {
      if (isObj(a)) {
        var nm = String(a.name || a.file || '');
        var L = a.doc && c && typeof c.docLink === 'function' ? c.docLink(String(a.doc), 'em-file' + fileKind(nm)) : null;
        if (L && L.open) return L.open + emName(nm, c) + L.close;
        if (a.file && c && c.levelId) {
          var href = 'files/' + encodeURIComponent(c.levelId) + '/' + String(a.file).split('/').map(encodeURIComponent).join('/');
          return '<a class="em-file' + fileKind(nm) + '" href="' + esc(href) + '" download>' + emName(nm, c) + '</a>';
        }
        return '<span class="em-file' + fileKind(nm) + '">' + emName(nm, c) + '</span>';
      }
      return '<span class="em-file' + fileKind(a) + '">' + emName(a, c) + '</span>';
    };
  }
  function renderLetter(doc, c) {
    var st = doc.style || 'letter';
    var body = bodyHtml(doc.body, c), inner = '';
    var from = doc.from, to = doc.to;
    function who(x) { return isObj(x) ? (x.name || '') + (x.email ? ' <' + x.email + '>' : '') : personName(c, x); }
    if (st === 'email') {
      var fromName = isObj(from) ? from.name : personName(c, from);
      inner = '<div class="em-subject">' + t(doc.subject, c) + '</div>' +
        '<div class="em-row"><span class="em-av" aria-hidden="true">' + esc((fromName || '?').trim().charAt(0).toUpperCase()) + '</span>' +
        '<div class="em-who"><div><b>' + t(fromName, c) + '</b>' + (isObj(from) && from.email ? ' <span class="em-addr">&lt;' + t(from.email, c) + '&gt;</span>' : '') + '</div>' +
        '<div class="em-to">to ' + arr(to).map(function (x) { return t(who(x), c); }).join(', ') +
        (doc.cc ? '<br>cc ' + arr(doc.cc).map(function (x) { return t(who(x), c); }).join(', ') : '') + '</div></div>' +
        '<div class="em-date">' + t(doc.date, c) + '</div></div>' +
        '<div class="em-body">' + body + (doc.sign ? '<div class="em-sig">' + multiline(typeof doc.sign === 'string' ? doc.sign : [doc.sign.name, doc.sign.role, doc.sign['for']].filter(Boolean), c) + '</div>' : '') + '</div>' +
        (doc.attachments && doc.attachments.length ? '<div class="em-att">' + doc.attachments.map(emFile(c)).join('') + '</div>' : '');
    } else if (st === 'notice') {
      inner = (doc.letterhead ? '<div class="nt-lh">' + multiline(doc.letterhead, c) + '</div>' : '') +
        (doc.ref || doc.date ? '<div class="nt-refs">' + (doc.ref ? '<div>' + multiline(doc.ref, c) + '</div>' : '') + (doc.date ? '<div>Date: ' + t(doc.date, c) + '</div>' : '') + '</div>' : '') +
        (to ? '<div class="nt-to"><div>To,</div>' + multiline(isObj(to) ? [to.name, to.address].filter(Boolean) : to, c) + '</div>' : '') +
        metaGrid(doc.meta, c) +
        (doc.subject ? '<div class="nt-sub"><b>Subject:</b> ' + t(doc.subject, c) + '</div>' : '') +
        '<div class="nt-body">' + body + '</div>' + signOff(doc.sign, c);
    } else if (st === 'minutes') {
      inner = (doc.letterhead ? '<div class="mn-lh">' + multiline(doc.letterhead, c) + '</div>' : '') +
        (doc.subject ? '<div class="mn-title">' + t(doc.subject, c) + '</div>' : '') +
        (doc.meta ? metaGrid(doc.meta, c) : '') +
        '<div class="mn-body">' + body + '</div>' + signOff(doc.sign, c) +
        (doc.initials !== false ? '<div class="mn-init"><span>Chairman’s initials</span>' + (doc.initials ? sigHtml(doc.initials, 'small') : '') + '</div>' : '');
    } else if (st === 'memo') {
      inner = (doc.letterhead ? '<div class="mm-lh">' + multiline(doc.letterhead, c) + '</div>' : '') + '<div class="mm-title">' + esc(doc.memoTitle || 'Internal memo') + '</div>' +
        '<div class="mm-grid">' + kv('To', arr(to).map(who).join(', '), c) + kv('From', who(from), c) + kv('Cc', doc.cc ? arr(doc.cc).map(who).join(', ') : '', c) +
        kv('Date', doc.date, c) + kv('Ref', doc.ref, c) + kv('Subject', doc.subject, c) + '</div><div class="mm-body">' + body + '</div>' + signOff(doc.sign, c);
    } else if (st === 'policy') {
      // for-1 round 3 (designer optional 3): a notice's letterhead given as { name, address } sets the name in the blue
      // capitals and the address under it in grey, as a ledger print heads its company (three lines of blue capitals
      // pushed for-1's holiday table down a phone page); a string letterhead prints as before
      var plh = isObj(doc.letterhead) ? doc.letterhead : null;
      inner = (plh ? (plh.name ? '<div class="pc-lh">' + t(plh.name, c) + '</div>' : '') + (plh.address ? '<div class="lh-addr pc-addr">' + multiline(plh.address, c) + '</div>' : '')
        : doc.letterhead ? '<div class="pc-lh">' + multiline(doc.letterhead, c) + '</div>' : '') +
        '<div class="pc-title">' + t(doc.subject || doc.title, c) + '</div>' + metaGrid(doc.meta, c) +
        '<div class="pc-body">' + body + '</div>' + signOff(doc.sign, c);
    } else if (st === 'note') {
      inner = (doc.subject ? '<div class="nb-title">' + t(doc.subject, c) + '</div>' : '') + (doc.date ? '<div class="nb-date">' + t(doc.date, c) + '</div>' : '') +
        '<div class="nb-body">' + body + '</div>' + (doc.sign ? '<div class="nb-sign">' + t(typeof doc.sign === 'string' ? doc.sign : doc.sign.name, c) + '</div>' : '');
    } else {
      inner = letterhead(doc.letterhead && isObj(doc.letterhead) ? doc.letterhead : null, c) +
        (typeof doc.letterhead === 'string' || Array.isArray(doc.letterhead) ? '<div class="lh"><div class="lh-name">' + multiline(doc.letterhead, c) + '</div></div>' : '') +
        (doc.irn ? '<div class="inv-top lt-irn">' + irnBlock(doc, c) + '</div>' : '') +
        '<div class="lt-refs"><span>' + (doc.ref ? 'Ref: ' + t(doc.ref, c) : '') + '</span><span>' + (doc.date ? 'Date: ' + t(doc.date, c) : '') + '</span></div>' +
        (to ? '<div class="lt-to"><div>To,</div>' + multiline(isObj(to) ? [to.name, to.address].filter(Boolean) : to, c) + '</div>' : '') +
        (doc.subject ? '<div class="lt-sub"><b>Sub:</b> ' + t(doc.subject, c) + '</div>' : '') +
        '<div class="lt-body">' + body + '</div>' + signOff(doc.sign, c);
    }
    return wrap(doc, inner, 'lts-' + esc(st));
  }

  /* ------------------------------------------------------------------ chat, bins, card */
  function renderChat(doc, c) {
    var msgs = doc.messages || [];
    var me = doc.me || null;
    var names = {};
    var inner = '<div class="ch-head"><span class="ch-av" aria-hidden="true">' + esc(String(doc.with || doc.title || '').trim().charAt(0).toUpperCase()) + '</span><div><b>' + t(doc.with || doc.title, c) + '</b>' +
      (doc.members ? '<div class="ch-mem">' + t(doc.members, c) + '</div>' : '') + '</div></div>' +
      '<div class="ch-body">' + (doc.date ? '<div class="ch-date"><span>' + t(doc.date, c) + '</span></div>' : '') +
      msgs.map(function (m, i) {
        var mine = me ? m.from === me : false;
        var name = personName(c, m.from);
        var showName = !mine && (i === 0 || msgs[i - 1].from !== m.from) && (doc.group !== false);
        names[name] = 1;
        return '<div class="ch-msg' + (mine ? ' me' : '') + '">' + (showName ? '<div class="ch-name">' + t(name, c) + '</div>' : '') +
          '<div class="ch-text">' + multiline(m.text, c) + '<span class="ch-time">' + t(m.time, c) + '</span></div></div>';
      }).join('') + '</div>';
    return wrap(doc, inner);
  }
  function posOf(pos) {
    var m = /^([A-Z])(\d{1,2})$/.exec(String(pos || '').toUpperCase());
    return m ? { r: m[1].charCodeAt(0) - 65, c: parseInt(m[2], 10) - 1 } : null;
  }
  var BIN_WORD = { wet: 'Wet', dusty: 'Dusty', damaged: 'Damaged', expired: 'Expired' };
  function renderBins(doc, c) {
    // show: one bin's card and shelf on their own, as that bin's paper (an item's "Shelf" tab), not the plan
    if (doc.show) {
      return wrap(doc, '<div class="bn-head"><b>' + hd(doc.room || doc.title, c) + '</b>' + (doc.subtitle ? '<span>' + hd(doc.subtitle, c) + '</span>' : '') + '</div>' +
        (renderBinCard(doc, doc.show, c) || '<div class="shelf-empty">Nothing here</div>'), 'bins-one');
    }
    var g = doc.grid || { rows: 1, cols: 1 };
    var at = {};
    (doc.bins || []).forEach(function (b) { var p = posOf(b.pos); if (p) at[p.r + ':' + p.c] = b; });
    var cells = '';
    for (var r = 0; r < g.rows; r++) {
      for (var col = 0; col < g.cols; col++) {
        var b = at[r + ':' + col];
        if (!b) { cells += '<div class="bn-empty" aria-hidden="true"></div>'; continue; }
        // a bin's condition is said in a word as well as its colour (WCAG 1.4.1), and a bin on the count list (`listed`)
        // carries a pencil tick; both are in its name for a screen reader
        var cnd = b.condition && b.condition !== 'ok' ? String(b.condition) : '';
        var cond = cnd ? ' bn-' + esc(cnd) : '';
        var word = cnd ? BIN_WORD[cnd] || cnd.charAt(0).toUpperCase() + cnd.slice(1) : '';
        cells += '<button type="button" class="bn' + cond + (b.listed ? ' bn-listed' : '') + '" data-bin="' + esc(b.id) + '" aria-label="' + esc('Bin ' + b.pos + ': ' + b.item + (word ? ', ' + word.toLowerCase() : '') + (b.listed ? ', on the list' : '')) + '">' +
          '<span class="bn-pos">' + esc(b.pos) + '</span><span class="bn-item">' + t(b.short || b.item, c) + '</span>' +
          (b.code ? '<span class="bn-code">' + t(b.code, c) + '</span>' : '') + (word ? '<span class="bn-cond">' + esc(word) + '</span>' : '') +
          '</button>';
      }
    }
    var inner = '<div class="bn-head"><b>' + hd(doc.room || doc.title, c) + '</b>' + (doc.subtitle ? '<span>' + hd(doc.subtitle, c) + '</span>' : '') + '</div>' +
      '<div class="bn-grid" style="grid-template-columns: repeat(' + g.cols + ', minmax(0, 1fr))">' + cells + '</div>' +
      (doc.door ? '<div class="bn-door">' + t(doc.door, c) + '</div>' : '') +
      '<p class="bn-hint">' + esc(doc.hint || 'Tap a bin to open its bin card and see what is on the shelf.') + '</p>';
    return wrap(doc, inner);
  }
  // What is physically on the shelf, drawn to count: one mark per carton (bag, drum, roll) and one dot per loose
  // piece. Past 120 packs (or 60 loose pieces) each marked shape stands for ten, with a legend, so the drawing
  // always adds up to the bin's real quantity.
  function packShape(pack) {
    var w = String((pack && pack[0]) || 'carton').toLowerCase();
    if (/bag|sack|pouch/.test(w)) return 'bag';
    if (/drum|barrel|can|tin|jar|bottle|jerrycan/.test(w)) return 'drum';
    if (/roll|reel|coil|bobbin/.test(w)) return 'roll';
    return 'box';
  }
  var SHAPE = { box: { w: 22, h: 16 }, bag: { w: 20, h: 19 }, drum: { w: 16, h: 21 }, roll: { w: 19, h: 19 } };
  function shapeAt(kind, x, y, ten) {
    var d = SHAPE[kind], out;
    if (kind === 'bag') {
      out = '<path class="ct" d="M' + (x + 3) + ' ' + (y + 5) + 'q-1.5 7 0 12.5q7 2 14 0q1.5-5.5 0-12.5q-2-1.5-4-1l-1.5-2.5h-3l-1.5 2.5q-2-.5-4 1z"/>' +
        '<path class="ct-tape" d="M' + (x + 7.5) + ' ' + (y + 4.5) + 'h5"/>';
    } else if (kind === 'drum') {
      out = '<rect class="ct" x="' + x + '" y="' + (y + 1.5) + '" width="' + d.w + '" height="' + (d.h - 3) + '" rx="2"/>' +
        '<path class="ct-tape" d="M' + x + ' ' + (y + 7) + 'h' + d.w + 'M' + x + ' ' + (y + 14) + 'h' + d.w + '"/>';
    } else if (kind === 'roll') {
      out = '<circle class="ct" cx="' + (x + d.w / 2) + '" cy="' + (y + d.h / 2) + '" r="' + (d.w / 2 - .5) + '"/>' +
        '<circle class="ct-core" cx="' + (x + d.w / 2) + '" cy="' + (y + d.h / 2) + '" r="3"/>';
    } else {
      out = '<rect class="ct" x="' + x + '" y="' + y + '" width="' + d.w + '" height="' + d.h + '" rx="1.5"/>' +
        '<path class="ct-tape" d="M' + (x + d.w / 2) + ' ' + y + 'v5"/>';
    }
    if (ten) out += '<text class="ct-ten" x="' + (x + d.w / 2) + '" y="' + (y + d.h / 2 + 3.4) + '" text-anchor="middle">10</text>';
    return out;
  }
  function shelfSvg(n, loose, cond, pack) {
    n = Math.max(0, Math.floor(n || 0)); loose = Math.max(0, Math.floor(loose || 0));
    if (!n && !loose) return { svg: '<div class="shelf-empty">Shelf empty</div>', legend: '' };
    var kind = packShape(pack), d = SHAPE[kind], gap = 3;
    var tens = n > 120 ? Math.floor(n / 10) : 0, singles = n > 120 ? n % 10 : n;
    var marks = tens + singles, per = marks > 60 ? 12 : 10;
    var out = '', i, x, y;
    for (i = 0; i < marks; i++) {
      x = (i % per) * (d.w + gap); y = Math.floor(i / per) * (d.h + gap);
      out += shapeAt(kind, x, y, i < tens);
    }
    var rowsN = Math.ceil(marks / per);
    var ly = rowsN * (d.h + gap) + (marks ? 4 : 0);
    var lTens = loose > 60 ? Math.floor(loose / 10) : 0, lSingles = loose > 60 ? loose % 10 : loose;
    var lMarks = lTens + lSingles, lPer = 20;
    for (i = 0; i < lMarks; i++) {
      var cx = 6 + (i % lPer) * 11, cy = ly + 6 + Math.floor(i / lPer) * 11;
      out += i < lTens ? '<circle cx="' + cx + '" cy="' + cy + '" r="5.2" class="lo lo-ten"/><text class="lo-tent" x="' + cx + '" y="' + (cy + 2.6) + '" text-anchor="middle">10</text>'
        : '<circle cx="' + cx + '" cy="' + cy + '" r="4.2" class="lo"/>';
    }
    var H = ly + (lMarks ? Math.ceil(lMarks / lPer) * 11 + 4 : 0);
    var W = Math.max(per * (d.w + gap), lMarks ? Math.min(lMarks, lPer) * 11 + 2 : 0);
    var legend = [];
    if (tens) legend.push('Each shape marked 10 is ten ' + (pack && pack[1] ? pack[1] : 'cartons') + '.');
    if (lTens) legend.push('Each dot marked 10 is ten loose pieces.');
    return {
      svg: '<svg class="shelf-svg shape-' + kind + (cond ? ' cond-' + esc(cond) : '') + '" viewBox="-2 -2 ' + (W + 4) + ' ' + (H + 4) + '" style="max-width:' + Math.min(320, Math.round((W + 4) * 1.15)) + 'px" aria-hidden="true">' + out + '</svg>',
      legend: legend.length ? '<div class="bc-legend">' + esc(legend.join(' ')) + '</div>' : ''
    };
  }
  var CONDITION = { damaged: 'Damaged cartons', wet: 'Water marks on cartons', expired: 'Expiry date passed on the label', dusty: 'Thick dust, not moved for months' };
  // one lot on the shelf: its drawing, "43 cartons × 50 nos + 80 loose", its condition and remark. A bin is one lot
  // unless it lists `lots` (a pallet beside the rack, a wet bottom pallet), each counted and drawn on its own.
  function lotHtml(l, b, c) {
    var cartons = l.cartons || 0, per = l.perCarton || 0, loose = l.loose || 0, out = [];
    var pack = Array.isArray(l.pack) && l.pack.length ? l.pack : Array.isArray(b.pack) && b.pack.length ? b.pack : ['carton', 'cartons'];
    if (cartons) out.push(E.formatInt(cartons) + ' ' + esc(cartons === 1 ? pack[0] : (pack[1] || pack[0] + 's')) + (per ? ' \u00D7 ' + E.formatInt(per) + ' ' + esc(l.unit || b.unit || '') : ''));
    if (loose) out.push(E.formatInt(loose) + ' loose');
    var cond = l.condition && l.condition !== 'ok' ? l.condition : '';
    var shelf = shelfSvg(cartons, loose, cond, pack);
    return (l !== b && l.label ? '<div class="bc-lot-label">' + t(l.label, c) + '</div>' : '') + shelf.svg + shelf.legend +
      '<div class="bc-count">' + (out.length ? out.join(' + ') : 'Nothing on the shelf') + '</div>' +
      (cond ? '<div class="bc-cond cond-' + esc(cond) + '">' + esc(CONDITION[cond] || cond) + '</div>' : '') +
      (l.remark ? '<div class="bc-remark">' + t(l.remark, c) + '</div>' : '');
  }
  function renderBinCard(doc, binId, c) {
    var b = (doc.bins || []).filter(function (x) { return x.id === binId; })[0];
    if (!b) return '';
    c = c || {};
    var tag = b.tag || {};
    var lots = Array.isArray(b.lots) && b.lots.length ? b.lots : null;
    var shelfHtml = lots ? lots.map(function (l) { return '<div class="bc-lot">' + lotHtml(l, b, c) + '</div>'; }).join('') : lotHtml(b, b, c);
    var title = '<div class="bc-title">' + t(b.shelfTitle || 'On the shelf', c) + '</div>';
    // card: false = no bin card on this spot (a dispatch bay, a QC hold rack): the shelf alone
    if (b.card === false) return '<div class="bincard one"><div class="bc-shelf">' + title + shelfHtml + '</div></div>';
    return '<div class="bincard">' +
      '<div class="bc-tag"><span class="bc-hole" aria-hidden="true"></span><div class="bc-title">Bin card · ' + esc(b.pos) + '</div>' +
      '<div class="bc-row"><span>Item</span><b class="hw">' + hz(t(b.item, c)) + '</b></div>' +
      (b.code ? '<div class="bc-row"><span>Code</span><b class="hw">' + hz(t(b.code, c)) + '</b></div>' : '') +
      '<div class="bc-row"><span>Unit</span><b class="hw">' + t(b.unit, c) + '</b></div>' +
      (tag.text ? '<div class="bc-row"><span>Balance</span><b class="hw">' + t(tag.text, c) + '</b></div>' : '') +
      (tag.date ? '<div class="bc-row"><span>Last entry</span><b class="hw">' + t(tag.date, c) + '</b></div>' : '') +
      (b.lastMoved ? '<div class="bc-row"><span>Last issue</span><b class="hw">' + t(b.lastMoved, c) + '</b></div>' : '') +
      '</div>' +
      '<div class="bc-shelf">' + title + shelfHtml + '</div></div>';
  }
  function renderCard(doc, c) {
    var st = doc.style || 'slip';
    var hand = st === 'tag' || st === 'voucher' || doc.handwritten;
    var rows = (doc.fields || []).map(function (f) {
      return '<div class="cd-row"><span class="cd-l">' + t(f.label, c) + '</span><span class="cd-v' + (hand ? ' hw' : '') + '">' + (hand ? hz(multiline(f.value, c)) : multiline(f.value, c)) + '</span></div>';
    }).join('');
    var inner = (st === 'tag' ? '<span class="cd-hole" aria-hidden="true"></span>' : '') +
      (doc.issuer ? '<div class="cd-issuer">' + t(doc.issuer, c) + '</div>' : '') +
      // sa-4 round 5 (the designer's S1 pattern): the title row is a flex box (title left, number right), so the title is
      // one span; bare, a held date inside it ("at 31 March 2027", sa-7) became its own item, pushed apart from its words
      '<div class="cd-title"><span class="cd-tt">' + hd(doc.heading || doc.title, c) + '</span>' + (doc.number ? '<span class="cd-no">No. ' + t(doc.number, c) + '</span>' : '') + '</div>' +
      '<div class="cd-rows">' + rows + '</div>' +
      (st === 'voucher' ? '<div class="cd-signs' + (doc.revenueStamp ? ' has-rev' : '') + '"><span>Prepared by</span><span>Passed by</span><span class="cd-rev">Receiver’s signature' + (doc.revenueStamp ? '<i class="rev">Revenue stamp</i>' : '') + '</span></div>' : '') +
      (doc.photoNote ? '<div class="cd-photo">' + t(doc.photoNote, c) + '</div>' : '');
    return wrap(doc, inner, 'cds-' + esc(st));
  }

  /* ------------------------------------------------------------------ dispatch and labels */
  var RENDER = { invoice: renderInvoice, po: renderPo, grn: renderGrn, table: renderTable, letter: renderLetter,
    chat: renderChat, bins: renderBins, card: renderCard };
  function renderDocument(doc, ctx) {
    if (!doc || !RENDER[doc.type]) return '<article class="doc doc-unknown"><div class="doc-paper"><p>' + esc(doc && doc.title) + '</p></div></article>';
    return RENDER[doc.type](doc, makeCtx(doc, ctx));
  }
  var TYPE_LABEL = { invoice: 'Invoice', po: 'PO', grn: 'GRN', chat: 'Chat', bins: 'Stock room', card: 'Card' };
  var TABLE_LABEL = { tally: 'Ledger', register: 'Register', bank: 'Bank statement', portal: 'Portal', sheet: 'Sheet', statement: 'Statement', plain: 'Table' };
  var LETTER_LABEL = { email: 'Mail', letter: 'Letter', notice: 'Notice', minutes: 'Minutes', memo: 'Memo', policy: 'Policy', note: 'Note' };
  var CARD_LABEL = { tag: 'Tag', slip: 'Slip', visiting: 'Visiting card', voucher: 'Voucher', challan: 'Challan' };
  function typeLabel(doc) {
    if (!doc) return '';
    if (typeof doc.kindLabel === 'string' && doc.kindLabel) return doc.kindLabel;   // e.g. "Portal print" for a plain table
    if (doc.type === 'table') return TABLE_LABEL[doc.style] || 'Table';
    if (doc.type === 'card') return CARD_LABEL[doc.style || 'slip'] || 'Card';
    if (doc.type === 'letter') return LETTER_LABEL[doc.style] || 'Letter';
    return TYPE_LABEL[doc.type] || 'Document';
  }
  function tabLabel(doc) {
    if (!doc) return '';
    if (doc.tab) return doc.tab;
    var title = String(doc.title || '');
    var i = title.lastIndexOf(' · ');
    return i >= 0 ? title.slice(i + 3) : typeLabel(doc);
  }

  return {
    esc: esc, nwCodes: nwCodes, nwParts: nwParts, nwSections: nwSections, nwRanges: nwRanges, nwUnits: nwUnits, nwDates: nwDates, nwDayRanges: nwDayRanges, nwMonthRanges: nwMonthRanges, mailBreak: mailBreak, renderDocument: renderDocument, renderBinCard: renderBinCard, shelfSvg: shelfSvg, packShape: packShape, invoiceTotals: invoiceTotals, poTotals: poTotals,
    typeLabel: typeLabel, tabLabel: tabLabel, qrSvg: qrSvg, posOf: posOf, annotation: annotation,
    TYPES: Object.keys(RENDER), TABLE_STYLES: Object.keys(TABLE_LABEL), LETTER_STYLES: Object.keys(LETTER_LABEL), INVOICE_STYLES: INVOICE_STYLES.slice()
  };
});
