const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const R = require('../scripts/articleship-cv-recommender.js');
const P = require('../scripts/articleship-progress.js');

const ROOT = path.join(__dirname, '..');
const TOOL_DIR = path.join(ROOT, 'articleship-program/cv-recommender');
const SITUATIONS = JSON.parse(fs.readFileSync(path.join(TOOL_DIR, 'situations.json'), 'utf8'));
// The one design list, read by this tool and the CV Builder alike.
const BUILDER_DESIGNS = path.join(ROOT, 'articleship-program/cv-builder/designs.json');
// The same test file runs on both live branches (master and the mobile port). Files of other tools that a branch does
// not carry yet are not faked: their checks are skipped with the reason, and the design checks expect "no design" (the
// page then says "pick a design in CV templates").
const ON_BRANCH = {
    designs: fs.existsSync(BUILDER_DESIGNS),
    builderStage: fs.existsSync(path.join(ROOT, 'articleship-program/cv-builder/stage.js')),
    lmsSql: fs.existsSync(path.join(ROOT, 'supabase/migrations/202610200002_articleship_program_v3_lms.sql')),
    roadmaps: fs.existsSync(path.join(ROOT, 'articleship-program/domain-roadmaps/roadmaps.json'))
};
const NOT_HERE = {
    designs: !ON_BRANCH.designs && 'the CV Builder\'s designs.json is not on this branch yet',
    builderStage: !(ON_BRANCH.designs && ON_BRANCH.builderStage) && 'the CV Builder (row 1.5) is not on this branch yet',
    lmsSql: !ON_BRANCH.lmsSql && 'the v3 LMS migration lives on the desktop branch only (one shared database)',
    roadmaps: !ON_BRANCH.roadmaps && 'Domain roadmaps (row 5.1) is not on this branch yet'
};
const DESIGNS = ON_BRANCH.designs ? JSON.parse(fs.readFileSync(BUILDER_DESIGNS, 'utf8')) : { designs: [] };
// Padam's exact wording (B7) once the programme is done; "(ongoing)" until then, as The Nothing CV p3 shows it.
const MSC_LINE = 'Completed MSC Articleship Program — foundational understanding of work and tasks across all domains';
const MSC_ONGOING = 'MSC Articleship Program (ongoing)';
const DESIGN_LIST = R.normaliseDesigns(DESIGNS);
// R is the tool as shipped (release 1: WORK_SIMULATION_LIVE false). RL is the same tool once the Work Simulation is out.
const RL = R.withConfig({ workSimulationLive: true });
// Page tests run with short timings; one test checks the real ones (280 ms advance, 250 ms double-tap guard).
const FAST = { advanceMs: 20, tapGuardMs: 0 };

// The design a situation is given, worked out from the shared designs.json (never a literal number, so these tests
// follow the CV templates look-book whenever row 1.4 changes it): the lowest-numbered design whose bestFor names the
// situation, or, when one of those also names a variant of the student's, that one.
function designFor(code, variantIds) {
    if (!ON_BRANCH.designs) return null;
    const ids = variantIds || [];
    const named = DESIGN_LIST.filter(d => d.bestFor.includes(code));
    assert.ok(named.length, 'designs.json has a design whose bestFor names ' + code);
    return named.find(d => d.bestFor.some(tag => ids.includes(tag))) || named[0];
}

/** The result's design is the one designs.json gives (or none on a branch without the design list). */
function sameDesign(result, design, message) {
    assert.equal(result.design ? result.design.number : null, design ? design.number : null, message);
}

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
        assert.ok(SITUATIONS.sections[s.lead], code + ' lead');
    }
    assert.deepEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(c => SITUATIONS.situations[c].page), [3, 4, 5, 6, 7, 8, 9]);
    assert.equal(SITUATIONS.situations.H.resource, 'nothing');
    assert.equal(SITUATIONS.situations.H.fixed, true, "The Nothing CV keeps Padam's order");
    assert.equal(SITUATIONS.resources.choose, 'Choose your CV');
    assert.equal(SITUATIONS.resources.nothing, 'The Nothing CV');
    assert.equal(SITUATIONS.resources.templates, 'CV templates');
});

test('questions: nine taps, graduation before the gap, labels of 1-3 words, the 13 domains plus "Not sure yet", no city tap', () => {
    assert.equal(R.QUESTIONS.length, 9);
    assert.deepEqual(R.QUESTIONS.map(q => q.id), ['rank', 'inter', 'graduation', 'gap', 'icitss', 'work', 'projects', 'course', 'domain']);
    assert.ok(!R.QUESTIONS.some(q => /city/i.test(q.id + q.title)));
    const domain = R.QUESTIONS.find(q => q.id === 'domain');
    assert.deepEqual(domain.options.map(o => o.id), P.DOMAINS.map(d => d.slug).concat('unsure'));
    R.QUESTIONS.filter(q => q.id !== 'domain').forEach(q => (q.options || []).forEach(o =>
        assert.ok(o.label.split(/\s+/).length <= 3, 'label of 1-3 words: ' + o.label)));
    assert.deepEqual(R.STRENGTHS.map(s => s.id), ['academics', 'work', 'projects', 'roles', 'skills']);
});

test('a direct-entry graduate is never offered "After Foundation"; a stale answer is asked again', () => {
    assert.ok(R.optionsFor('gap', answers()).some(o => o.id === 'after-foundation'));
    assert.ok(!R.optionsFor('gap', answers({ graduation: 'direct-entry' })).some(o => o.id === 'after-foundation'));
    assert.equal(R.cleanAnswers(answers({ graduation: 'direct-entry', gap: 'after-foundation' })).gap, null);
    assert.equal(R.cleanAnswers(answers({ graduation: 'direct-entry', gap: 'after-inter' })).gap, 'after-inter');
    let a = R.tap(answers({ gap: 'after-foundation' }), 'graduation', 'direct-entry');
    assert.equal(a.gap, null, 'changing graduation to direct entry clears the gap answer');
    assert.equal(R.firstUnanswered(a), 3, 'and the gap question is asked again');
    a = R.tap(a, 'gap', 'after-foundation');
    assert.equal(a.gap, null, 'a hidden option cannot be tapped');
});

test('every variant the rules can produce has its copy in situations.json', () => {
    const combos = [];
    ['first', 'later', 'separate', 'one-awaited', 'both-awaited'].forEach(inter =>
        ['none', 'after-foundation', 'after-inter', 'missed-sitting', 'year-out'].forEach(gap =>
            ['regular', 'distance', 'completed', 'direct-entry', 'stopped', 'none'].forEach(graduation =>
                ['done', 'ongoing', 'pending'].forEach(icitss =>
                    ['none', 'cs', 'cma', 'cfa', 'degree'].forEach(course =>
                        [undefined, ['work', 'skills', 'roles', 'projects', 'academics']].forEach(rank =>
                            combos.push({ inter, gap, graduation, icitss, course, rank, work: ['tuition'] })))))));
    const seen = new Set();
    combos.forEach(c => R.variantIdsFor(answers(c)).forEach(id => seen.add(id)));
    seen.forEach(id => assert.ok(SITUATIONS.variants[id], 'copy for ' + id));
    assert.deepEqual([...seen].sort(), Object.keys(SITUATIONS.variants).sort(), 'no unused variant copy');
    combos.slice(0, 400).forEach(c => R.variantsFor(answers(c), SITUATIONS).forEach(v => {
        assert.doesNotMatch(JSON.stringify(v), /\{\w+\}/, 'no unfilled placeholder in ' + v.id);
        assert.ok(v.lines.length, v.id + ' has a line to copy');
    }));
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
    sameDesign(r, designFor('A'));
    assert.equal(r.seeIt.label, 'See this order');
    assert.match(r.seeIt.href, /resource=Choose\+your\+CV&page=3$/);
    assert.equal(R.recommend(answers({ inter: 'both-awaited' }), data()).situation, 'A', 'both awaited: nothing separate to show');
    // Choose your CV p3 (where "See this order" opens): "a rank or strong school marks, and you have little else yet".
    const marksOnly = R.recommend(answers(), data());
    assert.equal(marksOnly.situation, 'A', 'a first-attempt student with marks and nothing else is A');
    assert.match(SITUATIONS.situations.A.useIf, /little else yet/);
    assert.deepEqual(marksOnly.thinProof.links.map(l => l.label), ['The Nothing CV', 'Earn one more line'], 'and is pointed to The Nothing CV');
    assert.deepEqual(RL.recommend(answers(), data()).thinProof.links.map(l => l.label), ['Work Simulation', 'The Nothing CV'],
        'once the Work Simulation is out: a level first');
    // Inter not out yet: the marks that lead are Foundation and school, not Inter.
    const awaited = R.recommend(answers({ inter: 'both-awaited' }), data());
    assert.match(awaited.reason, /^Your Inter result is not out yet, so your Foundation and school marks lead/);
    assert.doesNotMatch(awaited.reason, /loudest/);
});

test('situation B: academics first, Inter in more than one sitting; one group awaited has its own reason', () => {
    for (const inter of ['later', 'separate', 'one-awaited']) {
        const r = R.recommend(answers({ inter, projects: ['job-simulation'] }), data());
        assert.equal(r.situation, 'B', inter);
        if (inter === 'one-awaited') {
            assert.match(r.reason, /^One group is cleared and one is awaited\./);
            assert.doesNotMatch(r.reason, /more than one sitting|improvement/);
        } else {
            assert.match(r.reason, /more than one sitting/);
        }
        sameDesign(r, designFor('B'));
        assert.match(r.seeIt.href, /page=4$/);
    }
});

