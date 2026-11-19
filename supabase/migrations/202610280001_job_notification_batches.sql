-- Batched job notifications: tracks, per FCM topic, how many new-job pushes
-- are pending and when the topic last actually received a push. admin.js
-- uses this to collapse a burst of job postings on the same topic into one
-- "N+ new jobs posted" push instead of one push per job.
--
-- Reversible: yes — `drop table job_notification_batches;` removes it cleanly.
-- No other table references it (topic is a free-form string, not a foreign key,
-- so dropping it cannot cascade into anything else).

create table if not exists job_notification_batches (
  topic text primary key,
  pending_count integer not null default 0,
  last_sent_at timestamptz
);

alter table job_notification_batches enable row level security;

-- Admin panel (scripts/admin.js) reads/writes this with the logged-in admin's
-- session via the anon key, the same way it already reads/writes the four job
-- tables and Banners. There is no end-user-facing read path for this table.
drop policy if exists job_notification_batches_admin_all on job_notification_batches;
create policy job_notification_batches_admin_all on job_notification_batches
  for all to authenticated
  using (true)
  with check (true);

revoke all on job_notification_batches from anon;
grant select, insert, update on job_notification_batches to authenticated;
