const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../workers/cv-pdf-worker/index.mjs'),'utf8').replace(/^import[^\n]+\n/,'').replace(/export \{[\s\S]*?\};?\s*$/,'');
const userId='01234567-1234-1234-1234-0123456789ab';
function harness(options={}) {
    const requests=[], pages=[];
    const page={async setViewport(){},async setRequestInterception(){},on(){},async goto(url){pages.push(url);},async waitForFunction(){},async evaluate(){},async pdf(){return new Uint8Array([37,80,68,70,45]);},async close(){}};
    const context=vm.createContext({
        Request,Response,URL,Blob,FormData,TextEncoder,console,Set,Uint8Array,
        setTimeout(){return 0;},
        puppeteer_cloudflare_default:{sessions:async()=>[],launch:async()=>({newPage:async()=>page,disconnect(){}})},
        fetch:async(url,init)=>{ requests.push({url,init});
            if(options.networkError)throw new Error('offline');
            if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify(options.user||{id:userId}),{status:options.authStatus||200});
            return new Response(JSON.stringify(options.courses?.map(course=>({course}))||[]),{status:options.enrollmentStatus||200});
        }
    });
    vm.runInContext(source+'\nthis.worker=worker;this.authorizeExport=authorizeExport;',context);
    function request(template,extras={},route='/pdf',token) {
        return new Request('https://cv-pdf-worker.example'+route,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({template,data:{personal:{name:'Example Candidate'}},filename:'resume.pdf',...extras})});
    }
    return {context,requests,pages,request};
}
test('every designated free template exports without a login or enrollment lookup',async()=>{
    for(const template of ['bold-modern.html','inset-frame.html','clean-rule.html']) {
        const h=harness();const response=await h.context.worker.fetch(h.request(template),{});
        assert.equal(response.status,200);assert.equal(response.headers.get('Content-Type'),'application/pdf');
        assert.equal(h.requests.length,0);assert.equal(h.pages[0],'https://www.mystudentclub.com/cv-builder/'+template);
    }
});
test('premium PDF and Word both reject anonymous export before rendering',async()=>{
    for(const route of ['/pdf','/docx']) {
        const h=harness();const response=await h.context.worker.fetch(h.request('classic.html',{},route),{FREECONVERT_API_KEY:'test'});
        assert.equal(response.status,403);assert.equal(h.pages.length,0);
    }
});
test('forged user metadata and a caller-supplied premium flag do not unlock a premium export',async()=>{
    const h=harness({user:{id:userId,user_metadata:{premium:true}},courses:[]});
    const response=await h.context.worker.fetch(h.request('classic.html',{isPremium:true,userId:'other'},'/pdf','token'),{});
    assert.equal(response.status,403);assert.equal(h.pages.length,0);
    assert.ok(h.requests[1].url.endsWith('uuid=eq.'+userId));
});
test('valid token and eligible server enrollment unlock premium export',async()=>{
    const h=harness({courses:['msc-ca-freshers-program']});
    const response=await h.context.worker.fetch(h.request('classic.html',{},'/pdf','verified-token'),{});
    assert.equal(response.status,200);assert.equal(h.pages.length,1);assert.equal(h.requests[1].init.headers.Authorization,'Bearer verified-token');
});
test('invalid tokens, revoked enrollment and verification outages fail closed',async()=>{
    for(const options of [{authStatus:401},{courses:[]},{courses:['unrelated-free-course']},{enrollmentStatus:500},{networkError:true}]) {
        const h=harness(options);const response=await h.context.worker.fetch(h.request('classic.html',{},'/pdf','token'),{});
        assert.ok([401,403,503].includes(response.status));assert.equal(h.pages.length,0);
    }
});
test('premium HTML cannot be exported by relabelling it as a free template',async()=>{
    const h=harness();const maliciousHtml='<html>premium custom design</html>';
    const result=await h.context.authorizeExport(h.request('bold-modern.html',{html:maliciousHtml}));
    assert.equal(result.html,undefined);
    const response=await h.context.worker.fetch(h.request('bold-modern.html',{html:maliciousHtml}),{});
    assert.equal(response.status,200);assert.equal(h.pages[0],'https://www.mystudentclub.com/cv-builder/bold-modern.html');
});
test('template traversal, unknown templates and legacy HTML-only exports are rejected',async()=>{
    for(const template of ['../admin.html','made-up.html',undefined]) {
        const h=harness();const response=await h.context.worker.fetch(h.request(template,{html:'<html>anything</html>'}),{});
        assert.equal(response.status,400);assert.equal(h.pages.length,0);
    }
});
test('frontend and server recognize the same canonical and legacy purchase slugs',async()=>{
    const context={window:{}};
    vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../scripts/program-access.js'),'utf8'),context);
    const aliases=Object.keys(context.window.MSCProgramAccess.COURSE_ALIASES);
    for(const course of [...aliases,' MSC-CA-FRESHERS-PROGRAM ','msc-articleship-program']) {
        const h=harness({courses:[course]});
        const response=await h.context.worker.fetch(h.request('classic.html',{},'/pdf','verified-token'),{});
        assert.equal(response.status,200,course);
    }
});
