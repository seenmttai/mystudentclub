-- 001_excel_tests_xlsx_downloads.sql
--
-- What it does:
--   Industrial Training Mastery, Day 6 (videos: course = 'industrial-training-mastery', video_number = 7,
--   day_number = 6), resource group "Excel Tests". Points the DOWNLOAD of Excel Tests 2 to 9 at the original
--   .xlsx workbook (every sheet) instead of the one-sheet CSV. The CSV preview (view_storage_path) is not
--   touched. Master Excel Test 1 already works this way and is not touched.
--
-- Before running: upload the 3 workbooks in this handover's files/ folder to the ROOT of the Storage bucket
--   industrial-training-mastery-resources, keeping their exact file names. The other 3 workbooks
--   (Tests 3, 4, 6) are already in the bucket.
--
-- Safe to run more than once. A test changes only when (a) its download is still the old CSV path and
--   (b) its .xlsx is in the bucket. Run before the upload and Tests 3, 4 and 6 change now; the rest change
--   when you run it again after uploading.
--
-- Reversible: yes. HANDOVER.md section 8 has the reverse statement.

with mapping(title, old_download, new_download) as (
  values
    ('Excel Test 2', 'Excel-Assessment-Test-_Questions__.csv', 'Excel Assessment Test (Questions).xlsx'),
    ('Excel Test 3', 'Excel Interview Questions_.csv', 'Excel Interview Questions.xlsx'),
    ('Excel Test 4', 'Excel Test_.csv', 'Excel Test.xlsx'),
    ('Excel Test 5', 'Excel test-1_.csv', 'Excel test-1.xlsx'),
    ('Excel Test 6', 'Excel_Skills_Test_.csv', 'Excel_Skills_Test.xlsx'),
    ('Excel Test 7', '1.1 Excel Assessment Test (Questions)_.csv', '1.1 Excel Assessment Test (Questions).xlsx'),
    ('Excel Test 8', '1.1-Excel-Assessment-Test-_Questions__.csv', '1.1 Excel Assessment Test (Questions).xlsx'),
    ('Excel Test 9', 'admin-managed/industrial-training-mastery/day-7/video-7/1784370466616-excel-test-9.csv', '1.1 Excel Assessment Test (Questions).xlsx')
),
ready as (
  select m.*
  from mapping m
  where exists (
    select 1 from storage.objects o
    where o.bucket_id = 'industrial-training-mastery-resources'
      and o.name = m.new_download
  )
)
update public.videos v
set resources = (
  select jsonb_agg(
           case when r.title is not null
                then jsonb_set(e.elem, '{download_storage_path}', to_jsonb(r.new_download))
                else e.elem
           end
           order by e.ord)
  from jsonb_array_elements(v.resources::jsonb) with ordinality as e(elem, ord)
  left join ready r
    on r.title = e.elem->>'title'
   and r.old_download = e.elem->>'download_storage_path'
)
where v.course = 'industrial-training-mastery'
  and v.video_number = 7
  and jsonb_typeof(v.resources::jsonb) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(v.resources::jsonb) e2
    join ready r2
      on r2.title = e2->>'title'
     and r2.old_download = e2->>'download_storage_path'
  );
