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

test('the Articleship migration has eight distinct sessions and only student resource groups', () => {
    const sql = fs.readFileSync(path.join(root, 'supabase/migrations/202610190001_articleship_program_lms.sql'), 'utf8');
    const encoded = sql.match(/json_populate_recordset\(NULL::public\.videos, '([\s\S]*?)'::json\)/);
    assert.ok(encoded, 'migration contains its row payload');
    const rows = JSON.parse(encoded[1].replaceAll("''", "'"));
    assert.equal(rows.length, 8);
    assert.equal(new Set(rows.map(row => row.video_number)).size, 8);
    assert.deepEqual([...new Set(rows.map(row => row.day_number))], [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(rows.filter(row => row.day_number === 1).map(row => row.title), ['Your articleship CV', 'Building your profile fast']);
    for (const row of rows) {
        assert.equal(row.course, 'msc-articleship-program');
        assert.equal(row.industrial_training_path, null);
        for (const resource of row.resources) {
            assert.ok(['Templates', 'Examples', 'Checklists', 'Tools', 'Slides'].includes(resource.group));
            for (const key of ['view_storage_path', 'download_storage_path']) {
                if (resource[key]) assert.ok(resource[key].startsWith('articleship-program-v2/day-'));
            }
            if (/selected-(?:industrial-training-)?cvs/.test(resource.view_storage_path || '')) {
                assert.ok(resource.view_storage_path.endsWith('.pdf'));
                assert.equal(resource.download_storage_path, undefined);
            }
        }
    }
    assert.ok(rows[0].resources.every(resource => !/welcome|onboarding/i.test(resource.title)));
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

test('LMS keeps Day 0 and two Day 1 sessions under their programme day titles', async () => {
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
