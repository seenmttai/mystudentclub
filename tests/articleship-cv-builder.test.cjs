// MSC Articleship Program: the CV Builder's articleship stage (row 1.5): logic, sample content and the stage panel.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { spawnSync } = require('node:child_process');

const B = require('../scripts/articleship-cv-builder.js');
const P = require('../scripts/articleship-progress.js');
const catalog = require('../cv-builder/cv-articleship.js');

const ROOT = path.join(__dirname, '..');
const readJson = rel => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
const DESIGNS_JSON = readJson('articleship-program/cv-builder/designs.json');
const EXAMPLES_JSON = readJson('articleship-program/cv-builder/examples.json');
const RECOMMENDER_SITUATIONS = path.join(ROOT, 'articleship-program/cv-recommender/situations.json');
const GALLERY = catalog.templates.filter(template => template.kind === 'gallery');
const DESIGNS = B.attachApplicants(B.normaliseDesigns(DESIGNS_JSON, GALLERY), EXAMPLES_JSON);
const EXAMPLES = B.normaliseExamples(EXAMPLES_JSON);
const design = number => DESIGNS.find(d => d.number === number);
// The generator that writes designs.json + examples.json from the content build (row 1.4 kept designs and applicants,
// row 1.3's Nothing CV). Found beside this repo on the builder's Mac, or through MSC_CVB_GENERATOR; skipped elsewhere.
const GENERATOR = process.env.MSC_CVB_GENERATOR
    || path.join(ROOT, '..', 'msc-content', 'articleship-program', 'v3', 'build', 'tools', 'cv-builder', 'make_data.py');
const clone = value => JSON.parse(JSON.stringify(value));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function studentCv(extra) {
    return Object.assign({
        personal: { name: 'Riya Shah', tagline: '', phone: '+91 98XXXXXXXX', email: 'riya.shah@email.com', linkedin: '', location: 'Surat', socialLinks: [] },
        summary: '<p>CA Intermediate cleared (both groups, [Month Year]). Seeking articleship in GST.</p>',
        education: [{ degree: 'CA Intermediate (both groups)', year: '[Month Year]', institute: 'ICAI', marks: '371/600', remarks: 'First attempt' }],
        experience: [], projects: [], skills: '', certifications: [], achievements: [], leadership: [], interests: [], customSections: [],
        sectionOrder: B.BUILDER_SECTIONS.slice(), sectionTitles: {}, sectionLabels: {},
        templateFile: 'articleship-layout-bold-modern', themeAccent: '#123456', themeFont: 'georgia',
        tableSettings: { education: { columns: { degree: { visible: true, width: 30 } } } }
    }, extra || {});
}

const keepsDesign = (before, after) => {
    assert.equal(after.templateFile, before.templateFile, 'design kept');
    assert.equal(after.themeAccent, before.themeAccent, 'colour kept');
    assert.equal(after.themeFont, before.themeFont, 'font kept');
    assert.deepEqual(after.tableSettings, before.tableSettings, 'table settings kept');
};

// ---------- Structures (A–H) ----------

