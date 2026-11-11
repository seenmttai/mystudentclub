'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../articleship-program/work-simulation/js/ws-engine.js');
const L = require('./articleship-work-simulation-lib.cjs');
const demo = require('./fixtures/demo-level.json');
const clone = o => JSON.parse(JSON.stringify(o));

test('Indian number formatting', () => {
  assert.equal(E.groupIndian('1234567'), '12,34,567');
  assert.equal(E.groupIndian('123'), '123');
  assert.equal(E.formatINR(123456), '₹1,23,456');
  // money is whole rupees or rupees and paise to two places, never one decimal (engine 1.4.0)
  assert.equal(E.formatINR(12345678.5), '₹1,23,45,678.50');
  assert.equal(E.formatINR(18974.4), '₹18,974.40');
  assert.equal(E.formatINR(18974.004), '₹18,974');
  assert.equal(E.formatValue(2296.8, 'inr'), '₹2,296.80');
  assert.equal(E.formatINR(48970, { decimals: 2 }), '₹48,970.00');
  assert.equal(E.formatINR(-2500), '−₹2,500');
  assert.equal(E.formatINR(0.004, { decimals: 2 }), '₹0.00');
  assert.equal(E.formatNumber(1000000, 2), '10,00,000.00');
  assert.equal(E.formatNumber(-0.001, 2), '0.00');
  assert.equal(E.formatInt(99999.6), '1,00,000');
  assert.equal(E.formatLakh(420000), '₹4.2 lakh');
  assert.equal(E.formatLakh(500000), '₹5 lakh');
  assert.equal(E.formatCrore(12500000), '₹1.25 crore');
  assert.equal(E.formatPct(-2.857, 1), '−2.9%');
  assert.equal(E.formatValue(-1.04, 'pct1'), '−1.0%');
  assert.equal(E.formatValue(5, 'pct'), '5%');
  assert.equal(E.formatValue(48970, 'amount'), '48,970.00');
  assert.equal(E.formatValue(7, undefined), '7');
  assert.equal(E.formatValue('cut-off', 'int'), 'cut-off');
});

test('parseNumber accepts the ways students type numbers', () => {
  const cases = { '1,23,456': 123456, '₹ 1,23,456': 123456, '₹1,23,456.50': 123456.5, 'Rs. 500': 500, 'INR 75': 75, '-2.5': -2.5,
    '−2.5': -2.5, '(2.5)': -2.5, '2.5%': 2.5, ' 4 080 ': 4080, '.5': 0.5, '5.': 5, '+3': 3, '-₹500': -500, '(₹1,000)': -1000 };
  Object.keys(cases).forEach(k => assert.equal(E.parseNumber(k), cases[k], k));
  ['', '  ', 'abc', '1.2.3', '12-', '--5', null, undefined, {}].forEach(v => assert.equal(E.parseNumber(v), null, String(v)));
  assert.equal(E.parseNumber(42), 42);
});

test('month label and amount in words', () => {
  assert.equal(E.monthLabel(new Date(2026, 10, 3)), 'Nov 2026');
  assert.equal(E.monthLabel(new Date(2027, 0, 31).getTime()), 'Jan 2027');
  assert.equal(E.amountInWords(46020), 'Rupees Forty Six Thousand Twenty Only');
  assert.equal(E.amountInWords(12345678.5), 'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Fifty Paise Only');
  assert.equal(E.amountInWords(100000, { prefix: 'INR' }), 'INR One Lakh Only');
  assert.ok(E.wordsMatch('INR Forty-Six Thousand Twenty Only', 46020));
  assert.ok(!E.wordsMatch('INR Forty Six Thousand Only', 46020));
});

const itemsTask = {
  id: 't1', type: 'items',
  fields: [
    { id: 'verdict', kind: 'choice', gate: true, options: [{ id: 'ok', label: 'Fine' }, { id: 'ex', label: 'Exception' }] },
    { id: 'reasons', kind: 'multi', showIf: { verdict: 'ex' }, options: [{ id: 'a', label: 'A', short: 'aa' }, { id: 'b', label: 'B', short: 'bb' }, { id: 'c', label: 'C', short: 'cc' }] },
    { id: 'qty', kind: 'number', tolerance: 0.5 },
    { id: 'pct', kind: 'number', toleranceRel: 0.01 },
    { id: 'note', kind: 'text' }
  ],
  items: [
    { id: 'i1', answer: { verdict: 'ex', reasons: ['a', 'b'], qty: 100 } },
    { id: 'i2', answer: { verdict: 'ok', qty: 50 } },
    { id: 'i3', answer: { verdict: 'ex', reasons: ['c'], pct: 200 } }
  ]
};

test('items: gate, Jaccard, numbers, showIf, text never scored', () => {
  const [i1, i2, i3] = itemsTask.items;
  assert.equal(E.scoreItem(itemsTask, i1, { verdict: 'ex', reasons: ['a', 'b'], qty: '100' }).score, 1);
  assert.equal(E.scoreItem(itemsTask, i1, { verdict: 'ok', qty: '100' }).score, 0, 'gate wrong = 0');
  assert.equal(E.scoreItem(itemsTask, i1, { reasons: ['a', 'b'], qty: '100' }).score, 0, 'gate blank = 0');
  // reasons {a} vs {a,b} = 1/2; verdict 1; qty 1 -> mean 2.5/3
  assert.ok(Math.abs(E.scoreItem(itemsTask, i1, { verdict: 'ex', reasons: ['a'], qty: '100' }).score - 2.5 / 3) < 1e-9);
  assert.ok(Math.abs(E.scoreItem(itemsTask, i1, { verdict: 'ex', reasons: ['a', 'c'], qty: '100' }).score - (1 + 1 / 3 + 1) / 3) < 1e-9);
  assert.equal(E.scoreItem(itemsTask, i1, { verdict: 'ex', reasons: ['a', 'b'], qty: '100.5' }).score, 1, 'within tolerance');
  assert.ok(E.scoreItem(itemsTask, i1, { verdict: 'ex', reasons: ['a', 'b'], qty: '100.6' }).score < 1);
  assert.equal(E.scoreItem(itemsTask, i3, { verdict: 'ex', reasons: ['c'], pct: '201.9' }).score, 1, 'relative tolerance');
  assert.ok(E.scoreItem(itemsTask, i3, { verdict: 'ex', reasons: ['c'], pct: '203' }).score < 1);
  // reasons hidden (verdict ok) and not expected -> not applicable
  const s2 = E.scoreItem(itemsTask, i2, { verdict: 'ok', qty: '50', note: 'anything' });
  assert.equal(s2.score, 1);
  assert.equal(s2.fields.reasons.applicable, false);
  assert.equal(s2.fields.note.applicable, false);
  assert.ok(s2.correct);
  assert.equal(E.jaccard([], []), 1);
  assert.equal(E.jaccard(['a', 'a'], ['a']), 1);
  // a hidden field the key needs is still scored
  const t = clone(itemsTask); t.fields[1].showIf = { verdict: 'ok' };
  const s = E.scoreItem(t, t.items[0], { verdict: 'ex', qty: '100' });
  assert.equal(s.fields.reasons.applicable, true);
  assert.ok(Math.abs(s.score - 2 / 3) < 1e-9);
});

test('items task totals and answered rule', () => {
  const r = E.scoreTask(itemsTask, { i1: { verdict: 'ex', reasons: ['a', 'b'], qty: '100' }, i2: { verdict: 'ex' } }, {});
  assert.equal(r.max, 3);
  assert.equal(r.right, 1);
  assert.equal(r.earned, 1);
  assert.equal(E.itemAnswered(itemsTask, itemsTask.items[0], { verdict: 'ex' }), false, 'visible multi must be ticked');
  assert.equal(E.itemAnswered(itemsTask, itemsTask.items[0], { verdict: 'ex', reasons: ['a'], qty: '1', pct: '2' }), true);
  assert.equal(E.itemAnswered(itemsTask, itemsTask.items[1], { verdict: 'ok', qty: '1', pct: '2' }), true);
  assert.equal(E.itemAnswered(itemsTask, itemsTask.items[1], { verdict: 'ok', qty: 'x', pct: '2' }), false);
});

test('worksheet, choice, order, compose, hunt scoring', () => {
  const ws = { id: 'w', type: 'worksheet', columns: [{ key: 'c' }, { key: 'v' }, { key: 'p' }],
    rows: [{ id: 'r1', cells: { c: 'Raw', v: { input: true, answer: -120 }, p: { input: true, answer: -2.86, tolerance: 0.05 } } },
      { id: 'r2', cells: { c: 'FG', v: { input: true, answer: 1000, toleranceRel: 0.01 }, p: 3 } }] };
  const r = E.scoreTask(ws, { 'r1.v': '-120', 'r1.p': '-2.9', 'r2.v': '1,009' }, {});
  assert.deepEqual([r.earned, r.max], [3, 3]);
  assert.equal(E.scoreTask(ws, { 'r1.v': '(120)', 'r1.p': '-2.92', 'r2.v': '1011' }, {}).earned, 1);

  const ch = { id: 'c', type: 'choice', questions: [
    { id: 'q1', options: [{ id: 'a', correct: true }, { id: 'b' }] },
    { id: 'q2', multi: true, options: [{ id: 'a', correct: true }, { id: 'b', correct: true }, { id: 'c' }, { id: 'd' }] }] };
  assert.equal(E.scoreQuestion(ch.questions[1], ['a', 'b']), 1);
  assert.equal(E.scoreQuestion(ch.questions[1], ['a']), 0.5);
  assert.equal(E.scoreQuestion(ch.questions[1], ['a', 'c']), 0);
  assert.equal(E.scoreQuestion(ch.questions[1], ['c', 'd']), 0, 'clamped at 0');
  assert.equal(E.scoreQuestion(ch.questions[1], ['a', 'b', 'c']), 0.5);
  assert.equal(E.scoreTask(ch, { q1: 'a', q2: ['a'] }, {}).earned, 1.5);
  assert.equal(E.scoreTask(ch, { q1: 'a', q2: ['a'] }, {}).right, 1);

  const ord = { id: 'o', type: 'order', steps: ['s1', 's2', 's3', 's4'].map(id => ({ id })), answer: ['s1', 's2', 's3', 's4'] };
  assert.equal(E.scoreTask(ord, { order: ['s1', 's2', 's3', 's4'] }, { id: 'x' }).earned, 1);
  assert.equal(E.scoreTask(ord, { order: ['s2', 's1', 's3', 's4'] }, { id: 'x' }).earned, 0.75);
  assert.equal(E.lcsLength(['a', 'b', 'c'], ['c', 'b', 'a']), 1);
  // ia-1 round 1: the order review ticks one longest run in sequence, as many steps as the score counts
  const S = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
  assert.deepEqual(E.lcsMembers(['s8', 's1', 's2', 's3', 's4', 's5', 's6', 's7'], S), ['s1', 's2', 's3', 's4', 's5', 's6', 's7']);
  const swap = ['s1', 's2', 's3', 's5', 's4', 's6', 's7', 's8'];
  assert.equal(E.lcsMembers(swap, S).length, 7);
  assert.deepEqual(E.lcsMembers(swap, S), ['s1', 's2', 's3', 's5', 's6', 's7', 's8'], 'of two runs as long, the student’s earlier step is kept');
  assert.deepEqual(E.lcsMembers(S, S), S);
  assert.deepEqual(E.lcsMembers([], S), []);
  // ia-1 round 5 (designer optional 1): of runs as long, the one with more steps at their own number wins first
  assert.deepEqual(E.lcsMembers(['s3', 's2', 's1'], ['s1', 's2', 's3']), ['s2'], 'the step in place, not the earliest');
  assert.deepEqual(E.lcsMembers(['s3', 's2', 's1', 's4'], ['s1', 's2', 's3', 's4']), ['s2', 's4']);
  assert.deepEqual(E.lcsMembers(S.slice().reverse(), S), ['s8'], 'no step in place: the earliest, as before');
  for (let k = 0; k < 200; k++) {
    const p = E.shuffledOrder(S, 'lcs' + k, S), m = E.lcsMembers(p, S);
    assert.equal(m.length, E.lcsLength(p, S), 'as long as the LCS');
    assert.deepEqual(m, p.filter(x => m.indexOf(x) >= 0), 'in the student’s order');
    assert.deepEqual(m, S.filter(x => m.indexOf(x) >= 0), 'and in the answer’s');
  }

  const cp = { id: 'k', type: 'compose', template: '{a} {b}', slots: [{ id: 'a', label: 'A', options: [{ id: '1', text: 'One.', correct: true }, { id: '2', text: 'Two.' }] },
    { id: 'b', label: 'B', options: [{ id: '1', text: 'Three.' }, { id: '2', text: 'Four.', correct: true }] }] };
  assert.equal(E.scoreTask(cp, { a: '1', b: '1' }, {}).earned, 1);
  assert.equal(E.composeText(cp, { a: '1', b: '2' }), 'One. Four.');
  assert.equal(E.composeText(cp, { a: '1' }), 'One. [B]');
  assert.equal(E.composeText(cp, {}, { model: true }), 'One. Four.');

  const hu = { id: 'h', type: 'hunt', answer: { r1: 'dup', r2: 'round', r3: ['weekend', 'round'] } };
  assert.equal(E.scoreTask(hu, { flags: { r1: 'dup', r2: 'round', r3: 'round' } }, {}).earned, 3);
  assert.equal(E.scoreTask(hu, { flags: { r1: 'dup', r9: 'dup' } }, {}).earned, 0.5);
  assert.equal(E.scoreTask(hu, { flags: { r1: 'round', r9: 'dup', r8: 'dup' } }, {}).earned, 0, 'floored at 0');
  assert.equal(E.scoreTask(hu, {}, {}).max, 3);
});

