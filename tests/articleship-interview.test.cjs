const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const articleship = require('../scripts/articleship-interview.js');
const P = require('../scripts/articleship-progress.js');

const ROOT = path.join(__dirname, '..');
const CONTENT_PATH = path.join(ROOT, 'articleship-program', 'ai-interview', 'articleship-interview.json');
const content = JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8'));
const html = fs.readFileSync(path.join(ROOT, 'ai-interview.html'), 'utf8');
const BANNED = /ca ?monk|thinking ?bridge|umbrella|needs-check|\bwave\b|drop [abc]\b|live week|coming soon|saved on this device/i;

const SAMPLE_CV = [
    'Riya Sharma',
    'riya.sharma@email.com | 98XXXXXXXX | linkedin.com/in/riya',
    'Completed MSC Articleship Program - foundational understanding of work and tasks across all domains',
    'GST Work Simulation, MSC Articleship Program | Nov 2026: Filled GSTR-1 tables for 40 invoices and matched 3B credit to GSTR-2B',
    'PwC US Audit Job Simulation (Forage) | Oct 2026: tested 12 revenue items',
    'Explained AS 2 inventory valuation to my study group',
    'Advanced Excel: VLOOKUP, XLOOKUP and pivot tables',
    'NISM Series VIII equity derivatives certificate',
    'Reconciled the purchase register of my family business for six months',
    'Summer internship at a trading company, accounts team',
    'Cultural secretary, college commerce association',
    'All India Rank 32 in CA Intermediate',
    'Reading, cricket and chess'
];

function memoryStore(tool, defaults) {
    const map = new Map();
    return P.createStore(tool, {
        storage: { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) },
        client: null, sessionFlags: null, debounceMs: 0, userId: () => null, defaults
    });
}

function allItems(plan) {
    return plan.sections.flatMap(section => section.items);
}

// ---------- the existing page contract ----------
test('articleship requests always describe a new article assistant', () => {
    const original = { positionApplied: 'CA Articleship', experienceLevel: 'Senior', interviewDomain: 'Direct Tax', toughness: 'Brutal' };
    const normalized = articleship.normalizeConfig(original);
    assert.equal(normalized.experienceLevel, 'Fresher');
    assert.equal(normalized.interviewDomain, 'Direct Tax');
    assert.equal(normalized.toughness, 'Hard', 'no stress-interview mode for an incoming article assistant');
    assert.equal(original.experienceLevel, 'Senior');
    const prompt = articleship.getInstructions(normalized);
    assert.match(prompt, /cleared CA Intermediate/);
    assert.match(prompt, /Do not assume prior articleship/);
    assert.match(prompt, /one short question at a time/);
    assert.match(prompt, /If no CV is supplied/);
    assert.match(prompt, /honest response/);
});

test('other roles retain their existing configuration and prompt', () => {
    for (const positionApplied of ['Industrial Trainee', 'CA Fresher', 'Other Finance Role']) {
        const config = { positionApplied, experienceLevel: 'Senior' };
        assert.equal(articleship.normalizeConfig(config), config);
        assert.equal(articleship.getInstructions(config), '');
    }
});

// ---------- content ----------
test('content: the 13 programme domains, every question complete, ids unique, placeholders known', () => {
    assert.deepEqual(Object.keys(content.domains).sort(), P.DOMAINS.map(d => d.slug).sort());
    assert.deepEqual(articleship.DOMAINS.map(d => [d.slug, d.label]), P.DOMAINS.map(d => [d.slug, d.label]));
    assert.deepEqual(content.rounds.map(r => r.id), articleship.ROUNDS.map(r => r.id));
    const questions = [
        ...content.ladder, ...content.core, ...content.situations, ...content.call.questions, ...content.call.pressure,
        ...Object.values(content.domains).flatMap(d => d.questions)
    ];
    const ids = new Set();
    for (const q of questions) {
        assert.ok(q.id && q.q, 'id and question');
        assert.ok(Array.isArray(q.listen_for) && q.listen_for.length, `${q.id} has listen_for`);
        assert.ok(Array.isArray(q.cross), `${q.id} has cross`);
        assert.ok(!ids.has(q.id), `duplicate id ${q.id}`);
        ids.add(q.id);
    }
    for (const domain of Object.values(content.domains)) {
        assert.ok(domain.questions.length >= 5);
        assert.equal(domain.simulation.length, 2);
        assert.ok(domain.why.length && domain.other);
    }
    const text = JSON.stringify(content);
    assert.deepEqual([...new Set(text.match(/\{[a-z_]+\}/g))].sort(), ['{domain}', '{firm}', '{hook}', '{other_domain}']);
    assert.doesNotMatch(text, BANNED);
    assert.equal(content.ladder.length, 16, 'the sixteen-question ladder');
    assert.equal(content.rubric.default.length, 8, 'the eight-row scorecard');
});

