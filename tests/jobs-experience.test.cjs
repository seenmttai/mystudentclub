const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts/portal3.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
function filterFixture() {
  const dom = new JSDOM('<aside class="filter-sidebar"><div class="multi-select-container" data-type="location"><input id="locationFilterDesktop" class="multi-select-input"><div class="multi-select-options"></div></div><div id="locationPillsDesktop"></div></aside>', { runScripts: 'outside-only' });
  const w = dom.window;
  w.state = { locations: [], categories: [] };
  w.allLocations = ['Bengaluru', 'Mumbai', 'New Delhi'];
  w.allCategories = {}; w.currentTable = 'Industrial Training Job Portal';
  w.fetches = 0; w.resetAndFetch = () => { w.fetches++; };
  w.flattenCategories = rows => rows;
  w.eval(extract('function renderPills(', '\nfunction renderActiveFilterPills'));
  w.eval(extract('function setupMultiSelect(', '\nfunction processAndApplySearch'));
  w.setupMultiSelect(w.document.querySelector('.multi-select-container'));
  return dom;
}

test('location dropdown works with arrow navigation, applies chosen value and restores focus', () => {
  const dom = filterFixture(); const w = dom.window; const d = w.document;
  const input = d.querySelector('input'); input.focus();
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(d.activeElement.textContent, 'Bengaluru');
  d.activeElement.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(d.activeElement.textContent, 'Mumbai');
  d.activeElement.click();
  assert.deepEqual(Array.from(w.state.locations), ['Mumbai']);
  assert.equal(w.fetches, 1);
  assert.equal(d.activeElement, input);
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.equal(d.querySelector('.selected-pill button').getAttribute('aria-label'), 'Remove Mumbai filter');
  d.querySelector('.selected-pill button').click();
  assert.equal(w.state.locations.length, 0);
  dom.window.close();
});

test('custom filter text is rendered literally and Escape closes only the dropdown', () => {
  const dom = filterFixture(); const w = dom.window; const d = w.document;
  const input = d.querySelector('input'); input.focus();
  input.value = '<img src=x onerror=alert(1)>';
  input.dispatchEvent(new w.Event('input'));
  assert.equal(d.querySelectorAll('.multi-select-options img').length, 0);
  assert.ok(d.querySelector('.multi-select-options').textContent.includes('<img'));
  let escaped = 0; d.addEventListener('keydown', e => { if (e.key === 'Escape') escaped++; });
  input.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.equal(escaped, 0);
  dom.window.close();
});

test('sort label and control match the actual query order', () => {
  const dom = new JSDOM('<select id="sortBySelect"><option value="newest">Newest</option></select><select id="sortBySelectMobile"><option value="newest">Newest</option></select>', {runScripts:'outside-only'});
  dom.window.state = { sortBy: 'newest' };
  dom.window.eval(extract('function updateSortOptions()', '\nfunction setupEventListeners'));
  dom.window.updateSortOptions();
  assert.equal(dom.window.document.querySelector('select').value, 'newest');
  dom.window.state.sortBy = 'popular'; dom.window.updateSortOptions();
  assert.equal(dom.window.document.querySelector('select').value, 'popular');
  assert.equal(dom.window.document.querySelectorAll('option[value="popular"]').length, 2);
  dom.window.close();
});

test('job dialog supports Escape and restores page scrolling and trigger focus', async () => {
  const dom = new JSDOM('<body class="msc-jobs"><button id="trigger">View details</button><div id="modal" style="display:none"><div class="modal-dialog"><button id="modalCloseBtn">Close</button><h2>Example company</h2></div></div></body>', {runScripts:'outside-only', pretendToBeVisual:true});
  const w = dom.window, d = w.document;
  d.getElementById('trigger').focus();
  d.getElementById('modalCloseBtn').onclick = () => { d.getElementById('modal').style.display = 'none'; d.body.style.overflow = 'auto'; };
  w.eval(fs.readFileSync(path.join(root, 'scripts/jobs-experience.js'), 'utf8'));
  d.body.style.overflow = 'hidden'; d.getElementById('modal').style.display = 'flex';
  await tick();
  assert.equal(d.activeElement, d.querySelector('.modal-dialog'));
  assert.equal(d.querySelector('.modal-dialog').getAttribute('aria-labelledby'), 'job-details-title');
  d.dispatchEvent(new w.KeyboardEvent('keydown', {key:'Escape', bubbles:true}));
  await tick();
  assert.equal(d.getElementById('modal').style.display, 'none');
  assert.notEqual(d.body.style.overflow, 'hidden');
  assert.equal(d.activeElement.id, 'trigger');
  dom.window.close();
});