test('situation C: work done first and some work to show', () => {
    const r = R.recommend(answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], work: ['family', 'tuition'] }), data());
    assert.equal(r.situation, 'C');
    assert.deepEqual(r.order, ['header', 'summary', 'education', 'experience', 'certifications', 'leadership', 'skills', 'interests']);
    assert.equal(r.blocks.find(b => b.lead).id, 'experience');
    sameDesign(r, designFor('C'));
    assert.equal(r.thinProof, null, 'two pieces of proof is not thin');
    assert.match(r.seeIt.href, /page=5$/);
});

test('situation D: projects first; own projects lead, simulations alone put Certifications first', () => {
    const own = R.recommend(answers({ rank: ['projects', 'work', 'academics', 'roles', 'skills'], projects: ['model', 'job-simulation'] }), data());
    assert.equal(own.situation, 'D');
    assert.deepEqual(own.order, ['header', 'summary', 'education', 'projects', 'certifications', 'leadership', 'skills', 'interests']);
    assert.equal(own.blocks.find(b => b.lead).id, 'projects');
    sameDesign(own, designFor('D'));
    const sims = RL.recommend(answers({ rank: ['projects', 'work', 'academics', 'roles', 'skills'], projects: ['work-simulation', 'job-simulation'], work: ['company'] }), data());
    assert.equal(sims.situation, 'D');
    assert.deepEqual(sims.order, ['header', 'summary', 'education', 'certifications', 'experience', 'leadership', 'skills', 'interests'],
        'simulations live in Certifications and job simulations, never Projects; work (number 2) follows them');
    assert.equal(sims.blocks.find(b => b.lead).id, 'certifications');
    assert.match(sims.seeIt.href, /page=6$/);
});

test('situation E: roles and activities first', () => {
    const r = R.recommend(answers({ rank: ['roles', 'academics', 'work', 'projects', 'skills'], projects: ['annual-report'] }), data());
    assert.equal(r.situation, 'E');
    assert.deepEqual(r.order, ['header', 'summary', 'education', 'leadership', 'achievements', 'projects', 'certifications', 'skills', 'interests']);
    assert.equal(r.blocks.find(b => b.id === 'leadership').label, 'Positions of responsibility');
    sameDesign(r, designFor('E'));
    assert.match(r.seeIt.href, /page=7$/);
});

test('situation F: skills with proof first', () => {
    const r = R.recommend(answers({ rank: ['skills', 'projects', 'academics', 'work', 'roles'], projects: ['model'], work: ['part-time'] }), data());
    assert.equal(r.situation, 'F');
    assert.deepEqual(r.order, ['header', 'summary', 'education', 'skills', 'projects', 'certifications', 'experience', 'leadership', 'interests']);
    sameDesign(r, designFor('F'));
    // One proof, said once: the Skills line points at a different piece of work from the Projects line.
    const skills = r.blocks.find(b => b.id === 'skills').example;
    const project = r.blocks.find(b => b.id === 'projects').example;
    assert.match(project, /debtors-ageing/);
    assert.doesNotMatch(skills, /debtors|ageing|dashboard/);
    // Nor any line the student's own taps can add (work, projects, simulations in every domain).
    const own = [].concat(Object.values(SITUATIONS.answerExamples.work), Object.values(SITUATIONS.answerExamples.projects),
        Object.values(SITUATIONS.workSimulation), Object.values(SITUATIONS.answerExamples.certifications));
    const proof = skills.split(';').slice(1).join(';').trim();
    assert.ok(proof, 'the Skills line names its proof');
    own.forEach(line => proof.split(/\W+/).filter(w => w.length > 5 && !/^(proficient|PivotTables|XLOOKUP|SUMIFS)$/.test(w))
        .forEach(word => assert.ok(!line.includes(word), 'F skills proof "' + word + '" also in: ' + line.slice(0, 50))));
    const noProjects = R.recommend(answers({ rank: ['skills', 'academics', 'work', 'projects', 'roles'], work: ['tuition'] }), data());
    assert.deepEqual(noProjects.order, ['header', 'summary', 'education', 'skills', 'experience', 'certifications', 'leadership', 'interests']);
    assert.match(r.seeIt.href, /page=8$/);
});

test('situation G: a direct-entry graduate, whatever the ranking', () => {
    const r = R.recommend(answers({ graduation: 'direct-entry', rank: ['work', 'projects', 'academics', 'roles', 'skills'] }), data());
    assert.equal(r.situation, 'G');
    assert.match(r.reason, /No Foundation row/);
    const g = designFor('G');
    sameDesign(r, g);
    if (!g || g.portalSafe) assert.equal(r.portal, null, 'no portal line when the suggested design is the portal one');
    else assert.match(r.portal.text, /^Applying on a firm's portal\? Use Portal plain \(No\. \d+\) with the same order\.$/);
    assert.match(r.seeIt.href, /page=9$/);
    assert.ok(r.thinProof, 'no proof at all → the Nothing CV pointer still shows');
});

test('situation H: no work and no project, with work or projects ranked first → The Nothing CV, its order fixed', () => {
    for (const top of ['work', 'projects']) {
        const rank = [top].concat(['academics', 'work', 'projects', 'roles', 'skills'].filter(id => id !== top));
        const r = R.recommend(answers({ rank }), data());
        assert.equal(r.situation, 'H', top);
        assert.equal(r.seeIt.label, 'See The Nothing CV');
        assert.equal(r.seeIt.href, '/learning-management-system/course?course=msc-articleship-program&session=2&resource=The+Nothing+CV');
        assert.deepEqual(r.heading, { before: 'Start with ', mark: 'The Nothing CV', after: '' });
        assert.equal(r.leadNote, 'start here');
        assert.equal(r.reason, 'One weekend gives you the four quick certificates; one more true line takes a few weeks.',
            'the weekend is the four certificates (The Nothing CV p4); a project line is a few weeks (p5)');
        assert.equal(r.thinProof.label, 'Then');
        assert.match(r.thinProof.text, /^earn one more true line in a few weeks/, 'reads on from "Then"');
        assert.deepEqual(r.thinProof.links.map(l => l.label), ['Earn one more line']);
        assert.equal(r.thinProof.links[0].href, '/learning-management-system/course?course=msc-articleship-program&session=2&resource=The+Nothing+CV&page=5',
            'The Nothing CV p5: "Earn one more true line"');
        const live = RL.recommend(answers({ rank }), data());
        assert.match(live.thinProof.text, /^do one Work Simulation level/, 'once it is out, the Work Simulation is the step after');
        assert.deepEqual(live.thinProof.links.map(l => l.label), ['Work Simulation']);
        sameDesign(r, designFor('H'));
        if (ON_BRANCH.designs) assert.match(r.design.name, /Portal plain/, 'the Nothing CV is shown in Portal plain');
        assert.equal(r.portal, null, 'no second portal line when the design already is the portal one');
        assert.deepEqual(r.order, ['header', 'summary', 'education', 'certifications', 'leadership', 'skills']);
        assert.ok(!r.blocks.some(b => b.note), 'no "number 5" note on the fixed order');
    }
    const lowMarks = R.recommend(answers({ rank: ['work', 'projects', 'roles', 'skills', 'academics'] }), data());
    assert.equal(lowMarks.situation, 'H');
    assert.deepEqual(lowMarks.order, ['header', 'summary', 'education', 'certifications', 'leadership', 'skills'], 'marks ranked last: still the fixed order');
    assert.ok(!lowMarks.variants.some(v => v.id === 'marks-low'));
});

test('no proof yet, but marks, roles or skills ranked first: their own order, with "Thin on proof?" pointing at The Nothing CV', () => {
    const cases = [
        [['roles', 'academics', 'work', 'projects', 'skills'], {}, 'E', 'leadership'],
        [['skills', 'academics', 'work', 'projects', 'roles'], {}, 'F', 'skills'],
        [['academics', 'work', 'projects', 'roles', 'skills'], {}, 'A', 'education'],
        [['academics', 'work', 'projects', 'roles', 'skills'], { inter: 'separate' }, 'B', 'education']
    ];
    for (const [rank, over, code, lead] of cases) {
        const r = R.recommend(answers(Object.assign({ rank }, over)), data());
        assert.equal(r.situation, code, rank[0] + ' first');
        assert.equal(r.lead, lead);
        assert.equal(r.thinProof.label, 'Thin on proof?');
        assert.equal(r.thinProof.text, 'Add the four quick certificates, then one more true line.');
        assert.match(r.thinProof.links[0].href, /resource=The\+Nothing\+CV&page=4$/, code + ': The Nothing CV p4, the four certificates');
        assert.ok(!r.order.includes('experience') && !r.order.includes('projects'), 'no empty Work or Projects block');
    }
    const separate = R.recommend(answers({ inter: 'separate' }), data());
    assert.ok(separate.variants.some(v => v.id === 'groups-separately'), 'B keeps the groups-separately rows to add');
});

// ---------- Rule order ----------

test('rules: G wins over H; no proof is H only with work or projects ranked first; a strength with no proof is skipped', () => {
    assert.equal(R.chooseSituation(answers({ graduation: 'direct-entry', rank: ['work', 'academics', 'projects', 'roles', 'skills'] })), 'G');
    assert.equal(R.chooseSituation(answers()), 'A');
    assert.equal(R.chooseSituation(answers({ inter: 'both-awaited' })), 'A');
    for (const inter of ['later', 'separate', 'one-awaited']) assert.equal(R.chooseSituation(answers({ inter })), 'B', inter);
    assert.equal(R.chooseSituation(answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'] })), 'H', 'work first, none: H');
    assert.equal(R.chooseSituation(answers({ rank: ['projects', 'academics', 'work', 'roles', 'skills'] })), 'H', 'projects first, none: H');
    assert.equal(R.chooseSituation(answers({ rank: ['roles', 'work', 'projects', 'academics', 'skills'] })), 'E', 'roles first, no work, no project: roles lead');
    assert.equal(R.chooseSituation(answers({ rank: ['skills', 'work', 'projects', 'academics', 'roles'] })), 'F', 'skills first, no work, no project: skills lead');
    assert.equal(R.chooseSituation(answers({ rank: ['roles', 'work', 'projects', 'academics', 'skills'], work: ['tuition'] })), 'E', 'roles need no tap of their own');
    assert.equal(R.chooseSituation(answers({ rank: ['work', 'projects', 'skills', 'academics', 'roles'], projects: ['model'] })), 'D', 'work ranked 1 but none → next strength');
    assert.equal(R.chooseSituation(answers({ rank: ['projects', 'work', 'skills', 'academics', 'roles'], work: ['family'] })), 'C');
    assert.equal(R.chooseSituation(answers({ rank: ['work', 'skills', 'projects', 'academics', 'roles'], projects: ['model'] })), 'F');
    assert.equal(R.chooseSituation(answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], projects: ['job-simulation'], inter: 'separate' })), 'B');
    assert.equal(R.chooseSituation({ rank: ['projects'], work: [], projects: [] }), 'H', 'a partial ranking is completed in the default order');
});