test('deterministic shuffle never equals the answer order', () => {
  for (let n = 2; n <= 9; n++) {
    const ids = Array.from({ length: n }, (_, i) => 's' + i);
    for (let k = 0; k < 40; k++) {
      const seed = 'lvl-' + k + ':t' + n;
      const a = E.shuffledOrder(ids, seed, ids), b = E.shuffledOrder(ids, seed, ids);
      assert.deepEqual(a, b, 'same seed, same order');
      assert.notDeepEqual(a, ids, 'never the answer order');
      assert.deepEqual(a.slice().sort(), ids.slice().sort(), 'a permutation');
    }
  }
  const ord = demo.tasks.find(t => t.type === 'order');
  const shown = E.currentOrder(demo, ord, undefined);
  assert.notDeepEqual(shown, ord.answer);
  assert.ok(E.lcsLength(shown, ord.answer) <= Math.ceil(ord.answer.length / 2), 'little head start');
});

test('level score, bands, hints and the pass rule', () => {
  assert.equal(E.band(0.9), 3); assert.equal(E.band(0.8999), 2); assert.equal(E.band(0.75), 2); assert.equal(E.band(0.7499), 1);
  assert.equal(E.band(0.5), 1); assert.equal(E.band(0.49), 0); assert.equal(E.band(18 / 20), 3);
  assert.deepEqual(E.starsFor(0.95, 0), { band: 3, passed: true, stars: 3 });
  assert.equal(E.starsFor(0.95, 1).stars, 2);
  assert.equal(E.starsFor(0.95, 5).stars, 1, 'a pass keeps one star');
  assert.equal(E.starsFor(0.6, 2).stars, 1);
  assert.deepEqual(E.starsFor(0.4, 0), { band: 0, passed: false, stars: 0 });
  const lv = { id: 'w', tasks: [{ id: 'a', type: 'choice', questions: [{ id: 'q', options: [{ id: 'x', correct: true }, { id: 'y' }] }] },
    { id: 'b', type: 'choice', weight: 3, questions: [{ id: 'q', options: [{ id: 'x', correct: true }, { id: 'y' }] }] }] };
  assert.equal(E.scoreLevel(lv, { a: { q: 'x' } }).accuracy, 0.25);
  assert.equal(E.scoreLevel(lv, { b: { q: 'x' } }).accuracy, 0.75);
});

test('best attempt rule: stars, then accuracy, then later', () => {
  assert.ok(E.isBetter({ stars: 3, accuracy: 0.9, at: 1 }, { stars: 2, accuracy: 0.99, at: 2 }));
  assert.ok(E.isBetter({ stars: 2, accuracy: 0.85, at: 1 }, { stars: 2, accuracy: 0.8, at: 2 }));
  assert.ok(E.isBetter({ stars: 2, accuracy: 0.8, at: 3 }, { stars: 2, accuracy: 0.8, at: 2 }));
  assert.ok(!E.isBetter({ stars: 1, accuracy: 0.6, at: 9 }, { stars: 2, accuracy: 0.8, at: 2 }));
  assert.ok(E.isBetter({ stars: 0 }, null));
});

test('every count kind comes from the student’s own answers', () => {
  const key = L.keyAnswers(demo);
  const v = E.computeCounts(demo, key);
  assert.deepEqual(v, { bills: 4, found: 3, types: '1 cut-off, 1 unapproved PO, 1 rate difference', hits: 5, lldpe: -1.04, rows: 40, cells: 12 });
  const a = clone(key);
  a.t1.b2 = { verdict: 'ok', qty: '1800', belongs: 'mar27' };        // missed the cut-off bill
  a.t1.b4.reasons = ['rate', 'qty'];                                 // right reason plus a wrong one
  delete a.t1.b1;                                                    // one bill not answered
  a.t2['r1.pct'] = '-1.2';                                           // wrong cell
  a.t3.flags = { p18: 'dup', p07: 'dup', p01: 'round' };             // one hit, two wrong
  a.t4 = { q1: 'b', q2: ['a'] };
  a.t6 = { condition: 'a', criteria: 'b' };
  const w = E.computeCounts(demo, a);
  assert.equal(w.bills, 3, 'answered items');
  assert.equal(w.found, 1, 'true finds only: a right reason with a wrong one is not a find');
  assert.equal(w.types, '1 unapproved PO');
  assert.equal(w.hits, 1);
  assert.equal(w.lldpe, null, 'a wrong cell gives null');
  assert.equal(w.cells, 11);
  // rows: count only the listed rows' cells (sa-4 names "PF and ESI" only when the student got cells of each right)
  assert.equal(E.countValue(demo, { kind: 'correctCells', task: 't2', rows: ['r1'] }, a), 2, 'r1 with its wrong % cell');
  assert.equal(E.countValue(demo, { kind: 'correctCells', task: 't2', rows: ['r2'] }, a), 3);
  assert.equal(E.countValue(demo, { kind: 'correctCells', task: 't2', rows: ['r1', 'r2'] }, a), 5);
  assert.equal(E.countValue(demo, { kind: 'correctCells', task: 't2', rows: ['r2'] }, { t2: { 'r1.counted': key.t2['r1.counted'] } }), 0, 'r2 left blank');
  const rv = clone(demo);
  rv.earned.counts.ra = { kind: 'correctCells', task: 't2', rows: ['r1', 'r9'] };
  rv.earned.counts.rb = { kind: 'correctQuestions', task: 't4', rows: ['r1'] };
  rv.earned.counts.rc = { kind: 'correctCells', task: 't2', rows: [] };
  const re = L.validateLevel(rv, { fixture: true }).errors.join('\n');
  assert.match(re, /earned\.counts\.ra.*row r9 has no input cell in t2/);
  assert.match(re, /earned\.counts\.rb.*rows works on a correctCells count/);
  assert.match(re, /earned\.counts\.rc.*rows must be a list of row ids/);
  const rok = clone(demo);
  rok.earned.counts.ra = { kind: 'correctCells', task: 't2', rows: ['r1', 'r2'] };
  assert.ok(!L.validateLevel(rok, { fixture: true }).errors.some(x => /earned\.counts\.ra/.test(x)));
  const sp = { kind: 'correctQuestions', task: 't4' };
  assert.equal(E.countValue(demo, sp, a), 1);
  // questions: count only the listed questions (sa-3 gates "records", "verification" and "title" on their own questions)
  assert.equal(E.countValue(demo, { kind: 'correctQuestions', task: 't4', questions: ['q1'] }, a), 1, 'q1 right');
  assert.equal(E.countValue(demo, { kind: 'correctQuestions', task: 't4', questions: ['q2'] }, a), 0, 'q2 half right is not right');
  assert.equal(E.countValue(demo, { kind: 'correctQuestions', task: 't4', questions: ['q1', 'q2'] }, a), 1);
  assert.equal(E.countValue(demo, { kind: 'correctQuestions', task: 't4', questions: ['q1', 'q2'] }, key), 2);
  assert.equal(E.countValue(demo, { kind: 'correctQuestions', task: 't4', questions: ['q2'] }, { t4: { q1: 'b' } }), 0, 'q2 left blank');
  // the validator: every listed id is a question of that task, and only a correctQuestions count takes the list
  const qv = clone(demo);
  qv.earned.counts.pt = { kind: 'correctQuestions', task: 't4', questions: ['q1', 'q9'] };
  qv.earned.counts.pu = { kind: 'correctCells', task: 't2', questions: ['q1'] };
  qv.earned.counts.pv = { kind: 'correctQuestions', task: 't4', questions: [] };
  const qe = L.validateLevel(qv, { fixture: true }).errors.join('\n');
  assert.match(qe, /earned\.counts\.pt.*question q9 is not a question of t4/);
  assert.match(qe, /earned\.counts\.pu.*questions works on a correctQuestions count/);
  assert.match(qe, /earned\.counts\.pv.*questions must be a list of question ids/);
  const qok = clone(demo);
  qok.earned.counts.pt = { kind: 'correctQuestions', task: 't4', questions: ['q1', 'q2'] };
  assert.ok(!L.validateLevel(qok, { fixture: true }).errors.some(x => /earned\.counts\.pt/.test(x)));
  assert.equal(E.countValue(demo, { kind: 'correctSlots', task: 't6' }, a), 1);
  // slots: count only the listed slots (xl-1 names its PivotTable insight only on a right finding line)
  assert.equal(E.countValue(demo, { kind: 'correctSlots', task: 't6', slots: ['condition'] }, a), 1, 'condition right');
  assert.equal(E.countValue(demo, { kind: 'correctSlots', task: 't6', slots: ['criteria'] }, a), 0, 'criteria wrong');
  assert.equal(E.countValue(demo, { kind: 'correctSlots', task: 't6', slots: ['effect'] }, a), 0, 'effect left blank');
  assert.equal(E.countValue(demo, { kind: 'correctSlots', task: 't6', slots: ['condition', 'criteria'] }, key), 2);
  const sv = clone(demo);
  sv.earned.counts.sa = { kind: 'correctSlots', task: 't6', slots: ['condition', 'nope'] };
  sv.earned.counts.sb = { kind: 'correctQuestions', task: 't4', slots: ['condition'] };
  sv.earned.counts.sc = { kind: 'correctSlots', task: 't6', slots: [] };
  const se = L.validateLevel(sv, { fixture: true }).errors.join('\n');
  assert.match(se, /earned\.counts\.sa.*slot nope is not a slot of t6/);
  assert.match(se, /earned\.counts\.sb.*slots works on a correctSlots count/);
  assert.match(se, /earned\.counts\.sc.*slots must be a list of slot ids/);
  const sok = clone(demo);
  sok.earned.counts.sa = { kind: 'correctSlots', task: 't6', slots: ['condition'] };
  assert.ok(!L.validateLevel(sok, { fixture: true }).errors.some(x => /earned\.counts\.sa/.test(x)));
  assert.equal(E.countValue(demo, { kind: 'correctItems', task: 't1' }, a), 1);
  assert.equal(E.countValue(demo, { kind: 'huntHits', task: 't3', reason: 'round' }, key), 2);
  assert.equal(E.countValue(demo, { kind: 'flagged', task: 't3' }, a), 3);
  assert.equal(E.countValue(demo, { kind: 'const', value: 20 }, a), 20);
  assert.equal(E.countValue(demo, { kind: 'sumItems', task: 't1', prop: 'amount', where: { field: 'verdict', equals: 'exception' } }, key), 356832 + 173460 + 182192);
  assert.equal(E.countValue(demo, { kind: 'nope' }, key), null);
  // tally: most frequent first, ties in option order
  const tt = { id: 't', type: 'items', fields: itemsTask.fields, items: [
    { id: 'x1', answer: { verdict: 'ex', reasons: ['b'] } }, { id: 'x2', answer: { verdict: 'ex', reasons: ['c', 'b'] } }, { id: 'x3', answer: { verdict: 'ex', reasons: ['a'] } }] };
  const lv = { id: 'z', tasks: [tt] };
  assert.equal(E.countValue(lv, { kind: 'tally', task: 't', field: 'reasons' }, { t: { x1: { verdict: 'ex', reasons: ['b'] }, x2: { verdict: 'ex', reasons: ['b', 'c'] }, x3: { verdict: 'ex', reasons: ['a'] } } }), '2 bb, 1 aa, 1 cc');
  assert.equal(E.countValue(lv, { kind: 'tally', task: 't', field: 'reasons' }, { t: { x1: { verdict: 'ok', reasons: ['b'] } } }), null, 'gate wrong: not counted');
  // itemsWhere / sumItems with several values, and one reason inside a multi field
  const ia = { t: { x1: { verdict: 'ex', reasons: ['b'] }, x2: { verdict: 'ex', reasons: ['c'] }, x3: { verdict: 'ex', reasons: ['a', 'b'] } } };
  assert.equal(E.countValue(lv, { kind: 'itemsWhere', task: 't', field: 'reasons', equals: 'b' }, ia), 1, 'x1 only: x2 missed b, x3 key has no b');
  assert.equal(E.countValue(lv, { kind: 'itemsWhere', task: 't', field: 'reasons', equals: ['a', 'c'] }, ia), 2, 'x2 (c) and x3 (a)');
  assert.equal(E.countValue(lv, { kind: 'itemsWhere', task: 't', field: 'verdict', equals: ['ex', 'ok'] }, ia), 3);
  assert.equal(E.countValue(lv, { kind: 'itemsWhere', task: 't', field: 'verdict', equals: 'ok' }, ia), 0);
  const tc = { id: 'c', type: 'items', fields: [{ id: 'act', kind: 'choice', gate: true, options: [{ id: 'accept' }, { id: 'reject' }, { id: 'pending' }] }],
    items: [{ id: 'i1', amount: 100, answer: { act: 'reject' } }, { id: 'i2', amount: 50, answer: { act: 'pending' } }, { id: 'i3', amount: 7, answer: { act: 'accept' } }] };
  const lc = { id: 'zc', tasks: [tc] };
  const ca = { c: { i1: { act: 'pending' }, i2: { act: 'pending' }, i3: { act: 'accept' } } };
  assert.equal(E.countValue(lc, { kind: 'itemsWhere', task: 'c', field: 'act', equals: ['reject', 'pending'] }, ca), 1, 'i1 key reject but student pending is not a true find');
  assert.equal(E.countValue(lc, { kind: 'sumItems', task: 'c', where: { field: 'act', equals: ['reject', 'pending'] } }, ca), 50);
  assert.equal(E.countValue(lc, { kind: 'sumItems', task: 'c' }, ca), 157, 'no where: every answered item');
  assert.equal(E.trueFind(['a', 'b'], ['b'], ['b', 'z']), true);
  assert.equal(E.trueFind('a', 'b', ['a', 'b']), false);
});

