'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const L = require('./articleship-work-simulation-lib.cjs');
const E = require('../articleship-program/work-simulation/js/ws-engine.js');
const APP = path.join(__dirname, '..', 'articleship-program', 'work-simulation');
const DATA = path.join(APP, 'data');
const read = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const catalogue = read(path.join(DATA, 'catalogue.json'));
const world = read(path.join(DATA, 'world.json'));
const levelFiles = fs.existsSync(path.join(DATA, 'levels')) ? fs.readdirSync(path.join(DATA, 'levels')).filter(f => f.endsWith('.json')).sort() : [];

test('catalogue: 13 domains and all 27 levels in the SPEC order', () => {
  assert.deepEqual(L.validateCatalogue(catalogue), []);
});

test('world: people and GSTINs are valid', () => {
  assert.deepEqual(L.validateWorld(world), []);
});

test('every published level has its file', () => {
  catalogue.levels.filter(l => l.published).forEach(l => assert.ok(levelFiles.indexOf(l.id + '.json') >= 0, l.id + ' is published but data/levels/' + l.id + '.json is missing'));
});

levelFiles.forEach(f => {
  test('level ' + f + ' passes every content check', () => {
    const level = read(path.join(DATA, 'levels', f));
    assert.equal(level.id + '.json', f, 'file name matches id');
    const r = L.validateLevel(level, { catalogue, world, filesDir: path.join(APP, 'files') });
    assert.deepEqual(r.errors, []);
  });
});

test('the demo fixture passes every content check and is never in the catalogue', () => {
  const demo = read(path.join(__dirname, 'fixtures', 'demo-level.json'));
  const r = L.validateLevel(demo, { world, fixture: true });
  assert.deepEqual(r.errors, []);
  assert.ok(!catalogue.levels.find(l => l.id === demo.id));
  const types = new Set(demo.tasks.map(t => t.type));
  ['items', 'worksheet', 'choice', 'order', 'compose', 'hunt'].forEach(t => assert.ok(types.has(t), 'fixture has a ' + t + ' task'));
  const kinds = new Set(); demo.tasks.filter(t => t.type === 'items').forEach(t => t.fields.forEach(x => kinds.add(x.kind + (x.gate ? ':gate' : '') + (x.showIf ? ':showIf' : ''))));
  ['choice:gate', 'multi:showIf', 'number', 'text', 'choice'].forEach(k => assert.ok(kinds.has(k), 'fixture has field ' + k));
});

test('the validator catches broken content', () => {
  const demo = read(path.join(__dirname, 'fixtures', 'demo-level.json'));
  const bad = JSON.parse(JSON.stringify(demo));
  bad.documents[0].total += 100;                                    // invoice no longer adds up
  bad.documents[0].supplier.gstin = '27ABEFA2231K1ZA';              // wrong check character
  bad.tasks[0].items[0].note = 'This is a "straight" quote — and robust.';
  bad.tasks[0].items[1].answer.reasons = ['nonsense'];
  bad.tasks[4].answer = ['s1', 's1', 's2', 's3', 's4'];
  bad.tasks[2].answer.p99 = 'dup';
  bad.interview.pop();
  bad.earned.clause = 'audited the company and approved {bills} bills';
  bad.brief.from = 'nobody';
  bad.documents.find(d => d.id === 'stock-register').rows[0].cl = 9999;
  bad.documents.find(d => d.id === 'bank-stmt').rows[2].bal = 1;
  bad.tasks[1].prompt = Array(70).fill('word').join(' ');
  bad.wrapRetry.text = Array(51).fill('word').join(' ');            // consistency pass round 1 (I11): 51 words is an error
  bad.case.where = 'Client’s factory — accounts room';               // R36: the case file's Where row is checked too
  const e = L.validateLevel(bad, { fixture: true }).errors.join('\n');
  [/total .* ≠ taxable/, /check character should be/, /straight quote/, /em dash/, /banned word “robust”/, /unknown option nonsense/,
    /not a permutation/, /answer row p99/, /exactly 2 questions/, /trainee verb/, /person “nobody”/, /cl should be op \+ rec - iss/,
    /running bal should be/, /prompt over 60 words/, /wrapRetry\.text: over 50 words \(51\)/, /level\.case\.where: .*em dash/].forEach(re => assert.match(e, re));
  // a count spec's own "where" stays out of the text checks
  assert.ok(!/earned\.counts/.test(e));
  // consistency pass round 2 (P2-01): a choice question over 25 words with no `sample` warns; a sample over 12 words,
  // or one that is not text, is an error; (I2-08) a clause or fallback with < or > is an error
  const long = JSON.parse(JSON.stringify(demo));
  long.tasks[3].questions[0].text = Array(26).fill('word').join(' ') + '?';
  const lw = L.validateLevel(long, { fixture: true });
  assert.match(lw.warns.join('\n'), /question q1 is over 25 words \(26\) with no sample/);
  long.tasks[3].questions[0].sample = 'Which bill breaks the cut-off rule?';
  assert.ok(!/with no sample/.test(L.validateLevel(long, { fixture: true }).warns.join('\n')), 'a sample answers the warning');
  long.tasks[3].questions[0].sample = Array(13).fill('word').join(' ');
  assert.match(L.validateLevel(long, { fixture: true }).errors.join('\n'), /question q1 sample is over 12 words \(13\)/);
  long.tasks[3].questions[0].sample = 7;
  assert.match(L.validateLevel(long, { fixture: true }).errors.join('\n'), /question q1 sample must be text/);
  // (P2-01 part 4) and play.mjs fails, in model mode, a work sample that prints under zoom 0.70 (notes under 0.75)
  const playSrc = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.match(playSrc, /mode === 'model' && report\.sampleZoom && report\.sampleZoom < 0\.70\) report\.problems\.push/);
  assert.match(playSrc, /mode === 'model' && report\.sampleZoom && report\.sampleZoom < 0\.75\) report\.notes\.push/);
  const angle = JSON.parse(JSON.stringify(demo));
  angle.earned.fallback = 'checked bills where margins < 5%';
  angle.earned.clause = angle.earned.clause.replace(/ /, ' <b> ');
  const ae = L.validateLevel(angle, { fixture: true }).errors.join('\n');
  assert.match(ae, /fallback has < or >/); assert.match(ae, /clause with the key’s answers has < or >/);
  assert.deepEqual(L.textProblems('₹1,23,456 and 12,34,56,789 in 2026–27'), []);
  assert.ok(L.textProblems('₹123,456').length, 'western grouping caught');
  assert.ok(L.textProblems('in 2026-27').length, 'hyphenated year range caught');
  assert.ok(L.textProblems('see sa-1 and t2').length >= 2, 'internal ids caught');
  assert.equal(L.gstinCheckChar('27AAPFU0939F1Z'), 'V', 'the published sample GSTIN checks out');
});

test('a wrong GSTIN named in planted passes; a document number keeps its hyphenated year; invoice looks are known', () => {
  const demo = read(path.join(__dirname, 'fixtures', 'demo-level.json'));
  const bad = JSON.parse(JSON.stringify(demo));
  const inv = bad.documents.find(d => d.type === 'invoice');
  const real = inv.supplier.gstin, typo = real.slice(0, 9) + real.charAt(10) + real.charAt(9) + real.slice(11);
  assert.notEqual(typo, real);
  inv.supplier.gstin = typo;
  assert.match(L.validateLevel(bad, { fixture: true }).errors.join('\n'), /check character|invalid PAN|does not match/);
  inv.planted = ['GSTIN on the bill is ' + typo + ' (two digits swapped)'];
  const e = L.validateLevel(bad, { fixture: true }).errors.filter(x => x.indexOf(typo) >= 0);
  assert.deepEqual(e, [], 'a planted GSTIN is not reported');
  assert.deepEqual(L.textProblems('Invoice KS/2026-27/4418, PO TD/PO/2026-27/1126 and GRN-2027-04-0007'), []);
  assert.ok(L.textProblems('for 2026-27/ and in 2026-27').length, 'prose year range still caught');
  inv.style = 'book';
  assert.ok(!L.validateLevel(bad, { fixture: true }).errors.some(x => /invoice style/.test(x)));
  inv.style = 'fancy';
  assert.match(L.validateLevel(bad, { fixture: true }).errors.join('\n'), /unknown invoice style fancy/);
});

test('tool text: no banned words, exclamation marks, straight quotes in copy, or never-show phrases', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8');
  const visible = [];
  ui.replace(/'((?:[^'\\\n]|\\.)*)'/g, (m, s) => { if (/[A-Za-z]{3,} [A-Za-z]/.test(s) && !/[<>=]|\bclass\b|data-|aria-|function|var /.test(s)) visible.push(s); return m; });
  html.replace(/>([^<>]{3,})</g, (m, s) => { if (/[A-Za-z]/.test(s)) visible.push(s.trim()); return m; });
  const never = /coming soon|saved on this device|\bsaved\b|privacy|version|preview|disclaimer|stipend|salary|guarantee|congratulations|great job|well done|awesome|let’s|let's|!|—/i;
  visible.forEach(s => assert.ok(!never.test(s), 'tool text: “' + s + '”'));
  const copy = ui.slice(ui.indexOf('var COPY = {'), ui.indexOf('};', ui.indexOf('var COPY = {')));
  copy.replace(/'((?:[^'\\]|\\.)*)'/g, (m, s) => { L.textProblems(s).forEach(p => assert.fail('COPY “' + s + '”: ' + p)); return m; });
  const padam = /padam: '([^']*)'/.exec(copy)[1];
  assert.ok(padam.split(/\s+/).length <= 30, 'Padam’s line is 30 words at most');
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.match(html, /<meta name="viewport"/);
  assert.ok(!/(src|href)="(https?:)?\/\//.test(html), 'no external requests from index.html');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.ok(!/url\(["']?(https?:)?\/\//.test(css), 'no external requests from the stylesheet');
  ['nunito-400', 'nunito-600', 'nunito-800', 'caveat-700', 'kalam-400', 'kalam-700'].forEach(f => assert.ok(fs.existsSync(path.join(APP, 'fonts', f + '.woff2')), f));
  ['OFL-nunito.txt', 'OFL-caveat.txt', 'OFL-kalam.txt'].forEach(f => assert.ok(fs.existsSync(path.join(APP, 'fonts', f)), f));
  catalogue.domains.forEach(d => assert.ok(fs.existsSync(path.join(APP, 'img', 'doodles', d.icon + '.svg')), d.icon + '.svg is shipped'));
});

test('the validator: hand-in locks, the student’s own line in a template, withRight, and the one-click strategy', () => {
  const demo = read(path.join(__dirname, 'fixtures', 'demo-level.json'));
  const bad = JSON.parse(JSON.stringify(demo));
  bad.tasks[0].lockOnLeave = 'yes';
  const comp = bad.tasks.find(t => t.type === 'compose');
  comp.template = '{_free} ' + comp.template; delete comp.freeText;
  bad.earned.counts.found.withRight = 'nonsense';
  let e = L.validateLevel(bad, { fixture: true });
  const all = e.errors.join('\n');
  [/lockOnLeave must be true/, /uses \{_free\} but the task has no freeText/, /withRight nonsense/].forEach(re => assert.match(all, re));
  // with the lock gone, a later task that names a bill warns
  const open = JSON.parse(JSON.stringify(demo));
  delete open.tasks[0].lockOnLeave;
  assert.ok(L.validateLevel(open, { fixture: true }).warns.some(w => /names “Bill \d+” from t1/.test(w)));
  // a level whose bills are mostly Fine and weigh too much passes on “all Fine”: an error
  const heavy = JSON.parse(JSON.stringify(demo));
  heavy.tasks[0].items.forEach((it, i) => { if (i) { it.answer = { verdict: 'ok', year: it.answer.year }; it.note = 'Bill: fine.'; } });
  heavy.tasks[0].weight = 50;
  assert.match(L.validateLevel(heavy, { fixture: true }).errors.join('\n'), /commonest call on every item/);
});

test('the validator: round 3 rules (task weights, closing note, titles on the map, pick lists, handwritten PANs)', () => {
  const sa1 = read(path.join(DATA, 'levels', 'sa-1.json'));
  const ok = L.validateLevel(sa1, { catalogue, world });
  assert.deepEqual(ok.errors, []); assert.deepEqual(ok.warns, []);
  // the mail at weight 1 cannot cost a star: an error
  const light = JSON.parse(JSON.stringify(sa1)); delete light.tasks[1].weight;
  assert.match(L.validateLevel(light, { catalogue, world }).errors.join('\n'), /key with t2 entirely wrong still scores 9\d/);
  // a clean note that says "send the mail", shown over a wrong mail line (no wrapPartial to take its place): a warning
  const send = JSON.parse(JSON.stringify(sa1)); delete send.wrapPartial;
  send.wrap.text = 'Seven of the twenty had something wrong. Send the mail to Mahesh after lunch.';
  assert.ok(L.validateLevel(send, { catalogue, world }).warns.some(w => /wrap\.text: shows over a wrong line in t2/.test(w)));
  // a title after the hand-in that counts the finds, or names a bill: a warning
  const title = JSON.parse(JSON.stringify(sa1)); title.tasks[2].title = 'What the two cut-off bills do to March';
  assert.ok(L.validateLevel(title, { catalogue, world }).warns.some(w => /t3\) title: .*has a number/.test(w)));
  title.tasks[2].title = 'Fix Kharun Steels in March';
  assert.ok(L.validateLevel(title, { catalogue, world }).warns.some(w => /names “Kharun Steels”/.test(w)));
  // field weights and option needs are checked
  const fw = JSON.parse(JSON.stringify(sa1));
  fw.tasks[0].fields[2].weight = 0; fw.tasks[0].fields[2].options[0].needs = ['nothing'];
  const fe = L.validateLevel(fw, { catalogue, world }).errors.join('\n');
  assert.match(fe, /field reasons weight must be a positive number/); assert.match(fe, /needs “nothing”/);
  // a bill book that prints a PAN with I or O: an error
  const hw = JSON.parse(JSON.stringify(sa1));
  const bk = hw.documents.find(d => d.type === 'invoice' && d.style === 'book');
  bk.supplier.pan = 'ZIJPS6600I'; bk.supplier.gstin = '27ZIJPS6600I1ZB';
  assert.match(L.validateLevel(hw, { catalogue, world }).errors.join('\n'), /handwritten document prints .*I or O/);
  // the shotgun set ticks every option of every pick list on the key
  const sg = L.shotgun(sa1), ex = sa1.tasks[0].items.find(it => it.answer.verdict === 'exception');
  assert.equal(sg.t1[ex.id].reasons.length, sa1.tasks[0].fields.find(f => f.id === 'reasons').options.length);
});

test('world legibility: no PAN ends in I or O, and a party with a bill book has no I or O at all', () => {
  assert.match(L.validateWorld({ people: [], firm: { pan: 'VMJCP6724O' } }).join('\n'), /ends in I or O/);
  assert.match(L.validateWorld({ people: [], v: { gstin: '33VMJCP6724O1ZN' } }).join('\n'), /I or O as its PAN’s last letter/);
  assert.match(L.validateWorld({ people: [], v: { pan: 'UIJPS6600A', gstin: '27UIJPS6600A1Z' + L.gstinCheckChar('27UIJPS6600A1Z'), handPan: true } }).join('\n'), /writes its bills by hand/);
  // the internal world file (when the package is checked out whole) obeys both rules
  const full = path.join(__dirname, '..', '..', '_internal', 'world', 'world-full.json');
  if (fs.existsSync(full)) {
    const w = read(full);
    const problems = L.validateWorld(w).filter(m => /I or O|by hand/.test(m));
    assert.deepEqual(problems, []);
    const hand = (w.clientA.vendors || []).filter(v => v.handPan);
    assert.ok(hand.length >= 2, 'the bill-book vendors are marked');
  }
});

test('the validator: round 4 rules (a column of changes is signed; a two-reason key breaks count = tally)', () => {
  const sa1 = read(path.join(DATA, 'levels', 'sa-1.json'));
  // the cut-off sheet goes up and down: without signed, an increase reads like a balance on the work sample
  const uns = JSON.parse(JSON.stringify(sa1));
  uns.tasks.find(t => t.type === 'worksheet').columns.forEach(c => { delete c.signed; });
  const uw = L.validateLevel(uns, { catalogue, world }).warns.join('\n');
  assert.match(uw, /column pur has increases and decreases in its key: give it signed: true/);
  // a column whose key only goes one way cannot be told from a balance: the writer marks it (SPEC 7.2)
  assert.ok(!/column (stk|pbt) has increases and decreases/.test(uw), 'stock and profit only go up or stay in the key: no warning');
  const bad = JSON.parse(JSON.stringify(sa1)); bad.tasks.find(t => t.type === 'worksheet').columns[1].signed = 'yes';
  assert.match(L.validateLevel(bad, { catalogue, world }).errors.join('\n'), /column pur signed must be true or false/);
  // a key item with two reasons: withRight counts it once, the tally twice, so the brackets outnumber the count
  const two = JSON.parse(JSON.stringify(sa1));
  two.tasks[0].items.find(it => it.id === 'b7').answer.reasons = ['approval', 'price'];
  const tw = L.validateLevel(two, { catalogue, world }).warns.join('\n');
  assert.match(tw, /item b7 has 2 reasons in its key: the brackets will sum to more than the count/);
  const counts = E.computeCounts(two, L.keyAnswers(two));
  assert.equal(counts.found, 7);
  const inBrackets = String(counts.types).split(', ').reduce((s, x) => s + parseInt(x, 10), 0);
  assert.equal(inBrackets, 8, 'the reason the warning exists');
});

