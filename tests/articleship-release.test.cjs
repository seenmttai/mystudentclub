// MSC Articleship Program: the release switch. Release 1 ships every row except row 1.6, the Work Simulation (Padam's
// release plan, 20 Oct 2026); release 2 brings it back. One flag in the shared platform script
// (MSCArticleshipProgress.WORK_SIMULATION_LIVE) drives every tool that mentions or links the Work Simulation.
// These tests check: the one flag and who reads it, the shared text rules, release 1 (nothing shown, nothing broken)
// and release 2 (the flag flipped in a copy of the scripts: everything back).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const P = require('../scripts/articleship-progress.js');

const ROOT = path.join(__dirname, '..');
const SCRIPTS = path.join(ROOT, 'scripts');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const WS = /work[\s-]?simulation/i;
const FLAG_LINE = /^ {4}const WORK_SIMULATION_LIVE = (true|false);$/m;

// The tools that mention or link the Work Simulation, their scripts and their content.
const TOOLS = Object.freeze({
    recommender: 'articleship-cv-recommender.js',
    roadmaps: 'articleship-domain-roadmaps.js',
    builder: 'articleship-cv-builder.js',
    tracker: 'articleship-interview-tracker.js',
    interview: 'articleship-interview.js',
    checklist: 'articleship-cv-checklist.js',
    linkedin: 'articleship-linkedin-checklist.js'
});
const CONTENT = {
    situations: readJson('articleship-program/cv-recommender/situations.json'),
    roadmaps: readJson('articleship-program/domain-roadmaps/roadmaps.json'),
    examples: readJson('articleship-program/cv-builder/examples.json'),
    syllabus: readJson('articleship-program/interview-tracker/syllabus.json'),
    interview: readJson('articleship-program/ai-interview/articleship-interview.json'),
    checklist: readJson('articleship-program/cv-checklist/cv-checklist.json')
};

const TEMP_DIRS = [];
after(() => TEMP_DIRS.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

/** The scripts as shipped, or a copy with the one flag set to `live` (what release 2 does to the one line). */
function loadScripts(live) {
    if (live === undefined) {
        return Object.fromEntries(Object.entries(TOOLS).map(([key, file]) => [key, require(path.join(SCRIPTS, file))]));
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'msc-release-'));
    TEMP_DIRS.push(dir);
    for (const file of fs.readdirSync(SCRIPTS).filter(name => /^articleship-.*\.js$/.test(name))) {
        let source = fs.readFileSync(path.join(SCRIPTS, file), 'utf8');
        if (file === 'articleship-progress.js') source = source.replace(FLAG_LINE, `    const WORK_SIMULATION_LIVE = ${live};`);
        fs.writeFileSync(path.join(dir, file), source);
    }
    const loaded = Object.fromEntries(Object.entries(TOOLS).map(([key, file]) => [key, require(path.join(dir, file))]));
    loaded.progress = require(path.join(dir, 'articleship-progress.js'));
    return loaded;
}

const SHIPPED = loadScripts();
const RELEASE_1 = loadScripts(false);
const RELEASE_2 = loadScripts(true);

// ---------- the one flag ----------

test('one flag: WORK_SIMULATION_LIVE lives once, in the shared platform script, and release 1 ships it false', () => {
    const source = fs.readFileSync(path.join(SCRIPTS, 'articleship-progress.js'), 'utf8');
    assert.equal((source.match(new RegExp(FLAG_LINE.source, 'gm')) || []).length, 1, 'one line to flip');
    assert.equal(P.WORK_SIMULATION_LIVE, false,
        'release 1 ships without the Work Simulation (row 1.6). Release 2: set it to true here, wire links.workSimulation, update this line');
    assert.equal(P.workSimulationLive(), P.WORK_SIMULATION_LIVE);
    assert.equal(P.workSimulationLive(true), true);
    assert.equal(P.workSimulationLive(false), false);
    assert.equal(RELEASE_2.progress.WORK_SIMULATION_LIVE, true, 'the flip test really flips it');
});

