const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'learning-management-system/index.html'), 'utf8');
const courseScript = fs.readFileSync(path.join(root, 'learning-management-system/course-script.js'), 'utf8');
const dashboardScript = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1]
    .replace(/import \{ createApp \} from ["']vue["'];/, '');

function loadDashboard(enrollments) {
    const queries = [];
    const client = {
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
    };
    const window = { location: { href: '/learning-management-system/' }, supabase: { createClient: () => client } };
    let options;
    vm.runInNewContext(dashboardScript, {
        window,
        localStorage: { getItem: () => null },
        createApp(value) { options = value; return { mount() {} }; },
        console
    });
    const dashboard = options.data();
    Object.assign(dashboard, options.methods, { user: { id: 'test-student' } });
    return { dashboard, queries, window };
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

test('an Articleship enrollment appears on the mobile dashboard and opens its course', async () => {
    const { dashboard, queries, window } = loadDashboard([{ course: 'msc-articleship-program' }]);
    await dashboard.fetchUserEnrollments();
    assert.equal(dashboard.loading, false);
    assert.equal(dashboard.enrolledCourses.length, 1);
    const course = dashboard.enrolledCourses[0];
    assert.equal(course.title, 'MSC Articleship Program');
    assert.equal(course.videoCountEstimate, 13);
    assert.ok(fs.existsSync(path.resolve(root, 'learning-management-system', course.thumbnail)));
    assert.deepEqual(queries, [{ table: 'enrollment', columns: 'course', column: 'uuid', value: 'test-student' }]);
    dashboard.goToCourse(course.slug);
    assert.equal(window.location.href, 'course.html?course=msc-articleship-program');
});

test('the Articleship catalog entry does not grant access without enrollment', async () => {
    const { dashboard } = loadDashboard([]);
    await dashboard.fetchUserEnrollments();
    assert.equal(dashboard.enrolledCourses.length, 0);
    assert.equal(dashboard.loading, false);
});

test('mobile LMS keeps all 13 sessions under their programme day titles', async () => {
    const rows = Array.from({ length: 7 }, (_, day) => ({
        day_number: day, video_number: day + 1, title: `First session ${day}`, resources: [], industrial_training_path: null
    }));
    rows[0].title = 'Your guidebook';
    rows[1].title = 'Your articleship CV';
    rows.push({ day_number: 1, video_number: 8, title: 'Building your profile fast', resources: [], industrial_training_path: null });
    for (let day = 2; day <= 6; day++) {
        rows.push({ day_number: day, video_number: day + 7, title: `Second session ${day}`, resources: [], industrial_training_path: null });
    }
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
    assert.equal(state.courseSections[0].title, 'Day 0 · Start here');
    assert.equal(state.courseSections[1].title, 'Day 1 · Crafting the Perfect CV');
    assert.deepEqual(Array.from(state.courseSections[1].videos, video => video.title), ['Your articleship CV', 'Building your profile fast']);
    assert.deepEqual(Array.from(state.courseSections, section => section.videos.length), [1, 2, 2, 2, 2, 2, 2]);
    assert.equal(DOMElements.totalVideosCount.textContent, '13 Sessions');
});

test('the mobile session counter shows Day 0 and counts the six teaching days', () => {
    const state = {
        currentVideoId: 1,
        courseSections: Array.from({ length: 7 }, (_, day) => ({ day_number: day, videos: [{ id: day + 1 }] }))
    };
    const DOMElements = { videoCounter: { style: {} } };
    const updateCounter = courseFunction('updateVideoCounter', { state, DOMElements });
    updateCounter();
    assert.equal(DOMElements.videoCounter.textContent, 'Day 0');
    state.currentVideoId = 7;
    updateCounter();
    assert.equal(DOMElements.videoCounter.textContent, 'Day 6 of 6');
    state.courseSections[1].videos.push({ id: 8 });
    state.currentVideoId = 8;
    updateCounter();
    assert.equal(DOMElements.videoCounter.textContent, 'Day 1 of 6 - Session 2/2');
});

test('Articleship resource rows stay compact on a phone without changing other courses', () => {
    const compact = slug => courseFunction('isCompactResourceCourse', { state: { courseSlug: slug } })();
    assert.equal(compact('msc-articleship-program'), true);
    assert.equal(compact('industrial-training-mastery'), false);
    assert.equal(compact('msc-ca-freshers-program'), false);
});

test('Explorer links select only an enrolled Articleship session and its named PDF preview', () => {
    const rows = [{ video_number: 12, resources: [
        { title: 'MSC Domain Roadmaps', view_storage_path: 'articleship-program-v2/day-5/domain-roadmaps/MSC Domain Roadmaps.pdf' },
        { title: 'Domain firm shortlist', view_storage_path: 'articleship-program-v2/day-5/domain-firm-shortlist.pdf' }
    ] }];
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
        applyCourseZoom() {}, initCoursePinchZoom() {},
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

test('mobile Slides open the signed PDF in the MSC reader without requesting a download', async () => {
    const signed = [];
    const window = { location: { href: '' }, open() { throw new Error('Slides must stay in this WebView'); } };
    const run = courseFunction('handleResourceClick', {
        state: { courseSlug: 'msc-articleship-program' }, window,
        supabase: { storage: { from: bucket => ({ createSignedUrl: async (path, ttl) => {
            signed.push({ bucket, path, ttl });
            return { data: { signedUrl: 'https://signed.test/day-3.pdf' }, error: null };
        } }) } },
        isDocxPreviewResource: () => false,
        alert(message) { throw new Error(message); }
    });
    const resource = { title: 'Day 3 slides', type: 'pdf', group: 'Slides',
        view_storage_path: 'articleship-program-v2/day-3/slides/Day 3 slides.pdf' };
    await run(resource);
    assert.equal(signed.length, 1);
    assert.equal(signed[0].path, resource.view_storage_path);
    assert.equal(signed[0].bucket, 'industrial-training-mastery-resources');
    const reader = new URL(window.location.href, 'https://mobile.mystudentclub.com');
    assert.equal(reader.pathname, '/ca-resource/');
    assert.match(reader.searchParams.get('pdf'), /^https:\/\/pdf-proxy-viewer\./);
    assert.equal(reader.searchParams.has('dl'), false);
});

test('the shared Experience Explorer link stays on mobile and its roadmap links return to the mobile LMS', async () => {
    const window = { location: { href: '' }, open() { throw new Error('The Explorer must stay in this WebView'); } };
    const run = courseFunction('handleResourceClick', { state: { courseSlug: 'msc-articleship-program' }, window });
    await run({ title: 'Experience Explorer', type: 'external_link',
        url: 'https://www.mystudentclub.com/articleship-program/experience-explorer/' });
    assert.equal(window.location.href, '/articleship-program/experience-explorer/');
    const explorer = fs.readFileSync(path.join(root, 'articleship-program/experience-explorer/index.html'), 'utf8');
    assert.match(explorer, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
    assert.match(explorer, /<script type="application\/json" id="msc-experience-data">/);
    assert.match(explorer, /const course = '\/learning-management-system\/course\.html\?course=msc-articleship-program&session=12'/);
    assert.ok(!/\bfetch\s*\(/.test(explorer), 'the hosted mobile Explorer has no missing sibling requests');
});

test('view-only Slides and external links omit dead download actions on mobile', () => {
    const resources = [
        { title: 'Day 0 slides', type: 'pdf', group: 'Slides', view_storage_path: 'articleship-program-v2/day-0/slides/Day 0 slides.pdf' },
        { title: 'MSC channel', type: 'external_link', group: 'Tools', url: 'https://example.test/channel' },
        { title: 'Editable template', type: 'docx', group: 'Templates', download_storage_path: 'articleship-program-v2/day-1/template.docx' }
    ];
    const element = () => ({ style: {}, dataset: {}, classList: { add() {} }, addEventListener() {} });
    const DOMElements = { courseTabsContainer: { innerHTML: '', appendChild() {} }, tabContents: {
        overview: {}, resources: { innerHTML: '', querySelectorAll: () => [] }
    } };
    const run = courseFunction('renderTabsAndContent', { state: { currentVideoId: 1 }, DOMElements,
        document: { createElement: element }, findVideoById: () => ({ resources }),
        isCompactResourceCourse: () => true, getResourceViewLabel: () => 'View',
        getResourceDownloadLabel: () => 'Download', getResourceFormatNote: () => '', getResourceIcon: () => ''
    });
    run();
    assert.ok(!DOMElements.tabContents.resources.innerHTML.includes('resource-btn-download disabled'));
    assert.equal((DOMElements.tabContents.resources.innerHTML.match(/<button class="resource-btn resource-btn-download"/g) || []).length, 1);
});
