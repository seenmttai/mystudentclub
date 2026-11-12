/**
 * LMS Excel viewer helpers: a resource row whose only file is an Excel workbook opens in the in-page sheet viewer (the
 * same one the CSV previews use), with the Download button beside it. Shared by learning-management-system/course-script.js
 * and the tests. The workbook parser (SheetJS) is passed in, so this file stays small and testable.
 *
 * Browser: window.MSCExcelSheets. Node (tests): require('./scripts/excel-sheet-view.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCExcelSheets = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict';

    // A phone renders a table slowly; the first rows are the useful preview and Download has the rest.
    const MAX_ROWS = 3000;
    const MAX_COLS = 60;
    // Pinned. The workbooks are uploaded by MSC, never by students.
    const SHEETJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    // Reads the styles (colours, fonts, borders, merges, widths) for the Excel-look grid (scripts/excel-grid.js).
    const EXCELJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';

    function hasPath(value) {
        const text = String(value === undefined || value === null ? '' : value).trim();
        return Boolean(text) && text.toLowerCase() !== 'none' && text.toLowerCase() !== 'null';
    }

    function isExcelPath(value) {
        return /\.(xlsx|xls)$/i.test(String(value === undefined || value === null ? '' : value).trim());
    }

    /**
     * True for a row that has an Excel file to download and nothing to view: no link, no PDF or CSV preview. (Industrial
     * Excel tests already have a CSV preview; Google Sheets have a link. Neither is touched.)
     */
    function isExcelViewerRow(resource) {
        if (!resource || typeof resource !== 'object') return false;
        if (hasPath(resource.url) || hasPath(resource.view_storage_path)) return false;
        return isExcelPath(resource.download_storage_path);
    }

    /**
     * The sheets of a workbook as plain rows of text, as Excel shows them (dates and numbers formatted). Hidden and
     * empty sheets are left out. XLSX is the SheetJS object; data is an ArrayBuffer.
     * Returns [{ name, rows, total, truncated }].
     */
    function workbookToSheets(XLSX, data, options) {
        const opts = options || {};
        const maxRows = opts.maxRows || MAX_ROWS;
        const workbook = XLSX.read(data, { type: 'array' });
        const flags = (workbook.Workbook && workbook.Workbook.Sheets) || [];
        const sheets = [];
        (workbook.SheetNames || []).forEach((name, index) => {
            if (flags[index] && flags[index].Hidden) return;
            const raw = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false });
            const rows = raw
                .map(row => (Array.isArray(row) ? row : []).slice(0, MAX_COLS).map(cell => (cell === undefined || cell === null ? '' : String(cell))))
                .filter(row => row.some(cell => cell.trim() !== ''));
            if (!rows.length) return;
            sheets.push({ name: String(name), rows: rows.slice(0, maxRows), total: rows.length, truncated: rows.length > maxRows });
        });
        return sheets;
    }

    return Object.freeze({ MAX_ROWS, MAX_COLS, SHEETJS_URL, EXCELJS_URL, hasPath, isExcelPath, isExcelViewerRow, workbookToSheets });
});
