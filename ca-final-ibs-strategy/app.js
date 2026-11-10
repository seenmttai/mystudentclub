/* CA Final IBS toolkit page. Static data in ./data, rendered client-side. No login, no database. */
(function () {
  'use strict';

  var V = '20261111.1';
  var DL_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';

  function $(s, el) { return (el || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function getJSON(path) {
    return fetch(path + '?v=' + V).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }
  function size(kb) {
    if (!kb) return '';
    return kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB';
  }
  function track(name, params) {
    try { if (window.gtag) window.gtag('event', name, params || {}); } catch (e) { /* analytics is optional */ }
  }
  // Light formatting for answers: keeps line breaks, bolds **x**.
  function rich(s) {
    return esc(s)
      .replace(/-&gt;/g, '→')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/^((?:Provisions?|Analysis|Conclusion|Working(?: notes?)?|Facts|Treatment|Journal entr(?:y|ies)|Answer|Note|Step \d+)[^\n]{0,40}?):?$/gm, '<b>$1</b>');
  }
  function makeTabs(host, items, onPick, key) {
    host.innerHTML = items.map(function (it, i) {
      return '<button class="tab" role="tab" type="button" data-i="' + i + '" aria-selected="' + (i === 0) + '">' + esc(it.label) + '</button>';
    }).join('');
    host.addEventListener('click', function (e) {
      var b = e.target.closest('.tab');
      if (!b) return;
      host.querySelectorAll('.tab').forEach(function (t) { t.setAttribute('aria-selected', String(t === b)); });
      onPick(items[+b.dataset.i]);
      if (key) track(key, { item: items[+b.dataset.i].label });
    });
    if (items.length) onPick(items[0]);
  }

  /* ---------- 1. indexes ---------- */
  // Files come pre-ordered in data/indexes.json (Padam's faculty order per subject).
  function renderIndexes(d) {
    var panel = $('#idx-panel');
    var subjects = d.subjects.filter(function (s) {
      return d.files.some(function (f) { return f.subject === s.id; });
    });
    makeTabs($('#idx-tabs'), subjects, function (s) {
      var files = d.files.filter(function (f) { return f.subject === s.id; });
      var head = '<div class="idx-head"><p>' + files.length + ' file' + (files.length > 1 ? 's' : '') + (s.hint ? ' · ' + esc(s.hint) : '') + '</p></div>';
      panel.innerHTML = head + files.map(function (f) {
        var meta = [f.for_book, f.pages ? f.pages + ' pages' : '', size(f.size_kb)].filter(Boolean).join(' · ');
        return '<div class="idx' + (f.best ? ' best' : '') + '"><div><h4>' + esc(f.title) +
          (f.best ? '<span class="badge best">My pick</span>' : '') + (f.sm ? '<span class="badge sm">SM index</span>' : '') + '</h4>' +
          '<p class="meta"><b>' + esc(f.faculty) + '</b>' + (meta ? ' · ' + esc(meta) : '') + '</p>' +
          (f.note ? '<p class="note">' + esc(f.note) + '</p>' : '') + '</div>' +
          '<a class="dl" href="' + esc(f.path) + '" download data-file="' + esc(f.title) + '">' + DL_ICON + ' Download</a></div>';
      }).join('');
    }, 'ibs_index_tab');
  }

  /* ---------- one short form before the first download ---------- */
  // Saved to resource_access_logs, the same table and fields the other resource pages use
  // (scripts/resource-form-collector.js), filed under the CA Fresher stage.
  var SB_URL = 'https://auth.mystudentclub.com/rest/v1/resource_access_logs';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6c2dnZHRkaWFjeGRzampuY2RxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg1OTEzNjUsImV4cCI6MjA1NDE2NzM2NX0.FVKBJG-TmXiiYzBDjGIRBM2zg-DYxzNP--WM6q2UMt0';
  var LEAD_KEY = 'msc_ibs_lead';
  function getLead() {
    try { return JSON.parse(localStorage.getItem(LEAD_KEY) || 'null'); } catch (e) { return null; }
  }
  function setLead(v) {
    try { localStorage.setItem(LEAD_KEY, JSON.stringify(v)); } catch (e) { /* private mode: ask again next time */ }
    leadInMemory = v;
  }
  var leadInMemory = getLead();
  function showName() {
    var l = leadInMemory;
    var el = $('#ca-name');
    if (el && l && l.name) el.textContent = l.name.split(/\s+/)[0];
    var when = $('#ca-when');
    var m = l && /^(May|Nov) (\d{4})$/.exec(l.attempt || '');
    if (when && m) when.textContent = m[1] + "'" + m[2].slice(2);
  }
  function saveLead(row) {
    var post = function (body) {
      return fetch(SB_URL, {
        method: 'POST',
        headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body)
      });
    };
    return post(row).then(function (r) {
      if (r.ok) return;
      // older table without the stage column: save without it, like the shared collector does
      var copy = Object.assign({}, row); delete copy.stage;
      return post(copy);
    }).catch(function () { /* never block a download on the lead write */ });
  }
  var pendingLink = null;
  function openLead(a) {
    pendingLink = a;
    var m = $('#lead');
    m.hidden = false;
    document.body.classList.add('modal-open');
    setTimeout(function () { m.querySelector('input').focus(); }, 50);
    track('ibs_form_open', { file: a.dataset.file });
  }
  function closeLead() {
    $('#lead').hidden = true;
    document.body.classList.remove('modal-open');
  }
  function startDownload(a) {
    var b = document.createElement('a');
    b.href = a.href;
    b.setAttribute('download', '');
    document.body.appendChild(b);
    b.click();
    b.remove();
    track('ibs_download', { file: a.dataset.file });
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[download][data-file]');
    if (!a) return;
    if (leadInMemory) { track('ibs_download', { file: a.dataset.file }); return; }
    e.preventDefault();
    openLead(a);
  });
  (function wireForm() {
    var m = $('#lead'), f = $('#lead-form'), err = $('#lead-err');
    if (!m || !f) return;
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-close]')) closeLead(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !m.hidden) closeLead(); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = f.name.value.trim(), phone = f.phone.value.replace(/[^\d+]/g, ''), email = f.email.value.trim();
      var attempt = f.attempt.value;
      var digits = phone.replace(/\D/g, '').slice(-10);
      if (name.length < 2) { err.textContent = 'Please write your name.'; return; }
      if (!/^[6-9]\d{9}$/.test(digits)) { err.textContent = 'Please enter a 10-digit mobile number.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = 'Please enter a valid email.'; return; }
      if (!attempt) { err.textContent = 'Please select your CA Final attempt.'; return; }
      err.textContent = '';
      var a = pendingLink;
      var row = {
        name: name, email: email, phone: digits,
        // the table has no attempt column, so the attempt rides in the program label
        program_type: 'ca-fresher', program_display: 'CA Final IBS Toolkit (Nov 2026) · CA Final attempt: ' + attempt,
        resource_title: a ? a.dataset.file : 'IBS toolkit', resource_url: a ? a.href : location.href,
        accessed_at: new Date().toISOString(),
        // Nov 2026 candidates are the pre-result CA Fresher batch; later attempts are semi-qualified
        stage: attempt === 'Nov 2026' ? 'ca-fresher' : 'semi-qualified'
      };
      setLead({ name: name, attempt: attempt, at: Date.now() });
      saveLead(row);
      track('ibs_form_submit', {});
      closeLead();
      showName();
      if (a) startDownload(a);
    });
  })();
  showName();

  /* ---------- 3. analysis ---------- */
  function renderAnalysis(a) {
    var papers = a.papers;
    var rows = a.subjects.map(function (s) {
      var vals = papers.map(function (p) { return (a.marks[s] && a.marks[s][p.id]) || 0; });
      var tot = vals.reduce(function (x, y) { return x + y; }, 0);
      return { s: s, vals: vals, avg: tot / papers.length };
    }).sort(function (x, y) { return y.avg - x.avg; });
    var colTot = papers.map(function (_, i) { return rows.reduce(function (t, r) { return t + r.vals[i]; }, 0); });
    var html = '<table class="an-table"><thead><tr><th>Marks available (all 5 cases)</th>' +
      papers.map(function (p) { return '<th>' + esc(p.label) + '</th>'; }).join('') + '<th>Average</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.s) + '</td>' + r.vals.map(function (v) {
          return '<td' + (v >= 25 ? ' class="hot"' : '') + '>' + (v || '–') + '</td>';
        }).join('') + '<td><b>' + r.avg.toFixed(1) + '</b></td></tr>';
      }).join('') + '</tbody><tfoot><tr><td>Total</td>' + colTot.map(function (t) { return '<td>' + t + '</td>'; }).join('') + '<td></td></tr></tfoot></table>' +
      (a.note ? '<p class="an-note">' + esc(a.note) + '</p>' : '') +
      (a.insights && a.insights.length ? '<ul class="an-ins">' + a.insights.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '');
    $('#an-marks').innerHTML = html;

    var subs = a.subjects.filter(function (s) { return a.topics[s] && a.topics[s].length; })
      .map(function (s) { return { label: s, id: s }; });
    makeTabs($('#an-tabs'), subs, function (s) {
      $('#an-topics').innerHTML = a.topics[s.id].map(function (t) {
        return '<div class="topic"><div class="cnt">' + t.count + '<small>times</small></div><div><h4>' + esc(t.chapter) + '</h4>' +
          '<p>' + esc(t.topics || '') + '</p><p>' + esc((t.refs || []).join(' · ')) + '</p></div></div>';
      }).join('');
    }, 'ibs_topic_tab');

    var cards = [a.law_card, a.costing_card].filter(Boolean);
    $('#cards-law-cost').innerHTML = cards.map(function (c) {
      return '<div class="card wcard"><h3>' + esc(c.title) + '</h3><table class="wtable"><tbody>' +
        c.rows.map(function (r) { return '<tr><td>' + esc(r.chapter) + '</td><td>' + esc(r.words) + '</td></tr>'; }).join('') +
        '</tbody></table></div>';
    }).join('');
  }

  /* ---------- 4. solved papers ---------- */
  var solCache = {};
  function qHTML(q, pid) {
    var id = pid + '-' + q.q.replace(/[^\w]/g, '_');
    var tags = '<span class="tag t-' + esc(q.subject) + '">' + esc(q.subject) + '</span>' +
      (q.also ? '<span class="tag t-' + esc(q.also) + '">' + esc(q.also) + '</span>' : '') +
      '<span class="tag grey">' + esc(q.type) + ' · ' + q.marks + ' marks</span>';
    var opts = '';
    if (q.options && typeof q.options === 'object') {
      // ICAI's key is the first '(a)'..'(d)' in q.icai; none (e.g. "no correct option") means nothing is marked
      var km = String(q.icai || '').match(/\(([a-dA-D])\)/);
      var key = km ? km[1].toLowerCase() : '';
      opts = '<ul class="opts">' + Object.keys(q.options).map(function (k) {
        return '<li data-k="' + esc(k.toLowerCase()) + '"' + (k.toLowerCase() === key ? ' data-ok="1"' : '') + '><b>(' + esc(k) + ')</b>' + esc(q.options[k]) + '</li>';
      }).join('') + '</ul>';
    }
    var think = '<div class="blk"><h5>Clue in the case</h5><p>' + esc(q.clue) + '</p></div>' +
      '<div class="blk"><h5>Think</h5><ol>' + (q.think || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ol></div>' +
      (q.look_up ? '<div class="blk"><h5>Look up</h5><p>' + esc(q.look_up.where || '') + '</p><p>' +
        (q.look_up.index_keywords || []).map(function (k) { return '<span class="kw">' + esc(k) + '</span>'; }).join('') + '</p></div>' : '');
    var ans = '<div class="blk"><h5>Answer</h5><div class="pre">' + rich(q.answer) + '</div></div>' +
      (q.solve ? '<div class="blk"><h5>Working</h5><div class="pre">' + rich(q.solve) + '</div></div>' : '') +
      (q.flag ? '<div class="flag"><b>Note:</b> ' + esc(q.flag) + '</div>' : '') +
      (q.trap ? '<div class="trap"><b>Trap:</b> ' + esc(q.trap) + '</div>' : '');
    return '<div class="q" id="' + id + '"><div class="q-head"><span class="q-no">Q' + esc(q.q) + '</span>' + tags + '</div>' +
      '<p class="q-ask">' + esc(q.ask) + '</p>' + opts +
      '<p class="small">' + esc(q.chapter) + (q.minutes ? ' · ' + q.minutes + ' min' : '') + '</p>' +
      '<div class="q-btns"><button type="button" class="btn btn-line" data-show="think">Show the thinking</button>' +
      '<button type="button" class="btn btn-line" data-show="ans">Show the answer</button></div>' +
      '<div class="reveal think">' + think + '</div><div class="reveal ans">' + ans + '</div></div>';
  }
  function renderPaper(p, d) {
    var mix = function (m) {
      return Object.keys(m || {}).sort(function (a, b) { return m[b] - m[a]; }).map(function (s) {
        return '<span class="tag t-' + esc(s) + '">' + esc(s) + ' ' + m[s] + '</span>';
      }).join('');
    };
    var html = '<div class="paper-head"><h3>' + esc(d.paper) + '</h3>' +
      '<div class="mix">' + (p.qp ? '<a class="btn btn-line" href="' + esc(p.qp) + '" target="_blank" rel="noopener">ICAI question paper</a>' : '') +
      (p.sa ? '<a class="btn btn-line" href="' + esc(p.sa) + '" target="_blank" rel="noopener">ICAI answers</a>' : '') + '</div></div>';
    if (d.takeaways && d.takeaways.length) {
      html += '<div class="takeaways"><h3>What this paper teaches</h3><ul>' +
        d.takeaways.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>';
    }
    html += d.cases.map(function (c) {
      return '<details class="case"><summary><div class="case-top"><h3>Case ' + c.no + ': ' + esc(c.title) + '</h3><span class="chev" aria-hidden="true">⌄</span></div>' +
        '<p class="story">' + esc(c.story) + '</p><div class="mix">' + mix(c.marks_by_subject) +
        '<span class="tag grey">' + esc(c.difficulty) + '</span></div>' +
        (c.first15 ? '<p class="first15"><b>First 15 min:</b> ' + esc(c.first15) + '</p>' : '') +
        '</summary><div class="qs">' + c.questions.map(function (q) { return qHTML(q, p.id); }).join('') + '</div></details>';
    }).join('');
    $('#sol-panel').innerHTML = html;
  }
  function renderSolved(papers) {
    var panel = $('#sol-panel');
    var current = null;
    makeTabs($('#sol-tabs'), papers, function (p) {
      current = p.id;
      if (solCache[p.id]) return renderPaper(p, solCache[p.id]);
      panel.innerHTML = '<p class="muted">Loading ' + esc(p.label) + '…</p>';
      getJSON('data/solutions/' + p.id + '.json').then(function (d) {
        solCache[p.id] = d;
        if (current === p.id) renderPaper(p, d);
      }).catch(function () {
        if (current === p.id) panel.innerHTML = '<p class="muted">Could not load this paper. Check your connection and tap the tab again.</p>';
      });
    }, 'ibs_paper_tab');
    panel.addEventListener('click', function (e) {
      var b = e.target.closest('[data-show]');
      if (!b) return;
      var q = b.closest('.q');
      var r = q.querySelector('.reveal.' + b.dataset.show);
      var on = r.classList.toggle('on');
      b.textContent = (on ? 'Hide' : 'Show') + (b.dataset.show === 'think' ? ' the thinking' : ' the answer');
      if (b.dataset.show === 'ans') {
        q.querySelectorAll('.opts li[data-ok]').forEach(function (li) { li.classList.toggle('ok', on); });
      }
      if (on) track('ibs_reveal', { kind: b.dataset.show, q: q.id });
    });
  }

  function renderDownloads(list, hostId) {
    var host = document.getElementById(hostId);
    if (!host || !list || !list.length) return;
    host.innerHTML = list.map(function (x) {
      return '<a class="btn btn-blue" href="' + esc(x.path) + '" download data-file="' + esc(x.label) + '">' + DL_ICON + ' ' + esc(x.label) +
        (x.size_kb ? ' (' + size(x.size_kb) + ')' : '') + '</a>';
    }).join('');
  }

  getJSON('data/indexes.json').then(renderIndexes).catch(function () {
    $('#idx-panel').innerHTML = '<p class="muted">Could not load the indexes. Refresh the page.</p>';
  });
  getJSON('data/site.json').then(function (s) {
    renderAnalysis(s.analysis);
    renderSolved(s.papers);
    renderDownloads([].concat(s.downloads.notes, s.downloads.solutions, s.downloads.analysis), 'all-dl');
  }).catch(function () {
    $('#an-marks').innerHTML = '<p class="muted">Could not load. Refresh the page.</p>';
    $('#sol-panel').innerHTML = '';
  });
})();
