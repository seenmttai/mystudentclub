const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
const navSource = fs.readFileSync(path.join(root, 'scripts/site-navigation.js'), 'utf8');
function page(url='/articleship-resources.html') {
  const dom = new JSDOM('<!doctype html><html><head></head><body><main><h1>Resources</h1><input aria-label="Search" id="search"></main></body></html>', { url:'https://www.mystudentclub.com'+url, runScripts:'outside-only', pretendToBeVisual:true });
  dom.window.getSupabaseClient = () => ({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>{}}});
  dom.window.MSCCareerProfile={initOnboarding(){}};
  dom.window.eval(navSource);
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom;
}
test('navigation keeps canonical active resource links, one header and a working skip target',()=>{
 const dom=page(), d=dom.window.document;
 assert.equal(d.querySelectorAll('#msc-site-navigation').length,1);
 assert.equal(d.querySelector('a[href="/articleship-resources"]').getAttribute('aria-current'),'page');
 assert.ok(d.querySelector('a[href="/articleship-resources"]').closest('details').classList.contains('msc-nav-current'));
 const skip=d.querySelector('.msc-skip-link'); assert.ok(d.querySelector(skip.hash)); skip.click(); assert.equal(d.activeElement.tagName,'MAIN');
 dom.window.close();
});
test('mobile menu exposes its state and Escape closes it with focus restoration',()=>{
 const dom=page(),d=dom.window.document,toggle=d.querySelector('.msc-nav-toggle');toggle.click();
 assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(toggle.getAttribute('aria-label'),'Close main menu');
 d.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(toggle.getAttribute('aria-expanded'),'false');assert.equal(d.activeElement,toggle);dom.window.close();
});
test('Escape outside closed navigation never steals focus from a tool or modal',()=>{
 const dom=page(),d=dom.window.document,search=d.getElementById('search');search.focus();d.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(d.activeElement,search);dom.window.close();
});
test('Escape returns focus to the expanded submenu summary',()=>{
 const dom=page(),d=dom.window.document,detail=d.querySelector('details');detail.open=true;
 detail.querySelector('a').focus();d.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(detail.open,false);assert.equal(d.activeElement,detail.querySelector('summary'));dom.window.close();
});
test('tools directory search combines category and words and recovers from no results',()=>{
 const html=fs.readFileSync(path.join(root,'explore.html'),'utf8');const dom=new JSDOM(html,{url:'https://www.mystudentclub.com/explore',runScripts:'outside-only'});
 const scripts=[...dom.window.document.scripts].filter(x=>!x.src);scripts.forEach(x=>dom.window.eval(x.textContent));const d=dom.window.document;
 assert.equal(d.querySelectorAll('.explore-card:not([hidden])').length,27);
 d.querySelector('[data-filter="resources"]').click();assert.equal(d.querySelectorAll('.explore-card:not([hidden])').length,4);
 const input=d.getElementById('explore-search');input.value='industrial';input.dispatchEvent(new dom.window.Event('input'));assert.equal(d.querySelectorAll('.explore-card:not([hidden])').length,1);
 input.value='no-match-xyz';input.dispatchEvent(new dom.window.Event('input'));assert.equal(d.getElementById('explore-empty').hidden,false);
 input.value='';input.dispatchEvent(new dom.window.Event('input'));d.querySelector('[data-filter="all"]').click();assert.equal(d.querySelectorAll('.explore-card:not([hidden])').length,27);dom.window.close();
});
test('contact form retains its real destination and uses accessible native fields',()=>{
 const dom=new JSDOM(fs.readFileSync(path.join(root,'contact.html'),'utf8')),d=dom.window.document;
 assert.equal(d.getElementById('contact-form').getAttribute('action'),'https://formsubmit.co/capadambhansali@gmail.com');
 for(const id of ['name','email','category','description']){const e=d.getElementById(id);assert.ok(e.required);assert.ok(e.labels.length);}
 assert.ok(!d.querySelector('.custom-select-trigger'));assert.equal(d.querySelector('.contact-method').textContent.trim(),'padam@mystudentclub.com');dom.window.close();
});
