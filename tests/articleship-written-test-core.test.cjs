/* Ported from the content build's Package C (written-test/tests/core.test.js): run with node --test from the repo root. */
/* Unit tests for js/written-test-core.js. Run: node --test tests/ (from written-test/) */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../articleship-program/written-test/js/written-test-core.js');

const FIX = path.join(__dirname, 'fixtures', 'written-test');
const load = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8'));
const ALL = load('fixture-all.json');
const SHORT = load('fixture-short.json');
const SPOKEN = load('fixture-spoken.json');
const q = (paper, n) => paper.questions[n - 1];

function memoryStore() {
  const data = {};
  return {
    data,
    load: (id) => (id in data ? JSON.parse(data[id]) : null),
    save: (id, st) => { data[id] = JSON.stringify(st); }
  };
}
function fakeClock(t = Date.UTC(2026, 9, 20, 4, 30)) {
  return { t, now() { return this.t; }, advance(ms) { this.t += ms; } };
}

// ---------------------------------------------------------------- text and numbers
test('typed answers are normalised as the brief says', () => {
  assert.equal(C.normText('  Criteria. '), 'criteria');
  assert.equal(C.normText('It’s  “done”'), C.normText("it's \"DONE\""));
  assert.equal(C.normText('end.'), 'end');
  assert.equal(C.normText('e.g.'), 'e.g');
  assert.deepEqual(C.dictationWords('Please send, the “signed” statement.'), ['please', 'send', 'the', 'signed', 'statement']);
});

test('numbers parse with ₹, commas, % and units; nonsense is null', () => {
  const cases = [['48,450', 48450], ['₹ 48,450', 48450], ['Rs. 4,000', 4000], ['20 %', 20], ['3/8', 0.375],
    ['-5', -5], ['−5', -5], ['12 km/h', 12], ['1.5 lakh', 1.5], ['.5', 0.5], [12, 12]];
  for (const [raw, want] of cases) assert.equal(C.parseNumber(raw), want, raw);
  for (const raw of ['abc', '4 5', '', null, '1/0', '12..5']) assert.equal(C.parseNumber(raw), null, String(raw));
});

test('Indian grouping, amounts, marking words and clocks', () => {
  assert.equal(C.formatIndian(125000), '1,25,000');
  assert.equal(C.formatIndian(12500000.5), '1,25,00,000.5');
  assert.equal(C.formatIndian(999), '999');
  assert.equal(C.formatIndian(-48450), '−48,450');
  assert.equal(C.formatAmount(48450, '₹'), '₹48,450');
  assert.equal(C.formatAmount(20, '%'), '20%');
  assert.equal(C.formatAmount(45, '₹ lakh'), '₹45 lakh');
  assert.equal(C.formatAmount(12, 'km/h'), '12 km/h');
  assert.deepEqual(C.describeMarking({ correct: 3, wrong: -2, blank: 0 }),
    { short: '+3 / −2 / 0', words: 'Right +3 · Wrong −2 · Blank 0', negative: true });
  assert.equal(C.describeMarking({ correct: 1, wrong: 0, blank: 0 }).negative, false);
  assert.equal(C.formatClock(20 * 60000), '20:00');
  assert.equal(C.formatClock(59001), '1:00');
  assert.equal(C.formatClock(90 * 60000 - 1000), '1:29:59');
  assert.equal(C.formatClock(-5), '0:00');
  assert.equal(C.formatDuration(17 * 60000 + 42000), '17 min 42 s');
});