// ---------- Your ranking decides the rest of the order ----------

test('rank 2-5: after the lead block the proof blocks follow the student\'s own ranking; number 5 goes last', () => {
    const c1 = R.recommend(answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], work: ['family'] }), data());
    const c2 = R.recommend(answers({ rank: ['work', 'academics', 'skills', 'roles', 'projects'], work: ['family'] }), data());
    const c3 = R.recommend(answers({ rank: ['work', 'academics', 'roles', 'skills', 'projects'], work: ['family'] }), data());
    [c1, c2, c3].forEach(r => assert.equal(r.situation, 'C'));
    assert.deepEqual(c1.order, ['header', 'summary', 'education', 'experience', 'certifications', 'leadership', 'skills', 'interests']);
    assert.deepEqual(c2.order, ['header', 'summary', 'education', 'experience', 'skills', 'leadership', 'certifications', 'interests']);
    assert.deepEqual(c3.order, ['header', 'summary', 'education', 'experience', 'leadership', 'skills', 'certifications', 'interests']);
    assert.notDeepEqual(c1.order, c2.order, 'ranks 2-5 change the order');
    assert.deepEqual(c1.blocks.filter(b => b.note).map(b => [b.id, b.note]), [['skills', 'your no. 5 goes last']]);
    assert.deepEqual(c2.blocks.filter(b => b.note).map(b => b.id), ['certifications']);
    // The number 5's blocks are the last proof blocks; only Interests closes after them.
    [c1, c2, c3].forEach(r => {
        const last = r.blocks.filter(b => b.note).map(b => r.order.indexOf(b.id));
        assert.deepEqual(last, [r.order.length - 2]);
    });
    const e = R.recommend(answers({ rank: ['skills', 'academics', 'work', 'projects', 'roles'], work: ['tuition'] }), data());
    assert.equal(e.situation, 'F');
    assert.deepEqual(e.order.slice(-3), ['certifications', 'leadership', 'interests'], 'roles ranked 5th: their block is the last');
    assert.equal(e.blocks.find(b => b.id === 'leadership').note, 'your no. 5 goes last');
    const group = R.recommend(answers({ rank: ['roles', 'academics', 'skills', 'work', 'projects'], work: ['tuition'], projects: ['model'] }), data());
    assert.deepEqual(group.order.slice(-3), ['projects', 'certifications', 'interests'], 'a number 5 with two blocks: both last');
    assert.deepEqual(group.blocks.filter(b => b.note).map(b => b.id), ['projects'], 'the note once, on its first block');
    const lead = R.recommend(answers({ rank: ['roles', 'skills', 'academics', 'work', 'projects'], work: ['tuition'] }), data());
    assert.equal(lead.situation, 'E');
    assert.deepEqual(lead.order, ['header', 'summary', 'education', 'leadership', 'achievements', 'skills', 'experience', 'certifications', 'interests'],
        'the lead block keeps its sibling (Achievements) beside it');
});

test('marks ranked 4th or 5th: the education table still comes right after the objective (Choose your CV p2)', () => {
    const weak = R.recommend(answers({ rank: ['work', 'skills', 'roles', 'projects', 'academics'], work: ['family'] }), data());
    const strong = R.recommend(answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], work: ['family'] }), data());
    assert.equal(weak.situation, 'C');
    assert.equal(strong.situation, 'C');
    assert.deepEqual(weak.order, ['header', 'summary', 'education', 'experience', 'skills', 'leadership', 'certifications', 'interests']);
    assert.notDeepEqual(weak.order, strong.order, 'ranks 2-5 still change the order');
    assert.equal(weak.blocks.find(b => b.lead).id, 'experience', 'the number 1 right after the education table');
    assert.ok(!weak.blocks.some(b => b.note), 'marks ranked 5th: the table stays on top, so no "goes last" note');
    const fourth = R.recommend(answers({ rank: ['roles', 'skills', 'work', 'academics', 'projects'], work: ['tuition'] }), data());
    assert.equal(fourth.situation, 'E');
    assert.deepEqual(fourth.order.slice(0, 4), ['header', 'summary', 'education', 'leadership']);
    const g = R.recommend(answers({ graduation: 'direct-entry', rank: ['roles', 'skills', 'work', 'projects', 'academics'], work: ['tuition'] }), data());
    assert.equal(g.situation, 'G');
    assert.deepEqual(g.order.slice(0, 3), ['header', 'summary', 'education']);
    [weak, fourth, g].forEach(r => assert.ok(!r.variants.some(v => v.id === 'marks-low'), 'no marks-low line'));
    assert.equal(SITUATIONS.variants['marks-low'], undefined, 'no marks-low copy left in the data');
});

test('order: work and own projects join their strength\'s place, never twice', () => {
    const a = R.recommend(answers({ work: ['ca-firm'], projects: ['annual-report'] }), data());
    assert.deepEqual(a.order, ['header', 'summary', 'education', 'experience', 'projects', 'certifications', 'leadership', 'skills', 'interests']);
    const c = R.recommend(answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], work: ['ca-firm'], projects: ['model'] }), data());
    assert.deepEqual(c.order, ['header', 'summary', 'education', 'experience', 'projects', 'certifications', 'leadership', 'skills', 'interests']);
    [a, c].forEach(r => assert.equal(new Set(r.order).size, r.order.length));
    const jobSimOnly = R.recommend(answers({ projects: ['job-simulation'] }), data());
    assert.ok(!jobSimOnly.order.includes('projects'), 'a job simulation is not a Projects line');
    assert.deepEqual(R.personaliseOrder(SITUATIONS.situations.A, answers({ work: ['ca-firm'] })), a.order.filter(id => id !== 'projects'));
});

// ---------- Example lines follow the answers ----------