test('gst-1 round 1: a neutral gate is checked; notes and lines hold return names and slash bill numbers together', () => {
  const sa1 = read(path.join(DATA, 'levels', 'sa-1.json'));
  const neu = JSON.parse(JSON.stringify(sa1)); neu.tasks[0].fields.find(f => f.gate).neutral = 'yes';
  assert.match(L.validateLevel(neu, { catalogue, world }).errors.join('\n'), /neutral must be true or false/);
  const off = JSON.parse(JSON.stringify(sa1)); off.tasks[0].fields.find(f => !f.gate && f.kind !== 'text').neutral = true;
  assert.match(L.validateLevel(off, { catalogue, world }).errors.join('\n'), /neutral applies to the gate field only/);
  const ok = JSON.parse(JSON.stringify(sa1)); ok.tasks[0].fields.find(f => f.gate).neutral = true;
  assert.ok(!/neutral/.test(L.validateLevel(ok, { catalogue, world }).errors.join('\n')));
  // escText from the app itself (browser-only file): evaluated here with the documents' esc
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle('));
  const escText = new Function('esc', 'D', src + '; return escText;')(D.esc, D);
  const out = escText('Kolak missed KP/26-27/1187 in its GSTR-1 and added it through GSTR-1A; TD/ST/26-27/0068 to 0075; TDH/26-27/0612 matched to GSTR-2B, ₹25,200 IGST, bearing 6306-ZZ.');
  ['KP/26-27/1187', 'GSTR-1', 'GSTR-1A', 'TD/ST/26-27/0068', 'TDH/26-27/0612', 'GSTR-2B', '₹25,200', '6306-ZZ']
    .forEach(x => assert.ok(out.indexOf('<span class="nw">' + x + '</span>') >= 0, x + ' is held together'));
  const left = escText('a cut-off on 29-03-2027 under GRN-2027-04-0007 and 2026-27; Rs 5 lakh.');
  ['cut-off', '2026-27'].forEach(x => assert.ok(left.indexOf(x) >= 0 && left.indexOf('<span class="nw">' + x) < 0, x + ' is left alone'));
  // consistency pass round 1 (P05): a GRN number is held whole, as the papers hold it (ws-docs nwCodes)
  assert.ok(left.indexOf('<span class="nw">GRN-2027-04-0007</span>') >= 0, 'GRN-2027-04-0007 is held as the papers hold it');
  // acc-1 round 1 (designer S5): a whole date is held now, as ws-docs holds it in a paper ("Bills dated 06-04-" / "2027")
  assert.ok(left.indexOf('<span class="nw">29-03-2027</span>') >= 0, 'a date is held together');
  assert.ok(!/<script/.test(escText('<script>GSTR-1</script>')), 'still escaped');
  // dt-4 round 2: a held month and year take their day with them (plain or no-break space); a month and year alone stay
  // held as before. sa-1 round 6 (designer S2): a day and its month with no year are held too ("stores on 30" / "March"
  // in the review at 390 px), with a plain or no-break space; a word that only starts like a month is no month
  const dates = escText('to be paid on 20 October 2027, in the fund on 27 October 2026; Program | Oct 2026: by 15 March, received on 3\u00a0April, 1 to 8 April.');
  ['20 October 2027', '27 October 2026', 'Oct 2026', '15 March', '3\u00a0April', '8 April'].forEach(x => assert.ok(dates.indexOf('<span class="nw">' + x + '</span>') >= 0, x + ' is held together'));
  assert.ok(escText('2 Mayank, 10 Decimal, 5 Sept, 12 Marks').indexOf('<span') < 0, 'no month, no hold');
  // sa-1 round 6 (designer S1): a slash number that ends in its year is held as the papers hold it (whole up to 16
  // characters; a longer one keeps its final year whole, with a break chance at the slash before it)
  const ends = escText('Bill 10 (Palar, PSG/0938/26-27): your invoice RF/2291/26-27; ABCDEF/GHIJ/0938/2026-27');
  ['PSG/0938/26-27', 'RF/2291/26-27'].forEach(x => assert.ok(ends.indexOf('<span class="nw">' + x + '</span>') >= 0, x + ' is held together'));
  assert.ok(ends.indexOf('ABCDEF/GHIJ/0938/<wbr><span class="nw">2026-27</span>') >= 0, 'a long one breaks only at the slash before its year');
});

test('gst-1 round 1 (re-run): a field short is checked and the folded call uses the short labels; bordered tables pin their left rule', () => {
  const sa1 = read(path.join(DATA, 'levels', 'sa-1.json'));
  const bad = JSON.parse(JSON.stringify(sa1)); bad.tasks[0].fields.find(f => f.gate).short = ' ';
  assert.match(L.validateLevel(bad, { catalogue, world }).errors.join('\n'), /short must be a non-empty label/);
  const ok = JSON.parse(JSON.stringify(sa1)); ok.tasks[0].fields.find(f => f.gate).short = 'Call';
  assert.ok(!/short must be/.test(L.validateLevel(ok, { catalogue, world }).errors.join('\n')));
  // the folded call (gateSum, syncGateSum) shows the field's short and the option's short, falling back to the labels
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const sum = ui.slice(ui.indexOf('function gateSum('), ui.indexOf('function openGateChange('));
  assert.match(sum, /optLabel\(g, v, true\)/);
  assert.match(sum, /esc\(g\.short \|\| g\.label\)/);
  const sync = ui.slice(ui.indexOf('function syncGateSum('), ui.indexOf('function moreBelowBtn('));
  assert.match(sync, /optLabel\(g, ia\[g\.id\], true\)/);
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  ['dt-mini', 'dt-portal', 'dt-plain'].forEach(k => assert.ok(new RegExp('\\.' + k + ' \\.stick0::before \\{ background: #').test(css), k + ' pinned column paints its left rule'));
});

test('dt-1 round 1: a part code whose group starts with a digit holds in notes and model cells; a pack-group name is one flex item', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle('));
  const escText = new Function('esc', 'D', src + '; return escText;')(D.esc, D);
  const out = escText('8 · Bearings 6205-2RS: the 250 bearings (6205-2RS) short; seal 6306-ZZ and 6306-2Z.');
  ['6205-2RS', '6306-ZZ', '6306-2Z'].forEach(x => assert.ok(out.indexOf('<span class="nw">' + x + '</span>') >= 0, x + ' is held together'));
  const left = escText('the 2026-27 file, 2027-04 and GRN-2027-04-0007, a cut-off of 1142-60.');
  ['2026-27', '2027-04', '1142-60'].forEach(x => assert.ok(left.indexOf(x) >= 0 && left.indexOf('<span class="nw">' + x) < 0, x + ' is left alone'));
  assert.ok(left.indexOf('<span class="nw">GRN-2027-04-0007</span>') >= 0, 'GRN-2027-04-0007 is held as the papers hold it (P05)');
  // a model table's text cells go through escText (numbers through formatValue); a pack group's name sits in one span
  assert.match(ui, /typeof v === 'number' \? esc\(E\.formatValue\(v, c\.format\)\) : escText\(v \|\| ''\)/);
  assert.match(ui, /<summary><span class="pg-name">' \+ escTitle\(g\.label\) \+ '<\/span><span class="count">/);
});

test('val-1 round 1: notes and lines hold en-dash years, ranges and spans of time; a model grid table is checked', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle('));
  const escText = new Function('esc', 'D', src + '; return escText;')(D.esc, D);
  const out = escText('The range, ₹109–142 crore, across 12–14%, 2026–27 to 2030–31, 16–32 times; a 5-year DCF on a 3-year P&L, an 11-month licence.');
  // con-1 round 2: an amount holds its unit word too, so the range is held as "₹109–142 crore"
  ['₹109–142 crore', '12–14%', '2026–27', '2030–31', '16–32', '5-year', '3-year', '11-month']
    .forEach(x => assert.ok(out.indexOf('<span class="nw">' + x + '</span>') >= 0, x + ' is held together'));
  const left = escText('a cut-off on 29-03-2027, the 2026-27 file, 12% − 5%, a well-run plant.');
  ['cut-off', '2026-27', '12%', 'well-run'].forEach(x => assert.ok(left.indexOf(x) >= 0 && left.indexOf('<span class="nw">' + x) < 0, x + ' is left alone'));
  assert.ok(left.indexOf('<span class="nw">29-03-2027</span>') >= 0, 'a date is held (acc-1 round 1)');
  const lv = read(path.join(DATA, 'levels', 'sa-1.json'));
  const bad = JSON.parse(JSON.stringify(lv)); bad.model.blocks.push({ type: 'table', grid: 'yes', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x' }] });
  assert.match(L.validateLevel(bad, { catalogue, world }).errors.join('\n'), /grid must be true or false/);
  const good = JSON.parse(JSON.stringify(lv)); good.model.blocks.push({ type: 'table', grid: true, columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x' }] });
  assert.ok(!/grid must/.test(L.validateLevel(good, { catalogue, world }).errors.join('\n')));
  // a worksheet layout: "grid" needs two to four value columns, "table" exactly one
  const ws = JSON.parse(JSON.stringify(lv)); const wt = ws.tasks.find(t => t.type === 'worksheet');
  wt.layout = 'cards';
  assert.match(L.validateLevel(ws, { catalogue, world }).errors.join('\n'), /layout is "grid"/);
  wt.layout = 'grid';
  assert.ok(!/layout is/.test(L.validateLevel(ws, { catalogue, world }).errors.join('\n')));
  wt.layout = 'table';   // sa-1's cut-off sheet has three value columns: not a one-column table
  assert.match(L.validateLevel(ws, { catalogue, world }).errors.join('\n'), /layout is "grid"/);
  const v1 = read(path.join(DATA, 'levels', 'val-1.json'));
  assert.equal(v1.tasks.find(t => t.id === 't3').layout, 'table');
  assert.ok(!/layout is/.test(L.validateLevel(v1, { catalogue, world }).errors.join('\n')));
});

test('sa-2 round 1: the floor map, quiet picks, “test-counted”, and a choice task whose right option sits in one place', () => {
  const lv = read(path.join(DATA, 'levels', 'sa-2.json'));
  const ok = L.validateLevel(lv, { catalogue, world });
  assert.deepEqual(ok.errors, []); assert.deepEqual(ok.warns, []);
  assert.equal(lv.tasks[0].map, 'plan');
  assert.match(E.buildLine('X', 'Nov 2026', E.renderClause(lv, E.computeCounts(lv, L.keyAnswers(lv)))), /: Test-counted 12 /);
  const m = JSON.parse(JSON.stringify(lv)); m.tasks[0].map = 'shelf-a1';
  assert.match(L.validateLevel(m, { catalogue, world }).errors.join('\n'), /map must name a bins document that shows the whole plan/);
  const nb = JSON.parse(JSON.stringify(lv)); nb.tasks[0].items[0].bin = 'zz';
  assert.match(L.validateLevel(nb, { catalogue, world }).errors.join('\n'), /item a1 has no bin “zz” on the map plan/);
  const hint = JSON.parse(JSON.stringify(lv)); delete hint.tasks[0].map;
  assert.match(L.validateLevel(hint, { catalogue, world }).errors.join('\n'), /mapHint without a map/);
  const q = JSON.parse(JSON.stringify(lv)); q.tasks[0].fields.find(f => f.gate).options[0].quiet = true;
  assert.match(L.validateLevel(q, { catalogue, world }).errors.join('\n'), /quiet must be true or false, on a choice field that is not the gate/);
  const li = JSON.parse(JSON.stringify(lv)); li.documents.find(d => d.id === 'plan').bins[0].listed = 'yes';
  assert.match(L.validateLevel(li, { catalogue, world }).errors.join('\n'), /listed must be true or false/);
  // every right option first, and the longest: both warn
  const same = JSON.parse(JSON.stringify(lv));
  same.tasks[2].questions.forEach(qq => { qq.options.sort((x, y) => (y.correct ? 1 : 0) - (x.correct ? 1 : 0)); qq.options.find(o => o.correct).text += ' This option is now much the longest of the four.'; });
  const w = L.validateLevel(same, { catalogue, world }).warns.join('\n');
  assert.match(w, /the right option is option 1 in every question/);
  assert.match(w, /the right option is the longest in every question/);
  // the verb list keeps the hyphen
  assert.ok(L.TRAINEE_VERBS.indexOf('test-counted') >= 0);
  const verb = JSON.parse(JSON.stringify(lv)); verb.earned.clause = verb.earned.clause.replace(/^test-counted/, 'test-audited'); verb.earned.fallback = verb.earned.fallback.replace(/^test-counted/, 'test-audited');
  assert.match(L.validateLevel(verb, { catalogue, world }).errors.join('\n'), /not “test-audited”/);
});

test('val-1 round 1 (third run): every prose site holds en-dash years and ranges; the review texts hold ₹109–142 and 12–14%', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle('));
  const escText = new Function('esc', 'D', src + '; return escText;')(D.esc, D);
  const lv = read(path.join(DATA, 'levels', 'val-1.json'));
  const nw = x => '<span class="nw">' + x + '</span>';
  // what the review page and the case file print: the model intro, the clean note, the cover note's line, a row label
  const intro = escText(lv.model.intro), wrap = escText(lv.wrap.text);
  // (con-1 round 2: with its unit word, "₹109–142 crore")
  [nw('₹109–142 crore'), nw('12–14%'), nw('2025–26')].forEach(x => assert.ok(intro.indexOf(x) >= 0, 'model intro: ' + x));
  assert.ok(wrap.indexOf(nw('₹109–142 crore')) >= 0, 'clean note: ₹109–142 crore');
  const tv = lv.tasks.find(t => t.id === 't4').slots.find(s => s.id === 'tv').options.find(o => o.correct).text;
  assert.ok(escText(tv).indexOf(nw('12–14%')) >= 0 && escText(tv).indexOf(nw('2030–31')) >= 0, 'cover-note line');
  assert.ok(escText(lv.case.period).indexOf(nw('2030–31')) >= 0, 'case file period');
  const r8 = lv.tasks.find(t => t.id === 't3').rows.find(r => r.id === 'r8').cells.line;
  assert.ok(escText(r8).indexOf(nw('2030–31')) >= 0, 'review row label');
  // the app prints those texts through escText, never plain esc (designer S2: 16 sites still broke "2030– / 31")
  ['esc(lv.model.intro)', 'esc(wn.text)', 'esc(task.prompt)', "'<div class=\"bub\">' + esc(msg)", "<dd>' + esc(x[1])", "meta\">' + esc(o.why)",
    "meta\">' + esc(right.why)", 'esc(rowLabel)', 'esc(E.composeText(', 'esc(sub)', "return '<p>' + esc(h)", "Hint</span>' + esc(h)",
    "lv.principles.map(function (p) { return '<li>' + esc(p)", "E.outlineLines(lv, i, values).map(function (x) { return '<li>' + esc(x)",
    "(lv.learn || []).map(function (x) { return '<li>' + esc(x)", 'esc(it.prompt)', 'esc(q.q)', 'esc(q.checking)', 'esc(c.period)', 'esc(d.blurb)', 'esc(r.why)',
    // the play.mjs check then found the documents list ("additions 2026–27", sa-3 at 360) and the model key's choice lines
    "'<span>' + esc(label)", "<b>' + esc(q.text) + '</b><br>'", "data-focus tabindex=\"-1\">' + esc(d.title"]
    .forEach(s => assert.ok(ui.indexOf(s) < 0, 'still plain esc: ' + s));
  ['escText(lv.model.intro)', 'escText(wn.text)', 'escText(task.prompt)', 'escText(msg)', 'escText(rowLabel)', 'escText(o.why)', 'escText(right.why)']
    .forEach(s => assert.ok(ui.indexOf(s) >= 0, 'uses ' + s));
});

test('sa-2 round 1 (re-judge): item labels hold digit-led part codes, n-ply and a number with its unit; the CV line keeps its first verb whole; the plan and the floor never use the green “right” tick', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('function escNum('), ui.indexOf('function plural('));
  const f = new Function('esc', 'D', src + '; return { escLabel: escLabel, escLine: escLine };')(D.esc, D);
  const nw = x => '<span class="nw">' + x + '</span>';
  assert.equal(f.escLabel('B1 · Ball bearing 6205-2RS'), 'B1\u00a0· Ball bearing ' + nw('6205-2RS'));
  assert.equal(f.escLabel('D1 · Corrugated box, 5-ply'), 'D1\u00a0· Corrugated box, ' + nw('5-ply'));
  assert.equal(f.escLabel('C3 · Clutch plate 240 mm'), 'C3\u00a0· Clutch plate ' + nw('240 mm'));
  // sa-3's codes as before; a year range, a date and lower-case words are left
  assert.equal(f.escLabel('CNC TC-35 · FA-27-04'), 'CNC ' + nw('TC-35') + '\u00a0· ' + nw('FA-27-04'));
  assert.equal(f.escLabel('Bill 7 · 2026-27, a cut-off'), 'Bill 7\u00a0· 2026-27, a cut-off');
  assert.ok(!/<script/.test(f.escLabel('<script>6205-2RS</script>')), 'still escaped');
  const line = f.escLine('Statutory Audit Work Simulation, MSC Articleship Program | Oct 2026: Test-counted 12 store locations at a year-end count; test-counted 8 more');
  // sa-1 round 8 (second fixer): the count after the verb is held to the word it counts ("12 store", "8 more")
  assert.ok(line.indexOf(': ' + nw('Test-counted') + ' ' + nw('12 store')) >= 0 && line.indexOf('; ' + nw('test-counted') + ' ' + nw('8 more')) >= 0, 'first verbs held');
  // sa-1 round 8 (designer optional 1): every other hyphenated word of letters in the line is held too
  assert.ok(line.indexOf(' ' + nw('year-end') + ' ') >= 0, 'other hyphenated words held as well');
  // the plan's list mark is a pencil tick (mask over the pencil colour); a checked floor bin carries the checked box
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const listed = (css.match(/\.bn\.bn-listed::before \{[^}]*\}/) || [''])[0];
  assert.ok(listed && !/background: url\("\.\.\/img\/doodles\/tick\.svg"\)/.test(listed) && /background: var\(--pencil\)/.test(listed) && /mask: url\("\.\.\/img\/doodles\/tick\.svg"\)/.test(listed), 'the listed bin mark is a pencil tick');
  const floor = ui.slice(ui.indexOf('function floorHtml('), ui.indexOf('function itemScreen('));
  assert.match(floor, /class="fl-tick" src="img\/doodles\/box-tick\.svg"/);
  assert.ok(floor.indexOf('doodles/tick.svg') < 0, 'no bare green tick on the floor');
  // the review says a number back with its unit on the same line
  const fat = ui.slice(ui.indexOf('function fieldAnswerText('), ui.indexOf('function wrongSpan('));
  assert.ok(/'\\u00a0' \+ f\.unit/.test(fat) && !/' ' \+ f\.unit/.test(fat), 'unit joined with a no-break space');
});

test('dt-1 round 2: “Answer:” holds to its figure; a model table’s scroll covers take the page colour; a short call stays whole on the work sample; dt-1 holds its references', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  // items (hidden field and wrong answer), worksheet cells (and "right figure"), hunt rows
  const items = ui.slice(ui.indexOf('function itemAnswerHtml('), ui.indexOf('rv.extra.forEach('));
  assert.equal((items.match(/<span class="k">Answer:<\/span>&nbsp;<span class="right">/g) || []).length, 2);
  assert.ok(items.indexOf('Answer:</span> <span') < 0, 'no plain space after Answer: in an item');
  // gst-1 round 3: the label itself holds too ("Follows your figures · right" / "figure ₹…" on a phone)
  assert.ok(ui.indexOf('<span class="k">right&nbsp;figure</span>&nbsp;<span class="right">') >= 0);
  assert.ok(ui.indexOf('right figure</span>') < 0, 'no plain space inside "right figure"');
  assert.ok(ui.indexOf("wrongSpan(you, true)) + ' <span class=\"k\">Answer:</span>&nbsp;<span class=\"right\">'") >= 0, 'worksheet cell');
  assert.ok(ui.indexOf("'<span class=\"k\">Answer:</span>&nbsp;<span class=\"right\">' + esc(rs.map(rlabel)") >= 0, 'hunt row');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.match(css, /@media \(min-width: 521px\) \{ \.model \.doc-scroll \{ background-image: linear-gradient\(to right, var\(--bg\) 30%/);
  const smp = ui.slice(ui.indexOf('function sampleTask('), ui.indexOf("if (t.type === 'worksheet')", ui.indexOf('function sampleTask(')));
  const callText = new Function(smp.slice(smp.indexOf('var callText ='), smp.indexOf('var lns = items.map(lineOf)')) + '; return callText;')();
  assert.equal(callText('Report only'), 'Report\u00a0only');
  assert.equal(callText('Hosur (Tamil Nadu)'), 'Hosur (Tamil Nadu)');
  assert.equal(callText('Disallow'), 'Disallow');
  assert.match(smp, /esc\(callText\(x\.call\)\)/);
  // dt-1: "Form 26", "clause 30", "line 15", "section 63", "tax year 2026–27" never break from their numbers; the CV
  // clause carries no no-break space
  const dt1 = read(path.join(DATA, 'levels', 'dt-1.json'));
  const loose = [];
  const walk = (v, p) => { if (typeof v === 'string') { const m = v.match(/\b(Forms?|[Cc]lause|[Ll]ines?|[Ss]ection|[Tt]ax year) \d/); if (m) loose.push(p + ': ' + m[0]); } else if (v && typeof v === 'object') Object.keys(v).forEach(k => walk(v[k], p + '.' + k)); };
  Object.keys(dt1).filter(k => k !== 'documents' && k !== 'earned').forEach(k => walk(dt1[k], k));
  assert.deepEqual(loose, []);
  assert.ok(JSON.stringify(dt1.earned).indexOf('\u00a0') < 0, 'the CV clause has plain spaces');
  // dt-2 round 5 (designer S1): the same holds for "Form 168", "Form 131", "section 393" and "tax year 2026\u201327", in
  // the app's text and in each paper's title (the pack list and viewer label); the CV clause keeps plain spaces
  const dt2 = read(path.join(DATA, 'levels', 'dt-2.json'));
  Object.keys(dt2).filter(k => k !== 'documents' && k !== 'earned').forEach(k => walk(dt2[k], 'dt-2.' + k));
  dt2.documents.forEach(d => walk(d.title, 'dt-2.' + d.id + '.title'));
  assert.deepEqual(loose, []);
  assert.ok(JSON.stringify(dt2.earned).indexOf('\u00a0') < 0, 'the dt-2 CV clause has plain spaces');
});

test('ia-1 round 2: the order review prints each senior note once and says where a step out of place goes; a tick holds to its step; a slot heading keeps its own case', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const line = (name) => ui.slice(ui.indexOf('function ' + name + '('), ui.indexOf('\n', ui.indexOf('function ' + name + '(')));
  const escSrc = ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle('));
  const rev = ui.slice(ui.indexOf('function holdTail('), ui.indexOf('function taskReview('));
  const f = new Function('esc', 'E', 'D', escSrc + '\n' + line('doodle') + '\n' + rev + '; return { orderReview: orderReview, escText: escText, holdTail: holdTail };')(D.esc, E, D);
  const ia1 = read(path.join(DATA, 'levels', 'ia-1.json'));
  const task = ia1.tasks.find(t => t.type === 'order');
  const S = task.answer;
  const count = (html, s) => html.split(s).length - 1;
  const notesOnce = (html, label) => S.forEach(id => assert.equal(count(html, f.escText(task.notes[id])), 1, label + ': the note on ' + id + ' prints once'));
  // the gate and the GRN swapped: seven ticks, the gate step out of place and told where it goes; every note once,
  // under "The right order"
  const swap = S.slice(); swap[3] = S[4]; swap[4] = S[3];
  const sw = f.orderReview(task, { order: swap, inOrder: false });
  assert.equal(count(sw, 'alt="In sequence"'), 7);
  assert.equal(count(sw, '<span class="oop">Out of place</span>'), 1);
  assert.match(sw, /<li class="oop-step">Security logs the truck[^<]*(<span class="nw">[^<]*<\/span>[^<]*)* <span class="oop">Out of place<\/span><br><span class="meta">It goes at step 4\.<\/span><\/li>/);
  assert.ok(sw.indexOf('The right order') > sw.indexOf('It goes at step 4.'));
  notesOnce(sw, 'gate/GRN swap');
  // the wrong set (the steps reversed): a run of one step puts no two in sequence, so (round 5, designer optional 1) no
  // tick, and all eight steps are told where they go ("① The bank pays Shikrapur …" goes at step 8); each note once
  const rv = f.orderReview(task, { order: S.slice().reverse(), inOrder: false });
  assert.equal(count(rv, 'alt="In sequence"'), 0);
  assert.equal(count(rv, 'It goes at step '), 8);
  assert.ok(rv.indexOf('It goes at step 8.') >= 0 && rv.indexOf('It goes at step 8.') < rv.indexOf('It goes at step 7.'));
  notesOnce(rv, 'reversed');
  // a run of one step that sits at its own number keeps its tick (three steps reversed: the middle one is in place)
  const three = { steps: ['a', 'b', 'c'].map(id => ({ id, text: 'Step ' + id })), answer: ['a', 'b', 'c'] };
  const r3 = f.orderReview(three, { order: ['c', 'b', 'a'], inOrder: false });
  assert.equal(count(r3, 'alt="In sequence"'), 1);
  assert.ok(r3.indexOf('<li>Step <span class="nw">b&nbsp;<img ') >= 0, 'the tick on b, in place at 2');
  assert.equal(count(r3, 'It goes at step '), 2);
  // a right order: every note under its tick, no "The right order" and no "It goes at step"
  const ok = f.orderReview(task, { order: S.slice(), inOrder: true });
  assert.equal(count(ok, 'alt="In sequence"'), 8);
  assert.ok(ok.indexOf('The right order') < 0 && ok.indexOf('It goes at step') < 0);
  notesOnce(ok, 'right order');
  // a tick travels with its step's last word in one no-wrap span (it wrapped onto a line of its own on a phone; a
  // no-break space alone does not stop Chrome breaking before an image); a held span counts as one word
  assert.equal(count(ok, '&nbsp;<img style="width:20px;height:18px;vertical-align:-3px" '), 8);
  assert.ok(ok.indexOf('goes into the <span class="nw">ERP&nbsp;<img ') >= 0, 'step 5: “ERP” and its tick');
  assert.equal(f.holdTail('Kavita approves the PO for <span class="nw">₹2,58,000</span>', '+'), 'Kavita approves the PO for <span class="nw"><span class="nw">₹2,58,000</span>+</span>');
  assert.equal(f.holdTail('passed in <span class="nw">Oct 2026</span>', '+'), 'passed in <span class="nw"><span class="nw">Oct 2026</span>+</span>');
  assert.equal(f.holdTail('Done', '+'), '<span class="nw">Done+</span>');
  // the observation heading prints in its own case, as the draft does ("THREE POS" in capitals)
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const head = (css.match(/\.slot-head \{[^}]*\}/) || [''])[0];
  assert.match(head, /text-transform: none;/);
  assert.ok(head.indexOf('uppercase') < 0);
});

test('dt-2 round 1: a choice field may keep five or six short options as buttons; a ruled note keeps the band its stamp needs', () => {
  const sa1 = read(path.join(DATA, 'levels', 'sa-1.json'));
  const withField = (f) => { const x = JSON.parse(JSON.stringify(sa1)); x.tasks[0].fields.push(f); return L.validateLevel(x, { catalogue, world }).errors.join('\n'); };
  const opts = n => Array.from({ length: n }, (_, i) => ({ id: 'o' + i, label: i + '%' }));
  assert.ok(!/buttons/.test(withField({ id: 'rt', kind: 'choice', label: 'Rate', buttons: true, options: opts(5) })));
  assert.match(withField({ id: 'rt', kind: 'choice', label: 'Rate', buttons: 'yes', options: opts(5) }), /buttons must be true/);
  assert.match(withField({ id: 'rt', kind: 'choice', label: 'Rate', buttons: true, options: opts(7) }), /six options at most/);
  assert.match(withField({ id: 'rt', kind: 'multi', label: 'Rate', buttons: true, options: opts(5) }), /buttons applies to a choice field/);
  assert.match(withField({ id: 'rt', kind: 'choice', label: 'Rate', buttons: true, options: [{ id: 'a', label: 'Fees for professional services' }, { id: 'b', label: '2%' }] }), /label is over 18 characters/);
  // the item screen draws them as the big buttons, three to a row once there are more than four
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const fh = ui.slice(ui.indexOf('function fieldHtml('), ui.indexOf('function signButton('));
  assert.match(fh, /o\.length <= 4 \|\| f\.buttons === true/);
  assert.match(fh, /o\.length > 4 \? ' seg3' : ''/);
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.match(css, /\.seg\.wrap\.seg3 \{ grid-template-columns: repeat\(3, 1fr\); \}/);
  // the ruled pad's own padding must not undo the band kept for a top or bottom stamp (more specific than .lts-note .doc-paper)
  ['pt-s', 'pt-m', 'pt-l', 'pb-s', 'pb-m', 'pb-l'].forEach(k => {
    assert.ok(css.indexOf('.lts-note .doc-paper.' + k + ' {') > css.indexOf('.lts-note .doc-paper {'), 'note ' + k);
    assert.ok(css.indexOf('.cds-visiting .doc-paper.' + k + ' {') > css.indexOf('.cds-visiting .doc-paper {'), 'visiting card ' + k);
  });
});

test('dt-2 round 2: a signed ₹ figure said back in the review, the model key and the work sample keeps its sign on its line', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const escNum = new Function('esc', ui.slice(ui.indexOf('function escNum('), ui.indexOf('\n', ui.indexOf('function escNum('))) + '; return escNum;')(D.esc);
  assert.equal(escNum('Tamhini corrects its books · −₹720'), 'Tamhini corrects its books · <span class="nw">−₹720</span>');
  assert.equal(escNum('Ask the deductor'), 'Ask the deductor', 'a text answer is unchanged');
  const ws = ui.slice(ui.indexOf('function wrongSpan('), ui.indexOf('function youSpan('));
  assert.match(ws, /numeric \? escNum\(txt\) : esc\(txt\)/);
  const items = ui.slice(ui.indexOf('function itemAnswerHtml('), ui.indexOf('function mark('));
  // sa-2 r2: each part now goes through holdShort, which is escNum plus a hold on a short label
  assert.match(ui.slice(ui.indexOf('function holdShort('), ui.indexOf('\n', ui.indexOf('function holdShort('))), /var h = escNum\(s\);/);
  // (ba-1 round 1: the third is a right field's own labelled line)
  assert.equal((items.match(/holdShort\(fieldAnswerText\(f, r\.expected\)\)/g) || []).length, 3, 'both Answer: lines and a right line');
  // ba-1 round 1: a right field is said back on its own labelled line (holdShort) when anything is wrong; "Your call:"
  // keeps the one-line join when everything is right
  assert.equal((items.match(/rights\.map\(holdShort\)\.join\('&nbsp;· '\)/g) || []).length, 1, 'Your call:');
  assert.ok(items.indexOf("esc(rights.join(") < 0 && items.indexOf('esc(fieldAnswerText(f, r.expected))') < 0);
  // acc-1: the model key line holds each part as the item review does (holdShort = escNum plus the short-label hold)
  // (acc-1 round 1: with a field's lead said first, leadText)
  assert.ok(ui.indexOf(".map(function (f) { return holdShort(leadText(f, fieldAnswerText(f, exp[f.id]))); }).join('&nbsp;· ')") >= 0, 'model key line');
  // (dt-3 round 2: the grouped table of an items task with sampleGroups is the third)
  // (sa-1 round 5: escText, which is escNum plus the year, code and date holds, so "Fine (2026–" / "27)" never prints)
  assert.equal((ui.match(/escText\(x\.det\)/g) || []).length, 3, 'work sample detail, list, table and grouped table');
  // play.mjs fails a screen where a sign and its ₹ fall on different lines
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.match(play, /const re = \/\[−\+\\-\]₹\/g;/);
  assert.match(play, /report\.signBreaks\.length\) report\.problems\.push/);
});

test('val-1 round 2: a worksheet row earned only by following the student’s own figures never gets the green “Right” tick; its label counts right cells; a pass-need note says follows count', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const f = new Function(ui.slice(ui.indexOf('function mark('), ui.indexOf('function say(')) + '; return { wsRowMark: wsRowMark, wsRowPartial: wsRowPartial };')();
  // margin, gap, equity: one cell, and it follows (val-1 "11.17% Follows your figures · right figure 11.3%")
  const one = f.wsRowMark(0, 1, 1);
  assert.ok(one.indexOf('alt="Right"') < 0 && one.indexOf('tick.svg') < 0, 'no green Right tick on a follow-only row');
  assert.equal(one, '<span class="mk mk-follow" role="img" aria-label="Follows your figures"></span>');
  assert.equal(f.wsRowPartial(0, 1), '', 'no "0 of 1 right"');
  // adjusted EBITDA: two right and one that follows
  assert.ok(/mk-follow/.test(f.wsRowMark(2, 3, 3)) && f.wsRowMark(2, 3, 3).indexOf('alt="Right"') < 0);
  assert.equal(f.wsRowPartial(2, 3), '<span class="partial">2 of 3 right</span>');
  // every cell right, part earned, nothing earned: as before
  assert.match(f.wsRowMark(3, 3, 3), /src="img\/doodles\/tick\.svg" alt="Right"/);
  assert.equal(f.wsRowPartial(3, 3), '');
  assert.match(f.wsRowMark(2, 2, 3), /cross\.svg" alt="Partly right"/);
  assert.match(f.wsRowMark(0, 1, 3), /cross\.svg" alt="Partly right"/);
  assert.match(f.wsRowMark(0, 0, 3), /cross\.svg" alt="Not right"/);
  assert.equal(f.wsRowPartial(0, 3), '');
  assert.ok(ui.indexOf("'<li class=\"nrow\">' + wsRowMark(okN, earnN, list.length)") >= 0 && ui.indexOf('wsRowPartial(okN, list.length)') >= 0, 'the worksheet review uses both');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const rule = (css.match(/\.nrow \.mk-follow \{[^}]*\}/) || [''])[0];
  assert.ok(/background: var\(--orange-ink\)/.test(rule) && /[^-]mask: url\("\.\.\/img\/doodles\/tick\.svg"\) center \/ contain no-repeat/.test(rule), 'the tick’s shape in Day 1 ink');
  // the validator: a pass-need note on a worksheet with follow cells names follows beside "right"
  const v1 = read(path.join(DATA, 'levels', 'val-1.json'));
  const w = x => L.validateLevel(x, { catalogue, world }).warns.filter(m => /^passNeeds\[/.test(m));
  assert.deepEqual(w(v1), []);
  const old = JSON.parse(JSON.stringify(v1));
  old.passNeeds[1].note = 'Your bridge needs at least five of its nine figures right to pass.';
  assert.equal(w(old).length, 1);
  assert.match(w(old)[0], /^passNeeds\[1\]: figures that follow the student’s own count towards this pass/);
});

test('sa-2 round 2: a short label said back in the review reads as one unit; a card’s label column narrows on a 360 px phone', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const line = (name) => ui.slice(ui.indexOf('function ' + name + '('), ui.indexOf('\n', ui.indexOf('function ' + name + '(')));
  const holdShort = new Function('esc', line('escNum') + '\n' + line('holdShort') + '; return holdShort;')(D.esc);
  assert.equal(holdShort('Nothing else'), '<span class="nw">Nothing else</span>');
  assert.equal(holdShort('Damaged: set apart'), '<span class="nw">Damaged: set apart</span>', '18 characters are held');
  assert.equal(holdShort('Cut-off: wrong year!'), 'Cut-off: wrong year!', 'a longer label still wraps');
  assert.equal(holdShort('3,400 nos'), '<span class="nw">3,400 nos</span>');
  assert.equal(holdShort('Tamhini corrects its books · −₹720'), 'Tamhini corrects its books · <span class="nw">−₹720</span>', 'a signed figure keeps its sign as before');
  // every label said back in an item's review goes through it: the right answer, the right picks, a partly right
  // pick list, and what the student flagged that the key does not have
  const items = ui.slice(ui.indexOf('function itemAnswerHtml('), ui.indexOf('function mark('));
  assert.equal((items.match(/<span class="right">' \+ holdShort\(fieldAnswerText\(f, r\.expected\)\)/g) || []).length, 2);
  // (ba-1 round 1: one "Your call:" join; a right field on its own line, and a pick the call did not need, hold too)
  assert.equal((items.match(/rights\.map\(holdShort\)\.join\('&nbsp;· '\)/g) || []).length, 1);
  assert.match(items, /<span class="you-ok">' \+ holdShort\(fieldAnswerText\(f, r\.expected\)\)/);
  // (acc-1 round 2: the pencil line says a field's lead too, still held by holdShort)
  assert.match(items, /quiet\.push\(holdShort\(leadText\(f, fieldAnswerText\(f, x\.given\)\)\)\)/);
  assert.equal((items.match(/\.map\(lab\)\.map\(holdShort\)\.join\('; '\)/g) || []).length, 3);
  assert.match(items, /return holdShort\(optLabel\(f, id\)\); \}\)\.join\('; '\) : holdShort\(fieldAnswerText\(f, x\.given\)\)/);
  // a struck pick (24 characters at most) never splits
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.match((css.match(/\.ans \.you\.wrong \{[^}]*\}/) || [''])[0], /white-space: nowrap;/);
  // (dt-2 round 5: up to 30 in a choice field whose every option is that short, so one field has one look)
  assert.match(ui.slice(ui.indexOf('function wrongSpan('), ui.indexOf('function youSpan(')), /txt\.length > \(max \|\| 24\) \? 'you-long' : 'you wrong'/);
  assert.match(ui.slice(ui.indexOf('function strikeMax('), ui.indexOf('function youSpan(')), /f\.kind === 'choice' && [^\n]*\.length <= 30; \}\) \? 30 : 24;/);
  // a long held code on a card (sa-2's QC tag: "GRN-2027-03-0443") fits a 360 px phone
  assert.match(css, /@media \(max-width: 379px\) \{ \.cd-row \{ grid-template-columns: 7em 1fr; \} \}/);
  assert.ok(css.indexOf('@media (max-width: 379px) { .cd-row {') > css.indexOf('.cd-row { display: grid; grid-template-columns: 8.5em 1fr;'), 'after the base rule');
  // play.mjs fails a paper whose text runs past the box that clips it (viewer and every item paper on a phone), and a
  // review that splits a short answer label over two lines
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.match(play, /async function checkClippedText\(page, scopeSel\)/);
  assert.match(play, /checkClippedText\(page, '\.viewer \.doc'\)/);
  assert.match(play, /checkClippedText\(page, '\.idetail-docs \.doc'\)/);
  assert.match(play, /report\.problems\.push\('the review splits a short answer label over two lines/);
});

test('sa-3 round 2: a pinned invoice description has no max-width on a phone; three long options stack on a phone; play.mjs checks held codes', () => {
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  // the Wakad serial "WAS-SC15-2701-118;" ran 4.5 px past its rule at 360 and 375 px under a 10em max-width
  const pinned = css.match(/\.doc-scroll \.inv-lines(?:\.long-desc)? \.stick1(?:, [^{]*)? \{ width:[^}]*\}/g) || [];
  assert.equal(pinned.length, 5, 'two phone blocks of two rules, and the 380 px rule');
  pinned.forEach(r => assert.match(r, /max-width: none;/, r));
  // the place field's three options, one to a row on a phone; never the main call, never short labels
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const at = ui.indexOf('function fieldHtml(');
  // (gst-2 round 1: the field's label goes through escLabel, which holds its codes)
  const fieldHtml = new Function('esc', 'signButton', 'E', 'escLabel', ui.slice(at, ui.indexOf('\n  function ', at + 1)) + '\n; return fieldHtml;')(D.esc, () => '', { tidyNumberText: x => x }, x => D.nwCodes(D.esc(x)));
  const seg = (f) => (fieldHtml({ id: 't1' }, { id: 'i1' }, Object.assign({ kind: 'choice', label: 'L' }, f), undefined).match(/<div class="seg[^"]*"/) || [''])[0];
  const opts = labels => labels.map((l, i) => ({ id: 'o' + i, label: l }));
  assert.equal(seg({ id: 'place', options: opts(['Property, plant and equipment', 'Capital work-in-progress', 'Repairs (profit and loss)']) }), '<div class="seg wrap stack"');
  assert.equal(seg({ id: 'v', gate: true, options: opts(['Keep', 'Take out', 'Adjust to market for the year']) }), '<div class="seg wrap"', 'not the main call');
  assert.equal(seg({ id: 'v', options: opts(['Fine', 'Disallow', 'Report only']) }), '<div class="seg wrap"', 'short labels stay two to a row');
  // (dt-3 round 2: four options also carry seg4, which keeps the 2 × 2 grid inside a three-way call's desktop bar)
  assert.equal(seg({ id: 'v', options: opts(['B2B with CGST + SGST', 'B2B with IGST', 'B2C (buyer has no GSTIN)', 'Table 13 only (cancelled)']) }), '<div class="seg wrap seg4"', 'four options keep the 2 × 2 grid');
  assert.match(css, /@media \(max-width: 520px\) \{ \.seg\.wrap\.stack \{ grid-template-columns: 1fr; \} \}/);
  assert.ok(css.indexOf('.seg.wrap.stack') > css.indexOf('.seg.wrap { grid-auto-flow: row;'), 'after the two-column rule');
  // sa-3's place field stacks (dt-4's reason field too); every field that stacks is a three-option non-gate choice with a
  // label over 18 characters, the rule above
  const stacked = [];
  levelFiles.forEach(f => read(path.join(DATA, 'levels', f)).tasks.forEach(t => (t.fields || []).forEach(fl => {
    if (fl.kind === 'choice' && /stack/.test(seg(fl))) {
      stacked.push(f.slice(0, -5) + ' ' + t.id + ' ' + fl.id);
      assert.ok(!fl.gate && fl.options.length === 3 && fl.options.some(o => o.label.length > 18), f + ' ' + fl.id);
    }
  })));
  assert.ok(stacked.indexOf('sa-3 t1 place') >= 0, stacked.join(', '));
  // play.mjs fails a held code (and the punctuation after it) that runs past its table cell
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  // (dt-3: a third call reads a paper that arrives with a later task in that task's viewer)
  assert.ok(play.indexOf('async function checkHeldCodes(') >= 0 && (play.match(/await checkHeldCodes\(page, /g) || []).length === 3, 'phone viewer, desktop pane and a later paper in its task’s viewer');
});

test('dt-3: a paper that arrives with a later task stays out of the case file and earlier tasks (ws-ui packDocs, play.mjs)', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  assert.ok(/function packDocs\(lv, task\)/.test(ui), 'packDocs exists');
  assert.ok(/var docs = packDocs\(lv, null\);/.test(ui), 'the case file lists the pack without later papers');
  assert.ok(/return packDocs\(lv, task\);/.test(ui), 'a task without docs gets the pack without other tasks’ later papers');
  assert.ok(/!d\.arrives \|\| \(task && d\.arrives === task\.id\)/.test(ui), 'a later paper shows only with its own task');
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(/filter\(d => !d\.arrives\)/.test(play) && /d\.arrives === t\.id/.test(play), 'play.mjs reads later papers in their task’s viewer');
  // every level's later papers are listed by their task and by no earlier one (the validator's rule, on the shipped files)
  levelFiles.forEach(f => {
    const lv = read(path.join(DATA, 'levels', f));
    (lv.documents || []).filter(d => d.arrives).forEach(d => {
      const ti = lv.tasks.findIndex(t => t.id === d.arrives);
      assert.ok(ti > 0 && (lv.tasks[ti].docs || []).indexOf(d.id) >= 0, f + ' ' + d.id);
      lv.tasks.slice(0, ti).forEach(t => assert.ok((t.docs || []).indexOf(d.id) < 0 && !(t.items || []).some(it => (it.docs || []).indexOf(d.id) >= 0), f + ' ' + d.id + ' in ' + t.id));
    });
  });
});

test('dt-4 round 1: a worksheet note above the sheet, the figure typed on the list chip, a narrow one-column computation on the work sample', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.ok(/\(task\.noteAt === 'top' \? wsNote : ''\)/.test(ui) && /\(task\.noteAt === 'top' \? '' : wsNote\)/.test(ui), 'the note prints above the sheet with noteAt "top", below without it');
  assert.ok(/fl\.kind === 'number' && fl\.chip === true/.test(ui) && /<span class="chip ink has-fig"><span>' \+ esc\(optLabel\(gate, ia\[gate\.id\], true\)\) \+ '<\/span><span class="cfig">' \+ esc\(chipFig\)/.test(ui), 'a chip number field adds the figure typed under the call on the list');
  assert.ok(/\.irow \.chip\.has-fig \{ flex-direction: column;/.test(css), 'the figure stacks under the call, so the chip is no wider than the call');
  // consistency pass round 1 (P02): any worksheet with one value column, at most 60% of the page
  assert.ok(/wsTable\(t\) \|\| cols\.length === 2 \? ' class="s-one"'/.test(ui) && /\.sheet table\.s-one \{ width: auto; min-width: 42%; max-width: 60%; \}/.test(css), 'a one-column computation prints narrow on the work sample');
  // the validator's rules for both keys
  const lv = read(path.join(DATA, 'levels', 'dt-4.json'));
  assert.deepEqual(L.validateLevel(lv, { world, catalogue }).errors, []);
  const bad = JSON.parse(JSON.stringify(lv));
  bad.tasks[1].noteAt = 'bottom';
  bad.tasks[0].fields.find(f => f.id === 'call').chip = true;
  const errs = L.validateLevel(bad, { world, catalogue }).errors.join('\n');
  assert.match(errs, /noteAt is "top", on a worksheet with a note/);
  assert.match(errs, /field call chip must be true, on a number field/);
});

test('dt-3 round 2: beside a "Check …" button a phone shows "Submit" alone; play.mjs measures the list bar after each item', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  // the three-button last-task bar: the visible "Submit" is the start of the button's name, "Submit for review" (WCAG 2.5.3)
  assert.ok(/data-act="submit">' \+ \(check \? 'Submit<span class="ab-more"> for review<\/span>' : 'Submit for review'\) \+ '<\/button>'/.test(ui), 'the last task’s submit button hides “ for review” only beside a Check button');
  assert.ok(/@media \(max-width: 520px\) \{ \.actionbar \.ab-more \{ position: absolute; width: 1px; height: 1px;[^}]*clip: rect\(0 0 0 0\);[^}]*\} \}/.test(css), 'only a phone hides it, visually');
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(/const listBar = async \(ti, when\) =>/.test(play) && /if \(ia && isPhone\(vpName\)\) await listBar\(ti, 'after item ' \+ \(k \+ 1\)\);/.test(play) && /await listBar\(ti, 'before any item'\)/.test(play), 'play.mjs measures the list bar before the first item and after each call');
  assert.ok(/b\.right > m\.w - m\.g \+ 8/.test(play) && /m\.sw > m\.w/.test(play), 'a bar button past the gutter, or a sideways scroll, fails the run');
});

test('dt-3 round 2 (engine optionals): hidden pick lists, call filters, four options on a desktop, a plain table’s kind, sampleGroups and pinFit', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  // a hidden pick list says only the right answer, as a hidden number or choice does (no "none" before "Answer:")
  const items = ui.slice(ui.indexOf('function itemAnswerHtml('), ui.indexOf('function mark('));
  assert.ok(items.indexOf("} else if (E.isEmpty(r.given) && !E.fieldVisible(f, ia || {})) {") >= 0, 'every hidden empty field');
  // a list of four items or fewer shows "All" and "To check" only
  const list = ui.slice(ui.indexOf('function itemsList('), ui.indexOf('function floorDoc('));
  assert.match(list, /var callChips = gate && items\.length > 4;/);
  assert.match(list, /if \(!callChips && f\.indexOf\('g:'\) === 0\) f = 'all';/);
  assert.match(list, /if \(callChips\) \(gate\.options \|\| \[\]\)\.forEach/);
  // four options keep 2 × 2 inside a three-way call's desktop bar
  assert.ok(css.indexOf('.work.two .ibar.gate3 .seg.wrap.seg4 { grid-template-columns: 1fr 1fr; }') > css.indexOf('.work.two .ibar.gate3 .seg.wrap { grid-auto-flow: row;'), 'after the three-column rule');
  // a plain table's pack-list kind is its tab
  assert.match(ui, /var plainKind = D\.typeLabel\(x\.doc\) === 'Table' && x\.doc\.tab \? x\.doc\.tab : D\.typeLabel\(x\.doc\);/);
  // pinFit: the class only on a frozen sheet that asks for it
  const sheet = (extra) => D.renderDocument(Object.assign({ id: 's', type: 'table', style: 'sheet', title: 'T', freeze: true, columns: [{ key: 'a', label: 'Client' }, { key: 'b', label: 'Year' }], rows: [{ a: 'Tamhini', b: 'AY 2026–27' }] }, extra));
  assert.ok(/class="dt dt-sheet pin-fit"/.test(sheet({ pinFit: true })));
  assert.ok(!/pin-fit/.test(sheet({})) && !/pin-fit/.test(sheet({ pinFit: true, freeze: false })));
  assert.ok(css.indexOf('.dt-sheet.pin-fit .stick1 { min-width: 0; }') > css.indexOf('.dt-sheet .stick1 { position: sticky;'), 'after the pinned column’s minimum');
  // sampleGroups: the grouped work-sample table, numbered in its first group
  const st = ui.slice(ui.indexOf('function sampleTask('), ui.indexOf("if (t.type === 'worksheet')", ui.indexOf('function sampleTask(')));
  assert.match(st, /if \(gate && Array\.isArray\(t\.sampleGroups\) && t\.sampleGroups\.length\)/);
  assert.match(st, /colLine\(items\[i\], i, !ownNo && si === 0 \? \+\+n : 0, false\)/);
  assert.match(st, /secs\.push\(\{ label: 'Not checked', idx: left \}\)/);
  // the validator: dt-3 passes; wrong shapes are errors
  const dt3 = read(path.join(DATA, 'levels', 'dt-3.json'));
  const errs = x => L.validateLevel(x, { catalogue, world }).errors.join('\n');
  assert.equal(errs(dt3), '');
  const bad = JSON.parse(JSON.stringify(dt3));
  const t4 = bad.tasks.find(t => t.id === 't4');
  t4.sampleGroups = [{ call: 'maybe', label: 'X' }, { call: 'no' }, { call: 'no', label: 'Y' }];
  bad.documents.find(d => d.id === 'tar-43b').pinFit = true;
  const e = errs(bad);
  assert.match(e, /sampleGroups\[0\] call is not an option of the gate inc/);
  assert.match(e, /sampleGroups\[1\] label missing/);
  assert.match(e, /sampleGroups\[2\] repeats the call no/);
  assert.match(e, /pinFit must be true, on a sheet with freeze: true/);
  // a longer label said back in the review holds its en-dash year ("Bonus register for FY 2025–" / "26" on a desktop)
  const line = (name) => ui.slice(ui.indexOf('function ' + name + '('), ui.indexOf('\n', ui.indexOf('function ' + name + '(')));
  const holdShort = new Function('esc', line('escNum') + '\n' + line('holdShort') + '; return holdShort;')(D.esc);
  assert.equal(holdShort('October 2026 bank statement page, Bonus register for FY 2025–26'), 'October 2026 bank statement page, Bonus register for FY <span class="nw">2025–26</span>');
  assert.equal(holdShort('Paid ₹150–250 in all'), 'Paid <span class="nw">₹150–250</span> in all', 'a ₹ range is escNum’s, held once');
  // play.mjs: text hidden for screen readers the .vh way (absolute, 1 × 1 px) is not a box that hides content
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(play.indexOf("if (cs.position === 'absolute' && el.offsetWidth <= 1 && el.offsetHeight <= 1) return;") >= 0);
});

test('ia-2 round 1: sampleColumns prints an items task as a matrix; a label that carries its own number drops #; a worksheet text column reads from the left', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('function sampleTask('), ui.indexOf('function fitSample('));
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const optLabel = (f, v) => ((f.options || []).filter(o => o.id === v)[0] || {}).label || String(v);
  const sampleTask = new Function('E', 'esc', 'escText', 'escNum', 'escLabel', 'capWord', 'gateField', 'optLabel', 'fieldAnswerText', 'itemSummary', 'wsTable', 'leadText',
    src + '; return sampleTask;')(E, esc, esc, esc, esc, s => s.charAt(0).toUpperCase() + s.slice(1), t => (t.fields || []).filter(f => f.gate)[0] || null,
    optLabel, (f, v) => optLabel(f, v), () => '', t => t.layout === 'table' && (t.columns || []).length === 2, (f, s) => s);
  const ia2 = read(path.join(DATA, 'levels', 'ia-2.json'));
  const t1 = ia2.tasks.filter(t => t.id === 't1')[0];
  assert.equal(t1.sampleColumns, true);
  const a1 = {}; t1.items.forEach(it => { a1[it.id] = Object.assign({}, it.answer); });
  a1.r2 = { ctl: 'dup' };                                    // a row left half done prints a dash in each blank cell
  const m = sampleTask(ia2, t1, a1);
  assert.match(m, /<thead><tr><th>Row<\/th><th>Control<\/th><th>Type<\/th><th>Nature<\/th><th>Test<\/th><\/tr><\/thead>/);
  assert.ok(m.indexOf('<th>#</th>') < 0 && m.indexOf('Detail') < 0, 'no # beside "Row 1", no Detail string');
  assert.ok(m.indexOf('<tr><td>Row 1 · Money not spent</td><td>Bill check</td><td>Preventive</td><td>Manual</td><td>Vouch paid claims to their bills</td></tr>') >= 0);
  assert.ok(m.indexOf('<td>Row 2 · One bill paid twice</td><td>Duplicate block</td><td>–</td><td>–</td><td>–</td>') >= 0);
  // without the option the table is as before: one Detail column (# still dropped, the labels carry their numbers)
  const plain = Object.assign({}, t1); delete plain.sampleColumns;
  const p = sampleTask(ia2, plain, a1);
  assert.ok(p.indexOf('<th>Detail</th>') >= 0 && p.indexOf('<th>Control</th>') < 0 && p.indexOf('<th>#</th>') < 0);
  assert.ok(p.indexOf('Bill check; Preventive; Manual; Vouch paid claims to their bills') >= 0);
  // a code is not the item's number (sa-2's bin A1, sa-4's E1090): # stays
  const coded = Object.assign({}, plain, { items: plain.items.map((it, i) => Object.assign({}, it, { label: 'A' + (i + 1) + ' · ' + it.label.split(' · ')[1] })) });
  assert.ok(sampleTask(ia2, coded, a1).indexOf('<th>#</th>') >= 0);
  // the worksheet: "Breach" (text) from the left, the rupee column on the right
  const t3 = ia2.tasks.filter(t => t.id === 't3')[0];
  const a3 = {}; t3.rows.forEach(r => { a3[r.id + '.rec'] = String(r.cells.rec.answer); });
  const w = sampleTask(ia2, t3, a3);
  // (round 3, designer optional 2: the label holds its unit with a no-break space, so a 360 px card never splits it)
  assert.ok(w.indexOf('<th>Claim</th><th>Breach</th><th class="r">Recover (₹)</th>') >= 0);
  assert.ok(w.indexOf('<td>Car kilometres above the trip log</td><td class="r"><b>') >= 0);
  // sa-3's "Ready for use" dates are text too; a column of figures with no format still goes right
  const ws = { type: 'worksheet', columns: [{ key: 'a', label: 'Item' }, { key: 'b', label: 'Date' }, { key: 'c', label: 'Qty' }],
    rows: [{ id: 'r1', cells: { a: 'Lathe', b: '15 May 2026', c: 4 } }] };
  assert.ok(sampleTask({}, ws, {}).indexOf('<th>Item</th><th>Date</th><th class="r">Qty</th>') >= 0);
  // the validator: sampleColumns is true, on an items task of twelve items or fewer
  const bad = JSON.parse(JSON.stringify(ia2)); bad.tasks[0].sampleColumns = 'yes'; bad.tasks[2].sampleColumns = true;
  const errs = L.validateLevel(bad, { catalogue, world }).errors.join('\n');
  assert.match(errs, /tasks\[0\] \(t1\): sampleColumns must be true/);
  assert.match(errs, /tasks\[2\] \(t3\): sampleColumns applies to an items task/);
});

