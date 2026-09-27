const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function harness(kind, mode = 'success') {
    const dom = new JSDOM('<!doctype html><button id="logoutBtn">Logout</button><a id="lms-nav-link">My Courses</a><div class="application-status-filter-group"></div>', {url:'https://mystudentclub.com/profile.html'});
    const callbacks = [], calls = {signOut:0,cleared:0,errors:[],header:[]};
    const session = {user:{id:'member-a',email:'a@example.test'}};
    const {localStorage,sessionStorage,document}=dom.window;
    localStorage.setItem('sb-izsggdtdiacxdsjjncdq-auth-token',JSON.stringify(session));
    localStorage.setItem('userProfileData','{"name":"Member A"}');
    localStorage.setItem('userCVText','Member A CV');
    localStorage.setItem('userCoverLetterText','Member A cover letter');
    localStorage.setItem('msc_profile_cache_owner','member-a');
    localStorage.setItem('subscribedTopics','["industrial"]');
    localStorage.setItem('site-theme','dark');
    localStorage.setItem('sb-other-project-auth-token','unrelated project session');
    sessionStorage.setItem('msc_career_v2:member-a:ca-fresher','true');
    let release;
    const gate = mode==='pending' ? new Promise(resolve=>{release=resolve;}) : null;
    const supabaseClient={auth:{
        onAuthStateChange: callback=>callbacks.push(callback),
        signOut: async()=>{
            calls.signOut++;
            if(gate)await gate;
            if(mode==='returned-error')return{error:new Error('Network unavailable')};
            if(mode==='thrown-error')throw new Error('Network unavailable');
            callbacks.forEach(callback=>callback('SIGNED_OUT',null));
            return{error:null};
        }
    }};
    const window={document,localStorage,sessionStorage,supabaseClient,location:{href:'/original-page'},MSCCareerProfile:{clearGuestState:()=>calls.cleared++}};
    const context=vm.createContext({window,document,localStorage,sessionStorage,supabaseClient,
        showToast:(...args)=>calls.errors.push(args),
        userEnrollmentsCache:['industrial-training-mastery'],enrollmentStatusCache:{any:true},currentSession:session,
        appliedJobIds:new Set(['job-a']),state:{applicationStatus:'saved',experience:'fresher'},
        updateHeaderAuth:value=>calls.header.push(value)
    });
    vm.runInContext(read('scripts/supabase-init.js'),context);
    if(kind==='profile') {
        const source=read('scripts/profile.js');
        assert.match(source,/getElementById\('logoutBtn'\)\.addEventListener\('click', handleProfileLogout\)/);
        vm.runInContext(source.slice(source.indexOf('async function handleProfileLogout('),source.indexOf('// =================== TOAST NOTIFICATIONS')),context);
    } else {
        const source=read('scripts/portal3.js');
        assert.match(source,/querySelector\('#logoutBtn'\)\.addEventListener\('click', handleLogout\)/);
        vm.runInContext(source.slice(source.indexOf('let logoutInProgress = false;'),source.indexOf('async function fetchUserEnrollmentsOnce(')),context);
    }
    const button=document.getElementById('logoutBtn');
    const invoke=()=>kind==='profile'?context.handleProfileLogout({currentTarget:button}):window.handleLogout({currentTarget:button});
    return{dom,context,window,localStorage,sessionStorage,button,calls,invoke,release};
}

for(const kind of ['profile','portal']) {
    test(kind+' original header logout uses shared account cleanup and preserves unrelated preferences',async()=>{
        const h=harness(kind);
        try {
            await h.invoke();
            assert.equal(h.calls.signOut,1);
            assert.equal(h.calls.cleared,1,'the real shared SIGNED_OUT callback ran');
            for(const key of ['userProfileData','userCVText','userCoverLetterText','msc_profile_cache_owner'])assert.equal(h.localStorage.getItem(key),null,key);
            assert.equal(h.sessionStorage.getItem('msc_career_v2:member-a:ca-fresher'),null);
            assert.equal(h.localStorage.getItem('site-theme'),'dark');
            assert.equal(h.localStorage.getItem('sb-other-project-auth-token'),'unrelated project session');
            assert.equal(h.window.location.href,kind==='profile'?'/login.html':'/');
            assert.equal(h.button.disabled,false);
            assert.equal(h.button.textContent,'Logout');
            assert.equal(h.calls.errors.length,0);
            if(kind==='portal') {
                assert.equal(h.context.currentSession,null);
                assert.equal(h.context.userEnrollmentsCache,null);
                assert.equal(h.context.appliedJobIds.size,0);
                assert.deepEqual(h.calls.header,[null]);
            }
        } finally {h.dom.window.close();}
    });
    for(const mode of ['returned-error','thrown-error']) {
        test(kind+' logout '+mode+' retains the account and gives a retryable error without redirecting',async()=>{
            const h=harness(kind,mode);
            try {
                const before={...h.localStorage};
                await h.invoke();
                assert.equal(h.calls.cleared,0);
                assert.deepEqual({...h.localStorage},before);
                assert.equal(h.sessionStorage.getItem('msc_career_v2:member-a:ca-fresher'),'true');
                assert.equal(h.window.location.href,'/original-page');
                assert.equal(h.button.disabled,false);
                assert.equal(h.button.textContent,'Logout');
                assert.equal(h.calls.errors.length,1);
                assert.match(h.calls.errors[0][0],/Could not log out.*try again/);
                if(kind==='portal') {
                    assert.equal(h.context.currentSession.user.id,'member-a');
                    assert.equal(h.context.userEnrollmentsCache.length,1);
                    assert.equal(h.context.appliedJobIds.size,1);
                    assert.equal(h.calls.header.length,0);
                }
                await h.invoke();
                assert.equal(h.calls.signOut,2,'retry is enabled');
            } finally {h.dom.window.close();}
        });
    }
    test(kind+' original header prevents duplicate in-flight sign-out requests',async()=>{
        const h=harness(kind,'pending');
        try {
            const first=h.invoke();
            assert.equal(h.button.disabled,true);
            assert.equal(h.button.textContent,'Logging out…');
            await h.invoke();
            assert.equal(h.calls.signOut,1);
            h.release();await first;
            assert.equal(h.calls.cleared,1);
            assert.equal(h.button.disabled,false);
        } finally {h.dom.window.close();}
    });
}