test('content in the repo matches the content build when it is on this machine', (t) => {
    const built = '/Users/padambhansali/development/msc-content/articleship-program/v3/build/day-4/4.13/articleship-interview.json';
    if (!fs.existsSync(built)) return t.skip('content build not on this machine');
    assert.deepEqual(JSON.parse(fs.readFileSync(built, 'utf8')), content);
});

// ---------- CV lines ----------
test('CV text: bullets split, wrapped lines joined, contact lines and headings dropped', () => {
    const lines = articleship.cvLinesFromText([
        'EDUCATION', 'riya.sharma@email.com', 'Mobile: 98765 43210',
        '• Reconciled the purchase register of my family business',
        'for six months and found 4 missing invoices',
        '• Advanced Excel: VLOOKUP, pivot tables • Tally Prime',
        'Skills:', '2023 - 2025'
    ].join('\n'));
    assert.deepEqual(lines, [
        'Reconciled the purchase register of my family business for six months and found 4 missing invoices',
        'Advanced Excel: VLOOKUP, pivot tables',
        'Tally Prime'
    ]);
    assert.ok(!lines.some(line => /@|98765/.test(line)), 'no contact details reach the interviewer');
    assert.ok(!lines.includes('EDUCATION'));
    assert.ok(lines.includes('Reconciled the purchase register of my family business for six months and found 4 missing invoices'));
    assert.ok(lines.includes('Tally Prime'));
});

test('CV from a PDF text layer: rows rebuilt top to bottom, left to right', () => {
    const lines = articleship.cvLinesFromPdfItems([
        { str: 'Advanced Excel:', x: 50, y: 600, page: 1 },
        { str: 'pivot tables and XLOOKUP', x: 140, y: 600.8, page: 1 },
        { str: 'GST Work Simulation, MSC Articleship Program', x: 50, y: 700, page: 1 },
        { str: 'Reading and chess', x: 50, y: 750, page: 2 }
    ]);
    assert.deepEqual(lines, ['GST Work Simulation, MSC Articleship Program', 'Advanced Excel: pivot tables and XLOOKUP', 'Reading and chess']);
});

test('CV Builder CV: every section becomes lines; placeholder name is not shown', () => {
    const data = {
        personal: { name: '[Your name]', email: 'x@y.com' },
        summary: '<p>CA Intermediate cleared in both groups.</p>',
        education: [{ degree: 'CA Intermediate', institute: 'ICAI', year: '2026', marks: '312/600', remarks: 'Exemption in 2 subjects' }],
        experience: [{ role: 'Intern', company: 'Trading company', bullets: ['Prepared 30 sales invoices a week in Tally'] }],
        projects: [{ title: 'Annual report project', description: 'Ratios for a listed FMCG company', bullets: [] }],
        certifications: [{ name: 'Direct tax Work Simulation, MSC Articleship Program', issuer: '' }, 'SEBI investor awareness test'],
        achievements: ['Won the college quiz'],
        leadership: ['Treasurer, commerce association'],
        interests: ['Chess', 'Trekking'],
        skills: '<p>MS Excel, Tally</p>',
        customSections: [{ title: 'Languages', items: ['English', 'Hindi'] }]
    };
    const lines = articleship.cvLinesFromBuilder(data);
    assert.equal(articleship.builderName(data), '');
    assert.equal(articleship.builderName({ personal: { name: 'Riya Sharma' } }), 'Riya Sharma');
    for (const expected of ['CA Intermediate cleared in both groups.', 'Prepared 30 sales invoices a week in Tally',
        'Direct tax Work Simulation, MSC Articleship Program', 'Skills: MS Excel, Tally', 'Interests: Chess, Trekking', 'Treasurer, commerce association']) {
        assert.ok(lines.includes(expected), `missing: ${expected}`);
    }
    assert.ok(!lines.some(line => line.includes('<')), 'no HTML');
    assert.deepEqual(articleship.cvLinesFromBuilder(null), []);
});