test('eight structures A–H; names and orders follow the CV Recommender\'s shared situations', () => {
    assert.deepEqual(B.SITUATIONS.map(s => s.id), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
    B.SITUATIONS.forEach(s => assert.deepEqual([...s.order].sort(), [...B.BUILDER_SECTIONS].sort(), `${s.id} orders every section`));
    if (!fs.existsSync(RECOMMENDER_SITUATIONS)) return;
    const shared = JSON.parse(fs.readFileSync(RECOMMENDER_SITUATIONS, 'utf8'));
    const merged = B.mergeSituations(shared);
    merged.forEach(s => {
        assert.equal(s.name, shared.situations[s.id].name, `${s.id} uses the Recommender's name`);
        const lead = B.toBuilderOrder(shared.situations[s.id].order);
        assert.deepEqual(s.order.slice(0, lead.length), lead, `${s.id} uses the Recommender's order`);
    });
});

test('a structure changes the order and titles only: design, colours, table settings and text are kept', () => {
    const before = studentCv({ customSections: [{ id: 'custom_x', title: 'Languages', items: ['English'] }] });
    const after = B.applyStructure(before, 'C');
    keepsDesign(before, after);
    assert.deepEqual(after.education, before.education);
    assert.equal(after.summary, before.summary);
    assert.deepEqual(after.sectionOrder.slice(0, 3), ['summary', 'education', 'experience']);
    assert.equal(after.sectionOrder.at(-1), 'custom_x', 'custom sections kept at the end');
    assert.equal(after.sectionTitles.certifications, B.CERT_TITLE);
    assert.equal(after.articleshipStructure, 'C');
    const own = B.applyStructure(Object.assign(clone(before), { sectionTitles: { leadership: 'My clubs' } }), 'E');
    assert.equal(own.sectionTitles.leadership, 'My clubs', 'a title the student wrote is kept');
    const recOrder = ['header', 'summary', 'education', 'projects', 'certifications', 'skills', 'leadership', 'interests'];
    assert.deepEqual(B.applyStructure(before, 'D', { order: recOrder }).sectionOrder.slice(0, 6),
        ['summary', 'education', 'projects', 'certifications', 'skills', 'leadership']);
});

test('the CV Recommender\'s pick is applied once per pick, with its design by look-book number', () => {
    const pick = { situation: 'B', order: ['header', 'summary', 'education', 'certifications'], design: 5, savedAt: '2026-10-20T06:00:00.000Z' };
    const plan = B.planPick(pick, DESIGNS, studentCv());
    assert.equal(plan.apply, true);
    assert.equal(plan.situation, 'B');
    assert.equal(plan.design.number, 5);
    assert.equal(B.planPick(pick, DESIGNS, studentCv({ articleshipPickApplied: plan.key })).apply, false, 'not re-applied after the student changes things');
    assert.equal(B.planPick(Object.assign({}, pick, { savedAt: '2026-10-21T06:00:00.000Z' }), DESIGNS, studentCv({ articleshipPickApplied: plan.key })).apply, true, 'a new pick applies');
    assert.equal(B.planPick(Object.assign({}, pick, { design: 99 }), DESIGNS, studentCv()).design, null);
    assert.equal(B.planPick({ situation: 'Z' }, DESIGNS, studentCv()), null);
    assert.equal(B.planPick(null, DESIGNS, studentCv()), null);
});

// ---------- Designs (look-book numbers; all 62 under "All") ----------

test('designs: every kept look-book design, numbered 1…n as in the look-book, each one of the 62 layouts', () => {
    assert.ok(DESIGNS.length > 8, 'every genuinely different design (B3), not eight');
    assert.equal(GALLERY.length, 62, 'all 62 layouts stay available under "All"');
    assert.deepEqual(DESIGNS.map(d => d.number), DESIGNS.map((d, i) => i + 1), 'numbered 1…n with no gap');
    assert.equal(new Set(DESIGNS.map(d => d.file)).size, DESIGNS.length, 'no layout kept twice');
    assert.equal(DESIGNS.length, (DESIGNS_JSON.designs || DESIGNS_JSON).length, 'nothing in designs.json dropped');
    DESIGNS.forEach(d => {
        assert.ok(GALLERY.some(g => g.file === d.file && g.renderFile === d.renderFile), `${d.name} is one of the 62`);
        assert.ok(fs.existsSync(path.join(ROOT, 'cv-builder', d.renderFile)));
        assert.ok(['Portal-safe', 'Print', 'Screen'].includes(d.tag), `${d.name}: ${d.tag}`);
        assert.equal(d.portalSafe, d.tag === 'Portal-safe');
        assert.equal(d.screen, d.tag === 'Screen');
        assert.ok(d.line.length > 20, `${d.name} says what it is best for`);
        assert.ok(d.example && d.example.personal.name, `${d.name} has its own applicant`);
        assert.equal(B.personaFor(d), d.example.situation, `${d.name}: its applicant's situation`);
    });
    const names = DESIGNS.map(d => d.example.personal.name);
    assert.equal(new Set(names).size, names.length, 'one applicant per design');
    assert.ok(DESIGNS.some(d => d.portalSafe && /portal plain/i.test(d.name)), 'Portal plain for careers portals');
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(id => {
        const made = DESIGNS.filter(d => d.situations.includes(id));
        assert.equal(made.length, 1, `one design is the pick for order ${id}`);
        assert.notEqual(made[0].tag, 'Screen', `order ${id}'s pick prints well`);
        assert.equal(B.designsFor(DESIGNS, id)[0], made[0], 'the pick first in "For order"');
    });
    assert.ok(DESIGNS.some(d => (DESIGNS_JSON.designs.find(r => r.number === d.number).bestFor || []).includes('cs-cma')), 'a pick for CA with CS or CMA');
});

test('designs.json and examples.json are what the content build kept (row 1.4 designs and applicants, row 1.3 Nothing CV)', t => {
    if (!fs.existsSync(GENERATOR)) { t.skip('content build not beside this repo'); return; }
    const run = spawnSync('python3', ['-I', GENERATOR, '--check', '--site', ROOT], { encoding: 'utf8' });
    if (run.error) { t.skip('python3 not available'); return; }
    assert.equal(run.status, 0, `${run.stdout}${run.stderr} (re-run ${GENERATOR})`);
});

test('designs.json in other shapes: gallery numbers, kept flags, inline applicants, unknown layouts dropped', () => {
    const list = B.normaliseDesigns({ kept: [
        { no: 2, name: 'Sidebar', gallery: 35, tags: ['print'], situations: ['C'], also: ['C', 'f'], acc: '2e3156' },
        { number: 1, name: 'Plain', layout: 'plain-ats', tag: 'Portal-safe (ATS)', persona: 'g', example: { personal: { name: 'X Y' } } },
        { number: 3, name: 'Gone', renderFile: 'nope.html' },
        { number: 4, name: 'Dropped', gallery: 7, kept: false },
        { number: 5, name: 'Panel', gallery: 48, tag: 'Screen', accent: 'navy' }
    ] }, GALLERY);
    assert.deepEqual(list.map(d => [d.number, d.renderFile, d.tag, B.personaFor(d)]),
        [[1, 'plain-ats.html', 'Portal-safe', 'G'], [2, 'profile-sidebar.html', 'Print', 'C'], [5, 'side-panel.html', 'Screen', 'A']]);
    assert.deepEqual(list[1].also, ['F'], '"also" never repeats the orders it is the pick for');
    assert.equal(list[1].accent, '#2E3156');
    assert.equal(list[2].accent, '', 'only a hex colour is used');
    assert.equal(B.bestForLabel({ line: 'Strong marks: the education grid is read first.' }), 'Strong marks');
    assert.equal(B.bestForLabel({ line: 'A line with no lead words.' }), '');
    assert.equal(list[0].example.personal.name, 'X Y');
    assert.equal(B.resolveDesign(list, 'Design 2').name, 'Sidebar');
    assert.equal(B.resolveDesign(list, 'articleship-layout-plain-ats').number, 1);
    assert.equal(B.resolveDesign(list, 'plain').number, 1);
});

test('one designs.json for both tools: the CV Recommender reads the same numbers, names and tags', () => {
    const recPath = path.join(ROOT, 'scripts/articleship-cv-recommender.js');
    if (!fs.existsSync(recPath)) return;
    const R = require(recPath);
    if (R.DESIGNS_URL) assert.equal(R.DESIGNS_URL, '/articleship-program/cv-builder/designs.json');
    const rec = R.normaliseDesigns(DESIGNS_JSON);
    assert.deepEqual(rec.map(d => [d.number, d.name, d.tag]), DESIGNS.map(d => [d.number, d.name, d.tag]));
});

test('each kept design is set in its look-book font and colour, unless the student picks their own', () => {
    DESIGNS.forEach(d => {
        assert.ok(B.CV_FONTS.includes(d.font), `${d.name}: ${d.font}`);
        assert.match(d.accent, /^#[0-9A-F]{6}$/, `${d.name}: its colour`);
    });
    const sidebar = B.resolveDesign(DESIGNS, 3);
    assert.deepEqual(B.themeFor({ themeFont: '', themeAccent: '' }, sidebar), { font: sidebar.font, accent: sidebar.accent });
    assert.deepEqual(B.themeFor({ themeFont: 'Georgia', themeAccent: '#123456' }, sidebar), { font: 'Georgia', accent: '#123456' }, 'the student\'s own choice wins');
    assert.equal(B.themeFor({ themeFont: 'Arial', articleshipFontAuto: 'Arial' }, B.resolveDesign(DESIGNS, 1)).font, 'Times New Roman', 'an automatic font follows the design');
    assert.deepEqual(B.themeFor({}, null), { font: '', accent: '' }, 'outside the kept designs: the layout\'s own');
    const before = studentCv({ themeFont: '', themeAccent: '' });
    B.themeFor(before, sidebar);
    assert.equal(before.themeFont, '', 'nothing is stored on the CV');
    assert.equal(B.normaliseDesigns([{ number: 1, renderFile: 'classic.html', font: 'Comic Sans MS' }], GALLERY)[0].font, '');
    assert.equal(B.cvFont('times'), 'Times New Roman');
    assert.ok(B.checkCv(studentCv({ themeFont: 'Poppins' })).some(f => f.id === 'font'));
    assert.ok(!B.checkCv(studentCv({ themeFont: 'Cambria' })).some(f => f.id === 'font'));
});

// ---------- Starters ----------

test('the blank CV: articleship shape, ICITSS in the education table, every gap a [bracket]', () => {
    const before = studentCv();
    const blank = B.createBlank(before, { structure: 'A' });
    keepsDesign(before, blank);
    assert.equal(blank.articleshipStarter, 'blank');
    assert.equal(B.untouchedStarter(blank, EXAMPLES, DESIGNS), 'blank');
    assert.ok(blank.education.some(row => /ICITSS/.test(row.degree)), 'ICITSS is an education row');
    assert.deepEqual(blank.experience, [], 'no invented work');
    const counts = B.countCertificates(blank.certifications);
    assert.equal(counts.outside, 0);
    assert.equal(counts.placeholder, B.WORK_SIMULATION_LIVE ? 2 : 1, 'the Work Simulation gap only once it is out');
    assert.equal(B.countCertificates(B.createBlank(before, { structure: 'A', workSimulationLive: true }).certifications).placeholder, 2);
    assert.equal(B.countCertificates(B.createBlank(before, { structure: 'A', workSimulationLive: false }).certifications).placeholder, 1);
    assert.match(B.checkCv(blank).map(f => f.text).join(' '), /Fill or delete \d+ \[bracket\]s/);
    const edited = clone(blank);
    edited.personal.name = 'Riya Shah';
    assert.equal(B.untouchedStarter(edited, EXAMPLES, DESIGNS), null, 'one edit and it is the student\'s');
});

test('the blank CV shows the block its order leads with, as [brackets]; any order\'s blank counts as blank', () => {
    const strings = value => (typeof value === 'string' ? [value] : (value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []));
    const lead = { C: 'experience', D: 'projects', E: 'achievements', F: 'projects' };
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].forEach(id => {
        const blank = B.createBlank(studentCv(), { structure: id });
        ['experience', 'projects', 'achievements'].forEach(key => {
            assert.equal(blank[key].length, key === lead[id] ? 1 : 0, `order ${id}: ${key}`);
        });
        if (lead[id]) {
            strings(blank[lead[id]]).filter(Boolean).forEach(text => assert.match(text, /\[[^\]]+\]/, `order ${id}: "${text}" is a gap to fill`));
        }
        assert.equal(B.untouchedStarter(blank, EXAMPLES, DESIGNS), 'blank', `order ${id}: still a blank`);
        assert.equal(B.programLine(blank), 'ongoing', 'the programme line, ongoing until the student finishes');
        assert.equal(B.countCertificates(blank.certifications).outside, 0);
    });
    const swapped = B.applyStructure(B.createBlank(studentCv(), { structure: 'C' }), 'A');
    assert.equal(B.untouchedStarter(swapped, EXAMPLES, DESIGNS), 'blank', 'a blank whose order changed is still a blank');
});