test('templates: values, plurals, optional parts and fallback', () => {
  assert.equal(E.renderTemplate('flagged {n} {n|exception|exceptions}', { n: 1 }), 'flagged 1 exception');
  assert.equal(E.renderTemplate('flagged {n} {n|exception|exceptions}', { n: 4 }), 'flagged 4 exceptions');
  assert.equal(E.renderTemplate('checked {n} bills', { n: 12345 }), 'checked 12,345 bills');
  assert.equal(E.renderTemplate('worth {v}', { v: 420000 }, { v: 'lakh' }), 'worth ₹4.2 lakh');
  assert.equal(E.renderTemplate('worth {v}', { v: 27345000 }, { v: 'crore1' }), 'worth ₹2.7 crore');
  assert.equal(E.renderTemplate('worth {v}', { v: 27345000 }, { v: 'crore' }), 'worth ₹2.73 crore');
  assert.equal(E.renderTemplate('worth {v}', { v: 30000000 }, { v: 'crore1' }), 'worth ₹3 crore');
  assert.equal(E.renderTemplate('worth {v}', { v: 425600 }, { v: 'lakh2' }), 'worth ₹4.26 lakh');
  assert.equal(E.renderTemplate('variance {v}', { v: -2.857 }, { v: 'pct1' }), 'variance −2.9%');
  assert.equal(E.renderTemplate('a {x} b', { x: null }), null);
  assert.equal(E.renderTemplate('vouched {n} bills[[; flagged {f} ({t})]]', { n: 20, f: 0, t: null }), 'vouched 20 bills');
  assert.equal(E.renderTemplate('vouched {n} bills[[; flagged {f} ({t})]]', { n: 20, f: 2, t: '2 cut-off' }), 'vouched 20 bills; flagged 2 (2 cut-off)');
  // a plain 0 is never printed in a line ("Vouched 0 bills"): it counts as missing, so the fallback applies, and an
  // outline uses its soft word
  assert.equal(E.renderTemplate('found {x} rows', { x: 0 }), null, 'zero outside an optional part counts as missing');
  assert.equal(E.renderTemplate('found {x} {x|row|rows}', { x: 0 }), null);
  assert.equal(E.renderTemplate('I vouched {x} bills', { x: 0 }, {}, { soft: 'some' }), 'I vouched some bills');
  assert.equal(E.renderClause({ earned: { clause: 'vouched {n} bills', fallback: 'vouched the bills' } }, { n: 0 }), 'vouched the bills');
  const lv = { earned: { clause: 'flagged {f} ({t})', fallback: 'vouched {n} bills', counts: {} } };
  assert.equal(E.renderClause(lv, { f: 2, t: null, n: 9 }), 'vouched 9 bills');
  assert.equal(E.renderClause({ earned: { clause: 'checked {n} items.' } }, { n: 3 }), 'checked 3 items');
});

test('the line and the one line per domain', () => {
  assert.equal(E.buildLine('Statutory Audit Work Simulation', 'Nov 2026', 'vouched 20 year-end purchase bills against POs, GRNs and the ledger; flagged 5 exceptions (2 cut-off, 1 unapproved PO, 1 GSTIN mismatch, 1 rate difference)'),
    'Statutory Audit Work Simulation, MSC Articleship Program | Nov 2026: Vouched 20 year-end purchase bills against POs, GRNs and the ledger; flagged 5 exceptions (2 cut-off, 1 unapproved PO, 1 GSTIN mismatch, 1 rate difference)');
  assert.equal(E.buildDomainLine('GST Work Simulation', [{ clause: 'prepared the GSTR-1 tables', month: 'Nov 2026', at: 1 }, { clause: 'matched ITC to GSTR-2B', month: 'Dec 2026', at: 2 }]),
    'GST Work Simulation, MSC Articleship Program | Dec 2026: Prepared the GSTR-1 tables; matched ITC to GSTR-2B');
  assert.equal(E.buildDomainLine('X', []), null);
  assert.equal(E.linePrefix('GST Work Simulation'), 'GST Work Simulation, MSC Articleship Program');
});

test('state reducers: attempt, answers, hints, submit and the best attempt', () => {
  let s = E.emptyState();
  s = E.startAttempt(s, demo.id, 1000);
  assert.equal(s.levels[demo.id].attempt.n, 1);
  const again = E.startAttempt(s, demo.id, 1100);
  assert.equal(again.levels[demo.id].attempt.startedAt, 1000, 'an attempt in progress is kept');
  s = E.setItemField(s, demo.id, 't1', 'b1', 'verdict', 'ok', 1200);
  s = E.setItemField(s, demo.id, 't1', 'b1', 'verdict', '', 1300);
  assert.equal(s.levels[demo.id].attempt.answers.t1, undefined, 'empty values are removed');
  s = E.useHint(s, demo, 't1', 1400); s = E.useHint(s, demo, 't1', 1500); s = E.useHint(s, demo, 't1', 1600);
  assert.equal(s.levels[demo.id].attempt.hints.t1, 2, 'capped at the number of hints');
  // perfect answers with 2 hints -> band 3 - 2 = 1 star
  const key = L.keyAnswers(demo);
  Object.keys(key).forEach(tid => { s = E.updateAnswers(s, demo.id, tid, () => key[tid], 1700); });
  s = E.submitAttempt(s, demo, new Date(2026, 10, 14).getTime());
  let ls = s.levels[demo.id];
  assert.equal(ls.attempt.result.stars, 1);
  assert.equal(ls.best.stars, 1);
  assert.equal(ls.best.month, 'Nov 2026');
  assert.equal(ls.best.clause, 'vouched 4 year-end purchase bills against POs, GRNs and the ledger; flagged 3 exceptions (1 cut-off, 1 unapproved PO, 1 rate difference) and 5 payment red flags');
  assert.equal(ls.attempts, 1);
  assert.deepEqual(E.bestAnswers(ls), key);
  // try again: clean attempt; best keeps its answers
  s = E.startAttempt(s, demo.id, 3000);
  ls = s.levels[demo.id];
  assert.equal(ls.attempt.n, 2);
  assert.deepEqual(ls.attempt.answers, {});
  assert.deepEqual(E.bestAnswers(ls), key);
  // a worse attempt does not replace the best
  s = E.updateAnswers(s, demo.id, 't1', () => L.wrongAnswers(demo).t1, 3100);
  s = E.submitAttempt(s, demo, 4000);
  ls = s.levels[demo.id];
  assert.equal(ls.best.n, 1);
  assert.equal(ls.attempt.result.passed, false);
  // a better attempt (no hints) does
  s = E.startAttempt(s, demo.id, 5000);
  Object.keys(key).forEach(tid => { s = E.updateAnswers(s, demo.id, tid, () => key[tid], 5100); });
  s = E.submitAttempt(s, demo, new Date(2026, 11, 2).getTime());
  ls = s.levels[demo.id];
  assert.equal(ls.best.n, 3); assert.equal(ls.best.stars, 3); assert.equal(ls.best.month, 'Dec 2026');
  assert.equal(ls.best.answers, undefined, 'answers live once, on the attempt');
  assert.deepEqual(E.bestAnswers(ls), key);
  // submitted attempts cannot be edited
  const frozen = E.setItemField(s, demo.id, 't1', 'b1', 'verdict', 'exception', 6000);
  assert.equal(frozen.levels[demo.id].attempt.answers.t1.b1.verdict, 'ok');
});

test('the demo fixture end to end: key, wrong, blank, partial', () => {
  const run = answers => {
    let s = E.startAttempt(E.emptyState(), demo.id, 1);
    Object.keys(answers).forEach(tid => { s = E.updateAnswers(s, demo.id, tid, () => answers[tid], 2); });
    return E.submitAttempt(s, demo, 3).levels[demo.id];
  };
  const k = run(L.keyAnswers(demo));
  assert.equal(k.best.stars, 3); assert.equal(k.best.accuracy, 1); assert.ok(k.best.clause);
  const w = run(L.wrongAnswers(demo));
  assert.equal(w.best.stars, 0); assert.equal(w.best.passed, false); assert.equal(w.best.clause, null);
  const b = run({});
  assert.equal(b.best.stars, 0); assert.equal(b.best.passed, false);
  const p = run(L.partialAnswers(demo));
  assert.ok(p.best.passed); assert.ok(p.best.stars >= 1 && p.best.stars <= 2);
  const m = run(L.minimalPassing(demo));
  assert.ok(m.best.passed); assert.ok(m.best.clause, 'a minimal pass still earns a clause');
});

test('state normalise and merge: newest per level wins', () => {
  assert.deepEqual(E.normalizeState('junk'), E.emptyState());
  assert.deepEqual(E.normalizeState({ levels: { a: 'x' }, cv: { d: 3 } }).levels, {});
  const a = { v: 1, updatedAt: 10, levels: { x: { updatedAt: 5, attempts: 1, best: { stars: 1 } }, y: { updatedAt: 9, attempts: 0 } }, cv: { gst: { picks: ['gst-1'], updatedAt: 3 } }, sampleName: 'A' };
  const b = { v: 1, updatedAt: 12, levels: { x: { updatedAt: 7, attempts: 2, best: { stars: 3 } }, z: { updatedAt: 1, attempts: 0 } }, cv: { gst: { picks: ['gst-2'], updatedAt: 2 } }, sampleName: 'B' };
  const m = E.mergeStates(a, b);
  assert.equal(m.levels.x.best.stars, 3);
  assert.ok(m.levels.y && m.levels.z);
  assert.deepEqual(m.cv.gst.picks, ['gst-1']);
  assert.equal(m.updatedAt, 12);
  assert.equal(m.sampleName, 'B');
  assert.deepEqual(E.mergeStates(b, a), m, 'merge is symmetric');
  const tie = E.mergeStates({ levels: { x: { updatedAt: 5, attempts: 1 } } }, { levels: { x: { updatedAt: 5, attempts: 3 } } });
  assert.equal(tie.levels.x.attempts, 3);
});

// consistency pass round 2 (I2-01): a level passed on one device (signed out) and an attempt only started on another a
// day later; the newer entry wins, but its pass, line and work sample are never lost
test('a newer started attempt never drops a pass from the other copy', () => {
  const key = L.keyAnswers(demo);
  let phone = E.startAttempt(E.emptyState(), demo.id, 1000);
  Object.keys(key).forEach(tid => { phone = E.updateAnswers(phone, demo.id, tid, () => key[tid], 1100); });
  phone = E.submitAttempt(phone, demo, new Date(2026, 10, 14).getTime());
  const passedBest = clone(phone.levels[demo.id].best);
  assert.equal(passedBest.stars, 3); assert.ok(passedBest.clause);
  let laptop = E.startAttempt(E.emptyState(), demo.id, new Date(2026, 10, 15).getTime());
  laptop = E.setItemField(laptop, demo.id, 't1', 'b1', 'verdict', 'exception', new Date(2026, 10, 15, 1).getTime());
  assert.equal(laptop.levels[demo.id].attempt.n, 1, 'the laptop numbers its own attempt 1 as well');
  const cat = { domains: [{ id: 'statutory-audit', name: 'Statutory audit', short: 'Statutory audit', cvName: 'Statutory Audit Work Simulation' }],
    levels: [{ id: demo.id, domain: 'statutory-audit', number: 1, title: 'Demo', order: 1, published: true }] };
  [E.mergeStates(phone, laptop), E.mergeStates(laptop, phone)].forEach((m, k) => {
    const ls = m.levels[demo.id];
    assert.equal(ls.best.stars, 3, 'best kept (order ' + k + ')');
    assert.equal(ls.best.clause, passedBest.clause);
    assert.ok(ls.attempt && !ls.attempt.submittedAt, 'the newer started attempt is kept');
    assert.equal(ls.attempt.answers.t1.b1.verdict, 'exception');
    assert.ok(ls.attempt.n > ls.best.n, 'the started attempt is renumbered above the pass');
    assert.deepEqual(E.bestAnswers(ls), key, 'the work sample still has the passed answers');
    assert.equal(ls.attempts, 1);
    assert.equal(E.domainLine(cat, m, 'statutory-audit', false), 'Statutory Audit Work Simulation, MSC Articleship Program | Nov 2026: ' + passedBest.clause.charAt(0).toUpperCase() + passedBest.clause.slice(1));
  });
  assert.deepEqual(E.mergeStates(phone, laptop), E.mergeStates(laptop, phone), 'merge is symmetric');
  // a better pass on the newer copy still wins over an older, worse one
  const worse = clone(phone); worse.levels[demo.id].best.stars = 1; worse.levels[demo.id].updatedAt = 1;
  const better = clone(phone); better.levels[demo.id].updatedAt = 2;
  assert.equal(E.mergeStates(worse, better).levels[demo.id].best.stars, 3);
  assert.equal(E.mergeStates(better, worse).levels[demo.id].best.stars, 3);
});

test('progress and the submit check', () => {
  const miss = E.unanswered(demo, {});
  assert.equal(miss.length, 6);
  assert.deepEqual(miss[0].noun, ['bill', 'bills']);
  assert.equal(miss[0].missing, 4);
  assert.equal(E.unanswered(demo, L.keyAnswers(demo)).length, 0);
  assert.deepEqual(E.taskProgress(demo, demo.tasks[1], { 'r1.counted': '2375', 'r1.var': 'x' }), { done: 1, total: 12 });
});