test('CV probes: each kind of line gets its own probe; a Work Simulation line brings its two interview questions', () => {
    const matches = articleship.matchCvProbes(SAMPLE_CV, content);
    const type = line => (matches.find(m => m.line === line) || {}).type;
    assert.equal(type(SAMPLE_CV[2]), 'programme');
    assert.equal(type(SAMPLE_CV[3]), 'simulation');
    assert.equal(type(SAMPLE_CV[4]), 'simulation');
    assert.equal(type(SAMPLE_CV[5]), 'standard');
    assert.equal(type(SAMPLE_CV[6]), 'tool');
    assert.equal(type(SAMPLE_CV[7]), 'course');
    assert.equal(type(SAMPLE_CV[8]), 'project');
    assert.equal(type(SAMPLE_CV[9]), 'work');
    assert.equal(type(SAMPLE_CV[10]), 'role');
    assert.equal(type(SAMPLE_CV[11]), 'achievement');
    assert.equal(type(SAMPLE_CV[12]), 'hobby');
    assert.equal(type(SAMPLE_CV[0]), undefined, 'a name is not probed');
    const edu = articleship.matchCvProbes(['CA Intermediate | ICAI | Both groups in one sitting | Exemption in 2 subjects', 'B.Com, Pune University | 2025 | 78%', 'Member of the cultural committee'], content);
    assert.equal(edu[0].type, 'achievement', 'an exemption is an achievement, not a course ("sitting" is not ITT)');
    assert.equal(edu.length, 2, 'a plain degree row is not probed as a course');
    assert.equal(edu[1].type, 'role', '"committee" is not ITT');
    const did = articleship.matchCvProbes([
        'Three months as an intern in a 12-person CA firm: vouching, GSTR-1 data and a stock count.',
        'Prepared GSTR-1 data for 6 clients from their sales registers in Excel.',
        'Prepared TDS working for 10 salaried clients',
        'Read SA 500 and SA 230 before my internship interview',
        'ICITSS (OC + ITT) | ICAI | Completed | Group lead, OC case presentation'
    ], content);
    assert.deepEqual(did.map(m => m.type), ['work', 'project', 'project', 'standard', 'course'],
        'a line that reports work done is probed as work, not as "explain the standard"');

    assert.equal(articleship.simulationDomain(SAMPLE_CV[3]), 'gst');
    assert.equal(articleship.simulationDomain('Statutory audit Work Simulation, MSC Articleship Program | Vouched 20 bills'), 'statutory-audit');
    assert.equal(articleship.simulationDomain('Direct tax Work Simulation, MSC Articleship Program: checked 8 tax-audit items'), 'direct-tax');

    const technical = articleship.pickCvProbes(matches, 'technical', 4, content);
    assert.equal(technical[0].line, SAMPLE_CV[3], 'technical round starts with the Work Simulation line');
    for (const q of content.domains.gst.simulation) assert.ok(technical[0].cross.includes(q));
    const forage = articleship.pickCvProbes(matches.filter(m => m.line === SAMPLE_CV[4]), 'full', 1, content)[0];
    assert.ok(!forage.cross.some(q => content.domains.gst.simulation.includes(q)), 'outside simulations get only the general cross-questions');
    const hr = articleship.pickCvProbes(matches, 'hr', 2, content);
    assert.deepEqual(hr.map(p => p.type), ['role', 'achievement']);
    const full = articleship.pickCvProbes(matches, 'full', 3, content);
    assert.deepEqual(full.map(p => p.type), ['simulation', 'work', 'programme'], 'a full interview asks about the internship early');
    assert.deepEqual(articleship.pickCvProbes(matches, 'call', 3, content), []);
});

// ---------- the plan ----------
test('every round builds a plan for every domain, with no unfilled placeholders', () => {
    for (const round of content.rounds) {
        for (const domain of Object.keys(content.domains)) {
            const plan = articleship.buildPlan(content, { round: round.id, domain, seed: 7, cvLines: SAMPLE_CV });
            assert.equal(plan.round, round.id);
            assert.equal(plan.domain, domain);
            assert.ok(allItems(plan).length >= 8, `${round.id}/${domain} has questions`);
            const prompt = articleship.renderPrompt(plan);
            assert.doesNotMatch(prompt, /\{(domain|firm|hook|other_domain)\}/);
            assert.doesNotMatch(prompt, BANNED);
            assert.ok(prompt.length < 16000, `${round.id}/${domain} prompt stays compact (${prompt.length})`);
        }
    }
});

test('full interview: intro, CV lines, HR, core, the domain, a situation, then questions for us', () => {
    const plan = articleship.buildPlan(content, { round: 'full', domain: 'gst', firm: 'Mehta & Co', seed: 1, cvLines: SAMPLE_CV });
    assert.deepEqual(plan.sections.map(s => s.id), ['opening', 'cv', 'hr', 'core', 'domain', 'situation', 'close']);
    const items = id => plan.sections.find(s => s.id === id).items;
    assert.equal(items('opening')[0].id, 'intro');
    assert.equal(items('cv').length, 3);
    assert.deepEqual(items('hr').map(i => i.id).filter(id => ['why-domain', 'why-firm', 'attempts'].includes(id)), ['why-domain', 'why-firm', 'attempts']);
    assert.equal(items('core').length, 5, 'five Core questions');
    assert.equal(new Set(items('core').map(i => content.core.find(c => c.id === i.id).topic)).size, 5, 'core questions span five topics');
    assert.equal(items('domain').length, 5, 'five from the domain booklet');
    assert.ok(items('domain').every(i => content.domains.gst.questions.some(q => q.id === i.id)));
    assert.equal(items('close')[0].id, 'questions-for-us');
    const whyDomain = items('hr').find(i => i.id === 'why-domain');
    assert.equal(whyDomain.q, 'Why do you want to work in GST?');
    assert.ok(whyDomain.cross.includes('Why GST and not direct tax?'));
    assert.ok(whyDomain.listen_for.some(l => l.startsWith('For GST:')));
    assert.match(items('hr').find(i => i.id === 'why-firm').q, /join Mehta & Co,/);
    assert.equal(plan.rubric.length, 8);
});