test('number–unit pairs are kept together, with a space or U+00A0, and the text is unchanged', () => {
  const kept = (t) => C.keepTogether(t).filter((p) => p.keep).map((p) => p.text);
  for (const sp of [' ', ' ']) {
    const t = `Half in 2025–26 and half in 2026–27: ₹7.2${sp}lakh, 8${sp}m, 7${sp}:${sp}5, 5${sp}hours, 4${sp}pm, 31${sp}March`;
    assert.deepEqual(kept(t), ['2025–26', '2026–27', `7.2${sp}lakh`, `8${sp}m`, `7${sp}:${sp}5`, `5${sp}hours`, `4${sp}pm`, `31${sp}March`]);
    assert.equal(C.keepTogether(t).map((p) => p.text).join(''), t);
  }
  assert.deepEqual(kept('10–15 minutes at 48 km/h, 2 : 3 : 4'), ['10–15 minutes', '48 km/h', '2 : 3 : 4']);
  // an ordered pair stays whole (with either space, a decimal or a minus); a longer list may still wrap
  assert.deepEqual(kept('Totals: (4, 6), (6, 4); (7, 14, 28, 56)'), ['(4, 6)', '(6, 4)']);
  assert.deepEqual(kept('(5,\u00a06), (2.5, 3) and (\u22122, 7) but not (4,6)'), ['(5,\u00a06)', '(2.5, 3)', '(\u22122, 7)']);
  assert.deepEqual(kept('(6, 6) = 6 rolls'), ['(6, 6)', '= 6']);
  // not pairs: a bare number, a number inside a word, a unit that only starts a word
  assert.deepEqual(kept('₹1,20,000 in Q31 m, 8 members and 3 smaller ones'), []);
  assert.deepEqual(C.keepTogether(''), []);
  assert.deepEqual(C.keepTogether('No numbers here'), [{ text: 'No numbers here', keep: false }]);
});

// ---------------------------------------------------------------- marking every type
test('single: right, wrong, blank; unknown letters are blank', () => {
  assert.equal(C.markQuestion(q(ALL, 1), 'a'), 'right');
  assert.equal(C.markQuestion(q(ALL, 1), 'b'), 'wrong');
  assert.equal(C.markQuestion(q(ALL, 1), undefined), 'blank');
  assert.equal(C.markQuestion(q(ALL, 1), 'z'), 'blank');
});

test('numeric: tolerance, units and an unreadable entry', () => {
  const n = q(ALL, 8);
  assert.equal(C.markQuestion(n, '48,450'), 'right');
  assert.equal(C.markQuestion(n, '₹48450.00'), 'right');
  assert.equal(C.markQuestion(n, '48,000'), 'wrong');
  assert.equal(C.markQuestion(n, 'about 48k'), 'wrong');
  assert.equal(C.markQuestion(n, '  '), 'blank');
  const tol = { ...n, answer: { value: 0.3333, tolerance: 0.001, unit: '' } };
  assert.equal(C.markQuestion(tol, '1/3'), 'right');
  assert.equal(C.markQuestion(tol, '0.34'), 'wrong');
  assert.equal(C.markQuestion(q(ALL, 12), '20%'), 'right');
});

test('text: case, spaces, quotes and a final full stop do not matter', () => {
  const t = q(ALL, 4);
  for (const v of ['criteria', ' CRITERIA. ', 'Criteria']) assert.equal(C.markQuestion(t, v), 'right', v);
  assert.equal(C.markQuestion(t, 'criterions'), 'wrong');
  const multi = { ...t, answer: { accept: ['its', 'it’s'] } };
  assert.equal(C.markQuestion(multi, "it's"), 'right');
});

test('dictation: every word must match; the review shows the word-by-word difference', () => {
  const d = q(ALL, 5);
  assert.equal(C.markQuestion(d, 'please send the signed bank statement before the review meeting'), 'right');
  assert.equal(C.markQuestion(d, 'Please send the signed bank statement before review meeting.'), 'wrong');
  const diff = C.dictationDiff(d.answer.text, 'Please send a signed bank statement before review meeting today');
  assert.deepEqual(diff.filter((x) => x.op !== 'ok'), [
    { op: 'wrong', want: 'the', got: 'a' },
    { op: 'missing', want: 'the', got: null },
    { op: 'extra', want: null, got: 'today' }
  ]);
  assert.ok(C.dictationDiff('a b c', 'a b c').every((x) => x.op === 'ok'));
});

test('speak and write are self-checked and never scored', () => {
  assert.equal(C.markQuestion(q(ALL, 6), 'anything'), 'self');
  assert.equal(C.markQuestion(q(ALL, 7), 'my email'), 'self');
});

