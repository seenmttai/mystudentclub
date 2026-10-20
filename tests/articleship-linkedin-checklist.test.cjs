const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const L = require('../scripts/articleship-linkedin-checklist.js');
const C = require('../scripts/articleship-checklist.js');
const P = require('../scripts/articleship-progress.js');
const Lms = require('../scripts/articleship-lms.js');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'articleship-program/linkedin-checklist/index.html');
const CONTENT_FILE = path.join(ROOT, 'articleship-program/linkedin-checklist/linkedin-checklist.json');
const CONTENT = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));

function memoryStore() {
    const map = new Map();
    return P.createStore('linkedin-checklist', {
        storage: { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) },
        client: null, sessionFlags: null, debounceMs: 0, userId: () => null, defaults: { ticks: {} }
    });
}

function pageDom() {
    const html = fs.readFileSync(PAGE, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    return new JSDOM(html, { url: 'http://127.0.0.1/articleship-program/linkedin-checklist/' });
}

function okFetch(body) {
    return async url => ({ ok: true, status: 200, url, json: async () => JSON.parse(JSON.stringify(body)) });
}

/** Every string a student can see in the content. */
function studentText(content) {
    const out = [];
    const walk = value => {
        if (typeof value === 'string') out.push(value);
        else if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => { if (!['id', 'tool', 'href', 'section_id'].includes(k)) walk(v); });
    };
    walk(content);
    return out.join('\n');
}

