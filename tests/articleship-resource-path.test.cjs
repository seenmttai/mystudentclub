const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

test('admin loads newly added canonical Articleship sessions alongside existing programs', async () => {
    const html = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
    const start = html.indexOf('async function loadLmsVideos()');
    const end = html.indexOf('async function persistSelectedLmsResources', start);
    const rows = [
        {course:'industrial-training-mastery',resources:[]},
        {course:'msc-ca-freshers-program',resources:[]},
        {course:'msc-articleship-program',resources:[{title:'Articleship resource',view_storage_path:'private/new.pdf'}]}
    ];
    let included = [];
    const query = { select(){return this}, in(column, values){assert.equal(column,'course');included=[...values];return this}, order(){return this}, then(resolve,reject){return Promise.resolve({data:rows.filter(row=>included.includes(row.course))}).then(resolve,reject)} };
    const state = {videos:[]};
    const context = {console:{warn(){},error:console.error},lmsResourceState:state,supabaseClient:{from(table){assert.equal(table,'videos');return query}},parseVideoResources:value=>value,normalizeLmsResource:value=>value,setLmsResourceStatus(){},renderLmsVideoOptions(){},resetLmsResourceForm(){}};
    vm.createContext(context);vm.runInContext(html.slice(start,end),context);
    await context.loadLmsVideos();
    assert.equal(state.videos.length,3);
    assert.equal(state.videos.find(row=>row.course==='msc-articleship-program').resources[0].title,'Articleship resource');
    assert.match(html, /<option value="msc-articleship-program">MSC Articleship Program<\/option>/);
});

test('an Articleship enrollment resolves to an existing LMS dashboard and course definition', () => {
    const html = fs.readFileSync(path.join(root, 'learning-management-system/index.html'), 'utf8');
    const catalogue = html.match(/masterCatalog:\s*(\[[\s\S]*?\]),\s*enrolledCourses:/)[1];
    const courses = vm.runInNewContext('('+catalogue+')');
    const enrolled = courses.filter(course=>['msc-articleship-program'].includes(course.slug));
    assert.equal(enrolled.length,1);
    assert.equal(enrolled[0].title,'MSC Articleship Program');
    assert.ok(fs.existsSync(path.join(root,enrolled[0].thumbnail)));
    const courseSource = fs.readFileSync(path.join(root, 'learning-management-system/course-script.js'),'utf8');
    const definitions = courseSource.match(/const courses = (\{[\s\S]*?\n    \});/)[1];
    const courseMap = vm.runInNewContext('('+definitions+')');
    assert.equal(courseMap[enrolled[0].slug].title,enrolled[0].title);
    assert.ok(fs.existsSync(path.join(root,courseMap[enrolled[0].slug].thumbnail)));
});