test('val-1 round 3: sampleBreak prints a one-column computation as two tables side by side; without it, one table; the validator', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('function sampleTask('), ui.indexOf('function fitSample('));
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const optLabel = (f, v) => ((f.options || []).filter(o => o.id === v)[0] || {}).label || String(v);
  const sampleTask = new Function('E', 'esc', 'escText', 'escNum', 'escLabel', 'capWord', 'gateField', 'optLabel', 'fieldAnswerText', 'itemSummary', 'wsTable', 'leadText',
    src + '; return sampleTask;')(E, esc, esc, esc, esc, s => s.charAt(0).toUpperCase() + s.slice(1), t => (t.fields || []).filter(f => f.gate)[0] || null,
    optLabel, (f, v) => optLabel(f, v), () => '', t => t.layout === 'table' && (t.columns || []).length === 2, (f, s) => s);
  const v1 = read(path.join(DATA, 'levels', 'val-1.json'));
  const t3 = v1.tasks.filter(t => t.id === 't3')[0];
  assert.equal(t3.sampleBreak, 'r7');
  const a3 = {}; t3.rows.forEach(r => { const c = r.cells.amt; if (c && c.input) a3[r.id + '.amt'] = String([].concat(c.answer)[0]); });
  const s = sampleTask(v1, t3, a3);
  assert.ok(s.startsWith('<div class="s-pair"><table class="s-one">') && s.endsWith('</table></div>'), s.slice(0, 80));
  const halves = s.slice('<div class="s-pair">'.length, -'</div>'.length).split('</table>').filter(Boolean);
  assert.equal(halves.length, 2);
  const head = h => h.slice(h.indexOf('<thead>'), h.indexOf('</thead>'));
  assert.equal(head(halves[0]), head(halves[1]), 'each half has the same head');
  assert.ok(halves[0].indexOf('2026–27 FCFF') >= 0 && halves[0].indexOf('PV of FCFF') < 0, 'the hand-worked year on the left');
  assert.ok(halves[1].indexOf('<tbody><tr><td>PV of FCFF, five years') >= 0 && halves[1].indexOf('Enterprise value at 14%') >= 0, 'the break row opens the right half');
  assert.equal((s.match(/<tr>|<tr class/g) || []).length - 2, t3.rows.length, 'every row printed once (two heads)');
  // without the key, on the first row or on a row the task does not have: one table, exactly as before
  const plain = Object.assign({}, t3); delete plain.sampleBreak;
  const one = sampleTask(v1, plain, a3);
  assert.ok(one.startsWith('<table class="s-one"><thead>') && (one.match(/<table/g) || []).length === 1 && one.indexOf('s-pair') < 0);
  assert.equal(sampleTask(v1, Object.assign({}, t3, { sampleBreak: 'r1' }), a3), one);
  assert.equal(sampleTask(v1, Object.assign({}, t3, { sampleBreak: 'zz' }), a3), one);
  assert.equal(s.replace(/<\/tbody><\/table><table class="s-one"><thead>[\s\S]*?<\/thead><tbody>/, '').replace('<div class="s-pair">', '').replace(/<\/div>$/, ''), one, 'the split adds nothing but the second head');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.ok(/\.sheet \.s-pair \{ display: flex; gap: 4%; align-items: flex-start; \}/.test(css) && /\.sheet \.s-pair table\.s-one \{ flex: 1 1 0; min-width: 0; max-width: 48%; \}/.test(css));
  // the validator: a non-first row of a worksheet with one value column
  const bad = JSON.parse(JSON.stringify(v1));
  const ix = id => bad.tasks.findIndex(t => t.id === id);
  bad.tasks[ix('t1')].sampleBreak = 'i4'; bad.tasks[ix('t2')].sampleBreak = 'r5'; bad.tasks[ix('t3')].sampleBreak = 'r1';
  let errs = L.validateLevel(bad, { catalogue, world }).errors.join('\n');
  assert.match(errs, /\(t1\): sampleBreak applies to a worksheet with one value column/);
  assert.match(errs, /\(t2\): sampleBreak applies to a worksheet with one value column/);
  assert.match(errs, /\(t3\): sampleBreak names the first row/);
  bad.tasks[ix('t3')].sampleBreak = 'zz';
  errs = L.validateLevel(bad, { catalogue, world }).errors.join('\n');
  assert.match(errs, /\(t3\): sampleBreak names no row of the task \(zz\)/);
  assert.ok(!/sampleBreak/.test(L.validateLevel(v1, { catalogue, world }).errors.join('\n')));
});