test('"Start from the example" and "The Nothing CV": the applicant\'s text on the student\'s design', () => {
    const before = studentCv();
    const example = B.createExample(EXAMPLES, 'C', before, { structure: 'C' });
    keepsDesign(before, example);
    assert.equal(example.personal.name, EXAMPLES.C.personal.name);
    assert.equal(example.articleshipStarter, 'example:C');
    assert.equal(B.untouchedStarter(example, EXAMPLES, DESIGNS), 'example');
    assert.notEqual(example.summary, '', 'pre-filled, not blank');
    const flags = B.checkCv(example, { examples: EXAMPLES }).map(f => f.id);
    assert.ok(flags.includes('example-details') && flags.includes('example-lines'), 'the example\'s details are flagged until replaced');

    const nothing = B.createNothingCv(EXAMPLES, before);
    keepsDesign(before, nothing);
    assert.equal(nothing.articleshipStructure, 'H');
    assert.equal(nothing.articleshipStarter, 'nothing');
    assert.equal(B.untouchedStarter(nothing, EXAMPLES, DESIGNS), 'nothing');
    assert.equal(B.countCertificates(nothing.certifications).outside, B.OUTSIDE_CAP, 'the weekend stack is exactly the four');

    const inline = B.createExample(EXAMPLES, 'A', before, { design: { example: { personal: { name: 'Inline Person' }, summary: 'x' } } });
    assert.equal(inline.personal.name, 'Inline Person', 'a look-book design\'s own applicant wins');
    assert.equal(B.createExample(EXAMPLES, 'Z', before), null);
});

test('sample applicants keep the house rules (fictional, honest, rule-2 lines, the cap, the programme line)', () => {
    assert.deepEqual(Object.keys(EXAMPLES).sort(), ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);
    const banned = /ca ?monk|thinking ?bridge|umbrella|NEEDS-CHECK|\bwave\b|drop [abc]\b|live week|coming soon/i;
    assert.equal(Object.keys(EXAMPLES_JSON.designs).length, DESIGNS.length, 'one applicant for every design');
    Object.entries(B.allApplicants(EXAMPLES, DESIGNS)).forEach(([id, cv]) => {
        const text = JSON.stringify(cv);
        assert.doesNotMatch(text, banned, `${id}: no banned strings`);
        assert.match(cv.personal.phone, /98XXXXXXXX/, `${id}: phone masked`);
        assert.match(cv.personal.email, /^[a-z]+\.[a-z]+@email\.com$/, `${id}: firstname.lastname@email.com`);
        const inter = cv.education.filter(row => /CA Intermediate/.test(row.degree));
        // Year cell as Choose your CV (1.1) and CV templates (1.4) write it since 20 Oct: [Year] (older data: [Month Year])
        assert.ok(inter.length && inter.every(row => /^\[(Month )?Year\]$/.test(row.year)), `${id}: Inter session as [Year]`);
        assert.ok(cv.education.some(row => /ICITSS/.test(row.degree)), `${id}: ICITSS row in education`);
        (cv.experience || []).forEach(entry => assert.doesNotMatch(JSON.stringify(entry), /simulation|forage/i, `${id}: no simulation under experience`));
        const counts = B.countCertificates(cv.certifications);
        assert.ok(counts.outside <= B.OUTSIDE_CAP, `${id}: at most four outside certificates`);
        assert.equal(counts.icitss, 0, `${id}: ICITSS not in certifications`);
        assert.ok(counts.mscProgram <= 1);
        cv.certifications.forEach(item => {
            const line = B.plainText(item.name);
            const kind = B.classifyCertification(item);
            if (kind === 'msc-simulation') assert.match(line, /^[A-Z][A-Za-z& ]+ Work Simulation, MSC Articleship Program \| \[Month Year\]: /, `${id}: ${line}`);
            // The Nothing CV (H) shows the line a student writes while still in the programme, "MSC Articleship Program (ongoing)";
            // Padam's completed line (B7) replaces it once they finish (WIRING.md, cv-recommender / cv-builder, 21 Oct).
            if (kind === 'msc-program') assert.ok([B.PROGRAM_LINE_ONGOING, B.PROGRAM_LINE_DONE].includes(line), `${id}: the ongoing line or Padam's exact completed line: ${line}`);
            if (kind === 'outside') assert.match(line, /(\(Forage\)|Test, Level 1 \(NISM\)) \| \[Month Year\]: /, `${id}: ${line}`);
        });
        const flags = B.checkCv(cv).map(f => f.id).filter(flagId => !['brackets', 'months'].includes(flagId));
        assert.deepEqual(flags, [], `${id}: the example itself passes the checks`);
    });
    const nothing = EXAMPLES.H;
    assert.equal(nothing.situation, 'H');
    assert.equal(B.countCertificates(nothing.certifications).outside, B.OUTSIDE_CAP, 'The Nothing CV: the weekend stack, exactly four');
    ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'I'].forEach(id => assert.equal(EXAMPLES[id].situation, id, `${id}: an applicant of that situation`));
});

