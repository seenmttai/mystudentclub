const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { JSDOM, requestInterceptor } = require('jsdom');

// Boots the real Builder page (index.html, cv-mode.js, cv-script.js) in jsdom with the CDN libraries stubbed, serving
// local files only, and records every request the page makes.
const root = path.join(__dirname, '..');
const pageHtml = fs.readFileSync(path.join(root, 'cv-builder/index.html'), 'utf8')
    .replace(/<script[^>]*src="https?:[^>]*><\/script>/g, '')
    .replace(/<link[^>]*href="https?:[^>]*>/g, '')
    .replace(/<script type="module">[\s\S]*?<\/script>/, '');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const FEATURE = /cv-articleship\.js|articleship-progress\.js|articleship-cv-builder\.js|cv-builder\/stage\.(js|css)|designs\.json|examples\.json|situations\.json/;

function quillStub() {
    return function () {
        return {
            on() {}, root: { innerHTML: '' }, clipboard: { dangerouslyPasteHTML() {} }, getSelection: () => null, setSelection() {},
            getText: () => '', setContents() {}, format() {}, getFormat: () => ({}), focus() {}, history: { clear() {} }, getLength: () => 0,
            getModule: () => ({ addHandler() {} }), enable() {}, blur() {}, setText() {}, deleteText() {}, formatText() {},
            getBounds: () => ({ top: 0, left: 0, height: 0, width: 0 }), container: { querySelector: () => null }
        };
    };
}

async function boot(search, { user = null, courses = [], storage = {}, remote = {}, wait = 1500 } = {}) {
    const requested = [];
    const pushes = [];
    const interceptor = requestInterceptor(request => {
        const p = new URL(request.url).pathname;
        requested.push(p);
        // The real site client library is replaced by a stub factory; the real supabase-init.js still runs on top of it.
        if (p === '/scripts/supabase.js') {
            return new Response('window.supabase = { createClient: () => window.__stubClient };', { headers: { 'Content-Type': 'application/javascript' } });
        }
        const file = path.join(root, decodeURIComponent(p));
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            const type = /\.css$/.test(p) ? 'text/css' : /\.js$/.test(p) ? 'application/javascript' : 'text/html';
            return new Response(fs.readFileSync(file), { headers: { 'Content-Type': type } });
        }
        return new Response('not found', { status: 404 });
    });
    const dom = new JSDOM(pageHtml, {
        url: 'https://www.mystudentclub.com/cv-builder/' + search,
        runScripts: 'dangerously',
        resources: { interceptors: [interceptor] },
        pretendToBeVisual: true,
        virtualConsole: new (require('jsdom').VirtualConsole)(),
        beforeParse(window) {
            Object.entries(storage).forEach(([key, value]) => window.localStorage.setItem(key, value));
            window.Quill = quillStub();
            window.Quill.import = () => function () {};
            window.Quill.register = () => {};
            window.pdfjsLib = { GlobalWorkerOptions: {} };
            window.driver = { js: { driver: () => ({ drive() {}, destroy() {} }) } };
            window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
            window.scrollTo = () => {};
            window.fetch = target => {
                requested.push(new URL(target, 'https://www.mystudentclub.com/').pathname);
                return Promise.resolve({ ok: false, json: async () => null, text: async () => '' });
            };
            // The account: the enrolment rows the gate reads and the programme's progress rows (one per tool).
            const progressTable = {
                select() { return this; },
                eq(column, tool) { return { maybeSingle: async () => ({ data: remote[tool] || null, error: null }) }; },
                upsert(row) {
                    pushes.push(JSON.parse(JSON.stringify(row)));
                    return { select: () => ({ single: async () => ({ data: { updated_at: new Date().toISOString() }, error: null }) }) };
                }
            };
            window.__stubClient = {
                auth: { onAuthStateChange() {}, getUser: async () => ({ data: { user }, error: null }), getSession: async () => ({ data: { session: user ? { user } : null } }) },
                from: table => (table === 'articleship_tool_progress' ? progressTable
                    : { select() { return this; }, eq: async () => ({ data: courses.map(course => ({ course })), error: null }) })
            };
        }
    });
    await sleep(wait);
    const { window } = dom;
    const doc = window.document;
    const result = {
        window,
        requested,
        featureRequests: requested.filter(p => FEATURE.test(p)),
        gate: doc.getElementById('ap-gate')?.dataset.state || null,
        gating: doc.documentElement.classList.contains('cv-gating'),
        articleshipBody: doc.body.classList.contains('asb-on') || doc.body.classList.contains('articleship-mode'),
        options: Array.from(doc.getElementById('template-select').options).map(option => option.value),
        read: key => window.localStorage.getItem(key),
        // The Articleship CV as the progress store keeps it on this device.
        articleshipCv() {
            const envelope = JSON.parse(window.localStorage.getItem(ART_KEY) || 'null');
            return envelope && envelope.data ? envelope.data.cv : null;
        },
        pushes,
        nameField: () => doc.getElementById('inp-name')?.value,
        close: () => window.close()
    };
    return result;
}

const ART_KEY = 'msc.articleship.cv-builder';

const LEGACY = JSON.stringify({
    templateFile: 'articleship-layout-classic',
    personal: { name: 'Asha', email: 'asha@example.com' },
    education: [{ degree: 'B.Com', institution: 'Mumbai University' }],
    certifications: [{ name: 'Excel Expert', issuer: '' }],
    articleshipApplicant: true,
    articleshipStarter: 'blank'
});

test('normal route: no Articleship request, gate, option or state; Classic default', async () => {
    const page = await boot('');
    assert.deepEqual(page.featureRequests, []);
    assert.equal(page.gate, null);
    assert.equal(page.gating, false);
    assert.equal(page.articleshipBody, false);
    assert.equal(page.options.filter(file => file.startsWith('articleship-')).length, 0);
    assert.ok(page.options.includes('classic.html'));
    assert.ok(!page.requested.some(p => /articleship-gate|articleship-tools|supabase/.test(p)), 'no gate or site-client assets either');
    assert.equal(page.read(ART_KEY), null);
    assert.equal(page.read('msc_articleship_cv_maker_history_v1'), null);
    page.close();
});

test('an unknown stage value is the normal Builder', async () => {
    for (const search of ['?stage=articleship-x', '?stage=Articleship', '?stage=foo']) {
        const page = await boot(search, { wait: 600 });
        assert.deepEqual(page.featureRequests, [], search);
        assert.equal(page.gate, null, search);
        assert.equal(page.articleshipBody, false, search);
        page.close();
    }
});

test('a legacy normal draft with an Articleship template opens normally, keeps its fields and leaks no Articleship state', async () => {
    const page = await boot('', { storage: { cv_maker_data: LEGACY } });
    assert.deepEqual(page.featureRequests, []);
    const saved = JSON.parse(page.read('cv_maker_data'));
    assert.equal(saved.templateFile, 'classic.html');
    assert.equal(saved.personal.name, 'Asha');
    assert.equal(saved.personal.email, 'asha@example.com');
    assert.equal(saved.education[0].degree, 'B.Com');
    assert.deepEqual(saved.certifications, [{ name: 'Excel Expert', issuer: '' }]);
    assert.deepEqual(Object.keys(saved).filter(key => /^articleship/.test(key)), []);
    assert.equal(page.read(ART_KEY), null);
    page.close();
});

test('Articleship route, logged out: login modal, page hidden, no Articleship code or data requested, no draft touched', async () => {
    const page = await boot('?stage=articleship', { storage: { cv_maker_data: LEGACY } });
    assert.equal(page.gate, 'login', 'a real answer from the site client, not a retry card');
    assert.equal(page.gating, true);
    assert.deepEqual(page.featureRequests, []);
    assert.equal(page.articleshipBody, false);
    assert.equal(page.read('cv_maker_data'), LEGACY, 'the normal draft is untouched');
    assert.equal(page.read(ART_KEY), null);
    page.close();
});

test('Articleship route, signed in but not enrolled: enrolment modal, nothing loaded, nothing saved', async () => {
    const page = await boot('?stage=articleship', { user: { id: 'u2' }, courses: ['industrial-training-mastery'], storage: { cv_maker_data: LEGACY } });
    assert.equal(page.gate, 'enrol');
    assert.equal(page.gating, true);
    assert.deepEqual(page.featureRequests, []);
    assert.equal(page.read('cv_maker_data'), LEGACY);
    assert.equal(page.read(ART_KEY), null);
    assert.deepEqual(page.pushes, [], 'nothing reaches the account');
    const labels = Array.from(page.window.document.querySelectorAll('#ap-gate a, #ap-gate button')).map(node => node.textContent);
    assert.deepEqual(labels, ['Enroll in Articleship to unlock', 'Log in with another account']);
    page.close();
});

test('a recent local gate cache does not open the Articleship route before the server confirms', async () => {
    const page = await boot('?stage=articleship', {
        user: { id: 'u2' }, courses: ['industrial-training-mastery'],
        storage: { 'msc.articleship.gate': JSON.stringify({ user: 'u2', at: Date.now() }), 'sb-auth-auth-token': JSON.stringify({ user: { id: 'u2' } }) }
    });
    assert.equal(page.gate, 'enrol');
    assert.deepEqual(page.featureRequests, []);
    page.close();
});

test('Articleship route, enrolled: loads the feature after access, uses only its own draft and leaves the normal draft alone', async () => {
    const page = await boot('?stage=articleship', { user: { id: 'u1' }, courses: ['msc-articleship-program'], storage: { cv_maker_data: LEGACY }, wait: 2600 });
    assert.equal(page.gate, null);
    assert.equal(page.gating, false);
    assert.equal(page.articleshipBody, true);
    const loaded = page.featureRequests.map(p => path.basename(p));
    ['cv-articleship.js', 'articleship-progress.js', 'articleship-cv-builder.js', 'stage.js', 'designs.json', 'examples.json'].forEach(name => assert.ok(loaded.includes(name), name));
    assert.ok(page.options.length > 0 && page.options.every(file => file.startsWith('articleship-')), 'only the Articleship catalog is offered');
    assert.equal(page.read('cv_maker_data'), LEGACY, 'the normal draft is byte-identical');
    const own = page.articleshipCv();
    assert.match(own.templateFile, /^articleship-/);
    assert.equal(page.read('cv_maker_history_v1'), null);
    // The Articleship CV is saved to the student's account too; the normal CV never is.
    const saved = page.pushes.filter(row => row.tool === 'cv-builder');
    assert.ok(saved.length >= 1, 'pushed to the account');
    assert.match(saved.at(-1).data.cv.templateFile, /^articleship-/);
    assert.ok(!JSON.stringify(page.pushes).includes('Asha'), 'the normal CV stays on this device');
    page.close();
});

test('Articleship route on a new device: the CV saved in the account opens, not an empty one', async () => {
    const laptop = { templateFile: 'articleship-layout-classic', personal: { name: 'Meera From Laptop', email: 'meera@example.com' }, articleshipApplicant: true };
    const page = await boot('?stage=articleship', {
        user: { id: 'u1' }, courses: ['msc-articleship-program'],
        remote: { 'cv-builder': { data: { cv: laptop }, updated_at: '2026-10-28T09:00:00.000Z' } },
        wait: 2600
    });
    assert.equal(page.articleshipCv().personal.name, 'Meera From Laptop');
    assert.equal(page.nameField(), 'Meera From Laptop', 'shown in the editor');
    page.close();
});

test('a shared browser: another student\'s Articleship CV is never shown or saved to this account', async () => {
    const riya = JSON.stringify({ v: 1, data: { cv: { templateFile: 'articleship-layout-classic', personal: { name: 'Riya Previous' } } }, updatedAt: 1, syncedAt: 1, dirty: false, owner: 'riya' });
    const page = await boot('?stage=articleship', { user: { id: 'u1' }, courses: ['msc-articleship-program'], storage: { [ART_KEY]: riya }, wait: 2600 });
    assert.notEqual(page.nameField(), 'Riya Previous');
    assert.notEqual((page.articleshipCv() || {}).personal?.name, 'Riya Previous');
    assert.ok(!JSON.stringify(page.pushes).includes('Riya Previous'));
    page.close();
});

test('enrolled Articleship draft survives a normal visit untouched', async () => {
    const own = JSON.stringify({ v: 1, data: { cv: { templateFile: 'articleship-layout-classic', personal: { name: 'Meera' }, articleshipApplicant: true } }, updatedAt: 1, syncedAt: 1, dirty: false, owner: 'u1' });
    const page = await boot('', { storage: { [ART_KEY]: own } });
    assert.deepEqual(page.featureRequests, []);
    assert.equal(page.read(ART_KEY), own, 'an Articleship draft is neither read nor rewritten by normal mode');
    assert.notEqual(JSON.parse(page.read('cv_maker_data') || '{}').personal?.name, 'Meera');
    page.close();
});
