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
// The generator lives in the content repo (msc-content), not here. Point MSC_EXPLORER_GENERATOR at it, or keep the two
// repos side by side (../msc-content); without it the parity test is skipped and the shape tests below still run.
const GENERATOR = process.env.MSC_EXPLORER_GENERATOR ||
    path.join(ROOT, '..', 'msc-content/articleship-program/v3/build/day-5/5.2/build_explorer.mjs');

function page(search, options) {
    const dom = new JSDOM('<!doctype html><html><body><div id="explorer"></div></body></html>', {
        url: `http://127.0.0.1/articleship-program/experience-explorer/${search || ''}`
    });
    const container = dom.window.document.getElementById('explorer');
    const controller = X.mount(container, DATA, Object.assign({
        location: dom.window.location, history: dom.window.history, debounceMs: 0, idle: null
    }, options || {}));
    const $ = sel => container.querySelector(sel);
    const $$ = sel => [...container.querySelectorAll(sel)];
    return { dom, window: dom.window, container, controller, $, $$ };
}

function change(win, select, value) {
    select.value = value;
    select.dispatchEvent(new win.Event('change', { bubbles: true }));
}

function type(win, input, value) {
    input.value = value;
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
}

const total = $ => Number($('#xp-count').textContent.split(' ')[0].replace(/,/g, ''));
const lineHas = (line, word) => new RegExp(`\\b${word}`, 'i').test(line);
const domainBit = slug => 1 << DATA.tagOrder.indexOf(slug);

// ---------- Data (the generator's output) ----------
test('data: version 5, every card kept, no experience length anywhere', () => {
    assert.equal(DATA.version, 5);
    assert.equal(DATA.records.length, 1787);
    assert.equal(DATA.cards, 1787);
    assert.equal(DATA.firms, 951);
    assert.equal(MODEL.firms, 951);
    assert.ok(!RAW.includes('"months"'), 'months dropped from the data');
    assert.ok(!/months at this firm|first 12 months|\b\d+\s+months?\b/i.test(RAW));
    for (const record of DATA.records) {
        assert.ok(record.firm && record.bullets.length > 0);
        assert.ok(record.domains.every(d => SLUGS.includes(d)), `unknown slug in ${record.domains}`);
        assert.equal(Object.prototype.hasOwnProperty.call(record, 'months'), false);
    }
});

test('data: every work line carries its domains, in the programme vocabulary', () => {
    assert.deepEqual(DATA.tagOrder, SLUGS);
    const all = (1 << SLUGS.length) - 1;
    let tagged = 0;
    let lines = 0;
    for (const record of DATA.records) {
        assert.equal(record.tags.length, record.bullets.length);
        for (const mask of record.tags) {
            assert.ok(Number.isInteger(mask) && mask >= 0 && (mask & ~all) === 0, `bad mask ${mask}`);
            lines++;
            if (mask) tagged++;
        }
    }
    assert.ok(tagged / lines > 0.99, `${lines - tagged} untagged lines`);
    // Spot checks: the stock lines land in their domains.
    const tagsOf = line => {
        for (const record of DATA.records) {
            const i = record.bullets.indexOf(line);
            if (i >= 0) return SLUGS.filter(slug => record.tags[i] & domainBit(slug));
        }
        return null;
    };
    assert.deepEqual(tagsOf('Prepared tax audit reports in Form 3CD.'), ['direct-tax']);
    assert.deepEqual(tagsOf('Filed GSTR-1 and GSTR-3B returns.'), ['gst']);
    assert.deepEqual(tagsOf('Carried out concurrent audits of bank branches.'), ['bank-audit']);
    assert.deepEqual(tagsOf('Built DCF valuations.'), ['valuation']);
    assert.deepEqual(tagsOf('Ran benchmarking searches for comparable companies.'), ['transfer-pricing']);
    assert.deepEqual(tagsOf('Tested internal financial controls.'), ['internal-audit']);
    assert.deepEqual(tagsOf('Checked investments and their valuation.'), ['statutory-audit']);
    assert.ok(tagsOf('Traced fund flows and bank transactions in forensic reviews.').includes('forensic'));
    assert.ok(!tagsOf('Investigated variances in analytical reviews.').includes('forensic'));
});

test('data: all 13 domains have cards, in the programme vocabulary', () => {
    const r = X.run(MODEL, { q: '', domain: '', city: '' });
    for (const slug of SLUGS) assert.ok(r.domainCounts.get(slug) > 0, `${slug} has cards`);
    assert.equal(r.domainCounts.get('gst'), 518);
    assert.equal(r.domainCounts.get('statutory-audit'), 1330);
});

test('data: domains read from the work never mislabel transfer pricing or debt work', () => {
    const tagged = slug => DATA.records.filter(record => record.domains.includes(slug));
    for (const record of tagged('consulting')) {
        assert.ok(record.bullets.some(b => (/capital project advisory|feasibility|business plans?|market research|process improvement|risk[- ]and[- ]control matri|risk-control matri|walkthroughs?/i.test(b) || /\bSOX\b|\bRCMs?\b/.test(b)) &&
            !/transfer pricing|functions-assets-risks|vouching|substantive|statutory audits?|physical stock/i.test(b)), record.bullets.join(' / '));
    }
    for (const record of tagged('ma-tax')) {
        assert.ok(record.bullets.some(b => !/transfer pricing|indirect/i.test(b) && /acquisition structure|buy-?back|restructuring|\btax due diligence|(?:merger|amalgamation|demerger)[\s\S]*\btax\b|\btax\b[\s\S]*(?:merger|amalgamation|demerger)/i.test(b)));
    }
    for (const slug of ['consulting', 'ma-tax', 'ib-er']) {
        for (const record of tagged(slug)) assert.ok(record.tags.some(mask => mask & domainBit(slug)), `${slug} card without a ${slug} line`);
    }
    const tpOperatingModel = DATA.records.find(record => record.bullets.some(b => /operating model reviews through value chain/i.test(b)));
    assert.ok(tpOperatingModel && !tpOperatingModel.domains.includes('consulting') && tpOperatingModel.domains.includes('transfer-pricing'));
});

