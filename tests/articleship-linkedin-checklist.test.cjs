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

test('content: the 12 profile checks in the row order, each with an example; only the checks with their own LinkedIn page carry a link', () => {
    const prepared = L.prepare(CONTENT);
    const ids = prepared.model.items.map(i => i.id);
    assert.deepEqual(ids, ['photo', 'name', 'headline', 'custom-url', 'about', 'education', 'certifications',
        'featured', 'skills', 'open-to-work', 'contact', 'recommendation']);
    assert.equal(prepared.model.total, 12);
    prepared.model.items.forEach(item => {
        assert.ok(item.example.length > 40, item.id + ' has a good example');
        if (item.fix) {
            assert.ok(/^https:\/\/www\.linkedin\.com\//.test(item.fix.href), item.id + ' opens LinkedIn');
            assert.equal(item.fix.external, true);
        }
    });
    const byId = Object.fromEntries(prepared.model.items.map(i => [i.id, i]));
    assert.deepEqual(prepared.model.items.filter(i => i.fix).map(i => i.id), ['custom-url', 'recommendation'],
        'the profile link lives in the open card (and the phone pill), not under every check');
    assert.equal(byId['custom-url'].fix.href, 'https://www.linkedin.com/public-profile/settings');
    assert.equal(byId.recommendation.fix.label, 'My connections');
    assert.deepEqual([...prepared.copies.keys()], ['headline', 'about', 'featured', 'recommendation']);
    assert.deepEqual([...prepared.copies.values()].map(c => c.aria),
        ['Copy headline formula', 'Copy About opening lines', 'Copy result post', 'Copy recommendation request']);
    prepared.model.items.forEach(item => {
        const how = (prepared.extras.get(item.id) || {}).how || '';
        assert.ok(how.length > 10 && how.length <= 160, item.id + ' has a short How path');
    });
    assert.equal(prepared.extras.get('open-to-work').how, 'Your profile › Open to › Finding a new job.');
    assert.equal(prepared.notes.length, 1);
    assert.deepEqual(prepared.notes[0].link, { label: 'Open my CV', href: '/cv-builder/?stage=articleship' });
    assert.deepEqual(prepared.model.sections.map(s => [s.title, s.items.length]), [['First look', 4], ['Your proof', 5], ['Open the door', 3]]);
});

test('content: house rules (headline formula, no CA prefix, all members, simulations not experience, one home each)', () => {
    const all = studentText(CONTENT);
    const headline = L.prepare(CONTENT).copies.get('headline').text;
    assert.equal(headline, 'CA Inter cleared ([Month Year]) | [proof] | Seeking articleship in [domain] | [City]', 'one order: stage | proof | Seeking … | City (Guidebook ch 6, the PDF)');
    assert.match(all, /All LinkedIn members/);
    assert.doesNotMatch(all, /salary/i, 'Open to Work has no salary field to talk about (FACTS: titles, locations, start date, notice period)');
    assert.match(all, /❌ CA Ishita Sharma/);
    assert.match(all, /linkedin\.com\/in\/ishita-sharma\b/, 'one persona: a first name no competitor note uses (BUILD-BRIEF Example names)');
    assert.doesNotMatch(all, /\bRiya\b/i);
    assert.doesNotMatch(all, /Ananya|Iyer/, 'one persona across the CV and LinkedIn checklists');
    assert.match(all, /SEBI Investor Awareness Test \(Level 1\)/, 'the SEBI test by its exact name');
    assert.match(all, /Expiry: only if your certificate shows one/, 'the SEBI certificate has a validity, so no blanket "no expiry"');
    assert.match(all, /ICITSS completed/, 'ICITSS sits in Education (same as the CV and Guidebook ch 6)');
    assert.match(all, /A rank \(AIR\) only with your rank letter/, 'ranks only with proof (house rule 1)');
    assert.doesNotMatch(all, /\b20\d\d\b/, 'no years: the programme is recorded once and used by later batches');
    assert.match(all, /Job titles: Article Assistant, and Articled Assistant if the list offers it\./);
    const certs = CONTENT.items.find(i => i.id === 'certifications').example;
    assert.ok(!certs.some(line => /issuer My Student Club/.test(line)), 'MSC issues no credential, so no MSC entry under Licenses');
    assert.ok(certs.includes('The MSC Articleship Program line goes on your CV, not here.'), 'the programme line has its home on the CV');
    assert.ok(certs.includes('❌ Under Experience or Internship. A simulation is not a job.'), 'the "not under Experience" line sits in the certifications tick');
    assert.ok(!certs.some(line => /ICITSS/.test(line)), 'ICITSS lives in Education (CV, Guidebook ch 6), not under Licenses');
    const education = CONTENT.items.find(i => i.id === 'education').example.join('\n');
    assert.match(education, /ICITSS completed/);
    assert.match(CONTENT.items.find(i => i.id === 'featured').example.join('\n'), /under Projects/, 'a project with no certificate has a home');
    assert.match(L.prepare(CONTENT).copies.get('featured').text, /^Cleared CA Intermediate \(\[Month Year\]\)/);
    assert.doesNotMatch(all, /₹|\bstipend\b|\bsalary of\b/i, 'no money figures');
    assert.doesNotMatch(all, /\b(?:\+?91[ -]?)?[6-9]\d{9}\b/, 'no phone numbers');
    const emails = all.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) || [];
    emails.forEach(e => assert.match(e, /^[a-z]+\.[a-z]+@email\.com$/, 'fictional firstname.lastname@email.com only: ' + e));
});

