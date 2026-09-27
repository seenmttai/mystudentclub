// Run with the jsdom installation used by the career-profile and download tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
async function render(slug, rpc) {
    const dom = new JSDOM(fs.readFileSync(path.join(root, slug + '.html'), 'utf8'), { url: 'https://mystudentclub.com/' + slug, runScripts: 'outside-only' });
    dom.window.supabaseClient = { rpc };
    dom.window.eval(fs.readFileSync(path.join(root, 'scripts/resource-library.js'), 'utf8'));
    await tick();
    return dom;
}

test('all four pages render only Free and Premium sections with community above the audience tabs', async () => {
    for (const slug of ['ca-industrial-training-resources','ca-fresher-training-resources','articleship-resources','semi-qualified-ca-resources']) {
        const dom = await render(slug, async () => ({data:[]}));
        const doc = dom.window.document;
        assert.deepEqual([...doc.querySelectorAll('#resources-container .resource-section h2')].map(node => node.textContent), ['Free Resources', 'Premium Resources']);
        assert.ok(doc.querySelector('.resource-hero').nextElementSibling.matches('.resource-community'));
        assert.ok(doc.querySelector('.resource-community').nextElementSibling.matches('.resource-audience-nav'));
        assert.deepEqual([...doc.querySelectorAll('.resource-jump-nav a')].map(node => node.getAttribute('href')), ['#resource-free','#resource-premium']);
        assert.ok(doc.querySelector('.resource-search-toolbar').hidden, 'a catalogue with no premium resources does not show an unusable search');
        for (const button of doc.querySelectorAll('.resource-free-section button')) assert.ok(button.getAttribute('aria-label').includes(button.textContent));
        if (slug === 'ca-industrial-training-resources') {
            const sheet = [...doc.querySelectorAll('.resource-card')].find(card => card.textContent.includes('Industrial Training Hiring Companies List'));
            assert.equal(sheet.querySelectorAll('button').length, 1);
            assert.equal(sheet.querySelector('button').textContent, 'Open Google Sheet');
            assert.match(sheet.textContent, /Download availability is managed by the sheet owner/);
        }
        dom.window.close();
    }
});

test('premium pagination and full-catalogue search preserve numeric template order and counts', async () => {
    const rows = Array.from({length:62}, (_, index) => ({program_type:'industrial-training',title:'Industrial CV Template '+(62-index),sort_order:10,category:'cv-prep',url:'PRIVATE-URL'}));
    const dom = await render('ca-industrial-training-resources', async () => ({data:rows}));
    const doc = dom.window.document;
    const titles = () => [...doc.querySelectorAll('.resource-premium .resource-title')].map(node => node.textContent);
    assert.deepEqual(titles(), Array.from({length:24}, (_, index) => 'Industrial CV Template '+(index+1)));
    assert.equal(doc.querySelector('#premium-search-results').textContent, 'Showing 24 of 62 resources');
    doc.querySelector('#premium-show-more').click();
    assert.equal(titles().length, 48);
    assert.ok(doc.activeElement.getAttribute('aria-label').includes('Industrial CV Template 25'));
    doc.querySelector('#premium-show-more').click();
    assert.equal(titles().at(-1), 'Industrial CV Template 62');
    assert.ok(doc.querySelector('#premium-show-more').hidden);
    const input = doc.querySelector('#premium-resource-search');
    input.value = 'Template 62'; input.dispatchEvent(new dom.window.Event('input'));
    assert.deepEqual(titles(), ['Industrial CV Template 62']);
    assert.equal(doc.querySelector('#premium-search-results').textContent, '1 match · Showing 1');
    input.value = 'not available'; input.dispatchEvent(new dom.window.Event('input'));
    assert.equal(titles().length, 0);
    assert.equal(doc.querySelector('#premium-resources-empty').textContent, 'No resources match your search. Try another keyword.');
    input.value = ''; input.dispatchEvent(new dom.window.Event('input'));
    assert.equal(titles().length, 24);
    assert.ok(!doc.body.innerHTML.includes('PRIVATE-URL'));
    dom.window.close();
});

test('an unavailable premium catalogue keeps free resources usable and offers retry without claiming the catalogue is empty', async () => {
    let fail = true;
    const dom = await render('ca-industrial-training-resources', async () => fail ? {error:new Error('offline')} : {data:[]});
    const doc = dom.window.document;
    assert.equal(doc.querySelectorAll('.resource-free-section .resource-card').length, 6);
    assert.equal(doc.querySelector('#premium-search-results').textContent, 'Premium library unavailable');
    assert.equal(doc.querySelector('#resource-premium-count').textContent, '—');
    assert.ok(doc.querySelector('#premium-resources-empty').hidden);
    const input = doc.querySelector('#premium-resource-search'); input.value='CV'; input.dispatchEvent(new dom.window.Event('input'));
    assert.equal(doc.querySelector('#premium-search-results').textContent, 'Premium library unavailable');
    fail = false; doc.querySelector('#resource-catalog-status button').click(); await tick();
    assert.equal(doc.querySelector('#resource-catalog-status').textContent, '');
    assert.equal(doc.querySelector('#resource-premium-count').textContent, '0');
    assert.equal(doc.querySelector('#premium-resources-empty').textContent, 'New program resources will appear here as they are added.');
    dom.window.close();
});