test('one flag: no tool keeps its own; every tool that names the Work Simulation reads the shared one', () => {
    const files = [];
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(js|html)$/.test(entry.name)) files.push(full);
    });
    walk(SCRIPTS);
    walk(path.join(ROOT, 'articleship-program'));
    const own = files.filter(file => !file.endsWith('articleship-progress.js'))
        .filter(file => /WORK_SIMULATION_LIVE\s*=\s*(true|false)\b/.test(fs.readFileSync(file, 'utf8')))
        .map(file => path.relative(ROOT, file));
    assert.deepEqual(own, [], 'read MSCArticleshipProgress.WORK_SIMULATION_LIVE instead of a flag of your own');
    for (const [key, tool] of Object.entries(SHIPPED)) {
        if (key === 'linkedin' && !('WORK_SIMULATION_LIVE' in tool)) continue; // its release build is not committed yet
        assert.equal(tool.WORK_SIMULATION_LIVE, P.WORK_SIMULATION_LIVE, key + ' reads the shared flag');
        assert.equal(RELEASE_1[key].WORK_SIMULATION_LIVE, false, key + ' follows the flag (off)');
        assert.equal(RELEASE_2[key].WORK_SIMULATION_LIVE, true, key + ' follows the flag (on)');
    }
    const stage = fs.readFileSync(path.join(ROOT, 'articleship-program/cv-builder/stage.js'), 'utf8');
    assert.match(stage, /progress\.WORK_SIMULATION_LIVE === true/, 'the CV Builder stage reads the shared flag');
});

test('one flag: every page with such a tool loads the platform script before the tool, so the browser reads it', () => {
    const pages = {
        'articleship-program/cv-recommender/index.html': 'articleship-cv-recommender.js',
        'articleship-program/domain-roadmaps/index.html': 'articleship-domain-roadmaps.js',
        'articleship-program/cv-checklist/index.html': 'articleship-cv-checklist.js',
        'articleship-program/interview-tracker/index.html': 'articleship-interview-tracker.js',
        'articleship-program/linkedin-checklist/index.html': 'articleship-linkedin-checklist.js',
        'ai-interview.html': 'articleship-interview.js',
        'cv-builder/index.html': 'articleship-cv-builder.js'
    };
    for (const [page, tool] of Object.entries(pages)) {
        const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
        const platform = html.search(/<script[^>]+src="\/scripts\/articleship-progress\.js[^"]*"/);
        const own = html.search(new RegExp(`<script[^>]+src="/scripts/${tool.replace(/\./g, '\\.')}[^"]*"`));
        assert.ok(platform !== -1 && own !== -1, page + ' loads both');
        assert.ok(platform < own, page + ': the platform script first');
    }
    const builder = fs.readFileSync(path.join(ROOT, 'cv-builder/index.html'), 'utf8');
    assert.ok(builder.search(/articleship-progress\.js/) < builder.search(/articleship-program\/cv-builder\/stage\.js/), 'and before the stage');
});

// ---------- the shared text rules ----------