test('content: every Work Simulation field sits under the one work_simulation key', () => {
    const rest = Object.assign({}, CONTENT);
    delete rest.work_simulation;
    const flat = JSON.stringify(rest);
    assert.doesNotMatch(flat, /Work Simulation|\{sim\||\{ws\}|\{no-ws\}|copy_ws/);
    const lifted = L.liftWorkSimulation(CONTENT);
    Object.entries(CONTENT.work_simulation.items).forEach(([id, ws]) => {
        const item = lifted.items.find(i => i.id === id);
        (ws.swap || []).forEach(s => {
            assert.ok(item.example.includes('{ws}' + s.line) && item.example.includes('{no-ws}' + s.for), id + ': swap applied');
        });
    });
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
    assert.equal(items[0].fix, null, 'no default profile link on a check');
    assert.equal(items[1].fix.href, '/x/');
    assert.equal(items[3].fix, null);
    assert.deepEqual([...prepared.copies.entries()], [['b-2', { label: 'Lines', text: 'first\nsecond', wsText: '', aria: 'Copy lines' }]], 'copy pairs with the right duplicate');
    assert.equal(L.prepare({ open: { href: 'https://example.com/p', label: 'Go', hint: '' }, items: ['x'] }).open.hint, '');
    assert.equal(L.joinLines(['', 'a', '', '', '', 'b', '']), 'a\n\nb');
});

test('also: a second link on one check (for the Work Simulation work sample once that page exists); unsafe ones dropped', async () => {
    const content = JSON.parse(JSON.stringify(CONTENT));
    const featured = content.items.find(i => i.id === 'featured');
    featured.also = { label: 'My work sample', href: '/articleship-program/work-simulation/' };
    delete content.work_simulation.items.featured.also; // a plain item link, shown in every release
    content.items.find(i => i.id === 'skills').also = { label: 'Bad', href: 'javascript:alert(1)' };
    const dom = pageDom();
    const doc = dom.window.document;
    await L.boot({ doc, fetch: okFetch(content), store: memoryStore(), Gate: null, Checklist: C });
    const also = doc.querySelectorAll('.lc-also');
    const featuredAlso = doc.querySelector('.ap-cl-item[data-id="featured"] .ap-cl-extra .lc-also');
    assert.equal(featuredAlso.getAttribute('href'), '/articleship-program/work-simulation/');
    assert.equal(featuredAlso.target, '');
    assert.equal(doc.querySelector('.ap-cl-item[data-id="skills"] .lc-also'), null, 'unsafe link dropped');
    assert.equal(also.length, 4, 'featured + the three CV checklist links (custom URL, certifications, Open to Work)');
    assert.equal(doc.querySelector('.ap-cl-item[data-id="custom-url"] .lc-also').getAttribute('href'), '/articleship-program/cv-checklist/');
    assert.equal(doc.querySelector('.ap-cl-item[data-id="certifications"] .lc-also').getAttribute('href'), '/articleship-program/cv-checklist/');

    // As shipped: the featured Work Simulation link is release 2 only (ws: true).
    const shipped = CONTENT.work_simulation.items.featured.also;
    assert.equal(CONTENT.items.find(i => i.id === 'featured').also, undefined, 'the link lives under work_simulation');
    assert.equal(L.liftWorkSimulation(CONTENT).items.find(i => i.id === 'featured').also.ws, true);
    const dom1 = pageDom();
    await L.boot({ doc: dom1.window.document, fetch: okFetch(CONTENT), store: memoryStore(), Gate: null, Checklist: C, workSimulationLive: false });
    assert.equal(dom1.window.document.querySelector('.ap-cl-item[data-id="featured"] .lc-also'), null, 'release 1: no Work Simulation link');
    const dom2 = pageDom();
    await L.boot({ doc: dom2.window.document, fetch: okFetch(CONTENT), store: memoryStore(), Gate: null, Checklist: C, workSimulationLive: true });
    assert.equal(dom2.window.document.querySelector('.ap-cl-item[data-id="featured"] .lc-also').getAttribute('href'), shipped.href);
});

test('release 1: no Work Simulation word anywhere on the page; release 2 shows the hidden lines', async () => {
    const dom = pageDom();
    const doc = dom.window.document;
    await L.boot({ doc, fetch: okFetch(CONTENT), store: memoryStore(), Gate: null, Checklist: C, workSimulationLive: false });
    assert.doesNotMatch(doc.body.textContent, /Work Simulation/);
    assert.match(doc.querySelector('.ap-cl-item[data-id="about"] .lc-sample').textContent, /PwC US Audit Job Simulation \(Forage\)/);
    assert.doesNotMatch(doc.body.textContent, /\{(ws|no-ws|proof|sim)/);
    const live = pageDom();
    await L.boot({ doc: live.window.document, fetch: okFetch(CONTENT), store: memoryStore(), Gate: null, Checklist: C, workSimulationLive: true });
    assert.match(live.window.document.body.textContent, /Statutory Audit Work Simulation/);
    assert.doesNotMatch(live.window.document.body.textContent, /PwC US Audit Job Simulation \(Forage\) \|/, 'release 2 drops the no-ws headline');
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
    assert.deepEqual([...doc.querySelectorAll('.lc-open-hint')].map(p => p.textContent.split(' ')[0]), ['Keep', 'Open', 'Before'], 'three short hint lines, the app fallback right under the button');
    assert.match(doc.querySelectorAll('.lc-open-hint')[1].textContent, /tap your photo/);

    assert.equal(doc.querySelectorAll('.ap-cl-item').length, 12);
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '0 of 12 done');
    assert.equal(doc.querySelectorAll('.ap-cl-example summary')[0].textContent, 'Examples');
    assert.deepEqual([...doc.querySelectorAll('.ap-cl-example summary')].map(x => x.textContent).filter(t => t !== 'Examples'),
        ['Formula', 'Template', 'Result post', 'Request'], 'one-word fold-out names: the toggle and "Open my profile" share a row at 390 px');
    assert.doesNotMatch([...doc.querySelectorAll('.ap-cl-example summary')].map(x => x.textContent).join('|'), /\+/, 'no "+" in a toggle that already ends in +');
    assert.equal(doc.querySelectorAll('.ap-cl-fix:not(.lc-also)').length, 2, 'only "Edit my URL" and "My connections": the profile link is not repeated');
    assert.equal(doc.querySelectorAll('.ap-cl-fix.lc-fix-profile').length, 0);
    const fabs = doc.querySelectorAll('a.lc-fab');
    assert.equal(fabs.length, 1, 'one floating "Open my profile" pill for phones');
    assert.equal(fabs[0].getAttribute('href'), 'https://www.linkedin.com/in/me/');
    assert.equal(fabs[0].target, '_blank');

    // the How path is visible under every check, outside the fold-out
    const hows = doc.querySelectorAll('.ap-cl-item > .lc-how');
    assert.equal(hows.length, 12);
    assert.equal(doc.querySelector('.ap-cl-item[data-id="open-to-work"] .lc-how').textContent, 'How: Your profile › Open to › Finding a new job.');
    assert.equal(doc.querySelector('.ap-cl-item[data-id="open-to-work"] .lc-how').previousElementSibling.className, 'ap-cl-check');
    assert.equal(doc.querySelectorAll('a[href^="javascript"]').length, 0);

    // examples are redrawn line by line; nothing from the content is parsed as HTML
    assert.equal(doc.querySelectorAll('.ap-cl-example > p').length, 0);
    assert.equal(doc.querySelectorAll('.ap-cl-example .lc-example').length, 12);
    const aboutSample = doc.querySelector('.ap-cl-item[data-id="about"] .lc-sample');
    assert.equal(aboutSample.querySelectorAll('p').length, 3, 'About: the first three lines');
    assert.match(aboutSample.textContent, /^I cleared CA Intermediate/);
    assert.equal(doc.querySelector('.ap-cl-item[data-id="open-to-work"] .lc-line strong').textContent, 'Job titles:');
    assert.ok(doc.querySelectorAll('.lc-line.is-bad').length >= 8);
    assert.doesNotMatch(doc.getElementById('app').textContent, /(^|\n)> /);
    assert.doesNotMatch(doc.body.textContent, /\{domain/, 'domain tokens are always filled');
    const copies = doc.querySelectorAll('.lc-copy');
    assert.equal(copies.length, 4);
    ['headline', 'about', 'featured', 'recommendation'].forEach(id => {
        const details = doc.querySelector('.ap-cl-item[data-id="' + id + '"] .ap-cl-example');
        assert.equal(details.children[0].tagName, 'SUMMARY');
        assert.ok(details.children[1].classList.contains('lc-copy'), id + ': the Copy box is the first thing in the fold-out');
    });
    assert.deepEqual([...doc.querySelectorAll('.lc-copy-btn')].map(b => b.getAttribute('aria-label')),
        ['Copy headline formula', 'Copy About opening lines', 'Copy result post', 'Copy recommendation request']);
    assert.equal(doc.querySelector('.ap-cl-item[data-id="headline"] .lc-copy-text').textContent,
        'CA Inter cleared ([Month Year]) | [proof] | Seeking articleship in [domain] | [City]', 'no domain set: the placeholder stays');
    assert.match(doc.querySelector('.ap-cl-item[data-id="headline"] .lc-line.is-good').textContent, /Seeking articleship in statutory audit \| Pune/);
    assert.equal(doc.querySelector('.ap-cl-item[data-id="recommendation"] .lc-copy-label').textContent, 'Your request');
    assert.equal(doc.querySelectorAll('#lc-notes .lc-note').length, 1);
    assert.equal(doc.querySelector('#lc-notes .lc-note strong').textContent, 'Same story as your CV');
    const cvLink = doc.querySelector('#lc-notes .lc-note .lc-note-link');
    assert.equal(cvLink.getAttribute('href'), '/cv-builder/?stage=articleship');
    assert.equal(cvLink.target, '', 'the CV Builder opens in the same tab');
    assert.equal(doc.querySelectorAll('#lc-notes .lc-note-link').length, 1);
    assert.equal(doc.querySelector('#lc-lede .lc-on-wide').textContent, CONTENT.intro);
    assert.equal(doc.querySelector('#lc-lede .lc-on-phone').textContent, CONTENT.intro_phone);
    assert.doesNotMatch(CONTENT.intro_phone, /next to this page/, 'a phone cannot put the profile next to the page');

    // the number is a visual cue: each checkbox is named by its check alone
    const numbers = doc.querySelectorAll('.ap-cl-item .ap-cl-no');
    assert.equal(numbers.length, 12);
    numbers.forEach(no => assert.equal(no.getAttribute('aria-hidden'), 'true'));

    const box = doc.querySelector('.ap-cl-item[data-id="headline"] input');
    box.checked = true;
    box.dispatchEvent(new dom.window.Event('change'));
    assert.deepEqual(store.get().ticks, { headline: true });
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '1 of 12 done');

    result.list.model.items.forEach(item => result.list.tick(item.id, true));
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '12 of 12 done');
    const done = doc.querySelector('.ap-cl-done');
    assert.ok(!done.classList.contains('ap-hidden'));
    assert.equal(done.querySelector('h2').textContent, CONTENT.done.title);
    assert.deepEqual([...done.querySelectorAll('a')].map(a => a.textContent), ['LinkedIn search links', 'Connection notes']);
    assert.equal(done.querySelector('a').target, '', 'programme links stay in the tab');

    // unticking one check hides the done card again
    result.list.tick('photo', false);
    assert.equal(doc.querySelector('.ap-progress-count').textContent, '11 of 12 done');
    assert.ok(done.classList.contains('ap-hidden'), 'done card hides after an untick');
    assert.equal(store.get().ticks.photo, undefined);
    result.list.tick('photo', true);
    assert.ok(!done.classList.contains('ap-hidden'));

    // a second visit restores the ticks
    const dom2 = pageDom();
    await L.boot({ doc: dom2.window.document, fetch: okFetch(CONTENT), store, Gate: null, Checklist: C });
    assert.equal(dom2.window.document.querySelector('.ap-progress-count').textContent, '12 of 12 done');
});

