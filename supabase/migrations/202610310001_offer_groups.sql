-- Offer letter → WhatsApp groups (/offer-groups, /admin-offer-groups and the offer-verify Worker). 31 Oct 2026.
--
-- What it does:
--   1. offer_groups   WhatsApp group invite links per category × company × city. Admins manage them; students
--                     never read this table, they only get the links of their own verified claim.
--   2. offer_claims   One row per offer-letter attempt. At most one claim per account can be verified or in review
--                     ("you can do this only once"); rejected attempts stay as an audit trail and count toward the
--                     daily limit. Only the Worker (service_role) writes it.
--   3. account_bans   Who was banned for a fake letter, why, and by whom. Banning also sets auth.users.banned_until,
--                     which stops sign-in and token refresh on the site, the app and hire.msc.
--   4. offer_company_key() / offer_city_key(): the matching keys. offer_company_key() follows msc-mail's
--      wagroups.js companyKey(), so "Deloitte Haskins & Sells LLP" and "deloitte haskins and sells" match.
--   5. my_offer_status(): what /offer-groups shows the signed-in student.
--   6. offer_groups_for(): the links for one category/company/city (service_role; the Worker calls it).
--   7. Admin RPCs, gated by the existing public.is_super_admin(): groups, review queue, ban/unban, missing groups.
--   8. Storage: super admins may read the existing private offer-letters bucket, to open letters in the review queue.
--
-- Reversible: yes. To undo, run:
--   drop function if exists public.my_offer_status(), public.offer_groups_for(text,text,text),
--     public.admin_offer_groups(), public.admin_offer_group_save(uuid,text,text,text,text,text,boolean),
--     public.admin_offer_group_delete(uuid), public.admin_offer_claims(text,text,integer),
--     public.admin_offer_claim_decide(uuid,text,text), public.admin_offer_ban(uuid,text), public.admin_offer_unban(uuid),
--     public.admin_offer_missing_groups(), public.offer_keys_trigger(), public.offer_company_key(text),
--     public.offer_city_key(text), public.offer_placement_from_claim(uuid);
--   drop table if exists public.offer_claims, public.offer_groups, public.account_bans;
--   drop policy if exists offer_letters_super_admin_read on storage.objects;
--   update auth.users set banned_until = null where id in (<ids from account_bans, if any were banned>);
-- Letters already uploaded stay in the offer-letters bucket.
begin;

set local lock_timeout = '3s';

-- Abort with a readable error before any DDL if the live schema is not what this file expects.
do $$
begin
  if to_regprocedure('public.is_super_admin()') is null then
    raise exception 'offer groups: public.is_super_admin() is missing (the admin page uses it)';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'banned_until') then
    raise exception 'offer groups: auth.users.banned_until is missing';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Keys
-- ---------------------------------------------------------------------------

-- "Deloitte Haskins & Sells LLP" → "deloitte-haskins-and-sells" (same rules as msc-mail wagroups.js companyKey).
create or replace function public.offer_company_key(p text)
returns text language plpgsql immutable set search_path = pg_catalog, pg_temp as $$
declare
  s text := lower(coalesce(p, ''));
  suffix constant text := '\s+(private\s+limited|pvt\s*ltd|pvt\s+limited|private\s+ltd|limited|ltd|llp|inc|incorporated|plc|and\s+co|co)$';
begin
  s := replace(s, '&', ' and ');
  s := btrim(regexp_replace(s, '[^a-z0-9]+', ' ', 'g'));
  for i in 1..3 loop
    exit when s !~ suffix;
    s := btrim(regexp_replace(s, suffix, ''));
  end loop;
  s := regexp_replace(s, '\s+', '-', 'g');
  return rtrim(left(s, 60), '-');
end;
$$;