test('ia-2 round 2: a level the law makes longer names its row in minutesWhy; a wrapped worksheet text reads from the left; a total row’s dash leaves the card; a long review list opens on Missed', () => {
  const ia2 = read(path.join(DATA, 'levels', 'ia-2.json'));
  const mins = r => r.errors.concat(r.warns).filter(x => /^minutes/.test(x));
  // ia-2 shows its honest time above 40 and says why (internal): no minutes error or warning
  assert.ok(ia2.minutes > 40 && typeof ia2.minutesWhy === 'string');
  assert.deepEqual(mins(L.validateLevel(ia2, { catalogue, world })), []);
  const v = (patch) => { const x = Object.assign(JSON.parse(JSON.stringify(ia2)), patch); return L.validateLevel(x, { fixture: true }); };
  const noWhy = JSON.parse(JSON.stringify(ia2)); delete noWhy.minutesWhy;
  assert.match(L.validateLevel(noWhy, { fixture: true }).errors.join('\n'), /^minutes: should be 15–40/m);     // 55 with no reason
  assert.match(v({ minutesWhy: ' ' }).errors.join('\n'), /minutesWhy: must name the law row/);
  assert.match(v({ minutes: 61 }).errors.join('\n'), /^minutes: should be 15–40/m);                            // the cap is 60
  assert.match(v({ minutes: 30 }).warns.join('\n'), /minutesWhy: not needed/);
  const forty = JSON.parse(JSON.stringify(noWhy)); forty.minutes = 44;                                          // as before: 41–45 warns
  assert.match(L.validateLevel(forty, { fixture: true }).warns.join('\n'), /^minutes: should be 15–40/m);
  // the reason is internal: it is never checked as student text (and never rendered)
  assert.ok(!L.validateLevel(Object.assign(JSON.parse(JSON.stringify(ia2)), { minutesWhy: 'SPEC 3.2 range; see ia-2 and t2' }), { fixture: true }).errors.some(x => /minutesWhy.*(internal|task id)/.test(x)));
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  assert.ok(ui.indexOf('minutesWhy') < 0, 'the UI never reads minutesWhy');
  // worksheet text cells carry tx (and nil for a total row's dash) on the task screen and in the model answer
  const ws = ui.slice(ui.indexOf('function worksheet('), ui.indexOf('/* choice */'));
  assert.match(ws, /'tx' \+ \(\(row\['_class'\] === 'total' \|\| row\.total\) && \(txt\.trim\(\) === '' \|\| txt\.trim\(\) === '–'\) \? ' nil' : ''\)/);
  const ms = ui.slice(ui.indexOf('function modelSection('), ui.indexOf("} else if (t.type === 'choice')", ui.indexOf('function modelSection(')));
  assert.ok(ms.indexOf("'<th' + (mNum[i] ? ' class=\"r\"' : '')") >= 0 && ms.indexOf("' nil'") >= 0, 'the model table aligns by column content');
  // both card blocks read a wrapped text from the left and drop the nil cell, outside the grid and one-column layouts
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.equal((css.match(/\.ws-wrap:not\(\.ws-grid\):not\(\.ws-one\) > \.ws td\.tx \{ text-align: left; \}/g) || []).length, 2);
  assert.equal((css.match(/\.ws-wrap:not\(\.ws-grid\):not\(\.ws-one\) > \.ws tr\.ws-total td\.nil \{ display: none; \}/g) || []).length, 2);
  // ia-2's total row has the dash, and a "Breach" is long enough to wrap on a phone card
  const t3 = ia2.tasks.filter(t => t.id === 't3')[0];
  assert.equal(t3.rows.filter(r => r._class === 'total')[0].cells.what, '–');
  // the review: more than 20 items with some missed opens on Missed, and so does any list in an attempt that did not pass
  // (sa-2 round 4); the student's own pick still wins
  assert.match(ui, /var f = app\.ui\.rfilter\[key\] \|\| \(\(\(task\.items \|\| \[\]\)\.length > 20 \|\| failed\) && missed && missed < task\.items\.length \? 'missed' : 'all'\);/);
  assert.ok(ui.indexOf('function taskReview(lv, task, i, a, r, who, failed) {') >= 0 && ui.indexOf("scored.tasks[t.id], reviewer, !res.passed); })") >= 0, 'the review tells each task whether the attempt failed');
  // the hint offer's two buttons wrap together (sa-2 round 4): one row under the sentence on a phone, Show hint first
  assert.equal((ui.match(/<span class="hc-btns"><button class="btn btn-primary btn-sm" data-act="hint-yes"/g) || []).length, 2);
  assert.match(fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8'), /\.hint-confirm \.hc-btns \{ display: flex; flex-wrap: wrap; gap: 8px 10px; flex: 0 0 auto; \}/);
});

test('for-1: a hunt row holds its codes and dates; one match button per vendor; a fine row the student flagged gets the task’s fineNote', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const hr = ui.slice(ui.indexOf('function huntResults('), ui.indexOf('function toggle(task, key, label)'));
  assert.ok(hr.indexOf("s.length <= 22 ? '<span class=\"nw\">' + esc(s) + '</span>'") >= 0, 'a short column is held whole');
  assert.ok(hr.indexOf(".join('&nbsp;· ')") >= 0 && hr.indexOf("'<div class=\"h-more\">' + more + '</div>'") >= 0, 'the middot is held to the piece before it');
  assert.ok(hr.indexOf('mgroups.map(function (g)') >= 0, 'one entry and one button per matched vendor');
  assert.ok(ui.indexOf("(ans[id] === undefined && flags[id] !== undefined ? task.fineNote : '')") >= 0, 'the fineNote fallback');
  // the validator reads fineNote as a note (45 words at most)
  const fx = read(path.join(__dirname, 'fixtures', 'demo-level.json'));
  const hunt = fx.tasks.filter(t => t.type === 'hunt')[0];
  hunt.fineNote = Array(50).fill('word').join(' ') + '.';
  assert.match(L.validateLevel(fx, { fixture: true }).errors.join('\n'), /fineNote: over 45 words/);
  hunt.fineNote = 'Paid once, against its bill, on a working day.';
  assert.ok(!L.validateLevel(fx, { fixture: true }).errors.some(x => /fineNote/.test(x)));
});

test('fdd-1 round 1: a grouped work sample whose labels carry their own number prints no # column; dt-3 keeps its index', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('function sampleTask('), ui.indexOf('function fitSample('));
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const optLabel = (f, v) => ((f.options || []).filter(o => o.id === v)[0] || {}).label || String(v);
  const sampleTask = new Function('E', 'esc', 'escText', 'escNum', 'escLabel', 'capWord', 'gateField', 'optLabel', 'fieldAnswerText', 'itemSummary', 'wsTable', 'leadText',
    src + '; return sampleTask;')(E, esc, esc, esc, esc, s => s.charAt(0).toUpperCase() + s.slice(1), t => (t.fields || []).filter(f => f.gate)[0] || null,
    optLabel, (f, v) => optLabel(f, v), () => '', () => false, (f, s) => s);
  const key = t => { const a = {}; t.items.forEach(it => { a[it.id] = Object.assign({}, it.answer); }); return a; };
  // fdd-1 t2: "Line 1 · …" to "Line 11 · …" sorted into Debt, Debt-like, Cash and Left out: no # beside any group
  const fdd = read(path.join(DATA, 'levels', 'fdd-1.json'));
  const t2 = fdd.tasks.filter(t => t.id === 't2')[0];
  assert.ok(t2.sampleGroups && t2.items.length === 11);
  // consistency pass round 1 (P02): the groups print in two columns, one item to a line, each head before its lines
  const g = sampleTask(fdd, t2, key(t2));
  assert.ok(g.indexOf('<div class="cols2 s-groups">') === 0, 'two columns');
  assert.ok(g.indexOf('<b>1.</b>') < 0, 'no index beside “Line 1 · …”');
  assert.ok(g.indexOf('<div class="grp">Debt <span class="g-n">(3)</span></div><div>Line 1 · Term loan from bank') >= 0, 'the head, then its first line');
  // a student's note prints after the item, on its line (ia-1 round 5: after a " · " held to the word before it)
  const withNote = key(t2); withNote.n5.note = 'Margin money, under lien';
  assert.ok(sampleTask(fdd, t2, withNote).indexOf('&nbsp;· <i>Margin money, under lien</i></div>') >= 0);
  // dt-3 t4: its labels are not numbers in order, so the appeal set keeps its 1, 2, 3 index (the first group only)
  const dt3 = read(path.join(DATA, 'levels', 'dt-3.json'));
  const t4 = dt3.tasks.filter(t => Array.isArray(t.sampleGroups))[0];
  const d = sampleTask(dt3, t4, key(t4));
  assert.ok(d.indexOf('<div class="grp">The appeal set') >= 0);
  assert.ok(d.indexOf('<div><b>1.</b> ') >= 0 && d.indexOf('<div><b>2.</b> ') >= 0 && d.indexOf('<div><b>3.</b> ') >= 0);
  const leftPart = d.slice(d.indexOf('<div class="grp">', d.indexOf('<div class="grp">') + 1));
  assert.ok(leftPart && leftPart.indexOf('<b>') < 0, 'the papers left in the file carry no index');
  // a task of more than eight items prints in two columns with each item's sub-line after its label (fdd-1 t1)
  const t1 = fdd.tasks.filter(t => t.id === 't1')[0];
  const sampleWithSub = new Function('E', 'esc', 'escText', 'escNum', 'escLabel', 'capWord', 'gateField', 'optLabel', 'fieldAnswerText', 'itemSummary', 'wsTable', 'leadText',
    src + '; return sampleTask;')(E, esc, esc, esc, esc, s => s.charAt(0).toUpperCase() + s.slice(1), t => (t.fields || []).filter(f => f.gate)[0] || null,
    optLabel, (f, v) => optLabel(f, v), (t, it) => it.src || '', () => false, (f, s) => s);
  const c1 = sampleWithSub(fdd, t1, key(t1));
  assert.ok(t1.items.length > 8 && c1.indexOf('<div class="cols2">') === 0);
  assert.ok(c1.indexOf('<div>' + esc(t1.items[0].label) + '&nbsp;· <span class="sub">' + esc(t1.items[0].src) + '</span>: <span class="') >= 0, 'label · sub-line: call, on one line');
});

test('fdd-1 round 1: a three-way gate with fold: true folds on a phone; a sheet with startPage: "last" opens on its last page', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  // gateGrid folds a four-way gate always and a three-way gate only with fold: true
  const gg = new Function(ui.match(/function gateGrid\(gate\) \{[^\n]*\}/)[0] + '; return gateGrid;')();
  const opts = n => Array.from({ length: n }, (_, i) => ({ id: 'o' + i, label: 'O' + i }));
  assert.equal(gg({ options: opts(4) }), true);
  assert.equal(gg({ options: opts(3) }), false);
  assert.equal(gg({ options: opts(3), fold: true }), true);
  assert.equal(gg({ options: opts(2), fold: true }), false);
  assert.equal(!!gg(null), false);
  // the sheet that opens on its last page: marked by the renderer, paged by markScrollables through the shared pageLeft
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const fdd = read(path.join(DATA, 'levels', 'fdd-1.json'));
  const qoe = fdd.documents.filter(d => d.id === 'db-qoe')[0];
  assert.equal(qoe.startPage, 'last');
  assert.match(D.renderDocument(qoe, {}), /<div class="doc-scroll" data-start="last" tabindex="0"><table class="dt dt-sheet/);
  const plain = Object.assign({}, qoe); delete plain.startPage;
  assert.ok(D.renderDocument(plain, {}).indexOf('data-start') < 0, 'no mark without startPage');
  assert.match(ui, /el\.getAttribute\('data-start'\) === 'last' && !el\.hasAttribute\('data-started'\) && el\.clientWidth > 0/);
  assert.match(ui, /function pageLeft\(el\) \{/);
  assert.match(ui, /var to = lastPageLeft\(el\);\n\s+if \(to !== null && to > 0\) el\.scrollLeft = to;/);
  assert.match(ui, /function lastPageLeft\(el\) \{/);
  assert.match(ui, /el\.scrollTo\(\{ left: pageLeft\(el\), behavior: behavior \}\)/);
  // the validator: fdd-1 passes; wrong shapes are errors
  assert.deepEqual(L.validateLevel(fdd, { world }).errors, []);
  const fx = JSON.parse(JSON.stringify(fdd));
  fx.tasks[0].fields[0].fold = 'yes';
  fx.tasks[1].fields[0].fold = true;                       // a four-way gate folds anyway
  fx.documents.filter(d => d.id === 'bs')[0].startPage = 'last';   // a statement, not a sheet
  fx.documents.filter(d => d.id === 'db-nwc')[0].startPage = 'first';
  const e = L.validateLevel(fx, { world }).errors.join('\n');
  assert.equal((e.match(/fold must be true, on a three-option gate/g) || []).length, 2);
  assert.equal((e.match(/startPage must be "last", on a sheet/g) || []).length, 2);
});

test('for-1 round 1: the hunt search finds a figure as the row prints it; one test at a time; empty views name their filters; the misses lead the review', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('var WEEKDAY = '), ui.indexOf('function huntTask('));
  const H = new Function('E', 'app', src + '; return { huntRows: huntRows, huntKeys: huntKeys, huntBill: huntBill, huntFilterNames: huntFilterNames, HUNT_TESTS: HUNT_TESTS };')(E, { ui: { hunt: {} } });
  const lv = read(path.join(DATA, 'levels', 'for-1.json'));
  const task = lv.tasks.filter(t => t.type === 'hunt')[0], doc = lv.documents.filter(d => d.id === task.dataset)[0];
  const hs = q => ({ q: q, sort: 'orig', weekend: false, round: false, dups: false, flagged: false, match: false, limit: 60, pop: null, party: null });
  const ids = q => H.huntRows(lv, task, doc, hs(q), {}).rows.map(x => x.r._id);
  const byId = {}; doc.rows.forEach(r => { byId[r._id] = r; });
  // every answer row is found by its amount as the row prints it, grouped without ₹, and as raw digits
  Object.keys(task.answer).forEach(id => {
    const v = byId[id].amt, shown = E.formatINR(v, { decimals: 2 });
    [shown, shown.replace('₹', ''), String(v), shown.replace(/\.00$/, '')].forEach(q => assert.ok(ids(q).indexOf(id) >= 0, q + ' finds ' + id));
  });
  assert.ok(ids('60,000').length >= 1 && ids('₹60,000').indexOf(ids('60,000')[0]) >= 0);
  assert.equal(ids('1,56,609.60').length, 2, 'both payments of UFPL/26-27/1652');
  assert.ok(ids('02-10-2026').length >= 1 && ids('NPI 26-27 0471').indexOf('r365') >= 0, 'dates and text still found as typed (round 2: the bill typed either way finds both forms)');
  // the bill column: a round sum reads "no bill / ref", a duplicate its own typed bill
  const keys = H.huntKeys(task, doc);
  assert.equal(keys.bill, 'bill');
  const roundId = Object.keys(task.answer).filter(id => task.answer[id] === 'round')[0];
  assert.equal(H.huntBill(doc, keys, byId[roundId]), 'no bill / ref');
  assert.ok(Object.keys(task.answer).some(id => H.huntBill(doc, keys, byId[id]) === 'KEO-1184'));
  // an empty view names what is on
  assert.deepEqual(H.huntFilterNames(task, Object.assign(hs(' 02-10-2026 '), { dups: true, party: 'Pranjal Packaging Supplies' })),
    ['Duplicates', 'payments to Pranjal Packaging Supplies', 'the search “02-10-2026”']);
  assert.deepEqual(H.HUNT_TESTS, ['weekend', 'round', 'dups', 'match']);
  // one test at a time, and a test toggled drops the vendor filter; Clear filters resets all
  assert.ok(ui.indexOf("if (HUNT_TESTS.indexOf(k2) >= 0) { var hto = !hs[k2]; HUNT_TESTS.forEach(function (x) { hs[x] = false; }); hs[k2] = hto; hs.party = null; }") >= 0);
  assert.ok(ui.indexOf("case 'hunt-clear':") >= 0 && ui.indexOf('data-act="hunt-clear"') >= 0);
  // the reason box clears the sticky bar; Cancel and Escape put focus back on the row's Flag button
  assert.ok(ui.indexOf('if (rpop) revealAboveBar(rpop);') >= 0 && ui.indexOf('} else if (hwas) focusFlag(hwas);') >= 0);
  assert.ok(ui.indexOf("var rcan = $('.reason-pop [data-act=\"hunt-pop\"]');") >= 0);
  // the review: Missed, then Flagged but fine, then the finds (folded when anything is to be put right); no struck reason
  const rv = ui.slice(ui.indexOf("} else if (task.type === 'hunt') {", ui.indexOf('function taskReview(')), ui.indexOf('function modelSection('));
  assert.ok(rv.indexOf('>Missed</p>') < rv.indexOf('>Flagged, but fine</p>') && rv.indexOf('>Flagged, but fine</p>') < rv.indexOf('found-fold'));
  assert.ok(rv.indexOf('wrongSpan(') < 0, 'reason labels are never struck');
  // handing in a hunt with no flags: Keep working stays the main button; with flags the question names the count
  assert.ok(ui.indexOf('if (!nfl) { missing = 1;') >= 0);
  // the validator: keys name dataset columns, metaLabels are short words, wrap is true
  const fx = read(path.join(__dirname, 'fixtures', 'demo-level.json'));
  const hunt = fx.tasks.filter(t => t.type === 'hunt')[0];
  hunt.keys.bill = 'nope'; hunt.metaLabels = { vch: 'voucher number' };
  const errs = L.validateLevel(fx, { fixture: true }).errors.join('\n');
  assert.match(errs, /keys\.bill names nope, not a column of the dataset/);
  assert.match(errs, /metaLabels\.vch must be one short word/);
  assert.equal(lv.documents.filter(d => d.id === 'register')[0].columns.filter(c => c.key === 'narr')[0].wrap, true);
});

test('for-1 round 2: the hunt search finds a date as the calendar prints it or as people write it, a bill with its separators taken out, and the words a row line adds', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('var WEEKDAY = '), ui.indexOf('function huntTask('));
  const H = new Function('E', 'app', src + '; return { huntRows: huntRows, parseDate: parseDate, parseSearchDate: parseSearchDate };')(E, { ui: { hunt: {} } });
  const lv = read(path.join(DATA, 'levels', 'for-1.json'));
  const task = lv.tasks.filter(t => t.type === 'hunt')[0], doc = lv.documents.filter(d => d.id === task.dataset)[0];
  const hs = q => ({ q: q, sort: 'orig', weekend: false, round: false, dups: false, flagged: false, match: false, limit: 60, pop: null, party: null });
  const ids = q => H.huntRows(lv, task, doc, hs(q), {}).rows.map(x => x.r._id);
  // parseDate reads the whole month word ("October" read as "Octo" found no month)
  const ymd = d => d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-') : null;
  assert.equal(ymd(H.parseDate('2 October 2026')), '2026-10-2');
  assert.equal(ymd(H.parseDate('10 November 2026')), '2026-11-10');
  assert.equal(ymd(H.parseDate('29-Mar-2027')), '2027-3-29');
  assert.equal(ymd(H.parseDate('2 Sept 2026')), '2026-9-2');
  assert.equal(ymd(H.parseDate('12-07-2026')), '2026-7-12');
  assert.equal(H.parseDate('2 Octxyz 2026'), null);
  // the calendar's dates (it prints a no-break space after the day) and the way people write them, day first
  ['2 October 2026', '2 October 2026', '2 Oct', '2nd October', 'Friday 2 October 2026', '02/10/2026', '2/10/2026', '02.10.2026', '2.10'].forEach(q => assert.deepEqual(ids(q), ['r274'], q));
  ['10 November 2026', '7–11 November 2026', '7-11 November'].forEach(q => assert.deepEqual(ids(q), ['r329'], q));
  assert.deepEqual(ids('1 May 2026'), [], 'nobody posted on 1 May: the empty view is now a true finding');
  assert.deepEqual(H.parseSearchDate('October 2026'), { d1: 1, d2: 31, m: 9, y: 2026 });
  assert.equal(H.parseSearchDate('26-27'), null);
  assert.equal(H.parseSearchDate('1,56,609.60'), null);
  // a bill typed per Manav's rule (spaces, "/" and "-" taken out) finds both forms of it
  ['keo1184', 'KEO 1184', 'KEO/1184', 'KEO-1184'].forEach(q => assert.deepEqual(ids(q), ['r472', 'r473'], q));
  ['NPI/26-27/0471', 'npi26270471'].forEach(q => assert.deepEqual(ids(q), ['r339', 'r365'], q));
  // the words a row line adds: "by apexec02", "no bill / ref"
  assert.deepEqual(ids('no bill / ref'), ['r232', 'r301', 'r387', 'r441']);
  assert.ok(ids('by apexec02').length > 4 && ids('by apexec02').every(id => doc.rows.find(r => r._id === id).user === 'apexec02'));
  // every hunt answer row is found by its date as "d Month yyyy" and "dd/mm/yyyy", and by its bill with separators taken out
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  Object.keys(task.answer).forEach(id => {
    const row = doc.rows.find(r => r._id === id), d = H.parseDate(row.date);
    const p2 = n => String(n).padStart(2, '0');
    [d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(), p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear()].forEach(q => assert.ok(ids(q).indexOf(id) >= 0, q + ' finds ' + id));
    if (row.bill) assert.ok(ids(row.bill.replace(/[\s\/\-.]/g, '')).indexOf(id) >= 0, row.bill + ' stripped finds ' + id);
  });
  // the vendor line is a filter row with no separator (name, then "Show all"); the sort's first option names the export;
  // no flags: "You can’t add flags"
  assert.ok(ui.indexOf('<p class="hunt-party"><span>Payments to \' + esc(hs.party) + \'</span><button class="link-btn" data-act="hunt-party"') >= 0);
  assert.ok(ui.indexOf("[['orig', 'As exported']") >= 0);
  assert.ok(ui.indexOf("noteText = 'You can’t add ' + hn[1] + ' after this.'") >= 0);
});

test('ba-1 round 1: a wrong call is said back field by field in order with labels; what the call did not need is pencil; an item recalls the student’s own earlier figure', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const line = name => { const i = ui.indexOf('  function ' + name + '('); return ui.slice(i, ui.indexOf('\n', i)); };
  const span = (from, to) => ui.slice(ui.indexOf('  function ' + from + '('), ui.indexOf(to, ui.indexOf('  function ' + from + '(')));
  const src = [line('arr'), line('escNum'), span('gateField', '  function itemSummary('), span('fieldAnswerText', '  function mark('),
    span('recallNote', '  // The hints the student has paid')].join('\n');
  const U = new Function('E', 'esc', 'escLabel', src + '; return { itemAnswerHtml: itemAnswerHtml, recallNote: recallNote };')(E, D.esc, D.esc);
  const lv = read(path.join(DATA, 'levels', 'ba-1.json')), t2 = lv.tasks.find(t => t.id === 't2');
  const item = id => t2.items.find(it => it.id === id);
  const order = (html, parts) => { let at = -1; parts.forEach(p => { const i = html.indexOf(p, at + 1); assert.ok(i > at, 'in order: ' + p + '\n' + html); at = i; }); };
  // Rasal: SMA-2 at 85 days, when it is NPA at 116 from the part-paid EMI; the right test is in ink where it falls
  // (sa-6 round 4, designer optional 1: the main call is said "Your call:" on every row, as the all-right line says it)
  let h = U.itemAnswerHtml(t2, item('b03'), { cls: 'sma', sma: 'sma2', test: 'emi', days: '85' });
  order(h, ['Your call:', 'Not needed for <span class="nw">NPA</span>:', 'SMA-2', 'Which NPA class:', 'Sub-standard',
    'What decides it:</span> <span class="you-ok">Oldest instalment not fully paid (term loan)</span>', 'Days to 31 March:', '85', '116']);
  assert.ok(h.indexOf('Right:') < 0, 'no trailing unlabelled Right: line');
  // Kuruli: SMA-0 when it is standard; the excess and the 22 days are Subhajit's own findings, so pencil, not red
  h = U.itemAnswerHtml(t2, item('b11'), { cls: 'sma', sma: 'sma0', test: 'excess', days: '22' });
  order(h, ['Your call:', 'Not needed for <span class="nw">Standard</span>:</span> <span class="you-extra">', 'SMA-0', 'Balance above the drawing power or limit', '22']);
  assert.ok(h.indexOf('you-long') < 0, 'nothing in red but the call');
  // the call right, the tag wrong: each field on its own labelled line
  h = U.itemAnswerHtml(t2, item('b02'), { cls: 'sma', sma: 'sma2', test: 'excess', days: '49' });
  order(h, ['Your call:</span> <span class="you-ok">', 'Which SMA:', 'SMA-2', 'SMA-1', 'What decides it:</span> <span class="you-ok">', 'Days to 31 March:</span> <span class="you-ok">']);
  // all right: the one-line call, as before
  h = U.itemAnswerHtml(t2, item('b04'), { cls: 'std' });
  assert.ok(h.indexOf('Your call:</span> <span class="nw">Standard</span>') >= 0, h);
  // a reason flagged on a fine bill (a multi field) stays red under "You flagged:" (sa-1's meaning)
  const st = { id: 't', type: 'items', fields: [
    { id: 'v', kind: 'choice', label: 'Your call', gate: true, options: [{ id: 'ok', label: 'Fine' }, { id: 'ex', label: 'Exception' }] },
    { id: 'r', kind: 'multi', label: 'What’s wrong', showIf: { v: 'ex' }, options: [{ id: 'c', label: 'Cut-off' }] }] };
  h = U.itemAnswerHtml(st, { id: 'b1', answer: { v: 'ok' } }, { v: 'ex', r: ['c'] });
  order(h, ['Your call:', 'Fine', 'You flagged:</span> <span class="you-long">', 'Cut-off']);
  // recall: the student's own figure from task 1 (never the key), "not filled" when blank, nothing for an unknown cell
  const k = item('b11');
  h = U.recallNote(lv, k, { t1: { 'r10.you': '249.30' } });
  assert.ok(h.indexOf('Your drawing power from task 1') >= 0 && h.indexOf('<span class="nw">₹249.30 lakh</span>') >= 0, h);   // con-1 round 2: with its unit
  assert.ok(U.recallNote(lv, k, { t1: { 'r10.you': '304.2' } }).indexOf('₹304.2 lakh</span>') >= 0, 'the student’s own entry, as typed');
  assert.ok(U.recallNote(lv, k, {}).indexOf('not filled') >= 0);
  assert.equal(U.recallNote(lv, Object.assign({}, k, { recall: { task: 't1', cell: 'r99.you', label: 'x' } }), {}), '');
  assert.equal(U.recallNote(lv, item('b02'), { t1: { 'r10.you': '249.30' } }), '', 'an item without recall shows nothing');
  // the validator: recall names a worksheet input cell of an earlier task
  const bad = JSON.parse(JSON.stringify(lv)), bk = bad.tasks.find(t => t.id === 't2').items.find(it => it.id === 'b11');
  bk.recall.cell = 'r99.you';
  assert.match(L.validateLevel(bad, {}).errors.join('\n'), /recall names cell r99\.you, which is not an input cell of t1/);
  bk.recall = { task: 't3', cell: 'r10.you', label: 'x' };
  assert.match(L.validateLevel(bad, {}).errors.join('\n'), /recall names task t3, which is not a worksheet before t2/);
});

test('acc-1 round 1: a field’s lead (Dr, Cr) is said before its answer in the all-right line, the model key and the work sample; item labels hold dates and year ranges', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const leadText = new Function(ui.slice(ui.indexOf('function leadText('), ui.indexOf('\n', ui.indexOf('function leadText('))) + '; return leadText;')();
  assert.equal(leadText({ lead: 'Dr' }, 'Bank charges'), 'Dr Bank charges');
  assert.equal(leadText({}, 'Bank charges'), 'Bank charges', 'a field without lead is said as before');
  assert.ok(ui.indexOf('rights.push(leadText(f, fieldAnswerText(f, r.expected)));') >= 0, 'the all-right review line');
  assert.ok(ui.indexOf('return holdShort(leadText(f, fieldAnswerText(f, exp[f.id])));') >= 0, 'the model key');
  assert.ok(ui.indexOf('return leadText(f, fieldAnswerText(f, ia[f.id], true));') >= 0, 'the work sample detail');
  // the validator: one short word, on a choice or number field that is not the gate
  const acc = read(path.join(DATA, 'levels', 'acc-1.json'));
  const t2 = acc.tasks.find(t => t.id === 't2');
  assert.deepEqual(t2.fields.filter(f => f.lead).map(f => f.id + ':' + f.lead), ['dr:Dr', 'cr:Cr']);
  const bad = JSON.parse(JSON.stringify(acc)); bad.tasks.find(t => t.id === 't2').fields[0].lead = 'Debit side';
  assert.match(L.validateLevel(bad, { catalogue, world }).errors.join('\n'), /field call lead must be one short word/);
  // escLabel holds a year range; escText a whole date
  const src = ui.slice(ui.indexOf('function escNum('), ui.indexOf('function plural('));
  const f = new Function('esc', 'D', src + '; return { escLabel: escLabel, escText: escText };')(D.esc, D);
  assert.equal(f.escLabel('Depreciation 2026–27'), 'Depreciation <span class="nw">2026–27</span>');
  assert.ok(f.escText('Bills dated 06-04-2027').indexOf('<span class="nw">06-04-2027</span>') >= 0);
  // a worksheet review leaves a column label's "(₹)" off before a rupee figure
  assert.ok(ui.indexOf("var colLab = fmt === 'inr' ? String(cl.col.label).replace(/\\s*\\(₹\\)\\s*$/, '') : cl.col.label;") >= 0);
});