test('domain: the shared "my domain" fills the Copy boxes and the examples, and refills when it changes', async () => {
    assert.equal(L.domainPhrase('statutory-audit'), 'statutory audit');
    assert.equal(L.domainPhrase('gst'), 'GST');
    assert.equal(L.domainPhrase(null), '');
    assert.equal(L.domainPhrase('new-domain', () => 'Climate audit'), 'climate audit', 'unknown slugs fall back to the label, lower-cased');
    assert.equal(L.domainPhrase('new-domain', () => 'ESG reporting'), 'ESG reporting', 'acronyms keep their capitals');
    P.DOMAINS.forEach(d => assert.ok(L.DOMAIN_PHRASE[d.slug], 'phrase for ' + d.slug));
    assert.equal(L.fillDomain('in {domain|statutory audit} | [domain]', ''), 'in statutory audit | [domain]');
    assert.equal(L.fillDomain('in {domain|statutory audit} | [domain]', 'GST'), 'in GST | GST');
    assert.equal(L.fillDomain('in {domain}', ''), 'in [domain]');

    const dom = pageDom();
    const doc = dom.window.document;
    let domain = 'gst';
    const listeners = [];
    const Progress = {
        getMyDomain: () => domain,
        domainLabel: P.domainLabel,
        onSettingsChange: fn => { listeners.push(fn); return () => {}; }
    };
    let written = null;
    Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async t => { written = t; } }, configurable: true });
    const page = await L.boot({ doc, fetch: okFetch(CONTENT), store: memoryStore(), Gate: null, Checklist: C, Progress, workSimulationLive: true });
    const headlineCopy = () => doc.querySelector('.ap-cl-item[data-id="headline"] .lc-copy-text').textContent;
    const pick = () => doc.querySelector('.ap-cl-item[data-id="headline"] .lc-line.is-good').textContent;
    assert.equal(headlineCopy(), 'CA Inter cleared ([Month Year]) | GST Work Simulation | Seeking articleship in GST | [City]');
    assert.match(pick(), /Seeking articleship in GST \| Pune/);
    assert.match(doc.querySelector('.ap-cl-item[data-id="about"] .lc-copy-text').textContent, /looking for articleship in GST in \[City\]/);
    assert.match(doc.querySelector('.ap-cl-item[data-id="featured"] .lc-copy-text').textContent, /Next: articleship in GST in \[City\]\.$/);
    assert.match(doc.querySelector('.ap-cl-item[data-id="recommendation"] .lc-copy-text').textContent, /applying for articleship in GST\./);
    const aboutSample = () => doc.querySelector('.ap-cl-item[data-id="about"] .lc-sample').textContent;
    assert.match(aboutSample(), /articleship in GST in Pune/, 'the worked About example follows my domain');
    assert.match(aboutSample(), /In my GST Work Simulation I prepared GSTR-1 and GSTR-3B workings/, 'with that domain\'s own proof');
    assert.doesNotMatch(aboutSample(), /statutory audit|Statutory Audit|vouched/i, 'one domain on the card');

    // Copy takes the filled text, and still asks for the other brackets
    const btn = doc.querySelector('.ap-cl-item[data-id="headline"] .lc-copy-btn');
    btn.dispatchEvent(new dom.window.Event('click'));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    assert.equal(written, 'CA Inter cleared ([Month Year]) | GST Work Simulation | Seeking articleship in GST | [City]');
    assert.equal(doc.querySelector('.ap-cl-item[data-id="headline"] .lc-copy-status').textContent, 'Copied. Fill in the [brackets].');

    // set elsewhere (CV Recommender, roadmaps…) → refilled in place
    domain = 'direct-tax';
    assert.equal(listeners.length, 1);
    listeners[0]({});
    assert.equal(headlineCopy(), 'CA Inter cleared ([Month Year]) | Direct Tax Work Simulation | Seeking articleship in direct tax | [City]');
    assert.match(pick(), /Seeking articleship in direct tax \| Pune/);
    assert.match(aboutSample(), /articleship in direct tax in Pune\.\s*In my Direct Tax Work Simulation I checked/);
    assert.doesNotMatch(aboutSample(), /GST|statutory audit/i);
    domain = 'new-domain'; // no name anywhere: every token shows its default, the About example included
    listeners[0]({});
    assert.match(aboutSample(), /statutory audit in Pune\.\s*In my Statutory Audit Work Simulation I vouched/);
    domain = null;
    listeners[0]({});
    assert.match(headlineCopy(), /Seeking articleship in \[domain\]/);
    assert.match(pick(), /Seeking articleship in statutory audit \| Pune/);
    assert.match(aboutSample(), /statutory audit in Pune\.\s*In my Statutory Audit Work Simulation I vouched 20 purchase bills/, 'no domain: the statutory audit example');
    assert.ok(page && page.list);

    // release 1: the same domain fill, with the job-simulation line every student can earn today
    const r1 = pageDom();
    await L.boot({ doc: r1.window.document, fetch: okFetch(CONTENT), store: memoryStore(), Gate: null, Checklist: C,
        Progress: { getMyDomain: () => 'gst', domainLabel: P.domainLabel }, workSimulationLive: false });
    assert.equal(r1.window.document.querySelector('.ap-cl-item[data-id="headline"] .lc-copy-text').textContent,
        'CA Inter cleared ([Month Year]) | [proof] | Seeking articleship in GST | [City]');
    assert.match(r1.window.document.querySelector('.ap-cl-item[data-id="about"] .lc-sample').textContent,
        /articleship in GST in Pune\.\s*In the PwC US Audit Job Simulation \(Forage\)/);

    // a settings store that throws (storage blocked) leaves the placeholders
    const dom2 = pageDom();
    await L.boot({ doc: dom2.window.document, fetch: okFetch(CONTENT), store: memoryStore(), Gate: null, Checklist: C,
        Progress: { getMyDomain: () => { throw new Error('blocked'); } } });
    assert.match(dom2.window.document.querySelector('.ap-cl-item[data-id="headline"] .lc-copy-text').textContent, /\[domain\]/);
});

