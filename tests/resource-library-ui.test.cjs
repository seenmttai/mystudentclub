// Run with the jsdom installation used by the career-profile and download tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function render(slug, rpc, setup = () => {}) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, slug + '.html'), 'utf8'), { url: 'https://mystudentclub.com/' + slug, runScripts: 'outside-only' });
    dom.window.supabaseClient = { rpc };
    setup(dom.window);
    dom.window.eval(fs.readFileSync(path.join(root, 'scripts/resource-library.js'), 'utf8'));
    await tick();
    return dom;
}
const rowsForTemplates = (count = 62, extra = {}) => Array.from({length:count}, (_, index) => ({
    program_type:'industrial-training', title:'Industrial CV Template '+(count-index), sort_order:10,
    category:'cv-prep', url:'PRIVATE-URL', storage_path:'PRIVATE-STORAGE-PATH', ...extra
}));
const titlesIn = node => [...node.querySelectorAll('.resource-premium .resource-title')].map(title => title.textContent);
const groupsIn = doc => [...doc.querySelectorAll('.premium-collection')];
const groupNamed = (doc, name) => groupsIn(doc).find(group => group.querySelector('h4').textContent === name);
const typeSearch = (dom, query) => {
    const input = dom.window.document.querySelector('#premium-resource-search');
    input.focus(); input.value = query; input.dispatchEvent(new dom.window.Event('input'));
    assert.equal(dom.window.document.activeElement, input, 'search keeps keyboard focus while results update');
};
function assertReferenceTargets(doc) {
    const ids = [...doc.querySelectorAll('[id]')].map(node => node.id);
    assert.equal(new Set(ids).size, ids.length, 'rendered IDs stay unique');
    for (const node of doc.querySelectorAll('[aria-controls],[aria-labelledby]')) {
        const references = [node.getAttribute('aria-controls'), node.getAttribute('aria-labelledby')].filter(Boolean).join(' ').split(/\s+/);
        for (const id of references) assert.ok(doc.getElementById(id), 'ARIA reference exists: '+id);
    }
}
function mockDialog(window) {
    const dialog = window.document.querySelector('#resource-enroll-dialog');
    dialog.showModal = () => { dialog.open = true; dialog.querySelector('.dialog-close').focus(); };
    dialog.close = () => { dialog.open = false; dialog.dispatchEvent(new window.Event('close')); };
}

test('all four pages retain Free/Premium top-level sections, unchanged free resources, and community at the top', async () => {
    const slugs = {'ca-industrial-training-resources':6,'ca-fresher-training-resources':5,'articleship-resources':3,'semi-qualified-ca-resources':5};
    for (const [slug, freeCount] of Object.entries(slugs)) {
        const dom = await render(slug, async () => ({data:[]}));
        try {
            const doc = dom.window.document;
            assert.deepEqual([...doc.querySelectorAll('#resources-container .resource-section h2')].map(node => node.textContent), ['Free Resources', 'Premium Resources']);
            assert.ok(doc.querySelector('.resource-hero').nextElementSibling.matches('.resource-community'));
            assert.ok(doc.querySelector('.resource-community').nextElementSibling.matches('.resource-audience-nav'));
            assert.deepEqual([...doc.querySelectorAll('.resource-jump-nav a')].map(node => node.getAttribute('href')), ['#resource-free','#resource-premium']);
            assert.equal(doc.querySelectorAll('.resource-free-section .resource-card').length, freeCount);
            assert.ok(doc.querySelector('.resource-search-toolbar').hidden, 'an empty catalogue has no unusable search');
            assert.ok(doc.querySelector('#premium-day-filters').hidden);
            for (const button of doc.querySelectorAll('.resource-free-section button')) assert.ok(button.getAttribute('aria-label').includes(button.textContent));
            if (slug === 'ca-industrial-training-resources') {
                const sheet = [...doc.querySelectorAll('.resource-card')].find(card => card.textContent.includes('Industrial Training Hiring Companies List'));
                assert.equal(sheet.querySelectorAll('button').length, 1);
                assert.equal(sheet.querySelector('button').textContent, 'Open Google Sheet');
                assert.match(sheet.textContent, /Download availability is managed by the sheet owner/);
            }
            assertReferenceTargets(doc);
        } finally { dom.window.close(); }
    }
});

