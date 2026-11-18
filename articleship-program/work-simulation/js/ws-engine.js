/* MSC Articleship Program · Work Simulation engine (UMD, pure, no DOM).
   Scoring, stars, counts, earned lines, Indian formatting and the state reducers.
   Browser: window.MSCWSEngine. Node: require('./ws-engine.js'). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MSCWSEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STAGES = ['Planning', 'Fieldwork', 'Review', 'Report'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MINUS = '−';
  var EPS = 1e-9;

  /* ------------------------------------------------------------------ helpers */
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function arr(v) { return Array.isArray(v) ? v : (v === undefined || v === null || v === '' ? [] : [v]); }
  function own(o, k) { return o !== null && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }

  /* ------------------------------------------------------------------ number formatting (Indian) */
  function groupIndian(digits) {
    var s = String(digits);
    if (s.length <= 3) return s;
    var last3 = s.slice(-3), rest = s.slice(0, -3);
    return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }

  // decimals: a number (fixed), or 'auto' (up to `max` decimals, trailing zeros trimmed)
  function formatNumber(n, decimals, max) {
    if (!isNum(n)) return '';
    var neg = n < 0; var a = Math.abs(n);
    var d = decimals === undefined || decimals === 'auto' ? null : decimals;
    var s;
    if (d === null) {
      var m = max === undefined ? 2 : max;
      s = a.toFixed(m);
      if (s.indexOf('.') >= 0) s = s.replace(/0+$/, '').replace(/\.$/, '');
    } else s = a.toFixed(d);
    var parts = s.split('.');
    var out = groupIndian(parts[0]) + (parts[1] ? '.' + parts[1] : '');
    if (neg && /[1-9]/.test(out)) out = MINUS + out;
    return out;
  }
  function formatInt(n) { return isNum(n) ? formatNumber(Math.round(n), 0) : ''; }
  // money is whole rupees, or rupees and paise to two places: never one decimal ("₹18,974.40", not "₹18,974.4")
  function formatINR(n, opts) {
    if (!isNum(n)) return '';
    opts = opts || {};
    var d = opts.decimals === undefined || opts.decimals === 'auto' ? (Math.round(Math.abs(n) * 100) % 100 !== 0 ? 2 : 0) : opts.decimals;
    var body = formatNumber(Math.abs(n), d);
    var sym = opts.symbol === false ? '' : '₹';
    return (n < 0 && /[1-9]/.test(body) ? MINUS : '') + sym + body;
  }
  function trimZeros(s) { return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '') : s; }
  function formatLakh(n, dec) {
    if (!isNum(n)) return '';
    var v = trimZeros((Math.abs(n) / 1e5).toFixed(dec === undefined ? 1 : dec));
    return (n < 0 ? MINUS : '') + '₹' + v + ' lakh';
  }
  // dec: decimals kept (trailing zeros trimmed); lakh defaults to 1, crore to 2
  function formatCrore(n, dec) {
    if (!isNum(n)) return '';
    var v = trimZeros((Math.abs(n) / 1e7).toFixed(dec === undefined ? 2 : dec));
    return (n < 0 ? MINUS : '') + '₹' + v + ' crore';
  }
  function formatPct(n, d) {
    if (!isNum(n)) return '';
    return formatNumber(n, d === undefined ? 1 : d) + '%';
  }
  // format names used by documents, worksheets and earned counts
  function formatValue(v, fmt) {
    if (v === null || v === undefined) return '';
    if (!isNum(v)) return String(v);
    switch (fmt) {
      case 'int': return formatInt(v);
      case 'inr': return formatINR(v);
      case 'inr0': return formatINR(Math.round(v), { decimals: 0 });
      case 'inr2': return formatINR(v, { decimals: 2 });
      case 'amount': return formatNumber(v, 2);           // ledger style: 48,970.00
      case 'lakh': return formatLakh(v);
      case 'lakh2': return formatLakh(v, 2);
      case 'crore': return formatCrore(v);
      case 'crore1': return formatCrore(v, 1);
      case 'pct': return formatPct(v, 'auto');
      case 'pct0': return formatPct(v, 0);
      case 'pct1': return formatPct(v, 1);
      case 'pct2': return formatPct(v, 2);
      case 'qty': return formatNumber(v, 'auto', 3);
      case 'num': return formatNumber(v, 'auto');
      case 'num1': return formatNumber(v, 1);              // a figure in a line, one decimal whatever was typed: 123.5
      case 'text': return String(v);
      default: return Number.isInteger(v) ? formatInt(v) : formatNumber(v, 'auto');
    }
  }
  // A column of changes (effects, movements, adjustments) carries `signed: true` (or a cell does): an increase then
  // prints with a plus ("+₹18,64,000"), zero stays "₹0" and a decrease keeps its minus. Shown values only: the input
  // box keeps what the student typed.
  function formatSigned(v, fmt) {
    var s = formatValue(v, fmt);
    return isNum(v) && v > 0 && /[1-9]/.test(s) ? '+' + s : s;
  }
  function cellSigned(col, cell) {
    if (isObj(cell) && typeof cell.signed === 'boolean') return cell.signed;
    return !!(col && col.signed === true);
  }
  function formatCell(v, fmt, signed) { return signed ? formatSigned(v, fmt) : formatValue(v, fmt); }
  // The percentage a student is shown is floored, so it never shows a star band the attempt did not reach (89.55%
  // reads "89% right", not "90% right" beside two stars)
  function pctShown(acc) { return Math.max(0, Math.floor((isNum(acc) ? acc : 0) * 100 + EPS)); }

  // Accepts "1,23,456", "₹ 1,23,456", "Rs. 500", "-2.5", "−2.5", "(2.5)", "2.5%", " 4 080 ". Returns a number or null.
  function parseNumber(input) {
    if (isNum(input)) return input;
    if (typeof input !== 'string') return null;
    var s = input.trim();
    if (!s) return null;
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim(); }
    s = s.replace(/^(?:₹|rs\.?|inr)\s*/i, '');
    if (/^[-−–]/.test(s)) { neg = !neg; s = s.slice(1).trim(); }
    s = s.replace(/^(?:₹|rs\.?|inr)\s*/i, '');
    s = s.replace(/%$/, '').trim();
    s = s.replace(/[,\s   ]/g, '');
    if (!/^\+?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
    var v = parseFloat(s.replace(/^\+/, ''));
    if (!isFinite(v)) return null;
    return neg ? -v : v;
  }

  // How a typed figure is shown back once the student leaves the box: Indian grouping, a true minus sign, no ₹ or %
  // (the box shows those itself). Text that is not a number is left exactly as typed.
  // The decimals the student typed are kept (dt-4: a prompt asks for two decimals, and "9.90" stays "9.90", not "9.9");
  // a figure typed without decimals shows none, and one with more than six is cut to six, as before.
  function typedFigure(s, n) {
    var m = String(s).match(/\.(\d+)\s*%?\s*\)?\s*$/);
    return m ? formatNumber(n, Math.min(m[1].length, 6)) : formatNumber(n, 'auto', 6);
  }
  function tidyNumberText(v) {
    var n = parseNumber(v);
    if (n === null) return typeof v === 'string' ? v : (v === undefined || v === null ? '' : String(v));
    return typedFigure(v, n);
  }
  // The ± button beside a number box (an iPhone number pad has no minus key): flips the sign of what is typed.
  function toggleSign(v) {
    var s = String(v === undefined || v === null ? '' : v).trim();
    if (/^\(.*\)$/.test(s)) s = s.slice(1, -1).trim();
    else if (/^[-−–]/.test(s)) s = s.replace(/^[-−–]\s*/, '');
    else s = MINUS + s;
    var n = parseNumber(s);
    return n === null ? s : typedFigure(s, n);
  }
  function isNegativeText(v) {
    var s = String(v === undefined || v === null ? '' : v).trim();
    var n = parseNumber(s);
    return n !== null ? n < 0 || (n === 0 && /^[-−–(]/.test(s)) : /^[-−–]/.test(s);
  }
  function monthLabel(t) {
    var d = t instanceof Date ? t : new Date(isNum(t) ? t : Date.now());
    if (isNaN(d.getTime())) return '';
    return MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function words99(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
  function words999(n) {
    var h = Math.floor(n / 100), r = n % 100, out = [];
    if (h) out.push(ONES[h] + ' Hundred');
    if (r) out.push(words99(r));
    return out.join(' ');
  }
  function intWords(n) {
    if (n === 0) return 'Zero';
    var out = [];
    var crore = Math.floor(n / 1e7); n %= 1e7;
    var lakh = Math.floor(n / 1e5); n %= 1e5;
    var th = Math.floor(n / 1e3); n %= 1e3;
    if (crore) out.push(intWords(crore) + ' Crore');
    if (lakh) out.push(words99(lakh) + ' Lakh');
    if (th) out.push(words99(th) + ' Thousand');
    if (n) out.push(words999(n));
    return out.join(' ');
  }
  // "Rupees Forty Six Thousand Twenty and Fifty Paise Only" (Indian system)
  function amountInWords(n, opts) {
    if (!isNum(n)) return '';
    opts = opts || {};
    var paiseTotal = Math.round(Math.abs(n) * 100);
    var rupees = Math.floor(paiseTotal / 100), paise = paiseTotal % 100;
    var s = (opts.prefix === undefined ? 'Rupees' : opts.prefix) + ' ' + intWords(rupees);
    if (paise) s += ' and ' + words99(paise) + ' Paise';
    return s.replace(/^\s+/, '') + ' Only';
  }
  function normWords(s) {
    return String(s || '').toLowerCase().replace(/[-,.:]/g, ' ').replace(/\b(rupees?|inr|rs|only|and)\b/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function wordsMatch(words, n) { return normWords(words) === normWords(amountInWords(n)); }

  /* ------------------------------------------------------------------ text helpers */
  function capFirst(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  // collapses ordinary spaces and line breaks (a non-breaking space, U+00A0, is kept: it holds a date or a size together)
  function tidy(s) {
    return String(s).replace(/[ \t\r\n\f\v]+/g, ' ').replace(/[ \t]+([,;:.)])/g, '$1').replace(/\([ \t]+/g, '(').replace(/^[ \t]+|[ \t]+$/g, '');
  }
  function stripEnd(s) { return String(s || '').replace(/[\s.]+$/, ''); }
  // tidy each line on its own and keep the line breaks: one blank line at most between paragraphs, none at the ends
  function tidyLines(s) {
    return String(s).split(/\r?\n/).map(function (l) { return tidy(l); }).join('\n')
      .replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
  }

  /* ------------------------------------------------------------------ seeded order */
  function hashString(str) {               // FNV-1a, 32 bit
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h >>> 0;
  }
  function rng(seed) {                     // mulberry32
    var a = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function lcsLength(a, b) {
    a = a || []; b = b || [];
    var prev = new Array(b.length + 1).fill(0);
    for (var i = 1; i <= a.length; i++) {
      var cur = [0];
      for (var j = 1; j <= b.length; j++) {
        cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
      }
      prev = cur;
    }
    return prev[b.length];
  }
  // ia-1 round 1: the members of one longest common subsequence of `a` (the student's order) and `b` (the answer), in
  // a's order, so the order review ticks exactly as many steps as its "7 of 8 in sequence" heading counts. Where several
  // subsequences are as long, it keeps the student's earlier steps (a step is skipped only when keeping it would shorten
  // the subsequence).
  // ia-1 round 5 (designer optional 1): among subsequences as long, the one with more steps at their own number (the
  // student's position i is the answer's j) wins first, so a tick lands on a step that sits in its place where one can;
  // only then are the student's earlier steps kept, as before. Each cell scores length × (n + 1) + steps in place, so
  // length always decides first.
  function lcsMembers(a, b) {
    a = a || []; b = b || [];
    var n = a.length, m = b.length, K = n + 1, L = [], i, j;
    var take = function (i, j) { return L[i + 1][j + 1] + K + (i === j ? 1 : 0); };
    for (i = 0; i <= n; i++) L.push(new Array(m + 1).fill(0));
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = Math.max(L[i + 1][j], L[i][j + 1], a[i] === b[j] ? take(i, j) : 0);
    var out = []; i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j] && take(i, j) === L[i][j]) { out.push(a[i]); i++; j++; }
      else if (L[i][j + 1] >= L[i + 1][j]) j++;
      else i++;
    }
    return out;
  }
  // Deterministic shuffle seeded by `seed`; never the answer order (for n >= 2), and the candidate with the
  // least head start (LCS with the answer, then fixed points) among 64 seeded tries.
  function shuffledOrder(ids, seed, answer) {
    ids = (ids || []).slice();
    var target = answer && answer.length ? answer : ids;
    if (ids.length < 2) return ids;
    var r = rng(String(seed)), best = null, bestKey = null;
    for (var k = 0; k < 64; k++) {
      var c = ids.slice();
      for (var i = c.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = c[i]; c[i] = c[j]; c[j] = t; }
      if (c.join('\u0001') === target.join('\u0001')) continue;
      var fixed = 0; for (var f = 0; f < c.length; f++) if (c[f] === target[f]) fixed++;
      var key = lcsLength(c, target) * 100 + fixed;
      if (bestKey === null || key < bestKey) { best = c; bestKey = key; }
    }
    if (!best) { best = target.slice().reverse(); }
    return best;
  }

  /* ------------------------------------------------------------------ fields and items */
  function isEmpty(v) {
    if (v === undefined || v === null) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }
  function matchesCond(given, want) {
    var wants = arr(want);
    if (Array.isArray(given)) return given.some(function (g) { return wants.indexOf(g) >= 0; });
    return wants.indexOf(given) >= 0;
  }
  function fieldVisible(field, itemAns) {
    if (!field || !isObj(field.showIf)) return true;
    itemAns = itemAns || {};
    return Object.keys(field.showIf).every(function (k) { return matchesCond(itemAns[k], field.showIf[k]); });
  }
  // sa-6 round 1: a number field may carry `integer: true` (a day of the month, a count): a figure with decimals there
  // ("05.04" typed for 5 April reads 5.04) is not an answer yet, so the box is flagged and the item stays open
  // con-1 round 1 (designer S1): a number field (or a worksheet cell or task, read through the UI's wsField) may carry
  // `maxAbs`: a figure bigger than that is no answer the box takes (₹5,74,60,000 typed in a ₹ lakh box), so it is flagged
  // under the box with the `invalidNote` and the hand-in says it apart, as text that is no figure is
  function overMax(field, n) { return !!field && isNum(field.maxAbs) && n !== null && Math.abs(n) > field.maxAbs + EPS; }
  function fieldAnswered(field, v) {
    if (!field) return false;
    if (field.kind === 'number') { var n = parseNumber(v); return n !== null && !(field.integer === true && Math.floor(n) !== n) && !overMax(field, n); }
    return !isEmpty(v);
  }
  // a number box holds text but no figure the field can take ("5/4", "5th", "05.04" in a whole-number box): the UI
  // flags it under the box, and the phone bar says "Check 1 box" instead of "1 more to fill"
  function numberInvalid(field, v) {
    return !!field && field.kind === 'number' && !isEmpty(v) && !fieldAnswered(field, v);
  }
  // "5 April" typed into a box whose own unit is "April" (sa-6: the day a cheque cleared) is read as 5: the unit word the
  // box already shows is taken off before the figure is read. Only a word unit, only at the end, and only when what is
  // left is a figure, so nothing that parsed before reads differently.
  function stripUnit(text, unit) {
    if (typeof text !== 'string' || typeof unit !== 'string' || !/^[A-Za-z][A-Za-z .]*$/.test(unit.trim())) return text;
    var u = unit.trim().replace(/[.]/g, '\\.').replace(/ +/g, '\\s+');
    var m = text.match(new RegExp('^(.*?\\S)\\s*' + u + '\\.?\\s*$', 'i'));
    return m && parseNumber(m[1]) !== null ? m[1].trim() : text;
  }
  // sa-6 round 2: what a number box's text reads as once the student leaves it. The field's word unit is taken off
  // (stripUnit), and in a whole-number box (`integer: true`) an ordinal ending too, the way many write a date: "8th" or
  // "8th April" reads 8. Only when what is left is a figure; anything else ("8th of April", "5/4") is left exactly as
  // typed and flagged, and a box that is not whole-number keeps its old reading ("8th" there is still flagged).
  function readTyped(field, text) {
    if (typeof text !== 'string' || !field) return text;
    var v = field.unit ? stripUnit(text, field.unit) : text;
    if (field.integer === true && parseNumber(v) === null) {
      var m = text.match(/^\s*(\d{1,4})\s*(?:st|nd|rd|th)\.?(\s+\S.*)?$/i);
      if (m) {
        var w = m[2] ? (field.unit ? stripUnit(m[1] + m[2], field.unit) : m[1] + m[2]) : m[1];
        if (parseNumber(w) !== null) return w;
      }
    }
    return v;
  }
  function scored(field) { return field && field.kind !== 'text'; }
  function fieldApplicable(field, item, itemAns) {
    if (!scored(field)) return false;
    var exp = item && item.answer ? item.answer : {};
    if (!own(exp, field.id)) return false;
    return fieldVisible(field, itemAns) || !isEmpty(exp[field.id]);
  }
  function numberOk(field, expected, given, cell) {
    var g = parseNumber(given);
    if (g === null) return false;
    var opts = cell || field || {};
    var exps = arr(expected).map(parseNumber).filter(function (x) { return x !== null; });
    return exps.some(function (e) {
      var tol = isNum(opts.tolerance) ? opts.tolerance : 0;
      if (isNum(opts.toleranceRel)) tol = Math.max(tol, Math.abs(e) * opts.toleranceRel);
      return Math.abs(g - e) <= tol + EPS;
    });
  }
  function uniq(list) { var seen = {}; return list.filter(function (x) { if (seen[x]) return false; seen[x] = 1; return true; }); }
  function jaccard(a, b) {
    var A = uniq(arr(a)), B = uniq(arr(b));
    if (!A.length && !B.length) return 1;
    var inter = A.filter(function (x) { return B.indexOf(x) >= 0; }).length;
    return inter / (A.length + B.length - inter);
  }
  function scoreField(field, expected, given) {
    switch (field.kind) {
      case 'choice': return !isEmpty(given) && arr(expected).indexOf(given) >= 0 ? 1 : 0;
      case 'multi': return jaccard(expected, given);
      case 'number': return numberOk(field, expected, given) ? 1 : 0;
      default: return 0;
    }
  }
  // a field's weight inside its item (default 1): sa-1's reasons weigh 3, so naming what is wrong counts for more
  // than the Fine/Exception call and the year together
  function fieldWeight(f) { return f && isNum(f.weight) && f.weight > 0 ? f.weight : 1; }
  // an item's weight inside its task (default 1; scoreTask): the find a level is about may weigh more than a decoy
  function itemWeight(it) { return it && isNum(it.weight) && it.weight > 0 ? it.weight : 1; }
  // acc-1 round 1: a worksheet input cell's weight inside its task (default 1; scoreTask), as an item's: the figure a
  // level is about (acc-1's loan split and micro-and-small dues) may weigh more than a figure the sheet only adds up
  function cellWeight(cell) { return cell && isNum(cell.weight) && cell.weight > 0 ? cell.weight : 1; }
  function scoreItem(task, item, itemAns) {
    itemAns = itemAns || {};
    var fields = task.fields || [], exp = item.answer || {};
    var out = { score: 0, correct: false, gateOk: true, fields: {} };
    var sum = 0, n = 0;
    fields.forEach(function (f) {
      var applicable = fieldApplicable(f, item, itemAns);
      var s = applicable ? scoreField(f, exp[f.id], itemAns[f.id]) : null;
      out.fields[f.id] = { applicable: applicable, score: s };
      if (applicable) { var fw = fieldWeight(f); sum += s * fw; n += fw; }
      if (f.gate && applicable && s < 1) out.gateOk = false;
    });
    if (!out.gateOk) out.score = 0;
    else out.score = n ? sum / n : (itemAnswered(task, item, itemAns) ? 1 : 0);
    out.correct = out.score >= 1 - EPS;
    return out;
  }
  function itemAnswered(task, item, itemAns) {
    itemAns = itemAns || {};
    var fields = (task.fields || []).filter(scored);
    if (!fields.length) return true;
    var gates = fields.filter(function (f) { return f.gate; });
    if (gates.some(function (g) { return !fieldAnswered(g, itemAns[g.id]); })) return false;
    return fields.every(function (f) {
      if (!fieldVisible(f, itemAns)) return true;
      return fieldAnswered(f, itemAns[f.id]);
    });
  }

  // What the review says back on one item. `fields`: every scored field the key has, with its state (right, partial
  // or wrong) and, for a multi, the student's right picks, wrong picks and missed options, in option order. `extra`:
  // fields the student answered that the key does not have (a reason picked on a bill that was fine), so a wrong call
  // still shows what the student flagged. Pure; the UI turns option ids into labels.
  function itemReview(task, item, itemAns) {
    itemAns = itemAns || {};
    var sc = scoreItem(task, item, itemAns), exp = item.answer || {};
    var out = { score: sc.score, correct: sc.correct, gateOk: sc.gateOk, fields: [], extra: [] };
    (task.fields || []).forEach(function (f) {
      if (!scored(f)) return;
      var fs = sc.fields[f.id];
      if (fs && fs.applicable) {
        var row = { id: f.id, gate: !!f.gate, score: fs.score, given: itemAns[f.id], expected: exp[f.id],
          state: fs.score >= 1 - EPS ? 'right' : fs.score > EPS ? 'partial' : 'wrong' };
        if (f.kind === 'multi') {
          var e = arr(exp[f.id]), g = arr(itemAns[f.id]);
          row.picks = (f.options || []).map(function (o) {
            var picked = g.indexOf(o.id) >= 0, want = e.indexOf(o.id) >= 0;
            return picked ? { id: o.id, ok: want } : want ? { id: o.id, missed: true } : null;
          }).filter(Boolean);
        }
        out.fields.push(row);
      } else if (!f.gate && fieldVisible(f, itemAns) && fieldAnswered(f, itemAns[f.id])) {
        out.extra.push({ id: f.id, given: itemAns[f.id] });
      }
    });
    return out;
  }

  /* ------------------------------------------------------------------ worksheet */
  function inputCells(task) {
    var out = [];
    (task.rows || []).forEach(function (row) {
      var cells = row.cells || {};
      (task.columns || []).forEach(function (col) {
        var c = cells[col.key];
        // max: the cell's `maxAbs`, else the task's (con-1 round 1), or null: a bigger figure is no answer (overMax)
        if (isObj(c) && c.input) out.push({ row: row, col: col, cell: c, key: row.id + '.' + col.key, max: isNum(c.maxAbs) ? c.maxAbs : isNum(task.maxAbs) ? task.maxAbs : null });
      });
    });
    return out;
  }
  // a cell's figure as the student typed it, or null when it is no figure or bigger than the cell's maxAbs
  function cellFigure(c, v) { var n = parseNumber(v); return n === null || overMax({ maxAbs: c && c.max }, n) ? null : n; }
  function cellCorrect(cell, given) { return numberOk(null, cell.answer, given, cell); }
  // Method marks (opt-in, val-1): a cell may carry `follow`, its working written over the task's other input cells,
  // e.g. "{r8.fy26} ÷ 18640 × 100" or "2328 − {r8.fy26}" (numbers, + − × ÷ and brackets; - * / also read). A wrong
  // cell scores when it equals that working on the student's own entries, within its tolerance plus 0.01 for each
  // figure it uses, and only when a figure it uses is wrong (a right upstream leaves the key to decide). A cell that
  // accepts both signs (an adjustment whose row says which way it goes) is read as its size. Counts and the review's
  // "right figure" stay on the key.
  function followRefs(expr) {
    var out = [];
    String(expr || '').replace(/\{([\w-]+\.[\w-]+)\}/g, function (m, k) { if (out.indexOf(k) < 0) out.push(k); return m; });
    return out;
  }
  // evaluates a follow working; val(key) gives a referenced cell's number or null. Null when it cannot be worked.
  function evalFollow(expr, val) {
    var s = String(expr || ''), i = 0, bad = false;
    function sp() { while (i < s.length && /\s/.test(s.charAt(i))) i++; }
    function atom() {
      sp();
      var ch = s.charAt(i);
      if (ch === '(') { i++; var v = sum(); sp(); if (s.charAt(i) !== ')') bad = true; i++; return v; }
      if (ch === '{') {
        var j = s.indexOf('}', i);
        if (j < 0) { bad = true; return NaN; }
        var x = val(s.slice(i + 1, j)); i = j + 1;
        if (!isNum(x)) { bad = true; return NaN; }
        return x;
      }
      if (ch === '-' || ch === MINUS) { i++; return -atom(); }
      var m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
      if (!m) { bad = true; return NaN; }
      i += m[0].length;
      return parseFloat(m[0]);
    }
    function prod() {
      var v = atom();
      for (;;) {
        sp(); var ch = s.charAt(i);
        if (ch === '×' || ch === '*') { i++; v *= atom(); } else if (ch === '÷' || ch === '/') { i++; v /= atom(); } else return v;
      }
    }
    function sum() {
      var v = prod();
      for (;;) {
        sp(); var ch = s.charAt(i);
        if (ch === '+') { i++; v += prod(); } else if (ch === '-' || ch === MINUS) { i++; v -= prod(); } else return v;
      }
    }
    if (!s.trim()) return null;
    var v = sum(); sp();
    return bad || i < s.length || !isNum(v) ? null : v;
  }
  function bothSigns(cell) {
    var a = arr(cell && cell.answer).map(parseNumber);
    return a.some(function (x) { return x !== null && x < 0; }) && a.some(function (x) { return x !== null && x > 0; });
  }
  // the follow working of cell `c` (an inputCells entry) on answers `a`, or null; byKey: inputCells by key
  function followValue(c, a, byKey) {
    return evalFollow(c.cell.follow, function (k) {
      var r = byKey[k], g = r ? cellFigure(r, (a || {})[k]) : null;
      return g === null ? null : (bothSigns(r.cell) ? Math.abs(g) : g);
    });
  }
  // does a wrong cell follow the student's own figures? good: { key: right on the key }
  // ba-1 round 1: a follow cell may carry `noFollowIf: "<column key>"`, the column holding the client's own working on
  // each row (the working the task is about not taking as it is). The cell then earns no method mark for a figure that
  // only repeats that working: one equal (within its tolerance) to that column's number on its own row, or one worked
  // only from figures that each equal that column's number on their rows (Kuruli's working copied box by box earned
  // four method marks, and its 304.20 carried on to a "−11.60" excess one more)
  function clientFigure(cl, colKey) {
    return cl && cl.row && isObj(cl.row.cells) ? parseNumber(cl.row.cells[colKey]) : null;
  }
  function cellFollows(c, a, byKey, good) {
    if (!c.cell || typeof c.cell.follow !== 'string' || good[c.key]) return false;
    var g = cellFigure(c, (a || {})[c.key]);
    if (g === null) return false;
    var refs = followRefs(c.cell.follow);
    if (!refs.length || !refs.some(function (k) { return byKey[k] && !good[k]; })) return false;
    var v = followValue(c, a, byKey);
    if (v === null) return false;
    var tol = isNum(c.cell.tolerance) ? c.cell.tolerance : 0;
    if (isNum(c.cell.toleranceRel)) tol = Math.max(tol, Math.abs(v) * c.cell.toleranceRel);
    var nf = c.cell.noFollowIf;
    if (typeof nf === 'string' && nf) {
      var own = clientFigure(c, nf);
      if (own !== null && Math.abs(g - own) <= tol + EPS) return false;
      if (refs.every(function (k) {
        var r = byKey[k], t = clientFigure(r, nf), x = r ? parseNumber((a || {})[k]) : null;
        return t !== null && x !== null && Math.abs(x - t) <= (isNum(r.cell.tolerance) ? r.cell.tolerance : 0) + EPS;
      })) return false;
    }
    return Math.abs(g - v) <= tol + 0.01 * refs.length + EPS;
  }

  /* ------------------------------------------------------------------ choice questions */
  function rightIds(q) { return (q.options || []).filter(function (o) { return o.correct; }).map(function (o) { return o.id; }); }
  function scoreQuestion(q, given) {
    var right = rightIds(q);
    if (!q.multi) return !isEmpty(given) && right.indexOf(given) >= 0 ? 1 : 0;
    var picks = arr(given);
    var r = 0, w = 0;
    picks.forEach(function (p) { if (right.indexOf(p) >= 0) r++; else w++; });
    if (!right.length) return picks.length ? 0 : 1;
    return Math.max(0, (r - w) / right.length);
  }

  /* ------------------------------------------------------------------ order, compose, hunt */
  function orderSeed(level, task) { return (level && level.id ? level.id : '') + ':' + task.id; }
  function currentOrder(level, task, taskAns) {
    var ids = (task.steps || []).map(function (s) { return s.id; });
    if (taskAns && Array.isArray(taskAns.order) && taskAns.order.length === ids.length &&
      ids.every(function (id) { return taskAns.order.indexOf(id) >= 0; })) return taskAns.order.slice();
    return shuffledOrder(ids, orderSeed(level, task), task.answer);
  }
  function slotOption(slot, id) {
    return (slot.options || []).filter(function (o) { return o.id === id; })[0] || null;
  }
  // The assembled note. A template may keep line breaks ("\n"; "\n\n" for a paragraph). The student's own line
  // (taskAns._free) goes where the template says {_free}, else at the end; opts.noFree leaves it out.
  function composeText(task, taskAns, opts) {
    opts = opts || {};
    taskAns = taskAns || {};
    var slots = task.slots || [];
    var tpl = task.template || slots.map(function (s) { return '{' + s.id + '}'; }).join(' ');
    var free = opts.noFree || opts.model || typeof taskAns._free !== 'string' ? '' : taskAns._free.trim();
    var placed = false;
    var text = tpl.replace(/\{([\w-]+)\}/g, function (m, id) {
      if (id === '_free') { placed = true; return free; }
      var slot = slots.filter(function (s) { return s.id === id; })[0];
      if (!slot) return '';
      var opt;
      if (opts.model) opt = (slot.options || []).filter(function (o) { return o.correct; })[0];
      else opt = slotOption(slot, taskAns[id]);
      if (!opt) return opts.blank === undefined ? '[' + (slot.label || '…') + ']' : opts.blank;
      return opt.text;
    });
    if (free && !placed) text += (tpl.indexOf('\n') >= 0 ? '\n\n' : ' ') + free;
    return tidyLines(text);
  }
  function huntFlags(taskAns) { return taskAns && isObj(taskAns.flags) ? taskAns.flags : {}; }
  function huntScore(task, taskAns) {
    var flags = huntFlags(taskAns), answer = task.answer || {};
    var right = 0, wrong = 0, rows = Object.keys(flags);
    rows.forEach(function (rid) {
      var reason = flags[rid];
      if (own(answer, rid) && arr(answer[rid]).indexOf(reason) >= 0) right++; else wrong++;
    });
    var max = Object.keys(answer).length;
    return { right: right, wrong: wrong, max: max, earned: Math.max(0, right - 0.5 * wrong) };
  }

  /* ------------------------------------------------------------------ task and level scoring */
  function scoreTask(task, taskAns, level) {
    var t = task.type, res;
    if (t === 'items') {
      // an item may carry `weight` (default 1, sa-4: the ghost employee the level is about weighs 4), so missing the
      // one find the level turns on costs a star; `right` and `of` stay item counts ("6 of 7 right")
      var items = task.items || [], ans = taskAns || {}, earned = 0, right = 0, per = {}, maxw = 0;
      items.forEach(function (it) {
        var s = scoreItem(task, it, ans[it.id]), iw = itemWeight(it);
        per[it.id] = s; earned += s.score * iw; maxw += iw; if (s.correct) right++;
      });
      res = { earned: earned, max: maxw, right: right, of: items.length, items: per };
    } else if (t === 'worksheet') {
      var cells = inputCells(task), a = taskAns || {}, ok = 0, pc = {}, byKey = {}, fol = {}, nf = 0;
      cells.forEach(function (c) { byKey[c.key] = c; var good = cellCorrect(c.cell, a[c.key]); pc[c.key] = good; if (good) ok++; });
      // method marks: a wrong cell worked right from the student's own wrong figure scores (cells with `follow` only)
      cells.forEach(function (c) { if (cellFollows(c, a, byKey, pc)) { fol[c.key] = true; nf++; } });
      // acc-1 round 1: a cell may carry `weight` (default 1), so a figure the level turns on costs a star when one cell of
      // forty could not; earned and max are weighted, `right` and `of` stay cell counts ("7 of 8 right")
      var ew = 0, mw = 0;
      cells.forEach(function (c) { var w = cellWeight(c.cell); mw += w; if (pc[c.key] || fol[c.key]) ew += w; });
      res = { earned: ew, max: mw, right: ok, of: cells.length, cells: pc, follows: fol, followed: nf };
    } else if (t === 'choice') {
      var qs = task.questions || [], qa = taskAns || {}, e = 0, r = 0, pq = {};
      qs.forEach(function (q) { var s = scoreQuestion(q, qa[q.id]); pq[q.id] = s; e += s; if (s >= 1 - EPS) r++; });
      res = { earned: e, max: qs.length, right: r, of: qs.length, questions: pq };
    } else if (t === 'order') {
      var order = currentOrder(level, task, taskAns), ansOrder = task.answer || [];
      var l = lcsLength(order, ansOrder), n = ansOrder.length || 1;
      var same = order.join('\u0001') === ansOrder.join('\u0001');
      res = { earned: same ? 1 : l / n, max: 1, right: l, of: ansOrder.length, order: order, inOrder: same };
    } else if (t === 'compose') {
      var slots = task.slots || [], ca = taskAns || {}, good2 = 0, ps = {};
      slots.forEach(function (s) { var o = slotOption(s, ca[s.id]); var g = !!(o && o.correct); ps[s.id] = g; if (g) good2++; });
      res = { earned: good2, max: slots.length, right: good2, of: slots.length, slots: ps };
    } else if (t === 'hunt') {
      var h = huntScore(task, taskAns);
      res = { earned: h.earned, max: h.max, right: h.right, of: h.max, wrong: h.wrong };
    } else {
      res = { earned: 0, max: 0, right: 0, of: 0 };
    }
    res.correct = res.max > 0 && res.earned >= res.max - EPS;
    return res;
  }
  function scoreLevel(level, answers) {
    answers = answers || {};
    var num = 0, den = 0, tasks = {};
    (level.tasks || []).forEach(function (task) {
      var r = scoreTask(task, answers[task.id], level);
      var w = isNum(task.weight) ? task.weight : 1;
      tasks[task.id] = r; num += r.earned * w; den += r.max * w;
    });
    return { accuracy: den ? num / den : 0, earned: num, max: den, tasks: tasks };
  }
  function band(acc) {
    if (acc + EPS >= 0.9) return 3;
    if (acc + EPS >= 0.75) return 2;
    if (acc + EPS >= 0.5) return 1;
    return 0;
  }
  function starsFor(acc, hints) {
    var b = band(acc), passed = acc + EPS >= 0.5;
    return { band: b, passed: passed, stars: Math.max(passed ? 1 : 0, b - (hints || 0)) };
  }
  // passNeeds: [{ task, min, note? }] on a level. It passes only when accuracy is at least 50% AND each listed task
  // earns at least `min` of its maximum (sa-1: 0.7 of the bill calls, so the mail and the cut-off sheet, which the
  // hand-in gives away, can never carry a pass on their own). Returns the entries the scored answers fall short of.
  function passNeedsShort(level, scoredLevel) {
    var tasks = (scoredLevel && scoredLevel.tasks) || {};
    return ((level && level.passNeeds) || []).filter(function (p) {
      var r = p && tasks[p.task];
      if (!r || !r.max) return false;
      return r.earned / r.max + EPS < (isNum(p.min) ? p.min : 0);
    });
  }
  // The whole result of an attempt: accuracy, band, passed (the 50% rule and passNeeds), stars after hints.
  function resultFor(level, answers, hints) {
    var sc = scoreLevel(level, answers);
    var b = band(sc.accuracy), short = passNeedsShort(level, sc);
    var ok = sc.accuracy + EPS >= 0.5 && !short.length;
    return { accuracy: sc.accuracy, band: b, passed: ok, stars: ok ? Math.max(1, b - (hints || 0)) : 0,
      short: short.map(function (p) { return p.task; }), scored: sc };
  }
  // Every compose task (a mail, an observation: the text that leaves the desk) scored full marks. `scored` is
  // scoreLevel's result (or anything with { tasks: { id: { earned, max } } }); a compose task it says nothing about
  // counts as not right, so the clean note is never shown on a guess.
  function composeAllRight(level, scored) {
    var tasks = (scored && scored.tasks) || {};
    return ((level && level.tasks) || []).filter(function (t) { return t.type === 'compose'; }).every(function (t) {
      var r = tasks[t.id];
      return !!r && r.max > 0 && r.earned >= r.max - EPS;
    });
  }
  // The senior's closing note for a result: wrapRetry on a fail; on a pass, wrap only at 90% and above with every
  // composed text right (a senior never says "send it" over a wrong line), else wrapPartial when the level has one,
  // else wrap. `scored` (scoreLevel's result) defaults to res.scored or res.tasks. Null when the level has no note.
  function wrapFor(level, res, scored) {
    if (!level || !res) return null;
    var sc = scored || res.scored || (res.tasks ? { tasks: res.tasks } : null);
    var clean = (res.accuracy || 0) + EPS >= 0.9 && composeAllRight(level, sc);
    var w = res.passed ? (level.wrapPartial && !clean ? level.wrapPartial : level.wrap) : level.wrapRetry;
    return w && typeof w.text === 'string' && w.text ? w : null;
  }
  function isBetter(a, b) {
    if (!b) return true;
    if (!a) return false;
    if ((a.stars || 0) !== (b.stars || 0)) return (a.stars || 0) > (b.stars || 0);
    if (Math.abs((a.accuracy || 0) - (b.accuracy || 0)) > EPS) return (a.accuracy || 0) > (b.accuracy || 0);
    return (a.at || 0) >= (b.at || 0);
  }

  /* ------------------------------------------------------------------ counts (from the student's own answers) */
  function findTask(level, id) { return (level.tasks || []).filter(function (t) { return t.id === id; })[0] || null; }
  function findField(task, id) { return (task.fields || []).filter(function (f) { return f.id === id; })[0] || null; }
  function findDoc(level, id) { return (level.documents || []).filter(function (d) { return d.id === id; })[0] || null; }
  // a "true find": some wanted value is both in the key and in the student's answer. `equals` may be one value or
  // several (e.g. ["blocked", "rejected"]); the field may be a choice or a multi (one reason inside the multi).
  function trueFind(expected, given, equals) {
    var want = arr(equals), exp = arr(expected), got = arr(given);
    return want.some(function (w) { return exp.indexOf(w) >= 0 && got.indexOf(w) >= 0; });
  }

  // a pick list is a diagnosis only when every pick on it is right: ticking every reason (or a right one and a wrong
  // one) names nothing, so that item adds nothing to a tally or a withRight count (engine 1.3.0)
  function cleanPicks(expected, given) {
    var exp = arr(expected), got = arr(given);
    return got.length > 0 && got.every(function (g) { return exp.indexOf(g) >= 0; });
  }
  // cleanPicks on one item's field, plus each pick's `needs` (an option may name fields that must also be right on
  // the item for the pick to count as a find: sa-1's cut-off needs the year, since "cut-off" with the year it was
  // booked in says the opposite)
  function cleanFind(task, field, item, itemAns) {
    itemAns = itemAns || {};
    var exp = (item.answer || {})[field.id], got = arr(itemAns[field.id]);
    if (!cleanPicks(exp, got)) return false;
    return got.every(function (g) {
      var o = (field.options || []).filter(function (x) { return x.id === g; })[0];
      return !o || !Array.isArray(o.needs) || o.needs.every(function (fid) {
        var f2 = findField(task, fid);
        return !f2 || scoreField(f2, (item.answer || {})[fid], itemAns[fid]) >= 1 - EPS;
      });
    });
  }
  // withRight on an itemsWhere or sumItems count: the named field must also be right on the item. A pick list (choice
  // or multi) must be a clean find, as above; a number field must match the key within its tolerance (dt-3: the amount
  // in dispute), so a count of rupees disputed sums only the items whose amount the student got right
  function rightOn(task, field, item, itemAns) {
    if (field.kind === 'number') {
      var exp = (item.answer || {})[field.id];
      return exp !== undefined && exp !== null && scoreField(field, exp, (itemAns || {})[field.id]) >= 1 - EPS;
    }
    return cleanFind(task, field, item, itemAns);
  }
  // withRight may also name several fields, all of which must be right on the item (dt-4: an adjustment counts only
  // with the right reason and the right amount, `["why", "amt"]`); one id behaves exactly as before. An id that is not
  // a field of the task: on itemsWhere the item's picks under that key must be clean (as before), on sumItems the item
  // is left out (as before)
  function allRightOn(task, withRight, item, itemAns, looseUnknown) {
    if (!withRight) return true;
    return [].concat(withRight).every(function (fid) {
      var wf = findField(task, fid);
      if (wf) return rightOn(task, wf, item, itemAns);
      return looseUnknown ? cleanPicks((item.answer || {})[fid], (itemAns || {})[fid]) : false;
    });
  }
  function tallyValue(task, fieldId, taskAns) {
    var field = findField(task, fieldId);
    if (!field) return null;
    var counts = {}, order = (field.options || []).map(function (o) { return o.id; });
    (task.items || []).forEach(function (it) {
      var ia = (taskAns || {})[it.id] || {};
      var s = scoreItem(task, it, ia);
      if (!s.gateOk) return;
      var exp = arr((it.answer || {})[fieldId]), got = arr(ia[fieldId]);
      if (!cleanFind(task, field, it, ia)) return;          // a wrong pick on the item (or a pick's needs unmet): not a find
      var seen = {};
      got.forEach(function (g) { if (exp.indexOf(g) >= 0 && !seen[g]) { seen[g] = 1; counts[g] = (counts[g] || 0) + 1; } });
    });
    var ids = Object.keys(counts);
    if (!ids.length) return null;
    ids.sort(function (a, b) { return counts[b] - counts[a] || order.indexOf(a) - order.indexOf(b); });
    return ids.map(function (id) {
      var o = (field.options || []).filter(function (x) { return x.id === id; })[0] || {};
      return counts[id] + ' ' + (o.short || o.label || id);
    }).join(', ');
  }

  function countValue(level, spec, answers) {
    if (!spec) return null;
    answers = answers || {};
    if (spec.kind === 'const') return spec.value === undefined ? null : spec.value;
    if (spec.kind === 'rows') {
      var doc = findDoc(level, spec.doc);
      if (!doc) return null;
      return (doc.rows || []).filter(function (r) { return !r._class || r._class === 'data'; }).length;
    }
    var task = findTask(level, spec.task);
    if (!task) return null;
    var ta = answers[task.id];
    switch (spec.kind) {
      case 'items':
      case 'answeredItems':
        // answered: 'gate' counts the items the student made the main call on (e.g. Fine or Exception on a bill);
        // by default an item counts only when every visible question on it is answered
        var gateF = spec.answered === 'gate' ? (task.fields || []).filter(function (f) { return f.gate; })[0] || null : null;
        return (task.items || []).filter(function (it) {
          var ia = (ta || {})[it.id];
          return gateF ? fieldAnswered(gateF, (ia || {})[gateF.id]) : itemAnswered(task, it, ia);
        }).length;
      case 'correctItems':
        return (task.items || []).filter(function (it) { return scoreItem(task, it, (ta || {})[it.id]).correct; }).length;
      case 'itemsWhere':
        // withRight: a field (e.g. the reasons) whose picks must all be right (at least one picked, none wrong), so a
        // bill flagged for the wrong reason, or for every reason, is not counted as a find; found then equals the sum
        // of a tally on the same field when each item's key has one value in that field (an item with two reasons
        // counts once here and twice in the tally; the validator warns)
        return (task.items || []).filter(function (it) {
          var ia = (ta || {})[it.id] || {};
          if (!trueFind((it.answer || {})[spec.field], ia[spec.field], spec.equals)) return false;
          return allRightOn(task, spec.withRight, it, ia, true);
        }).length;
      case 'sumItems':
        // withRight (optional): the item adds its amount only when that field is right on it too (dt-3: a disputed
        // amount counts only with the student's own right figure for it)
        var total = 0, any = false;
        (task.items || []).forEach(function (it) {
          var ia = (ta || {})[it.id] || {};
          var take = spec.where ? trueFind((it.answer || {})[spec.where.field], ia[spec.where.field], spec.where.equals)
            : itemAnswered(task, it, ia);
          if (take && spec.withRight) take = allRightOn(task, spec.withRight, it, ia, false);
          if (take && isNum(it[spec.prop || 'amount'])) { total += it[spec.prop || 'amount']; any = true; }
        });
        return any ? Math.round(total * 100) / 100 : 0;
      case 'tally':
        return tallyValue(task, spec.field, ta);
      case 'cell':
        var cells = inputCells(task).filter(function (c) { return c.row.id === spec.row && c.col.key === spec.col; });
        if (!cells.length) return null;
        var given = (ta || {})[cells[0].key];
        if (!cellCorrect(cells[0].cell, given)) return null;
        // con-1 round 1 (designer M1, facts M2): `withRight: ["r1.amt", …]` names input cells of the task that must each
        // be right on the key too (a method mark is not enough), so a total that can be copied from the rows printed
        // above and below it names nothing unless every figure it adds up is the student's own and right
        if (spec.withRight !== undefined) {
          var wk = {}; inputCells(task).forEach(function (c) { wk[c.key] = c; });
          if (!arr(spec.withRight).every(function (k) { return wk[k] && cellCorrect(wk[k].cell, (ta || {})[k]); })) return null;
        }
        // con-1: `abs: true` takes the size of a signed figure (a fall typed as −2,693.40 reads as a fall of 2,693.40)
        // and `scale` multiplies it before the format (100000 prints a figure kept in ₹ lakh with a rupee format:
        // ₹2,693.40 lakh as "₹26.9 crore" with crore1). Without them the figure is the student's own, as before.
        var cv = parseNumber(given);
        if (cv !== null && spec.abs === true) cv = Math.abs(cv);
        if (cv !== null && isNum(spec.scale)) cv = cv * spec.scale;
        return cv;
      case 'correctCells':
        // rows: an optional list of row ids to count (absent = every input cell), so a clause names one part of a sheet
        // only when the student got that part's own cells right (sa-4: the PF rows and the ESI rows of one recompute)
        return inputCells(task).filter(function (c) {
          return (!spec.rows || spec.rows.indexOf(c.row.id) >= 0) && cellCorrect(c.cell, (ta || {})[c.key]);
        }).length;
      case 'correctQuestions':
        // questions: an optional list of question ids to count (absent = every question), so a clause can name a point
        // only when the student got that point's own questions right (sa-3: records, verification, title)
        return (task.questions || []).filter(function (q) {
          return (!spec.questions || spec.questions.indexOf(q.id) >= 0) && scoreQuestion(q, (ta || {})[q.id]) >= 1 - EPS;
        }).length;
      case 'correctSlots':
        // slots: an optional list of slot ids to count (absent = every slot), so a clause names one part of a note only
        // when the student picked that part's own right line (xl-1: "drew a supplier insight" on the finding line)
        return (task.slots || []).filter(function (s) {
          if (spec.slots && spec.slots.indexOf(s.id) < 0) return false;
          var o = slotOption(s, (ta || {})[s.id]); return o && o.correct;
        }).length;
      case 'huntHits':
        var flags = huntFlags(ta), answer = task.answer || {}, hits = 0;
        Object.keys(flags).forEach(function (rid) {
          var reason = flags[rid];
          if (spec.reason && reason !== spec.reason) return;
          if (own(answer, rid) && arr(answer[rid]).indexOf(reason) >= 0) hits++;
        });
        return hits;
      case 'flagged':
        return Object.keys(huntFlags(ta)).length;
      default:
        return null;
    }
  }
  function computeCounts(level, answers) {
    var specs = (level.earned && level.earned.counts) || {}, out = {};
    Object.keys(specs).forEach(function (k) { out[k] = countValue(level, specs[k], answers); });
    return out;
  }
  function countFormats(level) {
    var specs = (level.earned && level.earned.counts) || {}, out = {};
    Object.keys(specs).forEach(function (k) { if (specs[k] && specs[k].format) out[k] = specs[k].format; });
    return out;
  }

  /* ------------------------------------------------------------------ templates */
  function missing(v) { return v === null || v === undefined || v === '' || v === false || (isNum(v) && v === 0); }
  // {name} inserts a value; {name|singular|plural} picks a word; [[ … ]] is dropped when any value inside is
  // null or zero. Returns null when a value outside an optional segment is null (the caller uses a fallback). A plain
  // {name} that is the number 0 counts as null too: a line never reads "Vouched 0 bills" (outlines use the soft word).
  function renderTemplate(tpl, values, formats, opts) {
    if (typeof tpl !== 'string') return null;
    values = values || {}; formats = formats || {}; opts = opts || {};
    var failed = false;
    var s = tpl.replace(/\[\[([\s\S]*?)\]\]/g, function (m, inner) {
      var names = []; inner.replace(/\{([\w-]+)(?:\|[^}]*)?\}/g, function (mm, n) { names.push(n); return mm; });
      return names.some(function (n) { return missing(values[n]); }) ? '' : inner;
    });
    s = s.replace(/\{([\w-]+)((?:\|[^|}]*){0,2})\}/g, function (m, name, rest) {
      var v = values[name];
      if (rest) {
        var forms = rest.split('|').slice(1);
        if (v === null || v === undefined) { failed = true; return ''; }
        var one = isNum(v) ? Math.abs(v) === 1 : false;
        return one ? forms[0] : (forms[1] === undefined ? forms[0] : forms[1]);
      }
      if (v === null || v === undefined || v === '' || (isNum(v) && v === 0)) {
        if (opts.say && opts.say[name]) return opts.say[name];
        if (opts.soft) return opts.soft;
        failed = true; return '';
      }
      return formatValue(v, formats[name]);
    });
    if (failed) return null;
    return tidy(s);
  }
  function renderClause(level, values) {
    var e = level.earned || {};
    var formats = countFormats(level);
    var c = renderTemplate(e.clause, values, formats);
    if (c === null && typeof e.fallback === 'string') c = renderTemplate(e.fallback, values, formats);
    return c === null ? null : stripEnd(c);
  }
  function buildLine(cvName, month, clause) {
    return cvName + ', MSC Articleship Program | ' + month + ': ' + capFirst(stripEnd(clause));
  }
  // entries: [{ clause, month, at }] (the picks, in the order they should read)
  function buildDomainLine(cvName, entries) {
    entries = (entries || []).filter(function (e) { return e && e.clause; });
    if (!entries.length) return null;
    var latest = entries.reduce(function (a, b) { return (b.at || 0) > (a.at || 0) ? b : a; });
    var clauses = entries.map(function (e, i) { return i === 0 ? capFirst(stripEnd(e.clause)) : stripEnd(e.clause); });
    return cvName + ', MSC Articleship Program | ' + latest.month + ': ' + clauses.join('; ');
  }
  function linePrefix(cvName) { return cvName + ', MSC Articleship Program'; }
  function outlineLines(level, qIndex, values) {
    var q = (level.interview || [])[qIndex];
    if (!q) return [];
    var specs = (level.earned && level.earned.counts) || {}, say = {};
    Object.keys(specs).forEach(function (k) { if (specs[k] && specs[k].say) say[k] = specs[k].say; });
    return (q.outline || []).map(function (line) {
      var r = renderTemplate(line, values || {}, countFormats(level), { say: say, soft: 'some' });
      return r === null ? line.replace(/\{[^}]*\}/g, '').replace(/\[\[|\]\]/g, '') : r;
    });
  }
  function wordCount(s) { return String(s || '').trim().split(/\s+/).filter(Boolean).length; }

  /* ------------------------------------------------------------------ progress and the submit check */
  function taskProgress(level, task, taskAns) {
    var t = task.type, a = taskAns || {};
    if (t === 'items') {
      var items = task.items || [];
      return { done: items.filter(function (it) { return itemAnswered(task, it, a[it.id]); }).length, total: items.length };
    }
    if (t === 'worksheet') {
      var cells = inputCells(task);
      return { done: cells.filter(function (c) { return cellFigure(c, a[c.key]) !== null; }).length, total: cells.length };
    }
    if (t === 'choice') {
      var qs = task.questions || [];
      return { done: qs.filter(function (q) { return !isEmpty(a[q.id]); }).length, total: qs.length };
    }
    if (t === 'order') return { done: a.touched ? 1 : 0, total: 1 };
    if (t === 'compose') {
      var slots = task.slots || [];
      return { done: slots.filter(function (s) { return !!slotOption(s, a[s.id]); }).length, total: slots.length };
    }
    if (t === 'hunt') { var n = Object.keys(huntFlags(a)).length; return { done: n, total: null }; }
    return { done: 0, total: 0 };
  }
  var NOUNS = { items: ['item', 'items'], worksheet: ['cell', 'cells'], choice: ['question', 'questions'],
    compose: ['part', 'parts'], order: ['step', 'steps'], hunt: ['row', 'rows'] };
  function nounFor(task) {
    var n = task.noun;
    if (Array.isArray(n) && n.length) return [n[0], n[1] || n[0] + 's'];
    if (typeof n === 'string') return [n, n + 's'];
    return NOUNS[task.type] || ['item', 'items'];
  }
  function unanswered(level, answers) {
    answers = answers || {};
    var out = [];
    (level.tasks || []).forEach(function (task, i) {
      var p = taskProgress(level, task, answers[task.id]);
      var miss = task.type === 'hunt' ? (p.done ? 0 : 1) : (p.total - p.done);
      if (miss > 0) out.push({ index: i, task: task, missing: miss, noun: nounFor(task), type: task.type });
    });
    return out;
  }

  /* ------------------------------------------------------------------ state */
  function emptyState() { return { v: 1, updatedAt: 0, levels: {}, cv: {} }; }
  function normalizeState(raw) {
    var s = emptyState();
    if (!isObj(raw)) return s;
    if (isNum(raw.updatedAt)) s.updatedAt = raw.updatedAt;
    if (isObj(raw.levels)) {
      Object.keys(raw.levels).forEach(function (id) {
        var l = raw.levels[id];
        if (!isObj(l)) return;
        var o = { updatedAt: isNum(l.updatedAt) ? l.updatedAt : 0 };
        if (isObj(l.attempt)) {
          o.attempt = l.attempt;
          if (!isObj(o.attempt.answers)) o.attempt.answers = {};
          if (!isObj(o.attempt.hints)) o.attempt.hints = {};
          if (!isNum(o.attempt.n)) o.attempt.n = 1;
          if (o.attempt.locked !== undefined && !isObj(o.attempt.locked)) delete o.attempt.locked;
        }
        if (isObj(l.best)) o.best = l.best;
        o.attempts = isNum(l.attempts) ? l.attempts : 0;
        s.levels[id] = o;
      });
    }
    if (isObj(raw.cv)) {
      Object.keys(raw.cv).forEach(function (d) {
        var c = raw.cv[d];
        if (!isObj(c)) return;
        var o = { picks: Array.isArray(c.picks) ? c.picks.filter(function (x) { return typeof x === 'string'; }).slice(0, 2) : [],
          updatedAt: isNum(c.updatedAt) ? c.updatedAt : (isNum(c.addedAt) ? c.addedAt : 0) };
        if (typeof c.addedLine === 'string') o.addedLine = c.addedLine;
        if (isNum(c.addedAt)) o.addedAt = c.addedAt;
        if (c.chosen) o.chosen = true;
        s.cv[d] = o;
      });
    }
    if (typeof raw.sampleName === 'string') s.sampleName = raw.sampleName.slice(0, 80);
    return s;
  }
  function mergeStates(a, b) {
    a = normalizeState(a); b = normalizeState(b);
    var out = emptyState();
    out.updatedAt = Math.max(a.updatedAt, b.updatedAt);
    var ids = {};
    Object.keys(a.levels).concat(Object.keys(b.levels)).forEach(function (id) { ids[id] = 1; });
    Object.keys(ids).forEach(function (id) {
      var la = a.levels[id], lb = b.levels[id];
      if (!la) { out.levels[id] = lb; return; }
      if (!lb) { out.levels[id] = la; return; }
      var w = lb.updatedAt > la.updatedAt ? lb : la.updatedAt > lb.updatedAt ? la : (lb.attempts || 0) > (la.attempts || 0) ? lb : la;
      var o = w === la ? lb : la;
      // consistency pass round 2 (I2-01): the newer entry wins, but never drops the better best of the two copies, so
      // an attempt only started on one device never wipes a pass (its line and its work sample) held by the other
      w = clone(w);
      // only a strictly better best moves across (stars, then accuracy, then later), so an equal one never swaps
      if (o.best && (!w.best || (isBetter(o.best, w.best) && !isBetter(w.best, o.best)))) {
        w.best = clone(o.best);
        if (!w.best.answers && o.attempt && o.attempt.n === o.best.n) {
          w.best.answers = clone(o.attempt.answers); w.best.hintsByTask = clone(o.attempt.hints);
        }
        if (w.attempt && w.attempt.n <= w.best.n) w.attempt.n = w.best.n + 1;
      }
      w.attempts = Math.max(w.attempts || 0, o.attempts || 0);
      out.levels[id] = w;
    });
    var ds = {};
    Object.keys(a.cv).concat(Object.keys(b.cv)).forEach(function (d) { ds[d] = 1; });
    Object.keys(ds).forEach(function (d) {
      var ca = a.cv[d], cb = b.cv[d];
      out.cv[d] = !ca ? cb : !cb ? ca : (cb.updatedAt > ca.updatedAt ? cb : ca);
    });
    var newer = b.updatedAt > a.updatedAt ? b : a;
    var other = newer === a ? b : a;
    if (newer.sampleName !== undefined) out.sampleName = newer.sampleName;
    else if (other.sampleName !== undefined) out.sampleName = other.sampleName;
    return clone(out);
  }
  function levelState(state, id) { return (state && state.levels && state.levels[id]) || null; }
  function touch(state, ls, now) { ls.updatedAt = now; state.updatedAt = now; }
  function withLevel(state, id, now, fn) {
    var s = normalizeState(clone(state));
    var ls = s.levels[id] || { updatedAt: 0, attempts: 0 };
    s.levels[id] = ls;
    fn(ls, s);
    touch(s, ls, isNum(now) ? now : Date.now());
    return s;
  }
  function startAttempt(state, id, now) {
    now = isNum(now) ? now : Date.now();
    return withLevel(state, id, now, function (ls) {
      var a = ls.attempt;
      if (a && !a.submittedAt) return;                         // already in progress: keep it
      if (a && ls.best && ls.best.n === a.n && !ls.best.answers) {
        ls.best.answers = a.answers; ls.best.hintsByTask = a.hints;
      }
      var n = Math.max(a ? a.n : 0, ls.best ? ls.best.n || 0 : 0) + 1;
      ls.attempt = { n: n, answers: {}, hints: {}, startedAt: now, task: 0 };
    });
  }
  // A task with `lockOnLeave` is handed in when the student moves on to a later task: from then on its answers are
  // read-only for the rest of the attempt (attempt.locked[taskId] = time). A new attempt starts with no locks.
  function isLocked(attempt, taskId) { return !!(attempt && isObj(attempt.locked) && attempt.locked[taskId]); }
  function lockTask(state, id, taskId, now) {
    now = isNum(now) ? now : Date.now();
    return withLevel(state, id, now, function (ls) {
      if (!ls.attempt || ls.attempt.submittedAt) return;
      if (!isObj(ls.attempt.locked)) ls.attempt.locked = {};
      if (!ls.attempt.locked[taskId]) ls.attempt.locked[taskId] = now;
    });
  }
  // the index of the first task before `index` that must be handed in first (lockOnLeave, not yet locked), or -1
  function handInBefore(level, attempt, index) {
    var tasks = (level && level.tasks) || [];
    for (var i = 0; i < Math.min(index, tasks.length); i++) {
      if (tasks[i] && tasks[i].lockOnLeave && !isLocked(attempt, tasks[i].id)) return i;
    }
    return -1;
  }
  function updateAnswers(state, id, taskId, fn, now) {
    return withLevel(state, id, now, function (ls) {
      if (!ls.attempt || ls.attempt.submittedAt) return;
      if (isLocked(ls.attempt, taskId)) return;
      var cur = ls.attempt.answers[taskId];
      var next = fn(cur === undefined ? undefined : clone(cur));
      if (next === undefined) delete ls.attempt.answers[taskId]; else ls.attempt.answers[taskId] = next;
    });
  }
  function setItemField(state, id, taskId, itemId, fieldId, value, now) {
    return updateAnswers(state, id, taskId, function (cur) {
      cur = isObj(cur) ? cur : {};
      var it = isObj(cur[itemId]) ? cur[itemId] : {};
      if (isEmpty(value)) delete it[fieldId]; else it[fieldId] = value;
      if (Object.keys(it).length) cur[itemId] = it; else delete cur[itemId];
      return Object.keys(cur).length ? cur : undefined;
    }, now);
  }
  function setTaskKey(state, id, taskId, key, value, now) {
    return updateAnswers(state, id, taskId, function (cur) {
      cur = isObj(cur) ? cur : {};
      if (isEmpty(value)) delete cur[key]; else cur[key] = value;
      return Object.keys(cur).length ? cur : undefined;
    }, now);
  }
  function setCurrentTask(state, id, index, now) {
    return withLevel(state, id, now, function (ls) { if (ls.attempt && !ls.attempt.submittedAt) ls.attempt.task = index; });
  }
  function hintsUsed(attempt) {
    if (!attempt || !isObj(attempt.hints)) return 0;
    return Object.keys(attempt.hints).reduce(function (s, k) { return s + (isNum(attempt.hints[k]) ? attempt.hints[k] : 0); }, 0);
  }
  function useHint(state, level, taskId, now) {
    var task = findTask(level, taskId);
    var max = task && Array.isArray(task.hints) ? task.hints.length : 0;
    return withLevel(state, level.id, now, function (ls) {
      if (!ls.attempt || ls.attempt.submittedAt) return;
      if (isLocked(ls.attempt, taskId)) return;
      var cur = ls.attempt.hints[taskId] || 0;
      if (cur < max) ls.attempt.hints[taskId] = cur + 1;
    });
  }
  function round4(x) { return Math.round(x * 10000) / 10000; }
  // a stored accuracy is floored, never rounded up: 0.89996 kept as 0.9 would show "90% right", pick the clean closing
  // note and count a band beside the two stars it earned (the bands sit on 4-place values, so flooring keeps each band)
  function floor4(x) { return Math.floor(x * 10000 + EPS) / 10000; }
  function submitAttempt(state, level, now) {
    now = isNum(now) ? now : Date.now();
    return withLevel(state, level.id, now, function (ls) {
      var a = ls.attempt;
      if (!a || a.submittedAt) return;
      var h = hintsUsed(a);
      var st = resultFor(level, a.answers, h), res = st.scored;
      var counts = st.passed ? computeCounts(level, a.answers) : null;
      var clause = st.passed ? renderClause(level, counts) : null;
      var tasks = {};
      Object.keys(res.tasks).forEach(function (k) {
        var r = res.tasks[k];
        tasks[k] = { earned: round4(r.earned), max: r.max, right: r.right, of: r.of };
        if (r.wrong !== undefined) tasks[k].wrong = r.wrong;
      });
      a.submittedAt = now;
      a.result = { accuracy: floor4(res.accuracy), stars: st.stars, passed: st.passed, hints: h, tasks: tasks };
      if (st.short.length) a.result.short = st.short;
      ls.attempts = (ls.attempts || 0) + 1;
      var cand = { n: a.n, accuracy: floor4(res.accuracy), stars: st.stars, passed: st.passed, hints: h, at: now,
        counts: counts, clause: clause, month: st.passed ? monthLabel(now) : null };
      if (isBetter(cand, ls.best)) ls.best = cand;
    });
  }
  function bestAnswers(ls) {
    if (!ls || !ls.best) return null;
    if (ls.best.answers) return ls.best.answers;
    return ls.attempt && ls.attempt.n === ls.best.n ? ls.attempt.answers : null;
  }
  function bestHints(ls) {
    if (!ls || !ls.best) return {};
    if (ls.best.hintsByTask) return ls.best.hintsByTask;
    return ls.attempt && ls.attempt.n === ls.best.n ? ls.attempt.hints || {} : {};
  }
  function passed(ls) { return !!(ls && ls.best && ls.best.passed); }
  function inProgress(ls) {
    return !!(ls && ls.attempt && !ls.attempt.submittedAt && Object.keys(ls.attempt.answers || {}).length);
  }

  /* ------------------------------------------------------------------ catalogue helpers */
  function domainById(cat, id) { return ((cat && cat.domains) || []).filter(function (d) { return d.id === id; })[0] || null; }
  function levelMeta(cat, id) { return ((cat && cat.levels) || []).filter(function (l) { return l.id === id; })[0] || null; }
  function levelDisplay(domain, meta) {
    var short = domain ? (domain.short || domain.name) : '';
    return (short ? short + ' ' : '') + meta.number + ' · ' + meta.title;
  }
  function visibleLevels(cat, preview) {
    return ((cat && cat.levels) || []).filter(function (l) { return preview || l.published; })
      .slice().sort(function (a, b) { return a.order - b.order; });
  }
  function domainLevels(cat, domainId, preview) {
    return visibleLevels(cat, preview).filter(function (l) { return l.domain === domainId; })
      .sort(function (a, b) { return a.number - b.number; });
  }
  function nextLevel(cat, state, myDomain, preview) {
    var list = visibleLevels(cat, preview).filter(function (l) { return !passed(levelState(state, l.id)); });
    if (!list.length) return null;
    if (myDomain) {
      var mine = list.filter(function (l) { return l.domain === myDomain; });
      if (mine.length) return mine[0];
    }
    return list[0];
  }
  function continueLevel(cat, state, preview) {
    var vis = {}; visibleLevels(cat, preview).forEach(function (l) { vis[l.id] = l; });
    var best = null, bestT = -1;
    Object.keys((state && state.levels) || {}).forEach(function (id) {
      var ls = state.levels[id];
      if (vis[id] && inProgress(ls) && ls.updatedAt > bestT) { best = vis[id]; bestT = ls.updatedAt; }
    });
    return best;
  }
  function domainProgress(cat, state, domainId, preview) {
    var lv = domainLevels(cat, domainId, preview), done = 0, stars = 0;
    lv.forEach(function (l) {
      var ls = levelState(state, l.id);
      if (passed(ls)) done++;
      if (ls && ls.best) stars += ls.best.stars || 0;
    });
    return { done: done, total: lv.length, stars: stars, maxStars: lv.length * 3, closed: lv.length > 0 && done === lv.length };
  }
  // passed levels of a domain, most recently passed first, with what the CV screen needs
  function passedInDomain(cat, state, domainId, preview) {
    return domainLevels(cat, domainId, preview).map(function (l) {
      var ls = levelState(state, l.id);
      return ls && ls.best && ls.best.passed && ls.best.clause ? { id: l.id, meta: l, best: ls.best } : null;
    }).filter(Boolean).sort(function (a, b) { return (b.best.at || 0) - (a.best.at || 0); });
  }
  function cvPicks(cat, state, domainId, preview) {
    var list = passedInDomain(cat, state, domainId, preview);
    var entry = state && state.cv && state.cv[domainId];
    var ids = list.map(function (x) { return x.id; });
    var picks = entry && entry.chosen ? (entry.picks || []).filter(function (id) { return ids.indexOf(id) >= 0; }) : [];
    // consistency pass round 1 (FM07): with no pick of the student's own, the line is the most recently passed level
    // alone (two joined clauses ran to 53–71 words); the student may add a second level in My CV lines
    if (!picks.length) picks = ids.slice(0, 1);
    return picks.slice(0, 2);
  }
  function domainLine(cat, state, domainId, preview) {
    var d = domainById(cat, domainId);
    if (!d) return null;
    var list = passedInDomain(cat, state, domainId, preview);
    var picks = cvPicks(cat, state, domainId, preview);
    // the picks read in level order (as the work happens in the domain)
    var entries = list.filter(function (x) { return picks.indexOf(x.id) >= 0; })
      .sort(function (a, b) { return a.meta.number - b.meta.number; })
      .map(function (x) { return { clause: x.best.clause, month: x.best.month, at: x.best.at }; });
    return buildDomainLine(d.cvName, entries);
  }

  return {
    VERSION: '1.4.0', STAGES: STAGES, MONTHS: MONTHS,
    // formatting
    groupIndian: groupIndian, formatNumber: formatNumber, formatInt: formatInt, formatINR: formatINR,
    formatLakh: formatLakh, formatCrore: formatCrore, trueFind: trueFind, formatPct: formatPct, formatValue: formatValue,
    formatSigned: formatSigned, cellSigned: cellSigned, formatCell: formatCell, pctShown: pctShown,
    parseNumber: parseNumber, monthLabel: monthLabel, amountInWords: amountInWords, wordsMatch: wordsMatch,
    capFirst: capFirst, tidy: tidy, tidyLines: tidyLines, wordCount: wordCount, tidyNumberText: tidyNumberText,
    toggleSign: toggleSign, isNegativeText: isNegativeText,
    // order
    hashString: hashString, rng: rng, lcsLength: lcsLength, lcsMembers: lcsMembers, shuffledOrder: shuffledOrder, orderSeed: orderSeed,
    currentOrder: currentOrder,
    // fields and scoring
    isEmpty: isEmpty, fieldVisible: fieldVisible, fieldAnswered: fieldAnswered, fieldApplicable: fieldApplicable,
    numberInvalid: numberInvalid, stripUnit: stripUnit, readTyped: readTyped,
    scoreField: scoreField, jaccard: jaccard, scoreItem: scoreItem, itemAnswered: itemAnswered, itemReview: itemReview, inputCells: inputCells,
    cellCorrect: cellCorrect, cellFigure: cellFigure, followRefs: followRefs, evalFollow: evalFollow, followValue: followValue, cellFollows: cellFollows, rightIds: rightIds, scoreQuestion: scoreQuestion, slotOption: slotOption,
    composeText: composeText, huntFlags: huntFlags, huntScore: huntScore, scoreTask: scoreTask, scoreLevel: scoreLevel,
    band: band, starsFor: starsFor, isBetter: isBetter, passNeedsShort: passNeedsShort, resultFor: resultFor, wrapFor: wrapFor,
    composeAllRight: composeAllRight, fieldWeight: fieldWeight, itemWeight: itemWeight, cellWeight: cellWeight, cleanPicks: cleanPicks, cleanFind: cleanFind,
    // counts and lines
    findTask: findTask, findField: findField, findDoc: findDoc, countValue: countValue, computeCounts: computeCounts,
    countFormats: countFormats, renderTemplate: renderTemplate, renderClause: renderClause, buildLine: buildLine,
    buildDomainLine: buildDomainLine, linePrefix: linePrefix, outlineLines: outlineLines,
    // progress
    taskProgress: taskProgress, unanswered: unanswered, nounFor: nounFor,
    // state
    emptyState: emptyState, normalizeState: normalizeState, mergeStates: mergeStates, levelState: levelState,
    startAttempt: startAttempt, updateAnswers: updateAnswers, setItemField: setItemField, setTaskKey: setTaskKey,
    setCurrentTask: setCurrentTask, useHint: useHint, isLocked: isLocked, lockTask: lockTask, handInBefore: handInBefore, hintsUsed: hintsUsed, submitAttempt: submitAttempt,
    bestAnswers: bestAnswers, bestHints: bestHints, passed: passed, inProgress: inProgress,
    // catalogue
    domainById: domainById, levelMeta: levelMeta, levelDisplay: levelDisplay, visibleLevels: visibleLevels,
    domainLevels: domainLevels, nextLevel: nextLevel, continueLevel: continueLevel, domainProgress: domainProgress,
    passedInDomain: passedInDomain, cvPicks: cvPicks, domainLine: domainLine
  };
});
