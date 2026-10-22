const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const Lms = require('../scripts/articleship-lms.js');

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
    assert.equal(course.videoCountEstimate, 7, 'v3: one session per Day');
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

test('other mobile courses keep Day 0 and six-teaching-day counters', () => {
    const state = {
        currentVideoId: 1,
        courseSections: Array.from({ length: 7 }, (_, day) => ({ day_number: day, videos: [{ id: day + 1 }] }))
    };
    const DOMElements = { videoCounter: { style: {} } };
    const updateCounter = courseFunction('updateVideoCounter', { state, DOMElements, isCompactResourceCourse: () => false });
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

test('deep links select only an enrolled Articleship session and a programme PDF row; any other title opens its Day', () => {
    const rows = [{ video_number: 6, resources: [
        { title: 'Articleship registration process', view_storage_path: 'articleship-program-v3/day-6/Articleship registration process.pdf', copy: true },
        { title: 'Industrial training guide', view_storage_path: 'articleship-program-v3/day-6/Industrial training guide.pdf' },
        { title: 'Domain roadmaps', type: 'external_link', url: '/articleship-program/domain-roadmaps/' }
    ] }];
    const state = { courseSlug: 'msc-articleship-program', user: { id: 'student' }, isEnrolled: true };
    const window = { location: { search: '' } };
    const target = courseFunction('getArticleshipResourceTarget', { state, window, URLSearchParams,
        findVideoById: id => rows.find(row => row.video_number === id) });
    for (const page of [2, 6, 9]) {
        window.location.search = `?course=msc-articleship-program&session=6&resource=Articleship%20registration%20process&page=${page}`;
        const result = target();
        assert.equal(result.video.video_number, 6);
        assert.equal(result.resource.title, 'Articleship registration process');
        assert.equal(result.page, page);
    }
    window.location.search = '?session=6&resource=Industrial%20training%20guide';
    assert.equal(target().resource.title, 'Industrial training guide');
    assert.equal(target().page, 1);
    // A title that is not a programme PDF of that session (a tool row, a row not in the course yet, a URL) opens the Day.
    for (const query of ['?session=6&resource=Domain%20roadmaps', '?session=6&resource=GST%20booklet', '?session=6&resource=https://evil.test/a.pdf']) {
        window.location.search = query;
        assert.equal(target().video.video_number, 6);
        assert.equal(target().resource, null);
    }
    // A tool or download row of that Day comes back as `row`, so the Day opens scrolled to it; other titles: just the Day.
    window.location.search = '?session=6&resource=Domain%20roadmaps';
    assert.equal(target().row.title, 'Domain roadmaps');
    window.location.search = '?session=6&resource=GST%20booklet';
    assert.equal(target().row, null);
    window.location.search = '?session=6&resource=Industrial%20training%20guide';
    assert.equal(target().row, null, 'a PDF row opens the file');
    for (const query of ['?session=999&resource=Industrial%20training%20guide', '?session=6.5&resource=Industrial%20training%20guide',
        '?session=-6&resource=Industrial%20training%20guide']) {
        window.location.search = query;
        assert.equal(target(), null);
    }
    window.location.search = '?session=6&resource=Industrial%20training%20guide&page=-4';
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
        articleshipLms: () => Lms, openCopyResource: async (...args) => calls.push(['copy', ...args]),
        openResourceViewer: async (...args) => calls.push(['viewer', ...args]) });
    await run();
    assert.equal(calls[0][0], 'session');
    assert.equal(calls[0][1], 12);
    assert.deepEqual(calls[1], ['tab', 'resources']);
    assert.equal(calls[2][1], resource);
    assert.equal(calls[2][2], 'pdf');
    assert.equal(calls[2][3], 8);
});