test('examples: the work and project lines follow what was tapped; the certifications line follows the domain', () => {
    const ex = (over, id) => R.recommend(answers(over), data()).blocks.find(b => b.id === id).example;
    const C = { rank: ['work', 'academics', 'projects', 'roles', 'skills'] };
    assert.match(ex(Object.assign({ work: ['tuition'] }, C), 'experience'), /^Tutor, Class XI–XII Accountancy/);
    assert.match(ex(Object.assign({ work: ['family'] }, C), 'experience'), /^Accounts, family business/);
    assert.match(ex(Object.assign({ work: ['company'] }, C), 'experience'), /^Finance intern, \[Company\]/);
    assert.match(ex(Object.assign({ work: ['part-time'] }, C), 'experience'), /^Part-time accountant/);
    assert.match(ex(Object.assign({ work: ['tuition', 'ca-firm'] }, C), 'experience'), /^Intern, \[CA firm\]/, 'the strongest work first');
    assert.doesNotMatch(ex(Object.assign({ work: ['tuition'] }, C), 'experience'), /vouched/);
    assert.match(ex({ work: ['ca-firm'], projects: ['model'] }, 'projects'), /dashboard in Excel/);
    assert.match(ex({ work: ['ca-firm'], projects: ['annual-report'] }, 'projects'), /annual report/);

    const D = { rank: ['projects', 'academics', 'work', 'roles', 'skills'] };
    const exL = (over, id) => RL.recommend(answers(over), data()).blocks.find(b => b.id === id).example;
    assert.match(exL(Object.assign({ projects: ['work-simulation'], domain: 'gst' }, D), 'certifications'),
        /^GST Work Simulation, MSC Articleship Program \| \[Month Year\]: .*GSTR-2B/);
    assert.match(exL(Object.assign({ projects: ['work-simulation'], domain: 'direct-tax' }, D), 'certifications'), /^Direct Tax Work Simulation/);
    assert.match(exL(Object.assign({ projects: ['work-simulation'], domain: 'ib-er' }, D), 'certifications'), /^IB & ER Work Simulation/);
    assert.match(exL(Object.assign({ projects: ['work-simulation'], domain: 'unsure' }, D), 'certifications'), /^Statutory Audit Work Simulation/,
        'not sure yet: statutory audit (house rule 10)');
    assert.match(ex(Object.assign({ projects: ['job-simulation'], domain: 'gst' }, D), 'certifications'), /Job Simulation \(Forage\)/,
        'no Work Simulation level: no Work Simulation line');
    assert.match(ex({ domain: 'gst' }, 'certifications'), /four quick certificates/);
    P.DOMAINS.forEach(d => assert.match(SITUATIONS.workSimulation[d.slug] || '', / Work Simulation, MSC Articleship Program \| \[Month Year\]: /, d.slug));
    assert.equal(ex({ inter: 'both-awaited' }, 'education'), 'CA Intermediate (both groups) | [Year] | ICAI | Result awaited', 'no marks before the result');
    assert.match(ex({ inter: 'one-awaited', work: ['tuition'] }, 'education'), /Group II \| \[Year\] \| Result awaited/);
    assert.match(ex({ inter: 'later', work: ['tuition'] }, 'education'), /\[Best paper score\]$/);
    assert.match(ex({ inter: 'first' }, 'education'), /First attempt/);
    assert.match(ex({ graduation: 'direct-entry', inter: 'both-awaited' }, 'education'), /^B\.Com/, 'G keeps its graduation row');
    const years = JSON.stringify([SITUATIONS.sections, SITUATIONS.situations, SITUATIONS.answerExamples]);
    assert.doesNotMatch(years, /\b20\d\d\b/, 'years are [Year] placeholders');
});

// ---------- Lines to add ----------

function variant(over, id) {
    const r = R.recommend(answers(over), data());
    return r.variants.find(v => v.id === id);
}

test('the MSC line: "(ongoing)" now, then Padam\'s exact wording once done, on every result, outside the four-certificate count', () => {
    const results = [
        answers(), answers({ inter: 'separate', projects: ['job-simulation'] }), answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], work: ['ca-firm'] }),
        answers({ rank: ['projects', 'academics', 'work', 'roles', 'skills'], projects: ['model'] }), answers({ rank: ['roles', 'academics', 'work', 'projects', 'skills'], work: ['tuition'] }),
        answers({ rank: ['skills', 'academics', 'work', 'projects', 'roles'], work: ['tuition'] }), answers({ graduation: 'direct-entry' }), answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'] })
    ].map(a => R.recommend(a, data()));
    assert.deepEqual(results.map(r => r.situation), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    results.forEach(r => {
        assert.deepEqual(r.mscLine.lines, [MSC_ONGOING], r.situation);
        assert.deepEqual(r.mscLine.later, { label: 'Once you finish the programme', line: MSC_LINE }, r.situation);
        assert.match(r.mscLine.note, /not one of the four outside certificates/);
        assert.ok(!r.variants.some(v => v.id === 'msc-line'), 'not a variant');
    });
});

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

