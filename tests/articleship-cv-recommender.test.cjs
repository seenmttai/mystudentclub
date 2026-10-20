const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const R = require('../scripts/articleship-cv-recommender.js');
const P = require('../scripts/articleship-progress.js');

const TOOL_DIR = path.join(__dirname, '../articleship-program/cv-recommender');
const SITUATIONS = JSON.parse(fs.readFileSync(path.join(TOOL_DIR, 'situations.json'), 'utf8'));
const DESIGNS = JSON.parse(fs.readFileSync(path.join(TOOL_DIR, 'designs.json'), 'utf8'));

function data(designs) {
    return Object.assign(JSON.parse(JSON.stringify(SITUATIONS)), { designs: designs === undefined ? DESIGNS : designs });
}

// A complete set of answers; each test changes only what it is about.
function answers(over) {
    return Object.assign({
        rank: ['academics', 'work', 'projects', 'roles', 'skills'],
        inter: 'first',
        gap: 'none',
        graduation: 'completed',
        icitss: 'done',
        work: ['none'],
        projects: ['none'],
        course: 'none',
        domain: 'statutory-audit'
    }, over || {});
}

function memoryStorage() {
    const map = new Map();
    return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}

function memoryStore(tool, defaults, storage) {
    return P.createStore(tool, { storage: storage || memoryStorage(), client: null, sessionFlags: null, debounceMs: 0, userId: () => null, defaults });
}

function fakeProgress() {
    const settings = memoryStore('settings', { myDomain: null, backupDomain: null, cvPick: null });
    return {
        settings,
        getMyDomain: () => P.getMyDomain(settings),
        setMyDomain: (v, extra) => P.setMyDomain(v, extra, settings),
        setCvPick: pick => P.setCvPick(pick, settings),
        getCvPick: () => P.getCvPick(settings)
    };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---------- Data ----------

test('situations.json: A-H, every order uses known sections, header + objective + education first, pages set', () => {
    assert.deepEqual(Object.keys(SITUATIONS.situations).sort(), R.SITUATION_CODES.slice());
    assert.deepEqual(R.SITUATION_CODES.slice(), P.SITUATIONS.slice(), 'same letters as the shared CV pick');
    for (const [code, s] of Object.entries(SITUATIONS.situations)) {
        assert.ok(s.name && s.reason && s.useIf && s.rule, code + ' has name, reason, useIf, rule');
        assert.deepEqual(s.order.slice(0, 3), ['header', 'summary', 'education'], code);
        s.order.forEach(id => assert.ok(SITUATIONS.sections[id], code + ': unknown section ' + id));
        assert.equal(new Set(s.order).size, s.order.length, code + ' has no repeated block');
        assert.ok(Number.isInteger(s.page) && s.page >= 1, code + ' page');
        (s.insertAfter || []).forEach(id => assert.ok(SITUATIONS.sections[id], code + ' insertAfter ' + id));
    }
    assert.deepEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(c => SITUATIONS.situations[c].page), [3, 4, 5, 6, 7, 8, 9]);
    assert.equal(SITUATIONS.situations.H.resource, 'nothing');
    assert.equal(SITUATIONS.resources.choose, 'Choose your CV');
    assert.equal(SITUATIONS.resources.nothing, 'The Nothing CV');
    assert.equal(SITUATIONS.resources.templates, 'CV templates');
});

test('questions: nine taps, labels short, the 13 domains plus "Not sure yet", no city tap', () => {
    assert.equal(R.QUESTIONS.length, 9);
    assert.deepEqual(R.QUESTIONS.map(q => q.id), ['rank', 'inter', 'gap', 'graduation', 'icitss', 'work', 'projects', 'course', 'domain']);
    assert.ok(!R.QUESTIONS.some(q => /city/i.test(q.id + q.title)));
    const domain = R.QUESTIONS.find(q => q.id === 'domain');
    assert.deepEqual(domain.options.map(o => o.id), P.DOMAINS.map(d => d.slug).concat('unsure'));
    R.QUESTIONS.forEach(q => (q.options || []).forEach(o => assert.ok(o.label.split(/\s+/).length <= 5, 'short label: ' + o.label)));
    assert.deepEqual(R.STRENGTHS.map(s => s.id), ['academics', 'work', 'projects', 'roles', 'skills']);
});