test('catalogue helpers: next, continue, picks and the domain line', () => {
  const cat = { domains: [{ id: 'gst', name: 'GST', short: 'GST', cvName: 'GST Work Simulation' }, { id: 'statutory-audit', name: 'Statutory audit', short: 'Statutory audit', cvName: 'Statutory Audit Work Simulation' }],
    levels: [{ id: 'sa-1', domain: 'statutory-audit', number: 1, title: 'A', order: 1, published: true }, { id: 'gst-1', domain: 'gst', number: 1, title: 'B', order: 4, published: true },
      { id: 'gst-2', domain: 'gst', number: 2, title: 'C', order: 11, published: true }, { id: 'gst-3', domain: 'gst', number: 3, title: 'D', order: 16, published: false }] };
  const st = { levels: {
    'gst-1': { updatedAt: 5, best: { passed: true, stars: 3, clause: 'prepared GSTR-1 tables', month: 'Nov 2026', at: 5 } },
    'gst-2': { updatedAt: 8, best: { passed: true, stars: 2, clause: 'matched turnover to the books', month: 'Dec 2026', at: 8 } },
    'sa-1': { updatedAt: 9, attempt: { n: 1, answers: { t1: {} }, hints: {} } } }, cv: {} };
  assert.equal(E.nextLevel(cat, st, null, false).id, 'sa-1');
  assert.equal(E.nextLevel(cat, st, 'gst', false).id, 'sa-1', 'every published GST level is passed');
  assert.equal(E.nextLevel(cat, st, 'gst', true).id, 'gst-3', 'preview shows unpublished levels');
  assert.equal(E.continueLevel(cat, st, false).id, 'sa-1');
  // consistency pass round 1 (FM07): with no pick of the student's own, the most recently passed level alone
  assert.deepEqual(E.cvPicks(cat, st, 'gst', false), ['gst-2']);
  assert.equal(E.domainLine(cat, st, 'gst', false), 'GST Work Simulation, MSC Articleship Program | Dec 2026: Matched turnover to the books');
  // a second level the student adds is kept, the two clauses in level order
  st.cv.gst = { picks: ['gst-2', 'gst-1'], chosen: true };
  assert.deepEqual(E.cvPicks(cat, st, 'gst', false), ['gst-2', 'gst-1']);
  assert.equal(E.domainLine(cat, st, 'gst', false), 'GST Work Simulation, MSC Articleship Program | Dec 2026: Prepared GSTR-1 tables; matched turnover to the books');
  st.cv.gst = { picks: ['gst-1'], chosen: true };
  assert.equal(E.domainLine(cat, st, 'gst', false), 'GST Work Simulation, MSC Articleship Program | Nov 2026: Prepared GSTR-1 tables', 'an explicit single pick of an older level is kept');
  st.cv.gst = { picks: ['gst-2'], chosen: true };
  assert.equal(E.domainLine(cat, st, 'gst', false), 'GST Work Simulation, MSC Articleship Program | Dec 2026: Matched turnover to the books');
  assert.equal(E.levelDisplay(cat.domains[1], cat.levels[0]), 'Statutory audit 1 · A');
  const pr = E.domainProgress(cat, st, 'gst', false);
  assert.deepEqual([pr.done, pr.total, pr.stars, pr.closed], [2, 2, 5, true]);
});

test('compose: line breaks survive, the student’s own line goes where the template says', () => {
  const slots = [{ id: 'a', label: 'A', options: [{ id: '1', text: 'One  query .', correct: true }] }, { id: 'b', label: 'B', options: [{ id: '1', text: 'Two.', correct: true }] }];
  const mail = { id: 'm', type: 'compose', freeText: { label: 'x' }, slots, template: 'Sir,\n\nIntro.\n\n{a}\n\n{b}\n\n{_free}\n\nBye.' };
  assert.equal(E.composeText(mail, { a: '1', b: '1' }), 'Sir,\n\nIntro.\n\nOne query.\n\nTwo.\n\nBye.', 'an empty {_free} leaves no gap');
  assert.equal(E.composeText(mail, { a: '1', b: '1', _free: '  Mine.  ' }), 'Sir,\n\nIntro.\n\nOne query.\n\nTwo.\n\nMine.\n\nBye.');
  assert.equal(E.composeText(mail, { a: '1', _free: 'Mine.' }, { blank: '[…]' }), 'Sir,\n\nIntro.\n\nOne query.\n\n[…]\n\nMine.\n\nBye.');
  assert.equal(E.composeText(mail, { _free: 'Mine.' }, { model: true }), 'Sir,\n\nIntro.\n\nOne query.\n\nTwo.\n\nBye.', 'the model answer has no student line');
  const flat = { id: 'f', type: 'compose', slots, template: '{a} {b}' };
  assert.equal(E.composeText(flat, { a: '1', b: '1', _free: 'Mine.' }), 'One query. Two. Mine.', 'no {_free}: appended');
  const lines = { id: 'l', type: 'compose', slots, template: 'Sir,\n{a}' };
  assert.equal(E.composeText(lines, { a: '1', _free: 'Mine.' }), 'Sir,\nOne query.\n\nMine.', 'no {_free} in a template with lines: a paragraph of its own');
  assert.equal(E.composeText(mail, { a: '1', b: '1', _free: 'Mine.' }, { noFree: true }).indexOf('Mine'), -1);
  assert.equal(E.tidyLines('  a  ,\n\n\n\n b .\n'), 'a,\n\nb.');
});

test('lockOnLeave: a handed-in task is read-only for the rest of the attempt', () => {
  const lv = clone(demo);
  lv.tasks[0].lockOnLeave = true;
  let s = E.startAttempt(E.emptyState(), lv.id, 1);
  s = E.setItemField(s, lv.id, 't1', 'b1', 'verdict', 'ok', 2);
  let a = s.levels[lv.id].attempt;
  assert.equal(E.handInBefore(lv, a, 0), -1, 'task 1 itself is open');
  assert.equal(E.handInBefore(lv, a, 1), 0, 'task 2 waits for task 1 to be handed in');
  assert.equal(E.handInBefore(lv, a, 3), 0);
  assert.equal(E.isLocked(a, 't1'), false);
  s = E.lockTask(s, lv.id, 't1', 3);
  a = s.levels[lv.id].attempt;
  assert.equal(E.isLocked(a, 't1'), true);
  assert.equal(a.locked.t1, 3);
  assert.equal(E.handInBefore(lv, a, 1), -1, 'task 2 opens once task 1 is handed in');
  assert.equal(E.lockTask(s, lv.id, 't1', 9).levels[lv.id].attempt.locked.t1, 3, 'the first hand-in time stays');
  // refused: item fields, task keys, whole-task updates and hints on the locked task
  s = E.setItemField(s, lv.id, 't1', 'b1', 'verdict', 'exception', 4);
  s = E.setItemField(s, lv.id, 't1', 'b2', 'verdict', 'exception', 4);
  s = E.setTaskKey(s, lv.id, 't1', 'x', 'y', 4);
  s = E.updateAnswers(s, lv.id, 't1', () => ({}), 4);
  s = E.useHint(s, lv, 't1', 4);
  a = s.levels[lv.id].attempt;
  assert.deepEqual(a.answers.t1, { b1: { verdict: 'ok' } });
  assert.equal(a.hints.t1, undefined);
  // other tasks are still open
  s = E.setTaskKey(s, lv.id, 't2', 'r1.var', '-1.2', 5);
  assert.equal(s.levels[lv.id].attempt.answers.t2['r1.var'], '-1.2');
  // the lock survives a save/load round trip, and a new attempt starts without it
  const back = E.normalizeState(JSON.parse(JSON.stringify(s)));
  assert.equal(E.isLocked(back.levels[lv.id].attempt, 't1'), true);
  s = E.submitAttempt(s, lv, 6);
  s = E.startAttempt(s, lv.id, 7);
  a = s.levels[lv.id].attempt;
  assert.equal(E.isLocked(a, 't1'), false);
  assert.equal(E.handInBefore(lv, a, 1), 0);
  assert.equal(E.normalizeState({ levels: { x: { attempt: { n: 1, answers: {}, locked: 'yes' } } } }).levels.x.attempt.locked, undefined, 'a broken lock map is dropped');
});

test('itemsWhere withRight: a bill flagged for the wrong reason is not a find', () => {
  const t = { id: 't', type: 'items', fields: [
    { id: 'verdict', kind: 'choice', gate: true, options: [{ id: 'ok' }, { id: 'ex' }] },
    { id: 'reasons', kind: 'multi', showIf: { verdict: 'ex' }, options: [{ id: 'a', short: 'aa' }, { id: 'b', short: 'bb' }] }],
    items: [{ id: 'x1', answer: { verdict: 'ex', reasons: ['a'] } }, { id: 'x2', answer: { verdict: 'ex', reasons: ['b'] } }, { id: 'x3', answer: { verdict: 'ok' } }] };
  const lv = { id: 'w', tasks: [t] };
  const ans = { t: { x1: { verdict: 'ex', reasons: ['a'] }, x2: { verdict: 'ex', reasons: ['a'] }, x3: { verdict: 'ex', reasons: ['a'] } } };
  assert.equal(E.countValue(lv, { kind: 'itemsWhere', task: 't', field: 'verdict', equals: 'ex' }, ans), 2);
  assert.equal(E.countValue(lv, { kind: 'itemsWhere', task: 't', field: 'verdict', equals: 'ex', withRight: 'reasons' }, ans), 1, 'x2 had only a wrong reason');
  assert.equal(E.countValue(lv, { kind: 'tally', task: 't', field: 'reasons' }, ans), '1 aa', 'the brackets agree with the count');
  // engine 1.3.0: a right reason ticked with a wrong one, or every reason ticked, names nothing
  const both = { t: { x1: { verdict: 'ex', reasons: ['a', 'b'] }, x2: { verdict: 'ex', reasons: ['a', 'b'] } } };
  assert.equal(E.countValue(lv, { kind: 'itemsWhere', task: 't', field: 'verdict', equals: 'ex', withRight: 'reasons' }, both), 0);
  assert.equal(E.countValue(lv, { kind: 'tally', task: 't', field: 'reasons' }, both), null);
});

test('number boxes: typed figures shown in Indian grouping, the ± button flips the sign', () => {
  assert.equal(E.tidyNumberText('₹ 49,440'), '49,440');
  assert.equal(E.tidyNumberText('49440'), '49,440');
  assert.equal(E.tidyNumberText('-1864000'), '−18,64,000');
  assert.equal(E.tidyNumberText('(2.5)'), '−2.5');
  assert.equal(E.tidyNumberText('-2.857%'), '−2.857');
  assert.equal(E.tidyNumberText('0'), '0');
  assert.equal(E.tidyNumberText('12 boxes'), '12 boxes', 'not a number: kept as typed');
  assert.equal(E.parseNumber(E.tidyNumberText('1234567.891')), 1234567.891, 'the number itself never changes');
  assert.equal(E.toggleSign('18,64,000'), '−18,64,000');
  assert.equal(E.toggleSign('−18,64,000'), '18,64,000');
  assert.equal(E.toggleSign('-5'), '5');
  assert.equal(E.toggleSign('(5)'), '5');
  assert.equal(E.toggleSign(''), '−', 'an empty box gets the minus first, then the digits');
  assert.equal(E.toggleSign('−'), '');
  assert.equal(E.parseNumber(E.toggleSign('1864000')), -1864000);
  assert.equal(E.isNegativeText('−'), true);
  assert.equal(E.isNegativeText('−18,64,000'), true);
  assert.equal(E.isNegativeText('49,440'), false);
  assert.equal(E.isNegativeText(''), false);
});

test('the one-click strategy (the commonest call on every item) never passes a level', () => {
  const lazy = L.defaultAnswers(demo);
  assert.ok(E.scoreLevel(demo, lazy).accuracy < 0.5, 'demo fixture: ' + E.scoreLevel(demo, lazy).accuracy);
  const gate = demo.tasks[0].fields.find(f => f.gate);
  const counts = {}; demo.tasks[0].items.forEach(it => { counts[it.answer[gate.id]] = (counts[it.answer[gate.id]] || 0) + 1; });
  const common = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  demo.tasks[0].items.forEach(it => assert.equal(lazy.t1[it.id][gate.id], common));
  assert.deepEqual(Object.keys(lazy), demo.tasks.filter(t => t.type === 'items').map(t => t.id), 'only items tasks are answered');
});

/* ---------------------------------------------------------------- sa-1 round 2 */
const sa1 = require('../articleship-program/work-simulation/data/levels/sa-1.json');
// sa-1 answer sets the judges played: the key with parts of t1 taken away, the other tasks from the key
function sa1Set(fn) {
  const a = L.keyAnswers(sa1);
  sa1.tasks[0].items.forEach(it => { a.t1[it.id] = fn(it, a.t1[it.id]); });
  return a;
}
const bookYear = { b11: 'fy27', b15: 'fy28' };   // the year each bill was booked in (two cut-off errors)