test('acc-1 round 2: the pencil "Not needed for" line says each field’s lead too; "Submit anyway?" makes Keep working the main button', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const line = name => { const i = ui.indexOf('  function ' + name + '('); return ui.slice(i, ui.indexOf('\n', i)); };
  const span = (from, to) => ui.slice(ui.indexOf('  function ' + from + '('), ui.indexOf(to, ui.indexOf('  function ' + from + '(')));
  const src = [line('arr'), line('escNum'), span('gateField', '  function itemSummary('), span('fieldAnswerText', '  function mark(')].join('\n');
  const U = new Function('E', 'esc', 'escLabel', src + '; return { itemAnswerHtml: itemAnswerHtml };')(E, D.esc, D.esc);
  const acc = read(path.join(DATA, 'levels', 'acc-1.json')), t2 = acc.tasks.find(t => t.id === 't2');
  const item = id => t2.items.find(it => it.id === id);
  // Varun's salary entry passed on item 6: the pencil line says which account was debited and which credited
  const h = U.itemAnswerHtml(t2, item('i6'), { call: 'entry', dr: 'salaries', cr: 'salpay', amt: '396000' }).replace(/\u00a0|&nbsp;/g, ' ');
  assert.ok(h.indexOf('Not needed for <span class="nw">No entry</span>:</span> <span class="you-extra">Dr Salaries and wages · <span class="nw">Cr Salary payable</span> · ') >= 0, h);
  assert.ok(h.indexOf('₹3,96,000') > h.indexOf('Cr Salary payable'), h);
  // a field without a lead (ba-1's pencil line) is said as before: covered by the ba-1 round 1 test above
  // the final submit with work open: Keep working is the main (blue) button and keeps the focus; Submit anyway is secondary
  const sm = ui.slice(ui.indexOf('  function openSubmitModal('), ui.indexOf('  function openHandInModal('));
  assert.ok(sm.indexOf('<button class="btn btn-primary" data-act="modal-close"') >= 0, 'Keep working is the main button');
  assert.ok(sm.indexOf('<button class="btn btn-secondary" data-act="submit-force">Submit anyway</button>') >= 0, 'Submit anyway is secondary');
  assert.ok(sm.indexOf("el.querySelector('[data-act=\"modal-close\"]'); if (b) b.focus();") >= 0, 'focus stays on Keep working');
});

