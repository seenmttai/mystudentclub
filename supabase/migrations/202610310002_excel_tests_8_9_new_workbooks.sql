-- 202610310002_excel_tests_8_9_new_workbooks.sql
--
-- What it does:
--   Industrial Training Mastery, Day 6 (videos: course = 'industrial-training-mastery', video_number = 7),
--   group "Excel Tests". Excel Tests 7, 8 and 9 all gave the same "1.1 Excel Assessment Test" workbook.
--   This gives Tests 8 and 9 the two workbooks from the Day 6 "Excel Test" folder that no test used:
--     Excel Test 8 -> Excel_Assessment_ONS.xlsx (Tasks, Employee Data: 10 tasks on a 50-employee table)
--     Excel Test 9 -> Excel_Test_ITC_Industrial_Training.xlsx (VLOOKUP, XLOOKUP, Name Split, SUMIF, SUMIFS,
--                     Conditional Formatting, Pivot Table, Countif and Go to)
--   The preview is a CSV of each workbook's first sheet; the download is the workbook. Title, group, type and
--   position stay the same.
--
-- Needs these 4 files at the ROOT of the Storage bucket industrial-training-mastery-resources (Padam asked for the
--   swap on 31 Oct 2026; files from his "Industrial Training Program/Day 6/Excel Test" folder):
--   Excel_Assessment_ONS.xlsx, Excel_Assessment_ONS_.csv,
--   Excel_Test_ITC_Industrial_Training.xlsx, Excel_Test_ITC_Industrial_Training_.csv
--
-- Safe to run more than once. A test changes only when (a) it still has the old paths and (b) both new files are
--   in the bucket. The old files stay in the bucket.
--
-- Reversible: yes. This puts the old paths back:
--   update public.videos v set resources = (
--     select jsonb_agg(case
--       when e.elem->>'title' = 'Excel Test 8' then e.elem
--         || jsonb_build_object('view_storage_path', '1.1-Excel-Assessment-Test-_Questions__.csv',
--                               'download_storage_path', '1.1 Excel Assessment Test (Questions).xlsx')
--       when e.elem->>'title' = 'Excel Test 9' then e.elem
--         || jsonb_build_object('view_storage_path', 'admin-managed/industrial-training-mastery/day-7/video-7/1784370466616-excel-test-9.csv',
--                               'download_storage_path', '1.1 Excel Assessment Test (Questions).xlsx')
--       else e.elem end order by e.ord)
--     from jsonb_array_elements(v.resources::jsonb) with ordinality as e(elem, ord))
--   where v.course = 'industrial-training-mastery' and v.video_number = 7;

with mapping(title, old_view, old_download, new_view, new_download) as (
  values
    ('Excel Test 8',
     '1.1-Excel-Assessment-Test-_Questions__.csv', '1.1 Excel Assessment Test (Questions).xlsx',
     'Excel_Assessment_ONS_.csv', 'Excel_Assessment_ONS.xlsx'),
    ('Excel Test 9',
     'admin-managed/industrial-training-mastery/day-7/video-7/1784370466616-excel-test-9.csv', '1.1 Excel Assessment Test (Questions).xlsx',
     'Excel_Test_ITC_Industrial_Training_.csv', 'Excel_Test_ITC_Industrial_Training.xlsx')
),
ready as (
  select m.*
  from mapping m
  where exists (select 1 from storage.objects o
                where o.bucket_id = 'industrial-training-mastery-resources' and o.name = m.new_view)
    and exists (select 1 from storage.objects o
                where o.bucket_id = 'industrial-training-mastery-resources' and o.name = m.new_download)
)
update public.videos v
set resources = (
  select jsonb_agg(
           case when r.title is not null
                then e.elem || jsonb_build_object('view_storage_path', r.new_view,
                                                  'download_storage_path', r.new_download)
                else e.elem
           end
           order by e.ord)
  from jsonb_array_elements(v.resources::jsonb) with ordinality as e(elem, ord)
  left join ready r
    on r.title = e.elem->>'title'
   and r.old_view = e.elem->>'view_storage_path'
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
     and r2.old_view = e2->>'view_storage_path'
     and r2.old_download = e2->>'download_storage_path'
  );
