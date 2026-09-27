const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const library = require('../scripts/resource-library.js');

test('catalogue projection excludes URLs and other private resource properties', () => {
    const rows = [
        {program_type:'articleship',title:'Interview master guide',category:'interview-guidance',sort_order:1,url:'SECRET',view_storage_path:'PRIVATE',description:'PRIVATE',resource_key:'PRIVATE'},
        {program_type:'articleship',title:'Interview master guide',category:'interview-guidance'},
        {program_type:'ca-fresher',title:'Wrong program'},
        {program_type:'articleship',title:''}
    ];
    const result = library.sanitizeCatalogue(rows, 'articleship');
    assert.equal(result.length, 1);
    assert.deepEqual(Object.keys(result[0]).sort(), ['category','day_number','group_name','group_order','premium','program','resource_order','session_order','sort_order','title']);
    assert.ok(!JSON.stringify(result).includes('SECRET'));
    assert.ok(!JSON.stringify(result).includes('PRIVATE'));
});

test('catalogue preserves only valid day and source order metadata without inventing missing days', () => {
    const rows = [
        {program_type:'articleship',title:'Welcome',day_number:0,group_name:'  Orientation  ',session_order:0,group_order:2,resource_order:4},
        {program_type:'articleship',title:'Day 9 handbook with no source day',group_name:7},
        ...[null,undefined,'',true,false,'   ',[],{},-1,1.5,Infinity,'invalid'].map((day_number,index) => ({program_type:'articleship',title:'Invalid day '+index,day_number,session_order:true,group_order:1.5,resource_order:'invalid'}))
    ];
    const result = library.sanitizeCatalogue(rows,'articleship');
    assert.equal(result[0].day_number,0);
    assert.equal(result[0].group_name,'Orientation');
    assert.deepEqual([result[0].session_order,result[0].group_order,result[0].resource_order],[0,2,4]);
    assert.equal(result[1].day_number,null);
    assert.equal(result[1].group_name,'');
    for (const row of result.slice(2)) {
        assert.equal(row.day_number,null,row.title);
        assert.equal(row.session_order,null,row.title);
        assert.equal(row.group_order,null,row.title);
        assert.equal(row.resource_order,null,row.title);
    }
});

test('catalogue ignores malformed rows and deduplicates only within the same day and group', () => {
    const base = {program_type:'articleship',title:'Interview Notes',day_number:1,group_name:'Technical',sort_order:2};
    const rows = [null,undefined,42,'invalid',base,
        {...base,title:'  interview notes  ',group_name:' technical '},
        {...base,day_number:2},
        {...base,group_name:'Behavioral'},
        {...base,day_number:null},
        {...base,day_number:undefined},
        {...base,program_type:'ca-fresher'}
    ];
    const result = library.sanitizeCatalogue(rows,'articleship');
    assert.equal(result.length,4);
    assert.deepEqual(result.map(row=>[row.day_number,row.group_name]),[[1,'Technical'],[2,'Technical'],[1,'Behavioral'],[null,'Technical']]);
});

test('premium groups follow real numeric days and source session/group order, leaving undated files in the library', () => {
    const row = (title,day_number,group_name,session_order,group_order,resource_order=0) => ({program_type:'industrial-training',title,day_number,group_name,session_order,group_order,resource_order});
    const resources = library.sanitizeCatalogue([
        row('Day 99 legacy notes',null,'General',null,null),
        row('Late lesson',10,'Applications',0,0),
        row('Second topic',1,'Topic A',1,0),
        row('First topic',1,'Topic Z',0,8),
        row('Other topic',1,'Topic B',1,1),
        row('Middle lesson',2,'Interview Guidance',0,0),
        row('Welcome',0,'Orientation',0,0)
    ],'industrial-training');
    resources.forEach(Object.freeze);Object.freeze(resources);
    const before = JSON.stringify(resources);
    const days = library.groupPremiumResources(resources);
    assert.deepEqual(days.map(day=>day.key),['0','1','2','10','library']);
    assert.deepEqual(days.map(day=>day.day_number),[0,1,2,10,null]);
    assert.deepEqual(days[1].groups.map(group=>group.title),['Topic Z','Topic A','Topic B']);
    assert.equal(days.at(-1).groups[0].title,'More Resources');
    assert.equal(days.at(-1).groups[0].resources[0].title,'Day 99 legacy notes');
    assert.equal(new Set(days.flatMap(day=>day.groups.map(group=>group.key))).size,7);
    assert.equal(JSON.stringify(resources),before,'grouping must not mutate catalogue rows');
});

