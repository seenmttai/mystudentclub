-- Vacancy duplicate guard (6 Nov 2026, Padam: "duplicates get a solution so it doesnt repeat in future").
--
-- A scraped vacancy (posts_link set) whose source job was already saved in the last 60 days, in ANY of the
-- four job tables, is skipped at insert time (the insert affects 0 rows; no error is raised, so no writer
-- breaks). This stops duplicates from every writer: the cloud/Mac job poster, the old poster still running
-- on another machine, reruns and overlapping schedules.
--
-- Team-posted vacancies (posts_link is null: hire.msc, admin, Codex vacancy run) are never touched.
-- Undo: drop the four triggers (see the bottom of this file).

create or replace function public.msc_vacancy_key(link text)
returns text
language sql
immutable
parallel safe
as $$
  select case
    when link is null or btrim(link) = '' then null
    -- LinkedIn job listing: the numeric job id, whatever the slug or tracking codes
    when link ~* 'linkedin\.com/jobs/view/' then 'li-job:' || substring(link from '(?:-|/view/)(\d{8,})')
    when link ~* '[?&]currentJobId=\d{8,}' then 'li-job:' || substring(link from 'currentJobId=(\d{8,})')
    -- LinkedIn post: activity / share / ugcPost id
    when link ~* 'urn:li:(activity|ugcPost|share):\d{8,}' then 'li-post:' || substring(link from 'urn:li:(?:activity|ugcPost|share):(\d{8,})')
    when link ~* 'linkedin\.com/posts/.*(activity|share|ugcpost)-\d{8,}' then 'li-post:' || substring(link from '(?:activity|share|ugcpost)-(\d{8,})')
    -- LinkedIn short link
    when link ~* 'lnkd\.in/' then 'lnkd:' || substring(link from 'lnkd\.in/((?:p/)?[A-Za-z0-9_-]{4,})')
    -- Naukri job id
    when link ~* 'naukri\.com/job-listings-' then 'naukri:' || substring(link from '(\d{9,})(?:[/?#]|$)')
    -- Any other page: host + path, without scheme, www., query string or trailing slash
    else 'url:' || lower(regexp_replace(regexp_replace(split_part(split_part(btrim(link), '#', 1), '?', 1),
                                                       '^https?://(www\.|m\.|in\.)?', ''), '/+$', ''))
  end
$$;

-- Fast lookups: one expression index per table.
create index if not exists industrial_training_vacancy_key_idx
  on public."Industrial Training Job Portal" (public.msc_vacancy_key(posts_link)) where posts_link is not null;
create index if not exists fresher_jobs_vacancy_key_idx
  on public."Fresher Jobs" (public.msc_vacancy_key(posts_link)) where posts_link is not null;
create index if not exists semi_qualified_jobs_vacancy_key_idx
  on public."Semi Qualified Jobs" (public.msc_vacancy_key(posts_link)) where posts_link is not null;
create index if not exists articleship_jobs_vacancy_key_idx
  on public."Articleship Jobs" (public.msc_vacancy_key(posts_link)) where posts_link is not null;

create or replace function public.msc_block_duplicate_vacancy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  t text;
  dup boolean;
begin
  if new.posts_link is null or btrim(new.posts_link) = '' then
    return new;                                   -- team-posted vacancy: never blocked
  end if;
  k := public.msc_vacancy_key(new.posts_link);
  if k is null or k like 'li-job:' or k like 'lnkd:' or k like 'naukri:' or (k like 'url:%' and length(k) < 16) then
    return new;                                   -- no usable key: let the app's own checks decide
  end if;
  foreach t in array array['Industrial Training Job Portal', 'Fresher Jobs', 'Semi Qualified Jobs', 'Articleship Jobs'] loop
    execute format(
      'select exists (select 1 from public.%I where posts_link is not null and public.msc_vacancy_key(posts_link) = $1 '
      'and "Created_At" >= now() - interval ''60 days'')', t)
      into dup using k;
    if dup then
      return null;                                -- duplicate: skip this insert quietly
    end if;
  end loop;
  return new;
end
$$;

drop trigger if exists msc_block_duplicate_vacancy on public."Industrial Training Job Portal";
create trigger msc_block_duplicate_vacancy before insert on public."Industrial Training Job Portal"
  for each row execute function public.msc_block_duplicate_vacancy();
drop trigger if exists msc_block_duplicate_vacancy on public."Fresher Jobs";
create trigger msc_block_duplicate_vacancy before insert on public."Fresher Jobs"
  for each row execute function public.msc_block_duplicate_vacancy();
drop trigger if exists msc_block_duplicate_vacancy on public."Semi Qualified Jobs";
create trigger msc_block_duplicate_vacancy before insert on public."Semi Qualified Jobs"
  for each row execute function public.msc_block_duplicate_vacancy();
drop trigger if exists msc_block_duplicate_vacancy on public."Articleship Jobs";
create trigger msc_block_duplicate_vacancy before insert on public."Articleship Jobs"
  for each row execute function public.msc_block_duplicate_vacancy();

-- Undo:
--   drop trigger if exists msc_block_duplicate_vacancy on public."Industrial Training Job Portal";
--   drop trigger if exists msc_block_duplicate_vacancy on public."Fresher Jobs";
--   drop trigger if exists msc_block_duplicate_vacancy on public."Semi Qualified Jobs";
--   drop trigger if exists msc_block_duplicate_vacancy on public."Articleship Jobs";
--   drop function if exists public.msc_block_duplicate_vacancy();
--   (the msc_vacancy_key function and indexes are harmless to keep)
