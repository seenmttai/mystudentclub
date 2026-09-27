const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../scripts/program-access.js'), 'utf8');
function api() { const window = {}; vm.runInNewContext(source, {window}); return window.MSCProgramAccess; }
function client({user = {id:'account-one'}, courses = [], authError, enrollmentError} = {}) {
    return {auth:{getUser:async()=>({data:{user},error:authError})},from:table=>{
        assert.equal(table,'enrollment');
        return {select:column=>{assert.equal(column,'course');return {eq:async(column,id)=>{
            assert.equal(column,'uuid');assert.equal(id,user.id);
            return {data:courses.map(course=>({course})),error:enrollmentError};
        }}}};
    }};
}
test('only named free templates are exportable without program enrollment',()=>{
    assert.deepEqual(Array.from(api().FREE_TEMPLATES), ['bold-modern.html','inset-frame.html','clean-rule.html']);
});
test('verified program enrollments grant access; unknown course rows do not',async()=>{
    for (const course of ['industrial-training-mastery','msc-ca-freshers-program','msc-ca-articleship-program','articleship-program']) assert.equal((await api().getAccess(client({courses:[course]}))).hasAccess,true);
    assert.equal((await api().getAccess(client({courses:['free-course']}))).hasAccess,false);
});
test('metadata premium flags and auth failures never grant export access',async()=>{
    const access = await api().getAccess(client({user:{id:'account-one',user_metadata:{premium:true,course:'industrial-training-mastery'}}}));
    assert.equal(access.hasAccess,false);
    const failure = await api().getAccess(client({courses:['industrial-training-mastery'],authError:new Error('invalid token')}));
    assert.equal(failure.hasAccess,false);assert.ok(failure.error);
});
test('no session is free; enrollment outages and account switches do not reuse paid status',async()=>{
    const shared=api();
    assert.equal((await shared.getAccess(client({user:null}))).hasAccess,false);
    assert.equal((await shared.getAccess(client({courses:['industrial-training-mastery']}))).hasAccess,true);
    assert.equal((await shared.getAccess(client({user:{id:'account-two'}}))).hasAccess,false);
    const failure=await shared.getAccess(client({enrollmentError:new Error('offline')}));
    assert.equal(failure.hasAccess,false);assert.ok(failure.error);
});
