const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const X = require('../scripts/articleship-experience-explorer.js');
const P = require('../scripts/articleship-progress.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'articleship-program/experience-explorer');
const RAW = fs.readFileSync(path.join(DIR, 'experiences.json'), 'utf8');
const DATA = JSON.parse(RAW);
const MODEL = X.prepare(DATA);
const SLUGS = P.DOMAINS.map(d => d.slug);
const GENERATOR = '/Users/padambhansali/development/msc-content/articleship-program/v3/build/day-5/5.2/build_explorer.mjs';

function page(search, options) {
    const dom = new JSDOM('<!doctype html><html><body><div id="explorer"></div></body></html>', {
        url: `http://127.0.0.1/articleship-program/experience-explorer/${search || ''}`
    });
    const container = dom.window.document.getElementById('explorer');
    const controller = X.mount(container, DATA, Object.assign({
        location: dom.window.location, history: dom.window.history, debounceMs: 0
    }, options || {}));
    const $ = sel => container.querySelector(sel);
    const $$ = sel => [...container.querySelectorAll(sel)];
    return { dom, window: dom.window, container, controller, $, $$ };
}

function change(win, select, value) {
    select.value = value;
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
}

// ---------- Data (the generator's output) ----------
test('data: version 4, every card kept, no experience length anywhere', () => {
    assert.equal(DATA.version, 4);
    assert.equal(DATA.records.length, 1787);
    assert.equal(DATA.cards, 1787);
    assert.equal(DATA.firms, 956);
    assert.equal(MODEL.firms, 956);
    assert.ok(!RAW.includes('"months"'), 'months dropped from the data');
    assert.ok(!/months at this firm|first 12 months|\b\d+\s+months?\b/i.test(RAW));
    for (const record of DATA.records) {
        assert.ok(record.firm && record.bullets.length > 0);
        assert.ok(record.domains.every(d => SLUGS.includes(d)), `unknown slug in ${record.domains}`);
        assert.equal(Object.prototype.hasOwnProperty.call(record, 'months'), false);
    }
});

test('data: all 13 domains have cards, in the programme vocabulary', () => {
    const r = X.run(MODEL, { q: '', domain: '', city: '' });
    for (const slug of SLUGS) assert.ok(r.domainCounts.get(slug) > 0, `${slug} has cards`);
    assert.equal(r.domainCounts.get('gst'), 518);
    assert.equal(r.domainCounts.get('statutory-audit'), 1346);
});

test('data: domains read from the work never mislabel transfer pricing or debt work', () => {
    const tagged = slug => DATA.records.filter(record => record.domains.includes(slug));
    for (const record of tagged('consulting')) {
        assert.ok(record.bullets.some(b => /capital project advisory|feasibility|business plans?|market research|process improvement/i.test(b) &&
            !/transfer pricing|functions-assets-risks/i.test(b)), record.bullets.join(' / '));
    }
    for (const record of tagged('ma-tax')) {
        assert.ok(record.bullets.some(b => !/transfer pricing/i.test(b) && /acquisition structure|buy-?back|(?:merger|amalgamation|demerger|restructuring)[\s\S]*\btax\b|\btax\b[\s\S]*(?:merger|amalgamation|demerger|restructuring)/i.test(b)));
    }
    const tpOperatingModel = DATA.records.find(record => record.bullets.some(b => /operating model reviews through value chain/i.test(b)));
    assert.ok(tpOperatingModel && !tpOperatingModel.domains.includes('consulting') && tpOperatingModel.domains.includes('transfer-pricing'));
});

test('data: no contact details and no banned strings', () => {
    assert.ok(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(RAW));
    assert.ok(!/(?<!\d)(?:\+?91[ .-]*)?[6-9](?:[ ().-]*\d){9}(?!\d)/.test(RAW));
    assert.ok(!/ca ?monk|thinking ?bridge|umbrella|NEEDS-CHECK|\bwave|drop [abc]|live week|coming soon/i.test(RAW));
});

test('data: the website copy matches a fresh generator build', { skip: !fs.existsSync(GENERATOR) && 'generator not on this machine' }, () => {
    const out = execFileSync(process.execPath, [GENERATOR, '--check'], { env: Object.assign({}, process.env, { MSC_WEBSITE: ROOT }) }).toString();
    assert.match(out, /"check": "ok"/);
});

test('prepare: refuses the old v2 data (it carried months)', () => {
    assert.throws(() => X.prepare({ version: 3, records: [] }), /unavailable/);
    assert.throws(() => X.prepare(null), /unavailable/);
});

// ---------- Search ----------
test('run: no filters shows every card (no first-year default)', () => {
    const r = X.run(MODEL, { q: '', domain: '', city: '' });
    assert.equal(r.total, 1787);
    assert.equal(r.ids.length, 1787);
    assert.equal(new Set(r.ids).size, 1787, 'each card once');
});

test('run: the first page shows many firms and never the same work twice', () => {
    const r = X.run(MODEL, { q: '', domain: '', city: '' });
    const firstPage = r.ids.slice(0, 12).map(id => MODEL.records[id].firm);
    assert.equal(new Set(firstPage).size, 12);
    const work = r.ids.slice(0, 200).map(id => MODEL.sameWork[id]);
    assert.equal(new Set(work).size, 200);
});

test('run: firm aliases, cities and tasks', () => {
    const ey = X.run(MODEL, { q: 'SRBC', domain: '', city: '' });
    assert.ok(ey.total > 50);
    assert.ok(ey.ids.every(id => MODEL.records[id].firm === 'EY'));
    const bdo = X.run(MODEL, { q: 'BDO Mumbai stat audit', domain: '', city: '' });
    assert.ok(bdo.total > 0);
    assert.ok(bdo.ids.every(id => MODEL.records[id].firm === 'BDO' && MODEL.records[id].city === 'Mumbai'));
    const big4 = X.run(MODEL, { q: 'big 4', domain: '', city: '' });
    assert.deepEqual([...new Set(big4.ids.map(id => MODEL.records[id].firm))].sort(), ['Deloitte', 'EY', 'KPMG', 'PwC']);
    const gurgaon = X.run(MODEL, { q: 'gurgaon', domain: '', city: '' });
    assert.ok(gurgaon.total > 0 && gurgaon.ids.every(id => MODEL.records[id].city === 'Gurugram'));
});

test('run: Delhi NCR is one city; domain and city counts answer the other filter', () => {
    const ncr = X.run(MODEL, { q: '', domain: '', city: 'Delhi NCR' });
    const cities = new Set(ncr.ids.map(id => MODEL.records[id].city));
    assert.ok(cities.has('New Delhi') && cities.has('Gurugram') && cities.has('Noida'));
    const gst = X.run(MODEL, { q: '', domain: 'gst', city: 'Mumbai' });
    assert.ok(gst.ids.every(id => MODEL.records[id].domains.includes('gst') && MODEL.records[id].city === 'Mumbai'));
    assert.equal(gst.domainCounts.get('gst'), gst.total, 'domain counts are within the chosen city');
    assert.equal(gst.cityCounts.get('Mumbai'), gst.total, 'city counts are within the chosen domain');
});

test('detectDomain: names a domain from the search box, never from broad words', () => {
    assert.equal(X.detectDomain('consulting'), 'consulting');
    assert.equal(X.detectDomain('Equity research'), 'ib-er');
    assert.equal(X.detectDomain('indirect tax'), 'gst');
    assert.equal(X.detectDomain('M&A tax'), 'ma-tax');
    assert.equal(X.detectDomain('audit'), null);
    assert.equal(X.detectDomain('tax'), null);
    assert.equal(X.detectDomain('BDO Mumbai'), null);
});

// ---------- URL state ----------
test('readState: ?domain= takes slugs, labels and aliases; ?city= takes old names; ?q= is the search', () => {
    assert.deepEqual(X.readState('?domain=gst&city=mumbai&q=BDO', { model: MODEL }), { q: 'BDO', domain: 'gst', city: 'Mumbai', from: 'url' });
    assert.equal(X.readState('?domain=Indirect%20tax', { model: MODEL }).domain, 'gst');
    assert.equal(X.readState('?domain=Statutory+audit', { model: MODEL }).domain, 'statutory-audit');
    assert.equal(X.readState('?domain=ib', { model: MODEL }).domain, 'ib-er');
    assert.equal(X.readState('?city=bombay', { model: MODEL }).city, 'Mumbai');
    assert.equal(X.readState('?city=gurgaon', { model: MODEL }).city, 'Delhi NCR');
    assert.equal(X.readState('?city=delhi-ncr', { model: MODEL }).city, 'Delhi NCR');
    assert.equal(X.readState('?city=Chhatrapati%20Sambhajinagar', { model: MODEL }).city, 'Chhatrapati Sambhajinagar');
    assert.equal(X.readState('?city=atlantis', { model: MODEL }).city, 'Atlantis');
    assert.deepEqual(X.readState('?domain=nonsense', { model: MODEL }), { q: '', domain: '', city: '', from: null });
});

test('readState: "my domain" fills a bare open only; a deep link shows exactly what it names', () => {
    assert.deepEqual(X.readState('', { model: MODEL, myDomain: 'gst' }), { q: '', domain: 'gst', city: '', from: 'mine' });
    assert.equal(X.readState('?domain=valuation', { model: MODEL, myDomain: 'gst' }).domain, 'valuation');
    assert.deepEqual(X.readState('?domain=all', { model: MODEL, myDomain: 'gst' }), { q: '', domain: '', city: '', from: 'url' });
    assert.deepEqual(X.readState('?q=equity+research', { model: MODEL, myDomain: 'gst' }), { q: 'equity research', domain: '', city: '', from: null });
    assert.deepEqual(X.readState('?city=pune', { model: MODEL, myDomain: 'gst' }), { q: '', domain: '', city: 'Pune', from: null });
    assert.equal(X.readState('?q=&city=', { model: MODEL, myDomain: 'gst' }).domain, 'gst', 'empty params are a bare open');
});

test('writeSearch: short, stable and round-trips', () => {
    assert.equal(X.writeSearch({ q: '', domain: '', city: '' }), '');
    assert.equal(X.writeSearch({ q: ' BDO ', domain: 'gst', city: 'Delhi NCR' }), '?q=BDO&domain=gst&city=delhi-ncr');
    assert.equal(X.writeSearch({ q: '', domain: '', city: '' }, { myDomain: 'gst' }), '?domain=all');
    const state = { q: 'stock audit', domain: 'statutory-audit', city: 'Chhatrapati Sambhajinagar' };
    const back = X.readState(X.writeSearch(state), { model: MODEL });
    assert.deepEqual({ q: back.q, domain: back.domain, city: back.city }, state);
    assert.equal(X.roadmapHref('ib-er'), '/articleship-program/domain-roadmaps/#ib-er');
});

// ---------- The page ----------
test('page: deep link fills the filters, the count and the roadmap link; no year controls anywhere', () => {
    const { $, $$, container } = page('?domain=gst&city=bombay');
    assert.equal($('#xp-domain').value, 'gst');
    assert.equal($('#xp-city').value, 'Mumbai');
    assert.equal($('#xp-count').textContent, '34 experiences · GST · Mumbai');
    assert.equal($('.xp-roadmap').getAttribute('href'), '/articleship-program/domain-roadmaps/#gst');
    assert.equal($('.xp-roadmap').hidden, false);
    assert.equal($$('.xp-card').length, 12);
    for (const card of $$('.xp-card')) {
        assert.equal(card.querySelector('.xp-city').textContent, 'Mumbai');
        assert.equal(card.querySelector('.xp-tag[data-domain="gst"]').getAttribute('aria-pressed'), 'true');
    }
    const text = container.textContent;
    assert.ok(!/at this firm|show all years|all years|first year|\b\d+\s+months?\b/i.test(text));
    assert.equal(container.querySelectorAll('select').length, 2, 'domain and city only');
    assert.deepEqual([...$('#xp-domain').options].map(o => o.value), ['', ...SLUGS], 'all 13 domains offered');
});

test('page: chip, select and clear keep the URL in step', () => {
    const { $, window } = page('');
    assert.equal(window.location.search, '');
    $('.xp-card .xp-tag').click();
    const chosen = window.location.search;
    assert.match(chosen, /^\?domain=[a-z-]+$/);
    change(window, $('#xp-city'), 'Pune');
    assert.match(window.location.search, /&city=pune$/);
    $('.xp-clear').click();
    assert.equal(window.location.search, '');
    assert.equal($('#xp-count').textContent, '1,787 experiences');
    assert.equal($('.xp-clear').hidden, true);
});

test('page: typing searches at once and writes ?q=', () => {
    const { $, window } = page('');
    const input = $('#xp-q');
    input.value = 'forensic';
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
    assert.equal(window.location.search, '?q=forensic');
    assert.ok(Number($('#xp-count').textContent.split(' ')[0].replace(/,/g, '')) >= 30);
});

test('page: "my domain" is the default, labelled, and "All domains" overrides it in the URL', () => {
    const { $, window } = page('', { myDomain: 'gst' });
    assert.equal($('#xp-domain').value, 'gst');
    assert.equal($('#xp-count').textContent, '518 experiences · GST (your domain)');
    assert.equal(window.location.search, '', 'nothing written until the student changes something');
    change(window, $('#xp-domain'), '');
    assert.equal(window.location.search, '?domain=all');
    assert.equal($('#xp-count').textContent, '1,787 experiences');
});

test('page: an empty domain + city offers the nearest search that has cards, then the roadmap', () => {
    const { $, $$ } = page('?domain=consulting&city=pune');
    const empty = $('.xp-empty');
    assert.equal(empty.hidden, false);
    assert.equal($('.xp-status').hidden, true);
    assert.match(empty.textContent, /No Consulting & risk advisory experiences in Pune\./);
    const first = empty.querySelector('[data-action="clear-city"]');
    assert.equal(first.textContent, 'Show every city · 2');
    assert.equal(empty.querySelector('a').getAttribute('href'), '/articleship-program/domain-roadmaps/#consulting');
    first.click();
    assert.equal($('#xp-city').value, '');
    assert.equal($$('.xp-card').length, 2);
});

test('page: a search with no match says so and offers a way back', () => {
    const { $ } = page('?q=zzzzqqq');
    assert.match($('.xp-empty').textContent, /Nothing matches “zzzzqqq”\./);
    $('.xp-empty [data-action="clear-all"]').click();
    assert.equal($('#xp-q').value, '');
    assert.equal($('#xp-count').textContent, '1,787 experiences');
});

test('page: a search that names a domain offers that domain, with its own count', () => {
    const { $, window } = page('?q=consulting');
    const button = $('.xp-hint-btn');
    assert.ok(button, 'hint shown');
    assert.equal(button.textContent, 'Show Consulting & risk advisory only · 2');
    button.click();
    assert.equal(window.location.search, '?domain=consulting');
    assert.equal($('#xp-q').value, '');
    assert.equal($('.xp-hint').hidden, true);
});

test('page: Show more adds the next page and says how many are left', () => {
    const { $, $$ } = page('');
    assert.equal($('.xp-more button').textContent, 'Show more · 1,775 left');
    $('.xp-more button').click();
    assert.equal($$('.xp-card').length, 24);
    const { $: $2 } = page('?domain=ma-tax');
    assert.equal($2('.xp-more').hidden, true);
});

test('page: card text is never parsed as HTML', () => {
    const data = { version: 4, records: [{ firm: '<img src=x onerror=alert(1)>', city: null, domains: ['gst'], labels: [], bullets: ['<b>x</b>'], skills: [] }] };
    const dom = new JSDOM('<div id="e"></div>', { url: 'http://127.0.0.1/x/' });
    X.mount(dom.window.document.getElementById('e'), data, { location: dom.window.location, history: dom.window.history, debounceMs: 0 });
    assert.equal(dom.window.document.querySelector('img'), null);
    assert.equal(dom.window.document.querySelector('.xp-firm').textContent, '<img src=x onerror=alert(1)>');
});

test('start: loads the data, fills the intro numbers; a failed load offers Try again', async () => {
    const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    const dom = new JSDOM(html, { url: 'http://127.0.0.1/articleship-program/experience-explorer/?city=pune' });
    const controller = await X.start({ document: dom.window.document, location: dom.window.location, history: dom.window.history, myDomain: null,
        fetch: async () => ({ ok: true, json: async () => DATA }) });
    assert.ok(controller);
    assert.equal(dom.window.document.querySelector('[data-xp="cards"]').textContent, '1,787');
    assert.equal(dom.window.document.querySelector('[data-xp="firms"]').textContent, '956');
    assert.equal(dom.window.document.querySelector('#xp-city').value, 'Pune');
    const failed = new JSDOM(html, { url: 'http://127.0.0.1/articleship-program/experience-explorer/' });
    const none = await X.start({ document: failed.window.document, fetch: async () => ({ ok: false }) });
    assert.equal(none, null);
    assert.match(failed.window.document.querySelector('#explorer').textContent, /did not load/);
});

test('index.html: public and noindex (decision 10), the v3 look, the new intro line, nothing banned', () => {
    const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8');
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.ok(!html.includes('articleship-gate.js'), 'no enrolment gate on the Explorer');
    assert.match(html, /\/articleship-program\/shared\/articleship-tools\.css/);
    assert.match(html, /\/articleship-program\/shared\/msc-logo\.svg/);
    assert.match(html, /family=Caveat/);
    assert.match(html, /\/scripts\/articleship-progress\.js/);
    assert.match(html, /\/scripts\/articleship-experience-explorer\.js/);
    assert.match(html, /Real articleship work, firm by firm/);
    assert.match(html, /class="ap-page ap-day-5"/);
    const css = fs.readFileSync(path.join(DIR, 'explorer.css'), 'utf8');
    const js = fs.readFileSync(path.join(ROOT, 'scripts/articleship-experience-explorer.js'), 'utf8');
    for (const [name, text] of [['index.html', html], ['explorer.css', css]]) {
        assert.ok(!/months?|years?|first year/i.test(text), `${name} mentions experience length`);
    }
    for (const [name, text] of [['index.html', html], ['explorer.css', css], ['script', js]]) {
        assert.ok(!/ca ?monk|thinking ?bridge|umbrella|NEEDS-CHECK|\bwaves?\b|drop [abc]|live week|coming soon|saved on this device/i.test(text), `${name} has a banned string`);
    }
    assert.ok(!/show all years|first-year|period-filter|months at this firm/i.test(js), 'the year logic is gone from the source');
});
