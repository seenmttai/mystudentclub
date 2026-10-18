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

test('mobile LMS keeps Day 0 and two Day 1 sessions under their programme day titles', async () => {
    const rows = Array.from({ length: 7 }, (_, day) => ({
        day_number: day, video_number: day + 1, title: `First session ${day}`, resources: [], industrial_training_path: null
    }));
    rows[0].title = 'Your guidebook';
    rows[1].title = 'Your articleship CV';
    rows.push({ day_number: 1, video_number: 8, title: 'Building your profile fast', resources: [], industrial_training_path: null });
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
    assert.equal(DOMElements.totalVideosCount.textContent, '8 Sessions');
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
