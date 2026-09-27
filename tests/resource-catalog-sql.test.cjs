// NODE_PATH=<work>/resource-tests/node_modules node --test tests/resource-catalog-sql.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PGlite } = require('@electric-sql/pglite');

test('public catalogue reads LMS arrays and legacy JSON, exposes names only, and updates automatically', async () => {
 const db=new PGlite();
 try {
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE TABLE public.videos(course text, resources jsonb); ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;');
  const rows=[
   ['industrial-training-mastery',[{title:'CV Template Master',url:'https://private/CV.docx'},{title:'Finance Interview Questions',view_storage_path:'private/finance.pdf'},{title:'Draft only'},{title:'Hidden resource',url:'https://private/x',catalog_hidden:true}]],
   ['msc-ca-freshers-program',JSON.stringify([{title:'Premium Interview Booklet',download_storage_path:'secret/booklet.pdf'},{title:'Hiring Companies',url:'https://private/list',catalog_category:'application-tricks',catalog_priority:2}])],
   ['msc-articleship-program',[{title:'Articleship CV Guide',url:'https://private/a',description:'secret desc'}]],
   ['unrelated-course',[{title:'Unrelated',url:'https://private/other'}]],
   ['msc-ca-freshers-program','malformed [ json'],
  ];
  for(const [course,resources] of rows) await db.query('INSERT INTO public.videos VALUES($1,$2::jsonb)',[course,JSON.stringify(resources)]);
  await db.exec(fs.readFileSync(path.join(__dirname,'../database/20260927-public-resource-catalog.sql'),'utf8'));
  await db.exec('SET ROLE anon');
  const it=await db.query("SELECT * FROM public.get_public_resource_catalog('industrial-training')");
  assert.equal(it.rows.length,2);assert.equal(it.rows[0].title,'CV Template Master');
  assert.deepEqual(Object.keys(it.rows[0]).sort(),['category','program_type','resource_key','sort_order','title']);
  const fresher=await db.query("SELECT * FROM public.get_public_resource_catalog('ca-fresher')");
  assert.equal(fresher.rows.length,2);assert.equal(fresher.rows[0].title,'Hiring Companies');
  assert.ok(!JSON.stringify(fresher.rows).includes('secret'));assert.ok(!JSON.stringify(it.rows).includes('private'));
  await assert.rejects(db.query('SELECT resources FROM public.videos'),/permission denied/);
  await db.exec('RESET ROLE');
  await db.query('INSERT INTO public.videos VALUES($1,$2::jsonb)',['msc-articleship-program',JSON.stringify([{title:'New Application Tricks',url:'https://secret/new.pdf'}])]);
  await db.exec('SET ROLE anon');
  const articleship=await db.query("SELECT * FROM public.get_public_resource_catalog('articleship')");
  assert.equal(articleship.rows.length,2);assert.ok(articleship.rows.some(r=>r.title==='New Application Tricks'));
  assert.equal((await db.query("SELECT * FROM public.get_public_resource_catalog('unknown')")).rows.length,0);
 } finally {await db.close();}
});
