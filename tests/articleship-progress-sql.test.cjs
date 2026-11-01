// PostgreSQL execution and RLS tests for the Articleship tool progress table. Dependency: @electric-sql/pglite.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const migration = fs.readFileSync(path.join(__dirname, '../supabase/migrations/202610200001_articleship_tool_progress.sql'), 'utf8');
const A = '20000000-0000-4000-8000-00000000000a';
const B = '20000000-0000-4000-8000-00000000000b';
let db;

async function setup() {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create schema auth;
        create table auth.users(id uuid primary key, email text);
        create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
        grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
        grant usage on schema public to anon, authenticated;
        insert into auth.users values ('${A}', 'a@example.test'), ('${B}', 'b@example.test');`);
    await db.exec(migration);
    await db.exec(migration); // idempotent
}
async function as(role, user = '') {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    await db.exec(`set role ${role}`);
}
after(async () => { if (db) await db.close(); });

test('the migration runs twice and creates the table, trigger and four own-row policies', async () => {
    await setup();
    const policies = await db.query("select policyname, cmd from pg_policies where tablename = 'articleship_tool_progress' order by policyname");
    assert.deepEqual(policies.rows.map(row => row.cmd).sort(), ['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    const rls = await db.query("select relrowsecurity from pg_class where relname = 'articleship_tool_progress'");
    assert.equal(rls.rows[0].relrowsecurity, true);
});

test('a student saves, upserts and reads only their own rows; updated_at comes from the server', async () => {
    await as('authenticated', A);
    await db.query("insert into public.articleship_tool_progress (tool, data) values ('cv-checklist', $1::jsonb)", [JSON.stringify({ ticks: { 'one-page': true } })]);
    const first = (await db.query("select user_id, data, updated_at from public.articleship_tool_progress")).rows;
    assert.equal(first.length, 1);
    assert.equal(first[0].user_id, A, 'user_id defaults to auth.uid()');
    // PostgREST upsert shape used by the client
    await db.query(`insert into public.articleship_tool_progress (user_id, tool, data) values ($1, 'cv-checklist', $2::jsonb)
        on conflict (user_id, tool) do update set data = excluded.data`, [A, JSON.stringify({ ticks: { 'one-page': true, 'pdf': true } })]);
    const second = (await db.query("select data, updated_at from public.articleship_tool_progress where tool = 'cv-checklist'")).rows[0];
    assert.deepEqual(second.data, { ticks: { 'one-page': true, 'pdf': true } });
    assert.ok(new Date(second.updated_at) >= new Date(first[0].updated_at));

    await as('authenticated', B);
    assert.equal((await db.query('select * from public.articleship_tool_progress')).rows.length, 0, 'B cannot see A');
    await assert.rejects(db.query("insert into public.articleship_tool_progress (user_id, tool, data) values ($1, 'cv-checklist', '{}')", [A]), /row-level security/);
    const updated = await db.query("update public.articleship_tool_progress set data = '{}' where user_id = $1", [A]);
    assert.equal(updated.affectedRows, 0, 'B cannot change A');
    const deleted = await db.query('delete from public.articleship_tool_progress where user_id = $1', [A]);
    assert.equal(deleted.affectedRows, 0, 'B cannot delete A');
    await db.query("insert into public.articleship_tool_progress (tool, data) values ('settings', $1::jsonb)", [JSON.stringify({ myDomain: 'gst' })]);
    assert.equal((await db.query('select * from public.articleship_tool_progress')).rows.length, 1);

    await as('authenticated', A);
    await db.query('update public.articleship_tool_progress set user_id = $1', [B]);
    assert.equal((await db.query('select user_id from public.articleship_tool_progress')).rows[0].user_id, A,
        'a row can never be handed to another account');
    await as('postgres');
    assert.equal((await db.query('select count(*)::int n from public.articleship_tool_progress')).rows[0].n, 2);
});

test('anon has no access and bad tool keys or oversized or non-object data are refused', async () => {
    await as('anon');
    await assert.rejects(db.query('select * from public.articleship_tool_progress'), /permission denied/);
    await assert.rejects(db.query("insert into public.articleship_tool_progress (user_id, tool, data) values ($1, 'x1', '{}')", [A]), /permission denied/);
    await as('authenticated', A);
    for (const tool of ['', 'A', 'Bad Tool', '-x', 'x'.repeat(41), "x'; drop"]) {
        await assert.rejects(db.query("insert into public.articleship_tool_progress (tool, data) values ($1, '{}')", [tool]), /violates check constraint/, tool);
    }
    await assert.rejects(db.query("insert into public.articleship_tool_progress (tool, data) values ('arr', '[]')"), /violates check constraint/);
    await assert.rejects(db.query("insert into public.articleship_tool_progress (tool, data) values ('big', $1::jsonb)", [JSON.stringify({ blob: 'x'.repeat(270000) })]), /violates check constraint/);
    await db.exec('reset role');
});