test('every variant the rules can produce has its copy in situations.json', () => {
    const combos = [];
    ['first', 'later', 'separate', 'one-awaited', 'both-awaited'].forEach(inter =>
        ['none', 'after-foundation', 'missed-sitting'].forEach(gap =>
            ['regular', 'distance', 'completed', 'direct-entry', 'stopped', 'none'].forEach(graduation =>
                ['done', 'ongoing', 'pending'].forEach(icitss =>
                    ['none', 'cs', 'cma', 'cfa', 'degree'].forEach(course => combos.push({ inter, gap, graduation, icitss, course }))))));
    const seen = new Set();
    combos.forEach(c => R.variantIdsFor(answers(c)).forEach(id => seen.add(id)));
    seen.forEach(id => assert.ok(SITUATIONS.variants[id], 'copy for ' + id));
    assert.deepEqual([...seen].sort(), Object.keys(SITUATIONS.variants).sort(), 'no unused variant copy');
});

// ---------- One test per situation ----------

test('situation A: academics first, both groups in the first attempt', () => {
    const r = R.recommend(answers({ work: ['ca-firm'] }), data());
    assert.equal(r.situation, 'A');
    assert.equal(r.name, 'Academics');
    assert.deepEqual(r.heading, { before: 'Use the ', mark: 'Academics', after: ' order' });
    assert.equal(r.leadNote, 'your strength');
    assert.match(r.reason, /marks are your loudest proof/);
    assert.deepEqual(r.order, ['header', 'summary', 'education', 'experience', 'certifications', 'leadership', 'skills', 'interests']);
    assert.equal(r.blocks.find(b => b.lead).id, 'education');
    assert.equal(r.design.number, 1);
    assert.match(r.seeIt.href, /resource=Choose\+your\+CV&page=3$/);
    assert.equal(R.recommend(answers({ inter: 'both-awaited' }), data()).situation, 'A', 'both awaited: nothing separate to show');
});

test('situation B: academics first, Inter in more than one sitting', () => {
    for (const inter of ['later', 'separate', 'one-awaited']) {
        const r = R.recommend(answers({ inter, projects: ['work-simulation'] }), data());
        assert.equal(r.situation, 'B', inter);
        assert.match(r.reason, /more than one sitting/);
        assert.equal(r.design.number, 5);
        assert.match(r.seeIt.href, /page=4$/);
    }
});

test('situation C: work done first and some work to show', () => {
    const r = R.recommend(answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], work: ['family', 'tuition'] }), data());
    assert.equal(r.situation, 'C');
    assert.deepEqual(r.order, ['header', 'summary', 'education', 'experience', 'certifications', 'skills', 'leadership', 'interests']);
    assert.equal(r.blocks.find(b => b.lead).id, 'experience');
    assert.equal(r.design.number, 3);
    assert.equal(r.thinProof, null, 'two pieces of proof is not thin');
    assert.match(r.seeIt.href, /page=5$/);
});

test('situation D: projects first; own projects lead, simulations alone put Certifications first', () => {
    const own = R.recommend(answers({ rank: ['projects', 'work', 'academics', 'roles', 'skills'], projects: ['model', 'job-simulation'] }), data());
    assert.equal(own.situation, 'D');
    assert.deepEqual(own.order, ['header', 'summary', 'education', 'projects', 'certifications', 'skills', 'leadership', 'interests']);
    assert.equal(own.blocks.find(b => b.lead).id, 'projects');
    assert.equal(own.design.number, 4);
    const sims = R.recommend(answers({ rank: ['projects', 'work', 'academics', 'roles', 'skills'], projects: ['work-simulation', 'job-simulation'], work: ['company'] }), data());
    assert.equal(sims.situation, 'D');
    assert.deepEqual(sims.order, ['header', 'summary', 'education', 'certifications', 'experience', 'skills', 'leadership', 'interests'],
        'simulations live in Certifications and job simulations, never Projects; work follows them');
    assert.equal(sims.blocks.find(b => b.lead).id, 'certifications');
    assert.match(sims.seeIt.href, /page=6$/);
});

test('situation E: roles and activities first', () => {
    const r = R.recommend(answers({ rank: ['roles', 'academics', 'work', 'projects', 'skills'], projects: ['annual-report'] }), data());
    assert.equal(r.situation, 'E');
    assert.deepEqual(r.order, ['header', 'summary', 'education', 'leadership', 'achievements', 'projects', 'certifications', 'skills', 'interests']);
    assert.equal(r.blocks.find(b => b.id === 'leadership').label, 'Positions of responsibility');
    assert.equal(r.design.number, 6);
    assert.match(r.seeIt.href, /page=7$/);
});