test('releaseText: release 1 drops the sentence, clause or list item that names it; release 2 changes nothing', () => {
    const cases = [
        ['One practical skill they can prove (Excel, a job simulation, a Work Simulation level, a project): the hook',
            'One practical skill they can prove (Excel, a job simulation, a project): the hook'],
        ['Skills they can show: Excel, a job simulation, a Work Simulation level, a short course, a model',
            'Skills they can show: Excel, a job simulation, a short course, a model'],
        ['Each line is a question: what you did, how many, what you found, what you learnt. Work Simulation lines too.',
            'Each line is a question: what you did, how many, what you found, what you learnt.'],
        ['Every job simulation and Work Simulation level on your CV: be ready to talk about each task for two minutes.',
            'Every job simulation on your CV: be ready to talk about each task for two minutes.'],
        ['Vouched 20 purchase bills in MSC\'s statutory audit Work Simulation and completed the PwC US Audit Job Simulation.',
            'Completed the PwC US Audit Job Simulation.'],
        ['Matched 150 purchase invoices with GSTR-2B in MSC\'s GST Work Simulation, and prepared GSTR-1 data for 8 months.',
            'Prepared GSTR-1 data for 8 months.'],
        ['Built a 5-year DCF from its annual report, and a P&L-to-DCF model in MSC\'s valuation Work Simulation.',
            'Built a 5-year DCF from its annual report.'],
        ['Completed PwC’s US audit and tax job simulations and vouched 20 purchase bills in MSC’s statutory audit Work Simulation.',
            'Completed PwC’s US audit and tax job simulations.'],
        ['Vouched 20 purchase bills and counted a 60-item stock sheet in MSC\'s statutory audit Work Simulation.', ''],
        ['Statutory audit Work Simulation: flagged 3 cut-off errors → “What is cut-off?” “What would you do next?”', ''],
        ['<p>ICITSS completed. Tested 15 purchases in MSC\'s internal audit Work Simulation. Seeking articleship.</p>',
            '<p>ICITSS completed. Seeking articleship.</p>'],
        ['<p>Tested 15 purchases in MSC\'s internal audit Work Simulation.</p>', ''],
        ['Open the work-simulation page', ''],
        ['A job simulation from Forage, a model or an annual-report project.', 'A job simulation from Forage, a model or an annual-report project.']
    ];
    for (const [text, release1] of cases) {
        assert.equal(P.releaseText(text, false), release1, text);
        assert.equal(P.releaseText(text, true), text, 'release 2: ' + text);
    }
    assert.equal(P.releaseText('a\n{ws}only with it\n{no-ws}only without it\nThe Work Simulation line.\n\nlast', false), 'a\nonly without it\n\nlast');
    assert.equal(P.releaseText('a\n{ws}only with it\n{no-ws}only without it\nThe Work Simulation line.\n\nlast', true), 'a\nonly with it\nThe Work Simulation line.\n\nlast');
    assert.equal(P.releaseText(42, false), 42);
    assert.equal(P.releaseText(null, false), null);
    // The shipped default is the shared flag.
    assert.equal(P.releaseText('Work Simulation lines too.'), P.WORK_SIMULATION_LIVE ? 'Work Simulation lines too.' : '');
});

test('releaseContent: a copy; what names or links the Work Simulation goes, ids and patterns stay', () => {
    const source = {
        title: 'Practise',
        items: [
            { id: 'keep', check: 'A check', example: ['Line one', 'Work Simulation: [Domain] line', 'Excel, a Work Simulation level, a model'] },
            { id: 'ws-only', check: 'Finish one Work Simulation level', example: 'x' },
            { id: 'linked', check: 'Open it', fix: { label: 'Open', href: '/articleship-program/work-simulation/?domain=gst' } },
            { id: 'row', check: 'Read it', fix: { label: 'Read', href: '/learning-management-system/course?course=msc-articleship-program&session=2&resource=Work+Simulation' } }
        ],
        probes: [{ type: 'simulation', match: 'work simulation|job simulation', ask: 'Walk me through it.' }],
        note: 'Only Work Simulation here.'
    };
    const before = JSON.stringify(source);
    const off = P.releaseContent(source, { workSimulationLive: false });
    assert.equal(JSON.stringify(source), before, 'the input is never changed');
    assert.deepEqual(off.items.map(item => item.id), ['keep', 'linked', 'row'], 'a check about it goes');
    assert.deepEqual(off.items[0].example, ['Line one', 'Excel, a model']);
    assert.equal(off.items[1].fix, undefined, 'a link to its page goes');
    assert.equal(off.items[2].fix, undefined, 'a link to its course row goes');
    assert.equal(off.probes[0].match, 'work simulation|job simulation', 'patterns are not text');
    assert.equal('note' in off, false);
    assert.deepEqual(P.releaseContent(source, { workSimulationLive: true }), source, 'release 2: all of it');
    assert.equal(P.isWorkSimulationLink('/articleship-program/work-simulation/'), true);
    assert.equal(P.isWorkSimulationLink('/articleship-program/cv-checklist/'), false);
    assert.equal(P.mentionsWorkSimulation('a Work-Simulation level'), true);
    assert.equal(P.mentionsWorkSimulation('a job simulation'), false);
});