test('items count with answered: "gate" counts the bills the student made a call on (no "Vouched 0")', () => {
  // A: every verdict and reason right, no year picked; C: every bill Fine, no year
  const A = sa1Set((it, ia) => { const x = clone(ia); delete x.year; return x; });
  const C = sa1Set(() => ({ verdict: 'ok' }));
  [A, C].forEach((set, i) => {
    const v = E.computeCounts(sa1, set);
    assert.equal(v.bills, 20, 'strategy ' + 'AC'[i]);
    assert.match(E.renderClause(sa1, v), /^vouched 20 year-end purchase bills/);
    E.outlineLines(sa1, 0, v).forEach(x => assert.ok(!/\b0 /.test(x), x));
  });
  // with no year picked the two cut-offs are not counted as finds (a cut-off needs its year), the other five are
  assert.match(E.renderClause(sa1, E.computeCounts(sa1, A)), /flagged 5 exceptions \(1 unapproved PO, /);
  // the old count (every visible question answered) would have said 0 for A, 12 for "year picked on 12 bills"
  const twelve = sa1Set((it, ia) => { const x = clone(ia); if (+it.id.slice(1) > 12) delete x.year; return x; });
  assert.equal(E.countValue(sa1, { kind: 'items', task: 't1' }, A), 0);
  assert.equal(E.countValue(sa1, { kind: 'items', task: 't1' }, twelve), 12);
  assert.equal(E.countValue(sa1, { kind: 'items', task: 't1', answered: 'gate' }, twelve), 20);
  const some = sa1Set((it, ia) => (+it.id.slice(1) <= 15 ? ia : undefined));
  assert.equal(E.countValue(sa1, { kind: 'items', task: 't1', answered: 'gate' }, some), 15);
});

test('passNeeds: a pass needs the bill calls, not only the mail and the sheet the hand-in gives away', () => {
  const key = L.keyAnswers(sa1);
  const B = sa1Set(it => ({ verdict: 'ok', year: bookYear[it.id] || it.answer.year }));     // all Fine, the ledger's year
  const B2 = clone(B); delete B2.t3;
  const t1only = L.keyAnswers(sa1); delete t1only.t2; delete t1only.t3;
  const rB = E.resultFor(sa1, B, 0), rB2 = E.resultFor(sa1, B2, 0), rT1 = E.resultFor(sa1, t1only, 0);
  // weights (round 3): t1 20 bills × 2, t2 5 mail lines × 3, t3 6 cells × 2 = 67 units
  assert.ok(rB.accuracy > 0.79 && rB.accuracy < 0.80, 'B scores ' + rB.accuracy);
  assert.equal(rB.passed, false); assert.equal(rB.stars, 0); assert.deepEqual(rB.short, ['t1']);
  assert.ok(rB2.accuracy > 0.61 && rB2.accuracy < 0.62, 'B2 scores ' + rB2.accuracy); assert.equal(rB2.passed, false); assert.equal(rB2.stars, 0);
  assert.equal(rT1.passed, true, 't1 key alone passes (' + rT1.accuracy + ')'); assert.equal(rT1.stars, 1);
  assert.equal(E.resultFor(sa1, key, 0).stars, 3);
  assert.equal(E.resultFor(sa1, key, 2).stars, 1, 'hints still cost stars');
  // 14 of 20 bills fully right is the least that passes the bill calls (0.7); 13 is not enough
  const right = n => sa1Set((it, ia) => (sa1.tasks[0].items.indexOf(it) < n ? ia : { verdict: it.answer.verdict === 'ok' ? 'exception' : 'ok', year: it.answer.year }));
  assert.deepEqual(E.passNeedsShort(sa1, E.scoreLevel(sa1, right(14))), []);
  assert.equal(E.passNeedsShort(sa1, E.scoreLevel(sa1, right(13))).length, 1);
  // a level without passNeeds keeps the 50% rule alone
  const plain = clone(sa1); delete plain.passNeeds;
  assert.equal(E.resultFor(plain, B, 0).passed, true);
  // submitAttempt stores the same result
  let s = E.startAttempt(E.emptyState(), 'sa-1', 1);
  s = E.updateAnswers(s, 'sa-1', 't1', () => B.t1, 2);
  s = E.updateAnswers(s, 'sa-1', 't2', () => B.t2, 3);
  s = E.updateAnswers(s, 'sa-1', 't3', () => B.t3, 4);
  s = E.submitAttempt(s, sa1, 5);
  const r = s.levels['sa-1'].attempt.result;
  assert.equal(r.passed, false); assert.equal(r.stars, 0); assert.deepEqual(r.short, ['t1']);
  assert.equal(s.levels['sa-1'].best.clause, null, 'no line without a pass');
});

test('wrapFor: the closing note fits the result', () => {
  const lv = { wrap: { text: 'clean' }, wrapPartial: { text: 'partial' }, wrapRetry: { text: 'retry' } };
  assert.equal(E.wrapFor(lv, { passed: true, accuracy: 0.95 }).text, 'clean');
  assert.equal(E.wrapFor(lv, { passed: true, accuracy: 0.9 }).text, 'clean');
  assert.equal(E.wrapFor(lv, { passed: true, accuracy: 0.6 }).text, 'partial');
  assert.equal(E.wrapFor(lv, { passed: false, accuracy: 0.8 }).text, 'retry');
  assert.equal(E.wrapFor({ wrap: { text: 'clean' } }, { passed: true, accuracy: 0.6 }).text, 'clean', 'no wrapPartial: the wrap');
  assert.equal(E.wrapFor({ wrap: { text: 'clean' } }, { passed: false, accuracy: 0.2 }), null, 'no wrapRetry: no note');
  assert.ok(sa1.wrapPartial && !/send the mail/i.test(sa1.wrapPartial.text), 'sa-1 does not tell a partial pass to send the mail');
});

test('itemReview: a partly right reason list pick by pick, and what a wrong call flagged', () => {
  const t1 = sa1.tasks[0], b11 = t1.items.find(i => i.id === 'b11'), b3 = t1.items.find(i => i.id === 'b3');
  const r11 = E.itemReview(t1, b11, { verdict: 'exception', year: 'fy28', reasons: ['cutoff', 'gstin'] });
  const rs = r11.fields.find(f => f.id === 'reasons');
  assert.equal(rs.state, 'partial');
  assert.deepEqual(rs.picks, [{ id: 'cutoff', ok: true }, { id: 'gstin', ok: false }]);
  assert.equal(r11.fields.find(f => f.id === 'verdict').state, 'right');
  const r11b = E.itemReview(t1, b11, { verdict: 'exception', year: 'fy28', reasons: ['price', 'cutoff'] });
  assert.deepEqual(r11b.fields.find(f => f.id === 'reasons').picks, [{ id: 'cutoff', ok: true }, { id: 'price', ok: false }], 'option order');
  const r11c = E.itemReview(t1, b11, { verdict: 'exception', year: 'fy28', reasons: ['cutoff', 'qty'] });
  assert.ok(r11c.fields.find(f => f.id === 'reasons').picks.some(p => p.id === 'qty' && !p.ok));
  // Bill 3 is fine; flagged for price, the review must still show the price flag
  const r3 = E.itemReview(t1, b3, { verdict: 'exception', year: 'fy27', reasons: ['price'] });
  assert.equal(r3.fields.find(f => f.id === 'verdict').state, 'wrong');
  assert.deepEqual(r3.extra, [{ id: 'reasons', given: ['price'] }]);
  // a stale reason hidden under a Fine call is not said back
  assert.deepEqual(E.itemReview(t1, b3, { verdict: 'ok', year: 'fy27', reasons: ['price'] }).extra, []);
  // a missed reason in a partly right list
  const two = { id: 'z', answer: { verdict: 'exception', year: 'fy27', reasons: ['cutoff', 'price'] } };
  assert.deepEqual(E.itemReview(t1, two, { verdict: 'exception', year: 'fy27', reasons: ['cutoff'] }).fields.find(f => f.id === 'reasons').picks,
    [{ id: 'cutoff', ok: true }, { id: 'price', missed: true }]);
});

test('the validator: passNeeds, wrapPartial, gate counts and a right option’s why', () => {
  const bad = clone(sa1);
  bad.passNeeds = [{ task: 'nope', min: 2, extra: 1 }];
  bad.wrapPartial = { from: 'nobody', text: 'Good. Send the mail to Mahesh now.' };
  bad.earned.counts.bills.answered = 'all';
  bad.tasks[1].slots[0].options.find(o => o.correct).why = 'Right. The supplier fixes it.';
  const r = L.validateLevel(bad, {});
  const e = r.errors.join('\n'), w = r.warns.join('\n');
  [/passNeeds\[0\]: task nope missing/, /min must be a share/, /unknown key extra/, /person “nobody”/, /answered must be "gate"/].forEach(re => assert.match(e, re));
  assert.match(w, /starts with “Right”/);
  assert.match(w, /should not be told to send/);
  // the gates-only set: every main call from the key, nothing else on the items, the other tasks from the key
  const gs = L.gatesOnly(sa1);
  assert.deepEqual(gs.t1.b1, { verdict: 'ok' }); assert.deepEqual(gs.t2, L.keyAnswers(sa1).t2);
});

/* ---------------------------------------------------------------- sa-1 round 3 */
const FALLBACK = 'vouched 20 year-end purchase bills against PO, GRN and ledger';
const REAL = ['cutoff', 'approval', 'price', 'qty', 'gstin', 'gstRate'];
const exceptions = sa1.tasks[0].items.filter(it => it.answer.verdict === 'exception');
function sa1Clause(set) { const r = E.resultFor(sa1, set, 0); return { r, clause: r.passed ? E.renderClause(sa1, E.computeCounts(sa1, set)) : null }; }

test('the CV line’s brackets count only clean diagnoses: no wrong pick on the bill', () => {
  // every exception with all six real reasons ticked; every exception with its right reason plus a wrong one
  const six = sa1Set((it, ia) => (it.answer.verdict === 'exception' ? Object.assign(clone(ia), { reasons: REAL.slice() }) : ia));
  const plus = sa1Set((it, ia) => (it.answer.verdict === 'exception' ? Object.assign(clone(ia), { reasons: [it.answer.reasons[0], REAL.find(x => x !== it.answer.reasons[0])] }) : ia));
  [six, plus].forEach((set, i) => {
    const { r, clause } = sa1Clause(set);
    assert.equal(r.passed, true, 'strategy ' + i + ' passes');
    assert.equal(clause, FALLBACK, 'strategy ' + i + ': no brackets the student did not earn');
  });
  assert.equal(E.resultFor(sa1, six, 0).stars, 2, 'six reasons ticked everywhere: under 90%');
  // the key with Bill 2 flagged GSTIN and rate: Bill 2 is no longer a find, everything else is
  const b2 = L.keyAnswers(sa1); b2.t1.b2.reasons = ['gstin', 'gstRate'];
  assert.equal(sa1Clause(b2).clause, FALLBACK + '; flagged 6 exceptions (2 cut-off, 1 unapproved PO, 1 overpricing, 1 excess quantity, 1 wrong GST rate)');
  // a cut-off needs the right year too: "cut-off" with the year it was booked in says the opposite
  const yr = L.keyAnswers(sa1); yr.t1.b11.year = 'fy27';
  assert.equal(sa1Clause(yr).clause, FALLBACK + '; flagged 6 exceptions (1 cut-off, 1 unapproved PO, 1 overpricing, 1 excess quantity, 1 GSTIN mismatch, 1 wrong GST rate)');
  // the shotgun set the validator uses: every option ticked, so every count from a pick list is empty
  const sg = E.computeCounts(sa1, L.shotgun(sa1));
  assert.equal(sg.types, null); assert.equal(sg.found, 0);
  assert.equal(E.renderClause(sa1, E.computeCounts(sa1, L.keyAnswers(sa1))), FALLBACK + '; flagged 7 exceptions (2 cut-off, 1 unapproved PO, 1 overpricing, 1 excess quantity, 1 GSTIN mismatch, 1 wrong GST rate)', 'the key’s line is unchanged');
});

test('field weight: naming what is wrong weighs 3 on an exception bill', () => {
  const t1 = sa1.tasks[0], b9 = t1.items.find(i => i.id === 'b9');
  assert.equal(E.fieldWeight(t1.fields.find(f => f.id === 'reasons')), 3);
  assert.equal(E.fieldWeight({ id: 'x' }), 1, 'default 1');
  assert.equal(E.fieldWeight({ id: 'x', weight: -2 }), 1, 'a broken weight counts 1');
  // call right, year right, reason wrong: (1 + 1 + 3 × 0) / 5
  assert.ok(Math.abs(E.scoreItem(t1, b9, { verdict: 'exception', year: 'fy27', reasons: ['price'] }).score - 0.4) < 1e-9);
  // call right, year wrong, reason right: (1 + 0 + 3) / 5
  assert.ok(Math.abs(E.scoreItem(t1, b9, { verdict: 'exception', year: 'fy28', reasons: ['qty'] }).score - 0.8) < 1e-9);
  // a Fine bill is untouched: the reasons are not asked, so (1 + 1) / 2
  const b1 = t1.items.find(i => i.id === 'b1');
  assert.equal(E.scoreItem(t1, b1, { verdict: 'ok', year: 'fy27' }).score, 1);
  assert.equal(E.scoreItem(t1, b1, { verdict: 'ok', year: 'fy28' }).score, 0.5);
  // every exception call right and every reason wrong: two stars, not three
  const wrongR = sa1Set((it, ia) => (it.answer.verdict === 'exception' ? Object.assign(clone(ia), { reasons: [REAL.find(x => x !== it.answer.reasons[0])] }) : ia));
  const r = E.resultFor(sa1, wrongR, 0);
  assert.ok(r.accuracy < 0.9 && r.accuracy > 0.85, 'every reason wrong: ' + r.accuracy); assert.equal(r.stars, 2);
});

test('the mail can cost stars, and the clean closing note needs every mail line right', () => {
  const key = L.keyAnswers(sa1), wrong = L.wrongAnswers(sa1);
  const allWrong = clone(key); allWrong.t2 = clone(wrong.t2);
  const r = E.resultFor(sa1, allWrong, 0);
  assert.ok(r.accuracy < 0.8, 'every mail line wrong: ' + r.accuracy); assert.equal(r.stars, 2);
  assert.equal(E.wrapFor(sa1, r, r.scored), sa1.wrapPartial);
  // one wrong line (backdate Rohit's signature): still three stars, but not the clean note
  const one = clone(key); one.t2.approval = 'a';
  const r1 = E.resultFor(sa1, one, 0);
  assert.equal(r1.stars, 3);
  assert.equal(E.wrapFor(sa1, r1, r1.scored), sa1.wrapPartial, 'key with one wrong mail line: wrapPartial');
  assert.equal(E.wrapFor(sa1, r1), sa1.wrapPartial, 'resultFor carries scored, so the default works too');
  const rk = E.resultFor(sa1, key, 0);
  assert.equal(E.wrapFor(sa1, rk, rk.scored), sa1.wrap);
  // a stored result without task scores never gets the clean note on a guess; with them it does
  assert.equal(E.wrapFor(sa1, { passed: true, accuracy: 1 }), sa1.wrapPartial);
  assert.equal(E.wrapFor(sa1, { passed: true, accuracy: 1, tasks: { t2: { earned: 5, max: 5 } } }), sa1.wrap);
  // no wrapPartial: the wrap, whatever the mail
  const noPartial = clone(sa1); delete noPartial.wrapPartial;
  assert.equal(E.wrapFor(noPartial, r1, r1.scored).text, sa1.wrap.text);
  assert.ok(!/\bsend (it|the mail)\b/i.test(sa1.wrap.text), 'the wrap never tells the student to send the mail');
  // a task entirely wrong never reaches 90%
  sa1.tasks.forEach(t => assert.ok(E.scoreLevel(sa1, L.oneTaskWrong(sa1, t.id)).accuracy < 0.9, t.id));
  assert.ok(E.scoreLevel(sa1, L.defaultAnswers(sa1)).accuracy < 0.5, 'one-click still fails');
});

test('the percentage shown is floored, so it never shows a band the attempt did not reach', () => {
  assert.equal(E.pctShown(0.8955), 89);
  assert.equal(E.pctShown(0.9), 90);
  assert.equal(E.pctShown(0.7463), 74);
  assert.equal(E.pctShown(1), 100);
  assert.equal(E.pctShown(0.4999), 49);
  assert.equal(E.pctShown(60 / 67), 89, 'sa-1 round 4: 60 of 67 units is 89.55%, two stars, so "89% right"');
  assert.equal(E.pctShown(undefined), 0);
  // the shown figure and the band always agree at every boundary
  for (let u = 0; u <= 670; u++) {
    const acc = u / 670, shown = E.pctShown(acc);
    assert.equal(E.band(shown / 100), E.band(acc), u + '/670 shows ' + shown + '%');
  }
});

test('a column of changes prints an increase with a plus (signed), zero and decreases as they are', () => {
  assert.equal(E.formatSigned(1864000, 'inr'), '+₹18,64,000');
  assert.equal(E.formatSigned(-1864000, 'inr'), '−₹18,64,000');
  assert.equal(E.formatSigned(0, 'inr'), '₹0');
  assert.equal(E.formatSigned(0.001, 'inr'), '₹0', 'a value that rounds to nothing gets no plus');
  assert.equal(E.formatSigned(2.5, 'pct1'), '+2.5%');
  assert.equal(E.formatCell(49440, 'inr', true), '+₹49,440');
  assert.equal(E.formatCell(49440, 'inr', false), '₹49,440');
  const col = { key: 'pbt', format: 'inr', signed: true };
  assert.equal(E.cellSigned(col, { input: true, answer: 1 }), true, 'from the column');
  assert.equal(E.cellSigned(col, { input: true, answer: 1, signed: false }), false, 'a cell overrides its column');
  assert.equal(E.cellSigned({ key: 'x' }, { input: true, signed: true }), true);
  assert.equal(E.cellSigned({ key: 'x' }, 12), false, 'a given number in an unsigned column');
  // sa-1's cut-off sheet holds changes: every column of it is signed
  const sa1 = require('../articleship-program/work-simulation/data/levels/sa-1.json');
  const t3 = sa1.tasks.find(t => t.type === 'worksheet');
  E.inputCells(t3).forEach(cl => assert.equal(E.cellSigned(cl.col, cl.cell), true, cl.key));
  const r1pbt = E.inputCells(t3).find(cl => cl.key === 'r1.pbt');
  assert.equal(E.formatCell(r1pbt.cell.answer, r1pbt.col.format, true), '+₹18,64,000');
});

test('a stored accuracy is floored, so its band, the shown % and the closing note match the stars', () => {
  const lv = { id: 'z', tasks: [{ id: 't', type: 'worksheet', columns: [{ key: 'v' }], rows: [] }] };
  // 22,499 right cells out of 25,000 is 0.89996: rounded to four places it would read 0.9 (three stars' band, "90%");
  // floored it stays 0.8999: two stars, "89% right"
  const n = 25000, right = Math.ceil(0.89996 * n);
  lv.tasks[0].rows = Array.from({ length: n }, (_, i) => ({ id: 'r' + i, cells: { v: { input: true, answer: 1 } } }));
  const answers = { t: {} }; for (let i = 0; i < right; i++) answers.t['r' + i + '.v'] = '1';
  let s = E.startAttempt(E.emptyState(), 'z', 1);
  s = E.updateAnswers(s, 'z', 't', () => answers.t, 2);
  s = E.submitAttempt(s, lv, 3);
  const res = s.levels.z.attempt.result, exact = right / n;
  assert.ok(exact < 0.9 && Math.round(exact * 10000) / 10000 === 0.9, 'the case a rounding would break: ' + exact);
  assert.equal(res.stars, 2); assert.ok(res.accuracy < 0.9, 'stored ' + res.accuracy);
  assert.equal(E.band(res.accuracy), 2); assert.equal(E.pctShown(res.accuracy), 89);
  assert.equal(s.levels.z.best.accuracy, res.accuracy);
});

test('val-1 round 1: num1 prints one decimal; follow gives method marks on the student’s own figures, never on the key', () => {
  // a figure in a line prints one decimal whatever was typed (val-1's EV: "₹123.51 crore" read off the decimals typed)
  assert.equal(E.formatValue(123.51, 'num1'), '123.5');
  assert.equal(E.formatValue(123.13, 'num1'), '123.1');
  assert.equal(E.formatValue(1234.5, 'num1'), '1,234.5');
  assert.equal(E.renderTemplate('EV ₹{ev} crore', { ev: 123.51 }, { ev: 'num1' }), 'EV ₹123.5 crore');
  // the working parser: numbers, + − × ÷ (and - * /), brackets and {row.col} cells; null when it cannot be worked
  const v = k => ({ 'a.x': 10, 'b.x': 4 })[k];
  assert.equal(E.evalFollow('{a.x} ÷ 4 × 100', v), 250);
  assert.equal(E.evalFollow('2328 − {a.x}', v), 2318);
  assert.equal(E.evalFollow('({a.x} - {b.x}) * 2 / 3', v), 4);
  assert.equal(E.evalFollow('−{b.x} + 1', v), -3);
  assert.equal(E.evalFollow('{c.x} + 1', v), null, 'a blank cell gives no working');
  assert.equal(E.evalFollow('1 +', v), null);
  assert.equal(E.evalFollow('', v), null);
  assert.deepEqual(E.followRefs('{r6.fy26} − {r7.fy26} + {r6.fy26}'), ['r6.fy26', 'r7.fy26']);
  const task = { id: 't', type: 'worksheet', columns: [{ key: 'line' }, { key: 'v', format: 'int' }], rows: [
    { id: 'adj', cells: { line: 'Less: extra rent', v: { input: true, answer: [48, -48], tolerance: 0 } } },
    { id: 'tot', cells: { line: 'Adjusted EBITDA', v: { input: true, answer: 1478, tolerance: 0, follow: '1526 − {adj.v}' } } },
    { id: 'pct', cells: { line: 'Margin', v: { input: true, answer: 11.3, tolerance: 0.05, format: 'pct', follow: '{tot.v} ÷ 13079 × 100' } } },
  ] };
  const lv = { id: 'f', tasks: [task] };
  const sc = a => E.scoreTask(task, a, lv);
  let r = sc({ 'adj.v': '48', 'tot.v': '1478', 'pct.v': '11.3' });
  assert.deepEqual([r.earned, r.right, r.followed], [3, 3, 0], 'the key: all right, nothing follows');
  r = sc({ 'adj.v': '72', 'tot.v': '1454', 'pct.v': '11.12' });
  assert.deepEqual([r.earned, r.right, r.followed], [2, 0, 2], 'one slip worked through: the two cells after it score');
  assert.deepEqual(r.follows, { 'tot.v': true, 'pct.v': true });
  assert.equal(r.correct, false);
  r = sc({ 'adj.v': '-72', 'tot.v': '1454', 'pct.v': '' });
  assert.deepEqual([r.earned, r.followed], [1, 1], 'a cell that takes either sign is read as its size; a blank never follows');
  r = sc({ 'adj.v': '48', 'tot.v': '1500', 'pct.v': '11.47' });
  assert.deepEqual([r.earned, r.right, r.followed], [2, 1, 1], 'a wrong total after a right adjustment scores nothing; the margin follows the wrong total');
  r = sc({ 'adj.v': '48', 'tot.v': '1454', 'pct.v': '11.3' });
  assert.deepEqual([r.earned, r.followed], [2, 0], 'a right upstream leaves the key to decide');
  r = sc({ 'adj.v': '', 'tot.v': '1526', 'pct.v': '11.67' });
  assert.deepEqual([r.earned, r.followed], [1, 1], 'a blank upstream cell gives the total no working to follow');
  r = sc({ 'adj.v': '72', 'tot.v': '1454', 'pct.v': '11.2' });
  assert.equal(r.follows['pct.v'], undefined, 'outside the tolerance (0.05 + 0.01 a figure) it does not follow');
  // counts stay on the key: a followed cell is not a right figure in a line
  const lvc = { id: 'f', tasks: [task], earned: { clause: 'x', counts: { m: { kind: 'cell', task: 't', row: 'pct', col: 'v' }, n: { kind: 'correctCells', task: 't' } } } };
  const counts = E.computeCounts(lvc, { t: { 'adj.v': '72', 'tot.v': '1454', 'pct.v': '11.12' } });
  assert.deepEqual([counts.m, counts.n], [null, 0]);
  // con-1: abs and scale turn a right signed figure kept in ₹ lakh into a size a rupee format prints ("₹26.9 crore")
  const lva = { id: 'f', tasks: [task], earned: { clause: 'traced a {s} fall', counts: { s: { kind: 'cell', task: 't', row: 'adj', col: 'v', abs: true, scale: 100000, format: 'crore1' }, p: { kind: 'cell', task: 't', row: 'adj', col: 'v' } } } };
  let ca = E.computeCounts(lva, { t: { 'adj.v': '-48' } });
  assert.deepEqual([ca.s, ca.p], [4800000, -48], 'abs and scale apply to the right figure only; a plain cell count is unchanged');
  assert.equal(E.renderClause(lva, ca), 'traced a ₹0.5 crore fall');
  ca = E.computeCounts(lva, { t: { 'adj.v': '50' } });
  assert.equal(ca.s, null, 'a wrong figure is still no figure');
  const vbad = clone(demo); vbad.earned.counts.bad = { kind: 'items', task: vbad.tasks[0].id, abs: true, scale: -2 };
  const vbe = L.validateLevel(vbad, { fixture: true }).errors.join('\n');
  assert.match(vbe, /abs works on a cell count/);
  assert.match(vbe, /scale works on a cell count/);
  // and the level score uses the method marks; passNeeds reads the same share the student is shown
  const lvp = { id: 'f', tasks: [task], passNeeds: [{ task: 't', min: 0.6 }] };
  const res = E.resultFor(lvp, { t: { 'adj.v': '72', 'tot.v': '1454', 'pct.v': '11.12' } }, 0);
  assert.ok(Math.abs(res.accuracy - 2 / 3) < 1e-9 && res.passed);
  // the validator: a follow uses real cells of its task, does not loop, and gives the key on the key's answers
  const bad = clone(demo), wt = bad.tasks.find(t => t.type === 'worksheet');
  wt.rows[0].cells.var.follow = '{r1.counted} − 2400';
  wt.rows[0].cells.pct.follow = '{r1.var} ÷ 2400 × 100';
  assert.ok(!L.validateLevel(bad, { fixture: true }).errors.some(x => /follow/.test(x)), 'a right follow passes');
  wt.rows[0].cells.var.follow = '{r1.counted} − 2300';
  wt.rows[1].cells.var.follow = '{r9.counted} − 60';
  wt.rows[1].cells.pct.follow = 60;
  wt.rows[2].cells.counted.follow = '{r3.var} + 40';
  wt.rows[2].cells.var.follow = '{r3.counted} − 40';
  wt.rows[2].cells.pct.follow = '42 − 40';
  const errs = L.validateLevel(bad, { fixture: true }).errors.join('\n');
  assert.match(errs, /cell r1\.var follow gives 75 on the key’s answers, not -25/);
  assert.match(errs, /cell r2\.var follow uses r9\.counted, which is not an input cell of t2/);
  assert.match(errs, /cell r3\.counted follow comes back to itself/);
  assert.match(errs, /cell r2\.pct follow must be a working/);
  assert.match(errs, /cell r3\.pct follow uses no other cell/);
});

test('item weight: the find a level is about can cost a star (sa-4); right / of stay item counts', () => {
  const task = { id: 't', type: 'items', fields: [
    { id: 'verdict', kind: 'choice', gate: true, options: [{ id: 'ok' }, { id: 'exception' }] },
    { id: 'reasons', kind: 'multi', weight: 6, showIf: { verdict: 'exception' }, options: [{ id: 'ghost' }, { id: 'days' }] }],
    items: [{ id: 'g', weight: 4, answer: { verdict: 'exception', reasons: ['ghost'] } },
      { id: 'a' }, { id: 'b' }, { id: 'c' }].map(it => Object.assign({ label: it.id, note: 'n', answer: { verdict: 'ok' } }, it)) };
  assert.equal(E.itemWeight(task.items[0]), 4);
  assert.equal(E.itemWeight(task.items[1]), 1, 'default 1');
  assert.equal(E.itemWeight({ weight: 0 }), 1, 'a broken weight counts 1');
  const all = { g: { verdict: 'exception', reasons: ['ghost'] }, a: { verdict: 'ok' }, b: { verdict: 'ok' }, c: { verdict: 'ok' } };
  const r = E.scoreTask(task, all);
  assert.equal(r.max, 7); assert.equal(r.earned, 7); assert.ok(r.correct); assert.equal(r.right, 4); assert.equal(r.of, 4);
  // the weighted item missed: 3 of 7, while "3 of 4 right" still counts items
  const miss = E.scoreTask(task, Object.assign(clone(all), { g: { verdict: 'ok' } }));
  assert.equal(miss.earned, 3); assert.equal(miss.max, 7); assert.equal(miss.right, 3); assert.equal(miss.of, 4);
  // a weighted item part right scores its share times its weight: call right, every reason ticked = (1 + 6 × 0.5) / 7
  const shot = E.scoreTask(task, Object.assign(clone(all), { g: { verdict: 'exception', reasons: ['ghost', 'days'] } }));
  assert.ok(Math.abs(shot.earned - (3 + 4 * 4 / 7)) < 1e-9);
  // passNeeds reads the weighted share
  const lv = { id: 'w', tasks: [task], passNeeds: [{ task: 't', min: 0.6 }] };
  assert.deepEqual(E.passNeedsShort(lv, E.scoreLevel(lv, { t: Object.assign(clone(all), { g: { verdict: 'ok' } }) })).map(p => p.task), ['t']);
  assert.deepEqual(E.passNeedsShort(lv, E.scoreLevel(lv, { t: Object.assign(clone(all), { a: { verdict: 'exception' } }) })), []);
  // an item without weight scores as before (every shipped level until sa-4)
  const plain = clone(task); delete plain.items[0].weight;
  assert.equal(E.scoreTask(plain, all).max, 4);
  // the validator: a weight must be a positive number, a short is short text
  const bad = clone(demo), it = bad.tasks.find(t => t.type === 'items').items[0];
  it.weight = -1; it.short = 'A name far too long for a button';
  const errs = L.validateLevel(bad, { fixture: true }).errors.join('\n');
  assert.match(errs, /weight must be a positive number/);
  assert.match(errs, /short must be text of 16 characters or fewer/);
});

test('withRight on a number field, and sumItems withRight (dt-3: the amount in dispute)', () => {
  const task = { id: 't', type: 'items', fields: [
    { id: 'call', kind: 'choice', gate: true, options: [{ id: 'agree' }, { id: 'part' }, { id: 'disagree' }] },
    { id: 'amt', kind: 'number', tolerance: 0, showIf: { call: ['part', 'disagree'] } },
    { id: 'papers', kind: 'multi', showIf: { call: ['part', 'disagree'] }, options: [{ id: 'bank' }, { id: 'reg' }, { id: 'comp' }] }],
    items: [
      { id: 'b', disputed: 6120000, answer: { call: 'part', amt: 6120000, papers: ['bank', 'reg'] } },
      { id: 'p', answer: { call: 'agree' } },
      { id: 'l', disputed: 960000, answer: { call: 'disagree', amt: 960000, papers: ['comp'] } }] };
  const lv = { id: 'z', tasks: [task] };
  const spec = { kind: 'sumItems', task: 't', prop: 'disputed', where: { field: 'call', equals: ['part', 'disagree'] }, withRight: 'amt' };
  const key = { t: { b: { call: 'part', amt: '61,20,000', papers: ['bank', 'reg'] }, p: { call: 'agree' }, l: { call: 'disagree', amt: '9,60,000', papers: ['comp'] } } };
  assert.equal(E.countValue(lv, spec, key), 7080000, 'both calls and both amounts right');
  const wrongAmt = clone(key); wrongAmt.t.b.amt = '68,00,000';
  assert.equal(E.countValue(lv, spec, wrongAmt), 960000, 'the bonus call is right but its amount is not: only leave encashment counts');
  const wrongCall = clone(key); wrongCall.t.b.call = 'disagree';
  assert.equal(E.countValue(lv, spec, wrongCall), 960000, 'a disagree where the key says part is not a true find');
  const noRight = clone(spec); delete noRight.withRight;
  assert.equal(E.countValue(lv, noRight, wrongAmt), 7080000, 'without withRight the amount is not looked at (as before)');
  assert.equal(E.countValue(lv, spec, { t: {} }), 0, 'nothing answered: 0, so a clause drops it');
  // itemsWhere withRight on a number field
  assert.equal(E.countValue(lv, { kind: 'itemsWhere', task: 't', field: 'call', equals: ['part', 'disagree'], withRight: 'amt' }, wrongAmt), 1);
  // withRight on a pick list is unchanged: a clean find only
  const extra = clone(key); extra.t.b.papers = ['bank', 'reg', 'comp'];
  assert.equal(E.countValue(lv, Object.assign(clone(spec), { withRight: 'papers' }), extra), 960000);
  // the validator: withRight works on itemsWhere and sumItems, on a choice, multi or number field
  const ok = L.validateLevel(demo, { fixture: true }).errors.filter(e => /withRight/.test(e));
  assert.deepEqual(ok, []);
  const bad = clone(demo);
  bad.earned.counts.zz = { kind: 'items', task: 't1', withRight: 'verdict' };
  assert.match(L.validateLevel(bad, { fixture: true }).errors.join('\n'), /withRight works on an itemsWhere, sumItems or cell count/);
});

test('withRight as a list: every named field right on the item (dt-4: the reason and the amount)', () => {
  const task = { id: 't', type: 'items', fields: [
    { id: 'call', kind: 'choice', gate: true, options: [{ id: 'add' }, { id: 'deduct' }, { id: 'none' }] },
    { id: 'why', kind: 'choice', showIf: { call: ['add', 'deduct'] }, options: [{ id: 'dep' }, { id: 'never' }, { id: 'paid' }] },
    { id: 'amt', kind: 'number', tolerance: 0.01, showIf: { call: ['add', 'deduct'] } }],
    items: [
      { id: 'i2', adj: 36189, answer: { call: 'deduct', why: 'dep', amt: 361.89 } },
      { id: 'i3', adj: 1350, answer: { call: 'add', why: 'never', amt: 13.5 } },
      { id: 'i6', answer: { call: 'none' } }] };
  const lv = { id: 'z', tasks: [task] };
  const both = { kind: 'itemsWhere', task: 't', field: 'call', equals: ['add', 'deduct'], withRight: ['why', 'amt'] };
  const key = { t: { i2: { call: 'deduct', why: 'dep', amt: '361.89' }, i3: { call: 'add', why: 'never', amt: '13.50' }, i6: { call: 'none' } } };
  assert.equal(E.countValue(lv, both, key), 2, 'right call, reason and amount on both');
  const trap = clone(key); trap.t.i2.amt = '382.92';
  assert.equal(E.countValue(lv, both, trap), 1, 'the right reason with the wrong amount is not an adjustment made');
  assert.equal(E.countValue(lv, Object.assign(clone(both), { withRight: 'why' }), trap), 2, 'one id behaves as before');
  assert.equal(E.countValue(lv, Object.assign(clone(both), { withRight: ['why'] }), trap), 2, 'a list of one is the same as the id');
  const wrongWhy = clone(key); wrongWhy.t.i3.why = 'paid';
  assert.equal(E.countValue(lv, both, wrongWhy), 1, 'the right amount for the wrong reason is not counted either');
  // sumItems takes the list too
  const sum = { kind: 'sumItems', task: 't', prop: 'adj', where: { field: 'call', equals: ['add', 'deduct'] }, withRight: ['why', 'amt'] };
  assert.equal(E.countValue(lv, sum, key), 37539);
  assert.equal(E.countValue(lv, sum, trap), 1350);
  // the validator accepts a list of real fields and names a field that is not one
  const vl = clone(demo);
  const t1 = vl.tasks.find(t => t.type === 'items');
  const pick = (t1.fields || []).filter(f => f.kind === 'multi' || f.kind === 'choice' || f.kind === 'number').map(f => f.id);
  const gate = (t1.fields || []).find(f => f.gate);
  vl.earned.counts.zz = { kind: 'itemsWhere', task: t1.id, field: gate.id, equals: gate.options[1].id, withRight: pick.filter(id => id !== gate.id).slice(0, 2) };
  assert.deepEqual(L.validateLevel(vl, { fixture: true }).errors.filter(e => /withRight/.test(e)), []);
  vl.earned.counts.zz.withRight = [pick[0], 'nonsense'];
  assert.match(L.validateLevel(vl, { fixture: true }).errors.join('\n'), /withRight nonsense must be a choice, multi or number field/);
  vl.earned.counts.zz.withRight = [];
  assert.match(L.validateLevel(vl, { fixture: true }).errors.join('\n'), /withRight must name at least one field/);
});

test('number boxes keep the decimals the student typed (dt-4: two decimals asked for)', () => {
  assert.equal(E.tidyNumberText('9.90'), '9.90');
  assert.equal(E.tidyNumberText('240.00'), '240.00');
  assert.equal(E.tidyNumberText('92'), '92');
  assert.equal(E.tidyNumberText('1,23,456'), '1,23,456');
  assert.equal(E.tidyNumberText('-2.50'), '−2.50');
  assert.equal(E.tidyNumberText('(2.50)'), '−2.50');
  assert.equal(E.tidyNumberText('25.10%'), '25.10');
  assert.equal(E.tidyNumberText('1234567.891'), '12,34,567.891');
  assert.equal(E.tidyNumberText('1.12345678'), '1.123457', 'more than six decimals: cut to six, as before');
  assert.equal(E.tidyNumberText(9.9), '9.9', 'a stored number has no typed zeros to keep');
  assert.equal(E.toggleSign('9.90'), '−9.90');
  assert.equal(E.toggleSign('−2.50'), '2.50');
  assert.equal(E.parseNumber(E.tidyNumberText('0.50')), 0.5, 'the number itself never changes');
});

test('a paper that arrives with a later task (dt-3): the validator', () => {
  const lv = clone(demo);
  const items = lv.tasks.find(t => t.type === 'items');
  const later = lv.tasks[lv.tasks.length - 1];
  const doc = { id: 'late-1', type: 'letter', style: 'memo', title: 'Later paper · memo', body: ['Arrives later.'], arrives: later.id };
  lv.documents.push(doc);
  let r = L.validateLevel(lv, { fixture: true });
  assert.match(r.errors.join('\n'), /must list it in its docs/);
  later.docs = (later.docs || []).concat('late-1');
  r = L.validateLevel(lv, { fixture: true });
  assert.ok(!r.errors.some(e => /late-1/.test(e)), r.errors.join('\n'));
  items.docs = (items.docs || []).concat('late-1');
  r = L.validateLevel(lv, { fixture: true });
  assert.match(r.errors.join('\n'), /but the earlier task t1 shows it/);
  doc.arrives = 'nope';
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /arrives must name a task/);
});