// ---------------------------------------------------------------- scoring
function answersFor(paper, rightN, wrongN) {
  const a = { answers: {}, flags: {}, revealed: {}, checks: {} };
  let r = 0;
  let w = 0;
  for (const x of paper.questions.filter(C.isScored)) {
    if (r < rightN) { a.answers[x.id] = right(x); r++; } else if (w < wrongN) { a.answers[x.id] = wrong(x); w++; }
  }
  return a;
}
function right(x) {
  if (x.type === 'single') return x.answer;
  if (x.type === 'numeric') return String(x.answer.value);
  if (x.type === 'text') return x.answer.accept[0];
  return x.answer.text;
}
function wrong(x) {
  if (x.type === 'single') return x.options.find((o) => o.id !== x.answer).id;
  return 'zzz';
}

test('every marking scheme, negative included', () => {
  const scored = ALL.questions.filter(C.isScored).length;
  assert.equal(scored, 15);
  const a = answersFor(ALL, 9, 4);                       // 9 right, 4 wrong, 2 blank
  for (const [m, want] of [[{ correct: 1, wrong: 0, blank: 0 }, 9], [{ correct: 3, wrong: -2, blank: 0 }, 19],
    [{ correct: 2, wrong: -1, blank: 0 }, 14], [{ correct: 1, wrong: -0.25, blank: 0 }, 8]]) {
    const r = C.scoreAttempt({ ...ALL, marking: m }, a);
    assert.equal(r.score, want, JSON.stringify(m));
    assert.equal(r.max, scored * m.correct);
    assert.deepEqual([r.right, r.wrong, r.blank, r.attempted, r.accuracy], [9, 4, 2, 13, 69]);
  }
  const allWrong = C.scoreAttempt(ALL, answersFor(ALL, 0, 15));
  assert.equal(allWrong.score, -30);                     // a negative paper can go below zero
  assert.equal(C.scoreAttempt(ALL, { answers: {} }).accuracy, null);
});

test('scores by section, and self-checked tasks counted apart', () => {
  const a = answersFor(ALL, 15, 0);
  a.answers[q(ALL, 7).id] = 'Dear Sir, …';
  const r = C.scoreAttempt(ALL, a);
  assert.deepEqual(r.sections.map((s) => [s.id, s.right, s.max, s.selfTotal, s.selfDone]), [
    ['english', 5, 15, 2, 1], ['numbers', 5, 15, 0, 0], ['reasoning', 3, 9, 0, 0], ['accounts', 2, 6, 0, 0]]);
  assert.equal(r.score, 45);
  assert.equal(r.selfTotal, 2);
  assert.equal(r.selfDone, 1);
});

// ---------------------------------------------------------------- the timer
test('the timer is wall-clock: it runs from Start and closes the paper at zero', () => {
  const clock = fakeClock();
  const store = memoryStore();
  const s = C.createSession({ paper: SHORT, store, clock });
  s.start();
  assert.equal(s.remaining(), 2 * 60000);
  s.answer(q(SHORT, 1).id, 'b');
  clock.advance(60000);
  assert.equal(s.remaining(), 60000);
  assert.equal(s.tick(), false);
  clock.advance(60000 + 3500);                             // the tick arrives late
  assert.equal(s.tick(), true);
  assert.equal(s.running(), false);
  const last = s.lastEntry();
  assert.equal(last.auto, true);
  assert.equal(last.usedMs, 2 * 60000);                    // closed at the deadline, not when the tick came
  assert.equal(last.score, 1);
  assert.equal(s.answer(q(SHORT, 2).id, 'c'), false);      // nothing changes after the paper is closed
});

test('answers are refused once time is up, even before the tick', () => {
  const clock = fakeClock();
  const s = C.createSession({ paper: SHORT, store: memoryStore(), clock });
  s.start();
  clock.advance(2 * 60000);
  assert.equal(s.canEdit(q(SHORT, 1).id), false);
  assert.equal(s.answer(q(SHORT, 1).id, 'b'), false);
  assert.equal(s.flag(q(SHORT, 1).id), false);
});