// ---------- rows not in the course yet (ROWS_NOT_LIVE) ----------
const CONTENT_BUILD = process.env.MSC_CONTENT_BUILD || path.join(ROOT, '..', 'msc-content/articleship-program/v3/build');

test('rows not live: ROWS_NOT_LIVE is every LMS row that is not in release 1 (the LMS build), and nothing else', t => {
    const rowsFile = path.join(CONTENT_BUILD, 'lms/lms-rows.json');
    const releaseFile = path.join(CONTENT_BUILD, 'lms/rows-release-1.json');
    if (!fs.existsSync(rowsFile) || !fs.existsSync(releaseFile)) { t.skip('content build not on this machine'); return; }
    const all = JSON.parse(fs.readFileSync(rowsFile, 'utf8')).days
        .flatMap(day => day.groups.flatMap(group => group.rows.map(row => ({ row: row.row, day: day.day, title: row.title }))));
    const release = JSON.parse(fs.readFileSync(releaseFile, 'utf8'));
    const inRelease = row => release.some(s => s.day_number === row.day && s.resources.some(r => r.title === row.title));
    // Row 1.6 is not an LMS row in release 1 (the Work Simulation's own flag); every other missing row must be listed.
    const missing = all.filter(row => !inRelease(row)).map(row => row.row + ' ' + row.title);
    if (!P.WORK_SIMULATION_LIVE) missing.push('1.6 Work Simulation');
    assert.deepEqual(P.ROWS_NOT_LIVE.map(row => row.row + ' ' + row.title).sort(), [...new Set(missing)].sort(),
        'scripts/articleship-progress.js ROWS_NOT_LIVE: one line per row not in rows-release-1.json');
    for (const row of P.ROWS_NOT_LIVE.filter(r => r.row !== '1.6')) {
        assert.ok(all.some(r => r.row === row.row && r.day === row.day && r.title === row.title), row.title + ' is a real LMS row');
    }
});

test('rows not live: links to them go, their "<title> – Day N" pointers leave the sentence cleanly, other rows stay', () => {
    const href = title => '/learning-management-system/course?course=msc-articleship-program&session=5&resource=' + encodeURIComponent(title).replace(/%20/g, '+');
    assert.equal(P.isNotLiveRowLink(href('HR round and GD booklet')), true);
    assert.equal(P.isNotLiveRowLink(href('Written test practice')), false);
    assert.equal(P.isNotLiveRowLink(href('Interview syllabus tracker')), false);
    assert.equal(P.isNotLiveRowLink('https://www.mystudentclub.com/learning-management-system/course?course=msc-articleship-program&session=5&resource=GST+booklet&page=3'), true);
    assert.equal(P.isNotLiveRowLink('/learning-management-system/course?course=other&session=5&resource=GST+booklet'), false);
    assert.equal(P.isRowLive('Interview syllabus tracker', 4), true);
    assert.equal(P.isRowLive('Interview syllabus', 4), false);
    assert.equal(P.withoutNotLiveRows('Both groups passed together, but not on the first try: one row, year only is fine; the attempts answer is in HR round and GD booklet – Day 4.'),
        'Both groups passed together, but not on the first try: one row, year only is fine.');
    assert.equal(P.withoutNotLiveRows('Tick topics in the Interview syllabus tracker. Then read the GST booklet – Day 4.'), 'Tick topics in the Interview syllabus tracker.');
    assert.equal(P.withoutNotLiveRows('Open Written test practice (or the Core accounting booklet) tonight.'), 'Open Written test practice tonight.');
    assert.equal(P.withoutNotLiveRows('Read in GST booklet'), '');
    assert.equal(P.withoutNotLiveRows('Nothing to change here.'), 'Nothing to change here.');
    const content = { items: [{ id: 'a', check: 'Groups', also: [{ label: 'HR round and GD booklet – Day 4', href: href('HR round and GD booklet') },
        { label: 'Guidebook ch 3, q11', href: '/learning-management-system/course?course=msc-articleship-program&session=1&resource=MSC+Articleship+Guidebook&page=29' }] }] };
    assert.deepEqual(P.releaseContent(content).items[0].also.map(link => link.label), ['Guidebook ch 3, q11']);
    assert.deepEqual(P.releaseContent(content, { rows: 'all' }), content, "rows: 'all' keeps every row");
    assert.deepEqual(P.releaseContent(content, { rows: false }), content, 'rows: false (a tool with its own list) keeps them');
});

