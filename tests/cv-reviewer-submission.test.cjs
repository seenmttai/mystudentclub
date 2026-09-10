const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '../cv-reviewer/cv-reviewer.js'), 'utf8');

function sourceBetween(start, end) {
    const startIndex = source.indexOf(start);
    const endIndex = source.indexOf(end, startIndex);
    assert.ok(startIndex >= 0 && endIndex > startIndex, `Missing function region: ${start}`);
    return source.slice(startIndex, endIndex);
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

const flushPromises = () => new Promise(resolve => setImmediate(resolve));
const defaultButtonHtml = '<i class="fa-solid fa-arrow-right"></i> <span>Review</span>';
const modelResponse = '<<<OVERALL_SCORE>>>\nScore: 70.5/100\n<<<END_OVERALL_SCORE>>>';
const successResponse = () => ({ ok: true, json: async () => ({ ok: true, response: modelResponse }) });

function element(display = 'none') {
    const classes = new Set();
    return {
        style: { display },
        disabled: false,
        innerHTML: '',
        textContent: '',
        attributes: {},
        classList: {
            add(...names) { names.forEach(name => classes.add(name)); },
            remove(...names) { names.forEach(name => classes.delete(name)); },
            contains(name) { return classes.has(name); },
            toggle(name, force = !classes.has(name)) {
                if (force) classes.add(name);
                else classes.delete(name);
                return force;
            }
        },
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return this.attributes[name] ?? null; },
        removeAttribute(name) { delete this.attributes[name]; },
        addEventListener() {},
        scrollIntoView() { this.scrolled = true; }
    };
}

function makeHarness(options = {}) {
    const elements = Object.fromEntries([
        'landingSection', 'heroSection', 'uploadSection', 'loadingSection', 'tipsSection',
        'resultsSection', 'proceedToReviewBtn', 'removeFileBtn', 'reviewBuyTitle', 'loadingProgressText'
    ].map(id => [id, element(['landingSection', 'heroSection', 'uploadSection'].includes(id) ? 'block' : 'none')]));
    elements.proceedToReviewBtn.innerHTML = defaultButtonHtml;
    const calls = { auth: 0, quota: 0, fetch: [], saved: [], login: 0, buy: 0, notices: [], alerts: [], contexts: [], starts: 0, stops: 0, increments: 0 };
    const stored = new Map();
    const pdf = { name: 'resume.pdf' };
    const images = ['data:image/png;base64,test-resume'];
    const context = vm.createContext({
        ...elements,
        document: { getElementById: id => elements[id] || null },
        window: { location: { origin: 'https://www.mystudentclub.com' } },
        selectedFile: pdf,
        pdfImages: images,
        analysisResultText: null,
        activeReviewFileName: null,
        authUser: options.guest ? null : { id: 'test-user' },
        isPremiumEnrolled: options.premium ?? true,
        IP_REVIEW_LIMIT: 1,
        FREE_USER_LIFETIME_LIMIT: 3,
        ACTIVE_REVIEW_KEY: 'test-active-review',
        async refreshAuthUser() {
            calls.auth += 1;
            return options.auth?.(calls.auth);
        },
        updateAuthUI() {},
        getIpReviewCount: () => options.ipCount ?? 0,
        async getFreeUserLifetimeCount() {
            calls.quota += 1;
            return options.quota ? options.quota(calls.quota) : 0;
        },
        openReviewLoginModal() { calls.login += 1; },
        openReviewBuyModal() { calls.buy += 1; },
        hideResults() { elements.resultsSection.style.display = 'none'; },
        showResults() { elements.resultsSection.style.display = 'block'; },
        startLoadingAnimation() { calls.starts += 1; },
        stopLoadingAnimation() { calls.stops += 1; },
        clearResultsContent() {},
        async fetch(url, request) {
            calls.fetch.push({ url, request });
            return options.fetch ? options.fetch(calls.fetch.length) : successResponse();
        },
        processStructuredResults: () => 70.5,
        applyRoleLocks() {},
        async saveReview(text) {
            calls.saved.push(text);
            return options.save ? options.save(calls.saved.length) : 'saved-review';
        },
        localStorage: {
            setItem: (key, value) => stored.set(key, value),
            removeItem: key => stored.delete(key)
        },
        incrementIpReviewCount() { calls.increments += 1; },
        updateReviewsRemainingBanner() {},
        showNoticeModal(...args) { calls.notices.push(args); },
        showContextWarningModal(message) { calls.contexts.push(message); },
        alert(message) { calls.alerts.push(message); },
        resetUpload() {
            context.selectedFile = null;
            context.pdfImages = [];
            elements.proceedToReviewBtn.disabled = true;
        },
        console: { warn() {}, error() {} }
    });
    const inProgressState = source.match(/^let isAnalysisInProgress\s*=\s*false;/m);
    assert.ok(inProgressState, 'Submission must have a shared in-progress state');
    vm.runInContext([
        inProgressState[0],
        sourceBetween("proceedToReviewBtn.addEventListener('click', analyzeCv);", '// Shows a clear indicator of free reviews available'),
        sourceBetween('function resetToUploadStageOnError(', 'function fixInlineCodeMarkdown(')
    ].join('\n'), context);
    return { context, elements, calls, stored, pdf, images, options };
}