test('fallback groups preview three numbered templates and independently expand/collapse with accessible focus', async () => {
    const rows = [...rowsForTemplates(), ...Array.from({length:4}, (_,i)=>({program_type:'industrial-training',title:'Cover Letter '+(i+1),category:'cv-prep',sort_order:10}))];
    const dom = await render('ca-industrial-training-resources', async () => ({data:rows}));
    try {
        const doc = dom.window.document;
        assert.ok(doc.querySelector('#premium-day-filters').hidden, 'missing source day never invents a course day');
        assert.deepEqual([...doc.querySelectorAll('.premium-day h3')].map(n=>n.textContent), ['Resource collections']);
        assert.deepEqual(titlesIn(groupNamed(doc, 'CV Templates')), ['Industrial CV Template 1','Industrial CV Template 2','Industrial CV Template 3']);
        assert.equal(titlesIn(groupNamed(doc, 'Cover Letter Templates')).length, 3);
        assert.equal(doc.querySelector('#resource-premium-count').textContent, '66');
        assert.equal(doc.querySelector('#premium-search-results').textContent, '66 resources · 2 collections');
        let toggle = groupNamed(doc, 'CV Templates').querySelector('.premium-group-toggle');
        assert.equal(toggle.textContent, 'View all 62');
        assert.equal(toggle.getAttribute('aria-expanded'), 'false');
        assert.ok(toggle.getAttribute('aria-label').includes(toggle.textContent));
        toggle.focus(); toggle.click();
        toggle = groupNamed(doc, 'CV Templates').querySelector('.premium-group-toggle');
        assert.equal(doc.activeElement, toggle, 'replacement expanded trigger retains focus');
        assert.equal(toggle.getAttribute('aria-expanded'), 'true');
        assert.ok(toggle.getAttribute('aria-label').includes(toggle.textContent), 'visible collapse label belongs in accessible name');
        assert.deepEqual(titlesIn(groupNamed(doc, 'CV Templates')), Array.from({length:62},(_,i)=>'Industrial CV Template '+(i+1)));
        assert.equal(titlesIn(groupNamed(doc, 'Cover Letter Templates')).length, 3, 'other group remains collapsed');
        groupNamed(doc, 'Cover Letter Templates').querySelector('.premium-group-toggle').click();
        groupNamed(doc, 'CV Templates').querySelector('.premium-group-toggle').click();
        assert.equal(titlesIn(groupNamed(doc, 'CV Templates')).length, 3);
        assert.equal(titlesIn(groupNamed(doc, 'Cover Letter Templates')).length, 4, 'collapsing one group leaves the other expanded');
        assert.equal(doc.activeElement, groupNamed(doc, 'CV Templates').querySelector('.premium-group-toggle'));
        assert.equal(doc.querySelector('#resource-premium-count').textContent, '66', 'counts represent all resources, including collapsed items');
        assert.ok(!doc.body.innerHTML.includes('PRIVATE-URL'));
        assert.ok(!doc.body.innerHTML.includes('PRIVATE-STORAGE-PATH'));
        assertReferenceTargets(doc);
    } finally { dom.window.close(); }
});

function sequencedRows() {
    const resource = (title, day, group, session, groupOrder, resourceOrder) => ({program_type:'industrial-training',title,day_number:day,group_name:group,session_order:session,group_order:groupOrder,resource_order:resourceOrder,sort_order:50,category:'application-tricks'});
    return [
        resource('Common Handbook',10,'Technical Preparation',2,1,1),
        ...rowsForTemplates(5,{day_number:2,group_name:'CV Templates',session_order:1,group_order:2}),
        resource('Late Alphabetically',2,'Stored First Collection',1,1,1),
        resource('Common Handbook',2,'Stored First Collection',1,1,2),
        resource('Orientation',0,'Welcome',0,1,1),
        resource('Unscheduled Guide',null,'Additional Material',null,null,null)
    ];
}