test('a paper left open past its time is submitted when the page opens again', () => {
  const clock = fakeClock();
  const store = memoryStore();
  const s1 = C.createSession({ paper: SHORT, store, clock });
  s1.start();
  s1.answer(q(SHORT, 2).id, 'c');
  clock.advance(10 * 60000);                                // the tab was closed
  const s2 = C.createSession({ paper: SHORT, store, clock });
  assert.equal(s2.closedOnLoad, true);
  assert.equal(s2.running(), false);
  assert.equal(s2.lastEntry().usedMs, 2 * 60000);
  assert.equal(s2.lastEntry().auto, true);
  assert.equal(s2.result().right, 1);
});

test('untimed papers have no deadline; per-task timers lock a writing box', () => {
  const clock = fakeClock();
  const paper = { ...ALL, minutes: null };
  const s = C.createSession({ paper, store: memoryStore(), clock });
  s.start();
  assert.equal(s.remaining(), Infinity);
  const w = q(ALL, 7);
  assert.equal(s.taskRemaining(w), 300000);
  s.startTask(w.id);
  s.answer(w.id, 'Dear Rohan Sir');
  clock.advance(200000);
  assert.equal(s.taskRemaining(w), 100000);
  s.startTask(w.id);                                        // starting again does not reset it
  assert.equal(s.taskRemaining(w), 100000);
  clock.advance(100000);
  assert.equal(s.taskExpired(w), true);
  assert.equal(s.answer(w.id, 'more text'), false);
  assert.equal(s.attempt().answers[w.id], 'Dear Rohan Sir');
});

test('revealing the model locks a writing or speaking task; checks are kept', () => {
  const s = C.createSession({ paper: ALL, store: memoryStore(), clock: fakeClock() });
  s.start();
  const w = q(ALL, 7);
  s.answer(w.id, 'Dear Sir');
  s.reveal(w.id);
  assert.equal(s.answer(w.id, 'changed'), false);
  s.check(w.id, 2, true);
  assert.deepEqual(s.attempt().checks[w.id], [false, false, true, false, false]);
  const sp = q(ALL, 6);
  assert.equal(C.hasResponse(sp, undefined, s.attempt()), false);
  s.reveal(sp.id);
  assert.equal(C.hasResponse(sp, undefined, s.attempt()), true);
});

test('a paper timed task by task has no clock but a guide time', () => {
  assert.equal(C.isTimed(SPOKEN), false);
  assert.equal(C.guideMinutes(SPOKEN), 6);
  assert.equal(C.manifestEntry(SPOKEN, 'x').minutes, null);
  assert.equal(C.manifestEntry(SPOKEN, 'x').guide_minutes, 6);
  const s = C.createSession({ paper: SPOKEN, store: memoryStore(), clock: fakeClock() });
  s.start();
  assert.equal(s.attempt().deadline, null);
  assert.equal(s.tick(), false);
});

test('read first, then write: the box is shut while you read and when time is up', () => {
  const clock = fakeClock();
  const s = C.createSession({ paper: SPOKEN, store: memoryStore(), clock });
  s.start();
  const w = q(SPOKEN, 6);
  assert.equal(s.taskPhase(w), 'ready');
  assert.equal(s.taskRemaining(w), 30000);
  assert.equal(s.answer(w.id, 'early'), false);                 // nothing before Start
  s.startTask(w.id);
  assert.equal(s.taskPhase(w), 'prep');
  assert.equal(s.answer(w.id, 'while reading'), false);         // nothing while the passage shows
  clock.advance(30000);
  assert.equal(s.taskPhase(w), 'main');
  assert.equal(s.taskRemaining(w), 90000);
  assert.equal(s.answer(w.id, 'On Tuesday Kabir found'), true);
  clock.advance(90000);
  assert.equal(s.taskPhase(w), 'done');
  assert.equal(s.answer(w.id, 'more'), false);
  assert.equal(s.attempt().answers[w.id], 'On Tuesday Kabir found');
  const sp = q(SPOKEN, 4);                                        // plan, then speak
  s.startTask(sp.id);
  assert.deepEqual([s.taskPhase(sp), s.taskRemaining(sp)], ['prep', 10000]);
  clock.advance(10000);
  assert.deepEqual([s.taskPhase(sp), s.taskRemaining(sp)], ['main', 60000]);
});