test('sync: the page store merges two devices per tick, so a later untick on one device is not undone by the other', async () => {
    let opened = null;
    const Progress = { open: (tool, options) => { opened = { tool, options }; return memoryStore(); } };
    const dom = pageDom();
    await L.boot({ doc: dom.window.document, fetch: okFetch(CONTENT), Gate: null, Checklist: C, Progress });
    assert.equal(opened.tool, 'linkedin-checklist');
    assert.deepEqual(opened.options.defaults, { ticks: {} });
    assert.equal(opened.options.merge, C.mergeTicks);
    const phone = { ticks: { photo: true, name: true }, at: { photo: 100, name: 100 } };
    const laptop = { ticks: { photo: true }, at: { photo: 100, name: 200 } }; // "name" unticked later on the laptop
    assert.deepEqual(C.mergeTicks(phone, laptop).ticks, { photo: true });
    assert.deepEqual(C.mergeTicks(laptop, phone).ticks, { photo: true });
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
    assert.match(written, /^\[Name\] Sir,\n/);
    assert.equal(btn.textContent, 'Copied');
    assert.equal(doc.querySelector('.ap-cl-item[data-id="recommendation"] .lc-copy-status').textContent, 'Copied. Fill in the [brackets].');

    // Clipboard API refused → textarea + execCommand
    Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true });
    doc.execCommand = () => true;
    assert.equal(await L.copyText('x', doc), true);
    doc.execCommand = () => { throw new Error('no'); };
    assert.equal(await L.copyText('x', doc), false);

    // both refused → the text is selected on the page, so press-and-hold → Copy is one step
    const headlineBtn = doc.querySelector('.ap-cl-item[data-id="headline"] .lc-copy-btn');
    headlineBtn.dispatchEvent(new dom.window.Event('click'));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    assert.equal(headlineBtn.textContent, 'Copy');
    assert.equal(doc.querySelector('.ap-cl-item[data-id="headline"] .lc-copy-status').textContent, 'It’s selected: press and hold it, then tap Copy.');
    assert.equal(dom.window.getSelection().toString(), doc.querySelector('.ap-cl-item[data-id="headline"] .lc-copy-text').textContent);
});

