'use strict';
/* Work Simulation level validator and answer builders (shared by the content test, tools/check-level.mjs and
   tools/play.mjs). Not a test file itself. */
const path = require('path');
const E = require('../articleship-program/work-simulation/js/ws-engine.js');
const D = require('../articleship-program/work-simulation/js/ws-docs.js');

const DOMAINS = [
  ['statutory-audit', 'Statutory audit', 'Statutory Audit Work Simulation'],
  ['internal-audit', 'Internal audit, risk & IFC', 'Internal Audit Work Simulation'],
  ['direct-tax', 'Direct tax', 'Direct Tax Work Simulation'],
  ['gst', 'GST', 'GST Work Simulation'],
  ['bank-audit', 'Bank audit', 'Bank Audit Work Simulation'],
  ['transfer-pricing', 'Transfer pricing', 'Transfer Pricing Work Simulation'],
  ['ma-tax', 'M&A tax', 'M&A Tax Work Simulation'],
  ['valuation', 'Valuation', 'Valuation Work Simulation'],
  ['fdd', 'Financial due diligence', 'Financial Due Diligence Work Simulation'],
  ['forensic', 'Forensic', 'Forensic Work Simulation'],
  ['consulting', 'Consulting & risk advisory', 'Consulting Work Simulation'],
  ['accounting', 'Accounting, MIS & company law', 'Accounting and Company Law Work Simulation'],
  ['ib-er', 'IB & equity research', 'IB and Equity Research Work Simulation']
];
// SPEC §3.2: [order, id, domain, number]
const LEVELS = [
  ['sa-1', 'statutory-audit', 1], ['sa-2', 'statutory-audit', 2], ['dt-1', 'direct-tax', 1], ['gst-1', 'gst', 1],
  ['val-1', 'valuation', 1], ['sa-3', 'statutory-audit', 3], ['ia-1', 'internal-audit', 1], ['sa-4', 'statutory-audit', 4],
  ['dt-2', 'direct-tax', 2], ['sa-5', 'statutory-audit', 5], ['gst-2', 'gst', 2], ['dt-3', 'direct-tax', 3],
  ['dt-4', 'direct-tax', 4], ['sa-6', 'statutory-audit', 6], ['ia-2', 'internal-audit', 2], ['gst-3', 'gst', 3],
  ['xl-1', 'accounting', 1], ['fdd-1', 'fdd', 1], ['ba-1', 'bank-audit', 1], ['for-1', 'forensic', 1],
  ['tp-1', 'transfer-pricing', 1], ['mat-1', 'ma-tax', 1], ['acc-1', 'accounting', 2], ['cl-1', 'accounting', 3],
  ['sa-7', 'statutory-audit', 7], ['con-1', 'consulting', 1], ['iber-1', 'ib-er', 1]
];
const STATE_CODES = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland',
  '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh', '97': 'Other Territory'
};
const INVOICE_STYLES = D.INVOICE_STYLES || ['tally'];
const TASK_TYPES = ['items', 'worksheet', 'choice', 'order', 'compose', 'hunt'];
const FIELD_KINDS = ['choice', 'multi', 'number', 'text'];
const COUNT_KINDS = ['const', 'items', 'answeredItems', 'correctItems', 'itemsWhere', 'sumItems', 'tally', 'cell', 'correctCells',
  'correctQuestions', 'correctSlots', 'huntHits', 'flagged', 'rows'];
const FORMATS = ['int', 'inr', 'inr0', 'inr2', 'amount', 'lakh', 'lakh2', 'crore', 'crore1', 'pct', 'pct0', 'pct1', 'pct2', 'qty', 'num', 'num1', 'text', 'date'];
const ANN_KINDS = ['stamp', 'hand', 'sign', 'tick', 'highlight'];
const HUNT_TOOLS = ['search', 'sort', 'weekend', 'round', 'duplicates', 'match'];
const TRAINEE_VERBS = ['vouched', 'counted', 'checked', 'recomputed', 'tested', 'matched', 'prepared', 'drafted', 'reconciled',
  'classified', 'computed', 'built', 'screened', 'flagged', 'traced', 'test-counted', 'verified', 'reviewed', 'analysed', 'listed', 'compared',
  'normalised', 'mapped', 'assembled', 'calculated', 'cleaned', 'walked', 'read', 'set', 'wrote', 'picked', 'profiled', 'documented'];
const BANNED_VERBS = ['approved', 'certified', 'signed', 'led', 'spearheaded', 'managed', 'audited the company', 'headed', 'supervised'];
const BANNED = ['delve', 'leverage', 'seamless', 'robust', 'crucial', 'pivotal', 'embark', 'unlock', 'empower', 'elevate', 'foster',
  'holistic', 'streamline', 'tapestry', 'dive into', 'in today’s', "in today's", 'it’s important to note', "it's important to note",
  'game-changer', 'game changer', 'congratulations', 'great job', 'well done', 'awesome', 'let’s', "let's", 'not only', 'coming soon',
  'needs-check', 'lorem', 'todo', 'tbd', 'xxx '];
const SKIP_KEYS = new Set(['id', 'type', 'style', 'group', 'kind', 'format', 'key', '_id', '_class', '_hl', '_hlCols', '_sumOf',
  '_check', '_indent', 'planted', 'color', 'at', 'shape', 'align', 'docs', 'task', 'field', 'equals', 'from', 'dataset', 'rowKey',
  'tools', 'me', 'showIf', 'answer', 'left', 'right', 'leftName', 'rightName', 'link', 'file', 'domain', 'check', 'runningFrom',
  'reason', 'row', 'col', 'kind', 'dupKeys', 'keys', 'prop', 'where', 'gate', 'multi', 'correct', 'input', 'mono', 'tolerance',
  'toleranceRel', 'weight', 'number', 'minutes', 'cartons', 'perCarton', 'loose', 'condition', 'pos', 'grid', 'rotate', 'tax',
  'stateCode', 'irn', 'published', 'order', 'v', 'icon', 'url', 'handwritten', 'negative', 'roundTo', 'revenueStamp', 'initials',
  'showHeading', 'hsn', 'needs', 'handPan', 'show', 'map', 'bin', 'listed', 'quiet', 'arrives', 'withRight', 'noteAt', 'minutesWhy',
  'noFollowIf', 'cell']);

/* ---------------------------------------------------------------- GSTIN / PAN */
const CH = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstinCheckChar(g14) {
  let s = 0;
  for (let i = 0; i < 14; i++) { const v = CH.indexOf(g14[i]) * (i % 2 === 0 ? 1 : 2); s += Math.floor(v / 36) + (v % 36); }
  return CH[(36 - (s % 36)) % 36];
}
const GSTIN_RE = /^(\d{2})([A-Z]{5}\d{4}[A-Z])([1-9A-Z])Z([0-9A-Z])$/;
const PAN_RE = /^[A-Z]{3}[ABCFGHLJPTK][A-Z]\d{4}[A-Z]$/;
function gstinProblems(g) {
  const out = [];
  const m = GSTIN_RE.exec(String(g || ''));
  if (!m) { out.push('GSTIN ' + g + ' is not in the 15-character format'); return out; }
  if (!STATE_CODES[m[1]]) out.push('GSTIN ' + g + ' has an unknown state code ' + m[1]);
  if (!PAN_RE.test(m[2])) out.push('GSTIN ' + g + ' carries an invalid PAN ' + m[2]);
  const cc = gstinCheckChar(g.slice(0, 14));
  if (cc !== g[14]) out.push('GSTIN ' + g + ' check character should be ' + cc);
  return out;
}
function partyProblems(p, where) {
  const out = [];
  if (!p || typeof p !== 'object' || !p.gstin) return out;
  gstinProblems(p.gstin).forEach(m => out.push(where + ': ' + m));
  const m = GSTIN_RE.exec(p.gstin);
  if (m) {
    if (p.pan && p.pan !== m[2]) out.push(where + ': PAN ' + p.pan + ' does not match the GSTIN’s PAN part ' + m[2]);
    if (p.stateCode && String(p.stateCode).padStart(2, '0') !== m[1]) out.push(where + ': state code ' + p.stateCode + ' does not match GSTIN ' + p.gstin);
    if (p.state && STATE_CODES[m[1]] && p.state.toLowerCase() !== STATE_CODES[m[1]].toLowerCase()) out.push(where + ': state ' + p.state + ' does not match code ' + m[1] + ' (' + STATE_CODES[m[1]] + ')');
  }
  if (p.pan && !PAN_RE.test(p.pan)) out.push(where + ': PAN ' + p.pan + ' is not valid');
  return out;
}

/* ---------------------------------------------------------------- answer builders */
function keyAnswers(level) {
  const out = {};
  (level.tasks || []).forEach(t => {
    if (t.type === 'items') {
      const a = {};
      (t.items || []).forEach(it => { a[it.id] = JSON.parse(JSON.stringify(it.answer || {})); });
      out[t.id] = a;
    } else if (t.type === 'worksheet') {
      const a = {};
      E.inputCells(t).forEach(c => { a[c.key] = String(Array.isArray(c.cell.answer) ? c.cell.answer[0] : c.cell.answer); });
      out[t.id] = a;
    } else if (t.type === 'choice') {
      const a = {};
      (t.questions || []).forEach(q => { const r = E.rightIds(q); a[q.id] = q.multi ? r : r[0]; });
      out[t.id] = a;
    } else if (t.type === 'order') {
      out[t.id] = { order: (t.answer || []).slice(), touched: true };
    } else if (t.type === 'compose') {
      const a = {};
      (t.slots || []).forEach(s => { const o = (s.options || []).find(x => x.correct); if (o) a[s.id] = o.id; });
      out[t.id] = a;
    } else if (t.type === 'hunt') {
      const flags = {};
      Object.keys(t.answer || {}).forEach(r => { flags[r] = [].concat(t.answer[r])[0]; });
      out[t.id] = { flags };
    }
  });
  return out;
}
function wrongValue(v) { const n = E.parseNumber(v); const x = n === null ? 0 : n; return String(x + Math.max(10, Math.abs(x)) + 7); }
function wrongItem(t, it) {
  const exp = it.answer || {}, a = {};
  const gate = (t.fields || []).find(f => f.gate);
  const fields = gate ? [gate] : (t.fields || []).filter(f => f.kind !== 'text');
  fields.forEach(f => {
    if (f.kind === 'choice') { const o = (f.options || []).find(x => [].concat(exp[f.id]).indexOf(x.id) < 0); if (o) a[f.id] = o.id; }
    else if (f.kind === 'multi') { const o = (f.options || []).filter(x => [].concat(exp[f.id] || []).indexOf(x.id) < 0).map(x => x.id); a[f.id] = o.length ? o : []; }
    else if (f.kind === 'number') a[f.id] = wrongValue(exp[f.id]);
  });
  return a;
}
function wrongAnswers(level) {
  const out = {};
  (level.tasks || []).forEach(t => {
    if (t.type === 'items') { const a = {}; (t.items || []).forEach(it => { a[it.id] = wrongItem(t, it); }); out[t.id] = a; }
    else if (t.type === 'worksheet') { const a = {}; E.inputCells(t).forEach(c => { a[c.key] = wrongValue(c.cell.answer); }); out[t.id] = a; }
    else if (t.type === 'choice') {
      const a = {};
      (t.questions || []).forEach(q => {
        const wrong = (q.options || []).filter(o => !o.correct).map(o => o.id);
        a[q.id] = q.multi ? wrong : wrong[0];
      });
      out[t.id] = a;
    } else if (t.type === 'order') out[t.id] = { order: (t.answer || []).slice().reverse(), touched: true };
    else if (t.type === 'compose') { const a = {}; (t.slots || []).forEach(s => { const o = (s.options || []).find(x => !x.correct); if (o) a[s.id] = o.id; }); out[t.id] = a; }
    else if (t.type === 'hunt') {
      const doc = (level.documents || []).find(d => d.id === t.dataset);
      const rk = t.rowKey || '_id', flags = {};
      const rows = ((doc && doc.rows) || []).filter(r => !(r[rk] in (t.answer || {})) && (!r._class || r._class === 'data'));
      rows.slice(0, 3).forEach(r => { flags[r[rk]] = (t.reasons || [])[0].id; });
      out[t.id] = { flags };
    }
  });
  return out;
}
// The one-click strategy: every item gets the commonest call of its gate field in the key (with no gate field, the
// commonest key value of every field), every other field of the item is right, and every other task is left blank.
// A level must not pass on it (sa-1 round 1: marking all 20 bills Fine passed at 50.6%).
function commonValue(values) {
  const n = new Map(); let best = null, bestN = 0;
  values.forEach(v => { if (v === undefined) return; const k = JSON.stringify(v); const c = (n.get(k) || 0) + 1; n.set(k, c); if (c > bestN) { bestN = c; best = v; } });
  return best === null ? undefined : JSON.parse(JSON.stringify(best));
}
function defaultAnswers(level) {
  const out = {};
  (level.tasks || []).forEach(t => {
    if (t.type !== 'items') return;
    const fields = (t.fields || []).filter(f => f.kind !== 'text'), gate = fields.find(f => f.gate), items = t.items || [], a = {};
    if (gate) {
      const g = commonValue(items.map(it => (it.answer || {})[gate.id]));
      items.forEach(it => {
        const ia = JSON.parse(JSON.stringify(it.answer || {}));
        if (g !== undefined) ia[gate.id] = g;
        fields.forEach(f => { if (!E.fieldVisible(f, ia)) delete ia[f.id]; });
        a[it.id] = ia;
      });
    } else {
      const common = {};
      fields.forEach(f => { common[f.id] = commonValue(items.map(it => (it.answer || {})[f.id])); });
      items.forEach(it => { const ia = {}; fields.forEach(f => { if (common[f.id] !== undefined) ia[f.id] = JSON.parse(JSON.stringify(common[f.id])); }); a[it.id] = ia; });
    }
    out[t.id] = a;
  });
  return out;
}
// every 4th unit wrong, the rest right
function partialAnswers(level) {
  const key = keyAnswers(level), wrong = wrongAnswers(level), out = JSON.parse(JSON.stringify(key));
  let n = 0;
  (level.tasks || []).forEach(t => {
    if (t.type === 'items') (t.items || []).forEach(it => { if (n++ % 4 === 3) out[t.id][it.id] = wrong[t.id][it.id]; });
    else if (t.type === 'worksheet') E.inputCells(t).forEach(c => { if (n++ % 4 === 3) out[t.id][c.key] = wrong[t.id][c.key]; });
    else if (t.type === 'choice') (t.questions || []).forEach(q => { if (n++ % 4 === 3) out[t.id][q.id] = wrong[t.id][q.id]; });
    else if (t.type === 'compose') (t.slots || []).forEach(s => { if (n++ % 4 === 3) out[t.id][s.id] = wrong[t.id][s.id]; });
    else if (t.type === 'hunt') Object.keys(out[t.id].flags).forEach(r => { if (n++ % 4 === 3) delete out[t.id].flags[r]; });
    else n++;
  });
  return out;
}
// Every item's main call (the gate field) from the key and nothing else on the items; every other task from the key.
// A count of "bills vouched" must not read 0 on this set (sa-1 round 2: the items count only counted fully answered
// items, so a pass with no year picked earned "Vouched 0 year-end purchase bills").
function gatesOnly(level) {
  const out = keyAnswers(level);
  (level.tasks || []).forEach(t => {
    if (t.type !== 'items') return;
    const gate = (t.fields || []).find(f => f.gate);
    if (!gate) return;
    (t.items || []).forEach(it => { const v = (it.answer || {})[gate.id]; out[t.id][it.id] = v === undefined ? {} : { [gate.id]: JSON.parse(JSON.stringify(v)) }; });
  });
  return out;
}
// The key, with every option of every multi field ticked on each item (sa-1 round 3: ticking all six real reasons
// on every exception earned the key's own brackets). An item whose key already ticks every option is left blank, so
// any tally or withRight count on this set must come out empty.
function shotgun(level) {
  const out = keyAnswers(level);
  (level.tasks || []).forEach(t => {
    if (t.type !== 'items') return;
    const multis = (t.fields || []).filter(f => f.kind === 'multi');
    if (!multis.length) return;
    (t.items || []).forEach(it => {
      const ia = out[t.id][it.id];
      if (multis.every(f => (f.options || []).every(o => [].concat((it.answer || {})[f.id] || []).indexOf(o.id) >= 0))) { delete out[t.id][it.id]; return; }
      multis.forEach(f => { if (E.fieldVisible(f, ia)) ia[f.id] = (f.options || []).map(o => o.id); });
    });
  });
  return out;
}
// The key with one task's answers replaced by the wrong answers (every other task from the key)
function oneTaskWrong(level, taskId) {
  const out = keyAnswers(level), wrong = wrongAnswers(level);
  out[taskId] = wrong[taskId];
  return out;
}
const passes = (level, answers) => E.resultFor(level, answers, 0).passed;
// Blank answer units (from the end) while the attempt still passes: the least a student can do and still earn the line
function minimalPassing(level) {
  const ans = keyAnswers(level);
  const units = [];
  (level.tasks || []).forEach(t => {
    if (t.type === 'items') (t.items || []).forEach(it => units.push(a => { delete a[t.id][it.id]; }));
    else if (t.type === 'worksheet') E.inputCells(t).forEach(c => units.push(a => { delete a[t.id][c.key]; }));
    else if (t.type === 'choice') (t.questions || []).forEach(q => units.push(a => { delete a[t.id][q.id]; }));
    else if (t.type === 'compose') (t.slots || []).forEach(s => units.push(a => { delete a[t.id][s.id]; }));
    else if (t.type === 'hunt') Object.keys(t.answer || {}).forEach(r => units.push(a => { delete a[t.id].flags[r]; }));
  });
  let cur = ans;
  for (let i = units.length - 1; i >= 0; i--) {
    const next = JSON.parse(JSON.stringify(cur));
    units[i](next);
    if (passes(level, next)) cur = next;
  }
  return cur;
}