test('situation F: skills with proof first', () => {
    const r = R.recommend(answers({ rank: ['skills', 'projects', 'academics', 'work', 'roles'], projects: ['model'], work: ['part-time'] }), data());
    assert.equal(r.situation, 'F');
    assert.deepEqual(r.order, ['header', 'summary', 'education', 'skills', 'projects', 'experience', 'certifications', 'leadership', 'interests']);
    assert.equal(r.design.number, 7);
    const noProjects = R.recommend(answers({ rank: ['skills', 'academics', 'work', 'projects', 'roles'], work: ['tuition'] }), data());
    assert.deepEqual(noProjects.order, ['header', 'summary', 'education', 'skills', 'experience', 'certifications', 'leadership', 'interests']);
    assert.match(r.seeIt.href, /page=8$/);
});

test('situation G: a direct-entry graduate, whatever the ranking', () => {
    const r = R.recommend(answers({ graduation: 'direct-entry', rank: ['work', 'projects', 'academics', 'roles', 'skills'] }), data());
    assert.equal(r.situation, 'G');
    assert.match(r.reason, /No Foundation row/);
    assert.equal(r.design.number, 2);
    assert.equal(r.portal, null, 'no portal line when the suggested design is the portal one');
    assert.match(r.seeIt.href, /page=9$/);
    assert.ok(r.thinProof, 'no proof at all → the Nothing CV pointer still shows');
});

test('situation H: work or projects ranked first with nothing to show → The Nothing CV', () => {
    for (const top of ['work', 'projects']) {
        const rank = [top].concat(['academics', 'work', 'projects', 'roles', 'skills'].filter(id => id !== top));
        const r = R.recommend(answers({ rank }), data());
        assert.equal(r.situation, 'H', top);
        assert.equal(r.seeIt.href, '/learning-management-system/course?course=msc-articleship-program&session=2&resource=The+Nothing+CV');
        assert.deepEqual(r.heading, { before: 'Start with ', mark: 'The Nothing CV', after: '' });
        assert.equal(r.leadNote, 'start here');
        assert.deepEqual(r.thinProof.links, [{ label: 'Work Simulation', href: '/articleship-program/work-simulation/' }], 'then the Work Simulation');
        assert.match(r.thinProof.text, /Work Simulation level/);
        assert.equal(r.design.number, 2, 'the Nothing CV is shown in Portal plain');
        assert.deepEqual(r.order, ['header', 'summary', 'education', 'certifications', 'leadership', 'skills']);
    }
});

// ---------- Rule order ----------

test('rules: G wins over H; academics first with no proof is A, not H; a strength with no proof is skipped', () => {
    assert.equal(R.chooseSituation(answers({ graduation: 'direct-entry', rank: ['work', 'academics', 'projects', 'roles', 'skills'] })), 'G');
    assert.equal(R.chooseSituation(answers()), 'A');
    assert.equal(R.chooseSituation(answers({ rank: ['roles', 'work', 'projects', 'academics', 'skills'] })), 'E', 'roles need no tap of their own');
    assert.equal(R.chooseSituation(answers({ rank: ['work', 'projects', 'skills', 'academics', 'roles'], projects: ['model'] })), 'D', 'work ranked 1 but none → next strength');
    assert.equal(R.chooseSituation(answers({ rank: ['projects', 'work', 'skills', 'academics', 'roles'], work: ['family'] })), 'C');
    assert.equal(R.chooseSituation(answers({ rank: ['work', 'skills', 'projects', 'academics', 'roles'], projects: ['model'] })), 'F');
    assert.equal(R.chooseSituation(answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], projects: ['job-simulation'], inter: 'separate' })), 'B');
    assert.equal(R.chooseSituation({ rank: ['projects'], work: [], projects: [] }), 'H', 'a partial ranking is completed in the default order');
});

test('order: work and own projects are added after the right block, never twice', () => {
    const a = R.recommend(answers({ work: ['ca-firm'], projects: ['annual-report'] }), data());
    assert.deepEqual(a.order, ['header', 'summary', 'education', 'experience', 'projects', 'certifications', 'leadership', 'skills', 'interests']);
    const c = R.recommend(answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], work: ['ca-firm'], projects: ['model'] }), data());
    assert.deepEqual(c.order, ['header', 'summary', 'education', 'experience', 'projects', 'certifications', 'skills', 'leadership', 'interests']);
    [a, c].forEach(r => assert.equal(new Set(r.order).size, r.order.length));
    const jobSimOnly = R.recommend(answers({ projects: ['job-simulation'] }), data());
    assert.ok(!jobSimOnly.order.includes('projects'), 'a job simulation is not a Projects line');
});