test('HR round asks the whole ladder in order; technical round skips HR but keeps why-domain', () => {
    const hr = articleship.buildPlan(content, { round: 'hr', domain: 'direct-tax', seed: 3 });
    const ids = allItems(hr).map(i => i.id);
    const ladderIds = content.ladder.map(i => i.id);
    assert.deepEqual(ids.filter(id => ladderIds.includes(id)), ladderIds);
    assert.equal(ids[0], 'intro');
    assert.equal(ids[ids.length - 1], 'questions-for-us');
    assert.equal(hr.sections.find(s => s.id === 'situation').items.length, 2);
    assert.ok(!hr.sections.some(s => s.id === 'core' || s.id === 'domain'));

    const tech = articleship.buildPlan(content, { round: 'technical', domain: 'statutory-audit', seed: 3, cvLines: SAMPLE_CV });
    const techIds = allItems(tech).map(i => i.id);
    assert.ok(techIds.includes('why-domain'));
    assert.ok(!techIds.includes('weakness') && !techIds.includes('five-years'));
    assert.equal(tech.sections.find(s => s.id === 'domain').items.length, 6);
    const situation = tech.sections.find(s => s.id === 'situation').items[0].id;
    assert.ok(['sit-fake-voucher', 'sit-round-sum', 'sit-untested', 'sit-ignore', 'sit-own-error', 'sit-data'].includes(situation));
});

