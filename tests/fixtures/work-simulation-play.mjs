#!/usr/bin/env node
// Plays a Work Simulation level through the real UI with Playwright and screenshots every screen.
//   node tools/play.mjs --level sa-1 [--viewport phone|phone360|desktop|both] [--mode model|wrong|blank|partial]
//   node tools/play.mjs --all --viewport both --mode model
//   node tools/play.mjs --fixture web/tests/fixtures/demo-level.json --viewport both --mode model
// Options: --out <dir> (default PKG/_internal/shots), --base <url of the app> (else a server on a free port),
//          --docs all|first|none (documents shot in the phone viewer; default all), --headed,
//          --a11y (also tab through key screens: every focus stop must visibly change; text contrast under WCAG AA is listed;
//          on a desktop the item screen's task pane must be reached by Tab top to bottom).
// Always checked too: on a phone the item's sticky bar never offers a main button that changes nothing visible; the
// review never strikes through a number; in model mode the work sample prints a signed column's increases with a plus
// and a prefixed figure (₹) with its prefix; every wide paper is paged with More columns; every figure typed into a
// number box fits the box once tidied (no "−1,80,06,00" for −1,80,06,000); one Back from the review leaves it; in model
// mode, once per run, a slow MSCProgress.load never throws away an attempt started while it was answering.
// Report: <out>/<id>/report-<viewport>-<mode>.json, plus a one-line summary per run on stdout. Exit 1 on any problem.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const require = createRequire(import.meta.url);
const PKG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(PKG, 'web', 'articleship-program', 'work-simulation');
const E = require(path.join(APP, 'js', 'ws-engine.js'));
const L = require(path.join(PKG, 'web', 'tests', 'articleship-work-simulation-lib.cjs'));
let chromium;
try { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); } catch { ({ chromium } = require('playwright')); }

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : def; };
const OUT = path.resolve(opt('out', path.join(PKG, '_internal', 'shots')));
// phone360: India's commonest phone width (gst-1 round 1: a 2 × 2 call grid beside Next ran past a 360 px screen and
// no run saw it); `both` plays it too
const VIEWPORTS = { phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, phone360: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, desktop: { viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 } };
const vpArg = opt('viewport', 'phone');
const viewports = vpArg === 'both' ? ['phone', 'phone360', 'desktop'] : [vpArg];
if (viewports.some(v => !VIEWPORTS[v])) { console.error('Viewport is phone, phone360, desktop or both'); process.exit(2); }
const isPhone = vp => vp === 'phone' || vp === 'phone360';
const mode = opt('mode', 'model');
const docsMode = opt('docs', 'all');
const A11Y = !!opt('a11y', false);
const catalogue = JSON.parse(fs.readFileSync(path.join(APP, 'data', 'catalogue.json'), 'utf8'));

function levelsToPlay() {
  const fx = opt('fixture', null);
  if (fx) return [{ level: JSON.parse(fs.readFileSync(path.resolve(fx), 'utf8')), fixture: path.resolve(fx) }];
  const ids = opt('all', false) ? catalogue.levels.map(l => l.id) : [opt('level', null)].filter(Boolean);
  if (!ids.length) { console.error('Give --level <id>, --all or --fixture <path>'); process.exit(2); }
  return ids.map(id => {
    const f = path.join(APP, 'data', 'levels', id + '.json');
    if (!fs.existsSync(f)) { if (!opt('all', false)) console.error('No level file for ' + id); return null; }
    return { level: JSON.parse(fs.readFileSync(f, 'utf8')) };
  }).filter(Boolean);
}
function answersFor(level) {
  if (mode === 'model') return L.keyAnswers(level);
  if (mode === 'wrong') return L.wrongAnswers(level);
  if (mode === 'partial') return L.partialAnswers(level);
  return {};
}

async function measure(page, vp) {
  return page.evaluate(({ phone }) => {
    const out = { overflow: null, small: [], clipped: [], breaks: [], signs: [], codes: [], units: [], days: [], seals: [], dots: [], times: [] };
    // sa-1 round 5 (designer S2): a round stamp's words stay inside its ring: the diagonal of the text box, measured
    // unrotated, is no larger than the ring's inner diameter (Kudalwadi's seal read "UDALWAD … HINCHWA", cut by a fixed
    // 104 px ring); a seal in a tab not shown is skipped
    document.querySelectorAll('.ann-round > span').forEach(s => {
      if (!s.offsetWidth || s.closest('[hidden]')) return;
      const ann = s.parentElement, was = ann.style.transform;
      ann.style.transform = 'none';
      const rr = document.createRange(); rr.selectNodeContents(s);
      const t = rr.getBoundingClientRect(), box = s.getBoundingClientRect(), cs = getComputedStyle(s);
      const scale = box.width / s.offsetWidth || 1;
      const inner = s.offsetWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
      const diag = Math.hypot(t.width, t.height) / scale;
      ann.style.transform = was;
      if (t.width && diag > inner + 0.5) out.seals.push('“' + s.textContent.replace(/\s+/g, ' ').trim() + '” ' + Math.round(diag) + ' px in a ' + Math.round(inner) + ' px ring');
    });
    // sa-3 round 3 (designer S1): two placed marks of one paper (a hand note, a stamp, a signature) never write over each
    // other: the words of one cross the words of another, or a round seal's ring, by no more than 2 px (Tapkir's
    // bottom-left "Pass for payment" ran over the Wakad seal at every phone width once seals were sized to their words);
    // an inline note (.ann-flow) has its own line and is left out, as is a paper in a tab not shown
    out.annOver = [];
    const annPapers = new Map();
    document.querySelectorAll('.doc .ann').forEach(a => {
      if (!a.offsetWidth || a.closest('.ann-flow, [hidden]')) return;
      const d = a.closest('.doc');
      if (!annPapers.has(d)) annPapers.set(d, []);
      annPapers.get(d).push(a);
    });
    annPapers.forEach(list => {
      if (list.length < 2) return;
      const regs = list.map(a => {
        if (a.classList.contains('ann-round')) return [a.getBoundingClientRect()];
        const rg = document.createRange(); rg.selectNodeContents(a);
        return [...rg.getClientRects()].filter(x => x.width > 0 && x.height > 0);
      });
      const name = a => '“' + (a.innerText || a.textContent).replace(/\s+/g, ' ').trim().slice(0, 30) + '”';
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        let ov = 0;
        for (const p of regs[i]) for (const q of regs[j]) {
          const x = Math.min(p.right, q.right) - Math.max(p.left, q.left), y = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
          if (x > 2 && y > 2) ov = Math.max(ov, Math.min(x, y));
        }
        if (ov) out.annOver.push(name(list[i]) + ' over ' + name(list[j]) + ' by ' + Math.round(ov) + ' px');
      }
    });
    // against the layout width the page was given: with a mobile viewport Chrome widens innerWidth to the content (a
    // 420 px block at 390 gives innerWidth 421 and scrollWidth 421), so innerWidth never shows a phone overflow
    const sw = document.documentElement.scrollWidth, w = document.documentElement.clientWidth;
    // on every viewport: a box that scrolls or clips sideways hides part of its content with no affordance (sa-1
    // round 3: the cut-off sheet hid its third column beside the documents pane on a desktop). A document's own wide
    // table (.doc-scroll, with More columns) and form controls are meant to scroll; a .vh label is hidden on purpose.
    document.querySelectorAll('body *').forEach(el => {
      const cs = getComputedStyle(el);
      if (!/(auto|scroll|hidden)/.test(cs.overflowX) || cs.display === 'none' || cs.visibility === 'hidden') return;
      if (el.closest('.doc-scroll, .vh, [hidden]') || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      // dt-3 round 2: any text hidden for screen readers the .vh way (absolute, 1 × 1 px, clipped) is hidden on purpose
      // too: the last task's " for review" beside "Submit" on a phone (.actionbar .ab-more)
      if (cs.position === 'absolute' && el.offsetWidth <= 1 && el.offsetHeight <= 1) return;
      if (!(el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2)) return;
      // what the eye sees: a box whose content is scaled to fit (the work sample's A4 sheet) hides nothing
      const box = el.getBoundingClientRect();
      const kids = [...el.querySelectorAll('*')].slice(0, 600).map(k => k.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0);
      if (kids.length && Math.max(...kids.map(r => r.right)) <= box.right + 2 && Math.min(...kids.map(r => r.left)) >= box.left - 2) return;
      out.clipped.push(el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') + ' hides ' + (el.scrollWidth - el.clientWidth) + 'px');
    });
    if (phone && sw > w + 1) {
      const wide = [...document.querySelectorAll('body *')].filter(el => { const r = el.getBoundingClientRect(); return r.right > w + 1 && r.width > 0 && getComputedStyle(el).position !== 'fixed'; })
        .slice(0, 5).map(el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''));
      out.overflow = { scrollWidth: sw, width: w, elements: wide };
    }
    const sel = 'a[href], button, select, textarea, input:not([type=radio]):not([type=checkbox]), [role=tab], label.opt-row, label.seg-opt, summary, .bn';
    document.querySelectorAll(sel).forEach(el => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      if (el.closest('[hidden]') || el.closest('.doc-paper') && el.tagName === 'A') return;
      if (el.tagName === 'A' && cs.display === 'inline' && el.closest('p, li, .rule-line, .hunt-count, .meta, .added-row')) return;  // inline text links (WCAG 2.5.8 exception)
      if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' && r.height >= 44) return;
      if (r.height < 43.5 || r.width < 43.5) out.small.push((el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') + ' “' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 30) + '” ' + Math.round(r.width) + '×' + Math.round(r.height)));
    });
    // val-1 round 1: a year or range written with an en dash split over two lines ("2030– / 31", "₹109– / 142 crore",
    // "12– / 14%"): the digit after the dash starts below the digit before it
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), rg = document.createRange();
    for (let node = tw.nextNode(); node; node = tw.nextNode()) {
      const txt = node.textContent;
      if (txt.indexOf('–') < 0) continue;
      const host = node.parentElement;
      if (!host || host.closest('[hidden], .vh, svg, option, script, style')) continue;
      const hs = getComputedStyle(host);
      if (hs.display === 'none' || hs.visibility === 'hidden') continue;
      const re = /\d–\d/g;
      for (let m = re.exec(txt); m; m = re.exec(txt)) {
        rg.setStart(node, m.index); rg.setEnd(node, m.index + 1); const a = rg.getBoundingClientRect();
        rg.setStart(node, m.index + 2); rg.setEnd(node, m.index + 3); const b = rg.getBoundingClientRect();
        re.lastIndex = m.index + 1;
        if (!a.width || !b.width || !a.height) continue;
        if (b.top >= a.bottom - 2) out.breaks.push('“' + txt.slice(Math.max(0, m.index - 14), m.index + 8).replace(/\s+/g, ' ').trim() + '”');
      }
    }
    // gst-2 round 1: a form or code name split at its hyphen ("Chakan’s GSTR-" / "1s?", "AJE-" / "8"): the digit after
    // the hyphen starts below the capital before it
    const tw3 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = tw3.nextNode(); node; node = tw3.nextNode()) {
      const txt = node.textContent;
      if (txt.indexOf('-') < 0) continue;
      const host = node.parentElement;
      if (!host || host.closest('[hidden], .vh, svg, option, script, style')) continue;
      const hs = getComputedStyle(host);
      if (hs.display === 'none' || hs.visibility === 'hidden') continue;
      // sa-1 round 6 (designer S1): and a document number split at the hyphen between two digit groups
      // ("UDYAM-MH-26-" / "0906352" on a bill, "your invoice RF/2291/26-" / "27" on a debit note): the inner hyphen of
      // a number that starts with a capital and has digits on both sides of its last hyphen
      const seenH = new Set();
      for (const re of [/[A-Z]{2,6}-\d/g, /[A-Z][A-Za-z0-9]*(?:[\/-][A-Za-z0-9]+)*[\/-]\d+-\d/g]) {
        for (let m = re.exec(txt); m; m = re.exec(txt)) {
          const h = m.index + m[0].length - 2;           // the hyphen
          rg.setStart(node, h - 1); rg.setEnd(node, h); const a = rg.getBoundingClientRect();
          rg.setStart(node, h + 1); rg.setEnd(node, h + 2); const b = rg.getBoundingClientRect();
          if (!a.width || !b.width || !a.height) continue;
          if (b.top >= a.bottom - 2) { seenH.add(h); out.codes.push('“' + txt.slice(Math.max(0, m.index - 10), h + 8).replace(/\s+/g, ' ').trim() + '”'); }
        }
      }
      // sa-6 round 5 (designer optional 2): and, in a paper, any hyphen between two digits ("LKR 37 FY 26-" / "27" in a
      // bank narration, "31-03-" / "2027" in a date column): a year, date or number read across two lines. The paper
      // holds it with a non-breaking hyphen (U+2011), as sa-6 does for "FY 26‑27" and "RF/2412/26‑27". for-1 round 3
      // (designer S1): a problem now, not a note. ws-docs nwDates holds a short day-month date and a bare year pair
      // ("bill of 11-" / "03" in for-1's register narrations, 90 times at 390 px, the last level that still broke), and an
      // all-levels run on phone, phone360 and desktop showed no such break left in any paper
      if (host.closest('.doc')) {
        const dre = /\d-\d/g;
        for (let m = dre.exec(txt); m; m = dre.exec(txt)) {
          const h = m.index + 1;
          dre.lastIndex = h;
          if (seenH.has(h)) continue;
          rg.setStart(node, h - 1); rg.setEnd(node, h); const a = rg.getBoundingClientRect();
          rg.setStart(node, h + 1); rg.setEnd(node, h + 2); const b = rg.getBoundingClientRect();
          if (!a.width || !b.width || !a.height) continue;
          if (b.top >= a.bottom - 2) (out.digits = out.digits || []).push('“' + txt.slice(Math.max(0, h - 14), h + 8).replace(/\s+/g, ' ').trim() + '”');
        }
      }
    }
    // dt-2 round 2: a signed rupee figure split after its sign ("Your call: Tamhini corrects its books · −" / "₹720"):
    // Chrome may break between a minus or plus and the ₹ (both prefix characters), so the figure reads as positive
    const tw2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = tw2.nextNode(); node; node = tw2.nextNode()) {
      const txt = node.textContent;
      if (txt.indexOf('₹') < 1) continue;
      const host = node.parentElement;
      if (!host || host.closest('[hidden], .vh, svg, option, script, style')) continue;
      const hs = getComputedStyle(host);
      if (hs.display === 'none' || hs.visibility === 'hidden') continue;
      const re = /[−+\-]₹/g;
      for (let m = re.exec(txt); m; m = re.exec(txt)) {
        rg.setStart(node, m.index); rg.setEnd(node, m.index + 1); const a = rg.getBoundingClientRect();
        rg.setStart(node, m.index + 1); rg.setEnd(node, m.index + 2); const b = rg.getBoundingClientRect();
        if (!a.width || !b.width || !a.height) continue;
        if (Math.abs(b.top - a.top) > 4) out.signs.push('“' + txt.slice(Math.max(0, m.index - 40), m.index + 10).replace(/\s+/g, ' ').trim() + '”');
      }
    }
    // con-1 round 2: a figure split from its unit word ("₹1,094.50" / "lakh", "1.3" / "lakh", "5" / "pm"): in a level
    // that bounces rupees typed in a ₹ lakh box, an amount alone at a line end reads as rupees. Checked inside one text
    // node, and across a held figure (span.nw ending in a digit) and the unit at the start of the text after it
    const unitRe = /\d[  ](?:lakh|crore|am|pm)(?![\w-])/g;
    const tw4 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const visibleHost = node => {
      const host = node.parentElement;
      if (!host || host.closest('[hidden], .vh, svg, option, script, style')) return false;
      const hs = getComputedStyle(host);
      return hs.display !== 'none' && hs.visibility !== 'hidden';
    };
    for (let node = tw4.nextNode(); node; node = tw4.nextNode()) {
      const txt = node.textContent;
      if (!/(lakh|crore|am|pm)/.test(txt) || !visibleHost(node)) continue;
      unitRe.lastIndex = 0;
      for (let m = unitRe.exec(txt); m; m = unitRe.exec(txt)) {
        rg.setStart(node, m.index); rg.setEnd(node, m.index + 1); const a = rg.getBoundingClientRect();
        rg.setStart(node, m.index + 2); rg.setEnd(node, m.index + 3); const b = rg.getBoundingClientRect();
        if (!a.width || !b.width || !a.height) continue;
        if (b.top >= a.bottom - 2) out.units.push('“' + txt.slice(Math.max(0, m.index - 20), m.index + m[0].length).replace(/\s+/g, ' ').trim() + '”');
      }
      // the figure held in the span before this text: "<span class="nw">₹1,094.50</span> lakh"
      const prev = node.previousSibling, um = /^[  ](lakh|crore|am|pm)(?![\w-])/.exec(txt);
      if (um && prev && prev.nodeType === 1 && prev.classList && prev.classList.contains('nw') && /\d$/.test(prev.textContent)) {
        const ar = [...prev.getClientRects()].filter(r => r.width > 0).pop();
        rg.setStart(node, 1); rg.setEnd(node, 2); const b = rg.getBoundingClientRect();
        if (ar && b.width && b.top >= ar.bottom - 2) out.units.push('“' + prev.textContent + ' ' + um[1] + '”');
      }
    }
    // sa-1 round 6 (designer S2): a day split from its month ("reached Tamhini’s stores on 30" / "March" in a review
    // note, "Annual rate contract, 1" / "April 2026" on a PO), in a level whose lesson is reading dates side by side:
    // the month's first letter starts below the day's last digit
    const dayRe = /(?<![\w.,])(\d{1,2})[  ](?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)(?!\w)/g;
    const tw5 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = tw5.nextNode(); node; node = tw5.nextNode()) {
      const txt = node.textContent;
      if (!/\d[  ][JFMASOND]/.test(txt) || !visibleHost(node)) continue;
      dayRe.lastIndex = 0;
      for (let m = dayRe.exec(txt); m; m = dayRe.exec(txt)) {
        const d = m.index + m[1].length - 1;           // the day's last digit
        rg.setStart(node, d); rg.setEnd(node, d + 1); const a = rg.getBoundingClientRect();
        rg.setStart(node, d + 2); rg.setEnd(node, d + 3); const b = rg.getBoundingClientRect();
        if (!a.width || !b.width || !a.height) continue;
        if (b.top >= a.bottom - 2) out.days.push('“' + txt.slice(Math.max(0, m.index - 20), m.index + m[0].length).replace(/\s+/g, ' ').trim() + '”');
      }
    }
    // dt-1 round 6 (designer S2): no line of the app's own text starts with "·" ("Follows your figures" / "· right
    // figure ₹1,78,125" and "… (clause 36)" / "· ₹4,09,500" on a failed review at 390): the dot starts below the last
    // character before it in the same block; a dot that opens its block (a bullet) is not a break. ia-2 round 3
    // (designer S1): papers are checked too, as a phone's reflow, not the issuer, makes the break ("Bus, Solapur–
    // Pandharpur" / "· ticket" on a claim print at 390); ws-docs t() now holds the dot in every cell and field.
    // ia-2 round 4 (designer S1): in a paper a "×" is checked the same way ("1 night" / "× ₹1,150 · bill SNG/4471" on
    // a claim print at 390); ws-docs dotHold() holds it to the word before it
    const blockOf = el => { for (let e = el; e && e !== document.body; e = e.parentElement) { const d = getComputedStyle(e).display; if (!/^inline/.test(d) && d !== 'contents') return e; } return document.body; };
    const tw6 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), back = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = tw6.nextNode(); node; node = tw6.nextNode()) {
      const txt = node.textContent;
      const inPaper = txt.indexOf('×') >= 0 && !!node.parentElement && !!node.parentElement.closest('.doc, .doc-paper');
      if ((txt.indexOf('·') < 0 && !inPaper) || !visibleHost(node)) continue;
      const blk = blockOf(node.parentElement);
      for (const sym of inPaper ? ['·', '×'] : ['·']) for (let i = txt.indexOf(sym); i >= 0; i = txt.indexOf(sym, i + 1)) {
        let pn = node, pi = i - 1;
        while (pi >= 0 && /\s/.test(txt[pi])) pi--;
        if (pi < 0) {
          pn = null; back.currentNode = node;
          for (let q = back.previousNode(); q; q = back.previousNode()) {
            if (!visibleHost(q)) continue;
            const qt = q.textContent; let k = qt.length - 1;
            while (k >= 0 && /\s/.test(qt[k])) k--;
            if (k >= 0) { pn = q; pi = k; break; }
          }
        }
        if (!pn || blockOf(pn.parentElement) !== blk) continue;
        rg.setStart(pn, pi); rg.setEnd(pn, pi + 1); const a = rg.getBoundingClientRect();
        rg.setStart(node, i); rg.setEnd(node, i + 1); const b = rg.getBoundingClientRect();
        if (!a.width || !b.width || !a.height) continue;
        if (b.top >= a.bottom - 2) out[sym === '×' ? 'times' : 'dots'].push('“' + (pn === node ? '' : pn.textContent.slice(-14)) + txt.slice(Math.max(0, i - 14), i + 14).replace(/\s+/g, ' ').trim() + '”');
      }
    }
    // dt-2 round 4 (designer S1): a month range broken at its dash ("register, Apr–" / "Sep" in a pack list, "July–" /
    // "September" in a mail subject): the second month starts below the dash. Checked inside one text node, and across
    // a node boundary in the same block ("Apr–" / a held "Jun 2026" in Form 168's Quarter cell); counted with the days
    const MON = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
    const mrRe = new RegExp('(?<![\\w–-])' + MON + '–' + MON + '(?![\\w–])', 'g'), mrEnd = new RegExp('(?<![\\w–-])' + MON + '–$'), mrStart = new RegExp('^' + MON + '(?![\\w–])');
    const tw7 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), fwd = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = tw7.nextNode(); node; node = tw7.nextNode()) {
      const txt = node.textContent;
      if (txt.indexOf('–') < 0 || !visibleHost(node)) continue;
      mrRe.lastIndex = 0;
      for (let m = mrRe.exec(txt); m; m = mrRe.exec(txt)) {
        const d = m.index + m[0].indexOf('–');
        rg.setStart(node, d); rg.setEnd(node, d + 1); const a = rg.getBoundingClientRect();
        rg.setStart(node, d + 1); rg.setEnd(node, d + 2); const b = rg.getBoundingClientRect();
        if (!a.width || !b.width || !a.height) continue;
        if (b.top >= a.bottom - 2) out.days.push('“' + txt.slice(Math.max(0, m.index - 20), m.index + m[0].length).replace(/\s+/g, ' ').trim() + '” (a month range broken at its dash)');
      }
      const em = mrEnd.exec(txt);
      if (!em) continue;
      fwd.currentNode = node;
      let q = fwd.nextNode();
      while (q && !q.textContent.length) q = fwd.nextNode();
      if (!q || !visibleHost(q) || !mrStart.test(q.textContent) || blockOf(q.parentElement) !== blockOf(node.parentElement)) continue;
      rg.setStart(node, txt.length - 1); rg.setEnd(node, txt.length); const a = rg.getBoundingClientRect();
      rg.setStart(q, 0); rg.setEnd(q, 1); const b = rg.getBoundingClientRect();
      if (a.width && b.width && a.height && b.top >= a.bottom - 2) out.days.push('“' + (em[0] + q.textContent.slice(0, 12)).replace(/\s+/g, ' ').trim() + '” (a month range broken at its dash)');
    }
    // gst-2 round 4 (designer optional 4): a digit range broken at its dash across a node boundary in one block. The
    // engine's own holds make the split the val-1 check above cannot see, as it reads one text node at a time: a held
    // "TD/ST/26-27/0001" (span.nw) and then "–0012" as a text node of its own read "TD/ST/26-27/0001–" / "0012" in every
    // row of gst-2's stock transfer register at 390 and 360. The digit after the dash starts below the digit before it,
    // whether the dash ends the first node, starts the second, or stands alone between them; counted with the val-1 breaks
    const tw8 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT), fwd8 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nextText = n => { fwd8.currentNode = n; let q = fwd8.nextNode(); while (q && !q.textContent.length) q = fwd8.nextNode(); return q; };
    for (let node = tw8.nextNode(); node; node = tw8.nextNode()) {
      const txt = node.textContent, e = /\d(–?)$/.exec(txt);
      if (!e) continue;
      let q = nextText(node), bi;
      if (!q) continue;
      if (e[1]) { if (!/^\d/.test(q.textContent)) continue; bi = 0; }
      else if (/^–\d/.test(q.textContent)) bi = 1;
      else if (q.textContent === '–') { q = nextText(q); if (!q || !/^\d/.test(q.textContent)) continue; bi = 0; }
      else continue;
      if (!visibleHost(node) || !visibleHost(q) || blockOf(q.parentElement) !== blockOf(node.parentElement)) continue;
      rg.setStart(node, e.index); rg.setEnd(node, e.index + 1); const a = rg.getBoundingClientRect();
      rg.setStart(q, bi); rg.setEnd(q, bi + 1); const b = rg.getBoundingClientRect();
      if (a.width && b.width && a.height && b.top >= a.bottom - 2) out.breaks.push('“' + (txt.slice(-14) + (bi ? '' : '–') + q.textContent.slice(0, 8)).replace(/\s+/g, ' ').replace(/––/, '–').trim() + '” (across a node boundary)');
    }
    // dt-2 round 5 (designer optional 4): a form, section or clause apart from its number ("receivable to Form" / "168
    // and build the summary" in dt-2's brief, "certificates in Form" / "131" on its printed sample; dt-1 round 2 held
    // the same in its generator): the number's first digit starts below the word's last letter. The app's own text
    // only: a paper keeps its issuer's spacing (Form 168's narrow "Section 393(1) entry" head may wrap). A note on the
    // run's line, not a failure, until every level holds its references (the first all-levels run found dt-3's
    // "section 43B" and sa-6's "Form 168" broken at 360; only their own fixers can change them)
    out.refs = [];
    const refRe = /(?<![\w-])(Forms?|[Ss]ection|[Cc]lause)[  ](\d)/g;
    const tw9 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = tw9.nextNode(); node; node = tw9.nextNode()) {
      const txt = node.textContent;
      if (!/(Form|ection|lause)[  ]\d/.test(txt) || !visibleHost(node) || node.parentElement.closest('article.doc, .doc-paper')) continue;
      refRe.lastIndex = 0;
      for (let m = refRe.exec(txt); m; m = refRe.exec(txt)) {
        const w = m.index + m[1].length - 1;           // the word's last letter
        rg.setStart(node, w); rg.setEnd(node, w + 1); const a = rg.getBoundingClientRect();
        rg.setStart(node, w + 2); rg.setEnd(node, w + 3); const b = rg.getBoundingClientRect();
        if (!a.width || !b.width || !a.height) continue;
        if (b.top >= a.bottom - 2) out.refs.push('“' + txt.slice(Math.max(0, m.index - 20), m.index + m[0].length + 6).replace(/\s+/g, ' ').trim() + '”');
      }
    }
    // sa-1 round 8 (designer S1): a held run (span.nw) shows on one line. A rule that reaches a span.nw and switches its
    // wrapping back on undoes the hold with no sign: sa-4 round 6's `.result .r-tasks li span { text-wrap: balance }`
    // (text-wrap is a shorthand that sets text-wrap-mode: wrap, and the rule outranked `.nw { white-space: nowrap }`)
    // broke sa-1's "cut-off" on the result card ("Work out the cut-" / "off effect on March" at 360 and 390), and no
    // check above saw it, as "cut-off" is no code, date, sign or unit. Every text fragment of a hold must share one line;
    // a hold with a line break or a block inside it is left out
    out.holds = [];
    document.querySelectorAll('.nw').forEach(el => {
      if (el.closest('[hidden], .vh, svg, option, script, style') || el.querySelector('br')) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const hr = document.createRange(); hr.selectNodeContents(el);
      const rs = [...hr.getClientRects()].filter(r => r.width > 0.5 && r.height > 0);
      if (rs.length < 2) return;
      const first = rs.reduce((a, r) => r.top < a.top ? r : a), last = rs.reduce((a, r) => r.top > a.top ? r : a);
      if (last.top < first.bottom - 2) return;
      if ([...el.querySelectorAll('*')].some(k => !/^(inline|contents|none)/.test(getComputedStyle(k).display))) return;
      const host = el.parentElement && el.parentElement.closest('[class]');
      out.holds.push('“' + el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) + '”' + (host ? ' (in .' + String(host.className).trim().split(/\s+/)[0] + ')' : ''));
    });
    return out;
  }, { phone: isPhone(vp) });
}

