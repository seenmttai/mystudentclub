/**
 * Excel-look grid for the LMS sheet viewer: column letters, row numbers, gridlines, and each cell's own colours, font,
 * borders, alignment, merges, column widths, row heights and frozen panes. Read-only.
 *
 * Two readers feed it, so each does what it is best at:
 *   - SheetJS gives the text exactly as Excel shows it (dates, percentages, thousands separators);
 *   - ExcelJS gives the styles.
 * The libraries are passed in; this file only builds a model and draws it. If either reader fails, the caller falls back to
 * the plain table (scripts/excel-sheet-view.js).
 *
 * Browser: window.MSCExcelGrid. Node (tests): require('./scripts/excel-grid.js').
 */
(function (root, factory) {
    'use strict';
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.MSCExcelGrid = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
    'use strict';

    const MAX_ROWS = 3000;
    const MAX_COLS = 60;
    // A phone draws about this many cells before it stalls; Download has the rest.
    const MAX_CELLS = 60000;
    const DEFAULT_COL_PX = 64;
    const DEFAULT_ROW_PX = 20;
    const ROW_HEADER_PX = 46;
    const COL_HEADER_PX = 22;
    const PT_TO_PX = 96 / 72;
    // Office theme colours, in Excel's theme-index order (light 1, dark 1, light 2, dark 2, accents 1-6, links).
    const THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];

    function colName(number) {
        let n = number;
        let name = '';
        while (n > 0) {
            const rest = (n - 1) % 26;
            name = String.fromCharCode(65 + rest) + name;
            n = Math.floor((n - 1) / 26);
        }
        return name;
    }

    function clamp(value, low, high) {
        return Math.max(low, Math.min(high, value));
    }

    function hex(n) {
        return clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0');
    }

    function tinted(rgb, tint) {
        const amount = Number(tint) || 0;
        if (!amount) return rgb;
        const parts = [0, 2, 4].map(i => parseInt(rgb.slice(i, i + 2), 16));
        const out = parts.map(c => (amount > 0 ? c + (255 - c) * amount : c * (1 + amount)));
        return out.map(hex).join('');
    }

    /** An ExcelJS colour ({ argb } or { theme, tint }) as a CSS colour, or '' when it has none. */
    function cssColor(color) {
        if (!color || typeof color !== 'object') return '';
        if (typeof color.argb === 'string' && /^[0-9a-f]{6,8}$/i.test(color.argb)) {
            const rgb = color.argb.slice(-6);
            const alpha = color.argb.length === 8 ? parseInt(color.argb.slice(0, 2), 16) : 255;
            return alpha === 0 ? '' : '#' + rgb.toLowerCase();
        }
        if (Number.isInteger(color.theme) && color.theme >= 0 && color.theme < THEME.length) {
            return '#' + tinted(THEME[color.theme], color.tint).toLowerCase();
        }
        return '';
    }

    const BORDER_STYLE = {
        thin: '1px solid', hair: '1px solid', medium: '2px solid', thick: '3px solid', double: '3px double',
        dotted: '1px dotted', dashed: '1px dashed', mediumDashed: '2px dashed', dashDot: '1px dashed', dashDotDot: '1px dashed',
        mediumDashDot: '2px dashed', mediumDashDotDot: '2px dashed', slantDashDot: '2px dashed'
    };

    function borderCss(side) {
        if (!side || !side.style || !BORDER_STYLE[side.style]) return '';
        return BORDER_STYLE[side.style] + ' ' + (cssColor(side.color) || '#000000');
    }

    function isNumberLike(value) {
        if (typeof value === 'number' || value instanceof Date) return true;
        if (value && typeof value === 'object' && 'result' in value) return isNumberLike(value.result);
        return false;
    }

    function isCentered(value) {
        if (typeof value === 'boolean') return true;
        if (value && typeof value === 'object') {
            if ('error' in value) return true;
            if ('result' in value) return isCentered(value.result);
        }
        return false;
    }

    function safeLink(url) {
        const text = String(url || '').trim();
        return /^(https?:\/\/|mailto:)/i.test(text) ? text : '';
    }

    /** The link of a cell ({ text, hyperlink } values, or the cell's hyperlink), only for web and mail addresses. */
    function linkOf(cell) {
        const value = cell.value;
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (value.hyperlink) return safeLink(value.hyperlink);
        }
        return safeLink(cell.hyperlink);
    }

    /** The CSS of one cell, from its ExcelJS style and value. Plain data: { css: 'a:b;...' }. */
    function cellCss(cell) {
        const rules = [];
        const font = cell.font || {};
        const fill = cell.fill || {};
        const align = cell.alignment || {};
        const border = cell.border || {};
        if (font.bold) rules.push('font-weight:700');
        if (font.italic) rules.push('font-style:italic');
        const decorations = [font.underline ? 'underline' : '', font.strike ? 'line-through' : ''].filter(Boolean);
        if (decorations.length) rules.push('text-decoration:' + decorations.join(' '));
        if (font.size) rules.push('font-size:' + (Math.round(font.size * PT_TO_PX * 10) / 10) + 'px');
        const color = cssColor(font.color);
        if (color) rules.push('color:' + color);
        if (fill.type === 'pattern' && fill.pattern === 'solid') {
            const bg = cssColor(fill.fgColor);
            if (bg) rules.push('background-color:' + bg);
        }
        const horizontal = align.horizontal && align.horizontal !== 'general' ? align.horizontal
            : isNumberLike(cell.value) ? 'right' : isCentered(cell.value) ? 'center' : 'left';
        rules.push('text-align:' + (horizontal === 'centerContinuous' ? 'center' : horizontal === 'fill' || horizontal === 'distributed' || horizontal === 'justify' ? 'left' : horizontal));
        const vertical = align.vertical === 'top' ? 'top' : align.vertical === 'middle' || align.vertical === 'center' ? 'middle' : 'bottom';
        rules.push('vertical-align:' + vertical);
        if (align.wrapText) rules.push('white-space:pre-wrap', 'word-break:break-word');
        if (align.indent) rules.push('padding-left:' + (4 + 8 * clamp(Number(align.indent) || 0, 0, 15)) + 'px');
        ['top', 'right', 'bottom', 'left'].forEach(side => {
            const css = borderCss(border[side]);
            if (css) rules.push('border-' + side + ':' + css);
        });
        return rules.join(';');
    }

    /** "A1:C2" or an ExcelJS range object as { top, left, bottom, right } (1-based), or null. */
    function parseMerge(merge) {
        if (merge && typeof merge === 'object' && merge.top && merge.left) return { top: merge.top, left: merge.left, bottom: merge.bottom, right: merge.right };
        const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(String(merge || '').toUpperCase());
        if (!match) return null;
        const toNumber = letters => letters.split('').reduce((total, ch) => total * 26 + ch.charCodeAt(0) - 64, 0);
        return { top: Number(match[2]), left: toNumber(match[1]), bottom: Number(match[4]), right: toNumber(match[3]) };
    }

    function mergesOf(worksheet) {
        const found = [];
        try {
            const raw = worksheet._merges ? Object.values(worksheet._merges).map(item => item.model || item) : (worksheet.model && worksheet.model.merges) || [];
            raw.forEach(item => { const range = parseMerge(item); if (range) found.push(range); });
        } catch (_) { /* a sheet without merges */ }
        return found;
    }

    /**
     * The text of a SheetJS sheet, as Excel shows it. Returns { rows, cols, get(row, col) } with 1-based coordinates.
     */
    function sheetTexts(XLSX, sheet) {
        const ref = sheet && sheet['!ref'];
        if (!ref) return { rows: 0, cols: 0, get: () => '' };
        const range = XLSX.utils.decode_range(ref);
        return {
            rows: range.e.r + 1,
            cols: range.e.c + 1,
            get(row, col) {
                const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: col - 1 })];
                if (!cell) return '';
                if (cell.w !== undefined && cell.w !== null) return String(cell.w);
                return cell.v === undefined || cell.v === null ? '' : String(cell.v);
            }
        };
    }

    function plainText(value) {
        if (value === undefined || value === null) return '';
        if (value instanceof Date) return value.toISOString().slice(0, 10);
        if (typeof value === 'object') {
            if (Array.isArray(value.richText)) return value.richText.map(part => part.text).join('');
            if ('result' in value) return plainText(value.result);
            if (value.text !== undefined) return plainText(value.text);
            if (value.error) return String(value.error);
            return '';
        }
        return String(value);
    }

    /**
     * Joins one ExcelJS worksheet with the matching SheetJS texts into a drawable model.
     * Returns { name, rows, cols, total, truncated, colWidths[px], hiddenCols, hiddenRows, rowHeights[px|0], cells[row][col], freeze }.
     * cells[r][c] is null (covered by a merge) or { text, css, link, rowSpan, colSpan }; rows and columns are 1-based here, 0-based in the arrays.
     */
    function buildSheetModel(worksheet, texts, options) {
        const opts = options || {};
        const maxRows = opts.maxRows || MAX_ROWS;
        const maxCols = opts.maxCols || MAX_COLS;
        const maxCells = opts.maxCells || MAX_CELLS;
        const usedRows = Math.max(worksheet.rowCount || 0, texts.rows || 0);
        const usedCols = Math.max(worksheet.columnCount || 0, texts.cols || 0);
        const cols = clamp(usedCols, 1, maxCols);
        const rows = clamp(Math.min(usedRows, Math.floor(maxCells / cols), maxRows), 0, maxRows);
        const merges = mergesOf(worksheet);
        const masters = new Map();
        const covered = new Set();
        merges.forEach(range => {
            masters.set(range.top + ':' + range.left, range);
            for (let r = range.top; r <= range.bottom; r += 1) {
                for (let c = range.left; c <= range.right; c += 1) {
                    if (r !== range.top || c !== range.left) covered.add(r + ':' + c);
                }
            }
        });

        const colWidths = [];
        const hiddenCols = new Set();
        for (let c = 1; c <= cols; c += 1) {
            const column = worksheet.getColumn(c);
            colWidths.push(column && column.width ? Math.round(column.width * 7 + 5) : DEFAULT_COL_PX);
            if (column && column.hidden) hiddenCols.add(c);
        }

        const rowHeights = [];
        const hiddenRows = new Set();
        const cells = [];
        for (let r = 1; r <= rows; r += 1) {
            const row = worksheet.getRow(r);
            rowHeights.push(row && row.height ? Math.round(row.height * PT_TO_PX) : 0);
            if (row && row.hidden) hiddenRows.add(r);
            const line = [];
            for (let c = 1; c <= cols; c += 1) {
                if (covered.has(r + ':' + c)) { line.push(null); continue; }
                const cell = row.getCell(c);
                const span = masters.get(r + ':' + c);
                const text = texts.get(r, c) || plainText(cell.value);
                line.push({
                    text,
                    css: cellCss(cell),
                    link: linkOf(cell),
                    rowSpan: span ? Math.min(span.bottom, rows) - r + 1 : 1,
                    colSpan: span ? Math.min(span.right, cols) - c + 1 : 1
                });
            }
            cells.push(line);
        }

        const view = Array.isArray(worksheet.views) ? worksheet.views[0] : null;
        const frozen = view && view.state === 'frozen';
        return {
            name: String(worksheet.name),
            rows, cols, total: usedRows, truncated: usedRows > rows || usedCols > cols,
            colWidths, hiddenCols, hiddenRows, rowHeights, cells,
            freeze: { rows: frozen ? clamp(Number(view.ySplit) || 0, 0, rows) : 0, cols: frozen ? clamp(Number(view.xSplit) || 0, 0, cols) : 0 }
        };
    }

    /**
     * Every visible sheet of a workbook as a model. ExcelJS and SheetJS are the two library objects; data is an ArrayBuffer;
     * the caller has already loaded the workbook with ExcelJS (`await new ExcelJS.Workbook().xlsx.load(data)`).
     */
    function buildModels(XLSX, sheetJsWorkbook, excelWorkbook, options) {
        const models = [];
        (excelWorkbook.worksheets || []).forEach(worksheet => {
            if (worksheet.state && worksheet.state !== 'visible') return;
            const texts = sheetTexts(XLSX, sheetJsWorkbook.Sheets[worksheet.name]);
            const model = buildSheetModel(worksheet, texts, options);
            if (model.rows > 0) models.push(model);
        });
        return models;
    }

    /** CSV has no saved formatting. Give its values the same bounded grid, headers and scrolling as a workbook. */
    function buildCsvModel(rawRows) {
        const source = Array.isArray(rawRows) ? rawRows : [];
        const cols = Math.min(MAX_COLS, Math.max(1, ...source.slice(0, MAX_ROWS).map(row => Array.isArray(row) ? row.length : 0)));
        const count = Math.min(source.length, MAX_ROWS, Math.floor(MAX_CELLS / cols));
        const cells = source.slice(0, count).map(row => Array.from({ length: cols }, (_, col) => ({
            text: String(Array.isArray(row) ? row[col] ?? '' : ''),
            css: '', link: '', rowSpan: 1, colSpan: 1
        })));
        return {
            name: 'CSV', rows: count, cols, total: source.length, truncated: source.length > count || source.some(row => Array.isArray(row) && row.length > cols),
            colWidths: Array(cols).fill(140), hiddenCols: new Set(), hiddenRows: new Set(),
            rowHeights: Array(count).fill(0), cells, freeze: { rows: 0, cols: 0 }
        };
    }

    function el(doc, tag, className, text) {
        const node = doc.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    /** Draws a model as a table: returns { table, matrix } where matrix[r] is the list of data cells of row r (for search). */
    function renderGrid(doc, model) {
        const table = el(doc, 'table', 'xl-grid');
        table.id = 'xl-grid';
        const visibleCols = [];
        for (let c = 1; c <= model.cols; c += 1) if (!model.hiddenCols.has(c)) visibleCols.push(c);
        const width = ROW_HEADER_PX + visibleCols.reduce((total, c) => total + model.colWidths[c - 1], 0);
        table.style.width = width + 'px';

        const group = doc.createElement('colgroup');
        const corner = doc.createElement('col');
        corner.style.width = ROW_HEADER_PX + 'px';
        group.appendChild(corner);
        visibleCols.forEach(c => { const col = doc.createElement('col'); col.style.width = model.colWidths[c - 1] + 'px'; group.appendChild(col); });
        table.appendChild(group);

        const head = doc.createElement('thead');
        const headRow = doc.createElement('tr');
        headRow.appendChild(el(doc, 'th', 'xl-corner'));
        visibleCols.forEach(c => headRow.appendChild(el(doc, 'th', 'xl-col-head', colName(c))));
        head.appendChild(headRow);
        table.appendChild(head);

        const body = doc.createElement('tbody');
        const rowsOut = [];
        model.cells.forEach((line, rIndex) => {
            const r = rIndex + 1;
            if (model.hiddenRows.has(r)) return;
            const tr = doc.createElement('tr');
            tr.dataset.row = String(r);
            tr.style.height = (model.rowHeights[rIndex] || DEFAULT_ROW_PX) + 'px';
            tr.appendChild(el(doc, 'th', 'xl-row-head', String(r)));
            const dataCells = [];
            visibleCols.forEach(c => {
                const cell = line[c - 1];
                if (!cell) return;
                const td = doc.createElement('td');
                td.className = 'xl-cell';
                td.dataset.col = String(c);
                if (cell.css) td.style.cssText = cell.css;
                if (cell.rowSpan > 1) td.rowSpan = cell.rowSpan;
                if (cell.colSpan > 1) td.colSpan = cell.colSpan;
                td.dataset.raw = cell.text;
                if (cell.link && cell.text) {
                    const a = doc.createElement('a');
                    a.href = cell.link;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.className = 'xl-link';
                    a.textContent = cell.text;
                    td.appendChild(a);
                } else {
                    td.textContent = cell.text;
                }
                tr.appendChild(td);
                dataCells.push(td);
            });
            body.appendChild(tr);
            rowsOut.push(dataCells);
        });
        table.appendChild(body);
        return { table, rows: rowsOut, visibleCols };
    }

    /**
     * Keeps the frozen rows and columns in view while the rest scrolls. Offsets are measured, because a wrapped row is
     * taller than its set height. Call after the table is in the page.
     */
    function applyFreeze(table, model, visibleCols) {
        const headRow = table.tHead && table.tHead.rows[0];
        const headHeight = headRow ? headRow.offsetHeight || COL_HEADER_PX : COL_HEADER_PX;
        let top = headHeight;
        const rows = Array.from(table.tBodies[0] ? table.tBodies[0].rows : []);
        const frozenRows = rows.filter(tr => Number(tr.dataset.row) <= model.freeze.rows);
        frozenRows.forEach(tr => {
            const offset = top;
            Array.from(tr.cells).forEach(cell => { cell.classList.add('xl-frozen'); cell.style.top = offset + 'px'; });
            top += tr.offsetHeight || DEFAULT_ROW_PX;
        });
        const frozenCols = visibleCols.filter(c => c <= model.freeze.cols);
        if (frozenCols.length) {
            let left = ROW_HEADER_PX;
            const lefts = new Map();
            frozenCols.forEach(c => { lefts.set(c, left); left += model.colWidths[c - 1]; });
            Array.from(table.querySelectorAll('td.xl-cell')).forEach(td => {
                const c = Number(td.dataset.col);
                if (lefts.has(c)) { td.classList.add('xl-frozen-col'); td.style.left = lefts.get(c) + 'px'; }
            });
        }
    }

    /** Search: rows with no match are hidden, matching cells are marked. Returns { visible, total, matches }. */
    function filterGrid(table, query) {
        const q = String(query || '').trim().toLowerCase();
        const rows = Array.from(table.tBodies[0] ? table.tBodies[0].rows : []);
        let visible = 0;
        let matches = 0;
        rows.forEach(tr => {
            let hit = false;
            Array.from(tr.querySelectorAll('td.xl-cell')).forEach(td => {
                const found = Boolean(q) && String(td.dataset.raw || '').toLowerCase().includes(q);
                td.classList.toggle('xl-match', found);
                if (found) { hit = true; matches += 1; }
            });
            const show = !q || hit;
            tr.classList.toggle('xl-row-hidden', !show);
            if (show) visible += 1;
        });
        return { visible, total: rows.length, matches };
    }

    return Object.freeze({
        MAX_ROWS, MAX_COLS, MAX_CELLS, THEME, colName, cssColor, borderCss, cellCss, parseMerge, mergesOf, sheetTexts, plainText,
        buildSheetModel, buildModels, buildCsvModel, renderGrid, applyFreeze, filterGrid, linkOf, safeLink
    });
});