test('data: risk advisory work counts for consulting, deal restructuring for M&A tax (no near-empty roadmap link)', () => {
    const tagsOf = line => {
        for (const record of DATA.records) {
            const i = record.bullets.indexOf(line);
            if (i >= 0) return SLUGS.filter(slug => record.tags[i] & domainBit(slug));
        }
        return null;
    };
    assert.deepEqual(tagsOf('Documented process walkthroughs.'), ['internal-audit', 'consulting']);
    assert.deepEqual(tagsOf('Prepared risk and control matrices.'), ['internal-audit', 'consulting']);
    assert.ok(tagsOf('Tested SOX controls across global entities covering financial close, revenue, payroll, fixed assets and procurement.').includes('consulting'));
    assert.ok(!tagsOf('Performed walkthroughs, vouching and substantive testing for statutory audits.').includes('consulting'), 'audit walkthroughs stay audit');
    assert.ok(tagsOf('Analysed debt financing and restructuring transactions, agreements and capital structures.').includes('ma-tax'));
    assert.ok(tagsOf('Performed buy-side and sell-side direct tax due diligence across several sectors.').includes('ma-tax'));
    assert.ok(!tagsOf('Supported indirect-tax due diligence by reviewing returns, disputes and tax exposures.').includes('ma-tax'));
    assert.ok(!tagsOf('Supported transfer pricing advisory work on business restructuring and cross-border arrangements.').includes('ma-tax'));
    const count = slug => DATA.records.filter(record => record.domains.includes(slug)).length;
    assert.ok(count('consulting') >= 150, `consulting ${count('consulting')}`);
    assert.ok(count('ma-tax') >= 5);
});

test('data: one firm, one name (look-alike pairs merged unless they are different firms)', () => {
    const key = name => name.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(?:and|co|company|llp|associates|chartered|accountants|the|india|pvt|ltd|private|limited)\b/g, ' ').replace(/\s+/g, '');
    const byKey = new Map();
    for (const firm of new Set(DATA.records.map(record => record.firm))) {
        if (!byKey.has(key(firm))) byKey.set(key(firm), []);
        byKey.get(key(firm)).push(firm);
    }
    const pairs = [...byKey].filter(([, names]) => names.length > 1).map(([k]) => k).sort();
    assert.deepEqual(pairs, ['skumargupta', 'suresh'], 'only the two kept-apart pairs (common names, different suffix)');
    const firms = new Set(DATA.records.map(record => record.firm));
    for (const gone of ['Kirtane & Pandit Co. LLP', 'Sudit K Parekh LLP', 'E.A. Patil LLP', 'S Jaykishan & Associates', 'PAMS & Associates']) {
        assert.ok(!firms.has(gone), `${gone} merged`);
    }
    assert.equal(DATA.records.filter(record => record.firm === 'Kirtane & Pandit LLP').length, 14);
});

test('data: no contact details, no client that could be named, no banned strings', () => {
    assert.ok(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(RAW));
    assert.ok(!/(?<!\d)(?:\+?91[ .-]*)?[6-9](?:[ ().-]*\d){9}(?!\d)/.test(RAW));
    assert.ok(!/ridesharing/i.test(RAW), 'the ridesharing client description is generalised');
    assert.ok(!/ca ?monk|thinking ?bridge|umbrella|NEEDS-CHECK|\bwave|drop [abc]|live week|coming soon/i.test(RAW));
});

test('data: the website copy matches a fresh generator build', { skip: !fs.existsSync(GENERATOR) && 'generator not on this machine (set MSC_EXPLORER_GENERATOR)' }, () => {
    const out = execFileSync(process.execPath, [GENERATOR, '--check'], { env: Object.assign({}, process.env, { MSC_WEBSITE: ROOT }) }).toString();
    assert.match(out, /"check": "ok"/);
});

test('prepare: refuses older data (v2 carried months, v4 had no line domains)', () => {
    assert.throws(() => X.prepare({ version: 3, records: [] }), /unavailable/);
    assert.throws(() => X.prepare({ version: 4, records: [] }), /unavailable/);
    assert.throws(() => X.prepare(null), /unavailable/);
});