test('variant: a gap gets one true line for its kind, never hidden, plus the "if asked" sentence', () => {
    const kinds = { 'after-foundation': /Inter preparation/, 'after-inter': /ICITSS/, 'missed-sitting': /Group \[I or II\] preparation/, 'year-out': /caring for family/ };
    for (const [gap, what] of Object.entries(kinds)) {
        const v = variant({ gap }, 'gap');
        assert.equal(v.lines.length, 1, gap);
        assert.match(v.lines[0], /^\[Month Year\]–\[Month Year\] \| \[What you did: /);
        assert.match(v.lines[0], what);
        assert.match(v.note, /Never hide it/);
        assert.match(v.note, /Work experience/);
    }
    for (const gap of ['after-foundation', 'after-inter', 'year-out']) assert.match(variant({ gap }, 'gap').ask, /^\[Month Year\] to \[Month Year\] I \[true reason\]/);
    assert.match(variant({ gap: 'missed-sitting' }, 'gap').ask, /^I skipped the \[Month Year\] sitting/);
    assert.equal(variant({ gap: 'none' }, 'gap'), undefined);
});

test('variant: ICITSS completed, ongoing, not started (its own education row each time)', () => {
    const done = variant({ icitss: 'done' }, 'icitss-done');
    assert.deepEqual(done.lines, ['ICITSS (Orientation Course + IT Training) | ICAI | Completed [Month Year]']);
    assert.match(done.note, /own row in your education table/);
    assert.match(variant({ icitss: 'ongoing' }, 'icitss-ongoing').lines[0], /Ongoing, completes \[Month Year\]/);
    const pending = variant({ icitss: 'pending' }, 'icitss-pending');
    assert.match(pending.lines[0], /Batch from \[Month Year\]/);
    assert.match(pending.note, /articleship starts only after ICITSS/);
    assert.equal(variant({ icitss: 'done' }, 'icitss-pending'), undefined);
    assert.equal(variant({ icitss: 'pending' }, 'icitss-done'), undefined);
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

test('own lines: the student\'s work, projects and simulations become lines to copy, in CV order, first under "Add these lines"', () => {
    const r = RL.recommend(answers({
        rank: ['skills', 'academics', 'work', 'projects', 'roles'],
        work: ['tuition', 'ca-firm'], projects: ['model', 'annual-report', 'work-simulation', 'job-simulation'], domain: 'gst'
    }), data());
    assert.equal(r.situation, 'F');
    assert.deepEqual(r.ownLines.map(c => c.block), ['experience', 'projects', 'certifications'], 'work ranked above projects');
    assert.deepEqual(r.ownLines.map(c => c.block), r.order.filter(id => ['experience', 'projects', 'certifications'].includes(id)), 'the order the blocks sit on the CV');
    const by = Object.fromEntries(r.ownLines.map(c => [c.block, c]));
    assert.deepEqual(by.experience.lines, [SITUATIONS.answerExamples.work['ca-firm'], SITUATIONS.answerExamples.work.tuition], 'every work tapped, strongest first');
    assert.deepEqual(by.projects.lines, [SITUATIONS.answerExamples.projects.model, SITUATIONS.answerExamples.projects['annual-report']]);
    assert.deepEqual(by.certifications.lines, [SITUATIONS.workSimulation.gst, SITUATIONS.answerExamples.certifications['job-simulation']]);
    assert.equal(by.experience.label, 'Your work experience');
    assert.equal(by.certifications.label, 'Your simulations');
    assert.match(by.certifications.note, /never in Experience/);
    // "Not sure yet": the Work Simulation line shown is statutory audit's, so it is labelled an example.
    const unsure = RL.recommend(answers({ rank: ['projects', 'academics', 'work', 'roles', 'skills'], projects: ['work-simulation'], domain: 'unsure' }), data());
    const sims = unsure.ownLines.find(c => c.block === 'certifications');
    assert.equal(sims.label, 'Your simulations (example)');
    assert.match(sims.note, /^This is the Statutory audit Work Simulation line, as an example\. Copy the line your own level gave you/);
    assert.doesNotMatch(sims.note, /\{domain\}/);
    r.ownLines.forEach(c => assert.equal(r.blocks.find(b => b.id === c.block).example, c.lines[0], c.block + ': the CV picture shows the first of them'));
    assert.deepEqual(r.blocks.filter(b => b.own).map(b => b.id).sort(), ['certifications', 'experience', 'projects']);
    const none = R.recommend(answers(), data());
    assert.deepEqual(none.ownLines, [], 'nothing tapped: no own lines');
    assert.ok(!none.blocks.some(b => b.own), 'the four-certificates sample is not the student\'s own line');
    const job = R.recommend(answers({ rank: ['projects', 'academics', 'work', 'roles', 'skills'], projects: ['job-simulation'] }), data());
    assert.deepEqual(job.ownLines.map(c => c.lines), [[SITUATIONS.answerExamples.certifications['job-simulation']]], 'a job simulation alone: its line only');
});

// ---------- Thin proof, domain, links ----------

test('thin proof: one piece or none (A only when none); The Nothing CV now, a Work Simulation level once it is out', () => {
    const roles = { rank: ['roles', 'academics', 'work', 'projects', 'skills'], work: ['tuition'] };
    const one = R.recommend(answers(roles), data());
    assert.equal(one.thinProof.text, 'Add the four quick certificates, then one more true line.');
    assert.deepEqual(one.thinProof.links.map(l => l.label), ['The Nothing CV', 'Earn one more line']);
    assert.match(one.thinProof.links[0].href, /resource=The\+Nothing\+CV&page=4$/, 'The Nothing CV p4: the four certificates');
    assert.match(one.thinProof.links[1].href, /resource=The\+Nothing\+CV&page=5$/, 'The Nothing CV p5: one more true line');
    assert.equal(R.recommend(answers({ work: ['tuition'] }), data()).thinProof, null, 'A with one piece of proof is fine');
    assert.ok(R.recommend(answers(), data()).thinProof, 'A with nothing at all still gets the pointer');

    const oneLive = RL.recommend(answers(roles), data());
    assert.equal(oneLive.thinProof.text, 'Add one Work Simulation level and the four quick certificates.');
    assert.deepEqual(oneLive.thinProof.links.map(l => l.label), ['Work Simulation', 'The Nothing CV']);
    const hasWs = RL.recommend(answers({ rank: ['projects', 'academics', 'work', 'roles', 'skills'], projects: ['work-simulation'] }), data());
    assert.equal(hasWs.thinProof.text, 'Add the four quick certificates.');
    assert.deepEqual(hasWs.thinProof.links.map(l => l.label), ['The Nothing CV'], 'no Work Simulation link when a level is done');
});

test('release 1: no Work Simulation tap, link, line or promise in any result or on the page', async () => {
    assert.equal(R.WORK_SIMULATION_LIVE, false, 'release 1 ships without the Work Simulation');
    assert.equal(R.workSimulationLive, false);
    assert.equal(RL.workSimulationLive, true);
    assert.ok(!R.QUESTIONS.find(q => q.id === 'projects').options.some(o => o.id === 'work-simulation'), 'no "Work Simulation level" tap');
    assert.ok(RL.QUESTIONS.find(q => q.id === 'projects').options.some(o => o.id === 'work-simulation'), 'it comes back with the flag');
    assert.deepEqual(R.cleanAnswers(answers({ projects: ['work-simulation'] })).projects, [], 'a stray answer is dropped');
    const ranks = [['academics', 'work', 'projects', 'roles', 'skills'], ['work', 'academics', 'projects', 'roles', 'skills'],
        ['projects', 'academics', 'work', 'roles', 'skills'], ['roles', 'academics', 'work', 'projects', 'skills'], ['skills', 'academics', 'work', 'projects', 'roles']];
    const sets = [];
    ranks.forEach(rank => [['none'], ['tuition'], ['ca-firm', 'family']].forEach(work => [['none'], ['job-simulation'], ['model']].forEach(projects =>
        ['first', 'separate', 'both-awaited'].forEach(inter => ['statutory-audit', 'unsure'].forEach(domain =>
            ['completed', 'direct-entry'].forEach(graduation => sets.push(answers({ rank, work, projects, inter, domain, graduation }))))))));
    const seen = new Set();
    sets.forEach(a => {
        const r = R.recommend(a, data());
        seen.add(r.situation);
        assert.doesNotMatch(JSON.stringify(r), /work simulation|work-simulation/i, r.situation + ': nothing points at the Work Simulation');
    });
    assert.deepEqual([...seen].sort(), R.SITUATION_CODES.slice(), 'every situation was checked');
    // The page too, on the result and on every question.
    const p = page();
    const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false });
    store.set({ answers: answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'] }), step: 8, done: true });
    const ui = R.mount(p.app, Object.assign({ data: data(), store, progress: fakeProgress() }, FAST));
    assert.match(p.app.textContent, /Start with The Nothing CV/);
    assert.doesNotMatch(p.app.textContent, /Work Simulation/);
    for (let step = 0; step < R.QUESTIONS.length; step++) {
        ui.go(step);
        assert.doesNotMatch(p.app.textContent, /Work Simulation/, 'question ' + (step + 1));
    }
});

test('links: once the Work Simulation is out it opens on my domain (its page, else its Day 1 row); every page linked exists in this repo', () => {
    const rank = ['work', 'academics', 'projects', 'roles', 'skills'];
    const h = RL.recommend(answers({ rank }), data());
    const ws = SITUATIONS.links.workSimulation;
    if (ws) assert.equal(h.thinProof.links[0].href, ws + '?domain=statutory-audit');
    else assert.equal(h.thinProof.links[0].href, '/learning-management-system/course?course=msc-articleship-program&session=2&resource=Work+Simulation');
    if (!ws) assert.ok(!fs.existsSync(path.join(ROOT, 'articleship-program/work-simulation/index.html')),
        'the Work Simulation page is on the branch now: set links.workSimulation to /articleship-program/work-simulation/ and WORK_SIMULATION_LIVE to true');
    const wired = data();
    wired.links.workSimulation = '/articleship-program/work-simulation/';
    assert.equal(RL.recommend(answers({ rank, domain: 'gst' }), wired).thinProof.links[0].href, '/articleship-program/work-simulation/?domain=gst',
        'the student\'s own domain opens');
    assert.equal(RL.recommend(answers({ rank, domain: 'unsure' }), wired).thinProof.links[0].href, '/articleship-program/work-simulation/', 'no domain yet: the page itself');
    wired.links.workSimulation = '/articleship-program/work-simulation/?from=cv';
    assert.equal(RL.recommend(answers({ rank, domain: 'ma-tax' }), wired).thinProof.links[0].href, '/articleship-program/work-simulation/?from=cv&domain=ma-tax');
    assert.equal(R.recommend(answers({ rank }), wired).thinProof.links.some(l => /work-simulation/.test(l.href)), false, 'never in release 1, even when wired');
});

// A page another tool owns may not be ported to this branch yet: the test then skips and names it (its link would
// dead-end here until that tool is ported), rather than passing quietly.
const missingPages = Object.values(SITUATIONS.links).filter(Boolean).filter(href => !fs.existsSync(path.join(ROOT, href, 'index.html')));
test('links: every page this tool links to is on this branch', { skip: missingPages.length > 0 && 'not on this branch yet: ' + missingPages.join(', ') }, () => {
    for (const href of Object.values(SITUATIONS.links).filter(Boolean)) {
        assert.ok(fs.existsSync(path.join(ROOT, href, 'index.html')), href + ' is a page on this branch');
    }
});

test('links: every PDF this tool opens is a Day 1 row of the v3 course, so "See this order" never misses', { skip: NOT_HERE.lmsSql }, () => {
    const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/202610200002_articleship_program_v3_lms.sql'), 'utf8');
    const rows = JSON.parse(sql.match(/json_populate_recordset\(NULL::public\.videos, '([\s\S]*?)'::json\)/)[1].replaceAll("''", "'"));
    const day1 = rows.find(row => row.video_number === SITUATIONS.day + 1);
    for (const key of ['choose', 'nothing', 'templates']) {
        const title = SITUATIONS.resources[key];
        const row = day1.resources.find(item => item.title === title);
        assert.ok(row, title + ' is a row of session ' + (SITUATIONS.day + 1));
        assert.match(String(row.view_storage_path), /^articleship-program-v\d+\/day-1\/.+\.pdf$/i, title + ' opens as a programme PDF');
    }
    assert.ok(day1.resources.some(item => item.title === SITUATIONS.resources.workSimulation), 'Work Simulation is a Day 1 row');
    assert.ok(day1.resources.some(item => item.title === 'CV Builder'), '"Next" points at the Day that holds the CV Builder');
    const day5 = rows.find(row => row.video_number === SITUATIONS.unsure.day + 1);
    assert.ok(day5.resources.some(item => item.title === SITUATIONS.unsure.row), 'Domain roadmaps is a Day 5 row');
});

test('domain: a pick is passed on; "Not sure yet" sends no domain and shows the one answer', () => {
    const sure = R.recommend(answers({ domain: 'gst' }), data());
    assert.equal(sure.domain, 'gst');
    assert.equal(sure.unsure, null);
    const unsure = R.recommend(answers({ domain: 'unsure' }), data());
    assert.equal(unsure.domain, null);
    assert.match(unsure.unsure.text, /statutory audit and some tax/);
    assert.deepEqual(unsure.unsure.link, { label: 'Domain roadmaps', href: '/articleship-program/domain-roadmaps/' });
    const noPage = data();
    noPage.links.domainRoadmaps = null;
    assert.equal(R.recommend(answers({ domain: 'unsure' }), noPage).unsure.link.href,
        '/learning-management-system/course?course=msc-articleship-program&session=6&resource=Domain+roadmaps', 'without the page: its own Day 5 row');
});

// ---------- Designs ----------

test('designs: one list for both tools (the CV Builder\'s), no second copy here', { skip: NOT_HERE.builderStage }, () => {
    assert.ok(!fs.existsSync(path.join(TOOL_DIR, 'designs.json')), 'no local copy of the design list');
    const page = fs.readFileSync(path.join(TOOL_DIR, 'index.html'), 'utf8');
    assert.match(page, /getJson\(MSCCvRecommender\.DESIGNS_URL\)/);
    assert.equal(R.DESIGNS_URL, '/articleship-program/cv-builder/designs.json');
    assert.ok(fs.existsSync(path.join(ROOT, R.DESIGNS_URL)), 'the CV Builder\'s design list is on this branch');
    const stage = fs.readFileSync(path.join(ROOT, 'articleship-program/cv-builder/stage.js'), 'utf8');
    const base = stage.match(/BASE\s*=\s*'([^']+)'/);
    assert.ok(base && stage.includes("BASE + 'designs.json'"), 'the CV Builder reads designs.json from its folder');
    assert.equal(base[1] + 'designs.json', R.DESIGNS_URL, 'both tools read the same file');

    const list = R.normaliseDesigns(DESIGNS);
    const raw = (DESIGNS.designs || DESIGNS).filter(d => d && d.name);
    assert.equal(list.length, raw.length, 'every design is read');
    assert.deepEqual(list.map(d => [d.number, d.name, d.tag]), raw.map(d => [Number(d.number), d.name, d.tag]).sort((x, y) => x[0] - y[0]),
        'number, name and tag exactly as the CV Builder shows them');
    assert.deepEqual(list.map(d => d.number), list.map((d, i) => i + 1), 'numbered 1… as in the look-book');
    list.forEach(d => assert.ok(['Print', 'Portal-safe', 'Screen'].includes(d.tag), d.name + ' tag'));
    ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(code => assert.ok(list.some(d => d.bestFor.includes(code)), code + ' has a design made for it'));
    assert.ok(list.some(d => d.portalSafe && /portal plain/i.test(d.name)), 'one Portal plain design for portals');
    R.SITUATION_CODES.forEach(code => {
        const pick = R.toCvPick(R.recommend(answers(code === 'G' ? { graduation: 'direct-entry' } : {}), data()));
        assert.ok(list.some(d => d.number === pick.design), 'the saved design number exists in the CV Builder');
    });
});

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
    assert.equal(none.builder, false, 'no design list → no "the CV Builder opens with this" promise');
    assert.equal(R.toCvPick(none).design, null);
    assert.equal(R.recommend(answers(), data()).builder, ON_BRANCH.designs);
    sameDesign(R.recommend(answers({ course: 'cma', rank: ['skills', 'academics', 'work', 'projects', 'roles'], work: ['tuition'] }), data()),
        designFor('F', ['cs-cma']), 'the situation still decides when a design is made for it');
});