test('mat-1 round 1: a note’s "# " first line prints as its title; a choice chip stands on the list of a task with no main call; play.mjs checks a no-call item says each answer with its question', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  // designer optional 3: only the template's own first line, and only when the template starts "# "
  const noteTitle = new Function(ui.slice(ui.indexOf('function noteTitle('), ui.indexOf('function composeTask(')) + '; return noteTitle;')();
  assert.equal(noteTitle({ template: '# Title &amp; more\n{a}' }, '# Title &amp; more\nLine'), '<b class="pn-title">Title &amp; more</b>\nLine');
  assert.equal(noteTitle({ template: '# T' }, '# T'), '<b class="pn-title">T</b>');
  assert.equal(noteTitle({ template: 'Sir,\n{_free}' }, '# my own line'), '# my own line', 'a student’s line is never a title');
  assert.equal(noteTitle({ template: '{a}' }, 'Plain'), 'Plain');
  // ba-1 round 3: the work sample's note also holds its hyphenated words (holdHyphens over escText)
  assert.equal((ui.match(/noteTitle\((task|t), (?:holdHyphens\()?escText\(E\.composeText\(/g) || []).length, 3, 'the review, the model answer and the work sample');
  assert.ok(/return noteTitle\(task, html\.split/.test(ui), 'and the live note');
  assert.ok(/\.pn-title \{ font-weight: 800;/.test(css));
  // designer optional 1: chip: true on a choice field of a task with no main call; anywhere else the validator refuses it
  assert.ok(/fl\.kind === 'choice' && fl\.chip === true/.test(ui) && /else if \(chipC && ia\[chipC\.id\] && E\.fieldVisible\(chipC, ia\)\)/.test(ui));
  const lv = read(path.join(DATA, 'levels', 'mat-1.json'));
  assert.deepEqual(L.validateLevel(lv, { world, catalogue }).errors, []);
  const t2 = lv.tasks.find(t => t.id === 't2');
  assert.ok(t2.fields.find(f => f.id === 'head').chip === true);
  t2.fields.find(f => f.id === 'extra').chip = true;
  assert.match(L.validateLevel(lv, { world, catalogue }).errors.join('\n'), /only one field may carry chip/);
  delete t2.fields.find(f => f.id === 'extra').chip;
  t2.fields[0].gate = true;
  assert.match(L.validateLevel(lv, { world, catalogue }).errors.join('\n'), /field head chip must be true, on a number field \(or a choice field of a task with no main call\)/);
  // designer S3: play.mjs fails an all-right item of a no-call task whose line lacks a label per field
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(/an all-right item with no main call says an answer without its question/.test(play));
});

test('sa-7 round 1: a slot links its paper, a long composed text counts its picks, Keep working goes to the first open slot, Close returns to where the viewer opened, a sheet subtitle warns', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  // designer S2: the link under each slot that names its paper (phone: the viewer; desktop: the pane), and the viewer's
  // Close lands back where it was opened
  assert.ok(/function slotPapers\(lv, task, s\)/.test(ui) && /slotPapers\(lv, task, s\) \+ '<div class="opts">'/.test(ui));
  assert.ok(/app\.leftViewer = !!prevKey && \/\\\/docs\\\/\\d\*\$\/\.test\(prevKey\)/.test(ui) && /var closing = up && app\.leftViewer && saved !== undefined;/.test(ui));
  assert.ok(/\.slot-paper \{ display: inline-flex;[^}]*min-height: 44px;/.test(css));
  // designer S3: the count above six slots or more, and Keep working to the first open slot
  const openSlots = new Function(ui.slice(ui.indexOf('function openSlots('), ui.indexOf('function composeTask(')).replace(/function qTextClass[\s\S]*$/, '') + '; return openSlots;')();
  const t = { slots: [{ id: 'a', options: [{ id: 'x' }] }, { id: 'b', options: [{ id: 'y' }] }, { id: 'c', options: [{ id: 'z' }] }] };
  assert.deepEqual(openSlots(t, { a: 'x', b: 'nope' }).map(s => s.id), ['b', 'c'], 'a pick that is no option of the slot is still open');
  assert.ok(/if \(\(task\.slots \|\| \[\]\)\.length < 6\) return '';/.test(ui) && /data-goto="slot-/.test(ui) && /function goToSlot\(id\)/.test(ui));
  assert.ok(/Keep working on task ' \+ ti \+ ' with open slots does not go to the first open one/.test(play) && /’s paper link opened/.test(play));
  // the validator: a slot's papers must be shown by its task; a sheet's subtitle is never printed
  const lv = read(path.join(DATA, 'levels', 'sa-7.json'));
  const ok = L.validateLevel(lv, { catalogue, world });
  // consistency pass round 2: P2-02 gave every long choice question a `sample`, so sa-7 is back to no warning at all
  assert.deepEqual(ok.errors, []); assert.deepEqual(ok.warns, []);
  const bad = JSON.parse(JSON.stringify(lv));
  bad.tasks.find(x => x.id === 't3').slots[0].docs = ['sad'];
  assert.match(L.validateLevel(bad, { catalogue, world }).errors.join('\n'), /slot c2 names paper sad, which the task does not show/);
  bad.documents.find(d => d.id === 'dues').subtitle = 'From the register';
  assert.match(L.validateLevel(bad, { catalogue, world }).warns.join('\n'), /subtitle is not printed on a sheet/);
  // designer optional 7: a long question in semibold
  assert.ok(/\.q-card \.q-text\.q-long \{ font-weight: 600; \}/.test(css));
});

test('sa-7 round 2: a frozen sheet’s wrapped column follows the phone; a clause reference never splits; Keep working brings a slot’s heading with it', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  // designer S1: 15em on a frozen sheet everywhere, then, on a sheet without pinFit (whose pinned column keeps its full
  // width), 11.5em on a phone (the container and the media query twin) and 9.5em under 380 px, each after the base rule;
  // a pinFit sheet keeps 15em (narrowing it made for-1's 500-row register a third taller)
  const base = css.indexOf('.doc .dt-sheet th.wrap, .doc .dt-sheet td.wrap { min-width: 15em; }');
  assert.ok(base > 0);
  const phone = [...css.matchAll(/\.doc \.dt-sheet:not\(\.pin-fit\) th\.wrap, \.doc \.dt-sheet:not\(\.pin-fit\) td\.wrap \{ min-width: 11\.5em; \}/g)].map(m => m.index);
  assert.equal(phone.length, 2); assert.ok(phone.every(i => i > base));
  assert.ok(css.lastIndexOf('@container (max-width: 480px) {', phone[0]) > base && css.lastIndexOf('@media (max-width: 520px) {', phone[1]) > phone[0]);
  const narrow = css.indexOf('.doc .dt-sheet:not(.pin-fit) th.wrap, .doc .dt-sheet:not(.pin-fit) td.wrap { min-width: 9.5em; }');
  assert.ok(narrow > phone[1] && css.lastIndexOf('@media (max-width: 380px) {', narrow) > phone[1]);
  // designer S2: the hand-in box joins each reference with a word joiner (U+2060), so "(xiv)(a)" never splits
  const refsLine = ui.slice(ui.indexOf('var refs = open.map('), ui.indexOf('\n', ui.indexOf('var refs = open.map(')));
  const refsOf = new Function('open', refsLine + '; return refs;');
  const lv = read(path.join(DATA, 'levels', 'sa-7.json')), t3 = lv.tasks.find(x => x.id === 't3');
  const r = refsOf(t3.slots.filter(s => ['c8', 'c10', 'c11'].indexOf(s.id) >= 0));
  assert.deepEqual(r, ['(xi)⁠(a)', '(xiv)⁠(a)', '(xxi)']);
  assert.equal(D.esc(r[1]), '(xiv)⁠(a)', 'esc keeps the joiner');
  // ... and as a pattern: a clause reference with no section number stays whole on screen (escText) and in a paper
  // (ws-docs nwSections), while a section number is held as before and a lone "(x)" or "(a)" is left alone
  const escText = new Function('esc', 'D', ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle(')) + '; return escText;')(D.esc, D);
  assert.equal(escText('reported under (xi)(a) above'), 'reported under <span class="nw">(xi)(a)</span> above');
  assert.equal(D.nwSections(D.esc('(i)(a), (i)(c) · (iii) to (vi) · (ix)(b) to (f) · (x)')),
    '<span class="nw">(i)(a)</span>, <span class="nw">(i)(c)</span> · (iii) to (vi) · <span class="nw">(ix)(b)</span> to (f) · (x)');
  assert.equal(D.nwSections(D.esc('paragraph 3(vii)(a): and section 143(1)(a)')), 'paragraph <span class="nw">3(vii)(a)</span>: and section <span class="nw">143(1)(a)</span>');
  assert.equal(escText('CARO 2020, paragraph 3(ii)(b)'), 'CARO 2020, paragraph <span class="nw">3(ii)(b)</span>');
  // designer optional 1: Keep working scrolls a slot's own heading into view with it, the first option still focused
  const go = ui.slice(ui.indexOf('function goToSlot('), ui.indexOf('function closeModal('));
  assert.match(go, /var head = !self && fs\.previousElementSibling;\s*if \(head && head\.classList\.contains\('slot-head'\)\) box = head;/);
  assert.match(go, /fs\.querySelector\('input:not\(\[disabled\]\)'\)/);
});

test('sa-7 round 4: an empty slot whose reference the template already prints shows only its name; sa-7 holds every legal reference to its number outside the papers and the line', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  // designer optional 1: "(i)(b) {c2}" with the slot unfilled read "(i)(b) (i)(b) · Physical verification"
  const src = ui.slice(ui.indexOf('function gapSlot('), ui.indexOf('\n  }\n', ui.indexOf('function gapSlot(')) + 4);
  const gapSlot = new Function(src + '; return gapSlot;')();
  const s = { id: 'c2', label: '(i)(b) · Physical verification' };
  assert.equal(gapSlot(s, ', we state that:\n\n(i)(b) ').label, 'Physical verification');
  assert.equal(gapSlot(s, '\n\n(ii)(b) '), s, 'another clause before it: the whole label');
  assert.equal(gapSlot(s, 'see 3(i)(b) '), s, 'the reference only as the end of a longer word: the whole label');
  assert.equal(gapSlot(s, '\n\n'), s, 'no reference before it: the whole label');
  const t = { id: 'msme', label: 'MSME-1 · October to March' };
  assert.equal(gapSlot(t, 'cheque was written back. '), t, 'cl-1’s gaps keep their labels');
  const w = { id: 'x', label: 'Why' };
  assert.equal(gapSlot(w, 'Why '), w, 'a label without " · " is never cut');
  const cp = ui.slice(ui.indexOf('function composePreview('), ui.indexOf('function noteTitle('));
  assert.ok(cp.indexOf('.map(function (part, k, parts) {') >= 0 && cp.indexOf('if (!o) slot = gapSlot(slot, parts[k - 1]);') >= 0, 'the live note passes the words before each slot');
  // only sa-7's template prints a slot's reference just before the slot, so no other level's empty draft changes
  levelFiles.forEach(f => {
    const lv = read(path.join(DATA, 'levels', f));
    (lv.tasks || []).filter(x => x.type === 'compose' && x.template).forEach(x => {
      const parts = x.template.split(/(\{[\w-]+\})/);
      for (let k = 1; k < parts.length; k += 2) {
        const sl = (x.slots || []).find(y => y.id === parts[k].slice(1, -1));
        if (sl && gapSlot(sl, parts[k - 1]) !== sl) assert.equal(lv.id, 'sa-7', f + ' ' + sl.id);
      }
    });
  });
  // designer S1: outside the papers and the earned clause, no reference word ends a line apart from its number
  const lv = read(path.join(DATA, 'levels', 'sa-7.json'));
  const outside = JSON.stringify(Object.fromEntries(Object.entries(lv).filter(([k]) => k !== 'documents' && k !== 'earned'))) + JSON.stringify(lv.documents.map(d => d.title));
  assert.ok(!/(?<![\w-])(Forms?|[Ss]ections?|[Rr]ules?|SA|[Pp]aragraphs?|[Nn]otes?|[Cc]lauses?) [\dA-Z(]/.test(outside), 'every reference holds');
  ['section 138', 'section 143(12)', 'Form ADT-4', 'Form 35', 'clause (xxi)', 'SA 320', 'note 38'].forEach(x => assert.ok(outside.indexOf(x) >= 0, x));
  assert.ok(JSON.stringify(lv.earned).indexOf(' ') < 0, 'the line a student copies has no no-break space');
  // editor S1, facts S1: the full wrap says nothing of the opinion, which can be wrong on a 3-star path
  assert.ok(lv.wrap.text.indexOf('opinion') < 0);
});

test('mat-1 round 2: a worksheet box holding text that is no figure is flagged under the box, said apart at the hand-in, and Keep working goes to it', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  // the worksheet as the app draws it (browser-only file): its own functions, evaluated with the engine and esc
  const cut = (a, b) => { const i = ui.indexOf(a), j = ui.indexOf(b, i); assert.ok(i >= 0 && j > i, a); return ui.slice(i, j); };
  const src = [cut('function escNum(', 'function escTitle('), cut('function signButton(', 'function syncSign('),
    cut('function wsField(', 'function refreshItemBar('), cut('function cellAffix(', '/* choice */'), cut('function missLine(', 'function openSubmitModal(')].join('\n');
  const W = new Function('E', 'esc', 'D', src + '; return { worksheet: worksheet, missLine: missLine, wsField: wsField, wsUnread: wsUnread, wsFirstOpen: wsFirstOpen };')(E, D.esc, D);
  const lv = read(path.join(DATA, 'levels', 'mat-1.json')), t3 = lv.tasks.find(x => x.id === 't3');
  const a = {}; E.inputCells(t3).forEach(c => { a[c.key] = String(c.cell.answer); });
  a['sv.amt'] = '0.22 crore'; delete a['c2.amt'];
  const html = W.worksheet(lv, t3, a);
  // designer S1: the box is flagged (aria-invalid, named note shown, the cell laid out for it); a right box is not
  assert.ok(html.indexOf('<input id="ws-t3-sv-amt" ') >= 0 && /data-key="sv\.amt" aria-invalid="true" aria-describedby="ws-t3-sv-amt-bad">/.test(html));
  assert.ok(html.indexOf('<p class="f-bad" id="ws-t3-sv-amt-bad">' + t3.invalidNote + '</p>') >= 0, 'the task’s note shows under the box');
  assert.ok(/<td class="r ws-bad" data-label="[^"]*"><div class="num">(?:(?!<\/td>).)*id="ws-t3-sv-amt"/.test(html));
  assert.ok(html.indexOf('<p class="f-bad" id="ws-t3-a1-amt-bad" hidden>') >= 0 && !/data-key="a1\.amt" aria-invalid/.test(html));
  assert.ok(html.indexOf('<p class="f-bad" id="ws-t3-c2-amt-bad" hidden>') >= 0, 'an empty box is not flagged');
  // the hand-in counts it apart from the empty ones, and Keep working goes to it first, then to the first empty box
  assert.deepEqual(W.wsUnread(t3, a).map(c => c.key), ['sv.amt']);
  assert.equal(W.wsFirstOpen(t3, a), 'ws-t3-sv-amt');
  assert.equal(W.wsFirstOpen(t3, Object.assign({}, a, { 'sv.amt': '0.22' })), 'ws-t3-c2-amt');
  assert.equal(W.wsFirstOpen(t3, Object.assign({}, a, { 'sv.amt': '0.22', 'c2.amt': '8.80' })), null);
  const noun = E.nounFor(t3);
  assert.equal(W.missLine({ type: 'worksheet', missing: 2, bad: 1, noun }), '1 figure can’t be read. 1 figure still empty.');
  assert.equal(W.missLine({ type: 'worksheet', missing: 2, bad: 2, noun }), '2 figures can’t be read.');
  assert.equal(W.missLine({ type: 'worksheet', missing: 2, bad: 0, noun }), '2 figures still empty.');
  assert.equal(W.missLine({ type: 'worksheet', missing: 1, noun: ['cell', 'cells'] }), '1 cell still empty.', 'as before without a flagged box');
  // a cell's own word unit is taken off as an item box's is (ba-1: "12.5 lakh" reads 12.5); other text stays and is flagged
  const ba = read(path.join(DATA, 'levels', 'ba-1.json')), lakh = E.inputCells(ba.tasks.find(x => x.type === 'worksheet')).find(c => c.cell.unit === 'lakh');
  assert.equal(E.readTyped(W.wsField(lakh.cell), '12.5 lakh'), '12.5');
  assert.ok(E.numberInvalid(W.wsField(lakh.cell), E.readTyped(W.wsField(lakh.cell), '12.5 crore')));
  // a default note fits the column's kind of figure when the level gives none
  const sa1 = read(path.join(DATA, 'levels', 'sa-1.json')), w1 = sa1.tasks.find(x => x.type === 'worksheet'), k1 = E.inputCells(w1)[0].key;
  assert.ok(W.worksheet(sa1, w1, { [k1]: '1 crore' }).indexOf('>Type a number only, like 1,25,000</p>') >= 0);
  // the box is read and flagged on leaving it, and the flag clears as soon as it reads as a figure
  assert.ok(/var f = numberField\(el\) \|\| wsFieldOf\(el\), v = f \? E\.readTyped\(f, el\.value\) : el\.value;/.test(ui));
  assert.ok(/if \(el\.getAttribute\('aria-invalid'\) === 'true' && el\.hasAttribute\('data-ws'\)\)/.test(ui));
  assert.ok(/\.ws td \.f-bad \{ white-space: normal;/.test(css) && /\.ws-wrap:not\(\.ws-grid\):not\(\.ws-one\) > \.ws td\.ws-bad \{ display: grid;/.test(css));
  assert.ok(/was not flagged under its box/.test(play) && /does not say a flagged box can’t be read/.test(play) && /does not go to the flagged box/.test(play));
  // the validator: a task's or a cell's note is one short line
  const ok = L.validateLevel(lv, { catalogue, world });
  assert.deepEqual(ok.errors, []); assert.deepEqual(ok.warns, []);
  const bad = JSON.parse(JSON.stringify(lv)), bt = bad.tasks.find(x => x.id === 't3');
  bt.invalidNote = 'Type the figure only, in ₹ crore to two decimals, like 1.25, and nothing after it'; bt.rows.find(r => r.id === 'a1').cells.amt.invalidNote = 7;
  const errs = L.validateLevel(bad, { catalogue, world }).errors.join('\n');
  assert.match(errs, /\(t3\): invalidNote must be a line of 60 characters or fewer/);
  assert.match(errs, /cell a1\.amt invalidNote must be a line of 60 characters or fewer/);
});

test('con-1 round 2: a figure keeps its unit word and a clock time stays whole, on screen and in a paper; "₹ lakh" with no figure is left alone; a worksheet progress line speaks in its noun; play.mjs checks the split', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle('));
  const escText = new Function('esc', 'D', src + '; return escText;')(D.esc, D);
  const nw = x => '<span class="nw">' + x + '</span>';
  const v = escText('No. They added ₹574.60 lakh at ₹442 each; the cut gave away ₹1,094.50 lakh and the line made ₹27 crore less.');
  [nw('₹574.60 lakh'), nw('₹442'), nw('₹1,094.50 lakh'), nw('₹27 crore')].forEach(x => assert.ok(v.indexOf(x) >= 0, x));
  const c = escText('Agnika sold 1.3 lakh more cookers, ₹55 × 19.9 lakh; to me by 5 pm, the mail of 7:15 pm; a fall of −2,693.40 lakh; 2–3 lakh cookers; EV ₹109–142 crore');
  [nw('1.3 lakh'), nw('19.9 lakh'), nw('5 pm'), nw('7:15 pm'), nw('−2,693.40 lakh'), nw('2–3 lakh'), nw('₹109–142 crore'), nw('₹55')].forEach(x => assert.ok(c.indexOf(x) >= 0, x));
  assert.ok(c.indexOf('<span class="nw"><span') < 0 && c.indexOf('</span></span>') < 0, 'no span inside a span');
  // "₹ lakh" and "₹ lakh" (a column's unit) hold no figure, a word that only starts with a unit is no unit, and the
  // CV line still holds its crore amount and its month
  const left = escText('which is −1,094.50 in ₹ lakh, a ₹ lakh box, 12 amps and I am here');
  assert.ok(left.indexOf('<span') < 0, left);
  const line = escText('Consulting Work Simulation, MSC Articleship Program | Oct 2026: Built a bridge and traced a ₹26.9 crore fall in its profit');
  [nw('₹26.9 crore'), nw('Oct 2026')].forEach(x => assert.ok(line.indexOf(x) >= 0, x));
  // a paper holds them too (the CFO's mail), and keeps its other holds
  const chain = t => D.nwSections(D.nwDates(D.nwUnits(D.nwRanges(D.nwParts(D.nwCodes(D.esc(t)))))));
  const mail = chain('we sold 1.3 lakh more cookers last year and the line made ₹27 crore less. Thu, 3 Dec 2026, 7:15 pm; ₹150–250 crore; −₹5 lakh; KS/2026-27/4418; 29-03-2027');
  [nw('1.3 lakh'), nw('₹27 crore'), nw('7:15 pm'), nw('₹150–250 crore'), nw('−₹5 lakh'), nw('KS/2026-27/4418'), nw('29-03-2027')].forEach(x => assert.ok(mail.indexOf(x) >= 0, 'paper: ' + x));
  assert.ok(chain('a ₹ lakh column, 2025-26 lakh, x-5 lakh').indexOf('<span') < 0, 'paper: no figure, no hold');
  const doc = D.renderDocument({ id: 'm', type: 'letter', style: 'email', title: 'Mail', body: ['We sold 1.3 lakh more cookers and made ₹27 crore less.'] }, {});
  assert.ok(doc.indexOf(nw('1.3 lakh')) >= 0 && doc.indexOf(nw('₹27 crore')) >= 0, 'a rendered mail holds them');
  // the worksheet progress line says the task's own noun, as its hand-in box does
  assert.ok(ui.indexOf("' cells filled'") < 0 && ui.indexOf('function wsProgText(task, p)') >= 0, 'progress line by noun');
  assert.deepEqual(E.nounFor({ type: 'worksheet' }), ['cell', 'cells']);
  // play.mjs reports a figure that ends a line apart from its unit word
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(play.indexOf('unitBreaks') >= 0 && play.indexOf('a figure ends a line apart from its unit word') >= 0);
});

test('gst-1 round 4: the work sample holds each worksheet figure whole, and a short call on an items line', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const start = ui.indexOf('function sampleTask(');
  const ws = ui.slice(ui.indexOf("if (t.type === 'worksheet')", start), ui.indexOf("if (t.type === 'choice')", start));
  // an input cell and a printed number cell: the sign never breaks off its figure on the phone preview ("–" / "₹1,80,06,000")
  assert.ok(ws.indexOf("(g === null ? '–' : '<span class=\"nw\">' + esc(E.formatCell(g, v.format || c.format, E.cellSigned(c, v))) + '</span>')") >= 0, 'input cell held');
  assert.ok(ws.indexOf("'<span class=\"nw\">' + esc(E.formatCell(v, c.format, E.cellSigned(c, v))) + '</span>' : escText(v || '')") >= 0, 'number cell held');
  assert.ok(!/esc\(g === null \? '–' : E\.formatCell/.test(ws), 'no unheld input figure left');
  // the items sample's call of 18 characters or fewer ("Chakan · October") stays on one line
  const items = ui.slice(start, ui.indexOf("if (t.type === 'worksheet')", start));
  assert.ok(items.indexOf("callCls(x) + (String(x.call).length <= 18 ? ' nw' : '')") >= 0, 'short call held');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.match(css, /\.nw \{ white-space: nowrap; \}/);
});

test('sa-1 round 5: the work sample holds years; round seals fit their words; two annotations at one place warn; "Up next" after a pass; a heading line never starts with a dot', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  // designer S1: the items sample's detail, sub-line and note go through escText, which holds "2026–27"
  const start = ui.indexOf('function sampleTask(');
  const items = ui.slice(start, ui.indexOf("if (t.type === 'worksheet')", start));
  assert.ok(!/escNum\(x\.det\)|escNum\(sub\)|esc\(x\.note\)/.test(items), 'no escNum or bare esc left on the items sample');
  // ba-1 round 3 (designer S1): the detail also holds its hyphenated words (holdHyphens over escText)
  assert.ok(items.indexOf("' (' + holdHyphens(escText(x.det)) + ')'") >= 0 && items.indexOf("'<td>' + holdHyphens(escText(x.det))") >= 0, 'detail held in both layouts');
  // designer S2: every round seal is measured and fitted, after each render and before printing
  assert.match(ui, /var SEAL_MIN = 104, SEAL_MAX = 148, SEAL_AIR = 14;/);
  assert.ok(/function afterRender\(isNav\) \{[\s\S]{0,120}fitSeals\(document\);/.test(ui), 'fitted after each render');
  assert.match(ui, /addEventListener\('beforeprint', function \(\) \{ fitSeals\(document\);/);
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(play.indexOf('a round stamp’s words run over its ring') >= 0, 'play.mjs fails a seal whose words cross its ring');
  assert.ok(play.indexOf("ps = 'work-sample (print)'") >= 0, 'play.mjs scans the printed sample for split years');
  // designer S5: "Start here" only before any pass
  assert.ok(ui.indexOf("mode === 'retry' ? 'Try again' : anyPassed ? 'Up next' : 'Start here'") >= 0, 'Up next after a pass');
  assert.ok(ui.indexOf('var anyPassed = E.visibleLevels(app.cat, PREVIEW).some(function (l) { return E.passed(ls(l.id)); });') >= 0);
  // designer S3: two annotations at one named place (or at the same default place) warn; sa-1 itself is clean
  const sa1 = read(path.join(DATA, 'levels', 'sa-1.json'));
  const inv3 = sa1.documents.find(d => d.id === 'inv-03');
  assert.equal(inv3.annotations.filter(a => a.at === 'bottom-right').length, 1, 'Bill 3 has one annotation at bottom-right');
  const bad = JSON.parse(JSON.stringify(sa1));
  bad.documents.find(d => d.id === 'inv-03').annotations.forEach(a => { if (a.kind === 'stamp' && a.shape !== 'round' && /ENTERED/.test(a.text)) a.at = 'bottom-right'; });
  assert.match(L.validateLevel(bad, { catalogue, world }).warns.join('\n'), /inv-03.*two annotations at bottom-right/);
  const dflt = JSON.parse(JSON.stringify(sa1));
  dflt.documents.find(d => d.id === 'inv-01').annotations = [{ kind: 'hand', text: 'OK' }, { kind: 'tick', text: 'GRN' }];
  assert.match(L.validateLevel(dflt, { catalogue, world }).warns.join('\n'), /two annotations at bottom-right/, 'a left-out place counts as the renderer’s default');
  const inline = JSON.parse(JSON.stringify(sa1));
  inline.documents.find(d => d.id === 'inv-01').annotations = [{ kind: 'hand', text: 'A', at: 'inline' }, { kind: 'hand', text: 'B', at: 'inline' }, { kind: 'stamp', text: 'C', at: '20%,30%' }, { kind: 'stamp', text: 'D', at: '20%,30%' }];
  assert.ok(!/two annotations at/.test(L.validateLevel(inline, { catalogue, world }).warns.join('\n')), 'inline and x%,y% places are not checked');
  // designer S6: a register heading's middot holds to the word before it, so no line starts with "·"
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const gate = sa1.documents.find(d => d.id === 'gate-register');
  const html = D.renderDocument(gate, {});
  assert.ok(html.indexOf('Tamhini Drivetech Private Limited · Main gate') >= 0, 'company line holds its dot');
  assert.ok(!/Limited · Main gate/.test(html));
  const reg = D.renderDocument({ id: 'r', type: 'table', style: 'register', title: 'T', heading: 'Stock register · Bay A', subtitle: 'Extract · April', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x · y' }] }, {});
  assert.ok(reg.indexOf('Stock register · Bay A') >= 0 && reg.indexOf('Extract · April') >= 0, 'heading and subtitle hold their dots');
  // sa-1's ENTERED stamps are two lines, so a 360 px phone has room for the stamp and the vendor's seal side by side
  const entered = [].concat(...sa1.documents.map(d => (d.annotations || []).filter(a => /ENTERED/.test(a.text || ''))));
  assert.ok(entered.length >= 8 && entered.every(a => /^ENTERED\nVCH \d{4}$/.test(a.text)), 'every ENTERED stamp is “ENTERED” over its voucher number');
});

test('sa-1 round 5 optionals: the item hint button names the task; a toast over a button moves under the top bar; a sample with misses says it prints them', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  // designer optional 3: on an item's screen the hint is the task's
  assert.ok(ui.indexOf("(shown ? 'Another hint' : 'Hint') + (onItem ? ' for this task' : '') + ' (costs a star)</button>'") >= 0, 'hint label');
  assert.ok(ui.indexOf('hintButton(lv, task, true)') >= 0, 'item screen asks for the task wording');
  // designer optional 2: "Added to your CV" never sits on "Next level"
  const toast = ui.slice(ui.indexOf('function showToast('), ui.indexOf('function copyText('));
  assert.ok(toast.indexOf("t.className += ' toast-top'") >= 0 && /getBoundingClientRect/.test(toast), 'toast measured against the buttons under it');
  assert.match(css, /\.toast\.toast-top \{ bottom: auto; top: calc\(var\(--top\) \+ 10px/);
  // designer optional 4: a pass with misses prints them as given; the line is screen only (print shows only the sheet)
  assert.ok(ui.indexOf("(E.pctShown(res.accuracy) < 100 ? '<p class=\"locked-note sample-note\">' + esc(COPY.sampleMisses) + '</p>' : '')") >= 0, 'sample note');
  assert.match(ui, /sampleMisses: 'This prints your answers as you gave them, wrong ones too\./);
  assert.match(css, /\.sample-page > \*:not\(\.sheet-frame\) \{ display: none !important; \}/);
});

test('gst-1 round 5 (designer optional 1): a status toast never swallows a tap meant for the button under it', () => {
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const rule = (css.match(/^\.toast \{[^}]*\}/m) || [''])[0];
  assert.ok(rule && /pointer-events: none;/.test(rule), '.toast lets taps through');
});

test('sa-1 round 6 (designer S1, S2 and optional 2): papers hold Udyam numbers, numbers that end in their year, "Code: 27" and a day with its month; play.mjs reports them', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const N = x => '<span class="nw">' + x + '</span>';
  const chain = t => D.nwSections(D.nwDates(D.nwUnits(D.nwRanges(D.nwParts(D.nwCodes(D.esc(t)))))));
  // S1: a 7-digit Udyam serial is one code ("UDYAM-MH-26-" / "0906352" on Kudalwadi's bill at 390 and 360)
  assert.ok(chain('Udyam Reg. No. UDYAM-MH-26-0906352').indexOf(N('UDYAM-MH-26-0906352')) >= 0, 'Udyam number held');
  // S1: a slash number that ends in its year is held whole up to 16 characters; a longer one keeps its year whole
  // with the break chance at the slash before it; a number with a group after its year is unchanged
  const dn = chain('your invoice RF/2291/26-27 dt 26.03.2027; PSG/DN/014/26-27; ABCDEF/GHIJ/0938/2026-27; KF/PO/26-27/0455; TD/PO/CAP/2026-27/004');
  [N('RF/2291/26-27'), N('PSG/DN/014/26-27'), 'ABCDEF/GHIJ/0938/<wbr>' + N('2026-27'), N('KF/PO/26-27/0455'), 'TD/PO/CAP/<wbr>' + N('2026-27') + '/004'].forEach(x => assert.ok(dn.indexOf(x) >= 0, x));
  ['HTS/CAL/27/0031', 'post 15/4', 'books for 2026-27'].forEach(x => assert.equal(D.nwDates(D.esc(x)), D.esc(x), x + ' is untouched'));
  // S1: the state code never hangs apart from its label, in the supplier block and in a party block
  const inv = D.renderDocument({ id: 'i', type: 'invoice', title: 'Bill', number: 'X/1', date: '01-04-2027', tax: 'intra', total: 118, amountInWords: 'INR One Hundred Eighteen Only',
    supplier: { name: 'S', state: 'Maharashtra', stateCode: '27' }, buyer: { name: 'B', state: 'Maharashtra', stateCode: '27' }, lines: [{ desc: 'x', hsn: '7318', qty: 1, unit: 'nos', rate: 100, taxable: 100, gstRate: 18 }] }, {});
  assert.equal((inv.match(/, Code:&nbsp;27/g) || []).length, 2, 'Code: 27 held twice');
  assert.ok(inv.indexOf(', Code: 27') < 0);
  // S2: in a paper, a day keeps its month (and its year when one follows), as escText holds it in the notes
  const mo = chain('Annual rate contract, 1 April 2026; own stock on 26 September. Days to 31 Mar; Thu, 3 Dec 2026, 7:15 pm');
  [N('1 April 2026'), N('26 September'), N('31 Mar'), N('3 Dec 2026'), N('7:15 pm')].forEach(x => assert.ok(mo.indexOf(x) >= 0, x));
  assert.ok(chain('2 Mayank, 10 Decimal, 5 Sept').indexOf('<span') < 0, 'no month, no hold');
  // optional 2: the student's own line in the live note holds its dates as the review does
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const cp = ui.slice(ui.indexOf('function composePreview('), ui.indexOf('function noteTitle('));
  assert.ok(cp.indexOf("return escText(free);") >= 0 && cp.indexOf("' ') + escText(free);") >= 0 && cp.indexOf('esc(free)') < 0, 'own line through escText');
  assert.ok(cp.indexOf('if (k % 2 === 0) return escText(part);') >= 0 && cp.indexOf('esc(tpl)') < 0, 'the template’s own words through escText too (gst-3’s subject line “of 18” / “February 2027”)');
  // play.mjs: a document number split at the hyphen between two digit groups, a slash number split before its end
  // year and a day split from its month all fail a run
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(play.indexOf('/[A-Z][A-Za-z0-9]*(?:[\\/-][A-Za-z0-9]+)*[\\/-]\\d+-\\d/g') >= 0, 'inner-hyphen code check');
  assert.ok(play.indexOf('dayBreaks') >= 0 && play.indexOf('a day ends a line apart from its month') >= 0, 'day check');
  assert.ok(play.indexOf('(?:\\/[A-Za-z0-9]{1,8})*\\/\\d{2,4}-\\d{2}\\b(?![\\/-]))') >= 0, 'end-year split check in papers');
});

test('sa-1 round 6 (fixer 2, S1 and S2 as a pattern): a hand note holds its day and month, and a hunt row head holds its bill number and date', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const N = x => '<span class="nw">' + x + '</span>';
  // ia-1's po-04 note broke "N. Bhosale on leave 10–14" / "Aug." at 360 px once play.mjs looked for it
  const po = D.renderDocument({ id: 'p', type: 'letter', title: 'PO', body: 'x', annotations: [{ kind: 'hand', text: 'N. Bhosale on leave 10–14 Aug. – KL', at: 'bottom-right' }, { kind: 'stamp', text: 'ENTERED\nVCH 3141' }] }, {});
  assert.ok(po.indexOf(N('10–14 Aug') + '. – KL') >= 0, 'hand note holds its range of days with the month');
  // a range of days held by nwRanges takes its month (and year) in a paper; escText does the same in a note or label
  const chain = t => D.nwSections(D.nwDates(D.nwUnits(D.nwRanges(D.nwParts(D.nwCodes(D.esc(t)))))));
  const dr = chain('Billed 22–31 Dec on 120 days; 1–3 April 2027; pages 141–145; ₹150–250 crore; 10–14 Mayank');
  [N('22–31 Dec'), N('1–3 April 2027'), N('141–145'), N('₹150–250 crore'), N('10–14') + ' Mayank'].forEach(x => assert.ok(dr.indexOf(x) >= 0, x));
  assert.ok(po.indexOf('ENTERED<br>VCH 3141') >= 0, 'a stamp with no date or number to hold is as before');
  // for-1's review and model answer: a row head's bill number ("UFPL/26-" / "27/1652" at 360 px) and date go through escText
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  assert.ok(ui.indexOf("<span class=\"n-lbl\">' + escText(rowText(id)) + '</span>") >= 0, 'review row head');
  assert.ok(ui.indexOf("return '<li>' + escText([row[keys.date], row[keys.party], huntBill(doc, keys, row)") >= 0, 'model answer row');
  assert.ok(ui.indexOf('esc(rowText(id))') < 0);
  const et = ui.slice(ui.indexOf('function escText('), ui.indexOf('function escTitle('));
  assert.ok(et.indexOf('D.nwDayRanges(h)') >= 0, 'escText joins a range of days with its month');
  // an item label beside its call chip holds the day with its month, but the year may wrap (cl-1's "Meeting 94 · 12
  // November 2026" held whole clipped its Exception chip by 11 px at 360 px)
  const el = ui.slice(ui.indexOf('function escLabel('), ui.indexOf('function escLine('));
  const yr = /h = h\.replace\((\/.+\/g), '<span class="nw">\$1<\/span> \$2'\)/.exec(el);
  assert.ok(yr, 'label year rule');
  const re = eval(yr[1]);
  assert.equal(D.nwDates('Meeting 94 · 12\u00a0November 2026').replace(re, '<span class="nw">$1</span> $2'), 'Meeting 94 · ' + N('12\u00a0November') + ' 2026');
  assert.equal(D.nwDates('October 2026 returns').replace(re, '<span class="nw">$1</span> $2'), N('October 2026') + ' returns', 'a month and its year alone stay whole');
});

test('dt-1 round 6 (designer S2): no joined line of a list, review or work sample starts with "·"; play.mjs fails a run where one does', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  // the follow row: "Follows your figures ·" / "right figure ₹1,78,125" at 390, never "· right figure" opening a line
  assert.ok(ui.indexOf('<span class="follows">Follows your figures</span>&nbsp;· <span class="k">right&nbsp;figure</span>') >= 0, 'follow row');
  assert.ok(ui.indexOf('<span class="follows">Follows your figures</span> · ') < 0);
  // the review's joins (Your call, labelled pairs, the pencil Not needed line), the model key and the sample's sub-line
  const items = ui.slice(ui.indexOf('function itemAnswerHtml('), ui.indexOf('function mark('));
  ["quiet.join('&nbsp;· ')", "rights.map(holdShort).join('&nbsp;· ')", "pairs.join('&nbsp;· ')"].forEach(x => assert.ok(items.indexOf(x) >= 0, x));
  assert.ok(items.indexOf(".join(' · ')") < 0, 'no plain joins left in the item review');
  assert.equal((ui.match(/\(sub \? '&nbsp;· <span class="sub">'/g) || []).length, 2, 'work sample label and sub-line, list and table');
  assert.ok(ui.indexOf("(sub ? ' · <span") < 0);
  // plain-text joins escaped later carry a no-break space: the item's sub-line, the score line, the hint cost, the hunt rows
  const sum = ui.slice(ui.indexOf('function itemSummary('), ui.indexOf('function itemsList('));
  assert.ok(sum.indexOf(".join('\\u00a0· ')") >= 0, 'itemSummary');
  const sl = ui.slice(ui.indexOf('function scoreLine('), ui.indexOf('function reviewScreen('));
  assert.equal((sl.match(/'\\u00a0· ' \+ r\./g) || []).length, 2, 'scoreLine');
  assert.ok(ui.slice(ui.indexOf('function hintCost('), ui.indexOf('function hintCost(') + 300).indexOf("'\\u00a0· ' + (off === 1") >= 0, 'hintCost');
  // labels: escLabel holds its dot as escTitle does; a compose slot's label too, on the work screen and in the review
  const src = ui.slice(ui.indexOf('function escNum('), ui.indexOf('function plural('));
  const f = new Function('esc', 'D', src + '; return { escLabel: escLabel };')(D.esc, D);
  assert.equal(f.escLabel('Item 7 · VMC-10 in the block'), 'Item 7 · ' + '<span class="nw">VMC-10</span> in the block');
  // and a day keeps its month in a label (gst-2's "Old lathe sold on 14" / "December" beside the call chip at 390)
  assert.equal(f.escLabel('Old lathe sold on 14 December'), 'Old lathe sold on <span class="nw">14 December</span>');
  assert.equal(f.escLabel('Ashvaratha Motors · credit note 001 of 28 March'), 'Ashvaratha Motors · credit note 001 of <span class="nw">28 March</span>');
  assert.equal((ui.match(/esc\(s\.label\)\.replace\(\/ · \/g, '\\u00a0· '\)/g) || []).length, 2, 'slot labels');
  // the all-right line on a real item: "Your call: Disallow · not used in the year (clause 36) · ₹4,09,500" breaks after a dot
  const line = name => { const i = ui.indexOf('  function ' + name + '('); return ui.slice(i, ui.indexOf('\n', i)); };
  const span = (from, to) => ui.slice(ui.indexOf('  function ' + from + '('), ui.indexOf(to, ui.indexOf('  function ' + from + '(')));
  const usrc = [line('arr'), line('escNum'), span('gateField', '  function itemSummary('), span('fieldAnswerText', '  function mark(')].join('\n');
  const U = new Function('E', 'esc', 'escLabel', usrc + '; return { itemAnswerHtml: itemAnswerHtml };')(E, D.esc, D.esc);
  const dt1 = read(path.join(DATA, 'levels', 'dt-1.json')), t1 = dt1.tasks[0], i7 = t1.items.find(it => it.id === 'i7');
  const h = U.itemAnswerHtml(t1, i7, { verdict: 'disallow', reasons: ['notused'], effect: '409500' });
  assert.ok(/Your call:<\/span> .*Disallow.*&nbsp;· .*not used in the year.*&nbsp;· .*₹4,09,500/.test(h), h);
  assert.ok(!/[^;] · /.test(h.replace(/&nbsp;· /g, '')), 'no plain " · " left: ' + h);
  // play.mjs measures it on every screen (papers excepted) and on the printed work sample
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(play.indexOf('dotStarts') >= 0 && play.indexOf('a line starts with “·” on ') >= 0, 'play.mjs dot check');
  assert.ok(play.indexOf("if (pm.dots.length) report.dotStarts.push") >= 0, 'and on the printed sample');
});

test('dt-1 round 6 (designer optionals 1 and 2): a list screen says the paid hint before the offer of another; a two-word call keeps one line in a three-way bar at 360', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  // hintBox on an items task with a hint paid: the fold, then the question or "Another hint"; other tasks as before
  const hb = ui.slice(ui.indexOf('  function hintBox('), ui.indexOf('  function firstUnchecked('));
  const app = { ui: { hint: null, hintOpen: null } };
  const make = (shown, asked, locked) => new Function('app', 'esc', 'escText', 'COPY', 'hintsShown', 'isLockedTask', 'hintButton', hb + '; return hintBox;')(
    { ui: { hint: asked ? 't1' : null, hintOpen: null } }, D.esc, D.esc, { hintCost: 'A hint costs one star on this level.' },
    () => shown, () => !!locked, () => '<button data-act="hint-ask">Another hint (costs a star)</button>');
  const task = { id: 't1', type: 'items', hints: ['one', 'two'] };
  const h1 = make(1, false)(null, task);
  assert.ok(h1.indexOf('<details class="hint-inline"') >= 0 && h1.indexOf('data-act="hint-ask"') > h1.indexOf('</details>'), 'fold, then Another hint');
  const h2 = make(1, true)(null, task);
  assert.ok(h2.indexOf('class="hint-confirm"') > h2.indexOf('</details>') && h2.indexOf('data-act="hint-ask"') < 0, 'fold, then the question in its place');
  assert.ok(make(1, false, true)(null, task).indexOf('data-act="hint-ask"') < 0, 'handed in: the fold alone');
  const h0 = make(0, true)(null, task);
  assert.ok(h0.indexOf('class="hint-confirm"') >= 0 && h0.indexOf('<details') < 0, 'no hint yet: the question as before');
  const ws = make(1, true)(null, { id: 't1', type: 'worksheet', hints: ['a worksheet hint'] });
  assert.ok(ws.indexOf('class="hint-confirm"') < ws.indexOf('class="sticky blue'), 'a worksheet keeps its order');
  // the task head leaves the button out of its tools row once an items task has a paid hint (hintBox carries it)
  assert.ok(ui.indexOf("(isLockedTask(lv, task) || (task.type === 'items' && hintsShown(lv, task)) ? '' : hintButton(lv, task))") >= 0);
  assert.ok(/\.hint-box > \.btn \{ min-height: 44px;/.test(css), 'the button keeps a 44 px target there');
  // "Report only" (89 px of 16 px type) in a 104 px button at 360: the side padding gives way under 380 px
  const m = css.match(/@media \(max-width: 379\.98px\) \{[\s\S]*?\n\}/g) || [];
  assert.ok(m.some(b => b.indexOf('.ibar.gate3 .seg.wrap .seg-opt span { padding-left: 4px; padding-right: 4px; }') >= 0), 'gate3 padding under 380');
});

test('sa-3 round 4 (designer S1): an item screen drawn on a phone leaves no pane signature to keep, so a window widened past 1024 px builds the papers afresh; play.mjs crosses the breakpoint', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const src = ui.slice(ui.indexOf('  function itemPaneHtml('), ui.indexOf('  function itemScreen('));
  const pane = new Function('esc', 'escLabel', src + '; return itemPaneHtml;')(D.esc, D.esc);
  const sig = 'item|sa-3|t1|cnc|0|', paper = '<div class="doc">Tax invoice</div>';
  // DESKTOP.matches false: the pane holds the item's name only (the papers sit under the heading) and no data-sig
  const phone = pane(false, sig, 'CNC TC-35 · FA-27-04', paper);
  assert.ok(/^<aside class="docs-pane" aria-label="Documents">/.test(phone) && phone.indexOf('data-sig') < 0, phone);
  assert.ok(phone.indexOf('class="doc"') < 0, 'no paper in the phone pane');
  // DESKTOP.matches true: the signature and the papers, as before
  const desk = pane(true, sig, 'CNC TC-35 · FA-27-04', paper);
  assert.ok(desk.indexOf('data-sig="' + sig + '"') >= 0 && desk.indexOf(paper) >= 0, desk);
  // paneShell keeps a live pane only by its signature: after a phone render there is nothing to keep (a stub root)
  const shellSrc = ui.slice(ui.indexOf('  function paneShell('), ui.indexOf('  function docCtx('));
  const shellAfter = html => new Function('root', 'esc', shellSrc + '; return paneShell;')({
    querySelector: sel => { const m = /data-sig="([^"]*)"/.exec(html); return sel === '.docs-pane[data-sig]' && m ? { getAttribute: () => m[1] } : null; }
  }, D.esc)(sig);
  assert.equal(shellAfter(phone), null, 'a phone pane is never kept');
  assert.ok(/data-keep="1"/.test(shellAfter(desk)), 'a desktop pane is kept, with its scroll and focus');
  // itemScreen draws its pane only through itemPaneHtml
  const is = ui.slice(ui.indexOf('  function itemScreen('), ui.indexOf('\n  }\n', ui.indexOf('  function itemScreen(')));
  assert.ok(is.indexOf('((desk && paneShell(isig)) || itemPaneHtml(desk, isig, it.label, tabs + docHtml))') >= 0, 'itemScreen pane');
  assert.ok(is.indexOf('<aside') < 0, 'no other pane markup in itemScreen');
  // play.mjs narrows and widens the desktop run's first item screen, and draws one at 900 px and widens it
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(play.indexOf('documents pane empty after the window crossed the desktop breakpoint') >= 0, 'play.mjs check');
  assert.ok(play.indexOf("crossed.push('drawn at 900 px, then widened: '") >= 0, 'the tablet case');
});

test('ia-1 round 3 (designer S1): an order task of more than six steps prints in the work sample as two numbered lists side by side, the second from step 5; six or fewer as one list', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const src = ui.slice(ui.indexOf('function sampleTask('), ui.indexOf('function fitSample('));
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const optLabel = (f, v) => ((f.options || []).filter(o => o.id === v)[0] || {}).label || String(v);
  const sampleTask = new Function('E', 'esc', 'escText', 'escNum', 'escLabel', 'capWord', 'gateField', 'optLabel', 'fieldAnswerText', 'itemSummary', 'wsTable', 'leadText',
    src + '; return sampleTask;')(E, esc, s => '[' + esc(s) + ']', esc, esc, s => s.charAt(0).toUpperCase() + s.slice(1), t => (t.fields || []).filter(f => f.gate)[0] || null,
    optLabel, (f, v) => optLabel(f, v), () => '', t => t.layout === 'table' && (t.columns || []).length === 2, (f, s) => s);
  const ia1 = read(path.join(DATA, 'levels', 'ia-1.json'));
  const t1 = ia1.tasks.filter(t => t.type === 'order')[0];
  assert.equal(t1.steps.length, 8);
  const step = id => t1.steps.filter(s => s.id === id)[0].text;
  // the key: steps 1–4 in the first list, 5–8 in the second, which numbers on from 5; each step through escText
  const s = sampleTask(ia1, t1, { order: t1.answer.slice() });
  assert.ok(s.startsWith('<div class="s-pair s-order"><ol><li>') && s.endsWith('</li></ol></div>'), s.slice(0, 60));
  assert.equal((s.match(/<ol[ >]/g) || []).length, 2, 'two lists');
  const lists = s.split('</ol>').slice(0, 2).map(h => h.match(/<li>[\s\S]*?<\/li>/g));
  assert.deepEqual(lists.map(l => l.length), [4, 4]);
  assert.ok(s.indexOf('</ol><ol start="5"><li>') >= 0, 'the second list starts at 5');
  assert.equal(lists[0][0], '<li>[' + esc(step('s1')) + ']</li>');
  assert.equal(lists[1][0], '<li>[' + esc(step('s5')) + ']</li>');
  // the student's own order, untouched (the shuffled start), prints in that order across both lists
  const own = E.currentOrder(ia1, t1, {});
  const u = sampleTask(ia1, t1, {});
  assert.deepEqual(u.match(/<li>[\s\S]*?<\/li>/g), own.map(id => '<li>[' + esc(step(id)) + ']</li>'));
  // seven steps split 4 and 3; six or fewer stay one list, as before
  const seven = Object.assign({}, t1, { steps: t1.steps.slice(0, 7), answer: t1.answer.slice(0, 7) });
  assert.ok(sampleTask(ia1, seven, { order: seven.answer.slice() }).indexOf('</ol><ol start="5">') >= 0);
  const six = Object.assign({}, t1, { steps: t1.steps.slice(0, 6), answer: t1.answer.slice(0, 6) });
  const one = sampleTask(ia1, six, { order: six.answer.slice() });
  assert.ok(one.startsWith('<ol style="margin:0;padding-left:18px"><li>') && (one.match(/<ol[ >]/g) || []).length === 1, one.slice(0, 60));
  // the two lists share the row, as sampleBreak's two tables do
  assert.ok(css.indexOf('.sheet .s-order ol { flex: 1 1 0; min-width: 0; margin: 0; padding-left: 18px; }') >= 0);
  assert.ok(/\.sheet \.s-pair \{ display: flex;/.test(css));
});

test('ia-1 round 3 (designer optionals 1–3): a template’s own **…** words print bold in the note; a review row’s tag moves under its label whole; a partly right multi question says so', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const f = new Function(ui.slice(ui.indexOf('function noteTitle('), ui.indexOf('function composeTask(')) + '; return { noteTitle: noteTitle, noteBold: noteBold };')();
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // optional 3: ia-1's two observations, the key and a student's own line with asterisks of its own
  const ia1 = read(path.join(DATA, 'levels', 'ia-1.json'));
  const t4 = ia1.tasks.find(t => t.type === 'compose');
  const runs = t4.template.match(/\*\*[^*{}\n]+\*\*/g).map(m => m.slice(2, -2));
  ['Condition:', 'Criteria:', 'Cause:', 'Consequence:', 'Corrective action:', 'Owner:', 'Target date:'].forEach(k => assert.ok(runs.indexOf(k) >= 0, k));
  const key = {}; t4.slots.forEach(s => { key[s.id] = s.options.find(o => o.correct).id; });
  key._free = 'My own **note** and **Condition:** too';
  const html = f.noteTitle(t4, esc(E.composeText(t4, key)));
  assert.ok(html.startsWith('<b class="pn-title">Draft observations · Purchase to pay, '), html.slice(0, 80));
  assert.equal((html.match(/<b class="pn-k">Condition:<\/b>/g) || []).length, 3, 'both observations, and a student line that wraps one of the template’s own runs');
  assert.equal((html.match(/<b class="pn-k">/g) || []).length, 2 + 2 * 7 + 1, 'two headings, seven labels each, and the student line');
  assert.ok(html.indexOf('<b class="pn-k">1. One laminate requirement split into three POs (rating: medium)</b>\n<b class="pn-k">Condition:</b> On 4') >= 0);
  assert.ok(html.indexOf('My own **note** and') >= 0, 'any other asterisks print as typed');
  assert.equal(html.indexOf('**', html.indexOf('</b>')), html.indexOf('**note**'), 'no template asterisks left');
  // a run held by escText (a span, a no-break space) still matches; a template with no ** is untouched
  assert.equal(f.noteBold({ template: '**Due 31 March:** {a}' }, '**Due <span class="nw">31&nbsp;March</span>:** x'), '<b class="pn-k">Due <span class="nw">31&nbsp;March</span>:</b> x');
  assert.equal(f.noteBold({ template: 'Sir,\n{a}' }, 'a **b** c'), 'a **b** c');
  assert.ok(/\.pn-k \{ font-weight: 800; \}/.test(css));
  // optional 2: the label is one box when a tag follows it; a row with no tag is as before
  const m = new Function(ui.slice(ui.indexOf('function mark('), ui.indexOf('function say(')) + '; return { nLabel: nLabel, wsRowPartial: wsRowPartial };')();
  assert.equal(m.nLabel('Purchase 7 · Lonand Masala', '<span class="partial">Partly right</span>'), '<span class="n-lt">Purchase 7 · Lonand Masala</span><span class="partial">Partly right</span>');
  assert.equal(m.nLabel('Purchase 1 · Lonand Masala', ''), 'Purchase 1 · Lonand Masala');
  assert.equal(m.nLabel('r7 · EBIT', m.wsRowPartial(3, 3)), 'r7 · EBIT');
  assert.ok(ui.indexOf("<span class=\"n-lbl\">' + nLabel(escLabel(it.label), sc.score > 0 && !sc.correct ? '<span class=\"partial\">Partly right</span>' : '') + '</span>'") >= 0, 'items review row');
  assert.ok(ui.indexOf("nLabel(escText(rowLabel),\n          wsRowPartial(okN, list.length))") >= 0, 'worksheet review row');
  assert.ok(css.indexOf('.nrow .n-lt { display: inline-block; max-width: 100%; margin-right: 6px; }') >= 0 && css.indexOf('.nrow .n-lt + .partial, .q-text > .partial { margin-left: 0; }') >= 0);
  // optional 1: the choice review's question carries the tag on a partly right pick, beside the cross
  assert.ok(ui.indexOf("escText(q.text) +\n          // ia-1 round 3 (designer optional 1)") >= 0 && ui.indexOf("(s > 0 && !ok ? ' <span class=\"partial\">Partly right</span>' : '') + '</p>'") >= 0);
});

test('sa-1 round 6 (fixer 3, dt-1 round 6 pattern): escText holds a " · " to the word before it, so no note, prompt or review line starts with the dot', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const escText = new Function('esc', 'D', ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle(')) + '; return escText;')(D.esc, D);
  // sa-7's live annexure on the desktop read "… year ended 31 March 2027" / "· your clauses" once the date was held
  const lv = read(path.join(DATA, 'levels', 'sa-7.json')), t3 = lv.tasks.find(x => x.id === 't3');
  const head = escText(t3.template.split('\n')[0]);
  assert.ok(head.indexOf('<span class="nw">31\u00a0March\u00a02027</span>\u00a0· your clauses') >= 0, head);
  assert.ok(head.indexOf(' · ') < 0, 'no plain " · " left: ' + head);
  assert.equal(escText('Fine · 2026–27'), 'Fine · <span class="nw">2026–27</span>');
  assert.equal(escText('a·b and ·c'), 'a·b and ·c', 'a dot without a space each side is left as it was');
  assert.ok(!/<script/.test(escText('<script> · </script>')), 'still escaped');
});

test('sa-1 round 7 (designer S1 and optionals 1–3): the gate register fits the 360 px picker; sheet notes do not repeat their row; the result card keeps scores beside; a toast re-checks on scroll', () => {
  const lv = read(path.join(DATA, 'levels', 'sa-1.json'));
  // S1: "Gate inward register · 29 March – 8 April" (296 px) ended in "…" in the 268 px the picker has at 360; the
  // paper itself still prints its full heading
  const gate = lv.documents.find(d => d.id === 'gate-register');
  assert.equal(gate.title, 'Gate register · 29 March – 8 April');
  assert.equal(gate.heading, 'Gate inward register');
  // optional 1: each note sits under "Bill 11 · Kharun: out of March" / "Bill 15 · Rankala: into March" already
  const t3 = lv.tasks.find(t => t.id === 't3');
  Object.entries(t3.notes).forEach(([k, v]) => assert.ok(!/^(Kharun|Rankala):/.test(v) && /^[A-Z]/.test(v), k + ': ' + v));
  // optional 2: an 11em label left a 294 px row (360 px phone) too little room for "5 of 5 lines right"
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.match(css, /\.result \.r-tasks li > span \{ flex: 1 1 10em;[^}]*\}/);   // sa-4 round 6 adds text-wrap: balance to the rule; sa-1 round 8 scopes it to the label span (`>`)
  // optional 3: the covers test runs again on scroll while the toast shows, and the listener goes with the toast
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const toast = ui.slice(ui.indexOf('function showToast('), ui.indexOf('function copyText('));
  assert.ok(/function covers\(\)/.test(toast) && /function onScroll\(\) \{[^}]*covers\(\)/.test(toast), 'onScroll re-runs covers()');
  assert.ok(toast.indexOf("window.addEventListener('scroll', onScroll, { passive: true, capture: true })") >= 0, 'listens to every scroller');
  assert.ok(toast.indexOf("window.removeEventListener('scroll', onScroll, { capture: true })") >= 0, 'the listener is removed with the toast');
});

test('dt-1 round 9 (designer S1): the review prints the student’s own note through escText, as the work sample does, so a typed "22 Dec" keeps its month', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const at = ui.indexOf('function itemAnswerHtml(');
  const body = ui.slice(at, ui.indexOf('\n  function ', at + 1));
  assert.ok(body.indexOf("<span class=\"k\">Your note:</span> <em>' + escText(ia[f.id]) + '</em>") >= 0, 'the review note goes through escText');
  assert.ok(!/esc\(ia\[/.test(ui), 'no student note is printed with plain esc anywhere in the app');
  const escText = new Function('esc', 'D', ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle(')) + '; return escText;')(D.esc, D);
  // the designer's note read "Your note: Two memos to one shop on 22" / "Dec, paid in cash." at 390 and 412
  const note = escText('Two memos to one shop on 22 Dec, paid in cash; bill KP/26-27/1187 of 9 April 2027.');
  ['22 Dec', 'KP/26-27/1187', '9 April 2027'].forEach(x => assert.ok(note.indexOf('<span class="nw">' + x + '</span>') >= 0, x + ' is held: ' + note));
  const typed = escText('<b>"Paid" & signed</b>');
  assert.ok(typed.indexOf('<b>') < 0 && typed.indexOf('&lt;b&gt;') >= 0 && typed.indexOf('&amp;') >= 0, 'typed markup stays escaped: ' + typed);
});

test('sa-4 round 4 (designer optionals 1 and 2): a closed select ends a long title in "…"; a paged table fades its cut column on the table, never on the box', () => {
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  // the Other papers picker read "Security · staff ID cards issued and return" at 390: a cut letter, no ellipsis
  assert.match(css, /\.select \{ text-overflow: ellipsis; white-space: nowrap; overflow: hidden; \}/);
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const at = ui.indexOf('function edgeFade(');
  assert.ok(at > 0, 'edgeFade exists');
  const fade = ui.slice(at, ui.indexOf('\n  function ', at + 1));
  // the mask goes on the table (the strip's next sibling), so the box's focus ring and the More columns strip are never faded
  assert.ok(fade.indexOf('body.style.webkitMaskImage = body.style.maskImage = m;') >= 0, 'mask on the table');
  assert.ok(!/el\.style\.(webkit)?[mM]askImage/.test(ui), 'never a mask on the scroll box');
  assert.ok(fade.indexOf('!tableAtEnd(el) ? nextColumn(el) : null') >= 0, 'only while there is more to the right, on the cut column');
  assert.ok(fade.indexOf('Math.max(gone - FADE_RAMP, c + 1)') >= 0, 'the fade never reaches left of the cut column');
  assert.ok(fade.indexOf('shown * 4 < rows') >= 0, 'a glyph in under a quarter of the rows is cleared');
  const mark = ui.slice(ui.indexOf('function markScrollables('), at);
  assert.ok(mark.indexOf('if (!strip) { edgeFade(el, table); return; }') >= 0, 'a table that stops being wide loses its mask');
  assert.ok(mark.indexOf('edgeFade(el, strip.nextElementSibling);') >= 0, 'set on each render');
  assert.ok(/requestAnimationFrame\(function \(\) \{ el\._fadeQ = 0;/.test(mark), 'kept in step with the scroll, once a frame');
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(play.indexOf('in the Other papers picker, e.g. ') >= 0, 'play.mjs notes a picker title that ends in "…"');
  assert.ok(play.indexOf('a cut column shows a lone glyph at the right edge') >= 0, 'play.mjs notes a lone glyph at a paged edge');
  // the level: the three long titles now fit the picker at 360 (268 px of 600 16px Nunito)
  const lv = read(path.join(DATA, 'levels', 'sa-4.json')), title = id => lv.documents.find(d => d.id === id).title;
  assert.equal(title('idcards'), 'Security · staff ID cards');
  assert.equal(title('hr-master'), 'Employee master · joiners, leavers');
  assert.equal(title('bank-dec'), 'Bank · salary credits, December');
});

// sa-4 round 5 (designer S1): a mail's attachment chip is a flex box, so its name must be one flex item; a bare name
// beside the date hold's span (t() keeps "Dec 2026" together) became three items with the chip's 8 px gap between them
// ("Salary register Apr– Dec 2026 .xlsx"). Each chip's own children: exactly one .em-name span and no bare text
function emChipKids(html, open) {
  const out = [];
  open = open || /<(span|a|button)\b[^>]*\bclass="em-file[^"]*"[^>]*>/g;
  let m;
  while ((m = open.exec(html))) {
    const kids = [], tok = /<(\/?)([a-z]+)\b([^>]*)>|([^<]+)/g;
    let depth = 0, x;
    tok.lastIndex = open.lastIndex;
    while ((x = tok.exec(html))) {
      if (x[4] !== undefined) { if (depth === 0 && x[4].trim()) kids.push('#text ' + x[4].trim()); continue; }
      if (x[1]) { if (depth === 0) break; depth--; continue; }
      if (/^(br|wbr|img)$/.test(x[2])) { if (depth === 0) kids.push(x[2]); continue; }
      if (depth === 0) kids.push(x[2] + '.' + ((/\bclass="([^"]*)"/.exec(x[3]) || [])[1] || ''));
      depth++;
    }
    out.push(kids);
  }
  return out;
}
test('sa-4 round 5: a mail chip’s name is one span beside the badge, in every branch and in every level’s mails', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const mail = { id: 'm', type: 'letter', style: 'email', title: 'Mail', subject: 'Payroll files', from: { name: 'Shabana Shaikh' }, to: [{ name: 'Aditi Rane' }], body: ['Attached.'],
    attachments: ['Bank salary report Dec 2026.pdf', { name: 'Salary register Apr–Dec 2026.xlsx', file: 'reg.xlsx' }, { name: 'Valuation, 31 Dec 2026.pdf', doc: 'v' }] };
  const link = { levelId: 'x', docLink: (id, cls) => ({ open: '<button type="button" class="' + cls + '" data-doc="' + id + '">', close: '</button>' }) };
  [{}, link].forEach(c => {
    const html = D.renderDocument(JSON.parse(JSON.stringify(mail)), c);
    assert.ok(html.indexOf('<span class="nw">Dec 2026</span>') >= 0, 'the month is held to its year inside the name');
    const kids = emChipKids(html);
    assert.equal(kids.length, 3);
    kids.forEach(k => assert.deepEqual(k, ['span.em-name'], 'one name span, no bare text: ' + JSON.stringify(k)));
  });
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.match(css, /\.em-name \{ min-width: 0; \}/, 'the name may shrink, so a long one wraps inside the chip');
  // every level's mails, as the app renders them (with and without a paper link)
  let chips = 0;
  levelFiles.forEach(f => {
    const lv = read(path.join(DATA, 'levels', f));
    (lv.documents || []).filter(d => d.type === 'letter' && d.attachments && d.attachments.length).forEach(d => {
      [{ levelId: lv.id }, Object.assign({}, link, { levelId: lv.id })].forEach(c => {
        emChipKids(D.renderDocument(JSON.parse(JSON.stringify(d)), c)).forEach(k => {
          chips++;
          assert.deepEqual(k, ['span.em-name'], f + ' · ' + d.id + ': ' + JSON.stringify(k));
        });
      });
    });
  });
  assert.ok(chips > 0, 'the levels have mail chips to check');
});
// the same pattern in the other flex boxes of a paper that hold a name or title (found by the round's probe of every
// paper): a card's title row (title left, number right; sa-7's "at 31 March 2027" was pushed off its words) and an
// Excel tab (gst-2's "GSTR-9 Chakan" lost its space once xl-1 gave the tab's wrapper class to the Name Box)
test('sa-4 round 5: a card title and a sheet tab are one item each in every level’s papers', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const card = D.renderDocument({ id: 'c', type: 'card', title: 'Facts for the CARO clauses, at 31 March 2027', number: 'F/12', fields: [{ label: 'A', value: 'B' }] }, {});
  assert.deepEqual(emChipKids(card, /<div class="cd-title">/g), [['span.cd-tt', 'span.cd-no']]);
  let titles = 0, tabs = 0;
  levelFiles.forEach(f => {
    const lv = read(path.join(DATA, 'levels', f));
    (lv.documents || []).forEach(d => {
      const html = D.renderDocument(JSON.parse(JSON.stringify(d)), { levelId: lv.id });
      emChipKids(html, /<div class="cd-title">/g).forEach(k => { titles++; assert.equal(k[0], 'span.cd-tt', f + ' · ' + d.id + ': ' + JSON.stringify(k)); assert.ok(k.every(x => !/^#text/.test(x)), f + ' · ' + d.id + ': ' + JSON.stringify(k)); });
      emChipKids(html, /<span class="(?:on|xl-label)"[^>]*>/g).forEach(k => { tabs++; assert.ok(!(k.some(x => /^#text/.test(x)) && k.some(x => !/^#text/.test(x))) && k.length <= 1, f + ' · ' + d.id + ' tab, plain text or one xl-tname span: ' + JSON.stringify(k)); assert.ok(k.length === 0 || /^#text/.test(k[0]) || k[0] === 'span.xl-tname', f + ' · ' + d.id + ' tab: ' + JSON.stringify(k)); });
    });
  });
  assert.ok(titles > 0 && tabs > 0, 'the levels have card titles and sheet tabs to check');
});

// sa-4 round 6: the result card's labels are balanced, so a two-line label never leaves one word alone (designer
// optional 1: "Recompute December PF and" / "ESI" at 390; a probe of every published level's key, minimal-pass and
// one-task-wrong cards, on the label span only, found 33 such labels at 360 and 30 at 390, 0 after, with no held span
// broken, no label changing its line count and no score moving under its label); and three sa-4 strings (facts S1,
// editor optionals 1 and 2)
test('sa-4 round 6: result-card labels are balanced; Vinod’s note claims only the payroll exit; Datta’s note quotes the formula bar', () => {
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.match(css, /\.result \.r-tasks li > span \{ flex: 1 1 10em; text-wrap: balance; \}/);   // sa-1 round 8: the label span only, so escTitle's span.nw keeps its nowrap
  const lv = read(path.join(DATA, 'levels', 'sa-4.json'));
  // facts S1: his F&F came 15 days after his last day; the Code on Wages s.17(2) asks for two working days, so the
  // note holds up only what the audit programme tests (paid to the last day, nothing after, out of the master)
  const vinod = lv.tasks.find(t => t.id === 't2').items.find(i => i.id === 'p1037');
  assert.ok(/That is how a leaver should come off the payroll\./.test(vinod.note), vinod.note);
  // editor optional 2: the note quotes the formula bar character for character (its space held by a no-break space)
  const reg = lv.documents.find(d => d.id === 'dec-reg');
  const note = lv.tasks.find(t => t.id === 't3').notes['pf1005.due'];
  assert.ok(reg.formula.indexOf('MIN(D4, 15000)') >= 0, reg.formula);
  assert.ok(note.replace(/\u00a0/g, ' ').indexOf('MIN(…, 15000)') >= 0 && note.indexOf('MIN(…,\u00a015000)') >= 0, note);
  // editor optional 1: a report does not find anything; the student does, with it
  assert.ok(/^The bank report shows the extra salary once you put each name next to the account it is paid into\./.test(lv.wrapRetry.text), lv.wrapRetry.text);
  assert.ok(lv.wrapRetry.text.split(/\s+/).length <= 50, 'wrapRetry within SPEC §12’s 50 words');
});

// sa-1 round 8: the result card's label rule reaches the label span only, so escTitle's span.nw keeps its nowrap (designer
// S1: `li span` + text-wrap: balance broke "cut-off" on sa-1's card at 360 and 390); play.mjs fails a held run that shows
// on two lines; the CV line holds every hyphenated word of letters (designer optional 1); and t3's note on Bill 11's
// closing stock says "not yet in Tamhini’s stock" (facts optional 1: "never" overstated it)
test('sa-1 round 8: result-card labels keep their holds; play.mjs checks every hold; the CV line holds its hyphenated words; the Bill 11 stock note', () => {
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.ok(!/\.result \.r-tasks li span \{/.test(css), 'no descendant `li span` rule on the result card');
  assert.match(css, /\.result \.r-tasks li > span \{[^}]*text-wrap: balance;[^}]*\}/);
  assert.match(css, /^\.nw \{ white-space: nowrap; \}/m);
  // the guard: every span.nw on a measured screen must keep its text on one line
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(/out\.holds = \[\];/.test(play) && /document\.querySelectorAll\('\.nw'\)/.test(play), 'measure() collects broken holds');
  assert.ok(/report\.holdBreaks\.push\(\{ screen: file/.test(play) && /report\.holdBreaks\.push\(\{ screen: ps/.test(play), 'on every shot and on the printed sample');
  assert.ok(/if \(report\.holdBreaks\.length\) report\.problems\.push\(/.test(play), 'a broken hold fails the run');
  // the CV line: every hyphenated word of letters is held; the text itself is unchanged
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const f = new Function('esc', 'D', ui.slice(ui.indexOf('function escNum('), ui.indexOf('function plural(')) + '; return { escLine: escLine };')(D.esc, D);
  const nw = x => '<span class="nw">' + x + '</span>';
  const raw = 'Statutory Audit Work Simulation, MSC Articleship Program | Oct 2026: Vouched 20 year-end purchase bills against PO, GRN and ledger; flagged 7 exceptions (2 cut-off, 1 unapproved PO, 1 price-volume-cost gap)';
  const line = f.escLine(raw);
  ['year-end', 'cut-off', 'price-volume-cost'].forEach(w => assert.ok(line.indexOf(nw(w)) >= 0, w + ' held: ' + line));
  assert.equal(line.replace(/<[^>]+>/g, ''), raw, 'the same text');
  // facts optional 1: the steel became Tamhini’s on 2 April (Bill 11’s GRN), so on 31 March it was not yet in stock
  const lv = read(path.join(DATA, 'levels', 'sa-1.json'));
  const t3 = lv.tasks.find(t => t.id === 't3');
  assert.equal(t3.notes['r1.stk'], 'The steel was still on the road on 31 March, so it was not yet in Tamhini’s stock. Nothing to take out of closing stock.');
  assert.ok(!/never in Tamhini/.test(JSON.stringify(lv)), 'no “never in Tamhini’s stock” left');
});

// dt-2 round 5: a choice field whose every option is 30 characters or fewer strikes any wrong pick (designer optional 3:
// task 2's "Tamhini corrects its books" was red on Vayuvega while "Ask the deductor" was struck on Lothal, one field, two
// looks); a field with a longer option (task 1's section entry) keeps the 24-character rule, and a figure stays red
test('dt-2 round 5: one look per short choice field in the review; the level holds Form, section and tax year to their numbers', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const line = name => { const i = ui.indexOf('  function ' + name + '('); return ui.slice(i, ui.indexOf('\n', i)); };
  const span = (from, to) => ui.slice(ui.indexOf('  function ' + from + '('), ui.indexOf(to, ui.indexOf('  function ' + from + '(')));
  const src = [line('arr'), line('escNum'), span('gateField', '  function itemSummary('), span('fieldAnswerText', '  function mark(')].join('\n');
  const U = new Function('E', 'esc', 'escLabel', src + '; return { itemAnswerHtml: itemAnswerHtml };')(E, D.esc, D.esc);
  const lv = read(path.join(DATA, 'levels', 'dt-2.json'));
  const t1 = lv.tasks.find(t => t.id === 't1'), t2 = lv.tasks.find(t => t.id === 't2');
  const it = (t, id) => t.items.find(x => x.id === id);
  // Vayuvega matches; "Tamhini corrects its books" (26 characters) is struck like Lothal's "Ask the deductor"
  let h = U.itemAnswerHtml(t2, it(t2, 'r5'), { action: 'fix', diff: '500' });
  assert.ok(h.indexOf('<span class="you wrong">Tamhini corrects its books</span>') >= 0, h);
  h = U.itemAnswerHtml(t2, it(t2, 'r6'), { action: 'ask', diff: '-720' });
  assert.ok(h.indexOf('<span class="you wrong">Ask the deductor</span>') >= 0, h);
  // the diff figure, when wrong, stays red and never struck
  h = U.itemAnswerHtml(t2, it(t2, 'r6'), { action: 'fix', diff: '-700' });
  assert.ok(/<span class="you-long">(<span class="nw">)?−₹700<\/span>/.test(h) && h.indexOf('you wrong') < 0, h);
  // task 1's entry has 33- and 35-character options: a short wrong pick is struck, a long one red, as before
  h = U.itemAnswerHtml(t1, it(t1, 'p6'), { verdict: 'short', entry: 'contractor', rate: 'r10' });
  assert.ok(h.indexOf('<span class="you wrong">Contract work</span>') >= 0, h);
  h = U.itemAnswerHtml(t1, it(t1, 'p1'), { verdict: 'right', entry: 'prof', rate: 'r2' });
  assert.ok(h.indexOf('<span class="you-long">Fees for professional services</span>') >= 0, h);
  // designer S1 (made in the generator, guarded in the dt-1 round 2 test): the brief and q3 hold "Form 168" and "Form 131"
  assert.ok(lv.brief.messages[1].indexOf('Form 168 and build') >= 0, lv.brief.messages[1]);
  assert.ok(lv.tasks.find(t => t.id === 't4').questions[2].text.indexOf('certificates in Form 131 (Form 16A') >= 0);
  // facts optional 2 and editor optional 1: sub-lines true of the whole payment and of the deductor
  assert.equal(it(t1, 'p8').prompt, 'Freight outward, full-truck trips.');
  assert.equal(it(t2, 'r1').prompt, 'Tamhini’s biggest customer, a truck maker at Chakan.');
  // designer optional 4: play.mjs measures a form, section or clause apart from its number in the app's own text (papers
  // left out) on every screen and on the printed sample, and reports it on the run's line as a note until every level
  // holds its references
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.match(play, /const refRe = \/\(\?<!\[\\w-\]\)\(Forms\?\|\[Ss\]ection\|\[Cc\]lause\)/);
  assert.match(play, /closest\('article\.doc, \.doc-paper'\)\) continue;/);
  assert.equal((play.match(/report\.notes\.push\(\{ ref: /g) || []).length, 2, 'every screen and the printed sample');
  assert.match(play, /note: a form, section or clause ends a line apart from its number on /);
});

// sa-1 round 8 (second fixer): once escLine held "cut-off", sa-1's card at 375 and 390 read "flagged 7 exceptions (2" /
// "cut-off, 1 unapproved PO, 1" / "overpricing, …" / "rate)": a count ended its line apart from the word it counts and
// the last word stood alone. A bare count is now held to its word (or held word, or code), and the card's paragraph is
// text-wrap: pretty, as the work sample's .sh-line; the paragraph rule never reaches a span.nw
test('sa-1 round 8 (second fixer): the CV line holds each count to its word; the card is text-wrap: pretty', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const f = new Function('esc', 'D', ui.slice(ui.indexOf('function escNum('), ui.indexOf('function plural(')) + '; return { escLine: escLine };')(D.esc, D);
  const nw = x => '<span class="nw">' + x + '</span>';
  const raw = 'Statutory Audit Work Simulation, MSC Articleship Program | Oct 2026: Vouched 20 year-end purchase bills against PO, GRN and ledger; flagged 7 exceptions (2 cut-off, 1 unapproved PO, 1 overpricing, 1 excess quantity, 1 GSTIN mismatch, 1 wrong GST rate)';
  const line = f.escLine(raw);
  [nw('20 ' + nw('year-end')), nw('7 exceptions'), '(' + nw('2 ' + nw('cut-off')), nw('1 unapproved'), nw('1 overpricing'), nw('1 excess'), nw('1 GSTIN'), nw('1 wrong')].forEach(h => assert.ok(line.indexOf(h) >= 0, h + ' in ' + line));
  assert.equal(line.replace(/<[^>]+>/g, ''), raw, 'the same text');
  // a year after "Oct" is not a count; a possessive keeps its count; a held code keeps its count; markup stays escaped
  assert.ok(line.indexOf('<span class="nw">2026') < 0 && line.indexOf(nw('Oct 2026') + ': ') >= 0, 'Oct 2026 held by escText as before, not as a count');
  assert.ok(f.escLine('X | Oct 2026: tested 4 managers’ explanations').indexOf(nw('4 managers’')) >= 0, 'possessive');
  assert.ok(!/<script/.test(f.escLine('X | Oct 2026: <script>3 bills</script>')), 'still escaped');
  // every published level's key and minimal-pass line: same text, and no hold inside an attribute
  const L = require('./articleship-work-simulation-lib.cjs');
  const E = require('../articleship-program/work-simulation/js/ws-engine.js');
  const cat = read(path.join(DATA, 'catalogue.json'));
  cat.levels.filter(l => l.published).forEach(m => {
    const lv = read(path.join(DATA, 'levels', m.id + '.json'));
    const dom = cat.domains.find(d => d.id === lv.domain);
    [L.keyAnswers(lv), L.minimalPassing(lv)].forEach(ans => {
      const clause = E.renderClause(lv, E.computeCounts(lv, ans)); if (!clause) return;
      const t = E.buildLine(dom.cvName, 'Oct 2026', clause), h = f.escLine(t);
      const back = h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/ /g, ' ');
      assert.equal(back, t.replace(/ /g, ' '), m.id + ': the same text');
      assert.equal((h.match(/<span\b/g) || []).length, (h.match(/<\/span>/g) || []).length, m.id + ': every hold closes');
    });
  });
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.match(css, /^\.line-text \{[^}]*text-wrap: pretty;[^}]*\}/m);
});

test('dt-3 round 3: a sampleGroups group with whole: true stays in one column (eight items or fewer); dt-3 holds its references', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const src = ui.slice(ui.indexOf('function sampleTask('), ui.indexOf('function fitSample('));
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const optLabel = (f, v) => ((f.options || []).filter(o => o.id === v)[0] || {}).label || String(v);
  const sampleTask = new Function('E', 'esc', 'escText', 'escNum', 'escLabel', 'capWord', 'gateField', 'optLabel', 'fieldAnswerText', 'itemSummary', 'wsTable', 'leadText',
    src + '; return sampleTask;')(E, esc, esc, esc, esc, s => s.charAt(0).toUpperCase() + s.slice(1), t => (t.fields || []).filter(f => f.gate)[0] || null,
    optLabel, (f, v) => optLabel(f, v), () => '', () => false, (f, s) => s);
  const dt3 = read(path.join(DATA, 'levels', 'dt-3.json'));
  const t4 = dt3.tasks.find(t => t.id === 't4');
  assert.deepEqual(t4.sampleGroups.map(g => g.whole === true), [true, false]);
  const key = () => { const a = {}; t4.items.forEach(it => { a[it.id] = Object.assign({}, it.answer); }); return a; };
  // the key's six papers in one wrapper, head first; "Left in the file" after it, outside
  const k = sampleTask(dt3, t4, key());
  assert.ok(k.indexOf('<div class="cols2 s-groups"><div class="g-whole"><div class="grp">The appeal set <span class="g-n">(6)</span></div>') === 0);
  assert.ok(k.indexOf('</div></div><div class="grp">Left in the file') > 0 && (k.match(/class="g-whole"/g) || []).length === 1);
  // every paper in: ten is over eight, so the list breaks across the columns as before (no wrapper)
  const all = key(); Object.keys(all).forEach(id => { all[id].inc = 'yes'; });
  assert.ok(sampleTask(dt3, t4, all).indexOf('g-whole') < 0);
  // a group without the key prints as before (fdd-1's four groups, acc-1's two)
  ['fdd-1', 'acc-1'].forEach(id => { const lv = read(path.join(DATA, 'levels', id + '.json')); const t = lv.tasks.find(x => x.sampleGroups); const a = {}; t.items.forEach(it => { a[it.id] = Object.assign({}, it.answer); }); assert.ok(sampleTask(lv, t, a).indexOf('g-whole') < 0, id); });
  // the wrapper does not break across columns and keeps the line and head styles
  assert.match(css, /\.sheet \.cols2\.s-groups > \.g-whole \{ break-inside: avoid; padding: 0; border-bottom: 0; \}/);
  assert.match(css, /\.sheet \.cols2\.s-groups > \.grp, \.sheet \.cols2\.s-groups > \.g-whole > \.grp \{/);
  // the validator: whole must be true
  const bad = JSON.parse(JSON.stringify(dt3)); bad.tasks.find(t => t.id === 't4').sampleGroups[1].whole = 'yes';
  assert.match(L.validateLevel(bad, { catalogue, world }).errors.join('\n'), /sampleGroups\[1\] whole must be true/);
  // dt-3's references hold to their numbers in every student string and paper title, never in the earned clause
  const REF = /\b(FY|AY|Forms?|[Ss]ection|[Ll]ines?|[Tt]ax year|[Aa]ssessment year) \d/;
  const student = JSON.stringify(Object.assign({}, dt3, { documents: undefined, earned: undefined }));
  assert.ok(!REF.test(student), 'a reference in student text ends a line apart from its number');
  dt3.documents.forEach(d => assert.ok(!REF.test(d.title), d.id + ' title'));
  assert.ok(JSON.stringify(dt3.earned).indexOf(' ') < 0 && JSON.stringify(dt3.earned).indexOf('⁠') < 0);
  assert.ok(dt3.tasks[0].questions[2].text.indexOf('respond-⁠by') >= 0, 'respond-by holds at its hyphen');
});

// dt-2 round 6 (designer S1): a tab or Other papers switch brought the framed row in 12 px under the top bar (or the
// desktop pane's top), so a frame below its table's head left the head above the view: Lothal's register row read
// "20,048 · 28,093 · 48,141" at 390 with "Jul–Sep (₹)" off the screen. Where the head and the frame fit together, the
// head now comes in with the frame; otherwise the frame's top, as before. Facts S1: Vaigai's Form 131 carries no
// certificate number of its own making, and its date is the Form's own "Last updated on". Designer optional 3: every
// hover look sits under @media (hover: hover), so a touch phone never keeps one on the control under the finger
test('dt-2 round 6: the framed row comes into view with its table head when both fit; Vaigai’s certificate; hover only where a pointer hovers', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const fn = ui.slice(ui.indexOf('  function focusTarget('), ui.indexOf('\n  }\n', ui.indexOf('  function focusTarget(')) + 4);
  const focusTarget = new Function(fn + '; return focusTarget;')();
  // phone 390, Lothal on the register: head at −100 (bottom −33), frame 136–185, view 60 (top bar) to 690 (item bar)
  assert.equal(focusTarget(-100, { top: 136, bottom: 185 }, 60, 690), -100, 'the head comes in with the frame');
  // a frame below the view, head and frame fitting: the head is brought to the top
  assert.equal(focusTarget(900, { top: 1100, bottom: 1170 }, 60, 690), 900);
  // desktop, Vindhya: head −148 and frame to 675 make 823 px against an 839 px pane less 24, so the frame's top as before
  assert.equal(focusTarget(-148, { top: 479, bottom: 675 }, 61, 900), null, 'frame in view, both do not fit: stays');
  assert.equal(focusTarget(-148, { top: 950, bottom: 1146 }, 61, 900), 950, 'too tall together: the frame’s top');
  // no head, or a head already in view: as before
  assert.equal(focusTarget(null, { top: 1100, bottom: 1170 }, 60, 690), 1100);
  assert.equal(focusTarget(null, { top: 300, bottom: 350 }, 60, 690), null);
  assert.equal(focusTarget(200, { top: 300, bottom: 350 }, 60, 690), null, 'head and frame in view: nothing moves');
  // a frame in view whose head is cut above it while both fit: the head comes in
  assert.equal(focusTarget(20, { top: 120, bottom: 170 }, 60, 690), 20);
  // showFocusRow reads the table's thead (a hidden head counts as none) and uses focusTarget in both branches
  const sfr = ui.slice(ui.indexOf('  function showFocusRow('), ui.indexOf('  function focusTarget('));
  assert.match(sfr, /tb = row\.closest\('table'\), th = tb && tb\.tHead, hr = th && th\.getBoundingClientRect\(\), ht = hr && hr\.height > 0 \? hr\.top : null;/);
  assert.match(sfr, /y = focusTarget\(ht, rb, pb\.top, Math\.min\(pb\.bottom, window\.innerHeight\)\);/);
  assert.match(sfr, /var y2 = focusTarget\(ht, rb, top, bottom\);/);
  // play.mjs fails a switch that leaves the head above the view while the head and the frame fit together
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.match(play, /hr\.top < b\.top && b\.bottom - hr\.top <= bottom - top - 24/);
  assert.match(play, /the framed row’s table head sits above the view while both fit/);
  // every documents table renders a thead (the general table, invoice, PO, GRN and mini tables)
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const lv = read(path.join(DATA, 'levels', 'dt-2.json'));
  ['tdsr-reg', 'f168'].forEach(id => assert.ok(/<thead>/.test(D.renderDocument(lv.documents.find(d => d.id === id), {})), id + ' has a thead'));
  // facts S1: no deductor-made certificate number; the Form's own date field
  const cert = lv.documents.find(d => d.id === 'cert-vaigai');
  assert.equal(cert.number, undefined);
  assert.ok(!/VASPL\/131/.test(JSON.stringify(lv)));
  assert.deepEqual(cert.fields[cert.fields.length - 1], { label: 'Last updated\u00a0on', value: '12-11-2026' });
  assert.ok(!/cd-no/.test(D.renderDocument(cert, {})), 'the card prints no number');
  // designer optional 3: no hover rule outside @media (hover: hover)
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  css.split('\n').filter(l => /:hover/.test(l)).forEach(l => assert.ok(/^@media \(hover: hover\) \{ .*:hover.* \} \}$/.test(l), 'hover outside the media query: ' + l));
  assert.ok((css.match(/@media \(hover: hover\)/g) || []).length >= 21);
});

test('sa-6 round 4: "Form 168" holds to its number; the main call is "Your call:" on every review row; Keep working opens the first item still to check', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const lv = read(path.join(DATA, 'levels', 'sa-6.json'));
  // editor S1 / designer S1 (made in the generator): a reference holds to its number in the app's own text and paper
  // titles, never in a paper's body or in the earned clause ("…to it and to Form" / "168:" at 360 px)
  const REF = /\b(Forms?|[Cc]lause|[Ll]ines?|[Ss]ection|[Tt]ax year) (\d)/;
  const own = Object.keys(lv).filter(k => k !== 'documents' && k !== 'earned').reduce((o, k) => { o[k] = lv[k]; return o; }, {});
  assert.ok(!REF.test(JSON.stringify(own)), 'a reference splits from its number');
  lv.documents.forEach(d => assert.ok(!REF.test(d.title), d.title));
  assert.ok(lv.tasks[2].prompt.indexOf('to it and to Form 168: enter') >= 0, lv.tasks[2].prompt);
  assert.ok(JSON.stringify(lv.earned).indexOf(' ') < 0, 'no no-break space in the line a student copies');
  // editor S2: Kudalwadi's note names the clue on the letterhead
  assert.match(lv.tasks[3].items.find(it => it.id === 'k10').note, /letterhead carries an Udyam number/);
  // designer optional 1: a partly right row says the gate "Your call:" too, never its field label ("Where it stands:")
  const line = name => { const i = ui.indexOf('  function ' + name + '('); return ui.slice(i, ui.indexOf('\n', i)); };
  const span = (from, to) => ui.slice(ui.indexOf('  function ' + from + '('), ui.indexOf(to, ui.indexOf('  function ' + from + '(')));
  const src = [line('arr'), line('escNum'), span('gateField', '  function itemSummary('), span('fieldAnswerText', '  function mark(')].join('\n');
  const U = new Function('E', 'esc', 'escLabel', src + '; return { itemAnswerHtml: itemAnswerHtml };')(E, D.esc, D.esc);
  const t4 = lv.tasks[3], naik = t4.items.find(it => it.id === 'k2');
  let h = U.itemAnswerHtml(t4, naik, { status: 'diff', cause: 'transit' });
  assert.ok(h.indexOf('<span class="k">Your call:</span> <span class="you-ok">') >= 0, h);
  assert.ok(h.indexOf('Where it stands') < 0 && h.indexOf('Why it differs:') >= 0, h);
  h = U.itemAnswerHtml(t4, naik, { status: 'agree' });
  assert.ok(h.indexOf('<span class="k">Your call:</span> <span class="you wrong">') >= 0 && h.indexOf('Where it stands') < 0, h);
  h = U.itemAnswerHtml(t4, naik, { status: 'diff', cause: 'sale' });
  assert.ok(h.indexOf('<span class="k">Your call:</span> ') >= 0, 'all right: one line, as before');
  // designer optional 2: the first item still to check, unless the student is on it; nothing on a handed-in task
  const go = new Function('E', 'esc', 'app', 'isLockedTask', 'answersOf', span('firstUnchecked', '  function taskNav(') + '; return itemGoAttr;');
  const all = {}; t4.items.forEach(it => { all[it.id] = Object.assign({}, it.answer); });
  delete all.k10;
  const ans = () => ({ t4: all });
  let fn = go(E, D.esc, { route: { name: 'task', task: 4 } }, () => false, ans);
  assert.equal(fn(lv, t4), ' data-href="#/l/sa-6/t/4/i/10"');
  fn = go(E, D.esc, { route: { name: 'item', task: 4, item: 10 } }, () => false, ans);
  assert.equal(fn(lv, t4), '', 'already on that item');
  fn = go(E, D.esc, { route: { name: 'task', task: 4 } }, () => true, ans);
  assert.equal(fn(lv, t4), '', 'handed in');
  fn = go(E, D.esc, { route: { name: 'task', task: 4 } }, () => false, () => ({ t4: Object.assign({}, all, { k10: { status: 'agree' } }) }));
  assert.equal(fn(lv, t4), '', 'every item checked');
  // both boxes use it, and Keep working follows the address before a slot or box
  const sm = ui.slice(ui.indexOf('  function openSubmitModal('), ui.indexOf('  function openHandInModal('));
  assert.match(sm, /if \(hereI && hereI\.type === 'items' && miss\.some\(function \(x\) \{ return x\.task === hereI; \}\)\) goSlot \+= itemGoAttr\(lv, hereI\);/);
  const hm = ui.slice(ui.indexOf('  function openHandInModal('), ui.indexOf('  function goToSlot('));
  assert.match(hm, /if \(task\.type === 'items' && missing > 0\) goSlot \+= itemGoAttr\(lv, task\);/);
  assert.match(ui, /var gto = b\.getAttribute\('data-goto'\), ghr = b\.getAttribute\('data-href'\);\n\s+closeModal\(\);\n\s+if \(ghr\) go\(ghr\);\n\s+else if \(gto\) goToSlot\(gto\);/);
});

test('sa-6 round 5: the March page holds "FY 26‑27" whole; play.mjs reads a digit–hyphen–digit break in a paper', () => {
  const D = require('../articleship-program/work-simulation/js/ws-docs.js');
  const lv = read(path.join(DATA, 'levels', 'sa-6.json'));
  // designer S1 (made in the generator): the locker narration read "… FY 26-" / "27" at 360, 390 and 412 px; a
  // non-breaking hyphen holds the year and no-break spaces hold "LKR 37" and "FY 26‑27" to their tags
  const mar = lv.documents.find(d => d.id === 'stmt-mar');
  const row = mar.rows.find(r => /LOCKER/.test(r.part));
  assert.equal(row.part, 'CHGS LOCKER RENT LKR 37 FY 26‑27');
  const h = D.renderDocument(mar, {});
  assert.ok(h.indexOf('26‑27') >= 0 && h.indexOf('FY 26-27') < 0, 'the paper prints the held year');
  // designer optional 2: a hyphen between two digits that starts a new line inside a paper is reported on the run's
  // line (a note, as the reference check is, while other levels' papers still show it); for-1 round 3 (designer S1)
  // made it a problem, once ws-docs held a short day-month date and no paper of any level broke one
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.match(play, /if \(host\.closest\('\.doc'\)\) \{\n\s+const dre = \/\\d-\\d\/g;/);
  assert.match(play, /\(out\.digits = out\.digits \|\| \[\]\)\.push\(/);
  assert.match(play, /if \(m\.digits && m\.digits\.length\) report\.digitBreaks\.push\(/);
  assert.ok(play.indexOf("report.problems.push('in a paper a hyphen between two digits starts a new line on '") >= 0);
  // editor S1 / S2: Kshitij c's note names the paper's clue; Bhadar's note says "bills nobody booked"
  const kc = lv.tasks[1].slots.find(s => s.id === 'kshitij').options.find(o => o.correct);
  assert.match(kc.why, /“as discussed on the phone”/);
  assert.ok(JSON.stringify(lv.documents).indexOf('as discussed on the phone') >= 0, 'the clue is in the paper');
  assert.match(lv.tasks[3].items.find(it => it.id === 'k9').note, /the worry is bills nobody booked, so search for those too/);
});

test('ba-1 round 3: the items work sample holds a hyphenated word whole in the detail, never in the student’s note; play.mjs reads a letter–hyphen line end', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('function sampleTask('), ui.indexOf('function fitSample('));
  const esc = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const optLabel = (f, v) => ((f.options || []).filter(o => o.id === v)[0] || {}).label || String(v);
  const sampleTask = new Function('E', 'esc', 'escText', 'escNum', 'escLabel', 'capWord', 'gateField', 'optLabel', 'fieldAnswerText', 'itemSummary', 'wsTable', 'leadText',
    src + '; return sampleTask;')(E, esc, esc, esc, esc, s => s.charAt(0).toUpperCase() + s.slice(1), t => (t.fields || []).filter(f => f.gate)[0] || null,
    optLabel, (f, v) => optLabel(f, v), () => '', () => false, (f, s) => s);
  const ba1 = read(path.join(DATA, 'levels', 'ba-1.json'));
  const t2 = ba1.tasks.find(t => t.id === 't2');
  const a = {}; t2.items.forEach(it => { a[it.id] = Object.assign({}, it.answer); });
  a.b03.note = 'part-paid EMI';
  const h = sampleTask(ba1, t2, a);
  // designer S1: "NPA (Sub-" / "standard; …)" ended three lines of the key's own A4 sample
  assert.ok(h.indexOf('(<span class="nw">Sub-standard</span>;') >= 0, 'the detail holds Sub-standard');
  assert.ok(!/\(Sub-standard/.test(h), 'no unheld Sub-standard left in a detail');
  assert.ok(h.indexOf('<i>part-paid EMI</i>') >= 0, 'the student’s own note is printed as typed');
  // a one-table sample (eight items or fewer) holds its Detail cell the same way
  const small = Object.assign({}, t2, { items: t2.items.slice(0, 4) });
  assert.ok(sampleTask(ba1, small, a).indexOf('<td><span class="nw">Sub-standard</span>;') >= 0, 'the Detail cell holds Sub-standard');
  // as a pattern: the printed note, an order's steps and a choice's question and picks hold theirs too (for-1's note
  // read "…and the tidy-" / "up would…" on its A4 page)
  assert.ok(src.indexOf('noteTitle(t, holdHyphens(escText(E.composeText(') >= 0 && src.indexOf("'<li>' + holdHyphens(escText(byId[id]") >= 0 && src.indexOf('picked.map(holdHyphens)') >= 0, 'compose, order and choice hold their hyphenated words');
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  assert.ok(play.indexOf("re = /[A-Za-z]-(?=[A-Za-z])/g") >= 0 && play.indexOf('a line of the printed work sample ends in a hyphen inside a word') >= 0, 'play.mjs guards the printed sample');
});

test('fdd-1 round 3: a one-column worksheet’s box asks for 5.5em on every phone width up to 479 px, and every key beside a unit fits it', () => {
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  // designer optional 2: below 380 px only, the label column was narrower at 390 (141 px on fdd-1) than at 375 (168 px)
  assert.match(css, /@media \(max-width: 479px\) \{\s*\.ws-one \.ws \.num input \{ flex-basis: 5\.5em; width: 5\.5em; \}\s*\.ws-one \.ws \.num \.unit \{ padding: 0 8px; \}\s*\}/);
  assert.ok(!/@media \(max-width: 379px\) \{\s*\.ws-one/.test(css), 'the 379 px rule is replaced, not doubled');
  // a box beside a unit ("days", "%") cannot grow past its 94 px; a box without one grows to its column. Every key of
  // every one-column worksheet beside a unit is at most seven characters (the probe typed each at 360–479 px: none cut)
  let seen = 0;
  levelFiles.forEach(f => {
    const lv = read(path.join(DATA, 'levels', f));
    lv.tasks.filter(t => t.type === 'worksheet' && t.layout === 'table' && (t.columns || []).length === 2).forEach(t => E.inputCells(t).forEach(cl => {
      const fmt = cl.cell.format || cl.col.format || '';
      if (!(cl.cell.unit || /^pct/.test(fmt))) return;
      const a = Math.abs([].concat(cl.cell.answer)[0]), s = String(a).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      seen++;
      assert.ok(s.length <= 7, lv.id + ' ' + t.id + ' ' + cl.key + ' key ' + s + ' is too long for a 94 px box beside its unit');
    }));
  });
  assert.ok(seen >= 5, 'the check reached the unit boxes (fdd-1 r8, r9, r10, r10w; tp-1)');
});

test('mat-1 round 3: a choice pick on the list goes under the item’s name on a phone; play.mjs fails a name past three lines; mat-1 holds every reference to its number', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  const play = fs.readFileSync(path.join(__dirname, 'fixtures', 'work-simulation-play.mjs'), 'utf8');
  // designer S3: only a chipC pick marks the row (a gate call and "Done" keep the chip beside the name)
  assert.ok(/else if \(chipC && ia\[chipC\.id\] && E\.fieldVisible\(chipC, ia\)\) \{ chip = [^;]+; pick = true; \}/.test(ui));
  assert.ok(ui.indexOf(`'<li><a class="irow' + (pick ? ' has-pick' : '') + '" href=`) >= 0);
  const m = /@media \(max-width: 479px\) \{\s*\.irow\.has-pick \{ grid-template-columns: 30px 1fr 18px; row-gap: 6px; \}\s*\.irow\.has-pick > \.mark \{ grid-row: 1 \/ span 2; \}\s*\.irow\.has-pick > \.chip \{ grid-column: 2; grid-row: 2; justify-self: start; max-width: 100%; \}\s*\.irow\.has-pick > \.chev \{ grid-column: 3; grid-row: 1 \/ span 2; \}\s*\}/.exec(css);
  assert.ok(m, 'the phone rule stacks the pick under the name');
  assert.ok(m.index > css.indexOf('.irow .chip { max-width: 140px;'), 'after the base chip rule, so it wins on a phone');
  assert.ok(play.indexOf('an item’s name on the list runs past three lines') >= 0, 'play.mjs guards the list on a phone');
  // second fixer: a pick row (has-pick) past three lines fails the run; a row beside a gate call is a note on the run line
  // (fdd-1's item 6 is four lines beside "No adjustment" at 390, text only fdd-1's fixer may change)
  assert.ok(play.indexOf("pick: !!el.closest('.has-pick')") >= 0 && /if \(tallPick\.length\) report\.problems\.push\(/.test(play) &&
    /if \(tallCall\.length\) report\.notes\.push\(\{ tall: /.test(play), 'a pick row fails, a call row is a note');
  assert.ok(play.indexOf('report.notes.some(n => n.tall)') >= 0, 'the note reaches the run line');
  // editor S1, designer S1, facts S1: no reference in mat-1's own text ends a line apart from its number; the CV line stays plain
  const lv = read(path.join(DATA, 'levels', 'mat-1.json'));
  const rest = JSON.stringify(Object.assign({}, lv, { earned: null }));
  assert.ok(!/(?<![\w-])((?:[Ss]ub-)?(?:[Ss]ections?|[Cc]lauses?)|Explanation|[Tt]ax year) (?=\d|\(|[IVX]+\b)/.test(rest), 'a reference with a plain space');
  assert.ok(!/(?<![\w-])([Rr]oute (?=[ABC]\b)|[Ll]ot (?=[12]\b))/.test(rest), 'a route or lot with a plain space');
  assert.ok(rest.indexOf('section 148') >= 0 && rest.indexOf('tax year 2026–27') >= 0);
  assert.ok(JSON.stringify(lv.earned).indexOf(' ') < 0, 'the line a student copies has no no-break space');
  // designer S2 and S4: the Income-tax Act's tab says which Act; the free line reads as the other levels' do
  assert.equal(lv.documents.find(d => d.id === 'ita').tab, 'Income-tax Act');
  assert.equal(lv.tasks.find(t => t.id === 't4').freeText.label, 'Your own line for Kaizad');
});

test('cl-1 round 3: an unfilled slot’s gap holds its name as its heading does; a pack group’s name and a review line never leave a word alone; cl-1 holds Mahesh’s file name', () => {
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  // the live note's gap goes through escLabel, as the slot's legend does ("MSME-" / "1" and a line starting "·" at 360)
  assert.ok(ui.indexOf(`'<span class="gap">' + escLabel(slot.label) + '</span>'`) >= 0, 'composePreview holds the gap');
  assert.ok(ui.indexOf(`'<span class="gap">' + esc(slot.label) + '</span>'`) < 0);
  // designer optionals 3 and 6: balance on the group's name span only, pretty on the review paragraph only
  assert.ok(/\.pack-group > summary \.pg-name \{ flex: 1 1 auto; min-width: 0; text-wrap: balance; \}/.test(css), 'pack group name balances');
  assert.ok(/\n\.ans \{ margin: 4px 0 0; font-size: 15px; line-height: 1\.45; text-wrap: pretty; \}/.test(css), 'review line wraps pretty');
  assert.ok(!/\.pg-name [.\w][^{]*\{[^}]*text-wrap/.test(css) && !/\.ans [.\w][^{]*\{[^}]*text-wrap/.test(css), 'no text-wrap reaches a held span inside');
  // designer M1, S1, optional 1: the attachment holds its date and opens the ageing; the print's write-back is a hand note
  const lv = read(path.join(DATA, 'levels', 'cl-1.json'));
  const att = lv.documents.find(d => d.id === 'mail-msme').attachments[0];
  assert.equal(att.doc, 'mse-ageing');
  assert.ok(/^(?:[^-_]|-⁠|_​)*$/.test(att.name), 'every hyphen and underscore in the file name is held');
  const age = lv.documents.find(d => d.id === 'mse-ageing');
  assert.ok(!(age.notes || []).length && age.annotations.some(a => a.kind === 'hand' && /written back/.test(a.text)));
  // play.mjs (mat-1 round 3): MGT-14's name is three lines beside its chip at 360 px
  assert.equal(lv.tasks[1].items.find(i => i.id === 'mgt14').label, 'MGT-14 · Board resolutions on borrowing');
});