-- "Gurugram" → "gurgaon", "Bengaluru" → "bangalore", "New Delhi" → "delhi".
create or replace function public.offer_city_key(p text)
returns text language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case k
    when 'bengaluru' then 'bangalore' when 'banglore' then 'bangalore' when 'bengalore' then 'bangalore'
    when 'gurugram' then 'gurgaon' when 'bombay' then 'mumbai' when 'new-delhi' then 'delhi'
    when 'calcutta' then 'kolkata' when 'madras' then 'chennai' when 'mysuru' then 'mysore'
    when 'greater-noida' then 'noida' when 'baroda' then 'vadodara' when 'poona' then 'pune'
    when 'trivandrum' then 'thiruvananthapuram' when 'cochin' then 'kochi' when 'gift-city' then 'gandhinagar'
    else k end
  from (select regexp_replace(btrim(regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', ' ', 'g')), '\s+', '-', 'g') as k) x;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.offer_groups (
  id          uuid primary key default gen_random_uuid(),
  category    text not null check (category in ('all', 'articleship', 'industrial-training', 'ca-fresher', 'semi-qualified')),
  company     text check (company is null or length(btrim(company)) between 2 and 80),
  company_key text,
  city        text check (city is null or length(btrim(city)) between 2 and 60),
  city_key    text,
  title       text not null check (length(btrim(title)) between 2 and 80),
  url         text not null check (url ~ '^https://(chat\.whatsapp\.com/[A-Za-z0-9]{10,40}|(www\.)?whatsapp\.com/channel/[A-Za-z0-9]{10,40})/?(\?[A-Za-z0-9_=&.-]*)?$'),
  active      boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists offer_groups_match_idx on public.offer_groups (category, company_key, city_key) where active;

create table if not exists public.offer_claims (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  email          text,
  name           text not null,
  category       text not null check (category in ('articleship', 'industrial-training', 'ca-fresher', 'semi-qualified')),
  company        text not null,
  company_key    text,
  city           text not null,
  city_key       text,
  domain         text,
  joining_date   date not null,
  status         text not null check (status in ('verified', 'review', 'rejected', 'revoked')),
  reasons        text[] not null default '{}',
  notes          text[] not null default '{}',
  ai             jsonb,
  file_path      text,
  file_sha256    text,
  file_name      text,
  page_paths     text[] not null default '{}',
  placement_id   uuid,
  reviewed_by    uuid,
  reviewed_at    timestamptz,
  review_note    text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
-- "You can do this only once": one verified-or-in-review claim per account. Rejected attempts don't count.
create unique index if not exists offer_claims_one_active on public.offer_claims (user_id) where status in ('verified', 'review');
create index if not exists offer_claims_user_idx on public.offer_claims (user_id, created_at desc);
create index if not exists offer_claims_sha_idx on public.offer_claims (file_sha256) where file_sha256 is not null;
create index if not exists offer_claims_status_idx on public.offer_claims (status, created_at desc);

create table if not exists public.account_bans (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text,
  reason     text not null,
  claim_id   uuid references public.offer_claims (id) on delete set null,
  banned_by  uuid,
  banned_at  timestamptz not null default now(),
  lifted_at  timestamptz,
  lifted_by  uuid
);

create or replace function public.offer_keys_trigger()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.company := nullif(btrim(new.company), '');
  new.city := nullif(btrim(new.city), '');
  new.company_key := nullif(public.offer_company_key(new.company), '');
  new.city_key := nullif(public.offer_city_key(new.city), '');
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists offer_groups_keys on public.offer_groups;
create trigger offer_groups_keys before insert or update on public.offer_groups for each row execute function public.offer_keys_trigger();
drop trigger if exists offer_claims_keys on public.offer_claims;
create trigger offer_claims_keys before insert or update on public.offer_claims for each row execute function public.offer_keys_trigger();

-- Nobody but service_role and the SECURITY DEFINER functions below touches these tables.
alter table public.offer_groups enable row level security;
alter table public.offer_claims enable row level security;
alter table public.account_bans enable row level security;
revoke all on public.offer_groups, public.offer_claims, public.account_bans from anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update on public.offer_groups, public.offer_claims, public.account_bans to service_role;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Links for a claim, and the student's own status
-- ---------------------------------------------------------------------------

-- Most specific first: company in this city, company anywhere, this city, then the general group(s).
create or replace function public.offer_groups_for(p_category text, p_company_key text, p_city_key text)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'kind', g.kind, 'title', g.title, 'url', g.url,
                                               'company', g.company, 'city', g.city) order by g.rank, g.title), '[]'::jsonb)
  from (
    select og.*,
      case when og.company_key is not null and og.city_key is not null then 'company_city'
           when og.company_key is not null then 'company'
           when og.city_key is not null then 'city' else 'general' end as kind,
      case when og.company_key is not null and og.city_key is not null then 1
           when og.company_key is not null then 2
           when og.city_key is not null then 3 else 4 end
        + case when og.category = 'all' then 0.5 else 0 end as rank
    from public.offer_groups og
    where og.active
      and og.category in (p_category, 'all')
      and (og.company_key is null or og.company_key = p_company_key)
      and (og.city_key is null or og.city_key = p_city_key)
  ) g;
$$;
revoke all on function public.offer_groups_for(text, text, text) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.offer_groups_for(text, text, text) to service_role;
  end if;
end;
$$;

create or replace function public.my_offer_status()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_claim public.offer_claims;
  v_banned boolean;
  v_today integer;
  v_total integer;
  v_groups jsonb := '[]'::jsonb;
  v_has_company_group boolean := false;
begin
  if v_uid is null then
    return jsonb_build_object('signed_in', false);
  end if;
  v_banned := exists (select 1 from public.account_bans b where b.user_id = v_uid and b.lifted_at is null);
  select * into v_claim from public.offer_claims c
   where c.user_id = v_uid and c.status in ('verified', 'review', 'revoked')
   order by (c.status <> 'revoked') desc, c.created_at desc limit 1;
  select count(*) filter (where c.created_at > now() - interval '24 hours'), count(*)
    into v_today, v_total
    from public.offer_claims c where c.user_id = v_uid and c.status = 'rejected';
  if v_claim.id is not null and v_claim.status = 'verified' and not v_banned then
    v_groups := public.offer_groups_for(v_claim.category, v_claim.company_key, v_claim.city_key);
    v_has_company_group := exists (select 1 from jsonb_array_elements(v_groups) e where e->>'kind' in ('company_city', 'company'));
  end if;
  return jsonb_build_object(
    'signed_in', true,
    'banned', v_banned,
    'claim', case when v_claim.id is null then null else jsonb_build_object(
      'status', v_claim.status, 'name', v_claim.name, 'category', v_claim.category, 'company', v_claim.company,
      'city', v_claim.city, 'domain', v_claim.domain, 'joining_date', v_claim.joining_date,
      'reasons', to_jsonb(v_claim.reasons), 'created_at', v_claim.created_at) end,
    'groups', v_groups,
    'has_company_group', v_has_company_group,
    'rejected_today', v_today,
    'rejected_total', v_total
  );
end;
$$;
revoke all on function public.my_offer_status() from public, anon;
grant execute on function public.my_offer_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Admin (super admins only)
-- ---------------------------------------------------------------------------

create or replace function public.admin_offer_groups()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only super admins can do this' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', g.id, 'category', g.category, 'company', g.company, 'city', g.city,
      'title', g.title, 'url', g.url, 'active', g.active, 'updated_at', g.updated_at,
      'members', (select count(*) from public.offer_claims c where c.status = 'verified'
                    and g.category in (c.category, 'all')
                    and (g.company_key is null or g.company_key = c.company_key)
                    and (g.city_key is null or g.city_key = c.city_key)))
      order by g.active desc, g.category, g.company nulls first, g.city nulls first, g.title)
    from public.offer_groups g), '[]'::jsonb);