test('a timed dictation starts at the first play and locks when its time is up', () => {
  const clock = fakeClock();
  const s = C.createSession({ paper: SPOKEN, store: memoryStore(), clock });
  s.start();
  const d = q(SPOKEN, 5);
  assert.equal(s.taskPhase(d), 'ready');
  assert.equal(s.answer(d.id, 'The client'), true);              // typing before playing is allowed
  s.notePlay(d.id);
  assert.equal(s.taskPhase(d), 'main');
  clock.advance(20000);
  s.notePlay(d.id);                                              // the second play does not restart it
  assert.equal(s.taskRemaining(d), 5000);
  clock.advance(5000);
  assert.equal(s.answer(d.id, 'The client has asked'), false);
  s.submit();
  assert.equal(s.result().max, 1);
  assert.equal(s.result().selfTotal, 5);
});

test('a dictation plays at most twice', () => {
  const s = C.createSession({ paper: ALL, store: memoryStore(), clock: fakeClock() });
  s.start();
  const d = q(ALL, 5).id;
  assert.equal(s.playsLeft(d), 2);
  assert.equal(s.notePlay(d), true);
  assert.equal(s.notePlay(d), true);
  assert.equal(s.notePlay(d), false);
  assert.equal(s.playsLeft(d), 0);
});

// ---------------------------------------------------------------- saving and resuming
test('resume after reload: answers, flags, position and the timer come back', () => {
  const clock = fakeClock();
  const store = memoryStore();
  const s1 = C.createSession({ paper: ALL, store, clock });
  s1.start();
  s1.answer(q(ALL, 1).id, 'b');
  s1.answer(q(ALL, 8).id, '48,450');
  s1.flag(q(ALL, 8).id);
  s1.go(8);
  s1.answer(q(ALL, 1).id, 'a');                              // a changed answer
  clock.advance(5 * 60000);
  const s2 = C.createSession({ paper: ALL, store, clock });  // the reload
  assert.equal(s2.running(), true);
  assert.equal(s2.index(), 8);
  assert.equal(s2.attempt().answers[q(ALL, 1).id], 'a');
  assert.equal(s2.attempt().flags[q(ALL, 8).id], true);
  assert.equal(s2.remaining(), 10 * 60000);
  assert.deepEqual(s2.counts(), { answered: 2, flagged: 1, blank: 15, total: 17 });
  s2.clear(q(ALL, 1).id);
  assert.equal(s2.counts().answered, 1);
});

test('history keeps every attempt; best and last are reported', () => {
  const clock = fakeClock();
  const store = memoryStore();
  const s = C.createSession({ paper: SHORT, store, clock });
  const sit = (answers) => {
    s.start();
    for (const [n, v] of answers) s.answer(q(SHORT, n).id, v);
    clock.advance(30000);
    s.submit();
    clock.advance(1000);
  };
  sit([[1, 'b'], [2, 'a']]);          // 1
  sit([[1, 'b'], [2, 'c'], [3, 'd']]); // 3
  sit([[1, 'a']]);                     // 0
  assert.equal(s.state().history.length, 3);
  assert.equal(s.best().score, 3);
  assert.equal(s.lastEntry().score, 0);
  assert.equal(s.state().last.answers[q(SHORT, 1).id], 'a');
  const sum = C.summary(store.data['fixture-short']);
  assert.equal(sum.best.score, 3);
  assert.equal(sum.last.score, 0);
  assert.equal(sum.attempts, 3);
  assert.equal(sum.running, null);
});

test('best survives when old history is trimmed', () => {
  const clock = fakeClock();
  const store = memoryStore();
  const s = C.createSession({ paper: SHORT, store, clock });
  s.start();
  for (let n = 1; n <= 3; n++) s.answer(q(SHORT, n).id, q(SHORT, n).answer);
  s.submit();
  for (let i = 0; i < 40; i++) { clock.advance(1000); s.start(); s.submit(); }
  assert.equal(s.state().history.length, 30);
  assert.equal(s.best().score, 3);
  const again = C.createSession({ paper: SHORT, store, clock });
  assert.equal(again.best().score, 3);
});

