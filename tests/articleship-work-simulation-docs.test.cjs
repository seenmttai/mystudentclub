'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../articleship-program/work-simulation/js/ws-docs.js');
const demo = require('./fixtures/demo-level.json');
const clone = o => JSON.parse(JSON.stringify(o));
const doc = id => clone(demo.documents.find(d => d.id === id));
const EVIL = '<script>alert(1)</script>"\'><img src=x onerror=alert(2)>';

function deepEvil(o) {
  if (typeof o === 'string') return o + EVIL;
  if (Array.isArray(o)) return o.map(deepEvil);
  if (o && typeof o === 'object') {
    const out = {};
    Object.keys(o).forEach(k => { out[k] = ['type', 'style', 'tax', 'at', 'kind', 'color', 'shape', 'format', 'condition'].indexOf(k) >= 0 ? o[k] : deepEvil(o[k]); });
    return out;
  }
  return o;
}

test('every document type and style renders, and every string is escaped', () => {
  const seen = new Set();
  demo.documents.forEach(d => {
    seen.add(d.type + (d.style ? ':' + d.style : ''));
    const html = D.renderDocument(d, {});
    assert.match(html, /^<article class="doc doc-/);
    const bad = D.renderDocument(deepEvil(d), {});
    assert.ok(!/<script/i.test(bad), d.id + ' leaks a script tag');
    assert.ok(!/<img src=x/i.test(bad), d.id + ' leaks an img tag');
    assert.ok(!/" onerror/.test(bad), d.id + ' breaks out of an attribute');
  });
  ['invoice', 'po', 'grn', 'chat', 'bins', 'card'].forEach(t => assert.ok([...seen].some(s => s.split(':')[0] === t), 'fixture has ' + t));
  D.TABLE_STYLES.forEach(s => assert.ok(seen.has('table:' + s), 'fixture has table style ' + s));
  D.LETTER_STYLES.forEach(s => assert.ok(seen.has('letter:' + s), 'fixture has letter style ' + s));
  assert.match(D.renderDocument({ id: 'x', type: 'nonsense', title: EVIL }), /doc-unknown/);
  assert.ok(!/<script/.test(D.renderDocument({ id: 'x', type: 'nonsense', title: EVIL })));
});

test('tax invoice: HSN, CGST/SGST or IGST, totals, words, QR, Indian formatting', () => {
  const intra = D.renderDocument(doc('inv-1'));
  assert.match(intra, /Tax Invoice/);
  assert.match(intra, /HSN\/SAC/);
  assert.match(intra, /CGST @ 9%/); assert.match(intra, /SGST @ 9%/);
  assert.match(intra, /Central Tax/); assert.match(intra, /State Tax/);
  assert.match(intra, /Tax amount \(in words\)/); assert.match(intra, /INR Fifty Thousand Five Hundred Eighty Only/);
  assert.ok(!/IGST/.test(intra));
  assert.match(intra, /2,81,000\.00/);
  assert.match(intra, /25,290\.00/);
  assert.match(intra, /3,31,580\.00/);
  assert.match(intra, /INR Three Lakh Thirty One Thousand Five Hundred Eighty Only/);
  assert.match(intra, /Authorised Signatory/);
  assert.match(intra, /class="doc-scroll inv-scroll"/, 'the line table scrolls in its own box');
  assert.match(intra, /class="sl stick0"/, 'first column sticky');
  const inter = D.renderDocument(doc('inv-4'));
  assert.match(inter, /IGST @ 18%/); assert.match(inter, /Integrated Tax/); assert.ok(!/CGST/.test(inter));
  assert.match(inter, /<svg class="qr"/);
  assert.match(inter, /Consignee \(Ship to\)/);
  const tt = D.invoiceTotals(doc('inv-4'));
  assert.deepEqual([tt.taxable, tt.igst, tt.total], [154400, 27792, 182192]);
  const noWords = doc('inv-1'); delete noWords.amountInWords;
  assert.match(D.renderDocument(noWords), /INR Three Lakh Thirty One Thousand Five Hundred Eighty Only/, 'words generated when missing');
  assert.equal(D.qrSvg('a'), D.qrSvg('a'), 'QR pattern is deterministic');
});

test('invoice looks: tally by default, erp, dot and book as the vendor prints them', () => {
  assert.match(D.renderDocument(doc('inv-1')), /class="doc doc-invoice invs-tally"/);
  ['erp', 'dot', 'book'].forEach(st => {
    const d = doc('inv-1'); d.style = st;
    assert.match(D.renderDocument(d), new RegExp('class="doc doc-invoice invs-' + st + '"'));
  });
  const odd = doc('inv-1'); odd.style = '"><script>';
  assert.match(D.renderDocument(odd), /invs-tally/, 'an unknown look falls back to tally');
  const book = doc('inv-1'); book.style = 'book'; delete book.footer;
  assert.ok(!/computer generated/.test(D.renderDocument(book)), 'a handwritten bill book is not “computer generated”');
  assert.deepEqual(D.INVOICE_STYLES, ['tally', 'erp', 'dot', 'book']);
});

test('PO approval box, GRN, ledgers and statements', () => {
  const po3 = D.renderDocument(doc('po-3'));
  assert.match(po3, /Approved by/);
  assert.match(po3, /sbox empty/, 'blank approval box');
  assert.match(D.renderDocument(doc('po-1')), /S\. Kale/);
  assert.match(D.renderDocument(doc('po-1')), /1,47,000\.00|2,81,000\.00/);
  assert.match(D.renderDocument(doc('grn-4')), /grn-book/);
  assert.match(D.renderDocument(doc('grn-1')), /Goods Receipt Note/);
  const led = D.renderDocument(doc('led-purchase'));
  assert.match(led, /4,12,36,500\.00/);
  assert.match(led, /row-total/);
  assert.match(led, /class="doc-scroll"/);
  const pl = D.renderDocument(doc('pl'));
  assert.match(pl, /\(42\.10\)/, 'negatives in brackets on statements');
  assert.match(pl, /4,812\.40/);
  const sheet = D.renderDocument(doc('payments'));
  assert.match(sheet, /xl-letters/); assert.match(sheet, /Payments Q4/);
  assert.doesNotMatch(sheet, /stick1/, 'a sheet pins only its row numbers unless it asks to freeze');
  // freeze: true (val-1's DCF sheet) also pins column A: its letter, its heading and every label cell
  const frozen = D.renderDocument(Object.assign({}, doc('payments'), { freeze: true }));
  const nRows = (doc('payments').rows || []).length;
  assert.equal((frozen.match(/stick1/g) || []).length, nRows + 2);
  assert.match(frozen, /<th class="stick1">A<\/th>/);
  assert.equal((D.renderDocument(Object.assign({}, doc('pl'), { freeze: true })).match(/stick1/g) || []).length, 0, 'freeze is for sheets only');
  assert.match(D.renderDocument(doc('bank-stmt')), /Statement of Account/);
  assert.match(D.renderDocument(doc('gstr2b')), /pt-band/);
  assert.match(D.renderDocument(doc('stock-register')), /dt-register/);
});

test('letters: bullets, headings, numbered lists, tables and sign-offs', () => {
  const pol = D.renderDocument(doc('policy-purchase'));
  assert.match(pol, /<h4>4\. Approval of purchase orders<\/h4>/);
  assert.match(pol, /dt-mini/);
  assert.match(pol, /₹1,00,001 to ₹10,00,000/);
  const mn = D.renderDocument(doc('minutes-bm'));
  assert.match(mn, /<b>RESOLVED THAT<\/b>/);
  assert.match(mn, /<ul><li>Mr Anil Kesarkar/);
  assert.match(mn, /Chairman’s initials/);
  assert.match(D.renderDocument(doc('bank-notice')), /<ol><li>From <span class="nw">1 April 2027<\/span>/);   // sa-1 round 6: a day keeps its month and year
  assert.match(D.renderDocument(doc('mail-bills')), /em-file/);
  assert.match(D.renderDocument(doc('conf-avi')), /Yours faithfully/);
  assert.match(D.renderDocument(doc('note-stores')), /lts-note/);
  assert.match(D.renderDocument(doc('memo-cutoff')), /Internal memo/);
});

test('chat, stock room, bin card and small forms', () => {
  const people = { 'demo-senior': { name: 'Nita Sathe' }, 'demo-accountant': { name: 'Prakash Nair' } };
  const chat = D.renderDocument(doc('chat-client'), { person: id => people[id] });
  assert.equal((chat.match(/ch-msg me/g) || []).length, 2);
  assert.match(chat, /Prakash Nair/);
  const bins = D.renderDocument(doc('bins-store'));
  assert.equal((bins.match(/data-bin="/g) || []).length, 6);
  assert.match(bins, /bn-damaged/); assert.match(bins, /bn-dusty/); assert.match(bins, /bn-expired/);
  const card = D.renderBinCard(doc('bins-store'), 'a1');
  assert.match(card, /95 bags × 25 kg/);
  assert.match(card, /2,400 kg/);
  assert.match(D.renderBinCard(doc('bins-store'), 'a4'), /3 cartons × 12 cans \+ 6 loose/);
  assert.match(D.renderBinCard(doc('bins-store'), 'a3'), /Damaged cartons/);
  assert.equal(D.renderBinCard(doc('bins-store'), 'zz'), '');
  assert.match(D.renderDocument(doc('voucher-07')), /Revenue stamp/);
  assert.match(D.renderDocument(doc('tag-a1')), /cd-hole/);
  assert.match(D.renderDocument(doc('gate-slip')), /GI-5520/);
});

test('the shelf drawing adds up to the bin: one mark per pack, tens past 120, shapes by pack', () => {
  const marks = svg => (svg.match(/class="ct"/g) || []).length;
  const tens = svg => (svg.match(/class="ct-ten"/g) || []).length;
  const dots = svg => (svg.match(/class="lo"/g) || []).length;
  let r = D.shelfSvg(95, 0, '', ['bag', 'bags']);
  assert.equal(marks(r.svg), 95, 'every one of 95 bags is drawn');
  assert.match(r.svg, /shape-bag/); assert.equal(r.legend, '');
  r = D.shelfSvg(253, 0, '', ['carton', 'cartons']);
  assert.equal(marks(r.svg), 25 + 3); assert.equal(tens(r.svg), 25);
  assert.match(r.legend, /Each shape marked 10 is ten cartons/);
  r = D.shelfSvg(3, 6, 'damaged', ['carton', 'cartons']);
  assert.equal(marks(r.svg), 3); assert.equal(dots(r.svg), 6); assert.match(r.svg, /cond-damaged/);
  r = D.shelfSvg(0, 75, '', null);
  assert.equal((r.svg.match(/class="lo lo-ten"/g) || []).length, 7); assert.equal(dots(r.svg), 5); assert.match(r.legend, /ten loose pieces/);
  assert.match(D.shelfSvg(0, 0).svg, /Shelf empty/);
  assert.equal(D.packShape(['drum', 'drums']), 'drum'); assert.equal(D.packShape(['can', 'cans']), 'drum');
  assert.equal(D.packShape(['roll', 'rolls']), 'roll'); assert.equal(D.packShape(['sack']), 'bag'); assert.equal(D.packShape(undefined), 'box');
  assert.equal(D.typeLabel({ type: 'card', style: 'voucher' }), 'Voucher');
  assert.equal(D.typeLabel({ type: 'card' }), 'Slip');
});

test('bins: one bin shown as its own paper, several lots on one shelf, a spot with no bin card', () => {
  const d = { id: 'one', type: 'bins', title: 'Bin B1 · Shelf', room: 'Main stores, Bay B', grid: { rows: 1, cols: 2 }, show: 'b1',
    bins: [{ id: 'b1', pos: 'A1', item: 'Ball bearing 6205-2RS', unit: 'nos', tag: { text: '2,400 nos' },
      lots: [{ label: 'On the rack', cartons: 43, perCarton: 50 }, { label: 'Red tray', loose: 60, condition: 'damaged', remark: 'QC hold' }] },
    { id: 'b2', pos: 'A2', item: 'Dispatch bay', card: false, shelfTitle: 'In the bay', lots: [{ label: 'Pallet 1', cartons: 48, perCarton: 50, pack: ['carton', 'cartons'] }] }] };
  const html = D.renderDocument(d);
  assert.match(html, /^<article class="doc doc-bins bins-one"/);
  assert.ok(!/data-bin="/.test(html), 'a one-bin paper is not the plan');
  assert.match(html, /Bin card · A1/); assert.match(html, /2,400 nos/);
  assert.equal((html.match(/class="bc-lot"/g) || []).length, 2);
  assert.match(html, /On the rack<\/div>/); assert.match(html, /43 cartons × 50 nos/); assert.match(html, /60 loose/);
  assert.match(html, /Damaged cartons/); assert.match(html, /QC hold/);
  assert.equal((html.match(/class="shelf-svg/g) || []).length, 2, 'each lot is drawn on its own');
  const two = D.renderBinCard(d, 'b2');
  assert.match(two, /^<div class="bincard one">/); assert.ok(!/bc-tag/.test(two), 'no bin card'); assert.match(two, /In the bay/); assert.match(two, /48 cartons × 50/);
  const evil = D.renderDocument(deepEvil(d));
  assert.ok(!/<script/i.test(evil) && !/<img src=x/i.test(evil), 'lots and labels are escaped');
  // a bin without lots renders as before
  assert.match(D.renderBinCard(doc('bins-store'), 'a4'), /<div class="bc-shelf"><div class="bc-title">On the shelf<\/div><svg/);
  assert.match(D.renderDocument(Object.assign(doc('bins-store'), { show: 'zz' })), /Nothing here/);
});

test('annotations: stamps, handwriting, signatures, ticks and highlights', () => {
  const inv = D.renderDocument(doc('inv-1'));
  assert.match(inv, /ann ann-stamp ink-blue at-top-right/);
  assert.match(inv, /class="doc-paper pt-m"/, 'a band is kept clear for the stamp');
  assert.match(D.annotation({ kind: 'hand', text: 'x', at: { x: 60, y: 12 } }), /left:60%;top:12%/);
  assert.match(D.annotation({ kind: 'hand', text: 'x', at: '35%, 80%' }), /left:35%;top:80%/);
  assert.match(inv, /RECEIVED<br>25 MAR 2027/);
  assert.match(inv, /ann-flow/, 'inline handwriting flows at the end');
  assert.match(D.renderDocument(doc('grn-1')), /ann-round/);
  assert.match(D.renderDocument(doc('led-purchase')), /ann ann-tick ink-green/);
  assert.match(D.renderDocument(doc('led-purchase')), /<mark class="doc-hl hl-pink">30-Mar-27<\/mark>/);
  assert.match(D.renderDocument(doc('inv-4')), /<mark class="doc-hl hl-yellow">386\.00<\/mark>/);
  assert.match(D.renderDocument(doc('bank-notice')), /ann ann-sign/);
  const evil = D.annotation({ kind: 'stamp', text: EVIL, at: 'nowhere', color: 'chartreuse', rotate: 'x' });
  assert.ok(!/<script/.test(evil));
  assert.match(evil, /at-top-right/, 'unknown position falls back');
  assert.match(evil, /ink-red/, 'unknown ink falls back');
});

test('planted errors are never rendered; labels for tabs', () => {
  const d = doc('inv-2'); d.planted = ['Total overstated by ₹100 (internal)'];
  assert.ok(!/internal/.test(D.renderDocument(d)));
  assert.equal(D.tabLabel(doc('inv-1')), 'Bill');
  assert.equal(D.tabLabel({ type: 'table', style: 'tally', title: 'Purchases · Ledger extract' }), 'Ledger extract');
  assert.equal(D.tabLabel({ type: 'table', style: 'bank', title: 'Statement' }), 'Bank statement');
  assert.equal(D.typeLabel({ type: 'letter', style: 'minutes' }), 'Minutes');
  assert.deepEqual(D.posOf('B3'), { r: 1, c: 2 });
  assert.equal(D.posOf('3B'), null);
});

test('a table inside a letter prints money as the table documents do: paise to two places, whole rupees with none', () => {
  const dn = {
    id: 'dn', type: 'letter', style: 'letter', title: 'Debit note',
    body: ['We return the goods below.', { table: {
      columns: [{ key: 'p', label: 'Particulars' }, { key: 'r', label: 'Rate (₹)', format: 'inr' }, { key: 'a', label: 'Amount (₹)', format: 'inr' }, { key: 'n', label: 'Qty', format: 'num' }],
      rows: [{ p: 'Forged gear blank', r: 638, a: 25520, n: 40 }, { p: 'CGST @ 9%', a: 2296.8 }, { p: 'Total', a: 30113.6, _class: 'total' }] } }]
  };
  const html = D.renderDocument(dn, {});
  assert.match(html, />25,520\.00</); assert.match(html, />2,296\.80</); assert.match(html, />30,113\.60</);
  assert.ok(!/2,296\.8</.test(html), 'never one decimal');
  assert.match(html, />638</, 'a column of whole rupees prints no decimals');
  assert.match(html, />40</);
  // sa-1's debit note for Bill 4 reads like the ledger beside it
  const sa1 = require('../articleship-program/work-simulation/data/levels/sa-1.json');
  const dn04 = sa1.documents.find(d => d.id === 'dn-04');
  if (dn04) {
    const h = D.renderDocument(dn04, {});
    ['25,520.00', '2,296.80', '30,113.60'].forEach(v => assert.ok(h.indexOf('>' + v + '<') >= 0, 'dn-04 prints ' + v));
    assert.ok(h.indexOf('>638<') >= 0, 'the rate stays 638');
  }
});

test('a code of capitals, a hyphen and digits stays on one line in a document; dates and slash numbers hold; other hyphens are left alone', () => {
  const memo = { id: 'm', type: 'letter', style: 'memo', title: 'Note',
    body: ['Machine TC-35 and VMC-10 under approval CA-06; GRN-2027-03-0389; tags FA-27-01/1 to /6.',
           'Bill KS/2026-27/4418 of 29-03-2027, bearing 6306-ZZ, a cut-off, 18-Jul-2026.'] };
  const html = D.renderDocument(memo, {});
  ['TC-35', 'VMC-10', 'CA-06', 'GRN-2027-03-0389', 'FA-27-01/1'].forEach(code => assert.ok(html.indexOf('<span class="nw">' + code + '</span>') >= 0, code + ' is held together'));
  // sa-3 round 1: a whole date holds, and a slash number breaks only at a slash; "cut-off" is untouched
  ['29-03-2027', '18-Jul-2026'].forEach(x => assert.ok(html.indexOf('<span class="nw">' + x + '</span>') >= 0, x + ' is held together'));
  assert.ok(html.indexOf('<span class="nw">KS/2026-27/4418</span>') >= 0, 'KS/2026-27/4418 is held whole (ia-1 round 1: up to 16 characters)');
  assert.ok(html.indexOf('cut-off') >= 0 && html.indexOf('<span class="nw">cut-off') < 0, 'cut-off is untouched');
  // sa-2 round 1: a part code of digits and capitals is held too (a QC tag broke "6306-" / "ZZ")
  assert.ok(html.indexOf('<span class="nw">6306-ZZ</span>') >= 0, '6306-ZZ is held together');
  assert.ok(!/<span class="nw">27\//.test(html) && html.split('<span class="nw">KS').length === 2, 'no code rule holds a piece of the slash number');
});

test('a serial or item code with letters in its groups also stays on one line; nwCodes is shared with the app', () => {
  const card = { id: 'c', type: 'card', style: 'slip', title: 'Report', handwritten: true,
    fields: [{ label: 'Machine', value: 'V-850, serial SMT-V85-27-0114; T-250, serial YCS-T250-26-0611' },
             { label: 'Other', value: 'HTS-CMM-0726, laptops BN26-5531, GSTR-2B; CGST-SGST, IT/26-27/014, TD/PO/CAP/2026-27/004' }] };
  const html = D.renderDocument(card, {});
  ['SMT-V85-27-0114', 'YCS-T250-26-0611', 'HTS-CMM-0726', 'BN26-5531', 'GSTR-2B', 'V-850', 'T-250'].forEach(code => assert.ok(html.indexOf('<span class="nw">' + code + '</span>') >= 0, code + ' is held together'));
  assert.ok(html.indexOf('CGST-SGST') >= 0 && html.indexOf('<span class="nw">CGST-SGST') < 0, 'CGST-SGST is untouched');
  // sa-3 round 1: the hyphenated year of a slash number is held, with a break chance before it
  assert.ok(html.indexOf('<span class="nw">IT/26-27/014</span>') >= 0, 'IT/26-27/014 (ia-1 round 1: held whole)');
  assert.ok(html.indexOf('TD/PO/CAP/<wbr><span class="nw">2026-27</span>/004') >= 0, 'TD/PO/CAP/2026-27/004');
  assert.equal(D.nwCodes(D.esc('CNC TC-35 · FA-27-04')), 'CNC <span class="nw">TC-35</span> · <span class="nw">FA-27-04</span>');
  assert.equal(D.nwCodes(D.esc('Bill KS/2026-27/4418, a cut-off')), 'Bill KS/2026-27/4418, a cut-off');
});

test('an invoice line with a long description gets the wider pinned description on a phone (long-desc)', () => {
  const party = { name: 'A Ltd', address: 'Pune', gstin: '27AAAAA0000A1Z5', state: 'Maharashtra', stateCode: '27' };
  const base = { id: 'i', type: 'invoice', title: 'Bill', supplier: party, buyer: party, number: '1', date: '01-04-2027', tax: 'intra', total: 118 };
  const short = D.renderDocument(Object.assign({}, base, { lines: [{ desc: 'Bearings', hsn: '8482', qty: 1, unit: 'nos', rate: 100, taxable: 100, gstRate: 18 }] }), {});
  const long = D.renderDocument(Object.assign({}, base, { lines: [{ desc: 'Electrical maintenance contract, January 2027', note: 'This month: spindle motor rewound after a burnt winding, new bearings; servo cable set replaced.', hsn: '998717', qty: 1, unit: 'month', rate: 100, taxable: 100, gstRate: 18 }] }), {});
  assert.match(short, /<table class="inv-lines">/);
  assert.match(long, /<table class="inv-lines long-desc">/);
  const css = require('fs').readFileSync(require('path').join(__dirname, '../articleship-program/work-simulation/css/ws.css'), 'utf8');
  assert.equal((css.match(/\.doc-scroll \.inv-lines\.long-desc \.stick1 \{/g) || []).length, 3, 'in the container query and the media query, and narrower on a 360 px phone');
  // ia-1 round 1: under 380 px the long description is 9.5em, so the quantity and amount beside it can be read whole
  assert.match(css, /@media \(max-width: 380px\) \{\s*\.doc-scroll \.inv-lines\.long-desc \.stick1 \{ width: 9\.5em;/);
});

test('a mail attachment carries the badge of its file type: XLS for a workbook, DOC, IMG, else PDF', () => {
  const mail = { id: 'm', type: 'letter', style: 'email', title: 'Mail', from: 'A', to: 'B', subject: 'Files', body: ['See attached.'],
    attachments: ['Register.xlsx', 'Old.xls', 'Dump.csv', 'Note.docx', 'Photo.jpg', 'Report.pdf', 'Scan'] };
  const html = D.renderDocument(mail, {});
  const kinds = (html.match(/<span class="em-file[^"]*">/g) || []).map(s => s.replace(/.*em-file\s*|">$/g, '').trim());
  assert.deepStrictEqual(kinds, ['x-xls', 'x-xls', 'x-xls', 'x-doc', 'x-img', '', '']);
});

test('a table inside a mail pins its first column, so a paged figure keeps its row label', () => {
  const mail = { id: 'm', type: 'letter', style: 'email', title: 'Mail', from: 'A', to: 'B', subject: 'Working', body: ['Below.', { table: {
    columns: [{ key: 's', label: 'B2B' }, { key: 't', label: 'Taxable (₹)', format: 'inr' }, { key: 'g', label: 'SGST (₹)', format: 'inr' }],
    rows: [{ s: 'With CGST + SGST', t: 100000, g: 9000 }, { _class: 'total', s: 'Total', t: 100000, g: 9000 }] } }] };
  const html = D.renderDocument(mail, {});
  assert.match(html, /<th class="stick0">B2B<\/th><th class="r">Taxable/);
  assert.match(html, /<td class="stick0">With CGST \+ SGST<\/td><td class="r">1,00,000<\/td>/);
  assert.match(html, /<td class="stick0">Total<\/td>/);
  assert.equal((html.match(/stick0/g) || []).length, 3, 'only the first column');
});

test('val-1 round 1: a year or a range written with an en dash stays on one line in a document; document numbers are left', () => {
  const mail = { id: 'm', type: 'letter', style: 'email', title: 'Mail', from: { name: 'A B', email: 'a.b@email.com' },
    body: ['A company of ₹150–250 crore revenue: ₹60–75 lakh a year; provision made in 2022–23; the 12–14% range.',
           'Bill KS/2026-27/4418 of 29-03-2027, a cut-off.'] };
  const html = D.renderDocument(mail, {});
  // con-1 round 2: a range of amounts holds its unit word too ("₹150–250 crore", "₹60–75 lakh")
  ['₹150–250 crore', '₹60–75 lakh', '2022–23', '12–14%'].forEach(x => assert.ok(html.indexOf('<span class="nw">' + x + '</span>') >= 0, x + ' is held together'));
  assert.ok(html.indexOf('<span class="nw">KS/2026-27/4418</span>') >= 0 && html.indexOf('<span class="nw">29-03-2027</span>') >= 0, 'sa-3: numbers and dates by nwDates');
  assert.ok(html.indexOf('cut-off') >= 0 && html.indexOf('<span class="nw">cut-off') < 0, 'cut-off is untouched');
  assert.equal(D.nwRanges(D.esc('2025–26A and 2023–24')), '2025–26A and <span class="nw">2023–24</span>');
});

test('sa-2 round 1: a bin says its condition in a word and a listed bin carries the tick, both in its name', () => {
  const d = { id: 'plan', type: 'bins', title: 'Plan', grid: { rows: 1, cols: 3 },
    bins: [{ id: 'd1', pos: 'A1', item: 'Box', condition: 'wet', listed: true }, { id: 'e4', pos: 'A2', item: 'Shaft', condition: 'dusty' }, { id: 'a3', pos: 'A3', item: 'Flange' }] };
  const html = D.renderDocument(d);
  assert.match(html, /class="bn bn-wet bn-listed" data-bin="d1" aria-label="Bin A1: Box, wet, on the list"/);
  assert.match(html, /<span class="bn-cond">Wet<\/span>/);
  assert.match(html, /aria-label="Bin A2: Shaft, dusty"/); assert.match(html, /<span class="bn-cond">Dusty<\/span>/);
  assert.match(html, /class="bn" data-bin="a3" aria-label="Bin A3: Flange"/);
  assert.equal((html.match(/bn-cond/g) || []).length, 2);
});

test('sa-2 round 1: a part code like 6306-ZZ stays on one line, and a handwritten Z carries its bar', () => {
  const tag = D.renderDocument({ id: 'q', type: 'card', style: 'tag', title: 'QC tag', fields: [{ label: 'Item', value: 'Ball bearing 6306-ZZ' }, { label: 'Year', value: '2026-27 · 6205-2RS · 30-03-2027' }] });
  assert.match(tag, /<span class="nw">6306-<span class="zb">Z<\/span><span class="zb">Z<\/span><\/span>/);
  assert.match(tag, /<span class="nw">6205-2RS<\/span>/);
  assert.ok(tag.indexOf('<span class="nw">2026-27') < 0, 'a year range is left');
  assert.ok(tag.indexOf('<span class="nw">30-03-2027</span>') >= 0, 'a whole date holds (sa-3 round 1)');
  const slip = D.renderDocument({ id: 's', type: 'card', style: 'slip', title: 'Slip', fields: [{ label: 'Item', value: 'Ball bearing 6306-ZZ' }] });
  assert.ok(!/class="zb"/.test(slip), 'printed text keeps its plain Z');
  const plan = { id: 'p', type: 'bins', title: 'P', grid: { rows: 1, cols: 1 }, bins: [{ id: 'b2', pos: 'A1', item: 'Ball bearing 6306-ZZ', unit: 'nos' }] };
  assert.match(D.renderBinCard(plan, 'b2'), /<b class="hw">Ball bearing <span class="nw">6306-<span class="zb">Z/);
});

test('sa-3 round 1: documents hold whole dates, a slash number’s year and number-word compounds; codes and plain hyphens are unchanged', () => {
  const N = x => '<span class="nw">' + x + '</span>';
  assert.equal(D.nwDates(D.esc('Invoice YCS/2026-27/0418 dt 18-Jul-2026, order TD/PO/CAP/2026-27/004')),
    'Invoice ' + N('YCS/2026-27/0418') + ' dt ' + N('18-Jul-2026') + ', order TD/PO/CAP/<wbr>' + N('2026-27') + '/004');
  assert.equal(D.nwDates(D.esc('received 15-Feb-2027; LR 51906 dt 22-03-2027')), 'received ' + N('15-Feb-2027') + '; LR 51906 dt ' + N('22-03-2027'));
  assert.equal(D.nwDates(D.esc('2-axis, 10-inch chuck, 24-tool changer')), N('2-axis') + ', ' + N('10-inch') + ' chuck, ' + N('24-tool') + ' changer');
  ['a cut-off', 'GRN-2027-03-0389', '2027-03-24', 'books for 2026–27', 'HTS/CAL/27/0031', 'post 15/4', '1-Jan-27'].forEach(x =>
    assert.equal(D.nwDates(D.esc(x)), D.esc(x), x + ' is untouched'));
  // through t(): a code is still held by nwCodes, and a date in a register line card holds
  const card = { id: 'c', type: 'card', style: 'slip', title: 'Register line',
    fields: [{ label: 'Supplier’s invoice', value: 'SMT/26-27/0907 dt 22-03-2027' }, { label: 'Tag', value: 'FA-27-06' }] };
  const html = D.renderDocument(card, {});
  assert.ok(html.indexOf(N('SMT/26-27/0907') + ' dt ' + N('22-03-2027')) >= 0);
  assert.ok(html.indexOf(N('FA-27-06')) >= 0);
  // a bill whose every line has a services code says "Description of services"; goods, or a mix, keep "goods"
  const party = { name: 'A Ltd', address: 'Pune', gstin: '27AAAAA0000A1Z5', state: 'Maharashtra', stateCode: '27' };
  const bill = lines => D.renderDocument({ id: 'i', type: 'invoice', title: 'Bill', supplier: party, buyer: party, number: '1', date: '01-04-2027', tax: 'intra', lines }, {});
  const sv = { desc: 'Maintenance contract', hsn: '998717', qty: 1, unit: 'month', rate: 100, taxable: 100, gstRate: 18 };
  const gd = { desc: 'Bearings', hsn: '8482 10', qty: 1, unit: 'nos', rate: 100, taxable: 100, gstRate: 18 };
  assert.match(bill([sv, Object.assign({}, sv, { hsn: '9988' })]), /<th class="stick1">Description of services<\/th>/);
  assert.match(bill([gd]), /<th class="stick1">Description of goods<\/th>/);
  assert.match(bill([gd, sv]), /<th class="stick1">Description of goods<\/th>/);
  // the app's escText (browser-only file, read from its source) holds a month with its year: the CV line's "Oct 2026"
  const fs = require('fs'), path = require('path');
  const ui = fs.readFileSync(path.join(__dirname, '../articleship-program/work-simulation/js/ws-ui.js'), 'utf8');
  const escText = new Function('esc', 'D', ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle(')) + '; return escText;')(D.esc, D);
  const line = escText('Statutory Audit Work Simulation, MSC Articleship Program | Oct 2026: Vouched 6 bills; ready in March 2027');
  assert.ok(line.indexOf(N('Oct 2026')) >= 0 && line.indexOf(N('March 2027')) >= 0);
  assert.equal(escText('Marked 2026 rows'), 'Marked 2026 rows', 'not a month');
});

test('val-1 round 1: a sheet tab opens the paper it names when the app can, else it is a plain label', () => {
  const sheet = { id: 's', type: 'table', style: 'sheet', title: 'DCF', sheetName: 'DCF', otherSheets: ['Inputs', 'Value'],
    columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x' }] };
  const plain = D.renderDocument(clone(sheet), {});
  assert.ok(plain.indexOf('<span class="on">DCF</span>') >= 0);
  assert.ok(plain.indexOf('<span class="xl-label" aria-hidden="true">Inputs</span>') >= 0, 'a tab with nothing behind it is a label');
  assert.ok(!/<a |<button/.test(plain.slice(plain.indexOf('xl-tabs'))), 'no control without the app');
  const linked = D.renderDocument(clone(sheet), { sheetLink: n => n === 'Value' ? { open: '<a class="xl-link" href="#v" data-replace>', close: '</a>' } : null });
  assert.ok(linked.indexOf('<a class="xl-link" href="#v" data-replace>Value</a>') >= 0, 'Value opens its paper');
  assert.ok(linked.indexOf('<span class="xl-label" aria-hidden="true">Inputs</span>') >= 0);
  const evil = D.renderDocument(Object.assign(clone(sheet), { otherSheets: [EVIL] }), { sheetLink: () => null });
  assert.ok(!/<script/.test(evil) && !/<img src=x/.test(evil), 'tab names stay escaped');
});

test('gst-2 round 1: a plural code stays whole; a tab name or portal heading with a held code is one element; an item short repeating “Check” warns', () => {
  const N = x => '<span class="nw">' + x + '</span>';
  assert.equal(D.nwCodes('Chakan’s GSTR-1s and its GSTR-3Bs'), 'Chakan’s ' + N('GSTR-1s') + ' and its ' + N('GSTR-3Bs'));
  ['AJE-8', 'DRC-03', 'FA-08-112', 'GRN-2027-04-0007', 'GSTR-2B'].forEach(x => assert.equal(D.nwCodes('see ' + x + '.'), 'see ' + N(x) + '.', x + ' unchanged'));
  assert.equal(D.nwCodes('AJE-1st'), 'AJE-1st', 'a code run into a word is left alone');
  // the app's own escText (browser-only file) holds the plural the same way: hints, prompts, notes, the closing bubble
  const uiSrc = require('fs').readFileSync(require('path').join(__dirname, '../articleship-program/work-simulation/js/ws-ui.js'), 'utf8');
  const escTextUi = new Function('esc', 'D', uiSrc.slice(uiSrc.indexOf('function escNum('), uiSrc.indexOf('function escTitle(')) + '; return escText;')(D.esc, D);
  const said = escTextUi('is it in Chakan’s GSTR-1s? Then the 3Bs and GSTR-3Bs; AJE-8 and DRC-03 as before.');
  ['GSTR-1s', 'GSTR-3Bs', 'AJE-8', 'DRC-03'].forEach(x => assert.ok(said.indexOf(N(x)) >= 0, x + ' held in escText'));
  // the open tab and a label: one element inside the tab (a flex box), so the space before "Chakan" stays
  const sheet = { id: 's', type: 'table', style: 'sheet', title: 'GSTR-9', sheetName: 'GSTR-9 Chakan', otherSheets: ['QC-0034', 'Notes'],
    columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x' }] };
  const html = D.renderDocument(clone(sheet), {});
  assert.ok(html.indexOf('<span class="on"><span class="xl-tname">' + N('GSTR-9') + ' Chakan</span></span>') >= 0, 'open tab: one name element');
  assert.ok(html.indexOf('<span class="xl-label" aria-hidden="true"><span class="xl-tname">' + N('QC-0034') + '</span></span>') >= 0, 'label: one name element');
  assert.ok(html.indexOf('<span class="xl-label" aria-hidden="true">Notes</span>') >= 0, 'a plain name keeps its markup');
  // sa-4 round 5: never the Name Box's class (xl-1's .xl-name is a flex box with a border), which split it again
  assert.ok(!/<span class="on"><span class="xl-name"/.test(html) && !/xl-label[^>]*><span class="xl-name"/.test(html), 'the tab name is not styled as the Name Box');
  assert.ok(!/\.xl-tname\b/.test(require('fs').readFileSync(require('path').join(__dirname, '../articleship-program/work-simulation/css/ws.css'), 'utf8')), 'an unstyled inline span, so it is one item of its tab');
  const linked = D.renderDocument(clone(sheet), { sheetLink: n => n === 'QC-0034' ? { open: '<a class="xl-link" href="#q" data-replace>', close: '</a>' } : null });
  assert.ok(linked.indexOf('<a class="xl-link" href="#q" data-replace><span class="xl-tname">' + N('QC-0034') + '</span></a>') >= 0, 'link: one name element');
  // the portal heading is one span; only the subtitle takes the light style
  const portal = D.renderDocument({ id: 'p', type: 'table', style: 'portal', title: 'GSTR-1', heading: 'GSTR-1 · Credit / debit notes',
    subtitle: 'Filed return · extract', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x' }] });
  // (sa-1 round 5: a heading's and a subtitle's middot holds to the word before it, so no line starts with "·")
  assert.ok(portal.indexOf('<div class="pt-title"><span class="pt-h">' + N('GSTR-1') + '\u00a0· Credit / debit notes</span><span class="pt-sub">Filed return\u00a0· extract</span></div>') >= 0, portal.slice(portal.indexOf('pt-title') - 12, portal.indexOf('pt-title') + 200));
  // the CSS draws only the tab itself, never a held code inside its name, and keeps the row number's ink on a muted row
  const css = require('fs').readFileSync(require('path').join(__dirname, '../articleship-program/work-simulation/css/ws.css'), 'utf8');
  assert.ok(!/\.xl-tabs span[ .{]/.test(css) && /\.xl-tabs > span \{ padding/.test(css), 'tab rules are child selectors');
  assert.ok(!/\.pt-title span[ .{]/.test(css) && /\.pt-title > \.pt-sub \{/.test(css), 'only the subtitle is light');
  assert.match(css, /\.dt-sheet \.row-muted td\.xl-rn \{ color: #555; \}/);
  // the validator: the list's main button adds "Check" itself
  const L = require('./articleship-work-simulation-lib.cjs');
  const lv = clone(require('./fixtures/demo-level.json'));
  const items = lv.tasks.find(t => t.type === 'items');
  items.items[0].short = 'Check Bill 1';
  assert.match(L.validateLevel(lv, { fixture: true }).warns.join('\n'), /the main button adds “Check”; give the name only/);
  items.items[0].short = 'Bill 1';
  assert.ok(!/the main button adds/.test(L.validateLevel(lv, { fixture: true }).warns.join('\n')));
});

test('ia-1 round 1: a slash number of up to 16 characters is held whole, a list of them still breaks after its commas, and an e-mail in a table cell breaks only after its @', () => {
  const N = x => '<span class="nw">' + x + '</span>';
  assert.equal(D.nwDates(D.esc('PCCS/26-27/0162, PCCS/26-27/0171')), N('PCCS/26-27/0162') + ', ' + N('PCCS/26-27/0171'), 'two held numbers, the break after the comma kept');
  assert.equal(D.nwDates(D.esc('Quotation comparison QC/26-27/0176 · RC/26-27/02 · KF/PO/25-26/2491')),
    'Quotation comparison ' + N('QC/26-27/0176') + ' · ' + N('RC/26-27/02') + ' · ' + N('KF/PO/25-26/2491'));
  assert.equal(D.nwDates(D.esc('YCS/2026-27/0418; TD/PO/2026-27/0968; TD/PO/CAP/2026-27/004')), N('YCS/2026-27/0418') + '; TD/PO/<wbr>' + N('2026-27') + '/0968; TD/PO/CAP/<wbr>' + N('2026-27') + '/004', 'over 16 characters: the break chance at the slash stays');
  assert.equal(D.nwDates(D.esc('Debit note against your bill KPT/0389 dated 13-07-2026')), 'Debit note against your bill KPT/0389 dated ' + N('13-07-2026'));
  const reg = { id: 'vm', type: 'table', style: 'register', title: 'Vendor master', columns: [{ key: 'v', label: 'Vendor' }, { key: 'e', label: 'Registered e-mail' }, { key: 'b', label: 'Bills' }],
    rows: [{ v: 'Shikrapur Corrugated Boxes', e: 'shikrapur.boxes@email.com', b: 'PCCS/26-27/0162, PCCS/26-27/0171' }] };
  const html = D.renderDocument(reg, {});
  assert.ok(html.indexOf('shikrapur.boxes@<wbr>email.com') >= 0, 'the address may break after its @ only');
  assert.ok(html.indexOf(N('PCCS/26-27/0162') + ', ' + N('PCCS/26-27/0171')) >= 0, 'a table cell holds the numbers too');
  const mail = { id: 'm', type: 'letter', style: 'email', title: 'Mail', from: { name: 'A', email: 'a.b@email.com' }, body: ['Write to shikrapurboxes@email.com today.'] };
  assert.ok(D.renderDocument(mail, {}).indexOf('@<wbr>') < 0, 'only a table cell gets the break chance');
  assert.equal(D.mailBreak('Rs 5@10.00'), 'Rs 5@10.00');
});

test('sa-4 round 2: a marked row’s pinned cells are opaque, the sheet corner draws its grid line, a missed weighted item says its weight', () => {
  const fs = require('node:fs'), path = require('node:path');
  const APP = path.join(__dirname, '..', 'articleship-program', 'work-simulation');
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  // the renderer puts the mark on the row and the pin on the cell, so the opaque rule must name both (0,3,1 beats the
  // see-through .row-hl.hl-* td at 0,2,1 and the pinned white at 0,2,0)
  const sheet = { id: 's', type: 'table', style: 'sheet', title: 'S', freeze: true, columns: [{ key: 'a', label: 'A' }, { key: 'b', label: 'B', format: 'int' }],
    rows: [{ a: 'E1 One', b: 1, _hl: true }, { a: 'E2 Two', b: 2, _hl: 'green' }] };
  const html = D.renderDocument(sheet, {});
  assert.match(html, /<tr class="[^"]*row-hl hl-yellow[^"]*"><td class="xl-rn stick0">/);
  assert.match(html, /row-hl hl-green/);
  ['yellow', 'green', 'pink', 'blue'].forEach(c => {
    const m = new RegExp('\\.row-hl\\.hl-' + c + ' td\\.stick0, \\.row-hl\\.hl-' + c + ' td\\.stick1 \\{ background: #([0-9A-F]{6}); \\}').exec(css);
    assert.ok(m, c + ': pinned cells of a marked row get an opaque colour');
  });
  assert.match(css, /\.dt-sheet \.xl-corner\.stick0::before/);
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  assert.match(ui, /function weightLine\(task, it, sc\)/);
  assert.match(ui, /weightLine\(task, it, sc\) \+ itemAnswerHtml/);
  assert.match(css, /\.nrow \.n-weight \{/);
});

test('sa-5 round 1: a statement with notesNumbered prints its notes as a numbered list under “Notes”; without it, bullets as before; the list button holds an item’s name', () => {
  const fs = require('node:fs'), path = require('node:path');
  const APP = path.join(__dirname, '..', 'articleship-program', 'work-simulation');
  const base = { id: 'r', type: 'table', style: 'statement', title: 'Results', columns: [{ key: 'a', label: 'Particulars' }, { key: 'b', label: 'Q2', format: 'num' }],
    rows: [{ a: 'Revenue', b: 1 }], notes: ['Placed before the board.', 'Same policies as last year.'] };
  const num = D.renderDocument(Object.assign(clone(base), { notesNumbered: true }), {});
  assert.match(num, /<p class="dt-notes-h">Notes<\/p><ol class="dt-notes"><li>Placed before the board\.<\/li><li>Same policies as last year\.<\/li><\/ol>/);
  assert.ok(!/<ul class="dt-notes">/.test(num));
  const plain = D.renderDocument(clone(base), {});
  assert.match(plain, /<ul class="dt-notes"><li>Placed/);
  assert.ok(!/dt-notes-h/.test(plain));
  const css = fs.readFileSync(path.join(APP, 'css', 'ws.css'), 'utf8');
  assert.match(css, /ol\.dt-notes \{ list-style: decimal;/);
  const ui = fs.readFileSync(path.join(APP, 'js', 'ws-ui.js'), 'utf8');
  assert.match(ui, /'">Check ' \+ esc\(lab\)\.replace\(\/ \(\?=\\d\)\/g, '&nbsp;'\)/);
  // the same rule, run: a number holds to its word, words alone may wrap
  const hold = s => D.esc(s).replace(/ (?=\d)/g, '&nbsp;');
  assert.equal(hold('Line 1'), 'Line&nbsp;1');
  assert.equal(hold('Purchase 10'), 'Purchase&nbsp;10');
  assert.equal(hold('Leave encashment'), 'Leave encashment');
});

test('sa-5 round 1: the validator takes notesNumbered only as a boolean on a table that has notes', () => {
  const L = require('./articleship-work-simulation-lib.cjs');
  const lv = clone(demo);
  const t = lv.documents.find(d => d.type === 'table');
  t.notes = ['The results follow the same accounting policies as last year.'];
  t.notesNumbered = true;
  assert.ok(!L.validateLevel(lv, { fixture: true }).errors.some(x => /notesNumbered/.test(x)));
  t.notesNumbered = 'yes';
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /notesNumbered must be true or false/);
  t.notesNumbered = true;
  delete t.notes;
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /notesNumbered must be true or false, on a table with notes/);
});

test('dt-3: a section number with its brackets stays on one line, in the documents and in the app text', () => {
  const html = D.renderDocument({ id: 'n', type: 'letter', style: 'notice', title: 'Notice', body: [
    'Proposed under section 143(1)(a)(iv); employees’ PF under section 36(1)(va) and income under 2(24)(x); the return under section 139(1).',
    'Section 43B, a fee of ₹1,000 (₹) and Form 35 (2 copies) are left alone.'] });
  ['143(1)(a)(iv)', '36(1)(va)', '2(24)(x)', '139(1)'].forEach(x => assert.ok(html.indexOf('<span class="nw">' + x + '</span>') >= 0, x + ' is held together'));
  ['43B', '(₹)', '(2 copies)'].forEach(x => assert.ok(html.indexOf('<span class="nw">' + x) < 0, x + ' is left alone'));
  assert.equal(D.nwSections(D.esc('section 270(2) and 143(1)(a)')), 'section <span class="nw">270(2)</span> and <span class="nw">143(1)(a)</span>');
  // the app's escText (browser-only file) holds them the same way
  const fs = require('fs'), path = require('path');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'articleship-program', 'work-simulation', 'js', 'ws-ui.js'), 'utf8');
  const src = ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle('));
  const escText = new Function('esc', 'D', src + '; return escText;')(D.esc, D);
  const out = escText('Our response under section 143(1)(a) of the Income-tax Act, 1961: ₹61,20,000 paid before the due date under section 139(1).');
  ['143(1)(a)', '139(1)', '₹61,20,000'].forEach(x => assert.ok(out.indexOf('<span class="nw">' + x + '</span>') >= 0, x + ' is held together in escText'));
  assert.ok(out.indexOf('<span class="nw">1961') < 0, 'a year alone is left alone');
  // the work sample prints the Detail column only when some item has a detail or a note (dt-3's appeal set has neither)
  assert.match(ui, /showDet \? '<th>Detail<\/th>' : ''/);
  assert.match(ui, /var showDet = lns\.some\(function \(x\) \{ return x\.det \|\| x\.note; \}\);/);
});

test('xl-1: a headless sheet numbers its own first rows from 1; an excerpt keeps its rows’ numbers and its columns’ letters; a number stored as text sits on the left with its mark', () => {
  const cols = [{ key: 'a', label: 'Date' }, { key: 'b', label: 'Particulars' }, { key: 'g', label: 'Taxable', format: 'inr', letter: 'G' }];
  const raw = D.renderDocument({ id: 'r', type: 'table', style: 'sheet', title: 'Raw', headless: true, columns: cols,
    rows: [{ b: 'Tamhini Drivetech Private Limited' }, { a: 'Date', b: 'Particulars', g: 'Taxable Value' }, { a: '05-Jan-2027', b: 'Moshi Corrugators', g: 249500 }] });
  assert.ok(raw.indexOf('Taxable Value') > 0 && raw.indexOf('<th class="xl-rn stick0">') < 0, 'no row of column labels');
  assert.match(raw, /<td class="xl-rn stick0">1<\/td>/, 'the first data row is row 1');
  assert.match(raw, /<td class="xl-rn stick0">3<\/td>/);
  assert.match(raw, /<th>A<\/th><th>B<\/th><th>G<\/th>/, 'a column keeps its own letter');
  const ex = D.renderDocument({ id: 'x', type: 'table', style: 'sheet', title: 'Rows 14', headless: true, columns: cols,
    rows: [{ _rn: 5, a: 'Date', b: 'Particulars', g: 'Taxable Value' }, { _rn: 14, _txt: ['g'], a: '12-Jan-2027', b: 'Hebbal Tooling Solutions Private Limited', g: '304500.00' }] });
  assert.match(ex, /<td class="xl-rn stick0">5<\/td>/);
  assert.match(ex, /<td class="xl-rn stick0">14<\/td>/);
  assert.match(ex, /<td class=" ?nw xl-txt">304500\.00<span class="vh"> \(number stored as text\)<\/span><\/td>/, 'left of the cell (no r), marked');
  // without the options a sheet renders as before: a label row numbered 1, data from 2, letters A, B, C
  const plain = D.renderDocument({ id: 'p', type: 'table', style: 'sheet', title: 'P', columns: [{ key: 'a', label: 'A1' }, { key: 'g', label: 'G1', format: 'inr' }], rows: [{ a: 'x', g: 1 }] });
  assert.match(plain, /<th class="xl-rn stick0">1<\/th>/);
  assert.match(plain, /<td class="xl-rn stick0">2<\/td>/);
  assert.match(plain, /<th>A<\/th><th>B<\/th>/);
  // the validator takes them only on a sheet, in their own shapes
  const L = require('./articleship-work-simulation-lib.cjs');
  const lv = JSON.parse(JSON.stringify(require('./fixtures/demo-level.json')));
  const t = lv.documents.find(d => d.type === 'table' && d.style !== 'sheet');
  t.headless = true; t.rows[0]._rn = 0;
  const errs = L.validateLevel(lv, { fixture: true }).errors.join('\n');
  assert.match(errs, /headless must be true, on a sheet/);
  assert.match(errs, /_rn must be a row number, on a sheet/);
});

test('a row framed for one item (`_focus`, from the item’s docRow, sa-6)', () => {
  const t = { id: 'trk', type: 'table', style: 'sheet', title: 'Tracker · sheet', columns: [{ key: 'p', label: 'Party' }],
    rows: [{ _id: 'c01', p: 'Ashvaratha', _hl: true }, { _id: 'c02', p: 'Kshitij', _hl: true, _focus: true }] };
  const html = D.renderDocument(t);
  assert.match(html, /<tr class="row-data row-hl hl-yellow row-focus" data-row="c02">/);
  assert.match(html, /<tr class="row-data row-hl hl-yellow" data-row="c01">/);
  // the validator: docRow names a table the item or its task shows, and a row in it
  const L = require('./articleship-work-simulation-lib.cjs');
  const lv = JSON.parse(JSON.stringify(require('./fixtures/demo-level.json')));
  const task = lv.tasks.find(x => x.type === 'items');
  const tbl = lv.documents.find(d => d.type === 'table' && (task.docs || []).concat(...task.items.map(i => i.docs || [])).includes(d.id));
  tbl.rows[0]._id = 'r-one';
  task.items[0].docRow = { [tbl.id]: 'r-one' };
  if (!(task.items[0].docs || []).includes(tbl.id) && !(task.docs || []).includes(tbl.id)) task.docs = (task.docs || []).concat(tbl.id);
  let errs = L.validateLevel(lv, { fixture: true }).errors.join('\n');
  assert.ok(!/docRow/.test(errs), errs);
  task.items[0].docRow = { [tbl.id]: 'r-none' };
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /has no row with _id r-none/);
  task.items[0].docRow = { nope: 'r-one' };
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /docRow names nope, which is not a table document/);
  // dt-2 round 3: a list of row ids, every one a row of that paper; an empty list or a missing id is an error
  if (tbl.rows.length > 1) tbl.rows[1]._id = 'r-two';
  task.items[0].docRow = { [tbl.id]: tbl.rows.length > 1 ? ['r-one', 'r-two'] : ['r-one'] };
  errs = L.validateLevel(lv, { fixture: true }).errors.join('\n');
  assert.ok(!/docRow/.test(errs), errs);
  task.items[0].docRow = { [tbl.id]: ['r-one', 'r-none'] };
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /has no row with _id r-none/);
  task.items[0].docRow = { [tbl.id]: [] };
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /docRow: \S+ lists no row ids/);
});

test('gst-3 round 1: a debit note printed as a letter carries the e-invoice block (QR, IRN, Ack No., Ack Date) when it has an IRN; without one, none', () => {
  const irn = 'a'.repeat(64);
  const dn = { id: 'dn', type: 'letter', style: 'letter', title: 'Debit note', letterhead: { name: 'Supplier Pvt Ltd', address: 'Pune' },
    ref: 'Debit note DN/1', date: '22-02-2027', irn: irn, ackNo: '132700000000001', ackDate: '22-02-2027', body: ['Dear Sir/Madam,'] };
  const html = D.renderDocument(dn, {});
  assert.match(html, /<div class="inv-top lt-irn"><div class="inv-irn"><svg class="qr"/);
  assert.ok(html.indexOf(irn) > 0 && html.indexOf('132700000000001') > 0 && html.indexOf('Ack Date') > 0);
  assert.ok(html.indexOf('inv-irn') < html.indexOf('lt-refs'), 'the block sits above Ref and Date');
  delete dn.irn;
  assert.ok(!/inv-irn/.test(D.renderDocument(dn, {})));
  // an invoice's block is unchanged
  const inv = doc(demo.documents.find(d => d.type === 'invoice').id);
  inv.irn = irn; inv.ackNo = '1'; inv.ackDate = '1-1-2027';
  assert.match(D.renderDocument(inv, {}), /<div class="inv-top"><div class="inv-irn"><svg class="qr"/);
});

test('xl-1 round 1: a sheet’s Name Box (formulaCell), a mail chip that downloads the level’s file, formula options in mono, papers folded in the pack (packGroup), and their validator rules', () => {
  // the Name Box sits before fx, only for a cell address
  const sheet = extra => D.renderDocument(Object.assign({ id: 's', type: 'table', style: 'sheet', title: 'Varun', formula: '=SUMIFS($H$6:$H$71, $G$6:$G$71, Q5)',
    columns: [{ key: 'q', label: 'Q' }], rows: [{ q: 'Ledger' }] }, extra), {});
  assert.match(sheet({ formulaCell: 'R5' }), /<div class="xl-bar"><span class="xl-name">R5<\/span><span class="xl-fx">fx<\/span>/);
  assert.ok(!/xl-name/.test(sheet({})) && !/xl-name/.test(sheet({ formulaCell: 'r5<b>' })), 'no box without a cell address');
  // a chip given as { name, file } links to files/<level id>/<file> when the app passes the level id; a plain name stays a chip
  const mail = { id: 'm', type: 'letter', style: 'email', title: 'Mail', subject: 'S', from: { name: 'Pallavi Shinde' }, to: [{ name: 'Aarti Rane' }], body: ['Hi'],
    attachments: [{ name: 'Purchase_register.xlsx', file: 'book one.xlsx' }, 'TB.pdf'] };
  const linked = D.renderDocument(mail, { levelId: 'xl-1' });
  assert.match(linked, /<a class="em-file x-xls" href="files\/xl-1\/book%20one\.xlsx" download><span class="em-name">Purchase_register\.xlsx<\/span><\/a>/);
  assert.match(linked, /<span class="em-file"><span class="em-name">TB\.pdf<\/span><\/span>/);
  assert.match(D.renderDocument(mail, {}), /<span class="em-file x-xls"><span class="em-name">Purchase_register\.xlsx<\/span><\/span>/, 'without a level id, a chip as before');
  // the app's choice options with code: true are set in .fx; papers sharing a packGroup fold into one entry
  const fs = require('fs'), path = require('path');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'articleship-program', 'work-simulation', 'js', 'ws-ui.js'), 'utf8');
  const optText = new Function('esc', 'escText', ui.slice(ui.indexOf('function optText('), ui.indexOf('function choiceTask(')) + '; return optText;')(D.esc, s => 'T:' + s);
  assert.equal(optText({ code: true }, '=SUM(Raw!H6:H55) & <x>'), '<span class="fx">=SUM(<wbr>Raw!<wbr>H6:H55) &amp; &lt;x&gt;</span>');
  assert.equal(optText({}, 'Plain'), 'T:Plain');
  const packFold = new Function(ui.slice(ui.indexOf('function packFold('), ui.indexOf('var TYPE_ICON')) + '; return packFold;')();
  const d = (id, extra) => Object.assign({ id: id }, extra);
  const groups = [{ doc: d('mail'), index: 0 }, { group: 'i01', label: 'Rows 1–4', docs: [{ doc: d('ex-01', { packGroup: 'Rows' }), index: 1 }] },
    { doc: d('tb'), index: 2 }, { group: 'i02', label: 'Row 6', docs: [{ doc: d('ex-02', { packGroup: 'Rows' }), index: 3 }] }];
  const out = packFold(groups);
  assert.deepEqual(out.map(g => g.pack || (g.doc && g.doc.id)), ['mail', 'Rows', 'tb'], 'one entry where the first of them stands');
  assert.equal(out[1].n, 2);
  assert.deepEqual(packFold(groups.slice(0, 1)).map(g => g.doc.id), ['mail'], 'without packGroup, as before');
  // validator
  const L = require('./articleship-work-simulation-lib.cjs');
  const lv = clone(demo);
  const sh = lv.documents.find(x => x.type === 'table');
  sh.formulaCell = 'R5';
  let errs = L.validateLevel(lv, { fixture: true }).errors.join('\n');
  assert.match(errs, /formulaCell must be a cell address like R5, on a sheet with a formula/);
  delete sh.formulaCell;
  sh.packGroup = 'Alone';
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /packGroup must be a label two or more papers share/);
  lv.documents.filter(x => x.type === 'table').slice(0, 2).forEach(x => { x.packGroup = 'Two'; });
  assert.ok(!/packGroup/.test(L.validateLevel(lv, { fixture: true }).errors.join('\n')));
  const ch = lv.tasks.find(t => t.type === 'choice');
  ch.questions[0].code = 'yes';
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /code must be true or false/);
  ch.questions[0].code = true;
  const em = lv.documents.find(x => x.type === 'letter');
  em.attachments = [{ name: 'A.xlsx' }];
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /attachment 1 must be a name or \{ name, file \}/);
  em.attachments = ['A.pdf', { name: 'A.xlsx', file: 'a.xlsx' }];
  assert.ok(!/attachment|code must/.test(L.validateLevel(lv, { fixture: true }).errors.join('\n')));
});

test('xl-1 round 1: on a headless sheet text runs on over the empty cells to its right (Excel’s overflow), never from a frozen sheet’s pinned column, a number, a number stored as text or right-aligned text', () => {
  const cols = [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C', format: 'text', align: 'right' }, { key: 'h', label: 'H', format: 'amount' }, { key: 'm', label: 'M', format: 'amount' }];
  const rows = [{ _rn: 1, b: 'Tamhini Drivetech Private Limited' }, { _rn: 27, b: 'Carried Over', h: 3882600, m: 4474790 },
    { _rn: 41, a: '18-Feb-2027', b: '(cancelled)', c: '2762' }, { _rn: 50, b: '(Recd 4-3-2027 vide GRN-2027-03-0052, LR 22184)' },
    { _rn: 39, _txt: ['h'], a: '18-Feb-2027', b: 'Kolak', h: '138500.00' }, { _rn: 60, c: '2771' }];
  const html = D.renderDocument({ id: 'r', type: 'table', style: 'sheet', title: 'Raw', headless: true, columns: cols, rows: rows }, {});
  const tr = n => html.slice(html.indexOf('<td class="xl-rn stick0">' + n + '</td>'), html.indexOf('</tr>', html.indexOf('<td class="xl-rn stick0">' + n + '</td>')));
  assert.match(tr(1), /<td class="nw xl-spill" colspan="4">Tamhini Drivetech Private Limited<\/td>$/, 'a title runs to the end of the row');
  assert.match(tr(27), /<td class="nw xl-spill" colspan="2">Carried Over<\/td><td class="r nw">38,82,600\.00<\/td>/, 'up to the first cell that holds something');
  assert.ok(!/xl-spill/.test(tr(41)), 'a cell with a neighbour holding text does not run on');
  assert.match(tr(50), /^<td class="xl-rn stick0">50<\/td><td class=" nw"><\/td><td class="nw xl-spill" colspan="4">\(Recd 4-3-2027 vide .*GRN-2027-03-0052.*, LR 22184\)<\/td>$/, 'a narration line runs on from column B');
  assert.match(tr(39), /colspan="2">Kolak<\/td><td class=" ?nw xl-txt">138500\.00<span class="vh"> \(number stored as text\)<\/span><\/td><td class="r nw"><\/td>$/, 'a number stored as text does not run on');
  assert.ok(!/xl-spill/.test(tr(60)), 'nor does right-aligned text');
  assert.equal((tr(1).match(/<td/g) || []).length, 3, 'cells under a run-on are not drawn (row number, A, the run-on)');
  // a frozen sheet's pinned column wraps instead; a sheet with a label row (not headless) is as before
  const frozen = D.renderDocument({ id: 'f', type: 'table', style: 'sheet', title: 'Ex', headless: true, freeze: true, columns: cols.slice(1), rows: [{ _rn: 1, b: 'Tamhini Drivetech Private Limited' }] }, {});
  assert.ok(!/xl-spill/.test(frozen) && /stick1/.test(frozen));
  assert.ok(!/xl-spill/.test(D.renderDocument({ id: 'p', type: 'table', style: 'sheet', title: 'P', columns: cols, rows: rows }, {})));
});

test('xl-1 round 1: a number joined to its word stays whole in student text ("71-row", "3-ply"), dates, years and codes as before', () => {
  const fs = require('fs'), path = require('path');
  const ui = fs.readFileSync(path.join(__dirname, '..', 'articleship-program', 'work-simulation', 'js', 'ws-ui.js'), 'utf8');
  const escText = new Function('esc', 'D', ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escTitle(')) + '; return escText;')(D.esc, D);
  const out = escText('Cleaned a 71-row ledger export; 3,600 nos 3-ply boxes; a 5-year DCF.');
  ['71-row', '3-ply', '5-year'].forEach(x => assert.ok(out.indexOf('<span class="nw">' + x + '</span>') >= 0, x + ' is held together'));
  const left = escText('(Recd 2-1-2027 vide GRN-2027-01-0017), 1-Jan-2027, the 2026-27 file, a cut-off.');
  ['2-1-2027', '2026-27', 'cut-off'].forEach(x => assert.ok(left.indexOf(x) >= 0 && left.indexOf('<span class="nw">' + x + '</span>') < 0, x + ' is left alone'));
  // acc-1 round 1 (designer S5): a whole date (two-digit month, or a month word) is held now, as the papers hold it
  assert.ok(left.indexOf('<span class="nw">1-Jan-2027</span>') >= 0, '1-Jan-2027 is held together');
});

test('mat-1 round 1: a plain register names the company whose book it is; a mail chip given as { name, doc } opens that paper where the app can, else stays a chip; the validator checks the paper', () => {
  // designer S6: the company heads a plain table that names one (escaped), above the title; without one, as before
  const reg = { id: 'rom', type: 'table', style: 'plain', title: 'Members', heading: 'Register of members (extract)',
    company: { name: 'Paralikar Speciality Chemicals Private Limited', address: 'Taloja MIDC' }, columns: [{ key: 'm', label: 'Member' }], rows: [{ m: 'Holdings' }] };
  const html = D.renderDocument(clone(reg), {});
  assert.ok(html.indexOf('<div class="pl-co">Paralikar Speciality Chemicals Private Limited</div><div class="pl-addr">Taloja MIDC</div>') >= 0, 'company and address first');
  assert.ok(html.indexOf('pl-co') < html.indexOf('pl-title'), 'above the title');
  assert.ok(!/pl-co/.test(D.renderDocument(Object.assign(clone(reg), { company: undefined }), {})), 'no company, no line');
  const evil = D.renderDocument(Object.assign(clone(reg), { company: { name: EVIL, address: EVIL } }), {});
  assert.ok(!/<script/.test(evil) && !/<img src=x/.test(evil), 'the company stays escaped');
  // designer S5: { name, doc } is a link (the app's tags, with the chip's own class and file badge) when docLink opens it
  const mail = { id: 'm', type: 'letter', style: 'email', title: 'Mail', subject: 'S', from: { name: 'Madhav Paralikar' }, to: [{ name: 'Kaizad Engineer' }], body: ['Hi'],
    attachments: [{ name: 'PSC share valuation.pdf', doc: 'valuer' }, 'Plain.pdf'] };
  const seen = [];
  const linked = D.renderDocument(clone(mail), { docLink: (id, cls) => { seen.push([id, cls]); return id === 'valuer' ? { open: '<a class="' + cls + '" href="#/l/x/docs/6" data-replace>', close: '</a>' } : null; } });
  assert.ok(linked.indexOf('<a class="em-file" href="#/l/x/docs/6" data-replace><span class="em-name">PSC share valuation.pdf</span></a>') >= 0, 'opens the paper');
  assert.deepEqual(seen, [['valuer', 'em-file']]);
  assert.match(linked, /<span class="em-file"><span class="em-name">Plain\.pdf<\/span><\/span>/, 'a plain name stays a chip');
  assert.match(D.renderDocument(clone(mail), { docLink: () => null }), /<span class="em-file"><span class="em-name">PSC share valuation\.pdf<\/span><\/span>/, 'a paper the app cannot open: a chip, never a dead control');
  assert.match(D.renderDocument(clone(mail), {}), /<span class="em-file"><span class="em-name">PSC share valuation\.pdf<\/span><\/span>/, 'without the app (work sample, tests): a chip');
  // the validator: doc must name another paper of the pack
  const L = require('./articleship-work-simulation-lib.cjs');
  const lv = clone(demo);
  const em = lv.documents.find(x => x.type === 'letter');
  const other = lv.documents.find(x => x.id !== em.id);
  em.attachments = [{ name: 'A.pdf', doc: other.id }];
  assert.ok(!/attachment/.test(L.validateLevel(lv, { fixture: true }).errors.join('\n')), 'another paper: fine');
  em.attachments = [{ name: 'A.pdf', doc: 'nope' }];
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /attachment 1: doc must name another paper of the pack/);
  em.attachments = [{ name: 'A.pdf', doc: em.id }];
  assert.match(L.validateLevel(lv, { fixture: true }).errors.join('\n'), /attachment 1: doc must name another paper of the pack/, 'not the mail itself');
});

test('sa-3 round 3 (designer S2): a chat’s date is one pill, even with its day held to its month inside it', () => {
  const fs = require('fs'), path = require('path');
  const html = D.renderDocument({ id: 'c', type: 'chat', title: 'Varun', date: 'Thursday 22 April', messages: [{ from: 'Varun', text: 'Hi', time: '9:02 am' }] }, {});
  const m = /<div class="ch-date">([\s\S]*?)<\/div>/.exec(html);
  assert.ok(m, 'the date row renders');
  assert.ok(m[1].indexOf('<span class="nw">22 April</span>') >= 0, 'the day is held to its month (sa-1 round 6), so a span sits inside the pill');
  // the spans a child rule (.ch-date > span) reaches: the date row's own children only
  let depth = 0, top = 0;
  m[1].replace(/<(\/?)span\b[^>]*>/g, (t, close) => { if (close) depth--; else { if (depth === 0) top++; depth++; } return t; });
  assert.equal(top, 1, 'one span is the row’s own child');
  const css = fs.readFileSync(path.join(__dirname, '..', 'articleship-program', 'work-simulation', 'css', 'ws.css'), 'utf8');
  assert.match(css, /\.ch-date > span \{[^}]*background: #fff/, 'the pill styles the child span');
  assert.ok(!/\.ch-date span\b/.test(css), 'no descendant rule draws a second pill round the held date');
  assert.ok(!/\.bn-head span\b/.test(css) && !/\.cd-signs span\b/.test(css), 'the bin head and voucher signs style their own spans only');
});

test('dt-2 round 4 (designer S1): a range of months stays whole in papers and in the app’s text; years, day ranges and numbers as before', () => {
  const N = x => '<span class="nw">' + x + '</span>';
  // papers (nwDates, through t())
  assert.equal(D.nwDates(D.esc('Apr–Jun 2026')), N('Apr–Jun') + ' 2026', 'a narrow Quarter cell breaks only before its year');
  assert.equal(D.nwDates(D.esc('Re: TDS on our purchases, July–September')), 'Re: TDS on our purchases, ' + N('July–September'));
  assert.equal(D.nwDates(D.esc('the October–December statement')), 'the ' + N('October–December') + ' statement');
  assert.equal(D.nwDates(D.nwDates(D.esc('July–September'))), N('July–September'), 'held once, never twice');
  ['tax year 2026–27', 'KS/2026-27/4418', 'Marathwada–Pune', 'Apr-Jun', 'Mar–Aprx', 'Junction–Mayfair'].forEach(x =>
    assert.equal(D.nwMonthRanges(D.esc(x)), D.esc(x), x + ' is not a month range'));
  const card = D.renderDocument({ id: 'c', type: 'card', style: 'slip', title: 'Slip',
    fields: [{ label: 'Quarter', value: 'Jul–Sep 2026' }, { label: 'Trips', value: '10–14 Aug, and 22 Dec 2026' }, { label: 'Year', value: '2026–27' }] }, {});
  assert.ok(card.indexOf(N('Jul–Sep') + ' 2026') >= 0, 'a card field');
  assert.ok(card.indexOf(N('10–14 Aug')) >= 0 && card.indexOf(N('22 Dec 2026')) >= 0 && card.indexOf(N('2026–27')) >= 0, 'day ranges, dates and years as before');
  // the app's escText and escLabel (browser-only file, read from its source)
  const fs = require('fs'), path = require('path');
  const ui = fs.readFileSync(path.join(__dirname, '../articleship-program/work-simulation/js/ws-ui.js'), 'utf8');
  const fns = new Function('esc', 'D', ui.slice(ui.indexOf('function escNum('), ui.indexOf('function escLine(')) + '; return { escText: escText, escLabel: escLabel };')(D.esc, D);
  assert.ok(fns.escText('Lothal: ₹27,373 for July–September').indexOf('for ' + N('July–September')) >= 0, 'a review note');
  assert.ok(fns.escText('Pallavi’s TDS receivable register, Apr–Sep').indexOf(N('Apr–Sep')) >= 0, 'a pack label');
  assert.equal(fns.escText('Apr–Jun 2026'), N('Apr–Jun') + ' 2026');
  assert.ok(fns.escText('the January–March statement, due 31 May 2027').indexOf(N('January–March') + ' statement, due ' + N('31 May 2027')) >= 0, 'a day, month and year held as before');
  assert.ok(fns.escText('booked 10–14 Aug in 2026–27').indexOf(N('10–14 Aug')) >= 0 && fns.escText('in 2026–27').indexOf(N('2026–27')) >= 0);
  assert.ok(fns.escLabel('Pallavi’s TDS receivable register, Apr–Sep').indexOf(N('Apr–Sep')) >= 0, 'a list label');
});

test('ia-2 round 3 (designer S1): a paper never opens a line with "·": cells, fields, letterheads, footnotes and handwritten notes hold the dot to the word before it', () => {
  const NB = ' · ';
  // a claim print: a table cell and a meta field (ia-2's "Bus, Solapur–Pandharpur" / "· ticket" and "· paid" at 390 px)
  const print = D.renderDocument({ id: 'cl', type: 'table', style: 'portal', title: 'Claim 12 · Claim print', brand: 'ERP · Travel', heading: 'Expense claim TE/26-27/2601',
    meta: [{ label: 'Accounts', value: 'Originals ticked 25-11-2026 · paid 27-11-2026' }],
    columns: [{ key: 'item', label: 'Expense' }], rows: [{ item: 'Bus, Solapur–Pandharpur · ticket' }, { item: 'DA, Barshi (C) · 3 days × ₹300 · Mon to Wed' }] }, {});
  assert.ok(print.indexOf('Pandharpur' + NB + 'ticket') >= 0, 'a cell');
  assert.ok(print.indexOf('25-11-2026</span>' + NB + 'paid') >= 0, 'a field, after a held date');
  assert.ok(print.indexOf('₹300' + NB + 'Mon') >= 0 && print.indexOf('(C)' + NB) >= 0, 'every dot in a cell');
  assert.ok(print.indexOf(' · ') < 0, 'no plain " · " left in the paper');
  // a card's field, a letterhead's id and contact lines, a bank's footnote and a handwritten note
  const card = D.renderDocument({ id: 'b', type: 'card', style: 'slip', title: 'Bill', fields: [{ label: 'Date', value: '14-12-2026 · 10:05 pm' }] }, {});
  assert.ok(card.indexOf('14-12-2026</span>' + NB) >= 0 && card.indexOf(' · ') < 0, card);
  const letter = D.renderDocument({ id: 'l', type: 'letter', title: 'Letter', letterhead: { name: 'Khamang Foods Private Limited', gstin: '27AAACK1234F1Z5', pan: 'AAACK1234F', phone: '98XXXXXXXX', email: 'accounts@email.com' },
    body: ['Dear Sir'] }, {});
  assert.ok(letter.indexOf(NB + 'PAN:') >= 0 && letter.indexOf('98XXXXXXXX' + NB) >= 0 && letter.indexOf(' · ') < 0, 'letterhead joins');
  const bank = D.renderDocument({ id: 'a', type: 'table', style: 'bank', title: 'Advances', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'x' }],
    footnote: 'HL housing loan · STD standard · SUB sub-standard' }, {});
  assert.ok(bank.indexOf('loan' + NB + 'STD standard' + NB + 'SUB') >= 0, 'a bank footnote');
  assert.ok(D.annotation({ kind: 'hand', text: 'Seen · S.K.', at: 'inline' }).indexOf('Seen' + NB + 'S.K.') >= 0, 'a handwritten note');
  // the hold changes no word: the text a reader sees is the same, with a no-break space before each dot
  const plain = h => h.replace(/<[^>]+>/g, '').replace(/ /g, ' ');
  assert.ok(plain(print).indexOf('Bus, Solapur–Pandharpur · ticket') >= 0 && plain(print).indexOf('Originals ticked 25-11-2026 · paid 27-11-2026') >= 0);
  // and the play check now reads papers too (a dot that opens its own block is still not a break)
  const play = require('fs').readFileSync(require('path').join(__dirname, 'fixtures/work-simulation-play.mjs'), 'utf8');
  const at = play.indexOf("if ((txt.indexOf('·') < 0 && !inPaper) || !visibleHost(node)");
  assert.ok(at > 0, 'the dot check');
  assert.ok(play.slice(at, play.indexOf('\n', at)).indexOf('article.doc') < 0, 'papers are not left out of the dot check');
});

test('ia-2 round 4 (designer S1): a paper never opens a line with "×": the sign is held to the word before it, and a level may hold the space after it too', () => {
  const H = '\u00a0×';
  // a claim print's cell ("1 night" / "× ₹1,150 · bill SNG/4471" at 390 px): the space before the sign is held
  const print = D.renderDocument({ id: 'cl', type: 'table', style: 'portal', title: 'Claim 1 · Claim print', heading: 'Expense claim TE/26-27/2435',
    columns: [{ key: 'item', label: 'Expense' }], rows: [{ item: 'Hotel, Sangli (C) · 1 night × ₹1,150 · bill SNG/4471' }, { item: 'Own car, Pune–Satara · 452 km × ₹10 · trip log' }] }, {});
  assert.ok(print.indexOf(H + ' ₹1,150') >= 0 && print.indexOf(H + ' ₹10') >= 0, 'the sign is held to the quantity before it');
  assert.ok(!/ ×/.test(print), 'no breakable space before a "×" in the paper');
  // only the space before is held, so a table that fits today is no wider (sa-1's and sa-2's measure-by-rate cells)
  assert.ok(print.indexOf('×\u00a0₹') < 0, 'the space after stays breakable');
  // a level that writes both spaces as no-break spaces keeps the whole computation (ia-2's claim lines, its bar bill)
  const held = D.renderDocument({ id: 'cl2', type: 'table', style: 'portal', title: 'Claim 2 · Claim print', columns: [{ key: 'item', label: 'Expense' }],
    rows: [{ item: 'DA, Barshi (C) · 3\u00a0days\u00a0×\u00a0₹300 · Mon\u00a0to\u00a0Wed' }] }, {});
  assert.ok(held.indexOf('\u00a0×\u00a0₹300') >= 0, held);
  // a GRN line whose level held the space after the sign (ia-1's "200 bags" / "× 50 kg"): the break moves after the sign,
  // so the line never opens with it and the cell is no wider (holding both sides widened ia-1's GRN and invoice tables)
  const grn = D.renderDocument({ id: 'g', type: 'grn', title: 'GRN', number: 'GRN-1', date: '02-04-2027', vendor: 'V', poRef: 'PO-1',
    lines: [{ desc: 'Sugar S-30 (200\u00a0bags ×\u00a050\u00a0kg)', qtyReceived: 10000, qtyAccepted: 10000, unit: 'kg' }], receivedBy: 'R' }, {});
  assert.ok(grn.indexOf('bags' + H + ' 50') >= 0, 'a GRN line: the break moves after the sign');
  const box = D.renderDocument({ id: 'g2', type: 'table', style: 'plain', title: 'T', columns: [{ key: 'a', label: 'A' }], rows: [{ a: 'Box, 600\u00a0×\u00a0400\u00a0×\u00a0300\u00a0mm' }] }, {});
  assert.ok(box.indexOf('600\u00a0×\u00a0400\u00a0×\u00a0300\u00a0mm') >= 0, 'a size held whole by its level (ia-1’s box) is left as it is');
  const card = D.renderDocument({ id: 'b', type: 'card', style: 'slip', title: 'Bill', fields: [{ label: 'Items', value: 'Beer 650 ml: 4 × ₹260 = ₹1,040' }] }, {});
  assert.ok(card.indexOf('4' + H + ' ₹260') >= 0, 'a card field');
  assert.ok(D.annotation({ kind: 'hand', text: '3 × ₹150 ok', at: 'inline' }).indexOf('3' + H) >= 0, 'a handwritten note');
  // the hold changes no word a reader sees
  const plain = h => h.replace(/<[^>]+>/g, '').replace(/\u00a0/g, ' ');
  assert.ok(plain(print).indexOf('Hotel, Sangli (C) · 1 night × ₹1,150 · bill SNG/4471') >= 0);
  // and the play check reads "×" in papers as it reads "·" (a line of a paper that opens with it fails a run)
  const play = require('fs').readFileSync(require('path').join(__dirname, 'fixtures/work-simulation-play.mjs'), 'utf8');
  assert.ok(play.indexOf("for (const sym of inPaper ? ['·', '×'] : ['·'])") > 0 && play.indexOf("closest('.doc, .doc-paper')") > 0, 'the × check in papers');
  assert.ok(play.indexOf("report.problems.push('a line of a paper starts with “×” on '") > 0, 'a line-start × is a problem');
});

test('for-1 round 3 (designer S1): a short day-month date and a bare year pair stay whole in a paper; slash numbers, full dates and codes keep their own rules', () => {
  const N = x => '<span class="nw">' + x + '</span>';
  // through t(), in a register's wrap column: the narration's date is one piece ("bill of 11-" / "03" at 390 px)
  const reg = D.renderDocument({ id: 'r', type: 'table', style: 'register', title: 'Register', columns: [{ key: 'n', label: 'Narration', wrap: true }],
    rows: [{ n: 'Printed laminate rolls, bill of 11-03' }, { n: 'Freight to depots, two bills of 20-03' }, { n: 'NPI 26-27 0471' }, { n: 'BP/26-27/0001' }, { n: 'KF/PO/26-27/0781' }, { n: 'Plot E-14' }] }, {});
  assert.ok(reg.indexOf('Printed laminate rolls, bill of ' + N('11-03')) >= 0 && reg.indexOf('two bills of ' + N('20-03')) >= 0, 'day-month held');
  assert.ok(reg.indexOf('NPI ' + N('26-27') + ' 0471') >= 0, 'a bare year pair held');
  assert.ok(reg.indexOf(N('BP/26-27/0001')) >= 0 && reg.indexOf(N('KF/PO/26-27/0781')) >= 0 && reg.indexOf('<span class="nw"><span class="nw">') < 0, 'a slash number held once, by its own rule');
  assert.ok(reg.indexOf(N('E-14')) >= 0, 'a code still held by nwCodes');
  // nwDates alone: the slash number is unchanged by the new rule, and a full date is held whole, once
  assert.equal(D.nwDates(D.esc('BP/26-27/0001')), N('BP/26-27/0001'));
  assert.equal(D.nwDates(D.esc('dt 22-03-2027, bill of 11-03')), 'dt ' + N('22-03-2027') + ', bill of ' + N('11-03'));
  // left alone: a token with "-", "/" or "." beside it, a short year after a date, a code of letters and digits
  ['paid 11-03-27', '1.5-10', 'x-11-03', '2027-03-24', 'E-14', 'No. 26-27/0001', 'post 15/4'].forEach(x =>
    assert.equal(D.nwDates(D.esc(x)), D.esc(x), x + ' is untouched'));
  // the hold changes no word a reader sees
  assert.ok(reg.replace(/<[^>]+>/g, '').indexOf('Printed laminate rolls, bill of 11-03') >= 0);
  // and play.mjs fails a run whose paper breaks a hyphen between two digits (a note until this round)
  const play = require('fs').readFileSync(require('path').join(__dirname, 'fixtures/work-simulation-play.mjs'), 'utf8');
  assert.ok(play.indexOf("report.problems.push('in a paper a hyphen between two digits starts a new line on '") > 0, 'a digit break in a paper is a problem');
});

test('for-1 round 3 (designer optional 3): a notice letterhead given as { name, address } prints the address in grey under the name; a string letterhead is unchanged', () => {
  const obj = D.renderDocument({ id: 'cal', type: 'letter', style: 'policy', title: 'Calendar', letterhead: { name: 'Khamang Foods Private Limited', address: 'Plot E-14, Ranjangaon MIDC, Taluka Shirur, Pune 412220' },
    subject: 'Accounts office: working days and holidays', body: ['Closed on Saturdays.'] }, {});
  assert.match(obj, /<div class="pc-lh">Khamang Foods Private Limited<\/div><div class="lh-addr pc-addr">Plot <span class="nw">E-14<\/span>, Ranjangaon MIDC/);
  assert.ok(obj.indexOf('[object Object]') < 0);
  const str = D.renderDocument({ id: 'p', type: 'letter', style: 'policy', title: 'Policy', letterhead: 'Tamhini Drivetech Private Limited\nPlot B-47', subject: 'Purchase policy', body: ['x'] }, {});
  assert.match(str, /<div class="pc-lh">Tamhini Drivetech Private Limited<br>Plot <span class="nw">B-47<\/span><\/div>/);
  assert.ok(str.indexOf('pc-addr') < 0);
});
