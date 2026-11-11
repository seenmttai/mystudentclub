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
    for (const name of ['answers.pdf', 'macro-book.xlsm']) {
        const { calls } = await saveResource({ file: { name: 'test.csv' }, excelFile: { name } });
        assert.equal(calls.uploads.length, 0);
        assert.equal(calls.saved, null);
        assert.equal(calls.status.at(-1).kind, 'error');
    }
});

test('admin: the Excel upload shows only for the CSV type', () => {
    assert.match(adminHtml, /id="lmsCsvExcelUpload"/);
    assert.match(adminHtml, /<input id="lmsResourceFileExcel" type="file" accept="\.xlsx,\.xls"/);
    assert.match(slice('function updateLmsResourceModePanels(', 'function inferLmsResourceTypeFromName('), /csvExcelExtra\.style\.display = isCsv && mode === 'file'/);
});

test('course page: Tests 2-9 after the data fix say Download Excel and explain the preview', () => {
    const source = fs.readFileSync(path.join(root, 'learning-management-system/course-script.js'), 'utf8');
    const start = source.indexOf('const isGoogleSheetResource');
    const end = source.indexOf('const updateLearningStreak', start);
    // The label helpers read the page's course table (Articleship v3 compact resources).
    const context = { courses: {}, state: { courseSlug: 'industrial-training-mastery' } };
    vm.createContext(context);
    vm.runInContext(source.slice(start, end) + '\nthis.api = { getResourceDownloadLabel, getResourceFormatNote, getResourceViewerSubtitle };', context);
    const { getResourceDownloadLabel, getResourceFormatNote, getResourceViewerSubtitle } = context.api;
    const test2 = { title: 'Excel Test 2', type: 'csv', group: 'Excel Tests', view_storage_path: 'Excel-Assessment-Test-_Questions__.csv', download_storage_path: 'Excel Assessment Test (Questions).xlsx' };
    assert.equal(getResourceDownloadLabel(test2), 'Download Excel');
    assert.equal(getResourceFormatNote(test2), 'Preview shows one sheet. Download the Excel file for every sheet.');
    assert.equal(getResourceViewerSubtitle(test2, 'csv'), 'This preview shows one sheet. Download the Excel file for every sheet.');
});

// ---- Data fix: supabase/migrations/202610310001_excel_tests_xlsx_downloads.sql ----

const migration = fs.readFileSync(path.join(root, 'supabase/migrations/202610310001_excel_tests_xlsx_downloads.sql'), 'utf8');
const BUCKET = 'industrial-training-mastery-resources';
const day6 = () => [
    { title: 'Registration Process', type: 'pdf', group: 'Registration', view_storage_path: 'Registration Process.pdf', download_storage_path: 'None' },
    { title: 'Master Excel Test  1', type: 'csv', group: 'Excel Tests', view_storage_path: 'Excel Assessment Test - CA Interview Prep.csv', download_storage_path: 'Excel Assessment Test - CA Interview Prep.xlsx' },
    { title: 'Excel Test 2', type: 'csv', group: 'Excel Tests', view_storage_path: 'Excel-Assessment-Test-_Questions__.csv', download_storage_path: 'Excel-Assessment-Test-_Questions__.csv' },
    { title: 'Excel Test 3', type: 'csv', group: 'Excel Tests', view_storage_path: 'Excel Interview Questions_.csv', download_storage_path: 'Excel Interview Questions_.csv' },
    { title: 'Excel Test 4', type: 'csv', group: 'Excel Tests', view_storage_path: 'Excel Test_.csv', download_storage_path: 'Excel Test_.csv' },
    { title: 'Excel Test 5', type: 'csv', group: 'Excel Tests', view_storage_path: 'Excel test-1_.csv', download_storage_path: 'Excel test-1_.csv' },
    { title: 'Excel Test 6', type: 'csv', group: 'Excel Tests', view_storage_path: 'Excel_Skills_Test_.csv', download_storage_path: 'Excel_Skills_Test_.csv' },
    { title: 'Excel Test 7', type: 'csv', group: 'Excel Tests', view_storage_path: '1.1 Excel Assessment Test (Questions)_.csv', download_storage_path: '1.1 Excel Assessment Test (Questions)_.csv' },
    { title: 'Excel Test 8', type: 'csv', group: 'Excel Tests', view_storage_path: '1.1-Excel-Assessment-Test-_Questions__.csv', download_storage_path: '1.1-Excel-Assessment-Test-_Questions__.csv' },
    { title: 'Excel Test 9', type: 'csv', group: 'Excel Tests', view_storage_path: 'admin-managed/industrial-training-mastery/day-7/video-7/1784370466616-excel-test-9.csv', download_storage_path: 'admin-managed/industrial-training-mastery/day-7/video-7/1784370466616-excel-test-9.csv' }
];

