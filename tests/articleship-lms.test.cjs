const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const courseScript = fs.readFileSync(path.join(root, 'learning-management-system/course-script.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'learning-management-system/index.html'), 'utf8');
const dashboardScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(/import \{ createApp \} from 'vue';/, '');

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

function migrationRows() {
    const sql = fs.readFileSync(path.join(root, 'supabase/migrations/202610190001_articleship_program_lms.sql'), 'utf8');
    const encoded = sql.match(/json_populate_recordset\(NULL::public\.videos, '([\s\S]*?)'::json\)/);
    assert.ok(encoded, 'migration contains its row payload');
    return JSON.parse(encoded[1].replaceAll("''", "'"));
}

const GUIDEBOOK_SESSIONS = [
    [0, 1, 'The MSC Articleship Guidebook'],
    [1, 2, 'Your articleship CV'], [1, 8, 'Building your profile fast'],
    [2, 3, 'Applying the right way'], [2, 9, 'Follow-ups, offers and your weekly routine'],
    [3, 4, 'Using LinkedIn'], [3, 10, 'Connections and referrals'],
    [4, 5, 'Cracking interviews'], [4, 11, 'Practising audit, tax and Excel'],
    [5, 6, 'Choosing your domain'], [5, 12, 'Finding firms in your domain'],
    [6, 7, 'Registering your articleship'], [6, 13, 'Transfer, industrial training and CA Final']
];
const WHATSAPP_PADAM = 'https://wa.me/917228881182';
const MSC_CHANNEL = 'https://whatsapp.com/channel/0029Vb8XM5GDzgT6YyWk4x0F';
const EXPLORER_URL = 'https://www.mystudentclub.com/articleship-program/experience-explorer/';

test('the dashboard progress estimate counts every Articleship session', async () => {
    const { dashboard } = loadDashboard([{ course: 'msc-articleship-program' }]);
    await dashboard.fetchUserEnrollments();
    assert.equal(dashboard.enrolledCourses[0].videoCountEstimate, migrationRows().length);
});

test('the Articleship migration has one session per guidebook chapter and only student resource groups', () => {
    const rows = migrationRows();
    assert.deepEqual(rows.map(row => [row.day_number, row.video_number, row.title]), GUIDEBOOK_SESSIONS);
    assert.ok(rows.every(row => row.resources.length > 0), 'every programme session has usable resources');
    for (const row of rows) {
        assert.equal(row.course, 'msc-articleship-program');
        assert.equal(row.industrial_training_path, null);
        const seen = new Set();
        for (const resource of row.resources) {
            assert.ok(['Templates', 'Examples', 'Checklists', 'Tools', 'Slides'].includes(resource.group));
            assert.ok(!/^[a-z]|\bcvs\b|^Ca |\(download|^\d{2} /.test(resource.title), `student title: ${resource.title}`);
            const id = resource.url || resource.download_storage_path || resource.view_storage_path;
            assert.ok(!seen.has(id), `${resource.title} is listed once in ${row.title}`);
            seen.add(id);
            assert.ok(!/\/index\.html$/.test(resource.download_storage_path || ''), 'multi-file tool entry pages are not standalone downloads');
            assert.ok(!/\.zip$/.test(resource.download_storage_path || '') || resource.title === 'CV gallery', `${resource.title} is not a repeat kit`);
            for (const key of ['view_storage_path', 'download_storage_path']) {
                if (resource[key]) assert.ok(resource[key].startsWith('articleship-program-v2/day-'));
                assert.ok(!resource[key]?.includes('/automail/'), 'Automail installation source stays internal');
                assert.ok(!/\/cv-gallery\/\d{2}-/.test(resource[key] || ''), 'gallery layouts travel in the gallery ZIP');
            }
            if (resource.type === 'xlsx') assert.ok(resource.view_storage_path?.endsWith('.pdf'), `${resource.title} opens as a PDF on a phone`);
            if (resource.type === 'external_link') assert.match(resource.url, /^https:\/\//);
            if (/selected-(?:industrial-training-)?cvs/.test(resource.view_storage_path || '')) {
                assert.ok(resource.view_storage_path.endsWith('.pdf'));
                assert.equal(resource.download_storage_path, undefined);
            }
        }
    }
    // Every chapter opens on its own non-overlapping slide segment; Day 0 also has the guidebook/free live.
    const slidePaths = [];
    for (const row of rows) {
        const slides = row.resources.filter(resource => resource.group === 'Slides');
        assert.equal(row.resources[0].group, 'Slides', `${row.title} opens on slides`);
        assert.equal(slides.length, row.day_number === 0 ? 3 : 1);
        assert.ok(slides.every(resource => resource.view_storage_path?.endsWith('.pdf')));
        assert.ok(slides.every(resource => resource.title === 'MSC Articleship Guidebook' || !resource.download_storage_path));
        if (row.day_number > 0) assert.equal(slides[0].title, `${row.title} slides`);
        slidePaths.push(...slides.map(resource => resource.view_storage_path));
    }
    assert.equal(new Set(slidePaths).size, slidePaths.length, 'each slide resource appears once');
    const dayZero = rows[0];
    assert.equal(dayZero.description, 'Read the guidebook and join the MSC WhatsApp channel.');
    assert.deepEqual(dayZero.resources.map(resource => resource.title),
        ['MSC Articleship Guidebook', 'Day 0 slides', 'Free live session slides', 'MSC WhatsApp channel', 'WhatsApp Padam']);
    assert.ok(dayZero.resources.some(resource => resource.url === MSC_CHANNEL && resource.group === 'Tools'));
    assert.ok(dayZero.resources.some(resource => resource.url === WHATSAPP_PADAM && resource.group === 'Tools'));
    assert.ok(rows.every(row => row.resources.every(resource => !/welcome|onboarding/i.test(resource.title))));

    const cv = rows.find(row => row.title === 'Your articleship CV').resources;
    const templates = cv.filter(resource => resource.group === 'Templates').map(resource => resource.title);
    assert.equal(templates[0], 'Classic Academic', "the guidebook's pick comes first");
    assert.equal(templates.length, 18 + 1 + 9, '18 CV templates, the gallery and nine cover-letter files');
    assert.equal(templates.indexOf('CV gallery'), 18);
    assert.deepEqual(templates.slice(19, 21), ['Choose your cover letter', 'Statutory Audit Cover Letter']);
    const gallery = cv.find(resource => resource.title === 'CV gallery');
    assert.equal(gallery.download_storage_path, 'articleship-program-v2/day-1/CV gallery.zip');
    assert.equal(gallery.view_storage_path, 'articleship-program-v2/day-1/cv-gallery/Choose your layout.pdf');
    assert.ok(!cv.some(resource => /Day 0 and Day 1/.test(resource.title + (resource.download_storage_path || ''))), 'no repeat kit');
    assert.deepEqual(cv.filter(resource => resource.group === 'Examples').map(resource => resource.title), ['Big 4 and other firms’ CVs']);
    assert.deepEqual(cv.filter(resource => resource.group === 'Tools').map(resource => resource.title), ['CV Builder', 'CV Reviewer', 'Personal CV review']);
    assert.ok(cv.some(resource => resource.title === 'Personal CV review' && resource.url.startsWith(WHATSAPP_PADAM)));
    assert.deepEqual(rows.find(row => row.title === 'Building your profile fast').resources.map(resource => resource.title),
        ['Building your profile fast slides', 'Industrial Training students’ CVs', 'Strengthen your CV', 'CV ahead']);

    const applying = rows.find(row => row.title === 'Applying the right way').resources;
    const automail = applying.find(resource => resource.title === 'Articleship Automail');
    assert.ok(automail, 'Day 2 lists Articleship Automail');
    assert.equal(automail.group, 'Tools');
    assert.equal(automail.type, 'external_link');
    assert.ok(automail.url.startsWith(`${WHATSAPP_PADAM}?text=`), 'students ask Padam for their sheet; no invented Sheet link');
    assert.ok(applying.some(resource => resource.url === MSC_CHANNEL));

    const practising = rows.find(row => row.title === 'Practising audit, tax and Excel').resources;
    assert.equal(practising.find(resource => resource.title === 'Articleship Excel test').group, 'Tools');
    assert.equal(practising.find(resource => resource.title === 'Articleship Excel solution').group, 'Examples');

    const explorers = rows.flatMap(row => row.resources.map(resource => [row, resource]))
        .filter(([, resource]) => resource.title === 'Experience Explorer');
    assert.equal(explorers.length, 1, 'the Experience Explorer is listed once');
    const [explorerRow, explorer] = explorers[0];
    assert.equal(explorerRow.day_number, 5);
    assert.equal(explorerRow.video_number, 12);
    assert.deepEqual(explorerRow.resources.map(item => item.title), ['Finding firms in your domain slides',
        'Domain firm shortlist', 'MSC Domain Roadmaps', 'Domain certifications', 'Firm notes', 'Experience Explorer']);
    assert.equal(explorerRow.resources.find(item => item.title === 'Firm notes').group, 'Examples');
    assert.deepEqual(explorer, { title: 'Experience Explorer', type: 'external_link', url: EXPLORER_URL, group: 'Tools' });
    const hosted = fs.readFileSync(path.join(root, 'articleship-program/experience-explorer/index.html'), 'utf8');
    assert.match(hosted, /<meta name="robots" content="noindex">/);
    assert.match(hosted, /<script type="application\/json" id="msc-experience-data">/);
    assert.ok(!/\bfetch\s*\(/.test(hosted), 'the hosted Explorer needs no sibling files');
});

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

test('LMS shows every guidebook chapter session under its programme day title', async () => {
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
    assert.deepEqual(Array.from(state.courseSections, section => section.day_number), [0, 1, 2, 3, 4, 5, 6]);
    assert.equal(state.courseSections[0].expanded, true);
    assert.equal(state.courseSections[1].expanded, true);
    assert.deepEqual(Array.from(state.courseSections, section => section.title), [
        'Day 0 · Start here', 'Day 1 · Crafting the Perfect CV', 'Day 2 · Applying the Right Way', 'Day 3 · Using LinkedIn',
        'Day 4 · Cracking Interviews', 'Day 5 · Domain Guidance', 'Day 6 · Registration Formalities']);
    assert.deepEqual(Array.from(state.courseSections, section => section.videos.length), [1, 2, 2, 2, 2, 2, 2]);
    assert.deepEqual(Array.from(state.courseSections[1].videos, video => video.title), ['Your articleship CV', 'Building your profile fast']);
    assert.deepEqual(Array.from(state.courseSections[2].videos, video => video.title), ['Applying the right way', 'Follow-ups, offers and your weekly routine']);
    assert.equal(DOMElements.totalVideosCount.textContent, '13 Sessions');
});

test('Articleship resource rows stay compact on a phone without changing other courses', () => {
    const compact = slug => courseFunction('isCompactResourceCourse', { state: { courseSlug: slug } })();
    assert.equal(compact('msc-articleship-program'), true);
    assert.equal(compact('industrial-training-mastery'), false);
    assert.equal(compact('msc-ca-freshers-program'), false);
});

test('Explorer links select only an enrolled Articleship session and its named PDF preview', () => {
    const rows = migrationRows();
    const state = { courseSlug: 'msc-articleship-program', user: { id: 'student' }, isEnrolled: true };
    const window = { location: { search: '' } };
    const target = courseFunction('getArticleshipResourceTarget', { state, window, URLSearchParams,
        findVideoById: id => rows.find(row => row.video_number === id) });
    for (const page of [7, 8, 10]) {
        window.location.search = `?course=msc-articleship-program&session=12&resource=MSC%20Domain%20Roadmaps&page=${page}`;
        const result = target();
        assert.equal(result.video.video_number, 12);
        assert.equal(result.resource.title, 'MSC Domain Roadmaps');
        assert.equal(result.page, page);
    }
    window.location.search = '?session=12&resource=Domain%20firm%20shortlist';
    assert.equal(target().resource.title, 'Domain firm shortlist');
    assert.equal(target().page, 1);
    for (const query of ['?session=999&resource=MSC%20Domain%20Roadmaps', '?session=12&resource=https://evil.test/a.pdf',
        '?session=12.5&resource=MSC%20Domain%20Roadmaps', '?session=-12&resource=MSC%20Domain%20Roadmaps']) {
        window.location.search = query;
        assert.equal(target(), null);
    }
    window.location.search = '?session=12&resource=MSC%20Domain%20Roadmaps&page=-4';
    assert.equal(target().page, 1);
    state.isEnrolled = false;
    assert.equal(target(), null);
    state.isEnrolled = true; state.user = null;
    assert.equal(target(), null);
    state.user = { id: 'student' }; state.courseSlug = 'industrial-training-mastery';
    assert.equal(target(), null);
});

test('an authorised resource link overrides the last session and opens its requested page', async () => {
    const calls = [];
    const resource = { title: 'MSC Domain Roadmaps', view_storage_path: 'articleship-program-v2/day-5/domain-roadmaps/MSC Domain Roadmaps.pdf' };
    const state = { courseSlug: 'msc-articleship-program', user: { id: 'student' }, isEnrolled: true, courseSections: [] };
    const run = courseFunction('loadVideoProgress', { state, console,
        localStorage: { getItem: key => key.startsWith('courseVideos_') ? null : '2' },
        updateCourseProgress() {}, fetchWatchTimeForCourse: async () => {},
        getArticleshipResourceTarget: () => ({ video: { id: 12 }, resource, page: 8 }),
        selectVideo: async id => calls.push(['session', id]), setActiveTab: tab => calls.push(['tab', tab]),
        openResourceViewer: async (...args) => calls.push(['viewer', ...args]) });
    await run();
    assert.equal(calls[0][0], 'session');
    assert.equal(calls[0][1], 12);
    assert.deepEqual(calls[1], ['tab', 'resources']);
    assert.equal(calls[2][1], resource);
    assert.equal(calls[2][2], 'pdf');
    assert.equal(calls[2][3], 8);
});

test('PDF deep links use signed storage and clamp the requested page after loading', async () => {
    const state = { courseSlug: 'msc-articleship-program', user: { id: 'student' }, isEnrolled: true };
    const calls = [];
    const element = () => ({ style: {}, classList: { add() {} }, querySelector: () => element() });
    const DOMElements = Object.fromEntries(['viewerLoadingScreen', 'resourceViewerModal', 'resourceViewerTitle',
        'pdfViewerContainer', 'csvViewerContainer', 'iframeViewerContainer', 'viewerOpenExternalBtn',
        'viewerHeaderDownloadBtn', 'viewerHeaderDownloadText', 'viewerDownloadBtn'].map(key => [key, element()]));
    DOMElements.pdfCanvas = { width: 0, height: 0, getContext: () => ({ clearRect() {} }) };
    const run = courseFunction('openResourceViewer', { state, DOMElements,
        document: { getElementById: () => element() },
        getResourceViewerSubtitle: () => '', getResourceDownloadLabel: () => 'Download',
        supabase: { storage: { from: bucket => ({ createSignedUrl: async (path, ttl) => {
            calls.push(['signed', bucket, path, ttl]); return { data: { signedUrl: 'https://signed.test/private.pdf' }, error: null };
        } }) } },
        fetch: async url => { calls.push(['fetch', url]); return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) }; },
        pdfjsLib: { getDocument: () => ({ promise: Promise.resolve({ numPages: 11 }) }) },
        renderPdfPage: async page => calls.push(['page', page]),
        alert(message) { throw new Error(message); }, closeResourceViewer() { throw new Error('Viewer failed'); } });
    const resource = { title: 'MSC Domain Roadmaps', view_storage_path: 'articleship-program-v2/day-5/domain-roadmaps/MSC Domain Roadmaps.pdf' };
    await run(resource, 'pdf', 8);
    assert.equal(calls.find(call => call[0] === 'signed')[2], resource.view_storage_path);
    assert.deepEqual(calls.at(-1), ['page', 8]);
    await run(resource, 'pdf', 999);
    assert.deepEqual(calls.at(-1), ['page', 11]);
    await run(resource, 'pdf', -5);
    assert.deepEqual(calls.at(-1), ['page', 1]);
    const count = calls.length;
    state.isEnrolled = false;
    await run(resource, 'pdf', 8);
    assert.equal(calls.length, count, 'unenrolled link never requests a signed URL');
    state.isEnrolled = true; state.user = null;
    await run(resource, 'pdf', 8);
    assert.equal(calls.length, count, 'unauthenticated link never requests a signed URL');
});

test('Articleship sessions without recordings open resources without the empty video card', async () => {
    for (const [slug, expectedTab, expectedEmpty] of [
        ['msc-articleship-program', 'resources', 'none'], ['industrial-training-mastery', 'overview', 'block']
    ]) {
        const state = { courseSlug: slug, watchData: {}, currentVideoId: null, plyrPlayer: null, hlsInstance: null };
        const video = { id: 12, fileName: null, hlsPath: null, resources: [{ title: 'Slides' }] };
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
        await run(12);
        assert.equal(tabs[0], expectedTab);
        assert.equal(DOMElements.noVideoMessagePlayer.style.display, expectedEmpty);
        assert.equal(DOMElements.videoPlayerContainer.style.display, 'none');
    }
});