// ---------------------------------------------------------------- migration
test('state migration: corrupt, partial and older shapes are repaired', () => {
  assert.deepEqual(C.migrate('{not json', SHORT), C.emptyState('fixture-short'));
  assert.deepEqual(C.migrate(null, SHORT), C.emptyState('fixture-short'));
  assert.deepEqual(C.migrate([1, 2], SHORT), C.emptyState('fixture-short'));
  const t0 = Date.UTC(2026, 9, 20);
  const old = {                                     // flags as a list, a number stored as a number, no deadline,
    paperId: 'fixture-short',                       // an answer to a question the paper no longer has
    current: { startedAt: t0, answers: { 'fixture-short-q01': 'b', 'fixture-short-q09': 'a', 'fixture-short-q02': 80 },
      flags: ['fixture-short-q02', 'gone'], pos: 7 },
    history: [{ score: 2, max: 3, submittedAt: t0 - 5000 }, { score: 'x' }]
  };
  const m = C.migrate(old, SHORT);
  assert.equal(m.v, C.STATE_VERSION);
  assert.deepEqual(m.current.answers, { 'fixture-short-q01': 'b', 'fixture-short-q02': '80' });
  assert.deepEqual(m.current.flags, { 'fixture-short-q02': true });
  assert.equal(m.current.deadline, t0 + 2 * 60000);
  assert.equal(m.current.pos, 2);
  assert.equal(m.history.length, 1);
  assert.equal(m.best.score, 2);
  assert.deepEqual(m.history[0].sections, []);
});

test('state migration: another paper’s state starts fresh; a newer version is never overwritten', () => {
  assert.equal(C.migrate({ v: 1, paperId: 'fixture-all', history: [] }, SHORT).paperId, 'fixture-short');
  const future = { v: 99, paperId: 'fixture-short', somethingNew: true };
  const store = memoryStore();
  store.save('fixture-short', future);
  const before = store.data['fixture-short'];
  const s = C.createSession({ paper: SHORT, store, clock: fakeClock() });
  assert.equal(s.readOnly(), true);
  assert.equal(s.start(), false);
  assert.equal(store.data['fixture-short'], before);
});

// ---------------------------------------------------------------- views
test('navigator, section progress and the submit counts', () => {
  const s = C.createSession({ paper: ALL, store: memoryStore(), clock: fakeClock() });
  s.start();
  s.answer(q(ALL, 2).id, 'c');
  s.flag(q(ALL, 3).id);
  s.go(2);
  const nav = s.navigator();
  assert.equal(nav.length, 17);
  assert.deepEqual([nav[1].answered, nav[2].flagged, nav[2].current, nav[0].answered], [true, true, true, false]);
  assert.deepEqual(s.sections().map((x) => [x.id, x.answered, x.count, x.first]),
    [['english', 1, 7, 0], ['numbers', 0, 5, 7], ['reasoning', 0, 3, 12], ['accounts', 0, 2, 15]]);
  assert.deepEqual(s.counts(), { answered: 1, flagged: 1, blank: 16, total: 17 });
});