// ---------- One test per variant ----------

function variant(over, id) {
    const r = R.recommend(answers(over), data());
    return r.variants.find(v => v.id === id);
}

test('variant: one group awaited (G2 awaited)', () => {
    const v = variant({ inter: 'one-awaited' }, 'g2-awaited');
    assert.ok(v);
    assert.deepEqual(v.lines, ['CA Intermediate [Group II] | [Year] | ICAI | Result awaited', 'CA Intermediate [Group I] | [Year] | ICAI | [Marks]']);
    assert.match(v.ask, /share it the day it is out/);
    assert.equal(variant({ inter: 'one-awaited' }, 'groups-separately'), undefined, 'not shown twice');
});

test('variant: both groups result awaited', () => {
    const v = variant({ inter: 'both-awaited' }, 'result-awaited');
    assert.deepEqual(v.lines, ['CA Intermediate (both groups) | [Year] | ICAI | Result awaited']);
});

test('variant: groups in different sittings, on top of any situation', () => {
    const v = variant({ inter: 'separate', rank: ['work', 'academics', 'projects', 'roles', 'skills'], work: ['ca-firm'] }, 'groups-separately');
    assert.equal(v.lines.length, 2);
    assert.match(v.lines[0], /^CA Intermediate Group II/);
    assert.match(v.ask, /Group I in \[Month Year\] and Group II/);
});

test('variant: more than one attempt', () => {
    const v = variant({ inter: 'later' }, 'more-attempts');
    assert.match(v.note, /year-only column is fine/);
    assert.match(v.ask, /What changed/);
});

test('variant: a gap, with one true sentence for each kind', () => {
    for (const gap of ['after-foundation', 'after-inter', 'year-out']) {
        const v = variant({ gap }, 'gap');
        assert.deepEqual(v.lines, []);
        assert.match(v.note, /Work experience/);
        assert.match(v.ask, /^\[Month Year\] to \[Month Year\] I \[true reason\]/);
    }
    assert.match(variant({ gap: 'missed-sitting' }, 'gap').ask, /^I skipped the \[Month Year\] sitting/);
    assert.equal(variant({ gap: 'none' }, 'gap'), undefined);
});

test('variant: ICITSS ongoing', () => {
    const v = variant({ icitss: 'ongoing' }, 'icitss-ongoing');
    assert.match(v.lines[0], /Ongoing, completes \[Month Year\]/);
});

test('variant: ICITSS not started', () => {
    const v = variant({ icitss: 'pending' }, 'icitss-pending');
    assert.match(v.lines[0], /Batch from \[Month Year\]/);
    assert.match(v.note, /articleship starts only after ICITSS/);
    assert.equal(variant({ icitss: 'done' }, 'icitss-pending'), undefined);
});