test('HR call: the screening questions in order, pressure moments by toughness, the call scorecard', () => {
    const standard = articleship.buildPlan(content, { round: 'call', domain: 'gst', firm: '', seed: 2, cvLines: SAMPLE_CV });
    assert.deepEqual(standard.sections.find(s => s.id === 'call').items.map(i => i.id), content.call.questions.map(q => q.id));
    assert.equal(standard.sections.find(s => s.id === 'pressure').items.length, 1);
    assert.ok(!standard.sections.some(s => s.id === 'cv'));
    assert.equal(standard.rubric.length, content.rubric.call.length);
    assert.match(articleship.welcomeLine(standard), /calling from the CA firm you applied to/);
    const tough = articleship.buildPlan(content, { round: 'call', domain: 'gst', toughness: 'Hard', seed: 2 });
    assert.deepEqual(tough.sections.find(s => s.id === 'pressure').items.map(i => i.id), content.call.pressure.map(q => q.id));
    const prompt = articleship.renderPrompt(tough);
    assert.match(prompt, /HR executive at our firm/);
    assert.match(prompt, /We don't have an opening in GST right now, but we do in direct tax/);
    assert.match(prompt, /CLOSING THE CALL/);
    assert.match(prompt, /Truthful facts: attempts, ICITSS, joining date, other offers/);
});

test('questions rotate: the next practice prefers questions not asked before', () => {
    const first = articleship.buildPlan(content, { round: 'full', domain: 'internal-audit', seed: 11 });
    const data = articleship.markAsked({}, first);
    assert.ok(Object.values(data.asked).every(n => n === 1));
    assert.ok(!Object.keys(data.asked).some(id => /^cv-|^retry-/.test(id)));
    const second = articleship.buildPlan(content, { round: 'full', domain: 'internal-audit', seed: 11, asked: data.asked });
    const domainIds = plan => plan.sections.find(s => s.id === 'domain').items.map(i => i.id);
    const overlap = domainIds(second).filter(id => domainIds(first).includes(id));
    assert.equal(overlap.length, 0, 'eleven internal-audit questions: five new ones next time');
    const again = articleship.buildPlan(content, { round: 'full', domain: 'internal-audit', seed: 11 });
    assert.deepEqual(allItems(again).map(i => i.id), allItems(first).map(i => i.id), 'same seed, same plan');
});

test('retry questions from the last scorecard come straight after the introduction', () => {
    const plan = articleship.buildPlan(content, { round: 'technical', domain: 'gst', seed: 5, retry: ['Walk me through GSTR-2B again.', 'Pass the RCM entry.'] });
    assert.deepEqual(plan.sections.slice(0, 2).map(s => s.id), ['opening', 'retry']);
    assert.deepEqual(plan.sections[1].items.map(i => i.q), ['Walk me through GSTR-2B again.', 'Pass the RCM entry.']);
});

test('the interviewer instructions carry the rules, coaching, CV and the scorecard format', () => {
    const plan = articleship.buildPlan(content, { round: 'full', domain: 'valuation', toughness: 'Easy', coach: true, seed: 4, cvLines: SAMPLE_CV, firm: 'Rao <b>Associates</b>' });
    assert.equal(plan.firm, 'Rao bAssociates/b', 'markup characters are stripped from the firm name');
    const config = articleship.normalizeConfig({ positionApplied: 'CA Articleship', experienceLevel: 'Senior', articleshipPlan: plan });
    const prompt = articleship.getInstructions(config);
    for (const rule of content.interviewer_rules) assert.ok(prompt.includes(rule));
    assert.ok(prompt.includes(content.coach));
    assert.match(prompt, /Friendly: warm and encouraging/);
    assert.match(prompt, /cleared CA Intermediate/);
    assert.match(prompt, /one short question at a time/i);
    assert.match(prompt, /THE CANDIDATE'S CV/);
    assert.match(prompt, /<row number>\. <row name> \| <score>\/4 \| Evidence:/);
    assert.match(prompt, /not a hiring prediction/);
    assert.match(prompt, /Opening already spoken by you: "Hello, I'm Aditya, your interviewer today for the valuation team at Rao bAssociates\/b\. Please introduce yourself\."/);
    assert.ok(!prompt.includes('98XXXXXXXX') && !prompt.includes('@email.com'), 'contact lines never reach the interviewer');
    const noCv = articleship.renderPrompt(articleship.buildPlan(content, { round: 'full', domain: 'valuation', seed: 4 }));
    assert.match(noCv, /No CV was shared/);
    assert.ok(!noCv.includes('B. Their CV lines'));
});

// ---------- the scorecard ----------
test('scorecard: the interviewer\'s 1-4 rows are read back, weak rows give the retry questions', () => {
    const rubric = content.rubric.default;
    const report = [
        'Thank you. Here is your report.',
        '**1. Opening and introduction | 3/4 | Evidence: "I am Riya from Pune, I cleared Inter in May" | Fix: Lead with your hook. | Retry: Introduce yourself in 45 seconds.**',
        '2. Fit: why this firm and this domain | 2/4 | Evidence: "Your firm is very good" | Fix: Give two checkable reasons. | Retry: Why our GST team?',
        '- 3. Attempts and facts told truthfully | 4 / 4 | Evidence: "Group 1 in May, group 2 in November" | Fix: Keep it. | Retry: Any gap after Foundation?',
        '4. Stories: situation, action, result | n/a | Evidence: Not covered | Fix: - | Retry: -',
        '5. Technical accuracy | 1/4 | Evidence: "GST is income" | Fix: Output tax is a liability. | Retry: Pass the entry for a sale with GST.',
        '6. Handling "I don\'t know" | 3/4 | Evidence: "I have not studied that yet" | Fix: Add what you would check. | Retry: What is IMS?',
        '7. Communication: clarity, pace, English | 3/4 | Evidence: "basically, basically" | Fix: Drop fillers. | Retry: Explain RCM in two lines.',
        '8. Professionalism and questions asked | 2/4 | Evidence: "What is the stipend?" | Fix: Ask about the work first. | Retry: What would you ask us?'
    ].join('\n');
    const card = articleship.parseScorecard(report, rubric);
    assert.deepEqual(card.rows.map(r => r.score), [3, 2, 4, null, 1, 3, 3, 2]);
    assert.deepEqual([card.rows[3].evidence, card.rows[3].fix, card.rows[3].retry], ['', '', ''], '"Not covered" and "-" are left empty');
    assert.equal(card.total, 18);
    assert.equal(card.max, 28);
    assert.equal(card.rows[0].evidence, 'I am Riya from Pune, I cleared Inter in May');
    assert.equal(card.rows[4].fix, 'Output tax is a liability.');
    assert.deepEqual(card.retry, ['Pass the entry for a sale with GST.', 'Why our GST team?', 'What would you ask us?']);
    assert.equal(articleship.parseScorecard('Great interview, well done.', rubric), null);
    assert.equal(articleship.parseScorecard('', rubric), null);
});

// ---------- the setup screen ----------
test('setup screen: four rounds, 13 domains, my domain preselected, one main button, short copy', async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>');
    const container = dom.window.document.getElementById('root');
    const store = memoryStore('ai-interview', { last: null, asked: {}, retry: [] });
    const progress = { getMyDomain: () => 'gst' };
    let started = null;
    articleship.mountSetup(container, {
        content, store, progress,
        cvSources: [{ kind: 'builder', label: 'CV Builder', detail: 'Riya Sharma', lines: SAMPLE_CV.slice(2) }],
        onStart: setup => { started = setup; return Promise.resolve(); }
    });
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('input[name="aii-round"]').length, 4);
    assert.equal(doc.querySelectorAll('#aii-domain option').length, 13);
    assert.equal(doc.getElementById('aii-domain').value, 'gst');
    assert.equal(doc.querySelectorAll('button[type="submit"]').length, 1);
    assert.equal(doc.querySelector('.ap-brand').getAttribute('href'), articleship.BACK_URL);
    assert.equal(doc.querySelector('.ap-title').textContent, 'Your mock interview');
    assert.equal(doc.querySelector('.ap-topbar-title').textContent, 'Practise your interview');
    assert.equal(doc.querySelector('input[name="aii-cv"]:checked').value, 'builder');
    const visible = container.cloneNode(true);
    visible.querySelectorAll('option').forEach(option => option.remove());
    const words = visible.textContent.replace(/\s+/g, ' ').trim().split(' ').length;
    assert.ok(words <= 95, `about 80 words on screen (${words})`);
    assert.doesNotMatch(container.textContent, BANNED);
    assert.doesNotMatch(container.textContent, /privacy|version|stipend|\b20\d\d\b/i);

    doc.querySelector('input[name="aii-round"][value="technical"]').checked = true;
    doc.getElementById('aii-firm').value = 'Rao & Associates';
    doc.querySelector('input[name="aii-toughness"][value="Hard"]').checked = true;
    doc.getElementById('aii-coach').checked = true;
    doc.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 0));
    assert.equal(started.round, 'technical');
    assert.equal(started.domain, 'gst');
    assert.equal(started.firm, 'Rao & Associates');
    assert.equal(started.toughness, 'Hard');
    assert.equal(started.coach, true);
    assert.equal(started.cv.kind, 'builder');
    assert.equal(started.cv.lines.length, SAMPLE_CV.length - 2);
    assert.deepEqual(store.get().last, { round: 'technical', domain: 'gst', myDomain: 'gst', firm: 'Rao & Associates', firmType: 'mid', toughness: 'Hard', coach: true });

    // Next visit: the last choices come back.
    const dom2 = new JSDOM('<!doctype html><div id="root"></div>');
    articleship.mountSetup(dom2.window.document.getElementById('root'), { content, store, progress });
    assert.equal(dom2.window.document.querySelector('input[name="aii-round"]:checked').value, 'technical');
    assert.equal(dom2.window.document.querySelector('input[name="aii-toughness"]:checked').value, 'Hard');
    assert.equal(dom2.window.document.getElementById('aii-firm').value, 'Rao & Associates');
    assert.equal(dom2.window.document.querySelector('input[name="aii-cv"]:checked').value, 'pdf', 'no saved CV: upload is the default');
});