// WCAG AA text contrast on the visible screen (text over a flat background; text on images or gradients is skipped)
async function contrast(page) {
  return page.evaluate(() => {
    const parse = c => { const m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const mix = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
    const out = [];
    const els = [...document.querySelectorAll('body *')].filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight * 3) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || +cs.opacity === 0 || el.closest('[aria-hidden="true"], .vh, svg, .ann')) continue;
      let fg = parse(cs.color); if (!fg) continue;
      let op = 1, bg = null, node = el, skip = false;
      while (node && node.nodeType === 1) {
        const s = getComputedStyle(node);
        op *= +s.opacity;
        if (s.backgroundImage && s.backgroundImage !== 'none' && !/radial-gradient\(circle/.test(s.backgroundImage) && node !== document.body) { skip = true; break; }
        const b = parse(s.backgroundColor);
        if (b && b.a > 0) { bg = bg ? mix(bg, b) : b; if (b.a >= 1) break; }
        node = node.parentElement;
      }
      if (skip) continue;
      bg = bg && bg.a >= 1 ? bg : (bg ? mix(bg, { r: 255, g: 255, b: 255, a: 1 }) : { r: 255, g: 255, b: 255, a: 1 });
      fg = mix({ ...fg, a: fg.a * op }, bg);
      const L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight, 10) >= 700;
      const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5;
      if (ratio < need - 0.05) out.push((el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '')) + ' “' + el.textContent.trim().slice(0, 28) + '” ' + ratio.toFixed(2) + ' (needs ' + need + ')');
    }
    return [...new Set(out)].slice(0, 15);
  });
}
// Tab through the first stops of a screen: each focused control must look different from its unfocused self
async function focusWalk(page, stops = 24) {
  const bad = [];
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.mouse.click(1, 1).catch(() => {});
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.max(0, r.left - 6), y: Math.max(0, r.top - 6), w: Math.min(innerWidth, r.width + 12), h: Math.min(innerHeight, r.height + 12),
        name: el.tagName.toLowerCase() + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : '') + ' “' + (el.textContent || el.getAttribute('aria-label') || el.value || '').trim().slice(0, 24) + '”' };
    });
    if (!info || info.w < 2 || info.h < 2) continue;
    const clip = { x: info.x, y: info.y, width: info.w, height: info.h };
    const on = await page.screenshot({ clip });
    await page.evaluate(() => { window.__wsFocus = document.activeElement; document.activeElement.blur(); });
    const off = await page.screenshot({ clip });
    await page.evaluate(() => { const el = window.__wsFocus; if (el) el.focus({ preventScroll: true }); });
    if (Buffer.compare(on, off) === 0) bad.push(info.name);
  }
  // leave the screen as the walk found it (top, nothing focused): dt-2's short first item ended the walk at the foot
  // of the page with focus in its empty field, so the next check's "1 more to fill" had nowhere left to scroll
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0); });
  return [...new Set(bad)];
}

// Focus order (WCAG 2.4.3): Tab through one region of the screen; each stop must sit at or below the one before it
// (8 px of slack for controls side by side). sa-1 round 4: on a desktop, CSS order put the call above the year and
// the note while Tab still reached it after them. Leaving the region (the wrap-around) ends the walk.
async function focusOrder(page, scopeSel, max = 90) {
  await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.scrollTo(0, 0); });
  await page.mouse.click(1, 1).catch(() => {});
  const stops = [];
  let entered = false;
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate((sel) => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const sc = el.closest(sel), r = el.getBoundingClientRect();
      if (!sc) return { inside: false };
      return { inside: true, top: r.top - sc.getBoundingClientRect().top + sc.scrollTop,
        name: el.tagName.toLowerCase() + ' “' + (el.textContent || el.getAttribute('aria-label') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '”' };
    }, scopeSel);
    if (!info) continue;
    if (info.inside) { entered = true; stops.push(info); } else if (entered) break;
  }
  const bad = [];
  for (let i = 1; i < stops.length; i++) if (stops[i].top < stops[i - 1].top - 8) bad.push(stops[i - 1].name + ' → ' + stops[i].name);
  return bad;
}

// "More columns" on a phone: tap through every wide table of a document. A column must never sit partly under the
// pinned columns (Sl + Description on an invoice) unless it is wider than the room beside them (it can never be shown
// whole) or it was shown whole before, the table has reached its right end and the tap was needed to show something
// cut on the right; every column must be shown whole at some tap; a "More columns" tap must move the table at least
// 24 px unless it is paging through a column wider than the room (dt-1 round 1: on every sheet the last page still read
// "More columns", and the next tap moved 17 px and slid "Paid on" under the row numbers, so 11-01-2027 read
// "1-01-2027"); the button must end on "First columns", and that tap must go back to the first columns.
// ia-1 round 1: no date and no document number in a paper is split over two lines (the debit note printed "dated 13-" /
// "07-2026", every PO "QC/26-" / "27/0176", the indent "03-07-" / "2026" in the desktop pane). A date never splits; a
// slash number of up to 16 characters never splits; a longer one may break only at the slash before its year (ws-docs
// nwDates). Text is read block by block (cell, paragraph, field), so a match never runs across two cells.
// dt-2 round 1: a stamp placed at the top or bottom of a paper sits in its clear band, never on a line of the paper's
// own text (a ruled note's padding undid the band, and Kalbhor's RECEIVED stamp covered "Please do not deduct TDS");
// dt-3 round 1: so does a signature placed there.
async function checkStamps(page, scopeSel) {
  return page.evaluate((sel) => {
    const paper = document.querySelector(sel); if (!paper) return [];
    const rects = []; const tw = document.createTreeWalker(paper, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) {
      if (!n.textContent.trim() || n.parentElement.closest('.ann')) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const q of r.getClientRects()) if (q.width > 2 && q.height > 2) rects.push({ q, t: n.textContent.trim().slice(0, 30) });
    }
    const out = [];
    // dt-3 round 1: a signature placed at the top or bottom sits in the band too (a sheet's padding rule undid the band,
    // and both signatures on the bonus register ran through "checked by Mahesh Kadam"). A hand note is left out: a
    // two-line note is drawn rotated, and its box overlaps the line above with no ink touching (sa-1's inv-11)
    paper.querySelectorAll(':scope > .ann-stamp, :scope > .ann-sign').forEach(a => {
      if (!/\bat-(top|bottom)/.test(a.className)) return;
      const ar = (a.querySelector('span') || a).getBoundingClientRect();
      const hit = rects.find(({ q }) => Math.min(ar.right, q.right) - Math.max(ar.left, q.left) > 4 && Math.min(ar.bottom, q.bottom) - Math.max(ar.top, q.top) > 4);
      if (hit) out.push('“' + a.textContent.trim().replace(/\s+/g, ' ') + '” on “' + hit.t + '”');
    });
    return out;
  }, scopeSel);
}
// sa-3 round 2: a held code (span.nw: a serial, a date, a slash number) stays inside its table cell. A pinned description
// clamped by max-width let "WAS-SC15-2701-118;" run 4.5 px across the column rule at 360 px: nothing clipped and
// nothing passed the viewport, so no other check saw it. The punctuation right after the code counts with it.
async function checkHeldCodes(page, scopeSel) {
  return page.evaluate((sel) => {
    const out = [];
    for (const root of document.querySelectorAll(sel)) {
      root.querySelectorAll('td span.nw').forEach(s => {
        const td = s.closest('td'), a = s.getBoundingClientRect(), b = td.getBoundingClientRect();
        if (!a.width || !b.width) return;
        let right = a.right;
        const n = s.nextSibling;
        if (n && n.nodeType === 3 && /^[;,.:]/.test(n.nodeValue)) { const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 1); right = Math.max(right, r.getBoundingClientRect().right); }
        if (right > b.right + 1) out.push('“' + s.textContent + '” ' + (right - b.right).toFixed(1) + ' px');
      });
    }
    return [...new Set(out)];
  }, scopeSel);
}
// sa-4 round 5 (designer S1): a flex or grid box inside a paper whose own children mix bare text with inline elements
// splits one run of words into separate items, with the box's gap between them: a mail chip read "Salary register
// Apr– Dec 2026 .xlsx" (the date hold's span was its own item), a card title pushed "31 March 2027" off "at", a sheet tab
// lost its space ("GSTR-9Chakan"). The tag is tested, not the display, since a flex item's display is blockified
async function checkFlexSplits(page, scopeSel) {
  return page.evaluate((sel) => {
    const out = [], INLINE = /^(SPAN|B|I|EM|STRONG|A|WBR|SMALL|SUP|SUB|U|S|CODE|MARK|ABBR|TIME)$/;
    for (const root of document.querySelectorAll(sel)) {
      root.querySelectorAll('*').forEach(el => {
        if (!/flex|grid/.test(getComputedStyle(el).display)) return;
        const kids = [...el.childNodes];
        if (kids.some(n => n.nodeType === 3 && n.nodeValue.trim()) && kids.some(n => n.nodeType === 1 && INLINE.test(n.tagName)))
          out.push('“' + el.textContent.trim().replace(/\s+/g, ' ').slice(0, 48) + '” (.' + String(el.className).split(' ')[0] + ')');
      });
    }
    return [...new Set(out)];
  }, scopeSel);
}
// sa-2 round 2: text inside a paper that runs past the nearest box that clips it (overflow hidden or clip). At 360 px
// the QC tag's "GRN-2027-03-0443" ran 6.5 px past the tag on the location screen and lost its last "3": the text node
// overflowed inside a value box that itself stayed inside the paper, so the element-box clip check never saw it. A
// document's own wide table (.doc-scroll, paged with More columns) is skipped.
async function checkClippedText(page, scopeSel) {
  return page.evaluate((sel) => {
    const out = [];
    for (const root of document.querySelectorAll(sel)) {
      const stop = root.parentElement;
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const host = n.parentElement;
        if (!host || host.closest('.doc-scroll, .vh, [hidden], svg')) continue;
        const hs = getComputedStyle(host); if (hs.display === 'none' || hs.visibility === 'hidden') continue;
        let clip = host;
        while (clip && clip !== stop && !/(hidden|clip)/.test(getComputedStyle(clip).overflowX)) clip = clip.parentElement;
        if (!clip || clip === stop) continue;
        const c = clip.getBoundingClientRect(); if (!c.width) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const q of rg.getClientRects()) {
          if (!q.width) continue;
          const over = Math.max(q.right - c.right, c.left - q.left);
          if (over > 1) { out.push('“' + n.nodeValue.trim().slice(0, 40) + '” ' + over.toFixed(1) + ' px'); break; }
        }
      }
    }
    return [...new Set(out)];
  }, scopeSel);
}
async function checkSplits(page, scopeSel) {
  return page.evaluate((sel) => {
    const out = [];
    for (const root of document.querySelectorAll(sel)) {
      const runs = new Map();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode());) {
        let b = n.parentElement;
        while (b && b !== root && !(/^(TD|TH|P|LI|DD|DT|H1|H2|H3|H4)$/.test(b.tagName) || (b.tagName === 'DIV' && getComputedStyle(b).display !== 'inline'))) b = b.parentElement;
        if (!runs.has(b)) runs.set(b, []);
        runs.get(b).push(n);
      }
      // sa-1 round 6 (designer S1): a slash number that ends in its year too ("RF/2291/26-" / "27" on a debit note)
      const RE = /(\b\d{1,2}[-.\/](?:\d{1,2}|[A-Z][a-z]{2})[-.\/]\d{4}\b)|(\b[A-Z][A-Za-z0-9]{0,7}(?:\/[A-Z][A-Za-z0-9]{0,7})*\/\d{2,4}-\d{2}\/[0-9A-Z]{1,8}\b)|(\b[A-Z][A-Za-z0-9]{0,7}(?:\/[A-Za-z0-9]{1,8})*\/\d{2,4}-\d{2}\b(?![\/-]))/g;
      for (const nodes of runs.values()) {
        const map = []; let txt = '';
        nodes.forEach(n => { map.push([txt.length, n]); txt += n.nodeValue; });
        const at = pos => { let k = 0; while (k + 1 < map.length && map[k + 1][0] <= pos) k++; return [map[k][1], pos - map[k][0]]; };
        const top = pos => { const [n, o] = at(pos); const r = document.createRange(); r.setStart(n, o); r.setEnd(n, o + 1); const b = r.getBoundingClientRect(); return b.width || b.height ? b.top : null; };
        let m;
        while ((m = RE.exec(txt))) {
          const t0 = top(m.index); if (t0 === null) continue;
          for (let k = 1; k < m[0].length; k++) {
            const tk = top(m.index + k);
            if (tk !== null && Math.abs(tk - t0) > 4) {
              const tok = m[0], ok = !!(m[2] || m[3]) && tok.length > 16 && tok[k - 1] === '/' && /^\d{2,4}-\d{2}(?:\/|$)/.test(tok.slice(k));
              if (!ok) out.push('“' + tok.slice(0, k) + '” / “' + tok.slice(k) + '”');
              break;
            }
          }
        }
      }
    }
    return [...new Set(out)];
  }, scopeSel);
}