test('number boxes: a unit word typed after the figure, whole-number boxes and text that is no figure (sa-6)', () => {
  // "5 April" typed into a box whose unit is "April" is read as 5; nothing that parsed before reads differently
  assert.equal(E.stripUnit('5 April', 'April'), '5');
  assert.equal(E.stripUnit('5 april.', 'April'), '5');
  assert.equal(E.stripUnit('12 pcs', 'pcs'), '12');
  assert.equal(E.stripUnit('1,25,000', 'April'), '1,25,000');
  assert.equal(E.stripUnit('abc April', 'April'), 'abc April', 'only when what is left is a figure');
  assert.equal(E.stripUnit('2.5%', '%'), '2.5%', 'a sign unit is left to parseNumber');
  assert.equal(E.stripUnit('5 April', undefined), '5 April');
  const day = { id: 'cleared', kind: 'number', unit: 'April', integer: true };
  const amt = { id: 'amt', kind: 'number', prefix: '₹' };
  // "5 April" before the unit comes off, "5/4" and "05.04" in a whole-number box are filled but no answer: flagged,
  // and the item is not checked
  ['5 April', '5/4', '5th', '05.04'].forEach(v => {
    assert.equal(E.fieldAnswered(day, v), false, v);
    assert.equal(E.numberInvalid(day, v), true, v);
  });
  assert.equal(E.fieldAnswered(day, '5'), true);
  assert.equal(E.numberInvalid(day, '5'), false);
  assert.equal(E.numberInvalid(day, ''), false, 'an empty box is open, not flagged');
  assert.equal(E.numberInvalid(day, undefined), false);
  // without integer, decimals stay an answer (every existing level)
  assert.equal(E.fieldAnswered(amt, '18,974.40'), true);
  assert.equal(E.numberInvalid(amt, 'twelve'), true);
  const task = { id: 't1', type: 'items', fields: [{ id: 'v', kind: 'choice', gate: true, options: [{ id: 'ok' }, { id: 'x' }] }, Object.assign({ showIf: { v: 'ok' } }, day)],
    items: [{ id: 'i1', answer: { v: 'ok', cleared: 5 }, note: 'n' }] };
  assert.equal(E.itemAnswered(task, task.items[0], { v: 'ok', cleared: '05.04' }), false);
  assert.equal(E.itemAnswered(task, task.items[0], { v: 'ok', cleared: E.stripUnit('5 April', 'April') }), true);
  assert.equal(E.scoreItem(task, task.items[0], { v: 'ok', cleared: E.stripUnit('5 April', 'April') }).correct, true);
});

