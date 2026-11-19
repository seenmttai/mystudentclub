(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.MSCCvBuilderMode = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const NORMAL = 'normal';
    const ARTICLESHIP = 'articleship';
    // The Articleship CV is the programme progress store's 'cv-builder' row (scripts/articleship-progress.js): this key on
    // the device, synced to the student's account. The normal CV is a plain JSON draft on this device.
    const DRAFT_KEYS = { normal: 'cv_maker_data', articleship: 'msc.articleship.cv-builder' };
    const HISTORY_KEYS = { normal: 'cv_maker_history_v1', articleship: 'msc_articleship_cv_maker_history_v1' };
    const DEFAULT_NORMAL_TEMPLATE = 'classic.html';

    // Only the exact ?stage=articleship query requests Articleship mode; anything else is normal.
    function resolve(search) {
        try {
            return new URLSearchParams(search || '').get('stage') === ARTICLESHIP ? ARTICLESHIP : NORMAL;
        } catch (_) {
            return NORMAL;
        }
    }

    function storageKey(mode) {
        return mode === ARTICLESHIP ? DRAFT_KEYS.articleship : DRAFT_KEYS.normal;
    }

    function historyKey(mode) {
        return mode === ARTICLESHIP ? HISTORY_KEYS.articleship : HISTORY_KEYS.normal;
    }

    // Returns a copy of the draft whose template belongs to the active mode's catalog. Ordinary fields are kept;
    // in normal mode Articleship presentation metadata (articleship* keys) is dropped.
    function normaliseDraft(mode, draft, catalogs) {
        const out = { ...(draft && typeof draft === 'object' ? draft : {}) };
        const lists = catalogs || {};
        if (mode === ARTICLESHIP) {
            const files = lists.articleship;
            if (Array.isArray(files) && files.length && !files.includes(out.templateFile)) {
                out.templateFile = lists.articleshipDefault || files[0];
            }
            return out;
        }
        Object.keys(out).forEach(key => { if (/^articleship/.test(key)) delete out[key]; });
        const files = lists.normal;
        if (!Array.isArray(files) || !files.includes(out.templateFile)) {
            out.templateFile = lists.normalDefault || DEFAULT_NORMAL_TEMPLATE;
        }
        return out;
    }

    return { NORMAL, ARTICLESHIP, resolve, storageKey, historyKey, normaliseDraft };
});