// a paging finding fails the run; a "note: " finding (a sheet column wider than a phone page) is listed, not failed
// (sa-4 round 4: a "sliver: " finding, a cut column that shows a glyph in only a few rows, is listed apart)
function pagingInto(report, doc, items) {
  const notes = items.filter(x => x.startsWith('note: ')).map(x => x.slice(6)), fails = items.filter(x => !x.startsWith('note: ') && !x.startsWith('sliver: '));
  items.filter(x => x.startsWith('sliver: ')).forEach(x => report.notes.push({ sliver: doc + ', ' + x.slice(8) }));
  if (notes.length) report.notes.push({ doc, items: notes });
  if (fails.length) report.paging.push({ doc, items: fails });
}
async function checkPaging(page, scopeSel) {
  return page.evaluate(async (sel) => {
    const out = [];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // gst-1 round 2: after a tap, wait until the smooth scroll has stopped (scrollLeft still over three frames, at most
    // 2 s) before reading the table or the button: a fixed 120 ms under a loaded CPU read the label a frame early, so
    // the next "More columns" tap was really "First columns" and reported a phantom −235 px move
    const settle = async (el) => {
      await sleep(120);
      const t0 = Date.now(); let last = el.scrollLeft, still = 0;
      while (still < 3 && Date.now() - t0 < 2000) {
        await new Promise(r => requestAnimationFrame(() => r()));
        if (Math.abs(el.scrollLeft - last) < 0.5) still++; else { still = 0; last = el.scrollLeft; }
      }
    };
    for (const el of [...document.querySelectorAll(sel + ' .doc-scroll.is-wide')]) {
      const btn = el.querySelector('.sx-btn'); if (!btn) continue;
      el.scrollLeft = 0; await sleep(60);
      const heads = () => [...el.querySelectorAll('thead th')].filter(th => th.colSpan === 1 && !/\bstick[01]\b|\bsx-pad\b/.test(th.className));
      const edge = () => { const b = el.getBoundingClientRect(); let e = 0; el.querySelectorAll('thead th.stick0, thead th.stick1').forEach(th => { e = Math.max(e, th.getBoundingClientRect().right - b.left); }); return e; };
      const room = () => el.clientWidth - edge();
      // the leftmost column running past the right edge (what the next tap is for), or null
      // xl-1 round 2, as the app's endSlack: once a sheet has paged, a column cut only in its cells' right padding is shown
      const slack = () => { if (!(el.scrollLeft > 0) || !el.querySelector('table.dt-sheet')) return 4; const td = el.querySelector('table.dt-sheet tbody td:not(.stick0):not(.stick1)'); return Math.max(4, td ? parseFloat(getComputedStyle(td).paddingRight) || 0 : 0); };
      const pastRight = () => { const b = el.getBoundingClientRect(), s = slack(); return heads().filter(th => th.getBoundingClientRect().right - b.left > el.clientWidth + s).sort((x, y) => x.getBoundingClientRect().left - y.getBoundingClientRect().left)[0] || null; };
      const seen = new Set();
      // ia-1 round 1: a column wider than the room beside the pinned ones is read a page at a time, but each of its
      // cells must still be shown whole on some page (the vendor master printed "shikrapur.boxes@email.c" on one page
      // and "rapur.boxes@email.com" on the next, so the address task 3 turns on was never on screen in one piece)
      // (an Excel sheet keeps every cell on one line, as Excel does, so a long text cell there is read across pages by
      // design and is not checked here)
      const bodyRows = el.querySelector('table.dt-sheet') ? [] : [...el.querySelectorAll('tbody tr')];
      const wideIdx = () => [...new Set(heads().filter(th => th.getBoundingClientRect().width > room() + 1).map(th => th.cellIndex))];
      const cellSeen = new Set();
      const lookCells = () => {
        const b = el.getBoundingClientRect(), e = edge();
        wideIdx().forEach(ci => bodyRows.forEach((tr, ri) => {
          const td = tr.cells[ci]; if (!td || !td.textContent.trim()) return;
          const rg = document.createRange(); rg.selectNodeContents(td); const r = rg.getBoundingClientRect();
          if (r.left - b.left >= e - 1 && r.right - b.left <= el.clientWidth + 4) cellSeen.add(ri + ':' + ci);
        }));
      };
      // sa-4 round 2: once the table has moved, every pinned cell must be opaque, or the figures that scroll under it
      // show through (a yellow-marked row's pinned cells took the mark's see-through colour and read "21,0 9E1002 Venkat,800")
      const seeThrough = new Map();
      const alphaOf = c => { const s = getComputedStyle(c).backgroundColor; if (s === 'transparent') return 0; const m = /rgba?\(([^)]*)\)/.exec(s); if (!m) return 1; const p = m[1].split(/[,\/\s]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; };
      const lookPins = tap => {
        if (el.scrollLeft < 4) return;
        el.querySelectorAll('td.stick0, td.stick1, th.stick0, th.stick1').forEach(c => {
          const r = c.getBoundingClientRect(); if (!r.width || !r.height) return;
          if (alphaOf(c) < 1) { const t = (c.textContent || '').trim().slice(0, 30) || '(empty ' + c.tagName.toLowerCase() + ')'; if (!seeThrough.has(t)) seeThrough.set(t, tap); }
        });
      };
      // sa-4 round 4 (designer optional 1): the column cut at the right edge shows a glyph in only a few of its rows (the
      // bank report's Total row read a lone "2", 7 px of 21,66,562.00, past narrower right-aligned amounts), which reads
      // as a stray mark. The app fades the cut column of a table with more to its right (edgeFade, class sx-more, a mask on
      // the table), so a glyph counts only left of where the mask turns transparent. A note on the run's line, not a failure
      const slivers = [];
      const lookSliver = tap => {
        // only while a column is cut on the right (none at the table's end), and only that column's own cells: a row whose
        // cell there starts further left spans several columns (xl-1's raw sheet) and is no sliver
        const body = el.querySelector(':scope > .sx + *'), cutTh = pastRight(); if (!body || !cutTh) return;
        const right = el.getBoundingClientRect().left + el.clientLeft + el.clientWidth, cutLeft = cutTh.getBoundingClientRect().left;
        // where the mask turns transparent for the body rows (the nearer of its layers: a second layer clears a cut column's
        // rows and leaves its heading the fade); a glyph starting in the ramp's last 8 px before it is too faint to count
        const stops = [...(body.style.maskImage || body.style.webkitMaskImage || '').matchAll(/transparent (-?[\d.]+)px/g)].map(x => parseFloat(x[1]));
        const gone = stops.length ? Math.max(0, right - (body.getBoundingClientRect().left + Math.min(...stops))) + 7.5 : 0;
        let rows = 0, shown = 0, first = '';
        body.querySelectorAll('tbody tr, tfoot tr').forEach(tr => {
          for (const td of tr.cells) {
            if (/\bstick[01]\b/.test(td.className)) continue;
            const c = td.getBoundingClientRect(); if (!(c.left < right - 1 && c.right > right + 1)) continue;
            const t = (td.textContent || '').trim(); if (!t || c.left < cutLeft - 1) break;
            rows++;
            const rg = document.createRange(); rg.selectNodeContents(td);
            if ([...rg.getClientRects()].some(q => q.width > 0 && q.left < right - gone - 0.5)) { shown++; if (!first) first = t.slice(0, 24); }
            break;
          }
        });
        if (shown && rows >= 4 && shown * 4 < rows) slivers.push('after tap ' + tap + ' the column cut at the right edge shows in ' + shown + ' of its ' + rows + ' rows (“' + first + '”)');
      };
      const look = (tap, excusable) => {
        lookCells(); lookPins(tap); lookSliver(tap);
        const b = el.getBoundingClientRect(), e = edge(), atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4, s = slack();
        const cut = [];
        heads().forEach((th, i) => {
          const r = th.getBoundingClientRect(), L = r.left - b.left, R = r.right - b.left;
          if (L >= e - 1 && R <= el.clientWidth + s) seen.add(i);       // 4 px: a table's outer rule may overhang its box (the app's own slack; a paged sheet's cell padding)
          if (L < e - 1 && R > e + 1 && r.width <= el.clientWidth - e + 1) cut.push([i, th]);
        });
        cut.forEach(([i, th]) => { if (!(excusable && atEnd && seen.has(i))) out.push('after tap ' + tap + ': “' + th.textContent.trim() + '” sits partly under the pinned columns'); });
      };
      look(0, false);
      // tap as a student does: while the button says "More columns" (it reads "First columns" at the end)
      let k = 1;
      for (; k <= 14; k++) {
        if (!/More columns/.test(btn.textContent)) break;
        const want = pastRight(), wide = !!want && want.getBoundingClientRect().width > room() + 1, before = el.scrollLeft;
        btn.click(); await settle(el);
        const moved = el.scrollLeft - before;
        if (moved < 24 && !wide) out.push('tap ' + k + ' on “More columns” moved the table only ' + Math.round(moved) + ' px' + (want ? '' : ' (nothing was cut on the right)'));
        look(k, !!want);
      }
      if (k > 14) out.push('“More columns” never reached the end');
      // dt-3 round 1: an Excel sheet keeps each cell on one line, so a column wider than the room beside the pinned
      // ones is never shown whole on any page (the tracker's Notice and Status read cut at every tap). Reported as a
      // note on the run's line, not a failure: ia-1 round 1 made a long text cell read across pages a sheet's design,
      // and published levels carry such columns (dt-2's vendor notes and payee lists); a writer shortens the ones a
      // task turns on
      if (el.querySelector('table.dt-sheet')) {
        const r0 = room();
        heads().filter(th => !th.closest('tr.xl-letters')).forEach(th => { const w = th.getBoundingClientRect().width; if (w > r0 + 1) out.push('note: “' + th.textContent.trim() + '” is ' + Math.round(w) + ' px wide, more than the ' + Math.round(r0) + ' px beside the pinned columns, so no page shows it whole'); });
      }
      if (seeThrough.size) out.push('after tap ' + [...seeThrough.values()][0] + ': ' + seeThrough.size + ' pinned ' + (seeThrough.size === 1 ? 'cell lets' : 'cells let') + ' the scrolled figures show through (' + [...seeThrough.keys()].slice(0, 4).map(t => '“' + t + '”').join(', ') + ')');
      if (slivers.length) out.push('sliver: ' + slivers[0] + (slivers.length > 1 ? ' (and on ' + (slivers.length - 1) + ' more ' + (slivers.length === 2 ? 'page' : 'pages') + ')' : ''));
      const e = edge();
      heads().forEach((th, i) => { if (!seen.has(i) && th.getBoundingClientRect().width <= el.clientWidth - e + 1) out.push('“' + th.textContent.trim() + '” is never shown whole by More columns'); });
      wideIdx().forEach(ci => bodyRows.forEach((tr, ri) => {
        const td = tr.cells[ci];
        if (td && td.textContent.trim() && !cellSeen.has(ri + ':' + ci)) out.push('“' + td.textContent.trim().slice(0, 60) + '” is never shown whole beside the pinned columns');
      }));
      if (/First columns/.test(btn.textContent)) {
        btn.click(); await settle(el);
        if (el.scrollLeft > 4) out.push('“First columns” left the table at ' + Math.round(el.scrollLeft) + ' px');
      }
      el.scrollLeft = 0;
    }
    return [...new Set(out)];
  }, scopeSel);
}

