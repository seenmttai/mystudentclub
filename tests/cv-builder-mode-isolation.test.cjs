const assert = require('node:assert/strict');
const test = require('node:test');
const mode = require('../cv-builder/cv-mode.js');

const catalogs = {
    normal: ['classic.html', 'ledger-layout.html'],
    normalDefault: 'classic.html',
    articleship: ['articleship-classic-academic', 'articleship-timeline'],
    articleshipDefault: 'articleship-classic-academic'
};

test('only the exact stage=articleship query requests Articleship mode', () => {
    assert.equal(mode.resolve(''), 'normal');
    assert.equal(mode.resolve('?stage=articleship'), 'articleship');
    assert.equal(mode.resolve('?foo=1&stage=articleship'), 'articleship');
    assert.equal(mode.resolve('?stage=anything-else'), 'normal');
    assert.equal(mode.resolve('?stage=Articleship'), 'normal');
    assert.equal(mode.resolve('?stage=articleship-x'), 'normal');
    assert.equal(mode.resolve('?stage='), 'normal');
    assert.equal(mode.resolve(undefined), 'normal');
    assert.equal(mode.resolve(null), 'normal');
});

test('each mode owns a separate draft and history key', () => {
    assert.equal(mode.storageKey('normal'), 'cv_maker_data');
    assert.equal(mode.storageKey('articleship'), 'msc.articleship.cv-builder', 'the programme progress store, synced to the account');
    assert.equal(mode.storageKey('bogus'), 'cv_maker_data');
    assert.equal(mode.historyKey('normal'), 'cv_maker_history_v1');
    assert.equal(mode.historyKey('articleship'), 'msc_articleship_cv_maker_history_v1');
    assert.notEqual(mode.historyKey('normal'), mode.historyKey('articleship'));
});

test('a legacy normal draft carrying an Articleship template opens on classic.html and keeps its fields', () => {
    const legacy = {
        templateFile: 'articleship-timeline',
        personal: { name: 'Asha', email: 'asha@example.com' },
        education: [{ degree: 'B.Com' }],
        skills: 'Excel',
        articleshipApplicant: true,
        articleshipExample: 'B',
        articleshipStarter: 'example:B',
        articleshipStructure: 'x'
    };
    const copy = JSON.parse(JSON.stringify(legacy));
    const out = mode.normaliseDraft('normal', legacy, catalogs);
    assert.equal(out.templateFile, 'classic.html');
    assert.deepEqual(out.personal, copy.personal);
    assert.deepEqual(out.education, copy.education);
    assert.equal(out.skills, 'Excel');
    assert.deepEqual(Object.keys(out).filter(k => /^articleship/.test(k)), []);
    assert.deepEqual(legacy, copy, 'input is not mutated');
});

test('unknown or missing template ids fall back to the active mode default', () => {
    assert.equal(mode.normaliseDraft('normal', { templateFile: 'nope.html' }, catalogs).templateFile, 'classic.html');
    assert.equal(mode.normaliseDraft('normal', {}, catalogs).templateFile, 'classic.html');
    assert.equal(mode.normaliseDraft('normal', { templateFile: 'ledger-layout.html' }, catalogs).templateFile, 'ledger-layout.html');
    assert.equal(mode.normaliseDraft('articleship', { templateFile: 'classic.html' }, catalogs).templateFile, 'articleship-classic-academic');
    assert.equal(mode.normaliseDraft('articleship', { templateFile: 'articleship-timeline' }, catalogs).templateFile, 'articleship-timeline');
});

test('Articleship metadata survives in Articleship mode and a missing draft stays empty-safe', () => {
    const draft = { templateFile: 'articleship-timeline', articleshipApplicant: true, personal: { name: 'A' } };
    const out = mode.normaliseDraft('articleship', draft, catalogs);
    assert.equal(out.articleshipApplicant, true);
    assert.deepEqual(mode.normaliseDraft('normal', null, catalogs), { templateFile: 'classic.html' });
});

test('an Articleship draft is left alone when its catalog is not loaded', () => {
    const draft = { templateFile: 'articleship-timeline', personal: { name: 'A' } };
    const out = mode.normaliseDraft('articleship', draft, { normal: catalogs.normal });
    assert.equal(out.templateFile, 'articleship-timeline');
});

const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'cv-builder', 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'cv-builder', 'cv-script.js'), 'utf8');

test('the normal Builder page has no Articleship markup, scripts or styles', () => {
    assert.doesNotMatch(html, /template-collection|setTemplateCollection/);
    assert.doesNotMatch(html, /stage\.js|stage\.css|cv-articleship\.js|articleship-progress|articleship-cv-builder|articleship-gate|articleship-tools/);
    assert.match(html, /<script src="cv-mode\.js[^"]*"><\/script>/);
    assert.ok(html.indexOf('cv-mode.js') < html.indexOf('cv-script.js'), 'the mode module loads before the Builder');
});

test('Articleship code is reachable only through the gate: loader -> bootArticleship -> onAllow', () => {
    const calls = script.match(/loadArticleshipFeature\(/g) || [];
    assert.equal(calls.length, 2, 'one definition and one call');
    assert.equal((script.match(/await loadArticleshipFeature\(\)/g) || []).length, 1);
    const boot = script.slice(script.indexOf('async function bootArticleship'), script.indexOf('async function startArticleshipRoute'));
    assert.match(boot, /await loadArticleshipFeature\(\)/);
    assert.equal((script.match(/onAllow: bootArticleship/g) || []).length, 1);
    assert.equal((script.match(/bootArticleship/g) || []).length, 3, 'definition, retry, onAllow, no other caller');
    // Normal mode starts the Builder directly and never touches the gate or the feature loader.
    assert.match(script, /if \(IS_ARTICLESHIP_MODE\) startArticleshipRoute\(\);\s*else startBuilder\(\);/);
    // Only Articleship mode starts the stage, with an explicit authorised host.
    assert.match(script, /if \(IS_ARTICLESHIP_MODE\) window\.MSCArticleshipStage\?\.init\?\.\(articleshipStageHost\(\)\)/);
    assert.match(script, /mode: CV_MODE,\s*access: 'allow'/);
});

test('drafts, history and reset are all mode-qualified', () => {
    assert.doesNotMatch(script, /'cv_maker_data'|'cv_maker_history_v1'/, 'no hard-coded key remains');
    assert.match(script, /const DRAFT_KEY = CV_MODE_API\.storageKey\(CV_MODE\)/);
    assert.match(script, /const HISTORY_KEY = CV_MODE_API\.historyKey\(CV_MODE\)/);
    assert.match(script, /localStorage\.removeItem\(DRAFT_KEY\)/);
});
