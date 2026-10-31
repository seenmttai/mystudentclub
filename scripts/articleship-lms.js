/**
 * MSC Articleship Program: how an LMS resource row opens (shared by learning-management-system/course-script.js and
 * lms-resources.html, so both pages route a row the same way).
 *
 * Row flag `copy` (V3-STRUCTURE §0.3, P6):
 *   copy: true | "reader"  → the flipbook reader in copy mode, /ca-resource/?copy=1 (the same protected reader as every
 *                            course: no text selection; Copy buttons on the template boxes, in-document links, search)
 *   copy: "browser"        → the fallback: the signed PDF in the browser's own viewer (risk 4). Switching every row to
 *                            the fallback is a data change (SQL), or one line here (COPY_DEFAULT), never a new page.
 * The flag is read before any group-name rule, and the old "group contains 'template' → inline canvas viewer" rule is
 * off for courses that set `templateCanvas: false` (the Articleship course).
 *
 * Browser: window.MSCArticleshipLms. Node (tests): require('./scripts/articleship-lms.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCArticleshipLms = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict';

    const COPY_READER_PATH = '/ca-resource/';
    const COPY_DEFAULT = 'reader';
    const STORAGE_PREFIX = /^articleship-program-v\d+\/day-[0-6]\//;
    const BUCKET_DEFAULT = 'industrial-training-mastery-resources';
    const BUCKET_ARTICLESHIP = 'articleship-program-resources';
    const BUCKET_PATH = /^articleship-program-v\d+\//;

    /**
     * The private storage bucket a resource path lives in. The Articleship Program has its own bucket, so its files are
     * never readable through the Industrial / Freshers storage rule; every other course keeps the shared bucket.
     */
    function bucketFor(path) {
        return BUCKET_PATH.test(String(path === undefined || path === null ? '' : path).trim()) ? BUCKET_ARTICLESHIP : BUCKET_DEFAULT;
    }

    function hasPath(value) {
        const text = String(value === undefined || value === null ? '' : value).trim();
        return Boolean(text) && text.toLowerCase() !== 'none' && text.toLowerCase() !== 'null';
    }

    /** 'reader' | 'browser' | null */
    function copyMode(resource) {
        if (!resource || !hasPath(resource.view_storage_path)) return null;
        if (!String(resource.view_storage_path).toLowerCase().endsWith('.pdf')) return null;
        const flag = resource.copy;
        if (flag === true || flag === 'true' || flag === 'reader') return COPY_DEFAULT;
        if (flag === 'browser') return 'browser';
        return null;
    }

    /** The legacy inline canvas viewer for "template" groups, unless the row is copyable or the course turned it off. */
    function useTemplateCanvas(resource, courseConfig) {
        if (!resource || copyMode(resource)) return false;
        if (courseConfig && courseConfig.templateCanvas === false) return false;
        return Boolean(resource.group && String(resource.group).toLowerCase().includes('template'));
    }

    function clampPage(value) {
        const page = Number(value);
        return Number.isSafeInteger(page) && page >= 1 && page <= 100000 ? page : 1;
    }

    function copyReaderUrl(signedUrl, options) {
        const opts = options || {};
        const params = new URLSearchParams();
        params.set('pdf', signedUrl);
        params.set('copy', '1');
        const page = clampPage(opts.page);
        if (page > 1) params.set('page', String(page));
        if (opts.title) params.set('title', String(opts.title).slice(0, 120));
        return COPY_READER_PATH + '?' + params.toString();
    }

    function browserViewerUrl(signedUrl, page) {
        const p = clampPage(page);
        return String(signedUrl).split('#')[0] + (p > 1 ? '#page=' + p : '');
    }

    /** Where the copy row opens, given a freshly signed URL for its view_storage_path. */
    function copyTarget(resource, signedUrl, page) {
        const mode = copyMode(resource);
        if (!mode) return null;
        return mode === 'browser'
            ? browserViewerUrl(signedUrl, page)
            : copyReaderUrl(signedUrl, { page, title: resource.title });
    }

    /** Deep links (?session=&resource=&page=) may open only programme PDFs, never an arbitrary path. */
    function isProgrammePdfPath(path) {
        const value = String(path || '');
        return STORAGE_PREFIX.test(value) && value.toLowerCase().endsWith('.pdf') && !value.includes('..');
    }

    function downloadLabel(resource) {
        if (!resource) return 'Download';
        if (resource.download_label) return String(resource.download_label);
        const path = String(resource.download_storage_path || '').toLowerCase();
        if (path.endsWith('.docx') || path.endsWith('.doc')) return 'Download Word';
        if (path.endsWith('.xlsx') || path.endsWith('.xls')) return 'Download Excel';
        if (path.endsWith('.pdf')) return 'Download PDF';
        if (path.endsWith('.csv')) return 'Download CSV';
        return 'Download';
    }

    /** Relative MSC paths (/articleship-program/…, /cv-builder/…) are tools on this site. */
    function isSameOriginToolUrl(url) {
        return /^\/(?!\/)/.test(String(url || ''));
    }

    /** A Google Sheet "/copy" link must reach Google untouched (it opens "Make a copy?"). */
    function isSheetCopyUrl(url) {
        return /docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]+\/copy\b/.test(String(url || ''));
    }

    /**
     * The link a tool puts on "Read" / "See it": opens the course at that Day's session and the named PDF at a page.
     * Sessions are one per Day: Day 0 is session 1 … Day 6 is session 7. The course page resolves the title against the
     * student's enrolled rows, so a wrong title just opens the Day.
     */
    function resourceLink(day, title, page) {
        const d = Number(day);
        if (!Number.isInteger(d) || d < 0 || d > 6) throw new Error('Day must be 0-6');
        const params = new URLSearchParams({ course: 'msc-articleship-program', session: String(d + 1) });
        if (title) params.set('resource', String(title));
        const p = clampPage(page);
        if (title && p > 1) params.set('page', String(p));
        return '/learning-management-system/course?' + params.toString();
    }

    return Object.freeze({
        COPY_READER_PATH, COPY_DEFAULT, STORAGE_PREFIX, BUCKET_DEFAULT, BUCKET_ARTICLESHIP, resourceLink,
        hasPath, copyMode, useTemplateCanvas, clampPage, copyReaderUrl, browserViewerUrl, copyTarget,
        isProgrammePdfPath, downloadLabel, isSameOriginToolUrl, isSheetCopyUrl, bucketFor
    });
});