async function playOne(base, entry, vpName) {
  const level = entry.level, id = level.id;
  const meta = catalogue.levels.find(l => l.id === id);
  const dom = catalogue.domains.find(d => d.id === level.domain);
  const dir = path.join(OUT, id, vpName);
  fs.mkdirSync(dir, { recursive: true });
  fs.readdirSync(dir).filter(f => f.endsWith('.png') || f.endsWith('.pdf')).forEach(f => fs.unlinkSync(path.join(dir, f)));
  const browser = await chromium.launch({ args: ['--no-sandbox'], headless: !opt('headed', false) });
  const ctx = await browser.newContext({ ...VIEWPORTS[vpName], serviceWorkers: 'block', locale: 'en-IN', timezoneId: 'Asia/Kolkata' });
  const page = await ctx.newPage();
  const report = { level: id, viewport: vpName, mode, screens: [], consoleErrors: [], failedRequests: [], overflow: [], clipped: [], smallTargets: [], dashBreaks: [], signBreaks: [], unitBreaks: [], dayBreaks: [], codeBreaks: [], digitBreaks: [], dotStarts: [], timesStarts: [], seals: [], contrast: [], focus: [], paging: [], notes: [], problems: [] };
  report.annOverlaps = [];
  report.holdBreaks = [];
  // in preview mode the domain screen asks for every unpublished level; a missing file there is expected
  const expectedMissing = u => { const m = /\/data\/levels\/([\w-]+)\.json/.exec(u || ''); if (!m || m[1] === id) return false; const row = catalogue.levels.find(l => l.id === m[1]); return !!row && !row.published && !fs.existsSync(path.join(APP, 'data', 'levels', m[1] + '.json')); };
  page.on('console', m => { if (m.type() === 'error' && !expectedMissing((m.location() || {}).url)) report.consoleErrors.push(m.text() + ' ' + ((m.location() || {}).url || '')); });
  page.on('pageerror', e => report.consoleErrors.push('pageerror: ' + e.message));
  page.on('requestfailed', r => report.failedRequests.push(r.url() + ' ' + (r.failure() || {}).errorText));
  page.on('response', r => { if (r.status() >= 400 && !expectedMissing(r.url())) report.failedRequests.push(r.status() + ' ' + r.url()); });
  page.on('request', r => { const u = r.url(); if (!u.startsWith(base.origin) && !u.startsWith('data:') && !u.startsWith('blob:')) report.failedRequests.push('external request: ' + u); });
  // the level under test is published for this run; a fixture is injected without touching shipped files
  await page.route('**/data/catalogue.json', async route => {
    const res = await route.fetch(); const cat = await res.json();
    let row = cat.levels.find(l => l.id === id);
    if (!row) { row = { id, domain: level.domain, number: level.number, title: level.title, minutes: level.minutes, order: 0, published: true }; cat.levels.unshift(row); }
    row.published = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cat) });
  });
  if (entry.fixture) await page.route('**/data/levels/' + id + '.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(entry.fixture, 'utf8') }));
  let n = 0;
  // full-page shots lay sticky bars and the documents viewer out in normal flow, so the whole screen is visible;
  // { view: true } also saves the first viewport exactly as a student sees it (NN-name-view.png)
  const FLOW_CSS = '.topbar,.actionbar,.ibar{position:static!important;margin-bottom:0!important}' +
    '#app:has(.viewer)>:not(.viewer){display:none!important}.viewer{position:static!important;min-height:100vh}' +
    '.viewer-body{overflow:visible!important}body.no-scroll{overflow:visible!important}';
  const shot = async (name, o = {}) => {
    await page.waitForTimeout(120);
    await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 3000 }).catch(() => {});
    await page.evaluate(() => Promise.race([Promise.all([...document.images].map(i => i.decode ? i.decode().catch(() => {}) : null)), new Promise(r => setTimeout(r, 2000))]));
    const num = String(++n).padStart(2, '0');
    const file = num + '-' + name + '.png';
    const m = await measure(page, vpName);
    // sa-6 round 3: a shot gets 60 s, not Playwright's 30, so a run that shares the machine with others (--all, or
    // several judges at once) is not failed by a slow capture that passes alone
    const SHOT_MS = 60000;
    if (o.view) { await page.screenshot({ path: path.join(dir, num + '-' + name + '-view.png'), timeout: SHOT_MS }); report.screens.push(num + '-' + name + '-view.png'); }
    const tag = await page.addStyleTag({ content: FLOW_CSS });
    // sa-5 round 1: a very tall page can fail to capture as one image ("Unable to capture screenshot": sa-5's wrong-answer
    // review, 19,424 CSS px at 390 and 20,502 at 360 at device scale 2, while a 19,280 px page still captured). A shot
    // that fails so is saved in parts instead: NN-name.png, NN-name-2.png, … each a viewport of up to 8,000 CSS px
    // scrolled to its place (a clip outside the viewport is refused, and a full-page clip still renders the whole page
    // first); the viewport and the scroll are put back afterwards. Every page that captured before captures as before.
    try {
      await page.screenshot({ path: path.join(dir, file), fullPage: true, timeout: SHOT_MS });
    } catch (e) {
      if (!/Unable to capture screenshot/.test(e.message)) throw e;
      const PART = 8000, fullH = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
      const vp = page.viewportSize(), sy = await page.evaluate(() => window.scrollY);
      for (let y = 0, i = 1; y < fullH; y += PART, i++) {
        const part = i === 1 ? file : num + '-' + name + '-' + i + '.png';
        await page.setViewportSize({ width: vp.width, height: Math.min(PART, fullH - y) });
        await page.evaluate(top => window.scrollTo(0, top), y);
        await page.waitForTimeout(60);
        await page.screenshot({ path: path.join(dir, part), timeout: SHOT_MS });
        if (i > 1) report.screens.push(part);
      }
      await page.setViewportSize(vp);
      await page.evaluate(top => window.scrollTo(0, top), sy);
    }
    await tag.evaluate(t => t.remove());
    report.screens.push(file);
    if (m.overflow) report.overflow.push({ screen: file, ...m.overflow });
    if (m.clipped.length) report.clipped.push({ screen: file, items: [...new Set(m.clipped)].slice(0, 8) });
    if (m.small.length) report.smallTargets.push({ screen: file, items: [...new Set(m.small)].slice(0, 12) });
    if (m.breaks.length) report.dashBreaks.push({ screen: file, items: [...new Set(m.breaks)].slice(0, 8) });
    if (m.signs.length) report.signBreaks.push({ screen: file, items: [...new Set(m.signs)].slice(0, 8) });
    if (m.units.length) report.unitBreaks.push({ screen: file, items: [...new Set(m.units)].slice(0, 8) });
    if (m.days.length) report.dayBreaks.push({ screen: file, items: [...new Set(m.days)].slice(0, 8) });
    if (m.dots.length) report.dotStarts.push({ screen: file, items: [...new Set(m.dots)].slice(0, 8) });
    if (m.times.length) report.timesStarts.push({ screen: file, items: [...new Set(m.times)].slice(0, 8) });
    if (m.codes.length) report.codeBreaks.push({ screen: file, items: [...new Set(m.codes)].slice(0, 8) });
    if (m.refs && m.refs.length) report.notes.push({ ref: file + ': ' + m.refs[0] });
    if (m.digits && m.digits.length) report.digitBreaks.push({ screen: file, n: new Set(m.digits).size, items: [...new Set(m.digits)].slice(0, 8) });
    if (m.seals.length) report.seals.push({ screen: file, items: [...new Set(m.seals)].slice(0, 8) });
    if (m.annOver.length) report.annOverlaps.push({ screen: file, items: [...new Set(m.annOver)].slice(0, 8) });
    if (m.holds.length) report.holdBreaks.push({ screen: file, items: [...new Set(m.holds)].slice(0, 8) });
    if (A11Y && (o.a11y || o.contrast)) {
      const c = await contrast(page); if (c.length) report.contrast.push({ screen: file, items: c });
    }
    if (A11Y && o.a11y) {
      const f = await focusWalk(page); if (f.length) report.focus.push({ screen: file, items: f });
    }
  };
  // a minus figure is entered as a phone student must: the digits, then the ± button (an iPhone pad has no minus)
  const fillNumber = async (loc, v, label) => {
    const s = String(v);
    if (!/^[-−]/.test(s)) await loc.fill(s);
    else {
      await loc.fill(s.replace(/^[-−]\s*/, ''));
      await loc.locator('xpath=..').locator('.sign-btn').click();
      const got = await loc.inputValue();
      if (E.parseNumber(got) !== E.parseNumber(s)) report.problems.push('the ± button did not give ' + label + ' its minus (' + got + ')');
    }
    // the figure, as the box shows it once left (Indian grouping), must fit the box: gst-1 at 360 px showed
    // "−1,80,06,000" as "−1,80,06,00", which reads as a different number (form controls scroll, so measure() never sees it)
    const shown = E.tidyNumberText(await loc.inputValue());
    const fit = await loc.evaluate((el, t) => {
      const cs = getComputedStyle(el), c = document.createElement('canvas').getContext('2d');
      c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      return { need: Math.ceil(c.measureText(t).width + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight)), have: el.clientWidth };
    }, shown);
    if (fit.need > fit.have + 1) report.problems.push('the box for ' + label + ' cuts its figure “' + shown + '” (' + fit.need + ' px in ' + fit.have + ' px)');
  };
  const go = async (hash) => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(250); };
  const hashNow = () => page.evaluate(() => location.hash);
  const histLen = () => page.evaluate(() => history.length);
  // sa-6 round 1: a student types a date into a day box ("5 April" beside its own "April"). In model mode the first
  // number field with a word unit is typed that way once: on leaving the box it must read as the figure, or be flagged
  // under the box (aria-invalid and its note) with the bar saying "Check 1 box", never quietly marked wrong. Then the
  // key is typed as usual.
  let unitTyped = false;
  const typeWithUnit = async (loc, f, v, label) => {
    if (unitTyped || mode !== 'model' || !f.unit || !/^[A-Za-z]/.test(f.unit) || /^[-−]/.test(String(v))) return;
    unitTyped = true;
    await loc.fill(String(v) + ' ' + f.unit);
    await loc.evaluate(el => el.blur()); await page.waitForTimeout(80);
    const got = await loc.inputValue();
    if (E.parseNumber(got) === E.parseNumber(String(v))) return;
    const st = await loc.evaluate(el => {
      const note = document.getElementById(el.id + '-bad'), mb = document.getElementById('more-below');
      return { inv: el.getAttribute('aria-invalid') === 'true', note: !!note && !note.hidden && note.offsetParent !== null, bar: mb ? mb.textContent : '' };
    });
    if (!st.inv || !st.note) report.problems.push(label + ': “' + v + ' ' + f.unit + '” was neither read as ' + v + ' nor flagged under its box');
    if (isPhone(vpName) && st.bar && !/^Check/.test(st.bar.trim())) report.problems.push(label + ': a flagged box left the bar saying “' + st.bar.trim() + '”');
  };
  // Android Back: stepping bill to bill or paper to paper replaces the history entry, so one Back returns to the list
  // or closes the viewer; the "All bills" and close links go back instead of piling up entries.
  let backChecked = false;
  const checkBack = async (ti) => {
    const list = '#/l/' + id + '/t/' + (ti + 1);
    await go(list); await page.waitForSelector('.ilist, .floor');
    // sa-2 round 1: a mapped task opens on the floor. A floor bin on the list opens its item, Back comes back to the
    // floor, a bin not on the list is not a link; then the List view carries the checks below.
    if (await page.locator('.floor').count()) {
      await shot('task' + (ti + 1) + '-floor', { view: true });
      const cell = page.locator('.floor a.fl-bin').first(), href = await cell.getAttribute('href');
      await cell.click(); await page.waitForSelector('#ibar');
      if ((await hashNow()) !== href) report.problems.push('a floor bin opened ' + (await hashNow()) + ', not ' + href);
      await page.goBack(); await page.waitForTimeout(250);
      if ((await hashNow()) !== list || !(await page.locator('.floor').count())) report.problems.push('Back from a floor bin did not return to the floor');
      if (await page.locator('.floor .fl-bin.off a, .floor a.fl-bin.off').count()) report.problems.push('a bin not on the list is a link on the floor');
      await page.locator('[data-act="view"][data-val="list"]').click(); await page.waitForSelector('.ilist');
      await shot('task' + (ti + 1) + '-list-view', { view: true });
    }
    await page.locator('.ilist a.irow').first().click(); await page.waitForSelector('#ibar');
    for (let i = 0; i < 3; i++) { await page.locator('.idetail-top a[aria-label^="Next"]').click(); await page.waitForTimeout(150); }
    if ((await hashNow()) !== list + '/i/4') report.problems.push('Next bill ×3 did not reach bill 4 (' + (await hashNow()) + ')');
    await page.goBack(); await page.waitForTimeout(250);
    if ((await hashNow()) !== list) report.problems.push('Back after three Next bill taps went to ' + (await hashNow()) + ', not the list');
    await page.locator('.ilist a.irow').nth(1).click(); await page.waitForSelector('#ibar');
    await page.locator('.idetail-top a[aria-label^="Next"]').click(); await page.waitForTimeout(150);
    const before = await histLen();
    await page.locator('.idetail-top a.crumb').click(); await page.waitForTimeout(250);
    if ((await hashNow()) !== list) report.problems.push('“All bills” did not return to the list');
    if ((await histLen()) > before) report.problems.push('“All bills” added a history entry instead of going back');
    if (!isPhone(vpName) || !(await page.locator('.task-tools .docs-btn').count())) return;
    const len0 = await histLen();
    await page.locator('.task-tools .docs-btn').click(); await page.waitForSelector('.viewer');
    // ia-2: a task with fewer than four papers (five RCM rows sharing three) steps through as many as it has
    const nPapers = await page.locator('.viewer .pack a').count();
    await page.locator('.viewer .pack a:visible').first().click(); await page.waitForSelector('.viewer .doc');
    for (let i = 0; i < Math.min(3, nPapers - 1); i++) { await page.locator('.viewer-foot a[aria-label="Next document"]').click(); await page.waitForTimeout(150); }
    await page.goBack(); await page.waitForTimeout(250);
    if ((await page.locator('.viewer').count()) || (await hashNow()) !== list) report.problems.push('Back after stepping through papers did not close the viewer (' + (await hashNow()) + ')');
    await page.locator('.task-tools .docs-btn').click(); await page.waitForSelector('.viewer');
    await page.locator('.viewer .pack a:visible').first().click(); await page.waitForSelector('.viewer .doc');
    if (nPapers > 1) { await page.locator('.viewer-foot a[aria-label="Next document"]').click(); await page.waitForTimeout(150); }
    await page.locator('.viewer [data-close]').click(); await page.waitForTimeout(250);
    if ((await page.locator('.viewer').count()) || (await hashNow()) !== list) report.problems.push('Close did not close the viewer');
    if ((await histLen()) > len0 + 1) report.problems.push('opening and closing the viewer left ' + ((await histLen()) - len0) + ' history entries');
  };
  const clickLabel = async (sel) => { const loc = page.locator(sel).first(); await loc.locator('xpath=..').click(); };
  // iber-1 round 1 (designer S1): after a tab or Other papers switch whose paper frames the item's own row (`docRow`),
  // the row sits in view: under the top bar and above the phone's item bar, or inside the desktop documents pane
  // (Wadhwan's row in the call notes sat at y = 1037 of an 844 px screen, under the bar)
  const focusRowCheck = async (where) => {
    await page.evaluate(() => new Promise(res => {
      let last = null, n = 0; const t0 = performance.now();
      const tick = () => {
        const p = document.querySelector('.docs-pane'), y = window.scrollY + ',' + (p ? p.scrollTop : 0);
        if (y === last) n++; else { n = 0; last = y; }
        if (n > 5 || performance.now() - t0 > 2500) return res(); requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }));
    const r = await page.evaluate(() => {
      const row = document.querySelector('[role="tabpanel"] tr.row-focus');
      if (!row || !row.offsetParent) return null;
      // dt-2 round 4: a frame of several rows (a deductor's two quarters) is checked whole, first row's top to last row's bottom
      const all = row.closest('[role="tabpanel"]').querySelectorAll('tr.row-focus');
      const b = { top: row.getBoundingClientRect().top, bottom: all[all.length - 1].getBoundingClientRect().bottom }, pane = row.closest('.docs-pane');
      let top, bottom;
      if (pane) { const p = pane.getBoundingClientRect(); top = Math.max(0, p.top); bottom = Math.min(innerHeight, p.bottom); }
      else {
        const tb = document.querySelector('.topbar'), ib = document.getElementById('ibar'), ibr = ib && ib.getBoundingClientRect();
        top = tb ? tb.getBoundingClientRect().bottom : 0;
        bottom = ibr && ibr.height > 0 && getComputedStyle(ib).position === 'sticky' ? ibr.top : innerHeight;
      }
      // dt-2 round 6 (designer S1): the table's head (`thead`), when it and the frame fit in the view together
      const th = row.closest('table') && row.closest('table').tHead, hr = th && th.getBoundingClientRect();
      const head = hr && hr.height > 0 && hr.top < b.top && b.bottom - hr.top <= bottom - top - 24 ? { top: Math.round(hr.top), bottom: Math.round(hr.bottom) } : null;
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), vt: Math.round(top), vb: Math.round(bottom), head };
    });
    if (r && (r.top < r.vt - 1 || r.bottom > r.vb + 1)) report.problems.push(where + ': the framed row sits out of view after the switch (' + r.top + '–' + r.bottom + ' px, view ' + r.vt + '–' + r.vb + ' px)');
    // dt-2 round 6 (designer S1): where the head and the frame fit in the view together, the head is in view too, so a
    // framed figure is never read without its column (Lothal's register row under "Jul–Sep (₹)" with the head above
    // the screen at 390)
    else if (r && r.head && r.head.top < r.vt - 1) report.problems.push(where + ': the framed row’s table head sits above the view while both fit (head ' + r.head.top + '–' + r.head.bottom + ' px, frame ' + r.top + '–' + r.bottom + ' px, view ' + r.vt + '–' + r.vb + ' px)');
  };
  // sa-1 round 4: the phone's main button on an item must do something a student can see. Tap the sticky bar's
  // "more" button when it shows; fail when the hash, the scroll position and the bar's pixels are all unchanged.
  // While the call is open the bar holds only the call, so a main button beside an open call is itself a problem.
  const deadTap = async (where) => {
    const gateOpenBtn = await page.evaluate(() => { const bar = document.getElementById('ibar'); if (!bar || !bar.classList.contains('gate-open')) return false; return [...bar.querySelectorAll('.btn-primary')].some(b => b.getBoundingClientRect().width > 0 && getComputedStyle(b).display !== 'none'); });
    if (gateOpenBtn) report.problems.push(where + ': a main button sits beside the open call');
    const mb = page.locator('#more-below');
    if (!(await mb.count()) || !(await mb.isVisible())) return;
    const before = { hash: await hashNow(), y: await page.evaluate(() => window.scrollY), px: await page.locator('#ibar').screenshot() };
    await mb.tap().catch(() => mb.click());
    await page.waitForTimeout(600);
    const after = { hash: await hashNow(), y: await page.evaluate(() => window.scrollY), px: await page.locator('#ibar').screenshot() };
    if (before.hash === after.hash && Math.abs(before.y - after.y) < 2 && Buffer.compare(before.px, after.px) === 0) report.problems.push(where + ': the main button “' + ((await mb.textContent()) || '').trim() + '” changes nothing a student can see');
    await page.evaluate(() => window.scrollTo(0, 0));
  };
  // dt-3 round 2: an items task's list bar in every state a student comes back to. Model play steps item to item, so
  // the bar was seen only before the first item and after the last; on dt-3's last task "Check Computation" ran 40 px
  // off a 390 px phone beside "Submit for review". On a phone, after each item's call: fail when a bar button ends more
  // than 8 px past the gutter or the page scrolls sideways; note a button three lines tall (over 64 px).
  const listBar = async (ti, when) => {
    await go('#/l/' + id + '/t/' + (ti + 1)); await page.waitForSelector('.ilist, .floor');
    const m = await page.evaluate(() => {
      const bar = document.querySelector('.actionbar'), de = document.documentElement;
      if (!bar) return null;
      const g = parseFloat(getComputedStyle(bar).paddingRight) || 0;
      return { w: de.clientWidth, sw: de.scrollWidth, g, btns: [...bar.querySelectorAll('.btn')].filter(b => b.getBoundingClientRect().width > 0)
        .map(b => { const r = b.getBoundingClientRect(), rg = document.createRange(); rg.selectNodeContents(b);
          return { t: (b.textContent || '').trim().replace(/\s+/g, ' ') || b.getAttribute('aria-label') || '', right: r.right, h: r.height, th: rg.getBoundingClientRect().height }; }) };
    });
    if (!m) return;
    const main = (m.btns.find(b => /^Check /.test(b.t)) || m.btns[m.btns.length - 1] || { t: '' }).t;
    const where = 'task ' + (ti + 1) + ' list ' + when + ' (“' + main + '”)';
    const past = m.btns.filter(b => b.right > m.w - m.g + 8);
    if (past.length) report.problems.push(where + ': the bar’s “' + past[0].t + '” ends ' + Math.round(past[0].right - (m.w - m.g)) + ' px past the gutter');
    if (m.sw > m.w) report.problems.push(where + ': the page scrolls sideways (' + m.sw + ' px in ' + m.w + ')');
    // the bar's buttons share one height, so the one whose label is tallest is named
    const tall = m.btns.filter(b => b.h > 64).sort((x, y) => y.th - x.th);
    if (tall.length) report.notes.push({ bar: where + ': “' + tall[0].t + '” is three lines (' + Math.round(tall[0].h) + ' px)' });
  };
  const url = base.url + '?preview=1#/';
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('.hero');
  await shot('home', { a11y: true });
  await go('#/d/' + level.domain); await page.waitForSelector('.stage-map'); await page.waitForTimeout(300); await shot('domain');
  // dt-1 round 1: a pack-group name is one flex item beside its count; loose text around a held word ("VMC-10") made
  // three columns ("Item 7 · / VMC-10 / in the block") on the case file and in the viewer's list
  const packGroups = async (where) => {
    const bad = await page.evaluate(() => [...document.querySelectorAll('.pack-group > summary')]
      .filter(s => [...s.childNodes].filter(n => n.nodeType === 1 || (n.nodeType === 3 && n.textContent.trim())).length > 2)
      .map(s => s.textContent.trim().slice(0, 50)));
    for (const b of bad) report.problems.push(where + ': the pack group “' + b + '” splits into loose columns');
  };
  await go('#/l/' + id); await page.waitForSelector('.casefile'); await shot('intro', { view: true, a11y: true });
  await packGroups('case file');
  // the case file's pack leaves out a paper that arrives later in the story (`arrives`); those are checked in the
  // viewer of the task they come with, below
  const docs = (level.documents || []).filter(d => !d.arrives);
  if (isPhone(vpName) && docs.length) {
    await go('#/l/' + id + '/docs'); await page.waitForSelector('.viewer'); await shot('docs-list');
    await packGroups('documents list');
    const which = docsMode === 'none' ? [] : docsMode === 'first' ? [0] : docs.map((_, i) => i);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const i of which) {
      await go('#/l/' + id + '/docs/' + (i + 1)); await page.waitForSelector('.viewer .doc'); await shot('doc-' + String(i + 1).padStart(2, '0') + '-' + docs[i].id, { contrast: true });
      // every wide paper is paged (dt-1 round 1: one sheet per level was checked, and the others hid the bug)
      const p = await checkPaging(page, '.viewer'); pagingInto(report, docs[i].id, p);
      const sp = await checkSplits(page, '.viewer .doc'); if (sp.length) report.problems.push(docs[i].id + ': split over two lines ' + sp.join(', '));
      const ct = await checkClippedText(page, '.viewer .doc'); if (ct.length) report.problems.push(docs[i].id + ': text cut off by its paper ' + ct.join(', '));
      const hc = await checkHeldCodes(page, '.viewer .doc'); if (hc.length) report.problems.push(docs[i].id + ': a held code runs past its cell ' + hc.join(', '));
      const fx = await checkFlexSplits(page, '.viewer .doc'); if (fx.length) report.problems.push(docs[i].id + ': words split into separate flex items ' + fx.join(', '));
      const st = await checkStamps(page, '.viewer .doc-paper'); if (st.length) report.problems.push(docs[i].id + ': stamp or signature on the text ' + st.join(', '));
    }
    await page.emulateMedia({ reducedMotion: null });
    const binsDoc = docs.findIndex(d => d.type === 'bins');
    if (binsDoc >= 0) { await go('#/l/' + id + '/docs/' + (binsDoc + 1)); await page.locator('.viewer [data-bin]').first().click(); await page.waitForSelector('.sheet-pop'); await shot('bin-card', { contrast: true }); await page.keyboard.press('Escape'); }
    await go('#/l/' + id);
  }
  await page.locator('[data-act="start"]').click();
  await page.waitForSelector('.task-head');
  const answers = answersFor(level);
  const tasks = level.tasks || [];
  for (let ti = 0; ti < tasks.length; ti++) {
    const t = tasks[ti], a = answers[t.id] || {};
    if (ti > 0 && tasks[ti - 1].lockOnLeave) {
      // a task with lockOnLeave keeps the next one closed until it is handed in, then stays read-only
      await go('#/l/' + id + '/t/' + (ti + 1));
      await page.waitForSelector('.task-head h1');
      const onTitle = (await page.locator('.task-head h1').textContent()).trim();
      if (onTitle !== tasks[ti - 1].title) report.problems.push('task ' + (ti + 1) + ' opened before task ' + ti + ' was handed in');
      await page.locator('[data-act="hand-in"]').click();
      await page.waitForSelector('#modal');
      await shot('task' + ti + '-hand-in', { view: true });
      // for-1 round 1: handing in a hunt with no flags at all is open work, so Keep working is the main button
      if (tasks[ti - 1].type === 'hunt' && !Object.keys((answers[tasks[ti - 1].id] || {}).flags || {}).length && !(await page.locator('#modal [data-act="modal-close"].btn-primary').count()))
        report.problems.push('handing in task ' + ti + ' with no flags does not make Keep working the main button');
      // sa-7 round 1 (designer S3): handing in a composed text with slots still open, Keep working takes the student to
      // the first open slot, its first option focused (a ten-clause page gave no way to find the four still open)
      const pt = tasks[ti - 1];
      if (pt.type === 'compose') {
        const pa = answers[pt.id] || {};
        const openS = (pt.slots || []).filter(s => !(s.options || []).some(o => o.id === pa[s.id]));
        if (openS.length) {
          await page.locator('#modal [data-act="modal-close"]').click();
          await page.waitForTimeout(150);
          const inFirst = await page.evaluate(fid => { const f = document.getElementById(fid), el = document.activeElement; return !!f && !!el && f.contains(el); }, 'slot-' + pt.id + '-' + openS[0].id);
          if (!inFirst) report.problems.push('Keep working on task ' + ti + ' with open slots does not go to the first open one (' + openS[0].id + ')');
          await page.locator('[data-act="hand-in"]').click();
          await page.waitForSelector('#modal');
        }
      }
      // sa-6 round 4 (designer optional 2): handing in an items task with items still to check, Keep working opens the
      // first of them, as the list's "Check …" button does (it only closed the box)
      if (pt.type === 'items') {
        const pa = answers[pt.id] || {};
        const k = (pt.items || []).findIndex(it => !E.itemAnswered(pt, it, pa[it.id]));
        if (k >= 0) {
          const want = '#/l/' + id + '/t/' + ti + '/i/' + (k + 1);
          await page.locator('#modal [data-act="modal-close"]').click();
          await page.waitForTimeout(250);
          const at = await page.evaluate(() => location.hash);
          if (at !== want || !(await page.locator('#ibar').count())) report.problems.push('Keep working on task ' + ti + ' with items still to check does not open the first of them (' + want + ', at ' + at + ')');
          await go('#/l/' + id + '/t/' + ti); await page.waitForSelector('[data-act="hand-in"]');
          await page.locator('[data-act="hand-in"]').click();
          await page.waitForSelector('#modal');
        }
      }
      await page.locator('[data-act="hand-in-yes"]').click();
      await page.waitForFunction(title => { const h = document.querySelector('.task-head h1'); return !!h && h.textContent.trim() === title; }, t.title, { timeout: 5000 })
        .catch(() => report.problems.push('handing in task ' + ti + ' did not open task ' + (ti + 1)));
      if (tasks[ti - 1].type === 'items') {
        await go('#/l/' + id + '/t/' + ti + '/i/1'); await page.waitForSelector('#ibar');
        if (!(await page.locator('fieldset.locked-set[disabled]').count())) report.problems.push('task ' + ti + ' is still editable after it was handed in');
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot('task' + ti + '-handed-in', { view: true });
      }
    }
    await go('#/l/' + id + '/t/' + (ti + 1));
    await page.waitForSelector('.task-head h1');
    await shot('task' + (ti + 1) + '-' + t.type, { view: ti === 0, a11y: true });
    // xl-1 round 1: a level's own file to download (the workbook a laptop student works in) is offered on its first task
    // screen, where the work happens, not only on the case file; a task's own file (val-1 t3) on that task's screen
    if (!isPhone(vpName) && mode === 'model') {
      const lvFiles = ti === 0 ? (level.downloads || []).map(f => f.file).filter(Boolean) : [];
      const tFiles = (t.downloads || []).map(f => f.file).filter(Boolean);
      if (lvFiles.length || tFiles.length) {
        const hrefs = await page.locator('.task-pane a[download]').evaluateAll(as => as.map(a => decodeURIComponent(a.getAttribute('href') || '')));
        const has = f => hrefs.some(h => h.endsWith('/' + f));
        if (lvFiles.length && !lvFiles.some(has)) report.problems.push('the level has a file to download, but its first task screen offers no link to it');
        tFiles.filter(f => !has(f)).forEach(f => report.problems.push('task ' + (ti + 1) + ' offers ' + f + ' but its screen has no link to it'));
      }
    }
    // xl-1 round 2: a task with one paper (xl-1 t4's pivot) opens it from the Documents button in one tap, not through a
    // one-row list, and its close comes back to the task
    if (isPhone(vpName) && await page.locator('.task-tools .docs-btn').count() &&
        ((await page.locator('.task-tools .docs-btn .n').textContent()) || '').trim() === '1') {
      const here = await hashNow();
      await page.locator('.task-tools .docs-btn').click(); await page.waitForSelector('.viewer');
      if (!(await page.locator('.viewer .doc').count()) || await page.locator('.viewer .pack').count()) report.problems.push('task ' + (ti + 1) + ' has one paper, but Documents opens a list, not the paper');
      await page.locator('.viewer [data-close]').click(); await page.waitForTimeout(250);
      if ((await page.locator('.viewer').count()) || (await hashNow()) !== here) report.problems.push('task ' + (ti + 1) + ': closing its one paper did not return to the task (' + (await hashNow()) + ')');
    }
    // dt-3: a paper that arrives with this task is not in the case file's pack; read it in this task's viewer (phone)
    // with the same checks, and fail if the case file shows it
    const arriving = (level.documents || []).filter(d => d.arrives === t.id);
    if (arriving.length && isPhone(vpName) && docsMode !== 'none') {
      for (const d of arriving) {
        const k = (t.docs || []).indexOf(d.id);
        if (k < 0) { report.problems.push(d.id + ' arrives with task ' + (ti + 1) + ' but that task does not list it'); continue; }
        await go('#/l/' + id + '/t/' + (ti + 1) + '/docs/' + (k + 1)); await page.waitForSelector('.viewer .doc');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await shot('task' + (ti + 1) + '-doc-' + d.id, { contrast: true });
        const p = await checkPaging(page, '.viewer'); pagingInto(report, d.id, p);
        const sp = await checkSplits(page, '.viewer .doc'); if (sp.length) report.problems.push(d.id + ': split over two lines ' + sp.join(', '));
        const ct = await checkClippedText(page, '.viewer .doc'); if (ct.length) report.problems.push(d.id + ': text cut off by its paper ' + ct.join(', '));
        const hc = await checkHeldCodes(page, '.viewer .doc'); if (hc.length) report.problems.push(d.id + ': a held code runs past its cell ' + hc.join(', '));
        const fx = await checkFlexSplits(page, '.viewer .doc'); if (fx.length) report.problems.push(d.id + ': words split into separate flex items ' + fx.join(', '));
        const st = await checkStamps(page, '.viewer .doc-paper'); if (st.length) report.problems.push(d.id + ': stamp or signature on the text ' + st.join(', '));
        await page.emulateMedia({ reducedMotion: null });
      }
      await go('#/l/' + id); await page.waitForSelector('.casefile');
      const early = await page.evaluate(titles => [...document.querySelectorAll('.pack a')].map(a => a.textContent).filter(tx => titles.some(x => tx.indexOf(x) >= 0)), arriving.map(d => d.title));
      if (early.length) report.problems.push('the case file shows a paper that arrives with task ' + (ti + 1) + ': ' + early.join(', '));
      await go('#/l/' + id + '/t/' + (ti + 1)); await page.waitForSelector('.task-head h1');
    }
    // ia-1 round 1: on a desktop, every paper of a task's documents pane, read at the pane's width (the indent printed
    // "03-07-" / "2026" there), then back to the first paper
    if (vpName === 'desktop' && t.type !== 'items' && await page.locator('.docs-pane .doc').count()) {
      const next = page.locator('.docs-pane [data-act="pane-step"][data-step="1"]');
      let steps = 0;
      for (; steps < 80; steps++) {
        const sp = await checkSplits(page, '.docs-pane .doc');
        if (sp.length) report.problems.push('task ' + (ti + 1) + ' documents pane, paper ' + (steps + 1) + ': split over two lines ' + sp.join(', '));
        const hc = await checkHeldCodes(page, '.docs-pane .doc');
        if (hc.length) report.problems.push('task ' + (ti + 1) + ' documents pane, paper ' + (steps + 1) + ': a held code runs past its cell ' + hc.join(', '));
        if (!(await next.count()) || await next.isDisabled()) break;
        await next.click(); await page.waitForTimeout(60);
      }
      const prev = page.locator('.docs-pane [data-act="pane-step"][data-step="-1"]');
      for (let k = 0; k < steps && await prev.count() && !(await prev.isDisabled()); k++) { await prev.click(); await page.waitForTimeout(30); }
    }
    if (t.type === 'items') {
      if (isPhone(vpName)) await listBar(ti, 'before any item');
      for (let k = 0; k < (t.items || []).length; k++) {
        const it = t.items[k], ia = a[it.id];
        if (!ia && k > 0) continue;
        await go('#/l/' + id + '/t/' + (ti + 1) + '/i/' + (k + 1));
        await page.waitForSelector('#ibar');
        // dt-2 round 4 (designer S2): on a desktop, an item that opens on a paper framing its own row (`docRow` on its
        // first paper) shows that row inside the documents pane at once (Form 168's frame for three of dt-2's six
        // deductors sat under the pane's fold at 1366 × 900 until a tab was switched)
        if (vpName === 'desktop' && it.docRow && it.docRow[(it.docs || [])[0]] !== undefined) await focusRowCheck('task ' + (ti + 1) + ' item ' + it.id + ' as it opens');
        if (k === 0) {
          await page.evaluate(() => window.scrollTo(0, 0)); await shot('task' + (ti + 1) + '-item1-open', { view: true, a11y: true });
          if (isPhone(vpName)) await deadTap('the first item screen');
          if (vpName === 'desktop' && A11Y) {
            const fo = await focusOrder(page, '.task-pane');
            if (fo.length) report.problems.push('desktop item screen: Tab goes back up the page (' + fo[0] + ')');
          }
          // sa-3 round 4 (designer S1): a window that crosses the 1024 px breakpoint on an item screen (a tablet turned to
          // landscape, a half-screen laptop window maximised) brings the papers with it. The phone layout's pane held only
          // the item's name and the desktop kept it (same signature): no tabs, no paper. Narrow to 900 px and widen again;
          // then the tablet case, the item drawn fresh at 900 px and widened. Every viewport is otherwise fixed for a run.
          if (vpName === 'desktop') {
            const paneNow = () => page.evaluate(() => {
              const p = document.querySelector('.docs-pane'), b = document.querySelector('.idetail-docs');
              return { docs: p ? p.querySelectorAll('.doc').length : 0, tabs: p ? p.querySelectorAll('[role="tab"]').length : 0,
                bdocs: b ? b.querySelectorAll('.doc').length : 0, btabs: b ? b.querySelectorAll('[role="tab"]').length : 0 };
            });
            // wait (up to 3 s, for a loaded machine) until the layout's papers are back, then measure what is there
            const settle = desk => page.waitForFunction(d => { const el = document.querySelector(d ? '.docs-pane' : '.idetail-docs'); return !!(el && el.querySelector('.doc')); }, desk, { timeout: 3000 }).catch(() => {});
            const full = page.viewportSize(), at0 = await paneNow(), crossed = [];
            if (at0.docs) {
              await page.setViewportSize({ width: 900, height: full.height }); await settle(false);
              const narrow = await paneNow();
              if (!narrow.bdocs || narrow.btabs !== at0.tabs) crossed.push('narrowed to 900 px: ' + narrow.bdocs + ' papers and ' + narrow.btabs + ' of ' + at0.tabs + ' tabs under the heading');
              await page.setViewportSize(full); await settle(true);
              const wide = await paneNow();
              if (!wide.docs || wide.tabs !== at0.tabs) crossed.push('widened again: ' + wide.docs + ' papers and ' + wide.tabs + ' of ' + at0.tabs + ' tabs');
              await page.setViewportSize({ width: 900, height: full.height });
              await go('#/l/' + id + '/t/' + (ti + 1)); await go('#/l/' + id + '/t/' + (ti + 1) + '/i/' + (k + 1)); await page.waitForSelector('#ibar');
              await settle(false); await page.setViewportSize(full); await settle(true);
              const tablet = await paneNow();
              if (!tablet.docs || tablet.tabs !== at0.tabs) crossed.push('drawn at 900 px, then widened: ' + tablet.docs + ' papers and ' + tablet.tabs + ' of ' + at0.tabs + ' tabs');
              if (crossed.length) report.problems.push('task ' + (ti + 1) + ', item 1: documents pane empty after the window crossed the desktop breakpoint (' + crossed.join('; ') + ')');
            }
          }
          if (await page.locator('.tab-other:visible').count()) {
            await page.locator('.tab-other:visible').first().click(); await page.waitForTimeout(150);
            await page.evaluate(() => window.scrollTo(0, 0)); await shot('task' + (ti + 1) + '-item1-other-papers', { view: true });
            // sa-4 round 4 (designer optional 2): a paper title longer than the closed picker's room ends in "…" (the
            // select's own ellipsis), never a cut letter; a note on the run's line, so the writer can shorten the ones a
            // student opens (sa-4's "Security · staff ID cards issued and returned" read "…issued and return" at 390)
            if (isPhone(vpName)) {
              const long = await page.evaluate(() => {
                const s = document.querySelector('#other-doc'); if (!s || !s.offsetWidth) return [];
                const cs = getComputedStyle(s), room = s.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
                const c = document.createElement('canvas').getContext('2d'); c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
                return [...s.options].map(o => [o.textContent, c.measureText(o.textContent).width]).filter(x => x[1] > room + 0.5).map(x => '“' + x[0] + '” (' + Math.round(x[1]) + ' px in ' + Math.round(room) + ')');
              });
              if (long.length) report.notes.push({ picker: 'task ' + (ti + 1) + ': ' + long.length + ' paper ' + (long.length === 1 ? 'title ends' : 'titles end') + ' in “…” in the Other papers picker, e.g. ' + long[0] });
            }
            await page.locator('.tab:visible').first().click(); await page.waitForTimeout(150);
          }
        }
        if (ia) {
          for (const f of t.fields) {
            if (f.kind !== 'choice' || !f.gate) continue;
            if (ia[f.id] !== undefined) await clickLabel('input[data-item="' + it.id + '"][data-field="' + f.id + '"][value="' + ia[f.id] + '"]');
          }
          if (k === 0 && isPhone(vpName)) await deadTap('the first item screen after the call');
          // sa-2 round 1: a four-way call (and, fdd-1 round 1, a three-way gate with `fold: true`) folds once made on a
          // phone (one button beside Next, never a wrapped 2 × 2 grid),
          // opens again on a tap, and folds back when the same call is tapped
          if (isPhone(vpName) && ia[(t.fields.find(f => f.gate) || {}).id] !== undefined && await page.locator('#ibar.gate-grid').count()) {
            const fold = await page.evaluate(() => {
              const bar = document.getElementById('ibar'), sum = bar.querySelector('.gate-sum');
              const tall = [...bar.querySelectorAll('.seg-opt span')].filter(x => x.getBoundingClientRect().height > 52 && getComputedStyle(x).display !== 'none' && x.offsetParent).length;
              return { h: Math.round(bar.getBoundingClientRect().height), sum: !!sum && !!sum.offsetParent, tall,
                sumH: sum && sum.offsetParent ? Math.round(sum.getBoundingClientRect().height) : 0 };
            });
            if (!fold.sum) report.problems.push('item ' + (k + 1) + ': the made call did not fold to one button');
            if (fold.h > 120) report.problems.push('item ' + (k + 1) + ': the item bar is ' + fold.h + ' px tall after the call (120 at most)');
            if (fold.tall) report.problems.push('item ' + (k + 1) + ': a call button wraps in the bar');
            // gst-1 round 1: the folded call stays two lines (label over call); longer labels need a field or option short
            if (fold.sumH > 56) report.problems.push('item ' + (k + 1) + ': the folded call is ' + fold.sumH + ' px tall (two lines, 56 at most; give the field or option a short label)');
            if (k === 0 && fold.sum) {
              await page.locator('#ibar .gate-sum').click(); await page.waitForTimeout(150);
              if (!(await page.locator('#ibar.gate-change .seg-opt').first().isVisible())) report.problems.push('tapping the folded call did not open the calls');
              await shot('task' + (ti + 1) + '-item1-call-change', { view: true });
              await clickLabel('#ibar input[data-item="' + it.id + '"]:checked'); await page.waitForTimeout(150);
              if (await page.locator('#ibar.gate-change').count()) report.problems.push('tapping the same call again did not fold the calls');
            }
          }
          // the bar right after the call, while "N more to fill" shows (gst-1 at 360 px: 4 px past the screen in this
          // state only, which the answered shot never sees)
          if (isPhone(vpName)) { const mm = await measure(page, vpName); if (mm.overflow) report.overflow.push({ screen: 'item ' + (k + 1) + ' of task ' + (ti + 1) + ' just after the call', ...mm.overflow }); }
          for (const f of t.fields) {
            const v = ia[f.id];
            if (f.gate || v === undefined) continue;
            const base = '[data-item="' + it.id + '"][data-field="' + f.id + '"]';
            if (await page.locator(base).count() === 0) continue;
            if (f.kind === 'choice') {
              // gst-3 round 1: `layout: "list"` sets any number of options as radio rows, never a select
              if ((f.options || []).length <= 4 || f.buttons === true || f.layout === 'list') await clickLabel('input' + base + '[value="' + v + '"]');
              else await page.locator('select' + base).selectOption(String(v));
            } else if (f.kind === 'multi') {
              for (const o of f.options) {
                const box = page.locator('input' + base + '[value="' + o.id + '"]');
                const want = [].concat(v).indexOf(o.id) >= 0;
                if ((await box.isChecked()) !== want) await box.locator('xpath=..').click();
              }
            } else if (f.kind === 'number') {
              await typeWithUnit(page.locator('input' + base), f, v, it.id + '.' + f.id);
              await fillNumber(page.locator('input' + base), v, it.id + '.' + f.id);
            }
          }
          const textF = t.fields.find(f => f.kind === 'text');
          if (textF && k === 0 && mode !== 'blank') await page.locator('[data-item="' + it.id + '"][data-field="' + textF.id + '"]').fill('Checked against the GRN register.');
        }
        if (k === 0 || k === 1) await shot('task' + (ti + 1) + '-item' + (k + 1) + '-answered');
        // sa-2 round 2: each of the item's own papers at the item screen's width, which on a phone is narrower than the
        // viewer's (the QC tag fitted the viewer at 360 px and lost a digit here); then back to the first tab
        if (isPhone(vpName)) {
          const tabs = page.locator('.idetail-docs .tab:not(.tab-other)'), nt = await tabs.count();
          for (let j = 0; j < Math.max(nt, 1); j++) {
            if (nt) { await tabs.nth(j).click(); await page.waitForTimeout(60); }
            if (nt && it.docRow) await focusRowCheck('task ' + (ti + 1) + ' item ' + it.id + ' paper ' + (j + 1));
            const ct = await checkClippedText(page, '.idetail-docs .doc');
            if (ct.length) report.problems.push('task ' + (ti + 1) + ' item ' + it.id + (nt ? ' paper ' + (j + 1) : '') + ': text cut off by its paper ' + ct.join(', '));
          }
          if (nt > 1) { await tabs.first().click(); await page.waitForTimeout(60); }
        } else if (it.docRow) {
          const tabs = page.locator('.docs-pane .tab:not(.tab-other)'), nt = await tabs.count();
          for (let j = 1; j < nt; j++) {
            await tabs.nth(j).click(); await page.waitForTimeout(60);
            await focusRowCheck('task ' + (ti + 1) + ' item ' + it.id + ' paper ' + (j + 1));
          }
          if (nt > 1) { await tabs.first().click(); await page.waitForTimeout(60); }
        }
        // the framed row's paper under Other papers (sa-6's tracker): pick it there and check the same
        const otherRow = Object.keys(it.docRow || {}).find(d => (it.docs || []).indexOf(d) < 0);
        const otherDoc = otherRow && (level.documents || []).find(d => d.id === otherRow);
        if (otherDoc && otherDoc.title && await page.locator('.tab-other:visible').count()) {
          await page.locator('.tab-other:visible').first().click(); await page.waitForTimeout(60);
          const sel = page.locator('#other-doc');
          if (await sel.count()) {
            // pick the paper only when Other papers opened on another one: selectOption first scrolls the select into
            // view, and re-picking the paper already shown fires nothing (a student's tap would not scroll at all)
            const norm = s => String(s || '').replace(/\u00a0/g, ' ').trim();
            const idx = await sel.evaluate((s, want) => [...s.options].findIndex(o => o.textContent.replace(/\u00a0/g, ' ').trim() === want), norm(otherDoc.title));
            const cur = await sel.evaluate(s => s.selectedIndex);
            if (idx >= 0 && idx !== cur) { await sel.selectOption({ index: idx }).catch(() => {}); await page.waitForTimeout(60); }
            await focusRowCheck('task ' + (ti + 1) + ' item ' + it.id + ' Other papers');
          }
          await page.locator('.tab:visible').first().click(); await page.waitForTimeout(60);
        }
        if (ia && isPhone(vpName)) await listBar(ti, 'after item ' + (k + 1));
      }
      if (!backChecked && (t.items || []).length >= 4) { backChecked = true; await checkBack(ti); }
      await go('#/l/' + id + '/t/' + (ti + 1));
      await shot('task' + (ti + 1) + '-list-filled');
      // mat-1 round 3 (designer S3): on a phone, no item's name on the filled list runs past three lines. A chip beside
      // it took up to 140 px of the row ("Dividend up to profits" squeezed "Route B · Buyback of 10,00,000 shares at
      // ₹182" to five lines at 360 px); a choice pick now goes under the name (.irow.has-pick). Such a row past three
      // lines fails the run. A row with a gate call beside its name is only a note (second fixer: the first all-levels
      // run found fdd-1's "Item 6 · Aluminium saving before the contract" at four lines beside "No adjustment", text
      // only fdd-1's own fixer may change; as dt-2 round 5 did with its reference check)
      if (isPhone(vpName)) {
        const tall = await page.$$eval('.ilist a.irow .lbl', els => els.map(el => {
          if (!el.offsetParent) return null;
          const lh = parseFloat(getComputedStyle(el).lineHeight) || 20, n = Math.round(el.getBoundingClientRect().height / lh);
          return n > 3 ? { t: '“' + el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40) + '” (' + n + ' lines)', pick: !!el.closest('.has-pick') } : null;
        }).filter(Boolean));
        const tallPick = tall.filter(x => x.pick), tallCall = tall.filter(x => !x.pick);
        if (tallPick.length) report.problems.push('task ' + (ti + 1) + ': an item’s name on the list runs past three lines: ' + tallPick.map(x => x.t).join(', '));
        if (tallCall.length) report.notes.push({ tall: 'task ' + (ti + 1) + ': ' + tallCall.map(x => x.t).join(', ') });
      }
    } else if (t.type === 'worksheet') {
      // mat-1 round 2 (designer S1): text that is no figure in a worksheet box ("1 crore" under a "₹ crore" column) is
      // flagged under the box on leaving it (aria-invalid and its note), the hand-in (or the Submit box on a last task)
      // says it "can’t be read" apart from the empty boxes, and Keep working goes to that box; then the box is cleared
      // and the run goes on as before. (It was taken as a blank: "2 figures still empty", then marked wrong.)
      {
        const c0 = E.inputCells(t)[0], junk = /crore/i.test(String(c0.cell.unit || '')) ? '1 lakh' : '1 crore';
        const box = page.locator('input[data-ws="' + t.id + '"][data-key="' + c0.key + '"]');
        await box.fill(junk); await box.evaluate(el => el.blur()); await page.waitForTimeout(80);
        const fl = await box.evaluate(el => { const n = document.getElementById(el.id + '-bad'); return { inv: el.getAttribute('aria-invalid') === 'true', note: !!n && !n.hidden && n.offsetParent !== null && n.getBoundingClientRect().height > 0 }; });
        if (!fl.inv || !fl.note) report.problems.push('task ' + (ti + 1) + ': “' + junk + '” in the box for ' + c0.key + ' was not flagged under its box');
        const lastTask = ti === tasks.length - 1;
        if (t.lockOnLeave || lastTask) {
          await page.locator(lastTask ? '[data-act="submit"]' : '[data-act="hand-in"]').first().click();
          await page.waitForSelector('#modal');
          const said = (await page.locator('#modal').innerText()).replace(/\s+/g, ' ');
          if (!/can’t be read/.test(said)) report.problems.push('the ' + (lastTask ? 'Submit box' : 'hand-in') + ' of task ' + (ti + 1) + ' does not say a flagged box can’t be read (“' + said.slice(0, 120) + '”)');
          await page.locator('#modal [data-act="modal-close"]').click(); await page.waitForTimeout(150);
          if (!(await box.evaluate(el => document.activeElement === el))) report.problems.push('Keep working on task ' + (ti + 1) + ' does not go to the flagged box ' + c0.key);
        }
        await box.fill(''); await box.evaluate(el => el.blur()); await page.waitForTimeout(60);
        if ((await box.getAttribute('aria-invalid')) === 'true') report.problems.push('task ' + (ti + 1) + ': the flag on ' + c0.key + ' stays once the box is cleared');
      }
      for (const key of Object.keys(a)) await fillNumber(page.locator('input[data-ws="' + t.id + '"][data-key="' + key + '"]'), a[key], key);
      // sa-3 round 1: every number box stays inside its row (at 360 px a fixed 68% box ran 12 px past its row and touched
      // the card's border; measure() never saw it, as nothing passes the viewport or clips)
      const past = await page.$$eval('input[data-ws="' + t.id + '"]', els => els.map(inp => {
        const box = inp.closest('.num') || inp, td = inp.closest('td');
        if (!td || !box.offsetParent) return null;
        const b = box.getBoundingClientRect(), r = td.getBoundingClientRect();
        return { key: inp.getAttribute('data-key'), over: Math.round(Math.max(b.right - r.right, r.left - b.left)) };
      }).filter(x => x && x.over > 0));
      past.forEach(x => report.problems.push('the box for ' + x.key + ' runs ' + x.over + ' px past its row'));
      if (Object.keys(a).length) await shot('task' + (ti + 1) + '-filled');
    } else if (t.type === 'choice') {
      for (const q of t.questions) {
        const v = a[q.id]; if (v === undefined) continue;
        for (const o of q.options) {
          const box = page.locator('input[data-q="' + q.id + '"][data-task="' + t.id + '"][value="' + o.id + '"]');
          const want = q.multi ? [].concat(v).indexOf(o.id) >= 0 : v === o.id;
          if ((await box.isChecked()) !== want && (want || q.multi)) await box.locator('xpath=..').click();
        }
      }
      if (Object.keys(a).length) await shot('task' + (ti + 1) + '-answered');
    } else if (t.type === 'order' && a.order) {
      // ia-1 round 1: the tapped arrow stays under the finger. Tap the last step's up arrow three times: its top on the
      // screen may move at most 8 px a tap (unless the page is scrolled to the top, where the row moves itself); before
      // the fix it jumped one row (84–107 px) a tap at 390 px and the student re-aimed every tap
      {
        const last = (await page.$$eval('#order-list li', lis => lis.map(li => li.getAttribute('data-step')))).pop();
        const up = page.locator('[data-act="move"][data-step="' + last + '"][data-dir="-1"]');
        // centred on the screen, so no sticky bar covers it and the click itself never scrolls the page
        await page.$eval('[data-act="move"][data-step="' + last + '"][data-dir="-1"]', b => b.scrollIntoView({ block: 'center' }));
        const at = () => page.$eval('[data-act="move"][data-step="' + last + '"][data-dir="-1"]', b => ({ top: b.getBoundingClientRect().top, off: b.disabled, y: window.scrollY }));
        for (let k = 1; k <= 3; k++) {
          const before = await at(); if (before.off) break;
          await up.click(); await page.waitForTimeout(60);
          const after = await at();
          if (after.y > 0 && Math.abs(after.top - before.top) > 8) report.problems.push('order task: tap ' + k + ' on a step’s up arrow moved the arrow ' + Math.round(after.top - before.top) + ' px away from the finger');
        }
      }
      for (let i = 0; i < a.order.length; i++) {
        for (let guard = 0; guard < 20; guard++) {
          const cur = await page.$$eval('#order-list li', lis => lis.map(li => li.getAttribute('data-step')));
          const j = cur.indexOf(a.order[i]);
          if (j <= i) break;
          await page.locator('[data-act="move"][data-step="' + a.order[i] + '"][data-dir="-1"]').click();
        }
      }
      await shot('task' + (ti + 1) + '-ordered');
    } else if (t.type === 'compose') {
      for (const s of t.slots) if (a[s.id]) await clickLabel('input[data-slot="' + s.id + '"][data-task="' + t.id + '"][value="' + a[s.id] + '"]');
      // sa-7 round 1 (designer S2): a slot that names its paper links to it under its title; on a phone the link opens
      // that paper in the viewer and Close comes back to the same place on the page, not the top
      const withDocs = (t.slots || []).filter(s => Array.isArray(s.docs) && s.docs.length);
      if (withDocs.length && isPhone(vpName) && mode === 'model') {
        const sl = withDocs[withDocs.length - 1], fid = 'slot-' + t.id + '-' + sl.id;
        const chip = page.locator('#' + fid + ' .slot-paper').first();
        if (!(await chip.count())) report.problems.push('slot ' + sl.id + ' names its paper but shows no link to it');
        else {
          await page.evaluate(f => { const el = document.getElementById(f); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 120); }, fid);
          await page.waitForTimeout(150);
          const y0 = await page.evaluate(() => window.scrollY);
          await chip.click();
          await page.waitForSelector('.viewer .v-title', { timeout: 4000 }).catch(() => {});
          const want = (docs.find(d => d.id === sl.docs[0]) || {}).title || '';
          const got = await page.evaluate(() => { const v = document.querySelector('.viewer .v-title'); if (!v) return ''; const c = v.cloneNode(true); c.querySelectorAll('small').forEach(x => x.remove()); return c.textContent.trim(); });
          if (!got || got.replace(/\u00a0/g, ' ') !== want.replace(/\u00a0/g, ' ')) report.problems.push('slot ' + sl.id + '’s paper link opened “' + got + '”, not “' + want + '”');
          await shot('task' + (ti + 1) + '-slot-paper', { view: true });
          await page.locator('.viewer [data-close]').click();
          await page.waitForFunction(() => !document.querySelector('.viewer'), null, { timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(150);
          const y1 = await page.evaluate(() => window.scrollY);
          if (Math.abs(y1 - y0) > 40) report.problems.push('closing the paper opened from slot ' + sl.id + ' lands at ' + Math.round(y1) + ' px, not back at the slot (' + Math.round(y0) + ' px)');
        }
      }
      if (t.freeText && mode !== 'blank') await page.locator('[data-free="' + t.id + '"]').fill('I will follow this up with the plant head.');
      if (Object.keys(a).length) await shot('task' + (ti + 1) + '-composed');
    } else if (t.type === 'hunt') {
      const ds = docs.find(d => d.id === t.dataset), rk = t.rowKey || '_id';
      const flags = (a.flags || {});
      let first = true;
      const printed = {};
      for (const rid of Object.keys(flags)) {
        const row = (ds.rows || []).find(r => String(r[rk]) === rid);
        const ref = row && (row[(t.keys || {}).ref] || row.vch || row.ref);
        if (ref) { await page.locator('[data-hunt-q="' + t.id + '"]').fill(String(ref)); await page.waitForTimeout(260); }
        if (mode === 'model' && await page.locator('.hrow[data-row="' + rid + '"] .h-amt').count()) printed[rid] = ((await page.locator('.hrow[data-row="' + rid + '"] .h-amt').textContent()) || '').trim();
        await page.locator('.hrow[data-row="' + rid + '"] .flag-btn').click();
        if (first) {
          await shot('task' + (ti + 1) + '-reason');
          // for-1 round 1: the reason box opens whole above the sticky bar at the foot of the screen
          const hid = await page.evaluate(() => {
            const pop = document.querySelector('.reason-pop'), bar = document.querySelector('#ibar') || document.querySelector('.actionbar');
            if (!pop) return 'no box';
            const r = pop.getBoundingClientRect(), b = bar ? bar.getBoundingClientRect() : null;
            const bottom = b && b.top < innerHeight && b.bottom > 0 ? b.top : innerHeight;
            return r.bottom > bottom + 1 ? Math.round(r.bottom - bottom) + ' px under the bar' : '';
          });
          if (hid) report.problems.push('the reason box is not all in view (' + hid + ')');
          first = false;
        }
        await page.locator('.reason-pop [data-val="' + flags[rid] + '"]').click();
      }
      // for-1 round 1: every answer row is found by its amount typed as the row prints it ("₹1,56,609.60" and "1,56,609.60"),
      // and the tests are one at a time (a second test turned on turns the first off)
      if (mode === 'model' && (t.tools || []).indexOf('search') >= 0) {
        for (const rid of Object.keys(printed)) {
          for (const q of [printed[rid], printed[rid].replace(/^₹/, '')]) {
            await page.locator('[data-hunt-q="' + t.id + '"]').fill(q); await page.waitForTimeout(220);
            if (!(await page.locator('.hrow[data-row="' + rid + '"]').count())) report.problems.push('searching “' + q + '” as the row prints it does not find row ' + rid);
          }
        }
        // for-1 round 2: every answer row is found by its date typed as a calendar prints it ("2 October 2026") and as people
        // write it ("02/10/2026"), and by its bill with spaces, "/" and "-" taken out ("KEO1184", as Manav's rule reads it)
        const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        const hk = t.keys || {};
        for (const rid of Object.keys(t.answer || {})) {
          const row = (ds.rows || []).find(r => String(r[rk]) === rid); if (!row) continue;
          const qs = [], dm = hk.date ? /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(String(row[hk.date] || '')) : null;
          if (dm) qs.push(+dm[1] + ' ' + MONTHS[+dm[2] - 1] + ' ' + dm[3], dm[1].padStart(2, '0') + '/' + dm[2].padStart(2, '0') + '/' + dm[3]);
          if (hk.bill && row[hk.bill]) qs.push(String(row[hk.bill]).replace(/[\s\/\-.]/g, ''));
          for (const q of qs) {
            await page.locator('[data-hunt-q="' + t.id + '"]').fill(q); await page.waitForTimeout(220);
            if (!(await page.locator('.hrow[data-row="' + rid + '"]').count())) report.problems.push('searching “' + q + '” (a date as the calendar prints it or people write it, or a bill as the duplicate rule reads it) does not find row ' + rid);
          }
        }
        await page.locator('[data-hunt-q="' + t.id + '"]').fill(''); await page.waitForTimeout(260);
      }
      if (mode === 'model' && (t.tools || []).indexOf('weekend') >= 0 && (t.tools || []).indexOf('round') >= 0) {
        await page.locator('[data-act="hunt-toggle"][data-val="weekend"]').click();
        await page.locator('[data-act="hunt-toggle"][data-val="round"]').click();
        if ((await page.locator('[data-act="hunt-toggle"][data-val="weekend"]').getAttribute('aria-pressed')) !== 'false') report.problems.push('two tests stay on together (Weekend and Round sums)');
        if (!(await page.locator('.hunt-list .hrow[data-row]').count())) report.problems.push('Round sums shows no rows after Weekend');
        await page.locator('[data-act="hunt-toggle"][data-val="round"]').click();
      }
      if ((t.tools || []).indexOf('duplicates') >= 0) {
        await page.locator('[data-hunt-q="' + t.id + '"]').fill(''); await page.waitForTimeout(260);
        await page.locator('[data-act="hunt-toggle"][data-val="dups"]').click(); await shot('task' + (ti + 1) + '-duplicates');
        await page.locator('[data-act="hunt-toggle"][data-val="dups"]').click();
      }
      if (t.matchWith) { await page.locator('[data-act="hunt-toggle"][data-val="match"]').click(); await shot('task' + (ti + 1) + '-match'); await page.locator('[data-act="hunt-toggle"][data-val="match"]').click(); }
      await page.locator('[data-hunt-q="' + t.id + '"]').fill(''); await page.waitForTimeout(260);
      await page.locator('[data-act="hunt-toggle"][data-val="flagged"]').click(); await shot('task' + (ti + 1) + '-flagged');
    }
    if (ti === 0 && t.hints && t.hints.length && mode === 'partial') {
      await page.locator('[data-act="hint-ask"]').first().click(); await page.locator('[data-act="hint-yes"]').click(); await shot('task1-hint');
      if (t.type === 'items') {
        // the hint the student paid for is on every item screen too
        await go('#/l/' + id + '/t/1/i/1'); await page.waitForSelector('#ibar');
        if (!(await page.locator('.hint-inline').count())) report.problems.push('the paid hint is not on the item screen');
        else { await page.locator('.hint-inline > summary').click(); await page.evaluate(() => window.scrollTo(0, 0)); await shot('task1-item-hint', { view: true }); }
        await go('#/l/' + id + '/t/1');
      }
    }
  }
  await page.waitForTimeout(400);
  await page.locator('[data-act="submit"]').click();
  await page.waitForTimeout(250);
  if (await page.locator('#modal').count()) {
    await shot('submit-check');
    // sa-6 round 4 (designer optional 2): on the last task's list, Keep working names the first item still to check
    const lt = tasks[tasks.length - 1], la = answers[lt.id] || {};
    const lk = lt.type === 'items' ? (lt.items || []).findIndex(it => !E.itemAnswered(lt, it, la[it.id])) : -1;
    if (lk >= 0) {
      const href = await page.locator('#modal [data-act="modal-close"]').getAttribute('data-href');
      if (href !== '#/l/' + id + '/t/' + tasks.length + '/i/' + (lk + 1)) report.problems.push('Keep working on the submit check does not open the first item still to check (' + href + ')');
    }
    await page.locator('[data-act="submit-force"]').click();
  }
  await page.waitForSelector('.result');
  await page.waitForTimeout(300);
  await shot('review', { view: true, a11y: true });
  // a wrong number is red, never struck: a strike runs through a minus sign (sa-1 round 4: "−₹49,440" read "₹49,440")
  const struck = await page.$$eval('.ans .you.wrong', els => els.map(e => e.textContent.trim()).filter(s => /^[−-]/.test(s) || /₹|\d,\d/.test(s)));
  if (struck.length) report.problems.push('the review strikes through a number (' + struck[0] + ')');
  // "Answer:" stays on the line of the figure it names (dt-1 r2: "₹78,35,000 Answer:" / "₹23,75,000" at 390 and 360)
  // gst-1 r3: "right figure" holds a no-break space, and the label itself must not break ("Follows your figures ·
  // right" / "figure ₹…" on a phone read the line-end "right" as a verdict)
  const orphanK = await page.$$eval('.ans .k', els => els.filter(k => {
    const t = k.textContent.trim().replace(/ /g, ' '), v = k.nextElementSibling;
    if ((t !== 'Answer:' && t !== 'right figure') || !v || !v.classList.contains('right')) return false;
    const kr = k.getClientRects(), vr = v.getClientRects();
    const tops = [...kr].filter(r => r.width).map(r => r.top);
    if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 4) return true;
    return kr.length && vr.length && vr[0].top >= kr[kr.length - 1].bottom - 1;
  }).map(k => k.textContent.trim().replace(/ /g, ' ') + ' ' + k.nextElementSibling.textContent.trim()));
  if (orphanK.length) report.problems.push('the review breaks “Answer:” or “right figure” from its figure or inside itself (' + orphanK.length + ': ' + orphanK[0] + ')');
  // sa-2 round 2: a short answer label said back in an item's review (18 characters or fewer, from the task's options)
  // reads as one unit: "Nothing" / "else", "Slow-" / "moving" and a struck "Nothing" / "else" split mid-label at 390
  // and 360 px. Only a label standing as a whole part of the line (between its start or end, " · " or "; ") counts.
  const shortLabels = [...new Set(tasks.filter(t => t.type === 'items').flatMap(t => (t.fields || []).flatMap(f => (f.options || []).map(o => o.label)))
    .filter(s => s && s.length <= 18 && /[\s-]/.test(s.trim())))];
  if (shortLabels.length) {
    const split = await page.evaluate((phrases) => {
      const out = [];
      document.querySelectorAll('.ans').forEach(p => {
        const tw = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          if (n.parentElement.closest('em')) continue;   // the student's own note
          const txt = n.nodeValue;
          for (const ph of phrases) {
            for (let i = txt.indexOf(ph); i >= 0; i = txt.indexOf(ph, i + 1)) {
              const before = txt.slice(0, i), after = txt.slice(i + ph.length);
              if (!(/(^|[·;:]\s*)$/.test(before) && /^(\s*[·;]|\s*$)/.test(after))) continue;
              const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + ph.length);
              const tops = [...rg.getClientRects()].filter(r => r.width > 0).map(r => r.top);
              if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 4) out.push('“' + ph + '”');
            }
          }
        }
      });
      return out;
    }, shortLabels);
    if (split.length) report.problems.push('the review splits a short answer label over two lines (' + split.length + ': ' + [...new Set(split)].slice(0, 3).join(', ') + ')');
  }
  // mat-1 round 1 (designer S3): on a task with no main call (no gate field) an all-right item says each answer with its
  // question's short name ("Taxed as: Dividend · Promoter tax: No · …"), one label per answered field, never a bare
  // "· No · No ·" that does not say which question it answers
  const noCall = tasks.filter(t => t.type === 'items' && !(t.fields || []).some(f => f.gate));
  if (noCall.length) {
    const want = noCall.flatMap(t => (t.items || []).map(it => ({ label: it.label,
      n: Object.keys(it.answer || {}).filter(id => { const f = (t.fields || []).find(x => x.id === id); return f && f.kind !== 'text'; }).length })));
    const bare = await page.evaluate((want) => {
      const norm = s => String(s).replace(/[\s  ]+/g, ' ').trim(), out = [];
      document.querySelectorAll('li.nrow').forEach(li => {
        const lbl = li.querySelector('.n-lbl'), mk = li.querySelector('img.mk'), ans = li.querySelector('p.ans');
        if (!lbl || !mk || mk.alt !== 'Right' || !ans || ans.querySelector('br')) return;
        const w = want.find(x => norm(x.label) === norm(lbl.textContent));
        if (w && ans.querySelectorAll('.k').length !== w.n) out.push(norm(lbl.textContent) + ': ' + norm(ans.textContent));
      });
      return out;
    }, want);
    if (bare.length) report.problems.push('an all-right item with no main call says an answer without its question (' + bare.length + ': ' + bare[0] + ')');
  }
  // expected result, computed by the engine from the same answers
  const hints = mode === 'partial' && tasks[0] && tasks[0].hints && tasks[0].hints.length ? 1 : 0;
  const st = E.resultFor(level, answers, hints), score = st.scored;
  const clause = st.passed ? E.renderClause(level, E.computeCounts(level, answers)) : null;
  const expectedLine = clause ? E.buildLine(dom.cvName, E.monthLabel(Date.now()), clause) : null;
  const shownStars = await page.locator('.result .star-on').count();
  // consistency pass round 2 (P2-05): with two passed levels in a domain the yellow sticky holds the domain line and
  // this level's own line is the plain text above it (.lvl-line .ll); alone, the sticky holds the level's line
  const ownLine = '.done .lvl-line .ll';
  const shownLine = (await page.locator(ownLine).count()) ? (await page.locator(ownLine).first().textContent()).trim()
    : (await page.locator('.done .line-text').count()) ? (await page.locator('.done .line-text').first().textContent()).trim() : null;
  report.stars = { shown: shownStars, expected: st.stars };
  report.line = { shown: shownLine, expected: expectedLine };
  report.accuracy = Math.round(score.accuracy * 1000) / 10;
  if (shownStars !== st.stars) report.problems.push('stars shown ' + shownStars + ', expected ' + st.stars);
  if (shownLine !== expectedLine) report.problems.push('line shown differs from expected');
  if (mode === 'model' && st.stars !== 3) report.problems.push('model answers do not give 3 stars');
  if (mode === 'wrong' && (st.stars !== 0 || shownLine)) report.problems.push('wrong answers must give 0 stars and no line');
  // consistency pass round 1 (P01): one Back from the review leaves it, past every stale task, item and paper entry of
  // the attempt (dt-1: seven presses gave /review, /review, /review before the case file), on phone and desktop
  {
    const rev = '#/l/' + id + '/review';
    // the walk passes one stale entry per step; play.mjs itself pushes an entry for every item and paper it opens
    // (a student's stepping replaces them), so a long level can leave a hundred entries to pass. The wait ends on a
    // screen that is not a task, once the address has held still for 1.5 s (the walk's last step waits 600 ms)
    const t0 = Date.now();
    await page.evaluate(() => { delete window.__pw; });
    await page.goBack();
    await page.waitForFunction(rev => {
      const h = location.hash, w = window.__pw || (window.__pw = { h: null, t: 0 });
      if (h !== w.h) { w.h = h; w.t = Date.now(); return false; }
      return !/\/t\/\d/.test(h) && (h !== rev || Date.now() - w.t > 1500);
    }, rev, { timeout: 45000, polling: 100 }).catch(() => {});
    report.backWalkMs = Date.now() - t0;
    const after = await hashNow();
    // Chromium keeps 50 entries, and play.mjs's own pushes can push the case file out of them: the walk then ends on
    // the oldest entry kept, the review put in its place. That is right only if no Back is left from there
    const capped = after === rev && await page.evaluate(() => history.length >= 50 && new Promise(res => {
      let moved = false; addEventListener('popstate', () => { moved = true; }, { once: true });
      history.back(); setTimeout(() => res(!moved), 800);
    }));
    if (capped) report.backWalkCapped = true;
    else if (after === rev || /\/t\/\d/.test(after)) report.problems.push('one Back from the review did not leave it (' + after + ')');
    else if (after === '#/l/' + id && !(await page.locator('.casefile').count())) report.problems.push('Back from the review reached ' + after + ' but not the case file');
    report.backFromReview = after;
    await go(rev); await page.waitForSelector('.result');
  }
  if (st.passed) {
    await page.locator('.done [data-act="add-cv"]').click();
    await page.waitForSelector('.done .btn-done');
    const cv = await page.evaluate(() => JSON.parse(localStorage.getItem('cv_maker_data') || 'null'));
    const domLine = cv && cv.certifications && cv.certifications.find(c => c.name.indexOf(dom.cvName + ', MSC Articleship Program') === 0);
    if (!domLine) report.problems.push('Add to my CV did not write cv_maker_data');
    await page.evaluate(() => document.getElementById('done').scrollIntoView());
    await shot('done-added');
    await go('#/cv'); await page.waitForSelector('.cvcard'); await shot('cv-lines', { a11y: true });
  } else {
    await go('#/cv'); await page.waitForSelector('h1'); await shot('cv-lines-empty');
  }
  // consistency pass round 2 (P2-04): a level not passed has no MSC work sample: its link opens the review (or the
  // case file) and no #sheet is ever drawn
  if (!st.passed) {
    await go('#/l/' + id + '/sample');
    await page.waitForTimeout(600);
    const sheets = await page.locator('#sheet').count(), at = await hashNow();
    if (sheets) report.problems.push('a level not passed still prints a work sample');
    if (at !== '#/l/' + id + '/review' && at !== '#/l/' + id) report.problems.push('the work sample link of a level not passed went to ' + at);
    await shot('work-sample-not-passed');
  } else {
  await go('#/l/' + id + '/sample');
  await page.waitForSelector('#sheet');
  await page.waitForTimeout(300);
  await shot('work-sample');
  // a column of changes (signed) prints an increase with a plus on the work sample, so an interviewer reads a change,
  // not a balance (sa-1 round 4: "Profit before tax ₹18,64,000")
  if (mode === 'model') {
    const sheetText = await page.locator('#sheet').innerText();
    tasks.filter(t => t.type === 'worksheet').forEach(t => E.inputCells(t).forEach(cl => {
      const v = E.parseNumber([].concat(cl.cell.answer)[0]);
      if (v > 0 && E.cellSigned(cl.col, cl.cell) && sheetText.indexOf(E.formatCell(v, cl.cell.format || cl.col.format, true)) < 0) report.problems.push('work sample: ' + cl.key + ' should print ' + E.formatCell(v, cl.cell.format || cl.col.format, true));
    }));
    // a figure typed into a box with a prefix keeps it on the work sample (dt-1 round 1: "unpaid by the due date;
    // 6,20,000" read as a quantity; it prints "₹6,20,000", as the box showed it)
    tasks.filter(t => t.type === 'items').forEach(t => (t.fields || []).filter(f => f.kind === 'number' && f.prefix).forEach(f => (t.items || []).forEach(it => {
      const v = E.parseNumber((it.answer || {})[f.id]); if (v === null || v === undefined) return;
      const body = f.prefix === '₹' ? E.formatINR(Math.abs(v), { symbol: false }) : E.formatNumber(Math.abs(v), 'auto', 3);
      const want = (v < 0 ? '−' : '') + f.prefix + body;
      if (sheetText.indexOf(want) < 0) report.problems.push('work sample: ' + it.id + ' ' + f.id + ' should print ' + want);
    })));
  }
  if (vpName === 'desktop') {
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
    await page.evaluate(() => Promise.all([...document.images].map(i => i.decode ? i.decode().catch(() => {}) : null)));
    // sa-1 round 5 (designer S1): the A4 sheet is laid out as it prints (fixed 190 mm width and the print zoom), so the
    // screens' line-break measure runs on it too; a year split at its en dash there ("Fine (2026–" / "27)", six times
    // on the 3-star sample) was never seen, as the screen scan ran on screen media only
    const pm = await measure(page, vpName), ps = 'work-sample (print)';
    if (pm.breaks.length) report.dashBreaks.push({ screen: ps, items: [...new Set(pm.breaks)].slice(0, 8) });
    if (pm.signs.length) report.signBreaks.push({ screen: ps, items: [...new Set(pm.signs)].slice(0, 8) });
    if (pm.units.length) report.unitBreaks.push({ screen: ps, items: [...new Set(pm.units)].slice(0, 8) });
    if (pm.days.length) report.dayBreaks.push({ screen: ps, items: [...new Set(pm.days)].slice(0, 8) });
    if (pm.dots.length) report.dotStarts.push({ screen: ps, items: [...new Set(pm.dots)].slice(0, 8) });
    if (pm.times.length) report.timesStarts.push({ screen: ps, items: [...new Set(pm.times)].slice(0, 8) });
    if (pm.codes.length) report.codeBreaks.push({ screen: ps, items: [...new Set(pm.codes)].slice(0, 8) });
    if (pm.refs && pm.refs.length) report.notes.push({ ref: ps + ': ' + pm.refs[0] });
    if (pm.holds.length) report.holdBreaks.push({ screen: ps, items: [...new Set(pm.holds)].slice(0, 8) });
    // ba-1 round 3 (designer S1): on the key's own printed sample no line ends in a letter and a hyphen ("NPA (Sub-" /
    // "standard; …)" three times on ba-1's 3-star A4 page; sa-1 round 9's bar). The student's own note (<i>) is left out
    if (mode === 'model') {
      report.hyphenEnds = await page.evaluate(() => {
        const out = [], sheet = document.getElementById('sheet');
        if (!sheet) return out;
        const tw = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT), rg = document.createRange(), nodes = [];
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          const host = n.parentElement;
          if (host && !host.closest('i, [hidden], .vh, svg, script, style') && n.textContent.trim()) nodes.push(n);
        }
        const below = (n1, i1, n2, i2) => {
          rg.setStart(n1, i1); rg.setEnd(n1, i1 + 1); const a = rg.getBoundingClientRect();
          rg.setStart(n2, i2); rg.setEnd(n2, i2 + 1); const b = rg.getBoundingClientRect();
          return a.width && b.width && a.height && b.top >= a.bottom - 2;
        };
        nodes.forEach((node, k) => {
          const txt = node.textContent, re = /[A-Za-z]-(?=[A-Za-z])/g;
          for (let m = re.exec(txt); m; m = re.exec(txt)) {
            // the snippet takes the text before it from the nodes in front, so each line it names can be found
            if (below(node, m.index + 1, node, m.index + 2)) out.push('“' + (nodes.slice(Math.max(0, k - 3), k).map(n => n.textContent).join('') + txt.slice(0, m.index + 12)).slice(-48).replace(/\s+/g, ' ').trim() + '”');
          }
          const next = nodes[k + 1];
          if (/[A-Za-z]-$/.test(txt) && next && /^[A-Za-z]/.test(next.textContent) && below(node, txt.length - 1, next, 0)) out.push('“' + (txt.slice(-16) + next.textContent.slice(0, 10)).replace(/\s+/g, ' ').trim() + '” (across a node boundary)');
        });
        return out;
      });
      if (report.hyphenEnds.length) report.problems.push('a line of the printed work sample ends in a hyphen inside a word (' + report.hyphenEnds.length + ': ' + report.hyphenEnds.slice(0, 3).join(', ') + ')');
      report.hyphenEnds = report.hyphenEnds.slice(0, 8);
    }
    const pdf =await page.pdf({ path: path.join(dir, 'work-sample.pdf'), format: 'A4', printBackground: true, preferCSSPageSize: true });
    report.samplePages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    if (report.samplePages !== 1) report.problems.push('work sample prints on ' + report.samplePages + ' pages');
    // consistency pass round 1 (P02): the zoom the one-page print settled on (body text ≈ 8.6 pt × zoom); under 0.75
    // (about 6.5 pt) is a warning for the level's own layout (sampleColumns, sampleGroups, shorter sub-lines), not a fail;
    // under 0.70 (about 6.0 pt) fails the run (consistency pass round 2, P2-01 part 4: a question's `sample` is the fix)
    report.sampleZoom = parseFloat(await page.locator('#sheet').getAttribute('data-print-zoom')) || null;
    if (mode === 'model' && report.sampleZoom && report.sampleZoom < 0.75) report.notes.push({ zoom: report.sampleZoom });
    if (mode === 'model' && report.sampleZoom && report.sampleZoom < 0.70) report.problems.push('the work sample prints at zoom ' + report.sampleZoom + ' (under 0.70, about ' + (8.6 * report.sampleZoom).toFixed(1) + ' pt body)');
    await page.emulateMedia({ media: 'screen' });
  }
  }
  await go('#/d/' + level.domain); await page.waitForTimeout(300); await shot('domain-after');
  // the engagement map: every stage node sits on the dashed line, done or not (consistency pass round 1, P04: centres
  // are compared, as a stage with no task in the domain is a smaller dot on the same line)
  const tops = await page.$$eval('.stage .node', els => els.map(el => { const r = el.getBoundingClientRect(); return Math.round((r.top + r.height / 2) * 10) / 10; }));
  if (tops.length && Math.max(...tops) - Math.min(...tops) > 1) report.problems.push('stage map nodes are not in one line (centres ' + tops.join(', ') + ')');
  await go('#/'); await page.waitForTimeout(200); await shot('home-after');
  await browser.close();
  if (report.consoleErrors.length) report.problems.push(report.consoleErrors.length + ' console errors');
  if (report.failedRequests.length) report.problems.push(report.failedRequests.length + ' failed requests');
  if (report.overflow.length) report.problems.push('horizontal overflow on ' + report.overflow.length + ' screens');
  if (report.clipped.length) report.problems.push('a box hides part of its content sideways on ' + report.clipped.length + ' screens (' + report.clipped[0].screen + ': ' + report.clipped[0].items[0] + ')');
  if (report.smallTargets.length) report.problems.push('tap targets under 44 px on ' + report.smallTargets.length + ' screens');
  if (report.dashBreaks.length) report.problems.push('an en-dash year or range breaks across two lines on ' + report.dashBreaks.length + ' screens (' + report.dashBreaks[0].screen + ': ' + report.dashBreaks[0].items[0] + ')');
  if (report.codeBreaks.length) report.problems.push('a form or code name breaks at its hyphen on ' + report.codeBreaks.length + ' screens (' + report.codeBreaks[0].screen + ': ' + report.codeBreaks[0].items[0] + ')');
  if (report.digitBreaks.length) report.problems.push('in a paper a hyphen between two digits starts a new line on ' + report.digitBreaks.length + ' screens (' + report.digitBreaks[0].screen + ': ' + report.digitBreaks[0].items[0] + (report.digitBreaks[0].n > 1 ? ', and ' + (report.digitBreaks[0].n - 1) + ' more there' : '') + ')');
  if (report.signBreaks.length) report.problems.push('a minus or plus sign ends a line apart from its ₹ figure on ' + report.signBreaks.length + ' screens (' + report.signBreaks[0].screen + ': ' + report.signBreaks[0].items[0] + ')');
  if (report.unitBreaks.length) report.problems.push('a figure ends a line apart from its unit word (lakh, crore, am, pm) on ' + report.unitBreaks.length + ' screens (' + report.unitBreaks[0].screen + ': ' + report.unitBreaks[0].items[0] + ')');
  if (report.dayBreaks.length) report.problems.push('a day ends a line apart from its month, or a month range at its dash, on ' + report.dayBreaks.length + ' screens (' + report.dayBreaks[0].screen + ': ' + report.dayBreaks[0].items[0] + ')');
  if (report.dotStarts.length) report.problems.push('a line starts with “·” on ' + report.dotStarts.length + ' screens (' + report.dotStarts[0].screen + ': ' + report.dotStarts[0].items[0] + ')');
  if (report.timesStarts.length) report.problems.push('a line of a paper starts with “×” on ' + report.timesStarts.length + ' screens (' + report.timesStarts[0].screen + ': ' + report.timesStarts[0].items[0] + ')');
  if (report.seals.length) report.problems.push('a round stamp’s words run over its ring on ' + report.seals.length + ' screens (' + report.seals[0].screen + ': ' + report.seals[0].items[0] + ')');
  if (report.holdBreaks.length) report.problems.push('a held word or figure (span.nw) breaks over two lines on ' + report.holdBreaks.length + ' screens (' + report.holdBreaks[0].screen + ': ' + report.holdBreaks[0].items[0] + ')');
  if (report.annOverlaps.length) report.problems.push('two marks on a paper write over each other on ' + report.annOverlaps.length + ' screens (' + report.annOverlaps[0].screen + ': ' + report.annOverlaps[0].items[0] + ')');
  if (report.focus.length) report.problems.push('focus not visible on ' + report.focus.length + ' screens');
  if (report.contrast.length) report.problems.push('text contrast under AA on ' + report.contrast.length + ' screens');
  if (report.paging.length) report.problems.push('More columns hides columns in ' + report.paging.length + ' documents');
  report.ok = report.problems.length === 0;
  fs.writeFileSync(path.join(OUT, id, 'report-' + vpName + '-' + mode + '.json'), JSON.stringify(report, null, 2));
  console.log((report.ok ? 'OK  ' : 'FAIL') + ' ' + id + ' ' + vpName + ' ' + mode + ' · stars ' + report.stars.shown + '/' + report.stars.expected +
    ' · ' + report.accuracy + '% · ' + report.screens.length + ' shots' + (report.samplePages ? ' · sample ' + report.samplePages + ' page' + (report.sampleZoom ? ' at zoom ' + report.sampleZoom : '') : '') +
    (report.problems.length ? ' · ' + report.problems.join('; ') : '') +
    (report.notes.some(n => n.doc) ? ' · note: a sheet column is wider than a phone page in ' + report.notes.filter(n => n.doc).map(n => n.doc).join(', ') : '') +
    (report.notes.some(n => n.bar) ? ' · note: a list button wraps to three lines (' + report.notes.filter(n => n.bar).length + ': ' + report.notes.find(n => n.bar).bar + ')' : '') +
    (report.notes.some(n => n.picker) ? ' · note: ' + report.notes.filter(n => n.picker).map(n => n.picker).join('; ') : '') +
    (report.notes.some(n => n.tall) ? ' · note: an item’s name runs past three lines beside its call on the list (' + report.notes.filter(n => n.tall).map(n => n.tall).join('; ') + ')' : '') +
    (report.notes.some(n => n.sliver) ? ' · note: a cut column shows a lone glyph at the right edge (' + report.notes.filter(n => n.sliver).length + ': ' + report.notes.find(n => n.sliver).sliver + ')' : '') +
    (report.notes.some(n => n.ref) ? ' · note: a form, section or clause ends a line apart from its number on ' + report.notes.filter(n => n.ref).length + ' screens (' + report.notes.find(n => n.ref).ref + ')' : '') +
    (report.notes.some(n => n.zoom) ? ' · warn: the work sample prints at zoom ' + report.sampleZoom + ' (under 0.75, about ' + (8.6 * report.sampleZoom).toFixed(1) + ' pt body)' : ''));
  return report;
}

