-- 202611010001_hide_third_party_batch1.sql
-- What: hides the first 5 third-party reposts listed on Notion card MSC-92 (Padam, 31 Oct 2026). Run it after
-- 202610310002_add_hidden_to_job_tables.sql. Nothing is deleted: the rows stay and can be unhidden in the admin panel.
-- Checked against live on 1 Nov 2026: all 5 ids exist in "Industrial Training Job Portal" with these companies.
-- Safe to run twice (only touches rows that are not hidden yet).

update public."Industrial Training Job Portal"
set hidden = true,
    hidden_at = now(),
    hidden_reason = case id
      when 10582 then 'third-party repost: job aggregator page'
      when 10583 then 'third-party repost: job aggregator page'
      when 10591 then 'third-party repost: job aggregator page'
      when 10580 then 'third-party repost: unrelated reposter'
      when 10589 then 'third-party repost: unrelated reposter; duplicate of 10580'
    end
where id in (10580, 10582, 10583, 10589, 10591)
  and hidden = false;

-- Rollback (only if needed):
-- update public."Industrial Training Job Portal" set hidden = false, hidden_at = null, hidden_reason = null
--   where id in (10580, 10582, 10583, 10589, 10591);