test('designs: a variant\'s own design (CA with CS or CMA) is offered as a second line when the situation\'s design wins', { skip: NOT_HERE.designs }, () => {
    const csCma = DESIGN_LIST.filter(d => d.bestFor.includes('cs-cma'));
    assert.ok(csCma.length, 'designs.json names a design for CA with CS or CMA');
    for (const course of ['cs', 'cma']) {
        const r = R.recommend(answers({ course, work: ['tuition'] }), data());
        assert.equal(r.design.number, designFor('A', ['cs-cma']).number, 'the situation\'s design still leads');
        assert.ok(r.also, course + ': a second line');
        assert.equal(r.also.design.number, csCma[0].number);
        assert.equal(r.also.text, 'CA with ' + course.toUpperCase() + '? No. ' + csCma[0].number + ' ' + csCma[0].name + ' fits it too.');
        assert.match(r.also.href, new RegExp('resource=CV\\+templates&page=' + csCma[0].page + '$'), 'its look-book page');
    }
    assert.equal(R.recommend(answers({ course: 'none' }), data()).also, null, 'no course alongside: no second line');
    assert.equal(R.recommend(answers({ course: 'cfa' }), data()).also, null);
    const own = R.normaliseDesigns([{ number: 1, name: 'One', bestFor: ['A', 'cs-cma'] }, { number: 2, name: 'Two', bestFor: ['cs-cma'] }]);
    assert.equal(R.variantDesign(own, ['cs-cma'], own[0]), null, 'nothing to add when the suggested design is made for it');
    const none = R.recommend(answers(), data({ designs: [] }));
    assert.equal(none.also, null);
    assert.equal(none.next.text, 'Next: pick a design in CV templates, then open the CV Builder in {link}.', 'no design list: no design named');
});

test('data: the 13 Work Simulation lines are Domain roadmaps\' cv_line, word for word (CV lines carry no closing full stop)', { skip: NOT_HERE.roadmaps }, () => {
    const file = path.join(ROOT, 'articleship-program/domain-roadmaps/roadmaps.json');
    assert.ok(fs.existsSync(file), 'Domain roadmaps is on this branch');
    const roadmaps = JSON.parse(fs.readFileSync(file, 'utf8'));
    const cards = Array.isArray(roadmaps.domains) ? roadmaps.domains : [];
    assert.deepEqual(cards.map(c => c.slug).sort(), Object.keys(SITUATIONS.workSimulation).sort(), 'one line per domain card');
    cards.forEach(card => assert.equal(SITUATIONS.workSimulation[card.slug], String(card.cv_line).replace(/\.$/, ''),
        card.slug + ': change both files together (situations.json workSimulation and roadmaps.json cv_line)'));
    assert.deepEqual(Object.keys(SITUATIONS.workSimulation).sort(), P.DOMAINS.map(d => d.slug).sort());
});

// ---------- Saving the pick ----------

test('toCvPick: valid for the shared setting; saved for the CV Builder; my domain set', () => {
    const r = R.recommend(answers({ inter: 'separate', icitss: 'ongoing', domain: 'direct-tax', projects: ['job-simulation'] }), data());
    const pick = R.toCvPick(r);
    const b = ON_BRANCH.designs ? designFor('B').number : null;
    assert.deepEqual(pick, { situation: 'B', order: r.order, design: b, variants: ['groups-separately', 'icitss-ongoing'], domain: 'direct-tax', source: 'cv-recommender' });
    const progress = fakeProgress();
    const saved = progress.setCvPick(pick);
    assert.equal(saved.situation, 'B');
    assert.equal(progress.getCvPick().design, b);
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

test('answer chips: one short chip per question, each pointing at its step', () => {
    const chips = R.answerChips(answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], inter: 'separate', work: ['family', 'tuition'], domain: 'unsure' }));
    assert.deepEqual(chips.map(c => c.step), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(chips.map(c => c.text), ['Work done first', 'Groups in different sittings', 'Graduation completed', 'No gap', 'ICITSS done',
        'Family business books +1', 'No projects yet', 'No other course', 'Domain not decided']);
    assert.equal(R.answerChips(answers({ domain: 'gst' }))[8].text, 'GST');
});

// ---------- The page ----------

function page() {
    const dom = new JSDOM('<!doctype html><main id="main"><div id="hero"></div><div id="app"></div></main>', { url: 'http://127.0.0.1/articleship-program/cv-recommender/' });
    dom.window.scrollTo = () => {}; // jsdom has no layout
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
    R.mount(p.app, Object.assign({ data: data(), store, progress, heroEl: p.hero, mainEl: p.main }, FAST));
    assert.match(p.app.textContent, /1 of 9/);
    assert.match(p.app.textContent, /Rank your strengths/);
    ['Work done', 'Academics', 'Projects', 'Skills with proof'].forEach(label => click(p.doc, label));
    assert.equal(p.doc.querySelectorAll('.cvr-rank-item.is-ranked').length, 5, 'the fifth fills itself');
    click(p.doc, 'Next');
    assert.match(p.app.textContent, /2 of 9/);
    assert.ok(p.hero.classList.contains('ap-hidden'), 'the intro shows on the first step only');
    click(p.doc, 'Different sittings'); await sleep(100);
    click(p.doc, 'Distance or evening'); await sleep(100);
    click(p.doc, 'After Inter'); await sleep(100);
    click(p.doc, 'Ongoing'); await sleep(100);
    assert.match(p.app.textContent, /6 of 9/);
    click(p.doc, 'Family business books');
    click(p.doc, 'Next');
    click(p.doc, 'None yet');
    click(p.doc, 'Next');
    click(p.doc, 'CMA'); await sleep(100);
    click(p.doc, 'GST'); await sleep(100);

    assert.match(p.app.textContent, /Use the Work experience order/);
    assert.ok(p.main.classList.contains('is-wide'));
    const labels = [...p.doc.querySelectorAll('.cvr-block-label')].map(n => n.textContent);
    assert.deepEqual(labels, ['Name and contact', '3-line objective', 'Education + ICITSS row', 'Work experience', 'Certifications and job simulations', 'Skills', 'Roles and achievements', 'Interests'],
        'ranking work > academics > projects > skills > roles');
    assert.match(p.doc.querySelector('.cvr-block.is-lead').textContent, /Accounts, family business/, 'the example follows the work tapped');
    const cards = [...p.doc.querySelectorAll('.cvr-variant-label')].map(n => n.textContent);
    assert.deepEqual(cards, ['Your work experience', 'MSC Articleship Program', 'Groups in different sittings', 'ICITSS ongoing', 'Distance or evening B.Com', 'CA with CMA', 'A gap'],
        'the student\'s own line first');
    const seeIt = [...p.doc.querySelectorAll('a.ap-btn')].find(a => a.textContent === 'See this order');
    assert.equal(seeIt.getAttribute('href'), '/learning-management-system/course?course=msc-articleship-program&session=2&resource=Choose+your+CV&page=5');
    const pick = p.doc.querySelector('.cvr-pick');
    assert.equal(pick.previousElementSibling, null, 'the button and the design come first, straight under the reason');
    const c = designFor('C', ['cs-cma']);
    const next = pick.querySelector('.cvr-next');
    if (c) {
        assert.match(pick.textContent, new RegExp('No\\. ' + c.number + ' ' + c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
        assert.equal(next.textContent, 'Next: open the CV Builder in Day 1. It opens with this order; pick design No. ' + c.number + ' there.',
            'the Builder takes the order; the design is named, not promised');
    } else {
        assert.equal(next.textContent, 'Next: pick a design in CV templates, then open the CV Builder in Day 1.', 'no design list on this branch');
    }
    assert.equal(next.querySelector('a').textContent, 'Day 1');
    assert.equal(next.querySelector('a').getAttribute('href'), '/learning-management-system/course?course=msc-articleship-program&session=2&resource=CV+Builder',
        'the CV Builder\'s own row in Day 1, through the course');
    assert.doesNotMatch(p.app.textContent, /CV Builder row/, 'no course jargon');
    assert.match(p.app.textContent, /Thin on proof\?/);
    assert.ok(!/build/i.test([...p.doc.querySelectorAll('a, button')].map(n => n.textContent).join(' ')), 'no build button of its own');

    const pickSaved = progress.getCvPick();
    assert.equal(pickSaved.situation, 'C');
    assert.equal(pickSaved.design, c ? c.number : null);
    assert.deepEqual(pickSaved.variants, ['groups-separately', 'icitss-ongoing', 'distance', 'cs-cma', 'gap']);
    assert.equal(progress.getMyDomain(), 'gst');
    assert.equal(store.get().done, true);

    const again = page();
    R.mount(again.app, Object.assign({ data: data(), store: memoryStore('cv-recommender', { answers: null, step: 0, done: false }, storage), progress, heroEl: again.hero, mainEl: again.main }, FAST));
    assert.match(again.app.textContent, /Use the Work experience order/, 'reload opens on the saved result');
    assert.equal(store.get().done, true, 'the other store copy is untouched until it changes');
});

test('page: a line card shows its label and Copy; the line, note and "If asked" open on a tap', async () => {
    const p = page();
    const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false });
    store.set({ answers: answers({ gap: 'after-inter' }), step: 8, done: true });
    const copied = [];
    p.dom.window.navigator.clipboard = { writeText: text => { copied.push(text); return Promise.resolve(); } };
    R.mount(p.app, Object.assign({ data: data(), store, progress: fakeProgress() }, FAST));
    const gap = [...p.doc.querySelectorAll('.cvr-variant')].find(li => li.querySelector('.cvr-variant-label').textContent === 'A gap');
    const toggle = gap.querySelector('.cvr-variant-toggle');
    const body = gap.querySelector('.cvr-variant-body');
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    assert.equal(body.hidden, true, 'collapsed to its label and Copy');
    assert.equal(toggle.getAttribute('aria-controls'), body.id);
    toggle.dispatchEvent(new p.dom.window.MouseEvent('click', { bubbles: true }));
    assert.equal(body.hidden, false);
    assert.match(body.textContent, /If asked: \[Month Year\] to \[Month Year\]/);
    gap.querySelector('.cvr-copy').dispatchEvent(new p.dom.window.MouseEvent('click', { bubbles: true }));
    const msc = p.doc.querySelector('.cvr-variant.is-msc .cvr-copy');
    assert.equal(msc.getAttribute('aria-label'), 'Copy: MSC Articleship Program');
    msc.dispatchEvent(new p.dom.window.MouseEvent('click', { bubbles: true }));
    const later = p.doc.querySelector('.cvr-variant.is-msc .cvr-later .cvr-copy');
    assert.equal(later.getAttribute('aria-label'), 'Copy: MSC Articleship Program, once you finish the programme');
    later.dispatchEvent(new p.dom.window.MouseEvent('click', { bubbles: true }));
    await sleep(10);
    assert.deepEqual(copied, ['[Month Year]–[Month Year] | [What you did: family business accounts / a course / ICITSS]', MSC_ONGOING, MSC_LINE]);
});