test('number boxes: what typed text reads as on leaving the box, ordinals in whole-number boxes (sa-6 round 2)', () => {
  const day = { id: 'cleared', kind: 'number', unit: 'April', integer: true };
  const count = { id: 'n', kind: 'number', integer: true };
  const amt = { id: 'amt', kind: 'number', prefix: '₹' };
  const pcs = { id: 'q', kind: 'number', unit: 'pcs' };
  // the unit word, as before
  assert.equal(E.readTyped(day, '5 April'), '5');
  assert.equal(E.readTyped(pcs, '12 pcs'), '12');
  // an ordinal ending in a whole-number box, with or without the unit
  ['8th', '8th April', '8 th', '8th.', '8TH april', '1st', '2nd', '23rd'].forEach(v => {
    const r = E.readTyped(day, v);
    assert.ok(E.parseNumber(r) !== null && E.fieldAnswered(day, r), v + ' → ' + r);
  });
  assert.equal(E.readTyped(day, '8th April'), '8');
  assert.equal(E.readTyped(count, '12th'), '12');
  // anything else is left exactly as typed (and stays flagged)
  ['8th of April', '5/4', '8th March 2027', 'th', '05.04'].forEach(v => assert.equal(E.readTyped(day, v), v, v));
  assert.equal(E.numberInvalid(day, E.readTyped(day, '8th of April')), true);
  // a box that is not whole-number keeps its old reading: "8th" is still flagged there
  assert.equal(E.readTyped(amt, '8th'), '8th');
  assert.equal(E.readTyped(pcs, '8th pcs'), '8th pcs');
  // nothing that parsed before reads differently
  ['1,25,000', '−2.5', '(2.5)', '₹ 1,23,456', '7'].forEach(v => {
    assert.equal(E.readTyped(amt, v), v, v);
    assert.equal(E.readTyped(day, v), v, v);
  });
  assert.equal(E.readTyped(null, '8th'), '8th');
  assert.equal(E.readTyped(day, undefined), undefined);
});

