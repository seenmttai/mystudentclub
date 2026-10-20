/* MSC Articleship Program · Written test practice: the logic, with no DOM.
 * Marking, scoring, the wall-clock timer, saved state (and its migration), review data, paper validation, and a
 * session controller over an injected store and clock, so every rule can be tested in Node.
 * UMD: window.WrittenTestCore in the browser, require() in Node.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WrittenTestCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STATE_VERSION = 1;
  var KEY_PREFIX = 'msc.articleship.writtenTest';
  var TOOL = 'written-test';
  var SCORED = ['single', 'numeric', 'text', 'dictation'];
  var SELF_CHECKED = ['speak', 'write'];
  var TYPES = SCORED.concat(SELF_CHECKED);
  var HISTORY_MAX = 30;
  var MAX_PLAYS = 2;
  var FILTERS = ['all', 'wrong', 'blank', 'flagged'];

  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  // ---------------------------------------------------------------- text and numbers
  var QUOTES = { '‘': "'", '’': "'", '‚': "'", '‛': "'", '′': "'",
    '“': '"', '”': '"', '„': '"', '″': '"' };

  /* How typed answers are marked: trimmed, case folded, spaces collapsed, curly and straight quotes alike,
   * a final full stop ignored. */
  function normText(s) {
    var t = String(s == null ? '' : s);
    if (t.normalize) t = t.normalize('NFKC');
    t = t.replace(/[‘’‚‛′“”„″]/g, function (c) { return QUOTES[c]; });
    t = t.replace(/\s+/g, ' ').trim().toLowerCase();
    if (t.charAt(t.length - 1) === '.') t = t.slice(0, -1).replace(/\s+$/, '');
    return t;
  }

  /* Dictation: the same normalising, then words without the punctuation around them. */
  function dictationWords(s) {
    return normText(s).split(' ').map(function (w) {
      return w.replace(/^[^\w'₹%-]+|[^\w'₹%-]+$/g, '');
    }).filter(Boolean);
  }

  /* Typed numbers: ₹, Rs, commas, spaces, % and a trailing unit ignored; 3/8 is a fraction; else null. */
  function parseNumber(s) {
    if (isNum(s)) return s;
    var t = String(s == null ? '' : s).trim().replace(/[−–]/g, '-');
    t = t.replace(/₹|\brs\.?|\binr\b/gi, '');
    t = t.replace(/(\d),(?=\d)/g, '$1').trim();
    t = t.replace(/(\D)\s+/g, '$1').replace(/\s+(\D)/g, '$1');
    if (!t) return null;
    var m = /^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(t);
    if (m) return Number(m[2]) ? Number(m[1]) / Number(m[2]) : null;
    m = /^(-?(?:\d+\.?\d*|\.\d+))([a-z%/.]*)$/i.exec(t);
    return m ? Number(m[1]) : null;
  }

  /* 125000 -> "1,25,000" (Indian grouping), decimals kept up to two places. */
  function formatIndian(v) {
    if (!isNum(v)) return String(v);
    var neg = v < 0;
    var parts = (Math.round(Math.abs(v) * 100) / 100).toString().split('.');
    var whole = parts[0];
    if (whole.length > 3) whole = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + whole.slice(-3);
    return (neg ? '−' : '') + whole + (parts[1] ? '.' + parts[1] : '');
  }

  /* A numeric answer the way a student reads it: ₹48,450 · 20% · 12 km/h. */
  function formatAmount(value, unit) {
    var n = formatIndian(value);
    if (!unit) return n;
    if (unit === '₹') return '₹' + n;
    if (unit === '%') return n + '%';
    if (/^₹\s/.test(unit)) return '₹' + n + unit.slice(1);
    return n + ' ' + unit;
  }

  function signed(v) {
    if (v > 0) return '+' + v;
    if (v < 0) return '−' + Math.abs(v);
    return '0';
  }

  /* {short: "+3 / −2 / 0", words: "Right +3 · Wrong −2 · Blank 0", negative: true} */
  function describeMarking(m) {
    m = m || { correct: 1, wrong: 0, blank: 0 };
    return {
      short: signed(m.correct) + ' / ' + signed(m.wrong) + ' / ' + signed(m.blank),
      words: 'Right ' + signed(m.correct) + ' · Wrong ' + signed(m.wrong) + ' · Blank ' + signed(m.blank),
      negative: m.wrong < 0
    };
  }

  /* "19:59", "1:29:59"; never negative. */
  function formatClock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    var pad = function (x) { return (x < 10 ? '0' : '') + x; };
    return h ? h + ':' + pad(m) + ':' + pad(sec) : m + ':' + pad(sec);
  }

  /* "17 min 42 s" for time used. */
  function formatDuration(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    if (h) return h + ' h ' + m + ' min';
    if (m) return m + ' min' + (sec ? ' ' + sec + ' s' : '');
    return sec + ' s';
  }

  function wordCount(s) {
    var t = String(s || '').trim();
    return t ? t.split(/\s+/).length : 0;
  }

  /* Number–unit pairs that must never break across lines: a range (2025–26, 10–15 minutes), a number and its unit
   * (₹7.2 lakh, 8 m, 48 km/h, 5 hours, 31 March, 4 pm), a ratio (7 : 5, 2 : 3 : 4) and a pair such as (4, 6) or
   * (−2, 3.5), with a plain space or U+00A0 between. A longer list such as (7, 14, 28, 56) may still wrap. The PDF
   * builder uses the same pattern; a test checks the two agree. Only features JavaScript and Python share: no
   * lookbehind, ASCII digits. */
  var KEEP_UNITS = 'lakh|crore|km\\/h|km|kg|m|h|days?|hours?|minutes?|min|seconds?|s|weeks?|months?|years?|litres?|' +
    'am|pm|January|February|March|April|May|June|July|August|September|October|November|December';
  var KEEP_NUM = '[0-9]+(?:[.,][0-9]+)*';
  var KEEP_SOURCE = '\\(\\u2212?' + KEEP_NUM + ',[ \\u00a0]\\u2212?' + KEEP_NUM + '\\)' +
    '|\\b' + KEEP_NUM + '(?:\\u2013' + KEEP_NUM + '(?:[ \\u00a0](?:' + KEEP_UNITS + ')\\b)?' +
    '|[ \\u00a0](?:' + KEEP_UNITS + ')\\b|(?:[ \\u00a0]:[ \\u00a0]' + KEEP_NUM + ')+)';

  /* Text cut into the runs to keep on one line and the rest: [{ text, keep }]. Joined, they give the text back. */
  function keepTogether(text) {
    var s = String(text == null ? '' : text);
    var re = new RegExp(KEEP_SOURCE, 'g');
    var out = [];
    var last = 0;
    var m;
    while ((m = re.exec(s))) {
      if (m.index > last) out.push({ text: s.slice(last, m.index), keep: false });
      out.push({ text: m[0], keep: true });
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push({ text: s.slice(last), keep: false });
    return out;
  }

  // ---------------------------------------------------------------- paper helpers
  function isScored(q) { return SCORED.indexOf(q.type) >= 0; }
  function isSelfChecked(q) { return SELF_CHECKED.indexOf(q.type) >= 0; }

  function questionMap(paper) {
    var m = {};
    paper.questions.forEach(function (q, i) { m[q.id] = { q: q, index: i }; });
    return m;
  }

  function stimulusOf(paper, q) {
    if (!q.stimulus) return null;
    var list = paper.stimuli || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === q.stimulus) return list[i];
    return null;
  }

  function sectionsOf(paper) {
    return paper.sections.map(function (s) {
      var qs = paper.questions.filter(function (q) { return q.section === s.id; });
      return {
        id: s.id, title: s.title, budget_minutes: s.budget_minutes,
        count: qs.length, scored: qs.filter(isScored).length,
        first: paper.questions.indexOf(qs[0])
      };
    });
  }

  function isTimed(paper) { return isNum(paper.minutes) && paper.minutes > 0; }

  /* The minutes a student should plan for: the paper's clock, or the sum of its section budgets when the
   * paper is timed task by task. */
  function guideMinutes(paper) {
    if (isTimed(paper)) return paper.minutes;
    var sum = 0;
    (paper.sections || []).forEach(function (s) { if (isNum(s.budget_minutes)) sum += s.budget_minutes; });
    return sum ? Math.round(sum * 10) / 10 : null;
  }

  /* A stable short fingerprint of a paper's content (the manifest's rev when it has none). */
  function paperRev(paper) {
    var s = JSON.stringify(paper);
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  /* One manifest row (build_web.py writes the same fields). */
  function manifestEntry(paper, rev) {
    return {
      id: paper.id, title: paper.title, kind: paper.kind, order: paper.order,
      questions: paper.questions.length, scored: paper.questions.filter(isScored).length,
      minutes: isTimed(paper) ? paper.minutes : null, guide_minutes: guideMinutes(paper), marking: paper.marking,
      sections: sectionsOf(paper).map(function (s) {
        return { id: s.id, title: s.title, questions: s.count, budget_minutes: s.budget_minutes == null ? null : s.budget_minutes };
      }),
      rev: rev || paperRev(paper)
    };
  }

  // ---------------------------------------------------------------- validation (what the runner needs)
  function validatePaper(p) {
    var errs = [];
    var e = function (m) { errs.push(m); };
    if (!p || typeof p !== 'object') return ['not an object'];
    if (typeof p.id !== 'string' || !p.id) e('id missing');
    if (typeof p.title !== 'string' || !p.title) e('title missing');
    if (['screening', 'aptitude', 'english'].indexOf(p.kind) < 0) e('kind must be screening, aptitude or english');
    if (p.minutes != null && !(isNum(p.minutes) && p.minutes > 0)) e('minutes must be a positive number or null');
    var m = p.marking;
    if (!m || !isNum(m.correct) || !isNum(m.wrong) || !isNum(m.blank) || m.correct <= 0 || m.wrong > 0) e('marking must be {correct > 0, wrong <= 0, blank}');
    if (!Array.isArray(p.sections) || !p.sections.length) { e('sections missing'); return errs; }
    if (!Array.isArray(p.questions) || !p.questions.length) { e('questions missing'); return errs; }
    var secIds = p.sections.map(function (s) { return s && s.id; });
    var stIds = {};
    (p.stimuli || []).forEach(function (s, i) {
      if (!s || typeof s.id !== 'string') { e('stimulus ' + (i + 1) + ': id missing'); return; }
      if (stIds[s.id]) e('stimulus ' + s.id + ': duplicate id');
      stIds[s.id] = s;
      if (['passage', 'puzzle', 'table', 'chart'].indexOf(s.type) < 0) e('stimulus ' + s.id + ': unknown type');
      if ((s.type === 'passage' || s.type === 'puzzle') && typeof s.text !== 'string') e('stimulus ' + s.id + ': text missing');
      if (s.type === 'table') {
        if (!Array.isArray(s.columns) || !Array.isArray(s.rows)) e('stimulus ' + s.id + ': columns and rows needed');
        else s.rows.forEach(function (r, j) { if (!Array.isArray(r) || r.length !== s.columns.length) e('stimulus ' + s.id + ': row ' + (j + 1) + ' has the wrong number of cells'); });
      }
      if (s.type === 'chart') {
        var c = s.chart;
        if (!c || ['bar', 'line', 'pie'].indexOf(c.kind) < 0 || !Array.isArray(c.categories) || !Array.isArray(c.series) || !c.series.length) e('stimulus ' + s.id + ': chart needs kind, categories and series');
        else c.series.forEach(function (sr) {
          if (!sr || !Array.isArray(sr.values) || sr.values.length !== c.categories.length || !sr.values.every(isNum)) e('stimulus ' + s.id + ': series ' + (sr && sr.name) + ' needs one number per category');
        });
        if (c && c.kind === 'pie' && c.series && c.series.length !== 1) e('stimulus ' + s.id + ': a pie has one series');
      }
    });
    var seen = {};
    var lastSec = -1;
    p.questions.forEach(function (q, i) {
      var w = 'Q' + (i + 1);
      if (!q || typeof q !== 'object') { e(w + ': not an object'); return; }
      if (q.n !== i + 1) e(w + ': n must be ' + (i + 1));
      if (typeof q.id !== 'string' || !q.id) e(w + ': id missing');
      else if (seen[q.id]) e(w + ': duplicate id ' + q.id);
      seen[q.id] = true;
      var si = secIds.indexOf(q.section);
      if (si < 0) e(w + ': unknown section ' + q.section);
      else if (si < lastSec) e(w + ': sections out of order');
      else lastSec = si;
      if (TYPES.indexOf(q.type) < 0) { e(w + ': unknown type ' + q.type); return; }
      if (typeof q.stem !== 'string' || !q.stem) e(w + ': stem missing');
      if (typeof q.reason !== 'string' || !q.reason) e(w + ': reason missing');
      if (q.stimulus && !stIds[q.stimulus]) e(w + ': stimulus ' + q.stimulus + ' does not exist');
      var a = q.answer;
      if (q.type === 'single') {
        if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 5) e(w + ': 2 to 5 options needed');
        else {
          var ids = q.options.map(function (o) { return o && o.id; });
          ids.forEach(function (id, j) { if (id !== 'abcde'.charAt(j)) e(w + ': option ids run a, b, c…'); });
          if (ids.indexOf(a) < 0) e(w + ': answer is not an option');
          q.options.forEach(function (o) { if (!o || typeof o.text !== 'string' || !o.text.trim()) e(w + ': empty option'); });
        }
      } else if (q.type === 'numeric') {
        if (!a || !isNum(a.value) || (a.tolerance != null && !(isNum(a.tolerance) && a.tolerance >= 0))) e(w + ': numeric answer needs value (and tolerance >= 0)');
      } else if (q.type === 'text') {
        if (!a || !Array.isArray(a.accept) || !a.accept.length) e(w + ': text answer needs accept');
      } else if (q.type === 'dictation') {
        if (!a || typeof a.text !== 'string' || !a.text) e(w + ': dictation answer needs text');
        if (typeof q.say !== 'string' || !q.say) e(w + ': dictation needs say');
      } else {
        if (!a || typeof a.model !== 'string' || !Array.isArray(a.checklist) || !a.checklist.length) e(w + ': ' + q.type + ' answer needs model and checklist');
      }
      if (q.seconds != null && !(isNum(q.seconds) && q.seconds > 0)) e(w + ': seconds must be positive');
      if (q.prep_seconds != null && !(isNum(q.prep_seconds) && q.prep_seconds > 0 && q.seconds)) e(w + ': prep_seconds needs seconds');
    });
    secIds.forEach(function (s) {
      if (!p.questions.some(function (q) { return q.section === s; })) e('section ' + s + ' has no questions');
    });
    return errs;
  }

  // ---------------------------------------------------------------- marking
  function hasResponse(q, v, attempt) {
    if (q.type === 'single') return typeof v === 'string' && q.options.some(function (o) { return o.id === v; });
    if (q.type === 'speak') return !!(attempt && attempt.revealed && attempt.revealed[q.id]);
    return typeof v === 'string' && v.trim() !== '';
  }

  /* 'right' | 'wrong' | 'blank' for scored items; 'self' for speak / write. */
  function markQuestion(q, v) {
    if (isSelfChecked(q)) return 'self';
    if (!hasResponse(q, v)) return 'blank';
    if (q.type === 'single') return v === q.answer ? 'right' : 'wrong';
    if (q.type === 'numeric') {
      var x = parseNumber(v);
      if (x === null) return 'wrong';
      return Math.abs(x - q.answer.value) <= (q.answer.tolerance || 0) + 1e-9 ? 'right' : 'wrong';
    }
    if (q.type === 'text') {
      var t = normText(v);
      return q.answer.accept.some(function (a) { return normText(a) === t; }) ? 'right' : 'wrong';
    }
    if (q.type === 'dictation') {
      var A = dictationWords(q.answer.text);
      var B = dictationWords(v);
      return A.length === B.length && A.every(function (w, i) { return w === B[i]; }) ? 'right' : 'wrong';
    }
    return 'blank';
  }

  /* Word-by-word difference (LCS): [{op: 'ok'|'missing'|'extra'|'wrong', want, got}] */
  function dictationDiff(expected, typed) {
    var A = dictationWords(expected);
    var B = dictationWords(typed);
    var n = A.length;
    var m = B.length;
    var L = [];
    for (var i = 0; i <= n; i++) { L.push([]); for (var j = 0; j <= m; j++) L[i].push(0); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var out = [];
    i = 0; j = 0;
    while (i < n || j < m) {
      if (i < n && j < m && A[i] === B[j]) { out.push({ op: 'ok', want: A[i], got: B[j] }); i++; j++; }
      else if (i < n && j < m && L[i + 1][j + 1] === L[i][j]) { out.push({ op: 'wrong', want: A[i], got: B[j] }); i++; j++; }
      else if (j < m && (i === n || L[i][j + 1] >= L[i + 1][j])) { out.push({ op: 'extra', want: null, got: B[j] }); j++; }
      else { out.push({ op: 'missing', want: A[i], got: null }); i++; }
    }
    return out;
  }

  function blankTally() { return { score: 0, max: 0, right: 0, wrong: 0, blank: 0, count: 0, scored: 0, selfTotal: 0, selfDone: 0 }; }

  /* Score of a set of answers under the paper's marking, overall and by section. */
  function scoreAttempt(paper, attempt) {
    var answers = (attempt && attempt.answers) || {};
    var m = paper.marking;
    var total = blankTally();
    var bySec = {};
    paper.sections.forEach(function (s) { bySec[s.id] = blankTally(); });
    paper.questions.forEach(function (q) {
      var t = [total, bySec[q.section] || blankTally()];
      var st = markQuestion(q, answers[q.id]);
      t.forEach(function (x) {
        x.count++;
        if (st === 'self') {
          x.selfTotal++;
          if (hasResponse(q, answers[q.id], attempt) || (attempt && attempt.revealed && attempt.revealed[q.id])) x.selfDone++;
          return;
        }
        x.scored++;
        x.max += m.correct;
        x[st]++;
        x.score += st === 'right' ? m.correct : st === 'wrong' ? m.wrong : m.blank;
      });
    });
    var fin = function (x) {
      x.score = Math.round(x.score * 100) / 100;
      x.attempted = x.right + x.wrong;
      x.accuracy = x.attempted ? Math.round(x.right / x.attempted * 100) : null;
      return x;
    };
    fin(total);
    total.sections = paper.sections.map(function (s) { var x = fin(bySec[s.id]); x.id = s.id; x.title = s.title; return x; });
    return total;
  }

  // ---------------------------------------------------------------- timer
  function remainingMs(attempt, now) {
    if (!attempt || attempt.deadline == null) return Infinity;
    return Math.max(0, attempt.deadline - now);
  }
  function isExpired(attempt, now) { return !!attempt && attempt.deadline != null && now >= attempt.deadline; }

  /* Per-task timers (speak, write and dictation items with seconds). A task may start with prep_seconds to read
   * or plan; then seconds to speak, write or type. Phases: 'ready' (not started), 'prep', 'main', 'done'. */
  function taskPhase(attempt, q, now) {
    if (!q.seconds) return null;
    var started = attempt && attempt.tasks && attempt.tasks[q.id];
    if (started == null) return 'ready';
    var t = now - started;
    var prep = (q.prep_seconds || 0) * 1000;
    if (t < prep) return 'prep';
    if (t < prep + q.seconds * 1000) return 'main';
    return 'done';
  }
  /* Time left in the current phase (the whole task time before it starts; 0 when done). */
  function taskRemainingMs(attempt, q, now) {
    var ph = taskPhase(attempt, q, now);
    if (ph === null) return null;
    if (ph === 'ready') return ((q.prep_seconds || 0) ? q.prep_seconds : q.seconds) * 1000;
    var start = attempt.tasks[q.id];
    var prepEnd = start + (q.prep_seconds || 0) * 1000;
    if (ph === 'prep') return Math.max(0, prepEnd - now);
    return Math.max(0, prepEnd + q.seconds * 1000 - now);
  }
  function taskExpired(attempt, q, now) { return taskPhase(attempt, q, now) === 'done'; }

  // ---------------------------------------------------------------- state
  function emptyState(paperId) {
    return { v: STATE_VERSION, paperId: paperId, updatedAt: 0, current: null, last: null, best: null, history: [] };
  }

  function makeAttemptId(now) { return 'a' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36); }

  /* Any stored value -> a valid state for this paper. Corrupt data starts fresh; older or partial shapes are
   * repaired (flags as a list, numbers stored as numbers, missing fields); answers to questions the paper no
   * longer has are dropped. A state written by a newer page (higher v) comes back flagged readOnly, so this
   * page never overwrites it. */
  function migrate(raw, paper) {
    var pid = paper && paper.id;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (err) { raw = null; } }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return emptyState(pid);
    if (isNum(raw.v) && raw.v > STATE_VERSION) { var ro = copy(raw); ro.readOnly = true; return ro; }
    if (raw.paperId && pid && raw.paperId !== pid) return emptyState(pid);
    var qm = paper ? questionMap(paper) : null;
    var st = emptyState(pid || raw.paperId);
    st.updatedAt = isNum(raw.updatedAt) ? raw.updatedAt : 0;
    var fixAttempt = function (a, submitted) {
      if (!a || typeof a !== 'object' || !isNum(a.startedAt)) return null;
      var out = {
        id: typeof a.id === 'string' ? a.id : 'a' + a.startedAt.toString(36),
        rev: typeof a.rev === 'string' ? a.rev : '',
        startedAt: a.startedAt,
        deadline: isNum(a.deadline) ? a.deadline : null,
        answers: {}, flags: {}, plays: {}, tasks: {}, checks: {}, revealed: {}, visited: {},
        pos: isNum(a.pos) ? Math.max(0, Math.floor(a.pos)) : 0
      };
      if (out.deadline === null && a.deadline === undefined && paper && isTimed(paper)) out.deadline = a.startedAt + paper.minutes * 60000;
      var keep = function (qid) { return !qm || own(qm, qid); };
      var ans = a.answers && typeof a.answers === 'object' ? a.answers : {};
      Object.keys(ans).forEach(function (qid) {
        if (!keep(qid)) return;
        var v = ans[qid];
        if (isNum(v)) v = String(v);
        if (typeof v === 'string') out.answers[qid] = v;
      });
      var flags = a.flags;
      if (Array.isArray(flags)) flags.forEach(function (qid) { if (keep(qid)) out.flags[qid] = true; });
      else if (flags && typeof flags === 'object') Object.keys(flags).forEach(function (qid) { if (flags[qid] && keep(qid)) out.flags[qid] = true; });
      ['plays', 'tasks'].forEach(function (k) {
        var src = a[k] && typeof a[k] === 'object' ? a[k] : {};
        Object.keys(src).forEach(function (qid) { if (keep(qid) && isNum(src[qid])) out[k][qid] = src[qid]; });
      });
      ['revealed', 'visited'].forEach(function (k) {
        var src = a[k] && typeof a[k] === 'object' ? a[k] : {};
        Object.keys(src).forEach(function (qid) { if (keep(qid) && src[qid]) out[k][qid] = true; });
      });
      var ch = a.checks && typeof a.checks === 'object' ? a.checks : {};
      Object.keys(ch).forEach(function (qid) { if (keep(qid) && Array.isArray(ch[qid])) out.checks[qid] = ch[qid].map(Boolean); });
      if (paper && out.pos >= paper.questions.length) out.pos = paper.questions.length - 1;
      if (submitted) {
        out.submittedAt = isNum(a.submittedAt) ? a.submittedAt : out.startedAt;
        out.auto = !!a.auto;
      }
      return out;
    };
    st.current = fixAttempt(raw.current, false);
    st.last = fixAttempt(raw.last, true);
    var fixEntry = function (h) {
      if (!h || typeof h !== 'object' || !isNum(h.score) || !isNum(h.max)) return null;
      return {
        id: typeof h.id === 'string' ? h.id : '', rev: typeof h.rev === 'string' ? h.rev : '',
        startedAt: isNum(h.startedAt) ? h.startedAt : 0, submittedAt: isNum(h.submittedAt) ? h.submittedAt : 0,
        usedMs: isNum(h.usedMs) ? h.usedMs : 0, auto: !!h.auto, score: h.score, max: h.max,
        right: isNum(h.right) ? h.right : 0, wrong: isNum(h.wrong) ? h.wrong : 0, blank: isNum(h.blank) ? h.blank : 0,
        selfDone: isNum(h.selfDone) ? h.selfDone : 0, selfTotal: isNum(h.selfTotal) ? h.selfTotal : 0,
        sections: Array.isArray(h.sections) ? h.sections.filter(function (s) { return s && typeof s.id === 'string'; }) : []
      };
    };
    st.history = (Array.isArray(raw.history) ? raw.history : []).map(fixEntry).filter(Boolean).slice(-HISTORY_MAX);
    st.best = fixEntry(raw.best);
    st.history.forEach(function (h) { if (!st.best || better(h, st.best)) st.best = h; });
    return st;
  }

  function better(a, b) {
    var ra = a.max ? a.score / a.max : 0;
    var rb = b.max ? b.score / b.max : 0;
    return ra > rb || (ra === rb && a.submittedAt > b.submittedAt);
  }

  function startAttempt(state, paper, now, rev) {
    if (state.readOnly) return state;
    if (state.current) return state;
    var s = copy(state);
    s.current = {
      id: makeAttemptId(now), rev: rev || paperRev(paper), startedAt: now,
      deadline: isTimed(paper) ? now + paper.minutes * 60000 : null,
      answers: {}, flags: {}, plays: {}, tasks: {}, checks: {}, revealed: {}, visited: {}, pos: 0
    };
    s.current.visited[paper.questions[0].id] = true;
    s.updatedAt = now;
    return s;
  }

  /* Can this question's answer still change? (paper open, time left, task not run out, model not revealed) */
  function canEdit(state, paper, qid, now) {
    var a = state.current;
    if (!a || state.readOnly || isExpired(a, now)) return false;
    var hit = questionMap(paper)[qid];
    if (!hit) return false;
    var q = hit.q;
    var ph = taskPhase(a, q, now);
    if (q.type === 'write' && (a.revealed[qid] || ph === 'done' || ph === 'prep' || (ph === 'ready' && q.prep_seconds))) return false;
    if (q.type === 'speak' && a.revealed[qid]) return false;
    if (q.type === 'dictation' && ph === 'done') return false;
    return true;
  }

  function mutate(state, paper, now, fn) {
    if (!state.current || state.readOnly || isExpired(state.current, now)) return state;
    var s = copy(state);
    fn(s.current);
    s.updatedAt = now;
    return s;
  }

  function setAnswer(state, paper, qid, value, now) {
    if (!canEdit(state, paper, qid, now)) return state;
    return mutate(state, paper, now, function (a) {
      if (value == null || value === '') delete a.answers[qid];
      else a.answers[qid] = String(value);
    });
  }
  function clearAnswer(state, paper, qid, now) { return setAnswer(state, paper, qid, null, now); }
  function toggleFlag(state, paper, qid, now) {
    return mutate(state, paper, now, function (a) { if (a.flags[qid]) delete a.flags[qid]; else a.flags[qid] = true; });
  }
  function goTo(state, paper, index, now) {
    var i = Math.max(0, Math.min(paper.questions.length - 1, index));
    return mutate(state, paper, now, function (a) { a.pos = i; a.visited[paper.questions[i].id] = true; });
  }
  function playsLeft(attempt, qid) { return MAX_PLAYS - ((attempt && attempt.plays && attempt.plays[qid]) || 0); }
  function notePlay(state, paper, qid, now) {
    if (state.current && playsLeft(state.current, qid) <= 0) return state;
    var hit = questionMap(paper)[qid];
    return mutate(state, paper, now, function (a) {
      a.plays[qid] = (a.plays[qid] || 0) + 1;
      if (hit && hit.q.type === 'dictation' && hit.q.seconds && a.tasks[qid] == null) a.tasks[qid] = now;   // typing time starts
    });
  }
  function startTask(state, paper, qid, now) {
    return mutate(state, paper, now, function (a) { if (a.tasks[qid] == null) a.tasks[qid] = now; });
  }
  function reveal(state, paper, qid, now) {
    return mutate(state, paper, now, function (a) { a.revealed[qid] = true; });
  }
  function setCheck(state, paper, qid, index, on, now) {
    return mutate(state, paper, now, function (a) {
      var q = questionMap(paper)[qid].q;
      var list = a.checks[qid] || q.answer.checklist.map(function () { return false; });
      list[index] = !!on;
      a.checks[qid] = list;
    });
  }

  /* Close the running attempt: score it, keep it as `last` for review, add it to history, update best.
   * A timed-out paper is closed at its deadline, whatever the clock says now. */
  function submit(state, paper, now, opts) {
    if (!state.current || state.readOnly) return state;
    var s = copy(state);
    var a = s.current;
    var auto = !!(opts && opts.auto);
    var at = a.deadline != null ? Math.min(now, a.deadline) : now;
    if (a.deadline != null && now >= a.deadline) auto = true;         // time ran out: the paper closed itself
    a.submittedAt = at;
    a.auto = auto;
    var res = scoreAttempt(paper, a);
    var entry = {
      id: a.id, rev: a.rev, startedAt: a.startedAt, submittedAt: at, usedMs: Math.max(0, at - a.startedAt), auto: auto,
      score: res.score, max: res.max, right: res.right, wrong: res.wrong, blank: res.blank,
      selfDone: res.selfDone, selfTotal: res.selfTotal,
      sections: res.sections.map(function (x) {
        return { id: x.id, score: x.score, max: x.max, right: x.right, wrong: x.wrong, blank: x.blank };
      })
    };
    s.history.push(entry);
    if (s.history.length > HISTORY_MAX) s.history = s.history.slice(-HISTORY_MAX);
    if (!s.best || better(entry, s.best)) s.best = entry;
    s.last = a;
    s.current = null;
    s.updatedAt = now;
    return s;
  }

  function autoSubmitIfExpired(state, paper, now) {
    if (state.current && isExpired(state.current, now)) return submit(state, paper, now, { auto: true });
    return state;
  }

  function lastEntry(state) { return state.history.length ? state.history[state.history.length - 1] : null; }

  // ---------------------------------------------------------------- views
  function counts(paper, attempt) {
    var c = { answered: 0, flagged: 0, blank: 0, total: paper.questions.length };
    paper.questions.forEach(function (q) {
      var v = attempt && attempt.answers[q.id];
      if (hasResponse(q, v, attempt)) c.answered++; else c.blank++;
      if (attempt && attempt.flags[q.id]) c.flagged++;
    });
    return c;
  }

  function navigator(paper, attempt) {
    return paper.questions.map(function (q, i) {
      var v = attempt && attempt.answers[q.id];
      return {
        index: i, n: q.n, id: q.id, section: q.section,
        answered: hasResponse(q, v, attempt), flagged: !!(attempt && attempt.flags[q.id]),
        current: !!attempt && attempt.pos === i
      };
    });
  }

  function sectionProgress(paper, attempt) {
    return sectionsOf(paper).map(function (s) {
      var qs = paper.questions.filter(function (q) { return q.section === s.id; });
      return { id: s.id, title: s.title, first: s.first, count: qs.length,
        answered: qs.filter(function (q) { return hasResponse(q, attempt && attempt.answers[q.id], attempt); }).length };
    });
  }

  /* How the student's answer and the right answer read in the review. */
  function displayAnswer(q, v) {
    if (q.type === 'single') {
      var o = q.options.filter(function (x) { return x.id === v; })[0];
      return o ? { letter: o.id.toUpperCase(), text: o.text } : null;
    }
    if (v == null || String(v).trim() === '') return null;
    return { text: String(v) };
  }
  function displayKey(q) {
    if (q.type === 'single') {
      var o = q.options.filter(function (x) { return x.id === q.answer; })[0];
      return { letter: o.id.toUpperCase(), text: o.text };
    }
    if (q.type === 'numeric') {
      var t = formatAmount(q.answer.value, q.answer.unit);
      if (q.answer.tolerance) t += ' (± ' + formatIndian(q.answer.tolerance) + ')';
      return { text: t };
    }
    if (q.type === 'text') return { text: q.answer.accept[0], also: q.answer.accept.slice(1) };
    if (q.type === 'dictation') return { text: q.answer.text };
    return { text: q.answer.model, checklist: q.answer.checklist };
  }

  function reviewItems(paper, attempt, filter) {
    filter = FILTERS.indexOf(filter) >= 0 ? filter : 'all';
    var items = paper.questions.map(function (q, i) {
      var v = attempt && attempt.answers[q.id];
      var status = markQuestion(q, v);
      if (status === 'self') status = hasResponse(q, v, attempt) ? 'self' : 'blank-self';
      return {
        index: i, n: q.n, id: q.id, q: q, section: q.section, status: status,
        flagged: !!(attempt && attempt.flags[q.id]), response: v == null ? null : v,
        yours: displayAnswer(q, v), key: displayKey(q),
        diff: q.type === 'dictation' && v ? dictationDiff(q.answer.text, v) : null,
        checks: (attempt && attempt.checks[q.id]) || null
      };
    });
    var tally = { all: items.length, wrong: 0, blank: 0, flagged: 0 };
    items.forEach(function (it) {
      if (it.status === 'wrong') tally.wrong++;
      if (it.status === 'blank' || it.status === 'blank-self') tally.blank++;
      if (it.flagged) tally.flagged++;
    });
    var shown = items.filter(function (it) {
      if (filter === 'wrong') return it.status === 'wrong';
      if (filter === 'blank') return it.status === 'blank' || it.status === 'blank-self';
      if (filter === 'flagged') return it.flagged;
      return true;
    });
    return { filter: filter, items: shown, counts: tally };
  }

  // ---------------------------------------------------------------- session
  /* A paper being sat, over a store {load(paperId) -> raw|null, save(paperId, state)} and a clock {now()}.
   * Every change is saved at once; creating a session on a paper whose time ran out while the page was closed
   * submits it (at its deadline) before anything else. */
  function createSession(opts) {
    var paper = opts.paper;
    var store = opts.store;
    var clock = opts.clock || { now: function () { return Date.now(); } };
    var rev = opts.rev || paperRev(paper);
    var state = migrate(store.load(paper.id), paper);
    var listeners = [];
    var save = function () { if (!state.readOnly) store.save(paper.id, state); };
    var set = function (next, why) {
      if (next === state) return false;
      state = next;
      save();
      listeners.forEach(function (fn) { fn(why, state); });
      return true;
    };
    var closedOnLoad = false;
    if (state.current && isExpired(state.current, clock.now())) {
      state = submit(state, paper, clock.now(), { auto: true });
      save();
      closedOnLoad = true;
    }
    var qid = function () { return state.current ? paper.questions[state.current.pos].id : null; };
    var api = {
      paper: paper, rev: rev, closedOnLoad: closedOnLoad,
      state: function () { return state; },
      attempt: function () { return state.current; },
      running: function () { return !!state.current; },
      readOnly: function () { return !!state.readOnly; },
      onChange: function (fn) { listeners.push(fn); },
      reload: function () {
        state = migrate(store.load(paper.id), paper);
        listeners.forEach(function (fn) { fn('reload', state); });
      },
      start: function () { return set(startAttempt(state, paper, clock.now(), rev), 'start'); },
      current: function () { return state.current ? paper.questions[state.current.pos] : null; },
      index: function () { return state.current ? state.current.pos : 0; },
      remaining: function () { return remainingMs(state.current, clock.now()); },
      taskRemaining: function (q) { return taskRemainingMs(state.current, q, clock.now()); },
      taskPhase: function (q) { return taskPhase(state.current, q, clock.now()); },
      taskExpired: function (q) { return taskExpired(state.current, q, clock.now()); },
      canEdit: function (id) { return canEdit(state, paper, id || qid(), clock.now()); },
      answer: function (id, v) { return set(setAnswer(state, paper, id, v, clock.now()), 'answer'); },
      clear: function (id) { return set(clearAnswer(state, paper, id || qid(), clock.now()), 'clear'); },
      flag: function (id) { return set(toggleFlag(state, paper, id || qid(), clock.now()), 'flag'); },
      go: function (i) { return set(goTo(state, paper, i, clock.now()), 'go'); },
      next: function () { return api.go(api.index() + 1); },
      prev: function () { return api.go(api.index() - 1); },
      playsLeft: function (id) { return playsLeft(state.current, id); },
      notePlay: function (id) { return set(notePlay(state, paper, id, clock.now()), 'play'); },
      startTask: function (id) { return set(startTask(state, paper, id, clock.now()), 'task'); },
      reveal: function (id) { return set(reveal(state, paper, id, clock.now()), 'reveal'); },
      check: function (id, i, on) { return set(setCheck(state, paper, id, i, on, clock.now()), 'check'); },
      counts: function () { return counts(paper, state.current); },
      navigator: function () { return navigator(paper, state.current); },
      sections: function () { return sectionProgress(paper, state.current); },
      submit: function () { return set(submit(state, paper, clock.now(), { auto: false }), 'submit'); },
      /* Call every second or so: closes the paper when its time is up. Returns true if it just did. */
      tick: function () {
        if (state.current && isExpired(state.current, clock.now())) return set(submit(state, paper, clock.now(), { auto: true }), 'timeout');
        return false;
      },
      result: function () { return state.last ? scoreAttempt(paper, state.last) : null; },
      lastEntry: function () { return lastEntry(state); },
      best: function () { return state.best; },
      review: function (filter) { return reviewItems(paper, state.last, filter); }
    };
    return api;
  }

  /* A store over a key-value adapter with get(key) / set(key, value) (shared/articleship-progress.js). */
  function progressStore(progress) {
    return {
      load: function (pid) { return progress.get(pid); },
      save: function (pid, st) { progress.set(pid, st); }
    };
  }

  /* Best and last of a paper from its saved state, for the home screen (no paper JSON needed). */
  function summary(raw) {
    var st = migrate(raw, null);
    var last = lastEntry(st);
    return {
      best: st.best, last: last, attempts: st.history.length,
      running: st.current ? { deadline: st.current.deadline, startedAt: st.current.startedAt } : null
    };
  }

  return {
    STATE_VERSION: STATE_VERSION, KEY_PREFIX: KEY_PREFIX, TOOL: TOOL, MAX_PLAYS: MAX_PLAYS, FILTERS: FILTERS,
    SCORED: SCORED, SELF_CHECKED: SELF_CHECKED,
    normText: normText, dictationWords: dictationWords, parseNumber: parseNumber, formatIndian: formatIndian,
    formatAmount: formatAmount, describeMarking: describeMarking, formatClock: formatClock,
    formatDuration: formatDuration, wordCount: wordCount, KEEP_SOURCE: KEEP_SOURCE, keepTogether: keepTogether,
    isScored: isScored, isSelfChecked: isSelfChecked, isTimed: isTimed, sectionsOf: sectionsOf,
    stimulusOf: stimulusOf, paperRev: paperRev, manifestEntry: manifestEntry, validatePaper: validatePaper,
    hasResponse: hasResponse, markQuestion: markQuestion, dictationDiff: dictationDiff, scoreAttempt: scoreAttempt,
    remainingMs: remainingMs, isExpired: isExpired, taskPhase: taskPhase, taskRemainingMs: taskRemainingMs,
    taskExpired: taskExpired, guideMinutes: guideMinutes,
    emptyState: emptyState, migrate: migrate, startAttempt: startAttempt, canEdit: canEdit, setAnswer: setAnswer,
    clearAnswer: clearAnswer, toggleFlag: toggleFlag, goTo: goTo, playsLeft: playsLeft, notePlay: notePlay,
    startTask: startTask, reveal: reveal, setCheck: setCheck, submit: submit,
    autoSubmitIfExpired: autoSubmitIfExpired, lastEntry: lastEntry, counts: counts, navigator: navigator,
    sectionProgress: sectionProgress, reviewItems: reviewItems, displayKey: displayKey, displayAnswer: displayAnswer,
    createSession: createSession, progressStore: progressStore, summary: summary
  };
}));