/* ---------------------------------------------------------------- text checks */
function words(s) { return E.wordCount(s); }
function visibleStrings(obj, pathStr, out) {
  out = out || [];
  if (typeof obj === 'string') { out.push({ path: pathStr, text: obj }); return out; }
  if (Array.isArray(obj)) { obj.forEach((x, i) => visibleStrings(x, pathStr + '[' + i + ']', out)); return out; }
  if (obj && typeof obj === 'object') {
    Object.keys(obj).forEach(k => {
      // consistency pass round 1 (R36): "where" is skipped for count specs, but the case file's Where row is student text
      if (SKIP_KEYS.has(k) && !(k === 'where' && /\.case$/.test(pathStr))) return;
      if (k === 'counts' || k === 'people') return;
      visibleStrings(obj[k], pathStr + '.' + k, out);
    });
  }
  return out;
}
function groupingOk(numStr) {
  const g = numStr.split(',');
  if (g.length < 2) return true;
  if (g[g.length - 1].length !== 3) return false;
  if (g[0].length < 1 || g[0].length > 2) return false;
  for (let i = 1; i < g.length - 1; i++) if (g[i].length !== 2) return false;
  return true;
}
function textProblems(s) {
  const out = [];
  if (/['"]/.test(s)) out.push('straight quote');
  if (/—/.test(s)) out.push('em dash');
  const low = s.toLowerCase();
  BANNED.forEach(b => {
    const re = new RegExp('(^|[^a-z])' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z])', 'i');
    if (re.test(low)) out.push('banned word “' + b.trim() + '”');
  });
  if (/\b(sa|dt|gst|val|ia|xl|fdd|ba|for|tp|mat|acc|cl|con|iber)-\d\b/.test(s)) out.push('internal level id');
  if (/(^|[\s(])t\d(\b|$)/.test(s)) out.push('internal task id');
  if (/\bpreview\b/i.test(s)) out.push('the word “preview”');
  const nums = s.match(/\d+(?:,\d+)+(?:\.\d+)?/g) || [];
  nums.forEach(n => { if (!groupingOk(n.replace(/\.\d+$/, ''))) out.push('number ' + n + ' is not in Indian grouping'); });
  // a year range in prose takes an en dash; inside a document number ("KS/2026-27/4418", "GRN-2027-04-0007") the
  // issuer's hyphen stays: a match joined to the code by "/" or "-" on either side is part of that number
  const yr = /\b(?:19|20)\d{2}-\d{2}\b/g;
  let ym;
  while ((ym = yr.exec(s))) {
    if (/[\/-]/.test(s.charAt(ym.index - 1)) || /[\/-]/.test(s.charAt(ym.index + ym[0].length))) continue;
    out.push('year range with a hyphen (use an en dash)');
    break;
  }
  if (/�/.test(s)) out.push('broken character');
  return out;
}

/* ---------------------------------------------------------------- arithmetic */
function near(a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? 0.011 : tol); }
function placeCode(pos) {
  const s = String(pos || '');
  const m = /\((\d{2})\)/.exec(s) || /^(\d{2})\b/.exec(s);
  if (m) return m[1];
  const hit = Object.keys(STATE_CODES).find(k => s.toLowerCase().indexOf(STATE_CODES[k].toLowerCase()) >= 0);
  return hit || null;
}
function invoiceProblems(doc) {
  const out = [];
  const tt = D.invoiceTotals(doc);
  (doc.lines || []).forEach((l, i) => {
    if (typeof l.qty === 'number' && typeof l.rate === 'number' && typeof l.taxable === 'number' && !near(l.qty * l.rate, l.taxable)) out.push('line ' + (i + 1) + ': qty × rate ≠ taxable value');
    if (typeof l.gstRate !== 'number') out.push('line ' + (i + 1) + ': gstRate missing');
  });
  if (typeof doc.total === 'number' && !near(tt.computed, doc.total)) out.push('total ' + doc.total + ' ≠ taxable + tax + charges + round off = ' + tt.computed);
  if (doc.amountInWords && !E.wordsMatch(doc.amountInWords, tt.total)) out.push('amount in words does not match ' + tt.total);
  const sc = doc.supplier && (doc.supplier.stateCode || (GSTIN_RE.exec(doc.supplier.gstin || '') || [])[1]);
  const pc = placeCode(doc.placeOfSupply);
  if (sc && pc) {
    const intra = String(sc).padStart(2, '0') === pc;
    if (intra && doc.tax === 'inter') out.push('supplier and place of supply are in the same state, but tax is IGST');
    if (!intra && doc.tax !== 'inter') out.push('supplier and place of supply are in different states, but tax is CGST/SGST');
  }
  return out;
}
function evalFormula(expr, row) {
  const toks = String(expr).split(/\s*([+\-])\s*/);
  let sign = 1, total = 0;
  for (const t of toks) {
    if (t === '+') { sign = 1; continue; }
    if (t === '-') { sign = -1; continue; }
    if (!t) continue;
    const v = /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : row[t];
    if (typeof v !== 'number') return null;
    total += sign * v;
  }
  return total;
}
function tableProblems(doc) {
  const out = [];
  const cols = doc.columns || [], rows = doc.rows || [];
  const numCols = cols.filter(c => ['inr', 'inr0', 'inr2', 'amount', 'int', 'qty', 'num', 'lakh', 'crore'].indexOf(c.format) >= 0).map(c => c.key);
  const byId = {};
  rows.forEach(r => { if (r._id !== undefined) byId[r._id] = r; });
  const keyset = new Set(cols.map(c => c.key));
  rows.forEach((r, i) => Object.keys(r).forEach(k => { if (k.charAt(0) !== '_' && !keyset.has(k)) out.push('row ' + (i + 1) + ': key “' + k + '” is not a column'); }));
  rows.forEach((r, i) => {
    if (!Array.isArray(r._sumOf)) return;
    numCols.forEach(k => {
      if (typeof r[k] !== 'number') return;
      let s = 0, ok = true;
      r._sumOf.forEach(ref => {
        const neg = String(ref).charAt(0) === '-', id = neg ? String(ref).slice(1) : ref, src = byId[id];
        if (!src) { out.push('row ' + (i + 1) + ': _sumOf refers to unknown row ' + id); ok = false; return; }
        if (typeof src[k] === 'number') s += neg ? -src[k] : src[k];
      });
      if (ok && !near(s, r[k], 0.011)) out.push('row ' + (i + 1) + ' (' + (r[cols[0].key] || '') + '): ' + k + ' should be ' + E.formatNumber(s, 'auto') + ', not ' + r[k]);
    });
  });
  if (doc.check !== false) {
    const details = (a, b) => rows.slice(a, b).filter(x => !x._class || x._class === 'data' || x._class === 'muted');
    let segStart = 0, blockStart = 0, subs = [];
    rows.forEach((r, i) => {
      const cls = r._class;
      if (cls !== 'subtotal' && cls !== 'total') return;
      if (!Array.isArray(r._sumOf) && r._check !== false) {
        const pool = cls === 'subtotal' ? details(blockStart, i) : (subs.length ? subs.concat(details(blockStart, i)) : details(segStart, i));
        numCols.forEach(k => {
          if (typeof r[k] !== 'number') return;
          const vals = pool.map(x => x[k]).filter(v => typeof v === 'number');
          if (!vals.length) return;
          const s = vals.reduce((x, y) => x + y, 0);
          if (!near(s, r[k], 0.011)) out.push('row ' + (i + 1) + ' (' + (r[cols[0].key] || '') + '): ' + k + ' total should be ' + E.formatNumber(s, 'auto') + ', not ' + r[k]);
        });
      }
      if (cls === 'subtotal') { subs.push(r); blockStart = i + 1; }
      else { subs = []; blockStart = segStart = i + 1; }
    });
  }
  cols.forEach(c => {
    if (c.check) rows.forEach((r, i) => {
      if (r._class === 'head' || typeof r[c.key] !== 'number') return;
      const v = evalFormula(c.check, r);
      if (v !== null && !near(v, r[c.key], 0.011)) out.push('row ' + (i + 1) + ': ' + c.key + ' should be ' + c.check + ' = ' + v);
    });
    if (c.runningFrom) {
      let prev = null;
      rows.forEach((r, i) => {
        const b = r[c.key];
        if (typeof b !== 'number') return;
        if (prev !== null) {
          const plus = typeof r[c.runningFrom.plus] === 'number' ? r[c.runningFrom.plus] : 0;
          const minus = typeof r[c.runningFrom.minus] === 'number' ? r[c.runningFrom.minus] : 0;
          if (!near(prev + plus - minus, b, 0.011)) out.push('row ' + (i + 1) + ': running ' + c.key + ' should be ' + E.formatNumber(prev + plus - minus, 2));
        }
        prev = b;
      });
    }
  });
  return out;
}

/* ---------------------------------------------------------------- the validator */
function validateLevel(level, ctx) {
  ctx = ctx || {};
  const errors = [], warns = [];
  const err = (p, m) => errors.push(p + ': ' + m), warn = (p, m) => warns.push(p + ': ' + m);
  const isStr = v => typeof v === 'string' && v.trim().length > 0;
  if (!level || typeof level !== 'object') return { errors: ['level: not an object'], warns };
  const L = level;
  ['id', 'domain', 'title'].forEach(k => { if (!isStr(L[k])) err(k, 'missing'); });
  if (typeof L.number !== 'number') err('number', 'missing');
  // ia-2 round 2: a level whose law row fixes more work than 40 minutes holds (ia-2: "test 40 claims") shows its honest
  // time (house rule 1) up to 60 and names that row in `minutesWhy` (internal, never shown); without it, as before
  const longWhy = isStr(L.minutesWhy);
  if (L.minutesWhy !== undefined && !longWhy) err('minutesWhy', 'must name the law row that makes the level longer than 40 minutes');
  if (typeof L.minutes !== 'number' || L.minutes < 10 || L.minutes > (longWhy ? 60 : 45)) err('minutes', 'should be 15–40 (10–45 allowed; up to 60 with minutesWhy): the time a careful first-timer on a phone takes');
  else if (L.minutes < 15 || (L.minutes > 40 && !longWhy)) warn('minutes', 'should be 15–40 (a level the law makes longer names its law row in minutesWhy)');
  else if (longWhy && L.minutes <= 40) warn('minutesWhy', 'not needed: the level shows 40 minutes or less');
  if (!DOMAINS.find(d => d[0] === L.domain)) err('domain', 'unknown domain ' + L.domain);
  if (ctx.catalogue && !ctx.fixture) {
    const m = (ctx.catalogue.levels || []).find(x => x.id === L.id);
    if (!m) err('id', 'not in the catalogue');
    else {
      if (m.domain !== L.domain) err('domain', 'catalogue says ' + m.domain);
      if (m.number !== L.number) err('number', 'catalogue says ' + m.number);
      if (m.title !== L.title) err('title', 'catalogue says “' + m.title + '”');
      if (m.minutes !== L.minutes) err('minutes', 'catalogue says ' + m.minutes + ' (the domain list and the case file must show the same time)');
    }
  }
  if (!Array.isArray(L.learn) || L.learn.length < 2 || L.learn.length > 3) err('learn', 'needs 2–3 lines');
  else L.learn.forEach((x, i) => { if (words(x) > 12) err('learn[' + i + ']', 'over 12 words'); });
  if (!Array.isArray(L.do) || L.do.length < 1 || L.do.length > 3) err('do', 'needs 1–3 lines');
  const c = L.case || {};
  ['role', 'client', 'team', 'goal', 'period'].forEach(k => { if (!isStr(c[k])) err('case.' + k, 'missing'); });
  // people
  const people = {};
  const wp = ctx.world && ctx.world.people;
  (Array.isArray(wp) ? wp : wp && typeof wp === 'object' ? Object.keys(wp).map(k => Object.assign({ id: k }, wp[k])) : []).forEach(p => { if (p && p.id) people[p.id] = p; });
  (L.people || []).forEach(p => { if (p && p.id) people[p.id] = p; });
  const personOk = (id, where) => { if (!people[id]) err(where, 'person “' + id + '” is not in the world'); };
  if (!L.brief || !isStr(L.brief.from)) err('brief.from', 'missing'); else personOk(L.brief.from, 'brief.from');
  if (!L.brief || !Array.isArray(L.brief.messages) || L.brief.messages.length < 1 || L.brief.messages.length > 3) err('brief.messages', 'needs 1–3 messages');
  else L.brief.messages.forEach((m, i) => { if (words(m) > 35) warn('brief.messages[' + i + ']', 'long for a chat message (' + words(m) + ' words)'); });
  ['wrapRetry', 'wrapPartial'].forEach(k => {
    const w = L[k];
    if (!w) return;
    // consistency pass round 1 (I11): SPEC §12 sets these at 50 words or fewer, so a longer one is an error, not a warning
    if (!isStr(w.text)) err(k + '.text', 'missing'); else if (words(w.text) > 50) err(k + '.text', 'over 50 words (' + words(w.text) + ')');
    if (w.from) personOk(w.from, k + '.from');
  });
  const SEND = /\bsend (it|the mail|the note|this)\b/i;
  if (L.wrapPartial && isStr(L.wrapPartial.text) && SEND.test(L.wrapPartial.text)) warn('wrapPartial.text', 'a pass under 90% should not be told to send the work on');
  if (!L.wrap || !isStr(L.wrap.text)) err('wrap.text', 'missing');
  else { if (L.wrap.from) personOk(L.wrap.from, 'wrap.from'); if (words(L.wrap.text) > 70) warn('wrap.text', 'over 70 words'); }
  if (!Array.isArray(L.principles) || L.principles.length < 1 || L.principles.length > 3) err('principles', 'needs 1–3 lines');
  // documents
  const docs = {};
  (L.documents || []).forEach((d, i) => {
    const p = 'documents[' + i + ']' + (d && d.id ? ' (' + d.id + ')' : '');
    if (!d || !isStr(d.id)) { err(p, 'id missing'); return; }
    if (docs[d.id]) err(p, 'duplicate id');
    docs[d.id] = d;
    if (D.TYPES.indexOf(d.type) < 0) err(p, 'unknown type ' + d.type);
    if (!isStr(d.title)) err(p, 'title missing');
    if (d.type === 'table') {
      if (D.TABLE_STYLES.indexOf(d.style) < 0) err(p, 'unknown table style ' + d.style);
      if (!Array.isArray(d.columns) || !d.columns.length) err(p, 'columns missing');
      (d.columns || []).forEach(col => { if (col.format && FORMATS.indexOf(col.format) < 0) err(p, 'unknown format ' + col.format); });
      // wrap (for-1 round 1): a column whose text wraps at a readable width, as Excel's Wrap Text
      (d.columns || []).forEach(col => { if (col.wrap !== undefined && col.wrap !== true) err(p, 'column ' + col.key + ': wrap must be true (or left out)'); });
      const ids = new Set();
      (d.rows || []).forEach(r => { if (r._id !== undefined) { if (ids.has(r._id)) err(p, 'duplicate row _id ' + r._id); ids.add(r._id); } });
      if (!d.planted) tableProblems(d).forEach(m => err(p, m));
      // notesNumbered (sa-5): the notes print as a numbered list, so a review note can cite "note 2"
      if (d.notesNumbered !== undefined && (typeof d.notesNumbered !== 'boolean' || !Array.isArray(d.notes) || !d.notes.length)) err(p, 'notesNumbered must be true or false, on a table with notes');
      // sa-7 round 1 (designer S4): a sheet prints no header line above its grid (only the fx bar), so a subtitle (who
      // made it, when, the unit) never reaches the student; its first note carries that line instead
      if (d.style === 'sheet' && d.subtitle !== undefined) warn(p, 'subtitle is not printed on a sheet (it has no header line above the grid): put who made it, when and the unit in its first note');
      // pinFit (dt-3 round 2): a frozen sheet's pinned column as wide as its text
      if (d.pinFit !== undefined && (d.pinFit !== true || d.style !== 'sheet' || d.freeze !== true)) err(p, 'pinFit must be true, on a sheet with freeze: true');
      // startPage (fdd-1 round 1): a paged sheet opens on its last page, the column the student works in
      if (d.startPage !== undefined && (d.startPage !== 'last' || d.style !== 'sheet')) err(p, 'startPage must be "last", on a sheet');
      // xl-1: a raw export or an excerpt of a sheet: `headless`, `headRn`, column `letter`, row `_rn`, row `_txt`
      if (d.headless !== undefined && (d.headless !== true || d.style !== 'sheet')) err(p, 'headless must be true, on a sheet');
      if (d.headRn !== undefined && (!Number.isInteger(d.headRn) || d.headRn < 1 || d.style !== 'sheet' || d.headless)) err(p, 'headRn must be a row number, on a sheet with a header row');
      (d.columns || []).forEach(col => { if (col.letter !== undefined && (d.style !== 'sheet' || !/^[A-Z]{1,3}$/.test(col.letter))) err(p, 'column letter must be A–ZZZ, on a sheet'); });
      (d.rows || []).forEach((r, i) => {
        if (r._rn !== undefined && (!Number.isInteger(r._rn) || r._rn < 1 || d.style !== 'sheet')) err(p, 'row ' + (i + 1) + ': _rn must be a row number, on a sheet');
        if (r._txt !== undefined && (d.style !== 'sheet' || !Array.isArray(r._txt) || r._txt.some(k => !(d.columns || []).find(cl => cl.key === k)))) err(p, 'row ' + (i + 1) + ': _txt must list column keys, on a sheet');
      });
    }
    // xl-1 round 1: `formulaCell` (Excel's Name Box beside the formula bar) is a cell address, on a sheet with a formula
    if (d.formulaCell !== undefined && (typeof d.formulaCell !== 'string' || !/^[A-Z]{1,3}[1-9]\d{0,5}$/.test(d.formulaCell) || d.type !== 'table' || d.style !== 'sheet' || !isStr(d.formula))) err(p, 'formulaCell must be a cell address like R5, on a sheet with a formula');
    // xl-1 round 1: `packGroup` folds papers into one entry of the pack: a label two or more papers share
    if (d.packGroup !== undefined && (!isStr(d.packGroup) || (L.documents || []).filter(x => x && x.packGroup === d.packGroup).length < 2)) err(p, 'packGroup must be a label two or more papers share');
    // xl-1 round 1: a mail's attachment is a name, or { name, file } for a chip that downloads the level's file
    // mat-1 round 1: or { name, doc } for a chip that opens a paper of the pack (another document of the level)
    if (Array.isArray(d.attachments)) d.attachments.forEach((a, j) => {
      if (typeof a === 'string') return;
      if (a && typeof a === 'object' && isStr(a.name) && a.doc !== undefined && Object.keys(a).every(k => k === 'name' || k === 'doc')) {
        if (!isStr(a.doc) || a.doc === d.id || !(L.documents || []).some(x => x && x.id === a.doc)) err(p, 'attachment ' + (j + 1) + ': doc must name another paper of the pack');
        return;
      }
      if (!a || typeof a !== 'object' || !isStr(a.name) || !isStr(a.file) || Object.keys(a).some(k => k !== 'name' && k !== 'file')) { err(p, 'attachment ' + (j + 1) + ' must be a name or { name, file } (or { name, doc })'); return; }
      if (ctx.filesDir) { try { require('fs').statSync(path.join(ctx.filesDir, L.id, a.file)); } catch (er) { err(p, 'attachment ' + (j + 1) + ': file ' + a.file + ' is missing in files/' + L.id + '/'); } }
    });
    if (d.type === 'letter' && D.LETTER_STYLES.indexOf(d.style || 'letter') < 0) err(p, 'unknown letter style ' + d.style);
    // a wrong GSTIN planted on purpose (WORLD §13: change one character) is named in the document's `planted` list
    const plantedText = [].concat(d.planted || []).join(' ');
    const plantedGstin = g => !!g && plantedText.indexOf(g) >= 0;
    const partyOk = (pt, where) => (pt && plantedGstin(pt.gstin) ? [] : partyProblems(pt, where));
    if (d.type === 'invoice') {
      ['supplier', 'buyer', 'number', 'date', 'placeOfSupply', 'lines', 'total'].forEach(k => { if (d[k] === undefined) err(p, k + ' missing'); });
      if (d.style !== undefined && INVOICE_STYLES.indexOf(d.style) < 0) err(p, 'unknown invoice style ' + d.style + ' (' + INVOICE_STYLES.join(', ') + ')');
      if (!d.planted) invoiceProblems(d).forEach(m => err(p, m));
      partyOk(d.supplier, p + ' supplier').forEach(m => err(p, m));
      partyOk(d.buyer, p + ' buyer').forEach(m => err(p, m));
      if (d.shipTo) partyOk(d.shipTo, p + ' shipTo').forEach(m => err(p, m));
    }
    if (d.type === 'po') {
      ['number', 'date', 'vendor', 'lines', 'preparedBy'].forEach(k => { if (d[k] === undefined) err(p, k + ' missing'); });
      if (!('approvedBy' in d)) err(p, 'approvedBy missing (null = blank box)');
      if (d.vendor && d.vendor.gstin) gstinProblems(d.vendor.gstin).forEach(m => err(p, m));
      if (d.company) partyProblems(d.company, p + ' company').forEach(m => err(p, m));
    }
    if (d.type === 'grn') {
      ['number', 'date', 'vendor', 'poRef', 'lines', 'receivedBy'].forEach(k => { if (d[k] === undefined) err(p, k + ' missing'); });
      if (!d.planted) (d.lines || []).forEach((l, j) => {
        if (typeof l.qtyReceived === 'number' && typeof l.qtyAccepted === 'number' && !near((l.qtyAccepted) + (l.qtyRejected || 0), l.qtyReceived)) err(p, 'line ' + (j + 1) + ': accepted + rejected ≠ received');
      });
    }
    if (d.type === 'bins') {
      const g = d.grid || {};
      if (!(g.rows > 0 && g.cols > 0)) err(p, 'grid missing');
      const seen = new Set(), pos = new Set();
      (d.bins || []).forEach(b => {
        if (seen.has(b.id)) err(p, 'duplicate bin id ' + b.id); seen.add(b.id);
        const q = D.posOf(b.pos);
        if (!q || q.r >= g.rows || q.c >= g.cols) err(p, 'bin ' + b.id + ' position ' + b.pos + ' is outside the grid');
        if (pos.has(b.pos)) err(p, 'two bins at ' + b.pos); pos.add(b.pos);
        if (!isStr(b.item)) err(p, 'bin ' + b.id + ' item missing');
        // the plan is drawn to fit a 390 px phone: long words in a narrow bin break mid-word
        const maxChars = Math.max(3, Math.floor(((316 - 5 * ((g.cols || 1) - 1)) / (g.cols || 1) - 12) / 7.4));
        String(b.short || b.item || '').split(/\s+/).forEach(w => { if (w.length > maxChars) warn(p, 'bin ' + b.id + ': “' + w + '” is too long for a ' + g.cols + '-column plan on a phone (' + maxChars + ' letters); give the bin a short name'); });
        if (b.pack && (!Array.isArray(b.pack) || !b.pack.length)) err(p, 'bin ' + b.id + ' pack must be ["bag", "bags"]');
        if (b.listed !== undefined && typeof b.listed !== 'boolean') err(p, 'bin ' + b.id + ' listed must be true or false');
        // lots: several groups on one shelf (a pallet beside the rack), each { label?, cartons?, perCarton?, loose?, pack?, condition?, remark? }
        if (b.lots !== undefined) {
          if (!Array.isArray(b.lots) || !b.lots.length) err(p, 'bin ' + b.id + ' lots must be a non-empty list');
          else b.lots.forEach((l, j) => {
            ['cartons', 'perCarton', 'loose'].forEach(k => { if (l[k] !== undefined && !(typeof l[k] === 'number' && l[k] >= 0)) err(p, 'bin ' + b.id + ' lot ' + (j + 1) + ' ' + k + ' must be a number'); });
            if (l.pack && (!Array.isArray(l.pack) || !l.pack.length)) err(p, 'bin ' + b.id + ' lot ' + (j + 1) + ' pack must be ["bag", "bags"]');
          });
        }
      });
      // show: the document is one bin's paper (its card and shelf), so it must name one of its bins
      if (d.show !== undefined && !(d.bins || []).some(b => b.id === d.show)) err(p, 'show names no bin of this document: ' + d.show);
    }
    if (d.type === 'chat') (d.messages || []).forEach((m, j) => { if (!isStr(m.text)) err(p, 'message ' + (j + 1) + ' text missing'); });
    (d.annotations || []).forEach((a, j) => { if (ANN_KINDS.indexOf(a.kind) < 0) err(p, 'annotation ' + (j + 1) + ' unknown kind ' + a.kind); });
    // sa-1 round 5 (designer S3): two annotations at one named place print on top of each other (Bill 3's "ENTERED · VCH
    // 3156" over the vendor's round seal, both bottom-right); inline ones flow and an "x%,y%" place is set by hand. A
    // place left out is where the renderer puts it (ws-docs annotation(): a stamp top-right, anything else bottom-right)
    {
      const POS = ['top-left', 'top', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom', 'bottom-right'];
      const seen = {};
      (d.annotations || []).forEach(a => {
        if (!a || a.kind === 'highlight' || a.at === 'inline' || (a.at && typeof a.at === 'object') || (typeof a.at === 'string' && a.at.indexOf('%') >= 0)) return;
        const at = POS.indexOf(a.at) >= 0 ? a.at : (a.kind === 'stamp' ? 'top-right' : 'bottom-right');
        if (seen[at]) warn(p, 'two annotations at ' + at + ' will print on top of each other (“' + String(seen[at]).replace(/\n/g, ' ') + '” and “' + String(a.text || a.kind).replace(/\n/g, ' ') + '”): move one');
        else seen[at] = a.text || a.kind;
      });
    }
    // a document written by hand (a bill book) prints its PANs and GSTINs in Kalam, where I reads as 1 and O as 0:
    // they must carry neither (sa-1 round 3: "ZIJPS6600I" read "Z1JPS6600l")
    if (d.style === 'book' || d.handwritten) {
      const ids = [];
      JSON.stringify(d).replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g, g => { if (!plantedGstin(g)) ids.push(g); return g; });
      [d.supplier, d.buyer, d.shipTo, d.vendor].forEach(pt => { if (pt && pt.pan) ids.push(pt.pan); });
      ids.filter(x => /[IO]/.test(x)).forEach(x => err(p, 'handwritten document prints ' + x + ', which has I or O (they read as 1 and 0 by hand): use a party whose PAN and GSTIN have neither'));
    }
    // any GSTIN-looking string anywhere in the document
    JSON.stringify(d).replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g, g => { if (!plantedGstin(g)) gstinProblems(g).forEach(m => err(p, m)); return g; });
    (d.rows || []).forEach((r, j) => { if (r.gstin && r.pan) partyOk(r, p + ' row ' + (j + 1)).forEach(m => err(p, m)); });
  });
  // tasks
  const tasks = L.tasks || [];
  if (!tasks.length || (!ctx.fixture && tasks.length > 4)) err('tasks', 'needs 1–4 tasks');
  const tids = new Set();
  let exclaim = 0;
  const note = (s, where, max) => {
    if (s === undefined || s === null) return;
    if (!isStr(s)) { err(where, 'note missing'); return; }
    if (words(s) > (max || 45)) err(where, 'over ' + (max || 45) + ' words (' + words(s) + ')');
    exclaim += (s.match(/!/g) || []).length;
  };
  tasks.forEach((t, ti) => {
    const p = 'tasks[' + ti + ']' + (t && t.id ? ' (' + t.id + ')' : '');
    if (!t || !isStr(t.id)) { err(p, 'id missing'); return; }
    if (tids.has(t.id)) err(p, 'duplicate task id'); tids.add(t.id);
    if (TASK_TYPES.indexOf(t.type) < 0) err(p, 'unknown type ' + t.type);
    if (E.STAGES.indexOf(t.stage) < 0) err(p, 'stage must be Planning, Fieldwork, Review or Report');
    if (!isStr(t.title)) err(p, 'title missing');
    if (!isStr(t.prompt)) err(p, 'prompt missing'); else if (words(t.prompt) > 60) err(p, 'prompt over 60 words (' + words(t.prompt) + ')');
    if (!Array.isArray(t.hints) || t.hints.length < 1 || t.hints.length > 2) err(p, 'needs 1–2 hints');
    (t.docs || []).forEach(id => { if (!docs[id]) err(p, 'task doc ' + id + ' does not exist'); });
    if (t.weight !== undefined && !(typeof t.weight === 'number' && t.weight > 0)) err(p, 'weight must be a positive number');
    if (t.sampleColumns !== undefined && t.type !== 'items') err(p, 'sampleColumns applies to an items task');
    // val-1 round 3 (designer S2): `sampleBreak` (a row id) splits a one-value-column worksheet's work sample into two
    // tables side by side, the named row opening the second; on any other task, or naming the first row, it does nothing
    if (t.sampleBreak !== undefined) {
      const sbRows = t.rows || [];
      if (t.type !== 'worksheet' || (t.columns || []).length !== 2) err(p, 'sampleBreak applies to a worksheet with one value column');
      else if (!sbRows.some(r => r && r.id === t.sampleBreak)) err(p, 'sampleBreak names no row of the task (' + t.sampleBreak + ')');
      else if (sbRows[0].id === t.sampleBreak) err(p, 'sampleBreak names the first row: nothing would print before it');
    }
    if (t.type === 'items') {
      const fields = t.fields || [], fids = {};
      if (!fields.length) err(p, 'fields missing');
      fields.forEach(f => {
        if (fids[f.id]) err(p, 'duplicate field ' + f.id); fids[f.id] = f;
        if (FIELD_KINDS.indexOf(f.kind) < 0) err(p, 'field ' + f.id + ' unknown kind ' + f.kind);
        if (!isStr(f.label)) err(p, 'field ' + f.id + ' label missing');
        if ((f.kind === 'choice' || f.kind === 'multi')) {
          if (!Array.isArray(f.options) || f.options.length < 2) err(p, 'field ' + f.id + ' needs options');
          const oids = new Set(); (f.options || []).forEach(o => { if (oids.has(o.id)) err(p, 'field ' + f.id + ' duplicate option ' + o.id); oids.add(o.id); if (!isStr(o.label)) err(p, 'field ' + f.id + ' option ' + o.id + ' label missing'); });
        }
        if (f.gate && f.kind !== 'choice') err(p, 'gate field ' + f.id + ' must be a choice');
        if (f.neutral !== undefined && typeof f.neutral !== 'boolean') err(p, 'field ' + f.id + ' neutral must be true or false');
        if (f.neutral !== undefined && !f.gate) err(p, 'field ' + f.id + ' neutral applies to the gate field only');
        // short: the field's label in the folded call on a phone (gst-1: "Which GSTR-1" for "Goes in which GSTR-1")
        if (f.short !== undefined && !isStr(f.short)) err(p, 'field ' + f.id + ' short must be a non-empty label');
        // acc-1 round 1: `lead` ("Dr", "Cr") is said before the field's answer wherever answers are joined into one line
        // (the all-right review line, the model key, the work sample's detail), so a journal entry says its sides
        if (f.lead !== undefined && !(isStr(f.lead) && f.lead.length <= 6 && !/\s/.test(f.lead) && (f.kind === 'choice' || f.kind === 'number') && !f.gate)) err(p, 'field ' + f.id + ' lead must be one short word (6 letters at most), on a choice or number field that is not the gate');
        // fold (fdd-1 round 1): a three-way gate that folds once made on a phone, as a four-way gate always does
        if (f.fold !== undefined && !(f.fold === true && f.gate && f.kind === 'choice' && (f.options || []).length === 3)) err(p, 'field ' + f.id + ' fold must be true, on a three-option gate');
        // buttons: a choice of five or six short options drawn as big buttons, three to a row, not a select (dt-2's rates)
        if (f.buttons !== undefined) {
          if (f.buttons !== true) err(p, 'field ' + f.id + ' buttons must be true (or left out)');
          else if (f.kind !== 'choice' || f.gate) err(p, 'field ' + f.id + ' buttons applies to a choice field that is not the gate');
          else if ((f.options || []).length > 6) err(p, 'field ' + f.id + ' buttons: six options at most (' + (f.options || []).length + ')');
          else (f.options || []).forEach(o => { if (isStr(o.label) && o.label.length > 18) err(p, 'field ' + f.id + ' buttons: option ' + o.id + ' label is over 18 characters'); });
        }
        // sa-6 round 1: `layout: "list"` sets a choice's options as radio rows (long next steps); a number box may be
        // whole numbers only (`integer: true`) and carry the line shown under it when what is typed is no such figure
        if (f.layout !== undefined && !(f.layout === 'list' && f.kind === 'choice' && !f.gate)) err(p, 'field ' + f.id + ' layout must be "list", on a choice field that is not the gate');
        if (f.layout === 'list' && f.buttons !== undefined) err(p, 'field ' + f.id + ' takes layout or buttons, not both');
        if (f.integer !== undefined && !(f.integer === true && f.kind === 'number')) err(p, 'field ' + f.id + ' integer must be true, on a number field');
        if (f.invalidNote !== undefined && !(f.kind === 'number' && isStr(f.invalidNote) && f.invalidNote.length <= 60)) err(p, 'field ' + f.id + ' invalidNote must be a line of 60 characters or fewer, on a number field');
        // con-1 round 1: maxAbs, a size above which a typed figure is no answer (flagged as unreadable); no key may pass it
        if (f.maxAbs !== undefined && !(f.kind === 'number' && typeof f.maxAbs === 'number' && f.maxAbs > 0)) err(p, 'field ' + f.id + ' maxAbs must be a positive number, on a number field');
        else if (f.maxAbs !== undefined && (t.items || []).some(it => [].concat((it.answer || {})[f.id]).some(v => typeof v === 'number' && Math.abs(v) > f.maxAbs))) err(p, 'field ' + f.id + ' has a key answer bigger than its maxAbs');
        if (f.weight !== undefined && !(typeof f.weight === 'number' && f.weight > 0)) err(p, 'field ' + f.id + ' weight must be a positive number');
        if (f.weight !== undefined && f.kind === 'text') err(p, 'field ' + f.id + ' is a text field (never scored), so it takes no weight');
        // quiet: a pick left out of the work sample's detail (sa-2's "Nothing else"); a gate's call always prints
        (f.options || []).forEach(o => { if (o.quiet !== undefined && (typeof o.quiet !== 'boolean' || f.gate || f.kind !== 'choice')) err(p, 'field ' + f.id + ' option ' + o.id + ' quiet must be true or false, on a choice field that is not the gate'); });
      });
      // map: the list opens on this bins document's floor, each item on its bin (item.bin, else the item's id)
      if (t.map !== undefined) {
        const md = docs[t.map];
        if (!md || md.type !== 'bins' || md.show) err(p, 'map must name a bins document that shows the whole plan: ' + t.map);
        else (t.items || []).forEach(it => { const bid = it.bin || it.id; if (!(md.bins || []).some(b => b.id === bid)) err(p, 'item ' + it.id + ' has no bin “' + bid + '” on the map ' + t.map); });
        if (t.mapHint !== undefined) { if (!isStr(t.mapHint)) err(p, 'mapHint must be text'); else if (words(t.mapHint) > 20) err(p, 'mapHint over 20 words'); }
      } else if (t.mapHint !== undefined) err(p, 'mapHint without a map');
      // chip: true on one number field adds the figure typed to the call on the list (dt-4)
      // mat-1 round 1: or on one choice field of a task with no main call, whose pick then stands on the list for "Done"
      const noGate = !fields.some(f => f.gate);
      fields.forEach(f => { if (f.chip !== undefined && (f.chip !== true || !(f.kind === 'number' || (f.kind === 'choice' && noGate)))) err(p, 'field ' + f.id + ' chip must be true, on a number field (or a choice field of a task with no main call)'); });
      if (fields.filter(f => f.chip === true).length > 1) err(p, 'only one field may carry chip');
      // sampleGroups (dt-3 round 2): the work sample prints the items under the student's calls, in this order, the first
      // group numbered as an index ([{ call, label }]; the twelve-or-fewer table only, so a gate is needed)
      if (t.sampleGroups !== undefined) {
        const gf = fields.filter(f => f.gate)[0], seen = {};
        if (!Array.isArray(t.sampleGroups) || !t.sampleGroups.length) err(p, 'sampleGroups must be a list of { call, label }');
        else if (!gf) err(p, 'sampleGroups needs a gate field');
        else if ((t.items || []).length > 12) err(p, 'sampleGroups applies to a task of twelve items or fewer (more print in two columns)');
        else t.sampleGroups.forEach((g, gi) => {
          if (!g || !(gf.options || []).some(o => o.id === g.call)) err(p, 'sampleGroups[' + gi + '] call is not an option of the gate ' + gf.id);
          else if (seen[g.call]) err(p, 'sampleGroups[' + gi + '] repeats the call ' + g.call);
          else seen[g.call] = 1;
          if (!g || !isStr(g.label)) err(p, 'sampleGroups[' + gi + '] label missing');
          // dt-3 round 3: `whole: true` keeps that group in one column of the work sample (eight items or fewer)
          if (g && g.whole !== undefined && g.whole !== true) err(p, 'sampleGroups[' + gi + '] whole must be true');
        });
      }
      // sampleColumns (ia-2 round 1): the work sample prints the items as a matrix, one column per non-text field headed
      // by the field's short label (an RCM: Control | Type | Nature | Test); the twelve-or-fewer table only
      if (t.sampleColumns !== undefined) {
        if (t.sampleColumns !== true) err(p, 'sampleColumns must be true (or left out)');
        else if ((t.items || []).length > 12) err(p, 'sampleColumns applies to a task of twelve items or fewer (more print in two columns)');
        else if (t.sampleGroups !== undefined) err(p, 'sampleColumns and sampleGroups do not go together');
        else if (!fields.some(f => !f.gate && f.kind !== 'text')) err(p, 'sampleColumns needs a scored field besides the call');
        fields.forEach(f => { if (!f.gate && f.kind !== 'text' && isStr(f.short) && f.short.length > 14) warn(p, 'field ' + f.id + ' short “' + f.short + '” heads a work-sample column: keep it to 14 letters'); });
      }
      fields.forEach(f => (f.options || []).forEach(o => {
        if (o.needs === undefined) return;
        if (!Array.isArray(o.needs) || !o.needs.length) { err(p, 'field ' + f.id + ' option ' + o.id + ' needs must be a list of field ids'); return; }
        o.needs.forEach(id => { const g = fids[id]; if (!g || g.kind === 'text' || g === f) err(p, 'field ' + f.id + ' option ' + o.id + ' needs “' + id + '”, which is not another scored field of ' + t.id); });
      }));
      fields.forEach(f => {
        if (!f.showIf) return;
        Object.keys(f.showIf).forEach(k => {
          const src = fids[k];
          if (!src) { err(p, 'field ' + f.id + ' showIf refers to unknown field ' + k); return; }
          [].concat(f.showIf[k]).forEach(v => { if (!(src.options || []).find(o => o.id === v)) err(p, 'field ' + f.id + ' showIf value ' + v + ' is not an option of ' + k); });
        });
      });
      (t.columns || []).forEach(col => { if (col.format && FORMATS.indexOf(col.format) < 0) err(p, 'unknown column format ' + col.format); });
      const iids = new Set();
      if (!(t.items || []).length) err(p, 'items missing');
      (t.items || []).forEach((it, ii) => {
        const ip = p + ' item ' + (it.id || ii);
        if (!isStr(it.id)) err(ip, 'id missing'); if (iids.has(it.id)) err(ip, 'duplicate item id'); iids.add(it.id);
        if (!isStr(it.label)) err(ip, 'label missing');
        if (it.weight !== undefined && !(typeof it.weight === 'number' && it.weight > 0)) err(ip, 'weight must be a positive number');
        if (it.short !== undefined && !(isStr(it.short) && it.short.length <= 16)) err(ip, 'short must be text of 16 characters or fewer (it names the item on the list’s main button)');
        // gst-2 round 1: the main button already says "Check " before the short name ("Check Check Hosur" on every visit)
        if (isStr(it.short) && /^check\b/i.test(it.short.trim())) warn(ip, 'short “' + it.short + '”: the main button adds “Check”; give the name only');
        (it.docs || []).forEach(id => { if (!docs[id]) err(ip, 'doc ' + id + ' does not exist'); });
        // sa-6 round 1: `docRow: { "<doc id>": "<row _id>" }` frames the item's own row in a shared table paper; dt-2
        // round 3: or a non-empty list of row ids, all framed (a deductor's two quarter rows in Form 168)
        if (it.docRow !== undefined) {
          if (!it.docRow || typeof it.docRow !== 'object' || Array.isArray(it.docRow)) err(ip, 'docRow must be an object { doc id: row _id }');
          else Object.keys(it.docRow).forEach(id => {
            const d = docs[id], v = it.docRow[id];
            if (!d || d.type !== 'table') err(ip, 'docRow names ' + id + ', which is not a table document');
            else if (!(t.docs || []).concat(it.docs || []).includes(id)) err(ip, 'docRow names ' + id + ', which neither the item nor its task shows');
            else if (Array.isArray(v) && !v.length) err(ip, 'docRow: ' + id + ' lists no row ids');
            else [].concat(v).forEach(rid => {
              if (!(d.rows || []).some(r => r._id === rid)) err(ip, 'docRow: ' + id + ' has no row with _id ' + rid);
            });
          });
        }
        // ba-1 round 1: `recall: { task, cell, label, prefix?, unit? }` shows the student's own entry in a worksheet
        // input cell of an earlier task on the item's screen (never the key), so it must name one that exists
        if (it.recall !== undefined) {
          const rc = it.recall, ti = (level.tasks || []).indexOf(t);
          const rt = rc && isStr(rc.task) ? (level.tasks || []).find(x => x.id === rc.task) : null;
          if (!rc || typeof rc !== 'object' || Array.isArray(rc)) err(ip, 'recall must be an object { task, cell, label }');
          else if (!rt || rt.type !== 'worksheet' || (level.tasks || []).indexOf(rt) >= ti) err(ip, 'recall names task ' + rc.task + ', which is not a worksheet before ' + t.id);
          else if (!E.inputCells(rt).some(cl => cl.key === rc.cell)) err(ip, 'recall names cell ' + rc.cell + ', which is not an input cell of ' + rt.id);
          if (rc && typeof rc === 'object' && !isStr(rc.label)) err(ip, 'recall needs a label (what the figure is)');
          if (rc && typeof rc === 'object' && ((rc.prefix !== undefined && !isStr(rc.prefix)) || (rc.unit !== undefined && !isStr(rc.unit)))) err(ip, 'recall prefix and unit are text');
        }
        note(it.note, ip + ' note');
        if (!isStr(it.note)) err(ip, 'note missing');
        const a = it.answer;
        if (!a || typeof a !== 'object') { err(ip, 'answer missing'); return; }
        Object.keys(a).forEach(k => {
          const f = fids[k];
          if (!f) { err(ip, 'answer has unknown field ' + k); return; }
          if (f.kind === 'text') err(ip, 'text field ' + k + ' cannot have an answer');
          if (f.kind === 'choice') [].concat(a[k]).forEach(v => { if (!(f.options || []).find(o => o.id === v)) err(ip, 'answer ' + k + '=' + v + ' is not an option'); });
          if (f.kind === 'multi') { if (!Array.isArray(a[k])) err(ip, 'answer ' + k + ' must be an array'); else a[k].forEach(v => { if (!(f.options || []).find(o => o.id === v)) err(ip, 'answer ' + k + ' has unknown option ' + v); }); }
          if (f.kind === 'number' && [].concat(a[k]).some(v => E.parseNumber(v) === null)) err(ip, 'answer ' + k + ' must be a number');
        });
        fields.forEach(f => {
          if (f.kind === 'text') return;
          if (f.gate && !(f.id in a)) err(ip, 'gate field ' + f.id + ' has no answer');
          if (!(f.id in a) && E.fieldVisible(f, a)) warn(ip, 'field ' + f.id + ' is visible but not scored (no answer)');
        });
        if (E.scoreItem(t, it, a).score < 1) err(ip, 'the key does not score 1 on its own item');
      });
    }
    if (t.type === 'worksheet') {
      const cols = t.columns || [];
      if (!cols.length) err(p, 'columns missing');
      if (t.layout !== undefined && !((t.layout === 'grid' && cols.length >= 3 && cols.length <= 5) || (t.layout === 'table' && cols.length === 2))) err(p, 'layout is "grid" (two to four value columns) or "table" (one value column)');
      // noteAt: "top" prints the task's note above the sheet (dt-4); without it the note stays below
      if (t.noteAt !== undefined && (t.noteAt !== 'top' || !isStr(t.note))) err(p, 'noteAt is "top", on a worksheet with a note');
      if (t.invalidNote !== undefined && !(isStr(t.invalidNote) && t.invalidNote.length <= 60)) err(p, 'invalidNote must be a line of 60 characters or fewer');
      // con-1 round 1: maxAbs (on the task or a cell) makes a bigger figure unreadable, so no key answer may be bigger
      if (t.maxAbs !== undefined && !(typeof t.maxAbs === 'number' && t.maxAbs > 0)) err(p, 'maxAbs must be a positive number');
      const rids = new Set();
      (t.rows || []).forEach(r => { if (rids.has(r.id)) err(p, 'duplicate row ' + r.id); rids.add(r.id); });
      const cells = E.inputCells(t);
      if (!cells.length) err(p, 'no input cells');
      cells.forEach(cl => {
        if ([].concat(cl.cell.answer).some(v => typeof v !== 'number')) err(p, 'cell ' + cl.key + ' answer must be a number');
        if (cl.cell.tolerance !== undefined && typeof cl.cell.tolerance !== 'number') err(p, 'cell ' + cl.key + ' tolerance must be a number');
        if (cl.cell.signed !== undefined && typeof cl.cell.signed !== 'boolean') err(p, 'cell ' + cl.key + ' signed must be true or false');
        // acc-1 round 1: a cell's weight inside its task (default 1), as an item's
        if (cl.cell.weight !== undefined && !(typeof cl.cell.weight === 'number' && cl.cell.weight > 0)) err(p, 'cell ' + cl.key + ' weight must be a positive number');
        // mat-1 round 2: what the line under a box says when it holds text that is no figure (as a number field's)
        if (cl.cell.invalidNote !== undefined && !(isStr(cl.cell.invalidNote) && cl.cell.invalidNote.length <= 60)) err(p, 'cell ' + cl.key + ' invalidNote must be a line of 60 characters or fewer');
        if (cl.cell.maxAbs !== undefined && !(typeof cl.cell.maxAbs === 'number' && cl.cell.maxAbs > 0)) err(p, 'cell ' + cl.key + ' maxAbs must be a positive number');
        else if (typeof cl.max === 'number' && [].concat(cl.cell.answer).some(v => typeof v === 'number' && Math.abs(v) > cl.max)) err(p, 'cell ' + cl.key + ' answer is bigger than its maxAbs ' + cl.max + ': the key would be flagged as unreadable');
      });
      // follow (method marks, val-1): the cell's working over other input cells of this task; on the key's own answers
      // it must give the key (so a right chain is never scored differently), and it may not lean on itself in a loop
      const byKey = {}; cells.forEach(cl => { byKey[cl.key] = cl; });
      const keyA = {}; cells.forEach(cl => { keyA[cl.key] = String([].concat(cl.cell.answer)[0]); });
      cells.forEach(cl => {
        if (cl.cell.follow === undefined) return;
        if (!isStr(cl.cell.follow)) { err(p, 'cell ' + cl.key + ' follow must be a working (text)'); return; }
        const refs = E.followRefs(cl.cell.follow);
        if (!refs.length) err(p, 'cell ' + cl.key + ' follow uses no other cell: write the cells it is worked from as {row.col}');
        refs.forEach(k => { if (!byKey[k]) err(p, 'cell ' + cl.key + ' follow uses ' + k + ', which is not an input cell of ' + t.id); });
        const seen = new Set(), loop = k => { if (k === cl.key) return true; if (seen.has(k)) return false; seen.add(k); const r = byKey[k]; return !!(r && isStr(r.cell.follow) && E.followRefs(r.cell.follow).some(loop)); };
        if (refs.some(loop)) err(p, 'cell ' + cl.key + ' follow comes back to itself');
        if (refs.some(k => !byKey[k])) return;
        const v = E.followValue(cl, keyA, byKey);
        if (v === null) { err(p, 'cell ' + cl.key + ' follow “' + cl.cell.follow + '” cannot be worked'); return; }
        const exp = E.parseNumber(keyA[cl.key]);
        let tol = typeof cl.cell.tolerance === 'number' ? cl.cell.tolerance : 0;
        if (typeof cl.cell.toleranceRel === 'number') tol = Math.max(tol, Math.abs(v) * cl.cell.toleranceRel);
        if (Math.abs(v - exp) > tol + 0.01 * refs.length + 1e-9) err(p, 'cell ' + cl.key + ' follow gives ' + Math.round(v * 10000) / 10000 + ' on the key’s answers, not ' + exp);
      });
      // ba-1 round 1: noFollowIf names the column of the client's own working (a figure that only repeats it earns no
      // method mark), so it needs a follow working and a real column of the task
      cells.forEach(cl => {
        if (cl.cell.noFollowIf === undefined) return;
        if (!isStr(cl.cell.noFollowIf) || !cols.some(c => c.key === cl.cell.noFollowIf)) err(p, 'cell ' + cl.key + ' noFollowIf names ' + cl.cell.noFollowIf + ', which is not a column of ' + t.id);
        if (!isStr(cl.cell.follow)) err(p, 'cell ' + cl.key + ' noFollowIf needs a follow working (it only takes method marks away)');
      });
      cols.forEach(c => { if (c.signed !== undefined && typeof c.signed !== 'boolean') err(p, 'column ' + c.key + ' signed must be true or false'); });
      // a column whose answers go both up and down holds changes (effects, movements, adjustments): unsigned, an
      // increase prints like a balance ("Profit before tax ₹18,64,000" on the work sample)
      cols.forEach(c => {
        const vals = cells.filter(cl => cl.col === c && !E.cellSigned(c, cl.cell)).map(cl => E.parseNumber([].concat(cl.cell.answer)[0])).filter(v => v !== null);
        if (vals.some(v => v > 0) && vals.some(v => v < 0)) warn(p, 'column ' + c.key + ' has increases and decreases in its key: give it signed: true so an increase prints with a plus');
      });
      Object.keys(t.notes || {}).forEach(k => { if (!cells.find(cl => cl.key === k)) err(p, 'note for unknown cell ' + k); note(t.notes[k], p + ' note ' + k); });
    }
    if (t.type === 'choice') {
      if (!(t.questions || []).length) err(p, 'questions missing');
      const qids = new Set();
      (t.questions || []).forEach(q => {
        if (qids.has(q.id)) err(p, 'duplicate question ' + q.id); qids.add(q.id);
        if (!isStr(q.text)) err(p, 'question ' + q.id + ' text missing');
        const right = E.rightIds(q);
        if (!q.multi && right.length !== 1) err(p, 'question ' + q.id + ' needs exactly one right option');
        if (q.multi && right.length < 1) err(p, 'question ' + q.id + ' needs at least one right option');
        const oids = new Set();
        (q.options || []).forEach(o => { if (o.correct && /^\s*right\b/i.test(o.why || '')) warn(p, 'question ' + q.id + ': the right option’s why starts with “Right”; the tick already says it'); });
        (q.options || []).forEach(o => { if (oids.has(o.id)) err(p, 'question ' + q.id + ' duplicate option ' + o.id); oids.add(o.id); if (!isStr(o.text)) err(p, 'question ' + q.id + ' option text missing'); if (!isStr(o.why)) warn(p, 'question ' + q.id + ' option ' + o.id + ' has no why'); else note(o.why, p + ' ' + q.id + '.' + o.id + ' why'); });
        if (q.note) note(q.note, p + ' ' + q.id + ' note');
        // consistency pass round 2 (P2-01): `sample` is what the one-page work sample prints in place of a long question:
        // 12 words or fewer, the point the question asks, never the answer
        if (q.sample !== undefined) {
          if (!isStr(q.sample) || !q.sample.trim()) err(p, 'question ' + q.id + ' sample must be text');
          else if (words(q.sample) > 12) err(p, 'question ' + q.id + ' sample is over 12 words (' + words(q.sample) + '): print the point it asks, not the question');
          else if ((q.options || []).some(o => o.correct && isStr(o.text) && words(o.text) >= 2 && q.sample.toLowerCase().indexOf(o.text.toLowerCase().replace(/[.]$/, '')) >= 0)) warn(p, 'question ' + q.id + ' sample gives the answer away');
        } else if (isStr(q.text) && words(q.text) > 25) warn(p, 'question ' + q.id + ' is over 25 words (' + words(q.text) + ') with no sample: give it `sample` (12 words or fewer, the point it asks, never the answer) so the work sample prints at a readable size');
        // xl-1 round 1: `code: true` sets a question's options (formulas) in the mono face
        if (q.code !== undefined && typeof q.code !== 'boolean') err(p, 'question ' + q.id + ' code must be true or false');
      });
      // the right option is read, not spotted (SPEC 7.3): with three or more one-answer questions it must not sit in one
      // place every time, nor be the longest option every time (sa-2 round 1: “a” and the longest, five times out of five)
      const singles = (t.questions || []).filter(q => !q.multi && E.rightIds(q).length === 1 && (q.options || []).length > 1);
      if (singles.length >= 3) {
        const at = singles.map(q => q.options.findIndex(o => o.correct));
        if (at.every(x => x === at[0])) warn(p, 'the right option is option ' + (at[0] + 1) + ' in every question: vary its place so it is read, not spotted');
        const longest = singles.filter(q => { const r = q.options.find(o => o.correct), len = o => String(o.text || '').length; return q.options.every(o => o === r || len(o) < len(r)); });
        if (longest.length === singles.length) warn(p, 'the right option is the longest in every question: even out the lengths so it is read, not spotted');
      }
    }
    if (t.type === 'order') {
      const ids = (t.steps || []).map(s => s.id);
      if (ids.length < 2) err(p, 'needs at least 2 steps');
      const a = t.answer || [];
      if (a.length !== ids.length || new Set(a).size !== a.length || a.some(x => ids.indexOf(x) < 0)) err(p, 'answer is not a permutation of the steps');
      Object.keys(t.notes || {}).forEach(k => { if (ids.indexOf(k) < 0) err(p, 'note for unknown step ' + k); note(t.notes[k], p + ' note ' + k); });
      const sh = E.shuffledOrder(ids, E.orderSeed(L, t), a);
      if (sh.join('|') === a.join('|')) err(p, 'shuffle equals the answer');
    }
    if (t.type === 'compose') {
      const slots = t.slots || [];
      if (!slots.length) err(p, 'slots missing');
      slots.forEach(s => {
        (s.options || []).forEach(o => { if (o.correct && /^\s*right\b/i.test(o.why || '')) warn(p, 'slot ' + s.id + ': the right option’s why starts with “Right”; the tick already says it, and the review shows it under the student’s own pick'); });
        if ((s.options || []).length < 2) err(p, 'slot ' + s.id + ' needs at least 2 options');
        if (!(s.options || []).some(o => o.correct)) err(p, 'slot ' + s.id + ' has no right option');
        (s.options || []).forEach(o => { if (o.why) note(o.why, p + ' ' + s.id + '.' + o.id + ' why'); });
        if (t.template && t.template.indexOf('{' + s.id + '}') < 0) err(p, 'template does not use slot ' + s.id);
        // ia-1 round 1: an optional heading printed above the slot (where a second observation or mail starts)
        if (s.heading !== undefined && (typeof s.heading !== 'string' || !s.heading.trim() || s.heading.length > 90)) err(p, 'slot ' + s.id + ': heading must be one short line of text');
        // sa-7 round 1 (designer S2): the paper(s) a slot is built from, linked under its title; each must be a paper the
        // task shows (its docs, or the pack as the story stands when it lists none)
        if (s.docs !== undefined) {
          if (!Array.isArray(s.docs) || !s.docs.length || s.docs.some(id => typeof id !== 'string')) err(p, 'slot ' + s.id + ': docs must be a list of doc ids');
          else s.docs.forEach(id => {
            const shown = Array.isArray(t.docs) && t.docs.length ? t.docs.includes(id) : !!docs[id] && (!docs[id].arrives || docs[id].arrives === t.id);
            if (!shown) err(p, 'slot ' + s.id + ' names paper ' + id + ', which the task does not show');
          });
        }
      });
      if (t.template) (t.template.match(/\{([\w-]+)\}/g) || []).forEach(m => {
        const id = m.slice(1, -1);
        if (id === '_free') { if (!t.freeText) err(p, 'template uses {_free} but the task has no freeText'); return; }
        if (!slots.find(s => s.id === id)) err(p, 'template uses unknown slot ' + id);
      });
    }
    if (t.type === 'hunt') {
      const ds = docs[t.dataset];
      if (!ds || ds.type !== 'table') err(p, 'dataset must be a table document');
      const rk = t.rowKey || '_id';
      const rows = ds ? new Set((ds.rows || []).map(r => r[rk])) : new Set();
      const reasons = new Set((t.reasons || []).map(r => r.id));
      if (!reasons.size) err(p, 'reasons missing');
      (t.reasons || []).forEach(r => { if (!isStr(r.label)) err(p, 'reason ' + r.id + ' label missing'); });
      Object.keys(t.answer || {}).forEach(r => {
        if (!rows.has(r)) err(p, 'answer row ' + r + ' is not in the dataset');
        [].concat(t.answer[r]).forEach(x => { if (!reasons.has(x)) err(p, 'answer row ' + r + ' has unknown reason ' + x); });
      });
      if (!Object.keys(t.answer || {}).length) err(p, 'answer is empty');
      (t.tools || []).forEach(x => { if (HUNT_TOOLS.indexOf(x) < 0) err(p, 'unknown tool ' + x); });
      if (t.matchWith) {
        const mw = t.matchWith;
        if (!docs[mw.left] || !docs[mw.right]) err(p, 'matchWith documents missing');
        (mw.keys || []).forEach(k => {
          if (docs[mw.left] && !(docs[mw.left].columns || []).find(cl => cl.key === k.left)) err(p, 'matchWith left key ' + k.left + ' is not a column');
          if (docs[mw.right] && !(docs[mw.right].columns || []).find(cl => cl.key === k.right)) err(p, 'matchWith right key ' + k.right + ' is not a column');
        });
      }
      Object.keys(t.notes || {}).forEach(k => { if (!rows.has(k)) err(p, 'note for unknown row ' + k); note(t.notes[k], p + ' note ' + k); });
      // for-1: the note under any flagged row that is in no answer and has no note of its own
      if (t.fineNote !== undefined) { if (!isStr(t.fineNote)) err(p, 'fineNote must be text'); else note(t.fineNote, p + ' fineNote'); }
      // for-1 round 1: every column `keys` names (date, amount, party, text, ref, bill) is a dataset column; `metaLabels`
      // puts one short word before a cell in the row's line ("by apexec02")
      const dcols = new Set(((ds && ds.columns) || []).map(cl => cl.key));
      if (t.keys !== undefined) {
        if (!t.keys || typeof t.keys !== 'object' || Array.isArray(t.keys)) err(p, 'keys must be an object');
        else Object.keys(t.keys).forEach(k => {
          if (['date', 'amount', 'party', 'text', 'ref', 'bill'].indexOf(k) < 0) err(p, 'keys.' + k + ' is not a hunt key');
          else if (!dcols.has(t.keys[k])) err(p, 'keys.' + k + ' names ' + t.keys[k] + ', not a column of the dataset');
        });
      }
      if (t.metaLabels !== undefined) {
        if (!t.metaLabels || typeof t.metaLabels !== 'object' || Array.isArray(t.metaLabels)) err(p, 'metaLabels must be an object');
        else Object.keys(t.metaLabels).forEach(k => {
          if (!dcols.has(k)) err(p, 'metaLabels.' + k + ' is not a column of the dataset');
          if (!isStr(t.metaLabels[k]) || t.metaLabels[k].length > 12) err(p, 'metaLabels.' + k + ' must be one short word');
        });
      }
    }
  });
  // lockOnLeave: true, or { ask, note, yes, done } (strings); a later task that names an earlier items task's items
  // gives that task's key away unless the earlier task is handed in first
  tasks.forEach((t, ti) => {
    if (!t || t.lockOnLeave === undefined) return;
    const p = 'tasks[' + ti + '] (' + t.id + ')';
    const lo = t.lockOnLeave;
    if (typeof lo !== 'boolean' && !(lo && typeof lo === 'object' && !Array.isArray(lo))) err(p, 'lockOnLeave must be true or { ask, note, yes, done }');
    else if (typeof lo === 'object') Object.keys(lo).forEach(k => { if (['ask', 'note', 'yes', 'done'].indexOf(k) < 0) err(p, 'lockOnLeave has unknown key ' + k); else if (!isStr(lo[k])) err(p, 'lockOnLeave.' + k + ' must be text'); });
    if (lo && ti === tasks.length - 1) warn(p, 'lockOnLeave on the last task does nothing (submitting closes the attempt)');
  });
  // a paper that arrives later in the story (dt-3: the intimation of March, after the January reply): `arrives` names
  // the task it comes with; it is left out of the case file's pack and of every earlier task, and that task lists it.
  // It stays unseen only if a hand-in (lockOnLeave) keeps that task closed until the earlier work is done.
  (L.documents || []).forEach((d, i) => {
    if (!d || d.arrives === undefined) return;
    const p = 'documents[' + i + '] (' + d.id + ')';
    const ti = tasks.findIndex(t => t && t.id === d.arrives);
    if (typeof d.arrives !== 'string' || ti < 0) { err(p, 'arrives must name a task'); return; }
    if ((tasks[ti].docs || []).indexOf(d.id) < 0) err(p, 'arrives with ' + d.arrives + ', so ' + d.arrives + ' must list it in its docs');
    tasks.slice(0, ti).forEach(t => {
      const used = (t.docs || []).indexOf(d.id) >= 0 || (t.items || []).some(it => (it.docs || []).indexOf(d.id) >= 0);
      if (used) err(p, 'arrives with ' + d.arrives + ' but the earlier task ' + t.id + ' shows it');
    });
    if (!tasks.slice(0, ti).some(t => t && t.lockOnLeave)) warn(p, 'arrives with ' + d.arrives + ', but no earlier task is handed in first, so it can be read early');
  });
  // task titles show on the domain map before the level starts: a task after a lockOnLeave task names no item and no
  // count of findings in its title (sa-1 round 3: "What the two cut-off bills do to March" told the student how many
  // cut-off bills to find)
  const NUMWORD = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/i;
  tasks.forEach((t, ti) => {
    if (!t || !t.lockOnLeave) return;
    const labels = [];
    tasks.slice(0, ti + 1).forEach(x => (x.items || []).forEach(it => {
      const lab = String(it.label || ''); if (!lab) return;
      labels.push(lab);
      const parts = lab.split(' · ');
      if (parts.length > 1) { if (/\d/.test(parts[0])) labels.push(parts[0]); if (parts[1].length >= 4) labels.push(parts.slice(1).join(' · ')); }
    }));
    tasks.slice(ti + 1).forEach((later, k) => {
      const title = String(later.title || ''), where = 'tasks[' + (ti + 1 + k) + '] (' + later.id + ') title';
      if (/\d/.test(title) || NUMWORD.test(title)) warn(where, '“' + title + '” has a number, and it shows on the domain map before ' + t.id + ' is handed in: name no count of findings');
      const hit = labels.find(lab => new RegExp('(^|[^\\w])' + lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w])', 'i').test(title));
      if (hit) warn(where, '“' + title + '” names “' + hit + '”, and it shows on the domain map before ' + t.id + ' is handed in');
    });
  });
  tasks.forEach((t, ti) => {
    if (!t || t.type !== 'items' || t.lockOnLeave) return;
    const tokens = [];
    (t.items || []).forEach(it => {
      const lab = String(it.label || '');
      if (lab) tokens.push(lab);
      const head = lab.split(' · ')[0];
      if (head !== lab && /\d/.test(head)) tokens.push(head);
    });
    tasks.slice(ti + 1).forEach((later, k) => {
      const texts = visibleStrings(Object.assign({}, later, { docs: undefined }), 'tasks[' + (ti + 1 + k) + ']');
      const hit = tokens.find(tok => {
        const re = new RegExp('(^|[^\\w])' + tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w])');
        return texts.some(s => re.test(s.text));
      });
      if (hit) warn('tasks[' + (ti + 1 + k) + '] (' + later.id + ')', 'names “' + hit + '” from ' + t.id + ', which is still open while this task is read: set lockOnLeave on ' + t.id + ' or reword');
    });
  });
  // model
  ((L.model && L.model.blocks) || []).forEach((b, i) => {
    if (['text', 'list', 'table', 'note'].indexOf(b.type) < 0) err('model.blocks[' + i + ']', 'unknown type ' + b.type);
    if (b.type === 'note') { if (b.from) personOk(b.from, 'model.blocks[' + i + '].from'); note(b.text, 'model.blocks[' + i + ']', 60); }
    if (b.type === 'table' && b.grid !== undefined && typeof b.grid !== 'boolean') err('model.blocks[' + i + ']', 'grid must be true or false');
    // for-1 round 2: a list's label is a short title in the hand ("Rows that only look wrong"), not a sentence
    if (b.type === 'list' && b.label !== undefined && (typeof b.label !== 'string' || !b.label.trim() || b.label.split(/\s+/).length > 8)) err('model.blocks[' + i + ']', 'label must be a short title of 8 words or fewer');
  });
  (L.brief && L.brief.messages || []).forEach(m => { exclaim += (m.match(/!/g) || []).length; });
  if (L.wrap && L.wrap.text) exclaim += (L.wrap.text.match(/!/g) || []).length;
  if (L.wrapRetry && L.wrapRetry.text) exclaim += (L.wrapRetry.text.match(/!/g) || []).length;
  if (L.wrapPartial && L.wrapPartial.text) exclaim += (L.wrapPartial.text.match(/!/g) || []).length;
  if (exclaim > 1) err('senior’s notes', exclaim + ' exclamation marks (one at most in a level)');
  // passNeeds: [{ task, min, note? }]
  if (L.passNeeds !== undefined) {
    if (!Array.isArray(L.passNeeds)) err('passNeeds', 'must be a list of { task, min, note? }');
    else L.passNeeds.forEach((pn, i) => {
      const p = 'passNeeds[' + i + ']';
      if (!pn || !tasks.find(t => t.id === pn.task)) err(p, 'task ' + (pn && pn.task) + ' missing');
      if (!pn || typeof pn.min !== 'number' || !(pn.min > 0 && pn.min <= 1)) err(p, 'min must be a share between 0 and 1');
      if (pn && pn.note !== undefined) { if (!isStr(pn.note)) err(p, 'note must be text'); else if (words(pn.note) > 20) err(p, 'note over 20 words'); }
      // val-1 r2: the share a pass need reads counts figures that follow the student's own (method marks), so a note on
      // a worksheet with follow cells that asks for figures "right" says so too, or "2 of 9 right · 2 follow your
      // figures" reads that three more right figures are needed when one more of either passes
      const pt = pn && tasks.find(t => t.id === pn.task);
      if (pt && pt.type === 'worksheet' && isStr(pn.note) && /\bright\b/i.test(pn.note) && !/\bfollow/i.test(pn.note) &&
          (pt.rows || []).some(r => Object.keys(r.cells || {}).some(k => r.cells[k] && r.cells[k].follow)))
        warn(p, 'figures that follow the student’s own count towards this pass: name them beside “right” (val-1: “right, or following your figures”)');
      Object.keys(pn || {}).forEach(k => { if (['task', 'min', 'note'].indexOf(k) < 0) err(p, 'unknown key ' + k); });
    });
  }
  // earned clause and counts
  const e = L.earned || {};
  if (!isStr(e.clause)) err('earned.clause', 'missing');
  Object.keys(e.counts || {}).forEach(k => {
    const s = e.counts[k], p = 'earned.counts.' + k;
    if (!s || COUNT_KINDS.indexOf(s.kind) < 0) { err(p, 'unknown kind'); return; }
    if (s.format && FORMATS.indexOf(s.format) < 0) err(p, 'unknown format ' + s.format);
    if (s.kind === 'const' || s.kind === 'rows') { if (s.kind === 'rows' && !docs[s.doc]) err(p, 'doc ' + s.doc + ' missing'); return; }
    const t = tasks.find(x => x.id === s.task);
    if (!t) { err(p, 'task ' + s.task + ' missing'); return; }
    if (s.answered !== undefined) {
      if (s.kind !== 'items' && s.kind !== 'answeredItems') err(p, 'answered works on an items count');
      else if (s.answered !== 'gate') err(p, 'answered must be "gate"');
      else if (!(t.fields || []).find(f => f.gate)) err(p, 'answered: "gate" needs a gate field on ' + t.id);
    }
    const need = { items: 'items', answeredItems: 'items', correctItems: 'items', itemsWhere: 'items', sumItems: 'items', tally: 'items', cell: 'worksheet', correctCells: 'worksheet', correctQuestions: 'choice', correctSlots: 'compose', huntHits: 'hunt', flagged: 'hunt' }[s.kind];
    if (need && t.type !== need) err(p, s.kind + ' needs a ' + need + ' task');
    // questions: the ids a correctQuestions count is limited to (sa-3); each must be a question of that task
    if (s.questions !== undefined) {
      if (s.kind !== 'correctQuestions') err(p, 'questions works on a correctQuestions count');
      else if (!Array.isArray(s.questions) || !s.questions.length) err(p, 'questions must be a list of question ids');
      else s.questions.forEach(qid => { if (!(t.questions || []).find(q => q.id === qid)) err(p, 'question ' + qid + ' is not a question of ' + t.id); });
    }
    // slots: the ids a correctSlots count is limited to (xl-1); each must be a slot of that compose task
    if (s.slots !== undefined) {
      if (s.kind !== 'correctSlots') err(p, 'slots works on a correctSlots count');
      else if (!Array.isArray(s.slots) || !s.slots.length) err(p, 'slots must be a list of slot ids');
      else s.slots.forEach(sid => { if (!(t.slots || []).find(x => x.id === sid)) err(p, 'slot ' + sid + ' is not a slot of ' + t.id); });
    }
    // rows: the ids a correctCells count is limited to (sa-4); each must be a row of that task with an input cell
    if (s.rows !== undefined) {
      if (s.kind !== 'correctCells') err(p, 'rows works on a correctCells count');
      else if (!Array.isArray(s.rows) || !s.rows.length) err(p, 'rows must be a list of row ids');
      else s.rows.forEach(rid => { if (!E.inputCells(t).some(c => c.row.id === rid)) err(p, 'row ' + rid + ' has no input cell in ' + t.id); });
    }
    if ((s.kind === 'itemsWhere' || s.kind === 'tally') && !(t.fields || []).find(f => f.id === s.field)) err(p, 'field ' + s.field + ' missing');
    if (s.kind === 'itemsWhere') { const f = (t.fields || []).find(x => x.id === s.field); if (f) [].concat(s.equals).forEach(v => { if (!(f.options || []).find(o => o.id === v)) err(p, 'equals ' + v + ' is not an option'); }); }
    if (s.withRight !== undefined && s.kind !== 'itemsWhere' && s.kind !== 'sumItems' && s.kind !== 'cell') err(p, 'withRight works on an itemsWhere, sumItems or cell count');
    // con-1 round 1: on a cell count, withRight lists input cells of the task ("r1.amt") that must each be right too
    else if (s.withRight !== undefined && s.kind === 'cell') {
      if (!Array.isArray(s.withRight) || !s.withRight.length) err(p, 'withRight on a cell count must list input cells as row.col');
      else s.withRight.forEach(k => { if (!E.inputCells(t).some(cl => cl.key === k)) err(p, 'withRight ' + k + ' is not an input cell of ' + t.id); });
    }
    // withRight names one field, or a list of fields that must all be right on the item (dt-4: ["why", "amt"])
    else if (s.withRight !== undefined && (Array.isArray(s.withRight) && !s.withRight.length)) err(p, 'withRight must name at least one field');
    else if (s.withRight !== undefined) [].concat(s.withRight).forEach(wid => { if (!(t.fields || []).find(f => f.id === wid && (f.kind === 'multi' || f.kind === 'choice' || f.kind === 'number'))) err(p, 'withRight ' + wid + ' must be a choice, multi or number field of ' + t.id); });
    // a count of finds beside a tally of their reasons must agree with it ("flagged 3 exceptions (1 cut-off)" reads false)
    if (s.kind === 'itemsWhere' && !s.withRight && Object.keys(e.counts).some(k2 => e.counts[k2] && e.counts[k2].kind === 'tally' && e.counts[k2].task === s.task)) warn(p, 'counts finds on ' + s.task + ' beside a tally of their reasons: add withRight: "' + Object.keys(e.counts).map(k2 => e.counts[k2]).find(x => x && x.kind === 'tally' && x.task === s.task).field + '" so the count equals the tally’s sum');
    // withRight counts an item once; a tally counts every right reason on it. They agree only when each key item has
    // one value in that field ("flagged 7 exceptions (…)" whose brackets sum to 8 reads false)
    const tallied = s.kind === 'itemsWhere' && s.withRight ? (Object.keys(e.counts).map(k2 => e.counts[k2]).find(x => x && x.kind === 'tally' && x.task === s.task && [].concat(s.withRight).indexOf(x.field) >= 0) || {}).field : null;
    if (tallied) {
      const multi = (t.items || []).filter(it => E.trueFind((it.answer || {})[s.field], (it.answer || {})[s.field], s.equals) && [].concat((it.answer || {})[tallied] || []).length > 1);
      multi.forEach(it => warn(p, 'item ' + it.id + ' has ' + [].concat(it.answer[tallied]).length + ' ' + tallied + ' in its key: the brackets will sum to more than the count; word the clause as issues, or give each item one ' + tallied.replace(/s$/, '')));
    }
    if (s.kind === 'sumItems' && s.where) {
      const f = (t.fields || []).find(x => x.id === s.where.field);
      if (!f) err(p, 'where.field ' + s.where.field + ' missing');
      else [].concat(s.where.equals).forEach(v => { if (!(f.options || []).find(o => o.id === v)) err(p, 'where.equals ' + v + ' is not an option'); });
    }
    if (s.kind === 'cell' && !E.inputCells(t).find(cl => cl.row.id === s.row && cl.col.key === s.col)) err(p, 'cell ' + s.row + '.' + s.col + ' is not an input cell');
    // con-1: abs (the size of a signed figure) and scale (a ₹ lakh figure printed with a rupee format) on a cell count
    if (s.abs !== undefined && (s.kind !== 'cell' || s.abs !== true)) err(p, 'abs works on a cell count and must be true');
    if (s.scale !== undefined && (s.kind !== 'cell' || typeof s.scale !== 'number' || !(s.scale > 0))) err(p, 'scale works on a cell count and must be a positive number');
    if (s.kind === 'huntHits' && s.reason && !(t.reasons || []).find(r => r.id === s.reason)) err(p, 'reason ' + s.reason + ' missing');
  });
  const tplNames = s => (String(s || '').match(/\{([\w-]+)(?:\|[^}]*)?\}/g) || []).map(m => m.slice(1).split(/[|}]/)[0]);
  tplNames(e.clause).concat(tplNames(e.fallback)).forEach(n => { if (!(e.counts || {})[n]) err('earned', 'template uses {' + n + '} but counts has no ' + n); });
  // consistency pass round 2 (I2-08): the fallback (and a part of the clause a [[ ]] may drop) is checked as written
  if (isStr(e.fallback) && /[<>]/.test(e.fallback)) err('earned', 'fallback has < or >: the CV Builder takes the line as text');
  if (isStr(e.clause) && /[<>]/.test(e.clause)) err('earned', 'clause template has < or >: the CV Builder takes the line as text');
  const checkClause = (answers, label) => {
    const vals = E.computeCounts(L, answers);
    const cl = E.renderClause(L, vals);
    if (!cl) { err('earned', 'clause does not render with ' + label); return; }
    const w = words(cl);
    if (w > 30) err('earned', 'clause with ' + label + ' is ' + w + ' words (30 at most): ' + cl);
    if (/(^|[^\d,.])0 /.test(cl)) err('earned', 'clause with ' + label + ' prints a count of 0: ' + cl);
    const first = cl.split(/\s+/)[0].toLowerCase().replace(/[^a-z-]/g, '');   // keeps the hyphen of “test-counted”
    if (TRAINEE_VERBS.indexOf(first) < 0) err('earned', 'clause must start with a trainee verb (vouched, counted, checked…), not “' + first + '”');
    BANNED_VERBS.forEach(b => { if (new RegExp('\\b' + b + '\\b', 'i').test(cl)) err('earned', 'clause uses “' + b + '”'); });
    if (/3CD/i.test(cl)) err('earned', 'clause names 3CD');
    // consistency pass round 2 (I2-08): INTEGRATION §5 promises lines with no <, > or straight quotes
    if (/[<>]/.test(cl)) err('earned', 'clause with ' + label + ' has < or >: the CV Builder takes the line as text');
    textProblems(cl).forEach(m => err('earned', 'clause with ' + label + ': ' + m));
    const clientName = String(c.client || '').split(',')[0].trim();
    if (clientName && cl.toLowerCase().indexOf(clientName.toLowerCase()) >= 0) err('earned', 'clause names the client');
    const line = E.buildLine('X Work Simulation', 'Nov 2026', cl);
    if (!/^X Work Simulation, MSC Articleship Program \| Nov 2026: [A-Z]/.test(line)) err('earned', 'line does not build in the house format');
    return cl;
  };
  if (isStr(e.clause)) {
    const key = keyAnswers(L);
    const sc = E.scoreLevel(L, key);
    if (sc.accuracy < 1 - 1e-9) err('tasks', 'the key does not score 100% (' + Math.round(sc.accuracy * 100) + '%)');
    if (!passes(L, key)) err('tasks', 'the key does not pass the level (check passNeeds)');
    checkClause(key, 'the key’s answers');
    checkClause(minimalPassing(L), 'a minimal passing set');
    // the counts on a set that makes every main call and nothing else: no count may read 0 (it passes or not)
    const go = gatesOnly(L);
    if (JSON.stringify(go) !== JSON.stringify(key)) {
      const gv = E.computeCounts(L, go), gc = E.renderClause(L, gv);
      if (!gc) err('earned', 'neither the clause nor the fallback renders when every main call is made and nothing else (a count is 0 or missing: count the items by their main call with answered: "gate")');
      else if (/(^|[^\d,.])0 /.test(gc)) err('earned', 'clause with every main call made and nothing else prints a count of 0: ' + gc);
      (L.interview || []).forEach((q, i) => E.outlineLines(L, i, gv).forEach((x, j) => { if (/(^|[^\d,.])0 /.test(x)) err('interview[' + i + '].outline[' + j + ']', 'prints a count of 0 when only the main calls are made: ' + x); }));
    }
    const wrongA = wrongAnswers(L), wrong = E.scoreLevel(L, wrongA).accuracy;
    if (wrong >= 0.5 - 1e-9) err('tasks', 'wrong answers score ' + Math.round(wrong * 1000) / 10 + '% and pass the level');
    else if (passes(L, wrongA)) err('tasks', 'wrong answers pass the level');
    const lazyA = defaultAnswers(L), lazy = E.scoreLevel(L, lazyA).accuracy;
    if (lazy >= 0.5 - 1e-9) err('tasks', 'the commonest call on every item (everything else blank) scores ' + Math.round(lazy * 1000) / 10 + '% and passes the level: lower that task’s weight or give the other tasks more');
    else if (passes(L, lazyA)) err('tasks', 'the commonest call on every item (everything else blank) passes the level');
    // a task that cannot cost a star is decoration: the key with any one task entirely wrong stays under 90%
    if (tasks.length > 1) tasks.forEach(t => {
      const acc = E.scoreLevel(L, oneTaskWrong(L, t.id)).accuracy;
      if (acc >= 0.9 - 1e-9) err('tasks', 'the key with ' + t.id + ' entirely wrong still scores ' + Math.round(acc * 1000) / 10 + '% (three stars): give ' + t.id + ' more weight');
    });
    // the CV line's brackets are the student's own diagnoses: ticking every option of a pick list names nothing
    const sg = shotgun(L), sgv = E.computeCounts(L, sg);
    Object.keys(e.counts || {}).forEach(k => {
      const sp = e.counts[k];
      if (sp && sp.kind === 'tally' && sgv[k] !== null) err('earned.counts.' + k, 'with every option ticked on every item the tally still reads “' + sgv[k] + '”: a pick list with a wrong pick is not a find');
      // shotgun ticks pick lists (multi fields) only; a withRight on a choice field takes one pick, so it has no
      // "every option ticked" to guard against (dt-2: the rate behind a short deduction)
      const wrf = sp && (sp.kind === 'itemsWhere' || sp.kind === 'sumItems') && sp.withRight ? ((tasks.find(t => t.id === sp.task) || {}).fields || []).find(f => [].concat(sp.withRight).indexOf(f.id) >= 0 && f.kind === 'multi') : null;
      if (wrf && wrf.kind === 'multi' && sgv[k] > 0) err('earned.counts.' + k, 'with every option ticked on every item withRight still counts ' + sgv[k] + ' finds');
    });
    // the clean closing note must never be shown over a wrong composed text when it tells the student to send it
    if (L.wrap && isStr(L.wrap.text) && SEND.test(L.wrap.text)) tasks.filter(t => t.type === 'compose').forEach(t => {
      const one = keyAnswers(L), slot = (t.slots || []).find(x => (x.options || []).some(o => !o.correct));
      if (slot) one[t.id][slot.id] = slot.options.find(o => !o.correct).id;
      [oneTaskWrong(L, t.id), one].forEach(set => {
        const r = E.resultFor(L, set, 0);
        if (r.passed && E.wrapFor(L, r, r.scored) === L.wrap) warn('wrap.text', 'shows over a wrong line in ' + t.id + ' (at ' + Math.round(r.accuracy * 1000) / 10 + '%), so it must not tell the student to send the work on');
      });
    });
  }
  // interview
  if (!Array.isArray(L.interview) || L.interview.length !== 2) err('interview', 'needs exactly 2 questions');
  else L.interview.forEach((q, i) => {
    const p = 'interview[' + i + ']';
    if (!isStr(q.q)) err(p, 'q missing');
    if (!isStr(q.checking)) err(p, 'checking missing');
    if (!Array.isArray(q.outline) || q.outline.length !== 3) err(p, 'needs exactly 3 outline lines');
    else E.outlineLines(L, i, E.computeCounts(L, keyAnswers(L))).forEach((x, j) => { if (words(x) > 18) err(p + '.outline[' + j + ']', 'over 18 words (' + words(x) + ')'); });
  });
  // style of every visible string
  visibleStrings(L, 'level').forEach(s => {
    textProblems(s.text).forEach(m => err(s.path, m + ': “' + s.text.slice(0, 80) + '”'));
  });
  if (ctx.filesDir) (L.downloads || []).forEach(f => {
    try { require('fs').statSync(path.join(ctx.filesDir, L.id, f.file)); } catch (er) { err('downloads', 'file ' + f.file + ' is missing in files/' + L.id + '/'); }
  });
  // xl-1 round 1: a task's own downloads (val-1 t3, xl-1 t1/t3/t4) are checked the same way
  if (ctx.filesDir) (L.tasks || []).forEach(t => (t && Array.isArray(t.downloads) ? t.downloads : []).forEach(f => {
    try { require('fs').statSync(path.join(ctx.filesDir, L.id, String(f.file))); } catch (er) { err('tasks (' + t.id + ') downloads', 'file ' + f.file + ' is missing in files/' + L.id + '/'); }
  }));
  return { errors, warns };
}