test('setup screen: an upload without a file asks for it; retry questions are offered once', async () => {
    const dom = new JSDOM('<!doctype html><div id="root"></div>');
    const doc = dom.window.document;
    const store = memoryStore('ai-interview', { last: null, asked: {}, retry: [] });
    store.update(d => { d.retry = ['Why our GST team?', 'Pass the entry for a sale with GST.']; return d; });
    let started = null;
    articleship.mountSetup(doc.getElementById('root'), { content, store, onStart: setup => { started = setup; } });
    assert.match(doc.querySelector('.aii-retry').textContent, /2 retry questions/);
    doc.querySelector('input[name="aii-round"][value="call"]').checked = true;
    doc.querySelector('input[name="aii-round"][value="call"]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(doc.querySelector('.aii-retry').hidden, true, 'interview retries are not asked on a screening call');
    doc.querySelector('input[name="aii-round"][value="full"]').checked = true;
    doc.querySelector('input[name="aii-round"][value="full"]').dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    assert.equal(doc.querySelector('.aii-retry').hidden, false);
    doc.querySelector('input[name="aii-round"][value="call"]').checked = true;
    doc.querySelector('input[name="aii-cv"][value="none"]').checked = true;
    doc.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 0));
    assert.deepEqual(started.retry, [], 'a call never takes interview retries');
    assert.equal(store.get().retry.length, 2, 'they wait for the next interview');
    started = null;
    doc.querySelector('input[name="aii-round"][value="full"]').checked = true;
    doc.querySelector('input[name="aii-cv"][value="pdf"]').checked = true;
    doc.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    assert.equal(started, null);
    assert.match(doc.querySelector('.aii-error').textContent, /Choose your CV file, or pick No CV/);
    assert.ok(doc.querySelector('.aii-choose'), 'a Choose button is shown for the upload');
    doc.querySelector('input[name="aii-cv"][value="none"]').checked = true;
    doc.querySelector('form').dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    await new Promise(r => setTimeout(r, 0));
    assert.deepEqual(started.retry, ['Why our GST team?', 'Pass the entry for a sale with GST.']);
    assert.deepEqual(started.cv, { kind: 'none' });
    assert.deepEqual(store.get().retry, [], 'used once');
});