test('content: the 12 profile checks in the row order, each with an example and a link to LinkedIn', () => {
    const prepared = L.prepare(CONTENT);
    const ids = prepared.model.items.map(i => i.id);
    assert.deepEqual(ids, ['photo', 'name', 'headline', 'custom-url', 'about', 'education', 'certifications',
        'featured', 'skills', 'open-to-work', 'contact', 'recommendation']);
    assert.equal(prepared.model.total, 12);
    prepared.model.items.forEach(item => {
        assert.ok(item.example.length > 40, item.id + ' has a good example');
        assert.ok(item.fix && /^https:\/\/www\.linkedin\.com\//.test(item.fix.href), item.id + ' opens LinkedIn');
        assert.equal(item.fix.external, true);
    });
    const byId = Object.fromEntries(prepared.model.items.map(i => [i.id, i]));
    assert.equal(byId.photo.fix.label, 'Open my profile');
    assert.equal(byId.photo.fix.href, 'https://www.linkedin.com/in/me/');
    assert.equal(byId['custom-url'].fix.href, 'https://www.linkedin.com/public-profile/settings');
    assert.equal(byId.recommendation.fix.label, 'Open my connections');
    assert.deepEqual([...prepared.copies.keys()], ['headline', 'about', 'featured', 'recommendation']);
    assert.equal(prepared.notes.length, 2);
    assert.deepEqual(prepared.model.sections.map(s => [s.title, s.items.length]), [['First look', 4], ['Your proof', 5], ['Open the door', 3]]);
});

test('content: house rules (headline formula, no CA prefix, all members, no salary, simulations not experience)', () => {
    const all = studentText(CONTENT);
    const headline = L.prepare(CONTENT).copies.get('headline').text;
    assert.equal(headline, 'CA Inter cleared ([Month Year]) | Seeking articleship in [domain] | [City] | [one proof]');
    assert.match(all, /All LinkedIn members/);
    assert.match(all, /Expected salary: leave it blank/);
    assert.match(all, /never under Experience or Internship/);
    assert.match(all, /❌ CA Ananya Iyer/);
    assert.match(all, /SEBI Investor Awareness Test \(Level 1\)/, 'the SEBI test by its exact name');
    assert.match(all, /Expiry: only if your certificate shows one/, 'the SEBI certificate has a validity, so no blanket "no expiry"');
    assert.match(all, /ICITSS completed/, 'ICITSS sits in Education (same as the CV and Guidebook ch 6)');
    assert.match(all, /AIR \[n\][^\n]*only with your rank letter/, 'ranks only with proof (house rule 1)');
    assert.match(L.prepare(CONTENT).copies.get('featured').text, /^Cleared CA Intermediate \(\[Month Year\]\)/);
    assert.doesNotMatch(all, /₹|\bstipend\b|\bsalary of\b/i, 'no money figures');
    assert.doesNotMatch(all, /\b(?:\+?91[ -]?)?[6-9]\d{9}\b/, 'no phone numbers');
    const emails = all.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || [];
    emails.forEach(e => assert.match(e, /^[a-z]+\.[a-z]+@email\.com$/, 'fictional firstname.lastname@email.com only: ' + e));
});

test('content: nothing a student must never see', () => {
    const all = studentText(CONTENT);
    assert.doesNotMatch(all, /ca ?monk|thinking ?bridge|umbrella|NEEDS-CHECK|\bwave\b|drop [abc]\b|live week|coming soon|saved on this device|\bversion\b|source:/i);
    // STYLE voice bans
    assert.doesNotMatch(all, /\b(consider|ensure|leverage|robust|seamless|comprehensive|crucial|unlock|empower|navigate|delve)\b/i);
    // Internal codes (T07, HB-08, L09 …)
    assert.doesNotMatch(all, /(^|[^A-Za-z0-9])(T|K|DK|HB|LB|FM|L|R)-?\d{2,3}([^A-Za-z0-9]|$)/);
});

test('done card links resolve to the Day 3 rows (same form as MSCArticleshipLms.resourceLink)', () => {
    const titles = JSON.parse(fs.readFileSync(path.join(ROOT, 'articleship-program/linkedin-checklist/linkedin-checklist.json'), 'utf8')).done.links;
    assert.deepEqual(titles.map(l => l.href), [Lms.resourceLink(3, 'LinkedIn search links'), Lms.resourceLink(3, 'Connection notes')]);
});

test('prepare: default "Open my profile" link, own links kept, array examples keep blank lines, unsafe open link ignored', () => {
    const prepared = L.prepare({
        open: { href: 'javascript:alert(1)' },
        items: [
            { check: 'A', example: ['one', '', 'two', '', ''] },
            { check: 'B', fix: { label: 'Mine', href: '/x/' } },
            { check: 'B', copy: ['first', 'second'], copy_label: 'Lines' },
            'C'
        ]
    });
    assert.deepEqual(prepared.open, L.DEFAULT_OPEN);
    const items = prepared.model.items;
    assert.equal(items[0].example, 'one\n\ntwo');
    assert.equal(items[0].fix.href, 'https://www.linkedin.com/in/me/');
    assert.equal(items[1].fix.href, '/x/');
    assert.equal(items[3].fix.label, 'Open my profile');
    assert.deepEqual([...prepared.copies.entries()], [['b-2', { label: 'Lines', text: 'first\nsecond' }]], 'copy pairs with the right duplicate');
    assert.equal(L.prepare({ open: { href: 'https://example.com/p', label: 'Go', hint: '' }, items: ['x'] }).open.hint, '');
    assert.equal(L.joinLines(['', 'a', '', '', '', 'b', '']), 'a\n\nb');
});

test('examples: lines, labels, ✅/❌ and "> " sample text become separate blocks (text only)', () => {
    assert.deepEqual(L.parseLine('How: your profile → Open to'), { kind: 'line', label: 'How', text: 'your profile → Open to' });
    assert.deepEqual(L.parseLine('Who can see it: All LinkedIn members.'), { kind: 'line', label: 'Who can see it', text: 'All LinkedIn members.' });
    assert.equal(L.parseLine('Your stage goes in the headline: "CA Inter cleared".').label, '', 'more than four words is not a label');
    assert.equal(L.parseLine('Only these lines show before "…see more", and most people never click it. Line 1: x').label, '');
    assert.equal(L.parseLine('✅ linkedin.com/in/ananya-iyer').kind, 'good');
    assert.equal(L.parseLine('❌ Teamwork: everyone has it').kind, 'bad');
    assert.equal(L.parseLine('   ').kind, 'gap');
    const blocks = L.exampleBlocks('> one\n> two\n\nHow: three\n❌ four\n\n> five');
    assert.deepEqual(blocks.map(b => [b.kind, b.gap, b.lines || b.text]), [
        ['sample', false, ['one', 'two']], ['line', true, 'three'], ['bad', false, '❌ four'], ['sample', true, ['five']]]);
});

test('page: boot renders the open card, 12 checks, copy boxes, notes; ticks save and repaint; done card at 12 of 12', async () => {
    const dom = pageDom();
    const doc = dom.window.document;
    const store = memoryStore();
    const result = await L.boot({ doc, fetch: okFetch(CONTENT), store, Gate: { protect: () => Promise.resolve({ state: 'allow' }) }, Checklist: C });
    assert.ok(result && result.list, 'rendered');

    const open = doc.querySelector('#lc-open a');
    assert.equal(open.textContent, 'Open my profile');
    assert.equal(open.getAttribute('href'), 'https://www.linkedin.com/in/me/');
    assert.equal(open.target, '_blank');
    assert.equal(open.rel, 'noopener noreferrer');
    assert.match(doc.querySelector('.lc-open-hint').textContent, /tap your photo/);

    assert.equal(doc.querySelectorAll('.ap-cl-item').length, 12);
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '0 of 12 done');
    assert.equal(doc.querySelectorAll('.ap-cl-example summary')[0].textContent, 'Good example');
    assert.equal(doc.querySelectorAll('.ap-cl-fix').length, 12);
    assert.equal([...doc.querySelectorAll('.ap-cl-fix')].filter(a => a.textContent === 'Open my profile').length, 10);
    assert.equal(doc.querySelectorAll('a[href^="javascript"]').length, 0);

    // examples are redrawn line by line; nothing from the content is parsed as HTML
    assert.equal(doc.querySelectorAll('.ap-cl-example > p').length, 0);
    assert.equal(doc.querySelectorAll('.ap-cl-example .lc-example').length, 12);
    const aboutSample = doc.querySelector('.ap-cl-item[data-id="about"] .lc-sample');
    assert.equal(aboutSample.querySelectorAll('p').length, 3);
    assert.match(aboutSample.textContent, /^I cleared CA Intermediate/);
    assert.equal(doc.querySelector('.ap-cl-item[data-id="open-to-work"] .lc-line strong').textContent, 'How:');
    assert.ok(doc.querySelectorAll('.lc-line.is-bad').length >= 8);
    assert.doesNotMatch(doc.getElementById('app').textContent, /(^|\n)> /);
    const copies = doc.querySelectorAll('.lc-copy');
    assert.equal(copies.length, 4);
    assert.ok(doc.querySelector('.ap-cl-item[data-id="headline"] .ap-cl-example .lc-copy'), 'copy box sits inside the example');
    assert.equal(doc.querySelector('.ap-cl-item[data-id="recommendation"] .lc-copy-label').textContent, 'Your request');
    assert.equal(doc.querySelectorAll('#lc-notes .lc-note').length, 2);
    assert.equal(doc.querySelector('#lc-notes .lc-note strong').textContent, 'Same story as your CV');
    assert.equal(doc.getElementById('lc-lede').textContent, CONTENT.intro);

    const box = doc.querySelector('.ap-cl-item[data-id="headline"] input');
    box.checked = true;
    box.dispatchEvent(new dom.window.Event('change'));
    assert.deepEqual(store.get().ticks, { headline: true });
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '1 of 12 done');

    result.list.model.items.forEach(item => result.list.tick(item.id, true));
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '12 of 12 done');
    const done = doc.querySelector('.ap-cl-done');
    assert.ok(!done.classList.contains('ap-hidden'));
    assert.equal(done.querySelector('h2').textContent, 'Your profile is ready');
    assert.deepEqual([...done.querySelectorAll('a')].map(a => a.textContent), ['LinkedIn search links', 'Connection notes']);
    assert.equal(done.querySelector('a').target, '', 'programme links stay in the tab');

    // a second visit restores the ticks
    const dom2 = pageDom();
    await L.boot({ doc: dom2.window.document, fetch: okFetch(CONTENT), store, Gate: null, Checklist: C });
    assert.equal(dom2.window.document.querySelector('.ap-progress-count').textContent, '12 of 12 done');
});