function validateCatalogue(cat) {
  const errors = [];
  if (!cat || !Array.isArray(cat.domains) || !Array.isArray(cat.levels)) return ['catalogue: domains and levels arrays needed'];
  if (cat.domains.length !== 13) errors.push('catalogue: 13 domains needed, found ' + cat.domains.length);
  DOMAINS.forEach(([id, name, cv]) => {
    const d = cat.domains.find(x => x.id === id);
    if (!d) { errors.push('catalogue: domain ' + id + ' missing'); return; }
    if (d.name !== name) errors.push('catalogue: domain ' + id + ' name should be ' + name);
    if (d.cvName !== cv) errors.push('catalogue: domain ' + id + ' cvName should be ' + cv);
    if (!d.icon) errors.push('catalogue: domain ' + id + ' icon missing');
    if (!d.short) errors.push('catalogue: domain ' + id + ' short name missing');
    if (d.blurb !== null && typeof d.blurb !== 'string') errors.push('catalogue: domain ' + id + ' blurb must be a string or null');
    if (typeof d.blurb === 'string') textProblems(d.blurb).forEach(m => errors.push('catalogue: ' + id + ' blurb: ' + m));
    if (d.secondRep !== null && (typeof d.secondRep !== 'object' || !d.secondRep.title)) errors.push('catalogue: domain ' + id + ' secondRep must be null or have a title');
    if (d.secondRep && d.secondRep.url && !/^https:\/\//.test(d.secondRep.url)) errors.push('catalogue: ' + id + ' secondRep url must be https');
    if (d.secondRep) visibleStrings(d.secondRep, id + '.secondRep').forEach(s => textProblems(s.text).forEach(m => errors.push('catalogue: ' + s.path + ': ' + m)));
  });
  if (cat.levels.length !== 27) errors.push('catalogue: 27 levels needed, found ' + cat.levels.length);
  LEVELS.forEach(([id, dom, num], i) => {
    const l = cat.levels[i];
    if (!l || l.id !== id) { errors.push('catalogue: level ' + (i + 1) + ' should be ' + id); return; }
    if (l.domain !== dom) errors.push('catalogue: ' + id + ' domain should be ' + dom);
    if (l.number !== num) errors.push('catalogue: ' + id + ' number should be ' + num);
    if (l.order !== i + 1) errors.push('catalogue: ' + id + ' order should be ' + (i + 1));
    if (typeof l.published !== 'boolean') errors.push('catalogue: ' + id + ' published must be true or false');
    if (typeof l.minutes !== 'number') errors.push('catalogue: ' + id + ' minutes missing');
    if (!l.title) errors.push('catalogue: ' + id + ' title missing');
    else textProblems(l.title).forEach(m => errors.push('catalogue: ' + id + ' title: ' + m));
  });
  return errors;
}
function validateWorld(world) {
  const errors = [];
  if (!world || typeof world !== 'object') return ['world: not an object'];
  const list = Array.isArray(world.people) ? world.people : world.people && typeof world.people === 'object' ? Object.keys(world.people).map(k => Object.assign({ id: k }, world.people[k])) : [];
  const ids = new Set();
  list.forEach((p, i) => {
    if (!p || !p.id) { errors.push('world.people[' + i + ']: id missing'); return; }
    if (ids.has(p.id)) errors.push('world: duplicate person ' + p.id); ids.add(p.id);
    if (!(p.name || p.displayName)) errors.push('world: person ' + p.id + ' name missing');
    if (!p.role) errors.push('world: person ' + p.id + ' role missing');
  });
  JSON.stringify(world).replace(/\b\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]\b/g, g => {
    gstinProblems(g).forEach(m => errors.push('world: ' + m));
    // legibility: no PAN ends in I or O ("O1" after it reads as "01" in a mono face)
    if (/[IO]/.test(g.charAt(11))) errors.push('world: GSTIN ' + g + ' has I or O as its PAN’s last letter');
    return g;
  });
  const walk = (o, p) => {
    if (Array.isArray(o)) return o.forEach((x, i) => walk(x, p + '[' + i + ']'));
    if (o && typeof o === 'object') {
      if (o.gstin) partyProblems(o, p).forEach(m => errors.push('world: ' + m));
      if (typeof o.pan === 'string' && /^[A-Z0-9]{10}$/.test(o.pan) && /[IO]/.test(o.pan.charAt(9))) errors.push('world: ' + p + ' PAN ' + o.pan + ' ends in I or O');
      // a party that writes its bills by hand has no I or O anywhere in its PAN or GSTIN
      if (o.handPan && /[IO]/.test(String(o.pan || '') + String(o.gstin || ''))) errors.push('world: ' + p + ' writes its bills by hand, but its PAN or GSTIN has I or O');
      Object.keys(o).forEach(k => walk(o[k], p + '.' + k));
    }
  };
  walk(world, 'world');
  return errors;
}

module.exports = {
  DOMAINS, LEVELS, STATE_CODES, TRAINEE_VERBS, BANNED, gstinCheckChar, gstinProblems, partyProblems, keyAnswers, wrongAnswers, defaultAnswers,
  partialAnswers, minimalPassing, gatesOnly, shotgun, oneTaskWrong, textProblems, visibleStrings, invoiceProblems, tableProblems, validateLevel, validateCatalogue,
  validateWorld, groupingOk
};