// ---------- Certifications and job simulations ----------

test('house rule 2: four outside certificates; MSC lines and ICITSS are not counted', () => {
    const list = [
        { name: 'PwC US Audit Job Simulation (Forage) | Mar 2026: built a risk-control matrix.' },
        { name: 'PwC US Tax Job Simulation (Forage) | Mar 2026: mapped a chart of accounts.' },
        { name: 'Goldman Sachs Excel Skills for Business Job Simulation (Forage) | Mar 2026: five tasks.' },
        { name: 'SEBI Investor Awareness Test, Level 1 (NISM) | Mar 2026: passed.' },
        { name: 'GST Work Simulation, MSC Articleship Program | Mar 2026: matched 2B.' },
        { name: B.PROGRAM_LINE_DONE },
        { name: 'MSC Articleship Program (ongoing)' },
        { name: '[Company] [Simulation] Job Simulation (Forage) | [Month Year]: [what you did]' }
    ];
    const counts = B.countCertificates(list);
    assert.equal(counts.outside, 4);
    assert.equal(counts.mscSimulation, 1);
    assert.equal(counts.mscProgram, 2);
    assert.equal(counts.placeholder, 1);
    assert.equal(counts.over, false);
    assert.equal(counts.label, '4 of 4 outside certificates');
    const five = B.countCertificates([...list, { name: 'Power BI course, Coursera | Apr 2026' }]);
    assert.equal(five.over, true);
    const flags = B.checkCv(studentCv({ certifications: [...list, { name: 'Power BI course | Apr 2026' }, { name: 'ICITSS (OC + ITT) completed' }] })).map(f => f.id);
    assert.ok(flags.includes('cap'), 'a fifth outside certificate is flagged');
    assert.ok(flags.includes('icitss-cert'), 'ICITSS belongs in the education table');
});

test('earned Work Simulation lines: read in any saved shape, imported once into "Certifications and job simulations"', () => {
    const saved = {
        earned: [{ id: 'gst-1', domain: 'gst', line: 'GST Work Simulation, MSC Articleship Program | Mar 2026: matched 64 invoices with GSTR-2B.' }],
        levels: { 'sa-1': { domain: 'statutory-audit', title: 'Vouching', done: true, earnedLine: { domain: 'statutory-audit', did: 'vouched 25 purchase bills', month: 'Mar 2026' } },
            'sa-2': { domain: 'statutory-audit', done: false, earnedLine: 'Statutory audit Work Simulation, MSC Articleship Program | x: y' } },
        cvQueue: [{ domain: 'gst', line: 'GST Work Simulation, MSC Articleship Program | Mar 2026: matched 64 invoices with GSTR-2B.' }]
    };
    const lines = B.readEarnedLines(saved);
    assert.deepEqual(lines.map(l => l.line), [
        'GST Work Simulation, MSC Articleship Program | Mar 2026: matched 64 invoices with GSTR-2B.',
        'Statutory audit Work Simulation, MSC Articleship Program | Mar 2026: vouched 25 purchase bills'
    ]);
    assert.deepEqual(B.readEarnedLines(null), []);
    assert.deepEqual(B.readEarnedLines({ earned: [{ line: 'Not a simulation line' }] }), []);

    const before = studentCv({
        certifications: [{ name: '[Domain] Work Simulation, MSC Articleship Program | [Month Year]: [what you did, with your counts]', issuer: '' },
            { name: 'PwC US Audit Job Simulation (Forage) | Mar 2026: built a risk-control matrix.', issuer: '' }],
        sectionOrder: ['summary', 'education', 'skills']
    });
    const result = B.importEarnedLines(before, lines);
    keepsDesign(before, result.cv);
    assert.equal(result.added, 2);
    assert.deepEqual(result.cv.certifications.map(c => B.classifyCertification(c)), ['msc-simulation', 'msc-simulation', 'outside'], 'placeholder gone, MSC lines first');
    assert.equal(result.counts.outside, 1);
    assert.ok(result.cv.sectionOrder.includes('certifications'));
    assert.equal(result.cv.sectionTitles.certifications, B.CERT_TITLE);
    assert.deepEqual(result.cv.education, before.education, 'other sections untouched');
    const quoted = B.importEarnedLines(studentCv(), ['Internal audit Work Simulation, MSC Articleship Program | Mar 2026: wrote 2 "observations".']);
    assert.equal(quoted.cv.certifications[0].name, 'Internal audit Work Simulation, MSC Articleship Program | Mar 2026: wrote 2 \u201Cobservations\u201D.');
    const again = B.importEarnedLines(result.cv, lines);
    assert.equal(again.added, 0);
    assert.equal(again.skipped, 2);
});

test('the programme line: "(ongoing)" swaps to Padam\'s completed line', () => {
    const cv = studentCv({ certifications: [{ name: 'MSC Articleship Program (ongoing)', issuer: '' }] });
    assert.equal(B.programLine(cv), 'ongoing');
    const done = B.useCompletedLine(cv);
    assert.equal(B.programLine(done), 'done');
    assert.equal(done.certifications.length, 1);
    assert.equal(done.certifications[0].name, B.PROGRAM_LINE_DONE);
    assert.equal(B.programLine(studentCv()), null);
});

// ---------- Live checks ----------

test('live checks flag what a firm would notice, and stay quiet on a clean CV', () => {
    const clean = studentCv({
        summary: '<p>CA Intermediate cleared (both groups, Mar 2026). Seeking articleship in GST.</p>',
        education: [{ degree: 'CA Intermediate (both groups)', year: 'Mar 2026', institute: 'ICAI', marks: '371/600', remarks: 'First attempt' }],
        leadership: ['Treasurer, Commerce Society 2024–25: kept the accounts of 9 events.']
    });
    assert.deepEqual(B.checkCv(clean), []);
    const messy = studentCv({
        summary: '<p>I am a hard working student.</p>',
        education: [{ degree: 'CA Intermediate Group II', year: 'Result awaited', marks: '180/300', institute: 'ICAI', remarks: '' }],
        experience: [{ role: 'Virtual intern', company: 'Forage', bullets: ['Responsible for audit tasks', 'Led the statutory audit of a client', ''] }],
        projects: [{ title: 'Accounts', bullets: ['Prepared final accounts of an audit client'] }],
        leadership: ['Participated in a quiz', 'Joined in March 2025', 'Left on 03/2026']
    });
    const ids = B.checkCv(messy).map(f => f.id);
    ['simulation-experience', 'responsible', 'first-person', 'awaited-score', 'empty-bullet', 'participated', 'months', 'red-led-the-audit']
        .forEach(id => assert.ok(ids.includes(id), `flags ${id} (got ${ids.join(', ')})`));
    assert.equal(B.checkCv(clean, { overflow: true })[0].id, 'one-page');
});

