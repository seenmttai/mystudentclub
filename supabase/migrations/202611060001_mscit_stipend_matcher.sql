-- MSCIT stipend matcher (6 Nov 2026, Aniket's ask).
--
-- An Industrial Training vacancy posted without a stipend gets the stipend from the "MSCIT Hiring Companies List"
-- sheet when the company name matches. A stipend typed in at posting time always wins: only blank rows are filled,
-- and a row is filled once and never touched again (so a later edit in the admin panel is never overwritten).
--
-- Flow: the Apps Script `supabase/apps-script/MscitStipendSync.gs` runs once a day, reads the sheet tab and calls
-- public.sync_mscit_hiring_stipends(rows). That function replaces the mirror table below and runs the matcher.
--
-- Additive only: one new table (service role only, students can't read it), one new nullable column on
-- "Industrial Training Job Portal" (stipend_source), and three functions. Existing code ignores all of them.
--
-- Reversible. To undo:
--   update "Industrial Training Job Portal" set "Stipend Range" = null, "Salary" = null where stipend_source = 'mscit_list';
--   alter table "Industrial Training Job Portal" drop column stipend_source;
--   drop function public.sync_mscit_hiring_stipends(jsonb);
--   drop function public.fill_it_stipends_from_mscit_list();
--   drop function public.msc_company_key(text);
--   drop table public.mscit_hiring_stipends;

-- Company names to a comparable key: lower case, "&" = "and", punctuation and legal suffixes dropped.
-- "Wipro Ltd." = "Wipro", "Walmart Global Tech India" = "Walmart Global Tech", "D. E. Shaw India" = "d e shaw".
create or replace function public.msc_company_key(name text)
returns text
language sql
immutable
as $$
  select nullif(trim(regexp_replace(
    regexp_replace(
      regexp_replace(lower(coalesce(name, '')), '&', ' and ', 'g'),
      '[^a-z0-9]+', ' ', 'g'),
    '(^| )(the|pvt|private|ltd|limited|llp|inc|plc|co|company|corp|corporation|india|indian)(?= |$)', ' ', 'g')), '')
$$;

-- Mirror of the sheet tab, replaced on every sync. Service role only.
create table if not exists public.mscit_hiring_stipends (
  id bigserial primary key,
  company text not null,
  company_key text not null,
  location text,
  stipend text not null,
  synced_at timestamptz not null default now()
);
create index if not exists mscit_hiring_stipends_company_key_idx on public.mscit_hiring_stipends (company_key);

alter table public.mscit_hiring_stipends enable row level security;
revoke all on public.mscit_hiring_stipends from public, anon, authenticated;
revoke all on sequence public.mscit_hiring_stipends_id_seq from public, anon, authenticated;

-- 'mscit_list' = the stipend on this row came from the hiring list; null = typed in when the vacancy was posted.
alter table public."Industrial Training Job Portal" add column if not exists stipend_source text;

-- Fill blank stipends on Industrial Training vacancies from the hiring list. Returns the number of rows changed.
--   * Only rows with no stipend at all: blank "Stipend Range", no Salary, never filled before.
--   * Company match: the whole name or the part in brackets ("Oil and Natural Gas Corporation Limited (ONGC)" = "ONGC").
--   * If the list has several stipends for a company, the one whose location appears in the vacancy's location wins;
--     with no such row and more than one stipend, the vacancy is left blank rather than guessed.
create or replace function public.fill_it_stipends_from_mscit_list()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer;
begin
  with jobs as (
    select j.id,
           lower(coalesce(j."Location", '')) as loc,
           public.msc_company_key(regexp_replace(j."Company", '\([^)]*\)', ' ', 'g')) as key_main,
           public.msc_company_key(substring(j."Company" from '\(([^)]*)\)')) as key_alt
      from "Industrial Training Job Portal" j
     where coalesce(trim(j."Stipend Range"), '') = '' and j."Salary" is null and j.stipend_source is null
  ),
  candidates as (
    select jobs.id, s.stipend, s.id as list_row,
           (s.location is not null and trim(s.location) <> ''
             and position(lower(trim(s.location)) in jobs.loc) > 0) as location_hit
      from jobs
      join mscit_hiring_stipends s
        on s.company_key = jobs.key_main
        or (jobs.key_alt is not null and s.company_key = jobs.key_alt)
  ),
  picked as (
    select c.id,
           coalesce(
             (select c2.stipend from candidates c2 where c2.id = c.id and c2.location_hit order by c2.list_row limit 1),
             case when count(distinct c.stipend) = 1 then min(c.stipend) end
           ) as stipend
      from candidates c
     group by c.id
  ),
  formatted as (
    select id,
           stipend as raw,
           case when stipend ~ '^\s*[₹rRsS.\s]*[0-9][0-9,]*\s*(/-)?\s*$'
                then nullif(regexp_replace(stipend, '[^0-9]', '', 'g'), '')::integer end as amount
      from picked
     where stipend is not null
  ),
  updated as (
    update "Industrial Training Job Portal" j
       set "Stipend Range" = case when f.amount is not null
                                  then '₹' || to_char(f.amount, 'FM99,99,99,999') || ' / month'
                                  else trim(f.raw) end,
           "Salary" = f.amount,
           stipend_source = 'mscit_list'
      from formatted f
     where j.id = f.id
    returning 1
  )
  select count(*) into changed from updated;
  return changed;
end;
$$;

-- Called once a day by the Apps Script with the sheet's rows: [{"company": "...", "location": "...", "stipend": "..."}].
-- Replaces the mirror and runs the matcher in one transaction. Returns {"list_rows": n, "jobs_filled": n}.
create or replace function public.sync_mscit_hiring_stipends(rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  kept integer;
  filled integer;
begin
  if rows is null or jsonb_typeof(rows) <> 'array' then
    raise exception 'rows must be a JSON array';
  end if;
  -- An empty or broken read of the sheet must not wipe the list.
  if jsonb_array_length(rows) = 0 then
    raise exception 'rows is empty; refusing to clear the hiring list';
  end if;

  delete from mscit_hiring_stipends where true;
  insert into mscit_hiring_stipends (company, company_key, location, stipend)
  select trim(r->>'company'), public.msc_company_key(trim(r->>'company')), nullif(trim(r->>'location'), ''), trim(r->>'stipend')
    from jsonb_array_elements(rows) r
   where public.msc_company_key(r->>'company') is not null
     and coalesce(trim(r->>'stipend'), '') <> ''
     and trim(r->>'stipend') !~* '^(-+|na|n/?a|nil|not disclosed|undisclosed|tbd|unpaid|0)$';
  get diagnostics kept = row_count;

  filled := public.fill_it_stipends_from_mscit_list();
  return jsonb_build_object('list_rows', kept, 'jobs_filled', filled);
end;
$$;

revoke all on function public.fill_it_stipends_from_mscit_list() from public, anon, authenticated;
revoke all on function public.sync_mscit_hiring_stipends(jsonb) from public, anon, authenticated;
grant execute on function public.fill_it_stipends_from_mscit_list() to service_role;
grant execute on function public.sync_mscit_hiring_stipends(jsonb) to service_role;