test('ba-1 round 1: noFollowIf: a figure that only repeats the client’s own working earns no method mark', () => {
  // the client's working sits in column k; the student reworks it in column you
  const fc = (answer, follow, extra) => Object.assign({ input: true, answer, tolerance: 0.05, follow }, extra || {});
  const task = { id: 't', type: 'worksheet', columns: [{ key: 'line' }, { key: 'k' }, { key: 'you' }], rows: [
    { id: 'a', cells: { line: 'Debts that count', k: 264, you: { input: true, answer: 218, tolerance: 0.05 } } },
    { id: 'b', cells: { line: 'Stock part', k: 145.8, you: { input: true, answer: 118.5, tolerance: 0.05 } } },
    { id: 'c', cells: { line: 'Debts after margin', k: 158.4, you: fc(130.8, '{a.you} × 0.6', { noFollowIf: 'k' }) } },
    { id: 'd', cells: { line: 'Drawing power', k: 304.2, you: fc(249.3, '{b.you} + {c.you}', { noFollowIf: 'k' }) } },
    { id: 'e', cells: { line: 'Excess', k: 'Nil', you: fc(43.3, '292.6 − {d.you}', { noFollowIf: 'k' }) } },
  ] };
  const lv = { id: 'f', tasks: [task] };
  const sc = a => E.scoreTask(task, a, lv);
  // the key: nothing follows, all right
  let r = sc({ 'a.you': '218', 'b.you': '118.5', 'c.you': '130.8', 'd.you': '249.3', 'e.you': '43.3' });
  assert.deepEqual([r.earned, r.right, r.followed], [5, 5, 0]);
  // the client's working copied box by box: no method marks, and its total carried on to a negative excess earns none
  r = sc({ 'a.you': '264', 'b.you': '145.8', 'c.you': '158.4', 'd.you': '304.2', 'e.you': '−11.6' });
  assert.deepEqual([r.earned, r.followed], [0, 0], 'copying the client is not following your figures');
  // one honest slip (old debts counted): the figure equal to the client's own on its row earns nothing; the total it
  // feeds, worked with the student's own right stock part, still follows, and so does the excess after it
  r = sc({ 'a.you': '264', 'b.you': '118.5', 'c.you': '158.4', 'd.you': '276.9', 'e.you': '15.7' });
  assert.deepEqual(r.follows, { 'd.you': true, 'e.you': true });
  assert.deepEqual([r.earned, r.right], [3, 1]);
  // without noFollowIf the same copy follows (the field is opt-in; nothing that scored before scores differently)
  const plain = JSON.parse(JSON.stringify(task));
  plain.rows.forEach(row => { if (row.cells.you.noFollowIf) delete row.cells.you.noFollowIf; });
  r = E.scoreTask(plain, { 'a.you': '264', 'b.you': '145.8', 'c.you': '158.4', 'd.you': '304.2', 'e.you': '−11.6' }, { id: 'f', tasks: [plain] });
  assert.deepEqual(r.follows, { 'c.you': true, 'd.you': true, 'e.you': true });
  // the validator: noFollowIf names a column of its task and sits on a follow cell
  const bad = clone(demo), wt = bad.tasks.find(t => t.type === 'worksheet');
  wt.rows[0].cells.var.follow = '{r1.counted} − 2400';
  wt.rows[0].cells.var.noFollowIf = wt.columns[1].key;
  assert.ok(!L.validateLevel(bad, { fixture: true }).errors.some(x => /noFollowIf/.test(x)), 'a column of the task passes');
  wt.rows[0].cells.var.noFollowIf = 'zz';
  wt.rows[0].cells.pct.noFollowIf = wt.columns[1].key;
  delete wt.rows[0].cells.pct.follow;
  const errs = L.validateLevel(bad, { fixture: true }).errors.join('\n');
  assert.match(errs, /cell r1\.var noFollowIf names zz, which is not a column of t2/);
  assert.match(errs, /cell r1\.pct noFollowIf needs a follow working/);
});

test('cell weight: a worksheet figure the level turns on can cost a star (acc-1); right / of stay cell counts', () => {
  const task = { id: 't', type: 'worksheet', columns: [{ key: 'l', label: 'Line' }, { key: 'v', label: 'Amount', format: 'inr' }], rows: [
    { id: 'a', cells: { l: 'Short-term', v: { input: true, answer: 30, weight: 3 } } },
    { id: 'b', cells: { l: 'Long-term', v: { input: true, answer: 70, follow: '100 − {a.v}' } } },
    { id: 'c', cells: { l: 'Total', v: { input: true, answer: 130, follow: '{a.v} + 100' } } }] };
  assert.equal(E.cellWeight(task.rows[0].cells.v), 3);
  assert.equal(E.cellWeight(task.rows[1].cells.v), 1, 'default 1');
  assert.equal(E.cellWeight({ weight: 0 }), 1, 'a broken weight counts 1');
  let r = E.scoreTask(task, { 'a.v': '30', 'b.v': '70', 'c.v': '130' });
  assert.deepEqual([r.earned, r.max, r.right, r.of], [5, 5, 3, 3]); assert.ok(r.correct);
  // the weighted figure missed, the two that follow it worked from the student's own figure: 2 of 5, "0 of 3 right"
  r = E.scoreTask(task, { 'a.v': '0', 'b.v': '100', 'c.v': '100' });
  assert.deepEqual([r.earned, r.max, r.right, r.of, r.followed], [2, 5, 0, 3, 2]);
  // passNeeds reads the weighted share
  const lv = { id: 'w', tasks: [task], passNeeds: [{ task: 't', min: 0.6 }] };
  assert.deepEqual(E.passNeedsShort(lv, E.scoreLevel(lv, { t: { 'a.v': '0', 'b.v': '100', 'c.v': '100' } })).map(p => p.task), ['t']);
  // a sheet without weights scores as before (every shipped level until acc-1)
  const plain = clone(task); delete plain.rows[0].cells.v.weight;
  r = E.scoreTask(plain, { 'a.v': '0', 'b.v': '100', 'c.v': '100' });
  assert.deepEqual([r.earned, r.max], [2, 3]);
  // the validator: a cell's weight must be a positive number
  const bad = clone(demo), wt = bad.tasks.find(t => t.type === 'worksheet');
  wt.rows[0].cells.var.weight = -2;
  assert.match(L.validateLevel(bad, { fixture: true }).errors.join('\n'), /cell r1\.var weight must be a positive number/);
});

test('con-1 round 1: a cell count’s withRight (a copied total names nothing) and maxAbs (a rupee figure in a ₹ lakh box)', () => {
  const task = { id: 't', type: 'worksheet', columns: [{ key: 'l', label: 'Line' }, { key: 'v', label: '₹ lakh', format: 'amount' }], rows: [
    { id: 'p0', cells: { l: 'Profit, last year', v: 300 } },
    { id: 'a', cells: { l: 'Volume', v: { input: true, answer: 50, tolerance: 0.01 } } },
    { id: 'b', cells: { l: 'Price', v: { input: true, answer: -150, tolerance: 0.01 } } },
    { id: 'c', cells: { l: 'Change', v: { input: true, answer: -100, tolerance: 0.01, follow: '{a.v} + {b.v}' } } },
    { id: 'p1', cells: { l: 'Profit, this year', v: 200 } }] };
  const lv = { id: 'w', tasks: [task], earned: { clause: 'built a bridge[[ and traced a {fall} fall]]', counts: {
    fall: { kind: 'cell', task: 't', row: 'c', col: 'v', abs: true, scale: 100000, format: 'crore1', withRight: ['a.v', 'b.v'] },
    bare: { kind: 'cell', task: 't', row: 'c', col: 'v' } } } };
  let c = E.computeCounts(lv, { t: { 'a.v': '50', 'b.v': '-150', 'c.v': '-100' } });
  assert.deepEqual([c.fall, c.bare], [10000000, -100], 'all right: the figure');
  c = E.computeCounts(lv, { t: { 'a.v': '50', 'b.v': '150', 'c.v': '-100' } });
  assert.deepEqual([c.fall, c.bare], [null, -100], 'the total copied from the rows, one listed cell wrong: no fall; a count without withRight is unchanged');
  assert.equal(E.renderClause(lv, c), 'built a bridge');
  c = E.computeCounts(lv, { t: { 'a.v': '50', 'b.v': '150', 'c.v': '200' } });
  assert.equal(c.fall, null, 'a total that only follows the student’s own wrong figure is no right figure either');
  // maxAbs: a figure bigger than the task's (or the cell's) maxAbs is no answer: not done, flagged, never followed
  const mt = clone(task); mt.maxAbs = 10000;
  const cells = E.inputCells(mt);
  assert.deepEqual(cells.map(x => x.max), [10000, 10000, 10000]);
  assert.equal(E.cellFigure(cells[0], '5,00,00,000'), null);
  assert.equal(E.cellFigure(cells[0], '−9,999.99'), -9999.99);
  assert.equal(E.cellFigure(E.inputCells(task)[0], '5,00,00,000'), 50000000, 'without maxAbs a big figure reads as before');
  assert.deepEqual(E.taskProgress({ tasks: [mt] }, mt, { 'a.v': '50,00,000', 'b.v': '-150', 'c.v': '' }), { done: 1, total: 3 });
  assert.deepEqual(E.taskProgress({ tasks: [task] }, task, { 'a.v': '50,00,000', 'b.v': '-150', 'c.v': '' }), { done: 2, total: 3 });
  assert.equal(E.numberInvalid({ kind: 'number', maxAbs: 10000 }, '57460000'), true, 'flagged under the box');
  assert.equal(E.numberInvalid({ kind: 'number', maxAbs: 10000 }, '-574.60'), false);
  assert.equal(E.numberInvalid({ kind: 'number' }, '57460000'), false, 'a box without maxAbs takes any figure, as before');
  let r = E.scoreTask(mt, { 'a.v': '5000000', 'b.v': '-150', 'c.v': '4999850' });
  assert.deepEqual([r.earned, r.followed], [1, 0], 'a total worked from a figure that can’t be read earns no method mark');
  r = E.scoreTask(task, { 'a.v': '5000000', 'b.v': '-150', 'c.v': '4999850' });
  assert.deepEqual([r.earned, r.followed], [2, 1], 'without maxAbs it follows as before');
  // the validator: withRight on a cell count lists input cells; maxAbs is positive and no key answer passes it
  const bad = clone(demo), wt = bad.tasks.find(t => t.type === 'worksheet');
  const wkey = E.inputCells(wt)[0];
  bad.earned.counts.cellx = { kind: 'cell', task: wt.id, row: wkey.row.id, col: wkey.col.key, withRight: ['nope.var'] };
  wt.maxAbs = 0.000001;
  const errs = L.validateLevel(bad, { fixture: true }).errors.join('\n');
  assert.match(errs, /withRight nope\.var is not an input cell of /);
  assert.match(errs, /answer is bigger than its maxAbs/);
  bad.earned.counts.cellx.withRight = 'r1.var'; wt.maxAbs = -1;
  const errs2 = L.validateLevel(bad, { fixture: true }).errors.join('\n');
  assert.match(errs2, /withRight on a cell count must list input cells as row\.col/);
  assert.match(errs2, /maxAbs must be a positive number/);
});
