/* Ported from the content build's Package C (automail/tests/content.test.js), wired to the platform look and gate.
 * Run with node --test from the repo root. */
/* Content checks for the Automail install page: what a student reads and what the page loads.
 * Run from web/articleship-program/automail/:  node --test tests/*.test.js */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'articleship-program', 'automail');
const HTML = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(DIR, 'automail.css'), 'utf8');
const JS = fs.readFileSync(path.join(DIR, 'automail.js'), 'utf8');
// The Apps Script project the page describes (present in the build repo, not on the site).
// The Apps Script and the team's set-up doc live in the content build's Package C, not on the site. Point
// MSC_AUTOMAIL_PKG at its out/C-tests-automail folder to run the cross-checks; without it they skip.
const PKG = process.env.MSC_AUTOMAIL_PKG || path.join(ROOT, 'no-automail-package');
const CODE_DIR = path.join(PKG, '2.6', 'automail');

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
function stripNonText(html) {
  return html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<head>[\s\S]*?<\/head>/i, ' ');
}
/** Visible text of a fragment (tags out, entities decoded, spaces collapsed). */
function textOf(html) {
  return decode(stripNonText(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
/** Values of attributes a student or a screen reader meets. */
function readAttrs(html) {
  const out = [];
  const re = /\s(aria-label|alt|title|placeholder)="([^"]*)"/g;
  let m;
  const body = html.replace(/<head>[\s\S]*?<\/head>/i, '');
  while ((m = re.exec(body))) out.push(decode(m[2]));
  return out;
}
const BODY_TEXT = textOf(HTML);
const ALL_READ = [BODY_TEXT, ...readAttrs(HTML), textOf(HTML.match(/<title>([\s\S]*?)<\/title>/)[1]),
  decode(HTML.match(/<meta name="description" content="([^"]*)"/)[1])].join(' \n ');

function sections() {
  // top-level <section …>…</section> blocks (no nesting in this page)
  const out = [];
  const re = /<section\b([^>]*)>([\s\S]*?)<\/section>/g;
  let m;
  while ((m = re.exec(HTML))) out.push({ attrs: m[1], html: m[2] });
  return out;
}
const withoutDrawings = (html) => html.replace(/<figure[\s\S]*?<\/figure>/g, ' ');

// ------------------------------------------------------------------ head and shell

test('head: noindex, Indian English, canonical, description, the platform look then the shared base then page styles', () => {
  assert.match(HTML, /^<!doctype html>/i);
  assert.match(HTML, /<html lang="en-IN" class="no-js ap-gated">/);
  assert.match(HTML, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(HTML, /<meta name="viewport" content="width=device-width, initial-scale=1/);
  assert.match(HTML, /<link rel="canonical" href="https:\/\/www\.mystudentclub\.com\/articleship-program\/automail\/">/);
  const sheets = [...HTML.matchAll(/<link (?:href="([^"]+)" rel="stylesheet"|rel="stylesheet" href="([^"]+)")>/g)].map((m) => m[1] || m[2]);
  assert.deepEqual(sheets.slice(1), ['/articleship-program/shared/articleship-tools.css', '/articleship-program/shared/msc-tool.css',
    '/articleship-program/automail/automail.css']);
  assert.match(sheets[0], /^https:\/\/fonts\.googleapis\.com\/css2\?family=Caveat[^"]*family=Inter/);
  assert.match(HTML, /<body class="ap-page ap-day-2 day-2"/);
});

test('top bar carries the MSC logo; one h1; headings never skip a level', () => {
  assert.match(HTML, /<header class="ap-topbar msc-bar">\s*<a class="ap-brand logo" href="\/learning-management-system\/course\?course=msc-articleship-program&amp;session=3" aria-label="Back to Day 2">\s*<img src="\/articleship-program\/shared\/msc-logo\.svg" alt="My Student Club"/);
  assert.match(HTML, /<span class="ap-topbar-title tool">Automail<\/span>/);
  assert.equal((HTML.match(/<h1\b/g) || []).length, 1);
  const levels = [...stripNonText(HTML).matchAll(/<h([1-6])\b/g)].map((m) => Number(m[1]));
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i] <= levels[i - 1] + 1, `h${levels[i - 1]} then h${levels[i]}`);
});

test('nothing loads from outside the site but the platform fonts: every file exists; the gate runs first', () => {
  const refs = [...HTML.matchAll(/\s(src|href)="([^"]+)"/g)].map((m) => ({ attr: m[1], url: decode(m[2]) }));
  const tags = [...HTML.matchAll(/<(link|script|img|a)\b[^>]*>/g)].map((m) => m[0]);
  for (const t of tags) {
    const kind = t.slice(1).split(/[\s>]/)[0];
    const url = (t.match(/\s(?:src|href)="([^"]+)"/) || [])[1];
    if (!url) continue;
    if (kind === 'a') continue; // links the student clicks, checked below
    if (kind === 'link' && /rel="canonical"/.test(t)) continue;
    if (kind === 'link' && /^https:\/\/fonts\.(googleapis|gstatic)\.com/.test(url)) continue; // the platform's Inter + Caveat
    assert.ok(!/^[a-z]+:|^\/\//i.test(url), `${kind} loads ${url}`);
    assert.match(url, /^\//, `${kind} uses a site path: ${url}`);
    assert.ok(fs.existsSync(path.join(ROOT, decode(url).split('#')[0])), `missing file ${url}`);
  }
  const scripts = [...HTML.matchAll(/<script\b([^>]*)>([^<]*)<\/script>/g)]
    .map((m) => ((m[1].match(/src="([^"]+)"/) || [])[1]) || m[2].trim());
  assert.deepEqual(scripts, ['/scripts/supabase.js', '/scripts/supabase-init.js', '/scripts/articleship-gate.js',
    'MSCArticleshipGate.protect();', '/articleship-program/automail/config.js', '/articleship-program/automail/automail.js']);
  assert.ok(refs.length > 5);
  assert.ok(!/url\(\s*["']?(https?:)?\/\//i.test(CSS), 'remote url() in CSS');
  assert.ok(!/@import/i.test(CSS));
  assert.ok(!/fetch\(|XMLHttpRequest|import\(/.test(JS), 'the page logic makes no requests');
});

test('every link a student clicks goes somewhere real', () => {
  const links = [...HTML.matchAll(/<a\b([^>]*)>/g)].map((m) => m[1]);
  for (const a of links) {
    const href = (a.match(/href="([^"]*)"/) || [])[1];
    if (a.includes('id="make-copy"')) { assert.equal(href, undefined, 'Make my copy gets its href from config.js'); continue; }
    assert.ok(href, 'link without href: ' + a);
    const h = decode(href);
    if (a.includes('class="ap-brand logo"')) { assert.equal(h, '/learning-management-system/course?course=msc-articleship-program&session=3'); continue; }
    if (h.startsWith('#')) assert.ok(HTML.includes(`id="${h.slice(1)}"`), `no target for ${h}`);
    else if (h.startsWith('mailto:')) assert.match(h, /^mailto:\?subject=[^&]+&body=/);
    else {
      assert.match(h, /^https:\/\/myaccount\.google\.com\/linkedapps$/, `unexpected outside link ${h}`);
      assert.match(a, /target="_blank"/);
      assert.match(a, /rel="noopener"/);
    }
  }
});

test('pictures: every drawing has a role and a description; decorative images have empty alt', () => {
  const mocks = [...HTML.matchAll(/<div class="mock[^"]*"([^>]*)>/g)].map((m) => m[1]);
  assert.ok(mocks.length >= 9, `${mocks.length} drawings`);
  for (const m of mocks) {
    assert.match(m, /role="img"/);
    const label = (m.match(/aria-label="([^"]+)"/) || [])[1];
    assert.ok(label && label.length > 30, 'drawing needs a description');
    assert.match(decode(label), /^Drawing/, 'the description says it is a drawing');
  }
  for (const img of HTML.matchAll(/<img\b[^>]*>/g)) assert.match(img[0], /\salt="/, img[0]);
});

// ------------------------------------------------------------------ what the student reads

test('the page says what the law asks, in its own words', () => {
  const must = [
    'Make my copy', 'Automail runs on a laptop.', 'Send this link to myself', 'Copy link',
    'Before you start', 'Set it up', 'Each weekday', 'Remove Automail’s access',
    'Use Automail only for your own applications, never for client data.',
    'Monday to Friday, 10 am to 6 pm, one mail every 10 minutes, even with your laptop off.',
    'First mails to new firms go Monday to Wednesday',
    'Three follow-ups, five working days apart, in the same thread.',
    'Each follow-up waits for its New line', 'one true thing you have done since your last mail.',
    'The monthly check-in is yours to send',
    'Any reply stops them; so does a bounce or an automatic reply.',
    'Stop Automail', 'See details', 'Remove access', 'Confirm', 'Access to your Google Account',
    'Google hasn’t verified this app', 'Go to Articleship Automail (unsafe)', 'Select all',
    'Send it by hand from Gmail the same day.', 'Opening'
  ];
  for (const s of must) assert.ok(BODY_TEXT.includes(s), `missing: ${s}`);
  // the client-data rule lives here only once
  assert.equal(BODY_TEXT.split('never for client data').length - 1, 1);
});

test('never shown: internal codes, hedges, coming soon, versions, money, promises', () => {
  // Other programmes' names are checked by the build repo's own internal tool (2.6/tools/check_never_shown.py, run on
  // these files by 2.6/tests/content.test.js), never listed here: this folder goes to the site repo.
  const banned = [/coming soon/i, /NEEDS-CHECK/i, /\bwave\b/i, /\bbatch\b/i, /\bdrop [abc]\b/i, /live week/i,
    /\bv\d+(\.\d+)+\b/i, /version/i, /saved on this device/i, /privacy/i, /disclaimer/i,
    /guarantee/i, /promise/i, /stipend/i, /salary/i, /₹/, /\bH2\b/, /\bD2-3\b/, /\b2\.6\b/, /\b4\.1[12]\b/,
    /decision \d/i, /house rule/i, /FACTS/, /source:/i, /last checked/i, /beta/i, /MSCIT/i, /\bTODO\b/i,
    /lorem/i, /\bdummy\b/i, /\btest mode\b/i];
  for (const re of banned) assert.ok(!re.test(ALL_READ), `banned text ${re}: …${(ALL_READ.match(re) || [''])[0]}…`);
});

test('curly quotes and ’ everywhere a student reads; no emoji, arrows or tick glyphs', () => {
  assert.ok(!/['"]/.test(ALL_READ), 'straight quote in: ' + (ALL_READ.match(/.{0,40}['"].{0,40}/) || [''])[0]);
  assert.ok(!/[←-⇿✀-➿☀-⛿⬀-⯿■-◿]|\p{Extended_Pictographic}/u.test(ALL_READ),
    'glyph found: ' + (ALL_READ.match(/[←-⇿✀-➿☀-⛿⬀-⯿■-◿]|\p{Extended_Pictographic}/u) || [''])[0]);
  assert.ok(ALL_READ.includes('’'));
});

test('demo people only: names marked (demo), addresses firstname.lastname@email.com, no phone numbers', () => {
  const emails = ALL_READ.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) || [];
  assert.ok(emails.length >= 2);
  for (const e of emails) assert.match(e, /^[a-z]+\.[a-z]+@email\.com$/, e);
  const names = ALL_READ.match(/Riya Sharma(?! \(demo\))/g) || [];
  assert.equal(names.length, 0, 'every Riya Sharma is marked (demo)');
  assert.ok(!/\b\d{10}\b|\+91/.test(ALL_READ), 'no phone numbers');
  for (const firm of ['Batliboi', 'Deloitte', 'KPMG', 'PwC', 'Grant Thornton', 'BDO', 'RSM', 'Lodha', 'Kothari', 'SNB'])
    assert.ok(!ALL_READ.includes(firm), `real firm in a drawing: ${firm}`);
});

test('labels stay short: buttons 1–3 words (the phone button is the one named in the brief), headings ≤ 4 words', () => {
  const buttons = [...HTML.matchAll(/<(?:a|button)\b[^>]*class="[^"]*\b(?:btn|link-btn)\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|button)>/g)]
    .map((m) => textOf(m[1].replace(/<span class="visually-hidden">[\s\S]*?<\/span>/g, '')));
  assert.deepEqual(buttons.sort(), ['Copy link', 'Make my copy', 'Send this link to myself'].sort());
  for (const b of buttons) if (b !== 'Send this link to myself') assert.ok(b.split(' ').length <= 3, b);
  const heads = [...HTML.matchAll(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/g)].map((m) => textOf(m[2].replace(/<span class="n"[^>]*>\d<\/span>/, '')));
  for (const h of heads) if (h !== 'Automail runs on a laptop.') assert.ok(h.split(' ').length <= 4, h);
});

test('about 80 words a screen: every section’s own text (drawings aside) stays short', () => {
  const secs = sections();
  assert.ok(secs.length >= 7);
  for (const s of secs) {
    const id = (s.attrs.match(/aria-labelledby="([^"]+)"/) || [])[1];
    if (id === 'h-setup') {
      // the set-up runs over several screens: count each step
      for (const step of s.html.split('<li class="am-step')) {
        const words = textOf(withoutDrawings(step)).split(' ').filter(Boolean).length;
        assert.ok(words <= 80, `step has ${words} words`);
      }
      continue;
    }
    const plain = withoutDrawings(s.html).replace(/<noscript>[\s\S]*?<\/noscript>/g, ' ')
      .replace(/<span class="visually-hidden">[\s\S]*?<\/span>/g, ' ');
    // laptop and phone each see one of the two hero blocks
    for (const hide of ['am-phone-only', 'am-laptop-only']) {
      const shown = plain.replace(new RegExp(`<div class="${hide}[\\s\\S]*?<\\/div>`, 'g'), ' ');
      const words = textOf(shown).split(' ').filter(Boolean).length;
      assert.ok(words <= 85, `${id} (${hide} hidden): ${words} words`);
    }
  }
});

test('the pictures match the Automail the student copies (when its code is in this repo)', { skip: !fs.existsSync(path.join(CODE_DIR, 'Code.gs')) && 'Apps Script source not in this tree' }, () => {
  const files = fs.readdirSync(CODE_DIR).filter((f) => /\.(gs|html|js)$/.test(f));
  const code = files.map((f) => fs.readFileSync(path.join(CODE_DIR, f), 'utf8')).join('\n');
  for (const s of ['Start here', 'Open Automail', 'Stop Automail', 'Set up Automail', 'Your CV', 'Your firms',
    'Add the Big 10', 'Add firms from the cold mailing list', 'Start Automail', 'Send test mail', 'Continue',
    'Choose from Drive', 'Save and continue', 'Status board', 'Opening', 'Fully applied', 'Poster messaged',
    'Partner or director', 'Current article', 'Interview', 'Rejected', 'Offer', 'More', 'Help', 'Home', 'Mails', 'My details',
    'Your applications, sent and followed up.', 'Pick a mail on each firm you want to write to. A row with no mail is left alone.',
    'Start here: open the Automail menu at the top and click Start here.', 'If Google says it hasn’t verified this app, ',
    'click Advanced, then Go to Articleship Automail, tick Select all, Continue. Then click Start here again.',
    'Big 10 in your cities', 'Articleship Cold Mailing List - All Emails',
    'Pick your CV and your cover letter for each domain. Each mail says both are attached.',
    'Add the firms. You pick a mail on each one you want to write to, on the Status board.',
    'Back', 'Today', 'Sent today', 'Waiting', 'Followed up', 'Applied', 'Drafted', 'Reply', 'Change', 'New line',
    'Cover letter for ', 'CV for ', 'Each network’s inboxes for your cities as mail rows, its portal as a portal row.',
    'Firms in your cities, for your domains, newest posts first.']) {
    assert.ok(code.includes(s), `the Apps Script never says “${s}”, but the install page shows it`);
  }
  // the mail names in the step 6 drawing are the Mail dropdown's own chips
  for (const chip of new Set([...HTML.matchAll(/<span class="sp-chip">([^<]+)<\/span>/g)].map((m) => decode(m[1])))) {
    assert.ok(code.includes(`"chip": "${chip}"`), `no mail called “${chip}” in Templates.gs`);
  }
});

test('the cold mailing list is mentioned only through config.js: every mention is marked and hidden by default', () => {
  // Copies hide the button until the MSC team sets the list; the page then turns these on (coldList: true).
  const marked = [...HTML.matchAll(/<(\w+)\b([^>]*\bdata-cold-list\b[^>]*)>([\s\S]*?)<\/\1>/g)];
  assert.equal(marked.length, 3, 'the hero line, step 5 and the step 5 drawing');
  for (const m of marked) assert.match(m[2], /\shidden(\s|$)/, 'hidden until config.js says so: ' + m[0].slice(0, 80));
  // Outside the marked parts (and the drawing's alternative description), no word of it.
  const rest = HTML.replace(/<(\w+)\b[^>]*\bdata-cold-list\b[^>]*>[\s\S]*?<\/\1>/g, ' ').replace(/data-label-cold="[^"]*"/g, ' ');
  assert.ok(!/cold mailing list/i.test(textOf(rest) + readAttrs(rest).join(' ')), 'an unmarked cold-list mention');
  const step5 = HTML.match(/<li class="am-step" id="step-5">[\s\S]*?<\/li>/)[0];
  assert.match(textOf(step5.replace(/<span data-cold-list hidden>[\s\S]*?<\/span>/g, '').replace(/<figure[\s\S]*?<\/figure>/, '')),
    /Click Add the Big 10 ?\. On the last screen, click Start Automail ?\./);
});

// ------------------------------------------------------------------ the MSC team's set-up doc (build repo only)
const SETUP_DOC = path.join(PKG, 'AUTOMAIL-SETUP.md');

test('config.js points the team at the set-up step that fills it', { skip: !fs.existsSync(SETUP_DOC) && 'AUTOMAIL-SETUP.md not in this tree' }, () => {
  const doc = fs.readFileSync(SETUP_DOC, 'utf8');
  const cfg = fs.readFileSync(path.join(DIR, 'config.js'), 'utf8');
  const n = (cfg.match(/AUTOMAIL-SETUP\.md, step (\d+)/) || [])[1];
  assert.ok(n, 'config.js names its set-up step');
  const heading = (doc.match(new RegExp(`^## ${n}\\. (.+)$`, 'm')) || [])[1];
  assert.ok(heading && /config|install page|link/i.test(heading), `step ${n} is “${heading}”`);
  assert.ok(doc.includes('web/articleship-program/automail/config.js'));
  assert.ok(doc.includes('AUTOMAIL_RELEASE=1 node --test tests/*.test.js'));
});

test('every team function the set-up doc names exists in the Apps Script', { skip: !(fs.existsSync(SETUP_DOC) && fs.existsSync(path.join(CODE_DIR, 'Code.gs'))) && 'Apps Script source not in this tree' }, () => {
  const doc = fs.readFileSync(SETUP_DOC, 'utf8');
  const code = fs.readdirSync(CODE_DIR).filter((f) => f.endsWith('.gs')).map((f) => fs.readFileSync(path.join(CODE_DIR, f), 'utf8')).join('\n');
  const named = new Set(doc.match(/\bmscTeam\w+/g) || []);
  assert.ok(named.size >= 3, [...named].join(', '));
  for (const fn of named) assert.match(code, new RegExp(`function ${fn}\\s*\\(`), `${fn} is not in the code`);
  for (const setting of doc.match(/\b(?:COLD_LIST_\w+|FOLLOWUP\w*|COPY_VERSION)\b/g) || []) {
    assert.ok(code.includes(`const ${setting} `), `${setting} is not in Config.gs`);
  }
  // the files the doc tells the team to paste
  for (const f of fs.readdirSync(CODE_DIR).filter((x) => /\.(gs|html|json)$/.test(x))) assert.ok(f.endsWith('.json') || /^[A-Z]/.test(f), f);
});