test('a deep link to a tool or download row opens its Day on Resources, scrolled to that row and flashed', async () => {
    const calls = [];
    const state = { courseSlug: 'msc-articleship-program', user: { id: 'student' }, isEnrolled: true, courseSections: [] };
    const run = courseFunction('loadVideoProgress', { state, console,
        localStorage: { getItem: () => null },
        updateCourseProgress() {}, fetchWatchTimeForCourse: async () => {},
        getArticleshipResourceTarget: () => ({ video: { id: 4 }, resource: null, page: 1, row: { title: 'Career Portal Links' } }),
        articleshipLms: () => Lms,
        selectVideo: async id => calls.push(['session', id]), setActiveTab: tab => calls.push(['tab', tab]),
        highlightResourceRow: title => calls.push(['row', title]),
        openCopyResource: async () => calls.push(['copy']), openResourceViewer: async () => calls.push(['viewer']) });
    await run();
    assert.deepEqual(calls, [['session', 4], ['tab', 'resources'], ['row', 'Career Portal Links']]);

    const { JSDOM } = require('jsdom');
    const dom = new JSDOM(`<div id="res"><div class="resource-group"><ul class="resource-list">
        <li class="resource-item"><div class="resource-meta"><span class="resource-title">LinkedIn search links</span></div></li>
        <li class="resource-item"><div class="resource-meta"><span class="resource-title">Career Portal Links</span></div></li>
        </ul></div></div>`, { pretendToBeVisual: true });
    const win = dom.window;
    const scrolled = [];
    win.HTMLElement.prototype.scrollIntoView = function (options) { scrolled.push([this.textContent.trim(), options]); };
    const timers = [];
    const highlight = courseFunction('highlightResourceRow', { window: win, requestAnimationFrame: fn => fn(),
        setTimeout: fn => timers.push(fn), DOMElements: { tabContents: { resources: win.document.getElementById('res') } } });
    highlight('Career Portal Links');
    const items = [...win.document.querySelectorAll('.resource-item')];
    assert.equal(items[1].classList.contains('resource-item-target'), true, 'the row flashes');
    assert.equal(items[0].classList.contains('resource-item-target'), false);
    assert.deepEqual(scrolled.map(s => s[0]), ['Career Portal Links']);
    assert.equal(scrolled[0][1].block, 'center');
    timers.forEach(fn => fn());
    assert.equal(items[1].classList.contains('resource-item-target'), false, 'the flash ends');
    highlight('No such row');
    assert.equal(scrolled.length, 1, 'an unknown title scrolls nowhere');
    const css = fs.readFileSync(path.join(root, 'learning-management-system/course-styles.css'), 'utf8');
    assert.match(css, /\.resource-item\.resource-item-target\s*\{[^}]*animation:/);
    assert.match(css, /prefers-reduced-motion: reduce\)\s*\{\s*\.resource-item\.resource-item-target/);
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
        isDocxPreviewResource: () => false, articleshipLms: () => Lms,
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

test('programme tools (site paths, or the desktop host) open inside the WebView; other links leave it', async () => {
    const opened = [];
    const window = { location: { href: '' }, open(url) { opened.push(url); } };
    const run = courseFunction('handleResourceClick', { state: { courseSlug: 'msc-articleship-program' }, window, articleshipLms: () => Lms });
    for (const [url, expected] of [
        ['/articleship-program/interview-tracker/', '/articleship-program/interview-tracker/'],
        ['/ai-interview.html?mode=articleship', '/ai-interview.html?mode=articleship'],
        ['/cv-builder/?stage=articleship', '/cv-builder/?stage=articleship'],
        ['https://www.mystudentclub.com/articleship-program/experience-explorer/', '/articleship-program/experience-explorer/']
    ]) {
        window.location.href = '';
        await run({ title: 'Tool', type: 'external_link', url });
        assert.equal(window.location.href, expected, url);
    }
    assert.deepEqual(opened, []);
    await run({ title: 'Join the MSC Articleship WhatsApp group', type: 'external_link', url: 'https://chat.whatsapp.com/abc' });
    assert.deepEqual(opened, ['https://chat.whatsapp.com/abc'], 'WhatsApp and other sites go through the app');
    // The v3 Explorer page loads its data and script from this branch and links back with site paths.
    const explorer = fs.readFileSync(path.join(root, 'articleship-program/experience-explorer/index.html'), 'utf8');
    assert.match(explorer, /<meta name="viewport" content="width=device-width, initial-scale=1/);
    assert.match(explorer, /\/scripts\/articleship-experience-explorer\.js/);
    assert.ok(!/https:\/\/www\.mystudentclub\.com\/learning-management-system/.test(explorer));
    assert.ok(fs.existsSync(path.join(root, 'articleship-program/experience-explorer/experiences.json')));
});

test('copy rows open the copyable reader in place (a click) or instead of the course page (a deep link)', async () => {
    const signed = [];
    const window = { location: { href: '', replace(url) { this.href = 'replaced:' + url; } }, open() { throw new Error('no second tab in the WebView'); } };
    const supabase = { storage: { from: bucket => ({ createSignedUrl: async (path, ttl) => {
        signed.push({ bucket, path, ttl });
        return { data: { signedUrl: 'https://signed.test/application-templates.pdf' }, error: null };
    } }) } };
    const openCopy = courseFunction('openCopyResource', { window, supabase, articleshipLms: () => Lms, console, alert(message) { throw new Error(message); } });
    const resource = { title: 'Application templates', copy: true, view_storage_path: 'articleship-program-v3/day-2/Application templates.pdf' };
    await openCopy(resource, 8);
    const reader = new URL(window.location.href, 'https://mobile.mystudentclub.com');
    assert.equal(reader.pathname, '/ca-resource/read/');
    assert.equal(reader.searchParams.get('pdf'), 'https://signed.test/application-templates.pdf');
    assert.equal(reader.searchParams.get('page'), '8');
    assert.equal(reader.searchParams.get('title'), 'Application templates');
    await openCopy(resource, 1, { deepLink: true });
    assert.match(window.location.href, /^replaced:\/ca-resource\/read\/\?pdf=/);
    assert.equal(signed[0].bucket, 'industrial-training-mastery-resources');
    assert.equal(signed[0].path, resource.view_storage_path);
    // handleResourceClick routes a copy row there before any other rule.
    const calls = [];
    const click = courseFunction('handleResourceClick', { state: { courseSlug: 'msc-articleship-program' }, window, articleshipLms: () => Lms,
        openCopyResource: async (...args) => calls.push(args) });
    await click(resource);
    assert.equal(calls[0][0], resource);
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


test('compact mobile course names the active Day and session', () => {
    const title = { textContent: '', hidden: true };
    const counter = { textContent: '', style: {} };
    const run = courseFunction('updateVideoCounter', {
        state: { currentVideoId: 12, courseSections: [{ day_number: 5, title: 'Day 5 · Domain Guidance', videos: [{ id: 6, title: 'Choosing your domain' }, { id: 12, title: 'Finding firms in your domain' }] }] },
        DOMElements: { sessionTitle: title, videoCounter: counter }, isCompactResourceCourse: () => true
    });
    run();
    assert.equal(counter.textContent, 'Day 5 · Domain Guidance');
    assert.equal(title.textContent, 'Finding firms in your domain');
    assert.equal(title.hidden, false);
});

test('mobile ZIP downloads explain that the gallery is for a laptop', () => {
    const run = courseFunction('getResourceDownloadLabel', { isDocxPreviewResource: () => false, isCompactResourceCourse: () => true, articleshipLms: () => Lms });
    assert.equal(run({ type: 'zip', download_storage_path: 'gallery.zip' }), 'Download ZIP (for laptop)');
    // Articleship v3 rows: the shared labels (Padam's sheets and the Master Excel test are Excel downloads).
    assert.equal(run({ title: 'Top 100 Articleship Firms', type: 'xlsx', download_storage_path: 'articleship-program-v3/day-5/Top 100 Articleship Firms.xlsx' }), 'Download Excel');
    assert.equal(run({ title: 'Post Articleship CVs', download_storage_path: 'a.pdf', download_label: 'Download to print' }), 'Download to print');
});

test('template rows open the inline viewer at their page in other courses; the Articleship course never uses it', async () => {
    const calls = [];
    const window = { location: { href: '' }, open() { throw new Error('stay in the WebView'); } };
    const make = slug => courseFunction('handleResourceClick', {
        state: { courseSlug: slug }, window, articleshipLms: () => Lms, isDocxPreviewResource: () => false,
        supabase: { storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.test/t.pdf' }, error: null }) }) } },
        openResourceViewer: async (...args) => calls.push(args), alert(message) { throw new Error(message); }
    });
    const resource = { title: 'Follow-up mails', type: 'docx', group: 'Templates',
        view_storage_path: 'industrial-training/Mail Templates.pdf', page: 3 };
    await make('industrial-training-mastery')(resource);
    assert.equal(calls[0][0], resource);
    assert.equal(calls[0][1], 'pdf');
    assert.equal(calls[0][2], 3);
    await make('industrial-training-mastery')({ ...resource, page: '3' });
    assert.equal(calls[1][2], 1);
    await make('msc-articleship-program')({ ...resource, view_storage_path: 'articleship-program-v3/day-2/Back-out templates.pdf' });
    assert.equal(calls.length, 2, 'no inline canvas viewer for the Articleship course');
    assert.match(window.location.href, /^\/ca-resource\/\?pdf=/);
});

test('v3 rows: an Excel download-only row shows only its Download button, a tool row only Open', () => {
    const resources = [
        { title: 'Top 100 Articleship Firms', type: 'xlsx', group: 'Choose your domain', download_storage_path: 'articleship-program-v3/day-5/Top 100 Articleship Firms.xlsx' },
        { title: 'Domain roadmaps', type: 'external_link', group: 'Choose your domain', url: '/articleship-program/domain-roadmaps/' }
    ];
    const DOMElements = { courseTabsContainer: { innerHTML: '', appendChild() {} }, tabContents: {
        overview: {}, resources: { innerHTML: '', querySelectorAll: () => [] }
    } };
    const element = () => ({ style: {}, dataset: {}, classList: { add() {} }, addEventListener() {} });
    const run = courseFunction('renderTabsAndContent', { state: { currentVideoId: 1 }, DOMElements,
        document: { createElement: element }, findVideoById: () => ({ resources }),
        isCompactResourceCourse: () => true, getResourceViewLabel: r => (r.type === 'external_link' ? 'Open' : 'View'),
        getResourceDownloadLabel: () => 'Download Excel', getResourceFormatNote: () => '', getResourceIcon: () => ''
    });
    run();
    const html = DOMElements.tabContents.resources.innerHTML;
    const items = html.split('<li class="resource-item">').slice(1);
    assert.equal(items.length, 2);
    assert.ok(!/resource-btn-view/.test(items[0]), 'no View for an .xlsx (the PDF viewer cannot show it)');
    assert.match(items[0], /resource-btn-download"[^>]*><i class="fas fa-download"><\/i> Download Excel/);
    assert.match(items[1], /resource-btn-view[\s\S]*Open/);
    assert.ok(!/resource-btn-download/.test(items[1]));
});