end;
$$;

create or replace function public.admin_offer_group_save(p_id uuid, p_category text, p_company text, p_city text,
                                                         p_title text, p_url text, p_active boolean default true)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only super admins can do this' using errcode = '42501'; end if;
  if p_id is null then
    insert into public.offer_groups (category, company, city, title, url, active, created_by)
    values (p_category, p_company, p_city, btrim(p_title), btrim(p_url), coalesce(p_active, true), auth.uid())
    returning id into v_id;
  else
    update public.offer_groups set category = p_category, company = p_company, city = p_city, title = btrim(p_title),
      url = btrim(p_url), active = coalesce(p_active, true)
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'That group no longer exists'; end if;
  end if;
  return v_id;
end;
$$;

create or replace function public.admin_offer_group_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only super admins can do this' using errcode = '42501'; end if;
  delete from public.offer_groups where id = p_id;
end;
$$;

-- p_status: 'review' (default), 'verified', 'rejected', 'revoked' or 'all'. p_search matches email, name, company, city.
create or replace function public.admin_offer_claims(p_status text default 'review', p_search text default null, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only super admins can do this' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc) from (
      select c.id, c.user_id, c.email, c.name, c.category, c.company, c.city, c.domain, c.joining_date, c.status,
             c.reasons, c.notes, c.ai, c.file_path, c.file_name, c.page_paths, c.review_note, c.reviewed_at, c.created_at,
             exists (select 1 from public.account_bans b where b.user_id = c.user_id and b.lifted_at is null) as banned,
             (select count(*) from public.offer_claims o where o.user_id = c.user_id) as attempts
      from public.offer_claims c
      where (coalesce(p_status, 'review') = 'all' or c.status = coalesce(p_status, 'review'))
        and (v_q is null or c.email ilike '%' || v_q || '%' or c.name ilike '%' || v_q || '%'
             or c.company ilike '%' || v_q || '%' or c.city ilike '%' || v_q || '%')
      order by c.created_at desc
      limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    ) x), '[]'::jsonb);
