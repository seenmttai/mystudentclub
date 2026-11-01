/* MSC Articleship Program · Work Simulation storage adapter (UMD).
   Progress: window.MSCProgress (load/save, sync or Promise) when present, always mirrored to localStorage.
   My domain: MSCProgress.getDomain/setDomain when present, else localStorage.
   Add to my CV: MSCProgress.addCvLine (or MSCCvImport.addLine) + cv_maker_data upsert + the cv-import queue.
   Browser: window.MSCWSStore. Node: require('./ws-store.js'). Details: INTEGRATION.md. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./ws-engine.js'));
  else root.MSCWSStore = factory(root.MSCWSEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  var TOOL = 'work-simulation';
  var KEYS = {
    state: 'msc-articleship:work-simulation',
    domain: 'msc-articleship:my-domain',
    cv: 'cv_maker_data',
    queue: 'msc-articleship:cv-import'
  };
  var LIMIT = 60 * 1024;
  var DOMAIN_IDS = ['statutory-audit', 'internal-audit', 'direct-tax', 'gst', 'bank-audit', 'transfer-pricing',
    'ma-tax', 'valuation', 'fdd', 'forensic', 'consulting', 'accounting', 'ib-er'];

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function clone(v) { return JSON.parse(JSON.stringify(v)); }
  function parse(s) { if (typeof s !== 'string' || !s) return undefined; try { return JSON.parse(s); } catch (e) { return undefined; } }
  function bytes(s) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s).length;
    return unescape(encodeURIComponent(s)).length;
  }
  function sizeOf(state) { return bytes(JSON.stringify(state)); }
  function plain(html) {
    return String(html === undefined || html === null ? '' : html)
      .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/\s+/g, ' ').trim();
  }
  function validDomain(id) { return typeof id === 'string' && DOMAIN_IDS.indexOf(id) >= 0 ? id : null; }

  // Promise wrapper for a sync-or-async call that may throw; rejects after `ms` when it never settles
  function attempt(fn, ms) {
    return new Promise(function (resolve, reject) {
      var done = false, timer = null;
      if (ms > 0) timer = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, ms);
      try {
        Promise.resolve(fn()).then(function (v) {
          if (done) return; done = true; if (timer) clearTimeout(timer); resolve(v);
        }, function (e) {
          if (done) return; done = true; if (timer) clearTimeout(timer); reject(e);
        });
      } catch (e) { done = true; if (timer) clearTimeout(timer); reject(e); }
    });
  }

  /* Trim a state until it fits `limit` bytes (default 60 KB). Order: long free texts, answers of submitted
     attempts that are not the best, then the stored best answers of the oldest levels, then (last) the
     answers of in-progress attempts, oldest first. Lines, stars and counts are never dropped. */
  function fitState(state, limit) {
    limit = limit || LIMIT;
    var s = E.normalizeState(clone(state));
    if (sizeOf(s) <= limit) return s;
    var ids = Object.keys(s.levels).sort(function (a, b) { return (s.levels[a].updatedAt || 0) - (s.levels[b].updatedAt || 0); });
    function trimTexts(o) {
      if (Array.isArray(o)) { o.forEach(trimTexts); return; }
      if (!isObj(o)) return;
      Object.keys(o).forEach(function (k) {
        if (typeof o[k] === 'string' && o[k].length > 300) o[k] = o[k].slice(0, 300);
        else trimTexts(o[k]);
      });
    }
    ids.forEach(function (id) {
      var l = s.levels[id];
      if (l.attempt) trimTexts(l.attempt.answers);
      if (l.best && l.best.answers) trimTexts(l.best.answers);
    });
    if (sizeOf(s) <= limit) return s;
    ids.forEach(function (id) {
      var l = s.levels[id];
      if (sizeOf(s) <= limit) return;
      if (l.attempt && l.attempt.submittedAt && l.best && l.best.n !== l.attempt.n) delete l.attempt;
    });
    for (var i = 0; i < ids.length && sizeOf(s) > limit; i++) {
      var b = s.levels[ids[i]].best;
      if (b && b.answers) { delete b.answers; delete b.hintsByTask; }
      var a = s.levels[ids[i]].attempt;
      if (a && a.submittedAt && sizeOf(s) > limit) delete s.levels[ids[i]].attempt;
    }
    for (var j = 0; j < ids.length && sizeOf(s) > limit; j++) {
      var at = s.levels[ids[j]].attempt;
      if (at && !at.submittedAt) { at.answers = {}; at.hints = at.hints || {}; }
    }
    return s;
  }

  /* cv_maker_data upsert: one MSC line per domain, matched by "<CV name>, MSC Articleship Program".
     Never overwrites a cv_maker_data value it cannot parse (that would destroy a student's CV). */
  function upsertCertification(raw, cvName, line) {
    var data;
    if (raw === null || raw === undefined || raw === '') data = {};
    else {
      data = parse(raw);
      if (!isObj(data)) return { status: 'skipped', value: null };
    }
    // consistency pass round 2 (I2-02): a certifications value that is not a list (a string, an object) is the
    // student's own data in a shape this page does not know: never replace it with a one-item list
    if (data.certifications !== undefined && data.certifications !== null && !Array.isArray(data.certifications)) return { status: 'skipped', value: null };
    var certs = Array.isArray(data.certifications) ? data.certifications : [];
    var prefix = (cvName + ', MSC Articleship Program').toLowerCase();
    var kept = [], at = -1;
    certs.forEach(function (c) {
      var name = plain(isObj(c) ? c.name : c).toLowerCase();
      if (name.indexOf(prefix) === 0) { if (at < 0) at = kept.length; } else kept.push(c);
    });
    var entry = { name: line, issuer: '' };
    var status;
    if (at >= 0) { kept.splice(at, 0, entry); status = 'updated'; }
    else { kept.push(entry); status = raw ? 'added' : 'created'; }
    data.certifications = kept;
    return { status: status, value: JSON.stringify(data) };
  }

  function createStore(opts) {
    opts = opts || {};
    var g = opts.global || (typeof window !== 'undefined' ? window : {});
    var now = opts.now || function () { return Date.now(); };
    var remoteDelay = typeof opts.remoteDelay === 'number' ? opts.remoteDelay : 1500;
    var timeout = typeof opts.timeout === 'number' ? opts.timeout : 6000;
    var limit = opts.limit || LIMIT;
    var pending = null, timer = null, inflight = Promise.resolve();
    // consistency pass round 1 (I01): nothing is sent to MSCProgress.save until MSCProgress.load has answered once in
    // this page. A load that throws, rejects or times out (or an adapter defined after the first load) leaves
    // remoteRead false; the next flush reads the account copy first and merges it in, so one slow 4G load can never
    // replace levels passed on another device with this page's local state. `base` is the account copy as last read
    // or written, merged into every push (per level, newest updatedAt wins; this page wins a tie).
    var remoteRead = false, reading = null, base = null, listeners = [];

    function storage() {
      if (opts.storage !== undefined) return opts.storage;
      try { return g.localStorage || null; } catch (e) { return null; }
    }
    function get(key) { try { var s = storage(); return s ? s.getItem(key) : null; } catch (e) { return null; } }
    function set(key, value) { try { var s = storage(); if (!s) return false; s.setItem(key, value); return true; } catch (e) { return false; } }
    function del(key) { try { var s = storage(); if (s) s.removeItem(key); } catch (e) { /* ignore */ } }
    function progress() {
      var p = g.MSCProgress;
      return p && typeof p.load === 'function' && typeof p.save === 'function' ? p : null;
    }
    function hook(name) { var p = g.MSCProgress; return p && typeof p[name] === 'function' ? p : null; }

    function loadLocal() { return E.normalizeState(parse(get(KEYS.state))); }
    function saveLocal(state) { return set(KEYS.state, JSON.stringify(state)); }

    // the account copy, or null; remoteRead turns true only when load answered with a state (or its JSON string),
    // null or nothing, never on a throw, a rejection, a timeout or a value that is no state
    function loadRemote() {
      var p = progress();
      if (!p) return Promise.resolve(null);
      return attempt(function () { return p.load(TOOL); }, timeout).then(function (v) {
        if (typeof v === 'string') v = parse(v);
        if (v === null || v === undefined) { remoteRead = true; return null; }
        if (!isObj(v)) return null;
        remoteRead = true;
        base = E.normalizeState(v);
        return base;
      }, function () { return null; });
    }
    // one read of the account copy at a time: load() and a save that waits for a first read share it
    function readOnce() {
      if (!reading) reading = loadRemote().then(function (r) { reading = null; return r; });
      return reading;
    }
    function pushRemote(state) {
      var p = progress();
      if (!p) return Promise.resolve(false);
      inflight = inflight.then(function () {
        var out = base ? fitState(E.mergeStates(state, base), limit) : state;
        return attempt(function () { return p.save(TOOL, clone(out)); }, timeout).then(function () { base = out; return true; }, function () { return false; });
      });
      return inflight;
    }
    // a save before any load has answered: read the account copy first, merge the waiting state into it and push
    // that, and hand the merge to the page (onRemote) so its own state takes in the account's levels too. A read that
    // fails again keeps the state waiting for the next flush.
    function readFirst() {
      return readOnce().then(function (remote) {
        if (!remoteRead || !pending) return false;
        var s = pending; pending = null;
        if (remote) {
          s = fitState(E.mergeStates(s, remote), limit);
          saveLocal(s);
          var copy = clone(s);
          listeners.forEach(function (fn) { try { fn(copy); } catch (e) { /* the page's own trouble */ } });
        }
        return pushRemote(s);
      });
    }
    function flush() {
      if (timer) { clearTimeout(timer); timer = null; }
      if (!pending) return (reading || inflight).then(function () { return false; });
      if (!remoteRead) return progress() ? readFirst() : Promise.resolve(false);
      var s = pending; pending = null;
      return pushRemote(s);
    }
    function save(state) {
      var fitted = fitState(state, limit);
      saveLocal(fitted);
      if (progress()) {
        pending = fitted;
        if (remoteDelay <= 0) flush();
        else { if (timer) clearTimeout(timer); timer = setTimeout(flush, remoteDelay); }
      }
      return fitted;
    }
    // local + remote, merged per level (newest updatedAt wins); the merge is written back to both sides.
    // consistency pass round 1 (I02): the local copy is read when the account answers, not when load() starts, so
    // whatever the student did while the account was slow is in the merge (a state still waiting to go up is merged
    // in too)
    function load() {
      return readOnce().then(function (remote) {
        var local = loadLocal();
        if (!remote) { if (remoteRead && pending) flush(); return local; }
        var merged = fitState(E.mergeStates(local, remote), limit);
        saveLocal(merged);
        if (pending) pending = fitState(E.mergeStates(pending, merged), limit);
        else if (JSON.stringify(merged) !== JSON.stringify(remote)) pending = merged;
        if (pending) flush();
        return merged;
      });
    }
    function onRemote(fn) { if (typeof fn === 'function') listeners.push(fn); }

    function getDomainLocal() {
      var raw = get(KEYS.domain);
      if (raw && raw.charAt(0) === '"') raw = parse(raw);
      return validDomain(raw);
    }
    function getDomain() {
      var p = hook('getDomain');
      var local = getDomainLocal();
      if (!p) return Promise.resolve(local);
      return attempt(function () { return p.getDomain(); }, timeout).then(function (v) {
        var id = validDomain(v);
        // consistency pass round 2 (I2-09 hooks probe): a domain the student picked while the account was answering
        // stays in the local key; a late answer never overwrites it
        var now = getDomainLocal();
        if (now !== local) return now;
        if (id) { if (id !== local) set(KEYS.domain, id); return id; }
        return local;
      }, function () { return getDomainLocal(); });
    }
    function setDomain(id) {
      id = validDomain(id);
      if (id) set(KEYS.domain, id); else del(KEYS.domain);
      var p = hook('setDomain');
      if (!p) return Promise.resolve(id);
      return attempt(function () { return p.setDomain(id); }, timeout).then(function () { return id; }, function () { return id; });
    }

    function queueImport(entry) {
      var q = parse(get(KEYS.queue));
      if (!Array.isArray(q)) q = [];
      q = q.filter(function (x) { return !(isObj(x) && x.source === entry.source && x.domain === entry.domain); });
      q.push(entry);
      if (q.length > 50) q = q.slice(-50);
      return set(KEYS.queue, JSON.stringify(q));
    }
    // { domain, cvName, line } -> Promise<{ hook, cv, queued }>
    function addCvLine(args) {
      var entry = { source: 'work-simulation', domain: args.domain, cvName: args.cvName, line: args.line, at: now() };
      var queued = { source: entry.source, domain: entry.domain, line: entry.line, at: entry.at };
      var up = upsertCertification(get(KEYS.cv), args.cvName, args.line);
      var cv = up.status;
      if (up.value !== null && !set(KEYS.cv, up.value)) cv = 'failed';
      var q = queueImport(queued);
      var calls = [];
      var p = hook('addCvLine');
      if (p) calls.push(attempt(function () { return p.addCvLine(clone(entry)); }, timeout).then(function () { return true; }, function () { return false; }));
      var imp = g.MSCCvImport;
      if (imp && typeof imp.addLine === 'function') {
        calls.push(attempt(function () { return imp.addLine(clone(entry)); }, timeout).then(function () { return true; }, function () { return false; }));
      }
      return Promise.all(calls).then(function (res) {
        return { hook: res.some(Boolean), cv: cv, queued: q };
      });
    }

    return {
      KEYS: KEYS, TOOL: TOOL,
      loadLocal: loadLocal, loadRemote: loadRemote, load: load, save: save, flush: flush, onRemote: onRemote,
      getDomain: getDomain, getDomainLocal: getDomainLocal, setDomain: setDomain,
      addCvLine: addCvLine, hasRemote: function () { return !!progress(); }
    };
  }

  return {
    KEYS: KEYS, TOOL: TOOL, LIMIT: LIMIT, DOMAIN_IDS: DOMAIN_IDS,
    createStore: createStore, fitState: fitState, sizeOf: sizeOf, upsertCertification: upsertCertification,
    plain: plain
  };
});