test('proofs: every domain has its own About line, matching its Work Simulation line in the CV Recommender', () => {
    const prepared = L.prepare(CONTENT);
    P.DOMAINS.forEach(d => {
        const line = prepared.proofs[d.slug];
        assert.ok(line, 'proof for ' + d.slug);
        assert.ok(line.startsWith('In my ' + L.SIM_NAME[d.slug] + ' Work Simulation I '), d.slug + ': ' + line);
        assert.ok(line.endsWith('.'));
    });
    assert.deepEqual(Object.keys(prepared.proofs).sort(), P.DOMAINS.map(d => d.slug).sort(), 'no proof for a domain that does not exist');
    assert.equal(L.proofFor(null, prepared.proofs), prepared.proofs[L.DEFAULT_DOMAIN]);
    assert.equal(L.proofFor('new-domain', prepared.proofs, () => 'Climate audit'), 'In my Climate audit Work Simulation I [one task you did, in your CV’s words; a number if it has one].');
    assert.equal(L.fillDomain('> {proof}', {}), '> [One thing you have actually done, in your CV’s words; a number if it has one.]');

    // The CV Recommender writes each domain's Work Simulation line for the CV; the About line says the same work, with
    // the same [count] placeholder (a fixed count would be the student's claim before they have done the level).
    const situations = path.join(ROOT, 'articleship-program/cv-recommender/situations.json');
    if (!fs.existsSync(situations)) return;
    const cvLines = JSON.parse(fs.readFileSync(situations, 'utf8')).workSimulation || {};
    P.DOMAINS.forEach(d => {
        const cv = cvLines[d.slug];
        if (!cv) return;
        const m = /^(.+) Work Simulation, MSC Articleship Program \| \[Month Year\]: (.+)$/.exec(cv);
        assert.ok(m, 'CV line shape for ' + d.slug);
        assert.equal(m[1], L.SIM_NAME[d.slug], 'SIM_NAME matches the CV line for ' + d.slug);
        const task = m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\[count\\\]/g, '(?:\\[count\\]|\\d+)').replace(/'/g, '[\'’]')
            .replace(/accounts/g, 'accounts?'); // a level may have one account
        assert.match(prepared.proofs[d.slug], new RegExp('Work Simulation I ' + task + '\\.$'), 'same work as the CV line: ' + d.slug);
    });
});