test('template families use natural numbering while other groups preserve session and resource order', () => {
    const resources = library.sanitizeCatalogue([
        {program_type:'articleship',day_number:1,group_name:'CV Templates',title:'CV Template 10',resource_order:0},
        {program_type:'articleship',day_number:1,group_name:'CV Templates',title:'CV Template 2',resource_order:50},
        {program_type:'articleship',day_number:1,group_name:'CV Templates',title:'CV Template 1',resource_order:99},
        {program_type:'articleship',day_number:1,group_name:'Interview Practice',title:'A later task',session_order:2,resource_order:0},
        {program_type:'articleship',day_number:1,group_name:'Interview Practice',title:'Z first task',session_order:1,resource_order:1},
        {program_type:'articleship',day_number:1,group_name:'Interview Practice',title:'B second task',session_order:1,resource_order:2}
    ],'articleship');
    const groups = library.groupPremiumResources(resources)[0].groups;
    assert.deepEqual(groups.find(group=>group.title==='CV Templates').resources.map(resource=>resource.title),['CV Template 1','CV Template 2','CV Template 10']);
    assert.deepEqual(groups.find(group=>group.title==='Interview Practice').resources.map(resource=>resource.title),['Z first task','B second task','A later task']);
});

test('legacy titles receive useful topic groups without assigning invented program days', () => {
    const examples = [
        ['CV Template 2','CV Templates'],['Cover Letter Template','Cover Letter Templates'],
        ['How to improve your professional summary','CV Guidance'],['Application Email Guide','Application & Outreach'],
        ['Interview Syllabus','Interview Preparation'],['Excel Practice Workbook','Excel Practice'],
        ['Hiring Companies List','Hiring Companies'],['Registration Form 109','Registration & Forms'],
        ['CV Builder','Career Tools'],['WhatsApp Community','WhatsApp Communities'],['Miscellaneous notes','More Resources']
    ];
    for (const [title,group] of examples) assert.equal(library.inferResourceGroup({title}),group,title);
    assert.equal(library.inferResourceGroup({title:'CV Template 2',group_name:'  Industrial CV Templates  '}),'CV Templates');
    assert.equal(library.inferResourceGroup({title:'CV Template 2',group_name:'Special Masterclass'}),'Special Masterclass','specific source groups take precedence');
    const resources = library.sanitizeCatalogue(examples.map(([title])=>({program_type:'ca-fresher',title})),'ca-fresher');
    const days = library.groupPremiumResources(resources);
    assert.equal(days.length,1);assert.equal(days[0].key,'library');assert.equal(days[0].day_number,null);
    assert.equal(days[0].groups.length,examples.length);
});

test('premium search combines title, topic and actual day metadata and requires every term', () => {
    const resources = library.sanitizeCatalogue([
        {program_type:'articleship',title:'Practice Pack',day_number:2,group_name:'Technical Interview Guidance'},
        {program_type:'articleship',title:'Practice Pack',day_number:10,group_name:'Technical Interview Guidance'},
        {program_type:'articleship',title:'CV Template 2'},
        {program_type:'articleship',title:'General Notes'}
    ],'articleship');
    const before = JSON.stringify(resources);
    assert.deepEqual(library.searchResources(resources,' DAY 2 technical pack ').map(row=>row.day_number),[2]);
    assert.equal(library.searchResources(resources,'day 2 missing').length,0);
    assert.equal(library.searchResources(resources,'interview guidance').length,2);
    assert.deepEqual(library.searchResources(resources,'templates cv').map(row=>row.title),['CV Template 2']);
    assert.equal(library.searchResources(resources,'day').length,2,'undated files must not acquire a fictitious Day label');
    assert.equal(library.searchResources(resources,'').length,resources.length);
    assert.equal(JSON.stringify(resources),before);
});

test('editable free resources point to real Word archives and retain PDF previews', () => {
    for (const page of Object.values(library.pages)) {
        for (const resource of page.resources.filter(r => r.format === 'DOCX')) {
            assert.match(resource.downloadUrl, /\.docx$/);
            assert.match(resource.viewUrl, /\.pdf$/);
            const download = path.join(__dirname, '..', resource.downloadUrl);
            const preview = path.join(__dirname, '..', resource.viewUrl);
            assert.equal(fs.readFileSync(download).subarray(0,4).toString('hex'), '504b0304');
            assert.ok(fs.existsSync(preview));
            assert.ok(!resource.fileName.includes('%20'));
        }
    }
});

