const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const T = require('../scripts/articleship-interview-tracker.js');
const C = require('../scripts/articleship-checklist.js');
const P = require('../scripts/articleship-progress.js');
const Lms = require('../scripts/articleship-lms.js');
const Interview = require('../scripts/articleship-interview.js');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'articleship-program/interview-tracker/index.html');
const CSS = path.join(ROOT, 'articleship-program/interview-tracker/interview-tracker.css');
const CONTENT_FILE = path.join(ROOT, 'articleship-program/interview-tracker/syllabus.json');
const CONTENT = JSON.parse(fs.readFileSync(CONTENT_FILE, 'utf8'));
const LMS_SQL = path.join(ROOT, 'supabase/migrations/202610200002_articleship_program_v3_lms.sql');
const BUILT = path.resolve(ROOT, '../msc-content/articleship-program/v3/build/day-4/4.1/syllabus.json');
const TODAY = '2026-11-02';
const NOW = Date.UTC(2026, 10, 2, 6, 30);

const FAKE_FORM = Object.freeze({
    action: 'https://docs.google.com/forms/d/e/1FAIpQLSdFAKEFORMid_123/formResponse',
    fields: { month: 'entry.101', firm: 'entry.102', city: 'entry.103', domain: 'entry.104', round: 'entry.105', mode: 'entry.106',
        how: 'entry.107', questions: 'entry.108', missed: 'entry.109', task: 'entry.110', outcome: 'entry.111', tip: 'entry.112',
        type: 'entry.113', backup: 'entry.114', stage: 'entry.115', length: 'entry.116', wait: 'entry.117' }
});

function memoryStore(defaults) {
    const map = new Map();
    return P.createStore('interview-tracker', {
        storage: { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v), removeItem: k => map.delete(k) },
        client: null, sessionFlags: null, debounceMs: 0, userId: () => null, defaults: defaults || T.DEFAULTS
    });
}

function fakeSettings(mine, backup) {
    const state = { mine: mine || null, backup: backup || null, calls: [] };
    const listeners = new Set();
    return {
        state,
        getMyDomain: () => state.mine,
        getBackupDomain: () => state.backup,
        setMyDomain(value, extra) {
            state.calls.push([value, extra]);
            state.mine = P.normaliseDomain(value);
            if (extra && 'backup' in extra) state.backup = extra.backup || null;
            listeners.forEach(fn => fn());
        },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    };
}

function pageDom(hash) {
    const html = fs.readFileSync(PAGE, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
    return new JSDOM(html, { url: 'http://127.0.0.1/articleship-program/interview-tracker/' + (hash || '') });
}

function mountTracker(opts) {
    const o = opts || {};
    const dom = pageDom(o.hash);
    const doc = dom.window.document;
    const store = o.store || memoryStore();
    const settings = o.settings || fakeSettings(o.mine, o.backup);
    const app = T.mount(doc.getElementById('app'), CONTENT, {
        store, settings, lms: Lms, checklist: C, domains: P.DOMAINS, now: () => NOW,
        shareForm: o.shareForm, fetch: o.fetch, location: dom.window.location, history: dom.window.history
    });
    return { dom, doc, store, settings, app };
}

/** Every string a student can see in the content (keys and link targets left out). */
function studentText(content) {
    const out = [];
    const walk = (value, key) => {
        if (['id', 'tool', 'href', 'row', 'find', 'part', 'domain'].includes(key)) return;
        if (typeof value === 'string') out.push(value);
        else if (Array.isArray(value)) value.forEach(v => walk(v, ''));
        else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k));
    };
    walk(content, '');
    return out.join('\n');
}

function withoutPages(content) {
    const copy = JSON.parse(JSON.stringify(content));
    copy.sections.forEach(section => section.topics.forEach(topic => { if (topic.read) delete topic.read.page; }));
    return copy;
}

// ---------- content ----------
test('content: the website copy is the content build file (Read pages are the only addition)', t => {
    if (!fs.existsSync(BUILT)) return t.skip('content build not on this machine');
    assert.deepEqual(withoutPages(CONTENT), withoutPages(JSON.parse(fs.readFileSync(BUILT, 'utf8'))),
        'copy build/day-4/4.1/syllabus.json over articleship-program/interview-tracker/syllabus.json, then run build/tools/interview-tracker/wire_pages.mjs');
});

test('content: Core first, then all 13 domains, then the written test and GD; every topic named and explained', () => {
    const model = T.normaliseContent(CONTENT);
    assert.deepEqual(model.sections.filter(s => s.part === 'core').map(s => s.id), ['hr', 'accounts', 'audit-basics', 'tax-basics', 'excel']);
    assert.deepEqual(model.sections.filter(s => s.part === 'domain').map(s => s.domain).sort(), P.DOMAINS.map(d => d.slug).sort(),
        'one section for every programme domain, all built now');
    assert.deepEqual(model.sections.filter(s => s.part === 'after').map(s => s.id), ['written-test', 'gd']);
    const parts = model.sections.map(s => s.part);
    assert.deepEqual(parts, [...parts].sort((a, b) => ['core', 'domain', 'after'].indexOf(a) - ['core', 'domain', 'after'].indexOf(b)), 'in part order');
    assert.ok(model.total >= 87, 'about 87 rows or more (v2 had 71): ' + model.total);
    model.sections.forEach(section => {
        assert.ok(section.topics.length >= 5, section.id + ' has its topics');
        section.topics.forEach(topic => {
            assert.ok(topic.topic.length > 2 && topic.know.length > 20, topic.id + ' has a name and a what-to-know line');
            assert.ok(topic.read, topic.id + ' has a Read link');
        });
    });
    assert.ok(model.sections.find(s => s.id === 'hr').topics.filter(t => t.most).length >= 5, 'often-asked HR topics marked');
    assert.match(model.ready, /^Ready = /);
});