// consistency pass round 1 (I02): a slow account (MSCProgress.load answering after 3 s) never throws away what the
// student did meanwhile. Once per run, on the first level: open its case file, tap Start at once, wait 4 s; the attempt,
// its task route and the account's own passed level must all be there, in the page and in localStorage.
async function syncProbe(base, entry) {
  const id = entry.level.id, problems = [];
  const other = catalogue.levels.find(l => l.id !== id && l.published);
  const account = { v: 1, updatedAt: 5, levels: other ? { [other.id]: { updatedAt: 5, attempts: 1, best: { n: 1, stars: 3, passed: true, accuracy: 1, hints: 0, clause: 'checked the file', month: 'Nov 2026', at: 5, counts: {} } } } : {}, cv: {} };
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ ...VIEWPORTS.phone, serviceWorkers: 'block' });
  await ctx.addInitScript(acc => {
    window.__saves = [];
    window.MSCProgress = { load: () => new Promise(r => setTimeout(() => r(JSON.parse(acc)), 3000)), save: (t, s) => { window.__saves.push(s); } };
  }, JSON.stringify(account));
  const page = await ctx.newPage();
  await page.route('**/data/catalogue.json', async route => {
    const res = await route.fetch(); const cat = await res.json();
    const row = cat.levels.find(l => l.id === id); if (row) row.published = true;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(cat) });
  });
  if (entry.fixture) await page.route('**/data/levels/' + id + '.json', route => route.fulfill({ status: 200, contentType: 'application/json', body: fs.readFileSync(entry.fixture, 'utf8') }));
  await page.goto(base.url + '?preview=1#/l/' + id, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-act="start"]');
  await page.locator('[data-act="start"]').click();
  await page.waitForSelector('.task-head');
  await page.waitForTimeout(4000);
  const got = await page.evaluate(id => {
    const st = window.MSCWSApp.state(), ls = JSON.parse(localStorage.getItem('msc-articleship:work-simulation') || 'null');
    const l = st.levels[id];
    return { hash: location.hash, attempt: !!(l && l.attempt && !l.attempt.submittedAt), lsAttempt: !!(ls && ls.levels[id] && ls.levels[id].attempt), levels: Object.keys(st.levels), lsLevels: ls ? Object.keys(ls.levels) : [], saves: window.__saves.map(s => Object.keys(s.levels)) };
  }, id);
  await browser.close();
  if (!/\/t\/\d/.test(got.hash)) problems.push('the task route is gone after the slow account answered (' + got.hash + ')');
  if (!got.attempt) problems.push('the attempt started while the account was answering is gone from the page');
  if (!got.lsAttempt) problems.push('the attempt is gone from localStorage');
  if (other && !(got.levels.includes(other.id) && got.lsLevels.includes(other.id))) problems.push('the account’s passed ' + other.id + ' did not reach the page and localStorage');
  if (got.saves.some(k => other && !k.includes(other.id))) problems.push('a save went up without the account’s ' + other.id);
  console.log((problems.length ? 'FAIL' : 'OK  ') + ' sync probe (slow account, ' + id + ')' + (problems.length ? ' · ' + problems.join('; ') : ''));
  return !problems.length;
}