test('variant: graduation pursuing in a regular college', () => {
    assert.match(variant({ graduation: 'regular' }, 'pursuing').lines[0], /Pursuing \(Sem \[N\]/);
});

test('variant: distance or evening B.Com', () => {
    const v = variant({ graduation: 'distance' }, 'distance');
    assert.match(v.lines[0], /^B\.Com \(distance learning\)/);
    assert.ok(v.ask);
});

test('variant: degree started and stopped', () => {
    const v = variant({ graduation: 'stopped' }, 'stopped');
    assert.match(v.note, /Never write Pursuing/);
    assert.match(v.lines[0], /Discontinued after Year \[N\]/);
});

test('variant: CA with CS or CMA, filled for the course', () => {
    const cs = variant({ course: 'cs' }, 'cs-cma');
    assert.equal(cs.label, 'CA with CS');
    assert.deepEqual(cs.lines, ['CS [Executive] | ICSI | Pursuing']);
    assert.match(cs.ask, /I take CS papers only where they don't clash/);
    const cma = variant({ course: 'cma' }, 'cs-cma');
    assert.equal(cma.label, 'CA with CMA');
    assert.deepEqual(cma.lines, ['CMA [Intermediate] | ICMAI | Pursuing']);
    assert.doesNotMatch(JSON.stringify([cs, cma]), /\{\w+\}/, 'no unfilled placeholder');
});

test('variant: another course (CFA, another degree)', () => {
    const cfa = variant({ course: 'cfa' }, 'other-course');
    assert.deepEqual(cfa.lines, ['CFA Level I | CFA Institute | Registered, exam [Month Year]']);
    assert.equal(cfa.note, 'Only after you have registered.');
    const degree = variant({ course: 'degree' }, 'other-course');
    assert.deepEqual(degree.lines, ['[LL.B.] | [University] | Pursuing']);
    assert.equal(variant({ course: 'none' }, 'other-course'), undefined);
});

// ---------- Thin proof, domain ----------

test('thin proof: one piece or none (A only when none); no Work Simulation link when one is done', () => {
    const one = R.recommend(answers({ rank: ['roles', 'academics', 'work', 'projects', 'skills'], work: ['tuition'] }), data());
    assert.ok(one.thinProof);
    assert.deepEqual(one.thinProof.links.map(l => l.label), ['Work Simulation', 'The Nothing CV']);
    assert.match(one.thinProof.links[1].href, /resource=The\+Nothing\+CV&page=3$/);
    assert.equal(R.recommend(answers({ work: ['tuition'] }), data()).thinProof, null, 'A with one piece of proof is fine');
    assert.ok(R.recommend(answers(), data()).thinProof, 'A with nothing at all still gets the pointer');
    const hasWs = R.recommend(answers({ rank: ['projects', 'academics', 'work', 'roles', 'skills'], projects: ['work-simulation'] }), data());
    assert.equal(hasWs.thinProof.text, 'Add the four quick certificates.');
    assert.deepEqual(hasWs.thinProof.links.map(l => l.label), ['The Nothing CV']);
});

test('domain: a pick is passed on; "Not sure yet" sends no domain and shows the one answer', () => {
    const sure = R.recommend(answers({ domain: 'gst' }), data());
    assert.equal(sure.domain, 'gst');
    assert.equal(sure.unsure, null);
    const unsure = R.recommend(answers({ domain: 'unsure' }), data());
    assert.equal(unsure.domain, null);
    assert.match(unsure.unsure.text, /statutory audit and some tax/);
    assert.equal(unsure.unsure.link.href, '/articleship-program/domain-roadmaps/');
});

// ---------- Designs ----------

test('designs: any reasonable designs.json shape is read', () => {
    const list = R.normaliseDesigns([
        { no: 3, title: 'Sidebar', tags: ['Print'], situations: 'C, F' },
        { name: 'Portal plain', tag: 'portal safe', persona: 'h' },
        { number: 2, name: 'Duplicate number' },
        { number: 0, name: 'Bad' },
        { number: 9 }
    ]);
    assert.deepEqual(list.map(d => [d.number, d.name, d.tag, d.bestFor.join('')]), [[2, 'Portal plain', 'Portal-safe', 'H'], [3, 'Sidebar', 'Print', 'CF']]);
    assert.equal(list[1].page, 4, 'look-book page defaults to number + 1');
    assert.equal(R.normaliseDesigns({ designs: [{ number: 1, name: 'X', bestFor: 'A clean design for marks' }] })[0].bestFor.length, 0, 'prose is not read as letters');
    assert.equal(R.normaliseDesigns({ designs: [{ number: 1, name: 'X', bestFor: 'A clean design for marks' }] })[0].line, 'A clean design for marks');
    assert.deepEqual(R.normaliseDesigns(null), []);
    assert.equal(R.normaliseDesigns(DESIGNS).length, 8);
});

test('designs: situation match first, a variant match breaks ties, then the lowest number; none → no design', () => {
    const designs = R.normaliseDesigns([
        { number: 1, name: 'One', bestFor: ['A'] },
        { number: 4, name: 'Four', bestFor: ['A', 'cs-cma'] },
        { number: 8, name: 'Eight', bestFor: ['cs-cma'], tag: 'Portal-safe' }
    ]);
    assert.equal(R.suggestDesign(designs, 'A', []).number, 1);
    assert.equal(R.suggestDesign(designs, 'A', ['cs-cma']).number, 4);
    assert.equal(R.suggestDesign(designs, 'C', ['cs-cma']).number, 4, 'two variant matches: the lowest number');
    const variantOnly = R.normaliseDesigns([{ number: 1, name: 'One', bestFor: ['A'] }, { number: 8, name: 'Eight', bestFor: ['cs-cma'] }]);
    assert.equal(R.suggestDesign(variantOnly, 'C', ['cs-cma']).number, 8, 'a variant match beats no match');
    assert.equal(R.suggestDesign(designs, 'C', []).number, 1);
    assert.equal(R.suggestDesign([], 'A', []), null);
    const none = R.recommend(answers(), data({ designs: [] }));
    assert.equal(none.design, null);
    assert.equal(none.portal, null);
    assert.equal(R.toCvPick(none).design, null);
    assert.equal(R.recommend(answers({ course: 'cma', rank: ['skills', 'academics', 'work', 'projects', 'roles'] }), data()).design.number, 7,
        'the situation still decides when a design is made for it');
});

// ---------- Saving the pick ----------

test('toCvPick: valid for the shared setting; saved for the CV Builder; my domain set', () => {
    const r = R.recommend(answers({ inter: 'separate', icitss: 'ongoing', domain: 'direct-tax' }), data());
    const pick = R.toCvPick(r);
    assert.deepEqual(pick, { situation: 'B', order: r.order, design: 5, variants: ['groups-separately', 'icitss-ongoing'], domain: 'direct-tax', source: 'cv-recommender' });
    const progress = fakeProgress();
    const saved = progress.setCvPick(pick);
    assert.equal(saved.situation, 'B');
    assert.equal(progress.getCvPick().design, 5);
    assert.equal(progress.getMyDomain(), 'direct-tax');
});

test('tap: ranking fills the last strength itself and undoes from a tapped number; "None yet" is exclusive', () => {
    let a = R.cleanAnswers(null);
    ['skills', 'roles', 'work', 'academics'].forEach(id => { a = R.tap(a, 'rank', id); });
    assert.deepEqual(a.rank, ['skills', 'roles', 'work', 'academics', 'projects']);
    assert.ok(R.isAnswered('rank', a));
    a = R.tap(a, 'rank', 'roles');
    assert.deepEqual(a.rank, ['skills']);
    assert.ok(!R.isAnswered('rank', a));
    a = R.tap(a, 'work', 'tuition');
    a = R.tap(a, 'work', 'family');
    assert.deepEqual(a.work, ['tuition', 'family']);
    a = R.tap(a, 'work', 'none');
    assert.deepEqual(a.work, ['none']);
    a = R.tap(a, 'work', 'ca-firm');
    assert.deepEqual(a.work, ['ca-firm']);
    a = R.tap(a, 'inter', 'not-an-option');
    assert.equal(a.inter, null);
    a = R.tap(a, 'inter', 'separate');
    assert.equal(a.inter, 'separate');
    assert.equal(R.firstUnanswered(a), 0);
    assert.equal(R.isComplete(answers()), true);
});

// ---------- The page ----------

function page() {
    const dom = new JSDOM('<!doctype html><main id="main"><div id="hero"></div><div id="app"></div></main>', { url: 'http://127.0.0.1/articleship-program/cv-recommender/' });
    const doc = dom.window.document;
    return { dom, doc, app: doc.getElementById('app'), hero: doc.getElementById('hero'), main: doc.getElementById('main') };
}

function click(doc, text) {
    const target = [...doc.querySelectorAll('button, a')].find(el => el.textContent.trim().startsWith(text));
    assert.ok(target, 'button "' + text + '" on screen');
    target.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true }));
}