test('scorecard renders as text (never HTML) with a weak-spots button', () => {
    const dom = new JSDOM('<!doctype html><section id="sc"></section>');
    const doc = dom.window.document;
    const card = articleship.parseScorecard([
        '1. Opening and introduction | 2/4 | Evidence: "<img src=x onerror=alert(1)>" | Fix: Lead with your hook. | Retry: Introduce yourself again.',
        '2. Fit: why this firm and this domain | 4/4 | Evidence: "two reasons" | Fix: Keep it. | Retry: Why us?',
        '3. Attempts and facts told truthfully | 3/4 | Evidence: "both groups in May" | Fix: Add months. | Retry: Group-wise?'
    ].join('\n'), content.rubric.default);
    let retried = null;
    articleship.renderScorecard(doc.getElementById('sc'), card, { onRetry: list => { retried = list; } });
    assert.equal(doc.querySelectorAll('.aii-sc-row').length, 8);
    assert.equal(doc.querySelectorAll('img').length, 0);
    assert.equal(doc.querySelector('.aii-sc-total').textContent, '9 / 12');
    assert.equal(doc.querySelectorAll('.aii-sc-row.is-weak').length, 1);
    assert.equal(doc.querySelectorAll('.aii-sc-row.is-skipped').length, 5);
    assert.equal(doc.querySelector('.aii-sc-row.is-skipped .aii-sc-score').textContent, 'Not asked');
    doc.querySelector('.aii-sc-again').click();
    assert.deepEqual(retried, ['Introduce yourself again.']);
});

// ---------- the page wiring ----------
test('page: articleship mode is wired into /ai-interview.html', () => {
    for (const src of ['/scripts/supabase-init.js', '/scripts/articleship-progress.js', '/scripts/articleship-interview.js']) {
        assert.ok(html.includes(`<script src="${src}"></script>`), src);
    }
    assert.ok(html.indexOf('/scripts/supabase-init.js') < html.indexOf('/scripts/articleship-progress.js'));
    assert.ok(html.includes('href="/articleship-program/shared/articleship-tools.css"'));
    assert.ok(html.includes('href="/articleship-program/ai-interview/ai-interview.css"'));
    assert.ok(html.includes('family=Caveat'));
    assert.ok(html.includes('<div id="ap-interview-setup" class="aii-shell hidden"></div>'));
    assert.ok(html.includes('<section id="ap-scorecard" class="aii-sc hidden"'));
    assert.match(html, /const supabase = window\.supabaseClient \|\| window\.supabase\.createClient/);
    assert.equal((html.match(/encodeURIComponent\(window\.location\.pathname \+ window\.location\.search\)/g) || []).length, 2, 'login keeps ?mode=articleship');
    assert.doesNotMatch(html, /encodeURIComponent\(window\.location\.pathname\)/);
    assert.match(html, /if \(isArticleshipMode\(\)\) showArticleshipSetup\(\);\s+else setupScreen\.classList\.remove\('hidden'\);/);
    assert.match(html, /window\.MSCArticleshipInterview\.welcomeLine\(apPlan\)/);
    assert.match(html, /if \(isArticleshipInterview\(\)\) apRenderReport\(reportText\);/);
    assert.match(html, /if \(isArticleshipInterview\(\)\) apTrimAnalysis\(\);/);
    const folder = fs.readFileSync(path.join(ROOT, 'articleship-program', 'ai-interview', 'index.html'), 'utf8');
    assert.match(folder, /\/ai-interview\.html\?mode=articleship/);
    assert.match(folder, /noindex/);
});

test('programme link selects articleship; picking it in the general form opens the articleship setup', () => {
    const start = html.indexOf("        const posSelect = document.getElementById('positionApplied');");
    const end = html.indexOf('\n        // CV Upload Preview', start);
    assert.ok(start !== -1 && end > start);
    const fields = {
        positionApplied: { value: 'Industrial Trainee', addEventListener(type, handler) { this.onChange = handler; } },
        'exp-group': { hidden: false, classList: { toggle(name, value) { fields['exp-group'].hidden = value; } } },
        companyType: { value: 'Corporate' },
        interviewDomain: { value: 'FP&A / Corporate Finance' }
    };
    const opened = [];
    vm.runInNewContext(html.slice(start, end), {
        document: { getElementById: id => fields[id] },
        window: { MSCArticleshipInterview: articleship, location: { search: '?mode=articleship' } },
        URLSearchParams,
        showArticleshipSetup: options => opened.push(options)
    });
    assert.equal(fields.positionApplied.value, 'CA Articleship');
    assert.equal(fields['exp-group'].hidden, true);
    assert.equal(fields.companyType.value, 'Mid-Size');
    assert.equal(fields.interviewDomain.value, 'Statutory Audit');
    assert.equal(opened.length, 0, 'the URL route opens the setup only after the login check');
    fields.positionApplied.value = 'Industrial Trainee';
    fields.positionApplied.onChange();
    assert.equal(fields['exp-group'].hidden, false);
    assert.equal(fields.companyType.value, 'Corporate');
    assert.equal(fields.interviewDomain.value, 'FP&A / Corporate Finance');
    fields.positionApplied.value = 'CA Articleship';
    fields.positionApplied.onChange();
    assert.equal(JSON.stringify(opened), JSON.stringify([{ fromDropdown: true }]));
});