test('result feedback counts loaded cards and updates accessible saved state', async () => {
  const dom = new JSDOM('<body class="msc-jobs"><p id="jobs-results-summary"></p><div id="jobs"></div><div id="loader" style="display:none"></div></body>', {runScripts:'outside-only'});
  const w=dom.window, d=w.document;
  w.eval(fs.readFileSync(path.join(root, 'scripts/jobs-experience.js'), 'utf8'));
  d.getElementById('jobs').innerHTML = '<article class="job-card"><h2 class="job-card-company">Example company</h2><button class="job-card-bookmark">Save</button></article>';
  await tick();
  assert.equal(d.getElementById('jobs-results-summary').textContent, '1 opportunity loaded');
  const bookmark=d.querySelector('button'); bookmark.classList.add('saved'); await tick();
  assert.equal(bookmark.getAttribute('aria-pressed'), 'true');
  assert.equal(bookmark.getAttribute('aria-label'), 'Unsave job at Example company');
  assert.equal(d.getElementById('jobs').getAttribute('aria-busy'), 'false');
  dom.window.close();
});

test('all five canonical career stages include named search, page context and existing job/apply hooks', () => {
  for (const name of ['index', 'ca-articleship-opportunities', 'semi-qualified-ca-jobs', 'ca-fresher-jobs', 'experienced-ca-jobs']) {
    const dom=new JSDOM(fs.readFileSync(path.join(root, name+'.html'), 'utf8'));
    const d=dom.window.document;
    assert.equal(d.querySelectorAll('main h1').length, 1, name);
    assert.equal(d.querySelectorAll('.portal-nav-bar [aria-current="page"]').length, 1, name);
    assert.ok(d.getElementById('dv2TopSearchInput').getAttribute('aria-label'), name);
    for (const id of ['jobs','modal','modal-body-content','filterModalOverlay','sortBySelect','sortBySelectMobile','applyFiltersBtn','desktopResetBtn']) assert.ok(d.getElementById(id), name+': '+id);
    assert.ok(d.querySelector('script[src*="portal3.js"]'), name);
    dom.window.close();
  }
});