test('Articleship duplicates only the three editable Fresher resources; Semi Qualified duplicates the full set', () => {
    assert.equal(library.pages.articleship.resources.length, 3);
    assert.ok(library.pages.articleship.resources.every(r => r.format === 'DOCX'));
    assert.deepEqual(library.pages.articleship.resources.map(r => r.downloadUrl),library.pages['ca-fresher'].resources.slice(0,3).map(r => r.downloadUrl));
    assert.deepEqual(library.pages['semi-qualified'].resources.map(r => r.downloadUrl),library.pages['ca-fresher'].resources.map(r => r.downloadUrl));
});

test('download filenames decode URL encoding without introducing path separators', () => {
    assert.equal(library.cleanFileName('Cover%20Letter%20CA%20Fresher.docx'), 'Cover Letter CA Fresher.docx');
    assert.equal(library.cleanFileName('Cover%2520Letter.docx'), 'Cover Letter.docx');
    assert.equal(library.cleanFileName('../../bad/name.docx'), '..-..-bad-name.docx');
    assert.equal(library.cleanFileName('bad%name.docx'), 'bad%name.docx');
});

test('all resource pages use shared navigation, form collection, and correct community CTA', () => {
    for (const slug of ['ca-industrial-training-resources','ca-fresher-training-resources','articleship-resources','semi-qualified-ca-resources']) {
        const html = fs.readFileSync(path.join(__dirname,'..',slug+'.html'),'utf8');
        for (const required of ['site-navigation.js','career-profile.js','resource-form-collector.js','resource-library.js','href="/links"']) assert.ok(html.includes(required), slug+': '+required);
    }
});

test('resource sections keep free files before premium titles and sort numbered template series naturally', () => {
    const free = library.pages['industrial-training'].resources;
    const premium = [62, 10, 2, 20, 1, 11, 3].map(number => ({ title: 'Industrial CV Template ' + number, premium: true, sort_order: 10 }));
    premium.push({ title: 'Featured programme guide', premium: true, sort_order: 1 });
    const before = JSON.stringify({free, premium});
    const sections = library.organizeResources(free, premium);
    assert.deepEqual(Object.keys(sections), ['free', 'premium']);
    assert.deepEqual(sections.free.slice(0, 3).map(resource => resource.title), ['CV Template 2', 'CV Template 3', 'Cover Letter']);
    assert.ok(sections.free.every(resource => !resource.premium));
    assert.ok(sections.premium.every(resource => resource.premium));
    assert.deepEqual(sections.premium.map(resource => resource.title), ['Featured programme guide', ...[1, 2, 3, 10, 11, 20, 62].map(number => 'Industrial CV Template ' + number)]);
    assert.equal(JSON.stringify({free, premium}), before, 'sorting does not mutate the source catalogue');
});

test('premium search matches all supplied words across the entire catalogue without mutating results', () => {
    const resources = ['Industrial CV Template 2', 'Finance Interview Questions', 'Industrial CV Template 62'].map(title => ({title}));
    assert.deepEqual(library.searchResources(resources, '  template 62  ').map(resource => resource.title), ['Industrial CV Template 62']);
    assert.deepEqual(library.searchResources(resources, 'INTERVIEW finance').map(resource => resource.title), ['Finance Interview Questions']);
    assert.deepEqual(library.searchResources(resources, 'missing'), []);
    assert.equal(library.searchResources(resources, '').length, 3);
});


test('premium resources require the matching program, including canonical aliases from shared enrollment verification', () => {
    const vm = require('node:vm');
    const context = {window:{}};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../scripts/program-access.js'),'utf8'), context);
    const canonical = context.window.MSCProgramAccess.canonicalCourse;
    assert.equal(typeof canonical, 'function');
    assert.equal(library.hasProgramEnrollment(['msc-ca-freshers-program'],'industrial-training',canonical), false);
    assert.equal(library.hasProgramEnrollment(['industrial-training-mastery'],'ca-fresher',canonical), false);
    assert.equal(library.hasProgramEnrollment(['industrial-training-mastery'],'articleship',canonical), false);
    assert.equal(library.hasProgramEnrollment(['ca-industrial-training'],'industrial-training',canonical), true);
    assert.equal(library.hasProgramEnrollment(['msc-articleship-program'],'articleship',canonical), true);
    assert.equal(library.hasProgramEnrollment(['msc-ca-freshers-program'],'ca-fresher',canonical), true);
    assert.equal(library.hasProgramEnrollment(['unknown-course'],'articleship',canonical), false);
    assert.equal(library.hasProgramEnrollment([], 'articleship', canonical), false);
});