// ---------- The stage page (jsdom) ----------

function fakeStore(initial) {
    let data = clone(initial || {});
    const listeners = new Set();
    return {
        get: () => clone(data),
        set(next) { data = clone(next); listeners.forEach(fn => fn(clone(data), { source: 'local' })); },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
        pull: () => Promise.resolve('local')
    };
}

async function stage(options) {
    const opts = options || {};
    const dom = new JSDOM(`<!doctype html><body>
        <div class="editor-content"><details data-section="certifications"><summary><span>Certifications</span></summary>
        <input id="inp-title-certifications"></details></div>
        <span id="current-template-name">Classic</span><select id="template-select"></select>
        <div id="template-sidebar"><div class="template-sidebar-header"><h3>Choose Template</h3></div>
        <div><select id="template-collection"></select></div><div id="template-grid"></div></div></body>`,
    { url: opts.url || 'http://127.0.0.1/cv-builder/?stage=articleship', runScripts: 'outside-only' });
    const win = dom.window;
    GALLERY.forEach(g => { const o = win.document.createElement('option'); o.value = g.file; o.textContent = g.name; win.document.getElementById('template-select').appendChild(o); });
    const files = {
        '/articleship-program/cv-builder/designs.json': DESIGNS_JSON,
        '/articleship-program/cv-builder/examples.json': EXAMPLES_JSON,
        '/articleship-program/cv-recommender/situations.json': fs.existsSync(RECOMMENDER_SITUATIONS) ? JSON.parse(fs.readFileSync(RECOMMENDER_SITUATIONS, 'utf8')) : null
    };
    win.fetch = url => Promise.resolve({ ok: Boolean(files[new URL(url, 'http://127.0.0.1').pathname]), json: () => Promise.resolve(clone(files[new URL(url, 'http://127.0.0.1').pathname])) });
    win.confirm = () => opts.confirm !== false;
    const workSim = fakeStore(opts.workSimulation || {});
    let pick = opts.pick || null;
    const settingsListeners = new Set();
    win.MSCArticleshipProgress = {
        // The shared release switch: the shipped value unless a test draws the other release.
        WORK_SIMULATION_LIVE: typeof opts.workSimulationLive === 'boolean' ? opts.workSimulationLive : P.WORK_SIMULATION_LIVE,
        getCvPick: () => (pick ? clone(pick) : null),
        open: () => workSim,
        settings: () => ({ pull: () => Promise.resolve('local') }),
        onSettingsChange: fn => { settingsListeners.add(fn); return () => settingsListeners.delete(fn); }
    };
    win.MSCArticleshipCvBuilder = B;
    const calls = { useTemplate: [], toasts: [], choose: [], renderCards: 0, open: 0 };
    let cvData = opts.cv || null;
    let templateFile = (opts.cv && opts.cv.templateFile) || 'articleship-layout-classic';
    let accessChecked = opts.accessChecked !== false;
    const locked = new Set(opts.locked || []);
    win.eval(fs.readFileSync(path.join(ROOT, 'articleship-program/cv-builder/stage.js'), 'utf8'));
    const S = win.MSCArticleshipStage;
    if (!cvData) cvData = S.blankCv({ tableSettings: {} }, { education: {} });
    templateFile = cvData.templateFile || templateFile;
    const host = {
        getCv: () => cvData,
        setCv(next, o) { cvData = clone(next); if (o && o.templateFile) { templateFile = o.templateFile; cvData.templateFile = templateFile; } },
        templateFile: () => templateFile,
        useTemplate(file) { calls.useTemplate.push(file); templateFile = file; cvData.templateFile = file; },
        choose(file, name) { calls.choose.push([file, name]); },
        isLocked: file => locked.has(file) || (!accessChecked && file !== 'articleship-layout-classic'),
        accessChecked: () => accessChecked,
        gallery: () => GALLERY,
        collection: () => 'articleship',
        openTemplates() { calls.open += 1; },
        closeTemplates() {},
        renderCards() { calls.renderCards += 1; S.renderTemplateCards(win.document.getElementById('template-grid'), templateFile); },
        syncName() {},
        setFont(key) { cvData.themeFont = key; S.onChange(); },
        toast: message => calls.toasts.push(message)
    };
    S.init(host);
    await sleep(opts.wait || 60);
    return {
        win, doc: win.document, S, host, calls, workSim,
        get cv() { return cvData; },
        setAccess(value) { accessChecked = value; },
        unlock(file) { locked.delete(file); },
        setPick(next) { pick = next; settingsListeners.forEach(fn => fn()); },
        panel: () => win.document.getElementById('articleship-stage'),
        click(selector) {
            const el = win.document.querySelector(selector);
            assert.ok(el, `${selector} on screen`);
            el.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        }
    };
}

test('stage: a new student opens on the blank CV with both starters, the count and the checks', async () => {
    const s = await stage();
    const panel = s.panel();
    assert.ok(panel, 'panel on top of the form');
    assert.equal(s.doc.querySelector('.editor-content').firstElementChild, panel);
    assert.match(panel.textContent, /Your articleship CV/);
    assert.match(panel.textContent, /Not sure which order\? CV Recommender/);
    assert.match(panel.textContent, /No\. 1 · Classic table/);
    assert.match(panel.textContent, /0 of 4 outside certificates/);
    assert.match(panel.textContent, /Fill or delete \d+ \[bracket\]s/);
    assert.ok(panel.querySelector('[data-action=example]') && panel.querySelector('[data-action=nothing]'));
    assert.equal(s.doc.querySelector('details[data-section=certifications] summary span').textContent, B.CERT_TITLE);
    assert.equal(s.doc.querySelector('#template-select option[value="articleship-layout-classic"]').textContent, 'No. 1 Classic table');
    assert.doesNotMatch(panel.textContent, /saved on this device|coming soon|wave|NEEDS-CHECK/i);
});