async function freshDb(columnType) {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    await db.exec(`
        create schema storage;
        create table storage.objects (bucket_id text, name text);
        create table public.videos (course text, video_number int, day_number int, title text, resources ${columnType});
    `);
    await db.query('insert into public.videos values ($1, 7, 6, $2, $3)', ['industrial-training-mastery', 'Day 6: Motivation, Registration, and Excel', JSON.stringify(day6())]);
    // Another course with a same-named resource must not change.
    await db.query('insert into public.videos values ($1, 7, 6, $2, $3)', ['msc-ca-freshers-program', 'Other', JSON.stringify([day6()[3]])]);
    return db;
}
const addObjects = (db, names) => Promise.all(names.map((name) => db.query('insert into storage.objects values ($1, $2)', [BUCKET, name])));
const downloads = async (db, course = 'industrial-training-mastery') => {
    const { rows } = await db.query('select resources::text as r from public.videos where course = $1', [course]);
    return Object.fromEntries(JSON.parse(rows[0].r).map((r) => [r.title, r.download_storage_path]));
};

for (const columnType of ['jsonb', 'json']) {
    test(`SQL (${columnType}): only tests whose workbook is in the bucket change`, async () => {
        const db = await freshDb(columnType);
        await addObjects(db, ['Excel Interview Questions.xlsx', 'Excel Test.xlsx', 'Excel_Skills_Test.xlsx', 'Excel Assessment Test - CA Interview Prep.xlsx']);
        await db.exec(migration);
        const dl = await downloads(db);
        assert.equal(dl['Excel Test 3'], 'Excel Interview Questions.xlsx');
        assert.equal(dl['Excel Test 4'], 'Excel Test.xlsx');
        assert.equal(dl['Excel Test 6'], 'Excel_Skills_Test.xlsx');
        assert.equal(dl['Excel Test 2'], 'Excel-Assessment-Test-_Questions__.csv');
        assert.equal(dl['Excel Test 7'], '1.1 Excel Assessment Test (Questions)_.csv');
        await db.close();
    });

    test(`SQL (${columnType}): after the upload every test downloads its workbook; previews, order and other rows stay`, async () => {
        const db = await freshDb(columnType);
        await addObjects(db, ['Excel Interview Questions.xlsx', 'Excel Test.xlsx', 'Excel_Skills_Test.xlsx']);
        await db.exec(migration);
        await addObjects(db, ['Excel Assessment Test (Questions).xlsx', '1.1 Excel Assessment Test (Questions).xlsx', 'Excel test-1.xlsx']);
        await db.exec(migration);
        await db.exec(migration); // running it again changes nothing

        const { rows } = await db.query("select resources::text as r from public.videos where course = 'industrial-training-mastery'");
        const after = JSON.parse(rows[0].r);
        const before = day6();
        assert.deepEqual(after.map((r) => r.title), before.map((r) => r.title));
        after.forEach((r, i) => {
            assert.equal(r.view_storage_path, before[i].view_storage_path);
            assert.deepEqual(Object.keys(r).sort(), Object.keys(before[i]).sort());
        });
        const dl = Object.fromEntries(after.map((r) => [r.title, r.download_storage_path]));
        assert.equal(dl['Registration Process'], 'None');
        assert.equal(dl['Master Excel Test  1'], 'Excel Assessment Test - CA Interview Prep.xlsx');
        assert.equal(dl['Excel Test 2'], 'Excel Assessment Test (Questions).xlsx');
        assert.equal(dl['Excel Test 5'], 'Excel test-1.xlsx');
        for (const t of ['Excel Test 7', 'Excel Test 8', 'Excel Test 9']) assert.equal(dl[t], '1.1 Excel Assessment Test (Questions).xlsx');
        assert.ok(after.filter((r) => r.title.startsWith('Excel Test')).every((r) => r.download_storage_path.endsWith('.xlsx')));

        assert.equal((await downloads(db, 'msc-ca-freshers-program'))['Excel Test 3'], 'Excel Interview Questions_.csv');
        await db.close();
    });
}
