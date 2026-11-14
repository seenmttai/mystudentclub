const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202610310002_excel_tests_8_9_new_workbooks.sql'), 'utf8');
const BUCKET = 'industrial-training-mastery-resources';
const NEW_FILES = ['Excel_Assessment_ONS_.csv', 'Excel_Assessment_ONS.xlsx', 'Excel_Test_ITC_Industrial_Training_.csv', 'Excel_Test_ITC_Industrial_Training.xlsx'];
const OLD_TEST9_CSV = 'admin-managed/industrial-training-mastery/day-7/video-7/1784370466616-excel-test-9.csv';
const ONE_ONE = '1.1 Excel Assessment Test (Questions).xlsx';
const entry = (title, view, download) => ({ url: '', type: 'csv', group: 'Excel Tests', title, description: '', view_storage_path: view, download_storage_path: download });

// Day 6 as it is live after 202610310001.
const day6 = () => [
    { url: '', type: 'pdf', group: 'Registration', title: 'Registration Process', description: '', view_storage_path: 'Registration Process.pdf', download_storage_path: 'None' },
    entry('Excel Test 7', '1.1 Excel Assessment Test (Questions)_.csv', ONE_ONE),
    entry('Excel Test 8', '1.1-Excel-Assessment-Test-_Questions__.csv', ONE_ONE),
    entry('Excel Test 9', OLD_TEST9_CSV, ONE_ONE)
];

async function freshDb() {
    const { PGlite } = await import('@electric-sql/pglite');
    const db = new PGlite();
    await db.exec(`
        create schema storage;
        create table storage.objects (bucket_id text, name text);
        create table public.videos (course text, video_number int, day_number int, title text, resources jsonb);
    `);
    await db.query('insert into public.videos values ($1, 7, 6, $2, $3)', ['industrial-training-mastery', 'Day 6', JSON.stringify(day6())]);
    return db;
}
const addObjects = (db, names) => Promise.all(names.map((name) => db.query('insert into storage.objects values ($1, $2)', [BUCKET, name])));
const resources = async (db) => (await db.query("select resources from public.videos where course = 'industrial-training-mastery'")).rows[0].resources;
const byTitle = (list) => Object.fromEntries(list.map((r) => [r.title, r]));

test('Tests 8 and 9 get their own workbook and first-sheet preview; Test 7 and the rest stay', async () => {
    const db = await freshDb();
    await addObjects(db, NEW_FILES);
    await db.exec(migration);
    await db.exec(migration); // running it again changes nothing
    const after = await resources(db);
    const r = byTitle(after);
    assert.deepEqual(after.map((x) => x.title), day6().map((x) => x.title));
    assert.equal(r['Excel Test 8'].view_storage_path, 'Excel_Assessment_ONS_.csv');
    assert.equal(r['Excel Test 8'].download_storage_path, 'Excel_Assessment_ONS.xlsx');
    assert.equal(r['Excel Test 9'].view_storage_path, 'Excel_Test_ITC_Industrial_Training_.csv');
    assert.equal(r['Excel Test 9'].download_storage_path, 'Excel_Test_ITC_Industrial_Training.xlsx');
    for (const t of ['Excel Test 8', 'Excel Test 9']) {
        assert.equal(r[t].type, 'csv');
        assert.equal(r[t].group, 'Excel Tests');
    }
    assert.deepEqual(r['Excel Test 7'], day6()[1]);
    assert.deepEqual(r['Registration Process'], day6()[0]);
    await db.close();
});

test('nothing changes until both files of a test are in the bucket', async () => {
    const db = await freshDb();
    await addObjects(db, ['Excel_Assessment_ONS.xlsx', 'Excel_Test_ITC_Industrial_Training_.csv']);
    await db.exec(migration);
    assert.deepEqual(await resources(db), day6());
    await db.close();
});

test('a test edited since (different paths) is left alone', async () => {
    const db = await freshDb();
    const edited = day6();
    edited[3] = entry('Excel Test 9', 'admin-managed/industrial-training-mastery/day-6/video-7/1793000000000-excel-test-9.csv', 'admin-managed/industrial-training-mastery/day-6/video-7/1793000000001-excel-test-9-excel.xlsx');
    await db.query("update public.videos set resources = $1", [JSON.stringify(edited)]);
    await addObjects(db, NEW_FILES);
    await db.exec(migration);
    const r = byTitle(await resources(db));
    assert.deepEqual(r['Excel Test 9'], edited[3]);
    assert.equal(r['Excel Test 8'].download_storage_path, 'Excel_Assessment_ONS.xlsx');
    await db.close();
});

test('the reverse statement in the header puts the old paths back', async () => {
    const db = await freshDb();
    await addObjects(db, NEW_FILES);
    await db.exec(migration);
    const reverse = migration.split('\n')
        .slice(migration.split('\n').findIndex((l) => l.includes('Reversible: yes')) + 1)
        .filter((l) => l.startsWith('--   '))
        .map((l) => l.slice(5))
        .join('\n');
    assert.match(reverse, /^update public\.videos/);
    await db.exec(reverse + ';');
    assert.deepEqual(await resources(db), day6());

    // Undo after a later admin edit to Test 9: Test 8 goes back, the edited Test 9 is kept.
    await db.exec(migration);
    const edited = entry('Excel Test 9', 'admin-managed/x/new.csv', 'admin-managed/x/new.xlsx');
    await db.query("update public.videos set resources = (select jsonb_agg(case when e->>'title' = 'Excel Test 9' then $1::jsonb else e end) from jsonb_array_elements(resources) e)", [JSON.stringify(edited)]);
    await db.exec(reverse + ';');
    const r = byTitle(await resources(db));
    assert.deepEqual(r['Excel Test 9'], edited);
    assert.deepEqual(r['Excel Test 8'], day6()[2]);
    await db.close();
});