test('stage: opens with the Recommender pick (order now, design once the builder knows access)', async () => {
    const pick = { situation: 'D', order: ['header', 'summary', 'education', 'projects', 'certifications', 'skills'], design: 4, savedAt: 'k1' };
    const s = await stage({ pick, accessChecked: false, wait: 80 });
    assert.equal(s.cv.articleshipStructure, 'D');
    assert.deepEqual(s.cv.sectionOrder.slice(0, 3), ['summary', 'education', 'projects']);
    assert.equal(s.cv.articleshipPickApplied, 'k1');
    assert.deepEqual(s.calls.useTemplate, [], 'waits while access is unknown');
    s.setAccess(true);
    await sleep(400);
    assert.deepEqual(s.calls.useTemplate, ['articleship-layout-banner-executive-split']);
    const payload = { themeFont: '', themeAccent: '' };
    s.S.theme('articleship-layout-banner-executive-split', payload);
    assert.deepEqual([payload.themeFont, payload.themeAccent], [design(4).font, design(4).accent], 'the design\'s look-book font and colour');
    const other = { themeFont: '', themeAccent: '' };
    s.S.theme('articleship-layout-structured-grid', other);
    assert.deepEqual(other, { themeFont: '', themeAccent: '' }, 'a layout outside the kept designs keeps its own');
    assert.ok(s.calls.toasts.includes('Opened with your CV Recommender pick.'));
    assert.match(s.panel().textContent, /From your CV Recommender: order D, design 4/);

    const locked = await stage({ pick, locked: ['articleship-layout-banner-executive-split'], wait: 120 });
    assert.deepEqual(locked.calls.useTemplate, [], 'a locked design is never forced on');

    const again = await stage({ pick, cv: Object.assign(B.createBlank({ templateFile: 'articleship-layout-plain-ats' }, { structure: 'A' }), { articleshipPickApplied: 'k1' }), wait: 120 });
    assert.equal(again.cv.articleshipStructure, 'A', 'an applied pick does not undo the student\'s own order');
    assert.deepEqual(again.calls.useTemplate, []);
});

test('stage: a CV templates link opens on its design (?design=N) and, with &example=1, on that design\'s applicant', async () => {
    const d = design(4);
    const s = await stage({ url: 'http://127.0.0.1/cv-builder/?stage=articleship&design=4&example=1', wait: 400 });
    assert.deepEqual(s.calls.useTemplate, [d.file]);
    assert.equal(B.plainText(s.cv.personal.name), 'Anushka Pai', 'design 4\'s applicant');
    const only = await stage({ url: 'http://127.0.0.1/cv-builder/?stage=articleship&design=4', wait: 400 });
    assert.deepEqual(only.calls.useTemplate, [d.file]);
    assert.notEqual(B.plainText(only.cv.personal.name || ''), 'Anushka Pai', 'without &example=1 the CV stays the student\'s');
    const bad = await stage({ url: 'http://127.0.0.1/cv-builder/?stage=articleship&design=99&example=1', wait: 200 });
    assert.deepEqual(bad.calls.useTemplate.filter(f => f !== 'articleship-layout-classic'), [], 'an unknown number changes nothing');
});

test('stage: the pick\'s design goes on when the enrolment lookup unlocks it, though access was marked checked first', async () => {
    const pickDesign = B.designsFor(DESIGNS, 'C')[0];
    const pick = { situation: 'C', order: [], design: pickDesign.number, savedAt: 'k2' };
    const s = await stage({ pick, locked: [pickDesign.file], wait: 80 });
    assert.deepEqual(s.calls.useTemplate, [], 'still locked: the free design stays');
    s.unlock(pickDesign.file);
    await sleep(400);
    assert.deepEqual(s.calls.useTemplate, [pickDesign.file]);
    assert.equal(s.cv.experience.length, 1, 'the blank shows order C\'s work block');
});

test('stage: an untouched blank is redrawn for a new order; a CV the student wrote only changes order', async () => {
    const tap = (s, id) => {
        s.click('[data-row=order]');
        [...s.doc.querySelectorAll('.asb-order')].find(chip => chip.textContent.startsWith(id)).dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
    };
    const blank = await stage({ cv: Object.assign(B.createBlank({ templateFile: 'articleship-layout-clean-rule', themeAccent: '#0a0a0a' }, { structure: 'A' }), { templateFile: 'articleship-layout-clean-rule' }) });
    tap(blank, 'D');
    assert.equal(blank.cv.articleshipStructure, 'D');
    assert.equal(blank.cv.projects.length, 1, 'order D shows its projects block');
    assert.equal(blank.cv.templateFile, 'articleship-layout-clean-rule', 'design kept');
    assert.equal(blank.cv.themeAccent, '#0a0a0a', 'colour kept');
    tap(blank, 'C');
    assert.deepEqual([blank.cv.experience.length, blank.cv.projects.length], [1, 0], 'order C swaps it for the work block');
    const own = await stage({ cv: studentCv() });
    tap(own, 'C');
    assert.equal(own.cv.articleshipStructure, 'C');
    assert.deepEqual(own.cv.experience, [], 'nothing added to the student\'s own CV');
    assert.equal(own.cv.personal.name, 'Riya Shah');
});

test('phones: the Designs grid is two to a row and its rows take each card\'s height', () => {
    const css = fs.readFileSync(path.join(ROOT, 'articleship-program/cv-builder/stage.css'), 'utf8');
    const block = css.match(/body\.asb-on \.template-grid\.asb-grid \{[^}]*\}/);
    assert.ok(block, 'phone grid rule');
    assert.match(block[0], /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(block[0], /grid-auto-rows: max-content/, 'rows never squashed to fit the scroll box');
});

test('stage: order chips change the structure only; starters keep the design', async () => {
    const s = await stage({ cv: Object.assign(B.createBlank({ templateFile: 'articleship-layout-clean-rule', themeAccent: '#0a0a0a' }, { structure: 'A' }), { templateFile: 'articleship-layout-clean-rule' }) });
    s.click('[data-row=order]');
    const chips = [...s.doc.querySelectorAll('.asb-order')];
    assert.equal(chips.length, 8);
    chips.find(chip => chip.textContent.startsWith('E')).dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
    assert.equal(s.cv.articleshipStructure, 'E');
    assert.equal(s.cv.templateFile, 'articleship-layout-clean-rule');
    assert.equal(s.cv.themeAccent, '#0a0a0a');
    assert.match(s.calls.toasts.at(-1), /Order E on\. Your design and text are unchanged\./);

    s.click('[data-action=example]');
    assert.equal(s.cv.personal.name, design(5).example.personal.name, 'design 5\'s own applicant');
    assert.equal(s.cv.templateFile, 'articleship-layout-clean-rule');
    assert.equal(s.cv.articleshipStructure, 'E', 'the student\'s order is kept');
    assert.match(s.panel().textContent, /Put your own name/);

    s.click('[data-action=nothing]');
    assert.equal(s.cv.articleshipStarter, 'nothing');
    assert.equal(s.cv.templateFile, 'articleship-layout-clean-rule');

    const own = clone(s.cv);
    own.personal.name = 'Riya Shah';
    const kept = await stage({ cv: own, confirm: false });
    assert.match(kept.panel().textContent, /Start again: the example · The Nothing CV/);
    kept.click('[data-action=example]');
    assert.equal(kept.cv.personal.name, 'Riya Shah', 'nothing is replaced without a yes');
});