function assertBusy(harness) {
    const { elements } = harness;
    assert.equal(elements.proceedToReviewBtn.disabled, true);
    assert.equal(elements.proceedToReviewBtn.getAttribute('aria-busy'), 'true');
    assert.notEqual(elements.proceedToReviewBtn.innerHTML, defaultButtonHtml);
    assert.equal(elements.removeFileBtn.disabled, true);
    assert.equal(elements.landingSection.style.display, 'none');
    assert.equal(elements.loadingSection.style.display, 'block');
}

function assertReady(harness) {
    const { elements } = harness;
    assert.equal(elements.proceedToReviewBtn.disabled, false);
    assert.notEqual(elements.proceedToReviewBtn.getAttribute('aria-busy'), 'true');
    assert.equal(elements.proceedToReviewBtn.innerHTML, defaultButtonHtml);
    assert.equal(elements.removeFileBtn.disabled, false);
    assert.equal(elements.loadingSection.style.display, 'none');
}

async function repeatClicks(harness) {
    await Promise.all(Array.from({ length: 5 }, () => harness.context.analyzeCv()));
}

test('shows loading immediately and ignores repeated clicks throughout auth, quota, request and save', async () => {
    const auth = deferred();
    const quota = deferred();
    const network = deferred();
    const save = deferred();
    const harness = makeHarness({
        premium: false,
        auth: call => call === 1 ? auth.promise : undefined,
        quota: () => quota.promise,
        fetch: () => network.promise,
        save: () => save.promise
    });
    const { context, calls, elements, stored } = harness;
    const pending = context.analyzeCv();

    // No promise has resolved yet: the first click must already have visible feedback.
    assertBusy(harness);
    assert.equal(elements.loadingSection.scrolled, true);
    assert.equal(calls.starts, 1);
    await repeatClicks(harness);
    assert.equal(calls.auth, 1);
    assert.equal(calls.fetch.length, 0);

    auth.resolve();
    await flushPromises();
    await repeatClicks(harness);
    assertBusy(harness);
    assert.equal(calls.quota, 1);
    assert.equal(calls.fetch.length, 0);

    quota.resolve(0);
    await flushPromises();
    await repeatClicks(harness);
    assertBusy(harness);
    assert.equal(calls.fetch.length, 1);
    assert.equal(calls.saved.length, 0);
    assert.deepEqual(JSON.parse(calls.fetch[0].request.body), { images: harness.images, isPremium: false });

    network.resolve(successResponse());
    await flushPromises();
    await repeatClicks(harness);
    assertBusy(harness);
    assert.equal(calls.fetch.length, 1);
    assert.equal(calls.saved.length, 1);
    assert.equal(elements.resultsSection.style.display, 'none');

    save.resolve('saved-review');
    await pending;
    assertReady(harness);
    assert.equal(elements.resultsSection.style.display, 'block');
    assert.equal(stored.get('test-active-review'), 'saved-review');
    assert.deepEqual(calls.saved, [modelResponse]);
    assert.equal(calls.notices.length, 0);

    // Finishing the previous submission must not permanently lock future reviews.
    await context.analyzeCv();
    assert.equal(calls.fetch.length, 2);
    assert.equal(calls.saved.length, 2);
    assertReady(harness);
});

for (const gate of ['login', 'enrollment']) {
    test(`${gate} limit restores the uploaded PDF and permits a later eligible review`, async () => {
        const options = gate === 'login' ? { guest: true, ipCount: 1 } : { premium: false, quota: () => 3 };
        const harness = makeHarness(options);
        const { context, calls, elements, pdf, images } = harness;
        await context.analyzeCv();

        assert.equal(calls[gate === 'login' ? 'login' : 'buy'], 1);
        assert.equal(calls.fetch.length, 0);
        assert.equal(calls.saved.length, 0);
        assert.equal(context.selectedFile, pdf);
        assert.equal(context.pdfImages, images);
        assert.equal(elements.landingSection.style.display, 'block');
        assert.equal(elements.uploadSection.style.display, 'block');
        assertReady(harness);

        context.authUser = { id: 'eligible-user' };
        context.isPremiumEnrolled = true;
        await context.analyzeCv();
        assert.equal(calls.fetch.length, 1);
        assert.equal(calls.saved.length, 1);
        assertReady(harness);
    });
}