test('actual program days and stored group sequence render numerically, preserving repeated titles across days', async () => {
    const dom = await render('ca-industrial-training-resources', async () => ({data:sequencedRows()}));
    try {
        const doc = dom.window.document;
        assert.deepEqual([...doc.querySelectorAll('.premium-day h3')].map(n=>n.textContent), ['Day 0','Day 2','Day 10','More resources']);
        assert.deepEqual([...doc.querySelector('#premium-day-2').closest('.premium-day').querySelectorAll('h4')].map(n=>n.textContent), ['Stored First Collection','CV Templates']);
        assert.deepEqual([...doc.querySelectorAll('.premium-day-filter')].map(n=>n.dataset.day), ['all','0','2','10','library']);
        for (const button of doc.querySelectorAll('.premium-day-filter')) {
            assert.ok(button.getAttribute('aria-label'), 'day chip separates the day name and resource count for screen readers');
            assert.equal(button.getAttribute('aria-pressed'), button.dataset.day === 'all' ? 'true' : 'false');
        }
        assert.equal(titlesIn(doc).filter(title=>title==='Common Handbook').length, 2, 'identical names on different days remain available');
        assert.equal(doc.querySelector('#resource-premium-count').textContent, '10');
        assert.ok([...doc.querySelectorAll('.resource-premium .resource-title')].every(n=>n.tagName==='H5'));
        assertReferenceTargets(doc);
    } finally { dom.window.close(); }
});

test('full-catalogue search reveals collapsed title/group matches and clearing restores independent group state', async () => {
    const rows = [...rowsForTemplates(), ...Array.from({length:5},(_,i)=>({program_type:'industrial-training',title:'Example '+(i+1),group_name:'Cover Letter Templates',sort_order:10}))];
    const dom = await render('ca-industrial-training-resources', async () => ({data:rows}));
    try {
        const doc = dom.window.document;
        groupNamed(doc,'Cover Letter Templates').querySelector('.premium-group-toggle').click();
        typeSearch(dom,'Template 62');
        assert.deepEqual(titlesIn(doc), ['Industrial CV Template 62']);
        assert.equal(doc.querySelector('#premium-search-results').textContent, '1 match');
        assert.equal(doc.querySelectorAll('.premium-group-toggle').length, 0, 'matching search content is fully exposed');
        typeSearch(dom,'Cover Letter Templates');
        assert.deepEqual(titlesIn(doc), ['Example 1','Example 2','Example 3','Example 4','Example 5'], 'group names are searchable even when absent from resource titles');
        assert.equal(doc.querySelector('#premium-search-results').textContent, '5 matches');
        typeSearch(dom,'no such resource');
        assert.equal(titlesIn(doc).length, 0);
        assert.equal(doc.querySelector('#premium-search-results').textContent, '0 matches');
        assert.ok(!doc.querySelector('#premium-resources-empty').hidden);
        typeSearch(dom,'');
        assert.equal(titlesIn(groupNamed(doc,'CV Templates')).length, 3, 'search does not expand a previously collapsed group');
        assert.equal(titlesIn(groupNamed(doc,'Cover Letter Templates')).length, 5, 'search preserves a previously expanded group');
        assert.equal(doc.querySelector('#resource-premium-count').textContent, '67');
        assertReferenceTargets(doc);
    } finally { dom.window.close(); }
});

