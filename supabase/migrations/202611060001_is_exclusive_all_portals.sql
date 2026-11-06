-- 202611060001_is_exclusive_all_portals.sql
-- What: lets every job portal have exclusive vacancies, not only Industrial Training (Padam, 6 Nov 2026, job portal
-- v2). An exclusive vacancy shows on the portal as a teaser to everyone; how to apply (Application ID, links,
-- contact, the original post) only for students enrolled in that portal's programme. Exclusive vacancies get no
-- public /jobs/ page.
--
-- Adds is_exclusive (boolean, not null, default false) to the three tables that do not have it yet. Every existing
-- row gets false, so nothing changes on the site until someone ticks a vacancy exclusive. Safe to run twice.
--
-- The grants: logged-out visitors (role anon) read these tables through column-level grants, and Postgres does not
-- give anon a new column automatically. Without the grant the portal cannot tell a logged-out visitor that a
-- vacancy is exclusive (the code then falls back to reading without the column). "Industrial Training Job Portal"
-- already grants is_exclusive to anon; these lines do the same for the other three. Logged-in users (role
-- authenticated) have table-level SELECT already. Only a true/false flag is exposed; no student data.
--
-- The site code works before and after this runs (it retries without is_exclusive while the column is missing).
-- NOT RUN as part of PR "Job portal v2". Run it in one transaction after Padam's go.

begin;

alter table if exists public."Fresher Jobs"
  add column if not exists is_exclusive boolean not null default false;

alter table if exists public."Semi Qualified Jobs"
  add column if not exists is_exclusive boolean not null default false;

alter table if exists public."Articleship Jobs"
  add column if not exists is_exclusive boolean not null default false;

grant select (is_exclusive) on table public."Fresher Jobs" to anon;
grant select (is_exclusive) on table public."Semi Qualified Jobs" to anon;
grant select (is_exclusive) on table public."Articleship Jobs" to anon;

commit;

-- Rollback (only if needed; loses the exclusive flags on these three tables):
-- revoke select (is_exclusive) on table public."Fresher Jobs" from anon;
-- revoke select (is_exclusive) on table public."Semi Qualified Jobs" from anon;
-- revoke select (is_exclusive) on table public."Articleship Jobs" from anon;
-- alter table public."Fresher Jobs" drop column if exists is_exclusive;
-- alter table public."Semi Qualified Jobs" drop column if exists is_exclusive;
-- alter table public."Articleship Jobs" drop column if exists is_exclusive;