// The checklist is the profile's one home (V3-STRUCTURE §1.4: Guidebook ch 6 keeps one line and a pointer here), so a
// fold-out carries the full guidance; the cap only stops one check growing into a chapter.
test('content: fold-out length (no check over 320 words)', () => {
    const words = value => value.split(/\s+/).filter(w => w && !/^[✅❌>←|·→—›]$/.test(w)).length;
    [false, true].forEach(workSimulationLive => {
        const prepared = L.prepare(CONTENT, { workSimulationLive });
        prepared.model.items.forEach(item => {
            P.DOMAINS.forEach(d => {
                const lines = L.fillDomain(item.example, L.domainFill(d.slug, null, prepared.proofs));
                assert.ok(words(lines) <= 320, item.id + ' (' + d.slug + '): ' + words(lines) + ' words');
            });
        });
    });
});

test('page CSS: repeats hidden beside the sidebar, solid top bar, phone and laptop ledes, no bleed around the progress card', () => {
    const css = fs.readFileSync(path.join(ROOT, 'articleship-program/linkedin-checklist/linkedin-checklist.css'), 'utf8');
    const wide = css.slice(css.indexOf('@media (min-width: 960px)'));
    assert.match(wide, /\.lc-fab, \.lc-fab\.is-shown \{ display: none; \}/, 'no floating pill beside the sidebar button');
    assert.match(css, /\.lc-fab\.is-shown \{ display: inline-flex; \}/);
    assert.match(wide, /\.lc-on-phone \{ display: none; \}/);
    assert.match(css, /\.lc-on-wide \{ display: none; \}/);
    assert.match(css, /body\.ap-page \.ap-topbar \{ background: var\(--ap-panel\); \}/);
    assert.match(css, /\.lc-list \.ap-progress::before \{/);
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