test('directory initializes after DOMContentLoaded and renders the public records without creating custom select wrappers', async () => {
  const page = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {runScripts:'outside-only', url:'https://mystudentclub.com/', pretendToBeVisual:true});
  const w=page.window, d=w.document;
  await tick(); // Modules may finish loading after this event on a restored page.
  const job = {id:42, Company:'Example & Company', Location:'Mumbai', Salary:15000, Description:'A training opportunity in financial reporting.', Created_At:new Date().toISOString(), Category:'Finance', 'Primary Domain':'Finance', application_count:3};
  const queries=[];
  w.supabaseClient = {
    auth: { getSession: async () => ({data:{session:null}}), onAuthStateChange: () => ({}) },
    from(table) {
      const calls=[]; queries.push({table,calls});
      const query = new Proxy({}, {get(_, name) {
        if (name === 'then') return (resolve, reject) => Promise.resolve({data:table === 'Industrial Training Job Portal' ? [job] : [], error:null}).then(resolve,reject);
        return (...args) => { calls.push([name, ...args]); return query; };
      }});
      return query;
    }
  };
  w.fetch = async url => ({ok:true, json:async () => url.includes('locations') ? ['Mumbai'] : {'Industrial Training Job Portal':['Finance']}});
  w.IntersectionObserver=class { observe(){} disconnect(){} };
  w.Notification={permission:'default'};
  w.getDaysAgo=()=>'today'; w.isProfileComplete=()=>false; w.generateEmailBody=async()=>'';
  w.generateFallbackEmail=()=>''; w.showResumeRedirectModal=()=>{}; w.showToast=()=>{};
  w.unlockJobDetails=async()=>{}; w.getCachedUnlockedJob=()=>null;
  w.eval(fs.readFileSync(path.join(root, 'scripts/jobs-experience.js'), 'utf8'));
  w.eval(source.replace(/^import .*;\r?\n/gm, ''));
  await tick(); await tick();
  assert.equal(d.querySelectorAll('#jobs .job-card').length, 1);
  assert.equal(d.querySelector('.job-card-company').textContent, job.Company);
  assert.equal(d.querySelectorAll('.custom-select-wrapper').length, 0);
  assert.ok(d.querySelector('.stipend-range-min').getAttribute('aria-label').includes('Minimum stipend'));
  assert.ok(d.querySelector('.stipend-range-max').getAttribute('aria-label').includes('Maximum stipend'));
  assert.equal(d.getElementById('jobs-results-summary').textContent, '1 opportunity loaded');
  assert.ok(queries.some(query => query.table === 'Industrial Training Job Portal'));
  assert.equal(d.getElementById('sortBySelect').value, 'newest');
  const listingQueryCount = () => queries.filter(query => query.calls.some(call => call[0] === 'range')).length;
  const initialQueries = listingQueryCount();
  d.getElementById('open-filter-modal-btn').click();
  const mobileSort = d.getElementById('sortBySelectMobile');
  mobileSort.value = 'salary_desc'; mobileSort.dispatchEvent(new w.Event('change'));
  const mobileLocation = d.getElementById('locationFilterMobile');
  mobileLocation.value = 'Mumbai'; mobileLocation.dispatchEvent(new w.Event('input'));
  mobileLocation.parentElement.querySelector('.multi-select-option').click();
  assert.ok(d.getElementById('locationPillsMobile').textContent.includes('Mumbai'));
  d.getElementById('closeFilterModalBtn').click();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(mobileSort.value, 'newest', 'cancel restores the sort selection');
  assert.equal(d.getElementById('locationPillsMobile').textContent, '', 'cancel restores the location selection');
  assert.equal(listingQueryCount(), initialQueries, 'uncommitted mobile changes do not query jobs');
  d.getElementById('open-filter-modal-btn').click();
  mobileSort.value = 'salary_desc'; mobileSort.dispatchEvent(new w.Event('change'));
  d.getElementById('applyFiltersBtn').click();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.equal(d.getElementById('sortBySelect').value, 'salary_desc');
  assert.equal(listingQueryCount(), initialQueries + 1, 'applying mobile filters issues one listing request');
  d.getElementById('open-filter-modal-btn').click();
  d.getElementById('closeFilterModalBtn').click();
  d.getElementById('open-filter-modal-btn').click();
  const industry = d.getElementById('industryTypeFilterMobile');
  industry.value = 'Banking'; industry.dispatchEvent(new w.Event('change', {bubbles:true}));
  // Native popover clicks must not count as an intentional backdrop press.
  d.getElementById('filterModalOverlay').click();
  await new Promise(resolve => setTimeout(resolve, 400));
  assert.ok(d.getElementById('filterModalOverlay').classList.contains('show'), 'rapid reopen keeps the dialog open while selecting a filter');
  assert.equal(industry.value, 'Banking');
  page.window.close();
});

test('canonical career-stage routes are recognized before considering preference redirects', () => {
  for (const [pathname, expected] of [['/', 'industrial'], ['/ca-articleship-opportunities', 'articleship'], ['/ca-fresher-jobs', 'fresher_fresher'], ['/experienced-ca-jobs','fresher_experienced'], ['/semi-qualified-ca-jobs','semi_fresher']]) {
    const dom = new JSDOM('', {url:'https://mystudentclub.com'+pathname, runScripts:'outside-only'});
    dom.window.state={experience:'Freshers'};
    dom.window.eval(extract('function getCurrentPagePreference()', '\n// Get saved job preference'));
    assert.equal(dom.window.getCurrentPagePreference(), expected, pathname);
    dom.window.close();
  }
});
