/* MSC Articleship Program · Written test practice: the page (DOM layer).
 * Screens: home (#/), start (#/<paper>), sitting (#/<paper>/sit), result (#/<paper>/result),
 * review (#/<paper>/review?f=all|wrong|blank|flagged). All rules live in written-test-core.js.
 */
(function () {
  'use strict';

  var Core = window.WrittenTestCore;
  var Charts = window.WrittenTestCharts;
  var Progress = window.ArticleshipProgress;
  var COURSE = document.body.getAttribute('data-course') || 'msc-articleship-program';
  var GROUPS = [['screening', 'Screening papers'], ['aptitude', 'Aptitude papers'], ['english', 'English']];

  var app = document.getElementById('app');
  var barRight = document.getElementById('bar-right');
  var barTool = document.getElementById('bar-tool');
  var barLogo = document.getElementById('bar-logo');
  var announcer = document.getElementById('announce');
  var progress = Progress.create({ tool: Core.TOOL, prefix: Core.KEY_PREFIX });
  var store = Core.progressStore(progress);
  var clock = { now: function () { return Date.now(); } };

  var manifest = null;
  var sessions = {};
  var ui = { tick: null, autoNotice: {}, collapsed: {}, chartTables: {}, recorder: null, recordings: {}, route: null, resize: null };

  // ---------------------------------------------------------------- small helpers
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'svg') e.innerHTML = v;                 // our own chart SVG only
        else if (k === 'style' && typeof v === 'object') Object.keys(v).forEach(function (p) { e.style[p] = v[p]; });
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? '' : v);
      });
    }
    add(e, kids);
    return e;
  }
  function add(e, kids) {
    (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) { add(e, c); return; }
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? textNode(String(c)) : c);
    });
  }
  /* Text as a node; number–unit pairs (2025–26, ₹7.2 lakh, 8 m, 7 : 5, (4, 6)) sit in a span.nw that never breaks,
   * whether the writer typed U+00A0 or a plain space. The text itself is unchanged. */
  function textNode(s) {
    var parts = Core.keepTogether(s);
    if (!parts.some(function (p) { return p.keep; })) return document.createTextNode(s);
    var f = document.createDocumentFragment();
    parts.forEach(function (p) {
      if (!p.keep) { f.appendChild(document.createTextNode(p.text)); return; }
      var nw = document.createElement('span');
      nw.className = 'nw';
      nw.textContent = p.text;
      f.appendChild(nw);
    });
    return f;
  }
  function icon(name, cls) {
    return h('img', { class: 'ico ' + (cls || ''), src: '../shared/img/doodles/' + name + '.svg', alt: '', width: 20, height: 20 });
  }
  /* Text with \n\n as paragraphs and \n as line breaks. */
  function paras(text, cls) {
    return String(text).split(/\n{2,}/).map(function (p) {
      var lines = p.split('\n');
      var kids = [];
      lines.forEach(function (ln, i) { if (i) kids.push(h('br')); kids.push(ln); });
      return h('p', { class: cls || null }, kids);
    });
  }
  function lines(text) {
    var kids = [];
    String(text).split('\n').forEach(function (ln, i) { if (i) kids.push(h('br')); kids.push(ln); });
    return kids;
  }
  function say(msg) {
    announcer.textContent = '';
    setTimeout(function () { announcer.textContent = msg; }, 30);
  }
  function setTitle(t) { document.title = t ? t + ' · Written test practice' : 'Written test practice · MSC Articleship Program'; }
  function go(hash, replace) {
    if (replace) location.replace(hash); else location.hash = hash;
  }
  function entryOf(id) {
    return manifest && manifest.papers.filter(function (p) { return p.id === id; })[0];
  }
  function score(n) { return Core.formatIndian(n); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  /* Section budgets: 4 -> “4 min”, 0.5 -> “30 s”, 1.5 -> “1 min 30 s”. */
  function budget(m) {
    var secs = Math.round(m * 60);
    if (secs % 60 === 0) return secs / 60 + ' min';
    return secs > 60 ? Math.floor(secs / 60) + ' min ' + (secs % 60) + ' s' : secs + ' s';
  }
  function markingShort(m) {
    var d = Core.describeMarking(m);
    return d.short.replace(/ \/ 0$/, '');
  }
  function untimedLabel(entry) {
    if (entry.minutes) return entry.minutes + ' min';
    return entry.guide_minutes ? 'about ' + entry.guide_minutes + ' min' : 'self-paced';
  }

  function setBar(mode, extra) {
    barRight.innerHTML = '';
    var sit = mode === 'sit';
    document.body.classList.toggle('sitting', sit);
    barTool.hidden = sit;
    barLogo.querySelector('.logo-full').hidden = sit;
    barLogo.querySelector('.logo-mark').hidden = !sit;
    if (extra) add(barRight, extra);
  }

  function stopTick() {
    if (ui.tick) { clearInterval(ui.tick); ui.tick = null; }
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    stopRecording();
  }

  // ---------------------------------------------------------------- loading
  function loadManifest() {
    return fetch('papers/index.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('manifest ' + r.status);
      return r.json();
    }).then(function (m) {
      manifest = { papers: (m.papers || []).slice().sort(function (a, b) { return a.order - b.order; }) };
      return manifest;
    });
  }

  function snapshotKey(id) { return 'cache.paper.' + id; }

  /* The paper a session needs: the version its running (or last) attempt was sat on, if that copy is kept and
   * the paper has changed since; otherwise the current one. */
  function loadPaper(entry, forceLatest) {
    var raw = progress.get(entry.id);
    var st = Core.migrate(raw, null);
    var want = st.current ? st.current.rev : st.last ? st.last.rev : entry.rev;
    var snap = progress.get(snapshotKey(entry.id));
    if (!forceLatest && snap && snap.paper && want && snap.rev === want && want !== entry.rev) {
      return Promise.resolve({ paper: snap.paper, rev: snap.rev });
    }
    return fetch('papers/' + encodeURIComponent(entry.id) + '.json?r=' + encodeURIComponent(entry.rev || ''))
      .then(function (r) { if (!r.ok) throw new Error('paper ' + r.status); return r.json(); })
      .then(function (paper) { return { paper: paper, rev: entry.rev || Core.paperRev(paper) }; })
      .catch(function (err) {
        if (snap && snap.paper) return { paper: snap.paper, rev: snap.rev };
        throw err;
      });
  }

  function getSession(id, forceLatest) {
    var entry = entryOf(id);
    if (!entry) return Promise.reject(new Error('missing'));
    if (sessions[id] && !(forceLatest && sessions[id].rev !== entry.rev)) return Promise.resolve(sessions[id]);
    return progress.pull(id).then(function () { return loadPaper(entry, forceLatest); }).then(function (got) {
      var errs = Core.validatePaper(got.paper);
      if (errs.length) throw new Error('invalid paper: ' + errs.slice(0, 3).join('; '));
      var s = Core.createSession({ paper: got.paper, store: store, clock: clock, rev: got.rev });
      if (s.closedOnLoad) ui.autoNotice[id] = true;
      sessions[id] = s;
      return s;
    });
  }

  // ---------------------------------------------------------------- routing
  function parse() {
    var raw = (location.hash || '#/').replace(/^#\/?/, '');
    var q = raw.split('?');
    var parts = q[0].split('/').filter(Boolean).map(decodeURIComponent);
    var params = {};
    (q[1] || '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) params[p[0]] = decodeURIComponent(p[1] || ''); });
    return { id: parts[0] || null, view: parts[1] || null, params: params };
  }

  function route() {
    stopTick();
    var r = parse();
    ui.route = r;
    if (!r.id) return renderHome();
    var entry = entryOf(r.id);
    if (!entry) return renderMissing();
    app.setAttribute('aria-busy', 'true');
    getSession(r.id).then(function (s) {
      app.removeAttribute('aria-busy');
      if (parse().id !== r.id || parse().view !== r.view) return;   // the student moved on meanwhile
      if (ui.autoNotice[r.id] && s.state().last && (r.view === 'sit' || !r.view)) {
        return go('#/' + r.id + '/result', true);                     // time ran out while the page was closed
      }
      if (r.view === 'sit') {
        if (!s.running()) return go('#/' + r.id, true);
        return renderSit(s, entry);
      }
      if (r.view === 'result') {
        if (!s.state().last) return go('#/' + r.id, true);
        return renderResult(s, entry);
      }
      if (r.view === 'review') {
        if (!s.state().last) return go('#/' + r.id, true);
        return renderReview(s, entry, r.params.f);
      }
      return renderStart(s, entry);
    }).catch(function () {
      app.removeAttribute('aria-busy');
      renderError();
    });
  }

  function screen(cls, kids, focusFirst) {
    app.innerHTML = '';
    app.className = 'screen ' + cls;
    add(app, kids);
    window.scrollTo(0, 0);
    var target = focusFirst !== false && app.querySelector('h1');
    if (target) { target.setAttribute('tabindex', '-1'); try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); } }
  }

  // ---------------------------------------------------------------- home
  function homeLine(entry) {
    var sum = Core.summary(progress.get(entry.id));
    if (sum.running) {
      if (sum.running.deadline != null) {
        var left = sum.running.deadline - clock.now();
        if (left > 0) return h('span', { class: 'pc-state running' }, ['In progress · ', Core.formatClock(left), ' left']);
        return h('span', { class: 'pc-state running' }, 'Time’s up: see your result');
      }
      return h('span', { class: 'pc-state running' }, 'In progress');
    }
    if (!sum.last) return null;
    var fmtE = function (e) { return score(e.score) + ' / ' + score(e.max); };
    if (sum.last.max === 0) return h('span', { class: 'pc-state' }, 'Done · ' + plural(sum.attempts, 'time', 'times'));
    return h('span', { class: 'pc-state' }, [h('b', null, 'Best ' + fmtE(sum.best)), ' · Last ' + fmtE(sum.last)]);
  }

  function renderHome() {
    setBar('home');
    setTitle('');
    var groups = GROUPS.map(function (g) {
      var list = manifest.papers.filter(function (p) { return p.kind === g[0]; });
      if (!list.length) return null;
      return h('section', { class: 'group', 'aria-labelledby': 'g-' + g[0] }, [
        h('h2', { id: 'g-' + g[0] }, g[1]),
        h('ul', { class: 'papers' }, list.map(function (p) {
          var neg = Core.describeMarking(p.marking).negative;
          var meta = plural(p.questions, 'question', 'questions') + ' · ' + untimedLabel(p);
          return h('li', null, h('a', { class: 'paper-card', href: '#/' + encodeURIComponent(p.id), 'data-paper': p.id }, [
            h('span', { class: 'pc-main' }, [
              h('span', { class: 'pc-title' }, p.title),
              h('span', { class: 'pc-meta' }, meta)
            ]),
            h('span', { class: 'pc-side' }, [
              neg ? h('span', { class: 'chip neg' }, 'Minus marking') : null,
              h('span', { class: 'chip mark', title: Core.describeMarking(p.marking).words }, markingShort(p.marking))
            ]),
            homeLine(p)
          ]));
        }))
      ]);
    });
    screen('home', h('div', { class: 'wrap' }, [
      h('h1', null, ['Written test ', h('span', { class: 'u' }, 'practice')]),
      h('p', { class: 'lead' }, 'Start with Screening paper 1. Sit one paper a day, in one go, then read every reason before you sit the next.'),
      groups
    ]), false);
    if (progress.hasRemote()) {
      Promise.all(manifest.papers.map(function (p) { return progress.pull(p.id); })).then(function () {
        if (!parse().id) {
          app.querySelectorAll('.paper-card').forEach(function (a) {
            var e = entryOf(a.getAttribute('data-paper'));
            var old = a.querySelector('.pc-state');
            var now = homeLine(e);
            if (old) old.remove();
            if (now) a.appendChild(now);
          });
        }
      });
    }
  }

  function renderMissing() {
    setBar('home');
    setTitle('');
    screen('missing', h('div', { class: 'wrap' }, [
      h('h1', null, 'Paper not found'),
      h('p', { class: 'lead' }, 'This link doesn’t open a paper. Pick one from the list.'),
      h('a', { class: 'btn accent', href: '#/' }, 'All papers')
    ]));
  }

  function renderError() {
    setBar('home');
    screen('error', h('div', { class: 'wrap' }, [
      h('h1', null, 'Couldn’t load the paper'),
      h('p', { class: 'lead' }, 'Check your internet and reload the page.'),
      h('button', { class: 'btn accent', type: 'button', onclick: function () { location.reload(); } }, 'Reload')
    ]));
  }

  // ---------------------------------------------------------------- start
  function rulesFor(paper) {
    var types = {};
    paper.questions.forEach(function (q) { types[q.type] = true; });
    var out = [];
    if (Core.isTimed(paper)) out.push('One sitting. The timer runs from Start, even if you close the page.');
    else out.push('No clock for the whole paper: each task has its own timer.');
    if (types.dictation || types.speak) {
      out.push('A quiet room, and headphones if you have them.');
      if (types.speak) out.push('Speak out loud, then check yourself against the model.');
    }
    if (types.single || types.numeric) out.push('Pen and rough paper. No calculator.');
    out.push('No AI, no notes, no help.');
    return out;
  }

  function markingWords(m) {
    var pts = function (n) { return n === 1 ? '1 mark' : score(Math.abs(n)) + ' marks'; };
    var s = pts(m.correct) + ' for a right answer';
    s += m.wrong < 0 ? ', ' + pts(m.wrong) + ' off for a wrong one' : ', nothing lost for a wrong one';
    return s + '.';
  }

  function renderStart(s, entry) {
    setBar('home');
    var paper = s.paper;
    setTitle(paper.title);
    var running = s.running();
    var neg = Core.describeMarking(paper.marking).negative;
    var scoredCount = paper.questions.filter(Core.isScored).length;
    var best = s.best();
    var last = s.lastEntry();
    var startBtn = h('button', { class: 'btn accent block', type: 'button', id: 'start-btn' }, running ? 'Resume' : 'Start');
    startBtn.addEventListener('click', function () {
      if (s.running()) return go('#/' + paper.id + '/sit');
      startBtn.disabled = true;
      getSession(paper.id, true).then(function (fresh) {
        progress.set(snapshotKey(paper.id), { rev: fresh.rev, paper: fresh.paper, updatedAt: clock.now() }, { local: true });
        fresh.start();
        go('#/' + paper.id + '/sit');
      }).catch(renderError);
    });
    var facts = [
      ['Questions', String(paper.questions.length)],
      ['Minutes', Core.isTimed(paper) ? String(paper.minutes) : Core.guideMinutes(paper) ? 'About ' + Core.guideMinutes(paper) : 'Self-paced'],
      ['Marking', markingShort(paper.marking)]
    ];
    var kids = [
      h('a', { class: 'back-link', href: '#/' }, 'All papers'),
      h('h1', null, paper.title),
      h('p', { class: 'lead' }, paper.intro),
      h('dl', { class: 'facts' }, facts.map(function (f) { return h('div', null, [h('dt', null, f[0]), h('dd', null, f[1])]); })),
      scoredCount ? h('p', { class: 'marking-words' }, markingWords(paper.marking)) : null,
      neg ? h('div', { class: 'sticky pink neg-rule' }, [h('span', { class: 'label' }, 'Minus marking'),
        'Answer only when you have narrowed it to two options; otherwise skip it.']) : null,
      h('h2', null, 'Sections'),
      h('ul', { class: 'sec-list' }, Core.sectionsOf(paper).map(function (sec) {
        return h('li', null, [h('span', { class: 'sl-name' }, sec.title),
          h('span', { class: 'sl-meta' }, plural(sec.count, 'question', 'questions') + (sec.budget_minutes ? ' · ' + budget(sec.budget_minutes) : ''))]);
      })),
      h('h2', null, 'Rules'),
      h('ul', { class: 'ticks rules' }, rulesFor(paper).map(function (t) { return h('li', null, t); })),
      running && s.attempt().deadline != null ? h('p', { class: 'resume-note' }, [h('b', null, Core.formatClock(s.remaining())), ' left on your paper.']) : null,
      startBtn,
      last ? h('p', { class: 'history' }, [
        last.max ? ['Best ', h('b', null, score(best.score) + ' / ' + score(best.max)), ' · Last ' + score(last.score) + ' / ' + score(last.max) + ' · '] : null,
        h('a', { href: '#/' + paper.id + '/result' }, 'Last result')
      ]) : null
    ];
    screen('start', h('div', { class: 'wrap' }, kids));
    if (running && s.attempt().deadline != null) {
      ui.tick = setInterval(function () {
        if (s.tick()) return go('#/' + paper.id + '/result', true);
        var note = app.querySelector('.resume-note b');
        if (note) note.textContent = Core.formatClock(s.remaining());
      }, 500);
    }
  }

  // ---------------------------------------------------------------- stimuli
  function renderStimulus(paper, st, opts) {
    opts = opts || {};
    var label = { passage: 'Passage', puzzle: 'Puzzle', table: 'Table', chart: 'Chart' }[st.type];
    var key = paper.id + ':' + st.id;
    var body;
    if (st.type === 'passage') body = h('div', { class: 'st-text' }, paras(st.text));
    else if (st.type === 'puzzle') body = h('div', { class: 'st-text puzzle' }, paras(st.text));
    else if (st.type === 'table') body = tableEl(st.columns, st.rows, null);
    else body = chartEl(paper, st);
    var det = h('details', { class: 'stim st-' + st.type, 'data-stim': st.id }, [
      h('summary', null, [h('span', { class: 'st-kind' }, label), h('span', { class: 'st-title' }, st.title)]),
      h('div', { class: 'st-body' }, [body, st.note ? h('p', { class: 'st-note' }, st.note) : null])
    ]);
    var open = opts.open !== undefined ? opts.open : !ui.collapsed[key];
    if (open) det.setAttribute('open', '');
    det.addEventListener('toggle', function () {
      ui.collapsed[key] = !det.open;
      if (det.open) drawCharts(det);
    });
    return det;
  }

  function isNumericCell(s) { return /^[\s₹−+\-]*[\d,.]+\s*%?$/.test(s); }

  function tableEl(columns, rows, caption) {
    var numCol = columns.map(function (_, i) { return rows.every(function (r) { return isNumericCell(r[i]) || r[i] === ''; }) && i > 0; });
    return h('div', { class: 'tbl-wrap', tabindex: '0', role: 'region', 'aria-label': caption || 'Table' },
      h('table', { class: 'tbl' }, [
        caption ? h('caption', { class: 'visually-hidden' }, caption) : null,
        h('thead', null, h('tr', null, columns.map(function (c, i) { return h('th', { scope: 'col', class: numCol[i] ? 'num' : null }, c); }))),
        h('tbody', null, rows.map(function (r) {
          return h('tr', null, r.map(function (c, i) { return i === 0 ? h('th', { scope: 'row' }, c) : h('td', { class: numCol[i] ? 'num' : null }, c); }));
        }))
      ]));
  }

  function chartEl(paper, st) {
    var key = paper.id + ':' + st.id;
    var box = h('div', { class: 'chart-box', 'data-chart': st.id });
    box._chart = st.chart;
    box._title = st.title;
    var t = Charts.table(st.chart);
    var tbl = tableEl(t.columns, t.rows, st.title);
    var wrapT = h('div', { class: 'chart-table' }, tbl);
    var toggle = h('button', { class: 'link-btn chart-toggle', type: 'button', 'aria-expanded': 'false' }, 'Show as table');
    var showTable = function (on) {
      ui.chartTables[key] = on;
      wrapT.hidden = !on;
      toggle.setAttribute('aria-expanded', on ? 'true' : 'false');
      toggle.textContent = on ? 'Hide table' : 'Show as table';
    };
    toggle.addEventListener('click', function () { showTable(wrapT.hidden); });
    box._onNeedsTable = function (needs) {
      if (needs) { showTable(true); toggle.hidden = true; }
    };
    var fig = h('figure', { class: 'chart' }, [box, toggle, wrapT]);
    showTable(!!ui.chartTables[key]);
    return fig;
  }

  function drawCharts(scope) {
    (scope || app).querySelectorAll('.chart-box').forEach(function (box) {
      var w = Math.floor(box.clientWidth);
      if (!w || box._w === w) return;
      box._w = w;
      var r = Charts.render(box._chart, { width: w, fontSize: w < 420 ? Charts.WEB.fontSize : 16, surface: '#FFFCF6', title: box._title });
      box.innerHTML = r.svg;
      if (box._onNeedsTable) box._onNeedsTable(r.needsTable);
    });
  }

  window.addEventListener('resize', function () {
    clearTimeout(ui.resize);
    ui.resize = setTimeout(function () { drawCharts(); }, 120);
  });

  // ---------------------------------------------------------------- speech, recording
  var Speech = {
    voice: undefined,
    second: null,
    available: function () { return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'; },
    /* English voices, Indian English first, then British, American, any English. */
    ranked: function (voices) {
      var en = voices.filter(function (v) { return /^en([-_]|$)/i.test(v.lang || ''); });
      var rank = function (v) { return /^en[-_]IN/i.test(v.lang) ? 0 : /^en[-_]GB/i.test(v.lang) ? 1 : /^en[-_]US/i.test(v.lang) ? 2 : 3; };
      return en.slice().sort(function (a, b) { return rank(a) - rank(b); });
    },
    pick: function (voices) { return Speech.ranked(voices)[0] || null; },
    ready: function () {
      if (!Speech.available()) return Promise.resolve(null);
      if (Speech.voice !== undefined) return Promise.resolve(Speech.voice);
      return new Promise(function (resolve) {
        var done = false;
        var finish = function () {
          if (done) return;
          done = true;
          var vs = [];
          try { vs = window.speechSynthesis.getVoices() || []; } catch (e) { vs = []; }
          var ranked = Speech.ranked(vs);
          Speech.voice = ranked[0] || null;
          Speech.second = ranked.filter(function (v) { return Speech.voice && v.name !== Speech.voice.name; })[0] || null;
          resolve(Speech.voice);
        };
        var vs0 = [];
        try { vs0 = window.speechSynthesis.getVoices() || []; } catch (e) { vs0 = []; }
        if (vs0.length) return finish();
        try { window.speechSynthesis.addEventListener('voiceschanged', finish); } catch (e) { /* ignore */ }
        setTimeout(finish, 900);
      });
    },
    /* Reads the text; lines on their own (a conversation) alternate between two voices when the device has two. */
    speak: function (text, onend) {
      var synth = window.speechSynthesis;
      try { synth.cancel(); } catch (e) { /* ignore */ }
      var lines = String(text).split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
      var ended = false;
      var end = function () { if (!ended) { ended = true; if (onend) onend(); } };
      var i = 0;
      var next = function () {
        if (ended) return;
        if (i >= lines.length) return end();
        var u = new window.SpeechSynthesisUtterance(lines[i]);
        var v = i % 2 === 1 && Speech.second ? Speech.second : Speech.voice;
        if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-IN';
        u.rate = 0.92;
        i++;
        u.onend = function () { setTimeout(next, 250); };
        u.onerror = function () { setTimeout(next, 250); };
        synth.speak(u);
      };
      next();
      setTimeout(end, Math.max(4000, String(text).split(/\s+/).length * 700 + lines.length * 500));   // a stuck engine never blocks the button
    }
  };

  function canRecord() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  }
  function stopRecording() {
    var r = ui.recorder;
    if (r && r.rec && r.rec.state === 'recording') { try { r.rec.stop(); } catch (e) { /* ignore */ } }
  }

  // ---------------------------------------------------------------- sitting the paper
  function renderSit(s, entry) {
    var paper = s.paper;
    setTitle(paper.title);
    var timed = s.attempt().deadline != null;
    var timerEl = h('div', { class: 'timer', role: 'timer', 'aria-label': 'Time left', id: 'timer' }, timed ? Core.formatClock(s.remaining()) : '');
    var submitTop = h('button', { class: 'btn ghost small', type: 'button', id: 'submit-top' }, 'Submit');
    submitTop.addEventListener('click', function () { confirmSubmit(s); });
    setBar('sit', [h('div', { class: 'bar-left' }, [timed ? timerEl : null, h('span', { class: 'paper-name' + (timed ? ' wide-only' : '') }, paper.title)]), submitTop]);

    var tabs = h('nav', { class: 'sec-tabs', 'aria-label': 'Sections' });
    var card = h('article', { class: 'qcard', id: 'qcard', 'aria-labelledby': 'qh' });
    var navGrid = h('div', { class: 'nav-grid', id: 'nav-grid' });
    var aside = h('aside', { class: 'navpanel', 'aria-label': 'All questions' }, [
      h('h2', { class: 'np-title' }, 'Questions'), navLegend(), navGrid
    ]);
    var prev = h('button', { class: 'btn ghost', type: 'button', id: 'prev' }, 'Previous');
    var next = h('button', { class: 'btn accent', type: 'button', id: 'next' }, 'Next');
    var navBtn = h('button', { class: 'btn ghost nav-open', type: 'button', id: 'nav-open', 'aria-haspopup': 'dialog' }, 'Questions');
    prev.addEventListener('click', function () { s.prev(); showQuestion(); });
    next.addEventListener('click', function () {
      if (s.index() >= paper.questions.length - 1) return confirmSubmit(s);
      s.next();
      showQuestion();
    });
    navBtn.addEventListener('click', function () { openNavSheet(s); });
    var actions = h('div', { class: 'actionbar' }, [prev, navBtn, next]);
    // The action bar sits between the question and the navigator in the page, so the keyboard reaches Previous and
    // Next straight after the answer (not after all the navigator's buttons). It is position: fixed, so it takes no
    // grid cell and nothing moves on screen.
    screen('sit', h('div', { class: 'sit' }, [
      h('h1', { class: 'visually-hidden' }, paper.title),
      tabs,
      h('div', { class: 'sit-grid' }, [card, actions, aside])
    ]), false);

    function showQuestion(focus) {
      stopRecording();
      if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
      renderQuestion(s, card);
      refresh();
      keepInView(aside, navGrid.querySelector('.current'));
      window.scrollTo(0, 0);
      if (focus !== false) {
        var hd = document.getElementById('qh');
        if (hd) { try { hd.focus({ preventScroll: true }); } catch (e) { hd.focus(); } }
      }
    }
    function refresh() {
      var i = s.index();
      prev.disabled = i === 0;
      var lastQ = i >= paper.questions.length - 1;
      next.textContent = lastQ ? 'Submit' : 'Next';
      next.classList.toggle('is-submit', lastQ);
      renderTabs(s, tabs, showQuestion);
      renderNavGrid(s, navGrid, function (idx) { s.go(idx); showQuestion(); });
      var c = s.counts();
      navBtn.textContent = '';
      add(navBtn, [h('span', { class: 'nb-icon', 'aria-hidden': 'true' }), h('span', { class: 'nb-word' }, 'Questions'),
        h('span', { class: 'nb-count' }, c.answered + '/' + c.total)]);
      navBtn.setAttribute('aria-label', 'Questions, ' + c.answered + ' of ' + c.total + ' answered');
      var q = s.current();
      var flagBtn = card.querySelector('.flag-btn');
      if (flagBtn) {
        var on = !!s.attempt().flags[q.id];
        flagBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
        flagBtn.querySelector('.t').textContent = on ? 'Flagged' : 'Flag';
      }
      var clearBtn = card.querySelector('.clear-btn');
      if (clearBtn) clearBtn.disabled = !Core.hasResponse(q, s.attempt().answers[q.id], s.attempt()) || !s.canEdit(q.id);
    }
    ui.refresh = refresh;
    ui.showQuestion = showQuestion;
    showQuestion();     // focus goes to “Question N of M”, so a screen reader starts there after Start or a resume

    var total = timed ? paper.minutes * 60000 : 0;
    var lastLeft = timed ? s.remaining() : 0;
    ui.tick = setInterval(function () {
      if (s.tick()) {
        ui.autoNotice[paper.id] = true;
        closeDialogs();
        return go('#/' + paper.id + '/result', true);
      }
      if (timed) {
        var left = s.remaining();
        timerEl.textContent = Core.formatClock(left);
        timerEl.classList.toggle('low', left <= Math.min(5 * 60000, total * 0.2));
        [[10, '10 minutes left'], [5, '5 minutes left'], [1, '1 minute left']].forEach(function (w) {
          var at = w[0] * 60000;
          if (total > at && lastLeft > at && left <= at) say(w[1]);     // only when the clock crosses the mark
        });
        lastLeft = left;
      }
      tickTask(s, card);
    }, 250);
  }

  /* The desktop navigator scrolls inside itself when the paper is taller than the window: after Next, Previous or a
   * section tab, scroll it (not the page) so the current question shows. */
  function keepInView(box, el) {
    if (!el || !box.clientHeight || box.scrollHeight <= box.clientHeight) return;
    var b = box.getBoundingClientRect();
    var r = el.getBoundingClientRect();
    if (r.bottom > b.bottom - 12) box.scrollTop += r.bottom - b.bottom + 12;
    else if (r.top < b.top + 12) box.scrollTop -= b.top + 12 - r.top;
  }

  function navLegend() {
    return h('ul', { class: 'nav-legend', 'aria-hidden': 'true' }, [
      h('li', null, [h('span', { class: 'nq-dot answered' }), 'Answered']),
      h('li', null, [h('span', { class: 'nq-dot flagged' }), 'Flagged']),
      h('li', null, [h('span', { class: 'nq-dot' }), 'Blank'])
    ]);
  }

  function renderTabs(s, tabs, showQuestion) {
    var cur = s.current();
    tabs.innerHTML = '';
    s.sections().forEach(function (sec) {
      var b = h('button', { class: 'sec-tab', type: 'button', 'aria-current': cur.section === sec.id ? 'true' : null }, [
        h('span', { class: 'st-name' }, sec.title), h('span', { class: 'st-count' }, sec.answered + '/' + sec.count)
      ]);
      b.setAttribute('aria-label', sec.title + ', ' + sec.answered + ' of ' + sec.count + ' answered');
      b.addEventListener('click', function () { s.go(sec.first); showQuestion(); });
      tabs.appendChild(b);
    });
    var active = tabs.querySelector('[aria-current="true"]');
    if (active && active.scrollIntoView && tabs.scrollWidth > tabs.clientWidth) {
      tabs.scrollLeft = Math.max(0, active.offsetLeft - 16);
    }
  }

  function renderNavGrid(s, grid, onPick) {
    grid.innerHTML = '';
    var nav = s.navigator();
    var paper = s.paper;
    paper.sections.forEach(function (sec) {
      var items = nav.filter(function (n) { return n.section === sec.id; });
      grid.appendChild(h('p', { class: 'ng-sec' }, sec.title));
      var row = h('div', { class: 'ng-row' });
      items.forEach(function (n) {
        var state = (n.answered ? 'answered' : 'blank') + (n.flagged ? ', flagged' : '');
        var b = h('button', {
          class: 'nq' + (n.answered ? ' answered' : '') + (n.flagged ? ' flagged' : '') + (n.current ? ' current' : ''),
          type: 'button', 'aria-label': 'Question ' + n.n + ', ' + state, 'aria-current': n.current ? 'step' : null, 'data-n': n.n
        }, String(n.n));
        b.addEventListener('click', function () { onPick(n.index); });
        row.appendChild(b);
      });
      grid.appendChild(row);
    });
  }

  function openNavSheet(s) {
    var dlg = document.getElementById('nav-sheet');
    var grid = dlg.querySelector('.nav-grid');
    renderNavGrid(s, grid, function (idx) {
      s.go(idx);
      dlg.close();
      if (ui.showQuestion) ui.showQuestion();
    });
    var c = s.counts();
    dlg.querySelector('.ns-counts').textContent = c.answered + ' answered · ' + c.flagged + ' flagged · ' + c.blank + ' blank';
    dlg.showModal();
    var cur = grid.querySelector('.current') || grid.querySelector('button');
    if (cur) cur.focus();
  }

  function closeDialogs() {
    ['nav-sheet', 'confirm'].forEach(function (id) {
      var d = document.getElementById(id);
      if (d && d.open) d.close();
    });
  }

  function confirmSubmit(s) {
    var dlg = document.getElementById('confirm');
    var c = s.counts();
    var body = dlg.querySelector('.cf-body');
    body.innerHTML = '';
    add(body, [
      h('ul', { class: 'cf-counts' }, [
        h('li', null, [h('b', null, String(c.answered)), ' answered']),
        h('li', null, [h('b', null, String(c.flagged)), ' flagged']),
        h('li', null, [h('b', null, String(c.blank)), ' blank'])
      ]),
      s.attempt().deadline != null ? h('p', { class: 'cf-time' }, Core.formatClock(s.remaining()) + ' left.') : null
    ]);
    var ok = dlg.querySelector('.cf-submit');
    var fresh = ok.cloneNode(true);
    ok.parentNode.replaceChild(fresh, ok);
    fresh.addEventListener('click', function () {
      dlg.close();
      if (s.submit()) {
        progress.flush();
        go('#/' + s.paper.id + '/result', true);
      }
    });
    dlg.showModal();
    dlg.querySelector('.cf-cancel').focus();
  }

  // ---------------------------------------------------------------- one question
  function renderQuestion(s, card) {
    var paper = s.paper;
    var q = s.current();
    var a = s.attempt();
    var st = Core.stimulusOf(paper, q);
    var sec = paper.sections.filter(function (x) { return x.id === q.section; })[0];
    card.innerHTML = '';
    card.className = 'qcard' + (st ? ' has-stim' : '') + ' t-' + q.type;
    card.setAttribute('data-q', q.id);
    var head = h('div', { class: 'qhead' }, [
      h('h2', { id: 'qh', tabindex: '-1' }, ['Question ' + q.n, h('span', { class: 'of' }, ' of ' + paper.questions.length)]),
      h('span', { class: 'qsec visually-hidden' }, sec ? sec.title : '')
    ]);
    var stimEl = null;
    if (st) {
      var ph = s.taskPhase(q);
      // a read-then-write task shows its passage only while you read (and again once you check yours)
      var hideIt = q.prep_seconds && (ph === 'ready' || ph === 'main' || ph === 'done') && !a.revealed[q.id];
      stimEl = h('div', { class: 'q-stim' }, hideIt ? h('p', { class: 'stim-hidden' }, ph === 'ready' ?
        'The passage shows when you tap Start.' : 'The passage is hidden now. Write what you remember.') : renderStimulus(paper, st));
    }
    card._phase = s.taskPhase(q);
    var main = h('div', { class: 'q-main' }, [
      h('div', { class: 'stem', id: 'stem' }, paras(q.stem, 'stem-p')),
      answerArea(s, q, a),
      h('div', { class: 'qtools' }, [
        h('button', { class: 'tool-btn flag-btn', type: 'button', 'aria-pressed': a.flags[q.id] ? 'true' : 'false',
          onclick: function () { s.flag(q.id); ui.refresh(); } }, [icon('flag'), h('span', { class: 't' }, a.flags[q.id] ? 'Flagged' : 'Flag')]),
        Core.isSelfChecked(q) ? null : h('button', { class: 'tool-btn clear-btn', type: 'button',
          onclick: function () {
            s.clear(q.id);
            renderQuestion(s, card);
            ui.refresh();
          } }, h('span', { class: 't' }, 'Clear'))
      ])
    ]);
    add(card, [head, h('div', { class: 'q-body' }, [stimEl, main])]);
    drawCharts(card);
  }

  function answerArea(s, q, a) {
    var v = a.answers[q.id];
    var editable = s.canEdit(q.id);
    if (q.type === 'single') {
      var longest = Math.max.apply(null, q.options.map(function (o) { return o.text.length; }));
      var grid = q.options.length >= 4 ? (longest <= 12 ? ' grid grid-narrow' : longest <= 24 ? ' grid' : '') : '';
      var fs = h('fieldset', { class: 'options' + grid, 'aria-labelledby': 'stem' }, [
        h('legend', { class: 'visually-hidden' }, 'Choose one')
      ]);
      // the CSS puts options two to a row only where the longest fits on one line (CSSOM, so a strict CSP allows it)
      if (grid) fs.style.setProperty('--olen', longest);
      q.options.forEach(function (o) {
        var input = h('input', { type: 'radio', name: 'opt-' + q.id, value: o.id, id: 'o-' + q.id + '-' + o.id, disabled: !editable });
        if (v === o.id) input.checked = true;
        input.addEventListener('change', function () {
          if (input.checked) { s.answer(q.id, o.id); ui.refresh(); }
        });
        fs.appendChild(h('label', { class: 'opt', for: 'o-' + q.id + '-' + o.id }, [
          input, h('span', { class: 'letter', 'aria-hidden': 'true' }, o.id.toUpperCase()), h('span', { class: 'otext' }, o.text)
        ]));
      });
      return fs;
    }
    if (q.type === 'numeric') {
      var unit = q.answer.unit || '';
      var pre = unit === '₹' || /^₹/.test(unit) ? '₹' : '';
      var post = pre ? unit.replace(/^₹\s*/, '') : unit;
      var hint = h('p', { class: 'field-hint', id: 'hint-' + q.id, 'aria-live': 'polite' });
      var inp = h('input', { type: 'text', inputmode: 'decimal', id: 'ans-' + q.id, autocomplete: 'off', spellcheck: 'false',
        'aria-describedby': 'hint-' + q.id, enterkeyhint: 'next', disabled: !editable });
      inp.value = v || '';
      var check = function () {
        hint.textContent = inp.value.trim() && Core.parseNumber(inp.value) === null ? 'Type a number, like 4,500 or 12.5' : '';
      };
      inp.addEventListener('input', function () { s.answer(q.id, inp.value); check(); ui.refresh(); });
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('next').click(); } });
      check();
      return h('div', { class: 'field' }, [
        h('label', { for: 'ans-' + q.id }, 'Your answer'),
        h('div', { class: 'numrow' }, [pre ? h('span', { class: 'unit pre', 'aria-hidden': 'true' }, pre) : null, inp,
          post ? h('span', { class: 'unit post' }, post) : null]),
        hint
      ]);
    }
    if (q.type === 'text') {
      var t = h('input', { type: 'text', id: 'ans-' + q.id, autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off',
        spellcheck: 'false', enterkeyhint: 'next', disabled: !editable });
      t.value = v || '';
      t.addEventListener('input', function () { s.answer(q.id, t.value); ui.refresh(); });
      t.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('next').click(); } });
      return h('div', { class: 'field' }, [h('label', { for: 'ans-' + q.id }, 'Your answer'), t]);
    }
    if (q.type === 'dictation') return dictationArea(s, q, v, editable);
    if (q.type === 'speak') return speakArea(s, q);
    return writeArea(s, q, v, editable);
  }

  function playButton(s, q, label, onPlayed) {
    var left = s.playsLeft(q.id);
    var btn = h('button', { class: 'btn accent play-btn', type: 'button', id: 'play-' + q.id, disabled: left <= 0 || !s.canEdit(q.id) }, label);
    var info = h('span', { class: 'plays', id: 'plays-' + q.id }, left > 0 ? plural(left, 'play', 'plays') + ' left' : 'No plays left');
    btn.addEventListener('click', function () {
      if (s.playsLeft(q.id) <= 0) return;
      btn.disabled = true;
      s.notePlay(q.id);
      var after = function () {
        var l = s.playsLeft(q.id);
        btn.disabled = l <= 0;
        info.textContent = l > 0 ? plural(l, 'play', 'plays') + ' left' : 'No plays left';
        if (onPlayed) onPlayed();
      };
      btn.textContent = 'Playing…';
      Speech.speak(q.say, function () { btn.textContent = label; after(); });
    });
    return h('div', { class: 'listen' }, [btn, info]);
  }

  /* No voice in this browser: show the sentence for a few seconds instead (counts as a play). */
  function showOnceButton(s, q, onShown) {
    var shown = h('p', { class: 'shown-text', hidden: true, 'aria-live': 'polite' });
    var left = s.playsLeft(q.id);
    var btn = h('button', { class: 'btn accent', type: 'button', id: 'play-' + q.id, disabled: left <= 0 || !s.canEdit(q.id) }, 'Show');
    var info = h('span', { class: 'plays' }, left > 0 ? plural(left, 'look', 'looks') + ' left' : 'No looks left');
    btn.addEventListener('click', function () {
      if (s.playsLeft(q.id) <= 0) return;
      s.notePlay(q.id);
      btn.disabled = true;
      shown.textContent = q.say;
      shown.hidden = false;
      setTimeout(function () {
        shown.hidden = true;
        shown.textContent = '';
        var l = s.playsLeft(q.id);
        btn.disabled = l <= 0;
        info.textContent = l > 0 ? plural(l, 'look', 'looks') + ' left' : 'No looks left';
        if (onShown) onShown();
      }, Math.max(4000, q.say.split(/\s+/).length * 450));
    });
    return h('div', { class: 'listen fallback' }, [
      h('p', { class: 'fallback-note' }, q.type === 'dictation'
        ? 'This browser can’t read aloud. Tap Show, read the sentence once, then type it from memory.'
        : 'This browser can’t read aloud. Tap Show, read it once, then say your answer out loud.'),
      h('div', { class: 'listen-row' }, [btn, info]), shown
    ]);
  }

  function voiceArea(s, q, label, onPlayed) {
    var slot = h('div', { class: 'voice-slot' }, h('p', { class: 'muted small' }, 'Getting the voice ready…'));
    Speech.ready().then(function (voice) {
      slot.innerHTML = '';
      slot.appendChild(voice ? playButton(s, q, label, onPlayed) : showOnceButton(s, q, onPlayed));
    });
    return slot;
  }

  function dictationArea(s, q, v, editable) {
    var ta = h('textarea', { id: 'ans-' + q.id, rows: '3', autocomplete: 'off', autocapitalize: 'sentences', autocorrect: 'off',
      spellcheck: 'false', disabled: !editable });
    ta.value = v || '';
    ta.addEventListener('input', function () { s.answer(q.id, ta.value); ui.refresh(); });
    return h('div', { class: 'field dictation' }, [
      voiceArea(s, q, 'Listen'),
      q.seconds ? taskRow(s, q, ta) : null,
      h('label', { for: 'ans-' + q.id }, 'Type what you hear'),
      ta,
      q.seconds ? h('p', { class: 'task-done notice', hidden: s.taskPhase(q) !== 'done' }, 'Time’s up for this task.') : null
    ]);
  }

  var MAIN_WORD = { speak: 'Speak', write: 'Write', dictation: 'Type' };
  function prepWord(q) { return q.type === 'write' && q.stimulus ? 'Read' : 'Plan'; }

  /* The task's clock: before it starts, the time it allows; then each phase counting down. */
  function taskTimerEl(s, q) {
    if (!q.seconds) return null;
    var el = h('div', { class: 'task-timer', id: 'task-' + q.id, role: 'timer', 'aria-label': 'Task time' },
      [h('span', { class: 'tt-label' }), ' ', h('b')]);
    paintTask(s, q, el);
    return el;
  }
  function paintTask(s, q, el) {
    var ph = s.taskPhase(q);
    var rem = s.taskRemaining(q);
    var label;
    if (ph === 'ready') {
      label = q.prep_seconds ? prepWord(q) + ' ' + Core.formatClock(q.prep_seconds * 1000) + ', then ' +
        MAIN_WORD[q.type].toLowerCase() : q.type === 'dictation' ? 'Time to type' : 'Time for this task';
      rem = q.seconds * 1000;
    } else if (ph === 'prep') label = prepWord(q);
    else if (ph === 'main') label = MAIN_WORD[q.type];
    else label = 'Time’s up';
    var phaseLen = (ph === 'prep' ? q.prep_seconds : q.seconds) * 1000;
    el.className = 'task-timer' + (ph === 'prep' || ph === 'main' ? ' running' : '') + (ph === 'done' ? ' done' : '') +
      ((ph === 'prep' || ph === 'main') && rem <= Math.min(10000, phaseLen * 0.3) ? ' low' : '');
    el.querySelector('.tt-label').textContent = label;
    el.querySelector('b').textContent = Core.formatClock(rem);
  }

  /* The timer row: prep tasks need Start (the passage or plan time begins); other timed tasks offer Time me. */
  function taskRow(s, q, focusAfter) {
    var ph = s.taskPhase(q);
    var kids = [taskTimerEl(s, q)];
    if (ph === 'ready' && q.type !== 'dictation') {
      var b = q.prep_seconds ?
        h('button', { class: 'btn accent small task-start', type: 'button', id: 'time-' + q.id }, 'Start') :
        h('button', { class: 'link-btn time-me', type: 'button', id: 'time-' + q.id }, 'Time me');
      b.addEventListener('click', function () {
        startTaskTimer(s, q);
        if (q.prep_seconds) { var card = document.getElementById('qcard'); renderQuestion(s, card); ui.refresh(); }
        else if (focusAfter) focusAfter.focus();
      });
      kids.push(b);
    }
    return h('div', { class: 'task-row' }, kids);
  }
  function startTaskTimer(s, q) {
    s.startTask(q.id);
    var tt = document.getElementById('task-' + q.id);
    if (tt) paintTask(s, q, tt);
    var tb = document.getElementById('time-' + q.id);
    if (tb) tb.hidden = true;
  }

  function tickTask(s, card) {
    var q = s.current();
    if (!q || !q.seconds) return;
    var ph = s.taskPhase(q);
    if (ph !== card._phase) {
      var was = card._phase;
      if (ph === 'main' && was === 'prep') say(MAIN_WORD[q.type] + ' now.');
      if (ph === 'done') { stopRecording(); say('Time’s up for this task.'); }
      var focusBox = ph === 'main' && q.type === 'write';
      renderQuestion(s, card);
      ui.refresh();
      if (focusBox) { var box = card.querySelector('textarea'); if (box) box.focus(); }
      return;
    }
    var el = document.getElementById('task-' + q.id);
    if (el) paintTask(s, q, el);
  }

  function selfCheck(s, q) {
    var a = s.attempt();
    var revealed = !!a.revealed[q.id];
    var wrap = h('div', { class: 'selfcheck', id: 'sc-' + q.id });
    var ph = s.taskPhase(q);
    if (!revealed && q.prep_seconds && (ph === 'ready' || ph === 'prep')) return wrap;   // the model waits until you have tried
    if (!revealed) {
      var b = h('button', { class: 'btn ghost check-btn', type: 'button' }, 'Check yours');
      b.addEventListener('click', function () {
        stopRecording();
        s.reveal(q.id);
        var card = document.getElementById('qcard');
        renderQuestion(s, card);
        ui.refresh();
        var m = document.getElementById('model-' + q.id);
        if (m) { m.setAttribute('tabindex', '-1'); m.focus(); }
      });
      wrap.appendChild(b);
      return wrap;
    }
    var checks = a.checks[q.id] || [];
    add(wrap, [
      h('div', { class: 'model', id: 'model-' + q.id }, [h('h3', null, 'Model answer'), paras(q.answer.model)]),
      h('fieldset', { class: 'checklist' }, [h('legend', null, 'Did yours do this?')].concat(q.answer.checklist.map(function (c, i) {
        var id = 'ck-' + q.id + '-' + i;
        var cb = h('input', { type: 'checkbox', id: id });
        cb.checked = !!checks[i];
        cb.addEventListener('change', function () { s.check(q.id, i, cb.checked); });
        return h('label', { class: 'ck', for: id }, [cb, h('span', null, c)]);
      })))
    ]);
    return wrap;
  }

  function speakArea(s, q) {
    var a = s.attempt();
    var revealed = !!a.revealed[q.id];
    var parts = [];
    if (q.say) parts.push(voiceArea(s, q, 'Listen'));
    if (q.seconds && !revealed) parts.push(taskRow(s, q, null));
    var audioSlot = h('div', { class: 'playback', id: 'playback-' + q.id });
    var showRecording = function () {
      var url = ui.recordings[q.id];
      var slot = document.getElementById('playback-' + q.id) || audioSlot;
      slot.innerHTML = '';
      if (url) slot.appendChild(h('audio', { controls: true, src: url, 'aria-label': 'Your recording' }));
    };
    if (ui.recordings[q.id]) showRecording();
    if (!revealed) {
      var rec = h('div', { class: 'recorder' });
      if (canRecord()) {
        var recBtn = h('button', { class: 'btn ghost rec-btn', type: 'button', id: 'rec-' + q.id },
          [icon('mic'), h('span', { class: 't' }, ui.recordings[q.id] ? 'Record again' : 'Record yourself')]);
        recBtn.addEventListener('click', function () {
          if (ui.recorder && ui.recorder.rec && ui.recorder.rec.state === 'recording') { stopRecording(); return; }
          navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
            var chunks = [];
            var mr = new window.MediaRecorder(stream);
            ui.recorder = { rec: mr, q: q.id };
            mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
            mr.onstop = function () {
              stream.getTracks().forEach(function (t) { t.stop(); });
              var btn = document.getElementById('rec-' + q.id);
              if (btn) { btn.classList.remove('on'); btn.querySelector('.t').textContent = 'Record again'; }
              if (chunks.length) {
                if (ui.recordings[q.id]) URL.revokeObjectURL(ui.recordings[q.id]);
                ui.recordings[q.id] = URL.createObjectURL(new Blob(chunks, { type: mr.mimeType || 'audio/webm' }));
                showRecording();
              }
            };
            mr.start();
            if (q.seconds && !q.prep_seconds && s.taskPhase(q) === 'ready') startTaskTimer(s, q);
            recBtn.classList.add('on');
            recBtn.querySelector('.t').textContent = 'Stop';
          }).catch(function () {
            var slot = document.getElementById('playback-' + q.id) || audioSlot;
            slot.innerHTML = '';
            slot.appendChild(h('p', { class: 'muted small' }, 'The microphone is blocked. Speak aloud anyway, then check yours.'));
          });
        });
        rec.appendChild(recBtn);
      }
      parts.push(rec);
      parts.push(h('p', { class: 'task-done notice', hidden: !s.taskExpired(q) }, 'Time’s up for this task.'));
    }
    parts.push(audioSlot);
    parts.push(selfCheck(s, q));
    return h('div', { class: 'field speak' }, parts);
  }

  function writeArea(s, q, v, editable) {
    var ta = h('textarea', { id: 'ans-' + q.id, rows: '9', autocomplete: 'off', spellcheck: 'true', disabled: !editable,
      'aria-describedby': 'wc-' + q.id });
    ta.value = v || '';
    var wc = h('p', { class: 'wordcount', id: 'wc-' + q.id }, plural(Core.wordCount(ta.value), 'word', 'words'));
    ta.addEventListener('input', function () {
      s.answer(q.id, ta.value);
      wc.textContent = plural(Core.wordCount(ta.value), 'word', 'words');
      ui.refresh();
    });
    var timerRow = q.seconds && !s.attempt().revealed[q.id] ? taskRow(s, q, ta) : null;
    return h('div', { class: 'field write' }, [
      timerRow,
      h('label', { for: 'ans-' + q.id }, 'Your answer'),
      ta, wc,
      h('p', { class: 'task-done notice', hidden: !s.taskExpired(q) || !!s.attempt().revealed[q.id] }, 'Time’s up for this task.'),
      selfCheck(s, q)
    ]);
  }

  // ---------------------------------------------------------------- result
  function renderResult(s, entry) {
    setBar('home');
    var paper = s.paper;
    setTitle(paper.title + ': result');
    var res = s.result();
    var last = s.lastEntry();
    var best = s.best();
    var auto = ui.autoNotice[paper.id] || (last && last.auto);
    var hasScore = res.max > 0;
    var retake = h('button', { class: 'btn ghost', type: 'button', id: 'retake' }, 'Retake');
    retake.addEventListener('click', function () { go('#/' + paper.id); });
    var stats = hasScore ? h('dl', { class: 'stats' }, [
      ['Right', res.right], ['Wrong', res.wrong], ['Blank', res.blank],
      ['Accuracy', res.accuracy == null ? '–' : res.accuracy + '%'],
      ['Time', last ? Core.formatDuration(last.usedMs) : '–']
    ].map(function (x) { return h('div', null, [h('dt', null, x[0]), h('dd', null, String(x[1]))]); })) : null;
    var secs = hasScore ? h('ul', { class: 'sec-scores' }, res.sections.filter(function (x) { return x.max > 0; }).map(function (x) {
      var pct = x.max ? Math.max(0, x.score) / x.max * 100 : 0;
      return h('li', null, [
        h('div', { class: 'ss-top' }, [h('span', { class: 'ss-name' }, x.title), h('span', { class: 'ss-val' }, score(x.score) + ' / ' + score(x.max))]),
        h('div', { class: 'ss-bar', 'aria-hidden': 'true' }, h('i', { style: { width: pct.toFixed(1) + '%' } })),
        h('p', { class: 'ss-detail' }, x.right + ' right · ' + x.wrong + ' wrong · ' + x.blank + ' blank')
      ]);
    })) : null;
    screen('result', h('div', { class: 'wrap' }, [
      h('a', { class: 'back-link', href: '#/' }, 'All papers'),
      h('h1', null, paper.title),
      auto ? h('p', { class: 'notice' }, 'Time’s up. Your paper was submitted.') : null,
      hasScore ? h('div', { class: 'score-card' }, [
        h('p', { class: 'sc-label' }, 'Your score'),
        h('p', { class: 'sc-big' }, [h('span', { class: 'sc-num' }, score(res.score)), h('span', { class: 'sc-max' }, ' / ' + score(res.max))]),
        h('p', { class: 'sc-mark' }, markingWords(paper.marking))
      ]) : null,
      stats,
      hasScore ? h('h2', null, 'By section') : null,
      secs,
      res.selfTotal ? h('p', { class: 'self-line' }, 'Speaking and writing: ' + res.selfDone + ' of ' + res.selfTotal + ' checked.') : null,
      h('p', { class: 'padam-line' }, 'Read every reason, even for the ones you got right.'),
      h('a', { class: 'btn accent block', href: '#/' + paper.id + '/review', id: 'review-btn' }, 'Review answers'),
      h('div', { class: 'after' }, [retake,
        best && s.state().history.length > 1 && hasScore ? h('p', { class: 'history' }, ['Best ', h('b', null, score(best.score) + ' / ' + score(best.max)),
          ' · ' + plural(s.state().history.length, 'attempt', 'attempts')]) : null])
    ]));
    delete ui.autoNotice[paper.id];
  }

  // ---------------------------------------------------------------- review
  var FILTER_LABELS = { all: 'All', wrong: 'Wrong', blank: 'Blank', flagged: 'Flagged' };
  var STATUS_LABELS = { right: 'Right', wrong: 'Wrong', blank: 'Blank', self: 'Self-checked', 'blank-self': 'Not done' };

  function renderReview(s, entry, filter) {
    setBar('home');
    var paper = s.paper;
    setTitle(paper.title + ': review');
    var rv = s.review(filter);
    var filters = h('div', { class: 'filters', role: 'group', 'aria-label': 'Show' }, Core.FILTERS.map(function (f) {
      return h('a', { class: 'filter', href: '#/' + paper.id + '/review?f=' + f, 'aria-current': rv.filter === f ? 'true' : null },
        [FILTER_LABELS[f], ' ', h('span', { class: 'fc' }, String(rv.counts[f]))]);
    }));
    var shownStim = {};
    var list = h('ol', { class: 'rv-list' }, rv.items.map(function (it) {
      var st = Core.stimulusOf(paper, it.q);
      var stimEl = null;
      if (st) {
        stimEl = renderStimulus(paper, st, { open: false });
        shownStim[st.id] = true;
      }
      return h('li', { class: 'rv rv-' + it.status, id: 'rv-' + it.n }, [
        h('div', { class: 'rv-head' }, [
          h('span', { class: 'rv-n' }, 'Q' + it.n),
          h('span', { class: 'rv-sec' }, (paper.sections.filter(function (x) { return x.id === it.section; })[0] || {}).title || ''),
          it.flagged ? h('span', { class: 'rv-flag' }, [icon('flag'), 'Flagged']) : null,
          h('span', { class: 'badge b-' + it.status }, [it.status === 'right' ? icon('tick') : it.status === 'wrong' ? icon('cross') : null,
            STATUS_LABELS[it.status]])
        ]),
        stimEl,
        h('div', { class: 'stem' }, paras(it.q.stem, 'stem-p')),
        reviewAnswer(it, s),
        h('div', { class: 'why' }, [h('p', null, [h('b', null, 'Why: '), it.q.reason])]),
        it.q.working ? h('div', { class: 'working' }, [h('p', null, [h('b', null, 'Working: '), lines(it.q.working)])]) : null
      ]);
    }));
    var retake = h('button', { class: 'btn accent block', type: 'button', id: 'retake-review' }, 'Retake');
    retake.addEventListener('click', function () { go('#/' + paper.id); });
    screen('review', h('div', { class: 'wrap wide' }, [
      h('a', { class: 'back-link', href: '#/' + paper.id + '/result' }, 'Result'),
      h('h1', null, ['Review ', h('span', { class: 'h1-sub' }, paper.title)]),
      filters,
      rv.items.length ? list : h('p', { class: 'empty' }, rv.filter === 'wrong' ? 'None wrong. Well done.' : 'Nothing here.'),
      retake
    ]));
    drawCharts();
  }

  function reviewAnswer(it, s) {
    var q = it.q;
    if (q.type === 'single') {
      return h('ul', { class: 'rv-options' }, q.options.map(function (o) {
        var isKey = o.id === q.answer;
        var isYours = o.id === it.response;
        var cls = 'rv-opt' + (isKey ? ' key' : '') + (isYours && !isKey ? ' chosen-wrong' : '') + (isYours ? ' yours' : '');
        return h('li', { class: cls }, [
          h('span', { class: 'letter' }, o.id.toUpperCase()),
          h('span', { class: 'otext' }, o.text),
          isKey || isYours ? h('span', { class: 'rv-tags' }, [
            isYours ? h('span', { class: 'tag-yours' }, 'Your answer') : null,
            isKey ? h('span', { class: 'tag-key' }, [icon('tick'), 'Right answer']) : null
          ]) : null
        ]);
      }));
    }
    if (q.type === 'numeric' || q.type === 'text') {
      return h('dl', { class: 'rv-typed' }, [
        h('div', null, [h('dt', null, 'Your answer'), h('dd', { class: it.status === 'right' ? 'ok' : it.status === 'wrong' ? 'no' : '' }, it.yours ? it.yours.text : 'Blank')]),
        h('div', null, [h('dt', null, 'Right answer'), h('dd', { class: 'ok' }, [it.key.text,
          it.key.also && it.key.also.length ? h('span', { class: 'also' }, ' (also: ' + it.key.also.join(', ') + ')') : null])])
      ]);
    }
    if (q.type === 'dictation') {
      var diff = it.diff;
      return h('div', { class: 'rv-dictation' }, [
        h('dl', { class: 'rv-typed' }, [
          h('div', null, [h('dt', null, 'Sentence'), h('dd', { class: 'ok' }, q.answer.text)]),
          h('div', null, [h('dt', null, 'You typed'), h('dd', null, it.response ? it.response : 'Blank')])
        ]),
        diff && it.status === 'wrong' ? h('div', { class: 'diff' }, [
          h('p', { class: 'diff-key' }, 'Struck out: what you typed wrong. Underlined: the right word.'),
          h('p', { class: 'diff-words' }, diff.map(function (d) {
            if (d.op === 'ok') return h('span', null, d.want + ' ');
            if (d.op === 'missing') return h('span', null, [h('ins', null, d.want), ' ']);
            if (d.op === 'extra') return h('span', null, [h('del', null, d.got), ' ']);
            return h('span', null, [h('del', null, d.got), ' ', h('ins', null, d.want), ' ']);
          }))
        ]) : null
      ]);
    }
    var checks = it.checks || [];
    return h('div', { class: 'rv-self' }, [
      q.type === 'write' ? h('div', { class: 'yours-text' }, [h('h3', null, 'Your answer'),
        it.response ? paras(it.response) : h('p', { class: 'muted' }, 'Not written.')]) : null,
      q.say ? h('p', { class: 'said' }, [h('b', null, 'The voice said: '), '“' + q.say + '”']) : null,
      h('div', { class: 'model' }, [h('h3', null, 'Model answer'), paras(q.answer.model)]),
      h('ul', { class: 'rv-checks' }, q.answer.checklist.map(function (c, i) {
        return h('li', { class: checks[i] ? 'done' : '' }, [h('span', { class: 'visually-hidden' }, checks[i] ? 'Ticked: ' : 'Not ticked: '), c]);
      }))
    ]);
  }

  // ---------------------------------------------------------------- boot
  function gate() {
    var g = window.MSCGate;
    if (!g || typeof g.check !== 'function') return Promise.resolve(true);
    var timeout = new Promise(function (resolve) { setTimeout(function () { resolve(true); }, 4000); });
    var check;
    try { check = Promise.resolve(g.check(COURSE)); } catch (e) { check = Promise.resolve(true); }
    return Promise.race([check.then(function (ok) { return ok !== false; }, function () { return true; }), timeout]);
  }

  function renderGate() {
    setBar('home');
    if (window.MSCGate && typeof window.MSCGate.deny === 'function') { window.MSCGate.deny(COURSE); return; }
    screen('gate', h('div', { class: 'wrap' }, [
      h('h1', null, 'For programme students'),
      h('p', { class: 'lead' }, 'Log in with the account you joined the MSC Articleship Program with.')
    ]));
  }

  function boot() {
    document.getElementById('nav-sheet').querySelector('.ns-close').addEventListener('click', function () {
      document.getElementById('nav-sheet').close();
    });
    document.getElementById('confirm').querySelector('.cf-cancel').addEventListener('click', function () {
      document.getElementById('confirm').close();
    });
    ['nav-sheet', 'confirm'].forEach(function (id) {
      var d = document.getElementById(id);
      d.addEventListener('click', function (e) { if (e.target === d) d.close(); });   // tap outside closes
    });
    window.addEventListener('pagehide', function () { progress.flush(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') progress.flush();
      else {
        var r = parse();
        if (r.id && sessions[r.id] && sessions[r.id].tick()) {
          ui.autoNotice[r.id] = true;
          closeDialogs();
          if (r.view === 'sit' || r.view === null) go('#/' + r.id + '/result', true);
        }
      }
    });
    window.addEventListener('storage', function (e) {
      if (!e.key || e.key.indexOf(Core.KEY_PREFIX + '.') !== 0 || e.key.indexOf('.cache.') >= 0) return;
      var id = e.key.slice(Core.KEY_PREFIX.length + 1);
      if (sessions[id]) { sessions[id].reload(); if (parse().id === id || !parse().id) route(); }
      else if (!parse().id) route();
    });
    gate().then(function (ok) {
      if (!ok) return renderGate();
      loadManifest().then(function () {
        window.addEventListener('hashchange', route);
        route();
      }, function () { renderError(); });
    });
  }

  boot();
}());