test('content: Read rows are the Day 4 booklets, and every title is a Day 4 row of the v3 course', () => {
    const model = T.normaliseContent(CONTENT);
    const sql = fs.readFileSync(LMS_SQL, 'utf8');
    Object.entries(model.booklets).forEach(([row, title]) => {
        assert.match(row, /^4\.\d+$/);
        assert.ok(sql.includes('"title": "' + title + '"'), title + ' is a row title in the LMS SQL');
        assert.ok(sql.includes('articleship-program-v3/day-4/' + title + '.'), title + ' sits on Day 4');
    });
    model.sections.forEach(section => section.topics.forEach(topic => {
        if (topic.read.href) {
            assert.match(topic.read.href, /^\/(articleship-program\/written-test\/$|articleship-program\/domain-roadmaps\/#[a-z-]+$|ai-interview\.html)/, topic.id + ' links a programme page');
            return;
        }
        assert.ok(model.booklets[topic.read.row], topic.id + ' reads a known booklet: ' + topic.read.row);
        // A topic without `find` opens the booklet at its start (the Interview Guide's firm pages are found by the student).
        if (topic.read.row !== '4.3') assert.ok(topic.read.find.length >= 3, topic.id + ' says what its page shows (find), for wire_pages.mjs');
    }));
});

test('content: the interview-day checklist is here (its one home) with the spec items', () => {
    const items = CONTENT.interviewDay.sections.flatMap(s => s.items.map(i => i.check)).join('\n');
    [/Meet, Teams and Zoom tested/, /Quiet room/, /Formal clothes/, /printed copies of your CV/, /Mark sheets/].forEach(re => assert.match(items, re));
    const model = C.normalise({ sections: CONTENT.interviewDay.sections });
    assert.equal(new Set(model.items.map(i => i.id)).size, model.total, 'unique checklist ids');
    assert.ok(CONTENT.nightBefore.steps.length >= 5);
});

test('content and page: nothing a student must not see', () => {
    // Law years and due dates ("Income-tax Act, 2025", "by 15 June") are facts; a dated schedule ("Nov 2026") is not.
    const banned = /ca ?monk|thinking ?bridge|umbrella|NEEDS-CHECK|\bwaves?\b|drop [abc]\b|live week|coming soon|saved on this device|stipend|\bTL-M\d|\bMS-\d|\bD4-\d|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* 20\d\d\b/i;
    const text = studentText(CONTENT);
    assert.doesNotMatch(text, banned);
    const page = fs.readFileSync(PAGE, 'utf8').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(page, banned);
    const src = fs.readFileSync(path.join(ROOT, 'scripts/articleship-interview-tracker.js'), 'utf8');
    const shown = [...src.matchAll(/el\(doc, '[a-z0-9]+', '[^']*', '([^']+)'\)/g)].map(m => m[1]).join('\n');
    assert.doesNotMatch(shown, banned);
});

// ---------- dates, counts, views ----------
test('days left: countdown states from the interview date', () => {
    assert.equal(T.daysLeft('2026-11-09', TODAY), 7);
    assert.equal(T.countdown('', TODAY).state, 'none');
    assert.deepEqual([T.countdown('2026-11-09', TODAY).state, T.countdown('2026-11-09', TODAY).big], ['future', '7']);
    assert.equal(T.countdown('2026-11-03', TODAY).state, 'tomorrow');
    assert.equal(T.countdown(TODAY, TODAY).state, 'today');
    assert.equal(T.countdown('2026-10-30', TODAY).state, 'past');
    assert.equal(T.isISODate('2026-02-30'), false);
    assert.equal(T.daysLeft('2027-01-01', '2026-12-31'), 1, 'across a year end');
    assert.equal(T.todayISO(new Date(2026, 10, 2, 23, 59)), TODAY, 'the student\'s own calendar day');
});

test('sections: Core, my domain, my second choice, then tests and GD; % counts Ready only', () => {
    const model = T.normaliseContent(CONTENT);
    const ids = T.visibleSections(model, 'gst', 'direct-tax').map(s => s.id);
    assert.deepEqual(ids, ['hr', 'accounts', 'audit-basics', 'tax-basics', 'excel', 'gst', 'direct-tax', 'written-test', 'gd']);
    assert.deepEqual(T.visibleSections(model, null, 'gst').map(s => s.id), ['hr', 'accounts', 'audit-basics', 'tax-basics', 'excel', 'gst', 'written-test', 'gd'],
        'a second choice alone still shows');
    const hr = model.sections.find(s => s.id === 'hr');
    const data = { status: { [hr.topics[0].id]: 'ready', [hr.topics[1].id]: 'learning', [hr.topics[2].id]: 'bogus' } };
    const sum = T.summarise(hr.topics, data);
    assert.equal(sum.ready, 1);
    assert.equal(sum.learning, 1);
    assert.equal(sum.percent, Math.round(100 / hr.topics.length));
    assert.equal(T.statusOf(data, hr.topics[2].id), 'not-started', 'unknown status reads as Not started');
});

test('night before: only Core and my domain, only what is not Ready, often-asked first', () => {
    const model = T.normaliseContent(CONTENT);
    const status = {};
    model.sections.find(s => s.id === 'hr').topics.forEach(t => { status[t.id] = 'ready'; });
    const nb = T.nightBefore(model, { status }, 'gst');
    const ids = nb.groups.map(g => g.section.id);
    assert.deepEqual(ids, ['accounts', 'audit-basics', 'tax-basics', 'excel', 'gst'], 'HR all Ready drops out; no tests, GD or other domains');
    nb.groups.forEach(group => {
        const flags = group.topics.map(t => t.most);
        assert.deepEqual(flags, [...flags].sort((a, b) => Number(b) - Number(a)), group.section.id + ': often-asked first');
    });
    assert.equal(nb.count, nb.groups.reduce((n, g) => n + g.topics.length, 0));
});

// ---------- links ----------
test('Read: the booklet page through the course deep link; the page number only when wired', () => {
    const model = T.normaliseContent(CONTENT);
    assert.equal(T.readHref({ row: '4.6', page: 12, find: 'x' }, model, Lms),
        '/learning-management-system/course?course=msc-articleship-program&session=5&resource=Statutory+audit+booklet&page=12');
    assert.equal(T.readHref(T.normaliseContent({ sections: [{ id: 's', topics: [{ topic: 'A', read: { row: '4.4', find: 'x' } }] }], booklets: { '4.4': 'HR round and GD booklet' } }).sections[0].topics[0].read, model, Lms),
        Lms.resourceLink(4, 'HR round and GD booklet'));
    assert.equal(T.readHref({ row: '9.9' }, model, Lms), '', 'an unknown booklet gives no link');
    assert.equal(T.safeHref('javascript:alert(1)'), '');
    assert.equal(T.readText({ href: '/articleship-program/written-test/' }), 'Practise');
    assert.equal(T.readText({ row: '4.4' }), 'Read');
});

test('links: a programme page not on the branch yet opens its row\'s Day; PAGE_ROWS agrees with the branch', () => {
    Object.entries(T.PAGE_ROWS).forEach(([href, row]) => {
        const onDisk = fs.existsSync(path.join(ROOT, href, 'index.html'));
        assert.equal(row.live, onDisk, href + ': set PAGE_ROWS live to ' + onDisk);
        assert.equal(T.pageHref(href, Lms), onDisk ? href : Lms.resourceLink(row.day, row.title));
        assert.ok(fs.readFileSync(LMS_SQL, 'utf8').includes('"title": "' + row.title + '"'), row.title + ' is an LMS row');
    });
    assert.equal(T.pageHref('/ai-interview.html?mode=articleship', Lms), '/ai-interview.html?mode=articleship');
    assert.equal(T.pageHref('/articleship-program/written-test/', Lms, { '/articleship-program/written-test/': { day: 4, title: 'Written test practice', live: true } }),
        '/articleship-program/written-test/');
    assert.ok(fs.existsSync(path.join(ROOT, 'ai-interview.html')), 'Practise your interview page exists');
    assert.ok(fs.existsSync(path.join(ROOT, 'articleship-program/domain-roadmaps/index.html')), 'the Domain roadmap links need the roadmaps page');
    const roadmaps = JSON.parse(fs.readFileSync(path.join(ROOT, 'articleship-program/domain-roadmaps/roadmaps.json'), 'utf8'));
    const text = JSON.stringify(roadmaps);
    P.DOMAINS.forEach(d => assert.ok(text.includes('"' + d.slug + '"'), 'roadmap card for ' + d.slug));
});

test('wire_pages: contents and index pages are skipped; a numbered question line wins', () => {
    const content = { booklets: { '4.6': 'Statutory audit booklet' }, sections: [{ id: 'sa', topics: [
        { id: 'a', topic: 'A', read: { row: '4.6', find: 'payroll' } },
        { id: 'b', topic: 'B', read: { row: '4.6', find: 's.139' } },
        { id: 'c', topic: 'C', read: { row: '4.6', find: 'not there' } },
        { id: 'd', topic: 'D', read: { href: '/ai-interview.html' } }
    ] }] };
    const index = 'Index\n' + Array.from({ length: 14 }, (_, i) => (i + 1) + '. Question ' + (i + 1) + ' payroll s.139').join('\n');
    const pages = [
        'Statutory audit booklet',
        'A note from me. Payroll is where most articles start.',
        index,
        '12. Walk me through an audit\nThey\'re checking: the stages',
        '13. How would you audit payroll?\nThey\'re checking: ghost employees',
        '14. Who appoints the auditor?\nAnswer: s.139 of the Companies Act'
    ];
    const { content: out, found, missing } = T.resolvePages(content, { '4.6': pages });
    const pageOf = id => out.sections[0].topics.find(t => t.id === id).read.page;
    assert.equal(pageOf('a'), 5, 'the question page, not the note or the index');
    assert.equal(pageOf('b'), 6, 'first body page carrying it when no question line does');
    assert.equal(found, 2);
    assert.deepEqual(missing, [{ id: 'c', row: '4.6', find: 'not there' }]);
    assert.equal(content.sections[0].topics[0].read.page, undefined, 'input left alone');
    assert.equal(T.normaliseContent(out).sections[0].topics[0].read.page, 5);
});

// ---------- My interviews and Share with MSC ----------
test('log entries: cleaned, firm required, month-only and no personal details in what MSC receives', () => {
    assert.equal(T.cleanEntry({ firm: '  ' }), null);
    const entry = T.cleanEntry({ firm: 'Example Audit & Co', city: 'Pune', date: '2026-11-02', domain: 'GST', round: 'Partner', mode: 'Online',
        questions: '1. Tell me about yourself\n- What is RCM?\n\nCall me on 98765 43210 or riya.sharma@email.com', missed: 'Place of supply for services', outcome: 'Next round',
        tip: 'See www.example.com' }, { now: NOW, normaliseDomain: P.normaliseDomain });
    assert.equal(entry.domain, 'gst');
    assert.equal(entry.round, 'Partner');
    assert.deepEqual(T.lines(entry.questions).slice(0, 2), ['Tell me about yourself', 'What is RCM?']);
    assert.equal(T.cleanEntry({ firm: 'X', round: 'Something' }, { now: NOW }).round, 'Technical');
    const payload = T.sharePayload(entry, slug => P.domainLabel(slug));
    assert.equal(payload.month, 'November 2026', 'the month, never the day');
    assert.equal(payload.domain, 'GST');
    assert.doesNotMatch(JSON.stringify(payload), /98765|riya|@|www\./i);
    assert.match(payload.questions, /\[number\] or \[email\]/);
    assert.ok(!('name' in payload) && !('email' in payload) && !('id' in payload) && !('date' in payload));
});

test('log entries: every field of the debrief (firm type, second preference, Inter result, length, time to result); the name is optional', () => {
    assert.equal(T.cleanEntry({ firm: '', type: '' }), null, 'neither a name nor a type');
    assert.equal(T.cleanEntry({ type: 'Something else' }), null, 'only the listed types');
    const typeOnly = T.cleanEntry({ type: 'Mid-size firm', city: 'Indore', questions: 'Q1' }, { now: NOW });
    assert.equal(typeOnly.firm, '');
    assert.equal(T.entryName(typeOnly), 'Mid-size firm', 'the type names the entry when the firm is left out');
    const entry = T.cleanEntry({ firm: 'Example & Co', type: 'Large network', domain: 'statutory-audit', backup: 'Direct tax',
        stage: 'Result awaited', length: '30 to 60 min', wait: 'Within a week', how: 'Mail', round: 'Technical', date: '2026-11-02' },
        { now: NOW, normaliseDomain: P.normaliseDomain });
    assert.deepEqual([entry.type, entry.backup, entry.stage, entry.length, entry.wait], ['Large network', 'direct-tax', 'Result awaited', '30 to 60 min', 'Within a week']);
    assert.equal(T.cleanEntry({ firm: 'X', stage: 'maybe', length: '3 hours', wait: 'soon' }, { now: NOW }).stage, '', 'unknown choices are dropped');
    const full = T.sharePayload(entry, slug => P.domainLabel(slug));
    assert.deepEqual([full.firm, full.type, full.backup, full.stage, full.length, full.wait], ['Example & Co', 'Large network', 'Direct tax', 'Result awaited', '30 to 60 min', 'Within a week']);
    const noName = T.sharePayload(entry, slug => P.domainLabel(slug), { withFirm: false });
    assert.equal(noName.firm, '', 'the student can leave the firm\'s name out');
    assert.equal(noName.type, 'Large network');
    assert.equal(T.sharePayload(Object.assign({}, entry, { backup: 'statutory-audit' }), P.domainLabel).backup, '', 'a second preference equal to the first is not repeated');
    assert.deepEqual(Object.keys(full).sort(), Object.keys(T.SHARE_FORM.fields).sort(), 'SHARE_FORM has an entry slot for every field MSC receives');
});

test('Share with MSC: off while the form URL is empty; with a form, only its entry fields are posted', () => {
    // Empty until the MSC team creates the Google Form (human step H1); then the button shows by itself.
    if (T.SHARE_FORM.action === '') assert.equal(T.shareEnabled(), false);
    else assert.equal(T.shareEnabled(), true, 'SHARE_FORM needs the formResponse URL and at least the firm and questions entry ids');
    assert.equal(T.shareEnabled({ action: 'https://example.com/formResponse', fields: FAKE_FORM.fields }), false, 'only a Google Forms formResponse URL');
    assert.equal(T.shareEnabled(FAKE_FORM), true);
    const body = new URLSearchParams(T.shareBody({ firm: 'A', questions: 'Q1\nQ2', city: '', extra: 'x' }, FAKE_FORM));
    assert.deepEqual([...body.keys()], ['entry.102', 'entry.108']);
    assert.equal(body.get('entry.108'), 'Q1\nQ2');
});

test('merge: two devices keep both logs, deletions win, status per topic', () => {
    const a = { id: 'iv-aaa', firm: 'A', date: '2026-11-01', updatedAt: 5 };
    const b = { id: 'iv-bbb', firm: 'B', date: '2026-11-02', updatedAt: 6 };
    const bNew = Object.assign({}, b, { firm: 'B2', updatedAt: 9 });
    const merged = T.mergeData(
        { status: { x: 'ready' }, log: [a, bNew], logDeleted: {}, interviewDate: '' },
        { status: { y: 'learning' }, log: [b, { id: 'iv-ccc', firm: 'C', date: '2026-10-30' }], logDeleted: { 'iv-ccc': 1 }, interviewDate: '2026-11-09' });
    assert.deepEqual(merged.status, { x: 'ready', y: 'learning' });
    assert.deepEqual(merged.log.map(e => e.firm), ['B2', 'A'], 'newest edit kept, deleted entry gone, newest first');
    assert.equal(merged.interviewDate, '2026-11-09');
});

test('merge: a stale phone tab never undoes the laptop\'s newer work (per-key times)', () => {
    // The phone saw x as Learning at t=100 and the old date; the laptop then marked x Ready and moved the date (t=200);
    // then the phone, still on its old copy, edits only topic y (t=300).
    const base = { status: { x: 'learning' }, statusAt: { x: 100 }, interviewDate: '2026-11-09', interviewDateAt: 100,
        notes: { x: 'old note' }, notesAt: { x: 100 }, dates: {}, datesAt: {}, dayTicks: { a: true }, dayTicksAt: { a: 100 }, dayMode: 'online', dayModeAt: 100 };
    const laptop = Object.assign({}, base, {
        status: { x: 'ready' }, statusAt: { x: 200 }, interviewDate: '2026-11-12', interviewDateAt: 200,
        notes: { x: 'new note' }, notesAt: { x: 200 }, dayTicks: { a: false }, dayTicksAt: { a: 200 }, dayMode: 'in-person', dayModeAt: 200
    });
    const phone = Object.assign({}, base, { status: { x: 'learning', y: 'ready' }, statusAt: { x: 100, y: 300 } });
    const merged = T.mergeData(phone, laptop);
    assert.deepEqual(merged.status, { x: 'ready', y: 'ready' }, 'x keeps the laptop\'s newer Ready; y keeps the phone\'s edit');
    assert.deepEqual(merged.statusAt, { x: 200, y: 300 });
    assert.equal(merged.interviewDate, '2026-11-12', 'the laptop\'s newer date stays');
    assert.equal(merged.notes.x, 'new note');
    assert.equal(merged.dayTicks.a, false, 'an untick is a change too');
    assert.equal(merged.dayMode, 'in-person');
    // The other way round (the laptop merges the phone's copy) gives the same answer.
    const back = T.mergeData(laptop, phone);
    assert.deepEqual([back.status, back.interviewDate, back.notes.x, back.dayMode], [merged.status, merged.interviewDate, 'new note', 'in-person']);
    // A newer local change still wins over an older remote one.
    const mine = T.mergeData(Object.assign({}, laptop, { status: { x: 'not-started' }, statusAt: { x: 400 } }), laptop);
    assert.equal(mine.status.x, 'not-started');
});

test('merge: data saved before times existed keeps the old rule; old tombstones are pruned', () => {
    const legacy = T.mergeData({ status: { x: 'ready' }, interviewDate: '' }, { status: { x: 'learning', y: 'learning' }, interviewDate: '2026-11-09' });
    assert.deepEqual(legacy.status, { x: 'ready', y: 'learning' }, 'no times: this device wins on its own keys');
    assert.equal(legacy.interviewDate, '2026-11-09');
    const stamped = T.mergeData({ status: { x: 'ready' } }, { status: { x: 'learning' }, statusAt: { x: 5 } });
    assert.equal(stamped.status.x, 'learning', 'a timed change beats an untimed one');
    const day = 86400000;
    const old = NOW - (T.DELETED_KEEP_DAYS + 1) * day;
    const recent = NOW - 10 * day;
    const merged = T.mergeData({ logDeleted: { 'iv-old': old, 'iv-new': recent }, log: [{ id: 'iv-new', firm: 'B', date: '2026-10-01', updatedAt: 1 }] },
        { logDeleted: {}, log: [{ id: 'iv-old', firm: 'A', date: '2026-01-01', updatedAt: 1 }] }, NOW);
    assert.deepEqual(Object.keys(merged.logDeleted), ['iv-new'], 'a tombstone older than ' + T.DELETED_KEEP_DAYS + ' days is dropped');
    assert.deepEqual(merged.log, [], 'both deleted entries stay gone in this merge');
    assert.deepEqual(Object.keys(T.pruneDeleted({ a: old, b: recent, c: 0 }, NOW)).sort(), ['b', 'c'], 'an untimed tombstone ages from now');
});

test('size: a notice before and after the account limit, so sync never stops silently', () => {
    assert.equal(T.sizeState({ log: [] }, 1000).state, 'ok');
    assert.equal(T.sizeState({ text: 'x'.repeat(900) }, 1000).state, 'near');
    assert.equal(T.sizeState({ text: 'x'.repeat(1200) }, 1000).state, 'too-large');
    const store = memoryStore();
    const long = 'Q'.repeat(1990);
    const log = Array.from({ length: 70 }, (_, i) => T.cleanEntry({ id: 'iv-' + String(1000 + i), firm: 'Firm ' + i, questions: long, missed: long }, { now: NOW }));
    store.set(Object.assign({}, T.DEFAULTS, { log }));
    const { doc } = mountTracker({ store });
    const note = doc.querySelector('.it-size');
    assert.equal(note.classList.contains('ap-hidden'), false);
    assert.match(note.textContent, /too long to save to your account/);
    const small = mountTracker({});
    assert.equal(small.doc.querySelector('.it-size').classList.contains('ap-hidden'), true);
});

test('tabs: switching from far down lands the new panel just under the stuck tab bar (desktop sticky setup card)', () => {
    const { dom, doc } = mountTracker({ mine: 'gst' });
    const win = dom.window;
    const calls = [];
    let y = 2500;
    Object.defineProperty(win, 'pageYOffset', { configurable: true, get: () => y });
    Object.defineProperty(win, 'scrollY', { configurable: true, get: () => y });
    win.scrollTo = (x, top) => { calls.push(top); y = top; };
    // Desktop: the setup card is a sticky left column (its box stays on screen); the panels start at y=400 in the page.
    doc.querySelector('.it-setup').getBoundingClientRect = () => ({ top: 80, bottom: 700, height: 620 });
    doc.querySelector('.it-tabs').getBoundingClientRect = () => ({ top: 56, bottom: 116, height: 60 });
    ['syllabus', 'night', 'day', 'log'].forEach(id => {
        doc.getElementById('it-panel-' + id).getBoundingClientRect = () => ({ top: 400 - y, bottom: 900 - y, height: 500 });
    });
    doc.getElementById('it-tab-day').click();
    assert.deepEqual(calls, [400 - 56 - 60 - 8], 'panel top − topbar − tab bar − 8 px');
    doc.getElementById('it-tab-syllabus').click();
    assert.equal(calls.length, 1, 'already in view: no jump');
    y = 3000;
    doc.getElementById('it-tab-syllabus').click();
    assert.deepEqual(calls, [276, 276], 'the Syllabus tab scrolls back too');
});

test('mock links: HR round, a set mock per domain, "Mock this firm again" on a logged interview', () => {
    const { dom, doc } = mountTracker({ mine: 'gst', backup: 'ma-tax', hash: '#syllabus' });
    const hrLink = [...doc.querySelectorAll('.it-section[data-section="hr"] .it-section-foot a')].find(a => /Practise/.test(a.textContent));
    assert.equal(hrLink.getAttribute('href'), '/ai-interview.html?mode=articleship&round=hr');
    const gst = [...doc.querySelectorAll('.it-section[data-section="gst"] .it-section-foot a')].map(a => [a.textContent, a.getAttribute('href')]);
    assert.deepEqual(gst, [['Practise a GST mock', '/ai-interview.html?mode=articleship&round=technical&domain=gst'],
        ['Domain roadmap', '/articleship-program/domain-roadmaps/#gst']]);
    assert.equal(doc.querySelector('.it-section[data-section="ma-tax"] .it-section-foot a').textContent, 'Practise an M&A tax mock');
    assert.deepEqual(Interview.presetFromQuery('?' + gst[0][1].split('?')[1]), { round: 'technical', domain: 'gst' }, 'the mock page reads the preset');
    assert.deepEqual(P.DOMAINS.map(d => T.mockLabel(d.label)), ['Practise a statutory audit mock', 'Practise an internal audit, risk & IFC mock',
        'Practise a direct tax mock', 'Practise a GST mock', 'Practise a bank audit mock', 'Practise a transfer pricing mock', 'Practise an M&A tax mock',
        'Practise a valuation mock', 'Practise a financial due diligence mock', 'Practise a forensic mock', 'Practise a consulting & risk advisory mock',
        'Practise an accounting, MIS & company law mock', 'Practise an IB & equity research mock']);
    doc.getElementById('it-tab-log').click();
    const form = doc.querySelector('.it-log-form');
    form.elements.firm.value = 'Example Audit & Co';
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    const mock = doc.querySelector('.it-entry .it-mock');
    assert.equal(mock.textContent, 'Mock this firm again');
    assert.deepEqual(Interview.presetFromQuery('?' + mock.getAttribute('href').split('?')[1]), { round: 'full', domain: 'gst', firm: 'Example Audit & Co' });
    assert.equal(T.mockHref({ round: 'hr' }, '/ai-interview.html?mode=articleship&round=call'), '/ai-interview.html?mode=articleship&round=call', 'a preset in the content wins');
});

test('nudge: "Log this interview" hides once that interview is logged; from the nudge the form takes its date', () => {
    const store = memoryStore();
    store.set(Object.assign({}, T.DEFAULTS, { interviewDate: '2026-10-29' }));
    const { dom, doc } = mountTracker({ store });
    const nudge = doc.querySelector('.it-nudge');
    assert.equal(nudge.classList.contains('ap-hidden'), false);
    assert.equal(nudge.textContent, 'Log this interview');
    nudge.click();
    const form = doc.querySelector('.it-log-form');
    assert.equal(form.elements.date.value, '2026-10-29', 'the interview\'s date, not today');
    form.elements.firm.value = 'Firm A';
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    assert.equal(store.get().log[0].date, '2026-10-29');
    doc.getElementById('it-tab-syllabus').click();
    assert.equal(nudge.classList.contains('ap-hidden'), true, 'logged: no nudge on the next visit');
    assert.equal(T.loggedSince([{ date: '2026-10-28' }], '2026-10-29'), false, 'an older interview does not count');
    assert.equal(T.loggedSince([{ date: '2026-10-30' }], '2026-10-29'), true);
    doc.querySelector('.it-add').click();
    assert.equal(doc.querySelector('.it-log-form').elements.date.value, T.todayISO(NOW), '"Log an interview" starts from today');
});

test('night before: "Got it now" takes a missed question off the list, saved by entry and line', () => {
    const store = memoryStore();
    const entry = T.cleanEntry({ id: 'iv-abc12', firm: 'Firm A', date: '2026-10-30', missed: 'Place of supply\nRCM on GTA' }, { now: NOW });
    store.set(Object.assign({}, T.DEFAULTS, { log: [entry] }));
    const { doc } = mountTracker({ store, hash: '#night' });
    const items = () => [...doc.querySelectorAll('#it-panel-night .it-missed-item')];
    assert.equal(items().length, 2);
    const first = items()[0];
    const key = T.missedKey('iv-abc12', 'Place of supply');
    assert.equal(first.dataset.key, key);
    first.querySelector('.it-got').click();
    assert.equal(store.get().missedDone[key], true);
    assert.equal(store.get().missedDoneAt[key], NOW);
    assert.equal(first.classList.contains('is-done'), true, 'stays in view (a second tap undoes it) until the list is drawn again');
    doc.getElementById('it-tab-syllabus').click();
    doc.getElementById('it-tab-night').click();
    assert.deepEqual(items().map(li => li.querySelector('.it-missed-q').textContent), ['RCM on GTA']);
    assert.equal(T.missedQuestions([entry], { [key]: true }).length, 1);
    assert.notEqual(T.missedKey('iv-abc12', 'RCM on GTA'), key);
});

test('interview day: the notes follow the mode too ("Walk in like this" is for in person)', () => {
    const model = T.normaliseContent(CONTENT);
    const titles = mode => T.dayNotes(model.interviewDay.notes, mode).map(n => n.title);
    assert.deepEqual(titles(''), ['If the call drops', 'Walk in like this', 'After']);
    assert.deepEqual(titles('online'), ['If the call drops', 'After']);
    assert.deepEqual(titles('in-person'), ['Walk in like this', 'After']);
    assert.deepEqual(T.dayNotes([{ title: 'Online: test the link' }, { title: 'After' }], 'in-person').map(n => n.title), ['After'], 'a title naming the mode counts as its mode');
    const { doc, store } = mountTracker({ hash: '#day' });
    doc.querySelector('.it-mode-btn[data-mode="online"]').click();
    assert.doesNotMatch(doc.getElementById('it-panel-day').textContent, /Walk in like this/);
    assert.equal(store.get().dayModeAt, NOW);
});

test('syllabus: a long section opens with its first 5 topics to do and "Show all"', () => {
    const store = memoryStore();
    store.set(Object.assign({}, T.DEFAULTS, { status: { 'hr-intro': 'ready' } }));
    const { doc } = mountTracker({ store });
    const hr = doc.querySelector('.it-section[data-section="hr"]');
    assert.equal(hr.open, true, 'the first section still to do is open');
    const shown = [...hr.querySelectorAll('.it-topic')].filter(li => !li.hidden);
    assert.equal(shown.length, T.PREVIEW_TOPICS);
    assert.equal(shown.some(li => li.dataset.id === 'hr-intro'), false, 'a Ready topic waits behind "Show all"');
    const more = hr.querySelector('.it-show-all');
    assert.equal(more.textContent, 'Show all 15 topics');
    more.click();
    assert.equal([...hr.querySelectorAll('.it-topic')].filter(li => li.hidden).length, 0);
    assert.equal(hr.querySelector('.it-show-all'), null);
    const short = doc.querySelector('.it-section[data-section="audit-basics"]');
    assert.equal(short.querySelector('.it-show-all'), null, 'a 7-topic section shows in full');
});

// ---------- the page ----------
test('page: noindex, MSC logo, Caveat + Inter, platform scripts in order, Day 4 back link', () => {
    const html = fs.readFileSync(PAGE, 'utf8');
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, /<html lang="en" class="ap-gated">/);
    assert.match(html, /shared\/msc-logo\.svg/);
    assert.match(html, /family=Caveat/);
    assert.match(html, /course\?course=msc-articleship-program&amp;session=5/);
    assert.match(html, /<span class="ap-topbar-title">Interview syllabus tracker<\/span>/, 'Padam\'s name for the tool (V3-STRUCTURE Appendix E)');
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
    assert.deepEqual(scripts, ['/scripts/supabase.js', '/scripts/supabase-init.js', '/scripts/articleship-gate.js', '/scripts/articleship-progress.js',
        '/scripts/articleship-checklist.js', '/scripts/articleship-lms.js', '/scripts/articleship-interview-tracker.js']);
    scripts.forEach(src => assert.ok(fs.existsSync(path.join(ROOT, src)), src + ' exists'));
    assert.ok(fs.existsSync(CSS));
});

test('mount: opens on the syllabus with Core, asks for the domain, and hides Share while the form is empty', () => {
    const store = memoryStore();
    store.set(Object.assign({}, T.DEFAULTS, { log: [T.cleanEntry({ firm: 'Firm A', questions: 'Q1' }, { now: NOW })] }));
    const { doc, app } = mountTracker({ store, shareForm: { action: '', fields: {} } });
    assert.equal(doc.querySelectorAll('#it-panel-log .it-entry').length, 1, 'the logged interview shows');
    assert.equal(doc.querySelector('#it-panel-log .it-share'), null, 'no Share button without the form');
    assert.equal(doc.querySelector('.it-tab.is-active').dataset.tab, 'syllabus');
    assert.equal(doc.getElementById('it-backup').disabled, true, 'second choice waits for my domain');
    assert.match(doc.querySelector('#it-panel-syllabus .it-empty').textContent, /Pick your domain/);
    assert.equal(doc.querySelectorAll('#it-panel-syllabus .it-section').length, 7, '5 Core + written test + GD');
    assert.equal(doc.querySelector('.it-count').classList.contains('is-none'), true);
    assert.equal(app.summary().total, 63);
    assert.doesNotMatch(doc.body.textContent, /Share with MSC/);
    const read = doc.querySelector('#it-panel-syllabus .it-read');
    assert.match(read.getAttribute('href'), /^\/learning-management-system\/course\?course=msc-articleship-program&session=5&resource=HR\+round\+and\+GD\+booklet/);
    assert.match(read.getAttribute('aria-label'), /^Read in HR round and GD booklet: /);
    const written = [...doc.querySelectorAll('.it-section[data-section="written-test"] .it-read')];
    assert.ok(written.some(a => a.textContent === 'Practise'));
    const writtenLive = fs.existsSync(path.join(ROOT, 'articleship-program/written-test/index.html'));
    const toPage = written.filter(a => /^\/articleship-program\/written-test\//.test(a.getAttribute('href')));
    if (writtenLive) assert.ok(toPage.length && toPage.every(a => a.textContent === 'Practise'), 'the written-test page is on the branch: Practise opens it');
    else assert.equal(toPage.length, 0, 'no link to a page not on the branch');
});

test('mount: domain, date and status save; % and days left follow', () => {
    const { dom, doc, store, settings, app } = mountTracker({});
    const win = dom.window;
    const select = doc.getElementById('it-domain');
    select.value = 'gst';
    select.dispatchEvent(new win.Event('change'));
    assert.deepEqual(settings.state.calls[0][0], 'gst');
    assert.equal(doc.querySelector('.it-section[data-section="gst"] .it-tag').textContent, 'My domain');
    assert.equal(app.summary().total, 63 + 12);
    const date = doc.getElementById('it-date');
    date.value = '2026-11-09';
    date.dispatchEvent(new win.Event('change'));
    assert.equal(store.get().interviewDate, '2026-11-09');
    assert.equal(doc.querySelector('.it-count-big').textContent, '7');
    assert.equal(doc.querySelector('.it-count-label').textContent, 'days left');
    assert.equal(store.get().interviewDateAt, NOW, 'the date carries its time for the merge');
    const radio = doc.querySelector('.it-topic[data-id="hr-intro"] input[value="ready"]');
    radio.checked = true;
    radio.dispatchEvent(new win.Event('change'));
    assert.equal(store.get().status['hr-intro'], 'ready');
    assert.equal(store.get().statusAt['hr-intro'], NOW);
    assert.equal(doc.querySelector('.it-overall-count').textContent, '1 of 75 ready');
    assert.match(doc.querySelector('.it-section[data-section="hr"] .it-section-meta').textContent, /^1\/15 ready · 7%$/);
    // a date and a note per topic
    doc.querySelector('.it-topic[data-id="hr-why"] .it-plan-btn').click();
    const [by, note] = doc.querySelectorAll('.it-topic[data-id="hr-why"] .it-plan input');
    by.value = '2026-11-05'; by.dispatchEvent(new win.Event('change'));
    note.value = 'Read the team page'; note.dispatchEvent(new win.Event('change'));
    assert.equal(store.get().dates['hr-why'], '2026-11-05');
    assert.equal(store.get().notes['hr-why'], 'Read the team page');
    assert.deepEqual([store.get().datesAt['hr-why'], store.get().notesAt['hr-why']], [NOW, NOW]);
    // night before drops what is Ready
    doc.getElementById('it-tab-night').click();
    const night = doc.getElementById('it-panel-night');
    assert.equal(night.querySelector('.it-topic[data-id="hr-intro"]'), null);
    assert.ok(night.querySelector('.it-topic[data-id="gst-supply"], .it-topics.is-compact .it-topic'));
    assert.match(night.textContent, /Core and GST topics are not Ready yet/);
    assert.equal(win.location.hash, '#night');
});

test('interview day: one mode at a time when the student picks it; both until then', () => {
    const all = CONTENT.interviewDay.sections;
    assert.deepEqual(T.daySections(all, '').map(s => s.title), all.map(s => s.title));
    assert.deepEqual(T.daySections(all, 'online').map(s => s.title), ['Every interview', 'Online']);
    assert.deepEqual(T.daySections(all, 'in-person').map(s => s.title), ['Every interview', 'In person']);
    const { doc, store } = mountTracker({ hash: '#day' });
    const count = () => doc.querySelector('#it-panel-day .ap-progress-count').textContent;
    const total = all.reduce((n, s) => n + s.items.length, 0);
    assert.match(count(), new RegExp('of ' + total + ' done'));
    doc.querySelector('.it-mode-btn[data-mode="online"]').click();
    assert.equal(store.get().dayMode, 'online');
    assert.match(count(), new RegExp('of ' + (all[0].items.length + all.find(s => s.title === 'Online').items.length) + ' done'));
    assert.equal(doc.querySelector('.it-mode-btn[data-mode="online"]').getAttribute('aria-pressed'), 'true');
    assert.doesNotMatch(doc.getElementById('it-panel-day').textContent, /Reach 15 to 20 minutes early/);
    doc.querySelector('.it-mode-btn[data-mode="online"]').click();
    assert.equal(store.get().dayMode, '', 'tap again for both');
});

test('night before: one Ready tap marks a topic and a second tap puts it back', () => {
    const { doc, store } = mountTracker({ mine: 'gst', hash: '#night' });
    const night = doc.getElementById('it-panel-night');
    assert.equal(night.querySelector('.it-status'), null, 'no three-way control the night before');
    const btn = night.querySelector('.it-topic[data-id="gst-read"] .it-ready-btn');
    assert.equal(btn.getAttribute('aria-pressed'), 'false');
    btn.click();
    assert.equal(store.get().status['gst-read'], 'ready');
    assert.equal(btn.getAttribute('aria-pressed'), 'true', 'the row stays so the student sees it marked');
    assert.match(night.querySelector('[data-night-count]').textContent, /^\d+ Core and GST topics are not Ready yet/);
    btn.click();
    assert.equal(store.get().status['gst-read'], 'not-started', 'back to what it was');
    const syllabusRadio = doc.querySelector('#it-panel-syllabus .it-topic[data-id="gst-read"] input[value="not-started"]');
    assert.equal(syllabusRadio.checked, true, 'the syllabus view follows');
});

test('tabs: a #hash link opens that view in place', () => {
    const { dom, doc } = mountTracker({});
    dom.window.location.hash = '#log';
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
    assert.equal(doc.querySelector('.it-tab.is-active').dataset.tab, 'log');
    assert.equal(doc.getElementById('it-panel-log').hidden, false);
});

test('mount: the day checklist ticks save and clear for the next interview', () => {
    const { dom, doc, store } = mountTracker({ mine: 'statutory-audit', hash: '#day' });
    assert.equal(doc.querySelector('.it-tab.is-active').dataset.tab, 'day');
    const box = doc.querySelector('#it-panel-day input[type="checkbox"]');
    box.checked = true;
    box.dispatchEvent(new dom.window.Event('change'));
    const ticked = Object.entries(store.get().dayTicks).filter(([, v]) => v).map(([k]) => k);
    assert.deepEqual(ticked, ['day-cv-twice']);
    assert.equal(store.get().dayTicksAt['day-cv-twice'], NOW, 'each tick carries its time for the merge');
    const fresh = doc.querySelector('.it-fresh');
    fresh.click();
    assert.deepEqual(Object.entries(store.get().dayTicks).filter(([, v]) => v).map(([k]) => k), ['day-cv-twice'], 'one tap only arms it');
    assert.match(fresh.textContent, /Tap again to clear every tick/);
    fresh.click();
    assert.deepEqual(Object.values(store.get().dayTicks).filter(Boolean), []);
    assert.equal(doc.querySelector('#it-panel-day input[type="checkbox"]').checked, false);
    assert.equal(fresh.disabled, true, 'nothing left to clear');
    assert.equal(fresh.textContent, 'Clear ticks for the next interview');
});

test('mount: log an interview; missed questions reach the night before; Share posts once to the form', async () => {
    const posts = [];
    const { dom, doc, store } = mountTracker({ mine: 'gst', hash: '#log', shareForm: FAKE_FORM, fetch: async (url, init) => { posts.push({ url, init }); return {}; } });
    const win = dom.window;
    const form = doc.querySelector('.it-log-form');
    form.elements.firm.value = 'Example Audit & Co';
    form.elements.city.value = 'Pune';
    form.elements.date.value = '2026-11-02';
    form.elements.round.value = 'Partner';
    form.elements.questions.value = 'Tell me about yourself\nWhat is RCM?';
    form.elements.missed.value = 'Place of supply for services';
    assert.match(form.elements.questions.placeholder, /Leave out people's names/);
    assert.match(form.elements.tip.placeholder, /Leave out people's names/);
    form.dispatchEvent(new win.Event('submit', { cancelable: true }));
    const log = store.get().log;
    assert.equal(log.length, 1);
    assert.equal(log[0].domain, 'gst', 'domain defaults to my domain');
    const card = doc.querySelector('.it-entry');
    assert.match(card.textContent, /Example Audit & Co/);
    assert.match(card.textContent, /Partner · Pune · GST · 2 Nov 2026/);
    assert.match(doc.getElementById('it-panel-night').textContent, /Place of supply for services/);
    card.querySelector('.it-share').click();
    const preview = doc.querySelector('.it-share-box');
    assert.match(preview.textContent, /November 2026/);
    assert.match(preview.querySelector('.it-share-lede').textContent, /Leave out people's names/);
    assert.doesNotMatch(preview.textContent, /2 Nov 2026/);
    [...preview.querySelectorAll('button')].find(b => b.textContent === 'Send to MSC').click();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, FAKE_FORM.action);
    assert.equal(posts[0].init.method, 'POST');
    const sent = new URLSearchParams(posts[0].init.body);
    assert.equal(sent.get('entry.102'), 'Example Audit & Co');
    assert.equal(sent.get('entry.101'), 'November 2026');
    assert.ok(store.get().log[0].sharedAt > 0);
    assert.match(doc.querySelector('.it-entry').textContent, /Shared with MSC/);
    assert.equal(doc.querySelector('.it-entry .it-share'), null, 'shared once');
});

test('mount: a log without the firm\'s name, and a share that leaves the name out', async () => {
    const posts = [];
    const { dom, doc, store } = mountTracker({ mine: 'statutory-audit', backup: 'direct-tax', hash: '#log', shareForm: FAKE_FORM,
        fetch: async (url, init) => { posts.push(init); return {}; } });
    const win = dom.window;
    let form = doc.querySelector('.it-log-form');
    form.dispatchEvent(new win.Event('submit', { cancelable: true }));
    assert.equal(store.get().log.length, 0, 'nothing saved without a name or a type');
    assert.equal(form.querySelector('.it-error').classList.contains('ap-hidden'), false);
    assert.equal(form.elements.backup.value, 'direct-tax', 'second preference starts from the shared setting');
    form.elements.type.value = 'Small firm';
    form.elements.stage.value = 'Result awaited';
    form.elements.namedItem('length').value = 'Under 15 min';
    form.elements.questions.value = 'Why audit?';
    form.dispatchEvent(new win.Event('submit', { cancelable: true }));
    assert.equal(store.get().log.length, 1);
    assert.equal(doc.querySelector('.it-entry-title').textContent, 'Small firm');
    assert.match(doc.querySelector('.it-entry').textContent, /Result awaited/);
    assert.equal(store.get().log[0].length, 'Under 15 min', 'the "length" field saves (not the form\'s element count)');
    assert.match(doc.querySelector('.it-entry-meta').textContent, /Under 15 min/);
    // a named one, shared without the name
    doc.querySelector('.it-add').click();
    form = doc.querySelector('.it-log-form');
    form.elements.firm.value = 'Example Audit & Co';
    form.elements.type.value = 'Mid-size firm';
    form.elements.questions.value = 'What is vouching?';
    form.elements.date.value = '2026-11-03';
    form.dispatchEvent(new win.Event('submit', { cancelable: true }));
    const card = [...doc.querySelectorAll('.it-entry')].find(c => /Example Audit/.test(c.textContent));
    card.querySelector('.it-share').click();
    const keep = doc.querySelector('.it-share-firm input');
    assert.equal(keep.checked, true, 'the name goes by default');
    keep.checked = false;
    keep.dispatchEvent(new win.Event('change'));
    assert.doesNotMatch(doc.querySelector('.it-share-list').textContent, /Example Audit/, 'the preview shows exactly what goes');
    [...doc.querySelectorAll('.it-share-box button')].find(b => b.textContent === 'Send to MSC').click();
    await new Promise(r => setTimeout(r, 0));
    const sent = new URLSearchParams(posts[0].body);
    assert.equal(sent.get('entry.102'), null, 'no firm name sent');
    assert.equal(sent.get('entry.113'), 'Mid-size firm');
    assert.equal(sent.get('entry.114'), 'Direct tax');
});

test('mount: a failed share keeps the entry unshared and says so', async () => {
    const { dom, doc, store } = mountTracker({ hash: '#log', shareForm: FAKE_FORM, fetch: async () => { throw new Error('offline'); } });
    const form = doc.querySelector('.it-log-form');
    form.elements.firm.value = 'Firm A';
    form.dispatchEvent(new dom.window.Event('submit', { cancelable: true }));
    doc.querySelector('.it-share').click();
    [...doc.querySelectorAll('.it-share-box button')].find(b => b.textContent === 'Send to MSC').click();
    await new Promise(r => setTimeout(r, 0));
    assert.equal(store.get().log[0].sharedAt, 0);
    assert.equal(doc.querySelector('.it-share-box .it-error').classList.contains('ap-hidden'), false);
});