test('stage (Work Simulation out): earned lines are offered, queued ones arrive by themselves, each only once', async () => {
    const line = 'GST Work Simulation, MSC Articleship Program | Mar 2026: matched 64 invoices with GSTR-2B.';
    const queued = 'Statutory audit Work Simulation, MSC Articleship Program | Mar 2026: vouched 25 purchase bills.';
    const s = await stage({ workSimulationLive: true, workSimulation: { earned: [{ domain: 'gst', line }, { domain: 'statutory-audit', line: queued }], cvQueue: [{ line: queued }] } });
    assert.ok(s.cv.certifications.some(c => c.name === queued), 'the queued line arrived');
    assert.ok(s.cv.articleshipImported.includes(queued));
    assert.match(s.panel().textContent, /Add 1 Work Simulation line/);
    s.click('[data-action=add-lines]');
    assert.ok(s.cv.certifications.some(c => c.name === line));
    assert.match(s.calls.toasts.at(-1), /Added 1 Work Simulation line to "Certifications and job simulations"\./);
    assert.equal(s.panel().querySelector('[data-action=add-lines]'), null);
    // Deleted by the student: not offered again.
    const cv = clone(s.cv);
    cv.certifications = cv.certifications.filter(c => c.name !== line);
    const later = await stage({ cv, workSimulationLive: true, workSimulation: { earned: [{ line }], cvQueue: [{ line: queued }] } });
    assert.equal(later.panel().querySelector('[data-action=add-lines]'), null);
    assert.ok(!later.cv.certifications.some(c => c.name === line));

    const none = await stage({ workSimulationLive: true });
    assert.match(none.panel().textContent, /Earn a line with your own counts in Work Simulation/);
    const ws = [...none.panel().querySelectorAll('a')].find(a => a.textContent === 'Work Simulation');
    assert.equal(ws.getAttribute('href'), '/articleship-program/work-simulation/',
        'the page itself, now that the shared situations list names it (release 2; its Day in the course before)');
});

test('stage (release 1, Work Simulation not out): nothing read, offered, linked or pre-filled; the switch brings it all back', async () => {
    const line = 'GST Work Simulation, MSC Articleship Program | Mar 2026: matched 64 invoices with GSTR-2B.';
    const saved = { earned: [{ domain: 'gst', line }], cvQueue: [{ line }] };
    const off = await stage({ workSimulationLive: false, workSimulation: saved });
    const ws = /work[\s-]?simulation/i;
    assert.doesNotMatch(JSON.stringify(off.cv), ws, 'the blank CV has no Work Simulation gap, and a queued line never arrives');
    assert.equal(off.panel().querySelector('[data-action=add-lines]'), null, 'no "Add N Work Simulation lines"');
    assert.doesNotMatch(off.panel().textContent, ws, 'no "Earn a line" link');
    assert.equal(off.S._state.earned.length, 0, 'saved lines are not even read');
    // Thumbnails: every design's own applicant, without its Work Simulation line or sentence.
    DESIGNS.forEach(d => {
        const preview = off.S.previewSource(d.file);
        assert.ok(preview && preview.personal.name, `design ${d.number}: its applicant`);
        assert.doesNotMatch(JSON.stringify(preview), ws, `design ${d.number}: no Work Simulation`);
        assert.ok(B.plainText(preview.summary).length > 40, `design ${d.number}: the summary still reads`);
    });
    // The starters.
    off.click('[data-action=example]');
    assert.doesNotMatch(JSON.stringify(off.cv), ws, '"Start from the example" without it');
    assert.equal(off.cv.articleshipStarter.startsWith('example:'), true);
    assert.equal(B.untouchedStarter(off.cv, off.S._state.examples, off.S._state.designs), 'example', 'still recognised as the untouched example');
    off.click('[data-action=nothing]');
    assert.doesNotMatch(JSON.stringify(off.cv), ws, 'The Nothing CV without it');
    assert.equal(B.countCertificates(off.cv.certifications).outside, B.OUTSIDE_CAP, 'The Nothing CV keeps its four certificates');
    assert.equal(B.programLine(off.cv), B.programLine(EXAMPLES.H), 'and its programme line');
    assert.doesNotMatch(off.panel().textContent, ws);

    // Release 2: the same saved lines arrive, the blank has its gap, the applicants carry their lines again.
    const on = await stage({ workSimulationLive: true, workSimulation: saved });
    assert.ok(on.cv.certifications.some(c => c.name === line), 'the queued line arrives');
    const blank = await stage({ workSimulationLive: true });
    assert.match(JSON.stringify(blank.cv.certifications), /\[Domain\] Work Simulation/, 'the blank CV\'s Work Simulation gap');
    const withLine = DESIGNS.find(d => ws.test(JSON.stringify(EXAMPLES_JSON.designs[String(d.number)])));
    assert.match(JSON.stringify(blank.S.previewSource(withLine.file)), ws, 'the applicant\'s Work Simulation line is back');
    assert.match(blank.panel().textContent, /Earn a line with your own counts in Work Simulation/, 'and its link');
});

test('releaseExamples: every applicant reads well without the Work Simulation; with it, nothing changes', () => {
    const ws = /work[\s-]?simulation/i;
    const off = B.releaseExamples(EXAMPLES_JSON, { workSimulationLive: false });
    assert.doesNotMatch(JSON.stringify(off), ws);
    assert.deepEqual(B.releaseExamples(EXAMPLES_JSON, { workSimulationLive: true }), EXAMPLES_JSON);
    assert.match(JSON.stringify(EXAMPLES_JSON), ws, 'the content itself is untouched (release 2 shows it)');
    const all = Object.entries(B.allApplicants(B.normaliseExamples(off), B.attachApplicants(B.normaliseDesigns(DESIGNS_JSON, GALLERY), off)));
    assert.equal(all.length, Object.keys(EXAMPLES).length + DESIGNS.length);
    all.forEach(([id, cv]) => {
        const summary = B.plainText(cv.summary);
        assert.match(summary, /^CA Intermediate|^B\.Com/, `${id}: the summary still starts with the result`);
        assert.match(summary, /\.$/, `${id}: ends on a full stop`);
        assert.doesNotMatch(summary, /\s{2}|\.\s*\.|,\s*\./, `${id}: no gaps left where a sentence went`);
        assert.match(summary, /Seeking|Looking for/, `${id}: still says what the applicant wants`);
        const flags = B.checkCv(cv).map(f => f.id).filter(flagId => !['brackets', 'months'].includes(flagId));
        assert.deepEqual(flags, [], `${id}: still passes the checks`);
    });
    // One applicant's lines, sentence by sentence (the rules in MSCArticleshipProgress.releaseText).
    assert.equal(B.plainText(off.personas.A.summary), 'CA Intermediate, both groups, 412/600, with 81 in Advanced Accounting and 78 in Taxation; ICITSS completed. '
        + 'Completed the PwC US Audit Job Simulation. Seeking articleship in statutory audit, to learn how balances and controls are tested on real clients.');
    assert.ok(!off.personas.A.certifications.some(c => ws.test(c.name)), 'its Work Simulation line is gone');
    assert.equal(off.personas.A.certifications.length, EXAMPLES_JSON.personas.A.certifications.length - 1, 'only that line');
});