test('page: nine taps to a result; the pick and my domain are saved; a reload opens on the result', async () => {
    const storage = memoryStorage();
    const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false }, storage);
    const progress = fakeProgress();
    const p = page();
    R.mount(p.app, { data: data(), store, progress, heroEl: p.hero, mainEl: p.main });
    assert.match(p.app.textContent, /1 of 9/);
    assert.match(p.app.textContent, /Rank your strengths/);
    ['Work done', 'Academics', 'Projects', 'Skills with proof'].forEach(label => click(p.doc, label));
    assert.equal(p.doc.querySelectorAll('.cvr-rank-item.is-ranked').length, 5, 'the fifth fills itself');
    click(p.doc, 'Next');
    assert.match(p.app.textContent, /2 of 9/);
    assert.ok(p.hero.classList.contains('ap-hidden'), 'the intro shows on the first step only');
    click(p.doc, 'Groups in different sittings'); await sleep(200);
    click(p.doc, 'After Inter'); await sleep(200);
    click(p.doc, 'Pursuing, distance or evening'); await sleep(200);
    click(p.doc, 'Ongoing'); await sleep(200);
    assert.match(p.app.textContent, /6 of 9/);
    click(p.doc, 'Family business books');
    click(p.doc, 'Next');
    click(p.doc, 'None yet');
    click(p.doc, 'Next');
    click(p.doc, 'CMA'); await sleep(200);
    click(p.doc, 'GST'); await sleep(200);

    assert.match(p.app.textContent, /Use the Work experience order/);
    assert.ok(p.main.classList.contains('is-wide'));
    const labels = [...p.doc.querySelectorAll('.cvr-block-label')].map(n => n.textContent);
    assert.deepEqual(labels, ['Name and contact', '3-line objective', 'Education + ICITSS row', 'Work experience', 'Certifications and job simulations', 'Skills', 'Roles and achievements', 'Interests']);
    const variantLabels = [...p.doc.querySelectorAll('.cvr-variant strong')].map(n => n.textContent);
    assert.deepEqual(variantLabels, ['Groups in different sittings', 'ICITSS ongoing', 'Distance or evening B.Com', 'CA with CMA', 'A gap']);
    const seeIt = [...p.doc.querySelectorAll('a.ap-btn')].find(a => a.textContent === 'See it');
    assert.equal(seeIt.getAttribute('href'), '/learning-management-system/course?course=msc-articleship-program&session=2&resource=Choose+your+CV&page=5');
    assert.match(p.app.textContent, /No\. 3 Sidebar/);
    assert.match(p.app.textContent, /Thin on proof\?/);
    assert.ok(!/build/i.test([...p.doc.querySelectorAll('a, button')].map(n => n.textContent).join(' ')), 'no build button of its own');

    const pick = progress.getCvPick();
    assert.equal(pick.situation, 'C');
    assert.equal(pick.design, 3);
    assert.deepEqual(pick.variants, ['groups-separately', 'icitss-ongoing', 'distance', 'cs-cma', 'gap']);
    assert.equal(progress.getMyDomain(), 'gst');
    assert.equal(store.get().done, true);

    const again = page();
    R.mount(again.app, { data: data(), store: memoryStore('cv-recommender', { answers: null, step: 0, done: false }, storage), progress, heroEl: again.hero, mainEl: again.main });
    assert.match(again.app.textContent, /Use the Work experience order/, 'reload opens on the saved result');
    click(again.doc, 'Change my answers');
    assert.match(again.app.textContent, /1 of 9/);
    assert.equal(again.doc.querySelectorAll('.cvr-rank-item.is-ranked').length, 5, 'answers kept');
    assert.equal(store.get().done, true, 'the other store copy is untouched until it changes');
});

