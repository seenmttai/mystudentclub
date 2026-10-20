const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { PGlite } = require('@electric-sql/pglite');
const LMS = require('../scripts/articleship-lms.js');

const root = path.resolve(__dirname, '..');
const courseScript = fs.readFileSync(path.join(root, 'learning-management-system/course-script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'learning-management-system/index.html'), 'utf8');
const dashboardScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(/import \{ createApp \} from 'vue';/, '');
const V3_SQL = path.join(root, 'supabase/migrations/202610200002_articleship_program_v3_lms.sql');
const V2_SQL = path.join(root, 'supabase/migrations/202610190001_articleship_program_lms.sql');

function loadDashboard(enrollments) {
    const queries = [];
    const window = {
        location: { href: '/learning-management-system/' },
        supabaseClient: {
            from(table) {
                return {
                    select(columns) {
                        return {
                            async eq(column, value) {
                                queries.push({ table, columns, column, value });
                                return { data: enrollments, error: null };
                            }
                        };
                    }
                };
            }
        }
    };
    let options;
    vm.runInNewContext(dashboardScript, {
        window,
        localStorage: { getItem: () => null },
        createApp(value) {
            options = value;
            return { mount() {} };
        },
        console
    });
    const dashboard = options.data();
    Object.assign(dashboard, options.methods, { user: { id: 'test-student' } });
    return { dashboard, queries, window };
}

function migrationRows(file = V3_SQL) {
    const sql = fs.readFileSync(file, 'utf8');
    const encoded = sql.match(/json_populate_recordset\(NULL::public\.videos, '([\s\S]*?)'::json\)/);
    assert.ok(encoded, 'migration contains its row payload');
    return JSON.parse(encoded[1].replaceAll("''", "'"));
}

function courseFunction(name, sandbox) {
    const catalogStart = courseScript.indexOf('    const courses =');
    const catalogEnd = courseScript.indexOf('\n    const DOMElements', catalogStart);
    vm.runInNewContext(courseScript.slice(catalogStart, catalogEnd), sandbox);
    const start = courseScript.indexOf(`    const ${name} =`);
    const end = courseScript.indexOf('\n    const ', start + 1);
    assert.ok(start >= 0 && end > start, `${name} exists in course-script.js`);
    vm.runInNewContext(`${courseScript.slice(start, end)}\nthis.run = ${name};`, sandbox);
    return sandbox.run;
}

const WHATSAPP_GROUP = 'https://chat.whatsapp.com/Fk7FnQiktc4KubrNzFPgya';
const DAY_TITLES = ['Start here', 'Crafting the Perfect CV', 'Applying the Right Way', 'Using LinkedIn',
    'Cracking Interviews', 'Domain Guidance', 'Registration Formalities'];
// V3-STRUCTURE §0.3: the rows that open in the copyable reader.
const COPY_ROWS = ['MSC Articleship Guidebook', 'Choose your CV', 'The Nothing CV', 'CV templates', 'Keywords by domain',
    'Cover letters', 'Big 10 articleship routes', 'Application templates', 'Follow-up templates', 'Back-out templates',
    'LinkedIn search links', 'Connection notes', 'First message after the request is accepted', 'Follow-up messages',
    'HR round and GD booklet'];

test('an Articleship enrollment appears on the LMS dashboard and opens its course', async () => {
    const { dashboard, queries, window } = loadDashboard([{ course: 'msc-articleship-program' }]);
    await dashboard.fetchUserEnrollments();
    assert.equal(dashboard.loading, false);
    assert.equal(dashboard.enrolledCourses.length, 1);
    const course = dashboard.enrolledCourses[0];
    assert.equal(course.title, 'MSC Articleship Program');
    assert.ok(fs.existsSync(path.join(root, course.thumbnail)));
    assert.deepEqual(queries, [{ table: 'enrollment', columns: 'course', column: 'uuid', value: 'test-student' }]);
    dashboard.goToCourse(course.slug);
    assert.equal(window.location.href, '/learning-management-system/course?course=msc-articleship-program');
});

test('the Articleship catalog entry does not grant access without enrollment', async () => {
    const { dashboard } = loadDashboard([]);
    await dashboard.fetchUserEnrollments();
    assert.equal(dashboard.enrolledCourses.length, 0);
    assert.equal(dashboard.loading, false);
});

test('the dashboard progress estimate counts one session per Day', async () => {
    const { dashboard } = loadDashboard([{ course: 'msc-articleship-program' }]);
    await dashboard.fetchUserEnrollments();
    assert.equal(dashboard.enrolledCourses[0].videoCountEstimate, 7);
    assert.equal(migrationRows().length, 7);
});

test('v3 rows: one session per Day, headings are actions, 45 rows, nothing a student should not see', () => {
    const rows = migrationRows();
    assert.deepEqual(rows.map(row => [row.day_number, row.video_number, row.title]), DAY_TITLES.map((title, day) => [day, day + 1, title]));
    assert.equal(rows.flatMap(row => row.resources).length, 45);
    const banned = /ca ?monk|thinking ?bridge|umbrella|needs-check|\bwaves?\b|live week|coming soon|\b202[5-9]\b|slides|example cvs|vacancy alerts|form 109/i;
    for (const row of rows) {
        assert.equal(row.course, 'msc-articleship-program');
        assert.equal(row.industrial_training_path, null);
        assert.ok(!banned.test(row.title + row.description), `Day ${row.day_number} text`);
        assert.match(row.description, /Done when:/);
        const titles = new Set();
        for (const resource of row.resources) {
            assert.ok(!titles.has(resource.title), `${resource.title} listed once`);
            titles.add(resource.title);
            assert.ok(resource.group && !/template/i.test(resource.group), `heading "${resource.group}" never triggers the canvas viewer`);
            assert.ok(!banned.test(resource.title), resource.title);
            assert.ok(!('row' in resource) && !('source' in resource), 'internal fields stay out of the rows');
            for (const key of ['view_storage_path', 'download_storage_path']) {
                if (resource[key]) assert.match(resource[key], /^articleship-program-v3\/day-[0-6]\/[^/]+\.(pdf|docx|xlsx|csv)$/);
            }
            if (resource.type === 'external_link') {
                assert.ok(/^\/(?!\/)/.test(resource.url) || /^https:\/\/(chat\.whatsapp\.com|wa\.me)\//.test(resource.url), `${resource.title}: MSC tools use relative links`);
                assert.ok(!/docs\.google\.com\/spreadsheets\/d\/[^/]+\/copy/.test(resource.url), 'no Sheet /copy link in a row');
            }
            assert.ok(!/\.zip$/i.test(resource.download_storage_path || ''), 'no ZIPs');
        }
    }
    const all = rows.flatMap(row => row.resources);
    assert.deepEqual(all.filter(r => r.copy === true).map(r => r.title).sort(), [...COPY_ROWS].sort(), 'exactly the §0.3 rows are copyable');
    assert.deepEqual(rows[0].resources.map(r => r.title), ['MSC Articleship Guidebook', 'Join the MSC Articleship WhatsApp group']);
    assert.equal(rows[0].resources[1].url, WHATSAPP_GROUP);
    assert.ok(!/one domain, one backup|cities written down/i.test(rows[0].description), 'no Day 0 domain task (B2)');
    const dayOne = rows[1].resources;
    assert.deepEqual([...new Set(dayOne.map(r => r.group))], ['Choose your CV', 'Pick your design', 'Work Simulation', 'Check your CV', 'Cover letters']);
    assert.equal(dayOne.find(r => r.title === 'CV Builder').url, '/cv-builder/?stage=articleship');
    const cover = dayOne.find(r => r.title === 'Cover letters');
    assert.ok(cover.copy && cover.view_storage_path.endsWith('.pdf') && cover.download_storage_path.endsWith('.docx'), 'Word on the same row');
    const dayFour = rows[4].resources;
    const syllabus = dayFour.find(r => r.title === 'Interview syllabus');
    assert.equal(syllabus.copy, undefined, 'the syllabus opens in the normal reader');
    assert.ok(syllabus.download_storage_path.endsWith('.pdf'), 'row-level download to print');
    assert.equal(dayFour.find(r => r.title === 'Master Excel test').download_storage_path, 'articleship-program-v3/day-4/Master Excel test.xlsx');
    assert.deepEqual(rows[2].resources.filter(r => r.group === 'Automail').map(r => r.url), ['/articleship-program/automail/']);
    assert.deepEqual(rows[3].resources.map(r => r.title).slice(0, 2), ['LinkedIn profile checklist', 'LinkedIn search links'], 'checklist first (D3-1)');
});

test('the v3 migration runs on top of v2: seven sessions remain, recordings untouched, safe to run twice', async () => {
    const db = new PGlite();
    try {
        await db.exec(`create table public.videos (course text, video_number int, title text, description text, day_number int,
            resources jsonb, industrial_training_path text, primary key (course, video_number));
            insert into public.videos values ('industrial-training-mastery', 1, 'Other course', '', 1, '[]', 'it/path');`);
        await db.exec(fs.readFileSync(V2_SQL, 'utf8'));
        await db.query("update public.videos set industrial_training_path = 'rec/day1' where course = 'msc-articleship-program' and video_number = 2");
        assert.equal((await db.query("select count(*)::int n from public.videos where course = 'msc-articleship-program'")).rows[0].n, 13);
        const v3 = fs.readFileSync(V3_SQL, 'utf8');
        await db.exec(v3);
        await db.exec(v3);
        const rows = (await db.query("select day_number, video_number, title, industrial_training_path, resources from public.videos where course = 'msc-articleship-program' order by video_number")).rows;
        assert.deepEqual(rows.map(r => [r.day_number, r.video_number, r.title]), DAY_TITLES.map((t, d) => [d, d + 1, t]));
        assert.equal(rows[1].industrial_training_path, 'rec/day1', 'a recording added later is kept');
        assert.equal(rows[1].resources[0].title, 'Choose your CV');
        assert.equal((await db.query("select count(*)::int n from public.videos where course = 'industrial-training-mastery'")).rows[0].n, 1, 'other courses untouched');
    } finally {
        await db.close();
    }
});

test('LMS shows the seven Days, one session each, under their Day titles', async () => {
    const rows = migrationRows();
    const query = {
        select() { return this; }, eq() { return this; }, order() { return this; },
        then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); }
    };
    const state = { courseSlug: 'msc-articleship-program', courseSections: [] };
    const DOMElements = Object.fromEntries(['loadingVideosMeta', 'loadingVideosSidebar', 'totalVideosCount', 'totalVideosMeta']
        .map(key => [key, { style: {} }]));
    const loadCourseVideos = courseFunction('loadCourseVideos', {
        state, DOMElements,
        supabase: { from: () => query, rpc: async () => ({ data: null, error: null }) },
        loadVideoProgress() {}, renderCourseModules() {},
        logFrontendError(message) { throw new Error(message); }
    });
    await loadCourseVideos();
    assert.deepEqual(Array.from(state.courseSections, section => section.title), DAY_TITLES.map((t, d) => `Day ${d} · ${t}`));
    assert.deepEqual(Array.from(state.courseSections, section => section.videos.length), [1, 1, 1, 1, 1, 1, 1]);
    assert.equal(DOMElements.totalVideosCount.textContent, '7 Sessions');
});

test('Articleship resource rows stay compact on a phone without changing other courses', () => {
    const compact = slug => courseFunction('isCompactResourceCourse', { state: { courseSlug: slug } })();
    assert.equal(compact('msc-articleship-program'), true);
    assert.equal(compact('industrial-training-mastery'), false);
    assert.equal(compact('msc-ca-freshers-program'), false);
});

test('deep links select only an enrolled Articleship session and a programme PDF on it', () => {
    const rows = migrationRows();
    const state = { courseSlug: 'msc-articleship-program', user: { id: 'student' }, isEnrolled: true };
    const window = { location: { search: '' } };
    const target = courseFunction('getArticleshipResourceTarget', { state, window, URLSearchParams,
        findVideoById: id => rows.find(row => row.video_number === id) });
    window.location.search = '?course=msc-articleship-program&session=2&resource=Choose%20your%20CV&page=5';
    let result = target();
    assert.equal(result.video.video_number, 2);
    assert.equal(result.resource.title, 'Choose your CV');
    assert.equal(result.page, 5);
    window.location.search = '?session=5&resource=Statutory%20audit%20booklet&page=12';
    assert.equal(target().resource.view_storage_path, 'articleship-program-v3/day-4/Statutory audit booklet.pdf');
    window.location.search = '?session=2';
    assert.equal(target().resource, null, 'session only');
    for (const query of ['?session=999&resource=Choose%20your%20CV', '?session=2&resource=https://evil.test/a.pdf',
        '?session=2.5&resource=Choose%20your%20CV', '?session=-2&resource=Choose%20your%20CV', '?session=2&resource=CV%20Builder']) {
        window.location.search = query;
        assert.equal(target(), null, query);
    }
    window.location.search = '?session=2&resource=Choose%20your%20CV&page=-4';
    assert.equal(target().page, 1);
    state.isEnrolled = false;
    assert.equal(target(), null);
    state.isEnrolled = true; state.user = null;
    assert.equal(target(), null);
    state.user = { id: 'student' }; state.courseSlug = 'industrial-training-mastery';
    assert.equal(target(), null);
    // v2 paths (rows not yet replaced) still pass; a path that climbs out never does
    state.courseSlug = 'msc-articleship-program';
    const v2 = courseFunction('getArticleshipResourceTarget', { state, window, URLSearchParams, findVideoById: () => ({ id: 6, resources: [
        { title: 'Old', view_storage_path: 'articleship-program-v2/day-5/domain-roadmaps/MSC Domain Roadmaps.pdf' },
        { title: 'Climb', view_storage_path: 'articleship-program-v3/day-1/../../secret.pdf' }] }) });
    window.location.search = '?session=6&resource=Old';
    assert.equal(v2().resource.title, 'Old');
    window.location.search = '?session=6&resource=Climb';
    assert.equal(v2(), null);
});

test('a deep link to a copyable row opens the reader in place; other PDFs open at their page', async () => {
    for (const [resource, expected] of [
        [{ title: 'Choose your CV', copy: true, view_storage_path: 'articleship-program-v3/day-1/Choose your CV.pdf' }, 'copy'],
        [{ title: 'Statutory audit booklet', view_storage_path: 'articleship-program-v3/day-4/Statutory audit booklet.pdf' }, 'viewer']
    ]) {
        const calls = [];
        const state = { courseSlug: 'msc-articleship-program', user: { id: 'student' }, isEnrolled: true, courseSections: [] };
        const run = courseFunction('loadVideoProgress', { state, console,
            localStorage: { getItem: key => key.startsWith('courseVideos_') ? null : '2' },
            updateCourseProgress() {}, fetchWatchTimeForCourse: async () => {},
            getArticleshipResourceTarget: () => ({ video: { id: 2 }, resource, page: 8 }),
            articleshipLms: () => LMS,
            selectVideo: async id => calls.push(['session', id]), setActiveTab: tab => calls.push(['tab', tab]),
            openCopyResource: async (...args) => calls.push(['copy', ...args]),
            openResourceViewer: async (...args) => calls.push(['viewer', ...args]) });
        await run();
        assert.deepEqual(calls.slice(0, 2), [['session', 2], ['tab', 'resources']]);
        assert.equal(calls[2][0], expected);
        assert.equal(calls[2][1], resource);
        if (expected === 'copy') assert.equal(JSON.stringify([calls[2][2], calls[2][3]]), JSON.stringify([8, { deepLink: true }]));
        else assert.deepEqual([calls[2][2], calls[2][3]], ['pdf', 8]);
    }
});

function copySandbox(signedUrl = 'https://auth.mystudentclub.com/storage/v1/object/sign/b/x.pdf?token=t') {
    const calls = [];
    const opened = { document: { write: text => calls.push(['write', text]) }, location: { href: '' }, close: () => calls.push(['close']) };
    const sandbox = {
        calls, opened, console, articleshipLms: () => LMS,
        alert: message => calls.push(['alert', message]),
        supabase: { storage: { from: bucket => ({ createSignedUrl: async (p, ttl) => { calls.push(['sign', bucket, p, ttl]); return { data: { signedUrl }, error: null }; } }) } },
        window: { open: (url, target) => { calls.push(['open', url, target]); return opened; }, location: { replace: url => calls.push(['replace', url]) } }
    };
    return sandbox;
}

test('a copyable row opens the copyable reader in a new tab (browser viewer when flagged), signed for 5 minutes', async () => {
    const sandbox = copySandbox();
    const open = courseFunction('openCopyResource', sandbox);
    const resource = { title: 'Application templates', copy: true, view_storage_path: 'articleship-program-v3/day-2/Application templates.pdf', group: 'Write your mails' };
    await open(resource, 1);
    assert.deepEqual(sandbox.calls[0], ['open', '', '_blank'], 'tab opened before any await (popup blockers)');
    assert.deepEqual(sandbox.calls.find(c => c[0] === 'sign'), ['sign', 'industrial-training-mastery-resources', resource.view_storage_path, 300]);
    const href = new URL(sandbox.opened.location.href, 'https://www.mystudentclub.com');
    assert.equal(href.pathname, '/ca-resource/read/');
    assert.equal(href.searchParams.get('pdf'), 'https://auth.mystudentclub.com/storage/v1/object/sign/b/x.pdf?token=t');
    assert.equal(href.searchParams.get('title'), 'Application templates');

    const browser = copySandbox();
    await courseFunction('openCopyResource', browser)({ ...resource, copy: 'browser' }, 3);
    assert.equal(browser.opened.location.href, 'https://auth.mystudentclub.com/storage/v1/object/sign/b/x.pdf?token=t#page=3');

    const deep = copySandbox();
    await courseFunction('openCopyResource', deep)(resource, 4, { deepLink: true });
    assert.ok(!deep.calls.some(c => c[0] === 'open'), 'a deep link opens no new tab');
    assert.match(deep.calls.find(c => c[0] === 'replace')[1], /^\/ca-resource\/read\/\?pdf=.*&page=4&title=Application\+templates$/);

    const failing = copySandbox();
    failing.console = { error() {} };
    failing.supabase.storage.from = () => ({ createSignedUrl: async () => ({ data: null, error: new Error('denied') }) });
    await courseFunction('openCopyResource', failing)(resource, 1);
    assert.ok(failing.calls.some(c => c[0] === 'close') && failing.calls.some(c => c[0] === 'alert'));
});

test('row clicks: copy flag first, "Templates" canvas rule off for this course only', async () => {
    const run = (slug, resource) => {
        const calls = [];
        const click = courseFunction('handleResourceClick', {
            state: { courseSlug: slug }, articleshipLms: () => LMS, isGoogleSheetResource: () => false,
            openCopyResource: async (...args) => calls.push(['copy', ...args]),
            openResourceViewer: async (...args) => calls.push(['canvas', ...args]),
            supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://s/x.pdf' }, error: null }) }) } },
            window: { open: (url) => { calls.push(['open', url]); return { document: { write() {} }, location: { set href(v) { calls.push(['flipbook', v]); } } }; } },
            isDocxPreviewResource: () => false, downloadResource: () => calls.push(['download']), console, alert() {}
        });
        return click(resource).then(() => calls);
    };
    const copyRow = { title: 'Application templates', type: 'pdf', copy: true, view_storage_path: 'articleship-program-v3/day-2/Application templates.pdf', group: 'Write your mails' };
    assert.equal((await run('msc-articleship-program', copyRow))[0][0], 'copy');
    const oldTemplate = { title: 'Follow-up mails', type: 'pdf', view_storage_path: 'a/mails.pdf', group: 'Templates', page: 3 };
    assert.deepEqual((await run('industrial-training-mastery', oldTemplate))[0], ['canvas', oldTemplate, 'pdf', 3], 'other courses keep their viewer');
    const articleshipTemplate = await run('msc-articleship-program', oldTemplate);
    assert.ok(articleshipTemplate.some(c => c[0] === 'flipbook'), 'no canvas viewer for the Articleship course');
    const tool = await run('msc-articleship-program', { title: 'CV checklist', type: 'external_link', url: '/articleship-program/cv-checklist/' });
    assert.deepEqual(tool[0], ['open', '/articleship-program/cv-checklist/']);
});

test('download labels say what the file is; other courses keep theirs', () => {
    const label = (slug, resource) => courseFunction('getResourceDownloadLabel', {
        state: { courseSlug: slug }, articleshipLms: () => LMS,
        isCompactResourceCourse: () => slug === 'msc-articleship-program',
        isGoogleSheetResource: () => false, isDocxPreviewResource: () => false
    })(resource);
    assert.equal(label('msc-articleship-program', { download_storage_path: 'articleship-program-v3/day-1/Cover letters.docx' }), 'Download Word');
    assert.equal(label('msc-articleship-program', { download_storage_path: 'x.pdf', download_label: 'Download to print' }), 'Download to print');
    assert.equal(label('msc-articleship-program', { download_storage_path: 'articleship-program-v3/day-4/Master Excel test.xlsx' }), 'Download Excel');
    assert.equal(label('msc-articleship-program', { type: 'zip', download_storage_path: 'gallery.zip' }), 'Download ZIP (for laptop)');
    assert.equal(label('industrial-training-mastery', { download_storage_path: 'x.pdf' }), 'Download');
});

test('a Google Sheet /copy link is never rewritten to /edit', () => {
    const preview = courseFunction('getSheetPreviewUrl', {});
    assert.equal(preview('https://docs.google.com/spreadsheets/d/AbC_123/copy'), 'https://docs.google.com/spreadsheets/d/AbC_123/copy');
    assert.equal(preview('https://docs.google.com/spreadsheets/d/AbC_123/view#gid=4'), 'https://docs.google.com/spreadsheets/d/AbC_123/edit#gid=4');
    const hub = fs.readFileSync(path.join(root, 'learning-management-system/lms-resources.html'), 'utf8');
    assert.match(hub, /spreadsheets\\\/d\\\/\[A-Za-z0-9_-\]\+\\\/copy/);
    assert.match(hub, /src="\/scripts\/articleship-lms\.js/);
    assert.match(hub, /articleshipLms\.copyMode\(resource\)/, 'the resource hub routes copy rows the same way');
});

test('both course pages load the routing module before the course script', () => {
    for (const file of ['learning-management-system/course.html', 'learning-management-system/course/index.html']) {
        const page = fs.readFileSync(path.join(root, file), 'utf8');
        const lms = page.indexOf('/scripts/articleship-lms.js');
        const course = page.indexOf('/learning-management-system/course-script.js');
        assert.ok(lms > 0 && lms < course, file);
    }
});

test('Articleship sessions without recordings open resources without the empty video card', async () => {
    for (const [slug, expectedTab, expectedEmpty] of [
        ['msc-articleship-program', 'resources', 'none'], ['industrial-training-mastery', 'overview', 'block']
    ]) {
        const state = { courseSlug: slug, watchData: {}, currentVideoId: null, plyrPlayer: null, hlsInstance: null };
        const video = { id: 2, fileName: null, hlsPath: null, resources: [{ title: 'Choose your CV' }] };
        const element = () => ({ style: {}, classList: { remove() {} } });
        const DOMElements = Object.fromEntries(['videoLoadingOverlay', 'noVideoSelectedPlaceholder', 'videoSectionContainer',
            'watchTimeBadge', 'videoPlayerContainer', 'noVideoMessagePlayer', 'courseSidebar'].map(key => [key, element()]));
        DOMElements.videoPlayer = { removeAttribute() {}, load() {} };
        const tabs = [];
        const run = courseFunction('selectVideo', { state, DOMElements,
            stopWatchTracking: async () => {}, hideLockedOverlay() {}, findVideoById: () => video,
            loadLocalWatchTime: () => 0, document: { getElementById: () => DOMElements.videoPlayer },
            supabase: { rpc: async () => ({ data: null }) }, isCompactResourceCourse: () => slug === 'msc-articleship-program',
            setActiveTab: tab => tabs.push(tab), renderTabsAndContent() {},
            window: { innerWidth: 390 }, localStorage: { setItem() {} }, fetchComments() {},
            updateNavButtons() {}, updateVideoCounter() {}, renderCourseModules() {} });
        await run(2);
        assert.equal(tabs[0], expectedTab);
        assert.equal(DOMElements.noVideoMessagePlayer.style.display, expectedEmpty);
        assert.equal(DOMElements.videoPlayerContainer.style.display, 'none');
    }
});

test('compact course names the Day once; a second session title shows only when it differs', () => {
    const run = (sessions, currentVideoId) => {
        const title = { textContent: '', hidden: true };
        const counter = { textContent: '', style: {} };
        courseFunction('updateVideoCounter', {
            state: { currentVideoId, courseSections: [{ day_number: 1, title: 'Day 1 · Crafting the Perfect CV', videos: sessions }] },
            DOMElements: { sessionTitle: title, videoCounter: counter }, isCompactResourceCourse: () => true
        })();
        return { title, counter };
    };
    const one = run([{ id: 2, title: 'Crafting the Perfect CV' }], 2);
    assert.equal(one.counter.textContent, 'Day 1 · Crafting the Perfect CV');
    assert.equal(one.title.hidden, true, 'not repeated under the Day title');
    const two = run([{ id: 2, title: 'Crafting the Perfect CV' }, { id: 20, title: 'Live recording' }], 20);
    assert.equal(two.title.textContent, 'Live recording');
    assert.equal(two.title.hidden, false);
});

test('download-only rows show one button on a phone', () => {
    const start = courseScript.indexOf('    const renderTabsAndContent =');
    const body = courseScript.slice(start, courseScript.indexOf('\n    const setActiveTab', start));
    assert.match(body, /const showView = hasViewTarget \|\| !isCompactResourceCourse\(\);/);
});

test('the sidebar names a one-session Day by its action, not the Day title again', () => {
    const container = { innerHTML: '', appendChild(node) { this.nodes = (this.nodes || []).concat(node); }, querySelectorAll: () => [] };
    const run = courseFunction('renderCourseModules', {
        state: { courseSlug: 'msc-articleship-program', currentVideoId: 2, courseSections: [
            { day_number: 1, title: 'Day 1 · Crafting the Perfect CV', expanded: true, videos: [{ id: 2, title: 'Crafting the Perfect CV', resources: [] }] }] },
        DOMElements: { courseModulesContainer: container }, isCompactResourceCourse: () => true, getResourceIcon: () => '',
        document: { createElement: () => ({ className: '', innerHTML: '' }) }, selectVideo() {}, handleResourceClick() {}, getResourceFromElement() {}
    });
    run();
    assert.match(container.nodes[0].innerHTML, /<span>Open Day 1<\/span>/);
});