test('day filtering intersects search, preserves day-button focus, and leaves global counts intact', async () => {
    const dom = await render('ca-industrial-training-resources', async () => ({data:sequencedRows()}));
    try {
        const doc = dom.window.document;
        const dayTwo = doc.querySelector('[data-day="2"]'); dayTwo.focus(); dayTwo.click();
        assert.equal(doc.activeElement.dataset.day,'2');
        assert.equal(doc.activeElement.getAttribute('aria-pressed'),'true');
        assert.deepEqual([...doc.querySelectorAll('.premium-day h3')].map(n=>n.textContent), ['Day 2']);
        typeSearch(dom,'Common Handbook');
        assert.deepEqual(titlesIn(doc), ['Common Handbook']);
        assert.equal(doc.querySelector('#premium-search-results').textContent,'1 match in Day 2');
        const all = doc.querySelector('[data-day="all"]'); all.focus(); all.click();
        assert.equal(doc.activeElement.dataset.day,'all');
        assert.deepEqual(titlesIn(doc), ['Common Handbook','Common Handbook']);
        assert.equal(doc.querySelector('#premium-search-results').textContent,'2 matches');
        assert.equal(doc.querySelector('#resource-premium-count').textContent,'10');
        assertReferenceTargets(doc);
    } finally { dom.window.close(); }
});

test('missing v2 function alone falls back to names-only v1 without fabricated days', async () => {
    const calls = [];
    const dom = await render('ca-industrial-training-resources', async (name,args) => {
        calls.push([name,args]);
        return name.endsWith('_v2') ? {error:{code:'PGRST202'}} : {data:rowsForTemplates(4)};
    });
    try {
        const doc = dom.window.document;
        assert.deepEqual(calls.map(call=>call[0]),['get_public_resource_catalog_v2','get_public_resource_catalog']);
        assert.ok(calls.every(call=>call[1].p_program==='industrial-training'));
        assert.ok(doc.querySelector('#premium-day-filters').hidden);
        assert.equal(groupNamed(doc,'CV Templates').querySelector('.premium-group-toggle').textContent,'View all 4');
        assert.ok(!doc.querySelector('.premium-day h3').textContent.includes('Day'));
    } finally { dom.window.close(); }
});

test('an unavailable catalogue keeps free resources usable, never falls back on other errors, and offers retry', async () => {
    let fail = true; const calls = [];
    const dom = await render('ca-industrial-training-resources', async name => { calls.push(name); return fail ? {error:{code:'42501',message:'permission denied'}} : {data:[]}; });
    try {
        const doc = dom.window.document;
        assert.deepEqual(calls,['get_public_resource_catalog_v2']);
        assert.equal(doc.querySelectorAll('.resource-free-section .resource-card').length, 6);
        assert.equal(doc.querySelector('#premium-search-results').textContent, 'Premium library unavailable');
        assert.equal(doc.querySelector('#resource-premium-count').textContent, '—');
        assert.ok(doc.querySelector('#premium-resources-empty').hidden);
        typeSearch(dom,'CV');
        assert.equal(doc.querySelector('#premium-search-results').textContent, 'Premium library unavailable');
        fail = false; doc.querySelector('#resource-catalog-status button').click(); await tick();
        assert.equal(doc.querySelector('#resource-catalog-status').textContent, '');
        assert.equal(doc.querySelector('#resource-premium-count').textContent, '0');
        assert.equal(doc.querySelector('#premium-resources-empty').textContent, 'New program resources will appear here as they are added.');
    } finally { dom.window.close(); }
});