end;
$$;

-- Writes the msc-mail placements row for a verified claim (alumni list, congratulations drip). Skipped quietly when
-- the placements table is not there, and never twice for one claim.
create or replace function public.offer_placement_from_claim(p_claim_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.offer_claims;
  v_id uuid;
begin
  select * into c from public.offer_claims where id = p_claim_id;
  if c.id is null or c.status <> 'verified' then return null; end if;
  if c.placement_id is not null then return c.placement_id; end if;
  if to_regclass('public.placements') is null or c.email is null then return null; end if;
  execute 'insert into public.placements (user_id, email, name, company, role, location, joining_date, status,
             offer_letter_path, program, source, verified)
           values ($1, $2, $3, $4, $5, $6, $7, ''offer'', $8, $9, ''offer-groups'', true) returning id'
    into v_id
    using c.user_id, c.email, c.name, c.company, nullif(c.ai->>'designation', ''), c.city, c.joining_date, c.file_path,
          case when c.category in ('articleship', 'industrial-training', 'ca-fresher') then c.category end;
  update public.offer_claims set placement_id = v_id where id = c.id;
  return v_id;
end;
$$;
revoke all on function public.offer_placement_from_claim(uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.offer_placement_from_claim(uuid) to service_role;
  end if;
end;
$$;

-- approve: review → verified (also writes the placement). reject: review → rejected (they may try again).
-- revoke: verified → revoked (links disappear from their page; they may not try again until an admin rejects it).
create or replace function public.admin_offer_claim_decide(p_id uuid, p_decision text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.offer_claims;
  v_next text;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only super admins can do this' using errcode = '42501'; end if;
  select * into c from public.offer_claims where id = p_id for update;
  if c.id is null then raise exception 'That claim no longer exists'; end if;
  v_next := case
    when p_decision = 'approve' and c.status in ('review', 'rejected', 'revoked') then 'verified'
    when p_decision = 'reject' and c.status in ('review', 'verified', 'revoked') then 'rejected'
    when p_decision = 'revoke' and c.status = 'verified' then 'revoked'
  end;
  if v_next is null then raise exception 'Cannot % a claim that is %', p_decision, c.status; end if;
  if v_next = 'verified' and exists (select 1 from public.offer_claims o where o.user_id = c.user_id and o.id <> c.id and o.status in ('verified', 'review')) then
    raise exception 'This student already has another verified or pending claim';
  end if;
  update public.offer_claims set status = v_next, reviewed_by = auth.uid(), reviewed_at = now(),
    review_note = nullif(btrim(coalesce(p_note, '')), '') where id = c.id;
  if v_next = 'verified' then perform public.offer_placement_from_claim(c.id); end if;
  return jsonb_build_object('id', c.id, 'status', v_next);
end;
$$;

-- Permanent ban for a fake or someone else's letter: records it, revokes the claim, and sets Supabase Auth's
-- banned_until 100 years ahead (Auth then refuses sign-in and token refresh everywhere).
create or replace function public.admin_offer_ban(p_claim_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare
  c public.offer_claims;
  v_auth boolean := true;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only super admins can do this' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Write the reason for the ban'; end if;
  select * into c from public.offer_claims where id = p_claim_id for update;
  if c.id is null then raise exception 'That claim no longer exists'; end if;
  if c.user_id = auth.uid() then raise exception 'You cannot ban your own account'; end if;
  insert into public.account_bans (user_id, email, reason, claim_id, banned_by)
  values (c.user_id, c.email, btrim(p_reason), c.id, auth.uid())
  on conflict (user_id) do update set reason = excluded.reason, claim_id = excluded.claim_id, banned_by = excluded.banned_by,
    banned_at = now(), lifted_at = null, lifted_by = null;
  update public.offer_claims set status = case when status in ('verified', 'review') then 'revoked' else status end,
    reviewed_by = auth.uid(), reviewed_at = now(), review_note = 'Banned: ' || btrim(p_reason)
  where user_id = c.user_id and status in ('verified', 'review');
  begin
    update auth.users set banned_until = now() + interval '100 years' where id = c.user_id;
  exception when others then
    v_auth := false;
    raise warning 'offer groups: could not set auth.users.banned_until for %: %', c.user_id, sqlerrm;
  end;
  return jsonb_build_object('user_id', c.user_id, 'auth_banned', v_auth);
end;
$$;

create or replace function public.admin_offer_unban(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth, pg_temp as $$
declare v_auth boolean := true;
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only super admins can do this' using errcode = '42501'; end if;
  update public.account_bans set lifted_at = now(), lifted_by = auth.uid() where user_id = p_user_id and lifted_at is null;
  begin
    update auth.users set banned_until = null where id = p_user_id;
  exception when others then
    v_auth := false;
    raise warning 'offer groups: could not clear auth.users.banned_until for %: %', p_user_id, sqlerrm;
  end;
  return jsonb_build_object('user_id', p_user_id, 'auth_unbanned', v_auth);
end;
$$;

-- Verified students whose company has no group yet (neither company+city nor company-wide), busiest first.
create or replace function public.admin_offer_missing_groups()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only super admins can do this' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.students desc, x.latest desc) from (
      select c.category, min(c.company) as company, min(c.city) as city, count(*) as students, max(c.created_at) as latest
      from public.offer_claims c
      where c.status = 'verified'
        and not exists (select 1 from public.account_bans b where b.user_id = c.user_id and b.lifted_at is null)
        and not exists (select 1 from public.offer_groups g where g.active and g.company_key = c.company_key
                          and g.category in (c.category, 'all') and (g.city_key is null or g.city_key = c.city_key))
      group by c.category, c.company_key, c.city_key
    ) x), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_offer_groups(), public.admin_offer_group_save(uuid, text, text, text, text, text, boolean),
  public.admin_offer_group_delete(uuid), public.admin_offer_claims(text, text, integer),
  public.admin_offer_claim_decide(uuid, text, text), public.admin_offer_ban(uuid, text), public.admin_offer_unban(uuid),
  public.admin_offer_missing_groups() from public, anon;
grant execute on function public.admin_offer_groups(), public.admin_offer_group_save(uuid, text, text, text, text, text, boolean),
  public.admin_offer_group_delete(uuid), public.admin_offer_claims(text, text, integer),
  public.admin_offer_claim_decide(uuid, text, text), public.admin_offer_ban(uuid, text), public.admin_offer_unban(uuid),
  public.admin_offer_missing_groups() to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: super admins may open letters in the review queue (signed URLs). Writes stay service_role only.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists offer_letters_super_admin_read on storage.objects';
    execute 'create policy offer_letters_super_admin_read on storage.objects for select to authenticated
             using (bucket_id = ''offer-letters'' and public.is_super_admin())';
  end if;
end;
$$;

commit;