// consistency pass round 2 (P2-03): with --a11y, once per run, My CV lines keeps focus where the student is. Three
// domains passed (Statutory audit with two levels, Direct tax, GST): Enter on the third card's Add leaves focus inside
// that card and writes that domain's line only; Space on a pick leaves focus on that box; unticking the only pick keeps
// it ticked and says why in the live region.
async function cvFocusProbe(base) {
  const problems = [];
  const pub = id => catalogue.levels.find(l => l.id === id && l.published);
  const ids = ['sa-1', 'sa-2', 'dt-1', 'gst-1'].filter(pub);
  if (ids.length < 4) { console.log('SKIP cv focus probe (sa-1, sa-2, dt-1 and gst-1 are not all published)'); return true; }
  const best = (at) => ({ n: 1, stars: 3, passed: true, accuracy: 1, hints: 0, clause: 'checked the file', month: 'Nov 2026', at, counts: {} });
  const state = { v: 1, updatedAt: 9, levels: Object.fromEntries(ids.map((id, i) => [id, { updatedAt: i + 1, attempts: 1, best: best(i + 1) }])), cv: {} };
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ ...VIEWPORTS.desktop, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(base.url + '#/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(s => { localStorage.setItem('msc-articleship:work-simulation', s); localStorage.removeItem('cv_maker_data'); localStorage.removeItem('msc-articleship:my-domain'); }, JSON.stringify(state));
  await page.goto(base.url + '#/cv', { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });   // the hash change alone keeps the page booted on the empty state
  await page.waitForSelector('section.cvcard');
  const cards = await page.$$eval('section.cvcard', els => els.map(e => e.getAttribute('aria-labelledby')));
  if (cards.length !== 3) problems.push('expected three cards on My CV lines, saw ' + cards.length);
  const third = cards[2];
  await page.evaluate(lab => document.querySelector('section.cvcard[aria-labelledby="' + lab + '"] [data-act="add-cv"]').focus(), third);
  await page.keyboard.press('Enter');
  await page.waitForSelector('section.cvcard[aria-labelledby="' + third + '"] .btn-done', { timeout: 8000 }).catch(() => problems.push('the third card never showed Added'));
  await page.waitForTimeout(300);
  const after = await page.evaluate(lab => {
    const a = document.activeElement, card = a && a.closest ? a.closest('section.cvcard') : null;
    const cv = JSON.parse(localStorage.getItem('cv_maker_data') || 'null');
    return { inCard: !!card && card.getAttribute('aria-labelledby') === lab, tag: a ? a.tagName + (a.className ? '.' + a.className : '') : null, names: cv && cv.certifications ? cv.certifications.map(c => c.name.split(',')[0]) : [] };
  }, third);
  if (!after.inCard) problems.push('Enter on the third card’s Add left focus outside that card (' + after.tag + ')');
  if (after.names.length !== 1) problems.push('cv_maker_data holds ' + after.names.length + ' lines after one Add (' + after.names.join('; ') + ')');
  // picks: the card with two passed levels
  const boxes = await page.$$eval('input[data-pick]', els => els.map(e => ({ name: e.name, value: e.value, checked: e.checked })));
  const off = boxes.find(b => !b.checked), on = boxes.find(b => b.checked);
  if (!off || !on || !off.name) problems.push('the pick boxes have no name, or no ticked and unticked pair (' + JSON.stringify(boxes) + ')');
  else {
    const focusOn = async v => page.evaluate(v => document.querySelector('input[data-pick][value="' + v + '"]').focus(), v);
    const where = () => page.evaluate(() => { const a = document.activeElement; return a && a.matches('input[data-pick]') ? { value: a.value, checked: a.checked } : { tag: a ? a.tagName : null }; });
    await focusOn(off.value); await page.keyboard.press('Space'); await page.waitForTimeout(300);
    let w = await where();
    if (w.value !== off.value || !w.checked) problems.push('Space on a pick did not leave focus on that box, ticked (' + JSON.stringify(w) + ')');
    await page.keyboard.press('Space'); await page.waitForTimeout(300);   // untick it again: one pick left
    await focusOn(on.value); await page.keyboard.press('Space'); await page.waitForTimeout(400);
    w = await where();
    const live = await page.evaluate(() => (document.getElementById('ws-live') || {}).textContent || '');
    if (w.value !== on.value || !w.checked) problems.push('unticking the only pick did not keep it ticked with focus on it (' + JSON.stringify(w) + ')');
    if (!/A line needs one level\. Tick another level first\./.test(live)) problems.push('unticking the only pick said nothing in the live region (“' + live + '”)');
  }
  await browser.close();
  console.log((problems.length ? 'FAIL' : 'OK  ') + ' cv focus probe (My CV lines, keyboard)' + (problems.length ? ' · ' + problems.join('; ') : ''));
  return !problems.length;
}

// consistency pass round 2 (I2-09): once per model run, the site's hooks behave as INTEGRATION §3 and §6 say:
// (1) MSCProgramAccess.getAccess without the programme shows the gate (Log in, Join); with it (slug object) or null,
// no gate; (2) MSCProgress.getDomain answering "ib-er" after 300 ms puts IB & equity research first and writes the
// key; (3) a domain picked before a 2 s getDomain answers is kept.
async function hooksProbe(base) {
  const problems = [];
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const open = async (init, arg) => {
    const ctx = await browser.newContext({ ...VIEWPORTS.phone, serviceWorkers: 'block' });
    await ctx.addInitScript(init, arg);
    const page = await ctx.newPage();
    await page.goto(base.url + '#/', { waitUntil: 'domcontentloaded' });
    return { ctx, page };
  };
  for (const [label, acc, gated] of [['courses without the programme', { courses: ['msc-cv-course'] }, true], ['the programme as a slug object', { courses: [{ slug: 'msc-articleship-program' }] }, false], ['null', null, false]]) {
    const { ctx, page } = await open(a => { window.MSCProgramAccess = { getAccess: () => Promise.resolve(JSON.parse(a)) }; }, JSON.stringify(acc));
    await page.waitForSelector('.dcard, .card.gate', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(600);
    const g = await page.evaluate(() => { const c = document.querySelector('.card.gate'); return c ? [...c.querySelectorAll('a')].map(a => a.textContent.trim()) : null; });
    if (gated && !(g && g.indexOf('Log in') >= 0 && g.indexOf('Join') >= 0)) problems.push('getAccess with ' + label + ' showed no gate with Log in and Join');
    if (!gated && g) problems.push('getAccess with ' + label + ' showed the gate');
    await ctx.close();
  }
  const ibName = (catalogue.domains.find(d => d.id === 'ib-er') || {}).name;
  {
    const { ctx, page } = await open(() => { window.MSCProgress = { getDomain: () => new Promise(r => setTimeout(() => r('ib-er'), 300)) }; });
    await page.waitForSelector('.dcard'); await page.waitForTimeout(1200);
    const r = await page.evaluate(() => ({ first: (document.querySelector('.dcard .d-name') || {}).textContent, key: localStorage.getItem('msc-articleship:my-domain') }));
    if ((r.first || '').trim() !== ibName) problems.push('getDomain “ib-er” did not put ' + ibName + ' first (first card: ' + r.first + ')');
    if (!/ib-er/.test(r.key || '')) problems.push('getDomain “ib-er” did not write the my-domain key (' + r.key + ')');
    await ctx.close();
  }
  {
    const { ctx, page } = await open(() => { window.MSCProgress = { getDomain: () => new Promise(r => setTimeout(() => r('ib-er'), 2000)) }; });
    await page.waitForSelector('#my-domain');
    await page.selectOption('#my-domain', 'gst');
    await page.waitForTimeout(2600);
    const r = await page.evaluate(() => ({ sel: (document.getElementById('my-domain') || {}).value, first: (document.querySelector('.dcard .d-name') || {}).textContent, key: localStorage.getItem('msc-articleship:my-domain') }));
    if (r.sel !== 'gst' || !/gst/.test(r.key || '')) problems.push('GST picked before a 2 s getDomain answered was not kept (select ' + r.sel + ', key ' + r.key + ')');
    if ((r.first || '').trim() !== 'GST') problems.push('GST picked before a 2 s getDomain answered is not the first card (' + r.first + ')');
    await ctx.close();
  }
  await browser.close();
  console.log((problems.length ? 'FAIL' : 'OK  ') + ' hooks probe (access gate, getDomain)' + (problems.length ? ' · ' + problems.join('; ') : ''));
  return !problems.length;
}

const base = opt('base', null) ? (() => { const u = new URL(opt('base')); return { url: u.href.replace(/[?#].*$/, ''), origin: u.origin }; })() : await startServer(0, { quiet: true });
let failed = 0;
const entries = levelsToPlay();
if (entries.length && mode === 'model') {
  try { if (!(await syncProbe(base, entries[0]))) failed++; }
  catch (e) { failed++; console.log('FAIL sync probe · ' + e.message.split('\n')[0]); }
  if (!entries[0].fixture) {
    try { if (!(await hooksProbe(base))) failed++; }
    catch (e) { failed++; console.log('FAIL hooks probe · ' + e.message.split('\n')[0]); }
  }
}
if (entries.length && A11Y && !entries[0].fixture) {
  try { if (!(await cvFocusProbe(base))) failed++; }
  catch (e) { failed++; console.log('FAIL cv focus probe · ' + e.message.split('\n')[0]); }
}
if (!entries.length) console.log('No level files to play yet (data/levels is empty); try --fixture web/tests/fixtures/demo-level.json');
for (const entry of entries) {
  for (const vp of viewports) {
    try { const r = await playOne(base, entry, vp); if (!r.ok) failed++; }
    catch (e) { failed++; console.log('FAIL ' + entry.level.id + ' ' + vp + ' ' + mode + ' · ' + e.message.split('\n')[0]); }
  }
}
if (base.server) base.server.close();
process.exit(failed ? 1 : 0);
