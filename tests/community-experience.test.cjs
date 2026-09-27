const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const load=name=>new JSDOM(fs.readFileSync(path.join(root,name+'.html'),'utf8'),{url:'https://mystudentclub.com/'+name+'.html',runScripts:'outside-only'});

test('visiting hirer registration preserves the signed-in session; switching accounts is explicit',async()=>{
 const page=load('hirer-signup'); const w=page.window,d=w.document; await tick();
 let signouts=0,signups=0;
 w.supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:'existing-user'}}}}),signOut:async()=>{signouts++;return{error:null}},signUp:async()=>{signups++;return{data:{},error:null}}}};
 w.scrollTo=()=>{};
 w.eval(d.querySelector('script:not([src])').textContent);
 w.dispatchEvent(new w.Event('DOMContentLoaded')); await tick();
 assert.equal(signouts,0); assert.equal(d.getElementById('existing-account-panel').hidden,false); assert.equal(d.getElementById('hirerForm').hidden,true);
 d.getElementById('hirerForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(signups,0);
 d.getElementById('use-different-account').click();await tick();
 assert.equal(signouts,1);assert.equal(d.getElementById('hirerForm').hidden,false);assert.equal(d.activeElement.id,'fullName');
 page.window.close();
});

test('Following discussions uses the authenticated watcher IDs instead of returning every thread',async()=>{
 const page=load('forum');const w=page.window,d=w.document;
 const source=d.querySelector('script[type="module"]').textContent;
 const a=source.indexOf('async function loadThreads()'),b=source.indexOf('async function loadTrending()',a);
 Object.assign(w,{currentUser:{id:'current-user'},currentCategory:null,currentFilter:'following',currentSort:'recent',searchQuery:'',threadRequest:0,escapeHTML:x=>String(x||''),getAvatar:()=> 'A',timeAgo:()=> 'today'});
 const calls=[];
 w.supabaseClient={from(table){const query=new Proxy({}, {get(_,key){if(key==='then')return(resolve,reject)=>Promise.resolve({data:table==='forum_thread_watchers'?[{thread_id:7}]:[{id:7,title:'Followed thread',content:'',upvotes:0,downvotes:0,reply_count:0,views:0}],error:null}).then(resolve,reject);return(...args)=>{calls.push([table,key,...args]);return query}}});return query}};
 w.eval(source.slice(a,b));await w.loadThreads();
 assert.ok(calls.some(call=>call[0]==='forum_thread_watchers'&&call[1]==='eq'&&call[2]==='user_id'&&call[3]==='current-user'));
 const filter=calls.find(call=>call[0]==='forum_threads'&&call[1]==='in');assert.equal(filter[2],'id');assert.deepEqual(Array.from(filter[3]),[7]);
 assert.equal(d.querySelectorAll('.thread-item').length,1);assert.equal(d.getElementById('threads-list').getAttribute('aria-busy'),'false');
 page.window.close();
});

test('all reviewed surfaces have scoped presentation and preserve their main forms and scripts',()=>{
 for(const name of ['forum','new-thread','thread','reviews','hirer-signup','post-a-job','jobs-by-email']){
  const page=load(name),d=page.window.document;
  assert.ok(d.body.classList.contains('msc-community-page'),name);
  assert.ok(d.querySelector('main'),name+' main landmark');
  const ids=[...d.querySelectorAll('[id]')].map(el=>el.id);assert.equal(new Set(ids).size,ids.length,name+' duplicate IDs');
  if(name==='reviews')assert.equal(d.querySelectorAll('[role="dialog"][aria-modal="true"]').length,3);
  if(name==='forum')assert.equal(d.getElementById('quick-create-collapsed').tagName,'BUTTON');
  if(name==='post-a-job')assert.ok(d.getElementById('postJobForm'));
  page.window.close();
 }
});