test('page: "my domain" from another tool is pre-selected; text is never parsed as HTML', async () => {
    const progress = fakeProgress();
    progress.setMyDomain('valuation');
    const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false });
    const evil = data();
    evil.situations.A.reason = '<img src=x onerror=alert(1)>';
    store.set({ answers: answers({ domain: null }), step: 8, done: false });
    const p = page();
    R.mount(p.app, { data: evil, store, progress });
    assert.match(p.app.textContent, /9 of 9/);
    const on = p.doc.querySelector('.cvr-opt.is-on');
    assert.equal(on.textContent, 'Valuation');
    click(p.doc, 'Show my CV');
    assert.equal(p.doc.querySelector('img'), null);
    assert.match(p.app.textContent, /<img src=x/);
});

test('student-facing text: no banned words, no dates, no "coming soon", no internal codes', () => {
    const files = [
        path.join(TOOL_DIR, 'index.html'),
        path.join(TOOL_DIR, 'situations.json'),
        path.join(__dirname, '../scripts/articleship-cv-recommender.js')
    ];
    const text = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    assert.doesNotMatch(text, /ca ?monk|thinking ?bridge|umbrella|NEEDS-CHECK|\bwave\b|drop [abc]\b|live week|coming soon|saved on this device/i);
    assert.doesNotMatch(text, /\b(20(2[6-9]))-\d{2}-\d{2}\b|\b\d{1,2} (Oct|Nov|Dec)\b/, 'no dates');
    assert.doesNotMatch(fs.readFileSync(path.join(TOOL_DIR, 'situations.json'), 'utf8'), /\b(D1-\d|MS-\d|TL-M\d|P\d)\b/, 'no internal codes');
});
