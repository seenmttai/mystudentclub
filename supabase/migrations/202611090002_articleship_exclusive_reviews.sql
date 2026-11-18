-- Articleship portal: exclusive vacancies, firm-review summaries on cards, web-only banners.
-- Additive only: two new columns with defaults, two functions, grants. Old site code keeps working.
--
-- Reverse SQL (run in one transaction):
--   drop function if exists public.get_firm_review_summaries(text[]);
--   drop function if exists public.msc_firm_key(text);
--   alter table public."Banners" drop column if exists web_only;
--   alter table public."Articleship Jobs" drop column if exists is_exclusive;

-- 1. Exclusive articleship vacancies (pinned on top of the Articleship portal, free to apply).
alter table public."Articleship Jobs"
  add column if not exists is_exclusive boolean not null default false;
grant select (is_exclusive) on public."Articleship Jobs" to anon, authenticated;

-- 2. Banners that must not show inside the phone apps (mobile.mystudentclub.com), e.g. paid-program banners.
alter table public."Banners"
  add column if not exists web_only boolean not null default false;

-- 3. One key per firm, so a vacancy's company finds that firm's reviews even when it is spelled differently.
--    Big firm networks share one key with their ICAI member firms (S R Batliboi = EY, B S R = KPMG, ...).
--    Small firms: "K K & Co." = "K K and Company" = "K K & Co LLP, Chartered Accountants",
--    but "K K & Associates" stays a different firm.
create or replace function public.msc_firm_key(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  with s as (
    select regexp_replace(lower(coalesce(p_name, '')), '\s+', ' ', 'g') as n
  )
  select case
    when n ~ '\m(deloitte|haskins (and|&) sells)\M' then 'net:deloitte'
    when n ~ '\mkpmg\M|\mb ?s ?r (and|&) (co|associates)' then 'net:kpmg'
    when n ~ '\m(pwc|pricewaterhouse|price waterhouse|lovelock (and|&) lewes)' then 'net:pwc'
    when n ~ '\m(ey|ernst ?(and|&) ?young|s ?r ?b ?c ?(and|&) ?co|batliboi)\M' and n !~ 'purohit' then 'net:ey'
    when n ~ '\m(grant thornton|walker chandiok)' then 'net:gt'
    when n ~ '\m(bdo|mska|m s k a)\M' then 'net:bdo'
    when n ~ '\m(rsm|suresh surana)\M' and n !~ '\mvrsm\M|\mrsm (and|&) associates\M' then 'net:rsm'
    else nullif(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(n, '^m/s\.?\s*', ''),
              '\m(chartered accountants?|ca)\M|\([^)]*\)', ' ', 'g'),
            '\mand\M', '&', 'g'),
          '\mcompany\M', 'co', 'g'),
        '\m(llp|pvt|private|ltd|limited)\M|[^a-z0-9&]', '', 'g'),
      '')
  end
  from s
$$;

-- 4. Review summary per company name, for the cards on the Articleship portal.
--    Reads only the public review view the site already reads; returns counts, no review text.
create or replace function public.get_firm_review_summaries(p_names text[])
returns table (
  name text,
  firm_name text,
  review_count integer,
  avg_overall numeric,
  stipend_median integer,
  stipend_answers integer,
  stipend_on_time integer,
  stipend_delayed integer,
  leave_answers integer,
  leave_easy integer,
  leave_difficult integer
)
language sql
stable
set search_path = public
as $$
  with input as (
    select distinct btrim(u.nm) as nm
    from unnest(coalesce(p_names, '{}'::text[])) as u(nm)
    where coalesce(btrim(u.nm), '') <> ''
    limit 200
  ),
  keyed as (
    select nm, public.msc_firm_key(nm) as k from input
  ),
  rev as (
    select public.msc_firm_key(r.firm_name) as k, r.firm_name, r.overall_rating, r.stipend,
           r.stipend_on_time, r.personal_leave
    from public.articleship_firm_reviews_public r
    where public.msc_firm_key(r.firm_name) in (select k from keyed where k is not null)
  ),
  agg as (
    select k,
           mode() within group (order by firm_name) as firm_name,
           count(*)::integer as review_count,
           round(avg(overall_rating)::numeric, 1) as avg_overall,
           (percentile_disc(0.5) within group (order by stipend)
              filter (where stipend between 500 and 100000))::integer as stipend_median,
           count(*) filter (where stipend_on_time is not null)::integer as stipend_answers,
           count(*) filter (where stipend_on_time = 'always')::integer as stipend_on_time,
           count(*) filter (where stipend_on_time in ('sometimes_delayed', 'frequently_delayed'))::integer as stipend_delayed,
           count(*) filter (where personal_leave is not null)::integer as leave_answers,
           count(*) filter (where personal_leave = 'easy')::integer as leave_easy,
           count(*) filter (where personal_leave = 'difficult')::integer as leave_difficult
    from rev
    group by k
  )
  select keyed.nm, agg.firm_name, agg.review_count, agg.avg_overall, agg.stipend_median,
         agg.stipend_answers, agg.stipend_on_time, agg.stipend_delayed,
         agg.leave_answers, agg.leave_easy, agg.leave_difficult
  from keyed
  join agg using (k)
$$;

grant execute on function public.msc_firm_key(text) to anon, authenticated;
grant execute on function public.get_firm_review_summaries(text[]) to anon, authenticated;