test('rows not live: no programme tool draws a link or a pointer to one (CV checklist check 11, tracker, LinkedIn checklist)', () => {
    const notLive = P.ROWS_NOT_LIVE.filter(row => row.row !== '1.6');
    const findLinks = value => JSON.stringify(value).match(/\/learning-management-system\/course\?[^"]+/g) || [];
    const checklist = RELEASE_1.checklist.releaseContent(CONTENT.checklist);
    assert.deepEqual(findLinks(checklist).filter(P.isNotLiveRowLink), []);
    assert.deepEqual(notLive.filter(row => JSON.stringify(checklist).includes(row.title + ' –')), []);
    const attempts = checklist.items.find(item => item.id === 'groups-attempts');
    assert.ok(attempts.example.includes('Both groups passed together, but not on the first try: one row, year only is fine.'));
    const syllabus = RELEASE_1.tracker.normaliseContent(CONTENT.syllabus);
    assert.deepEqual(Object.values(syllabus.booklets).filter(title => !P.isRowLive(title, 4)), []);
    const linkedin = path.join(ROOT, 'articleship-program/linkedin-checklist/linkedin-checklist.json');
    if (fs.existsSync(linkedin)) {
        const released = P.releaseContent(JSON.parse(fs.readFileSync(linkedin, 'utf8')));
        assert.deepEqual(findLinks(released).filter(P.isNotLiveRowLink), []);
    }
});

// ---------- release 1: nothing about the Work Simulation, nothing broken ----------

test('release 1: CV Recommender, situation D (Projects) and every other result say nothing about it', () => {
    const R = RELEASE_1.recommender;
    const answers = over => Object.assign({ rank: ['academics', 'work', 'projects', 'roles', 'skills'], inter: 'first', gap: 'none',
        graduation: 'completed', icitss: 'done', work: ['none'], projects: ['none'], course: 'none', domain: 'gst' }, over || {});
    const options = R.QUESTIONS.flatMap(q => (q.options || []).map(o => o.label + ' ' + (o.hint || '')));
    assert.doesNotMatch(options.join(' | '), WS, 'no "Work Simulation level" tap');
    const seen = new Set();
    [
        answers(),
        answers({ rank: ['projects', 'academics', 'work', 'roles', 'skills'], projects: ['job-simulation', 'model'] }),
        answers({ rank: ['projects', 'academics', 'work', 'roles', 'skills'], projects: ['work-simulation'] }), // an answer saved before
        answers({ rank: ['work', 'academics', 'projects', 'roles', 'skills'] }),
        answers({ domain: 'unsure' })
    ].forEach(a => {
        const result = R.recommend(a, CONTENT.situations);
        seen.add(result.situation);
        assert.doesNotMatch(JSON.stringify(result), WS, 'situation ' + result.situation);
    });
    assert.ok(seen.has('D'), 'order D (Projects) was drawn');
    assert.ok(R.QUESTIONS.find(q => q.id === 'projects').options.length >= 3, 'the projects question keeps its other taps');
});

test('release 1: Domain roadmaps, CV Builder, tracker, mock interview and CV checklist draw without it', () => {
    const roadmaps = RELEASE_1.roadmaps.normalise(CONTENT.roadmaps);
    assert.equal(roadmaps.workSimulation.live, false, 'no "Earn the CV line" part');
    assert.equal(roadmaps.domains.length, 13, 'every card stays');
    roadmaps.domains.forEach(card => assert.doesNotMatch(JSON.stringify(Object.assign({}, card, { levels: [] })), WS, card.slug));

    const B = RELEASE_1.builder;
    assert.doesNotMatch(JSON.stringify(B.blankContent('D')), WS, 'the blank CV has no Work Simulation gap');
    assert.doesNotMatch(JSON.stringify(B.releaseExamples(CONTENT.examples)), WS, 'no applicant carries it');
    const twoLines = { certifications: [
        { name: 'GST Work Simulation, MSC Articleship Program | Mar 2026: matched 2B.' },
        { name: 'GST Work Simulation, MSC Articleship Program | Apr 2026: filed 3B.' }] };
    assert.ok(!B.checkCv(twoLines).some(flag => WS.test(flag.text)), 'the checks never name it');

    const T = RELEASE_1.tracker;
    const syllabus = T.normaliseContent(CONTENT.syllabus);
    assert.equal(syllabus.total, T.normaliseContent(CONTENT.syllabus, { workSimulationLive: true }).total, 'every topic stays');
    assert.doesNotMatch(JSON.stringify(syllabus.sections) + JSON.stringify(syllabus.nightBefore) + JSON.stringify(syllabus.interviewDay), WS);
    assert.equal(syllabus.byId.get('hr-cv-lines').know, 'Each line is a question: what you did, how many, what you found, what you learnt.');

    const I = RELEASE_1.interview;
    const earned = ['Statutory audit Work Simulation, MSC Articleship Program: Vouched 25 purchase bills and flagged 4 exceptions'];
    for (const round of ['full', 'technical', 'hr', 'call']) {
        const plan = I.buildPlan(CONTENT.interview, { round, domain: 'statutory-audit', seed: 3, cvLines: ['Advanced Excel: VLOOKUP and pivot tables', 'Reading, cricket and chess', 'B.Com, Mumbai University'], earnedLines: earned });
        assert.doesNotMatch(I.renderPrompt(plan), WS, round + ': the interviewer never hears of it');
    }

    const C = RELEASE_1.checklist;
    const checks = C.releaseContent(CONTENT.checklist);
    assert.doesNotMatch(JSON.stringify(checks), WS);
    assert.equal(checks.items.length, CONTENT.checklist.items.length, 'every check stays');
});

test('release 1: the mock interview setup never reads the Work Simulation\'s saved lines', () => {
    const I = RELEASE_1.interview;
    const opened = [];
    const store = { get: () => ({ earned: [{ line: 'GST Work Simulation, MSC Articleship Program: matched 2B' }] }), set() {}, update() {}, subscribe: () => () => {} };
    const progress = { getMyDomain: () => 'gst', open: tool => { opened.push(tool); return store; } };
    const dom = new JSDOM('<!doctype html><div id="root"></div>');
    I.mountSetup(dom.window.document.getElementById('root'), { content: CONTENT.interview, store, progress, cvSources: [] });
    assert.ok(!opened.includes(I.SIMULATION_TOOL), 'its store is never opened');
    assert.equal(dom.window.document.querySelector('.aii-earned').textContent, '');
    assert.doesNotMatch(dom.window.document.getElementById('root').textContent, WS);
});

// ---------- release 2: the flag flipped, everything back ----------

test('release 2 (flag flipped): every Work Simulation part is back in every tool', () => {
    const R = RELEASE_2.recommender;
    assert.ok(R.QUESTIONS.find(q => q.id === 'projects').options.some(o => o.id === 'work-simulation'), 'the "Work Simulation level" tap');
    const thin = R.recommend({ rank: ['work', 'academics', 'projects', 'roles', 'skills'], inter: 'first', gap: 'none', graduation: 'completed',
        icitss: 'done', work: ['none'], projects: ['none'], course: 'none', domain: 'gst' }, CONTENT.situations);
    assert.match(JSON.stringify(thin), WS, 'thin proof points at it again');

    const roadmaps = RELEASE_2.roadmaps.normalise(CONTENT.roadmaps);
    assert.equal(roadmaps.workSimulation.live, true, '"Earn the CV line" is back');
    assert.ok(roadmaps.domains.every(card => WS.test(card.cvLine)), 'every card\'s CV line');

    const B = RELEASE_2.builder;
    assert.match(JSON.stringify(B.blankContent('A')), /\[Domain\] Work Simulation/, 'the blank CV\'s gap');
    assert.deepEqual(B.releaseExamples(CONTENT.examples), CONTENT.examples, 'every applicant as written');
    const twoLines = { certifications: [
        { name: 'GST Work Simulation, MSC Articleship Program | Mar 2026: matched 2B.' },
        { name: 'GST Work Simulation, MSC Articleship Program | Apr 2026: filed 3B.' }] };
    assert.ok(B.checkCv(twoLines).some(flag => flag.id === 'one-per-domain'), 'its check');

    const T = RELEASE_2.tracker;
    assert.match(T.normaliseContent(CONTENT.syllabus).byId.get('hr-cv-lines').know, /Work Simulation lines too\.$/);

    const I = RELEASE_2.interview;
    const earned = ['Statutory audit Work Simulation, MSC Articleship Program: Vouched 25 purchase bills and flagged 4 exceptions'];
    const plan = I.buildPlan(CONTENT.interview, { round: 'full', domain: 'statutory-audit', seed: 3, cvLines: ['Advanced Excel: VLOOKUP and pivot tables', 'Reading, cricket and chess', 'B.Com, Mumbai University'], earnedLines: earned });
    const prompt = I.renderPrompt(plan);
    assert.match(prompt, /a Work Simulation level/, 'the listen-for cue');
    assert.match(prompt, /Vouched 25 purchase bills/, 'earned lines are probed');

    const C = RELEASE_2.checklist;
    // Release 2 draws every check as written, with each work_simulation.replace line swapped in (as the PDF's -ws twin).
    const swapped = JSON.parse(JSON.stringify(CONTENT.checklist));
    swapped.items.forEach(item => {
        const swap = (item.work_simulation || {}).replace || {};
        if (Array.isArray(item.example)) item.example = item.example.map(line => (line in swap ? swap[line] : line));
    });
    // (A pointer to a row that is not in the course yet - a Day 4 booklet - stays out until that row ships: ROWS_NOT_LIVE.)
    assert.deepEqual(C.releaseContent(CONTENT.checklist), RELEASE_2.progress.releaseContent(swapped, { workSimulationLive: true }), 'every check as written');
    assert.deepEqual(RELEASE_2.progress.releaseContent(swapped, { workSimulationLive: true, rows: 'all' }), swapped);
    assert.match(JSON.stringify(C.releaseContent(CONTENT.checklist)), /Statutory audit Work Simulation: flagged 3 cut-off errors/);
});

test('release 2 (flag flipped): the LinkedIn checklist follows the same flag', { skip: !('WORK_SIMULATION_LIVE' in SHIPPED.linkedin) && 'its release build is not committed yet' }, () => {
    assert.equal(RELEASE_1.linkedin.WORK_SIMULATION_LIVE, false);
    assert.equal(RELEASE_2.linkedin.WORK_SIMULATION_LIVE, true);
});