test('page: tap an answer chip to change one question, then straight back to the result', async () => {
    const progress = fakeProgress();
    const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false });
    store.set({ answers: answers({ work: ['tuition'] }), step: 8, done: true });
    const p = page();
    R.mount(p.app, Object.assign({ data: data(), store, progress, heroEl: p.hero, mainEl: p.main }, FAST));
    assert.match(p.app.textContent, /Use the Academics order/);
    const chip = [...p.doc.querySelectorAll('.cvr-chip')].find(b => b.textContent === 'Statutory audit');
    assert.match(chip.getAttribute('aria-label'), /^Change: Your target domain/);
    chip.dispatchEvent(new p.dom.window.MouseEvent('click', { bubbles: true }));
    assert.match(p.app.textContent, /9 of 9/, 'opens the domain question itself, not question 1');
    assert.ok(p.hero.classList.contains('ap-hidden'));
    click(p.doc, 'Valuation'); await sleep(100);
    assert.match(p.app.textContent, /Use the Academics order/, 'one tap and the result is back');
    assert.equal(progress.getCvPick().domain, 'valuation');

    const inter = [...p.doc.querySelectorAll('.cvr-chip')].find(b => b.textContent === 'Both, first attempt');
    inter.dispatchEvent(new p.dom.window.MouseEvent('click', { bubbles: true }));
    assert.match(p.app.textContent, /2 of 9/);
    assert.ok([...p.doc.querySelectorAll('button')].some(b => b.textContent === 'Show my CV'), 'the main button returns to the result');
    click(p.doc, 'Different sittings'); await sleep(100);
    assert.match(p.app.textContent, /Show each result clearly/, 'B now');

    [...p.doc.querySelectorAll('.cvr-chip')].find(b => b.textContent === 'No gap').dispatchEvent(new p.dom.window.MouseEvent('click', { bubbles: true }));
    click(p.doc, 'After Foundation'); await sleep(100);
    assert.ok([...p.doc.querySelectorAll('.cvr-chip')].some(b => b.textContent === 'Gap after Foundation'));
    [...p.doc.querySelectorAll('.cvr-chip')].find(b => b.textContent === 'Graduation completed').dispatchEvent(new p.dom.window.MouseEvent('click', { bubbles: true }));
    click(p.doc, 'Direct entry'); await sleep(100);
    assert.match(p.app.textContent, /4 of 9/, 'a now-hidden gap answer is asked again before the result');
    assert.ok(![...p.doc.querySelectorAll('.cvr-opt')].some(b => /After Foundation/.test(b.textContent)), 'and not offered');
    click(p.doc, 'A year out'); await sleep(100);
    assert.match(p.app.textContent, /Use the Direct entry order/);
});

test('page: the screen reader hears each step once; the card is not a live region; tap targets are 44 px in the CSS', () => {
    const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false });
    const p = page();
    const ui = R.mount(p.app, Object.assign({ data: data(), store, progress: fakeProgress() }, FAST));
    assert.equal(p.doc.querySelectorAll('[aria-live]').length, 1);
    const live = p.doc.querySelector('[aria-live]');
    assert.ok(!live.closest('.cvr-card'), 'the live region sits outside the re-drawn card');
    ['Work done', 'Academics', 'Projects', 'Skills with proof'].forEach(label => click(p.doc, label));
    click(p.doc, 'Next');
    assert.equal(live.textContent, 'Question 2 of 9: How did you clear Inter?');
    assert.equal(p.doc.querySelectorAll('[aria-live]').length, 1);
    assert.equal(ui.state().step, 1);
    const css = fs.readFileSync(path.join(TOOL_DIR, 'cv-recommender.css'), 'utf8');
    for (const selector of ['.cvr-reset', '.cvr-copy', '.cvr-chip', '.cvr-design-link', '.cvr-more', '.cvr-note-links .ap-link', '.cvr-also-link']) {
        const rule = css.match(new RegExp('(?:^|\\n)' + selector.replace(/\./g, '\\.') + '\\s*\\{([^}]*)\\}'));
        assert.ok(rule && /min-height:\s*44px/.test(rule[1]), selector + ' is at least 44 px tall');
    }
    // The note links sit on their own row, so their 44 px never stretches a line of the note's text.
    assert.match(css, /\.cvr-note-links \{[^}]*display: flex;[^}]*margin-top: 4px;/);
    // The inline link in the Next line: 20 px of text plus 12 px above and below.
    assert.match(css, /\.cvr-next \.ap-link \{[^}]*padding: 12px 0;[^}]*margin: -12px 0;/);
});