test('review: every answer with its reason, filterable by wrong, blank and flagged', () => {
  const clock = fakeClock();
  const s = C.createSession({ paper: ALL, store: memoryStore(), clock });
  s.start();
  s.answer(q(ALL, 1).id, 'a');       // right
  s.answer(q(ALL, 2).id, 'a');       // wrong
  s.flag(q(ALL, 2).id);
  s.answer(q(ALL, 5).id, 'Please send the bank statement before the review meeting');  // wrong dictation
  s.answer(q(ALL, 8).id, '48,000');  // wrong numeric
  s.flag(q(ALL, 9).id);              // flagged and blank
  s.submit();
  const all = s.review('all');
  assert.equal(all.items.length, 17);
  assert.deepEqual(all.counts, { all: 17, wrong: 3, blank: 13, flagged: 2 });   // 4 answered; speak and write untouched
  assert.deepEqual(s.review('wrong').items.map((x) => x.n), [2, 5, 8]);
  assert.deepEqual(s.review('flagged').items.map((x) => x.n), [2, 9]);
  assert.equal(s.review('blank').items.length, 13);
  const it2 = all.items[1];
  assert.deepEqual([it2.yours.letter, it2.key.letter, it2.status], ['A', 'C', 'wrong']);
  assert.ok(it2.q.reason);
  assert.equal(all.items[7].key.text, '₹48,450');
  assert.ok(all.items[4].diff.some((d) => d.op === 'missing' && d.want === 'signed'));
  assert.deepEqual(all.items[6].key.checklist, q(ALL, 7).answer.checklist);
  assert.equal(s.review('nonsense').filter, 'all');
});

test('retake: a new attempt starts clean while history keeps the old one', () => {
  const clock = fakeClock();
  const s = C.createSession({ paper: SHORT, store: memoryStore(), clock });
  s.start();
  s.answer(q(SHORT, 1).id, 'b');
  s.submit();
  clock.advance(5000);
  assert.equal(s.start(), true);
  assert.deepEqual(s.attempt().answers, {});
  assert.equal(s.remaining(), 120000);
  assert.equal(s.state().last.answers[q(SHORT, 1).id], 'b');   // last result still reviewable meanwhile
  assert.equal(s.start(), false);                               // a running paper is resumed, not restarted
});

// ---------------------------------------------------------------- papers
test('the fixtures validate; planted problems do not', () => {
  assert.deepEqual(C.validatePaper(ALL), []);
  assert.deepEqual(C.validatePaper(SHORT), []);
  const bad = JSON.parse(JSON.stringify(ALL));
  bad.questions[0].answer = 'e';
  bad.questions[3].answer = {};
  bad.questions[1].stimulus = 'nope';
  bad.questions[4].say = '';
  bad.stimuli[2].chart.series[0].values.pop();
  bad.questions[9].n = 99;
  const errs = C.validatePaper(bad).join(' | ');
  for (const needle of ['answer is not an option', 'text answer needs accept', 'stimulus nope does not exist',
    'dictation needs say', 'needs one number per category', 'n must be 10']) assert.ok(errs.includes(needle), needle);
});

test('manifest entries carry what the home screen shows', () => {
  const m = C.manifestEntry(ALL, 'r1');
  assert.deepEqual(m, {
    id: 'fixture-all', title: ALL.title, kind: 'screening', order: 90, questions: 17, scored: 15, minutes: 15,
    guide_minutes: 15, marking: ALL.marking, rev: 'r1',
    sections: [{ id: 'english', title: 'English', questions: 7, budget_minutes: 5 },
      { id: 'numbers', title: 'Numbers', questions: 5, budget_minutes: 5 },
      { id: 'reasoning', title: 'Reasoning', questions: 3, budget_minutes: 3 },
      { id: 'accounts', title: 'Accounts, audit and tax', questions: 2, budget_minutes: 2 }]
  });
  assert.match(C.paperRev(ALL), /^[0-9a-f]{8}$/);
  assert.notEqual(C.paperRev(ALL), C.paperRev(SHORT));
});

test('every published paper validates and matches the manifest', () => {
  const dir = path.join(__dirname, '..', 'articleship-program', 'written-test', 'papers');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  assert.ok(Array.isArray(manifest.papers));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'index.json').sort();
  assert.deepEqual(files, manifest.papers.map((p) => p.id + '.json').sort());
  for (const entry of manifest.papers) {
    const paper = JSON.parse(fs.readFileSync(path.join(dir, entry.id + '.json'), 'utf8'));
    assert.deepEqual(C.validatePaper(paper), [], entry.id);
    const want = C.manifestEntry(paper, entry.rev);
    assert.deepEqual(entry, want, entry.id);
    assert.ok(!/fixture/.test(entry.id), 'fixtures never ship');
  }
});
