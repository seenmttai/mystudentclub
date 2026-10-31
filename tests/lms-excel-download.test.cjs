const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');

const adminHtml = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const slice = (startMarker, endMarker) => {
    const start = adminHtml.indexOf(startMarker);
    const end = adminHtml.indexOf(endMarker, start);
    assert.ok(start >= 0 && end > start, `could not find ${startMarker}`);
    return adminHtml.slice(start, end);
};

// Runs the admin "Save resource" handler with stubbed form fields, uploads and storage.
async function saveResource({ type = 'csv', file = null, excelFile = null, viewOnly = false, existing = null }) {
    const video = { course: 'industrial-training-mastery', day_number: 6, video_number: 7, resources: existing ? [existing] : [] };
    const fields = {
        lmsResourceTitle: { value: 'Excel Test 10' },
        lmsResourceGroup: { value: 'Excel Tests' },
        lmsResourceDescription: { value: '' },
        lmsResourceType: { value: type },
        lmsResourceUrl: { value: '' },
        lmsResourceFile: { files: file ? [file] : [], value: '' },
        lmsResourceFilePdf: { files: [] },
        lmsResourceFileExcel: { files: excelFile ? [excelFile] : [], value: '' },
        lmsResourceViewOnly: { checked: viewOnly },
        lmsEditingResourceIndex: { value: existing ? '0' : '' },
        lmsResourceSaveBtn: { disabled: false, textContent: '' }
    };
    const calls = { uploads: [], saved: null, removed: [], status: [] };
    const context = {
        console: { warn() {}, error() {} },
        document: {
            getElementById: (id) => fields[id] || null,
            querySelector: () => ({ value: 'file' })
        },
        getSelectedLmsVideo: () => video,
        inferLmsResourceTypeFromName: () => 'pdf',
        uploadLmsResourceFile: async (uploaded, _video, title) => {
            const ext = uploaded.name.split('.').pop();
            const stored = `admin-managed/industrial-training-mastery/day-6/video-7/${calls.uploads.length + 1}-${title.replace(/\s+/g, '-').toLowerCase()}.${ext}`;
            calls.uploads.push(stored);
            return stored;
        },
        persistSelectedLmsResources: async (resources) => { calls.saved = resources; },
        removeLmsStoragePaths: async (paths) => { calls.removed.push(...paths); },
        setLmsResourceStatus: (message, kind) => { calls.status.push({ message, kind }); },
        resetLmsResourceForm() {}
    };
    vm.createContext(context);
    vm.runInContext([
        slice('function normalizeLmsResource(', 'function getLmsVideoKey('),
        slice('function isManagedLmsStoragePath(', 'function getTypeIconSvg('),
        slice('async function handleLmsResourceSave(', 'async function handleLmsResourceDelete(')
    ].join('\n'), context);
    await context.handleLmsResourceSave({ preventDefault() {} });
    return { calls, resource: calls.saved ? calls.saved[calls.saved.length - 1] : null };
}

test('admin: a CSV with an Excel file previews the CSV and downloads the workbook', async () => {
    const { calls, resource } = await saveResource({ file: { name: 'test.csv' }, excelFile: { name: 'Excel Test.xlsx' } });
    assert.equal(calls.uploads.length, 2);
    assert.match(resource.view_storage_path, /\.csv$/);
    assert.match(resource.download_storage_path, /excel-test-10_excel\.xlsx$/);
    assert.equal(resource.type, 'csv');
});

test('admin: a CSV without an Excel file still downloads the CSV', async () => {
    const { resource } = await saveResource({ file: { name: 'test.csv' } });
    assert.equal(resource.download_storage_path, resource.view_storage_path);
});

test('admin: replacing only the CSV keeps the workbook students download and does not delete it', async () => {
    const existing = {
        title: 'Excel Test 10', type: 'csv', group: 'Excel Tests',
        view_storage_path: 'admin-managed/industrial-training-mastery/day-6/video-7/old.csv',
        download_storage_path: 'admin-managed/industrial-training-mastery/day-6/video-7/old.xlsx'
    };
    const { calls, resource } = await saveResource({ file: { name: 'new.csv' }, existing });
    assert.equal(resource.download_storage_path, existing.download_storage_path);
    assert.deepEqual(calls.removed, [existing.view_storage_path]);
});

test('admin: adding a workbook to an existing CSV resource keeps the CSV preview', async () => {
    const existing = {
        title: 'Excel Test 10', type: 'csv', group: 'Excel Tests',
        view_storage_path: 'admin-managed/industrial-training-mastery/day-6/video-7/old.csv',
        download_storage_path: 'admin-managed/industrial-training-mastery/day-6/video-7/old.csv'
    };
    const { calls, resource } = await saveResource({ excelFile: { name: 'Excel Test.xlsx' }, existing });
    assert.equal(resource.view_storage_path, existing.view_storage_path);
    assert.match(resource.download_storage_path, /\.xlsx$/);
    assert.deepEqual(calls.removed, []);
});

test('admin: a view-only CSV ignores the Excel file', async () => {
    const { calls, resource } = await saveResource({ file: { name: 'test.csv' }, excelFile: { name: 'Excel Test.xlsx' }, viewOnly: true });
    assert.equal(calls.uploads.length, 1);
    assert.equal(resource.download_storage_path, 'None');
});

test('admin: a non-Excel download file is refused before anything uploads', async () => {
    const { calls } = await saveResource({ file: { name: 'test.csv' }, excelFile: { name: 'answers.pdf' } });
    assert.equal(calls.uploads.length, 0);
    assert.equal(calls.saved, null);
    assert.equal(calls.status.at(-1).kind, 'error');
});

test('admin: the Excel upload shows only for the CSV type', () => {
    assert.match(adminHtml, /id="lmsCsvExcelUpload"/);
    assert.match(adminHtml, /<input id="lmsResourceFileExcel" type="file" accept="\.xlsx,\.xls,\.xlsm"/);
    assert.match(slice('function updateLmsResourceModePanels(', 'function inferLmsResourceTypeFromName('), /csvExcelExtra\.style\.display = isCsv && mode === 'file'/);
});

test('course page: a CSV preview with a workbook download says Download Excel and explains the preview', () => {
    const source = fs.readFileSync(path.join(root, 'learning-management-system/course-script.js'), 'utf8');
    const start = source.indexOf('const isDocxPreviewResource');
    const end = source.indexOf('const updateLearningStreak', start);
    const context = {};
    vm.createContext(context);
    vm.runInContext(source.slice(start, end) + '\nthis.api = { getResourceDownloadLabel, getResourceFormatNote, getResourceViewerSubtitle };', context);
    const { getResourceDownloadLabel, getResourceFormatNote, getResourceViewerSubtitle } = context.api;
    const excel = { type: 'csv', view_storage_path: 'Excel Test_.csv', download_storage_path: 'Excel Test.xlsx' };
    const csvOnly = { type: 'csv', view_storage_path: 'Excel Test_.csv', download_storage_path: 'Excel Test_.csv' };
    assert.equal(getResourceDownloadLabel(excel), 'Download Excel');
    assert.match(getResourceFormatNote(excel), /one sheet/);
    assert.match(getResourceViewerSubtitle(excel, 'csv'), /one sheet/);
    assert.equal(getResourceDownloadLabel(csvOnly), 'Download');
    assert.equal(getResourceFormatNote(csvOnly), '');
});