test('page: a failed content load shows "Try again" and recovers; the open link works before content arrives', async () => {
    const dom = pageDom();
    const doc = dom.window.document;
    let calls = 0;
    const flaky = async () => {
        calls += 1;
        if (calls === 1) return { ok: false, status: 503, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(CONTENT)) };
    };
    const result = await L.boot({ doc, fetch: flaky, store: memoryStore(), Gate: { protect: () => Promise.resolve({ state: 'allow' }) }, Checklist: C });
    assert.equal(result, null);
    assert.equal(doc.querySelector('#lc-open a').getAttribute('href'), 'https://www.linkedin.com/in/me/');
    const retry = doc.querySelector('.lc-error button');
    assert.equal(retry.textContent, 'Try again');
    retry.dispatchEvent(new dom.window.Event('click'));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    assert.equal(doc.querySelectorAll('.ap-cl-item').length, 12);
    assert.equal(doc.querySelector('.lc-error'), null);
});

test('copy button: copies the template and says to fill the brackets; falls back when the Clipboard API fails', async () => {
    const dom = pageDom();
    const doc = dom.window.document;
    let written = null;
    Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async t => { written = t; } }, configurable: true });
    await L.boot({ doc, fetch: okFetch(CONTENT), store: memoryStore(), Gate: null, Checklist: C });
    const btn = doc.querySelector('.ap-cl-item[data-id="recommendation"] .lc-copy-btn');
    btn.dispatchEvent(new dom.window.Event('click'));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    assert.match(written, /^Hello Sir\/Ma’am/);
    assert.equal(btn.textContent, 'Copied');
    assert.equal(doc.querySelector('.ap-cl-item[data-id="recommendation"] .lc-copy-status').textContent, 'Copied. Fill in the [brackets].');

    // Clipboard API refused → textarea + execCommand
    Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true });
    doc.execCommand = () => true;
    assert.equal(await L.copyText('x', doc), true);
    doc.execCommand = () => { throw new Error('no'); };
    assert.equal(await L.copyText('x', doc), false);
});

test('page file: gate, noindex, logo, Day 3 colour, shared engine scripts in order', () => {
    const html = fs.readFileSync(PAGE, 'utf8');
    assert.match(html, /<html lang="en" class="ap-gated">/);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, /class="ap-page ap-day-3"/);
    assert.match(html, /\/articleship-program\/shared\/msc-logo\.svg/);
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(scripts, ['/scripts/supabase.js', '/scripts/supabase-init.js', '/scripts/articleship-gate.js',
        '/scripts/articleship-progress.js', '/scripts/articleship-checklist.js', '/scripts/articleship-linkedin-checklist.js']);
    assert.equal(L.CONTENT_URL, '/articleship-program/linkedin-checklist/linkedin-checklist.json');
    assert.ok(fs.existsSync(path.join(ROOT, L.CONTENT_URL)));
});