test('prepare: the first page needs no search index; the index is built on demand, once', () => {
    const model = X.prepare(DATA);
    assert.equal(model.index, null);
    X.run(model, { q: '', domain: 'gst', city: '' });
    assert.equal(model.index, null, 'browsing never builds the index');
    X.run(model, { q: 'stock audit', domain: '', city: '' });
    assert.equal(model.index.done, 1787);
    const before = model.index;
    X.run(model, { q: 'gst', domain: '', city: '' });
    assert.equal(model.index, before);
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

test('run: a task search puts the cards that say it first, the phrase in one line first', () => {
    for (const q of ['stock audit', 'tax audit', 'concurrent audit', 'gst refund', 'transfer pricing']) {
        const r = X.run(MODEL, { q, domain: '', city: '' });
        const first = r.ids.slice(0, 12);
        assert.equal(first.length, 12);
        for (const id of first) {
            const lines = X.cardLines(MODEL, id, { tokens: r.tokens });
            assert.equal(lines[0].rank, 0, `${q}: ${MODEL.records[id].firm} leads with "${lines[0].text}"`);
            assert.ok(lines[0].marked.length > 0, `${q}: the matching words are marked`);
        }
        assert.ok(new Set(first.map(id => MODEL.records[id].firm)).size >= 10, `${q}: many firms on the first page`);
    }
});

test('run: short words match whole words only ("IT company" is not itr/itc/items)', () => {
    const r = X.run(MODEL, { q: 'IT company', domain: '', city: '' });
    assert.ok(r.total > 5 && r.total < 60, `${r.total} hits`);
    for (const id of r.ids) assert.ok(MODEL.records[id].bullets.some(b => /\bIT\b/.test(b)), MODEL.records[id].bullets.join(' / '));
    assert.equal(X.cardLines(MODEL, r.ids[0], { tokens: r.tokens })[0].rank, 0);
    assert.ok(X.hasToken(' gt ', 'gt') && !X.hasToken(' gtl ', 'gt') && X.hasToken(' audits ', 'audit'));
});

test('run: domain synonyms never inflate a task search (dcf, concurrent)', () => {
    const says = word => DATA.records.filter(record => record.bullets.some(b => lineHas(b, word)) ||
        record.skills.some(s => lineHas(s, word))).length;
    const dcf = X.run(MODEL, { q: 'dcf', domain: '', city: '' });
    assert.equal(dcf.total, says('dcf'));
    assert.ok(dcf.total < 92, 'not every valuation card');
    const concurrent = X.run(MODEL, { q: 'concurrent', domain: '', city: '' });
    assert.equal(concurrent.total, says('concurrent'));
    assert.ok(concurrent.total < 278, 'not every bank audit card');
    // A word that only names a domain still finds that domain's cards.
    const mergers = X.run(MODEL, { q: 'mergers acquisitions', domain: '', city: '' });
    assert.ok(mergers.total > 0 && mergers.broad);
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
    const kirtane = X.run(MODEL, { q: 'Kirtane', domain: '', city: '' });
    assert.ok(kirtane.total >= 10 && kirtane.ids.every(id => /kirtane/i.test(MODEL.records[id].firm)));
});

test('run: a domain view leads with that domain\'s work (all 13 domains, first page)', () => {
    for (const slug of SLUGS) {
        const r = X.run(MODEL, { q: '', domain: slug, city: '' });
        const first = r.ids.slice(0, 12);
        assert.equal(first.length, Math.min(12, r.total));
        for (const id of first) {
            const lines = X.cardLines(MODEL, id, { domain: slug });
            const record = MODEL.records[id];
            const index = record.bullets.indexOf(lines[0].text);
            assert.ok(record.masks[index] & MODEL.bit[slug], `${slug}: ${record.firm} leads with "${lines[0].text}"`);
        }
        // Cards with more of the domain's lines come first (counted up to 3); repeated work sits after every new card, and
        // (once there is a common-work block) cards made only of stock lines sit after the cards with work of their own.
        const distinct = new Set(r.ids.map(id => MODEL.sameWork[id])).size;
        const head = r.ids.slice(0, Math.min(60, distinct));
        const own = r.folded ? head.filter(id => !MODEL.stockOnly[id]) : head;
        const stock = r.folded ? head.filter(id => MODEL.stockOnly[id]) : [];
        assert.deepEqual(head, own.concat(stock), `${slug}: stock-only cards come last`);
        for (const part of [own, stock]) {
            const counts = part.map(id => Math.min(3, MODEL.records[id].masks.filter(m => m & MODEL.bit[slug]).length));
            for (let i = 1; i < counts.length; i++) assert.ok(counts[i] <= counts[i - 1], `${slug}: order at ${i}`);
        }
    }
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

test('run: cards with no city are counted, and included on request after the city\'s own', () => {
    const noCity = DATA.records.filter(record => !record.city).length;
    assert.ok(noCity > 700);
    const mumbai = X.run(MODEL, { q: '', domain: '', city: 'Mumbai' });
    assert.equal(mumbai.noCity, noCity);
    const both = X.run(MODEL, { q: '', domain: '', city: 'Mumbai', nocity: true });
    assert.equal(both.total, mumbai.total + noCity);
    const firstUnknown = both.ids.findIndex(id => !MODEL.records[id].city);
    assert.equal(firstUnknown, mumbai.total, 'every Mumbai card before the cards with no city');
    const gst = X.run(MODEL, { q: '', domain: 'gst', city: 'Pune' });
    assert.equal(gst.noCity, DATA.records.filter(r => !r.city && r.domains.includes('gst')).length);
});

test('run: at a glance, the most common work and the firms for the filter', () => {
    const gst = X.run(MODEL, { q: '', domain: 'gst', city: '' });
    assert.ok(gst.common.length >= 3 && gst.common.length <= 6);
    for (const item of gst.common) assert.ok(/GST|input tax credit|e-invoic|e-way/i.test(item.text), item.text);
    for (let i = 1; i < gst.common.length; i++) assert.ok(gst.common[i].n <= gst.common[i - 1].n, 'ranked');
    assert.ok(!gst.common.some(item => /%/.test(item.text)));
    assert.ok(gst.firms.length >= 5 && gst.firms[0].n >= gst.firms[1].n);
    const all = X.run(MODEL, { q: '', domain: '', city: '' });
    assert.equal(all.common[0].text, 'Prepared tax audit reports in Form 3CD.');
    // Variants of one task count once per card: "Filed quarterly TDS returns for 30 entities." is "Filed quarterly TDS returns."
    assert.equal(X.taskKey('Filed quarterly TDS returns for 30 entities.'), 'Filed quarterly TDS returns');
    assert.equal(X.run(MODEL, { q: 'stock audit', domain: '', city: '' }).common.length, 0, 'a search shows cards, not a summary');
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

test('run: "ITR", "itr filing" and "IT return" find the income tax return cards, marked', () => {
    const says = DATA.records.filter(record => record.bullets.some(b => /income[- ]tax returns?|\bITRs?\b|\bIT returns?\b/i.test(b))).length;
    for (const q of ['ITR', 'itr', 'IT return', 'IT returns']) {
        const r = X.run(MODEL, { q, domain: '', city: '' });
        assert.ok(r.total >= says * 0.9 && r.total > 300, `${q}: ${r.total} of ${says}`);
        for (const id of r.ids.slice(0, 12)) {
            const line = X.cardLines(MODEL, id, { tokens: r.tokens })[0];
            assert.equal(line.rank, 0, `${q}: ${line.text}`);
            assert.ok(line.marked.length > 0);
        }
    }
    const filing = X.run(MODEL, { q: 'itr filing', domain: '', city: '' });
    assert.ok(filing.total > 100, `itr filing: ${filing.total}`);
    const first = X.cardLines(MODEL, filing.ids[0], { tokens: filing.tokens })[0];
    assert.match(first.text, /filed .*income[- ]tax returns/i);
    assert.ok(X.run(MODEL, { q: 'gst filing', domain: '', city: '' }).total > 100, 'filing finds "Filed GSTR-1…"');
});

test('run: a firm name never outranks the work ("bank audit" is not Banka & Banka)', () => {
    const r = X.run(MODEL, { q: 'bank audit', domain: '', city: '' });
    const first = r.ids.slice(0, 12);
    assert.ok(!first.some(id => /banka/i.test(MODEL.records[id].firm)), 'Banka & Banka is not on the first page');
    for (const id of first) {
        assert.ok(MODEL.records[id].domains.includes('bank-audit'), `${MODEL.records[id].firm} is bank audit work`);
        assert.ok(X.cardLines(MODEL, id, { tokens: r.tokens })[0].rank <= 1);
    }
    // A partly typed firm name still finds the firm.
    const kirt = X.run(MODEL, { q: 'Kirt', domain: '', city: '' });
    assert.ok(kirt.total >= 14 && kirt.ids.every(id => /kirtane/i.test(MODEL.records[id].firm)));
});

test('run: a firm or city with a domain name finds that domain\'s cards ("BDO Mumbai stat audit")', () => {
    const tagged = DATA.records.filter(r => r.firm === 'BDO' && r.city === 'Mumbai' && r.domains.includes('statutory-audit')).length;
    assert.ok(tagged >= 26);
    const r = X.run(MODEL, { q: 'BDO Mumbai stat audit', domain: '', city: '' });
    assert.equal(r.total, tagged);
    assert.ok(r.ids.every(id => MODEL.records[id].firm === 'BDO' && MODEL.records[id].city === 'Mumbai'));
    const saysIt = id => MODEL.records[id].bullets.some(b => /statutory audit/i.test(b));
    const firstTagOnly = r.ids.findIndex(id => !saysIt(id));
    assert.ok(firstTagOnly > 0 && r.ids.slice(firstTagOnly).every(id => !saysIt(id)), 'the cards that say it come first');
    const lines = X.cardLines(MODEL, r.ids[firstTagOnly], { tokens: r.tokens });
    const record = MODEL.records[r.ids[firstTagOnly]];
    assert.ok(record.masks[record.bullets.indexOf(lines[0].text)] & MODEL.bit['statutory-audit'], 'a statutory audit line first');
    assert.ok(!lines.some(line => line.rank <= 2 && line.marked.length), 'no half-word marks ("statutory dues")');
    const ahmedabad = X.run(MODEL, { q: 'Ahmedabad stat audit', domain: '', city: '' });
    assert.ok(ahmedabad.total >= DATA.records.filter(rec => rec.city === 'Ahmedabad' && rec.domains.includes('statutory-audit')).length);
    assert.ok(ahmedabad.ids.every(id => MODEL.records[id].city === 'Ahmedabad' &&
        (MODEL.records[id].domains.includes('statutory-audit') || MODEL.records[id].bullets.some(b => /statutory audit/i.test(b)))));
    // A domain word alone still lists the cards that say it (the domain is one tap away).
    const forensic = X.run(MODEL, { q: 'forensic', domain: '', city: '' });
    assert.ok(forensic.ids.every(id => MODEL.records[id].bullets.some(b => /forensic/i.test(b)) || MODEL.records[id].skills.some(b => /forensic/i.test(b))));
});

test('run: a word no card says is answered by its domain, and says so', () => {
    const r = X.run(MODEL, { q: 'assurance', domain: '', city: '' });
    assert.ok(r.broad && r.total > 0);
    assert.deepEqual(r.via, ['statutory-audit']);
    const { $ } = page('?q=assurance');
    const note = $('.xp-hint .xp-note');
    assert.equal(note.textContent, 'No card says “assurance”. These are Statutory audit experiences that cover it.');
    // Every Statutory audit card answers it, so there is no "Show Statutory audit only" offer (it would change nothing).
    assert.equal(total($), r.total);
    assert.equal(r.total, X.run(MODEL, { q: '', domain: 'statutory-audit', city: '' }).total);
    assert.equal($('.xp-hint-btn[data-domain="statutory-audit"]'), null);
    const first = $('.xp-card .xp-work li');
    assert.equal(first.className, 'is-domain', 'its audit lines first');
    // A word a card label carries ("secretarial" is Company law's) lists that label's cards, ranked by its domain.
    const label = X.run(MODEL, { q: 'secretarial', domain: '', city: '' });
    assert.ok(!label.broad && label.total > 0);
    assert.deepEqual(label.labels, ['Company law']);
    assert.equal(label.focus, 'accounting');
    assert.ok(label.ids.every(id => MODEL.records[id].labels.includes('Company law')));
});

test('run: the largest firms take at most one place in three on a first page', () => {
    for (const domain of ['', 'gst', 'statutory-audit', 'direct-tax']) {
        const r = X.run(MODEL, { q: '', domain, city: '' });
        const firms = r.ids.slice(0, 12).map(id => MODEL.records[id].firm);
        assert.ok(!MODEL.bigFirms.has(firms[0]), `${domain || 'all'}: starts with ${firms[0]}`);
        assert.ok(firms.filter(firm => MODEL.bigFirms.has(firm)).length <= 4, `${domain || 'all'}: ${firms.join(', ')}`);
        assert.equal(new Set(firms).size, 12);
    }
    assert.deepEqual([...MODEL.bigFirms].sort(), ['BDO', 'Deloitte', 'EY', 'Grant Thornton', 'KPMG', 'PwC', 'RSM', 'S S Kothari Mehta & Co. LLP', 'T R Chadha & Co. LLP']);
});

// ---------- URL state ----------
test('readState: ?domain= takes slugs, labels and aliases; ?city= takes old names; ?q= is the search', () => {
    assert.deepEqual(X.readState('?domain=gst&city=mumbai&q=BDO', { model: MODEL }), { q: 'BDO', firm: '', domain: 'gst', city: 'Mumbai', nocity: false, from: 'url' });
    assert.equal(X.readState('?domain=Indirect%20tax', { model: MODEL }).domain, 'gst');
    assert.equal(X.readState('?domain=Statutory+audit', { model: MODEL }).domain, 'statutory-audit');
    assert.equal(X.readState('?domain=ib', { model: MODEL }).domain, 'ib-er');
    assert.equal(X.readState('?city=bombay', { model: MODEL }).city, 'Mumbai');
    assert.equal(X.readState('?city=gurgaon', { model: MODEL }).city, 'Delhi NCR');
    assert.equal(X.readState('?city=delhi-ncr', { model: MODEL }).city, 'Delhi NCR');
    assert.equal(X.readState('?city=Chhatrapati%20Sambhajinagar', { model: MODEL }).city, 'Chhatrapati Sambhajinagar');
    assert.equal(X.readState('?city=atlantis', { model: MODEL }).city, '', 'a city no card names is dropped');
    assert.equal(X.readState('?city=atlantis', { model: MODEL }).badCity, 'Atlantis');
    assert.equal(X.readState('?city=%3Cscript%3E', { model: MODEL }).city, '');
    assert.equal(X.readState('?city=atlantis').city, 'Atlantis', 'without the cards, a tidy name');
    assert.equal(X.readState('?city=pune&nocity=1', { model: MODEL }).nocity, true);
    assert.equal(X.readState('?nocity=1', { model: MODEL }).nocity, false, 'no city chosen, nothing to add');
    assert.deepEqual(X.readState('?domain=nonsense', { model: MODEL }), { q: '', firm: '', domain: '', city: '', nocity: false, from: null });
});

test('readState: "my domain" fills a bare open only; a deep link shows exactly what it names', () => {
    assert.deepEqual(X.readState('', { model: MODEL, myDomain: 'gst' }), { q: '', firm: '', domain: 'gst', city: '', nocity: false, from: 'mine' });
    assert.equal(X.readState('?domain=valuation', { model: MODEL, myDomain: 'gst' }).domain, 'valuation');
    assert.deepEqual(X.readState('?domain=all', { model: MODEL, myDomain: 'gst' }), { q: '', firm: '', domain: '', city: '', nocity: false, from: 'url' });
    assert.deepEqual(X.readState('?q=equity+research', { model: MODEL, myDomain: 'gst' }), { q: 'equity research', firm: '', domain: '', city: '', nocity: false, from: null });
    assert.deepEqual(X.readState('?city=pune', { model: MODEL, myDomain: 'gst' }), { q: '', firm: '', domain: '', city: 'Pune', nocity: false, from: null });
    assert.deepEqual(X.readState('?firm=bdo', { model: MODEL, myDomain: 'gst' }), { q: '', firm: 'BDO', domain: '', city: '', nocity: false, from: null }, 'a firm link is a deep link');
    assert.equal(X.readState('?q=&city=', { model: MODEL, myDomain: 'gst' }).domain, 'gst', 'empty params are a bare open');
});

test('writeSearch: short, stable and round-trips', () => {
    assert.equal(X.writeSearch({ q: '', domain: '', city: '' }), '');
    assert.equal(X.writeSearch({ q: ' BDO ', domain: 'gst', city: 'Delhi NCR' }), '?q=BDO&domain=gst&city=delhi-ncr');
    assert.equal(X.writeSearch({ q: '', domain: '', city: '' }, { myDomain: 'gst' }), '?domain=all');
    assert.equal(X.writeSearch({ q: 'BDO', domain: '', city: '' }, { myDomain: 'gst' }), '?q=BDO', 'a search link is never narrowed anyway');
    assert.equal(X.writeSearch({ q: '', domain: '', city: 'Pune', nocity: true }), '?city=pune&nocity=1');
    assert.equal(X.writeSearch({ q: '', firm: 'Kirtane & Pandit LLP', domain: '', city: '' }, { myDomain: 'gst' }), '?firm=Kirtane+%26+Pandit+LLP');
    const state = { q: 'stock audit', firm: 'Kirtane & Pandit LLP', domain: 'statutory-audit', city: 'Chhatrapati Sambhajinagar', nocity: true };
    const back = X.readState(X.writeSearch(state), { model: MODEL });
    assert.deepEqual({ q: back.q, firm: back.firm, domain: back.domain, city: back.city, nocity: back.nocity }, state);
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
        assert.equal(card.querySelector('.xp-work li').className, 'is-domain', 'a GST line first');
    }
    const text = container.textContent;
    assert.ok(!/at this firm|show all years|all years|first year|\b\d+\s+months?\b/i.test(text));
    assert.equal(container.querySelectorAll('select').length, 2, 'domain and city only');
    assert.deepEqual([...$('#xp-domain').options].map(o => o.value), ['', ...SLUGS], 'all 13 domains offered');
});

test('page: chip, select and clear keep the URL in step; a pressed chip clears its domain', () => {
    const { $, window } = page('');
    $('.xp-card .xp-tag').click();
    const chosen = window.location.search;
    assert.match(chosen, /^\?domain=[a-z-]+$/);
    change(window, $('#xp-city'), 'Pune');
    assert.match(window.location.search, /&city=pune$/);
    const pressed = $('.xp-card .xp-tag[aria-pressed="true"]');
    assert.ok(pressed);
    assert.equal(pressed.title, 'Show all domains');
    pressed.click();
    assert.equal(window.location.search, '?city=pune');
    $('.xp-clear').click();
    assert.equal(window.location.search, '');
    assert.equal($('#xp-count').textContent, '1,787 experiences');
    assert.equal($('.xp-clear').hidden, true);
});

test('page: typing searches at once, writes ?q= and marks the matching words', () => {
    const { $, $$, window } = page('');
    type(window, $('#xp-q'), 'forensic');
    assert.equal(window.location.search, '?q=forensic');
    assert.ok(total($) >= 20);
    for (const card of $$('.xp-card')) {
        const first = card.querySelector('.xp-work li');
        assert.equal(first.className, 'is-match');
        assert.match(first.querySelector('mark').textContent, /^forensic$/i);
    }
    assert.equal($('.xp-hint-btn').textContent, 'Show Forensic only · 30', 'the whole domain is one tap away');
    assert.equal($('.xp-glance').hidden, true, 'a search shows cards, not the summary');
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

test('page: "my domain" never silently narrows a search; it is offered, and comes back when the box is cleared', () => {
    const { $, window } = page('', { myDomain: 'valuation' });
    type(window, $('#xp-q'), 'Kirtane');
    assert.equal($('#xp-domain').value, '');
    assert.ok(total($) >= 10, 'every Kirtane card');
    assert.equal($('.xp-empty').hidden, true);
    assert.equal(window.location.search, '?q=Kirtane');
    type(window, $('#xp-q'), '');
    assert.equal($('#xp-domain').value, 'valuation');
    assert.match($('#xp-count').textContent, /Valuation \(your domain\)/);

    const gst = page('', { myDomain: 'gst' });
    type(gst.window, gst.$('#xp-q'), 'BDO');
    assert.equal(total(gst.$), 141);
    const offer = gst.$('.xp-hint-btn[data-keep="q"]');
    assert.ok(offer, 'Show GST only offered');
    const n = Number(offer.textContent.split('· ')[1]);
    assert.ok(n > 0 && n < 141);
    offer.click();
    assert.equal(gst.$('#xp-q').value, 'BDO', 'the search is kept');
    assert.equal(total(gst.$), n);
    assert.equal(gst.window.location.search, '?q=BDO&domain=gst');
});

test('page: a city choice says how many cards name no city, and adds them on a tap', () => {
    const { $, $$, window } = page('?domain=gst&city=mumbai');
    const button = $('.xp-nocity');
    assert.equal(button.hidden, false);
    const n = DATA.records.filter(r => !r.city && r.domains.includes('gst')).length;
    assert.equal(button.textContent, `+ ${n} with no city given`);
    button.click();
    assert.equal(window.location.search, '?domain=gst&city=mumbai&nocity=1');
    assert.equal(total($), 34 + n);
    assert.match($('#xp-count').textContent, /Mumbai \+ city not given/);
    assert.equal($('.xp-nocity').textContent, 'Mumbai only');
    $('.xp-more button').click();
    $('.xp-more button').click();
    $('.xp-more button').click();
    const unknown = $$('.xp-card .xp-city.is-unknown');
    assert.ok(unknown.length > 0 && unknown.every(node => node.textContent === 'City not given'));
    $('.xp-nocity').click();
    assert.equal(total($), 34);
    assert.equal(page('').$('.xp-nocity').hidden, true, 'no city chosen, no switch');
});

test('page: at a glance above the cards; a firm chip opens exactly that firm within the filter', () => {
    const { $, $$, window } = page('?domain=gst&city=mumbai');
    const glance = $('.xp-glance');
    assert.equal(glance.hidden, false);
    assert.equal(glance.querySelector('.xp-common .xp-glance-title').textContent, 'Most common work here');
    const items = [...glance.querySelectorAll('.xp-common-list li')];
    assert.ok(items.length >= 3 && items.length <= 6);
    assert.ok(items.every(li => !/\d+\s*%/.test(li.textContent)));
    const chips = $$('.xp-firm-chip');
    assert.ok(chips.length >= 2);
    const chip = chips[0];
    const firm = chip.dataset.firm;
    const n = Number(chip.querySelector('.xp-firm-chip-n').textContent);
    assert.equal(chip.getAttribute('href'), `/articleship-program/experience-explorer/?firm=${encodeURIComponent(firm).replace(/%20/g, '+')}&domain=gst&city=mumbai`);
    const depth = window.history.length;
    chip.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    assert.equal($('#xp-q').value, '', 'the search box stays free');
    assert.equal(total($), n, 'the chip count is what opens');
    assert.ok($$('.xp-card').every(card => card.querySelector('.xp-firm').textContent === firm), 'that firm only');
    assert.match($('#xp-count').textContent, new RegExp(` at ${firm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} · GST · Mumbai$`));
    assert.equal(window.history.length, depth + 1, 'a new history entry, so Back returns');
    // The whole programme view has a glance too; a firm with one card never gets a chip of its own list.
    assert.equal(page('').$('.xp-common-list li').textContent, 'Prepared tax audit reports in Form 3CD.');
});

test('page: a firm name opens every experience at that firm and no other; Back returns to the list', async () => {
    const { $, $$, window } = page('?domain=gst&city=mumbai');
    const link = $('.xp-card .xp-firm-link');
    const firm = link.dataset.firm;
    assert.equal(link.textContent, firm);
    assert.equal(link.getAttribute('href'), `/articleship-program/experience-explorer/?firm=${encodeURIComponent(firm).replace(/%20/g, '+')}`);
    link.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    assert.equal($('#xp-domain').value, '');
    assert.equal($('#xp-city').value, '');
    assert.equal($('#xp-q').value, '');
    assert.equal(total($), DATA.records.filter(record => record.firm === firm).length, 'every card at the firm');
    assert.ok($$('.xp-card').every(card => card.querySelector('.xp-firm').textContent === firm), 'no other firm mixed in');
    assert.equal($('.xp-allfirms').hidden, false);
    const popped = new Promise(resolve => window.addEventListener('popstate', resolve, { once: true }));
    window.history.back();
    await popped;
    assert.equal($('#xp-domain').value, 'gst');
    assert.equal($('#xp-city').value, 'Mumbai');
    assert.equal($('#xp-q').value, '');
});

test('page: ?firm= is exact: an alias or a shared word never mixes in another firm', () => {
    for (const firm of ['Chokshi & Chokshi LLP', 'S A S & Co.', 'Suresh & Co.', 'BDO', 'Kirtane & Pandit LLP']) {
        const n = DATA.records.filter(record => record.firm === firm).length;
        assert.ok(n > 0, firm);
        const r = X.run(MODEL, { q: '', firm, domain: '', city: '' });
        assert.equal(r.total, n, `${firm}: ${r.total} cards`);
        assert.ok(r.ids.every(id => MODEL.records[id].firm === firm));
        const { $, $$ } = page(`?firm=${encodeURIComponent(firm)}`);
        assert.equal(total($), n);
        assert.ok($$('.xp-card .xp-firm').every(h => h.textContent === firm));
        assert.equal($$('.xp-card .xp-firm-link').length, 0, 'no link to the page already open');
        assert.equal($('.xp-firms-here'), null, 'no "Firms here" for one firm');
    }
    assert.equal(X.resolveFirm('chokshi-and-chokshi-llp', MODEL), 'Chokshi & Chokshi LLP', 'case and punctuation forgiven');
    assert.equal(X.resolveFirm('kirtane & pandit llp', MODEL), 'Kirtane & Pandit LLP');
});

test('page: a firm view keeps the domain and city filters, "All firms" and "Clear all" leave it', () => {
    const { $, window } = page('?firm=Kirtane+%26+Pandit+LLP');
    assert.equal($('#xp-count').textContent, '14 experiences at Kirtane & Pandit LLP');
    change(window, $('#xp-domain'), 'gst');
    assert.equal(window.location.search, '?firm=Kirtane+%26+Pandit+LLP&domain=gst');
    assert.match($('#xp-count').textContent, /^\d+ experiences? at Kirtane & Pandit LLP · GST$/);
    $('.xp-allfirms').click();
    assert.equal(window.location.search, '?domain=gst');
    assert.equal($('.xp-allfirms').hidden, true);
    const again = page('?firm=Kirtane+%26+Pandit+LLP&city=pune');
    again.$('.xp-clear').click();
    assert.equal(again.window.location.search, '');
    assert.equal(total(again.$), 1787);
});

test('page: a firm no card names says so and offers a search for the name', () => {
    const { $ } = page('?firm=Kirtane');
    assert.match($('.xp-empty').textContent, /No experiences at Kirtane\./);
    const search = $('.xp-empty [data-action="firm-to-q"]');
    assert.equal(search.textContent, 'Search “Kirtane” · 14');
    search.click();
    assert.equal($('#xp-q').value, 'Kirtane');
    assert.equal(total($), 14);
});

test('page: a city no card names is dropped once, with one line; never an option', () => {
    const { $, window } = page('?city=%3Cscript%3E');
    assert.equal($('#xp-city').value, '');
    assert.ok(![...$('#xp-city').options].some(o => /script/i.test(o.textContent)), 'not offered as a city');
    assert.equal($('.xp-hint .xp-note').textContent, 'No experience names a city called “Script”, so every city is shown.');
    assert.equal(total($), 1787);
    change(window, $('#xp-domain'), 'gst');
    assert.equal($('.xp-hint .xp-note'), null, 'said once');
});

test('page: a thin domain offers the nearest domain with its count; every view ends with the way on', () => {
    const { $, $$, window } = page('?domain=ib-er');
    assert.equal(total($), 13);
    assert.equal($('.xp-related'), null, '13 is not thin');
    const thin = page('?domain=ma-tax');
    assert.equal(total(thin.$), 5);
    const offer = thin.$('.xp-related .xp-hint-btn');
    const n = DATA.records.filter(r => r.domains.includes('direct-tax')).length;
    assert.equal(thin.$('.xp-related p').textContent, 'Only 5 experiences here. The nearest domain:');
    assert.equal(offer.textContent, `Direct tax · ${n.toLocaleString('en-IN')}`);
    offer.click();
    assert.equal(thin.window.location.search, '?domain=direct-tax');
    assert.equal(total(thin.$), n);
    const ib = page('?domain=ib-er&city=mumbai');
    assert.equal(total(ib.$), 2);
    assert.match(ib.$('.xp-related .xp-hint-btn').textContent, /^Valuation · \d+$/, 'counted in the chosen city');
    // The closing row: roadmap (this domain), firms to apply to (Day 5), back to Day 5.
    const links = $$('.xp-next a').map(a => [a.textContent, a.getAttribute('href')]);
    assert.deepEqual(links, [
        ['See the IB & equity research roadmap', '/articleship-program/domain-roadmaps/#ib-er'],
        ['Find firms to apply to', '/learning-management-system/course?course=msc-articleship-program&session=6&resource=Top+100+Articleship+Firms'],
        ['Back to Day 5', '/learning-management-system/course?course=msc-articleship-program&session=6']
    ]);
    assert.equal($('.xp-next-title').textContent, 'What next?');
    assert.equal(page('').$('.xp-next a').getAttribute('href'), '/articleship-program/domain-roadmaps/');
    const visitor = page('', { signedIn: false });
    assert.deepEqual(visitor.$$('.xp-next a').slice(-1).map(a => [a.textContent, a.getAttribute('href')]), [['About the programme', '/articleship-program/']]);
    assert.equal(window.document.querySelector('.xp-next').previousElementSibling.className, 'xp-more', 'after Show more');
});

test('page: on a phone the at-a-glance block sits after the third card', () => {
    const listeners = [];
    const query = { matches: true, addEventListener: (type, fn) => listeners.push(fn), removeEventListener() {} };
    const { $, container } = page('?domain=gst', { matchMedia: () => query });
    const results = $('.xp-results');
    const kids = [...results.children];
    assert.equal(kids[3].classList.contains('xp-glance'), true, 'after three cards');
    assert.ok(kids.slice(0, 3).every(node => node.classList.contains('xp-card')));
    assert.equal(results.querySelectorAll('.xp-card').length, 12, 'still 12 cards');
    $('.xp-more button').click();
    assert.equal(results.querySelectorAll('.xp-card').length, 24);
    assert.equal(results.children[3].classList.contains('xp-glance'), true, 'kept in place after Show more');
    query.matches = false;
    listeners.forEach(fn => fn());
    assert.equal($('.xp-glance').parentNode, container, 'wider: back above the cards');
    assert.equal(page('?domain=gst').$('.xp-glance').parentNode.id, 'explorer', 'no matchMedia: above the cards');
});

test('page: "my domain" that arrives from the account later is followed by a bare page only', () => {
    const bare = page('', { myDomain: null });
    assert.equal(total(bare.$), 1787);
    bare.controller.setMyDomain('gst');
    assert.equal(bare.$('#xp-domain').value, 'gst');
    assert.equal(bare.$('#xp-count').textContent, '518 experiences · GST (your domain)');
    assert.equal(bare.window.location.search, '', 'nothing written');
    bare.controller.setMyDomain('valuation');
    assert.equal(bare.$('#xp-domain').value, 'valuation', 'follows a change while still on "my domain"');
    const linked = page('?domain=forensic', { myDomain: null });
    linked.controller.setMyDomain('gst');
    assert.equal(linked.$('#xp-domain').value, 'forensic', 'a link keeps what it names');
    const chosen = page('', { myDomain: null });
    change(chosen.window, chosen.$('#xp-domain'), 'fdd');
    chosen.controller.setMyDomain('gst');
    assert.equal(chosen.$('#xp-domain').value, 'fdd', 'the student\'s own choice stays');
});

test('start: a signed-in student\'s account loads after the first page and its "my domain" is used', async () => {
    const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    assert.ok(!/supabase/.test(fs.readFileSync(path.join(DIR, 'index.html'), 'utf8')), 'no blocking account scripts in the page');
    const dom = new JSDOM(html, { url: 'http://127.0.0.1/articleship-program/experience-explorer/' });
    const listeners = [];
    let saved = { myDomain: null };
    const store = { subscribe: fn => listeners.push(fn), pull: async () => { saved = { myDomain: 'transfer-pricing' }; listeners.forEach(fn => fn(saved)); return 'pull'; }, get: () => saved };
    const loaded = [];
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    const controller = await X.start({ document: dom.window.document, location: dom.window.location, history: dom.window.history,
        myDomain: null, signedIn: true, idle: null, settings: store, loadScripts: async (doc, sources) => { loaded.push(...sources); await gate; },
        fetch: async () => ({ ok: true, json: async () => DATA }) });
    assert.equal(dom.window.document.querySelector('#xp-domain').value, '', 'the first page does not wait for the account');
    assert.equal(dom.window.document.querySelectorAll('.xp-card').length, 12);
    release();
    await controller.account;
    assert.deepEqual(loaded, ['/scripts/supabase.js', '/scripts/supabase-init.js']);
    assert.equal(dom.window.document.querySelector('#xp-domain').value, 'transfer-pricing');
    // A visitor never loads them.
    const visitor = new JSDOM(html, { url: 'http://127.0.0.1/articleship-program/experience-explorer/' });
    const none = [];
    const v = await X.start({ document: visitor.window.document, location: visitor.window.location, history: visitor.window.history,
        myDomain: null, signedIn: false, idle: null, loadScripts: async (doc, sources) => { none.push(...sources); },
        fetch: async () => ({ ok: true, json: async () => DATA }) });
    assert.equal(v.account, undefined);
    assert.deepEqual(none, []);
});

test('page: Show more depth survives Back (kept in history.state)', () => {
    const first = page('?domain=statutory-audit');
    first.$('.xp-more button').click();
    first.$('.xp-more button').click();
    assert.equal(first.$$('.xp-card').length, 36);
    assert.equal(first.window.history.state.xp.limit, 36);
    assert.equal(first.window.history.state.xp.search, '?domain=statutory-audit');
    // A page load on the same history entry (Back from the roadmap) opens at the same depth.
    first.controller.destroy();
    const container = first.window.document.getElementById('explorer');
    X.mount(container, DATA, { location: first.window.location, history: first.window.history, debounceMs: 0, idle: null });
    assert.equal(container.querySelectorAll('.xp-card').length, 36);
    // A different search starts at the first page.
    first.window.history.replaceState({ xp: { search: '?domain=gst', limit: 48, y: 0 } }, '');
    X.mount(container, DATA, { location: first.window.location, history: first.window.history, debounceMs: 0, idle: null });
    assert.equal(container.querySelectorAll('.xp-card').length, 12);
});

test('page: an empty domain + city offers the nearest search that has cards, then the roadmap; the title is announced', () => {
    const { $, $$ } = page('?domain=ma-tax&city=pune');
    const empty = $('.xp-empty');
    assert.equal(empty.hidden, false);
    assert.match(empty.textContent, /No M&A tax experiences in Pune\./);
    const live = $('#xp-count');
    assert.equal(live.getAttribute('role'), 'status');
    assert.equal(live.closest('[hidden]'), null, 'the live region stays in the page');
    assert.equal(live.textContent, 'No M&A tax experiences in Pune.');
    assert.ok(live.classList.contains('xp-sr'));
    assert.equal($('.xp-next').hidden, true, 'the empty state carries the way on');
    const first = empty.querySelector('[data-action="clear-city"]');
    assert.equal(first.textContent, 'Show every city · 5');
    assert.equal(empty.querySelector('a').getAttribute('href'), '/articleship-program/domain-roadmaps/#ma-tax');
    first.click();
    assert.equal($('#xp-city').value, '');
    assert.equal($$('.xp-card').length, 5);
    assert.ok(!live.classList.contains('xp-sr'));
});

test('page: a search with no match says so and offers a way back', () => {
    const { $ } = page('?q=zzzzqqq');
    assert.match($('.xp-empty').textContent, /Nothing matches “zzzzqqq”\./);
    assert.equal($('#xp-count').textContent, 'Nothing matches “zzzzqqq”.');
    $('.xp-empty [data-action="clear-all"]').click();
    assert.equal($('#xp-q').value, '');
    assert.equal($('#xp-count').textContent, '1,787 experiences');
});

test('page: a search that names a domain offers that domain, with its own count', () => {
    const { $, window } = page('?q=consulting');
    const button = $('.xp-hint-btn');
    assert.ok(button, 'hint shown');
    assert.equal(button.textContent, `Show Consulting & risk advisory only · ${DATA.records.filter(r => r.domains.includes('consulting')).length}`);
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

test('page: card text is never parsed as HTML, marks included', () => {
    const data = { version: 5, tagOrder: SLUGS, records: [{ firm: '<img src=x onerror=alert(1)>', city: null, domains: ['gst'], labels: [], bullets: ['<b>x</b> gst refund'], skills: [], tags: [8] }] };
    const dom = new JSDOM('<div id="e"></div>', { url: 'http://127.0.0.1/x/?q=gst' });
    X.mount(dom.window.document.getElementById('e'), data, { location: dom.window.location, history: dom.window.history, debounceMs: 0, idle: null });
    assert.equal(dom.window.document.querySelector('img'), null);
    assert.equal(dom.window.document.querySelector('b'), null);
    assert.equal(dom.window.document.querySelector('.xp-firm').textContent, '<img src=x onerror=alert(1)>');
    assert.equal(dom.window.document.querySelector('.xp-work li').textContent, '<b>x</b> gst refund');
    assert.equal(dom.window.document.querySelector('.xp-work mark').textContent, 'gst');
});

test('page: the search index builds in idle time after the first page', () => {
    const queue = [];
    const model = X.prepare(DATA);
    const { $ } = page('', { model, idle: fn => { queue.push(fn); return queue.length; } });
    assert.equal($$count($), 12);
    assert.equal(model.index, null, 'first page painted before any indexing');
    let rounds = 0;
    while (queue.length && rounds < 500) { queue.shift()({ timeRemaining: () => 0 }); rounds++; }
    assert.equal(model.index.done, 1787);
    assert.ok(rounds > 1, 'in chunks');
});
function $$count($) { return $('.xp-results').children.length; }

test('start: loads the data, fills the intro numbers; a failed load offers Try again; the logo fits the visitor', async () => {
    const html = fs.readFileSync(path.join(DIR, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    const dom = new JSDOM(html, { url: 'http://127.0.0.1/articleship-program/experience-explorer/?city=pune' });
    const controller = await X.start({ document: dom.window.document, location: dom.window.location, history: dom.window.history, myDomain: null,
        signedIn: false, idle: null, fetch: async () => ({ ok: true, json: async () => DATA }) });
    assert.ok(controller);
    assert.equal(dom.window.document.querySelector('[data-xp="cards"]').textContent, '1,787');
    assert.equal(dom.window.document.querySelector('[data-xp="firms"]').textContent, '951');
    assert.equal(dom.window.document.querySelector('#xp-city').value, 'Pune');
    assert.equal(dom.window.document.querySelector('.ap-brand').getAttribute('href'), '/articleship-program/', 'a visitor goes to the public programme page');
    const enrolled = new JSDOM(html, { url: 'http://127.0.0.1/articleship-program/experience-explorer/' });
    await X.start({ document: enrolled.window.document, location: enrolled.window.location, history: enrolled.window.history, myDomain: null,
        signedIn: true, idle: null, fetch: async () => ({ ok: true, json: async () => DATA }) });
    assert.equal(enrolled.window.document.querySelector('.ap-brand').getAttribute('href'), '/learning-management-system/course?course=msc-articleship-program');
    const failed = new JSDOM(html, { url: 'http://127.0.0.1/articleship-program/experience-explorer/' });
    const none = await X.start({ document: failed.window.document, signedIn: false, fetch: async () => ({ ok: false }) });
    assert.equal(none, null);
    assert.match(failed.window.document.querySelector('#explorer').textContent, /did not load/);
});

test('links: the roadmap links resolve to a Domain roadmaps page committed on this branch', () => {
    const file = path.join(ROOT, X.ROADMAPS.replace(/^\//, ''), 'index.html');
    assert.ok(fs.existsSync(file), `${X.ROADMAPS} has an index.html`);
    let tracked = null;
    try {
        tracked = execFileSync('git', ['ls-files', '--error-unmatch', path.relative(ROOT, file)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch (error) {
        if (error.code === 'ENOENT' || !fs.existsSync(path.join(ROOT, '.git'))) return; // not a git checkout (a copy): the file check above is the test
        tracked = '';
    }
    assert.ok(tracked, `${path.relative(ROOT, file)} is not committed: every roadmap link would 404 on the branch`);
    assert.ok(fs.existsSync(path.join(ROOT, X.PROGRAMME_PAGE.replace(/^\//, ''), 'index.html')), 'the programme page exists');
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
    assert.match(html, /<span class="xp-lede-short">real <\/span>experiences at <span data-xp="firms">951<\/span> firms\./);
    assert.match(html, /class="ap-page ap-day-5"/);
    assert.match(html, /<span class="xp-title-long">Experience <\/span>Explorer/, 'a short title on narrow phones');
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

test('explorer.css: every color-mix() has a plain colour before it (old Android WebViews)', () => {
    const css = fs.readFileSync(path.join(DIR, 'explorer.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks = css.split('}');
    let mixes = 0;
    for (const block of blocks) {
        const declarations = block.slice(block.indexOf('{') + 1).split(';').map(d => d.trim()).filter(Boolean);
        declarations.forEach((declaration, i) => {
            if (!declaration.includes('color-mix(')) return;
            mixes++;
            const property = declaration.split(':')[0].trim();
            const fallback = declarations.slice(0, i).reverse().find(d => d.split(':')[0].trim() === property);
            assert.ok(fallback && !fallback.includes('color-mix('), `no fallback before "${declaration}"`);
        });
    }
    assert.ok(mixes >= 10);
    assert.match(css, /\.xp-roadmap \{ display: inline;/);
    assert.match(css, /\.xp-roadmap::after \{ content: '\\00a0\\2192'; \}/);
});

test('explorer.css: a tap scrolls the status clear of the sticky bar; tap targets are 44 px', () => {
    const css = fs.readFileSync(path.join(DIR, 'explorer.css'), 'utf8');
    assert.match(css, /\.xp-status, \.xp-empty \{ scroll-margin-top: 64px; \}/);
    const rule = selector => {
        const found = css.match(new RegExp(`(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`));
        assert.ok(found, selector);
        return found[1];
    };
    assert.match(rule('.xp-tag'), /min-height: 36px/);
    assert.match(rule('.xp-tag::after'), /top: -4px; bottom: -4px/, '36 + 4 + 4 = 44');
    assert.match(rule('.xp-firm-link'), /padding: 11px 0/);
    for (const selector of ['.xp-firm-chip', '.xp-nocity', '.xp-hint-btn']) assert.match(rule(selector), /min-height: 44px/, selector);
    assert.match(css, /\.xp-lede-long \{ display: none; \}/, 'a short intro on phones');
});
