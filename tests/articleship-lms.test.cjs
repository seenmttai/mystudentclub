const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
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
