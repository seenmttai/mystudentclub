-- Offer groups: "help the next student" answers. 17 Nov 2026 (Aniket's ask).
--
-- Before a student's offer letter is checked (and so before the group links show), /offer-groups asks:
--   1. What were you asked in your interviews (this company and others)?  → offer_insights.interview_questions
--   2. HR contacts: forwarded as WhatsApp contact cards to the desk (81041 35784); the tap is recorded in
--      offer_insights.hr_shared_whatsapp. offer_hr_contacts holds typed contacts (p_hr), for the desk to fill later.
--   3. A tick: "I will share vacancies I hear of with MSC"               → offer_insights.vacancy_pledge
-- The team sends each HR contact a short intro from /admin-offer-groups → "HR contacts" and marks it sent.
--
-- Needs 202610310001_offer_groups.sql first (account_bans, is_super_admin()).
--
-- Reversible: yes. To undo, run:
--   drop function if exists public.offer_hr_phone(text), public.save_offer_insights(text, text, text, text, text, jsonb, boolean, boolean),
--     public.my_offer_insights(), public.admin_offer_insights(text, integer), public.admin_offer_hr_contacts(text, text, integer),
--     public.admin_offer_hr_mark(uuid, text);
--   drop table if exists public.offer_hr_contacts, public.offer_insights;
begin;

set local lock_timeout = '3s';

do $$
begin
  if to_regclass('public.account_bans') is null then
    raise exception 'offer insights: run 202610310001_offer_groups.sql first';
  end if;
end;
$$;

create table if not exists public.offer_insights (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  email               text,
  name                text,
  category            text,
  company             text,
  city                text,
  interview_questions text not null check (char_length(interview_questions) between 30 and 8000),
  vacancy_pledge      boolean not null default false,
  hr_shared_whatsapp  boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.offer_hr_contacts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  name          text,
  company       text,
  phone         text check (phone is null or phone ~ '^[0-9]{10,15}$'),
  email         text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  intro_status  text not null default 'new' check (intro_status in ('new', 'sent', 'skip')),
  intro_sent_at timestamptz,
  intro_sent_by uuid,
  created_at    timestamptz not null default now(),
  check (phone is not null or email is not null)
);
create index if not exists offer_hr_contacts_user_idx on public.offer_hr_contacts (user_id);
create index if not exists offer_hr_contacts_status_idx on public.offer_hr_contacts (intro_status, created_at desc);

-- Only the SECURITY DEFINER functions below touch these tables.
alter table public.offer_insights enable row level security;
alter table public.offer_hr_contacts enable row level security;
revoke all on public.offer_insights, public.offer_hr_contacts from anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.offer_insights, public.offer_hr_contacts to service_role;
  end if;
end;
$$;

-- An HR phone as WhatsApp digits: Indian numbers become 91XXXXXXXXXX (from 10 digits, 0XXXXXXXXXX or 91XXXXXXXXXX);
-- other countries need a leading + (11-15 digits). Anything else is null.
create or replace function public.offer_hr_phone(p text)
returns text language plpgsql immutable set search_path = public, pg_temp as $$
declare
  v_plus boolean := btrim(coalesce(p, '')) like '+%';
  v_d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if v_plus and left(v_d, 2) = '91' then v_plus := false; v_d := substr(v_d, 3); end if;
  if v_plus then return case when char_length(v_d) between 11 and 15 then v_d end; end if;
  if char_length(v_d) = 11 and left(v_d, 1) = '0' then v_d := substr(v_d, 2); end if;
  if char_length(v_d) = 12 and left(v_d, 2) = '91' then v_d := substr(v_d, 3); end if;
  return case when v_d ~ '^[6-9][0-9]{9}$' then '91' || v_d end;
end;
$$;

-- The student's answers. Called right before the letter goes to the offer-verify Worker, and again on a retry:
-- the answers are replaced, and HR contacts the team has not messaged yet are replaced; sent ones stay.
-- p_hr: [{ name, company, phone, email }], at most 10; rows with neither a phone nor an email are dropped.
create or replace function public.save_offer_insights(p_name text, p_category text, p_company text, p_city text,
                                                      p_interview text, p_hr jsonb, p_pledge boolean,
                                                      p_hr_whatsapp boolean default false)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_interview text := btrim(coalesce(p_interview, ''));
  v_hr jsonb := coalesce(p_hr, '[]'::jsonb);
  v_item jsonb;
  v_phone text;
  v_mail text;
  v_saved integer := 0;
begin
  if v_uid is null then raise exception 'Please sign in again' using errcode = '42501'; end if;
  if exists (select 1 from public.account_bans b where b.user_id = v_uid and b.lifted_at is null) then
    raise exception 'This account cannot share an offer letter' using errcode = '42501';
  end if;
  if char_length(v_interview) < 30 then raise exception 'Please write a little more about your interview questions'; end if;
  if char_length(v_interview) > 8000 then raise exception 'Your interview answer is too long (8,000 characters at most)'; end if;
  if jsonb_typeof(v_hr) <> 'array' then raise exception 'Up to 10 HR contacts, please'; end if;
  if jsonb_array_length(v_hr) > 10 then raise exception 'Up to 10 HR contacts, please'; end if;
  if not coalesce(p_pledge, false) then raise exception 'Please tick the box about sharing vacancies'; end if;

  select u.email into v_email from auth.users u where u.id = v_uid;

  insert into public.offer_insights as i (user_id, email, name, category, company, city, interview_questions, vacancy_pledge, hr_shared_whatsapp)
  values (v_uid, v_email,
          nullif(left(btrim(coalesce(p_name, '')), 100), ''),
          left(btrim(p_category), 40), left(btrim(p_company), 120), left(btrim(p_city), 80), v_interview, true, coalesce(p_hr_whatsapp, false))
  on conflict (user_id) do update set
    email = excluded.email, name = excluded.name, category = excluded.category, company = excluded.company, city = excluded.city,
    interview_questions = excluded.interview_questions, vacancy_pledge = true,
    hr_shared_whatsapp = i.hr_shared_whatsapp or excluded.hr_shared_whatsapp, updated_at = now();

  delete from public.offer_hr_contacts where user_id = v_uid and intro_status = 'new';
  for v_item in select value from jsonb_array_elements(v_hr) loop
    if jsonb_typeof(v_item) <> 'object' then continue; end if;
    v_phone := public.offer_hr_phone(v_item->>'phone');
    v_mail := nullif(lower(btrim(coalesce(v_item->>'email', ''))), '');
    if v_mail is not null and v_mail !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then v_mail := null; end if;
    if v_phone is null and v_mail is null then continue; end if;
    -- The same HR shared again by this student, or already messaged: keep one row.
    if exists (select 1 from public.offer_hr_contacts h where h.user_id = v_uid
                and ((v_phone is not null and h.phone = v_phone) or (v_mail is not null and h.email = v_mail))) then continue; end if;
    insert into public.offer_hr_contacts (user_id, name, company, phone, email)
    values (v_uid, nullif(left(btrim(coalesce(v_item->>'name', '')), 100), ''),
            coalesce(nullif(left(btrim(coalesce(v_item->>'company', '')), 120), ''), left(btrim(p_company), 120)), v_phone, v_mail);
    v_saved := v_saved + 1;
  end loop;

  return jsonb_build_object('ok', true, 'hr_saved', v_saved);
end;
$$;

-- The student's own earlier answers, to fill the form again after a rejected letter.
create or replace function public.my_offer_insights()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select case when auth.uid() is null then null else (
    select jsonb_build_object(
      'interview_questions', i.interview_questions,
      'vacancy_pledge', i.vacancy_pledge,
      'hr_shared_whatsapp', i.hr_shared_whatsapp,
      'hr', coalesce((select jsonb_agg(jsonb_build_object('name', h.name, 'company', h.company, 'phone', h.phone, 'email', h.email) order by h.created_at)
                      from public.offer_hr_contacts h where h.user_id = i.user_id), '[]'::jsonb))
    from public.offer_insights i where i.user_id = auth.uid()) end;
$$;

-- Admin: interview answers, newest first. p_search matches company, city, name, email or the answer itself.
create or replace function public.admin_offer_insights(p_search text default null, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only super admins can do this' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.updated_at desc) from (
      select i.user_id, i.email, i.name, i.category, i.company, i.city, i.interview_questions, i.vacancy_pledge,
             i.hr_shared_whatsapp, i.created_at, i.updated_at,
             (select c.status from public.offer_claims c where c.user_id = i.user_id order by (c.status in ('verified', 'review')) desc, c.created_at desc limit 1) as claim_status,
             (select count(*) from public.offer_hr_contacts h where h.user_id = i.user_id) as hr_count
      from public.offer_insights i
      where v_q is null or i.company ilike '%' || v_q || '%' or i.city ilike '%' || v_q || '%' or i.name ilike '%' || v_q || '%'
            or i.email ilike '%' || v_q || '%' or i.interview_questions ilike '%' || v_q || '%'
      order by i.updated_at desc
      limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    ) x), '[]'::jsonb);