test('free download/preview actions still pass original title and correct file types through the intake collector', async () => {
    const calls = []; const downloads = []; const opens = [];
    const dom = await render('ca-fresher-training-resources', async()=>({data:[]}), window => {
        window.resourceFormCollector = {checkAndAccess:async (title,url,access)=>{calls.push({title,url});await access();}};
        window.fetch = async()=>({ok:true,headers:{get:()=> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'},blob:async()=>new window.Blob(['editable document'])});
        window.URL.createObjectURL = ()=> 'blob:resource-test'; window.URL.revokeObjectURL = ()=>{};
        window.HTMLAnchorElement.prototype.click = function(){downloads.push({name:this.download,href:this.href});};
        window.open = (...args)=>opens.push(args);
    });
    try {
        const doc = dom.window.document;
        const card = doc.querySelector('.resource-free-section .resource-card');
        card.querySelectorAll('button')[0].click(); await tick();
        card.querySelectorAll('button')[1].click(); await tick();
        assert.deepEqual(calls,[{title:'CV Template 1',url:'/assets/ca-fresher-resources/CV Template-1.docx'},{title:'CV Template 1',url:'/assets/ca-fresher-resources/CV Template-1.pdf'}]);
        assert.deepEqual(downloads,[{name:'CV Template-1.docx',href:'blob:resource-test'}]);
        assert.equal(opens.length,1); assert.match(opens[0][0],/CV%20Template-1\.pdf$/);
    } finally { dom.window.close(); }
});

test('premium actions in expanded groups recheck enrollment and retain dialog labels and keyboard focus', async () => {
    let accessCalls = 0, catalogueCalls = 0, now = 0;
    const dom = await render('ca-industrial-training-resources', async()=>{catalogueCalls++;return {data:rowsForTemplates(5)};}, window=>{
        window.Date.now=()=>now;
        mockDialog(window);
        window.MSCProgramAccess = {getAccess:async()=>{accessCalls++;return {courses:[{course:'msc-ca-freshers-program'}]};}};
    });
    try {
        const doc = dom.window.document;
        groupNamed(doc,'CV Templates').querySelector('.premium-group-toggle').click();
        const buttons = groupNamed(doc,'CV Templates').querySelectorAll('.resource-card')[4].querySelectorAll('button');
        for (const button of buttons) {
            button.focus(); button.click(); await tick();
            assert.equal(doc.querySelector('#resource-enroll-dialog').open,true);
            assert.equal(doc.querySelector('#resource-enroll-resource').textContent,'Industrial CV Template 5');
            assert.match(doc.querySelector('#resource-enroll-title').textContent,/MSC Industrial Training Program/);
            assert.equal(doc.querySelector('#resource-enroll-link').getAttribute('href'),'/ca-industrial-training-program/');
            assert.equal(button.disabled,false);
            now+=61001;dom.window.dispatchEvent(new dom.window.Event('focus'));await tick();
            assert.equal(catalogueCalls,1,'an open dialog prevents refresh from detaching its return-focus target');
            assert.ok(button.isConnected);
            doc.querySelector('.dialog-close').click();
            assert.equal(doc.activeElement,button,'closing enrollment dialog restores the originating action');
        }
        assert.equal(accessCalls,2,'both View and Download require fresh access checks');
        assert.ok(!doc.body.innerHTML.includes('PRIVATE-URL'));
    } finally { dom.window.close(); }
});

test('refresh keeps an existing selected day and group state, then resets to All days if that day is removed', async () => {
    let rows = sequencedRows(); let now = 0;
    const dom = await render('ca-industrial-training-resources', async()=>({data:rows}), window=>{window.Date.now=()=>now;});
    try {
        const doc = dom.window.document;
        doc.querySelector('[data-day="2"]').click();
        groupNamed(doc,'CV Templates').querySelector('.premium-group-toggle').click();
        now=61001;dom.window.dispatchEvent(new dom.window.Event('focus'));await tick();
        assert.equal(doc.querySelector('[data-day="2"]').getAttribute('aria-pressed'),'true');
        assert.equal(titlesIn(groupNamed(doc,'CV Templates')).length,5);
        rows=rows.filter(row=>row.day_number!==2);
        now=122002;dom.window.dispatchEvent(new dom.window.Event('focus'));await tick();
        assert.equal(doc.querySelector('[data-day="all"]').getAttribute('aria-pressed'),'true');
        assert.deepEqual([...doc.querySelectorAll('.premium-day h3')].map(n=>n.textContent),['Day 0','Day 10','More resources']);
        assert.equal(doc.querySelector('#resource-premium-count').textContent,'3');
    } finally { dom.window.close(); }
});