test('stage: the design picker shows the look-book designs by number and all 62 under "All"', async () => {
    const pick = { situation: 'C', order: [], design: 3, savedAt: 'k3' };
    const s = await stage({ pick, wait: 150 });
    s.host.renderCards();
    const grid = s.doc.getElementById('template-grid');
    assert.equal(grid.querySelectorAll('.template-card').length, DESIGNS.length);
    assert.match(s.doc.querySelector('.asb-tab').textContent, new RegExp(`Designs \\(${DESIGNS.length}\\)`));
    assert.match(grid.textContent, /No\. 1Classic table/);
    assert.ok(grid.querySelector('.asb-tag.is-portal'), 'Portal-safe tag');
    assert.equal(grid.querySelector('[data-number="3"] .asb-tag').textContent, 'Screen');
    assert.match(grid.querySelector('[data-file="articleship-layout-profile-sidebar"]').textContent, /Your pick/);
    assert.equal(grid.querySelector('[data-number="1"] .asb-card-for').textContent, B.bestForLabel(design(1)));
    assert.equal(s.doc.getElementById('template-collection').parentElement.hidden, true);
    assert.match(s.doc.querySelector('.asb-legend').textContent, /Print.*Portal-safe.*Screen/);
    const chips = [...s.doc.querySelectorAll('.asb-chip')];
    assert.deepEqual(chips.map(c => c.dataset.filter), ['all', 'order', 'portal']);
    chips[1].dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
    assert.deepEqual([...grid.querySelectorAll('.template-card')].map(c => Number(c.dataset.number)), B.designsFor(DESIGNS, 'C').map(d => d.number),
        'For order C: the pick, then the ones that also suit it');
    s.doc.querySelector('[data-filter=portal]').dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
    assert.ok([...grid.querySelectorAll('.template-card')].every(c => design(Number(c.dataset.number)).portalSafe));
    s.doc.querySelector('[data-filter=all]').dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
    s.doc.querySelectorAll('.asb-tab')[1].dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
    assert.equal(grid.querySelectorAll('.template-card').length, 62);
    grid.querySelector('[data-file="articleship-layout-clean-rule"]').dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
    assert.equal(s.cv.templateFile, 'articleship-layout-clean-rule');
    assert.equal(s.cv.articleshipStructure, 'C', 'a design never resets the order');
    assert.equal(s.doc.getElementById('asb-filters').hidden, true, 'no design chips on "All"');
    grid.querySelector('[data-file="articleship-layout-structured-grid"]').dispatchEvent(new s.win.MouseEvent('click', { bubbles: true }));
    assert.deepEqual(s.calls.choose.at(-1), ['articleship-layout-structured-grid', 'Structured Grid'], 'other layouts go through the builder\'s own picker');
});

test('stage: thumbnails show each design\'s applicant while the CV is blank; export drops the programme lines', async () => {
    const s = await stage();
    const preview = s.S.previewSource('articleship-layout-profile-sidebar');
    assert.equal(preview.personal.name, design(3).example.personal.name, 'design 3\'s own applicant');
    assert.equal(preview.templateFile, 'articleship-layout-profile-sidebar');
    assert.equal(s.S.layoutName('articleship-layout-profile-sidebar'), `Design 3 · ${design(3).name}`);
    assert.equal(s.S.layoutName('articleship-layout-structured-grid'), null);
    s.click('[data-action=example]');
    assert.equal(s.S.previewSource('articleship-layout-profile-sidebar'), null, 'once a starter is chosen, thumbnails show the student\'s CV');

    const frame = new JSDOM('<!doctype html><body><div id="cv-page"><div data-msc-program-brand="header">MSC Articleship Program | Design 1</div><h1>Riya Shah</h1><div data-msc-program-brand="footer">CA Padam Bhansali | My Student Club</div></div></body>').window.document;
    const html = s.S.exportHtml(frame);
    assert.doesNotMatch(html, /data-msc-program-brand|CA Padam Bhansali/);
    assert.match(html, /Riya Shah/);
    assert.equal(frame.querySelectorAll('[data-msc-program-brand]').length, 2, 'the preview keeps them');
    assert.equal(s.S.exportHtml(new JSDOM('<p>plain</p>').window.document), null, 'other CVs export exactly as before');
});

// ---------- The CV Builder page wiring ----------

test('the CV Builder page loads the stage and calls every hook behind optional chaining', () => {
    const html = fs.readFileSync(path.join(ROOT, 'cv-builder/index.html'), 'utf8');
    const order = ['/scripts/articleship-progress.js', '/scripts/articleship-cv-builder.js', 'cv-script.js', '/articleship-program/cv-builder/stage.js']
        .map(src => html.indexOf(`src="${src}`));
    assert.ok(order.every(index => index > 0), 'all four scripts');
    assert.deepEqual([...order].sort((a, b) => a - b), order, 'in order');
    assert.match(html, /family=Caveat/);
    assert.match(html, /\/articleship-program\/cv-builder\/stage\.css/);
    const script = fs.readFileSync(path.join(ROOT, 'cv-builder/cv-script.js'), 'utf8');
    ['blankCv', 'init', 'renderTemplateCards', 'previewSource', 'theme', 'layoutName', 'onChange', 'exportHtml']
        .forEach(hook => assert.match(script, new RegExp(`MSCArticleshipStage\\?\\.${hook}\\?\\.\\(`), hook));
});

test('the builder\'s articleship start uses the v3 blank CV when the stage is loaded (v2 starter otherwise)', () => {
    const builder = fs.readFileSync(path.join(ROOT, 'cv-builder/cv-script.js'), 'utf8');
    const start = builder.indexOf('function hasArticleshipDraftData');
    const end = builder.indexOf('function articleshipStageHost', start);
    const run = stageApi => {
        const select = { options: [], appendChild(option) { this.options.push(option); } };
        const sandbox = {
            window: { MSCArticleship: catalog, MSCArticleshipStage: stageApi },
            document: { getElementById: id => (id === 'template-select' ? select : {}), createElement: () => ({}) },
            cvData: { personal: {}, education: [] },
            templateCollection: 'articleship',
            getDefaultTableSettings: () => ({ education: {} }),
            hasUserEnteredData: () => false,
            isArticleshipTemplate: file => Boolean(catalog.getTemplate(file))
        };
        vm.runInNewContext(builder.slice(start, end), sandbox);
        sandbox.initializeArticleshipTemplates();
        return sandbox.cvData;
    };
    const v3 = run({ blankCv: (cv, table) => Object.assign(B.createBlank(cv, { structure: 'A' }), { templateFile: 'articleship-layout-classic', tableSettings: table }) });
    assert.equal(v3.articleshipStarter, 'blank');
    assert.equal(v3.templateFile, 'articleship-layout-classic');
    assert.ok(v3.education.some(row => /ICITSS/.test(row.degree)));
    const v2 = run(undefined);
    assert.equal(v2.templateFile, catalog.templates[0].file);
});

test('the stage tool page redirects to the one way in: /cv-builder/?stage=articleship', () => {
    const page = fs.readFileSync(path.join(ROOT, 'articleship-program/cv-builder/index.html'), 'utf8');
    assert.match(page, /\/cv-builder\/\?stage=articleship/);
    assert.match(page, /name="robots" content="noindex"/);
});