for (const stage of ['auth', 'fetch', 'save']) {
    test(`${stage} failure clears busy state and allows a successful retry`, async () => {
        const options = {
            [stage]: call => {
                if (call === 1) throw new Error(`${stage} failed`);
                if (stage === 'fetch') return successResponse();
                if (stage === 'save') return 'saved-review';
            }
        };
        const harness = makeHarness(options);
        const { context, calls, elements } = harness;
        await context.analyzeCv();
        assert.equal(calls.notices.length, 1);
        assert.match(calls.notices[0][1], new RegExp(`${stage} failed`));
        assert.equal(elements.loadingSection.style.display, 'none');
        assert.equal(elements.landingSection.style.display, 'block');
        assert.notEqual(elements.proceedToReviewBtn.getAttribute('aria-busy'), 'true');
        assert.equal(elements.proceedToReviewBtn.innerHTML, defaultButtonHtml);

        // Existing error handling may require re-upload; verify a valid retry works.
        context.selectedFile = harness.pdf;
        context.pdfImages = harness.images;
        elements.proceedToReviewBtn.disabled = false;
        options[stage] = stage === 'fetch' ? successResponse : undefined;
        const previousRequests = calls.fetch.length;
        const previousSaves = calls.saved.length;
        await context.analyzeCv();
        assert.equal(calls.fetch.length, previousRequests + 1);
        assert.equal(calls.saved.length, previousSaves + 1);
        assert.equal(elements.resultsSection.style.display, 'block');
        assertReady(harness);
    });
}

test('missing file or unfinished PDF processing does not start a request or leave a lock', async () => {
    const harness = makeHarness();
    const { context, calls } = harness;
    context.selectedFile = null;
    await context.analyzeCv();
    context.selectedFile = harness.pdf;
    context.pdfImages = [];
    await context.analyzeCv();
    assert.equal(calls.alerts.length, 2);
    assert.equal(calls.auth, 0);
    assert.equal(calls.fetch.length, 0);
    assert.equal(calls.starts, 0);
    assertReady(harness);

    context.pdfImages = harness.images;
    await context.analyzeCv();
    assert.equal(calls.fetch.length, 1);
    assert.equal(calls.saved.length, 1);
    assertReady(harness);
});

test('an out-of-context response releases submission controls without saving a review', async () => {
    const harness = makeHarness({
        fetch: () => ({ ok: true, json: async () => ({ ok: true, response: '<<<OUT_OF_CONTEXT>>>Please upload a finance resume.' }) })
    });
    const { context, calls } = harness;
    await context.analyzeCv();
    assert.deepEqual(calls.contexts, ['Please upload a finance resume.']);
    assert.equal(calls.saved.length, 0);
    assertReady(harness);

    harness.options.fetch = successResponse;
    await context.analyzeCv();
    assert.equal(calls.fetch.length, 2);
    assert.equal(calls.saved.length, 1);
    assertReady(harness);
});

test('upload replacement, reset and history actions preserve the in-flight review', async () => {
    const auth = deferred();
    const harness = makeHarness({ auth: call => call === 1 ? auth.promise : undefined });
    const { context, elements, calls, stored } = harness;
    vm.runInContext([
        sourceBetween('function startNewAnalysis(', 'function setupCopyListeners('),
        sourceBetween('function resetToUploadStage() {', "downloadReportBtn.addEventListener('click'"),
        sourceBetween('async function handleFile(', 'function formatFileSize('),
        sourceBetween('function loadReviewIntoView(', 'function setupUserId('),
        sourceBetween('async function showHistoryView(', '// Sync mobile menu CTA buttons')
    ].join('\n'), context);
    const pending = context.analyzeCv();
    context.startNewAnalysis();
    context.resetToUploadStage();
    await context.handleFile({ name: 'different-resume.pdf', type: 'application/pdf' });
    context.loadReviewIntoView({ id: 'past-review', file_name: 'past.pdf', review_data: { review: 'Old review' } });
    await context.showHistoryView();

    assert.equal(context.selectedFile, harness.pdf);
    assert.equal(context.pdfImages, harness.images);
    assert.equal(context.analysisResultText, null);
    assert.equal(elements.resultsSection.style.display, 'none');
    assert.equal(stored.size, 0);
    assertBusy(harness);

    auth.resolve();
    await pending;
    assert.equal(calls.fetch.length, 1);
    assert.equal(calls.saved.length, 1);
    assert.equal(context.activeReviewFileName, harness.pdf.name);
    assert.equal(stored.get('test-active-review'), 'saved-review');
    assertReady(harness);
});

test('closing an inactive context warning does not reset the upload', () => {
    const { context, elements } = makeHarness();
    elements.contextWarningOverlay = element();
    let resets = 0;
    context.resetToUploadStage = () => { resets += 1; };
    vm.runInContext(sourceBetween('function closeContextWarningModal(', 'function showNoticeModal('), context);

    // The global Escape handler invokes this even when another modal is being closed.
    context.closeContextWarningModal();
    assert.equal(resets, 0);

    elements.contextWarningOverlay.classList.add('active');
    context.closeContextWarningModal();
    assert.equal(resets, 1);
    assert.equal(elements.contextWarningOverlay.classList.contains('active'), false);
});