test('page: on a phone the student\'s own lines always show; the rest open with one tap; from 900 px and in print every line shows', async () => {
    const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false });
    store.set({ answers: answers({ rank: ['skills', 'academics', 'roles', 'projects', 'work'], work: ['tuition'], projects: ['work-simulation'], domain: 'gst' }), step: 8, done: true });
    const copied = [];
    const p = page();
    p.dom.window.navigator.clipboard = { writeText: text => { copied.push(text); return Promise.resolve(); } };
    RL.mount(p.app, Object.assign({ data: data(), store, progress: fakeProgress() }, FAST));
    const block = label => [...p.doc.querySelectorAll('.cvr-block')].find(li => li.querySelector('.cvr-block-label').textContent === label);
    const work = block('Work experience');
    const sims = block('Certifications and job simulations');
    assert.ok(work.classList.contains('is-own') && !work.classList.contains('is-brief'), 'the tuition line shows without a tap');
    assert.match(work.textContent, /Tutor, Class XI–XII Accountancy/);
    assert.ok(sims.classList.contains('is-own') && !sims.classList.contains('is-brief'), 'the GST Work Simulation line shows without a tap');
    assert.match(sims.textContent, /^.*GST Work Simulation, MSC Articleship Program/);
    const brief = [...p.doc.querySelectorAll('.cvr-block.is-brief')].map(li => li.querySelector('.cvr-block-label').textContent);
    assert.deepEqual(brief, ['Roles and achievements', 'Interests'], 'only sample lines wait behind the tap');
    const more = p.doc.querySelector('.cvr-more');
    assert.equal(more.getAttribute('aria-controls'), p.doc.querySelector('.cvr-blocks').id);
    more.dispatchEvent(new p.dom.window.MouseEvent('click', { bubbles: true }));
    assert.ok(p.doc.querySelector('.cvr-paper').classList.contains('is-open'));
    assert.equal(more.getAttribute('aria-expanded'), 'true');

    const own = [...p.doc.querySelectorAll('.cvr-variant.is-own')];
    assert.deepEqual(own.map(li => li.querySelector('.cvr-variant-label').textContent), ['Your simulations', 'Your work experience']);
    own.forEach(li => {
        assert.equal(li.querySelector('.cvr-variant-toggle').getAttribute('aria-expanded'), 'true', 'the student\'s own lines open at once');
        assert.equal(li.querySelector('.cvr-variant-body').hidden, false);
    });
    const others = [...p.doc.querySelectorAll('.cvr-variant:not(.is-own)')];
    assert.ok(others.length > 0);
    others.forEach(li => {
        const peek = li.querySelector('.cvr-variant-peek');
        assert.ok(peek && peek.textContent.length > 5, 'a closed card shows the start of its line');
        assert.ok(li.querySelector('.cvr-variant-body .cvr-line').textContent.startsWith(peek.textContent), 'the same line Copy copies');
    });
    own[0].querySelector('.cvr-copy').dispatchEvent(new p.dom.window.MouseEvent('click', { bubbles: true }));
    await sleep(10);
    assert.deepEqual(copied, [SITUATIONS.workSimulation.gst]);

    // The phone-only hide rules live inside a screen, below-900 px block, so a laptop (and a print) never hides a line.
    const css = fs.readFileSync(path.join(TOOL_DIR, 'cv-recommender.css'), 'utf8');
    const hides = css.match(/[^{}\n]*\.is-brief[^{}]*\{[^}]*display:\s*none[^}]*\}/g) || [];
    assert.equal(hides.length, 2, 'two hide rules: the example line and the short grey line');
    const phone = css.match(/@media screen and \(max-width: 899px\) \{([\s\S]*?)\n\}/);
    assert.ok(phone, 'a phone-only block');
    hides.forEach(rule => assert.ok(phone[1].includes(rule.trim()), 'phone only: ' + rule.trim()));
    assert.match(css, /@media \(min-width: 900px\) \{[\s\S]*?\.cvr-more \{ display: none; \}/, 'no toggle where every line already shows');
    assert.doesNotMatch(css, /\.is-header \.cvr-block-label \{[^}]*text-transform:\s*none/, '"Name and contact" in capitals like every block label');
});

test('page: answers synced from the account show up while untouched; ignored once the student taps', () => {
    const storage = memoryStorage();
    const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false }, storage);
    const p = page();
    R.mount(p.app, Object.assign({ data: data(), store, progress: fakeProgress() }, FAST));
    assert.match(p.app.textContent, /1 of 9/);
    // Another tab (or the account pull) saved a finished result.
    const other = memoryStore('cv-recommender', { answers: null, step: 0, done: false }, storage);
    other.set({ answers: answers({ rank: ['roles', 'academics', 'work', 'projects', 'skills'], work: ['tuition'] }), step: 8, done: true });
    store._onStorageEvent({ key: store.key, newValue: storage.getItem(store.key) });
    assert.match(p.app.textContent, /Use the Extra-curriculars order/, 'the synced result replaces the empty quiz');

    const q = page();
    const store2 = memoryStore('cv-recommender', { answers: null, step: 0, done: false }, memoryStorage());
    R.mount(q.app, Object.assign({ data: data(), store: store2, progress: fakeProgress() }, FAST));
    click(q.doc, 'Academics');
    const before = q.app.textContent;
    store2._onStorageEvent({ key: store2.key, newValue: JSON.stringify({ v: 1, data: { answers: answers(), step: 8, done: true }, updatedAt: Date.now() }) });
    assert.equal(q.app.textContent, before, 'a remote change never overwrites taps in progress');
});

test('page: "my domain" from another tool is pre-selected; text is never parsed as HTML', async () => {
    const progress = fakeProgress();
    progress.setMyDomain('valuation');
    const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false });
    const evil = data();
    evil.situations.A.reason = '<img src=x onerror=alert(1)>';
    store.set({ answers: answers({ domain: null }), step: 8, done: false });
    const p = page();
    R.mount(p.app, Object.assign({ data: evil, store, progress }, FAST));
    assert.match(p.app.textContent, /9 of 9/);
    const on = p.doc.querySelector('.cvr-opt.is-on');
    assert.equal(on.textContent, 'Valuation');
    click(p.doc, 'Show my CV');
    assert.equal(p.doc.querySelector('img'), null);
    assert.match(p.app.textContent, /<img src=x/);
});

test('page: "my domain" changed in another tool after this result wins on reload; an old answer never overwrites it', () => {
    const storage = memoryStorage();
    const progress = fakeProgress();
    const open = () => {
        const p = page();
        const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false }, storage);
        return { p, store, ui: R.mount(p.app, Object.assign({ data: data(), store, progress }, FAST)) };
    };
    const chip = (v, text) => [...v.p.doc.querySelectorAll('.cvr-chip')].find(b => b.textContent === text)
        .dispatchEvent(new v.p.dom.window.MouseEvent('click', { bubbles: true }));
    // Finished here with GST, tapped in this visit: GST becomes my domain.
    memoryStore('cv-recommender', { answers: null, step: 0, done: false }, storage).set({ answers: answers({ domain: null }), step: 8, done: false });
    let v = open();
    click(v.p.doc, 'GST');
    v.ui.finish();
    assert.equal(progress.getMyDomain(), 'gst');
    assert.equal(progress.getCvPick().domain, 'gst');
    // Later, Domain roadmaps sets valuation. On reload the result follows it, and the pick is saved again.
    progress.setMyDomain('valuation');
    v = open();
    assert.match(v.p.app.textContent, /Use the Academics order/);
    assert.ok([...v.p.doc.querySelectorAll('.cvr-chip')].some(b => b.textContent === 'Valuation'), 'the domain chip shows the newer choice');
    assert.equal(v.store.get().answers.domain, 'valuation');
    assert.equal(progress.getCvPick().domain, 'valuation', 'the CV Builder\'s pick follows');
    // Editing another chip (not the domain) leaves my domain alone.
    chip(v, 'ICITSS done');
    click(v.p.doc, 'Ongoing');
    v.ui.finish();
    assert.equal(progress.getMyDomain(), 'valuation');
    // "Not sure yet" chosen here while my domain is set stays "Not sure yet" on reload, and never clears my domain.
    chip(v, 'Valuation');
    click(v.p.doc, 'Not sure yet');
    v.ui.finish();
    assert.equal(progress.getMyDomain(), 'valuation');
    v = open();
    assert.ok([...v.p.doc.querySelectorAll('.cvr-chip')].some(b => b.textContent === 'Domain not decided'));
    // Older saves (no record of my domain at the time): the shared setting is the newer one.
    memoryStore('cv-recommender', { answers: null, step: 0, done: false }, storage).set({ answers: answers({ domain: 'gst' }), step: 8, done: true });
    v = open();
    assert.equal(v.store.get().answers.domain, 'valuation');
});

test('page: a reload saves the pick again when today\'s designs give a different one; an unchanged pick is left alone', () => {
    const progress = fakeProgress();
    const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false });
    store.set({ answers: answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], work: ['family'] }), step: 8, done: true });
    progress.setCvPick({ situation: 'C', order: ['header', 'summary', 'education', 'experience'], design: 99, variants: [], domain: 'statutory-audit' });
    R.mount(page().app, Object.assign({ data: data(), store, progress }, FAST));
    const saved = progress.getCvPick();
    assert.equal(saved.design, ON_BRANCH.designs ? designFor('C').number : null, 'the design shown is the design saved');
    assert.deepEqual(saved.order, R.recommend(store.get().answers, data()).order);
    const before = progress.settings.get().cvPick.savedAt;
    R.mount(page().app, Object.assign({ data: data(), store, progress }, FAST));
    assert.equal(progress.settings.get().cvPick.savedAt, before, 'not written again');
});

test('page: a single tap moves on after 280 ms; a quick double tap never answers the next question', async () => {
    assert.equal(R.ADVANCE_MS, 280);
    assert.equal(R.TAP_GUARD_MS, 250);
    const store = memoryStore('cv-recommender', { answers: null, step: 0, done: false });
    store.set({ answers: answers({ inter: null, graduation: null, gap: null, icitss: null }), step: 1, done: false });
    const p = page();
    R.mount(p.app, { data: data(), store, progress: fakeProgress() });
    assert.match(p.app.textContent, /2 of 9/);
    // "Both, first attempt" and "Pursuing, regular" sit in the same place on screen.
    click(p.doc, 'Both, first attempt');
    await sleep(150);
    assert.match(p.app.textContent, /2 of 9/, 'still showing the tick');
    await sleep(250);
    assert.match(p.app.textContent, /3 of 9/);
    click(p.doc, 'Pursuing, regular');
    assert.equal(store.get().answers.graduation, null, 'the second half of the double tap is ignored');
    await sleep(300);
    click(p.doc, 'Pursuing, regular');
    assert.equal(store.get().answers.graduation, 'regular', 'a real tap a moment later counts');
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