test('the articleship glue runs: setup, CV sources, interview config and the report', async () => {
    const start = html.indexOf('        // --- ARTICLESHIP MODE');
    const end = html.indexOf('\n        async function processPdfToImages', start);
    assert.ok(start !== -1 && end > start);
    const dom = new JSDOM(`<!doctype html><body>
        <div id="setup-screen"></div><div id="ap-interview-setup" class="hidden"></div>
        <div id="permissions-modal"><p class="permissions-text">old</p></div>
        <div id="report-meta"></div><section id="ap-scorecard" class="hidden"></section>
        <div id="analysis-overview"><span class="analysis-overview-label">Overall Fit</span></div></body>`, { url: 'https://www.mystudentclub.com/ai-interview.html?mode=articleship' });
    const { window } = dom;
    window.localStorage.setItem('cv_maker_data', JSON.stringify({ personal: { name: 'Riya Sharma' }, certifications: SAMPLE_CV.slice(2, 6) }));
    window.MSCArticleshipInterview = articleship;
    window.MSCArticleshipProgress = { open: () => memoryStore('ai-interview', { last: null, asked: {}, retry: [] }), getMyDomain: () => 'direct-tax' };
    window.scrollTo = () => {};
    const calls = { proceed: 0 };
    const context = {
        window, document: window.document, localStorage: window.localStorage, history: window.history, URL, URLSearchParams,
        console: { warn() {}, error() {}, log() {} },
        fetch: async () => ({ ok: true, json: async () => content }),
        setupScreen: window.document.getElementById('setup-screen'),
        currentRoleSpan: { textContent: '' },
        reportMeta: window.document.getElementById('report-meta'),
        analysisOverviewReco: null, analysisRecommendation: null, analysisOverviewPills: null,
        escapeHtml: s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
        formatDateTime: () => '20 Oct',
        interviewStartedAt: '', cvImages: null, interviewConfig: null,
        proceedToInterview: async () => { calls.proceed += 1; },
        processPdfToImages: async () => [],
        pdfjsLib: null
    };
    vm.runInNewContext(html.slice(start, end) + `
        ;globalThis.__api = { showArticleshipSetup, startArticleshipInterview, apRenderReport, apTrimAnalysis, getConfig: () => interviewConfig };`, context);
    const api = context.__api;
    await api.showArticleshipSetup();
    const doc = window.document;
    assert.ok(!doc.getElementById('ap-interview-setup').classList.contains('hidden'));
    assert.ok(doc.body.classList.contains('aii-mode'));
    assert.equal(doc.querySelector('.permissions-text').textContent, 'Allow the microphone so the interviewer can hear your answers.');
    assert.equal(doc.getElementById('aii-domain').value, 'direct-tax');
    assert.equal(doc.querySelector('input[name="aii-cv"]:checked').value, 'builder');
    assert.match(doc.querySelector('.aii-note').textContent, /Riya Sharma/);

    await api.startArticleshipInterview({ round: 'technical', domain: 'direct-tax', firm: '', firmType: 'small', toughness: 'Medium', coach: false, retry: [], cv: { kind: 'builder', lines: SAMPLE_CV.slice(2) } });
    const config = api.getConfig();
    assert.equal(calls.proceed, 1);
    assert.equal(config.positionApplied, 'CA Articleship');
    assert.equal(config.interviewDomain, 'Direct tax');
    assert.equal(config.companyType, 'Small CA Firm');
    assert.equal(config.duration, 20);
    assert.equal(config.articleshipPlan.round, 'technical');
    assert.ok(config.articleshipPlan.sections.find(s => s.id === 'cv').items.length >= 3);
    assert.equal(context.cvImages.length, 0, 'a text CV is sent as text, not as page images');
    assert.equal(context.currentRoleSpan.textContent, 'Technical round · Direct tax');
    assert.match(articleship.getInstructions(config), /THE PLAN/);

    context.interviewConfig = config;
    api.apRenderReport('1. Opening and introduction | 3/4 | Evidence: "x" | Fix: y | Retry: z\n2. Fit: why this firm and this domain | 2/4 | Evidence: "a" | Fix: b | Retry: c\n5. Technical accuracy | 1/4 | Evidence: "d" | Fix: e | Retry: f');
    assert.ok(!doc.getElementById('ap-scorecard').classList.contains('hidden'));
    assert.match(doc.getElementById('report-meta').textContent, /Technical round/);
    assert.match(doc.getElementById('report-meta').textContent, /Small firm/);
    api.apTrimAnalysis();
    assert.equal(doc.querySelector('.analysis-overview-label').textContent, 'Practice score');
});
