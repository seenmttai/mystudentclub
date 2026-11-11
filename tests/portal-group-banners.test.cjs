// WhatsApp group banners on the Industrial, Semi Qualified and CA Fresher portals (Padam, 10 Nov 2026).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/202611100001_portal_group_banners.sql'), 'utf8');
let db;
after(async () => { if (db) await db.close(); });

test('3 group banners: one per portal, each opening its /links tab, image shipped, safe to rerun', async () => {
  db = new PGlite();
  await db.exec(`create table public."Banners"(id serial primary key, "Image" text, "Hyperlink" text, "Type" text,
    visible_to_unenrolled boolean, web_only boolean not null default false);`);
  await db.exec(sql);
  await db.exec(sql);
  const rows = (await db.query('select "Image", "Hyperlink", "Type", web_only, visible_to_unenrolled from "Banners" order by id')).rows;
  assert.deepEqual(rows.map(r => [r.Type, r.Hyperlink]), [
    ['Industrial', '/links/?tab=industrial'],
    ['Semi-Qualified', '/links/?tab=semi'],
    ['Freshers', '/links/?tab=fresher'],
  ]);
  for (const r of rows) {
    assert.equal(r.web_only, false);
    assert.equal(r.visible_to_unenrolled, null);
    assert.ok(fs.existsSync(path.join(root, r.Image.replace('https://www.mystudentclub.com/', ''))), r.Image);
  }
});

test('the Experienced CA page has its own banner Type, so CA Fresher banners stay off it', () => {
  const src = fs.readFileSync(path.join(root, 'scripts/portal3.js'), 'utf8');
  assert.match(src, /currentTable === "Fresher Jobs" \? \(isExperiencedFresherPortal\(\) \? "Experienced" : "Freshers"\)/);
});
