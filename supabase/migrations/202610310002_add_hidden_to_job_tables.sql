-- 202610310002_add_hidden_to_job_tables.sql
-- What: lets a vacancy be hidden from the site without deleting it (Padam, 31 Oct 2026: third-party reposts such as
-- BuddingCA should come off the portal, but a delete can't be undone). Adds three columns to each vacancy table:
--   hidden        boolean, not null, default false: the site skips rows where it is true
--   hidden_reason text: why it was hidden (e.g. "third-party repost: BuddingCA")
--   hidden_at     timestamptz: when
-- Existing rows get hidden = false, so nothing disappears when this runs. Safe to run twice.
-- Reversible: yes. The drop statements are at the end, commented out (running them loses only the hidden flags).

alter table if exists public."Industrial Training Job Portal"
  add column if not exists hidden boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_at timestamptz;

alter table if exists public."Articleship Jobs"
  add column if not exists hidden boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_at timestamptz;

alter table if exists public."Fresher Jobs"
  add column if not exists hidden boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_at timestamptz;

alter table if exists public."Semi Qualified Jobs"
  add column if not exists hidden boolean not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_at timestamptz;

-- Rollback (only if needed):
-- alter table public."Industrial Training Job Portal" drop column if exists hidden, drop column if exists hidden_reason, drop column if exists hidden_at;
-- alter table public."Articleship Jobs" drop column if exists hidden, drop column if exists hidden_reason, drop column if exists hidden_at;
-- alter table public."Fresher Jobs" drop column if exists hidden, drop column if exists hidden_reason, drop column if exists hidden_at;
-- alter table public."Semi Qualified Jobs" drop column if exists hidden, drop column if exists hidden_reason, drop column if exists hidden_at;