end;
$$;

-- Admin: HR contacts. p_status 'new' (default), 'sent', 'skip' or 'all'.
create or replace function public.admin_offer_hr_contacts(p_status text default 'new', p_search text default null, p_limit integer default 300)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_q text := nullif(btrim(coalesce(p_search, '')), '');
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only super admins can do this' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row_to_json(x)::jsonb order by x.created_at desc) from (
      select h.id, h.name, h.company, h.phone, h.email, h.intro_status, h.intro_sent_at, h.created_at,
             i.name as student_name, i.email as student_email, i.city,
             (select count(*) from public.offer_hr_contacts o where o.id <> h.id
               and ((h.phone is not null and o.phone = h.phone) or (h.email is not null and o.email = h.email))) as shared_by_others,
             exists (select 1 from public.offer_hr_contacts o where o.id <> h.id and o.intro_status = 'sent'
               and ((h.phone is not null and o.phone = h.phone) or (h.email is not null and o.email = h.email))) as already_messaged
      from public.offer_hr_contacts h
      left join public.offer_insights i on i.user_id = h.user_id
      where (coalesce(p_status, 'new') = 'all' or h.intro_status = coalesce(p_status, 'new'))
        and (v_q is null or h.company ilike '%' || v_q || '%' or h.name ilike '%' || v_q || '%'
             or h.phone ilike '%' || v_q || '%' or h.email ilike '%' || v_q || '%')
      order by h.created_at desc
      limit least(greatest(coalesce(p_limit, 300), 1), 1000)
    ) x), '[]'::jsonb);
end;
$$;

create or replace function public.admin_offer_hr_mark(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not coalesce(public.is_super_admin(), false) then raise exception 'Only super admins can do this' using errcode = '42501'; end if;
  if p_status not in ('new', 'sent', 'skip') then raise exception 'Unknown status %', p_status; end if;
  update public.offer_hr_contacts
     set intro_status = p_status,
         intro_sent_at = case when p_status = 'sent' then now() else null end,
         intro_sent_by = case when p_status = 'sent' then auth.uid() else null end
   where id = p_id;
end;
$$;

revoke all on function public.save_offer_insights(text, text, text, text, text, jsonb, boolean, boolean), public.my_offer_insights(),
  public.admin_offer_insights(text, integer), public.admin_offer_hr_contacts(text, text, integer),
  public.admin_offer_hr_mark(uuid, text) from public, anon;
grant execute on function public.save_offer_insights(text, text, text, text, text, jsonb, boolean, boolean), public.my_offer_insights(),
  public.admin_offer_insights(text, integer), public.admin_offer_hr_contacts(text, text, integer),
  public.admin_offer_hr_mark(uuid, text) to authenticated;

commit;
